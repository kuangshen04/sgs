// ============================================================
// 华佗 — 青囊
// ============================================================

import { discardCards } from '../cardActions.js';
import { recover } from '../life.js';
import { askForTargets } from '../choose.js';
import { activeSkillRegistry } from '../skills.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../game.js';
import type { Player } from '../types.js';

/** 青囊：出牌阶段限一次，弃置一张手牌并令一名角色回复 1 点体力（AI 只给自己回血） */
const qingnangContent = async (game: Game, player: Player): Promise<void> => {
  if (player.hand.length === 0) return;
  // askForTargets：青囊目标（简化：只给自己）
  const targets = askForTargets(game, player, '青囊：回复谁（简化只给自己）', [player], 1);
  if (!targets) return;
  await discardCards(game, player, [player.hand[0]]);
  await recover(game, { target: targets[0], amount: 1 });
  console.log(`  ✨${player.name} 发动【青囊】！弃置 1 张手牌，回复 1 点体力`);
};

activeSkillRegistry.register({
  name: '青囊',
  canUse: (game, player, ctx) =>
    !ctx.usedSkills.has('青囊') &&                              // 每回合限一次
    player.hand.length >= 1 &&                                  // 需弃 1 张手牌
    game.state.players.some((p) => p.alive && p.hp < p.maxHp),  // 需有受伤角色
  content: qingnangContent,
  ai: {
    // AI：只给自己回血
    shouldUse: (game, player) => player.hp < player.maxHp,
    priority: 0,
  },
});

heroRegistry.register({ name: '华佗', maxHp: 3, sex: 'male', group: '群', skills: ['青囊'] });
