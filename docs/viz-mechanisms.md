<a id="viz-mechanisms"></a>
# 可复用变化机制（viz-mechanisms）

## 1. 范围与加载

本模块提供 M01–M04 四项可复用变化机制：

| ID | 公开入口 | 作用 |
| --- | --- | --- |
| M01 | `NoteViz.SequenceEdit` | 序列对象删除、移动、交换，保留 ID、让位、终态与回退。 |
| M02 | `NoteViz.Transfer` | 一个对象从起点移动到终点，终点归属明确，路径提示可追踪。 |
| M03 | `NoteViz.SplitMerge` | 按宿主映射呈现拆分或合并，来源、结果和连线同时可核对。 |
| M04 | `NoteViz.ReplaceReveal` | 同一对象的值替换，或展开局部内部说明，整体位置保持。 |

源码（按 `src/manifests/viz-mechanisms.json` 的 js 顺序加载）：

- `src/viz/mechanisms.js`（模块引导与内部共享工具，挂 `window.NoteVizInternals.mechanisms`；本身不注册 `NoteViz.*` 公开入口）
- `src/viz/mechanisms-sequence-edit.js`（M01 `NoteViz.SequenceEdit`）
- `src/viz/mechanisms-transfer.js`（M02 `NoteViz.Transfer`）
- `src/viz/mechanisms-split-merge.js`（M03 `NoteViz.SplitMerge`）
- `src/viz/mechanisms-replace-reveal.js`（M04 `NoteViz.ReplaceReveal`）
- `src/viz/mechanisms.css`（只使用 `.nviz-*` 作用域与 `var(--hnv-*, fallback)`）
- `gallery/demos/viz-mechanisms.js`（Gallery 演示）
- `src/manifests/viz-mechanisms.json`（清单）

加载顺序（最小依赖只有 core）：

```html
<link rel="stylesheet" href="src/core/tokens.css">
<link rel="stylesheet" href="src/core/base.css">
<link rel="stylesheet" href="src/viz/mechanisms.css">

<script src="src/core/core.js"></script>
<script src="src/core/motion.js"></script>
<script src="src/viz/mechanisms.js"></script>
<script src="src/viz/mechanisms-sequence-edit.js"></script>
<script src="src/viz/mechanisms-transfer.js"></script>
<script src="src/viz/mechanisms-split-merge.js"></script>
<script src="src/viz/mechanisms-replace-reveal.js"></script>
```

无需图标、浮层、旧组件或其他 viz 模块。若使用整库构建包，按构建产物整体加载即可。四个组件文件只使用 `mechanisms.js` 提供的私有工具（id 规范化、内容副本、动效开关、定时器与动画句柄、根状态），必须在其之后加载；`window.NoteVizInternals.mechanisms` 不是公开 API，宿主不要依赖它。四项只依赖 `NoteCore` 的 DOM 辅助、`NoteCore.motion`、`NoteCore.onResize` 和 `NoteCore.validateHost`。

所有 `mount(host, options)` 都向 host 追加根元素，不清空宿主其他节点；返回对象都含 `el`、`update(patch)`、`destroy()`，并按项提供动作方法。`destroy()` 幂等，清除动画、临时路径/幽灵、监听和定时器。内容一律按纯文本写入，不解析 HTML。

**共同交互边界**：四项都是“变化机制”而非带默认控制条的课程播放器。实例内部没有自动播放、自动串播或抢焦点控件；播放、回退、重看等由宿主按钮或外部播放器调用实例方法。M01 的插入不在此模块重复实现，请复用 R10 `SeqInsert`。

---

<a id="M01"></a>
## 2. M01 NoteViz.SequenceEdit

### 挂载与选项

