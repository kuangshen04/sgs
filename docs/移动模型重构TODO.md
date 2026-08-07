# 移动模型重构 TODO（CardMove）

> 背景：
> - 无名杀教训——按 lose/gain/目的地拆事件的边界混乱，抽不到一起；统一移动事件应从"一次移动"建模
> - 连营/枭姬需要"失去"时机；牌堆操作需求（主 TODO #9）
> - 本工程是主 TODO #9（牌堆操作原语）与 #10（位置追踪）的共同基础：CardMoveEvent 是位置变化的记录

## 已确认的设计

### 位置模型

所有能放牌的位置统一为 `CardLocation`：

```ts
type CardLocation =
  | { player: Player; zone: 'hand' | 'equipment' | 'judgment' }
  | { zone: 'deck' | 'discardPile' };   // processing（处理区）等需要时再加
```

- 装备区不显式槽位：槽位由牌类型唯一决定
- 牌堆顶/底不是位置，是查询层的取放策略；牌堆内重排（观星）不产生移动事件
- **来源区域由引擎派生**：调用方只给 `to` + cards，`fromArea` 执行时对每张牌实时查询（FreeKill 式）
  - 支撑设施：内部位置索引 `getCardArea(cardId)`（createGame 建立、moveCards 更新），也是 TODO #10 位置追踪的最小版本

三层职责：

1. **查询层（只读）**：`peekTop(n)`、`findInDeck(cond)`、`findAllInDeckAndDiscard(cond)`、`cardsInAreas`——不改变状态
2. **牌堆内排序**：观星放回暂用 moveCards 的 `toPosition`（`'top' | 'bottom'`）表达
3. **跨位置迁移（唯一写入口）**：`moveCards`——产生 CardMove 事件

### moveCards

```ts
interface CardMoveSpec {
  to: CardLocation;
  cards: Card[];                 // 已知牌引用，按 id 迁移（部分成功语义保留）
  reason: CardMoveReason;
  mover?: Player;
  toPosition?: 'top' | 'bottom'; // 仅终点为牌堆时使用（临时，见 TODO）
}
```

- async 原语：内部创建 `CardMove` 事件，物理移动放 content（before 可 prevent → 移动取消）
- 按 id splice，天然保持剩余牌顺序
- 返回实际移动的 `Card[]`
- 双层事件：语义事件（Draw/Judge/UseCard…）内部执行 CardMove；技能接口层与物理记录层分离
- **一次 moveCards = 一条移动 = 一个事件**（不接受 FreeKill 的 MoveCardsData[] 多移动批次）：
  颗粒度由调用方控制——装备顶掉是两次 moveCards（replace + equip 两个事件，顺序先 replace 后 equip）

- [ ] **TODO：toPosition 是区域容器的特性，不应长期留在 moveCards 签名里**——之后应剥离为牌堆容器的置入原语/查询层对偶操作

### CardMoveReason

`draw`（摸牌）/ `judge`（判定）/ `discard`（弃置）/ `play`（打出）/ `use`（使用消耗）/ `equip`（装备入槽）/ `replace`（顶掉）/ `give`（交给）/ `obtain`（从弃牌堆/牌堆取回）/ `transfer`（判定区转移）/ `resolve`（延时牌结算）/ `reshuffle`（洗牌——弃牌堆→牌堆是真实位置变化，走 CardMove）

## 实施步骤

- [ ] 1. 骨架：`CardLocation` / `CardMoveReason` / `CardMoveEventData` / `EventType.CardMove`，位置索引 `getCardArea`（createGame 建立、moveCards 更新），新建 async `moveCards`（from 派生，底层保留现有数组级实现为内部函数）
- [ ] 2. 迁移简单原语：`discardCards` / `playFromHand` / `giveCards` / `takeFromDiscard` → moveCards
- [ ] 3. 装备路径：`equipCard` 拆两次 moveCards（replace + equip，两个事件）；麒麟弓、借刀杀人手写路径收口
- [ ] 4. 区域取牌：过河拆桥 / 顺手牵羊 / 寒冰剑 / 反馈 合并为 select（查询）+ move；`takeCardFromAreas` 决定去留
- [ ] 5. 判定区：延时牌置入、判定结算、闪电转移 → moveCards
- [ ] 6. 摸牌/判定/洗牌：`peekTop(n)` + moveCards；洗牌 = `moveCards(to=deck, reason='reshuffle')`
- [ ] 7. 查询层：`findInDeck` / `findAllInDeckAndDiscard` / `putTop` / `putBottom` 落地（观星/五谷真版的前置）
- [ ] 8. 连营/枭姬：作为 CardMove 第一个消费者（`cardMove.after`，from.zone 判断）
- [ ] 9. 验证：全量测试保持绿色；再评估处理区（TODO #10）与事件历史（TODO #7）

每批迁移保持全量测试绿色。

## 待确认细节

- [x] A. 一次移动多张牌：弃置多张 = 一条 CardMove（cards 多张）；装备顶掉 = 两条独立 CardMove（replace + equip，先 replace 后 equip）——**不接受一次事件多条移动**（颗粒度应由调用方/父事件控制）
- [ ] B. 0 张移动：不发事件，返回空数组
- [ ] C. `takeCardFromAreas` 去留：倾向删除，统一走 select + move
- [x] D. 洗牌走 CardMove（弃牌堆→牌堆是位置变化）
- [ ] E. 判定牌去向：暂保持"判定牌直接进弃牌堆"（judge = deck→discardPile），处理区就绪后再改
- [ ] F. processing zone：现在不加，需要时再加（加一个 zone 值成本极低）
- [ ] G. 所有移动原语同步 → async 的波及范围（heroes/cards/gameFlow 调用点全加 await）
- [ ] H. 位置索引的维护边界：getCardArea 只在 moveCards 内更新，不允许外部直接改区域数组？（防御性 vs 侵入性）
