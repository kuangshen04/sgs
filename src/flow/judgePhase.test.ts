// ============================================================
// judgePhase — 引擎机制测试（**只用测试内容，不加载标包**）
//
// 这是"下层测试不依赖上层内容"的样板：判定阶段是引擎机制，
// 场景用 testGame + 自造延时牌搭建，不需要乐不思蜀/闪电。
// 标包延时牌自身的规则（乐不思蜀跳过出牌阶段、闪电转移）在
// `flow/gameFlow.test.ts` 的集成段与 `content/cards.test.ts` 里覆盖。
// ============================================================

import { describe, it, expect } from 'vitest';

import { testGame, testDelayCard, makeUniqueCard, placeJudgment } from '../test-utils.js';
import { judgePhase } from './gameFlow.js';
import { CardTag, CardType } from '../types.js';
import type { Card } from '../types.js';

/** 判定牌（放在牌堆顶：judge 摸到的就是它） */
function judgeCard(suit: string, number = 7): Card {
  return makeUniqueCard(CardType.Tao, suit, number);
}

describe('judgePhase（引擎机制：只用测试内容）', () => {
  it('自造延时牌：判定区 UC 依次结算，结算后离开判定区进弃牌堆', async () => {
    const ran: string[] = [];
    const g = testGame({
      cards: [testDelayCard({ name: '测试·延时甲', onJudge: async () => { ran.push('甲'); } })],
    });
    const player = g.state.players[0];
    const a = makeUniqueCard(CardType.LeBu);
    const b = makeUniqueCard(CardType.LeBu); // 同一延时槽位：两张都按测试定义结算
    placeJudgment(g, player, a, b);
    g.state.deck.replaceAll([judgeCard('♥'), judgeCard('♠')]);

    await judgePhase(g, { player });

    // 判定区按进入顺序逐个结算
    expect(ran.length).toBe(2);
    expect(player.judgment.cards.length).toBe(0);          // 结算后离开判定区
    expect(g.state.discardPile.cards).toContain(a);        // 实体牌进弃牌堆
    expect(g.state.discardPile.cards).toContain(b);
  });

  it('delayContent 收到判定牌本身（花色/点数可读）', async () => {
    const seen: (Card | null)[] = [];
    const g = testGame({
      cards: [testDelayCard({ onJudge: async (_game, _target, card) => { seen.push(card); } })],
    });
    const player = g.state.players[0];
    placeJudgment(g, player, makeUniqueCard(CardType.LeBu));
    const top = judgeCard('♦', 12);
    g.state.deck.replaceAll([top]);

    await judgePhase(g, { player });

    expect(seen.length).toBe(1);
    expect(seen[0]?.suit).toBe('♦');
    expect(seen[0]?.number).toBe(12);
  });

  it('判定区里的非延时牌被跳过（不结算、留在原地）', async () => {
    let ran = 0;
    // 非延时牌定义（有 Trick 标签但没有 Delay 标签）不该由判定阶段结算
    const nonDelayDef = {
      ...testDelayCard({ name: '测试·非延时' }),
      type: CardType.WuZhong,
      tags: [CardTag.Trick],
    };
    const g = testGame({
      cards: [testDelayCard({ onJudge: async () => { ran++; } }), nonDelayDef],
    });
    const player = g.state.players[0];
    const nonDelay = makeUniqueCard(CardType.WuZhong);
    placeJudgment(g, player, nonDelay);
    g.state.deck.replaceAll([judgeCard('♥')]);

    await judgePhase(g, { player });

    expect(ran).toBe(0);                                    // 未结算
    expect(player.judgment.cards).toContain(nonDelay);       // 仍在判定区
  });
});
