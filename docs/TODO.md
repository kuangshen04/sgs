# 三国杀标包实现 TODO

> 需求清单，先列需求不做具体设计。
> 参考数据：`docs/标包卡牌.json`、`docs/标包武将.json`
> 选择/响应窗口的设计结论见 [选择系统设计.md](选择系统设计.md)。
> 演进与避坑（参考无名杀/FreeKill 经验）见 [演进与避坑.md](演进与避坑.md)。

## 一、引擎基础能力（结构性需求）

### 1. 判定系统

- [x] 判定原语：亮出牌堆顶一张牌，按花色/点数判定
- [x] 判定区：延时锦囊的放置与结算（乐不思蜀已实现）
- [x] 判定牌去向：默认进弃牌堆，可被技能获取（天妒）
- [x] 判定可被替换（鬼才）
- 解锁：乐不思蜀、闪电、八卦阵、天妒、鬼才、刚烈、铁骑、洛神

### 2. 装备区与距离

- [x] 装备区：武器/防具/防御马/进攻马槽位（含顶掉）
- [x] 距离计算：座位距离 + 距离修正（马术/进攻马/防御马，effectRegistry kind: offensiveDistance/defensiveDistance）
- [x] 攻击范围：武器决定能杀到谁（attackRange + 杀 targetFilter 接入）
- [x] "区域"概念：手牌区/装备区/判定区（areas.ts：cardsInAreas / takeCardFromAreas / selectCardFromAreas）
- 解锁：17 张装备牌、马术、奇才、借刀杀人、流离

### 3. 转化牌系统

- [x] 1 牌转化：一张牌视为另一张使用/打出（武圣、龙胆①、奇袭、倾国、急救；国色判定区类待）
- [x] 多牌转化：丈八蛇矛（两张手牌当杀）
- [x] 0 牌转化：八卦阵（判定红视为虚拟闪，0 实体牌；判定失败可再出真闪）
- [x] 转化语义：区分"使用"与"打出"，同一转化在出牌阶段 useWindow 与响应窗口分别注册
- [ ] 离间（0 牌转化 + 不可被无懈）、国色（判定区持久化身份）待
- 解锁：关羽、赵云、甘宁、甄宓·倾国、华佗·急救、丈八蛇矛、八卦阵
- 依赖：选择系统（选择原语 + useWindow）+ 处理区/虚拟牌身份——已就绪

### 4. 常驻效果

- [x] 距离修正（坐骑、马术、绝影）
- [x] 无距离限制（奇才，effectRegistry kind: noTrickDistance）
- [x] 杀使用次数限制修改（咆哮、诸葛连弩，effectRegistry kind: unlimitedSha）
- [x] 目标合法性限制（空城/谦逊：targetFilter 排除，effectRegistry kind: immuneSha/immuneJueDou/immuneShunShou/immuneLeBu）
- [x] 响应要求修改（无双：需两张闪/杀，依赖杀响应流程）
- [x] 防具效果：仁王盾（targeting 时取消目标，equipTrigger 置 targeting.data.cancelled，不依赖杀响应流程）
- [x] 防具效果：八卦阵（判定红视为闪、黑可再出闪；以 responseRule 实现）
- [x] 发动词汇三轴（勿混为一谈，详见演进 9.2）：
  - effect 级 `auto`（自动发动，即 frequency.auto 的占位字段）：绑 effect，作用 = 前端多一个"自动发动"按钮
    （**现在不做**；引擎不消费，仅保留词汇位置）；
  - effect 级 `forced`（强制发动）：绑触发技的 effect，作用 = 不进行"是否发动"的询问
    （已接线：`installEffects` 按 `!effect.forced` 决定是否询问；`effects.test.ts` 打桩断言验证）；
  - skill 级 `Compulsory`（锁定技抗性标签）：绑技能，供"令其他武将技能失效"类效果在失效判断前查抗性
    （字段就位；查询入口等阶段 3 第 3 项"技能失效/复原"作为真实消费者时再提炼）；
  - 规则文本的"锁定技" = 内容层组合（技能打 `Compulsory` + 其触发效果打 `forced`）；引擎不推导。
    标包 6 个锁定技（咆哮/马术/奇才/谦逊/无双/空城）已带 `meta.compulsory`，且当前**全为常驻效果**，
    暂无需 `forced` 的内容用例（真实触发型锁定技待军争/神话再临）

