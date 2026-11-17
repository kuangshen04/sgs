# R006 Card 模块：CardArea 位置、单牌原子移动与批量移动事件

- **状态**：MVP 已落地
- **落地位置**：`src/mvp/card/`
- **旧语义来源**：`../0002-位置与移动.md`、`../0003-UsedCard系统.md`

## 背景

旧实现已经验证“一牌一位置、受控区域、集中索引、批量 CardMove 事件、来源派生和部分成功”的业务
价值，但把位置描述符、Player 字段、万能 Game、摸牌/判定业务和 UC 驻留区直接耦合进了物理牌层。
旧 `move.ts` 甚至静态 import UC 类型并访问 `game.usedCardHooks`，与 R000 确定的 Card 不认识 UC、UC 通过
【里】反作用注入移动流程相冲突。

新 Card 模块只表达无行为的实体牌、物理区域和移动。Area 可以拥有特殊内部结构；移动核心保持
“严格单牌原语 + 宽容批量事件”两层，通过普通函数注入具体进入方式，不建设厚重的 Destination 类型或
Area 继承体系。

## 决策

### 1. Card 是不可变物理实体

第一版采用 nominal string 身份：

```ts
type CardId = string & { /* nominal brand */ };
type CardFaceId = string & { /* nominal brand */ };
type CardSuit = 'spade' | 'heart' | 'club' | 'diamond';

interface Card {
  readonly id: CardId;
  readonly face: CardFaceId;
  readonly suit: CardSuit | null;
  readonly number: number | null;
}
```

`face` 是印刷牌面身份，也是普通使用时默认 UC 身份的来源，不包含 UC 规则定义或执行行为。实体牌允许
无花色、无点数，两者独立为 `null`；非空点数创建时限制为 1–13。颜色不保存，按花色派生，
无花色即无颜色。Card 创建后冻结。

Card 不拥有当前位置、Player、显示文本、使用规则、目标规则、content 或 AI。同一局的 CardRuntime 中，
CardId 与规范 Card 对象一一对应；另一个同 ID 对象不能冒充规范实体。

### 2. CardArea 本身就是位置，且不反绑 Player

不再建立 `{ player, zone }` 形式的 `CardLocation`：

```ts
interface CardArea {
  readonly id: CardAreaId;
  readonly cards: readonly Card[];
  leave(card: Card): void | Promise<void>;
  // R008 落地时把 onLeave / onEnter 从注册 handle 提升到 Area 实例。
}
```

Area 不包含 owner、zone 或 Player。手牌区、判定区等关系由上层以 `Map<Player, CardArea>` 或具体查询
模块保存。`cards` 是按该 Area 自己语义展开的只读视图，不要求内部一定使用普通数组。

所有 Area 都有统一的严格 `leave(card)`：先同步完成内部结构删除与位置索引删除，使两者重新一致，
然后按注册顺序调用该 Area 的离开 hook。普通消费者不应直接调用 leave；它是 atomicCardMove 根据
位置索引取得来源 Area 后使用的共同协议。

### 3. 进入能力跟随具体 Area，不进入通用接口

不同 Area 可以提供完全不同的进入方法：

```ts
hand.append(card);
deck.enterTop(card);
deck.enterBottom(card);
equipment.enterSlot('weapon', card);
```

具体进入方法先同步修改 Area 内部结构并把位置索引设为本 Area，再按注册顺序调用进入 hook。进入方法
可以把槽位、插入下标等额外参数绑定进闭包；移动核心只把该单牌进入函数传给 atomicCardMove。

不建立公共 `CardDestination`、`DeckArea`、`EquipmentArea` 继承树。具体 Area 工厂的额外方法可以由
TypeScript 直接推导；当实例被当作 CardArea 使用时，只暴露共同基础面。

### 4. 外部模块可以注册特殊 Area 实现

CardRuntime 允许所属模块或联结模块注册特殊 Area。注册时提供 Area 的只读视图、严格 leave 和具体
enter 方法所需的低层函数；这些只是实现协议，不提升为游戏领域对象。

Area 不能直接持有或任意修改公开位置 Map。CardRuntime 在创建/注册 Area 时给出只对该 Area 生效的
位置写能力，使其结构修改与索引修改保持在同一个同步片段。CardRuntime 负责拒绝重复 CardAreaId、
外局 Area 和未登记 Area。

