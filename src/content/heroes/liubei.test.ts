// ============================================================
// 刘备 — 仁德
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard, equipAt } from '../../test-utils.js';

import { playPhase } from '../../flow/gameFlow.js';
import { useCard } from '../../position/cardActions.js';

import { skillRegistry } from '../../effects/effects.js';
import type { ActivatedEffect } from '../../effects/effects.js';

import { CardType } from '../../types.js';

const liubeiHeroes = ['刘备', '曹操', '孙权'];

describe('仁德（刘备主动技能）', () => {
  it('skillRegistry 已注册仁德（activated 效果）', () => {
    expect(skillRegistry.get('仁德')?.effects.some((e) => e.form === 'activated')).toBe(true);
  });

  it('交给目标 2 张牌并回复 1 点体力', async () => {
    const g = freshGame({}, liubeiHeroes);
    const liubei = g.state.players[0];
    const target = g.state.players[1];
    liubei.hp = 3; // 受伤
    giveHand(liubei, CardType.Shan, CardType.WuXie); // 不可出 → 触发主动技能
    const givenIds = liubei.hand.cards.map((c) => c.id);

    await playPhase(g, { player: liubei });

    expect(liubei.hp).toBe(4);
    expect(liubei.hand.cards.length).toBe(0);
    expect(target.hand.cards.map((c) => c.id).sort((a, b) => a - b))
      .toEqual([...givenIds].sort((a, b) => a - b));
    expect(g.state.discardPile.cards.length).toBe(0); // 牌到了目标手牌，不是弃牌堆
  });

  it('满血时不发动（AI 策略：交牌换血不划算）', async () => {
    const g = freshGame({}, liubeiHeroes);
    const liubei = g.state.players[0];
    giveHand(liubei, CardType.Shan, CardType.WuXie);
    const effect = skillRegistry.get('仁德')!.effects
      .find((e) => e.form === 'activated') as ActivatedEffect;
    const ctx = { shaUsed: false, usedSkills: new Set<string>(), hasCardOption: false };

    expect(effect.canUse(g, liubei, ctx)).toBe(true);        // 规则：合法
    expect(effect.ai.shouldUse(g, liubei, ctx)).toBe(false);  // AI：不该用
  });
});

describe('激将（刘备主公技）', () => {
  it('蜀盟友代打杀（决斗）', async () => {
    const g = freshGame({}, ['刘备', '关羽', '曹操']);
    const liubei = g.state.players[0];
    const guanyu = g.state.players[1];
    const caocao = g.state.players[2];
    liubei.hand.clear();
    guanyu.hand.replaceAll([makeUniqueCard(CardType.Sha)]);
    caocao.hand.replaceAll([makeUniqueCard(CardType.JueDou)]);
    const hpBefore = caocao.hp;

    await useCard(g, { player: caocao, card: caocao.hand.cards[0], targets: [liubei] });

    expect(caocao.hp).toBe(hpBefore - 1); // 刘备代打成功，曹操无杀受伤
    expect(liubei.hp).toBe(4);
    expect(guanyu.hand.cards.length).toBe(0); // 关羽的杀被代打消耗
  });

  it('出牌阶段可借蜀盟友的杀', async () => {
    const g = freshGame({}, ['刘备', '孙权', '关羽']);
    const liubei = g.state.players[0];
    const sunquan = g.state.players[1];
    const guanyu = g.state.players[2];
    liubei.hand.clear();
    guanyu.hand.replaceAll([makeUniqueCard(CardType.Sha)]);
    const hpBefore = sunquan.hp;

    await playPhase(g, { player: liubei });

    expect(sunquan.hp).toBe(hpBefore - 1);
    expect(guanyu.hand.cards.length).toBe(0); // 关羽的杀被借走
    expect(liubei.hand.cards.length).toBe(0);
  });

  it('借杀消耗本阶段杀次数：无连弩只借一次（行为保持）', async () => {
    const g = freshGame({}, ['刘备', '孙权', '关羽', '黄月英']);
    const liubei = g.state.players[0];
    const guanyu = g.state.players[2];
    const yueying = g.state.players[3];
    liubei.hand.clear();
    guanyu.hand.replaceAll([makeUniqueCard(CardType.Sha)]);
    yueying.hand.replaceAll([makeUniqueCard(CardType.Sha)]);

    await playPhase(g, { player: liubei });

    // 第一次借杀后 shaUsed=true → 无连弩时激将不再合法：只消耗一张
    const consumed = guanyu.hand.cards.length === 0 ? 1 : 0;
    expect(consumed + (yueying.hand.cards.length === 0 ? 1 : 0)).toBe(1);
  });

  it('诸葛连弩下可连续借杀（unlimitedSha 生效）', async () => {
    const g = freshGame({}, ['刘备', '孙权', '关羽', '黄月英']);
    const liubei = g.state.players[0];
    const guanyu = g.state.players[2];
    const yueying = g.state.players[3];
    liubei.hand.clear();
    equipAt(g, liubei, makeUniqueCard(CardType.ZhugeLianNu));
    guanyu.hand.replaceAll([makeUniqueCard(CardType.Sha)]);
    yueying.hand.replaceAll([makeUniqueCard(CardType.Sha)]);

    await playPhase(g, { player: liubei });

    expect(guanyu.hand.cards.length).toBe(0);
    expect(yueying.hand.cards.length).toBe(0); // 两张盟友杀都被借走
  });
});
