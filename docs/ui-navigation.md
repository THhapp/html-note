# 导航与定位（ui-navigation）

范围：N01–N07，标签页、章节锚点目录、面包屑、菜单、分页、步骤指示与树形目录。组件只管理浏览器内的导航呈现、键盘和选择状态；不发起网络请求、不写 URL、不内置数据加载。

## 1. 源码、依赖与加载

| 项目 | 位置 |
| --- | --- |
| 内部共享 helpers | `src/ui/navigation-shared.js`（`window.NoteUIInternals.navigation`，**内部使用，不是公开 API**） |
| N01 Tabs / N02 AnchorNav | `src/ui/navigation.js` |
| N04 Menu / N03 Breadcrumb | `src/ui/navigation-menu.js` |
| N05 Pagination / N06 Steps | `src/ui/navigation-paging.js` |
| N07 TreeView | `src/ui/navigation-tree.js` |
| 样式 | `src/ui/navigation.css` |
| 条目元数据 | `src/manifests/ui-navigation.json` |
| gallery 演示 | `gallery/demos/ui-navigation.js` |

`src/manifests/ui-navigation.json` 的 `js` 数组声明了上述加载顺序；直接按源文件加载时必须遵循同一顺序（先 shared，再 navigation、menu、paging、tree）。构建后的 `dist/modules/ui-navigation.js` 已按顺序拼接，无需宿主自行排列。

依赖：共享基础 `core`；`Menu` 和 `Breadcrumb` 的省略菜单还依赖 `NoteCore.floating`。普通 `<script>`、IIFE、`file://` 可用；无 CDN、网络字体、`fetch`、`eval` 或运行时不解析 HTML。

```html
<link rel="stylesheet" href="../../src/core/tokens.css">
<link rel="stylesheet" href="../../src/core/base.css">
<link rel="stylesheet" href="../../src/ui/navigation.css">

<script src="../../src/core/core.js"></script>
<script src="../../src/core/icons-data.js"></script>
<script src="../../src/core/icons.js"></script>
<script src="../../src/core/motion.js"></script>
<script src="../../src/core/floating.js"></script>
<script src="../../src/ui/navigation-shared.js"></script>
<script src="../../src/ui/navigation.js"></script>
<script src="../../src/ui/navigation-menu.js"></script>
<script src="../../src/ui/navigation-paging.js"></script>
<script src="../../src/ui/navigation-tree.js"></script>
```

- `Menu` 在 `navigation-menu.js` 中位于 `Breadcrumb` 之前；`Breadcrumb` 直接复用公开的 `NoteUI.Menu`，不依赖 forms 模块。
- 图标由可选的 `NoteCore.icon` 生成；传字符串图标名但图标模块未加载时，菜单项只显示文字，不抛错。
- CSS 只消费 `--hnv-*` 候选值并带本地回退。没有新增主题、`:root` 变量或全局裸选择器。

## 2. 共用约定

所有动态组件：

```js
var inst = NoteUI.X.mount(host, options);
// host: Element 或 DocumentFragment，组件向 host 追加根元素
// inst.el / inst.update(patch) / inst.destroy()
```

- `update(patch)` 只更新传入字段，**绝不触发** `onChange` / `onSelect` / `onToggle`。
- 程序方法（`Tabs.activate`、`AnchorNav.setActive`、`Pagination.update`、`Steps.update`、`TreeView.expand`）同样不触发用户事件；`TreeView.select` 是例外，默认通知宿主，可传 `{silent:true}` 静默。
- `destroy()` 幂等：移除根元素、组件监听、待执行动画帧、浮层和临时锚点。`Menu.destroy()` 关闭全部层级并移除右键菜单的视口锚点。
- 字符串内容一律作为纯文本；传入的 DOM 节点被**移入**组件而不是克隆，宿主之后应通过原节点引用管理它。
- 当前项都有可读语义：`aria-selected`、`aria-current="location|page|step"` 或 `aria-expanded`；视觉状态不只靠颜色。
- `prefers-reduced-motion: reduce` 下取消过渡；`AnchorNav` 的平滑滚动也直接落位。
- 所有可聚焦控件有 3px `--hnv-color-focus` 焦点环。