### 5. 势力 / 性别 / 主公

- [x] `HeroDef` 增加 `sex` / `group` 字段
- [x] 主公概念底座：`SkillDef.lordSkill` / `HeroDef.isLord` / `GameState.lord` + 注册门槛；救援已实现
- [x] 性别相关效果：雌雄双股剑（异性目标触发）
- [ ] 性别相关效果：离间（依赖转化牌系统）
- [ ] 技能定义增加 `info` 规则文本（来自标包数据）

### 6. 游戏流程补全

- [x] 准备阶段（洛神、观星）
- [x] 判定阶段（延时锦囊结算：乐不思蜀/闪电）
- [x] 结束阶段（闭月已从 turn.after 迁移到 endPhase.before）
- [x] 回合外响应：求桃按座次、无懈响应链（求桃/无懈走使用型响应窗口 + 响应规则注册表）
- [x] 失去体力原语（loseHp，黄盖苦肉已实现）
- [x] 失去牌触发（连营：失去最后手牌；枭姬：失去装备区内的牌，基于 CardMove 事件）

### 7. 事件历史查询

- [x] 事件时间线：`Game.history` append-only 数组，事件在 `execute` 入史，id == 下标；
  `finally` 定稿 `endId`（子树跨度，叶子事件 == id）——FreeKill DFS 时间戳模型（演进 2.2）
- [x] 范围查询：`findEventSince(game, boundary, predicate)`（`src/events/history.ts`）——
  边界（回合/轮次/阶段/整局）本身是事件，由调用方 `getParent` 定位后传入；boundary=null 从局首扫
- 注：FreeKill（全局时间线 + end_id）与无名杀（按角色历史）模型不同 → 已定 DFS 时间戳；
  克己已迁移为第一个真实消费者；无双/裸衣等仍用特判/栈查询，未迁移（无行为需求，避免空转）
- 注：触发不产生子事件（演进 5.2）→ 历史只记真实事件；全量历史不做活窗口裁剪

### 8. 事件清理钩子

- [x] 事件级 clear 收尾钩子：`execute(content, { clear })`，挂 `finally`，执行序
  clear → 定稿 endId → 弹栈（FreeKill 同款）；正常/被取消/抛错/GameOver 解卷全路径覆盖
  （`src/events/GameEvent.ts`，引擎级测试在 `GameEvent.test.ts`）
- [x] clear 自身抛错也保证 endId/弹栈/完成态落地（嵌套 try/finally），异常向上传播
- 注：现有归位 try/finally（useCard 处理区结算 / judge 判定牌归位）本阶段未迁移——
  迁移会改变 settle 与 after-trigger 的相对时序，风险大于收益；真实消费等事件定义方有需要时再挂
  （临时状态/临时 handler 清理与裸衣可逆注册话题联动）

### 9. 牌堆顶操作原语

- [x] 牌堆原语层：方向概念化（顶 = 数组尾），`peekTop` / `takeTop` / `putTop` / `putBottom` / `takeBottom` 已封装，技能不直接碰 `deck.pop()`
- [x] 搜索：牌堆中第一张符合条件的牌（`findInDeck`，从顶往下）
- [x] 搜索：牌堆 + 弃牌堆中所有符合条件的牌（`findInDeckAndDiscard`）
- [x] 观星：查看并排序牌堆顶 N 张，可置于牌堆顶或牌堆底（顶/底各自排序）
- [x] 从牌堆底摸牌（`takeBottom`）
- [x] 立即触发洗牌：弃牌堆洗回牌堆（`reshuffle` 已为公共原语）
- [x] 统一移动模型：牌堆/弃牌堆并入 moveCards（`CardLocation` 位置句柄；顶/底是取放策略不是位置；摸牌/判定/取回/洗牌都走移动事件；处理区已并入）
- 注：与 TODO #10 位置追踪的关系——CardMoveEvent 是位置变化的记录，处理区将来只是新增一个 zone

