// ============================================================
// 三国杀最小原型 — 选择系统单元测试
// SelectionSession：步骤序列 / 依赖 / 回溯 / 校验 / 确认
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, makeUniqueCard } from './test-utils.js';
import {
  SelectionSession,
  defaultAnswer,
  runSelection,
} from './selection.js';

import { CardType } from './types.js';
import type { Card, Player } from './types.js';
import type { SelectionAnswers, SelectionPlan } from './selection.js';

/** 示例计划：action → cards(依赖 action) → targets(依赖 card) */
function makeExamplePlan(
  sha: Card, tao: Card, shan: Card, p1: Player, p2: Player,
): SelectionPlan {
  return {
    nextStep(answers: SelectionAnswers) {
      if (!answers.action) {
        return {
          id: 'action', kind: 'action',
          options: [
            { id: 'A', label: '动作A' },
            { id: 'B', label: '动作B' },
          ],
        };
      }
      if (!answers.card) {
        return {
          id: 'card', kind: 'cards',
          candidates: answers.action === 'A' ? [sha, tao] : [shan],
          min: 1, max: 1,
        };
      }
      if (!answers.target) {
        const card = (answers.card as Card[])[0];
        return {
          id: 'target', kind: 'targets',
          candidates: card.type === CardType.Sha ? [p1, p2] : [p2],
          min: 1, max: 1,
        };
      }
      return null;
    },
    result(answers: SelectionAnswers) {
      return { answers };
    },
  };
}

describe('SelectionSession', () => {
  it('按步骤回答并确认', () => {
    const g = freshGame();
    const [p1, p2] = g.state.players;
    const sha = makeUniqueCard(CardType.Sha);
    const tao = makeUniqueCard(CardType.Tao);
    const shan = makeUniqueCard(CardType.Shan);
    const session = new SelectionSession(makeExamplePlan(sha, tao, shan, p1, p2));

    expect(session.currentStep?.kind).toBe('action');
    expect(session.canConfirm).toBe(false);
    expect(session.answer('A')).toBe(true);
    expect(session.currentStep?.kind).toBe('cards');
    expect(session.answer([sha])).toBe(true);
    expect(session.currentStep?.kind).toBe('targets');
    expect(session.answer([p2])).toBe(true);
    expect(session.currentStep).toBeNull();
    expect(session.canConfirm).toBe(true);

    const result = session.confirm();
    expect(result).not.toBeNull();
    expect(result!.answers).toEqual({
      action: 'A',
      card: [sha],
      target: [p2],
    });
  });

  it('步骤候选依赖前序答案', () => {
    const g = freshGame();
    const [p1, p2] = g.state.players;
    const sha = makeUniqueCard(CardType.Sha);
    const tao = makeUniqueCard(CardType.Tao);
    const shan = makeUniqueCard(CardType.Shan);
    const session = new SelectionSession(makeExamplePlan(sha, tao, shan, p1, p2));

    session.answer('B'); // B → cards 只有闪
    expect((session.currentStep as { candidates: Card[] }).candidates).toEqual([shan]);

    session.answer([shan]); // 闪 → targets 只有 p2
    expect((session.currentStep as { candidates: Player[] }).candidates).toEqual([p2]);
  });

  it('back 清空该步答案，重新回答后后续步骤重算', () => {
    const g = freshGame();
    const [p1, p2] = g.state.players;
    const sha = makeUniqueCard(CardType.Sha);
    const tao = makeUniqueCard(CardType.Tao);
    const shan = makeUniqueCard(CardType.Shan);
    const session = new SelectionSession(makeExamplePlan(sha, tao, shan, p1, p2));

    session.answer('A');
    session.answer([sha]);
    session.answer([p1]);
    expect(session.canConfirm).toBe(true);

    session.back(); // 回到 targets，目标可重选
    expect(session.currentStep?.id).toBe('target');
    expect(session.answer([p2])).toBe(true);

    session.back(); // 回到 targets（上一步）
    session.back(); // 再回一步到 cards，改选桃
    expect(session.currentStep?.id).toBe('card');
    session.answer([tao]);
    // 桃不是杀 → targets 候选只剩 p2
    expect((session.currentStep as { candidates: Player[] }).candidates).toEqual([p2]);
    expect(session.answer([p2])).toBe(true);

    const result = session.confirm();
    expect(result!.answers.card).toEqual([tao]);
    expect(result!.answers.target).toEqual([p2]);
  });

  it('非法回答不推进状态', () => {
    const g = freshGame();
    const [p1, p2] = g.state.players;
    const sha = makeUniqueCard(CardType.Sha);
    const tao = makeUniqueCard(CardType.Tao);
    const shan = makeUniqueCard(CardType.Shan);
    const session = new SelectionSession(makeExamplePlan(sha, tao, shan, p1, p2));

    expect(session.answer('不存在')).toBe(false); // action 非法
    expect(session.currentStep?.kind).toBe('action');

    session.answer('A');
    expect(session.answer([])).toBe(false); // cards min=1 非法
    expect(session.currentStep?.kind).toBe('cards');

    session.answer([sha]);
    expect(session.answer([])).toBe(false); // targets min=1 非法
    expect(session.currentStep?.kind).toBe('targets');
  });

  it('未完成时 confirm 返回 null', () => {
    const g = freshGame();
    const [p1, p2] = g.state.players;
    const sha = makeUniqueCard(CardType.Sha);
    const tao = makeUniqueCard(CardType.Tao);
    const shan = makeUniqueCard(CardType.Shan);
    const session = new SelectionSession(makeExamplePlan(sha, tao, shan, p1, p2));

    session.answer('A');
    expect(session.confirm()).toBeNull();
  });
});