```js
var seq = NoteViz.SequenceEdit.mount(host, {
  items: [{ id: 'a', label: '读取' }, '校验', { id: 'c', label: '写入' }],
  focus: ['a'],
  changed: ['c'],
  animate: true,
  label: '序列删除与重排',
  onChange: function (state, event) {}
});
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `items` | `Array<string \| {id,label}>` | `[]` | 初始序列。对象应提供稳定 `id`；缺省生成局部 id。字符串项会生成局部 id，移动后实例内保持稳定。 |
| `focus` | string \| string[] | 无 | 当前关注对象 id；仅建立关注标记，不改变数据。 |
| `changed` | string \| string[] | 无 | 宿主给定的初始“本步变化”id。用户动作后实例还会合并自动计算的位置变化。 |
| `animate` | boolean | `true` | 动作默认是否播放动画；每个动作可再用 `{animate:false}` 覆盖。 |
| `label` | string | `'序列编辑'` | 根与列表的可访问名称。 |
| `onChange` | function | 无 | 用户动作后触发 `onChange(state, event)`；程序 `update()` 与 `replay()` 不触发。 |

`onChange` 的 `event` 是动作描述，如 `{type:'remove', id, index}`、`{type:'move', id, fromIndex, toIndex}`、`{type:'undo'}`。它不是 DOM 事件。`state` 是当次动作后的快照：

```js
{
  items: [{id, label}],          // 当前终态
  previousItems: [{id, label}],  // 最近一次动作前快照
  lastOp: { type, ... } | null,
  focus: [id],
  changed: [id],                 // 当前显示的本步变化
  canUndo: boolean,
  total: number
}
```

### 实例方法

| 方法 | 返回 | 说明 |
| --- | --- | --- |
| `remove(id, {animate})` | 实例 | 删除对象；其余对象按新顺序让位。不存在时无操作。 |
| `move(id, index, {animate})` | 实例 | 移动到目标终态下标（0 起，自动夹紧），不是“插入到空位”。 |
| `swap(idA, idB, {animate})` | 实例 | 交换两个对象的位置。 |
| `undo({animate})` | 实例 | 回退一层历史快照；可连续撤销直到初始状态。撤销不累计错位。 |
| `reset({animate})` | 实例 | 回到挂载时的 `items` 基线；`changed` 回到宿主基线。 |
| `replay({animate})` | 实例 | 逻辑状态不变，视觉上先短暂呈现动作前快照，再播放到当前状态。 |
| `update(patch)` | 实例 | 程序更新 `items/label/focus/changed/animate/onChange`，不触发 `onChange`。更新 `items` 会清空撤销历史并以新数据为基线。 |
| `getState()` | 快照 | 返回当前状态副本，不暴露内部节点。 |
| `getTarget(id)` | `HTMLElement \| null` | 返回当前逻辑序列中该 id 对应的公开 `<li>`；已删除或已销毁时返回 `null`。同一列表内重复 id 会被加 `~2` 后缀，宿主应提供唯一 id。 |
| `destroy()` | `undefined` | 幂等清理并移除根。 |

编排层接入方法（保留给 NoteDemo `sequence-edit` Adapter，普通宿主不需要）：

| 方法 | 说明 |
| --- | --- |
| `restoreView({ model, cues })` | 按整帧视图重建列表、关注与变化标记；用于快照式重绘，不触发 `onChange`。 |
| `applyViewCues({ focus, changed })` | 只更新关注与本步变化标记，不动列表内容。 |
| `runAction({ type, params }, { animate })` | 程序执行 `remove`/`swap`，返回 `{ finished, cancel }` 句柄；不触发 `onChange`、不写撤销历史。 |
| `settleVisual()` | 等待关注/变化提示的 CSS 过渡收束后 resolve；无过渡时立即 resolve。 |

### 动画、回退与减少动效

- 删除时，离开项以临时 ghost 淡出，剩余对象用 FLIP 追踪到新位置；ghost 以舞台内 ghost 层为定位原点、按动作前的真实视口矩形对齐（含舞台边框），停稳或下一次动作时清除，不残留在列表或 body。
- 移动/交换复用原对象节点（相同 id 保持同一公开元素），用位移动画表现让位与换位；重看不复用私有选择器。
- `remove/move/swap/undo/reset` 都会保存动作前快照（`undo` 回退历史但不新增历史层）。动画中途再次操作会先记录当前可见矩形、再取消旧动画并移除临时节点，因此可从目标当前视觉位置继续移动到最新逻辑目标，而不是先跳回终态。
- 减少动效（`prefers-reduced-motion: reduce` 或动作 `{animate:false}`）时直接呈现目标布局、终态数量和正确 `getTarget`，不留下 ghost 或填充动画。
- 关注与变化使用不同提示：关注是单一强调环与文字标记，变化是浅底与文字标记；两者同时出现时合并为“变化 · 关注”，不叠两套环。

### 插入边界

**插入不在 M01 重新实现。** 课程播放器式的“插入一项并让位、托盘、插入位置说明”请复用 R10 `SeqInsert`。M01 只处理已存在对象的删除、移动、交换、回退与重看。需要插入后继续编辑时，由宿主在 R10 停稳后重建或更新 M01 数据，并自行定义跨组件的状态同步；M01 不产生或模拟 R10 的插入托盘/插入符。

### 最小用法

```js
var host = document.querySelector('#demo');
var seq = NoteViz.SequenceEdit.mount(host, {
  items: [
    { id: 'read', label: '读取' },
    { id: 'check', label: '校验' },
    { id: 'write', label: '写入' }
  ],
  focus: ['check'],
  onChange: function (state) { console.log(state.items); }
});
seq.remove('check');
seq.undo();
seq.replay();
// seq.destroy();
```

---

<a id="M02"></a>
## 3. M02 NoteViz.Transfer

### 挂载与选项

```js
var transfer = NoteViz.Transfer.mount(host, {
  source: document.querySelector('#source'),
  target: document.querySelector('#target'),
  object: { id: 'packet', label: '数据包 A' },
  sourceLabel: '发送端',
  targetLabel: '接收端',
  animate: true,
  onSettle: function (state) {}
});
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `source` | Element \| 选择器 | 无 | 已有起点容器。省略时必须同时省略 `target`，组件在宿主内创建两个区域。 |
| `target` | Element \| 选择器 | 无 | 已有终点容器。与 `source` 必须成对提供且不能相同。 |
| `object` | `{id,label}` | `{id:'object',label:'对象'}` | 唯一被传递对象；id 与文本可程序更新。 |
| `sourceLabel` | string | `'起点'` | 起点可见标签，可更新。 |
| `targetLabel` | string | `'终点'` | 终点可见标签，可更新。 |
| `animate` | boolean | `true` | 默认动画开关，可被方法参数覆盖。 |
| `onSettle` | function | 无 | 对象停稳后触发一次 `onSettle(state)`；同向动画中再次操作而立即落定时也会触发一次。 |