### 10. 卡牌位置追踪（处理区）

- [x] 处理区：使用的牌在结算中的位置（useCard/judge 已接入 processing 区；奸雄已改为从处理区取源牌）
- [x] 卡牌位置追踪（FreeKill 式 CardLocation / getCardArea）：统一查询任意牌所在位置（含处理区）
- [x] 阶段 2 位置模型收口（演进 3.2/3.4 落地，`src/cardArea.ts`）：
  - **受控容器 CardArea**：手牌/判定区/牌堆/弃牌/处理区改为容器（读 = `.cards` 视图；写只走容器方法），
    唯一性由物理结构保证（一牌一位置，重复入区运行时抛错）；
  - **API 精简（去数组伪装）**：删除 length/只读委托/迭代器/isEmpty/has/toArray 等一切"把容器当数组用"的成员，
    读面一律 `.cards`（含 `.cards.length`）；受控写方法（add/addAll/insertAt/removeById/removeLast/removeFirst/clear/replaceAll）保留；
    容器内部结构与"每区自管存储/排序"（牌堆/装备区的继承或注入机制）待后续设计（开放问题）；
  - **引擎级集中索引** `Game.cardIndex`（FreeKill card_place 等价物）：`getCardArea` 改为索引查询，由容器/装备写点同步；
  - **toPosition 剥离**：`CardMoveSpec`/`CardMoveEventData` 去掉 toPosition，牌堆顶/底收敛进 `putTop`/`putBottom`；
  - **对账不变量**：`verifyCardState`/`assertCardState`（`src/cardAreaCheck.ts`）+ `cardArea.test.ts`；
  - 测试/测试辅助机械更新走容器方法（freshGame/giveHand/equipAt），装备槽位写也经索引同步；
  - 遗留：createGame 初始发牌与测试置场仍绕过移动事件（局首/置场直放，属预期）
- 注：与规则术语"区域"（玩家三区）是两回事；位置追踪是引擎的位置模型，将来与区域并行
- 注：统一移动模型重构见 [移动模型重构TODO.md](移动模型重构TODO.md)（CardMove 事件是位置变化的记录，本项是它的下游）

### 11. 选择系统（玩家决策层）

- [x] 响应牌询问：闪/杀/桃/无懈 的"是否响应、出哪张"（响应窗口 + 响应规则注册表，含转化/放弃）
- [ ] 区域选牌策略：顺手牵羊/过河拆桥/寒冰剑/反馈 的选牌（askFromAreas 默认随机）
- [x] 主动技能目标选择：仁德/反间/青囊/突袭 的目标（迁移到技能 select/execute + factories）
- [x] 发动询问：触发技能"你可以"的发动与否（askYesNo 已转为选择原语）
- [x] 回合外响应框架：求桃按座次、无懈响应链（使用型响应窗口）
- [x] 杀响应流程骨架：能否响应（铁骑）、响应修改（无双杀部分）、抵消时点（shaCancelled，青龙偃月刀/贯石斧）——见 `respond.ts`
- [x] 杀响应完整化：响应询问窗口（玩家选择）+ 八卦阵（虚拟闪 + retry）
- 注：出牌阶段用 `useWindow`，响应窗口用 `ResponseRequest` + `responseRuleRegistry`；`findResponse`/`selectCardFromAreas`/`chooseCardAndTargets` 已删除

### 12. 响应窗口 / ask 系统（玩家决策层重构）

