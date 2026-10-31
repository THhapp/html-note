# 高级输入与表单控件（F09–F15）

本模块提供开关、滑块、表单组织、日期、时间、颜色与本地文件选择。组件把用户输入当作宿主配置数据，不生成测验、评分或闯关流程（K13）；尺寸、步长与范围都由调用方按内容配置（K10）；标签、格式说明、错误和禁用原因默认在正常阅读路径中可见（K09）。

所有新增项仍为候选，未获用户评价。

## 加载与依赖

普通 `<script>`、`<link>`，无模块构建、无 CDN、无网络字体、无运行时请求。F09–F15 的源码按组件边界拆成 4 个经典脚本，必须按下列顺序加载（manifest 的 `js` 数组同序）：

| 文件 | 内容 |
| --- | --- |
| `src/ui/forms-advanced-internal.js` | 模块私有共享 helper（DOM、选项、提示/错误、浮层、触发按钮守卫），**不是公开 API** |
| `src/ui/forms-advanced.js` | F09 Switch、F10 Slider、F11 Form |
| `src/ui/forms-advanced-pickers.js` | F12 DatePicker、F13 TimePicker 及日期/时间内部 helper |
| `src/ui/forms-advanced-inputs.js` | F14 ColorPicker、F15 FileInput，以及模块清单 `NoteUI.formsAdvanced` |

```html
<link rel="stylesheet" href="src/core/tokens.css">
<link rel="stylesheet" href="src/core/base.css">
<link rel="stylesheet" href="src/ui/forms-basic.css">   <!-- F11 的 Field/TextInput 等 -->
<link rel="stylesheet" href="src/ui/forms-advanced.css">
<script src="src/core/core.js"></script>
<script src="src/core/icons-data.js"></script>
<script src="src/core/icons.js"></script>
<script src="src/core/motion.js"></script>
<script src="src/core/floating.js"></script>
<script src="src/ui/forms-basic.js"></script>                   <!-- F11 依赖 -->
<script src="src/ui/forms-advanced-internal.js"></script>       <!-- 必须先加载 -->
<script src="src/ui/forms-advanced.js"></script>
<script src="src/ui/forms-advanced-pickers.js"></script>
<script src="src/ui/forms-advanced-inputs.js"></script>
```

- 全部动态组件：`NoteUI.X.mount(host, options) -> { el, update(patch), destroy(), getValue? }`，向 host **追加**根元素，不清空既有节点。
- 组件依赖 `NoteCore`（DOM、生命周期、监听器、浮层），加载前必须已有 core；缺失时组件文件会明确抛错，不再保留局部回退。F12/F13 的日历与时间浮层复用 `NoteCore.floating`；F14 使用原生 `input[type=color]`；F15 使用原生 `input[type=file]`。
- 模块内部通过 `NoteUI._formsAdvancedInternal` 共享私有 helper；该名称不属于公开 API，宿主不应依赖或覆盖它。
- **程序 `update()` 永不触发 `onChange`**。用户点击、输入、选择、删除才触发。
- `getValue()` 返回副本；修改返回值不会回写组件。
- 禁用原因通过 `disabledReason` 传入并显示；原生 `disabled` 阻止操作和聚焦。

---

<a id="F09"></a>
## F09 NoteUI.Switch

立即切换的持久布尔状态。内部是原生 `button[role="switch"]`，带 `aria-checked`；可见标签与“已开启/已关闭”状态文字同时存在，不只依赖颜色。

### 选项

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `checked` | boolean | `false` | 当前状态 |
| `label` | string | `'开关'` | 可见标签，也是可访问名称 |
| `disabled` | boolean | `false` | 原生禁用 |
| `hint` | string | `''` | 默认可见辅助说明 |
| `disabledReason` | string | `''` | 禁用时显示为“不可用：…” |
| `required` | boolean | `false` | 显示“必填”标记；供表单嵌入 |
| `error` | string | `''` | 外部错误，默认可见 |
| `ariaLabel` | string | `''` | 仅当 `label` 为空时的兜底名称 |
| `onChange` | function | `null` | `(checked, event)` |

### 方法

`getValue()` 返回 boolean；`setError(msg)`；`focus()`；`update(patch)`；`destroy()`。实例还暴露 `el` 与 `button`。

### 键盘与事件

- Space / Enter：原生 button 激活，切换并调用 `onChange`。
- 只有开关按钮区域响应点击；旁边可见的 hint/错误文字不会误触切换。
- 禁用时使用原生 `disabled`，不能通过键盘或点击切换。
- `update({ checked })` 只更新显示，不触发 `onChange`。

