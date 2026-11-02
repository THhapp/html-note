# 基础输入与表单（ui-forms-basic）

本模块提供 F01–F08：字段外壳、单行文本、多行文本、数字输入、复选、单选组、原生下拉与可搜索组合框。组件面向宿主配置与数据收集，不生成测验、评分或闯关页面（K13）。

## 1. 范围与加载

源码：

- `src/ui/forms-basic.js`：`NoteUI.Field / TextInput / Textarea / NumberInput / Checkbox / RadioGroup / Select / Combobox`
- `src/ui/forms-basic.css`：只使用 `.nui-*` 作用域与 `--hnv-*` tokens；无全局裸选择器
- `src/manifests/ui-forms-basic.json`
- `gallery/demos/ui-forms-basic.js`、`docs/ui-forms-basic.md`

加载顺序：共享基础在前，本模块在后。本模块只依赖 `core`（实际使用 `NoteCore.text / uid / validateHost / onResize`，缺失时对 uid/onResize 有局部回退）；不依赖 legacy、navigation 或 forms-advanced。F08 不依赖 `NoteUI.Select`。

```html
<link rel="stylesheet" href="src/core/tokens.css">
<link rel="stylesheet" href="src/core/base.css">
<link rel="stylesheet" href="src/ui/forms-basic.css">
<script src="src/core/core.js"></script>
<script src="src/core/icons-data.js"></script>
<script src="src/core/icons.js"></script>
<script src="src/core/motion.js"></script>
<script src="src/core/floating.js"></script>
<script src="src/ui/forms-basic.js"></script>
```

（本模块不使用图标与 floating；完整 core 的脚本顺序列在此处，便于单模块包接入。F08 的列表为组件内内联定位，见第 12 节。）

所有动态组件按 §4 向 host **追加**根元素，返回 `{ el, update(patch), destroy(), getValue? }`。程序 `update()` 不触发任何 `onChange`；组件不会把程序更新冒充为用户事件。字符串标签与提示一律按纯文本渲染；本模块没有接收 HTML 的选项。

共同约定：

- 空值策略由组件逐个写清；空串在 NumberInput 中保持 `null`，在 Select 中表示占位/无选择。
- 禁用优先使用原生 `disabled`；只读优先使用原生 `readonly`。禁用态文字仍可读，不仅靠透明度。
- 焦点环使用 `--hnv-color-focus`，宽度 3px；`prefers-reduced-motion: reduce` 下不启用过渡。
- 窄容器使用 `min-width: 0`、换行与局部滚动；不把标签压到不可读。

<a id="F01"></a>

## 2. F01 NoteUI.Field

