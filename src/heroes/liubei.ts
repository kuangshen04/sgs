// ============================================================
// 刘备 — 仁德
// ============================================================

import { giveCards } from '../cardActions.js';
import { recover } from '../life.js';
import { activeSkillRegistry } from '../skills.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../game.js';
import type { Player } from '../types.js';

/** 仁德：出牌阶段限一次，交给其他角色两张牌，然后回复 1 点体力 */
const rendeContent = async (game: Game, player: Player): Promise<void> => {
  if (player.hand.length < 2) return;
  const target = game.state.players.find((p) => p !== player && p.alive);
  if (!target) return;
  const given = giveCards(player, target, player.hand.slice(0, 2));
  await recover(game, { target: player, amount: 1 });
  console.log(
    `  ✨${player.name} 发动【仁德】！交给 ${target.name} ${given.length} 张牌，回复 1 点体力`,
  );
};

activeSkillRegistry.register({
  name: '仁德',
  canUse: (game, player, ctx) =>
    !ctx.usedSkills.has('仁德') &&                              // 规则：每回合限一次
    player.hand.length >= 2 &&                                  // 规则：需交出 2 张牌
    game.state.players.some((p) => p !== player && p.alive),    // 规则：需有其他角色
  content: rendeContent,
  ai: {
    // AI：受伤才值得交牌换血
    shouldUse: (game, player) => player.hp < player.maxHp,
    priority: 0,
  },
});

heroRegistry.register({ name: '刘备', maxHp: 4, skills: ['仁德'] });
