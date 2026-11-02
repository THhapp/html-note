# 反馈与状态（S01–S06）

本模块实现 `NoteUI.Toast`、`NoteUI.Progress`、`NoteUI.Spinner`、`NoteUI.Skeleton`、`NoteUI.Empty`、`NoteUI.Result`。全部是普通 `<script>` 下的 IIFE，无框架、无网络请求、无运行时构建依赖。

- 源文件：`src/ui/feedback.js`、`src/ui/feedback.css`
- 演示：`gallery/demos/ui-feedback.js`
- 依赖：仅 `core`（`NoteCore`）。不依赖 legacy Button、forms 或其他 UI 模块。
- 加载顺序：core 的脚本与 `tokens.css` 先加载，再加载本模块的 CSS 与 JS。组件只在浏览器 DOM 环境中运行。
- 范围共识：K09 重要说明进入正常阅读路径；K11 继承既有视觉；K13 不生成测验、评分或教学互动。Result 的业务结果由宿主决定。

所有动态入口遵循 `mount(host, options) -> { el, update, destroy }`。`host` 是元素或 `DocumentFragment`；组件向 host 追加根元素，不清空 host 的其他节点。字符串按纯文本处理，宿主传入的 DOM 节点会被移入组件，不克隆。Toast 的全局入口是有文档说明的例外。

---

<a id="S01"></a>
## S01 Toast

三种以上语气：`success`（成功）、`error`（失败）、`warning`（提醒）、`info`（信息）。成功和信息是普通消息，`role="status"`、`aria-live="polite"`；失败使用 `role="alert"`、`aria-live="assertive"`，只在错误需要立刻被注意时使用。每条通知都有可见语气文字和标记，不只靠颜色。

### 全局区域与局部区域

全局区域由 `NoteUI.Toast.show()` 懒创建到 `document.body`，最后一条通知关闭后自动移除；它固定在视口右下，只让每条通知接收指针，区域本身不铺满或拦截页面操作。若宿主把区域节点移出文档，下一次 `show()` 会先按 `destroy` 语义关闭旧区域的条目（`onClose('destroy')`）再重建区域，不会留下迟到计时器或悬挂回调。

```js
var toast = NoteUI.Toast.show({
  message: '已保存到本地',
  tone: 'success',
  duration: 5000,
  dismissible: true,
  action: {
    label: '查看说明',
    onClick: function (event) {
      // 宿主操作；默认完成后关闭
    }
  },
  onClose: function (reason) {
    // reason: timeout | dismiss | action | api | overflow | clear | destroy
  }
});

toast.close();        // 以 'api' 关闭
NoteUI.Toast.clear(); // 清除当前全部全局通知
```

局部区域用标准的 `mount()`，它向 host 追加 `.nui-toast-region--local`，不固定定位。传入 `message` 或 `action` 键可立即显示第一条局部通知；之后用实例的 `show()` 追加：

```js
var local = NoteUI.Toast.mount(host, { max: 2, label: '页面内通知' });

local.show({
  message: '局部通知',
  tone: 'warning',
  duration: 0,        // 不自动关闭
  dismissible: true
});

local.clear();         // 只清空该区域当前通知
local.destroy();       // 清空、移除区域、清理计时器与监听
```

`local.update({ max, label })` 只更新局部队列上限与区域可访问名称；通知内容请关闭旧通知后用 `show()` 添加。

### 停留与队列策略

| 项目 | 默认值 / 行为 |
| --- | --- |
| 成功 | 5000ms 后进入关闭流程 |
| 信息 | 5000ms |
| 提醒 | 8000ms |
| 失败 | 0ms，默认不自动消失，等待用户关闭或宿主清除 |
| 覆盖 | 每次 `show({ duration })` 可覆盖；`0` 或 `Infinity` 表示不自动关闭；负数、`NaN` 等无效值回退到该语气的默认值 |
| 同时上限 | `max = 4`。全局可用 `NoteUI.Toast.configure({ max })` 调整，局部可用 `mount(host, { max })` |
| 超出上限 | 有界同时显示：保留最新条目，最早的一条以 `overflow` 原因关闭；不建立无限后台积压 |
| 暂停计时 | 鼠标悬停在条目上，或键盘焦点进入条目内（关闭/操作按钮）时暂停；离开后从剩余时间继续 |
| 关闭 | 默认显示关闭按钮；`dismissible: false` 可隐藏。错误默认持久但默认可关闭 |
| 操作 | `action` 可以是 DOM 节点，或 `{ label, onClick, dismiss, disabled, ariaLabel }`；`dismiss` 默认 `true`，`onClick` 返回 `false` 可阻止自动关闭 |
| 回调 | 每条 `onClose(reason)` 在移出 DOM 后调用一次 |

