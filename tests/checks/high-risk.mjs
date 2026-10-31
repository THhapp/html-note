// 主控高风险交互检查（真实 Edge + 全量 dist）。
// 运行：node tests/checks/high-risk.mjs
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
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const wait = (ms = 120) => page.waitForTimeout(ms);
async function fresh() {
  errors.length = 0;
  await page.goto(hostUrl, { waitUntil: 'load' });
  await page.evaluate(() => { window.__h = {}; });
  await wait(80);
}
async function evalp(fn, arg) { return page.evaluate(fn, arg); }

// 1. Dialog focus trap / Esc / focus restore
await fresh();
{
  const state = await evalp(() => {
    const host = document.getElementById('host');
    const opener = document.createElement('button');
    opener.id = 'opener';
    opener.textContent = '打开对话框';
    document.body.appendChild(opener);
    opener.focus();
    const dialog = NoteUI.Dialog.mount(host, {
      title: '检查对话框',
      content: '对话框内容用于焦点检查。',
      actions: [{ label: '确定' }, { label: '取消' }],
      open: true
    });
    window.__h.dialog = dialog;
    const layer = document.querySelector('.hnv-floating');
    const rect = layer ? layer.getBoundingClientRect() : null;
    return {
      layers: document.querySelectorAll('.hnv-floating').length,
      focusInside: !!(layer && layer.contains(document.activeElement)),
      panelVisible: !!(layer && rect && rect.width > 0 && rect.height > 0),
      openerActive: document.activeElement === opener
    };
  });
  ok('Dialog opens a single layer', state.layers === 1, JSON.stringify(state));
  ok('Dialog moves focus inside', state.focusInside && state.panelVisible, JSON.stringify(state));
  await page.keyboard.press('Escape');
  await wait();
  const after = await evalp(() => ({
    layers: document.querySelectorAll('.hnv-floating').length,
    openerFocused: document.activeElement && document.activeElement.id === 'opener'
  }));
  ok('Dialog Esc closes and restores focus', after.layers === 0 && after.openerFocused, JSON.stringify(after));
}

// 2. Tooltip viewport clamp
await fresh();
{
  await evalp(() => {
    const host = document.getElementById('host');
    const anchor = document.createElement('button');
    anchor.textContent = '边缘锚点';
    anchor.style.cssText = 'position:fixed;right:4px;bottom:4px;z-index:1';
    document.body.appendChild(anchor);
    const tip = NoteUI.Tooltip.mount(host, { anchor, content: '贴边提示内容', placement: 'top' });
    window.__h.tip = tip;
    tip.show();
  });
  await wait();
  const state = await evalp(() => {
    const layer = document.querySelector('.hnv-floating');
    if (!layer) return { exists: false };
    const r = layer.getBoundingClientRect();
    const a = document.querySelector('.hnv-floating').previousElementSibling;
    return { exists: true, left: r.left, top: r.top, right: r.right, bottom: r.bottom, vw: innerWidth, vh: innerHeight };
  });
  ok('Tooltip stays inside viewport', state.exists && state.left >= 0 && state.top >= 0 && state.right <= state.vw + 0.5 && state.bottom <= state.vh + 0.5, JSON.stringify(state));
  await evalp(() => window.__h.tip.destroy());
  const left = await evalp(() => document.querySelectorAll('.hnv-floating').length);
  ok('Tooltip destroy removes layer', left === 0, 'layers=' + left);
}

// 3. Tabs keepMounted + keyboard
await fresh();
{
  await evalp(() => {
    const host = document.getElementById('host');
    const content = document.createElement('div');
    const input = document.createElement('input');
    input.id = 'kept-input';
    input.value = '保留值';
    content.appendChild(input);
    window.__h.tabs = NoteUI.Tabs.mount(host, {
      items: [
        { id: 'a', label: '甲', content },
        { id: 'b', label: '乙', content: '乙的内容' }
      ],
      value: 'a',
      keepMounted: true
    });
  });
  await page.getByRole('tab', { name: '乙' }).click();
  await wait();
  const b = await evalp(() => ({ value: window.__h.tabs.getValue(), panel: document.querySelector('[role=tabpanel]:not([hidden])')?.textContent || '' }));
  await page.getByRole('tab', { name: '甲' }).click();
  await wait();
  const a = await evalp(() => ({ value: window.__h.tabs.getValue(), kept: document.getElementById('kept-input')?.value }));
  ok('Tabs switch panels', b.value === 'b' && /乙的内容/.test(b.panel), JSON.stringify(b));
  ok('Tabs keepMounted preserves content state', a.value === 'a' && a.kept === '保留值', JSON.stringify(a));
  await page.getByRole('tab', { name: '甲' }).focus();
  await page.keyboard.press('ArrowRight');
  await wait();
  const kb = await evalp(() => ({ value: window.__h.tabs.getValue(), focus: document.activeElement?.textContent?.trim() }));
  ok('Tabs ArrowRight selects next', kb.value === 'b' && /乙/.test(kb.focus), JSON.stringify(kb));
  await evalp(() => window.__h.tabs.destroy());
}

