# 通用库扩展（ui-extended）

范围：X01–X07，头像与对象缩略图、内容轮播、评分选择、级联选择、树形选择、穿梭选择与命令面板。它们是通用 UI 组件，数据和命令来自宿主配置或本地数组；不包含账号系统、评价业务、远程搜索、后端或课程播放器。

## 1. 源码、依赖与加载

| 项目 | 位置 |
| --- | --- |
| 内部共享 helpers | `src/ui/extended-shared.js`（`window.NoteUIInternals.extended`，**内部使用，不是公开 API**） |
| X01 Avatar / X02 Carousel / X03 Rating | `src/ui/extended.js` |
| X04 Cascader / X05 TreeSelect / X06 TransferList | `src/ui/extended-select.js` |
| X07 CommandPalette | `src/ui/extended-command.js` |
| 样式 | `src/ui/extended.css` |
| 条目元数据 | `src/manifests/ui-extended.json` |
| gallery 演示 | `gallery/demos/ui-extended.js` |

`src/manifests/ui-extended.json` 的 `js` 数组声明加载顺序；直接按源文件加载时必须先 shared，再 extended、extended-select、extended-command。构建后的 `dist/modules/ui-extended.js` 已按顺序拼接。

依赖：所有项依赖 `core`（`NoteCore` DOM/生命周期、`NoteCore.floating`、core tokens）。**X05 TreeSelect 额外依赖 `ui-navigation`**，必须已加载 `NoteUI.TreeView`；未加载时 `mount` 抛出明确错误：

```text
NoteUI.TreeSelect 需要先加载 ui-navigation（NoteUI.TreeView）；加载顺序应为 core → ui-navigation → ui-extended，或直接使用整库/模块依赖顺序。
```

`ui-extended` 模块在 manifest 中声明依赖 `core + ui-navigation`，条目 X05 也单列该依赖。推荐顺序：core（含 icons/motion/floating）→ ui-navigation → extended；CSS 在 core tokens/base 后加载 navigation.css 与 extended.css。三个浮层组件（Cascader、TreeSelect、CommandPalette）只复用 `NoteCore.floating`，不创建自己的 body 层；Esc、外点、焦点恢复、滚动锁定和层级统一由该基础处理。

每个组件以 IIFE、普通 `<script>` 交付，可 `file://` 运行；不使用 fetch、远程资源、eval 或未净化 `innerHTML`。

## 2. 共用约定

```js
var inst = NoteUI.Some.mount(host, options);
inst.el;          // 根元素
inst.update({});  // 程序更新；不触发 onChange
inst.destroy();   // 幂等；移除根元素并清理浮层/计时器/监听
```

- 字符串内容按纯文本；只有明确接受 DOM 的字段才会移入节点（移动而不是克隆）。
- `update()` 不触发用户事件；清空、键盘、点击、移动等真实用户动作才触发各自回调。
- CSS 根前缀为 `.nui-*`，只读取 `--hnv-*` 候选 tokens；不新增主题或 `:root` 变量。
- 需要说明的禁用状态使用原生 `disabled`/`aria-disabled` 加可见文字或标记，不只降低透明度。
- `destroy()` 会关闭并销毁组件自己创建的浮层、计时器、观察器和全局监听。

<a id="X01"></a>

## 3. X01 NoteUI.Avatar

图片头像或文字回退，支持组排列、尺寸/形状/色调和 `+N`。不绑定账户系统。

### API

| 项目 | 内容 |
| --- | --- |
| mount | `NoteUI.Avatar.mount(host, options) -> { el, update, destroy }` |
| 单头像 options | `src`、`alt`、`name`、`label`、`initials`、`size`（`sm/md/lg/xl` 或数字 24–128）、`shape`（`circle/rounded/square`）、`tone`（`neutral/accent/sky/sage/amber/rose`）、`caption`、`decorative` |
| 组 options | `items`（或 `group: true` + `items`）、`max`（默认 4）、`groupLabel`；`size/shape/tone` 为组内默认值 |
| 组项字段 | `src`、`alt`、`name`、`label`、`initials`、`tone`、`decorative` |
| 用户事件 | 无 `onChange`；失败图片的 error 只更新回退显示 |
| 实例方法 | `update(patch)`、`destroy()`；无值型 `getValue()` |