`source`/`target` 都未提供时，组件在根内创建带“起点/终点”标题的两个区域，并把对象放入起点。二者都提供时，组件使用宿主已有容器，不删除其中原有内容；组件只向起点追加唯一对象节点，并在终点显示可见的起点/终点图例。`source`/`target` 只在挂载时固定，`update()` 不接受改挂载容器（传入会被忽略）。

### 状态与实例方法

```js
{
  at: 'source' | 'target',  // 逻辑归属
  settled: boolean,
  object: {id, label},
  sourceLabel: '发送端',
  targetLabel: '接收端'
}
```

| 方法 | 返回 | 说明 |
| --- | --- | --- |
| `send({animate})` | 实例 | 将对象送入 target；已在 target 时无操作，不产生第二个对象。 |
| `reset({animate})` | 实例 | 将对象送回 source。 |
| `replay({animate})` | 实例 | 从 source 重新播放到 target，最终归入 target；重看前重新测量当前布局。 |
| `update(patch)` | 实例 | 支持 `object`、`sourceLabel`、`targetLabel`、`animate`、`onSettle`；运行中调用会先落定当前目标。不触发 `onSettle`。 |
| `getState()` | 快照 | 返回状态副本。 |
| `getTarget('object'\|'source'\|'target')` | `HTMLElement \| null` | 返回唯一对象节点或对应区域；销毁后返回 `null`。 |
| `destroy()` | `undefined` | 幂等清理动画、路径覆盖层、对象与根；已有宿主容器保留。 |

