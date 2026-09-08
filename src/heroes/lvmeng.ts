// ============================================================
// 吕蒙 — 克己（本回合未使用杀，可跳过弃牌阶段）
// ============================================================

import { askYesNo } from '../choose.js';
import { skillRegistry, subjectIsOwner } from '../skills.js';
import { findEventSince } from '../events/index.js';
import type { UseCardEventData } from '../events/index.js';
import { CardType } from '../types.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../game.js';
import type { GameEvent } from '../events/index.js';
import type { Player } from '../types.js';

/**
 * 本回合是否使用过【杀】（克己判定，阶段 1 从 usedShaThisTurn 标记迁移为历史查询）。
 * 语义（行为保持）：只计"使用"（useCard 事件），与旧标记一致——响应"打出"杀不产生
 * useCard 事件（走 cardMove），不计入；缺口记入 docs/TODO 写死清单，等真实用例补"打出"记录。
 * 范围 = 自己当前回合（最近 turn 祖先事件之后）；无 turn 祖先（如测试直接调弃牌阶段）时
 * boundary 为 null，findEventSince 退化为整局扫描。
 */
function usedShaThisTurn(game: Game, current: GameEvent<any>, owner: Player): boolean {
  const turnEvent = current.getParent('turn');
  return findEventSince(game, turnEvent, (e) => {
    if (e.type !== 'useCard') return false;
    const { player, card } = e.data as UseCardEventData;
    return player === owner && card.type === CardType.Sha;
  }) !== null;
}

skillRegistry.register({
  name: '克己',
  trigger: 'discardPhase.before',
  canTrigger: (game, event, owner, subject) =>
    subject === owner && !usedShaThisTurn(game, event, owner),
  content: async (game, event, owner) => {
    if (!(await askYesNo(game, owner, '克己：是否跳过弃牌阶段', true))) return;
    owner.skipDiscardPhase = true;
    console.log(`  ✨${owner.name} 发动【克己】！跳过弃牌阶段`);
  },
});

heroRegistry.register({
  name: '吕蒙',
  maxHp: 4,
  sex: 'male',
  group: '吴',
  skills: ['克己'],
});
