// 单文件预览离线审计：复制到独立目录并禁止网络；--ids=R01,C09 可只检查代表条目。
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { cacheDir, cacheFile } from '../lib/test-output.mjs';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// 条目数以构建产物为准，不再把某一轮的总数写死（曾为 100）。
const expectedEntryCount = JSON.parse(fs.readFileSync(path.join(root, 'registry.json'), 'utf8')).counts.total;
const src = path.join(root, 'dist', '组件库-预览.html');
// 离线审计的副本、截图与结果都是生成物，统一放在 tests/.cache。
const outDir = cacheDir(root, 'offline');
const copy = path.join(outDir, 'preview.html');
fs.copyFileSync(src, copy);
const url = pathToFileURL(copy).href;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const browser = await chromium.launch({ executablePath: edge, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
const requests = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('request', (req) => { if (!req.url().startsWith('data:')) requests.push(req.url()); });
await page.route(/^https?:/, (route) => route.abort());
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(800);

const meta = await page.evaluate(() => ({
  entries: window.NOTE_LIBRARY_REGISTRY ? window.NOTE_LIBRARY_REGISTRY.entries.length : 0,
  hasGallery: !!window.NoteGallery,
  ids: window.NOTE_LIBRARY_REGISTRY ? window.NOTE_LIBRARY_REGISTRY.entries.map((e) => e.id) : []
}));

const idsArg = process.argv.slice(2).find((arg) => arg.startsWith('--ids='));
const selectedIds = idsArg ? idsArg.slice(6).split(',').filter(Boolean) : meta.ids;
const unknownIds = selectedIds.filter((id) => !meta.ids.includes(id));
if (unknownIds.length) {
  await browser.close();
  throw new Error('Unknown demo IDs: ' + unknownIds.join(', '));
}

const failures = [];
for (const id of selectedIds) {
  const before = errors.length;
  const state = await page.evaluate(async (entryId) => {
    const ok = window.NoteGallery.select(entryId);
    await window.NoteGallery.ready();
    await new Promise((r) => setTimeout(r, 35));
    const box = document.querySelector('#gallery-demo, [data-gallery-demo], .gallery-demo');
    return { ok, nodes: box ? box.querySelectorAll('*').length : -1 };
  }, id).catch((e) => ({ ok: false, nodes: -1, error: String(e) }));
  if (!state.ok || state.nodes <= 3 || errors.length > before) failures.push({ id, state, errors: errors.slice(before) });
}

await page.evaluate(() => window.NoteGallery.select('C08'));
await page.waitForTimeout(300);
const figure = await page.evaluate(() => {
  const image = document.querySelector('#gallery-demo img');
  const failed = Array.from(document.querySelectorAll('#gallery-demo img')).filter((img) => img.complete && img.naturalWidth === 0);
  return {
    imageCount: document.querySelectorAll('#gallery-demo img').length,
    firstNaturalWidth: image ? image.naturalWidth : 0,
    failedImages: failed.length
  };
});
await page.evaluate(() => window.NoteGallery.select('C09'));
await page.waitForTimeout(300);
const math = await page.evaluate(() => ({
  katex: !!document.querySelector('#gallery-demo .katex'),
  rawTexVisible: (document.querySelector('#gallery-demo') ? document.querySelector('#gallery-demo').innerText : '').includes('\\frac'),
  mathFonts: document.fonts ? Array.from(document.fonts).filter((f) => /KaTeX/i.test(f.family)).length : -1
}));
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
await page.screenshot({ path: path.join(cacheDir(root, 'shots'), 'singlefile-gallery.png') });

const foreignRequests = requests.filter((u) => u !== url);
const summary = {
  entries: meta.entries,
  checkedIds: selectedIds,
  hasGallery: meta.hasGallery,
  demoFailures: failures.slice(0, 20),
  demoFailureCount: failures.length,
  errors: errors.slice(0, 30),
  allRequests: requests,
  foreignRequests,
  figure,
  math,
  overflow390: overflow,
  fileBytes: fs.statSync(src).size
};
fs.writeFileSync(cacheFile(root, 'audit', 'audit-singlefile.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
await browser.close();
if (meta.entries !== expectedEntryCount || meta.hasGallery !== true || failures.length || errors.length || foreignRequests.length || overflow > 2) process.exitCode = 1;