// ============================================================
// 三国杀最小原型 — 单元测试
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';

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
  damage,
  recover,
  drawCards,
  useCard,
  dying,
  playFromHand,
} from './game.js';
import type { Game } from './game.js';

import {
  computeCardOptions,
  computeTargetOptions,
  choose,
  findResponse,
} from './choose.js';
import type { CardDecider, Deciders } from './choose.js';

import { playPhase } from './gameFlow.js';

import { registerSkills, skillRegistry } from './skills.js';
import { triggerSystem } from './events/index.js';
import { EventType } from './events/index.js';

import { CardTag, CardType } from './types.js';
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
function freshGame(state?: Partial<GameState>, heroes: Hero[] = testHeroes): Game {
  const g = createGame(STANDARD_DECK, heroes);
  // 清空手牌以便精确控制测试
  for (const p of g.state.players) p.hand = [];
  if (state) g.state = { ...g.state, ...state };
  return g;
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
    for (const t of [CardType.WuZhong, CardType.JueDou, CardType.NanMan]) {
      expect(cardRegistry.get(t)!.tags).toContain(CardTag.Trick);
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
});

// ============================================================
// 游戏初始化
// ============================================================

describe('createGame', () => {
  it('创建指定数量的玩家', () => {
    const g = createGame(STANDARD_DECK, testHeroes);
    expect(g.state.players.length).toBe(3);
    expect(g.state.players[0].name).toBe('刘备');
    expect(g.state.players[1].name).toBe('曹操');
    expect(g.state.players[2].name).toBe('孙权');
  });

  it('每个玩家初始 4 张手牌', () => {
    const g = createGame(STANDARD_DECK, testHeroes);
    for (const p of g.state.players) {
      expect(p.hand.length).toBe(4);
    }
  });

  it('初始状态正确', () => {
    const g = createGame(STANDARD_DECK, testHeroes);
    expect(g.state.round).toBe(1);
    expect(g.state.currentIndex).toBe(0);
    expect(g.state.gameOver).toBe(false);
    expect(g.state.winner).toBeNull();
    // 104 - 3人×4 = 92
    expect(g.state.deck.length).toBe(92);
    expect(g.state.discardPile.length).toBe(0);
  });

  it('局内牌 id 唯一', () => {
    const g = createGame(STANDARD_DECK, testHeroes);
    const ids = new Set(g.state.deck.map((c) => c.id));
    expect(ids.size).toBe(g.state.deck.length);
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

// ============================================================
// recover
// ============================================================

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
// useCard 集成测试
// ============================================================

describe('useCard — 杀', () => {
  it('敌人无闪 → 受到 1 点伤害', async () => {
    const g = freshGame();
    const attacker = g.state.players[0];
    const defender = g.state.players[1];

    giveHand(attacker, CardType.Sha);
    giveHand(defender);  // 空手牌

    const card = attacker.hand[0];
    const hpBefore = defender.hp;
    await useCard(g, { player: attacker, card, targets: [defender] });

    // 手牌已移除
    expect(attacker.hand.find((c) => c.id === card.id)).toBeUndefined();
    // 敌人受伤
    expect(defender.hp).toBe(hpBefore - 1);
    // 牌进入弃牌堆
    expect(g.state.discardPile.find((c) => c.id === card.id)).toBeDefined();
  });

  it('敌人有闪 → 弃置闪，不受伤', async () => {
    const g = freshGame();
    const attacker = g.state.players[0];
    const defender = g.state.players[1];

    giveHand(attacker, CardType.Sha);
    giveHand(defender, CardType.Shan);

    const shaCard = attacker.hand[0];
    const shanCard = defender.hand[0];
    const hpBefore = defender.hp;

    await useCard(g, { player: attacker, card: shaCard, targets: [defender] });

    // 闪被弃置
    expect(defender.hand.find((c) => c.id === shanCard.id)).toBeUndefined();
    // 不受伤
    expect(defender.hp).toBe(hpBefore);
  });
});

describe('useCard — 桃', () => {
  it('恢复 1 点体力', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    player.hp = 2;
    giveHand(player, CardType.Tao);

    const card = player.hand[0];
    await useCard(g, { player, card, targets: [player] });

    expect(player.hp).toBe(3);
    expect(player.hand.length).toBe(0);
  });
});

describe('useCard — 无中生有', () => {
  it('摸 2 张牌', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.WuZhong);

    const card = player.hand[0];
    const before = player.hand.length;
    await useCard(g, { player, card, targets: [player] });

    // 用了 1 张，摸了 2 张 → net +1
    expect(player.hand.length).toBe(before + 1);
  });
});

describe('useCard — 决斗', () => {
  it('双方轮流出杀，无杀者受伤', async () => {
    const g = freshGame();
    const attacker = g.state.players[0];
    const defender = g.state.players[1];

    giveHand(attacker, CardType.JueDou, CardType.Sha);
    giveHand(defender); // 空手牌 → 无法出杀

    const card = attacker.hand[0];
    const hpBefore = defender.hp;
    await useCard(g, { player: attacker, card, targets: [defender] });

    // 防御方空手 → 立即受伤
    expect(defender.hp).toBe(hpBefore - 1);
  });

  it('双方都有杀 → 杀多者获胜', async () => {
    const g = freshGame();
    const attacker = g.state.players[0];
    const defender = g.state.players[1];

    giveHand(attacker, CardType.JueDou, CardType.Sha, CardType.Sha);
    giveHand(defender, CardType.Sha); // 只有一张杀

    const card = attacker.hand[0];
    const hpBefore = defender.hp;
    await useCard(g, { player: attacker, card, targets: [defender] });

    // 防御方只有 1 张杀 → 攻击方 2 张杀 → 防御方受伤
    expect(defender.hp).toBe(hpBefore - 1);
    // 防御方手牌已空（杀被打出）
    expect(defender.hand.length).toBe(0);
  });
});

describe('useCard — 南蛮入侵', () => {
  it('所有敌人必须出杀', async () => {
    const g = freshGame();
    const attacker = g.state.players[0];
    const p2 = g.state.players[1];
    const p3 = g.state.players[2];

    giveHand(attacker, CardType.NanMan);
    giveHand(p2, CardType.Sha);      // p2 有杀可出
    giveHand(p3);                     // p3 空手

    const card = attacker.hand[0];
    const hp2Before = p2.hp;
    const hp3Before = p3.hp;

    await useCard(g, { player: attacker, card, targets: [p2, p3] });

    // p2 出了杀 → 不受伤
    expect(p2.hp).toBe(hp2Before);
    expect(p2.hand.length).toBe(0); // 杀被弃置

    // p3 没杀 → 受伤
    expect(p3.hp).toBe(hp3Before - 1);
  });

  it('无懈可击数量 = 8', () => {
    const deck = createDeck(STANDARD_DECK);
    const wxCount = deck.filter((c) => c.type === CardType.WuXie).length;
    expect(wxCount).toBe(8);
  });
});

// ============================================================
// 无懈可击
// ============================================================

describe('无懈可击', () => {
  it('抵消南蛮入侵对单个目标的效果', async () => {
    const g = freshGame();
    const attacker = g.state.players[0];
    const p2 = g.state.players[1];
    const p3 = g.state.players[2];

    giveHand(attacker, CardType.NanMan);
    giveHand(p2, CardType.WuXie);  // p2 有无懈
    giveHand(p3);                   // 空手 — 若无懈成功则不受伤

    // 南蛮 targets [p2, p3]
    // p2 的 AI 会出无懈保护自己 → p2 的 targeting 被 prevent → p2 跳过
    // p3 没有无懈 → p3 必须出杀或受伤
    const hp2Before = p2.hp;
    const hp3Before = p3.hp;

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [p2, p3] });

    expect(p2.hp).toBe(hp2Before);     // 被无懈保护
    expect(p3.hp).toBe(hp3Before - 1); // 无杀受伤
    expect(g.state.discardPile.some((c) => c.id === attacker.hand[0]?.id)).toBe(false);
    // 南蛮已进弃牌堆（手牌被移除），无懈也已进弃牌堆
    expect(p2.hand.length).toBe(0);     // 无懈已打出
  });

  it('不抵消基本牌', async () => {
    const g = freshGame();
    const attacker = g.state.players[0];
    const defender = g.state.players[1];

    giveHand(attacker, CardType.Sha);
    giveHand(defender, CardType.WuXie); // 无懈在手，但杀是基本牌

    const hpBefore = defender.hp;
    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [defender] });

    // 无懈不触发，杀正常结算
    expect(defender.hp).toBe(hpBefore - 1);
    expect(defender.hand.length).toBe(1); // 无懈未打出
  });

  it('不抵消自己对自己的牌', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    player.hp = 2;
    giveHand(player, CardType.Tao, CardType.WuXie);

    // 自己吃桃 → 自己有无懈但不应该抵消
    await useCard(g, { player, card: player.hand[0], targets: [player] });

    expect(player.hp).toBe(3);          // 桃生效
    expect(player.hand.length).toBe(1); // 无懈未打出
  });

  it('无懈可击可以被反无懈（手动模拟反无懈）', async () => {
    const g = freshGame();
    const attacker = g.state.players[0];
    const p1 = g.state.players[1];
    const p2 = g.state.players[2];

    giveHand(attacker, CardType.NanMan);
    giveHand(p1, CardType.WuXie); // 无懈₁ — 保护自己
    giveHand(p2, CardType.WuXie); // 无懈₂ — 反无懈

    // 手动注册 handler：当 无懈 的 targeting 触发时，p2 出无懈反制
    const counterHandler = async (e: any) => {
      if (e.data.card.type === CardType.WuXie && p2.hand.some((c: Card) => c.type === CardType.WuXie)) {
        const wx = p2.hand.find((c: Card) => c.type === CardType.WuXie)!;
        await useCard(g, { player: p2, card: wx, targets: [] });
      }
    };
    triggerSystem.on(`${EventType.Targeting}.before`, counterHandler);

    const hpBefore = p1.hp;
    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [p1] });

    // 无懈₁ 被无懈₂ 反制 → 南蛮 targeting 未被 prevent → p1 受伤
    expect(p1.hp).toBe(hpBefore - 1);

    // 只移除自定义 handler，不影响默认无懈 handler
    triggerSystem.off(`${EventType.Targeting}.before`, counterHandler);
  });
});

