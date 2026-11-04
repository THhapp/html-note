# 组合块：演示舞台与状态对照（blocks-stage）

B01–B04 · 类别「可复用组合块」 · 共识 K03 / K04 / K05 / K06 / K09 / K12 / K13。


## 1. 范围与加载

本文件记录四个预制组合块：

| ID | 公开入口 | 源文件 | 作用 |
| --- | --- | --- | --- |
| B01 | `NoteBlocks.DemoStage` | `src/blocks/demo-stage.js` / `demo-stage.css`（`demo-stage` 模块） | 画面、固定字幕与基本控制的舞台 |
| B02 | `NoteBlocks.StepPlayer` | `src/blocks/stage.js` / `stage.css`（`blocks` 模块） | 完整状态快照的逐停点步进 |
| B03 | `NoteBlocks.RuleCompare` | `src/blocks/compare.js` / `compare.css` | 规则表格、行列强调与说明 |
| B04 | `NoteBlocks.StateCompare` | `src/blocks/compare.js` / `compare.css` | 前后对象、变化/未变标记与可选 Focus |

B01–B10 共用 `src/blocks/shared.js`（`blocks-base` 模块）：它只定义内部 `window.NoteBlocksInternals`（元素创建、内容写入、宿主校验、依赖检查、幂等销毁、步进快照包装等），不是公开 API；`blocks-base` 必须先于 `demo-stage` 与 `blocks` 加载。

组合块不另造基础控件，只调用公开接口：

- B01 组合 `NoteUI.Stack`、`NoteUI.Inline`、`NoteUI.Button`（layout + legacy）。
- B02 在 B01 的 `NoteBlocks.DemoStage` 上组合控件，组合块内部不复制舞台实现。
- B03 组合 `NoteUI.Table`（content）与 `NoteUI.Notice`（legacy）。
- B04 组合 `NoteViz.CompareView`（viz-objects）、`NoteUI.DataObject` / `NoteUI.Badge`（legacy）；`NoteExpr.Focus`（legacy）为可选增强。

推荐加载顺序（本地文件，普通 `<script>`，无模块与网络）：

```html
<link rel="stylesheet" href="src/core/tokens.css">
<link rel="stylesheet" href="src/core/base.css">
<link rel="stylesheet" href="src/ui/layout.css">
<link rel="stylesheet" href="src/ui/content.css">
<link rel="stylesheet" href="src/viz/objects.css">
<link rel="stylesheet" href="src/ui/controls.css">
<link rel="stylesheet" href="src/ui/primitives.css">
<link rel="stylesheet" href="src/expr/focus.css">
<link rel="stylesheet" href="src/blocks/demo-stage.css">
<link rel="stylesheet" href="src/blocks/stage.css">
<link rel="stylesheet" href="src/blocks/compare.css">

<script src="src/core/core.js"></script>
<script src="src/core/icons-data.js"></script>
<script src="src/core/icons.js"></script>
<script src="src/core/motion.js"></script>
<script src="src/core/floating.js"></script>
<script src="src/ui/controls.js"></script>
<script src="src/ui/primitives.js"></script>
<script src="src/expr/focus.js"></script>
<script src="src/ui/layout.js"></script>
<script src="src/ui/content.js"></script>
<script src="src/viz/objects.js"></script>
<script src="src/blocks/shared.js"></script>       <!-- blocks-base -->
<script src="src/blocks/demo-stage.js"></script>    <!-- demo-stage：B01 -->
<script src="src/blocks/stage.js"></script>         <!-- blocks：B02 -->
<script src="src/blocks/compare.js"></script>       <!-- blocks：B03–B04 -->
```

