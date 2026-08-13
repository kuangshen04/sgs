// ============================================================
// 三国杀最小原型 — 转化牌建模（mock 武圣）
// 先验证 useCard 的"效果牌 card / 实体牌 physicalCards"边界，
// 不接入 choose，也不注册武圣技能。
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame } from './test-utils.js';
import { useCard } from './cardActions.js';
import { registerSkills } from './skills.js';
import { CardType } from './types.js';
import type { Card, UsedCard } from './types.js';

function virtualSha(physical: Card): UsedCard {
  return {
    type: CardType.Sha,
    name: '杀',
    suit: physical.suit,
    number: physical.number,
    physicalCards: [physical],
  };
}

describe('useCard — 转化牌建模（mock 武圣）', () => {
  it('虚拟杀使用：实体红牌进处理区并结算进弃牌堆，虚拟杀不占位置', async () => {
    const g = freshGame();
    registerSkills(g);
    const attacker = g.state.players[0];
    const defender = g.state.players[2]; // 孙权，无奸雄
    const red = { id: 9001, type: CardType.Shan, name: '闪', suit: '♥', number: 3 };
    attacker.hand = [red];

    const hpBefore = defender.hp;
    await useCard(g, {
      player: attacker,
      card: virtualSha(red),
      targets: [defender],
    });

    expect(defender.hp).toBe(hpBefore - 1);
    expect(attacker.hand).not.toContain(red);
    expect(g.state.processing).toHaveLength(0);
    expect(g.state.discardPile).toContain(red); // 实体牌正常回弃牌堆
  });

  it('奸雄获得虚拟牌对应的全部实体牌', async () => {
    const g = freshGame();
    registerSkills(g);
    const attacker = g.state.players[0];
    const caocao = g.state.players[1];
    const red = { id: 9002, type: CardType.Shan, name: '闪', suit: '♦', number: 7 };
    attacker.hand = [red];

    const hpBefore = caocao.hp;
    await useCard(g, {
      player: attacker,
      card: virtualSha(red),
      targets: [caocao],
    });

    expect(caocao.hp).toBe(hpBefore - 1);
    expect(caocao.hand.map((c) => c.id)).toContain(red.id); // 奸雄拿走实体源牌
    expect(g.state.discardPile).not.toContain(red);
    expect(g.state.processing).toHaveLength(0);
  });
});
