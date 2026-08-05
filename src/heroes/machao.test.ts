// ============================================================
// 马超 — 马术
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame } from '../test-utils.js';

import { effectRegistry } from '../persistentEffects.js';

describe('马术（马超锁定技）', () => {
  it('effectRegistry：马超拥有 offensiveDistance，普通角色没有', () => {
    const g = freshGame({}, ['刘备', '马超', '孙权']);
    expect(effectRegistry.has(g.state.players[1], 'offensiveDistance')).toBe(true);
    expect(effectRegistry.has(g.state.players[0], 'offensiveDistance')).toBe(false);
  });
});
