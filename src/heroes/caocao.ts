// ============================================================
// 曹操 — 奸雄
// ============================================================

import { takeFromProcessing } from '../cardActions.js';
import { cardEmoji, displayNumber } from '../cardRegistry.js';
import { responseRuleRegistry } from '../responses.js';
import { resolvePlayResponse } from '../respond.js';
import { skillRegistry, subjectIsOwner } from '../skills.js';
import { EventType } from '../events/index.js';
import type { GameEvent } from '../events/index.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../game.js';
import { CardType } from '../types.js';
import type { Player } from '../types.js';

/** 奸雄：受到伤害后，若伤害由使用牌造成，获得该牌 */
const jianxiongContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  const useCardEvent = event.getParent(EventType.UseCard);
  if (!useCardEvent) return; // 非使用牌造成的伤害（如技能伤害）
  const { physicalCards } = useCardEvent.data.card;

  // 使用的虚拟牌对应的全部实体牌，结算期间都位于处理区
  for (const physical of physicalCards) {
    const found = await takeFromProcessing(game, owner, physical);
    if (!found) continue;
    console.log(
      `  ✨${owner.name} 发动【奸雄】！获得造成伤害的 ${cardEmoji(found.type)} ` +
      `(${found.suit}${displayNumber(found.number)})`,
    );
  }
};

skillRegistry.register({
  name: '奸雄',
  trigger: 'damage.after',
  canTrigger: subjectIsOwner,
  content: jianxiongContent,
});

/** 护驾：需要打出闪时，可请其他魏势力角色代打 */
responseRuleRegistry.register({
  name: '护驾',
  respondsTo: CardType.Shan,
  ownerSkill: '护驾',
  lordOnly: true,
  canUse: (_game, _player, request) => request.type === 'play',
  selectionPlan: () => ({ nextStep: () => null }),
  resolve: async (game, player) => {
    const allies = game.state.players.filter(
      (p) => p.alive && p !== player && p.hero.group === player.hero.group,
    );
    for (const ally of allies) {
      if (await resolvePlayResponse(game, ally, CardType.Shan)) return 'done';
    }
    return 'retry';
  },
  ai: {
    shouldUse: () => true,
    priority: 90,
  },
});

heroRegistry.register({
  name: '曹操', maxHp: 4, sex: 'male', group: '魏', isLord: true, skills: ['奸雄', '护驾'],
});