### 与 Toggle 的区别

Switch 表示持续的开/关配置，切换后立即生效；它不替宿主提交表单。A03 `NoteUI.Toggle` 是“按下态按钮”，更接近工具模式或成组按压选择，不应当作布尔配置的替身。

### 最小用法

```js
var sw = NoteUI.Switch.mount(host, {
  label: '启用每日摘要',
  checked: true,
  hint: '切换后立即生效。',
  onChange: function (checked, event) { /* 宿主处理 */ }
});
```

---

<a id="F10"></a>
## F10 NoteUI.Slider

带可见读数的单值/区间滑块。单值优先使用原生 `input[type=range]`；区间使用两个原生 range 输入（上下排列，共享一个可见区间条），不使用自绘不可访问拇指。

### 选项

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `value` | number \| [number, number] | 最小值 / `[min, max]` | 区间模式下传数组 |
| `min` / `max` | number | `0` / `100` | 上下限；反向时内部交换 |
| `step` | number | `1` | 大于 0；非数字回退 1 |
| `range` | boolean | `false` | 双值模式 |
| `showValue` | boolean | `true` | 是否显示可见读数 |
| `format` | function | `null` | `(number, ctx) -> string`，`ctx` 含 `min, max, step, range` |
| `label` | string | `'数值'` | 可见标签 |
| `ariaLabel` | string | `''` | `label` 为空时的可访问名称兜底 |
| `hint` | string | `''` | 辅助说明 |
| `disabledReason` | string | `''` | 禁用时可见原因 |
| `required` | boolean | `false` | “必填”标记 |
| `error` | string | `''` | 外部错误 |
| `disabled` | boolean | `false` | 原生禁用 |
| `onChange` | function | `null` | `(number \| [min,max], event)` |

### 方法

`getValue()` 返回 number 或 `[min, max]`；`setError(msg)`；`focus()`；`update(patch)`；`destroy()`。

### 行为

- 数值始终夹紧到 `[min, max]`，程序更新与用户输入都按步长吸附。
- 区间起点不得大于终点：拖过另一端时，当前滑块停在另一端。程序传入 `[80, 20]` 会整理为 `[20, 80]`。
- 可见 `output` 显示格式化读数；每个 range 同时设置 `aria-valuetext`，屏幕阅读器读到与可见文本一致的数值。
- 切换 `range` 会重建输入；程序更新不触发 `onChange`。
- 减少动效时没有轨道动画；轨道、端点与文本读数仍然可见。

### 键盘

原生 range 键盘：方向键逐步调整，Home/End 到最小/最大，PageUp/PageDown 由浏览器按较大步长调整。区间模式中两个输入均可聚焦，标签为“最小值/最大值”。

### 最小用法

```js
var slider = NoteUI.Slider.mount(host, {
  label: '字号', min: 12, max: 32, step: 2, value: 18,
  format: function (value) { return value + ' px'; },
  onChange: function (value) { /* 宿主处理 */ }
});
```

### 限制

- 两个原生 range 上下排列，不是同轨重叠的双拇指；这是为保证可靠点击与键盘可达所做的选择。
- 不内置刻度标签或非线性比例（例如对数尺度）。
- 格式化函数抛错时回退为普通数字，不阻塞组件。

---

<a id="F11"></a>
## F11 NoteUI.Form

组合 Field 与已有控件，集中处理取值、默认值、同步校验、错误定位、重置和宿主提交回调。**不发送网络请求**。

依赖 `ui-forms-basic`：

| 字段类型 | 实际控件 |
| --- | --- |
| `text` | `NoteUI.TextInput` |
| `textarea` | `NoteUI.Textarea` |
| `number` | `NoteUI.NumberInput` |
| `checkbox` | `NoteUI.Checkbox`（字段外壳提供标签） |
| `select` | `NoteUI.Select` |
| `switch` | 本模块 `NoteUI.Switch` |
| `slider` | 本模块 `NoteUI.Slider` |
| `custom` | 宿主传入的 DOM 或组件实例，仍套 `NoteUI.Field` 外壳 |

### 选项

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `fields` | array | `[]` | 字段描述数组，见下 |
| `values` | object | `{}` | 初始值，按字段 `name` 覆盖默认值 |
| `onSubmit` | function | `null` | `(values, event \| null)`，仅校验通过时调用 |
| `onChange` | function | `null` | `(values, changedName)`，只响应用户改变 |
| `submitLabel` | string \| false | `'提交'` | `false` 隐藏提交按钮 |
| `resetLabel` | string \| false \| null | `'重置'` | `false`/`null`/`''` 隐藏重置按钮 |
| `validateOn` | string \| string[] | `['submit','blur']` | 可为 `submit`、`blur`、`input` |
| `label` | string | `'表单'` | 赋给表单的 `aria-label`，不额外显示标题 |