```js
var input = NoteUI.TextInput.mount(document.createElement('div'), { value: '' });
var field = NoteUI.Field.mount(host, {
  label: '笔记标题',
  hint: '说明默认可见，解释标题会出现在哪里。',
  required: true,
  error: '',
  control: input
});
field.setError('标题不能为空。');
field.setError('');
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `label` | string | `''` | 可见标签，纯文本。 |
| `hint` | string | `''` | 默认可见的辅助说明；非空时加入控件的 `aria-describedby`。 |
| `required` | boolean | `false` | 显示“必填”；原生 `input/select/textarea` 设置 `required`，其它控件设置 `aria-required="true"`。 |
| `error` | string | `''` | 初始错误；非空时显示错误块并设置 `aria-invalid="true"`。 |
| `control` | DOM 节点 \| 含 `.el` 的实例 | `null` | 控件 DOM 会被移入字段；实例本身的 `destroy()` 不归 Field 调用。 |
| `id` | string | `''` | 指定控件 id；未给时沿用控件已有 id，否则生成唯一 id。 |
| `hintSlot` | Element \| null | `null` | 可选：把 hint 节点移入宿主指定的固定提示区，默认仍留在字段根内。 |
| `errorSlot` | Element \| null | `null` | 可选：把 error 节点移入宿主指定的固定提示区，默认仍留在字段根内。两个 slot 可指向同一元素。 |

实例：`el`、`control`（解析后的可聚焦元素）、`setError(message)`、`update(patch)`、`destroy()`。`update` 支持以上全部键（包括移动 `hintSlot`/`errorSlot`）；`setError(null)` 或 `update({error:''})` 清除错误。slot 必须是 Element 或 null，否则抛 `TypeError`；销毁时 Field 会同时把移入 slot 的 hint/error 节点移除，不在宿主提示区留下残料。

关联规则：

- 普通原生控件：`label[for]` 指向控件 id，Field 合并 `aria-describedby`（说明、错误），并在错误时设置 `aria-invalid`。
- 组件实例（如 TextInput/Select/Combobox）：优先关联实例内部第一个可聚焦原生控件；外部 `label for` 落在该元素上。
- `fieldset` 或 `role="group"/"radiogroup"`：使用 `aria-labelledby` 指向 Field 标签，不再对内部首个控件做 `label for`。分组控件自身已有 legend 时，避免重复提供 Field 标签。
- 替换 `control` 时清理旧控件由 Field 添加的 `aria-describedby`、`aria-invalid`、`required` 与 `aria-labelledby`，再建立新关联。
- 错误的 `role="alert"` 区域与长说明都在正常阅读路径中，默认可见、可换行；字段外壳不读取或修改控件值。
- 指定 slot 不改变关联语义：`aria-describedby` / `aria-invalid` 仍按上面的规则作用于控件，提示节点只改挂载位置。

#### 提示承载与布局预留

默认 hint/error 位于字段根内，显示时会参与布局。需要「提示不挤动画面」时，可把两者挂到宿主预留的提示区（例如工具栏下方固定高度的 `.form-messages`，或用样式定位到图形区留白）：

```js
var messageStrip = document.getElementById('form-messages'); // 宿主预留，可为 absolute 定位
var field = NoteUI.Field.mount(toolbar, {
  label: '上层数据长度',
  hint: '46–1500 B',
  errorSlot: messageStrip,
  hintSlot: messageStrip,
  control: numberInput
});
// 之后只在数据区更新，字段根/工具栏高度不被错误提示挤动
```

默认不传 slot 时行为与之前完全一致；错误仍由 Field 显示与关联，只是节点位置由宿主决定。推荐给提示区预留 min-height 或固定定位，避免 slot 内容自身改变宿主布局。

限制：`destroy()` 会移除字段根，因此被移入的控件 DOM 也随之离开文档；若控件是实例，请自行调用其 `destroy()`。无控件时字段可作为空外壳显示标签、说明与错误，但不会自动关联后加入的控件。Field 与 NumberInput 的内部错误不宜同时作为两个错误源。

<a id="F02"></a>

## 3. F02 NoteUI.TextInput

```js
var text = NoteUI.TextInput.mount(host, {
  value: '',
  placeholder: '输入内容',
  clearable: true,
  type: 'text',
  onChange: function (value, event) { /* 用户输入或点击清空 */ }
});
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `value` | string | `''` | 初始值；程序更新不触发事件。 |
| `placeholder` | string | `''` | 占位文字；不作为唯一标签。 |
| `disabled` | boolean | `false` | 原生 disabled。 |
| `readonly` | boolean | `false` | 原生 readonly；清空按钮隐藏。 |
| `clearable` | boolean | `false` | 有内容时显示键盘可达的清空按钮。 |
| `type` | `'text' \| 'search'` | `'text'` | 搜索是原生 `input[type=search]` 配置变体。 |
| `onChange` | function | `null` | `(value, event)`；用户 input 与清空按钮 click 触发。 |
| `id` | string | `''` | 原生 input 的 id，便于 Field 关联。 |

实例：`el`、`getValue()`（读取原生 `input.value`）、`update(patch)`、`destroy()`。`update` 支持以上全部键；程序改值、禁用、只读、类型与占位均不触发 `onChange`。

键盘与可访问性：输入框为原生 input；清空按钮是原生 button，有 `aria-label="清空输入"`，在内容非空时进入 Tab 顺序，Enter/Space 可激活。输入框与按钮的焦点环通过容器 `:focus-within` 与按钮 `:focus-visible` 呈现。长文本在 input 内部滚动，不撑破父容器。搜索变体隐藏 WebKit 原生取消按钮以避免两个清空入口。

<a id="F03"></a>

## 4. F03 NoteUI.Textarea

