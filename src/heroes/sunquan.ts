// ============================================================
// 孙权 — 制衡
// ============================================================

import { discardCards, drawCards } from '../cardActions.js';
import { activeSkillRegistry } from '../skills.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../game.js';
import type { Player } from '../types.js';

/** 制衡：每回合限一次，弃置所有手牌并摸等量（简化：不任选） */
const zhihengContent = async (game: Game, player: Player): Promise<void> => {
  const count = player.hand.length;
  if (count === 0) return;
  discardCards(game, player, [...player.hand]);
  await drawCards(game, { target: player, count });
  console.log(
    `  ✨${player.name} 发动【制衡】！弃置 ${count} 张牌，摸了 ${count} 张牌`,
  );
};

activeSkillRegistry.register({
  name: '制衡',
  canUse: (game, player, ctx) =>
    !ctx.usedSkills.has('制衡') && // 规则：每回合限一次
    player.hand.length > 0,        // 规则：简化模型需有牌可弃
  content: zhihengContent,
  ai: {
    // AI：本轮选不出想出的牌时才换牌
    shouldUse: (_game, _player, ctx) => ctx.cardChoice === null,
    priority: 0,
  },
});

heroRegistry.register({ name: '孙权', maxHp: 4, skills: ['制衡'] });
