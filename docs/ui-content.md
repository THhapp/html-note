# 文字与知识内容（ui-content）

本文档对应 C01–C13，源码为 `src/ui/content.js|css` 与 `src/ui/expression.js|css`，演示为 `gallery/demos/ui-content.js`。组件只呈现宿主给出的文字与知识内容，不生成课程、测验、评分或教学流程（K13）。所有条目均为未评价候选（`userReview: not-reviewed`），技术自检不代表用户审美认可。

## 1. 范围与加载顺序

本模块提供：

- 排版、链接、行内标记、引用、列表、表格、代码块、图片、公式、Markdown、术语表和指标。
- 所有动态组件使用 `NoteCore.component` 的统一实例形态：`{ el, update(patch), destroy() }`，部分组件附加 `getTarget()`（C06）。`mount()` 只向 host 追加根元素，不清空 host 的其他节点。
- 程序 `update()` 直接改内部状态并重绘；不触发 `onSort`、`onClick` 等用户事件。唯一例外是 Table 用户点击表头才调用 `onSort`；TextLink 用户激活时才调用 `onClick`。

依赖与源码加载顺序：

1. 共享样式：`src/core/tokens.css`、`src/core/base.css`。
2. 共享核心：`src/core/core.js`（本模块只使用 `NoteCore` 的 DOM/生命周期/尺寸/剪贴板/URL 安全辅助；不依赖图标、浮层）。
3. 本地第三方依赖（源码直接运行时）：
   - `vendor/marked/marked.umd.js`（C10 解析 Markdown）；
   - `vendor/katex/katex.min.js`（C09 渲染公式）；
   - `vendor/katex/katex.min.css`（C09 排版与字体）。
   - **marked、KaTeX 的脚本和 KaTeX CSS 必须在 `src/ui/content.js` 之前加载。** 未加载时 C09/C10 会显示可读错误，而不是抛到页面外。
4. 最后加载 `src/ui/content.css`、`src/ui/content.js`，再加载 `src/ui/expression.css`、`src/ui/expression.js`（Expression 复用 C09 Math）。

```html
<link rel="stylesheet" href="src/core/tokens.css">
<link rel="stylesheet" href="src/core/base.css">
<link rel="stylesheet" href="vendor/katex/katex.min.css">
<link rel="stylesheet" href="src/ui/content.css">
<script src="src/core/core.js"></script>
<script src="vendor/marked/marked.umd.js"></script>
<script src="vendor/katex/katex.min.js"></script>
<script src="src/ui/content.js"></script>
```

构建后的 `dist/modules/ui-content.js|css` 已把 marked、KaTeX 与 KaTeX 字体样式打包/内嵌在 content 模块中，只需先加载 core：

```html
<link rel="stylesheet" href="src/core/tokens.css">
<link rel="stylesheet" href="src/core/base.css">
<link rel="stylesheet" href="dist/modules/ui-content.css">
<script src="src/core/core.js"></script>
<script src="dist/modules/ui-content.js"></script>
```

C07 本身只使用 `NoteCore.copy`，不使用 marked/KaTeX；C10 使用 marked，并通过本模块的 C07/C06 呈现围栏代码与表格；C09 使用 KaTeX。所有组件都使用 `--hnv-*` 共享值，类名以 `.nui-*` 为作用域，不添加 `:root` 变量、全局元素选择器或外部请求。

共享文字规则：

- 字符串一律按纯文本处理，除非该组件明确解析 Markdown（C10）或 TeX（C09）；C07 的代码也是纯文本，不执行、不查语法。
- 传入 DOM 节点时按“移入”处理，不克隆；这会改变原节点的归属。
- 长中文、英文单词与窄容器使用 `overflow-wrap: anywhere`、`min-width: 0` 或局部滚动；表格/代码的局部滚动区给出可见提示。
- 必需说明默认可见，不依赖 title、悬停或折叠。演示里的说明紧邻演示。

## 2. C01 NoteUI.Typography

<a id="C01"></a>

作用：共享标题/正文层级、语义标签和静态排版类。`mount` 是可选的；静态内容可直接使用类名。

