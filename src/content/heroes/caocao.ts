// ============================================================
// 曹操 — 奸雄
// ============================================================

import { exitUsedCard, materializeUsedCard } from '../../position/usedCardActions.js';
import { cardEmoji, cardFaceText } from '../cardRegistry.js';
import { resolvePlayResponse } from '../../flow/respond.js';
import { defineSkill } from '../../effects/effects.js';
import type { DamageEventData } from '../../events/index.js';
import type { GameEvent } from '../../events/index.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../../game.js';
import { CardType } from '../../types.js';
import type { Player } from '../../types.js';

/**
 * 奸雄：受到伤害后，若伤害由使用牌造成，获得该牌。
 * 因果判定走 DamageEventData.card（规则层在"牌直接造成伤害"处显式赋值，演进 2.3）——
 * 不再经 getParent('useCard') 推断：刚烈等在 damage.after 内发起的反击伤害
 * 嵌套于原伤害之下，栈查询会把反击伤害误归给原杀/决斗（已知问题，本修复针对它）。
 *
 * **读 UC 拿实体牌**（演进 3.5）：造成伤害的牌此刻是一条停在处理区的 UC，
 * 获得 = 这条 UC 退出处理区（`exit` 把全部实体牌交给曹操，UC 随之销毁）——
 * 多牌源（丈八蛇矛的两张牌当杀）因此整条获得，不会被"取走一张即破坏"截断。
 * 技能自行构造的 UsedCard 描述符不在处理区 → 无可获得之牌（与旧行为一致）。
 */
const jianxiongContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  const { card } = event.data as DamageEventData;
  if (!card) return; // 技能伤害（刚烈反击/反间等）或无来源伤害（闪电）→ 无可获得之牌

  const uc = materializeUsedCard(game, card);
  if (uc.loc?.kind !== 'processing') return; // 不在处理区的牌无从获得
  await exitUsedCard(game, uc, {
    to: { player: owner, zone: 'hand' }, reason: 'obtain',
  });
  console.log(
    `  ✨${owner.name} 发动【奸雄】！获得造成伤害的 ${cardEmoji(uc.type)} ` +
    `(${cardFaceText(uc)})`,
  );
};

defineSkill({
  name: '奸雄',
  effects: [{
    form: 'triggered',
    timing: 'damage.after',
    // 仅"牌直接造成的伤害"才询问/发动——技能伤害（刚烈反击/反间）、无来源伤害无 card
    condition: (_game, event, owner, subject) =>
      subject === owner && !!event.data.card,
    run: jianxiongContent,
  }],
});

/** 护驾：需要打出闪时，可请其他魏势力角色代打（主公技） */
defineSkill({
  name: '护驾',
  meta: { lord: true },
  effects: [{
    form: 'response',
    name: '护驾',
    respondsTo: CardType.Shan,
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
  }],
});

heroRegistry.register({
  name: '曹操', maxHp: 4, sex: 'male', group: '魏', isLord: true, skills: ['奸雄', '护驾'],
});
