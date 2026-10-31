# 布局与容器（ui-layout）

范围：L01–L08，内容容器、纵向/横向排布、网格、局部面板、分隔、局部滚动区和可调整分栏。组件只处理局部布局和内部间距，不设置 body、全局标题、根字号或整页主题。宿主与布局组件负责外部距离；唯一的对齐例外是 L01 在 `align: 'center'` 时使用自动行内 margin 居中，根的块级 margin 保持为 0。

## 1. 源码、依赖与加载

| 项目 | 位置 |
| --- | --- |
| 组件源码 | `src/ui/layout.js`（`window.NoteUI.Container/Stack/Inline/Grid/Panel/Divider/ScrollArea/SplitPane`） |
| 样式 | `src/ui/layout.css`（只使用 `.nui-*` 作用域和 `--hnv-*` tokens） |
| 条目元数据 | `src/manifests/ui-layout.json`（L01–L08） |
| gallery 演示 | `gallery/demos/ui-layout.js` |

依赖：`core`（DOM/内容辅助、图标、尺寸观察）。加载顺序：先加载共享基础，再加载本模块。

```html
<link rel="stylesheet" href="src/core/tokens.css">
<link rel="stylesheet" href="src/core/base.css">
<link rel="stylesheet" href="src/ui/layout.css">
<script src="src/core/core.js"></script>
<script src="src/core/icons-data.js"></script>
<script src="src/core/icons.js"></script>
<script src="src/core/motion.js"></script>
<script src="src/core/floating.js"></script>
<script src="src/ui/layout.js"></script>
```

L 模块同时是其他模块与组合块的布局依赖：`NoteBlocks.DemoStage`、`NoteBlocks.FieldGroup`、`NoteBlocks.Hierarchy`、Demo 配方的聚焦工作台等直接组合 `NoteUI.Stack/Inline/Grid` 等布局组件，而不是各写一套间距和排布。布局组件只提供局部排布，不替这些组合块管理业务语义。

## 2. 共用约定

所有 `mount` 都向 host 追加根元素，返回 `{ el, update(patch), destroy(), ... }`：

- `update(patch)` 只更新传入字段，**不触发**任何用户事件；L08 的 `onChange` 只来自用户拖动或键盘调整。
- 字符串内容一律是纯文本，不解析 HTML；传入的 DOM 节点被**移入**而不是克隆，之后由宿主通过原节点引用管理。
- `destroy()` 幂等：移除根元素、组件监听、观察器和待执行的动画帧。宿主传入的实例由宿主负责生命周期。
- host 可以是 Element 或 DocumentFragment；多个实例互不共享状态。
- 除 L04 的 `data-nui-span` 观察外，组件不修改 host 里的其他节点。
- `update({ content })` 会替换组件内容区（包括之前手动 `append` 的节点），这是各组件文档化行为。

<a id="L01"></a>

## 3. L01 NoteUI.Container

```js
var c = NoteUI.Container.mount(host, {
  maxWidth: '72ch', padding: 'md', align: 'center', content: node
});
c.update({ maxWidth: 640, align: 'start' });
c.el.append(otherNode);
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `maxWidth` | number \| CSS 长度 | `'72ch'` | 数字按 px；限制组件内容区宽度，不设置整页宽度。 |
| `padding` | `'none'\|'sm'\|'md'\|'lg'` | `'md'` | 组件内部 padding。 |
| `align` | `'start'\|'center'` | `'center'` | 居中用自动行内 margin；start 保留左对齐。 |
| `content` | string \| Node \| Node[] | 无 | 初始内容，节点被移入。 |

方法：`update(patch)` 支持以上键；`append(...items)` 直接向返回的 `el` 内容区追加；`destroy()` 移除根。没有用户事件。根类：`.nui-container`。

<a id="L02"></a>

## 4. L02 NoteUI.Stack

```js
var s = NoteUI.Stack.mount(host, { gap: 'md', align: 'stretch' });
s.append(nodeA, nodeB);
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `gap` | number \| CSS 长度 \| `'sm'\|'md'\|'lg'` | `'md'` | 数字按 px；token 映射到 `--hnv-space-sm`、`--hnv-space-object-gap`、`--hnv-space-group`。 |
| `align` | `'stretch'\|'start'\|'center'\|'end'` | `'stretch'` | 交叉轴对齐。 |
| `justify` | `'start'\|'center'\|'end'\|'between'\|'around'\|'evenly'` | `'start'` | 主轴分布。 |
| `content` | string \| Node \| Node[] | 无 | 初始内容。 |

方法：`update(patch)`、`append(...items)`、`destroy()`。根类 `.nui-vstack`（明确不使用旧 `.nui-stack`）。可嵌套：内层 Stack 自己管理内部 spacing。无用户事件。