- 现状：出牌阶段用 `useWindow`（`chooseUseAction` + `UseAction`）；ask 家族（`askForCard`/`askFromAreas`/`askForTargets`/`askYesNo`）已转为异步选择原语；
  响应窗口统一走 `ResponseRequest` + `responseRuleRegistry`（`buildResponseActions`/`executeResponse`），`findResponse`/`selectCardFromAreas`/`chooseCardAndTargets` 已删除
- 相关模块：`src/selection.ts`（选择原语）、`src/useWindow.ts`（用牌窗口）、`src/responses.ts`（响应规则注册表）、`src/choose.ts`（规则层/工厂/异步 ask）
- 设计原则：
  - 暂不设计注入接口：compute→decide→validate 三段式与通用规则引擎目前只有默认 AI 一个实现、无生产注入方，属过度设计——先合并为直接流程；AI 决策点收敛为函数内唯一决策处并注释标明"真人/前端接入时的注入点"，接口设计等出现真实消费者再做
  - 语义分层保留：牌的 `canUse`（规则）与 `ai.shouldUse`（AI）不合并（这是真实区分）；合并的是 choose 层面的机械流程（不再导出可插拔的 compute/validate、不建规则对象）
  - ask 只做决策不执行牌：打出/使用仍由调用方（`playFromHand` / `useCard`）负责
  - `game.deciders` 移除；暂不引入 decider 参数（含"直接传参"也延后）；现有自定义 decider / 全局注入测试随合并删除或改写为测默认 AI 行为
  - ask 暂不事件化：目前没有技能需要挂在 ask 时点；转化牌/八卦阵是"修改可选集"，接入 options 计算即可，事件化等转化牌阶段再评估
- 阶段计划：
  - [x] A. 合并实现（行为保持）：
    - 出牌阶段：`choose()` 简化为 `chooseCardAndTargets(game, player, shaUsed)`——可选牌 → AI 选牌（隔离）→ 该牌合法目标 → AI 选目标（隔离）；`computeCardOptions`/`computeTargetOptions`/validate 收为内部辅助，导出面缩小
    - ask 家族（并入 `src/choose.ts`）：`askForCard({ types })`（闪/杀/桃/无懈；`findResponse` 收编为默认行为"有就出第一张"）、`askFromAreas({ areas? })`（顺手/过河/寒冰/反馈/麒麟弓）、`askForTargets(candidates, { min/max })`（技能目标）、`askYesNo(prompt)`（发动）——直接实现，AI 决策一行隔离 + 注释
  - [x] B. 接入现有写死点（行为保持，逐处替换 `TODO(玩家选择)`）：
    - 响应牌：闪响应/决斗响应（逐张）、南蛮/万箭、濒死自救、无懈（简化 AI）、借刀杀人、青龙偃月刀
    - 区域选牌：过河拆桥/顺手牵羊/寒冰剑/反馈/麒麟弓/贯石斧弃牌
    - 技能目标：仁德/反间/青囊/突袭/结姻/遗计/鬼才；制衡弃牌、结姻弃牌
    - 发动询问：触发技能"你可以"（洛神继续判定等），接入 registerSkills 分发
  - [x] C. 回合外响应框架（ask 原语的上层应用）：
    - [x] 求桃按座次：从当前回合角色起按行动顺序询问桃；有人用桃后不重置回开头，指针停在用桃者身上（可连续用桃），一整轮无人响应才死亡
    - [x] 无懈响应链：机制已由 `wuxieContent` 置 targeting.data.cancelled + targeting 递归实现（后手无懈抵消先手），无需另建显式链；仅剩 AI 策略（只保护自己、不反无懈）写在 trigger 内，真人/前端接入时改为决策注入
  - 已完成：八卦阵（判定红视为闪，黑 retry 后可再出真闪）；离间 / 国色仍待
- 下游（依赖本项，不并入本 todo）：主公技（护驾/激将/救援）、五谷丰登亮牌选择、转化牌选源牌/目标（#3）

