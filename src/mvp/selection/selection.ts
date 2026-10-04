/**
 * MVP Selection 模块（R003）。
 *
 * Frame 表示当前一次交互的可选范围；answerKey 表示回溯与后续答案失效的边界。
 * Selection 只形成答案，不执行牌、技能或其它业务行为。
 */

export interface SelectionOption {
  /** 前序答案不变时，同一可选实体或值跨 Frame 必须保持相同 id。 */
  readonly id: string;
  readonly label: string;
  readonly group?: string;
  readonly data?: unknown;
}

/** 已经完成的回溯边界答案；当前正在编辑的 draft 不在其中。 */
export type SelectionAnswers = Readonly<
  Record<string, readonly SelectionOption[]>
>;

/** 当前 answerKey 内尚未完成的答案。 */
export interface SelectionDraft {
  readonly answerKey: string;
  readonly selected: readonly SelectionOption[];
}

export interface SelectionFrame {
  readonly answerKey: string;
  readonly prompt?: string;
  /** 当前边界已经选择的内容。 */
  readonly selected: readonly SelectionOption[];
  /** 当前状态下允许继续加入的内容。 */
  readonly options: readonly SelectionOption[];
  /** 当前 selected 是否允许结束该回溯边界。 */
  readonly canFinish: boolean;
}

export interface SelectionPlanState {
  /** 当前活动边界之前已经完成的答案。 */
  readonly answers: SelectionAnswers;
  /** 没有活动边界、请求下一个边界时为 null。 */
  readonly draft: SelectionDraft | null;
}

export interface SelectionPlan {
  /** 返回当前 Frame；整个 Plan 完成时返回 null。 */
  getFrame(state: SelectionPlanState): SelectionFrame | null;
}

export interface SelectionControllerState {
  readonly frame: SelectionFrame;
  readonly answers: SelectionAnswers;
  readonly canBack: boolean;
}

export type SelectionCommand =
  | { readonly type: 'select'; readonly optionId: string }
  | { readonly type: 'unselect'; readonly optionId: string }
  | { readonly type: 'finish' }
  | { readonly type: 'back' };

export interface SelectionController {
  interact(
    state: SelectionControllerState,
  ): SelectionCommand | Promise<SelectionCommand>;
}

export type SelectionScriptEntry =
  | SelectionCommand
  | ((
    state: SelectionControllerState,
  ) => SelectionCommand | Promise<SelectionCommand>);

export interface ScriptedSelectionController extends SelectionController {
  readonly remaining: number;
}

interface AnswerEntry {
  readonly answerKey: string;
  readonly selected: readonly SelectionOption[];
}

interface ResolvedFrame {
  readonly frame: SelectionFrame | null;
  readonly draft: SelectionDraft | null;
}

/**
 * 一次执行前的可回溯选择会话。
 *
 * `answers` 只含已完成边界；当前边界保存在 draft。返回以前的边界时，原后缀暂存：
 * 答案不变则恢复，答案变化则丢弃并由 Plan 重新生成。
 */
export class SelectionSession {
  private entries: AnswerEntry[] = [];
  private frame: SelectionFrame | null = null;
  private draft: SelectionDraft | null = null;

  /** 回溯编辑前该边界的原答案；新边界为 null。 */
  private original: AnswerEntry | null = null;
  /** 回溯编辑时暂存的已完成后缀。 */
  private suffix: AnswerEntry[] = [];

  constructor(private readonly plan: SelectionPlan) {
    this.adopt(this.resolveNext([]));
  }

  /** Plan 完成后为 null；所有暴露的容器都是只读快照。 */
  get state(): SelectionControllerState | null {
    if (!this.frame) return null;
    return Object.freeze({
      frame: this.frame,
      answers: answersOf(this.entries),
      canBack: this.entries.length > 0,
    });
  }

  get completed(): boolean {
    return this.frame === null;
  }

  apply(command: SelectionCommand): void {
    if (!this.frame || !this.draft) {
      throw new Error('选择会话已经完成，不能再应用操作。');
    }

    switch (command.type) {
      case 'select':
        this.select(command.optionId);
        return;
      case 'unselect':
        this.unselect(command.optionId);
        return;
      case 'finish':
        this.finish();
        return;
      case 'back':
        this.back();
        return;
      default: {
        const unreachable: never = command;
        throw new Error(`未知选择操作：${String(unreachable)}`);
      }
    }
  }

  /** 只有 Plan 完成后才返回最终答案。 */
  result(): SelectionAnswers | null {
    return this.completed ? answersOf(this.entries) : null;
  }

  private select(optionId: string): void {
    const option = this.frame!.options.find(candidate => candidate.id === optionId);
    if (!option) {
      throw new Error(`选项“${optionId}”不在当前 Frame 的可选项中。`);
    }

    const selected = [...this.frame!.selected, option];
    this.adopt(this.resolveDraft(this.entries, {
      answerKey: this.frame!.answerKey,
      selected,
    }));
  }

  private unselect(optionId: string): void {
    const index = this.frame!.selected.findIndex(option => option.id === optionId);
    if (index < 0) {
      throw new Error(`选项“${optionId}”不在当前 Frame 的已选项中。`);
    }

    const selected = this.frame!.selected.filter((_, current) => current !== index);
    this.adopt(this.resolveDraft(this.entries, {
      answerKey: this.frame!.answerKey,
      selected,
    }));
  }

