// ============================================================
// 三国杀最小原型 — 牌的操作（摸牌/出牌/弃置/交给）
// ============================================================

import { Card, Player } from './types.js';
import { EventType, GameEvent } from './events/index.js';
import type { DrawEventData, TargetingEventData, UseCardEventData } from './events/index.js';
import { cardRegistry, shuffle } from './cardRegistry.js';
import type { Game } from './game.js';

// ============================================================
// 摸牌
// ============================================================

/** 从牌堆摸牌（牌堆空时自动洗入弃牌堆） */
export function drawCardsFromDeck(
  player: Player, deck: Card[], discardPile: Card[], count: number,
): void {
  for (let i = 0; i < count; i++) {
    if (deck.length === 0) {
      if (discardPile.length === 0) {
        console.log('  ⚠️ 牌堆和弃牌堆都已空，无法摸牌');
        return;
      }
      const reshuffled = shuffle(discardPile);
      deck.push(...reshuffled);
      discardPile.length = 0;
      console.log('  🔄 弃牌堆重新洗入牌堆');
    }
    player.hand.push(deck.pop()!);
  }
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
 * 弃置：把一组牌从手牌移入弃牌堆，返回实际移除的牌（供调用方记录）。
 * 打出（playFromHand）/使用消耗（useCard）/弃牌阶段（doDiscard）/制衡
 * 共用这一个移动原语；不在手牌的牌自动跳过。
 */
export function discardCards(game: Game, player: Player, cards: Card[]): Card[] {
  const ids = new Set(cards.map((c) => c.id));
  const removed = player.hand.filter((c) => ids.has(c.id));
  player.hand = player.hand.filter((c) => !ids.has(c.id));
  game.state.discardPile.push(...removed);
  return removed;
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
  const ids = new Set(cards.map((c) => c.id));
  const moved = from.hand.filter((c) => ids.has(c.id));
  from.hand = from.hand.filter((c) => !ids.has(c.id));
  to.hand.push(...moved);
  return moved;
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
