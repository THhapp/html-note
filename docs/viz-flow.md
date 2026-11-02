# 流程与连接图形（D07–D10）

`viz-flow` 是独立分发模块，提供四种互不依赖的静态图形：阶段轨、消息流、分段长度条、设备连接。它们各自 `mount` 到宿主容器，由宿主提供数据、状态和显现进度；不内置课程规则、自动播放器、计时器或第三方库。加载依赖只有 `core`（tokens 与可选的 `NoteCore.component` 生命周期），不依赖其他 `NoteViz` 组件。

## 1. 加载

整库：

```html
<link rel="stylesheet" href="./dist/note-library.css">
<script src="./dist/note-library.js"></script>
```

按模块（core 先加载）：

```html
<link rel="stylesheet" href="./dist/modules/core.css">
<link rel="stylesheet" href="./dist/modules/viz-flow.css">
<script src="./dist/modules/core.js"></script>
<script src="./dist/modules/viz-flow.js"></script>
```

模块内文件按 `flow-core.js` → `flow-stage.js` → `flow-packet.js` → `flow-segment.js` → `flow-device.js` → `flow.js` 的顺序加载，CSS 为 `flow.css`；`flow.js` 是公开入口，前五个是内部实现文件。源码直载时先加载 `src/core`，再按上述顺序加载 `src/viz/*`；`flow.js` 在没有 `NoteCore.component` 时使用内部等价的生命周期实现。构建顺序中 `viz-flow` 位于 `viz-objects` 之后、`viz-mechanisms` 之前。

## 2. 共同契约

四种图形都返回同一实例形态：

```js
var view = NoteViz.Flow.StageTrack.mount(host, options);
view.el;                 // 根元素
view.update(patch);      // 按稳定 id 合并宿主数据
view.destroy();          // 移除根元素与内部引用，可重复调用
view.getTarget(id);      // 返回 Element 或 null
```

- `update(patch)` 是浅合并：只更新传入的顶层字段，数组字段整体替换；内部按 `id` 复用已有 DOM，不重建全部节点。
- 输入对象缺 `id` 时按顺序生成稳定占位（`stage-1`、`participant-1`、`message-1`、`segment-1`、`range-1`、`device-1`、`port-1`、`link-1`）；宿主应给出真实稳定 ID。
- 同一次输入中重复的 id 会渲染多个节点，`getTarget` 返回最后渲染的同 id 对象；这是与现有 NoteViz 一致的保留语义，不应依赖重复 id。
- `getTarget` 返回当前 DOM 节点；`destroy()` 之后返回 `null`。更新后的目标查询仍指向同一逻辑对象。
- 所有用户文本通过 `textContent` 写入，不解析 HTML；不访问网络、不执行 `eval`、不做自动播放。
- SVG 默认带 `<title>`/`<desc>` 与 `role="img"`；根容器有可访问名称。图形本身不添加可聚焦控件，交互和阶段推进由宿主组织。

<a id="D07"></a>

## 3. D07 NoteViz.Flow.StageTrack（阶段轨）

```js
var track = NoteViz.Flow.StageTrack.mount(host, {
  stages: [
    { id: 's1', label: '准备' },
    { id: 's2', label: '校验', status: 'skipped' },
    { id: 's3', label: '执行' },
    { id: 's4', label: '确认' }
  ],
  current: 's3',
  target: 's4',
  failed: [],
  bypass: [{ from: 's2', to: 's4', label: '显式旁路' }],
  label: '阶段轨'
});
```

**选项**

| 键 | 说明 |
| --- | --- |
| `stages` | `Array<{id,label?,status?}>`；状态由宿主给出。 |
| `current` | 当前阶段 id；决定 `current` 以及其前/后的默认派生状态。 |
| `target` | 显式目标阶段 id；仅增加 `data-target="true"` 与“目标”徽标，不改变顺序或状态。 |
| `skipped` / `failed` | 阶段 id 或 id 数组；用于显式跳过/失败。 |
| `bypass` | `Array<{from,to,label?}>`；只画宿主声明的阶段旁路，两个端点都必须是已有阶段。 |
| `statusLabels` | 覆盖状态文案对象，例如 `{ current: '进行中' }`。 |
| `density` | `'normal'`（默认）或 `'compact'`；compact 缩小上下 padding 与阶段间距，圆点/连接线/徽标仍使用同一套同源几何。 |
| `label` | 根容器可访问名称，默认“阶段轨”。 |