// ============================================================
// targeting — 逐目标判定（无懈可击的挂载点）
// ============================================================

describe('targeting', () => {
  it('每个 target 触发一次 targeting 事件', async () => {
    const g = freshGame();
    const attacker = g.state.players[0];
    const p2 = g.state.players[1];
    const p3 = g.state.players[2];
    giveHand(attacker, CardType.NanMan);
    giveHand(p2, CardType.Sha);
    giveHand(p3, CardType.Sha);

    const targets: string[] = [];
    triggerSystem.on(`${EventType.Targeting}.before`, (e) => {
      targets.push(e.data.target.name);
    });

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [p2, p3] });

    expect(targets).toEqual(['曹操', '孙权']);
    triggerSystem.clear();
  });

  it('prevent targeting → 该 target 被跳过', async () => {
    const g = freshGame();
    const attacker = g.state.players[0];
    const p2 = g.state.players[1];
    const p3 = g.state.players[2];
    giveHand(attacker, CardType.NanMan);
    giveHand(p2); // 空手 — 本应受伤
    giveHand(p3); // 空手 — 本应受伤

    // 抵消 p2 的目标指定
    triggerSystem.on(`${EventType.Targeting}.before`, (e) => {
      if (e.data.target === p2) e.prevent();
    });

    const hp2Before = p2.hp;
    const hp3Before = p3.hp;
    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [p2, p3] });

    expect(p2.hp).toBe(hp2Before);    // p2 被抵消，不受伤
    expect(p3.hp).toBe(hp3Before - 1); // p3 未被抵消，受伤
    triggerSystem.clear();
  });

  it('全部 target 被 prevent → content 不执行，所有目标不受伤', async () => {
    const g = freshGame();
    const attacker = g.state.players[0];
    const p2 = g.state.players[1];
    const p3 = g.state.players[2];
    giveHand(attacker, CardType.NanMan);
    giveHand(p2);
    giveHand(p3);

    triggerSystem.on(`${EventType.Targeting}.before`, (e) => e.prevent());

    const hp2Before = p2.hp;
    const hp3Before = p3.hp;
    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [p2, p3] });

    expect(p2.hp).toBe(hp2Before);   // 被抵消
    expect(p3.hp).toBe(hp3Before);   // 被抵消
    triggerSystem.clear();
  });

  it('无目标牌触发单次 targeting(target = user)', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Shan);

    const triggered: string[] = [];
    triggerSystem.on(`${EventType.Targeting}.before`, (e) => {
      triggered.push(e.data.target.name);
    });

    await useCard(g, { player, card: player.hand[0], targets: [] });

    expect(triggered).toEqual([player.name]);
    triggerSystem.clear();
  });

  it('无目标牌的 targeting 被 prevent → content 不执行', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.WuZhong); // 本来会摸 2 张

    triggerSystem.on(`${EventType.Targeting}.before`, (e) => e.prevent());

    const before = player.hand.length;
    await useCard(g, { player, card: player.hand[0], targets: [] });

    expect(player.hand.length).toBe(before - 1); // 牌已消耗
    expect(g.state.discardPile.length).toBe(1);   // 牌在弃牌堆
    triggerSystem.clear();
  });

  it('牌被全部抵消时仍进入弃牌堆', async () => {
    const g = freshGame();
    const attacker = g.state.players[0];
    giveHand(attacker, CardType.NanMan);

    triggerSystem.on(`${EventType.Targeting}.before`, (e) => e.prevent());

    const card = attacker.hand[0];
    await useCard(g, { player: attacker, card, targets: [g.state.players[1], g.state.players[2]] });

    // 手牌已移除
    expect(attacker.hand.length).toBe(0);
    // 牌在弃牌堆
    expect(g.state.discardPile.find((c) => c.id === card.id)).toBeDefined();
    triggerSystem.clear();
  });
});

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

  it('多张牌按 usePriority 降序排列', () => {
    const g = freshGame();
    const player = g.state.players[0];
    player.hp = 2;
    giveHand(player, CardType.Sha, CardType.JueDou, CardType.Tao);

    const options = computeCardOptions(g, player, false);
    expect(options[0].card.type).toBe(CardType.Tao);  // 桃 90 排第一
    expect(options[0].def.ai.usePriority).toBeGreaterThanOrEqual(
      options[options.length - 1].def.ai.usePriority,
    );
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
// findResponse / playFromHand — 响应牌原语
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
    const phantom = makeCard(nextId++, CardType.Sha);

    playFromHand(g, player, phantom);

    expect(g.state.discardPile).not.toContain(phantom);
  });
});

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

    await playPhase(g, { player, round: 1 });

    // 默认 AI 出杀
    expect(player.hand.length).toBe(0);
    expect(target.hp).toBe(hpBefore - 1);
  });

  it('无可用牌 → 不出牌', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Shan); // 闪不可主动使用

    await playPhase(g, { player, round: 1 });

    expect(player.hand.length).toBe(1);
  });

  it('多张可用牌 → 按优先级循环打出', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const target = g.state.players[1];
    giveHand(player, CardType.JueDou, CardType.Sha);
    const hpBefore = target.hp;

    await playPhase(g, { player, round: 1 });

    // 默认 AI：决斗(70) → 杀(60)，两轮循环
    expect(target.hp).toBe(hpBefore - 2);
    expect(player.hand.length).toBe(0);
  });
});

