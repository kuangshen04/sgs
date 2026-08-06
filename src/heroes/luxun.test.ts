// ============================================================
// 陆逊 — 谦逊（锁定技：不能成为【顺手牵羊】/【乐不思蜀】的目标）
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand } from '../test-utils.js';

import { computeTargetOptions } from '../choose.js';

import { effectRegistry } from '../persistentEffects.js';

import { CardType } from '../types.js';

describe('谦逊（陆逊锁定技）', () => {
  it('effectRegistry：陆逊拥有 immuneShunShou/immuneLeBu', () => {
    const g = freshGame({}, ['刘备', '陆逊', '孙权']);
    const luxun = g.state.players[1];

    expect(effectRegistry.has(luxun, 'immuneShunShou')).toBe(true);
    expect(effectRegistry.has(luxun, 'immuneLeBu')).toBe(true);
    expect(effectRegistry.has(luxun, 'immuneSha')).toBe(false); // 杀不受谦逊影响
  });

  it('不能成为顺手牵羊/乐不思蜀的目标（targetFilter 排除）', () => {
    const g = freshGame({}, ['刘备', '陆逊', '孙权']);
    const attacker = g.state.players[0];
    const luxun = g.state.players[1];
    const sunquan = g.state.players[2];
    giveHand(luxun, CardType.Sha); // 陆逊有牌，排除手牌因素
    giveHand(sunquan, CardType.Tao);
    giveHand(attacker, CardType.ShunShou);

    const ssTargets = computeTargetOptions(g, attacker.hand[0], attacker);
    expect(ssTargets.map((t) => t.index)).toEqual([2]); // 陆逊被排除

    giveHand(attacker, CardType.LeBu);
    const lbTargets = computeTargetOptions(g, attacker.hand[0], attacker);
    expect(lbTargets.map((t) => t.index)).toEqual([2]);
  });

  it('可以被杀指定为目标', () => {
    const g = freshGame({}, ['刘备', '陆逊', '孙权']);
    const attacker = g.state.players[0];
    giveHand(attacker, CardType.Sha);

    const targets = computeTargetOptions(g, attacker.hand[0], attacker);
    expect(targets.map((t) => t.index)).toEqual([1, 2]);
  });
});
