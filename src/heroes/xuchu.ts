// ============================================================
// 许褚 — 裸衣
// ============================================================

import { skillRegistry, subjectIsOwner } from '../skills.js';
import { EventType } from '../events/index.js';
import type { GameEvent } from '../events/index.js';
import type { DrawPhaseEventData } from '../events/index.js';
import { CardType } from '../types.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../game.js';
import type { Player } from '../types.js';

/**
 * 裸衣：摸牌阶段少摸一张牌；本回合内使用【杀】或【决斗】造成的伤害+1。
 * 伤害判定的依据是"使用方是自己"（useCard 的使用者），而非伤害来源——
 * 因此决斗中自己被打败所受的伤害同样+1。
 * 临时 damage.before 在回合结束时（turn.after）取消注册。
 */
const luoyiContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  const drawPhaseEvent = event as GameEvent<DrawPhaseEventData>;
  drawPhaseEvent.data.count -= 1; // 少摸一张

  // 临时伤害加成：本回合内使用【杀】/【决斗】造成的伤害+1
  const damageBuff = async (damageEvent: GameEvent<any>): Promise<void> => {
    const useCard = damageEvent.getParent(EventType.UseCard);
    if (!useCard || useCard.data.player !== owner) return; // 使用方是自己
    const cardType = useCard.data.card.type;
    if (cardType !== CardType.Sha && cardType !== CardType.JueDou) return;
    damageEvent.data.amount += 1;
    console.log(`  ✨${owner.name} 的【裸衣】生效！杀/决斗伤害+1`);
  };

  // 回合结束清理：取消两个临时注册
  const cleanup = async (turnEvent: GameEvent<any>): Promise<void> => {
    if (turnEvent.data.player !== owner) return;
    game.triggerSystem.off('damage.before', damageBuff);
    game.triggerSystem.off('turn.after', cleanup);
    console.log(`  ${owner.name} 的【裸衣】效果结束`);
  };

  game.triggerSystem.on('damage.before', damageBuff);
  game.triggerSystem.on('turn.after', cleanup);
  console.log(`  ✨${owner.name} 发动【裸衣】！少摸 1 张牌，本回合杀/决斗伤害+1`);
};

skillRegistry.register({
  name: '裸衣',
  trigger: 'drawPhase.before',
  canTrigger: subjectIsOwner,
  content: luoyiContent,
});

heroRegistry.register({ name: '许褚', maxHp: 4, sex: 'male', group: '魏', skills: ['裸衣'] });