<a id="L03"></a>

## 5. L03 NoteUI.Inline

```js
var i = NoteUI.Inline.mount(host, { gap: 'sm', align: 'center', wrap: true });
i.append(tagA, buttonB);
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `gap` | number \| CSS 长度 \| `'sm'\|'md'\|'lg'` | `'md'` | 与 Stack 相同的间距映射。 |
| `align` | `'stretch'\|'start'\|'center'\|'end'` | `'center'` | 交叉轴对齐。 |
| `justify` | 同 Stack | `'start'` | 主轴分布。 |
| `wrap` | boolean | `true` | 默认换行；`false` 使用本地区域横向滚动，不把子项压缩。 |
| `content` | string \| Node \| Node[] | 无 | 初始内容。 |

方法：`update(patch)`、`append(...items)`、`destroy()`。根类 `.nui-hstack`。直接子项默认 `flex: 0 0 auto` 并限制 `max-width: 100%`，短标签/按钮不会被压成不可辨认的窄条；长单词换行由子项或宿主提供正常的 `white-space` / `overflow-wrap`。无用户事件。

<a id="L04"></a>

## 6. L04 NoteUI.Grid

```js
var g = NoteUI.Grid.mount(host, {
  columns: 'auto', minColumnWidth: '14rem', gap: 'md'
});
g.append(cardA, cardB);
cardA.setAttribute('data-nui-span', '2');
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `columns` | number \| `'auto'` | `'auto'` | 数字表示固定等分列；数字字符串也接受。 |
| `minColumnWidth` | number \| CSS 长度 | `'14rem'` | 仅 auto 模式使用，生成 `repeat(auto-fit, minmax(min(100%, 宽度), 1fr))`。 |
| `gap` | number \| CSS 长度 \| `'sm'\|'md'\|'lg'` | `'md'` | 行/列间距。 |
| `content` | string \| Node \| Node[] | 无 | 初始内容。 |

方法：`update(patch)`、`append(...items)`、`destroy()`。根类 `.nui-grid`。

直接子项可用 `data-nui-span="N"` 跨列；数字超过固定列数时自动夹到列数；`"full"` 或 `"all"` 使用 `1 / -1`。span 在 `append()`、`update()` 以及直接子项被添加/删除（MutationObserver 的 childList/characterData）时重新读取；运行中单独修改 `data-nui-span` 属性不会立即触发重排，需再调用一次 `update()` 或增删子项。`minColumnWidth` 不会在固定数字列模式下强制列宽，固定列数应慎用于很窄的容器。没有用户事件。

<a id="L05"></a>

## 7. L05 NoteUI.Panel

```js
var p = NoteUI.Panel.mount(host, {
  title: '局部说明',
  description: '补充上下文',
  content: bodyNode,
  actions: [buttonNode],
  footer: '来源或范围',
  tone: 'plain', padding: 'md', border: true
});
p.header; p.body; p.footer;
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `title` | string \| Node | `''` | 有内容时显示；设置 `aria-labelledby`。 |
| `description` | string \| Node | `''` | 有内容时显示；设置 `aria-describedby`。 |
| `content` | string \| Node \| Node[] | 无 | 主体内容，移入 `body`。 |
| `actions` | string \| Node \| Node[] | 无 | 标题区的操作节点，移入 `.nui-panel__actions`。 |
| `footer` | string \| Node \| Node[] | 无 | 页脚。 |
| `tone` | `'plain'\|'raised'\|'accent'` | `'plain'` | 只修饰局部表面，不安装整页主题。 |
| `padding` | `'none'\|'sm'\|'md'\|'lg'` | `'md'` | 作用于 header/body/footer。 |
| `border` | boolean | `true` | 只控制外边框；header/footer 的内部规则线保持。 |

方法：`update(patch)` 支持以上键；`destroy()`。返回 `{ el, body, header, footer, update, destroy }`。`body` 始终暴露，可向其中追加节点；`header` 和 `footer` 在无对应内容时设置 `hidden`。`actions` 放在 header 内；标题和说明为空但操作存在时 header 仍显示。`content` 更新替换 body 的子节点。没有用户事件；操作按钮由宿主提供。

<a id="L06"></a>

## 8. L06 NoteUI.Divider

```js
var d = NoteUI.Divider.mount(host, {
  orientation: 'horizontal', label: '其他条件', spacing: 'md'
});
d.update({ orientation: 'vertical' });
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `orientation` | `'horizontal'\|'vertical'` | `'horizontal'` | 横/竖方向。 |
| `label` | string \| Node | `''` | 可读说明；写入可见标签，并生成 `aria-label`。 |
| `spacing` | number \| CSS 长度 \| `'sm'\|'md'\|'lg'` | `'md'` | 通过内部 padding 表达间距；根不添加外部 margin。 |

