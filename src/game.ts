// ============================================================
// 三国杀最小原型 — 核心游戏逻辑
// 事件系统已接入，所有游戏动作通过工厂函数触发
// ============================================================

import { Card, CardType, GameState, Hero, Player } from './types.js';
import { EventType, GameEvent } from './events/index.js';
import type {
  DamageEventData,
  DrawEventData,
  RecoverEventData,
  DieEventData,
  UseCardEventData,
} from './events/index.js';

// ============================================================
// 游戏状态引用（供工厂函数在 content 中访问全局状态）
// ============================================================

let _gs: GameState | null = null;

/** 主循环调用，设置当前游戏实例 */
export function setGameState(gs: GameState): void {
  _gs = gs;
}

export function gs(): GameState {
  if (!_gs) throw new Error('GameState not set — call setGameState() first');
  return _gs;
}

// ============================================================
// 牌堆
// ============================================================

let nextCardId = 1;

/** 创建一副简化牌堆（104张，2副标准扑克合并） */
export function createDeck(): Card[] {
  const suits = ['♠', '♥', '♣', '♦'];
  const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  const deck: Card[] = [];

  for (let copy = 0; copy < 2; copy++) {
    for (const suit of suits) {
      for (const num of numbers) {
        let type: CardType;
        if (suit === '♠') {
          type = num === 1 ? CardType.JueDou : CardType.Sha;
        } else if (suit === '♥') {
          if (num === 2) type = CardType.Tao;
          else if ([7, 8, 9, 11].includes(num)) type = CardType.WuZhong;
          else type = CardType.Shan;
        } else if (suit === '♣') {
          type = num === 1 ? CardType.JueDou : CardType.Sha;
        } else {
          type = num === 1 ? CardType.JueDou : CardType.Tao;
        }
        deck.push({ id: nextCardId++, type, name: type, suit, number: num });
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
// 游戏初始化
// ============================================================

export function createGame(): GameState {
  const liuBei: Hero = { name: '刘备', maxHp: 4 };
  const caoAcao: Hero = { name: '曹操', maxHp: 4 };

  const player1: Player = {
    name: '刘备', hero: liuBei,
    hp: liuBei.maxHp, maxHp: liuBei.maxHp,
    hand: [], alive: true,
  };
  const player2: Player = {
    name: '曹操', hero: caoAcao,
    hp: caoAcao.maxHp, maxHp: caoAcao.maxHp,
    hand: [], alive: true,
  };

  const deck = shuffle(createDeck());
  const discardPile: Card[] = [];

  // 起始手牌（不走事件）
  drawCardsFromDeck(player1, deck, discardPile, 4);
  drawCardsFromDeck(player2, deck, discardPile, 4);

  return {
    players: [player1, player2],
    currentIndex: 0,
    deck, discardPile,
    round: 1, gameOver: false, winner: null,
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

/** 造成伤害 */
export async function damage(
  data: DamageEventData,
): Promise<GameEvent<DamageEventData>> {
  return new GameEvent<DamageEventData>(EventType.Damage, data)
    .execute(async (event) => {
      event.data.target.hp -= event.data.amount;
      console.log(
        `  💥 ${event.data.target.name} 受到${event.data.amount}点伤害！` +
        `体力: ${event.data.target.hp}/${event.data.target.maxHp}`,
      );
      if (event.data.target.hp <= 0) {
        await die({ player: event.data.target });
      }
    });
}

/** 恢复体力 */
export async function recover(
  data: RecoverEventData,
): Promise<GameEvent<RecoverEventData>> {
  return new GameEvent<RecoverEventData>(EventType.Recover, data)
    .execute(async (event) => {
      event.data.target.hp = Math.min(
        event.data.target.hp + event.data.amount,
        event.data.target.maxHp,
      );
    });
}

/** 摸牌 */
export async function drawCards(
  data: DrawEventData,
): Promise<GameEvent<DrawEventData>> {
  const state = gs();
  return new GameEvent<DrawEventData>(EventType.Draw, data)
    .execute(async (event) => {
      drawCardsFromDeck(
        event.data.target, state.deck, state.discardPile, event.data.count,
      );
    });
}

/** 死亡结算 */
export async function die(
  data: DieEventData,
): Promise<GameEvent<DieEventData>> {
  const state = gs();
  return new GameEvent<DieEventData>(EventType.Die, data)
    .execute(async (event) => {
      event.data.player.alive = false;
      state.gameOver = true;
      state.winner = state.players.find((p) => p !== event.data.player)!;
      console.log(`\n💀 ${event.data.player.name} 阵亡！`);

      // 胜负判定：阻止游戏继续，沿事件栈向上传播
      event.getParent(EventType.Game)?.prevent();
    });
}

// ============================================================
// 卡牌效果 & useCard
// ============================================================

type CardContentFn = (
  data: UseCardEventData,
  event: GameEvent<UseCardEventData>,
) => Promise<void>;

/** 杀：目标需出闪，否则受到1点伤害 */
const shaContent: CardContentFn = async (data) => {
  const attacker = data.player;
  const defender = data.targets[0];
  console.log(
    `  ${attacker.name} 对 ${defender.name} 使用了 🗡️杀 (${data.card.suit}${displayNumber(data.card.number)})`,
  );

  const shanIdx = defender.hand.findIndex((c) => c.type === CardType.Shan);
  if (shanIdx >= 0) {
    const shanCard = defender.hand.splice(shanIdx, 1)[0];
    gs().discardPile.push(shanCard);
    console.log(
      `  ${defender.name} 使用了 🛡️闪 (${shanCard.suit}${displayNumber(shanCard.number)})，抵消了攻击`,
    );
  } else {
    await damage({ target: defender, source: attacker, amount: 1 });
  }
};

/** 桃：回复1点体力 */
const taoContent: CardContentFn = async (data) => {
  const player = data.player;
  const before = player.hp;
  await recover({ target: player, amount: 1 });
  console.log(
    `  ${player.name} 使用了 🍑桃 (${data.card.suit}${displayNumber(data.card.number)})，` +
    `体力恢复到 ${before}→${player.hp}/${player.maxHp}`,
  );
};

/** 无中生有：摸2张牌 */
const wuzhongContent: CardContentFn = async (data) => {
  const player = data.player;
  const before = player.hand.length;
  await drawCards({ target: player, count: 2 });
  console.log(
    `  ${player.name} 使用了 📜无中生有 (${data.card.suit}${displayNumber(data.card.number)})，` +
    `摸了 ${player.hand.length - before} 张牌`,
  );
};

/** 决斗：由对方开始，双方轮流打出杀，先打不出的受到1点伤害 */
const juedouContent: CardContentFn = async (data) => {
  const initiator = data.player;
  const target = data.targets[0];
  console.log(
    `  ${initiator.name} 对 ${target.name} 使用了 ⚔️决斗 (${data.card.suit}${displayNumber(data.card.number)})`,
  );

  // 由目标开始（对方开始）
  let current = target;
  let opponent = initiator;

  while (true) {
    const shaIdx = current.hand.findIndex((c) => c.type === CardType.Sha);
    if (shaIdx < 0) {
      console.log(`  ${current.name} 无法打出杀！`);
      await damage({ target: current, source: opponent, amount: 1 });
      return;
    }
    const shaCard = current.hand.splice(shaIdx, 1)[0];
    gs().discardPile.push(shaCard);
    console.log(
      `  ${current.name} 打出了 🗡️杀 (${shaCard.suit}${displayNumber(shaCard.number)})`,
    );
    [current, opponent] = [opponent, current];
  }
};

/** 卡牌类型 → 效果函数 */
const cardContents: Partial<Record<CardType, CardContentFn>> = {
  [CardType.Sha]: shaContent,
  [CardType.Tao]: taoContent,
  [CardType.WuZhong]: wuzhongContent,
  [CardType.JueDou]: juedouContent,
  // 闪不在此列——闪是响应牌，不走主动使用路径
};

/** 使用一张牌 */
export async function useCard(
  data: UseCardEventData,
): Promise<GameEvent<UseCardEventData>> {
  return new GameEvent<UseCardEventData>(EventType.UseCard, data)
    .execute(async (event) => {
      // 从手牌移除
      const idx = event.data.player.hand.findIndex(
        (c) => c.id === event.data.card.id,
      );
      if (idx >= 0) {
        event.data.player.hand.splice(idx, 1);
      }
      // 移入弃牌堆
      gs().discardPile.push(event.data.card);
      // 执行牌的效果
      const content = cardContents[event.data.card.type];
      if (content) {
        await content(event.data, event);
      }
    });
}

// ============================================================
// 显示
// ============================================================

export function cardEmoji(type: CardType): string {
  switch (type) {
    case CardType.Sha:     return '🗡️';
    case CardType.Shan:    return '🛡️';
    case CardType.Tao:     return '🍑';
    case CardType.WuZhong: return '📜';
    case CardType.JueDou:  return '⚔️';
  }
}

export function displayNumber(n: number): string {
  switch (n) {
    case 1:  return 'A';
    case 11: return 'J';
    case 12: return 'Q';
    case 13: return 'K';
    default: return String(n);
  }
}

function handDisplay(hand: Card[]): string {
  if (hand.length === 0) return '（空）';
  const sorted = [...hand].sort((a, b) => {
    const order: Record<string, number> = {
      [CardType.Sha]: 0, [CardType.JueDou]: 1, [CardType.Shan]: 2,
      [CardType.WuZhong]: 3, [CardType.Tao]: 4,
    };
    return (order[a.type] ?? 0) - (order[b.type] ?? 0);
  });
  return sorted
    .map((c) => `${cardEmoji(c.type)}${c.suit}${displayNumber(c.number)}`)
    .join(' ');
}

function hpBar(current: number, max: number): string {
  return '❤️'.repeat(current) + '🖤'.repeat(max - current) + ` (${current}/${max})`;
}

export function printState(state: GameState): void {
  const [p1, p2] = state.players;
  console.log(`
╔══════════════════════════════════════╗
║        🏯 三国杀 · 最小原型         ║
╠══════════════════════════════════════╣
║ ${padEnd(p1.name, 4)} ${hpBar(p1.hp, p1.maxHp).padEnd(24)}║
║   手牌: ${padEnd(handDisplay(p1.hand), 28)}║
║                                      ║
║ ${padEnd(p2.name, 4)} ${hpBar(p2.hp, p2.maxHp).padEnd(24)}║
║   手牌: ${padEnd(handDisplay(p2.hand), 28)}║
║                                      ║
║ 牌堆: ${String(state.deck.length).padStart(3)}张 | 弃牌堆: ${String(state.discardPile.length).padStart(3)}张 | 第${state.round}轮 ║
╚══════════════════════════════════════╝`);
}

function padEnd(str: string, len: number): string {
  let width = 0;
  for (const ch of str) {
    width += /[一-鿿　-〿＀-￯]/.test(ch) ? 2 : 1;
  }
  return str + ' '.repeat(Math.max(0, len - width));
}
