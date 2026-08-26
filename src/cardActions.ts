// ============================================================
// 三国杀最小原型 — 牌的操作（摸牌/出牌/弃置/交给）
// ============================================================

import { Card, CardTag, Player } from './types.js';
import type { CardLocation, CardMoveReason, UsedCard } from './types.js';
import type { PlayerEquipment } from './types.js';
import { EventType, GameEvent } from './events/index.js';
import type { CardMoveEventData, DrawEventData, JudgeEventData, TargetingEventData, UseCardEventData } from './events/index.js';
import { cardRegistry, cardEmoji, displayNumber, shuffle, asUsedCard } from './cardRegistry.js';
import type { Game } from './game.js';

// ============================================================
// 牌堆操作（查询层 + 洗牌；摸牌/判定走统一 moveCards）
// ============================================================

/** 查看牌堆顶 n 张（不移动）；不足 n 张返回全部 */
export function peekTop(game: Game, n: number): Card[] {
  const deck = game.state.deck;
  return deck.slice(Math.max(0, deck.length - n));
}

/**
 * 洗牌：把弃牌堆全部洗乱并移入牌堆（一次 reshuffle 移动事件）。
 * 牌堆为空时由摸牌/判定自动调用，也可主动触发。
 */
export async function reshuffle(game: Game): Promise<void> {
  const cards = shuffle([...game.state.discardPile]);
  if (cards.length === 0) return;
  await moveCards(game, {
    to: { zone: 'deck' }, cards, reason: 'reshuffle',
  });
  console.log(`  🔄 弃牌堆 ${cards.length} 张重新洗入牌堆`);
}

/**
 * 判定：亮出牌堆顶一张牌（牌堆空则洗回弃牌堆）作为判定事件。
 * 判定牌生效后进入弃牌堆（天妒从这里拿），返回最终判定牌供检查条件。
 */
export async function judge(game: Game, player: Player): Promise<Card> {
  const event = await new GameEvent<JudgeEventData>(EventType.Judge, { player }, game)
    .execute(async (event) => {
      if (game.state.deck.length === 0) {
        if (game.state.discardPile.length === 0) {
          throw new Error('判定失败：牌堆和弃牌堆都为空');
        }
        await reshuffle(game);
      }
      const card = peekTop(game, 1)[0];
      if (!card) {
        throw new Error('判定失败：牌堆和弃牌堆都为空');
      }
      // 判定牌进入处理区（牌堆顶 → 处理区）
      await moveCards(game, {
        to: { zone: 'processing' }, cards: [card], reason: 'judge',
      });
      event.data.card = card;
      console.log(
        `  ⚡${player.name} 判定：亮出 ${cardEmoji(card.type)} (${card.suit}${displayNumber(card.number)})`,
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
        if (game.state.deck.length === 0) {
          if (game.state.discardPile.length === 0) break; // 两堆都空
          await reshuffle(game);
        }
        const cards = peekTop(game, remaining);
        if (cards.length === 0) break;
        await moveCards(game, {
          to: { player, zone: 'hand' },
          cards,
          reason: 'draw',
          mover: player,
        });
        remaining -= cards.length;
      }
    });
}

// ============================================================
// 统一移动模型（位置查询 + moveCards）
// ============================================================

/**
 * 查询一张牌当前所在位置；不在任何位置返回 null。
 * 当前实现为实时扫描（规模小、永远与状态一致）；
 * 将来 TODO #10 位置追踪需要性能时可换成缓存索引，API 不变。
 */
export function getCardArea(game: Game, card: Card): CardLocation | null {
  for (const player of game.state.players) {
    if (player.hand.some((c) => c.id === card.id)) return { player, zone: 'hand' };
    const eq = player.equipment;
    for (const slot of ['weapon', 'armor', 'defensiveHorse', 'offensiveHorse'] as const) {
      if (eq[slot]?.id === card.id) return { player, zone: 'equipment' };
    }
    if (player.judgment.some((c) => c.id === card.id)) return { player, zone: 'judgment' };
  }
  if (game.state.processing.some((c) => c.id === card.id)) return { zone: 'processing' };
  if (game.state.deck.some((c) => c.id === card.id)) return { zone: 'deck' };
  if (game.state.discardPile.some((c) => c.id === card.id)) return { zone: 'discardPile' };
  return null;
}

