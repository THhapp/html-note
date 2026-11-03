# 作者装配与聚焦示例

这是普通作者入口，不是开发宿主的源脚本清单。页面只加载：

- `../../dist/note-library.css`
- `../../dist/note-library.js`
- 本目录的 `data.js`、`handoff-demo.js`、`boot.js`、`authoring.css`

## 文件

- `data.js`：可替换内容。矩阵乘法与逐项读数都返回 `NoteDemoRecipes.focusWorkbench` 的配置；第四例返回 `NoteDemoRecipes.diagramTable` 的 bindings/initial/steps。`steps[].scene.attention.targets` 是作者给出的观察顺序。
- `handoff-demo.js`：第三个普通 DOM 交接小例。自定义 Adapter 只使用公开契约（Definition / Adapter / PreparedChange / EffectSpec / scene.attention），包含来源标签与目标标签，使用 `PreparedChange.sourceElements()` 与 `EffectSpec.handoff:'hold'`；不读取 `NoteDemoInternals`，不自建播放器、计时器或清理框架。
- `boot.js`：唯一启动文件，负责 mount 四个会话（前三例 + diagramTable 跨区域例）、把 `session.getState().phase` 写到状态位；不实现播放器、字幕、计时或动画。
- `authoring.css`：页面外壳与内容排版；通用区域骨架来自 `src/demo/recipes.css`。
- `index.html`：开发入口，也是自包含预览的模板。

## 观察目标与内容目标

`attention.targets` 的每一项是 `{ binding, query, groups?, holdDuration? }`：

- `groups: []`：只观察、不启动内容。示例用它标记矩阵 A/B 的稳定来源单元。
- 省略 `groups`：按整个 Binding 启动内容（当前内置 Adapter 尚未细分效果组）。焦点真实到达该目标后才启动，内容 ready 后焦点才交给下一个目标。
- `holdDuration`：观察目标表示停留时长；内容目标表示 ready 后的额外等待。`0` 是有效值（显式零额外停留），示例在矩阵第 1 对乘积上演示。
- 最后落点由会话弱化并静止，不配置观察倒计时。

## 节奏与辨认意图

两例的停顿按“读者当前要辨认什么”校准，不为展示参数而拉长：

- 矩阵每对：A 当前单元值 → B 当前单元值 → 对应乘积出现。三个 pair 步的 `scene.attention.stepDuration` 统一为 440ms，只给两个来源单元辨认时间；焦点从上一乘积项的弱化位置直接承接，不重扫已经停稳的依据；乘积内容到达后零额外等待。第 2 对不再有人工 900ms 停留。末步看累计和与结果；累计表达式用公共 `Expression` 的 `{part:'body'}` 内容容器作为观察目标，旧值先可见，`4 + 1 + 12 = 17` 在同一框内展开；停稳后弱化，不设最终倒计时。
- 读数每步：确认当前读数格 → 看右侧当前读数更新。`scene.attention.stepDuration` 为 400ms；readout 内容由自己的内容目标门控，焦点仍在上一停点时不会先更新数值，避免读者错过变化。三格读完后才进入汇总；汇总与结果在同一末步弱化保留。
- 两个 demo 都使用默认的“到达后启动内容 + 内容 ready 后交接”；只有矩阵第 1 对乘积显式写 `holdDuration: 0` 作为零额外等待的对照。
- 本机 Edge（1440px 宽、当前公共运动参数）实测：矩阵四步约 3.8 / 3.9 / 3.8 / 2.9 秒，A/B 来源单元各约 0.47–0.49 秒辨认；读数四步约 2.1 / 2.2 / 2.3 / 2.8 秒，每步两次视线移动各承担一格数值和右侧读数的出现。数值随窗口和机器变化，校准依据是“每步只辨认当前信息”，而不是固定秒数。

## 运行状态

