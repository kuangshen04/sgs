// ============================================================
// 三国杀最小原型 — game.ts 单元测试
// 引擎层：牌堆 / 初始化 / 胜利条件 / Action 工厂 / 打出原语
// ============================================================

import { describe, it, expect } from 'vitest';

import './cards.js'; // 触发卡牌注册（side-effect import）
import { STANDARD_DECK } from './cards.js';

import { displayNumber, cardRegistry, createDeck, shuffle } from './cardRegistry.js';
import { playFromHand, giveCards, discardCards, drawCards, moveCards } from './cardActions.js';
import { damage, recover, dying } from './life.js';
import { createGame, lastManStanding } from './game.js';

import { freshGame, giveHand, makeCard, makeUniqueCard, DEFAULT_HEROES } from './test-utils.js';

import { CardTag, CardType } from './types.js';
import type { Card } from './types.js';
import { heroRegistry } from './heroRegistry.js';

// ============================================================
// 纯函数
// ============================================================

describe('displayNumber', () => {
  it('A/1 → A', () => expect(displayNumber(1)).toBe('A'));
  it('11 → J', () => expect(displayNumber(11)).toBe('J'));
  it('12 → Q', () => expect(displayNumber(12)).toBe('Q'));
  it('13 → K', () => expect(displayNumber(13)).toBe('K'));
  it('普通数字原样返回', () => {
    expect(displayNumber(5)).toBe('5');
    expect(displayNumber(10)).toBe('10');
  });
});

describe('shuffle', () => {
  function cards(...ids: number[]): Card[] {
    return ids.map((id) => makeCard(id, CardType.Sha));
  }

  it('不改变数组长度', () => {
    const input = cards(1, 2, 3, 4, 5);
    expect(shuffle(input).length).toBe(input.length);
  });

  it('包含所有原元素', () => {
    const input = cards(1, 2, 3, 4, 5);
    const result = shuffle(input);
    const ids = (arr: Card[]) => [...arr].map((c) => c.id).sort((a, b) => a - b);
    expect(ids(result)).toEqual(ids(input));
  });

  it('不修改原数组', () => {
    const input = cards(1, 2, 3, 4, 5);
    const copy = [...input];
    shuffle(input);
    expect(input).toEqual(copy);
  });

  it('空数组返回空数组', () => {
    expect(shuffle([])).toEqual([]);
  });
});

// ============================================================
// 卡牌注册表
// ============================================================

describe('cardRegistry', () => {
  it('注册后可通过 get 获取', () => {
    const def = cardRegistry.get(CardType.Sha);
    expect(def).toBeDefined();
    expect(def!.name).toBe('杀');
    expect(def!.emoji).toBe('🗡️');
  });

  it('获取未注册的类型返回 undefined', () => {
    // @ts-expect-error 故意测试不存在的类型
    expect(cardRegistry.get('不存在的牌')).toBeUndefined();
  });

  it('all() 可遍历所有已注册卡牌', () => {
    const all = [...cardRegistry.all()];
    expect(all.length).toBeGreaterThanOrEqual(5);
    const names = all.map((d) => d.name);
    expect(names).toContain('杀');
    expect(names).toContain('桃');
    expect(names).toContain('南蛮入侵');
    expect(names).toContain('万箭齐发');
    expect(names).toContain('桃园结义');
    expect(names).toContain('五谷丰登');
    expect(names).toContain('乐不思蜀');
    expect(names).toContain('闪电');
    expect(names).toContain('诸葛连弩');
    expect(names).toContain('八卦阵');
    expect(names).toContain('绝影');
    expect(names).toContain('赤兔');
    expect(names).toContain('麒麟弓');
    expect(names).toContain('寒冰剑');
    expect(names).toContain('过河拆桥');
    expect(names).toContain('顺手牵羊');
  });

  it('每张注册牌都有 targetFilter', () => {
    for (const def of cardRegistry.all()) {
      expect(def.targetFilter).toBeTypeOf('function');
    }
  });

  it('基本牌 tag = Basic', () => {
    for (const t of [CardType.Sha, CardType.Shan, CardType.Tao]) {
      expect(cardRegistry.get(t)!.tags).toContain(CardTag.Basic);
    }
  });

  it('锦囊牌 tag = Trick', () => {
    for (const t of [CardType.WuZhong, CardType.JueDou, CardType.NanMan, CardType.WanJian, CardType.TaoYuan, CardType.WuGu, CardType.LeBu, CardType.GuoHe, CardType.ShunShou]) {
      expect(cardRegistry.get(t)!.tags).toContain(CardTag.Trick);
    }
  });

  it('延时锦囊 tag = Trick + Delay', () => {
    for (const t of [CardType.LeBu, CardType.ShanDian]) {
      expect(cardRegistry.get(t)!.tags).toContain(CardTag.Trick);
      expect(cardRegistry.get(t)!.tags).toContain(CardTag.Delay);
    }
  });

  it('装备牌 tag = Equip + 子类', () => {
    expect(cardRegistry.get(CardType.ZhugeLianNu)!.tags).toEqual(
      [CardTag.Equip, CardTag.Weapon],
    );
    expect(cardRegistry.get(CardType.BaGuaZhen)!.tags).toEqual(
      [CardTag.Equip, CardTag.Armor],
    );
    expect(cardRegistry.get(CardType.JueYing)!.tags).toEqual(
      [CardTag.Equip, CardTag.DefensiveHorse],
    );
    expect(cardRegistry.get(CardType.ChiTu)!.tags).toEqual(
      [CardTag.Equip, CardTag.OffensiveHorse],
    );
  });
});

