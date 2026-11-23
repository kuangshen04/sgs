# R009 HP 与 Life 模块：外置体力、生存状态与直接死亡

- **状态**：MVP 已落地
- **落地位置**：`src/mvp/hp/`、`src/mvp/life/`
- **旧语义来源**：`../0008-游戏流程与胜负.md`、旧 `src/flow/life.ts`；具体依赖形态按 R000–R007 重建

## 背景

Player 已按 R004 收敛为一局内稳定存在的身份，不再保存 `hp`、`maxHp`、`alive` 或其它模块状态。
HP 和 Life 因此需要各自持有逐局状态，同时又不能通过 Player 上的通用状态袋、万能 Game 或运行时
Service Locator 互相查找。

旧实现把伤害、回复、失去体力、濒死求桃、死亡、胜负判断和 `GameOverError` 放在同一文件中。它验证了
“伤害”和“失去体力”必须区分、体力可以降到负数、回复不能超过上限、死亡发生在体力变化之后等规则
语义，但其 Player 字段、响应窗口和异常结束方式不属于 R000 新边界。

本轮只实现完整 Match 纵向链需要的最小能力：体力变化、存活查询和直接死亡。濒死求桃、临时移除、
复活、最大体力变化和胜负判定继续延期。

## 决策

### 1. HP 与 Life 是两个逐局外置状态模块

依赖方向为：

```text
Life → Player、Event
HP   → Player、Event、Life
```

Life 不读取 HP；HP 在完成负向体力变化后，根据结果显式调用 Life。两边都以规范 Player 对象为键保存
逐局状态，不把字段写回 Player，也不建立 `player.get(token)` 一类隐藏依赖。

第一版一局内不会动态创建或销毁 Player。Runtime 创建时直接取得本局 Player 和初始状态；状态随整个
Match 一起释放，不建设通用 Player attach/detach 生命周期注册表，也不抽象 `EntityStateStore`。

### 2. Life 只拥有生存状态

第一版 Life 状态只有：

```ts
type LifeStatus = 'alive' | 'dead';

interface LifeRuntime {
  statusOf(player: Player): LifeStatus;
  isAlive(player: Player): boolean;
  die(player: Player): Promise<DieResult>;
}

type DieResult =
  | { readonly status: 'died' }
  | { readonly status: 'already-dead' };
```

概念创建入口为：

```ts
createLifeRuntime(events, players): LifeRuntime;
```

所有登记 Player 初始为 `alive`。查询不属于当前 Runtime 的 Player 是调用错误，直接抛错。死亡不会销毁
Player，也不会删除 HP、区域或 Skill 等其它模块状态；事件历史和调试视图仍可引用同一个 Player。

### 3. die 是 Life 拥有的事件行为

Life 定义并公开 `LifeDie` EventKind，但保留其正常执行权。首次死亡的顺序为：

```text
life.die.before
→ Life 状态由 alive 改为 dead
→ life.die.after
```

`before` 是死亡发生前的观察时点，不提供取消死亡的通用协议；需要阻止死亡的规则应发生在未来的濒死
或伤害流程中，而不是让最终状态转换可被任意 hook 撤销。

对已死亡 Player 再次调用 `die` 是已定义的竞争结果：返回 `already-dead`，不产生第二个 LifeDie 事件。
这不是内部故障，也不重复执行死亡清理。LifeDie 的 content 或 hook 抛错时按 R007 向 Match 传播；已经
完成的状态变化不回滚。

同一 Player 的 LifeDie 尚在执行时再次重入 `die` 不等同于“已经死亡”，而是未定义的结算环，必须抛错
并按 R007 解卷当前事件栈，避免递归创建死亡事件或提前报告虚假的 `already-dead`。

Life 不负责：

- 检查当前体力是否小于等于零；
- 清理手牌、装备、Skill 或 UC；
- 从 Seating 删除 Player；
- 判断胜负或结束 GameFlow；
- 抛出 `GameOverError`。

