// ============================================================
// 貂蝉 — 离间 / 闭月
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from '../../test-utils.js';

import { endPhase, turn } from '../../flow/gameFlow.js';
import { choosePlayAction } from '../../decision/playChoices.js';

import { EventType } from '../../events/index.js';
import { CardType } from '../../types.js';
import { standardRuleSet } from '../../test-utils.js';

// 闭月测试的阵容：只有女性角色（离间无合法组合 → 出牌阶段不会发动技能，摸牌数确定）
const diaochanHeroes = ['大乔', '貂蝉', '甄宓'];

// ============================================================
// 离间
// ============================================================

describe('离间（貂蝉技能）', () => {
  const heroes = ['貂蝉', '刘备', '曹操']; // 两名男性角色：刘备 / 曹操

  it('规则集已注册离间；貂蝉拥有离间', () => {
    expect(standardRuleSet().skills.get('离间')).toBeDefined();
    expect(freshGame({}, heroes).state.players[0].skills.has('离间')).toBe(true);
  });

  it('发动：弃一张牌，视为 A 对 B 使用决斗（0 牌转化 UC，伤害来源为 A）', async () => {
    const g = freshGame({}, heroes);
    const [diaochan, liubei, caocao] = g.state.players;
    giveHand(diaochan, CardType.Tao); // 满血时桃不可出 → 只剩离间这个动作
    const cost = diaochan.hand.cards[0];
    const virtualCardSizes: number[] = [];
    const damages: { target: string; source?: string }[] = [];
    g.triggerSystem.on(`${EventType.CardEffect}.before`, (e) => {
      const d = e.data as { card: { physicalCards: unknown[] } };
      virtualCardSizes.push(d.card.physicalCards.length);
    });
    g.triggerSystem.on(`${EventType.Damage}.after`, (e) => {
      const d = e.data as { target: { name: string }; source?: { name: string } };
      damages.push({ target: d.target.name, source: d.source?.name });
    });

    const action = await choosePlayAction(g, diaochan, false, new Set());
    expect(action?.kind).toBe('skill');
    if (action?.kind !== 'skill') throw new Error('应为主动技能动作');
    await action.effect.execute(g, diaochan, action.answers);

    expect(virtualCardSizes).toContain(0);            // 决斗是 0 牌转化（无实体牌）
    expect(diaochan.hand.cards).not.toContain(cost);  // cost 已弃置
    expect(g.state.discardPile.cards).toContain(cost);
    // 决斗：AI 默认选 A = 刘备、B = 曹操；曹操无杀 → 受到来自刘备的 1 点伤害
    expect(damages).toEqual([{ target: '曹操', source: '刘备' }]);
    expect(caocao.hp).toBe(caocao.maxHp - 1);
    expect(liubei.hp).toBe(liubei.maxHp);
  });

  it('不可被无懈可击响应：目标持无懈也不会被询问', async () => {
    const g = freshGame({}, heroes);
    const [diaochan, liubei, caocao] = g.state.players;
    giveHand(diaochan, CardType.Tao);
    giveHand(caocao, CardType.WuXie); // 决斗目标持无懈

    const action = await choosePlayAction(g, diaochan, false, new Set());
    if (action?.kind !== 'skill') throw new Error('应为主动技能动作');
    await action.effect.execute(g, diaochan, action.answers);

    expect(caocao.hand.cards.map((c) => c.type)).toEqual([CardType.WuXie]); // 无懈未打出
    expect(caocao.hp).toBe(caocao.maxHp - 1); // 决斗正常结算（曹操无杀）
    expect(liubei.hp).toBe(liubei.maxHp);
  });

  it('出牌阶段限一次：已发动过则不可用', () => {
    const g = freshGame({}, heroes);
    const diaochan = g.state.players[0];
    giveHand(diaochan, CardType.Tao);
    const effect = standardRuleSet().skills.get('离间')!.effects[0];
    if (effect.form !== 'activated') throw new Error('离间应为主动效果');

    const base = { shaUsed: false, hasCardOption: false };
    expect(effect.canUse(g, diaochan, { ...base, usedSkills: new Set() })).toBe(true);
    expect(effect.canUse(g, diaochan, { ...base, usedSkills: new Set(['离间']) })).toBe(false);
  });

  it('无合法组合（场上唯一男性是空城的诸葛亮，无人可作决斗目标）→ 不可用', () => {
    const g = freshGame({}, ['貂蝉', '诸葛亮']); // 诸葛亮空手 → 空城：不能成为决斗目标
    const diaochan = g.state.players[0];
    giveHand(diaochan, CardType.Tao);
    const effect = standardRuleSet().skills.get('离间')!.effects[0];
    if (effect.form !== 'activated') throw new Error('离间应为主动效果');

    // 唯一男性诸葛亮能对谁决斗？只剩貂蝉（女性）→ 无 "男性对男性" 的组合
    expect(effect.canUse(g, diaochan, {
      shaUsed: false, usedSkills: new Set(), hasCardOption: false,
    })).toBe(false);
  });
});

describe('闭月（貂蝉技能）', () => {
  it('规则集已注册闭月', () => {
    expect(standardRuleSet().skills.get('闭月')).toBeDefined();
  });

  it('结束阶段 → 摸 1 张牌', async () => {
    const g = freshGame({}, diaochanHeroes);
    const diaochan = g.state.players[1];
    const before = diaochan.hand.cards.length;

    await endPhase(g, { player: diaochan });

    expect(diaochan.hand.cards.length).toBe(before + 1);
  });

  it('回合结束 → 摸 1 张牌', async () => {
    const g = freshGame({}, diaochanHeroes);
    // 牌堆放桃：满血不可出，保证出牌阶段不出牌（结果确定）
    g.state.deck.replaceAll([makeUniqueCard(CardType.Tao), makeUniqueCard(CardType.Tao), makeUniqueCard(CardType.Tao)]);
    const diaochan = g.state.players[1];
    const before = diaochan.hand.cards.length;

    await turn(g, { player: diaochan });

    // 摸牌阶段 2 张 + 闭月 1 张
    expect(diaochan.hand.cards.length).toBe(before + 3);
  });

  it('非貂蝉回合 → 不触发闭月', async () => {
    const g = freshGame({}, diaochanHeroes);
    // 牌堆放桃：满血不可出，保证出牌阶段不出牌（结果确定）
    g.state.deck.replaceAll([makeUniqueCard(CardType.Tao), makeUniqueCard(CardType.Tao)]);
    const other = g.state.players[0]; // 大乔（无闭月）
    const before = other.hand.cards.length;

    await turn(g, { player: other });

    // 只有摸牌阶段 2 张
    expect(other.hand.cards.length).toBe(before + 2);
  });
});
