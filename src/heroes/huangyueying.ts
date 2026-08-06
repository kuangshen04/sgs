// ============================================================
// 黄月英 — 集智
// ============================================================

import { drawCards } from '../cardActions.js';
import { cardRegistry } from '../cardRegistry.js';
import { effectRegistry } from '../persistentEffects.js';
import { skillRegistry } from '../skills.js';
import type { GameEvent } from '../events/index.js';
import { CardTag } from '../types.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../game.js';
import type { Player } from '../types.js';

/** 集智：使用普通锦囊牌时，摸一张牌 */
const jizhiContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  await drawCards(game, { target: owner, count: 1 });
  console.log(`  ✨${owner.name} 发动【集智】！使用锦囊摸了 1 张牌`);
};

skillRegistry.register({
  name: '集智',
  trigger: 'useCard.after',
  canTrigger: (game, event, owner, subject) => {
    if (subject !== owner) return false;
    const def = cardRegistry.get(event.data.card.type);
    return !!def?.tags.includes(CardTag.Trick) && !def.tags.includes(CardTag.Delay);
  },
  content: jizhiContent,
});

// 锁定技：使用锦囊牌无距离限制（顺手牵羊等距离类锦囊的豁免）
effectRegistry.register({
  kind: 'noTrickDistance',
  value: (player: Player) => (player.hero.skills?.includes('奇才') ? 1 : 0),
});

heroRegistry.register({ name: '黄月英', maxHp: 3, sex: 'female', group: '蜀', skills: ['集智', '奇才'] });
