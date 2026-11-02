# 基础统计图（viz-chart）

V01 · `NoteViz.Chart` · 类别「基础统计图」 · 共识 K03 / K06 / K07 / K12。
纯 HTML/CSS/JavaScript 与手写 SVG，不使用外部图表库；所有数值、标签、图例由宿主数据生成，不用静态截图冒充。


## 1. 模块范围与加载顺序

本模块只包含 V01 一个入口。柱状图、折线图、散点图、饼图是同一组件的 `type` 变体，不拆成四个组件。

依赖：

- 必需：`src/core/core.js`（`NoteCore.el`、`component`、`uid`、`onResize`、`validateHost`、`motion.reduced` 回退等）。
- 建议同时加载：`src/core/tokens.css`、`src/core/base.css`、`src/core/motion.js`。
- 本模块文件：`src/viz/chart.js`、`src/viz/chart.css`。Chart 是单一组件，保持单文件；`chart.js` 内部按职责分区（通用小工具 → 数据规范化 → 模型 → 比例尺 → SVG 图形基元 → bar/line/scatter/pie 渲染器 → 图例与数据表 → mount），不按 `type` 拆文件。
- `NoteCore.motion` 未加载时，减少动效判断回退到 `matchMedia('(prefers-reduced-motion: reduce)')`。

推荐顺序：

```html
<link rel="stylesheet" href="src/core/tokens.css">
<link rel="stylesheet" href="src/core/base.css">
<link rel="stylesheet" href="src/viz/chart.css">
<script src="src/core/core.js"></script>
<script src="src/core/motion.js"></script>
<script src="src/viz/chart.js"></script>
```

<a id="V01"></a>
## V01 NoteViz.Chart

## 2. 最小用法

```js
var chart = NoteViz.Chart.mount(host, {
  type: 'bar',
  data: [
    { label: 'Q1', value: 42 },
    { label: 'Q2', value: 58 },
    { label: 'Q3', value: 51 }
  ],
  label: '季度销量',
  unit: '万件',
  height: 300,
  table: true
});

chart.update({ focus: { index: 1 }, changed: { index: 2 } });
var barEl = chart.getTarget('point:1');
chart.destroy();
```

`mount` 向 `host` 追加根元素，不清空宿主其他节点；返回 `{ el, update, destroy, getTarget }`。

## 3. API

### 3.1 options

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `type` | `'bar' \| 'line' \| 'scatter' \| 'pie'` | `'bar'` | 同一组件的四种变体；未知值回退为柱状图。 |
| `data` | `[{ label, value }]` | `null` | 单系列数据；`value` 可为数字或数字字符串，`null`/非法值表示缺失值。 |
| `labels` | `string[]` | `null` | 多系列类别标签；单系列且 `data` 项没有 `label` 时也作为回退。 |
| `series` | `[{ key, label, values, points, color }]` | `null` | 多系列柱/折线；散点使用 `points:[{x,y,label,color?}]`。 |
| `focus` | `{ series?, index?, label? }` | `null` | 当前关注。 |
| `changed` | `{ series?, index? }` | `null` | 本步变化；兼容读取 `label`，但公开语义只用 `series`/`index`。 |
| `colors` | `string[]` | 内置 8 色序列 | 多系列按系列取色；饼图按扇区取色；单个 `series[].color`/`data[].color` 优先。 |
| `height` | `number` | `300` | 图表区域高度，钳制在 180–1200。 |
| `valueFormat` | `function(value, meta)` | `null` | 数值标签、数据表、提示文本的格式化函数。 |
| `table` | `boolean` | `false` | `true` 时在图表下方提供原生 `<details><summary>数据表</summary>`。 |
| `label` | `string` | `''` | 图表标题/说明；同时进入可见标题和 `aria-label`。 |
| `unit` | `string` | `''` | 可选增补字段。用于可见“单位”行、数据表 caption 与无障碍摘要。 |
| `xLabel` | `string` | `'x'` | 可选增补字段，散点图 x 轴标题。 |
| `yLabel` | `string` | `'y'` | 可选增补字段，散点图 y 轴标题。 |
| `animate` | `boolean` | `false` | 默认静止。为 `true` 时，仅在宿主主动 `update()` 更换数据/系列/类型/标签后做一次短显示过渡；不循环、不自动播。 |

