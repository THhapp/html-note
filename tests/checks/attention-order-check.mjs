#!/usr/bin/env node
/*
 * attention-order 短例真实推进检查（本机 Edge + 当前 dist）。
 * 覆盖：初始 A 可读/B/C 不可见；next 中 B/C 分别由自己的目标/组放行、
 * B 可辨认后才迁移 C；replay 达到终态；运行中 prev 取消回 A 且 B/C 不残留；
 * reduced 直接终态、无 Focus 迁移；无页面错误/外部请求。
 *
 * Usage: node tests/checks/attention-order-check.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const entry = pathToFileURL(path.join(root, 'examples', 'attention-order', 'index.html')).href;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail) });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : ' :: ' + String(detail).slice(0, 900)));
}

const browser = await chromium.launch({ executablePath: edge, headless: true });

async function open(reduced) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  const pageErrors = [];
  const external = [];
  page.on('pageerror', (error) => pageErrors.push('pageerror: ' + (error && error.message || error)));
  page.on('console', (message) => { if (message.type() === 'error') pageErrors.push('console: ' + message.text()); });
  page.on('request', (request) => { if (/^https?:/i.test(request.url())) external.push(request.url()); });
  await page.goto(entry, { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.AttentionOrder && window.AttentionOrder.session), null, { timeout: 15000 });
  await page.waitForFunction(() => window.AttentionOrder.session.getState().phase === 'idle', null, { timeout: 15000 });
  return { context, page, pageErrors, external };
}

/* 读取可见性：这里只看真实计算透明度，不用任何全局阈值驱动页面。 */
async function readState(page) {
  return await page.evaluate(() => {
    const session = window.AttentionOrder.session;
    const opacity = (part) => {
      const node = document.querySelector('[data-part="' + part + '"]');
      if (!node) return null;
      return Math.round(Number(getComputedStyle(node).opacity) * 1000) / 1000;
    };
    const focus = document.querySelector('.nx-focus');
    const box = focus ? focus.querySelector('.nx-focus__box') : null;
    return {
      phase: session.getState().phase,
      settledFrameId: session.getState().settledFrameId,
      error: session.getState().error ? session.getState().error.message : null,
      a: opacity('a'), b: opacity('b'), c: opacity('c'),
      focus: focus ? { state: focus.getAttribute('data-nx-state'), box: !!box } : null
    };
  });
}

/* ---------------- 正常动效：初始 / next / 事实顺序 / B/C 分别放行 ---------------- */
const normal = await open(false);
const initial = await readState(normal.page);
check('attention-order：初始停点只有 A 可见，B/C 不可见',
  initial.phase === 'idle' && initial.settledFrameId === 'initial' &&
  initial.a >= 0.99 && initial.b <= 0.01 && initial.c <= 0.01,
  JSON.stringify(initial));

const run = await normal.page.evaluate(async () => {
  const session = window.AttentionOrder.session;
  function opacity(part) {
    const node = document.querySelector('[data-part="' + part + '"]');
    return node ? Math.round(Number(getComputedStyle(node).opacity) * 1000) / 1000 : null;
  }
  function snap() { return { a: opacity('a'), b: opacity('b'), c: opacity('c') }; }
  const facts = [];
  const snapshots = {};
  const rec = window.NoteDemo.timingFacts.watch(session, {
    onFact(fact) {
      facts.push({ kind: fact.kind, at: Math.round(fact.at * 10) / 10, index: fact.index, binding: fact.binding, track: fact.track, group: fact.group, groups: fact.groups });
      if (fact.kind === 'focus-arrival' && snapshots.firstArrival == null) snapshots.firstArrival = snap();
      if (fact.kind === 'focus-arrival' && fact.groups && fact.groups.indexOf('step-b') >= 0) snapshots.arrivalB = snap();
      if (fact.kind === 'focus-arrival' && fact.groups && fact.groups.indexOf('step-c') >= 0) snapshots.arrivalC = snap();
      if (fact.kind === 'effect-start' && fact.group === 'step-b') snapshots.startB = snap();
      if (fact.kind === 'ready' && fact.group === 'step-b') snapshots.readyB = snap();
      if (fact.kind === 'effect-start' && fact.group === 'step-c') snapshots.startC = snap();
    }
  });
  const started = performance.now();
  const result = await session.next();
  const elapsedMs = performance.now() - started;
  await new Promise((resolve) => setTimeout(resolve, 180));
  const final = { state: session.getState(), opacities: snap() };
  rec.stop();
  return { result, elapsedMs, facts, snapshots, final };
});

