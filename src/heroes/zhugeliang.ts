// ============================================================
// 诸葛亮 — 空城（锁定技：没有手牌时，你不能成为【杀】或【决斗】的目标）
// ============================================================

import { effectRegistry } from '../persistentEffects.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Player } from '../types.js';

// 锁定技：targetFilter 时排除目标（不是 targeting 时取消）
effectRegistry.register({
  kind: 'immuneSha',
  value: (player: Player) =>
    (player.hero.skills?.includes('空城') && player.hand.length === 0 ? 1 : 0),
});
effectRegistry.register({
  kind: 'immuneJueDou',
  value: (player: Player) =>
    (player.hero.skills?.includes('空城') && player.hand.length === 0 ? 1 : 0),
});

heroRegistry.register({ name: '诸葛亮', maxHp: 3, skills: ['空城'] });
