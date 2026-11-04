# 查询与组件取用

本 Skill 使用库内既有 CLI 和观察入口，不携带第二份查询实现或组件运行包。示例中的 `<Skill目录>`、`<库目录>`、`<成品.html>` 要替换为真实位置；路径含空格时按所用 shell 正确引用。

## 找到库并查询

项目内 Skill 会自动定位同仓库。若 Skill 被单独复制，查询脚本可识别当前工作目录所属的库；否则使用本次任务给出的库目录：

```text
node <Skill目录>/scripts/query.mjs info --root <库目录> --json
```

已知真实 CLI 位置时也可直接运行 `<库目录>/scripts/query.mjs`。库位置和资料上下文有效时直接沿用，不每轮重复 `info`。查询不启动服务或浏览器。

| 情况 | 操作 |
| --- | --- |
| 作者开工或需要选路径 | 先 `show authoring:start --json`，按开工包资源继续 |
| 不知道资产名称 | `search` 按用途、名称或别名找候选，比较类型与边界 |
| 已知资产或接法 | `show` 直接取开工包，必要时指定上下文；可一次查多个明确条目 |
| 需要完整参数、例子或实现 | `read` 沿条目资源读取，按 `remaining/nextOffset` 继续 |
| 已有资料足够 | 直接制作；只有新疑点或上下文变化才补查 |

```text
node <Skill目录>/scripts/query.mjs show authoring:start --json
node <Skill目录>/scripts/query.mjs search "表格 新行"
node <Skill目录>/scripts/query.mjs show public:table-adapter --json
node <Skill目录>/scripts/query.mjs show public:attention --json
node <Skill目录>/scripts/query.mjs show D01 --context independent --json
node <Skill目录>/scripts/query.mjs show public:continuous-adapter --json
node <Skill目录>/scripts/query.mjs read authoring:start guide --json
node <Skill目录>/scripts/query.mjs show recipe:composition --json
node <Skill目录>/scripts/query.mjs load recipe:composition --with C06 D08 --json
node <Skill目录>/scripts/query.mjs show tool:inspect-note --json
```

`show` 返回条目真实可用的上下文；上下文不匹配时按返回的可用上下文重试，不套用其他入口。`read` 的资源键按条目实际声明：`api`/`source`/`guide`/`example`/`fragment`/`full`/`minimal`/`control` 等。`authoring:start` 是导航条目，不声明运行依赖；具体组件、配方与示例的依赖按条目返回的 `dependencies`/`regionDependencies` 取，不手写模块闭包清单。空搜索不等于库没有能力。

## 作者开工包与路径选择

`show authoring:start` 一次返回通用开工入口：取用指南、作者示例、最小连续画面宿主、实现源码、完整示例与本地核对入口；不绑定某个具体组件或 Table 做法。先取它，再按缺什么补单条，不通读全部资料。

| 本次要做 | 先取 | 继续 |
| --- | --- | --- |
| 单个静态组件/图形，无演示运行层 | `show <ID> --context independent` | 组件 API 的 mount/update |
| 固定区域的多个停点 | 配方 `focusWorkbench` / `stagePacket` / `diagramTable` / `repeatStages` | 配方条目与作者示例 |
| 跨区域协调：依据与结果分处不同区域，需要先后承接 | 公共 attention + 实际组件条目；Table 行组只是具体分支之一 | 下文“具体分支” |
| 自绘画面、局部变化，希望少写 Adapter 胶水 | `public:continuous-adapter` | 自定义连续画面最小接法 |
| 自备整个舞台 | `NoteDemo.create` | 公共层条目或目标库当前 API |

开工顺序：执行 Agent 作为作者判断知识重点与观察关系 → 取开工包 → 先贯通最不确定的代表过程 → 正常速度观察依据/变化/结果 → 扩充与交付。配方与公共层的完整参数按资源键 `read`，不凭名称猜。

## 加载与接法选择

静态组件和图形可以独立 mount/update；多停点协调使用 `NoteDemo`；已有 scene Adapter 或配方能覆盖时直接复用，不先遍历所有组合块。

整库加载：

```html
<link rel="stylesheet" href="./dist/note-library.css">
<script src="./dist/note-library.js"></script>
```

按模块加载时按条目返回的 `dependencies`/`regionDependencies` 加载目标模块及其真实声明依赖：`NoteDemo.create` 使用场景/运行闭包，`NoteDemo.mount` 另需默认舞台 `demo-ui` 及其传递依赖；具体区域组件按实际 Binding 所属模块补。不同配方/示例的依赖分别取，不手写一套模块闭包清单。

## Focus 可读性：先有依据，再展开

