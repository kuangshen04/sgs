// ============================================================
// 曹操 — 奸雄
// ============================================================

import { takeFromDiscard } from '../cardActions.js';
import { cardEmoji, displayNumber } from '../cardRegistry.js';
import { skillRegistry, subjectIsOwner } from '../skills.js';
import { EventType } from '../events/index.js';
import type { GameEvent } from '../events/index.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../game.js';
import type { Card, Player } from '../types.js';

/** 奸雄：受到伤害后，若伤害由使用牌造成，获得该牌 */
const jianxiongContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  const useCardEvent = event.getParent(EventType.UseCard);
  if (!useCardEvent) return; // 非使用牌造成的伤害（如技能伤害）
  const card = useCardEvent.data.card as Card;

  // 使用的牌已进弃牌堆：从弃牌堆找回并收入手牌
  const found = await takeFromDiscard(game, owner, card);
  if (!found) return;
  console.log(
    `  ✨${owner.name} 发动【奸雄】！获得造成伤害的 ${cardEmoji(found.type)} ` +
    `(${found.suit}${displayNumber(found.number)})`,
  );
};

skillRegistry.register({
  name: '奸雄',
  trigger: 'damage.after',
  canTrigger: subjectIsOwner,
  content: jianxiongContent,
});

heroRegistry.register({ name: '曹操', maxHp: 4, sex: 'male', group: '魏', skills: ['奸雄'] });