<a id="N01"></a>

## 3. N01 NoteUI.Tabs

在少量并列区域间切换，维护 `tablist` / `tab` / `tabpanel` 关系。

### Options

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `items` | `Array<{id,label,content,disabled}>` | `[]` | 标签与面板内容；`content` 可为 DOM 或字符串 |
| `value` | `any` | 首个可用项 | 当前标签 id；非法/禁用值回退到首个可用项 |
| `keepMounted` | `boolean` | `true` | true：所有面板保留在 DOM、非当前面板 `hidden`；false：仅挂载当前面板 |
| `onChange` | `(value,event)=>void` | `null` | **仅用户**点击/键盘切换触发；程序 `activate`/`update` 不触发 |
| `label` | `string` | `'标签页'` | `tablist` 的 `aria-label` |
| `orientation` | `'horizontal'\|'vertical'` | `'horizontal'` | 可选扩展，用于纵向标签的键盘方向 |

### 实例方法

| 方法 | 说明 |
| --- | --- |
| `getValue()` | 返回当前值；无可用项或销毁后为 `undefined` |
| `activate(id)` | 程序激活可用标签；成功返回 `true`，禁用/不存在返回 `false`；不触发 `onChange`，也不主动移动焦点 |
| `update(patch)` | 支持 `items/value/keepMounted/onChange/label/orientation`；不触发回调。更新 `items` 或 `keepMounted` 会重建标签与面板，更新 `value` 只同步选中和面板可见性 |
| `destroy()` | 清理监听并移除根 |

### 键盘

| 键 | 行为 |
| --- | --- |
| `Tab` / `Shift+Tab` | 进入或离开当前 `tab`；仅当前标签在 Tab 序列中（roving tabindex） |
| 横向 `←` / `→` | 在可用标签间循环移动焦点并切换 |
| 纵向 `↑` / `↓` | 在可用标签间循环移动焦点并切换 |
| `Home` / `End` | 第一个 / 最后一个可用标签 |
| `Enter` / `Space` | 原生按钮激活当前聚焦标签 |

### 限制

- 只实现自动激活（移动焦点即切换），没有 manual activation 配置。
- `keepMounted=false` 会移除非当前面板 DOM；如果宿主仍持有同一个 DOM 节点，重新挂载会复用该节点，其自身 DOM 状态（如输入值）不保证被重置。组件不克隆节点，也不负责宿主数据的重建。
- 面板的 `aria-controls` 指向稳定 id；当 `keepMounted=false` 时，非当前面板元素不存在，直到再次激活。
- `update({items})` 期间如果焦点在组件内部，焦点会回到当前标签；如果焦点原本在面板内容里，需要宿主自行恢复业务焦点。

<a id="N02"></a>

## 4. N02 NoteUI.AnchorNav

### Options

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `items` | `Array<{id,label,level}>` | `[]` | `id` 为标题元素全局 id；`level` 1–6 控制缩进 |
| `active` | `any` | 自动 | 初始当前章节；不存在时根据滚动位置计算 |
| `target` | Element \| Document \| Window \| selector | 页面窗口 | 跳转和 active 检测使用的滚动容器 |
| `offset` | `number` | `16` | 点击跳转时标题相对容器顶部的偏移（px） |
| `label` | `string` | `'章节导航'` | `nav` 的 `aria-label` |

### 实例方法

| 方法 | 说明 |
| --- | --- |
| `getValue()` | 返回当前章节 id |
| `setActive(id)` | 只更新当前项，不滚动；不存在返回 `false` |
| `setActive(id,{scroll:true})` | 可选扩展：更新并滚动到目标 |
| `update(patch)` | 更新 `items/active/target/offset/label`；不触发用户事件。更新 `items` 时保持当前焦点在相同 id 的链接上；只有更新 `target` 才重新绑定滚动监听 |
| `destroy()` | 移除 passive scroll/resize 监听、待执行的定位保护并移除根 |

