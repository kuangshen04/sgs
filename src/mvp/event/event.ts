/**
 * MVP Event 模块（R001）。
 *
 * Event 只拥有 scope、hook、严格事件栈和历史；业务 Kind 及其 data 跟随定义它的业务模块。
 */

const eventData: unique symbol = Symbol('event.data');
const executeEvent: unique symbol = Symbol('event.execute');

export type EventTiming = 'before' | 'after';
export type EventPhase = 'running' | 'completed';

export interface EventKind<Name extends string = string, Data = unknown> {
  readonly name: Name;
  readonly before: EventHookPoint<this, 'before'>;
  readonly after: EventHookPoint<this, 'after'>;
  /** 仅用于类型推导的 Kind → Data 关联，运行时没有业务含义。 */
  readonly [eventData]?: (data: Data) => Data;
}

export type AnyEventKind = EventKind<string, any>;

export type DataOf<K extends AnyEventKind> =
  K extends EventKind<string, infer Data> ? Data : never;

export interface EventHookPoint<
  K extends AnyEventKind,
  T extends EventTiming = EventTiming,
> {
  readonly kind: K;
  readonly timing: T;
}

export type EventHandler<K extends AnyEventKind> =
  (event: Event<K>) => void | Promise<void>;

export type EventClear<K extends AnyEventKind> =
  (event: Event<K>) => void | Promise<void>;

export interface Event<K extends AnyEventKind> {
  readonly kind: K;
  /** data 引用保持稳定；handler 可以修改具体业务事件声明的字段。 */
  readonly data: DataOf<K>;
  readonly id: number;
  readonly endId: number | undefined;
  readonly parent: AnyEvent | null;
  readonly phase: EventPhase;

  getParent<P extends AnyEventKind>(kind: P): Event<P> | null;
  onClear(clear: EventClear<K>): void;

  /** 仅在事件以 `{ hooks: 'manual' }` 运行时可用。 */
  emit(timing: EventTiming): Promise<void>;
}

export type AnyEvent = Event<AnyEventKind>;

export interface RunEventOptions<K extends AnyEventKind> {
  /** 默认 `auto`（`before → content → after`）。 */
  hooks?: 'auto' | 'manual';
  /** 行为所有者的收尾；先于通过 `event.onClear` 登记的收尾执行。 */
  clear?: EventClear<K>;
}

export interface DefinedEvent<K extends AnyEventKind> {
  /** 公开观察能力；业务模块导出 Kind，不导出所有者句柄。 */
  readonly kind: K;

  /** 仅供行为所有者使用的执行能力；DefinedEvent 应留在所属业务模块内部。 */
  run(
    runtime: EventRuntime,
    data: DataOf<K>,
    content: (event: Event<K>) => void | Promise<void>,
    options?: RunEventOptions<K>,
  ): Promise<Event<K>>;
}

export interface EventRuntime {
  readonly current: AnyEvent | null;
  readonly history: readonly AnyEvent[];

  on<K extends AnyEventKind, T extends EventTiming>(
    point: EventHookPoint<K, T>,
    handler: EventHandler<K>,
  ): () => void;

  /** 在 `(boundary.id, 当前]` 中返回最早命中的事件。 */
  findSince(
    boundary: AnyEvent | null,
    predicate: (event: AnyEvent) => boolean,
  ): AnyEvent | null;
}

interface InternalEventRuntime extends EventRuntime {
  [executeEvent]<K extends AnyEventKind>(
    kind: K,
    data: DataOf<K>,
    content: (event: Event<K>) => void | Promise<void>,
    options?: RunEventOptions<K>,
  ): Promise<Event<K>>;
}

interface HandlerEntry {
  active: boolean;
  readonly handler: EventHandler<any>;
}

interface HandlerBucket {
  before: HandlerEntry[];
  after: HandlerEntry[];
}

interface EventBuilder<Name extends string> {
  withData<Data>(): DefinedEvent<EventKind<Name, Data>>;
}

/**
 * 定义一个业务事件 Kind。返回的所有者句柄持有该 Kind 的正常执行能力；
 * 对观察者只导出 `handle.kind`。
 */
export function defineEvent<const Name extends string>(name: Name): EventBuilder<Name> {
  return {
    withData<Data>(): DefinedEvent<EventKind<Name, Data>> {
      const kind = createKind<Name, Data>(name);
      return Object.freeze({
        kind,
        run(
          runtime: EventRuntime,
          data: DataOf<typeof kind>,
          content: (event: Event<typeof kind>) => void | Promise<void>,
          options?: RunEventOptions<typeof kind>,
        ): Promise<Event<typeof kind>> {
          const executor = (runtime as Partial<InternalEventRuntime>)[executeEvent];
          if (!executor) {
            throw new Error('传入的 EventRuntime 不是由 createEventRuntime() 创建的。');
          }
          return executor(kind, data, content, options);
        },
      });
    },
  };
}

