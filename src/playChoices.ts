// ============================================================
// 三国杀最小原型 — 出牌阶段选择编排
//
// 出牌阶段作为 SelectionSession 的第一个真实例子：
// 动作选择（普通牌 + 主动技能）→ 按动作执行后续选择（目标）。
// 主动技能与转化牌都以 selectionPlan + resolve/execute 形式接入；
// 转化牌最终仍以 { kind: 'card', card: UsedCard, targets } 返回。
// ============================================================

import type { Player, UsedCard } from './types.js';
import type { Game } from './game.js';
import { computeCardOptions, computeTargetOptions, actionStep, targetsStep } from './choose.js';
import type { CardOption } from './choose.js';
import { asUsedCard } from './cardRegistry.js';
import { collectConversions } from './conversions.js';
import type { ConversionDef } from './conversions.js';
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
    }
  | {
      id: string;
      label: string;
      group: 'conversion';
      priority: number;
      kind: 'conversion';
      conversion: ConversionDef;
    };

/** 选中普通牌或转化牌后的结果（card 为 UsedCard，含目标） */
export interface CardActionResult {
  kind: 'card';
  card: UsedCard;
  targets: Player[];
}

/** 选中主动技能后的结果（含确认后的选择结果，execute 据此执行） */
export interface SkillActionResult {
  kind: 'skill';
  skill: ActiveSkillDef;
  answers: SelectionAnswers;
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

  const actionOption = result.answers.action[0];
  const action = actionOption?.data as PlayAction | undefined;
  if (!action) return null;

  if (action.kind === 'card') {
    const targets = (result.answers.target ?? [])
      .map((o) => o.data as Player)
      .filter((p): p is Player => !!p);
    return { kind: 'card', card: asUsedCard(action.option.card), targets };
  }
  if (action.kind === 'conversion') {
    const resolved = action.conversion.resolve(result.answers);
    return { kind: 'card', card: resolved.card, targets: resolved.targets };
  }
  return { kind: 'skill', skill: action.skill, answers: result.answers };
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

  // 转化牌（武圣等）：源牌存在 + 效果牌规则合法 + AI 愿意用
  for (const conversion of collectConversions(player)) {
    if (!conversion.canUse(game, player, shaUsed)) continue;
    if (!conversion.ai.shouldUse(game, player, shaUsed)) continue;
    actions.push({
      id: `conversion:${conversion.name}`,
      label: conversion.name,
      group: 'conversion',
      priority: conversion.ai.usePriority,
      kind: 'conversion',
      conversion,
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

      const action = (answers.action[0]?.data as PlayAction | undefined);
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
      if (action.kind === 'conversion') {
        return action.conversion.selectionPlan(game, player).nextStep(answers);
      }
      if (action.kind === 'skill') {
        return action.skill.selectionPlan(game, player, ctx).nextStep(answers);
      }
      return null;
    },
    result(answers: SelectionAnswers) {
      return { answers };
    },
  };

  return { plan, actions };
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