未知 options 键保留，不报错。`unit`、`xLabel`、`yLabel` 是对冻结接口的向后兼容增补，不改变已有键的形状；宿主不传时行为与不增补一致。

### 3.2 实例

| 成员 | 说明 |
| --- | --- |
| `el` | 根 `<figure class="nviz-chart">`。 |
| `update(patch)` | 合并 patch 后重绘；`patch` 非对象、实例已销毁时为空操作。 |
| `destroy()` | 幂等；移除根元素并释放 ResizeObserver、动画计时器与目标表。 |
| `getTarget(id)` | 返回当前渲染中的元素；找不到或销毁后返回 `null`。 |

无 `onChange`、`onClick`、自动步进或自动轮播。点击图例、展开数据表不会修改数据，也不会触发回调。

### 3.3 `update` 的数据替换语义

为避免换数据后残留旧系列/旧标签，`update` 在以下情况自动清理：

- 只传 `data`：清除旧 `series`；未传 `labels` 时清除旧标签。
- 只传 `series`：清除旧 `data`；未传 `labels` 时清除旧标签。
- 传 `data` 和 `series` 但未传 `labels`：清除旧标签（需要保留标签时显式传）。
- 传 `data`/`series`/`labels`/`type`：未同时传 `focus`/`changed` 时清除旧强调，避免强调落到错误对象。
- 只传 `focus`、`changed`、`height`、`table` 等：数据保持不变，数据表展开状态保留。

`update({ data: [] })`、`update({ series: [] })` 都会进入空态；不会回退到旧的另一数据源。

### 3.4 `valueFormat`

```js
valueFormat(value, {
  index,        // 类别/点索引（可用时）
  seriesKey,
  seriesLabel,
  label,        // 类别标签（可用时）
  type,
  axis          // 散点表/轴相关调用时可能为 'x' 或 'y'
})
```

返回值按纯文本插入；抛错时回退默认数字格式。坐标轴刻度固定使用简洁数字，不套用 `valueFormat`，以避免每格重复“万元”等长文本；单位另见可见“单位”行。

## 4. 数据模型与四种变体

### 4.1 柱状图 `bar`

- 单系列：`data:[{label,value}]`。
- 多系列：`series:[{key,label,values}]` + `labels`。
- 分组柱，不做堆叠。
- 值域强制包含 0，0 基线加粗；正值向上、负值向下；0 值画 2px 基线短柱，数值由刻度/直标/数据表读取。
- 柱宽上限 24px；数据端 4px 圆角、基线端方角；相邻柱留 2px 表面间隙；多系列使用颜色 + 填充纹理（斜线/点/横线/交叉）区分，单系列纯色。
- 单系列只标注最小值与最大值；多系列不铺数值，具体点强调时用就地标签显示数值。

### 4.2 折线图 `line`

- 同 bar 的单/多系列数据模型。
- 每个数据点画 marker；`null` 值断开折线，不插值、不补 0。
- 多系列使用颜色 + 线型（实线/长虚线/点线/点划线）+ marker 形状（圆/方/三角/菱形）区分。
- 线宽 2px；marker 直径不小于 8px，并带 2px 表面描边。
- 单系列只标注端点、最小值与最大值；不逐点铺数字。
- 折线图的值域不强制包含 0（避免压缩小范围变化）；柱状图始终有 0 基线。

### 4.3 散点图 `scatter`

- 主要数据：

```js
series: [
  { key: 'a', label: 'A 组', color: '#2a78d6',
    points: [{ x: 1, y: 4, label: '甲' }, { x: 2, y: 7 }] }
]
```

