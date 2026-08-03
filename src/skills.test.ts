// ============================================================
// 三国杀最小原型 — skills.ts 单元测试
// 技能注册与触发（遗计）
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from './test-utils.js';

import { damage } from './game.js';
import { drawPhase, playPhase, turn } from './gameFlow.js';

import { activeSkillRegistry, registerSkills, skillRegistry } from './skills.js';
import { triggerSystem } from './events/index.js';

import { CardType } from './types.js';
import type { Hero } from './types.js';

// ============================================================
// 遗计（郭嘉：受到伤害后每 1 点伤害摸 2 张牌）
// ============================================================

describe('遗计（郭嘉技能）', () => {
  const guojiaHeroes: Hero[] = [
    { name: '刘备', maxHp: 4 },
    { name: '郭嘉', maxHp: 3, skills: ['遗计'] },
    { name: '孙权', maxHp: 4 },
  ];

  afterEach(() => triggerSystem.clear());

  it('skillRegistry 已注册遗计', () => {
    expect(skillRegistry.get('遗计')).toBeDefined();
  });

  it('郭嘉受到 1 点伤害 → 摸 2 张牌', async () => {
    registerSkills();
    const g = freshGame({}, guojiaHeroes);
    const guojia = g.state.players[1];
    const before = guojia.hand.length;

    await damage(g, { target: guojia, source: g.state.players[0], amount: 1 });

    expect(guojia.hand.length).toBe(before + 2);
  });

  it('郭嘉受到 2 点伤害 → 摸 4 张牌', async () => {
    registerSkills();
    const g = freshGame({}, guojiaHeroes);
    const guojia = g.state.players[1];
    const before = guojia.hand.length;

    await damage(g, { target: guojia, source: g.state.players[0], amount: 2 });

    expect(guojia.hand.length).toBe(before + 4);
  });

  it('非郭嘉受伤 → 不触发', async () => {
    registerSkills();
    const g = freshGame({}, guojiaHeroes);
    const liubei = g.state.players[0];
    const before = liubei.hand.length;

    await damage(g, { target: liubei, source: g.state.players[1], amount: 1 });

    expect(liubei.hand.length).toBe(before);
  });

  it('未调用 registerSkills → 不触发', async () => {
    const g = freshGame({}, guojiaHeroes);
    const guojia = g.state.players[1];
    const before = guojia.hand.length;

    await damage(g, { target: guojia, source: g.state.players[0], amount: 1 });

    expect(guojia.hand.length).toBe(before);
  });
});

// ============================================================
// 英姿（周瑜：摸牌阶段多摸一张牌）
// ============================================================

describe('英姿（周瑜技能）', () => {
  const zhouyuHeroes: Hero[] = [
    { name: '刘备', maxHp: 4 },
    { name: '周瑜', maxHp: 3, skills: ['英姿'] },
    { name: '孙权', maxHp: 4 },
  ];

  afterEach(() => triggerSystem.clear());

  it('skillRegistry 已注册英姿', () => {
    expect(skillRegistry.get('英姿')).toBeDefined();
  });

  it('摸牌阶段 → 正常 2 张 + 英姿 1 张', async () => {
    registerSkills();
    const g = freshGame({}, zhouyuHeroes);
    const zhouyu = g.state.players[1];
    const before = zhouyu.hand.length;

    await drawPhase(g, { player: zhouyu, round: 1 });

    expect(zhouyu.hand.length).toBe(before + 3);
  });

  it('非周瑜摸牌阶段 → 只摸 2 张', async () => {
    registerSkills();
    const g = freshGame({}, zhouyuHeroes);
    const liubei = g.state.players[0];
    const before = liubei.hand.length;

    await drawPhase(g, { player: liubei, round: 1 });

    expect(liubei.hand.length).toBe(before + 2);
  });
});

// ============================================================
// 闭月（貂蝉：结束阶段摸一张牌，暂挂 turn.after）
// ============================================================

describe('闭月（貂蝉技能）', () => {
  const diaochanHeroes: Hero[] = [
    { name: '刘备', maxHp: 4 },
    { name: '貂蝉', maxHp: 3, skills: ['闭月'] },
    { name: '孙权', maxHp: 4 },
  ];

  afterEach(() => triggerSystem.clear());

  it('skillRegistry 已注册闭月', () => {
    expect(skillRegistry.get('闭月')).toBeDefined();
  });

  it('回合结束 → 摸 1 张牌', async () => {
    registerSkills();
    const g = freshGame({}, diaochanHeroes);
    g.deciders.cardDecide = () => null; // 出牌阶段不出牌，保证结果确定
    const diaochan = g.state.players[1];
    const before = diaochan.hand.length;

    await turn(g, { player: diaochan, round: 1 });

    // 摸牌阶段 2 张 + 闭月 1 张
    expect(diaochan.hand.length).toBe(before + 3);
  });

  it('非貂蝉回合 → 不触发闭月', async () => {
    registerSkills();
    const g = freshGame({}, diaochanHeroes);
    g.deciders.cardDecide = () => null; // 出牌阶段不出牌，保证结果确定
    const liubei = g.state.players[0];
    const before = liubei.hand.length;

    await turn(g, { player: liubei, round: 1 });

    // 只有摸牌阶段 2 张
    expect(liubei.hand.length).toBe(before + 2);
  });
});

