# core 共享基础（I01–I05）

本文件说明共享设计值、本地图标、动效、浮层与实例基础。I06 的构建、registry 与离线分发由构建负责人维护，不在本模块范围内。

## 1. 范围与加载顺序

| 文件 | 作用 | 依赖 |
| --- | --- | --- |
| `src/core/tokens.css` | `--hnv-*` 候选设计值与字号/间距预设 | 无 |
| `src/core/base.css` | `.hnv-visually-hidden`、浮层外壳、焦点环与 reduced-motion | tokens.css |
| `src/core/core.js` | `NoteCore` DOM、内容、生命周期、几何、剪贴板 | 无（最先加载） |
| `src/core/icons-data.js` | 由脚本生成的纯图标数据 | core.js |
| `src/core/icons.js` | `NoteCore.icon` / `NoteCore.icons` | core.js、icons-data.js |
| `src/core/motion.js` | `NoteCore.motion` | core.js、tokens.css |
| `src/core/floating.js` | `NoteCore.floating` | core.js、tokens.css、base.css |
| `gallery/demos/core.js` | I01–I05 的真实公开 API 演示（由 gallery 加载，不属于库脚本） | 构建后的预览外壳与 core |

普通 `<script>` 顺序固定为：

```text
core.js → icons-data.js → icons.js → motion.js → floating.js
```

CSS 顺序为 `tokens.css → base.css → 组件 CSS`。所有文件可经 `file://` 直接加载，无网络请求、无模块加载器、无运行时构建。

<a id="I01"></a>

## 2. I01 共享设计值与预设

### 2.1 继承与扩展

`src/core/tokens.css` 保留基础视觉试排的全部候选原值（颜色、字体、边框、圆角、动效、字号、对象/组/舞台间距），未改写原值。扩展值包括：

- 语义色：`--hnv-color-success`、`--hnv-color-success-soft`、`--hnv-color-danger`、`--hnv-color-danger-soft`、`--hnv-color-danger-border`、`--hnv-color-warning`、`--hnv-color-warning-soft`、`--hnv-color-on-accent`
- 代码/遮罩/焦点：`--hnv-color-code-bg`（兼容别名 `--hnv-color-code`）、`--hnv-color-overlay`、`--hnv-color-focus`、`--hnv-focus-ring-width`
- 阴影：`--hnv-shadow-object`、`--hnv-shadow-float`
- 圆角与控件：`--hnv-radius-panel`、`--hnv-radius-pill`、`--hnv-control-height-sm|--hnv-control-height|--hnv-control-height-lg`
- 字号：`--hnv-font-size-body`、`--hnv-font-size-secondary`、`--hnv-font-size-small`、`--hnv-font-size-caption`、`--hnv-font-size-title`；字重 `--hnv-font-weight-strong`
- 间距刻度：`--hnv-space-1` 至 `--hnv-space-8`（4/8/12/16/24/32/40/48px），以及 `xs/sm/md/lg` 别名
- 层级：`--hnv-z-base`、`--hnv-z-raised`、`--hnv-z-sticky`、`--hnv-z-float`、`--hnv-z-toast`
- 动效：沿用 `--hnv-motion-ui`、`--hnv-motion-explain`、`--hnv-motion-ease-ui`、`--hnv-motion-ease-explain`

这些是**候选默认值，不是冻结规范**。宿主可以在 `:root`、页面容器或组件作用域覆盖任意 `--hnv-*`；组件必须写成 `var(--hnv-x, fallback)`。本文件不提供整套主题切换，也不在 core 内提供旧 `--nx-*` / `--si-*` 桥接；旧前缀的显式映射由 `src/compat/legacy-bridge.css` 独立负责。

### 2.2 预设

- `data-hnv-type="standard"` / `data-hnv-type="readable"`：切换候选阅读字号、行高、标签和数据字号。
- `data-hnv-space="compact"` / `data-hnv-space="relaxed"`：切换候选对象/组/舞台间距。
- 窄屏媒体查询（900px、720px）只调整舞台间距与舞台圆角。
- `prefers-reduced-motion: reduce` 下将 `--hnv-motion-ui` 与 `--hnv-motion-explain` 归零；动效工具仍会先做 reduced 检测，不依赖 CSS 时长来实现“无动画”。

<a id="I02"></a>

## 3. I02 本地图标