B04 在 `NoteExpr` 不存在时会静默跳过 Focus，不抛错。`NoteViz.CompareView`、`NoteUI.Table` 等必需依赖未加载时，挂载会抛出具名依赖错误。`blocks-base` 提供 `shared.js`，`demo-stage` 提供 B01，`blocks` 提供 B02–B04；`blocks-stage.json` 与 `blocks-explain.json` 合并为同一 `blocks` 模块，依赖取并集（含 `blocks-base`、`demo-stage`、`viz-flow` 等）。只加载 `blocks` 模块时需先加载 `blocks-base` 与 `demo-stage`，否则 B02–B04 无法挂载。

<a id="B01"></a>
## 2. B01 `NoteBlocks.DemoStage`

### 2.1 最小用法

```js
var stage = NoteBlocks.DemoStage.mount(host, {
  title: '一次检查',
  stage: someNode,                 // DOM 会被移入；字符串按纯文本显示
  caption: '先看输入，再看结果。',
  captionLabel: '字幕',             // 可选：字幕身份标签；空字符串则不显示
  controls: [
    { label: '继续', variant: 'primary', onClick: function (event) { /* ... */ } },
    { label: '不可用示例', disabled: true }
  ],
  maxWidth: '58rem',
  minStageHeight: '180px',
  label: '检查演示'
});
stage.setCaption('同一停点的新字幕');
stage.setStage(document.createTextNode('纯文本画面'));
```

### 2.2 options

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `title` | string \| Node | `''` | 有内容时显示标题；DOM 会被移入。 |
| `stage` | string \| Node | 无 | 演示画面。字符串是纯文本，不解析 HTML。 |
| `caption` | string | `''` | 画面下方字幕正文；始终保留约两行高度。 |
| `captionLabel` | string | `''` | 可选身份标签（如“字幕”）；显示在字幕正文左侧，空字幕时隐藏；不写入字幕文本。 |
| `controls` | Array | `[]` | 配置对象或 DOM 节点。 |
| `maxWidth` | number \| CSS 长度 \| null | `null` | 仅限制组件根的 max-width；数字按 px。 |
| `minStageHeight` | number \| CSS 长度 \| null | `null` | 可选地预留舞台最小高度；不规定统一尺寸。 |
| `label` | string | `''` | 显式可访问名称；缺省用标题，或回退为“演示舞台”。 |

`controls` 配置项可含：

```js
{
  label: '下一步',
  onClick: function (event) {},
  variant: 'primary' | 'secondary' | 'quiet',
  disabled: false,
  icon: 'arrow-right' /* 图标名或 DOM */,
  ariaLabel: '可访问名称'
}
```

配置项用 `NoteUI.Button` 构造。图标名经 `NoteCore.icons.get` 解析为 SVG；解析失败时不伪造图形。若需要宿主已有按钮，直接把 DOM 节点放入 `controls`；节点会被移入，不会克隆，宿主仍负责销毁它自己的 DOM 对应实例。

### 2.3 实例

```js
{
  el, stageEl, captionEl, captionLabelEl, narrationEl,
  setStage(nodeOrString), setCaption(text), setControls(items),
  update(patch), destroy()
}
```

- `setStage` 会替换舞台内全部内容；字符串变为纯文本。原有的宿主子组件不会被自动 `destroy`，需要宿主在替换前自行清理。
- `setCaption` 只写字幕正文；身份标签是独立节点，不会进入 `captionEl.textContent`。字幕区用 CSS `min-height: 3.3em` 预留约两行；更长字幕自然增高。换句动效由调用方（如 NoteDemo Presentation）在生命周期内管理，B01 自身不播放。
- `setControls` 销毁本组件创建的上一个控件实例，然后重建控件。宿主传入的 DOM 节点只会被移出，不被调用 `destroy`。
- `update(patch)` 支持以上所有 options 键；`update({controls})` 等价于 `setControls`。程序更新不触发任何用户事件。
- `destroy()` 幂等：销毁内部 Button 实例和布局实例，清空画面、字幕与标题，移除根。不会销毁宿主放进舞台的第三方组件，也不会恢复宿主移入的节点。
- `stageEl`/`captionEl` 暴露供 `StepPlayer` 或宿主使用；不要依赖其下方未被文档化的类名。

