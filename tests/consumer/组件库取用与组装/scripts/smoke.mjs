/* 冒烟：两个按模块加载的宿主，收集控制台/页面错误、外部请求与首屏截图。
   node scripts/smoke.mjs */
import { ROOT, edgeExecutable, loadChromium } from './paths.mjs';
const chromium = await loadChromium();
const EDGE = edgeExecutable();
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';

const shots = ROOT + '/evidence';
mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: EDGE });

async function run(name, file, viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  const requests = [];
  page.on('console', (msg) => { if (msg.type() === 'error' || msg.type() === 'warning') errors.push(msg.type() + ': ' + msg.text()); });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('request', (req) => requests.push(req.url()));
  await page.goto(pathToFileURL(file).href);
  await page.waitForTimeout(700);
  const info = await page.evaluate(() => ({
    title: document.title,
    h1: document.querySelector('h1') ? document.querySelector('h1').textContent : null,
    bodyText: document.body.innerText.slice(0, 400),
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
    scrollH: document.documentElement.scrollHeight
  }));
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: false });
  console.log('====', name, viewport.width + 'x' + viewport.height);
  console.log(JSON.stringify(info, null, 1));
  console.log('requests:', requests.filter(u => !u.startsWith('file:')).length, 'non-file;', requests.length, 'total');
  if (requests.filter(u => !u.startsWith('file:')).length) console.log(requests.filter(u => !u.startsWith('file:')));
  console.log('errors:', errors.length ? errors : 'none');
  await page.close();
}

await run('smoke-a-1280', ROOT + '/src/page-a.html', { width: 1280, height: 800 });
await run('smoke-b-1280', ROOT + '/src/page-b.html', { width: 1280, height: 800 });
await browser.close();
