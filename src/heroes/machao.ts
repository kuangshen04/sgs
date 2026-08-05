// ============================================================
// 马超 — 马术（锁定技：你计算与其他角色的距离时-1）
// ============================================================

import { effectRegistry } from '../persistentEffects.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Player } from '../types.js';

// 锁定技：纯常驻效果（铁骑待判定/装备系统）
effectRegistry.register({
  kind: 'offensiveDistance',
  value: (player: Player) => (player.hero.skills?.includes('马术') ? 1 : 0),
});

heroRegistry.register({ name: '马超', maxHp: 4, skills: ['马术'] });
