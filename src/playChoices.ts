// ============================================================
// 三国杀最小原型 — 出牌阶段选择编排
//
// 出牌阶段作为 SelectionSession 的第一个真实例子：
// 动作选择（普通牌 + 主动技能）→ 按动作执行后续选择（目标）。
// 主动技能暂不拆 select/execute，先由 content 自己处理；只统一动作入口。
// ============================================================

import type { Card, Player } from './types.js';
import type { Game } from './game.js';
import { computeCardOptions, computeTargetOptions } from './choose.js';
import type { CardOption } from './choose.js';
import { activeSkillRegistry } from './skills.js';
import type { ActiveSkillContext, ActiveSkillDef } from './skills.js';
import { runSelection } from './selection.js';
import type { SelectionAnswers, SelectionPlan, SelectionStep } from './selection.js';

/** 出牌阶段的一个动作候选：普通牌 或 主动技能 */
export type PlayAction =
  | {
      id: string;
      label: string;
      group: 'card';
      priority: number;
      kind: 'card';
      option: CardOption;
    }
  | {
      id: string;
      label: string;
      group: 'skill';
      priority: number;
      kind: 'skill';
      skill: ActiveSkillDef;
    };

/** 选中普通牌后的结果（含目标） */
export interface CardActionResult {
  kind: 'card';
  card: Card;
  targets: Player[];
}

/** 选中主动技能后的结果（暂由 content 自行选择/执行） */
export interface SkillActionResult {
  kind: 'skill';
  skill: ActiveSkillDef;
}

export type PlayActionResult = CardActionResult | SkillActionResult;

/**
 * 出牌阶段的一次动作选择：
 * action（牌 + 技能混合候选）→ 普通牌再选目标。
 * 返回 null 表示本轮没有可做的动作（出牌阶段结束）。
 */
export async function choosePlayAction(
  game: Game,
  player: Player,
  shaUsed: boolean,
  usedSkills: ReadonlySet<string>,
): Promise<PlayActionResult | null> {
  const { plan, actions } = buildPlayPlan(game, player, shaUsed, usedSkills);
  if (actions.length === 0) return null;

  const result = await runSelection(plan);
  if (!result) return null;

  const action = actions.find((a) => a.id === result.answers.action);
  if (!action) return null;

  if (action.kind === 'card') {
    const targets = (result.answers.target as Player[] | undefined) ?? [];
    return { kind: 'card', card: action.option.card, targets };
  }
  return { kind: 'skill', skill: action.skill };
}

/** 构建出牌阶段的选择计划与动作列表 */
function buildPlayPlan(
  game: Game,
  player: Player,
  shaUsed: boolean,
  usedSkills: ReadonlySet<string>,
): { plan: SelectionPlan; actions: PlayAction[] } {
  const actions: PlayAction[] = [];

  // 规则层：可用的普通牌 → AI 层：愿意出的牌 → 必须有合法目标
  const cardOptions = computeCardOptions(game, player, shaUsed)
    .filter((o) => o.def.ai.shouldUse(player, shaUsed))
    .filter((o) => computeTargetOptions(game, o.card, player).length > 0);
  for (const option of cardOptions) {
    actions.push({
      id: `card:${option.card.id}`,
      label: option.def.name,
      group: 'card',
      priority: option.def.ai.usePriority,
      kind: 'card',
      option,
    });
  }

  // 主动技能：规则 canUse + AI shouldUse（hasCardOption 供制衡等参考）
  const ctx: ActiveSkillContext = {
    shaUsed,
    usedSkills,
    hasCardOption: cardOptions.length > 0,
  };
  for (const skill of collectActiveSkills(game, player, ctx)) {
    actions.push({
      id: `skill:${skill.name}`,
      label: skill.name,
      group: 'skill',
      priority: skill.ai.priority,
      kind: 'skill',
      skill,
    });
  }

  actions.sort((a, b) => b.priority - a.priority);

  const plan: SelectionPlan = {
    nextStep(answers: SelectionAnswers) {
      if (!answers.action) {
        return {
          id: 'action',
          kind: 'action',
          options: actions.map((a) => ({
            id: a.id,
            label: a.label,
            group: a.group,
            priority: a.priority,
          })),
        };
      }

      const action = actions.find((a) => a.id === answers.action);
      if (!action) return null;

      if (action.kind === 'card' && !answers.target) {
        return targetsStep(game, player, action.option);
      }
      return null;
    },
    result(answers: SelectionAnswers) {
      return { answers };
    },
  };

  return { plan, actions };
}

/** 按牌的目标规则产出目标步骤（targetCount='all' 全选；数字优先自己） */
function targetsStep(game: Game, player: Player, option: CardOption): SelectionStep {
  const def = option.def;
  const targetOptions = computeTargetOptions(game, option.card, player);
  const tc = def.targetCount;

  if (tc === 'all') {
    return {
      id: 'target',
      kind: 'targets',
      candidates: targetOptions.map((t) => t.player),
      min: targetOptions.length,
      max: targetOptions.length,
    };
  }

  // 默认 AI 偏好自己（桃/无中生有）：把玩家排到候选最前
  const self = targetOptions.find((t) => t.player === player);
  const candidates = self
    ? [self.player, ...targetOptions.filter((t) => t !== self).map((t) => t.player)]
    : targetOptions.map((t) => t.player);
  return {
    id: 'target',
    kind: 'targets',
    candidates,
    min: tc,
    max: tc,
  };
}

/** 收集当前可发动的主动技能（规则 + AI） */
function collectActiveSkills(
  game: Game,
  player: Player,
  ctx: ActiveSkillContext,
): ActiveSkillDef[] {
  if (!player.alive) return [];
  return (player.hero.skills ?? [])
    .map((name) => activeSkillRegistry.get(name))
    .filter((s): s is ActiveSkillDef => !!s)
    .filter((s) => s.canUse(game, player, ctx))
    .filter((s) => s.ai.shouldUse(game, player, ctx));
}
