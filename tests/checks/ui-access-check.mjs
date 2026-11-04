#!/usr/bin/env node
/* Targeted accessibility/theme check for common overlays and forms.
 * Real Edge + source harness tests/checks/ui-access-check.html.
 * Usage: node tests/checks/ui-access-check.mjs
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const pageUrl = pathToFileURL(path.join(here, 'ui-access-check.html')).href;
const failures = [];
let passes = 0;
function check(name, ok, detail) {
  if (ok) { passes += 1; console.log('PASS  ' + name); }
  else { failures.push(name + (detail == null ? '' : ' :: ' + String(detail).slice(0, 500))); console.log('FAIL  ' + name + (detail == null ? '' : ' :: ' + String(detail).slice(0, 500))); }
}

const browser = await chromium.launch({ executablePath: edge, headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 820 } });
const pageErrors = [];
const consoleErrors = [];
const externalRequests = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('request', (request) => { if (/^https?:/i.test(request.url())) externalRequests.push(request.url()); });
try {
  await page.goto(pageUrl, { waitUntil: 'load' });
  const ready = await page.evaluate(() => ({
    core: !!window.NoteCore && !!window.NoteCore.floating,
    ui: !!(window.NoteUI && window.NoteUI.Dialog && window.NoteUI.Drawer && window.NoteUI.Toast && window.NoteUI.Notice && window.NoteUI.Segmented && window.NoteUI.Switch && window.NoteUI.Slider && window.NoteUI.DatePicker)
  }));
  check('harness loads core and common UI', ready.core && ready.ui, JSON.stringify(ready));

  /* Dialog: role/name/initial focus/Escape/return/long title. */
  const dialogState = await page.evaluate(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const host = document.createElement('div');
    host.className = 't77-dialog-host';
    document.getElementById('fixture-root').appendChild(host);
    const opener = document.createElement('button');
    opener.type = 'button';
    opener.textContent = '打开长标题对话框';
    host.appendChild(opener);
    const title = '这是一个很长很长的中文对话框标题'.repeat(12);
    const dialog = NoteUI.Dialog.mount(host, {
      title,
      content: '内容'.repeat(120),
      actions: [{ label: '取消', close: true }, { label: '保存', variant: 'primary', close: true }]
    });
    opener.addEventListener('click', () => dialog.open());
    opener.focus();
    opener.click();
    await wait(25);
    window.__t77Dialog = { dialog, opener, host };
    const panel = dialog.getPanel();
    const labelId = panel.getAttribute('aria-labelledby');
    return {
      role: panel.getAttribute('role'),
      modal: panel.getAttribute('aria-modal'),
      name: labelId && document.getElementById(labelId) ? document.getElementById(labelId).textContent : '',
      focusInside: panel.contains(document.activeElement),
      open: dialog.isOpen(),
      overflow: panel.scrollWidth <= panel.clientWidth + 1,
      bodyLocked: document.body.style.overflow === 'hidden'
    };
  });
  check('Dialog role=dialog + aria-modal', dialogState.role === 'dialog' && dialogState.modal === 'true', JSON.stringify(dialogState));
  check('Dialog has accessible name', /很长很长/.test(dialogState.name), dialogState.name.slice(0, 60));
  check('Dialog focuses inside on open', dialogState.focusInside && dialogState.open && dialogState.bodyLocked, JSON.stringify(dialogState));
  check('Dialog long title does not overflow', dialogState.overflow, JSON.stringify(dialogState));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(30);
  const dialogAfter = await page.evaluate(() => {
    const { dialog, opener } = window.__t77Dialog;
    return { open: dialog.isOpen(), focusReturned: document.activeElement === opener, overflow: document.body.style.overflow };
  });
  check('Dialog Escape closes and returns focus', !dialogAfter.open && dialogAfter.focusReturned && dialogAfter.overflow !== 'hidden', JSON.stringify(dialogAfter));
  await page.evaluate(() => { window.__t77Dialog.dialog.destroy(); window.__t77Dialog.host.remove(); delete window.__t77Dialog; });

  /* Drawer: role/name/Escape/return/long content. */
  const drawerState = await page.evaluate(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const host = document.createElement('div');
    host.className = 't77-drawer-host';
    document.getElementById('fixture-root').appendChild(host);
    const opener = document.createElement('button');
    opener.type = 'button';
    opener.textContent = '打开抽屉';
    host.appendChild(opener);
    const drawer = NoteUI.Drawer.mount(host, { title: '长内容抽屉', content: '段落内容'.repeat(220), actions: [{ label: '关闭', close: true }] });
    opener.addEventListener('click', () => drawer.open());
    opener.focus();
    opener.click();
    await wait(25);
    window.__t77Drawer = { drawer, opener, host };
    const panel = drawer.getPanel();
    const labelId = panel.getAttribute('aria-labelledby');
    return { role: panel.getAttribute('role'), modal: panel.getAttribute('aria-modal'), name: labelId && document.getElementById(labelId) ? document.getElementById(labelId).textContent : '', focusInside: panel.contains(document.activeElement), open: drawer.isOpen(), scrollable: panel.querySelector('.nui-drawer__content').scrollHeight >= panel.querySelector('.nui-drawer__content').clientHeight };
  });
  check('Drawer role=dialog + aria-modal + name', drawerState.role === 'dialog' && drawerState.modal === 'true' && /长内容抽屉/.test(drawerState.name), JSON.stringify(drawerState));
  check('Drawer focuses inside on open', drawerState.focusInside && drawerState.open, JSON.stringify(drawerState));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(30);
  const drawerAfter = await page.evaluate(() => {
    const { drawer, opener } = window.__t77Drawer;
    return { open: drawer.isOpen(), focusReturned: document.activeElement === opener };
  });
  check('Drawer Escape closes and returns focus', !drawerAfter.open && drawerAfter.focusReturned, JSON.stringify(drawerAfter));
  await page.evaluate(() => { window.__t77Drawer.drawer.destroy(); window.__t77Drawer.host.remove(); delete window.__t77Drawer; });

  /* Toast: named live region/entry/close label + long message. */
  const toastState = await page.evaluate(async () => {
    const host = document.createElement('div');
    host.className = 't77-toast-host';
    document.getElementById('fixture-root').appendChild(host);
    const toast = NoteUI.Toast.mount(host, { label: '操作通知' });
    toast.show({ tone: 'error', message: '错误提示'.repeat(80), duration: 0 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const region = host.querySelector('.nui-toast-region');
    const entry = host.querySelector('.nui-toast');
    const close = entry && entry.querySelector('.nui-toast__close');
    const state = { regionRole: region && region.getAttribute('role'), regionName: region && region.getAttribute('aria-label'), entryRole: entry && entry.getAttribute('role'), live: entry && entry.getAttribute('aria-live'), closeName: close && close.getAttribute('aria-label'), overflow: entry && entry.scrollWidth <= entry.clientWidth + 1 };
    window.__t77Toast = { toast, host };
    return state;
  });
  check('Toast region named and entry live', toastState.regionRole === 'region' && toastState.regionName === '操作通知' && toastState.entryRole === 'alert' && toastState.live === 'assertive', JSON.stringify(toastState));
  check('Toast close button has name and long message wraps', !!toastState.closeName && toastState.overflow === true, JSON.stringify(toastState));
  await page.evaluate(() => { window.__t77Toast.toast.destroy(); window.__t77Toast.host.remove(); delete window.__t77Toast; });

  /* Notice: role/name/token colors/long content + empty title removes name. */
  const noticeState = await page.evaluate(async () => {
    const host = document.createElement('div');
    host.className = 't77-notice-host';
    document.getElementById('fixture-root').appendChild(host);
    const notice = NoteUI.Notice.mount(host, { title: '警告标题', content: '长内容'.repeat(160), tone: 'warning' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const root = host.querySelector('.nui-notice');
    const marker = root.querySelector('.nui-notice__marker');
    const probe = document.createElement('span');
    probe.style.color = 'var(--hnv-color-warning)';
    document.body.appendChild(probe);
    const tokenColor = getComputedStyle(probe).color;
    probe.remove();
    const labelId = root.getAttribute('aria-labelledby');
    const state = { role: root.getAttribute('role'), name: labelId && document.getElementById(labelId) ? document.getElementById(labelId).textContent : '', markerColor: getComputedStyle(marker).color, tokenColor, borderColor: getComputedStyle(root).borderLeftColor, overflow: root.scrollWidth <= root.clientWidth + 1 };
    notice.update({ title: '' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    state.emptyTitleName = root.getAttribute('aria-labelledby');
    window.__t77Notice = { notice, host };
    return state;
  });
  check('Notice role=note has accessible name from title', noticeState.role === 'note' && /警告标题/.test(noticeState.name), JSON.stringify(noticeState));
  check('Notice warning colors use --hnv tokens', noticeState.markerColor === noticeState.tokenColor && noticeState.borderColor === noticeState.tokenColor, JSON.stringify(noticeState));
  check('Notice long content wraps and empty title drops name', noticeState.overflow === true && noticeState.emptyTitleName === null, JSON.stringify(noticeState));
  await page.evaluate(() => { window.__t77Notice.notice.destroy(); window.__t77Notice.host.remove(); delete window.__t77Notice; });

  /* Segmented: label + long option overflow + real ArrowRight. */
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 't77-seg-host';
    host.style.width = '320px';
    document.getElementById('fixture-root').appendChild(host);
    const seg = NoteUI.Segmented.mount(host, { options: [
      { value: 'a', label: '很长很长的选项名称甲用于检查窄容器溢出' },
      { value: 'b', label: '很长很长的选项名称乙用于检查窄容器溢出' },
      { value: 'c', label: '很长很长的选项名称丙用于检查窄容器溢出' }
    ] });
    window.__t77Seg = { seg, host };
  });
  const segDom = await page.evaluate(() => {
    const { seg, host } = window.__t77Seg;
    const root = host.querySelector('.nui-segmented');
    return { role: root.getAttribute('role'), name: root.getAttribute('aria-label'), buttonsNamed: [...root.querySelectorAll('.nui-segment')].every((node) => node.textContent.trim().length > 0), overflow: root.scrollWidth <= root.clientWidth + 1, value: seg.getValue() };
  });
  check('Segmented radio group/buttons named and long labels fit', segDom.role === 'radiogroup' && !!segDom.name && segDom.buttonsNamed && segDom.overflow, JSON.stringify(segDom));
  await page.locator('.t77-seg-host .nui-segment').first().focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(20);
  const segAfter = await page.evaluate(() => window.__t77Seg.seg.getValue());
  check('Segmented ArrowRight changes selection', segAfter === 'b', segAfter);
  await page.evaluate(() => { window.__t77Seg.seg.destroy(); window.__t77Seg.host.remove(); delete window.__t77Seg; });

  /* Switch: accessible name + real Space/Enter. */
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 't77-switch-host';
    document.getElementById('fixture-root').appendChild(host);
    const sw = NoteUI.Switch.mount(host, { label: '启用通知' });
    window.__t77Switch = { sw, host };
  });
  const switchDom = await page.evaluate(() => {
    const button = window.__t77Switch.host.querySelector('[role=switch]');
    return { role: button.getAttribute('role'), labelled: !!button.getAttribute('aria-labelledby') };
  });
  await page.locator('.t77-switch-host [role=switch]').focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(10);
  const switchSpace = await page.evaluate(() => window.__t77Switch.sw.getValue());
  await page.keyboard.press('Enter');
  await page.waitForTimeout(10);
  const switchEnter = await page.evaluate(() => window.__t77Switch.sw.getValue());
  check('Switch has accessible name and Space/Enter toggle', switchDom.role === 'switch' && switchDom.labelled && switchSpace === true && switchEnter === false, JSON.stringify({ switchDom, switchSpace, switchEnter }));
  await page.evaluate(() => { window.__t77Switch.sw.destroy(); window.__t77Switch.host.remove(); delete window.__t77Switch; });

  /* Slider: accessible name + real ArrowRight. */
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 't77-slider-host';
    document.getElementById('fixture-root').appendChild(host);
    const slider = NoteUI.Slider.mount(host, { label: '音量', min: 0, max: 100, step: 10, value: 50 });
    window.__t77Slider = { slider, host };
  });
  const sliderDom = await page.evaluate(() => {
    const input = window.__t77Slider.host.querySelector('input');
    return { type: input.type, labelled: !!(input.getAttribute('aria-label') || input.getAttribute('aria-labelledby')) };
  });
  await page.locator('.t77-slider-host input').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(10);
  const sliderValue = await page.evaluate(() => window.__t77Slider.slider.getValue());
  check('Slider has accessible name and ArrowRight changes value', sliderDom.labelled && sliderValue === 60, JSON.stringify({ sliderDom, sliderValue }));
  await page.evaluate(() => { window.__t77Slider.slider.destroy(); window.__t77Slider.host.remove(); delete window.__t77Slider; });

  /* DatePicker: trigger/panel names + Escape/focus return. */
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 't77-date-host';
    document.getElementById('fixture-root').appendChild(host);
    const picker = NoteUI.DatePicker.mount(host, { label: '选择日期', value: '2026-10-15', today: '2026-10-15' });
    window.__t77Date = { picker, host };
  });
  await page.locator('.t77-date-host .nui-datepicker__trigger').click();
  await page.waitForTimeout(30);
  const dateOpen = await page.evaluate(() => {
    const panels = [...document.querySelectorAll('.nui-datepicker__panel')];
    const panel = panels[panels.length - 1];
    return { count: panels.length, role: panel && panel.getAttribute('role'), name: panel && (panel.getAttribute('aria-label') || panel.getAttribute('aria-labelledby')) };
  });
  check('DatePicker opens named dialog', dateOpen.count === 1 && dateOpen.role === 'dialog' && !!dateOpen.name, JSON.stringify(dateOpen));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(30);
  const dateAfter = await page.evaluate(() => {
    const trigger = window.__t77Date.host.querySelector('.nui-datepicker__trigger');
    return { open: !!document.querySelector('.nui-datepicker__panel'), focusReturned: document.activeElement === trigger };
  });
  check('DatePicker Escape closes and returns focus', !dateAfter.open && dateAfter.focusReturned, JSON.stringify(dateAfter));
  await page.evaluate(() => { window.__t77Date.picker.destroy(); window.__t77Date.host.remove(); delete window.__t77Date; });

  check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
  check('no console errors', consoleErrors.length === 0, consoleErrors.join(' | '));
  check('no external requests', externalRequests.length === 0, externalRequests.join(' | '));
} finally {
  await browser.close();
}
console.log('SUMMARY ' + passes + '/' + (passes + failures.length) + ' passed');
if (failures.length) {
  console.error('\n' + failures.join('\n'));
  process.exit(1);
}
