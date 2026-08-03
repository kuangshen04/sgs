// ============================================================
// 三国杀最小原型 — skills.ts 单元测试
// 技能注册与触发（遗计）
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';

import { freshGame } from './test-utils.js';

import { damage } from './game.js';
import { drawPhase, turn } from './gameFlow.js';

import { registerSkills, skillRegistry } from './skills.js';
import { triggerSystem } from './events/index.js';

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