## 二、卡牌（标包 32 种，已全部注册；牌堆由 `src/standardDeck.json` 数据驱动，108 张）

### 基本牌（3/3）

- [x] 杀、闪、桃（桃支持濒死救人，求桃按座次）

### 锦囊牌（12/12）

- [x] 无中生有、决斗、南蛮入侵、万箭齐发、桃园结义、顺手牵羊、过河拆桥、借刀杀人、无懈可击、乐不思蜀、闪电
- [x] 五谷丰登（简化：每人摸 1 张）

### 装备牌（17/17，全部注册）

- 有实际效果：诸葛连弩、仁王盾、麒麟弓、寒冰剑、雌雄双股剑、青龙偃月刀、贯石斧、八卦阵（判定出闪）、丈八蛇矛（两张手牌当杀）、方天画戟（最后一张手牌杀可三目标）、6 匹马（槽位距离修正）
- 白板（效果待对应系统）：
  - 青釭剑（无视防具，依赖防具模型）

### 待完善（简化改真版）

- [x] 五谷丰登：亮出牌堆顶 N 张，按座次每人选一张（依赖 #9 牌堆原语 + askFromCards）
- [x] 借刀杀人：借刀使用者在其攻击范围内指定杀目标（复用杀 targetFilter，不选使用者本人）
  + 被借刀者"对指定目标出杀 / 交出武器"选择会话（默认 AI：指定第一个合法目标、出杀保武器；行为保持）
- [x] 无懈可击：响应策略显式化为 `wuxieGuardPolicy`（行为保持：只保护自己、不反无懈）

## 三、武将（标包 25 位）

### 已实现（25/25）

- 曹操（奸雄/护驾）、刘备（仁德/激将）、关羽（武圣）、赵云（龙胆①）、甘宁（奇袭）、夏侯惇（刚烈）、司马懿（反馈/鬼才）、郭嘉（遗计/天妒）、甄宓（洛神/倾国）、张辽（突袭）、黄月英（集智/奇才）、华佗（青囊/急救）、孙权（制衡/救援）、周瑜（英姿/反间）、貂蝉（闭月）、张飞（咆哮）、许褚（裸衣）、马超（马术/铁骑）、诸葛亮（空城/观星）、陆逊（谦逊/连营）、黄盖（苦肉）、孙尚香（结姻/枭姬）、吕布（无双）、大乔（流离）、吕蒙（克己）

### 未注册武将（0/25，全部注册）

- 无

### 已注册武将的未实现技能

- 转化类：大乔·国色（判定区持久化身份）、貂蝉·离间（0 牌转化、不可被无懈）

### 已实现但与标包有差距（简化版说明）

- 突袭/洛神等：AI 策略写死（选择系统接入 ask 后统一改为决策注入）

## 四、写死/特判清单（待标包完成后统一清理）

> 这些是已实现但仍是“规则级特判 / 单例写死”的地方，按项目“有例子再抽象”的约定先保留，
> 等整个标包跑通后再决定哪些值得抽成通用机制。

### 响应/杀相关

- 铁骑：`RespondMarks.unavoidable`，马超 `targeting.after` 写死设置（唯一用例）
- 无双：`RespondMarks.shanRequired = 2`；决斗 content 里 `hero.skills.includes('无双')` 特判
- 方天画戟：`playChoices.fangtianMaxTargets`，按装备 + 最后一张手牌放宽目标上限到 3
- 青龙偃月刀 / 贯石斧：`shaCancelled.after` 装备 trigger，分别再出杀 / 弃两张牌
- 仁王盾：`targeting.before` 黑色杀置 targeting.data.cancelled
- 雌雄双股剑：`targeting.after` 异性目标触发
- 寒冰剑 / 麒麟弓：`damage.before/after`，判定 useCard 是杀

### 锦囊/延时锦囊