有公共 Focus 时，每个落点必须对应一种可读状态：已经可读的参照只观察（`groups: []`）；尚未可读、到达后才展开的主要内容，必须由该落点声明负责区域的效果组，并由 Adapter 的 `groups()` 与 progress/WAAPI 真正推进。多个新增区域需要先后阅读时，分别建组并挂到各自目标；只有确实要一起辨认才共用一组，且组挂在让它们开始可读的目标上。`commit()` 只提交目标/预置来源视觉，主要变化交给 effects；不要在 commit 内直接 `animate()`，否则动画可能在 Focus 到达前结束，公共层无法取消或协调。Focus 离开当前目标前，当前主要内容应达到可辨认；用真实 `next()/replay()/prev()` 观察，不设全局透明度阈值、统一等待或固定秒数。

短例：`node <Skill目录>/scripts/query.mjs show example:attention-order --root <库目录> --json`，资源键 `guide/example/verify`。两个已复现反例是“新增卡片共用最后一目标的组”和“侧栏说明与当前行共用后一目标的组”，原因都是组绑到了错误的落点。

## 具体分支：跨区域承接与 Table 行组

“依据 → 主要变化 → 结果”跨区域承接时，先辨认依据，再让结果出现；Table 新行只是其中一种具体分支。按 `public:table-adapter`/`public:attention` 的当前返回使用，不把 Table 当作开工默认：

```js
var recipe = NoteDemoRecipes.diagramTable({
  bindings: {
    evidence: { adapter: 'dom', slot: 'evidence' },
    table: { adapter: 'table', slot: 'table',
      options: { rowKey: 'id', stableStateLabels: false } },
    status: { adapter: 'dom', slot: 'status' }   // 辅助状态：列入 scene.bindings，但不进 attention
  },
  initial: { /* evidence 文本、空表、status 已提交 0 条 */ },
  steps: [{
    replace: { /* evidence 文本、table 行、status 文本 */ },
    scene: {
      bindings: [{ binding: 'evidence' }, { binding: 'table' }, { binding: 'status', mode: 'cut' }],
      attention: { targets: [
        { binding: 'evidence', query: { part: 'value' } },
        { binding: 'table', query: { row: 'r1' }, groups: ['row:r1'], holdDuration: 0 }
      ] }
    }
  }],
  diagram: { slot: 'evidence', title: '当前依据' },
  table: { slot: 'table', title: '结果表' },
  status: { slot: 'status', title: '已提交状态' }
});
NoteDemo.mount(host, { definition: recipe.definition, layout: recipe.layout });
```

机制：新行在 commit 时进入 DOM，行级 WAAPI 在组放行前以 `opacity:0` 暂停；attention 到达该行、`groups:['row:<key>']` 放行后，整行才 ready→finished。组名由 table Adapter 按 `row:<encodeURIComponent(key)>` 生成；独立 table Binding 可用 `{row:'<key>'}` 定位，不必与依据同 Binding，已有行不重播。上面的 status 用 `mode:'cut'` 只是快照式同步的一种写法，不是通用要求。

任何 Binding 的视图变化都必须在 scene.bindings 中列出，不能省略；辅助状态如何提交（update/cut 等）与是否需要 Focus 巡视是两个判断，不要求一律 cut、逐项巡视或数字动画。

是否使用 Focus 单独判断：对象运动、对齐窗口、范围变化等自然引导已能对应依据与结果时，可以不用公共 attention；只有跨区域依据/结果无法直接对应、主要变化需要寻找时才用。知识重点由作者判断，工具不猜。完整示例与 API 按开工包与条目当前返回的资源继续。

## 自定义连续画面接入

普通自定义连续画面优先使用 `NoteDemo.sceneAdapter.define`：作者负责领域视图、绘制/恢复、目标解析和局部变化计划，helper 组织 Adapter 契约、commit 顺序、减少动效和最终 timing。完整示例：

```text
node <Skill目录>/scripts/query.mjs read example:continuous-scene minimal --root <库目录>
```

整库加载时，helper 随 `demo-runtime` 提供；`NoteDemo.mount` 默认舞台还需要 `demo-ui` 及其传递依赖。最小 Definition 只需两三个停点和一次局部变化：

```js
var definition = {
  initialFrameId: 'initial',
  bindings: { scene: { adapter: 'my-scene', slot: 'scene' } },
  frames: [
    { id: 'initial', caption: '初始状态', views: { scene: { value: 0 } } },
    { id: 'changed', caption: '一次局部变化', views: { scene: { value: 1 } } }
  ],
  transitions: [{
    from: 'initial', to: 'changed',
    scene: {
      bindings: [{ binding: 'scene', mode: 'update' }],
      attention: { targets: [{ binding: 'scene', query: { part: 'value' }, groups: ['value'] }] }
    }
  }]
};
var session = NoteDemo.mount(host, {
  definition: definition,
  adapters: { 'my-scene': myAdapter },
  layout: function (container) { /* 建 slot[data-demo-slot="scene"]，返回 { root, slots } */ }
});
window.__inspectSession = session; // 可选：让 inspect-note 默认找到会话
```

