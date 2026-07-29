// ============================================================
// 三国杀最小原型 — 基本游戏流程
// game / round / turn / phase 边界事件工厂
// 出牌/弃牌内部逻辑
// ============================================================

import { Card, CardType, GameState, Player } from './types.js';
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
  printState, displayNumber, cardEmoji,
} from './game.js';

// ============================================================
// 出牌阶段 — AI 决策
// ============================================================

function aiChoosePlay(
  player: Player,
  enemy: Player,
  shaUsed: boolean,
): { card: Card; targets: Player[] } | null {
  // 有桃且受伤 → 对自己用桃
  const tao = player.hand.find((c) => c.type === CardType.Tao);
  if (tao && player.hp < player.maxHp) {
    return { card: tao, targets: [player] };
  }
  // 有杀且本回合未出过杀 → 对敌人用杀
  const sha = player.hand.find((c) => c.type === CardType.Sha);
  if (sha && !shaUsed) {
    return { card: sha, targets: [enemy] };
  }
  return null;
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

  const priority: Record<string, number> = {
    [CardType.Sha]: 0, [CardType.Shan]: 1, [CardType.Tao]: 2,
  };
  const sorted = [...player.hand].sort(
    (a, b) => priority[a.type] - priority[b.type],
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

/** 出牌阶段：AI 自动决策（吃桃 → 出杀） */
export async function playPhase(
  data: PhaseEventData,
): Promise<GameEvent<PhaseEventData>> {
  const state = gs();
  return new GameEvent<PhaseEventData>(EventType.PlayPhase, data)
    .execute(async (event) => {
      console.log(`[出牌阶段]`);
      const player = event.data.player;
      const enemy = state.players.find((p) => p !== player)!;

      let shaUsed = false;
      while (true) {
        const action = aiChoosePlay(player, enemy, shaUsed);
        if (!action) break;

        if (action.card.type === CardType.Sha) shaUsed = true;
        await useCard({ player, card: action.card, targets: action.targets });
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
