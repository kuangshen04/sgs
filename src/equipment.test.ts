// ============================================================
// 三国杀最小原型 — 装备触发效果测试（麒麟弓/寒冰剑）
// 独立文件：这些测试需要 registerSkills(g) 接线（触发器随局隔离）。
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from './test-utils.js';

import { useCard } from './cardActions.js';
import { playPhase } from './gameFlow.js';

import { registerSkills } from './skills.js';

import { cardRegistry } from './cardRegistry.js';
import { CardTag, CardType } from './types.js';
import { cardsInAreas } from './areas.js';

describe('麒麟弓（装备触发）', () => {
  it('使用杀造成伤害后弃置目标一张坐骑牌', async () => {
    const g = freshGame();
    registerSkills(g);
    const attacker = g.state.players[0];
    const target = g.state.players[1];
    attacker.equipment.weapon = makeUniqueCard(CardType.QiLinGong);
    target.equipment.offensiveHorse = makeUniqueCard(CardType.ChiTu);
    giveHand(attacker, CardType.Sha);
    const hpBefore = target.hp;

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [target] });

    expect(target.hp).toBe(hpBefore - 1);                     // 伤害照常
    expect(target.equipment.offensiveHorse).toBeUndefined();  // 坐骑被弃
    expect(g.state.discardPile.some((c) => c.type === CardType.ChiTu)).toBe(true);
  });

  it('目标无坐骑 → 不发动', async () => {
    const g = freshGame();
    registerSkills(g);
    const attacker = g.state.players[0];
    const target = g.state.players[1];
    attacker.equipment.weapon = makeUniqueCard(CardType.QiLinGong);
    giveHand(attacker, CardType.Sha);
    const hpBefore = target.hp;

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [target] });

    expect(target.hp).toBe(hpBefore - 1);
    expect(g.state.discardPile.filter((c) => c.type === CardType.ChiTu).length).toBe(0);
  });
});

describe('寒冰剑（装备触发）', () => {
  it('使用杀造成伤害时：防止伤害并弃置两张牌', async () => {
    const g = freshGame();
    registerSkills(g);
    const attacker = g.state.players[0];
    const target = g.state.players[1];
    attacker.equipment.weapon = makeUniqueCard(CardType.HanBingJian);
    giveHand(target, CardType.Sha, CardType.Tao); // 无闪
    giveHand(attacker, CardType.Sha);
    const hpBefore = target.hp;

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [target] });

    expect(target.hp).toBe(hpBefore);   // 伤害被防止
    expect(target.hand.length).toBe(0); // 两张都被弃
  });

  it('目标无手牌但有装备区牌 → 弃置装备区牌', async () => {
    const g = freshGame();
    registerSkills(g);
    const attacker = g.state.players[0];
    const target = g.state.players[1];
    attacker.equipment.weapon = makeUniqueCard(CardType.HanBingJian);
    target.equipment.armor = makeUniqueCard(CardType.BaGuaZhen);
    target.equipment.offensiveHorse = makeUniqueCard(CardType.ChiTu);
    giveHand(attacker, CardType.Sha);
    const hpBefore = target.hp;

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [target] });

    expect(target.hp).toBe(hpBefore); // 伤害被防止
    expect(target.equipment.armor).toBeUndefined();
    expect(target.equipment.offensiveHorse).toBeUndefined();
  });

  it('决斗伤害不发动（仅杀）', async () => {
    const g = freshGame();
    registerSkills(g);
    const attacker = g.state.players[0];
    const target = g.state.players[1];
    attacker.equipment.weapon = makeUniqueCard(CardType.HanBingJian);
    giveHand(attacker, CardType.JueDou);
    giveHand(target, CardType.Sha, CardType.Tao);
    const hpBefore = attacker.hp;

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [target] });

    // 决斗：目标有杀 → 打出 → 攻击方无杀 → 攻击方受伤，寒冰剑不发动
    expect(attacker.hp).toBe(hpBefore - 1);
  });
});

