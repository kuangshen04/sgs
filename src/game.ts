// ============================================================
// 三国杀最小原型 — 游戏引擎
//
// 定义卡牌接口（CardDef）+ 注册表（cardRegistry）。
// 卡牌实现（cards.ts）调用 cardRegistry.register() 注册自身。
// 引擎不依赖任何具体卡牌实现。
// ============================================================

import { Card, CardTag, CardType, GameState, Hero, Player, VictoryCondition } from './types.js';
import { EventType, GameEvent, createEventStack } from './events/index.js';
import type {
  DamageEventData,
  DrawEventData,
  RecoverEventData,
  DyingEventData,
  DieEventData,
  TargetingEventData,
  UseCardEventData,
  EventStack,
} from './events/index.js';
import type { Deciders } from './choose.js';
import { findResponse } from './choose.js';

// ============================================================
// 卡牌定义接口 & 注册表
// ============================================================

/** 卡牌效果函数 */
export type CardContentFn = (
  game: Game,
  data: UseCardEventData,
  event: GameEvent<UseCardEventData>,
) => Promise<void>;

/** 一张牌的完整定义（由 cards.ts 注册） */
export interface CardDef {
  type: CardType;
  name: string;
  emoji: string;
  content: CardContentFn;
  /** 卡牌标签（基本牌/锦囊牌等） */
  tags: CardTag[];
  /** 此牌可选择的合法目标列表（规则层面） */
  targetFilter: (user: Player, allPlayers: Player[]) => Player[];
  /** 目标数量约束（规则层面）：固定数 或 'all' 表示合法目标全部 */
  targetCount: number | 'all';
  ai: {
    canUse: (player: Player, allPlayers: Player[], shaUsed: boolean) => boolean;
    usePriority: number;     // AI 使用优先级（越大越优先）
    discardPriority: number; // 弃牌优先级（越小越先弃）
  };
}

/** 牌堆配置条目 */
export interface DeckEntry {
  type: CardType;
  suit: string;
  numbers: number[];
}

// --- 注册表 ---

const _defs = new Map<CardType, CardDef>();

export const cardRegistry = {
  register(def: CardDef): void {
    _defs.set(def.type, def);
  },
  get(type: CardType): CardDef | undefined {
    return _defs.get(type);
  },
  /** 遍历所有已注册的 CardDef */
  all(): IterableIterator<CardDef> {
    return _defs.values();
  },
};

// --- 从注册表派生的工具函数 ---

/** 卡牌类型 → emoji */
export function cardEmoji(type: CardType): string {
  return cardRegistry.get(type)?.emoji ?? '❓';
}

/** 卡牌点数 → 显示字符 */
export function displayNumber(n: number): string {
  switch (n) {
    case 1:  return 'A';
    case 11: return 'J';
    case 12: return 'Q';
    case 13: return 'K';
    default: return String(n);
  }
}

// ============================================================
// Game — 一局游戏的容器
// 所有引擎函数以 game 为第一参数，替代模块级 gs() 全局状态。
// ============================================================

export interface Game {
  state: GameState;
  /** 全局注入的出牌策略（choose() 优先级：调用参数 > 此处 > 默认 AI） */
  deciders: Deciders;
  /** 本局的事件执行栈（随局隔离） */
  eventStack: EventStack;
}

// ============================================================
// 牌堆
// ============================================================

/** 根据牌堆配置生成牌堆（每副牌 ×2），id 从 startId 开始递增 */
export function createDeck(config: DeckEntry[], startId = 1): Card[] {
  let next = startId;
  const deck: Card[] = [];
  for (const entry of config) {
    const def = cardRegistry.get(entry.type);
    if (!def) {
      console.warn(`CardDef "${entry.type}" not registered, skipping.`);
      continue;
    }
    for (let copy = 0; copy < 2; copy++) {
      for (const num of entry.numbers) {
        deck.push({
          id: next++, type: entry.type,
          name: def.name, suit: entry.suit, number: num,
        });
      }
    }
  }
  return deck;
}

