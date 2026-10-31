// Overlay self-check: real Edge via playwright-core + contract mock of NoteCore I04.
// Usage: node tests/checks/overlay-check.mjs
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { writeCacheJson } from '../lib/test-output.mjs';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const pageUrl = pathToFileURL(path.join(here, 'overlay-check.html')).href;

const browser = await chromium.launch({ executablePath: edge, headless: true });
const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
const page = await context.newPage();

const consoleErrors = [];
const pageErrors = [];
const externalRequests = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => pageErrors.push(err.message));
page.on('request', (req) => {
  const url = req.url();
  if (/^https?:/i.test(url)) externalRequests.push(url);
});

let results = [];
let fatal = null;
try {
  await page.goto(pageUrl, { waitUntil: 'load' });
  const ready = await page.evaluate(() => ({
    core: !!window.NoteCore && !!window.NoteCore.floating,
    overlay: !!(window.NoteUI && window.NoteUI.Tooltip && window.NoteUI.Popover && window.NoteUI.Dialog && window.NoteUI.Drawer),
    suite: !!window.OverlaySuite,
    legacy: !!(window.NoteUI && window.NoteUI.Button)
  }));
  if (!ready.core || !ready.overlay || !ready.suite) {
    throw new Error('check page not ready: ' + JSON.stringify(ready));
  }
  if (!ready.legacy) throw new Error('legacy NoteUI.Button missing in harness');

  results = results.concat(await page.evaluate(() => window.OverlaySuite.run()));
  await page.setViewportSize({ width: 390, height: 844 });
  results = results.concat(await page.evaluate(() => window.OverlaySuite.runNarrow()));
  await page.setViewportSize({ width: 1200, height: 800 });
  results = results.concat(await page.evaluate(() => window.OverlaySuite.runDemos()));
} catch (error) {
  fatal = error && (error.stack || error.message || String(error));
} finally {
  await context.close();
  await browser.close();
}

const owned = [
  'src/ui/overlay.js',
  'src/ui/overlay.css',
  'src/manifests/ui-overlay.json',
  'gallery/demos/ui-overlay.js'
];
const staticChecks = [];
staticChecks.push({
  name: '真实 core I04 文件存在',
  ok: fs.existsSync(path.join(root, 'src/core/floating.js')),
  detail: path.join(root, 'src/core/floating.js')
});
for (const relative of owned) {
  const file = path.join(root, relative);
  const exists = fs.existsSync(file);
  staticChecks.push({ name: `${relative} 存在`, ok: exists, detail: file });
  if (!exists) continue;
  const source = fs.readFileSync(file, 'utf8');
  if (/\.(js)$/.test(relative)) {
    staticChecks.push({ name: `${relative} 无 fetch(`, ok: !/\bfetch\s*\(/.test(source), detail: '' });
    staticChecks.push({ name: `${relative} 无 eval(`, ok: !/\beval\s*\(/.test(source), detail: '' });
    staticChecks.push({ name: `${relative} 无 innerHTML`, ok: !/\binnerHTML\b/.test(source), detail: '' });
  }
  staticChecks.push({ name: `${relative} 无 http(s) 运行资源`, ok: !/https?:\/\//.test(source), detail: '' });
}

const manifestFile = path.join(root, 'src/manifests/ui-overlay.json');
if (fs.existsSync(manifestFile)) {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  staticChecks.push({ name: 'manifest module=ui-overlay', ok: manifest.module === 'ui-overlay', detail: String(manifest.module) });
  staticChecks.push({ name: 'manifest 4 条 O01–O04', ok: manifest.entries && manifest.entries.length === 4, detail: String(manifest.entries && manifest.entries.length) });
  if (manifest.entries) {
    for (const entry of manifest.entries) {
      staticChecks.push({ name: `${entry.id} category/consensus/userReview`, ok: entry.category === '浮层与弹出界面' && Array.isArray(entry.consensus) && entry.consensus.join(',') === 'K03,K09,K11' && entry.userReview === 'not-reviewed', detail: JSON.stringify({ category: entry.category, consensus: entry.consensus, userReview: entry.userReview }) });
    }
  }
}
const docsFile = path.join(root, 'docs/ui-overlay.md');
staticChecks.push({ name: 'docs/ui-overlay.md 存在', ok: fs.existsSync(docsFile), detail: docsFile });

const all = results.concat(staticChecks);
const failures = all.filter((item) => !item.ok);
const consoleErrorsAll = consoleErrors.concat(pageErrors.map((message) => 'pageerror: ' + message));

const report = {
  checkedAt: new Date().toISOString(),
  browser: 'msedge headless (playwright-core)',
  core: 'src/core/* real I04 + legacy src/controls.js (no mock)',
  checks: all.length,
  passed: all.length - failures.length,
  failed: failures.length,
  failures,
  consoleErrors: consoleErrorsAll,
  externalRequests,
  fatal
};

writeCacheJson(root, ['checks', 'overlay-check-result.json'], report);

console.log(JSON.stringify({
  checks: report.checks,
  passed: report.passed,
  failed: report.failed,
  consoleErrors: report.consoleErrors.length,
  externalRequests: report.externalRequests.length,
  fatal
}, null, 2));
if (failures.length) {
  console.log('\nFAILURES:');
  failures.forEach((item) => console.log(`  - ${item.name}${item.detail ? ' :: ' + item.detail : ''}`));
}
if (consoleErrorsAll.length) {
  console.log('\nCONSOLE/PAGE ERRORS:');
  consoleErrorsAll.forEach((message) => console.log('  - ' + message));
}
if (fatal) console.log('\nFATAL:\n' + fatal);
process.exitCode = failures.length || consoleErrorsAll.length || externalRequests.length || fatal ? 1 : 0;