const facts = run.facts;
/* 注意：A 是 groups: [] 的观察目标，也会发 index 0 的 focus-arrival；任务里的 B/C
 * 放行顺序按“带内容组的到达序列”判断：contentArrivals[0] = B 到达，contentArrivals[1] = C 到达。
 * 当前公开契约下，B 组 effect-start 必然在 B 自身到达之后、C 到达之前，不可能早于 B 的到达。 */
const contentArrivals = facts.filter((fact) => fact.kind === 'focus-arrival' && fact.groups && fact.groups.length > 0);
const firstArrivalIndex = facts.findIndex((fact) => fact.kind === 'focus-arrival');
const arrivalBIndex = facts.findIndex((fact) => fact.kind === 'focus-arrival' && fact.groups && fact.groups.indexOf('step-b') >= 0);
const arrivalCIndex = facts.findIndex((fact) => fact.kind === 'focus-arrival' && fact.groups && fact.groups.indexOf('step-c') >= 0);
const startBIndex = facts.findIndex((fact) => fact.kind === 'effect-start' && fact.group === 'step-b');
const readyBIndex = facts.findIndex((fact) => fact.kind === 'ready' && fact.group === 'step-b');
const startCIndex = facts.findIndex((fact) => fact.kind === 'effect-start' && fact.group === 'step-c');
const finalOpacities = run.final.opacities;

check('attention-order：next 完成且首个 Focus 到达时 B/C 仍不可见',
  run.result.status === 'completed' && run.result.frameId === 'expanded' && facts.length > 0 &&
  firstArrivalIndex >= 0 && run.snapshots.firstArrival &&
  run.snapshots.firstArrival.b <= 0.01 && run.snapshots.firstArrival.c <= 0.01,
  JSON.stringify({ result: run.result, first: run.snapshots.firstArrival, facts: facts.slice(0, 3) }));

check('attention-order：B/C 的 Focus 到达顺序独立（B 组 step-b、C 组 step-c）',
  contentArrivals.length === 2 &&
  contentArrivals[0].groups.join(',') === 'step-b' && contentArrivals[1].groups.join(',') === 'step-c' &&
  arrivalBIndex >= 0 && arrivalCIndex > arrivalBIndex,
  JSON.stringify({ arrivals: contentArrivals.map((fact) => ({ groups: fact.groups, at: fact.at })) }));

check('attention-order：step-b 在 B 到达之后、C 之前启动；B ready 早于 C 到达',
  startBIndex > arrivalBIndex && startBIndex < arrivalCIndex &&
  readyBIndex > startBIndex && readyBIndex < arrivalCIndex,
  JSON.stringify({ arrivalBIndex, startBIndex, readyBIndex, arrivalCIndex, order: facts.map((fact) => fact.kind + (fact.group ? ':' + fact.group : '') + (fact.groups ? ':' + fact.groups.join(',') : '')) }));

check('attention-order：B 在焦点离开前已达到可辨认，C 在 B 阶段保持不出现',
  run.snapshots.arrivalB && run.snapshots.arrivalB.b <= 0.01 && run.snapshots.arrivalB.c <= 0.01 &&
  run.snapshots.startB && run.snapshots.startB.c <= 0.01 &&
  run.snapshots.readyB && run.snapshots.readyB.b >= 0.9 && run.snapshots.readyB.c <= 0.01 &&
  run.snapshots.arrivalC && run.snapshots.arrivalC.b >= 0.9 && run.snapshots.arrivalC.c <= 0.01,
  JSON.stringify({ arrivalB: run.snapshots.arrivalB, startB: run.snapshots.startB, readyB: run.snapshots.readyB, arrivalC: run.snapshots.arrivalC }));

check('attention-order：step-c 在 C 到达之后启动，最终 A/B/C 都可见且 idle',
  startCIndex > arrivalCIndex && run.snapshots.startC && run.snapshots.startC.b >= 0.9 && run.snapshots.startC.c <= 0.01 &&
  finalOpacities.a >= 0.99 && finalOpacities.b >= 0.99 && finalOpacities.c >= 0.99 &&
  run.final.state.phase === 'idle' && run.final.state.settledFrameId === 'expanded',
  JSON.stringify({ startCIndex, arrivalCIndex, startC: run.snapshots.startC, final: run.final }));