布局说明：`el` 是局部 `<section class="nblk-demo-stage">`，内部用 Stack 组织标题、舞台区和页脚；页脚 `.nblk-demo-stage__footer` 包含字幕 `.nblk-demo-stage__narration`（身份标签与正文）与控件 `.nblk-demo-stage__controls`。舞台本身没有强制外框、背景或固定高度。外部间距由宿主负责，根没有外部 margin。窄屏（≤760px）页脚吸底，长画面滚动时字幕和操作仍可见；桌面宽度保持正常文档流。

<a id="B02"></a>
## 3. B02 `NoteBlocks.StepPlayer`

### 3.1 最小用法

```js
var player = NoteBlocks.StepPlayer.mount(host, {
  steps: [
    { id: 's1', caption: '初始状态', state: { items: ['A', 'B'], focus: ['A'] } },
    { id: 's2', caption: 'A 已完成', state: { items: ['A', 'B'], focus: ['B'] } }
  ],
  render: function (state, ctx) {
    var view = NoteViz.Sequence.mount(ctx.stageEl, {
      items: state.items, focus: state.focus
    });
    if (ctx.replay) { /* 宿主可在此播放一次重看动效；减少动效自行处理 */ }
    return function cleanup() { view.destroy(); };
  },
  initialIndex: 0,
  title: '完整快照步进',
  onStep: function (index, step, event) { /* 仅用户操作触发 */ }
});
player.next();
player.getState();
```

### 3.2 options

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `steps` | `[{id,caption,state,label?}]` | `[]` | 每个停点的完整状态快照；数组会被浅拷贝，`state` 不深拷贝。 |
| `render` | `function(state, {index,replay,stageEl})` | 无 | 宿主渲染；可返回 cleanup 函数。 |
| `initialIndex` | number | `0` | 初始停点；挂载时夹紧到有效范围。 |
| `labels` | object | 内置中文 | 可覆盖 `prev` / `next` / `jump` / `replay` / `reset` / `empty`。 |
| `onStep` | function | `null` | `(index, step, event)`；仅用户操作引起停点变化时调用。 |
| `title` | string \| Node | `''` | 传给 B01 的标题。 |
| `maxWidth` | number \| CSS 长度 | `null` | 传给 B01 的最大宽度。 |

补充：若某个 step 带 `label` 字符串，原生跳转 select 会用它作为选项名称；否则显示“停点 N”。这是对冻结数据形状的向后兼容增补，未提供时无影响。`labels` 只做部分合并：未提到的键保留当前值。

### 3.3 实例与事件

```js
{
  el,
  go(index), next(), prev(), replay(), reset(),
  getStep(), getState(),
  update(patch), destroy()
}
```

- 默认只渲染 `initialIndex`，没有计时器、自动前进或自动串播。
- `go/next/prev/reset` 是程序方法，不触发 `onStep`。边界处不越界。
- `replay()` 对当前停点重新执行“cleanup → 清空 stageEl → render(state,{replay:true})”；不切换停点，也不伪造动画。
- `reset()` 重绘 `initialIndex` 对应的完整快照。程序调用不触发 `onStep`。
- `update(patch)` 支持 `steps/render/initialIndex/labels/onStep/title/maxWidth/label`。更换 `steps` 时夹紧当前索引并按当前索引重渲染；程序更新不触发 `onStep`。
- `getStep()` 返回当前步骤对象，`getState()` 返回其 `state` 字段；没有停点或销毁后为 `null`。
- `destroy()` 幂等：调用当前 render cleanup，销毁按钮与 B01 舞台，移除根。

用户事件语义：上一步、下一步、原生 select 跳转和“重来”由用户触发；只有停点编号真实变化时才调用 `onStep(index, step, event)`。用户点击“重看”不调用 `onStep`。这一规则确保宿主能区分“用户导航”和“程序更新/重绘”。

