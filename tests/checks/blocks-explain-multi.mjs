import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('../tools/node_modules/playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const harness = pathToFileURL(path.join(here, 'blocks-explain-harness.html')).href;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const failures = [];
function check(name, ok, detail) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || !detail ? '' : ' :: ' + detail));
  if (!ok) failures.push({ name, detail });
}
const browser = await chromium.launch({ executablePath: edge, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(String(e && e.stack || e)));
await page.goto(harness, { waitUntil: 'load' });
const result = await page.evaluate(() => {
  const checks = [];
  function ok(name, condition, detail) { checks.push({ name, ok: !!condition, detail: detail == null ? '' : String(detail) }); }
  const hostRoot = document.getElementById('host');
  function host(width) {
    const h = document.createElement('div');
    h.style.cssText = 'box-sizing:border-box;width:' + (width || 880) + 'px;max-width:100%;margin:0 0 12px;';
    hostRoot.appendChild(h);
    return h;
  }
  function cap(h) { const n = h.querySelector('.nblk-demo-stage__caption'); return n ? n.textContent.trim() : ''; }

  const h05a = host();
  const h05b = host();
  const t05a = NoteBlocks.CodeTrace.mount(h05a, { code: 'let a = 1;', steps: [
    { id: 'a1', caption: 'A 初始', highlight: 1, variables: [{ name: 'a', value: 1 }] },
    { id: 'a2', caption: 'A 第二', highlight: 1, variables: [{ name: 'a', value: 2, changed: true }] }
  ] });
  const t05b = NoteBlocks.CodeTrace.mount(h05b, { code: 'let b = 9;', steps: [
    { id: 'b1', caption: 'B 初始', highlight: 1, variables: [{ name: 'b', value: 9 }] },
    { id: 'b2', caption: 'B 第二', highlight: 1, variables: [{ name: 'b', value: 10, changed: true }] }
  ] });
  t05a.next();
  ok('B05 instances step independently', t05a.getStep().id === 'a2' && t05b.getStep().id === 'b1' && cap(h05b) === 'B 初始', cap(h05b));

  const h06a = host();
  const h06b = host();
  const i06a = NoteBlocks.FrameFields.mount(h06a, { items: ['1', '0', '1', '1'], fields: [{ id: 'hi', label: '高', start: 0, end: 1 }, { id: 'lo', label: '低', start: 2, end: 3 }], focusField: 'hi' });
  const i06b = NoteBlocks.FrameFields.mount(h06b, { items: ['0', '0', '1', '1'], fields: [{ id: 'hi', label: '高', start: 0, end: 1 }, { id: 'lo', label: '低', start: 2, end: 3 }], focusField: 'hi' });
  i06a.focusField('lo', { silent: true });
  ok('B06 instances select independently', i06a.getSelected() === 'lo' && i06b.getSelected() === 'hi');
  ok('B06 targets independent', Boolean(i06a.getTarget('sequence')) && Boolean(i06b.getTarget('sequence')) && i06a.getTarget('sequence') !== i06b.getTarget('sequence'));

  const h07a = host();
  const h07b = host();
  const f07a = NoteBlocks.ProcessFlow.mount(h07a, { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ id: 'ab', from: 'a', to: 'b' }], steps: [{ id: 's1', caption: 'A 初始', nodeId: 'a' }, { id: 's2', caption: 'A 第二', nodeId: 'b', edgeIds: ['ab'] }] });
  const f07b = NoteBlocks.ProcessFlow.mount(h07b, { nodes: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }], edges: [{ id: 'xy', from: 'x', to: 'y' }], steps: [{ id: 't1', caption: 'B 初始', nodeId: 'x' }, { id: 't2', caption: 'B 第二', nodeId: 'y', edgeIds: ['xy'] }] });
  f07a.next();
  ok('B07 instances step independently', f07a.getStep().id === 's2' && f07b.getStep().id === 't1' && cap(h07b) === 'B 初始', cap(h07b));
  ok('B07 graph targets independent', f07a.getTarget('b') !== f07b.getTarget('y'));

  const h08a = host();
  const h08b = host();
  const s08a = NoteBlocks.SequenceDiagram.mount(h08a, { participants: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], messages: [{ id: 'm1', from: 'a', to: 'b', label: 'A 消息 1', type: 'sync' }, { id: 'm2', from: 'b', to: 'a', label: 'A 消息 2', type: 'return' }] });
  const s08b = NoteBlocks.SequenceDiagram.mount(h08b, { participants: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }], messages: [{ id: 'n1', from: 'x', to: 'y', label: 'B 消息 1', type: 'sync' }, { id: 'n2', from: 'y', to: 'x', label: 'B 消息 2', type: 'return' }] });
  s08a.next();
  ok('B08 instances step independently', s08a.getState().index === 1 && s08b.getState().index === 0 && cap(h08b).indexOf('B 消息 1') >= 0, cap(h08b));
  ok('B08 target groups independent', s08a.getTarget('m1') !== s08b.getTarget('n1'));

  const h09a = host();
  const h09b = host();
  const d09a = NoteBlocks.HierarchyDetail.mount(h09a, { nodes: [{ id: 'p', label: 'P', children: [{ id: 'c', label: 'C' }] }], selected: 'c', details: { c: { title: 'A 详情' } } });
  const d09b = NoteBlocks.HierarchyDetail.mount(h09b, { nodes: [{ id: 'q', label: 'Q', children: [{ id: 'r', label: 'R' }] }], selected: 'r', details: { r: { title: 'B 详情' } } });
  d09a.select('p', { silent: true });
  ok('B09 instances select independently', d09a.getSelected() === 'p' && d09b.getSelected() === 'r' && h09b.textContent.indexOf('B 详情') >= 0);
  ok('B09 tree targets independent', d09a.getTarget('p') !== d09b.getTarget('q'));

  const h10a = host();
  const h10b = host();
  const c10a = NoteBlocks.ChartExplain.mount(h10a, { chart: { type: 'bar', data: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }] }, steps: [{ id: 'a1', caption: 'A 初始', focus: { index: 0 } }, { id: 'a2', caption: 'A 第二', focus: { index: 1 } }] });
  const c10b = NoteBlocks.ChartExplain.mount(h10b, { chart: { type: 'bar', data: [{ label: 'X', value: 3 }, { label: 'Y', value: 4 }] }, steps: [{ id: 'b1', caption: 'B 初始', focus: { index: 0 } }, { id: 'b2', caption: 'B 第二', focus: { index: 1 } }] });
  c10a.next();
  ok('B10 instances step independently', c10a.getStep().id === 'a2' && c10b.getStep().id === 'b1' && cap(h10b) === 'B 初始', cap(h10b));
  ok('B10 chart targets independent', c10a.getTarget('chart') !== c10b.getTarget('chart'));

  t05a.destroy();
  ok('B05 destroy does not disturb sibling', Boolean(t05b.getStep()) && cap(h05b) === 'B 初始');
  t05b.next();
  ok('B05 sibling still steps after destroy', t05b.getStep().id === 'b2' && cap(h05b) === 'B 第二');
  t05b.destroy();
  i06a.destroy();
  i06b.destroy();
  f07a.destroy();
  f07b.destroy();
  s08a.destroy();
  s08b.destroy();
  d09a.destroy();
  d09b.destroy();
  c10a.destroy();
  c10b.destroy();
  ok('all multi-instance roots removed', Array.from(hostRoot.children).every((h) => h.children.length === 0), 'remaining=' + Array.from(hostRoot.children).filter((h) => h.children.length).length);

  function narrowHost() {
    const h = document.createElement('div');
    h.style.cssText = 'box-sizing:border-box;width:320px;max-width:100%;margin:0 0 12px;';
    hostRoot.appendChild(h);
    return h;
  }
  const n05 = narrowHost();
  const t = NoteBlocks.CodeTrace.mount(n05, { code: 'let n = 1;', steps: [{ id: 's', caption: '窄', highlight: 1, variables: [{ name: 'n', value: 1 }] }] });
  const grid05 = getComputedStyle(n05.querySelector('.nblk-codetrace__layout')).gridTemplateColumns;
  ok('B05 narrow host stacks columns', grid05.trim().split(/\s+/).length === 1, grid05);
  t.destroy();

  const n09 = narrowHost();
  const hd = NoteBlocks.HierarchyDetail.mount(n09, { nodes: [{ id: 'a', label: 'A' }], details: { a: { title: 'A' } } });
  const grid09 = getComputedStyle(n09.querySelector('.nblk-hierarchy')).gridTemplateColumns;
  const panels = Array.from(n09.querySelectorAll('.nblk-hierarchy > .nui-panel'));
  ok('B09 narrow host stacks panels', grid09.trim().split(/\s+/).length === 1 && panels.length === 2 && Math.abs(panels[0].getBoundingClientRect().left - panels[1].getBoundingClientRect().left) < 2, grid09);
  hd.destroy();

  const n07 = narrowHost();
  const flow = NoteBlocks.ProcessFlow.mount(n07, { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ id: 'ab', from: 'a', to: 'b' }], steps: [{ id: 's1', caption: '一', nodeId: 'a' }, { id: 's2', caption: '二', nodeId: 'b', edgeIds: ['ab'] }] });
  const canvas = n07.querySelector('.nblk-flow__canvas');
  const aside = n07.querySelector('.nblk-flow__aside');
  ok('B07 narrow host stacks graph and aside', aside.getBoundingClientRect().top >= canvas.getBoundingClientRect().bottom - 1);
  flow.destroy();

  ok('narrow hosts empty after destroy', n05.children.length === 0 && n09.children.length === 0 && n07.children.length === 0, 'children=' + [n05.children.length, n09.children.length, n07.children.length].join(','));
  return checks;
});
for (const item of result) check(item.name, item.ok, item.detail);
check('multi-instance console errors empty', consoleErrors.length === 0, consoleErrors.join(' | '));
check('multi-instance page errors empty', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
console.log('\nMulti summary: ' + (failures.length ? failures.length + ' failed' : 'all passed'));
if (failures.length) process.exitCode = 1;
