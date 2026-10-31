# 浮层与弹出界面（O01–O04）

模块文件：`src/ui/overlay.js`、`src/ui/overlay.css`、`src/manifests/ui-overlay.json`、`gallery/demos/ui-overlay.js`。公开入口为 `NoteUI.Tooltip`、`NoteUI.Popover`、`NoteUI.Dialog`（含 `NoteUI.Dialog.confirm`）、`NoteUI.Drawer`。

## 范围与加载顺序

- 依赖：`NoteCore.floating`（I04）负责定位、视口避让、层级栈、Esc/外点关闭、焦点陷阱与恢复、背景遮罩、滚动锁；本模块不另建 body 浮层或第二套键盘关闭逻辑。
- 动作按钮优先复用 legacy `NoteUI.Button`（R01）。legacy 未加载时回退为原生按钮；宿主也可以直接传入 DOM actions。本模块不依赖 forms、navigation。
- 推荐加载顺序：`core`（含 `floating.js`）→ `legacy`（可选）→ `src/ui/overlay.js`；CSS 在 core tokens/base 与 legacy 样式之后加载 `src/ui/overlay.css`。
- 所有面板元素由 `NoteCore.floating` 创建并定位；组件只填内容、加 `.nui-*` 面板类。所有浮层共用一个层级栈与一组焦点规则。
- 面板基础类为 `.hnv-floating`（core 提供）。本模块不重设背景遮罩、层级和定位。

## 共性

- `mount(host, options)` 校验宿主并向 host **追加**根元素；不要求宿主为空。动态实例返回 `{ el, update(patch), destroy() }`，另按组件提供 `open/close/isOpen/getPanel` 等。
- `update()` 不关闭已打开的浮层、不触发 `onClose`。程序化 `update({ open: false })` 静默关闭；`update({ open: true })` 会正常打开并触发 `onOpen`（如已配置）。
- 所有组件 `destroy()` 幂等：关闭并移除自己创建的浮层、触发器、监听和临时节点。演示层在 `destroy` 中还会调用 `NoteCore.floating.closeAll()` 处理确认框等无句柄浮层。
- 关闭回调：Popover/Dialog/Drawer 用 `onClose(reason)`，Tooltip 用对应的 `onHide(reason)`；在用户或 API 关闭时触发一次。reason 来自 core：`esc`、`outside`、`api`、`anchor-removed`、`destroy`（Tooltip 的滚动关闭按 `outside` 上报）。
- 嵌套：Esc 与外点只作用于最上层。关闭子层不会关闭父层。父层 API 关闭时不会隐式级联关闭仍打开的子层；需要在父层的 `onClose` 中显式关闭子层，或在清理阶段使用 `NoteCore.floating.closeAll()`。
- 内容规则：字符串按纯文本渲染；DOM 节点会被移入（不是克隆）。不要依赖 `innerHTML`。
- 窄容器：面板宽度使用 `min(…, 100vw)`；Dialog 在 520px 以下收窄边距，Drawer 接近全宽。按钮与标题允许换行，长词可断行。
- 动效：不新增装饰动画；触发器与按钮的过渡使用 `--hnv-motion-*`，`prefers-reduced-motion: reduce` 时禁用。所有可聚焦控件有 3px `--hnv-color-focus` 焦点环。

---

<a id="O01"></a>
## O01 NoteUI.Tooltip

只放辅助信息：补充术语含义、快捷键提示、非必要的背景说明。必要解释、步骤和限制必须出现在正文、图注或字幕中（K03/K09）；Tooltip 不作为唯一说明，也不承载交互。

### API

```js
var tip = NoteUI.Tooltip.mount(host, {
  content,          // string | Node | Node[]；纯文本或移入节点
  anchor,           // 可选；已存在的锚点元素。省略时创建可见 button 触发器
  label,            // 无 anchor 时触发器文字，默认“查看说明”
  placement,        // 'top' 等 core placement，默认 'top'
  delay,            // 悬停显示延迟 ms，默认 400
  focusDelay,       // 聚焦显示延迟 ms，默认 0
  hideDelay,        // 移出/失焦隐藏延迟 ms，默认 100
  disabled,         // true 时不显示
  maxWidth,         // 默认上限 min(300px, 100vw - 16px)；数字 px 或 CSS 长度
  onShow, onHide    // onHide(reason)
});
```

实例：`el`（host 内根元素）、`show()`、`hide()`、`isOpen()`、`getAnchor()`、`getPanel()`、`update(patch)`、`destroy()`。