### 行为

- 使用 `scroll` + `resize` 被动计算当前章节，不在滚动事件中启动持续 rAF 动画，也不整页重排。
- 点击同页链接时由组件滚动 `target` 容器；普通左键点击不写 `location.hash`。带修饰键的点击保留浏览器默认行为。
- 平滑滚动期间使用内部“落点保护”：当前项保持为被点击的章节，直到滚动位置真正到达目标或保护超时；不会在途经章节上来回跳动。减少动效时使用即时滚动。
- 目标接近容器底部时，最后一项成为当前项，避免“最后一节永远选不中”。
- 目录自身超过 `32rem` 时局部滚动；当前项会保持在目录可视区域附近。

### 键盘与可访问性

| 键 | 行为 |
| --- | --- |
| `Tab` / `Shift+Tab` | 依次进入目录中的原生链接 |
| `Enter` | 由浏览器激活链接；组件的 click 处理接管普通左键跳转并滚动目标容器 |
| 方向键 | 组件不劫持；目标滚动容器若自身可聚焦，其原生滚动键保持原行为 |

当前项使用 `aria-current="location"`，并同时有圆点、背景和字重；不要求用户点击后才可读。

### 限制与接口补充

- 标题通过全局 `document.getElementById` 查找，因此 `id` 必须在整页唯一。
- 没有 IntersectionObserver 分支；采用滚动位置计算，更易测试且无持续动画。
- 目录不使用平滑滚动来“滚动到当前”；仅点击跳转由减少动效偏好控制。

<a id="N03"></a>

## 5. N03 NoteUI.Breadcrumb

### Options

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `items` | `Array<{label,href?,onClick?,target?}>` | `[]` | 路径由宿主提供；最后一项为当前页 |
| `maxItems` | `number` | `0`（不折叠） | ≥3 时限制可见层级；中间层级收进省略菜单 |
| `label` | `string` | `'面包屑'` | `nav` 的 `aria-label` |
| `onSelect` | `(item,event)=>void` | `null` | 任意祖先项激活时的全局回调（当前项不可激活） |

### 结构

```html
<nav class="nui-breadcrumb" aria-label="面包屑">
  <ol class="nui-breadcrumb__list">
    <li>…祖先…</li>
    <li><button class="nui-breadcrumb__ellipsis">…</button></li>
    <li><span aria-current="page">当前页</span></li>
  </ol>
</nav>
```

- `maxItems` 的计算包含第一项、省略按钮和尾部项。例如 4 项上限会显示“第一项 … 最后两项”。
- 折叠中间项由本模块 `NoteUI.Menu` 呈现，具备完整键盘支持。按钮可见文字是省略号，辅助技术名称是“显示省略的层级”。
- 当前项使用 `aria-current="page"`、加粗和下边形状，不是链接。

### 实例方法

| 方法 | 说明 |
| --- | --- |
| `update(patch)` | 更新 `items/maxItems/label/onSelect`；不触发用户回调 |
| `destroy()` | 销毁省略菜单、监听和根 |

**事件**：祖先项触发 `items[].onClick(event)` 和全局 `onSelect(item,event)`；当前项不可交互，折叠菜单选择同样走这两个回调。

### 键盘

| 键 | 行为 |
| --- | --- |
| `Tab` / `Shift+Tab` | 依次经过祖先链接、按钮和省略触发按钮 |
| `Enter` / `Space` | 激活祖先项，或打开省略菜单 |
| 省略菜单 `↑/↓`、`Home/End` | 在隐藏层级链接之间移动 |
| 省略菜单 `Enter` / `Space` | 选择该层级；菜单关闭并回到省略按钮 |
| 省略菜单 `Esc` | 关闭菜单并回到省略按钮 |

### 限制

