# 图形与数据对象（viz-objects）

<a id="viz-objects"></a>

## 1. 范围与加载

本模块提供 D01–D06 六项图形/数据对象：

| ID | 公开入口 | 作用 |
| --- | --- | --- |
| D01 | `NoteViz.Sequence` | 位串、字节与盒子序列；稳定 ID、索引、分组、关注与变化。 |
| D02 | `NoteViz.Matrix` | 带行列标签的矩阵；行列/单元/范围标记、单元格渲染和大表滚动。 |
| D03 | `NoteViz.Graph` | 节点与关系图；分层/手动布局、方向、边标签、分组与局部强调。 |
| D04 | `NoteViz.Timeline` | 事件、区间与阶段；横向/纵向、当前项、关注与变化。 |
| D05 | `NoteViz.TreeDiagram` | 只读层级结构图；向下/向右布局与节点重点。 |
| D06 | `NoteViz.CompareView` | 前后/多态通用对照容器；并排/上下、变化侧与窄容器堆叠。 |

源码（按 manifest 的 js 顺序用经典脚本加载）：

- `src/viz/objects.js`：**内部共享文件，不含公开组件**。它初始化 `window.NoteViz`，并把 DOM/SVG 小工具、局部滚动区、标记与目标解析等收敛到内部命名空间 `window.NoteVizObjectsInternals`。该命名空间是实现细节，不是公开 API，宿主不应依赖。
- `src/viz/objects-sequence-matrix.js`：D01 `NoteViz.Sequence`、D02 `NoteViz.Matrix`。
- `src/viz/objects-graph.js`：D03 `NoteViz.Graph`。
- `src/viz/objects-timeline-tree.js`：D04 `NoteViz.Timeline`、D05 `NoteViz.TreeDiagram`。
- `src/viz/objects-compare.js`：D06 `NoteViz.CompareView`。
- `src/viz/objects.css`：六项共用样式与 gallery 演示用 `.nviz-demo-*` 外壳；只使用 `.nviz-*` 作用域和 `var(--hnv-*, fallback)`。
- `src/manifests/viz-objects.json`：清单，`js` 数组即加载顺序。
- `gallery/demos/viz-objects.js`：六项真实挂载演示。

依赖只有 `core`。加载顺序（与 manifest 一致；即使只用其中几个组件，也必须先加载 `objects.js`）：

```html
<link rel="stylesheet" href="src/core/tokens.css">
<link rel="stylesheet" href="src/core/base.css">
<link rel="stylesheet" href="src/viz/objects.css">

<script src="src/core/core.js"></script>
<script src="src/viz/objects.js"></script>
<script src="src/viz/objects-sequence-matrix.js"></script>
<script src="src/viz/objects-graph.js"></script>
<script src="src/viz/objects-timeline-tree.js"></script>
<script src="src/viz/objects-compare.js"></script>
```

不依赖图标、动效库、浮层、旧组件或其他 viz 模块。如果通过整库构建产物加载，按整体加载顺序即可。组件只调用 `NoteCore.validateHost`、`NoteCore.component`、`NoteCore.listeners`、`NoteCore.onResize`、`NoteCore.uid` 与 `NoteCore.setContent` 等契约内能力。

### 共同实例形态

六项都返回：

```js
{
  el,                    // 追加到 host 的组件根
  update(patch),         // 程序更新；不触发用户事件；destroy 后为空操作
  destroy(),             // 幂等清理监听、观察器、rAF 并移除根
  getTarget(key)         // 按组件语义返回对象元素；找不到返回 null
}
```

`mount(host, options)` 校验 Element/DocumentFragment，向 host **追加**根元素，不清空宿主其他节点。`update()` 只合并自有顶层键，不做深拷贝合并。字符串一律按纯文本写入；本模块只有 D06 接受 DOM 内容，并且节点是被移入而不是复制。

### 共享标记语义

- **身份**：宿主提供的对象 ID 是身份的基准。更新时优先复用同 ID 的对象 DOM；`getTarget` 在更新后仍指向当前对象。
- **关注**：回答“现在看哪里”。使用克制的虚线轮廓、细边缘或文字标记。
- **变化**：回答“相对前态变了什么”。使用更明显的实线、浅底、顶部色条和文字。
- **同时关注与变化**：合成一种状态，不叠加两套圈。D01 用单一实线外框并在文字摘要中写“关注并变化”；D02–D05 用单一实线状态和一条“关注 · 变化”文字；D06 是容器级变化侧强调，不涉及对象双圈。
- 颜色不是唯一信号：轮廓线型、形状、位置和可见文字同时存在。

### 减少动效与程序更新

本模块没有自动播放或装饰动画。状态变化直接落定；CSS 只对背景、边框、轮廓等可解释属性使用短过渡。`prefers-reduced-motion: reduce` 时过渡归零。`update()` 不触发任何回调。

---

<a id="D01"></a>
## 2. D01 NoteViz.Sequence

### 挂载与选项

