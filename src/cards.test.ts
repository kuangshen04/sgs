// ============================================================
// 三国杀最小原型 — cards.ts 单元测试
// 各牌 useCard 集成（杀/桃/无中生有/决斗/南蛮/过河拆桥/顺手牵羊）、
// 无懈可击响应、targeting 逐目标判定
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from './test-utils.js';

import { useCard } from './cardActions.js';

import { cardRegistry } from './cardRegistry.js';
import { registerSkills } from './skills.js';
import { EventType } from './events/index.js';

import { CardType } from './types.js';
import type { Card } from './types.js';

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

describe('借刀杀人', () => {
  it('目标有杀且攻击范围内有角色 → 目标对其使用杀', async () => {
    const g = freshGame(); // 刘备/曹操/孙权，3 人局任意距离 1
    const user = g.state.players[0];
    const target = g.state.players[1];
    const shaVictim = g.state.players[2];
    target.equipment.weapon = makeUniqueCard(CardType.QiLinGong);
    giveHand(user, CardType.JieDao);
    giveHand(target, CardType.Sha);
    giveHand(shaVictim); // 无闪
    const hpBefore = shaVictim.hp;

    await useCard(g, { player: user, card: user.hand[0], targets: [target] });

    expect(target.hand.length).toBe(0);         // 杀打出去了
    expect(shaVictim.hp).toBe(hpBefore - 1);    // 杀命中
    expect(target.equipment.weapon?.type).toBe(CardType.QiLinGong); // 武器保留
  });

  it('目标无杀 → 将武器交给使用者', async () => {
    const g = freshGame();
    const user = g.state.players[0];
    const target = g.state.players[1];
    const weapon = makeUniqueCard(CardType.GuanShiFu);
    target.equipment.weapon = weapon;
    giveHand(user, CardType.JieDao);

    await useCard(g, { player: user, card: user.hand[0], targets: [target] });

    expect(target.equipment.weapon).toBeUndefined();      // 武器被交出
    expect(user.hand.map((c) => c.id)).toContain(weapon.id); // 武器到使用者手上
  });

  it('规则层面：无人装备武器 → 不可使用', () => {
    const g = freshGame();
    const user = g.state.players[0];
    const def = cardRegistry.get(CardType.JieDao)!;

    expect(def.canUse(user, g.state.players, false)).toBe(false);
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
});

describe('useCard — 万箭齐发', () => {
  it('所有敌人必须出闪，否则受伤', async () => {
    const g = freshGame();
    const attacker = g.state.players[0];
    const p2 = g.state.players[1];
    const p3 = g.state.players[2];

    giveHand(attacker, CardType.WanJian);
    giveHand(p2, CardType.Shan); // p2 有闪可出
    giveHand(p3);                 // p3 空手

    const card = attacker.hand[0];
    const hp2Before = p2.hp;
    const hp3Before = p3.hp;

    await useCard(g, { player: attacker, card, targets: [p2, p3] });

    // p2 出了闪 → 不受伤
    expect(p2.hp).toBe(hp2Before);
    expect(p2.hand.length).toBe(0); // 闪被弃置

    // p3 没闪 → 受伤
    expect(p3.hp).toBe(hp3Before - 1);
  });
});

describe('useCard — 桃园结义', () => {
  it('所有角色回复 1 点体力（含自己，不超过上限）', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const p2 = g.state.players[1];
    const p3 = g.state.players[2];
    player.hp = 3;
    p2.hp = 1;
    p3.hp = p3.maxHp; // 满血 → 封顶不变
    giveHand(player, CardType.TaoYuan);

    const card = player.hand[0];
    await useCard(g, { player, card, targets: [player, p2, p3] });

    expect(player.hp).toBe(4); // 3+1
    expect(p2.hp).toBe(2);     // 1+1
    expect(p3.hp).toBe(p3.maxHp); // 满血封顶
  });
});

describe('useCard — 五谷丰登', () => {
  it('所有角色各摸 1 张牌（简化版）', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const p2 = g.state.players[1];
    const p3 = g.state.players[2];
    giveHand(player, CardType.WuGu);

    const card = player.hand[0];
    const deckBefore = g.state.deck.length;
    await useCard(g, { player, card, targets: [player, p2, p3] });

    // 自己：用了五谷（-1）又摸 1 → 手上 1 张；其余每人 +1
    expect(player.hand.length).toBe(1);
    expect(p2.hand.length).toBe(1);
    expect(p3.hand.length).toBe(1);
    expect(g.state.deck.length).toBe(deckBefore - 3); // 共摸 3 张
  });

  it('亮出存活人数张牌，按座次每人选一张', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const p2 = g.state.players[1];
    const p3 = g.state.players[2];
    const a = makeUniqueCard(CardType.Sha);
    const b = makeUniqueCard(CardType.Tao);
    const c = makeUniqueCard(CardType.Shan);
    g.state.deck = [a, b, c]; // 顶 = c
    giveHand(player, CardType.WuGu);

    await useCard(g, { player, card: player.hand[0], targets: [player, p2, p3] });

    const ids = [...player.hand, ...p2.hand, ...p3.hand].map((card) => card.id).sort();
    expect(ids).toEqual([a.id, b.id, c.id].sort());
    expect(g.state.deck).toHaveLength(0);
    expect(g.state.processing).toHaveLength(0); // 五谷与亮出的牌都清理完
  });
});

