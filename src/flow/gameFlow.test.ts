// ============================================================
// 三国杀最小原型 — gameFlow.ts 单元测试
// 阶段流程：出牌阶段（playPhase）
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard, placeJudgment } from '../test-utils.js';

import { judgePhase, playPhase } from './gameFlow.js';

import { cardRegistry } from '../content/cardRegistry.js';
import { moveCards } from '../position/cardActions.js';
import { moveUsedCard } from '../position/usedCardActions.js';
import { CardType } from '../types.js';

// ============================================================
// playPhase — 循环 choose + useCard（默认 AI，不注入 decider）
// ============================================================

describe('playPhase', () => {
  it('有杀出杀 → 循环打出', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const target = g.state.players[1];
    giveHand(player, CardType.Sha);
    const hpBefore = target.hp;

    await playPhase(g, { player });

    // 默认 AI 出杀
    expect(player.hand.cards.length).toBe(0);
    expect(target.hp).toBe(hpBefore - 1);
  });

  it('无可用牌 → 不出牌', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Shan); // 闪不可主动使用

    await playPhase(g, { player });

    expect(player.hand.cards.length).toBe(1);
  });

  it('多张可用牌 → 按优先级循环打出', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const target = g.state.players[1];
    giveHand(player, CardType.JueDou, CardType.Sha);
    const hpBefore = target.hp;

    await playPhase(g, { player });

    // 默认 AI：决斗(70) → 杀(60)，两轮循环
    expect(target.hp).toBe(hpBefore - 2);
    expect(player.hand.cards.length).toBe(0);
  });
});

// ============================================================
// judgePhase — 判定阶段（延时锦囊结算）
// ============================================================