  private finish(): void {
    if (!this.frame!.canFinish) {
      throw new Error(`当前答案尚不能结束边界“${this.frame!.answerKey}”。`);
    }

    const current = createEntry(this.frame!.answerKey, this.frame!.selected);
    const unchanged = this.original !== null
      && sameOptionIds(this.original.selected, current.selected);

    // 未改变原答案时恢复暂存后缀；一旦改变，后缀全部失效。
    const entries = unchanged
      ? [...this.entries, current, ...this.suffix]
      : [...this.entries, current];
    const resolved = this.resolveNext(entries);

    this.entries = entries;
    this.original = null;
    this.suffix = [];
    this.adopt(resolved);
  }

  private back(): void {
    if (this.entries.length === 0) {
      throw new Error('当前已经是第一个回溯边界。');
    }

    const previous = this.entries[this.entries.length - 1];
    const entries = this.entries.slice(0, -1);

    // 若当前也在编辑历史答案，继续向前返回时保留它的原答案，而不是未完成草稿。
    const suffix = this.original
      ? [this.original, ...this.suffix]
      : [...this.suffix];
    const resolved = this.resolveDraft(entries, {
      answerKey: previous.answerKey,
      selected: previous.selected,
    });

    this.entries = entries;
    this.original = previous;
    this.suffix = suffix;
    this.adopt(resolved);
  }

  private resolveNext(entries: readonly AnswerEntry[]): ResolvedFrame {
    const answers = answersOf(entries);
    const raw = this.plan.getFrame(Object.freeze({ answers, draft: null }));
    if (raw === null) return { frame: null, draft: null };

    const frame = normalizeFrame(raw);
    if (Object.hasOwn(answers, frame.answerKey)) {
      throw new Error(`Plan 再次产生了已完成的 answerKey“${frame.answerKey}”。`);
    }
    return {
      frame,
      draft: createDraft(frame.answerKey, frame.selected),
    };
  }

  private resolveDraft(
    entries: readonly AnswerEntry[],
    input: SelectionDraft,
  ): ResolvedFrame {
    const answers = answersOf(entries);
    const draft = createDraft(input.answerKey, input.selected);
    const raw = this.plan.getFrame(Object.freeze({ answers, draft }));

    if (raw === null) {
      throw new Error(`边界“${draft.answerKey}”尚未 finish，Plan 不能结束。`);
    }

    const frame = normalizeFrame(raw);
    if (frame.answerKey !== draft.answerKey) {
      throw new Error(
        `边界“${draft.answerKey}”尚未 finish，Plan 却返回了“${frame.answerKey}”。`,
      );
    }
    return {
      frame,
      draft: createDraft(frame.answerKey, frame.selected),
    };
  }

  private adopt(resolved: ResolvedFrame): void {
    this.frame = resolved.frame;
    this.draft = resolved.draft;
  }
}

/** 用一个 Controller 驱动完整会话。 */
export async function runSelection(
  plan: SelectionPlan,
  controller: SelectionController,
): Promise<SelectionAnswers> {
  const session = new SelectionSession(plan);

  while (true) {
    const state = session.state;
    if (!state) break;
    const command = await controller.interact(state);
    session.apply(command);
  }

  return session.result()!;
}

/**
 * 创建按顺序返回预设操作的 Controller；函数条目可以读取当时的只读 Frame。
 * 脚本耗尽但会话仍未完成时抛错，避免测试静默悬挂。
 */
export function createScriptedSelectionController(
  script: readonly SelectionScriptEntry[],
): ScriptedSelectionController {
  const entries = [...script];
  let index = 0;

  return {
    get remaining(): number {
      return entries.length - index;
    },

    async interact(state: SelectionControllerState): Promise<SelectionCommand> {
      if (index >= entries.length) {
        throw new Error('scripted controller 的操作已经耗尽，但选择会话尚未完成。');
      }
      const entry = entries[index++];
      return typeof entry === 'function' ? await entry(state) : entry;
    },
  };
}

function normalizeFrame(frame: SelectionFrame): SelectionFrame {
  assertNonEmpty(frame.answerKey, 'answerKey');

  const selected = freezeOptions(frame.selected);
  const options = freezeOptions(frame.options);
  const ids = new Set<string>();

  for (const option of [...selected, ...options]) {
    assertNonEmpty(option.id, 'SelectionOption.id');
    if (ids.has(option.id)) {
      throw new Error(`Frame“${frame.answerKey}”包含重复选项 id“${option.id}”。`);
    }
    ids.add(option.id);
  }

  return Object.freeze({
    answerKey: frame.answerKey,
    prompt: frame.prompt,
    selected,
    options,
    canFinish: frame.canFinish,
  });
}

function createDraft(
  answerKey: string,
  selected: readonly SelectionOption[],
): SelectionDraft {
  return Object.freeze({
    answerKey,
    selected: freezeOptions(selected),
  });
}

function createEntry(
  answerKey: string,
  selected: readonly SelectionOption[],
): AnswerEntry {
  return Object.freeze({
    answerKey,
    selected: freezeOptions(selected),
  });
}

function answersOf(entries: readonly AnswerEntry[]): SelectionAnswers {
  const answers: Record<string, readonly SelectionOption[]> = Object.create(null);
  for (const entry of entries) {
    if (Object.hasOwn(answers, entry.answerKey)) {
      throw new Error(`答案路径包含重复 answerKey“${entry.answerKey}”。`);
    }
    answers[entry.answerKey] = entry.selected;
  }
  return Object.freeze(answers);
}

function freezeOptions(
  options: readonly SelectionOption[],
): readonly SelectionOption[] {
  return Object.freeze([...options]);
}

function sameOptionIds(
  left: readonly SelectionOption[],
  right: readonly SelectionOption[],
): boolean {
  return left.length === right.length
    && left.every((option, index) => option.id === right[index].id);
}

function assertNonEmpty(value: string, name: string): void {
  if (value.length === 0) throw new Error(`${name} 不能为空。`);
}
