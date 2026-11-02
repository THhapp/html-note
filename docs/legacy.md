# 基础控件、标记与序列插入（R01–R10、I06）

R01–R10 的维护源在 src；legacy 是原有分发模块名，便于已有调用方继续使用。公开接口继续保留。

## 1. 当前维护位置

| 能力 | 当前维护源 | ID | 说明 |
| --- | --- | --- | --- |
| Button、Segmented | src/ui/controls.js 与 controls.css | R01–R02 | 基础 UI；参数与未展示场景以组件 API 为准 |
| Badge、Notice、Disclosure、DataObject | src/ui/primitives.js 与 primitives.css | R03–R06 | 基础 UI；参数与未展示场景以组件 API 为准 |
| Focus、Range、Link | src/expr/focus.js\|css、range.js\|css、link.js\|css | R07–R09 | 焦点、范围与连线行为以组件 API 为准 |
| 序列插入 | src/viz/sequence-insert.js 与 sequence-insert.css | R10 | 参数与其他未展示场景未冻结 |
| 构建与分发 | scripts、vendor、gallery | I06 | 构建、预览与打包入口 |


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

## 4. R02–R06 基础 UI

| ID | 组件 | 复用要点 | 不扩大的范围 |
| --- | --- | --- | --- |
| <a id="R02"></a>R02 | `NoteUI.Segmented` | options/value/onChange/getValue；方向键、Home/End、跳过禁用项；程序 update 不触发 onChange | 单选；值应唯一；不做多选/自由输入 |
| <a id="R03"></a>R03 | `NoteUI.Badge` | label/tone：neutral/accent/warning；长文字换行 | 不自动判定语义、不开放任意颜色 |
| R04 | `NoteUI.Notice` | 常驻说明；title/content/tone；content 为文本、单个 DOM 节点，或由文本/节点组成的数组 | 不是 Tooltip；无关闭/自动隐藏；数组按内容插入，不静默字符串化 |
| <a id="R05"></a>R05 | `NoteUI.Disclosure` | 原生 details；title/summary/content/open/onToggle；程序开合的 event=null | 必要的当前说明不藏进折叠；手风琴只是宿主组合 |
| <a id="R06"></a>R06 | `NoteUI.DataObject` | label/value/caption/attention/changed；value 可为 DOM；程序 update 不回调 | 不判定关注/变化，不提供编辑或持久化 |

gallery demo 直接挂载这些实现的公开 API，并用控件真实更新内容；未改源码。

<a id="R04"></a>

### R04 NoteUI.Notice

**内容契约（明确反馈）**：`content` 接受字符串/数字/布尔文本、单个 DOM 节点（Element/Text/DocumentFragment），或由文本与节点组成的数组；`null`/`undefined` 视为空内容，数组中的 `null` 项跳过。数组在写入前整体校验，任一项不是文本或 DOM 节点就抛出带 `NoteUI.Notice:` 前缀的 `TypeError`，不会先破坏旧内容。数组通过 `NoteCore.setContent` 插入，需要 core 模块已加载。

```js
var strong = document.createElement("strong");
strong.textContent = "重点";
NoteUI.Notice.mount(host, {
  title: "范围",
  content: [strong, document.createTextNode("普通说明文字")],
  tone: "warning"
});
// 传 [node, {}] 会抛错：content 数组第 2 项不是文本或 DOM 节点
```

`update({ content })` 遵循同一校验：先整体校验再写入，失败时不会先改标题、语气或旧内容，宿主修正后可再次更新。

## 5. R07–R10：旧表达组件与序列插入

### 5.1 保留的接口形状

| ID | API | 关键差异 |
| --- | --- | --- |
| <a id="R07"></a>R07 | `NoteExpr.Focus.mount({motion,zIndex,accel?,entrance?,observe?,geometry?})`；`show({el,text,mode,observe?,geometry?})` / `hide()` / `refresh()` / `weak()` / `restore()` / `reanchor([el|spec])` / `destroy()`；只读 `emphasis` | 没有 `update()`；重复 `show` 即更新；迁移目标也是一个 `show`；weak/restore/reanchor 是会话生命周期扩展，独立用法可不调用（详见 5.2） |
| <a id="R08"></a>R08 | `NoteExpr.Range.mount(...)`；`show({targets,text,side,orientation,offset})` / `hide()` / `refresh()` / `destroy()` | 没有 `update()`；换范围用 `show`；`offset` 为新增可选外侧间距 |
| <a id="R09"></a>R09 | `NoteExpr.Link.mount(...)`；`show({from,to,label,arrow,fromSide,toSide})` / `hide()` / `refresh()` / `destroy()` | 没有 `update()`；换端点用 `show` |
| <a id="R10"></a>R10 | `SeqInsert.mount(host, {...})`；`insert()` / `restore()` / `toggle()` / `replay()` / `setData(data,{keepState})` / `destroy()` | 不是实例 `update`；停点由旧状态机管理 |

