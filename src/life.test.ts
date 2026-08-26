// ============================================================
// 三国杀最小原型 — life.ts 单元测试（体力操作与死亡结算）
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from './test-utils.js';

import { damage, dying, loseHp, recover } from './life.js';

import { CardType } from './types.js';

describe('damage', () => {
  it('造成 1 点伤害', async () => {
    const g = freshGame();
    const target = g.state.players[0];
    const before = target.hp;
    await damage(g, { target, source: g.state.players[1], amount: 1 });
    expect(target.hp).toBe(before - 1);
  });

  it('造成致死伤害 → player.alive = false', async () => {
    const g = freshGame();
    const target = g.state.players[0];
    target.hp = 1;
    await damage(g, { target, source: g.state.players[1], amount: 2 });
    expect(target.hp).toBeLessThanOrEqual(0);
    expect(target.alive).toBe(false);
  });

  it('致死伤害但有桃 → 濒死自救成功', async () => {
    const g = freshGame();
    const target = g.state.players[0];
    target.hp = 1;
    giveHand(target, CardType.Tao, CardType.Tao); // hp 1→-1, 需 2 桃才能回正

    await damage(g, { target, source: g.state.players[1], amount: 2 });

    expect(target.alive).toBe(true);
    expect(target.hp).toBe(1); // -1 + 桃(+1) = 0, 仍濒死, 再桃(+1) = 1 → 存活
    expect(target.hand.length).toBe(0);
  });
});

// ============================================================
// 濒死求桃
// ============================================================

describe('dying', () => {
  it('有桃 → 使用桃自救，存活', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    player.hp = 0;
    giveHand(player, CardType.Tao);

    await dying(g, { player });

    expect(player.alive).toBe(true);
    expect(player.hp).toBe(1);
    expect(player.hand.length).toBe(0); // 桃已用掉
  });

  it('有多个桃 → 用到体力 > 0 为止', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    player.hp = -1;        // 需要 2 个桃才能回正
    giveHand(player, CardType.Tao, CardType.Tao);

    await dying(g, { player });

    expect(player.alive).toBe(true);
    expect(player.hp).toBe(1);
    expect(player.hand.length).toBe(0);
  });

  it('无桃 → 真正死亡', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    player.hp = 0;

    await dying(g, { player });

    expect(player.alive).toBe(false);
    expect(g.state.gameOver).toBe(false); // 还有 2 人存活，游戏未结束
  });

  it('已死亡 → 跳过', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    player.alive = false;
    player.hp = -2;
    giveHand(player, CardType.Tao);

    await dying(g, { player });

    expect(player.alive).toBe(false);
    expect(player.hand.length).toBe(1); // 桃未使用
  });

  it('其他角色按座次出桃救援（从当前回合角色开始）', async () => {
    const g = freshGame(); // 刘备/曹操/孙权，currentIndex=0
    const target = g.state.players[0]; // 刘备濒死
    const savior = g.state.players[1]; // 曹操
    target.hp = 0;
    giveHand(savior, CardType.Tao);

    await dying(g, { player: target });

    expect(target.alive).toBe(true);
    expect(target.hp).toBe(1);
    expect(savior.hand.length).toBe(0); // 曹操的桃被用来救人
  });

  it('用桃者被继续询问：同一玩家可连续使用多个桃', async () => {
    const g = freshGame(); // 刘备/曹操/孙权，currentIndex=0
    const target = g.state.players[2]; // 孙权濒死 hp=-1，需 2 桃
    const a = g.state.players[0];      // 刘备：先问，无桃
    const b = g.state.players[1];      // 曹操：用第 1 桃后被继续询问，用第 2 桃救活
    target.hp = -1;
    giveHand(b, CardType.Tao, CardType.Tao);

    await dying(g, { player: target });

    expect(target.alive).toBe(true);
    expect(target.hp).toBe(1);
    expect(a.hand.length).toBe(0); // 刘备无桃
    expect(b.hand.length).toBe(0); // 曹操连续用了两张（指针停在用桃者身上）
  });

  it('回合外华佗可用急救（红牌当桃）救人', async () => {
    const g = freshGame({}, ['刘备', '华佗', '孙权']);
    const liubei = g.state.players[0];
    const huatuo = g.state.players[1];
    const sunquan = g.state.players[2];
    sunquan.hp = 0;
    liubei.hand = []; // 刘备无桃，先跳过
    huatuo.hand = [makeUniqueCard(CardType.Shan, '♥', 2)]; // 红色牌当桃

    await dying(g, { player: sunquan });

    expect(sunquan.hp).toBe(1);
    expect(sunquan.alive).toBe(true);
    expect(huatuo.hand.length).toBe(0); // 红色牌被急救消耗
    expect(g.state.discardPile.some((c) => c.suit === '♥')).toBe(true);
  });
});

describe('recover', () => {
  it('恢复 1 点体力', async () => {
    const g = freshGame();
    const target = g.state.players[0];
    target.hp = 2;
    await recover(g, { target, amount: 1 });
    expect(target.hp).toBe(3);
  });

  it('不超过最大体力', async () => {
    const g = freshGame();
    const target = g.state.players[0];
    target.hp = target.maxHp;
    await recover(g, { target, amount: 1 });
    expect(target.hp).toBe(target.maxHp);
  });
});

// ============================================================
// loseHp — 失去体力原语
// ============================================================

describe('loseHp', () => {
  it('直接失去体力（无来源、无伤害事件）', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const before = player.hp;

    await loseHp(g, player, 2);

    expect(player.hp).toBe(before - 2);
  });

  it('失去体力到 0 以下 → 进入濒死（无桃则死亡）', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    player.hp = 1;

    await loseHp(g, player, 2);

    expect(player.hp).toBe(-1);
    expect(player.alive).toBe(false);
  });
});
