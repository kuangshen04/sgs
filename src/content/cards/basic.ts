// ============================================================
// 三国杀最小原型 — 基本牌（杀 / 闪 / 桃）
// ============================================================

import { CardTag, CardType } from '../../types.js';
import type { CardContentFn } from '../cardRegistry.js';
import { cardRegistry, cardEmoji, cardFaceText } from '../cardRegistry.js';
import { damage, recover } from '../../flow/life.js';
import { distanceTo, attackRange } from '../../flow/distance.js';
import { effectRegistry } from '../../effects/persistentEffects.js';
import { resolveShaResponse } from '../../flow/respond.js';

/**
 * 杀：对**该目标**结算（逐目标由引擎驱动）。
 * 响应（闪）写死在这里：能否响应读 `disresponsive`（铁骑等置位），所需闪数走常驻查询（无双）。
 */
const shaContent: CardContentFn = async (game, data, _event) => {
  const attacker = data.use.player;
  const defender = data.to!;
  console.log(
    `  ${attacker.name} 使用了 🗡️杀 (${cardFaceText(data.card)})，目标 ${defender.name}`,
  );

  const cancelled = await resolveShaResponse(
    game, attacker, defender, data.card, data.marks ?? {},
  );
  if (!cancelled) {
    // card：造成伤害的牌 = 本张杀（奸雄等技能据此获得，见 events/types.ts）
    await damage(game, { target: defender, source: attacker, amount: 1, card: data.card });
  }
};

const taoContent: CardContentFn = async (game, data, _event) => {
  const user = data.use.player;
  // 出牌阶段目标是自己；濒死求桃时目标是濒死角色（他人用桃救援）
  const target = data.to ?? user;
  const before = target.hp;
  await recover(game, { target, amount: 1 });
  console.log(
    `  ${user.name} 使用了 🍑桃 (${cardFaceText(data.card)})，` +
    `${target.name} 体力恢复到 ${before}→${target.hp}/${target.maxHp}`,
  );
};

cardRegistry.register({
  type: CardType.Sha,
  name: '杀',
  emoji: '🗡️',
  content: shaContent,
  tags: [CardTag.Basic],
  canUse: (game, player, _allPlayers, shaUsed) =>
    // 规则：每回合限一次（咆哮/诸葛连弩可无视），且存在攻击范围内目标
    (!shaUsed || effectRegistry.has(game, player, 'unlimitedSha')) &&
    _allPlayers.some((p) => p !== player && p.alive
      && distanceTo(game, player, p) <= attackRange(game, player)
      && !effectRegistry.has(game, p, 'immuneSha')), // 空城等：不能成为杀的目标
  targetFilter: (game, user, allPlayers) =>
    allPlayers.filter((p) => p !== user && p.alive
      && distanceTo(game, user, p) <= attackRange(game, user)
      && !effectRegistry.has(game, p, 'immuneSha')),
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
  canUse: (_game, player) => player.hp < player.maxHp, // 规则：桃需受伤才能用
  targetFilter: (_game, user) => [user],
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 90,
    discardPriority: 3,
  },
});
