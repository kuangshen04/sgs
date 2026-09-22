// ============================================================
// 实体牌层 — 牌的操作（摸牌/判定/弃置/交给/取回）
//
// 本层只做**选择 + 移动**：不认识 UsedCard（两层边界见adr/0003）。
//   - 统一移动原语：公开入口 moveCards（带终点守卫）+ 内部通道 movePhysical（见 move.ts）；
//   - **装备槽 / 判定区是驻留区**：公开 moveCards 到这两个终点硬报错，只能经 UC 层进入；
//   - **处理区允许无 UC 的实体牌**（判定牌 / 观星亮出 / 鬼才替换牌），仍是合法物理终点；
//   - 实体牌离开驻留区时由 move.ts 通知 UC 层钩子（破坏倒查在 position/usedCardActions.ts）。
//
// 使用牌流程 useCard 属 UC 层业务（flow/useCard.ts）；装备操作 equipCard、打出 playUsedCard
// 在 usedCardActions.ts。
// ============================================================

import { Card, Player } from '../types.js';
import type { CardLocation, CardMoveReason } from '../types.js';
import { cardEmoji, displayNumber } from '../rules/cardFace.js';
import { shuffle } from '../random.js';
import { EventType, GameEvent } from '../events/index.js';
import type { DrawEventData, JudgeEventData } from '../events/index.js';
import { movePhysical } from './move.js';
import type { Game } from '../game.js';

export { getCardArea } from './move.js';

// ============================================================
// 牌堆操作（查询层 + 洗牌；摸牌/判定走统一移动）
// ============================================================

/** 查看牌堆顶 n 张（不移动）；不足 n 张返回全部（顶 = 数组尾） */
export function peekTop(game: Game, n: number): Card[] {
  const deck = game.state.deck.cards;
  return deck.slice(Math.max(0, deck.length - n));
}

/** 从牌堆顶取 count 张移入目标位置（牌堆空则先洗入弃牌堆）；不足返回全部 */
export async function takeTop(
  game: Game,
  count: number,
  to: CardLocation,
  reason: CardMoveReason,
  mover?: Player,
): Promise<Card[]> {
  if (game.state.deck.cards.length === 0) await reshuffle(game);
  const cards = peekTop(game, count);
  return moveCards(game, { to, cards, reason, mover });
}

/** 从牌堆底（索引 0 侧）取 count 张移入目标位置（牌堆空则先洗入弃牌堆）；不足返回全部 */
export async function takeBottom(
  game: Game,
  count: number,
  to: CardLocation,
  reason: CardMoveReason,
  mover?: Player,
): Promise<Card[]> {
  if (game.state.deck.cards.length === 0) await reshuffle(game);
  const cards = game.state.deck.cards.slice(0, count);
  return moveCards(game, { to, cards, reason, mover });
}

/**
 * 把一组牌放到牌堆顶（cards[0] 为最顶一张）。
 * 顶/底 = 牌堆取放策略，不走 moveCards 公共签名（toPosition 已剥离）。
 */
export async function putTop(
  game: Game,
  cards: Card[],
  reason: CardMoveReason = 'reshuffle',
): Promise<Card[]> {
  return movePhysical(game, {
    cards: [...cards].reverse(), to: { zone: 'deck' }, reason,
  });
}

/**
 * 把一组牌放到牌堆底（cards[0] 为底块中最靠上的一张，cards[last] 为最底）。
 */
export async function putBottom(
  game: Game,
  cards: Card[],
  reason: CardMoveReason = 'reshuffle',
): Promise<Card[]> {
  return movePhysical(game, {
    cards, to: { zone: 'deck' }, reason, atBottom: true,
  });
}

/** 从牌堆顶往下找第一张符合条件；没有返回 null */
export function findInDeck(game: Game, predicate: (card: Card) => boolean): Card | null {
  const deck = game.state.deck.cards;
  for (let i = deck.length - 1; i >= 0; i--) {
    if (predicate(deck[i])) return deck[i];
  }
  return null;
}

/** 牌堆 + 弃牌堆中所有符合条件的牌（牌堆先，弃牌堆后） */
export function findInDeckAndDiscard(game: Game, predicate: (card: Card) => boolean): Card[] {
  const deck = [...game.state.deck.cards].reverse();
  return [...deck.filter(predicate), ...game.state.discardPile.cards.filter(predicate)];
}

/**
 * 洗牌：把弃牌堆全部洗乱并移入牌堆（一次 reshuffle 移动事件）。
 * 牌堆为空时由摸牌/判定自动调用，也可主动触发。
 */
export async function reshuffle(game: Game): Promise<void> {
  const cards = shuffle([...game.state.discardPile.cards]);
  if (cards.length === 0) return;
  await movePhysical(game, { cards, to: { zone: 'deck' }, reason: 'reshuffle' });
  console.log(`  🔄 弃牌堆 ${cards.length} 张重新洗入牌堆`);
}

/**
 * 判定：亮出牌堆顶一张牌（牌堆空则洗回弃牌堆）作为判定事件。
 * **判定牌不是 UC**（不可转化）：它只是被亮出的实体牌，经实体牌处理区流转
 * （天妒从这里拿；鬼才替换牌同理）。
 */
