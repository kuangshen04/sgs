// ============================================================
// 三国杀最小原型 — 技能系统基础设施测试
// 分发模型 / 死亡规则 / pickActiveSkill / 注册表完整性
// 具体技能行为测试在各武将文件中（heroes/*.test.ts）。
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from './test-utils.js';

import { damage, loseHp } from './life.js';
import { playPhase } from './gameFlow.js';

import { activeSkillRegistry, pickActiveSkill, registerSkills, skillRegistry } from './skills.js';

import { CardType } from './types.js';

// ============================================================
// 分发 — 死亡规则
// ============================================================

describe('技能分发 — 死亡规则', () => {
  it('失去体力不触发伤害事件（遗计不响应）', async () => {
    const g = freshGame({}, ['刘备', '郭嘉', '孙权']);
    registerSkills(g);
    const guojia = g.state.players[1];
    guojia.hp = 2;
    const before = guojia.hand.length;

    await loseHp(g, guojia, 1);

    expect(guojia.hp).toBe(1);
    expect(guojia.hand.length).toBe(before); // 遗计（damage.after）未触发
  });

  it('死亡后不再发动技能（遗计）', async () => {
    const g = freshGame({}, ['刘备', '郭嘉', '孙权']);
    registerSkills(g);
    const guojia = g.state.players[1];
    guojia.hp = 1; // 受到致死伤害，无桃 → 死亡

    await damage(g, { target: guojia, source: g.state.players[0], amount: 1 });

    expect(guojia.alive).toBe(false);
    expect(guojia.hand.length).toBe(0); // 死亡后遗计不触发
  });

  it('刚烈反杀当前回合角色 → 出牌阶段终止，不再出牌', async () => {
    const g = freshGame({}, ['孙权', '夏侯惇', '刘备']);
    registerSkills(g);
    const sunquan = g.state.players[0];
    const xiahou = g.state.players[1];
    sunquan.hp = 1;
    giveHand(sunquan, CardType.Sha, CardType.Sha); // 杀夏侯惇 → 刚烈反杀
    g.state.deck = [makeUniqueCard(CardType.JueDou, '♠', 5)]; // 刚烈判定：黑桃
    const hpBefore = xiahou.hp;

    await playPhase(g, { player: sunquan });

    expect(sunquan.alive).toBe(false);    // 被刚烈反杀
    expect(xiahou.hp).toBe(hpBefore - 1); // 杀已生效
    expect(sunquan.hand.length).toBe(1);  // 剩余杀未继续打出
  });
});

// ============================================================
// pickActiveSkill
// ============================================================

describe('pickActiveSkill', () => {
  it('死亡角色返回 null（不发动主动技能）', () => {
    const g = freshGame({}, ['刘备', '孙权', '曹操']);
    const sunquan = g.state.players[1];
    sunquan.alive = false;
    giveHand(sunquan, CardType.Shan);

    const skill = pickActiveSkill(g, sunquan, {
      shaUsed: false, usedSkills: new Set<string>(), cardChoice: null,
    });

    expect(skill).toBeNull();
  });
});

// ============================================================
// 注册表完整性
// ============================================================

describe('注册表完整性', () => {
  it('skillRegistry 已注册所有触发技能', () => {
    for (const name of ['遗计', '英姿', '闭月', '奸雄', '刚烈', '天妒', '鬼才', '洛神', '反馈', '集智', '突袭']) {
      expect(skillRegistry.get(name)).toBeDefined();
    }
  });

  it('activeSkillRegistry 已注册所有主动技能', () => {
    for (const name of ['制衡', '仁德', '反间', '青囊']) {
      expect(activeSkillRegistry.get(name)).toBeDefined();
    }
  });
});