按钮可用性不等于运行状态：末步的“下一步”禁用只表示没有下一停点，“上一步/重看”在运行中还能取消当前步骤。判断是否运行请读 `session.getState().phase`（`idle` / `running` / `error` / `disposed`）或 `session.subscribe`。默认舞台控制容器上的 `data-demo-running` / `aria-busy` 只用于样式与读屏提示，不代替 phase 判断。页面上的“状态：空闲/运行中”由 `boot.js` 订阅写出，`window.AuthoringPhases()` 可供控制台读取；没有新增公共 API。

自定义宿主按导航语义分别计算可用条件（默认舞台已经在做）：`prev`/`replay` 在 `running` 中可用于取消；`next` 在 `running` 或已到最后一帧时禁用；首帧的 `prev`/`replay` 与无帧的 `reset` 禁用。

## 普通 DOM 交接（自定义 Adapter）

第三例演示“动画结束后由谁接住画面”和“来源对象保留到观察结束”。适配器对象与 Definition 都在 `handoff-demo.js`：

- 摄像机流程：初始 Frame `source` 显示来源标签；进入目标 Frame `handoff` 时 `commit()` 隐藏来源标签、预置目标标签 `opacity: 0`，并声明 `sourceElements() -> [来源标签]`。
- attention：先观察来源标签（`groups: []`，观察目标），再到达目标标签（`groups: ['reveal']`，内容目标）。观察期来源标签保持可见；内容轨道启动时公共 scene 释放来源覆盖，来源标签退出。
- 目标标签的 WAAPI 淡入 spec 带 `group: 'reveal'`、`handoff: 'hold'`：动画结束后末帧保持到 scene 收束，不会先回落到预置的隐藏内联样式再等清理。
- 同组另有一条稍长的箭头提示轨道，让“局部动画结束 → 整步收束”的窗口真实存在，便于实际观看手写交接；该轨道不声明 `handoff`，按普通局部效果收尾。
- 减少动效：直接提交目标（来源隐藏、目标可见），不产生局部动画和预置隐藏；取消/重看/重来恢复到正确的来源或目标画面。

适配器只需要公开契约；`mount(host)` 中的 DOM 只含来源/目标标签，播放、ready、清理与补间句柄都由公共 scene 负责。DOM 钩子：`.handoff-demo__stage` 的 `data-stage="source|handoff"`、`[data-adapter-part="source|target"]`。

## 跨区域依据 → 结果（diagramTable）

第四例把“当前依据”和“结果表”拆成两个区域：`evidence` 是普通 DOM Binding，`table` 是独立 table Binding，`status` 是辅助状态。

- step A/B 的 `scene.attention.targets` 都先到 `evidence`，再到达 table 的行目标（`{row:'r1'}` / `{row:'r2'}`，`groups:['row:<key>']`）。
- table 新行在 commit 时进入 DOM，但 row-enter WAAPI 以 `opacity:0` 暂停；表目标到达后才 ready→finished，已有行不重播。该行为已由真实 Edge 探针与本 focused check 核对。
- `status` 的视图变化也必须列入 `scene.bindings`（compile 不允许视图变化但不列入 scene）；用 `mode:'cut'` 同步提交，不写 attention target，因此不会被 Focus 巡视。
- 跨区域只在“依据/结果无法直接对应、主要变化需要寻找”时使用公共 attention；顺序由作者给出，工具不猜重点。

## 依赖

`demo-ui` 模块（包含 `NoteDemo.mount`、默认舞台、`NoteDemoRecipes.focusWorkbench` 与 `NoteDemo.effects` 作者工具）；整库已包含。配方源码在 `src/demo/recipes.js`，运行核心在 `src/demo`。

## 运行

直接双击 `index.html`（需先构建整库），或由集成负责人生成自包含预览：

~~~powershell
node scripts/build.mjs --final --release
node scripts/build-demo-preview.mjs --template examples/authoring/index.html --output dist/作者装配与聚焦-预览.html
~~~

默认静止，使用演示下方控件推进。前两例的完整 Definition 仍可通过 `NoteDemo.compile` 输出或把 `demo.definition` 交给 `NoteDemo.create` 检查；第三例可直接查看 `handoff-demo.js` 中的 `definition()`；第四例由 `diagramTable` 配方生成，`recipe.definition` / `recipe.layout` 可直接读取。
