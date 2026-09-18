// ============================================================
// 规则文本（info）— 覆盖与一致性测试
//
// 只覆盖**技能**与**卡牌**（effect 不需要）；数据源 = docs 标包数据（content/info.ts）。
// 这里锁的是"覆盖"：凡是已注册的技能/卡牌都必须有规则文本——新增内容忘了在 docs 补
// info 时立刻红。
// ============================================================

import { describe, it, expect } from 'vitest';

import './cards/index.js';       // 触发卡牌注册
import './heroes/index.js';      // 触发武将/技能注册
import { skillRegistry } from '../effects/effects.js';
import { cardRegistry } from './cardRegistry.js';
import { allCardInfos, allSkillInfos } from './info.js';

describe('规则文本（info）', () => {
  it('每个已注册技能都有 info，且与数据源一致', () => {
    const missing: string[] = [];
    for (const skill of skillRegistry.all()) {
      if (!skill.info) missing.push(skill.name);
      else expect(skill.info).toBe(allSkillInfos().get(skill.name));
    }
    expect(missing).toEqual([]);
  });

  it('每种已注册卡牌都有 info，且与数据源一致', () => {
    const missing: string[] = [];
    for (const def of cardRegistry.all()) {
      if (!def.info) missing.push(def.name);
      else expect(def.info).toBe(allCardInfos().get(def.name));
    }
    expect(missing).toEqual([]);
  });

  it('技能/卡牌的 info 与 name 同级（不在 meta、不在 effect 上）', () => {
    const skill = skillRegistry.get('奸雄')!;
    expect(skill.info).toContain('造成伤害');
    expect((skill.meta as unknown as Record<string, unknown>).info).toBeUndefined(); // 不在 meta 里
    for (const effect of skill.effects) {
      expect((effect as unknown as Record<string, unknown>).info).toBeUndefined();   // effect 不带 info
    }
    const card = cardRegistry.all().next().value!;
    expect(card.info?.length).toBeGreaterThan(0);
  });
});
