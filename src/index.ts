// ============================================================
// 三国杀最小原型 — 入口
// ============================================================

import './cards.js';  // 触发卡牌注册（side-effect import）
import { STANDARD_DECK } from './cards.js';
import { registerSkills } from './skills.js';
import { createGame } from './game.js';
import { printState } from './display.js';
import { runGame } from './gameFlow.js';

// ============================================================
// 主程序
// ============================================================

async function main() {
  const game = createGame(STANDARD_DECK, ['刘备', '曹操', '夏侯惇', '司马懿', '郭嘉', '甄宓', '孙权', '周瑜', '貂蝉']);
  registerSkills(game); // 把技能/装备/无懈触发器挂到本局

  console.clear();
  printState(game.state);

  await runGame(game);

  console.log('\n' + '='.repeat(42));
  console.log(`🏆 游戏结束！${game.state.winner!.name} 获胜！`);
  printState(game.state);
  console.log('='.repeat(42));
}

main().catch(console.error);