// ============================================================
// 牌堆生成
// ============================================================

describe('createDeck', () => {
  it('牌堆 158 张（154 + 麒麟弓/寒冰剑各 2）', () => {
    const deck = createDeck(STANDARD_DECK);
    expect(deck.length).toBe(158);
  });

  it('每张牌有 id/type/name/suit/number', () => {
    const deck = createDeck(STANDARD_DECK);
    for (const card of deck) {
      expect(card.id).toBeTypeOf('number');
      expect(card.type).toBeTypeOf('string');
      expect(card.name).toBeTypeOf('string');
      expect(card.suit).toBeTypeOf('string');
      expect(card.number).toBeTypeOf('number');
    }
  });

  it('杀数量 = (9+10)×2副本 = 38', () => {
    const deck = createDeck(STANDARD_DECK);
    const shaCount = deck.filter((c) => c.type === CardType.Sha).length;
    expect(shaCount).toBe(38);
  });

  it('南蛮入侵数量 = (2+1)×2副本 = 6', () => {
    const deck = createDeck(STANDARD_DECK);
    const nmCount = deck.filter((c) => c.type === CardType.NanMan).length;
    expect(nmCount).toBe(6);
  });

  it('过河拆桥数量 = (3+3)×2副本 = 12', () => {
    const deck = createDeck(STANDARD_DECK);
    const count = deck.filter((c) => c.type === CardType.GuoHe).length;
    expect(count).toBe(12);
  });

  it('顺手牵羊数量 = (3+3)×2副本 = 12', () => {
    const deck = createDeck(STANDARD_DECK);
    const count = deck.filter((c) => c.type === CardType.ShunShou).length;
    expect(count).toBe(12);
  });

  it('万箭齐发数量 = (1+1)×2副本 = 4', () => {
    const deck = createDeck(STANDARD_DECK);
    const count = deck.filter((c) => c.type === CardType.WanJian).length;
    expect(count).toBe(4);
  });

  it('桃园结义数量 = 1×2副本 = 2', () => {
    const deck = createDeck(STANDARD_DECK);
    const count = deck.filter((c) => c.type === CardType.TaoYuan).length;
    expect(count).toBe(2);
  });

  it('五谷丰登数量 = 2×2副本 = 4', () => {
    const deck = createDeck(STANDARD_DECK);
    const count = deck.filter((c) => c.type === CardType.WuGu).length;
    expect(count).toBe(4);
  });

  it('乐不思蜀数量 = 3×2副本 = 6', () => {
    const deck = createDeck(STANDARD_DECK);
    const count = deck.filter((c) => c.type === CardType.LeBu).length;
    expect(count).toBe(6);
  });

  it('闪电数量 = 1×2副本 = 2', () => {
    const deck = createDeck(STANDARD_DECK);
    const count = deck.filter((c) => c.type === CardType.ShanDian).length;
    expect(count).toBe(2);
  });

  it('装备牌数量 = 4种×2副本 = 8', () => {
    const deck = createDeck(STANDARD_DECK);
    const count = deck.filter((c) => c.type === CardType.ZhugeLianNu
      || c.type === CardType.BaGuaZhen
      || c.type === CardType.JueYing
      || c.type === CardType.ChiTu).length;
    expect(count).toBe(8);
  });

  it('麒麟弓/寒冰剑数量 = 各 2', () => {
    const deck = createDeck(STANDARD_DECK);
    expect(deck.filter((c) => c.type === CardType.QiLinGong).length).toBe(2);
    expect(deck.filter((c) => c.type === CardType.HanBingJian).length).toBe(2);
  });

  it('无懈可击数量 = 8', () => {
    const deck = createDeck(STANDARD_DECK);
    const wxCount = deck.filter((c) => c.type === CardType.WuXie).length;
    expect(wxCount).toBe(8);
  });
});

