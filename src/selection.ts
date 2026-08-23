// ============================================================
// 三国杀最小原型 — 选择系统（SelectionSession）
//
// 外部边界：一次可回溯的选择会话。choose 只做决策，不执行牌。
// 原语：action / cards / targets / boolean / option。
// 组合：有序步骤 + 步骤间依赖；后续步骤由 SelectionPlan 按已答答案产出。
// 选择结果暂不强类型，统一 Record<stepId, unknown>。
// ============================================================

import type { Card, Player } from './types.js';

// ============================================================
// 原语类型
// ============================================================

/** 动作候选（出牌 / 技能 / 转化；具体负载由集成方扩展） */
export interface ActionOption {
  id: string;
  label: string;
  group?: string;
  priority?: number;
}

/** option 原语的候选项 */
export interface ChoiceOption {
  value: string;
  label: string;
}

/** 一个选择步骤（原子问题） */
export type SelectionStep =
  | { id: string; kind: 'action'; options: ActionOption[] }
  | {
      id: string;
      kind: 'cards';
      candidates: Card[];
      min: number;
      max: number;
      /** 跨牌约束（如业炎 4 张花色互异）；回答时校验 */
      constraint?: (selected: Card[]) => boolean;
    }
  | { id: string; kind: 'targets'; candidates: Player[]; min: number; max: number }
  | { id: string; kind: 'boolean'; prompt: string; default: boolean }
  | { id: string; kind: 'option'; prompt: string; options: ChoiceOption[] };

// ============================================================
// 选择计划与会话
// ============================================================

/** 已答答案：stepId → 该步骤的选择值 */
export type SelectionAnswers = Record<string, unknown>;

/** 确认后的选择结果（暂不强类型） */
export interface SelectionResult {
  answers: SelectionAnswers;
}

/**
 * 选择计划：按已答答案逐步产出下一步，全部答完产出最终结果。
 * 步骤候选依赖前序答案时，在这里计算（如选牌后按 targetFilter 算目标）。
 */
export interface SelectionPlan {
  nextStep(answers: SelectionAnswers): SelectionStep | null;
  result(answers: SelectionAnswers): SelectionResult;
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
  answer(value: unknown): boolean {
    const step = this.currentStep;
    if (!step) return false;
    if (!validateStepAnswer(step, value)) return false;

    this.answers[step.id] = value;
    this.answeredCount++;
    this.steps.length = this.answeredCount; // 丢弃旧后续步骤

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
  confirm(): SelectionResult | null {
    if (!this.canConfirm) return null;
    return this.plan.result(this.answers);
  }
}

// ============================================================
// 步骤校验
// ============================================================

function validateStepAnswer(step: SelectionStep, value: unknown): boolean {
  switch (step.kind) {
    case 'action':
      return typeof value === 'string'
        && step.options.some((o) => o.id === value);
    case 'cards':
      return Array.isArray(value)
        && value.length >= step.min
        && value.length <= step.max
        && value.every(isCard)
        && (!step.constraint || step.constraint(value as Card[]));
    case 'targets':
      return Array.isArray(value)
        && value.length >= step.min
        && value.length <= step.max
        && value.every(isPlayer);
    case 'boolean':
      return typeof value === 'boolean';
    case 'option':
      return typeof value === 'string'
        && step.options.some((o) => o.value === value);
  }
}

function isCard(v: unknown): v is Card {
  return typeof v === 'object' && v !== null
    && typeof (v as Card).id === 'number'
    && typeof (v as Card).type === 'string';
}

function isPlayer(v: unknown): v is Player {
  return typeof v === 'object' && v !== null
    && typeof (v as Player).name === 'string';
}

// ============================================================
// 默认 AI 答案提供器（写死；真人/前端接入时替换）
// ============================================================

/** 默认 AI：按候选顺序 / 默认值回答 */
export function defaultAnswer(step: SelectionStep): unknown {
  switch (step.kind) {
    case 'action':
      return step.options[0]?.id;
    case 'cards':
      return step.candidates.slice(0, step.min);
    case 'targets':
      return step.candidates.slice(0, step.min);
    case 'boolean':
      return step.default;
    case 'option':
      return step.options[0]?.value;
  }
}

/** 用答案提供器跑完整个会话，返回确认结果；中途失败返回 null */
export async function runSelection(
  plan: SelectionPlan,
  answerProvider: (step: SelectionStep) => Promise<unknown> | unknown = defaultAnswer,
): Promise<SelectionResult | null> {
  const session = new SelectionSession(plan);
  while (session.currentStep) {
    const value = await answerProvider(session.currentStep);
    if (!session.answer(value)) return null;
  }
  return session.confirm();
}
