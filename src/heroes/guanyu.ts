// ============================================================
// 关羽 — 武圣（红色牌当杀）
// ============================================================

import { cardRegistry } from '../cardRegistry.js';
import { handCardsStep, targetsStep, computeTargetOptions, selectedCards, selectedPlayers } from '../choose.js';
import { conversionRegistry } from '../conversions.js';
import { heroRegistry } from '../heroRegistry.js';
import { CardType } from '../types.js';
import type { Card, UsedCard } from '../types.js';

function isRed(card: Card): boolean {
  return card.suit === '♥' || card.suit === '♦';
}

function makeVirtualSha(sources: Card[]): UsedCard {
  const source = sources[0];
  return {
    type: CardType.Sha,
    name: '杀',
    suit: source.suit,
    number: source.number,
    physicalCards: sources,
  };
}

conversionRegistry.register({
  name: '武圣',
  toType: CardType.Sha,
  canUse: (game, player, shaUsed) => {
    const def = cardRegistry.get(CardType.Sha)!;
    return player.hand.some(isRed)
      && def.canUse(player, game.state.players, shaUsed);
  },
  selectionPlan: (game, player) => ({
    nextStep(answers) {
      if (!answers.source) {
        return handCardsStep('source', player, {
          prompt: '武圣：选择一张红色牌当杀',
          filter: isRed,
          min: 1,
          max: 1,
        });
      }
      if (!answers.target) {
        const sources = selectedCards(answers, 'source');
        const used = makeVirtualSha(sources);
        const targetOptions = computeTargetOptions(game, used, player);
        return targetsStep('target', player, targetOptions.map((t) => t.player), {
          prompt: '武圣：选择杀的目标',
          min: 1,
          max: 1,
        });
      }
      return null;
    },
    result: (answers) => ({ answers }),
  }),
  resolve: (answers) => ({
    card: makeVirtualSha(selectedCards(answers, 'source')),
    targets: selectedPlayers(answers, 'target'),
  }),
  ai: {
    shouldUse: (game, player, shaUsed) => {
      const def = cardRegistry.get(CardType.Sha)!;
      return def.ai.shouldUse(player, shaUsed);
    },
    usePriority: cardRegistry.get(CardType.Sha)!.ai.usePriority,
  },
});

heroRegistry.register({
  name: '关羽',
  maxHp: 4,
  sex: 'male',
  group: '蜀',
  skills: ['武圣'],
});
