// ============================================================
// 三国杀最小原型 — 基本游戏流程
// game / round / turn / phase 边界事件工厂
// 出牌/弃牌逻辑
// ============================================================

import { CardType, GameState, Player } from './types.js';
import type { Card } from './types.js';
import { EventType, GameEvent } from './events/index.js';
import type {
  TurnEventData,
  RoundEventData,
  GameEventData,
  PhaseEventData,
} from './events/index.js';
import {
  gs,
  drawCards, useCard,
  printState,
  cardRegistry, cardEmoji, displayNumber,
} from './game.js';
import type { CardDef } from './game.js';

// ============================================================
// 出牌阶段 — 两阶段选择接口
// ============================================================

// ---- Phase 1: 选牌 ----

/** 一张可选的卡牌 */
export interface CardOption {
  card: Card;
  def: CardDef;
}

/** 选牌结果 */
export interface CardSelection {
  cardId: number;
}

/** 选牌决策函数 */
export type CardDecider = (
  options: CardOption[],
  player: Player,
  shaUsed: boolean,
) => CardSelection | null;

// ---- Phase 2: 选目标 ----

/** 一个可选的目标玩家 */
export interface TargetOption {
  player: Player;
  index: number; // gs().players 中的索引
}

/** 选目标结果 */
export interface TargetSelection {
  targetIndices: number[];
}

/** 选目标决策函数 */
export type TargetDecider = (
  options: TargetOption[],
  card: Card,
  player: Player,
) => TargetSelection | null;

// ---- choose() 入参 ----

export interface ChooseParams {
  player: Player;
  shaUsed: boolean;
  cardDecide?: CardDecider;
  targetDecide?: TargetDecider;
}

// ============================================================
// Phase 1: 选牌（引擎层 — 规则）
// ============================================================

/** 计算可选卡牌（已按 usePriority 降序排列） */
export function computeCardOptions(player: Player, shaUsed: boolean): CardOption[] {
  const allPlayers = gs().players;

  return player.hand
    .map((card) => ({ card, def: cardRegistry.get(card.type) }))
    .filter(({ def }) => def && def.ai.canUse(player, allPlayers, shaUsed))
    .map(({ card, def }) => ({ card, def: def! }))
    .sort((a, b) => b.def.ai.usePriority - a.def.ai.usePriority);
}

function defaultCardDecider(options: CardOption[]): CardSelection | null {
  if (options.length === 0) return null;
  return { cardId: options[0].card.id };
}

function validateCardSelection(
  sel: CardSelection,
  options: CardOption[],
): Card | null {
  const opt = options.find((o) => o.card.id === sel.cardId);
  return opt ? opt.card : null;
}

// ============================================================
// Phase 2: 选目标（引擎层 — 规则）
// ============================================================

/** 计算某张牌的合法目标 */
export function computeTargetOptions(card: Card, player: Player): TargetOption[] {
  const def = cardRegistry.get(card.type);
  if (!def) return [];
  return def.targetFilter(player, gs().players)
    .map((t) => ({ player: t, index: gs().players.indexOf(t) }));
}

function defaultTargetDecider(
  options: TargetOption[],
  card: Card,
  player: Player,
): TargetSelection | null {
  if (options.length === 0) return null;
  const def = cardRegistry.get(card.type)!;
  const tc = def.targetCount;

  let selected: TargetOption[];
  if (tc === 'all') {
    selected = options;
  } else {
    // 优先自己（桃/无中生有），否则取前 N 个
    const self = options.find((t) => t.player === player);
    selected = self ? [self] : options.slice(0, tc);
  }

  return { targetIndices: selected.map((t) => t.index) };
}

function validateTargetSelection(
  sel: TargetSelection,
  options: TargetOption[],
  card: Card,
): Player[] | null {
  const def = cardRegistry.get(card.type);
  if (!def) return null;

  const targets = sel.targetIndices.map((i) => gs().players[i]);

  // 目标必须在合法范围内
  const validIndices = new Set(options.map((o) => o.index));
  if (!sel.targetIndices.every((i) => validIndices.has(i))) return null;

  // targetCount 约束
  if (def.targetCount === 'all') {
    if (targets.length !== options.length) return null;
  } else if (targets.length !== def.targetCount) {
    return null;
  }

  return targets;
}

// ============================================================
// choose() — 串联两阶段
// ============================================================

/**
 * 一次出牌选择：
 *   Phase 1: compute → decide → validate（选牌）
 *   Phase 2: compute → decide → validate（选目标）
 * 返回 { card, targets } 或 null（不出牌）。
 */
export async function choose(
  params: ChooseParams,
): Promise<{ card: Card; targets: Player[] } | null> {
  const { player, shaUsed, cardDecide, targetDecide } = params;
  const cd = cardDecide ?? defaultCardDecider;
  const td = targetDecide ?? defaultTargetDecider;

  // Phase 1: 选牌
  const cardOptions = computeCardOptions(player, shaUsed);
  const cardSel = cd(cardOptions, player, shaUsed);
  if (!cardSel) return null;
  const card = validateCardSelection(cardSel, cardOptions);
  if (!card) return null;

  // Phase 2: 选目标
  const targetOptions = computeTargetOptions(card, player);
  const targetSel = td(targetOptions, card, player);
  if (!targetSel) return null;
  const targets = validateTargetSelection(targetSel, targetOptions, card);
  if (!targets) return null;

  return { card, targets };
}

