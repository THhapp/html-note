# Flow Kit · 流程与连接图形中性示例

本目录演示独立图形模块 **`viz-flow`**（D07–D10）：阶段轨、消息流、分段长度条、设备连接，以及沿路径传播机制 `NoteViz.Flow.Propagation`。四个图形各自 `mount`，由宿主提供数据、状态、显现进度和按钮操作；传播副本也由宿主调用 `update(progress)` 推进。组件不内置课程规则、自动播放、计时器或第三方库。

完整接口、目标约定与边界见[流程与连接图形](../../docs/viz-flow.md)。本 README 只说明示例文件、打开方式和最小接法。

## 打开

开发入口：

```text
examples/flow-kit/index.html
```

自包含预览（改动源文件后重新生成）：

```powershell
node scripts/build-demo-preview.mjs --template examples/flow-kit/index.html --output dist/图形扩展-中性示例.html
```

直接 `file://` 打开即可，无本地服务、网络请求或运行时构建。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `index.html` | 开发入口，也是单文件预览模板；四个图形各占一个 section。 |
| `flow-kit.js` | 示例数据、四个独立实例、设备连接路径上的传播副本、按钮动作与读数；不含播放器。 |
| `flow-kit.css` | 示例页外壳与卡片排版；不定义组件内部视觉。 |
| `README.md` | 本文件。 |

`viz-flow` 是独立分发模块，构建顺序位于 `viz-objects` 之后、`viz-mechanisms` 之前，依赖只有 `core`。整库加载时 `NoteViz.Flow` 随 `dist/note-library.js|css` 提供；按模块加载时使用 `dist/modules/core.*` + `dist/modules/viz-flow.*`；源码直载时先 `core` 再 `src/viz/flow.js|css`。

## 四个实例

### StageTrack（D07）

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
  bypass: [{ from: 's2', to: 's4', label: '显式旁路' }]
});
track.getTarget('s3');                       // 阶段行
track.getTarget('track');                    // 阶段列表容器
track.getTarget('bypass:s2>s4');             // 旁路行
track.update({ current: 's4', target: null }); // 状态更新，节点按 id 复用
```

状态为 `pending | current | done | skipped | failed`；阶段显式 `status` 优先，否则当前阶段前默认完成、后默认待处理。旁路只画宿主声明的 `from → to`，不推断分支剧情；未知端点会被跳过并提示数量。

### PacketFlow（D08）

```js
var flow = NoteViz.Flow.PacketFlow.mount(host, {
  participants: [
    { id: 'client', label: '客户端' },
    { id: 'server', label: '服务端' }
  ],
  messages: [
    { id: 'req', from: 'client', to: 'server', label: '请求' },
    { id: 'ack', from: 'server', to: 'client', label: '应答' }
  ],
  visibleCount: 1,
  focus: 'req'
});
flow.getTarget('req');                       // 消息组
flow.getTarget('message:req');               // 显式消息目标
flow.getTarget('participant:server');        // 参与者
flow.getTarget('svg');                       // 整张 SVG
flow.update({ visibleCount: 2, focus: 'ack' }); // 逐步显现由宿主显式推进
```

方向由参与者顺序与 `from`/`to` 决定，写成 `data-direction="left|right|self"`；未显现消息保留节点并标 `data-hidden="true"`。`revealed` 优先于 `visibleCount`；布局按完整已知消息范围分配，逐步显现只改 `data-hidden`，不重排坐标/高度。组件不创建自动播放或计时器。

### SegmentBar（D09）

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
bar.getTarget('data');                       // 字段节点
bar.getTarget('label:data');                 // 字段标签
bar.getTarget('range:payload');              // 范围节点
bar.getTarget('track');                      // 轨道层
bar.update({ segments: bar.segments });      // 插入/移除字段后按 id 复用
```

真实值与显示尺度分开：`data-real-value` 是真实值，`data-ratio` 是 `value / scaleMax`；零长度仍显示最小宽度标记但真实值保持 0；`minWidth` 只影响显示宽度，正值的 `data-clamped="true"` 表示显示被最小值托起。

