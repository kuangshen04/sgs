// ============================================================
// 甄宓 — 洛神
// ============================================================

import { judge, takeFromDiscard } from '../cardActions.js';
import { cardEmoji, displayNumber } from '../cardRegistry.js';
import { askYesNo } from '../choose.js';
import { skillRegistry, subjectIsOwner } from '../skills.js';
import type { GameEvent } from '../events/index.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../game.js';
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

heroRegistry.register({ name: '甄宓', maxHp: 3, sex: 'female', group: '魏', skills: ['洛神'] });
