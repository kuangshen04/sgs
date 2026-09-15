// ============================================================
// 大乔 — 国色（方片牌当乐不思蜀）/ 流离
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard, placeJudgment } from '../../test-utils.js';

import { useCard } from '../../flow/useCard.js';
import { judgePhase } from '../../flow/gameFlow.js';
import { choosePlayAction } from '../../decision/playChoices.js';
import { moveCards } from '../../position/cardActions.js';
import { verifyCardState } from '../../position/cardAreaCheck.js';

import { skillRegistry } from '../../effects/effects.js';

import { CardType } from '../../types.js';

const daqiaoHeroes = ['大乔', '刘备', '孙权'];

describe('国色（大乔技能）', () => {
  it('skillRegistry 已注册国色；大乔拥有国色', () => {
    expect(skillRegistry.get('国色')).toBeDefined();
    expect(freshGame({}, daqiaoHeroes).state.players[0].skills.has('国色')).toBe(true);
  });

  it('方片牌当乐不思蜀：UC 身份 = 乐不思蜀、花色点数继承方片牌、进目标判定区', async () => {
    const g = freshGame({}, daqiaoHeroes);
    const daqiao = g.state.players[0];
    const target = g.state.players[1];
    const diamond = makeUniqueCard(CardType.Sha, '♦', 10);
    daqiao.hand.replaceAll([diamond]);

    // 走真实出牌流程：转化 action → resolve → useCard（face 在 UC 物化时推导，故看判定区的 UC）
    const action = await choosePlayAction(g, daqiao, false, new Set());
    expect(action?.kind).toBe('card');
    if (action?.kind !== 'card') throw new Error('应为转化牌动作');
    expect(action.card.type).toBe(CardType.LeBu);

    await useCard(g, { player: daqiao, card: action.card, targets: [target] });

    const resident = g.usedCards.at({ kind: 'judgment', player: target })[0]!;
    expect(resident.name).toBe('乐不思蜀');
    expect(resident.physicalCards).toEqual([diamond]);
    expect([resident.suit, resident.number, resident.color]).toEqual(['♦', 10, 'red']);
    expect(target.judgment.cards).toEqual([diamond]); // 实体牌确实在判定区
    expect(verifyCardState(g)).toEqual([]);
  });

  it('手牌无方片 → 国色不可用（候选里没有转化动作）', async () => {
    const g = freshGame({}, daqiaoHeroes);
    const daqiao = g.state.players[0];
    daqiao.hand.replaceAll([makeUniqueCard(CardType.Sha, '♠', 3)]);

    const action = await choosePlayAction(g, daqiao, false, new Set());

    expect(action?.kind === 'card' && action.card.type).not.toBe(CardType.LeBu);
  });

  it('陆逊（谦逊）不能成为目标：唯一目标被排除 → 国色不可用（只剩真牌）', async () => {
    const g = freshGame({}, ['大乔', '陆逊']);
    const daqiao = g.state.players[0];
    daqiao.hand.replaceAll([makeUniqueCard(CardType.Sha, '♦', 4)]);

    const action = await choosePlayAction(g, daqiao, false, new Set());

    // 唯一目标陆逊被谦逊排除 → 国色无可选目标；此时动作只能是那张真杀
    expect(action?.kind === 'card' && action.card.type).toBe(CardType.Sha);
  });

  it('判定区同名 UC 只能存在 1 张：唯一目标已有乐不思蜀时不能放', async () => {
    const g = freshGame({}, ['大乔', '刘备']);
    const daqiao = g.state.players[0];
    const target = g.state.players[1];
    placeJudgment(g, target, makeUniqueCard(CardType.LeBu)); // 唯一目标判定区已有乐不思蜀
    daqiao.hand.replaceAll([makeUniqueCard(CardType.Sha, '♦', 10)]);

    const action = await choosePlayAction(g, daqiao, false, new Set());

    expect(action?.kind === 'card' && action.card.type).toBe(CardType.Sha); // 不是乐不思蜀转化
    expect(target.judgment.cards).toHaveLength(1);
  });

  it('判定阶段按 UC 身份结算：非红桃 → 跳过出牌阶段，方片牌进弃牌堆', async () => {
    const g = freshGame({}, daqiaoHeroes);
    const daqiao = g.state.players[0];
    const target = g.state.players[1];
    const diamond = makeUniqueCard(CardType.Sha, '♦', 10);
    daqiao.hand.replaceAll([diamond]);
    await useCard(g, {
      player: daqiao,
      card: { type: CardType.LeBu, name: '乐不思蜀', physicalCards: [diamond] },
      targets: [target],
    });
    g.state.deck.replaceAll([makeUniqueCard(CardType.Tao, '♠', 3)]); // 非红桃 → 生效

    await judgePhase(g, { player: target });

    expect(target.skipPlayPhase).toBe(true);
    expect(target.judgment.cards).toHaveLength(0);
    expect(g.state.discardPile.cards).toContain(diamond); // 实体牌（方片）进弃牌堆
    expect(g.usedCards.size()).toBe(0);                   // 延时 UC 结算后销毁
    expect(verifyCardState(g)).toEqual([]);
  });

  it('过河拆桥式拆掉国色的乐不思蜀 → UC 销毁、方片牌进弃牌堆', async () => {
    const g = freshGame({}, daqiaoHeroes);
    const daqiao = g.state.players[0];
    const target = g.state.players[1];
    const diamond = makeUniqueCard(CardType.Sha, '♦', 10);
    daqiao.hand.replaceAll([diamond]);
    await useCard(g, {
      player: daqiao,
      card: { type: CardType.LeBu, name: '乐不思蜀', physicalCards: [diamond] },
      targets: [target],
    });

    await moveCards(g, { to: { zone: 'discardPile' }, cards: [diamond], reason: 'discard' });

    expect(target.judgment.cards).toHaveLength(0);
    expect(g.state.discardPile.cards).toContain(diamond);
    expect(g.usedCards.size()).toBe(0);
    expect(verifyCardState(g)).toEqual([]);
  });
});