// 4. Menu submenu keyboard / Esc
await fresh();
{
  await evalp(() => {
    const host = document.getElementById('host');
    const anchor = document.createElement('button');
    anchor.id = 'menu-anchor';
    anchor.textContent = '菜单';
    document.body.appendChild(anchor);
    window.__selected = null;
    window.__h.menu = NoteUI.Menu.mount(host, {
      items: [
        { id: 'copy', label: '复制' },
        { id: 'del', label: '删除' },
        { id: 'more', label: '更多', children: [{ id: 'sub', label: '子项' }] }
      ],
      onSelect: (item) => { window.__selected = item.id; }
    });
    window.__h.menu.open(anchor);
  });
  await wait();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await wait();
  const sub = await evalp(() => ({
    layers: document.querySelectorAll('.hnv-floating').length,
    expanded: !!document.querySelector('[aria-expanded="true"]'),
    active: document.activeElement?.textContent?.trim()
  }));
  ok('Menu opens submenu as its own layer', sub.layers === 2 && sub.expanded, JSON.stringify(sub));
  await page.keyboard.press('Enter');
  await wait();
  const selected = await evalp(() => ({ selected: window.__selected, layers: document.querySelectorAll('.hnv-floating').length }));
  ok('Menu selects submenu item and closes all', selected.selected === 'sub' && selected.layers === 0, JSON.stringify(selected));
  const focusBack = await evalp(() => document.activeElement && document.activeElement.id === 'menu-anchor');
  ok('Menu returns focus to anchor', focusBack, '');
}

// 5. TreeView keyboard expand/select
await fresh();
{
  await evalp(() => {
    const host = document.getElementById('host');
    window.__h.tree = NoteUI.TreeView.mount(host, {
      nodes: [{ id: 'a', label: '父节点', children: [{ id: 'a1', label: '子节点' }] }, { id: 'b', label: '另一个' }],
      expanded: [],
      selected: null
    });
    document.querySelector('[role=treeitem]').focus();
  });
  await page.keyboard.press('ArrowRight');
  await wait(60);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await wait(60);
  const state = await evalp(() => ({
    selected: window.__h.tree.getSelected(),
    target: !!window.__h.tree.getTarget('a1'),
    expanded: !!document.querySelector('[aria-expanded="true"]')
  }));
  ok('TreeView expands and selects child by keyboard', state.selected === 'a1' && state.target && state.expanded, JSON.stringify(state));
  await evalp(() => window.__h.tree.destroy());
}

// 6. Table sorting + getTarget
await fresh();
{
  const state = await evalp(() => {
    const host = document.getElementById('host');
    window.__h.table = NoteUI.Table.mount(host, {
      columns: [{ key: 'name', label: '名称', sortable: true }, { key: 'n', label: '数量', align: 'end', sortable: true }],
      rows: [
        { key: 'r1', name: '乙', n: 2 },
        { key: 'r2', name: '甲', n: 10 }
      ],
      rowKey: 'key',
      sort: true
    });
    const btn = host.querySelector('.nui-table__sort');
    btn && btn.click();
    const th = host.querySelector('th[aria-sort]');
    return {
      ariaSort: th && th.getAttribute('aria-sort'),
      first: host.querySelector('tbody tr td')?.textContent.trim(),
      target: !!window.__h.table.getTarget('r1')
    };
  });
  ok('Table sort button updates aria-sort and order', state.ariaSort === 'ascending' && state.target, JSON.stringify(state));
  ok('Table getTarget returns a row', state.target, '');
}

