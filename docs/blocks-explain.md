# 可复用组合块 B05–B10：代码与结构讲解

本文记录 B05–B10 的实现范围、接口、数据形状、组合关系、键盘与限制；B01–B04 另见[演示舞台与状态对照](blocks-stage.md)。

## 1. 范围与加载顺序

B05–B10 是预制组合块，不是课程页面、测验或业务系统。它们：

- 只消费公开 API：`NoteBlocks.StepPlayer`、`NoteUI.CodeBlock/DataObject/Badge/Notice/Stack/Panel/TreeView/Steps/Button`、`NoteViz.Sequence/Graph/Chart`；
- 所有代码、位串、节点、消息、目录、图表和字幕数据都由宿主给出；
- 默认静止；如果存在步进，只由用户操作触发；
- 不执行代码、不请求网络、不解析任意图语法、不写死协议或业务规则；
- `update(patch)` 不触发用户回调；程序 `go/next/prev/replay/reset` 也不触发 `onStep`；
- 每次停点重建/更新所需子组件并释放旧实例，销毁时清理子组件、计时器和临时节点。

B01–B10 共用 `src/blocks/shared.js`：它只定义内部 `window.NoteBlocksInternals`（元素创建、内容写入、宿主校验、依赖检查、幂等销毁、步进快照包装等），不是公开 API。`blocks` 模块加载时 `shared.js` 在各块文件之前；单独按文件加载时也必须先加载它，否则块文件会抛出可读错误。

模块级加载顺序（模块包或全量包）：

```text
core → legacy → ui-layout → ui-content → ui-navigation
     → viz-objects → viz-chart → blocks
```

`blocks` 模块同时包含 B01–B04（`stage.js`、`compare.js`）与 B05–B10，并由 `src/manifests/blocks-*.json` 按 `shared.js` → 各块文件的顺序合并。B05、B07、B08、B10 在 `mount()` 时要求同模块的 `NoteBlocks.StepPlayer` 已经定义；加载完整 `blocks` 模块即可，单独按文件加载时先加载 `shared.js` 与 `stage.js`。未加载 StepPlayer 会抛出可读错误，不会静默拼一个私有步进器。

依赖摘要：

| ID | 公开组件组合 | 额外模块 |
| --- | --- | --- |
| B05 | StepPlayer（含 DemoStage/Button/栈布局）、CodeBlock、DataObject、Badge、Notice | core、legacy、ui-layout、ui-content |
| B06 | NoteViz.Sequence、NoteUI.Stack/Badge/Notice | core、legacy、ui-layout、viz-objects |
| B07 | StepPlayer、NoteViz.Graph、NoteUI.Steps/Notice | core、legacy、ui-layout、ui-navigation、viz-objects |
| B08 | StepPlayer（步进与字幕）；本块自己的有限时序 SVG | core、legacy、ui-layout |
| B09 | NoteUI.TreeView/Panel/DataObject/Badge/Notice | core、legacy、ui-layout、ui-navigation |
| B10 | StepPlayer、NoteViz.Chart、NoteUI.Notice | core、legacy、ui-layout、viz-chart |

所有组件根只向宿主追加节点，不清空宿主原有内容；组合块根类名为 `.nblk-*`，CSS 只使用 `--hnv-*` tokens，不包含全局裸选择器。

## 2. 共同停点与字幕规则

