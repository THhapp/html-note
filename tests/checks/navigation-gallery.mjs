import { chromium } from '../tools/node_modules/playwright-core/index.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cacheDir } from '../lib/test-output.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const shotDir = cacheDir(path.resolve(here, '../..'), 'checks', 'navigation');
const root = path.resolve(here, '..', '..');
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });
await page.emulateMedia({ reducedMotion: 'reduce' });
const errors = [];
const failedRequests = [];
page.on('pageerror', error => errors.push(error.stack));
page.on('requestfailed', request => failedRequests.push(request.url()));
page.on('console', message => { if (message.type() === 'error' && message.text().indexOf('ERR_FILE_NOT_FOUND') < 0) errors.push(message.text()); });
const url = pathToFileURL(path.join(root, 'gallery/index.html')).href;
await page.goto(url + '#N01');
await page.waitForSelector('#gallery-demo .nui-navigation-demo', { timeout: 15000 });
await page.waitForTimeout(500);
const results = [];
for (const id of ['N01','N02','N03','N04','N05','N06','N07']) {
  if (id !== 'N01') {
    await page.evaluate((id) => { location.hash = '#' + id; }, id);
    await page.waitForSelector('#gallery-demo .nui-navigation-demo', { timeout: 8000 });
    await page.waitForTimeout(300);
  }
  const state = await page.evaluate(() => ({
    title: document.querySelector('.gallery-detail h2, .gallery-detail h1, .gallery-detail .gallery-title')?.textContent || '',
    demoRoots: document.querySelectorAll('#gallery-demo .nui-navigation-demo').length,
    currentId: location.hash,
    demoText: document.querySelector('#gallery-demo')?.textContent.slice(0, 80),
    errors: !!document.querySelector('.gallery-demo-error:not([hidden])')
  }));
  await page.screenshot({ path: path.join(shotDir, `navigation-gallery-${id}.png`), fullPage: false });
  results.push({ id, ...state });
}
// Actual keyboard use in built gallery for N04.
await page.evaluate(() => { location.hash = '#N04'; });
await page.waitForTimeout(400);
await page.locator('#gallery-demo .nui-menu__trigger').first().focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(100);
const menuOpen = await page.locator('.hnv-floating__panel[role="menu"]').count();
await page.keyboard.press('Escape');
await page.waitForTimeout(100);
const menuClosed = await page.locator('.hnv-floating__panel[role="menu"]').count() === 0;
// Switch away from N04 to test gallery teardown of floating leftovers.
await page.evaluate(() => { location.hash = '#N01'; });
await page.waitForTimeout(300);
const leftoverFloating = await page.locator('.hnv-floating').count();
const leftoverPoint = await page.locator('.nui-menu__point-anchor').count();
console.log(JSON.stringify({ results, menuOpen, menuClosed, leftoverFloating, leftoverPoint }, null, 2));
const unrelatedMissing = failedRequests.filter((request) => !/gallery\/demos\/blocks-(stage|explain)\.js$/.test(request));
console.log('FAILED REQUESTS', failedRequests);
console.log('ERRORS', errors.length, errors.slice(0, 10));
await browser.close();
if (errors.length || unrelatedMissing.length || results.some(r => r.demoRoots !== 1 || r.errors) || menuOpen !== 1 || !menuClosed || leftoverFloating) process.exit(1);
