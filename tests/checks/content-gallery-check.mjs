/* Run with: node tests/checks/content-gallery-check.mjs [--screenshots]
   Checks C01–C12 through the real gallery shell and current dist build. */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { cacheDir } from '../lib/test-output.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('../tools/node_modules/playwright-core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const gallery = pathToFileURL(path.join(root, 'gallery', 'index.html')).href;
const executablePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const screenshots = process.argv.includes('--screenshots');
const screenshotDir = cacheDir(root, 'checks', 'content-gallery');
const ids = ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C12'];

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1180, height: 1000 }, deviceScaleFactor: 1 });
const pageErrors = [];
const consoleErrors = [];
const requestFailures = [];
page.on('pageerror', error => pageErrors.push(String(error && error.stack || error)));
page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('requestfailed', request => requestFailures.push(request.url()));

const records = [];
let ok = true;
let baselineConsoleErrors = 0;
let baselineRequestFailures = 0;

try {
  await page.goto(gallery + '#C01', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-gallery-state') === 'ready', null, { timeout: 20000 });
  await page.waitForFunction(() => {
    const host = document.getElementById('gallery-demo');
    return host && host.querySelector('.nui-cdemo-stack');
  }, null, { timeout: 10000 });
  baselineConsoleErrors = consoleErrors.length;
  baselineRequestFailures = requestFailures.length;

  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (index > 0) {
      await page.evaluate(id => { window.location.hash = id; }, id);
      await page.waitForFunction(expected => {
        return window.location.hash === '#' + expected &&
          document.documentElement.getAttribute('data-gallery-state') === 'ready' &&
          document.getElementById('gallery-demo') &&
          document.getElementById('gallery-demo').querySelector('.nui-cdemo-stack');
      }, id, { timeout: 10000 });
      await page.waitForTimeout(180);
    }
    const state = await page.evaluate(() => {
      const host = document.getElementById('gallery-demo');
      const error = document.getElementById('gallery-demo-error');
      const heading = document.querySelector('.gallery-detail h2, .gallery-detail h2 *');
      return {
        hash: window.location.hash,
        hostChildren: host ? host.children.length : 0,
        currentDemoWrappers: document.querySelectorAll('.nui-cdemo-stack').length,
        missingDemo: Boolean(host && host.querySelector('.gallery-demo-missing')),
        demoErrorHidden: !error || error.hidden,
        floating: document.querySelectorAll('.hnv-floating').length,
        textLength: host ? host.textContent.length : 0
      };
    });
    const consoleDelta = consoleErrors.length - baselineConsoleErrors;
    const requestDelta = requestFailures.length - baselineRequestFailures;
    const pass = state.hash === '#' + id && state.hostChildren > 0 &&
      state.currentDemoWrappers === 1 && !state.missingDemo &&
      state.demoErrorHidden && state.floating === 0 && consoleDelta === 0 && requestDelta === 0;
    if (!pass) ok = false;
    records.push({ id, pass, consoleDelta, requestDelta, ...state });
    if (screenshots) {
      await page.screenshot({
        path: path.join(screenshotDir, `content-gallery-${id}.png`),
        fullPage: true
      });
    }
  }
} catch (error) {
  ok = false;
  records.push({ check: 'gallery', pass: false, error: String(error && error.stack || error) });
}

const unexpectedRequestFailures = requestFailures.filter((url, index) => index >= baselineRequestFailures);
const newConsoleErrors = consoleErrors.slice(baselineConsoleErrors);
console.log(JSON.stringify({
  ok,
  records,
  pageErrors,
  baselineConsoleErrors,
  baselineRequestFailures,
  newConsoleErrors,
  unexpectedRequestFailures
}, null, 2));
await browser.close();
if (!ok || pageErrors.length || newConsoleErrors.length) process.exitCode = 1;
