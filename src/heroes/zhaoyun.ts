// ============================================================
// 赵云 — 龙胆（① 出牌阶段：闪当杀）
// ② 杀当闪/响应方向仍挂起，等响应窗口建模。
// ============================================================

import { cardRegistry, asUsedCard } from '../cardRegistry.js';
import { handCardsStep, targetsStep, computeTargetOptions, selectedCards, selectedPlayers } from '../choose.js';
import { playUsedCard } from '../cardActions.js';
import { conversionRegistry } from '../conversions.js';
import { responseRuleRegistry } from '../responses.js';
import { heroRegistry } from '../heroRegistry.js';
import { CardType } from '../types.js';
import type { Card, UsedCard } from '../types.js';

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
  name: '龙胆',
  toType: CardType.Sha,
  canUse: (game, player, shaUsed) => {
    const def = cardRegistry.get(CardType.Sha)!;
    return player.hand.some((c) => c.type === CardType.Shan)
      && def.canUse(player, game.state.players, shaUsed);
  },
  selectionPlan: (game, player) => ({
    nextStep(answers) {
      if (!answers.source) {
        return handCardsStep('source', player, {
          prompt: '龙胆：选择一张闪当杀',
          filter: (c) => c.type === CardType.Shan,
          min: 1,
          max: 1,
        });
      }
      if (!answers.target) {
        const sources = selectedCards(answers, 'source');
        const used = makeVirtualSha(sources);
        const targetOptions = computeTargetOptions(game, used, player);
        return targetsStep('target', player, targetOptions.map((t) => t.player), {
          prompt: '龙胆：选择杀的目标',
          min: 1,
          max: 1,
        });
      }
      return null;
    },
  }),
  resolve: (answers) => ({
    card: makeVirtualSha(selectedCards(answers, 'source')),
    targets: selectedPlayers(answers, 'target'),
  }),
  ai: {
    shouldUse: (_game, _player, shaUsed) => {
      const def = cardRegistry.get(CardType.Sha)!;
      return def.ai.shouldUse(_player, shaUsed);
    },
    usePriority: cardRegistry.get(CardType.Sha)!.ai.usePriority,
  },
});

responseRuleRegistry.register({
  name: '龙胆·当杀',
  respondsTo: CardType.Sha,
  ownerSkill: '龙胆',
  canUse: (_game, player, request) =>
    request.type === 'play' && player.hand.some((c) => c.type === CardType.Shan),
  selectionPlan: (_game, player) => ({
    nextStep(answers) {
      if (answers.source) return null;
      return handCardsStep('source', player, {
        prompt: '龙胆：选择一张闪当杀',
        filter: (c) => c.type === CardType.Shan,
        min: 1,
        max: 1,
      });
    },
  }),
  resolve: async (game, player, _request, answers) => {
    const source = selectedCards(answers, 'source')[0];
    if (source) await playUsedCard(game, player, asUsedCard(source));
    return 'done';
  },
  ai: {
    shouldUse: () => true,
    priority: 50,
  },
});

responseRuleRegistry.register({
  name: '龙胆·当闪',
  respondsTo: CardType.Shan,
  ownerSkill: '龙胆',
  canUse: (_game, player) => player.hand.some((c) => c.type === CardType.Sha),
  selectionPlan: (_game, player) => ({
    nextStep(answers) {
      if (answers.source) return null;
      return handCardsStep('source', player, {
        prompt: '龙胆：选择一张杀当闪',
        filter: (c) => c.type === CardType.Sha,
        min: 1,
        max: 1,
      });
    },
  }),
  resolve: async (game, player, _request, answers) => {
    const source = selectedCards(answers, 'source')[0];
    if (source) await playUsedCard(game, player, asUsedCard(source));
    return 'done';
  },
  ai: {
    shouldUse: () => true,
    priority: 50,
  },
});

heroRegistry.register({
  name: '赵云',
  maxHp: 4,
  sex: 'male',
  group: '蜀',
  skills: ['龙胆'],
});
