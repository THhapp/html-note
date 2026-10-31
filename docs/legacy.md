# 基础控件、标记与序列插入（R01–R10、I06）

R01–R10 的维护源在 src；legacy 是原有分发模块名，便于已有调用方继续使用。公开接口与评价范围保留。

## 1. 当前维护位置与评价

| 能力 | 当前维护源 | ID | 评价范围 |
| --- | --- | --- | --- |
| Button、Segmented | src/ui/controls.js 与 controls.css | R01–R02 | 六项基础UI未获逐项视觉评价；R01兼容增强不扩大原认可 |
| Badge、Notice、Disclosure、DataObject | src/ui/primitives.js 与 primitives.css | R03–R06 | 未获逐项视觉评价 |
| Focus、Range、Link | src/expr/focus.js\|css、range.js\|css、link.js\|css | R07–R09 | 总体满意；动作/层次仍可精修 |
| 序列插入第二轮 | src/viz/sequence-insert.js 与 sequence-insert.css | R10 | 第二轮整体“这轮不错”，参数和其他场景未冻结 |
| 构建与分发 | scripts、vendor、gallery | I06 | 技术核验与用户评价分别记录 |

当前条目继续保留候选评价，不以目录整合自动升级。

## 2. 加载与分发

全量包按 core → legacy → 其他模块顺序加载。legacy 内部 JS 顺序为 controls → primitives → focus → range → link → sequence-insert；CSS 采用相应顺序并追加 src/compat/legacy-bridge.css。controls.js 向 primitives.js 提供模块内部共享 helper（`window.NoteUILegacyInternals`，不是公开 API）；按模块加载或按上述顺序直接加载源码时都会满足该依赖。

按模块使用时加载 core 与 dist/modules/legacy.js|css 即可。tokens来自core，当前构建不使用archive中的旧note-ui.css，也不回写历史独立包。

所有源路径都由 src/manifests/legacy.json 指向根内文件。可查看[架构与接口](架构与接口.md)，维护与分发不再依赖 archive/prototypes。

<a id="R01"></a>

## 3. R01：NoteUI.Button 的既有增强

### 3.1 维护位置

Button 和 Segmented 的现行维护源是 src/ui/controls.js|css。R01 在原 Button 上增加图标、加载、纯图标、紧凑尺寸等兼容字段，R02 原接口保留。原独立组的生成包与内嵌预览只保留为历史材料；现行修改只走 src → scripts/build.mjs → dist。

### 3.2 新增字段与行为

| 字段 | 行为 |
| --- | --- |
| `icon` | DOM 节点直接放入 `.nui-button__icon`；字符串通过 `NoteUI.Button.iconResolver` 解析为节点。未设置 resolver 或解析失败时不报错、不显示图标。图标节点会移入按钮，不克隆。 |
| `iconResolver` | 公开静态钩子：`function(name) -> Node`，也接受 `{ name: Node }` 映射对象。R01 demo 在挂载时临时指向 `NoteCore.icons.get`，销毁时恢复原值。 |
| `iconPosition` | `'start'`（默认，图标在文案前）或 `'end'`。DOM 顺序即视觉顺序。 |
| `iconOnly` | 隐藏可见文案，按钮成为 40×40（md）或 32×32（sm）方形。可访问名称优先 `ariaLabel`，其次显式 `label`，再次图标名；全无时回退“按钮”。 |
| `loading` | 添加 `is-loading`/`data-loading`、`aria-busy="true"` 与 spinner；忽略 click 回调。**不使用原生 disabled**，所以按钮仍能 Tab 聚焦。不伪造业务成功。 |
| `ariaLabel` | 非空时写入 `aria-label`；纯图标按钮即使未传也会生成名称。 |
| `title` | 非空时设置悬停提示；空值删除。title 不作为唯一说明。 |
| `size` | `'md'`（默认，保持 40px 基准）或 `'sm'`（32px，配 `.nui-button--sm`）。 |
| `iconPosition` 非法值 / `size` 非法值 | 回退到 `start` / `md`；不抛错。 |

原有 `label`、`variant`（primary/secondary/quiet）、`disabled`、`onClick(event)`、`update(patch)`、`destroy()` 的语义保持不变。`update` 使用与原来相同的“部分更新、程序更新不触发回调”规则，并识别新增字段。loading 时即使有 spinner，按钮的可访问名称仍保留。

### 3.3 可访问性与动效

- 图标容器 `aria-hidden="true"`，名称由按钮自身承担；icon-only 始终生成非空可访问名称。
- 加载态 spinner 使用 CSS 边框环；`prefers-reduced-motion: reduce` 时关闭旋转，但仍保留静态圆环与 `aria-busy`。
- 加载时不夺取焦点，原生 Enter/Space 仍能触发 click，只是回调被忽略；状态清除后立即恢复。
- 原按钮的 `:focus-visible` 焦点环、disabled 透明度与 hover 规则未改。