字段描述至少包含 `{ name, label, hint, required, control, options, validate, defaultValue }`：

```js
{
  name: 'email',
  label: '邮箱',
  hint: '仅用于本页配置。',          // 默认可见
  required: true,
  control: 'text',                    // text|textarea|number|checkbox|switch|select|slider|custom
  options: { placeholder: 'name@example.com' },
  validate: function (value, values) { return /\S+@\S+/.test(value) ? null : '邮箱格式不正确。'; },
  defaultValue: '',
  disabled: false,
  disabledReason: '',
  requiredMessage: '请填写邮箱。'      // 可选
}
```

`options` 按类型解释：

- text/textarea/number/checkbox/select/switch/slider：传给对应控件；select 可直接给选项数组，或对象中的 `options`。
- switch/slider：Form 会覆盖 `label/hint/required/error/onChange`，保留 `min/max/step/range/format` 等。
- `custom`：在字段上提供 `custom: domOrInstance`（也接受 `options` 为 DOM/实例，或直接把非字符串 `control` 设为 DOM/实例）。只写 `custom` 而不写 `control` 时也会按 custom 处理。实例建议提供 `getValue()`；可选 `getError()/update()/focus()`。表单错误由 Field 外壳显示。**custom 实例的生命周期归宿主**，Form 不会调用其 `destroy()`，只把它放进字段外壳，并在失焦、`submit()`、`getValue()` 时同步其值。字段 `disabled` 时 Form 会尝试调用实例 `update({ disabled: true })` 并禁用其原生控件，重建字段或销毁时恢复 Form 自己改动过的原生 `disabled` 状态。

### 方法

| 方法 | 说明 |
| --- | --- |
| `getValue()` | 返回当前字段值对象（副本）；会先同步 custom 实例的 `getValue()` |
| `setErrors(errors)` | 用 `{ name: message }` 替换错误；支持 `{message}`；不会聚焦 |
| `reset()` | 恢复 `defaultValue` 或类型默认值，清空错误；不触发 `onChange` |
| `submit(event?)` | 同步校验全部字段；有效时调用 `onSubmit`，返回 boolean；无效时聚焦第一个错误 |
| `focusField(name)` | 聚焦指定字段，返回是否成功 |
| `update(patch)` / `destroy()` | 统一生命周期 |

### 默认值与空值

- 文本/文本域：`''`；数字：`null`（空输入不是 0）；复选/开关：`false`；下拉：`null`（多选 `[]`）；滑块：最小值（区间 `[min,max]`）；custom：若无 `defaultValue`，首次挂载读取控件现有 `getValue()`/原生值，避免清空宿主预填内容。
- Form 持有 `values` 的内部副本；用户输入与 `update({ values })` 都不会反向修改宿主传入的 `options.values` 对象。
- 必填判断：`null/undefined`、去空白后为空的字符串、空数组视为空；`false` 在 checkbox/switch 上视为空；数字 `0` 不是空。
- 校验顺序：必填 → 控件自身 `getError()`（例如 NumberInput 的非法数字）→ `validate(value, values)`。
- 默认 `submit + blur`：用户输入时清掉该字段旧错误；失焦时校验；提交时校验全部。设为 `input` 时逐次输入即校验。程序 `update()` 不重新校验。

### 错误与焦点

- 字段错误通过 `Field.setError` 或高级控件的 `setError` 显示；错误摘要同时可见，列出字段名与消息。
- 提交失败会聚焦第一个错误字段；摘要中的条目也是按钮，可跳转到对应字段。
- `setErrors()` 只显示、不抢焦点；之后用户改变该字段会清除错误（若配置 input 时机会立即重新校验）。

### 事件与网络

- 用户通过控件改变值：更新内部值 → 清除旧错误 → 可选 input 校验 → 调用 `onChange(values, name)`。
- 点击提交或按 Enter 触发表单 submit：`preventDefault()`，只做同步校验和宿主回调；没有 action 属性、网络请求或任何上传。
- `onSubmit(values, event)` 中，程序 `submit()` 的 `event` 为 `null`；按钮/表单提交时传入原生 submit 事件。

### 最小用法

