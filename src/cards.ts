// ============================================================
// 三国杀最小原型 — 卡牌注册
// 通过 cardRegistry.register() 向引擎注册每种牌。
// 加新牌只需：CardType 枚举 +1，此处加一个 register 调用。
// ============================================================

import { CardTag, CardType } from './types.js';
import type { Player } from './types.js';
import type { CardContentFn, DeckEntry } from './cardRegistry.js';
import type { Game } from './game.js';
import { cardRegistry, cardEmoji, displayNumber } from './cardRegistry.js';
import { drawCards, giveCards, moveCards, playFromHand, useCard } from './cardActions.js';
import { damage, recover } from './life.js';
import { findResponse } from './choose.js';
import { triggerSystem } from './events/index.js';
import type {
  TargetingEventData,
} from './events/index.js';
import { EventType } from './events/index.js';
import { effectRegistry } from './persistentEffects.js';

// ============================================================
// 卡牌效果
// ============================================================

const shaContent: CardContentFn = async (game, data, _event) => {
  const attacker = data.player;
  const defender = data.targets[0];
  console.log(
    `  ${attacker.name} 对 ${defender.name} 使用了 🗡️杀 (${data.card.suit}${displayNumber(data.card.number)})`,
  );

  const shan = findResponse(defender, CardType.Shan);
  if (shan) {
    playFromHand(game, defender, shan);
    console.log(
      `  ${defender.name} 使用了 🛡️闪 (${shan.suit}${displayNumber(shan.number)})，抵消了攻击`,
    );
  } else {
    await damage(game, { target: defender, source: attacker, amount: 1 });
  }
};

const taoContent: CardContentFn = async (game, data, _event) => {
  const player = data.player;
  const before = player.hp;
  await recover(game, { target: player, amount: 1 });
  console.log(
    `  ${player.name} 使用了 🍑桃 (${data.card.suit}${displayNumber(data.card.number)})，` +
    `体力恢复到 ${before}→${player.hp}/${player.maxHp}`,
  );
};

const wuzhongContent: CardContentFn = async (game, data, _event) => {
  const player = data.player;
  const before = player.hand.length;
  await drawCards(game, { target: player, count: 2 });
  console.log(
    `  ${player.name} 使用了 📜无中生有 (${data.card.suit}${displayNumber(data.card.number)})，` +
    `摸了 ${player.hand.length - before} 张牌`,
  );
};

const juedouContent: CardContentFn = async (game, data, _event) => {
  const initiator = data.player;
  const target = data.targets[0];
  console.log(
    `  ${initiator.name} 对 ${target.name} 使用了 ⚔️决斗 (${data.card.suit}${displayNumber(data.card.number)})`,
  );

  let current = target;
  let opponent = initiator;

  while (true) {
    const sha = findResponse(current, CardType.Sha);
    if (!sha) {
      console.log(`  ${current.name} 无法打出杀！`);
      await damage(game, { target: current, source: opponent, amount: 1 });
      return;
    }
    playFromHand(game, current, sha);
    console.log(
      `  ${current.name} 打出了 🗡️杀 (${sha.suit}${displayNumber(sha.number)})`,
    );
    [current, opponent] = [opponent, current];
  }
};

const nanmanContent: CardContentFn = async (game, data, _event) => {
  const user = data.player;
  console.log(
    `  ${user.name} 使用了 🐘南蛮入侵 (${data.card.suit}${displayNumber(data.card.number)})！` +
    `所有其他角色必须打出杀`,
  );

  for (const target of data.targets) {
    const sha = findResponse(target, CardType.Sha);
    if (sha) {
      playFromHand(game, target, sha);
      console.log(
        `  ${target.name} 打出了 🗡️杀 (${sha.suit}${displayNumber(sha.number)})`,
      );
    } else {
      await damage(game, { target, source: user, amount: 1 });
    }
  }
};

const wanjianContent: CardContentFn = async (game, data, _event) => {
  const user = data.player;
  console.log(
    `  ${user.name} 使用了 🏹万箭齐发 (${data.card.suit}${displayNumber(data.card.number)})！` +
    `所有其他角色必须打出闪`,
  );

  for (const target of data.targets) {
    const shan = findResponse(target, CardType.Shan);
    if (shan) {
      playFromHand(game, target, shan);
      console.log(
        `  ${target.name} 打出了 🛡️闪 (${shan.suit}${displayNumber(shan.number)})`,
      );
    } else {
      await damage(game, { target, source: user, amount: 1 });
    }
  }
};