/* ---------------- replay：从来源重演入边，重新达到终态 ---------------- */
const replay = await normal.page.evaluate(async () => {
  const session = window.AttentionOrder.session;
  const facts = [];
  let firstArrival = null;
  const opacity = (part) => {
    const node = document.querySelector('[data-part="' + part + '"]');
    return node ? Math.round(Number(getComputedStyle(node).opacity) * 1000) / 1000 : null;
  };
  function snap() { return { a: opacity('a'), b: opacity('b'), c: opacity('c') }; }
  const rec = window.NoteDemo.timingFacts.watch(session, {
    onFact(fact) {
      facts.push({ kind: fact.kind, group: fact.group, groups: fact.groups, frameId: fact.frameId });
      if (fact.kind === 'focus-arrival' && firstArrival == null) firstArrival = snap();
    }
  });
  const result = await session.replay();
  await new Promise((resolve) => setTimeout(resolve, 200));
  const final = { state: session.getState(), a: opacity('a'), b: opacity('b'), c: opacity('c') };
  rec.stop();
  return { result, facts, firstArrival, final };
});
check('attention-order：replay 重新推进并达到 A/B/C 终态',
  replay.result.status === 'completed' && replay.result.frameId === 'expanded' &&
  replay.final.a >= 0.99 && replay.final.b >= 0.99 && replay.final.c >= 0.99 &&
  replay.final.state.phase === 'idle' && replay.final.state.settledFrameId === 'expanded' &&
  replay.facts.some((fact) => fact.kind === 'effect-start' && fact.group === 'step-b') &&
  replay.facts.some((fact) => fact.kind === 'effect-start' && fact.group === 'step-c') &&
  replay.firstArrival && replay.firstArrival.a >= 0.99 && replay.firstArrival.b <= 0.01 && replay.firstArrival.c <= 0.01,
  JSON.stringify({ result: replay.result, firstArrival: replay.firstArrival, final: replay.final, facts: replay.facts.map((fact) => fact.kind + (fact.group ? ':' + fact.group : '')) }));