状态：`pending | current | done | skipped | failed`。阶段自带 `status` 优先；否则 `failed`/`skipped` 集合优先，`current` 为当前阶段，当前阶段之前默认 `done`，之后默认 `pending`。状态写成 `data-status`；当前阶段同时有 `aria-current="step"`。

圆点、连接线与文本槽使用同源 CSS 几何：节点尺寸、节点边框、阶段上下 padding 与连接线高度由 `--nviz-flow-stagetrack-*` 变量提供，连接线 top 为 `padding-top + node-size/2 - line-height/2`，因此圆点圆心与连接线中心始终对齐。目标徽标槽常驻：未命中目标时 `data-empty="true"` 且不可见，但仍占位；阶段标签/状态换行、容器宽度变化时行高与徽标位置保持对齐。旁路端点按已声明阶段数量与 `from`/`to` 计算，只画作者显式声明的端点。

`density:'compact'` 只压缩阶段上下 padding 与阶段间距，圆点尺寸/边框、连接线与徽标槽仍按同一套变量推导；切换到 compact 后仍保持圆点圆心=连接线中心，但轨道整体高度变小，宿主应在密度变化后重新量测同屏位置。

`getTarget(id)`：阶段 id 返回对应 `<li>`；`bypass:<from>><to>`（如 `bypass:s2>s4`）返回旁路行；`track` 返回阶段列表容器；`bypasses` 返回旁路容器。未知阶段端点的旁路会被跳过，并在图下提示跳过数量；旁路不自动推断分支剧情。

**更新与限制**：`update({ current, target, skipped, failed })` 只改状态；`update({ stages })` 按 id 复用阶段节点，仅新增/移除变化项。组件不提供播放按钮、计时器、阶段内容面板，也不自动根据步骤推进推断完成/跳过。

`getState()` 返回 `{ stages:[{id,label,status,target}], current, target, skipped, failed, bypass:[{id,from,to,label}], ... }` 的规范化快照；状态为派生后的实际值，`bypass` 的 `id` 形如 `bypass:<from>><to>`。

<a id="D08"></a>

## 4. D08 NoteViz.Flow.PacketFlow（消息流图）

```js
var flow = NoteViz.Flow.PacketFlow.mount(host, {
  participants: [
    { id: 'client', label: '客户端' },
    { id: 'server', label: '服务端' }
  ],
  messages: [
    { id: 'req', from: 'client', to: 'server', label: '请求', type: 'sync' },
    { id: 'ack', from: 'server', to: 'client', label: '应答', type: 'return' }
  ],
  visibleCount: 1,
  focus: 'req',
  showIndexes: true
});
```

**选项**

| 键 | 说明 |
| --- | --- |
| `participants` | `Array<{id,label?,note?,status?}>`；顺序决定水平排布，也决定消息方向。`note` 作为参与者补充说明进入可读文本。 |
| `messages` | `Array<{id,from,to,label?,note?,type?,dashed?,status?}>`；`from`/`to` 必须是已有参与者 id。`type` 为 `sync`（默认，实线+实心箭头）、`async`（虚线）或 `return`（点线+开口箭头）；`dashed` 布尔可覆盖线型。自连接（同一参与者）画固定回环。 |
| `revealed` | 需要显示的消息 id 数组；设置时优先于 `visibleCount`。 |
| `visibleCount` | 按消息顺序显示前 N 条；取整并夹紧到 `0..messages.length`。 |
| `focus` | 当前关注的消息 id，写入 `data-focus="true"` 并显示焦点带；不是显现开关。 |
| `showIndexes` | 布尔，默认 `false`；为 `true` 时在每条消息前显示序号。 |
| `layoutCount` | 可选整数，覆盖消息流布局行数；实际取 `max(1, validMessages.length, floor(layoutCount))`。用于预留额外行，不会少于完整已知消息数。 |
| `density` | `'normal'`（默认）或 `'compact'`；compact 使用更紧的内部 SVG 几何，viewBox/height 随配置真实改变。 |
| `label` | 根容器可访问名称，默认“消息流”。 |