`update` 支持 `content`、`label`、`disabled`、`delay`、`focusDelay`、`hideDelay`、`placement`、`maxWidth`、`onShow`、`onHide`。锚点在挂载后固定；更换锚点请销毁后重建。

### 关闭、焦点与视口

- 悬停、键盘聚焦（`focusin`）触发；延迟可配。
- 失焦、移出、点击外部、点击触发器、滚动、Esc、锚点移除时关闭；滚动关闭按 `outside` 上报。
- 指针移出但触发器仍保持键盘焦点时**不**关闭；焦点离开但仍悬停时**不**关闭。
- 视口避让、翻转与夹紧由 `NoteCore.floating` 完成，面板至少与锚点保留 8px 偏移。
- 显示时把 tooltip 面板 id 追加到锚点的 `aria-describedby`；隐藏/销毁时恢复原值。面板 `role="tooltip"`。
- Tooltip 不移动焦点（`returnFocus: false`），也不让内容进入可交互路径；面板设置 `pointer-events: none`。**内容中不要放按钮、链接、输入框或需要键盘操作的节点。**

### 限制

- 内容必须可读为一段辅助说明；过长内容应改写为正文中的常驻说明。
- `disabled: true` 时不显示。省略 `anchor` 时，新建触发器同时设置原生 `disabled`；外部 anchor 的禁用外观与行为由宿主负责，本组件只抑制提示。
- 外部 anchor 需自行提供可聚焦语义（通常为 `button`）；本组件只添加 `aria-describedby`，不修改其标签、角色或键盘行为。
- 同一锚点不建议挂多个 Tooltip：它们会同时打开，并在 `aria-describedby` 中叠加多个面板 id。

### 最小用法

```js
var tip = NoteUI.Tooltip.mount(host, {
  anchor: document.querySelector('#security-button'),
  content: '辅助说明：检查登录设备与最近活动。',
  placement: 'top'
});
// tip.destroy();
```

---

<a id="O02"></a>
## O02 NoteUI.Popover

点击打开的说明/操作面板，与 Tooltip 的语义边界：

| | Tooltip | Popover |
| --- | --- | --- |
| 触发 | 悬停或键盘聚焦 | 点击（或 API） |
| 内容 | 不可交互的辅助信息 | 可含按钮、表单、链接 |
| 角色 | `tooltip` | 非模态 `dialog` |
| 焦点 | 不移动焦点 | 不自动抢焦点；关闭后请求返回触发点 |

### API

```js
var pop = NoteUI.Popover.mount(host, {
  triggerLabel,     // 无 anchor 时的按钮文字，默认“打开”
  content,          // 可交互内容，string | Node | Node[]
  placement,        // 默认 'bottom-start'
  anchor,           // 可选；已有触发器
  open,             // 初始是否打开，默认 false
  label,            // 面板可访问名称；默认取 label、triggerLabel，或外部触发器的 aria-label/文本
  disabled,
  maxWidth,         // 默认上限 min(360px, 100vw - 16px)
  onOpen, onClose   // onClose(reason)
});
```

返回 `{ el, open(), close(reason?), toggle(), isOpen(), getTrigger(), getPanel(), update(patch), destroy() }`。

`update` 支持 `content`、`triggerLabel`、`label`、`placement`、`maxWidth`、`disabled`、`open`、`onOpen`、`onClose`。`placement` 变更会按新位置重建面板并重新打开（配置了 `onOpen` 时会再次调用）；`anchor` 在挂载后固定。

### 关闭、焦点与边界

- 点击触发器或 `toggle()` 开合；点击外部和 Esc 由 core 关闭最上层。
- 不自动聚焦内容。需要初始聚焦时由宿主在 `onOpen` 中自行处理；模态焦点陷阱不适用于 Popover。
- 关闭时向 core 请求恢复焦点：焦点在面板内（如正在操作表单）时，Esc/面板内操作关闭会把焦点还给触发点；焦点原本就在触发点上则无需恢复；外部点击目标或程序化打开前的外部焦点不被强制抢夺。
- 触发器设置 `aria-haspopup="dialog"`、`aria-expanded`、`aria-controls`；销毁时若为外部 anchor，则恢复原有属性。
- 面板由 core 做视口避让，不覆盖触发点；面板与触发点至少保留 8px。
- 内容可交互；表单控件、按钮的语义与键盘行为由宿主内容负责。长内容在面板内滚动。

### 限制

