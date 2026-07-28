// ============================================================
// 事件系统 — 事件对象 & 事件栈
//
// GameEvent 维护自己的生命周期（created → executing → completed），
// 通过 execute() 方法执行 before → content → after 三段式流程。
// eventStack 与 GameEvent 放在同一模块以避免循环依赖。
// ============================================================

import { triggerSystem } from './TriggerSystem.js';

// ============================================================
// GameEvent
// ============================================================

type EventPhase = 'created' | 'executing' | 'completed';

// 不使用 extends 约束：严格模式下 interface 无隐式索引签名，不满足 Record<string, unknown>
export class GameEvent<T = Record<string, unknown>> {
  readonly type: string;
  data: T;
  private _phase: EventPhase = 'created';
  private _parent: GameEvent<any> | null;

  constructor(type: string, data: T) {
    this.type = type;
    this.data = data;
    // 构造时自动绑定当前事件栈顶为父事件
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
   * 执行事件：before triggers → content → after triggers。
   *
   * 只能在 created 阶段调用一次。重复调用抛出异常。
   * content 抛出异常时仍保证事件栈正确弹出、phase 标记为 completed。
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
      await triggerSystem.trigger(`${this.type}.before`, this as unknown as { type: string; data: Record<string, unknown> });
      await content(this);
      await triggerSystem.trigger(`${this.type}.after`, this as unknown as { type: string; data: Record<string, unknown> });
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
