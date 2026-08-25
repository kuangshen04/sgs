// ============================================================
// 三国杀最小原型 — 通用用牌窗口
//
// 出牌阶段与响应窗口共用同一个动作选择骨架：
// 候选动作（真实牌 / 转化 / 技能 / 特殊规则 / 放弃）由调用方注入，
// 每个动作可带 continuation（后续选择步骤，如目标 / 源牌）。
// 引擎只负责：动作选择 + continuation；如何执行由调用方按 action 解码。
// ============================================================

import type { Game } from './game.js';
import type { Player } from './types.js';
import { actionStep } from './choose.js';
import { runSelection } from './selection.js';
import type { SelectionAnswers, SelectionPlan } from './selection.js';

export interface UseAction {
  id: string;
  label: string;
  group: string;
  priority: number;
  /** 动作被选中后的后续步骤（目标 / 源牌等）；没有则直接结束 */
  continuation?: (game: Game, player: Player) => SelectionPlan;
  /** 调用方自己的领域负载（CardOption / ConversionDef / ActiveSkillDef 等） */
  data?: unknown;
}

export interface UseChoice {
  action: UseAction;
  answers: SelectionAnswers;
}

/**
 * 在一个用牌窗口里选择动作并走完后续选择。
 * 返回选中的动作与确认后的答案；没有候选或放弃由调用方处理。
 */
export async function chooseUseAction(
  game: Game,
  player: Player,
  actions: UseAction[],
): Promise<UseChoice | null> {
  if (actions.length === 0) return null;
  const sorted = [...actions].sort((a, b) => b.priority - a.priority);

  const plan: SelectionPlan = {
    nextStep(answers: SelectionAnswers) {
      if (!answers.action) {
        return actionStep(
          'action',
          sorted.map((a) => ({ id: a.id, label: a.label, group: a.group, data: a })),
        );
      }
      const action = answers.action[0]?.data as UseAction | undefined;
      if (!action) return null;
      if (action.continuation) {
        return action.continuation(game, player).nextStep(answers);
      }
      return null;
    },
  };

  const answers = await runSelection(plan, game, player);
  if (!answers) return null;
  const action = answers.action[0]?.data as UseAction | undefined;
  return action ? { action, answers } : null;
}
