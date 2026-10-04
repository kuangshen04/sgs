# R005 Seating 模块：可变座次数组与只读查询

- **状态**：MVP 已落地
- **落地位置**：`src/mvp/seating/`

## 背景

座次只影响按桌面方向的结算顺序和距离基准，不属于 Player 身份。未来存在调整座位的规则，而且换座本身
会成为有时机的事件，因此 Seating 不能冻结成永远不变的值；同时普通消费者也不应直接 `splice` 数组，
绕过未来由 Seating 拥有的换座行为。

MVP 当前只需要从当前回合玩家开始遍历和读取座位号。计算排除死亡玩家后的座次差会同时理解 Seating
与 Life，应留给 Distance 模块，而不是让 Seating 依赖死亡状态。

## 决策

### 1. Seating 运行时就是 Player 数组

```ts
type Seating = readonly Player[] & { /* nominal brand */ };
```

数组顺序定义为逆时针座次顺序。`createSeating` 复制调用方输入，检查同一 PlayerId 不重复，但不冻结
底层数组。公开类型是 readonly 的 nominal 数组：消费者可按普通数组读取和遍历，不能在 TypeScript 中
直接修改；未来 Seating 自己的换座行为可以在事件 content 内修改同一个底层数组，已有引用立即看到新
座次。

具体模式的人数限制不属于 Seating，空数组本身合法。

### 2. 座位号采用 1-based

`seatNumberOf(seating, player)` 按 Player 实例身份查找并返回 `index + 1`。传入另一个同 ID 实例仍然是
调用错误，因为一局内所有模块应共享同一个 Player 对象；同 ID 唯一性在创建 Seating 时检查。

座位号不存进 Player，每次查询都反映当前数组顺序，因此未来换座后不会留下陈旧字段。

### 3. 逆时针遍历返回快照

`counterclockwiseFrom(seating, current)` 返回：

```text
[current, current 的下一逆时针玩家, ..., current 的上一逆时针玩家]
```

每名 Seating 中的玩家恰好出现一次。返回值是冻结快照，保证本次结算顺序不因之后发生的换座而在遍历
中途改变；原始 Seating 本身不冻结。

### 4. 死亡、距离和换座延期

- Seating 永远保存原始座次中的全部 Player，不过滤死亡或临时移除状态；
- Distance 未来显式依赖 Seating + Life，先形成有效玩家环，再计算座次差和距离基准；
- MVP 不提供相邻玩家、座次差或距离 API；
- MVP 不提供换座函数和换座事件，等第一条真实换座规则出现后，由 Seating 拥有固定事件 Kind 和行为入口。

## MVP 落地

- `createSeating(players)`：复制输入、检查重复 PlayerId、不冻结底层数组；
- `seatNumberOf(seating, player)`：读取 1-based 座位号；
- `counterclockwiseFrom(seating, current)`：产生从当前玩家开始的逆时针冻结快照；
- 单测覆盖 nominal 类型、可变底层、重复 ID、实例身份、1-based 编号、环形遍历与快照稳定性。

## 与其它决策的关系

- 落实 R004 的“座次不属于 Player”；
- 保留 ADR-0011 的 Range 独立边界，Distance 不反向进入 Seating；
- 未来换座是 Seating 自己拥有的事件流程，不允许普通消费者直接修改数组。