### DeviceLinks（D10）

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
links.getTarget('a');                        // 设备节点
links.getTarget('port:a:out');               // 命名端口
links.getTarget('link:ab');                  // 连接组
var path = links.getLinkPath('ab');          // 连接 <path>
var point = links.pointAt('ab', 0.5);        // {x, y, angle, length, total}，SVG 局部坐标
```

连接是真实 SVG `<path>`，可查询长度与路径点；`pointAt` 将比例夹紧到 0–1，返回弧度角与长度，供宿主做传播采样，不创建移动副本或播放器。未知设备/端口的连接会被跳过并提示数量。

### Propagation（沿路径传播）

DeviceLinks 的示例路径同时挂一个 `NoteViz.Flow.Propagation`：

```js
var runner = NoteViz.Flow.Propagation.mount(deviceLinks.getTarget('svg'), {
  label: '连接传播示例',
  paths: { ab: deviceLinks.getLinkPath('link-ab') },
  copies: [
    { id: 'packet-1', pathId: 'ab' },
    { id: 'packet-2', pathId: 'ab', offset: -0.18 }
  ]
});
runner.update(0.5);                 // 0–1，由宿主显式推进
runner.getTarget('packet-1');       // 副本 <g>
runner.getState();                  // { progress, start, end, copies:[{id,ratio,x,y,outside}] }
runner.destroy();
```

`start`/`end` 限定本次推进的路径区间，`offset` 支持全局或按副本偏移；宿主是 SVG 元素时直接追加副本组，普通 HTML 宿主会创建覆盖 SVG。组件不创建计时器或 rAF，也不代表协议到达/接受。完整接口见 [docs/viz-flow.md](../../docs/viz-flow.md#propagation)。

## 共同约定

- 实例形态：`{ el, update(patch), destroy(), getTarget(id) }`；`update` 浅合并顶层字段，数组整体替换，内部按 `id` 复用节点；`destroy` 幂等移除根元素。
- 输入缺 `id` 时按顺序生成占位；同一输入重复 id 时 `getTarget` 返回最后渲染的对象，不应依赖重复 id。
- 目标查询返回当前 DOM 节点；销毁后返回 `null`。各图形还保留 `track`/`bypasses`/`svg`/`track` 等容器目标，具体见 [docs/viz-flow.md](../../docs/viz-flow.md)。
- 所有文字用 `textContent` 写入，不解析 HTML；无网络、无 `eval`、无自动播放。
- 阶段、消息、字段、连接与状态都由宿主数据决定；示例只做中性数据，不包含协议规则或课程结论。

## 验证

```powershell
node --check src/viz/flow.js examples/flow-kit/flow-kit.js
node scripts/inspect-note.mjs "D:/Workbench/html-note/examples/flow-kit/index.html" --json
```

`inspect-note` 检查页面错误、控制台错误与外部请求；该页没有 NoteDemo 会话，不需要 `--session`。作品专属量测可用 `--probe` 在同一页面内读取四个实例的 DOM 与 `getTarget` 结果。打开成功不等于验收通过，实际状态仍以页面和组件实例为准。

## 限制

- 四个图形彼此独立，不提供统一时间轴、自动播放、暂停/恢复或动画编排；连续过程由宿主或公共 `NoteDemo` scene 组织。
- 布局是确定性的基础布局：设备/参与者/字段按数组顺序排列，不提供自动避障、自动路由、拖拽、缩放或大型图编辑。
- `SegmentBar` 的最小可读宽度会偏离严格比例，真实值仍保留在文本与 `data-real-value`；作者应在图注中说明显示尺度。
- `DeviceLinks.pointAt` 返回 SVG 局部坐标和弧度角，不是 DOM client 坐标；跨坐标系定位需宿主自行转换。
- 示例不覆盖课程内容、真实协议或教学重点判断；这些由作者在本篇数据与说明中提供。
- 图形只在当前桌面 Edge（Chromium）与本库离线 `file://` 环境验证；Firefox/Safari、触屏、打印/RTL 未验证。
