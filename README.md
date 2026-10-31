# HTML 笔记组件库

供人和 Agent 组装 HTML 学习笔记的离线组件库：主体是预制代码组件、图形与变化机制，以及可复用的公共演示编排层。工程使用普通 JavaScript/CSS、经典脚本和离线 HTML，构建只依赖 Node 内置模块；成品运行不需要网络、模型或运行时服务。

组件与运行代码在 `src`，分发在 `dist`，可执行示例在 `examples` 与 `gallery`，现行文档在 `docs`，工程检查在 `tests`。克隆仓库后在工程根执行构建与检查。

## 当前清单与状态

- **101 条、17 个构建模块**：84 项组件能力（10 项复用 + 74 项新增）、10 项可复用组合块、7 项共享基础（I01–I07）。
- 计数与类别由 `scripts/expected-ids.json`、`src/manifests` 和构建生成的 `registry.json` 共同约束，不在文档或脚本里另立一份清单。
- 当前构建、静态检查与 demo 检查通过；公共聚焦机制按“大体通过”保留，具体门控与限制见[公共编排层 API](docs/公共编排层.md)。
- **技术核验不等于用户审美认可**：用户已认可的部分公共呈现与旧组件按既有范围保留，新增组件仍为候选；技术状态与用户评价分别维护在 `src/status.json` 与 manifest/registry 中。

## 最小使用

整库加载（静态组件、图形和 NoteDemo 都可直接用）：

```html
<link rel="stylesheet" href="./dist/note-library.css">
<script src="./dist/note-library.js"></script>
```

直接使用静态组件：

```js
var note = NoteUI.Notice.mount(host, { title: '说明', text: '……' });
var chart = NoteViz.Chart.mount(host, { type: 'bar', data: rows });
```

组织多停点演示（默认舞台、字幕、操作控件由公共层提供）：

```js
NoteDemo.mount(document.querySelector('[data-demo-host]'), {
  definition: definition, // 完整 Frame + 相邻 Transition
  title: '演示标题'
});
```

只需要公共运行核心、自己组织舞台时用 `NoteDemo.create({ definition, slots })`；作者快照简写用 `NoteDemo.compile`，槽位检查用 `NoteDemo.collectSlots`，作者区域骨架用 `NoteDemoRecipes.focusWorkbench`。按模块控制体积时加载 `dist/modules` 下目标模块及其声明依赖，不要在同一页重复加载整库与相同模块。完整用法见[取用与组合](docs/取用与组合.md)。

## 入口

| 目的 | 入口 |
| --- | --- |
| 看全部组件 | [离线组件预览](dist/组件库-预览.html) · [gallery](gallery/index.html) |
| 看公共编排层 | [整合预览](dist/公共编排层-整合预览.html) · [矩阵乘法旧对照](dist/公共层复用验证-矩阵乘法.html) |
| 作者装配与聚焦 | [作者入口](examples/authoring/index.html) · [作者预览](dist/作者装配与聚焦-预览.html) · [配方源码](src/demo/recipes.js) |
| 查能力与依赖 | [组件目录](docs/组件目录.md) · [registry](registry.json) |
| 学会调用与组装 | [取用与组合](docs/取用与组合.md) · [公共编排层 API](docs/公共编排层.md) |
| 看实际源码用法 | [作者入口](examples/authoring/index.html) · [scene 示例](examples/demo-scene/index.html) · [矩阵旧示例](examples/reuse-matrix-product/index.html) · [单项示例](examples/run.html?id=L01) |
| 下载完整资料 | GitHub 的 Code → Download ZIP；本地离线分发包通过 `scripts/package.ps1` 生成 |

## 文档地图

| 文档 | 回答什么 |
| --- | --- |
| [取用与组合](docs/取用与组合.md) | 怎么选入口、加载、调用和组合；模块依赖与宿主责任 |
| [公共编排层 API](docs/公共编排层.md) | NoteDemo 的 Definition、scene、Adapter、会话 API、生命周期与已知限制 |
| [公共过渡能力设计](docs/公共过渡能力设计.md) | 公共层为什么这样分工、执行契约、timing/焦点交接与引擎取舍 |
| [组件目录](docs/组件目录.md) | 按类别定位组件，链接到模块文档与示例 |
| [架构与接口](docs/架构与接口.md) | 源码布局、分层职责、数据流与公开接口边界 |
| [构建与分发](docs/构建与分发.md) | 真实命令、产物、模块顺序、离线预览与打包边界 |
| [设计共识](docs/设计共识.md) | 阅读目标与设计原则 |
| 模块 API（`docs/ui-*.md` 等） | 各组件的实际参数、状态、事件与限制 |
| 研究记录（`docs/*研究*.md`、`docs/公共层开源*`） | 历史取舍与源码证据；不是现行 API |

## 构建、检查与打包

在工程根执行：

```powershell
node scripts/build.mjs --final --release
node scripts/check.mjs

# 自包含预览（作者入口 / 公共编排层）
node scripts/build-demo-preview.mjs --template examples/authoring/index.html --output dist/作者装配与聚焦-预览.html
node scripts/build-demo-preview.mjs --template examples/reuse-matrix-product/standalone.html --output dist/公共层复用验证-矩阵乘法.html
node scripts/build-demo-preview.mjs

# 完整候选包
pwsh -NoProfile -File scripts/package.ps1
```

`dist/` 与根 `registry.json` 都是构建产物，不手改。开发模式可先跑 `node scripts/build.mjs`，缺失项只警告；`--final` 与 `check.mjs` 严格失败。浏览器检查复用本机 Edge 与 `tests/tools` 中已有的 playwright-core，不下载另一套浏览器，也不需要新增 `npm test` 工具链。

## 目录

```text
src/          唯一维护源、manifest 与技术状态
dist/         整库、模块包、当前预览与完整包
examples/     可执行开发宿主、独立用法与作者入口
gallery/      组件浏览外壳与各模块真实演示
docs/         现行 API、设计取舍、组件目录与工程说明
tests/        工程检查、公共层检查与可复现消费测试
scripts/      构建、核对、预览内联与打包
vendor/       本地第三方资源及许可
archive/      可选本地历史资料（不参与构建，不纳入 Git）
registry.json 构建产物，不手工维护
```

## 边界

- 运行依赖均为本地相对路径，支持经典脚本与 `file://`；不支持 CDN、运行时构建服务或 ES module 顺序语义。
- 浏览器验证以本机 Edge（Chromium）的桌面视口为主；Firefox/Safari、移动触屏、屏幕阅读器、打印/RTL 等按各模块限制分别表述，不默认为已覆盖。
- `archive/` 与历史研究只解释来路，不是构建输入、待执行任务或第二套组件清单。
- 第三方资源与许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)；`vendor/` 许可文件随分发保留。

## 许可

项目自有代码与文档采用 [MIT License](LICENSE)。第三方代码、字体和图标遵循各自许可证，见 [第三方资源与许可](THIRD_PARTY_NOTICES.md)。
