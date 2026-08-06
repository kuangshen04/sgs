// ============================================================
// 三国杀最小原型 — 卡牌注册
// 通过 cardRegistry.register() 向引擎注册每种牌。
// 加新牌只需：CardType 枚举 +1，此处加一个 register 调用。
// ============================================================

import { CardTag, CardType } from './types.js';
import type { Card, Player } from './types.js';
import type { CardContentFn, DeckEntry } from './cardRegistry.js';
import type { Game } from './game.js';
import { cardRegistry, cardEmoji, displayNumber } from './cardRegistry.js';
import { discardCards, drawCards, moveCards, playFromHand, useCard } from './cardActions.js';
import { damage, recover } from './life.js';
import { distanceTo, attackRange } from './distance.js';
import { hasCardsInAreas, selectCardFromAreas, takeCardFromAreas } from './areas.js';
import { findResponse } from './choose.js';
import type {
  TargetingEventData,
} from './events/index.js';
import type { DamageEventData } from './events/index.js';
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

  // TODO(玩家选择): 是否出闪/出哪张闪——目前写死为"有就出第一张"
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
    // TODO(玩家选择): 决斗中是否出杀/出哪张——目前写死为"有就出第一张"
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
    // TODO(玩家选择): 南蛮中是否出杀/出哪张——目前写死为"有就出第一张"
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
    // TODO(玩家选择): 万箭中是否出闪/出哪张——目前写死为"有就出第一张"
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
    `  ${user.name} 对 ${target.name} 使用了 🌉过河拆桥，弃置其区域内的一张牌`,
  );

  // TODO(玩家选择): 弃置目标区域内哪张牌——目前写死为随机
  const card = selectCardFromAreas(target);
  if (!card) return;
  takeCardFromAreas(target, card);
  game.state.discardPile.push(card);
  console.log(
    `  弃置了 ${cardEmoji(card.type)} (${card.suit}${displayNumber(card.number)})`,
  );
};

