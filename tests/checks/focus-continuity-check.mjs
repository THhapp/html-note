#!/usr/bin/env node
/*
 * New-contract checks: Focus continuity/weak lifecycle, session Focus reuse,
 * attention hold timing, and default-stage replayPreviousStep mapping.
 *
 * Loads src directly through tests/lib/src-sources.mjs (no build needed) and
 * drives real Edge. Generated screenshots/logs stay in tests/.cache.
 *
 * Usage: node tests/checks/focus-continuity-check.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleScripts, moduleStyles } from '../lib/src-sources.mjs';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const src = (rel) => path.join(root, rel);
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const CHECK_MODULES = ['core', 'legacy', 'ui-layout', 'blocks-base', 'demo-stage', 'blocks', 'viz-objects', 'viz-mechanisms', 'demo-runtime', 'demo-ui'];
const CHECK_STYLES = moduleStyles(root, CHECK_MODULES);
const CHECK_SCRIPTS = moduleScripts(root, CHECK_MODULES);

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail) });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : ' :: ' + String(detail).slice(0, 400)));
}

const browser = await chromium.launch({ executablePath: edge, headless: true });

async function makePage(options = {}) {
  const context = await browser.newContext({
    viewport: { width: options.width || 1200, height: options.height || 900 },
    reducedMotion: options.reduced ? 'reduce' : 'no-preference'
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push('pageerror: ' + error.message));
  page.on('console', (message) => { if (message.type() === 'error') pageErrors.push('console: ' + message.text()); });
  await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}body{padding:16px;background:#f4f6f9;font-family:sans-serif}#root{max-width:1040px;margin:0 auto}.contract-target{position:fixed;z-index:5;background:#e8eefc;border:1px solid #9db2d6}</style></head><body><main id="root"></main></body></html>');
  for (const rel of CHECK_STYLES) await page.addStyleTag({ path: src(rel) });
  for (const rel of CHECK_SCRIPTS) await page.addScriptTag({ path: src(rel) });
  return { context, page, pageErrors };
}

/* ---------------- 1. Focus component: show/hide + weak/restore/reanchor + symmetric motion ---------------- */
{
  const { context, page, pageErrors } = await makePage({ label: 'focus' });
  const rows = await page.evaluate(async () => {
    const out = [];
    const check = (name, ok, detail) => out.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const raf = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
    function makeTarget(id, left, top, width, height) {
      const node = document.createElement('div');
      node.id = id;
      node.className = 'contract-target';
      node.style.left = left + 'px';
      node.style.top = top + 'px';
      node.style.width = width + 'px';
      node.style.height = height + 'px';
      node.textContent = id;
      document.body.appendChild(node);
      return node;
    }
    function rectOf(node) {
      const r = node.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    }
    function boxOf(focus) {
      const box = focus.el.querySelector('.nx-focus__box');
      if (!box) return null;
      const r = box.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height, node: box };
    }
    function near(value, expected, tolerance) { return Math.abs(value - expected) <= tolerance; }
    function corners(r) {
      return [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]];
    }
    function maxCornerDistance(a, b) {
      const ca = corners(a);
      const cb = corners(b);
      let max = 0;
      for (let i = 0; i < 4; i += 1) {
        const dx = ca[i][0] - cb[i][0];
        const dy = ca[i][1] - cb[i][1];
        max = Math.max(max, Math.sqrt(dx * dx + dy * dy));
      }
      return max;
    }
    function runningAnimations(node) {
      return node.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length;
    }
    function emphasisOf(focus) { return focus.emphasis || (focus.view && focus.view.emphasis) || ''; }
    function visibleOf(focus) { return focus.visible === true || (focus.view && focus.view.visible === true); }

    if (!window.NoteExpr || !window.NoteExpr.Focus) {
      check('Focus 组件可用', false, 'NoteExpr.Focus 缺失');
      return out;
    }

    const t1 = makeTarget('t1', 80, 80, 80, 40);
    const t2 = makeTarget('t2', 520, 360, 140, 70);
    const focus = NoteExpr.Focus.mount();
    focus.show(t1);
    await focus.whenArrived();
    const g1 = boxOf(focus);
    check('Focus show 后 active 且框对准目标', emphasisOf(focus) === 'active' && !!g1 &&
      near(g1.left, rectOf(t1).left - 6, 2) && near(g1.width, rectOf(t1).width + 12, 2),
      JSON.stringify({ emphasis: emphasisOf(focus), box: g1 && { left: g1.left, width: g1.width } }));
    const boxNode = g1 && g1.node;

    focus.weak();
    check('Focus weak 后 emphasis/DOM 标记为 weak', emphasisOf(focus) === 'weak' &&
      focus.el.getAttribute('data-nx-emphasis') === 'weak' && visibleOf(focus),
      JSON.stringify({ emphasis: emphasisOf(focus), attr: focus.el.getAttribute('data-nx-emphasis'), visible: visibleOf(focus) }));
    const weakStart = boxOf(focus);
    await sleep(240);
    const weakEnd = boxOf(focus);
    check('Focus weak 静止期几何不变且无运行中动画', !!weakStart && !!weakEnd &&
      near(weakStart.left, weakEnd.left, 0.8) && near(weakStart.top, weakEnd.top, 0.8) &&
      near(weakStart.width, weakEnd.width, 0.8) && runningAnimations(focus.el) === 0,
      JSON.stringify({ start: weakStart && { left: weakStart.left, width: weakStart.width }, end: weakEnd && { left: weakEnd.left, width: weakEnd.width }, running: runningAnimations(focus.el) }));
    check('Focus weak 后框节点身份不变', !!(weakEnd && weakEnd.node) && weakEnd.node === boxNode);

    focus.restore();
    const restored = boxOf(focus);
    check('Focus restore 回 active 且不改变几何', emphasisOf(focus) === 'active' &&
      focus.el.getAttribute('data-nx-emphasis') === 'active' && !!restored &&
      near(restored.left, weakEnd.left, 0.8) && near(restored.top, weakEnd.top, 0.8) &&
      near(restored.width, weakEnd.width, 0.8),
      JSON.stringify({ emphasis: emphasisOf(focus), restored: restored && { left: restored.left, top: restored.top } }));

    const arrivedAgain = await Promise.race([focus.whenArrived().then((value) => 'resolved:' + value), sleep(400).then(() => 'timeout')]);
    const sameTargetBox = boxOf(focus);
    check('Focus active 时同目标 show 不重播', arrivedAgain !== 'timeout' && !!sameTargetBox &&
      sameTargetBox.node === boxNode && near(sameTargetBox.left, restored.left, 0.8),
      JSON.stringify({ arrivedAgain, nodeSame: !!sameTargetBox && sameTargetBox.node === boxNode }));

    const migrationPromise = focus.show(t2);
    await sleep(70);
    focus.weak();
    const weakMigrateArrival = await Promise.race([focus.whenArrived().then((value) => 'resolved:' + value), sleep(800).then(() => 'timeout')]);
    await sleep(60);
    const weakMigrateBox = boxOf(focus);
    const t2Rect = rectOf(t2);
    check('Focus 迁移中 weak 取消迁移并落到当前目标', weakMigrateArrival.startsWith('resolved:true') &&
      emphasisOf(focus) === 'weak' && !!weakMigrateBox &&
      near(weakMigrateBox.left, t2Rect.left - 6, 3) && near(weakMigrateBox.top, t2Rect.top - 6, 3),
      JSON.stringify({ weakMigrateArrival, box: weakMigrateBox && { left: weakMigrateBox.left, top: weakMigrateBox.top }, target: { left: t2Rect.left - 6, top: t2Rect.top - 6 } }));
    const weakMigrateStart = boxOf(focus);
    await sleep(180);
    const weakMigrateEnd = boxOf(focus);
    check('Focus weak 取消后不再移动', !!weakMigrateStart && !!weakMigrateEnd &&
      near(weakMigrateStart.left, weakMigrateEnd.left, 0.8) && near(weakMigrateStart.top, weakMigrateEnd.top, 0.8) &&
      runningAnimations(focus.el) === 0);
    focus.restore();
    focus.hide();
    await focus.whenHidden();
    focus.destroy();

    const t3 = makeTarget('t3', 120, 220, 100, 50);
    const reFocus = NoteExpr.Focus.mount();
    reFocus.show(t3);
    await reFocus.whenArrived();
    reFocus.weak();
    const t3b = makeTarget('t3b', 320, 300, 160, 80);
    t3.remove();
    reFocus.reanchor(t3b);
    const reBox = boxOf(reFocus);
    const t3bRect = rectOf(t3b);
    check('Focus reanchor 静默重测新目标并保留 weak', emphasisOf(reFocus) === 'weak' && visibleOf(reFocus) && !!reBox &&
      near(reBox.left, t3bRect.left - 6, 3) && near(reBox.width, t3bRect.width + 12, 3),
      JSON.stringify({ emphasis: emphasisOf(reFocus), box: reBox && { left: reBox.left, width: reBox.width }, target: { left: t3bRect.left - 6, width: t3bRect.width + 12 } }));
    reFocus.destroy();

    const reFocus2 = NoteExpr.Focus.mount();
    try {
      reFocus2.reanchor();
      check('Focus reanchor 无目标时报错', false, '未抛错');
    } catch (error) {
      check('Focus reanchor 无目标时报错', /NoteExpr\.Focus/.test(String(error.message)) && /reanchor/.test(String(error.message)), String(error.message));
    }
    const detached = document.createElement('div');
    try {
      reFocus2.reanchor(detached);
      check('Focus reanchor 未插入文档的目标时报错', false, '未抛错');
    } catch (error) {
      check('Focus reanchor 未插入文档的目标时报错', /NoteExpr\.Focus/.test(String(error.message)) && /文档/.test(String(error.message)), String(error.message));
    }
    reFocus2.destroy();

    const t4 = makeTarget('t4', 60, 420, 60, 30);
    const t5 = makeTarget('t5', 700, 420, 60, 30);
    const motionFocus = NoteExpr.Focus.mount();
    motionFocus.show(t4);
    await motionFocus.whenArrived();
    const moveStart = performance.now();
    motionFocus.show(t5);
    await motionFocus.whenArrived();
    const moveElapsed = performance.now() - moveStart;
    const paddedA = { left: rectOf(t4).left - 6, top: rectOf(t4).top - 6, right: rectOf(t4).right + 6, bottom: rectOf(t4).bottom + 6 };
    const paddedB = { left: rectOf(t5).left - 6, top: rectOf(t5).top - 6, right: rectOf(t5).right + 6, bottom: rectOf(t5).bottom + 6 };
    const distance = maxCornerDistance(paddedA, paddedB);
    // T5 最终参数：accelDefault 4600，迁移时长夹 [180,800]ms。
    const expectedMs = Math.min(800, Math.max(180, 2 * Math.sqrt(distance / 4600) * 1000));
    check('Focus 对称迁移时长符合 2*sqrt(D/accel)', Math.abs(moveElapsed - expectedMs) <= Math.max(160, expectedMs * 0.3),
      JSON.stringify({ elapsed: Math.round(moveElapsed), expected: Math.round(expectedMs), distance: Math.round(distance) }));
    motionFocus.destroy();

    const slowT = makeTarget('slow-t', 720, 120, 80, 40);
    const quickFocus = NoteExpr.Focus.mount({ accel: 10400 });
    const slowFocus = NoteExpr.Focus.mount({ accel: 1300 });
    slowFocus.show(t4);
    await slowFocus.whenArrived();
    quickFocus.show(t4);
    await quickFocus.whenArrived();
    const quickStart = performance.now();
    quickFocus.show(slowT);
    await quickFocus.whenArrived();
    const quickElapsed = performance.now() - quickStart;
    const slowStart = performance.now();
    slowFocus.show(slowT);
    await slowFocus.whenArrived();
    const slowElapsed = performance.now() - slowStart;
    check('Focus accel 选项影响时长', slowElapsed - quickElapsed > 220,
      JSON.stringify({ quickElapsed: Math.round(quickElapsed), slowElapsed: Math.round(slowElapsed) }));
    quickFocus.destroy();
    slowFocus.destroy();

    const moveTarget = makeTarget('move-target', 100, 640, 60, 30);
    const followFocus = NoteExpr.Focus.mount();
    followFocus.show(t4);
    await followFocus.whenArrived();
    const followBoxNode = boxOf(followFocus).node;
    followFocus.show(moveTarget);
    const followPromise = followFocus.whenArrived();
    const followSamples = [];
    let rafId = 0;
    const sampleTick = () => {
      const box = boxOf(followFocus);
      if (box) followSamples.push({ t: performance.now(), left: box.left });
      rafId = requestAnimationFrame(sampleTick);
    };
    rafId = requestAnimationFrame(sampleTick);
    await sleep(120);
    moveTarget.style.left = '420px';
    moveTarget.style.width = '180px';
    await followPromise;
    cancelAnimationFrame(rafId);
    followFocus.reanchor(moveTarget);
    const followTarget = rectOf(moveTarget);
    const followDeadline = performance.now() + 1500;
    let followEnd = boxOf(followFocus);
    while (performance.now() < followDeadline) {
      followEnd = boxOf(followFocus);
      if (followEnd && Math.abs(followEnd.left - (followTarget.left - 6)) <= 3) break;
      await sleep(50);
    }
    const finalRect = rectOf(moveTarget);
    const startLeft = followSamples.length ? followSamples[0].left : -1;
    const movedSamples = followSamples.filter((sample) => sample.left > startLeft + 5);
    const followNear = !!followEnd && near(followEnd.left, finalRect.left - 6, 4);
    check('Focus 迁移中目标移动被跟随且框节点不重建', !!followEnd && followEnd.node === followBoxNode &&
      followNear && movedSamples.length > 0,
      JSON.stringify({ nodeSame: !!followEnd && followEnd.node === followBoxNode, followNear, end: followEnd && followEnd.left, target: finalRect.left - 6, samples: followSamples.length, moved: movedSamples.length, startLeft }));
    followFocus.destroy();

    const lastFocus = NoteExpr.Focus.mount();
    lastFocus.show(t3b);
    await lastFocus.whenArrived();
    lastFocus.hide();
    const hiddenValue = await lastFocus.whenHidden();
    check('Focus hide/whenHidden 旧语义保持', hiddenValue === true && !document.querySelector('.nx-focus[data-nx-state="shown"]'), JSON.stringify({ hiddenValue }));
    lastFocus.destroy();
    check('Focus destroy 后无残留', !document.querySelector('.nx-focus'));
    for (const node of [t1, t2, t3b, t4, t5, slowT, moveTarget]) node.remove();
    return out;
  });
  for (const row of rows) check(row.name, row.ok, row.detail);
  check('Focus 区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  await context.close();
}

