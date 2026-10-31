# Agent组装便利性的代码研究

> 资料定位：研究记录（非现行 API），不是接口规范；文中示意接口均未实现，代码位置与文件名为研究时结构。
> 本文记录对作者重复代码、成熟组合机制与候选辅助的研究。
> 现行接口见 [公共编排层](公共编排层.md)；组装方式见 [取用与组合](取用与组合.md)；维护布局见 [架构与接口](架构与接口.md)。

本研究建立在已获“不赖，整体可以”评价的公共层之上。研究目标是减少作者重复表达和接线，保留已有运行、动效、布局与知识边界；研究阶段未开发作者工具、未安装依赖、未重新验收动画。现行使用查[取用指南](取用与组合.md)及[公共编排层](公共编排层.md)。

用户补充：矩阵交付同时有多处需要注意的变化，动态聚焦仍不符合已有共识。作者辅助不能只压缩代码或默认让变化成员全部并行，还需让作者明确关注对象、关联区域与注意承接；公共实现与作者配方的现行分工见 [公共编排层](公共编排层.md)。

## 1. 结论先行

当前不缺一套更大的播放器，也不缺基础布局组件。主要摩擦在三处：

1. 内容被重复展开：每帧完整视图、相邻过渡、参与者列表需要分别维护。
2. 已有组件需要手工接线：布局DOM、槽位映射、组件生命周期与资源声明分散。
3. 示例不是统一作者入口：开发HTML与单文件模板分别维护，agent容易把开发用的源脚本清单当普通取用方式。

建议先建立少量普通JavaScript的可执行组合配方和一个作者入口，补槽位与布局清理的真实缺口。随后再评估一个纯作者编译辅助，输出当前完整Definition；不改变核心的可恢复停点契约。

研究范围不含模型检索、MCP、Skill 流程、提示词生成器、把知识内容强塞纯 JSON，也不让库自动推断教学因果。MD 侧简述与生成指导沿用之前的分工。

## 2. 本库实际组装链

当前矩阵例子由以下文件共同完成：

| 文件/接口 | 作者正在表达什么 | 哪些应保留 | 哪些值得减少 |
| --- | --- | --- | --- |
| examples/reuse-matrix-product/content.js | 输入、配对、乘积、字幕、Binding、5帧和4个相邻过渡 | 知识规则、稳定身份、关注与变化的意义、必要承接 | 全Binding重复快照、相邻from/to、可确定的参与者清单 |
| host.js | DOM、slots及mount | 内容布局、可选区域、正常个性化 | 同名槽创建/查找/映射，main别名 |
| reuse.css | 页面、画布、对象和窄布局 | 内容相关空间安排、必要视觉适配 | 重复页面外壳，不应把全部约551行都判为无用代码 |
| index.html、standalone.html | CSS/JS资源及启动 | 一个实际作者入口 | 两份清单同步；开发入口各有约29个脚本、13个样式引用 |
| scripts/build-demo-preview.mjs | 将已有HTML中的本地资源内联 | 离线打包路径和现有经典脚本支持 | 它不会按Binding推导模块，不能误称已有自动装配器 |

### 2.1 完整Frame是合理运行输入，重复书写不是必须

definition.js要求每个Frame完整覆盖全部Binding。这个规则支持回退、go、重看、错误恢复及状态核对，不应该为了省字直接删除。

作者输入可以更简洁，最终编译结果仍必须完整。例如保留前一状态，按整个Binding替换发生变化的视图，构建时展开为每帧独立快照。这是作者侧展开，不是运行时隐式继承。

### 2.2 main槽限制是真实胶水

presentation.js:112—148的resolveLayout强制slots.main。矩阵宿主因此把terms映射成main，content中的terms Binding也必须写slot:'main'。后续组件挂载本来已按各Binding.slot核对实际槽位，没有必要让任意自定义布局再提供这个别名。

建议自定义{root,slots}由Binding验证真实所需槽；默认单区布局与返回Element的旧用法继续使用main。

### 2.3 布局清理并未被NoteDemo接管

resolveLayout只保留root/slots，丢弃其他返回值；mount.destroy只销毁presenter/session/stage。agent若用已有Grid/SplitPane等布局组件，仍需额外包装才能释放它们的观察器和事件。

建议明确可选layout.cleanup，并在成功挂载后的销毁、以及拿到layout结果后的挂载失败中恰好调用一次。回调在返回结果前抛错时的局部资源，仍需它自身的异常清理；不能声称一个返回值能自动覆盖尚未取得的资源。若未来需要在创建途中登记清理，再研究一个统一registration入口，而不是同时造两套协议。

### 2.4 元数据足以查找，不足以生成全部类型

registry有101条、17模块，含id/module/source/dist/dependencies/docs/example/usage/limitations与评价信息。它可以支持组件索引、依赖清单、示例和作者入口生成。

但inputs是字符串数组，usage是一段示例字符串，缺少嵌套字段、必填性、联合类型、目标查询与返回类型。不能据此承诺自动生成准确的101组件类型、属性表单或完整调用。