```js
var seq = NoteViz.Sequence.mount(host, {
  variant: 'bits',
  index: true,
  items: [{ id: 'b0', value: '0' }, { id: 'b1', value: '1' }],
  groups: [{ label: '符号位', start: 0, count: 1 }],
  focus: ['b1'],
  changed: ['b0', 'b1'],
  dense: false,
  label: '位串'
});
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `items` | `Array<string \| {id,label,value}>` | `[]` | 对象序列。对象可用稳定 `id`；无 id 时按位置生成 `item-0`、`item-1`。`value` 是主显示值；`label` 是可读补充，bytes/boxes 中显示。字符串项直接充当值，ID 按位置生成。 |
| `variant` | `'bits' \| 'bytes' \| 'boxes'` | `'boxes'` | bits 为等宽格位串；bytes 显示字节值和标签；boxes 显示对象盒。未知值回退 boxes。 |
| `index` | boolean | `false` | 为 true 时在对象内显示零基索引。 |
| `groups` | `Array<{label,start,count,ids?}>` 或 `null` | `null` | 按当前 items 下标分组。缺省 `start` 接续上一组的末尾，缺省 `count` 为 1；也可用 `ids` 指定成员。有标签时会显示分组名；有未覆盖项时显示“未分组”。 |
| `focus` | id、id[]、索引、索引[] 或 `{ids\|start,count\|from,to}` | 无 | 当前关注对象。数字优先按 ID 匹配，找不到再按零基索引。范围对象的下标语义为闭区间。 |
| `changed` | 同上 | 无 | 宿主声明的本步变化对象；组件不自动做前后 diff。 |
| `dense` | boolean | `false` | 紧凑间距和字号。 |
| `label` | string | `'序列'` | 根的可访问名称，也用于内部区域名称。 |
| `summary` | boolean | `true` | 是否显示底部的“关注/变化”可见摘要。为 false 时只隐藏这段可见文字，对象 aria-label 与视觉 cues 仍保留。 |
| `stateText` | boolean | `true` | 是否在对象内显示“关注/变化”状态文字。为 false 时数据标记、外框与 aria 仍保留。 |
| `stable` | boolean | `false` | 稳定排布：标签行与状态行始终占位（缺席时仅隐藏可见性），出现/消失说明不改变对象与组件高度。NoteDemo 的 sequence Adapter 默认开启。 |

### 方法、事件与 getTarget

| 项目 | 说明 |
| --- | --- |
| `update(patch)` | 可换 `items/variant/index/groups/focus/changed/dense/label`；同 ID 复用对象单元。 |
| `destroy()` | 幂等移除根，清理滚动监听与尺寸观察。 |
| `getTarget(id)` | 返回该对象的 `.nviz-sequence__unit` 元素。ID 为数字时也支持零基索引回退；找不到返回 `null`。 |
| `getState()` 与 `getMotionTargets()` | 供 NoteDemo scene 读回与布局测量；不改变独立用法。细节见下表与 scene 接入说明。 |
| `getState()` | 从实际已渲染状态返回新副本 `{items:[{id,value,label}], groups:[{label,ids}], cues:{focus,changed}}`；groups 把声明顺序/范围分组归一为当前实际存在的成员 ID，供 NoteDemo 还原分组；不返回缓存目标，供 NoteDemo 核对提交结果。销毁后返回 `null`。 |
| `getMotionTargets()` | 返回 `[{id, unit, contentEl:cell, valueEl, labelEl, markEl}]` 当前真实节点；供 scene layout 捕获/测量载体。销毁后返回空数组。 |
| 事件 | 无。程序更新不触发事件。 |

`items` 更新时以对象 ID 为键复用节点；改变位置、值、标签、变体不丢身份。未提供稳定 ID 的字符串内容只能保证同一位置更新时的局部身份，宿主在重排时应改用对象 ID。

### 关注、变化与合成

- 位串：关注有虚线内框，变化有实线外框和顶部色条；同一格兼具时只保留合成外框。
- bytes/boxes：对象内部还会显示状态文字；位串在下方统一的状态摘要中列出“关注”“变化”“关注并变化”，其中包含零基索引和值/标签。
- 位串分组会保留字段名，因此位串既有等宽格也有可读字段边界。
- 组件的“变化”完全由 `changed` 提供；组件不比较上一版 `items`。

### 滚动与键盘

- 内容较宽时，滚动区有 `tabindex="0"`、可见焦点环和下方可见滚动提示；只有确实溢出时才显示提示。
- 聚焦滚动区后可用左右方向键横向滚动；`PageUp/PageDown`、`Home/End` 在对应方向溢出时可用。
- 滚动区不是整页滚动劫持：只有自身聚焦时响应按键。

### 可访问性

根为 `role="group"`，滚动区为带名称的 `region`；有序分组内使用列表语义。每个对象有包含索引、标签、值和标记状态的 `aria-label`。分组标题、索引、值和状态都进入正常阅读路径。视觉外框与下方状态摘要是补充，不替代这些文本。

### 最小用法

```js
var host = document.querySelector('#demo');
var seq = NoteViz.Sequence.mount(host, {
  variant: 'bits',
  index: true,
  items: Array.from('10110010', function (value, index) {
    return { id: 'bit' + index, value: value };
  }),
  groups: [{ label: '首字节', start: 0, count: 8 }],
  focus: ['bit2'],
  changed: ['bit2', 'bit5'],
  label: '示例位串'
});
// seq.update({ variant: 'bytes', focus: ['bit5'] });
// seq.destroy();
```

### 限制

- 对象 ID 在实例内应唯一；重复 ID 的 `getTarget` 语义不保证。
- 不做自动 diff、编辑或播放控制；变化标记是宿主数据。
- bits 变体按单字符对象设计；多字符长值应使用 bytes/boxes。
- 分组是数组下标/id 范围，不是字段语义解析。
- 对象本身不响应点击；只有滚动区可聚焦。
- `summary/stateText/stable` 是可见说明与稳定排布的显示选择，不改变数据、身份或可访问描述；在 scene 运行期间，`stable` 的固定占位让一次推进前后的组件高度保持一致，字幕和控件不会随“插入/变化”文字出现而移动。
- `getState/getMotionTargets` 是为 NoteDemo scene 接入提供的最小公开查询/布局方法；它们不改变 update/渲染语义，也不使组件变成自动播放器。受控 CSS transition 的暂停由公共层在 Binding 容器上统一接管，见[受控画面的视觉接管](公共编排层.md#author-scene-control)。groups 在列表中仍支持 `start/count/ids` 形式，但 NoteDemo 的 `sequence` Adapter 只接受显式 `{label,ids}`，避免语义歧义。
- 没有动画时间轴，更新直接落定。

---

<a id="D02"></a>
## 3. D02 NoteViz.Matrix

### 挂载与选项

```js
var matrix = NoteViz.Matrix.mount(host, {
  rows: [{ id: 'r1', label: '第一行' }],
  columns: [{ id: 'c1', label: '指标 A' }],
  values: [[42]],
  caption: '状态矩阵',
  maxHeight: 320,
  focus: { row: 'r1', col: 'c1' },
  changed: { cells: [{ row: 'r1', col: 'c1' }] },
  cellRenderer: function (value, context) { return value + ' ms'; }
});
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `rows` | `Array<string \| {id,label}>` | `[]` | 行标签。缺 id 生成 `row-0` 等；也接受行的 `cells/values` 作为值回退。 |
| `columns` | `Array<string \| {id,label}>` | `[]` | 列标签。缺 id 生成 `col-0` 等。未提供（或显式传 `null`）`columns` 且传入 `cols` 时按旧式别名读取；两者都给时以 `columns` 为准。 |
| `values` | 二维数组 | `[]` | `values[rowIndex][colIndex]`。行/列数量会按最长行扩展；没有对应值时显示空。 |
| `focus` | 见下方 | 无 | 行列/单元/范围关注。 |
| `changed` | 见下方 | 无 | 行列/单元/范围变化。 |
| `caption` | string | `''` | 可见 `<caption>`。为空时使用 `label` 作为表格可访问名称。 |
| `cellRenderer` | `function(value, context) -> string \| Node \| Node[]` | 无 | 自定义单元格内容。`context` 含 `row`、`col`（稳定 ID）、`rowIndex`、`colIndex`、`rowLabel`、`colLabel`。 |
| `maxHeight` | number(px) \| CSS 长度 | `'min(60vh, 480px)'` | 滚动区最大高度；内容超出时只局部滚动。 |
| `dense` | boolean | `false` | 紧凑行列间距。 |
| `label` | string | `'矩阵'` | 根区域名称；无 caption 时也用于表格名称。 |
| `summary` | boolean | `true` | 是否显示表格下方的“标记：行关注/变化单元……”可见摘要。为 false 时只隐藏这段汇总文字，表头/单元格状态与 aria 仍保留。 |
| `stateText` | boolean | `true` | 是否显示表头/当前单元内的“关注/变化”可见文字。为 false 时只收敛这些元状态文字，保留 data-mark、视觉轮廓和真实可访问状态描述；行列名称、数据和知识标签不受影响。NoteDemo 的 matrix Adapter 新挂载默认 false，显式 options 或借用已有实例保持各自设置。 |