```js
var form = NoteUI.Form.mount(host, {
  fields: [
    { name: 'name', label: '姓名', control: 'text', required: true, defaultValue: '林小雨' },
    { name: 'email', label: '邮箱', control: 'text', required: true,
      validate: function (value) { return /@/.test(value) ? null : '邮箱格式不正确。'; } }
  ],
  onSubmit: function (values, event) { /* 宿主处理；不发网络请求 */ }
});
```

### 限制

- 只支持**同步**校验；没有内置异步校验、远程唯一性检查或提交状态管理。
- 表单根是原生 `<form>`；宿主页面不应再嵌套另一层表单。
- Form 不接管 custom 实例的销毁；custom 的 `onChange` 也不自动桥接，除非其内部原生 input 事件冒泡或宿主主动调用 `update`。Form 会在失焦/提交/取值时读取 custom。
- custom 控件若自身已有可见标签/说明，请在嵌入 Form 时把它的标签置空或改用纯 DOM 控件，避免与 Field 标签重复。
- `update({ values })` 是按键合并，不是整体替换；没有提供的键保留原值。
- 字段 `name` 应唯一；重复名称会在 `getValue()` 中互相覆盖。`values` 中没有对应字段的键不会出现在 `getValue()`。
- 没有全局禁用级联；禁用请逐字段设置。custom 字段的 `disabled` 会尝试调用实例 `update({ disabled: true })` 或禁用其原生控件；复杂 custom 仍需自行完整处理。
- `update({ fields })` 会重建字段并清空已有错误；宿主传入的 custom 节点会被移出 DOM，但其实例销毁仍由宿主负责。
- 校验异常会被显示为“校验无法完成：…”，不会静默通过。

---

<a id="F12"></a>
## F12 NoteUI.DatePicker

日历选择与严格文本输入结合。支持单日、范围、`min/max`、数组或函数禁用日期、清空。日历面板通过 `NoteCore.floating` 打开，支持外点/Esc 关闭、焦点约束与返回。

### 日期格式与时区假定

- 文本格式固定为 **`YYYY-MM-DD`**，不接受 `YYYY-M-D`、斜杠、时间或本地化月份名。
- 只处理**本地日历日期**：由年月日构造本地 `Date` 计算星期/月长度，不使用 `Date.parse('YYYY-MM-DD')`（那会按 UTC 解释），**不做时区换算**。
- 没有时间部分；跨时区用户看到的“日期”仍是其本地日历值。
- `today` 默认取浏览器本地当天；演示或测试可传 `today: '2026-10-27'` 覆盖。
- 周的起始日由 `weekStartsOn` 决定：`1` 周一（默认），`0` 周日。月份/星期标签为中文。

### 选项

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `value` | string \| `{start,end}` | `null` | 单日字符串；范围对象，端点可为 `null` |
| `range` | boolean | `false` | 范围模式 |
| `min` / `max` | string | `''` | 含端点的可选范围；反向时内部交换 |
| `disabledDates` | string[] \| function | `null` | ISO 数组；或 `(iso, localDate) => boolean` |
| `weekStartsOn` | 0 \| 1 | `1` | 周日/周一 |
| `today` | string | 本地今天 | 覆盖“今天” |
| `label` | string | `'日期'` | 可见标签（范围默认仍为“日期”，可自传） |
| `hint` | string | `''` | 附加说明；组件始终显示格式与本地日期假定 |
| `placeholder` | string | `'YYYY-MM-DD'` | 文本占位 |
| `disabled` | boolean | `false` | 禁用输入、按钮与浮层触发 |
| `disabledReason` | string | `''` | 禁用时可见原因 |
| `clearable` | boolean | `true` | 是否显示清空按钮 |
| `error` | string | `''` | 初始外部错误，默认可见；等价于挂载后调用 `setError()` |
| `onChange` | function | `null` | `(string \| {start,end} \| null, event)` |

### 方法

`getValue()`；`setError(msg)`；`getError()`；`open()`；`close()`；`focus()`；`update(patch)`；`destroy()`。

`update()` 支持上述任一选项（以及 `error`）。程序更新不触发 `onChange`。切换 `range` 时会转换当前值：单日转为 `{start: 原值, end: null}`；范围转单日取开始或结束中的可用端点。

### 值形态

- 单日：`'YYYY-MM-DD'` 或 `null`。
- 范围：`{ start, end }`，端点可以暂时为 `null`（部分范围）；两端都有时始终保证 `start <= end`。
- 返回对象是副本。
- 程序加载范围时若起止倒置，会整理为有序范围；文本输入造成的倒置也会整理，并显示“已调整起止顺序…”的可见提示。

### 文本输入与校验