// ============================================================
// 弃牌阶段逻辑
// ============================================================

function doDiscard(player: Player): void {
  const state = gs();

  if (player.hand.length <= player.hp) {
    if (player.hand.length > 0) {
      console.log(`[弃牌阶段] ${player.name} 手牌数(${player.hand.length}) ≤ 体力(${player.hp})，无需弃牌`);
    }
    return;
  }

  const excess = player.hand.length - player.hp;
  console.log(
    `[弃牌阶段] ${player.name} 手牌数(${player.hand.length}) > 体力(${player.hp})，需要弃置 ${excess} 张`,
  );

  // 按 discardPriority 升序排列（越小越先弃）
  const sorted = [...player.hand].sort(
    (a, b) => (cardRegistry.get(a.type)?.ai.discardPriority ?? 0)
            - (cardRegistry.get(b.type)?.ai.discardPriority ?? 0),
  );
  const toDiscard = new Set(sorted.slice(0, excess).map((c) => c.id));

  player.hand = player.hand.filter((c) => {
    if (toDiscard.has(c.id)) {
      state.discardPile.push(c);
      console.log(`  弃置了 ${cardEmoji(c.type)} (${c.suit}${displayNumber(c.number)})`);
      return false;
    }
    return true;
  });
}

// ============================================================
// Boundary 工厂函数（轮/回合/阶段）
// 每个工厂 content 硬编码，不暴露 body 参数
// ============================================================

/** 回合：依次执行摸牌 → 出牌 → 弃牌三个阶段 */
export async function turn(
  data: TurnEventData,
): Promise<GameEvent<TurnEventData>> {
  return new GameEvent<TurnEventData>(EventType.Turn, data)
    .execute(async () => {
      await drawPhase({ player: data.player, round: data.round });
      await playPhase({ player: data.player, round: data.round });
      await discardPhase({ player: data.player, round: data.round });
    });
}

/** 摸牌阶段：摸2张牌 */
export async function drawPhase(
  data: PhaseEventData,
): Promise<GameEvent<PhaseEventData>> {
  return new GameEvent<PhaseEventData>(EventType.DrawPhase, data)
    .execute(async (event) => {
      const player = event.data.player;
      const before = player.hand.length;
      await drawCards({ target: player, count: 2 });
      const after = player.hand.length;
      console.log(`[摸牌阶段] ${player.name} 摸了 ${after - before} 张牌`);
    });
}

/** 出牌阶段：循环 choose → 执行，可注入自定义 decider */
export async function playPhase(
  data: PhaseEventData,
  cardDecide?: CardDecider,
  targetDecide?: TargetDecider,
): Promise<GameEvent<PhaseEventData>> {
  return new GameEvent<PhaseEventData>(EventType.PlayPhase, data)
    .execute(async (event) => {
      console.log(`[出牌阶段]`);
      const player = event.data.player;

      let shaUsed = false;
      while (true) {
        const result = await choose({ player, shaUsed, cardDecide, targetDecide });
        if (!result) break;

        if (result.card.type === CardType.Sha) shaUsed = true;
        await useCard({ player, card: result.card, targets: result.targets });
      }
    });
}

/** 弃牌阶段：手牌数不能超过当前体力值 */
export async function discardPhase(
  data: PhaseEventData,
): Promise<GameEvent<PhaseEventData>> {
  return new GameEvent<PhaseEventData>(EventType.DiscardPhase, data)
    .execute(async (event) => {
      doDiscard(event.data.player);
    });
}

/** 一整局游戏：主循环 */
export async function runGame(): Promise<GameEvent<GameEventData>> {
  const state = gs();
  return new GameEvent<GameEventData>(EventType.Game, {})
    .execute(async () => {
      while (!state.gameOver) {
        await round({ round: state.round });
        state.round++;
      }
    });
}

/** 一轮：所有玩家依次执行回合 */
export async function round(
  data: RoundEventData,
): Promise<GameEvent<RoundEventData>> {
  const state = gs();
  return new GameEvent<RoundEventData>(EventType.Round, data)
    .execute(async () => {
      for (let i = 0; i < state.players.length; i++) {
        state.currentIndex = i;
        const player = state.players[i];

        console.log(`\n━━━ 第 ${data.round} 轮 · ${player.name} 的回合 ━━━`);
        await playerTurn(state);
        printState(state);
      }
    });
}

// ============================================================
// 回合入口
// ============================================================

/** 执行一个玩家的完整回合 */
export async function playerTurn(state: GameState): Promise<void> {
  const player = state.players[state.currentIndex];

  if (!player.alive) {
    console.log(`${player.name} 已阵亡，跳过回合`);
    return;
  }

  await turn({ player, round: state.round });
}
