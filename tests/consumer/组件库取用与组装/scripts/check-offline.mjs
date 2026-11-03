/* 自包含页面：移动到独立目录后离线打开，检查请求、错误与关键交互。
   node scripts/check-offline.mjs */
import { ROOT, ownedPath, edgeExecutable, loadChromium } from './paths.mjs';
const chromium = await loadChromium();
const EDGE = edgeExecutable();
import { pathToFileURL } from 'node:url';
import { mkdirSync, copyFileSync, rmSync } from 'node:fs';

const OUT = ownedPath('evidence/offline-copy');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
copyFileSync(ROOT + '/01-矩阵转置.html', OUT + '/01.html');
copyFileSync(ROOT + '/02-序列变化.html', OUT + '/02.html');

const browser = await chromium.launch({ headless: true, executablePath: EDGE });
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : '  ' + JSON.stringify(detail)));
}

async function run(file, name, fn) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const requests = [];
  const errors = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('requestfailed', (r) => errors.push('requestfailed ' + r.url()));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // 彻底断网：任何 http(s) 请求直接失败
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('file:')) return route.continue();
    return route.abort();
  });
  await page.goto(pathToFileURL(file).href);
  await page.waitForTimeout(500);
  const external = requests.filter((u) => !u.startsWith('file:'));
  check(name + '：只有自身一个请求', requests.length === 1, requests.map((u) => u.split('/').pop()));
  check(name + '：无外部请求', external.length === 0, external);
  check(name + '：无脚本错误', errors.length === 0, errors);
  await fn(page);
  await page.screenshot({ path: ROOT + '/evidence/' + name + '-offline.png' });
  await context.close();
}

await run(OUT + '/01.html', 'offline-a', async (page) => {
  const info = await page.evaluate(() => ({
    katex: document.querySelectorAll('.katex').length,
    mats: document.querySelectorAll('.nviz-matrix').length,
    cells: document.querySelectorAll('.nviz-matrix tbody td').length,
    tableRows: document.querySelectorAll('.nui-table tbody tr').length
  }));
  check('offline-a：公式/矩阵/对照表齐全', info.katex === 1 && info.mats === 2 && info.cells === 12 && info.tableRows === 3, info);
  await page.getByRole('radio', { name: '示例二 · 3×2' }).click().catch(async () => {
    await page.getByRole('button', { name: '示例二 · 3×2' }).click();
  });
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => document.querySelectorAll('.nviz-matrix')[0].querySelectorAll('tbody td').length);
  check('offline-a：换数据仍可用', after === 6, after);
});

await run(OUT + '/02.html', 'offline-b', async (page) => {
  const before = await page.evaluate(() => window.__sceneB.state().sequence.join(''));
  await page.getByRole('button', { name: '下一步' }).click();
  await page.waitForTimeout(80);
  const mid = await page.evaluate(() => ({
    transforms: Array.from(document.querySelectorAll('.nviz-sequence-edit__item')).map((el) => getComputedStyle(el).transform !== 'none'),
    ghost: document.querySelectorAll('.nviz-sequence-edit__item--ghost').length
  }));
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => window.__sceneB.state().sequence.join(''));
  check('offline-b：初始顺序正确', before === 'abcde', before);
  check('offline-b：下一步后动画真实执行', mid.transforms.some(Boolean) || mid.ghost > 0, mid);
  check('offline-b：终态 a b d e', after === 'abde', after);
});

const failed = results.filter((r) => !r.ok);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过');
await browser.close();
/* 证据副本只在本次检查期间存在，不留在固定 evidence/ 目录。 */
rmSync(OUT, { recursive: true, force: true });
if (failed.length) process.exitCode = 1;