```js
var h = NoteUI.Typography.mount(host, {
  variant: 'h2', as: 'h2', content: '局部标题'
});
h.update({ content: '替换后的标题' });
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `variant` | `'h1'\|'h2'\|'h3'\|'body'\|'lead'\|'caption'` | `'body'` | 决定字号、行高、颜色和类名。 |
| `content` | string \| Node \| Node[] | `''` | 作为内容写入；字符串按纯文本。 |
| `as` | `'h1'…'h6'\|'p'\|'span'\|'div'` | 按 variant 推导 | 只决定初始语义标签；未提供时 h1/h2/h3 → 同名标题，其余 → `p`。 |

静态类（无需 JS）：

- `.nui-type-h1`、`.nui-type-h2`、`.nui-type-h3`
- `.nui-type-body`、`.nui-type-lead`、`.nui-type-caption`

`update` 支持 `variant` 与 `content`。**`as` 是初始选项，update 不会重建根标签**；需要更换语义标签时重新 mount。标题的语义层级由宿主负责，不自动编号、不推断目录。

可访问性：mount 默认使用正确的标题/段落标签；类名本身不改语义。静态类可以放在任何元素上，但宿主应使用合适标签。链接、表格、快捷键的键盘说明见各条。

## 3. C02 NoteUI.TextLink

<a id="C02"></a>

```js
var link = NoteUI.TextLink.mount(host, {
  label: '查看资料',
  href: 'https://example.com/source',
  external: true,
  onClick: function (event) { /* 用户点击时调用；不阻止默认行为，除非自己 preventDefault */ }
});
link.update({ disabled: true });
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `label` | string \| Node | `''` | 链接文字或 DOM；DOM 会被移入。 |
| `href` | string | `''` | 只保留安全协议：http(s)、mailto、tel、相对路径、锚点。 |
| `external` | boolean | `false` | 为新窗口标记，添加 `target="_blank"`、`rel="noopener noreferrer"`、可见 `↗` 和屏幕阅读器提示。 |
| `disabled` | boolean | `false` | 移除 href，设置 `aria-disabled="true"`，保留可聚焦、不导航。 |
| `onClick` | function | `null` | 只有用户激活且非禁用时调用。 |

行为与限制：

- 普通链接保留原生 `<a href>` 打开方式；不拦截默认导航。
- 禁用链接移除 href、保留 `tabindex="0"`/link 角色以便读到禁用状态；点击和 Enter/Space 都被拦截，不调用 `onClick`。没有单独的禁用原因浮层。
- `javascript:`、`data:`、`vbscript:`、`file:`、协议相对 `//…` 等不会写入 href；带不安全 href 时按不可用/禁用状态处理，并给屏幕阅读器提示“链接地址不受支持”。
- 外部链接的 `↗` 是可见文本图标；屏幕阅读器另有“外部链接，在新窗口打开”提示，不把图标作为唯一语义。
- 支持鼠标、键盘原生链接操作；自定义 `onClick` 不应假定组件会取消默认导航。

## 4. C03 NoteUI.InlineText

<a id="C03"></a>

```js
var code = NoteUI.InlineText.mount(host, {
  text: 'npm run build', variant: 'code'
});
code.update({ text: 'Ctrl + S', variant: 'kbd' });
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `text` | string | `''` | 纯文本；不解析 HTML/Markdown。 |
| `variant` | `'code'\|'kbd'\|'mark'\|'strong'\|'small'` | `'code'` | 对应语义标签 code/kbd/mark/strong/small。 |

静态类可用于宿主标记：`.nui-inline-code`、`.nui-inline-kbd`、`.nui-inline-mark`、`.nui-inline-strong`、`.nui-inline-small`。mount 根是 `.nui-inline-text` 包裹对应语义元素，因此 update 可以切换变体。

可访问性/限制：

- 使用原生语义标签；不同变体不重复计为独立组件，也不执行行内代码。
- 超长无空格词允许在任意位置断行；不保证保持单词完整。
- `mark` 使用共享警示柔和色作为高亮底色，同时保留正文 ink 颜色；`strong` 通过字重表达强调，不只靠颜色。

## 5. C04 NoteUI.Quote

<a id="C04"></a>

```js
var quote = NoteUI.Quote.mount(host, {
  content: '引用正文',
  source: '资料来源',
  cite: 'https://example.com/reference'
});
quote.update({ content: '替换后的正文', source: '另一来源', cite: '#local-source' });
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `content` | string \| Node \| Node[] | `''` | 引用正文。 |
| `source` | string | `''` | 来源显示文字。 |
| `cite` | string | `''` | 安全协议下的出处链接；不安全时只显示文本。 |

