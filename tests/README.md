# tests 目录说明

本目录放工程检查与可复现消费测试，不是运行时分发资源。离线包只需要 `dist/`、`src/`、`examples/`、`gallery/` 与许可；测试依赖本机 Edge 与 `tests/tools` 中的 playwright-core，不进入运行链路。

## 目录

| 路径 | 定位 | 输入/输出 |
| --- | --- | --- |
| `tests/demo/` | 公共编排层浏览器检查：core-check、adapters-check、ui-check、integration-check | 脚本是输入；结果只打印或写 .cache |
| `tests/checks/` | 现行检查与各模块补充自检；现行浏览器入口以 `docs/构建与分发.md` §8.2 为准，包括 public-transition、focus-continuity、groups、handoff、flow-kit、flow-scene、flow-geometry、stable-layout、attention-composition、minimal-scene、inspect-note、query 等；HTML 文件是测试夹具 | HTML 夹具与脚本是输入 |
| `tests/lib/src-sources.mjs` | Node 共享 harness：按 `src/manifests/*.json` 推导经典脚本/样式加载清单 | 只读 |
| `tests/lib/test-output.mjs` | 生成物路径 helper：统一写 `tests/.cache/` | 只写 .cache |
| `tests/tools/` | 本地 playwright-core（勿在检查中重装浏览器或加运行时依赖） | 输入 |
| `tests/consumer/` | 独立消费测试输入与固定证据；运行时副本在测试准备时从当前 `dist/modules` 临时生成到 `tests/.cache/consumer-runtime/`，不长期提交 | 输入与生成物，见下 |
| `tests/.cache/` | 浏览器检查的截图、结果 JSON、日志、临时构建副本 | 纯生成物，打包排除 |

## 源码加载清单（防止模块拆分漏载）

- Node 检查脚本不要重抄源码文件清单：用 `tests/lib/src-sources.mjs` 的 `moduleScripts(root, ["core", ...])` / `moduleStyles` / `moduleDemos`，顺序来自 manifest（与 `scripts/build.mjs` 共用 `scripts/lib/source-order.mjs`）。
- 模块拆分时只更新 `src/manifests/<module>.json`；检查自动覆盖新增文件。
- HTML 夹具（`tests/checks/*.html`、`examples/demo-scene/*.html` 等）无法在运行时读 manifest，必须手工保持顺序。改完跑：

  ```powershell
  node tests/checks/source-loaders-check.mjs
  ```

  它会检查：每个引用的 src 文件都被 manifest 声明、js/css 顺序与 manifest 一致、模块顺序与构建顺序一致、示例宿主与测试夹具是否漏载拆分后的文件。

## 生成物规则

- 检查产生的截图、结果 JSON、日志、临时构建副本一律写 `tests/.cache/<check>/`（用 `test-output.mjs`），不要写回 `tests/checks`、`tests/demo` 或仓库根。
- `tests/checks` 保留现行检查、模块自检与夹具；不再把一次性截图/日志/结果作为检查输入，这些输出统一写 `tests/.cache/`。
- 消费测试不再提交长期 `runtime/` 副本，也不维护 `SOURCES.md`。每次准备测试时从当前 `dist/modules`、`vendor/*/LICENSE`、`THIRD_PARTY_NOTICES.md` 逐字节生成临时副本到 `tests/.cache/consumer-runtime/`（每次 prepare 先清空），并生成自包含测试页面到 `tests/.cache/consumer-pages/`：

  ```powershell
  cd tests/consumer/组件库取用与组装
  node scripts/verify-runtime.mjs          # prepare：刷新 tests/.cache/consumer-runtime（可用 --check 只核对）
  node scripts/build-pages.mjs             # 生成 tests/.cache/consumer-pages/page-a.html|page-b.html
  node scripts/check-a.mjs                 # 之后的所有 check/smoke 使用生成页面，不读遗留 runtime
  node scripts/check-b.mjs
  node scripts/smoke.mjs
  ```

  `tests/.cache/` 整目录打包排除，可在任意时刻删除重生成；`scripts/verify-runtime.mjs --check` 用于确认临时副本仍与当前 dist 一致（输出哈希，不写长期文件）。

- 固定证据保持原含义：`01-矩阵转置.html`、`02-序列变化.html` 与 `evidence/*.png` 是某一构建的固定快照，`build-pages` 不重写它们；`evidence/step-player-probe.html` 会引用临时 runtime，运行前先 prepare。`check-offline.mjs` 验证的是保留的 01/02 自包含证据，不是当前 dist 的运行时快照。

## 常用命令

```powershell
node scripts/check.mjs
node tests/checks/source-loaders-check.mjs
node tests/checks/query-cli-check.mjs   # 真实 CLI 查询，不启动浏览器
node tests/checks/query-closure-host-check.mjs
node tests/checks/skill-independent-check.mjs   # Skill 复制到仓库外，用 --root 调真实查询/观察帮助
node tests/checks/public-transition-check.mjs
node tests/checks/focus-continuity-check.mjs
node tests/checks/groups-check.mjs
node tests/checks/v05-assembly-check.mjs
node tests/checks/handoff-check.mjs
node tests/checks/authoring-page-smoke.mjs   # 需要先重建 dist/
node tests/checks/propagation-example-check.mjs   # 需要先重建 dist/
node tests/checks/continuous-scene-check.mjs   # 完整连续示例；需要先重建 dist/
node tests/checks/flow-kit-check.mjs
node tests/checks/flow-scene-check.mjs
node tests/checks/flow-geometry-check.mjs
node tests/checks/stable-layout-check.mjs
node tests/checks/attention-composition-check.mjs
node tests/checks/density-config-check.mjs
node tests/checks/density-screen-check.mjs
node tests/checks/minimal-scene-check.mjs   # 最小接入宿主；需要先重建 dist/
node tests/checks/inspect-note-check.mjs   # 实际启动本机 Edge；会创建并清理 .cache 中的截图/probe
node tests/demo/core-check.mjs
node tests/demo/adapters-check.mjs
node tests/demo/ui-check.mjs
node tests/demo/integration-check.mjs
```

消费测试（固定证据 01/02 与 `evidence/` 保留；`build-pages` 只重生成 `tests/.cache/consumer-pages/`，不改 01/02）：

```powershell
cd tests/consumer/组件库取用与组装
node scripts/verify-runtime.mjs
node scripts/build-pages.mjs
node scripts/check-a.mjs
node scripts/check-b.mjs
node scripts/check-lifecycle.mjs
node scripts/check-migration.mjs
node scripts/check-offline.mjs     # 验证保留的固定证据 01/02 自包含
node scripts/smoke.mjs
```

浏览器检查需要本机 `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`；`inspect-note-check` 和 `scripts/inspect-note.mjs` 同样复用该浏览器与 `tests/tools/playwright-core`，不自动安装或下载。构建、静态核对、`source-loaders-check` 与 `query-cli-check` 不依赖浏览器。