describe('useCard — 乐不思蜀（延时锦囊）', () => {
  it('使用时直接置入目标判定区，不能被无懈', async () => {
    const g = freshGame();
    registerSkills(g);
    const attacker = g.state.players[0];
    const target = g.state.players[1];
    giveHand(attacker, CardType.LeBu);
    giveHand(target, CardType.WuXie); // 目标有无懈也不应响应
    const card = attacker.hand[0];

    await useCard(g, { player: attacker, card, targets: [target] });

    expect(attacker.hand.length).toBe(0);
    expect(target.judgment.map((c) => c.id)).toContain(card.id); // 置入判定区
    expect(target.hand.map((c) => c.type)).toEqual([CardType.WuXie]); // 无懈未打出
    expect(g.state.discardPile.find((c) => c.id === card.id)).toBeUndefined(); // 不在弃牌堆
  });
});

describe('useCard — 装备', () => {
  it('装备置入对应栏位，不进弃牌堆', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.ZhugeLianNu);
    const card = player.hand[0];

    await useCard(g, { player, card, targets: [player] });

    expect(player.hand.length).toBe(0);
    expect(player.equipment.weapon).toBe(card);
    expect(g.state.discardPile.find((c) => c.id === card.id)).toBeUndefined();
  });

  it('四种装备各进各的槽位，互不冲突', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const cards = [
      makeUniqueCard(CardType.ZhugeLianNu),
      makeUniqueCard(CardType.BaGuaZhen),
      makeUniqueCard(CardType.JueYing),
      makeUniqueCard(CardType.ChiTu),
    ];
    player.hand = [...cards];

    for (const c of cards) {
      await useCard(g, { player, card: c, targets: [player] });
    }

    expect(player.equipment.weapon).toBe(cards[0]);
    expect(player.equipment.armor).toBe(cards[1]);
    expect(player.equipment.defensiveHorse).toBe(cards[2]);
    expect(player.equipment.offensiveHorse).toBe(cards[3]);
    expect(player.hand.length).toBe(0);
  });

  it('同槽顶掉：旧装备进弃牌堆', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const w1 = makeUniqueCard(CardType.ZhugeLianNu);
    const w2 = makeUniqueCard(CardType.ZhugeLianNu);
    player.hand = [w1, w2];

    await useCard(g, { player, card: w1, targets: [player] });
    await useCard(g, { player, card: w2, targets: [player] });

    expect(player.equipment.weapon).toBe(w2);
    expect(player.hand.length).toBe(0);
    expect(g.state.discardPile.find((c) => c.id === w1.id)).toBeDefined(); // w1 被顶掉
  });
});

