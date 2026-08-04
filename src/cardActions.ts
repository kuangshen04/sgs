// ============================================================
// 三国杀最小原型 — 牌的操作（摸牌/出牌/弃置/交给）
// ============================================================

import { Card, Player } from './types.js';
import { EventType, GameEvent, triggerSystem } from './events/index.js';
import type { DrawEventData, JudgeEventData, TargetingEventData, UseCardEventData } from './events/index.js';
import { cardRegistry, cardEmoji, displayNumber, shuffle } from './cardRegistry.js';
import type { Game } from './game.js';

// ============================================================
// 摸牌
// ============================================================

/** 牌堆为空时把弃牌堆洗回牌堆；返回牌堆是否仍有牌 */
function refillDeck(deck: Card[], discardPile: Card[]): boolean {
  if (deck.length > 0) return true;
  if (discardPile.length === 0) return false;
  deck.push(...shuffle(discardPile));
  discardPile.length = 0;
  console.log('  🔄 弃牌堆重新洗入牌堆');
  return true;
}

/** 从牌堆摸牌（牌堆空时自动洗入弃牌堆） */
export function drawCardsFromDeck(
  player: Player, deck: Card[], discardPile: Card[], count: number,
): void {
  for (let i = 0; i < count; i++) {
    if (!refillDeck(deck, discardPile)) {
      console.log('  ⚠️ 牌堆和弃牌堆都已空，无法摸牌');
      return;
    }
    player.hand.push(deck.pop()!);
  }
}

/**
 * 判定：亮出牌堆顶一张牌（牌堆空则洗回弃牌堆）作为判定事件。
 * 判定牌生效后进入弃牌堆（天妒从这里拿），返回最终判定牌供检查条件。
 */
export async function judge(game: Game, player: Player): Promise<Card> {
  const event = await new GameEvent<JudgeEventData>(EventType.Judge, { player }, game)
    .execute(async (event) => {
      if (!refillDeck(game.state.deck, game.state.discardPile)) {
        throw new Error('判定失败：牌堆和弃牌堆都为空');
      }
      const card = game.state.deck.pop()!;
      event.data.card = card;
      game.state.discardPile.push(card);
      console.log(
        `  ⚡${player.name} 判定：亮出 ${cardEmoji(card.type)} (${card.suit}${displayNumber(card.number)})`,
      );
      // 判定牌生效前：鬼才等响应技能可替换判定牌
      await triggerSystem.trigger(`${EventType.Judge}.judging`, event);
    });
  return event.data.card!;
}

export async function drawCards(
  game: Game,
  data: DrawEventData,
): Promise<GameEvent<DrawEventData>> {
  return new GameEvent<DrawEventData>(EventType.Draw, data, game)
    .execute(async (event) => {
      drawCardsFromDeck(
        event.data.target, game.state.deck, game.state.discardPile, event.data.count,
      );
    });
}

// ============================================================
// 移动原语（手牌 → 弃牌堆 / 手牌区 ↔ 手牌区）
// ============================================================

/**
 * 纯数组级移动：把 cards 中实际位于 from 的牌移入 to，返回实际移走的牌。
 * 底层移动原语；discardCards / giveCards 等区域语义在其上构建。
 */
export function moveCards(from: Card[], to: Card[], cards: Card[]): Card[] {
  const ids = new Set(cards.map((c) => c.id));
  const removed: Card[] = [];
  for (let i = from.length - 1; i >= 0; i--) {
    if (ids.has(from[i].id)) {
      removed.push(from[i]);
      from.splice(i, 1);
    }
  }
  removed.reverse(); // 恢复原顺序
  to.push(...removed);
  return removed;
}

/**
 * 弃置：把一组牌从手牌移入弃牌堆，返回实际移除的牌（供调用方记录）。
 * 打出（playFromHand）/使用消耗（useCard）/弃牌阶段（doDiscard）/制衡
 * 共用这一个移动原语；不在手牌的牌自动跳过。
 */
export function discardCards(game: Game, player: Player, cards: Card[]): Card[] {
  return moveCards(player.hand, game.state.discardPile, cards);
}

/** 打出：把一张牌从手牌移入弃牌堆（不产生使用事件） */
export function playFromHand(game: Game, player: Player, card: Card): void {
  discardCards(game, player, [card]);
}

/**
 * 交给：把一组牌从 from 的手牌移入 to 的手牌，返回实际移走的牌。
 * 用于仁德/反间/顺手牵羊这类"获得/交给"移动（手牌区 ↔ 手牌区）。
 */
export function giveCards(from: Player, to: Player, cards: Card[]): Card[] {
  return moveCards(from.hand, to.hand, cards);
}

// ============================================================
// useCard — 通过 cardRegistry 分发
// ============================================================

export async function useCard(
  game: Game,
  data: UseCardEventData,
): Promise<GameEvent<UseCardEventData>> {
  return new GameEvent<UseCardEventData>(EventType.UseCard, data, game)
    .execute(async (event) => {
      // 使用的牌移入弃牌堆
      discardCards(game, event.data.player, [event.data.card]);

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
            remaining.push(target);
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

      if (shouldExecute) {
        const def = cardRegistry.get(event.data.card.type);
        if (def) {
          await def.content(game, event.data, event);
        }
      }
    });
}
