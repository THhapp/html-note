// 主控杂项交互检查：浮层、导航、操作、布局。
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
  await page.evaluate(() => { window.__h = {}; window.__events = []; });
  await wait(80);
}

// Popover open/interactive/Esc/focus return
await fresh();
{
  await page.evaluate(() => {
    const host = document.getElementById('host');
    const content = document.createElement('div');
    const inner = document.createElement('button');
    inner.id = 'pop-inner';
    inner.textContent = '弹层内操作';
    inner.onclick = () => { window.__events.push('inner'); };
    content.appendChild(inner);
    window.__h.pop = NoteUI.Popover.mount(host, { triggerLabel: '打开弹出说明', content });
    window.__h.pop.getTrigger().focus();
    window.__h.pop.open();
  });
  await wait(180);
  const open = await page.evaluate(() => ({
    layers: document.querySelectorAll('.hnv-floating').length,
    triggerExpanded: window.__h.pop.getTrigger().getAttribute('aria-expanded')
  }));
  ok('Popover opens interactive layer', open.layers === 1 && open.triggerExpanded === 'true', JSON.stringify(open));
  await page.click('#pop-inner');
  await wait(100);
  const inner = await page.evaluate(() => window.__events);
  ok('Popover content is interactive', inner.includes('inner'), JSON.stringify(inner));
  await page.keyboard.press('Escape');
  await wait(150);
  const closed = await page.evaluate(() => ({
    layers: document.querySelectorAll('.hnv-floating').length,
    focusTrigger: document.activeElement === window.__h.pop.getTrigger()
  }));
  ok('Popover Esc closes and returns focus', closed.layers === 0 && closed.focusTrigger, JSON.stringify(closed));
}

// Drawer scroll lock restore + Esc
await fresh();
{
  await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.drawer = NoteUI.Drawer.mount(host, {
      title: '抽屉检查',
      content: '抽屉内容。',
      actions: [{ label: '完成' }],
      side: 'right'
    });
    window.__h.drawer.open();
  });
  await wait(200);
  const open = await page.evaluate(() => {
    const b = document.body;
    const h = document.documentElement;
    return {
      layers: document.querySelectorAll('.hnv-floating').length,
      bodyOverflow: b.style.overflow,
      htmlOverflow: h.style.overflow,
      focusInside: !!document.querySelector('.hnv-floating')?.contains(document.activeElement)
    };
  });
  ok('Drawer opens with focus and scroll lock', open.layers === 1 && open.focusInside && (open.bodyOverflow === 'hidden' || open.htmlOverflow === 'hidden'), JSON.stringify(open));
  await page.keyboard.press('Escape');
  await wait(200);
  const closed = await page.evaluate(() => ({
    layers: document.querySelectorAll('.hnv-floating').length,
    bodyOverflow: document.body.style.overflow,
    htmlOverflow: document.documentElement.style.overflow
  }));
  ok('Drawer Esc closes and restores scroll', closed.layers === 0 && !closed.bodyOverflow && !closed.htmlOverflow, JSON.stringify(closed));
}

// Tooltip focus + describedby + Esc
await fresh();
{
  await page.evaluate(() => {
    const host = document.getElementById('host');
    const anchor = document.createElement('button');
    anchor.id = 'tip-anchor';
    anchor.textContent = '键盘锚点';
    document.body.appendChild(anchor);
    window.__h.tip = NoteUI.Tooltip.mount(host, { anchor, content: '辅助提示' });
    anchor.focus();
  });
  await wait(250);
  const state = await page.evaluate(() => ({
    layers: document.querySelectorAll('.hnv-floating').length,
    described: document.getElementById('tip-anchor').getAttribute('aria-describedby') || ''
  }));
  ok('Tooltip opens on keyboard focus and links description', state.layers === 1 && state.described.length > 0, JSON.stringify(state));
  await page.keyboard.press('Escape');
  await wait(120);
  const closed = await page.evaluate(() => document.querySelectorAll('.hnv-floating').length);
  ok('Tooltip Esc dismisses', closed === 0, 'layers=' + closed);
}

