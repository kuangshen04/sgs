// ============================================================
// 事件系统 — 事件名常量 & 事件数据接口
// ============================================================

import type { Card, CardLocation, CardMoveReason, Player, UsedCard } from '../types.js';
import type { UsedCardInstance } from '../position/usedCards.js';

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
  /** 单目标生效（本次使用 × 一个目标；时点 cardEffect.before/after，演进 3.6） */
  CardEffect: 'cardEffect',
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
  /**
   * 造成本次伤害的牌（演进 2.3 显式因果字段）。
   * 仅当伤害是某张【使用/打出】的牌直接造成时，由规则层（卡牌 content）显式赋值；
   * 技能伤害（刚烈反击、反间）、无来源伤害（闪电）不设——奸雄等"获得造成伤害的牌"
   * 类技能据此判断，不再经 getParent('useCard') 推断（避免嵌套伤害误归）。
   */
  card?: UsedCard;
  /** 伤害被防止（如寒冰剑）时置真，content 与 after 均被跳过 */
  cancelled?: boolean;
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
  card: UsedCard;
  target: Player;   // 当前正在指定的单个目标
  /** 判定阶段的无懈窗口标记（允许被判定者抵消自己的延时锦囊） */
  judging?: boolean;
  /** 目标指定被抵消（仁王盾 / 无懈）时置真，该 target 被剔除 */
  cancelled?: boolean;
  /** 该目标**不可响应**（铁骑等在此置位；随生效事件继承，供内容层读） */
  disresponsive?: boolean;
}

export interface UseCardEventData {
  player: Player;
  /** 本次使用对应的 UC（规则身份 + 实体组成 + 容器位置；读规则读 UC，演进 3.5） */
  card: UsedCardInstance;
  targets: Player[];
  /**
   * 整张牌**不可被无懈响应**（事件级，如离间的决斗）。
   * 由构造本次使用的技能声明（演进 3.6 U2）。
   */
  unoffsetable?: boolean;
  /** 内容层协作数据（如五谷丰登亮出的牌池；onAction 与逐目标 content 之间共享） */
  extra?: Record<string, unknown>;
  /**
   * 本次使用是"对某次生效"的响应（如无懈可击抵消一次生效）。
   * 响应关系显式记录，取代"沿事件栈反查父事件"（演进 3.6 U2）。
   */
  responseTo?: CardEffectEventData;
}

/**
 * 单目标生效事件（本次使用 × 一个目标）—— 使用流程的第三段（演进 3.6）。
 * 时点：`cardEffect.before` → 内容（`CardDef.content`）→ `cardEffect.after`。
 * 引擎在内容前只检查 `nullified` / `cancelled`：已置位则跳过内容（= 无效 / 抵消）。
 */
export interface CardEffectEventData {
  /** 本次使用 */
  use: UseCardEventData;
  /** 本张 UC（读规则读 UC） */
  card: UsedCardInstance;
  /** 当前目标；无目标流程（如无懈）为 undefined */
  to?: Player;
  /** 该目标上**此牌效果无效**（仁王盾等；引擎据此跳过内容） */
  nullified?: boolean;
  /** 该目标**不可被无懈响应**（读 use.unoffsetable；离间） */
  unoffsetable?: boolean;
  /** 该目标**不可响应**（铁骑等；响应的编排由内容层自行读取） */
  disresponsive?: boolean;
  /** 该目标上的效果**已被抵消**（无懈置位；引擎据此跳过内容） */
  cancelled?: boolean;
  /** 响应此牌的牌（闪 / 无懈），供"抵消/被响应"查询 */
  cardsResponded?: UsedCardInstance[];
}

/** 杀被闪抵消时点（青龙偃月刀/贯石斧/刺杀等监听） */
export interface ShaCancelledEventData {
  attacker: Player;
  defender: Player;
  card: UsedCard;    // 被杀（效果牌）
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
  // 注：牌堆顶/底不是位置，是取放策略（阶段 2 起由 putTop/putBottom 内部表达，不再入事件）
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