`NoteUI.Toast.show/clear/configure` 不返回 `mount()` 实例，这是本模块唯一的接口例外。原因是全局区域不属于任何 host，但完整的局部行为仍由 `mount(host, options)` 提供。全局区域出现与消失都有明确生命周期，不持久化、不跨页面。

字段：

| 输入 | 说明 |
| --- | --- |
| `message` | 字符串/DOM 内容；字符串为纯文本 |
| `tone` | `success`、`error`、`warning`、`info`；未知值按 `info` |
| `duration` | 毫秒数；省略使用语气默认值 |
| `dismissible` | 默认 `true` |
| `action` | DOM 节点或操作描述对象 |
| `onClose(reason)` | 关闭回调 |
| `max` / `label` | 区域设置；局部 `mount` / 全局 `configure` |

返回的条目句柄含 `{ id, el, close() }`。`el` 是单条通知，便于宿主集成定位或测试，不建议改写其内部 DOM。

### 可访问性与键盘

- 每条通知是独立的 live region，带 `aria-atomic="true"`；错误为 `alert`，普通为 `status`。
- 关闭和操作都是原生 `button`。Tab 可到达，Enter/Space 触发；焦点进入时暂停自动关闭，`focus-visible` 使用 `--hnv-color-focus`。
- 没有焦点陷阱、没有全局快捷键，也不会抢焦点。通知关闭时若焦点原本在条目内，焦点会离开被移除的按钮；宿主若有重要后续操作，应自行把焦点移到稳定位置。
- 动态 live region 的实际播报因浏览器/屏幕阅读器而异，未做真实读屏器测试。

---

<a id="S02"></a>
## S02 Progress

确定与不确定两种状态：

```js
var progress = NoteUI.Progress.mount(host, {
  label: '整理笔记',
  value: 42,
  max: 100,
  valueText: '42 / 100 段' // 可选；决定可见值与 aria-valuetext
});

progress.update({ value: 68 });
progress.update({ value: null });  // 不确定
progress.getValue();               // 确定值（钳制后）或 null
progress.destroy();
```

- `value` 是有限数值时为确定进度，被钳制到 `0..max`；`max` 缺失或非正数时回退为 `100`。
- `value` 为 `null`、`undefined` 或非有限数时为不确定进度。此时**移除** `aria-valuenow`、`aria-valuemin`、`aria-valuemax`，设置 `aria-busy="true"`，不显示任何伪造百分比；可见值和 `aria-valuetext` 默认都是“进行中，进度未知”，可被 `valueText` 覆盖。
- 确定时设置 `role="progressbar"`、`aria-valuemin="0"`、`aria-valuemax`、`aria-valuenow`，并显示标签与最多一位小数的百分比。若提供 `valueText`，它同时用于可见值与 `aria-valuetext`。
- 默认标签：确定为“进度”，不确定为“处理中”。显式空字符串会隐藏可见标签，但保留可访问名称回退。
- 更新只来自宿主；组件不模拟推进、不猜测完成率。
- 不确定条纹只表示“正在处理、比例未知”，不是填充比例；`prefers-reduced-motion: reduce` 时动画停止，静态条纹和文字保留。确定进度在减少动效时不做宽度过渡。

`update(patch)` 接受 `value`、`max`、`label`、`valueText` 的自有键。更新 `value` 或 `max` 而未同时提供 `valueText` 时，会清除旧的自定义读数，避免显示过期数字；需要保留自定义读数时，在同一次更新中一并传入。程序更新不触发任何用户事件。

---

<a id="S03"></a>
## S03 Spinner

```js
var spinner = NoteUI.Spinner.mount(host, {
  label: '正在读取本地内容',
  size: 'md' // 'sm' | 'md' | 'lg' | 12–64 的数字（px）
});

spinner.update({ label: '正在载入图表' });
spinner.destroy();
```

- 根元素 `role="status"`、`aria-live="polite"`、`aria-atomic="true"`，环本身 `aria-hidden="true"`。
- 默认可见文字“加载中”，不会出现只有旋转、没有名称的状态。传入空标签时也回退到“加载中”。
- 数字尺寸 `>= 12` 时按 px 使用并截到最多 64px；小于 12、非数字或未知字符串回退 `'md'`。旋转只是辅助；减少动效时动画停止，保留静态断环与文字。
- Spinner 不提供百分比、预计时间或完成状态；完成时由宿主 `destroy()` 并替换为真实内容。不会自动结束。
- 谨慎更新标签：频繁改动标签会反复触发 live region；只在加载阶段确实变化时更新。

---

<a id="S04"></a>
## S04 Skeleton

