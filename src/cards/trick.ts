// ============================================================
// 三国杀最小原型 — 锦囊牌（普通锦囊 + 无懈响应）
// ============================================================

import { CardTag, CardType } from '../types.js';
import type { CardContentFn } from '../cardRegistry.js';
import { cardRegistry, cardEmoji, displayNumber } from '../cardRegistry.js';
import { drawCards, moveCards, playFromHand, useCard } from '../cardActions.js';
import { damage, recover } from '../life.js';
import { distanceTo, attackRange } from '../distance.js';
import { hasCardsInAreas } from '../areas.js';
import { askForCard, askFromAreas } from '../choose.js';
import type { TargetingEventData } from '../events/index.js';
import { EventType } from '../events/index.js';
import { effectRegistry } from '../persistentEffects.js';
import { otherAlive, allAlive } from './helpers.js';
import type { Game } from '../game.js';
import { resolveJueDouResponse, resolvePlayResponse } from '../respond.js';

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
    // 无双②：每次响应时看对方是否持有无双——持有则需打出两张杀。
    // 无双是唯一影响响应数的技能，单例特判（吕布使用决斗时目标需两张、
    // 吕布成为目标时对手需两张；双方都是吕布则双方都需两张）。
    const required = opponent.hero.skills?.includes('无双') ? 2 : 1;
    const ok = await resolveJueDouResponse(game, current, required);
    if (!ok) {
      // 打不出杀 → 受伤（失败时点暂无监听者，直接结算）
      await damage(game, { target: current, source: opponent, amount: 1 });
      return;
    }
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
    if (await resolvePlayResponse(game, target, CardType.Sha)) {
      console.log(`  ${target.name} 打出了 🗡️杀`);
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
    // askForCard：万箭中是否出闪/出哪张（默认 AI：有就出第一张）
    const shan = await askForCard(game, target, '是否打出闪', [CardType.Shan]);
    if (shan) {
      await playFromHand(game, target, shan);
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

  // askFromAreas：弃置目标区域内哪张牌（默认 AI：随机）
  const card = await askFromAreas(game, target, '过河拆桥：弃置目标一张牌');
  if (!card) return;
  await moveCards(game, {
    to: { zone: 'discardPile' }, cards: [card], reason: 'discard',
  });
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

  // askFromAreas：获得目标区域内哪张牌（默认 AI：随机）
  const card = await askFromAreas(game, target, '顺手牵羊：获得目标一张牌');
  if (!card) return;
  await moveCards(game, {
    to: { player: user, zone: 'hand' }, cards: [card], reason: 'give',
  });
  console.log(
    `  获得了 ${cardEmoji(card.type)} (${card.suit}${displayNumber(card.number)})`,
  );
};

const jiedaoContent: CardContentFn = async (game, data, _event) => {
  const user = data.player;
  const target = data.targets[0];
  const weapon = target.equipment.weapon;
  if (!weapon) return;

  console.log(
    `  ${user.name} 对 ${target.name} 使用了 🗡️借刀杀人，令其对他人使用杀或交出武器`,
  );

  // askForCard：目标是否出杀（默认 AI：有就出第一张）
  const sha = await askForCard(game, target, '是否用杀响应【借刀杀人】', [CardType.Sha]);
  const shaTarget = game.state.players.find(
    (p) => p.alive && p !== target && p !== user
      && distanceTo(game.state.players, target, p) <= attackRange(target),
  );

  // AI 决策：有杀且有合法目标 → 出杀（目标取第一个）；否则交武器。
  // 真人/前端接入时此处改为询问。
  if (sha && shaTarget) {
    await useCard(game, { player: target, card: sha, targets: [shaTarget] });
    console.log(
      `  🗡️ ${target.name} 响应【借刀杀人】，对 ${shaTarget.name} 使用了杀`,
    );
  } else {
    await moveCards(game, {
      to: { player: user, zone: 'hand' }, cards: [weapon], reason: 'give',
    });
    console.log(
      `  🗡️ ${target.name} 选择交出武器，${cardEmoji(weapon.type)} 到了 ${user.name} 手上`,
    );
  }
};

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

/**
 * 注册无懈可击 trigger handler（挂到指定对局的触发器注册表）。
 * 响应链无需显式实现：每个无懈使用都会生成自身 targeting 事件 → 递归触发本 handler，
 * 后出的无懈在 content 中 prevent 前一个（last-wins），前一个的 content 便不会执行。
 * 本循环只剩 AI 策略：从当前回合角色起按座次、只对目标为自己且使用者不是自己的锦囊出无懈。
 */
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

      // askForCard：是否出无懈/出哪张（默认 AI：有就出第一张）
      const wxCard = await askForCard(game, player, '是否打出无懈可击', [CardType.WuXie]);
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
  type: CardType.JieDao,
  name: '借刀杀人',
  emoji: '🗡️',
  content: jiedaoContent,
  tags: [CardTag.Trick],
  canUse: (player, allPlayers) =>
    allPlayers.some((p) => p !== player && p.alive && !!p.equipment.weapon),
  targetFilter: (user, allPlayers) =>
    allPlayers.filter((p) => p !== user && p.alive && !!p.equipment.weapon),
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 55,
    discardPriority: 2,
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
