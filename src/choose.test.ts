// ============================================================
// 三国杀最小原型 — choose.ts 单元测试
// 规则层可选集（computeCardOptions / computeTargetOptions）、
// 出牌选择（chooseCardAndTargets 默认 AI）
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from './test-utils.js';

import { cardRegistry, asUsedCard } from './cardRegistry.js';

import {
  computeCardOptions,
  computeTargetOptions,
} from './choose.js';

import { CardType } from './types.js';

// ============================================================
// computeCardOptions — 规则层：选牌
// ============================================================

describe('computeCardOptions', () => {
  it('手牌有杀 → 返回杀选项', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha);

    const options = computeCardOptions(g, player, false);
    expect(options.length).toBe(1);
    expect(options[0].card.type).toBe(CardType.Sha);
  });

  it('shaUsed=true → 杀不再是选项', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha);

    expect(computeCardOptions(g, player, true).length).toBe(0);
  });

  it('空手 → 返回空', () => {
    const g = freshGame();
    expect(computeCardOptions(g, g.state.players[0], false).length).toBe(0);
  });

  it('只做规则过滤，保持手牌顺序', () => {
    const g = freshGame();
    const player = g.state.players[0];
    player.hp = 2;
    giveHand(player, CardType.Sha, CardType.JueDou, CardType.Tao);

    const options = computeCardOptions(g, player, false);
    expect(options.map((o) => o.card.type))
      .toEqual([CardType.Sha, CardType.JueDou, CardType.Tao]);
  });

  it('规则与 AI 分层：决斗无杀在手时规则允许、AI 不使用', () => {
    const g = freshGame();
    const player = g.state.players[0];
    const def = cardRegistry.get(CardType.JueDou)!;

    expect(def.canUse(player, g.state.players, false)).toBe(true);        // 规则：合法
    expect(def.ai.shouldUse(player, false)).toBe(false);                  // AI：没杀垫底不用
  });

  it('规则与 AI 分层：决斗有杀在手时 AI 也愿意用', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha);
    const def = cardRegistry.get(CardType.JueDou)!;

    expect(def.ai.shouldUse(player, false)).toBe(true);
  });

  it('规则层面：桃满血时 canUse=false（受伤与否是规则不是策略）', () => {
    const g = freshGame();
    const player = g.state.players[0];
    player.hp = player.maxHp;
    const def = cardRegistry.get(CardType.Tao)!;

    expect(def.canUse(player, g.state.players, false)).toBe(false);
  });

  it('桃 hp 满时不可用', () => {
    const g = freshGame();
    const player = g.state.players[0];
    player.hp = player.maxHp;
    giveHand(player, CardType.Tao);

    expect(computeCardOptions(g, player, false).find(
      (o) => o.card.type === CardType.Tao,
    )).toBeUndefined();
  });

  it('闪不会出现（canUse=false）', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Shan);

    expect(computeCardOptions(g, player, false).length).toBe(0);
  });
});

// ============================================================
// computeTargetOptions — 规则层：选目标
// ============================================================