### 3.4 验证范围

- 现行回归入口是 gallery 演示（真实挂载 R01–R10）与 `tests/checks` 下由测试维护方按 manifest 组织的源码/构建检查；本文件不记录某次运行的断言计数。
- R01 覆盖：按钮原变体、点击与 disabled、update 的部分更新语义、destroy；图标节点移入且 update 后保持同一节点；ariaLabel/title；sm/纯图标/加载态；可访问名称回退；字符串图标经 resolver 且未解析不崩溃；loading 忽略点击但仍可聚焦；reduced-motion 关闭 spinner。
- 旧预览与历史截图只作交付记录，不再作为现行检查资产。

## 4. R02–R06：未修改的旧 UI

| ID | 组件 | 复用要点 | 不扩大的范围 |
| --- | --- | --- | --- |
| <a id="R02"></a>R02 | `NoteUI.Segmented` | options/value/onChange/getValue；方向键、Home/End、跳过禁用项；程序 update 不触发 onChange | 单选；值应唯一；不做多选/自由输入 |
| <a id="R03"></a>R03 | `NoteUI.Badge` | label/tone：neutral/accent/warning；长文字换行 | 不自动判定语义、不开放任意颜色 |
| <a id="R04"></a>R04 | `NoteUI.Notice` | 常驻说明；title/content/tone；content 可为 DOM | 不是 Tooltip；无关闭/自动隐藏 |
| <a id="R05"></a>R05 | `NoteUI.Disclosure` | 原生 details；title/summary/content/open/onToggle；程序开合的 event=null | 必要的当前说明不藏进折叠；手风琴只是宿主组合 |
| <a id="R06"></a>R06 | `NoteUI.DataObject` | label/value/caption/attention/changed；value 可为 DOM；程序 update 不回调 | 不判定关注/变化，不提供编辑或持久化 |

gallery demo 直接挂载这些实现的公开 API，并用控件真实更新内容；未改源码。

## 5. R07–R10：旧表达组件与序列插入

### 5.1 保留的接口形状

| ID | API | 关键差异 |
| --- | --- | --- |
| <a id="R07"></a>R07 | `NoteExpr.Focus.mount({motion,zIndex})`；`show(el)` / `show({el,text,mode})` / `hide()` / `refresh()` / `destroy()` | 没有 `update()`；重复 `show` 即更新；迁移目标也是一个 `show` |
| <a id="R08"></a>R08 | `NoteExpr.Range.mount(...)`；`show({targets,text,side,orientation})` / `hide()` / `refresh()` / `destroy()` | 没有 `update()`；换范围用 `show` |
| <a id="R09"></a>R09 | `NoteExpr.Link.mount(...)`；`show({from,to,label,arrow,fromSide,toSide})` / `hide()` / `refresh()` / `destroy()` | 没有 `update()`；换端点用 `show` |
| <a id="R10"></a>R10 | `SeqInsert.mount(host, {...})`；`insert()` / `restore()` / `toggle()` / `replay()` / `setData(data,{keepState})` / `destroy()` | 不是实例 `update`；停点由旧状态机管理 |

`NoteExpr` 三个叠加层挂在 `body`，`position:fixed`、`pointer-events:none`、`aria-hidden="true"`；它们是视觉批注，不替代正文的语义说明。`SeqInsert` 在宿主容器内生成自己的单一 DOM，不依赖 NoteExpr 的私有节点。

### 5.2 Gallery 展示覆盖

`gallery/demos/legacy.js` 中：

- R07：目标 A → 迁移目标 B → 文本子串下划线 → 隐藏 → refresh；真实操作后截图前只保留当前标记。
- R08：前两项 → 更新到后两项 → 只有括线无说明 → 隐藏 → 改变间距并 refresh。
- R09：配置项 → 读取函数 → 缓存对象的可核对关系；显式换端点、无箭头、隐藏与 refresh。没有沿用“同一 key”这类未在正文说明的旧示例语义。
- R10：插入 → 撤回 → 重看当前停点 → `setData(...,{keepState:true})` → `setData(...,{keepState:false})`；状态文字来自真实的 `onChange`/`onSettle`，不是写死终态。

清理：每个 demo 返回 `{destroy}`，撤掉组件实例与 NoteExpr body 层；R10 组件自身的监听器、观察器和临时节点由 `destroy()` 清理。构建后 gallery 的回归由集成阶段按 manifest 执行，本文件不记录某次运行的断言计数。

