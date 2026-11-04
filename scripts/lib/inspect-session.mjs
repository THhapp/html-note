/*
 * inspect-session — 同一页面内的 NoteDemo 会话观察辅助（可被 inspect-note probe 复用）。
 *
 * 边界：
 * - 只接收已经打开的 Playwright Page；不启动浏览器、不启动服务、不安装依赖。
 * - 默认不写任何文件；只有显式调用 screenshot(路径) 才会写 PNG。
 * - 不修改页面实现；所有推进/读取都走作品自身公开的 session API。
 *
 * 典型 probe：
 *   export default async function ({ inspect }) {
 *     const before = await inspect.state();
 *     const running = await inspect.start('next');
 *     const sampled = await inspect.sample({
 *       until: 'window.NoteDemo && "session" || true', // 表达式在页面内执行
 *       durationMs: 1200,
 *       intervalMs: 24
 *     });
 *     const result = await running.done;
 *     await inspect.screenshot('D:/tmp/run.png'); // 仅在需要时显式写文件
 *     return { before, result, samples: sampled.samples.length };
 *   }
 *
 * 会话解析：
 * - 优先使用 options.session（页面内表达式，如 'window.AuthoringSessions[0]'）。
 * - 否则自动尝试 window.__inspectSession、window.PropagationExample.session、
 *   window.AuthoringSessions[0]、window.NoteDemoSessions[0]。
 * - 都找不到时给出可操作的 session_not_found 错误，不猜测 DOM 内部对象。
 */

import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_SESSION_CANDIDATES = [
  'window.__inspectSession',
  'window.PropagationExample && window.PropagationExample.session',
  'window.AuthoringSessions && window.AuthoringSessions[0]',
  'window.NoteDemoSessions && window.NoteDemoSessions[0]'
];

const ACTIONS = new Set(['next', 'prev', 'replay', 'reset', 'go']);

function coded(code, message, extra) {
  const error = new Error(message);
  error.code = code;
  if (extra) Object.assign(error, extra);
  return error;
}

function positiveNumber(value, fallback, name) {
  if (value == null) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw coded('usage', name + ' 必须是正数。');
  return number;
}

function normalizeExpression(value, flag) {
  if (typeof value !== 'string' || !value.trim()) throw coded('usage', flag + ' 需要页面内表达式字符串。');
  return value.trim();
}

function normalizeSelector(value, where) {
  if (typeof value !== 'string' || !value.trim()) {
    throw coded('usage', where + ' 需要非空 CSS 选择器字符串；示例：--selector ".nblk-demo-stage" --screenshot "D:/tmp/element.png"。');
  }
  return value.trim();
}

function normalizeSelectorIndex(value, where) {
  if (value == null) return null;
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0) {
    throw coded('usage', where + ' 需要从 0 开始的整数；示例：--selector-index 0。');
  }
  return index;
}

/* go 的参数是单个 Frame ID：数组/null/空串/非字符串都必须在触达页面之前报 usage。 */
function normalizeFrameId(value, where) {
  if (typeof value !== 'string' || !value.trim()) {
    throw coded('usage', where + ' 需要非空 Frame ID 字符串（例如 step(\'go\', \'right-again\')）；收到：' + describeValue(value) + '。');
  }
  return value.trim();
}

function describeValue(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return '数组';
  if (typeof value === 'object') return '对象';
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}

function publicState(state) {
  const source = state && typeof state === 'object' ? state : {};
  const error = source.error && typeof source.error === 'object'
    ? { code: source.error.code || null, message: source.error.message || String(source.error) }
    : (source.error ? { code: null, message: String(source.error) } : null);
  return {
    phase: source.phase || null,
    settledFrameId: source.settledFrameId == null ? null : source.settledFrameId,
    targetFrameId: source.targetFrameId == null ? null : source.targetFrameId,
    replaying: !!source.replaying,
    error: error
  };
}

function publicResult(result) {
  if (result == null) return { status: null };
  if (typeof result !== 'object') return { status: String(result) };
  const error = result.error && typeof result.error === 'object'
    ? (result.error.message || result.error.code || String(result.error)) : (result.error == null ? null : String(result.error));
  return {
    status: result.status == null ? null : String(result.status),
    frameId: result.frameId == null ? null : result.frameId,
    replaying: result.replaying == null ? null : !!result.replaying,
    error: error
  };
}

