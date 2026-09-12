// ============================================================
// 张飞 — 咆哮（锁定技：出牌阶段使用【杀】没有数量限制）
// ============================================================

import { defineSkill } from '../../effects/effects.js';
import { heroRegistry } from '../heroRegistry.js';

// 锁定技：无触发时机、无主动发动，纯粹是常驻效果
defineSkill({
  name: '咆哮',
  meta: { compulsory: true },
  effects: [{ form: 'persistent', key: 'unlimitedSha', value: () => 1 }],
});

heroRegistry.register({ name: '张飞', maxHp: 4, sex: 'male', group: '蜀', skills: ['咆哮'] });
