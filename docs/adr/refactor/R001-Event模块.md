# R001 Event 模块：Kind / HookPoint / scope / 历史 / 所有者执行权

- **状态**：设计已定；实现待做
- **目标落地位置**：`src/mvp/event/`
- **旧语义来源**：`../0001-事件系统.md`

## 背景

ADR-0001 已验证 before/content/after、严格栈、父子因果、历史时间戳、clear 与随局 hook 的规则价值；
旧实现的问题主要在外部形态：`GameEvent` 依赖万能 `Game`，`TriggerSystem` / EventStack / history 分散，
所有业务事件集中在 `events/types.ts`，而公开 `new GameEvent(...).execute(...)` 允许先构造后执行，只能靠
运行时检查阻止错误因果。

新 Event 模块保留已验证的规则语义，但改成一个每局创建的粗模块实例 `Events`。它统一拥有 scope、
hook 注册、事件栈与历史；不认识 Player、Card、UC、Effect 或任何业务事件字典。

## 决策

### 1. Kind 是行为的名义身份

`EventKind` 对应一种稳定的行为协议，不等于一份 data schema。两个行为即使 data 形状相同，也必须有
不同 Kind；一次具体发生由 `event.id` 标识，data 只是该次行为的输入与可修改状态。

```ts
interface EventKind<Name extends string, Data> {
  readonly name: Name;
  readonly before: EventHookPoint<this, 'before'>;
  readonly after: EventHookPoint<this, 'after'>;
  // 实现以私有 symbol 保存 Kind → Data 的类型关联；运行时无业务含义。
}

type DataOf<K extends AnyEventKind> = /* 从 K 取关联 Data */;

interface Event<K extends AnyEventKind> {
  readonly kind: K;
  readonly data: DataOf<K>;
}
```

Kind 是冻结的对象令牌，运行时用对象身份比较；`name` 只用于日志、报错、调试和未来序列化。第一版
没有全局或随局 Kind 注册表，也不按名称动态查找 Kind。

业务模块拥有自己的 Kind 与事件数据：

```ts
interface CardMoveData { /* Card 模块词汇 */ }

const CardMoveEvent = defineEvent('card.move').withData<CardMoveData>();
export const CardMove = CardMoveEvent.kind;
```

### 2. Kind 对应行为，但不存放业务 content

Event 模块不知道业务行为。`defineEvent` 返回“公开观察令牌 + 所有者发起能力”；业务模块只导出 Kind，
把可执行句柄留在模块内部，并通过自己的行为入口固定 Kind 与 content 的结合：

```ts
const CardMoveEvent = defineEvent('card.move').withData<CardMoveData>();
export const CardMove = CardMoveEvent.kind;

export async function moveCards(cards: Cards, input: MoveCardsInput) {
  const data = prepareMove(cards, input);
  return CardMoveEvent.run(cards.events, data, async event => {
    validateMove(cards, event.data);
    commitMove(cards, event.data);
  });
}
```

外部可以订阅 `CardMove` 或查询历史，但不能执行 `events.run(CardMove, data, arbitraryContent)` 伪造一次
没有移动牌的 CardMove。Kind 与行为是语义上一一对应，不要求把单个闭包静态存进 Kind；Turn 的
phase plan、UseCard 的具体 UC 内容等变化必须由行为所有者定义的输入协议承载。

底层压栈执行能力不出现在 `Events` 的普通消费接口中；`OwnedEvent.run` 通过 Event 模块内部能力调用它。
这只区分观察权与发起权，不引入 definition/runtime/manager 三层模块。

### 3. HookPoint 是 Kind 上的派生地址

`EventHookPoint` 不是回调函数，也不是新的身份源；它只是 `Kind + timing`：

```ts
type EventTiming = 'before' | 'after';

interface EventHookPoint<
  K extends AnyEventKind,
  T extends EventTiming,
> {
  readonly kind: K;
  readonly timing: T;
}

type EventHandler<K extends AnyEventKind> =
  (event: Event<K>) => void | Promise<void>;
```