/** 从位置移除一张牌（按 id）；不在该位置返回 null */
function takeCardFromLocation(game: Game, loc: CardLocation, cardId: number): Card | null {
  if ('player' in loc) {
    const p = loc.player;
    if (loc.zone === 'hand') {
      const i = p.hand.findIndex((c) => c.id === cardId);
      if (i < 0) return null;
      return p.hand.splice(i, 1)[0];
    }
    if (loc.zone === 'equipment') {
      const eq = p.equipment;
      for (const slot of ['weapon', 'armor', 'defensiveHorse', 'offensiveHorse'] as const) {
        if (eq[slot]?.id === cardId) {
          const card = eq[slot]!;
          eq[slot] = undefined;
          return card;
        }
      }
      return null;
    }
    const i = p.judgment.findIndex((c) => c.id === cardId);
    if (i < 0) return null;
    return p.judgment.splice(i, 1)[0];
  }
  if (loc.zone === 'processing') {
    const i = game.state.processing.findIndex((c) => c.id === cardId);
    if (i < 0) return null;
    return game.state.processing.splice(i, 1)[0];
  }
  const pile = loc.zone === 'deck' ? game.state.deck : game.state.discardPile;
  const i = pile.findIndex((c) => c.id === cardId);
  if (i < 0) return null;
  return pile.splice(i, 1)[0];
}

/** 把一张牌放入位置（牌堆按 toPosition 决定顶/底，默认顶） */
function putCardToLocation(
  game: Game, loc: CardLocation, card: Card, toPosition?: 'top' | 'bottom',
): void {
  if ('player' in loc) {
    const p = loc.player;
    if (loc.zone === 'hand') p.hand.push(card);
    else if (loc.zone === 'equipment') p.equipment[equipSlotOf(card)] = card;
    else p.judgment.push(card);
    return;
  }
  if (loc.zone === 'processing') {
    game.state.processing.push(card);
    return;
  }
  if (loc.zone === 'deck') {
    if (toPosition === 'bottom') game.state.deck.unshift(card);
    else game.state.deck.push(card);
    return;
  }
  game.state.discardPile.push(card);
}

/** 一次移动的规格：调用方只给终点 + 已知牌 + reason，来源由引擎派生 */
export interface CardMoveSpec {
  to: CardLocation;
  cards: Card[];
  reason: CardMoveReason;
  mover?: Player;
  /** 仅终点为牌堆时使用（临时，见 移动模型重构TODO） */
  toPosition?: 'top' | 'bottom';
}

/**
 * 统一移动原语：把一组已知牌移到终点位置，产生一次 CardMove 事件。
 * - 来源区域由引擎对每张牌实时查询（from 派生）
 * - 不在任何位置的牌自动跳过（部分成功语义）
 * - 空移动不发事件
 * - before 可 prevent（移动取消）；物理移动在事件 content 中完成
 * - 返回实际移动的牌
 */
export async function moveCards(game: Game, spec: CardMoveSpec): Promise<Card[]> {
  if (spec.cards.length === 0) return [];

  // from 派生：实时查询每张牌的位置
  const entries: { card: Card; from: CardLocation }[] = [];
  for (const card of spec.cards) {
    const from = getCardArea(game, card);
    if (from) entries.push({ card, from });
  }
  if (entries.length === 0) return [];

  const data: CardMoveEventData = {
    cards: entries.map((e) => e.card),
    fromAreas: entries.map((e) => e.from),
    to: spec.to,
    reason: spec.reason,
    mover: spec.mover,
    toPosition: spec.toPosition,
  };

  let moved: Card[] = [];
  await new GameEvent<CardMoveEventData>(EventType.CardMove, data, game)
    .execute(async (event) => {
      moved = [];
      for (let i = 0; i < event.data.cards.length; i++) {
        const card = event.data.cards[i];
        takeCardFromLocation(game, event.data.fromAreas[i], card.id);
        putCardToLocation(game, event.data.to, card, event.data.toPosition);
        moved.push(card);
      }
    });
  return moved;
}

