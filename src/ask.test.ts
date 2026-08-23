// ============================================================
// 三国杀最小原型 — ask 家族单元测试（异步，基于选择引擎）
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from './test-utils.js';

import { askForCard, askFromAreas, askForTargets, askYesNo } from './choose.js';

import { CardType } from './types.js';

describe('askForCard', () => {
  it('有指定类型牌 → 返回第一张，不改状态', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Shan, CardType.Sha, CardType.Tao);

    const card = await askForCard(g, player, '请打出闪', [CardType.Shan]);

    expect(card).toBe(player.hand[0]);
    expect(player.hand.length).toBe(3); // 只读，不消耗
  });

  it('多类型 → 按手牌顺序返回第一个匹配', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Tao, CardType.Sha);

    const card = await askForCard(g, player, '请打出杀或闪', [CardType.Sha, CardType.Shan]);

    expect(card).toBe(player.hand[1]);
  });

  it('没有指定类型 → 返回 null', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Tao);

    expect(await askForCard(g, player, '', [CardType.Shan])).toBeNull();
  });
});

describe('askFromAreas', () => {
  it('默认从手牌/装备/判定区选一张（有牌时返回其中一张）', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha, CardType.Tao);
    player.equipment.weapon = makeUniqueCard(CardType.ZhugeLianNu);

    const card = await askFromAreas(g, player, '弃置目标一张牌');

    expect(card).not.toBeNull();
    expect([...player.hand, player.equipment.weapon]).toContain(card);
  });

  it('areas 限定只从指定区域选', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha);
    player.equipment.weapon = makeUniqueCard(CardType.ZhugeLianNu);

    const card = await askFromAreas(g, player, '', ['equipment']);

    expect(card).toBe(player.equipment.weapon);
  });

  it('filter 过滤候选牌（麒麟弓：只选坐骑）', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha);
    player.equipment.weapon = makeUniqueCard(CardType.QiLinGong);
    player.equipment.offensiveHorse = makeUniqueCard(CardType.ChiTu);

    const card = await askFromAreas(
      g, player, '弃置一张坐骑', ['equipment'],
      (c) => c.type === CardType.ChiTu || c.type === CardType.JueYing,
    );

    expect(card).toBe(player.equipment.offensiveHorse);
  });

  it('目标区域无牌 → 返回 null', async () => {
    const g = freshGame();
    expect(await askFromAreas(g, g.state.players[0], '')).toBeNull();
  });
});

describe('askForTargets', () => {
  it('返回前 max 个候选人', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const others = g.state.players.slice(1);

    const targets = await askForTargets(g, player, '选择目标', others, 2);

    expect(targets).toEqual(others.slice(0, 2));
  });

  it('无可选候选人 → 返回 null', async () => {
    const g = freshGame();
    expect(await askForTargets(g, g.state.players[0], '', [])).toBeNull();
  });
});

describe('askYesNo', () => {
  it('返回默认值（AI 当前写死）', async () => {
    const g = freshGame();
    expect(await askYesNo(g, g.state.players[0], '是否继续判定？', true)).toBe(true);
    expect(await askYesNo(g, g.state.players[0], '是否发动？', false)).toBe(false);
  });
});
