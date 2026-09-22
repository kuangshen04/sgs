# AGENTS.md — 项目约定

三国杀规则引擎 MVP。目标不是一次性复刻完整游戏，而是用最小模型逐步逼近标包规则；
每个机制只在出现 2–3 个真实用例后再抽象，避免过度设计。

## 设计原则

- **先讨论后实现**：新机制/重构先在对话中讨论设计、达成一致后再动手；重大方向先写进 `docs/TODO.md`。
- **有例子再抽象**：接口、通用机制等复杂度到位（至少 2–3 处真实用例）后再提炼；单例特判优先。
- **行为保持（有边界）**：重构默认保持规则语义与外部可观测行为，现有测试尽量机械更新；
  结构/API 级大重构可按新设计彻底改造并重写测试，但须在讨论中显式声明不兼容范围，
  禁止为迁就旧行为留兼容壳。
- **规则层与 AI 层语义分离**：`canUse` / `targetFilter` / 常驻效果是规则；`ai.shouldUse`、选牌/选目标/发动与否是 AI。
- **决策与执行分离**：ask/choose 只做决策不执行牌；打出/使用由调用方（`playFromHand` / `useCard`）负责。
- **AI 决策点隔离**：当前 AI 全部写死为默认行为，决策点用注释标明"真人/前端接入时在此注入"；不提前设计注入接口。
- **避免全局状态**：`game` 作为第一参数贯穿所有引擎函数；事件栈/触发器随局隔离；
  定义层**没有模块级注册表**——内容只在装配期注册进容器，运行期经 `game.ruleSet` 只读查询
  （装配期/运行期分离见 `docs/adr/0009`）。

## 东西在哪找

- **代码**：`src/`（TypeScript ESM，相对导入带 `.js` 后缀）；按角色分目录：
  `events/`（事件）· `position/`（位置与移动 + UC）· `effects/`（效果与技能）· `decision/`（决策与窗口）·
  `flow/`（流程与结算）· `content/`（卡牌/武将/牌堆与**显式装配**）；
  根目录：`index.ts`（入口）/ `game.ts`（一局）/ `types.ts`（命名表）/ `random.ts`（随机源）/
  `test-utils.ts`（测试辅助）；`rules/` 是**临时**住处（卡牌契约 / 显示三件 / 容器，
  待"卡牌簇"与"前端接口"两次讨论后归位，见 `docs/adr/0010` 迁移项 a3/a4）。
  **导览见 `docs/代码结构.md`**
- **分层与依赖方向**：`docs/adr/0010`——接口随模块走（没有通用契约层）；`types.ts` 与
  `events/types.ts` 是**命名表**、机制不得依赖事件字典；**决策不得执行**；依赖边 = 接口边。
  改模块边界前先读它
- **内容装配**：`content/standardPack.ts` → `installStandardPack` / `createStandardContainer`；
  注册只在装配期（容器），运行期只经 `game.ruleSet`——没有 import 副作用、没有隐式默认装配
  （`createGame` 的 `ruleSet` 必填）
- **测试**：与被测模块同目录（`src/<cluster>/xxx.test.ts`；`content/heroes/*.test.ts` 随武将）。
  下层模块的单元测试用 `testGame/testContainer` 现场注册测试内容、**不依赖标包**；
  "内容 × 流程"的集成测试单独标注；断言标包内容用 `standardRuleSet()`
- **需求与计划**：`docs/TODO.md`（**只放还没落地的**：剩余阶段、未落地机制、写死清单、开放问题）
- **已落地系统的决策**：`docs/adr/`（一篇一系统；索引与"旧编号 演进 X.Y 对照"见 `docs/adr/README.md`）
- **经验与红线**：`docs/经验与红线.md`（借鉴无名杀/FreeKill 的核对结论 + 写死的红线）
- **代码导览 / 工程约定**：`docs/代码结构.md`（目录职责、内容与装配约定、测试与质量闸）
- **标包武将/卡牌定义**：`docs/标包武将.json`、`docs/标包卡牌.json`（唯一事实来源）
- **牌堆数据**：`src/content/standardDeck.json`（108 张、32 种，与卡牌定义分离）
- **测试辅助**：`src/test-utils.ts`（`freshGame` / `testGame` / `standardGame` / `testContainer` /
  `standardRuleSet` / `giveHand` / `makeUniqueCard` / `testDelayCard` / `equipAt`）

> 具体模块与机制约定以 `docs/adr/` 与源码为准；文档结构见 `docs/adr/README.md`，不在本文件维护。

## 常用命令

- 编译检查：`pnpm exec tsc --noEmit`
- 全量测试：`pnpm exec vitest run`
- 运行：`pnpm exec tsx src/index.ts`
