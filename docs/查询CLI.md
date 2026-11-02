# 查询 CLI

本文记录本地查询工具的实际命令、取用包和维护方式。入口是 `scripts/query.mjs`；作者检索元数据在[查询语料](查询语料.md)，现行用法见[取用与组合](取用与组合.md)。CLI 只读本地资料，一次调用输出后退出。

## 目标与范围

让制作 Agent 按当前问题取得准确资料：找到能力、判断适用性、取得足够开工的用法，并在需要时深入。工具不生成知识模型、教学路线或完整笔记，不推断读者重点，也不增加运行服务。

采用本地 Node CLI，一次调用启动、读取文件、输出结果后退出。优先沿用已有 Node 环境和内置能力，不新增 MCP、守护进程、HTTP 服务、向量数据库或独立模型。默认定位脚本所属的库工程，不要求 Agent 从固定工作目录调用；也可用 `--root <库目录>` 明确读取位置。

查询不触发构建、组件安装、浏览器或演示播放。资料更新和库构建按工程原有方式进行。

## 实际入口与命令

在工程根执行；不要求从固定工作目录启动，脚本默认按自身位置找库，也可用 `--root <库目录>` 明确覆盖。

```powershell
node scripts/query.mjs info
node scripts/query.mjs search 矩阵
node scripts/query.mjs search dialog --json
node scripts/query.mjs show D01
node scripts/query.mjs show recipe:focusWorkbench --context recipe
node scripts/query.mjs show public:progress
node scripts/query.mjs read public:progress api
node scripts/query.mjs show example:continuous-scene
node scripts/query.mjs show example:flow-kit
node scripts/query.mjs show public:continuous-adapter
node scripts/query.mjs show public:timing-facts
node scripts/query.mjs show public:table-adapter
node scripts/query.mjs show public:flow-packet-adapter
node scripts/query.mjs show public:propagation
node scripts/query.mjs show example:flow-composition
node scripts/query.mjs show recipe:composition
node scripts/query.mjs show tool:inspect-note
node scripts/query.mjs read D01 api
node scripts/query.mjs read D01 source --limit 80
```

`--json` 可放在命令任意位置，输出单个可解析对象；文本模式给人工阅读，二者信息一致。

| 参数 | 作用 |
| --- | --- |
| `info` | 库位置、动态组件/模块/精选覆盖、文档入口、整库/按模块加载方式 |
| `search <词>` | 按 ID、公开名、中文名、别名、用途、类别检索；`--type`、`--module`、`--limit` 过滤 |
| `show <条目...>` | 一个或多个条目的取用包；`--context independent|scene|create|mount|recipe|public|authoring|tool` 选择上下文 |
| `read <条目> <资源键>` | 读 `api`/`source`/`demo`/`example`/`fragment`/`control` 等条目声明的资源；`--offset`、`--limit` 分页，`--file <路径>` 读明确文件 |

退出码：`0` 成功（空搜索也是成功），`1` 未找到/读取失败/上下文不匹配，`2` 参数错误。JSON 错误也写到标准输出，便于调用方解析；日志和结果不混在一起。

## 四类操作

| 命令 | 什么时候使用 | 主要返回 | 避免的额外负担 |
| --- | --- | --- | --- |
| `info` | 新接手、库位置或资料范围不清 | 库位置、资料覆盖、现行入口和加载方式 | 不每轮重新检查；不默认列出全部源码和历史状态 |
| `search` | 不知道具体名称或希望比较能力 | 名称、类型、用途、关键边界、匹配依据和后续入口 | 不默认返回完整 API、长示例或构建产物 |
| `show` | 已选定资产，准备调用或组合 | 当前上下文的用法、必要依赖、边界、最小示例及相关入口 | 尽量一次取得开工资料，支持多个明确条目一起读取 |
| `read` | 对某个接口、示例或实现仍有疑问 | 指定文档主题、完整小节、示例或源码片段 | 不要求重新搜索，不一次输出所有关联文件 |