### 3.1 API

| API | 行为 |
| --- | --- |
| `NoteCore.icons.names()` | 返回按名称排序的新数组（68 个名称） |
| `NoteCore.icons.has(name)` | 精确名称存在返回 `true` |
| `NoteCore.icons.get(name)` | 返回新的 24×24 `<svg>`；未知名称返回 `null` |
| `NoteCore.icon(name, options)` | 默认 `{ size: 16, label: null, className: '' }`；未知名称返回 `null` |

`NoteCore.icon` 与 `get` 生成的 SVG 均设置 `viewBox`、`fill="none"`、`stroke="currentColor"`、圆角线帽/线连接；`size` 同时写入 `width`/`height` 属性与 `style`。无 label 时设置 `aria-hidden="true"` 与 `focusable="false"`；有非空 label 时设置 `role="img"` 和 `aria-label`，移除 `aria-hidden` 与 `focusable`。`className` 追加在基础类 `hnv-icon` 后。

`icons.get` 固定 24px，是底层原始图标；需要 16px 等尺寸时使用 `NoteCore.icon`。这两者每次调用都创建独立 SVG，调用方可以自由修改返回节点。

### 3.2 生成与安全

```bash
node scripts/gen-icons.mjs          # 生成 icons-data.js
node scripts/gen-icons.mjs --check  # 检查生成物是否为最新
```

脚本只读取 `vendor/lucide/icons/*.svg`，按文件名排序，校验根元素、白名单子元素和白名单属性后写出确定性数据。生成文件只包含数据与挂载语句；`icons.js` 使用 `createElementNS` / `setAttribute` 逐节点构造，不使用运行时 HTML 字符串，不执行 SVG 内脚本，不加载远程资源。图标来源为 Lucide static 1.62.0（ISC），许可见 `vendor/lucide/LICENSE`。

### 3.3 全部名称

```text
alert-circle, alert-triangle, arrow-down, arrow-left, arrow-right, arrow-up,
bold, calendar, check, chevron-down, chevron-left, chevron-right, chevron-up,
circle-alert, circle-check, circle-x, clock, code, copy, dot, download,
ellipsis, external-link, eye, eye-off, file, filter, folder, folder-open,
git-branch, grip-vertical, image, info, italic, layers, link, list,
loader-circle, maximize-2, menu, merge, minimize-2, minus, more-horizontal,
move, panel-bottom, panel-left, panel-right, panel-top, pause, play, plus,
redo-2, repeat, rotate-ccw, search, settings, shuffle, skip-forward, split,
star, step-back, step-forward, table, trash-2, undo-2, upload, x
```

<a id="I03"></a>

## 4. I03 动效

### 4.1 API

| API | 说明 |
| --- | --- |
| `NoteCore.motion.reduced()` | 当前 `prefers-reduced-motion: reduce` 是否为真 |
| `NoteCore.motion.onChange(fn)` | 订阅 reduced 变化；回调收到 `(isReduced, event)`；返回幂等 unsubscribe |
| `NoteCore.motion.play(el, keyframes, options)` | 返回 `{ finished, cancel(), el }` |
| `NoteCore.motion.stop(el)` | 取消该元素当前动效 |
| `NoteCore.motion.measure(elements)` | 返回 `Map<Element, DOMRect>`；接受单个元素、数组、NodeList 或可迭代集合 |
| `NoteCore.motion.flip(el, fromRect, options)` | 从 `fromRect` 到元素当前几何的 transform 动画，返回同 play 的控制器 |
| `NoteCore.motion.uiDuration()` | 读取 `--hnv-motion-ui` 并转换为毫秒；缺省 160 |
| `NoteCore.motion.explainDuration()` | 读取 `--hnv-motion-explain` 并转换为毫秒；缺省 460 |

`play` 的 options 为 `{ duration, easing, delay, fill, id }`。未给时长时读取 UI token，未给缓动时读取 `--hnv-motion-ease-ui`，`delay` 默认 0，`fill` 默认 `both`。每个调用可传不同时长；不存在把所有内容统一成单一固定毫秒数的逻辑。

### 4.2 语义