`density:'compact'` 的内部几何：参与者盒 `y=8、height=52`，label/note 基线 `26/43`，生命线顶 `66`，`messageTop=88`、`step=48`、底部留白 `14`；默认 normal 仍为 `y=14、height=64`、label/note `34/52`、生命线顶 `82`、`messageTop=116`、`step=56`、底部 `20`。compact 下 `viewBox`/height 真实变小，但 `layoutCount` 仍按完整 valid 消息集合计算，显现只改 `data-hidden`。

消息方向由参与者顺序与 `from`/`to` 决定，写成 `data-direction="left|right|self"`，箭头指向 `to`；消息的 `data-target` 是目标参与者 id，另有 `data-type` 与 `data-dashed` 供样式和检查读取。未显现的消息保留节点并标记 `data-hidden="true"`，以便宿主逐步揭示；组件本身不创建计时器、自动下一帧或播放循环。长标签最多两行，完整文本进入 SVG `<title>` 与可访问名称。

`getTarget(id)`：`svg` 返回 SVG，`viewport` 返回可聚焦/可滚动视口；消息优先匹配纯 id，其次参与者；也可用 `message:<id>`、`participant:<id>` 显式指定。引用未知参与者的消息会被跳过并在图下提示数量。

`getState()` 返回 `{ participants, messages, revealed, visibleCount, focus, current }` 快照：消息含 `id/from/to/label/note/type/dashed/status/revealed`，`revealed` 是当前显示的消息 id 数组，`visibleCount` 等于其数量，`current` 是 `focus` 对应的规范化消息或 `null`；销毁后返回 `null`。

**更新与限制**：`update({ participants, messages, visibleCount, revealed, focus, showIndexes, layoutCount })` 按 id 复用参与者和消息节点。布局按完整已知的 `validMessages` 分配：`viewBox` 高度、生命线长度与消息行范围由 `layoutCount`（缺省为完整 valid 消息数）决定，`visibleCount`/`revealed` 只控制 `data-hidden`，不改变坐标、行距或画布高度；因此同数据/布局下逐步显现不会重排，初始也可能先占满已知消息范围。`layoutCount` 可在作者需要额外预留行时覆盖，但不会小于完整 valid 消息数。消息过多时在局部视口滚动，不做自动避让、协议语义或复杂序列图排版。B08 `NoteBlocks.SequenceDiagram` 与 flow-kit 用法不变：B08 传完整消息集合并用 `visibleCount`/`current` 控制显现，flow-kit 仍由宿主按钮推进 `visibleCount`。

<a id="D09"></a>

## 5. D09 NoteViz.Flow.SegmentBar（分段长度条）

```js
var bar = NoteViz.Flow.SegmentBar.mount(host, {
  segments: [
    { id: 'head', label: '首部', value: 14 },
    { id: 'data', label: '数据', value: 1500 },
    { id: 'tail', label: '尾部', value: 4 }
  ],
  scaleMax: 1518,
  minWidth: 14,
  ranges: [{ id: 'payload', label: '数据字段', start: 'data', end: 'tail' }]
});
```

**选项**

| 键 | 说明 |
| --- | --- |
| `segments` | `Array<{id,label?,value,color?}>`；`value` 为真实非负数值，直接显示在段内。 |
| `scaleMax` | 显示尺度；缺省取“所有段之和、单段最大值、1”三者中的最大者。 |
| `minWidth` | 最小可读宽度（SVG 用户单位），实际取 `max(2, ...)`，默认 14。 |
| `ranges` | `Array<{id,label?,start,end}>`；`start`/`end` 可以是段 id 或段下标，画在段条下方的范围括线。 |
| `label` | 根容器可访问名称，默认“段条”。 |

真实值、显示尺度和最小可读宽度分开：

