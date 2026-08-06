// ============================================================
// 三国杀最小原型 — 装备触发效果测试（麒麟弓/寒冰剑）
// 独立文件：这些测试需要 registerSkills(g) 接线（触发器随局隔离）。
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from './test-utils.js';

import { useCard } from './cardActions.js';

import { registerSkills } from './skills.js';

import { CardType } from './types.js';

describe('麒麟弓（装备触发）', () => {
  it('使用杀造成伤害后弃置目标一张坐骑牌', async () => {
    const g = freshGame();
    registerSkills(g);
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
    const g = freshGame();
    registerSkills(g);
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
    const g = freshGame();
    registerSkills(g);
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

  it('目标无手牌但有装备区牌 → 弃置装备区牌', async () => {
    const g = freshGame();
    registerSkills(g);
    const attacker = g.state.players[0];
    const target = g.state.players[1];
    attacker.equipment.weapon = makeUniqueCard(CardType.HanBingJian);
    target.equipment.armor = makeUniqueCard(CardType.BaGuaZhen);
    target.equipment.offensiveHorse = makeUniqueCard(CardType.ChiTu);
    giveHand(attacker, CardType.Sha);
    const hpBefore = target.hp;

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [target] });

    expect(target.hp).toBe(hpBefore); // 伤害被防止
    expect(target.equipment.armor).toBeUndefined();
    expect(target.equipment.offensiveHorse).toBeUndefined();
  });

  it('决斗伤害不发动（仅杀）', async () => {
    const g = freshGame();
    registerSkills(g);
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

describe('仁王盾（装备触发）', () => {
  it('黑色杀对装备者无效（targeting 时取消目标）', async () => {
    const g = freshGame();
    registerSkills(g);
    const attacker = g.state.players[0];
    const defender = g.state.players[1];
    defender.equipment.armor = makeUniqueCard(CardType.RenWangDun);
    const sha = makeUniqueCard(CardType.Sha, '♠', 3); // 黑色杀
    attacker.hand = [sha];
    const hpBefore = defender.hp;

    await useCard(g, { player: attacker, card: sha, targets: [defender] });

    expect(defender.hp).toBe(hpBefore); // 目标被取消，未受伤
  });

  it('红色杀正常生效', async () => {
    const g = freshGame();
    registerSkills(g);
    const attacker = g.state.players[0];
    const defender = g.state.players[1];
    defender.equipment.armor = makeUniqueCard(CardType.RenWangDun);
    const sha = makeUniqueCard(CardType.Sha, '♥', 3); // 红色杀
    const hpBefore = defender.hp;

    await useCard(g, { player: attacker, card: sha, targets: [defender] });

    expect(defender.hp).toBe(hpBefore - 1);
  });
});

describe('雌雄双股剑（装备触发）', () => {
  const mixedHeroes = ['刘备', '甄宓', '孙权']; // 男/女/男

  it('使用杀指定异性目标后，目标弃置一张手牌', async () => {
    const g = freshGame({}, mixedHeroes);
    registerSkills(g);
    const attacker = g.state.players[0]; // 刘备（男）
    const target = g.state.players[1];   // 甄宓（女）
    attacker.equipment.weapon = makeUniqueCard(CardType.CiXiongShuangGuJian);
    giveHand(attacker, CardType.Sha);
    giveHand(target, CardType.Tao, CardType.Tao); // 无闪 → 杀命中，桃不会被自动使用
    const hpBefore = target.hp;

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [target] });

    expect(target.hand.length).toBe(1); // 弃了一张手牌
    expect(target.hp).toBe(hpBefore - 1); // 杀照常命中
  });

  it('异性目标无手牌 → 使用者摸一张牌', async () => {
    const g = freshGame({}, mixedHeroes);
    registerSkills(g);
    const attacker = g.state.players[0];
    const target = g.state.players[1];
    attacker.equipment.weapon = makeUniqueCard(CardType.CiXiongShuangGuJian);
    giveHand(attacker, CardType.Sha);

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [target] });

    expect(attacker.hand.length).toBe(1); // 杀出掉后摸回一张
  });

  it('指定同性目标 → 不发动', async () => {
    const g = freshGame({}, mixedHeroes);
    registerSkills(g);
    const attacker = g.state.players[0]; // 刘备（男）
    const target = g.state.players[2];   // 孙权（男）
    attacker.equipment.weapon = makeUniqueCard(CardType.CiXiongShuangGuJian);
    giveHand(attacker, CardType.Sha);
    giveHand(target, CardType.Tao);
    const hpBefore = target.hp;

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [target] });

    expect(target.hand.length).toBe(1); // 手牌未被要求弃置
    expect(target.hp).toBe(hpBefore - 1);
  });

  it('非杀（决斗）→ 不发动', async () => {
    const g = freshGame({}, mixedHeroes);
    registerSkills(g);
    const attacker = g.state.players[0];
    const target = g.state.players[1]; // 异性
    attacker.equipment.weapon = makeUniqueCard(CardType.CiXiongShuangGuJian);
    giveHand(attacker, CardType.JueDou);
    giveHand(target, CardType.Tao);
    const hpBefore = target.hp;

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [target] });

    expect(target.hand.length).toBe(1); // 决斗造成的伤害不触发剑效果
    expect(target.hp).toBe(hpBefore - 1);
  });
});
