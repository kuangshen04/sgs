// ============================================================
// 三国杀最小原型 — 基本牌（杀 / 闪 / 桃）
// ============================================================

import { CardTag, CardType } from '../types.js';
import type { CardContentFn } from '../cardRegistry.js';
import { cardRegistry, cardEmoji, displayNumber } from '../cardRegistry.js';
import { damage, recover } from '../life.js';
import { distanceTo, attackRange } from '../distance.js';
import { effectRegistry } from '../persistentEffects.js';
import { resolveShaResponse } from '../respond.js';

const shaContent: CardContentFn = async (game, data, event) => {
  const attacker = data.player;
  const defender = data.targets[0];
  console.log(
    `  ${attacker.name} 对 ${defender.name} 使用了 🗡️杀 (${data.card.suit}${displayNumber(data.card.number)})`,
  );

  // 响应流程：能否响应（铁骑）/ 所需闪数（无双）/ 抵消时点（shaCancelled）
  const marks = event.data.marks ?? {};
  const cancelled = await resolveShaResponse(game, attacker, defender, data.card, marks);
  if (!cancelled) {
    await damage(game, { target: defender, source: attacker, amount: 1 });
  }
};

const taoContent: CardContentFn = async (game, data, _event) => {
  const user = data.player;
  // 出牌阶段目标是自己；濒死求桃时目标是濒死角色（他人用桃救援）
  const target = data.targets[0] ?? user;
  const before = target.hp;
  await recover(game, { target, amount: 1 });
  console.log(
    `  ${user.name} 使用了 🍑桃 (${data.card.suit}${displayNumber(data.card.number)})，` +
    `${target.name} 体力恢复到 ${before}→${target.hp}/${target.maxHp}`,
  );
};

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
