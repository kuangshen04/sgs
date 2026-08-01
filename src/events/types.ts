// ============================================================
// 事件系统 — 事件名常量 & 事件数据接口
// ============================================================

import type { Card, Player } from '../types.js';

/** 事件名常量 */
export const EventType = {
  // Action 事件 — 技能可干预的核心游戏动作
  Damage: 'damage',
  Recover: 'recover',
  Draw: 'draw',
  Die: 'die',
  Dying: 'dying',
  UseCard: 'useCard',
  // Boundary 事件 — 游戏/轮/回合/阶段的分界标记
  Game: 'game',
  Round: 'round',
  Turn: 'turn',
  DrawPhase: 'drawPhase',
  PlayPhase: 'playPhase',
  DiscardPhase: 'discardPhase',
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

export interface DyingEventData {
  player: Player;
}

export interface DieEventData {
  player: Player;
}

export interface UseCardEventData {
  player: Player;
  card: Card;
  targets: Player[];
}

export interface TurnEventData {
  player: Player;
  round: number;
}

export interface RoundEventData {
  round: number;
}

export interface GameEventData {
  // 游戏顶层事件 — 预留元数据字段
}

export interface PhaseEventData {
  player: Player;
  round: number;
}
