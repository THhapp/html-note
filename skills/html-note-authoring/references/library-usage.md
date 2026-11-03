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
| 不知道资产名称 | `search` 按用途、名称或别名找候选，比较类型与边界 |
| 已知资产或接法 | `show` 直接取开工包，必要时指定上下文；可一次查多个明确条目 |
| 需要完整参数、例子或实现 | `read` 沿条目资源读取，按 `remaining/nextOffset` 继续 |
| 已有资料足够 | 直接制作；只有新疑点或上下文变化才补查 |

```text
node <Skill目录>/scripts/query.mjs search "序列插入" --json
node <Skill目录>/scripts/query.mjs show D01 --context independent --json
node <Skill目录>/scripts/query.mjs show public:progress --json
node <Skill目录>/scripts/query.mjs read public:progress api --json
node <Skill目录>/scripts/query.mjs show public:continuous-adapter --json
node <Skill目录>/scripts/query.mjs show example:continuous-scene --json
node <Skill目录>/scripts/query.mjs show recipe:composition --json
node <Skill目录>/scripts/query.mjs show tool:inspect-note --json
```

`show` 返回该条目真实可用的上下文；上下文不匹配时按返回的可用上下文重试，不套用其他入口。完整示例用 `authoring` context，不要传不存在的 `example` context。`read` 的资源键按条目实际声明：`api`/`source`/`guide`/`example`/`fragment`/`full`/`minimal`/`control` 等；`example` 是该条目的示例入口，最小与完整可用 `minimal`/`full` 区分，不要把最小宿主一律当完整示例。依赖闭包由库的结构化条目与 manifest 推导，使用查询结果给出的依赖；搜索无精确命中时，结果会单独给出基于真实拆词命中的 `suggestions`，不要把它当成精确匹配，也不要把空结果当成库没有能力。

## 加载与接法选择

静态组件和图形可以独立 mount/update；多停点协调使用 `NoteDemo`；已有 scene Adapter 或配方能覆盖时直接复用，不先遍历所有组合块。

整库加载：

```html
<link rel="stylesheet" href="./dist/note-library.css">
<script src="./dist/note-library.js"></script>
```

按模块加载时加载 `dist/modules` 下目标模块及其真实声明依赖。`NoteDemo.mount` 使用默认舞台，依赖 `demo-ui` 及其传递闭包；`NoteDemo.create` 使用自备 presentation，依赖止于 `demo-runtime`，不能只按 create 的依赖推 mount。

## 自定义连续画面接入

普通自定义连续画面优先使用 `NoteDemo.sceneAdapter.define`：作者负责领域视图、绘制/恢复、目标解析和局部变化计划，helper 组织 Adapter 契约、commit 顺序、减少动效和最终 timing。加载、Definition 与最小接法可直接运行：

```text
node <Skill目录>/scripts/query.mjs show public:continuous-adapter --root <库目录>
node <Skill目录>/scripts/query.mjs show example:continuous-scene --root <库目录>
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

`sceneAdapter.define(spec)` 的常用字段：

- `name` 与 Definition 的 `adapter` 一致；`sceneModes` 常用 `['update']`，`defaultSceneMode` 必须在列表中；`sceneTimingDefaults` 可给稀疏 timing。
- `normalizeView(input, options)` 返回 model，或完整的 `{ model, cues }`。
- `mount(host, options)` 返回作者实例，至少提供 `restore(model, view)`、`readModel()`、`target(query)`、`planStep(input)`、`destroy()`。

`planStep(input)` 可同步返回计划或返回 Promise；`commit()` 必须同步提交完整目标。计划可带 `groups()`、`targets()`、`effects(timing, meta)`、`sourceElements()`、`cleanup()`。`effects` 只在非 reduced 时调用，收到的 timing 已是最终值；每个 spec 的 group 必须属于 `groups()`。commit 后未放行组保持来源视觉，放行组才由 progress 推进到目标；reduced 会跳过 effects，commit 应直接呈现目标终态。`cleanup()` 只释放本步临时资源，不承担最终显示。

需要直接控制原生 BindingHandle 时，使用 `restore(view)` 与 `PreparedChange.effects(ctx)`，时序取 `ctx.timing`；helper 的 `restore(model, view)` 与原生 `restore(view)` 不能混用。可运行最小宿主和更丰富的双组交接分别在目标库的 `examples/continuous-scene/minimal.html` 与 `examples/continuous-scene/index.html`（路径相对库根）。

## 读数与提交语义

目标/阶段说明、模式与目标参数可以随目标提交更新；"已收到/已发出/已完成"等事实必须随领域事件或实际展示进度更新，不能在对象尚未到达时先显示完成值。预期结果可以提前展示，但名称要明确是目标/预期。是否需要 Focus 巡视与何时更新数值分别判断，不要求所有计数进入效果组、逐处巡视或做数字动画。恢复和 reduced 直接呈现完整一致停点。

## 本地观察

成品能打开后，用库内观察入口做一次性的本地检查；它复用工程现有 `playwright-core` 与本机浏览器，默认无头、执行后退出，不安装依赖、不起服务、不默认写文件：

```text
node <Skill目录>/scripts/inspect-note.mjs "<成品HTML绝对路径>" --root <库目录> --json
node <Skill目录>/scripts/inspect-note.mjs "<成品HTML绝对路径>" --frame <frameId> --session "<页面内会话表达式>" --root <库目录> --json
node <Skill目录>/scripts/inspect-note.mjs "<成品HTML绝对路径>" --probe "<probe模块绝对路径>" --root <库目录> --json
```

- 页面需要驱动时设置 `window.__inspectSession = session`，或用 `--session` 指定明确表达式。
- `--frame <frameId>` 先用公开 `session.go(frameId)` 恢复停点并确认实际落点，再执行截图/probe；未知 Frame、空参数或会话缺失会明确失败，不默默回到初态。
- `go()` 只证明停点恢复。要证明动画、焦点到达、内容放行、取消或恢复过程，在 probe 内用 `next()/replay()` 真实推进；时序疑点用 `inspect.sample()` 采样。
- probe 导出 `default async ({ page, inspect }) => ...`，与打开的页面同页；可在其中 `read/box/state/start/step/waitFor/sample`，只显式调用 `screenshot(绝对路径)` 时写文件。长 JSON 一次重定向到 UTF-8 文件再解析，不用 head/tail 截断后重放整轮。
- 参数以 `--help` 和实际返回为准。输出区分工具执行、页面观察和 probe 结果；打开成功不等于作品验收通过。

## 取用时注意

组件、组合块、配方和公共接法承担不同工作。`show` 的上下文区分独立调用、scene、默认舞台等入口；依赖和用法必须对应所选入口。示例分为完整实例、配置骨架和源码片段，复用结构相符的部分，领域计算、对象身份和本篇观察安排由作者提供。

普通调用先取当前用法和必要契约；资料冲突、接口缺项或具体故障再深入实现。公共协调按真实句柄执行，作者不要另建播放器或用等待时间替代完成关系，也不用私有暂停层代替公共接管。

需要交付独立离线 HTML 时，查询 `tool:demo-preview` 的现行用法；内联器只内联模板已列出的资源。库维护检查（构建、打包、回归命令）属于库维护，不进入每篇笔记的制作要求；制作时按本次实际风险验证，不为通过模板收集无关证据。
