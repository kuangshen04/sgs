// ============================================================
// 大乔 — 流离
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand } from '../test-utils.js';

import { useCard } from '../cardActions.js';

import { registerSkills, skillRegistry } from '../skills.js';

import { CardType } from '../types.js';

describe('流离（大乔技能）', () => {
  it('skillRegistry 已注册流离', () => {
    expect(skillRegistry.get('流离')).toBeDefined();
  });

  it('成为杀的目标 → 弃一张牌，将杀转移给攻击范围内其他角色', async () => {
    const g = freshGame({}, ['大乔', '刘备', '孙权']);
    registerSkills(g);
    const daqiao = g.state.players[0];
    const attacker = g.state.players[1]; // 刘备
    const redirected = g.state.players[2]; // 孙权（大乔攻击范围内、非使用者）
    giveHand(attacker, CardType.Sha);
    giveHand(daqiao, CardType.Tao); // 弃牌素材
    giveHand(redirected);           // 无闪
    const daqiaoHpBefore = daqiao.hp;
    const redirectedHpBefore = redirected.hp;

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [daqiao] });

    expect(daqiao.hp).toBe(daqiaoHpBefore);          // 原目标不受伤害
    expect(redirected.hp).toBe(redirectedHpBefore - 1); // 新目标受伤害
    expect(daqiao.hand.length).toBe(0);              // 弃了一张牌
  });

  it('无合法转移目标（只有使用者）→ 不发动，正常受击', async () => {
    const g = freshGame({}, ['刘备', '大乔']); // 2 人局：流离无其他角色可转移
    registerSkills(g);
    const attacker = g.state.players[0];
    const daqiao = g.state.players[1];
    giveHand(attacker, CardType.Sha);
    giveHand(daqiao, CardType.Tao);
    const hpBefore = daqiao.hp;

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [daqiao] });

    expect(daqiao.hp).toBe(hpBefore - 1); // 杀命中
    expect(daqiao.hand.length).toBe(1);   // 未弃牌
  });

  it('无牌可弃 → 不发动', async () => {
    const g = freshGame({}, ['大乔', '刘备', '孙权']);
    registerSkills(g);
    const daqiao = g.state.players[0];
    const attacker = g.state.players[1];
    giveHand(attacker, CardType.Sha);
    const hpBefore = daqiao.hp;

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [daqiao] });

    expect(daqiao.hp).toBe(hpBefore - 1); // 无牌可弃，杀命中
  });

  it('非杀（决斗）→ 不触发', async () => {
    const g = freshGame({}, ['大乔', '刘备', '孙权']);
    registerSkills(g);
    const daqiao = g.state.players[0];
    const attacker = g.state.players[1];
    giveHand(attacker, CardType.JueDou);
    giveHand(daqiao, CardType.Tao);
    const hpBefore = daqiao.hp;

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [daqiao] });

    // 决斗：大乔无杀 → 大乔受伤，流离不触发
    expect(daqiao.hp).toBe(hpBefore - 1);
    expect(daqiao.hand.length).toBe(1); // 未弃牌
  });
});