const taoyuanContent: CardContentFn = async (game, data, _event) => {
  const user = data.player;
  console.log(
    `  ${user.name} 使用了 🌸桃园结义 (${data.card.suit}${displayNumber(data.card.number)})！` +
    `所有角色回复 1 点体力`,
  );

  for (const target of data.targets) {
    await recover(game, { target, amount: 1 });
  }
};

const wuguContent: CardContentFn = async (game, data, _event) => {
  const user = data.player;
  console.log(
    `  ${user.name} 使用了 🌾五谷丰登 (${data.card.suit}${displayNumber(data.card.number)})！` +
    `所有角色各摸 1 张牌（简化版：亮牌选牌尚未实现）`,
  );

  for (const target of data.targets) {
    await drawCards(game, { target, count: 1 });
  }
};

const guoheContent: CardContentFn = async (game, data, _event) => {
  const user = data.player;
  const target = data.targets[0];
  console.log(
    `  ${user.name} 对 ${target.name} 使用了 🌉过河拆桥，弃置其一张手牌`,
  );

  // 初步实现：随机选一张手牌弃置（装备区/判定区尚未实现）
  const hand = target.hand;
  if (hand.length === 0) return;
  const card = hand[Math.floor(Math.random() * hand.length)];
  playFromHand(game, target, card);
  console.log(
    `  弃置了 ${cardEmoji(card.type)} (${card.suit}${displayNumber(card.number)})`,
  );
};

const shunshouContent: CardContentFn = async (game, data, _event) => {
  const user = data.player;
  const target = data.targets[0];
  console.log(
    `  ${user.name} 对 ${target.name} 使用了 🐑顺手牵羊，获得其一张手牌`,
  );

  // 初步实现：随机选一张手牌获得（距离与装备区尚未实现）
  const hand = target.hand;
  if (hand.length === 0) return;
  const idx = Math.floor(Math.random() * hand.length);
  const card = hand[idx];
  giveCards(target, user, [card]);
  console.log(
    `  获得了 ${cardEmoji(card.type)} (${card.suit}${displayNumber(card.number)})`,
  );
};

// ============================================================
// 工具
// ============================================================

/** 其他存活玩家 */
function otherAlive(user: Player, all: Player[]): Player[] {
  return all.filter((p) => p !== user && p.alive);
}

/** 有手牌的其他存活角色（装备区/判定区未实现，区域内先只看手牌） */
function otherAliveWithCards(user: Player, all: Player[]): Player[] {
  return all.filter((p) => p !== user && p.alive && p.hand.length > 0);
}

/** 全体存活角色（含自己，桃园结义用） */
function allAlive(user: Player, all: Player[]): Player[] {
  return all.filter((p) => p.alive);
}

// ============================================================
// 无懈可击 — content
// ============================================================

/**
 * 无懈可击的 content：沿事件栈向上找到原始锦囊的 targeting 事件并 prevent。
 *
 * 运行时事件栈：[… useCard(锦囊) → targeting(目标) → useCard(无懈)]
 * 无懈自己的 targeting 已出栈，getParent('targeting') 命中锦囊的 targeting。
 */
const wuxieContent: CardContentFn = async (_game, _data, event) => {
  const targetEvent = event.getParent(EventType.Targeting);
  if (targetEvent) {
    targetEvent.prevent();
  }
};

// ============================================================
// 无懈可击 — trigger handler（挂载在 targeting.before）
// ============================================================

/**
 * 从当前回合角色开始轮询无懈可击。
 * AI 策略：只对目标为自己、且使用者不为自己的锦囊牌出无懈。
 */
let _wuxieInstalled = false;