// ============================================================
// 制衡（孙权：每回合限一次，弃置所有手牌并摸等量）
// ============================================================

describe('制衡（孙权主动技能）', () => {
  const sunquanHeroes: Hero[] = [
    { name: '刘备', maxHp: 4 },
    { name: '孙权', maxHp: 4, skills: ['制衡'] },
    { name: '曹操', maxHp: 4 },
  ];

  afterEach(() => triggerSystem.clear());

  it('activeSkillRegistry 已注册制衡', () => {
    expect(activeSkillRegistry.get('制衡')).toBeDefined();
  });

  it('手牌全部不可出 → 制衡发动，弃置所有手牌并摸等量', async () => {
    registerSkills();
    const g = freshGame({}, sunquanHeroes);
    const sunquan = g.state.players[1];
    giveHand(sunquan, CardType.Shan, CardType.WuXie); // 闪/无懈不可主动出

    // 控制牌堆：摸到的都是闪（依然不可出，且能验证来源）
    const deckShan1 = makeUniqueCard(CardType.Shan, '♥', 5);
    const deckShan2 = makeUniqueCard(CardType.Shan, '♦', 6);
    g.state.deck = [deckShan1, deckShan2]; // pop 顺序：deckShan2 先出

    await playPhase(g, { player: sunquan, round: 1 });

    // 原手牌（含无懈）被弃置
    expect(g.state.discardPile.some((c) => c.type === CardType.WuXie)).toBe(true);
    // 摸回了牌堆里的两张闪
    expect(sunquan.hand.map((c) => c.id).sort((a, b) => a - b))
      .toEqual([deckShan1.id, deckShan2.id]);
  });

  it('有牌可出 → 出牌优先，制衡不发动', async () => {
    registerSkills();
    const g = freshGame({}, sunquanHeroes);
    const sunquan = g.state.players[1];
    const target = g.state.players[0];
    giveHand(sunquan, CardType.Sha);
    const hpBefore = target.hp;

    await playPhase(g, { player: sunquan, round: 1 });

    // 杀正常打出（若先制衡，杀会被弃置、目标不受伤）
    expect(target.hp).toBe(hpBefore - 1);
    expect(sunquan.hand.length).toBe(0);
  });

  it('制衡后摸到可出的牌 → 继续出牌', async () => {
    registerSkills();
    const g = freshGame({}, sunquanHeroes);
    const sunquan = g.state.players[1];
    const target = g.state.players[0];
    giveHand(sunquan, CardType.WuXie); // 不可出 → 制衡换牌
    g.state.deck = [makeUniqueCard(CardType.Sha, '♠', 2)]; // 摸到杀
    const hpBefore = target.hp;

    await playPhase(g, { player: sunquan, round: 1 });

    // 制衡换到杀 → 打出杀
    expect(target.hp).toBe(hpBefore - 1);
    expect(sunquan.hand.length).toBe(0);
  });

  it('每回合限一次：制衡后仍无牌可出 → 不二次发动', async () => {
    registerSkills();
    const g = freshGame({}, sunquanHeroes);
    const sunquan = g.state.players[1];
    giveHand(sunquan, CardType.Shan);
    g.state.deck = [makeUniqueCard(CardType.Shan, '♥', 7)]; // 摸到的还是闪

    await playPhase(g, { player: sunquan, round: 1 });

    // 制衡一次：手牌换成牌堆那张 ♥7 闪
    expect(sunquan.hand.length).toBe(1);
    expect(sunquan.hand[0].suit).toBe('♥');
    expect(sunquan.hand[0].number).toBe(7);
    // 若二次制衡会再弃 1 摸 1，弃牌堆会有 2 张闪
    expect(g.state.discardPile.filter((c) => c.type === CardType.Shan).length).toBe(1);
  });

  it('非孙权（无制衡技能）→ 不发动', async () => {
    registerSkills();
    const g = freshGame({}, sunquanHeroes);
    const liubei = g.state.players[0];
    giveHand(liubei, CardType.Shan);
    g.state.deck = [makeUniqueCard(CardType.Shan, '♥', 7)];

    await playPhase(g, { player: liubei, round: 1 });

    expect(liubei.hand.length).toBe(1);
    expect(liubei.hand[0].suit).toBe('♠'); // 还是原来的闪，没摸牌
    expect(g.state.discardPile.length).toBe(0);
  });
});
