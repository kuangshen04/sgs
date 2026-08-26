// ============================================================
// 三国杀最小原型 — 出牌阶段选择编排
//
// 出牌阶段是通用用牌窗口（useWindow）的一个实例：
// 候选 = 普通牌 + 主动技能 + 转化牌，且允许主动技能。
// 响应窗口复用同一窗口，只是候选不同且不含主动技能。
// ============================================================

import { CardType } from './types.js';
import type { Player, UsedCard } from './types.js';
import type { Game } from './game.js';
import { computeCardOptions, computeTargetOptions, targetsStep } from './choose.js';
import type { CardOption } from './choose.js';
import { asUsedCard } from './cardRegistry.js';
import { collectConversions } from './conversions.js';
import type { ConversionDef } from './conversions.js';
import { activeSkillRegistry } from './skills.js';
import type { ActiveSkillContext, ActiveSkillDef } from './skills.js';
import { chooseUseAction } from './useWindow.js';
import type { UseAction } from './useWindow.js';
import type { SelectionAnswers, SelectionPlan } from './selection.js';

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
 * 出牌阶段的一次动作选择：候选=牌+技能+转化；
 * 返回 null 表示本轮没有可做的动作（出牌阶段结束）。
 */
export async function choosePlayAction(
  game: Game,
  player: Player,
  shaUsed: boolean,
  usedSkills: ReadonlySet<string>,
): Promise<PlayActionResult | null> {
  const actions = buildPlayActions(game, player, shaUsed, usedSkills);
  const choice = await chooseUseAction(game, player, actions);
  if (!choice) return null;

  if (choice.action.group === 'card') {
    const option = choice.action.data as CardOption;
    const targets = (choice.answers.target ?? [])
      .map((o) => o.data as Player)
      .filter((p): p is Player => !!p);
    return { kind: 'card', card: asUsedCard(option.card), targets };
  }
  if (choice.action.group === 'conversion') {
    const conversion = choice.action.data as ConversionDef;
    const resolved = conversion.resolve(choice.answers);
    return { kind: 'card', card: resolved.card, targets: resolved.targets };
  }
  return {
    kind: 'skill',
    skill: choice.action.data as ActiveSkillDef,
    answers: choice.answers,
  };
}

/** 构建出牌阶段的 useWindow 动作候选 */
function buildPlayActions(
  game: Game,
  player: Player,
  shaUsed: boolean,
  usedSkills: ReadonlySet<string>,
): UseAction[] {
  const actions: UseAction[] = [];

  // 规则层：可用的普通牌 → AI 层：愿意出的牌 → 必须有合法目标
  const cardOptions = computeCardOptions(game, player, shaUsed)
    .filter((o) => o.def.ai.shouldUse(player, shaUsed))
    .filter((o) => computeTargetOptions(game, asUsedCard(o.card), player).length > 0);
  for (const option of cardOptions) {
    actions.push({
      id: `card:${option.card.id}`,
      label: option.def.name,
      group: 'card',
      priority: option.def.ai.usePriority,
      data: option,
      continuation: (g, p) => cardTargetPlan(g, p, option),
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
      data: skill,
      continuation: (g, p) => skill.selectionPlan(g, p, ctx),
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
      data: conversion,
      continuation: (g, p) => conversion.selectionPlan(g, p),
    });
  }

  return actions;
}

/** 普通牌的后续计划：按效果牌规则选目标 */
function cardTargetPlan(
  game: Game,
  player: Player,
  option: CardOption,
): SelectionPlan {
  return {
    nextStep(answers) {
      if (answers.target) return null;
      const used = asUsedCard(option.card);
      const targetOptions = computeTargetOptions(game, used, player);
      const tc = option.def.targetCount;
      const candidates = targetOptions.map((t) => t.player);
      if (option.card.type === CardType.Sha) {
        const multiMax = fangtianMaxTargets(player);
        if (multiMax && targetOptions.length > 1) {
          const max = Math.min(multiMax, targetOptions.length);
          return targetsStep('target', player, candidates, {
            min: 1,
            max,
            ai: (ctx) => ctx.step.options.slice(0, max),
          });
        }
      }
      if (tc === 'all') {
        return targetsStep('target', player, candidates, {
          min: candidates.length,
          max: candidates.length,
        });
      }
      return targetsStep('target', player, candidates, { min: tc, max: tc });
    },
  };
}

/** 方天画戟：最后一张手牌使用杀时可额外目标（至多 3），否则返回 null */
function fangtianMaxTargets(player: Player): number | null {
  if (player.equipment.weapon?.type !== CardType.FangTianHuaJi) return null;
  if (player.hand.length !== 1) return null;
  return 3;
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
