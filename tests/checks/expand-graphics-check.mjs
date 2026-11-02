#!/usr/bin/env node
/*
 * 扩库代表性回归（src 直载，真实 Edge）：
 * - C06 Table：行/单元 target、state/getState、update 节点复用；
 * - D03 Graph：边 target、edgeFocus/edgeChanged、路径/点/长度查询、更新复用；
 * - attention range：local outset/inset 与 union optional 的编译规范化与运行时几何/错误。
 *
 * Usage: node tests/checks/expand-graphics-check.mjs
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
const MODULES = ['core', 'legacy', 'ui-layout', 'ui-content', 'blocks', 'viz-objects', 'viz-mechanisms', 'demo-runtime', 'demo-ui'];
const STYLES = moduleStyles(root, MODULES);
const SCRIPTS = moduleScripts(root, MODULES);

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail) });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : ' :: ' + String(detail).slice(0, 500)));
}

const browser = await chromium.launch({ executablePath: edge, headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push('pageerror: ' + error.message));
page.on('console', (message) => { if (message.type() === 'error') pageErrors.push('console: ' + message.text()); });
await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}body{padding:16px;background:#f4f6f9}#root{max-width:1100px;margin:0 auto}.range-target{position:fixed;left:120px;top:140px;width:160px;height:60px;background:#dce8ff;border:1px solid #9db2d6}</style></head><body><main id="root"></main></body></html>');
for (const rel of STYLES) await page.addStyleTag({ path: src(rel) });
for (const rel of SCRIPTS) await page.addScriptTag({ path: src(rel) });

const rows = await page.evaluate(async () => {
  const out = [];
  const check = (name, ok, detail) => out.push({ name: name, ok: !!ok, detail: detail == null ? '' : String(detail) });
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rootEl = document.getElementById('root');

  /* ================= C06 Table ================= */
  if (!window.NoteUI || !window.NoteUI.Table) { check('NoteUI.Table 可用', false, '缺 Table'); return out; }
  const tableHost = document.createElement('div');
  rootEl.appendChild(tableHost);
  const columns = [{ key: 'name', label: '名称' }, { key: 'score', label: '分数', align: 'end' }, { key: 'note', label: '说明' }];
  function row(id, name, score, note, extra) { return Object.assign({ id: id, name: name, score: score, note: note }, extra || {}); }
  const rowsData = [row('a', 'Alpha', 12, '一'), row('b', 'Beta', 5, '二'), row('c', 'Gamma', 9, '三')];
  const table = window.NoteUI.Table.mount(tableHost, { columns: columns, rows: rowsData, rowKey: 'id', caption: '示例数据' });
  const trA = table.getTarget('a');
  const tdScore = table.getTarget({ row: 'a', column: 'score' });
  check('C06 行/单元 target 与别名', !!trA && trA.tagName === 'TR' && !!tdScore && tdScore.tagName === 'TD' &&
    table.getTarget({ row: 'a', col: 'score' }) === tdScore &&
    table.getTarget({ row: 'a', column: 'score', part: 'cell' }) === tdScore &&
    table.getTarget({ row: 'a', column: 'score', part: 'row' }) === trA &&
    table.getTarget('zzz') === null && table.getTarget({ row: 'a', column: 'zzz' }) === null,
    JSON.stringify({ row: !!trA, cell: !!tdScore }));
  const states = [
    row('a', 'Alpha', 12, '一', { state: 'current', cellStates: { score: { type: 'changed', label: '已更新' } } }),
    row('b', 'Beta', 5, '二', { state: { type: 'added', label: '新增' } }),
    row('c', 'Gamma', 9, '三')
  ];
  table.update({ rows: states });
  const cellState = table.getTarget({ row: 'a', column: 'score' });
  check('C06 行/单元 state 属性与标签', table.getTarget('a').getAttribute('data-row-state') === 'current' &&
    table.getTarget('b').getAttribute('data-row-state') === 'added' &&
    table.getTarget('b').querySelector('.nui-table__state') && table.getTarget('b').querySelector('.nui-table__state').textContent === '新增' &&
    cellState.getAttribute('data-cell-state') === 'changed' &&
    cellState.querySelector('.nui-table__state') && cellState.querySelector('.nui-table__state').textContent === '已更新',
    JSON.stringify({ row: table.getTarget('a').getAttribute('data-row-state'), cell: cellState.getAttribute('data-cell-state') }));
  const snapshot = table.getState();
  check('C06 getState 形状（columns/rows/cells/states/empty/sort）', !!snapshot && snapshot.columns.length === 3 &&
    snapshot.rows.map(function (item) { return item.key; }).join(',') === 'a,b,c' &&
    snapshot.rows[0].cells && snapshot.rows[0].cells.length === 3 &&
    snapshot.rows[0].states.some(function (state) { return state.type === 'current'; }) &&
    snapshot.rows[0].cells[1].states.some(function (state) { return state.type === 'changed'; }) &&
    snapshot.empty === false && snapshot.sort && typeof snapshot.sort.enabled === 'boolean',
    JSON.stringify({ rows: snapshot && snapshot.rows.length, empty: snapshot && snapshot.empty }));
  table.update({ rows: rowsData });
  check('C06 值更新复用行/单元节点', table.getTarget('a') === trA && table.getTarget({ row: 'a', column: 'score' }) === tdScore &&
    tdScore.textContent === '12', JSON.stringify({ rowSame: table.getTarget('a') === trA, cellSame: table.getTarget({ row: 'a', column: 'score' }) === tdScore }));
  const reordered = [rowsData[2], rowsData[0], rowsData[1]];
  table.update({ rows: reordered });
  check('C06 重排复用节点并更新顺序', table.getTarget('a') === trA &&
    Array.from(table.el.querySelectorAll('tbody .nui-table__row')).map(function (node) { return node.getAttribute('data-row-key'); }).join(',') === 'c,a,b');
  table.update({ rows: [] });
  check('C06 空数据 target 失效且 getState().empty', table.getTarget('a') === null && table.getState().empty === true);
  table.destroy();
  check('C06 destroy 后 target/getState 为 null', table.getTarget('a') === null && table.getState() === null);
  tableHost.remove();

  /* ================= D03 Graph 边 ================= */
  if (!window.NoteViz || !window.NoteViz.Graph) { check('NoteViz.Graph 可用', false, '缺 Graph'); return out; }
  const graphHost = document.createElement('div');
  graphHost.style.width = '760px';
  rootEl.appendChild(graphHost);
  const node = (id, x, y) => ({ id: id, label: id.toUpperCase(), x: x, y: y });
  const baseNodes = [node('a', 120, 110), node('b', 440, 110), node('c', 440, 330), node('d', 120, 330)];
  const baseEdges = [
    { id: 'ab', from: 'a', to: 'b', label: '进入', directed: true },
    { from: 'b', to: 'c', label: '通过' },
    { from: 'a', to: 'b', label: '并行' },
    { from: 'c', to: 'c', label: '自环' },
    { from: 'x', to: 'a' }
  ];
  const graph = window.NoteViz.Graph.mount(graphHost, { nodes: baseNodes, edges: baseEdges, layout: 'manual', label: '流程图' });
  const edgeIds = Array.from(graph.el.querySelectorAll('.nviz-graph__edge')).map(function (group) { return group.getAttribute('data-edge-id'); });
  check('D03 边稳定派生 ID 与 target', edgeIds.length === 4 && edgeIds[0] === 'ab' && edgeIds[1] === 'b -> c' &&
    edgeIds[2] === 'a -> b #2' && edgeIds[3] === 'c -> c' && new Set(edgeIds).size === 4 &&
    graph.getEdgeTarget('ab') === graph.el.querySelector('.nviz-graph__edge') &&
    graph.getEdgeTarget('missing') === null && graph.getTarget('ab') === null,
    JSON.stringify(edgeIds));
  const path = graph.getEdgePath('ab');
  const length = graph.getEdgeLength('ab');
  const info = graph.getEdgeInfo('ab');
  const p0 = graph.getEdgePoint('ab', 0);
  const p1 = graph.getEdgePoint('ab', 1);
  const pm = graph.getEdgePoint('ab', 0.5);
  check('D03 路径/长度/端点/点查询', !!path && path.tagName === 'path' && typeof length === 'number' && length > 0 &&
    info && info.from === 'a' && info.to === 'b' && info.directed === true &&
    p0 && p1 && pm && Math.abs(p0.x - p1.x) > 10 && Math.abs(pm.x - (p0.x + p1.x) / 2) < 2 &&
    graph.getEdgeLength('missing') === null && graph.getEdgePoint('missing', 0.5) === null,
    JSON.stringify({ length: length, info: info && info.id }));
  graph.update({ edgeFocus: ['ab'], edgeChanged: ['b -> c'] });
  check('D03 edgeFocus/edgeChanged 标记且不污染节点', graph.getEdgeTarget('ab').getAttribute('data-mark') === 'focus' &&
    graph.getEdgeTarget('b -> c').getAttribute('data-mark') === 'changed' &&
    graph.getEdgeTarget('c -> c').getAttribute('data-mark') === 'none' &&
    Array.from(graph.el.querySelectorAll('.nviz-graph__node')).every(function (el) { return el.getAttribute('data-mark') === 'none'; }) &&
    getComputedStyle(graph.getEdgePath('ab')).strokeDasharray !== 'none',
    JSON.stringify({ ab: graph.getEdgeTarget('ab').getAttribute('data-mark') }));
  const groupAb = graph.getEdgeTarget('ab');
  const pathAb = graph.getEdgePath('ab');
  graph.update({ edges: baseEdges.slice(0, 4), edgeFocus: ['ab'], edgeChanged: [] });
  check('D03 更新复用边 group/path', graph.getEdgeTarget('ab') === groupAb && graph.getEdgePath('ab') === pathAb &&
    graph.getEdgeTarget('ab').getAttribute('data-mark') === 'focus');
  graph.update({ edges: baseEdges.slice(0, 2) });
  check('D03 移除边后 target 失效', graph.getEdgeTarget('c -> c') === null && graph.getEdgeTarget('a -> b #2') === null);
  graph.destroy();
  check('D03 destroy 后边 API 为 null', graph.getEdgeTarget('ab') === null && graph.getEdgeInfo('ab') === null &&
    graphHost.querySelectorAll('.nviz-graph').length === 0);
  graphHost.remove();

  /* ================= attention range：编译 ================= */
  function domDefinition(attention) {
    return {
      bindings: { a: { adapter: 'dom', slot: 'a' }, b: { adapter: 'dom', slot: 'b' } },
      frames: [
        { id: 'f0', caption: '0', views: { a: { text: 'A0' }, b: { text: 'B0' } }, marks: [] },
        { id: 'f1', caption: '1', views: { a: { text: 'A1' }, b: { text: 'B1' } }, marks: [] }
      ],
      transitions: [{ from: 'f0', to: 'f1', scene: { bindings: [{ binding: 'a' }, { binding: 'b' }], attention: attention } }]
    };
  }
  function prepareAttention(attention) {
    return window.NoteDemoInternals.definition.prepare(domDefinition(attention)).transitions.f0.scene.attention;
  }
  function prepareError(attention) {
    try { prepareAttention(attention); return null; } catch (error) { return String(error.message); }
  }
  const outset = prepareAttention({ targets: [{ binding: 'a', query: { part: 'value' }, range: { kind: 'local', outset: 12 } }] });
  check('attention local outset 编译规范化', JSON.stringify(outset.targets[0].range) === JSON.stringify({ kind: 'local', outset: 12 }), JSON.stringify(outset.targets[0].range));
  const inset = prepareAttention({ targets: [{ binding: 'a', query: { part: 'value' }, range: { kind: 'local', inset: 4 } }] });
  check('attention local inset 编译规范化', JSON.stringify(inset.targets[0].range) === JSON.stringify({ kind: 'local', inset: 4 }), JSON.stringify(inset.targets[0].range));
  const union = prepareAttention({ targets: [{ binding: 'a', query: { part: 'value' }, range: { kind: 'union', refs: [
    { binding: 'b', query: { part: 'value' }, optional: true },
    { binding: 'a', query: { part: 'root' }, optional: false }
  ] } }] });
  const refs = union.targets[0].range.refs;
  check('attention union optional 只保留 true', JSON.stringify(refs) === JSON.stringify([{ binding: 'b', query: { part: 'value' }, optional: true }, { binding: 'a', query: { part: 'root' } }]),
    JSON.stringify(refs));
  const badMix = prepareError({ targets: [{ binding: 'a', query: { part: 'value' }, range: { kind: 'local', outset: 4, dx: 1 } }] });
  check('attention 拒绝 outset 与绝对偏移混用', !!badMix && /outset|inset/.test(badMix) && /互斥/.test(badMix), badMix && badMix.slice(0, 200));
  const badBoth = prepareError({ targets: [{ binding: 'a', query: { part: 'value' }, range: { kind: 'local', outset: 4, inset: 2 } }] });
  check('attention 拒绝 outset 与 inset 同时声明', !!badBoth && /outset/.test(badBoth) && /inset/.test(badBoth), badBoth && badBoth.slice(0, 200));
  const badNegative = prepareError({ targets: [{ binding: 'a', query: { part: 'value' }, range: { kind: 'local', outset: -2 } }] });
  check('attention 拒绝负 outset', !!badNegative && /outset/.test(badNegative) && /大于等于 0/.test(badNegative), badNegative && badNegative.slice(0, 200));
  const badUnknown = prepareError({ targets: [{ binding: 'a', query: { part: 'value' }, range: { kind: 'local', outset: 4, scale: 2 } }] });
  check('attention 拒绝 local 未知键', !!badUnknown && /scale/.test(badUnknown) && /只允许/.test(badUnknown), badUnknown && badUnknown.slice(0, 200));
  const badOptional = prepareError({ targets: [{ binding: 'a', query: { part: 'value' }, range: { kind: 'union', refs: [{ binding: 'b', query: { part: 'value' }, optional: 'yes' }] } }] });
  check('attention 拒绝非布尔 optional', !!badOptional && /optional|布尔/.test(badOptional), badOptional && badOptional.slice(0, 200));
  const badNested = prepareError({ targets: [{ binding: 'a', query: { part: 'value' }, range: { kind: 'union', refs: [{ binding: 'b', query: { part: 'value' }, range: { kind: 'local', outset: 1 } }] } }] });
  check('attention 拒绝 union 嵌套 range（深度 <=1）', !!badNested && /refs|只允许/.test(badNested), badNested && badNested.slice(0, 200));

  /* ================= attention range：运行时几何 ================= */
  function makeRangeAdapter() {
    return {
      name: 'range-probe', sceneModes: ['update'], defaultSceneMode: 'update',
      normalizeView: function (input) { return { model: { value: Number(input && input.value) || 0 }, cues: {} }; },
      mount: function (host) {
        const node = document.createElement('div');
        node.className = 'range-target';
        host.appendChild(node);
        let value = 0;
        return {
          restore: function (view) { value = Number(view && view.model && view.model.value) || 0; node.textContent = String(value); },
          readView: function () { return { model: { value: value }, cues: {} }; },
          target: function (query) { return query && query.part === 'root' ? node : null; },
          prepareChange: function (ctx) {
            const targetValue = Number(ctx && ctx.targetView && ctx.targetView.model && ctx.targetView.model.value) || 0;
            return {
              commit: function () { value = targetValue; node.textContent = String(value); },
              effects: function () { return []; },
              cleanup: function () {}
            };
          },
          destroy: function () { node.remove(); }
        };
      }
    };
  }
  function layoutWithSlot(container) {
    const wrap = document.createElement('div');
    const main = document.createElement('div');
    const slot = document.createElement('div');
    wrap.append(main, slot);
    container.appendChild(wrap);
    return { root: wrap, slots: { main: main, t: slot } };
  }
  function definitionForRange(range, optionalRefs) {
    return {
      bindings: { t: { adapter: 'range-probe', slot: 't' } },
      frames: [
        { id: 'r0', caption: '0', views: { t: { value: 0 } }, marks: [] },
        { id: 'r1', caption: '1', views: { t: { value: 1 } }, marks: [] }
      ],
      transitions: [{ from: 'r0', to: 'r1', scene: {
        bindings: [{ binding: 't', mode: 'update' }],
        attention: { stepDuration: 60, targets: [{ binding: 't', query: { part: 'root' }, range: range }] }
      } }]
    };
  }
  async function runRangeCase(range) {
    const host = document.createElement('div');
    rootEl.appendChild(host);
    const session = window.NoteDemo.mount(host, { definition: definitionForRange(range), adapters: { 'range-probe': makeRangeAdapter() }, layout: layoutWithSlot, label: 'range geometry' });
    const result = await session.next();
    await sleep(80);
    const box = document.querySelector('.nx-focus__box');
    const target = host.querySelector('.range-target');
    const boxRect = box ? box.getBoundingClientRect() : null;
    const targetRect = target ? target.getBoundingClientRect() : null;
    session.destroy();
    host.remove();
    return { result: result, box: boxRect, target: targetRect };
  }
  const outsetRun = await runRangeCase({ kind: 'local', outset: 8 });
  check('attention local outset 运行时几何（元素外扩 8 + Focus 6）', outsetRun.result.status === 'completed' && !!outsetRun.box && !!outsetRun.target &&
    Math.abs(outsetRun.box.left - (outsetRun.target.left - 14)) <= 2 &&
    Math.abs(outsetRun.box.top - (outsetRun.target.top - 14)) <= 2 &&
    Math.abs(outsetRun.box.width - (outsetRun.target.width + 28)) <= 3,
    JSON.stringify({ result: outsetRun.result.status, box: outsetRun.box, target: outsetRun.target }));
  const insetRun = await runRangeCase({ kind: 'local', inset: 4 });
  check('attention local inset 运行时几何（元素内缩 4 + Focus 6）', insetRun.result.status === 'completed' && !!insetRun.box && !!insetRun.target &&
    Math.abs(insetRun.box.left - (insetRun.target.left + 4 - 6)) <= 2 &&
    Math.abs(insetRun.box.width - (insetRun.target.width - 8 + 12)) <= 3,
    JSON.stringify({ box: insetRun.box, target: insetRun.target }));
  const unionOptionalStatus = await (async () => {
    const host = document.createElement('div');
    rootEl.appendChild(host);
    const definition = {
      bindings: { t: { adapter: 'range-probe', slot: 't' } },
      frames: [
        { id: 'r0', caption: '0', views: { t: { value: 0 } }, marks: [] },
        { id: 'r1', caption: '1', views: { t: { value: 1 } }, marks: [] }
      ],
      transitions: [{ from: 'r0', to: 'r1', scene: {
        bindings: [{ binding: 't', mode: 'update' }],
        attention: { stepDuration: 60, targets: [{ binding: 't', query: { part: 'root' }, range: { kind: 'union', refs: [{ binding: 't', query: { part: 'gone' }, optional: true }] } }] }
      } }]
    };
    const session = window.NoteDemo.mount(host, { definition: definition, adapters: { 'range-probe': makeRangeAdapter() }, layout: layoutWithSlot, label: 'union optional' });
    const result = await session.next();
    await sleep(80);
    const box = document.querySelector('.nx-focus__box');
    const target = host.querySelector('.range-target');
    const boxRect = box ? box.getBoundingClientRect() : null;
    const targetRect = target ? target.getBoundingClientRect() : null;
    session.destroy();
    host.remove();
    return { result: result, box: boxRect, target: targetRect };
  })();
  check('attention union optional 缺失成员跳过且几何=主元素', unionOptionalStatus.result.status === 'completed' &&
    !!unionOptionalStatus.box && !!unionOptionalStatus.target &&
    Math.abs(unionOptionalStatus.box.left - (unionOptionalStatus.target.left - 6)) <= 2 &&
    Math.abs(unionOptionalStatus.box.width - (unionOptionalStatus.target.width + 12)) <= 3,
    JSON.stringify({ result: unionOptionalStatus.result.status, box: unionOptionalStatus.box, target: unionOptionalStatus.target }));
  const requiredMissingHost = document.createElement('div');
  rootEl.appendChild(requiredMissingHost);
  const requiredSession = window.NoteDemo.mount(requiredMissingHost, {
    definition: (function () {
      const definition = definitionForRange({ kind: 'union', refs: [{ binding: 't', query: { part: 'gone' } }] });
      return definition;
    })(),
    adapters: { 'range-probe': makeRangeAdapter() }, layout: layoutWithSlot, label: 'union required'
  });
  const requiredResult = await requiredSession.next().catch(function (error) { return { status: 'threw', error: error }; });
  const requiredMessage = requiredResult && requiredResult.error ? String(requiredResult.error.message || requiredResult.error) : '';
  requiredSession.destroy();
  requiredMissingHost.remove();
  check('attention union 必需成员缺失明确报错', requiredResult.status !== 'completed' &&
    /union 辅助成员不可解析（必需）/.test(requiredMessage) && /optional:true/.test(requiredMessage),
    JSON.stringify({ status: requiredResult.status, message: requiredMessage.slice(0, 260) }));
  return out;
});
for (const row of rows) check(row.name, row.ok, row.detail);
check('expand-graphics 区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
await context.close();
await browser.close();
const failed = checks.filter((row) => !row.ok);
console.log('SUMMARY ' + (checks.length - failed.length) + '/' + checks.length + ' passed');
if (failed.length) process.exitCode = 1;
