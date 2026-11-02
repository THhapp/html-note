# 查询与组件取用

本 Skill 使用库内既有 CLI，不携带第二份查询实现或组件运行包。下文的库路径取自当前任务和实际工程；示例中的 `<Skill目录>` 与 `<库目录>` 要替换为真实位置。

## 找到库

项目内 Skill 会自动定位同仓库。若 Skill 被单独复制，查询脚本也可识别当前工作目录所属的库；否则使用本次任务给出的库目录：

```text
node <Skill目录>/scripts/query.mjs info --root <库目录> --json
```

路径含空格时按所用 shell 正确引用。已知真实 CLI 位置也可直接运行 `<库目录>/scripts/query.mjs`。库位置和资料上下文有效时直接沿用，不每轮重复执行 info。

缺少库位置且无法定位时，说明缺项；如果任务或已有上下文已给出路径，直接使用，不重新询问。查询不启动服务或浏览器。

## 选择最小必要查询

| 情况 | 操作 |
| --- | --- |
| 不知道资产名称 | search 按用途、名称或别名找候选，比较类型、主要边界与后续入口 |
| 已知资产或接法 | show 直接取开工包，必要时指定上下文；可一并读取多个明确条目 |
| 需要完整参数、例子或实现 | read 沿条目资源读取，按返回的继续入口取得长内容 |
| 原接口资料已足够 | 继续制作；只有新疑点或上下文变化才补查 |

示例只说明查询方式，不限定笔记采用的组件：

```text
node <Skill目录>/scripts/query.mjs search "序列插入" --json
node <Skill目录>/scripts/query.mjs show D01 --context independent --json
node <Skill目录>/scripts/query.mjs show public:progress --json
node <Skill目录>/scripts/query.mjs read public:progress api --json
node <Skill目录>/scripts/query.mjs show public:attention --json
node <Skill目录>/scripts/query.mjs show example:continuous-scene --json
node <Skill目录>/scripts/query.mjs show example:flow-kit --json
node <Skill目录>/scripts/query.mjs show public:continuous-adapter --json
node <Skill目录>/scripts/query.mjs show public:timing-facts --json
node <Skill目录>/scripts/query.mjs show tool:inspect-note --json
node <Skill目录>/scripts/query.mjs read D01 api --json
```

需要时给这些命令加 `--root <库目录>`。`show` 给出条目实际可用的上下文；上下文不匹配时按返回的可用上下文和可执行提示重试，不套用其他入口。`read` 的 `api/source/example/fragment` 分别指向完整文档、实现源码、完整示例和局部片段，按需要区分。

查询不会启动浏览器。

公共 scene 的受控画面由 Binding 容器统一接管：提交前暂停受控内容 CSS transition，效果组只推进自己的视觉，收束/恢复后释放；自定义 Adapter 不需要自己写 `setSceneActive`。连续 Adapter 可用 `NoteDemo.sceneAdapter.define` 减少胶水，`NoteDemo.timingFacts.watch` 默认关闭、按需观察时序。接法与生命周期见 [受控画面的视觉接管](docs/公共编排层.md#author-scene-control)、[Adapter 辅助](docs/公共编排层.md#author-scene-adapter)（相对实际库根）。

## 本地观察与量测

页面能打开之后，用库内观察入口做一次性的本地检查；不要为验证另装浏览器或搭服务：

```text
node <Skill目录>/scripts/inspect-note.mjs "<成品HTML绝对路径>" --json
node <Skill目录>/scripts/inspect-note.mjs "<成品HTML绝对路径>" --screenshot "<输出PNG绝对路径>" --width 860 --height 1000
node <Skill目录>/scripts/inspect-note.mjs "<成品HTML绝对路径>" --probe "<probe模块绝对路径>" --json
node <Skill目录>/scripts/inspect-note.mjs "<成品HTML绝对路径>" --session "window.Example.session" --probe "<probe模块绝对路径>" --json
```

观察工具默认无头、执行后退出；它复用工程现有 `playwright-core` 和本机浏览器。这里的依赖是 **Node 工具运行条件**，不是浏览器组件模块依赖：页面仍需按实际场景加载 `dist/` 或模块，工具本身不加载 demo-runtime。缺浏览器或依赖时按诊断指定 `--browser`/准备工程依赖，不自动安装或轮换通道。

`--probe` 复用同一个已打开页面，模块导出 `default async ({ page }) => ...`；probe 上下文还提供 `inspect.state/read/start/step/waitIdle/waitFor/sample/box/screenshot/observe`，可在同一页面完成推进、等待、读取和少量截图。`--session` 指定页面内 session 表达式；不传时工具尝试常见入口。只检查静态状态时可以直接打开；要证明动画、焦点到达、内容放行、取消恢复，用 `next()/replay()` 真实推进，`go()` 不能证明过程。时序疑点用 probe 采样，不用批量静态截图猜。参数以 `--help` 和实际返回为准。

## 取用时要分清的事情

组件、组合块、配方和公共接法承担不同工作。show 的上下文区分独立调用、scene、默认舞台等入口；依赖和用法必须对应所选入口。加载整库与按模块加载均可，按模块时使用实际依赖，不把运行核心视为所有组件及默认舞台的完整依赖。

示例分为完整实例、配置骨架和源码片段。复用结构相符的部分，领域计算、对象身份和本篇观察安排由作者提供；题材相近的演示不保证模型与场景结构相同。

现有清单覆盖范围大于精选语料。无搜索结果或资料显示“未确认”时，检查当前目录、具体 API 或 Adapter 声明，不能把未命中当成库没有能力，也不默认为支持全部模式。

普通调用先取当前用法和必要契约；资料冲突、接口缺项或具体故障再深入实现。公共协调按真实句柄执行，作者不要另建播放器或用等待时间替代完成关系。

## 阅读长内容

当前 read 按行分页，并返回 `remaining`、`nextOffset` 和继续命令。按需要补足相关参数表或代码块，未读完不声称已掌握完整契约。`public:progress`/`public:attention` 已定向到具体作者小节，不再从 Adapter 大章开头找；避免重复输出大型内联预览，源码、文档和维护示例是查阅入口。

## 本地实现与交付

领域模型、图形与宿主装配可分文件维护。需交付独立离线 HTML 时，查询 `tool:demo-preview` 的现行用法；它内联模板已经列出的资源，不自动补齐组件脚本或生成知识内容。

本次任务允许修改共享库时，按真实缺陷范围处理；否则在约定目录实现必要局部内容并说明接入缺口。不要为使用 CLI 重新构建库、运行组件检查或扩建资料平台。

库内进一步入口是 `docs/取用与组合.md`、对应模块 API、`docs/公共编排层.md` 和 `docs/构建与分发.md`。这些路径相对于实际库根，不是 Skill 安装目录。