describe('useCard — 过河拆桥', () => {
  it('弃置目标一张手牌', async () => {
    const g = freshGame();
    const attacker = g.state.players[0];
    const target = g.state.players[1];
    giveHand(attacker, CardType.GuoHe);
    giveHand(target, CardType.Sha); // 只有一张 → 必被弃置

    const card = attacker.hand[0];
    await useCard(g, { player: attacker, card, targets: [target] });

    expect(target.hand.length).toBe(0);
    expect(g.state.discardPile.some((c) => c.type === CardType.Sha)).toBe(true);
    // 过河拆桥本身也进入弃牌堆
    expect(g.state.discardPile.some((c) => c.id === card.id)).toBe(true);
  });

  it('弃置目标装备区的一张牌', async () => {
    const g = freshGame();
    const attacker = g.state.players[0];
    const target = g.state.players[1];
    giveHand(attacker, CardType.GuoHe);
    target.equipment.weapon = makeUniqueCard(CardType.ZhugeLianNu);

    const card = attacker.hand[0];
    await useCard(g, { player: attacker, card, targets: [target] });

    expect(target.equipment.weapon).toBeUndefined();
    expect(g.state.discardPile.some((c) => c.type === CardType.ZhugeLianNu)).toBe(true);
  });
});

describe('useCard — 顺手牵羊', () => {
  it('获得目标一张手牌', async () => {
    const g = freshGame();
    const attacker = g.state.players[0];
    const target = g.state.players[1];
    giveHand(attacker, CardType.ShunShou);
    giveHand(target, CardType.Tao); // 只有一张 → 必被牵走

    const card = attacker.hand[0];
    await useCard(g, { player: attacker, card, targets: [target] });

    expect(target.hand.length).toBe(0);
    expect(attacker.hand.some((c) => c.type === CardType.Tao)).toBe(true);
    // 顺手牵羊本身进入弃牌堆
    expect(g.state.discardPile.some((c) => c.id === card.id)).toBe(true);
  });

  it('获得目标装备区的一张牌', async () => {
    const g = freshGame();
    const attacker = g.state.players[0];
    const target = g.state.players[1];
    giveHand(attacker, CardType.ShunShou);
    target.equipment.armor = makeUniqueCard(CardType.BaGuaZhen);

    const card = attacker.hand[0];
    await useCard(g, { player: attacker, card, targets: [target] });

    expect(target.equipment.armor).toBeUndefined();
    expect(attacker.hand.some((c) => c.type === CardType.BaGuaZhen)).toBe(true);
  });

  it('可以被无懈可击抵消', async () => {
    const g = freshGame();
    registerSkills(g);
    const attacker = g.state.players[0];
    const p2 = g.state.players[1];
    giveHand(attacker, CardType.ShunShou);
    giveHand(p2, CardType.WuXie, CardType.Tao);

    const card = attacker.hand[0];
    await useCard(g, { player: attacker, card, targets: [p2] });

    // p2 用无懈保护自己 → 桃未被牵走
    expect(p2.hand.length).toBe(1);
    expect(p2.hand[0].type).toBe(CardType.Tao);
    expect(attacker.hand.length).toBe(0); // 顺手牵羊已消耗
    expect(g.state.discardPile.some((c) => c.type === CardType.WuXie)).toBe(true);
  });
});

// ============================================================
// 无懈可击
// ============================================================

