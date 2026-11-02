#!/usr/bin/env node
/*
 * timingFacts 双会话隔离回归（src 直载，真实 Edge）。
 * - 两个 NoteDemo 会话使用同名 Frame：watch 各自只收本 session 事实；
 * - 并发 next 都完成；collect 全局含两个 sessionId；summary 按 session 分开；
 * - stop/disposed 后停收且不影响另一会话；onFact 抛错不影响播放；
 * - 不写文件、不另起服务。
 *
 * Usage: node tests/checks/timing-session-check.mjs
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
const MODULES = ['core', 'legacy', 'ui-layout', 'blocks-base', 'demo-stage', 'blocks', 'viz-objects', 'viz-mechanisms', 'demo-runtime', 'demo-ui'];
const STYLES = moduleStyles(root, MODULES);
const SCRIPTS = moduleScripts(root, MODULES);

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail) });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : ' :: ' + String(detail).slice(0, 600)));
}

const browser = await chromium.launch({ executablePath: edge, headless: true });
const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push('pageerror: ' + error.message));
page.on('console', (message) => { if (message.type() === 'error') pageErrors.push('console: ' + message.text()); });
await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}body{padding:16px;background:#f4f6f9}#root{max-width:1040px;margin:0 auto}.timing-box{width:140px;height:56px;background:#dce8ff;border:1px solid #9db2d6}</style></head><body><main id="root"></main></body></html>');
for (const rel of STYLES) await page.addStyleTag({ path: src(rel) });
for (const rel of SCRIPTS) await page.addScriptTag({ path: src(rel) });

const rows = await page.evaluate(async () => {
  const out = [];
  const check = (name, ok, detail) => out.push({ name: name, ok: !!ok, detail: detail == null ? '' : String(detail) });
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rootEl = document.getElementById('root');
  const Facts = window.NoteDemo && window.NoteDemo.timingFacts;
  check('NoteDemo.timingFacts 可用且支持 sessionId', !!Facts && Facts.version === '1.1.0' && Facts.supported() === true,
    JSON.stringify({ version: Facts && Facts.version, supported: Facts && Facts.supported() }));
  if (!Facts) return out;

  function layout(container) {
    const wrap = document.createElement('div');
    const main = document.createElement('div');
    const slot = document.createElement('div');
    wrap.append(main, slot);
    container.appendChild(wrap);
    return { root: wrap, slots: { main: main, m: slot } };
  }
  function definition() {
    return {
      bindings: { m: { adapter: 'dom', slot: 'm' } },
      frames: [
        { id: 'f0', caption: '0', views: { m: { text: 'A0' } }, marks: [] },
        { id: 'f1', caption: '1', views: { m: { text: 'A1' } }, marks: [] },
        { id: 'f2', caption: '2', views: { m: { text: 'A2' } }, marks: [] },
        { id: 'f3', caption: '3', views: { m: { text: 'A3' } }, marks: [] }
      ],
      transitions: [
        { from: 'f0', to: 'f1', scene: { bindings: [{ binding: 'm' }] } },
        { from: 'f1', to: 'f2', scene: { bindings: [{ binding: 'm' }] } },
        { from: 'f2', to: 'f3', scene: { bindings: [{ binding: 'm' }] } }
      ]
    };
  }
  function mountSession(label) {
    const host = document.createElement('div');
    rootEl.appendChild(host);
    const session = window.NoteDemo.mount(host, { definition: definition(), layout: layout, label: label });
    return { host: host, session: session };
  }
  const left = mountSession('会话 A');
  const right = mountSession('会话 B');
  const idA = left.session.__sessionId;
  const idB = right.session.__sessionId;
  check('会话带稳定 __sessionId 且互不相同', idA !== undefined && idA !== null && idB !== undefined && idB !== null &&
    String(idA).length > 0 && String(idB).length > 0 && idA !== idB,
    JSON.stringify({ idA: idA, idAtype: typeof idA, idB: idB, idBtype: typeof idB }));

  const recA = Facts.watch(left.session, { label: 'A' });
  const recB = Facts.watch(right.session, { label: 'B' });
  const global = Facts.collect({ label: 'global' });
  check('watch 记录器绑定各自 sessionId', recA.sessionId === idA && recB.sessionId === idB,
    JSON.stringify({ recA: recA.sessionId, recB: recB.sessionId }));

  /* 并发 next：同名 Frame 各自完成 */
  const concurrent = await Promise.all([left.session.next(), right.session.next()]);
  await sleep(100);
  check('双会话并发 next 都完成', concurrent.every((result) => result.status === 'completed') &&
    left.session.getState().phase === 'idle' && right.session.getState().phase === 'idle' &&
    left.session.getState().settledFrameId === 'f1' && right.session.getState().settledFrameId === 'f1' &&
    recA.count() > 0 && recB.count() > 0,
    JSON.stringify({ results: concurrent.map((result) => result.status), a: recA.count(), b: recB.count(), global: global.count() }));

  /* watch 隔离：同名 Frame 下只含本 sessionId */
  const factsA = recA.snapshot();
  const factsB = recB.snapshot();
  const idsInA = Array.from(new Set(factsA.map((fact) => fact.sessionId)));
  const idsInB = Array.from(new Set(factsB.map((fact) => fact.sessionId)));
  const framesA = Array.from(new Set(factsA.map((fact) => fact.frameId).filter(Boolean)));
  const framesB = Array.from(new Set(factsB.map((fact) => fact.frameId).filter(Boolean)));
  check('watch 只收本 session 事实（同名 Frame 不串）', idsInA.length === 1 && idsInA[0] === idA &&
    idsInB.length === 1 && idsInB[0] === idB && framesA.indexOf('f1') >= 0 && framesB.indexOf('f1') >= 0,
    JSON.stringify({ idsInA: idsInA, idsInB: idsInB, framesA: framesA, framesB: framesB }));

  /* collect 全局：含两个 sessionId */
  const globalFacts = global.snapshot();
  const globalIds = Array.from(new Set(globalFacts.map((fact) => fact.sessionId)));
  check('collect 全局事实保留两个 sessionId', globalIds.length === 2 && globalIds.indexOf(idA) >= 0 && globalIds.indexOf(idB) >= 0 &&
    globalFacts.length >= factsA.length + factsB.length,
    JSON.stringify({ globalIds: globalIds, counts: { global: globalFacts.length, a: factsA.length, b: factsB.length } }));

  /* summary 按 session 分开 */
  const summaryA = recA.summary();
  const summaryB = recB.summary();
  const summaryGlobal = global.summary();
  const runIdsA = Array.from(new Set(summaryA.runs.map((run) => run.sessionId)));
  const runIdsB = Array.from(new Set(summaryB.runs.map((run) => run.sessionId)));
  check('summary 按 session 分开', summaryA.sessionId === idA && summaryB.sessionId === idB &&
    JSON.stringify(summaryA.sessionIds) === JSON.stringify([idA]) && JSON.stringify(summaryB.sessionIds) === JSON.stringify([idB]) &&
    runIdsA.length === 1 && runIdsA[0] === idA && runIdsB.length === 1 && runIdsB[0] === idB,
    JSON.stringify({ a: summaryA.sessionId, b: summaryB.sessionId, globalIds: summaryGlobal.sessionIds }));
  check('全局 summary 保留两个 session 的 runs', summaryGlobal.sessionIds.length === 2 &&
    summaryGlobal.runs.some((run) => run.sessionId === idA) && summaryGlobal.runs.some((run) => run.sessionId === idB) &&
    summaryGlobal.runs.every((run) => run.sessionId === idA || run.sessionId === idB),
    JSON.stringify({ sessionIds: summaryGlobal.sessionIds, runs: summaryGlobal.runs.map((run) => run.sessionId) }));

  /* onFact 抛错不影响播放，也不影响另一会话/记录继续 */
  recA.onFact(function () { throw new Error('observer boom'); });
  const globalBeforeThrow = global.count();
  const throwRun = await left.session.next();
  await sleep(80);
  check('onFact 抛错不影响播放与记录', throwRun.status === 'completed' &&
    left.session.getState().settledFrameId === 'f2' && recA.count() > factsA.length &&
    global.count() > globalBeforeThrow,
    JSON.stringify({ status: throwRun.status, frame: left.session.getState().settledFrameId, a: recA.count(), global: global.count() }));

  /* stop A：A 停收，B 继续 */
  const beforeStopA = recA.count();
  const beforeStopB = recB.count();
  recA.stop();
  const stoppedRun = await right.session.next();
  await sleep(80);
  check('stop 后停收且不影响另一会话', stoppedRun.status === 'completed' &&
    right.session.getState().settledFrameId === 'f2' && recA.count() === beforeStopA && recB.count() > beforeStopB,
    JSON.stringify({ a: recA.count(), beforeA: beforeStopA, b: recB.count(), beforeB: beforeStopB }));

  /* disposed：活动 watch 自动停收；再 watch 已销毁会话明确报错；B 继续可用 */
  const recADisposed = Facts.watch(left.session, { label: 'A-disposed' });
  const disposedCount = recADisposed.count();
  left.session.destroy();
  await sleep(80);
  const beforeBAfterDispose = recB.count();
  const afterDisposeRun = await right.session.next();
  await sleep(80);
  let disposedWatchError = null;
  try { Facts.watch(left.session); } catch (error) { disposedWatchError = String(error.message); }
  check('会话 disposed 后 watch 自动停收且不影响另一会话', recADisposed.active === false &&
    recADisposed.count() === disposedCount && afterDisposeRun.status === 'completed' &&
    right.session.getState().settledFrameId === 'f3' && recB.count() > beforeBAfterDispose,
    JSON.stringify({ active: recADisposed.active, count: recADisposed.count(), before: disposedCount,
      right: afterDisposeRun.status, rightFrame: right.session.getState().settledFrameId, recB: recB.count() }));
  check('已销毁会话 watch 明确报错', !!disposedWatchError && /已销毁|disposed/.test(disposedWatchError), disposedWatchError);

  recB.stop();
  global.stop();
  left.host.remove();
  right.host.remove();
  return out;
});
for (const row of rows) check(row.name, row.ok, row.detail);
check('timing 双会话区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
await context.close();
await browser.close();
const failed = checks.filter((row) => !row.ok);
console.log('SUMMARY ' + (checks.length - failed.length) + '/' + checks.length + ' passed');
if (failed.length) process.exitCode = 1;
