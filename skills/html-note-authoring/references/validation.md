# 验证与观察

本文件是 Skill 自带的验证与观察指导，供仓库内外的制作任务直接使用；不依赖项目专项文档。工具参数以目标库的 `inspect-note --help` 和实际返回为准，库位置通过 `--root` 给出。

## 验证范围

验证范围由本次任务和实际风险决定，不默认遍历全部停点、全部视口或跑整库浏览器矩阵。先核对知识与代表状态，再在实际速度下观察需要动态理解的过程；只有具体疑点才加探针。

### 何时只检查状态，何时必须真实推进

- 静态交付、只改文案或布局且没有动画/焦点变化时，检查页面能打开、目标状态正确、没有页面错误即可。
- 要证明动画、焦点到达、内容放行、取消恢复或连续承接时，必须通过 `next()`/`replay()` 真实推进并观察过程。`go()` 只是直接恢复停点，不能用来证明动画或 attention 正确。
- 静态终态截图不能冒充动态观看；时序疑点用页面内采样（phase、progress、可见值、焦点/组启动先后）而不是反复截静态图。
- 验证完成只说明已观察的范围；不把“打开成功”“没有报错”自动写成作品验收通过，也不代替用户评价。

### 本地观察入口

Skill 提供 `scripts/inspect-note.mjs` 薄入口，使用 `--root <库目录>` 调用目标库工具：一次调用、执行后退出、无常驻服务；默认无头打开给定本地 HTML，收集页面错误、控制台错误和外部请求，按需截图或执行作品专属 probe，并在正常结束或失败时释放自己创建的浏览器资源。

```powershell
node "<Skill目录>/scripts/inspect-note.mjs" --root "<库目录>" "D:/path/to/成品.html" --json
node "<Skill目录>/scripts/inspect-note.mjs" --root "<库目录>" "D:/path/to/成品.html" --screenshot "D:/path/out.png" --width 860 --height 1000
node "<Skill目录>/scripts/inspect-note.mjs" --root "<库目录>" "D:/path/to/成品.html" --probe "D:/path/probe.mjs" --json
node "<Skill目录>/scripts/inspect-note.mjs" --root "<库目录>" "D:/path/to/成品.html" --frame <frameId> --session "window.__inspectSession" --json
```

- `--frame <frameId>` 用公开 `session.go(frameId)` 恢复停点并确认实际落点后才执行截图/probe；未知 Frame、空参数或会话缺失会明确失败，不退回初始态冒充定位成功。它只证明静态停点，动画/焦点/组放行仍用 `next()/replay()`。

- probe 导出 `default async ({ page, inspect }) => ...`，复用同一个已打开页面；需要连续推进、采样或读取 DOM 时都在 probe 内完成，不另起浏览器。
- `--help` 是实现参数的最终事实来源；默认不生成截图、报告或日志，输出文件只在调用方明确指定时写出。
- 输出区分工具执行事实、页面观察事实和 probe 结果；不要把三者合成一个“通过”。
- 这里要区分“浏览器组件模块依赖”和“Node 工具运行条件”：页面需要 dist 模块或整库；观察工具需要工程现有 `playwright-core` 与本机浏览器，不自动安装、下载或轮换通道。
- 公共 scene 在提交前统一接管参与的 Binding 容器，暂停受控内容原有的 CSS transition；作者不另写 `setSceneActive` 或示例私有暂停层。要证明接管有效，可在最小输入上注入一条 CSS transition，检查提交帧的真实计算透明度而不是只看 data 属性。
- probe 期间新产生的页面/控制台错误必须在 probe 结束后重新汇总；probe 失败时也要保留已经收集的观察事实。
- 恢复/取消的接管不能只检查状态字段：恢复写入后先确认受控状态下的真实计算样式已经落位，再释放；用带 CSS transition 的最小元素检查 `go()` 不会留下 CSSTransition。

### Skill 中的收口

制作时按需查询现行 API 和最小示例，不复制完整接口手册。已有有效上下文继续使用；局部修改只复核影响范围。回复时链接实际成果，说明真实复用、实际观察、剩余限制与未完成项，不另建按轮次维护的报告、状态副本或批量测试材料。
