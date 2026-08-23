// ============================================================
// 甘宁 — 奇袭（黑色牌当过河拆桥）
// ============================================================

import { cardRegistry } from '../cardRegistry.js';
import { handCardsStep, targetsStep, computeTargetOptions, selectedCards, selectedPlayers } from '../choose.js';
import { conversionRegistry } from '../conversions.js';
import { heroRegistry } from '../heroRegistry.js';
import { CardType } from '../types.js';
import type { Card, UsedCard } from '../types.js';

function isBlack(card: Card): boolean {
  return card.suit === '♠' || card.suit === '♣';
}

function makeVirtualGuohe(sources: Card[]): UsedCard {
  const source = sources[0];
  return {
    type: CardType.GuoHe,
    name: '过河拆桥',
    suit: source.suit,
    number: source.number,
    physicalCards: sources,
  };
}

conversionRegistry.register({
  name: '奇袭',
  toType: CardType.GuoHe,
  canUse: (game, player) => {
    const def = cardRegistry.get(CardType.GuoHe)!;
    return player.hand.some(isBlack)
      && def.canUse(player, game.state.players, false);
  },
  selectionPlan: (game, player) => ({
    nextStep(answers) {
      if (!answers.source) {
        return handCardsStep('source', player, {
          prompt: '奇袭：选择一张黑色牌当过河拆桥',
          filter: isBlack,
          min: 1,
          max: 1,
        });
      }
      if (!answers.target) {
        const sources = selectedCards(answers, 'source');
        const used = makeVirtualGuohe(sources);
        const targetOptions = computeTargetOptions(game, used, player);
        return targetsStep('target', player, targetOptions.map((t) => t.player), {
          prompt: '奇袭：选择过河拆桥的目标',
          min: 1,
          max: 1,
        });
      }
      return null;
    },
  }),
  resolve: (answers) => ({
    card: makeVirtualGuohe(selectedCards(answers, 'source')),
    targets: selectedPlayers(answers, 'target'),
  }),
  ai: {
    shouldUse: (_game, _player) => true,
    usePriority: cardRegistry.get(CardType.GuoHe)!.ai.usePriority,
  },
});

heroRegistry.register({
  name: '甘宁',
  maxHp: 4,
  sex: 'male',
  group: '吴',
  skills: ['奇袭'],
});
