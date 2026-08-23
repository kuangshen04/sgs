// ============================================================
// 三国杀最小原型 — 选择系统单元测试
// SelectionSession（通用 options + validate + ai，答案即选项对象）
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, makeUniqueCard } from './test-utils.js';

import { SelectionSession, runSelection } from './selection.js';

import { CardType } from './types.js';
import type { Card, Player } from './types.js';
import type {
  SelectionAnswers,
  SelectionOption,
  SelectionPlan,
  SelectionStep,
} from './selection.js';

/** 示例计划：action → card(依赖 action) → target(依赖 card) */
function makeExamplePlan(
  sha: Card, tao: Card, shan: Card, p1: Player, p2: Player,
): SelectionPlan {
  const cardStep = (candidates: Card[]): SelectionStep => ({
    id: 'card',
    prompt: '选择牌',
    options: candidates.map((c) => ({ id: `card:${c.id}`, label: c.name, data: c })),
    validate: (selected) => selected.length === 1,
    ai: (ctx) => [ctx.step.options[0]],
  });

  const targetStep = (candidates: Player[]): SelectionStep => ({
    id: 'target',
    prompt: '选择目标',
    options: candidates.map((c, i) => ({ id: `player:${i}`, label: c.name, data: c })),
    validate: (selected) => selected.length === 1,
    ai: (ctx) => [ctx.step.options[0]],
  });

  return {
    nextStep(answers: SelectionAnswers) {
      if (!answers.action) {
        return {
          id: 'action',
          prompt: '选择动作',
          options: [
            { id: 'A', label: '动作A' },
            { id: 'B', label: '动作B' },
          ],
          validate: (selected) => selected.length === 1,
          ai: (ctx) => [ctx.step.options[0]],
        };
      }
      if (!answers.card) {
        const actionLabel = answers.action[0].label;
        return cardStep(actionLabel === '动作A' ? [sha, tao] : [shan]);
      }
      if (!answers.target) {
        const card = answers.card[0].data as Card;
        return targetStep(card.type === CardType.Sha ? [p1, p2] : [p2]);
      }
      return null;
    },
    result(answers: SelectionAnswers) {
      return { answers };
    },
  };
}

function firstOptions(step: SelectionStep | null): SelectionOption[] {
  return step ? [step.options[0]] : [];
}