结构：`<figure class="nui-quote"><blockquote>…</blockquote><figcaption>来源：<cite>…</cite></figcaption></figure>`。没有 `source`/`cite` 时 figcaption 隐藏。与常驻 Notice 区分：引用不承担提醒/状态语义，宿主应选择正确组件。

可访问性/限制：字符串不解析 HTML；长文自然换行；cite 支持相对、http(s)、mailto、tel，拒绝 javascript 等。没有内置作者头像、标题或引用折叠。

## 6. C05 NoteUI.List

<a id="C05"></a>

```js
var list = NoteUI.List.mount(host, {
  variant: 'ordered',
  start: 3,
  items: [
    '普通字符串',
    { content: '父项', children: ['子项一', { content: '子项二' }] },
    domNode
  ]
});
list.update({ variant: 'unordered', items: ['替换项'] });
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `items` | Array<string \| Node \| {content, children}> | `[]` | 条目内容；children 递归生成嵌套列表。 |
| `variant` | `'unordered'\|'ordered'\|'description'` | 由 `ordered` 或 unordered 推导 | 列表类型；description 使用破折号标记，仍是 ul/li。 |
| `ordered` | boolean \| null | `null` | `variant` 未给时的快捷设置。 |
| `start` | number | `null` | 仅顶层有序列表，写入 `<ol start>`。 |
| `label` | string | `''` | 给顶层列表的 `aria-label`。 |

结构/布局：

- 有序/无序使用原生 `ol`/`ul`；嵌套列表沿用父类型，不单独指定每层类型。
- 标记在正文起始位置外挂；条目内容放在 `.nui-list__content` 中，使换行文本与第一行对齐。
- 说明型只是破折号列表，适合并列解释；成对术语/值请用 C11。
- 长中文、英文和长 DOM 内容允许换行；列表宽度不超过宿主。

限制：不支持每项单独的标记样式、反向编号或自定义编号格式；说明型与 DefinitionList 的语义不同。

## 7. C06 NoteUI.Table

<a id="C06"></a>

```js
var table = NoteUI.Table.mount(host, {
  columns: [
    { key: 'name', label: '名称', width: 140 },
    { key: 'score', label: '分数', align: 'end' },
    { key: 'note', label: '说明', sortable: false }
  ],
  rows: [
    { key: 'a', name: 'Alpha', score: 12, note: '一' },
    { key: 'b', name: 'Beta', score: 5, note: '二' }
  ],
  rowKey: 'key',
  caption: '示例数据',
  empty: '暂无记录',
  sort: true,
  emphasis: { row: 'a', column: 'score' },
  onSort: function (info, event) {
    // info = { key, direction, column, rows }
    // direction: 'asc' | 'desc' | null
  }
});
table.getTarget('a'); // <tr> 或 null
table.update({ rows: [] });
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `columns` | Array<{key,label,align,width,sortable?}> | `[]` | align 支持 start/center/end（也接受 left/right）；width 数字按 px，或 CSS 长度。`sortable:false` 可关闭某列排序。 |
| `rows` | Array<Object> | `[]` | 单元格值可为字符串或 DOM；行可带 key。 |
| `rowKey` | string \| function | `null` | 字符串取该字段；函数接收 `(row,index)`。未给时依次用 row.key 与索引。 |
| `caption` | string | `''` | 可见 caption；只按文本处理。 |
| `empty` | string \| Node | `'暂无数据'` | 无行时的跨列提示；DOM 会移入。 |
| `sort` | false \| true \| {key,direction} | `false` | 开启本地排序；对象可给初始排序列和方向。 |
| `onSort` | function | `null` | 仅用户点击表头时调用，签名为 `(info, event)`。 |
| `emphasis` | {row,column} | `null` | 行按解析后的行键，列按列 key；支持数组匹配（扩展）。 |
| `maxHeight` | number \| CSS 长度 | `null` | 滚动区最大高度；数字按 px。 |
| `dense` | boolean | `false` | 紧凑单元格间距。 |

排序与空态：

