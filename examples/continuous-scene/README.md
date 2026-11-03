# 连续画面 · 局部变化与观察（最小示例）

一个画面、一个 Binding，里面有**两个不同含义的局部主要变化**：左格和右格。示例不是课程笔记，只演示正确接法，方便提取到自己的作品。

## 打开

开发入口：

```text
examples/continuous-scene/index.html
```

自包含预览（改动源文件后重新生成）：

```powershell
node scripts/build-demo-preview.mjs `
  --template examples/continuous-scene/index.html `
  --output dist/连续画面局部变化-预览.html
```

## 最小可运行源

- `minimal.html`：独立单文件最小接法，真实加载 `dist/note-library.css/js`，只用一个 `NoteDemo.sceneAdapter.define` + `NoteDemo.mount` 默认舞台，演示一次填充 30%→84% 的局部变化：attention groups 放行、commit 只提交目标、progress 只推进自己的填充、来源视觉保持、go 恢复与 reduced 终态。
- 直接用浏览器打开，或：

```powershell
node scripts/inspect-note.mjs "examples/continuous-scene/minimal.html" --json
```

- 页面暴露 `window.__inspectSession`（只读观察入口）。改 dist 源后仍按下文命令重建整库/预览。

## 接法

- 一个自定义 Adapter 管理一个 Binding；`PreparedChange.groups()` 在第 1 步声明 `left` 与 `right` 两个命名效果组。
- `scene.attention.targets` 先看左格、再看右格，分别用 `groups:['left']` / `groups:['right']` 放行对应内容。
- 效果组的 progress 只更新自己的面板。右格在焦点到达前保留来源值 C；左格的绘制不会把右格提前改成 D。
- 记录条在 `commit()` 时只写目标已提交/等待放行，不占效果组，也不冒充“已完成”；真正的显现状态跟随 progress 或终态恢复。
- `commit()` 提交目标模型；视觉过渡由 progress 从来源走到目标；`readView()` 返回已提交的 stage。
- 受控内容不需要自己暂停 CSS transition：公共 scene 在提交前给本 Binding 容器加 `data-note-scene-active`，由 demo-runtime 只在容器内暂停补间；效果组只改自己的 progress 透明度。示例的样式不再保留这类 transition。
- 恢复写入也由公共 Binding 包装：写入后同步确认受控样式/布局，再释放标记；不会把 `go/prev` 的恢复变成自动补间。
- 提交时只设置本步变化组的来源/目标文字；progress 更新不再反复替换未变文字。
- 第 2 步继续从上一停点推进，只放行右格；左格保持已落位值 B。取消、恢复和减少动效沿用公共层；`go()` 只恢复停点，过程用 `next()/replay()`。
- 指定停点观察：`node scripts/inspect-note.mjs "examples/continuous-scene/index.html" --frame two-local --session "window.__inspectSession" --json`。
- `effects(effectCtx)` 只从 `effectCtx.timing` 读取最终 `enterDuration`/`easing`；内部绘制 helper 可以继续接收 timing，但不要把整个 effectCtx 当 timing。
- 减少动效时 `commit` 直接呈现目标终态，Adapter 不返回 progress 效果，也不等待不会出现的进度推进；恢复停点直接呈现该停点完整画面。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `scene.js` | 画面、两个面板、辅助记录，以及 `prepareStep/restore/readModel/targetAt` |
| `adapter.js` | 公开 Adapter 契约；只声明本步实际变化的组 |
| `demo.js` | Frame、Transition、attention targets、默认舞台 layout 与启动 |
| `style.css` | 页面与示例外壳；不写播放器或第二套计时 |
| `index.html` | 完整开发入口，也是单文件预览模板 |
| `minimal.html` | 最小可运行单文件维护源（一个 Adapter、一次局部变化） |

## 验证

```powershell
node scripts/inspect-note.mjs "examples/continuous-scene/index.html" --json
```

检查会读取真实文字层、计算透明度和受控标记，并在测试时额外注入一条 CSS transition，证明公共接管压住受控内容原生补间；只读 `data-progress` 不足以判断实际可见状态。

需要作品专属检查时，使用 `--probe <模块绝对路径>`，probe 的 `export default async ({ page }) => ...` 会复用已打开的页面。`inspect-note --help` 是参数事实入口。