// ============================================================
// 语义化移动封装（建立在统一 moveCards 之上）
// ============================================================

/**
 * 弃置：把一组牌从手牌移入弃牌堆，返回实际移除的牌（供调用方记录）。
 * 打出（playFromHand）/使用消耗（useCard）/弃牌阶段（doDiscard）/制衡
 * 共用这一个移动原语；不在该玩家手牌的牌自动跳过。
 */
export async function discardCards(game: Game, player: Player, cards: Card[]): Promise<Card[]> {
  const inHand = cards.filter((c) => {
    const area = getCardArea(game, c);
    return !!area && 'player' in area && area.player === player && area.zone === 'hand';
  });
  return moveCards(game, {
    to: { zone: 'discardPile' }, cards: inHand, reason: 'discard',
  });
}

/** 打出：把一张牌从手牌移入弃牌堆（不产生使用事件） */
export async function playFromHand(game: Game, player: Player, card: Card): Promise<Card[]> {
  const area = getCardArea(game, card);
  if (!area || !('player' in area) || area.player !== player || area.zone !== 'hand') {
    return [];
  }
  return moveCards(game, {
    to: { zone: 'discardPile' }, cards: [card], reason: 'play',
  });
}

/** 打出：消费 UsedCard 的全部实体源牌（支持多源，如丈八蛇矛响应） */
export async function playUsedCard(game: Game, player: Player, used: UsedCard): Promise<Card[]> {
  const inHand = used.physicalCards.filter((c) => {
    const area = getCardArea(game, c);
    return !!area && 'player' in area && area.player === player && area.zone === 'hand';
  });
  return moveCards(game, {
    to: { zone: 'discardPile' }, cards: inHand, reason: 'play',
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
    const area = getCardArea(game, c);
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
  const area = getCardArea(game, card);
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
  const area = getCardArea(game, card);
  if (!area || area.zone !== 'processing') return null;
  const moved = await moveCards(game, {
    to: { player, zone: 'hand' }, cards: [card], reason: 'obtain',
  });
  return moved[0] ?? null;
}

/** 把仍在处理区的牌移入弃牌堆；已被技能移走的牌自动跳过 */
export async function settleProcessingCards(
  game: Game, cards: Card[], reason: CardMoveReason = 'discard',
): Promise<Card[]> {
  const stillProcessing = cards.filter(
    (c) => getCardArea(game, c)?.zone === 'processing',
  );
  return moveCards(game, {
    to: { zone: 'discardPile' }, cards: stillProcessing, reason,
  });
}

/** 卡牌 tag → 装备槽位 */
function equipSlotOf(card: Card): keyof PlayerEquipment {
  const def = cardRegistry.get(card.type);
  if (def?.tags.includes(CardTag.Weapon)) return 'weapon';
  if (def?.tags.includes(CardTag.Armor)) return 'armor';
  if (def?.tags.includes(CardTag.DefensiveHorse)) return 'defensiveHorse';
  return 'offensiveHorse';
}

/**
 * 装备：把牌置入对应栏位，旧装备顶掉进弃牌堆；返回被顶掉的旧装备。
 * 拆为两次独立移动（两个事件）：旧装备 equipment → discardPile（replace），
 * 新牌 hand → equipment（equip）。
 */
export async function equipCard(
  game: Game, player: Player, card: Card,
): Promise<Card | undefined> {
  const slot = equipSlotOf(card);
  const old = player.equipment[slot];
  if (old) {
    await moveCards(game, {
      to: { zone: 'discardPile' }, cards: [old], reason: 'replace',
    });
  }
  await moveCards(game, {
    to: { player, zone: 'equipment' }, cards: [card], reason: 'equip',
  });
  return old;
}

// ============================================================
// useCard — 通过 cardRegistry 分发
// ============================================================

export async function useCard(
  game: Game,
  data: Omit<UseCardEventData, 'card'> & { card: Card | UsedCard },
): Promise<GameEvent<UseCardEventData>> {
  const usedData: UseCardEventData = {
    player: data.player,
    targets: data.targets,
    marks: data.marks,
    card: asUsedCard(data.card),
  };
  return new GameEvent<UseCardEventData>(EventType.UseCard, usedData, game)
    .execute(async (event) => {
      event.data.marks = event.data.marks ?? {}; // 杀响应过程状态（无双/铁骑写入）
      const def = cardRegistry.get(event.data.card.type);
      const isDelayed = !!def?.tags.includes(CardTag.Delay);

      if (isDelayed) {
        // 延时锦囊：使用时直接置入目标判定区（无无懈窗口）
        const target = event.data.targets[0];
        if (target) {
          await moveCards(game, {
            to: { player: target, zone: 'judgment' },
            cards: event.data.card.physicalCards,
            reason: 'use',
          });
          console.log(
            `  ${event.data.player.name} 使用了 ${cardEmoji(event.data.card.type)}` +
            `(${event.data.card.suit}${displayNumber(event.data.card.number)})，` +
            `置入 ${target.name} 的判定区`,
          );
        }
        return;
      }

      const isEquip = !!def?.tags.includes(CardTag.Equip);

      if (isEquip) {
        // 装备：置入对应栏位（顶掉旧装备），无响应窗口
        const target = event.data.targets[0] ?? event.data.player;
        const replaced = await equipCard(game, target, event.data.card.physicalCards[0]);
        console.log(
          `  ${event.data.player.name} 装备了 ${cardEmoji(event.data.card.type)}` +
          `(${event.data.card.suit}${displayNumber(event.data.card.number)})` +
          (replaced ? `，顶掉 ${cardEmoji(replaced.type)}` : ''),
        );
        return;
      }

      // 使用的牌进入处理区（结算中位置），结算完成后统一回弃牌堆
      await moveCards(game, {
        to: { zone: 'processing' },
        cards: event.data.card.physicalCards,
        reason: 'use',
      });

      try {
        // 逐 target 判定（无懈可击等响应在这里）
        let shouldExecute = true;

        if (event.data.targets.length > 0) {
          const remaining: Player[] = [];
          for (const target of event.data.targets) {
            const targetingEvent = await new GameEvent<TargetingEventData>(
              EventType.Targeting,
              { user: event.data.player, card: event.data.card, target },
              game,
            ).execute(async () => {
              // content 为空 — targeting 纯粹是 trigger 检查点
            });

            if (!targetingEvent.isPrevented()) {
              // 读事件内的 target：流离等技能可在 targeting.before 中转移目标
              remaining.push(targetingEvent.data.target);
            } else {
              console.log(`  🚫${target.name} 被指定为目标的效果已被抵消`);
            }
          }
          if (remaining.length === 0) {
            shouldExecute = false;
          } else {
            event.data.targets = remaining;
          }
        } else {
          // 无目标牌（如无懈可击）：单次 targeting，target = 使用者自己
          // 这是唯一的响应窗口，无懈可击可以被反无懈
          const targetingEvent = await new GameEvent<TargetingEventData>(
            EventType.Targeting,
            { user: event.data.player, card: event.data.card, target: event.data.player },
            game,
          ).execute(async () => {});

          if (targetingEvent.isPrevented()) {
            console.log(`  🚫${event.data.player.name} 的 ${cardRegistry.get(event.data.card.type)?.name ?? '牌'} 效果已被抵消`);
            shouldExecute = false;
          }
        }

        if (shouldExecute && def) {
          await def.content(game, event.data, event);
        }
      } finally {
        await settleProcessingCards(game, event.data.card.physicalCards);
      }
    });
}
