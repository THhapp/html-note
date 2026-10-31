/* Focused C08 single-file check.
   Builds a one-file HTML (core + built ui-content + demo) in an empty temp
   directory, then verifies C08 makes no file/network request and still shows
   one successful inline image plus one deliberate failure.
   Run with: node tests/checks/content-c08-singlefile-check.mjs */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { moduleDemos, moduleScripts, moduleStyles } from '../lib/src-sources.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('../tools/node_modules/playwright-core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const script = text => text.replace(/<\/script/gi, '<\\/script');

// core 与 demo 清单从 manifest 推导；构建产物按模块名取当前 dist。
const coreCss = moduleStyles(root, ['core']).map(read).join('\n');
const coreJs = moduleScripts(root, ['core']).map(file => script(read(file))).join('\n');
const contentDemo = moduleDemos(root, ['ui-content'])[0];

const html = [
  '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>C08 single-file check</title>',
  '<style>' + coreCss + '\n' + read('dist/modules/ui-content.css') + '</style>',
  '</head><body><div id="fixture"></div>',
  '<script>' + coreJs + '</script>',
  '<script>' + script(read('dist/modules/ui-content.js')) + '</script>',
  '<script>' + script(read(contentDemo)) + '</script>',
  '</body></html>'
].join('\n');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nui-c08-singlefile-'));
const file = path.join(tempDir, 'content-c08-only.html');
fs.writeFileSync(file, html, 'utf8');

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true
});
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
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
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await page.waitForFunction(() => window.NoteUI && window.NoteUI.Figure && window.NoteGalleryDemos);
  const before = requests.length;
  result = await page.evaluate(async () => {
    var host = document.getElementById('fixture');
    var demo = window.NoteGalleryDemos.C08(host);
    await new Promise(resolve => setTimeout(resolve, 500));
    var images = Array.prototype.map.call(host.querySelectorAll('.nui-figure__image'), function (img) {
      return {
        hidden: img.hidden,
        naturalWidth: img.naturalWidth,
        srcPrefix: (img.getAttribute('src') || '').slice(0, 30)
      };
    });
    var state = {
      demoReturnedDestroy: !!(demo && typeof demo.destroy === 'function'),
      failedFigures: host.querySelectorAll('.nui-figure--failed').length,
      images: images,
      captionsVisible: Array.prototype.every.call(host.querySelectorAll('.nui-figure__caption'), function (node) {
        return !node.hidden && node.getClientRects().length > 0;
      })
    };
    if (demo && typeof demo.destroy === 'function') demo.destroy();
    return state;
  });
  result.requestsAfterRender = requests.slice(before);
  result.allRequests = requests;
  result.requestFailures = requestFailures;
  result.pageErrors = pageErrors;
  result.consoleErrors = consoleErrors;
  result.cleanAfterDestroy = await page.evaluate(() => document.getElementById('fixture').children.length === 0);
  const imageRequests = requests.slice(before).filter(url =>
    /\.svg|content-sample|missing|\.png/i.test(url) && !/^data:/i.test(url));
  result.fileImageRequests = imageRequests;
  result.ok = result.demoReturnedDestroy && result.failedFigures === 1 &&
    result.images.length === 2 && !result.images[0].hidden && result.images[0].naturalWidth > 0 &&
    result.images[0].srcPrefix.indexOf('data:image/svg+xml;base64,') === 0 &&
    result.images[1].hidden && result.captionsVisible && result.cleanAfterDestroy &&
    imageRequests.length === 0 && requestFailures.length === 0 &&
    pageErrors.length === 0 && consoleErrors.length === 0;
} catch (error) {
  result = { ok: false, error: String(error && error.stack || error), requests, requestFailures, pageErrors, consoleErrors };
}

console.log(JSON.stringify(result, null, 2));
await browser.close();
fs.rmSync(tempDir, { recursive: true, force: true });
if (!result.ok) process.exitCode = 1;