- `alt` 显式提供时（包括空字符串）优先作为图片替代文本；未提供时依次使用 `name`、`label`。`decorative: true` 表示不提供可访问名称。
- 未提供 `initials` 时，从 `label`/`name` 派生最多两个字符；无名称时显示 `?`。
- `caption` 用于单头像：`true` 使用名称，字符串使用给定文本。组项不显示 caption。长 caption 用 CSS 省略，完整名称仍在图片 `alt` 或文字回退的 `role="img"` 名称中。
- `max` 是实际显示的头像数，超出项另加一个 `+N` 槽；例如 5 项、`max:3` 显示 3 个头像和 `+2`。组根 `aria-label` 同时说明总数与隐藏数。
- 图片加载失败时移除 `<img>`，显示文字回退；回退框获得 `role="img"` 与完整 `aria-label`。图片加载成功时文字回退不进入辅助技术名称。
- 色彩 tone 仅作视觉区分，不表达账号或状态；不请求远程图片、不缓存或代理图片；不提供“已上传/在线”等身份状态。

### 键盘、可访问性与限制

- 头像是非交互展示对象，没有键盘操作、成员菜单、账户链接或删除动作。
- 组根是 `role="group"`；每个图片的 `alt` 或文字回退的 `aria-label` 承载完整名称。
- 不把 `title` 当作唯一说明。需要交互时由宿主在头像旁提供真实按钮或链接。

```js
var avatar = NoteUI.Avatar.mount(host, {
  src: 'avatar.png', alt: 'Ada Lovelace', name: 'Ada Lovelace',
  caption: true, size: 'lg', tone: 'accent'
});
var group = NoteUI.Avatar.mount(host, {
  groupLabel: '协作成员', max: 3,
  items: [{ name: 'Ada' }, { name: 'Grace' }, { name: 'Alan' }, { name: 'Katherine' }]
});
avatar.update({ src: '', name: 'Ada Lovelace', initials: 'AL' }); // 无事件
```

<a id="X02"></a>

## 4. X02 NoteUI.Carousel

默认手动的内容轮播。显示当前页和总页数；非当前页不可聚焦。默认不自动播放。

### API

| 项目 | 内容 |
| --- | --- |
| mount | `NoteUI.Carousel.mount(host, options) -> { el, getValue(), update, destroy }` |
| options | `items`、`index`、`label`、`auto`（默认 `false`）、`interval`（默认 6000，最小 1000ms）、`loop`（默认 `true`）、`onChange(index, event)` |
| items | `{ id?, label?, content }`；`content` 可为字符串、DOM 节点或节点数组；也可直接传字符串项 |
| 用户事件 | `onChange(index, event)`；手动按钮、圆点、键盘和自动推进均可能触发；自动推进的 `event` 为 `null` |
| 实例方法 | `getValue()` 返回当前索引；`update(patch)`、`destroy()` |

- 非当前页同时设置 `aria-hidden="true"` 与 `inert`，并用 `display:none` 隐藏；其内容不会进入 Tab 顺序。
- 当前页、上一张/下一张、圆点和可见计数 `当前 / 总数` 一起表达位置。圆点按钮使用 `aria-current`。
- `label` 作为轮播区域名称；每页有 `aria-roledescription="幻灯片"` 和“第 N 张，共 N 张”的可访问标签。页面切换写入 polite live region。
- 程序 `update()` 不触发 `onChange`。
- `auto` 只在显式开启时工作；悬停、焦点位于轮播内、页面隐藏或 `prefers-reduced-motion: reduce` 时暂停。减少动效时自动播放按钮禁用并显示可读文本。
- `loop:false` 时到边界禁用对应按钮，并停止自动推进。

### 键盘

- 轮播区域可聚焦；`←`/`ArrowLeft` 上一张，`→`/`ArrowRight` 下一张，`Home` 第一张，`End` 最后一张。
- 键盘事件可来自区域本身、控件或当前页普通内容；输入框、文本域、选择框和可编辑元素内的方向键不被抢占。
- Tab 在常规顺序中只会停留在当前页内容和外部控件；隐藏页不可聚焦。

### 限制

