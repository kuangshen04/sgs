// ============================================================
// 黄月英 — 集智 / 奇才（锁定技）
// ============================================================

import { drawCards } from '../../position/cardActions.js';
import type { GameEvent } from '../../events/index.js';
import { CardTag } from '../../types.js';
import type { Game } from '../../game.js';
import type { Player } from '../../types.js';
import type { Container } from '../../rules/ruleSet.js';

/** 集智：使用普通锦囊牌时，摸一张牌 */
const jizhiContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  await drawCards(game, { target: owner, count: 1 });
  console.log(`  ✨${owner.name} 发动【集智】！使用锦囊摸了 1 张牌`);
};

// ── 装配（显式注册进容器；参数 c = 装配期容器）──────────────────────
export function installHuangyueying(c: Container): void {
  c.skills.define({
    name: '集智',
    effects: [{
      form: 'triggered',
      timing: 'useCard.after',
      condition: (game, event, owner, subject) => {
        if (subject !== owner) return false;
        const def = game.ruleSet.cards.get(event.data.card.type);
        return !!def?.tags.includes(CardTag.Trick) && !def.tags.includes(CardTag.Delay);
      },
      run: jizhiContent,
    }],
  });

  /** 奇才：锁定技，使用锦囊牌无距离限制（顺手牵羊等距离类锦囊的豁免） */
  c.skills.define({
    name: '奇才',
    meta: { compulsory: true },
    effects: [{ form: 'persistent', key: 'noTrickDistance', value: () => 1 }],
  });

  c.heroes.register({ name: '黄月英', maxHp: 3, sex: 'female', group: '蜀', skills: ['集智', '奇才'] });
}