- 借刀杀人：决策已收口为选择会话（使用者指定杀目标 + 被借刀者选“出杀/交武器”），默认 AI 保持旧行为；
  “不选使用者当杀目标”沿用旧简化（规则文本待核）
- 决斗：循环内无双特判；响应杀不产生 useCard（奸雄只拿决斗）
- 无懈可击：默认 AI“只保护自己、不反无懈”显式化为 `wuxieGuardPolicy`（`trick.ts`），行为保持
- 乐不思蜀 / 闪电：各自 `delayContent` 写死；闪电按点数/花色特判转移
- 五谷丰登：简化版每人摸 1 张，未实现真“亮牌选牌”

### 武将技能

- 鬼才：`judge.judging` 任意手牌替换判定
- 反馈 / 天妒：`askFromAreas` / 拿判定牌
- 遗计：AI 默认全给自己（分配任意角色已实现）
- 洛神：`preparePhase` 里 judge 循环 + `askYesNo` 写死“继续判定”
- 突袭：`drawPhase.before` shuffle + `askForTargets` 抢牌
- 裸衣：`drawPhase.before` 减摸牌 + 临时 `damage.before` handler（手动注册/注销，无通用临时标记）
- 观星：`zhugeliang` 里两步“选顶子集 → 排底顺序”的选择计划（单例）
- 遗计：`guojia` 里逐张 `targetsStep` 分配（单例）
- 救援：`useCard.after` 判定“吴势力桃对孙权（主公）”→ 回复 +1（单例）
- 护驾 / 激将（响应）：`ResponseRule.resolve` 轮询同势力盟友 `resolvePlayResponse`（借牌，单例）
- 激将（出牌阶段）：`playChoices.lordShaActions` 走 `group:'lord'` 特判，仅蜀盟友真杀（单例）
- 克己：`skipDiscardPhase` 标记（触发判定已迁移为历史查询 `findEventSince`：本回合是否 useCard 过杀；
  语义 = 旧 `usedShaThisTurn`，只计"使用"不计"打出"——响应打出不产生 useCard 事件，修正需先补"打出"记录）

### 系统级“单例特判”结构（刻意保留）

- `RespondMarks { shanRequired, unavoidable }`：挂在 useCard 上的响应状态（无双/铁骑用）
- `TargetingEventData.judging`：判定阶段无懈窗口标记（判定区延时牌用）
- `shaCancelled` 时点：目前青龙/贯石斧监听
- `judge.judging`：鬼才替换判定牌

### 尚未实现（白板/待做，不属于“写死”但要一起清）

- 青釭剑（无视防具）、离间、国色

## 五、阶段 3 拆解与依赖（技能与效果建模）

> 依据：《演进与避坑》第九节（技能建模：结论 + 开放问题）与第十节阶段 3。
> 本节只列**需求 / 依赖 / 验收 / 触碰的开放问题**，不做具体设计；每项开始前按"先讨论后实现"
> 过对应开放问题，达成一致后再动手。顺序基本即依赖序，可分批验收（每批全量测试绿）。

