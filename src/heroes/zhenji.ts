// ============================================================
// 甄宓 — 洛神
// ============================================================

import { judge, takeFromDiscard } from '../cardActions.js';
import { playUsedCard } from '../cardActions.js';
import { cardEmoji, displayNumber, asUsedCard } from '../cardRegistry.js';
import { askYesNo, handCardsStep, selectedCards } from '../choose.js';
import { skillRegistry, subjectIsOwner } from '../skills.js';
import { responseRuleRegistry } from '../responses.js';
import type { GameEvent } from '../events/index.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../game.js';
import { CardType } from '../types.js';
import type { Player } from '../types.js';

/** 洛神：准备阶段判定，黑色获得判定牌并继续，红色停止 */
const luoshenContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  console.log(`  ✨${owner.name} 发动【洛神】！`);
  while (true) {
    // askYesNo：是否继续判定（默认 AI：自动继续直到红色）
    if (!(await askYesNo(game, owner, '洛神：是否继续判定', true))) break;
    const card = await judge(game, owner);
    if (card.suit !== '♠' && card.suit !== '♣') {
      console.log(`  ${owner.name} 洛神判定为红色，停止`);
      break;
    }
    const found = await takeFromDiscard(game, owner, card);
    if (!found) break;
    console.log(
      `  ${owner.name} 洛神获得 ${cardEmoji(found.type)} ` +
      `(${found.suit}${displayNumber(found.number)})`,
    );
  }
};

skillRegistry.register({
  name: '洛神',
  trigger: 'preparePhase.before',
  canTrigger: subjectIsOwner,
  content: luoshenContent,
});

responseRuleRegistry.register({
  name: '倾国·当闪',
  respondsTo: CardType.Shan,
  ownerSkill: '倾国',
  canUse: (_game, player) =>
    player.hand.some((c) => c.suit === '♠' || c.suit === '♣'),
  selectionPlan: (_game, player) => ({
    nextStep(answers) {
      if (answers.source) return null;
      return handCardsStep('source', player, {
        prompt: '倾国：选择一张黑色牌当闪',
        filter: (c) => c.suit === '♠' || c.suit === '♣',
        min: 1,
        max: 1,
      });
    },
  }),
  resolve: async (game, player, _request, answers) => {
    const source = selectedCards(answers, 'source')[0];
    if (source) await playUsedCard(game, player, asUsedCard(source));
    return 'done';
  },
  ai: {
    shouldUse: () => true,
    priority: 50,
  },
});

heroRegistry.register({ name: '甄宓', maxHp: 3, sex: 'female', group: '魏', skills: ['洛神', '倾国'] });
