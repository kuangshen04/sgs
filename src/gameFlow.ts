// ============================================================
// 三国杀最小原型 — 基本游戏流程
// game / round / turn / phase 边界事件工厂
// 出牌/弃牌逻辑
// ============================================================

import { CardType, Player } from './types.js';
import { EventType, GameEvent } from './events/index.js';
import type {
  TurnEventData,
  RoundEventData,
  GameEventData,
  PhaseEventData,
} from './events/index.js';
import {
  drawCards, useCard,
  printState,
  cardRegistry, cardEmoji, displayNumber, discardCards,
} from './game.js';
import type { Game } from './game.js';
import { choose } from './choose.js';
import { pickActiveSkill } from './skills.js';

// ============================================================
// 弃牌阶段逻辑
// ============================================================

function doDiscard(game: Game, player: Player): void {
  const state = game.state;

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
  const discarded = discardCards(game, player, sorted.slice(0, excess));
  for (const c of discarded) {
    console.log(`  弃置了 ${cardEmoji(c.type)} (${c.suit}${displayNumber(c.number)})`);
  }
}

// ============================================================
// Boundary 工厂函数（轮/回合/阶段）
// 每个工厂 content 硬编码，不暴露 body 参数
// ============================================================

/** 回合：依次执行摸牌 → 出牌 → 弃牌三个阶段 */
export async function turn(
  game: Game,
  data: TurnEventData,
): Promise<GameEvent<TurnEventData>> {
  return new GameEvent<TurnEventData>(EventType.Turn, data, game)
    .execute(async () => {
      await drawPhase(game, { player: data.player, round: data.round });
      await playPhase(game, { player: data.player, round: data.round });
      await discardPhase(game, { player: data.player, round: data.round });
    });
}

/** 摸牌阶段：摸2张牌 */
export async function drawPhase(
  game: Game,
  data: PhaseEventData,
): Promise<GameEvent<PhaseEventData>> {
  return new GameEvent<PhaseEventData>(EventType.DrawPhase, data, game)
    .execute(async (event) => {
      const player = event.data.player;
      const before = player.hand.length;
      await drawCards(game, { target: player, count: 2 });
      const after = player.hand.length;
      console.log(`[摸牌阶段] ${player.name} 摸了 ${after - before} 张牌`);
    });
}

/** 出牌阶段：循环 choose → 执行 */
export async function playPhase(
  game: Game,
  data: PhaseEventData,
): Promise<GameEvent<PhaseEventData>> {
  return new GameEvent<PhaseEventData>(EventType.PlayPhase, data, game)
    .execute(async (event) => {
      console.log(`[出牌阶段]`);
      const player = event.data.player;

      let shaUsed = false;
      const usedSkills = new Set<string>(); // 本回合已发动的限次技能
      while (true) {
        const cardChoice = await choose(game, { player, shaUsed });
        const skill = pickActiveSkill(game, player, {
          shaUsed, usedSkills, cardChoice: cardChoice?.card ?? null,
        });

        if (cardChoice) {
          if (cardChoice.card.type === CardType.Sha) shaUsed = true;
          await useCard(game, {
            player, card: cardChoice.card, targets: cardChoice.targets,
          });
        } else if (skill) {
          usedSkills.add(skill.name);
          await skill.content(game, player);
        } else {
          break;
        }
      }
    });
}

/** 弃牌阶段：手牌数不能超过当前体力值 */
export async function discardPhase(
  game: Game,
  data: PhaseEventData,
): Promise<GameEvent<PhaseEventData>> {
  return new GameEvent<PhaseEventData>(EventType.DiscardPhase, data, game)
    .execute(async (event) => {
      doDiscard(game, event.data.player);
    });
}

/** 一整局游戏：主循环 */
export async function runGame(game: Game): Promise<GameEvent<GameEventData>> {
  const state = game.state;
  return new GameEvent<GameEventData>(EventType.Game, {}, game)
    .execute(async () => {
      while (!state.gameOver) {
        await round(game, { round: state.round });
        state.round++;
      }
    });
}

/** 一轮：所有玩家依次执行回合 */
export async function round(
  game: Game,
  data: RoundEventData,
): Promise<GameEvent<RoundEventData>> {
  const state = game.state;
  return new GameEvent<RoundEventData>(EventType.Round, data, game)
    .execute(async () => {
      for (let i = 0; i < state.players.length; i++) {
        state.currentIndex = i;
        const player = state.players[i];

        console.log(`\n━━━ 第 ${data.round} 轮 · ${player.name} 的回合 ━━━`);
        await playerTurn(game);
        printState(state);
      }
    });
}

// ============================================================
// 回合入口
// ============================================================

/** 执行一个玩家的完整回合 */
export async function playerTurn(game: Game): Promise<void> {
  const state = game.state;
  const player = state.players[state.currentIndex];

  if (!player.alive) {
    console.log(`${player.name} 已阵亡，跳过回合`);
    return;
  }

  await turn(game, { player, round: state.round });
}
