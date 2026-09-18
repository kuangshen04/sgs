// ============================================================
// 规则文本（info）数据源 — 直接取自 docs 的标包数据（唯一事实来源）
//
// 只有**技能**与**卡牌**需要规则文本（effect 不需要）：字段与 `name` 同级
// （`Skill.info` / `CardDef.info`），由 `defineSkill` / `cardRegistry.register`
// 在未显式给出时按名字自动填充。
//
// 数据源 = `docs/标包武将.json`（技能的 info）与 `docs/标包卡牌.json`（卡牌的 info）。
// 直接引用而不落一份副本，避免"改了 docs 忘了改代码"的漂移；将来若要接入
// 更多内容包（军争/神话再临），把这里换成按包查询即可。
// ============================================================

import heroData from '../../docs/标包武将.json';
import cardData from '../../docs/标包卡牌.json';

const skillInfos = new Map<string, string>();
for (const hero of heroData as { skills?: { name: string; info?: string }[] }[]) {
  for (const skill of hero.skills ?? []) {
    if (skill.info) skillInfos.set(skill.name, skill.info);
  }
}

const cardInfos = new Map<string, string>();
for (const card of cardData as { name: string; info?: string }[]) {
  if (card.info) cardInfos.set(card.name, card.info);
}

/** 技能的规则文本（按技能名；无此技能返回 undefined） */
export function skillInfo(name: string): string | undefined {
  return skillInfos.get(name);
}

/** 卡牌的规则文本（按卡牌名；无此卡返回 undefined） */
export function cardInfo(name: string): string | undefined {
  return cardInfos.get(name);
}

/** 数据源里的全部技能名（对账/测试用） */
export function allSkillInfos(): ReadonlyMap<string, string> {
  return skillInfos;
}

/** 数据源里的全部卡牌名（对账/测试用） */
export function allCardInfos(): ReadonlyMap<string, string> {
  return cardInfos;
}
