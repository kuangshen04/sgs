// ============================================================
// 三国杀最小原型 — 入口
// ============================================================

import './cards/index.js';  // 触发卡牌注册（side-effect import）
import { STANDARD_DECK } from './cards/index.js';
import { installEffects } from './skills.js';
import { createGame } from './game.js';
import { printState } from './display.js';
import { runGame } from './gameFlow.js';
import { GameOverError } from './life.js';

// ============================================================
// 主程序
// ============================================================

async function main() {
  const game = createGame(STANDARD_DECK, ['刘备', '曹操', '夏侯惇', '司马懿', '郭嘉', '甄宓', '孙权', '周瑜', '貂蝉']);
  installEffects(game); // 把本局全部效果（技能/装备/常驻/响应）装到引擎上

  console.clear();
  printState(game.state);

  try {
    await runGame(game);
  } catch (e) {
    if (!(e instanceof GameOverError)) throw e;
  }

  console.log('\n' + '='.repeat(42));
  console.log(`🏆 游戏结束！${game.state.winner!.name} 获胜！`);
  printState(game.state);
  console.log('='.repeat(42));
}

main().catch(console.error);
