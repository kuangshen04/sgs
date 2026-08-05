// ============================================================
// 三国杀最小原型 — 装备触发效果测试（麒麟弓/寒冰剑）
// 独立文件：这些测试需要 registerSkills 接线，用 afterEach 隔离，
// 避免把技能 handler 泄漏到其他测试文件。
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from './test-utils.js';

import { useCard } from './cardActions.js';

import { registerSkills } from './skills.js';
import { triggerSystem } from './events/index.js';

import { CardType } from './types.js';

afterEach(() => triggerSystem.clear());

describe('麒麟弓（装备触发）', () => {
  it('使用杀造成伤害后弃置目标一张坐骑牌', async () => {
    registerSkills();
    const g = freshGame();
    const attacker = g.state.players[0];
    const target = g.state.players[1];
    attacker.equipment.weapon = makeUniqueCard(CardType.QiLinGong);
    target.equipment.offensiveHorse = makeUniqueCard(CardType.ChiTu);
    giveHand(attacker, CardType.Sha);
    const hpBefore = target.hp;

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [target] });

    expect(target.hp).toBe(hpBefore - 1);                     // 伤害照常
    expect(target.equipment.offensiveHorse).toBeUndefined();  // 坐骑被弃
    expect(g.state.discardPile.some((c) => c.type === CardType.ChiTu)).toBe(true);
  });

  it('目标无坐骑 → 不发动', async () => {
    registerSkills();
    const g = freshGame();
    const attacker = g.state.players[0];
    const target = g.state.players[1];
    attacker.equipment.weapon = makeUniqueCard(CardType.QiLinGong);
    giveHand(attacker, CardType.Sha);
    const hpBefore = target.hp;

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [target] });

    expect(target.hp).toBe(hpBefore - 1);
    expect(g.state.discardPile.filter((c) => c.type === CardType.ChiTu).length).toBe(0);
  });
});

describe('寒冰剑（装备触发）', () => {
  it('使用杀造成伤害时：防止伤害并弃置两张牌', async () => {
    registerSkills();
    const g = freshGame();
    const attacker = g.state.players[0];
    const target = g.state.players[1];
    attacker.equipment.weapon = makeUniqueCard(CardType.HanBingJian);
    giveHand(target, CardType.Sha, CardType.Tao); // 无闪
    giveHand(attacker, CardType.Sha);
    const hpBefore = target.hp;

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [target] });

    expect(target.hp).toBe(hpBefore);   // 伤害被防止
    expect(target.hand.length).toBe(0); // 两张都被弃
  });

  it('决斗伤害不发动（仅杀）', async () => {
    registerSkills();
    const g = freshGame();
    const attacker = g.state.players[0];
    const target = g.state.players[1];
    attacker.equipment.weapon = makeUniqueCard(CardType.HanBingJian);
    giveHand(attacker, CardType.JueDou);
    giveHand(target, CardType.Sha, CardType.Tao);
    const hpBefore = attacker.hp;

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [target] });

    // 决斗：目标有杀 → 打出 → 攻击方无杀 → 攻击方受伤，寒冰剑不发动
    expect(attacker.hp).toBe(hpBefore - 1);
  });
});