describe('cards 约束', () => {
  it('跨牌约束不满足时拒绝回答（业炎 4 花色示例）', () => {
    const g = freshGame();
    const p1 = g.state.players[0];
    const spade = makeUniqueCard(CardType.Sha, '♠', 5);
    const heart = makeUniqueCard(CardType.Sha, '♥', 6);
    const club = makeUniqueCard(CardType.Sha, '♣', 7);
    const diamond = makeUniqueCard(CardType.Sha, '♦', 8);

    const plan: SelectionPlan = {
      nextStep(answers) {
        if (!answers.cards) {
          return {
            id: 'cards', kind: 'cards',
            candidates: [spade, heart, club, diamond],
            min: 4, max: 4,
            constraint: (selected) => new Set(selected.map((c) => c.suit)).size === 4,
          };
        }
        return null;
      },
      result(answers) {
        return { answers };
      },
    };

    const session = new SelectionSession(plan);
    expect(session.answer([spade, heart, club, spade])).toBe(false); // 花色重复
    expect(session.currentStep).not.toBeNull();
    expect(session.answer([spade, heart, club, diamond])).toBe(true);
    expect(session.confirm()!.answers.cards).toEqual([spade, heart, club, diamond]);
  });
});

describe('defaultAnswer / runSelection', () => {
  it('默认 AI 按候选顺序跑完会话', async () => {
    const g = freshGame();
    const [p1, p2] = g.state.players;
    const sha = makeUniqueCard(CardType.Sha);
    const tao = makeUniqueCard(CardType.Tao);
    const shan = makeUniqueCard(CardType.Shan);

    const result = await runSelection(makeExamplePlan(sha, tao, shan, p1, p2));

    expect(result).not.toBeNull();
    expect(result!.answers).toEqual({
      action: 'A',
      card: [sha],
      target: [p1],
    });
  });

  it('默认答案提供器：boolean 用默认值，option 用第一项', () => {
    expect(defaultAnswer({
      id: 'b', kind: 'boolean', prompt: '是否发动', default: false,
    })).toBe(false);
    expect(defaultAnswer({
      id: 'o', kind: 'option', prompt: '猜花色', options: [{ value: '♠', label: '黑桃' }],
    })).toBe('♠');
  });
});