### 动画与归属

- 对象的 DOM 归属于当前终点/起点容器，不做克隆。发送时先把同一节点移动到目标区域，再从动作前的视觉矩形 FLIP 落位；因此源侧在终态没有副本。
- 移动时在 body 临时放一层 `aria-hidden` 的 SVG 路径提示，停稳即移除；不会留下固定覆盖层。`destroy()` 中途也会清理。
- 重复 `send` 或“动画中再次同向操作”不会加对象，只会取消旧动画并落到最新目标。反向操作从当前视觉位置重建一次移动。
- 布局变化后再次 `replay()` 会实时重新测量起点/终点和对象矩形。
- 减少动效或 `{animate:false}` 时直接落到目标，不创建路径层；`onSettle` 仍在该次动作结束时触发。
- 外部容器模式不改变宿主其它节点；对象样式由组件提供，区域布局/尺寸由宿主负责。

### 最小用法

```js
var transfer = NoteViz.Transfer.mount(host, {
  object: { id: 'packet', label: '数据包 A' },
  sourceLabel: '发送端',
  targetLabel: '接收端',
  onSettle: function (state) {
    console.log(state.at, state.settled);
  }
});
transfer.send();
transfer.reset();
transfer.replay();
// transfer.destroy();
```

---

<a id="M03"></a>
## 4. M03 NoteViz.SplitMerge

### 挂载与选项

