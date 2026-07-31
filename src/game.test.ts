// ============================================================
// 三国杀最小原型 — 单元测试
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';

// 触发卡牌注册（side-effect import）
import './cards.js';
import { STANDARD_DECK } from './cards.js';

import {
  displayNumber,
  shuffle,
  lastManStanding,
  cardRegistry,
  createDeck,
  createGame,
  setGameState,
  gs,
  damage,
  recover,
  drawCards,
  useCard,
} from './game.js';

import { CardType } from './types.js';
import type { Card, GameState, Hero, Player } from './types.js';

// ============================================================
// 测试辅助
// ============================================================

function makeCard(
  id: number, type: CardType, suit = '♠', number = 1,
): Card {
  const def = cardRegistry.get(type);
  return { id, type, name: def?.name ?? type, suit, number };
}

const testHeroes: Hero[] = [
  { name: '刘备', maxHp: 4 },
  { name: '曹操', maxHp: 4 },
  { name: '孙权', maxHp: 4 },
];

let nextId = 1000;
function freshGame(state?: Partial<GameState>): GameState {
  const game = createGame(STANDARD_DECK, testHeroes);
  // 清空手牌以便精确控制测试
  for (const p of game.players) p.hand = [];
  const final = { ...game, ...state };
  setGameState(final);
  return final;
}

function giveHand(player: Player, ...types: CardType[]): void {
  player.hand = types.map((t, i) => makeCard(nextId++, t));
}

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
  it('不改变数组长度', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(shuffle(input).length).toBe(input.length);
  });

  it('包含所有原元素', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = shuffle(input);
    expect([...result].sort((a, b) => a - b)).toEqual(input);
  });

  it('不修改原数组', () => {
    const input = [1, 2, 3, 4, 5];
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
  });

  it('每张注册牌都有 targetFilter', () => {
    for (const def of cardRegistry.all()) {
      expect(def.targetFilter).toBeTypeOf('function');
    }
  });
});

// ============================================================
// 牌堆生成
// ============================================================