/** 注册无懈可击 trigger handler（可重复调用，仅首次生效） */
export function installWuxieTrigger(): void {
  if (_wuxieInstalled) return;
  _wuxieInstalled = true;

  triggerSystem.on(`${EventType.Targeting}.before`, async (targetingEvent) => {
    const { user, card, target, judging } = targetingEvent.data as TargetingEventData;
    const def = cardRegistry.get(card.type);
    if (!def?.tags.includes(CardTag.Trick)) return;

    const game = targetingEvent.game;
    const state = game.state;
    const startIndex = state.currentIndex;

    for (let offset = 0; offset < state.players.length; offset++) {
      const idx = (startIndex + offset) % state.players.length;
      const player = state.players[idx];
      if (!player.alive) continue;

      // AI：只保护自己（判定阶段的无懈窗口允许被判定者抵消自己的延时锦囊）
      if (target !== player) continue;
      if (!judging && user === player) continue;

      const wxCard = findResponse(player, CardType.WuXie);
      if (!wxCard) continue;
      console.log(
        `  ✨${player.name} 使用 🛡️无懈可击 ` +
        `(${wxCard.suit}${displayNumber(wxCard.number)}) 抵消对 ${target.name} 的效果`,
      );
      await useCard(game, { player, card: wxCard, targets: [] });

      // 无论无懈成功或被反无懈，只尝试一次就停止
      break;
    }
  });
}

// 进程启动时注册
installWuxieTrigger();

// ============================================================
// 注册
// ============================================================

cardRegistry.register({
  type: CardType.Sha,
  name: '杀',
  emoji: '🗡️',
  content: shaContent,
  tags: [CardTag.Basic],
  canUse: (player, _allPlayers, shaUsed) =>
    !shaUsed || effectRegistry.has(player, 'unlimitedSha'), // 规则：每回合限一次（咆哮/诸葛连弩可无视）
  targetFilter: otherAlive,
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 60,
    discardPriority: 0,
  },
});

cardRegistry.register({
  type: CardType.Shan,
  name: '闪',
  emoji: '🛡️',
  content: async () => {}, // 闪不主动使用
  tags: [CardTag.Basic],
  canUse: () => false, // 规则：闪不可在出牌阶段主动使用
  targetFilter: () => [],
  targetCount: 0,
  ai: {
    shouldUse: () => false,
    usePriority: 0,
    discardPriority: 1,
  },
});

cardRegistry.register({
  type: CardType.Tao,
  name: '桃',
  emoji: '🍑',
  content: taoContent,
  tags: [CardTag.Basic],
  canUse: (player) => player.hp < player.maxHp, // 规则：桃需受伤才能用
  targetFilter: (user) => [user],
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 90,
    discardPriority: 3,
  },
});

cardRegistry.register({
  type: CardType.WuZhong,
  name: '无中生有',
  emoji: '📜',
  content: wuzhongContent,
  tags: [CardTag.Trick],
  canUse: () => true,
  targetFilter: (user) => [user],
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 80,
    discardPriority: 2,
  },
});

cardRegistry.register({
  type: CardType.JueDou,
  name: '决斗',
  emoji: '⚔️',
  content: juedouContent,
  tags: [CardTag.Trick],
  canUse: () => true,
  targetFilter: otherAlive,
  targetCount: 1,
  ai: {
    shouldUse: (player) => player.hand.some((c) => c.type === CardType.Sha), // AI：有杀垫底才决斗
    usePriority: 70,
    discardPriority: 0,
  },
});

cardRegistry.register({
  type: CardType.NanMan,
  name: '南蛮入侵',
  emoji: '🐘',
  content: nanmanContent,
  tags: [CardTag.Trick],
  canUse: () => true,
  targetFilter: otherAlive,
  targetCount: 'all',
  ai: {
    shouldUse: () => true,
    usePriority: 75,
    discardPriority: 0,
  },
});

cardRegistry.register({
  type: CardType.WanJian,
  name: '万箭齐发',
  emoji: '🏹',
  content: wanjianContent,
  tags: [CardTag.Trick],
  canUse: () => true,
  targetFilter: otherAlive,
  targetCount: 'all',
  ai: {
    shouldUse: () => true,
    usePriority: 75,
    discardPriority: 0,
  },
});

cardRegistry.register({
  type: CardType.TaoYuan,
  name: '桃园结义',
  emoji: '🌸',
  content: taoyuanContent,
  tags: [CardTag.Trick],
  canUse: () => true,
  targetFilter: allAlive,
  targetCount: 'all',
  ai: {
    // AI：自己受伤才值得放（也会回敌人的血）
    shouldUse: (player) => player.hp < player.maxHp,
    usePriority: 85,
    discardPriority: 3,
  },
});