### 3.4 重绘、清理与错误

每次切换：

1. 若上一次 `render` 返回了函数，先调用它；
2. 清空舞台；
3. 更新字幕到目标 `step.caption`；
4. 以目标快照调用 `render(state, {index, replay, stageEl})`；
5. 保存本次返回的 cleanup，供下一次切换和销毁使用。

因此回退/重来恢复的是快照内容，而不是对 DOM 做增量撤销。宿主必须把可变状态都放进快照，并在 cleanup 中释放自己创建的子组件、计时器、动画或浮层。

若 `render` 抛错，当前舞台会显示 `role="alert"` 的可读错误以及“可用重看重试”的说明，控件仍可用；`console.error` 记录诊断信息。不会留下不透明的白屏。若 `render` 未返回函数，组件仍正常处理舞台内容，只是没有额外 cleanup。

### 3.5 键盘与焦点

- 只使用原生按钮与 `<select>`；不注册 window/document 级键盘监听，不劫持整页快捷键。
- 停点重绘只替换 B01 的舞台内部节点，不重建控件，因此按钮焦点不因画面重渲染而跳走。
- 到达首/末停点时，对应按钮原生 `disabled`；跳转 select 在少于两个停点时禁用。
- 字幕通过 B01 的 polite live region 更新；同一停点重看不会改写字幕。

<a id="B03"></a>
## 4. B03 `NoteBlocks.RuleCompare`

### 4.1 最小用法

```js
var ruleCompare = NoteBlocks.RuleCompare.mount(host, {
  rules: [
    { id: 'r1', label: '允许读取', condition: '请求已通过校验', result: '返回数据', note: '只读操作不写入审计内容。' },
    { id: 'r2', label: '拒绝写入', condition: '版本不一致', result: '返回冲突', note: '要求调用方重新读取。' }
  ],
  columns: null,
  caption: '处理规则',
  emphasize: { row: ['r2'], column: 'result' },
  note: '规则数据由宿主提供。',
  label: '处理规则对照'
});
ruleCompare.getTarget('r2'); // <tr data-row-key="r2">
```

### 4.2 options

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `rules` | Array of rule | `[]` | 每项 `{id,label,condition,result,note?}`；`id` 必须唯一，单元格值可为 Table 支持的字符串或 DOM。 |
| `columns` | Array \| object \| null | 默认四列 | 数组替换列集合（Table 列形状）；对象只覆盖默认四列的标签。 |
| `caption` | string | `''` | 传给 Table 的可见 caption。 |
| `emphasize` | string \| string[] \| object | `null` | 见下节。 |
| `note` | string \| Node | `null` | 表格下方常驻“补充说明” Notice；Node 会被移入。 |
| `label` | string | `''` | 根的可访问名称；缺省依次使用 caption、“规则对照”。 |

默认列：`rule` 规则、`condition` 条件、`result` 结果、`note` 说明。传入自定义列时，行对象同时包含原始字段以及 `rule`/`label` 别名，因此列 key 可以是 `rule` 或 `label`。

强调形状：

```js
{ row: 'r2', column: 'result' }
{ rows: ['r2', 'r3'], columns: ['condition', 'result'] }
'r2'                 // 只强调行
['r2', 'r3']         // 只强调行
```

行强调通过 `NoteUI.Table` 的 emphasis 机制实现；该块还会在表格上方生成可见文字摘要（“强调行/强调列”），因此不只依赖颜色。强调行若有 `note`，会在表格下方以 `NoteUI.Notice` 呈现邻近说明；全局 `note` 也以 Notice 显示。规则说明区的标题与正文都在正常阅读路径中，不藏在悬停里。

### 4.3 实例

