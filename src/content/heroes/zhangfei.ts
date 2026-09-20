// ============================================================
// 张飞 — 咆哮（锁定技：出牌阶段使用【杀】没有数量限制）
// ============================================================

import type { Container } from '../../rules/ruleSet.js';

// 锁定技：无触发时机、无主动发动，纯粹是常驻效果

// ── 装配（显式注册进容器；参数 c = 装配期容器）──────────────────────
export function installZhangfei(c: Container): void {
  c.skills.define({
    name: '咆哮',
    meta: { compulsory: true },
    effects: [{ form: 'persistent', key: 'unlimitedSha', value: () => 1 }],
  });

  c.heroes.register({ name: '张飞', maxHp: 4, sex: 'male', group: '蜀', skills: ['咆哮'] });
}