describe('无懈可击', () => {
  it('抵消南蛮入侵对单个目标的效果', async () => {
    const g = freshGame();
    registerSkills(g);
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
    const g = freshGame({}, ['刘备', '孙权', '曹操']); // 防御方用孙权，避免奸雄拿牌干扰手牌断言
    registerSkills(g);
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
    registerSkills(g);
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
    registerSkills(g);
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
    g.triggerSystem.on(`${EventType.Targeting}.before`, counterHandler);

    const hpBefore = p1.hp;
    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [p1] });

    // 无懈₁ 被无懈₂ 反制 → 南蛮 targeting 未被 prevent → p1 受伤
    expect(p1.hp).toBe(hpBefore - 1);

    // 只移除自定义 handler，不影响默认无懈 handler
    g.triggerSystem.off(`${EventType.Targeting}.before`, counterHandler);
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
    g.triggerSystem.on(`${EventType.Targeting}.before`, (e) => {
      targets.push(e.data.target.name);
    });

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [p2, p3] });

    expect(targets).toEqual(['曹操', '孙权']);
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
    g.triggerSystem.on(`${EventType.Targeting}.before`, (e) => {
      if (e.data.target === p2) e.prevent();
    });

    const hp2Before = p2.hp;
    const hp3Before = p3.hp;
    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [p2, p3] });

    expect(p2.hp).toBe(hp2Before);    // p2 被抵消，不受伤
    expect(p3.hp).toBe(hp3Before - 1); // p3 未被抵消，受伤
  });

  it('全部 target 被 prevent → content 不执行，所有目标不受伤', async () => {
    const g = freshGame();
    const attacker = g.state.players[0];
    const p2 = g.state.players[1];
    const p3 = g.state.players[2];
    giveHand(attacker, CardType.NanMan);
    giveHand(p2);
    giveHand(p3);

    g.triggerSystem.on(`${EventType.Targeting}.before`, (e) => e.prevent());

    const hp2Before = p2.hp;
    const hp3Before = p3.hp;
    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [p2, p3] });

    expect(p2.hp).toBe(hp2Before);   // 被抵消
    expect(p3.hp).toBe(hp3Before);   // 被抵消
  });

  it('无目标牌触发单次 targeting(target = user)', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Shan);

    const triggered: string[] = [];
    g.triggerSystem.on(`${EventType.Targeting}.before`, (e) => {
      triggered.push(e.data.target.name);
    });

    await useCard(g, { player, card: player.hand[0], targets: [] });

    expect(triggered).toEqual([player.name]);
  });

  it('无目标牌的 targeting 被 prevent → content 不执行', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.WuZhong); // 本来会摸 2 张

    g.triggerSystem.on(`${EventType.Targeting}.before`, (e) => e.prevent());

    const before = player.hand.length;
    await useCard(g, { player, card: player.hand[0], targets: [] });

    expect(player.hand.length).toBe(before - 1); // 牌已消耗
    expect(g.state.discardPile.length).toBe(1);   // 牌在弃牌堆
  });

  it('牌被全部抵消时仍进入弃牌堆', async () => {
    const g = freshGame();
    const attacker = g.state.players[0];
    giveHand(attacker, CardType.NanMan);

    g.triggerSystem.on(`${EventType.Targeting}.before`, (e) => e.prevent());

    const card = attacker.hand[0];
    await useCard(g, { player: attacker, card, targets: [g.state.players[1], g.state.players[2]] });

    // 手牌已移除
    expect(attacker.hand.length).toBe(0);
    // 牌在弃牌堆
    expect(g.state.discardPile.find((c) => c.id === card.id)).toBeDefined();
  });
});

describe('决斗/南蛮 响应窗口转化', () => {
  it('关羽通过武圣·当杀 响应决斗', async () => {
    const g = freshGame({}, ['关羽', '刘备', '孙权']);
    registerSkills(g);
    const guanyu = g.state.players[0];
    const attacker = g.state.players[1]; // 刘备
    const red = { id: 9101, type: CardType.Shan, name: '闪', suit: '♥', number: 3 };
    guanyu.hand = [red];
    giveHand(attacker, CardType.JueDou);
    const hpBefore = attacker.hp;

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [guanyu] });

    expect(guanyu.hand.length).toBe(0); // 红色源牌被武圣消耗
    expect(attacker.hp).toBe(hpBefore - 1); // 我方无杀 → 受伤
    expect(g.state.discardPile).toContain(red);
  });

  it('赵云通过龙胆·当杀 响应南蛮，免伤', async () => {
    const g = freshGame({}, ['赵云', '刘备']);
    registerSkills(g);
    const zhaoyun = g.state.players[0];
    const user = g.state.players[1]; // 刘备
    const shan = { id: 9102, type: CardType.Shan, name: '闪', suit: '♦', number: 5 };
    zhaoyun.hand = [shan];
    giveHand(user, CardType.NanMan);
    const hpBefore = zhaoyun.hp;

    await useCard(g, { player: user, card: user.hand[0], targets: [zhaoyun] });

    expect(zhaoyun.hp).toBe(hpBefore); // 免伤
    expect(zhaoyun.hand.length).toBe(0); // 闪被龙胆消耗
    expect(g.state.discardPile).toContain(shan);
  });
});
