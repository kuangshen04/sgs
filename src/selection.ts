// ============================================================
// 三国杀最小原型 — 选择系统（SelectionSession）
//
// 通用选择原语：options + validate + ai。
// 领域规则（选哪里的牌、选多少、AI 怎么选）由注入的选择规则/工厂负责；
// 会话只负责：有序步骤、步骤间依赖、回溯、确认。
// ============================================================

import type { Game } from './game.js';
import type { Player } from './types.js';

/** 一个可选项；data 是任意负载（卡牌/角色/动作等），由规则解码 */
export interface SelectionOption {
  id?: string;
  label: string;
  group?: string;
  data?: unknown;
}

/** AI/规则所在上下文 */
export interface SelectionContext {
  game: Game;
  player: Player;
  step: SelectionStep;
}

/** 一个选择步骤（原子问题） */
export interface SelectionStep {
  id: string;
  prompt?: string;
  options: SelectionOption[];
  /** 校验：数量、跨选约束等；引擎在回答与默认 AI 后都会调用 */
  validate: (selected: SelectionOption[]) => boolean;
  /** 完整 AI：可读 options/validate/上下文，返回所选选项 */
  ai: (ctx: SelectionContext) => SelectionOption[];
}

/** 已答答案：stepId → 所选选项列表（原对象，规则侧直接用 data） */
export type SelectionAnswers = Record<string, SelectionOption[]>;

/**
 * 选择计划：按已答答案逐步产出下一步，全部答完产出最终结果。
 * 步骤候选依赖前序答案时，在这里计算。
 */
export interface SelectionPlan {
  nextStep(answers: SelectionAnswers): SelectionStep | null;
}

/**
 * 一次可回溯的选择会话。
 * answer 成功则进入下一步；back 回到上一步并清空其答案；
 * 全部步骤完成后 confirm 返回结果。
 */
export class SelectionSession {
  private readonly plan: SelectionPlan;
  private readonly steps: SelectionStep[] = [];
  private answeredCount = 0;
  private readonly answers: SelectionAnswers = {};

  constructor(plan: SelectionPlan) {
    this.plan = plan;
    const first = plan.nextStep({});
    if (first) this.steps.push(first);
  }

  /** 当前待回答步骤；全部完成则为 null */
  get currentStep(): SelectionStep | null {
    return this.answeredCount < this.steps.length
      ? this.steps[this.answeredCount]
      : null;
  }

  get canBack(): boolean {
    return this.answeredCount > 0;
  }

  get canConfirm(): boolean {
    return this.currentStep === null && this.answeredCount > 0;
  }

  /** 回答当前步骤；校验失败返回 false，状态不变 */
  answer(selected: SelectionOption[]): boolean {
    const step = this.currentStep;
    if (!step) return false;
    if (!isValidSelection(step, selected)) return false;

    this.answers[step.id] = selected;
    this.answeredCount++;
    this.steps.length = this.answeredCount;

    const next = this.plan.nextStep(this.answers);
    if (next) this.steps.push(next);
    return true;
  }

  /** 返回上一步；清空该步答案，后续步骤由下一次 answer 重新产出 */
  back(): void {
    if (!this.canBack) return;
    this.answeredCount--;
    const step = this.steps[this.answeredCount];
    delete this.answers[step.id];
    this.steps.length = this.answeredCount + 1;
  }

  /** 全部步骤完成后确认；未完成返回 null */
  confirm(): SelectionAnswers | null {
    if (!this.canConfirm) return null;
    return this.answers;
  }
}

/** 选项必须来自当前步骤且不重复；再交给步骤的 validate（数量/跨选约束） */
function isValidSelection(step: SelectionStep, selected: SelectionOption[]): boolean {
  const seen = new Set<SelectionOption>();
  for (const option of selected) {
    if (!step.options.includes(option) || seen.has(option)) return false;
    seen.add(option);
  }
  return step.validate(selected);
}

/**
 * 用答案提供器跑完整个会话，返回确认结果；中途失败返回 null。
 * 默认使用步骤内置的 ai（工厂注入）；真人/前端可传入 answerProvider 覆盖。
 */
export async function runSelection(
  plan: SelectionPlan,
  game: Game,
  player: Player,
  answerProvider?: (step: SelectionStep) => Promise<SelectionOption[]> | SelectionOption[],
): Promise<SelectionAnswers | null> {
  const session = new SelectionSession(plan);
  while (session.currentStep) {
    const step = session.currentStep;
    const selected = answerProvider
      ? await answerProvider(step)
      : step.ai({ game, player, step });
    if (!session.answer(selected)) return null;
  }
  return session.confirm();
}