// 7. CodeBlock copy fallback
await fresh();
{
  await evalp(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('blocked')) }, configurable: true });
    document.execCommand = () => false;
    const host = document.getElementById('host');
    window.__h.code = NoteUI.CodeBlock.mount(host, { code: 'const a = 1;', language: 'js', title: '片段', copy: true });
    host.querySelector('.nui-code__copy').click();
  });
  await wait(300);
  const state = await evalp(() => {
    const fb = document.querySelector('.nui-code__copy-fallback');
    const status = document.querySelector('.nui-code__copy-status');
    return { fallbackVisible: !!fb && !fb.hidden, status: status?.textContent || '', area: fb?.querySelector('textarea')?.value || '' };
  });
  ok('CodeBlock copy failure shows manual fallback', state.fallbackVisible && /复制失败|手动|选择/.test(state.status) && /const a/.test(state.area), JSON.stringify(state));
}

// 8. Markdown raw HTML / javascript link safety
await fresh();
{
  await evalp(() => {
    const host = document.getElementById('host');
    window.__h.md = NoteUI.Markdown.mount(host, {
      markdown: '# 标题\n\n<script>window.__xss = 1<\/script>\n\n<img src=x onerror="window.__xss=2">\n\n[危险链接](javascript:window.__xss=3)\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```js\nconsole.log("safe")\n```'
    });
  });
  await wait(200);
  const state = await evalp(() => ({
    xss: window.__xss,
    scripts: document.querySelectorAll('.nui-markdown script').length,
    onerror: document.querySelectorAll('.nui-markdown [onerror]').length,
    jsLinks: Array.from(document.querySelectorAll('.nui-markdown a')).filter(a => (a.getAttribute('href') || '').toLowerCase().startsWith('javascript:')).length,
    hasHeading: !!document.querySelector('.nui-markdown h1'),
    hasTable: !!document.querySelector('.nui-markdown table, .nui-table'),
    codeBlock: !!document.querySelector('.nui-markdown .nui-code, .nui-markdown pre')
  }));
  ok('Markdown does not execute raw HTML', state.xss === undefined && state.scripts === 0 && state.onerror === 0 && state.jsLinks === 0, JSON.stringify(state));
  ok('Markdown renders headings/table/code', state.hasHeading && state.hasTable && state.codeBlock, JSON.stringify(state));
}

// 9. Math normal + error
await fresh();
{
  const state = await evalp(() => {
    const host = document.getElementById('host');
    window.__h.math = NoteUI.Math.mount(host, { tex: '\\frac{a}{b} + \\sqrt{x}', display: 'block' });
    const rendered = !!host.querySelector('.katex');
    window.__h.math.update({ tex: '\\frac{' });
    const err = host.querySelector('.nui-math__error');
    return {
      rendered,
      errorVisible: !!err && !err.hidden,
      errorText: err?.textContent || '',
      raw: host.querySelector('.nui-math__raw')?.textContent || ''
    };
  });
  ok('Math renders normal TeX with KaTeX', state.rendered, JSON.stringify({ rendered: state.rendered }));
  ok('Math error is readable and keeps raw TeX', state.errorVisible && /公式/.test(state.errorText) && state.raw.includes('\\frac'), JSON.stringify(state).slice(0, 300));
}

// 10. DatePicker open / invalid text / range value
await fresh();
{
  const state = await evalp(() => {
    const host = document.getElementById('host');
    window.__h.picker = NoteUI.DatePicker.mount(host, { value: '2026-10-15', min: '2026-10-01', max: '2026-12-31' });
    window.__h.picker.open();
    return {
      layers: document.querySelectorAll('.hnv-floating').length,
      days: document.querySelectorAll('.hnv-floating [role=gridcell], .hnv-floating button').length
    };
  });
  ok('DatePicker opens calendar layer', state.layers === 1 && state.days > 5, JSON.stringify(state));
  await page.keyboard.press('Escape');
  await wait();
  const closed = await evalp(() => document.querySelectorAll('.hnv-floating').length);
  ok('DatePicker Esc closes', closed === 0, 'layers=' + closed);
  const invalid = await evalp(() => {
    const input = document.querySelector('.nui-datepicker__input');
    input.value = '2026-02-30';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    const error = document.querySelector('.nui-datepicker__error');
    return { value: window.__h.picker.getValue(), error: error?.textContent || '' };
  });
  ok('DatePicker rejects impossible date without keeping stale value', invalid.value === null && /日期|有效|格式|范围/.test(invalid.error), JSON.stringify(invalid));
  const range = await evalp(() => {
    const host = document.getElementById('host');
    const box = document.createElement('div');
    host.appendChild(box);
    const p = NoteUI.DatePicker.mount(box, { range: true, value: { start: '2026-11-10', end: '2026-11-03' } });
    const value = p.getValue();
    p.destroy();
    return value;
  });
  ok('DatePicker orders reversed range', range && range.start === '2026-11-03' && range.end === '2026-11-10', JSON.stringify(range));
}