死亡后的清理由以后出现的具体联结模块或 LifeDie hook 表达；整局终止条件由 GameFlow 从外部注入。

### 4. HP 只拥有体力状态及体力行为

HP 状态为：

```ts
interface HpState {
  readonly current: number;
  readonly max: number;
}

interface HpRuntime {
  stateOf(player: Player): HpState;
  currentOf(player: Player): number;
  maxOf(player: Player): number;
  isWounded(player: Player): boolean;

  damage(input: DamageInput): Promise<DamageResult>;
  lose(player: Player, amount: number): Promise<HpChangeResult>;
  recover(player: Player, amount: number): Promise<HpChangeResult>;
}
```

概念创建入口为：

```ts
createHpRuntime({
  events,
  life,
  players: [
    { player, max: 4 },
    { player: another, max: 4, current: 1 },
  ],
}): HpRuntime;
```

初始 `max` 必须为正整数；`current` 默认等于 `max`，显式初值必须在 `1..max` 内。运行中的 current 可以
因负向变化降到零以下，不截断为零。查询返回只读快照，不能泄漏内部可变状态引用。

第一版没有改变最大体力的命令。死亡后 HP 状态继续保留并允许查询，但对死亡目标执行 damage、lose 或
recover 属于未定义严格命令，直接抛错；复活机制出现时再扩展执行域。

### 5. damage、lose 与 recover 不合并成通用 delta

三种行为的规则语义不同：

- `damage` 有来源，可以在 before 时点被修改或防止，并产生伤害事件；
- `lose` 表示失去体力，不触发伤害相关效果；
- `recover` 表示回复体力，结果不能超过最大体力。

因此 HP 不公开一个代替三者的通用 `changeHp(delta)` 业务入口。第一版 Damage 留在 HP 粗模块内；等属性
伤害、传导、伤害转移等出现足够真实用例后，再判断是否拆成独立模块。

概念输入与结果为：

```ts
interface DamageInput {
  readonly source: Player | null;
  readonly target: Player;
  readonly amount: number;
}

interface HpChangeResult {
  readonly before: number;
  readonly after: number;
  /** 本次实际扣除或回复的非负数值。 */
  readonly applied: number;
}

type DamageResult =
  | ({ readonly status: 'applied' } & HpChangeResult)
  | { readonly status: 'prevented'; readonly before: number; readonly after: number };
```

公开结果使用不可变普通值表达，不要求调用方从 Event 对象中提取最终状态；Event 历史仍保存本次行为的
data 和父子关系。

### 6. 三种体力行为各自拥有 EventKind

HP 定义并公开 `Damage`、`LoseHp`、`Recover` Kind，正常执行能力留在 HP 模块内部。当前 Event 过渡方案
允许 before hook 直接修改 data：Damage data 至少包含 `source`、`target`、`amount`、`cancelled` 和最终
`result`；LoseHp / Recover data 至少包含 `player`、`amount` 和最终 `result`。

damage 使用手动 hook 顺序：

```text
hp.damage.before
→ 若 cancelled，返回 prevented，不修改 HP，也不派发 damage.after
→ 校验 hook 修改后的 amount
→ 扣除 current
→ 若 current <= 0，await life.die(target)
→ 写入 result
→ hp.damage.after
```

lose 的顺序为：

```text
hp.lose.before
→ 校验 amount
→ 扣除 current
→ 若 current <= 0，await life.die(player)
→ 写入 result
→ hp.lose.after
```

recover 的顺序为：

```text
hp.recover.before
→ 校验 amount
→ current = min(current + amount, max)
→ 写入实际回复量和 result
→ hp.recover.after
```

外部输入 amount 必须是正整数。before hook 修改后的 amount 在提交状态前再次校验；非法值表示规则代码
故障，按 R007 抛错并终止本局。`source: null` 表示没有 Player 来源；非空 source 必须属于本局，但不要求
其在伤害结算时仍然存活，以容纳已经离场来源留下的延迟结算。

