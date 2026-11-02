# 流程组合：阶段、报文与状态表

两段真实 NoteDemo 会话，演示 `NoteDemoRecipes` 的三个可复用接法；两段都使用 `density: 'compact'` 的单演示密度，区域不再写 title/meta 工程说明，组件与页面承载标签：

| 段 | 配方 | Bindings / Adapters |
| --- | --- | --- |
| 阶段 + 报文 + 读数 | `stagePacket` | `flow-stage`（阶段轨）、`flow-packet`（报文流）、`dom`（读数） |
| 图形 + 状态表 | `diagramTable` | `flow-packet`（报文流）、`table`（消息状态表）、`dom`（读数） |

两段 Definition 都由 `NoteDemoRecipes.repeatStages` 从同一组领域快照展开：
作者给 `items` 与 `expand(item, index)`，配方补稳定 Frame id、caption 回退并调用
`NoteDemo.compile`；不生成第二套 Frame/Transition。

## 加载

```html
<link rel="stylesheet" href="../../dist/note-library.css">
<script src="../../dist/note-library.js"></script>
<script src="flow-composition.js"></script>
```

开发页与离线单文件共用整库入口；本目录不写播放器、按钮、字幕或计时器，默认舞台由 NoteDemo 提供。

## 关键接法

```js
var definition = NoteDemoRecipes.repeatStages({
  bindings: {
    stage: { adapter: 'flow-stage', slot: 'stage', options: { label: 'TCP 连接阶段', density: 'compact' } },
    packet: { adapter: 'flow-packet', slot: 'packet', options: { label: '报文流', showIndexes: true, density: 'compact' } },
    readout: { adapter: 'dom', slot: 'readout', options: { label: '当前读数' } }
  },
  initial: { id: 'idle', caption: '…', views: { stage: …, packet: …, readout: … } },
  items: snapshots.slice(1),
  expand: function (snapshot) {
    return {
      id: snapshot.id,
      caption: snapshot.caption,
      replace: { stage: stageView(snapshot), packet: packetView(snapshot), readout: { text: snapshot.readout } },
      scene: { bindings: [{ binding: 'stage' }, { binding: 'packet' }, { binding: 'readout' }] }
    };
  }
}).definition;

var demo = NoteDemoRecipes.stagePacket({
  definition: definition,
  density: 'compact',             // 正式配方密度：只压缩外壳间距/内边距
  stage: { slot: 'stage' },
  packet: { slot: 'packet' },
  readout: { slot: 'readout' }
});

var session = NoteDemo.mount(host, demo);
```

- 视图是 Adapter 的 canonical 输入：阶段轨 `{stages,current,target,skipped,failed,bypass,label}`；
  报文流 `{participants,messages,visibleCount|revealed,focus,showIndexes,label}`；
  表格 `{columns,rows,sort,emphasis,caption,empty,dense,maxHeight}`；读数 `{text}`。
- 每个改变 Binding 的 Step 都要在 `scene.bindings` 中显式列出；配方不推断 scene。
- `flow-stage` 的效果组为 `stage:<id>` / `bypass:<id>`；`flow-packet` 为 `message:<id>` / `participant:<id>`；
  `table` 为 `cell:<rowKey>:<colKey>` / `row:<rowKey>`。下段的主要变化是当前报文显现：每个显现 step 的
  `scene.attention` 指向当前报文 `{ binding:'packet', query:{ id:'message:<id>' }, groups:['message:<id>'] }`，
  放行同名 flow-packet 组；表格与读数只辅助同步，不再逐格巡视 `note` 单元。需要局部放行其他对象时，
  可在 `scene.attention.targets[].groups` 中引用对应组名。
- 页面只用 `session.subscribe()` 更新左上角 phase 文字；图形、表格、字幕都不由页面补写。
- 缺少组件/Adapter 时挂载失败会显示 `role="alert"` 错误块，不静默跳过。
- 两段都使用 `density:'compact'`：配方 `stagePacket` / `diagramTable` 缩小 root gap、board/readout padding 与 head 间距；`flow-stage` / `flow-packet` 的 Binding.options 也传 compact，内部 padding/SVG 几何真实变小，不是 CSS transform 缩放。区域不再写 title/meta 工程说明，解释文字移到演示 host 之后；页面不写 `min-height`、固定按钮尺寸或内部滚动。

## 同屏观察

以“对齐演示 section 起点”为主口径，滚动到各段 section 顶部后量测：

| 视口 | 上段 | 下段 |
| --- | --- | --- |
| 1366×768 | host top≈46.3，next bottom≈753.6（<768） | host top≈46.1，next bottom≈622.4 |
| 1280×900 | next bottom≈753.6 | 同屏 |

t2 曾在 stage 顶对齐口径测得 715.1，作为另一口径保留，不要与 section 起点对齐混用。数值会随浏览器缩放、字体与当前停点内容变化；正常↔compact 或配方密度变化后必须重跑 `node tests/checks/stable-layout-check.mjs` 并重新量测，不能把某次数值当成固定布局。`density-screen-check` 尚未落入 `tests/checks`，当前以 stable-layout 检查与页面实测为准。

## 验证

- 源直载 Edge 探针（开发用）：临时加载 manifest 声明的模块，检查两段会话、
  `repeatStages` 的 Frame/Transition、阶段/报文/表格随 next/go 更新、销毁清理。
- 稳定布局/密度：`node tests/checks/stable-layout-check.mjs`（流程组合预览多宽度/多停点坐标与高度）；`node tests/checks/attention-composition-check.mjs`（当前报文 attention 与 reduced/取消）。
- 构建后入口：`node scripts/build-demo-preview.mjs --template examples/flow-composition/index.html …` 由构建方执行。