describe('createDeck', () => {
  it('标准牌堆 104 张', () => {
    const deck = createDeck(STANDARD_DECK);
    expect(deck.length).toBe(104);
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

  it('杀数量 = (10+11)×2副本 = 42', () => {
    const deck = createDeck(STANDARD_DECK);
    const shaCount = deck.filter((c) => c.type === CardType.Sha).length;
    expect(shaCount).toBe(42);
  });

  it('南蛮入侵数量 = (2+1)×2副本 = 6', () => {
    const deck = createDeck(STANDARD_DECK);
    const nmCount = deck.filter((c) => c.type === CardType.NanMan).length;
    expect(nmCount).toBe(6);
  });
});

// ============================================================
// 游戏初始化
// ============================================================

describe('createGame', () => {
  it('创建指定数量的玩家', () => {
    const game = createGame(STANDARD_DECK, testHeroes);
    expect(game.players.length).toBe(3);
    expect(game.players[0].name).toBe('刘备');
    expect(game.players[1].name).toBe('曹操');
    expect(game.players[2].name).toBe('孙权');
  });

  it('每个玩家初始 4 张手牌', () => {
    const game = createGame(STANDARD_DECK, testHeroes);
    for (const p of game.players) {
      expect(p.hand.length).toBe(4);
    }
  });

  it('初始状态正确', () => {
    const game = createGame(STANDARD_DECK, testHeroes);
    expect(game.round).toBe(1);
    expect(game.currentIndex).toBe(0);
    expect(game.gameOver).toBe(false);
    expect(game.winner).toBeNull();
    // 104 - 3人×4 = 92
    expect(game.deck.length).toBe(92);
    expect(game.discardPile.length).toBe(0);
  });
});

// ============================================================
// 胜利条件
// ============================================================

describe('lastManStanding', () => {
  it('只有 1 人存活 → 返回该玩家', () => {
    const game = freshGame();
    game.players[0].alive = true;
    game.players[1].alive = false;
    game.players[2].alive = false;
    const winner = lastManStanding(game);
    expect(winner).toBe(game.players[0]);
  });

  it('多人存活 → 返回 null', () => {
    const game = freshGame();
    game.players[0].alive = true;
    game.players[1].alive = true;
    game.players[2].alive = false;
    expect(lastManStanding(game)).toBeNull();
  });

  it('全员存活 → 返回 null', () => {
    const game = freshGame();
    expect(lastManStanding(game)).toBeNull();
  });
});

// ============================================================
// Action 工厂 — 独立测试
// ============================================================

describe('damage', () => {
  it('造成 1 点伤害', async () => {
    const game = freshGame();
    const target = game.players[0];
    const before = target.hp;
    await damage({ target, source: game.players[1], amount: 1 });
    expect(target.hp).toBe(before - 1);
  });

  it('造成致死伤害 → player.alive = false', async () => {
    const game = freshGame();
    const target = game.players[0];
    target.hp = 1;
    await damage({ target, source: game.players[1], amount: 2 });
    expect(target.hp).toBeLessThanOrEqual(0);
    expect(target.alive).toBe(false);
  });
});

describe('recover', () => {
  it('恢复 1 点体力', async () => {
    const game = freshGame();
    const target = game.players[0];
    target.hp = 2;
    await recover({ target, amount: 1 });
    expect(target.hp).toBe(3);
  });

  it('不超过最大体力', async () => {
    const game = freshGame();
    const target = game.players[0];
    target.hp = target.maxHp;
    await recover({ target, amount: 1 });
    expect(target.hp).toBe(target.maxHp);
  });
});

describe('drawCards', () => {
  it('摸 2 张牌', async () => {
    const game = freshGame();
    const target = game.players[0];
    const before = target.hand.length;
    await drawCards({ target, count: 2 });
    expect(target.hand.length).toBe(before + 2);
  });

  it('牌堆空时自动洗入弃牌堆', async () => {
    const game = freshGame();
    // 把牌堆移到弃牌堆
    game.discardPile.push(...game.deck.splice(0));
    const target = game.players[0];
    await drawCards({ target, count: 1 });
    expect(target.hand.length).toBe(1);
    // 弃牌堆被洗回牌堆，牌堆数 = 原弃牌堆 - 1
    expect(game.deck.length).toBeGreaterThan(0);
  });
});

// ============================================================
// useCard 集成测试
// ============================================================

describe('useCard — 杀', () => {
  it('敌人无闪 → 受到 1 点伤害', async () => {
    const game = freshGame();
    const attacker = game.players[0];
    const defender = game.players[1];

    giveHand(attacker, CardType.Sha);
    giveHand(defender);  // 空手牌

    const card = attacker.hand[0];
    const hpBefore = defender.hp;
    await useCard({ player: attacker, card, targets: [defender] });

    // 手牌已移除
    expect(attacker.hand.find((c) => c.id === card.id)).toBeUndefined();
    // 敌人受伤
    expect(defender.hp).toBe(hpBefore - 1);
    // 牌进入弃牌堆
    expect(game.discardPile.find((c) => c.id === card.id)).toBeDefined();
  });

  it('敌人有闪 → 弃置闪，不受伤', async () => {
    const game = freshGame();
    const attacker = game.players[0];
    const defender = game.players[1];

    giveHand(attacker, CardType.Sha);
    giveHand(defender, CardType.Shan);

    const shaCard = attacker.hand[0];
    const shanCard = defender.hand[0];
    const hpBefore = defender.hp;

    await useCard({ player: attacker, card: shaCard, targets: [defender] });

    // 闪被弃置
    expect(defender.hand.find((c) => c.id === shanCard.id)).toBeUndefined();
    // 不受伤
    expect(defender.hp).toBe(hpBefore);
  });
});

describe('useCard — 桃', () => {
  it('恢复 1 点体力', async () => {
    const game = freshGame();
    const player = game.players[0];
    player.hp = 2;
    giveHand(player, CardType.Tao);

    const card = player.hand[0];
    await useCard({ player, card, targets: [player] });

    expect(player.hp).toBe(3);
    expect(player.hand.length).toBe(0);
  });
});

describe('useCard — 无中生有', () => {
  it('摸 2 张牌', async () => {
    const game = freshGame();
    const player = game.players[0];
    giveHand(player, CardType.WuZhong);

    const card = player.hand[0];
    const before = player.hand.length;
    await useCard({ player, card, targets: [player] });

    // 用了 1 张，摸了 2 张 → net +1
    expect(player.hand.length).toBe(before + 1);
  });
});

describe('useCard — 决斗', () => {
  it('双方轮流出杀，无杀者受伤', async () => {
    const game = freshGame();
    const attacker = game.players[0];
    const defender = game.players[1];

    giveHand(attacker, CardType.JueDou, CardType.Sha);
    giveHand(defender); // 空手牌 → 无法出杀

    const card = attacker.hand[0];
    const hpBefore = defender.hp;
    await useCard({ player: attacker, card, targets: [defender] });

    // 防御方空手 → 立即受伤
    expect(defender.hp).toBe(hpBefore - 1);
  });

  it('双方都有杀 → 杀多者获胜', async () => {
    const game = freshGame();
    const attacker = game.players[0];
    const defender = game.players[1];

    giveHand(attacker, CardType.JueDou, CardType.Sha, CardType.Sha);
    giveHand(defender, CardType.Sha); // 只有一张杀

    const card = attacker.hand[0];
    const hpBefore = defender.hp;
    await useCard({ player: attacker, card, targets: [defender] });

    // 防御方只有 1 张杀 → 攻击方 2 张杀 → 防御方受伤
    expect(defender.hp).toBe(hpBefore - 1);
    // 防御方手牌已空（杀被打出）
    expect(defender.hand.length).toBe(0);
  });
});

describe('useCard — 南蛮入侵', () => {
  it('所有敌人必须出杀', async () => {
    const game = freshGame();
    const attacker = game.players[0];
    const p2 = game.players[1];
    const p3 = game.players[2];

    giveHand(attacker, CardType.NanMan);
    giveHand(p2, CardType.Sha);      // p2 有杀可出
    giveHand(p3);                     // p3 空手

    const card = attacker.hand[0];
    const hp2Before = p2.hp;
    const hp3Before = p3.hp;

    await useCard({ player: attacker, card, targets: [p2, p3] });

    // p2 出了杀 → 不受伤
    expect(p2.hp).toBe(hp2Before);
    expect(p2.hand.length).toBe(0); // 杀被弃置

    // p3 没杀 → 受伤
    expect(p3.hp).toBe(hp3Before - 1);
  });
});
