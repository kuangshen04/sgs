// ============================================================
// 三国杀最小原型 — 延时锦囊（乐不思蜀 / 闪电）
// ============================================================

import { CardTag, CardType } from '../types.js';
import { cardRegistry, displayNumber } from '../cardRegistry.js';
import { moveCards } from '../cardActions.js';
import { damage } from '../life.js';
import { effectRegistry } from '../persistentEffects.js';

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
        await moveCards(game, {
          to: { player: next, zone: 'judgment' },
          cards: [card],
          reason: 'transfer',
        });
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