- 外部 anchor 需具备点击与键盘激活行为；新建触发器时使用原生 `button`。
- `disabled: true` 时新建触发器同时设置原生 `disabled`；外部 anchor 的禁用外观与行为由宿主负责，本组件只抑制打开。
- 关闭父层不级联关闭子层（见“共性/嵌套”）。
- 非模态面板不锁背景滚动，也不限制 Tab 离开面板。

### 最小用法

```js
var pop = NoteUI.Popover.mount(host, {
  triggerLabel: '筛选条件',
  content: formNode,
  placement: 'bottom-start',
  onClose: function (reason) { console.log(reason); }
});
pop.open();
```

---

<a id="O03"></a>
## O03 NoteUI.Dialog

### API

```js
var dialog = NoteUI.Dialog.mount(host, {
  open,                 // 初始打开
  title,                // string | Node
  content,              // string | Node | Node[]
  actions,              // 见下
  size,                 // 'sm'|'md'|'lg' | 数字 px | CSS 长度；默认 'md'
  onClose,              // onClose(reason)
  modal: true,          // 默认 true
  closeOnOutside: false,// 默认 false
  closeOnEsc,           // 默认 true
  label,                // 无标题时的可访问名称，默认“对话框”
  showClose,            // 默认 true
  describeContent,      // 默认：字符串内容自动 aria-describedby；Node 不自动
  className,            // 附加到面板
  onOpen
});
```

返回 `{ el, open(), close(reason?), isOpen(), getPanel(), setActionsDisabled(bool), update(patch), destroy() }`。

`update` 支持 `open`、`title`、`content`、`actions`、`size`、`showClose`、`label`、`describeContent`、`onClose`、`onOpen`。`modal`、`closeOnOutside`、`closeOnEsc` 的变更在再次打开时应用，打开期间保持当前策略。

### actions

`actions` 可为单个 DOM 节点、DOM 数组、字符串/数字、配置对象或混合数组。配置对象：

```js
{
  label: '保存',
  variant: 'primary' | 'secondary' | 'quiet',
  tone: 'danger',        // 危险动作红色（对默认按钮/legacy 按钮均可）
  disabled: false,
  close: true,           // 点击后自动 close('api')，默认 false
  onClick: function (event, api) {
    // api.el、api.close(reason)、api.dialog
  },
  ariaLabel, title, id
}
```

- legacy `NoteUI.Button` 存在时，配置对象动作复用它；否则使用原生 `button`，并加 `.nui-dialog__action` 样式保持可用。宿主传入的 DOM 按钮不会被改写，样式与键盘语义由宿主负责。
- 动作区在窄屏换行并拉伸，避免按钮被压到不可读。
- `setActionsDisabled(true)` 禁用当前由组件创建的动作（配置对象或 legacy 按钮），供异步确认等场景；恢复 `false` 时保留动作配置里初始的 `disabled`。宿主传入的 DOM 动作由宿主自行管理禁用状态。动作按钮由 legacy Button 重建时，浮层模块会重新补上 `.nui-dialog__action*` 类与焦点环，`ariaLabel/title` 会进入 Button 选项状态。

### 关闭、焦点与滚动

- `modal: true`（默认）：core 创建遮罩、启用焦点陷阱、锁定正文滚动；打开时聚焦面板内第一个可聚焦元素，否则聚焦面板本身；Tab/Shift+Tab 在面板内循环。
- `modal: false`：不创建遮罩、不锁滚动、不默认启用焦点陷阱。
- Esc 默认关闭（`closeOnEsc: false` 可关）；外点默认不关闭（`closeOnOutside: true` 可开）。两者都交给 core 的层级栈，嵌套时只关最上层。
- 关闭时若打开前的焦点仍 connected，core 恢复到打开前元素。`destroy()` 关闭打开中的对话框，并触发一次 `onClose('destroy')`。
- 标题通过 `aria-labelledby` 关联；内容在字符串或 `describeContent: true` 时通过 `aria-describedby` 关联。
- 长内容在 `.nui-dialog__content` 内滚动，标题和动作保持可见；`max-height` 受视口限制。

### NoteUI.Dialog.confirm

```js
NoteUI.Dialog.confirm({
  title, content,
  confirmLabel, cancelLabel,
  tone: 'danger' | 'primary' | 'default',
  onConfirm              // 可选；返回 false 保持打开；可返回 Promise
}) -> Promise<boolean>
```

