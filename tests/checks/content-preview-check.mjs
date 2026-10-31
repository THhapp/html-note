/* Actual single-file preview C08 check.
   Copies dist/组件库-预览.html to an empty temp directory, opens it via file://,
   navigates to #C08, and verifies the successful image is inline while no
   external/local image file is requested.
   Run after a complete build: node tests/checks/content-preview-check.mjs */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('../tools/node_modules/playwright-core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const preview = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(root, 'dist', '组件库-预览.html');
if (!fs.existsSync(preview)) {
  console.log(JSON.stringify({
    ok: false,
    reason: 'dist/组件库-预览.html 尚不存在（当前构建因未完成模块跳过单文件预览）'
  }, null, 2));
  process.exitCode = 2;
  process.exit();
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nui-preview-c08-'));
const copied = path.join(tempDir, '组件库-预览.html');
fs.copyFileSync(preview, copied);

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true
});
const page = await browser.newPage({ viewport: { width: 1180, height: 1000 } });
const requests = [];
const requestFailures = [];
const pageErrors = [];
const consoleErrors = [];
page.on('request', request => requests.push(request.url()));
page.on('requestfailed', request => requestFailures.push(request.url()));
page.on('pageerror', error => pageErrors.push(String(error && error.stack || error)));
page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});

let result;
try {
  await page.goto(pathToFileURL(copied).href + '#C08', { waitUntil: 'load' });
  await page.waitForFunction(() => {
    return document.getElementById('gallery-demo') &&
      document.getElementById('gallery-demo').querySelector('.nui-figure');
  }, null, { timeout: 20000 });
  await page.waitForTimeout(700);
  result = await page.evaluate(() => {
    const host = document.getElementById('gallery-demo');
    const images = Array.prototype.map.call(host.querySelectorAll('.nui-figure__image'), img => ({
      hidden: img.hidden,
      naturalWidth: img.naturalWidth,
      srcPrefix: (img.getAttribute('src') || '').slice(0, 30)
    }));
    return {
      hostText: host.textContent.slice(0, 120),
      images,
      failedFigures: host.querySelectorAll('.nui-figure--failed').length,
      captionsVisible: Array.prototype.every.call(host.querySelectorAll('.nui-figure__caption'), node => {
        return !node.hidden && node.getClientRects().length > 0;
      }),
      demoErrorHidden: document.getElementById('gallery-demo-error').hidden
    };
  });
  result.previewRequests = requests;
  result.requestFailures = requestFailures;
  result.pageErrors = pageErrors;
  result.consoleErrors = consoleErrors;
  result.fileRequests = requests.filter(url => /^file:/i.test(url) && url !== pathToFileURL(copied).href);
  const nonInlineImages = result.fileRequests.filter(url => /\.(svg|png|jpe?g|gif|webp|avif)(\?|#|$)/i.test(url));
  result.nonInlineImageRequests = nonInlineImages;
  result.ok = result.images.length === 2 &&
    !result.images[0].hidden && result.images[0].naturalWidth > 0 &&
    result.images[0].srcPrefix.indexOf('data:image/svg+xml;base64,') === 0 &&
    result.images[1].hidden && result.failedFigures === 1 && result.captionsVisible &&
    result.demoErrorHidden && nonInlineImages.length === 0 &&
    requestFailures.length === 0 && pageErrors.length === 0 && consoleErrors.length === 0;
} catch (error) {
  result = { ok: false, error: String(error && error.stack || error), requests, requestFailures, pageErrors, consoleErrors };
}

console.log(JSON.stringify(result, null, 2));
await browser.close();
fs.rmSync(tempDir, { recursive: true, force: true });
if (!result.ok) process.exitCode = 1;