### 5.3 兼容边界

- NoteExpr 的 `refresh()` 在目标丢失时会自动隐藏并不抛错；`show()` 参数错误会抛带 `NoteExpr.<组件>:` 前缀的 Error。
- 旧叠加层对 transform 祖先、iframe、嵌套滚动容器、打印、移动端/窄屏以及 Firefox/Safari 未作保证；旧 README 的未验证项原样保留。
- SeqInsert 已验证原序列 1–5 项、单一插入点、中间/开头/末尾追加和长中文；不保证 0 项、6 项以上、多行文本、多重插入/删除/替换、极窄容器和打印。
- R10 的 `setData(data, {keepState:true})` 替换内容但保持当前停点；`keepState:false` 回到 `startInserted`。`animate:false`、减少动效与 setData 会让 onChange/onSettle 连续触发，这是旧接口既有行为。
- Disclosure 程序 `update({open})` 的 `onToggle` 第二参数是 `null`，原生操作是 `toggle` 事件；宿主不能假定事件对象存在。
- R01 loading 不复用原生 disabled 的语义；需要真正禁用时仍传 `disabled:true`。

## 6. 兼容桥 `src/compat/legacy-bridge.css`

默认完全关闭：不加类时文件不改变旧组件观感。启用方式：

```html
<!-- 同时希望桥接 body 上的 NoteExpr 叠加层时，把类放在 body -->
<body class="hnv-legacy-bridge">
  <div id="host"><!-- SeqInsert 等 --></div>
</body>
```

如果只想桥接局部容器内的 SeqInsert，把类放到该容器即可；NoteExpr 叠加层挂在 body，局部容器类不会影响它们。

桥接把旧变量显式映射到 `--hnv-*`：

| 旧变量 | 新值 |
| --- | --- |
| `--nx-accent` | `--hnv-color-accent` |
| `--nx-ink` | `--hnv-color-ink` |
| `--nx-ink-soft` | `--hnv-color-muted` |
| `--nx-hair` | `--hnv-color-border` |
| `--nx-label-bg` | `--hnv-color-surface`（92% 不透明） |
| `--nx-font` | `--hnv-font-family` |
| `--nx-z` | `--hnv-z-float`；link = z，range = z+5，focus = z+10，保留旧层级顺序 |
| `--si-ink` / `--si-ink-2` / `--si-ink-3` | ink / muted / muted |
| `--si-accent` / `--si-accent-soft` / `--si-accent-line` | accent / accent-soft / attention |
| `--si-mark-line` / `--si-mark-ink` | border / muted |
| `--si-card-bg` / `--si-card-line` | surface / border |
| `--si-pending-*` / `--si-solid-*` | accent / accent-soft / surface 等对应值 |
| `--si-font` | `--hnv-font-family` |

组件根上的同名变量声明会覆盖祖先继承，因此 bridge 对 `.nx-focus`、`.nx-range`、`.nx-link`、`.seq-insert` 根节点直接声明映射，而不是只在外层设变量；其中 link/range 的共用视觉变量合并为一组声明，focus 只声明实际使用的 `--nx-accent` 与 `--nx-z`。声明值与改动前一致，opt-in 行为不变。需要单实例覆盖时仍按旧文档使用 `instance.el.style`。

## 7. 不重写旧接口

- 不为 NoteExpr 添加假的 `update()`；其规范是 `show/hide/refresh`。
- 不为 SeqInsert 添加统一 `update()`；仍用 `insert/restore/replay/setData`。
- 不改旧根类名、旧事件形态、旧限制，不把 R02–R10 的新包装器冒充原组件。
- 旧视觉与旧动画参数不因入库自动升级为已确认；gallery 只呈现真实挂载。
- 新增 Button 字段全部可选；不传时旧按钮的 DOM 结构和表现与改动前一致。

## 8. 已知缺口与未验证

- R01 旧预览只在桌面 Edge/Chromium 与 `file://` 下实际验证；未测触屏、Firefox、Safari、屏幕阅读器、打印、高 DPI 和 200% 缩放。
- R01 图标字符串依赖宿主设置 `NoteUI.Button.iconResolver`；组件库不会自动加载 Lucide 全量图标。gallery 通过 core 的 `NoteCore.icons.get` 演示。
- R07–R10 的验证范围沿用原组目录；gallery 接入、交互与清理回归不等于其独立完整测试。
- 独立消费测试已在两个局部页面中组合部分既有与新增组件；这不替代全部 R 条目在真实笔记中的阅读评价。
- 构建产物中的旧组件与新组件共享 tokens，但旧组件的 CSS 仍保留自己的局部颜色回退；bridge 是显式 opt-in，不会自动统一所有旧外观。
