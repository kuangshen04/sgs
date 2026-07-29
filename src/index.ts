// ============================================================
// 三国杀最小原型 — 入口
// 事件驱动：game → round → turn → phase → action 全自动
// ============================================================

import {
  createGame, setGameState, printState,
} from './game.js';
import { runGame } from './gameFlow.js';
import { triggerSystem, EventType } from './events/index.js';

// ============================================================
// Demo：注册触发器，覆盖 Game → Round → Turn → Phase → Action
// ============================================================

// --- Game ---
triggerSystem.on(`${EventType.Game}.before`, () => {
  console.log('⚡[trigger] game.before: 游戏开始');
});
triggerSystem.on(`${EventType.Game}.after`, () => {
  console.log('⚡[trigger] game.after: 游戏结束');
});

// --- Round ---
triggerSystem.on(`${EventType.Round}.before`, (event) => {
  console.log(`\n⚡[trigger] round.before: 第 ${event.data.round} 轮开始`);
});
triggerSystem.on(`${EventType.Round}.after`, (event) => {
  console.log(`⚡[trigger] round.after: 第 ${event.data.round} 轮结束`);
});

// --- Turn ---
triggerSystem.on(`${EventType.Turn}.before`, (event) => {
  const d = event.data as { player: { name: string }; round: number };
  console.log(`\n⚡[trigger] turn.before: ${d.player.name} 的回合开始`);
});
triggerSystem.on(`${EventType.Turn}.after`, (event) => {
  const d = event.data as { player: { name: string }; round: number };
  console.log(`⚡[trigger] turn.after: ${d.player.name} 的回合结束`);
});

// --- Phase ---
triggerSystem.on(`${EventType.DrawPhase}.before`, () => {
  console.log(`  ⚡[trigger] drawPhase.before`);
});
triggerSystem.on(`${EventType.PlayPhase}.before`, () => {
  console.log(`  ⚡[trigger] playPhase.before`);
});
triggerSystem.on(`${EventType.DiscardPhase}.before`, () => {
  console.log(`  ⚡[trigger] discardPhase.before`);
});

// --- Action ---
triggerSystem.on(`${EventType.Damage}.before`, (event) => {
  const d = event.data as { source: { name: string }; target: { name: string }; amount: number };
  console.log(`    ⚡[trigger] damage.before: ${d.source.name} → ${d.target.name} ${d.amount}点`);
});
triggerSystem.on(`${EventType.Damage}.after`, (event) => {
  const d = event.data as { target: { name: string; hp: number } };
  console.log(`    ⚡[trigger] damage.after: ${d.target.name} HP=${d.target.hp}`);
});

triggerSystem.on(`${EventType.Recover}.before`, (event) => {
  const d = event.data as { target: { name: string }; amount: number };
  console.log(`    ⚡[trigger] recover.before: ${d.target.name} +${d.amount}`);
});

triggerSystem.on(`${EventType.Draw}.before`, (event) => {
  const d = event.data as { target: { name: string }; count: number };
  console.log(`    ⚡[trigger] draw.before: ${d.target.name} 摸${d.count}张`);
});

triggerSystem.on(`${EventType.Die}.after`, (event) => {
  const d = event.data as { player: { name: string } };
  console.log(`    ⚡[trigger] die.after: ${d.player.name} 阵亡`);
});

// ============================================================
// 主程序
// ============================================================

async function main() {
  const game = createGame();
  setGameState(game);

  console.clear();
  printState(game);

  // 一整局就是一个事件：game.before → 主循环 → game.after
  await runGame();

  console.log('\n' + '='.repeat(42));
  console.log(`🏆 游戏结束！${game.winner!.name} 获胜！`);
  console.log('='.repeat(42));
}

main().catch(console.error);