方法：`update(patch)`、`destroy()`。根始终有 `role="separator"`，并设置 `aria-orientation`；有说明时设置 `aria-label`。横向分隔占满可用宽度；纵向分隔使用 `align-self: stretch`，父级应提供高度或拉伸上下文，默认最小高度 4rem。分隔本身不可聚焦；它不替代语义分组或标题。无用户事件。

<a id="L07"></a>

## 9. L07 NoteUI.ScrollArea

```js
var sc = NoteUI.ScrollArea.mount(host, {
  content: longNode,
  maxHeight: '13rem',
  label: '可滚动说明',
  hints: true,
  tabIndex: 0
});
sc.viewport.scrollTo({ top: 0, behavior: 'auto' });
sc.focus();
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `content` | string \| Node \| Node[] | 无 | 内容，移入 `.nui-scroll-area__content`。 |
| `height` | number \| CSS 长度 \| null | `null` | 设置 viewport 高度。 |
| `maxHeight` | number \| CSS 长度 \| null | `null` | 设置 viewport 最大高度；也可用宿主 CSS 约束。 |
| `label` | string | `'可滚动内容'` | viewport 的 `aria-label`。 |
| `hints` | boolean | `true` | 显示“上方/下方/左侧/右侧还有内容”的可见提示。 |
| `tabIndex` | number | `0` | viewport 的 tabindex，默认键盘可达。 |
| `hintLabels` | object | 内置四向文案 | 可覆盖 `top/bottom/left/right`；传入部分键与已有文案合并，缺省键回退内置默认。 |

方法：`update(patch)` 支持以上键；`destroy()`。额外暴露 `el`、`viewport`、`contentEl` 和 `focus()`。返回实例没有 `getValue`。

行为：viewport 有 `role="region"`、`aria-label` 和默认 `tabindex="0"`；`:focus-visible` 使用 3px `--hnv-color-focus` 焦点环。滚动使用浏览器原生 overflow，不调用 `preventDefault`，不设置会截断页面滚动的 `overscroll-behavior`。滚动、ResizeObserver、内容 MutationObserver 共同更新四个方向的提示；提示本身 `aria-hidden`，滚动状态由原生滚动区表达。更新内容/尺寸会在下一帧重新判断溢出；`destroy()` 会取消待执行帧、移除滚动监听并断开两个观察器。滚动监听只用于刷新内部提示，不对外派发事件，也没有 `onChange`。

<a id="L08"></a>

## 10. L08 NoteUI.SplitPane

```js
var sp = NoteUI.SplitPane.mount(host, {
  start: leftNode,
  end: rightNode,
  orientation: 'auto',
  ratio: 0.5,
  minStart: 120,
  minEnd: 120,
  stackBelow: 560,
  onChange: function (ratio, event) { console.log(ratio); }
});
sp.getValue();          // 当前归一化比例
sp.getOrientation();    // 实际渲染方向 'horizontal' | 'vertical'
sp.separator.focus();   // 键盘调整入口
sp.update({ ratio: 0.35 }); // 程序更新，不触发 onChange
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `start` / `startContent` | string \| Node \| Node[] | 无 | 起始（左/上）内容；两者同时出现时 `start` 优先。 |
| `end` / `endContent` | string \| Node \| Node[] | 无 | 结束（右/下）内容；两者同时出现时 `end` 优先。 |
| `orientation` | `'auto'\|'horizontal'\|'vertical'` | `'auto'` | horizontal 表示左右分栏；vertical 表示上下分栏；auto 在容器宽度小于 `stackBelow` 时转纵向。 |
| `ratio` | number | `0.5` | 存储起始区域比例，范围 0–1；实际尺寸受最小值和容器限制。 |
| `minStart` / `minEnd` | number | `120` | 起始/结束区域的最小像素尺寸（数字，按 CSS px）。 |
| `stackBelow` | number | `560` | auto 纵向阈值（px）。 |
| `height` | number \| CSS 长度 \| null | `null` | 设置根高度；纵向模式未设置时默认 CSS 高度 22rem。 |
| `label` | string | 含方向键提示 | 分隔条 `aria-label`。 |
| `startLabel` / `endLabel` | string | 起始区域/结束区域 | 两侧 section 的可访问名称。 |
| `onChange` | function | null | 用户拖动/键盘调整后调用 `(ratio, event)`；程序 `update()` 不调用。 |

方法：`update(patch)`、`destroy()`、`getValue()`、`getOrientation()`；暴露 `el`、`startEl`、`endEl`、`separator`。

行为与取舍：

