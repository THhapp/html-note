#!/usr/bin/env node
/*
 * dist「流程组合-预览」稳定布局回归（真实 Edge，file:// 单文件预览）。
 * - 1280 / 900 两种宽度推进到第 2/4/6 个停点：host/stage/caption/controls/下一步按钮
 *   的文档坐标与高度稳定（≤1px），并区分真实滚动（scrollY 变化时文档坐标不变）；
 * - 1280→900→1280 回到同一停点：不恢复旧的大留白、页面高度不增长；
 * - 不能只测第一步：字幕/停点必须真实变化。
 *
 * Usage: node tests/checks/stable-layout-check.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const preview = path.join(root, 'dist', '流程组合-预览.html');
const previewUrl = 'file:///' + preview.replace(/\\/g, '/');
const TOLERANCE = 1.2;

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail) });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : ' :: ' + String(detail).slice(0, 700)));
}

const browser = await chromium.launch({ executablePath: edge, headless: true });
const pageErrors = [];

async function openPreview(width) {
  const context = await browser.newContext({ viewport: { width: width, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(width + ' pageerror: ' + error.message));
  page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(width + ' console: ' + message.text()); });
  await page.goto(previewUrl, { waitUntil: 'load' });
  await page.waitForFunction(() => window.FlowCompositionSessions && window.FlowCompositionSessions.length >= 2, null, { timeout: 20000 });
  return { context, page };
}

async function measure(page) {
  return page.evaluate(() => {
    const docRect = (node) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        docTop: +(rect.top + window.scrollY).toFixed(2), rawTop: +rect.top.toFixed(2),
        left: +rect.left.toFixed(2), width: +rect.width.toFixed(2), height: +rect.height.toFixed(2)
      };
    };
    const sessions = (window.FlowCompositionSessions || []).map((entry) => {
      const el = entry.session.el;
      const host = el.parentElement;
      const stageBox = el.querySelector('.nblk-demo-stage__stage');
      const nextButton = Array.from(el.querySelectorAll('.nblk-demo-stage__controls button')).find((node) => node.textContent.trim() === '下一步');
      return {
        phase: entry.session.getState().phase,
        settledFrameId: entry.session.getState().settledFrameId,
        host: docRect(host), stage: docRect(el), caption: docRect(el.querySelector('.nblk-demo-stage__caption')),
        controls: docRect(el.querySelector('.nblk-demo-stage__controls')), next: docRect(nextButton),
        stageBoxHeight: stageBox ? +stageBox.getBoundingClientRect().height.toFixed(2) : null,
        captionText: (el.querySelector('.nblk-demo-stage__caption') || {}).textContent,
        captionsEqual: null
      };
    });
    return {
      scrollY: window.scrollY, pageHeight: document.documentElement.scrollHeight, innerHeight: window.innerHeight,
      sessions: sessions
    };
  });
}

const NEXT_LOCATOR = (page, index) => page.locator('[data-flow-host] .nblk-demo-stage__controls button').filter({ hasText: '下一步' }).nth(index);

async function advanceTo(page, sessionIndex, targetFrameOrdinal, currentOrdinal) {
  let clicks = targetFrameOrdinal - currentOrdinal;
  for (let i = 0; i < clicks; i += 1) {
    await NEXT_LOCATOR(page, sessionIndex).click();
    await page.waitForFunction((index) => window.FlowCompositionSessions[index].session.getState().phase === 'idle', sessionIndex, { timeout: 12000 });
    await page.waitForTimeout(160);
  }
  return targetFrameOrdinal;
}

function stableField(measurements, pathKeys) {
  const values = measurements.map((item) => pathKeys.reduce((value, key) => (value == null ? null : value[key]), item));
  if (values.some((value) => value == null)) return { ok: false, values: values };
  const min = Math.min.apply(null, values);
  const max = Math.max.apply(null, values);
  return { ok: max - min <= TOLERANCE, min: min, max: max, values: values };
}

function checkStability(label, measurements, sessionIndex) {
  const fields = [
    ['host.docTop', ['host', 'docTop']], ['host.height', ['host', 'height']],
    ['stage.docTop', ['stage', 'docTop']], ['stage.height', ['stage', 'height']],
    ['caption.docTop', ['caption', 'docTop']], ['caption.height', ['caption', 'height']],
    ['controls.docTop', ['controls', 'docTop']], ['controls.height', ['controls', 'height']],
    ['next.docTop', ['next', 'docTop']], ['next.left', ['next', 'left']]
  ];
  const failed = [];
  const detail = {};
  fields.forEach((field) => {
    const result = stableField(measurements.map((item) => item.sessions[sessionIndex]), field[1]);
    detail[field[0]] = result.values;
    if (!result.ok) failed.push({ field: field[0], min: result.min, max: result.max });
  });
  const pageHeights = measurements.map((item) => item.pageHeight);
  if (Math.max.apply(null, pageHeights) - Math.min.apply(null, pageHeights) > TOLERANCE) {
    failed.push({ field: 'pageHeight', values: pageHeights });
  }
  check(label + '：第 2/4/6 停点文档坐标/高度稳定（≤1px）', failed.length === 0, JSON.stringify({ failed: failed, detail: detail }).slice(0, 700));
  return measurements.map((item) => item.sessions[sessionIndex]);
}

async function runWidth(width, sessionIndex, label) {
  const { context, page } = await openPreview(width);
  const measurements = [];
  const first = await measure(page);
  const initialCaption = first.sessions[sessionIndex].captionText;
  // 第 2 停点 = 推进 1 次；第 4 = 再 2 次；第 6 = 再 2 次。
  let ordinal = 1;
  for (const target of [2, 4, 6]) {
    ordinal = await advanceTo(page, sessionIndex, target, ordinal);
    // 真实滚动：每次测量前滚到页面中部，让 scrollY 变化；文档坐标应保持。
    await page.evaluate(() => window.scrollTo(0, Math.min(document.documentElement.scrollHeight - window.innerHeight, 240)));
    await page.waitForTimeout(120);
    measurements.push(await measure(page));
  }
  const settled = measurements.map((item) => item.sessions[sessionIndex].settledFrameId);
  const captions = measurements.map((item) => item.sessions[sessionIndex].captionText);
  const hasRealScroll = measurements.some((item) => item.scrollY > 0) && measurements.every((item) => item.pageHeight > item.innerHeight);
  check(label + '：确实推进到第 2/4/6 停点（非第一步）', settled.length === 3 &&
    settled[settled.length - 1] === 'fin' && captions[1] !== initialCaption && captions[2] !== captions[0] &&
    hasRealScroll, JSON.stringify({ settled: settled, captions: captions.map((text) => String(text).slice(0, 24)), scrollY: measurements.map((item) => item.scrollY) }));
  const steps = checkStability(label + '（第 ' + (sessionIndex === 0 ? '上段 stagePacket' : '下段 diagramTable') + '）', measurements, sessionIndex);

  // 区分真实滚动：同一停点下滚到顶/底，文档坐标不变、viewport 坐标按 scrollY 位移。
  const scrollCheck = await page.evaluate(() => {
    const el = window.FlowCompositionSessions[1].session.el;
    const host = el.parentElement;
    const read = () => {
      const rect = host.getBoundingClientRect();
      return { docTop: +(rect.top + window.scrollY).toFixed(2), rawTop: +rect.top.toFixed(2), scrollY: window.scrollY };
    };
    window.scrollTo(0, 0);
    const top = read();
    window.scrollTo(0, document.documentElement.scrollHeight - window.innerHeight);
    const bottom = read();
    return { top: top, bottom: bottom };
  });
  const scrollDelta = Math.abs(scrollCheck.bottom.scrollY - scrollCheck.top.scrollY);
  check(label + '：真实滚动下文档坐标不变（scrollY 已变化）', scrollDelta > 100 &&
    Math.abs(scrollCheck.top.docTop - scrollCheck.bottom.docTop) <= 0.6 &&
    Math.abs((scrollCheck.top.rawTop - scrollCheck.bottom.rawTop) - (scrollCheck.bottom.scrollY - scrollCheck.top.scrollY)) <= 1.5,
    JSON.stringify(scrollCheck));

  /* 宽度往返：1280→900→1280（900 运行时做 900→1280→900），同一停点不恢复旧留白。 */
  const oppositeWidth = width === 1280 ? 900 : 1280;
  const finalBefore = await measure(page);
  await page.setViewportSize({ width: oppositeWidth, height: 900 });
  await page.waitForTimeout(450);
  const mid = await measure(page);
  await page.setViewportSize({ width: width, height: 900 });
  await page.waitForTimeout(450);
  const finalAfter = await measure(page);
  const compareSession = (a, b) => {
    const fields = ['host', 'stage', 'caption', 'controls', 'next'];
    const bad = [];
    fields.forEach((field) => {
      ['docTop', 'left', 'width', 'height'].forEach((key) => {
        const delta = Math.abs((a.sessions[sessionIndex][field] || {})[key] - (b.sessions[sessionIndex][field] || {})[key]);
        if (delta > TOLERANCE) bad.push({ field: field + '.' + key, before: a.sessions[sessionIndex][field] && a.sessions[sessionIndex][field][key], after: b.sessions[sessionIndex][field] && b.sessions[sessionIndex][field][key], delta: delta });
      });
    });
    return bad;
  };
  const restoredBad = compareSession(finalBefore, finalAfter);
  const midChanged = Math.abs(mid.sessions[0].host.height - finalBefore.sessions[0].host.height) > 2 ||
    Math.abs(mid.sessions[1].host.height - finalBefore.sessions[1].host.height) > 2;
  check(label + '：' + width + '→' + oppositeWidth + '→' + width + ' 同一停点恢复原布局、无旧大留白',
    restoredBad.length === 0 && finalAfter.pageHeight <= finalBefore.pageHeight + 2 && midChanged,
    JSON.stringify({ bad: restoredBad.slice(0, 5), pageHeight: [finalBefore.pageHeight, mid.pageHeight, finalAfter.pageHeight],
      hostHeights: [finalBefore.sessions[1].host.height, mid.sessions[1].host.height, finalAfter.sessions[1].host.height],
      stageBox: [finalBefore.sessions[1].stageBoxHeight, mid.sessions[1].stageBoxHeight, finalAfter.sessions[1].stageBoxHeight] }));
  check(label + '：稳定布局区无页面/控制台错误', pageErrors.filter((entry) => entry.indexOf(label) === 0).length === 0,
    pageErrors.filter((entry) => entry.indexOf(label) === 0).slice(0, 4).join(' | '));
  await context.close();
}

await runWidth(1280, 1, '1280 下段');
await runWidth(900, 1, '900 下段');
await runWidth(1280, 0, '1280 上段');
await runWidth(900, 0, '900 上段');

await browser.close();
const failed = checks.filter((row) => !row.ok);
console.log('SUMMARY ' + (checks.length - failed.length) + '/' + checks.length + ' passed');
if (failed.length) process.exitCode = 1;
