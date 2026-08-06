// ============================================================
// 三国杀最小原型 — 体力操作与死亡结算
// ============================================================

import { CardType } from './types.js';
import { EventType, GameEvent } from './events/index.js';
import type {
  DamageEventData, RecoverEventData, DyingEventData, DieEventData,
} from './events/index.js';
import { useCard } from './cardActions.js';
import { findResponse } from './choose.js';
import type { Game } from './game.js';

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

// ============================================================
// 濒死与死亡
// ============================================================

/**
 * 濒死：求桃自救。内容：
 *   1. 循环使用桃直到体力 > 0 或无桃可用
 *   2. 若仍 ≤ 0，调用 die() 真正死亡
 */
export async function dying(
  game: Game,
  data: DyingEventData,
): Promise<GameEvent<DyingEventData>> {
  return new GameEvent<DyingEventData>(EventType.Dying, data, game)
    .execute(async (event) => {
      const player = event.data.player;

      if (!player.alive) return; // 已死亡，跳过

      // 求桃：自己使用桃直到体力 > 0 或无桃可用
      let usedTao = false;
      while (player.hp <= 0) {
        // TODO(玩家选择): 濒死时是否用桃自救/用哪张——目前写死为"有就出第一张"
        const tao = findResponse(player, CardType.Tao);
        if (!tao) break;
        console.log(`  🩸${player.name} 濒死！使用 🍑桃 自救`);
        await useCard(game, { player, card: tao, targets: [player] });
        usedTao = true;
      }

      if (usedTao && player.hp > 0) {
        console.log(`  💚${player.name} 脱离濒死，体力: ${player.hp}/${player.maxHp}`);
      }

      // 若仍死亡，真正阵亡
      if (player.hp <= 0) {
        await die(game, { player });
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
        event.getParent(EventType.Game)?.prevent();
      }
    });
}
