// ============================================================
// 夏侯惇 — 刚烈
// ============================================================

import { discardCards, judge } from '../cardActions.js';
import { damage } from '../life.js';
import { skillRegistry, subjectIsOwner } from '../skills.js';
import type { GameEvent } from '../events/index.js';
import type { DamageEventData } from '../events/index.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../game.js';
import type { Player } from '../types.js';

/** 刚烈：受到伤害后判定，非红桃则伤害来源弃两张手牌或受 1 点伤害 */
const ganglieContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  const { source } = event.data as DamageEventData;
  if (!source) return; // 无来源伤害（如闪电）无法结算刚烈
  const card = await judge(game, owner);
  if (card.suit === '♥') return; // 红桃 → 无事发生

  // 伤害来源：手牌足够则弃两张，否则受到来自你的 1 点伤害
  if (source.hand.length >= 2) {
    const discarded = discardCards(game, source, source.hand.slice(0, 2));
    console.log(`  ${source.name} 弃置 ${discarded.length} 张手牌以响应【刚烈】`);
  } else {
    await damage(game, { target: source, source: owner, amount: 1 });
  }
};

skillRegistry.register({
  name: '刚烈',
  trigger: 'damage.after',
  canTrigger: subjectIsOwner,
  content: ganglieContent,
});

heroRegistry.register({ name: '夏侯惇', maxHp: 4, sex: 'male', group: '魏', skills: ['刚烈'] });