### focus / changed 规格

支持单个规格或规格数组。常用形式：

```js
focus: { row: 'r1' }                         // 整行
focus: { col: 'c1' }                         // 整列
focus: { row: 'r1', col: 'c1' }              // 单个单元
focus: { rows: ['r1', 'r2'], columns: ['c1'] } // 行集合 + 列集合
focus: { cells: [{ row: 'r1', col: 'c1' }] } // 单元列表
focus: {
  range: { rowStart: 0, rowEnd: 2, colStart: 1, colEnd: 3 }
}
changed: {
  range: { rows: ['r3', 'r5'], columns: ['c2', 'c4'] }
}
```

行列引用可以是稳定 ID 或零基下标；匹配时先找 ID，再回退下标。范围边界为闭区间。对于 `{rows: [...]}` / `{columns: [...]}` 的语义是“这些整行/整列”，而 `range` 内使用相同数组时取首尾作为范围边界。

### 方法、事件与 getTarget

| 项目 | 说明 |
| --- | --- |
| `update(patch)` | 换 rows/columns/values/focus/changed/caption/cellRenderer/maxHeight/dense/label/summary/stateText；同行列 ID 的单元格 DOM 复用。 |
| `destroy()` | 幂等移除根，清理滚动监听与尺寸观察。 |
| `getTarget({row, col})` | 返回对应 `<td>`。row/col 可以是 ID 或零基下标；找不到返回 `null`。 |
| `getState()` | 返回实际已渲染的 rows/columns/values/focus/changed/caption 副本；values 按当前行列数补齐并包含行内嵌 `cells/values` 的回退结果，focus/changed 中的范围已展开为单元列表，供 NoteDemo 真实读回；不返回目标缓存。销毁后返回 null。 |
| `getMotionTargets()` | 返回当前单元真实载体 [{id,rowId,colId,element,layoutEl,contentEl,valueEl,flagEl}]；供 scene 读目标和效果使用。 |
| 事件 | 无。程序更新不触发事件。 |

