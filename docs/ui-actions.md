# 操作扩展（ui-actions）

## 1. 范围与加载

本模块提供 A01–A03：按钮组、复制按钮和切换按钮/切换组。A01/A02 必须复用旧组件的 `NoteUI.Button`；A02 必须通过 `NoteCore.copy` 执行复制，不另造基础按钮或剪贴板实现。

源码：

- `src/ui/actions.js`
- `src/ui/actions.css`

依赖：`core` + `legacy`（尤其 `NoteUI.Button`）。A03 自身不挂载 Button，但作为同一模块仍随 legacy 一起加载。

```html
<link rel="stylesheet" href="src/core/tokens.css">
<link rel="stylesheet" href="src/core/base.css">
<link rel="stylesheet" href="src/ui/controls.css">
<link rel="stylesheet" href="src/ui/actions.css">
<script src="src/core/core.js"></script>
<script src="src/core/icons-data.js"></script>
<script src="src/core/icons.js"></script>
<script src="src/core/motion.js"></script>
<script src="src/core/floating.js"></script>
<script src="src/ui/controls.js"></script>
<script src="src/ui/actions.js"></script>
```

加载顺序：core → legacy（Button）→ actions。若要把字符串图标名交给 Button，宿主需在 Mount 前设置 `NoteUI.Button.iconResolver`（例如返回 `NoteCore.icons.get(name)`）；也可以直接传 DOM 图标给 Button 的 `icon` 选项。A02 的反馈图标使用 `NoteCore.icon`，缺失时会退回本地文本符号。

所有 `mount` 都向 host 追加根元素，返回 `{ el, update(patch), destroy(), ... }`。程序 `update()` 不触发点击、`onCopy` 或 `onChange`。

<a id="A01"></a>

## 2. A01 NoteUI.ButtonGroup

```js
var bg = NoteUI.ButtonGroup.mount(host, {
  items: [
    { label: '保存', variant: 'primary' },
    { label: '取消', variant: 'secondary' },
    { label: '复制链接', icon: iconNode, iconOnly: true, ariaLabel: '复制链接' }
  ],
  orientation: 'horizontal',
  role: 'group',
  label: '表单操作'
});
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `items` | Array<string \| Button options> | `[]` | 每一项原样交给 `NoteUI.Button.mount`；字符串会转成 `{label}`。保留 `label/variant/disabled/onClick/icon/iconOnly/ariaLabel/size` 等所有 Button 字段。 |
| `orientation` | `'horizontal'\|'vertical'` | `'horizontal'` | 排列方向。 |
| `role` | `'group'\|'toolbar'` | `'group'` | 根 ARIA role；toolbar 使用 roving tabindex 和方向键移动焦点。 |
| `label` | string | `'按钮组'` | 根的 `aria-label`；也接受 `ariaLabel`、`'aria-label'` 作为输入别名。 |
| `disabled` | boolean | `false` | 整组禁用；与单项自身 disabled 合并（单项字段按布尔解释，`data-disabled` 的 Button 也视为禁用）。 |
| `onClick` | function | null | 可选组级回调 `(item, index, event)`；在单项自己的 `onClick` 之后调用。 |

方法：`update(patch)` 支持以上键；`destroy()` 逐个销毁子 Button，再移除根。`items` 更新或 `role` 变化会重建子按钮；更新禁用状态时会同时更新已有 Button 实例。根类 `.nui-button-group`。

可访问性：根有 `role` 和 `aria-label`；toolbar 模式下只保留一个可用按钮在 Tab 顺序中（初始为首个可用项），左右/上下方向键按 orientation 移动焦点，Home/End 到首尾；被 Button 标为禁用（原生 `disabled` 或 `data-disabled`）的按钮不会进入 roving 循环。普通 group 使用各按钮的原生 Tab 顺序。按钮组不创造新的按钮语义，图标按钮的可访问名称由 Button 的 `ariaLabel`/`label` 提供。

限制：图标能力属于 R01 Button，本组件只透传字段。样式不会把普通 group 的短按钮强行拉满宽度；纵向时非纯图标按钮拉伸，纯图标按钮保持其固有尺寸。更复杂的分组、菜单与折叠行为不属于 A01。

<a id="A02"></a>

## 3. A02 NoteUI.CopyButton

```js
var copy = NoteUI.CopyButton.mount(host, {
  text: '要复制的文本',
  label: '复制文本',
  onCopy: function (result) { console.log(result.ok, result.method); }
});
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `text` | string | `''` | 固定文本来源。 |
| `getText` | function | null | 每次点击时调用的文本来源；优先于 `text`。返回其他值会转成字符串。 |
| `label` | string | `'复制'` | Button 的可见文案。 |
| `copiedLabel` | string | `'已复制到剪贴板'` | 成功反馈文字。 |
| `failedLabel` | string | `'复制失败，请手动选择下方文本'` | 失败反馈文字。 |
| `variant` | `'primary'\|'secondary'\|'quiet'` | `'secondary'` | 传给 Button。 |
| `disabled` | boolean | `false` | 禁用复制按钮。 |
| `feedbackDuration` | number | `2200` | 成功反馈自动隐藏的毫秒数；`<=0` 时保持显示。失败回退不自动隐藏。 |
| `onCopy` | function | null | 用户复制完成后调用 `(result)`，`result` 形如 `{ ok, method: 'clipboard'|'exec'|'manual' }`。 |
| `buttonOptions` | object | `{}` | 可选的 Button 附加字段；其中 `label/variant/disabled/onClick` 由 CopyButton 管理。 |
| `icon/iconPosition/iconOnly/size/ariaLabel/title` | Button 字段 | 无 | 可选透传，需 R01 Button 支持。 |