- 不提供服务端拉取、图片加载器或课程串联；内容由宿主给。
- 轮播切换不自动把焦点移到新页业务控件；如果旧焦点在当前页内容内，切换后焦点回到轮播区域。
- 没有触摸滑动/拖拽手势，也没有虚拟化；大量长内容应自行使用局部滚动。

```js
var carousel = NoteUI.Carousel.mount(host, {
  label: '示例内容', auto: false,
  items: [
    { label: '第一页', content: '内容一' },
    { label: '第二页', content: contentNode }
  ],
  onChange: function (index, event) { /* index 从 0 开始；自动推进时 event 为 null */ }
});
carousel.update({ items: nextItems, index: 0 }); // 无 onChange
```

<a id="X03"></a>

## 5. X03 NoteUI.Rating

整数星值输入，使用 slider 语义。支持只读、禁用、点击当前值清空和键盘；不内置评价对象或业务。

### API

| 项目 | 内容 |
| --- | --- |
| mount | `NoteUI.Rating.mount(host, options) -> { el, getValue(), update, destroy }` |
| options | `value`（默认 0）、`max`（默认 5，夹紧 1–10）、`readonly`、`disabled`、`allowClear`（默认 `true`）、`label`、`onChange(value, event)` |
| 用户事件 | `onChange(value, event)`，来自点击星星或键盘 |
| 实例方法 | `getValue()`、`update(patch)`、`destroy()` |

- 根是 `role="slider"`，暴露 `aria-valuemin=0`、`aria-valuemax`、`aria-valuenow`、`aria-valuetext` 和可选 `aria-readonly`。
- 点击第 N 颗星设值为 N；`allowClear` 为 true 且再次点击当前值，归零。默认值 0 表示未评分。
- `readonly` 实例仍可按 Tab 聚焦并读出值，但点击和键盘不修改；`disabled` 实例退出 Tab 顺序。
- 星星同时使用实心/空心字形和可见 `N / max` 数字，不只靠颜色。
- 程序 `update()` 不触发 `onChange`。组件不保存评价历史、不关联对象、不发送任何请求。

### 键盘

- `←`/`↓` 减 1，`→`/`↑` 加 1；`Home` 到 0，`End` 到最大值。
- `Delete`/`Backspace` 在 `allowClear` 为 true 时归零。
- 方向键范围夹紧在 0–max；只读/禁用时全部忽略。

### 限制

- 值是整数；不支持半星、细分精度、评分理由或评论。
- `allowClear` 控制“再次点击当前值归零”，不改变 `Home` 可到最小值 0 的键盘模型。需要总是至少 1 星的宿主应在保存时自行校验。
- `max` 上限为 10，避免无限拉宽控制。
- 本组件只提供数值输入；不生成评分教学、预测、排行榜或评价业务。

```js
var rating = NoteUI.Rating.mount(host, { value: 3, max: 5, allowClear: true, label: '评分',
  onChange: function (value, event) {} });
var readonly = NoteUI.Rating.mount(host, { value: 4, readonly: true, label: '只读评分' });
rating.update({ value: 2 }); // 无 onChange
```

<a id="X04"></a>

## 6. X04 NoteUI.Cascader

本地层级数据的级联选择。逐列浏览路径，禁用节点不可选，支持清空；浮层通过 `NoteCore.floating` 定位并恢复焦点。

### API

| 项目 | 内容 |
| --- | --- |
| mount | `NoteUI.Cascader.mount(host, options) -> { el, getValue(), update, destroy }` |
| options | `options`（节点数组）、`value`（值数组）、`placeholder`、`clearable`（默认 true）、`disabled`、`separator`（默认 `' / '`）、`label`、`onChange(values, pathNodes, event)` |
| 节点 | `{ value, label, children, disabled }`；`children` 为空数组视为叶子；value 建议在同级唯一 |
| 用户事件 | `onChange(values, pathNodes, event)`；只在选择叶子或清空时触发 |
| 实例方法 | `getValue()` 返回路径值副本；`update(patch)`、`destroy()` |