describe('仁王盾（装备触发）', () => {
  it('黑色杀对装备者无效（targeting 时取消目标）', async () => {
    const g = freshGame();
    registerSkills(g);
    const attacker = g.state.players[0];
    const defender = g.state.players[1];
    defender.equipment.armor = makeUniqueCard(CardType.RenWangDun);
    const sha = makeUniqueCard(CardType.Sha, '♠', 3); // 黑色杀
    attacker.hand = [sha];
    const hpBefore = defender.hp;

    await useCard(g, { player: attacker, card: sha, targets: [defender] });

    expect(defender.hp).toBe(hpBefore); // 目标被取消，未受伤
  });

  it('红色杀正常生效', async () => {
    const g = freshGame();
    registerSkills(g);
    const attacker = g.state.players[0];
    const defender = g.state.players[1];
    defender.equipment.armor = makeUniqueCard(CardType.RenWangDun);
    const sha = makeUniqueCard(CardType.Sha, '♥', 3); // 红色杀
    const hpBefore = defender.hp;

    await useCard(g, { player: attacker, card: sha, targets: [defender] });

    expect(defender.hp).toBe(hpBefore - 1);
  });
});

describe('雌雄双股剑（装备触发）', () => {
  const mixedHeroes = ['刘备', '甄宓', '孙权']; // 男/女/男

  it('使用杀指定异性目标后，目标弃置一张手牌', async () => {
    const g = freshGame({}, mixedHeroes);
    registerSkills(g);
    const attacker = g.state.players[0]; // 刘备（男）
    const target = g.state.players[1];   // 甄宓（女）
    attacker.equipment.weapon = makeUniqueCard(CardType.CiXiongShuangGuJian);
    giveHand(attacker, CardType.Sha);
    giveHand(target, CardType.Tao, CardType.Tao); // 无闪 → 杀命中，桃不会被自动使用
    const hpBefore = target.hp;

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [target] });

    expect(target.hand.length).toBe(1); // 弃了一张手牌
    expect(target.hp).toBe(hpBefore - 1); // 杀照常命中
  });

  it('异性目标无手牌 → 使用者摸一张牌', async () => {
    const g = freshGame({}, mixedHeroes);
    registerSkills(g);
    const attacker = g.state.players[0];
    const target = g.state.players[1];
    attacker.equipment.weapon = makeUniqueCard(CardType.CiXiongShuangGuJian);
    giveHand(attacker, CardType.Sha);

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [target] });

    expect(attacker.hand.length).toBe(1); // 杀出掉后摸回一张
  });

  it('指定同性目标 → 不发动', async () => {
    const g = freshGame({}, mixedHeroes);
    registerSkills(g);
    const attacker = g.state.players[0]; // 刘备（男）
    const target = g.state.players[2];   // 孙权（男）
    attacker.equipment.weapon = makeUniqueCard(CardType.CiXiongShuangGuJian);
    giveHand(attacker, CardType.Sha);
    giveHand(target, CardType.Tao);
    const hpBefore = target.hp;

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [target] });

    expect(target.hand.length).toBe(1); // 手牌未被要求弃置
    expect(target.hp).toBe(hpBefore - 1);
  });

  it('非杀（决斗）→ 不发动', async () => {
    const g = freshGame({}, mixedHeroes);
    registerSkills(g);
    const attacker = g.state.players[0];
    const target = g.state.players[1]; // 异性
    attacker.equipment.weapon = makeUniqueCard(CardType.CiXiongShuangGuJian);
    giveHand(attacker, CardType.JueDou);
    giveHand(target, CardType.Tao);
    const hpBefore = target.hp;

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [target] });

    expect(target.hand.length).toBe(1); // 决斗造成的伤害不触发剑效果
    expect(target.hp).toBe(hpBefore - 1);
  });
});

describe('马匹（白板注册）', () => {
  it.each([
    [CardType.JueYing, CardTag.DefensiveHorse],
    [CardType.DiLu, CardTag.DefensiveHorse],
    [CardType.ZhuaHuangFeiDian, CardTag.DefensiveHorse],
    [CardType.ChiTu, CardTag.OffensiveHorse],
    [CardType.DaYuan, CardTag.OffensiveHorse],
    [CardType.ZiXin, CardTag.OffensiveHorse],
  ] as const)('%s 标签为 %s', (type, tag) => {
    expect(cardRegistry.get(type)?.tags).toContain(tag);
  });
});

