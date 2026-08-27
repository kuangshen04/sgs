// ============================================================
// 吕蒙 — 克己（本回合未使用/打出杀，可跳过弃牌阶段）
// ============================================================

import { askYesNo } from '../choose.js';
import { skillRegistry, subjectIsOwner } from '../skills.js';
import { heroRegistry } from '../heroRegistry.js';

skillRegistry.register({
  name: '克己',
  trigger: 'discardPhase.before',
  canTrigger: (_game, _event, owner, subject) =>
    subject === owner && !owner.usedShaThisTurn,
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
