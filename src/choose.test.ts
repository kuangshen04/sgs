// ============================================================
// 三国杀最小原型 — choose.ts 单元测试
// 选牌 / 选目标 / 两阶段串联 / decider 注入 / 响应牌询问 findResponse
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, DEFAULT_HEROES } from './test-utils.js';

import { cardRegistry } from './cardRegistry.js';
import { createGame } from './game.js';
import { STANDARD_DECK } from './cards.js';
import type { Game } from './game.js';

import {
  computeCardOptions,
  computeTargetOptions,
  choose,
  findResponse,
} from './choose.js';
import type { CardDecider, Deciders } from './choose.js';

import { playPhase } from './gameFlow.js';

import { CardType } from './types.js';

// ============================================================
// computeCardOptions — Phase 1: 选牌
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

  it('computeCardOptions 只做规则过滤，保持手牌顺序', () => {
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

  it('默认 AI 决策：按 usePriority 降序选牌（桃 90 优先）', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    player.hp = 2;
    giveHand(player, CardType.Sha, CardType.JueDou, CardType.Tao);

    const result = await choose(g, { player, shaUsed: false });

    expect(result!.card.type).toBe(CardType.Tao);
  });
});

// ============================================================
// computeTargetOptions — Phase 2: 选目标
// ============================================================

describe('computeTargetOptions', () => {
  it('杀的合法目标是不包含自己的其他存活玩家', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha);
    const card = player.hand[0];

    const targets = computeTargetOptions(g, card, player);
    expect(targets.length).toBe(2);
    expect(targets.map((t) => t.player)).toEqual([g.state.players[1], g.state.players[2]]);
  });

  it('桃的合法目标只有自己', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Tao);
    const card = player.hand[0];

    const targets = computeTargetOptions(g, card, player);
    expect(targets.length).toBe(1);
    expect(targets[0].player).toBe(player);
  });

  it('南蛮入侵的合法目标是全体其他存活玩家', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.NanMan);
    const card = player.hand[0];

    const targets = computeTargetOptions(g, card, player);
    expect(targets.length).toBe(2);
  });

  it('万箭齐发的合法目标是全体其他存活玩家', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.WanJian);
    const card = player.hand[0];

    const targets = computeTargetOptions(g, card, player);
    expect(targets.length).toBe(2);
  });

  it('桃园结义的合法目标是全体存活玩家（含自己）', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.TaoYuan);
    const card = player.hand[0];

    const targets = computeTargetOptions(g, card, player);
    expect(targets.length).toBe(3);
    expect(targets.map((t) => t.player)).toContain(player);
  });

  it('五谷丰登的合法目标是全体存活玩家（含自己）', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.WuGu);
    const card = player.hand[0];

    const targets = computeTargetOptions(g, card, player);
    expect(targets.length).toBe(3);
    expect(targets.map((t) => t.player)).toContain(player);
  });

  it('装备牌的合法目标是使用者自己', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.ZhugeLianNu);
    const card = player.hand[0];

    const targets = computeTargetOptions(g, card, player);
    expect(targets.length).toBe(1);
    expect(targets[0].player).toBe(player);
  });

  it('过河拆桥/顺手牵羊的合法目标是有手牌的其他存活角色', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.GuoHe);
    giveHand(g.state.players[1], CardType.Sha);
    // players[2] 空手 → 不可选

    const targets = computeTargetOptions(g, player.hand[0], player);
    expect(targets.length).toBe(1);
    expect(targets[0].player).toBe(g.state.players[1]);
  });
});

// ============================================================
// choose() — 两阶段串联
// ============================================================