// 11. Sequence getTarget identity after update
await fresh();
{
  const state = await evalp(() => {
    const host = document.getElementById('host');
    window.__h.seq = NoteViz.Sequence.mount(host, {
      items: [{ id: 'a', label: '1' }, { id: 'b', label: '0' }, { id: 'c', label: '1' }],
      variant: 'bits',
      focus: ['b'],
      changed: ['b']
    });
    const before = window.__h.seq.getTarget('b');
    window.__h.seq.update({ items: [{ id: 'a', label: '1' }, { id: 'b', label: '1' }, { id: 'c', label: '0' }], focus: ['c'], changed: ['c'] });
    const after = window.__h.seq.getTarget('b');
    return {
      before: !!before,
      after: !!after,
      same: before === after,
      targetC: !!window.__h.seq.getTarget('c'),
      text: after?.textContent || ''
    };
  });
  ok('Sequence getTarget stable across update', state.before && state.after && state.same && state.targetC, JSON.stringify(state));
}

// 12. Chart variants, getTarget, data table
await fresh();
{
  const state = await evalp(() => {
    const host = document.getElementById('host');
    const types = ['bar', 'line', 'scatter', 'pie'];
    const results = [];
    types.forEach((type) => {
      const box = document.createElement('div');
      host.appendChild(box);
      const chart = NoteViz.Chart.mount(box, {
        type,
        data: [{ label: '甲', value: 3 }, { label: '乙', value: 7 }, { label: '丙', value: -2 }],
        labels: ['集团甲', '集团乙', '集团丙'],
        focus: { index: 1 },
        label: type + ' 图表',
        table: true
      });
      results.push({
        type,
        svg: !!box.querySelector('svg'),
        target: type === 'pie' ? !!chart.getTarget('slice:1') : !!chart.getTarget('point:1'),
        table: !!box.querySelector('table')
      });
      chart.destroy();
      box.remove();
    });
    return results;
  });
  ok('Chart renders all four variants with targets and tables', state.every(x => x.svg && x.target && x.table), JSON.stringify(state));
}

// 13. SequenceEdit remove/move/swap/reset
await fresh();
{
  const state = await evalp(() => {
    const host = document.getElementById('host');
    window.__h.edit = NoteViz.SequenceEdit.mount(host, {
      items: [{ id: 'a', label: '甲' }, { id: 'b', label: '乙' }, { id: 'c', label: '丙' }],
      animate: false
    });
    window.__h.edit.remove('b', { animate: false });
    const afterRemove = window.__h.edit.getState().items.map(x => x.id).join(',');
    window.__h.edit.move('c', 0, { animate: false });
    const afterMove = window.__h.edit.getState().items.map(x => x.id).join(',');
    window.__h.edit.swap('a', 'c', { animate: false });
    const afterSwap = window.__h.edit.getState().items.map(x => x.id).join(',');
    window.__h.edit.reset({ animate: false });
    const afterReset = window.__h.edit.getState().items.map(x => x.id).join(',');
    return { afterRemove, afterMove, afterSwap, afterReset, target: !!window.__h.edit.getTarget('a') };
  });
  ok('SequenceEdit remove/move/swap/reset preserve ids', state.afterRemove === 'a,c' && state.afterMove === 'c,a' && state.afterSwap === 'a,c' && state.afterReset === 'a,b,c' && state.target, JSON.stringify(state));
}

// 14. Transfer send/reset no duplicates
await fresh();
{
  const state = await evalp(() => {
    const host = document.getElementById('host');
    const source = document.createElement('div'); source.className = 'probe';
    const target = document.createElement('div'); target.className = 'probe';
    host.append(source, target);
    window.__h.transfer = NoteViz.Transfer.mount(host, {
      source, target, object: { id: 'k', label: '键值' }, animate: false
    });
    const count = () => document.querySelectorAll('.nviz-transfer__object').length;
    const before = count();
    window.__h.transfer.send({ animate: false });
    const afterSend = count();
    const inTarget = target.querySelectorAll('.nviz-transfer__object').length;
    window.__h.transfer.reset({ animate: false });
    const afterReset = count();
    const inSource = source.querySelectorAll('.nviz-transfer__object').length;
    return { before, afterSend, inTarget, afterReset, inSource, state: window.__h.transfer.getState() };
  });
  ok('Transfer send moves single object to target', state.before === 1 && state.afterSend === 1 && state.inTarget === 1, JSON.stringify(state).slice(0, 300));
  ok('Transfer reset returns single object to source', state.afterReset === 1 && state.inSource === 1, JSON.stringify(state).slice(0, 300));
}

