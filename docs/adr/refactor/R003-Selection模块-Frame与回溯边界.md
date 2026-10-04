# R003 Selection 模块：Frame、answerKey 与可回溯 Plan

- **状态**：MVP 已落地
- **目标落地位置**：`src/mvp/selection/`
- **取代**：[R002](R002-Selection模块.md) 的静态 Step 模型
- **旧语义来源**：`../0007-决策与AI分层.md` 及其此前的《选择系统设计（choose）》

## 背景

旧模型用 `SelectionStep` 同时表示“一次前端可选范围”和“一次回溯后使后续答案失效的边界”。两者
并不相同：前端需要在每次选择后立即知道接下来还能选什么，而同一组答案内部的多次交互不应被当成
互相依赖的回溯步骤。

例如业炎选四种花色的四张牌：可选牌会在每次选择后变化，但四张牌共同属于一个答案。若替换最早选的
一张牌，只要其它三张仍合法，就不应仅因为它们选择得更晚而被清除。把业炎建模成一个静态 Step 无法
告诉前端下一张是否合法；拆成四个 Step 又错误扩大了回溯依赖。

因此新模型去掉 `SelectionStep`，分别表达交互 Frame 和回溯 answerKey。

## 决策

### 1. Selection 仍只形成决策，不执行行为

Selection 不是出牌阶段专用逻辑，也不执行牌、技能或其它业务行为：

```text
业务模块 → Selection【外】
```

业务模块用上层工厂把自己的候选、约束和依赖组织成 Plan；Selection 负责逐次交互、记录答案、回溯和
驱动 Controller。会话完成后才把答案交给执行方。

### 2. Frame 表示当前一次交互的可选范围

Plan 每次根据当前答案计算一个短生命周期 Frame。Frame 至少表达：

```ts
interface SelectionOption {
  readonly id: string;
  readonly label: string;
  readonly group?: string;
  readonly data?: unknown;
}

interface SelectionFrame {
  readonly answerKey: string;
  readonly prompt?: string;
  readonly selected: readonly SelectionOption[];
  readonly options: readonly SelectionOption[];
  readonly canFinish: boolean;
}
```

以上代码固定语义而非最终命名：`selected` 是当前回溯边界内已经选择的内容，`options` 是在该状态下
接下来允许选择的内容，`canFinish` 表示当前边界是否允许结束。一次交互后 Plan 重新计算 Frame，因此
前端不需要执行领域规则，也不必等到全部选完才知道答案非法。

Selection 核心不再提供通用 `validate`、`min / max / allowEmpty` 或 Card / Target / Action kind。
这些大多是业务约束的不同写法，由拥有业务词汇的上层工厂转换成逐次 Frame：

```text
业务候选与约束
    ↓ 上层选择工厂
SelectionPlan
    ↓ 当前 answers
SelectionFrame
```

选择手牌、目标、布尔、动作等工厂随所属业务模块走，不进入 Selection 底层。

### 3. answerKey 表示回溯和依赖失效边界

答案继续按稳定 key 保存：

```ts
type SelectionAnswers = Readonly<
  Record<string, readonly SelectionOption[]>
>;
```

同一 `answerKey` 可以经历任意多个 Frame；这些 Frame 只是同一份答案的内部编辑过程，不建立互相之间的
回溯依赖。Plan 可以在内部更新、保留或拒绝当前边界的选择，仍然合法的已有选项原则上应当保留。

不同 answerKey 按本次 Plan 实际经过的顺序形成回溯路径。编辑以前的 answerKey 时：

- 仅返回查看而没有改变有效答案，不要求清除后续答案；
- 一旦该边界的有效答案发生变化，它之后的全部 answerKey 及答案失效；
- Session 根据保留的前缀答案重新运行 Plan，生成新的后续 Frame；
- MVP 使用有序前缀失效，不提前设计依赖 DAG。

因此，`back` 的含义是回到上一个 answerKey 编辑，而不是撤销上一次 Frame 交互。

### 4. Plan 是逐次可选项的唯一计算者

Plan 读取已经完成的前缀答案和当前 draft，返回下一个 Frame；会话完成时返回空：

```ts
interface SelectionDraft {
  readonly answerKey: string;
  readonly selected: readonly SelectionOption[];
}

interface SelectionPlanState {
  readonly answers: SelectionAnswers;
  readonly draft: SelectionDraft | null;
}

interface SelectionPlan {
  getFrame(state: SelectionPlanState): SelectionFrame | null;
}
```

`answers` 只含当前活动边界之前已经 finish 的答案；`draft` 是当前边界尚未完成的选择。`draft === null`
表示请求开始下一个边界，Plan 返回 `null` 表示整个会话完成。实现满足以下约束：

- 每次选择、取消或结束边界后都可以重新计算 Frame；
- Frame 只给出当前合法交互，不把约束函数交给前端执行；
- Plan 不执行牌或技能，不描述已经越过执行边界的 content；
- Selection 核心不理解产生 Frame 的业务约束。

通常不需要 Session 级 `confirm` 命令；需要显式确认时，Plan 可以产生一个普通确认边界或确认交互。

### 5. Session 是执行前的可回溯事务

Session 仍定义为：

> 从开始形成一个动作意图，到把已完成决策交给执行方之前的一次可回溯事务。

**执行是 Session 边界。** 一旦调用方根据结果开始执行牌、技能或其它业务行为，当前 Session 结束；
content 中随后发起的选择属于新 Session，不能越过已发生的行为回到执行前。

### 6. AI、前端和 scripted 是并列 Controller