// ============================================================
// 游戏初始化
// ============================================================

describe('createGame', () => {
  it('heroRegistry 可查询已注册武将', () => {
    expect(heroRegistry.get('刘备')?.skills).toContain('仁德');
    expect(heroRegistry.get('郭嘉')?.maxHp).toBe(3);
    expect(heroRegistry.get('不存在')).toBeUndefined();
  });

  it('创建指定数量的玩家', () => {
    const g = createGame(STANDARD_DECK, DEFAULT_HEROES);
    expect(g.state.players.length).toBe(3);
    expect(g.state.players[0].name).toBe('刘备');
    expect(g.state.players[1].name).toBe('曹操');
    expect(g.state.players[2].name).toBe('孙权');
  });

  it('每个玩家初始 4 张手牌', () => {
    const g = createGame(STANDARD_DECK, DEFAULT_HEROES);
    for (const p of g.state.players) {
      expect(p.hand.length).toBe(4);
    }
  });

  it('初始状态正确', () => {
    const g = createGame(STANDARD_DECK, DEFAULT_HEROES);
    expect(g.state.round).toBe(1);
    expect(g.state.currentIndex).toBe(0);
    expect(g.state.gameOver).toBe(false);
    expect(g.state.winner).toBeNull();
    // 158 - 3人×4 = 146
    expect(g.state.deck.length).toBe(146);
    expect(g.state.discardPile.length).toBe(0);
  });

  it('局内牌 id 唯一', () => {
    const g = createGame(STANDARD_DECK, DEFAULT_HEROES);
    const ids = new Set(g.state.deck.map((c) => c.id));
    expect(ids.size).toBe(g.state.deck.length);
  });

  it('同名英雄可重复（三个郭嘉）', () => {
    const g = createGame(STANDARD_DECK, ['郭嘉', '郭嘉', '郭嘉']);
    expect(g.state.players.length).toBe(3);
    expect(g.state.players.every((p) => p.hero.name === '郭嘉')).toBe(true);
    expect(g.state.players.every((p) => p.hero.skills?.includes('遗计'))).toBe(true);
    // 同名英雄持有独立的 hero 副本
    expect(g.state.players[0].hero).not.toBe(g.state.players[1].hero);
  });

  it('未注册的英雄名 → 抛错', () => {
    expect(() => createGame(STANDARD_DECK, ['不存在'])).toThrow(/not registered/);
  });
});

// ============================================================
// 胜利条件
// ============================================================

describe('lastManStanding', () => {
  it('只有 1 人存活 → 返回该玩家', () => {
    const g = freshGame();
    g.state.players[0].alive = true;
    g.state.players[1].alive = false;
    g.state.players[2].alive = false;
    const winner = lastManStanding(g.state);
    expect(winner).toBe(g.state.players[0]);
  });

  it('多人存活 → 返回 null', () => {
    const g = freshGame();
    g.state.players[0].alive = true;
    g.state.players[1].alive = true;
    g.state.players[2].alive = false;
    expect(lastManStanding(g.state)).toBeNull();
  });

  it('全员存活 → 返回 null', () => {
    const g = freshGame();
    expect(lastManStanding(g.state)).toBeNull();
  });
});

// ============================================================
// Action 工厂 — 独立测试
// ============================================================

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

describe('drawCards', () => {
  it('摸 2 张牌', async () => {
    const g = freshGame();
    const target = g.state.players[0];
    const before = target.hand.length;
    await drawCards(g, { target, count: 2 });
    expect(target.hand.length).toBe(before + 2);
  });

  it('牌堆空时自动洗入弃牌堆', async () => {
    const g = freshGame();
    // 把牌堆移到弃牌堆
    g.state.discardPile.push(...g.state.deck.splice(0));
    const target = g.state.players[0];
    await drawCards(g, { target, count: 1 });
    expect(target.hand.length).toBe(1);
    // 弃牌堆被洗回牌堆，牌堆数 = 原弃牌堆 - 1
    expect(g.state.deck.length).toBeGreaterThan(0);
  });
});