- `finished` 在自然结束时 resolve `true`；被后一次动画、`stop`、外部取消或切换到新目标时 resolve `false`。
- 同一元素默认由后一次 play/flip 取消前一次；`play` 与 `flip` 共用这把“最新目标”锁。
- `flip` 计算位移与尺寸比例，使用 `transform-origin: 0 0`，从旧矩形过渡到当前矩形。
- `reduced()` 为真时，`play` 不调用 `animate()`、不创建动画、不排定时器，立即写入末端关键帧并返回已 resolve `false` 的控制器。`flip` 同样不建动画，当前 DOM 布局即终态，不写临时 transform。
- `flip` 的正常默认时长使用 `--hnv-motion-ui`；解释型变化可由调用方显式传入 `explainDuration()`。
- 不提供时间轴、自动串播或全局加速策略；何时动、动多久由内容与组件决定。

<a id="I04"></a>

## 5. I04 浮层与焦点

### 5.1 create options

```js
var layer = NoteCore.floating.create({
  anchor,                 // 必需；modal 可省略
  content,                // string | Node | Node[]，遵循 setContent
  placement: 'bottom-start',
  offset: 8,
  role: 'dialog',
  className: '',
  modal: false,
  backdrop: null,         // 默认 modal ? true : false
  trapFocus: false,
  returnFocus: true,
  closeOnEsc: true,
  closeOnOutside: true,
  lockScroll: false,
  matchAnchorWidth: false,
  maxWidth: null,         // number(px) | CSS 长度
  onOpen: function () {},
  onClose: function (reason) {}
});
```

`placement` 支持 `top|bottom|left|right`、四侧的 `-start|-end`、`auto`。实际方位写入 `.hnv-floating` 与面板的 `data-placement`。`offset` 是面板与锚点的最小间距；视口边缘另留 8px。无锚点 modal 居中，`data-placement="center"`。

### 5.2 实例与全局 API

| API | 说明 |
| --- | --- |
| `layer.root` | 固定定位容器 `.hnv-floating`，由栈分配 `z-index` |
| `layer.el` | 内容面板 `.hnv-floating__panel`，承载组件内容和 `className` |
| `layer.open()` | 打开；已打开或已销毁时不重复 |
| `layer.close(reason?, { restoreFocus? })` | 关闭并移除 root；默认 reason 为 `api` |
| `layer.toggle()` | 打开/关闭切换 |
| `layer.isOpen()` | 是否处于打开状态 |
| `layer.setContent(value)` | 按 `NoteCore.setContent` 更新；打开时立即重定位 |
| `layer.reposition()` | 立即重新计算位置 |
| `layer.destroy()` | 幂等关闭并移除；不默认抢回焦点 |
| `NoteCore.floating.closeTopmost(reason)` | 只关闭栈顶 |
| `NoteCore.floating.closeAll(reason)` | 关闭调用时已打开的各层 |

关闭原因：`esc`、`outside`、`api`、`select`、`anchor-removed`、`destroy`。`destroy()` 若在打开状态会以 `destroy` 触发一次 `onClose`，随后移除 root；之后不可重新打开。

### 5.3 层级、定位与关闭规则

- 全库只有一个活动层栈；`z-index` 从 `--hnv-z-float`（默认 1000）起按栈递增，关闭任意层后重新收拢。
- DOM 为 `.hnv-floating > [.hnv-floating__backdrop] + .hnv-floating__panel`。root、backdrop 为 fixed；面板 `left/top` 由基础写入 root 内联样式。
- 根据锚点和面板尺寸选择方位；主方向空间不足时翻转到对侧，再对交叉轴与视口边缘做夹紧。正常空间下保持至少 `offset` 的触发点间距。
- 打开/滚动（capture）/窗口缩放/锚点或面板尺寸变化时重定位。关闭其中一层时立即解除该层面板与锚点的 ResizeObserver 观察，只把仍被其他打开层使用的目标重新挂回；仅当层级栈为空时才 disconnect 观察器。滚动锁只锁 `body`，用全局引用计数恢复原内联样式与滚动条补位。
- Esc 只交给栈顶处理；栈顶层 `closeOnEsc: false` 时不继续关闭父层。外点关闭监听 document 捕获阶段的 `pointerdown`，也只关闭栈顶，嵌套子层关闭不波及父层。
- 嵌套时，若栈顶不是 `trapFocus` 层（例如 Tooltip/Popover/Menu 叠在 Dialog/Drawer 上），Tab 会向下查找最近一个打开且 `trapFocus:true` 的层，并以该层的可聚焦元素继续约束，避免焦点跌落 body；这不会把上层非模态浮层自身变成焦点陷阱。若下方不存在 trapFocus 层，Tab 保持浏览器默认行为。
- 锚点不再连接、无布局盒或 `display/visibility` 不可见时以 `anchor-removed` 关闭。
- modal 默认创建 `.hnv-floating__backdrop`，面板带 `aria-modal="true"`；`backdrop:false` 可显式去掉。`backdrop` 不会自动赋予焦点陷阱，两者独立。

