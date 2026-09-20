// ============================================================
// 标包装配（显式）— 内容 → 容器
//
// 这里是"标包装了哪些内容"的**唯一可见事实**：不再有 import 副作用，
// 也没有模块级注册表。要装别的包（军争/神话再临，TODO 阶段 4）就再写一个
// installXxxPack(container)；一个容器可以装多个包（装配期决定）。
//
// 用法（生产入口 / 测试）：
//   const container = createStandardContainer();
//   const deck = buildStandardDeck(container);
//   const game = createGame(deck, ['刘备', ...], { ruleSet: container });
// ============================================================

import { createContainer } from '../rules/ruleSet.js';
import type { Container } from '../rules/ruleSet.js';
import { cardInfo, skillInfo } from './info.js';
import { installBasicCards } from './cards/basic.js';
import { installTrickCards } from './cards/trick.js';
import { installDelayCards } from './cards/delay.js';
import { installEquipmentCards } from './cards/equipment.js';
import { installCaocao } from './heroes/caocao.js';
import { installDaqiao } from './heroes/daqiao.js';
import { installDiaochan } from './heroes/diaochan.js';
import { installGanning } from './heroes/ganning.js';
import { installGuanyu } from './heroes/guanyu.js';
import { installGuojia } from './heroes/guojia.js';
import { installHuanggai } from './heroes/huanggai.js';
import { installHuangyueying } from './heroes/huangyueying.js';
import { installHuatuo } from './heroes/huatuo.js';
import { installLiubei } from './heroes/liubei.js';
import { installLuxun } from './heroes/luxun.js';
import { installLvbu } from './heroes/lvbu.js';
import { installLvmeng } from './heroes/lvmeng.js';
import { installMachao } from './heroes/machao.js';
import { installSimayi } from './heroes/simayi.js';
import { installSunquan } from './heroes/sunquan.js';
import { installSunshangxiang } from './heroes/sunshangxiang.js';
import { installXiahoudun } from './heroes/xiahoudun.js';
import { installXuchu } from './heroes/xuchu.js';
import { installZhangfei } from './heroes/zhangfei.js';
import { installZhangliao } from './heroes/zhangliao.js';
import { installZhaoyun } from './heroes/zhaoyun.js';
import { installZhenji } from './heroes/zhenji.js';
import { installZhouyu } from './heroes/zhouyu.js';
import { installZhugeliang } from './heroes/zhugeliang.js';

/** 全部标包安装函数（卡牌 → 武将；顺序不影响语义，同名重复注册会抛错） */
const STANDARD_INSTALLERS: readonly ((c: Container) => void)[] = [
  installBasicCards,
  installTrickCards,
  installDelayCards,
  installEquipmentCards,
  installCaocao,
  installDaqiao,
  installDiaochan,
  installGanning,
  installGuanyu,
  installGuojia,
  installHuanggai,
  installHuangyueying,
  installHuatuo,
  installLiubei,
  installLuxun,
  installLvbu,
  installLvmeng,
  installMachao,
  installSimayi,
  installSunquan,
  installSunshangxiang,
  installXiahoudun,
  installXuchu,
  installZhangfei,
  installZhangliao,
  installZhaoyun,
  installZhenji,
  installZhouyu,
  installZhugeliang,
];

/** 把标包装进给定容器（规则文本按名字从 docs 标包数据回填） */
export function installStandardPack(c: Container): void {
  c.useInfo({ skillInfo, cardInfo });
  for (const install of STANDARD_INSTALLERS) install(c);
}

/** 造一个只装了标包的容器（生产入口与测试默认；测试也可自造容器只装测试内容） */
export function createStandardContainer(): Container {
  const container = createContainer();
  installStandardPack(container);
  return container;
}