/* ---------------- 运行中 prev：取消并回到 A，B/C 不残留 ---------------- */
const cancel = await normal.page.evaluate(async () => {
  const session = window.AttentionOrder.session;
  function opacity(part) {
    const node = document.querySelector('[data-part="' + part + '"]');
    return node ? Math.round(Number(getComputedStyle(node).opacity) * 1000) / 1000 : null;
  }
  function snap() { return { phase: session.getState().phase, settled: session.getState().settledFrameId, a: opacity('a'), b: opacity('b'), c: opacity('c'), focus: !!document.querySelector('.nx-focus[data-nx-state="shown"]'), error: session.getState().error ? session.getState().error.message : null }; }
  async function waitIdle() {
    const begin = performance.now();
    while (performance.now() - begin < 8000) {
      if (session.getState().phase === 'idle') return true;
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    return false;
  }
  if (session.getState().settledFrameId !== 'initial') {
    await session.go('initial');
    await waitIdle();
  }
  const rec = window.NoteDemo.timingFacts.watch(session, { onFact(fact) { if (fact.kind === 'effect-start' && fact.group === 'step-b') window.__stepBStarted = true; } });
  window.__stepBStarted = false;
  const nextPromise = session.next();
  const started = performance.now();
  let mid = null;
  while (performance.now() - started < 8000) {
    const current = snap();
    if (window.__stepBStarted && current.phase === 'running' && current.b > 0.05) { mid = current; break; }
    if (current.phase === 'idle' && current.settled === 'expanded') break;
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
  const prevPromise = session.prev();
  const settled = await Promise.allSettled([nextPromise, prevPromise]);
  await waitIdle();
  await new Promise((resolve) => setTimeout(resolve, 260));
  const final = snap();
  rec.stop();
  window.__stepBStarted = false;
  return {
    mid: mid,
    settled: settled.map((item) => item.status === 'fulfilled' ? { status: item.value && item.value.status, frameId: item.value && item.value.frameId } : { status: 'rejected', error: String(item.reason && item.reason.message || item.reason) }),
    final: final
  };
});
check('attention-order：运行中 prev 取消并回到 A，B/C 清空、无焦点残留',
  cancel.mid && cancel.mid.phase === 'running' && cancel.mid.b > 0.05 &&
  cancel.final.phase === 'idle' && cancel.final.settled === 'initial' && cancel.final.error === null &&
  cancel.final.a >= 0.99 && cancel.final.b <= 0.01 && cancel.final.c <= 0.01 && !cancel.final.focus,
  JSON.stringify(cancel));

/* ---------------- 静态恢复：go 直接呈现完整停点，prev 清回初始 ---------------- */
const restore = await normal.page.evaluate(async () => {
  const session = window.AttentionOrder.session;
  function opacity(part) {
    const node = document.querySelector('[data-part="' + part + '"]');
    return node ? Math.round(Number(getComputedStyle(node).opacity) * 1000) / 1000 : null;
  }
  function snap() {
    const cards = ['a', 'b', 'c'].map((part) => document.querySelector('[data-part="' + part + '"]'));
    return {
      state: session.getState(),
      a: opacity('a'), b: opacity('b'), c: opacity('c'),
      runningAnimations: cards.reduce((sum, node) => sum + (node ? node.getAnimations().filter((animation) => animation.playState === 'running').length : 0), 0),
      shownFocus: document.querySelectorAll('.nx-focus[data-nx-state="shown"]').length
    };
  }
  async function waitIdle() {
    const begin = performance.now();
    while (performance.now() - begin < 8000) {
      if (session.getState().phase === 'idle') return true;
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    return false;
  }
  const goExpanded = await session.go('expanded');
  await waitIdle();
  const expanded = snap();
  const prevInitial = await session.prev();
  await waitIdle();
  const initial = snap();
  return { goExpanded, expanded, prevInitial, initial };
});
check('attention-order：go(expanded) 直接呈现完整 A/B/C 停点，prev 清回初始 A、B/C 不残留',
  restore.goExpanded.status === 'completed' && restore.goExpanded.frameId === 'expanded' &&
  restore.expanded.state.phase === 'idle' && restore.expanded.state.settledFrameId === 'expanded' &&
  restore.expanded.a >= 0.99 && restore.expanded.b >= 0.99 && restore.expanded.c >= 0.99 && restore.expanded.runningAnimations === 0 &&
  restore.prevInitial.status === 'completed' && restore.prevInitial.frameId === 'initial' &&
  restore.initial.state.phase === 'idle' && restore.initial.state.settledFrameId === 'initial' &&
  restore.initial.a >= 0.99 && restore.initial.b <= 0.01 && restore.initial.c <= 0.01 && restore.initial.runningAnimations === 0,
  JSON.stringify(restore));

check('attention-order：正常流程无页面/控制台错误、无外部请求',
  normal.pageErrors.length === 0 && normal.external.length === 0,
  JSON.stringify({ pageErrors: normal.pageErrors, external: normal.external }));
await normal.context.close();

/* ---------------- 减少动效：直接终态、无 Focus 迁移 ---------------- */
const reduced = await open(true);
const reducedInitial = await readState(reduced.page);
const reducedRun = await reduced.page.evaluate(async () => {
  const session = window.AttentionOrder.session;
  const facts = [];
  const rec = window.NoteDemo.timingFacts.watch(session, { onFact(fact) { facts.push({ kind: fact.kind, binding: fact.binding, group: fact.group, frameId: fact.frameId }); } });
  const started = performance.now();
  const result = await session.next();
  const elapsedMs = performance.now() - started;
  await new Promise((resolve) => setTimeout(resolve, 120));
  const opacity = (part) => {
    const node = document.querySelector('[data-part="' + part + '"]');
    return node ? Math.round(Number(getComputedStyle(node).opacity) * 1000) / 1000 : null;
  };
  const final = {
    state: session.getState(),
    a: opacity('a'), b: opacity('b'), c: opacity('c'),
    focusCount: document.querySelectorAll('.nx-focus').length,
    shownFocus: document.querySelectorAll('.nx-focus[data-nx-state="shown"]').length
  };
  rec.stop();
  return { result, elapsedMs, facts, final };
});
check('attention-order reduced：初始 A 可见、B/C 不可见',
  reducedInitial.phase === 'idle' && reducedInitial.settledFrameId === 'initial' &&
  reducedInitial.a >= 0.99 && reducedInitial.b <= 0.01 && reducedInitial.c <= 0.01,
  JSON.stringify(reducedInitial));
check('attention-order reduced：next 直接终态 A/B/C 可见、无 Focus 迁移',
  reducedRun.result.status === 'completed' && reducedRun.result.frameId === 'expanded' &&
  reducedRun.final.state.phase === 'idle' && reducedRun.final.state.settledFrameId === 'expanded' &&
  reducedRun.final.a >= 0.99 && reducedRun.final.b >= 0.99 && reducedRun.final.c >= 0.99 &&
  reducedRun.final.focusCount === 0 && reducedRun.final.shownFocus === 0 &&
  reducedRun.facts.every((fact) => fact.kind === 'reduced'),
  JSON.stringify({ result: reducedRun.result, final: reducedRun.final, facts: reducedRun.facts, elapsed: reducedRun.elapsedMs }));
check('attention-order reduced：无页面/控制台错误、无外部请求',
  reduced.pageErrors.length === 0 && reduced.external.length === 0,
  JSON.stringify({ pageErrors: reduced.pageErrors, external: reduced.external }));
await reduced.context.close();

await browser.close();
const failed = checks.filter((row) => !row.ok);
console.log('SUMMARY ' + (checks.length - failed.length) + '/' + checks.length + ' passed');
if (failed.length) process.exitCode = 1;