export function createInspectSession(page, options = {}) {
  if (!page || typeof page.evaluate !== 'function' || typeof page.waitForFunction !== 'function') {
    throw coded('usage', 'createInspectSession(page, options)：page 必须是已打开的 Playwright Page。');
  }
  const defaultTimeout = positiveNumber(options.timeout, 15000, 'options.timeout');
  const observations = options.observations || null;
  const label = options.label ? String(options.label) : null;
  const explicitExpression = options.session ? normalizeExpression(options.session, 'options.session') : null;
  let resolvedExpression = explicitExpression;

  async function ensureSession(expression) {
    if (expression) {
      const ok = await page.evaluate(({ expr }) => {
        try {
          const session = new Function('return (' + expr + ')')();
          return !!(session && typeof session.getState === 'function');
        } catch (error) {
          return false;
        }
      }, { expr: expression });
      if (!ok) {
        throw coded('invalid_session', '会话表达式不可用（没有返回带 getState() 的 NoteDemo 会话）：' + expression);
      }
      return expression;
    }
    if (explicitExpression) {
      const ok = await page.evaluate(({ expr }) => {
        try {
          const session = new Function('return (' + expr + ')')();
          return !!(session && typeof session.getState === 'function');
        } catch (error) {
          return false;
        }
      }, { expr: explicitExpression });
      if (!ok) {
        throw coded('invalid_session', '--session / options.session 表达式不可用（没有返回带 getState() 的 NoteDemo 会话）：' + explicitExpression);
      }
      return explicitExpression;
    }
    if (resolvedExpression) {
      const ok = await page.evaluate(({ expr }) => {
        try {
          const session = new Function('return (' + expr + ')')();
          return !!(session && typeof session.getState === 'function');
        } catch (error) {
          return false;
        }
      }, { expr: resolvedExpression });
      if (ok) return resolvedExpression;
      resolvedExpression = null;
    }
    const found = await page.evaluate(({ candidates }) => {
      for (const candidate of candidates) {
        try {
          const value = new Function('return (' + candidate + ')')();
          if (value && typeof value.getState === 'function') return candidate;
        } catch (error) { /* 尝试下一个候选 */ }
      }
      return null;
    }, { candidates: DEFAULT_SESSION_CANDIDATES });
    if (!found) {
      throw coded('session_not_found',
        '页面里找不到可驱动的 NoteDemo 会话。请先设置 window.__inspectSession = session，或用 --session <页面内表达式>（如 "window.AuthoringSessions[0]"）。');
    }
    resolvedExpression = found;
    return found;
  }

  async function withSession(body, args, explicitExpression) {
    const expression = await ensureSession(explicitExpression);
    return page.evaluate(({ expr, bodyText, payload }) => {
      const session = new Function('return (' + expr + ')')();
      if (!session || typeof session.getState !== 'function') throw new Error('会话表达式已失效：' + expr);
      const fn = new Function('session', 'args', 'return (' + bodyText + ')');
      return fn(session, payload);
    }, { expr: expression, bodyText: body, payload: args == null ? null : args });
  }

  async function state(optionsOverride) {
    // 一次 getState() 快照，避免运行中多次读取导致字段来自不同时刻。
    return withSession('(() => { const s = session.getState(); return { phase: s.phase, settledFrameId: s.settledFrameId, ' +
      'targetFrameId: s.targetFrameId, replaying: s.replaying, error: s.error }; })()',
      null, optionsOverride && optionsOverride.session);
  }

  async function read(expressionValue, args) {
    const expression = normalizeExpression(expressionValue, 'read()');
    return withSession('(' + expression + ')', args);
  }

  async function evaluate(expressionValue, args) {
    return read(expressionValue, args);
  }

  async function waitIdle(optionsValue = {}) {
    const timeout = positiveNumber(optionsValue.timeout, defaultTimeout, 'waitIdle().timeout');
    const intervalMs = positiveNumber(optionsValue.intervalMs, 50, 'waitIdle().intervalMs');
    const expression = await ensureSession(optionsValue.session);
    const startedAt = Date.now();
    try {
      await page.waitForFunction(({ expr, timeoutMs }) => {
        const session = new Function('return (' + expr + ')')();
        return !!session && session.getState().phase === 'idle';
      }, { expr: expression, timeoutMs: timeout }, { timeout: timeout, polling: intervalMs });
    } catch (error) {
      let last = null;
      try { last = publicState(await state({ session: expression })); } catch (stateError) { last = null; }
      throw coded('timeout', '等待会话回到 idle 超时（' + timeout + 'ms，最后状态：' + JSON.stringify(last) + '）。', { last: last });
    }
    return { phase: 'idle', elapsedMs: Date.now() - startedAt };
  }

  async function waitFor(predicateExpression, optionsValue = {}) {
    const expression = normalizeExpression(predicateExpression, 'waitFor()');
    const sessionExpression = await ensureSession(optionsValue.session);
    const timeout = positiveNumber(optionsValue.timeout, defaultTimeout, 'waitFor().timeout');
    const intervalMs = positiveNumber(optionsValue.intervalMs, 50, 'waitFor().intervalMs');
    const args = optionsValue.args == null ? null : optionsValue.args;
    const startedAt = Date.now();
    try {
      await page.waitForFunction(({ expr, sessionExpr, payload }) => {
        const session = new Function('return (' + sessionExpr + ')')();
        return new Function('session', 'args', 'return (' + expr + ')')(session, payload);
      }, { expr: expression, sessionExpr: sessionExpression, payload: args }, { timeout: timeout, polling: intervalMs });
    } catch (error) {
      throw coded('timeout', '等待页面条件超时（' + timeout + 'ms）：' + expression, { predicate: expression });
    }
    return { elapsedMs: Date.now() - startedAt };
  }

  async function start(action, params, optionsValue = {}) {
    if (!ACTIONS.has(action)) throw coded('usage', 'start() 只支持 ' + Array.from(ACTIONS).join('/') + '。');
    /* go 的 frameId 在触达页面/会话前就校验，避免把数组/null 传进 session.go。 */
    const goFrameId = action === 'go' ? normalizeFrameId(params, "start('go', frameId)") : null;
    const expression = await ensureSession(optionsValue.session);
    const startedAt = Date.now();
    const done = page.evaluate(async ({ expr, runAction, payload }) => {
      const session = new Function('return (' + expr + ')')();
      const method = session[runAction];
      if (typeof method !== 'function') return { status: 'unsupported', message: 'session 缺少方法 ' + runAction };
      const begin = performance.now();
      try {
        const value = runAction === 'go' ? await method.call(session, payload) : await method.call(session);
        return { status: 'settled', elapsedMs: performance.now() - begin, result: value };
      } catch (error) {
        return { status: 'threw', elapsedMs: performance.now() - begin, message: error && error.message ? error.message : String(error) };
      }
    }, { expr: expression, runAction: action, payload: goFrameId != null ? goFrameId : (params == null ? null : params) });
    const inspect = {
      action: action,
      startedAt: startedAt,
      requestedFrameId: goFrameId,
      done: done.then((payload) => {
        const record = {
          action: action,
          wallMs: Date.now() - startedAt,
          elapsedMs: payload.elapsedMs,
          status: payload.status,
          result: payload.result === undefined ? null : publicResult(payload.result),
          message: payload.message || null
        };
        if (goFrameId != null) record.requestedFrameId = goFrameId;
        return record;
      })
    };
    return inspect;
  }

  async function step(action, params, optionsValue = {}) {
    const run = await start(action, params, optionsValue);
    const outcome = await run.done;
    /* go 失败会进入 error 停态而不是 idle；此时不再空等 idle 超时，直接读取真实落位/phase。 */
    const navigationFailed = action === 'go' && outcome.result &&
      (outcome.result.status === 'failed' || outcome.result.status === 'cancelled');
    if (optionsValue.settle !== false && !navigationFailed) {
      try { await waitIdle({ timeout: optionsValue.timeout, intervalMs: optionsValue.intervalMs }); } catch (error) {
        outcome.settleError = error.message;
      }
    }
    if (navigationFailed) outcome.settleSkipped = 'navigation-failed';
    /* go 的 settled 只表示这次调用结束；导航是否真正到达请求 Frame 要看 session 状态。 */
    if (action === 'go') {
      let actual = null;
      try { actual = await state({ session: optionsValue.session }); } catch (error) { actual = null; }
      const requestedFrameId = run.requestedFrameId;
      const actualFrameId = actual && actual.settledFrameId != null ? actual.settledFrameId : null;
      const phase = actual && actual.phase != null ? actual.phase : null;
      const result = outcome.result || {};
      outcome.requestedFrameId = requestedFrameId;
      outcome.actualFrameId = actualFrameId;
      outcome.settledFrameId = actualFrameId;
      outcome.phase = phase;
      const resultOk = !result || result.status == null || result.status === 'settled' || result.status === 'completed' || result.status === 'noop';
      const navigationOk = outcome.status === 'settled' && resultOk && phase === 'idle' &&
        actualFrameId === requestedFrameId && (!actual || !actual.error);
      outcome.navigation = {
        requestedFrameId: requestedFrameId,
        actualFrameId: actualFrameId,
        sessionStatus: outcome.status,
        resultStatus: result.status == null ? null : result.status,
        phase: phase,
        ok: navigationOk,
        message: navigationOk ? null
          : (result.error || outcome.message || outcome.settleError ||
            ('请求 ' + requestedFrameId + '，实际 settledFrameId=' + actualFrameId + '，phase=' + phase))
      };
    }
    return outcome;
  }

  async function sample(spec, optionsValue = {}) {
    const expression = await ensureSession(optionsValue.session);
    const config = typeof spec === 'string' ? { read: spec } : (spec && typeof spec === 'object' ? spec : {});
    const readExpression = config.read ? normalizeExpression(config.read, 'sample().read')
      : '({ phase: session.getState().phase, settledFrameId: session.getState().settledFrameId })';
    const untilExpression = config.until == null ? null : normalizeExpression(config.until, 'sample().until');
    const args = config.args == null ? null : config.args;
    const intervalMs = positiveNumber(optionsValue.intervalMs, 24, 'sample().intervalMs');
    const maxSamples = Math.max(1, Math.floor(positiveNumber(optionsValue.maxSamples, 600, 'sample().maxSamples')));
    const durationMs = optionsValue.durationMs == null ? null : positiveNumber(optionsValue.durationMs, 1500, 'sample().durationMs');
    const effectiveDuration = durationMs == null && !untilExpression ? 1500 : durationMs;
    const payload = await page.evaluate(async ({ expr, readText, untilText, payloadArgs, interval, max, duration }) => {
      const session = new Function('return (' + expr + ')')();
      const readFn = new Function('session', 'args', 'return (' + readText + ')');
      const untilFn = untilText ? new Function('session', 'args', 'return (' + untilText + ')') : null;
      const samples = [];
      const begin = performance.now();
      let stopReason = 'maxSamples';
      while (samples.length < max) {
        let value;
        try { value = readFn(session, payloadArgs); } catch (error) { value = { __error: error && error.message ? error.message : String(error) }; }
        samples.push({ t: Math.round((performance.now() - begin) * 1000) / 1000, value: value });
        if (untilFn) {
          let matched = false;
          try { matched = !!untilFn(session, payloadArgs); } catch (error) { matched = false; }
          if (matched) { stopReason = 'until'; break; }
        }
        if (duration != null && performance.now() - begin >= duration) { stopReason = 'duration'; break; }
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
      if (samples.length >= max && stopReason === 'maxSamples') { /* 已到上限 */ }
      return { samples: samples, stopReason: stopReason, durationMs: Math.round((performance.now() - begin) * 1000) / 1000, intervalMs: interval };
    }, { expr: expression, readText: readExpression, untilText: untilExpression, payloadArgs: args,
      interval: intervalMs, max: maxSamples, duration: effectiveDuration });
    return payload;
  }

  async function box(selector, optionsValue = {}) {
    const target = normalizeExpression(selector, 'box()');
    return withSession('(() => { const el = document.querySelector(' + JSON.stringify(target) + '); if (!el) return null; ' +
      'const rect = el.getBoundingClientRect(); const style = getComputedStyle(el); ' +
      'return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height, ' +
      'opacity: Number(style.opacity), visibility: style.visibility, display: style.display }; })()', null, optionsValue.session);
  }

  async function screenshot(file, optionsValue = {}) {
    const resolved = path.resolve(String(file || ''));
    if (!file) throw coded('usage', 'screenshot(file) 需要显式输出路径；辅助默认不写文件。');
    if (!path.isAbsolute(String(file))) throw coded('usage', 'screenshot(file) 需要绝对路径。');
    const parent = path.dirname(resolved);
    if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) {
      throw coded('invalid_output', 'screenshot 父目录不存在：' + parent);
    }
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      throw coded('invalid_output', 'screenshot 指向目录：' + resolved);
    }
    try {
      await page.screenshot({ path: resolved, fullPage: optionsValue.fullPage === true });
    } catch (error) {
      throw coded('screenshot_failed', '截图失败：' + (error && error.message ? error.message : String(error)), { cause: error });
    }
    return { path: resolved, bytes: fs.statSync(resolved).size };
  }

  async function element(selector, optionsValue = {}) {
    const targetSelector = normalizeSelector(selector, 'element(selector)');
    const index = normalizeSelectorIndex(optionsValue.index, 'element(selector).index');
    const info = await page.evaluate(({ selectorText, wantedIndex }) => {
      const nodes = Array.from(document.querySelectorAll(selectorText));
      const count = nodes.length;
      if (!count) return { count: 0, index: wantedIndex };
      const chosenIndex = wantedIndex == null ? 0 : wantedIndex;
      if (chosenIndex < 0 || chosenIndex >= count) return { count: count, index: chosenIndex, outOfRange: true };
      const node = nodes[chosenIndex];
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        count: count,
        index: chosenIndex,
        tagName: node.tagName.toLowerCase(),
        box: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
        visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
        opacity: Number(style.opacity),
        text: (node.textContent || '').trim().slice(0, 200)
      };
    }, { selectorText: targetSelector, wantedIndex: index == null ? null : index });
    const pageLabel = label ? ('页面：' + label) : '当前页面';
    if (!info || info.count === 0) {
      throw coded('selector_not_found',
        '--selector 未命中任何元素：' + targetSelector + '（' + pageLabel + '）。下一步：检查 CSS 选择器拼写，或运行 --help 查看 --selector / --selector-index 说明。',
        { selector: targetSelector, count: 0 });
    }
    if (info.outOfRange) {
      throw coded('selector_index_out_of_range',
        '--selector-index 越界：选择器 ' + targetSelector + ' 命中 ' + info.count + ' 个元素，可用下标 0..' + (info.count - 1) +
        '，收到 ' + info.index + '（' + pageLabel + '）。下一步：改用范围内的 --selector-index 或缩小选择器。',
        { selector: targetSelector, count: info.count, index: info.index });
    }
    if (index == null && info.count > 1) {
      throw coded('selector_not_unique',
        '选择器命中 ' + info.count + ' 个元素：' + targetSelector + '（' + pageLabel + '）；默认要求唯一。下一步：缩小选择器，或显式传 --selector-index 0..' +
        (info.count - 1) + '；也可用 --help 查看说明。',
        { selector: targetSelector, count: info.count });
    }
    return { selector: targetSelector, index: info.index, count: info.count, tagName: info.tagName, box: info.box, visible: info.visible, opacity: info.opacity, text: info.text };
  }

  async function screenshotElement(selector, file, optionsValue = {}) {
    const targetSelector = normalizeSelector(selector, 'screenshotElement(selector, file)');
    const resolved = path.resolve(String(file || ''));
    if (!file) throw coded('usage', 'screenshotElement(selector, file) 需要显式输出路径；辅助默认不写文件。');
    if (!path.isAbsolute(String(file))) throw coded('usage', 'screenshotElement(selector, file) 需要绝对路径。');
    const parent = path.dirname(resolved);
    if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) {
      throw coded('invalid_output', 'screenshotElement 父目录不存在：' + parent);
    }
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      throw coded('invalid_output', 'screenshotElement 指向目录：' + resolved);
    }
    const info = await element(selector, optionsValue);
    try {
      await page.locator(targetSelector).nth(info.index).screenshot({ path: resolved });
    } catch (error) {
      throw coded('screenshot_failed', '元素截图失败（' + targetSelector + '）：' + (error && error.message ? error.message : String(error)), { cause: error });
    }
    let bytes = 0;
    try { bytes = fs.statSync(resolved).size; } catch (error) { bytes = 0; }
    return { path: resolved, bytes: bytes, selector: targetSelector, index: info.index, count: info.count, box: info.box, visible: info.visible };
  }

  function observe() {
    if (!observations) return { available: false, note: '未传入 observations；请使用 inspect-note 提供的 contexts。' };
    return {
      available: true,
      pageErrors: observations.pageErrors.slice(),
      consoleErrors: observations.consoleErrors.slice(),
      externalRequests: observations.externalRequests.slice(),
      requestFailures: observations.requestFailures.slice()
    };
  }

  return {
    page: page,
    label: label,
    get expression() { return resolvedExpression; },
    state: state,
    read: read,
    evaluate: evaluate,
    waitIdle: waitIdle,
    waitFor: waitFor,
    start: start,
    step: step,
    sample: sample,
    box: box,
    element: element,
    screenshotElement: screenshotElement,
    screenshot: screenshot,
    observe: observe
  };
}