cardRegistry.register({
  type: CardType.WuGu,
  name: '五谷丰登',
  emoji: '🌾',
  content: wuguContent,
  tags: [CardTag.Trick],
  canUse: () => true,
  targetFilter: allAlive,
  targetCount: 'all',
  ai: {
    shouldUse: () => true,
    usePriority: 75,
    discardPriority: 2,
  },
});

cardRegistry.register({
  type: CardType.LeBu,
  name: '乐不思蜀',
  emoji: '😄',
  content: async () => {}, // 使用时无效果（置入判定区由 useCard 处理）
  delayContent: async (game, target, judgeCard) => {
    if (judgeCard.suit === '♥') {
      console.log(`  ${target.name} 的乐不思蜀判定为红桃，无事发生`);
    } else {
      target.skipPlayPhase = true;
      console.log(`  ${target.name} 的乐不思蜀生效，跳过出牌阶段`);
    }
  },
  tags: [CardTag.Trick, CardTag.Delay],
  canUse: () => true,
  targetFilter: otherAlive,
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 70,
    discardPriority: 0,
  },
});

cardRegistry.register({
  type: CardType.ShanDian,
  name: '闪电',
  emoji: '⚡',
  content: async () => {}, // 使用时无效果（置入判定区由 useCard 处理）
  delayContent: async (game, target, judgeCard, card) => {
    const explode = judgeCard.suit === '♠' && judgeCard.number >= 2 && judgeCard.number <= 9;
    if (explode) {
      console.log(
        `  ⚡${target.name} 的闪电判定为黑桃${displayNumber(judgeCard.number)}，受到 3 点雷电伤害`,
      );
      await damage(game, { target, amount: 3 }); // 雷电伤害无来源
    } else {
      // 判定非黑桃2~9 → 移动到下家（座位顺序中下一名存活角色）的判定区
      const players = game.state.players;
      const start = players.indexOf(target);
      for (let i = 1; i <= players.length; i++) {
        const next = players[(start + i) % players.length];
        if (!next.alive) continue;
        moveCards(target.judgment, next.judgment, [card]);
        console.log(`  ${target.name} 的闪电判定非黑桃2~9，移到 ${next.name} 的判定区`);
        break;
      }
    }
  },
  tags: [CardTag.Trick, CardTag.Delay],
  canUse: () => true,
  targetFilter: (user) => [user],
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 70,
    discardPriority: 0,
  },
});

cardRegistry.register({
  type: CardType.GuoHe,
  name: '过河拆桥',
  emoji: '🌉',
  content: guoheContent,
  tags: [CardTag.Trick],
  canUse: (player, allPlayers) => otherAliveWithCards(player, allPlayers).length > 0, // 规则：需要有牌目标
  targetFilter: otherAliveWithCards,
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 65,
    discardPriority: 2,
  },
});

cardRegistry.register({
  type: CardType.ShunShou,
  name: '顺手牵羊',
  emoji: '🐑',
  content: shunshouContent,
  tags: [CardTag.Trick],
  canUse: (player, allPlayers) => otherAliveWithCards(player, allPlayers).length > 0, // 规则：需要有牌目标
  targetFilter: otherAliveWithCards,
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 65,
    discardPriority: 2,
  },
});

cardRegistry.register({
  type: CardType.WuXie,
  name: '无懈可击',
  emoji: '🛡️',
  content: wuxieContent,
  tags: [CardTag.Trick],
  canUse: () => false, // 规则：无懈不可在出牌阶段主动使用（由响应 trigger 调用）
  targetFilter: () => [],
  targetCount: 0,
  ai: {
    shouldUse: () => false,
    usePriority: 0,
    discardPriority: 100, // 尽量保留在手牌中
  },
});

cardRegistry.register({
  type: CardType.ZhugeLianNu,
  name: '诸葛连弩',
  emoji: '🪓',
  content: async () => {}, // 无使用效果（持续效果在 effectRegistry 注册）
  tags: [CardTag.Equip, CardTag.Weapon],
  canUse: () => true,
  targetFilter: (user) => [user],
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 45,
    discardPriority: 100, // 装备尽量保留
  },
});

