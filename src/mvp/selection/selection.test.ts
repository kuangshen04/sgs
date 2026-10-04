import { describe, expect, it } from 'vitest';

import {
  SelectionSession,
  createScriptedSelectionController,
  runSelection,
  type SelectionAnswers,
  type SelectionFrame,
  type SelectionOption,
  type SelectionPlan,
} from './selection.js';

interface Card {
  readonly id: string;
  readonly suit: 'spade' | 'heart' | 'club' | 'diamond';
}

interface Player {
  readonly id: string;
  readonly name: string;
}

const cards: readonly Card[] = [
  { id: 's1', suit: 'spade' },
  { id: 's2', suit: 'spade' },
  { id: 'h1', suit: 'heart' },
  { id: 'c1', suit: 'club' },
  { id: 'd1', suit: 'diamond' },
];

const players: readonly Player[] = [
  { id: 'p1', name: '甲' },
  { id: 'p2', name: '乙' },
];

function cardOption(card: Card): SelectionOption {
  return { id: card.id, label: card.id, data: card };
}

function playerOption(player: Player): SelectionOption {
  return { id: player.id, label: player.name, data: player };
}

function selectedIds(frame: SelectionFrame): string[] {
  return frame.selected.map(option => option.id);
}

function optionIds(frame: SelectionFrame): string[] {
  return frame.options.map(option => option.id);
}

/** 业炎：同一 cards 边界内选四种花色，再进入 target 边界。 */
function createYeyanPlan(): SelectionPlan {
  const cardsFrame = (selected: readonly SelectionOption[]): SelectionFrame => {
    const selectedIds = new Set(selected.map(option => option.id));
    const selectedSuits = new Set(
      selected.map(option => (option.data as Card).suit),
    );

    return {
      answerKey: 'cards',
      prompt: '选择四张不同花色的牌',
      selected,
      // 每次都重新创建 Option，以验证 Session 只依赖稳定 id，不依赖对象身份。
      options: cards
        .filter(card => !selectedIds.has(card.id))
        .filter(card => !selectedSuits.has(card.suit))
        .map(cardOption),
      canFinish: selected.length === 4,
    };
  };

  const targetFrame = (selected: readonly SelectionOption[]): SelectionFrame => ({
    answerKey: 'target',
    prompt: '选择伤害目标',
    selected,
    options: selected.length === 0 ? players.map(playerOption) : [],
    canFinish: selected.length === 1,
  });

  return {
    getFrame({ answers, draft }) {
      if (draft?.answerKey === 'cards') return cardsFrame(draft.selected);
      if (draft?.answerKey === 'target') return targetFrame(draft.selected);
      if (!answers.cards) return cardsFrame([]);
      if (!answers.target) return targetFrame([]);
      return null;
    },
  };
}

describe('Frame 与 draft', () => {
  it('同一 answerKey 内逐次重算可选项，finish 后才写入 answers', () => {
    const session = new SelectionSession(createYeyanPlan());

    expect(session.state?.frame.answerKey).toBe('cards');
    expect(optionIds(session.state!.frame)).toEqual(['s1', 's2', 'h1', 'c1', 'd1']);
    expect(session.state?.answers).toEqual({});

    session.apply({ type: 'select', optionId: 's1' });
    expect(selectedIds(session.state!.frame)).toEqual(['s1']);
    expect(optionIds(session.state!.frame)).toEqual(['h1', 'c1', 'd1']);
    expect(session.state?.answers).toEqual({});

    session.apply({ type: 'select', optionId: 'h1' });
    session.apply({ type: 'select', optionId: 'c1' });
    session.apply({ type: 'select', optionId: 'd1' });
    expect(session.state?.frame.canFinish).toBe(true);
    expect(session.state?.answers).toEqual({});

    session.apply({ type: 'finish' });
    expect(session.state?.frame.answerKey).toBe('target');
    expect(Object.keys(session.state!.answers)).toEqual(['cards']);
    expect(session.state!.answers.cards.map(option => option.id))
      .toEqual(['s1', 'h1', 'c1', 'd1']);
  });

  it('替换同一边界内较早选择的牌时保留其它合法选择', () => {
    const session = new SelectionSession(createYeyanPlan());
    for (const optionId of ['s1', 'h1', 'c1', 'd1']) {
      session.apply({ type: 'select', optionId });
    }

    session.apply({ type: 'unselect', optionId: 's1' });
    expect(selectedIds(session.state!.frame)).toEqual(['h1', 'c1', 'd1']);
    expect(optionIds(session.state!.frame)).toEqual(['s1', 's2']);

    session.apply({ type: 'select', optionId: 's2' });
    expect(selectedIds(session.state!.frame)).toEqual(['h1', 'c1', 'd1', 's2']);
    expect(session.state?.frame.canFinish).toBe(true);
  });
});

