// ============================================================
// 三国杀最小原型 — 体力操作与死亡结算
// ============================================================

import { CardType } from './types.js';
import type { Player } from './types.js';
import { EventType, GameEvent } from './events/index.js';
import type {
  DamageEventData, RecoverEventData, DyingEventData, DieEventData,
} from './events/index.js';
import { resolveUseResponse } from './respond.js';
import type { Game } from './game.js';

// ============================================================
// 游戏结束
// ============================================================

/** 胜负判定出结果时抛出，由入口（index）统一捕获并展示冠军 */
export class GameOverError extends Error {
  constructor(public readonly winner: Player) {
    super(`Game over: ${winner.name} wins`);
    this.name = 'GameOverError';
  }
}

// ============================================================
// 伤害与恢复
// ============================================================

export async function damage(
  game: Game,
  data: DamageEventData,
): Promise<GameEvent<DamageEventData>> {
  return new GameEvent<DamageEventData>(EventType.Damage, data, game)
    .execute(async (event) => {
      event.data.target.hp -= event.data.amount;
      console.log(
        `  💥 ${event.data.target.name} 受到${event.data.amount}点伤害！` +
        `体力: ${event.data.target.hp}/${event.data.target.maxHp}`,
      );
      if (event.data.target.hp <= 0) {
        await dying(game, { player: event.data.target });
      }
    });
}

export async function recover(
  game: Game,
  data: RecoverEventData,
): Promise<GameEvent<RecoverEventData>> {
  return new GameEvent<RecoverEventData>(EventType.Recover, data, game)
    .execute(async (event) => {
      event.data.target.hp = Math.min(
        event.data.target.hp + event.data.amount,
        event.data.target.maxHp,
      );
    });
}

/**
 * 失去体力：直接减少体力（无来源、无伤害事件——不触发 damage 相关技能）。
 * 体力 ≤ 0 时进入濒死。
 */
export async function loseHp(game: Game, player: Player, amount: number): Promise<void> {
  player.hp -= amount;
  console.log(`  ${player.name} 失去 ${amount} 点体力，体力: ${player.hp}/${player.maxHp}`);
  if (player.hp <= 0) {
    await dying(game, { player });
  }
}

// ============================================================
// 濒死与死亡
// ============================================================

/**
 * 濒死：求桃自救。内容：
 *   1. 从当前回合角色开始按行动顺序询问桃（三国杀按座次均从当前回合角色开始）
 *   2. 有人用桃后不重置回开头：指针停在用桃者身上（其可连续用桃）
 *   3. 一整轮无人响应仍 ≤ 0 → 调用 die() 真正死亡
 */
export async function dying(
  game: Game,
  data: DyingEventData,
): Promise<GameEvent<DyingEventData>> {
  return new GameEvent<DyingEventData>(EventType.Dying, data, game)
    .execute(async (event) => {
      const dyingPlayer = event.data.player;

      if (!dyingPlayer.alive) return; // 已死亡，跳过

      const players = game.state.players;
      const startIndex = game.state.currentIndex; // 求桃按座次：从当前回合角色开始
      const aliveCount = players.filter((p) => p.alive).length;

      // 求桃：指针从当前回合角色开始；拒绝则前进，用桃则停在原处（可再用桃）；
      // 一整轮无人响应 → 死亡。
      let usedTao = false;
      let idx = startIndex;
      let consecutivePasses = 0;
      while (dyingPlayer.hp <= 0) {
        const player = players[idx];
        if (!player.alive) {
          idx = (idx + 1) % players.length;
          continue;
        }

        // 使用型响应窗口：真桃 + 急救（如有） + 放弃
        const ok = await resolveUseResponse(game, player, {
          type: 'use',
          cardType: CardType.Tao,
          target: dyingPlayer,
        });
        if (!ok) {
          consecutivePasses++;
          if (consecutivePasses >= aliveCount) break; // 一整轮无人响应
          idx = (idx + 1) % players.length;
          continue;
        }

        consecutivePasses = 0;
        usedTao = true;
        console.log(`  🩸${dyingPlayer.name} 濒死！${player.name} 使用 🍑桃 救援`);
        // 用了桃但未脱离：指针停在原处，下一轮继续问同一玩家（可再用桃）
      }

      if (usedTao && dyingPlayer.hp > 0) {
        console.log(
          `  💚${dyingPlayer.name} 脱离濒死，体力: ${dyingPlayer.hp}/${dyingPlayer.maxHp}`,
        );
      }

      // 若仍死亡，真正阵亡
      if (dyingPlayer.hp <= 0) {
        await die(game, { player: dyingPlayer });
      }
    });
}

export async function die(
  game: Game,
  data: DieEventData,
): Promise<GameEvent<DieEventData>> {
  const state = game.state;
  return new GameEvent<DieEventData>(EventType.Die, data, game)
    .execute(async (event) => {
      event.data.player.alive = false;
      console.log(`\n💀 ${event.data.player.name} 阵亡！`);
      const winner = state.victoryCheck(state);
      if (winner) {
        state.gameOver = true;
        state.winner = winner;
        throw new GameOverError(winner);
      }
    });
}
