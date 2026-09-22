// ============================================================
// 发动词汇三轴 — 引擎级测试（阶段 3 第 2 项）
//
// 三轴分属三类对象，勿混：
//   - effect 级 auto（自动发动）：前端按钮，引擎不消费（此处仅验证字段可挂载）
//   - effect 级 forced（强制发动）：触发效果不询问"是否发动"
//   - skill 级 compulsory（锁定技抗性）：失效判断前查（消费者为后续"技能失效"项）
// ============================================================

import { describe, it, expect, vi } from 'vitest';

// askYesNo 打桩：只替换询问函数，其余导出原样保留（其他模块照常工作）
vi.mock('../decision/ask.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../decision/ask.js')>();
  return { ...actual, askYesNo: vi.fn(async () => true) };
});

import { standardGame, standardRuleSet } from '../test-utils.js';
import { createStandardContainer } from '../content/standardPack.js';
import type { Game } from '../game.js';
import { GameEvent } from '../events/index.js';
import { defineSkill } from './effects.js';
import type { TriggeredEffect } from './effects.js';
import { askYesNo } from '../decision/ask.js';

const asked: string[] = [];

// 合成技能：一个强制发动、一个普通（"你可以"）；配套合成武将以驱动座次分发
const TEST_SKILLS = [
  defineSkill({
    name: '测试·强制',
    meta: { compulsory: true },
    effects: [{
      form: 'triggered',
      timing: 'testForced',
      forced: true,
      run: async () => { asked.push('forced'); },
    }],
  }),
  defineSkill({
    name: '测试·普通',
    effects: [{
      form: 'triggered',
      timing: 'testAsk',
      run: async () => { asked.push('asked'); },
    }],
  }),
];

const TEST_HEROES = [
  { name: '测试·强制', maxHp: 4, sex: 'male' as const, group: '群' as const, skills: ['测试·强制'] },
  { name: '测试·普通', maxHp: 4, sex: 'male' as const, group: '群' as const, skills: ['测试·普通'] },
];

/** 本文件的一局：标包 + 合成内容（装进本局自己的容器，不污染共享规则集） */
function testLineup(heroNames: string[]): Game {
  return standardGame({ heroNames, skills: TEST_SKILLS, heroes: TEST_HEROES });
}

describe('发动词汇三轴', () => {
  it('forced 触发效果不询问"是否发动"；普通效果走询问', async () => {
    const g = testLineup(['测试·强制', '测试·普通', '刘备']);
    asked.length = 0;
    const mock = vi.mocked(askYesNo);
    mock.mockClear();

    const owner = g.state.players[0];
    await g.triggerSystem.trigger('testForced', new GameEvent('testForced', { target: owner }, g));
    await g.triggerSystem.trigger('testAsk', new GameEvent('testAsk', { target: g.state.players[1] }, g));

    expect(asked).toEqual(['forced', 'asked']);   // 两者都执行
    expect(mock).toHaveBeenCalledTimes(1);        // 只有普通技能询问
    expect(mock.mock.calls[0][1]).toBe(g.state.players[1]);
  });

  it('auto（自动发动）是 effect 级占位字段：可挂载、可读回，引擎当前不消费', () => {
    // 注册只能在装配期（运行期规则集是只读窄接口）：此处自造容器
    const container = createStandardContainer();
    container.skills.register(defineSkill({
      name: '测试·自动',
      effects: [{ form: 'triggered', timing: 'testAuto', auto: true, run: async () => {} }],
    }));
    const effect = container.skills.effects().find(
      (e): e is TriggeredEffect => e.form === 'triggered' && e.timing === 'testAuto',
    );
    expect(effect?.auto).toBe(true);              // 词汇位置可用
    expect(effect?.forced).toBeUndefined();       // 与 forced 无关
  });

  it('标包锁定技已带 compulsory 抗性标签（6 个，全为常驻效果）', () => {
    const locked = ['咆哮', '马术', '奇才', '谦逊', '无双', '空城'];
    for (const name of locked) {
      expect(standardRuleSet().skills.get(name)?.meta.compulsory, `${name} 应带 compulsory`).toBe(true);
    }
    // 非锁定技不带该标签（抽样）
    for (const name of ['奸雄', '龙胆', '制衡', '观星', '洛神']) {
      expect(standardRuleSet().skills.get(name)?.meta.compulsory ?? false, `${name} 不应带 compulsory`).toBe(false);
    }
    // 标包锁定技当前均为常驻效果 → 无 triggered 效果需要打 forced（真实触发型锁定技待后续内容）
    for (const name of locked) {
      const effects = standardRuleSet().skills.get(name)?.effects ?? [];
      expect(effects.every((e) => e.form === 'persistent')).toBe(true);
    }
  });

  it('compulsory 与 auto/forced 是不同对象上的不同轴', () => {
    const g = testLineup(['刘备', '曹操', '孙权']);
    const skill = g.ruleSet.skills.get('测试·强制')!;
    expect(skill.meta.compulsory).toBe(true);                       // 技能级抗性
    const effect = skill.effects[0];
    expect(effect.form === 'triggered' && effect.forced).toBe(true); // 效果级强制发动
    expect(effect.auto).toBeUndefined();                             // 未声明自动发动
  });
});
