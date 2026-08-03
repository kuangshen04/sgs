// ============================================================
// 三国杀最小原型 — 出牌选择（两阶段）
//
// Phase 1: computeCardOptions → CardDecider → validate  （选牌）
// Phase 2: computeTargetOptions → TargetDecider → validate（选目标）
//
// choose() 串联两阶段，返回 { card, targets } 或 null。
// ============================================================

import type { Card, Player } from './types.js';
import { CardType } from './types.js';
import { cardRegistry } from './game.js';
import type { CardDef, Game } from './game.js';

// ============================================================
// Phase 1: 选牌
// ============================================================

/** 一张可选的卡牌 */
export interface CardOption {
  card: Card;
  def: CardDef;
}

/** 选牌结果 */
export interface CardSelection {
  cardId: number;
}

/** 选牌决策函数 */
export type CardDecider = (
  options: CardOption[],
  player: Player,
  shaUsed: boolean,
) => CardSelection | null;

// ---- Phase 2: 选目标 ----

/** 一个可选的目标玩家 */
export interface TargetOption {
  player: Player;
  index: number; // game.state.players 中的索引
}

/** 选目标结果 */
export interface TargetSelection {
  targetIndices: number[];
}

/** 选目标决策函数 */
export type TargetDecider = (
  options: TargetOption[],
  card: Card,
  player: Player,
) => TargetSelection | null;

// ---- choose() 入参 ----

export interface ChooseParams {
  player: Player;
  shaUsed: boolean;
  cardDecide?: CardDecider;
  targetDecide?: TargetDecider;
}

// ---- 全局注入（挂在 Game.deciders 上） ----

/** 出牌策略集合：可全局注入到游戏实例，choose() 优先使用调用参数 */
export interface Deciders {
  cardDecide?: CardDecider;
  targetDecide?: TargetDecider;
}

// ============================================================
// Phase 1: 选牌（引擎层 — 规则）
// ============================================================

/** 计算可选卡牌（已按 usePriority 降序排列） */
export function computeCardOptions(
  game: Game,
  player: Player,
  shaUsed: boolean,
): CardOption[] {
  const allPlayers = game.state.players;

  return player.hand
    .map((card) => ({ card, def: cardRegistry.get(card.type) }))
    .filter(({ def }) => def && def.ai.canUse(player, allPlayers, shaUsed))
    .map(({ card, def }) => ({ card, def: def! }))
    .sort((a, b) => b.def.ai.usePriority - a.def.ai.usePriority);
}

function defaultCardDecider(options: CardOption[]): CardSelection | null {
  if (options.length === 0) return null;
  return { cardId: options[0].card.id };
}

function validateCardSelection(
  sel: CardSelection,
  options: CardOption[],
): Card | null {
  const opt = options.find((o) => o.card.id === sel.cardId);
  return opt ? opt.card : null;
}

// ============================================================
// Phase 2: 选目标（引擎层 — 规则）
// ============================================================

/** 计算某张牌的合法目标 */
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

function defaultTargetDecider(
  options: TargetOption[],
  card: Card,
  player: Player,
): TargetSelection | null {
  if (options.length === 0) return null;
  const def = cardRegistry.get(card.type)!;
  const tc = def.targetCount;

  let selected: TargetOption[];
  if (tc === 'all') {
    selected = options;
  } else {
    // 优先自己（桃/无中生有），否则取前 N 个
    const self = options.find((t) => t.player === player);
    selected = self ? [self] : options.slice(0, tc);
  }

  return { targetIndices: selected.map((t) => t.index) };
}

function validateTargetSelection(
  game: Game,
  sel: TargetSelection,
  options: TargetOption[],
  card: Card,
): Player[] | null {
  const def = cardRegistry.get(card.type);
  if (!def) return null;

  const targets = sel.targetIndices.map((i) => game.state.players[i]);

  // 目标必须在合法范围内
  const validIndices = new Set(options.map((o) => o.index));
  if (!sel.targetIndices.every((i) => validIndices.has(i))) return null;

  // targetCount 约束
  if (def.targetCount === 'all') {
    if (targets.length !== options.length) return null;
  } else if (targets.length !== def.targetCount) {
    return null;
  }

  return targets;
}

// ============================================================
// findResponse — 响应牌询问（只读）
//
// 出牌阶段外的"要一张指定类型的牌"：闪、决斗打出的杀、南蛮打出的杀、
// 濒死的桃、无懈可击共用同一个 ask。只查找不消耗，
// 打出（playFromHand）还是使用（useCard）由调用方决定。
// ============================================================

/** 询问一个角色是否用指定类型的牌响应。只读，不改变状态；无牌返回 null。 */
export function findResponse(player: Player, type: CardType): Card | null {
  return player.hand.find((c) => c.type === type) ?? null;
}

// ============================================================
// choose() — 串联两阶段
// ============================================================

/**
 * 一次出牌选择：
 *   Phase 1: compute → decide → validate（选牌）
 *   Phase 2: compute → decide → validate（选目标）
 * 返回 { card, targets } 或 null（不出牌）。
 */
export async function choose(
  game: Game,
  params: ChooseParams,
): Promise<{ card: Card; targets: Player[] } | null> {
  const { player, shaUsed, cardDecide, targetDecide } = params;
  // 优先级：调用参数 > 全局注入 > 默认 AI
  const cd = cardDecide ?? game.deciders.cardDecide ?? defaultCardDecider;
  const td = targetDecide ?? game.deciders.targetDecide ?? defaultTargetDecider;

  // Phase 1: 选牌
  const cardOptions = computeCardOptions(game, player, shaUsed);
  const cardSel = cd(cardOptions, player, shaUsed);
  if (!cardSel) return null;
  const card = validateCardSelection(cardSel, cardOptions);
  if (!card) return null;

  // Phase 2: 选目标
  const targetOptions = computeTargetOptions(game, card, player);
  const targetSel = td(targetOptions, card, player);
  if (!targetSel) return null;
  const targets = validateTargetSelection(game, targetSel, targetOptions, card);
  if (!targets) return null;

  return { card, targets };
}