/* ---------------- 2. 会话 Focus：attention 停点间复用、weak 静止、正常 next 恢复迁移 ---------------- */
{
  const { context, page, pageErrors } = await makePage({ label: 'session-focus' });
  const rows = await page.evaluate(async () => {
    const out = [];
    const check = (name, ok, detail) => out.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const until = async (predicate, timeoutMs, label) => {
      const deadline = performance.now() + (timeoutMs || 4000);
      while (performance.now() < deadline) {
        if (predicate()) return true;
        await sleep(24);
      }
      check(label || 'until', false, 'timeout');
      return false;
    };
    const rootEl = document.getElementById('root');
    rootEl.replaceChildren();
    const host = document.createElement('div');
    rootEl.appendChild(host);
    function layout(container) {
      const wrap = document.createElement('div');
      const main = document.createElement('div');
      const a = document.createElement('div');
      const b = document.createElement('div');
      wrap.appendChild(main);
      main.appendChild(a);
      main.appendChild(b);
      container.appendChild(wrap);
      return { root: wrap, slots: { main: main, a: a, b: b } };
    }
    const compiled = NoteDemo.compile({
      bindings: { a: { adapter: 'dom', slot: 'a' }, b: { adapter: 'dom', slot: 'b' } },
      initial: { id: 'f0', caption: '0', views: { a: { text: 'A0' }, b: { text: 'B0' } } },
      steps: [
        { id: 'f1', caption: '1', replace: { a: { text: 'A1' } },
          scene: { bindings: [{ binding: 'a' }] },
          attention: { stepDuration: 70, targets: [{ binding: 'a', query: { part: 'value' } }, { binding: 'b', query: { part: 'root' } }] } },
        { id: 'f2', caption: '2', replace: { a: { text: 'A2' } },
          scene: { bindings: [{ binding: 'a' }] },
          attention: { stepDuration: 70, targets: [{ binding: 'a', query: { part: 'value' } }] } },
        { id: 'f3', caption: '3', replace: { a: { text: 'A3' } },
          scene: { bindings: [{ binding: 'a' }] } },
        { id: 'f4', caption: '4', replace: { a: { text: 'A4' } },
          scene: { bindings: [{ binding: 'a' }] },
          attention: { stepDuration: 70, targets: [{ binding: 'a', query: { part: 'value' } }] } }
      ]
    });
    window.__rafCalls = 0;
    const nativeRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = function (callback) { window.__rafCalls += 1; return nativeRaf(callback); };
    let session = null;
    try {
      session = NoteDemo.mount(host, { definition: compiled, layout: layout, label: '会话 Focus 契约' });
    } catch (error) {
      check('会话 Focus：默认舞台可挂载', false, error && error.message);
      return out;
    }
    check('会话 Focus：默认舞台可挂载', !!session && session.getState().phase === 'idle' && session.getState().settledFrameId === 'f0');
    const sessionStates = [];
    session.subscribe((state) => sessionStates.push({ phase: state.phase, settledFrameId: state.settledFrameId, replaying: state.replaying }));
    const focusShown = () => Array.from(document.querySelectorAll('.nx-focus[data-nx-state="shown"]'));
    const focusRoots = () => Array.from(document.querySelectorAll('.nx-focus'));
    const focusEmphasis = () => {
      const roots = focusShown();
      if (!roots.length) return '';
      return roots[0].getAttribute('data-nx-emphasis') || '';
    };
    const focusBox = () => {
      const box = document.querySelector('.nx-focus__box');
      if (!box) return null;
      const rect = box.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, node: box };
    };
    const runningFocusAnimations = () => focusRoots().reduce((count, root) => count + root.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length, 0);

    const first = await session.next();
    check('会话 Focus：第一个 attention 停点完成', first.status === 'completed' && session.getState().settledFrameId === 'f1', JSON.stringify(first));
    await until(() => focusShown().length === 1, 2000, '会话 Focus：attention 后出现焦点');
    const firstRoot = focusRoots()[0] || null;
    check('会话 Focus：settle 后焦点保留且 emphasis=weak', !!firstRoot && focusEmphasis() === 'weak',
      JSON.stringify({ roots: focusRoots().length, shown: focusShown().length, emphasis: focusEmphasis() }));
    const settleBox = focusBox();
    const rafAtSettle = window.__rafCalls;
    await sleep(320);
    const settleBox2 = focusBox();
    const idleRaf = window.__rafCalls - rafAtSettle;
    check('会话 Focus：weak 静止期几何不变', !!settleBox && !!settleBox2 &&
      Math.abs(settleBox.left - settleBox2.left) <= 0.8 && Math.abs(settleBox.top - settleBox2.top) <= 0.8 && Math.abs(settleBox.width - settleBox2.width) <= 0.8,
      JSON.stringify({ a: settleBox, b: settleBox2 }));
    check('会话 Focus：weak 静止期无常驻 rAF / 运行中动画', idleRaf <= 8 && runningFocusAnimations() === 0,
      JSON.stringify({ idleRaf, running: runningFocusAnimations() }));
    const boxNode = settleBox && settleBox.node;

    const second = session.next();
    await sleep(40);
    check('会话 Focus：正常 next 从 weak 恢复为 active 并迁移', focusEmphasis() === 'active', JSON.stringify({ emphasis: focusEmphasis() }));
    const secondResult = await second;
    await until(() => focusEmphasis() === 'weak', 2000, '会话 Focus：第二个 attention 停点回 weak');
    const secondRoot = focusRoots()[0] || null;
    const secondBox = focusBox();
    check('会话 Focus：连续 attention 停点复用同一焦点根', secondResult.status === 'completed' &&
      !!firstRoot && secondRoot === firstRoot && !!boxNode && !!secondBox && secondBox.node === boxNode,
      JSON.stringify({ sameRoot: secondRoot === firstRoot, sameBox: !!secondBox && secondBox.node === boxNode, emphasis: focusEmphasis() }));

    sessionStates.length = 0;
    const replayResult = await session.replay();
    await sleep(80);
    const sawReplaying = sessionStates.some((state) => state.phase === 'running' && state.replaying === true);
    check('会话 Focus：重看 attention 步骤后重新建立可见 weak 焦点', replayResult.status === 'completed' && sawReplaying &&
      focusShown().length === 1 && focusEmphasis() === 'weak',
      JSON.stringify({ replay: replayResult.status, sawReplaying, shown: focusShown().length, emphasis: focusEmphasis() }));

    const thirdResult = await session.next();
    await sleep(120);
    check('会话 Focus：无 attention 停点保留可解析目标的弱线索', thirdResult.status === 'completed' &&
      session.getState().settledFrameId === 'f3' && focusShown().length === 1 && focusEmphasis() === 'weak',
      JSON.stringify({ settled: session.getState().settledFrameId, shown: focusShown().length, emphasis: focusEmphasis() }));

    const cancelRun = session.next();
    await sleep(30);
    const cancelPrev = await session.prev();
    const cancelResult = await cancelRun;
    await sleep(240);
    check('会话 Focus：运行中取消后隐藏焦点并清引用', cancelPrev.status === 'completed' && cancelResult.status === 'cancelled' &&
      session.getState().settledFrameId === 'f3' && focusShown().length === 0,
      JSON.stringify({ cancelPrev: cancelPrev.status, run: cancelResult.status, settled: session.getState().settledFrameId, shown: focusShown().length }));

    session.reset();
    await sleep(120);
    check('会话 Focus：reset 后隐藏焦点', session.getState().settledFrameId === 'f0' && focusShown().length === 0,
      JSON.stringify({ settled: session.getState().settledFrameId, shown: focusShown().length }));
    session.destroy();
    check('会话 Focus：teardown 后无焦点残留', focusRoots().length === 0 && document.querySelectorAll('.nblk-demo-stage').length === 0);
    return out;
  });
  for (const row of rows) check(row.name, row.ok, row.detail);
  check('会话 Focus 区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  await context.close();
}

