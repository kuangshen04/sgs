// ============================================================
// 事件系统 — 事件名常量 & 事件数据接口
// ============================================================

import type { Card, CardLocation, CardMoveReason, Player, RespondMarks } from '../types.js';

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
  CardMove: 'cardMove',
  ShaCancelled: 'shaCancelled',
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
  /** 响应过程状态（无双/铁骑等 targeting.after 写入，响应流程读取） */
  marks?: RespondMarks;
}

/** 杀被闪抵消时点（青龙偃月刀/贯石斧/刺杀等监听） */
export interface ShaCancelledEventData {
  attacker: Player;
  defender: Player;
  card: Card;        // 被杀
  shanCount: number; // 实际打出的闪数
}

/**
 * 统一移动事件数据。
 * from 由引擎派生：fromAreas[i] 与 cards[i] 一一对应（移动前的实际来源）。
 * 一次移动 = 一个事件；移动中的多张牌可以来自不同区域。
 */
export interface CardMoveEventData {
  /** 实际移动的牌（不在任何位置的牌会被跳过） */
  cards: Card[];
  /** 每张牌移动前的来源位置（与 cards 一一对应） */
  fromAreas: CardLocation[];
  /** 终点位置 */
  to: CardLocation;
  reason: CardMoveReason;
  /** 移动发起者（技能判断"谁移动的"用） */
  mover?: Player;
  /** 仅终点为牌堆时使用：放顶（默认）还是放底 */
  toPosition?: 'top' | 'bottom';
}

export interface TurnEventData {
  player: Player;
}

export interface RoundEventData {
  round: number;
}

export interface GameEventData {
  // 游戏顶层事件 — 预留元数据字段
}

export interface PhaseEventData {
  player: Player;
}

/** 摸牌阶段事件数据（count 可在 before 中由技能修改，如英姿 +1 / 裸衣 -1 / 突袭 =0） */
export interface DrawPhaseEventData extends PhaseEventData {
  count: number;
}
