# 传播过程与局部过渡（自定义 SVG 图形示例）

这个示例演示“作者自己写的 SVG 图形”如何只通过公共 NoteDemo 契约接入，不需要访问
`NoteDemoInternals`、不复制播放器/计时器/清理框架。画面是精简的传播示意（A→B 去程、B→A 回传），
重点不是网络知识本身，而是公共能力的接入方式。

## 文件

- `index.html`：页面入口，也是自包含预览模板；加载整库 `dist/note-library.*` 与本目录脚本。
- `example.css`：页面外壳 + SVG 图形样式（`.pg-*`，常量只属于本示例）。
- `graph.js`：`window.PropagationGraph`，稳定底座 + 逐停点追加的 `.pg-layer`（初始停点没有历史层，每次过渡恰好追加一层）；提供 `restoreStage / prepareLayer / attachLayer / readModel / targetAt`，targetAt 只返回本步真实对象（front、label、event、eventDot）。
- `adapter.js`：`window.PropagationAdapter`，实现公共 Adapter 契约与 `groups()` / `EffectSpec type:'progress'`。
- `demo.js`：Definition（4 停点、3 次 scene update）与 `NoteDemo.mount` 装配；attention 只跟随本步运动对象，scene timing 约 0.9s；挂最小只读探针 `window.PropagationExample`。
- `README.md`：本文件。

## 公开契约用法

~~~js
var session = NoteDemo.mount(host, {
  definition: PropagationDemo.definition,
  layout: PropagationDemo.layout,
  adapters: { 'propagation-graph': PropagationAdapter }
});
~~~

Adapter 侧只使用公开契约：

- `normalizeView(view) -> { model, cues }`：model 为 `{ stage: 0..3 }`。
- `mount(host) -> BindingHandle`：`restore / readView / target / prepareChange / destroy`。
- `prepareChange(ctx) -> PreparedChange`：`groups()` 返回本次过渡声明的局部组；`commit()` 同步追加一层目标视觉（先预置为来源状态）；`effects(timing)` 返回带 `group` 的 spec；`cleanup()` 只释放未提交资源，不承担首次显示。
- `EffectSpec type:'progress'`：`{ type:'progress', group, duration, easing, update(progress), gate }`，由公共 sceneEffects 统一启动/取消/finished；`update(p)` 驱动 SVG 的 `x / width / cx`。
- 普通 WAAPI spec（标签淡入、事件出现）也在同一 `group`，因此文字与图形同组启动、同组 ready；它们声明 `handoff:'hold'`，局部淡入完成后保持末帧到 scene 收束，不会先回落到预置隐藏值。
- attention target 只指向本步真实运动对象：发送前沿、B 命中事件点、回传前沿；不安排“先巡视基站/上一前沿”的重复目标。内容目标到达后，焦点在活动期逐帧跟随移动对象。
- `range` 用 `NoteDemo.effects.unionRange([...])` 把移动前沿、正在增长的轨迹条和它的标签合成一个观察区域；事件点仍用真实事件组 union。框随 band 增长而连续包住去程/回程条，不框整图、不把焦点改成静态大框，也不会让框边压住标签。
- 连续 next 时，上一停点的弱化焦点就是下一步起点：新前沿与上一落点同位置，`send→hit` 直接承接；`hit→back` 从命中事件附近直接承接回传前沿，不绕 B 站圆点。
- 新层起点几何来自公开作者工具 `NoteDemo.effects.rectOf` 读取的上一前沿真实矩形；第一步没有上一前沿时回退到 graph 的静态常量。

## attention / groups 对应关系

| 过渡 | 声明的组 | attention 目标（按顺序） |
| --- | --- | --- |
| 初始 → 发送 | `send` | 发送前沿点（unionRange：前沿+轨迹条+标签）→ 组启动，焦点跟随前沿从左向右 |
| 发送 → 到达 B | `lead`、`event` | 新前沿点（同上一落点直接承接，unionRange 覆盖去程段+标签，焦点跟随到 B）→ B 命中事件点（union 事件组） |
| 到达 B → 回传 | `return` | 回传前沿点（从事件附近承接，unionRange 覆盖回程段+标签，焦点跟随回到 0.25L） |

每次过渡只追加一层历史证据；历史层永久保留，后层不重画、不覆盖前面的标记。
`range` 只把移动对象及其轨迹/标签包成局部框，避免框整条轴或整图；焦点始终跟随真实运动对象。

## 每步读者看什么

| 停点 | 读者辨认 | 焦点路线 | 本步保留 |
| --- | --- | --- | --- |
| 初始 | 链路空闲，A 还没有发送 | 无迁移，等待第一步 | 稳定底座（A/B、车道、刻度、历史区） |
| 发送 | 发送前沿从左向右推进 | 直接到发送前沿并跟随，到 0.55L 停稳后弱化 | 第 1 层证据与 ① 刻度 |
| 到达 B | 新前沿继续到 B，B 出现命中事件 | 从上一前沿同位置直接承接，跟随到 B 后落到事件点 | 第 2 层证据与 ② 刻度 |
| 回传 | 回传前沿从 B 向左回到 0.25L | 从命中事件附近直接承接回传前沿并跟随，不绕 B 站圆点 | 第 3 层证据与 ③ 刻度 |

单步内容节奏约 0.9s（本示例 `scene.timing`）；只影响这个 attention scene，不改变全库默认节奏。

## 可观测钩子（工程检查用，非运行 API）

- `window.PropagationExample = { session, adapter, getStage(), getLayers(), getFrames() }`（只读探针）。
- `.pg-svg[data-stage="0|1|2|3"]`；`.pg-layer[data-stage="1|2|3"][data-kind="send|hit|return"][data-progress="0..1"]`；当前层带 `[data-active="true"]`。
- 层内 `.pg-band / .pg-front / .pg-label / .pg-tick / .pg-event`（元素带 `data-part`）；页面 `[data-propagation-status]` 文本形如“历史层 N / 3 · 当前层：发送段”。
- 未放行内容保持来源视觉：新层 `data-progress="0"`、`width=0`、标签/事件 opacity 为 0；由对应 attention 目标到达后组才启动。

## 验证

- `node --check examples/propagation/graph.js examples/propagation/adapter.js examples/propagation/demo.js`
- 真实 Edge（tests/tools playwright-core）+ `tests/.cache` 临时脚本：静态契约 mock、身份/历史层、progress 连续性（本示例 scene timing 单步 0.9s）、attention 只跟随运动对象/无重复巡视、连续 next 焦点承接、handoff 末帧保持、取消/重看/reset、减少动效。
- 整例需先由整合方重建包含公共契约的 `dist`，再直接打开 `index.html` 或构建自包含预览。

## 限制

- 示例常量（坐标、0.55L / 0.25L 等）只属于本示例，不是公共默认值或教学标准。
- 一个 Binding 只演示一条链路；多图形/多 Binding 的因果依赖请按 Definition/scene 契约另行声明。
- 该示例是技术接入样例，未获用户视觉评价。