// ============================================================
// 技能 — 遗计（郭嘉：受到伤害后每 1 点伤害摸 2 张牌）
// ============================================================

describe('遗计（郭嘉技能）', () => {
  const guojiaHeroes: Hero[] = [
    { name: '刘备', maxHp: 4 },
    { name: '郭嘉', maxHp: 3, skills: ['遗计'] },
    { name: '孙权', maxHp: 4 },
  ];

  afterEach(() => triggerSystem.clear());

  it('skillRegistry 已注册遗计', () => {
    expect(skillRegistry.get('遗计')).toBeDefined();
  });

  it('郭嘉受到 1 点伤害 → 摸 2 张牌', async () => {
    registerSkills();
    const g = freshGame({}, guojiaHeroes);
    const guojia = g.state.players[1];
    const before = guojia.hand.length;

    await damage(g, { target: guojia, source: g.state.players[0], amount: 1 });

    expect(guojia.hand.length).toBe(before + 2);
  });

  it('郭嘉受到 2 点伤害 → 摸 4 张牌', async () => {
    registerSkills();
    const g = freshGame({}, guojiaHeroes);
    const guojia = g.state.players[1];
    const before = guojia.hand.length;

    await damage(g, { target: guojia, source: g.state.players[0], amount: 2 });

    expect(guojia.hand.length).toBe(before + 4);
  });

  it('非郭嘉受伤 → 不触发', async () => {
    registerSkills();
    const g = freshGame({}, guojiaHeroes);
    const liubei = g.state.players[0];
    const before = liubei.hand.length;

    await damage(g, { target: liubei, source: g.state.players[1], amount: 1 });

    expect(liubei.hand.length).toBe(before);
  });

  it('未调用 registerSkills → 不触发', async () => {
    const g = freshGame({}, guojiaHeroes);
    const guojia = g.state.players[1];
    const before = guojia.hand.length;

    await damage(g, { target: guojia, source: g.state.players[0], amount: 1 });

    expect(guojia.hand.length).toBe(before);
  });
});

// ============================================================
// 全局注入 decider（Game.deciders）
// ============================================================

describe('全局注入 decider', () => {
  /** 创建带全局 decider 的测试局（清空手牌） */
  function gameWithDeciders(deciders: Deciders): Game {
    const g = createGame(STANDARD_DECK, testHeroes, { deciders });
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

    await playPhase(g, { player, round: 1 });

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

    await playPhase(g, { player, round: 1 });

    expect(player.hand.length).toBe(1);
  });
});
