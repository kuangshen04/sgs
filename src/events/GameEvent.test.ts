// ============================================================
// 事件系统 — GameEvent 单元测试
// 生命周期 / before→content→after / cancel 语义 / 事件栈
// ============================================================

import { describe, it, expect } from 'vitest';

import {
  GameEvent,
  createEventStack,
  TriggerSystem,
} from './index.js';
import type { Game } from '../game.js';

/** 最小可用的 Game 假对象：GameEvent 依赖 eventStack 与 triggerSystem */
function makeGame(): Game {
  return {
    eventStack: createEventStack(),
    triggerSystem: new TriggerSystem(),
  } as unknown as Game;
}

// ============================================================
// 生命周期
// ============================================================

describe('GameEvent 生命周期', () => {
  it('created → executing → completed', async () => {
    const game = makeGame();
    const phases: string[] = [];
    const event = new GameEvent('test', {}, game);
    expect(event.phase).toBe('created');

    await event.execute(async (e) => {
      phases.push(e.phase);
      expect(e.phase).toBe('executing');
    });

    expect(event.phase).toBe('completed');
    expect(phases).toEqual(['executing']);
  });

  it('已执行的事件不能再次执行', async () => {
    const game = makeGame();
    const event = new GameEvent('test', {}, game);
    await event.execute(async () => {});

    await expect(event.execute(async () => {})).rejects.toThrow(/already been completed/);
  });

  it('事件栈在 execute 前后正确入栈出栈', async () => {
    const game = makeGame();
    const event = new GameEvent('test', {}, game);
    expect(game.eventStack.top).toBeNull();

    await event.execute(async () => {
      expect(game.eventStack.top).toBe(event);
      expect(game.eventStack.depth).toBe(1);
    });

    expect(game.eventStack.top).toBeNull();
    expect(game.eventStack.depth).toBe(0);
  });

  it('在事件上下文外构造、上下文内执行 → 抛错（禁止延迟执行）', async () => {
    const game = makeGame();
    const deferred = new GameEvent('deferred', {}, game); // 构造时栈顶为 null

    const parent = new GameEvent('parent', {}, game);
    await expect(parent.execute(async () => {
      await deferred.execute(async () => {}); // 执行时栈顶是 parent ≠ null
    })).rejects.toThrow(/constructed in a different context/);
  });

  it('在父事件中构造、父事件结束后执行 → 抛错（禁止延迟执行）', async () => {
    const game = makeGame();
    let deferred: GameEvent | null = null;

    const parent = new GameEvent('parent', {}, game);
    await parent.execute(async () => {
      deferred = new GameEvent('deferred', {}, game); // 构造时 parent 在栈顶
    });

    // 此时栈顶已回到 null，父链与执行上下文不匹配
    await expect(deferred!.execute(async () => {})).rejects.toThrow(/constructed in a different context/);
  });
});

// ============================================================
// before → content → after 三段式
// ============================================================

describe('before → content → after', () => {
  it('按 before → content → after 顺序执行', async () => {
    const game = makeGame();
    const order: string[] = [];
    game.triggerSystem.on('test.before', () => { order.push('before'); });
    game.triggerSystem.on('test.after', () => { order.push('after'); });

    await new GameEvent('test', {}, game).execute(async () => {
      order.push('content');
    });

    expect(order).toEqual(['before', 'content', 'after']);
  });

  it('多个 handler 按注册顺序执行', async () => {
    const game = makeGame();
    const order: string[] = [];
    game.triggerSystem.on('test.before', () => { order.push('h1'); });
    game.triggerSystem.on('test.before', () => { order.push('h2'); });

    await new GameEvent('test', {}, game).execute(async () => {});

    expect(order).toEqual(['h1', 'h2']);
  });

  it('before handler 可以修改 event.data（当前过渡方案）', async () => {
    const game = makeGame();
    let seen = 0;
    game.triggerSystem.on('test.before', (e) => {
      e.data.amount += 1;
    });

    await new GameEvent<{ amount: number }>('test', { amount: 1 }, game).execute(async (e) => {
      seen = e.data.amount;
    });

    expect(seen).toBe(2);
  });
});

// ============================================================
// execute 的 triggers 开关
// ============================================================