### 表格语义与视觉

- 使用原生 `table`、`thead`、`tbody`、`caption`；列头与行头分别是 `th[scope="col"]` 和 `th[scope="row"]`。
- 列头吸顶、行头吸左，滚动大表时仍能对应标签。
- 行/列关注与变化在表头用文字标记；直接单元状态在单元格内显示文字角标。
- 关注用虚线，变化用实线、浅底和角标；同一单元兼具时只显示合并后的轮廓和“关注 · 变化”角标。
- 较长的行列标签自动换行；表格本身在窄容器内横向滚动，不压缩到不可读。

### 滚动与键盘

表格外层滚动区可聚焦（`tabindex="0"`），有可见滚动提示，只在外层实际溢出时出现。聚焦后方向键滚动；`PageUp/PageDown`、`Home/End` 在纵向/横向可用时响应。表格不会劫持页面其余部分的键盘。

### 可访问性

表头语义让读屏在单元格处获得行列关联；直接标记的单元还有可见状态文字。caption 或 label 提供整体名称；滚动区有独立名称与描述。行/列标记的文字与单元格状态不只靠颜色。

### 最小用法

```js
var matrix = NoteViz.Matrix.mount(host, {
  rows: [{ id: 'r1', label: '读取' }, { id: 'r2', label: '校验' }],
  columns: [{ id: 'c1', label: '耗时 (ms)' }, { id: 'c2', label: '次数' }],
  values: [[12, 4], [8, 2]],
  caption: '步骤数据',
  focus: { rows: ['r2'] },
  changed: { cells: [{ row: 'r2', col: 'c1' }] }
});
// matrix.update({ values: [[10, 4], [7, 2]] });
// matrix.getTarget({ row: 'r2', col: 'c1' });
```

### 限制

- 不排序、筛选、编辑、合并单元格或公式计算。
- 范围是逐单元标记，不做区域边框、拖拽选择或统计。
- `cellRenderer` 的 DOM 在重绘该单元时会被替换；复杂交互状态由宿主持有。
- 行、列 ID 必须在实例内唯一；未提供 ID 时使用位置 ID，重排行列无法保留旧身份。
- 默认限制高度，超长表不提供虚拟化或导出。

---

<a id="D03"></a>
## 4. D03 NoteViz.Graph

### 挂载与选项

```js
var graph = NoteViz.Graph.mount(host, {
  layout: 'layered',
  nodes: [
    { id: 'in', label: '输入', group: '流程' },
    { id: 'out', label: '输出', group: '流程' }
  ],
  edges: [
    { id: 'e1', from: 'in', to: 'out', label: '进入', directed: true }
  ],
  focus: ['out'],
  changed: ['in'],
  edgeFocus: ['e1'],
  edgeChanged: [],
  label: '处理流程',
  onSelect: function (id, event) { console.log(id, event); }
});
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `nodes` | `Array<{id,label,x,y,group}>` | `[]` | 节点。ID 必须唯一；label 缺省为 id。图层坐标 `x/y` 是节点中心，manual 布局使用；group 是可选分组名。 |
| `edges` | `Array<{id?,from,to,label,directed}>` | `[]` | 端点必须引用存在的节点。`id` 可选稳定 ID，缺省按 `from -> to` 生成，平行同向边追加 ` #2`…；重复显式 id 也补后缀。`directed` 严格为 true 时才画箭头；label 可为空；不存在的边被忽略。 |
| `layout` | `'manual' \| 'layered'` | `'layered'` | layered 按有向/无向边的 from→to 做基础分层；manual 使用节点坐标，个别节点缺少有效 x/y 时该节点回退为网格位置，其余节点仍使用给定坐标。 |
| `width` | number \| null | `null` | 最小画布宽（SVG 像素/坐标系）。画布会扩展到容纳所有节点。 |
| `height` | number \| null | `null` | 最小画布高。 |
| `focus` | id \| id[] | 无 | 关注节点 ID。 |
| `changed` | id \| id[] | 无 | 变化节点 ID。 |
| `edgeFocus` | id \| id[] | 无 | 关注边 ID；与节点 focus 分开。 |
| `edgeChanged` | id \| id[] | 无 | 变化边 ID；与节点 changed 分开。 |
| `label` | string | `'节点关系图'` | 根与 SVG 名称。 |
| `onSelect` | function \| null | `null` | 可选；用户点击节点或聚焦后按 Enter/空格触发 `onSelect(id, event)`。程序 update 不触发。 |