- 最后一项始终是当前项；没有单独指定中间某层为 current 的配置。
- 折叠菜单里的 `href` 在被选中后会导航；若宿主 `onClick` 调用了 `event.preventDefault()` 则尊重取消。带 `target` 的链接按目标打开。
- 视觉分隔符由 `li + li::before` 提供；路径换行时逐项保留语义。
- 每次 `render` 会重建列表和省略菜单；打开中的旧省略菜单会被销毁，不会残留浮层。

<a id="N04"></a>

## 6. N04 NoteUI.Menu

### Options

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `items` | `Array<MenuItem>` | `[]` | 菜单项、子菜单、分隔线 |
| `trigger` | `{type:'button'\|'contextmenu',label}` \| `null` | `null` | button 或 contextmenu；null 表示宿主受控打开 |
| `anchor` | Element | `null` | 右键菜单目标；button 触发默认使用按钮；受控模式可作默认锚点 |
| `placement` | 枚举 | `'bottom-start'` | 根菜单的优先方位；子菜单固定优先 `right-start`，由浮层避让翻转 |
| `onSelect` | `(item,event)=>void` | `null` | **仅叶子项经用户选择**触发；参数是宿主传入的原始对象 |
| `label` | `string` | `'菜单'` | 根菜单的 `aria-label`；`trigger.label` 未给时也作为触发按钮文字 |

### MenuItem

```js
{
  id: 'export',
  label: '导出为…',       // string 或 DOM
  icon: iconNodeOrName,   // DOM 或 NoteCore.icon 名称
  shortcut: 'Ctrl+E',     // 只显示，不自动绑定快捷键
  keyshortcuts: 'Control+E', // 可选 aria-keyshortcuts
  disabled: false,
  children: [ /* 子菜单项 */ ]
}
// 分隔线：
{ type: 'separator' }
```

### 实例方法

| 方法 | 说明 |
| --- | --- |
| `open(anchor?,position?)` | 打开根菜单；`position` 可为 `{x,y}` 视口坐标。无参数时使用 trigger/anchor |
| `close()` | 关闭全部菜单层；不回调 `onSelect`。若焦点在菜单层内，焦点返回打开菜单的触发点 |
| `update(patch)` | 更新结构；若菜单已打开会先关闭，并在重建触发按钮后把焦点放回触发点；不触发选择回调 |
| `destroy()` | 关闭各层、移除浮层、临时锚点和监听 |

**事件**：`onSelect(item,event)` 仅在用户选择叶子项时触发；父菜单打开子菜单、`close()` 和 `update()` 不触发选择回调。

### 键盘

| 键 | 行为 |
| --- | --- |
| 触发按钮 `Enter`/`Space` | 打开菜单，聚焦第一项；菜单已打开时用鼠标点击同一按钮会关闭全部层 |
| 触发按钮 `↓` / `↑` | 打开菜单并聚焦第一项 / 最后一项 |
| 菜单内 `↓` / `↑` | 在可用菜单项间循环移动（`Home`/`End` 到首尾） |
| `→` | 在带子菜单的项上打开子菜单；不把父项当作可选项 |
| `←` | 子菜单内关闭当前层并回到父项；根菜单内无操作 |
| `Enter` / `Space` | 激活当前叶子项；关闭根菜单并聚焦打开菜单的触发点 |
| `Esc` | 关闭最上层；子菜单关闭回到父项，根菜单关闭回到触发点 |
| `Tab` / `Shift+Tab` | 关闭全部菜单层，焦点移到触发点之后的上一/下一可聚焦元素；触发点自身不可聚焦时按文档顺序取锚点之后/之前的最近可聚焦元素 |
| 上下文区域 `Shift+F10` / `ContextMenu` | 在可聚焦的锚点区域上用键盘打开上下文菜单 |

禁用项使用原生 `disabled` 并显示“（不可用）”，不进入键盘序列。没有 typeahead 字符搜索。

### 浮层与关闭规则

