// ============================================================
// 三国杀最小原型 — 出牌选择
// 流程（合并实现）：规则可选牌 → AI 选牌 → 规则合法目标 → AI 选目标。
// AI 决策点是函数内唯一决策处；真人/前端接入时在此注入。
// 规则层与 AI 层保持语义分离：canUse/targetFilter 是规则，选牌/选目标是 AI。
// ============================================================

import type { Card, Player } from './types.js';
import { CardType } from './types.js';
import { cardRegistry } from './cardRegistry.js';
import type { CardDef } from './cardRegistry.js';
import type { Game } from './game.js';

// ============================================================
// 规则层 — 可选集计算（不含 AI 判断）
// ============================================================

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
  return player.hand
    .map((card) => ({ card, def: cardRegistry.get(card.type) }))
    .filter(({ def }) => def && def.canUse(player, allPlayers, shaUsed))
    .map(({ card, def }) => ({ card, def: def! }));
}

/** 计算某张牌的合法目标（规则：targetFilter + 距离/免疫等） */
export function computeTargetOptions(
  game: Game,
  card: Card,
  player: Player,
): TargetOption[] {
  const def = cardRegistry.get(card.type);
  if (!def) return [];
  return def.targetFilter(player, game.state.players)
    .map((t) => ({ player: t, index: game.state.players.indexOf(t) }));
}

// ============================================================
// 出牌选择
// ============================================================

/**
 * 一次出牌选择：先选一张可用牌，再按该牌选合法目标。
 * 返回 { card, targets } 或 null（不出牌）。
 */
export async function chooseCardAndTargets(
  game: Game,
  player: Player,
  shaUsed: boolean,
): Promise<{ card: Card; targets: Player[] } | null> {
  // ---- 规则层：可用牌 ----
  const cardOptions = computeCardOptions(game, player, shaUsed);
  if (cardOptions.length === 0) return null;

  // ---- AI 决策：选牌 ----
  // 当前写死：过滤 AI 不愿出的牌，按 usePriority 降序选第一张。
  // 真人/前端接入时，此决策点改为注入接口。
  const preferred = cardOptions
    .filter((o) => o.def.ai.shouldUse(player, shaUsed))
    .sort((a, b) => b.def.ai.usePriority - a.def.ai.usePriority);
  const card = preferred[0]?.card;
  if (!card) return null;

  // ---- 规则层：该牌的合法目标 ----
  const targetOptions = computeTargetOptions(game, card, player);
  if (targetOptions.length === 0) return null;

  // ---- AI 决策：选目标 ----
  // 当前写死：targetCount=all 全选；否则优先自己（桃/无中生有），再取前 N 个。
  // 真人/前端接入时，此决策点改为注入接口。
  const tc = cardRegistry.get(card.type)!.targetCount;
  let targets: Player[];
  if (tc === 'all') {
    targets = targetOptions.map((t) => t.player);
  } else {
    const self = targetOptions.find((t) => t.player === player);
    targets = self ? [self.player] : targetOptions.slice(0, tc).map((t) => t.player);
  }

  return { card, targets };
}

// ============================================================
// findResponse — 响应牌询问（只读）
//
// 出牌阶段外的"要一张指定类型的牌"：闪、决斗打出的杀、南蛮打出的杀、
// 濒死的桃、无懈可击共用同一个 ask。只查找不消耗，
// 打出（playFromHand）还是使用（useCard）由调用方决定。
// 注：ask 家族就绪后（askForCard）收编为默认行为，TODO #12 B 阶段替换调用点。
// ============================================================

/** 询问一个角色是否用指定类型的牌响应。只读，不改变状态；无牌返回 null。 */
export function findResponse(player: Player, type: CardType): Card | null {
  return player.hand.find((c) => c.type === type) ?? null;
}