### 方法、事件与 getTarget

| 项目 | 说明 |
| --- | --- |
| `update(patch)` | 可换全部 options；按节点 ID 复用节点 `<g>`。 |
| `destroy()` | 移除 SVG、滚动监听、节点事件与尺寸观察。 |
| `getTarget(id)` | 返回该节点的 SVG `<g>`；更新后仍指向同一节点对象；找不到返回 `null`。节点查询不解析边 ID。 |
| `getEdgeTarget(id)` | 返回该边的 SVG `<g>`；找不到返回 `null`。 |
| `getEdgePath(id)` | 返回该边的 SVG `<path>`（`.nviz-graph__edgeline`）；找不到返回 `null`。 |
| `getEdgeLength(id)` | 返回路径真实长度（SVG 局部用户单位）；找不到返回 `null`。 |
| `getEdgePoint(id,ratio)` | 按比例 0–1 返回路径上的 `{x,y}`（SVG 局部坐标）；找不到返回 `null`。 |
| `getEdgePointAt(id,distance)` | 按距起点距离返回 `{x,y,distance,ratio}`；距离夹紧到 0–length。 |
| `getEdgePointClient(id,ratio)` | 返回同一路径点的 DOM client 坐标 `{x,y}`（通过路径 screen CTM 转换）。 |
| `getEdgeEndpoints(id)` | 返回 `{start:{x,y}, end:{x,y}}`（SVG 局部坐标）。 |
| `getEdgeInfo(id)` | 返回 `{id,from,to,label,directed,mark,length,endpoints}`。 |
| `onSelect(id,event)` | 仅由用户操作触发；事件参数是原始 DOM 事件。节点没有 onSelect 时不可聚焦。 |

### 边身份、目标与路径查询

- 边在更新时按稳定 id 复用 `<g>`；边渲染为真实 SVG `<path>`（不是 `<line>`），因此可直接使用 `getTotalLength()`/`getPointAtLength()` 等原生路径能力。
- 边查询 API 与节点查询分开：`getTarget` 永远只返回节点 `<g>`；边使用 `getEdgeTarget/getEdgePath/getEdgeLength/getEdgePoint/getEdgePointAt/getEdgePointClient/getEdgeEndpoints/getEdgeInfo`。
- 所有点/端点坐标均为 SVG 局部用户坐标（与 viewBox 同坐标系）；`getEdgePointClient` 用路径的 `getScreenCTM()` 转成 DOM 视口 client 坐标。
- `edgeFocus`/`edgeChanged` 是独立的边状态选项，与节点 `focus`/`changed` 互不替代；边状态写入边的 data 标记与可访问 title，视觉与节点状态分开。
- 边是作者声明的 from/to 直连锚点路径，查询返回真实路径几何，不把“元素中心连线”当作所有布局的语义；不自动路由或避障。

### 布局与视觉

- 分层布局先计算基本层级，再按层排列节点；有环图的剩余节点放在末尾层级，属于基础布局而非完整图布局引擎。
- 手动布局的 x/y 是节点中心，画布自动扩展；超出容器时在内部双向滚动，不缩小文字。
- 每个分组在节点左上角有一个编号徽记，图例列出“编号 + 分组名 + 节点数”。
- 有向边使用箭头；箭头 marker 的 id 由实例唯一生成。边标签有浅色背景。
- 关注节点使用虚线描边；变化节点使用实线、浅底；同一节点兼具时只显示实线状态和“关注 · 变化”文字。状态文字在节点内部，不依赖颜色。
- 图和边标签都使用 SVG `<text>`，可读、可选中。

### 键盘与可访问性

- 滚动区可聚焦，有可见焦点环与溢出提示。方向键/Page 键用于内部滚动。
- 传入 `onSelect` 时，每个节点 `g` 可 Tab 聚焦，Enter/空格选择，有 `role="button"` 和包含分组、状态、操作提示的 `aria-label`。
- SVG 有 `<title>`/`<desc>`；无 onSelect 时节点只读，不是控件。

### 最小用法

```js
var graph = NoteViz.Graph.mount(host, {
  layout: 'manual',
  nodes: [
    { id: 'a', label: '起点', x: 120, y: 100 },
    { id: 'b', label: '终点', x: 380, y: 180, group: '结果' }
  ],
  edges: [{ from: 'a', to: 'b', label: '传递', directed: true }],
  width: 520,
  height: 260,
  focus: ['b'],
  changed: ['b']
});
// graph.onSelect 通过 options 提供；更新用 graph.update({ focus: ['a'] })
```

### 限制

