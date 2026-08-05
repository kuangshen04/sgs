// ============================================================
// 三国杀最小原型 — 距离系统
// 座位距离 + 距离修正（effectRegistry）+ 攻击范围
// ============================================================

import { cardRegistry } from './cardRegistry.js';
import { effectRegistry } from './persistentEffects.js';
import type { Player } from './types.js';

/** 座位距离：两玩家在座位环上的最短间隔（2 人局固定为 1） */
export function seatDistance(players: Player[], from: Player, to: Player): number {
  const n = players.length;
  if (n <= 2) return 1;
  const i = players.indexOf(from);
  const j = players.indexOf(to);
  const diff = Math.abs(i - j);
  return Math.min(diff, n - diff);
}

/**
 * 实际距离：座位距离 + 目标的防御修正（防御马） - 来源的进攻修正（马术/进攻马）。
 * 最低为 1。
 */
export function distanceTo(players: Player[], from: Player, to: Player): number {
  const base = seatDistance(players, from, to);
  const modified = base
    + effectRegistry.sum(to, 'defensiveDistance')
    - effectRegistry.sum(from, 'offensiveDistance');
  return Math.max(1, modified);
}

/** 攻击范围：武器攻击范围，无武器为 1 */
export function attackRange(player: Player): number {
  const weapon = player.equipment.weapon;
  if (!weapon) return 1;
  return cardRegistry.get(weapon.type)?.range ?? 1;
}
