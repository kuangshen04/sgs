// ============================================================
// 三国杀最小原型 — 区域（玩家三区：手牌 / 装备区 / 判定区）
// 规则语义的"区域"（顺手牵羊/过河拆桥/反馈等引用的目标牌来源）。
// 牌堆/弃牌堆是栈/堆，不在此建模（保持各自的专用原语）。
// ============================================================

import type { Card, Player } from './types.js';

export type AreaName = 'hand' | 'equipment' | 'judgment';

/** 玩家装备区的全部牌（4 槽位） */
export function equipmentCards(player: Player): Card[] {
  const eq = player.equipment;
  const cards: Card[] = [];
  if (eq.weapon) cards.push(eq.weapon);
  if (eq.armor) cards.push(eq.armor);
  if (eq.defensiveHorse) cards.push(eq.defensiveHorse);
  if (eq.offensiveHorse) cards.push(eq.offensiveHorse);
  return cards;
}

/** 玩家区域（手牌 + 装备区 + 判定区）内的全部牌 */
export function cardsInAreas(player: Player): Card[] {
  return [...player.hand, ...equipmentCards(player), ...player.judgment];
}

/** 玩家区域内是否有牌 */
export function hasCardsInAreas(player: Player): boolean {
  return player.hand.length > 0
    || !!player.equipment.weapon || !!player.equipment.armor
    || !!player.equipment.defensiveHorse || !!player.equipment.offensiveHorse
    || player.judgment.length > 0;
}

export interface AreaSelectOptions {
  /** 允许的区域（默认全部三区） */
  areas?: AreaName[];
}

/** 从玩家区域内随机选一张牌（当前 AI 策略：随机），无牌返回 null */
export function selectCardFromAreas(player: Player, opts: AreaSelectOptions = {}): Card | null {
  const areas = opts.areas ?? ['hand', 'equipment', 'judgment'];
  const pool: Card[] = [];
  if (areas.includes('hand')) pool.push(...player.hand);
  if (areas.includes('equipment')) pool.push(...equipmentCards(player));
  if (areas.includes('judgment')) pool.push(...player.judgment);
  if (pool.length === 0) return null;
  // TODO(玩家选择): 区域内选牌策略目前写死为随机——玩家决策在此接入
  return pool[Math.floor(Math.random() * pool.length)];
}