- 确认返回 `true`；取消、Esc、关闭或销毁返回 `false`。返回后焦点恢复到打开确认框前的元素。
- `onConfirm` 返回 `false` 时不关闭；返回 Promise 时等待，期间动作按钮禁用；抛错/拒绝时保持打开，恢复按钮，并通过 `console.error` 报告，不会伪造成功。
- 确认框无标题栏关闭按钮；默认尺寸 `sm`。内容没有可聚焦元素时焦点落在首个动作（取消）上，否则落在内容首个可聚焦元素；Esc 为取消。
- 确认框没有实例句柄。需要程序化取消/清理时使用公开的 `NoteCore.floating.closeTopmost('api')`（关闭最上层）或 `closeAll('api')`；Promise 会按取消返回 `false`。演示的 destroy 即用 `closeAll` 处理。

### 限制

- 动作、内容与标题可在打开时更新；改变策略类选项后需再次打开才生效。
- 非模态模式没有用于定位的可见锚点；实现把面板交给 core 的 modal 定位路径取得居中，但显式关闭 backdrop、trapFocus 与 lockScroll，并在面板上移除 `aria-modal`，不另建定位层。
- 关闭父对话框不自动关闭其子浮层；见“共性/嵌套”。
- 非模态模式不提供背景滚动锁；若宿主需要在非模态下锁滚动，应自行处理，避免与 core 的引用计数冲突。

### 最小用法

```js
var dialog = NoteUI.Dialog.mount(host, {
  title: '通知设置',
  content: formNode,
  actions: [
    { label: '取消', close: true },
    { label: '保存', variant: 'primary', close: true, onClick: save }
  ],
  onClose: function (reason) { console.log(reason); }
});
dialog.open();

NoteUI.Dialog.confirm({ title: '删除草稿？', confirmLabel: '删除', tone: 'danger' })
  .then(function (ok) { /* true/false */ });
```

---

<a id="O04"></a>
## O04 NoteUI.Drawer

### API

```js
var drawer = NoteUI.Drawer.mount(host, {
  side: 'right' | 'left',   // 默认 'right'
  open,                     // 初始打开
  title,
  content,                  // 主体，可滚动
  actions,                  // 与 Dialog 相同的动作配置/DOM 规则
  footer,                   // 可选页脚文本/节点，位于动作上方
  size,                     // 默认 420（数字 px 或 CSS 长度）
  closeOnOutside: false,    // 默认 false
  closeOnEsc,               // 默认 true
  label, showClose, className,
  onOpen, onClose
});
```

返回 `{ el, open(), close(reason?), isOpen(), getPanel(), getSide(), setActionsDisabled(bool), update(patch), destroy() }`。

`update` 支持 `open`、`title`、`content`、`actions`、`footer`、`size`、`side`、`showClose`、`label`、`closeOnOutside`、`closeOnEsc`、`onClose`、`onOpen`。`side`、`closeOnOutside`、`closeOnEsc` 在再次打开时应用；打开期间保持当前侧边与策略，避免内容跳动，`getSide()` 在打开期间报告当前面板侧边。

### 结构、焦点与滚动

- 结构：标题栏（标题 + 关闭）→ 主体（独立滚动）→ 页脚（`footer` 内容 + `actions` 动作行）。
- 复用 `NoteCore.floating` 的 modal、backdrop、trapFocus、lockScroll：默认有遮罩、焦点陷阱、正文滚动锁；关闭/销毁后按引用计数恢复。
- Esc 默认关闭；外点默认不关闭（与 Dialog 一致，但可 `closeOnOutside: true` 开启）。都只作用于最上层。
- 关闭后焦点回到打开前的元素。
- 高度为 `calc(100dvh - 16px)`（旧浏览器回退 `calc(100vh - 16px)`），宽度为 `min(size, calc(100vw - 16px))`；这是与 core 统一的 8px 视口安全边距，不是组件自设定位。手机宽度（如 390px）下约 96% 宽，标题和页脚仍固定，内容区滚动。
- 侧边对齐：使用一个 1px 透明边缘锚点交给 `NoteCore.floating` 计算 left/right 位置，面板仍是 core 的唯一浮层；不另建固定定位层或第二套焦点系统。

### 限制

- 默认 `modal: true`，不提供非模态抽屉选项。
- 抽屉高度为视口高度减 core 的 16px 安全边距，左右与上下均保留 8px。若需要完全贴边的全高抽屉，需要 I04 提供可配置的视口边距/贴边放置选项；本模块不绕过 core 自行定位。
- 侧边位置用一个位于宿主内的 1px 固定锚点计算。若宿主祖先应用了 `transform`、`filter` 或 `perspective`，`position: fixed` 的参考系可能改变，需避免此类祖先或由 core 提供贴边定位选项。
- 超长内容只在主体区滚动，标题/页脚不随之滚动。
- 关闭父抽屉不自动关闭子浮层；见“共性/嵌套”。