// AnchorNav scroll + active
await fresh();
{
  await page.evaluate(() => {
    const host = document.getElementById('host');
    const box = document.createElement('div');
    box.id = 'nav-scroll';
    box.style.cssText = 'height:220px;overflow:auto;border:1px solid #ccc';
    ['s1', 's2', 's3'].forEach((id, i) => {
      const sec = document.createElement('section');
      sec.id = id;
      sec.style.cssText = 'height:180px;padding:12px';
      sec.textContent = '章节 ' + (i + 1);
      box.appendChild(sec);
    });
    host.appendChild(box);
    const navHost = document.createElement('div');
    host.appendChild(navHost);
    window.__h.nav = NoteUI.AnchorNav.mount(navHost, {
      items: [{ id: 's1', label: '第一节' }, { id: 's2', label: '第二节' }, { id: 's3', label: '第三节' }],
      target: box
    });
  });
  await page.getByRole('link', { name: '第三节' }).click();
  await wait(300);
  const state = await page.evaluate(() => ({ scrollTop: document.getElementById('nav-scroll').scrollTop, active: window.__h.nav.getValue() }));
  ok('AnchorNav scrolls target container', state.scrollTop > 200, JSON.stringify(state));
  ok('AnchorNav updates active section', state.active === 's3', JSON.stringify(state));
}

// Breadcrumb overflow menu
await fresh();
{
  await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.crumb = NoteUI.Breadcrumb.mount(host, {
      maxItems: 3,
      items: [
        { label: '首页', href: '#home' },
        { label: '项目', href: '#project' },
        { label: '文档', href: '#docs' },
        { label: '组件', href: '#components' },
        { label: '当前项' }
      ]
    });
  });
  const hasOverflow = await page.evaluate(() => !!document.querySelector('.nui-breadcrumb__item--overflow button'));
  ok('Breadcrumb collapses middle items', hasOverflow, '');
  await page.click('.nui-breadcrumb__item--overflow button');
  await wait(180);
  const menu = await page.evaluate(() => ({ layers: document.querySelectorAll('.hnv-floating').length, items: document.querySelectorAll('.nui-menu [role=menuitem], .hnv-floating [role=menuitem]').length }));
  ok('Breadcrumb overflow opens menu', menu.layers === 1 && menu.items >= 1, JSON.stringify(menu));
}

// Pagination page + pageSize
await fresh();
{
  const state = await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.pager = NoteUI.Pagination.mount(host, {
      total: 100, page: 5, pageSize: 10,
      onChange: (page, size) => window.__events.push({ page, size })
    });
    const pageBtn = Array.from(host.querySelectorAll('.nui-pagination__page')).find(b => b.textContent.trim() === '6');
    pageBtn && pageBtn.click();
    const afterPage = window.__h.pager.getValue();
    const size = host.querySelector('.nui-pagination__select');
    size.value = '20';
    size.dispatchEvent(new Event('change', { bubbles: true }));
    return { afterPage, afterSize: window.__h.pager.getValue(), events: window.__events };
  });
  ok('Pagination changes page', state.afterPage.page === 6, JSON.stringify(state));
  ok('Pagination changes page size', state.afterSize.pageSize === 20, JSON.stringify(state));
}

// Steps clickable
await fresh();
{
  const state = await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.steps = NoteUI.Steps.mount(host, {
      current: 0,
      clickable: true,
      items: [{ label: '准备' }, { label: '执行' }, { label: '完成' }],
      onChange: (index) => window.__events.push(index)
    });
    const buttons = host.querySelectorAll('.nui-steps__title--button');
    buttons[2] && buttons[2].click();
    return { events: window.__events, current: window.__h.steps.getValue ? window.__h.steps.getValue() : null, buttons: buttons.length };
  });
  ok('Steps clickable reports change', state.buttons === 3 && state.events.includes(2), JSON.stringify(state));
}

// Toggle group multi
await fresh();
{
  const state = await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.toggle = NoteUI.Toggle.mount(host, {
      label: '文本样式',
      multi: true,
      options: [{ value: 'bold', label: '加粗' }, { value: 'italic', label: '斜体' }],
      value: [],
      onChange: (v) => window.__events.push(v)
    });
    const buttons = host.querySelectorAll('.nui-toggle__button');
    buttons[0].click();
    buttons[1].click();
    return { value: window.__h.toggle.getValue(), pressed: Array.from(buttons).map(b => b.getAttribute('aria-pressed')) };
  });
  ok('Toggle multi group tracks pressed values', Array.isArray(state.value) && state.value.length === 2 && state.pressed.every(x => x === 'true'), JSON.stringify(state));
}