- 关闭排序时不渲染表头按钮。开启后，用户点击某列第一次为升序、再次为降序、第三次取消；初始配置不触发 `onSort`。
- 排序是稳定的；数字按数值比较，文本使用本地 `Intl.Collator('zh-Hans-CN', {numeric:true})`，空/空白值放在最后，DOM 单元格按 `textContent` 参与排序。
- 排序只针对传入的本地 rows，不请求远程数据、不做筛选/分页。
- 空态使用一行跨列提示，表头仍保留；`empty` 可为宿主 DOM。
- `update({sort})` 只应用配置，不叫回调；`update({rows})` 保留当前用户排序状态。
- `getTarget(rowKey)` 返回当前 `<tr>`；行键建议唯一，重复键只保留最后一个映射。销毁后返回 null。

可访问性：

- 使用原生 `<table>`、`<thead>`、`<th scope="col">` 与 `<caption>`；当前排序列带 `aria-sort="ascending|descending"`，未排序列不强行添加。
- 表头排序用原生 button，带列名与“当前升序/降序、点击如何变化”的 aria-label；Enter/Space 可用，重绘后焦点回到同一表头按钮。
- 宽表/高表使用 `tabindex="0"` 的局部滚动区，带 `role="region"`、`aria-label` 和可见滚动提示；不会劫持整页方向键。
- 行列强调同时使用背景、边框或字重，不只依赖颜色；强调不是业务状态，必要时宿主应在表注中说明。

限制：不支持列筛选、分页、远程加载、合并单元格、树形行或自定义排序函数；宽表滚动是局部而非响应式缩列。

## 8. C07 NoteUI.CodeBlock

<a id="C07"></a>

```js
var code = NoteUI.CodeBlock.mount(host, {
  code: 'const value = 1;',
  language: 'javascript',
  title: '本地示例',
  lineNumbers: true,
  highlight: '1,3-4',
  copy: true,
  maxHeight: 220
});
code.update({ code: 'next();', highlight: [1] });
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `code` | string | `''` | 纯文本；CRLF 归一为 LF。 |
| `language` | string | `''` | 只作为可见标签，不做语法高亮。 |
| `title` | string | `''` | 纯文本标题。 |
| `lineNumbers` | boolean | `true` | 行号与代码行使用同一行结构对齐。 |
| `highlight` | number \| string \| {start,end} \| Array | `null` | 行/范围强调；字符串如 `'2,4-6'`；数组元素可为数字/字符串/对象；越界忽略。 |
| `copy` | boolean | `true` | 是否显示复制按钮。 |
| `maxHeight` | number \| CSS 长度 | `null` | 代码区最大高度，超出时局部纵向滚动。 |

复制与键盘：

- 复制按钮是原生 button，带“复制代码”或含标题的可读名称，Enter/Space 可用；调用 `NoteCore.copy(activeCode)`，不会执行代码。
- 成功显示“已复制”。失败（`ok:false`、`method:'manual'` 或异常）显示可见说明，并展示只读、可选中的 textarea；不会抛到页面外或静默失败。
- 代码区是带 `tabindex="0"` 的局部滚动区域，有可见溢出提示和 aria-label；复制状态通过 role=status 提供反馈。
- 换内容/换标题会清除旧复制状态和手动回退区。

限制：无语法着色、自动换行、折叠、可编辑或执行；超长行使用横向滚动以保留原排版。行号是展示辅助，复制内容不包含行号。

## 9. C08 NoteUI.Figure

<a id="C08"></a>

```js
var figure = NoteUI.Figure.mount(host, {
  src: '../examples/assets/content-sample.svg',
  alt: '内容处理流程示意图：原文、解析、呈现三步',
  caption: '示例图注，失败时仍然可见。',
  source: '本地示例图',
  sourceHref: '../examples/assets/content-sample.svg',
  ratio: '16 / 9',
  lazy: false
});
figure.update({ caption: '替换图注' });
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `src` | string | 无 | 本地相对/根相对路径或 `data:image/*`；拒绝远程、file、javascript、协议相对地址。 |
| `alt` | string（必填、非空） | 无 | 失败时也会作为可见替代文本显示。mount 或 update 修改 alt 时会校验。 |
| `caption` | string | `''` | 图注，成功/失败均显示。 |
| `source` | string | `''` | 来源文字。 |
| `sourceHref` | string | `''` | 安全协议下生成来源链接。 |
| `ratio` | number \| CSS 比例 \| `'auto'` | `'16 / 9'` | `auto` 使用自适应高度；其他受限格式非法时回落到 16/9。 |
| `lazy` | boolean | `false` | 设置 `img.loading="lazy"`；不保证浏览器实际请求时机。 |