- B05、B07、B08、B10 复用 `NoteBlocks.StepPlayer`，由它提供上一步、下一步、跳转、重看和重来控件。组合块不另建步进器，不自动串播。
- `StepPlayer` 的 `steps` 每项必须是完整快照；当前停点的字幕来自该停点，切换时先销毁上一停点渲染出的子实例。
- 字幕位于舞台画面下方；同一停点内不会自行改变。画面内容与字幕由同一个停点索引驱动。画面内容高度会随当前停点的变量、说明或图内容自然增长，字幕随之仍保持在画面下方，不以固定高度裁切必要文字。
- 关注与本步变化分开表达：B05 用变量 `changed` 与可见“本步变化”文字；B06 用当前字段/本步变化文字徽标；B07 只关注当前节点，不把“完成”滥用成变化；B08 用当前行；B09 无步进；B10 把 `focus` 与 `changed` 分别交给 Chart。
- 没有自动轮播、自动前进、自动闪烁或装饰性计时器。`replay()` 仅重新渲染当前停点，不伪造动画；Chart 始终以 `animate:false` 挂载。
- 程序 `update()` 改变数据时保持当前索引（超出范围时按 StepPlayer 规则夹紧）；只有输入显式要求（如 B05 `current`、B08 `current`）才程序跳转。

## 3. B05 NoteBlocks.CodeTrace

<a id="B05"></a>
### 3.1 用法与数据

```js
var trace = NoteBlocks.CodeTrace.mount(host, {
  code: 'let x = 1;\nreturn x;',
  language: 'javascript',
  title: '代码与变量',
  steps: [{
    id: 's1',
    caption: '初始停点：只显示预置快照。',
    highlight: { start: 1, end: 2 },       // 1 起始；也支持 '2'、[2,3]
    variables: [
      { name: 'x', label: '变量 x', value: 1, changed: true, unit: '' }
    ],
    explanation: '代码不会执行。'
  }],
  current: 0,
  labels: { prev: '上一步', next: '下一步', replay: '重看', reset: '重来' },
  onStep: function (index, step, event) {},
  maxWidth: '64rem',
  label: '代码跟踪'
});
```

| option | 类型 | 说明 |
| --- | --- | --- |
| `code` | string | 只读预置代码文本；换行保留。 |
| `language` | string | CodeBlock 语言标签。 |
| `title` | string | 舞台标题。 |
| `steps` | array | `{id,caption,highlight,variables,explanation?,label?}`；变量为 `{name,label,value,changed?,unit?}`。 |
| `current` | number \| string | 初始索引或停点 id；程序更新时显式传 `current` 可跳转，且不触发 `onStep`。 |
| `labels` | object | 透传 StepPlayer 控件文案。 |
| `onStep` | function | 仅用户操作触发：`onStep(index, step, event)`。 |
| `maxWidth` / `label` | string | 舞台最大宽度与可访问名称。 |

### 3.2 实例与 getTarget

```js
trace.el
trace.go(index); trace.next(); trace.prev(); trace.replay(); trace.reset();
trace.getStep();          // 当前宿主停点对象，无停点返回 null
trace.getTarget('code');  // 当前 CodeBlock 根
trace.getTarget('var:x'); // 当前停点的变量卡
trace.getTarget('s1');    // 仅当 s1 是当前停点，返回本停点内容区
trace.update(patch); trace.destroy();
```

- 变量 `name` 在当前停点内应唯一；重复时 `var:` 目标指向最后渲染的同名卡。
- 非当前停点 ID、找不到的变量、不存在的对象返回 `null`。
- `update({code|language|steps|current|labels|onStep|maxWidth|label})` 不会触发 `onStep`；`current` 可给索引或当前新停点组中的 step id。
- 只改 `title`/`maxWidth`/`label` 等展示项不会重建当前停点画面；改 `code`/`language`/`steps`（或显式 `current`）才重绘当前停点。
- 代码和变量在同一个视觉分组中；字幕由 StepPlayer 固定在下方。变量 `changed` 同时产生文字徽标与 DataObject 的变化样式，不只靠颜色。

### 3.3 组合与限制

- `NoteUI.CodeBlock` 负责代码行号、范围强调、复制和滚动；`NoteUI.DataObject` 显示变量；`Badge/Notice` 显示本步变化与补充说明。
- 代码只作为纯文本渲染，**绝不执行**；数据完全由宿主在每个停点提供，组件不做 diff。
- 窄容器下代码与变量改为上下布局，代码块和变量列表可局部滚动。
- 键盘：StepPlayer 的按钮与跳转下拉、CodeBlock 的复制按钮及代码滚动区均可聚焦；不劫持整页快捷键。