`NoteExpr` 三个叠加层挂在 `body`，`position:fixed`、`pointer-events:none`、`aria-hidden="true"`；它们是视觉批注，不替代正文的语义说明。`SeqInsert` 在宿主容器内生成自己的单一 DOM，不依赖 NoteExpr 的私有节点。

### 5.2 R07 Focus：accel、weak/restore/reanchor 与 geometry

`show/hide/refresh/destroy`、`show(el)`、`show({el,text,mode})`、`whenArrived()`、`whenHidden()` 与文本子串下划线的原有语义不变；下面只列新增的可选项与会话方法，独立用法可以完全不使用它们。默认舞台 attention 用同一套实例跨停点复用：出现/迁移由 `show` 承接，停稳后 `weak()`，下一停点 `restore()` 或重新 `show()`，DOM 重建时 `reanchor()`。

**mount 选项**

| option | 类型 / 默认 | 说明 |
| --- | --- | --- |
| `motion` | `'auto'`（默认）/ `'always'` / `'never'` | 原有；`auto` 跟随系统 `prefers-reduced-motion`，`never` 不建动画/rAF 迁移。 |
| `zIndex` | number | 原有；写入根元素 z-index。 |
| `entrance` | `'default'`（默认）/ `'soft'` | 原有；`soft` 供 attention 使用的 320ms 软出现。 |
| `accel` | number，默认 `4600` | 对称框迁移的加速度，单位 px/s²。非有限数或 ≤0 回退 4600。只影响 box→box 迁移时长：`T = 2√(D/accel)` 夹在 180–800ms，D 为四角点最大位移（含宽高变化）；首次出现、下划线逐段画出、交叉淡出与 hide 的原时长不受影响。 |
| `observe` | boolean，默认 `true` | `false` 为受控测量模式：不挂 scroll/resize/ResizeObserver/MutationObserver 的自动重测，活动期也不跑逐帧跟随；宿主自行 `refresh()` 或重锚。 |
| `geometry` | `{ rect(el), textRects?(el,text) }` | 可选受控测量对象，作为实例默认几何来源。`rect(el)` 必须返回 `{left,top,width,height}`（DOMRect 同名字段也可）；`textRects(el,text)` 可选，缺省用原生 Range。非法对象按未提供处理，不抛错。 |

`show()` 的 spec 还可带 `observe`、`geometry`：`observe` 会更新本实例后续是否自动重测；对象形式的 `geometry` 优先于 mount.geometry，并在后续 `show`/`refresh` 中沿用。`show(el)` 纯元素形式会清掉 spec geometry，回退到 mount.geometry 或原生测量。`show()` 同步把 emphasis 置回 `active`（weak→active 不另做恢复动画）。

同一元素换 `geometry`/观察范围时，`show()` 不只看元素身份：身份、mode、文字相同但实际几何变化超过 0.5px 时仍走正常框迁移，位置与宽高同一进度；几何不变或只抖动 ≤0.5px 时 no-op 不重播。迁移中的新 `show()` 从**当前已渲染框**继续，不会先跳到上一迁移终点。`reanchor()` 仍是静默重绑定，不承担范围过渡；需要可见的范围变化应再调用 `show()`。

**会话方法**

- `weak()`：可见且已有目标时调用。取消进行中的框迁移与逐帧跟随，无动画重测并落到当前目标几何，根 `data-nx-emphasis` 变为 `weak`。只降低强调、保留几何与目标，不隐藏、不销毁、不改目标；若取消了进行中的迁移，`whenArrived()` 按“已落当前几何”结算。不可见或没有目标时 no-op。
- `restore()`：可见时调用，emphasis 回到 `active` 并恢复活动期逐帧跟随；不做视觉恢复动画。若目标仍处于断开状态（DOM 重建尚未重锚），保持 weak 与上一几何不变，不替宿主决定报错还是隐藏——宿主应先 `reanchor(newEl)` 再 restore，或直接 hide。
- `reanchor(arg)`：DOM 重建后静默重测同一逻辑目标。`arg` 省略时重测当前 spec；也可传新元素或 `{el,text,mode,geometry?}`；只有对象形式带 `geometry` 时才覆盖当前 spec geometry（传纯元素沿用当前 spec/mount geometry）。先测量后更新内部状态：参数错误或目标不在文档中会直接抛错且不修改现有标记。可见时更新目标，且在没有进行中的出现/迁移动画时无动画落新几何；不重启进行中的迁移/到达句柄，也不重播出现动画；迁移进行中则下一帧起沿用新目标。不可见时只更新内部目标，供下次 `show()` 使用。
- 只读 `focus.emphasis` 返回 `'active' | 'weak'`，与根元素 `data-nx-emphasis` 同步。

