import { describe, expect, it } from 'vitest';

import { createEventRuntime } from '../event/event.js';
import { createPlayer, playerId, type Player } from '../player/player.js';
import { createLifeRuntime, LifeDie } from './life.js';

function players(): readonly [Player, Player] {
  return [
    createPlayer({ id: playerId('player-1'), label: '甲' }),
    createPlayer({ id: playerId('player-2'), label: '乙' }),
  ];
}

describe('LifeRuntime', () => {
  it('逐局登记 Player，初始状态均为存活', () => {
    const events = createEventRuntime();
    const [first, second] = players();
    const life = createLifeRuntime(events, [first, second]);

    expect(life.statusOf(first)).toBe('alive');
    expect(life.isAlive(first)).toBe(true);
    expect(life.statusOf(second)).toBe('alive');
  });

  it('LifeDie 的 before 观察存活，after 观察死亡和结果', async () => {
    const events = createEventRuntime();
    const [player] = players();
    const life = createLifeRuntime(events, [player]);
    const order: string[] = [];

    events.on(LifeDie.before, event => {
      order.push('before');
      expect(event.data.player).toBe(player);
      expect(event.data.result).toBeNull();
      expect(life.isAlive(player)).toBe(true);
    });
    events.on(LifeDie.after, event => {
      order.push('after');
      expect(event.data.result).toEqual({ status: 'died' });
      expect(life.isAlive(player)).toBe(false);
    });

    const result = await life.die(player);

    expect(result).toEqual({ status: 'died' });
    expect(Object.isFrozen(result)).toBe(true);
    expect(order).toEqual(['before', 'after']);
    expect(life.statusOf(player)).toBe('dead');
  });

  it('重复死亡返回正常结果，不创建第二个事件', async () => {
    const events = createEventRuntime();
    const [player] = players();
    const life = createLifeRuntime(events, [player]);

    await life.die(player);
    const historyLength = events.history.length;
    const result = await life.die(player);

    expect(result).toEqual({ status: 'already-dead' });
    expect(events.history).toHaveLength(historyLength);
  });

  it('拒绝外局 Player 和同 ID 的伪规范对象', async () => {
    const events = createEventRuntime();
    const [player] = players();
    const life = createLifeRuntime(events, [player]);
    const outsider = createPlayer({ id: playerId('outsider') });
    const fake = createPlayer({ id: player.id });

    expect(() => life.statusOf(outsider)).toThrow(/不属于当前 LifeRuntime/);
    expect(() => life.isAlive(fake)).toThrow(/不是.*规范对象/);
    await expect(life.die(outsider)).rejects.toThrow(/不属于当前 LifeRuntime/);
  });

  it('拒绝重复 Player 和重复 PlayerId', () => {
    const events = createEventRuntime();
    const [player] = players();
    const sameId = createPlayer({ id: player.id, label: '伪对象' });

    expect(() => createLifeRuntime(events, [player, player]))
      .toThrow(/重复登记/);
    expect(() => createLifeRuntime(events, [player, sameId]))
      .toThrow(/重复 PlayerId/);
  });

  it('不同 Runtime 的状态互相隔离', async () => {
    const [player] = players();
    const one = createLifeRuntime(createEventRuntime(), [player]);
    const two = createLifeRuntime(createEventRuntime(), [player]);

    await one.die(player);

    expect(one.isAlive(player)).toBe(false);
    expect(two.isAlive(player)).toBe(true);
  });

  it('after hook 故障向上传播，但不回滚已经完成的死亡', async () => {
    const events = createEventRuntime();
    const [player] = players();
    const life = createLifeRuntime(events, [player]);
    events.on(LifeDie.after, () => {
      throw new Error('死亡后 hook 故障');
    });

    await expect(life.die(player)).rejects.toThrow('死亡后 hook 故障');
    expect(life.statusOf(player)).toBe('dead');
    expect(events.current).toBeNull();
  });

  it('拒绝同一 Player 的 LifeDie 重入，并正确解卷事件栈', async () => {
    const events = createEventRuntime();
    const [player] = players();
    const life = createLifeRuntime(events, [player]);
    events.on(LifeDie.before, async () => {
      await life.die(player);
    });

    await expect(life.die(player)).rejects.toThrow(/LifeDie 正在执行/);
    expect(life.statusOf(player)).toBe('alive');
    expect(events.current).toBeNull();
  });
});