`sceneAdapter.define(spec)` 常用字段：`name` 与 Definition 的 `adapter` 一致；`sceneModes` 常用 `['update']`，`defaultSceneMode` 必须在列表中；`normalizeView(input, options)` 返回 model 或 `{ model, cues }`；`mount(host, options)` 返回作者实例，至少提供 `restore(model, view)`、`readModel()`、`target(query)`、`planStep(input)`、`destroy()`。

`planStep(input)` 可同步返回或返回 Promise；`commit()` 必须同步提交完整目标。计划可带 `groups()`、`targets()`、`effects(timing, meta)`、`sourceElements()`、`cleanup()`；每个 effect spec 的 group 必须属于 `groups()`。commit 后未放行组保持来源视觉，放行组才由 progress 推进；reduced 跳过 effects，commit 直接呈现目标终态；`restore` 直接呈现完整停点，不依赖 effects。`cleanup()` 只释放本步临时资源，不承担最终显示。

需要直接控制原生 BindingHandle 时，使用 `restore(view)` 与 `PreparedChange.effects(ctx)`，时序取 `ctx.timing`；helper 的 `restore(model, view)` 与原生 `restore(view)` 不能混用。可运行最小宿主与双组交接示例从 `example:continuous-scene` 资源继续。

## 读数与提交语义

目标/阶段说明、模式与目标参数可以随目标提交更新；"已收到/已发出/已完成"等事实必须随领域事件或实际展示进度更新，不能在对象尚未到达时先显示完成值。预期结果可以提前展示，但名称要明确是目标/预期。是否需要 Focus 巡视与何时更新数值分别判断，不要求所有计数进入效果组、逐处巡视或做数字动画。恢复和 reduced 直接呈现完整一致停点。

## 本地观察

成品能打开后，用库内观察入口做一次性的本地检查；它复用工程现有 `playwright-core` 与本机浏览器，默认无头、执行后退出，不安装依赖、不起服务、不默认写文件：

```text
node <Skill目录>/scripts/inspect-note.mjs "<成品HTML绝对路径>" --root <库目录> --json
node <Skill目录>/scripts/inspect-note.mjs "<成品HTML绝对路径>" --selector "<CSS选择器>" --screenshot "<绝对PNG路径>" --root <库目录> --json
```

- 页面需要驱动时设置 `window.__inspectSession = session`，或用 `--session` 指定明确表达式；作者入口用稳定映射 `window.AuthoringDemoSessions`（如 `.crossRegion`），不依赖固定数组下标。
- `--frame <frameId>` 先用公开 `session.go(frameId)` 恢复停点并确认实际落点，再执行截图/probe；未知 Frame、空参数或会话缺失会明确失败，不默默回到初态。
- `go()` 只证明停点恢复。要证明动画、焦点到达、内容放行、取消或恢复过程，在 probe 内用 `next()/replay()` 真实推进；时序疑点用 `inspect.sample()` 采样。跨区域最小 probe 见 [验证与观察](validation.md#跨区域最小-probe)。
- probe 导出 `default async ({ page, inspect }) => ...`，与打开的页面同页；只显式调用 `screenshot(绝对路径)` 时写文件。长 JSON 一次重定向到 UTF-8 文件再解析。
- 参数以 `--help` 和实际返回为准；输出区分工具执行、页面观察和 probe 结果，打开成功不等于作品验收通过。

## 取用时注意

执行 Agent 是作者：知识重点、理解目标、观察关系与表达方式由你根据源材料判断，查询、配方和运行层不自动推断。组件、组合块、配方和公共接法承担不同工作；`show` 的上下文区分独立调用、scene、默认舞台等入口，依赖和用法必须对应所选入口。示例分为完整实例、配置骨架和源码片段，复用结构相符的部分，领域计算、对象身份和本篇观察安排由作者提供。

普通调用先取当前用法和必要契约；资料冲突、接口缺项或具体故障再深入实现。公共协调按真实句柄执行，作者不要另建播放器或用等待时间替代完成关系，也不用私有暂停层代替公共接管。

需要交付独立离线 HTML 时，查询 `tool:demo-preview` 的现行用法；内联器只内联模板已列出的资源。库维护检查（构建、打包、回归命令）属于库维护，不进入每篇笔记的制作要求；制作时按本次实际风险验证，不为通过模板收集无关证据。