/* ---------------- 3. attention 零额外停留与内容及时性（F/C） ---------------- */
{
  const { context, page, pageErrors } = await makePage({ label: 'attention-timing' });
  const rows = await page.evaluate(async () => {
    const out = [];
    const check = (name, ok, detail) => out.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    function layout(container) {
      const wrap = document.createElement('div');
      const main = document.createElement('div');
      const a = document.createElement('div');
      wrap.appendChild(main);
      main.appendChild(a);
      container.appendChild(wrap);
      return { root: wrap, slots: { main: main, a: a } };
    }
    // 记录 Focus 到达（whenArrived 结算）与目标内容动画的真实启动时刻。
    if (!window.__focusArrivalProbeInstalled) {
      window.__focusArrivalProbeInstalled = true;
      window.__focusArrivals = [];
      window.__animStarts = [];
      const originalMount = NoteExpr.Focus.mount;
      NoteExpr.Focus.mount = function (options) {
        const view = originalMount.call(NoteExpr.Focus, options);
        const originalWhenArrived = view.whenArrived;
        view.whenArrived = function () {
          const promise = originalWhenArrived.call(view);
          try { Promise.resolve(promise).then(() => { window.__focusArrivals.push(performance.now()); }); } catch (error) { /* ignore */ }
          return promise;
        };
        return view;
      };
      const nativeAnimate = Element.prototype.animate;
      Element.prototype.animate = function (keyframes, options) {
        let classes = '';
        if (typeof this.className === 'string') classes = this.className;
        else if (this.className && typeof this.className.baseVal === 'string') classes = this.className.baseVal;
        const list = Array.isArray(keyframes) ? keyframes : [keyframes];
        const startsHidden = list.some((frame) => frame && (String(frame.opacity) === '0' || String(frame.opacity) === '0.0'));
        const record = { at: performance.now(), classes: classes, startsHidden: startsHidden, runningAt: -1 };
        window.__animStarts.push(record);
        const animation = nativeAnimate.call(this, keyframes, options);
        // 受门控的动画先 pause，放行后才 play；记录首次真正 running 的时刻。
        const watchRunning = () => {
          if (record.runningAt >= 0) return;
          if (animation.playState === 'running') { record.runningAt = performance.now(); return; }
          if (animation.playState === 'finished' || animation.playState === 'idle' || animation.playState === 'canceled') return;
          requestAnimationFrame(watchRunning);
        };
        requestAnimationFrame(watchRunning);
        return animation;
      };
    }
    async function runOnce(firstHoldDuration) {
      const host = document.createElement('div');
      document.getElementById('root').appendChild(host);
      const firstTarget = { binding: 'a', query: { part: 'value' }, groups: [] };
      if (firstHoldDuration !== undefined) firstTarget.holdDuration = firstHoldDuration;
      const compiled = NoteDemo.compile({
        bindings: { a: { adapter: 'dom', slot: 'a' } },
        initial: { id: 'f0', caption: '0', views: { a: { text: 'A0' } } },
        steps: [{ id: 'f1', caption: '1', replace: { a: { text: 'A1' } },
          scene: { bindings: [{ binding: 'a' }] },
          attention: { stepDuration: 60, targets: [firstTarget, { binding: 'a', query: { part: 'value' } }] } }]
      });
      const arrangement = document.querySelector('#root > div:last-child');
      const startedAt = performance.now();
      const arrivalBase = window.__focusArrivals.length;
      const animBase = window.__animStarts.length;
      const session = NoteDemo.mount(host, { definition: compiled, layout: layout, label: 'timing' });
      const result = await session.next();
      const elapsed = performance.now() - startedAt;
      const arrivals = window.__focusArrivals.slice(arrivalBase);
      const anims = window.__animStarts.slice(animBase);
      const revealStart = anims.filter((item) => item.classes.indexOf('note-demo-dom__value') >= 0 && item.startsHidden && item.runningAt > 0).map((item) => item.runningAt)[0];
      session.destroy();
      host.remove();
      return { result: result, elapsed: elapsed, arrivals: arrivals, revealStart: revealStart };
    }
    const zero = await runOnce(0);
    const held = await runOnce(600);
    const zeroInterval = zero.arrivals.length >= 2 ? zero.arrivals[1] - zero.arrivals[0] : -1;
    const heldInterval = held.arrivals.length >= 2 ? held.arrivals[1] - held.arrivals[0] : -1;
    check('attention 观察目标零停留：两次到达间隔很小', zero.result.status === 'completed' && zero.arrivals.length >= 2 &&
      zeroInterval >= 0 && zeroInterval <= 260,
      JSON.stringify({ arrivals: zero.arrivals.map((value) => Math.round(value)), interval: Math.round(zeroInterval) }));
    check('attention 非最后观察目标显式 holdDuration 形成额外停留', held.result.status === 'completed' && held.arrivals.length >= 2 &&
      heldInterval - zeroInterval >= 420,
      JSON.stringify({ zeroInterval: Math.round(zeroInterval), heldInterval: Math.round(heldInterval), elapsed: [Math.round(zero.elapsed), Math.round(held.elapsed)] }));
    check('attention 内容在最后一次到达后才开始动画', zero.arrivals.length >= 2 && !!zero.revealStart &&
      zero.revealStart >= zero.arrivals[zero.arrivals.length - 1] - 32 && zero.revealStart <= zero.arrivals[zero.arrivals.length - 1] + 120,
      JSON.stringify({ lastArrival: Math.round(zero.arrivals[zero.arrivals.length - 1] || -1), revealStart: Math.round(zero.revealStart || -1) }));
    check('attention 显式停留结束后内容才启动', held.arrivals.length >= 2 && !!held.revealStart &&
      held.revealStart >= held.arrivals[held.arrivals.length - 1] - 32,
      JSON.stringify({ lastArrival: Math.round(held.arrivals[held.arrivals.length - 1] || -1), revealStart: Math.round(held.revealStart || -1) }));
    return out;
  });
  for (const row of rows) check(row.name, row.ok, row.detail);
  check('attention 时序区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  await context.close();
}

/* ---------------- 4. 默认舞台导航：上一步=replayPreviousStep，重看=replay，重来=reset ---------------- */
{
  const { context, page, pageErrors } = await makePage({ label: 'stage-nav' });
  const rows = await page.evaluate(async () => {
    const out = [];
    const check = (name, ok, detail) => out.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitIdle = async (session, timeoutMs) => {
      const deadline = performance.now() + (timeoutMs || 6000);
      while (performance.now() < deadline) {
        if (session.getState().phase === 'idle') return true;
        await sleep(24);
      }
      return false;
    };
    const rootEl = document.getElementById('root');
    rootEl.replaceChildren();
    const host = document.createElement('div');
    rootEl.appendChild(host);
    function layout(container) {
      const wrap = document.createElement('div');
      const main = document.createElement('div');
      const a = document.createElement('div');
      const b = document.createElement('div');
      wrap.appendChild(main);
      main.appendChild(a);
      main.appendChild(b);
      container.appendChild(wrap);
      return { root: wrap, slots: { main: main, a: a, b: b } };
    }
    // 用可执行动作的计数器 Adapter，避免普通 scene update 的布局参与约束。
    function makeCounterAdapter(delayMs) {
      return {
        name: 'counter',
        normalizeView(input) {
          const source = input && typeof input === 'object' ? input : {};
          return { model: { value: Number(source.value) || 0 }, cues: {} };
        },
        validateAction(action) { if (action.type !== 'add') throw new Error('counter 只支持 add'); },
        mount(mountHost) {
          const node = document.createElement('div');
          node.className = 'contract-counter';
          mountHost.appendChild(node);
          let value = 0;
          let timer = 0;
          return {
            restore(view) { value = view.model.value; node.textContent = String(value); },
            readView() { return { model: { value: value }, cues: {} }; },
            perform(action) {
              let resolveFinished;
              const finished = new Promise((resolve) => { resolveFinished = resolve; });
              const delay = action.params && Number.isFinite(action.params.delay) ? action.params.delay : delayMs;
              timer = setTimeout(() => {
                value += action.params && Number.isFinite(action.params.step) ? action.params.step : 1;
                node.textContent = String(value);
                resolveFinished({ status: 'completed' });
              }, delay);
              return { finished, cancel() { clearTimeout(timer); resolveFinished({ status: 'cancelled' }); } };
            },
            target(query) { return query && query.part === 'root' ? node : null; },
            destroy() { clearTimeout(timer); node.remove(); }
          };
        }
      };
    }
    const definition = {
      bindings: { c: { adapter: 'counter', slot: 'main' } },
      frames: [
        { id: 'f0', caption: '0', views: { c: { value: 0 } }, marks: [] },
        { id: 'f1', caption: '1', views: { c: { value: 1 } }, marks: [] },
        { id: 'f2', caption: '2', views: { c: { value: 2 } }, marks: [] },
        { id: 'f3', caption: '3', views: { c: { value: 3 } }, marks: [] }
      ],
      transitions: [
        { from: 'f0', to: 'f1', actions: [{ binding: 'c', type: 'add', params: { step: 1, delay: 90 } }] },
        { from: 'f1', to: 'f2', actions: [{ binding: 'c', type: 'add', params: { step: 1, delay: 90 } }] },
        { from: 'f2', to: 'f3', actions: [{ binding: 'c', type: 'add', params: { step: 1, delay: 600 } }] }
      ]
    };
    const states = [];
    let session = null;
    try {
      session = NoteDemo.mount(host, { definition: definition, adapters: { counter: makeCounterAdapter(90) }, layout: layout, label: '导航映射契约' });
    } catch (error) {
      check('默认舞台导航：可挂载', false, error && error.message);
      return out;
    }
    session.subscribe((state) => states.push({ phase: state.phase, settledFrameId: state.settledFrameId, replaying: state.replaying }));
    const button = (label) => Array.from(session.el.querySelectorAll('.nblk-demo-stage__controls button')).find((node) => node.textContent.trim() === label);
    check('默认舞台导航：初始按钮可用条件不变', button('上一步').disabled && button('重看').disabled && !button('下一步').disabled);

    await session.next();
    await session.next();
    check('默认舞台导航：到达 f2', session.getState().settledFrameId === 'f2' && session.getState().phase === 'idle');
    states.length = 0;
    button('上一步').click();
    await waitIdle(session);
    const sawReplayFromSource = states.some((state) => state.phase === 'running' && state.replaying === true && state.settledFrameId === 'f0');
    check('默认舞台导航：上一步从被取消步骤来源重播并回到上一步停点', sawReplayFromSource &&
      session.getState().settledFrameId === 'f1' && session.getState().phase === 'idle',
      JSON.stringify({ sawReplayFromSource, final: session.getState().settledFrameId, states: states.slice(-4) }));

    states.length = 0;
    button('重看').click();
    await waitIdle(session);
    const sawReplayCurrent = states.some((state) => state.phase === 'running' && state.replaying === true && state.settledFrameId === 'f0');
    check('默认舞台导航：重看仍重播当前步骤', sawReplayCurrent && session.getState().settledFrameId === 'f1' && session.getState().phase === 'idle',
      JSON.stringify({ sawReplayCurrent, final: session.getState().settledFrameId }));

    button('重来').click();
    await waitIdle(session);
    check('默认舞台导航：重来回到初始停点', session.getState().settledFrameId === 'f0' && session.getState().phase === 'idle',
      JSON.stringify({ settled: session.getState().settledFrameId }));

    await session.next();
    await session.next();
    const originPrev = await session.prev();
    check('默认舞台导航：session.prev 保持原点恢复语义', originPrev.status === 'completed' && originPrev.frameId === 'f1' &&
      session.getState().settledFrameId === 'f1' && !originPrev.replaying,
      JSON.stringify({ result: originPrev }));

    await session.next();
    const slowRun = session.next();
    await sleep(80);
    states.length = 0;
    button('上一步').click();
    const slowResult = await slowRun;
    await waitIdle(session);
    const sawCancelReplay = states.some((state) => state.phase === 'running' && state.replaying === true);
    check('默认舞台导航：运行中上一步先取消旧运行再重播来源步骤', slowResult.status === 'cancelled' &&
      session.getState().settledFrameId === 'f2' && session.getState().phase === 'idle' && sawCancelReplay,
      JSON.stringify({ slowResult: slowResult.status, settled: session.getState().settledFrameId, sawCancelReplay, states: states.slice(-4) }));
    session.destroy();
    return out;
  });
  for (const row of rows) check(row.name, row.ok, row.detail);
  check('默认舞台导航区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  await context.close();
}

/* ---------------- 5. 减少动效下的 attention：不迁移、直接终态 ---------------- */
{
  const { context, page, pageErrors } = await makePage({ label: 'attention-reduced', reduced: true });
  const rows = await page.evaluate(async () => {
    const out = [];
    const check = (name, ok, detail) => out.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    function layout(container) {
      const wrap = document.createElement('div');
      const main = document.createElement('div');
      const a = document.createElement('div');
      wrap.appendChild(main);
      main.appendChild(a);
      container.appendChild(wrap);
      return { root: wrap, slots: { main: main, a: a } };
    }
    const host = document.createElement('div');
    document.getElementById('root').appendChild(host);
    const compiled = NoteDemo.compile({
      bindings: { a: { adapter: 'dom', slot: 'a' } },
      initial: { id: 'f0', caption: '0', views: { a: { text: 'A0' } } },
      steps: [{ id: 'f1', caption: '1', replace: { a: { text: 'A1' } },
        scene: { bindings: [{ binding: 'a' }] },
        attention: { stepDuration: 500, targets: [{ binding: 'a', query: { part: 'value' } }] } }]
    });
    const startedAt = performance.now();
    const session = NoteDemo.mount(host, { definition: compiled, layout: layout, label: 'reduced' });
    const result = await session.next();
    const elapsed = performance.now() - startedAt;
    await sleep(120);
    const shown = Array.from(document.querySelectorAll('.nx-focus[data-nx-state="shown"]'));
    const running = shown.reduce((count, root) => count + root.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length, 0);
    check('减少动效：attention 步骤快速完成且不迁移', result.status === 'completed' && elapsed < 1200 &&
      session.getState().settledFrameId === 'f1',
      JSON.stringify({ status: result.status, elapsed: Math.round(elapsed), settled: session.getState().settledFrameId }));
    // T2 契约：reduced 下不建/不保留会话 Focus（不迁移、不等待），settle 后 shown=0 且无运行中动画。
    check('减少动效：不建会话 Focus 且无运行中动画', running === 0 && shown.length === 0,
      JSON.stringify({ running, shown: shown.length }));
    session.destroy();
    return out;
  });
  for (const row of rows) check(row.name, row.ok, row.detail);
  check('减少动效区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  await context.close();
}


/* ---------------- 6. 同一元素换 range：实际迁移、抖动不迁移、几何不变不重播 ---------------- */
{
  const { context, page, pageErrors } = await makePage({ label: 'focus-range-change' });
  const rows = await page.evaluate(async () => {
    const out = [];
    const check = (name, ok, detail) => out.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const raf = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const target = document.createElement('div');
    target.className = 'contract-target';
    target.style.cssText = 'left:260px;top:180px;width:120px;height:48px';
    target.textContent = 'range-target';
    document.body.appendChild(target);
    const rectOf = (el) => el.getBoundingClientRect();
    // 用一个可变几何提供者模拟同一元素换 range：local / union / 微小抖动。
    let mode = 'local';
    const geometry = {
      rect: function (element) {
        const r = rectOf(element);
        const box = { left: r.left, top: r.top, width: r.width, height: r.height };
        if (mode === 'local') return { left: box.left - 20, top: box.top - 20, width: box.width + 40, height: box.height + 40, right: box.left + box.width + 20, bottom: box.top + box.height + 20 };
        const union = { left: box.left - 120, top: box.top - 80, width: box.width + 240, height: box.height + 160 };
        if (mode === 'jitter') return { left: union.left + 1.5, top: union.top + 1.5, width: union.width - 3, height: union.height - 3, right: union.left + union.width - 1.5, bottom: union.top + union.height - 1.5 };
        if (mode === 'wide') return { left: union.left - 160, top: union.top - 100, width: union.width + 240, height: union.height + 160, right: union.left + union.width + 80, bottom: union.top + union.height + 60 };
        if (mode === 'wide2') return { left: union.left - 220, top: union.top - 60, width: union.width + 180, height: union.height + 120, right: union.left + union.width + 40, bottom: union.top + union.height + 60 };
        return { left: union.left, top: union.top, width: union.width, height: union.height, right: union.left + union.width, bottom: union.top + union.height };
      }
    };
    const focus = NoteExpr.Focus.mount({ geometry: geometry });
    const boxEl = () => focus.el.querySelector('.nx-focus__box');
    const boxOf = () => { const node = boxEl(); if (!node) return null; const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, node: node }; };
    const sameBox = (a, b, tolerance) => !!a && !!b && Math.abs(a.left - b.left) <= tolerance && Math.abs(a.top - b.top) <= tolerance && Math.abs(a.width - b.width) <= tolerance;
    focus.show({ el: target, geometry: geometry });
    await focus.whenArrived();
    const localBox = boxOf();
    const focusRoot = focus.el;
    mode = 'union';
    // reanchor 保持静默重绑定；同一元素换 range 走 show → 正常框迁移。
    focus.show({ el: target, geometry: geometry });
    const samples = [];
    const watch = async (durationMs) => {
      const deadline = performance.now() + durationMs;
      while (performance.now() < deadline) {
        const box = boxOf();
        if (box) samples.push({ at: performance.now(), left: box.left, top: box.top, width: box.width, height: box.height, node: box.node });
        await raf();
      }
    };
    await watch(1300);
    const unionTail = samples.slice(-3);
    const unionBox = unionTail.length ? unionTail[unionTail.length - 1] : null;
    const intermediate = samples.filter((sample) => !sameBox(sample, localBox, 2) && !sameBox(sample, unionBox, 2));
    const nodeStable = !!unionBox && !!localBox && unionBox.node === localBox.node && unionBox.node === boxEl();
    check('Focus 同一元素换 range：存在可观察的迁移中间帧（非瞬切）', intermediate.length >= 3 && nodeStable,
      JSON.stringify({ intermediate: intermediate.length, samples: samples.length, nodeStable }));
    check('Focus 同一元素换 range：最终落在新范围', !!unionBox && sameBox(unionBox, boxOf(), 2) && unionBox.width > localBox.width + 40,
      JSON.stringify({ local: localBox && { left: localBox.left, width: localBox.width }, union: unionBox && { left: unionBox.left, width: unionBox.width } }));
    // 迁移途中再次换 range：不得跳变，最终落到新范围。
    mode = 'wide';
    focus.show({ el: target, geometry: geometry });
    const midSamples = [];
    const midStart = performance.now();
    let switched = false;
    let switchIndex = -1;
    let switchDelta = -1;
    while (performance.now() - midStart < 1200) {
      const box = boxOf();
      if (box) midSamples.push({ left: box.left, top: box.top, width: box.width, height: box.height });
      if (!switched && midSamples.length > 6) {
        const beforeSwitch = boxOf();
        mode = 'wide2';
        focus.show({ el: target, geometry: geometry });
        const afterSwitch = boxOf();
        switchDelta = beforeSwitch && afterSwitch
          ? Math.hypot(afterSwitch.left - beforeSwitch.left, afterSwitch.top - beforeSwitch.top) : -1;
        switched = true;
        switchIndex = midSamples.length - 1;
      }
      await raf();
    }
    const midFinalRect = (() => { const r = geometry.rect(target); return { left: r.left - 6, top: r.top - 6, width: r.width + 12, height: r.height + 12 }; })();
    const midFinal = midSamples.slice(-2)[0] || null;
    const midDeltas = [];
    for (let index = 1; index < midSamples.length; index += 1) {
      midDeltas.push(Math.hypot(midSamples[index].left - midSamples[index - 1].left, midSamples[index].top - midSamples[index - 1].top));
    }
    const sortedDeltas = midDeltas.slice().sort((a, b) => a - b);
    const nonzeroDeltas = sortedDeltas.filter((delta) => delta > 0.01);
    const medianDelta = nonzeroDeltas.length ? nonzeroDeltas[Math.floor(nonzeroDeltas.length / 2)] : 0;
    const p90Delta = sortedDeltas.length ? sortedDeltas[Math.floor(sortedDeltas.length * 0.9)] : 0;
    const maxDelta = sortedDeltas.length ? sortedDeltas[sortedDeltas.length - 1] : 0;
    const crossingDelta = switchIndex > 0 && switchIndex < midDeltas.length ? midDeltas[switchIndex] : -1;
    const jumpOk = maxDelta <= Math.max(8, p90Delta * 3) && (crossingDelta < 0 || crossingDelta <= Math.max(8, p90Delta * 2));
    check('Focus 迁移途中换 range 无跳变且落到新范围', switched && !!midFinal && jumpOk && switchDelta >= 0 && switchDelta <= 1.5 &&
      Math.abs(midFinal.left - midFinalRect.left) <= 4 && Math.abs(midFinal.top - midFinalRect.top) <= 4 &&
      Math.abs(midFinal.width - midFinalRect.width) <= 4,
      JSON.stringify({ switchDelta: Math.round(switchDelta * 100) / 100, maxDelta: Math.round(maxDelta * 10) / 10, medianDelta: Math.round(medianDelta * 10) / 10, p90Delta: Math.round(p90Delta * 10) / 10, crossingDelta: Math.round(crossingDelta * 10) / 10, final: midFinal, expected: midFinalRect }));

    const animationsRunning = () => focus.el.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length;
    // 几何不变：reanchor 不应重播迁移。
    const beforeReplay = boxOf();
    focus.reanchor({ el: target });
    const arrivedFresh = await Promise.race([focus.whenArrived().then((value) => 'resolved:' + value), sleep(260).then(() => 'timeout')]);
    await sleep(40);
    check('Focus 同一元素几何不变时 reanchor 不重播', !!beforeReplay && sameBox(beforeReplay, boxOf(), 2) && animationsRunning() === 0,
      JSON.stringify({ arrivedFresh, before: beforeReplay && { left: beforeReplay.left, top: beforeReplay.top }, now: boxOf() && { left: boxOf().left, top: boxOf().top } }));
    // 微小抖动：不建立迁移。
    mode = 'jitter';
    focus.reanchor({ el: target });
    // Focus 框 = geometry rect 外扩 6px。
    const jitterFinal = (() => {
      const r = geometry.rect(target);
      return { left: r.left - 6, top: r.top - 6, width: r.width + 12, height: r.height + 12 };
    })();
    const jitterSamples = [];
    const jitterDeadline = performance.now() + 360;
    while (performance.now() < jitterDeadline) {
      const box = boxOf();
      if (box) jitterSamples.push(box);
      await raf();
    }
    const jitterOffsets = jitterSamples.map((box) => Math.hypot(box.left - jitterFinal.left, box.top - jitterFinal.top));
    const jitterMaxOffset = jitterOffsets.length ? Math.max.apply(null, jitterOffsets) : -1;
    check('Focus 同一元素微小抖动不触发迁移', jitterMaxOffset >= 0 && jitterMaxOffset <= 4 && animationsRunning() === 0,
      JSON.stringify({ jitterMaxOffset: Math.round(jitterMaxOffset * 10) / 10, animationsRunning: animationsRunning(), final: jitterFinal }));
    focus.destroy();
    target.remove();
    return out;
  });
  for (const row of rows) check(row.name, row.ok, row.detail);
  check('Focus range 换范围区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  await context.close();
}

await browser.close();

const failed = checks.filter((row) => !row.ok);
console.log('SUMMARY ' + (checks.length - failed.length) + '/' + checks.length + ' passed');
if (failed.length) process.exitCode = 1;
