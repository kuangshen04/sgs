import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  createEventRuntime,
  defineEvent,
  type Event,
} from './event.js';

const TestEvent = defineEvent('test').withData<{ amount: number }>();
const Test = TestEvent.kind;

describe('Event Kind 与 HookPoint', () => {
  it('Kind 是不可变身份，HookPoint 是 Kind + timing', () => {
    expect(Object.isFrozen(Test)).toBe(true);
    expect(Object.isFrozen(Test.before)).toBe(true);
    expect(Test.before).toMatchObject({ kind: Test, timing: 'before' });
    expect(Test.after).toMatchObject({ kind: Test, timing: 'after' });
  });

  it('Event 以 Kind 为泛型并由 Kind 推导 data 类型', () => {
    expectTypeOf<Event<typeof Test>['data']>().toEqualTypeOf<{ amount: number }>();

    const SameDataEvent = defineEvent('same-data').withData<{ amount: number }>();
    expectTypeOf<typeof Test>().not.toEqualTypeOf<typeof SameDataEvent.kind>();
    expect(Test).not.toBe(SameDataEvent.kind);
  });

  it('EventRuntime 不暴露任意执行入口', () => {
    const runtime = createEventRuntime();
    expect('run' in runtime).toBe(false);
  });
});

describe('自动事件 scope', () => {
  it('按 before → content → after 执行，并允许修改 data', async () => {
    const runtime = createEventRuntime();
    const order: string[] = [];

    runtime.on(Test.before, event => {
      order.push('before');
      event.data.amount += 1;
    });
    runtime.on(Test.after, () => {
      order.push('after');
    });

    const event = await TestEvent.run(runtime, { amount: 1 }, current => {
      order.push('content');
      expect(current.phase).toBe('running');
      expect(current.data.amount).toBe(2);
      expect(runtime.current).toBe(current);
    });

    expect(order).toEqual(['before', 'content', 'after']);
    expect(event.phase).toBe('completed');
    expect(runtime.current).toBeNull();
  });

  it('底层 handler 按注册顺序串行执行', async () => {
    const runtime = createEventRuntime();
    const order: string[] = [];
    runtime.on(Test.before, async () => { order.push('first'); });
    runtime.on(Test.before, async () => { order.push('second'); });

    await TestEvent.run(runtime, { amount: 1 }, async () => {});

    expect(order).toEqual(['first', 'second']);
  });

  it('派发 hook 不创建子事件', async () => {
    const runtime = createEventRuntime();
    runtime.on(Test.before, event => {
      expect(runtime.current).toBe(event);
      expect(runtime.history).toEqual([event]);
    });

    const event = await TestEvent.run(runtime, { amount: 1 }, async () => {});
    expect(runtime.history).toEqual([event]);
    expect(event.endId).toBe(event.id);
  });
});

describe('手动 hook', () => {
  it('允许行为所有者在当前 scope 内自行安排 before 和 after', async () => {
    const runtime = createEventRuntime();
    const order: string[] = [];
    runtime.on(Test.before, () => { order.push('before'); });
    runtime.on(Test.after, () => { order.push('after'); });

    await TestEvent.run(runtime, { amount: 1 }, async event => {
      await event.emit('before');
      order.push('content');
      await event.emit('after');
    }, { hooks: 'manual' });

    expect(order).toEqual(['before', 'content', 'after']);
  });

  it('自动事件不允许手动派发 hook', async () => {
    const runtime = createEventRuntime();

    await expect(TestEvent.run(runtime, { amount: 1 }, event => (
      event.emit('before')
    ))).rejects.toThrow(/使用自动 hook/);
  });
});

describe('因果栈与历史', () => {
  const ParentEvent = defineEvent('parent').withData<{ label: string }>();
  const Parent = ParentEvent.kind;
  const ChildEvent = defineEvent('child').withData<{ label: string }>();
  const Child = ChildEvent.kind;

  it('在运行时绑定 parent，并为连续子树记录时间戳', async () => {
    const runtime = createEventRuntime();
    let child: Event<typeof Child> | null = null;

    const parent = await ParentEvent.run(runtime, { label: 'p' }, async parentEvent => {
      expect(parentEvent.id).toBe(0);
      child = await ChildEvent.run(runtime, { label: 'c' }, async childEvent => {
        expect(childEvent.id).toBe(1);
        expect(childEvent.parent).toBe(parentEvent);
        expect(childEvent.getParent(Parent)).toBe(parentEvent);
        expect(childEvent.getParent(Test)).toBeNull();
        expect(childEvent.endId).toBeUndefined();
      });
      expect(child!.endId).toBe(1);
    });

    expect(parent.endId).toBe(1);
    expect(runtime.history).toEqual([parent, child]);
  });

  it('返回边界之后最早命中的事件', async () => {
    const runtime = createEventRuntime();
    const boundary = await ParentEvent.run(runtime, { label: 'boundary' }, async () => {});
    const first = await ChildEvent.run(runtime, { label: 'first' }, async () => {});
    await ChildEvent.run(runtime, { label: 'second' }, async () => {});

    expect(runtime.findSince(boundary, event => event.kind === Child)).toBe(first);
    expect(runtime.findSince(null, event => event === boundary)).toBe(boundary);
  });

  it('拒绝属于另一个 EventRuntime 的边界事件', async () => {
    const left = createEventRuntime();
    const right = createEventRuntime();
    const boundary = await ParentEvent.run(left, { label: 'left' }, async () => {});

    expect(() => right.findSince(boundary, () => true)).toThrow(/另一个 EventRuntime/);
  });
});