describe('execute triggers 开关', () => {
  it('默认自动触发 before / content / after', async () => {
    const game = makeGame();
    const executed: string[] = [];
    game.triggerSystem.on('test.before', () => { executed.push('before'); });
    game.triggerSystem.on('test.after', () => { executed.push('after'); });

    const event = new GameEvent('test', {}, game);
    await event.execute(async () => {
      executed.push('content');
    });

    expect(executed).toEqual(['before', 'content', 'after']);
  });

  it('triggers:false → 不自动触发 before/after，仅执行 content', async () => {
    const game = makeGame();
    const executed: string[] = [];
    game.triggerSystem.on('test.before', () => { executed.push('before'); });
    game.triggerSystem.on('test.after', () => { executed.push('after'); });

    const event = new GameEvent('test', {}, game);
    await event.execute(async () => {
      executed.push('content');
    }, { triggers: false });

    expect(executed).toEqual(['content']);
  });

  it('triggers:false 时 content 可自行触发 trigger', async () => {
    const game = makeGame();
    const executed: string[] = [];
    game.triggerSystem.on('test.before', () => { executed.push('before'); });
    game.triggerSystem.on('test.after', () => { executed.push('after'); });

    const event = new GameEvent('test', {}, game);
    await event.execute(async (e) => {
      await game.triggerSystem.trigger('test.before', e);
      executed.push('content');
      await game.triggerSystem.trigger('test.after', e);
    }, { triggers: false });

    expect(executed).toEqual(['before', 'content', 'after']);
  });

  it('execute 返回值仍是该事件本身', async () => {
    const game = makeGame();
    const event = new GameEvent('test', {}, game);
    await expect(event.execute(async () => {})).resolves.toBe(event);
  });
});

// ============================================================
// 父事件查找 getParent
// ============================================================

describe('getParent', () => {
  it('跨层返回最近的同名父事件', async () => {
    const game = makeGame();
    const grandpa = new GameEvent('grandpa', {}, game);
    let found: GameEvent | null = null;

    await grandpa.execute(async () => {
      const child = new GameEvent('child', {}, game);
      await child.execute(async () => {
        const grandchild = new GameEvent('grandchild', {}, game);
        await grandchild.execute(async () => {
          found = grandchild.getParent('grandpa');
        });
      });
    });

    expect(found).toBe(grandpa);
  });

  it('没有同名父事件 → 返回 null', async () => {
    const game = makeGame();
    const parent = new GameEvent('parent', {}, game);
    let found: GameEvent | null = null;

    await parent.execute(async () => {
      const child = new GameEvent('child', {}, game);
      await child.execute(async () => {
        found = child.getParent('不存在');
      });
    });

    expect(found).toBeNull();
  });

  it('parent 在构造时绑定当前事件栈顶', async () => {
    const game = makeGame();
    const parent = new GameEvent('parent', {}, game);
    let childParent: GameEvent | null = null;

    await parent.execute(async () => {
      const child = new GameEvent('child', {}, game);
      childParent = child.parent;
      expect(game.eventStack.depth).toBe(1); // 构造只读栈顶，不压栈
      await child.execute(async () => {
        expect(game.eventStack.depth).toBe(2); // 执行时才压栈
      });
    });

    expect(childParent).toBe(parent);
  });
});

// ============================================================
// 异常处理
// ============================================================

describe('异常处理', () => {
  it('content 抛普通异常 → 向外传播，事件栈仍正确弹出', async () => {
    const game = makeGame();
    const event = new GameEvent('test', {}, game);

    await expect(event.execute(async () => {
      throw new Error('boom');
    })).rejects.toThrow('boom');

    expect(game.eventStack.top).toBeNull();
    expect(game.eventStack.depth).toBe(0);
    expect(event.phase).toBe('completed');
  });

  it('子事件普通异常向上传播，父 after 跳过', async () => {
    const game = makeGame();
    const executed: string[] = [];
    game.triggerSystem.on('parent.after', () => { executed.push('parent.after'); });

    const parent = new GameEvent('parent', {}, game);
    await expect(parent.execute(async () => {
      const child = new GameEvent('child', {}, game);
      await child.execute(async () => {
        throw new Error('boom');
      });
    })).rejects.toThrow('boom');

    expect(executed).toEqual([]);
  });
});

// ============================================================
// TriggerSystem — 发布订阅注册表
// ============================================================

describe('TriggerSystem', () => {
  it('on/off 注册与注销', async () => {
    const game = makeGame();
    const calls: string[] = [];
    const handler = () => { calls.push('h'); };
    game.triggerSystem.on('test.before', handler);

    await new GameEvent('test', {}, game).execute(async () => {});
    expect(calls).toEqual(['h']);

    game.triggerSystem.off('test.before', handler);
    await new GameEvent('test', {}, game).execute(async () => {});
    expect(calls).toEqual(['h']); // 注销后不再触发
  });

  it('clear 清空所有 handler', async () => {
    const game = makeGame();
    const calls: string[] = [];
    game.triggerSystem.on('test.before', () => { calls.push('x'); });
    game.triggerSystem.clear();

    await new GameEvent('test', {}, game).execute(async () => {});

    expect(calls).toEqual([]);
  });
});
