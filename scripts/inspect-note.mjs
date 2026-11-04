#!/usr/bin/env node
/*
 * 一次性的本地成品观察入口。
 * 打开给定 HTML，收集页面错误/控制台错误/外部请求，按需截图或执行作品专属 probe。
 * 不启动服务，不生成默认文件，不自动安装依赖；执行成功不等于作品验收通过。
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openNotePage, resolveBrowserExecutable, loadPlaywright, LIBRARY_ROOT } from './lib/note-browser.mjs';
import { createInspectSession } from './lib/inspect-session.mjs';

const DEFAULTS = { width: 1440, height: 1000 };
const HELP = `本地观察入口 · inspect-note

用法:
  node scripts/inspect-note.mjs <成品HTML路径> [--json]
      [--selector <CSS选择器>] [--selector-index <从0开始的下标>]
      [--screenshot <输出PNG绝对路径>]
      [--probe <probe模块绝对路径>]
      [--session <页面内会话表达式>]
      [--frame <frameId>] [--width <像素>] [--height <像素>]
      [--browser <浏览器可执行文件绝对路径>]

说明:
  - 默认无头运行，直接打开本地 HTML；一次调用后关闭浏览器，无常驻服务。
  - 路径基准：成品 HTML 可写相对当前工作目录（cwd）或绝对路径；--screenshot、--probe、--browser
    需要绝对路径（截图父目录必须存在）。本工具不读模板；预览模板资源相对模板目录、--output
    相对 cwd 的规则见 build-demo-preview.mjs --help。--help 从工程外也只显示帮助，不读页面/模板。
  - 默认不写截图、报告或日志；--screenshot 由调用方明确指定输出。
  - --selector 截取指定元素：默认要求选择器唯一；命中多个会明确报错，可加 --selector-index 0..N-1。
    指定 --screenshot 时截该元素（元素截图）；未指定 --screenshot 时只返回元素状态（box/可见性/标签等）。
    选择器不存在、多个、下标越界都会报错，含选择器、页面文件与下一步建议。
  - --probe 模块导出 default async ({ page, context, browser, observations, entry, inspect }) => JSON 值；
    它复用同一个已打开页面，不另起浏览器。
  - --session 指定会话表达式（如 "window.PropagationExample.session"）；
    不传时 inspect 会尝试 window.__inspectSession / PropagationExample.session / AuthoringSessions[0] / NoteDemoSessions[0]。
  - --frame 指定要恢复的 Frame ID（非空字符串，只接受一个）；顺序固定为
    打开页面 → 创建 inspect → session.go(frameId) 并确认 phase/settledFrameId → 选择器/截图/probe。
    inspect.step('go', 'frame-id') 的第二个参数是实际字符串 Frame ID（如 'right-again'），不是对象/数组。
    go()/--frame 只定位静态停点；观察运行过程请用 next()/replay() + start/sample/waitFor。
    未知 Frame 明确失败并保留 requestedFrameId/actualFrameId/sessionStatus/result/phase/settledFrameId，不默默停在初态。
  - inspect（scripts/lib/inspect-session.mjs）提供同一页内的组合观察辅助：
      state()                     读取 phase/settledFrameId/targetFrameId/replaying/error
      read(表达式)                在页面内读取任意只读值（session 可用）
      start(action, params?)      开始推进（next/prev/replay/reset/go），返回 { done, ... } 便于运行中采样
      step(action, params?, opts) start + 等待完成（默认再等 idle）；go 参数必须是字符串 Frame ID
      waitIdle(opts)              等待 phase === 'idle'
      waitFor(表达式, opts)       等待任意页面条件
      sample({ read?, until?, args? }, opts)  过程采样（返回 { samples: [{t,value}], stopReason }）
      box(选择器)                 读取元素 rect/opacity/visibility
      element(选择器, {index})    读取元素状态（唯一性/下标规则同 --selector）
      screenshot(绝对路径)        仅在显式调用时写整页截图
      screenshotElement(选择器, 绝对路径, {index})  仅截指定元素
      observe()                   读取本次 page/console 错误与外部请求（不写文件）
  - 默认浏览器为本机 Edge；找不到时用 --browser 显式指定，不自动安装或轮换通道。
  - 退出码：0 = 工具执行成功（不代表作品验收通过）；1 = 打开/选择器/截图/probe 失败；2 = 用法错误。

示例:
  node scripts/inspect-note.mjs "D:/path/to/成品.html" --json
  node scripts/inspect-note.mjs "D:/path/to/成品.html" --selector ".nblk-demo-stage" --screenshot "D:/path/stage.png" --json
  node scripts/inspect-note.mjs "D:/path/to/成品.html" --selector ".nui-table" --selector-index 0 --json
  node scripts/inspect-note.mjs "D:/path/to/成品.html" --frame "right-again" --probe "D:/path/probe.mjs" --json
  node scripts/inspect-note.mjs "D:/path/to/成品.html" --session "window.AuthoringSessions[0]" --probe "D:/path/probe.mjs" --json
`;

function coded(code, message, extra) {
  const error = new Error(message);
  error.code = code;
  if (extra) Object.assign(error, extra);
  return error;
}

function parseArgs(argv) {
  const options = { json: false, help: false, screenshot: null, probe: null, session: null, frame: null, selector: null, selectorIndex: null, width: null, height: null, browser: null };
  const allowed = new Set(['json', 'help', 'screenshot', 'probe', 'session', 'frame', 'selector', 'selector-index', 'width', 'height', 'browser']);
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') { options.json = true; continue; }
    if (arg === '--help' || arg === '-h') { options.help = true; continue; }
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const eq = arg.indexOf('=');
    const key = (eq >= 0 ? arg.slice(2, eq) : arg.slice(2));
    if (!allowed.has(key)) throw coded('usage', '未知选项 --' + key);
    let value = eq >= 0 ? arg.slice(eq + 1) : null;
    if (value == null) {
      value = argv[i + 1];
      if (value == null || value.startsWith('--')) {
        if (key === 'frame') throw coded('usage', '--frame 需要一个非空 Frame ID；示例：--frame "right-again"。');
        if (key === 'selector') throw coded('usage', '--selector 需要一个非空 CSS 选择器；示例：--selector ".nblk-demo-stage"。');
        if (key === 'selector-index') throw coded('usage', '--selector-index 需要一个从 0 开始的整数；示例：--selector-index 0。');
        throw coded('usage', '选项 --' + key + ' 需要一个值');
      }
      i += 1;
    }
    if (key === 'json' || key === 'help') {
      if (value !== 'true' && value !== '') throw coded('usage', '--' + key + ' 不接受值');
    } else if (key === 'frame') {
      if (options.frame != null) throw coded('usage', '--frame 只接受一个 Frame ID；示例：--frame "right-again"。');
      options.frame = value;
    } else if (key === 'selector') {
      if (options.selector != null) throw coded('usage', '--selector 只接受一个选择器；命中多个元素时用 --selector-index 指定下标。');
      options.selector = value;
    } else if (key === 'selector-index') {
      if (options.selectorIndex != null) throw coded('usage', '--selector-index 只接受一个值。');
      options.selectorIndex = value;
    } else options[key] = value;
  }
  if (positional.length > 1) throw coded('usage', '只接受一个成品 HTML 路径；收到：' + positional.join(' '));
  return { options, positional };
}

function absoluteRequested(value, flag) {
  if (value == null) return null;
  const resolved = path.resolve(value);
  if (!path.isAbsolute(value)) throw coded('usage', flag + ' 需要绝对路径。');
  return resolved;
}

function checkOutputPath(file, flag) {
  if (!file) return;
  const parent = path.dirname(file);
  if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) throw coded('invalid_output', flag + ' 的父目录不存在：' + parent);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) throw coded('invalid_output', flag + ' 指向目录：' + file);
}

function publicObservations(observations) {
  return {
    pageErrors: observations.pageErrors.slice(),
    consoleErrors: observations.consoleErrors.slice(),
    externalRequests: observations.externalRequests.slice(),
    requestFailures: observations.requestFailures.slice(),
    errorCount: observations.pageErrors.length + observations.consoleErrors.length,
    externalRequestCount: observations.externalRequests.length
  };
}

async function run() {
  const { options, positional } = parseArgs(process.argv.slice(2));
  if (options.help) { console.log(HELP); return; }
  if (!positional.length) throw coded('usage', '需要一个本地成品 HTML 路径；使用 --help 查看用法。');
  const entry = path.resolve(positional[0]);
  if (options.session != null && !String(options.session).trim()) throw coded('usage', '--session 需要一个页面内表达式。');
  if (options.frame != null && (typeof options.frame !== 'string' || !options.frame.trim())) {
    throw coded('usage', '--frame 需要一个非空 Frame ID；示例：--frame "right-again"。');
  }
  const requestedFrameId = options.frame == null ? null : options.frame.trim();
  if (options.selector != null && (typeof options.selector !== 'string' || !options.selector.trim())) {
    throw coded('usage', '--selector 需要一个非空 CSS 选择器；示例：--selector ".nblk-demo-stage"。');
  }
  const requestedSelector = options.selector == null ? null : options.selector.trim();
  let requestedSelectorIndex = null;
  if (options.selectorIndex != null) {
    if (!requestedSelector) throw coded('usage', '--selector-index 只能与 --selector 一起使用；示例：--selector ".nui-table" --selector-index 0。');
    if (!/^[0-9]+$/.test(String(options.selectorIndex))) {
      throw coded('usage', '--selector-index 需要从 0 开始的整数；示例：--selector-index 0。');
    }
    requestedSelectorIndex = Number(options.selectorIndex);
  }
  const screenshot = absoluteRequested(options.screenshot, '--screenshot');
  const probePath = absoluteRequested(options.probe, '--probe');
  if (screenshot) checkOutputPath(screenshot, '--screenshot');
  if (probePath) {
    if (!fs.existsSync(probePath) || !fs.statSync(probePath).isFile()) throw coded('invalid_probe', 'probe 文件不存在：' + probePath);
  }
  let session = null;
  try {
    session = await openNotePage({
      root: LIBRARY_ROOT,
      entry,
      width: options.width || DEFAULTS.width,
      height: options.height || DEFAULTS.height,
      browser: options.browser || null,
      headless: true
    });
    const data = {
      ok: true,
      tool: 'inspect-note',
      entry: session.entry,
      viewport: session.viewport,
      browser: { headless: true, executablePath: resolveBrowserExecutable(LIBRARY_ROOT, options.browser) },
      observations: null,
      probe: null,
      screenshot: null,
      execution: '页面已打开并完成本次请求的观察；这不表示作品验收通过。'
    };
    const failures = [];
    const inspect = createInspectSession(session.page, {
      session: options.session || null,
      observations: session.observations,
      label: positional[0]
    });
    /* 顺序契约：打开页面 → 恢复 Frame 并确认落位 → 截图/probe。
     * 恢复失败时不继续截图/probe，避免把“打开成功”的初态截图当成目标停点证据。 */
    let frameReady = true;
    if (requestedFrameId) {
      data.requestedFrameId = requestedFrameId;
      data.actualFrameId = null;
      data.sessionStatus = null;
      data.result = null;
      data.phase = null;
      data.settledFrameId = null;
      try {
        const outcome = await inspect.step('go', requestedFrameId);
        const actual = await inspect.state();
        data.sessionStatus = outcome.status;
        data.result = outcome.result;
        data.phase = actual.phase;
        data.settledFrameId = actual.settledFrameId == null ? null : actual.settledFrameId;
        data.actualFrameId = data.settledFrameId;
        const navigation = outcome.navigation || null;
        const resultStatus = outcome.result && outcome.result.status != null ? outcome.result.status : null;
        const resultOk = resultStatus == null || resultStatus === 'settled' || resultStatus === 'completed' || resultStatus === 'noop';
        const arrived = outcome.status === 'settled' && actual.phase === 'idle' &&
          actual.settledFrameId === requestedFrameId && !actual.error && resultOk &&
          (!outcome.navigation || outcome.navigation.ok !== false);
        if (!arrived) {
          frameReady = false;
          const detail = navigation && navigation.message ? navigation.message
            : '实际 settledFrameId=' + String(actual.settledFrameId) + '，phase=' + String(actual.phase);
          failures.push(coded('frame_failed',
            '无法恢复到 Frame "' + requestedFrameId + '"（requestedFrameId=' + requestedFrameId +
            '，actualFrameId=' + String(data.actualFrameId) + '，sessionStatus=' + String(outcome.status) +
            '，result=' + JSON.stringify(outcome.result) + '，phase=' + String(actual.phase) + '）：' + detail));
        }
      } catch (error) {
        frameReady = false;
        data.sessionStatus = 'error';
        failures.push(coded(error.code || 'frame_failed',
          '无法恢复到 Frame "' + requestedFrameId + '"：' + error.message));
      }
    }
    let selectorReady = true;
    if (frameReady && requestedSelector) {
      data.selector = requestedSelector;
      data.selectorIndex = requestedSelectorIndex;
      try {
        const info = await inspect.element(requestedSelector, { index: requestedSelectorIndex });
        data.element = info;
        if (screenshot) {
          const shot = await inspect.screenshotElement(requestedSelector, screenshot, { index: requestedSelectorIndex });
          data.screenshot = shot.path;
        }
      } catch (error) {
        selectorReady = false;
        failures.push(coded(error.code || 'selector_failed', error.message));
      }
    }
    if (frameReady && selectorReady && screenshot && !requestedSelector) {
      try {
        await session.page.screenshot({ path: screenshot, fullPage: false });
        data.screenshot = screenshot;
      } catch (error) {
        failures.push(coded('screenshot_failed', '截图失败：' + error.message));
      }
    }
    if (frameReady && selectorReady && probePath) {
      let probe = null;
      try {
        const module = await import(pathToFileURL(probePath).href);
        probe = module && typeof module.default === 'function' ? module.default : null;
        if (!probe) failures.push(coded('invalid_probe', 'probe 模块必须 export default async ({ page }) => ...'));
      } catch (error) {
        failures.push(coded('probe_import_failed', '无法导入 probe 模块：' + error.message));
      }
      if (probe) {
        try {
          const value = await probe({
            page: session.page,
            context: session.context,
            browser: session.browser,
            observations: session.observations,
            entry: session.entry,
            inspect: inspect
          });
          data.probe = value === undefined ? null : value;
        } catch (error) {
          failures.push(coded('probe_failed', 'probe 执行失败：' + error.message));
        }
      }
    }
    /* 观察事实必须在 probe 之后汇总：probe 期间产生的页面/控制台错误也要进入最终结果。 */
    data.observations = publicObservations(session.observations);
    if (failures.length) {
      data.ok = false;
      data.execution = !frameReady
        ? '页面已打开；请求的 Frame 未确认落位，选择器/截图/probe 未执行，观察事实仍保留。'
        : selectorReady
          ? '页面已打开；请求的截图或 probe 未完成，观察事实仍保留。'
          : '页面已打开；请求的选择器未解析，截图/probe 未执行，观察事实仍保留。';
      data.error = { code: failures[0].code || 'tool_failed', message: failures.map((item) => item.message).join('；') };
      process.exitCode = 1;
    }
    if (options.json) console.log(JSON.stringify(data, null, 2));
    else {
      console.log('inspect-note: ' + data.entry);
      console.log('viewport: ' + data.viewport.width + 'x' + data.viewport.height + ' · browser: ' + data.browser.executablePath);
      console.log('page errors: ' + data.observations.pageErrors.length + ' · console errors: ' + data.observations.consoleErrors.length + ' · external requests: ' + data.observations.externalRequests.length);
      if (data.observations.requestFailures.length) console.log('request failures: ' + data.observations.requestFailures.length);
      if (requestedFrameId) {
        console.log('frame: requested=' + requestedFrameId + ' · actual=' + String(data.actualFrameId) +
          ' · sessionStatus=' + String(data.sessionStatus) + ' · phase=' + String(data.phase));
      }
      if (requestedSelector) {
        console.log('selector: ' + requestedSelector + ' · matched=' + String(data.element && data.element.count) +
          ' · index=' + String(data.element && data.element.index) + ' · visible=' + String(data.element && data.element.visible));
      }
      if (data.screenshot) console.log('screenshot: ' + data.screenshot);
      if (probePath) console.log('probe: ' + JSON.stringify(data.probe));
      if (!data.ok) console.log('失败: ' + data.error.message);
      console.log(data.ok ? '执行成功仅表示页面已打开并完成观察；不表示作品验收通过。' : '观察事实已保留；这不表示作品验收通过。');
    }
  } finally {
    if (session) await session.close();
  }
}

try {
  await run();
} catch (error) {
  const json = process.argv.includes('--json');
  const data = { ok: false, tool: 'inspect-note', error: { code: error.code || 'error', message: error.message } };
  if (json) console.log(JSON.stringify(data, null, 2));
  else console.error('inspect-note: ' + error.message);
  process.exitCode = error.code === 'usage' ? 2 : 1;
}