## 4. B06 NoteBlocks.FrameFields

<a id="B06"></a>
### 4.1 用法与数据

```js
var fields = NoteBlocks.FrameFields.mount(host, {
  items: ['1', '0', '1', '1'],
  fields: [
    { id: 'mode', label: '模式', start: 0, end: 1, note: '宿主说明。' },
    { id: 'count', label: '计数', start: 2, end: 3, unit: '次', value: 9 }
  ],
  focusField: 'mode',
  bitOrder: 'msb',
  changed: ['count'],
  caption: '字段名称与顺序由宿主给出。',
  label: '位串字段',
  onSelect: function (id, event) {}
});
```

| option | 类型 | 说明 |
| --- | --- | --- |
| `items` | array | 位串单元。字符串项或 `{id,label,value}`；稳定 ID 推荐由宿主提供。 |
| `fields` | array | `{id,label,start,end,note?,unit?,value?}`，`start/end` 为 items 的**零基闭区间**。 |
| `focusField` | id \| null | 初始关注字段。 |
| `bitOrder` | `'msb'\|'lsb'` | 计算值的位序；未知值回退 MSB。 |
| `changed` | id \| id[] | 宿主声明的变化字段，不自动做 diff。 |
| `caption` | string \| Node | 显示为正常阅读路径中的 `Notice`。 |
| `label` | string | 组合根可访问名称。 |
| `onSelect` | function | `onSelect(fieldId, event)`；用户点击或按 Enter/Space 激活、程序 `focusField` 默认通知，可 `{silent:true}` 抑制。键盘 Tab 聚焦字段只静默同步选中与 Sequence 关注，不触发 `onSelect`。 |

### 4.2 字段值计算（通用算法）

1. 若字段对象**拥有** `value` 属性且值不是 `undefined`，直接使用宿主值，单位只用于显示。
2. 否则取 items 中 `start…end` 的闭区间位值。只有每一位的字符串表示严格为 `'0'` 或 `'1'` 才计算；含空值或多字符值则显示 `—`，不猜协议含义。
3. 计算结果是无符号整数：
   - `bitOrder:'msb'`：最小索引在字段内权重最高（自然二进制串顺序）。
   - `bitOrder:'lsb'`：最小索引权重最低（等价于反序后作为二进制串）。
   - 支持超过 53 位的宽度：优先用 `BigInt`，不可用时退回 `parseInt`。
4. 例：位串 `1010`，`msb` 得 `10`，`lsb` 得 `5`。

`bitOrder` 只改变派生显示值，不重排 `items`、不改变字段范围，也不内置端序检测。

### 4.3 实例、同步与 getTarget

```js
fields.el
fields.focusField('count', { silent: true }); // 默认通知；silent 抑制 onSelect
fields.getSelected();                          // 字段 id 或 null
fields.getTarget('sequence');                  // Sequence 根
fields.getTarget('count');                     // 字段行（字段 id 优先）
fields.getTarget('bit-4');                     // 未匹配字段时尝试 Sequence 单元
fields.update(patch); fields.destroy();
```

- 点击字段行或按 `Enter`/`Space` 激活字段按钮会选择该字段并通知 `onSelect`；仅用键盘 Tab 让字段按钮获得焦点时，会**静默**同步当前字段与 Sequence 关注，不触发 `onSelect`。两种情况都会让变化字段范围同步为 Sequence `changed`。
- 当前字段与本步变化使用文本徽标“当前字段”“本步变化”“当前字段 · 本步变化”，同时兼具时合成一个徽标，不机械叠加。
- 程序 `update()` 静默；`focusField()` 默认在选中改变时通知，适合显式交互。点击或 Enter/Space 的用户激活会通知；仅聚焦不通知。
- 字段行使用原生按钮与整行点击；字段列表和位串序列各自有局部滚动，窄容器下字段行堆叠。
- `getTarget` 字段 id 优先于同名 sequence 单元。字段范围重叠时 Sequence 分组按第一个覆盖该位的字段归类（基础组件的分组规则），组件文档明确这一限制。
- 不解释字段含义；不写死 PPP 字段名、位序或单位。