- 段内文字显示真实 `value`；`data-real-value` 保存真实值，`data-ratio` 保存 `value / scaleMax`。
- `value === 0` 时仍显示最小宽度标记，`data-zero="true"`，真实值与比例保持 0。
- 正值但按比例算出的宽度小于 `minWidth` 时，显示宽度提升到最小值并标记 `data-clamped="true"`；这不改变真实值。
- 值超过 `scaleMax` 时按真实比例显示，可能超出基准轨道；SVG 视口会随内容扩展。
- 范围只接受已存在的段边界；无效引用跳过并提示数量。空 `segments` 显示空态文案。

`getTarget(id)`：段 id 返回段节点；`label:<segmentId>` 返回该段的标签元素；`range:<rangeId>` 或范围 id 返回范围节点；`track` 返回轨道层。范围不是 `NoteExpr.Range` 的替代，不提供多层括线自动避让。

**更新与限制**：`update({ segments, ranges, scaleMax, minWidth })` 按 id 复用段和范围节点，可插入/移除字段。最小可读宽度会让显示长度偏离严格比例；组件不计算协议字段、填充量或帧长，数值与单位说明由宿主提供。

`getState()` 返回 `{ segments:[{id,label,value,ratio,displayWidth,zero,clamped}], ranges, scaleMax, minWidth, label }` 快照：`value` 是真实值，`displayWidth` 是含最小可读宽度后的显示宽度，`zero`/`clamped` 分别表示零长度和被最小值托起。

<a id="D10"></a>

## 6. D10 NoteViz.Flow.DeviceLinks（设备连接图）

```js
var links = NoteViz.Flow.DeviceLinks.mount(host, {
  devices: [
    { id: 'a', label: '设备 A', ports: [{ id: 'out', label: 'OUT' }] },
    { id: 'b', label: '设备 B', ports: [{ id: 'in', label: 'IN' }] }
  ],
  links: [
    { id: 'ab', from: { device: 'a', port: 'out' }, to: { device: 'b', port: 'in' }, status: 'active' }
  ]
});
```

**选项**

| 键 | 说明 |
| --- | --- |
| `devices` | `Array<{id,label?,status?,ports:[{id,label?}]}>`；端口在设备底部按顺序等距排布。 |
| `links` | `Array<{id,from:{device,port},to:{device,port},label?,status?}>`；`from`/`to` 也接受 `deviceId`/`portId` 别名。 |
| `label` | 根容器可访问名称，默认“设备连接”。 |

连接只接受已存在的设备与端口；未知端点会被跳过并在图下提示数量。设备按数组顺序水平排布，连接在下方按声明顺序分道绘制。连接渲染为真实 SVG `<path>`（不是 `<line>`），因此可直接查询长度与路径点；同一端口自连接画固定回环。

`getTarget(id)`：`svg` 返回 SVG；`device:<id>`、`port:<deviceId>:<portId>`、`link:<id>` 返回对应节点；纯 id 先匹配设备、再匹配连接。

```js
var path = links.getLinkPath('ab');       // <path> 或 null
var point = links.pointAt('ab', 0.5);     // { x, y, angle, length, total } 或 null
```

- `getLinkPath(id)` 返回该连接的 SVG `<path>`；`id` 可带或不带 `link:` 前缀。
- `pointAt(id, ratio)` 将 `ratio` 夹紧到 `0..1`，按路径真实长度采样；返回 SVG 局部用户坐标 `{x,y}`、切线角度 `angle`（弧度）、已采样长度 `length` 和总长 `total`。未知连接、路径不存在或零长度时返回 `null`。
- 坐标与 SVG `viewBox` 同一空间；需要 DOM client 坐标时由宿主用路径 `getScreenCTM()` 转换。`pointAt` 只提供采样，不创建移动副本、播放器或协议语义。

**更新与限制**：`update({ devices, links })` 按设备/端口/连接 id 复用节点；端口增减后重新排布该设备，连接路径随端点更新。布局是有限的默认排布，不提供通用图编辑、自动避障、自动路由或课程语义；复杂多端口路由可能视觉重叠，需要宿主调整设备/端口顺序。

