// ============================================================
// 事件系统 — 事件对象 & 事件栈
//
// GameEvent 维护自己的生命周期（created → executing → completed），
// 通过 execute() 方法执行 before → content → after 三段式流程。
// execute 默认自动触发 before/after；需要自己编排触发时机的事件可传
// { triggers: false }，此时 content 自行调用 game.triggerSystem.trigger（如 judge）。
// "打断整局"这类需要中断完全部调用栈的语义（如游戏结束）改由 GameOverError
// 抛到入口统一捕获，不在此事件系统里处理。
// ============================================================

import type { Game } from '../game.js';

// ============================================================
// GameEvent
// ============================================================

type EventPhase = 'created' | 'executing' | 'completed';

// 不使用 extends 约束：严格模式下 interface 无隐式索引签名，不满足 Record<string, unknown>
export class GameEvent<T = Record<string, unknown>> {
  readonly type: string;
  data: T;
  /** 所属对局（trigger handler / content 访问对局上下文用） */
  readonly game: Game;
  private _phase: EventPhase = 'created';
  private _parent: GameEvent<any> | null;
  /** 全局递增 id（== game.history 下标）；execute 入史时赋值，未执行前为 -1 */
  private _id = -1;
  /** 子树跨度终点（FreeKill end_id 等价物）；finally 定稿，叶子事件 == id */
  private _endId?: number;

  constructor(type: string, data: T, game: Game) {
    this.type = type;
    this.data = data;
    this.game = game;
    this._parent = game.eventStack.top;
  }

  /** 当前生命周期阶段 */
  get phase(): EventPhase {
    return this._phase;
  }

  /** 父事件（构造时的事件栈顶） */
  get parent(): GameEvent | null {
    return this._parent;
  }

  /** 全局递增 id（== game.history 下标；execute 入史时赋值，未执行前为 -1） */
  get id(): number {
    return this._id;
  }

  /** 子树跨度终点（end_id；finally 定稿，叶子事件 == id）；事件完成前为 undefined */
  get endId(): number | undefined {
    return this._endId;
  }

  /**
   * 按事件名向上查找父事件。
   *
   * 不关心中间隔了几层，只关心"最近的那个同名父事件是谁"。
   * 如果当前事件不是任何同名事件的子事件，返回 null。
   *
   * @example
   * // 古锭刀在 damage.before 中：
   * const useCard = event.getParent('useCard');
   * if (useCard?.data.card.name === '杀' && event.data.target.hand.length === 0) {
   *   // 加伤
   * }
   *
   */
  getParent(name: string): GameEvent<any> | null {
    let p = this._parent;
    while (p) {
      if (p.type === name) return p;
      p = p._parent;
    }
    return null;
  }

  /**
   * 执行事件：入史赋 id → before triggers → content → after triggers，
   * finally 中 clear → 定稿 endId → 弹栈（演进 2.2/2.4）。
   *
   * 只能在 created 阶段调用一次。重复调用抛出异常。
   * content/clear 抛出异常时仍保证 endId 定稿、事件栈正确弹出，异常向上传播。
   * @param opts.triggers 默认 true：自动触发 before/after；设 false 后由 content 自己触发。
   * @param opts.clear 事件级收尾钩子：无论正常/被取消/content 抛错/GameOver 解卷都执行；
   *   执行时机 = finally 内、定稿 endId 与弹栈之前（FreeKill clear 同款顺序）。
   */
  async execute(
    content: (event: this) => Promise<void>,
    opts?: { triggers?: boolean; clear?: (event: GameEvent<T>) => void | Promise<void> },
  ): Promise<this> {
    if (this._phase !== 'created') {
      throw new Error(
        `Event "${this.type}" has already been ${this._phase} and cannot be executed again.`,
      );
    }

    // 因果上下文 == 执行上下文：禁止延迟执行。
    // parent 在构造时绑定（栈顶），若执行时栈顶不同，说明事件在别的上下文
    // 中被创建——父链会绑定到错误的因果来源，getParent 查询将返回错误结果。
    if (this._parent !== this.game.eventStack.top) {
      throw new Error(
        `Event "${this.type}" was constructed in a different context than executed — ` +
        `captured parent: "${this._parent?.type ?? 'null'}", current stack top: ` +
        `"${this.game.eventStack.top?.type ?? 'null'}". ` +
        `Events must be created and executed in the same stack context.`,
      );
    }

    this._phase = 'executing';
    this.game.eventStack.push(this);
    // 入史：append 顺序 == id 顺序（id 赋为入史前的 history 长度；严格栈纪律保证
    // 子树在数组中连续，是时间戳法 end_id 正确性的前提——见 演进与避坑 2.2 红线）。
    this._id = this.game.history.length;
    this.game.history.push(this);
    const runTriggers = opts?.triggers !== false;

    try {
      if (runTriggers) await this.game.triggerSystem.trigger(`${this.type}.before`, this);
      await content(this);
      if (runTriggers) await this.game.triggerSystem.trigger(`${this.type}.after`, this);
    } finally {
      try {
        await opts?.clear?.(this);
      } finally {
        // 定稿 end_id：此时 history 尾 = 本事件子树的最后一个后代（栈纪律保证），叶子 = 自己
        this._endId = this.game.history.length - 1;
        this.game.eventStack.pop();
        this._phase = 'completed';
      }
    }

    return this;
  }
}

// ============================================================
// EventStack — 事件执行栈（随局创建，挂在 Game.eventStack 上）
// ============================================================

export interface EventStack {
  /** 当前栈顶事件（无事件时为 null） */
  readonly top: GameEvent<any> | null;
  push(event: GameEvent<any>): void;
  pop(): GameEvent<any>;
  /** 当前事件栈深度 */
  readonly depth: number;
}

export function createEventStack(): EventStack {
  const stack: GameEvent<any>[] = [];
  return {
    get top(): GameEvent<any> | null {
      return stack.length > 0 ? stack[stack.length - 1] : null;
    },
    push(event: GameEvent<any>): void {
      stack.push(event);
    },
    pop(): GameEvent<any> {
      return stack.pop()!;
    },
    get depth(): number {
      return stack.length;
    },
  };
}
