// ============================================================
// 决策层 · 规则面 — 规则可选集（"什么可选"）
//
// 只用规则计算候选：`canUse` / `targetFilter` + 距离/免疫等（各牌定义自带的规则）
// + 延时锦囊的通用限制（判定区同名 UC 只能存在 1 张，读 UC，ADR-0003）。
// **不含 AI 判断**（`shouldUse`/优先级在窗口层），也不执行任何动作（ADR-0010 红线 3）。
//
// 依赖：规则集（`game.ruleSet` 的卡牌定义）与位置（`canPlaceDelayOn`）——
// 这正是 ADR-0010 里 `decision.rules` 这一层该有的边。
// ============================================================

import type { Card, Player, UsedCard } from '../types.js';
import { CardTag } from '../types.js';
import type { CardDef } from '../rules/cardDef.js';
import { canPlaceDelayOn } from '../position/usedCardActions.js';
import type { Game } from '../game.js';

/** 一张可选的卡牌 */
export interface CardOption {
  card: Card;
  def: CardDef;
}

/** 一个可选的目标玩家 */
export interface TargetOption {
  player: Player;
  index: number; // game.state.players 中的索引
}

/** 计算可用牌（规则：canUse；AI 的 shouldUse/优先级在出牌选择流程内） */
export function computeCardOptions(
  game: Game,
  player: Player,
  shaUsed: boolean,
): CardOption[] {
  const allPlayers = game.state.players;
  return player.hand.cards
    .map((card) => ({ card, def: game.ruleSet.cards.get(card.type) }))
    .filter(({ def }) => def && def.canUse(game, player, allPlayers, shaUsed))
    .map(({ card, def }) => ({ card, def: def! }));
}

/**
 * 计算某张效果牌（可能是虚拟牌）的合法目标（规则：targetFilter + 距离/免疫等）。
 * 延时锦囊另加一条通用限制：目标必须**可以放置该延时牌**（判定区同名 UC 只能存在 1 张；
 * 读规则读 UC，见 adr/0003）。
 */
export function computeTargetOptions(
  game: Game,
  card: UsedCard,
  player: Player,
): TargetOption[] {
  const def = game.ruleSet.cards.get(card.type);
  if (!def) return [];
  let targets = def.targetFilter(game, player, game.state.players);
  if (def.tags.includes(CardTag.Delay)) {
    targets = targets.filter((t) => canPlaceDelayOn(game, card, t));
  }
  return targets.map((t) => ({ player: t, index: game.state.players.indexOf(t) }));
}
