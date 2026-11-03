#!/usr/bin/env node
/*
 * 作者跨区域示范 focused check（examples/authoring 第四例，真实 Edge + 现有 dist）。
 * - 第四 demo 用 NoteDemoRecipes.diagramTable：evidence 与 table 独立 Binding，status 辅助不同步 Focus；
 * - 新行在首目标阶段 opacity=0，table row 目标到达后才 ready→finished；
 * - facts 顺序：evidence focus-arrival → effect-start/ready → table focus-arrival → effect-start/ready；
 * - 终态、replay/cancel、reduced 动效均保持行可见且无残留。
 *
 * Usage: node tests/checks/authoring-cross-region-check.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const pageUrl = pathToFileURL(path.join(root, 'examples/authoring/index.html')).href;

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail) });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : ' :: ' + String(detail).slice(0, 700)));
}

const browser = await chromium.launch({ executablePath: edge, headless: true });

async function openPage(options = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    reducedMotion: options.reduced ? 'reduce' : 'no-preference'
  });
  const page = await context.newPage();
  const pageErrors = [];
  const external = [];
  page.on('pageerror', (error) => pageErrors.push('pageerror: ' + error.message));
  page.on('console', (message) => { if (message.type() === 'error') pageErrors.push('console: ' + message.text()); });
  page.on('request', (request) => { if (/^https?:/i.test(request.url())) external.push(request.url()); });
  await page.goto(pageUrl, { waitUntil: 'load' });
  await page.waitForFunction(
    () => Array.isArray(window.AuthoringSessions) && window.AuthoringSessions.length >= 4,
    null,
    { timeout: 15000 }
  );
  return { context, page, pageErrors, external };
}

/* 在页面内安装只读辅助；检查本身不写页面状态。 */
async function installHelpers(page) {
  await page.evaluate(() => {
    window.__xr = {
      host: () => document.querySelector('[data-author-demo="crossRegion"]'),
      session: () => window.AuthoringSessions[3],
      button: (host, label) => Array.from(host.querySelectorAll('.nblk-demo-stage__controls button'))
        .find((node) => node.textContent.trim() === label),
      row: (host, key) => host.querySelector('tr[data-row-key="' + key + '"]'),
      opacity: (host, key) => {
        const row = window.__xr.row(host, key);
        return row ? Number(getComputedStyle(row).opacity) : -1;
      },
      slot: (host, name) => {
        const node = host.querySelector('[data-demo-slot="' + name + '"]');
        return node ? String(node.textContent || '').replace(/\s+/g, ' ').trim() : '';
      },
      idle: async (session, deadlineMs) => {
        const deadline = performance.now() + (deadlineMs || 15000);
        while (performance.now() < deadline && session.getState().phase !== 'idle') {
          await new Promise((resolve) => setTimeout(resolve, 16));
        }
      },
      facts: (rec) => rec.snapshot().map((fact) => ({
        kind: fact.kind,
        binding: fact.binding || null,
        group: fact.group || null,
        track: fact.track || null,
        frameId: fact.frameId || null
      }))
    };
  });
}

async function openWithHelpers(options = {}) {
  const opened = await openPage(options);
  await installHelpers(opened.page);
  return opened;
}

