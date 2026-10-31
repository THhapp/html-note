// 主控验收脚本：真实 Edge 打开 gallery / run / composed，逐条挂载 demo，收集错误。
// 用法：
//   node tests/checks/audit.mjs gallery
//   node tests/checks/audit.mjs run --ids L01,L08,C06
//   node tests/checks/audit.mjs composed --shots
// 依赖：tests/tools/node_modules/playwright-core 与本机 Edge。
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { cacheDir, cacheFile } from '../lib/test-output.mjs';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shotsDir = cacheDir(root, 'shots', 'audit');
// 条目数以构建产物为准，避免把某一轮的总数写死（曾为 100）。
const expectedRegistry = JSON.parse(fs.readFileSync(path.join(root, 'registry.json'), 'utf8'));
const expectedEntryCount = expectedRegistry.counts && Number.isFinite(expectedRegistry.counts.total)
  ? expectedRegistry.counts.total
  : expectedRegistry.entries.length;

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--')) || 'gallery';
const flag = (name) => args.includes('--' + name);
const idsArg = args.find((a) => a.startsWith('--ids='));
const onlyIds = idsArg ? idsArg.slice(6).split(',').filter(Boolean) : null;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const results = [];
let current = { page: '', id: '', errors: [], failedRequests: [] };

function wire(page) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') current.errors.push(msg.text());
  });
  page.on('pageerror', (err) => current.errors.push('pageerror: ' + err.message));
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (!url.startsWith('data:')) current.failedRequests.push(url + ' :: ' + (req.failure()?.errorText || ''));
  });
  page.on('request', (req) => {
    const url = req.url();
    if (/^https?:/i.test(url)) current.failedRequests.push('external request: ' + url);
  });
}
function attach(page, label) {
  current = { page: label, id: '', errors: [], failedRequests: [], checks: [] };
  wire(page);
}
function check(name, ok, detail = '') {
  current.checks.push({ name, ok: Boolean(ok), detail: String(detail) });
  if (!ok) console.log(`  ✗ ${current.page}${current.id ? ' [' + current.id + ']' : ''} ${name} ${detail}`);
}
function finish() {
  results.push({ ...current, checks: current.checks.slice() });
}
function flushErrors(label) {
  if (current.errors.length) {
    console.log(`  ! ${label} console/page errors: ${current.errors.length}`);
    current.errors.slice(0, 8).forEach((e) => console.log('    ' + e.slice(0, 300)));
  }
}

const launchOptions = { executablePath: edge, headless: true };
let browser = await chromium.launch(launchOptions);
// 超长单页审计时 headless Edge 偶发整浏览器进程退出；断开后重启浏览器继续，不跳条目。
async function ensureBrowser() {
  if (!browser.isConnected()) browser = await chromium.launch(launchOptions);
  return browser;
}

async function openPage(url, label, preserve = false) {
  await ensureBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  if (preserve) wire(page);
  else attach(page, label);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return { page, context };
}
function pageClosedError(error) {
  return /Target page, context or browser has been closed|Target closed|crash/i.test(String(error && error.message || error));
}

async function galleryAudit() {
  const url = pathToFileURL(path.join(root, 'gallery', 'index.html')).href;
  let opened = await openPage(url, 'gallery');
  let page = opened.page;
  let context = opened.context;
  // 长驻单页连续挂载 101 个 demo 时 headless Edge 偶发渲染进程退出；
  // 页面被关闭时重建页面继续（不跳过任何条目），保证整体审计可完成。
  async function reopenGallery() {
    try { await context.close(); } catch (error) {}
    await ensureBrowser();
    opened = await openPage(url, 'gallery', true);
    page = opened.page;
    context = opened.context;
  }
  const meta = await page.evaluate(() => ({
    hasGallery: !!window.NoteGallery,
    count: window.NOTE_LIBRARY_REGISTRY ? window.NOTE_LIBRARY_REGISTRY.entries.length : 0,
    ids: window.NOTE_LIBRARY_REGISTRY ? window.NOTE_LIBRARY_REGISTRY.entries.map((e) => e.id) : [],
  }));
  check('registry loaded', meta.count === expectedEntryCount, `count=${meta.count}, expected=${expectedEntryCount}`);
  check('window.NoteGallery present', meta.hasGallery);
  if (!meta.hasGallery) {
    finish();
    await context.close();
    return;
  }
  const ids = onlyIds || meta.ids;
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (index > 0 && index % 30 === 0) await reopenGallery();
    const selectEntry = () => page.evaluate(async (entryId) => {
      const ok = window.NoteGallery.select(entryId);
      await window.NoteGallery.ready();
      await new Promise((r) => setTimeout(r, 60));
      const detail = document.querySelector('#gallery-demo, [data-gallery-demo], .gallery-demo');
      return {
        ok,
        demoNodes: detail ? detail.querySelectorAll('*').length : -1,
        detailText: (document.querySelector('#gallery-detail, .gallery-detail')?.innerText || '').slice(0, 120),
        hash: location.hash,
      };
    }, id).catch((err) => ({ ok: false, error: String(err) }));
    const before = current.errors.length;
    let state = await selectEntry();
    if (!state.ok && state.error && pageClosedError(state.error)) {
      await reopenGallery();
      state = await selectEntry();
    }
    current.id = id;
    check('select ok', state.ok, state.error || '');
    check('demo rendered', state.demoNodes > 3, `nodes=${state.demoNodes}`);
    check('no new console errors', current.errors.length === before, (current.errors.slice(before).join(' | ')).slice(0, 300));
    if (flag('shots') && ['L05', 'C06', 'F12', 'O03', 'D03', 'V01', 'B02'].includes(id)) {
      await page.screenshot({ path: path.join(shotsDir, `gallery-${id}.png`), fullPage: false });
    }
  }
  current.id = '';
  // 筛选与深链（页面被重建过时，在新页面继续）
  try {
    await page.evaluate(() => { location.hash = '#C09'; });
  } catch (error) {
    await reopenGallery();
    await page.evaluate(() => { location.hash = '#C09'; });
  }
  await page.waitForTimeout(250);
  const hashState = await page.evaluate(() => ({
    hash: location.hash,
    active: document.querySelector('[aria-current="true"], .is-active')?.textContent || '',
  }));
  check('hash deep link', /C09/.test(hashState.hash), JSON.stringify(hashState));
  // 窄屏
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('390px no page horizontal overflow', overflow <= 2, `overflow=${overflow}`);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(200);
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('1024px no page horizontal overflow', overflow2 <= 2, `overflow=${overflow2}`);
  flushErrors('gallery');
  finish();
  await context.close();
}