describe('choose', () => {
  it('默认 AI：手牌只有杀 → 选杀 + AI 选目标', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha);

    const result = await choose(g, { player, shaUsed: false });
    expect(result).not.toBeNull();
    expect(result!.card.type).toBe(CardType.Sha);
    expect(result!.targets.length).toBe(1);
  });

  it('默认 AI：空手 → 返回 null', async () => {
    const g = freshGame();
    const player = g.state.players[0];

    const result = await choose(g, { player, shaUsed: false });
    expect(result).toBeNull();
  });

  // Phase 1: 自定义 cardDecider

  it('自定义 cardDecider：优先选决斗', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha, CardType.JueDou);

    const preferJuedou: CardDecider = (options) => {
      const jd = options.find((o) => o.card.type === CardType.JueDou);
      return jd ? { cardId: jd.card.id } : null;
    };

    const result = await choose(g, { player, shaUsed: false, cardDecide: preferJuedou });
    expect(result).not.toBeNull();
    expect(result!.card.type).toBe(CardType.JueDou);
  });

  it('cardDecider 返回 null → choose 返回 null', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha);

    const result = await choose(g, {
      player, shaUsed: false,
      cardDecide: () => null,
    });
    expect(result).toBeNull();
  });

  it('cardDecider 选不存在的 cardId → 校验拒绝 → null', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha);

    const result = await choose(g, {
      player, shaUsed: false,
      cardDecide: () => ({ cardId: 99999 }),
    });
    expect(result).toBeNull();
  });

  // Phase 2: 自定义 targetDecider

  it('自定义 targetDecider：杀指定打索引 2', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha);

    const result = await choose(g, {
      player, shaUsed: false,
      targetDecide: () => ({ targetIndices: [2] }),
    });
    expect(result).not.toBeNull();
    expect(result!.targets).toEqual([g.state.players[2]]);
  });

  it('targetDecider 选自己(杀不能打自己) → 校验拒绝 → null', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha);

    const result = await choose(g, {
      player, shaUsed: false,
      targetDecide: () => ({ targetIndices: [0] }),
    });
    expect(result).toBeNull();
  });

  it('南蛮入侵只选 1 个目标 → targetCount=all 校验拒绝 → null', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.NanMan);

    const result = await choose(g, {
      player, shaUsed: false,
      targetDecide: () => ({ targetIndices: [1] }),
    });
    expect(result).toBeNull();
  });

  it('杀选 2 个目标 → targetCount=1 校验拒绝 → null', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha);

    const result = await choose(g, {
      player, shaUsed: false,
      targetDecide: () => ({ targetIndices: [1, 2] }),
    });
    expect(result).toBeNull();
  });

  it('targetDecider 返回 null → choose 返回 null', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha);

    const result = await choose(g, {
      player, shaUsed: false,
      targetDecide: () => null,
    });
    expect(result).toBeNull();
  });
});

// ============================================================
// findResponse — 响应牌询问（只读）
// ============================================================

describe('findResponse', () => {
  it('手牌有指定类型 → 返回该牌，不改状态', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha, CardType.Tao);

    const result = findResponse(player, CardType.Sha);

    expect(result).toBeDefined();
    expect(result!.type).toBe(CardType.Sha);
    expect(player.hand.length).toBe(2); // 只读，不消耗
  });

  it('多张同类型 → 返回第一张', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Shan, CardType.Sha, CardType.Sha);

    const result = findResponse(player, CardType.Sha);

    expect(result).toBe(player.hand[1]);
  });

  it('手牌没有指定类型 → 返回 null', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Tao);

    expect(findResponse(player, CardType.Sha)).toBeNull();
  });

  it('空手牌 → 返回 null', () => {
    const g = freshGame();
    expect(findResponse(g.state.players[0], CardType.Sha)).toBeNull();
  });
});

// ============================================================
// 全局注入 decider（Game.deciders）
// ============================================================

describe('全局注入 decider', () => {
  /** 创建带全局 decider 的测试局（清空手牌） */
  function gameWithDeciders(deciders: Deciders): Game {
    const g = createGame(STANDARD_DECK, DEFAULT_HEROES, { deciders });
    for (const p of g.state.players) p.hand = [];
    return g;
  }

  it('choose 使用 game.deciders.cardDecide', async () => {
    const g = gameWithDeciders({
      cardDecide: (options) => {
        const jd = options.find((o) => o.card.type === CardType.JueDou);
        return jd ? { cardId: jd.card.id } : null;
      },
    });
    const player = g.state.players[0];
    giveHand(player, CardType.Sha, CardType.JueDou);

    const result = await choose(g, { player, shaUsed: false });
    expect(result).not.toBeNull();
    expect(result!.card.type).toBe(CardType.JueDou);
  });

  it('choose 参数注入优先于 game.deciders', async () => {
    const g = gameWithDeciders({ cardDecide: () => null }); // 全局：不出牌
    const player = g.state.players[0];
    giveHand(player, CardType.Sha);

    // 调用参数覆盖全局 → 出杀
    const result = await choose(g, {
      player, shaUsed: false,
      cardDecide: (options) => ({ cardId: options[0].card.id }),
    });
    expect(result).not.toBeNull();
    expect(result!.card.type).toBe(CardType.Sha);
  });

  it('playPhase 使用全局注入的 cardDecide 循环出牌', async () => {
    const g = gameWithDeciders({
      cardDecide: (options) => {
        const sha = options.find((o) => o.card.type === CardType.Sha);
        return sha ? { cardId: sha.card.id } : null;
      },
    });
    const player = g.state.players[0];
    const target = g.state.players[1];
    giveHand(player, CardType.Sha);
    const hpBefore = target.hp;

    await playPhase(g, { player });

    expect(player.hand.length).toBe(0);
    expect(target.hp).toBe(hpBefore - 1);
  });

  it('全局注入非法 targetDecider → 校验拒绝，牌留在手上', async () => {
    // 南蛮入侵只选 1 个目标 → targetCount=all 校验失败
    const g = gameWithDeciders({
      targetDecide: () => ({ targetIndices: [1] }),
    });
    const player = g.state.players[0];
    giveHand(player, CardType.NanMan);

    await playPhase(g, { player });

    expect(player.hand.length).toBe(1);
  });
});
