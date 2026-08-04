// ============================================================
// 曹操 — 奸雄
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';

import { freshGame, giveHand } from '../test-utils.js';

import { damage } from '../life.js';
import { useCard } from '../cardActions.js';

import { registerSkills, skillRegistry } from '../skills.js';
import { triggerSystem } from '../events/index.js';

import { CardType } from '../types.js';

const caocaoHeroes = ['刘备', '曹操', '孙权'];

afterEach(() => triggerSystem.clear());

describe('奸雄（曹操技能）', () => {
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
