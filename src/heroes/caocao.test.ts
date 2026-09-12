// ============================================================
// 曹操 — 奸雄
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from '../test-utils.js';

import { damage } from '../life.js';
import { useCard } from '../cardActions.js';

import { skillRegistry } from '../effects.js';

import { CardType } from '../types.js';

const caocaoHeroes = ['刘备', '曹操', '孙权'];

describe('奸雄（曹操技能）', () => {
  it('skillRegistry 已注册奸雄', () => {
    expect(skillRegistry.get('奸雄')).toBeDefined();
  });

  it('受到杀造成的伤害 → 获得那张杀', async () => {
    const g = freshGame({}, caocaoHeroes);
    const attacker = g.state.players[0];
    const caocao = g.state.players[1];
    giveHand(attacker, CardType.Sha);
    const shaCard = attacker.hand.cards[0];
    const hpBefore = caocao.hp;

    await useCard(g, { player: attacker, card: shaCard, targets: [caocao] });

    expect(caocao.hp).toBe(hpBefore - 1);
    expect(caocao.hand.cards.map((c) => c.id)).toContain(shaCard.id);
  });

  it('受到决斗造成的伤害 → 获得那张决斗', async () => {
    const g = freshGame({}, caocaoHeroes);
    const attacker = g.state.players[0];
    const caocao = g.state.players[1];
    giveHand(attacker, CardType.JueDou);
    giveHand(caocao); // 无杀 → 决斗直接输
    const jdCard = attacker.hand.cards[0];

    await useCard(g, { player: attacker, card: jdCard, targets: [caocao] });

    expect(caocao.hand.cards.map((c) => c.id)).toContain(jdCard.id);
  });

  it('非使用牌造成的伤害 → 不获得', async () => {
    const g = freshGame({}, caocaoHeroes);
    const caocao = g.state.players[1];

    await damage(g, { target: caocao, source: g.state.players[0], amount: 1 });

    expect(caocao.hand.cards.length).toBe(0);
  });

  it('刚烈反击伤害不误归原杀（曹操用杀被反击，不得获得杀）', async () => {
    const g = freshGame({}, ['曹操', '夏侯惇', '孙权']);
    const caocao = g.state.players[0];
    const xiahoudun = g.state.players[1];
    // 曹操只 1 张手牌：被刚烈反击时手牌 <2 → 走"受 1 点伤害"分支
    giveHand(caocao, CardType.Sha);
    const shaCard = caocao.hand.cards[0];
    // 控制判定：牌堆顶放一张非红桃（刚烈判定非红桃 → 结算反击）
    g.state.deck.replaceAll([makeUniqueCard(CardType.Sha, '♠', 5)]);
    const hpBefore = caocao.hp;

    await useCard(g, { player: caocao, card: shaCard, targets: [xiahoudun] });

    expect(xiahoudun.hp).toBe(3);                    // 曹操的杀命中
    expect(caocao.hp).toBe(hpBefore - 1);            // 曹操被刚烈反击 1 点
    // 反击是技能伤害（damage 无 card）：奸雄不得把杀拿回手里
    expect(caocao.hand.cards.length).toBe(0);
    expect(g.state.discardPile.cards.some((c) => c.id === shaCard.id)).toBe(true); // 杀结算后进弃牌堆
  });

  it('非曹操受伤 → 不触发', async () => {
    const g = freshGame({}, caocaoHeroes);
    const liubei = g.state.players[0];
    const attacker = g.state.players[1];
    giveHand(attacker, CardType.Sha);
    const shaCard = attacker.hand.cards[0];

    await useCard(g, { player: attacker, card: shaCard, targets: [liubei] });

    expect(liubei.hand.cards.length).toBe(0);
  });
});

describe('护驾（曹操主公技）', () => {
  it('魏盟友代打闪，曹操免伤', async () => {
    const g = freshGame({}, ['曹操', '郭嘉', '刘备']);
    const caocao = g.state.players[0];
    const guojia = g.state.players[1];
    const attacker = g.state.players[2];
    caocao.hand.clear();
    guojia.hand.replaceAll([makeUniqueCard(CardType.Shan)]);
    attacker.hand.replaceAll([makeUniqueCard(CardType.Sha)]);
    const hpBefore = caocao.hp;

    await useCard(g, { player: attacker, card: attacker.hand.cards[0], targets: [caocao] });

    expect(caocao.hp).toBe(hpBefore);
    expect(guojia.hand.cards.length).toBe(0);
    expect(g.state.discardPile.cards.some((c) => c.type === CardType.Shan)).toBe(true);
  });
});
