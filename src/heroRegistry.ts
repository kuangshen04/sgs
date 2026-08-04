// ============================================================
// 三国杀最小原型 — 武将注册表（基础设施）
// 武将定义与技能注册在 heroes/ 下的各武将文件中。
// ============================================================

import type { HeroDef } from './types.js';

const _heroes = new Map<string, HeroDef>();

export const heroRegistry = {
  register(def: HeroDef): void {
    _heroes.set(def.name, def);
  },
  get(name: string): HeroDef | undefined {
    return _heroes.get(name);
  },
  /** 遍历所有已注册的 HeroDef */
  all(): IterableIterator<HeroDef> {
    return _heroes.values();
  },
};
