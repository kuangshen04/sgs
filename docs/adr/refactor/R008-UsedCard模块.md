# R008 UsedCard 模块：规则牌载体、Area 生命周期与实体材料完整性

- **状态**：边界已定；待实现
- **目标落地位置**：`src/mvp/used-card/`
- **旧语义来源**：`../0003-UsedCard系统.md` 及旧 a4 讨论；具体依赖形态按 R000–R007 重建

## 背景

实体 Card 只表示物理牌面和位置，真正被使用、打出、装备、置入判定区并产生规则作用的是 UC
（UsedCard）。普通牌、转化牌、多材料牌和零牌虚拟牌都需要统一的规则身份；驻留 UC 还要在实体材料
被外部移动时维护完整性。

旧实现已经验证两层模型、牌面推导、显式迁移与意外离区破坏等业务语义，但依赖万能 Game、Player
区域字段、CardLocation union 和 UC Store 反查。新实现建立在 R006 CardArea 位置和显式 Card.moveCards
之上：UsedCardArea 不保存 backing CardArea，实体材料的当前位置由 CardRuntime 查询；UC 通过具体
CardArea 的 leave hook 注入反作用，Card 不认识 UC。

## 决策

### 1. 纯 UsedCard 与逐局 Instance 分开

UsedCard 是无副作用、牌面已经完整推导的规则值：

```ts
interface UsedCard {
  readonly face: CardFaceId;
  readonly suit: CardSuit | null;
  readonly number: number | null;
  readonly color: CardColor | null;
  readonly physicalCards: readonly Card[];
}
```

它可以在 Selection、AI 和场景规则查询中任意构造，不分配逐局 ID、不进入 Runtime、不移动实体材料。
同一 physical Card 在纯候选值中出现不建立运行时归属。

确认执行后 Runtime 创建逐局实体：

```ts
interface UsedCardInstance extends UsedCard {
  readonly id: UsedCardId;
}
```

`UsedCardId` 是逐局 nominal string，由 Runtime 分配。第一版 Instance 只增加稳定 ID；Area 由 Runtime
外置索引查询，不在 Instance 上保存公开可写 `loc`。`disabled` 延后到 UC—Effect 联结出现时决定。

### 2. 牌面推导统一且允许显式覆盖

纯构造入口接收 UC face、实体材料，以及可选的 suit / number / color 显式声明。`undefined` 表示按材料
推导，`null` 表示明确无该牌面字段：

- 单材料：未声明的花色和点数继承该实体 Card，颜色随花色；
- 零材料：未声明的花色、点数、颜色均为 null；
- 多材料：未声明的花色、点数为 null；全部材料同为某个非空颜色时继承该颜色，否则为 null；
- 显式字段逐项优先；显式 suit 且未显式 color 时，颜色随 suit；
- physicalCards 按调用方逻辑顺序保存，构造结果冻结。

Card.face 是普通使用时默认 UC face 的来源，但 Card 模块不查 UsedCard 定义。转化牌可以显式给出另一
face；零材料 UC 同样合法。

### 3. UsedCardArea 本身就是 UC 位置

基础接口与 CardArea 对称，但只保存 UC：

```ts
interface UsedCardArea {
  readonly id: UsedCardAreaId;
  readonly usedCards: readonly UsedCardInstance[];
  leave(card: UsedCardInstance): void | Promise<void>;
}
```

UsedCardArea 不绑定 Player，不包含 kind union，也不强制声明 backing CardArea。具体 Area 可以提供列表、
槽位或其它自定义 enter 方法；通用接口只规定严格 leave。Player → UsedCardArea 的关系由上层 Map 或具体
查询模块保存。

具体 UsedCardArea 工厂可以在闭包中捕获对应 CardArea、实体材料进入方法和 hook disposer，但这种对应
关系不成为基础字段。physicalCards 的实际位置始终通过 CardRuntime.areaOf(card) 查询。

### 4. Runtime 允许命令内部短暂无区域

Runtime 逐局拥有：

- 活跃 UsedCardInstance；
- `UsedCardId → UsedCardArea` 位置索引；
- `Card → UsedCardInstance` 实体材料反查；
- 已登记 UsedCardArea；
- UC 生命周期动作和自身对账。