- 触发区显示路径摘要；弹层顶部也显示当前浏览路径。未选时显示 `placeholder`。
- 点击或 Enter 有子节点的项只展开下一列；叶子才提交路径。禁用节点可被键盘发现（`aria-disabled`/可见“不可选”），但不可展开或选择。
- `clearable` 为 true 且已有路径时显示清空按钮。清空触发 `onChange([], [], event)`。
- `value` 是原始值数组；无法解析的路径会被截断。`pathNodes` 是宿主传入的原始节点对象。
- 程序 `update()` 不触发 `onChange`。打开期间更新选项/值会重建当前列显示；浮层仍由 floating 管理。

### 键盘与浮层

- 触发按钮：原生 Enter/Space 打开；`↓`/`↑` 也可打开。
- 面板内：`↑`/`↓` 在当前列移动，`Home`/`End` 到列首/列尾，`←` 到上一列（存在时），`→`/`Enter`/Space 展开有子节点的项或提交叶子，`Esc` 关闭。
- 弹层为 `role="dialog"`，`trapFocus` 开启；Esc、外点关闭后焦点返回触发按钮。
- 列宽窄时在面板内横向滚动；弹层位置按视口避让，页面本身不产生横向溢出。

### 限制

- 只接受本地数组；不实现异步树加载、远程搜索、懒加载、多选或任意节点选择模式。
- 只支持叶子提交；需要“父节点可选”语义的宿主应改数据或另建组合。
- 没有类型搜索/输入过滤；路径值需要宿主保证唯一性和可序列化性。

```js
var cascader = NoteUI.Cascader.mount(host, {
  options: [{ value: 'tech', label: '技术', children: [
    { value: 'css', label: 'CSS' },
    { value: 'old', label: '旧版', disabled: true }
  ] }],
  value: ['tech', 'css'], placeholder: '选择分类',
  onChange: function (values, nodes, event) {}
});
cascader.update({ value: ['tech'] }); // 无 onChange
cascader.getValue();                  // ['tech']
```

<a id="X05"></a>

## 7. X05 NoteUI.TreeSelect

组合“选择触发区 + 真实树浮层”的单选/多选控件。**树内核直接复用 `NoteUI.TreeView`（N07）**，不复制展开、键盘或 roving tabindex 实现。

### 依赖

- 必须加载 `core` 与 `ui-navigation`（`NoteUI.TreeView`）；未加载时 `mount` 抛出包含加载顺序的明确错误（见第 1 节）。
- manifest 的模块依赖包含 `ui-navigation`；X05 条目也单列该依赖。

### API

| 项目 | 内容 |
| --- | --- |
| mount | `NoteUI.TreeSelect.mount(host, options) -> { el, getValue(), update, destroy }` |
| options | `nodes`、`value`、`multi`、`expanded`、`placeholder`、`clearable`（默认 true）、`disabled`、`label`、`emptyText`、`onChange(value, selectedNodes, event)` |
| value 形状 | 单选取值或 `null`；多选值数组 |
| 实例方法 | `getValue()`（单选 scalar/null，多选数组）、`update(patch)`、`destroy()` |
| 用户事件 | `onChange(value, selectedNodes, event)`；清空也触发 |

- 触发区显示选中摘要；多选显示已选数量。长摘要用 CSS 省略，按钮可访问名称保留完整文本。
- 多选切换后浮层保持打开，方便连续选择；单选选择成功后自动关闭。
- `clearable` 时显示清空按钮，清空触发 `onChange` 并更新摘要。
- TreeView 的节点层 `onSelect` 驱动真值；`selectedNodes` 是按当前选择顺序映射到的宿主原始节点。
- 程序 `update()` 不触发 `onChange`。更新 `value/expanded/label` 会同步到正在使用的 TreeView（保留读者在弹层里展开的节点）；只有 `nodes/multi` 这类结构性字段会关闭已打开面板并在下次打开时重建 TreeView。

### 键盘与浮层

- 触发按钮：Enter/Space 打开；`↓`/`↑` 也可打开。
- 树内导航沿用 N07：`↑`/`↓`、Home/End、`←`/`→` 展开收起、Enter/Space 选择；禁用节点保留可发现但不可选。
- 浮层为 `role="dialog"`，使用 `trapFocus`。外点或 Esc 关闭后焦点返回触发按钮；弹层不创建额外 body 层。
- 空树显示 `emptyText`；没有节点时不挂载 TreeView。