/** 创建逐局隔离的 Event 运行时。 */
export function createEventRuntime(): EventRuntime {
  const stack: AnyEvent[] = [];
  const history: AnyEvent[] = [];
  const subscriptions = new Map<AnyEventKind, HandlerBucket>();

  let api: InternalEventRuntime;

  const dispatch = async <K extends AnyEventKind>(
    point: EventHookPoint<K>,
    event: Event<K>,
  ): Promise<void> => {
    const entries = subscriptions.get(point.kind)?.[point.timing];
    if (!entries || entries.length === 0) return;

    // 派发期间新注册的 handler 从下次派发起生效；尚未执行便被注销的 handler 会被跳过。
    for (const entry of [...entries]) {
      if (entry.active) await entry.handler(event);
    }
  };

  api = {
    get current(): AnyEvent | null {
      return stack.length > 0 ? stack[stack.length - 1] : null;
    },

    get history(): readonly AnyEvent[] {
      return history;
    },

    on<K extends AnyEventKind, T extends EventTiming>(
      point: EventHookPoint<K, T>,
      handler: EventHandler<K>,
    ): () => void {
      let bucket = subscriptions.get(point.kind);
      if (!bucket) {
        bucket = { before: [], after: [] };
        subscriptions.set(point.kind, bucket);
      }

      const entry: HandlerEntry = { active: true, handler };
      bucket[point.timing].push(entry);

      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        entry.active = false;
        const index = bucket![point.timing].indexOf(entry);
        if (index >= 0) bucket![point.timing].splice(index, 1);
      };
    },

    findSince(
      boundary: AnyEvent | null,
      predicate: (event: AnyEvent) => boolean,
    ): AnyEvent | null {
      if (boundary && history[boundary.id] !== boundary) {
        throw new Error('历史边界事件属于另一个 EventRuntime。');
      }
      const from = boundary ? boundary.id + 1 : 0;
      for (let index = from; index < history.length; index++) {
        if (predicate(history[index])) return history[index];
      }
      return null;
    },

    async [executeEvent]<K extends AnyEventKind>(
      kind: K,
      data: DataOf<K>,
      content: (event: Event<K>) => void | Promise<void>,
      options?: RunEventOptions<K>,
    ): Promise<Event<K>> {
      const parent = api.current;
      const event = new EventRecord(
        kind,
        data,
        history.length,
        parent,
        options?.hooks ?? 'auto',
        () => api.current,
        dispatch,
      );

      stack.push(event as AnyEvent);
      history.push(event as AnyEvent);

      try {
        if (event.hookMode === 'auto') await dispatch(kind.before, event);
        await content(event);
        if (event.hookMode === 'auto') await dispatch(kind.after, event);
      } finally {
        try {
          await options?.clear?.(event);
          await event.runClearHooks();
        } finally {
          event.complete(history.length - 1);
          const popped = stack.pop();
          if (popped !== event) {
            stack.length = 0;
            throw new Error('事件栈纪律被破坏。');
          }
        }
      }

      return event;
    },
  };

  return api;
}

class EventRecord<K extends AnyEventKind> implements Event<K> {
  private readonly clearHooks: EventClear<K>[] = [];
  private _phase: EventPhase = 'running';
  private _endId: number | undefined;

  constructor(
    readonly kind: K,
    readonly data: DataOf<K>,
    readonly id: number,
    readonly parent: AnyEvent | null,
    readonly hookMode: 'auto' | 'manual',
    private readonly getCurrent: () => AnyEvent | null,
    private readonly dispatch: <P extends AnyEventKind>(
      point: EventHookPoint<P>,
      event: Event<P>,
    ) => Promise<void>,
  ) {}

  get phase(): EventPhase {
    return this._phase;
  }

  get endId(): number | undefined {
    return this._endId;
  }

  getParent<P extends AnyEventKind>(kind: P): Event<P> | null {
    let event = this.parent;
    while (event) {
      if (event.kind === kind) return event as Event<P>;
      event = event.parent;
    }
    return null;
  }

  onClear(clear: EventClear<K>): void {
    if (this._phase !== 'running') {
      throw new Error(`事件“${this.kind.name}”已经完成，不能再登记收尾。`);
    }
    this.clearHooks.push(clear);
  }

  async emit(timing: EventTiming): Promise<void> {
    if (this._phase !== 'running') {
      throw new Error(`事件“${this.kind.name}”已经完成，不能再派发 hook。`);
    }
    if (this.hookMode !== 'manual') {
      throw new Error(`事件“${this.kind.name}”使用自动 hook。`);
    }
    if (this.getCurrent() !== this) {
      throw new Error(`事件“${this.kind.name}”不是当前事件 scope。`);
    }
    await this.dispatch(this.kind[timing], this);
  }

  async runClearHooks(): Promise<void> {
    for (const clear of [...this.clearHooks]) await clear(this);
  }

  complete(endId: number): void {
    this._endId = endId;
    this._phase = 'completed';
  }
}

function createKind<const Name extends string, Data>(name: Name): EventKind<Name, Data> {
  const kind = { name } as unknown as EventKind<Name, Data>;
  const before: EventHookPoint<typeof kind, 'before'> = Object.freeze({
    kind,
    timing: 'before',
  });
  const after: EventHookPoint<typeof kind, 'after'> = Object.freeze({
    kind,
    timing: 'after',
  });

  Object.assign(kind, { before, after });
  return Object.freeze(kind);
}
