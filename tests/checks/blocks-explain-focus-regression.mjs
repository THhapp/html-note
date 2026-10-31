import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readModuleSources } from '../lib/src-sources.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('../tools/node_modules/playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const harness = pathToFileURL(path.join(here, 'blocks-explain-harness.html')).href;
// 注入当前源码覆盖 dist 中的旧实现；shared.js 是模块内部共享文件，必须按 manifest 顺序一起注入。
const blockSources = readModuleSources(root, 'blocks')
  .filter((item) => /(?:^|\/)(?:shared|framefields)\.js$/.test(item.relative))
  .map((item) => item.file);
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const failures = [];
function check(name, ok, detail) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || !detail ? '' : ' :: ' + detail));
  if (!ok) failures.push({ name, detail });
}

// This check intentionally injects the current source file over the dist
// bundle so the source can be verified without running a build.
const browser = await chromium.launch({ executablePath: edge, headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(String(e && e.stack || e)));
await page.goto(harness, { waitUntil: 'load' });
for (const source of blockSources) await page.addScriptTag({ path: source });
const mounted = await page.evaluate(() => {
  const host = document.getElementById('host');
  host.replaceChildren();
  host.style.width = '720px';
  window.__focusSelectCalls = [];
  window.__focusFields = window.NoteBlocks.FrameFields.mount(host, {
    items: ['1', '0', '1', '1'],
    fields: [
      { id: 'mode', label: '模式', start: 0, end: 1 },
      { id: 'count', label: '计数', start: 2, end: 3 }
    ],
    focusField: 'mode',
    label: '键盘聚焦回归检查',
    onSelect: function (id) { window.__focusSelectCalls.push(id); }
  });
  const first = host.querySelector('.nblk-framefields__field-button[data-field-id="mode"]');
  if (first) first.focus();
  return {
    selected: window.__focusFields.getSelected(),
    active: document.activeElement && document.activeElement.getAttribute('data-field-id'),
    buttons: Array.from(host.querySelectorAll('.nblk-framefields__field-button')).map((button) => button.getAttribute('data-field-id'))
  };
});
check('B06 source mounted with two fields', mounted.buttons.join(',') === 'mode,count', JSON.stringify(mounted));
check('B06 initial selection is mode and first field is focused', mounted.selected === 'mode' && mounted.active === 'mode', JSON.stringify(mounted));

await page.keyboard.press('Tab');
await page.waitForTimeout(40);
const afterTab = await page.evaluate(() => {
  const active = document.activeElement;
  return {
    selected: window.__focusFields.getSelected(),
    active: active ? active.getAttribute('data-field-id') : null,
    calls: window.__focusSelectCalls.slice(),
    pressedCount: document.querySelectorAll('.nblk-framefields__field-button[aria-pressed="true"]').length,
    mark: document.querySelectorAll('.nviz-sequence__unit[data-mark="focus"], .nviz-sequence__unit[data-mark="both"]').length
  };
});
check('B06 Tab focus selects second field without onSelect', afterTab.selected === 'count' && afterTab.active === 'count' && afterTab.calls.length === 0, JSON.stringify(afterTab));
check('B06 Tab focus updates pressed field and Sequence focus', afterTab.pressedCount === 1 && afterTab.mark === 2, JSON.stringify(afterTab));

await page.locator('.nblk-framefields__field-button[data-field-id="mode"]').click();
await page.waitForTimeout(60);
const afterClick = await page.evaluate(() => {
  const active = document.activeElement;
  const rows = Array.from(document.querySelectorAll('.nblk-framefields__field')).map((row) => ({
    id: row.getAttribute('data-field-id'),
    selected: row.classList.contains('is-selected'),
    pressed: row.querySelector('.nblk-framefields__field-button').getAttribute('aria-pressed')
  }));
  return {
    selected: window.__focusFields.getSelected(),
    active: active ? active.getAttribute('data-field-id') : null,
    calls: window.__focusSelectCalls.slice(),
    rows: rows,
    modeValue: document.querySelector('.nblk-framefields__field[data-field-id="mode"] .nblk-framefields__value').textContent.trim()
  };
});
check('B06 Tab then click another field keeps clicked selection', afterClick.selected === 'mode', JSON.stringify(afterClick));
check('B06 Tab then click notifies exactly once with clicked id', afterClick.calls.length === 1 && afterClick.calls[0] === 'mode', JSON.stringify(afterClick));
check('B06 selected row and aria-pressed agree after click', afterClick.rows.every((row) => row.selected === (row.id === 'mode') && row.pressed === (row.id === 'mode' ? 'true' : 'false')), JSON.stringify(afterClick.rows));
check('B06 click focuses the clicked field after re-render', afterClick.active === 'mode', JSON.stringify(afterClick));
check('B06 field value remains correct', afterClick.modeValue === '2', afterClick.modeValue);

// A program update that changes focusField while a field retains DOM focus must
// not be overwritten by the focus restoration path either.
await page.evaluate(() => { window.__focusFields.update({ bitOrder: 'lsb', focusField: 'count' }); });
await page.waitForTimeout(30);
const afterUpdate = await page.evaluate(() => ({
  selected: window.__focusFields.getSelected(),
  calls: window.__focusSelectCalls.slice(),
  active: document.activeElement ? document.activeElement.getAttribute('data-field-id') : null
}));
check('B06 update focusField is not overwritten by restored focus', afterUpdate.selected === 'count' && afterUpdate.calls.length === 1, JSON.stringify(afterUpdate));

const destroyed = await page.evaluate(() => {
  const host = document.getElementById('host');
  window.__focusFields.destroy();
  return { children: host.children.length, records: document.querySelectorAll('.nblk-framefields, .nviz-sequence').length };
});
check('B06 source regression fixture destroys cleanly', destroyed.children === 0 && destroyed.records === 0, JSON.stringify(destroyed));
check('console errors empty', consoleErrors.length === 0, consoleErrors.join(' | '));
check('page errors empty', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
console.log('\nB06 focus regression summary: ' + (failures.length ? failures.length + ' failed' : 'all passed'));
if (failures.length) process.exitCode = 1;
