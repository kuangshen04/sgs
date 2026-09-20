// ============================================================
// 三国杀最小原型 — 显示（读规则集渲染牌面：需要 game，故带 game 参数）
// ============================================================

import type { Card } from '../types.js';
import type { Game } from '../game.js';
import type { PlayerEquipment } from '../types.js';
import { cardEmoji, displayNumber } from '../rules/cardFace.js';

function handDisplay(game: Game, hand: readonly Card[]): string {
  if (hand.length === 0) return '（空）';
  const sorted = [...hand].sort((a, b) => {
    const pa = game.ruleSet.cards.get(a.type)?.ai.discardPriority ?? 0;
    const pb = game.ruleSet.cards.get(b.type)?.ai.discardPriority ?? 0;
    return pa - pb;
  });
  return sorted
    .map((c) => `${cardEmoji(game, c.type)}${c.suit}${displayNumber(c.number)}`)
    .join(' ');
}

/** 体力条显示（支持负数/越界血量，数值如实显示） */
export function hpBar(current: number, max: number): string {
  const hearts = Math.max(0, Math.min(current, max)); // 实际体力截断到 [0, max]
  const blacks = Math.max(0, max - hearts);           // 缺失体力
  return '❤️'.repeat(hearts) + '🖤'.repeat(blacks) + ` (${current}/${max})`;
}

function equipDisplay(game: Game, e: PlayerEquipment): string {
  const parts: string[] = [];
  if (e.weapon) parts.push(`武器:${cardEmoji(game, e.weapon.type)}`);
  if (e.armor) parts.push(`防具:${cardEmoji(game, e.armor.type)}`);
  if (e.defensiveHorse) parts.push(`防御马:${cardEmoji(game, e.defensiveHorse.type)}`);
  if (e.offensiveHorse) parts.push(`进攻马:${cardEmoji(game, e.offensiveHorse.type)}`);
  return parts.length > 0 ? parts.join(' ') : '（无）';
}

export function printState(game: Game): void {
  const state = game.state;
  const alive = state.players.filter((p) => p.alive).length;
  const W = 42; // 内容区宽度

  let body = '';
  for (const p of state.players) {
    const marker = p.alive ? ' ' : '💀';
    const nameCol = padEnd(`${marker}${p.name}`, 5);
    const hpCol = hpBar(p.hp, p.maxHp);
    body += `║ ${nameCol} ${padEnd(hpCol, W - 7 - 5)}║\n`;
    body += `║   手牌: ${padEnd(handDisplay(game, p.hand.cards), W - 10)}║\n`;
    body += `║   装备: ${padEnd(equipDisplay(game, p.equipment), W - 10)}║\n`;
    body += `║${' '.repeat(W)}║\n`;
  }

  console.log(`
╔${'═'.repeat(W)}╗
║${padEnd('🏯 三国杀 · 最小原型', W)}║
╠${'═'.repeat(W)}╣
${body}║ 牌堆: ${String(state.deck.cards.length).padStart(3)}张 | 弃牌堆: ${String(state.discardPile.cards.length).padStart(3)}张 | 存活: ${alive}人 | 第${state.round}轮 ║
╚${'═'.repeat(W)}╝`);
}

function padEnd(str: string, len: number): string {
  let width = 0;
  for (const ch of str) {
    width += /[一-鿿　-〿＀-￯]/.test(ch) ? 2 : 1;
  }
  return str + ' '.repeat(Math.max(0, len - width));
}
