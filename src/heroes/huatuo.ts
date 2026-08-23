// ============================================================
// 华佗 — 青囊
// ============================================================

import { discardCards } from '../cardActions.js';
import { recover } from '../life.js';
import { handCardsStep, targetsStep, selectedCards, selectedPlayers } from '../choose.js';
import { activeSkillRegistry } from '../skills.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../game.js';
import type { Player } from '../types.js';

activeSkillRegistry.register({
  name: '青囊',
  canUse: (game, player, ctx) =>
    !ctx.usedSkills.has('青囊') &&                              // 每回合限一次
    player.hand.length >= 1 &&                                  // 需弃 1 张手牌
    game.state.players.some((p) => p.alive && p.hp < p.maxHp),  // 需有受伤角色
  selectionPlan: (game, player) => ({
    nextStep(answers) {
      if (!answers.target) {
        return targetsStep('target', player, [player], {
          prompt: '青囊：回复谁（简化只给自己）',
          min: 1,
          max: 1,
        });
      }
      if (!answers.card) {
        return handCardsStep('card', player, {
          prompt: '青囊：选择弃置的手牌',
          min: 1,
          max: 1,
        });
      }
      return null;
    },
    result: (answers) => ({ answers }),
  }),
  execute: async (game, player, answers) => {
    const cards = selectedCards(answers, 'card');
    const [target] = selectedPlayers(answers, 'target');
    if (!target || cards.length === 0) return;
    await discardCards(game, player, cards);
    await recover(game, { target, amount: 1 });
    console.log(`  ✨${player.name} 发动【青囊】！弃置 ${cards.length} 张手牌，回复 1 点体力`);
  },
  ai: {
    // AI：只给自己回血
    shouldUse: (game, player) => player.hp < player.maxHp,
    priority: 0,
  },
});

heroRegistry.register({ name: '华佗', maxHp: 3, sex: 'male', group: '群', skills: ['青囊'] });
