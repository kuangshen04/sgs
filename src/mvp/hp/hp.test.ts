import { describe, expect, it } from 'vitest';

import { createEventRuntime } from '../event/event.js';
import { createLifeRuntime, LifeDie } from '../life/life.js';
import { createPlayer, playerId, type Player } from '../player/player.js';
import {
  createHpRuntime,
  Damage,
  LoseHp,
  Recover,
} from './hp.js';

function setup(targetCurrent = 4) {
  const events = createEventRuntime();
  const source = createPlayer({ id: playerId('source'), label: '来源' });
  const target = createPlayer({ id: playerId('target'), label: '目标' });
  const life = createLifeRuntime(events, [source, target]);
  const hp = createHpRuntime({
    events,
    life,
    players: [
      { player: source, max: 4 },
      { player: target, max: 4, current: targetCurrent },
    ],
  });
  return { events, source, target, life, hp };
}

describe('HpRuntime 状态', () => {
  it('保存逐局初始状态，并只返回冻结快照', async () => {
    const { hp, source, target } = setup(3);
    const oldSnapshot = hp.stateOf(target);

    expect(oldSnapshot).toEqual({ current: 3, max: 4 });
    expect(Object.isFrozen(oldSnapshot)).toBe(true);
    expect(hp.currentOf(target)).toBe(3);
    expect(hp.maxOf(target)).toBe(4);
    expect(hp.isWounded(target)).toBe(true);

    await hp.recover(target, 1);
    expect(oldSnapshot).toEqual({ current: 3, max: 4 });
    expect(hp.stateOf(target)).toEqual({ current: 4, max: 4 });
    expect(hp.isWounded(source)).toBe(false);
  });

  it('校验初始体力、重复 Player 以及 LifeRuntime 对应关系', () => {
    const events = createEventRuntime();
    const player = createPlayer({ id: playerId('player') });
    const sameId = createPlayer({ id: player.id });
    const outsider = createPlayer({ id: playerId('outsider') });
    const life = createLifeRuntime(events, [player]);

    expect(() => createHpRuntime({
      events,
      life,
      players: [{ player, max: 0 }],
    })).toThrow(/最大体力.*正整数/);
    expect(() => createHpRuntime({
      events,
      life,
      players: [{ player, max: 4, current: 0 }],
    })).toThrow(/初始体力.*1\.\.4/);
    expect(() => createHpRuntime({
      events,
      life,
      players: [{ player, max: 4 }, { player, max: 4 }],
    })).toThrow(/重复登记/);
    expect(() => createHpRuntime({
      events,
      life,
      players: [{ player, max: 4 }, { player: sameId, max: 4 }],
    })).toThrow(/重复 PlayerId/);
    expect(() => createHpRuntime({
      events,
      life,
      players: [{ player: outsider, max: 4 }],
    })).toThrow(/不属于当前 LifeRuntime/);
  });

  it('不同 Runtime 的体力状态互相隔离', async () => {
    const eventsOne = createEventRuntime();
    const eventsTwo = createEventRuntime();
    const player = createPlayer({ id: playerId('player') });
    const lifeOne = createLifeRuntime(eventsOne, [player]);
    const lifeTwo = createLifeRuntime(eventsTwo, [player]);
    const one = createHpRuntime({
      events: eventsOne,
      life: lifeOne,
      players: [{ player, max: 4 }],
    });
    const two = createHpRuntime({
      events: eventsTwo,
      life: lifeTwo,
      players: [{ player, max: 4 }],
    });

    await one.lose(player, 1);

    expect(one.currentOf(player)).toBe(3);
    expect(two.currentOf(player)).toBe(4);
  });
});

describe('damage', () => {
  it('before 可以改写伤害值，after 观察最终结果', async () => {
    const { events, source, target, life, hp } = setup();
    const order: string[] = [];
    events.on(Damage.before, event => {
      order.push('before');
      event.data.amount = 2;
      expect(event.data.result).toBeNull();
    });
    events.on(Damage.after, event => {
      order.push('after');
      expect(event.data.result).toEqual({
        status: 'applied', before: 4, after: 2, applied: 2,
      });
      expect(hp.currentOf(target)).toBe(2);
      expect(life.isAlive(target)).toBe(true);
    });

    const result = await hp.damage({ source, target, amount: 1 });

    expect(result).toEqual({ status: 'applied', before: 4, after: 2, applied: 2 });
    expect(Object.isFrozen(result)).toBe(true);
    expect(order).toEqual(['before', 'after']);
  });

  it('取消伤害是正常结果，不修改 HP，也不派发 after', async () => {
    const { events, source, target, hp } = setup();
    let after = false;
    events.on(Damage.before, event => {
      event.data.cancelled = true;
    });
    events.on(Damage.after, () => {
      after = true;
    });

    const result = await hp.damage({ source, target, amount: 2 });

    expect(result).toEqual({ status: 'prevented', before: 4, after: 4 });
    expect(hp.currentOf(target)).toBe(4);
    expect(after).toBe(false);
  });

  it('before 产生非法伤害值时 fail-stop，且不提交状态', async () => {
    const { events, source, target, hp } = setup();
    events.on(Damage.before, event => {
      event.data.amount = 0;
    });

    await expect(hp.damage({ source, target, amount: 1 }))
      .rejects.toThrow(/修改后的伤害值.*正整数/);
    expect(hp.currentOf(target)).toBe(4);
    expect(events.current).toBeNull();
  });

  it('致死伤害保留负体力，并在 Damage 内嵌套 LifeDie', async () => {
    const { events, source, target, life, hp } = setup(1);
    const parents: string[] = [];
    events.on(LifeDie.before, event => {
      parents.push(event.parent?.kind.name ?? 'none');
      expect(hp.currentOf(target)).toBe(-1);
      expect(life.isAlive(target)).toBe(true);
    });
    events.on(Damage.after, event => {
      expect(event.data.result).toEqual({
        status: 'applied', before: 1, after: -1, applied: 2,
      });
      expect(life.isAlive(target)).toBe(false);
    });

    await hp.damage({ source, target, amount: 2 });

    expect(hp.currentOf(target)).toBe(-1);
    expect(life.statusOf(target)).toBe('dead');
    expect(parents).toEqual(['hp.damage']);
  });

  it('after hook 故障不回滚已经造成的伤害', async () => {
    const { events, source, target, hp } = setup();
    events.on(Damage.after, () => {
      throw new Error('伤害后 hook 故障');
    });

    await expect(hp.damage({ source, target, amount: 1 }))
      .rejects.toThrow('伤害后 hook 故障');
    expect(hp.currentOf(target)).toBe(3);
    expect(events.current).toBeNull();
  });
});

