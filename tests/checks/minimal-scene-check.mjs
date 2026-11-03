#!/usr/bin/env node
/*
 * 最小自定义画面永久检查（examples/continuous-scene/minimal.html）。
 * 真实 dist + 默认舞台；不只静态打开：next 过程中来源视觉保持、progress 推进，
 * 完成后目标终态；go 恢复初始停点；reduced 媒体下 next 直接终态。
 *
 * Usage: node tests/checks/minimal-scene-check.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const entry = pathToFileURL(path.join(root, 'examples', 'continuous-scene', 'minimal.html')).href;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

let passes = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) { passes += 1; console.log('PASS  ' + name); }
  else { failures.push(name); console.log('FAIL  ' + name + (detail == null ? '' : ' :: ' + String(detail).slice(0, 800))); }
}

async function openPage(browser, options) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, reducedMotion: options && options.reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const externalRequests = [];
  page.on('pageerror', (error) => pageErrors.push(String(error && error.message || error)));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('request', (request) => { if (/^https?:/i.test(request.url())) externalRequests.push(request.url()); });
  await page.goto(entry, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__inspectSession, null, { timeout: 15000 });
  await page.waitForFunction(() => window.__inspectSession.getState().phase === 'idle', null, { timeout: 15000 });
  return { context, page, pageErrors, consoleErrors, externalRequests };
}

async function readUi(page) {
  return await page.evaluate(() => {
    const session = window.__inspectSession;
    const fill = document.querySelector('.mm-meter__fill');
    const focus = document.querySelector('.nx-focus__box');
    const rect = (node) => {
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { left: Math.round(box.left * 10) / 10, top: Math.round(box.top * 10) / 10, width: Math.round(box.width * 10) / 10, height: Math.round(box.height * 10) / 10 };
    };
    const state = session.getState();
    return {
      phase: state.phase,
      settledFrameId: state.settledFrameId,
      error: state.error ? state.error.message : null,
      fillPct: fill ? parseFloat(fill.style.width) : null,
      value: (document.querySelector('.mm-meter__value') || {}).textContent || null,
      committed: (document.querySelector('.mm-meter__committed') || {}).textContent || null,
      shown: (document.querySelector('.mm-meter__shown') || {}).textContent || null,
      meterHeight: (document.querySelector('.mm-meter') || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height,
      trackWidth: (document.querySelector('.mm-meter__track') || { getBoundingClientRect: () => ({ width: 0 }) }).getBoundingClientRect().width,
      focusRect: rect(focus),
      fillRect: rect(fill),
      runningAnimations: fill ? fill.getAnimations().filter((animation) => animation.playState === 'running').length : -1
    };
  });
}

/* 在页面内同步启动 next 并每 16ms 采样，避免跨 evaluate 竞争导致漏掉运行中状态。 */
async function runNextWithSamples(page) {
  return await page.evaluate(async () => {
    const session = window.__inspectSession;
    function read() {
      const fill = document.querySelector('.mm-meter__fill');
      const focus = document.querySelector('.nx-focus__box');
      const rect = (node) => {
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { left: Math.round(box.left * 10) / 10, top: Math.round(box.top * 10) / 10, width: Math.round(box.width * 10) / 10, height: Math.round(box.height * 10) / 10 };
      };
      return {
        phase: session.getState().phase,
        settledFrameId: session.getState().settledFrameId,
        fillPct: fill ? parseFloat(fill.style.width) : null,
        value: (document.querySelector('.mm-meter__value') || {}).textContent || null,
        committed: (document.querySelector('.mm-meter__committed') || {}).textContent || null,
        shown: (document.querySelector('.mm-meter__shown') || {}).textContent || null,
        meterHeight: (document.querySelector('.mm-meter') || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height,
        trackWidth: (document.querySelector('.mm-meter__track') || { getBoundingClientRect: () => ({ width: 0 }) }).getBoundingClientRect().width,
        focusRect: rect(focus),
        fillRect: rect(fill),
        runningAnimations: fill ? fill.getAnimations().filter((animation) => animation.playState === 'running').length : -1
      };
    }
    const samples = [];
    const timer = setInterval(() => { samples.push(read()); }, 16);
    const startedAt = performance.now();
    const result = await session.next();
    clearInterval(timer);
    await new Promise((resolve) => setTimeout(resolve, 80));
    return { result: result, elapsedMs: performance.now() - startedAt, samples: samples, after: read() };
  });
}

async function goInitial(page) {
  return await page.evaluate(async () => {
    const session = window.__inspectSession;
    const result = await session.go('initial');
    try {
      await new Promise((resolve) => {
        const started = performance.now();
        const timer = setInterval(() => {
          if (!document.querySelector('.nx-focus[data-nx-state="shown"]') || performance.now() - started > 1200) {
            clearInterval(timer);
            resolve();
          }
        }, 20);
      });
    } catch (error) { /* 下方按实际状态断言 */ }
    const fill = document.querySelector('.mm-meter__fill');
    const focus = document.querySelector('.nx-focus[data-nx-state="shown"] .nx-focus__box');
    return {
      result: result,
      state: session.getState(),
      fillPct: fill ? parseFloat(fill.style.width) : null,
      value: (document.querySelector('.mm-meter__value') || {}).textContent || null,
      committed: (document.querySelector('.mm-meter__committed') || {}).textContent || null,
      shown: (document.querySelector('.mm-meter__shown') || {}).textContent || null,
      focusShown: !!focus,
      runningAnimations: fill ? fill.getAnimations().filter((animation) => animation.playState === 'running').length : -1
    };
  });
}

const browser = await chromium.launch({ executablePath: edge, headless: true });
try {
  /* ---------------- 1. 正常 next：运行中来源保持 / progress / 完成终态 ---------------- */
  const normal = await openPage(browser);
  const page = normal.page;
  const idle = await readUi(page);
  check('minimal：静态打开即初始停点 30%，来源与显现状态完整',
    idle.phase === 'idle' && idle.settledFrameId === 'initial' && idle.fillPct === 30 &&
    idle.value === '30%' && idle.committed === '已提交：30%' && idle.shown === '已显现完成：30%' && !idle.focusRect,
    JSON.stringify(idle));

  const run = await runNextWithSamples(page);
  const samples = run.samples;
  const firstProgress = samples.findIndex((sample) => sample.shown != null && sample.shown.indexOf('显现中') === 0);
  const preRelease = firstProgress < 0 ? samples.filter((sample) => sample.phase === 'running') : samples.slice(0, firstProgress).filter((sample) => sample.phase === 'running');
  const progressing = samples.filter((sample) => sample.fillPct != null && sample.fillPct > 30.5 && sample.fillPct < 83.5);
  const runningSeen = samples.some((sample) => sample.phase === 'running');
  check('minimal：next 真实运行（不是静态打开）并出现 progress 中间态',
    run.result.status === 'completed' && run.result.frameId === 'changed' && runningSeen && progressing.length > 0,
    JSON.stringify({ result: run.result, samples: samples.length, runningSeen: runningSeen, progressing: progressing.length }));
  check('minimal：放行前来源视觉保持 30%，commit 已提交目标 84%（等待放行）',
    preRelease.length > 0 && preRelease.every((sample) => Math.abs(sample.fillPct - 30) <= 0.5 &&
      sample.value === '30%' && sample.committed === '目标已提交：84% · 等待放行' && sample.shown === '已显现完成：30%'),
    JSON.stringify(preRelease.slice(0, 2)));
  check('minimal：progress 期间只写“显现中：x%”，不提前写完成',
    progressing.length > 0 && progressing.every((sample) => /^显现中：\d+%$/.test(String(sample.shown))) &&
      samples.every((sample) => sample.shown == null || sample.shown.indexOf('已显现完成：84%') < 0 || sample.fillPct >= 83.5),
    JSON.stringify(progressing.slice(0, 3)));
  check('minimal：运行时只推进自己的填充，track/meter 尺寸不变',
    new Set(samples.map((sample) => Math.round(sample.trackWidth * 10) / 10)).size === 1 &&
      new Set(samples.map((sample) => Math.round(sample.meterHeight * 10) / 10)).size === 1 &&
      samples.filter((sample) => sample.fillPct != null).every((sample, index, list) => index === 0 || sample.fillPct >= list[index - 1].fillPct - 0.01),
    JSON.stringify({ tracks: Array.from(new Set(samples.map((sample) => sample.trackWidth))), heights: Array.from(new Set(samples.map((sample) => sample.meterHeight))) }));
  const focusOverlap = samples.some((sample) => sample.focusRect && sample.fillRect &&
    sample.focusRect.left <= sample.fillRect.left + sample.fillRect.width &&
    sample.focusRect.left + sample.focusRect.width >= sample.fillRect.left);
  check('minimal：attention 指向真实变化区域（焦点框与填充重叠）', focusOverlap, JSON.stringify(samples.filter((sample) => sample.focusRect).slice(0, 1)));
  check('minimal：完成后目标视觉 84% 且显现状态为完成',
    run.after.phase === 'idle' && run.after.settledFrameId === 'changed' && run.after.fillPct === 84 &&
    run.after.value === '84%' && run.after.shown === '已显现完成：84%' && run.after.runningAnimations === 0,
    JSON.stringify(run.after));

  /* ---------------- 2. go 恢复初始停点：直接完整画面 ---------------- */
  const go = await goInitial(page);
  check('minimal：go 恢复初始停点，直接呈现完整 30% 画面（无残留进度）',
    go.result.status === 'completed' && go.state.phase === 'idle' && go.state.settledFrameId === 'initial' &&
    go.fillPct === 30 && go.value === '30%' && go.committed === '已提交：30%' && go.shown === '已显现完成：30%' &&
    !go.focusShown && go.runningAnimations === 0,
    JSON.stringify(go));
  check('minimal：正常流程无页面/控制台错误、无外部请求',
    normal.pageErrors.length === 0 && normal.consoleErrors.length === 0 && normal.externalRequests.length === 0,
    JSON.stringify({ pageErrors: normal.pageErrors, consoleErrors: normal.consoleErrors, externalRequests: normal.externalRequests }));
  await normal.context.close();

  /* ---------------- 3. reduced：next 直接终态，不建 progress/焦点 ---------------- */
  const reduced = await openPage(browser, { reduced: true });
  const reducedIdle = await readUi(reduced.page);
  const reducedRun = await runNextWithSamples(reduced.page);
  const reducedSamples = reducedRun.samples;
  check('minimal reduced：环境生效且初始仍为 30% 完整画面',
    reducedIdle.fillPct === 30 && reducedIdle.shown === '已显现完成：30%', JSON.stringify(reducedIdle));
  check('minimal reduced：next 直接到 84% 终态，不出现 progress 中间态/运行中动画/焦点',
    reducedRun.result.status === 'completed' && reducedRun.after.fillPct === 84 && reducedRun.after.value === '84%' &&
    reducedRun.after.shown === '已显现完成：84%' && /减少动效直接显现/.test(String(reducedRun.after.committed)) &&
    reducedSamples.every((sample) => sample.fillPct == null || sample.fillPct === 30 || sample.fillPct === 84) &&
    reducedSamples.every((sample) => !sample.focusRect) &&
    reducedSamples.every((sample) => sample.runningAnimations === 0),
    JSON.stringify({ result: reducedRun.result, after: reducedRun.after, fills: Array.from(new Set(reducedSamples.map((sample) => sample.fillPct))), samples: reducedSamples.length, elapsedMs: reducedRun.elapsedMs }));
  check('minimal reduced：无页面/控制台错误、无外部请求',
    reduced.pageErrors.length === 0 && reduced.consoleErrors.length === 0 && reduced.externalRequests.length === 0,
    JSON.stringify({ pageErrors: reduced.pageErrors, consoleErrors: reduced.consoleErrors, externalRequests: reduced.externalRequests }));
  await reduced.context.close();
} finally {
  await browser.close();
}

console.log('SUMMARY ' + passes + '/' + (passes + failures.length) + ' passed');
if (failures.length) {
  console.log('FAILED ' + JSON.stringify(failures));
  process.exitCode = 1;
}