## 5. B07 NoteBlocks.ProcessFlow

<a id="B07"></a>
### 5.1 用法与数据

```js
var flow = NoteBlocks.ProcessFlow.mount(host, {
  nodes: [{ id: 'a', label: '接收' }, { id: 'b', label: '处理' }],
  edges: [{ id: 'ab', from: 'a', to: 'b', label: '进入', directed: true }],
  steps: [
    { id: 's1', caption: '从接收开始。', nodeId: 'a' },
    { id: 's2', caption: '沿进入边到处理。', nodeId: 'b', edgeIds: ['ab'] }
  ],
  title: '流程',
  labels: { prev: '上一步', next: '下一步' },
  onStep: function (index, step, event) {},
  maxWidth: '64rem',
  label: '流程演示'
});
```

`nodes/edges` 形状遵循 NoteViz.Graph；手写坐标时节点可带 `x/y`，全部节点都有有限坐标才使用 `manual` 布局，否则使用 `layered`。`steps` 使用 `{id,caption,nodeId,edgeIds?,note?,label?}`。

### 5.2 实例与当前边处理

```js
flow.el
flow.go(index); flow.next(); flow.prev(); flow.replay(); flow.reset();
flow.getStep();                 // 当前宿主停点
flow.getTarget('b');            // 当前 Graph 中节点 b 的 SVG g
flow.getTarget('edge:ab');      // 当前本步关系条里的边卡
flow.getTarget('ab');           // 同上（无 node/step 冲突时）
flow.getTarget('s2');           // 当前停点的进度区元素；非当前 step id 返回 null
flow.update(patch); flow.destroy();
```

- 当前节点使用 `NoteViz.Graph` 的公开 `focus`，图中以虚线关注与状态文字呈现；已完成/当前/未到达由 `NoteUI.Steps` 的公开状态表达。
- **接口缺口**：冻结的 Graph API 只有节点 `focus/changed` 和节点 `getTarget`，没有边关注、边 target 或边 ID 接口。本块不修改 Graph、不查询其内部 SVG；当前边改为在图下“本步关系”区以“当前边”文字、起止节点和边标签突出。图中所有边仍可读，但没有直接边样式强调。该限制已在 manifest 与交付报告中标明。
- `edgeIds` 解析顺序：边的 `id`（宿主可在 Graph 边对象上附加）、`from -> to` 字符串、edges 数组索引；无 id 的平行同向边暴露为 `from -> to` 与 `from -> to #n`。找不到的引用显示可见警告。
- 只改 `title`/`maxWidth` 等展示项不重建当前图；改 `nodes`/`edges`/`steps`/`label` 才重建当前停点画面。
- 不把已完成节点写成 `changed`；关注和变化语义保持分开。无自动串播，`go/next/prev/update` 不触发 `onStep`。
- 图内滚动和标签由 Graph 提供；本块不扩展成流程编辑器，也不做拖拽/自动避障。

## 6. B08 NoteBlocks.SequenceDiagram

<a id="B08"></a>
### 6.1 用法与数据

```js
var sd = NoteBlocks.SequenceDiagram.mount(host, {
  participants: [
    { id: 'client', label: '客户端' },
    { id: 'server', label: '服务端', note: '可选参与者说明' }
  ],
  messages: [
    { id: 'm1', from: 'client', to: 'server', label: '提交请求', type: 'sync', note: '请求进入服务端。' },
    { id: 'm2', from: 'server', to: 'client', label: '返回结果', type: 'return' }
  ],
  current: 0,
  title: '消息时序',
  caption: '整体上下文说明；当前消息解释在图下字幕。',
  label: '时序图',
  maxWidth: '64rem'
});
```

