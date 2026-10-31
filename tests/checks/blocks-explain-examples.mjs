import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('../tools/node_modules/playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const runner = pathToFileURL(path.join(root, 'examples', 'run.html')).href;
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
for (const id of ['B05', 'B06', 'B07', 'B08', 'B09', 'B10']) {
  await page.goto(runner + '?id=' + id, { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const host = document.querySelector('#example-demo');
    return host && host.children.length > 0;
  }, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(120);
  const info = await page.evaluate(() => {
    const host = document.querySelector('#example-demo');
    const error = document.querySelector('#ex-demo-error');
    const docs = document.querySelector('#ex-docs-link');
    return {
      children: host ? host.children.length : 0,
      text: host ? host.textContent.replace(/\s+/g, ' ').trim().slice(0, 100) : '',
      error: !!(error && !error.hidden),
      id: document.querySelector('#ex-id') ? document.querySelector('#ex-id').textContent.trim() : '',
      usage: document.querySelector('#ex-usage') ? document.querySelector('#ex-usage').textContent.trim().slice(0, 80) : '',
      docsHref: docs ? docs.getAttribute('href') : '',
      docsHidden: docs ? docs.hidden : true
    };
  });
  check(id + ' example runner mounts demo', info.children > 0 && !info.error && info.id === id, JSON.stringify(info));
  check(id + ' example usage/docs present', info.usage.indexOf('NoteBlocks.') >= 0 && !info.docsHidden && info.docsHref.indexOf('docs/blocks-explain.md') >= 0, JSON.stringify(info));
  const residue = await page.evaluate(() => ({
    floating: document.querySelectorAll('.hnv-floating, .nblk-step-player, .nblk-codetrace, .nblk-framefields, .nblk-flow, .nblk-sequence-diagram, .nblk-hierarchy, .nblk-chart-explain').length,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
  }));
  check(id + ' example page has no horizontal page overflow', !residue.overflow, JSON.stringify(residue));
}
await page.setViewportSize({ width: 390, height: 900 });
for (const id of ['B05', 'B06', 'B07', 'B08', 'B09', 'B10']) {
  await page.goto(runner + '?id=' + id, { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const host = document.querySelector('#example-demo');
    return host && host.children.length > 0;
  }, null, { timeout: 8000 }).catch(() => {});
  const info = await page.evaluate(() => {
    const host = document.querySelector('#example-demo');
    const error = document.querySelector('#ex-demo-error');
    return {
      children: host ? host.children.length : 0,
      error: !!(error && !error.hidden),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      demoOverflow: host ? host.scrollWidth > host.clientWidth + 2 : true
    };
  });
  check(id + ' narrow example runner', info.children > 0 && !info.error && !info.overflow && !info.demoOverflow, JSON.stringify(info));
}
check('example console errors empty', consoleErrors.length === 0, consoleErrors.join(' | '));
check('example page errors empty', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
console.log('\nExample summary: ' + (failures.length ? failures.length + ' failed' : 'all passed'));
if (failures.length) process.exitCode = 1;