describe('多回溯边界', () => {
  interface BranchPlanOptions {
    readonly includeConfirm?: boolean;
  }

  function createBranchPlan(options: BranchPlanOptions = {}): SelectionPlan {
    const one = (
      answerKey: string,
      ids: readonly string[],
      selected: readonly SelectionOption[],
    ): SelectionFrame => ({
      answerKey,
      selected,
      options: selected.length === 0
        ? ids.map(id => ({ id, label: id }))
        : [],
      canFinish: selected.length === 1,
    });

    return {
      getFrame({ answers, draft }) {
        if (draft) {
          if (draft.answerKey === 'action') {
            return one('action', ['A', 'B'], draft.selected);
          }
          if (draft.answerKey === 'target') {
            const action = answers.action[0].id;
            return one('target', action === 'A' ? ['A1', 'A2'] : ['B1'], draft.selected);
          }
          if (draft.answerKey === 'confirm') {
            return one('confirm', ['confirm'], draft.selected);
          }
        }

        if (!answers.action) return one('action', ['A', 'B'], []);
        if (!answers.target) {
          const action = answers.action[0].id;
          return one('target', action === 'A' ? ['A1', 'A2'] : ['B1'], []);
        }
        if (options.includeConfirm && !answers.confirm) {
          return one('confirm', ['confirm'], []);
        }
        return null;
      },
    };
  }

  function finishOne(session: SelectionSession, optionId: string): void {
    session.apply({ type: 'select', optionId });
    session.apply({ type: 'finish' });
  }

  it('修改前序 answerKey 后清除后续答案并按新分支重算', () => {
    const session = new SelectionSession(createBranchPlan({ includeConfirm: true }));
    finishOne(session, 'A');
    finishOne(session, 'A1');

    expect(session.state?.frame.answerKey).toBe('confirm');
    expect(Object.keys(session.state!.answers)).toEqual(['action', 'target']);

    session.apply({ type: 'back' }); // 回到 target
    session.apply({ type: 'back' }); // 回到 action，原 target 暂存
    expect(session.state?.frame.answerKey).toBe('action');
    expect(session.state?.answers).toEqual({});

    session.apply({ type: 'unselect', optionId: 'A' });
    session.apply({ type: 'select', optionId: 'B' });
    session.apply({ type: 'finish' });

    expect(session.state?.frame.answerKey).toBe('target');
    expect(optionIds(session.state!.frame)).toEqual(['B1']);
    expect(Object.keys(session.state!.answers)).toEqual(['action']);
    expect(session.state!.answers.action[0].id).toBe('B');
  });

  it('回溯后答案不变时恢复原有后缀', () => {
    const session = new SelectionSession(createBranchPlan({ includeConfirm: true }));
    finishOne(session, 'A');
    finishOne(session, 'A1');

    session.apply({ type: 'back' }); // target
    session.apply({ type: 'back' }); // action，target 成为暂存后缀
    session.apply({ type: 'finish' }); // action 没有变化

    expect(session.state?.frame.answerKey).toBe('confirm');
    expect(session.state!.answers.action[0].id).toBe('A');
    expect(session.state!.answers.target[0].id).toBe('A1');
  });

  it('back 回到 answerKey 而不是撤销同一边界内的一次交互', () => {
    const session = new SelectionSession(createYeyanPlan());
    for (const optionId of ['s1', 'h1', 'c1', 'd1']) {
      session.apply({ type: 'select', optionId });
    }
    session.apply({ type: 'finish' });
    session.apply({ type: 'select', optionId: 'p1' });

    session.apply({ type: 'back' });
    expect(session.state?.frame.answerKey).toBe('cards');
    expect(selectedIds(session.state!.frame)).toEqual(['s1', 'h1', 'c1', 'd1']);
    expect(session.state?.answers).toEqual({});
  });
});