/* ---------------- 初始画面与第四宿主 ---------------- */
{
  const { context, page, pageErrors, external } = await openWithHelpers();
  const initial = await page.evaluate(() => {
    const host = window.__xr.host();
    const session = window.__xr.session();
    return {
      sessions: Array.isArray(window.AuthoringSessions) ? window.AuthoringSessions.length : -1,
      phases: typeof window.AuthoringPhases === 'function' ? window.AuthoringPhases().length : -1,
      hasHost: !!host,
      phase: session ? session.getState().phase : '',
      rows: host ? host.querySelectorAll('tr[data-row-key]').length : -1,
      evidence: host ? window.__xr.slot(host, 'evidence') : '',
      status: host ? window.__xr.slot(host, 'status') : ''
    };
  });
  check('跨区域例：第四宿主与四会话就绪',
    initial.sessions === 4 && initial.phases === 4 && initial.hasHost && initial.phase === 'idle',
    JSON.stringify(initial));
  check('跨区域例：初始表空、依据等待、状态 0 条',
    initial.rows === 0 && initial.evidence.indexOf('等待依据') >= 0 && initial.status.indexOf('已提交 0 条') >= 0,
    JSON.stringify(initial));
  check('跨区域例：无外部网络请求', external.length === 0, JSON.stringify(external.slice(0, 5)));
  check('跨区域例初始画面无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  await context.close();
}

/* ---------------- step A/B + replay/cancel：同一页面连续推进 ---------------- */
{
  const { context, page, pageErrors } = await openWithHelpers();
  const stepA = await page.evaluate(async () => {
    const XR = window.__xr;
    const host = XR.host();
    const session = XR.session();
    const rec = window.NoteDemo.timingFacts.watch(session, { label: 'cross-region-a' });
    const samples = [];
    let sampling = true;
    const tick = () => {
      if (!sampling) return;
      const row = XR.row(host, 'r1');
      samples.push({
        phase: session.getState().phase,
        hasRow: !!row,
        rowOpacity: row ? Number(getComputedStyle(row).opacity) : -1,
        evidence: XR.slot(host, 'evidence'),
        status: XR.slot(host, 'status')
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    XR.button(host, '下一步').click();
    await XR.idle(session);
    sampling = false;
    const facts = XR.facts(rec);
    rec.stop();
    return {
      phase: session.getState().phase,
      frame: session.getState().settledFrameId,
      samples,
      facts,
      finalOpacity: XR.opacity(host, 'r1'),
      status: XR.slot(host, 'status'),
      evidence: XR.slot(host, 'evidence'),
      rowCount: host.querySelectorAll('tr[data-row-key]').length
    };
  });
  const hiddenFirst = stepA.samples.find((sample) =>
    sample.phase === 'running' && sample.hasRow && sample.rowOpacity < 0.1);
  check('跨区域例 step A：首目标阶段新行 opacity=0', !!hiddenFirst, JSON.stringify(stepA.samples.slice(0, 10)));
  check('跨区域例 step A：表目标后行最终可见并停稳',
    stepA.phase === 'idle' && stepA.frame === 'step-a' && stepA.finalOpacity > 0.9 && stepA.rowCount === 1,
    JSON.stringify({ phase: stepA.phase, frame: stepA.frame, finalOpacity: stepA.finalOpacity, rowCount: stepA.rowCount }));
  check('跨区域例 step A：状态同步为 1 条',
    stepA.status.indexOf('已提交 1 条') >= 0 && stepA.evidence.indexOf('依据 A') >= 0,
    JSON.stringify({ status: stepA.status, evidence: stepA.evidence }));
  const eArr = stepA.facts.findIndex((fact) => fact.kind === 'focus-arrival' && fact.binding === 'evidence');
  const eStart = stepA.facts.findIndex((fact) => fact.kind === 'effect-start' && fact.binding === 'evidence');
  const eReady = stepA.facts.findIndex((fact) => fact.kind === 'ready' && fact.binding === 'evidence');
  const tArr = stepA.facts.findIndex((fact) => fact.kind === 'focus-arrival' && fact.binding === 'table');
  const tStart = stepA.facts.findIndex((fact) => fact.kind === 'effect-start' && fact.binding === 'table');
  const tReady = stepA.facts.findIndex((fact) => fact.kind === 'ready' && fact.binding === 'table');
  check('跨区域例 step A：facts 先依据后结果表',
    eArr >= 0 && eStart > eArr && eReady > eArr && tArr > Math.max(eStart, eReady) && Math.min(tStart, tReady) > tArr,
    JSON.stringify({ facts: stepA.facts, order: { eArr, eStart, eReady, tArr, tStart, tReady } }));
  check('跨区域例 step A：status 从不进入 Focus/attention 事实',
    stepA.facts.every((fact) => !(fact.binding === 'status' && (fact.kind === 'focus-arrival' || fact.kind === 'attention-ready'))),
    JSON.stringify(stepA.facts.filter((fact) => fact.binding === 'status')));

  const stepB = await page.evaluate(async () => {
    const XR = window.__xr;
    const host = XR.host();
    const session = XR.session();
    const rec = window.NoteDemo.timingFacts.watch(session, { label: 'cross-region-b' });
    const samples = [];
    let sampling = true;
    const tick = () => {
      if (!sampling) return;
      const row = XR.row(host, 'r2');
      samples.push({
        phase: session.getState().phase,
        hasRow2: !!row,
        row2Opacity: row ? Number(getComputedStyle(row).opacity) : -1,
        row1Opacity: XR.opacity(host, 'r1')
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    XR.button(host, '下一步').click();
    await XR.idle(session);
    sampling = false;
    const facts = XR.facts(rec);
    rec.stop();
    return {
      phase: session.getState().phase,
      frame: session.getState().settledFrameId,
      samples,
      facts,
      row1Opacity: XR.opacity(host, 'r1'),
      row2Opacity: XR.opacity(host, 'r2'),
      rowCount: host.querySelectorAll('tr[data-row-key]').length,
      status: XR.slot(host, 'status'),
      evidence: XR.slot(host, 'evidence')
    };
  });
  const hiddenNew = stepB.samples.find((sample) =>
    sample.phase === 'running' && sample.hasRow2 && sample.row2Opacity < 0.1);
  const row1Held = stepB.samples.every((sample) => sample.row1Opacity > 0.9);
  check('跨区域例 step B：第二行首目标阶段 opacity=0', !!hiddenNew, JSON.stringify(stepB.samples.slice(0, 10)));
  check('跨区域例 step B：已有行 r1 保持可见', row1Held,
    JSON.stringify(stepB.samples.filter((sample) => sample.row1Opacity <= 0.9).slice(0, 5)));
  check('跨区域例 step B：终态两行可见并停稳',
    stepB.phase === 'idle' && stepB.frame === 'step-b' && stepB.rowCount === 2 &&
      stepB.row1Opacity > 0.9 && stepB.row2Opacity > 0.9,
    JSON.stringify({ phase: stepB.phase, frame: stepB.frame, rowCount: stepB.rowCount, row1: stepB.row1Opacity, row2: stepB.row2Opacity }));
  check('跨区域例 step B：状态同步为 2 条且依据为 B',
    stepB.status.indexOf('已提交 2 条') >= 0 && stepB.evidence.indexOf('依据 B') >= 0,
    JSON.stringify({ status: stepB.status, evidence: stepB.evidence }));
  const eArrB = stepB.facts.findIndex((fact) => fact.kind === 'focus-arrival' && fact.binding === 'evidence');
  const tArrB = stepB.facts.findIndex((fact) => fact.kind === 'focus-arrival' && fact.binding === 'table');
  const tReadyB = stepB.facts.findIndex((fact) => fact.kind === 'ready' && fact.binding === 'table');
  check('跨区域例 step B：先依据后表目标', eArrB >= 0 && tArrB > eArrB && tReadyB > tArrB,
    JSON.stringify({ facts: stepB.facts, order: { eArrB, tArrB, tReadyB } }));

  const replayCancel = await page.evaluate(async () => {
    const XR = window.__xr;
    const host = XR.host();
    const session = XR.session();
    XR.button(host, '重来').click();
    await XR.idle(session);
    const afterReplay = {
      frame: session.getState().settledFrameId,
      rows: host.querySelectorAll('tr[data-row-key]').length,
      status: XR.slot(host, 'status'),
      evidence: XR.slot(host, 'evidence')
    };
    XR.button(host, '下一步').click();
    await XR.idle(session);
    const afterReplayNext = {
      frame: session.getState().settledFrameId,
      row1: XR.opacity(host, 'r1'),
      status: XR.slot(host, 'status')
    };
    XR.button(host, '下一步').click();
    const runningDeadline = performance.now() + 8000;
    while (performance.now() < runningDeadline && session.getState().phase !== 'running') {
      await new Promise((resolve) => setTimeout(resolve, 8));
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
    XR.button(host, '上一步').click();
    await XR.idle(session, 12000);
    const runningAnimations = Array.from(host.querySelectorAll('tr[data-row-key]'))
      .flatMap((row) => row.getAnimations())
      .filter((animation) => animation.playState === 'running').length;
    return {
      afterReplay,
      afterReplayNext,
      cancelled: {
        phase: session.getState().phase,
        frame: session.getState().settledFrameId,
        rows: host.querySelectorAll('tr[data-row-key]').length,
        row1: XR.opacity(host, 'r1'),
        row2: XR.opacity(host, 'r2'),
        status: XR.slot(host, 'status'),
        runningAnimations
      }
    };
  });
  check('跨区域例：重来回到初始空表与 0 条',
    replayCancel.afterReplay.frame === 'start' && replayCancel.afterReplay.rows === 0 &&
      replayCancel.afterReplay.status.indexOf('已提交 0 条') >= 0 &&
      replayCancel.afterReplay.evidence.indexOf('等待依据') >= 0,
    JSON.stringify(replayCancel.afterReplay));
  check('跨区域例：重来后再跑一步可恢复到 r1 可见',
    replayCancel.afterReplayNext.frame === 'step-a' && replayCancel.afterReplayNext.row1 > 0.9 &&
      replayCancel.afterReplayNext.status.indexOf('已提交 1 条') >= 0,
    JSON.stringify(replayCancel.afterReplayNext));
  check('跨区域例：取消后回到 step-a 且 r1 可见、r2 不残留',
    replayCancel.cancelled.phase === 'idle' && replayCancel.cancelled.frame === 'step-a' &&
      replayCancel.cancelled.rows === 1 && replayCancel.cancelled.row1 > 0.9 &&
      replayCancel.cancelled.row2 === -1 && replayCancel.cancelled.status.indexOf('已提交 1 条') >= 0 &&
      replayCancel.cancelled.runningAnimations === 0,
    JSON.stringify(replayCancel.cancelled));
  check('跨区域例推进区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  await context.close();
}

/* ---------------- reduced motion：直接终态，行可见、无焦点迁移 ---------------- */
{
  const { context, page, pageErrors } = await openWithHelpers({ reduced: true });
  const reduced = await page.evaluate(async () => {
    const XR = window.__xr;
    const host = XR.host();
    const session = XR.session();
    XR.button(host, '下一步').click();
    await XR.idle(session);
    XR.button(host, '下一步').click();
    await XR.idle(session);
    await new Promise((resolve) => setTimeout(resolve, 120));
    const rows = Array.from(host.querySelectorAll('tr[data-row-key]'));
    return {
      phase: session.getState().phase,
      frame: session.getState().settledFrameId,
      rowCount: rows.length,
      opacities: rows.map((row) => Number(getComputedStyle(row).opacity)),
      status: XR.slot(host, 'status'),
      focusShown: document.querySelectorAll('.nx-focus[data-nx-state="shown"]').length,
      runningAnimations: rows.flatMap((row) => row.getAnimations())
        .filter((animation) => animation.playState === 'running').length
    };
  });
  check('跨区域例 reduced：两步直接终态且两行可见',
    reduced.phase === 'idle' && reduced.frame === 'step-b' && reduced.rowCount === 2 &&
      reduced.opacities.every((value) => value > 0.9) && reduced.status.indexOf('已提交 2 条') >= 0,
    JSON.stringify(reduced));
  check('跨区域例 reduced：无焦点迁移与运行中动画',
    reduced.focusShown === 0 && reduced.runningAnimations === 0, JSON.stringify(reduced));
  check('跨区域例 reduced 无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  await context.close();
}

await browser.close();
const failed = checks.filter((row) => !row.ok);
console.log('SUMMARY ' + (checks.length - failed.length) + '/' + checks.length + ' passed');
if (failed.length) process.exitCode = 1;