`areaOf(instance)` 可以在 enter / move / exit 命令内部短暂返回 null：刚创建的 Instance 尚未进入首个
Area，或显式迁移已经离开旧 Area但尚未进入新 Area。这个状态不提升为公开 `moving` 领域状态；生命周期
命令正常返回时，活跃 Instance 必须处于某个 UsedCardArea，退出 Instance 必须已从活跃 Store 删除。

### 5. 首次 enter 创建 Instance 并显式移动材料

第一版不暴露“只 commit、以后再处理”的普通业务入口。首次 enter 在一个命令中执行：

```text
纯 UsedCard
→ 分配 UsedCardId，登记无 Area Instance
→ 显式 Card.moveCards 移动全部 physicalCards
→ 检查 moved 与 physicalCards 完全一致
→ 调用目标 UsedCardArea 的具体 enter
→ 建立 UsedCardId → Area 和 Card → Instance 索引
→ 返回活跃 Instance
```

运行期 UC 材料移动必须使用带 CardMove Event 的 `CardRuntime.moveCards`，不直接调用 atomicCardMove。
零材料 UC 跳过 Card 移动，直接进入 UsedCardArea。

Card.moveCards 具有部分成功语义，而 UC enter 要求全部材料同步成功。若结果不完整，属于未定义执行故障：
直接抛错并按 R007 终止本局，不回滚已经发生的 CardMove；Instance 可以保留在故障快照中处于无 Area
状态，但命令不得假装成功返回。

### 6. 显式 move 先解除绑定，再移动实体材料

正常迁移顺序为：

```text
UsedCardArea.leave(instance)
→ 删除 UsedCardId → Area
→ 清除全部 Card → Instance 反查
→ Instance 短暂无 Area
→ 显式 Card.moveCards(全部 physicalCards, 新物理目标)
→ 检查材料全部移动成功
→ 调用新 UsedCardArea 的具体 enter
→ 重建 Area 与实体材料反查
```

由于 Card → Instance 反查在物理移动前已经清除，旧 CardArea 的 leave hook 查不到 UC，因此显式迁移
不会被误判为破坏，不需要 `isMoving` 标志。零材料 UC 只迁移 UsedCardArea 状态。

任何中途异常都向 Match 传播，不回滚旧 Area leave 或已完成的实体移动。

### 7. exit、settle 与活跃 Store

正常 exit 接收明确的实体材料物理目标与批量进入方式：

```text
离开当前 UsedCardArea
→ 删除 Area 与实体材料反查
→ 显式 Card.moveCards 移动全部材料
→ 检查全部移动成功
→ 从活跃 Store 删除 Instance
```

零材料 UC 直接离开 Area 并从 Store 删除。exit 完成后 Instance 仍可被 Event 历史引用，但 Runtime 不再
把它视为活跃实体。

settle 是竞争安全的便利行为：只有 Instance 仍位于调用方指定的 UsedCardArea 时才执行 exit；已经迁移
或退出时返回 false / no-op。这是显式定义的正常结果，不是错误。

### 8. UC—Card 联结通过 CardArea 实例注册 leave hook

R008 要求 R006 做一个窄接口调整：`onLeave / onEnter` 注册入口直接位于 CardArea 实例，而不是只存在于
`registerArea()` 返回的技术 handle。hook 存储仍可由 CardRuntime 内部维护：

```ts
interface CardArea {
  readonly id: CardAreaId;
  readonly cards: readonly Card[];
  leave(card: Card): void | Promise<void>;
  onLeave(hook: CardAreaHook): () => void;
  onEnter(hook: CardAreaHook): () => void;
}
```

具体 UsedCardArea 初始化时拿到与自身业务对应的 CardArea，并注册完整性 hook；基础 UsedCardArea 不暴露
这个对应关系。注册 disposer 随局保存，Match 结束时整个 Runtime 一起释放。

### 9. 实体材料意外离区触发 break

稳定状态下，Runtime 维护 `physical Card → active UsedCardInstance`。当具体 CardArea 已完成该 Card 的
结构删除和位置索引删除后调用 leave hook：

