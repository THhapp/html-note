// Overlay gallery integration check (TEST ONLY): real Edge + built dist + gallery.
// Usage: node tests/checks/overlay-gallery-check.mjs
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { writeCacheJson } from '../lib/test-output.mjs';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const galleryUrl = pathToFileURL(path.join(root, 'gallery', 'index.html')).href;

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true
});
const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
const externalRequests = [];
const failedRequests = [];
let currentId = '';
page.on('console', (message) => {
  if (message.type() === 'error') {
    const location = message.location ? message.location() : {};
    consoleErrors.push({ id: currentId, text: message.text(), url: location.url || '' });
  }
});
page.on('pageerror', (error) => pageErrors.push({ id: currentId, text: error.message }));
page.on('request', (request) => {
  if (/^https?:/i.test(request.url())) externalRequests.push(request.url());
});
page.on('requestfailed', (request) => {
  failedRequests.push({ url: request.url(), error: request.failure() ? request.failure().errorText : '' });
});

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail: detail == null ? '' : String(detail) });
}

const demo = (locator) => page.locator('#gallery-demo').locator(locator);
const wait = (ms) => page.waitForTimeout(ms);

try {
  await page.goto(galleryUrl, { waitUntil: 'load' });
  await page.waitForFunction(() => window.NoteGallery && typeof window.NoteGallery.select === 'function');
  await page.evaluate(() => window.NoteGallery.ready());
  check('gallery 初始化', await page.evaluate(() => !!window.NOTE_LIBRARY_REGISTRY), 'registry');

  async function select(id) {
    currentId = id;
    await page.evaluate((entryId) => window.NoteGallery.select(entryId), id);
    await page.evaluate(() => window.NoteGallery.ready());
    await wait(120);
    const info = await page.evaluate(() => {
      const host = document.querySelector('#gallery-demo');
      return { nodes: host ? host.querySelectorAll('*').length : 0, text: host ? host.innerText.slice(0, 80) : '' };
    });
    check(`gallery ${id} 明确渲染 demo`, info.nodes > 3, 'nodes=' + info.nodes + ' text=' + info.text);
  }

  await select('O01');
  await demo('.nui-tooltip__trigger').first().hover();
  await wait(350);
  check('gallery O01 悬停显示 Tooltip', await page.evaluate(() =>
    Array.from(document.querySelectorAll('.nui-tooltip__panel')).some((node) => node.getClientRects().length > 0)));

  await select('O02');
  await demo('.nui-popover__trigger').click();
  await wait(150);
  check('gallery O02 点击打开 Popover', await page.evaluate(() =>
    Array.from(document.querySelectorAll('.nui-popover__panel')).some((node) => node.getClientRects().length > 0)));
  const help = demo('button:has-text("更多帮助")').first();
  if (await help.count()) {
    await help.click();
    await wait(150);
    const visible = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.nui-popover__panel')).filter((node) => node.getClientRects().length > 0).length);
    check('gallery O02 嵌套子层打开', visible === 2, 'visible=' + visible);
    await page.keyboard.press('Escape');
    await wait(80);
    await page.keyboard.press('Escape');
    await wait(80);
  }

  await select('O03');
  await demo('button:has-text("打开对话框")').first().click();
  await wait(150);
  check('gallery O03 打开 Dialog', await page.evaluate(() =>
    Array.from(document.querySelectorAll('.nui-dialog__panel')).some((node) => node.getClientRects().length > 0)));
  await page.keyboard.press('Escape');
  await wait(100);
  await demo('button:has-text("打开确认框")').first().click();
  await wait(150);
  check('gallery O03 打开确认框', await page.evaluate(() =>
    Array.from(document.querySelectorAll('.nui-dialog__panel')).some((node) => node.getClientRects().length > 0)));

  await select('O04');
  await demo('button:has-text("打开右侧抽屉")').first().click();
  await wait(150);
  check('gallery O04 打开右侧抽屉', await page.evaluate(() =>
    Array.from(document.querySelectorAll('.nui-drawer__panel')).some((node) => node.getClientRects().length > 0)));
  check('gallery O04 打开时锁滚动', await page.evaluate(() => document.body.style.overflow === 'hidden'));

  await select('O01');
  await wait(150);
  const residue = await page.evaluate(() => ({
    floating: document.querySelectorAll('.hnv-floating').length,
    backdrops: document.querySelectorAll('.hnv-floating__backdrop').length,
    markers: document.querySelectorAll('body > .nui-dialog, body > .nui-drawer').length,
    overflow: document.body.style.overflow
  }));
  check('gallery 切换条目后无浮层/遮罩残留', residue.floating === 0 && residue.backdrops === 0, JSON.stringify(residue));
  check('gallery 切换条目后无确认框宿主标记', residue.markers === 0, JSON.stringify(residue));
  check('gallery 切换条目后滚动锁恢复', residue.overflow !== 'hidden', residue.overflow);
} finally {
  await context.close();
  await browser.close();
}

const errors = consoleErrors.concat(pageErrors.map((entry) => ({ id: entry.id, text: 'pageerror: ' + entry.text, url: '' })));
const knownExternalMissing = failedRequests.filter((entry) => /\/gallery\/demos\/blocks-explain\.js$/i.test(entry.url));
const unexpectedFailedRequests = failedRequests.filter((entry) => !/\/gallery\/demos\/blocks-explain\.js$/i.test(entry.url));
const overlayErrors = errors.filter((entry) => {
  if (entry.url && /\/gallery\/demos\/blocks-explain\.js$/i.test(entry.url)) return false;
  if (entry.text.indexOf('Failed to load resource') >= 0 && knownExternalMissing.length && unexpectedFailedRequests.length === 0) return false;
  return true;
});
const failed = checks.filter((item) => !item.ok);
const report = {
  checkedAt: new Date().toISOString(),
  browser: 'msedge headless (playwright-core)',
  source: 'gallery/index.html + dist/note-library.js (current build)',
  checks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  failures: failed,
  consoleErrors: overlayErrors,
  knownExternalMissing: knownExternalMissing.map((entry) => entry.url),
  unexpectedFailedRequests,
  externalRequests
};
writeCacheJson(root, ['checks', 'overlay-gallery-result.json'], report);
console.log(JSON.stringify({
  checks: report.checks,
  passed: report.passed,
  failed: report.failed,
  overlayConsoleErrors: overlayErrors.length,
  knownExternalMissing: report.knownExternalMissing.length,
  unexpectedFailedRequests: unexpectedFailedRequests.length,
  externalRequests: externalRequests.length
}, null, 2));
if (failed.length) {
  console.log('\nFAILURES:');
  failed.forEach((item) => console.log('  - ' + item.name + (item.detail ? ' :: ' + item.detail : '')));
}
if (overlayErrors.length) {
  console.log('\nOVERLAY CONSOLE/PAGE ERRORS:');
  overlayErrors.slice(0, 30).forEach((entry) => console.log('  - [' + entry.id + '] ' + entry.text.slice(0, 300)));
}
if (knownExternalMissing.length) {
  console.log('\nKNOWN EXTERNAL MISSING (not overlay):');
  knownExternalMissing.forEach((entry) => console.log('  - ' + entry.url));
}
process.exitCode = failed.length || overlayErrors.length || unexpectedFailedRequests.length || externalRequests.length ? 1 : 0;