- 输入事件只更新可见文本并清除旧错误；在 **blur 或 Enter** 时严格解析。
- 非法格式、无效公历日期（如 `2026-02-30`）、早于 `min`/晚于 `max`、命中禁用规则：显示可见错误，保留用户文本，但当前值视为 `null`。若此前有有效值，会以 `onChange(null)` 通知。
- 清空文本并失焦：单日值与范围值变为 `null`。
- 范围只填一端：保存部分范围；两端都有效时整理顺序。
- 清空按钮：清除文本、值、错误，关闭日历并聚焦输入。

### 日历选择

- 单日：选中即更新文本/值、关闭面板并返回焦点。
- 范围：
  - 已有开始、缺结束：再点一天完成范围并关闭。
  - 只有结束、缺开始：点一天补上开始，整理顺序并关闭。
  - 两端都有（或都为空）：下一次点击开始一个新范围，先只设置开始并保持打开；关闭后保留部分范围。
- 禁用日期仍可被键盘聚焦以听到“不可选”，但点击不会选中；面板底部常驻显示范围与禁用说明。
- “今天”有 `aria-current="date"`；选中端点/范围内日期有 `aria-selected` 与样式；范围起点/终点有不同样式，但仍同时依赖文字/ARIA，不只靠颜色。

### 键盘

- 输入框：Enter 提交文本；`Alt+ArrowDown` 打开日历；Esc 由浮层关闭。
- 日历网格：Left/Right 一天，Up/Down 一周；Home/End 到本周首/末（按 `weekStartsOn`）；PageUp/PageDown 上/下月；Shift+PageUp/PageDown 上/下年；Enter/Space 选择；Tab 在浮层内循环；Esc 关闭并返回打开前焦点。
- 面板打开时聚焦当前选中日期，否则聚焦今天/当月首日。
- 触发按钮可再次点击关闭；外部指针按下关闭。

### 最小用法

```js
var picker = NoteUI.DatePicker.mount(host, {
  label: '活动日期',
  value: '2026-10-15',
  min: '2026-10-01',
  max: '2026-12-31',
  disabledDates: ['2026-10-20'],
  onChange: function (value) { /* 'YYYY-MM-DD' 或 null */ }
});

NoteUI.DatePicker.mount(host, {
  range: true,
  value: { start: '2026-11-03', end: '2026-11-10' },
  disabledDates: function (iso, date) { return date.getDay() === 0 || date.getDay() === 6; }
});
```

### 限制

- 固定中文界面与 ISO 文本格式；没有本地化、年/月下拉选择器或时间选择。
- 日期网格只渲染当前月份的日子，不含相邻月日期；跨月通过方向键、翻月按钮或 PageUp/PageDown。
- 禁用日期没有逐日原因文案；只能提供整体说明/函数规则。
- 函数型 `disabledDates` 抛错时组件不让日历崩溃，该日期按“未禁用”处理。
- 部分范围是合法的中间状态；需要完整范围时请由宿主校验。
- 程序更新 `min/max/disabledDates` 不会自动改写或重新标记已有值；新规则若使旧值无效，请同时传 `value` 或由宿主校验。
- 年份支持 `0001`–`9999`；超出会被限制。
- `getValue()` 不返回 `Date` 对象，也不做时区转换。

---

<a id="F13"></a>
## F13 NoteUI.TimePicker

本地时:分（可选秒）输入与下拉选择。支持步长、`min/max`、清空。面板使用 `NoteCore.floating`，内部为三个原生 `<select>`（时、分、秒），键盘导航由浏览器原生 select 行为提供。

### 时间格式与时区假定

- `seconds: false`：值格式固定 **`HH:mm`**；`seconds: true`：固定 **`HH:mm:ss`**。
- 只处理本地钟表时间，不含日期，不做时区换算、不推断 UTC 偏移。
- `min/max` 含端点。无秒模式使用 `HH:mm`；含秒模式使用 `HH:mm:ss`。兼容的宽松输入（如含秒模式写 `HH:mm`）会按 `:00` 规范化；无秒模式带非零秒的边界会被忽略。
- 严格文本解析：两位小时/分钟（含秒模式下两位秒），小时 00–23、分钟/秒 00–59；`24:00` 无效。