```js
var area = NoteUI.Textarea.mount(host, {
  value: '',
  rows: 3,
  autoGrow: true,
  maxRows: 8,
  showCount: true,
  maxLength: 200,
  onChange: function (value, event) {}
});
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `value` | string | `''` | 多行文本；程序更新不触发事件。 |
| `rows` | number | `3` | 初始行数；关闭自动增高时决定固定高度。 |
| `autoGrow` | boolean | `true` | 根据内容增高；关闭后使用 rows 与内部滚动。 |
| `maxRows` | number | `10` | 自动增高上限行数（至少 1）。 |
| `showCount` | boolean | `false` | 显示字数；设置 `maxLength` 时也会自动显示上限计数。 |
| `maxLength` | number \| null | `null` | 原生字符上限；限制用户键入。 |
| `placeholder` | string | `''` | 占位文字。 |
| `disabled` / `readonly` | boolean | `false` | 原生 disabled/readonly。 |
| `onChange` | function | `null` | `(value, event)`，用户 input 时触发。 |
| `id` | string | `''` | 原生 textarea id。 |

实例：`el`、`getValue()`、`update(patch)`、`destroy()`。字数显示为“N 字”或“N / max 字”，达到/超出上限时附带“已达上限/超出上限”文字，不只靠颜色。计数使用 `aria-describedby` 关联，不在每次按键时用 live region 打断。

行为：自动增高在容器宽度变化时重新测量；超过 `maxRows` 后高度固定并出现内部纵向滚动。程序 update 传入超过 `maxLength` 的宿主值不会被静默截断，计数会明确标出“超出上限”。组件不注册 keydown，不 preventDefault Tab、Ctrl+S 等宿主快捷键；Enter 只产生换行。字数按 UTF-16 code unit 计算，Emoji 可能计作 2。

<a id="F04"></a>

## 5. F04 NoteUI.NumberInput

```js
var number = NoteUI.NumberInput.mount(host, {
  value: null,
  min: 0,
  max: 100,
  step: 0.5,
  precision: null,
  clearable: true,
  onChange: function (value, event) { /* number | null */ }
});
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `value` | number \| 数字字符串 \| null \| `''` | `null` | 初始值；空值归一为 `null`，不转 0。 |
| `min` / `max` | number \| null | `null` | 上下限；宿主应保证 min ≤ max。 |
| `step` | number > 0 | `1` | 按钮与方向键的步长。 |
| `precision` | number \| null | `null` | 0–10 位小数；在 blur/Enter/步进时舍入。 |
| `disabled` / `readonly` | boolean | `false` | 原生输入禁用/只读，按钮同步禁用。 |
| `placeholder` | string | `''` | 占位文字。 |
| `clearable` | boolean | `false` | 有内容时显示清空按钮。 |
| `onChange` | function | `null` | 用户产生有效值变更时触发。 |
| `id` | string | `''` | 原生 input id。 |
| `messageSlot` | Element \| null | `null` | 可选：把“超出范围/格式有误/已调整”的内部消息移入宿主固定提示区；默认仍在数字输入下方。 |

实例：`el`、`getValue() -> number|null`、`getError() -> string`（额外方法）、`update(patch)`、`destroy()`。`getError()` 在当前文本非法、越界或精度尚未完成时立即返回提示（即使 blur 前的视觉消息尚未显示），便于 `NoteUI.Form` 在提交时阻止未提交的值。`update` 支持以上全部键；`value` 传 `null`/`''` 清空并保持 null，不触发事件，也不夹紧或吸附步长。

值与事件策略：

- 空文本/空值：`getValue() === null`，`aria-valuenow` 不存在，`aria-valuetext="未填写"`。绝不把空串当 0。
- 用户键入合法数字且在范围内：更新提交值，合法变化时触发 `onChange(value, event)`。设置了 `precision` 时，尚未达到精度的中间值（如精度 2 输入 `1.239`）先不提交，等 blur/Enter 再舍入并触发。
- 非法文本（`abc`、`1.2.3`、`Infinity`、`NaN` 等）：不提交、不触发；输入期间 `getError()` 已报告草稿错误但暂不显示视觉消息，blur/Enter 时保留可编辑文本并显示“输入有误”，`aria-invalid="true"`；`getValue()` 仍是上一个已提交值。
- 越界文本：键入期间不提交；blur/Enter 时夹紧到 min/max，写回格式化文本，提示“超出允许范围…已调整”，值变化时触发一次 `onChange`。
- `blur`、`Enter`、清空、上下按钮和键盘步进都会走提交路径；`Escape` 在文本与最后有效值不同或存在内部错误时恢复文本并清除提示。
- 程序 `update` 不触发 onChange，也不验证/夹紧；宿主应提供符合当前范围的值。
- `messageSlot` 只改变内部消息的挂载位置，不改变 `aria-describedby`、`getError()`、可见性与显示/清除时机；`update({messageSlot: null})` 把消息移回组件根内，销毁时组件会从 slot 移除自己创建的消息节点。