```js
var split = NoteViz.SplitMerge.mount(host, {
  mode: 'split',
  before: [{ id: 's', label: '整段数据' }],
  after: [{ id: 'h', label: '帧头' }, { id: 'p', label: '载荷' }],
  links: [{ from: 's', to: 'h' }, { from: 's', to: 'p' }],
  animate: true,
  label: '拆分关系',
  onSettle: function (state) {}
});
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `mode` | `'split' \| 'merge'` | `'split'` | 语义与标题；映射仍以 `links` 为准。 |
| `before` | `Array<{id,label} \| string>` | `[]` | 变化前对象；建议提供稳定 id。 |
| `after` | `Array<{id,label} \| string>` | `[]` | 变化后对象；建议提供稳定 id。 |
| `links` | `Array<{from,to}>` | 省略/空数组时用默认映射 | 前后对象映射。非法/重复的 from→to 会被忽略。 |
| `animate` | boolean | `true` | 默认动画开关。 |
| `label` | string | `拆分关系`/`合并关系` | 组件可访问名称。 |
| `onSettle` | function | 无 | 播放、重置或重看停稳后触发 `onSettle(state)`。 |

默认映射：

- `split` 无 `links` 或 `links` 为空数组：`before[0] → after` 中全部对象。
- `merge` 无 `links` 或 `links` 为空数组：`before` 中全部对象 → `after[0]`。
- 显式 `links` 按宿主给的关系使用；未连接的来源或结果仍会显示在对应列，卡片标注“（无映射）”，可访问名称为“没有映射”/“没有来源”。

### 状态与实例方法

```js
{
  mode: 'split' | 'merge',
  before: [{id,label}],
  after: [{id,label}],
  links: [{from,to}],
  phase: 'before' | 'after',
  running: boolean
}
```

| 方法 | 返回 | 说明 |
| --- | --- | --- |
| `play({animate})` | 实例 | 从变化前进入变化后；已停稳在 after 时无操作。 |
| `reset({animate})` | 实例 | 回到变化前，隐藏结果与连线。 |
| `replay({animate})` | 实例 | 先恢复变化前状态，短暂停留后重新播放到变化后，最终位于 after。 |
| `update(patch)` | 实例 | 支持 `mode/before/after/links/animate/label/onSettle`，更新后回到 before；不触发 `onSettle`。只改 `animate/label/onSettle` 或数据未变化时不重建卡片，`getTarget` 节点身份保持；数据变化时按新数据重建。 |
| `getState()` | 快照 | 返回映射和阶段副本。 |
| `getTarget(id)` | `HTMLElement \| null` | before 或 after 对象的卡片。如果同一 id 同时存在于两侧，优先返回 after 结果卡。需要两侧都取时请使用不同 id。 |
| `destroy()` | `undefined` | 幂等清理动画、连线、计时器与根。 |

### 停点、映射与动画

- 变化前只显示来源列；变化后来源列保留并降强调，结果列出现。两边同时存在，便于停住核对来源、结果和映射，而不是只看到终态。
- 每张卡就近显示其映射文字（来源卡“→ 结果”、结果卡“← 来源”）；舞台 SVG 曲线与卡片的边沿连接。SVG 对辅助技术隐藏，另有视觉隐藏的完整“来源 → 结果”列表。
- 结果卡的出现使用从来源质心出发的短位移和淡入；来源和结果从挂载起就是唯一节点，播放过程中不克隆对象。
- 结果列、连线在 before 阶段保持布局但不可见，避免播放时整块跳动；窄容器下两列通过 auto-fit 自动纵向排列，连线按实际几何重画。
- `onSettle` 仅在停稳时触发；动画中再次 `play/reset/play` 会取消旧动画并以最新目标直接落定（不累积多个副本或旧动画）。减少动效时直接到目标。
- 重看不自动持续播放，只在一次调用内完成“变化前短暂停留 → 变化后”。

### 最小用法

```js
var split = NoteViz.SplitMerge.mount(host, {
  mode: 'split',
  before: [{ id: 'whole', label: '整段数据' }],
  after: [
    { id: 'head', label: '帧头' },
    { id: 'payload', label: '载荷' }
  ]
});
split.play();
split.reset();
split.replay();
// split.destroy();
```

---

<a id="M04"></a>
## 5. M04 NoteViz.ReplaceReveal

### 挂载与选项

```js
var changed = NoteViz.ReplaceReveal.mount(host, {
  mode: 'replace',
  before: { id: 'count', label: '计数器', value: 12 },
  after: { id: 'count', label: '计数器', value: 14, detail: '内部说明' },
  animate: true
});
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `mode` | `'replace' \| 'reveal'` | `'replace'` | `replace` 替换值；`reveal` 展开内部说明。 |
| `before` | `{id,label,value,detail?}` | 无 | 变化前对象。`id` 是身份线索；同一对象应保持相同 id。 |
| `after` | 同上 | 无 | 变化后对象；可省略，缺省值会回退到 before。 |
| `animate` | boolean | `true` | 默认动画开关，可被方法参数覆盖。 |

内容都按纯文本显示；`value` 与 `detail` 的 `0`、`false` 等值会转成文字，不会被当作空。

### 状态与实例方法

```js
{
  mode: 'replace' | 'reveal',
  phase: 'before' | 'after',
  before: {id,label,value,detail},
  after: {id,label,value,detail},
  value: '当前显示值',
  label: '当前标签',
  running: boolean
}
```

