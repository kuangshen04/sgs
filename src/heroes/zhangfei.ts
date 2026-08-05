// ============================================================
// 张飞 — 咆哮（锁定技：出牌阶段使用【杀】没有数量限制）
// ============================================================

import { effectRegistry } from '../persistentEffects.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Player } from '../types.js';

// 锁定技：无触发时机、无主动发动，纯粹是常驻效果
effectRegistry.register({
  kind: 'unlimitedSha',
  value: (player: Player) => (player.hero.skills?.includes('咆哮') ? 1 : 0),
});

heroRegistry.register({ name: '张飞', maxHp: 4, skills: ['咆哮'] });