| 成员 | 说明 |
| --- | --- |
| `el` | 根 `<section class="nblk-rule-compare">`。 |
| `update(patch)` | 合并以上 options 后重建表格数据与说明；程序更新无用户事件。 |
| `getTarget(id)` | 委托 `NoteUI.Table.getTarget(id)`，返回带该 `data-row-key` 的 `<tr>`；未知/销毁后返回 `null`。 |
| `destroy()` | 销毁 Notice 和 Table 实例，移除根；幂等。 |

表格自身提供宽表局部滚动与滚动提示；本块不接管滚轮或整页滚动，也不自动播放。没有自建按钮或键盘快捷键。若一条规则的 `note` 是 DOM，表格会保留并移动它；强调说明 Notice 使用其纯文本，避免同一个节点被两个位置移入。需要 Dom 结构完整的强调说明时，请用 `note`（全局说明）或自行在宿主区域补充。

<a id="B04"></a>
## 5. B04 `NoteBlocks.StateCompare`

### 5.1 最小用法

```js
var sc = NoteBlocks.StateCompare.mount(host, {
  before: [
    { id: 'quota', label: '每分钟额度', value: '60 次', caption: '旧上限' },
    { id: 'window', label: '统计窗口', value: '60 秒', caption: '未变项' }
  ],
  after: [
    { id: 'quota', label: '每分钟额度', value: '100 次', caption: '新上限' },
    { id: 'window', label: '统计窗口', value: '60 秒', caption: '未变项' }
  ],
  changed: ['quota'],
  invariant: ['window'],
  caption: '统计窗口保持不变，额度提高。',
  mode: 'side-by-side',
  focusChanged: true,
  label: '额度调整前后'
});
sc.getTarget('left');
sc.getTarget('right');
sc.getTarget('quota');
```

### 5.2 options

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `before` | object[] \| null | `null` | 变化前对象；数组为空也视为存在该侧，并显示空态。传 `null`/非数组则隐藏该侧。 |
| `after` | object[] \| null | `null` | 变化后对象，规则同上。 |
| `changed` | string[] | `[]` | 本步变化对象 ID。按数组顺序用于“本步变化”说明与首个 Focus 目标。 |
| `invariant` | string[] | `[]` | 本步保持未变的对象 ID。若同一 ID 也在 `changed` 中，按变化处理。 |
| `caption` | string \| Node | `''` | 对照上方可见说明；Node 会被移入。 |
| `mode` | `'side-by-side' \| 'stacked'` | `'side-by-side'` | 传给 CompareView；窄容器仍会自动转为 stacked。 |
| `label` | string | `'前后状态对照'` | 根的无障碍名称。 |
| `focusChanged` | boolean | `false` | 为 true 且 NoteExpr.Focus 已加载时，标记 changed 中首个可定位对象。 |

每个对象：`{id,label,value,caption}`。`value` 可为 DataObject 支持的字符串或 DOM；标签与 caption 按 DataObject 的文本接口使用。

组合结果：

- 外层容器是 `NoteViz.CompareView`，两侧标题为“变化前/变化后”，标题与对照标签由该组件提供；窄容器下自动上下排列。
- 每侧对象用 `NoteUI.DataObject` 呈现；变化对象传 `changed:true`，旁边挂 `NoteUI.Badge`「本步变化」，未变对象挂「未变」。变化和未变同时有可见说明文字，不只靠颜色。
- 表格下方有“本步变化”与“保持未变”的可读摘要。变化摘要显示“旧值 → 新值”（两侧都存在时）或新增/移除；未变摘要说明两侧值一致或提示宿主标记与显示值不一致。
- 默认不显示 Focus。`focusChanged:true` 时只圈出 changed 列表中首个可定位对象，优先变化后侧。Focus 是当前关注层，`NoteUI.DataObject.changed` 与 Badge 仍是独立的变化信息。
- Focus 实例是可选依赖。`NoteExpr.Focus` 未加载、目标找不到或挂载失败时静默跳过；切换数据、关闭 focusChanged、窗口/容器尺寸变化和销毁时都会处理它（隐藏或销毁并重建；resize 时 refresh）。实现不依赖 NoteExpr 的私有类名。

