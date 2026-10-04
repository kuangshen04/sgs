import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  createPlayer,
  playerId,
  type Player,
  type PlayerId,
} from './player.js';

describe('PlayerId', () => {
  it('是由调用方显式给入的独立字符串类型', () => {
    const id = playerId('player-1');
    expect(id).toBe('player-1');
    expectTypeOf<PlayerId>().not.toEqualTypeOf<string>();
    expectTypeOf(id).toEqualTypeOf<PlayerId>();
  });

  it('拒绝空白 ID', () => {
    expect(() => playerId('')).toThrow(/PlayerId 不能为空/);
    expect(() => playerId('   ')).toThrow(/PlayerId 不能为空/);
  });
});

describe('Player', () => {
  it('只保存稳定身份和可选调试标签，并保持不可变', () => {
    const player = createPlayer({
      id: playerId('player-1'),
      label: '测试玩家甲',
    });

    expect(player).toEqual({ id: 'player-1', label: '测试玩家甲' });
    expect(Object.isFrozen(player)).toBe(true);
    expect(Object.keys(player)).toEqual(['id', 'label']);
  });

  it('允许不提供调试标签', () => {
    const player = createPlayer({ id: playerId('player-2') });
    expect(player).toEqual({ id: 'player-2' });
    expect('label' in player).toBe(false);
  });

  it('外部逐局状态可以用冻结的 Player 作为 WeakMap 键', () => {
    const player = createPlayer({ id: playerId('player-1') });
    const hp = new WeakMap<Player, { current: number }>();
    hp.set(player, { current: 4 });

    expect(hp.get(player)).toEqual({ current: 4 });
  });

  it('拒绝空白调试标签和绕过工厂构造的空 ID', () => {
    expect(() => createPlayer({
      id: playerId('player-1'),
      label: '  ',
    })).toThrow(/Player.label 不能为空/);

    expect(() => createPlayer({ id: '' as PlayerId }))
      .toThrow(/PlayerId 不能为空/);
  });
});