describe('命令校验', () => {
  it('非法命令不改变 Session', () => {
    const session = new SelectionSession(createYeyanPlan());
    const initial = session.state;

    expect(() => session.apply({ type: 'select', optionId: 'missing' }))
      .toThrow(/不在当前 Frame 的可选项/);
    expect(() => session.apply({ type: 'unselect', optionId: 'missing' }))
      .toThrow(/不在当前 Frame 的已选项/);
    expect(() => session.apply({ type: 'finish' }))
      .toThrow(/尚不能结束/);
    expect(() => session.apply({ type: 'back' }))
      .toThrow(/第一个回溯边界/);

    expect(session.state).toEqual(initial);
  });

  it('拒绝重复 Option id 和未完成便切换 answerKey 的 Plan', () => {
    expect(() => new SelectionSession({
      getFrame: () => ({
        answerKey: 'bad',
        selected: [{ id: 'same', label: 'A' }],
        options: [{ id: 'same', label: 'B' }],
        canFinish: false,
      }),
    })).toThrow(/重复选项 id/);

    const session = new SelectionSession({
      getFrame: ({ draft }) => draft
        ? {
            answerKey: 'other',
            selected: [],
            options: [],
            canFinish: true,
          }
        : {
            answerKey: 'first',
            selected: [],
            options: [{ id: 'x', label: 'X' }],
            canFinish: false,
          },
    });

    expect(() => session.apply({ type: 'select', optionId: 'x' }))
      .toThrow(/尚未 finish/);
  });

  it('Plan 可以没有任何选择边界', () => {
    const session = new SelectionSession({ getFrame: () => null });
    expect(session.completed).toBe(true);
    expect(session.state).toBeNull();
    expect(session.result()).toEqual({});
    expect(() => session.apply({ type: 'finish' })).toThrow(/已经完成/);
  });
});

describe('Controller 与运行器', () => {
  it('scripted controller 通过稳定 Option id 驱动完整业炎选择', async () => {
    const controller = createScriptedSelectionController([
      { type: 'select', optionId: 's1' },
      { type: 'select', optionId: 'h1' },
      { type: 'select', optionId: 'c1' },
      { type: 'select', optionId: 'd1' },
      { type: 'finish' },
      state => ({ type: 'select', optionId: state.frame.options[1].id }),
      { type: 'finish' },
    ]);

    const answers = await runSelection(createYeyanPlan(), controller);

    expect(answers.cards.map(option => option.id)).toEqual(['s1', 'h1', 'c1', 'd1']);
    expect(answers.target[0].id).toBe('p2');
    expect(controller.remaining).toBe(0);
  });

  it('scripted controller 耗尽时明确失败', async () => {
    await expect(runSelection(
      createYeyanPlan(),
      createScriptedSelectionController([]),
    )).rejects.toThrow(/操作已经耗尽/);
  });

  it('Controller 收到只读 Frame、answers 和数组快照', () => {
    const state = new SelectionSession(createYeyanPlan()).state!;
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.frame)).toBe(true);
    expect(Object.isFrozen(state.frame.selected)).toBe(true);
    expect(Object.isFrozen(state.frame.options)).toBe(true);
    expect(Object.isFrozen(state.answers)).toBe(true);
  });
});