方法：`update(patch)` 支持以上键；`destroy()` 清除内部反馈计时器、销毁 Button、移除根。额外暴露 `el` 与 `button`（Button 实例）。没有 `getValue()`。

流程：点击后禁用按钮并设置 `aria-busy="true"`；调用 `getText()` 或取 `text`，再调用 `NoteCore.copy(value)`。成功时在 `role="status" aria-live="polite"` 的本地状态区显示图标 + 文案，并按 `feedbackDuration` 清理计时器；失败时（包括缺少 `NoteCore.copy` 或调用抛错）显示失败图标 + 文案，并展开一个只读 textarea，写入实际待复制文本、聚焦并选中，供本地文件/权限受限时手动复制。`onCopy(result)` 在反馈呈现后调用。程序更新不复制，也不会调用 `onCopy`；文本或文案更新会清除旧的反馈/回退。

可访问性：反馈同时使用图形和文字，不只依赖颜色；失败回退是标准只读 textarea，可被键盘选中；状态区是 live region。复制结果本身仍受浏览器权限约束，组件不声称写入一定成功。

限制：只处理字符串文本，不实现富文本/HTML/文件复制；失败回退使用系统原生文本框而不是新按钮；成功提示会消失但失败回退保留到下次操作或相关更新。

<a id="A03"></a>

## 4. A03 NoteUI.Toggle

