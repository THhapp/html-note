# 作者装配与聚焦示例

这是普通作者入口，不是开发宿主的源脚本清单。页面只加载：

- `../../dist/note-library.css`
- `../../dist/note-library.js`
- 本目录的 `data.js`、`boot.js`、`authoring.css`

## 文件

- `data.js`：可替换内容。矩阵乘法与逐项读数都返回 `NoteDemoRecipes.focusWorkbench` 的配置；`attention.targets` 是作者给出的注意顺序。
- `boot.js`：唯一启动文件，负责 mount，不实现播放器、字幕、计时或动画。
- `authoring.css`：页面外壳与内容排版；通用区域骨架来自 `src/demo/recipes.css`。
- `index.html`：开发入口，也是自包含预览的模板。

## 依赖

`demo-ui` 模块（包含 `NoteDemo.mount`、默认舞台与 `NoteDemoRecipes.focusWorkbench`）；整库已包含。配方源码在 `src/demo/recipes.js`。

## 运行

直接双击 `index.html`（需先构建整库），或生成自包含预览：

~~~powershell
node scripts/build.mjs --final --release
node scripts/build-demo-preview.mjs --template examples/authoring/index.html --output dist/作者装配与聚焦-预览.html
~~~

默认静止，使用演示下方控件推进。完整 Definition 仍可通过 `NoteDemo.compile` 输出或把 `demo.definition` 交给 `NoteDemo.create` 检查。
