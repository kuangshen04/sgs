// ============================================================
// 触发排序 — 座次主排序 + 同角色多候选由该角色选择顺序（演进 5.2 红线）
//
// 合成技能 + 合成武将驱动分发；askOption 打桩以覆盖"放弃"分支。
// ============================================================

import { describe, it, expect, vi } from 'vitest';

// 默认走真实实现，个别用例用 mockResolvedValueOnce 覆盖（"选择放弃"）
vi.mock('../decision/choose.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../decision/choose.js')>();
  return { ...actual, askOption: vi.fn(actual.askOption) };
});

import { freshGame } from '../test-utils.js';
import { GameEvent } from '../events/index.js';
import { defineSkill } from './effects.js';
import { heroRegistry } from '../content/heroRegistry.js';
import { askOption } from '../decision/choose.js';

const order: string[] = [];
let flag = false;

// ── 合成内容（须在 createGame/installEffects 之前定义）──────────────
defineSkill({
  name: '测试·时序A',
  effects: [{
    form: 'triggered', timing: 'testOrder',
    run: async (_g, _e, owner) => { order.push(`A:${owner.name}`); },
  }],
});
defineSkill({
  name: '测试·时序B',
  effects: [{
    form: 'triggered', timing: 'testOrder',
    run: async (_g, _e, owner) => { order.push(`B:${owner.name}`); },
  }],
});

/** 同一角色同一时点三个效果：定义序 = 可选一 → 可选二 → 强制（强制应最先执行） */
defineSkill({
  name: '测试·多候选',
  effects: [
    { form: 'triggered', timing: 'testMulti', run: async () => { order.push('可选一'); } },
    { form: 'triggered', timing: 'testMulti', run: async () => { order.push('可选二'); } },
    { form: 'triggered', timing: 'testMulti', forced: true, run: async () => { order.push('强制'); } },
  ],
});

/** 条件依赖前一个效果造成的状态（验证每次询问前重算条件） */
defineSkill({
  name: '测试·条件重算',
  effects: [
    {
      form: 'triggered', timing: 'testCond',
      run: async () => { order.push('设置标记'); flag = true; },
    },
    {
      form: 'triggered', timing: 'testCond',
      condition: () => !flag,
      run: async () => { order.push('不应发动'); },
    },
  ],
});

heroRegistry.register({ name: '测试·时序A', maxHp: 4, sex: 'male', group: '群', skills: ['测试·时序A'] });
heroRegistry.register({ name: '测试·时序B', maxHp: 4, sex: 'male', group: '群', skills: ['测试·时序B'] });
heroRegistry.register({ name: '测试·多候选', maxHp: 4, sex: 'male', group: '群', skills: ['测试·多候选'] });
heroRegistry.register({ name: '测试·条件重算', maxHp: 4, sex: 'male', group: '群', skills: ['测试·条件重算'] });

/** 触发某时点（事件主体无关，仅提供事件上下文） */
async function fire(g: ReturnType<typeof freshGame>, timing: string): Promise<void> {
  await g.triggerSystem.trigger(timing, new GameEvent(timing, { target: g.state.players[0] }, g));
}

describe('触发排序：座次主排序（从当前回合角色起，按行动顺序）', () => {
  it('当前回合角色是座次 1 → 其效果先于座次 0 的角色', async () => {
    const g = freshGame({}, ['测试·时序A', '测试·时序B', '刘备']);
    g.state.currentIndex = 1;
    order.length = 0;

    await fire(g, 'testOrder');

    expect(order).toEqual(['B:测试·时序B', 'A:测试·时序A']);
  });

  it('当前回合角色是座次 0 → 顺序反转（证明不是固定从 0 号位开始）', async () => {
    const g = freshGame({}, ['测试·时序A', '测试·时序B', '刘备']);
    g.state.currentIndex = 0;
    order.length = 0;

    await fire(g, 'testOrder');

    expect(order).toEqual(['A:测试·时序A', 'B:测试·时序B']);
  });

  it('死亡角色不参与触发结算', async () => {
    const g = freshGame({}, ['测试·时序A', '测试·时序B', '刘备']);
    g.state.currentIndex = 0;
    g.state.players[0].alive = false;
    order.length = 0;

    await fire(g, 'testOrder');

    expect(order).toEqual(['B:测试·时序B']);
  });
});

describe('触发排序：同角色多候选（强制先行 + 玩家决定顺序）', () => {
  it('强制发动先执行；可选候选按候选默认序逐个询问后全部发动（AI 默认不放弃）', async () => {
    const g = freshGame({}, ['测试·多候选', '刘备']);
    order.length = 0;

    await fire(g, 'testMulti');

    expect(order).toEqual(['强制', '可选一', '可选二']);
  });

  it('多个可选候选走"选一个发动"的询问（放弃则剩余候选本次不再发动）', async () => {
    const g = freshGame({}, ['测试·多候选', '刘备']);
    order.length = 0;
    const mock = vi.mocked(askOption);
    mock.mockClear();
    mock.mockResolvedValueOnce('skip'); // 玩家在第一个询问点选择放弃

    await fire(g, 'testMulti');

    expect(order).toEqual(['强制']);            // 可选候选都没发动
    expect(mock).toHaveBeenCalledTimes(1);      // 只问了一次（放弃了就不再问）
    const choices = mock.mock.calls[0][3].map((c) => c.value);
    expect(choices).toEqual(['0', '1', 'skip']); // 两个候选 + 放弃
  });
});

describe('触发排序：每次询问前重算归属/条件', () => {
  it('前一个效果改变状态后，后一个效果的条件不再成立 → 不发动', async () => {
    const g = freshGame({}, ['测试·条件重算', '刘备']);
    flag = false;
    order.length = 0;

    await fire(g, 'testCond');

    expect(order).toEqual(['设置标记']); // "不应发动" 未执行
  });
});