async function runAudit() {
  const ids = onlyIds || ['L01', 'L05', 'L08', 'C06', 'C09', 'C10', 'F08', 'F12', 'O03', 'S01', 'D01', 'D03', 'M02', 'V01', 'X07', 'B02', 'B05', 'R01', 'R07', 'R10'];
  const file = pathToFileURL(path.join(root, 'examples', 'run.html')).href;
  const { page, context } = await openPage(file + '?id=' + ids[0], 'run');
  check('registry loaded', await page.evaluate(() => !!window.NOTE_LIBRARY_REGISTRY));
  for (const id of ids) {
    current.id = id;
    const before = current.errors.length;
    await page.goto(file + '?id=' + id, { waitUntil: 'load' });
    await page.waitForTimeout(250);
    const state = await page.evaluate(() => ({
      demoNodes: document.querySelector('#example-demo, [data-example-demo], .example-demo')?.querySelectorAll('*').length ?? -1,
      text: document.body.innerText.slice(0, 120),
    })).catch((e) => ({ demoNodes: -1, text: String(e) }));
    check('demo rendered', state.demoNodes > 3, `nodes=${state.demoNodes}`);
    check('no console errors', current.errors.length === before, current.errors.slice(before).join(' | ').slice(0, 300));
  }
  current.id = '';
  flushErrors('run');
  finish();
  await context.close();
}

async function composedAudit() {
  const file = pathToFileURL(path.join(root, 'examples', 'composed.html')).href;
  const { page, context } = await openPage(file, 'composed');
  check('has content', (await page.evaluate(() => document.body.innerText.length)) > 400);
  const buttons = await page.evaluate(() => Array.from(document.querySelectorAll('button')).slice(0, 12).map((b) => b.textContent.trim()).filter(Boolean));
  for (const label of buttons) {
    const btn = page.getByRole('button', { name: label, exact: true }).first();
    if (await btn.count()) {
      await btn.click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(180);
    }
  }
  check('no console errors after button pass', current.errors.length === 0, current.errors.join(' | ').slice(0, 500));
  const overlaysLeft = await page.evaluate(() => document.querySelectorAll('.hnv-floating').length);
  check('no stray floating layers after navigation', overlaysLeft === 0, `layers=${overlaysLeft}`);
  if (flag('shots')) await page.screenshot({ path: path.join(shotsDir, 'composed.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('390px no page horizontal overflow', overflow <= 2, `overflow=${overflow}`);
  flushErrors('composed');
  finish();
  await context.close();
}

try {
  if (target === 'gallery') await galleryAudit();
  else if (target === 'run') await runAudit();
  else if (target === 'composed') await composedAudit();
  else if (target === 'all') { await galleryAudit(); await runAudit(); await composedAudit(); }
  else { console.error('unknown target', target); process.exitCode = 2; }
} finally {
  try { if (browser.isConnected()) await browser.close(); } catch (error) {}
}

const allChecks = results.flatMap((r) => r.checks);
const failed = allChecks.filter((c) => !c.ok);
const summary = {
  target,
  pages: results.length,
  checks: allChecks.length,
  failed: failed.length,
  failures: failed.slice(0, 80),
  consoleErrors: results.flatMap((r) => r.errors.map((e) => ({ page: r.page, id: r.id, error: e }))).slice(0, 80),
  externalRequests: results.flatMap((r) => r.failedRequests).slice(0, 40),
};
fs.writeFileSync(cacheFile(root, 'audit', `audit-${target}.json`), JSON.stringify({ summary, results }, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (failed.length) process.exitCode = 1;