const shunshouContent: CardContentFn = async (game, data, _event) => {
  const user = data.player;
  const target = data.targets[0];
  console.log(
    `  ${user.name} 对 ${target.name} 使用了 🐑顺手牵羊，获得其区域内的一张牌`,
  );

  // TODO(玩家选择): 获得目标区域内哪张牌——目前写死为随机
  const card = selectCardFromAreas(target);
  if (!card) return;
  takeCardFromAreas(target, card);
  user.hand.push(card);
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
/** 注册无懈可击 trigger handler（挂到指定对局的触发器注册表） */
export function installWuxieTrigger(game: Game): void {
  game.triggerSystem.on(`${EventType.Targeting}.before`, async (targetingEvent) => {
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

      // TODO(玩家选择): 是否出无懈/出哪张——目前写死为 AI 策略"只保护自己"
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
    // 规则：每回合限一次（咆哮/诸葛连弩可无视），且存在攻击范围内目标
    (!shaUsed || effectRegistry.has(player, 'unlimitedSha')) &&
    _allPlayers.some((p) => p !== player && p.alive
      && distanceTo(_allPlayers, player, p) <= attackRange(player)
      && !effectRegistry.has(p, 'immuneSha')), // 空城等：不能成为杀的目标
  targetFilter: (user, allPlayers) =>
    allPlayers.filter((p) => p !== user && p.alive
      && distanceTo(allPlayers, user, p) <= attackRange(user)
      && !effectRegistry.has(p, 'immuneSha')),
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
  canUse: (player, allPlayers) =>
    allPlayers.some((p) => p !== player && p.alive && !effectRegistry.has(p, 'immuneJueDou')),
  targetFilter: (user, allPlayers) =>
    allPlayers.filter((p) => p !== user && p.alive && !effectRegistry.has(p, 'immuneJueDou')),
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
  canUse: (player, allPlayers) =>
    allPlayers.some((p) => p !== player && p.alive && !effectRegistry.has(p, 'immuneLeBu')),
  targetFilter: (user, allPlayers) =>
    allPlayers.filter((p) => p !== user && p.alive && !effectRegistry.has(p, 'immuneLeBu')),
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
  canUse: (player, allPlayers) =>
    // 规则：存在区域内有牌的目标（无距离限制）
    allPlayers.some((p) => p !== player && p.alive && hasCardsInAreas(p)),
  targetFilter: (user, allPlayers) =>
    allPlayers.filter((p) => p !== user && p.alive && hasCardsInAreas(p)),
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
  canUse: (player, allPlayers) =>
    // 规则：存在距离为 1（或奇才无视距离）且区域内有牌的目标
    allPlayers.some((p) => p !== player && p.alive && hasCardsInAreas(p)
      && (effectRegistry.has(player, 'noTrickDistance') || distanceTo(allPlayers, player, p) <= 1)
      && !effectRegistry.has(p, 'immuneShunShou')),
  targetFilter: (user, allPlayers) =>
    allPlayers.filter((p) => p !== user && p.alive && hasCardsInAreas(p)
      && (effectRegistry.has(user, 'noTrickDistance') || distanceTo(allPlayers, user, p) <= 1)
      && !effectRegistry.has(p, 'immuneShunShou')),
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
  range: 1,
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
  content: async () => {}, // 无使用效果（持续效果在 effectRegistry 注册）
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

// 马匹槽位距离修正（按槽位注册，将来大宛/紫骍/的卢等自动覆盖）
effectRegistry.register({
  kind: 'defensiveDistance',
  value: (player) => (player.equipment.defensiveHorse ? 1 : 0),
});
effectRegistry.register({
  kind: 'offensiveDistance',
  value: (player) => (player.equipment.offensiveHorse ? 1 : 0),
});

cardRegistry.register({
  type: CardType.QiLinGong,
  name: '麒麟弓',
  emoji: '🎯',
  content: async () => {}, // 无使用效果（触发效果在 equipTrigger）
  equipTrigger: {
    trigger: 'damage.after',
    canTrigger: (game, event, owner) => {
      const useCard = event.getParent(EventType.UseCard);
      if (!useCard || useCard.data.player !== owner) return false;
      if (useCard.data.card.type !== CardType.Sha) return false;
      const { target } = event.data as DamageEventData;
      return !!target && !!(target.equipment.defensiveHorse || target.equipment.offensiveHorse);
    },
    content: async (game, event, owner) => {
      const { target } = event.data as DamageEventData;
      if (!target) return;
      // 弃置目标一张坐骑（简化：优先防御马）
      const eq = target.equipment;
      // TODO(玩家选择): 弃置目标的哪张坐骑——目前写死为"优先防御马"
      const mount = eq.defensiveHorse ?? eq.offensiveHorse;
      if (!mount) return;
      if (eq.defensiveHorse === mount) eq.defensiveHorse = undefined;
      else eq.offensiveHorse = undefined;
      game.state.discardPile.push(mount);
      console.log(
        `  ✨${owner.name} 的麒麟弓发动！弃置 ${target.name} 的坐骑 ${cardEmoji(mount.type)}`,
      );
    },
  },
  tags: [CardTag.Equip, CardTag.Weapon],
  range: 5,
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
  type: CardType.HanBingJian,
  name: '寒冰剑',
  emoji: '❄️',
  content: async () => {}, // 无使用效果（触发效果在 equipTrigger）
  equipTrigger: {
    trigger: 'damage.before',
    canTrigger: (game, event, owner) => {
      const useCard = event.getParent(EventType.UseCard);
      if (!useCard || useCard.data.player !== owner) return false;
      if (useCard.data.card.type !== CardType.Sha) return false;
      const { target } = event.data as DamageEventData;
      if (!target) return false;
      return hasCardsInAreas(target); // 目标区域内有能被弃置的牌
    },
    content: async (game, event, owner) => {
      const { target } = event.data as DamageEventData;
      if (!target) return;
      // 依次弃置两张区域内的牌，然后防止伤害。
      // prevent() 抛异常，之后的代码不会执行，所以必须先弃牌再 prevent。
      const discarded: Card[] = [];
      for (let i = 0; i < 2; i++) {
        // TODO(玩家选择): 依次弃置哪两张区域牌——目前写死为随机
        const card = selectCardFromAreas(target);
        if (!card) break;
        takeCardFromAreas(target, card);
        discarded.push(card);
      }
      game.state.discardPile.push(...discarded);
      console.log(
        `  ✨${owner.name} 的寒冰剑发动！防止 ${target.name} 受到伤害，弃置 ${discarded.length} 张牌`,
      );
      event.prevent();
    },
  },
  tags: [CardTag.Equip, CardTag.Weapon],
  range: 2,
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
  type: CardType.RenWangDun,
  name: '仁王盾',
  emoji: '🔰',
  content: async () => {}, // 无使用效果（触发效果在 equipTrigger）
  equipTrigger: {
    trigger: 'targeting.before',
    canTrigger: (game, event, owner) => {
      const { card, target } = event.data as TargetingEventData;
      if (target !== owner) return false; // 只保护装备者自己
      if (card.type !== CardType.Sha) return false;
      // 黑色杀（♠/♣）对装备者无效
      return card.suit === '♠' || card.suit === '♣';
    },
    content: async (game, event, owner) => {
      const { card, target } = event.data as TargetingEventData;
      console.log(
        `  🔰${owner.name} 的仁王盾发动！黑色 ${cardEmoji(card.type)} 对其无效`,
      );
      event.prevent(); // targeting 时取消目标
    },
  },
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
  type: CardType.CiXiongShuangGuJian,
  name: '雌雄双股剑',
  emoji: '⚔️',
  content: async () => {}, // 无使用效果（触发效果在 equipTrigger）
  equipTrigger: {
    trigger: 'targeting.after',
    canTrigger: (game, event, owner) => {
      const { user, card, target } = event.data as TargetingEventData;
      if (user !== owner) return false; // 只有装备者使用牌时触发
      if (card.type !== CardType.Sha) return false;
      return target.hero.sex !== owner.hero.sex; // 指定异性目标后
    },
    content: async (game, event, owner) => {
      const { target } = event.data as TargetingEventData;
      // TODO(玩家选择): 目标选择"弃一张手牌"还是"令使用者摸一张牌"——写死为优先弃牌
      if (target.hand.length > 0) {
        discardCards(game, target, [target.hand[0]]);
        console.log(
          `  ⚔️${owner.name} 的雌雄双股剑发动！${target.name} 弃置了一张手牌`,
        );
      } else {
        await drawCards(game, { target: owner, count: 1 });
        console.log(`  ⚔️${owner.name} 的雌雄双股剑发动！摸了一张牌`);
      }
    },
  },
  tags: [CardTag.Equip, CardTag.Weapon],
  range: 2,
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
  { type: CardType.CiXiongShuangGuJian, suit: '♠', numbers: [2] },
  { type: CardType.JueYing, suit: '♠', numbers: [5] },
  { type: CardType.QiLinGong, suit: '♠', numbers: [5] },
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
  { type: CardType.HanBingJian, suit: '♣', numbers: [2] },
  { type: CardType.RenWangDun, suit: '♣', numbers: [2] },
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