- 无拖拽、缩放、平移、自动避障或大型图引擎；边是直线，自环为固定小回环，密集图标签可能重叠。
- 环图只做基础处理，不保证层级最优。
- 分组用图例/编号，不画分组包围框。
- manual 坐标与画布尺寸的语义是“节点中心 + 最小画布”，不是屏幕缩放比例。
- 边有可选稳定 ID（缺省按 from→to 生成），可独立查询目标/路径/端点并参与 edgeFocus/edgeChanged；不提供自动路由、任意路径编辑或完整图算法。
- 没有 onSelect 时节点不可点击，不支持目录式选择。

---

<a id="D04"></a>
## 5. D04 NoteViz.Timeline

### 挂载与选项

```js
var timeline = NoteViz.Timeline.mount(host, {
  orientation: 'horizontal',
  items: [
    { id: 'e0', label: '开始', timeLabel: '第 0 天', kind: 'event' },
    { id: 'e1', label: '窗口', timeLabel: '第 1–3 天', kind: 'range', start: 1, end: 3 }
  ],
  current: 'e1',
  focus: ['e1'],
  changed: ['e1'],
  start: '第 0 天',
  end: '第 3 天',
  label: '训练时间线'
});
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `items` | `Array<{id,label,timeLabel,time,start,end,kind,description}>` 或字符串 | `[]` | 时间线对象。字符串作为无时间事件。建议提供唯一 id；无 id 时按位置生成。`kind` 可为 `'event' \| 'range' \| 'phase'`；有 start/end 且无 kind 时为 range；phase 必须有 start/end。`description` 为纯文本补充说明。 |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | 横向或纵向排列。 |
| `current` | id \| 零基下标 \| `{id}` | 无 | 当前对象，使用 `aria-current="step"` 和“当前”状态文字。不是独立时间游标。 |
| `focus` | id \| id[] | 无 | 关注对象。 |
| `changed` | id \| id[] | 无 | 变化对象。 |
| `start` / `end` | 任意可转字符串的值 | 无 | 显示在根部的可见时间范围说明；不裁剪或定位 items。 |
| `formatTime` | function(value,item) | 无 | 时间文字格式化；缺省直接使用字符串值。 |
| `label` | string | `'时间线'` | 根与滚动区名称。 |

`timeLabel` 优先于 `time/start/end` 格式化结果。区间/阶段的 `timeLabel` 建议写完整范围；未提供时会拼接 start/end 原值，或显示“时间未标注”。

### 方法、事件与 getTarget

| 项目 | 说明 |
| --- | --- |
| `update(patch)` | 换 items/orientation/current/focus/changed/start/end/formatTime/label；同 id 复用 `<li>`。 |
| `destroy()` | 移除根、滚动监听与尺寸观察。 |
| `getTarget(id)` | 返回该对象的 `<li>`；可用 id 或零基下标回退；找不到返回 `null`。 |
| 事件 | 无。没有自动播放、定时器或推进回调。 |

### 布局与视觉

- 横向使用水平轴线与按列排列的时间卡；纵向使用左侧时间列、轴线与右侧时间卡。
- 事件标记为圆点；区间为实线胶囊；阶段为虚线胶囊。时间卡上还有“区间/阶段”文字标签。
- 时间文字直接在每个对象上可见，不依赖轴线刻度。
- 当前项有 aria-current、可见“当前”状态和标记强调。关注用虚线，变化用实线/浅底；同一项兼具时状态文字合并为一条，外框只保留合成状态。
- 长内容在组件内部滚动，横向和纵向都可滚动；没有自动按时间重叠分道或缩放。

### 键盘与可访问性

- 根为命名 group，滚动区为可聚焦 region；每个对象是 `<ol>` 列表项。
- 滚动区有可见焦点环和溢出提示；聚焦后方向键/Page 键滚动内部。
- 当前项设置 `aria-current="step"`；时间、标题、区间/阶段文字、状态、描述均在正常阅读路径中。
- 不抢焦点、不自动播报、不自动切换当前项。

### 最小用法

```js
var timeline = NoteViz.Timeline.mount(host, {
  orientation: 'vertical',
  items: [
    { id: 'a', label: '接收', timeLabel: '09:00', description: '读取输入' },
    { id: 'b', label: '处理窗口', timeLabel: '09:10–09:30', kind: 'range', start: '09:10', end: '09:30' }
  ],
  current: 'b',
  focus: ['b'],
  start: '09:00',
  end: '09:30'
});
// timeline.update({ orientation: 'horizontal' });
// timeline.getTarget('b');
```

### 限制

- **按 items 顺序排列，不做数值时间比例轴**，也不自动按时间排序；需要统计时间轴/缩放视图应使用图表或专门组件。
- start/end 只是可见范围说明，不改变 items 布局。
- current 是某个 item 的 id/下标，不是可拖动的 playhead。
- 不自动播放，不提供时间轴拖拽、缩放、跨日/时区计算。
- items ID 应在实例内唯一；对象级引用以 ID 优先、下标为回退。
- 区间/阶段不重叠分道；所有对象各占一列/一行。
- 没有内置动画；更新直接替换内容并保持对象 DOM 身份。

---

<a id="D05"></a>
## 6. D05 NoteViz.TreeDiagram

### 挂载与选项

```js
var tree = NoteViz.TreeDiagram.mount(host, {
  orientation: 'down',
  nodes: [{
    id: 'root',
    label: '根节点',
    children: [
      { id: 'a', label: '分支 A' },
      { id: 'b', label: '分支 B', children: [{ id: 'b1', label: '叶子' }] }
    ]
  }],
  focus: ['a'],
  changed: ['b1'],
  label: '层级结构'
});
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `nodes` | 根节点对象或根节点数组 | `[]` | 嵌套层级数据；每个节点 `{id,label,children}`。无 id 时按路径生成稳定位置 ID。也可用 `root` 作为 `nodes` 不是数组时的别名。 |
| `orientation` | `'down' \| 'right'` | `'down'` | down 为自上而下，right 为自左向右。 |
| `focus` | id \| id[] | 无 | 关注节点。 |
| `changed` | id \| id[] | 无 | 变化节点。 |
| `label` | string | `'层级结构图'` | 根与 SVG 名称。 |

