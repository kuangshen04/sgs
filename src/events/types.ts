// ============================================================
// 事件系统 — 事件名常量 & 事件数据接口
// ============================================================

import type { Player } from '../types.js';

/** 事件名常量 */
export const EventType = {
  Damage: 'damage',
  Recover: 'recover',
  Draw: 'draw',
  Die: 'die',
  TurnStart: 'turnStart',
  TurnEnd: 'turnEnd',
} as const;

// ============================================================
// 事件数据接口
// ============================================================

export interface DamageEventData {
  target: Player;
  source: Player;
  amount: number;
}

export interface RecoverEventData {
  target: Player;
  amount: number;
}

export interface DrawEventData {
  target: Player;
  count: number;
}

export interface DieEventData {
  player: Player;
}

export interface TurnStartEventData {
  player: Player;
  round: number;
}

export interface TurnEndEventData {
  player: Player;
  round: number;
}
