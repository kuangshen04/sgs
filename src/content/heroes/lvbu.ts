// ============================================================
// 吕布 — 无双（锁定技：杀需两张闪；决斗响应需两张杀）
//
// 阶段 3：两处"响应要求修改"统一为带归属的常驻查询——
// 杀响应用 'shaRequired'、决斗响应用 'juedouShaRequired'（respond.ts 查询）；
// 不再用 RespondMarks.shanRequired 标记，也不在决斗 content 里特判技能名。
// ============================================================

import { defineSkill } from '../../effects/effects.js';
import { heroRegistry } from '../heroRegistry.js';

defineSkill({
  name: '无双',
  meta: { compulsory: true }, // 锁定技（抗性标签；语义落地见阶段 3 第 2 项）
  effects: [
    { form: 'persistent', key: 'shaRequired', value: () => 1 },
    { form: 'persistent', key: 'juedouShaRequired', value: () => 1 },
  ],
});

heroRegistry.register({ name: '吕布', maxHp: 4, sex: 'male', group: '群', skills: ['无双'] });