知道准确 ID 或公开名可以直接 show；已有有效资料可以直接制作。四类操作是可选入口，不是每个任务必须依次经过的四道流程。

## 目录与资料来源

完整组件清单作为基础目录，查询语料补充作者用途、别名、边界和关联。未补写精选语料的组件仍应能按已有名称、ID、类别和用途查到；不能把未命中语料当成能力不存在。

| 信息 | 维护来源 | 查询时怎样使用 |
| --- | --- | --- |
| 现有组件 ID、公开名、模块、文件与依赖 | `src/manifests`；构建生成 registry | 复用既有身份和依赖，不另维护组件总表 |
| 参数和接入契约 | 模块 API、公共编排层文档 | 按主题或调用上下文取出当前正文 |
| 作者用语、适用性、相近资产区别 | 查询语料中必要的补充描述 | 转为少量可检索元数据；保留来源引用 |
| 最小调用、组合骨架和完整例子 | 当前文档、examples、gallery 的维护源 | 区分片段、骨架和完整示例，给出实际来源 |
| 配方与公共接法 | 配方代码、公共 API、作者示例 | 作为不同类型条目定位，不算新增基础组件 |
| 阅读及制作共识 | 设计共识、提示词撰写 | Skill 保留关键正文，工具按需提供进一步资料 |

查询语料不是全部 API 的第二维护源。补充元数据只保存定位与选择所需的短内容及引用，详细接口继续由现行 API 文档维护。CLI 在查询时直接读取 `src/manifests`、语料 Markdown、文档、源码与 examples，不生成额外索引服务；因此资料修改后无需先构建，查询也不会自动构建。

清单与 API 差异需要先在维护源对齐，再按现有构建同步；查询程序不自行猜测冲突。尤其不能把 I07 旧限制作为现行规则输出。

## 搜索结果

搜索需要覆盖组件、组合块、配方、公共接法、设计基础和交付工具，并明确结果类型。范围和类别可以筛选，但作者只知道用途时也应能直接搜索。

优先利用明确名称、ID、别名及用途词，再做轻量的相关度排序。中文和英文叫法均可收集；不需要语义模型或根据课程名自动推荐教学方案。

每个结果至少能回答：

- 这是哪个资产、属于哪一类？
- 实际能做什么？
- 有哪些会影响选择的主要限制？
- 根据哪个名称、别名或用途找到？
- 接下来可以取哪份用法或示例？

精选说明的覆盖程度与组件技术状态、用户体验评价分别表示。缺少精选说明时使用已对齐的基础资料并明确范围，不补造功能。无结果时交代搜索范围及可继续查找的位置；“本批语料未覆盖”“条目不存在”“资料引用失效”不是同一个情况。

## show 的默认取用包

show 是减少反复查询的重点。默认围绕已选资产返回一个紧凑的取用包，而不是仅打印若干路径。

| 内容 | 默认应提供什么 |
| --- | --- |
| 身份和用途 | 稳定 ID 或公开名、类型、当前用途 |
| 调用上下文 | 独立调用、公共层接入或配方装配；若存在不同入口，清楚列出区别 |
| 最小用法 | 当前接口和必要输入；直接引用维护源，缺少完整示例时如实说明 |
| 依赖与加载 | 先提供简单可用的整库方式；需要按模块时再展开当前上下文的依赖 |
| 关键限制 | 会影响调用或组合的限制，不默认携带历史验收流水 |
| 相关入口 | 完整 API、选定示例、实现源码以及必要的相关资产 |
| 来源 | 每段重要说明或代码来自哪里，是否仍有未对齐资料 |

同一资产有多种上下文而请求未指明时，返回简短入口区别，让 Agent 选择；不默默混合不同参数。后续支持按上下文直接取资料，避免重复歧义。

