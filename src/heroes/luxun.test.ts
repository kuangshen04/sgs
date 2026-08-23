// ============================================================
// 陆逊 — 谦逊（锁定技：不能成为【顺手牵羊】/【乐不思蜀】的目标）
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from '../test-utils.js';

import { computeTargetOptions } from '../choose.js';
import { asUsedCard } from '../cardRegistry.js';

import { discardCards, moveCards } from '../cardActions.js';

import { effectRegistry } from '../persistentEffects.js';

import { registerSkills } from '../skills.js';

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

    const ssTargets = computeTargetOptions(g, asUsedCard(attacker.hand[0]), attacker);
    expect(ssTargets.map((t) => t.index)).toEqual([2]); // 陆逊被排除

    giveHand(attacker, CardType.LeBu);
    const lbTargets = computeTargetOptions(g, asUsedCard(attacker.hand[0]), attacker);
    expect(lbTargets.map((t) => t.index)).toEqual([2]);
  });

  it('可以被杀指定为目标', () => {
    const g = freshGame({}, ['刘备', '陆逊', '孙权']);
    const attacker = g.state.players[0];
    giveHand(attacker, CardType.Sha);

    const targets = computeTargetOptions(g, asUsedCard(attacker.hand[0]), attacker);
    expect(targets.map((t) => t.index)).toEqual([1, 2]);
  });
});

describe('连营（陆逊触发技能）', () => {
  it('失去最后手牌 → 摸一张牌', async () => {
    const g = freshGame({}, ['刘备', '陆逊', '孙权']);
    registerSkills(g);
    const luxun = g.state.players[1];
    giveHand(luxun, CardType.Sha);

    await discardCards(g, luxun, [luxun.hand[0]]);

    expect(luxun.hand.length).toBe(1); // 弃 1 摸 1
  });

  it('弃置后手牌仍非空 → 不触发', async () => {
    const g = freshGame({}, ['刘备', '陆逊', '孙权']);
    registerSkills(g);
    const luxun = g.state.players[1];
    giveHand(luxun, CardType.Sha, CardType.Tao);

    await discardCards(g, luxun, [luxun.hand[0]]);

    expect(luxun.hand.length).toBe(1); // 只剩桃，未摸牌
  });

  it('失去装备区内的牌 → 不触发连营', async () => {
    const g = freshGame({}, ['刘备', '陆逊', '孙权']);
    registerSkills(g);
    const luxun = g.state.players[1];
    const weapon = makeUniqueCard(CardType.ZhugeLianNu);
    luxun.equipment.weapon = weapon;
    const before = luxun.hand.length;

    await moveCards(g, {
      to: { zone: 'discardPile' }, cards: [weapon], reason: 'discard',
    });

    expect(luxun.hand.length).toBe(before); // 不触发
  });

  it('非陆逊 → 不触发', async () => {
    const g = freshGame({}, ['刘备', '陆逊', '孙权']);
    registerSkills(g);
    const liubei = g.state.players[0];
    giveHand(liubei, CardType.Sha);

    await discardCards(g, liubei, [liubei.hand[0]]);

    expect(liubei.hand.length).toBe(0); // 无连营
  });
});
