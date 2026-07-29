// ============================================================
// 事件系统 — 发布订阅触发器注册表
// ============================================================

/** 触发器处理函数的参数类型（最小契约：有 type 和 data） */
type TriggerHandler = (
  event: { type: string; data: Record<string, unknown> },
) => Promise<void> | void;

export class TriggerSystem {
  private _handlers = new Map<string, TriggerHandler[]>();

  /** 注册一个触发器 */
  on(eventName: string, handler: TriggerHandler): void {
    const list = this._handlers.get(eventName);
    if (list) {
      list.push(handler);
    } else {
      this._handlers.set(eventName, [handler]);
    }
  }

  /** 注销一个触发器 */
  off(eventName: string, handler: TriggerHandler): void {
    const list = this._handlers.get(eventName);
    if (!list) return;
    const idx = list.indexOf(handler);
    if (idx >= 0) list.splice(idx, 1);
  }

  /** 触发事件（按注册顺序依次执行所有 handler） */
  async trigger(
    eventName: string,
    event: { type: string; data: Record<string, unknown> },
    depth?: number,
  ): Promise<void> {
    // debug log：缩进反映事件栈深度
    if (depth !== undefined) {
      const indent = '  '.repeat(Math.max(0, depth - 1));
      console.log(`${indent}[trigger] ${eventName}`);
    }
    const list = this._handlers.get(eventName);
    if (!list || list.length === 0) return;
    for (const handler of list) {
      await handler(event);
    }
  }
}

/** 全局单例 */
export const triggerSystem = new TriggerSystem();