- `scene` 上下文的依赖按“demo-runtime + 该组件所属模块闭包”合并列出（如 D01/D02 含 `viz-objects`，C13 含 `ui-content`），不再只给 `core + demo-runtime`；默认舞台的 `demo-ui` 作为可选补充说明。
- 构建工具条目按 Node 工具组织：不附整库 CSS/JS、不附 demo-runtime，依赖标为 Node 内置模块。
- 验证工具条目另按 Node 工具运行条件组织：不附整库/demo-runtime，但明确列出 `tests/tools/node_modules/playwright-core` 与本机浏览器；不会把“浏览器组件模块依赖”混成“工具运行条件”。
- 不带上下文的 show 返回条目实际可用的上下文；请求不支持的上下文时，缺失项返回 `availableContexts` 和可执行的 `show ... --context ...` 提示，不套用其他入口。
- 已知 Adapter 的用法直接写出其真实模式（matrix 只 `cut/update`，expression 只 `layout/cut`）；资料未确认的 Adapter 明确说“支持范围未确认”，不拿包含全部模式的通用骨架冒充具体用法。

`read` 的文档章节以显式锚点所属标题为起点，兼容锚点在标题前或标题后；读到下一条同级或更高级标题为止，不把后续无关章节混入。`public:progress` / `public:attention` 已指向各自的作者小节锚点（`author-progress` / `author-attention`），`control` 资源指向 `author-scene-control` 的受控视觉接管生命周期；不会从整个 Adapter 大章开头开始，分页与继续读取仍保留。

语料把完整示例（`example`）、局部接入片段（`fragment`）和实现源码（`source`）分开命名；查询 Q18/Q19 会同时给出连续画面最小示例和对应片段，避免把示例片段当完整作品或把源码当可直接运行的示例。

依赖必须对应实际入口。例如 I07 的运行核心与 NoteDemo.mount 默认舞台所需模块不同，不能只把 I07 条目中的 core 依赖当作 mount 的完整加载要求。

默认包不展开所有源码、不递归读完全部相关资产、不内联整个离线预览。调用文档中的带占位符骨架，应明确标为骨架；源码片段应明确其上下文，不能称为独立可运行示例。

## 取用包示例

### D01：独立呈现序列

Agent 已确定使用 `NoteViz.Sequence`，需要知道怎样显示内容并更新。

