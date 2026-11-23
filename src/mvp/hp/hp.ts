/**
 * MVP HP 模块（R009）。
 *
 * HP 外置保存体力，并区分伤害、失去体力和回复；体力归零时显式调用 Life。
 */

import { defineEvent, type EventRuntime } from '../event/event.js';
import type { LifeRuntime } from '../life/life.js';
import type { Player } from '../player/player.js';

export interface HpState {
  readonly current: number;
  readonly max: number;
}

export interface HpInitialState {
  readonly player: Player;
  readonly max: number;
  readonly current?: number;
}

export interface DamageInput {
  readonly source: Player | null;
  readonly target: Player;
  readonly amount: number;
}

export interface HpChangeResult {
  readonly before: number;
  readonly after: number;
  /** 本次实际扣除或回复的非负数值。 */
  readonly applied: number;
}

export type DamageResult =
  | ({ readonly status: 'applied' } & HpChangeResult)
  | {
    readonly status: 'prevented';
    readonly before: number;
    readonly after: number;
  };

export interface DamageData {
  readonly source: Player | null;
  readonly target: Player;
  amount: number;
  cancelled: boolean;
  result: DamageResult | null;
}

export interface LoseHpData {
  readonly player: Player;
  amount: number;
  result: HpChangeResult | null;
}

export interface RecoverData {
  readonly player: Player;
  amount: number;
  result: HpChangeResult | null;
}

const DamageEvent = defineEvent('hp.damage').withData<DamageData>();
const LoseHpEvent = defineEvent('hp.lose').withData<LoseHpData>();
const RecoverEvent = defineEvent('hp.recover').withData<RecoverData>();

export const Damage = DamageEvent.kind;
export const LoseHp = LoseHpEvent.kind;
export const Recover = RecoverEvent.kind;

export interface HpRuntime {
  stateOf(player: Player): HpState;
  currentOf(player: Player): number;
  maxOf(player: Player): number;
  isWounded(player: Player): boolean;

  damage(input: DamageInput): Promise<DamageResult>;
  lose(player: Player, amount: number): Promise<HpChangeResult>;
  recover(player: Player, amount: number): Promise<HpChangeResult>;
}

interface MutableHpState {
  current: number;
  readonly max: number;
}

/** 创建逐局 HpRuntime；初始状态必须与注入的 LifeRuntime 使用同一批规范 Player。 */
export function createHpRuntime(input: {
  readonly events: EventRuntime;
  readonly life: LifeRuntime;
  readonly players: readonly HpInitialState[];
}): HpRuntime {
  const { events, life } = input;
  const states = new Map<Player, MutableHpState>();
  const playersById = new Map<string, Player>();

  for (const initial of input.players) {
    const { player, max } = initial;
    if (states.has(player)) {
      throw new Error(`Player“${player.id}”在 HpRuntime 中重复登记。`);
    }
    if (playersById.has(player.id)) {
      throw new Error(`HpRuntime 中存在重复 PlayerId“${player.id}”。`);
    }
    assertPositiveInteger(max, '初始最大体力');
    const current = initial.current ?? max;
    if (!Number.isInteger(current) || current < 1 || current > max) {
      throw new Error(`Player“${player.id}”的初始体力必须是 1..${max} 的整数。`);
    }

    // 同时验证 Player 属于注入的 LifeRuntime，避免两套逐局状态错配。
    life.statusOf(player);
    states.set(player, { current, max });
    playersById.set(player.id, player);
  }

  const assertRegistered = (player: Player): MutableHpState => {
    const state = states.get(player);
    if (!state) {
      if (playersById.has(player.id)) {
        throw new Error(`Player“${player.id}”不是当前 HpRuntime 的规范对象。`);
      }
      throw new Error(`Player“${player.id}”不属于当前 HpRuntime。`);
    }
    return state;
  };

  const assertAlive = (player: Player): MutableHpState => {
    const state = assertRegistered(player);
    if (!life.isAlive(player)) {
      throw new Error(`死亡 Player“${player.id}”不能执行体力行为。`);
    }
    return state;
  };

  const snapshot = (state: MutableHpState): HpState => Object.freeze({
    current: state.current,
    max: state.max,
  });

  const runtime: HpRuntime = {
    stateOf(player: Player): HpState {
      return snapshot(assertRegistered(player));
    },

    currentOf(player: Player): number {
      return assertRegistered(player).current;
    },

    maxOf(player: Player): number {
      return assertRegistered(player).max;
    },

    isWounded(player: Player): boolean {
      const state = assertRegistered(player);
      return state.current < state.max;
    },

    async damage(damageInput: DamageInput): Promise<DamageResult> {
      const state = assertAlive(damageInput.target);
      if (damageInput.source) assertRegistered(damageInput.source);
      assertPositiveInteger(damageInput.amount, '伤害值');

      const data: DamageData = {
        source: damageInput.source,
        target: damageInput.target,
        amount: damageInput.amount,
        cancelled: false,
        result: null,
      };

      await DamageEvent.run(events, data, async event => {
        await event.emit('before');
        // hook 可能嵌套执行其它行为；提交前重新确认目标仍处于定义域。
        assertAlive(data.target);
        if (data.cancelled) {
          data.result = Object.freeze({
            status: 'prevented',
            before: state.current,
            after: state.current,
          });
          return;
        }

        assertPositiveInteger(data.amount, 'Damage.before 修改后的伤害值');
        const before = state.current;
        state.current -= data.amount;
        if (state.current <= 0) await life.die(data.target);
        data.result = Object.freeze({
          status: 'applied',
          before,
          after: state.current,
          applied: data.amount,
        });
        await event.emit('after');
      }, { hooks: 'manual' });

      if (!data.result) throw new Error('Damage 完成后缺少结果。');
      return data.result;
    },

    async lose(player: Player, amount: number): Promise<HpChangeResult> {
      const state = assertAlive(player);
      assertPositiveInteger(amount, '失去体力值');
      const data: LoseHpData = { player, amount, result: null };

      await LoseHpEvent.run(events, data, async () => {
        assertAlive(player);
        assertPositiveInteger(data.amount, 'LoseHp.before 修改后的失去体力值');
        const before = state.current;
        state.current -= data.amount;
        if (state.current <= 0) await life.die(player);
        data.result = Object.freeze({
          before,
          after: state.current,
          applied: data.amount,
        });
      });

      if (!data.result) throw new Error('LoseHp 完成后缺少结果。');
      return data.result;
    },

    async recover(player: Player, amount: number): Promise<HpChangeResult> {
      const state = assertAlive(player);
      assertPositiveInteger(amount, '回复体力值');
      const data: RecoverData = { player, amount, result: null };

      await RecoverEvent.run(events, data, () => {
        assertAlive(player);
        assertPositiveInteger(data.amount, 'Recover.before 修改后的回复体力值');
        const before = state.current;
        state.current = Math.min(state.current + data.amount, state.max);
        data.result = Object.freeze({
          before,
          after: state.current,
          applied: state.current - before,
        });
      });

      if (!data.result) throw new Error('Recover 完成后缺少结果。');
      return data.result;
    },
  };

  return runtime;
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name}必须是正整数。`);
  }
}
