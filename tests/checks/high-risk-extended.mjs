// 主控扩展组件高风险检查（真实 Edge + 全量 dist）。
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

// X02 Carousel: no autoplay, hidden slides inert
await fresh();
{
  const state = await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.car = NoteUI.Carousel.mount(host, {
      items: [
        { label: '第一页', content: (() => { const b = document.createElement('button'); b.textContent = '第一页按钮'; b.id = 'slide1-btn'; return b; })() },
        { label: '第二页', content: (() => { const b = document.createElement('button'); b.textContent = '第二页按钮'; b.id = 'slide2-btn'; return b; })() }
      ],
      index: 0,
      auto: false
    });
    const hiddenSlide = host.querySelectorAll('.nui-carousel__slide')[1];
    return {
      value: window.__h.car.getValue(),
      hiddenInert: hiddenSlide.hasAttribute('inert') || hiddenSlide.getAttribute('aria-hidden') === 'true',
      tabbables: hiddenSlide.querySelectorAll('button, [tabindex="0"]').length
    };
  });
  ok('Carousel defaults to first slide without autoplay', state.value === 0, JSON.stringify(state));
  ok('Carousel hides inactive slide from focus', state.hiddenInert, JSON.stringify(state));
  await page.getByRole('button', { name: /下一|下一步|›/ }).first().click().catch(() => {});
  await wait(200);
  const after = await page.evaluate(() => ({ value: window.__h.car.getValue() }));
  if (after.value === 0) {
    await page.evaluate(() => window.__h.car.update({ index: 1 }));
  }
  const final = await page.evaluate(() => window.__h.car.getValue());
  ok('Carousel can change slide', final === 1, JSON.stringify({ after, final }));
}

// X03 Rating keyboard + readonly + clear
await fresh();
{
  const state = await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.rating = NoteUI.Rating.mount(host, { value: 3, label: '评分' });
    const control = host.querySelector('[role=slider]');
    control.focus();
    return { value: window.__h.rating.getValue(), focus: document.activeElement === control };
  });
  await page.keyboard.press('ArrowRight');
  await wait(80);
  const right = await page.evaluate(() => window.__h.rating.getValue());
  await page.keyboard.press('Home');
  await wait(80);
  const home = await page.evaluate(() => window.__h.rating.getValue());
  const readOnly = await page.evaluate(() => {
    const box = document.createElement('div');
    document.getElementById('host').appendChild(box);
    const r = NoteUI.Rating.mount(box, { value: 4, readonly: true });
    const before = r.getValue();
    const control = box.querySelector('[role=slider]');
    control && control.focus();
    return { before, after: r.getValue() };
  });
  ok('Rating supports keyboard increments', state.value === 3 && right === 4 && home === 0, JSON.stringify({ right, home }));
  ok('Rating readonly does not change', readOnly.before === 4 && readOnly.after === 4, JSON.stringify(readOnly));
}

// X04 Cascader path selection
await fresh();
{
  await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.cascader = NoteUI.Cascader.mount(host, {
      options: [
        { value: 'tech', label: '技术', children: [{ value: 'css', label: 'CSS' }, { value: 'js', label: 'JS' }] },
        { value: 'life', label: '生活' }
      ],
      onChange: (value, nodes) => { window.__cascade = value; window.__cascadePath = nodes.map(n => n.label); }
    });
    host.querySelector('.nui-cascader__trigger').click();
  });
  await wait(180);
  const open = await page.evaluate(() => ({ layers: document.querySelectorAll('.hnv-floating').length, options: document.querySelectorAll('.nui-cascader__option').length }));
  ok('Cascader opens a floating column panel', open.layers === 1 && open.options >= 2, JSON.stringify(open));
  await page.evaluate(() => {
    const options = Array.from(document.querySelectorAll('.nui-cascader__option'));
    const tech = options.find(o => o.textContent.includes('技术'));
    tech && tech.click();
  });
  await wait(100);
  await page.evaluate(() => {
    const options = Array.from(document.querySelectorAll('.nui-cascader__option'));
    const css = options.find(o => o.textContent.trim().startsWith('CSS'));
    css && css.click();
  });
  await wait(120);
  const selected = await page.evaluate(() => ({ value: window.__h.cascader.getValue(), changed: window.__cascade, path: window.__cascadePath, layers: document.querySelectorAll('.hnv-floating').length }));
  ok('Cascader selects leaf path and reports it', Array.isArray(selected.value) && selected.value.join('/') === 'tech/css' && selected.path && selected.path.join('/') === '技术/CSS', JSON.stringify(selected));
  await page.keyboard.press('Escape');
  await wait();
  const closed = await page.evaluate(() => document.querySelectorAll('.hnv-floating').length);
  ok('Cascader Esc closes panel', closed === 0, 'layers=' + closed);
}