```js
var skeleton = NoteUI.Skeleton.mount(host, {
  variant: 'table',   // text | card | table
  label: '表格加载中',
  width: 480,         // 数字按 px，或 CSS 长度
  height: 16,         // 数字按 px；作用于行/单元格/媒体块
  rows: 4,
  columns: 3,
  lines: 3
});

// 加载结束：销毁占位，由宿主替换成真实内容
skeleton.destroy();
renderRealContent(host);
```

| variant | 结构 | 使用的数量 |
| --- | --- | --- |
| `text` | 段落行；最后两行较短 | `lines`（默认 3） |
| `card` | 媒体块、标题条与正文行 | `lines`（正文行）；`height` 作用于媒体块 |
| `table` | 表头行 + 数据行 × 列 | `rows`、`columns`（各默认 3）；`height` 作用于单元格 |

- 视觉占位整体 `aria-hidden="true"`；根元素 `role="status"`，内部有 visually-hidden 的加载名称（默认“内容加载中”），并设置 `aria-busy="true"`。
- `width` 数字按 px、其他值按 CSS 长度；最大不超过宿主宽度。`height` 的作用范围见上表，不是强制整个根元素的高度。
- 占位结构必须与真实内容大致对应；组件不能从任意真实 DOM 自动推导形状。`lines`、`rows`、`columns` 均有合理的小上限（50 / 50 / 50）。
- 本实现没有闪烁或无限动画，正常和减少动效环境都是静态骨架。加载结束时必须由宿主调用 `destroy()` 并替换；组件不会自己完成或自动消失。
- 更新 `variant`、数量、宽高或名称会重建占位结构。

---

<a id="S05"></a>
## S05 Empty

```js
var retry = document.createElement('button');
retry.type = 'button';
retry.textContent = '重新加载';
retry.addEventListener('click', reload);

var empty = NoteUI.Empty.mount(host, {
  kind: 'no-results', // empty | no-results | unconfigured
  action: retry         // 宿主提供的 DOM；也接受节点数组
});

empty.update({ kind: 'unconfigured', action: configureNode });
empty.destroy();
```

默认文案与标记：

| kind | 默认标题 | 默认原因 / 下一步 | 标记 |
| --- | --- | --- | --- |
| `empty` | 暂无内容 | 这里还没有可显示的内容。可以先添加内容，或稍后再回来查看。 | `∅` |
| `no-results` | 没有找到匹配结果 | 当前筛选条件下没有内容。可以调整关键词或清除筛选后再试。 | `?` |
| `unconfigured` | 尚未配置 | 这个区域还没有设置内容。请先补充数据或完成配置。 | `!` |

- `title`、`description` 省略或为 `null` 时使用当前 kind 的默认值；显式空字符串会隐藏对应文本（但仍保留可访问名称回退）。只更新 `kind` 时，未被宿主自定义的标题与说明会随 kind 改变。
- 标题、原因说明和操作默认都在阅读路径中，不放进悬停或折叠区。说明较长时使用阅读字号与行高，窄容器中换行。
- `action` 必须是宿主 DOM 节点或节点数组。组件不创建业务按钮，不依赖 legacy Button，也不接管点击行为。节点会被移入组件，`destroy()` 后随根节点移除。
- 无障碍：根元素为命名 group，标题和说明用 `aria-labelledby` / `aria-describedby` 关联。宿主操作节点应使用可聚焦、可用键盘触发且带可见焦点环的控件。
- 组件不判断空态原因，也不会自动切换 kind；业务判断由宿主负责。

---

<a id="S06"></a>
## S06 Result

```js
var result = NoteUI.Result.mount(host, {
  status: 'error', // success | error | restricted | info；由宿主决定
  title: '未能保存',
  description: '缺少必填内容，请补充后再试。',
  details: '这段补充说明默认可见。',
  statusLabel: '失败',
  actions: [
    {
      label: '重试',
      variant: 'primary',
      onClick: function (event) { retrySave(); }
    },
    document.getElementById('back-button') // 也可以直接是 DOM 节点
  ]
});

result.update({
  status: 'success',
  title: '已保存到本地',
  description: '更改已写入当前页面，没有上传到服务器。',
  actions: [doneButton]
});
result.destroy();
```

- `status` 完全由宿主给定，组件不从内容、错误对象或数据推断业务结果。未知值按 `info`。
- 默认状态标签 / 通用回退文案：

| status | 可见状态标签 | 默认标题 | 回退说明 |
| --- | --- | --- | --- |
| `success` | 成功 | 操作已完成 | 本次操作已经结束。你可以继续下一步，或返回查看其他内容。 |
| `error` | 失败 | 操作未完成 | 本次操作没有完成。你可以查看原因后重试，或返回上一步。 |
| `restricted` | 受限 | 当前受限 | 当前条件不允许继续。你可以确认权限、可用范围，或稍后再试。 |
| `info` | 信息 | 结果说明 | 这是本次操作的结果说明。请根据需要继续下一步。 |

