// ============================================================
// 许褚 — 裸衣
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';

import { freshGame, giveHand } from '../test-utils.js';

import { useCard } from '../cardActions.js';
import { drawPhase, turn } from '../gameFlow.js';

import { registerSkills, skillRegistry } from '../skills.js';
import { triggerSystem } from '../events/index.js';

import { CardType } from '../types.js';

afterEach(() => triggerSystem.clear());

describe('裸衣（许褚技能）', () => {
  it('skillRegistry 已注册裸衣', () => {
    expect(skillRegistry.get('裸衣')).toBeDefined();
  });

  it('摸牌阶段少摸一张', async () => {
    registerSkills();
    const g = freshGame({}, ['刘备', '许褚', '孙权']);
    const xuchu = g.state.players[1];

    await drawPhase(g, { player: xuchu });

    expect(xuchu.hand.length).toBe(1); // 只摸 1 张
  });

  it('使用杀造成伤害+1', async () => {
    registerSkills();
    const g = freshGame({}, ['刘备', '许褚', '孙权']);
    const xuchu = g.state.players[1];
    await drawPhase(g, { player: xuchu }); // 裸衣发动
    giveHand(xuchu, CardType.Sha);
    const target = g.state.players[0];
    const hpBefore = target.hp;

    await useCard(g, { player: xuchu, card: xuchu.hand[0], targets: [target] });

    expect(target.hp).toBe(hpBefore - 2); // 杀 1 + 裸衣 1
  });

  it('使用决斗造成伤害+1', async () => {
    registerSkills();
    const g = freshGame({}, ['刘备', '许褚', '孙权']);
    const xuchu = g.state.players[1];
    await drawPhase(g, { player: xuchu });
    giveHand(xuchu, CardType.JueDou);
    const target = g.state.players[0];
    giveHand(target); // 无杀 → 许褚胜
    const hpBefore = target.hp;

    await useCard(g, { player: xuchu, card: xuchu.hand[0], targets: [target] });

    expect(target.hp).toBe(hpBefore - 2);
  });

  it('决斗对自己造成伤害也+1（依据使用方是自己，而非伤害来源）', async () => {
    registerSkills();
    const g = freshGame({}, ['刘备', '许褚', '孙权']);
    const xuchu = g.state.players[1];
    await drawPhase(g, { player: xuchu });
    giveHand(xuchu, CardType.JueDou); // 许褚用决斗但无杀
    const target = g.state.players[0];
    giveHand(target, CardType.Sha);   // 目标有杀 → 决斗中许褚失败
    const hpBefore = xuchu.hp;

    await useCard(g, { player: xuchu, card: xuchu.hand[0], targets: [target] });

    expect(xuchu.hp).toBe(hpBefore - 2); // 决斗失败受 1+1=2 伤害
  });

  it('南蛮伤害不加成（仅杀/决斗）', async () => {
    registerSkills();
    const g = freshGame({}, ['刘备', '许褚', '孙权']);
    const xuchu = g.state.players[1];
    await drawPhase(g, { player: xuchu });
    giveHand(xuchu, CardType.NanMan);
    const target = g.state.players[0];
    const hpBefore = target.hp;

    await useCard(g, { player: xuchu, card: xuchu.hand[0], targets: [target] });

    expect(target.hp).toBe(hpBefore - 1); // 无加成
  });

  it('回合结束后 buff 失效', async () => {
    registerSkills();
    const g = freshGame({}, ['刘备', '许褚', '孙权']);
    const xuchu = g.state.players[1];
    await turn(g, { player: xuchu }); // 裸衣发动 + 回合结束清理
    giveHand(xuchu, CardType.Sha);
    const target = g.state.players[0];
    const hpBefore = target.hp;

    await useCard(g, { player: xuchu, card: xuchu.hand[0], targets: [target] });

    expect(target.hp).toBe(hpBefore - 1); // 无加成
  });
});
