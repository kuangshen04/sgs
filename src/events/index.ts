// ============================================================
// 事件系统 — 统一导出
// ============================================================

export { GameEvent, createEventStack } from './GameEvent.js';
export type { EventStack } from './GameEvent.js';
export { TriggerSystem } from './TriggerSystem.js';
export { EventType } from './types.js';
export type {
  DamageEventData,
  RecoverEventData,
  DrawEventData,
  DyingEventData,
  JudgeEventData,
  DieEventData,
  TargetingEventData,
  UseCardEventData,
  CardMoveEventData,
  ShaCancelledEventData,
  TurnEventData,
  RoundEventData,
  GameEventData,
  PhaseEventData,
  DrawPhaseEventData,
} from './types.js';