- `participants`：`{id,label,note?}`，id 唯一。
- `messages`：`{id,from,to,label,type:'sync'|'async'|'return',note?}`；from/to 必须引用参与者，未知端点会被跳过并显示警告。
- `current`：索引、消息 id 或 `{id}`/`{index}`。
- `caption`：显示在图上的稳定上下文；当前消息解释（含类型、方向与 note）由 StepPlayer 放在图下字幕。
- 消息按数组顺序自上而下排列；`type` 同时用线型、箭头形态和文字表示：同步实线/实心箭头、异步虚线、返回点线/开口箭头。颜色不是唯一通道。
- 本块内部用 StepPlayer 管理停点，不另造自动播放器。

### 6.2 实例、状态与 getTarget

```js
sd.el
sd.go(index); sd.next(); sd.prev(); sd.replay(); sd.reset();
sd.getStep();    // 当前规范化消息对象（含 fromLabel/toLabel/typeLabel/raw 等）
sd.getState();   // { index, total, message, caption }，无消息返回 null
sd.getTarget('m1');        // 消息 SVG g（所有消息均渲染，包含非当前消息）
sd.getTarget('server');    // 参与者头部 SVG g
sd.update(patch); sd.destroy();
```

- 消息 id 优先于同名参与者 id；重复消息 id 时 `getTarget` 返回最后渲染的同 id 消息。
- 参与者多时画布保持最小可读宽度，由视口横向局部滚动；当前消息行在重绘后会滚入视口；视口有最大高度，可纵向滚动。
- 长消息/参与者标签最多显示两行并可能以省略号收束；完整消息在 SVG `<title>` 与当前字幕中，完整参与者文本在 `<title>` 中。
- `update({participants,messages,current,title,caption,label,maxWidth})` 不触发任何宿主回调（本块无 `onStep`）。消息、当前行、字幕和 getTarget 映射同步重建。
- 无自动播放；重看/重来使用 StepPlayer 的公开行为，不产生自造动画。
- 不是通用图编辑器：不做拖拽、缩放、任意图语法解析或复杂避障。

## 7. B09 NoteBlocks.HierarchyDetail

<a id="B09"></a>
### 7.1 用法与数据

```js
var hd = NoteBlocks.HierarchyDetail.mount(host, {
  nodes: [{
    id: 'guide', label: '指南', children: [
      { id: 'start', label: '开始' }
    ]
  }],
  selected: 'start',
  details: {
    start: {
      title: '开始',
      fields: [{ label: '状态', value: '示例' }],
      content: '宿主提供的正文；可为字符串或 DOM 节点。',
      note: '可选说明。'
    }
  },
  labels: {
    block: '层级与详情', tree: '目录', detail: '详情',
    empty: '请选择条目。', noDetail: '暂无详情。',
    fields: '字段', note: '说明'
  },
  onSelect: function (id, event) {}
});
```

`nodes` 遵循 TreeView；`details` 是按节点 id 索引的映射。字段可为数组（`{label,name,key,value,unit,caption,note,attention,changed}` 的常见组合）或键值对象。`content` 为字符串时按纯文本插入，为 DOM 时节点被移入（不克隆）。

### 7.2 实例、选择与 getTarget

```js
hd.el
hd.select('start', { silent: true }); // 默认通知 onSelect；silent 抑制
hd.getSelected();                     // id 或 null
hd.getTarget('start');                // TreeView 的 treeitem
hd.getTarget('detail');               // 详情 Panel 根（保留 id）
hd.update(patch); hd.destroy();
```

- 用户选择由 TreeView 的 `onSelect(selected,event)` 接收；程序 `select` 默认通知宿主（传 `{silent:true}` 抑制）。`update()` 的 `selected`、`nodes`、`details`、`labels` 更新均不触发 `onSelect`。
- 初始选择和程序选择会自动展开祖先路径，并把选中项滚入树的局部滚动区；不展开选中节点自身。
- 更换 `details` 不重建 TreeView，选中项和树定位保持不变；更换 `nodes` 后仍存在的选中项也会保留并重新定位。
- 详情标题、字段、正文与说明都在正常阅读路径中，详情区独立局部滚动；窄容器下目录与详情上下布局。目录树不冒充机制关系图。
- 节点 id 为 `'detail'` 时无法通过本块 `getTarget` 取到树项，因为 `'detail'` 是详情 Panel 保留键。
- 不提供异步加载、多选、搜索或拖拽。

