// ============================================================
// 三国杀最小原型 — 延时锦囊（乐不思蜀 / 闪电）
// ============================================================

import { CardTag, CardType } from '../../types.js';
import { cardRegistry, displayNumber } from '../cardRegistry.js';
import { moveUsedCard, hasJudgmentUsedCardNamed } from '../../position/usedCardActions.js';
import { damage } from '../../flow/life.js';
import { effectRegistry } from '../../effects/persistentEffects.js';

cardRegistry.register({
  type: CardType.LeBu,
  name: '乐不思蜀',
  emoji: '😄',
  content: async () => {}, // 使用效果 = UC 迁入目标判定区（引擎统一处理，见 flow/useCard.ts）
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
  content: async () => {}, // 使用效果 = UC 迁入目标判定区（引擎统一处理，见 flow/useCard.ts）
  delayContent: async (game, target, judgeCard, uc) => {
    const explode = judgeCard.suit === '♠' && judgeCard.number >= 2 && judgeCard.number <= 9;
    if (explode) {
      console.log(
        `  ⚡${target.name} 的闪电判定为黑桃${displayNumber(judgeCard.number)}，受到 3 点雷电伤害`,
      );
      await damage(game, { target, amount: 3 }); // 雷电伤害无来源
    } else {
      // 判定非黑桃2~9 → 按座位（行动）顺序找第一个**可以成为闪电目标**的角色：
      // 跳过已死的与"判定区已有同名（闪电）UC"的；都没有 → 不迁移，由判定阶段收尾进弃牌堆。
      const players = game.state.players;
      const start = players.indexOf(target);
      for (let i = 1; i < players.length; i++) {
        const next = players[(start + i) % players.length];
        if (!next.alive) continue;
        if (hasJudgmentUsedCardNamed(game, next, uc.name)) continue;
        await moveUsedCard(game, uc, { kind: 'judgment', player: next }, { reason: 'transfer' });
        console.log(`  ${target.name} 的闪电判定非黑桃2~9，移到 ${next.name} 的判定区`);
        return;
      }
      console.log(`  ${target.name} 的闪电判定非黑桃2~9，但无人可以承接，闪电进入弃牌堆`);
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