describe('收尾与异常完成', () => {
  it('先执行所有者 clear，再执行动态登记的 clear hook', async () => {
    const runtime = createEventRuntime();
    const order: string[] = [];

    const event = await TestEvent.run(runtime, { amount: 1 }, current => {
      current.onClear(() => { order.push('hook-1'); });
      current.onClear(() => { order.push('hook-2'); });
      order.push('content');
    }, {
      clear: current => {
        order.push('owner-clear');
        expect(current.endId).toBeUndefined();
        expect(runtime.current).toBe(current);
      },
    });

    expect(order).toEqual(['content', 'owner-clear', 'hook-1', 'hook-2']);
    expect(event.endId).toBe(event.id);
  });

  it('content 异常在完成收尾和结构恢复后向外传播', async () => {
    const runtime = createEventRuntime();
    const order: string[] = [];
    let captured: Event<typeof Test> | null = null;

    await expect(TestEvent.run(runtime, { amount: 1 }, event => {
      captured = event;
      event.onClear(() => { order.push('hook'); });
      throw new Error('boom');
    }, {
      clear: () => { order.push('owner-clear'); },
    })).rejects.toThrow('boom');

    expect(order).toEqual(['owner-clear', 'hook']);
    expect(captured!.phase).toBe('completed');
    expect(captured!.endId).toBe(captured!.id);
    expect(runtime.current).toBeNull();
  });

  it('clear 异常仍会完成 scope', async () => {
    const runtime = createEventRuntime();
    let captured: Event<typeof Test> | null = null;

    await expect(TestEvent.run(runtime, { amount: 1 }, event => {
      captured = event;
    }, {
      clear: () => { throw new Error('clear boom'); },
    })).rejects.toThrow('clear boom');

    expect(captured!.phase).toBe('completed');
    expect(captured!.endId).toBe(captured!.id);
    expect(runtime.current).toBeNull();
  });

  it('事件完成后不能再登记收尾', async () => {
    const runtime = createEventRuntime();
    const event = await TestEvent.run(runtime, { amount: 1 }, async () => {});
    expect(() => event.onClear(() => {})).toThrow(/已经完成/);
  });

  it('子事件抛错时按子到父的顺序解卷收尾', async () => {
    const runtime = createEventRuntime();
    const order: string[] = [];
    const ParentEvent = defineEvent('error-parent').withData<Record<string, never>>();
    const ChildEvent = defineEvent('error-child').withData<Record<string, never>>();
    let parent: Event<typeof ParentEvent.kind> | null = null;
    let child: Event<typeof ChildEvent.kind> | null = null;

    await expect(ParentEvent.run(runtime, {}, async parentEvent => {
      parent = parentEvent;
      await ChildEvent.run(runtime, {}, async childEvent => {
        child = childEvent;
        throw new Error('child boom');
      }, { clear: () => { order.push('child'); } });
    }, { clear: () => { order.push('parent'); } })).rejects.toThrow('child boom');

    expect(order).toEqual(['child', 'parent']);
    expect(child!.phase).toBe('completed');
    expect(parent!.phase).toBe('completed');
    expect(parent!.endId).toBe(child!.id);
    expect(runtime.current).toBeNull();
  });
});

describe('订阅与逐局隔离', () => {
  it('返回精确且幂等的 disposer', async () => {
    const runtime = createEventRuntime();
    let calls = 0;
    const handler = () => { calls += 1; };
    const disposeFirst = runtime.on(Test.before, handler);
    runtime.on(Test.before, handler);

    disposeFirst();
    disposeFirst();
    await TestEvent.run(runtime, { amount: 1 }, async () => {});

    expect(calls).toBe(1);
  });

  it('不同 EventRuntime 的订阅和历史互相隔离', async () => {
    const left = createEventRuntime();
    const right = createEventRuntime();
    let calls = 0;
    left.on(Test.before, () => { calls += 1; });

    const leftEvent = await TestEvent.run(left, { amount: 1 }, async () => {});
    const rightEvent = await TestEvent.run(right, { amount: 2 }, async () => {});

    expect(calls).toBe(1);
    expect(left.history).toEqual([leftEvent]);
    expect(right.history).toEqual([rightEvent]);
    expect(leftEvent.id).toBe(0);
    expect(rightEvent.id).toBe(0);
  });
});