| 方法 | 返回 | 说明 |
| --- | --- | --- |
| `play({animate})` | 实例 | 在同一对象框内替换值或展开内部；已停稳在 after 时无操作。 |
| `reset({animate})` | 实例 | 回到变化前：收起详情、恢复旧值。 |
| `replay({animate})` | 实例 | 先回到变化前，短暂停留后重新执行到 after；最终逻辑位置为 after。 |
| `update(patch)` | 实例 | 支持 `mode/before/after/animate`；程序更新后回到 before，不播放动画，也没有用户事件。 |
| `getState()` | 快照 | 返回内容、阶段和当前显示值。 |
| `getTarget('object'\|'detail')` | `HTMLElement \| null` | `object` 是同一对象外框；`detail` 是内部说明面板（replace 模式下也存在但视觉隐藏）。销毁后返回 `null`。 |
| `destroy()` | `undefined` | 幂等清理值/高度动画、计时器与根。 |

### 两种变化的差别

- **replace**：保持同一个外框与标签，只让值在原位做一次淡出/淡入替换；停稳后外框顶部位置不变。下方出现“替换前 → 替换后”的文本对照，不再摆放第二张完整对象图。
- **reveal**：不替换对象，把内部说明区从高度 0 展开；外框上缘保持不动，内容向下生长。展开后的内部面板附带“展开前：值 …，内部未显示 / 原内部…”的对照线索。
- 内部说明过少或没有 `after.detail` 时显示空内容占位，不伪造内部结构。
- 减少动效或 `{animate:false}` 时直接到目标：值已是 after，或详情已展开；不保留中间高度/透明度动画。快速连点时取消旧动画，直接停到最新目标。
- 本组件没有 `onSettle` 回调；宿主需要知道停稳时可在点击后用自己的定时或下一交互读取 `getState()`，不要把内部计时当作公共 API。

### 最小用法

```js
var swap = NoteViz.ReplaceReveal.mount(host, {
  mode: 'replace',
  before: { id: 'count', label: '计数器', value: 12 },
  after: { id: 'count', label: '计数器', value: 14 }
});
swap.play();
swap.reset();
swap.replay();

var detail = NoteViz.ReplaceReveal.mount(otherHost, {
  mode: 'reveal',
  before: { id: 'box', label: '配置对象', value: '{ … }', detail: '' },
  after: {
    id: 'box',
    label: '配置对象',
    value: '{ … }',
    detail: 'theme = quiet；density = 3。'
  }
});
detail.play();
// swap.destroy(); detail.destroy();
```

---

## 6. 动画、中断与减少动效（共同约定）

- **默认静止**：挂载完成只显示稳定的 before 状态；四个实例内部都没有自动串播。
- **节奏**：JS 动效时长取自 `--hnv-motion-explain`（`NoteCore.motion.explainDuration()`），并限制在可追踪范围内；不从 0 加速到一闪而过。CSS 过渡使用 `--hnv-motion-ui` / `--hnv-motion-explain`。
- **最新目标收敛**：动画中再次调用动作会先清除旧动画、临时 ghost / 路径 / 高度样式；M01 先记录当前可见矩形再落定、M02 从当前视觉矩形重建一次移动，因此可在可追踪时继续从当前视觉位置移动；M03/M04 对同向连点直接落定最新目标。最终 DOM 状态只对应最新逻辑状态。
- **回退/重看不累计**：M01 的 `undo` 使用快照栈；M02 每次 `replay` 从 source 重新测量；M03 每次播放重新计算连线；M04 每次测量当前详情高度。
- **清理**：每次停稳会取消 WAAPI 填充效果；M01 ghost、M02 body 上的 SVG 路径、M03 连线动画、M04 内联高度都会被清除。`destroy()` 在动画中途也执行同一清理并移除实例。
- **减少动效**：`NoteCore.motion.reduced()` 为真或方法传 `{animate:false}` 时，直接呈现目标；没有临时副本、路径、延迟或自动推进。

## 7. 键盘与可访问性