/** Fisher-Yates 洗牌 */
export function shuffle(deck: Card[]): Card[] {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ============================================================
// 胜利条件
// ============================================================

/** 吃鸡模式：最后一人存活即获胜 */
export function lastManStanding(state: GameState): Player | null {
  const alive = state.players.filter((p) => p.alive);
  return alive.length === 1 ? alive[0] : null;
}

// ============================================================
// 游戏初始化
// ============================================================

/** createGame 的可选注入项 */
export interface CreateGameOptions {
  victoryCheck?: VictoryCondition;
  deciders?: Deciders;
}

export function createGame(
  deckConfig: DeckEntry[],
  heroes: Hero[],
  options?: CreateGameOptions,
): Game {
  const players: Player[] = heroes.map((h) => ({
    name: h.name, hero: h,
    hp: h.maxHp, maxHp: h.maxHp,
    hand: [], alive: true,
  }));

  const deck = shuffle(createDeck(deckConfig));
  const discardPile: Card[] = [];

  // 起始手牌（不走事件）
  for (const p of players) {
    drawCardsFromDeck(p, deck, discardPile, 4);
  }

  return {
    state: {
      players,
      currentIndex: 0,
      deck, discardPile,
      round: 1, gameOver: false, winner: null,
      victoryCheck: options?.victoryCheck ?? lastManStanding,
    },
    deciders: options?.deciders ?? {},
    eventStack: createEventStack(),
  };
}

// ============================================================
// 摸牌工具
// ============================================================

function drawCardsFromDeck(
  player: Player, deck: Card[], discardPile: Card[], count: number,
): void {
  for (let i = 0; i < count; i++) {
    if (deck.length === 0) {
      if (discardPile.length === 0) {
        console.log('  ⚠️ 牌堆和弃牌堆都已空，无法摸牌');
        return;
      }
      const reshuffled = shuffle(discardPile);
      deck.push(...reshuffled);
      discardPile.length = 0;
      console.log('  🔄 弃牌堆重新洗入牌堆');
    }
    player.hand.push(deck.pop()!);
  }
}

// ============================================================
// Action 工厂函数
// ============================================================

export async function damage(
  game: Game,
  data: DamageEventData,
): Promise<GameEvent<DamageEventData>> {
  return new GameEvent<DamageEventData>(EventType.Damage, data, game)
    .execute(async (event) => {
      event.data.target.hp -= event.data.amount;
      console.log(
        `  💥 ${event.data.target.name} 受到${event.data.amount}点伤害！` +
        `体力: ${event.data.target.hp}/${event.data.target.maxHp}`,
      );
      if (event.data.target.hp <= 0) {
        await dying(game, { player: event.data.target });
      }
    });
}

export async function recover(
  game: Game,
  data: RecoverEventData,
): Promise<GameEvent<RecoverEventData>> {
  return new GameEvent<RecoverEventData>(EventType.Recover, data, game)
    .execute(async (event) => {
      event.data.target.hp = Math.min(
        event.data.target.hp + event.data.amount,
        event.data.target.maxHp,
      );
    });
}

export async function drawCards(
  game: Game,
  data: DrawEventData,
): Promise<GameEvent<DrawEventData>> {
  return new GameEvent<DrawEventData>(EventType.Draw, data, game)
    .execute(async (event) => {
      drawCardsFromDeck(
        event.data.target, game.state.deck, game.state.discardPile, event.data.count,
      );
    });
}

/**
 * 濒死：求桃自救。内容：
 *   1. 循环使用桃直到体力 > 0 或无桃可用
 *   2. 若仍 ≤ 0，调用 die() 真正死亡
 */
export async function dying(
  game: Game,
  data: DyingEventData,
): Promise<GameEvent<DyingEventData>> {
  return new GameEvent<DyingEventData>(EventType.Dying, data, game)
    .execute(async (event) => {
      const player = event.data.player;

      if (!player.alive) return; // 已死亡，跳过

      // 求桃：自己使用桃直到体力 > 0 或无桃可用
      let usedTao = false;
      while (player.hp <= 0) {
        const tao = findResponse(player, CardType.Tao);
        if (!tao) break;
        console.log(`  🩸${player.name} 濒死！使用 🍑桃 自救`);
        await useCard(game, { player, card: tao, targets: [player] });
        usedTao = true;
      }

      if (usedTao && player.hp > 0) {
        console.log(`  💚${player.name} 脱离濒死，体力: ${player.hp}/${player.maxHp}`);
      }

      // 若仍死亡，真正阵亡
      if (player.hp <= 0) {
        await die(game, { player });
      }
    });
}

export async function die(
  game: Game,
  data: DieEventData,
): Promise<GameEvent<DieEventData>> {
  const state = game.state;
  return new GameEvent<DieEventData>(EventType.Die, data, game)
    .execute(async (event) => {
      event.data.player.alive = false;
      console.log(`\n💀 ${event.data.player.name} 阵亡！`);
      const winner = state.victoryCheck(state);
      if (winner) {
        state.gameOver = true;
        state.winner = winner;
        event.getParent(EventType.Game)?.prevent();
      }
  });
}

/**
 * 打出：把一张牌从手牌移入弃牌堆（不产生使用事件）。
 *
 * 用于闪、决斗打出的杀、南蛮打出的杀这类"打出"响应；
 * "使用"路径（桃自救、无懈）应走 useCard。
 */
export function playFromHand(game: Game, player: Player, card: Card): void {
  const idx = player.hand.findIndex((c) => c.id === card.id);
  if (idx < 0) return; // 牌不在手牌（已被消耗）→ 不重复入弃牌堆
  player.hand.splice(idx, 1);
  game.state.discardPile.push(card);
}

// ============================================================
// useCard — 通过 cardRegistry 分发
// ============================================================

export async function useCard(
  game: Game,
  data: UseCardEventData,
): Promise<GameEvent<UseCardEventData>> {
  return new GameEvent<UseCardEventData>(EventType.UseCard, data, game)
    .execute(async (event) => {
      // 从手牌移除 → 移入弃牌堆
      const idx = event.data.player.hand.findIndex(
        (c) => c.id === event.data.card.id,
      );
      if (idx >= 0) {
        event.data.player.hand.splice(idx, 1);
      }
      game.state.discardPile.push(event.data.card);

      // 逐 target 判定（无懈可击等响应在这里）
      let shouldExecute = true;

      if (event.data.targets.length > 0) {
        const remaining: Player[] = [];
        for (const target of event.data.targets) {
          const targetingEvent = await new GameEvent<TargetingEventData>(
            EventType.Targeting,
            { user: event.data.player, card: event.data.card, target },
            game,
          ).execute(async () => {
            // content 为空 — targeting 纯粹是 trigger 检查点
          });

          if (!targetingEvent.isPrevented()) {
            remaining.push(target);
          } else {
            console.log(`  🚫${target.name} 被指定为目标的效果已被抵消`);
          }
        }
        if (remaining.length === 0) {
          shouldExecute = false;
        } else {
          event.data.targets = remaining;
        }
      } else {
        // 无目标牌（如无懈可击）：单次 targeting，target = 使用者自己
        // 这是唯一的响应窗口，无懈可击可以被反无懈
        const targetingEvent = await new GameEvent<TargetingEventData>(
          EventType.Targeting,
          { user: event.data.player, card: event.data.card, target: event.data.player },
          game,
        ).execute(async () => {});

        if (targetingEvent.isPrevented()) {
          console.log(`  🚫${event.data.player.name} 的 ${cardRegistry.get(event.data.card.type)?.name ?? '牌'} 效果已被抵消`);
          shouldExecute = false;
        }
      }

      if (shouldExecute) {
        const def = cardRegistry.get(event.data.card.type);
        if (def) {
          await def.content(game, event.data, event);
        }
      }
    });
}

// ============================================================
// 显示
// ============================================================

function handDisplay(hand: Card[]): string {
  if (hand.length === 0) return '（空）';
  const sorted = [...hand].sort((a, b) => {
    const pa = cardRegistry.get(a.type)?.ai.discardPriority ?? 0;
    const pb = cardRegistry.get(b.type)?.ai.discardPriority ?? 0;
    return pa - pb;
  });
  return sorted
    .map((c) => `${cardEmoji(c.type)}${c.suit}${displayNumber(c.number)}`)
    .join(' ');
}

function hpBar(current: number, max: number): string {
  return '❤️'.repeat(current) + '🖤'.repeat(max - current) + ` (${current}/${max})`;
}

export function printState(state: GameState): void {
  const alive = state.players.filter((p) => p.alive).length;
  const W = 42; // 内容区宽度

  let body = '';
  for (const p of state.players) {
    const marker = p.alive ? ' ' : '💀';
    const nameCol = padEnd(`${marker}${p.name}`, 5);
    const hpCol = hpBar(p.hp, p.maxHp);
    body += `║ ${nameCol} ${padEnd(hpCol, W - 7 - 5)}║\n`;
    body += `║   手牌: ${padEnd(handDisplay(p.hand), W - 10)}║\n`;
    body += `║${' '.repeat(W)}║\n`;
  }

  console.log(`
╔${'═'.repeat(W)}╗
║${padEnd('🏯 三国杀 · 最小原型', W)}║
╠${'═'.repeat(W)}╣
${body}║ 牌堆: ${String(state.deck.length).padStart(3)}张 | 弃牌堆: ${String(state.discardPile.length).padStart(3)}张 | 存活: ${alive}人 | 第${state.round}轮 ║
╚${'═'.repeat(W)}╝`);
}

function padEnd(str: string, len: number): string {
  let width = 0;
  for (const ch of str) {
    width += /[一-鿿　-〿＀-￯]/.test(ch) ? 2 : 1;
  }
  return str + ' '.repeat(Math.max(0, len - width));
}