// ============================================================
// playFromHand — 打出原语
// ============================================================

describe('playFromHand', () => {
  it('把牌从手牌移入弃牌堆', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha, CardType.Tao);
    const card = player.hand[0];

    playFromHand(g, player, card);

    expect(player.hand.map((c) => c.type)).toEqual([CardType.Tao]);
    expect(g.state.discardPile).toContain(card);
  });

  it('牌不在手牌 → 不重复入弃牌堆', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Tao);
    const phantom = makeUniqueCard(CardType.Sha);

    playFromHand(g, player, phantom);

    expect(g.state.discardPile).not.toContain(phantom);
  });
});

// ============================================================
// giveCards — 交给原语（手牌区 ↔ 手牌区）
// ============================================================

describe('giveCards', () => {
  it('把牌从 from 手牌移入 to 手牌', () => {
    const g = freshGame();
    const from = g.state.players[0];
    const to = g.state.players[1];
    giveHand(from, CardType.Sha, CardType.Tao);
    const card = from.hand[0];

    giveCards(from, to, [card]);

    expect(from.hand.map((c) => c.type)).toEqual([CardType.Tao]);
    expect(to.hand).toContain(card);
    expect(g.state.discardPile.length).toBe(0); // 不经过弃牌堆
  });

  it('牌不在 from 手牌 → 跳过，不入 to 手牌', () => {
    const g = freshGame();
    const from = g.state.players[0];
    const to = g.state.players[1];
    giveHand(from, CardType.Tao);
    const phantom = makeUniqueCard(CardType.Sha);

    giveCards(from, to, [phantom]);

    expect(from.hand.length).toBe(1);
    expect(to.hand.length).toBe(0);
  });
});

// ============================================================
// discardCards — 弃置原语（手牌 → 弃牌堆）
// ============================================================

describe('discardCards', () => {
  it('把一组牌从手牌移入弃牌堆', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha, CardType.Tao);
    const card = player.hand[0];

    discardCards(g, player, [card]);

    expect(player.hand.map((c) => c.type)).toEqual([CardType.Tao]);
    expect(g.state.discardPile).toContain(card);
  });

  it('返回实际移除的牌，不在手牌的牌自动跳过', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha, CardType.Tao);
    const card = player.hand[0];
    const phantom = makeUniqueCard(CardType.Shan);

    const removed = discardCards(g, player, [card, phantom]);

    expect(removed).toEqual([card]);
    expect(player.hand.length).toBe(1);
    expect(g.state.discardPile).not.toContain(phantom);
  });

  it('空数组 → 无操作', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha);

    expect(discardCards(g, player, [])).toEqual([]);
    expect(player.hand.length).toBe(1);
    expect(g.state.discardPile.length).toBe(0);
  });
});

// ============================================================
// moveCards — 底层移动原语（纯数组级）
// ============================================================

describe('moveCards', () => {
  it('把 cards 中实际位于 from 的牌移到 to，返回实际移走的牌', () => {
    const g = freshGame();
    const from = g.state.players[0];
    const to: Card[] = [];
    giveHand(from, CardType.Sha, CardType.Tao);
    const card = from.hand[0];

    const moved = moveCards(from.hand, to, [card]);

    expect(moved).toEqual([card]);
    expect(from.hand.length).toBe(1);
    expect(to).toEqual([card]);
  });

  it('不在 from 中的牌自动跳过', () => {
    const from: Card[] = [makeUniqueCard(CardType.Sha)];
    const to: Card[] = [];
    const phantom = makeUniqueCard(CardType.Tao);

    const moved = moveCards(from, to, [phantom]);

    expect(moved).toEqual([]);
    expect(from.length).toBe(1);
    expect(to.length).toBe(0);
  });

  it('多张牌保持原顺序', () => {
    const a = makeUniqueCard(CardType.Sha);
    const b = makeUniqueCard(CardType.Tao);
    const from = [a, b];
    const to: Card[] = [];

    const moved = moveCards(from, to, [a, b]);

    expect(moved).toEqual([a, b]);
    expect(to).toEqual([a, b]);
  });
});