失败与可访问性：

- `alt` 是硬性要求：缺失或空白会抛出 TypeError。图注是补充说明，不可替代 alt。
- 加载失败时隐藏破损图片，显示“图片不可用”、alt、失败原因；图注和来源继续可见。
- 非法 `src` 不发起加载，直接进入失败态并显示原因。
- 视觉宽高比固定时可对象适配（contain）避免裁掉图内说明；`auto` 时按原图比例。
- 重要范围说明应写进 `caption`，不要只放在图片内、悬停或来源行的角落。

已知限制：组件只接受本地/图片 data URL，不做图片压缩、上传、灯箱或远程代理。Gallery 的 C08 演示为单文件分发把 `examples/assets/content-sample.svg` 的内容生成内联 data URI；普通本地页面仍应按下文最小示例传入真实的相对 `src`。组件不会自行把本地文件转换为 data URI，单文件宿主若动态创建或替换图片，需要自行内联或保证发布目录保留对应文件。

## 10. C09 NoteUI.Math

<a id="C09"></a>

```js
var inline = NoteUI.Math.mount(host, {
  tex: 'a^2 + b^2 = c^2', display: false,
  label: 'a 的平方加 b 的平方等于 c 的平方'
});
var block = NoteUI.Math.mount(host, {
  tex: '\\sum_{i=1}^{n} i', display: true,
  label: '从一到 n 的整数和'
});
block.update({ tex: '\\int_0^1 x^2\\,dx' });
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `tex` | string | `''` | KaTeX 源字符串。 |
| `display` | boolean | `false` | false 为行内，true 为块级（也接受 `block` 别名）。 |
| `label` | string | `''` | 可读公式名称；提供时根元素使用 `role="math"` + `aria-label`。 |
| `ariaLabel` | string | `''` | `label` 的兼容别名。 |

渲染与错误行为：

- 使用本地 `window.katex.render(tex, el, {displayMode, throwOnError:true, trust:false, strict:'ignore', output:'htmlAndMathml'})`；组件捕获异常。
- 正常状态显示 KaTeX 排版结果；不把原始 TeX 作为可见文本。
- 错误状态显示“公式未能渲染”、可读原因和原始 TeX；错误是唯一显示原始 TeX 的场景。更新为有效 TeX 后错误块被清除。未加载 KaTeX 也走同一条可见错误路径。
- 块级公式根为 block，可局部横向滚动，并带 tabindex；行内公式限制 max-width 并允许自身横向滚动。
- KaTeX 生成的安全超链接会再次检查协议，危险 href 被移除。

无障碍取舍：

- **提供 `label`**：成功渲染时根节点以 `role="math"` + `aria-label` 给公式一个可读名称，推荐用于重要或复杂公式。
- **不提供 `label`**：保留 KaTeX 生成的 MathML 供辅助技术解析；不额外设置根 aria-label。KaTeX 的 MathML 注解可能包含 TeX，但正常视觉上不显示。
- **错误状态**：根节点不再是 role=math，而是带可见文本的 role=group（名称“公式错误”或“公式错误：label”），确保原因和原始 TeX 可读；错误文本不依赖颜色。

依赖/限制：源码直接运行需要本地 KaTeX 脚本和 KaTeX CSS；构建版由 content 模块内嵌 KaTeX 脚本与带 data URI 字体的 CSS，不依赖网络字体。组件不提供公式编辑器、图片导出、单位检查或语义纠错。

## 11. C10 NoteUI.Markdown

<a id="C10"></a>

````js
var md = NoteUI.Markdown.mount(host, {
  markdown: '## 标题\n\n- 条目\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```js\nconst x = 1;\n```'
});
md.update({ markdown: '# 新内容' });
````

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `markdown` | string | `''` | 本地解析的 Markdown 源。 |

支持范围：常用标题、段落、列表、强调/删除线、引用、链接、水平线、GFM 表格和围栏代码。围栏代码转换为 C07 CodeBlock（行号、复制、局部滚动），表格转换为 C06 Table（表头、安全单元格 DOM、局部滚动）。图片语法不嵌入图片，显示为“图片未嵌入”的文本占位；需要本地图注图片时使用 C08。

### 11.1 原始 HTML 与净化边界

处理管线：

1. 使用本地 marked（`new marked.Marked`）解析，渲染器的 `html` token 用 `NoteCore.escapeHtml` 转义，**原始 HTML 不会生成 DOM**；块级 raw HTML 显示为可见的 pre 文本，行内 raw HTML 显示为可见 code 文本。
2. marked 生成的 HTML 字符串交给 `DOMParser` 在惰性文档中解析；不会执行脚本。
3. 对生成 DOM 做白名单净化：
   - 允许标签：p、h1–h6、blockquote、ul、ol、li、pre、code、strong、em、del、hr、br、a、table、thead、tbody、tfoot、tr、th、td、caption。
   - 丢弃 script、style、iframe、object、embed、form/input/button/textarea/select、svg/math、影音、canvas、template、meta/link/base/frame 等危险或交互标签。
   - 不保留 style、id、target、事件属性等；只保留白名单属性。
   - code/pre 的 class 仅允许 `language-*` 与组件自己的 raw 标记；th/td 只保留合法 align。
   - 危险链接（javascript:、data:、vbscript: 等）的 anchor 会被解开，只留下可见文字；http(s)、mailto、tel 与相对路径保留。
4. 净化后的围栏代码和表格复用 C06/C07 实例；再次更新时销毁旧的嵌套实例并重建。

因此：`<script>`、`<img onerror=…>` 等输入只可能作为文本出现，不会执行；`javascript:` 链接不会保留 href。字符串/代码不通过 `eval`、运行时构建或内联事件执行。这个净化器针对本模块生成的 DOM 与常见 XSS 面，不宣称是通用 HTML 清洗库；不要把 C10 当作任意 HTML/富文本编辑器。

### 11.2 键盘与限制

- 标题/列表/引用本身是静态语义；Markdown 链接使用原生链接键盘行为。
- 嵌套表格的滚动区、排序（默认关闭）、代码块复制按钮和滚动区沿用 C06/C07 的键盘行为。
- 不执行脚本、不执行用户代码、不请求远程数据；不提供脚注、数学、目录、任务列表交互、语法高亮、远程图片或完整的 CommonMark 扩展。
- GFM task list 的 checkbox 会被净化移除，列表文字仍保留。
- 更新时不保留旧内容的 DOM 状态；嵌套代码块/表格会重建。

## 12. C11 NoteUI.DefinitionList

<a id="C11"></a>

```js
var defs = NoteUI.DefinitionList.mount(host, {
  layout: 'inline',
  dividers: true,
  items: [
    { term: '术语', description: '解释文本' },
    { term: 'DOM 值', value: domNode }
  ]
});
defs.update({ layout: 'stacked', items: [] });
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `items` | Array<{term,description}> | `[]` | term/label 为术语；description/value 为解释，可为 DOM。 |
| `layout` | `'stacked'\|'inline'` | `'stacked'` | stacked 上下；inline 宽容器两列。 |
| `dividers` | boolean | `true` | 条目间显示分隔线。 |
| `empty` | string | `'暂无条目'` | 无条目时的可见提示。 |

