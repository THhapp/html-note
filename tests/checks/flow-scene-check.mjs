#!/usr/bin/env node
/*
 * 接入/拆分回归（src 直载，真实 Edge）：
 * A. table + flow-stage/packet/segment/device Adapter：mount/update(readView+commit)/
 *    readModel/getTarget/groups/effects/reduced 定向断言；
 * B. 两个小 NoteDemo 会话各推进一帧：table 与 flow-stage 的 commit 后 DOM/终态一致；
 * C. flow 拆分 + Propagation：路径 copies 更新/清理、getTarget、destroy；
 * D. 拆分入口与独立部件导出。
 *
 * Usage: node tests/checks/flow-scene-check.mjs
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
const MODULES = ['core', 'legacy', 'ui-layout', 'ui-content', 'viz-objects', 'viz-flow', 'viz-mechanisms',
  'blocks-base', 'demo-stage', 'blocks', 'demo-runtime', 'demo-ui'];
const STYLES = moduleStyles(root, MODULES);
const SCRIPTS = moduleScripts(root, MODULES);

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail) });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : ' :: ' + String(detail).slice(0, 600)));
}

const browser = await chromium.launch({ executablePath: edge, headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push('pageerror: ' + error.message));
page.on('console', (message) => { if (message.type() === 'error') pageErrors.push('console: ' + message.text()); });
await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}body{padding:16px;background:#f4f6f9}#root{max-width:1100px;margin:0 auto}.scene-host{width:760px;margin:0 0 20px}</style></head><body><main id="root"></main></body></html>');
for (const rel of STYLES) await page.addStyleTag({ path: src(rel) });
for (const rel of SCRIPTS) await page.addScriptTag({ path: src(rel) });

const rows = await page.evaluate(async () => {
  const out = [];
  const check = (name, ok, detail) => out.push({ name: name, ok: !!ok, detail: detail == null ? '' : String(detail) });
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rootEl = document.getElementById('root');
  const Internals = window.NoteDemoInternals;
  const Adapters = Internals && Internals.adapters;
  check('Adapter 注册表包含 table + 四个 flow adapter',
    !!Adapters && ['table', 'flow-stage', 'flow-packet', 'flow-segment', 'flow-device'].every((name) => !!Adapters[name]),
    JSON.stringify(Object.keys(Adapters || {})));
  if (!Adapters) return out;

  function mountAdapter(name, view, options) {
    const host = document.createElement('div');
    host.className = 'scene-host';
    rootEl.appendChild(host);
    const adapter = Adapters[name];
    const handle = adapter.mount(host, options || {});
    return { name: name, host: host, adapter: adapter, handle: handle };
  }
  function canonical(name, view, options) {
    return Adapters[name].normalizeView(view, options || {}).model;
  }
  function prepareChange(caseInfo, sourceModel, targetModel, reduced) {
    return caseInfo.handle.prepareChange({
      bindingId: 'b', sourceFrameId: 'f0', targetFrameId: 'f1',
      sourceView: { model: sourceModel, cues: {} }, targetView: { model: targetModel, cues: {} },
      motion: reduced ? 'never' : 'auto', signal: null
    });
  }
  function readModel(caseInfo) {
    const view = caseInfo.handle.readView();
    return view && view.model;
  }
  const TIMING = { duration: 480, stagger: 60, enterDuration: 260, valueSwapDelay: 0, valueSwapDuration: 220, valueFlashDuration: 300,
    cueDuration: 220, markDelay: 80, markDuration: 200, revealDelay: 40, revealDuration: 160, easing: 'cubic-bezier(.22,.7,.25,1)' };

  /* ---------- 各 Adapter 的统一契约断言 ---------- */
  const tableSourceView = {
    columns: [{ key: 'name', label: '名称' }, { key: 'score', label: '分数', align: 'end' }],
    rows: [{ id: 'a', name: 'Alpha', score: 12 }, { id: 'b', name: 'Beta', score: 5 }],
    caption: '示例'
  };
  const tableTargetView = {
    columns: tableSourceView.columns,
    rows: [{ id: 'a', name: 'Alpha', score: 18, state: 'current' }, { id: 'b', name: 'Beta', score: 5 }],
    caption: '示例'
  };
  const stageSourceView = {
    label: '阶段',
    stages: [{ id: 's1', label: '准备' }, { id: 's2', label: '校验' }, { id: 's3', label: '执行' }],
    current: 's2', target: 's3', skipped: [], failed: []
  };
  const stageTargetView = Object.assign({}, stageSourceView, { current: 's3', target: null, skipped: ['s2'], failed: [] });
  const packetSourceView = {
    label: '消息',
    participants: [{ id: 'client', label: '客户端' }, { id: 'server', label: '服务端' }],
    messages: [{ id: 'm1', from: 'client', to: 'server', label: '请求' }, { id: 'm2', from: 'server', to: 'client', label: '响应' }],
    visibleCount: 1, focus: 'm1'
  };
  const packetTargetView = Object.assign({}, packetSourceView, { visibleCount: 2, focus: 'm2' });
  const segmentSourceView = {
    label: '段条', minWidth: 18, scaleMax: 600,
    segments: [{ id: 'seg-a', label: 'A', value: 100 }, { id: 'seg-b', label: 'B', value: 0 }],
    ranges: [{ id: 'range-ab', label: '范围', start: 'seg-a', end: 'seg-b' }]
  };
  const segmentTargetView = Object.assign({}, segmentSourceView, {
    segments: [{ id: 'seg-a', label: 'A', value: 100 }, { id: 'seg-b', label: 'B', value: 80 }]
  });
  const deviceSourceView = {
    label: '连接',
    devices: [{ id: 'dev-a', label: 'A', ports: [{ id: 'out', label: 'OUT' }] }, { id: 'dev-b', label: 'B', ports: [{ id: 'in', label: 'IN' }] }],
    links: [{ id: 'link-ab', from: { device: 'dev-a', port: 'out' }, to: { device: 'dev-b', port: 'in' }, label: 'A→B', status: 'active' }]
  };
  const deviceTargetView = Object.assign({}, deviceSourceView, {
    links: [{ id: 'link-ab', from: { device: 'dev-a', port: 'out' }, to: { device: 'dev-b', port: 'in' }, label: 'A→B', status: 'idle' }]
  });
  const cases = [
    { name: 'table', view: tableSourceView, targetView: tableTargetView, options: { rowKey: 'id' },
      target: { row: 'a', column: 'score' } },
    { name: 'flow-stage', view: stageSourceView, targetView: stageTargetView, options: { label: '阶段' },
      target: { id: 's2' } },
    { name: 'flow-packet', view: packetSourceView, targetView: packetTargetView, options: { label: '消息' },
      target: { id: 'm1' } },
    { name: 'flow-segment', view: segmentSourceView, targetView: segmentTargetView, options: { label: '段条' },
      target: { id: 'seg-a' } },
    { name: 'flow-device', view: deviceSourceView, targetView: deviceTargetView, options: { label: '连接' },
      target: { id: 'link-ab' } }
  ];
  for (const caseInfo of cases) {
    const label = caseInfo.name;
    const mounted = mountAdapter(caseInfo.name, caseInfo.view, caseInfo.options);
    const sourceModel = canonical(caseInfo.name, caseInfo.view, caseInfo.options);
    const targetModel = canonical(caseInfo.name, caseInfo.targetView, caseInfo.options);
    mounted.handle.restore({ model: sourceModel, cues: {} });
    const rootTarget = mounted.handle.target({ part: 'root' });
    const specificTarget = mounted.handle.target(caseInfo.target);
    check(label + '：mount/restore/getTarget(root+具体对象)', !!rootTarget && mounted.host.contains(rootTarget) &&
      !!specificTarget && rootTarget !== specificTarget, JSON.stringify({ root: !!rootTarget, specific: !!specificTarget }));
    const prepared = prepareChange(mounted, sourceModel, targetModel, false);
    const groups = typeof prepared.groups === 'function' ? prepared.groups() : prepared.groups;
    check(label + '：prepareChange.groups 非空且为字符串数组', Array.isArray(groups) && groups.length > 0 &&
      groups.every((group) => typeof group === 'string' && group.length > 0), JSON.stringify(groups));
    prepared.commit();
    const readAfter = readModel(mounted);
    check(label + '：commit 后 readModel 与目标 model 一致', JSON.stringify(readAfter) === JSON.stringify(targetModel),
      JSON.stringify({ read: readAfter, target: targetModel }).slice(0, 600));
    const effects = prepared.effects({ timing: TIMING, bindingId: 'b', attention: false, grouped: false, groups: groups });
    check(label + '：effects 返回带 group 的 spec', Array.isArray(effects) && effects.length > 0 &&
      effects.every((spec) => spec && typeof spec.group === 'string' && spec.group.length > 0 &&
        typeof spec.options === 'object' && spec.el && spec.keyframes),
      JSON.stringify(effects.map((spec) => ({ group: spec.group, duration: spec.options && spec.options.duration }))));
    if (Array.isArray(effects)) effects.forEach((spec) => { try { spec.el.getAnimations && spec.el.getAnimations().forEach((animation) => animation.cancel()); } catch (error) {} });
    if (typeof prepared.cleanup === 'function') prepared.cleanup();
    // reduced：commit 直接终态，effects 为空
    const reducedPrepared = prepareChange(mounted, sourceModel, targetModel, true);
    reducedPrepared.commit();
    const reducedEffects = reducedPrepared.effects({ timing: TIMING, bindingId: 'b' });
    check(label + '：reduced 跳过 effects 且 commit 落终态', Array.isArray(reducedEffects) && reducedEffects.length === 0 &&
      JSON.stringify(readModel(mounted)) === JSON.stringify(targetModel),
      JSON.stringify({ reducedEffects: reducedEffects }));
    if (typeof reducedPrepared.cleanup === 'function') reducedPrepared.cleanup();
    // 第二次 update：target → source，确认可回退
    mounted.handle.restore({ model: sourceModel, cues: {} });
    check(label + '：restore 可回到来源 model', JSON.stringify(readModel(mounted)) === JSON.stringify(sourceModel),
      JSON.stringify(readModel(mounted)).slice(0, 300));
    mounted.handle.destroy();
    let destroyedRead = null;
    try { destroyedRead = mounted.handle.readView(); } catch (error) { destroyedRead = 'threw'; }
    check(label + '：destroy 后 target/readView 失效', mounted.handle.target({ part: 'root' }) === null &&
      (destroyedRead === null || destroyedRead === 'threw'), JSON.stringify({ read: destroyedRead }));
    mounted.host.remove();
  }

  /* ---------- 两个小 NoteDemo 会话推进一帧 ---------- */
  function layout(container, slotName) {
    const wrap = document.createElement('div');
    const main = document.createElement('div');
    const slot = document.createElement('div');
    wrap.append(main, slot);
    container.appendChild(wrap);
    return { root: wrap, slots: { main: main, [slotName]: slot } };
  }
  const tableSessionHost = document.createElement('div');
  rootEl.appendChild(tableSessionHost);
  const tableSession = window.NoteDemo.mount(tableSessionHost, {
    definition: {
      bindings: { tbl: { adapter: 'table', slot: 'tbl', options: { rowKey: 'id' } } },
      frames: [
        { id: 'f0', caption: '0', views: { tbl: tableSourceView }, marks: [] },
        { id: 'f1', caption: '1', views: { tbl: tableTargetView }, marks: [] }
      ],
      transitions: [{ from: 'f0', to: 'f1', scene: { bindings: [{ binding: 'tbl', mode: 'update' }] } }]
    },
    layout: (container) => layout(container, 'tbl'), label: 'table 会话'
  });
  const tableFirstNext = await tableSession.next();
  await sleep(80);
  const tableCell = tableSessionHost.querySelector('.nui-table__cell--score, td');
  const scoreCells = Array.from(tableSessionHost.querySelectorAll('td')).map((node) => node.textContent.trim());
  check('会话 A（table）：推进一帧后 DOM/终态与 model 一致', tableFirstNext.status === 'completed' &&
    tableSession.getState().phase === 'idle' && tableSession.getState().settledFrameId === 'f1' &&
    scoreCells.indexOf('18') >= 0 && !!tableCell,
    JSON.stringify({ result: tableFirstNext.status, state: tableSession.getState(), cells: scoreCells.slice(0, 8) }));
  tableSession.destroy();
  tableSessionHost.remove();

  const stageSessionHost = document.createElement('div');
  rootEl.appendChild(stageSessionHost);
  const stageSession = window.NoteDemo.mount(stageSessionHost, {
    definition: {
      bindings: { st: { adapter: 'flow-stage', slot: 'st', options: { label: '阶段' } } },
      frames: [
        { id: 'f0', caption: '0', views: { st: stageSourceView }, marks: [] },
        { id: 'f1', caption: '1', views: { st: stageTargetView }, marks: [] }
      ],
      transitions: [{ from: 'f0', to: 'f1', scene: { bindings: [{ binding: 'st', mode: 'update' }] } }]
    },
    layout: (container) => layout(container, 'st'), label: 'flow-stage 会话'
  });
  const stageFirstNext = await stageSession.next();
  await sleep(80);
  const stageStatuses = Array.from(stageSessionHost.querySelectorAll('[data-id]')).filter((node) => node.classList.contains('nviz-flow-stagetrack__stage'))
    .map((node) => ({ id: node.getAttribute('data-id'), status: node.getAttribute('data-status') }));
  check('会话 B（flow-stage）：推进一帧后状态/终态一致', stageFirstNext.status === 'completed' &&
    stageSession.getState().phase === 'idle' && stageSession.getState().settledFrameId === 'f1' &&
    stageStatuses.some((item) => item.id === 's3' && item.status === 'current') &&
    stageStatuses.some((item) => item.id === 's2' && item.status === 'skipped'),
    JSON.stringify({ result: stageFirstNext.status, statuses: stageStatuses }));
  stageSession.destroy();
  stageSessionHost.remove();

  /* ---------- flow 拆分 + Propagation ---------- */
  const Flow = window.NoteViz && window.NoteViz.Flow;
  check('flow 拆分入口：Flow.parts/Propagation/Internals 可用', !!Flow && Flow.version === '1.0.0' &&
    Array.isArray(Flow.parts) && Flow.parts.join(',') === 'StageTrack,PacketFlow,SegmentBar,DeviceLinks' &&
    !!Flow.Propagation && typeof Flow.Propagation.mount === 'function' && !!window.NoteVizFlowInternals,
    JSON.stringify({ version: Flow && Flow.version, parts: Flow && Flow.parts, internals: !!window.NoteVizFlowInternals }));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '600');
  svg.setAttribute('height', '200');
  svg.innerHTML = '<path id="path-one" d="M20,100 L580,100"></path><path id="path-two" d="M20,160 L580,60"></path>';
  rootEl.appendChild(svg);
  const propagation = Flow.Propagation.mount(svg, {
    paths: { p1: '#path-one', p2: '#path-two' }, copies: 2, start: 0, end: 1, rotate: true, label: '传播'
  });
  check('Propagation：mount 后 group/copy/path target 可查询', !!propagation.getTarget('group') &&
    propagation.getTarget('group') === propagation.el && !!propagation.getTarget('svg') &&
    !!propagation.getTarget('path:p1') && !!propagation.getTarget('copy-1') && !!propagation.getTarget('copy-2') &&
    propagation.getTarget('missing') === null);
  propagation.update(0.25);
  const copyOne = propagation.getTarget('copy-1');
  const copyTwo = propagation.getTarget('copy-2');
  check('Propagation：路径 copies 按 progress 更新位置', copyOne && copyTwo &&
    Math.abs(Number(copyOne.getAttribute('data-ratio')) - 0.25) < 0.001 &&
    Math.abs(Number(copyTwo.getAttribute('data-ratio')) - 0.25) < 0.001 &&
    isFinite(Number(copyOne.getAttribute('data-x'))) && copyOne.getAttribute('data-outside') == null,
    JSON.stringify({ one: copyOne && copyOne.getAttribute('data-ratio'), two: copyTwo && copyTwo.getAttribute('data-ratio') }));
  propagation.update({ progress: 0.5 });
  check('Propagation：update({progress}) 形状可用', Math.abs(Number(propagation.getTarget('copy-1').getAttribute('data-ratio')) - 0.5) < 0.001,
    JSON.stringify(propagation.getState()));
  // 独立挂载：start/end/offset 映射、缺 path 标记、destroy 清理。
  const svgB = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgB.setAttribute('width', '600');
  svgB.setAttribute('height', '200');
  svgB.innerHTML = '<path id="pb-one" d="M20,100 L580,100"></path>';
  rootEl.appendChild(svgB);
  const propagationB = Flow.Propagation.mount(svgB, {
    paths: { p1: '#pb-one' }, copies: [{ id: 'c1', pathId: 'p1', offset: 0 }],
    start: 0.2, end: 0.8, rotate: false, label: '传播 B'
  });
  propagationB.update(0);
  const ratioStart = Number(propagationB.getTarget('c1').getAttribute('data-ratio'));
  propagationB.update(1);
  const ratioEnd = Number(propagationB.getTarget('c1').getAttribute('data-ratio'));
  check('Propagation：start/end 映射与 copies 移动', Math.abs(ratioStart - 0.2) < 0.001 && Math.abs(ratioEnd - 0.8) < 0.001 &&
    !!propagationB.getTarget('path:p1') && propagationB.getState().copies.length === 1,
    JSON.stringify({ start: ratioStart, end: ratioEnd, state: propagationB.getState() }));
  const propagationC = Flow.Propagation.mount(svgB, { paths: { p1: '#pb-one' }, copies: [{ id: 'm', pathId: 'missing' }], label: '传播 C' });
  check('Propagation：缺 path 副本标记 missing-path', propagationC.getTarget('m') &&
    propagationC.getTarget('m').getAttribute('data-missing-path') === 'true');
  propagationC.destroy();
  check('Propagation：destroy 清理副本节点与 path 索引', propagationB.el.querySelectorAll('.nviz-flow-propagation__copy').length === 1 &&
    propagationC.getTarget('m') === null && !svgB.contains(propagationC.el));
  propagationB.destroy();
  svgB.remove();
  propagation.destroy();
  check('Propagation：destroy 移除根并让 target 失效', propagation.getTarget('c1') === null &&
    propagation.getTarget('group') === null && !svg.contains(propagation.el));
  svg.remove();
  return out;
});
for (const row of rows) check(row.name, row.ok, row.detail);
check('flow-scene 区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
await context.close();
await browser.close();
const failed = checks.filter((row) => !row.ok);
console.log('SUMMARY ' + (checks.length - failed.length) + '/' + checks.length + ' passed');
if (failed.length) process.exitCode = 1;