```text
通过离开的 Card 反查 active Instance
→ 找到仍位于 UsedCardArea 的 UC，判定为意外破坏
→ UsedCardArea.leave(instance)
→ 删除 UC Area 索引与全部 Card → Instance 反查
→ 从活跃 Store 删除 Instance
→ 当前离开的 Card 继续原 atomicCardMove
→ 其它仍有位置的 physicalCards 显式 moveCards 到 processing CardArea
```

反查在移动其它材料前已全部清除，因此其 leave hook 自然 no-op，同一 UC 只 break 一次。当前正在移动的
Card 不由 UC 接管，仍进入原调用指定的目标。

若剩余材料移动不完整或 hook 抛错，直接按 R007 终止本局，不回滚 UC 销毁或已发生的移动。

### 10. break 剩余材料第一版固定进入处理区

MVP 不抽象 broken-material policy，也不默认进入弃牌堆。UC—Card 联结逐局装配时显式取得 processing
CardArea 及其批量进入函数，但业务语义固定为“break 后其它仍有位置的材料进入 processing”：

```text
当前离开的材料 → 原请求目标
其它剩余材料 → processing CardArea
UC → 销毁
```

这些剩余材料进入 processing 后是没有 UC 的裸 Card，符合 processing 的单向约束。何时把裸处理区牌
清理到弃牌堆属于上层明确流程，不由 break 或 UC 核心猜测。

### 11. 完整性方向不在基础 Area 抽象

第一版不建立 `CompletenessMode` 等通用枚举：

- processing 用例只要求 UC 的材料位于预期 CardArea，processing CardArea 可以包含裸 Card；
- 测试驻留区用例验证实体材料意外离区时 break；
- 装备槽、判定区将来根据真实规则决定是否需要 Card → UC 的双向完整性。

Card 自身对账只检查 Card / CardArea / 位置索引；UsedCard Runtime 检查 Instance / UsedCardArea / 实体反查；
跨两边的完整性由 UC—Card 联结测试和 Inspector 核对。

### 12. 第一版不预建 UC 生命周期 Event

UsedCard 可以依赖 Event，但目前没有 enter / move / exit / break Event 的真实观察者。第一版生命周期动作
先作为严格命令实现，实体材料变化自然产生 CardMove Event。等 Effect、装备或延时牌出现真实观察需求时，
由 UsedCard 模块拥有相应 EventKind；UseCard 以后拥有自己的业务事件，不能用 UC 生命周期事件代替。

## MVP 实现与验收范围

第一版只实现：

- UsedCard 纯构造及 0 / 1 / 多材料牌面推导；
- UsedCardInstance、Runtime、ID、活跃 Store、Area 与实体材料反查；
- 通用 UsedCardArea leave、具体 enter 和一个列表 Area 工厂；
- processing UsedCardArea + processing CardArea 的 enter / exit / settle；
- 测试驻留 UsedCardArea 的实体材料意外离区 break；
- break 剩余材料固定进入 processing；
- 显式 move 不触发 break；
- Runtime 自身对账及 UC—Card 联结测试；
- R006 CardArea `onLeave/onEnter` 公共注册面的窄调整。

不实现：

- UsedCardDef、规则内容、目标合法性和 UseCard；
- 装备槽、判定阶段、同名延时牌限制；
- `disabled`、UC—Effect、storage、Range；
- Player 与 UsedCardArea 的归属；
- 通用 completeness mode；
- UC 生命周期 EventKind；
- break 目标策略、回滚和未知异常恢复；
- Inspector、前端显示、序列化与回放。

## 与其它决策的关系

- 保留旧 ADR-0003 的实体 Card / UC 两层语义、牌面推导、显式迁移和意外离区破坏；
- 不继承旧 Game、RuleSet、CardLocation、Player 区域字段、Store 形状和目录分层；
- 依赖 R006 的 CardArea 位置、显式 Card.moveCards、部分成功与 Area hook；
- 遵守 R007：完整性失败和生命周期命令异常 fail-stop，不回滚后继续；
- UseCard 仍是 R000 中位于 UC 外的上层业务流程；
- UC 实现完成后与 Card、HP/Life 一起形成 DI / Match Assembly 检查点所需的真实依赖图。