1. [x] **effect 统一收口（地基）**——效果 = 一等公民（时点 + 条件 + 行为），技能 = 效果的命名集合 + 元数据。
   - 落地（`src/effects.ts`）：`Effect` 五形态（triggered / persistent / activated / response / conversion），
     共同字段 `skill?`（归属技能）/ `equipType?`（装备归属）/ `name?`；技能 = `defineSkill({name, meta, effects})`
     （元数据 `info/lord/compulsory`）；裸效果 = `registerBareEffect`；**唯一注册面**。
   - 装载：`installEffects(game)` 单分发器（回合内按座次；技能来源询问"是否发动"——`forced` 已留挂点；
     装备/裸效果不询问）；查询面 `effectRegistry.sum/has`（常驻）、`skillRegistry.get/all`（技能）形态不变。
   - 迁移：26 触发技 + 6 主动技 + 8 响应规则 + 4 转化 + 10 常驻 + 6 `equipTrigger` 全部归位；
     旧注册面（`skillRegistry.register`/`activeSkillRegistry`/`responseRuleRegistry.register`/
     `conversionRegistry.register`/`effectRegistry.register`/`CardDef.equipTrigger`）已删除，无兼容壳。
   - 顺带清理（本次实现）：无双①② 由 `RespondMarks.shanRequired` + 决斗 content 特判 →
     带归属的常驻查询 `shaRequired` / `juedouShaRequired`；激将出牌阶段由 `playChoices.lordShaActions`
     特判 → `activated` 效果（逻辑等价搬运；借杀消耗"本阶段杀次数"通过 activated 回执
     `usedShaLimit` 表达，行为与旧 `kind:'card'` 路径一致）。
   - 验收：tsc 无错 + 全量测试绿（45 文件 / 403 用例，与基线一致）+ 行为保持（无双/激将仅结构变化，语义不变）。
   - 注：装备效果本次只做**结构迁移**（`equipType` 归属 + 触发/响应/转化/常驻形态）；
     装备技能建模（生命周期 / 局内存储 / 青釭剑）仍按第 8 项延后。
   - 开放问题（第九节）：1 效果收口形态（本项为轻量形态，模块化/DI 收口留阶段 5）、4 可组合谓词层形态。
2. [x] **发动词汇三轴落地**（原"锁定技标记"，TODO #4）——三件事分属三类对象，勿混为一谈：
   - effect 级 `auto`（自动发动，绑 effect）：前端多一个"自动发动"按钮，**现在不做**，
     仅加占位字段（`EffectCommon.auto?: boolean`，引擎不消费）；
   - effect 级 `forced`（强制发动，绑触发技的 effect）：不进行"是否发动"的询问
     （机制已接线 + 引擎级测试 `effects.test.ts` 验证；标包无触发型锁定技，内容用例待后续）；
   - skill 级 `Compulsory`（锁定技抗性标签，绑技能）：字段就位、6 个锁定技已标；
     查询入口等第 3 项（真实消费者）出现再提炼（有例子再抽象）；
   - 规则文本的"锁定技" = 内容层组合（技能打 `Compulsory` + 其触发效果打 `forced`）；引擎不推导（演进 9.2）。
   - 验收：tsc 无错 + 全量测试绿（46 文件 / 409 用例）；第 6 项排序依赖本项已就绪。
3. [x] **技能实例化**（定义静态 + 局内实例；演进 9.2 已确认方向）——提前到本位置，因为"失效/复原"需要挂点：
   - `Player.skills: Map<string, SkillInstance>`（`{ def: Skill; disabled: boolean }`）= 局内权威；
     `hero.skills` 退为"初始技能清单"内容数据；`createGame` 建局按它建立实例（同名武将各自独立）。
   - 归属判定 `effectOwnedBy` 改查实例（存在且未失效）——**获得/失去技能即时生效、无需注销 handler**。
   - API：`skillInstance / playerHasSkill / playerSkillDisabled`（查询）、`gainSkill / loseSkill`
     （获得/失去：仅实例增删，**不带 onGain/onLose 钩子**，等真实用例再加）。
   - 本轮不含：装备实例化（留第 9 项）、次数/临时数据字段（等真实需求）。
   - 验收：`skillInstance.test.ts` 4 例（开局建实例 / 同名武将独立 / 获得即时生效 / 失去即时失效 / 错误语义）
     + 全量测试绿。
   - **伴生：游戏初始化整理**——`createGame` 显式命名步骤：建容器 → 建玩家（hero 副本 + 容器 + 技能实例）
     → 备牌堆（shuffle）→ 起始发牌（事件外直放；`initialHandSize` 可配，默认 4）→ 初始状态 →
     **装载效果**（`installEffects` 内置且幂等，index.ts 与测试不再手动调用）。
     注释已标接入点：阶段 4 身份场/模式在此分配、阶段 5 rng service 在此替换洗牌。
