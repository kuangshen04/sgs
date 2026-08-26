// ============================================================
// 诸葛亮 — 空城（锁定技：没有手牌时不能成为【杀】/【决斗】的目标）
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from '../test-utils.js';

import { computeTargetOptions } from '../choose.js';
import { asUsedCard } from '../cardRegistry.js';

import { preparePhase } from '../gameFlow.js';
import { registerSkills } from '../skills.js';
import { effectRegistry } from '../persistentEffects.js';

import { CardType } from '../types.js';

describe('空城（诸葛亮锁定技）', () => {
  it('effectRegistry：无手牌时拥有 immuneSha/immuneJueDou（活查询）', () => {
    const g = freshGame({}, ['刘备', '诸葛亮', '孙权']);
    const zhuge = g.state.players[1];

    expect(effectRegistry.has(zhuge, 'immuneSha')).toBe(true);
    expect(effectRegistry.has(zhuge, 'immuneJueDou')).toBe(true);

    giveHand(zhuge, CardType.Sha);
    expect(effectRegistry.has(zhuge, 'immuneSha')).toBe(false); // 有手牌后失效
  });

  it('无手牌时不能成为杀/决斗的目标（targetFilter 排除）', () => {
    const g = freshGame({}, ['刘备', '诸葛亮', '孙权']);
    const attacker = g.state.players[0];
    giveHand(attacker, CardType.Sha);

    const shaTargets = computeTargetOptions(g, asUsedCard(attacker.hand[0]), attacker);
    expect(shaTargets.map((t) => t.index)).toEqual([2]); // 诸葛亮被排除

    giveHand(attacker, CardType.JueDou);
    const jdTargets = computeTargetOptions(g, asUsedCard(attacker.hand[0]), attacker);
    expect(jdTargets.map((t) => t.index)).toEqual([2]);
  });

  it('有手牌时可以被指定为目标', () => {
    const g = freshGame({}, ['刘备', '诸葛亮', '孙权']);
    const attacker = g.state.players[0];
    const zhuge = g.state.players[1];
    giveHand(zhuge, CardType.Sha); // 诸葛亮有手牌
    giveHand(attacker, CardType.Sha);

    const targets = computeTargetOptions(g, asUsedCard(attacker.hand[0]), attacker);
    expect(targets.map((t) => t.index)).toEqual([1, 2]);
  });
});

describe('观星（诸葛亮技能）', () => {
  it('默认全部放顶，牌堆顺序与清空处理区', async () => {
    const g = freshGame({}, ['诸葛亮', '刘备', '孙权']);
    registerSkills(g);
    const zhuge = g.state.players[0];
    const deck = [makeUniqueCard(CardType.Sha), makeUniqueCard(CardType.Tao), makeUniqueCard(CardType.Shan)];
    g.state.deck = [...deck];

    await preparePhase(g, { player: zhuge });

    expect(g.state.deck).toEqual(deck); // 顶到下顺序不变
    expect(g.state.processing).toHaveLength(0);
  });
});
