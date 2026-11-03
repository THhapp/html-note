/* 查询专用非组件条目。
 * 这些条目只属于 Node 查询层，不进入浏览器运行包；组件元数据在 src/manifests/*.json 的 entry.query。
 * 路径统一从库根解析；ID/type/runtime 保持稳定，不保留旧语料 Q 编号与自然语言 schema。
 */
export const TOPICS = [
  {
    "id": "recipe:focusWorkbench",
    "name": "NoteDemoRecipes.focusWorkbench",
    "cn": "依据—处理—读数区域配方",
    "type": "配方",
    "category": "代码配方；`NoteDemoRecipes.focusWorkbench`，目前不是独立组件 ID。",
    "purpose": "复用区域布局、槽位收集与清理，返回可交给 NoteDemo.mount 的配置。",
    "limits": [
      "适合依据和处理区域需要共同可见的作品；作者仍提供数据、停点、变化及注意顺序。它不是完整笔记，也不适合未经判断就套到任意全幅图形。"
    ],
    "terms": [
      "作者骨架",
      "依据区",
      "处理区",
      "读数区",
      "组合配方",
      "focus",
      "workbench",
      "recipe"
    ],
    "aliases": [
      "focusWorkbench",
      "配方说明",
      "配方源码",
      "作者示例"
    ],
    "resources": [
      {
        "path": "docs/取用与组合.md",
        "anchor": "作者入口与配方",
        "key": "api"
      },
      {
        "path": "src/demo/recipes.js",
        "key": "source"
      },
      {
        "path": "examples/authoring/index.html",
        "key": "example"
      }
    ],
    "runtime": "recipe",
    "moduleDependencies": [
      "demo-ui"
    ],
    "usage": "`NoteDemoRecipes.focusWorkbench({ bindings, initial, steps, sources, process, readout?, result? })`；作者仍提供数据、初态、步骤和注意顺序。",
    "notes": "文档中的简短配置是装配骨架；完整实例是 `examples/authoring/index.html`。",
    "regionDependencies": {
      "caller": true,
      "groups": []
    }
  },
  {
    "id": "public:progress",
    "name": "EffectSpec type:'progress'",
    "cn": "自定义图形连续进度",
    "type": "公共接法",
    "category": "I07 接入主题；EffectSpec `type:'progress'`，不是新增图形组件。",
    "purpose": "由公共 scene 驱动 0–1 进度，作者通过 update(progress) 同步更新有关图元。",
    "limits": [
      "领域时间换算和绘制由作者负责；回调收到应用 easing 后的进度，不能把某个属性提前达到舍入值当作句柄提前结束。终态由 update(1) 落位，progress 不声明 handoff:'hold'。"
    ],
    "terms": [
      "连续展开",
      "沿时间推进",
      "前沿移动",
      "轨迹增长",
      "progress",
      "update",
      "custom",
      "SVG"
    ],
    "aliases": [
      "EffectSpec",
      "type:'progress'",
      "连续画面最小示例",
      "局部绘制片段",
      "传播示例"
    ],
    "resources": [
      {
        "path": "docs/公共编排层.md",
        "anchor": "author-progress",
        "key": "api"
      },
      {
        "path": "src/demo/effects.js",
        "key": "source"
      },
      {
        "path": "examples/continuous-scene/index.html",
        "key": "example"
      },
      {
        "path": "examples/continuous-scene/scene.js",
        "key": "fragment"
      },
      {
        "path": "docs/公共编排层.md",
        "anchor": "author-scene-control",
        "key": "control"
      }
    ],
    "runtime": "public",
    "moduleDependencies": [
      "demo-runtime"
    ],
    "usage": "`PreparedChange.effects()` 返回 `{ type:'progress', duration, delay?, easing?, update(progress), group?, gate? }`；`update` 收到已应用 easing 的 0–1，由 scene 统一启动/取消/finished/清理。",
    "notes": "`examples/continuous-scene/` 是完整可运行的最小接法，受控容器由公共层统一暂停 CSS transition；传播 Adapter 是另一份逐层追加的完整示例；`src/demo/effects.js` 是公共实现。三者角色不同，不能把片段或源码当完整模板。"
  },
  {
    "id": "public:attention",
    "name": "scene.attention",
    "cn": "聚焦到达与内容分组放行",
    "type": "公共接法",
    "category": "I07 接入主题；scene.attention、效果组与观察范围。",
    "purpose": "作者明确观察目标及关联内容，公共层在真实到达后启动对应效果，按实际可承接状态交接视线。",
    "limits": [
      "groups 省略、空数组、非空数组分别有不同含义；仅声明效果组的 Adapter 支持组级放行。工具不推断教学重点，观察范围应指向真实内容，不能默认一项动效必配一次焦点移动。local 支持绝对 dx/dy/width/height 或相对 outset/inset（CSS px，二选一）；union refs 可声明 optional:true；display:none、断开等无效布局不参与几何，不退化整屏。local 支持绝对 dx/dy/width/height 或相对 outset/inset（CSS px，二选一）；union refs 可声明 optional:true；display:none/断开等无效布局不参与几何，不退化整屏。"
    ],
    "terms": [
      "注意顺序",
      "焦点到达后变化",
      "分组放行",
      "局部观察",
      "attention",
      "effect",
      "groups",
      "union",
      "range"
    ],
    "aliases": [
      "attention 与 groups",
      "协调源码",
      "最小示例 Definition"
    ],
    "resources": [
      {
        "path": "docs/公共编排层.md",
        "anchor": "author-attention",
        "key": "api"
      },
      {
        "path": "src/demo/scene-attention.js",
        "key": "source"
      },
      {
        "path": "examples/continuous-scene/index.html",
        "key": "example"
      },
      {
        "path": "examples/continuous-scene/demo.js",
        "key": "fragment"
      },
      {
        "path": "docs/公共编排层.md",
        "anchor": "author-scene-control",
        "key": "control"
      }
    ],
    "runtime": "public",
    "moduleDependencies": [
      "demo-runtime"
    ],
    "usage": "`scene: { bindings:[...], attention:{ targets:[{binding,query,groups?,holdDuration?,range?}], stepDuration? } }`；groups 省略=整 Binding 门控、`[]`=只观察、非空=按组放行。",
    "notes": "`examples/continuous-scene/demo.js` 是双组按焦点放行的接入片段；传播 `demo.js` 是另一条真实观察路线示例；受控内容的 CSS transition 由公共 Binding 容器统一接管，不靠 Adapter 或示例自己暂停。独立 Focus 组件不等于已协调内容启动。"
  },
  {
    "id": "public:handoff",
    "name": "sourceElements / handoff:'hold'",
    "cn": "来源保持与局部终态交接",
    "type": "公共接法",
    "category": "I07 接入主题；sourceElements、WAAPI handoff:'hold'。",
    "purpose": "在目标提交和局部变化期间保留必要来源，或在局部效果结束后保持目标画面，避免交接空白与回落。",
    "limits": [
      "来源元素需要仍在 DOM 中，不能恢复已移除对象或父级整体隐藏；hold 适用于目标内容类 WAAPI 效果，progress 的终态由自身回调保持。它不负责修正任意作者重绘造成的跳变。"
    ],
    "terms": [
      "来源保留",
      "文字闪现",
      "内容回落",
      "交接",
      "source",
      "elements",
      "handoff",
      "hold"
    ],
    "aliases": [
      "sourceElements",
      "handoff:'hold'",
      "来源与终态交接",
      "完整契约",
      "普通 DOM 示例"
    ],
    "resources": [
      {
        "path": "docs/公共编排层.md",
        "anchor": "5-adapter-接入",
        "key": "api"
      },
      {
        "path": "src/demo/effects.js",
        "key": "source"
      },
      {
        "path": "examples/authoring/handoff-demo.js",
        "key": "example"
      }
    ],
    "runtime": "public",
    "moduleDependencies": [
      "demo-runtime"
    ],
    "usage": "`sourceElements?() -> Element[]` 声明仍需观察的来源；`EffectSpec.handoff:'hold'` 让 WAAPI 目标内容在正常完成后保持末帧到 scene 收束；progress 不使用 handoff。",
    "notes": "`examples/authoring/handoff-demo.js` 是普通 DOM 完整小例；传播 Adapter 是 SVG 消费例。"
  },
  {
    "id": "authoring:shorthand",
    "name": "NoteDemo.compile / collectSlots",
    "cn": "作者状态简写与槽位收集",
    "type": "作者辅助",
    "category": "作者辅助；`NoteDemo.compile` / `NoteDemo.collectSlots`。",
    "purpose": "由初态与逐步替换生成完整停点定义，并收集、检查组件容器，减少机械接线。",
    "limits": [
      "按整个接入对象替换视图，不深合并、不推断动作或知识因果。slot 是供组件挂载的命名容器，不是知识单元。"
    ],
    "terms": [
      "状态简写",
      "初态",
      "步骤替换",
      "槽位",
      "authoring",
      "compile",
      "slots"
    ],
    "aliases": [
      "NoteDemo.compile",
      "collectSlots",
      "compile / collectSlots",
      "shorthand",
      "作者简写",
      "作者辅助源码",
      "状态展开源码"
    ],
    "resources": [
      {
        "path": "docs/取用与组合.md",
        "anchor": "槽位布局与作者简写",
        "key": "api"
      },
      {
        "path": "src/demo/authoring.js",
        "key": "source"
      },
      {
        "path": "examples/authoring/data.js",
        "key": "example"
      }
    ],
    "runtime": "authoring",
    "moduleDependencies": [
      "demo-runtime"
    ],
    "usage": "`NoteDemo.compile({ bindings, initial, steps })`；`NoteDemo.collectSlots(root, ['main'])`。",
    "notes": "完整数据实例见 `examples/authoring/data.js`；简写不推断知识因果。"
  },
  {
    "id": "tool:demo-preview",
    "name": "build-demo-preview.mjs",
    "cn": "分文件制作与单文件交付",
    "type": "构建工具",
    "category": "构建工具；`scripts/build-demo-preview.mjs`。",
    "purpose": "制作时保留分开的 HTML、CSS、经典 JavaScript，交付时把模板已列出的本地资源内联为独立 HTML。`--help` 可在不读取模板时查看参数、输出和限制。",
    "limits": [
      "不自动生成课程内容、不根据组件关系补齐脚本清单；作者应先在模板中列出正确资源。它是制作期工具，读者打开成品不需要启动构建进程。"
    ],
    "terms": [
      "单文件",
      "内联",
      "离线",
      "分文件制作",
      "HTML打包",
      "standalone",
      "inline",
      "offline",
      "help",
      "退出码"
    ],
    "aliases": [
      "build-demo-preview",
      "mjs",
      "demo-preview",
      "加载与离线交付",
      "构建与分发",
      "内联器"
    ],
    "resources": [
      {
        "path": "docs/构建与分发.md",
        "anchor": "1-命令",
        "key": "api"
      },
      {
        "path": "scripts/build-demo-preview.mjs",
        "key": "source"
      }
    ],
    "runtime": "tool",
    "moduleDependencies": [],
    "usage": "`node scripts/build-demo-preview.mjs --template <入口.html> --output <独立.html>`。",
    "notes": ""
  },
  {
    "id": "tool:inspect-note",
    "name": "inspect-note.mjs",
    "cn": "本地浏览器观察与作品量测",
    "type": "验证工具",
    "category": "验证工具；`scripts/inspect-note.mjs` 与共享启动库 `scripts/lib/note-browser.mjs`。",
    "purpose": "提交后直接打开成品，收集页面错误/控制台错误/外部请求，按需恢复指定停点、截图或执行作品专属量测，并在正常结束/失败时释放自己创建的浏览器资源。`--frame` 只调用真实 `session.go(frameId)` 定位停点，不暗播中间步骤；`--session` 与 probe 的 inspect 辅助可在同一页面完成推进、等待、状态读取和过程采样。",
    "limits": [
      "默认无头且不写输出文件；打开成功不等于作品验收通过，`ok` 是工具执行事实，观察结果和 probe 结果要分开读。`go()` 只证明停点恢复；要证明动画、焦点或内容放行，用 `next()/replay()` 实际推进。缺少环境时返回具体诊断，不自动安装或轮换多套验证通道。"
    ],
    "terms": [
      "本地验证",
      "观察",
      "量测",
      "截图",
      "停点",
      "指定停点",
      "Frame",
      "--frame",
      "probe",
      "playwright",
      "Edge",
      "inspect-note",
      "页面错误",
      "外部请求",
      "session",
      "sample",
      "box",
      "waitIdle",
      "观察入口",
      "自定义画面"
    ],
    "aliases": [
      "mjs",
      "自定义画面接入",
      "最小宿主",
      "共享启动库",
      "入口实现"
    ],
    "resources": [
      {
        "path": "docs/公共编排层.md",
        "anchor": "author-inspect-note",
        "key": "api"
      },
      {
        "path": "docs/公共编排层.md",
        "anchor": "author-inspect-note",
        "key": "guide"
      },
      {
        "path": "examples/continuous-scene/minimal.html",
        "key": "example"
      },
      {
        "path": "scripts/inspect-note.mjs",
        "key": "source"
      },
      {
        "path": "scripts/lib/note-browser.mjs",
        "key": "fragment"
      }
    ],
    "runtime": "tool",
    "moduleDependencies": [],
    "usage": "`node scripts/inspect-note.mjs \"<成品.html>\" [--frame <frameId>] --json`；按需加 `--session <表达式>`、`--screenshot <绝对路径>`、`--probe <probe模块绝对路径>`、`--width`、`--height`、`--browser <可执行文件绝对路径>`。最终参数以 `--help` 与实现为准。",
    "notes": "工具入口。probe 是调用方本地模块，导出 `default async ({ page }) => ...`，复用同一个已打开页面；不是第二套浏览器实现。"
  },
  {
    "id": "example:continuous-scene",
    "name": "连续画面局部变化最小示例",
    "cn": "连续画面局部变化最小示例",
    "type": "完整示例",
    "category": "完整示例；`examples/continuous-scene/`，不是组件或第二套 API。",
    "purpose": "演示同一个 Binding 按含义声明 `left` / `right` 两个效果组，两个 attention 目标依次放行；未放行面板保持来源视觉，辅助记录在 commit 时只写目标已提交/等待放行，真实显现状态跟随 progress 或终态；readView 返回目标模型。可作为分步演示示例与最小连续画面接法，并演示 sceneAdapter/timingFacts 的按需用法。",
    "limits": [
      "展示接法和文件职责，不复制具体作品的拓扑、颜色、时长或步骤数；题材、领域值和页面布局由作者按当前任务提供。正常连续推进承接上一观察位置，取消、恢复、减少动效沿用公共层。"
    ],
    "terms": [
      "连续画面",
      "自定义画面",
      "局部变化",
      "画面接入",
      "最小宿主",
      "完整示例",
      "两个区域",
      "效果组",
      "分组放行",
      "groups",
      "attention",
      "progress",
      "最小示例",
      "分步演示示例",
      "continuous",
      "scene"
    ],
    "aliases": [
      "continuous-scene",
      "自定义画面接入",
      "Adapter 片段",
      "Definition 片段"
    ],
    "resources": [
      {
        "path": "docs/公共编排层.md",
        "anchor": "author-continuous-example",
        "key": "api"
      },
      {
        "path": "docs/取用与组合.md",
        "anchor": "author-custom-scene",
        "key": "guide"
      },
      {
        "path": "examples/continuous-scene/scene.js",
        "key": "source"
      },
      {
        "path": "examples/continuous-scene/index.html",
        "key": "example"
      },
      {
        "path": "examples/continuous-scene/demo.js",
        "key": "fragment"
      },
      {
        "path": "examples/continuous-scene/minimal.html",
        "key": "minimal"
      }
    ],
    "runtime": "example",
    "moduleDependencies": [
      "demo-ui"
    ],
    "usage": "`node scripts/inspect-note.mjs \"examples/continuous-scene/minimal.html\" --json`；完整示例用同目录 `index.html`。",
    "notes": "完整示例；`scene.js` 是局部绘制片段，`adapter.js` 使用 `NoteDemo.sceneAdapter`，`demo.js` 是 Definition/attention 与对外时序观察片段，`src/demo/*` 是实现源码。"
  },
  {
    "id": "example:flow-kit",
    "name": "流程与连接图形中性示例",
    "cn": "流程图形中性示例",
    "type": "完整示例",
    "category": "完整示例；`examples/flow-kit/`，四种独立图形的最小用法。",
    "purpose": "演示四个图形的挂载、状态更新、稳定 target、零长度/尺度分离、路径采样和显式按钮交互。",
    "limits": [
      "中性示例，不含 PPP/VLAN/自学习规则；不是课程笔记，也不替代 NoteDemo scene 示例。"
    ],
    "terms": [
      "流程图形",
      "阶段轨",
      "消息流",
      "分段长度",
      "设备连接",
      "端口",
      "连接",
      "路径",
      "传播",
      "flow",
      "kit",
      "独立图形",
      "中性示例"
    ],
    "aliases": [
      "flow-kit",
      "图形说明",
      "示例入口",
      "公共基础源码"
    ],
    "resources": [
      {
        "path": "docs/viz-flow.md",
        "anchor": "flow-kit-example",
        "key": "api"
      },
      {
        "path": "src/viz/flow-core.js",
        "key": "source"
      },
      {
        "path": "examples/flow-kit/index.html",
        "key": "example"
      },
      {
        "path": "examples/flow-kit/flow-kit.js",
        "key": "fragment"
      }
    ],
    "runtime": "example",
    "moduleDependencies": [
      "viz-flow"
    ],
    "usage": "`node scripts/inspect-note.mjs \"examples/flow-kit/index.html\" --json`。",
    "notes": "`examples/flow-kit/index.html` 是页面，`flow-kit.js` 是宿主接线；四个图形源码在 `src/viz/flow-core.js` 与 `flow-stage.js`、`flow-packet.js`、`flow-segment.js`、`flow-device.js`。"
  },
  {
    "id": "public:continuous-adapter",
    "name": "NoteDemo.sceneAdapter",
    "cn": "自定义 scene Adapter 辅助",
    "type": "公共接法",
    "category": "I07 接入主题；NoteDemo.sceneAdapter。",
    "purpose": "减少自定义 Adapter 的 commit/targets/effects/cleanup 胶水，统一减少动效、恢复和最终 timing。",
    "limits": [
      "helper 不拥有视图、不建播放器、不推断领域变化；planStep 必须同步提交目标或返回 Promise。"
    ],
    "terms": [
      "Adapter",
      "辅助",
      "自定义图形",
      "自定义画面",
      "连续画面",
      "局部变化",
      "画面接入",
      "最小宿主",
      "完整示例",
      "scene",
      "接入",
      "PreparedChange",
      "progress",
      "sceneAdapter",
      "reduced"
    ],
    "aliases": [
      "continuous-adapter",
      "自定义画面接入",
      "示例 Adapter",
      "源码"
    ],
    "resources": [
      {
        "path": "docs/公共编排层.md",
        "anchor": "author-scene-adapter",
        "key": "api"
      },
      {
        "path": "docs/取用与组合.md",
        "anchor": "author-custom-scene",
        "key": "guide"
      },
      {
        "path": "src/demo/scene-adapter.js",
        "key": "source"
      },
      {
        "path": "examples/continuous-scene/minimal.html",
        "key": "example"
      },
      {
        "path": "examples/continuous-scene/adapter.js",
        "key": "fragment"
      },
      {
        "path": "examples/continuous-scene/index.html",
        "key": "full"
      }
    ],
    "runtime": "public",
    "moduleDependencies": [
      "demo-runtime"
    ],
    "usage": "`NoteDemo.sceneAdapter.define({ name, normalizeView, mount })`；`planStep(input)` 返回 commit/groups/effects/cleanup；`effects(timing)` 使用最终 timing，`progress({update,duration,easing,group})` 生成进度 spec。",
    "notes": "`examples/continuous-scene/adapter.js` 是消费片段，`minimal.html` 是最小可运行宿主，`index.html` 是完整连续示例；内部 scene 仍负责效果、ready/finished、取消和恢复。"
  },
  {
    "id": "public:timing-facts",
    "name": "NoteDemo.timingFacts",
    "cn": "场景时序事实观察",
    "type": "公共接法",
    "category": "I07 接入主题；NoteDemo.timingFacts。",
    "purpose": "按会话、Frame、Binding 与组区分实际启动、可承接与完成，减少探针猜测。",
    "limits": [
      "只记录安装后的运行；`watch()` 按 `session.__sessionId` 隔离，只收同一会话事实，缺少稳定 sessionId/已销毁会话会明确报错；`collect()` 全局收集并保留 `sessionId` 供自行分组。`stop()` 后退订并清回调引用，已采集数据保留；会话销毁时 recorder 自动停止。summary 按 sessionId+run 分组，同名 Frame 跨会话不合并。"
    ],
    "terms": [
      "时序",
      "观察",
      "采样",
      "focus",
      "到达",
      "ready",
      "finished",
      "timing",
      "facts",
      "probe"
    ],
    "aliases": [
      "timingFacts",
      "timing-facts",
      "时序事实",
      "示例观察入口"
    ],
    "resources": [
      {
        "path": "docs/公共编排层.md",
        "anchor": "author-timing-facts",
        "key": "api"
      },
      {
        "path": "src/demo/timing-facts.js",
        "key": "source"
      },
      {
        "path": "examples/continuous-scene/index.html",
        "key": "example"
      },
      {
        "path": "examples/continuous-scene/demo.js",
        "key": "fragment"
      }
    ],
    "runtime": "public",
    "moduleDependencies": [
      "demo-runtime"
    ],
    "usage": "`var rec=NoteDemo.timingFacts.watch(session,{onFact}); session.next(); rec.summary(); rec.stop();`",
    "notes": "只在内存、不写文件、不参与运行决策；用于探针或调试，不是播放 API。"
  },
  {
    "id": "public:table-adapter",
    "name": "table Adapter",
    "cn": "表格 scene Adapter",
    "type": "公共接法",
    "category": "I07 接入主题；`table` Adapter（C06 NoteUI.Table）。",
    "purpose": "按稳定行/列键提交完整目标表格，局部值变化和行状态用 cell/row 组表达。",
    "limits": [
      "update 不支持列结构（键/顺序/对齐/sortable）变化和重复行键，需改用 cut/reveal；DOM/函数只放 options；空态文本读回为 emptyText。Adapter 默认 `stableStateLabels:true`，每行常驻隐藏状态标签槽（5 行表约 261→361px 高度代价，无固定 min-height/不裁切正文）；binding options 可显式 false。canonical/getState/readModel 不因该选项改变。"
    ],
    "terms": [
      "表格",
      "scene",
      "table",
      "adapter",
      "canonical",
      "cell",
      "target",
      "row",
      "emptyText",
      "局部更新"
    ],
    "aliases": [
      "Adapter",
      "table-adapter",
      "Adapter 表",
      "C06",
      "流程组合示例"
    ],
    "resources": [
      {
        "path": "docs/公共编排层.md",
        "anchor": "5-1-内置-adapter-的视图与目标",
        "key": "api"
      },
      {
        "path": "src/demo/adapters/table.js",
        "key": "source"
      },
      {
        "path": "examples/flow-composition/index.html",
        "key": "example"
      }
    ],
    "runtime": "public",
    "moduleDependencies": [
      "demo-runtime",
      "ui-content"
    ],
    "usage": "Binding 写 `{ adapter:'table', slot:'table', options:{ rowKey:'key' } }`；视图 `{columns,rows,sort,emphasis,caption,empty,dense,maxHeight}`。",
    "notes": "scene 接入，不是新组件；完整示例见流程组合。"
  },
  {
    "id": "public:flow-stage-adapter",
    "name": "flow-stage Adapter",
    "cn": "阶段轨 scene Adapter",
    "type": "公共接法",
    "category": "I07 接入主题；`flow-stage` Adapter（D07 StageTrack）。",
    "purpose": "按阶段/旁路变化生成 `stage:<id>` / `bypass:<from>><to>` 组，局部提示阶段状态。",
    "limits": [
      "sceneModes 只有 cut/update；不推断业务阶段推进或分支剧情；视图只接受可序列化数据。"
    ],
    "terms": [
      "阶段轨",
      "scene",
      "flow-stage",
      "stage",
      "adapter",
      "阶段状态",
      "旁路",
      "target"
    ],
    "aliases": [
      "Adapter",
      "flow-stage-adapter",
      "D07",
      "scene Adapter",
      "流程组合示例"
    ],
    "resources": [
      {
        "path": "docs/公共编排层.md",
        "anchor": "5-1-内置-adapter-的视图与目标",
        "key": "api"
      },
      {
        "path": "src/demo/adapters/flow-stage.js",
        "key": "source"
      },
      {
        "path": "examples/flow-composition/index.html",
        "key": "example"
      }
    ],
    "runtime": "public",
    "moduleDependencies": [
      "demo-runtime",
      "viz-flow"
    ],
    "usage": "Binding 写 `{ adapter:'flow-stage', slot:'stage' }`；视图 `{stages,current,target,skipped,failed,bypass,label}`。",
    "notes": "scene 接入；完整示例见流程组合。"
  },
  {
    "id": "public:flow-packet-adapter",
    "name": "flow-packet Adapter",
    "cn": "消息流 scene Adapter",
    "type": "公共接法",
    "category": "I07 接入主题；`flow-packet` Adapter（D08 PacketFlow）。",
    "purpose": "按变化消息/参与者生成 `message:<id>` / `participant:<id>` 组，保留 type/dashed/self/status/revealed 事实。",
    "limits": [
      "不推断请求/响应、协议或接受语义；不创建播放器或计时器；只支持 cut/update。"
    ],
    "terms": [
      "消息流",
      "scene",
      "flow-packet",
      "报文",
      "adapter",
      "消息",
      "target",
      "participant",
      "逐步显现"
    ],
    "aliases": [
      "Adapter",
      "flow-packet-adapter",
      "D08",
      "B08",
      "流程组合示例"
    ],
    "resources": [
      {
        "path": "docs/公共编排层.md",
        "anchor": "5-1-内置-adapter-的视图与目标",
        "key": "api"
      },
      {
        "path": "src/demo/adapters/flow-packet.js",
        "key": "source"
      },
      {
        "path": "examples/flow-composition/index.html",
        "key": "example"
      }
    ],
    "runtime": "public",
    "moduleDependencies": [
      "demo-runtime",
      "viz-flow"
    ],
    "usage": "Binding 写 `{ adapter:'flow-packet', slot:'packet', options:{ showIndexes:true } }`；视图 `{participants,messages,revealed|visibleCount,focus,showIndexes,label}`。",
    "notes": "scene 接入；B08 也消费 PacketFlow 图形。"
  },
  {
    "id": "public:flow-segment-adapter",
    "name": "flow-segment Adapter",
    "cn": "分段长度条 scene Adapter",
    "type": "公共接法",
    "category": "I07 接入主题；`flow-segment` Adapter（D09 SegmentBar）。",
    "purpose": "按变化段/范围生成 `segment:<id>` / `range:<id>` 组，局部推进长度与范围。",
    "limits": [
      "读回含真实值与显示宽度、zero/clamped 标记；最小可读宽度会偏离严格比例；不计算协议字段或课程规则。"
    ],
    "terms": [
      "长度条",
      "scene",
      "flow-segment",
      "字段插入",
      "范围目标",
      "真实值显示宽度"
    ],
    "aliases": [
      "Adapter",
      "flow-segment-adapter",
      "D09",
      "scene Adapter"
    ],
    "resources": [
      {
        "path": "docs/公共编排层.md",
        "anchor": "5-1-内置-adapter-的视图与目标",
        "key": "api"
      },
      {
        "path": "src/demo/adapters/flow-segment.js",
        "key": "source"
      },
      {
        "path": "examples/flow-composition/index.html",
        "key": "example"
      }
    ],
    "runtime": "public",
    "moduleDependencies": [
      "demo-runtime",
      "viz-flow"
    ],
    "usage": "Binding 写 `{ adapter:'flow-segment', slot:'bar' }`；视图 `{segments,ranges,scaleMax,minWidth,label}`。",
    "notes": "scene 接入；完整示例见流程组合。"
  },
  {
    "id": "public:flow-device-adapter",
    "name": "flow-device Adapter",
    "cn": "设备连接 scene Adapter",
    "type": "公共接法",
    "category": "I07 接入主题；`flow-device` Adapter（D10 DeviceLinks）。",
    "purpose": "按变化设备/连接生成 `device:<id>` / `link:<id>` 组，局部提示连接状态。",
    "limits": [
      "读回连接含端点身份与 valid；无效端点连接跳过；不自动路由或推断网络接受规则。"
    ],
    "terms": [
      "设备连接",
      "scene",
      "设备",
      "端口",
      "连接",
      "链路",
      "adapter",
      "link",
      "target",
      "device"
    ],
    "aliases": [
      "flow-device",
      "Adapter",
      "flow-device-adapter",
      "D10",
      "scene Adapter"
    ],
    "resources": [
      {
        "path": "docs/公共编排层.md",
        "anchor": "5-1-内置-adapter-的视图与目标",
        "key": "api"
      },
      {
        "path": "src/demo/adapters/flow-device.js",
        "key": "source"
      },
      {
        "path": "examples/flow-composition/index.html",
        "key": "example"
      }
    ],
    "runtime": "public",
    "moduleDependencies": [
      "demo-runtime",
      "viz-flow"
    ],
    "usage": "Binding 写 `{ adapter:'flow-device', slot:'links' }`；视图 `{devices,links,label}`。",
    "notes": "scene 接入；路径采样仍由组件 getLinkPath/pointAt 提供。"
  },
  {
    "id": "example:flow-composition",
    "name": "流程组合示例",
    "cn": "流程组合配方示例",
    "type": "完整示例",
    "category": "完整示例；`examples/flow-composition/`，两段真实 NoteDemo 会话。",
    "purpose": "演示 `stagePacket`、`diagramTable` 与 `repeatStages` 三个配方组合阶段、报文、表格和读数；下段用公共 attention/Focus 指向当前消息表格单元。",
    "limits": [
      "中性数据与结构示例，不复制课程拓扑、数值或步骤数；配方不推断 scene/attention，变化 Binding 必须显式列出。"
    ],
    "terms": [
      "流程组合",
      "阶段报文读数",
      "图形状态表",
      "flow-composition",
      "stagePacket",
      "diagramTable",
      "repeatStages"
    ],
    "aliases": [
      "取用与组合",
      "示例 README",
      "预览"
    ],
    "resources": [
      {
        "path": "docs/取用与组合.md",
        "anchor": "作者入口与配方",
        "key": "api"
      },
      {
        "path": "examples/flow-composition/flow-composition.js",
        "key": "source"
      },
      {
        "path": "examples/flow-composition/index.html",
        "key": "example"
      },
      {
        "path": "examples/flow-composition/README.md",
        "key": "fragment"
      }
    ],
    "runtime": "example",
    "moduleDependencies": [
      "demo-ui",
      "ui-content",
      "viz-flow"
    ],
    "usage": "`node scripts/inspect-note.mjs \"examples/flow-composition/index.html\" --json`。",
    "notes": "完整示例；`flow-composition.js` 是配方接入片段，`README.md` 说明两段结构。",
    "regionDependencies": {
      "caller": false,
      "groups": [
        {
          "module": "viz-flow",
          "regions": [
            "stage",
            "packet"
          ]
        },
        {
          "module": "ui-content",
          "regions": [
            "table"
          ]
        },
        {
          "module": "core",
          "regions": [
            "readout"
          ]
        }
      ]
    }
  },
  {
    "id": "public:propagation",
    "name": "NoteViz.Flow.Propagation",
    "cn": "沿路径传播机制",
    "type": "公共接法",
    "category": "I07 接入主题；`NoteViz.Flow.Propagation`（viz-flow 模块）。",
    "purpose": "沿 SVG path 放置一个或多个稳定副本，支持区间、偏移、旋转、目标与状态查询。",
    "limits": [
      "不创建计时器/自动播放，不推断到达或接受语义；路径缺失/零长度标记 data-missing-path；副本外观可由宿主扩展。"
    ],
    "terms": [
      "传播",
      "路径",
      "路径传播",
      "沿路径",
      "副本",
      "复制",
      "progress",
      "propagation",
      "path",
      "copies",
      "offset"
    ],
    "aliases": [
      "Propagation",
      "Propagation 接口",
      "Flow Kit 示例",
      "源码"
    ],
    "resources": [
      {
        "path": "docs/viz-flow.md",
        "anchor": "propagation",
        "key": "api"
      },
      {
        "path": "src/viz/flow-core.js",
        "key": "source"
      },
      {
        "path": "examples/flow-kit/index.html",
        "key": "example"
      },
      {
        "path": "examples/flow-kit/flow-kit.js",
        "key": "fragment"
      }
    ],
    "runtime": "independent",
    "moduleDependencies": [
      "viz-flow"
    ],
    "usage": "`var rec=NoteViz.Flow.Propagation.mount(svgHost,{paths:{ab:path},copies:[{id:'p1',pathId:'ab'}]}); rec.update(0.5);`。",
    "notes": "机制；flow-kit 与传播示例都是宿主驱动用法。"
  },
  {
    "id": "recipe:composition",
    "name": "NoteDemoRecipes.stagePacket / diagramTable / repeatStages",
    "cn": "区域与步骤配方",
    "type": "配方",
    "category": "代码配方；`NoteDemoRecipes.stagePacket` / `diagramTable` / `repeatStages`。",
    "purpose": "复用区域布局、slot 收集与 Definition 展开，减少阶段/报文/表格/读数的重复接线。",
    "limits": [
      "作者仍提供数据、视图、scene 参与者和 attention；配方不推断 scene 或教学因果，不生成第二套 Frame/Transition。"
    ],
    "terms": [
      "配方",
      "区域骨架",
      "阶段报文",
      "图形状态表",
      "重复步骤",
      "stagePacket",
      "diagramTable",
      "repeatStages"
    ],
    "aliases": [
      "NoteDemoRecipes.stagePacket",
      "stagePacket / diagramTable / repeatStages",
      "composition",
      "配方说明",
      "示例",
      "源码"
    ],
    "resources": [
      {
        "path": "docs/取用与组合.md",
        "anchor": "作者入口与配方",
        "key": "api"
      },
      {
        "path": "src/demo/recipes.js",
        "key": "source"
      },
      {
        "path": "examples/flow-composition/index.html",
        "key": "example"
      }
    ],
    "runtime": "recipe",
    "moduleDependencies": [
      "demo-ui"
    ],
    "usage": "`stagePacket({definition?, bindings, initial, steps, stage?, packet?, readout?, status?})`；`diagramTable({diagram?,table?,...})`；`repeatStages({bindings,initial,items,expand})`。",
    "notes": "装配骨架；完整实例是 `examples/flow-composition/index.html`。",
    "regionDependencies": {
      "caller": false,
      "groups": [
        {
          "module": "ui-content",
          "regions": [
            "table"
          ]
        },
        {
          "module": "viz-flow",
          "regions": [
            "stage",
            "packet",
            "bar",
            "links"
          ]
        }
      ]
    }
  }
];
