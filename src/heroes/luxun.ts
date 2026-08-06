// ============================================================
// 陆逊 — 谦逊（锁定技：你不能成为【顺手牵羊】和【乐不思蜀】的目标）
// ============================================================

import { effectRegistry } from '../persistentEffects.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Player } from '../types.js';

// 锁定技：targetFilter 时排除目标（不是 targeting 时取消）
effectRegistry.register({
  kind: 'immuneShunShou',
  value: (player: Player) => (player.hero.skills?.includes('谦逊') ? 1 : 0),
});
effectRegistry.register({
  kind: 'immuneLeBu',
  value: (player: Player) => (player.hero.skills?.includes('谦逊') ? 1 : 0),
});

heroRegistry.register({ name: '陆逊', maxHp: 3, sex: 'male', group: '吴', skills: ['谦逊'] });