- x/y 均为数值；无 x 或 y 的点跳过。
- `series[].values` 也可作为回退：x 从 1 开始按序号生成，标签取 `labels` 或 `series[].labels`。
- `data:[{label,value}]` 也可回退为单个散点系列：x 从 1 开始、y 为 value。
- x/y 轴均绘制刻度、网格与轴标题；支持负值。
- 单系列且点数 ≤ 10 时显示点标签；多系列只在强调点显示就地标签（避免遮挡）。所有点仍可从数据表读取。
- 多系列时 `focus.index`/`changed.index` 指每个系列内的同序号点；与 `series` 同时给出时才是单个点。

### 4.4 饼图 `pie`

- 单系列 `data:[{label,value}]`；也可用第一个 `series[].values` + `labels` 回退。
- 图例逐项给出类别、数值与占比；大扇区内部同时显示百分比。
- 仅正值参与角度计算。0 与负值不画扇区，但保留在图例与数据表；图下方有可见说明，不静默丢弃。
- 只接受一个数据系列；多系列饼图不在本组件范围。
- 完整单扇区（100%）按整圆绘制，不伪造空白扇区。
- `getTarget('slice:<index>')` 对未绘制（0/负值/缺失值）的扇区返回 `null`。
- 颜色覆盖：`series[].color` 覆盖该系列颜色；`data[].color` 覆盖饼图单个扇区颜色；`colors` 提供默认取色序列。
- 建议 ≤6 个扇区；更多类别请改用条形/表格或分面，组件不自动聚合为“其他”。

### 4.5 标签、缺失值与长文本

- 类别标签按容器宽度换行，最多 3 行（窄槽 2 行）；剩下内容以省略号收束，完整文本在 `<title>` 和数据表中。
- 长中文、长英文和中英混排均可用；英文优先在空格处换行，避免把单词从中间硬切。
- 多系列与饼图使用 HTML 图例列表自然换行；单系列不显示冗余图例（系列级 focus/changed 需要徽标时例外），请用 `label` 标题或 `series[].label` 写明绘制对象。数据表保留完整标签。
- 缺失值在表中显示 `—`，图中跳过。
- 空数据、饼图全为非正值、散点全无有效点都会显示可见空态说明，不画假坐标轴/假扇区。

### 4.6 颜色与标记

- 默认 8 色序列为：`#2a78d6`、`#b54708`、`#0f7a5a`、`#c07c00`、`#b03a72`、`#008300`、`#6250d6`、`#b23a45`。
- 该序列已用 dataviz 参考校验器在白色与页面浅灰底（`#ffffff` / `#f4f6f9`）上校验：相邻 CVD ΔE 10.0、常视 ΔE 21.6、8 色对比度均 ≥3:1。前 3 色通过 all-pairs 校验；散点超过 3 个系列时，任意两点都可能相邻，需依赖 marker 形状、直接标签、图例或分面，不能只靠颜色。
- 第 9 个系列起颜色会循环；建议系列数 ≤8。更多系列请由宿主拆图、折叠为“其他”或提供自定义颜色与说明。柱状图多系列的填充纹理、折线虚实线/形状、散点 marker 形状是颜色之外的辅助通道，但不替代图例、标签与数据表。
- 默认颜色按当前系列顺序分配；如果宿主会过滤或重排系列，请用 `series[].color` 固定每个实体的颜色，避免幸存系列被重新上色。饼图同理可用 `data[].color` 固定扇区。
- 文本使用 ink/muted tokens；系列颜色只用于 mark、线/点和图例色块。扇区内部百分比使用 ink 文字 + surface 描边光晕。
- 未实现暗色主题；浅色面校验不自动适用于暗色。宿主切换主题时应重新校验并覆盖 `colors`。

## 5. focus 与 changed 语义