键盘：`ArrowUp/ArrowDown` ±step；`PageUp/PageDown` ±10×step；`Home/End` 在存在 min/max 时跳到边界；`Enter` 提交；`Tab` 保持原生焦点移动；带 Ctrl/Alt/Meta 的组合键不接管。输入框使用 `role="spinbutton"` 与 `aria-valuemin/max/now`；空值不伪造 valuenow。上下按钮有独立 aria-label，边界时禁用。数字文本按 ASCII 小数/指数解析，不接受千分位或本地化逗号。`messageSlot` 不影响这些键盘与可访问性行为；与 Range 的精确小边界值配合方式见 [ui-forms-advanced](ui-forms-advanced.md#F10)。

<a id="F05"></a>

## 6. F05 NoteUI.Checkbox

```js
var cb = NoteUI.Checkbox.mount(host, {
  label: '同意',
  checked: false,
  indeterminate: false,
  disabled: false,
  value: 'agree',
  onChange: function (checked, event) {}
});
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `label` | string | `''` | 可见标签，长文本自然换行。 |
| `checked` | boolean | `false` | 选中状态。 |
| `indeterminate` | boolean | `false` | 半选，写入原生 `input.indeterminate`。 |
| `disabled` | boolean | `false` | 原生 disabled。 |
| `value` | string | `undefined` | 写入原生 `input.value`，供宿主收集。 |
| `onChange` | function | `null` | `(checked, event)`，仅用户 `change` 触发。 |

实例：`el`、`getValue() -> boolean checked`、`update(patch)`、`destroy()`。

半选不是第三个可提交值：程序可设置 `indeterminate: true`，点击后浏览器原生清除半选并触发 change。组用法就是多个 Checkbox 组合，由宿主自行排列并收集 `getValue()` 或原生 `value`；本模块不另造 CheckboxGroup。标签通过包裹 label 与原生 input 关联，Space 切换由浏览器提供。`value` 不会被 `getValue()` 返回，这一点在组收集时需要区分。

<a id="F06"></a>

## 7. F06 NoteUI.RadioGroup

```js
var radio = NoteUI.RadioGroup.mount(host, {
  label: '处理方式',
  value: 'auto',
  options: [
    { value: 'auto', label: '自动' },
    { value: 'manual', label: '手动（长标签会自然换行）' },
    { value: 'legacy', label: '旧模式（禁用）', disabled: true }
  ],
  onChange: function (value, event) {}
});
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `options` | `[{value,label,disabled}]` | `[]` | 选项；值使用 `Object.is` 比较。 |
| `value` | any | `null` | 当前选中值；无匹配时为无选择。 |
| `label` | string | `''` | 可见 legend；为空时提供仅供辅助技术的“选项组”名称。 |
| `disabled` | boolean | `false` | 整组禁用（所有 radio 原生 disabled）。 |
| `inline` | boolean | `false` | 额外排列变体：横向换行。 |
| `onChange` | function | `null` | `(value, event)`，用户改变选择时触发。 |

实例：`el`（fieldset）、`getValue() -> 选中值 | null`、`update(patch)`、`destroy()`。`name` 由 `NoteCore.uid` 生成并保证实例间唯一，不接受自定义 name；原生 radio 的方向键和互斥选择由浏览器提供，禁用项自动跳过。长选项文本换行；`fieldset/legend` 提供分组语义。

程序 update 的 `value` 若无匹配，归一为 `null`（无选择），不自动选择第一项，也不触发 onChange。选项 value 应避免使用 `null`/`undefined`，否则无法与“无选择”区分；重复 value 时第一个匹配生效。选项更新会重建 radio，现有焦点可能丢失。

<a id="F07"></a>

## 8. F07 NoteUI.Select

```js
var select = NoteUI.Select.mount(host, {
  options: [{ value: 'a', label: '选项 A' }],
  value: 'a',
  multiple: false,
  placeholder: '请选择',
  clearable: true,
  emptyText: '暂无选项',
  onChange: function (value, event) {}
});
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `options` | `[{value,label,disabled}]` | `[]` | 选项；`value` 保留宿主原始类型。 |
| `value` | any \| any[] | `null` | 单选为单值；多选为数组。 |
| `multiple` | boolean | `false` | 使用原生 `select[multiple]`。 |
| `placeholder` | string | `''` | 单选占位选项；空字符串可被选择并产生 null。 |
| `clearable` | boolean | `false` | 有值且可用时显示清空按钮。 |
| `disabled` | boolean | `false` | 原生 select disabled。 |
| `emptyText` | string | `''` | 无选项时显示的空态文字，默认“暂无选项”。 |
| `id` | string | `''` | 原生 select id。 |
| `size` | number \| null | `null` | 多选可见行数；默认随选项数在 2–7 行间调整。 |
| `onChange` | function | `null` | 原生 change 时触发；单选返回原值或 null，多选返回新数组。 |

实例：`el`、`getValue()`（单选原值或 null；多选返回按选项顺序排列的新数组）、`update(patch)`、`destroy()`。

行为：

- 单选用原生 `<select>`，占位选项是第一个空值选项；选择占位项会触发 `onChange(null)`。清空按钮恢复占位或空选择，已选值变化时触发一次用户事件。
- 多选使用原生 `<select multiple>` + 可见摘要 + 清空。摘要通过 `role="status"` 呈现“已选 N 项：完整标签”，未选择时为“尚未选择。”；清空后 `getValue()` 为 `[]`。
- 程序 update 的 value 若无匹配，回到空值（单选 null / 多选 []），不自动选第一项，不触发事件。选项更新时保留仍存在的值。
- 原生 option.value 使用内部索引键；宿主应使用 `getValue()`/`onChange`，不要以底层 `select.value` 作为业务值。这样可保留数字/字符串等原始类型并允许选项值含空字符串。
- 多选需要 Ctrl/⌘ 点选，这是原生 multiple 的行为；提示写在正常阅读路径中。长选项在单行原生 select 中可能被浏览器截断，展开下拉可读完整文本；多选摘要完整换行。
- 不提供搜索；可搜索选择使用 F08。

<a id="F08"></a>

## 9. F08 NoteUI.Combobox

```js
var combo = NoteUI.Combobox.mount(host, {
  options: [
    { value: 'bj', label: '北京' },
    { value: 'sh', label: '上海' },
    { value: 'off', label: '境外（禁用）', disabled: true }
  ],
  value: null,
  placeholder: '输入以筛选',
  clearable: true,
  allowFreeText: false,
  emptyText: '',
  onChange: function (value, event) {}
});
```

| option | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `options` | `[{value,label,disabled}]` | `[]` | 本地选项，label 用于显示与过滤。 |
| `value` | any \| null | `null` | 已提交值；自由文本值可为字符串。 |
| `placeholder` | string | `''` | 原生 input 占位。 |
| `clearable` | boolean | `false` | 清空按钮；有已提交值或输入文本时显示。 |
| `disabled` | boolean | `false` | 禁用输入与内部按钮并关闭列表。 |
| `allowFreeText` | boolean | `false` | 明确控制是否允许自由输入与提交。 |
| `emptyText` | string | `''` | 无选项/无匹配时文字；默认按情况显示“暂无选项”或“无匹配选项”。 |
| `onChange` | function | `null` | 仅用户选择或提交且值实际变化时触发。 |
| `id` | string | `''` | 原生 input id，供 Field 关联。 |

实例：`el`、`getValue()`、`update(patch)`、`destroy()`。没有公开 open/close 方法；交互通过输入框、内部展开按钮与清空按钮完成。

打开与过滤：

- 点击输入框、开始键入或按 `ArrowDown` 打开；单纯 Tab 聚焦不自动展开，避免键盘浏览表单时突然遮挡。
- 过滤默认对 label 做 trim 后不区分大小写的包含匹配；只输入空格等同空查询，显示全部。
- 无结果时列表内显示“无匹配选项”（或宿主 emptyText），并通过隐藏的 `role="status"` 区域播报；此时没有 active descendant。
- 列表为组件内绝对定位，宽度跟随输入容器，最大高度受视口与局部滚动限制。不使用 NoteCore.floating，不创建 body 层或焦点陷阱。
- 列表的 mousedown 阻止默认聚焦，以保持输入焦点并避免点击列表空白处误关；滚动依赖原生滚动容器，滚轮可用（自检探测），触控与经典滚动条拖动未单独验证。

键盘与焦点：

- `ArrowDown/ArrowUp` 打开并循环移动高亮，跳过禁用项；`Home/End` 在打开时跳到第一个/最后一个可用项。
- `Enter`：有高亮项则选择；无高亮且 `allowFreeText` 为真则提交当前文本；否则关闭并撤销未确认输入。
- `Escape`：仅在列表打开时拦截并 `stopPropagation`，关闭列表、恢复已提交显示值、保持输入焦点，不提交自由文本。
- 点击外部或失焦关闭列表，且不抢焦点：严格模式恢复已提交值；自由输入模式提交当前文本。
- 输入框保持焦点，列表项通过 `aria-activedescendant` 高亮；点击列表项会阻止 mousedown 默认行为以保持输入焦点。
- IME 组合输入期间不处理过滤、Enter 或方向键；`compositionend` 后再刷新过滤，不误触发提交。

值策略：

- 严格模式（`allowFreeText: false`）：键入只用于过滤；未选择就关闭时撤销。程序 `update({value})` 未匹配任何选项时归一为 `null`。选择与当前值相同时不触发 onChange。
- 自由模式（`allowFreeText: true`）：Esc 取消；Enter 或点击外部提交当前文本（原样字符串，空文本为 null）。若 Enter 时有高亮项，优先选择该选项。程序传入未匹配的值会作为自由文本保留并显示。
- 程序 update 不触发 onChange；选项更新后，严格模式会重新校验当前值，自由模式保留未匹配文本。
- 清空按钮把已提交值置为 `null`，并清空当前过滤文本；只有当清空前存在已提交值时才触发一次 `onChange(null, event)`，未提交的过滤文本本身不产生值变化事件。清空后焦点回到输入框。

ARIA：输入框 `role="combobox"`、`aria-autocomplete="list"`、`aria-haspopup="listbox"`、`aria-expanded`、`aria-controls`；列表 `role="listbox"`，项 `role="option"`，禁用项 `aria-disabled="true"`；高亮项通过 `aria-activedescendant` 引用，并设置 `aria-selected="true"`（单选择跟随高亮）。内部展开/清空按钮有独立中文 aria-label。

限制：本地静态数据，无远程/异步、分组、虚拟滚动或自定义过滤函数；label 为纯文本；祖先 `overflow:hidden` 可能裁剪内联列表；极长列表使用局部滚动。完整键盘/无障碍差异以真实浏览器实测为准；本模块不宣称覆盖 APG 示例的全部边缘行为。

## 10. 键盘与可访问性摘要

| 组件 | 键盘 | 结构 / 语义 |
| --- | --- | --- |
| Field | 不接管键盘 | `label[for]`、`aria-describedby`、`aria-invalid`、`role="alert"` 错误块；分组用 `aria-labelledby`。 |
| TextInput | 原生编辑；Tab 到清空按钮；Enter/Space 激活清空 | 原生 input；清空 button + aria-label；搜索为 `type=search`。 |
| Textarea | 原生编辑、换行、Tab/快捷键不被拦截 | 原生 textarea；计数通过 aria-describedby。 |
| NumberInput | ↑↓、PageUp/PageDown、Home/End（有边界时）、Enter 提交、Esc 恢复；不拦截修饰键组合 | `role="spinbutton"`、aria-valuemin/max/now/valuetext；空值显式“未填写”；错误消息 `role="status"`。 |
| Checkbox | Space 由原生切换 | 原生 checkbox + 包裹 label；indeterminate 原生半选。 |
| RadioGroup | 原生方向键在组内移动、跳过禁用项 | fieldset/legend、同名 radio、唯一 name。 |
| Select | 原生单选/多选键；多选 Ctrl/⌘ 点选 | 原生 select/select[multiple]；多选摘要 `role="status"`。 |
| Combobox | ↑↓ 高亮、Home/End、Enter 选择/提交、Esc 取消、Tab 离开；IME 安全 | combobox + listbox + option；aria-activedescendant；展开/清空按钮。 |

共同要求：可见焦点环 3px `--hnv-color-focus`；禁用状态使用原生 disabled 并保持文字可读；错误状态有文字与视觉变化，不只靠颜色；必要说明默认可见；reduced-motion 下无过渡依赖。

## 11. 支持范围与明确限制

- 本地静态数据与宿主回调；不发网络请求、不读取远程数据、不内置校验业务或评分。
- 浏览器目标：现代 Edge/Chromium（含 `ResizeObserver`、`:focus-visible`、Pointer Events）。无兼容 polyfill；不支持 IE。
- NumberInput 只解析 ASCII 数字、正负号、小数点和指数；不接受千分位、全角数字或本地化小数逗号。
- Select 的多选交互和单行长选项截断受原生控件限制；组件不伪装成自绘 listbox。
- Combobox 列表为内联绝对定位，未接入 `NoteCore.floating`；不使用 body 层、焦点陷阱或动画。宿主容器的 `overflow:hidden` 可能裁剪列表。
- 所有标签、说明、提示与空态文字按纯文本处理；不支持富文本或 HTML 标签。
- 程序 update 不触发 onChange；除 Select/Combobox/RadioGroup 对无效值归一为空值外，不代替宿主执行业务校验。
- 在 `NoteUI.Form` 中，NumberInput 的 `getError()` 会被复制到 Field 错误；如果用户先失焦再提交，组件内部消息与 Field 错误可能同时可见。宿主可选择只依赖其中一个错误源；组件侧不取消自身可见提示。
- Field 不持有值；Checkbox 的 getValue 返回 checked 布尔值；NumberInput 在非法文本状态下 getValue 仍返回上一个已提交值。
- Textarea 字数按 UTF-16 code unit 计；Combobox 过滤只匹配 label，不做拼音/模糊匹配。
- 未验证：老旧 Safari/Firefox 的具体 IME 与焦点差异、超大数据量下的虚拟滚动、复杂浮层嵌套（因本模块不使用 floating）、Combobox 列表触控滚动与经典滚动条拖动。

## 12. 公开形状与实现备注

- F02–F08 统一为 `mount(host, options) -> { el, getValue, update(patch), destroy() }`，事件为 `onChange(value, event)`。F01 Field 无 `getValue`，额外暴露 `control`（解析后的可聚焦元素，而不是传入实例本身）与 `setError(message)`。
- F04 NumberInput 额外提供 `getError()`，供 `NoteUI.Form` 在提交时阻止未提交的非法值；F06 RadioGroup 支持 `inline` 与整组 `disabled`；F07 Select 支持 `id` 与 `size`。以上均为非破坏性扩展。
- F08 使用组件内内联绝对定位，不接入 `NoteCore.floating`：不创建 body 层或焦点陷阱，代价是列表可能被祖先 `overflow:hidden` 裁剪。这是本组件当前明确的实现选择。
- F05 Checkbox 的 `getValue()` 返回布尔 checked；`value` 选项只写入原生 `input.value`，不参与 `getValue()`。
- F08 Combobox 不提供公共 open/close 方法；内部展开按钮与清空按钮只暴露 DOM，交互通过输入框、展开按钮和清空按钮完成。

## 13. 最小用法

```js
// F01 + F02
var input = NoteUI.TextInput.mount(document.createElement('div'), { value: '', clearable: true });
NoteUI.Field.mount(host, { label: '标题', hint: '默认可见说明', required: true, control: input });

// F03
NoteUI.Textarea.mount(host, { value: '', rows: 3, autoGrow: true, maxLength: 200, showCount: true, onChange: fn });

// F04
NoteUI.NumberInput.mount(host, { value: null, min: 0, max: 100, step: 1, onChange: fn });

// F05
NoteUI.Checkbox.mount(host, { label: '同意', checked: false, value: 'agree', onChange: fn });

// F06
NoteUI.RadioGroup.mount(host, {
  label: '处理方式',
  value: 'auto',
  options: [{ value: 'auto', label: '自动' }, { value: 'manual', label: '手动' }],
  onChange: fn
});

// F07
NoteUI.Select.mount(host, {
  options: [{ value: 'a', label: '选项 A' }],
  value: 'a',
  placeholder: '请选择',
  clearable: true,
  onChange: fn
});

// F08
NoteUI.Combobox.mount(host, {
  options: [{ value: 'a', label: '选项 A' }],
  value: null,
  allowFreeText: false,
  clearable: true,
  onChange: fn
});
```