describe('SelectionSession', () => {
  it('按步骤回答并确认', () => {
    const g = freshGame();
    const [p1, p2] = g.state.players;
    const sha = makeUniqueCard(CardType.Sha);
    const tao = makeUniqueCard(CardType.Tao);
    const shan = makeUniqueCard(CardType.Shan);
    const session = new SelectionSession(makeExamplePlan(sha, tao, shan, p1, p2));

    expect(session.currentStep?.id).toBe('action');
    expect(session.canConfirm).toBe(false);
    expect(session.answer(firstOptions(session.currentStep))).toBe(true);
    expect(session.currentStep?.id).toBe('card');
    expect(session.answer(firstOptions(session.currentStep))).toBe(true);
    expect(session.currentStep?.id).toBe('target');
    expect(session.answer([session.currentStep!.options[1]])).toBe(true);
    expect(session.currentStep).toBeNull();
    expect(session.canConfirm).toBe(true);

    const result = session.confirm();
    expect(result).not.toBeNull();
    expect((result!.answers.action[0].data as Card | undefined)?.id).toBeUndefined();
    expect((result!.answers.card[0].data as Card).id).toBe(sha.id);
    expect((result!.answers.target[0].data as Player).name).toBe(p2.name);
  });

  it('步骤候选依赖前序答案', () => {
    const g = freshGame();
    const [p1, p2] = g.state.players;
    const sha = makeUniqueCard(CardType.Sha);
    const tao = makeUniqueCard(CardType.Tao);
    const shan = makeUniqueCard(CardType.Shan);
    const session = new SelectionSession(makeExamplePlan(sha, tao, shan, p1, p2));

    session.answer([session.currentStep!.options[1]]); // B
    expect((session.currentStep!.options[0].data as Card).id).toBe(shan.id);

    session.answer(firstOptions(session.currentStep!)); // 选闪
    expect((session.currentStep!.options[0].data as Player).name).toBe(p2.name);
  });

  it('back 清空该步答案，重新回答后后续步骤重算', () => {
    const g = freshGame();
    const [p1, p2] = g.state.players;
    const sha = makeUniqueCard(CardType.Sha);
    const tao = makeUniqueCard(CardType.Tao);
    const shan = makeUniqueCard(CardType.Shan);
    const session = new SelectionSession(makeExamplePlan(sha, tao, shan, p1, p2));

    session.answer(firstOptions(session.currentStep!)); // A
    session.answer(firstOptions(session.currentStep!)); // 杀
    session.answer(firstOptions(session.currentStep!)); // p1
    expect(session.canConfirm).toBe(true);

    session.back();
    expect(session.currentStep?.id).toBe('target');
    expect(session.answer([session.currentStep!.options[1]])).toBe(true); // p2

    session.back();
    session.back();
    expect(session.currentStep?.id).toBe('card');

    const cardStep = session.currentStep!;
    const taoOption = cardStep.options.find((o) => (o.data as Card).id === tao.id)!;
    session.answer([taoOption]);
    expect((session.currentStep!.options[0].data as Player).name).toBe(p2.name);
    expect(session.answer(firstOptions(session.currentStep!))).toBe(true);

    const result = session.confirm();
    expect((result!.answers.card[0].data as Card).id).toBe(tao.id);
    expect((result!.answers.target[0].data as Player).name).toBe(p2.name);
  });

  it('非法回答不推进状态', () => {
    const g = freshGame();
    const [p1, p2] = g.state.players;
    const sha = makeUniqueCard(CardType.Sha);
    const tao = makeUniqueCard(CardType.Tao);
    const shan = makeUniqueCard(CardType.Shan);
    const session = new SelectionSession(makeExamplePlan(sha, tao, shan, p1, p2));

    expect(session.answer([{ label: '伪造' }])).toBe(false); // 不在当前选项
    expect(session.currentStep?.id).toBe('action');

    session.answer(firstOptions(session.currentStep!));
    expect(session.answer([])).toBe(false); // card 数量非法
    expect(session.currentStep?.id).toBe('card');

    session.answer(firstOptions(session.currentStep!));
    expect(session.answer([{ label: '不存在' }])).toBe(false); // target 非当前选项
    expect(session.currentStep?.id).toBe('target');
  });

  it('未完成时 confirm 返回 null', () => {
    const g = freshGame();
    const [p1, p2] = g.state.players;
    const sha = makeUniqueCard(CardType.Sha);
    const tao = makeUniqueCard(CardType.Tao);
    const shan = makeUniqueCard(CardType.Shan);
    const session = new SelectionSession(makeExamplePlan(sha, tao, shan, p1, p2));

    session.answer(firstOptions(session.currentStep!));
    expect(session.confirm()).toBeNull();
  });
});

describe('跨选约束', () => {
  it('数量与花色互异都通过 validate 表达（业炎示例）', () => {
    const g = freshGame();
    const spade = makeUniqueCard(CardType.Sha, '♠', 5);
    const heart = makeUniqueCard(CardType.Sha, '♥', 6);
    const club = makeUniqueCard(CardType.Sha, '♣', 7);
    const diamond = makeUniqueCard(CardType.Sha, '♦', 8);
    const cards = [spade, heart, club, diamond];

    const plan: SelectionPlan = {
      nextStep(answers) {
        if (!answers.cards) {
          return {
            id: 'cards',
            prompt: '选择4张花色互异的牌',
            options: cards.map((c) => ({ id: `card:${c.id}`, label: c.name, data: c })),
            validate: (selected) => {
              const picked = selected.map((o) => o.data as Card);
              return picked.length === 4
                && new Set(picked.map((c) => c.suit)).size === 4;
            },
            ai: (ctx) => ctx.step.options.slice(0, 4),
          };
        }
        return null;
      },
      result(answers) {
        return { answers };
      },
    };

    const session = new SelectionSession(plan);
    const options = session.currentStep!.options;
    const duplicate = [options[0], options[1], options[2], options[0]];
    expect(session.answer(duplicate)).toBe(false); // 重复选项被引擎拒绝

    const valid = [options[0], options[1], options[2], options[3]];
    expect(session.answer(valid)).toBe(true);
    expect(session.confirm()!.answers.cards).toEqual(valid);
  });
});

describe('runSelection', () => {
  it('默认使用步骤内置 ai 跑完会话', async () => {
    const g = freshGame();
    const [p1, p2] = g.state.players;
    const sha = makeUniqueCard(CardType.Sha);
    const tao = makeUniqueCard(CardType.Tao);
    const shan = makeUniqueCard(CardType.Shan);

    const result = await runSelection(
      makeExamplePlan(sha, tao, shan, p1, p2),
      g,
      g.state.players[0],
    );

    expect(result).not.toBeNull();
    expect((result!.answers.card[0].data as Card).id).toBe(sha.id);
    expect((result!.answers.target[0].data as Player).name).toBe(p1.name);
  });
});