- 四项内部都没有按钮、链接、可编辑字段或键盘捕获；不会劫持整页方向键、Tab 或空格。宿主提供播放/回退按钮时，请使用原生 `button` 并保留 `:focus-visible`。
- M01 使用有序列表语义；每项带位置、当前关注和本步变化的可访问名称，变化标记不是仅靠颜色。M03 的来源/结果列表各有名称，另提供视觉隐藏的来源→结果映射列表；SVG 连线对辅助技术隐藏。
- 每个实例都有可见的 `role="status"` / `aria-live="polite"` 状态行，文字描述操作后的数量和终态；动画期间根设置 `aria-busy="true"`，停稳后移除。
- M02 对象以 `aria-label` 表达对象名；路径提示是装饰并对辅助技术隐藏。外部容器保留宿主原有语义，组件不覆盖容器原有内容。
- M04 的内部面板是命名 `region`；折叠时 `aria-hidden="true"`，展开后才进入可访问树。状态的可见文字、phase badge 和前后对照不依赖颜色单独表达。
- 必要信息（数量、映射、对象归属、前后值）均进入正常阅读路径，不藏在悬停、title 或折叠中。

## 8. 支持范围与限制

- 真实浏览器核验范围为本机 Microsoft Edge（Playwright 驱动）。Firefox/Safari、浏览器缩放、打印、RTL 与触屏拖拽未验证。组件不依赖鼠标或拖拽即可工作。
- 只适配普通 HTML/CSS/JS；不使用构建、网络、字体 CDN、`fetch`、`innerHTML` 或动态代码执行。图标不在本模块使用。
- 文本只接受字符串/DOM 属性值并按纯文本写入；不支持富 HTML、公式或自定义组件作为对象标签。
- 大数据量没有虚拟化。M01 的删除 ghost、M03 的连线数量与 M04 的长 detail 会随数量线性增加。极长标签会换行，可能使图形变高。
- 宿主容器有 transform、缩放或滚动容器时，M02 的 body 路径层按视口测量绘制；动画本身仍在目标容器内。重看会重新测量。
- 减少动效由 `prefers-reduced-motion` 决定；在页面已加载后改变系统偏好，本模块不保证立即中断已在进行的动画，后续动作会直接落定（按动作时读取 `reduced()`）。
- M01 的 `getTarget` 在重看短暂显示旧快照期间以当前逻辑列表为准；若刚恢复的节点尚未出现在快照中，停稳后读取最可靠。重看不改变 `getState()` 的逻辑 `items`。
- M02 的 `source`/`target` 容器固定于挂载；`update()` 不替换容器。已有容器不自动获得完整内部样式，宿主负责区域外观与尺寸。M02 的 body SVG 路径是非交互的临时视觉提示，不使用浮层栈，停稳或销毁即移除。
- M03 的 before/after 若复用同一 id，`getTarget(id)` 优先返回 after 结果卡；需要同时定位两侧时请给不同 id。单侧重复 id 会被加 `~2` 后缀。显式空 `links` 会触发默认映射，而非“没有任何映射”。`update()` 只改开关/名称时保留卡片节点，数据变化时才重建。
- M04 的“位置保持”指对象外框上缘和同一对象节点保持不变；卡片下方展开会增加高度，可能推动下方宿主内容。replace/reveal 是模式，不强制同屏显示第二张对象图。
- 用户评价：四项均为新增候选，**未获用户评价，保留候选**；技术自检通过不代表用户审美或教学效果已确认。

## 9. 验证与示例入口

- Gallery：构建后使用 `gallery/index.html#M01`（M02/M03/M04 同理）；最小示例使用 `examples/run.html?id=M01`。
- 演示覆盖：M01 删除/移动/交换切换、撤销、重看、重置；M02 传递终态、重置、重看、换对象标签；M03 拆分/合并切换与默认映射；M04 replace/reveal 切换与停稳对照。
- 自检脚本：`tests/checks/viz-mechanisms-check.mjs`（Edge，逐项真实 mount、动作、回退、重看、快速连点、减少动效、destroy 与临时层清理）。