describe('流离（大乔技能）', () => {
  it('skillRegistry 已注册流离', () => {
    expect(skillRegistry.get('流离')).toBeDefined();
  });

  it('成为杀的目标 → 弃一张牌，将杀转移给攻击范围内其他角色', async () => {
    const g = freshGame({}, ['大乔', '刘备', '孙权']);
    const daqiao = g.state.players[0];
    const attacker = g.state.players[1]; // 刘备
    const redirected = g.state.players[2]; // 孙权（大乔攻击范围内、非使用者）
    giveHand(attacker, CardType.Sha);
    giveHand(daqiao, CardType.Tao); // 弃牌素材
    giveHand(redirected);           // 无闪
    const daqiaoHpBefore = daqiao.hp;
    const redirectedHpBefore = redirected.hp;

    await useCard(g, { player: attacker, card: attacker.hand.cards[0], targets: [daqiao] });

    expect(daqiao.hp).toBe(daqiaoHpBefore);          // 原目标不受伤害
    expect(redirected.hp).toBe(redirectedHpBefore - 1); // 新目标受伤害
    expect(daqiao.hand.cards.length).toBe(0);              // 弃了一张牌
  });

  it('无合法转移目标（只有使用者）→ 不发动，正常受击', async () => {
    const g = freshGame({}, ['刘备', '大乔']); // 2 人局：流离无其他角色可转移
    const attacker = g.state.players[0];
    const daqiao = g.state.players[1];
    giveHand(attacker, CardType.Sha);
    giveHand(daqiao, CardType.Tao);
    const hpBefore = daqiao.hp;

    await useCard(g, { player: attacker, card: attacker.hand.cards[0], targets: [daqiao] });

    expect(daqiao.hp).toBe(hpBefore - 1); // 杀命中
    expect(daqiao.hand.cards.length).toBe(1);   // 未弃牌
  });

  it('无牌可弃 → 不发动', async () => {
    const g = freshGame({}, ['大乔', '刘备', '孙权']);
    const daqiao = g.state.players[0];
    const attacker = g.state.players[1];
    giveHand(attacker, CardType.Sha);
    const hpBefore = daqiao.hp;

    await useCard(g, { player: attacker, card: attacker.hand.cards[0], targets: [daqiao] });

    expect(daqiao.hp).toBe(hpBefore - 1); // 无牌可弃，杀命中
  });

  it('非杀（决斗）→ 不触发', async () => {
    const g = freshGame({}, ['大乔', '刘备', '孙权']);
    const daqiao = g.state.players[0];
    const attacker = g.state.players[1];
    giveHand(attacker, CardType.JueDou);
    giveHand(daqiao, CardType.Tao);
    const hpBefore = daqiao.hp;

    await useCard(g, { player: attacker, card: attacker.hand.cards[0], targets: [daqiao] });

    // 决斗：大乔无杀 → 大乔受伤，流离不触发
    expect(daqiao.hp).toBe(hpBefore - 1);
    expect(daqiao.hand.cards.length).toBe(1); // 未弃牌
  });
});
