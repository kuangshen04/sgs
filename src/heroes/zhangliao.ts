// ============================================================
// 张辽 — 突袭
// ============================================================

import { giveCards } from '../cardActions.js';
import { shuffle } from '../cardRegistry.js';
import { skillRegistry, subjectIsOwner } from '../skills.js';
import type { GameEvent } from '../events/index.js';
import type { DrawPhaseEventData } from '../events/index.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../game.js';
import type { Player } from '../types.js';

/** 突袭：摸牌阶段，改为获得至多两名其他角色的各一张手牌（摸牌数改为 0） */
const tuxiContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  const drawPhaseEvent = event as GameEvent<DrawPhaseEventData>;
  drawPhaseEvent.data.count = 0; // 摸牌阶段的摸牌数改为 0
  const candidates = game.state.players.filter(
    (p) => p !== owner && p.alive && p.hand.length > 0,
  );
  // TODO(玩家选择): 突袭抢哪两名角色——目前写死为随机
  const picks = shuffle(candidates).slice(0, Math.min(2, candidates.length));
  for (const target of picks) {
    const card = target.hand[Math.floor(Math.random() * target.hand.length)];
    giveCards(target, owner, [card]);
    console.log(`  ✨${owner.name} 发动【突袭】！获得 ${target.name} 的一张手牌`);
  }
};

skillRegistry.register({
  name: '突袭',
  trigger: 'drawPhase.before',
  canTrigger: (game, event, owner, subject) =>
    subject === owner &&
    game.state.players.some((p) => p !== owner && p.alive && p.hand.length > 0),
  content: tuxiContent,
});

heroRegistry.register({ name: '张辽', maxHp: 4, skills: ['突袭'] });