### 5.3 实例

| 成员 | 说明 |
| --- | --- |
| `el` | 根 `<section class="nblk-state-compare">`。 |
| `update(patch)` | 支持以上 options 键；重建对象、摘要和可选 Focus。程序更新无用户事件；不会自动播放。 |
| `getTarget('left'|'right')` | 返回 CompareView 的对应侧容器；该侧不存在或找不到时 `null`。 |
| `getTarget(id)` | 返回该对象对应的 DataObject 根元素；两侧同 ID 时优先变化后；未知/销毁后 `null`。 |
| `destroy()` | 取消待执行的 Focus 定位帧，销毁 Focus、DataObject/Badge 子实例与 CompareView，移除根；幂等。 |

注意：`'left'` / `'right'` 是 `getTarget` 的保留标识，对象 ID 不应使用这两个字符串。

## 6. 键盘与可访问性

- B01 只有控件可聚焦；B02 只有原生按钮、select 与宿主渲染的控件可聚焦；B03 使用原生表格，宽表滚动区由 Table 提供键盘可达区域；B04 可聚焦内容来自 CompareView 内部滚动容器和宿主对象的控件。
- 组合块均不注册 window/document 级键盘监听，不覆盖页面方向键、空格、Esc 或浏览器快捷键。
- B02 停点变化只重绘舞台，不重建控件；按钮和 select 焦点不会因画面重渲染自动跳转。到达边界时使用原生 disabled。
- 字幕通过 B01 的 `aria-live="polite"` 更新；同一停点重看不重复改写字幕。
- B03 的行/列强调除表格样式外还有可见文字摘要；B04 的变化/未变使用文本 Badge 与下方摘要。
- Focus 覆盖层是纯视觉标记，不改变 DOM 焦点，不拦截指针。
- 所有组件根使用 `.nblk-*` 作用域和 `--hnv-*` 共享变量；窄容器允许换行或交给已有组件的局部滚动。`prefers-reduced-motion: reduce` 下本模块不新增动画；宿主在 render 中的动效需自行处理减少动效。

## 7. 支持范围与明确限制

- 不支持整页演示编辑器、课程页面生成、自动播放、测验、评分或业务规则引擎。
- B01 不管理宿主场景内组件生命周期；B02 的 cleanup 契约要求宿主释放自己的场景实例。
- B02 不深拷贝 `state`，也不推断状态差异；回退完全依赖完整快照与重新渲染。
- B02 的 `onStep` 只覆盖用户导航造成的停点变化；重看、程序方法与 `update` 都不会触发。
- B03 无排序、筛选、行操作或规则推导；规则数据与强调由宿主决定。`id` 必须唯一。
- B04 不判断业务语义，只按宿主 `changed` / `invariant` ID 生成标记和摘要；同 ID 冲突按变化处理。Focus 只标记首个变化对象。
- NoteExpr.Focus 未加载时 B04 仍可用，只是没有覆盖层；不会为它另写一套关注实现。

## 8. 可运行检查线索

- 演示函数：`window.NoteGalleryDemos['B01']` … `['B04']`，位于 `gallery/demos/blocks-stage.js`。
- 清单：`src/manifests/blocks-stage.json`（B02–B04）与 `src/manifests/demo-stage.json`（B01）。
- 构建后分发：`dist/modules/blocks.js`、`dist/modules/blocks.css`（由构建脚本生成，不手改）。
- 检查脚本在 `tests/checks/blocks-stage-*`（真实 Edge / Playwright）。截图、结果 JSON 与临时构建副本写入 `tests/.cache/`，打包已排除；具体结果以执行时输出为准，不替代用户评价。