### 选项

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `value` | string | `null` | 按模式为 `HH:mm` / `HH:mm:ss` |
| `seconds` | boolean | `false` | 显示并解析秒 |
| `step` | number | 无秒 15；含秒 30 | 无秒时按**分钟**；含秒时按**秒**；夹在 1–60 |
| `min` / `max` | string | `''` | 含端点范围 |
| `label` | string | `'时间'` | 可见标签 |
| `hint` | string | `''` | 附加说明 |
| `disabled` | boolean | `false` | 禁用 |
| `disabledReason` | string | `''` | 可见禁用原因 |
| `clearable` | boolean | `true` | 清空按钮与空文本语义 |
| `error` | string | `''` | 初始外部错误，默认可见；等价于挂载后调用 `setError()` |
| `onChange` | function | `null` | `(string \| null, event)` |

### 方法

`getValue()`；`setError(msg)`；`getError()`；`open()`；`close()`；`focus()`；`update(patch)`；`destroy()`。`update()` 支持上述任一选项（以及 `error`）；程序更新不触发 `onChange`。

### 步长语义

- `seconds: false`：分钟选项及文本校验只允许 `0, step, 2*step, … < 60`。例如 `step: 15` 允许 00/15/30/45 分。
- `seconds: true`：分钟可 00–59；秒选项及校验只允许 `0, step, 2*step, … < 60`。例如 `step: 30` 允许 :00/:30 秒。
- 这是组件明确选择的单位语义；宿主应按当前精度传对应数值。

### 文本输入

- 输入时清除旧错误；blur/Enter 严格解析。
- 非法格式、超出 `min/max`、不符合步长：显示可见错误，保留文本，当前值为 `null`。若此前有值，触发 `onChange(null)`。
- 空文本：`clearable: true` 时为 `null`；`clearable: false` 显示“时间不能为空”错误，不提交空值。
- 有效文本会补零并提交；Enter 只提交文本，`Alt+ArrowDown` 打开面板。
- 清空按钮清空文本/值/错误并聚焦输入。

### 下拉面板

- 打开时的草稿来自当前有效值；没有有效值（或当前值不满足步长/边界）时，取**当前本地时间**并选择距它最近的合法组合（分钟/秒按步长吸附，且夹在 `min/max` 内）。
- 时/分/秒三个原生 select；选项越界时禁用。无秒模式隐藏“秒”列。
- 任一部分改变后立即组合：组合有效则提交并触发 `onChange`；组合仍越界（边界小时/分钟）时在面板内显示可见错误，不提交，也不静默修正。
- “完成”关闭面板并返回焦点；Esc/外点关闭；关闭时未提交的无效草稿不会覆盖最后一个有效值。
- 面板常驻显示本地时间说明、允许范围与步长。

### 最小用法

```js
var time = NoteUI.TimePicker.mount(host, {
  label: '提醒时间',
  value: '09:30:00',
  seconds: true,
  step: 30,
  min: '08:00:00',
  max: '18:00:00',
  onChange: function (value) { /* 'HH:mm:ss' 或 null */ }
});
```

### 限制

- 不含日期或跨日逻辑；`23:59` 与 `00:00` 之间没有环绕范围。
- 面板使用原生 select，而不是自绘 listbox；样式与展开行为受浏览器影响。
- 中间组合可能暂时越界，组件会显示错误而不是自动调整其它单位。
- 打开空值或无效值时，以当前本地时钟为草稿起点，而不是 00:00。
- 程序更新 `step`/`min`/`max` 不会重新校验当前值；需要时请同时传 `value`。
- `update({ seconds: true/false })` 会按新精度改写当前值（关闭秒时丢弃秒），并重建面板；需要保留旧值时请同时传 `value`。

---

<a id="F14"></a>
## F14 NoteUI.ColorPicker

色板、系统拾色器与文本值组合。格式与透明度策略明确，非法输入可见错误。

### 支持的颜色格式

- 输入支持 **`#rgb`** 与 **`#rrggbb`**，大小写不敏感，前后空白会去掉。
- 输出统一为小写 **`#rrggbb`**；`#abc` 展开为 `#aabbcc`。
- **不支持透明度/alpha**：`#rgba`、`#rrggbbaa`、`rgba(...)` 均无效。
- 不支持颜色名、`rgb()`、`hsl()`、`color()` 或 4/6 位以外的十六进制写法。
- 原生 `input[type=color]` 提供可靠系统拾色器；不同浏览器 UI 不同，但其返回值会被再次规范化为 `#rrggbb`。