- **记录比例，不记录像素**。`ratio` 是起始区域在扣除分隔条后的可用空间中的比例；`layout` 把它换算成像素并应用 `minStart`/`minEnd`。容器尺寸改变或最小值不允许时，`getValue()` 可能反映被夹紧后的实际比例；这些 resize 夹紧不触发 `onChange`。
- 分隔条是 `role="separator"`、`tabindex="0"`，带 `aria-valuemin/max/now`（百分比整数）、`aria-valuetext` 与 `aria-controls`。分隔条方向与布局方向相反：左右分栏的分隔条 `aria-orientation="vertical"`；上下分栏的分隔条为 horizontal。
- 指针使用 `setPointerCapture`，只在分隔条上监听 `pointerdown/pointermove/pointerup/pointercancel/lostpointercapture`；`destroy()` 会结束拖动、释放捕获并移除监听。`touch-action: none` 只加在分隔条上。
- 键盘只在分隔条聚焦时生效：左右分栏用左右方向键，纵向用上下方向键；Shift+方向键步进 10%，普通步进 2%；Home/End 到当前可行的最小/最大比例。未处理的按键不 preventDefault，不监听整页键盘。
- auto 转纵向由容器实际宽度决定；纵向使用根 CSS 高度（默认 22rem，可由 `height` 或宿主 CSS 覆盖）。两侧面板内部溢出使用各自的原生局部滚动。未提供额外的可见帮助文字，调用方应在上下文里说明拖动/键盘用法。
- 支持范围为桌面 Chromium；未验证移动端触摸拖动。

## 11. 键盘与可访问性摘要

- L07 的 viewport 可通过 Tab 到达，获得可见焦点环；方向键、PageDown/PageUp、Home/End 使用浏览器原生滚动。滚轮和触摸不拦截。
- L08 的分隔条可通过 Tab 到达；方向键、Shift+方向键、Home/End 只在聚焦时调整比例。所有调整同时更新 `aria-valuenow` 和 `aria-valuetext`。
- L05 的 section 由标题建立可访问名称并提供描述；L06 有 `role="separator"` 和可见/可访问说明；L07 有带标签的 region。
- 必要说明默认可见：Divider 的说明、ScrollArea 的四向提示、Panel 的标题/说明，以及演示中的操作说明均不依赖 title 或悬停。颜色不是唯一状态线：分隔和滚动提示还有文字，焦点环有形状位置，L08 的分隔条有图标/光标。
- 窄容器：L03 换行或局部滚动，L04 auto-fit，L05 header 换行，L07 局部滚动，L08 自动纵向。

## 12. 支持范围与限制

- 在 Windows Edge（Chromium）headless、`file://` 下用 Playwright 挂载、更新、拖动、键盘和销毁验证；未验证 Firefox/Safari、移动端手势、打印和真实笔记排版。
- 布局组件不修改 body、全局标题或根字号。L01 的居中需要自动行内 margin，这是对齐功能的明确例外；根块级 margin 始终为 0。
- L04 固定列数不保证窄容器可读，auto 模式才是默认的响应式选择；span 属性单独修改不会立即重排（见 L04 说明）。
- L06 的 spacing 以内部 padding 实现；如果与父级 gap 同时使用，宿主应自行协调视觉距离。
- L07 没有默认最大高度；无约束且内容不高时不会出现滚动。滚动提示以本组件文案为准，宿主不应把它们当作屏幕阅读器的滚动状态播报。
- L08 只在分隔条焦点上响应调整键；minStart/minEnd 仅接受数字（px），尚未支持 CSS 长度或百分比；分栏比例在 resize 时可能被最小值夹紧且不会冒发 onChange；没有折叠、三栏或可保存布局的功能。

## 13. 最小用法

```js
NoteUI.Container.mount(host, { content: '正文' });
NoteUI.Stack.mount(host, { gap: 'md', content: ['第一段', '第二段'] });
NoteUI.Inline.mount(host, { gap: 'sm', content: ['标签 A', '标签 B'] });
NoteUI.Grid.mount(host, { columns: 'auto', minColumnWidth: '14rem', content: card });
NoteUI.Panel.mount(host, { title: '局部说明', content: '正文', tone: 'plain' });
NoteUI.Divider.mount(host, { label: '补充条件' });
NoteUI.ScrollArea.mount(host, { maxHeight: '12rem', content: longNode, label: '可滚动说明' });
NoteUI.SplitPane.mount(host, { start: leftNode, end: rightNode, onChange: function (r) { console.log(r); } });
```

## 14. 用户评价范围

L01–L08 均为未获用户评价的候选组件，`userReview=not-reviewed`；技术自检不等于审美确认。参数以本文件记录为准，非硬性设计值（宽度、间距、比例、断点）按内容适配。