- 全部层由 `NoteCore.floating.create` 创建，未自建 body 浮层、z-index 或焦点陷阱。
- 外点/Esc 只关闭最上层：子菜单打开时第一次 Esc 只回父层，第二次才关闭根菜单。
- 选中叶子项关闭整个根菜单；关闭后把焦点恢复到打开菜单的触发点或外部锚点。
- `NoteCore.floating` 负责视口避让、翻转、滚动/resize 跟随、锚点移除和层级栈。
- 右键菜单传视口坐标时，Menu 创建一个 1×1、`pointer-events:none` 的临时锚点交给 floating；根菜单关闭或组件销毁时移除。
- 上下文菜单要按 Esc 回到目标区域时，锚点区域应可聚焦（例如 `tabindex="0"`）；非可聚焦元素无法接收焦点恢复，键盘 Shift+F10 也需要区域先获得焦点。

### 使用受控菜单

```js
var menu = NoteUI.Menu.mount(host, {
  trigger: null,
  label: '受控操作',
  items: [{ id: 'a', label: '操作 A' }],
  onSelect: function (item, event) { /* ... */ }
});
menu.open(anchorButton);
// 宿主仍需从自己的按钮维护 aria-expanded；组件只负责其 trigger:null 的浮层。
```

<a id="N05"></a>

## 7. N05 NoteUI.Pagination

### Options

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `total` | `number` | `0` | 总条数（非负整数） |
| `page` | `number` | `1` | 当前页，1 起始；自动夹紧 |
| `pageSize` | `number` | `10` | 每页条数（正整数） |
| `pageSizes` | `number[]` | `[10,20,50]` | 原生 select 选项；当前 `pageSize` 会自动包含 |
| `label` | `string` | `'分页'` | `nav` 的 `aria-label` |
| `siblingCount` | `number` | `1` | 当前页两侧页码数量，夹在 1–3 |
| `onChange` | `(page,pageSize,event)=>void` | `null` | 仅在用户点击页码/上下页或修改原生 select 时触发 |

### 实例方法

| 方法 | 说明 |
| --- | --- |
| `getValue()` | 返回 `{ page, pageSize }`；销毁后 `undefined` |
| `update(patch)` | 更新数据并重新夹紧，不触发 `onChange` |
| `destroy()` | 移除 click/change 监听并移除根 |

### 行为

- 页码以 `aria-current="page"` 标出，并用可见汇总“第 X / Y 页，共 N 条”补充文本状态。
- 首页禁用上一页，末页禁用下一页。
- 大量页使用带 `aria-label="省略的页码"` 的静态省略号；不提供跳页输入框。
- 每页数量使用原生 `<select>`，由外层 `<label>` 提供可见“每页 … 条”名称。
- 总数为 0 时只显示“共 0 条，暂无可分页内容”，不渲染页码按钮。
- 用户翻页后焦点落到新的当前页；用户改每页数量后焦点回到原生 select。
- 窄容器自动换行，不压缩按钮文字。

### 限制

- 不写 URL、不缓存、不请求远程数据；宿主在 `onChange` 中加载自己的数据。
- 不提供每页数量自定义输入或“跳至第 N 页”输入。
- 页码算法优先显示第一页、最后一页和当前页邻域；不是第三方库的逐像素复刻。

<a id="N06"></a>

## 8. N06 NoteUI.Steps

### Options

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `items` | `Array<{label,description,status,disabled}>` | `[]` | 显示内容；`status` 可覆盖非当前项的完成/未到达状态 |
| `current` | `number` | `0` | 当前步骤索引（0 起始），自动夹紧 |
| `clickable` | `boolean` | `false` | 非当前步骤渲染为可聚焦按钮 |
| `onChange` | `(index,event)=>void` | `null` | 用户激活非当前可用步骤时触发；组件不自行改变 current |
| `orientation` | `'horizontal'\|'vertical'` | `'horizontal'` | 横/纵；窄窗口横向自动转纵向 |