```js
var one = NoteUI.Toggle.mount(host, {
  label: '加粗', pressed: false,
  onChange: function (value) { console.log(value); }
});

var group = NoteUI.Toggle.mount(host, {
  label: '文字对齐',
  options: [
    { value: 'left', label: '左对齐' },
    { value: 'center', label: '居中' },
    { value: 'right', label: '右对齐', disabled: true }
  ],
  value: 'center',
  exclusive: true,
  onChange: function (value) { console.log(value); }
});
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `label` | string | `'切换'`（单个）；组为空时无可见组名 | 单个时是按钮可见文案；组时是可见组标题。 |
| `pressed` | boolean | `false` | 单个切换的初始/程序状态。也接受单个 `value: boolean` 作为别名。 |
| `options` | Array | null | 传入数组时进入组模式；元素可为字符串或 `{value,label,disabled}`。 |
| `value` | 任意标量 \| Array | undefined | 组模式下的当前值；exclusive 用单值，multi 用数组。未匹配选项的值会被清理。 |
| `exclusive` | boolean | 组模式默认 | 互斥组最多一个按下项；只要不是 multi 就按互斥处理。 |
| `multi` | boolean | `false` | 多选组；为 true 时覆盖 exclusive。 |
| `disabled` | boolean | `false` | 整组/单个禁用；与项禁用合并。 |
| `ariaLabel` | string | label / `'切换组'` | 组根 `aria-label`；单个按钮的可访问名称覆盖。 |
| `onChange` | function | null | 用户操作导致值变化时调用 `(value, event)`。单个传 boolean；互斥传单值；多选传数组副本。程序 `update()` 不触发。 |

方法：`update(patch)`；`getValue()`（单个 boolean、互斥单值、multi 数组副本）；`destroy()`。根类 `.nui-toggle`，组根为 `role="group"` + `aria-label`。按钮为原生 `<button type="button" aria-pressed="true|false">`。

行为与键盘：单个切换点击/空格/回车改变保持的按下状态；互斥组点击未选项会替换当前项，点击已选项不会取消（初始可为空）；多选组切换成员。所有按钮使用原生 Tab/空格/回车，禁用项使用原生 `disabled`，跳过点击和键盘激活。按下状态同时由 `aria-pressed`、背景/边界和可见勾选图标表达，不只依赖颜色。结构变化（`options` 或模式）会重建组内按钮；值更新只同步状态。长标签自然换行。

限制：A03 不实现方向键 roving tabindex，组内多个可用按钮均可 Tab 到达；组值建议使用字符串/数字等可严格比较的标量；多选数组复制是浅复制；不内置评分、开关或表单提交逻辑；程序更新不提供额外事件。

## 5. 键盘与可访问性摘要

- A01：根有 `role` 与 `aria-label`。toolbar 采用单一 Tab 停点 + 方向键/Home/End；普通 group 保留每个按钮的原生 Tab 顺序。禁用项由 Button 使用原生 `disabled`，不会被跳过聚焦逻辑误激活。
- A02：复制触发器是原生 Button；成功/失败反馈在 `role="status"` 的 live region 中；失败回退的只读 textarea 可获得焦点并被全选；反馈不只用颜色。是否实际写入系统剪贴板由浏览器权限决定。
- A03：按钮使用 `aria-pressed`；组是 `role="group"` 加 `aria-label`；原生 Tab/空格/回车激活，禁用项为原生禁用；勾选图标和文字状态补充颜色差异。互斥组和多选组的值分别由 `getValue()` 返回单值和数组副本。
- 三项目标中的可聚焦控件均使用可见焦点环；A01/A02 的 Button 复用旧组件的焦点行为，并在组件作用域内使用 `--hnv-color-focus`。

## 6. 支持范围与限制

- 已在 Windows Edge（Chromium）headless、`file://` 下验证挂载、更新、禁用、复制成功/失败回退、程序更新不触发回调及销毁；未验证 Firefox/Safari、移动端触摸、打印及真实笔记中的组合排版。
- 模块依赖旧组件模块；不加载 legacy 时 A01/A02 会明确抛错，A03 也不会被独立承诺为可运行模块包。字符串图标需要宿主设置 `NoteUI.Button.iconResolver`，或用 DOM 图标。
- A02 只处理文本；失败回退依赖用户手动复制，不尝试绕过浏览器权限；成功提示的计时器在销毁/更新时清理，失败回退不自动消失。
- A03 的结构更新（`options`/`multi`）会重建按钮，可能丢失当前焦点；互斥组不提供方向键 roving；建议选项值使用可严格比较的标量。
- 没有实现业务提交、远程请求、账号、上传或评价服务。

## 7. 最小用法

```js
NoteUI.ButtonGroup.mount(host, { items: [{ label: '保存', variant: 'primary' }, { label: '取消' }], label: '表单操作' });
NoteUI.CopyButton.mount(host, { text: '要复制的文本', label: '复制文本' });
NoteUI.Toggle.mount(host, { label: '加粗', pressed: false, onChange: function (v) { console.log(v); } });
```

## 8. 用户评价范围

A01–A03 均为候选组件，`userReview=not-reviewed`，未获用户评价；依赖的旧 Button 评价仍按其自身范围记录，不自动覆盖 A 组新增行为。技术自检不等于审美确认。