## 8. B10 NoteBlocks.ChartExplain

<a id="B10"></a>
### 8.1 用法与数据

```js
var explain = NoteBlocks.ChartExplain.mount(host, {
  chart: {
    type: 'bar',
    data: [{ label: 'A', value: 3 }, { label: 'B', value: 7 }],
    labels: null,                 // chart.labels 是类别标签，不是本块控制器文案
    series: null,
    height: 300,
    valueFormat: function (value) { return value + ' 次'; },
    table: true
  },
  steps: [
    { id: 'all', caption: '先看整体。', focus: { index: 0 } },
    { id: 'b', caption: '关注 B。', focus: { index: 1 }, changed: null }
  ],
  title: '图表讲解',
  labels: { next: '下一步', prev: '上一步' },
  onStep: function (index, step, event) {},
  maxWidth: '64rem',
  label: '图表讲解'
});
```

- `chart` 形状遵循 NoteViz.Chart；`table` 未提供时本块默认 `true`（显式 `false` 才关闭），让数据表可发现。`valueFormat` 必须是宿主函数。
- `steps` 的 `focus`/`changed` 原样交给 Chart，分别表达“当前关注”与“本步变化”；`caption` 是唯一图下字幕。`note` 可选，显示为图下 Notice。
- 数据在停点之间保持不变；每个停点只改变图表标记与字幕，不同时改多个数值，不做趋势/完成率推断。
- 每次停点按同一数据重新挂载 Chart（`animate:false`），所以在停点切换时数据表的展开状态会复位为关闭；这是明确限制，不影响数据表可读性。

### 8.2 实例与 getTarget

```js
explain.el
explain.go(index); explain.next(); explain.prev(); explain.replay(); explain.reset();
explain.getStep();
explain.getTarget('chart');     // 当前 Chart 根
explain.getTarget('point:1');   // 透传当前 Chart 的公开 target
explain.getTarget('series:main');
explain.update(patch); explain.destroy();
```

- 当前停点 id 优先返回当前 Chart 根；`'chart'` 同样返回 Chart 根；其他键原样传给 Chart `getTarget`（如 `point:<index>`、`series:<key>`、`slice:<index>`）。Chart 更新后请重新调用。
- `update({chart})` **整体替换** chart 配置，不合并旧 data/series；`update({steps})` 保留当前索引并夹紧到新范围；程序更新不触发 `onStep`。
- 只改 `title`/`maxWidth`/`label` 等展示项不重建当前图；改 `chart`/`steps` 才重建图表与数据表。
- 窄容器由 Chart 自身响应式处理，数据表在自身区域滚动；本块不复制图表内部实现。

## 9. 键盘与可访问性汇总

| 块 | 键盘入口 |
| --- | --- |
| B05 | StepPlayer 的上一步/下一步/跳转/重看/重来；CodeBlock 的复制按钮、代码滚动区；原生焦点环。 |
| B06 | 字段按钮 Tab 聚焦会静默同步字段关注；Enter/Space 或点击选择并通知；字段列表滚动区可聚焦；位串滚动区可聚焦并支持组件内建滚动键。 |
| B07 | StepPlayer 控件；Graph 滚动区；Steps 静态指示不强制可点击。 |
| B08 | StepPlayer 控件；时序图视口可聚焦并滚动；图中不放拖拽控件。 |
| B09 | TreeView 的 Tab/方向键/Home/End/Enter/Space；详情滚动区可聚焦；Panel 内标题与正文为正常阅读内容。 |
| B10 | StepPlayer 控件；Chart 数据表 `<summary>` 与横向滚动区；Chart 标记不依赖键盘才能理解。 |

