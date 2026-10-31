import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { moduleDemos, moduleScripts, moduleStyles } from '../lib/src-sources.mjs';
import { cacheDir } from '../lib/test-output.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('../tools/node_modules/playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const shotDir = cacheDir(root, 'checks', 'forms-advanced');
const MODULES = ['core', 'ui-forms-basic', 'ui-forms-advanced'];
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const css = moduleStyles(root, MODULES).map(f=>path.join(root,f));
const js = [...moduleScripts(root, MODULES), ...moduleDemos(root, ['ui-forms-advanced'])].map(f=>path.join(root,f));
const browser = await chromium.launch({ executablePath: edge, headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 1200 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.setContent('<style>html,body{margin:0;padding:0;background:#f4f6f9}</style><div id="host" style="padding:20px"></div>');
for (const f of css) await page.addStyleTag({ path: f });
for (const f of js) await page.addScriptTag({ path: f });
const widths = [1100, 720, 520, 360];
const overflow = [];
for (const width of widths) {
  await page.setViewportSize({ width, height: 1200 });
  for (const id of ['F09','F10','F11','F12','F13','F14','F15']) {
    const result = await page.evaluate(({ id }) => {
      const host = document.getElementById('host');
      host.replaceChildren();
      const inst = window.NoteGalleryDemos[id](host);
      const overflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const buttons = host.querySelectorAll('button').length;
      if (inst && typeof inst.destroy === 'function') inst.destroy();
      else host.replaceChildren();
      return { overflowX, buttons, leftover: document.querySelectorAll('.hnv-floating').length };
    }, { id });
    overflow.push({ width, id, ...result });
  }
}
console.log(JSON.stringify({ overflow, errors }, null, 2));

// Screenshots at desktop width for visual inspection.
await page.setViewportSize({ width: 1100, height: 1300 });
const shots = [
  ['F09', 'forms-advanced-f09.png'],
  ['F10', 'forms-advanced-f10.png'],
  ['F11', 'forms-advanced-f11.png'],
  ['F12', 'forms-advanced-f12.png'],
  ['F13', 'forms-advanced-f13.png'],
  ['F14', 'forms-advanced-f14.png'],
  ['F15', 'forms-advanced-f15.png']
];
for (const [id, file] of shots) {
  await page.evaluate((id) => {
    if (window.NoteCore && window.NoteCore.floating) window.NoteCore.floating.closeAll('api');
    const host = document.getElementById('host');
    host.replaceChildren();
    window.__demoInstance = window.NoteGalleryDemos[id](host);
    if (id === 'F12') {
      const trigger = host.querySelector('.nui-datepicker__trigger');
      if (trigger) trigger.click();
    }
    if (id === 'F13') {
      const trigger = host.querySelector('.nui-timepicker__trigger');
      if (trigger) trigger.click();
    }
    if (id === 'F15') {
      const buttons = Array.from(host.querySelectorAll('button'));
      const demoButton = buttons.find((b) => b.textContent.indexOf('模拟拖入两个合法文件') >= 0);
      if (demoButton) demoButton.click();
    }
  }, id);
  await page.screenshot({ path: path.join(shotDir, file), fullPage: true });
  await page.evaluate(() => {
    if (window.__demoInstance && window.__demoInstance.destroy) window.__demoInstance.destroy();
    if (window.NoteCore && window.NoteCore.floating) window.NoteCore.floating.closeAll('api');
    document.getElementById('host').replaceChildren();
  });
}
await browser.close();
const bad = overflow.filter((item) => item.overflowX > 1 || item.leftover !== 0);
if (bad.length || errors.length) process.exit(1);
