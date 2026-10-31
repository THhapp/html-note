// 主控图形对象检查：矩阵、图、时间线、层级图、对照。
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { writeCacheJson } from '../lib/test-output.mjs';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hostUrl = pathToFileURL(path.join(root, 'tests', 'checks', 'host.html')).href;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const results = [];
const errors = [];
function ok(name, pass, detail = '') {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
  if (!pass) console.log('  ✗ ' + name + ' ' + detail);
}
const browser = await chromium.launch({ executablePath: edge, headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
async function fresh() {
  errors.length = 0;
  await page.goto(hostUrl, { waitUntil: 'load' });
  await page.evaluate(() => { window.__h = {}; });
  await page.waitForTimeout(80);
}

// D02 Matrix
await fresh();
{
  const state = await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.matrix = NoteViz.Matrix.mount(host, {
      rows: [{ id: 'r1', label: '行一' }, { id: 'r2', label: '行二' }],
      columns: [{ id: 'c1', label: '列一' }, { id: 'c2', label: '列二' }],
      values: [[1, 0], [0, 1]],
      focus: { row: 'r1', col: 'c2' },
      changed: { cells: [{ row: 'r2', col: 'c1' }] }
    });
    const target = window.__h.matrix.getTarget({ row: 'r1', col: 'c2' });
    window.__h.matrix.update({ values: [[1, 1], [1, 1]], focus: { row: 'r2' } });
    const after = window.__h.matrix.getTarget({ row: 'r1', col: 'c2' });
    return { rows: host.querySelectorAll('tbody tr').length, target: !!target, same: target === after, afterText: after?.textContent || '' };
  });
  ok('Matrix renders rows and stable cell target', state.rows === 2 && state.target && state.same && /1/.test(state.afterText), JSON.stringify(state));
}

// D03 Graph manual/layered + unique markers
await fresh();
{
  const state = await page.evaluate(() => {
    const host = document.getElementById('host');
    const box1 = document.createElement('div'); host.appendChild(box1);
    const box2 = document.createElement('div'); host.appendChild(box2);
    window.__h.g1 = NoteViz.Graph.mount(box1, {
      nodes: [{ id: 'a', label: '入口' }, { id: 'b', label: '处理' }, { id: 'c', label: '出口' }],
      edges: [{ id: 'ab', from: 'a', to: 'b', label: '进入', directed: true }, { id: 'bc', from: 'b', to: 'c', label: '完成', directed: true }],
      layout: 'layered',
      focus: ['b'], changed: ['c']
    });
    window.__h.g2 = NoteViz.Graph.mount(box2, {
      nodes: [{ id: 'x', label: '甲', x: 40, y: 40 }, { id: 'y', label: '乙', x: 260, y: 120 }],
      edges: [{ from: 'x', to: 'y' }],
      layout: 'manual'
    });
    const markerIds = Array.from(document.querySelectorAll('marker')).map(m => m.id);
    const target = window.__h.g1.getTarget('b');
    window.__h.g1.update({ nodes: [{ id: 'a', label: '入口' }, { id: 'b', label: '处理中' }, { id: 'c', label: '出口' }], edges: [{ from: 'a', to: 'b', directed: true }, { from: 'b', to: 'c', directed: true }], focus: ['c'] });
    return {
      svgs: document.querySelectorAll('svg').length,
      target: !!target,
      stable: target === window.__h.g1.getTarget('b'),
      markerUnique: new Set(markerIds).size === markerIds.length,
      markers: markerIds.length,
      label: window.__h.g1.getTarget('b')?.textContent || ''
    };
  });
  ok('Graph layered/manual render with unique markers', state.svgs >= 2 && state.target && state.stable && state.markerUnique, JSON.stringify(state));
}

// D04 Timeline
await fresh();
{
  const state = await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.timeline = NoteViz.Timeline.mount(host, {
      orientation: 'horizontal',
      items: [
        { id: 'e1', label: '开始', time: '09:00', description: '启动' },
        { id: 'e2', label: '区间', start: '09:10', end: '09:30', description: '处理中' },
        { id: 'e3', label: '结束', time: '09:40' }
      ],
      current: 'e2', focus: ['e2'], changed: ['e2']
    });
    const before = window.__h.timeline.getTarget('e2');
    window.__h.timeline.update({ items: [
      { id: 'e1', label: '开始', time: '09:00' },
      { id: 'e2', label: '区间', start: '09:10', end: '09:35' },
      { id: 'e3', label: '结束', time: '09:45' }
    ], current: 'e3' });
    return { target: !!before, stable: before === window.__h.timeline.getTarget('e2'), current: window.__h.timeline.getValue ? window.__h.timeline.getValue() : null };
  });
  ok('Timeline renders and keeps object targets', state.target && state.stable, JSON.stringify(state));
}

// D05 TreeDiagram
await fresh();
{
  const state = await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.tree = NoteViz.TreeDiagram.mount(host, {
      direction: 'right',
      nodes: [{ id: 'root', label: '根', children: [{ id: 'a', label: '子甲' }, { id: 'b', label: '子乙', children: [{ id: 'b1', label: '孙' }] }] }],
      focus: ['b'], changed: ['b1']
    });
    const target = window.__h.tree.getTarget('b');
    window.__h.tree.update({ nodes: [{ id: 'root', label: '根', children: [{ id: 'a', label: '子甲' }, { id: 'b', label: '子乙' }] }] });
    return { target: !!target, stable: target === window.__h.tree.getTarget('b'), text: target?.textContent || '' };
  });
  ok('TreeDiagram renders hierarchy with stable target', state.target && state.stable && /子乙/.test(state.text), JSON.stringify(state));
}

// D06 CompareView stacked/side
await fresh();
{
  const state = await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.compare = NoteViz.CompareView.mount(host, {
      left: { title: '变更前', content: '旧值' },
      right: { title: '变更后', content: '新值' },
      focusChanged: true
    });
    const left = window.__h.compare.getTarget('left');
    const right = window.__h.compare.getTarget('right');
    window.__h.compare.update({ mode: 'stacked', left: { title: '变更前', content: '旧值二' }, right: { title: '变更后', content: '新值二' } });
    return { left: !!left, right: !!right, mode: window.__h.compare.el.getAttribute('data-mode') || '', text: window.__h.compare.el.textContent };
  });
  ok('CompareView has both panes and stacked mode', state.left && state.right && /新值二/.test(state.text), JSON.stringify(state));
}

await browser.close();
const failed = results.filter(r => !r.pass);
const summary = { checks: results.length, passed: results.length - failed.length, failed: failed.length, failures: failed, errors: errors.slice(0, 30) };
writeCacheJson(root, ['checks', 'high-risk-viz.json'], { summary, results });
console.log(JSON.stringify(summary, null, 2));
if (failed.length) process.exitCode = 1;
