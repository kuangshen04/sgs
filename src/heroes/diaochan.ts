// ============================================================
// 貂蝉 — 闭月
// ============================================================

import { drawCards } from '../cardActions.js';
import { skillRegistry, subjectIsOwner } from '../skills.js';
import type { GameEvent } from '../events/index.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../game.js';
import type { Player } from '../types.js';

/** 闭月：结束阶段摸一张牌 */
const biyueContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  const before = owner.hand.length;
  await drawCards(game, { target: owner, count: 1 });
  console.log(
    `  ✨${owner.name} 发动【闭月】！回合结束摸了 1 张牌` +
    `（${before} → ${owner.hand.length}）`,
  );
};

skillRegistry.register({
  name: '闭月',
  trigger: 'endPhase.before',
  canTrigger: subjectIsOwner,
  content: biyueContent,
});

heroRegistry.register({ name: '貂蝉', maxHp: 3, skills: ['闭月'] });
