/* Run with: node tests/checks/content-responsive-check.mjs
   Narrow-container regression for C01–C12 demos. No screenshots are written. */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('../tools/node_modules/playwright-core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pageUrl = pathToFileURL(path.join(root, 'tests', 'checks', 'content-demos.html')).href;
const executablePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ids = ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C12'];

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 360, height: 900 }, deviceScaleFactor: 1 });
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', error => pageErrors.push(String(error && error.stack || error)));
page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
await page.goto(pageUrl, { waitUntil: 'load' });

const reports = [];
let ok = true;
for (const width of [360, 320]) {
  await page.setViewportSize({ width, height: 900 });
  for (const id of ids) {
    await page.evaluate(id => window.renderOneContentDemo(id), id);
    await page.waitForTimeout(id === 'C08' || id === 'C10' ? 260 : 100);
    const before = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      host: document.querySelector('.demo-host').clientWidth,
      hostScroll: document.querySelector('.demo-host').scrollWidth
    }));
    const buttons = await page.evaluate(() => window.clickAllContentDemoButtons());
    await page.waitForTimeout(id === 'C08' || id === 'C10' ? 260 : 120);
    const after = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      host: document.querySelector('.demo-host').clientWidth,
      hostScroll: document.querySelector('.demo-host').scrollWidth
    }));
    const clean = await page.evaluate(() => window.destroyCurrentContentDemo());
    const pass = before.doc <= before.client + 1 && after.doc <= after.client + 1 &&
      before.hostScroll <= before.host + 1 && after.hostScroll <= after.host + 1 && clean;
    if (!pass) ok = false;
    reports.push({ width, id, pass, buttons, before, after, destroyedClean: clean });
  }
}
console.log(JSON.stringify({ ok, reports, pageErrors, consoleErrors }, null, 2));
await browser.close();
if (!ok || pageErrors.length || consoleErrors.length) process.exitCode = 1;