describe('judgePhase', () => {
  it('判定为红桃 → 乐不思蜀无事，进弃牌堆', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const lebu = makeUniqueCard(CardType.LeBu);
    placeJudgment(g, player, lebu);
    g.state.deck.replaceAll([makeUniqueCard(CardType.Tao, '♥', 2)]); // 判定：红桃

    await judgePhase(g, { player });

    expect(player.skipPlayPhase).toBeFalsy();
    expect(player.judgment.cards.length).toBe(0);
    expect(g.state.discardPile.cards.find((c) => c.id === lebu.id)).toBeDefined();
  });

  it('判定为非红桃 → 跳过出牌阶段', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const lebu = makeUniqueCard(CardType.LeBu);
    placeJudgment(g, player, lebu);
    g.state.deck.replaceAll([makeUniqueCard(CardType.JueDou, '♠', 5)]); // 判定：非红桃

    await judgePhase(g, { player });

    expect(player.skipPlayPhase).toBe(true);
    expect(player.judgment.cards.length).toBe(0);
  });

  it('判定前被无懈 → 判定牌无效，不判定', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const lebu = makeUniqueCard(CardType.LeBu);
    placeJudgment(g, player, lebu);
    giveHand(player, CardType.WuXie); // 被判定者出无懈保护自己
    const deckCard = makeUniqueCard(CardType.Sha, '♠', 5);
    g.state.deck.replaceAll([deckCard]);

    await judgePhase(g, { player });

    expect(player.skipPlayPhase).toBeFalsy();   // 未生效
    expect(player.judgment.cards.length).toBe(0);     // 乐不思蜀被弃置
    expect(g.state.discardPile.cards.find((c) => c.id === lebu.id)).toBeDefined();
    expect(g.state.deck.cards).toContain(deckCard);   // 未判定，牌堆未动
    expect(player.hand.cards.length).toBe(0);         // 无懈已打出
  });

  it('skipPlayPhase 标记 → playPhase 直接跳过', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    player.skipPlayPhase = true;
    giveHand(player, CardType.Sha);

    await playPhase(g, { player });

    expect(player.hand.cards.length).toBe(1); // 未出牌
  });

  it('闪电判定为黑桃2~9 → 受到 3 点伤害', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const shandian = makeUniqueCard(CardType.ShanDian);
    placeJudgment(g, player, shandian);
    g.state.deck.replaceAll([makeUniqueCard(CardType.JueDou, '♠', 5)]); // 黑桃5
    const hpBefore = player.hp;

    await judgePhase(g, { player });

    expect(player.hp).toBe(hpBefore - 3);
    expect(player.judgment.cards.length).toBe(0);
    expect(g.state.discardPile.cards.find((c) => c.id === shandian.id)).toBeDefined();
  });

  it('闪电判定非黑桃2~9 → 移到下家判定区', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const next = g.state.players[1];
    const shandian = makeUniqueCard(CardType.ShanDian);
    placeJudgment(g, player, shandian);
    g.state.deck.replaceAll([makeUniqueCard(CardType.Tao, '♥', 5)]); // 红桃 → 不爆

    await judgePhase(g, { player });

    expect(player.judgment.cards.length).toBe(0);
    expect(next.judgment.cards.map((c) => c.id)).toContain(shandian.id);
    expect(g.state.discardPile.cards.find((c) => c.id === shandian.id)).toBeUndefined();
  });

  it('闪电转移跳过判定区已有闪电的角色（判定区同名 UC 只能 1 张）', async () => {
    const g = freshGame();
    const [p0, p1, p2] = g.state.players;
    const shandian = makeUniqueCard(CardType.ShanDian);
    placeJudgment(g, p0, shandian);
    placeJudgment(g, p1, makeUniqueCard(CardType.ShanDian)); // 下家已有闪电 → 跳过
    g.state.deck.replaceAll([makeUniqueCard(CardType.Tao, '♥', 5)]);

    await judgePhase(g, { player: p0 });

    expect(p1.judgment.cards).toHaveLength(1);                        // 未被叠加
    expect(p2.judgment.cards.map((c) => c.id)).toContain(shandian.id); // 落到再下一个
  });

  it('下家已有闪电 → 闪电可绕回自己（自己的判定区此刻已空出，是合法目标）', async () => {
    const g = freshGame({}, ['刘备', '曹操']); // 2 人局：唯一的下家已有闪电
    const [p0, p1] = g.state.players;
    const shandian = makeUniqueCard(CardType.ShanDian);
    placeJudgment(g, p0, shandian);
    placeJudgment(g, p1, makeUniqueCard(CardType.ShanDian));
    g.state.deck.replaceAll([makeUniqueCard(CardType.Tao, '♥', 5)]);

    await judgePhase(g, { player: p0 });

    expect(p1.judgment.cards).toHaveLength(1);                        // 未被叠加
    expect(p0.judgment.cards.map((c) => c.id)).toContain(shandian.id); // 回到自己
    expect(g.state.discardPile.cards.map((c) => c.id)).not.toContain(shandian.id);
  });

  it('所有角色都不是闪电的合法目标 → 不迁移（由收尾进弃牌堆）', async () => {
    // 规则集里这条分支由免疫类效果逼出（如帷幕"不能成为黑色锦囊的目标"；标包内容暂无此类效果），
    // 故直接调用闪电的 delayContent 锁定行为：判定非爆且无人可承接 → UC 留在处理区，收尾进弃牌堆。
    const g = freshGame({}, ['刘备', '曹操']);
    const [p0, p1] = g.state.players;
    const shandian = makeUniqueCard(CardType.ShanDian);
    p0.hand.replaceAll([shandian]);
    // 人人判定区都有同名 UC（绕过放置合法性构造；真人局里由免疫类效果造成）
    placeJudgment(g, p0, makeUniqueCard(CardType.ShanDian));
    placeJudgment(g, p1, makeUniqueCard(CardType.ShanDian));
    await moveCards(g, { to: { zone: 'processing' }, cards: [shandian], reason: 'resolve' });
    const uc = g.usedCards.create(shandian, [shandian]);
    g.usedCards.bind(uc, { kind: 'processing' }); // 模拟判定阶段已把它移入处理区
    const def = cardRegistry.get(CardType.ShanDian)!;

    await def.delayContent!(g, p0, makeUniqueCard(CardType.Tao, '♥', 5), uc);

    expect(uc.loc).toEqual({ kind: 'processing' }); // 未迁移 → 收尾会进弃牌堆
  });

  it('闪电被无懈抵消 → 未执行效果，但依然流向合法下家（不进弃牌堆）', async () => {
    const g = freshGame({}, ['刘备', '曹操', '孙权']);
    const [p0, p1] = g.state.players;
    const shandian = makeUniqueCard(CardType.ShanDian);
    placeJudgment(g, p0, shandian);
    giveHand(p0, CardType.WuXie); // 被判定者出无懈抵消自己的闪电
    const deckCard = makeUniqueCard(CardType.Tao, '♥', 5);
    g.state.deck.replaceAll([deckCard]);

    await judgePhase(g, { player: p0 });

    expect(p0.judgment.cards).toHaveLength(0);
    expect(p1.judgment.cards.map((c) => c.id)).toContain(shandian.id); // 流向下家
    expect(g.state.deck.cards).toContain(deckCard);                    // 未判定，牌堆未动
    expect(g.state.discardPile.cards.map((c) => c.id)).not.toContain(shandian.id);
  });
});