`CardMove.before` / `CardMove.after` 是 `defineEvent` 创建的冻结地址。订阅存在每局 `Events` 实例中，
内部按 Kind 和 timing 找 handler 列表；HookPoint 自身不保存 handler 或局内状态。

```ts
interface Events {
  on<K extends AnyEventKind, T extends EventTiming>(
    point: EventHookPoint<K, T>,
    handler: EventHandler<K>,
  ): () => void;
}
```

`on` 返回精确 disposer，供 Effect / Skill / 联结模块同步生命周期。Event 只按低层注册顺序串行 await
handler；触发效果的座次、强制先行与同角色选择由 Effect dispatcher 负责，Event 不认识这些规则。

### 4. Events 是随局的粗模块实例

```ts
const events = createEvents();
```

它内部持有 stack、append-only history 与 hook subscriptions；不存在模块级可变注册表。上层模块显式
取得同一个 `events` 实例，handler 需要其它模块时由注册处闭包捕获，不再通过 `event.game` 动态查找。

公开观察面至少包括：

```ts
interface Events {
  readonly current: AnyEvent | null;
  readonly history: readonly AnyEvent[];
  on(/* EventHookPoint + handler */): () => void;
  findSince(/* boundary + predicate */): AnyEvent | null;
}
```

### 5. 原子创建并执行 scope

公开的 `new Event().execute()` 被删除。所有者句柄的 `run` 在同一调用中创建并执行事件，从结构上消除
延迟执行；Event 对外只有 `running → completed`，不再暴露可长期持有的 `created` 状态。

默认执行顺序保持 ADR-0001：

```text
绑定当前栈顶为 parent
→ 入栈、入历史、分配 id
→ before handlers
→ content
→ after handlers
→ 所有者 clear
→ 执行期登记的 onClear（FIFO）
→ 定稿 endId
→ 出栈
→ completed
```

content / handler / clear 抛错均向外传播；无论正常或异常，都必须定稿 `endId`、恢复栈并完成事件。
子事件异常向外传播时，父 after 不执行，但内外层 clear 仍随栈解卷。触发 handler 不建立事件、不入历史。

事件默认自动触发 before / after。需要自行安排时点的行为可选择 manual 模式，并在当前 Event scope 上
调用 `emit('before' | 'after')`；取消等语义仍属于具体事件 data，由业务流程解释，不进入 Event 通用字段。

### 6. 因果与历史以 Kind 查询

父事件在 `run` 开始时绑定当前栈顶；严格 await 的嵌套调用保证某事件子树在历史中连续。`id` 等于
history 下标，`endId` 在 clear 后定稿为子树最后一个事件的 id。

```ts
event.getParent(UseCard);      // Event<typeof UseCard> | null
event.kind === CardMove;       // Kind 对象身份
events.findSince(boundary, predicate);
```

Event 模块不接受业务字符串字典；具体事件数据、Kind 常量和行为入口都随所属业务模块走。

## 第一轮验收

1. 自动 before → content → after；
2. manual 模式自行安排 before / after；
3. 嵌套 parent、`getParent(Kind)`、`id/endId`；
4. content 或 clear 抛错后栈、历史和完成态仍正确；
5. 所有者 clear 与动态 `onClear` 的顺序及异常路径；
6. hook disposer 精确注销；
7. 两个 `createEvents()` 的历史与订阅完全隔离；
8. `findSince` 的边界查询；
9. 不 import 旧 `Game`、业务模块或业务事件字典；
10. 外部只有 Kind 观察权，不能为已有 Kind 替换 content。

## 本轮不设计

- 事件结果收据与 modify/transfer；
- 通用 cancelled / interrupted / rollback；
- before/after 以外的自定义 HookPoint；
- Event 级 priority 与触发效果排序；
- 并发事件、延迟事件与脱离严格栈的调度；
- 历史裁剪、索引、序列化与 Kind 名称注册表；
- `GameOverError` 或其它业务中断类型。

这些能力等对应业务模块出现真实用例后，再补充本目录中的后续决策。