### 5.4 焦点

- `trapFocus: true` 时记住打开前的 `document.activeElement`；打开后聚焦面板第一个可聚焦元素，否则给面板 `tabindex="-1"` 并聚焦面板。
- Tab/Shift+Tab 在最近有效 trapFocus 层内循环；栈顶层不是 trapFocus 时复用下方最近 trapFocus 层的 focusables。所有可聚焦元素判定复用 `NoteCore.focusables`，排除禁用、隐藏、显式负 `tabindex`、`aria-hidden` 与 inert 元素；判定沿祖先链检查 CSS 可见性。
- 关闭时若 `returnFocus` 未禁用、打开前焦点仍 connected，且该层确实管理焦点（trapFocus 或焦点正在其面板内），恢复原焦点；`destroy()` 通过 `restoreFocus:false` 不抢焦点。
- 焦点环统一使用 `--hnv-color-focus`，共享 3px 宽度变量 `--hnv-focus-ring-width`。

<a id="I05"></a>

## 6. I05 实例与内容 API

### 6.1 DOM / 内容

| API | 行为 |
| --- | --- |
| `NoteCore.el(tag, className?, text?)` | 创建元素；className 可空；text 走 textContent |
| `NoteCore.text(v)` | `null/undefined → ''`，其余 String |
| `NoteCore.isNode(v)` | Element / Text / DocumentFragment |
| `NoteCore.setContent(target, value)` | 字符串只设 textContent；Node 被 replaceChildren 移入；数组按序移入；null 清空 |
| `NoteCore.append(parent, ...items)` | 字符串变文本节点，Node 移入，null 忽略 |
| `NoteCore.clear(node)` | 清空子节点 |
| `NoteCore.uid(prefix)` | 唯一 id；不传前缀使用 `hnv` |
| `NoteCore.escapeHtml(str)` | 转义 `& < > " '`，仅供明确需要文本转义处 |

`setContent` 的数组也接受字符串/原始值并作为文本节点；不会把字符串当 HTML 解析。Node 不是克隆：传入节点的原位置会被移走。

### 6.2 生命周期与监听

```js
var inst = NoteCore.component(root, state, render, cleanup);
inst.update(patch);  // 未销毁且 patch 为对象时，赋自有键后 render(patch)
inst.destroy();      // 幂等；cleanup 一次；root.remove()
inst.destroyed;      // 只读布尔
```

调用方负责在 `component()` 前自行执行一次 `render` 再 append。`update` 不触发任何组件用户事件。销毁后 `update` 为空操作。

`NoteCore.listeners(target)` 接受 Element/Window/Document，返回 `{ on(type, fn, options), off(type, fn), clear() }`。`on` 返回 bag 以支持链式；`clear()` 释放全部已登记监听。

### 6.3 几何与视口

| API | 说明 |
| --- | --- |
| `NoteCore.rect(el)` | `getBoundingClientRect` 的普通对象副本 |
| `NoteCore.clamp(n, min, max)` | 数值夹紧 |
| `NoteCore.onResize(el, fn)` | ResizeObserver 监听，返回幂等 disconnect；无 ResizeObserver 时回退 window resize |
| `NoteCore.scrollIntoViewIfNeeded(el, container, opts)` | 只在需要时滚动容器/窗口；`opts.block/inline` 支持 nearest/start/center/end |

`scrollIntoViewIfNeeded` 在 reduced-motion 下会把平滑行为降为自动。

### 6.4 其它

