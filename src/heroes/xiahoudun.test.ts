// ============================================================
// 夏侯惇 — 刚烈
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from '../test-utils.js';

import { damage } from '../life.js';

import { registerSkills, skillRegistry } from '../skills.js';
import { triggerSystem } from '../events/index.js';

import { CardType } from '../types.js';

const xiahoudunHeroes = ['刘备', '夏侯惇', '孙权'];

afterEach(() => triggerSystem.clear());

describe('刚烈（夏侯惇技能）', () => {
  it('skillRegistry 已注册刚烈', () => {
    expect(skillRegistry.get('刚烈')).toBeDefined();
  });

  it('判定为红桃 → 无事发生，判定牌进弃牌堆', async () => {
    registerSkills();
    const g = freshGame({}, xiahoudunHeroes);
    const xiahoudun = g.state.players[1];
    const source = g.state.players[0];
    g.state.deck = [makeUniqueCard(CardType.Tao, '♥', 2)]; // 判定牌：红桃
    giveHand(source, CardType.Sha, CardType.Sha);
    const hpBefore = source.hp;

    await damage(g, { target: xiahoudun, source, amount: 1 });

    expect(source.hp).toBe(hpBefore);   // 不受伤
    expect(source.hand.length).toBe(2); // 不弃牌
    expect(g.state.discardPile.some((c) => c.suit === '♥')).toBe(true); // 判定牌已进弃牌堆
  });

  it('判定为非红桃且来源手牌充足 → 来源弃两张', async () => {
    registerSkills();
    const g = freshGame({}, xiahoudunHeroes);
    const xiahoudun = g.state.players[1];
    const source = g.state.players[0];
    g.state.deck = [makeUniqueCard(CardType.JueDou, '♠', 5)]; // 判定牌：黑桃
    giveHand(source, CardType.Sha, CardType.Sha);
    const hpBefore = source.hp;

    await damage(g, { target: xiahoudun, source, amount: 1 });

    expect(source.hp).toBe(hpBefore);
    expect(source.hand.length).toBe(0); // 弃了两张
    expect(g.state.discardPile.filter((c) => c.type === CardType.Sha).length).toBe(2);
  });

  it('判定为非红桃且来源手牌不足 → 来源受到 1 点伤害', async () => {
    registerSkills();
    const g = freshGame({}, xiahoudunHeroes);
    const xiahoudun = g.state.players[1];
    const source = g.state.players[0];
    g.state.deck = [makeUniqueCard(CardType.Shan, '♠', 5)]; // 判定牌：黑桃
    giveHand(source, CardType.Sha); // 只有 1 张
    const hpBefore = source.hp;

    await damage(g, { target: xiahoudun, source, amount: 1 });

    expect(source.hp).toBe(hpBefore - 1);
  });

  it('非夏侯惇受伤 → 不触发', async () => {
    registerSkills();
    const g = freshGame({}, xiahoudunHeroes);
    const liubei = g.state.players[0];
    const source = g.state.players[1];
    g.state.deck = [makeUniqueCard(CardType.JueDou, '♠', 5)];
    giveHand(source, CardType.Sha, CardType.Sha);
    const hpBefore = source.hp;

    await damage(g, { target: liubei, source, amount: 1 });

    // 不触发刚烈：不判定、来源不弃牌不受伤
    expect(source.hp).toBe(hpBefore);
    expect(source.hand.length).toBe(2);
  });
});