兼容别名：`label` 等同 `term`，`value` 等同 `description`；字符串条目只作为术语，解释为空。术语与解释都会换行，DOM 值会被移入。

结构：根 `.nui-definition-list` 内是 `<dl>`，每个条目为 `div` 包裹 `<dt>` 和 `<dd>`（HTML 允许 dl 中的 div 分组）。长键名与长值都换行；inline 两列使用 `minmax(8rem, 30%) minmax(0,1fr)`，容器宽度小于 30rem（或视口 ≤520px 回退）时自动改为上下堆叠。不支持的配置：一键多值、按列展开或树形术语。没有用户事件。

## 13. C12 NoteUI.Metric

<a id="C12"></a>

```js
var metric = NoteUI.Metric.mount(host, {
  label: '活跃设备',
  value: '12,480',
  unit: '台',
  caption: '示例读数',
  change: { direction: 'up', label: '较上周 +120 台' },
  announce: false
});
metric.update({
  value: '12,360',
  change: { direction: 'down', label: '较上周 -120 台' }
});
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `label` | string | `''` | 指标标签。 |
| `value` | string \| number | `''` | 数值文本；用 tabular-nums 与最小宽度稳定布局。 |
| `unit` | string | `''` | 单位，独立元素，窄空间可换行。 |
| `caption` | string | `''` | 可见辅助解释。 |
| `change` | {direction:'up'\|'down'\|'flat', label} | `null` | **方向与文字都由宿主给**；无效 direction 不显示变化。 |
| `announce` | boolean | `false` | true 时根节点加 `aria-live="polite"` 和 `aria-atomic="true"`。 |

视觉/可访问性：

- 变化提示同时有箭头、方向词（上升/下降/持平）和宿主标签；颜色只补充，不是唯一语义。
- 不使用“上升=好/下降=坏”的语义色；方向的外观保持中性，由宿主文案说明业务含义。
- 根使用 grid，数值和单位一行，变化与说明另起；`font-variant-numeric: tabular-nums` 与最小宽度减少数字替换时的跳动，但极长文本仍会换行。
- 默认关闭 live region；开启后组件不节流，宿主应避免高频更新造成重复播报。
- 无用户事件。变化不是自动计算的趋势。

## 14. C13 NoteUI.Expression

<a id="C13"></a>

```js
var expr = NoteUI.Expression.mount(host, {
  parts: [
    { id: 'p1', text: '4' }, { id: 'op2', text: '+' }, { id: 'p2', text: '1' },
    { id: 'eq', text: '=' }, { id: 'total', text: '5' }
  ],
  focus: ['p2'],
  changed: ['total'],
  label: '累计和 4 加 1 等于 5'
});
expr.update({
  parts: [
    { id: 'p1', text: '4' }, { id: 'op2', text: '+' }, { id: 'p2', text: '1' },
    { id: 'op3', text: '+' }, { id: 'p3', text: '12' },
    { id: 'eq', text: '=' }, { id: 'total', text: '17' }
  ],
  changed: ['total'],
  label: '累计和 4 加 1 加 12 等于 17'
});
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `parts` | Array<{id,text} \| {id,tex}> | `[]` | 每项必须有稳定唯一 `id`；`text` 与 `tex` 二选一。tex 作为完整片段交给 C09 Math，不拆分公式命令。 |
| `focus` | string[] | `[]` | 当前关注项 id。 |
| `changed` | string[] | `[]` | 内容变化项 id；与 focus 不混用。 |
| `label` | string | `''` | 整组可读名称；无 label 时用文本项拼接可读描述。 |