### 实例方法与事件

| 方法 | 说明 |
| --- | --- |
| `update(patch)` | 接受上面字段并重新显示；不触发 `onChange`；若焦点在步骤按钮上会尽量恢复到同一索引 |
| `destroy()` | 移除根和点击监听 |

- 用户点击可选步骤只触发 `onChange(index,event)`；是否调用 `update({current:index})` 完全由宿主决定。组件没有计时器、自动串播或内置下一步按钮。
- 当前步骤同时有 `aria-current="step"`、数字/环形标记和可见“当前步骤”文字；已完成使用勾号和“已完成”；未到达使用空心数字和“未开始”。
- `items[].status` 可为 `'complete'` 或 `'upcoming'`，用于非当前项覆盖。索引等于 `current` 的项始终以当前步骤呈现；未知 status 忽略。`disabled` 为可选扩展，禁用按钮不可点击并带“不可用”文字。

### 键盘

| 键 | 行为 |
| --- | --- |
| `Tab` / `Shift+Tab` | 不可点击时跳过静态步骤；可点击时依次进入步骤按钮 |
| `Enter` / `Space` | 触发当前步骤按钮（当前步骤不重复触发）的 `onChange` |
| 方向键 | 组件不接管；不是自动串播控件 |

### 限制

- 长内容会换行；窄容器（≤720px）把横向布局转为纵向，标签和说明不被压成不可读单行。
- 没有步骤间锁定、自动完成判断或业务状态机；状态由宿主给。

<a id="N07"></a>

## 9. N07 NoteUI.TreeView

### Options

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `nodes` | `Array<{id,label,children,disabled}>` | `[]` | 可递归层级；`id` 在树内唯一，缺失时生成内部 id |
| `expanded` | id \| id[] | `[]` | 初始展开的父节点 |
| `selected` | id \| id[] | 空 | 初始选择；单选只保留第一个 |
| `multi` | `boolean` | `false` | 多选模式；根设 `aria-multiselectable="true"` |
| `onSelect` | `(selected,event)=>void` | `null` | 用户选择变化时触发；单选为 id 或 `null`，多选为 id 数组 |
| `onToggle` | `(id,open,event)=>void` | `null` | 用户展开/收起时触发 |
| `label` | `string` | `'目录树'` | `role=tree` 的 `aria-label` |

### 实例方法

| 方法 | 说明 |
| --- | --- |
| `getSelected()` | 单选返回 id 或 `null`；多选返回 id 数组 |
| `select(id,{silent:true})` | 程序选择。默认会通知 `onSelect`；`silent:true` 抑制。单选为替换；多选默认加入，可用 `{selected:false}` 移除，传数组设置整组 |
| `expand(id,open)` | 程序展开/收起；`open` 省略则切换；不触发 `onToggle`，也不强制展开祖先 |
| `getTarget(id)` | 返回对应 `treeitem` 元素，找不到返回 `null` |
| `update(patch)` | 更新 `nodes/expanded/selected/multi/onSelect/onToggle/label`；不触发选择/展开回调。更新 `nodes` 时按 id 保留仍然存在的展开与选中状态 |
| `destroy()` | 移除事件监听与根 |

**事件**：用户选择触发 `onSelect(selected,event)`，用户展开/收起触发 `onToggle(id,open,event)`；公开 `select()` 默认也通知（event 为 `null`），可用 `{silent:true}` 抑制。`update()` 与 `expand()` 不触发。

### 键盘

| 键 | 行为 |
| --- | --- |
| `Tab` | 进入/离开树中唯一的 roving tab stop |
| `↑` / `↓` | 在可见节点间移动焦点（不自动选择） |
| `Home` / `End` | 第一个 / 最后一个可见节点 |
| `→` | 展开父节点；已展开则进入第一个子节点 |
| `←` | 展开父节点收起并保持焦点；叶子或已收起节点回到父节点 |
| `Enter` / `Space` | 选择聚焦节点；多选模式下切换其选中状态 |

