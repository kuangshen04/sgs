// ============================================================
// 吕蒙 — 克己（历史查询版：本回合未使用杀 → 可跳过弃牌阶段）
// 阶段 1 起克己的判定走 game.history（findEventSince），不再用 usedShaThisTurn 标记；
// 测试以真实事件（useCard + 合成 turn 包裹）驱动，验证回合作用域。
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand } from '../test-utils.js';

import { discardPhase } from '../gameFlow.js';
import { useCard } from '../cardActions.js';
import { GameEvent } from '../events/index.js';
import { registerSkills, skillRegistry } from '../skills.js';
import { heroRegistry } from '../heroRegistry.js';

import { CardType } from '../types.js';

describe('克己（吕蒙）', () => {
  it('skillRegistry 已注册克己，heroRegistry 已注册吕蒙', () => {
    expect(skillRegistry.get('克己')).toBeDefined();
    expect(heroRegistry.get('吕蒙')?.skills).toContain('克己');
  });

  it('本回合未用杀 → 跳过弃牌阶段', async () => {
    const g = freshGame({}, ['吕蒙', '刘备', '孙权']);
    registerSkills(g);
    const lv = g.state.players[0];
    lv.hp = 4;
    giveHand(lv, CardType.Shan, CardType.Shan, CardType.Shan, CardType.Shan, CardType.Shan);

    await new GameEvent('turn', { player: lv }, g).execute(async () => {
      await discardPhase(g, { player: lv });
    });

    expect(lv.hand.cards.length).toBe(5); // 未弃牌
  });

  it('本回合用过杀 → 正常弃牌（历史查询命中）', async () => {
    const g = freshGame({}, ['吕蒙', '刘备', '孙权']);
    registerSkills(g);
    const lv = g.state.players[0];
    const liubei = g.state.players[1];
    lv.hp = 4;
    giveHand(lv, CardType.Sha, CardType.Shan, CardType.Shan, CardType.Shan, CardType.Shan, CardType.Shan);
    const shaCard = lv.hand.cards[0];

    // 同一回合内：用杀 → 弃牌阶段不得克己
    await new GameEvent('turn', { player: lv }, g).execute(async () => {
      await useCard(g, { player: lv, card: shaCard, targets: [liubei] });
      await discardPhase(g, { player: lv });
    });

    expect(lv.hand.cards.length).toBe(4); // 6 张用 1 → 剩 5 > 体力 4 → 弃 1
  });

  it('回合作用域：别人回合里用杀不计入，自己回合仍可克己', async () => {
    const g = freshGame({}, ['刘备', '吕蒙', '孙权']);
    registerSkills(g);
    const liubei = g.state.players[0];
    const lv = g.state.players[1];
    const sunquan = g.state.players[2];
    lv.hp = 4;
    giveHand(lv, CardType.Sha, CardType.Shan, CardType.Shan, CardType.Shan, CardType.Shan, CardType.Shan);
    const shaCard = lv.hand.cards[0];
    const sqHpBefore = sunquan.hp;

    // 借刀式场景：吕蒙在刘备的回合里被迫使用杀
    await new GameEvent('turn', { player: liubei }, g).execute(async () => {
      await useCard(g, { player: lv, card: shaCard, targets: [sunquan] });
    });
    expect(sunquan.hp).toBe(sqHpBefore - 1);

    // 自己回合开始后（boundary = 自己的 turn 事件）范围内没用过杀 → 克己生效
    await new GameEvent('turn', { player: lv }, g).execute(async () => {
      await discardPhase(g, { player: lv });
    });

    expect(lv.hand.cards.length).toBe(5); // 跳过弃牌，未弃
  });
});