### 选项

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `value` | string | `null` | 初始颜色 |
| `palette` | string[] | 16 色默认板 | 传 `[]` 隐藏色板；无效项会被过滤 |
| `label` | string | `'颜色'` | 可见标签 |
| `hint` | string | `''` | 附加说明；组件始终显示格式/透明度策略 |
| `disabled` | boolean | `false` | 禁用 |
| `disabledReason` | string | `''` | 可见禁用原因 |
| `clearable` | boolean | `true` | 清空按钮 |
| `error` | string | `''` | 初始外部错误，默认可见；等价于挂载后调用 `setError()` |
| `onChange` | function | `null` | `(#rrggbb \| null, event)` |

### 方法

`getValue()`；`setError(msg)`；`getError()`；`focus()`；`update(patch)`；`destroy()`。

`update()` 支持 `value`、`palette`、`label`、`hint`、`disabled`、`disabledReason`、`clearable`、`error`、`onChange`。程序更新不触发 `onChange`。

### 交互与有效性

- 文本输入为空：清空值（若之前有值则触发 `onChange(null)`）。
- 输入有效颜色：立即提交规范化值并更新原生拾色器/色板选中状态；输入框文本在 blur 时才改写为规范形。
- 输入非法文本：错误立即可见，`getValue()` 返回 `null`（不会把旧值冒充当前有效值）；若之前有值，blur 时触发 `onChange(null)`。
- 色板按钮与原生拾色器改变：立即提交并触发 `onChange`。
- 选中色板有 `aria-pressed="true"` 与可见勾选，不只靠颜色/边框表达。
- 外部 `setError` 与内部格式错误共享可见错误区。
- 当前有效值与“未选择”分别在可见读数中表达；预览块对“未选择”使用棋盘格图案。

### 最小用法

```js
var color = NoteUI.ColorPicker.mount(host, {
  label: '强调色',
  value: '#315cda',
  palette: ['#315cda', '#b23a45', '#15803d', '#ffffff'],
  onChange: function (value) { /* '#rrggbb' 或 null */ }
});
```

### 限制

- 无透明度支持，也不提供 alpha 滑杆；需要半透明主题时请在宿主层另行处理，不要期望本组件保存 alpha。
- 色板为宿主配置的静态十六进制列表，不做调色/渐变生成。
- 文档化输入仅两种十六进制形式；没有颜色名称或 `rgb()` 解析。
- 原生拾色器的可达性/外观取决于浏览器。

---

<a id="F15"></a>
## F15 NoteUI.FileInput

在浏览器内选择或拖入本地文件，展示文件清单、限制与拒绝原因，可逐个移除或全部清除。

> **不上传。** 组件只持有 `File` 对象并调用宿主 `onChange`；没有网络请求、没有伪造上传进度、没有服务端状态。界面也常驻显示“仅在浏览器内选择，不会上传到服务器”。

### 选项

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `files` | File[] | `[]` | 初始清单（程序更新也接受） |
| `multiple` | boolean | `false` | 多选/追加 |
| `accept` | string | `''` | 原生 accept 语法：`.txt`、`image/*`、精确 MIME，逗号分隔 |
| `maxSize` | number | `null` | 单文件字节上限；非正数视为不限制 |
| `maxFiles` | number | `null` | 新增文件总数上限；非正数视为不限制 |
| `label` | string | `'文件'` | 可见标签 |
| `hint` | string | `''` | 附加说明 |
| `disabled` | boolean | `false` | 禁用选择、拖放、删除 |
| `disabledReason` | string | `''` | 可见禁用原因 |
| `onChange` | function | `null` | `(File[], event)`，仅用户选择/移除触发 |

### 方法

- `getValue()`：返回 `File[]` 副本。
- `clear(event?)`：清空清单与错误。**只有传了 event（来自用户操作）且原本有文件时才触发 `onChange`**；程序清空应使用 `update({ files: [] })`，它不会触发事件。
- `focus()`；`update(patch)`；`destroy()`。`update` 接受 `files`、`multiple`、`accept`、`maxSize`、`maxFiles`、`disabled`、`label`、`hint`、`disabledReason`、`onChange`；其中 `files` 直接替换清单，不校验、不触发 `onChange`。

### 选择、拖放与校验