禁用节点仍在可见键盘顺序中，带 `aria-disabled="true"` 与可见“不可用”，但不能选择或展开。这是为了便于发现禁用项；不假装它可操作。

### 结构与可读性

- `role=tree` → `treeitem`（含 `aria-level`、`aria-setsize`、`aria-posinset`、`aria-selected`、`aria-expanded`）→ 子级 `role=group`。
- 展开组用原生 `hidden`；不会把隐藏内容继续暴露给辅助技术。
- 选择状态同时有勾号、左侧色条/背景与 `aria-selected`。
- 长标签使用 `overflow-wrap:anywhere`；行内缩进按层级递增，根可局部滚动。
- 不渲染虚拟滚动、异步加载、拖拽、连接线或机制图。

### 限制

- 无异步树加载或懒加载；`children` 全部由宿主一次性提供。
- 多选仅实现 Enter/Space/点击切换；没有 Shift 范围选择、Ctrl+A 全选或复选框列。
- 禁用节点的初始选中状态可由宿主数据传入；用户点击和键盘不能操作禁用节点。
- `select()` 默认触发 `onSelect`，但 `update()` 和 `expand()` 不触发回调。若宿主把程序选择当作纯同步操作，应使用 `{silent:true}`。

## 10. Menu 与浮层协作

1. `Menu` 每次打开使用一个 `NoteCore.floating.create` 层级。根菜单和每一层子菜单都是独立 layer，进入同一个浮层栈。
2. `NoteCore.floating` 统一负责 `position:fixed` 定位、视口避让/翻转/夹紧、z-index 栈、Esc/外点关闭最上层、锚点移除时关闭、滚动/resize 跟随；本 Menu 不启用 trapFocus。
3. Menu 自己管理菜单语义与 roving focus：打开焦点第一项、方向键移动、`aria-haspopup`/`aria-expanded`、子菜单层级和焦点恢复。没有另造焦点陷阱或 body 浮层。
4. 关掉子菜单只回到父菜单项；Esc/外点只关最上层。选中叶子后关闭根菜单，焦点回到打开菜单的触发点/外部锚点。
5. `Breadcrumb` 的省略菜单也是一个普通 `Menu` 实例，因此享有同样的键盘和浮层行为。

## 11. 验证与支持范围

源码语法检查：

```text
node --check src/ui/navigation-shared.js
node --check src/ui/navigation.js
node --check src/ui/navigation-menu.js
node --check src/ui/navigation-paging.js
node --check src/ui/navigation-tree.js
```

浏览器检查（Playwright + 本机 Edge，`file://`/注入页面环境；清单由 `tests/lib/src-sources.mjs` 按 manifest 推导）：

```text
node tests/checks/navigation-check.mjs
node tests/checks/navigation-demos.mjs
node tests/checks/navigation-responsive.mjs
node tests/checks/navigation-treeselect-integration.mjs
```

- `navigation-check.mjs` 覆盖 N01–N07 的主要键盘路径、keepMounted、滚动当前项、省略菜单、Menu 子菜单/Esc/焦点返回/外点/Tab/右键/受控、Pagination 边界、Steps 不自动推进、TreeView 键盘与更新语义、卸载清理与控制台错误。
- `navigation-demos.mjs` 真实挂载并销毁 7 个 gallery demo；`navigation-responsive.mjs` 在 390px 视口检查 7 个 demo 无页面级横向溢出；`navigation-treeselect-integration.mjs` 用真实 `NoteUI.TreeSelect` 验证 X05 消费 N07。
- 未验证：真实屏幕阅读器矩阵、触摸设备手势、Safari/Firefox 行为、RTL 专项、跨页锚点 URL 同步。

## 12. 用户评价范围

N01–N07 均为未获用户评价的候选实现，`userReview=not-reviewed`。技术自检不等于用户审美认可，参数不因自检冻结；视觉继承现有 `--hnv-*` 候选值。
