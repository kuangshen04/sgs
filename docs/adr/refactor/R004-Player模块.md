# R004 Player 模块：稳定身份与外置状态

- **状态**：MVP 已落地
- **落地位置**：`src/mvp/player/`

## 背景

Player 是 HP、Life、Skill、CardArea、Seating 等模块共同引用的局内实体。如果把这些状态都放进 Player，
Player 会重新成为万能容器；如果提供 `player.get(token)` 一类通用注入袋，依赖关系又会隐藏成 Service
Locator。另一方面，调试和日志仍需要一个比裸字符串更清晰的身份。

## 决策

### 1. Player 只拥有稳定身份

```ts
type PlayerId = string & { /* nominal brand */ };

interface Player {
  readonly id: PlayerId;
  readonly label?: string;
}
```

`PlayerId` 由逐局装配显式给入，没有模块级计数器、全局注册表或隐式分配器；同一局内的唯一性由之后的
逐局装配检查。`label` 只用于日志和调试，不参与规则判断，也不代替座次、武将名或账号身份。Player
实例创建后冻结。

### 2. 座次不属于 Player

座次只影响结算顺序和距离，由独立 Seating 模块拥有（已落地，见 R005）：

```text
Seating → Player
Range → Seating
```

Seating 提供 1-based 座位号和从指定玩家开始的逆时针顺序；它不把死亡或临时移除状态写进 Player。
排除死亡玩家后的座次差与完整 Range 仍延后到对应真实用例。

### 3. 死亡和临时移除是外部状态

死亡、存活、临时移出游戏都不结束 Player 对象生命周期。它们由所属模块以 Player 为键保存状态并拥有
自己的事件或 hook；事件历史和其它状态仍可引用同一个 Player。

Player 真正的生命周期是“在一局中被创建并作为身份载体存在”。MVP 没有一局内动态销毁 Player 的
用例，因此不建设通用生命周期注册表。以后若模块确实持有监听器、定时器等需要显式释放的资源，由
Player 生命周期流程注入窄的 dispose hook，不能借此加入通用状态袋。

### 4. 状态由所属模块逐局外置保存

HP 等模块创建逐局 Runtime，在内部用 `WeakMap<Player, State>` 或等价 Map 保存状态：

```text
HP Runtime ── WeakMap<Player, HpState>
Life Runtime ── WeakMap<Player, LifeState>
```

状态 Runtime 通过公开行为和查询面被显式传给调用方；业务代码不得通过 Player 查找任意服务。状态表
随局创建，不能是模块级可变 WeakMap。死亡和临时移除不会 detach 状态；整局结束时 Runtime 与 Player
一起释放。

在 HP、Skill storage 或其它 Entity 状态出现至少两三个重复实现前，不提炼通用 `EntityStateStore`。

### 5. 完整调试视图由只读联结模块提供

MVP 大致完成后再设计 PlayerInspector：它在装配侧显式读取 Player、Seating、HP、Life、CardArea、Skill
等公开查询，生成只读普通数据快照。Inspector 不挂到 Player 上、不返回模块服务、不参与规则判断，避免
演变成 Service Locator；真正的前端视图还必须另行处理隐藏信息和观察者权限。

## MVP 落地

- `playerId(value)` 校验并创建 nominal PlayerId；
- `createPlayer({ id, label? })` 创建冻结的最小 Player；
- 单测覆盖类型身份、输入校验、不可变形态与外置 WeakMap 状态用法。

## 与其它决策的关系

- 服从 R000 的“Player 不吸收 HP、技能、区域等行为”；
- 状态【里】通过所属模块的逐局外置表实现，行为仍在所属模块【外】组织；
- Seating 独立落地于 R005；Range 和 PlayerInspector 不属于本次 Player MVP。
