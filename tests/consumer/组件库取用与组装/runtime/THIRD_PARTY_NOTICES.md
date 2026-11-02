# 第三方资源与许可

本文件记录组件库实际随包分发的第三方代码/资源。只列真实进入运行文件的内容；仅作对照、未复制代码的参考库另行注明。

项目自有代码与文档采用根目录 [LICENSE](LICENSE) 中的 MIT 许可证；下列第三方资源保留各自的版权与许可，不由项目许可证替代。

## 运行时依赖（本地化，无 CDN）

### KaTeX 0.19.1

- 用途：NoteUI.Math 公式渲染。
- 许可：MIT。版权声明：Copyright (c) 2013-2020 Khan Academy and other contributors。
- 来源：https://github.com/KaTeX/KaTeX
- 本地文件：
  - `vendor/katex/katex.min.js`
  - `vendor/katex/katex.min.css`（构建时把 woff2 字体转为 data URI 内嵌；运行产物不再请求字体文件）
  - `vendor/katex/fonts/*.woff2`（20 个）
  - `vendor/katex/LICENSE`（完整许可）
- 修改：仅构建期将字体 URL 内嵌为 data URI，未改 KaTeX 代码。

### marked 18.1.2

- 用途：NoteUI.Markdown 的 Markdown 解析（原始 HTML 在组件层禁用/净化）。
- 许可：MIT。版权：Copyright (c) 2018+, MarkedJS; Copyright (c) 2011-2018, Christopher Jeffrey。
- 来源：https://github.com/markedjs/marked
- 本地文件：`vendor/marked/marked.umd.js`、`vendor/marked/LICENSE`（完整许可）。
- 修改：无。

### Lucide 1.62.0（图标子集）

- 用途：NoteCore 图标入口与各组件图标。
- 许可：ISC。版权：Copyright (c) 2026 Lucide Icons and Contributors。
- 来源：https://github.com/lucide-icons/lucide
- 本地文件：`vendor/lucide/icons/*.svg`（68 个选定图标）、`vendor/lucide/LICENSE`（完整许可）。
- 修改：构建时把 SVG 形状数据抽出为 `src/core/icons-data.js`；图标外观未改。

## 仅作参考、未复制代码

- Ant Design 组件目录与 shadcn/ui 组件目录：用于分类与清单对照，未复制代码或样式。
- WAI-ARIA Authoring Practices Guide（APG）：键盘与语义模式参考，交互由本项目编写。
- TKCode.Arc：用于参考组件/共享基础/组合块的组织方式；其为 Avalonia 实现，未作为运行依赖。
- Rough Notation / LeaderLine / Manim：旧批次文字中作为能力对照提及，本库未复制其代码，现有 NoteExpr 组件为原项目自写。

## 项目原有资产

`资产候选/基础UI组件`、`基础表达组件`、`序列插入-第二轮`、`基础视觉试排` 的代码与样式为本项目原有候选资产，进入本库的兼容/分发部分时保留原来源路径与评价范围，不视为第三方代码。

## 维护

新增第三方资源必须先由主控选型、固定版本并记录许可；不得在运行产物中引用网络 CDN。完整许可文本随 `vendor/*/LICENSE` 保留，并随 ZIP 分发。
