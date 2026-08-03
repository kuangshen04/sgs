// ============================================================
// 三国杀最小原型 — 显示
// ============================================================

import { Card, GameState } from './types.js';
import { cardRegistry, cardEmoji, displayNumber } from './cardRegistry.js';

function handDisplay(hand: Card[]): string {
  if (hand.length === 0) return '（空）';
  const sorted = [...hand].sort((a, b) => {
    const pa = cardRegistry.get(a.type)?.ai.discardPriority ?? 0;
    const pb = cardRegistry.get(b.type)?.ai.discardPriority ?? 0;
    return pa - pb;
  });
  return sorted
    .map((c) => `${cardEmoji(c.type)}${c.suit}${displayNumber(c.number)}`)
    .join(' ');
}

function hpBar(current: number, max: number): string {
  return '❤️'.repeat(current) + '🖤'.repeat(max - current) + ` (${current}/${max})`;
}

export function printState(state: GameState): void {
  const alive = state.players.filter((p) => p.alive).length;
  const W = 42; // 内容区宽度

  let body = '';
  for (const p of state.players) {
    const marker = p.alive ? ' ' : '💀';
    const nameCol = padEnd(`${marker}${p.name}`, 5);
    const hpCol = hpBar(p.hp, p.maxHp);
    body += `║ ${nameCol} ${padEnd(hpCol, W - 7 - 5)}║\n`;
    body += `║   手牌: ${padEnd(handDisplay(p.hand), W - 10)}║\n`;
    body += `║${' '.repeat(W)}║\n`;
  }

  console.log(`
╔${'═'.repeat(W)}╗
║${padEnd('🏯 三国杀 · 最小原型', W)}║
╠${'═'.repeat(W)}╣
${body}║ 牌堆: ${String(state.deck.length).padStart(3)}张 | 弃牌堆: ${String(state.discardPile.length).padStart(3)}张 | 存活: ${alive}人 | 第${state.round}轮 ║
╚${'═'.repeat(W)}╝`);
}

function padEnd(str: string, len: number): string {
  let width = 0;
  for (const ch of str) {
    width += /[一-鿿　-〿＀-￯]/.test(ch) ? 2 : 1;
  }
  return str + ' '.repeat(Math.max(0, len - width));
}