### 方法、事件与 getTarget

| 项目 | 说明 |
| --- | --- |
| `update(patch)` | 换 nodes/orientation/focus/changed/label；按节点 ID 复用 `<g>`。 |
| `destroy()` | 移除根、滚动监听与尺寸观察。 |
| `getTarget(id)` | 返回节点 `<g>`；更新后保持同一节点元素；找不到返回 `null`。 |
| 事件 | 无。节点不是可操作控件。 |

### 布局与视觉

- 从 children 层级递归生成基础整齐树：叶子按顺序取得槽位，父节点位于子节点跨度中央。
- down 使用水平槽位和逐层向下的纵向层级；right 交换方向，叶子沿纵向槽位排布。
- 连线从父节点边缘以折线连到子节点边缘，位于节点下方，保持关系清楚。
- 节点标签换行；节点较多或较深时画布在组件内部双向滚动，不压缩文字。
- 关注节点为虚线边框；变化节点为实线边框和浅底；同一节点兼具时只保留实线边框和一条“关注 · 变化”文字。状态文字位于节点内部。
- SVG 使用 `<text>`，可读可选；有 `<title>`/`<desc>` 与每个节点的 aria-label。

### 键盘与可访问性

- 滚动区可聚焦并有可见焦点环/溢出提示；聚焦后方向键/Page 键滚动画布。
- 没有展开/收起、选择或目录键盘行为；需要可操作目录请使用 `NoteUI.TreeView`（N07）。
- 节点文本、父子关系数和状态进入可访问名称；图形不是交互控件。

### 最小用法

```js
var tree = NoteViz.TreeDiagram.mount(host, {
  orientation: 'right',
  nodes: {
    id: 'root',
    label: '总览',
    children: [
      { id: 'a', label: '子项 A', children: [{ id: 'a1', label: '细节' }] },
      { id: 'b', label: '子项 B' }
    ]
  },
  focus: ['a'],
  changed: ['a1']
});
// tree.update({ orientation: 'down' });
// tree.getTarget('a');
```

### 限制

- 只接受嵌套 children，不解析扁平 parentId 数据或图形语法。
- 只做基础整齐树布局，没有紧凑树、边交叉最小化、避障或虚拟化。
- 不支持展开/收起、选择、编辑、拖拽或点击节点。
- 节点 ID 应在树内唯一；循环引用被跳过。
- 画布只滚动、不自动缩放，以免文字不可读。
- 当前树 shape 和父子位置不能通过选项定制主题或节点模板。

---

<a id="D06"></a>
## 7. D06 NoteViz.CompareView

### 挂载与选项

