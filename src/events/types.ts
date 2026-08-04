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
  Judge: 'judge',
  Targeting: 'targeting',
  UseCard: 'useCard',
  // Boundary 事件 — 游戏/轮/回合/阶段的分界标记
  Game: 'game',
  Round: 'round',
  Turn: 'turn',
  PreparePhase: 'preparePhase',
  DrawPhase: 'drawPhase',
  PlayPhase: 'playPhase',
  DiscardPhase: 'discardPhase',
  JudgePhase: 'judgePhase',
  EndPhase: 'endPhase',
} as const;

// ============================================================
// 事件数据接口
// ============================================================

export interface DamageEventData {
  target: Player;
  /** 伤害来源；无来源伤害（如闪电）为 undefined */
  source?: Player;
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

export interface JudgeEventData {
  player: Player;
  /** 亮出的判定牌；鬼才将来可在 judging 阶段替换 */
  card?: Card;
}

export interface DieEventData {
  player: Player;
}

export interface TargetingEventData {
  user: Player;
  card: Card;
  target: Player;   // 当前正在指定的单个目标
  /** 判定阶段的无懈窗口标记（允许被判定者抵消自己的延时锦囊） */
  judging?: boolean;
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
