// ============================================================
// 事件系统 — 统一导出
// ============================================================

export { GameEvent, eventStack, EventPreventError } from './GameEvent.js';
export { TriggerSystem, triggerSystem } from './TriggerSystem.js';
export { EventType } from './types.js';
export type {
  DamageEventData,
  RecoverEventData,
  DrawEventData,
  DieEventData,
  UseCardEventData,
  TurnEventData,
  RoundEventData,
  GameEventData,
  PhaseEventData,
} from './types.js';
