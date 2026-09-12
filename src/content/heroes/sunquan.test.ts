// ============================================================
// 孙权 — 制衡
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from '../../test-utils.js';

import { playPhase } from '../../flow/gameFlow.js';
import { useCard } from '../../position/cardActions.js';

import { skillRegistry } from '../../effects/effects.js';
import type { ActivatedEffect } from '../../effects/effects.js';

import { CardType } from '../../types.js';

const sunquanHeroes = ['刘备', '孙权', '曹操'];

describe('制衡（孙权主动技能）', () => {
  it('skillRegistry 已注册制衡（activated 效果）', () => {
    expect(skillRegistry.get('制衡')?.effects.some((e) => e.form === 'activated')).toBe(true);
  });

  it('规则与 AI 分层：有牌可出时规则允许、AI 不使用', () => {
    const g = freshGame({}, sunquanHeroes);
    const sunquan = g.state.players[1];
    giveHand(sunquan, CardType.Sha);
    const effect = skillRegistry.get('制衡')!.effects
      .find((e) => e.form === 'activated') as ActivatedEffect;
    const ctx = { shaUsed: false, usedSkills: new Set<string>(), hasCardOption: true };

    expect(effect.canUse(g, sunquan, ctx)).toBe(true);        // 规则：合法
    expect(effect.ai.shouldUse(g, sunquan, ctx)).toBe(false);  // AI：不该用
  });

  it('规则与 AI 分层：无牌可出时两者都为 true', () => {
    const g = freshGame({}, sunquanHeroes);
    const sunquan = g.state.players[1];
    giveHand(sunquan, CardType.Shan);
    const effect = skillRegistry.get('制衡')!.effects
      .find((e) => e.form === 'activated') as ActivatedEffect;
    const ctx = { shaUsed: false, usedSkills: new Set<string>(), hasCardOption: false };

    expect(effect.canUse(g, sunquan, ctx)).toBe(true);
    expect(effect.ai.shouldUse(g, sunquan, ctx)).toBe(true);
  });

  it('规则层面：已用过 → canUse 为 false（限一次）', () => {
    const g = freshGame({}, sunquanHeroes);
    const sunquan = g.state.players[1];
    giveHand(sunquan, CardType.Shan);
    const effect = skillRegistry.get('制衡')!.effects
      .find((e) => e.form === 'activated') as ActivatedEffect;

    expect(
      effect.canUse(g, sunquan, { shaUsed: false, usedSkills: new Set(['制衡']), hasCardOption: false }),
    ).toBe(false);
  });

  it('手牌全部不可出 → 制衡发动，弃置所有手牌并摸等量', async () => {
    const g = freshGame({}, sunquanHeroes);
    const sunquan = g.state.players[1];
    giveHand(sunquan, CardType.Shan, CardType.WuXie); // 闪/无懈不可主动出

    // 控制牌堆：摸到的都是闪（依然不可出，且能验证来源）
    const deckShan1 = makeUniqueCard(CardType.Shan, '♥', 5);
    const deckShan2 = makeUniqueCard(CardType.Shan, '♦', 6);
    g.state.deck.replaceAll([deckShan1, deckShan2]); // pop 顺序：deckShan2 先出

    await playPhase(g, { player: sunquan });

    // 原手牌（含无懈）被弃置
    expect(g.state.discardPile.cards.some((c) => c.type === CardType.WuXie)).toBe(true);
    // 摸回了牌堆里的两张闪
    expect(sunquan.hand.cards.map((c) => c.id).sort((a, b) => a - b))
      .toEqual([deckShan1.id, deckShan2.id]);
  });

  it('有牌可出 → 出牌优先，制衡不发动', async () => {
    const g = freshGame({}, sunquanHeroes);
    const sunquan = g.state.players[1];
    const target = g.state.players[0];
    giveHand(sunquan, CardType.Sha);
    const hpBefore = target.hp;

    await playPhase(g, { player: sunquan });

    // 杀正常打出（若先制衡，杀会被弃置、目标不受伤）
    expect(target.hp).toBe(hpBefore - 1);
    expect(sunquan.hand.cards.length).toBe(0);
  });

  it('制衡后摸到可出的牌 → 继续出牌', async () => {
    const g = freshGame({}, sunquanHeroes);
    const sunquan = g.state.players[1];
    const target = g.state.players[0];
    giveHand(sunquan, CardType.WuXie); // 不可出 → 制衡换牌
    g.state.deck.replaceAll([makeUniqueCard(CardType.Sha, '♠', 2)]); // 摸到杀
    const hpBefore = target.hp;

    await playPhase(g, { player: sunquan });

    // 制衡换到杀 → 打出杀
    expect(target.hp).toBe(hpBefore - 1);
    expect(sunquan.hand.cards.length).toBe(0);
  });

  it('每回合限一次：制衡后仍无牌可出 → 不二次发动', async () => {
    const g = freshGame({}, sunquanHeroes);
    const sunquan = g.state.players[1];
    giveHand(sunquan, CardType.Shan);
    g.state.deck.replaceAll([makeUniqueCard(CardType.Shan, '♥', 7)]); // 摸到的还是闪

    await playPhase(g, { player: sunquan });

    // 制衡一次：手牌换成牌堆那张 ♥7 闪
    expect(sunquan.hand.cards.length).toBe(1);
    expect(sunquan.hand.cards[0].suit).toBe('♥');
    expect(sunquan.hand.cards[0].number).toBe(7);
    // 若二次制衡会再弃 1 摸 1，弃牌堆会有 2 张闪
    expect(g.state.discardPile.cards.filter((c) => c.type === CardType.Shan).length).toBe(1);
  });

  it('非孙权（无制衡技能）→ 不发动', async () => {
    const g = freshGame({}, sunquanHeroes);
    const liubei = g.state.players[0];
    giveHand(liubei, CardType.Shan);
    g.state.deck.replaceAll([makeUniqueCard(CardType.Shan, '♥', 7)]);

    await playPhase(g, { player: liubei });

    expect(liubei.hand.cards.length).toBe(1);
    expect(liubei.hand.cards[0].suit).toBe('♠'); // 还是原来的闪，没摸牌
    expect(g.state.discardPile.cards.length).toBe(0);
  });
});