### 限制

- 节点 id 在树内必须唯一；没有异步子节点加载、拖拽排序、节点搜索或创建节点。
- 多选的全部选择状态由 TreeView 的真值负责；TreeSelect 不增加级联选择/父子联动功能。
- 关闭面板不改变已选值；面板重开保留展开状态，结构性 `update` 导致重建时从宿主传入的 `expanded` 重新开始。

```js
var treeSelect = NoteUI.TreeSelect.mount(host, {
  nodes: [{ id: 'tech', label: '技术', children: [
    { id: 'css', label: 'CSS' }, { id: 'html', label: 'HTML' }
  ] }],
  expanded: ['tech'], multi: true, value: ['css'], label: '内容标签',
  onChange: function (value, selectedNodes, event) {}
});
treeSelect.getValue(); // ['css']
treeSelect.update({ value: ['html'] }); // 无 onChange
```

<a id="X06"></a>

## 8. X06 NoteUI.TransferList

两侧候选/已选的本地穿梭选择控件，支持独立筛选、单条与整体禁用。

**与 `NoteViz.Transfer` 的区别：** TransferList 是带复选框、筛选、移动按钮和值回调的选择控件；`NoteViz.Transfer` 是图形模块中的对象传递演示，用于表现起点、终点、路径和归属变化的视觉过程。本组件不实现、不包装也不伪装对象传递动画。

### API

| 项目 | 内容 |
| --- | --- |
| mount | `NoteUI.TransferList.mount(host, options) -> { el, getValue(), update, destroy }` |
| options | `source`、`target`（条目数组）、`titles`（`{source,target}` 或数组）、`filterable`（默认 true）、`disabled`、`label`、`onChange(targetValues, movedValues, event)` |
| 条目 | `{ value, label, disabled }`；也可传字符串/数字 |
| 实例方法 | `getValue()` 返回目标列原始值数组；`update(patch)`、`destroy()` |
| 用户事件 | `onChange(targetValues, movedValues, event)`；第二参数为本次移动的原始值数组 |

- 两侧筛选状态互相独立；筛选改变显示集合，但不会取消已勾选值。
- 移动会把来源侧所有已勾选且未禁用条目追加到目标侧，并从来源移除；来源筛选不限制真正移动的集合。按钮可见数字和无障碍名称会说明待移动数量。
- 单条禁用使用原生 disabled，旁边有可见“不可移动”标记；整体禁用同时禁用筛选、勾选和移动。
- 空列表与筛选无结果有不同可见文字。
- 程序 `update()` 不触发 `onChange`；选择的回调只来自用户移动。更新数据时会按 value 保留仍然存在的勾选，被移除或变为禁用的条目会自动取消勾选。

### 键盘与窄容器

- 原生复选框可用 Space 勾选；筛选输入和移动按钮按正常 Tab 顺序操作。移动按钮的 `aria-label` 包含数量和方向。
- 组件使用容器查询：宽度不足时，来源、操作区、目标改为纵向顺序，按钮换行但仍可读。
- 列表在限定高度内局部滚动；页面不会被列表强行撑高。

### 限制

- 不做拖放、全选/反选、远程分页、搜索服务或服务端同步。
- 条目 value 建议在两侧内唯一；组件不做跨端去重或业务标识推断。
- `targetValues` 是目标列当前值的顺序数组；`movedValues` 只包含本次移动的原始值。
- 传入 DOM 标签不作为结构模板；组件按宿主数据渲染纯文本标签。

```js
var transfer = NoteUI.TransferList.mount(host, {
  source: [{ value: 'a', label: '候选 A' }, { value: 'b', label: '候选 B', disabled: true }],
  target: [{ value: 'c', label: '已选 C' }],
  titles: { source: '候选', target: '已选' }, filterable: true,
  onChange: function (targetValues, movedValues, event) {}
});
transfer.getValue(); // ['c']
transfer.update({ source: otherSource, target: otherTarget }); // 无 onChange
```

<a id="X07"></a>

## 9. X07 NoteUI.CommandPalette

本地命令过滤与执行面板。只在本地 `commands` 数组中按 label/group/keywords 过滤；不建设全站搜索、不请求远程、不做后端命令中心。