4. **技能失效 / 复原**——临时失去效果但**不触发生命周期钩子**；失效状态挂**技能实例**（第 3 项已就位）；
   失效判断**之前**先查 `Compulsory` 抗性（与第 2 项配套）。依赖 1、2、3。
   - 第一个真实用例：青釭剑（令目标防具失效——目标防具是 `equipType` 归属，装备侧失效落点与第 9 项联动）。
5. **判定区转化身份 / 国色**——长生命周期 UsedCard 与 CardArea 的对应关系（阶段 2 ✓ 已就绪）。
   - 真实用例：国色（标包唯一）。依赖 1 + 阶段 2。
6. **0 牌转化 + 不可被无懈（离间）**——依赖转化系统与无懈窗口；与国色同为标包收尾内容。
7. **排序显式化**（演进 5.2 红线）——座次主排序 + 同优先级玩家手选（ask 原语已有）+
   `forced` 效果不询问（依赖第 2 项）。行为变化需显式说明 + 机械更新测试。
8. **技能 info 规则文本**——`SkillDef.info` / `CardDef.info` 纯数据字段，内容源 = docs 导出 JSON（TODO 一.5）。
   低风险，可随时插入。
9. **（延后）装备技能建模**——武将技能迁移（第 1 项）已完成，其延后条件已满足，但仍排在实例化/失效之后；
   届时一并决定装备效果是否实例化（生命周期 + 局内存储）与"装备区是否收进位置模型"（见下方伴生事项）。
   用例：现有 17 张装备 + 青釭剑（第九节 9.5）。

### 伴生事项：CardArea 内部结构自定义（不在本阶段单独开设计）

- 牌堆顶/底（已由 `putTop/putBottom` 原语承担）、装备区（当前非 CardArea，4 槽位对象）、判定区顺序等
  "每区自管存储/排序"的需求，**由本阶段真实用例触发**，触发任一条件再开设计（继承 or 注入）：
  ① 出现 2–3 个"某区域需要不同进出/排序语义"的真实用例；② 同一件事出现两处特判需统一
  （如装备区进出散在 moveCards 物理层与测试 helper）；③ 序列化 / DI / 回放要求统一区域接口；
  ④ 出现性能信号。
- 触发前的登记处：本节 + TODO #10 注 + 演进 3.4 开放问题。

## 下一步（建议）

> 实施顺序已整理进 [演进与避坑.md](演进与避坑.md) 第十节"实施路线"（七阶段）；阶段 3 的拆解见上一节。
> 简要版：标包真收尾（奸雄修复 ✓）→ 事件历史 + clear 钩子（#7/#8 ✓，克己已迁移历史查询）→
> CardArea 容器（阶段 2 ✓：受控容器 + 集中索引 + toPosition 剥离 + 对账不变量 + API 去数组伪装）→
> 技能与效果建模（阶段 3 拆解见上：effect 收口 / 发动词汇 forced+Compulsory / 失效 / 国色 / 离间 /
> 排序 / info；装备技能延后到武将技能迁移完成后评估）→
> 军争/神话再临内容包 → DI 插件机制 → 前端/回放/编辑器。

## 已知问题

- [x] 奸雄的伤害因果归属：已修复——`DamageEventData` 增加显式因果字段 `card`（`src/events/types.ts`），
  杀/决斗/南蛮/万箭/贯石斧在"牌直接造成伤害"处显式赋值，奸雄改读该字段；
  刚烈等 `damage.after` 内的反击伤害（技能伤害、无 card）不再经 `getParent('useCard')` 误归原杀/决斗。
- [ ] 无懈可击 AI 策略仍写死（只保护自己、不反无懈），真人/前端接入时改为决策注入
  （策略已显式化为 `wuxieGuardPolicy`，`src/cards/trick.ts`，行为保持）
