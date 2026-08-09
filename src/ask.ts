// ============================================================
// 三国杀最小原型 — 决策询问（ask 家族）
//
// 出牌阶段外的玩家决策点：响应牌 / 区域选牌 / 选目标 / 发动询问。
// 当前全部写死为默认 AI；各函数内 "AI 决策" 处即真人/前端接入时的注入点。
// ask 只做决策不执行牌：打出/使用仍由调用方（playFromHand/useCard）负责。
// ============================================================

import type { Card, Player } from './types.js';
import { CardType } from './types.js';
import type { Game } from './game.js';
import type { AreaName } from './areas.js';
import { equipmentCards } from './areas.js';

// ============================================================
// askForCard — 出一张指定类型的牌
// ============================================================

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

// ============================================================
// askFromAreas — 从玩家区域内选一张牌
// ============================================================

/** 询问从玩家区域内选一张牌（顺手牵羊/过河拆桥/寒冰剑/反馈等）。无牌返回 null。 */
export function askFromAreas(
  game: Game,
  player: Player,
  prompt: string,
  areas: AreaName[] = ['hand', 'equipment', 'judgment'],
): Card | null {
  // 规则层：目标区域内的牌
  const pool: Card[] = [];
  if (areas.includes('hand')) pool.push(...player.hand);
  if (areas.includes('equipment')) pool.push(...equipmentCards(player));
  if (areas.includes('judgment')) pool.push(...player.judgment);
  if (pool.length === 0) return null;

  // ---- AI 决策：选哪张（当前写死：随机；真人/前端接入时在此注入）----
  return pool[Math.floor(Math.random() * pool.length)];
}

// ============================================================
// askForTargets — 从候选人中选择目标
// ============================================================

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

// ============================================================
// askYesNo — 发动询问
// ============================================================

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
