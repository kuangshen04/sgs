// ============================================================
// 三国杀最小原型 — 卡牌注册汇总
// 导入全部卡牌类别（副作用：触发注册），并构建标准版牌堆。
// ============================================================

import './basic.js';
import './trick.js';
import './delay.js';
import './equipment.js';

import { buildStandardDeck } from '../deck.js';
import type { Card } from '../types.js';

// 标准版牌堆（数据驱动：src/standardDeck.json，一副 108 张）
// 需在全部卡牌注册之后构建，故放在汇总文件末尾。
export const STANDARD_DECK: Card[] = buildStandardDeck();
