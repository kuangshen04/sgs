// ============================================================
// 三国杀最小原型 — 出牌阶段选择编排
//
// 出牌阶段作为 SelectionSession 的第一个真实例子：
// 动作选择（普通牌 + 主动技能）→ 按动作执行后续选择（目标）。
// 主动技能暂不拆 select/execute，先由 content 自己处理；只统一动作入口。
// ============================================================

import type { Card, Player } from './types.js';
import type { Game } from './game.js';
import { computeCardOptions, computeTargetOptions, actionStep, targetsStep } from './choose.js';
import type { CardOption } from './choose.js';
import { activeSkillRegistry } from './skills.js';
import type { ActiveSkillContext, ActiveSkillDef } from './skills.js';
import { runSelection } from './selection.js';
import type { SelectionAnswers, SelectionPlan } from './selection.js';

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

  const result = await runSelection(plan, game, player);
  if (!result) return null;

  const action = actions.find((a) => a.id === result.answers.action[0]);
  if (!action) return null;

  if (action.kind === 'card') {
    const targets = decodeTargets(game, player, action.option, result.answers.target ?? []);
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
        return actionStep(
          'action',
          actions.map((a) => ({ id: a.id, label: a.label, group: a.group, data: a })),
        );
      }

      const action = actions.find((a) => a.id === answers.action[0]);
      if (!action) return null;

      if (action.kind === 'card' && !answers.target) {
        const def = action.option.def;
        const targetOptions = computeTargetOptions(game, action.option.card, player);
        const tc = def.targetCount;
        const candidates = targetOptions.map((t) => t.player);
        if (tc === 'all') {
          return targetsStep('target', player, candidates, {
            min: candidates.length,
            max: candidates.length,
          });
        }
        return targetsStep('target', player, candidates, { min: tc, max: tc });
      }
      return null;
    },
    result(answers: SelectionAnswers) {
      return { answers };
    },
  };

  return { plan, actions };
}

/** 把 target 步骤的 player:${index} id 解码回目标玩家 */
function decodeTargets(
  game: Game,
  player: Player,
  option: CardOption,
  targetIds: string[],
): Player[] {
  const targetOptions = computeTargetOptions(game, option.card, player);
  const byIndex = new Map(targetOptions.map((t, i) => [`player:${i}`, t.player]));
  return targetIds
    .map((id) => byIndex.get(id))
    .filter((p): p is Player => !!p);
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