I07登记在demo-runtime，条目dependencies只有core；NoteDemo.mount还需demo-ui及blocks的传递依赖。不能只看单条目的module就宣称能自动打包默认舞台。

## 3. 成熟项目实际怎样组织组合

以下版本通过GitHub连接器读取固定源码。没有安装、构建或移植运行这些项目。

| 项目 | 固定提交 | 作者形式 | 可借的具体机制 |
| --- | --- | --- | --- |
| Storybook | b7e6a5177733607ce37024c19cbc672503b24ad1 | args对象、render函数、decorators | 默认内容、可执行装配和共用环境分离；同一组合可独立执行 |
| shadcn/ui | b8d7baa15b1dca5716f13153e63795fc3d741f6b | 源码组件/组合块加registry条目 | 一个组合携带文件、输入入口和依赖，而非只有名称或截图 |
| Remotion | 906417ef08f01485ddd0284599f298eff0c1c558 | Composition注册、component、defaultProps、schema | 组合代码与默认内容分开，必要派生集中计算，多入口消费同一定义 |

### 3.1 Storybook：普通代码的组合可以移植

[prepareStory](https://github.com/storybookjs/storybook/blob/b7e6a5177733607ce37024c19cbc672503b24ad1/code/core/src/preview-api/modules/store/csf/prepareStory.ts#L37)合并项目、组件、story的配置；其中237—241行按层合并args，118—122行选择render，110—124行处理装饰器。

[portable-stories](https://github.com/storybookjs/storybook/blob/b7e6a5177733607ce37024c19cbc672503b24ad1/code/core/src/preview-api/modules/store/csf/portable-stories.ts#L88)把同一份定义准备为可独立调用的函数。

研究阶段另外核对[原生HTML renderer](https://github.com/storybookjs/storybook/blob/b7e6a5177733607ce37024c19cbc672503b24ad1/code/renderers/html/src/render.ts)：Component是函数时执行Component(args,context)，可以返回DOM，并不要求React。

映射到本库：普通数据负责内容，普通函数负责布局与Definition；gallery、最小示例、笔记宿主和单文件预览消费同一份组合。

不照搬其renderToCanvas清空/克隆DOM作为Frame推进，那会丢失NoteDemo常驻实例。portable stories的模块级cleanups数组也不适合直接当多会话清理容器。无需引入整套Storybook服务。

### 3.2 shadcn：组合本身也是有源码的资产

当前registry实现在packages/registry，旧packages/shadcn/src/registry/index.ts仅转发，研究不能停留在旧目录。

[registry schema](https://github.com/shadcn-ui/ui/blob/b8d7baa15b1dca5716f13153e63795fc3d741f6b/packages/registry/src/registry/schema.ts#L177)声明files、dependencies、registryDependencies和说明；不同资产类型区分component/block/lib/example。

[loader](https://github.com/shadcn-ui/ui/blob/b8d7baa15b1dca5716f13153e63795fc3d741f6b/packages/registry/src/registry/loader.ts#L144)读取源文件内容，[build](https://github.com/shadcn-ui/ui/blob/b8d7baa15b1dca5716f13153e63795fc3d741f6b/packages/shadcn/src/commands/build.ts#L60)逐项生成分发JSON，[resolver](https://github.com/shadcn-ui/ui/blob/b8d7baa15b1dca5716f13153e63795fc3d741f6b/packages/registry/src/registry/resolver.ts#L147)展开依赖和文件。

[dashboard组合](https://github.com/shadcn-ui/ui/blob/b8d7baa15b1dca5716f13153e63795fc3d741f6b/apps/v4/registry/new-york-v4/blocks/dashboard-01/page.tsx)仍是普通源码，局部组件与data.json分开。可借的是“组合携带可执行代码、依赖和数据入口”，不必复制React/Tailwind、安装器、远程registry或import改写。

其拓扑排序遇环后追加未排序项，不能照搬成本库经典脚本的依赖策略；这里应定位并拒绝不满足的加载依赖。

### 3.3 Remotion：组合与默认内容分开登记

[Composition](https://github.com/remotion-dev/remotion/blob/906417ef08f01485ddd0284599f298eff0c1c558/packages/core/src/Composition.tsx#L191)登记component、defaultProps、schema与calculateMetadata，而不是把默认内容写死在播放器。

[ResolveCompositionConfig](https://github.com/remotion-dev/remotion/blob/906417ef08f01485ddd0284599f298eff0c1c558/packages/core/src/ResolveCompositionConfig.tsx#L140)处理有顺序的输入覆盖，[配置解析](https://github.com/remotion-dev/remotion/blob/906417ef08f01485ddd0284599f298eff0c1c558/packages/core/src/resolve-video-config.ts#L168)集中必要派生。

本库可将矩阵配对、乘积和累计值集中在普通知识构造函数中，不同时手写几份数字。这种函数属于该组合的内容构造，不应让通用运行层理解矩阵乘法。

Remotion的视频帧、FPS和React渲染不是可停留笔记的运行模型；仅借结构。其为自身分层许可，不能称MIT或直接搬核心。Storybook和shadcn为MIT，实际复制代码仍需保留许可。研究阶段没有引入第三方代码。

## 4. 研究建议：薄组合资产层

“组合配方”指可调用的普通代码：说明需要什么数据，建立哪些已有组件和区域，返回现有NoteDemo输入。它不是整页主题，也不是另一套教学脚本语言。

示意形状（研究候选，非现行接口）：

~~~js
var pairedViews = {
  id: 'paired-views',
  modules: ['viz-objects', 'demo-runtime', 'demo-ui'],
  defaults: { /* 示例输入，与组合实现分离 */ },
  create: function (data) {
    return {
      definition: /* 当前NoteDemo完整Definition */,
      layout: /* 当前layout回调 */
    };
  }
};

var built = pairedViews.create(myData);
var session = NoteDemo.mount(host, built);
~~~

通用UI/静态知识表达仍可直接调用，不强制经过配方或NoteDemo。特殊布局保留普通HTML/CSS与函数，不能为了“全自动”减少必要表达自由。

### 4.1 配方究竟保存在哪里

未来若实现，配方本体应进入维护源，例如src/recipes；演示输入和示例入口放examples，文档讲用途与可替换区域，依赖进入现有manifest/registry来源，构建继续生成dist。不能只保存一份完整HTML并把它命名为组件。

现有B01—B10是可挂载的组合块，配方可以组织这些块与NoteDemo，不应另开一套内容重复的库。先核对两个现有scene和已有块的重复宿主代码，提炼少量高复用结构；不按每个学科/知识点各造整页模板。

## 5. 三个具体辅助及边界

### 5.1 先统一作者入口

当前整库用法本来只需要note-library.css和note-library.js；新作者不应从开发宿主复制29个源脚本。

未来作者项目可以只有一个index.html引用本地整库，再引用自己的content.js与layout.css。现有内联器已经支持：

~~~text
node scripts/build-demo-preview.mjs --template my-note/index.html --output dist/my-note.html
~~~

所以先复用一个真实HTML入口及现有内联器，开发和单文件产物消费同一入口。需要控制体积时，再由现有manifest依赖图生成模块引用，不先做新浏览器加载服务。

### 5.2 槽位收集与清理

可用普通HTML标记区域：

~~~html
<section data-demo-slot="matrixA"></section>
<section data-demo-slot="matrixB"></section>
<section data-demo-slot="terms"></section>
~~~

拟议collectSlots(root)只收集这些区域，定位重复/缺失槽；不自动猜内容属于哪一区域。layout继续返回{root,slots}，并研究可选cleanup。配合解除自定义布局的main别名，可让现有布局组件更自然使用。

这些属于研究阶段提出的小接口补充；现行接口与边界以[取用与组合](取用与组合.md)与[公共编排层](公共编排层.md)为准。布局比例和内容适配继续由作者掌握。

### 5.3 纯作者编译辅助

示意作者输入（非现行 API，名称为示意）：

~~~js
var definition = authorTool.compile({
  bindings: bindings,
  initialViews: initialViews,
  steps: [
    { id: 'locate', caption: '选定目标格' },
    {
      id: 'pair-1',
      caption: '第一对元素相乘',
      replace: { matrixA: a1, matrixB: b1, terms: t1, sum: s1 }
    }
  ],
  scenePolicy: {
    sum: { after: 'terms' },
    result: { mode: 'reveal', after: 'sum' }
  }
});
~~~

若采用这种辅助，需要明确以下边界（研究候选，非现行规则）：

- replace按整个Binding视图替换，不深合并model、cues或数组；未写继承上一作者状态，清空需显式空视图。
- 首个状态完整；输出每个Frame均完整、独立，不能让前帧对象引用污染后帧。
- 自动相邻from/to，只适用于本库当前线性停点，不暗中扩成章节图或任意跳转模型。
- scene参与者用Adapter规范化后的model/cues差分，不用原始JSON字符串判断。
- after引用的未变成员也进入参与者闭包，仍保留最小的因果/结果意图声明。
- 无变化时不制造空动画；reveal可因显示意图而参与，不能只看文字值相同就删掉。
- actions机制不能从两幅快照猜remove/swap；显式动作及高级完整Definition保留。没有scene能力时报清楚缺口，不能降成cut。
- stable ID、focus/changed的知识含义、字幕、保留证据和必要因果仍由作者给。

这个辅助是否值得先做，应看starter/配方已经减少多少重复。不能为了省几行把难以诊断的隐式规则塞进核心。

本文列出的配方形状、槽位收集、作者编译辅助等均为研究示意，不是现行 API；其中已经落地的少量能力以[取用与组合](取用与组合.md)、[公共编排层](公共编排层.md)及源码为准。自动依赖生成器、101 组件类型平台、Storybook 服务等仍未实现。

