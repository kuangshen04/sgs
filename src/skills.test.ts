// ============================================================
// 三国杀最小原型 — skills.ts 单元测试
// 技能注册与触发（遗计）
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';

import { freshGame } from './test-utils.js';

import { damage } from './game.js';

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