### API

| 项目 | 内容 |
| --- | --- |
| mount | `NoteUI.CommandPalette.mount(host, options) -> { el, open(), close(), isOpen(), update, destroy }` |
| options | `commands`、`hotkey`（默认 `null`/关闭）、`label`、`placeholder`、`emptyText` |
| command | `{ id, label, group, keywords, shortcut, disabled, run }` |
| 用户事件 | 执行命令时调用 `command.run(command, event)`；没有独立 onChange |
| 实例方法 | `open()`、`close(reason?)`、`isOpen()`、`update(patch)`、`destroy()` |

- `mount` 不生成常驻触发按钮，根元素为空壳；宿主使用 `open()`/`close()` 或显式 hotkey 打开。示例按钮由宿主或 gallery demo 提供。
- 过滤对空格分隔的多个词做本地 AND 匹配，匹配字段为 label、group、keywords；不解析查询语法、不请求远程索引。
- 结果按命令首次出现的分组顺序显示；分组标题可见。无结果时显示 `emptyText`，列表无选项。
- `disabled` 命令保留可见提示“不可用”，不参与键盘高亮，也不可执行。
- 打开时清理搜索词并聚焦输入；面板使用 `NoteCore.floating` 的 `modal`、`backdrop`、`trapFocus`、`lockScroll`、Esc/外点和焦点恢复。
- 执行可用命令时先关闭面板，再调用 `run(command, event)`；命令异常或返回值由宿主处理。`update()` 不执行任何命令，也不触发回调。
- `shortcut` 只显示文本，不自动注册每个命令的全局快捷键。

### 键盘与 hotkey

- 输入过滤时保持焦点在搜索框；`↑`/`↓` 循环高亮可用命令，`Home`/`End` 到首/尾，`Enter` 执行当前高亮，`Esc` 关闭并恢复触发前焦点。
- Tab 在 `trapFocus` 内循环；没有命令或只剩禁用命令时 Enter 不执行内容。
- 全局 `hotkey` 默认关闭，只有显式配置才启用。例：`hotkey: 'Alt+K'`、`'Ctrl+Shift+P'`、`'Mod+K'`（Windows 上匹配 Ctrl 或 Meta）或 `{ key: 'k', ctrl: true }`。
- 快捷键按修饰键精确匹配；无修饰键的快捷键不会在输入框/文本域/可编辑元素中抢占输入。`hotkey` 不注册 `command.shortcut`。
- 若同一页面多个面板声明相同 hotkey，不提供冲突仲裁；宿主需避免重复绑定的全局快捷键。

### 限制

- 只做本地命令过滤；不提供远程全文检索、索引服务、协作或后端命令。
- 不生成命令的常驻界面，不管理命令状态或权限；`disabled` 由宿主提供。
- `run` 的异常不会被吞掉；面板已关闭后异常仍会冒泡到宿主事件循环。
- 搜索词只在打开期间存在；下一次 `open()` 重新清空。没有多步命令、参数表单或任意用户代码执行。

```js
var palette = NoteUI.CommandPalette.mount(host, {
  label: '本地命令', hotkey: 'Alt+K',
  commands: [
    { id: 'focus', label: '查看说明', group: '导航', keywords: ['help', '说明'], shortcut: '?',
      run: function (command, event) { /* 面板此时已关闭 */ } },
    { id: 'later', label: '暂不可用命令', group: '其他', disabled: true, run: function () {} }
  ]
});
palette.open();
palette.isOpen(); // true
palette.close();
```

## 10. 支持范围与未验证项

- 已在 Windows Edge（Chromium）headless 下验证 X01–X07 的 mount/update/destroy、主要键盘路径、浮层焦点恢复、窄视口布局和无残留浮层。
- 未覆盖：真实用户视觉评价、不同输入设备/移动端软键盘、跨浏览器矩阵、超大层级树的性能、宿主页面已有全局快捷键/模态层冲突、图片跨域策略。

## 11. 用户评价范围

X01–X07 均为未获用户评价的候选组件，`userReview=not-reviewed`；技术完成不表示审美或业务适配已获用户确认。参数以本文件记录为准，非硬性设计值（尺寸、间隔、数量）按内容适配。
