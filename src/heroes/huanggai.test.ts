// ============================================================
// 黄盖 — 苦肉（出牌阶段失去 1 点体力摸两张牌，不限次数）
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from '../test-utils.js';

import { playPhase } from '../gameFlow.js';

import { activeSkillRegistry, registerSkills } from '../skills.js';

import { CardType } from '../types.js';

describe('苦肉（黄盖主动技能）', () => {
  it('activeSkillRegistry 已注册苦肉', () => {
    expect(activeSkillRegistry.get('苦肉')).toBeDefined();
  });

  it('出牌阶段失去 1 点体力摸 2 张牌（可连续发动至体力 1）', async () => {
    const g = freshGame({}, ['黄盖', '刘备', '孙权']);
    registerSkills(g);
    const huanggai = g.state.players[0];
    huanggai.hp = 3;
    giveHand(huanggai, CardType.Shan); // 不可出 → 触发主动技能
    g.state.deck = Array.from({ length: 4 }, () => makeUniqueCard(CardType.Shan));

    await playPhase(g, { player: huanggai });

    expect(huanggai.hp).toBe(1);        // 3 → 2 → 1（连续两次苦肉）
    expect(huanggai.hand.length).toBe(5); // 1 张闪 + 2 次 × 摸 2
  });

  it('体力 1 时不发动（AI 避免濒死）', async () => {
    const g = freshGame({}, ['黄盖', '刘备', '孙权']);
    registerSkills(g);
    const huanggai = g.state.players[0];
    huanggai.hp = 1;
    giveHand(huanggai, CardType.Shan);

    await playPhase(g, { player: huanggai });

    expect(huanggai.hp).toBe(1);
    expect(huanggai.hand.length).toBe(1); // 未发动
  });
});