**原有语义（未改）**

- `show()` 继续按当前状态选择首次出现、下划线/文本更新、框→框迁移或交叉淡出；连续 `show()` 仍是更新而不是叠加新实例。
- `hide()` 从可见态淡出并在结束时清目标/状态；`whenHidden()` 在真实淡出后结算。
- `whenArrived()` 在本次出现或迁移真实完成时结算；新的 `show()` 会把旧 arrival 结算 false。
- `refresh()` 按当前目标/几何重测；`destroy()` 幂等移除根并释放监听与观察器。
- 下划线模式仍是文本子串逐行下划线（Range 每行盒一段，线高 2px）；框选仍是元素四边外扩 6px、1.5px 描边、8px 圆角，与几何契约一致。

**weak 的视觉与断开保留**

- `data-nx-emphasis="weak"` 时：框选变虚线，边框色用 `--nx-weak`（默认 `#7d8a9b`）、opacity `.55`；下划线改用 `--nx-weak`、opacity `.45`。过渡为 140ms 的 opacity/border-color/background-color，无循环呼吸动画；`prefers-reduced-motion: reduce` 下无过渡。几何与目标保留，restore 后回到强调色。
- weak 静止期目标因 DOM 重建临时断开时不 autoHide：保留上一可见几何与目标引用，等宿主 `reanchor()` 或 `hide()`；非 weak 的活动期断开仍按原语义 autoHide。weak 期间目标仍在但测量失败（例如文本子串已消失）时仍按原语义 autoHide。
- 事件与清理保持原有：叠加层仍 `pointer-events:none`、`aria-hidden="true"`；`hide()/destroy()` 取消弱化状态并照常释放监听与观察器。

### 5.3 R08 Range 外侧间距与双层括线

`show({ offset })` 新增可选外侧间距：括线与目标组包围盒的距离，单位 px，默认 `10`（`NoteExpr.Range` 原有几何不变）。它只影响该次 `show` 之后的放置；`refresh()`、滚动、resize 与目标尺寸变化沿用当前 offset，下一次不带 offset 的 `show()` 回到默认 10。非法值（负数、非有限数字、非数字字符串）抛 `NoteExpr.Range: offset 必须是非负有限数字`。实例新增只读 `range.offset`。

两层括线由两个独立 Range 实例组织：给它们不同 offset，并显式指定同一边（`side: 'below'|'above'|'left'|'right'`），避免 auto 各自选边。offset 差值应大于前一层「标签线高 + labelGap」，默认 12px 字号下约 34px 以上，否则标签可能与下一层括线相碰。auto 判断与换边也使用当前 offset，因此窄容器/滚动/resize 后的 refresh 会按实际间距重新避让。

```js
var outer = NoteExpr.Range.mount({ motion: 'auto' });
var inner = NoteExpr.Range.mount({ motion: 'auto' });
outer.show({ targets: [macFrame], text: 'MAC 帧 64–1518 B', side: 'below', offset: 10 });
inner.show({ targets: [dataField], text: '数据字段 46–1500 B', side: 'below', offset: 46 });
// 更新内容时保留各自的 offset；重新 show 不带 offset 会回到默认 10
inner.show({ targets: [dataField], text: '数据字段 46–1500 B', side: 'below', offset: 46 });
```

### 5.4 Gallery 展示覆盖

`gallery/demos/legacy.js` 中：

- R07：目标 A → 迁移目标 B → 文本子串下划线 → 隐藏 → refresh；真实操作后截图前只保留当前标记。
- R08：前两项 → 更新到后两项 → 只有括线无说明 → 隐藏 → 改变间距并 refresh。
- R09：配置项 → 读取函数 → 缓存对象的可核对关系；显式换端点、无箭头、隐藏与 refresh。没有沿用“同一 key”这类未在正文说明的旧示例语义。
- R10：插入 → 撤回 → 重看当前停点 → `setData(...,{keepState:true})` → `setData(...,{keepState:false})`；状态文字来自真实的 `onChange`/`onSettle`，不是写死终态。

清理：每个 demo 返回 `{destroy}`，撤掉组件实例与 NoteExpr body 层；R10 组件自身的监听器、观察器和临时节点由 `destroy()` 清理。构建后 gallery 的回归由集成阶段按 manifest 执行，本文件不记录某次运行的断言计数。

### 5.5 兼容边界

- NoteExpr 的 `refresh()` 在目标丢失时会自动隐藏并不抛错；`show()` 参数错误会抛带 `NoteExpr.<组件>:` 前缀的 Error。
- R08 的 `offset` 是可选新增字段：不传时保持原有 10px 几何；单层、双层、窄视口与 refresh 已用 src 直载 Edge 探针回归。
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
