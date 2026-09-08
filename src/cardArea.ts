// ============================================================
// 受控容器 CardArea + 引擎级集中索引（阶段 2 位置模型收口）
//
// 背景（演进与避坑 3.2）：唯一性要么来自物理结构（无名杀 DOM）、要么来自集中索引
// （FreeKill card_place）；裸 TS 数组两者皆无。本模块用"受控容器 + 派生态索引"补上。
//
// 数据权威：容器内部数组（序列化只存内容，加载时重建索引 —— FreeKill serialize 同款）；
// 索引是派生态，只由容器方法 / 装备槽位写点维护，不参与序列化。
//
// 容器语义-free：只负责 进/出/顺序/唯一/归属；不掺技能名、移动原因、可见性、
// 装备槽位策略（槽位由移动原语的语义封装按牌类型决定）。
// ============================================================

import type { Card, CardLocation } from './types.js';

/** 引擎级集中索引：cardId → 当前位置（FreeKill card_place 等价物，随局隔离） */
export type CardIndex = Map<number, CardLocation>;

export function createCardIndex(): CardIndex {
  return new Map<number, CardLocation>();
}

/**
 * 一个"能放牌的位置"的受控容器。
 * - 内容只读视图 = `cards`；写只能通过容器方法（add / insertAt / removeById / clear 等）。
 * - 容器方法内部同步全局索引（构造函数传入），并做唯一性硬校验：
 *   一张牌已在某位置时再次入区即抛错（一牌一位置，测试期 sanity net / 运行时红线）。
 */
export class CardArea {
  private _cards: Card[] = [];
  /** 本容器代表的位置（含归属；deck/discardPile/processing 无 player） */
  readonly location: CardLocation;
  private _index: CardIndex;

  constructor(index: CardIndex, location: CardLocation) {
    this._index = index;
    this.location = location;
  }

  /** 对外只读视图（读引用统一走这里或下方只读委托方法） */
  get cards(): readonly Card[] {
    return this._cards;
  }

  get length(): number {
    return this._cards.length;
  }

  get isEmpty(): boolean {
    return this._cards.length === 0;
  }

  /** 含头检查（按 id） */
  has(card: Card): boolean {
    return this._index.has(card.id);
  }

  // ============================================================
  // 写通道（唯一合法入口；内部同步集中索引 + 唯一性校验）
  // ============================================================

  private assertNotPlaced(card: Card): void {
    const existing = this._index.get(card.id);
    if (existing) {
      throw new Error(
        `CardArea: card #${card.id} is already at ${describeLocation(existing)}, cannot add to ${describeLocation(this.location)}`,
      );
    }
  }

  /** 尾插一张（入区唯一校验：已在别处则抛错） */
  add(card: Card): void {
    this.assertNotPlaced(card);
    this._cards.push(card);
    this._index.set(card.id, this.location);
  }

  /** 尾插一组（按给定顺序） */
  addAll(cards: Card[]): void {
    for (const c of cards) this.add(c);
  }

  /** 指定下标插入一张 */
  insertAt(index: number, card: Card): void {
    this.assertNotPlaced(card);
    this._cards.splice(index, 0, card);
    this._index.set(card.id, this.location);
  }

  /** 按 id 移除并返回该牌；不在本容器返回 null（同步索引） */
  removeById(id: number): Card | null {
    const i = this._cards.findIndex((c) => c.id === id);
    if (i < 0) return null;
    const [card] = this._cards.splice(i, 1);
    this._index.delete(id);
    return card;
  }

  /** 移除并返回末张（牌堆顶取用）；空容器返回 null */
  removeLast(): Card | null {
    const card = this._cards.pop();
    if (card) this._index.delete(card.id);
    return card ?? null;
  }

  /** 移除并返回首张（牌堆底取用）；空容器返回 null */
  removeFirst(): Card | null {
    const card = this._cards.shift();
    if (card) this._index.delete(card.id);
    return card ?? null;
  }

  /** 清空（全部移出游戏/重置；同步索引） */
  clear(): void {
    for (const c of this._cards) this._index.delete(c.id);
    this._cards = [];
  }

  /** 整体替换内容（重置用：先清后加；调用方保证新牌未在别处） */
  replaceAll(cards: Card[]): void {
    this.clear();
    this.addAll(cards);
  }

  // ============================================================
  // 只读委托（便于既有读代码保持形态；内容仍来自 _cards 权威数组）
  // ============================================================

  *[Symbol.iterator](): Iterator<Card> {
    yield* this._cards;
  }

  map<T>(fn: (card: Card, index: number) => T): T[] {
    return this._cards.map(fn);
  }
  filter(fn: (card: Card, index: number) => boolean): Card[] {
    return this._cards.filter(fn);
  }
  find(fn: (card: Card, index: number) => boolean): Card | undefined {
    return this._cards.find(fn);
  }
  findIndex(fn: (card: Card, index: number) => boolean): number {
    return this._cards.findIndex(fn);
  }
  some(fn: (card: Card, index: number) => boolean): boolean {
    return this._cards.some(fn);
  }
  every(fn: (card: Card, index: number) => boolean): boolean {
    return this._cards.every(fn);
  }
  includes(card: Card): boolean {
    return this._cards.includes(card);
  }
  indexOf(card: Card): number {
    return this._cards.indexOf(card);
  }
  slice(start?: number, end?: number): Card[] {
    return this._cards.slice(start, end);
  }
  forEach(fn: (card: Card, index: number) => void): void {
    this._cards.forEach(fn);
  }
  toArray(): Card[] {
    return [...this._cards];
  }
}

/** 调试/报错用：位置的人类可读描述 */
function describeLocation(loc: CardLocation): string {
  if ('player' in loc) return `${loc.player.name}.${loc.zone}`;
  return `zone:${loc.zone}`;
}