```js
var compare = NoteViz.CompareView.mount(host, {
  left: { title: '处理前', content: '旧值 12' },
  right: { title: '处理后', content: '新值 18' },
  mode: 'side-by-side',
  labels: { left: '前态', right: '后态', compare: '对照', changed: '变化侧' },
  focusChanged: 'right'
});
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `left` / `right` | `{title, content}`、字符串、DOM 节点或 `null` | `null` | 两侧内容。`content` 字符串按纯文本写入；Node/Node[] 被移入组件。只提供一侧时渲染单侧。 |
| `mode` | `'side-by-side' \| 'stacked'` | `'side-by-side'` | 并排或上下。窄容器下 side-by-side 自动转 stacked。不支持 overlay。 |
| `labels` | object 或 `[left,right]` | 中文默认值 | 侧标签、分隔标签和变化侧文案。对象可含 `left`、`right`、`compare`、`changed`、`stacked`；数组为左右侧标签。 |
| `focusChanged` | boolean、`'left' \| 'right' \| 'both'`、数组或 `{side,sides}` | `false` | 变化侧强调。`true` 默认强调右侧（右侧不存在时左侧）。显示边框、顶部色条和文字徽章，不只是颜色。 |

### 方法、事件与 getTarget

| 项目 | 说明 |
| --- | --- |
| `update(patch)` | 换 left/right/mode/labels/focusChanged。只改标题、标签或强调侧时保留原有内容 DOM；传入侧对象且包含 content 才替换该侧内容。 |
| `destroy()` | 幂等移除根并释放 ResizeObserver；销毁后 update 为空操作。 |
| `getTarget('left' \| 'right')` | 返回该侧 `<section>`；该侧不存在时返回 `null`。内部对象不被暴露。 |
| 事件 | 无。 |

### 布局、窄容器与内容

- 并排时两侧等宽，中间有可见“对照”分隔标签；上下时先左后右，分隔条横向。
- 单侧存在时占满宽度，不强制生成第二张图。
- 根容器宽度小于 560px 且请求 side-by-side 时，自动转 stacked，并在下方显示可见说明。观察器监听根尺寸变化，宽回来会恢复并排。
- 两侧内容由宿主决定。共同对象对应、变化位置和对象内标记应在内容中表达；本组件不计算 diff，也不自动连线，保证它只是通用容器。
- 字符串不会解析 HTML；富内容用 DOM 传入，且会被移入（不是克隆），组件销毁时随根移除。

### 键盘与可访问性

- 根为命名 group；两侧为带 h3 标题的 section，标题与区域关联。
- 变化侧有可见文字徽章；“对照”分隔条是装饰层，不拦截键盘。
- 内容中的可聚焦元素保留浏览器键盘顺序；组件不额外抢焦点，也不做键盘陷阱。内容焦点有可见焦点环。
- 自动堆叠时的说明直接可见，不只藏在角标或悬停中。

### 最小用法

```js
var compare = NoteViz.CompareView.mount(host, {
  left: { title: '前', content: '状态 A' },
  right: { title: '后', content: '状态 B' },
  labels: { compare: '前后' },
  focusChanged: 'right'
});
// compare.update({ mode: 'stacked', labels: { changed: '本步变化侧' } });
// compare.getTarget('left');
```

### 限制

- 不计算 diff、不推断共同对象、不绘制跨侧对应线；这些由内容/更高层组合块完成。
- 没有 overlay 模式，也没有滚动同步、拖拽分栏或自动高度对齐。
- 自动堆叠阈值固定为根宽 560px，组件不读取容器查询变量。
- `getTarget` 只到整侧 section，不到内部对象。
- 字符串纯文本；DOM 内容被移入。
- 只改侧标题而不提供 content 会保留正文；显式传 content（包括 null）才替换该侧正文。

---

## 8. 键盘与可访问性汇总

| 组件 | 可聚焦区域 | 键盘行为 |
| --- | --- | --- |
| D01 Sequence | 横向滚动区 | 方向键横向滚动；Page/Home/End 按可用溢出。 |
| D02 Matrix | 表格滚动区 | 方向键、Page/Home/End 滚动局部；原生表格语义。 |
| D03 Graph | 滚动区；传入 onSelect 时每个节点 | 滚动区方向键；节点 Tab 聚焦、Enter/空格选择。 |
| D04 Timeline | 滚动区 | 方向键、Page/Home/End 滚动；当前项 aria-current。 |
| D05 TreeDiagram | 滚动区 | 方向键、Page/Home/End 滚动；节点不交互。 |
| D06 CompareView | 内容内原生可聚焦元素 | 无组件级键盘劫持。 |

所有滚动区有 `tabindex="0"`、可见 3px 焦点环和实际溢出时的可见文字提示。组件在必要说明与状态上使用可读文本，不只依赖颜色。`prefers-reduced-motion: reduce` 下所有组件过渡归零；本模块没有自动播放或不可取消动画。

## 9. 支持范围与已知限制

- 所有组件是普通 DOM/SVG 渲染，本地静态数据，不执行网络请求、不解析 HTML 字符串、不接收远程数据源。
- 本模块不提供通用图编辑器、时间轴缩放、diff 计算、拖拽分栏或对象级跨侧连线。
- D02/D04/D05 的接口是本模块为对应清单项补充的公开接口；D01/D03/D06 沿用既有公开选项形状，D06 不提供 overlay 模式。
- D04 是“有序时间线表达”，不是按数值比例缩放的时间图表；这一点是设计边界而非未完成功能。
- D03/D05 的布局是基础布局，不是大型图/树布局引擎；密集标签和复杂环图可能出现重叠。
- 本模块已在 Edge（Chromium）真实挂载自检，但没有进行跨浏览器矩阵、打印样式、超大数据量或用户视觉评审。

最小完整示例：

```html
<div id="demo"></div>
<link rel="stylesheet" href="src/core/tokens.css">
<link rel="stylesheet" href="src/core/base.css">
<link rel="stylesheet" href="src/viz/objects.css">
<script src="src/core/core.js"></script>
<script src="src/viz/objects.js"></script>
<script src="src/viz/objects-sequence-matrix.js"></script>
<script src="src/viz/objects-graph.js"></script>
<script src="src/viz/objects-timeline-tree.js"></script>
<script src="src/viz/objects-compare.js"></script>
<script>
  var host = document.querySelector('#demo');
  var seq = NoteViz.Sequence.mount(host, {
    variant: 'bits',
    items: ['1', '0', '1', '1'].map(function (value, index) {
      return { id: 'b' + index, value: value };
    }),
    focus: ['b1'],
    changed: ['b3']
  });
</script>
```