- 所有新增交互使用原生按钮或基础组件提供的键盘行为；组合块不接管整页键盘。
- 变化/关注/当前状态同时有文字或形状提示，不以颜色作为唯一手段。
- 减少动效时不创建自造动画；Chart 强制 `animate:false`，其他组件按基础组件和 `prefers-reduced-motion` 处理。
- 所有数据表、说明、字段标签和字幕都在正常阅读路径中；不把必要说明藏在悬停里。

## 10. 已知限制与接口缺口

1. **B07 边强调缺口**：NoteViz.Graph 冻结 API 没有边的 focus/changed/getTarget。当前边只能以图下关系条文字强调；没有修改 Graph 内部。若后续需要直接边样式，应先扩展 Graph 公开契约，而不是在 B07 私有实现。
2. **B08 范围**：有限时序图，不是通用图编辑器；长标签两行后截断；完整文本在 title/字幕；消息 ID 应唯一。
3. **B10 数据表状态**：停点切换重新挂载 Chart，数据表展开状态不保留；数据本身保持一致。
4. **B06 位序是通用显示算法**：不内置端序检测、不解释协议；重叠字段的 Sequence 分组采用基础组件“第一个分组覆盖”的行为。
5. **B09 内容节点**：DOM 内容会被移入详情面板而非克隆；销毁不负责把宿主节点恢复到原位置。
6. 组合块不检测代码语义、不自动识别变量变化、不校验流程合法性、不生成业务结论。
7. 组合块的公开入口、Manifest 文档锚点与页面示例各自维护；API 细节以对应源码与本文条目为准，不以旧阶段记录代替。

## 11. 最小用法

```js
// B05
NoteBlocks.CodeTrace.mount(host, {
  code: 'const n = 1;', steps: [{ id: 's', caption: '初始状态', highlight: 1,
    variables: [{ name: 'n', value: 1, changed: true }] }]
});

// B06
NoteBlocks.FrameFields.mount(host, {
  items: ['1','0','1','1'], focusField: 'mode',
  fields: [{ id: 'mode', label: '模式', start: 0, end: 1 },
           { id: 'count', label: '计数', start: 2, end: 3 }]
});

// B07
NoteBlocks.ProcessFlow.mount(host, {
  nodes: [{ id: 'a', label: '起点' }, { id: 'b', label: '终点' }],
  edges: [{ from: 'a', to: 'b', label: '进入', directed: true }],
  steps: [{ id: 's1', caption: '从起点开始', nodeId: 'a' },
          { id: 's2', caption: '沿边到终点', nodeId: 'b' }]
});

// B08
NoteBlocks.SequenceDiagram.mount(host, {
  participants: [{ id: 'a', label: '发送方' }, { id: 'b', label: '接收方' }],
  messages: [{ id: 'm1', from: 'a', to: 'b', label: '消息', type: 'sync' }]
});

// B09
NoteBlocks.HierarchyDetail.mount(host, {
  nodes: [{ id: 'root', label: '目录', children: [{ id: 'child', label: '条目' }] }],
  selected: 'child',
  details: { child: { title: '条目', content: '宿主提供的详情。' } }
});

// B10
NoteBlocks.ChartExplain.mount(host, {
  chart: { type: 'bar', data: [{ label: 'A', value: 1 }], table: true },
  steps: [{ id: 's1', caption: '看唯一的数据点。', focus: { index: 0 } }]
});
```
## 13. 可运行检查线索

- 演示函数：`window.NoteGalleryDemos['B05']` … `['B10']`，位于 `gallery/demos/blocks-explain.js`。
- 清单与文档锚点：`src/manifests/blocks-explain.json`；构建分发为 `dist/modules/blocks.js|css`（由脚本生成，不手改）。
- 检查脚本在 `tests/checks/blocks-explain-*`（真实 Edge / Playwright）；截图、结果 JSON 与临时副本写入 `tests/.cache/`，打包已排除。