| API | 说明 |
| --- | --- |
| `NoteCore.copy(text)` | Promise 返回 `{ ok, method }`；先 clipboard，失败回退隐藏 textarea + execCommand，再失败返回 `manual` |
| `NoteCore.own(obj, key)` | 自有属性判断；null 安全 |
| `NoteCore.assign(target, input)` | Object.assign 的 null 安全版；null target 得到新对象 |
| `NoteCore.validateHost(host)` | Element/DocumentFragment 校验；失败抛固定 TypeError |
| `NoteCore.focusables(container)` | 可聚焦元素数组，按 DOM 顺序；排除禁用、hidden/aria-hidden/inert、display:none/visibility:hidden 与显式负 tabindex |

`copy` 不静默失败；`manual` 结果由调用方展示可选文本。回退 textarea 始终移除并尽量恢复原焦点。

## 7. 可访问性与键盘

- 浮层打开时，Tab 在最近有效的 `trapFocus` 层内循环；栈顶非 trapFocus 时回落到下方最近的 trapFocus 层，不存在则保持浏览器默认。Escape 关闭栈顶；关闭后恢复触发前焦点（受 returnFocus/trapFocus 规则约束）。
- 面板 role 由调用方按语义指定：对话框 `dialog`、工具提示 `tooltip`；modal 自动加 `aria-modal="true"`。遮罩 `aria-hidden="true"`。
- 装饰图标 `aria-hidden`，具名图标 `role="img"` + `aria-label`。
- 可聚焦元素实测可见焦点环，颜色/宽度来自 `--hnv-color-focus` / `--hnv-focus-ring-width`。
- `data-placement` 可在 CSS 中用于箭头方向，但核心不渲染箭头。
- reduced-motion 下不创建 CSS/JS 动画，直接呈现目标状态。

## 8. 支持范围与未验证项

- 已在 Windows 11 当前 Edge（Playwright `msedge`）以 `file://` 自检：I01–I05 主要 API、68 图标、浮层/焦点/嵌套/外点/Esc、锚点移除与隐藏、modal、滚动锁、多层关闭时 ResizeObserver 观察释放、Dialog+非 trapFocus Popover 的 Tab 回落与焦点恢复、reduced 动效。
- 未验证 Firefox、Safari、移动端软键盘、屏幕阅读器实际朗读、跨 iframe / Shadow DOM、触摸长按与外点关闭的手势时序。
- `tokens.css` 是候选默认值，未做完整对比度审计或主题矩阵；宿主覆盖颜色需自行复核。未提供整套主题切换。
- 图标是固定本地子集；新增/替换图标需重新生成，运行时不提供远程图标。
- 浮层滚动锁只作用于 body 滚动，不阻止页面内部其他滚动容器的程序化/用户滚动；固定定位在带 transform/filter 的宿主祖先下可能与视口坐标不一致。
- 浮层不实现箭头、拖拽、虚拟列表或嵌套滚动容器的全局避障。
- 打开期间会观察文档子节点与常见可见性属性（class/style/hidden/open/inert/aria-hidden），以处理锚点移除或隐藏；页面高频 DOM 变更会增加少量检查开销。
- 剪贴板在浏览器拒绝权限且 `execCommand` 不可用时返回 `manual`，此时需调用方提供可选文本；未对真实系统剪贴板做单元断言。
- 未做用户视觉评审；本模块所有 I 项均为 `not-reviewed`。

## 9. 最小用法

```html
<link rel="stylesheet" href="src/core/tokens.css">
<link rel="stylesheet" href="src/core/base.css">

<button id="more" type="button">更多</button>

<script src="src/core/core.js"></script>
<script src="src/core/icons-data.js"></script>
<script src="src/core/icons.js"></script>
<script src="src/core/motion.js"></script>
<script src="src/core/floating.js"></script>
<script>
  var trigger = document.getElementById('more');
  var icon = NoteCore.icon('info', { size: 16, label: '信息' });
  var content = NoteCore.el('div', 'demo-panel');
  NoteCore.append(content, icon, NoteCore.text(' 这里放组件内容。'));

  var layer = NoteCore.floating.create({
    anchor: trigger,
    content: content,
    placement: 'bottom-start',
    trapFocus: false,
    onClose: function (reason) {}
  });
  trigger.addEventListener('click', function () {
    layer.toggle();
  });
</script>
```

组件以 `NoteCore.icon` 获取图标、用 `NoteCore.component` 管理生命周期、用 `NoteCore.floating` 承载所有浮层；不另写 body 层或第二套焦点陷阱。共享基础不生成整页主题，也不替代各组件自己的内部样式。