公开方法：

| 方法 | 说明 |
| --- | --- |
| `mount(host, options) -> instance` | 创建静态表达式；不自带播放器。 |
| `update(patch)` | 替换 parts/focus/changed/label；程序更新不触发事件。 |
| `getState()` | 返回实际已渲染的 parts/focus/changed/label 副本。 |
| `getTarget({id, part?})` | 返回对应项元素；`part:'unit'|'content'|'value'` 分别返回布局项、内容载体和值槽，省略 part 返回 unit；`{part:'root'}` 返回根。 |
| `getMotionTargets()` | 返回每个当前项的 `{id, element, layoutEl, unit, contentEl, valueEl}`；unit/content/value 是不同职责载体，不再都指向同一个 span。 |
| `setSceneActive(on)` | 受控状态开关；scene 期间暂停组件自身过渡，由公共层效果接管。 |
| `destroy()` | 幂等移除根。 |

- 根是 inline-flex 单项排布，项之间保留可读间距；窄容器仍保持单行，由宿主处理横向空间。
- 每个项保留稳定 unit → content 载体 → value 槽：update 只改实际变化的内容，未变项及其 Math 实例复用；同 ID 重排移动同一单元。视觉 cues 用 unit 上的 `data-mark` 展示 focus/changed，不自动播放动画。
- scene 接入时，Expression Adapter 在 content 载体内部做同 ID 换值的局部旧副本，退出项才使用独立的私有层；组件本身不创建播放器。
- 整组根提供 `role="group"` 与 `aria-label`；TeX 项内部继续由 C09 Math 提供公式语义。
- 不负责符号自动匹配、代数推理、任意公式符号动画或另一套数学渲染器。