### 最小用法

```js
var drawer = NoteUI.Drawer.mount(host, {
  side: 'right',
  title: '详情',
  content: detailNode,
  footer: '补充说明',
  actions: [{ label: '关闭', close: true }],
  closeOnOutside: false
});
drawer.open();
```

---

## 键盘与可访问性

| 场景 | 行为 |
| --- | --- |
| Tooltip | 悬停或聚焦触发；Esc 关闭；不抢焦点；`role="tooltip"` + `aria-describedby` |
| Popover 触发器 | 原生 button（新建时）；Enter/Space 打开；`aria-expanded` 同步 |
| Popover 面板 | `role="dialog"` + `aria-label`；内容控件保持宿主语义；Esc/外点关闭；焦点在面板内时关闭恢复到触发器 |
| Dialog | `role="dialog"`；`aria-labelledby` 标题；字符串内容 `aria-describedby`；打开聚焦首个可聚焦元素；Tab 循环；Esc 可配；关闭恢复焦点 |
| Dialog 非模态 | 同上但不遮罩、不锁滚动、不默认陷阱 |
| Confirm | 取消在动作首位；Esc 取消；异步确认期间禁用动作；Promise 结果明确 |
| Drawer | `role="dialog"` + `aria-modal`；焦点陷阱；Esc 可配；关闭恢复焦点；背景滚动锁与恢复 |
| 全局 | 3px `--hnv-color-focus` 焦点环；`prefers-reduced-motion` 禁用过渡；不使用标题属性作为唯一说明 |

## 支持范围与已知限制

- 本模块按 `docs/架构与接口.md` 的 I04 接口实现，不另建定位层。定位、遮罩、层级、外点/Esc、焦点陷阱与滚动锁由 `NoteCore.floating` 提供。
- Tooltip 面板不接收指针事件，内容不可交互；需要交互请改用 Popover。
- 父层关闭不自动级联关闭子层；组件不监听其他浮层状态。
- Popover 不自动把焦点移入面板；需要时由宿主在 `onOpen` 中处理。
- Dialog/Drawer 的 `modal`、`closeOnEsc`、`closeOnOutside`、`side` 变更在下次打开时应用。
- 外部 anchor 的可访问名称与键盘激活由宿主负责；本模块只补 `aria-describedby` / `aria-expanded` 等状态。
- 未在旧版浏览器（不支持 `100dvh` 或 `color-mix`）中验收；现代 Edge/Chromium/Firefox/Safari 预期可用。
- 焦点陷阱的嵌套边界：I04 只对最上层浮层应用 Tab 循环。若在模态 Dialog/Drawer 内打开非陷阱的 Popover/Tooltip，它们成为最上层期间，下层模态的 Tab 约束会暂停。需要严格模态键盘约束时，优先使用正文/内联内容或再开一个 Dialog；彻底修复需 core 将 Tab 陷阱应用到最上层 `trapFocus` 层。
- 浏览器验证：`node tests/checks/overlay-check.mjs` 加载真实 `src/core/*`（I04）与 legacy `controls.js`，在 Edge headless 中执行 291 项断言（逐项 mount/update/destroy、视口边缘翻转、嵌套层级、焦点陷阱/恢复、滚动锁恢复、窄屏、无 legacy 动作降级、demo 销毁与 body 残留），291/291 通过，console error 0，外部请求 0。
- 补充真实 core 临时验证（`tests/.cache`）：Tooltip 聚焦打开与 `aria-describedby`/placement 重建、Popover 触发器开合与外点关闭、Dialog 模态/非模态与焦点恢复、Dialog.confirm 的 true/false/取消与 body 标记清理、Drawer 左右侧与 Esc/焦点恢复、动作禁用后类名与初始 disabled 保持、销毁后无浮层/遮罩残留。
- Gallery 集成依赖 T7 重建后的 `dist/note-library.js`；重建后由集成检查统一复核 O01–O04 与无浮层残留。
- 已知接口缺口：I04 对锚点外点不排除锚点本身，本模块在 Popover 触发器上用同一事件的 pointerdown 时间戳消歧，避免“关闭后立刻被 click 重开”；Drawer 的 8px 视口安全边距来自 I04 的 `EDGE`，若需贴边全高抽屉需 core 增加选项。

## 用户评价范围

O01–O04 均为候选组件，`userReview=not-reviewed`。未获用户逐项视觉评价，不写入“已确认资产”。