回复在最大体力处的实际变化量可以为零，这是已定义结果，不产生溢出。能否主动选择一项无实际回复的
行为仍由上层 `canUse` / 选择工厂判断，HP 不承担出牌合法性。

### 7. 本轮体力归零直接死亡

MVP 不建立空壳 Dying 事件。damage 或 lose 完成 HP 扣减后，只要 current 小于等于零，就在当前 HP
事件 scope 内直接调用 `life.die`：

```text
UseCard
└─ Damage / LoseHp
   └─ LifeDie
```

LifeDie 完成后才继续 HP 事件的 after 时点。以后接入求桃时，在“体力小于等于零”和最终 `die` 之间增加
由 Life 所有的濒死流程；HP 的状态形态、三种行为边界和外部查询面不需要因此改变。

### 8. 正常结束与内部故障分开

- Damage 被防止、回复实际为零、重复 die 都使用显式结果；
- 外局 Player、死亡目标、非法 amount、缺失初始状态等属于严格命令错误；
- HP 已经扣减后，LifeDie hook 抛错时不回滚 HP；
- Life 已经标记死亡后，其 after hook 抛错时不恢复 alive；
- Match 是未知异常的唯一最外层边界，不能捕获后继续当前对局。

## MVP 测试边界

Life 单测至少覆盖：

- 所有登记 Player 初始存活；
- 首次 die 的 before / 状态转换 / after 顺序；
- 重复 die 返回 `already-dead` 且不重复事件；
- 同一 Player 的 LifeDie 重入严格报错并正确解卷；
- 外局 Player 查询和命令报错；
- 两个 LifeRuntime 状态隔离。

HP 单测至少覆盖：

- 初始状态、只读快照和两局隔离；
- damage 正常扣减、before 改写、取消与 after 结果；
- lose 不产生 Damage 事件；
- recover 不超过 max，并报告实际变化量；
- HP 降到零以下且不截断，嵌套触发 LifeDie；
- Event 父子关系为 Damage / LoseHp → LifeDie；
- 对死亡目标和外局 Player 的严格错误；
- hook 异常向上传播且不做通用回滚。

## MVP 落地

- **Life 实现**：`src/mvp/life/life.ts`
- **Life 测试**：`src/mvp/life/life.test.ts`
- **HP 实现**：`src/mvp/hp/hp.ts`
- **HP 测试**：`src/mvp/hp/hp.test.ts`

已实现逐局状态隔离、规范 Player 校验、LifeDie、Damage / LoseHp / Recover、体力归零直接死亡、事件
父子关系、显式取消结果、只读状态快照和 R007 fail-stop 语义。Dying 及其它延期项仍按下节处理。

## 本轮明确不做

- Dying、求桃、响应顺序和脱离濒死；
- 临时移出游戏、复活和初始死亡 Player；
- 增减最大体力、体力上限锁定等机制；
- 属性伤害、伤害传导、伤害转移和伤害来源链；
- 死亡后的弃牌、Skill / Effect / UC 清理；
- 身份胜负、最后存活者和 Match 结束策略；
- PlayerInspector、前端显示、序列化和回放；
- 通用 EntityStateStore、Player 生命周期总线或状态袋。

## 与其它决策的关系

- 落实 R000 的“HP / Life 状态【里】、行为【外】，HP 在外调用生死检查”；
- 落实 R004 的 Player 最小身份与逐局外置状态；
- 依赖 R001 的 Kind 所有者执行权、事件父子 scope 和 hook；
- 遵守 R007 的正常结果显式、严格命令报错、未知异常 fail-stop 与不回滚；
- 取代旧 ADR-0008 中 Player 字段、濒死响应、胜负判断和 `GameOverError` 的目标实现形态；
- HP / Life 落地后，与 Card / UC 共同构成 DI 与 Match Assembly 强制检查点的首张真实依赖图。