## 15. 键盘与可访问性汇总

| 位置 | 键盘行为 |
| --- | --- |
| C02 链接 | 原生 Tab/Enter；外部链接通过 target 打开；禁用链接可聚焦但不导航，Enter/Space 被拦截。 |
| C06 表头 | Tab 聚焦排序按钮；Enter/Space 触发排序，升序→降序→取消；焦点重绘后返回原列。 |
| C06 滚动区 | 可 Tab 聚焦，方向键/浏览器滚动查看；有 aria-label 和可见溢出提示。 |
| C07 代码区 | 可 Tab 聚焦滚动；复制按钮原生 Enter/Space；失败后焦点进入可选中的只读 textarea。 |
| C08 来源链接 | 原生 Tab/Enter；图片失败信息不需聚焦即可读取。 |
| C09 块级公式 | 有 tabindex 以支持横向滚动；提供 label 时有公式可读名称。 |
| C10 内嵌的代码/表格/链接 | 沿用 C07/C06 与原生链接键盘操作。 |
| 其他静态内容 | 无自定义键盘陷阱、无全局快捷键。 |

焦点环统一使用 `--hnv-color-focus` 与 3px 宽度，组件不删除浏览器的可见焦点。没有自动播放、计时器、浮层或整页滚动劫持。减少动效时仅移除轻量过渡；代码/表格的滚动仍由用户控制。

## 16. 支持范围与已知限制

- 所有组件只呈现宿主内容，不生成课程、评分、测验、学习步骤或业务结论。
- Markdown 净化是白名单方案，不是完整 sanitizer；不支持任意 HTML、iframe、表单或任务列表交互。
- C06 的本地排序没有排序函数注入、筛选或分页；`sortable` 是列上的兼容扩展，超出冻结列形状但不改变已有键。
- C08 不接受远程图片。Gallery 演示的成功图使用由 `examples/assets/content-sample.svg` 生成的内联 data URI 以适配单文件分发；文档最小示例仍展示真实本地相对路径。组件本身不会自动把本地图片内联，单文件宿主的动态图片需要自行处理。
- C09 的正常公式不显示原始 TeX；无障碍依赖 label 或 KaTeX MathML。KaTeX 的复杂语义不保证在所有屏幕阅读器中都朗读完整。
- C10 会重建嵌套内容，更新时旧代码块/表格的临时状态不会保留。
- C07 无语法高亮；长行横向滚动而不是自动换行。
- C11 inline 布局的堆叠依赖 container query，旧浏览器回退为视口 ≤520px 的媒体查询。
- 未做用户审美评价；技术自检只覆盖 Chromium/Edge 下的结构与交互，不覆盖所有浏览器、屏幕阅读器、打印、导出 PDF 或宿主主题覆盖后的对比度。

## 17. 最小加载与用法

```html
<link rel="stylesheet" href="src/core/tokens.css">
<link rel="stylesheet" href="src/core/base.css">
<link rel="stylesheet" href="vendor/katex/katex.min.css">
<link rel="stylesheet" href="src/ui/content.css">
<div id="content"></div>
<script src="src/core/core.js"></script>
<script src="vendor/marked/marked.umd.js"></script>
<script src="vendor/katex/katex.min.js"></script>
<script src="src/ui/content.js"></script>
<script>
  var host = document.getElementById('content');
  var t = NoteUI.Typography.mount(host, { variant: 'h2', as: 'h2', content: '标题' });
  var c = NoteUI.CodeBlock.mount(host, { code: 'const x = 1;', language: 'js', highlight: '1' });
  var md = NoteUI.Markdown.mount(host, { markdown: '## 内容\n\n- 一\n- 二' });
  // 宿主离开页面时：
  // md.destroy(); c.destroy(); t.destroy();
</script>
```

构建后使用 `dist/modules/ui-content.js|css` 时，第三方脚本、KaTeX CSS 与字体已包含在模块包中；加载顺序为 core 样式/脚本 → `ui-content.css` → `ui-content.js`。不得从 CDN 或远程字体补充依赖。

## 18. 用户评价范围

C01–C13 均为新增候选，`userReview: not-reviewed`。未获得用户视觉或使用评价，技术实现与自检结果不能视为审美认可，也不代表参数已冻结；评价变化只通过 registry/status 维护。
