// ============================================================
// 事件系统 — 事件对象 & 事件栈
//
// GameEvent 维护自己的生命周期（created → executing → completed），
// 通过 execute() 方法执行 before → content → after 三段式流程。
// prevent() 抛出 EventPreventError，沿事件栈向上传播，
// 直到被匹配的父事件 execute() 捕获。
// ============================================================

import { triggerSystem } from './TriggerSystem.js';
import type { Game } from '../game.js';

// ============================================================
// EventPreventError
// ============================================================

export class EventPreventError extends Error {
  constructor(public readonly event: GameEvent<any>) {
    super(`Event "${event.type}" was prevented`);
    this.name = 'EventPreventError';
  }
}

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
  private _prevented = false;

  constructor(type: string, data: T, game: Game) {
    this.type = type;
    this.data = data;
    this.game = game;
    this._parent = eventStack.top;
  }

  /** 当前生命周期阶段 */
  get phase(): EventPhase {
    return this._phase;
  }

  /** 父事件（构造时的事件栈顶） */
  get parent(): GameEvent | null {
    return this._parent;
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
   * @example
   * // 胜负判定中阻止游戏继续：
   * event.getParent('game')?.prevent();
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
   * 阻止当前事件继续执行。
   *
   * 只能在 executing 阶段调用（即 before trigger 或 content 中）。
   * 抛出 EventPreventError，向上传播直到被匹配事件的 execute() 捕获。
   * 捕获后该事件的 after trigger 被跳过，但父事件继续正常执行。
   */
  prevent(): void {
    if (this._phase !== 'executing') {
      throw new Error(
        `Cannot prevent event "${this.type}" in ${this._phase} phase — ` +
        `prevent() can only be called during execution.`,
      );
    }
    this._prevented = true;
    throw new EventPreventError(this);
  }

  /** 查询事件是否被 prevent 过 */
  isPrevented(): boolean {
    return this._prevented;
  }

  /**
   * 执行事件：before triggers → content → after triggers。
   *
   * 只能在 created 阶段调用一次。重复调用抛出异常。
   * 如果本事件被 prevent()，after trigger 被跳过，但父事件继续。
   * 如果父事件被 prevent()，异常继续向上传播。
   * content 抛出一般异常时仍保证事件栈正确弹出。
   */
  async execute(content: (event: this) => Promise<void>): Promise<this> {
    if (this._phase !== 'created') {
      throw new Error(
        `Event "${this.type}" has already been ${this._phase} and cannot be executed again.`,
      );
    }

    this._phase = 'executing';
    eventStack.push(this);

    try {
      await triggerSystem.trigger(`${this.type}.before`, this);
      await content(this);
      await triggerSystem.trigger(`${this.type}.after`, this);
    } catch (e) {
      if (e instanceof EventPreventError && e.event === this) {
        // 本事件被 prevent — after 跳过，父事件不受影响
      } else {
        // 父事件被 prevent 或普通异常 — 继续向上抛
        throw e;
      }
    } finally {
      eventStack.pop();
      this._phase = 'completed';
    }

    return this;
  }
}

// ============================================================
// EventStack — 模块级单例
// ============================================================

const _stack: GameEvent<any>[] = [];

export const eventStack = {
  /** 当前栈顶事件（无事件时为 null） */
  get top(): GameEvent<any> | null {
    return _stack.length > 0 ? _stack[_stack.length - 1] : null;
  },

  push(event: GameEvent<any>): void {
    _stack.push(event);
  },

  pop(): GameEvent<any> {
    return _stack.pop()!;
  },

  /** 当前事件栈深度 */
  get depth(): number {
    return _stack.length;
  },
};
