// ============================================================
// 黄月英 — 集智
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand } from '../test-utils.js';

import { computeTargetOptions } from '../choose.js';
import { useCard } from '../cardActions.js';
import { asUsedCard } from '../cardRegistry.js';

import { effectRegistry } from '../persistentEffects.js';
import { registerSkills, skillRegistry } from '../skills.js';

import { CardType } from '../types.js';

describe('集智（黄月英技能）', () => {
  it('skillRegistry 已注册集智', () => {
    expect(skillRegistry.get('集智')).toBeDefined();
  });

  it('使用普通锦囊 → 摸 1 张牌', async () => {
    const g = freshGame({}, ['刘备', '黄月英', '孙权']);
    registerSkills(g);
    const yueying = g.state.players[1];
    giveHand(yueying, CardType.WuZhong);
    const card = yueying.hand[0];

    await useCard(g, { player: yueying, card, targets: [yueying] });

    // 无中生有：用 1 摸 2，集智再摸 1 → 3 张
    expect(yueying.hand.length).toBe(3);
  });

  it('使用基本牌 → 不触发', async () => {
    const g = freshGame({}, ['刘备', '黄月英', '孙权']);
    registerSkills(g);
    const yueying = g.state.players[1];
    giveHand(yueying, CardType.Sha);
    const card = yueying.hand[0];

    await useCard(g, { player: yueying, card, targets: [g.state.players[0]] });

    expect(yueying.hand.length).toBe(0); // 杀已用，未摸牌
  });

  it('使用延时锦囊 → 不触发', async () => {
    const g = freshGame({}, ['刘备', '黄月英', '孙权']);
    registerSkills(g);
    const yueying = g.state.players[1];
    giveHand(yueying, CardType.LeBu);
    const card = yueying.hand[0];

    await useCard(g, { player: yueying, card, targets: [g.state.players[2]] });

    expect(yueying.hand.length).toBe(0); // 乐不思蜀置入判定区，未摸牌
  });
});

describe('奇才（黄月英锁定技）', () => {
  it('effectRegistry：黄月英拥有 noTrickDistance，普通角色没有', () => {
    const g = freshGame({}, ['刘备', '黄月英', '孙权']);
    expect(effectRegistry.has(g.state.players[1], 'noTrickDistance')).toBe(true);
    expect(effectRegistry.has(g.state.players[0], 'noTrickDistance')).toBe(false);
  });

  it('4人局：奇才让顺手牵羊无视距离', () => {
    const g = freshGame({}, ['刘备', '黄月英', '孙权', '郭嘉']);
    const player = g.state.players[0];
    const yueying = g.state.players[1];
    giveHand(g.state.players[0], CardType.Sha);
    giveHand(g.state.players[2], CardType.Tao);
    giveHand(g.state.players[3], CardType.Shan);

    // 黄月英（索引 1）：无距离限制，可牵所有有牌角色
    giveHand(yueying, CardType.ShunShou);
    const yueyingTargets = computeTargetOptions(g, asUsedCard(yueying.hand[0]), yueying);
    expect(yueyingTargets.map((t) => t.index)).toEqual([0, 2, 3]);

    // 刘备（索引 0，无奇才）：只能牵距离 1 的角色
    giveHand(player, CardType.ShunShou);
    const liubeiTargets = computeTargetOptions(g, asUsedCard(player.hand[0]), player);
    expect(liubeiTargets.map((t) => t.index)).toEqual([1, 3]);
  });

  it('奇才不影响杀（仍受攻击范围限制）', () => {
    const g = freshGame({}, ['刘备', '黄月英', '孙权', '郭嘉']);
    const yueying = g.state.players[1];
    giveHand(yueying, CardType.Sha);

    const targets = computeTargetOptions(g, asUsedCard(yueying.hand[0]), yueying);
    // 黄月英[1]：刘备[0]/孙权[2] 距离 1，郭嘉[3] 距离 2 超出范围 → 奇才不豁免杀
    expect(targets.map((t) => t.index)).toEqual([0, 2]);
  });
});
