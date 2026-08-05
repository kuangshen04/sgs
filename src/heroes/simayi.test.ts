// ============================================================
// 司马懿 — 反馈 / 鬼才
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from '../test-utils.js';

import { damage } from '../life.js';

import { registerSkills, skillRegistry } from '../skills.js';

import { CardType } from '../types.js';

describe('反馈（司马懿技能）', () => {
  it('skillRegistry 已注册反馈', () => {
    expect(skillRegistry.get('反馈')).toBeDefined();
  });

  it('受到伤害后获得伤害来源的一张手牌', async () => {
    const g = freshGame({}, ['刘备', '司马懿', '孙权']);
    registerSkills(g);
    const simayi = g.state.players[1];
    const source = g.state.players[0];
    giveHand(source, CardType.Sha, CardType.Tao);
    const before = source.hand.length;

    await damage(g, { target: simayi, source, amount: 1 });

    expect(simayi.hand.length).toBe(1);
    expect(source.hand.length).toBe(before - 1);
  });

  it('无来源伤害（如闪电）→ 不触发', async () => {
    const g = freshGame({}, ['刘备', '司马懿', '孙权']);
    registerSkills(g);
    const simayi = g.state.players[1];

    await damage(g, { target: simayi, amount: 1 });

    expect(simayi.hand.length).toBe(0);
  });
});

describe('鬼才（司马懿技能）', () => {
  it('skillRegistry 已注册鬼才', () => {
    expect(skillRegistry.get('鬼才')).toBeDefined();
  });

  it('打出一张手牌代替判定牌（响应型：任何角色的判定都可替换）', async () => {
    const g = freshGame({}, ['刘备', '夏侯惇', '司马懿']);
    registerSkills(g);
    const liubei = g.state.players[0];
    const xiahou = g.state.players[1];
    const simayi = g.state.players[2];
    g.state.deck = [makeUniqueCard(CardType.Sha, '♠', 5)]; // 原判定：黑桃
    simayi.hand = [makeUniqueCard(CardType.Tao, '♥', 2)];  // 替换牌：红桃
    const hpBefore = liubei.hp;

    await damage(g, { target: xiahou, source: liubei, amount: 1 });

    expect(simayi.hand.length).toBe(0);   // 鬼才已打出
    expect(liubei.hp).toBe(hpBefore);     // 判定被替换成红桃 → 刚烈无事
    expect(g.state.discardPile.some((c) => c.suit === '♥')).toBe(true); // 替换牌进弃牌堆
  });

  it('无手牌 → 不替换，原判定生效', async () => {
    const g = freshGame({}, ['刘备', '夏侯惇', '司马懿']);
    registerSkills(g);
    const liubei = g.state.players[0];
    const xiahou = g.state.players[1];
    const simayi = g.state.players[2];
    g.state.deck = [makeUniqueCard(CardType.JueDou, '♠', 5)]; // 判定：黑桃
    giveHand(liubei, CardType.Sha, CardType.Sha); // 来源有 2 张
    const hpBefore = liubei.hp;

    await damage(g, { target: xiahou, source: liubei, amount: 1 });

    expect(simayi.hand.length).toBe(0);      // 司马懿无手牌，鬼才无法发动
    expect(liubei.hp).toBe(hpBefore);        // 来源不受伤
    expect(liubei.hand.length).toBe(0);      // 但弃了两张响应刚烈
  });
});
