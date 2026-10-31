/* Run with: node tests/checks/content-demo-check.mjs [--screenshots] */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { cacheDir } from '../lib/test-output.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('../tools/node_modules/playwright-core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pageUrl = pathToFileURL(path.join(root, 'tests', 'checks', 'content-demos.html')).href;
const executablePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const wantScreenshots = process.argv.includes('--screenshots');
const screenshotDir = cacheDir(root, 'checks', 'content-demo');

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1180, height: 1000 }, deviceScaleFactor: 1 });
const pageErrors = [];
const consoleErrors = [];
const requestFailures = [];
page.on('pageerror', error => pageErrors.push(String(error && error.stack || error)));
page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('requestfailed', request => {
  requestFailures.push({ url: request.url(), error: request.failure() && request.failure().errorText });
});

await page.goto(pageUrl, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.NoteGalleryDemos);
const ids = ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C12'];
const records = [];
let ok = true;

for (const id of ids) {
  let mounted;
  try {
    mounted = await page.evaluate(id => window.renderOneContentDemo(id), id);
  } catch (error) {
    ok = false;
    records.push({ id, error: String(error) });
    continue;
  }
  await page.waitForTimeout(id === 'C08' || id === 'C10' ? 300 : 120);
  const before = await page.evaluate(() => window.inspectCurrentContentDemo());
  if (wantScreenshots) {
    await page.screenshot({ path: path.join(screenshotDir, `content-demo-${id}.png`), fullPage: true });
  }
  const buttonCount = await page.evaluate(() => window.clickAllContentDemoButtons());
  await page.waitForTimeout(id === 'C08' || id === 'C10' ? 280 : 120);
  const after = await page.evaluate(() => window.inspectCurrentContentDemo());
  const destroyedClean = await page.evaluate(() => window.destroyCurrentContentDemo());
  await page.waitForTimeout(30);
  const overlayCount = await page.evaluate(() => ({
    floating: document.querySelectorAll('.hnv-floating').length,
    demoSections: document.querySelectorAll('.demo-host').length
  }));
  const record = {
    id,
    mounted: mounted && mounted.mounted,
    destroyable: mounted && mounted.destroyable,
    before,
    after,
    buttonsClicked: buttonCount,
    destroyedClean,
    overlaysAfter: overlayCount
  };
  if (!mounted || !mounted.destroyable || !mounted.mounted || !after || !destroyedClean ||
      overlayCount.floating || overlayCount.demoSections) {
    ok = false;
  }
  records.push(record);
}

console.log(JSON.stringify({ ok, records, pageErrors, consoleErrors, requestFailures }, null, 2));
await browser.close();
if (!ok || pageErrors.length || consoleErrors.length) process.exitCode = 1;