export async function judge(game: Game, player: Player): Promise<Card> {
  const event = await new GameEvent<JudgeEventData>(EventType.Judge, { player }, game)
    .execute(async (event) => {
      const moved = await takeTop(game, 1, { zone: 'processing' }, 'judge');
      const card = moved[0];
      if (!card) throw new Error('判定失败：牌堆和弃牌堆都为空');
      event.data.card = card;
      console.log(
        `  ⚡${player.name} 判定：亮出 ${cardEmoji(game, card.type)} (${card.suit}${displayNumber(card.number)})`,
      );
      // 判定牌生效前：鬼才等响应技能可替换判定牌
      await game.triggerSystem.trigger(`${EventType.Judge}.judging`, event);
    });
  // judge.after（天妒等）已执行完毕；把仍在处理区的最终判定牌结算进弃牌堆
  await settleProcessingCards(game, [event.data.card!], 'judge');
  return event.data.card!;
}

export async function drawCards(
  game: Game,
  data: DrawEventData,
): Promise<GameEvent<DrawEventData>> {
  return new GameEvent<DrawEventData>(EventType.Draw, data, game)
    .execute(async (event) => {
      const player = event.data.target;
      let remaining = event.data.count;
      while (remaining > 0) {
        const cards = await takeTop(game, remaining, { player, zone: 'hand' }, 'draw', player);
        if (cards.length === 0) break; // 两堆都空
        remaining -= cards.length;
      }
    });
}

// ============================================================
// 统一移动模型（公开入口 + 驻留区终点守卫）
// ============================================================

/** 一次移动的规格：调用方只给终点 + 已知牌 + reason，来源由引擎派生（索引）。 */
export interface CardMoveSpec {
  to: CardLocation;
  cards: Card[];
  reason: CardMoveReason;
  mover?: Player;
}

/**
 * 统一移动原语（实体牌层唯一公开入口）：把一组已知牌移到终点位置，产生一次 CardMove 事件。
 * - 来源区域由引擎对每张牌经集中索引派生（from 派生）
 * - 不在任何位置的牌自动跳过（部分成功语义）；空移动不发事件
 * - **装备槽 / 判定区是驻留区**：实体牌不能直接进入（只能经 UC 层），此处硬报错
 */
export async function moveCards(game: Game, spec: CardMoveSpec): Promise<Card[]> {
  if ('player' in spec.to && (spec.to.zone === 'equipment' || spec.to.zone === 'judgment')) {
    throw new Error(
      `moveCards: ${spec.to.zone === 'equipment' ? '装备槽' : '判定区'}是驻留区，` +
      '实体牌只能经 UC 层进入（usedCardActions.enterUsedCard / moveUsedCard）',
    );
  }
  return movePhysical(game, spec);
}

// ============================================================
// 语义化移动封装（建立在统一移动原语之上）
// ============================================================

/**
 * 弃置：把一组牌从手牌移入弃牌堆，返回实际移除的牌（供调用方记录）。
 * 弃牌阶段（doDiscard）/制衡/主动技 cost 共用这一个移动原语；
 * 不在该玩家手牌的牌自动跳过。
 */
export async function discardCards(game: Game, player: Player, cards: Card[]): Promise<Card[]> {
  const inHand = cards.filter((c) => {
    const area = game.cardIndex.get(c.id);
    return !!area && 'player' in area && area.player === player && area.zone === 'hand';
  });
  return moveCards(game, {
    to: { zone: 'discardPile' }, cards: inHand, reason: 'discard',
  });
}

/**
 * 交给：把一组牌从 from 的手牌移入 to 的手牌，返回实际移走的牌。
 * 用于仁德/反间/顺手牵羊这类"获得/交给"移动（手牌区 ↔ 手牌区）。
 */
export async function giveCards(
  game: Game, from: Player, to: Player, cards: Card[],
): Promise<Card[]> {
  const inHand = cards.filter((c) => {
    const area = game.cardIndex.get(c.id);
    return !!area && 'player' in area && area.player === from && area.zone === 'hand';
  });
  return moveCards(game, {
    to: { player: to, zone: 'hand' }, cards: inHand, reason: 'give',
  });
}

/** 从弃牌堆按 id 取回一张牌到手牌；不在弃牌堆返回 null */
export async function takeFromDiscard(
  game: Game, player: Player, card: Card,
): Promise<Card | null> {
  const area = game.cardIndex.get(card.id);
  if (!area || area.zone !== 'discardPile') return null;
  const moved = await moveCards(game, {
    to: { player, zone: 'hand' }, cards: [card], reason: 'obtain',
  });
  return moved[0] ?? null;
}

/** 从处理区按 id 取回一张牌到手牌；不在处理区返回 null */
export async function takeFromProcessing(
  game: Game, player: Player, card: Card,
): Promise<Card | null> {
  const area = game.cardIndex.get(card.id);
  if (!area || area.zone !== 'processing') return null;
  const moved = await moveCards(game, {
    to: { player, zone: 'hand' }, cards: [card], reason: 'obtain',
  });
  return moved[0] ?? null;
}

/** 把仍在处理区的牌移入弃牌堆；已被技能移走的牌自动跳过（判定牌这类**无 UC** 的牌走这里） */
async function settleProcessingCards(
  game: Game, cards: Card[], reason: CardMoveReason = 'discard',
): Promise<Card[]> {
  const stillProcessing = cards.filter(
    (c) => game.cardIndex.get(c.id)?.zone === 'processing',
  );
  return moveCards(game, {
    to: { zone: 'discardPile' }, cards: stillProcessing, reason,
  });
}