- 身份与用途：D01，等宽位、字节或盒子序列，支持稳定对象 ID 和明确标记。
- 调用：给出当前 mount 与更新用法，标明 items、对象身份和相应显示配置；详细可选参数继续读取 D01 API。
- 边界：独立更新直接呈现状态，不自动生成完整插入过程；等宽格不适合表示字段真实长度。
- 加载：提供现有整库入口，按需再取 viz-objects 及其依赖。
- 示例与出处：[D01 API](viz-objects.md#D01)、[独立入口](../examples/run.html?id=D01)。
- 相关：需要现成插入让位时比较 R10；需要一般 scene 协调时查 sequence Adapter。这些先给短说明和入口，不自动全部展开。

### 作者配方：focusWorkbench

Agent 已决定采用“依据—处理—读数”的区域结构，需要减少布局和接线。

- 身份与用途：`NoteDemoRecipes.focusWorkbench`，代码配方，没有独立组件 ID。
- 调用：提供 sources、process 和可选 readout/result 的区域组织方式，说明仍需作者提供 bindings、初态和步骤。
- 输出：配置交给既有 NoteDemo.mount；配方不拥有另一套播放器。
- 加载与边界：默认舞台及其布局、内容等依赖按当前分发核对；区域结构需要适合当前作品，不作为所有笔记的固定模板。
- 示例与出处：[配方说明](取用与组合.md)、[配方实现](../src/demo/recipes.js)、[作者入口](../examples/authoring/index.html)。
- 示例角色：当前文档的简短配置是装配骨架，作者入口是完整实例；不混称为同一种最小可运行代码。

### 公共接法：连续进度驱动

Agent 需要让自定义图形沿一个过程连续变化，查询 `type:'progress'` 的接入。

- 身份与用途：I07 下的接法主题，不是新的图形组件；可用明确的主题标识定位，名称在实施时统一。
- 调用：提供 PreparedChange/effects 与 progress spec 的有关契约，说明 update(progress) 接收已应用 easing 的 0–1 进度。
- 作者提供：领域换算、绘制函数、可恢复状态及真实目标；公共层负责受控推进、取消和完成。
- 关键限制：progress 终态由 update(1) 保持，不声明 handoff:'hold'；涉及 attention 分组时再取对应契约。
- 示例与出处：[公共 API](公共编排层.md)、[传播 Adapter](../examples/propagation/adapter.js)、[连续绘制片段](../examples/propagation/graph.js)。
- 示例角色：传播例采用逐层追加结构；给出相关接口和片段，并注明结构，不声称它就是任意连续领域时间作品的完整模板。

这些样本已对应实际 `show` 结果的取用组织；CLI 不在查询时重新撰写示例或推导知识。没有满足“最小可运行”条件的现有例子时，明确提供契约与参考片段，把资料缺口留下。

## read 与长内容

读取对象应能沿条目的引用定位到 API 小节、指定用例或源码。优先返回维护源中的完整有关单元，明确资源身份与所在文件。

内容较长时显示尚有哪些单元可读，并支持继续读取；不能按任意字符数把代码、参数说明或重要限制切到一半又隐藏截断。必要时支持按源码范围查看，但普通使用不应先依赖作者猜行号。

资源定位采用明确引用，不调用不明来源的示例脚本，也不为提供资料启动浏览器。查询中的代码是信息，实际执行按制作任务进行。

## 输出与失败处理

提供稳定 JSON 供 Agent 使用，人工阅读可选择简洁文本；二者表达同一份信息。诊断与结果分开，参数错误和读取失败用明确的非零退出状态，空搜索本身不是程序崩溃。

批量 show 应逐项说明取到什么、哪项不存在或资料不足，不把未找到的部分填成默认成功结果。未知的上下文或类型应提示有效选择，不能静默套用另一套接口。

不引入复杂分页服务、会话记录或恢复框架；静态资料按行分页，返回 `remaining` 与 `nextOffset`，不静默截断。

## Skill 如何使用

Skill 主体及参考正文继续承接[既有提示词与共识](提示词撰写.md#skill-content-inheritance)。CLI 提供事实和接法，Skill指导何时查询、如何判断与何时结束；不能只留下工具步骤而丢掉阅读和演示要求。

新制作可以先按能力搜索，再取已选资料；已知资产可直接 show；局部修改沿用有效上下文，只查改变的接口；具体故障再进入完整契约或源码。工具未命中时不无休止改词，也不据此宣称库没有能力。

## 资料覆盖与维护

- 查询语料以 Markdown 为唯一检索元数据，组件身份来自 `src/manifests`；配方、公共接法、作者辅助、构建/验证工具与完整示例有独立条目 ID，不增加组件计数。
- `show` 的 api/source/demo/example/fragment/control 资源来自 manifest 和语料引用；`read` 从维护文档、源码、examples 读取，不执行代码、不启动浏览器。
- 用 `tests/checks/query-cli-check.mjs` 检查真实查询、JSON、工程外调用和失败路径。

## 已知限制

- 查询语料覆盖 23 个组件和 19 个主题/工具/示例条目；其余 82 个条目的名称、ID、类别和用途能查，但没有补充别名/适用边界。
- 搜索是本地子串与少量身份/前缀排序，不做中文分词、语义检索或课程主题推荐；未命中不代表库缺能力。
- 资源引用失效时 `read` 明确失败，不会回退到另一接口；条目跨文档的完整参数仍由现行 API 文档维护。
- `read` 按行分页，超长代码/小节需要继续读取；不提供全文归档或浏览器运行结果。
- `public:timing-facts` 的 `watch()` 按会话 `session.__sessionId` 隔离，只收同一会话事实；`collect()` 是全局收集并保留 `sessionId`，两者都默认关闭、只在内存、不写文件。
- [html-note-authoring](../skills/html-note-authoring/SKILL.md) 连接 CLI，并随附制作底稿、共识与验证正文。
