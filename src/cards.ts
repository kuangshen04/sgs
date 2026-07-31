// ============================================================
// 三国杀最小原型 — 卡牌注册
// 通过 cardRegistry.register() 向引擎注册每种牌。
// 加新牌只需：CardType 枚举 +1，此处加一个 register 调用。
// ============================================================

import { CardType } from './types.js';
import type { Player } from './types.js';
import type { CardContentFn, DeckEntry } from './game.js';
import {
  cardRegistry, displayNumber,
  gs, damage, recover, drawCards,
} from './game.js';

// ============================================================
// 卡牌效果
// ============================================================

const shaContent: CardContentFn = async (data, _event) => {
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

const taoContent: CardContentFn = async (data, _event) => {
  const player = data.player;
  const before = player.hp;
  await recover({ target: player, amount: 1 });
  console.log(
    `  ${player.name} 使用了 🍑桃 (${data.card.suit}${displayNumber(data.card.number)})，` +
    `体力恢复到 ${before}→${player.hp}/${player.maxHp}`,
  );
};

const wuzhongContent: CardContentFn = async (data, _event) => {
  const player = data.player;
  const before = player.hand.length;
  await drawCards({ target: player, count: 2 });
  console.log(
    `  ${player.name} 使用了 📜无中生有 (${data.card.suit}${displayNumber(data.card.number)})，` +
    `摸了 ${player.hand.length - before} 张牌`,
  );
};

const juedouContent: CardContentFn = async (data, _event) => {
  const initiator = data.player;
  const target = data.targets[0];
  console.log(
    `  ${initiator.name} 对 ${target.name} 使用了 ⚔️决斗 (${data.card.suit}${displayNumber(data.card.number)})`,
  );

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

const nanmanContent: CardContentFn = async (data, _event) => {
  const user = data.player;
  console.log(
    `  ${user.name} 使用了 🐘南蛮入侵 (${data.card.suit}${displayNumber(data.card.number)})！` +
    `所有其他角色必须打出杀`,
  );

  for (const target of data.targets) {
    const shaIdx = target.hand.findIndex((c) => c.type === CardType.Sha);
    if (shaIdx >= 0) {
      const shaCard = target.hand.splice(shaIdx, 1)[0];
      gs().discardPile.push(shaCard);
      console.log(
        `  ${target.name} 打出了 🗡️杀 (${shaCard.suit}${displayNumber(shaCard.number)})`,
      );
    } else {
      await damage({ target, source: user, amount: 1 });
    }
  }
};

// ============================================================
// 工具
// ============================================================

/** 其他存活玩家 */
function otherAlive(user: Player, all: Player[]): Player[] {
  return all.filter((p) => p !== user && p.alive);
}

// ============================================================
// 注册
// ============================================================

cardRegistry.register({
  type: CardType.Sha,
  name: '杀',
  emoji: '🗡️',
  content: shaContent,
  targetFilter: otherAlive,
  targetCount: 1,
  ai: {
    canUse: (_, __, shaUsed) => !shaUsed,
    usePriority: 60,
    discardPriority: 0,
  },
});

cardRegistry.register({
  type: CardType.Shan,
  name: '闪',
  emoji: '🛡️',
  content: async () => {}, // 闪不主动使用
  targetFilter: () => [],
  targetCount: 0,
  ai: {
    canUse: () => false,
    usePriority: 0,
    discardPriority: 1,
  },
});

cardRegistry.register({
  type: CardType.Tao,
  name: '桃',
  emoji: '🍑',
  content: taoContent,
  targetFilter: (user) => [user],
  targetCount: 1,
  ai: {
    canUse: (player) => player.hp < player.maxHp,
    usePriority: 90,
    discardPriority: 3,
  },
});

cardRegistry.register({
  type: CardType.WuZhong,
  name: '无中生有',
  emoji: '📜',
  content: wuzhongContent,
  targetFilter: (user) => [user],
  targetCount: 1,
  ai: {
    canUse: () => true,
    usePriority: 80,
    discardPriority: 2,
  },
});

cardRegistry.register({
  type: CardType.JueDou,
  name: '决斗',
  emoji: '⚔️',
  content: juedouContent,
  targetFilter: otherAlive,
  targetCount: 1,
  ai: {
    canUse: (player) => player.hand.some((c) => c.type === CardType.Sha),
    usePriority: 70,
    discardPriority: 0,
  },
});

cardRegistry.register({
  type: CardType.NanMan,
  name: '南蛮入侵',
  emoji: '🐘',
  content: nanmanContent,
  targetFilter: otherAlive,
  targetCount: 'all',
  ai: {
    canUse: () => true,
    usePriority: 75,
    discardPriority: 0,
  },
});

// ============================================================
// 标准牌堆配置
// ============================================================

export const STANDARD_DECK: DeckEntry[] = [
  // ♠
  { type: CardType.JueDou, suit: '♠', numbers: [1] },
  { type: CardType.NanMan, suit: '♠', numbers: [7, 13] },
  { type: CardType.Sha,    suit: '♠', numbers: [2,3,4,5,6,8,9,10,11,12] },
  // ♥
  { type: CardType.Tao,     suit: '♥', numbers: [2] },
  { type: CardType.WuZhong, suit: '♥', numbers: [7,8,9,11] },
  { type: CardType.Shan,    suit: '♥', numbers: [1,3,4,5,6,10,12,13] },
  // ♣
  { type: CardType.JueDou, suit: '♣', numbers: [1] },
  { type: CardType.NanMan, suit: '♣', numbers: [7] },
  { type: CardType.Sha,    suit: '♣', numbers: [2,3,4,5,6,8,9,10,11,12,13] },
  // ♦
  { type: CardType.JueDou, suit: '♦', numbers: [1] },
  { type: CardType.Tao,    suit: '♦', numbers: [2,3,4,5,6,7,8,9,10,11,12,13] },
];
