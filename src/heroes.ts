// ============================================================
// 三国杀最小原型 — 武将定义与注册表
// 武将注册后，createGame 通过名字引用（同名可重复，如三个郭嘉）。
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

// ============================================================
// 注册
// ============================================================

heroRegistry.register({ name: '刘备', maxHp: 4, skills: ['仁德'] });
heroRegistry.register({ name: '曹操', maxHp: 4, skills: ['奸雄'] });
heroRegistry.register({ name: '夏侯惇', maxHp: 4, skills: ['刚烈'] });
heroRegistry.register({ name: '郭嘉', maxHp: 3, skills: ['遗计'] });
heroRegistry.register({ name: '孙权', maxHp: 4, skills: ['制衡'] });
heroRegistry.register({ name: '周瑜', maxHp: 3, skills: ['英姿', '反间'] });
heroRegistry.register({ name: '貂蝉', maxHp: 3, skills: ['闭月'] });