`getState()` 返回 `{ devices:[{id,label,status,ports}], links:[{id,from,to,label,status,valid}], label }` 快照：`valid` 表示连接端点均存在，无效连接不作为可见目标。

<a id="propagation"></a>

## 7. NoteViz.Flow.Propagation（沿路径传播）

`NoteViz.Flow.Propagation` 是独立图形模块里的公共传播机制，不是播放器：宿主传入 SVG 路径和副本配置，调用 `update(progress)` 显式推进，组件只负责把副本放到路径对应位置。

```js
var runner = NoteViz.Flow.Propagation.mount(svgHost, {
  label: '沿 A→B 传播',
  paths: { ab: someSvgPath },
  copies: [
    { id: 'packet-1', pathId: 'ab' },
    { id: 'packet-2', pathId: 'ab', offset: -0.18 }
  ]
});
runner.update(0.42);
runner.getTarget('packet-1');   // 副本 <g>
runner.getTarget('path:ab');    // 路径元素
runner.getState();              // {progress, start, end, copies:[{id,ratio,x,y,outside}]}
```

**选项**

| 键 | 说明 |
| --- | --- |
| `path` | 单条路径：SVG 元素或 `#id`/CSS 选择器字符串。 |
| `paths` | 路径表 `{id: 路径或选择器}`；副本用 `pathId` 选择。 |
| `copies` | 数字（副本数量）或 `Array<{id?,pathId?,path?,offset?,className?,rotate?}>`；缺省生成 `copy-1`…。 |
| `start` / `end` | 本次推进覆盖的路径区间，默认 0 / 1。 |
| `offset` | 全局偏移，或按副本下标的数组；副本自己的 `offset` 优先。 |
| `rotate` | 是否按路径切线旋转副本，默认 false。 |
| `className` / `label` | 附加到副本的类名 / 容器可访问名称。 |

- `update(progress)` 接受 0–1 数字或 `{progress}`；实际比例 = `start + (end - start) * progress + offset`，夹紧到 0–1 后按路径真实长度取点。区间外仍更新位置但标记 `data-outside="true"`。
- 副本是 `<g class="nviz-flow-propagation__copy">` 内的 `<circle r="5">`，按 id 复用；位置写入 `transform` 与 `data-x/data-y/data-ratio/data-offset/data-path-id`。路径缺失或零长度时标记 `data-missing-path` 并移出视口。
- 宿主是 SVG 元素时直接追加 `<g role="group">`；普通 HTML 宿主会创建 `aria-hidden="true"` 的覆盖 SVG。
- `getTarget(id)`：`group`/`root` 返回容器，`svg` 返回宿主 SVG，`path:<id>` 返回路径，副本 id 返回副本 `<g>`。
- `getState()` 返回 `{progress, start, end, copies:[{id,ratio,x,y,outside}]}`；销毁后返回 `null`。
- `destroy()` 移除容器/覆盖层与内部映射，可重复调用；组件不创建计时器、rAF 或自动播放，推进由宿主负责。

<a id="scene-adapters"></a>

## 8. 公共 scene Adapter

`demo-runtime` 为五种图形提供正式 scene Adapter，均通过 `NoteDemo.sceneAdapter.define` 接入，`sceneModes` 为 `['cut','update']`、默认 `update`；读回优先使用组件 `getState()`。Binding 的 `adapter` 名称与效果组：

| Adapter | 组件 | canonical model | 变化组 |
| --- | --- | --- | --- |
| `table` | NoteUI.Table（C06） | `{columns,rows,sort,emphasis,caption,empty,dense,maxHeight}`；读回为含 row/cell 状态与 `emptyText` 的 canonical 表 | `cell:<row>:<col>`、`row:<row>` |
| `flow-stage` | StageTrack（D07） | `{stages,current,target,skipped,failed,bypass,label}`；读回含派生状态与 bypass id | `stage:<id>`、`bypass:<from>><to>` |
| `flow-packet` | PacketFlow（D08） | `{participants,messages,revealed|visibleCount,focus,showIndexes,label}`；读回保留 type/dashed/self/status/viewport 事实 | `message:<id>`、`participant:<id>` |
| `flow-segment` | SegmentBar（D09） | `{segments,ranges,scaleMax,minWidth,label}`；读回含真实值/显示宽度/zero/clamped | `segment:<id>`、`range:<id>` |
| `flow-device` | DeviceLinks（D10） | `{devices,links,label}`；读回连接含端点身份与 `valid` | `link:<id>`、`device:<id>` |