describe('computeTargetOptions', () => {
  it('杀的合法目标是不包含自己的其他存活玩家', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha);
    const card = player.hand[0];

    const targets = computeTargetOptions(g, asUsedCard(card), player);
    expect(targets.length).toBe(2);
    expect(targets.map((t) => t.player)).toEqual([g.state.players[1], g.state.players[2]]);
  });

  it('桃的合法目标只有自己', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Tao);
    const card = player.hand[0];

    const targets = computeTargetOptions(g, asUsedCard(card), player);
    expect(targets.length).toBe(1);
    expect(targets[0].player).toBe(player);
  });

  it('南蛮入侵的合法目标是全体其他存活玩家', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.NanMan);
    const card = player.hand[0];

    const targets = computeTargetOptions(g, asUsedCard(card), player);
    expect(targets.length).toBe(2);
  });

  it('万箭齐发的合法目标是全体其他存活玩家', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.WanJian);
    const card = player.hand[0];

    const targets = computeTargetOptions(g, asUsedCard(card), player);
    expect(targets.length).toBe(2);
  });

  it('桃园结义的合法目标是全体存活玩家（含自己）', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.TaoYuan);
    const card = player.hand[0];

    const targets = computeTargetOptions(g, asUsedCard(card), player);
    expect(targets.length).toBe(3);
    expect(targets.map((t) => t.player)).toContain(player);
  });

  it('五谷丰登的合法目标是全体存活玩家（含自己）', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.WuGu);
    const card = player.hand[0];

    const targets = computeTargetOptions(g, asUsedCard(card), player);
    expect(targets.length).toBe(3);
    expect(targets.map((t) => t.player)).toContain(player);
  });

  it('装备牌的合法目标是使用者自己', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.ZhugeLianNu);
    const card = player.hand[0];

    const targets = computeTargetOptions(g, asUsedCard(card), player);
    expect(targets.length).toBe(1);
    expect(targets[0].player).toBe(player);
  });

  it('4人局：杀只能攻击距离 1 的角色（默认攻击范围 1）', () => {
    const g = freshGame({}, ['刘备', '曹操', '孙权', '郭嘉']);
    const player = g.state.players[0];
    giveHand(player, CardType.Sha);

    const targets = computeTargetOptions(g, asUsedCard(player.hand[0]), player);
    expect(targets.map((t) => t.index)).toEqual([1, 3]); // 对位（索引 2）距离 2 排除
  });

  it('4人局：马术使距离-1，可攻击对位角色', () => {
    const g = freshGame({}, ['马超', '曹操', '孙权', '郭嘉']);
    const player = g.state.players[0];
    giveHand(player, CardType.Sha);

    const targets = computeTargetOptions(g, asUsedCard(player.hand[0]), player);
    expect(targets.map((t) => t.index)).toEqual([1, 2, 3]);
  });

  it('4人局：进攻马扩展杀的目标', () => {
    const g = freshGame({}, ['刘备', '曹操', '孙权', '郭嘉']);
    const players = g.state.players;
    players[0].equipment.offensiveHorse = makeUniqueCard(CardType.ChiTu); // 刘备进攻马
    giveHand(players[0], CardType.Sha);

    const targets = computeTargetOptions(g, asUsedCard(players[0].hand[0]), players[0]);
    // 曹操 1，孙权 2-1=1，郭嘉 1-1=1 → 全部可打
    expect(targets.map((t) => t.index)).toEqual([1, 2, 3]);
  });

  it('4人局：防御马使杀无法攻击该角色', () => {
    const g = freshGame({}, ['刘备', '曹操', '孙权', '郭嘉']);
    const players = g.state.players;
    players[3].equipment.defensiveHorse = makeUniqueCard(CardType.JueYing); // 郭嘉防御马
    giveHand(players[0], CardType.Sha);

    const targets = computeTargetOptions(g, asUsedCard(players[0].hand[0]), players[0]);
    // 曹操 1 ✓，孙权 2 排除，郭嘉 1+1=2 排除
    expect(targets.map((t) => t.index)).toEqual([1]);
  });

  it('4人局：顺手牵羊只能对距离 1 的角色使用', () => {
    const g = freshGame({}, ['刘备', '曹操', '孙权', '郭嘉']);
    const player = g.state.players[0];
    giveHand(player, CardType.ShunShou);
    giveHand(g.state.players[1], CardType.Sha);
    giveHand(g.state.players[2], CardType.Tao);  // 距离 2 但有牌 → 排除
    giveHand(g.state.players[3], CardType.Shan);

    const targets = computeTargetOptions(g, asUsedCard(player.hand[0]), player);
    expect(targets.map((t) => t.index)).toEqual([1, 3]);
  });

  it('过河拆桥/顺手牵羊的合法目标是有手牌的其他存活角色', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.GuoHe);
    giveHand(g.state.players[1], CardType.Sha);
    // players[2] 空手 → 不可选

    const targets = computeTargetOptions(g, asUsedCard(player.hand[0]), player);
    expect(targets.length).toBe(1);
    expect(targets[0].player).toBe(g.state.players[1]);
  });
});

