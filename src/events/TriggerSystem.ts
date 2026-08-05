// ============================================================
// 事件系统 — 发布订阅触发器注册表
// ============================================================

import type { GameEvent } from './GameEvent.js';

/** 触发器处理函数：接收完整 GameEvent（可访问 type/data/game/getParent） */
type TriggerHandler = (event: GameEvent<any>) => Promise<void> | void;

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

  /** 清空所有 handler（测试隔离用） */
  clear(): void {
    this._handlers.clear();
  }

  /** 触发事件（按注册顺序依次执行所有 handler） */
  async trigger(eventName: string, event: GameEvent<any>): Promise<void> {
    console.log(`⚡[trigger] ${eventName}`);
    const list = this._handlers.get(eventName);
    if (!list || list.length === 0) return;
    for (const handler of list) {
      await handler(event);
    }
  }
}
