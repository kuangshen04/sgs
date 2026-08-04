// ============================================================
// 周瑜 — 英姿 / 反间
// ============================================================

import { drawCards, giveCards } from '../cardActions.js';
import { damage } from '../life.js';
import { activeSkillRegistry, skillRegistry, subjectIsOwner } from '../skills.js';
import type { GameEvent } from '../events/index.js';
import type { DrawPhaseEventData } from '../events/index.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../game.js';
import type { Player } from '../types.js';

/** 英姿：摸牌阶段多摸一张牌 */
const yingziContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  const drawPhaseEvent = event as GameEvent<DrawPhaseEventData>;
  drawPhaseEvent.data.count += 1;
  console.log(`  ✨${owner.name} 发动【英姿】！摸牌阶段多摸 1 张牌`);
};

/** 反间：出牌阶段限一次，交给其他角色一张牌，然后对其造成 1 点伤害 */
const fanjianContent = async (game: Game, player: Player): Promise<void> => {
  if (player.hand.length === 0) return;
  const target = game.state.players.find((p) => p !== player && p.alive);
  if (!target) return;
  giveCards(player, target, [player.hand[0]]);
  await damage(game, { target, source: player, amount: 1 });
  console.log(
    `  ✨${player.name} 发动【反间】！交给 ${target.name} 1 张牌并造成 1 点伤害`,
  );
};

skillRegistry.register({
  name: '英姿',
  trigger: 'drawPhase.before',
  canTrigger: subjectIsOwner,
  content: yingziContent,
});

activeSkillRegistry.register({
  name: '反间',
  canUse: (game, player, ctx) =>
    !ctx.usedSkills.has('反间') &&                              // 规则：每回合限一次
    player.hand.length >= 1 &&                                  // 规则：需交出 1 张牌
    game.state.players.some((p) => p !== player && p.alive),    // 规则：需有其他角色
  content: fanjianContent,
  ai: {
    // AI：进攻技能，合法就用
    shouldUse: () => true,
    priority: 0,
  },
});

heroRegistry.register({ name: '周瑜', maxHp: 3, skills: ['英姿', '反间'] });