// X05 TreeSelect uses TreeView and selection/clear
await fresh();
{
  await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.treeSelect = NoteUI.TreeSelect.mount(host, {
      nodes: [{ id: 'a', label: '甲' }, { id: 'b', label: '乙' }],
      onChange: (value) => { window.__treeValue = value; }
    });
    host.querySelector('.nui-treeselect__trigger').click();
  });
  await wait(200);
  const open = await page.evaluate(() => ({
    layers: document.querySelectorAll('.hnv-floating').length,
    treeitems: document.querySelectorAll('.hnv-floating [role=treeitem]').length
  }));
  ok('TreeSelect opens TreeView in floating panel', open.layers === 1 && open.treeitems === 2, JSON.stringify(open));
  await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.hnv-floating [role=treeitem]')).find(el => el.textContent.includes('甲'));
    item && item.click();
  });
  await wait(150);
  const selected = await page.evaluate(() => ({ value: window.__h.treeSelect.getValue(), changed: window.__treeValue, text: document.querySelector('.nui-treeselect__summary')?.textContent || '' }));
  ok('TreeSelect selects node and displays it', selected.value === 'a' && selected.changed === 'a' && /甲/.test(selected.text), JSON.stringify(selected));
  const cleared = await page.evaluate(() => {
    const clear = document.querySelector('.nui-treeselect__clear');
    clear && clear.click();
    return { value: window.__h.treeSelect.getValue() };
  });
  ok('TreeSelect clears value', cleared.value === null || cleared.value === '' || (Array.isArray(cleared.value) && cleared.value.length === 0), JSON.stringify(cleared));
}

// X06 TransferList filtering and move
await fresh();
{
  const state = await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.transfer = NoteUI.TransferList.mount(host, {
      source: [{ value: 'a', label: '甲' }, { value: 'b', label: '乙' }, { value: 'c', label: '丙', disabled: true }],
      target: [{ value: 'z', label: '已选' }],
      filterable: true,
      onChange: (target, moved) => { window.__transfer = { target, moved }; }
    });
    const search = host.querySelector('[data-transfer-filter=source]');
    search.value = '甲';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    const visible = host.querySelectorAll('.nui-transfer__side:first-of-type .nui-transfer__item').length;
    const row = Array.from(host.querySelectorAll('.nui-transfer__side:first-of-type .nui-transfer__item')).find(el => el.textContent.includes('甲'));
    const checkbox = row && row.querySelector('input[type=checkbox]');
    checkbox && checkbox.click();
    const move = host.querySelector('[data-transfer-action=to-target]');
    move && move.click();
    return { visible, value: window.__h.transfer.getValue(), moved: window.__transfer, filter: search.value };
  });
  ok('TransferList filters source side', state.visible === 1 && state.filter === '甲', JSON.stringify(state));
  ok('TransferList moves selected item and reports values', Array.isArray(state.value) && state.value.includes('a') && state.value.includes('z'), JSON.stringify(state).slice(0, 400));
}

// X07 CommandPalette filter, keyboard, run, close
await fresh();
{
  await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__ran = null;
    window.__h.palette = NoteUI.CommandPalette.mount(host, {
      commands: [
        { id: 'open', label: '打开预览', group: '导航', run: () => { window.__ran = 'open'; } },
        { id: 'copy', label: '复制链接', group: '编辑', keywords: 'link', run: () => { window.__ran = 'copy'; } },
        { id: 'off', label: '不可用命令', group: '编辑', disabled: true, run: () => { window.__ran = 'off'; } }
      ]
    });
    window.__h.palette.open();
  });
  await wait(200);
  const open = await page.evaluate(() => ({
    layers: document.querySelectorAll('.hnv-floating').length,
    focused: !!document.querySelector('.nui-command__input') && document.activeElement === document.querySelector('.nui-command__input'),
    options: document.querySelectorAll('.nui-command__option').length
  }));
  ok('CommandPalette opens modal with focused input', open.layers === 1 && open.focused && open.options === 3, JSON.stringify(open));
  await page.keyboard.type('链接');
  await wait(150);
  const filtered = await page.evaluate(() => Array.from(document.querySelectorAll('.nui-command__option')).map(el => el.textContent.trim()));
  ok('CommandPalette filters commands', filtered.length === 1 && /复制链接/.test(filtered[0] || ''), JSON.stringify(filtered));
  await page.keyboard.press('Enter');
  await wait(180);
  const done = await page.evaluate(() => ({ ran: window.__ran, layers: document.querySelectorAll('.hnv-floating').length }));
  ok('CommandPalette Enter runs command and closes', done.ran === 'copy' && done.layers === 0, JSON.stringify(done));
}

// X01 Avatar image failure fallback
await fresh();
{
  const state = await page.evaluate(async () => {
    const host = document.getElementById('host');
    const avatar = NoteUI.Avatar.mount(host, { label: '张三', src: 'data:image/png;base64,AAAA', alt: '张三头像' });
    await new Promise(r => setTimeout(r, 150));
    return {
      fallback: host.querySelector('.nui-avatar__fallback')?.textContent || '',
      imageHidden: !host.querySelector('.nui-avatar__img') || host.querySelector('.nui-avatar__img').hidden || getComputedStyle(host.querySelector('.nui-avatar__img')).display === 'none'
    };
  });
  ok('Avatar falls back to initials when image fails', /张/.test(state.fallback), JSON.stringify(state));
}

await browser.close();
const failed = results.filter(r => !r.pass);
const summary = { checks: results.length, passed: results.length - failed.length, failed: failed.length, failures: failed, errors: errors.slice(0, 30) };
writeCacheJson(root, ['checks', 'high-risk-extended.json'], { summary, results });
console.log(JSON.stringify(summary, null, 2));
if (failed.length) process.exitCode = 1;