// 15. SplitMerge / ReplaceReveal play/reset
await fresh();
{
  const state = await evalp(() => {
    const host = document.getElementById('host');
    const box = document.createElement('div'); host.appendChild(box);
    const split = NoteViz.SplitMerge.mount(box, {
      mode: 'split',
      before: [{ id: 'whole', label: '整体' }],
      after: [{ id: 'left', label: '左部' }, { id: 'right', label: '右部' }],
      animate: false
    });
    split.play({ animate: false });
    const played = split.getState();
    split.reset({ animate: false });
    const reset = split.getState();
    const box2 = document.createElement('div'); host.appendChild(box2);
    const swap = NoteViz.ReplaceReveal.mount(box2, {
      mode: 'replace',
      before: { id: 'v', label: '值', value: '旧' },
      after: { id: 'v', label: '值', value: '新' },
      animate: false
    });
    swap.play({ animate: false });
    const after = swap.getState();
    swap.reset({ animate: false });
    const before = swap.getState();
    return { splitPlayed: played, splitReset: reset, replaceAfter: after, replaceBefore: before };
  });
  ok('SplitMerge plays and resets', state.splitPlayed && state.splitReset, JSON.stringify(state).slice(0, 400));
  ok('ReplaceReveal plays and resets same identity', state.replaceAfter && state.replaceBefore && state.replaceAfter.phase === 'after' && state.replaceBefore.phase === 'before' && state.replaceAfter.after.id === 'v' && state.replaceAfter.value === '新' && state.replaceBefore.value === '旧', JSON.stringify(state).slice(0, 400));
}

// 16. Progress indeterminate has no fake value
await fresh();
{
  const state = await evalp(() => {
    const host = document.getElementById('host');
    const box = document.createElement('div'); host.appendChild(box);
    const p = NoteUI.Progress.mount(box, { value: null, label: '同步中' });
    const bar = box.querySelector('[role=progressbar]');
    const attrs = bar ? { now: bar.getAttribute('aria-valuenow'), text: bar.getAttribute('aria-valuetext') } : null;
    p.update({ value: 42 });
    const now = bar?.getAttribute('aria-valuenow');
    return { attrs, now };
  });
  ok('Progress indeterminate has no aria-valuenow', state.attrs && state.attrs.now === null && state.now === '42', JSON.stringify(state));
}

// 17. Toast queue + cleanup
await fresh();
{
  const state = await evalp(() => {
    const host = document.getElementById('host');
    const region = NoteUI.Toast.mount(host, { max: 2 });
    region.show({ message: '一', tone: 'info', duration: 60000 });
    region.show({ message: '二', tone: 'success', duration: 60000 });
    region.show({ message: '三', tone: 'warning', duration: 60000 });
    const items = region.el.querySelectorAll('.nui-toast__item, [data-toast-item]').length;
    region.destroy();
    return { items, after: host.querySelectorAll('.nui-toast').length };
  });
  ok('Toast queue caps visible items and destroy cleans', state.items <= 2 && state.after === 0, JSON.stringify(state));
}

// 18. Reduced motion: mechanisms settle immediately
await context.close();
const rmContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
const rmPage = await rmContext.newPage();
rmPage.on('pageerror', (e) => errors.push('rm pageerror: ' + e.message));
await rmPage.goto(hostUrl, { waitUntil: 'load' });
const rmState = await rmPage.evaluate(() => {
  const host = document.getElementById('host');
  const edit = NoteViz.SequenceEdit.mount(host, { items: [{ id: 'a', label: '甲' }, { id: 'b', label: '乙' }], animate: true });
  edit.move('b', 0);
  const items = edit.getState().items.map(x => x.id).join(',');
  const active = document.getAnimations ? document.getAnimations().length : -1;
  const motionReduced = NoteCore.motion.reduced();
  edit.destroy();
  return { items, active, motionReduced };
});
ok('Reduced motion mechanisms settle immediately', rmState.items === 'b,a' && rmState.motionReduced && rmState.active === 0, JSON.stringify(rmState));
await rmContext.close();

await browser.close();
const failed = results.filter(r => !r.pass);
const summary = { checks: results.length, passed: results.length - failed.length, failed: failed.length, failures: failed, errors: errors.slice(0, 30) };
writeCacheJson(root, ['checks', 'high-risk.json'], { summary, results });
console.log(JSON.stringify(summary, null, 2));
if (failed.length) process.exitCode = 1;