UC 模块以后可以创建装备、判定等特殊物理 Area 并注册，但 Card 模块不 import UC，也不预设槽位结构。

### 5. atomicCardMove 是严格的单牌非事件原语

概念形态为：

```ts
type EnterCard = (card: Card) => void | Promise<void>;

async function atomicCardMove(
  card: Card,
  expectedFrom: CardArea | null,
  enter: EnterCard,
): Promise<void>;
```

atomic 的含义是“一张牌的一次完整离开—进入”是最小物理移动单位，不表示整批牌的事务。它不创建
CardMove 事件，并采用严格输入：

- Card 必须是本局规范对象；
- `expectedFrom` 非空时，Card 必须正好位于该 Area；
- `expectedFrom === null` 时，Card 必须尚未位于任何 Area，用于初始化；
- enter 必须来自当前 Runtime 已登记的具体 Area；
- 任一调用前置条件不满足即抛错，不做部分成功。

同 Area 移动不是 no-op，仍完整执行来源 leave 和具体 enter，因此可以改变区域内部顺序并触发两侧
hook。初始化不发事件，但必须以 `expectedFrom === null` 调用同一原子操作，不能直接修改 Area 内部
结构。

### 6. hook 在结构与索引一致后运行

Area 的 leave / enter 各自遵循：

```text
同步修改特殊内部结构 + 同步更新位置索引
→ 此时结构与索引一致
→ 调用该侧 hooks
```

hook 可以异步并发起其它移动，但不得接管当前正在 atomicCardMove 的 Card；可以移动其它牌。多个 hook
按注册顺序执行，首个异常停止该侧剩余 hook。

若来源结构与索引已经成功删除、随后 leave hook 抛错，atomicCardMove 仍必须尝试目标 enter，保证当前
Card 不会永久悬空；目标进入完成后再把 leave hook 异常向外传播。若 leave 在结构修改前因严格不变量
失败，则不调用目标 enter。进入 hook 抛错时 Card 已经位于目标 Area，异常直接传播且不回滚物理状态。

任何 hook 异常都不回滚已经发生的其它实体移动或嵌套事件。

### 7. moveCards 是宽容的批量事件行为

概念输入为：

```ts
interface MoveCardsInput {
  readonly cards: readonly Card[];
  readonly toArea: CardArea;
  readonly reason: string;
  readonly mover?: Player;
  // 另有由具体 Area 提供的批量进入编排函数；不进入事件数据。
}
```

moveCards 保留旧业务语义：

- 按第一次出现去重 CardId；
- 同 ID 非规范 Card 直接报错；
- 当前不在任何 Area 的规范 Card 跳过；
- 初始没有可移动牌时不创建事件；
- 一次事件允许多张牌来自不同 Area，但共用同一目标 Area；
- before 期间其它行为移走后续牌时，逐张执行前重新核对来源并跳过已变化的牌；
- 批量不回滚：较晚的一张失败时，先前已完成的 atomicCardMove 保持生效；
- 返回实际移动成功的牌，顺序保持调用方规范化后的逻辑输入顺序，不暴露物理执行顺序。

批量进入的逐张顺序与插入参数由目标 Area 提供的普通函数决定。实现可以采用 generator、callback 或
数组计划；它们只是私有函数协议，不建立新的领域 interface。例如“之后依次摸到 A、B、C”的牌堆顶
进入，可以物理上按 C、B、A 依次调用 atomicCardMove，而返回结果仍为 A、B、C。

### 8. CardMove Event 只记录可观察语义

Card 模块拥有 CardMove Kind 与固定移动行为；只导出 Kind，执行句柄留在模块内部，遵循 R001：

```ts
interface CardMoveData {
  readonly cards: readonly Card[];
  readonly fromAreas: readonly CardArea[];
  readonly toArea: CardArea;
  readonly reason: string;
  readonly mover?: Player;
  moved: readonly Card[];
}
```

`cards[i]` 与 `fromAreas[i]` 是事件开始时的规范候选及来源。目标具体 enter 函数和批量编排函数不进入
Event data。MVP 中 before 只能观察只读移动计划或发起其它行为，不能任意改写 cards、来源、目标或
reason；content 开始后重新核对来源。若 before 移走全部候选，当前事件仍正常执行 after，`moved = []`。

