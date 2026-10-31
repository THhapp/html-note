import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { cacheDir } from '../lib/test-output.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('../tools/node_modules/playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const shotDir = cacheDir(root, 'checks', 'blocks-explain');
const gallery = pathToFileURL(path.join(root, 'gallery', 'index.html')).href;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({ executablePath: edge, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
async function open(id) {
  await page.goto(gallery + '#' + id, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-gallery-state') === 'ready');
  await page.waitForTimeout(200);
}
for (const id of ['B05','B06','B07','B08','B09','B10']) {
  await open(id);
  const demo = page.locator('#gallery-demo').first();
  await demo.screenshot({ path: path.join(shotDir, 'blocks-explain-initial-' + id + '.png') });
  const geometry = await page.evaluate(() => {
    const stage = document.querySelector('#gallery-demo .nblk-demo-stage__stage');
    const cap = document.querySelector('#gallery-demo .nblk-demo-stage__caption');
    const ctrl = document.querySelector('#gallery-demo .nblk-demo-stage__controls');
    const demo = document.querySelector('#gallery-demo');
    return {
      demoWidth: demo ? Math.round(demo.getBoundingClientRect().width) : null,
      stage: stage ? Math.round(stage.getBoundingClientRect().height) : null,
      captionTopRelative: stage && cap ? Math.round(cap.getBoundingClientRect().top - stage.getBoundingClientRect().top) : null,
      controlsTopRelative: stage && ctrl ? Math.round(ctrl.getBoundingClientRect().top - stage.getBoundingClientRect().top) : null
    };
  });
  console.log(id, JSON.stringify(geometry));
}
console.log('errors', errors);
await browser.close();