`focus` 表示“现在看哪里”，`changed` 表示“相对前一状态改变了什么”。两者可独立或同时出现。

### 5.1 选择方式

| 写法 | 含义 |
| --- | --- |
| `{ series: 'online' }` | 强调整个系列。 |
| `{ index: 2 }` | 强调第 3 个类别（柱/折线/饼）；散点为各系列的第 3 个点（按系列内序号）。 |
| `{ label: 'Q3' }` | 按类别标签找索引；散点按点标签找点。 |
| `{ series: 'online', index: 2 }` | 强调该系列的该类别/点。 |
| `{ series: 'online' }` + `changed:{ index: 2 }` | 系列关注与类别变化分开表达。 |

- 饼图的 `series` 不参与扇区定位；使用 `index` 或 `label`，或 `series` 与 `index` 同时给出（此时按唯一系列的该扇区处理）。
- `series` 先按 `key` 匹配，再按系列 `label` 匹配。
- 越界索引/找不到的标签会被忽略；`getTarget` 找不到对象返回 `null`。

### 5.2 视觉与合成

- 系列关注：加粗系列线/给柱与点加深色描边，并在图例加“关注”文字徽标。
- 系列变化：同样的系列级描边/线宽变化，并在图例加“变化”徽标。
- 类别关注/变化：柱/折线画一条半透明类别带；关注为实线边，变化为虚线边，顶部有就地标签。
- 具体点（系列 + 索引）：marker/柱/扇区加一圈描边和就地标签；标签文本包含“关注”“变化”或“关注·变化”，柱/折线还会带上数值。
- 同一对象同时是关注与变化时：只保留一套描边/一圈环，标签合成“关注·变化”，不叠两套圈。
- 提示不只靠颜色：同时使用描边、虚线、标记、图例文字徽标与就地标签；`aria-label` 也写入当前关注与本步变化。
- 变化强调是静态呈现，不做数值滚动、计数动画或自动步进，避免多个数值同时争夺注意。

## 6. getTarget

```js
chart.getTarget('series:<key>'); // 系列 <g>
chart.getTarget('point:<index>'); // 柱/点/扇区对应元素；饼图请用 slice
chart.getTarget('slice:<index>'); // 饼图扇区 <path>
```

- 单系列 `data` 的隐式系列 key 为 `'main'`，所以 `getTarget('series:main')` 可用。
- 柱/折线单系列：`point:<index>` 是第 index 个类别的柱/点。
- 柱/折线多系列：`point:<index>` 返回“第一个在该索引有标记的系列”的代表元素；具体系列请用 `series:<key>`，或调用后自行查系列组。若需要精确定位某个系列的点，请用 `series:<key>` 的组内元素（公开接口不额外定义组合 id）。
- 散点：`point:<index>` 返回第一个包含该系列内序号的点（按系列顺序）；多系列下该 id 不唯一指代所有系列的同序号点。
- 饼图：`slice:<index>` 返回扇区 `<path>`；`point:<index>` 不适用于饼图，返回 `null`（0/负值扇区同样为 `null`）。
- `update` 后旧元素可能已脱离文档；请在更新后重新调用 `getTarget`。
- 找不到或实例已销毁返回 `null`。

## 7. 数据表

`table: true` 时渲染：

```html
<details class="nviz-chart__table">
  <summary>数据表</summary>
  <div role="group" tabindex="0" aria-label="数据表滚动区域">
    <table>
      <caption>标题 · 数据表（单位：…）</caption>
      <thead>…</thead>
      <tbody>…</tbody>
    </table>
  </div>
</details>
```

- caption、列头、行头、数值单元格齐全；不是屏幕外文本。
- 柱/折线：类别行 × 系列列；缺失值显示 `—`。
- 散点：系列 · 点序号 / x / y / 标签。
- 饼图：类别 / 数值 / 占比；负值占比为 `—`，0 值记为 `0%`。
- 表头与窄容器由横向局部滚动承载；滚动区域可聚焦。
- 展开状态在 `update` 重建时保留；数据表不会修改数据。
- 默认 `table: false`；示例与 gallery 演示开启。教学、评审或无障碍关键场景建议宿主显式设 `table: true`，让全部数值有可展开的文本路径。

