#!/usr/bin/env node
/*
 * Flow 拆分边界回归（src 直载，真实 Edge）。
 * 逐个加载 flow-core / flow-stage / flow-packet / flow-segment / flow-device / flow.js，
 * 验证命名空间按文件增量出现、Propagation 由 flow-core 独立提供、公共入口最后发布 version/parts。
 *
 * Usage: node tests/checks/flow-split-check.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const src = (rel) => path.join(root, rel);
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const FILES = ['src/core/core.js', 'src/viz/flow-core.js', 'src/viz/flow-stage.js', 'src/viz/flow-packet.js', 'src/viz/flow-segment.js', 'src/viz/flow-device.js', 'src/viz/flow.js'];

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail) });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : ' :: ' + String(detail).slice(0, 500)));
}

const browser = await chromium.launch({ executablePath: edge, headless: true });
const context = await browser.newContext({ viewport: { width: 900, height: 700 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push('pageerror: ' + error.message));
page.on('console', (message) => { if (message.type() === 'error') pageErrors.push('console: ' + message.text()); });
await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body><main id="root"></main></body></html>');

async function snapshot(label) {
  return page.evaluate((label) => {
    const Flow = window.NoteViz && window.NoteViz.Flow;
    return {
      label: label,
      flow: !!Flow,
      version: Flow && Flow.version,
      parts: Flow && Flow.parts,
      propagation: !!(Flow && Flow.Propagation),
      stage: !!(Flow && Flow.StageTrack),
      packet: !!(Flow && Flow.PacketFlow),
      segment: !!(Flow && Flow.SegmentBar),
      device: !!(Flow && Flow.DeviceLinks),
      internals: !!window.NoteVizFlowInternals
    };
  }, label);
}

/* 1. 仅 core + flow-core：命名空间/Propagation 独立可用，四图形尚未出现。 */
await page.addScriptTag({ path: src(FILES[0]) });
await page.addScriptTag({ path: src(FILES[1]) });
let state = await snapshot('flow-core only');
check('flow-core 单独提供 Flow 命名空间/Propagation/Internals', state.flow && state.propagation && state.internals &&
  !state.stage && !state.packet && !state.segment && !state.device && !state.version,
  JSON.stringify(state));
const propagation = await page.evaluate(() => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.innerHTML = '<path id="sp-one" d="M10,40 L290,40"></path>';
  document.getElementById('root').appendChild(svg);
  const instance = window.NoteViz.Flow.Propagation.mount(svg, { paths: { p1: '#sp-one' }, copies: 2, start: 0, end: 1, label: '拆分' });
  const before = { group: !!instance.getTarget('group'), copies: !!instance.getTarget('copy-1') && !!instance.getTarget('copy-2') };
  instance.update(0.5);
  const ratio = Number(instance.getTarget('copy-1').getAttribute('data-ratio'));
  instance.destroy();
  const after = instance.getTarget('group');
  svg.remove();
  return { before: before, ratio: ratio, after: after };
});
check('flow-core 的 Propagation 可独立挂载/推进/销毁', propagation.before.group && propagation.before.copies &&
  Math.abs(propagation.ratio - 0.5) < 0.001 && propagation.after === null, JSON.stringify(propagation));

/* 2. 逐个加载四图形文件：每步只增量出现对应部件。 */
const expected = [
  { file: FILES[2], key: 'stage', label: 'flow-stage' },
  { file: FILES[3], key: 'packet', label: 'flow-packet' },
  { file: FILES[4], key: 'segment', label: 'flow-segment' },
  { file: FILES[5], key: 'device', label: 'flow-device' }
];
const keys = ['stage', 'packet', 'segment', 'device'];
for (const item of expected) {
  await page.addScriptTag({ path: src(item.file) });
  state = await snapshot(item.label);
  const index = keys.indexOf(item.key);
  const beforeKeys = keys.slice(0, index);
  const afterKeys = keys.slice(index + 1);
  check(item.label + ' 只增量发布自身部件', state[item.key] === true &&
    beforeKeys.every((key) => state[key] === true) && afterKeys.every((key) => state[key] === false) &&
    state.flow && state.propagation && !state.version,
    JSON.stringify(state));
}

/* 3. 最后 flow.js：只发布 version/parts/propagation 元数据。 */
await page.addScriptTag({ path: src(FILES[6]) });
state = await snapshot('flow.js entry');
check('flow.js 最后发布 version/parts 且不覆盖四部件', state.version === '1.0.0' &&
  Array.isArray(state.parts) && state.parts.join(',') === 'StageTrack,PacketFlow,SegmentBar,DeviceLinks' &&
  state.propagation && state.stage && state.packet && state.segment && state.device,
  JSON.stringify(state));

/* 4. 拆分顺序不依赖 demo/runtime：页面只加载 core + 六个 flow 文件即可用。 */
const standalone = await page.evaluate(() => {
  const Flow = window.NoteViz.Flow;
  const host = document.createElement('div');
  document.getElementById('root').appendChild(host);
  const stage = Flow.StageTrack.mount(host, { stages: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], current: 'b', target: null });
  const target = stage.getTarget('b');
  stage.update({ current: 'a', target: 'b' });
  const after = stage.getTarget('b').getAttribute('data-target');
  stage.destroy();
  host.remove();
  return { target: !!target, after: after, noDemo: !window.NoteDemo && !window.NoteDemoInternals };
});
check('拆分产物不依赖 demo/runtime 即可挂载', standalone.target && standalone.after === 'true' && standalone.noDemo, JSON.stringify(standalone));
check('flow-split 区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));

await context.close();
await browser.close();
const failed = checks.filter((row) => !row.ok);
console.log('SUMMARY ' + (checks.length - failed.length) + '/' + checks.length + ' passed');
if (failed.length) process.exitCode = 1;