describe('青龙偃月刀（杀被抵消后）', () => {
  it('杀被闪抵消后，有杀则对同一目标再使用杀', async () => {
    const g = freshGame();
    registerSkills(g);
    const attacker = g.state.players[0];
    const target = g.state.players[1];
    attacker.equipment.weapon = makeUniqueCard(CardType.QingLongYanYueDao);
    giveHand(attacker, CardType.Sha, CardType.Sha); // 第一张 + 追加一张
    giveHand(target, CardType.Shan, CardType.Shan); // 两张闪
    const hpBefore = target.hp;

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [target] });

    // 第一杀被抵消 → 青龙再出第二杀 → 又被抵消
    expect(target.hp).toBe(hpBefore);
    expect(attacker.hand.length).toBe(0);
    expect(target.hand.length).toBe(0);
  });

  it('杀未被抵消（目标无闪）→ 不追加', async () => {
    const g = freshGame();
    registerSkills(g);
    const attacker = g.state.players[0];
    const target = g.state.players[1];
    attacker.equipment.weapon = makeUniqueCard(CardType.QingLongYanYueDao);
    giveHand(attacker, CardType.Sha, CardType.Sha);
    giveHand(target); // 无闪
    const hpBefore = target.hp;

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [target] });

    expect(target.hp).toBe(hpBefore - 1); // 命中，不再追加
    expect(attacker.hand.length).toBe(1); // 第二张杀未用
  });
});

describe('贯石斧（杀被抵消后弃牌命中）', () => {
  it('杀被闪抵消后，弃两张牌令其依然造成伤害', async () => {
    const g = freshGame();
    registerSkills(g);
    const attacker = g.state.players[0];
    const target = g.state.players[1];
    attacker.equipment.weapon = makeUniqueCard(CardType.GuanShiFu);
    giveHand(attacker, CardType.Sha, CardType.Tao, CardType.Shan); // 杀 + 弃牌素材
    giveHand(target, CardType.Shan); // 一张闪
    const hpBefore = target.hp;

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [target] });

    expect(target.hp).toBe(hpBefore - 1); // 依然命中
    // 弃了两张牌（随机，可能含武器本身）：区域牌从 3（2 手牌 + 武器）减到 1
    expect(cardsInAreas(attacker).length).toBe(1);
  });

  it('装备者区域牌不足两张 → 不发动', async () => {
    const g = freshGame();
    registerSkills(g);
    const attacker = g.state.players[0];
    const target = g.state.players[1];
    attacker.equipment.weapon = makeUniqueCard(CardType.GuanShiFu);
    giveHand(attacker, CardType.Sha); // 只有杀，弃牌素材不足
    giveHand(target, CardType.Shan);
    const hpBefore = target.hp;

    await useCard(g, { player: attacker, card: attacker.hand[0], targets: [target] });

    expect(target.hp).toBe(hpBefore); // 被抵消，贯石斧不发动
    expect(attacker.hand.length).toBe(0); // 杀已打出
  });
});

describe('丈八蛇矛（转化牌）', () => {
  it('两张手牌当杀：造成伤害，两张源牌进弃牌堆', async () => {
    const g = freshGame({}, ['刘备', '孙权', '曹操']);
    registerSkills(g);
    const attacker = g.state.players[0];
    const target = g.state.players[1];
    attacker.equipment.weapon = makeUniqueCard(CardType.ZhangBaSheMao);
    const tao = makeUniqueCard(CardType.Tao, '♥', 2);
    const shan = makeUniqueCard(CardType.Shan, '♦', 3);
    attacker.hand = [tao, shan];
    const hpBefore = target.hp;

    await playPhase(g, { player: attacker });

    expect(target.hp).toBe(hpBefore - 1);
    expect(attacker.hand.length).toBe(0);
    expect(g.state.discardPile).toContain(tao);
    expect(g.state.discardPile).toContain(shan);
    expect(g.state.processing.length).toBe(0);
  });

  it('奸雄获得丈八对应的全部实体牌', async () => {
    const g = freshGame({}, ['刘备', '曹操', '孙权']);
    registerSkills(g);
    const attacker = g.state.players[0];
    const caocao = g.state.players[1];
    attacker.equipment.weapon = makeUniqueCard(CardType.ZhangBaSheMao);
    const tao = makeUniqueCard(CardType.Tao, '♥', 4);
    const shan = makeUniqueCard(CardType.Shan, '♦', 5);
    attacker.hand = [tao, shan];

    await playPhase(g, { player: attacker });

    expect(caocao.hand.map((c) => c.id)).toContain(tao.id);
    expect(caocao.hand.map((c) => c.id)).toContain(shan.id);
    expect(g.state.discardPile).not.toContain(tao);
    expect(g.state.discardPile).not.toContain(shan);
  });
});
