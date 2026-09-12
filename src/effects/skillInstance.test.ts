// ============================================================
// 局内技能实例（阶段 3：定义静态 + 局内实例）
// 开局建立实例 / 获得与失去技能即时生效 / 失效字段与归属联动
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame } from '../test-utils.js';
import { damage } from '../flow/life.js';
import {
  gainSkill, loseSkill, playerHasSkill, playerSkillDisabled, skillInstance,
} from './effects.js';

describe('局内技能实例', () => {
  it('开局按 hero.skills 建立实例；同名武将各自独立', () => {
    const g = freshGame({}, ['郭嘉', '郭嘉', '刘备']);
    const [a, b, liubei] = g.state.players;

    for (const p of [a, b]) {
      expect(playerHasSkill(p, '遗计')).toBe(true);
      expect(skillInstance(p, '遗计')?.def.meta.name).toBe('遗计');
    }
    expect(playerHasSkill(liubei, '遗计')).toBe(false); // 不同武将互不影响

    // 实例相互独立：一个失效不影响另一个（失效施加 API 见后续"技能失效/复原"项）
    skillInstance(a, '遗计')!.disabled = true;
    expect(playerHasSkill(a, '遗计')).toBe(false);
    expect(playerSkillDisabled(a, '遗计')).toBe(true);
    expect(playerHasSkill(b, '遗计')).toBe(true);
  });

  it('失去技能：效果立即不再归属（遗计不再触发，无需注销 handler）', async () => {
    const g = freshGame({}, ['刘备', '郭嘉', '孙权']);
    const guojia = g.state.players[1];
    loseSkill(guojia, '遗计');
    const before = guojia.hand.cards.length;

    await damage(g, { target: guojia, source: g.state.players[0], amount: 1 });

    expect(guojia.hand.cards.length).toBe(before); // 无遗计，不摸牌
  });

  it('获得技能：效果立即生效（给刘备遗计）', async () => {
    const g = freshGame({}, ['刘备', '孙权', '曹操']);
    const liubei = g.state.players[0];
    expect(playerHasSkill(liubei, '遗计')).toBe(false);

    gainSkill(liubei, '遗计');
    const before = liubei.hand.cards.length;

    await damage(g, { target: liubei, source: g.state.players[1], amount: 1 });

    expect(liubei.hand.cards.length).toBe(before + 2); // 遗计：1 点伤害摸 2 张
  });

  it('gainSkill 未定义技能抛错、重复获得抛错；loseSkill 未拥有为 no-op', () => {
    const g = freshGame({}, ['刘备', '曹操', '孙权']);
    const p = g.state.players[0];

    expect(() => gainSkill(p, '不存在的技能')).toThrow(/not defined/);
    expect(() => gainSkill(p, '仁德')).toThrow(/already has/);
    expect(() => loseSkill(p, '无双')).not.toThrow();
    expect(playerHasSkill(p, '无双')).toBe(false);
  });
});