## 8. 无障碍

- 非空图表 SVG 带 `role="img"` 与完整 `aria-label`：图表类型、标题、单位、类别/系列/点数量、数值或 x/y 范围、当前关注、本步变化、数据表提示。
- 空态容器同样有 `role="img"` 与“暂无数据/原因”的可访问名称，同时有可见空态文字。
- 所有图形文字使用真实 `<text>`/`<tspan>`，不转路径；数据语义不依赖颜色。
- 默认 8 色序列在白色/页面浅灰底均 ≥3:1，并已做 CVD 相邻校验；多系列另有 marker 形状/线型差异，柱状图另有填充纹理。单系列不显示冗余图例；多系列与饼图图例为正常 HTML 列表。
- 键盘不要求操作图表本体；数据表 `<summary>` 与横向滚动区域可聚焦，有 3px `:focus-visible` 焦点环。高图滚动区域可聚焦并使用原生滚动。
- `prefers-reduced-motion: reduce` 时不建动画；即便 `animate:true` 也直接呈现终态。
- SVG 因 `role="img"` 不会把内部刻度文本逐个暴露给辅助技术；可读数据表与 `aria-label` 承担数据与摘要。图例为正常 HTML 列表，可读。
- 不把必要信息放在悬停里；`<title>` 仅作补充。除图例与数据表外，图表本身也有轴刻度和就地标签。

## 9. 响应式与动效

- SVG 使用 `viewBox`，宽度随容器；组件通过 `NoteCore.onResize` 在容器宽度变化时重绘，内部坐标按实际宽度生成。
- 窄容器不横向溢出：图表、图例、表格均在 100% 宽度内；表格需要时局部横向滚动。
- 长标签换行；类别槽过窄时截断并保留完整 `<title>`/表格文本。
- `height > 520` 时图表区域最大高度约 72vh 并允许局部纵向滚动，滚动区域可聚焦。
- 默认无动画；`animate:true` 只在宿主 `update` 更换数据/系列/类型/标签后触发一次约 340ms 的淡入/位移，不逐点计数、不循环。更新、销毁或减少动效时动画被跳过/收敛。初次挂载与纯 `focus`/`height` 更新不播。

## 10. 明确限制

- 不做缩放、平移、拖拽、框选、实时数据推送、自动轮播或自动步进。
- 不做堆叠柱/面积图、趋势线、回归、移动平均、完成率或其他统计派生；饼图占比只由正值总和直接计算。
- 不做大数据抽样、分页、虚拟化或聚合；基础图表按传入点逐一渲染。
- 不提供自定义 tooltip/crosshair；只提供原生 `<title>`、就地强调标签与数据表。
- 饼图只使用一个系列；负值/0 不绘制扇区，只保留图例与表格原值。
- 多系列柱/折线/散点的 `point:<index>` 在跨系列时不是唯一对象，见 §6。
- 不内置暗色主题；宿主可通过覆盖 `--hnv-*` tokens 与 `colors` 适配，但未做暗色对比度专项验证。
- 动画只做整体显示过渡，不做对象级移动/传递；那属于 D/M 系列变化机制。
- 图例不可点击过滤；数据表不排序/筛选（内容模块的 Table 另有能力）。
- 建议系列 ≤8、散点 ≤3（严格 CVD all-pairs）、饼图 ≤6 扇区；超出时由宿主拆图/分面/折叠为“其他”，组件不自动聚合。
- 第 9 个系列起默认颜色循环；需要严格区分时应由宿主覆盖 `colors` 并拆分。
- 未对超长系列图例、每类几十个系列或极小高度做专门优化；基础可读性依赖合理数据密度。