// ButtonGroup disabled + click
await fresh();
{
  const state = await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.group = NoteUI.ButtonGroup.mount(host, {
      label: '操作组',
      items: [
        { label: '保存', variant: 'primary', onClick: () => window.__events.push('save') },
        { label: '删除', disabled: true, onClick: () => window.__events.push('delete') }
      ]
    });
    const buttons = host.querySelectorAll('.nui-button');
    buttons[0].click();
    buttons[1].click();
    return { events: window.__events, disabled: buttons[1].disabled };
  });
  ok('ButtonGroup clicks enabled and blocks disabled', state.events.length === 1 && state.events[0] === 'save' && state.disabled, JSON.stringify(state));
}

// CopyButton failure fallback
await fresh();
{
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('blocked')) }, configurable: true });
    document.execCommand = () => false;
    const host = document.getElementById('host');
    window.__h.copy = NoteUI.CopyButton.mount(host, { text: '需要复制的文本', label: '复制文本' });
    host.querySelector('.nui-button').click();
  });
  await wait(400);
  const state = await page.evaluate(() => ({
    status: document.querySelector('.nui-copy-button__status')?.textContent || '',
    fallback: !!document.querySelector('.nui-copy-button__fallback') && !document.querySelector('.nui-copy-button__fallback').hidden,
    area: document.querySelector('.nui-copy-button__fallback-text')?.value || ''
  }));
  ok('CopyButton shows manual fallback on failure', state.fallback && /失败|手动|选择/.test(state.status) && /需要复制/.test(state.area), JSON.stringify(state));
}

// SplitPane keyboard + drag
await fresh();
{
  const state = await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.split = NoteUI.SplitPane.mount(host, { start: '左侧内容', end: '右侧内容', ratio: 0.5, minStart: 80, minEnd: 80, height: 220 });
    const sep = host.querySelector('.nui-split__separator');
    sep.focus();
    return { before: window.__h.split.getValue(), focus: document.activeElement === sep };
  });
  await page.keyboard.press('ArrowRight');
  await wait(150);
  const after = await page.evaluate(() => window.__h.split.getValue());
  ok('SplitPane keyboard adjusts ratio', state.focus && after > state.before, JSON.stringify({ state, after }));
}

// ScrollArea overflow indicator + no page hijack
await fresh();
{
  const state = await page.evaluate(() => {
    const host = document.getElementById('host');
    const content = document.createElement('div');
    for (let i = 0; i < 30; i++) content.appendChild(document.createTextNode('第 ' + i + ' 行长内容。'));
    window.__h.scroll = NoteUI.ScrollArea.mount(host, { maxHeight: 120, content });
    const viewport = host.querySelector('.nui-scroll-area__viewport');
    viewport.scrollTop = 60;
    viewport.dispatchEvent(new Event('scroll'));
    return {
      overflowNow: host.querySelector('.nui-scroll-area').dataset.overflowBottom,
      tabindex: viewport.getAttribute('tabindex'),
      scrollTop: viewport.scrollTop
    };
  });
  await wait(250);
  const hint = await page.evaluate(() => { const el = document.querySelector('.nui-scroll-area'); return el.dataset.overflowTop === 'true' || el.dataset.overflowBottom === 'true'; });
  ok('ScrollArea has keyboard access and overflow hint', state.tabindex === '0' && hint && state.scrollTop > 0, JSON.stringify({ ...state, hint }));
}

await browser.close();
const failed = results.filter(r => !r.pass);
const summary = { checks: results.length, passed: results.length - failed.length, failed: failed.length, failures: failed, errors: errors.slice(0, 30) };
writeCacheJson(root, ['checks', 'high-risk-misc.json'], { summary, results });
console.log(JSON.stringify(summary, null, 2));
if (failed.length) process.exitCode = 1;
