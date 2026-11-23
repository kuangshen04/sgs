/**
 * MVP Life 模块（R009）。
 *
 * Life 只拥有逐局生存状态和最终死亡行为；不读取 HP，也不判断胜负。
 */

import { defineEvent, type EventRuntime } from '../event/event.js';
import type { Player } from '../player/player.js';

export type LifeStatus = 'alive' | 'dead';

export type DieResult =
  | { readonly status: 'died' }
  | { readonly status: 'already-dead' };

export interface LifeDieData {
  readonly player: Player;
  result: DieResult | null;
}

const LifeDieEvent = defineEvent('life.die').withData<LifeDieData>();
export const LifeDie = LifeDieEvent.kind;

export interface LifeRuntime {
  statusOf(player: Player): LifeStatus;
  isAlive(player: Player): boolean;
  die(player: Player): Promise<DieResult>;
}

/** 创建逐局 LifeRuntime；所有登记 Player 初始存活。 */
export function createLifeRuntime(
  events: EventRuntime,
  players: readonly Player[],
): LifeRuntime {
  const states = new Map<Player, LifeStatus>();
  const playersById = new Map<string, Player>();
  const dying = new Set<Player>();

  for (const player of players) {
    if (states.has(player)) {
      throw new Error(`Player“${player.id}”在 LifeRuntime 中重复登记。`);
    }
    const sameId = playersById.get(player.id);
    if (sameId) {
      throw new Error(`LifeRuntime 中存在重复 PlayerId“${player.id}”。`);
    }
    states.set(player, 'alive');
    playersById.set(player.id, player);
  }

  const assertRegistered = (player: Player): LifeStatus => {
    const status = states.get(player);
    if (!status) {
      const sameId = playersById.get(player.id);
      if (sameId) {
        throw new Error(`Player“${player.id}”不是当前 LifeRuntime 的规范对象。`);
      }
      throw new Error(`Player“${player.id}”不属于当前 LifeRuntime。`);
    }
    return status;
  };

  const runtime: LifeRuntime = {
    statusOf(player: Player): LifeStatus {
      return assertRegistered(player);
    },

    isAlive(player: Player): boolean {
      return assertRegistered(player) === 'alive';
    },

    async die(player: Player): Promise<DieResult> {
      if (assertRegistered(player) === 'dead') {
        return Object.freeze({ status: 'already-dead' });
      }
      if (dying.has(player)) {
        throw new Error(`Player“${player.id}”的 LifeDie 正在执行，不能重入。`);
      }

      const data: LifeDieData = { player, result: null };
      dying.add(player);
      try {
        await LifeDieEvent.run(events, data, () => {
          states.set(player, 'dead');
          data.result = Object.freeze({ status: 'died' });
        });
      } finally {
        dying.delete(player);
      }

      if (!data.result) throw new Error('LifeDie 完成后缺少结果。');
      return data.result;
    },
  };

  return runtime;
}
