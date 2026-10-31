import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({ executablePath: edge, headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
const failedRequests = [];
page.on('requestfailed', (req) => failedRequests.push(req.url()));
await page.goto(pathToFileURL(path.join(root, 'gallery/index.html')).href, { waitUntil: 'load' });
await page.waitForTimeout(300);
const meta = await page.evaluate(() => ({
  hasGallery: !!window.NoteGallery,
  registry: window.NOTE_LIBRARY_REGISTRY ? window.NOTE_LIBRARY_REGISTRY.entries.length : 0,
  ids: window.NOTE_LIBRARY_REGISTRY ? window.NOTE_LIBRARY_REGISTRY.entries.filter((e) => /^X0[1-7]$/.test(e.id)).map((e) => e.id) : []
}));
console.log('gallery meta', meta);
const results = [];
for (const id of ['X01', 'X02', 'X03', 'X04', 'X05', 'X06', 'X07']) {
  const before = errors.length;
  const state = await page.evaluate(async (entryId) => {
    const ok = window.NoteGallery.select(entryId);
    await window.NoteGallery.ready();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const host = document.getElementById('gallery-demo');
    return {
      ok,
      text: host ? host.innerText.slice(0, 180) : '',
      nodes: host ? host.querySelectorAll('*').length : -1,
      missing: host ? !!host.querySelector('.gallery-demo-missing') : true,
      error: host ? document.getElementById('gallery-demo-error')?.innerText || '' : '',
      hash: location.hash
    };
  }, id).catch((error) => ({ ok: false, error: String(error) }));
  const good = state.ok && state.nodes > 5 && !state.missing && !state.error;
  results.push({ id, good, state, errors: errors.slice(before) });
  console.log(`${good ? 'PASS' : 'FAIL'} ${id}`, JSON.stringify(state).slice(0, 300));
}
await page.evaluate(() => window.NoteGallery.select('X07'));
await page.evaluate(() => document.querySelector('#gallery-demo .nui-extended-demo__button--primary')?.click());
await page.waitForTimeout(120);
const commandOpen = await page.evaluate(() => ({
  open: !!document.querySelector('.hnv-floating [role="dialog"][aria-modal="true"]'),
  focusedInput: document.activeElement === document.querySelector('.nui-command__input')
}));
console.log('gallery X07 open', commandOpen);
await page.keyboard.press('Escape');
await page.evaluate(() => window.NoteGallery.select('X01'));
await page.waitForTimeout(200);
const leftovers = await page.evaluate(() => document.querySelectorAll('.hnv-floating, .hnv-floating__backdrop').length);
console.log('leftovers', leftovers);
console.log('console errors', errors);
console.log('failed requests', failedRequests);
const failed = results.filter((r) => !r.good || r.errors.length);
await browser.close();
if (failed.length || !commandOpen.open || !commandOpen.focusedInput || leftovers || errors.length) process.exitCode = 1;