- 可见的“选择文件”按钮既是原生 input 的触发器，也是拖放区和键盘入口（Enter/Space）。原生 input 隐藏且不可 Tab 聚焦。
- 每次选择/拖入后重置原生 input 的 `value`，因此再次选择同一文件可以再次触发；同一文件可以重复加入（多选模式），不做去重。
- 多选模式追加到现有清单，直到 `maxFiles`；单选模式用新有效文件替换旧文件。拖入多个文件时单选模式只接受第一个，其余列入拒绝原因。
- 逐个校验：类型、大小、数量、单选额外文件。失败原因带文件名显示在可见错误列表；部分成功时合法文件仍加入，非法文件不加入。拒绝不会清除原清单；单选模式下一次选择/拖入全部被拒绝时只更新拒绝原因，原清单与 `onChange` 都保持不变。
- `accept` 同时用于浏览器选择框过滤与拖入文件的组件内置校验；扩展名按文件名，`type/*`/精确 MIME 按浏览器提供的 `file.type`。
- 文件清单展示名称、大小、类型；删除按钮有“移除 <文件名>”可访问名称。删除后焦点移到原位置的下一个删除按钮；若删除的是最后一项，则移到新的最后一项删除按钮；清单为空时移到选择按钮。
- 拖入计数在 `dragenter/dragleave` 间保持高亮，离开整个拖区后复位；`drop` 或禁用时也会复位。禁用状态下仍阻止浏览器导航式打开文件，但不会添加。
- 内建“全部清除”按钮是用户操作，会触发 `onChange([])`。
- `update({ files })` 程序替换清单，不校验、不触发 `onChange`；修改 `accept/multiple/maxFiles/maxSize` 不会追溯删除或重新校验已有文件，新规则只影响后续选择。

### 最小用法

```js
var files = NoteUI.FileInput.mount(host, {
  label: '附件',
  multiple: true,
  accept: '.txt,.md,image/*',
  maxSize: 1024 * 1024,
  maxFiles: 5,
  onChange: function (fileArray, event) { /* 只在浏览器内处理 File[] */ }
});
```

### 限制

- `accept` 是筛选提示，不是安全边界；浏览器可能给出空 `file.type`。本组件不做文件内容嗅探。
- 没有上传、进度、取消、重试或服务端响应；这些必须由宿主实现。
- `File` 对象不能从字符串、路径或 JSON 还原；刷新后清单丢失。
- 不支持目录选择、粘贴文件或文件系统目录 API。
- 已有文件的 `File` 对象会一直保留在内存中，直到移除/清空/销毁。

---

## 共同键盘与可访问性

- 所有可聚焦控件有 `:focus-visible` 焦点环，使用 `--hnv-color-focus` 与 3px 环宽。
- 标签、格式说明、错误和禁用原因默认可见；不使用 `title` 充当唯一说明。
- 状态不只靠颜色：Switch 有开/关文字，Slider 有数值读数，日期有 `aria-selected`/`aria-current` 与“已选/范围内/不可选”标签，色板有勾选与 `aria-pressed`，文件错误有文字原因。
- 日期/时间面板使用 `NoteCore.floating`：单一浮层层级、Tab 焦点约束、外点/Esc 关闭、关闭返回触发点；销毁组件会关闭并移除浮层。
- 窄容器：控件行使用 `flex-wrap`、`min-width: 0` 与可换行文本；日历面板限制在视口内并可滚动。
- 减少动效：Switch 滑块与轨道过渡被移除；其余组件没有依赖动画表达状态。

## 已知未验证项与限制

- 当前只在 Chromium/Edge 与 `file://` 普通脚本环境验证；未逐一验证 Firefox/Safari 的原生 picker、语音控制或高对比模式。
- 日期/时间面板为中文固定文案；没有 i18n。
- 所有组件默认 `userReview: not-reviewed`：技术实现与用户审美/偏好评价分开记录。
- 没有暗色主题切换；颜色全部来自 `--hnv-*` tokens，宿主可覆盖。
- 不提供异步校验、远程数据、上传或持久化。

## 自检记录

- `node --check`：`src/ui/forms-advanced-internal.js`、`src/ui/forms-advanced.js`、`src/ui/forms-advanced-pickers.js`、`src/ui/forms-advanced-inputs.js`、`gallery/demos/ui-forms-advanced.js`。
- Playwright + Edge：从 src 按 manifest 顺序直接加载 4 个脚本，运行核心 smoke、deep、narrow 与 gallery demo 检查，并补充分拆回归（Switch 提示文字误触、Form `field.custom` 识别 / `values` 副本 / disabledReason 去重 / custom 禁用恢复、FileInput 单选全拒绝保留清单、DatePicker 范围提示去重与日历网格结构、TimePicker 选择提交与焦点返回）；均无控制台错误、无浮层残留。gallery demo 通过 `gallery/demos/ui-forms-advanced.js` 真实挂载。
- 具体命令与结果见交付报告；技术自检不等于用户评价。

## 用户评价范围

F09–F15 均为候选组件（`userReview: not-reviewed`），未获用户评价。技术实现、演示可用性通过不等于审美或偏好确认；本模块不应被标记为“已确认资产”。