describe('救援（孙权主公技）', () => {
  it('吴势力桃对孙权 → 回复 +1', async () => {
    const g = freshGame({}, ['孙权', '周瑜', '刘备']);
    const sunquan = g.state.players[0];
    const zhouyu = g.state.players[1];
    sunquan.hp = 2;
    zhouyu.hand.replaceAll([makeUniqueCard(CardType.Tao)]); // 周瑜：吴

    await useCard(g, { player: zhouyu, card: zhouyu.hand.cards[0], targets: [sunquan] });

    expect(sunquan.hp).toBe(4); // 2 + 1(桃) + 1(救援)
  });

  it('非吴势力桃对孙权 → 不触发救援', async () => {
    const g = freshGame({}, ['孙权', '刘备', '曹操']); // 刘备：蜀
    const sunquan = g.state.players[0];
    const liubei = g.state.players[1];
    sunquan.hp = 2;
    liubei.hand.replaceAll([makeUniqueCard(CardType.Tao)]);

    await useCard(g, { player: liubei, card: liubei.hand.cards[0], targets: [sunquan] });

    expect(sunquan.hp).toBe(3); // 2 + 1(桃)
  });

  it('身份场开启且孙权非主公 → 不发动', async () => {
    const g = freshGame({}, ['孙权', '周瑜', '刘备']);
    g.state.lord = g.state.players[2]; // 刘备是主公（孙权非主公）
    const sunquan = g.state.players[0];
    const zhouyu = g.state.players[1];
    sunquan.hp = 2;
    zhouyu.hand.replaceAll([makeUniqueCard(CardType.Tao)]);

    await useCard(g, { player: zhouyu, card: zhouyu.hand.cards[0], targets: [sunquan] });

    expect(sunquan.hp).toBe(3); // 救援不触发
  });
});
