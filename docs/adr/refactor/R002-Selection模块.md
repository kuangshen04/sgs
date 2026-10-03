# R002 Selection 模块：静态选择步骤、可回溯会话与执行边界

- **状态**：已由 [R003](R003-Selection模块-Frame与回溯边界.md) 取代，未落地
- **目标落地位置**：`src/mvp/selection/`
- **旧语义来源**：`../0007-决策与AI分层.md` 及其此前的《选择系统设计（choose）》

> 本篇保留从旧设计恢复 Step / Session 边界、再尝试以静态 Step 解决前端可选性的中间结论。
> 后续讨论确认“每次交互的可选边界”和“答案失效的回溯边界”并不相同，因此 R003 去掉
> `SelectionStep`，以 Frame + answerKey 取代本篇模型。

## 背景

ADR-0007 保留了 `SelectionOption / Step / Plan / Session` 的结构，以及“步骤可依赖、可回溯”的结论，
但压缩掉了决定 Step 颗粒度和 Session 终点的判据。这会让 Step 被误解为一种业务选择 kind、一个前端
控件，或一次传输层请求，也会让牌执行后的内容选择被错误并入出牌前的可回溯会话。

本篇恢复并修正这些边界，同时确定 AI、scripted frontend、真人 frontend 通过并列 Controller 驱动
会话；具体前端传输协议仍不在本阶段定型。

## 决策

### 1. Selection 是“选择原语 + 一次可回溯的选择会话”

Selection 不是出牌阶段专用逻辑，也不执行牌、技能或其它业务行为。业务模块在外组织选择：

```text
业务模块 → Selection【外】
```

Selection 只形成决策；一次会话确认以后，结果才交给执行方。执行方是否以及如何使用结果，仍由拥有
该业务流程的模块决定。

### 2. Step 是静态候选的一次成型选择

Step 的定义是：

> 进入 Step 时候选集已经成型；一次回答不会因为当前已选内容而改变接下来仍可选择的候选。

一个 Step 可以一次提交一个或多个选项，也仍然是一个整体校验、整体回滚的原子决策。但它只能表达
**一次成型**的选择：候选之间没有需要逐项展开的业务依赖。选中某项以后，除了通用的“同一选项不能
重复选择”，其它选项是否可选不应发生变化。

如果“接下来可以选择什么”依赖目前已经选择了什么，就必须拆成多个 Step，由 Plan 根据既有答案计算
下一步候选。不得只把这种规则藏进同一个 Step 的最终 `validate`，迫使前端理解领域约束或在提交后才
发现组合非法。

因此，Step 不按 Card / Player / Boolean / Action 等业务种类建立引擎 kind。引擎仍只需要通用的
`options + validate` 原语；`cardsStep`、`targetsStep`、`yesNoStep`、`optionStep`、`actionStep` 等是
外部工厂，用业务候选和默认策略包装这个原语。

`validate` 仍负责答案来自当前候选、数量等一次成型约束，以及服务端的最终防御性校验。
`min / max / allowEmpty` 不需要成为不同原语或 kind，可以由工厂写进 `validate`。但会改变后续合法
候选的跨选项约束必须展开为多个 Step。选择非手牌也不是新原语，只是 `cardsStep` 的候选来自其它区域。

前端为形成一个答案而发生的多次点击、取消和本地修改，只是未提交的草稿，不会因此形成多个 Step。
反过来，即使多个种类的候选显示在同一处，只要它们属于同一个静态互斥决策点，也可以属于同一个 Step。

### 3. Plan 只组合尚未执行的决策步骤

Plan 负责：

- 按顺序产生 Step；
- 根据前序答案计算后续 Step 及其候选；
- 回溯后清除后续答案，并按保留的前序答案重新计算后续步骤。

Plan 是 Selection 中表达选择依赖和候选变化的唯一位置。Step 内不再建立第二套动态候选或局部状态机。
Plan 不执行牌或技能，不描述整个效果结算，也不决定前端页面布局。

选择答案第一版继续保留为各 Step 选中的 `SelectionOption[]`，会话结果是一组按 stepId 保存的答案；
不在缺少更多真实用例时建设强类型答案 DSL。

### 4. Session 是执行前的可回溯事务

Session 的定义是：

> 从开始形成一个动作意图，到把已确认决策交给执行方之前的一次可回溯事务。

一个 Session 可以包含“动作 + 该动作执行前所需的后续选择”。每回答一步都可以退回上一步；只有整个
会话确认后，答案才离开 Selection。确认本身不执行动作。

**执行是回溯边界。** 一旦调用方根据确认结果开始执行牌、技能或其它业务行为，原 Session 已经结束；
执行期间由 content 发起的新选择属于新的 Session，不能越过已经发生的业务行为回溯到执行前。

