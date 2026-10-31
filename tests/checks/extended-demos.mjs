import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { cacheDir } from '../lib/test-output.mjs';
import { moduleDemos, moduleScripts, moduleStyles } from '../lib/src-sources.mjs';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const shotDir = cacheDir(root, 'checks', 'extended');
const MODULES = ['core', 'ui-navigation', 'ui-extended'];
const HARNESS_STYLE = 'html,body{margin:0;padding:0}body{padding:24px;background:#f4f6f9;font-family:"Segoe UI","Microsoft YaHei UI",sans-serif}'
  + '.check-section{margin-bottom:24px;padding:16px;background:#fff;border:1px solid #dce2ea;border-radius:10px}'
  + '.check-row{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:8px 0}'
  + '.check-narrow{width:320px;max-width:100%}';
const browser = await chromium.launch({ executablePath: edge, headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
// 直接按 manifest 加载 src 与 demo，替代旧 extended-harness.html 夹具。
await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>' + HARNESS_STYLE + '</style></head><body><main id="app"></main></body></html>');
for (const file of moduleStyles(root, MODULES)) await page.addStyleTag({ path: path.join(root, file) });
for (const file of moduleScripts(root, MODULES)) await page.addScriptTag({ path: path.join(root, file) });
for (const file of moduleDemos(root, ['ui-extended'])) await page.addScriptTag({ path: path.join(root, file) });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ::  ' + detail : ''}`);
}

async function mountDemo(id) {
  await page.evaluate(() => {
    if (typeof window.__demoCleanup === 'function') {
      try { window.__demoCleanup(); } catch (error) {}
    }
    window.__demoCleanup = null;
  });
  await page.evaluate((entryId) => {
    document.querySelector('#app').replaceChildren();
    const host = document.createElement('div');
    host.id = 'demo-host';
    host.style.width = '960px';
    host.style.maxWidth = '100%';
    host.style.padding = '24px';
    host.style.boxSizing = 'border-box';
    host.style.background = '#f4f6f9';
    document.querySelector('#app').appendChild(host);
    window.__demoCleanup = null;
    const factory = window.NoteGalleryDemos && window.NoteGalleryDemos[entryId];
    if (!factory) throw new Error('missing demo ' + entryId);
    const result = factory(host);
    window.__demoCleanup = result && result.destroy;
  }, id);
  await page.waitForTimeout(250);
}

for (const id of ['X01', 'X02', 'X03', 'X04', 'X05', 'X06']) {
  await mountDemo(id);
  const state = await page.evaluate(() => ({
    textLength: document.querySelector('#demo-host')?.innerText.length || 0,
    components: Array.from(document.querySelectorAll('#demo-host [class*="nui-"]')).length
  }));
  check(`${id} demo mounts real content`, state.textLength > 80 && state.components > 3, JSON.stringify(state));
  await page.screenshot({ path: path.join(shotDir, id + '.png'), fullPage: true });
}

/* X01 interactions */
await mountDemo('X01');
const x1Before = await page.locator('#demo-host .nui-avatar img').count();
await page.getByRole('button', { name: '把第一位切换为文字头像' }).click();
await page.waitForTimeout(80);
const x1After = await page.evaluate(() => ({
  imgs: document.querySelectorAll('#demo-host .nui-avatar img').length,
  text: document.querySelector('#demo-host .nui-avatar')?.innerText || ''
}));
check('X01 demo changes image to text fallback', x1Before > 0 && x1After.imgs < x1Before && x1After.text.includes('AL'), JSON.stringify(x1After));
await page.screenshot({ path: path.join(shotDir, 'X01-after.png'), fullPage: true });

/* X02 interactions */
await mountDemo('X02');
const x2CounterBefore = await page.locator('#demo-host .nui-carousel__counter').textContent();
await page.locator('#demo-host .nui-carousel__step').nth(1).click();
await page.waitForTimeout(50);
const x2CounterAfter = await page.locator('#demo-host .nui-carousel__counter').textContent();
check('X02 demo manual next changes current position', x2CounterBefore !== x2CounterAfter, `${x2CounterBefore} -> ${x2CounterAfter}`);
const focusableHidden = await page.evaluate(() => {
  const button = document.getElementById('slide-b-button');
  const before = document.activeElement;
  if (!button) return { missing: true };
  button.focus();
  return { hiddenStaysOut: document.activeElement !== button, before: before && before.tagName };
});
check('X02 demo hidden slide keeps focus out', focusableHidden.missing || focusableHidden.hiddenStaysOut, JSON.stringify(focusableHidden));
await page.locator('#demo-host .nui-carousel').focus();
await page.keyboard.press('Home');
await page.waitForTimeout(50);
const x2Home = await page.locator('#demo-host .nui-carousel__counter').textContent();
check('X02 demo Home returns to first slide', /1\s*\/\s*3/.test(x2Home), x2Home);
await page.getByRole('button', { name: '替换轮播内容' }).click();
await page.waitForTimeout(60);
const x2Replaced = await page.locator('#demo-host .nui-carousel__slide').count();
check('X02 demo replaces content', x2Replaced === 2, String(x2Replaced));
await page.screenshot({ path: path.join(shotDir, 'X02-after.png'), fullPage: true });

/* X03 interaction */
await mountDemo('X03');
await page.locator('#demo-host .nui-rating').first().locator('[data-rating-value="2"]').click();
await page.waitForTimeout(40);
const x3Value = await page.locator('#demo-host .nui-rating__value').first().textContent();
check('X03 demo star click updates value', x3Value.includes('2 / 5'), x3Value);
await page.locator('#demo-host .nui-rating').first().locator('[data-rating-value="2"]').click();
await page.waitForTimeout(40);
const x3Cleared = await page.locator('#demo-host .nui-rating__value').first().textContent();
check('X03 demo click current value clears', x3Cleared.includes('0 / 5'), x3Cleared);
await page.getByRole('button', { name: '设为 2 星（程序更新）' }).click();
await page.waitForTimeout(40);
check('X03 demo program update sets stars', (await page.locator('#demo-host .nui-rating__value').first().textContent()).includes('2 / 5'));

/* X04 interactions */
await mountDemo('X04');
await page.locator('#demo-host .nui-cascader__trigger').click();
await page.waitForTimeout(80);
check('X04 demo opens floating panel', await page.locator('.hnv-floating [role="dialog"]').count() === 1);
await page.keyboard.press('Escape');
await page.waitForTimeout(60);
check('X04 demo Escape restores focus', await page.evaluate(() => document.activeElement === document.querySelector('#demo-host .nui-cascader__trigger')));
await page.locator('#demo-host .nui-cascader__trigger').click();
await page.waitForTimeout(60);
await page.screenshot({ path: path.join(shotDir, 'X04-open.png'), fullPage: true });
await page.keyboard.press('Escape');
await page.getByRole('button', { name: '设为设计 / 排版 / 字体' }).click();
await page.waitForTimeout(50);
const x4Summary = await page.locator('#demo-host .nui-cascader__summary').textContent();
check('X04 demo program update changes path summary', x4Summary.includes('设计 / 排版 / 字体'), x4Summary);

/* X05 interactions */
await mountDemo('X05');
await page.locator('#demo-host .nui-treeselect__trigger').click();
await page.waitForTimeout(80);
check('X05 demo popup reuses TreeView', await page.locator('.hnv-floating .nui-tree').count() === 1);
await page.screenshot({ path: path.join(shotDir, 'X05-open.png'), fullPage: true });
await page.locator('.hnv-floating [data-nui-tree-id="html"] .nui-tree__row').click();
await page.waitForTimeout(60);
const x5Summary = await page.locator('#demo-host .nui-treeselect__summary').textContent();
check('X05 demo multi selection updates summary', x5Summary.includes('HTML') && x5Summary.includes('CSS'), x5Summary);
await page.keyboard.press('Escape');
await page.waitForTimeout(50);
await page.getByRole('button', { name: '改为选中“排版”' }).click();
await page.waitForTimeout(50);
const x5Programmatic = await page.locator('#demo-host .nui-treeselect__summary').textContent();
check('X05 demo program update changes selection summary', x5Programmatic.includes('排版'), x5Programmatic);

/* X06 interactions */
await mountDemo('X06');
await page.screenshot({ path: path.join(shotDir, 'X06.png'), fullPage: true });
const sourceSearch = page.locator('#demo-host .nui-transfer__search').first();
await sourceSearch.fill('规则');
await page.waitForTimeout(50);
const x6Rows = await page.locator('#demo-host .nui-transfer__side').first().locator('.nui-transfer__item').count();
check('X06 demo filters source', x6Rows === 1, String(x6Rows));
await page.locator('#demo-host .nui-transfer__side').first().locator('.nui-transfer__checkbox').check();
await page.locator('#demo-host .nui-transfer__action').first().click();
await page.waitForTimeout(60);
const x6Status = await page.locator('#demo-host .nui-extended-demo__status').textContent();
check('X06 demo movement reports onChange', x6Status.includes('rules'), x6Status);
await page.getByRole('button', { name: '切换整体禁用' }).click();
await page.waitForTimeout(50);
const x6Disabled = await page.locator('#demo-host .nui-transfer__action').first().isDisabled();
check('X06 demo global disabled blocks move actions', x6Disabled);
await page.screenshot({ path: path.join(shotDir, 'X06-after.png'), fullPage: true });

/* X07 */
await mountDemo('X07');
await page.screenshot({ path: path.join(shotDir, 'X07.png'), fullPage: true });
await page.getByRole('button', { name: '打开命令面板（Alt+K）' }).click();
await page.waitForTimeout(100);
check('X07 demo opens command palette', await page.locator('.hnv-floating [role="dialog"][aria-modal="true"]').count() === 1);
await page.locator('.nui-command__input').fill('记录');
await page.waitForTimeout(50);
const x7Filtered = await page.locator('.nui-command__option').count();
check('X07 demo filters commands', x7Filtered === 2, String(x7Filtered));
await page.screenshot({ path: path.join(shotDir, 'X07-open.png'), fullPage: true });
await page.keyboard.press('Escape');
await page.waitForTimeout(60);
await page.locator('.nui-command__input').count().catch(() => 0);
await page.evaluate(() => { document.querySelector('#demo-host .nui-extended-demo__button--primary').click(); });
await page.waitForTimeout(60);
await page.locator('.nui-command__input').fill('不存在的关键词');
await page.waitForTimeout(50);
check('X07 demo shows no-results state', (await page.locator('.nui-command__empty').textContent()).includes('没有匹配'));
await page.screenshot({ path: path.join(shotDir, 'X07-empty.png'), fullPage: true });
await page.keyboard.press('Escape');
await page.waitForTimeout(50);
await page.getByRole('button', { name: '替换本地命令（程序更新）' }).click();
await page.waitForTimeout(50);
await page.evaluate(() => document.querySelector('#demo-host .nui-extended-demo__button--primary').click());
await page.waitForTimeout(80);
const x7DemoUpdate = await page.evaluate(() => ({ labels: Array.from(document.querySelectorAll('.nui-command__option .nui-command__label')).map((n) => n.textContent), status: document.querySelector('#demo-host .nui-extended-demo__run-result')?.textContent || '' }));
check('X07 demo updates local commands', x7DemoUpdate.labels.length === 1 && x7DemoUpdate.labels[0] === '更新后的本地命令' && x7DemoUpdate.status.includes('未执行命令'), JSON.stringify(x7DemoUpdate));
await page.keyboard.press('Escape');
await page.waitForTimeout(50);

/* Cleanup every demo */
for (const id of ['X01', 'X02', 'X03', 'X04', 'X05', 'X06', 'X07']) {
  await mountDemo(id);
  if (id === 'X04') {
    await page.locator('#demo-host .nui-cascader__trigger').click();
    await page.waitForTimeout(60);
  }
  if (id === 'X05') {
    await page.locator('#demo-host .nui-treeselect__trigger').click();
    await page.waitForTimeout(60);
  }
  if (id === 'X07') {
    await page.locator('#demo-host .nui-extended-demo__button--primary').click();
    await page.waitForTimeout(60);
  }
  await page.evaluate(() => {
    if (typeof window.__demoCleanup === 'function') window.__demoCleanup();
    document.querySelector('#app').replaceChildren();
  });
  await page.waitForTimeout(60);
  const leftovers = await page.evaluate(() => document.querySelectorAll('.hnv-floating, .hnv-floating__backdrop').length);
  check(`${id} demo cleanup leaves no floating layer`, leftovers === 0, String(leftovers));
}

/* Narrow viewport screenshots for visual inspection */
await page.setViewportSize({ width: 390, height: 844 });
for (const id of ['X02', 'X06', 'X07']) {
  await mountDemo(id);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${id} demo at 390px has no page overflow`, overflow <= 2, String(overflow));
  await page.screenshot({ path: path.join(shotDir, id + '-narrow.png'), fullPage: true });
  await page.evaluate(() => {
    if (typeof window.__demoCleanup === 'function') window.__demoCleanup();
    document.querySelector('#app').replaceChildren();
  });
}
await page.setViewportSize({ width: 1280, height: 900 });

check('Demo checks produced no console errors', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 800));
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ total: results.length, failed: failed.length, failures: failed, shots: shotDir }, null, 2));
await browser.close();
if (failed.length) process.exitCode = 1;