显式 `title` / `description` / `statusLabel` 覆盖默认值。默认文案不携带具体业务事实，宿主应提供真实原因和下一步；组件不自行宣称任务完成。

- `details` 是默认可见的补充说明，可为字符串或 DOM；不使用折叠，不放入角落小字。
- `actions` 支持：
  - 单个 DOM 节点；
  - DOM 节点数组（可与配置混合）；
  - 操作配置数组：`{ label, variant: 'primary'|'secondary'|'quiet', disabled, ariaLabel, onClick(event) }`。
  - 组件自己渲染的配置按钮是原生 `<button>`，不依赖 legacy Button。宿主提供的 DOM 操作节点原样移入。
- 更新 `status`、标题、说明、`details`、`statusLabel` 会立即重绘；只有更新包含 `actions` 键时才重建操作区，以避免无关更新重排操作节点。
- 组件不执行提交、重试、权限检查或跳转；这些必须由宿主提供操作节点/回调完成。Result 不是 live region，异步得到结果时的播报和焦点移动由宿主决定。
- 视觉上同时使用标记、可见状态文字和颜色区分状态，不只靠颜色。窄容器保持标题和说明换行；操作可换行。

---

## 键盘与可访问性汇总

- 所有内建按钮都是原生 `button`，Tab 可达，Enter/Space 触发，`focus-visible` 使用 3px `--hnv-color-focus` 焦点环。
- 组件不劫持页面快捷键，不建立键盘陷阱，也不自动抢焦点。S05 / S06 的宿主 DOM 操作节点需由宿主保证可访问性。
- 进度条有明确名称；确定进度暴露 `aria-valuenow/min/max`，不确定进度不提供假数值。Skeleton 的视觉占位对辅助技术隐藏，根元素保留加载名称。Spinner 始终有可见文字。
- 重要说明（原因、下一步、数据范围）默认可见，不依赖悬停或 `title`。
- 减少动效：Spinner 与不确定进度停止动画并保留静态形态和文字；确定进度取消宽度过渡；其余组件不依赖动画表达含义。
- Toast 的 live region 与 Spinner 的 `aria-live` 均为一个通知/加载区域；不要用它们反复播报同一信息。

## 支持范围与明确限制

- 仅支持本地静态/宿主数据；没有异步请求、存储、账号、评分、测验或业务结果判定。
- 未在真实读屏器、缩放 200%/400% 或高对比度模式下做完整验证；仅按原生语义与 ARIA 基本约定实现。
- Toast 是临时层，不持久化；达到同时上限时最早条目会让位，可能丢失未读消息。错误默认持久，但宿主仍应提供可关闭或可恢复路径。
- Toast 无焦点陷阱、无背景遮罩；关闭时若有焦点在条目内，浏览器会把焦点移开，宿主需自行管理重要后续焦点。
- Progress 不估计不确定任务的完成比例；不确定条纹是状态表达，不是进度读数。
- Skeleton 的 shape 是对真实内容的近似，不能自动保证与所有内容结构一致；宿主应选择匹配的 variant 并在加载结束后销毁。
- Empty / Result 的默认文案只是通用回退。组件不创建业务动作，业务原因、下一步、权限与成功/失败状态由宿主给出。
- 所有新增组件均为候选，尚无用户审美或使用评价，不能据此宣称已确认。

## 最小用法

```html
<link rel="stylesheet" href="src/core/tokens.css">
<link rel="stylesheet" href="src/ui/feedback.css">
<script src="src/core/core.js"></script>
<script src="src/core/icons-data.js"></script>
<script src="src/core/icons.js"></script>
<script src="src/core/motion.js"></script>
<script src="src/core/floating.js"></script>
<script src="src/ui/feedback.js"></script>

<div id="host"></div>
<script>
  NoteUI.Toast.show({
    message: '已保存到本地',
    tone: 'success',
    duration: 5000
  });

  var progress = NoteUI.Progress.mount(document.getElementById('host'), {
    label: '整理笔记',
    value: 42
  });
  progress.update({ value: 68 });
</script>
```

局部 Toast：

```js
var localToasts = NoteUI.Toast.mount(document.getElementById('host'), {
  max: 2,
  label: '页面内通知'
});
localToasts.show({ message: '这是一条局部提醒。', tone: 'warning', duration: 0 });
```

Skeleton 加载结束替换：

```js
var skeleton = NoteUI.Skeleton.mount(host, { variant: 'text', lines: 3, label: '正文加载中' });
loadContent().then(function (contentNode) {
  skeleton.destroy();
  host.appendChild(contentNode);
});
```

（`loadContent` 是宿主自己的数据流程；本组件库不包含网络加载或请求逻辑。）