effectRegistry.register({
  kind: 'unlimitedSha',
  value: (player) => (player.equipment.weapon?.type === CardType.ZhugeLianNu ? 1 : 0),
});

cardRegistry.register({
  type: CardType.BaGuaZhen,
  name: '八卦阵',
  emoji: '☯️',
  content: async () => {}, // 白板：持续效果（判定出闪）待常驻效果系统
  tags: [CardTag.Equip, CardTag.Armor],
  canUse: () => true,
  targetFilter: (user) => [user],
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 45,
    discardPriority: 100,
  },
});

cardRegistry.register({
  type: CardType.JueYing,
  name: '绝影',
  emoji: '🐎',
  content: async () => {}, // 白板：防御马（其他角色与你距离+1）
  tags: [CardTag.Equip, CardTag.DefensiveHorse],
  canUse: () => true,
  targetFilter: (user) => [user],
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 45,
    discardPriority: 100,
  },
});

cardRegistry.register({
  type: CardType.ChiTu,
  name: '赤兔',
  emoji: '🐴',
  content: async () => {}, // 白板：进攻马（你与其他角色距离-1）
  tags: [CardTag.Equip, CardTag.OffensiveHorse],
  canUse: () => true,
  targetFilter: (user) => [user],
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 45,
    discardPriority: 100,
  },
});

// ============================================================
// 标准牌堆配置
// ============================================================

export const STANDARD_DECK: DeckEntry[] = [
  // ♠
  { type: CardType.JueDou, suit: '♠', numbers: [1] },
  { type: CardType.ShanDian, suit: '♠', numbers: [1] },
  { type: CardType.BaGuaZhen, suit: '♠', numbers: [2] },
  { type: CardType.JueYing, suit: '♠', numbers: [5] },
  { type: CardType.NanMan, suit: '♠', numbers: [7, 13] },
  { type: CardType.GuoHe,   suit: '♠', numbers: [3, 4, 12] },
  { type: CardType.ShunShou, suit: '♠', numbers: [3, 4, 11] },
  { type: CardType.WuXie,  suit: '♠', numbers: [11] },
  { type: CardType.Sha,    suit: '♠', numbers: [2,3,4,5,6,8,9,10,12] },
  // ♥
  { type: CardType.Tao,     suit: '♥', numbers: [2] },
  { type: CardType.WanJian, suit: '♥', numbers: [1] },
  { type: CardType.TaoYuan, suit: '♥', numbers: [1] },
  { type: CardType.WuGu,    suit: '♥', numbers: [3, 4] },
  { type: CardType.WuZhong, suit: '♥', numbers: [7,8,9,11] },
  { type: CardType.WuXie,   suit: '♥', numbers: [13] },
  { type: CardType.Shan,    suit: '♥', numbers: [1,3,4,5,6,10,12] },
  { type: CardType.LeBu,    suit: '♥', numbers: [6] },
  { type: CardType.ChiTu,   suit: '♥', numbers: [5] },
  // ♣
  { type: CardType.JueDou, suit: '♣', numbers: [1] },
  { type: CardType.ZhugeLianNu, suit: '♣', numbers: [1] },
  { type: CardType.NanMan, suit: '♣', numbers: [7] },
  { type: CardType.GuoHe,   suit: '♣', numbers: [3, 4, 12] },
  { type: CardType.WuXie,  suit: '♣', numbers: [12] },
  { type: CardType.Sha,    suit: '♣', numbers: [2,3,4,5,6,8,9,10,11,13] },
  { type: CardType.LeBu,   suit: '♣', numbers: [6] },
  // ♦
  { type: CardType.JueDou, suit: '♦', numbers: [1] },
  { type: CardType.WanJian, suit: '♦', numbers: [1] },
  { type: CardType.ShunShou, suit: '♦', numbers: [3, 4, 11] },
  { type: CardType.WuXie,  suit: '♦', numbers: [12] },
  { type: CardType.Tao,    suit: '♦', numbers: [2,3,4,5,6,7,8,9,10,11,13] },
  { type: CardType.LeBu,   suit: '♦', numbers: [6] },
];
