// ============================================================
// 刘备 — 仁德 / 激将（主公技）
// ============================================================

import { giveCards, useCard } from '../../position/cardActions.js';
import { recover } from '../../flow/life.js';
import {
  cardsStep, handCardsStep, targetsStep, computeTargetOptions, selectedCards, selectedPlayers,
} from '../../decision/choose.js';
import { cardRegistry } from '../cardRegistry.js';
import { defineSkill } from '../../effects/effects.js';
import { resolvePlayResponse } from '../../flow/respond.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../../game.js';
import { CardType } from '../../types.js';
import type { Card, Player, UsedCard } from '../../types.js';

defineSkill({
  name: '仁德',
  effects: [{
    form: 'activated',
    canUse: (game, player, ctx) =>
      !ctx.usedSkills.has('仁德') &&                              // 规则：每回合限一次
      player.hand.cards.length >= 1 &&                                  // 规则：需交出至少 1 张牌
      game.state.players.some((p) => p !== player && p.alive),    // 规则：需有其他角色
    selectionPlan: (game, player) => ({
      nextStep(answers) {
        if (!answers.cards) {
          return handCardsStep('cards', player, {
            prompt: '仁德：选择要交给的牌',
            min: 1,
            max: player.hand.cards.length,
            ai: (ctx) => ctx.step.options.slice(0, 2), // AI 默认给前两张
          });
        }
        if (!answers.target) {
          const candidates = game.state.players.filter((p) => p !== player && p.alive);
          return targetsStep('target', player, candidates, {
            prompt: '仁德：交给谁',
            min: 1,
            max: 1,
          });
        }
        return null;
      },
    }),
    execute: async (game, player, answers) => {
      const cards = selectedCards(answers, 'cards');
      const [target] = selectedPlayers(answers, 'target');
      if (!target || cards.length === 0) return;
      const given = await giveCards(game, player, target, cards);
      if (given.length >= 2) await recover(game, { target: player, amount: 1 });
      console.log(
        `  ✨${player.name} 发动【仁德】！交给 ${target.name} ${given.length} 张牌` +
        (given.length >= 2 ? '，回复 1 点体力' : ''),
      );
    },
    ai: {
      // AI：受伤才值得交牌换血
      shouldUse: (game, player) => player.hp < player.maxHp,
      priority: 0,
    },
  }],
});

/** 激将（出牌阶段借杀）：其他蜀势力角色手牌中的真杀 */
function allyShaSources(game: Game, player: Player): Card[] {
  return game.state.players
    .filter((p) => p.alive && p !== player && p.hero.group === '蜀')
    .flatMap((p) => p.hand.cards.filter((c) => c.type === CardType.Sha));
}

/** 由盟友提供的杀派生虚拟杀（花色/点数随源牌） */
function makeAllySha(source: Card): UsedCard {
  return {
    type: CardType.Sha,
    name: '杀',
    suit: source.suit,
    number: source.number,
    physicalCards: [source],
  };
}

defineSkill({
  name: '激将',
  meta: { lord: true },
  effects: [
    {
      form: 'response',
      name: '激将',
      respondsTo: CardType.Sha,
      canUse: (_game, _player, request) => request.type === 'play',
      selectionPlan: () => ({ nextStep: () => null }),
      resolve: async (game, player) => {
        const allies = game.state.players.filter(
          (p) => p.alive && p !== player && p.hero.group === player.hero.group,
        );
        for (const ally of allies) {
          if (await resolvePlayResponse(game, ally, CardType.Sha)) return 'done';
        }
        return 'retry';
      },
      ai: {
        shouldUse: () => true,
        priority: 90,
      },
    },
    {
      form: 'activated',
      // 规则：杀的次数/范围合法（Sha.canUse 把关）且存在蜀盟友手牌中的真杀
      canUse: (game, player, ctx) => {
        const shaDef = cardRegistry.get(CardType.Sha)!;
        return shaDef.canUse(player, game.state.players, ctx.shaUsed)
          && allyShaSources(game, player).length > 0;
      },
      selectionPlan: (game, player) => ({
        nextStep(answers) {
          if (!answers.source) {
            return cardsStep('source', allyShaSources(game, player), {
              prompt: '激将：选择盟友提供的杀',
              min: 1,
              max: 1,
            });
          }
          if (!answers.target) {
            const source = selectedCards(answers, 'source')[0];
            const used = makeAllySha(source);
            const targetOptions = computeTargetOptions(game, used, player);
            return targetsStep('target', player, targetOptions.map((t) => t.player), {
              prompt: '激将：选择杀的目标',
              min: 1,
              max: 1,
            });
          }
          return null;
        },
      }),
      execute: async (game, player, answers) => {
        const source = selectedCards(answers, 'source')[0];
        if (!source) return;
        await useCard(game, {
          player,
          card: makeAllySha(source),
          targets: selectedPlayers(answers, 'target'),
        });
        // 借盟友的杀当杀使用 → 消耗本阶段"使用杀"次数（等价于旧实现的 kind:'card' 判定）
        return { usedShaLimit: true };
      },
      ai: {
        shouldUse: () => true,
        priority: cardRegistry.get(CardType.Sha)!.ai.usePriority,
      },
    },
  ],
});

heroRegistry.register({ name: '刘备', maxHp: 4, sex: 'male', group: '蜀', isLord: true, skills: ['仁德', '激将'] });