### 5. 颗粒度与会话边界示例

| 场景 | 结构 | 判据 |
|---|---|---|
| 出牌阶段选择牌、技能或转化 | 一个 `action` Step | 它们是同一互斥决策点的混合候选，不按候选种类拆 Step |
| 普通出牌 | `action → targets`，同一 Session | 共同形成执行前的用牌意图，选完目标后仍可回去换动作 |
| 从若干牌中任选四张 | 一个 `cards` Step | 选四张不会改变其它牌的业务可选性，候选一次成型 |
| 业炎选四种花色的四张牌 | `card-1 → card-2 → card-3 → card-4`，同一 Session | 每一步排除已有花色；下一张的候选依赖此前答案 |
| 选择两个相互独立的目标 | 一个 `targets` Step | 两个目标来自同一个静态候选集 |
| 第二个目标受第一个目标约束 | `target-1 → target-2`，同一 Session | 第二步候选必须由第一步答案计算 |
| 仁德 | `cards → targets`，同一 Session | 选牌与选目标是性质不同、可分别回溯的问题 |
| 流离 | `action → cards → targets`，同一 Session | 是否发动、代价和新目标共同形成执行前的完整决策，但不是一个整体答案 |
| 过河拆桥 | `action → targets → 确认`；执行后再开选区域牌的 Session | 目标区选牌发生在 `useCard` 及 content 已开始之后，不得回溯到是否出牌 |

业炎的四个答案最终由所属业务模块聚合成无序牌集；Step id 和中间顺序只是选择过程，不改变规则结果。
若以后真实交互需要直接修改更早的一张牌，可以增强 Session 的定点回溯并使后续答案失效，而不是把
动态候选重新塞回单个 Step。

由此，Step 可以在语义上对应“一次提交的静态答案”，但不等同于某个 UI 控件或一次网络请求；Session
也不等同于“一张牌运行期间出现的全部询问”。

### 6. AI 与前端是并列 Controller

`SelectionStep` 不携带 `ai`。Step 工厂只负责当前选择的候选、校验和提示，不同时拥有默认决策。
AI、真人前端与 scripted frontend 都在 Selection 外实现同一个 Controller 边界：

```text
                     SelectionSession
                            │
                   SelectionController
                  /          |          \
                AI        Frontend     Scripted
```

Controller 只读取当前 Session 的只读快照，并返回下一条操作。快照至少包括当前 Step 的要求和此前已经
回答的记录：

```ts
interface ReadonlySelectionState {
  readonly currentStep: SelectionStep;
  readonly answers: Readonly<Record<string, readonly SelectionOption[]>>;
  readonly canBack: boolean;
}

type SelectionCommand =
  | { readonly type: 'answer'; readonly selected: readonly SelectionOption[] }
  | { readonly type: 'back' };
```

以上代码只固定语义形状，最终命名与错误返回形式以实现验证为准。Controller 看不到 Plan，也不能直接
修改 Session；答案校验、记录、回溯、清除后续答案和推进 Plan 都由 SelectionSession 完成。

通常不需要独立的 `confirm` 命令。需要显式确认时，由 Plan 在末尾追加一个普通确认 Step；回答这个
Step 后会话完成，在回答前仍可用 `back` 回到前序选择。不需要显式确认的 Plan 在最后一个业务 Step
回答后直接完成。

AI Controller 与 Frontend Controller 地位相同：AI 可以读取原始 Step、选项负载和前序答案后返回
`answer`，Frontend Controller 则可在其内部把相同状态投影为前端协议，再把前端答案还原为内部选项。
scripted Controller 用预设命令序列驱动单测与 E2E。Selection 不判断答案来自哪一种 Controller。

托管通过 Controller adapter 表达，不进入 SelectionSession：

```text
FallbackController
├─ primary: FrontendController
└─ fallback: AIController
```

由 adapter 决定哪些外部状态触发 fallback，以及只接管当前 Step 还是接管剩余 Session。合法空答案、
“不发动”和 `back` 都是正常选择操作，不得被 Selection 误判为需要托管。

## 暂未决定

- 前端答案是否按 ID 编码，以及序列化、超时、断线续答和录像协议；
- 选择结果是否以及何时强类型化。

这些问题可以改变传输方式，但不得反过来把 Step 改成传输层请求，或跨过已经执行的业务行为扩大
Session 的回溯范围。超时和托管的具体策略属于 Controller adapter，不改变 Selection 核心协议。

## 与既有文档的关系

- 恢复 ADR-0007 压缩掉的 Step 颗粒度判据和 Session 执行边界；
- 保留 ADR-0010 的“决策不得执行”和“业务型 step / ask 工厂随所属模块走”；
- 服从 R000 的粗模块边界和不兼容重构策略；具体接口在剩余边界讨论完成后再确定。