- 视图只接受可序列化数据；DOM、函数和事件留在 Binding.options。`table` 的 `rowKey/rowState/cellState/onSort/stableStateLabels` 只能在 options 中提供；`table` Adapter 默认 `stableStateLabels:true`，每行常驻隐藏状态标签槽，5 行表约 261→361px 的高度代价与无固定 min-height/不裁切正文的边界见[内容组件](ui-content.md#C06)。
- `table` 的 update 不支持列结构（键/顺序/对齐/sortable）变化和重复行键；需要时改用 cut/reveal 或修正视图。值变化用 cell 来源覆盖局部淡出，新行/行状态用行级提示，不对整表做整体淡入。
- 四个 flow Adapter 按变化对象生成稳定组；减少动效时 commit 直接落目标终态、不创建效果。target query 直接返回组件 `getTarget` 结果，`{part:'root'|'el'|'component'}` 返回根；flow-packet 另有 `{part:'viewport'}`。
- Adapter 不自动推断观察顺序；author 在 `scene.attention.targets[].groups` 中引用上述组名即可局部放行。

<a id="flow-kit-example"></a>

## 9. 中性示例 `examples/flow-kit/index.html`

`examples/flow-kit/` 是四种图形的中性最小演示，不是课程笔记：

- `index.html`：四个独立演示区，分别挂载 `StageTrack`、`PacketFlow`、`SegmentBar`、`DeviceLinks`；设备连接区另挂 `Propagation` 副本；
- `flow-kit.js`：仅保存示例状态、按钮和读取结果，调用各实例的公开 `mount/update/getTarget/pointAt`，并用 `Propagation.update(progress)` 显式推进副本；
- `flow-kit.css`：示例页外壳，不定义组件内部视觉；
- `flow-kit/README.md`：文件职责、打开方式、各图形最小用法与验证说明。

打开方式：直接以 `file://` 打开 `examples/flow-kit/index.html`；页面使用整库 `dist/note-library.css|js` 和本目录演示脚本，无网络请求、无自动播放。示例中的阶段推进、消息显现、字段插入/移除和连接状态切换全部由页面按钮显式触发。

```powershell
node scripts/inspect-note.mjs "D:/Workbench/html-note/examples/flow-kit/index.html" --json
```

该页没有内置 NoteDemo 会话；`inspect-note` 默认的页面错误/控制台错误/外部请求检查即可。需要作品专属量测时再用 `--probe`，probe 复用同一页面。

## 10. 边界与已知限制

- 四个图形彼此独立，不共享控制器；没有统一的时间轴、自动播放、暂停/恢复或动画编排。连续过程、进度和观察顺序由宿主或公共 `NoteDemo` scene 组织。
- 不内置课程规则、协议语义、设备图标、VLAN 颜色或接受/拒绝判断；对象含义、数值、单位和状态文案由作者提供。
- 布局是确定性的基础布局，不承诺自动避障、自动路由、图编辑、缩放/平移或大型图性能。
- `SegmentBar` 的最小可读宽度会有意偏离严格比例；真实值始终保留在 `data-real-value` 与段文字中，作者应在图注中说明显示尺度。
- `DeviceLinks.pointAt` 返回 SVG 局部坐标和弧度角，不是 DOM client 坐标或屏幕像素；宿主做跨坐标系定位时需自行转换。
- 组件的目标查询只覆盖本图形内部节点；公共 scene 接入使用 `table`/`flow-stage`/`flow-packet`/`flow-segment`/`flow-device` Adapter，不要假设组件自带播放器或跨组件对象身份。
- 只在当前桌面 Edge（Chromium）与本库离线 `file://` 环境验证；Firefox/Safari、触屏、打印/RTL 未验证。
