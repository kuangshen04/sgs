// ============================================================
// 三国杀最小原型 — 基本游戏流程
// game / round / turn / phase 边界事件工厂
// 出牌/弃牌逻辑
// ============================================================

import { CardTag, CardType, Player } from './types.js';
import { EventType, GameEvent } from './events/index.js';
import type {
  TurnEventData,
  RoundEventData,
  GameEventData,
  PhaseEventData,
  DrawPhaseEventData,
  TargetingEventData,
} from './events/index.js';
import { drawCards, useCard, discardCards, judge, moveCards, settleProcessingCards } from './cardActions.js';
import { cardRegistry, cardEmoji, displayNumber, asUsedCard } from './cardRegistry.js';
import { printState } from './display.js';
import type { Game } from './game.js';
import { choosePlayAction } from './playChoices.js';

// ============================================================
// Boundary 工厂函数（轮/回合/阶段）
// 每个工厂 content 硬编码，不暴露 body 参数
// ============================================================

/** 回合：准备 → 判定 → 摸牌 → 出牌 → 弃牌 → 结束 */
export async function turn(
  game: Game,
  data: TurnEventData,
): Promise<GameEvent<TurnEventData>> {
  return new GameEvent<TurnEventData>(EventType.Turn, data, game)
    .execute(async () => {
      data.player.skipPlayPhase = false; // 回合开始重置瞬时标记
      await preparePhase(game, { player: data.player });
      if (!data.player.alive) return; // 死亡后跳过剩余阶段
      await judgePhase(game, { player: data.player });
      if (!data.player.alive) return; // 死亡后跳过剩余阶段
      await drawPhase(game, { player: data.player });
      if (!data.player.alive) return; // 死亡后跳过剩余阶段
      await playPhase(game, { player: data.player });
      if (!data.player.alive) return;
      await discardPhase(game, { player: data.player });
      if (!data.player.alive) return;
      await endPhase(game, { player: data.player });
    });
}

/** 摸牌阶段：摸2张牌 */
export async function drawPhase(
  game: Game,
  data: PhaseEventData,
): Promise<GameEvent<DrawPhaseEventData>> {
  return new GameEvent<DrawPhaseEventData>(EventType.DrawPhase, { ...data, count: 2 }, game)
    .execute(async (event) => {
      const player = event.data.player;
      if (event.data.count <= 0) {
        console.log(`[摸牌阶段] ${player.name} 本阶段摸牌数被修改为 0，不摸牌`);
        return;
      }
      const before = player.hand.length;
      await drawCards(game, { target: player, count: event.data.count });
      const after = player.hand.length;
      console.log(`[摸牌阶段] ${player.name} 摸了 ${after - before} 张牌`);
    });
}

/** 准备阶段：边界事件（洛神/观星等技能的触发点） */
export async function preparePhase(
  game: Game,
  data: PhaseEventData,
): Promise<GameEvent<PhaseEventData>> {
  return new GameEvent<PhaseEventData>(EventType.PreparePhase, data, game)
    .execute(async () => {});
}

/** 判定阶段：按放置顺序依次结算判定区的延时锦囊（判定 + 实际效果） */
export async function judgePhase(
  game: Game,
  data: PhaseEventData,
): Promise<GameEvent<PhaseEventData>> {
  return new GameEvent<PhaseEventData>(EventType.JudgePhase, data, game)
    .execute(async (event) => {
      const player = event.data.player;
      console.log(`[判定阶段]`);

      // 快照：结算过程中判定区会变化
      const cards = [...player.judgment];
      for (const card of cards) {
        const def = cardRegistry.get(card.type);
        if (!def?.tags.includes(CardTag.Delay)) continue; // 非延时牌（理论上不会出现）

        // 延时牌进入处理区（判定区 → 处理区）
        await moveCards(game, {
          to: { zone: 'processing' },
          cards: [card],
          reason: 'resolve',
        });

        try {
          // 判定前无懈窗口：可令此判定牌无效（复用 targeting 事件 + 无懈触发器）
          const windowEvent = await new GameEvent<TargetingEventData>(
            EventType.Targeting,
            { user: player, card: asUsedCard(card), target: player, judging: true },
            game,
          ).execute(async () => {});

          if (windowEvent.isPrevented()) {
            console.log(`  🚫${player.name} 判定区的 ${cardEmoji(card.type)} 被无懈可击抵消`);
            continue;
          }

          const judgeCard = await judge(game, player);
          await def.delayContent?.(game, player, judgeCard, card);
        } finally {
          // 结算结束：仍在处理区则进入弃牌堆；闪电转移等已移走的牌自动跳过
          await settleProcessingCards(game, [card], 'resolve');
        }
      }
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

      if (player.skipPlayPhase) {
        console.log(`  ⏭️ ${player.name} 被乐不思蜀跳过出牌阶段`);
        return;
      }

      let shaUsed = false;
      const usedSkills = new Set<string>(); // 本回合已发动的限次技能
      while (true) {
        if (!player.alive) break; // 出牌阶段中死亡则终止
        const action = await choosePlayAction(game, player, shaUsed, usedSkills);

        if (action?.kind === 'card') {
          if (action.card.type === CardType.Sha) shaUsed = true;
          await useCard(game, {
            player, card: action.card, targets: action.targets,
          });
        } else if (action?.kind === 'skill') {
          usedSkills.add(action.skill.name);
          await action.skill.execute(game, player, action.answers);
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
      const player = event.data.player;

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
      const discarded = await discardCards(game, player, sorted.slice(0, excess));
      for (const c of discarded) {
        console.log(`  弃置了 ${cardEmoji(c.type)} (${c.suit}${displayNumber(c.number)})`);
      }
    });
}

/** 结束阶段：边界事件（闭月等技能的触发点） */
export async function endPhase(
  game: Game,
  data: PhaseEventData,
): Promise<GameEvent<PhaseEventData>> {
  return new GameEvent<PhaseEventData>(EventType.EndPhase, data, game)
    .execute(async () => {});
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

        if (!player.alive) {
          console.log(`${player.name} 已阵亡，跳过回合`);
        } else {
          console.log(`\n━━━ 第 ${data.round} 轮 · ${player.name} 的回合 ━━━`);
          await turn(game, { player });
          printState(state);
        }
      }
    });
}
