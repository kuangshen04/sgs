// ============================================================
// 刘备 — 仁德
// ============================================================

import { giveCards } from '../cardActions.js';
import { recover } from '../life.js';
import { handCardsStep, targetsStep, selectedCards, selectedPlayers } from '../choose.js';
import { activeSkillRegistry } from '../skills.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../game.js';
import type { Player } from '../types.js';

activeSkillRegistry.register({
  name: '仁德',
  canUse: (game, player, ctx) =>
    !ctx.usedSkills.has('仁德') &&                              // 规则：每回合限一次
    player.hand.length >= 1 &&                                  // 规则：需交出至少 1 张牌
    game.state.players.some((p) => p !== player && p.alive),    // 规则：需有其他角色
  selectionPlan: (game, player) => ({
    nextStep(answers) {
      if (!answers.cards) {
        return handCardsStep('cards', player, {
          prompt: '仁德：选择要交给的牌',
          min: 1,
          max: player.hand.length,
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
});

heroRegistry.register({ name: '刘备', maxHp: 4, sex: 'male', group: '蜀', isLord: true, skills: ['仁德'] });
