// ============================================================
// 三国杀最小原型 — 决策层
// 出牌选择 + ask 家族（出牌阶段外的玩家决策点）。
// 所有决策均为"规则算可选集 → AI 决策"，AI 决策点是函数内唯一决策处；
// 真人/前端接入时在此注入。ask 只做决策不执行牌，打出/使用由调用方负责。
// 规则层与 AI 层保持语义分离：canUse/targetFilter 是规则，选牌/选目标是 AI。
// ============================================================

import type { Card, Player } from './types.js';
import { CardType } from './types.js';
import { cardRegistry } from './cardRegistry.js';
import type { CardDef } from './cardRegistry.js';
import type { Game } from './game.js';
import type { AreaName } from './areas.js';
import { equipmentCards } from './areas.js';

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
// ask 家族 — 出牌阶段外的决策询问
// ============================================================

// ---- askForCard：出一张指定类型的牌（闪/杀/桃/无懈） ----

/** 询问玩家打出一张指定类型的牌（闪/杀/桃/无懈）。无牌返回 null。 */
export function askForCard(
  game: Game,
  player: Player,
  prompt: string,
  types: CardType[],
): Card | null {
  // 规则层：可选牌 = 手牌中指定类型
  const options = player.hand.filter((c) => types.includes(c.type));
  if (options.length === 0) return null;

  // ---- AI 决策：选哪张（当前写死：有就出第一张；真人/前端接入时在此注入）----
  return options[0];
}

// ---- askFromAreas：从玩家区域内选一张牌（顺手牵羊/过河拆桥/寒冰剑/反馈等） ----

/** 询问从玩家区域内选一张牌（顺手牵羊/过河拆桥/寒冰剑/反馈/麒麟弓等）。无牌返回 null。 */
export function askFromAreas(
  game: Game,
  player: Player,
  prompt: string,
  areas: AreaName[] = ['hand', 'equipment', 'judgment'],
  filter?: (card: Card) => boolean,
): Card | null {
  // 规则层：目标区域内、符合过滤条件的牌
  let pool: Card[] = [];
  if (areas.includes('hand')) pool.push(...player.hand);
  if (areas.includes('equipment')) pool.push(...equipmentCards(player));
  if (areas.includes('judgment')) pool.push(...player.judgment);
  if (filter) pool = pool.filter(filter);
  if (pool.length === 0) return null;

  // ---- AI 决策：选哪张（当前写死：随机；真人/前端接入时在此注入）----
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---- askForTargets：从候选人中选择目标（技能选目标：仁德/反间/青囊/突袭等） ----

/** 询问从候选人中选择目标（技能选目标：仁德/反间/青囊/突袭等）。无可选返回 null。 */
export function askForTargets(
  game: Game,
  player: Player,
  prompt: string,
  candidates: Player[],
  max: number = candidates.length,
): Player[] | null {
  // 规则层：候选目标（调用方已按技能规则过滤合法范围）
  if (candidates.length === 0) return null;

  // ---- AI 决策：选哪些（当前写死：取前 max 个；真人/前端接入时在此注入）----
  return candidates.slice(0, max);
}

// ---- askYesNo：发动询问（触发技能"你可以"：洛神继续判定、制衡发动等） ----

/** 询问是否发动（触发技能"你可以"：洛神继续判定、制衡发动等）。 */
export function askYesNo(
  game: Game,
  player: Player,
  prompt: string,
  defaultAnswer = true,
): boolean {
  // ---- AI 决策：是否发动（当前写死：返回默认值；真人/前端接入时在此注入）----
  return defaultAnswer;
}
