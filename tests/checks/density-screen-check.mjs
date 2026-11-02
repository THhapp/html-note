#!/usr/bin/env node
/*
 * 密度/同屏回归（dist「流程组合-预览」，真实 Edge）：
 * 1366×768 与 1280×900 下，滚动到每段 .fc-demo 顶部；初始与推进到中后停点后，
 * DemoStage 的 canvas/caption/controls 与“下一步”按钮 bottom 都在视口内（留少量安全边距），
 * 且 host/canvas/caption/next 文档坐标在停点间稳定；不是只看 stage 顶或第一步。
 *
 * Usage: node tests/checks/density-screen-check.mjs
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
const SAFE_MARGIN = 8;

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail) });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : ' :: ' + String(detail).slice(0, 700)));
}

const browser = await chromium.launch({ executablePath: edge, headless: true });
const pageErrors = [];

async function open(width, height) {
  const context = await browser.newContext({ viewport: { width: width, height: height } });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(width + 'x' + height + ' pageerror: ' + error.message));
  page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(width + 'x' + height + ' console: ' + message.text()); });
  await page.goto(previewUrl, { waitUntil: 'load' });
  await page.waitForFunction(() => window.FlowCompositionSessions && window.FlowCompositionSessions.length >= 2, null, { timeout: 20000 });
  return { context, page };
}

async function scrollSectionTop(page, sectionIndex) {
  await page.evaluate((index) => {
    const section = document.querySelectorAll('.fc-demo')[index];
    window.scrollTo(0, section.getBoundingClientRect().top + window.scrollY);
  }, sectionIndex);
  await page.waitForTimeout(160);
}

async function measure(page, sectionIndex) {
  return page.evaluate((index) => {
    const session = window.FlowCompositionSessions[index].session;
    const el = session.el;
    const host = el.parentElement;
    const section = document.querySelectorAll('.fc-demo')[index];
    const stageBox = el.querySelector('.nblk-demo-stage__stage');
    const caption = el.querySelector('.nblk-demo-stage__caption');
    const controls = el.querySelector('.nblk-demo-stage__controls');
    const next = Array.from(el.querySelectorAll('.nblk-demo-stage__controls button')).find((node) => node.textContent.trim() === '下一步');
    const docRect = (node) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        docTop: +(rect.top + window.scrollY).toFixed(2), docBottom: +(rect.bottom + window.scrollY).toFixed(2),
        viewportTop: +rect.top.toFixed(2), viewportBottom: +rect.bottom.toFixed(2),
        left: +rect.left.toFixed(2), width: +rect.width.toFixed(2), height: +rect.height.toFixed(2)
      };
    };
    return {
      scrollY: window.scrollY, innerHeight: window.innerHeight, pageHeight: document.documentElement.scrollHeight,
      section: docRect(section), host: docRect(host), stage: docRect(el), canvas: docRect(stageBox),
      caption: docRect(caption), controls: docRect(controls), next: docRect(next),
      settledFrameId: session.getState().settledFrameId, phase: session.getState().phase,
      captionText: (caption || {}).textContent
    };
  }, sectionIndex);
}

function checkViewportFit(label, data) {
  const viewportBottom = (rect) => (rect == null ? null : rect.viewportBottom);
  const stageBottom = viewportBottom(data.stage);
  const canvasBottom = viewportBottom(data.canvas);
  const captionBottom = viewportBottom(data.caption);
  const controlsBottom = viewportBottom(data.controls);
  const nextBottom = viewportBottom(data.next);
  const safe = data.innerHeight - SAFE_MARGIN;
  const ok = data.section.viewportTop <= 1 && data.host.viewportTop >= -1 &&
    stageBottom <= data.innerHeight && canvasBottom <= data.innerHeight &&
    captionBottom <= data.innerHeight && controlsBottom <= data.innerHeight &&
    nextBottom <= safe && nextBottom >= 0;
  check(label, ok, JSON.stringify({ innerHeight: data.innerHeight, sectionTop: data.section.viewportTop,
    stageBottom: stageBottom, canvasBottom: canvasBottom, captionBottom: captionBottom,
    controlsBottom: controlsBottom, nextBottom: nextBottom, safe: safe }).slice(0, 500));
  return ok;
}

async function run(width, height) {
  const { context, page } = await open(width, height);
  const labelPrefix = width + 'x' + height;
  for (let sectionIndex = 0; sectionIndex < 2; sectionIndex += 1) {
    const sectionName = sectionIndex === 0 ? '上段 stagePacket' : '下段 diagramTable';
    const records = [];
    await scrollSectionTop(page, sectionIndex);
    records.push({ stop: 'initial', data: await measure(page, sectionIndex) });
    let currentStep = 0;
    for (const targetStep of [1, 3, 5]) {
      for (let click = currentStep; click < targetStep; click += 1) {
        await page.locator('[data-flow-host] .nblk-demo-stage__controls button').filter({ hasText: '下一步' }).nth(sectionIndex).click();
        await page.waitForFunction((index) => window.FlowCompositionSessions[index].session.getState().phase === 'idle', sectionIndex, { timeout: 12000 });
        await page.waitForTimeout(120);
      }
      currentStep = targetStep;
      await page.waitForTimeout(100);
      await scrollSectionTop(page, sectionIndex);
      records.push({ stop: 'step' + targetStep, data: await measure(page, sectionIndex) });
    }
    const initial = records[0].data;
    const last = records[records.length - 1].data;
    const stops = records.map((record) => record.data.settledFrameId);
    const captions = records.map((record) => record.data.captionText);
    check(labelPrefix + ' ' + sectionName + '：推进到中后停点（非第一步）', stops.length === 4 &&
      stops[0] === 'idle' && stops[stops.length - 1] === 'fin' && new Set(stops).size === 4 &&
      captions[2] !== captions[0] && captions[3] !== captions[0],
      JSON.stringify({ stops: stops, captions: captions.map((text) => String(text).slice(0, 20)) }));
    for (const record of records) {
      checkViewportFit(labelPrefix + ' ' + sectionName + ' ' + record.stop + '：canvas/caption/controls/next 在视口内',
        record.data);
    }
    // 文档坐标在停点间稳定（滚动只改变 scrollY）。
    const fields = [['host', 'docTop'], ['canvas', 'docTop'], ['canvas', 'height'], ['caption', 'docTop'],
      ['caption', 'height'], ['controls', 'docTop'], ['next', 'docTop'], ['next', 'docBottom']];
    const unstable = [];
    const detail = {};
    fields.forEach((field) => {
      const values = records.map((record) => record.data[field[0]][field[1]]);
      detail[field[0] + '.' + field[1]] = values;
      if (Math.max.apply(null, values) - Math.min.apply(null, values) > 1) {
        unstable.push({ field: field[0] + '.' + field[1], values: values });
      }
    });
    check(labelPrefix + ' ' + sectionName + '：停点间文档坐标/高度稳定（≤1px）', unstable.length === 0,
      JSON.stringify({ unstable: unstable, detail: detail }).slice(0, 600));
    check(labelPrefix + ' ' + sectionName + '：section 起点可同屏且真实滚动', initial.section.viewportTop <= 1 &&
      initial.scrollY >= 0 && initial.pageHeight > initial.innerHeight &&
      last.pageHeight >= initial.pageHeight - 1,
      JSON.stringify({ sectionTop: initial.section.viewportTop, scrollY: initial.scrollY, pageHeight: initial.pageHeight, innerHeight: initial.innerHeight }));
  }
  check(labelPrefix + '：同屏区无页面/控制台错误', pageErrors.filter((entry) => entry.indexOf(labelPrefix) === 0).length === 0,
    pageErrors.filter((entry) => entry.indexOf(labelPrefix) === 0).slice(0, 4).join(' | '));
  await context.close();
}

await run(1366, 768);
await run(1280, 900);

await browser.close();
const failed = checks.filter((row) => !row.ok);
console.log('SUMMARY ' + (checks.length - failed.length) + '/' + checks.length + ' passed');
if (failed.length) process.exitCode = 1;
