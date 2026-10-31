/* Run with: node tests/checks/content-check.mjs
   Uses the installed Edge through playwright-core; no downloads. */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('../tools/node_modules/playwright-core');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const harnessName = process.argv[2] || 'content-harness-real.html';
const harness = pathToFileURL(path.join(root, 'tests', 'checks', harnessName)).href;
const executablePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 1 });
const pageErrors = [];
const consoleMessages = [];
page.on('pageerror', error => pageErrors.push(String(error && error.stack || error)));
page.on('console', message => {
  if (message.type() === 'error' || message.type() === 'warning') {
    consoleMessages.push({ type: message.type(), text: message.text() });
  }
});

let report;
try {
  await page.goto(harness, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.runContentChecks === 'function');
  report = await page.evaluate(() => window.runContentChecks());
} catch (error) {
  report = { ok: false, error: String(error && error.stack || error), results: [] };
}

const failures = (report.results || []).filter(item => !item.ok);
const passed = (report.results || []).filter(item => item.ok).length;
console.log(JSON.stringify({
  ok: report.ok,
  passed,
  total: report.results ? report.results.length : 0,
  failures,
  error: report.error || null,
  pageErrors,
  consoleMessages
}, null, 2));

await browser.close();
if (!report.ok || failures.length || pageErrors.length) process.exitCode = 1;
