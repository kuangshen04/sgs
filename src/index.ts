// ============================================================
// 三国杀最小原型 — 入口
// 创建游戏 → 轮流执行回合 → 宣布胜利者
// ============================================================

import { createGame, playerTurn, printState } from './game.js';
import { triggerSystem, EventType } from './events/index.js';

// ============================================================
// Demo：注册触发器，验证事件系统工作正常
// ============================================================

triggerSystem.on(`${EventType.Damage}.before`, (event) => {
  const data = event.data as { target: { name: string }; amount: number; source: { name: string } };
  console.log(`  ⚡[trigger] damage.before: ${data.source.name} 即将对 ${data.target.name} 造成 ${data.amount} 点伤害`);
});

triggerSystem.on(`${EventType.Damage}.after`, (event) => {
  const data = event.data as { target: { name: string; hp: number; maxHp: number } };
  console.log(`  ⚡[trigger] damage.after: ${data.target.name} 受到伤害后体力 ${data.target.hp}/${data.target.maxHp}`);
});

triggerSystem.on(`${EventType.Recover}.before`, (event) => {
  const data = event.data as { target: { name: string }; amount: number };
  console.log(`  ⚡[trigger] recover.before: ${data.target.name} 即将恢复 ${data.amount} 点体力`);
});

triggerSystem.on(`${EventType.Draw}.before`, (event) => {
  const data = event.data as { target: { name: string }; count: number };
  console.log(`  ⚡[trigger] draw.before: ${data.target.name} 即将摸 ${data.count} 张牌`);
});

triggerSystem.on(`${EventType.Die}.after`, (event) => {
  const data = event.data as { player: { name: string } };
  console.log(`  ⚡[trigger] die.after: ${data.player.name} 已阵亡`);
});

// ============================================================
// 主循环
// ============================================================

async function main() {
  const game = createGame();

  console.clear();
  printState(game);

  // 主循环
  while (!game.gameOver) {
    const current = game.players[game.currentIndex];
    console.log(`\n━━━ 第 ${game.round} 轮 · ${current.name} 的回合 ━━━`);

    await playerTurn(game);

    if (game.gameOver) break;

    printState(game);

    // 切换到下一个玩家
    game.currentIndex = 1 - game.currentIndex;
    if (game.currentIndex === 0) game.round++;
  }

  console.log('\n' + '='.repeat(42));
  console.log(`🏆 游戏结束！${game.winner!.name} 获胜！`);
  console.log('='.repeat(42));
}

main().catch(console.error);
