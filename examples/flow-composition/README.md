# 流程组合：阶段、报文与状态表

两段真实 NoteDemo 会话，演示 `NoteDemoRecipes` 的三个可复用接法：

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
    stage: { adapter: 'flow-stage', slot: 'stage', options: { label: 'TCP 连接阶段' } },
    packet: { adapter: 'flow-packet', slot: 'packet', options: { label: '报文流', showIndexes: true } },
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
  stage: { slot: 'stage', title: '阶段' },
  packet: { slot: 'packet', title: '报文' },
  readout: { slot: 'readout', title: '读数' }
});

var session = NoteDemo.mount(host, demo);
```

- 视图是 Adapter 的 canonical 输入：阶段轨 `{stages,current,target,skipped,failed,bypass,label}`；
  报文流 `{participants,messages,visibleCount|revealed,focus,showIndexes,label}`；
  表格 `{columns,rows,sort,emphasis,caption,empty,dense,maxHeight}`；读数 `{text}`。
- 每个改变 Binding 的 Step 都要在 `scene.bindings` 中显式列出；配方不推断 scene。
- `flow-stage` 的效果组为 `stage:<id>` / `bypass:<id>`；`flow-packet` 为 `message:<id>` / `participant:<id>`；
  `table` 为 `cell:<rowKey>:<colKey>` / `row:<rowKey>`。当前示例不声明 attention，需要局部放行时在
  `scene.attention.targets[].groups` 中引用这些组。
- 页面只用 `session.subscribe()` 更新左上角 phase 文字；图形、表格、字幕都不由页面补写。
- 缺少组件/Adapter 时挂载失败会显示 `role="alert"` 错误块，不静默跳过。

## 验证

- 源直载 Edge 探针（开发用）：临时加载 manifest 声明的模块，检查两段会话、
  `repeatStages` 的 Frame/Transition、阶段/报文/表格随 next/go 更新、销毁清理。
- 构建后入口：`node scripts/build-demo-preview.mjs --template examples/flow-composition/index.html …` 由构建方执行。