Selection 不内置 AI。真人前端、AI 与 scripted 实现同一个 Controller 接缝：

```text
                     SelectionSession
                            │
                   SelectionController
                  /          |          \
                AI        Frontend     Scripted
```

Controller 只能读取 Session 的只读状态，包括当前 Frame、此前 `SelectionAnswers` 和能否回溯；它返回
当前交互或 `back`，不能直接修改 Session，也看不到 Plan 的内部实现。答案更新、后续失效和 Plan 重算
全部由 Session 完成。

MVP 的交互命令为：

```ts
type SelectionCommand =
  | { readonly type: 'select'; readonly optionId: string }
  | { readonly type: 'unselect'; readonly optionId: string }
  | { readonly type: 'finish' }
  | { readonly type: 'back' };
```

`select` 只能使用当前 `options` 中的 ID，`unselect` 只能使用当前 `selected` 中的 ID，`finish` 要求
`canFinish === true`；任一非法命令都不改变 Session。

Frontend Controller 逐 Frame 与用户交互。scripted Controller 用预设交互驱动单测和 MVP E2E。
超时、断线和托管不进入 Selection 核心，由 Controller adapter 组合：

```text
FallbackController
├─ primary: FrontendController
└─ fallback: AIController
```

合法空答案、“不发动”和 `back` 都是正常选择，不得被当成 fallback。

### 7. AI 决策颗粒度与 Frame 执行颗粒度分离

AI 不必为每个 Frame 重新进行一次业务决策。AI 本体可以按整个 Plan 产出希望得到的完整或部分意图，
AIController 再把意图逐 Frame 落地：

```ts
type SelectionIntent = Readonly<
  Record<string, readonly string[]>
>;
```

这里外层 key 是 answerKey，内层值是期望选择的 Option ID。AIController 在每个 Frame 中保留已经符合
意图的选择，从当前 `options` 中应用尚未完成的 ID，并在满足该边界后继续。边界级 AI 工厂只是方便的
组合单位，可以汇总成 Plan 级 AI；它不是 Selection 强制的调用颗粒度。

托管中途接管时，AI 可以读取已有答案和当前边界选择，为剩余 Plan 重新产生意图。若前序边界变化、
实际 Frame 与缓存意图不再相容，AI adapter 负责丢弃或重新规划，Selection 不内置 AI 策略。

### 8. Option ID 在同一上下文的多个 Frame 间稳定

Plan 级 AI 和前端都需要在不预先生成每个 Frame 的情况下引用选项，因此 `SelectionOption.id` 是必填的
稳定身份。约束是：

> 在前序回溯边界答案不变时，同一个可选实体或值跨多个 Frame 出现，必须使用相同 Option ID。

Option ID 不编码已经由前序答案确定的业务语义。完整含义来自：

```text
前序 answers + 当前 answerKey + optionId
```

例如下面两条路径天然不同，无需把武圣再次编码进牌 ID：

```ts
{ action: ['wusheng'], card: ['card:17'] }
{ card: ['card:17'] }
```

若 `action` 从武圣改为其它动作，`card` 及其后续答案会失效；新分支可以安全复用 `card:17`。因此 ID
只标识当前上下文中的可选实体或值，不建立全局语义注册表，也不得使用 Frame 序号或临时递增值为同一
对象反复生成不同 ID。ID 的构造由拥有实体或选项词汇的上层工厂负责。

### 9. 典型结构

| 场景 | answerKey / Frame 结构 | 回溯语义 |
|---|---|---|
| 普通出牌 | `action` 的若干 Frame → `targets` 的若干 Frame | 修改 action 后 targets 失效；targets 内部交互不影响 action |
| 业炎四花色 | 一个 `cards` answerKey，选择后反复重算 Frame | 替换一张牌时保留同边界内仍合法的其它三张 |
| 选择多个目标 | 一个 `targets` answerKey，Plan 按当前已选目标重算 Frame | 目标之间的可选约束不制造新的回溯边界 |
| 仁德 | `cards → targets` 两个 answerKey | 修改赠牌后目标答案失效 |
| 流离 | `action → cards → targets` 三个 answerKey | 修改代价牌后新目标失效，但 cards 内部编辑自行处理 |
| 过河拆桥 | 执行前 `action → targets`；content 中另开选择 Session | content 选区域牌不能回溯到是否使用过河拆桥 |

## MVP 落地

- **位置**：`src/mvp/selection/selection.ts`
- **测试**：`src/mvp/selection/selection.test.ts`
- 已实现 `SelectionOption / SelectionFrame / SelectionAnswers / SelectionPlan / SelectionSession`；
- 已实现只读 Controller 状态、`select / unselect / finish / back`、`runSelection` 与 scripted Controller；
- 回溯编辑时暂存原后缀：答案未变则恢复，答案变化则清除并让 Plan 按新前缀重算；
- 单测覆盖业炎式“一个 answerKey、多个 Frame”、稳定 Option ID、后缀恢复/失效、非法命令和空 Plan。

MVP 不提供业务选择工厂，不实现具体 AI 策略、真人网络协议、超时、断线续答、录像、并行询问或强类型
答案 DSL；这些后续能力不得重新合并 Frame 与 answerKey。

## 与既有文档的关系

- 取代 R002 的静态 Step 模型；R002 作为讨论过程保留，不作为实现约束；
- 保留 R002 从旧文档恢复的“执行前 Session”和“执行后另开 Session”边界；
- 保留 ADR-0010 的“决策不得执行”和“业务选择工厂随所属模块走”；
- 服从 R000 的粗模块边界和不兼容重构策略。
