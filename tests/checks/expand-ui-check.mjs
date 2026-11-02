#!/usr/bin/env node
/*
 * 设计 6.8 / F10 扩展 UI 回归：NoteUI.Slider 的 ticks 与 segments。
 * - 线性默认行为回归（原生值域、getValue、aria-valuetext、ticks 默认隐藏）；
 * - ticks：默认隐藏、传 ticks 后可见、format/自定义/空 label 规则、越界 mount/update 抛 TypeError 且不改旧 DOM；
 * - segments：原生 input 位置域 0–1000、指针位置→真实值映射、aria-valuetext、键盘按真实 step 映射、
 *   update 坏 segments 或 min/max 冲突抛错且旧值/旧域不变、segments:null 回线性；
 * - segments + range 双输入的位置域与真实值。
 *
 * Loads src directly through tests/lib/src-sources.mjs. Usage: node tests/checks/expand-ui-check.mjs
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
const MODULES = ['core', 'legacy', 'ui-forms-basic', 'ui-forms-advanced'];
const STYLES = moduleStyles(root, MODULES);
const SCRIPTS = moduleScripts(root, MODULES);

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail) });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : ' :: ' + String(detail).slice(0, 500)));
}

const browser = await chromium.launch({ executablePath: edge, headless: true });
const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push('pageerror: ' + error.message));
page.on('console', (message) => { if (message.type() === 'error') pageErrors.push('console: ' + message.text()); });
await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}body{padding:20px;background:#f4f6f9}#root{max-width:760px;margin:0 auto}</style></head><body><main id="root"></main></body></html>');
for (const rel of STYLES) await page.addStyleTag({ path: src(rel) });
for (const rel of SCRIPTS) await page.addScriptTag({ path: src(rel) });

const rows = await page.evaluate(() => {
  const out = [];
  const check = (name, ok, detail) => out.push({ name: name, ok: !!ok, detail: detail == null ? '' : String(detail) });
  const rootEl = document.getElementById('root');
  function host() { const node = document.createElement('div'); rootEl.appendChild(node); return node; }
  function mountSlider(options) { const node = host(); const instance = NoteUI.Slider.mount(node, options); return { host: node, instance: instance }; }
  function inputOf(instance) { return instance.el.querySelector('.nui-slider__input'); }
  function ticksEl(instance) { return instance.el.querySelector('.nui-slider__ticks'); }
  function tickLabels(instance) {
    return Array.from(instance.el.querySelectorAll('.nui-slider__tick')).map((tick) => {
      const label = tick.querySelector('.nui-slider__tick-label');
      return { left: parseFloat(tick.style.left), text: label ? label.textContent : null };
    });
  }
  function segmentedInputPosition(value) {
    // 与实现一致的 0-1000 位置域：0-10 映射 0-500，10-100 映射 500-1000。
    if (value <= 10) return String(Math.round((value / 10) * 50 * 10));
    return String(Math.round((50 + ((value - 10) / 90) * 50) * 10));
  }
  function key(input, name) {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
  }
  function pointer(input, value) {
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function typeError(fn) {
    try { fn(); return null; } catch (error) { return { name: error.name, message: String(error.message) }; }
  }
  if (!NoteUI.Slider) { check('NoteUI.Slider 可用', false, '缺少 Slider'); return out; }

  /* ---------- 1. 线性默认 ---------- */
  const linear = mountSlider({ min: 0, max: 100, step: 5, value: 20, format: function (value) { return String(value) + ' 分'; } });
  const linearInput = inputOf(linear.instance);
  check('线性 Slider：原生 input 保持真实值域', linearInput.type === 'range' && linearInput.min === '0' &&
    linearInput.max === '100' && linearInput.step === '5' && linearInput.value === '20',
    JSON.stringify({ min: linearInput.min, max: linearInput.max, step: linearInput.step, value: linearInput.value }));
  check('线性 Slider：getValue/aria-valuetext/readout 回归', linear.instance.getValue() === 20 &&
    linearInput.getAttribute('aria-valuetext') === '20 分', JSON.stringify({ getValue: linear.instance.getValue(), aria: linearInput.getAttribute('aria-valuetext') }));
  check('线性 Slider：未传 ticks 时刻度区隐藏', ticksEl(linear.instance).hidden === true &&
    ticksEl(linear.instance).childElementCount === 0);
  linear.instance.update({ value: 45 });
  check('线性 Slider：update 值仍写回真实值域', linear.instance.getValue() === 45 && linearInput.value === '45',
    JSON.stringify({ value: linearInput.value }));
  linear.instance.destroy();
  linear.host.remove();

  /* ---------- 2. ticks ---------- */
  const ticksCase = mountSlider({ min: 0, max: 100, step: 1, value: 0,
    ticks: [0, { value: 50, label: '半' }, { value: 100, label: '' }, 25] });
  const ticksBox = ticksEl(ticksCase.instance);
  const labels = tickLabels(ticksCase.instance);
  check('ticks：传入后刻度区可见且按 value 排序', ticksBox.hidden === false && ticksBox.childElementCount === 4 &&
    labels.length === 4 && labels[0].left <= labels[1].left && labels[1].left <= labels[2].left && labels[2].left <= labels[3].left,
    JSON.stringify(labels));
  check('ticks：标签规则（默认 format、自定义、空串不写字）', labels[0].text === '0' && labels[1].text === '25' &&
    labels[2].text === '半' && labels[3].text === null, JSON.stringify(labels));
  const formattedTicks = mountSlider({ min: 0, max: 100, step: 1, value: 0, format: function (value) { return value + '%'; }, ticks: [0, 100] });
  check('ticks：默认标签使用 format', JSON.stringify(tickLabels(formattedTicks.instance).map((item) => item.text)) === JSON.stringify(['0%', '100%']),
    JSON.stringify(tickLabels(formattedTicks.instance)));
  formattedTicks.instance.destroy();
  formattedTicks.host.remove();
  const outOfRangeHost = host();
  const outOfRange = typeError(function () { NoteUI.Slider.mount(outOfRangeHost, { min: 0, max: 100, step: 1, value: 0, ticks: [150] }); });
  check('ticks：越界 mount 抛 TypeError 且不写入宿主', !!outOfRange && outOfRange.name === 'TypeError' &&
    /NoteUI\.Slider/.test(outOfRange.message) && /ticks/.test(outOfRange.message) && outOfRangeHost.childElementCount === 0,
    JSON.stringify(outOfRange));
  const labelsBefore = JSON.stringify(tickLabels(ticksCase.instance));
  const badTicks = typeError(function () { ticksCase.instance.update({ ticks: [200] }); });
  check('ticks：越界 update 抛 TypeError 且旧刻度不变', !!badTicks && badTicks.name === 'TypeError' &&
    /NoteUI\.Slider/.test(badTicks.message) && JSON.stringify(tickLabels(ticksCase.instance)) === labelsBefore,
    JSON.stringify({ error: badTicks, labels: tickLabels(ticksCase.instance) }));
  const badTicksType = typeError(function () { ticksCase.instance.update({ ticks: 'x' }); });
  check('ticks：update 非数组抛 TypeError', !!badTicksType && badTicksType.name === 'TypeError' && /ticks/.test(badTicksType.message),
    JSON.stringify(badTicksType));
  ticksCase.instance.destroy();
  ticksCase.host.remove();

  /* ---------- 3. segments 映射 ---------- */
  const SEGMENTS = [
    { valueStart: 0, valueEnd: 10, positionStart: 0, positionEnd: 50 },
    { valueStart: 10, valueEnd: 100, positionStart: 50, positionEnd: 100 }
  ];
  const segmented = mountSlider({ min: 0, max: 100, step: 1, value: 5, segments: SEGMENTS });
  const segInput = inputOf(segmented.instance);
  check('segments：原生 input 使用 0–1000 位置域', segInput.min === '0' && segInput.max === '1000' && segInput.step === '1' &&
    segInput.value === '250', JSON.stringify({ min: segInput.min, max: segInput.max, step: segInput.step, value: segInput.value }));
  check('segments：真实值/aria-valuetext/getValue 一致', segmented.instance.getValue() === 5 &&
    segInput.getAttribute('aria-valuetext') === '5', JSON.stringify({ value: segInput.value, aria: segInput.getAttribute('aria-valuetext'), getValue: segmented.instance.getValue() }));
  pointer(segInput, 750);
  check('segments：指针位置→真实值映射（750→55）', segmented.instance.getValue() === 55 && segInput.value === '750' &&
    segInput.getAttribute('aria-valuetext') === '55',
    JSON.stringify({ getValue: segmented.instance.getValue(), input: segInput.value, aria: segInput.getAttribute('aria-valuetext') }));
  key(segInput, 'ArrowRight');
  check('segments：ArrowRight 按真实 step 递增', segmented.instance.getValue() === 56 && segInput.value === segmentedInputPosition(56) &&
    segInput.getAttribute('aria-valuetext') === '56', JSON.stringify({ value: segmented.instance.getValue(), input: segInput.value, expectedInput: segmentedInputPosition(56) }));
  key(segInput, 'PageUp');
  check('segments：PageUp 按 10 step 递增', segmented.instance.getValue() === 66 && segInput.value === segmentedInputPosition(66),
    JSON.stringify({ value: segmented.instance.getValue(), input: segInput.value, expectedInput: segmentedInputPosition(66) }));
  key(segInput, 'PageDown');
  key(segInput, 'Home');
  check('segments：Home 回真实 min', segmented.instance.getValue() === 0 && segInput.value === '0' &&
    segInput.getAttribute('aria-valuetext') === '0', JSON.stringify({ value: segmented.instance.getValue(), input: segInput.value }));
  key(segInput, 'End');
  check('segments：End 到真实 max', segmented.instance.getValue() === 100 && segInput.value === '1000' &&
    segInput.getAttribute('aria-valuetext') === '100', JSON.stringify({ value: segmented.instance.getValue(), input: segInput.value }));
  const domainBefore = { min: segInput.min, max: segInput.max, step: segInput.step, value: segInput.value, getValue: segmented.instance.getValue() };
  const badSegments = typeError(function () { segmented.instance.update({ segments: [{ valueStart: 0, valueEnd: 5, positionStart: 0, positionEnd: 100 }] }); });
  check('segments：坏 update 抛 TypeError 且旧值/旧域不变', !!badSegments && badSegments.name === 'TypeError' &&
    /NoteUI\.Slider/.test(badSegments.message) && /最后一段的 valueEnd 必须等于 max/.test(badSegments.message) &&
    segInput.min === domainBefore.min && segInput.max === domainBefore.max && segInput.step === domainBefore.step &&
    segInput.value === domainBefore.value && segmented.instance.getValue() === domainBefore.getValue,
    JSON.stringify({ error: badSegments }));
  const conflict = typeError(function () { segmented.instance.update({ min: 10 }); });
  check('segments：min/max 与分段冲突 update 抛错且旧域不变', !!conflict && conflict.name === 'TypeError' &&
    /segments/.test(conflict.message) && segInput.min === domainBefore.min && segInput.max === domainBefore.max &&
    segInput.step === domainBefore.step && segInput.value === domainBefore.value &&
    segmented.instance.getValue() === domainBefore.getValue,
    JSON.stringify({ error: conflict }));
  segmented.instance.update({ segments: null });
  const linearAgain = inputOf(segmented.instance);
  check('segments：update segments:null 回到线性域', linearAgain.min === '0' && linearAgain.max === '100' && linearAgain.step === '1' &&
    linearAgain.value === '100' && linearAgain.getAttribute('aria-valuetext') === '100' && segmented.instance.getValue() === 100,
    JSON.stringify({ min: linearAgain.min, max: linearAgain.max, value: linearAgain.value, getValue: segmented.instance.getValue() }));
  segmented.instance.update({ value: 30 });
  check('segments：回线性后值更新仍正常', segmented.instance.getValue() === 30 && linearAgain.value === '30',
    JSON.stringify({ value: linearAgain.value }));
  segmented.instance.destroy();
  segmented.host.remove();

  /* ---------- 4. segments + range ---------- */
  const rangeSegmented = mountSlider({ min: 0, max: 100, step: 1, range: true, value: [5, 55], segments: SEGMENTS });
  const rangeInputs = Array.from(rangeSegmented.instance.el.querySelectorAll('.nui-slider__input'));
  const low = rangeInputs.find((node) => node.dataset.part === 'low');
  const high = rangeInputs.find((node) => node.dataset.part === 'high');
  check('segments+range：双输入位置域与真实值', !!low && !!high && low.min === '0' && low.max === '1000' &&
    high.min === '0' && high.max === '1000' && low.value === '250' && high.value === '750' &&
    JSON.stringify(rangeSegmented.instance.getValue()) === JSON.stringify([5, 55]) &&
    low.getAttribute('aria-valuetext') === '5' && high.getAttribute('aria-valuetext') === '55',
    JSON.stringify({ low: low && low.value, high: high && high.value, getValue: rangeSegmented.instance.getValue() }));
  key(low, 'ArrowRight');
  check('segments+range：低值键盘按真实 step', rangeSegmented.instance.getValue()[0] === 6 && low.value === segmentedInputPosition(6),
    JSON.stringify({ getValue: rangeSegmented.instance.getValue(), low: low.value, expected: segmentedInputPosition(6) }));
  rangeSegmented.instance.destroy();
  rangeSegmented.host.remove();
  return out;
});
for (const row of rows) check(row.name, row.ok, row.detail);
check('expand-ui 区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
await context.close();
await browser.close();
const failed = checks.filter((row) => !row.ok);
console.log('SUMMARY ' + (checks.length - failed.length) + '/' + checks.length + ' passed');
if (failed.length) process.exitCode = 1;