describe('lose 与 recover', () => {
  it('失去体力使用独立事件，不产生 Damage', async () => {
    const { events, target, hp } = setup();
    const seen: string[] = [];
    events.on(Damage.before, () => { seen.push('damage'); });
    events.on(LoseHp.before, event => {
      seen.push('lose.before');
      event.data.amount = 2;
    });
    events.on(LoseHp.after, event => {
      seen.push('lose.after');
      expect(event.data.result).toEqual({ before: 4, after: 2, applied: 2 });
    });

    const result = await hp.lose(target, 1);

    expect(result).toEqual({ before: 4, after: 2, applied: 2 });
    expect(seen).toEqual(['lose.before', 'lose.after']);
  });

  it('失去体力归零同样嵌套 LifeDie', async () => {
    const { events, target, life, hp } = setup(1);
    let parent = '';
    events.on(LifeDie.before, event => {
      parent = event.parent?.kind.name ?? '';
    });

    const result = await hp.lose(target, 2);

    expect(result).toEqual({ before: 1, after: -1, applied: 2 });
    expect(life.isAlive(target)).toBe(false);
    expect(parent).toBe('hp.lose');
  });

  it('回复不超过上限，并报告实际回复量', async () => {
    const { events, target, hp } = setup(3);
    const afterResults: unknown[] = [];
    events.on(Recover.after, event => {
      afterResults.push(event.data.result);
    });

    const result = await hp.recover(target, 3);

    expect(result).toEqual({ before: 3, after: 4, applied: 1 });
    expect(hp.currentOf(target)).toBe(4);

    await expect(hp.recover(target, 1)).resolves.toEqual({
      before: 4, after: 4, applied: 0,
    });
    expect(afterResults).toEqual([
      { before: 3, after: 4, applied: 1 },
      { before: 4, after: 4, applied: 0 },
    ]);
  });
});

describe('HpRuntime 严格执行域', () => {
  it('拒绝外局 Player、同 ID 伪对象和非法 amount', async () => {
    const { source, target, hp } = setup();
    const outsider = createPlayer({ id: playerId('outsider') });
    const fake = createPlayer({ id: target.id });

    expect(() => hp.stateOf(outsider)).toThrow(/不属于当前 HpRuntime/);
    expect(() => hp.currentOf(fake)).toThrow(/不是.*规范对象/);
    await expect(hp.damage({ source, target, amount: 0 }))
      .rejects.toThrow(/伤害值必须是正整数/);
    await expect(hp.lose(target, -1)).rejects.toThrow(/正整数/);
    await expect(hp.recover(target, 1.5)).rejects.toThrow(/正整数/);
  });

  it('死亡后仍可读取 HP，但不能继续执行体力行为', async () => {
    const { source, target, hp } = setup(1);
    await hp.damage({ source, target, amount: 1 });

    expect(hp.stateOf(target)).toEqual({ current: 0, max: 4 });
    await expect(hp.damage({ source, target, amount: 1 }))
      .rejects.toThrow(/死亡 Player/);
    await expect(hp.lose(target, 1)).rejects.toThrow(/死亡 Player/);
    await expect(hp.recover(target, 1)).rejects.toThrow(/死亡 Player/);
  });

  it('非空伤害来源必须属于当前 HpRuntime，但可以已经死亡', async () => {
    const { source, target, hp, life } = setup();
    const outsider = createPlayer({ id: playerId('outsider') });

    await expect(hp.damage({ source: outsider, target, amount: 1 }))
      .rejects.toThrow(/不属于当前 HpRuntime/);

    await life.die(source);
    await expect(hp.damage({ source, target, amount: 1 })).resolves.toMatchObject({
      status: 'applied',
      after: 3,
    });
  });
});
