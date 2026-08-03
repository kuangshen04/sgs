// ============================================================
// 三国杀最小原型 — skills.ts 单元测试
// 技能注册与触发（遗计）
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from './test-utils.js';

import { damage } from './life.js';
import { useCard } from './cardActions.js';
import { drawPhase, playPhase, turn } from './gameFlow.js';

import { activeSkillRegistry, registerSkills, skillRegistry } from './skills.js';
import { triggerSystem } from './events/index.js';

import { CardType } from './types.js';

// ============================================================
// 遗计（郭嘉：受到伤害后每 1 点伤害摸 2 张牌）
// ============================================================

describe('遗计（郭嘉技能）', () => {
  const guojiaHeroes = ['刘备', '郭嘉', '孙权'];

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
// 英姿（周瑜：摸牌阶段多摸一张牌）
// ============================================================

describe('英姿（周瑜技能）', () => {
  const zhouyuHeroes = ['刘备', '周瑜', '孙权'];

  afterEach(() => triggerSystem.clear());

  it('skillRegistry 已注册英姿', () => {
    expect(skillRegistry.get('英姿')).toBeDefined();
  });

  it('摸牌阶段 → 正常 2 张 + 英姿 1 张', async () => {
    registerSkills();
    const g = freshGame({}, zhouyuHeroes);
    const zhouyu = g.state.players[1];
    const before = zhouyu.hand.length;

    await drawPhase(g, { player: zhouyu, round: 1 });

    expect(zhouyu.hand.length).toBe(before + 3);
  });

  it('非周瑜摸牌阶段 → 只摸 2 张', async () => {
    registerSkills();
    const g = freshGame({}, zhouyuHeroes);
    const liubei = g.state.players[0];
    const before = liubei.hand.length;

    await drawPhase(g, { player: liubei, round: 1 });

    expect(liubei.hand.length).toBe(before + 2);
  });
});

// ============================================================
// 闭月（貂蝉：结束阶段摸一张牌，暂挂 turn.after）
// ============================================================

describe('闭月（貂蝉技能）', () => {
  const diaochanHeroes = ['刘备', '貂蝉', '孙权'];

  afterEach(() => triggerSystem.clear());

  it('skillRegistry 已注册闭月', () => {
    expect(skillRegistry.get('闭月')).toBeDefined();
  });

  it('回合结束 → 摸 1 张牌', async () => {
    registerSkills();
    const g = freshGame({}, diaochanHeroes);
    g.deciders.cardDecide = () => null; // 出牌阶段不出牌，保证结果确定
    const diaochan = g.state.players[1];
    const before = diaochan.hand.length;

    await turn(g, { player: diaochan, round: 1 });

    // 摸牌阶段 2 张 + 闭月 1 张
    expect(diaochan.hand.length).toBe(before + 3);
  });

  it('非貂蝉回合 → 不触发闭月', async () => {
    registerSkills();
    const g = freshGame({}, diaochanHeroes);
    g.deciders.cardDecide = () => null; // 出牌阶段不出牌，保证结果确定
    const liubei = g.state.players[0];
    const before = liubei.hand.length;

    await turn(g, { player: liubei, round: 1 });

    // 只有摸牌阶段 2 张
    expect(liubei.hand.length).toBe(before + 2);
  });
});

// ============================================================
// 制衡（孙权：每回合限一次，弃置所有手牌并摸等量）
// ============================================================

describe('制衡（孙权主动技能）', () => {
  const sunquanHeroes = ['刘备', '孙权', '曹操'];

  afterEach(() => triggerSystem.clear());

  it('activeSkillRegistry 已注册制衡', () => {
    expect(activeSkillRegistry.get('制衡')).toBeDefined();
  });

  it('规则与 AI 分层：有牌可出时规则允许、AI 不使用', () => {
    const g = freshGame({}, sunquanHeroes);
    const sunquan = g.state.players[1];
    giveHand(sunquan, CardType.Sha);
    const skill = activeSkillRegistry.get('制衡')!;
    const ctx = { shaUsed: false, usedSkills: new Set<string>(), cardChoice: sunquan.hand[0] };

    expect(skill.canUse(g, sunquan, ctx)).toBe(true);        // 规则：合法
    expect(skill.ai.shouldUse(g, sunquan, ctx)).toBe(false);  // AI：不该用
  });

  it('规则与 AI 分层：无牌可出时两者都为 true', () => {
    const g = freshGame({}, sunquanHeroes);
    const sunquan = g.state.players[1];
    giveHand(sunquan, CardType.Shan);
    const skill = activeSkillRegistry.get('制衡')!;
    const ctx = { shaUsed: false, usedSkills: new Set<string>(), cardChoice: null };

    expect(skill.canUse(g, sunquan, ctx)).toBe(true);
    expect(skill.ai.shouldUse(g, sunquan, ctx)).toBe(true);
  });

  it('规则层面：已用过 → canUse 为 false（限一次）', () => {
    const g = freshGame({}, sunquanHeroes);
    const sunquan = g.state.players[1];
    giveHand(sunquan, CardType.Shan);
    const skill = activeSkillRegistry.get('制衡')!;

    expect(
      skill.canUse(g, sunquan, { shaUsed: false, usedSkills: new Set(['制衡']), cardChoice: null }),
    ).toBe(false);
  });

  it('手牌全部不可出 → 制衡发动，弃置所有手牌并摸等量', async () => {
    registerSkills();
    const g = freshGame({}, sunquanHeroes);
    const sunquan = g.state.players[1];
    giveHand(sunquan, CardType.Shan, CardType.WuXie); // 闪/无懈不可主动出

    // 控制牌堆：摸到的都是闪（依然不可出，且能验证来源）
    const deckShan1 = makeUniqueCard(CardType.Shan, '♥', 5);
    const deckShan2 = makeUniqueCard(CardType.Shan, '♦', 6);
    g.state.deck = [deckShan1, deckShan2]; // pop 顺序：deckShan2 先出

    await playPhase(g, { player: sunquan, round: 1 });

    // 原手牌（含无懈）被弃置
    expect(g.state.discardPile.some((c) => c.type === CardType.WuXie)).toBe(true);
    // 摸回了牌堆里的两张闪
    expect(sunquan.hand.map((c) => c.id).sort((a, b) => a - b))
      .toEqual([deckShan1.id, deckShan2.id]);
  });

  it('有牌可出 → 出牌优先，制衡不发动', async () => {
    registerSkills();
    const g = freshGame({}, sunquanHeroes);
    const sunquan = g.state.players[1];
    const target = g.state.players[0];
    giveHand(sunquan, CardType.Sha);
    const hpBefore = target.hp;

    await playPhase(g, { player: sunquan, round: 1 });

    // 杀正常打出（若先制衡，杀会被弃置、目标不受伤）
    expect(target.hp).toBe(hpBefore - 1);
    expect(sunquan.hand.length).toBe(0);
  });

  it('制衡后摸到可出的牌 → 继续出牌', async () => {
    registerSkills();
    const g = freshGame({}, sunquanHeroes);
    const sunquan = g.state.players[1];
    const target = g.state.players[0];
    giveHand(sunquan, CardType.WuXie); // 不可出 → 制衡换牌
    g.state.deck = [makeUniqueCard(CardType.Sha, '♠', 2)]; // 摸到杀
    const hpBefore = target.hp;

    await playPhase(g, { player: sunquan, round: 1 });

    // 制衡换到杀 → 打出杀
    expect(target.hp).toBe(hpBefore - 1);
    expect(sunquan.hand.length).toBe(0);
  });

  it('每回合限一次：制衡后仍无牌可出 → 不二次发动', async () => {
    registerSkills();
    const g = freshGame({}, sunquanHeroes);
    const sunquan = g.state.players[1];
    giveHand(sunquan, CardType.Shan);
    g.state.deck = [makeUniqueCard(CardType.Shan, '♥', 7)]; // 摸到的还是闪

    await playPhase(g, { player: sunquan, round: 1 });

    // 制衡一次：手牌换成牌堆那张 ♥7 闪
    expect(sunquan.hand.length).toBe(1);
    expect(sunquan.hand[0].suit).toBe('♥');
    expect(sunquan.hand[0].number).toBe(7);
    // 若二次制衡会再弃 1 摸 1，弃牌堆会有 2 张闪
    expect(g.state.discardPile.filter((c) => c.type === CardType.Shan).length).toBe(1);
  });

  it('非孙权（无制衡技能）→ 不发动', async () => {
    registerSkills();
    const g = freshGame({}, sunquanHeroes);
    const liubei = g.state.players[0];
    giveHand(liubei, CardType.Shan);
    g.state.deck = [makeUniqueCard(CardType.Shan, '♥', 7)];

    await playPhase(g, { player: liubei, round: 1 });

    expect(liubei.hand.length).toBe(1);
    expect(liubei.hand[0].suit).toBe('♠'); // 还是原来的闪，没摸牌
    expect(g.state.discardPile.length).toBe(0);
  });
});

// ============================================================
// 仁德（刘备：出牌阶段限一次，交给他人两张牌并回复 1 点体力）
// ============================================================

describe('仁德（刘备主动技能）', () => {
  const liubeiHeroes = ['刘备', '曹操', '孙权'];

  afterEach(() => triggerSystem.clear());

  it('activeSkillRegistry 已注册仁德', () => {
    expect(activeSkillRegistry.get('仁德')).toBeDefined();
  });

  it('交给目标 2 张牌并回复 1 点体力', async () => {
    registerSkills();
    const g = freshGame({}, liubeiHeroes);
    const liubei = g.state.players[0];
    const target = g.state.players[1];
    liubei.hp = 3; // 受伤
    giveHand(liubei, CardType.Shan, CardType.WuXie); // 不可出 → 触发主动技能
    const givenIds = liubei.hand.map((c) => c.id);

    await playPhase(g, { player: liubei, round: 1 });

    expect(liubei.hp).toBe(4);
    expect(liubei.hand.length).toBe(0);
    expect(target.hand.map((c) => c.id).sort((a, b) => a - b))
      .toEqual([...givenIds].sort((a, b) => a - b));
    expect(g.state.discardPile.length).toBe(0); // 牌到了目标手牌，不是弃牌堆
  });

  it('满血时不发动（AI 策略：交牌换血不划算）', async () => {
    registerSkills();
    const g = freshGame({}, liubeiHeroes);
    const liubei = g.state.players[0];
    giveHand(liubei, CardType.Shan, CardType.WuXie);
    const skill = activeSkillRegistry.get('仁德')!;
    const ctx = { shaUsed: false, usedSkills: new Set<string>(), cardChoice: null };

    expect(skill.canUse(g, liubei, ctx)).toBe(true);        // 规则：合法
    expect(skill.ai.shouldUse(g, liubei, ctx)).toBe(false);  // AI：不该用
  });
});

// ============================================================
// 反间（周瑜：出牌阶段限一次，交给他人一张牌并造成 1 点伤害）
// ============================================================

describe('反间（周瑜主动技能）', () => {
  const zhouyuHeroes = ['刘备', '周瑜', '孙权'];

  afterEach(() => triggerSystem.clear());

  it('activeSkillRegistry 已注册反间', () => {
    expect(activeSkillRegistry.get('反间')).toBeDefined();
  });

  it('交给目标 1 张牌并造成 1 点伤害', async () => {
    registerSkills();
    const g = freshGame({}, zhouyuHeroes);
    const zhouyu = g.state.players[1];
    const target = g.state.players[0];
    giveHand(zhouyu, CardType.Shan); // 不可出 → 触发主动技能
    const givenId = zhouyu.hand[0].id;
    const hpBefore = target.hp;

    await playPhase(g, { player: zhouyu, round: 1 });

    expect(target.hp).toBe(hpBefore - 1);
    expect(zhouyu.hand.length).toBe(0);
    expect(target.hand.map((c) => c.id)).toContain(givenId);
    expect(g.state.discardPile.length).toBe(0); // 牌到了目标手牌
  });
});

// ============================================================
// 奸雄（曹操：受到牌造成的伤害后，获得造成伤害的牌）
// ============================================================

describe('奸雄（曹操技能）', () => {
  const caocaoHeroes = ['刘备', '曹操', '孙权'];

  afterEach(() => triggerSystem.clear());

  it('skillRegistry 已注册奸雄', () => {
    expect(skillRegistry.get('奸雄')).toBeDefined();
  });

  it('受到杀造成的伤害 → 获得那张杀', async () => {
    registerSkills();
    const g = freshGame({}, caocaoHeroes);
    const attacker = g.state.players[0];
    const caocao = g.state.players[1];
    giveHand(attacker, CardType.Sha);
    const shaCard = attacker.hand[0];
    const hpBefore = caocao.hp;

    await useCard(g, { player: attacker, card: shaCard, targets: [caocao] });

    expect(caocao.hp).toBe(hpBefore - 1);
    expect(caocao.hand.map((c) => c.id)).toContain(shaCard.id);
  });

  it('受到决斗造成的伤害 → 获得那张决斗', async () => {
    registerSkills();
    const g = freshGame({}, caocaoHeroes);
    const attacker = g.state.players[0];
    const caocao = g.state.players[1];
    giveHand(attacker, CardType.JueDou);
    giveHand(caocao); // 无杀 → 决斗直接输
    const jdCard = attacker.hand[0];

    await useCard(g, { player: attacker, card: jdCard, targets: [caocao] });

    expect(caocao.hand.map((c) => c.id)).toContain(jdCard.id);
  });

  it('非使用牌造成的伤害 → 不获得', async () => {
    registerSkills();
    const g = freshGame({}, caocaoHeroes);
    const caocao = g.state.players[1];

    await damage(g, { target: caocao, source: g.state.players[0], amount: 1 });

    expect(caocao.hand.length).toBe(0);
  });

  it('非曹操受伤 → 不触发', async () => {
    registerSkills();
    const g = freshGame({}, caocaoHeroes);
    const liubei = g.state.players[0];
    const attacker = g.state.players[1];
    giveHand(attacker, CardType.Sha);
    const shaCard = attacker.hand[0];

    await useCard(g, { player: attacker, card: shaCard, targets: [liubei] });

    expect(liubei.hand.length).toBe(0);
  });
});