Event content 依次调用 atomicCardMove；Area hooks 全部属于 CardMove content，发生在 CardMove.after
之前。after 看到已经完成 Area 反作用后的物理状态和实际 moved 结果。

### 9. UC 通过 Area hook 注入，不反向污染 Card

UC—Card 联结模块可以为 UC 使用的物理 Area 注册 leave hook：

```text
实体牌完成来源 Area 的结构/索引删除
→ Area leave hook
→ UC—Card 联结检查完整性并处理其它实体牌
→ 当前实体牌仍按 atomicCardMove 进入目标
```

联结模块负责对同一批次影响的 UC 去重，避免重复破坏；Card 只执行 Area hook，不解释 UC。Card 自身的
状态对账只检查 Card / Area / 位置索引，UC 绑定核对属于联结模块。

### 10. 位置索引和不变量

CardRuntime 逐局拥有规范 Card、已登记 Area 和 `CardId → CardArea` 派生索引。Area 内容是权威，索引
不参与序列化并可在加载后重建。MVP 对账至少检查：

- CardId 与规范 Card 对象一一对应；
- 每张 Card 最多处于一个 Area；
- Area 内没有重复 CardId；
- Area 内容与位置索引双向一致；
- Area 中的 Card 和移动目标都属于当前 Runtime；
- CardAreaId 在当前 Runtime 唯一。

## 不属于 Card MVP

- 摸牌、判定、弃牌阶段、赠予等业务流程；
- 使用牌、响应、UC 定义与效果；
- 洗牌 RNG；
- 装备和判定区的 UC 完整性实现；
- void / 移出游戏；
- Area 可见性和前端视图；
- Card / Area Inspector；
- 改写目标、取消部分移动等 CardMove 修改协议；
- CardMoveReason token 系统；第一版 reason 使用稳定字符串；
- 序列化与回放协议。

## MVP 落地

- **实现**：`src/mvp/card/card.ts`
- **测试**：`src/mvp/card/card.test.ts`
- 已实现 nominal `CardId / CardFaceId / CardAreaId`、可空花色/点数、颜色派生与冻结 Card；
- 已实现逐局规范 Card / Area 登记、`CardId → CardArea` 索引、通用严格 leave 与自定义 enter 闭包；
- 已实现严格 `atomicCardMove`，覆盖初始化、普通移动、同 Area 重排和 leave hook 异常后的目标进入；
- 已实现 CardMove Kind、部分成功的批量 `moveCards`、目标自定义物理顺序和逻辑 moved 顺序；
- 已实现普通列表 Area 工厂、Area hook 注册/注销及 Card 自身对账；
- 单测覆盖特殊 Area 注册、伪规范对象、来源变化跳过、空移动不发事件和批量失败不回滚。

> **R008 后续窄调整**：当前源码的 `onLeave / onEnter` 由 `registerArea()` 返回的技术 handle 暴露；
> UsedCardArea 初始化需要仅凭对应 CardArea 注册完整性 hook，因此随 R008 实现把两个注册入口提升到
> CardArea 实例。底层 hook 存储、顺序、disposer 和移动语义不变，不属于 R006 边界重做。

## 实现约束

- 公开领域概念保持为 Card、CardArea、CardRuntime 与 moveCards；
- EnterCard、批量进入计划、Area driver 等优先作为文件内部函数类型，不为每种 Area 建公共接口；
- 普通业务只拿 moveCards 和只读查询面；atomicCardMove、Area 注册与初始化能力属于窄的内部/装配能力；
- 具体 API 名称可由实现测试微调，但不能重新引入 CardLocation union、Player 反绑、万能 Game 或 Card → UC
  静态依赖。

## 与既有文档的关系

- 取代 ADR-0002 在新 MVP 中的具体 Game / Player / CardLocation / UC hook 形态，保留其一牌一位置、
  Area 权威、索引派生、批量事件和部分成功语义；
- 保留 ADR-0003 的实体牌 / UC 两层边界与“区域内选择的是实体牌”；
- 落实 R000 的 `Card/CardArea → Event【外】` 与 `UC → Card move【里】`；
- Card 实现完成后，UC 将作为第一个特殊 Area 和 leave hook 消费者验证本协议。
