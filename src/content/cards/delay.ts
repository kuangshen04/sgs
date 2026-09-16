// ============================================================
// 三国杀最小原型 — 延时锦囊（乐不思蜀 / 闪电）
// ============================================================

import { CardTag, CardType } from '../../types.js';
import type { Player } from '../../types.js';
import { cardRegistry, displayNumber } from '../cardRegistry.js';
import { canPlaceDelayOn, moveUsedCard } from '../../position/usedCardActions.js';
import type { UsedCardInstance } from '../../position/usedCards.js';
import { damage } from '../../flow/life.js';
import { effectRegistry } from '../../effects/persistentEffects.js';
import type { Game } from '../../game.js';

cardRegistry.register({
  type: CardType.LeBu,
  name: '乐不思蜀',
  emoji: '😄',
  content: async () => {}, // 使用效果 = UC 迁入目标判定区（引擎统一处理，见 flow/useCard.ts）
  delayContent: async (game, target, judgeCard) => {
    if (!judgeCard) return; // 被抵消 → 未执行效果，收尾进弃牌堆
    if (judgeCard.suit === '♥') {
      console.log(`  ${target.name} 的乐不思蜀判定为红桃，无事发生`);
    } else {
      target.skipPlayPhase = true;
      console.log(`  ${target.name} 的乐不思蜀生效，跳过出牌阶段`);
    }
  },
  tags: [CardTag.Trick, CardTag.Delay],
  canUse: (game, player, allPlayers) =>
    allPlayers.some((p) => p !== player && p.alive && !effectRegistry.has(game, p, 'immuneLeBu')),
  targetFilter: (game, user, allPlayers) =>
    allPlayers.filter((p) => p !== user && p.alive && !effectRegistry.has(game, p, 'immuneLeBu')),
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 70,
    discardPriority: 0,
  },
});

/**
 * 闪电转移：把它交给"下家"，若下家不是它的**合法目标**就继续往下家找（可绕回自己——
 * 自己的判定区此刻已空出，是合法目标）。所有角色都不是合法目标 → 不迁移，
 * 由判定阶段收尾进弃牌堆（规则集：目标区域不改动，依然为弃牌堆）。
 */
async function transferLightning(
  game: Game, target: Player, uc: UsedCardInstance, reason: string,
): Promise<boolean> {
  const players = game.state.players;
  const start = players.indexOf(target);
  for (let i = 1; i <= players.length; i++) {
    const next = players[(start + i) % players.length];
    if (!canPlaceDelayOn(game, uc, next)) continue;
    await moveUsedCard(game, uc, { kind: 'judgment', player: next }, { reason: 'transfer' });
    console.log(`  ${reason}，移到 ${next.name} 的判定区`);
    return true;
  }
  console.log(`  ${reason}，但无人可以承接，闪电进入弃牌堆`);
  return false;
}

cardRegistry.register({
  type: CardType.ShanDian,
  name: '闪电',
  emoji: '⚡',
  content: async () => {}, // 使用效果 = UC 迁入目标判定区（引擎统一处理，见 flow/useCard.ts）
  delayContent: async (game, target, judgeCard, uc) => {
    // 被无懈抵消（judgeCard = null）：未执行效果，但依然按闪电的收尾规则流向合法下家
    if (!judgeCard) {
      await transferLightning(game, target, uc, `${target.name} 的闪电被抵消`);
      return;
    }
    const explode = judgeCard.suit === '♠' && judgeCard.number >= 2 && judgeCard.number <= 9;
    if (explode) {
      console.log(
        `  ⚡${target.name} 的闪电判定为黑桃${displayNumber(judgeCard.number)}，受到 3 点雷电伤害`,
      );
      await damage(game, { target, amount: 3 }); // 雷电伤害无来源
    } else {
      await transferLightning(
        game, target, uc, `${target.name} 的闪电判定非黑桃2~9`,
      );
    }
  },
  tags: [CardTag.Trick, CardTag.Delay],
  canUse: () => true,
  targetFilter: (_game, user) => [user],
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 70,
    discardPriority: 0,
  },
});
