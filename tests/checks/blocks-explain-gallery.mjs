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
const failures = [];
function check(name, ok, detail) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || !detail ? '' : ' :: ' + detail));
  if (!ok) failures.push({ name, detail });
}
const browser = await chromium.launch({ executablePath: edge, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(String(e && e.stack || e)));
async function open(id) {
  await page.goto(gallery + '#' + id, { waitUntil: 'load' });
  await page.waitForFunction((wanted) => document.documentElement.getAttribute('data-gallery-state') === 'ready' && window.__galleryReadyId === wanted || (document.querySelector('#gallery-demo') && document.querySelector('.gallery-detail h2') && document.documentElement.getAttribute('data-gallery-state') === 'ready'), id, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);
  return await page.evaluate(() => ({
    state: document.documentElement.getAttribute('data-gallery-state'),
    detail: document.querySelector('#gallery-demo') ? true : false,
    error: document.querySelector('#gallery-demo-error') && !document.querySelector('#gallery-demo-error').hidden,
    demoText: document.querySelector('#gallery-demo') ? document.querySelector('#gallery-demo').textContent.replace(/\s+/g, ' ').trim().slice(0, 120) : '',
    hash: location.hash
  }));
}
async function clickButton(label) {
  const loc = page.getByRole('button', { name: label, exact: true }).last();
  await loc.click({ timeout: 4000 });
  await page.waitForTimeout(70);
}
for (const id of ['B05','B06','B07','B08','B09','B10']) {
  const info = await open(id);
  check(id + ' gallery ready', info.state === 'ready' && info.detail && !info.error, JSON.stringify(info));
}
// Neighbours B01–B04 share the merged blocks module; ensure the manifest
// addition did not regress their real gallery mounts.
for (const id of ['B01','B02','B03','B04']) {
  const info = await open(id);
  check(id + ' neighbouring block still mounts', info.state === 'ready' && info.detail && !info.error, JSON.stringify(info));
}
const interactions = {
  B05: ['程序跳到索引 2 的检查', '换用“未找到”场景', '切换窄容器'],
  B06: ['切换为 LSB 在前', '清除变化标记', '选中计数字段', '换用另一组位串与字段', '切换窄容器'],
  B07: ['跳到分流停点', '换用精简流程', '切换窄容器'],
  B08: ['跳到返回消息', '跳到异步消息', '换用短时序', '切换窄容器'],
  B09: ['静默选中“常用模式”', '替换详情内容', '替换目录并新增条目', '切换窄容器'],
  B10: ['换用更新后的读数', '程序跳到第 2 个停点', '切换窄容器']
};
for (const [id, labels] of Object.entries(interactions)) {
  const info = await open(id);
  let allClicked = true;
  let errorText = '';
  for (const label of labels) {
    try { await clickButton(label); } catch (error) { allClicked = false; errorText += label + ': ' + error.message + '; '; }
  }
  const status = await page.evaluate(() => {
    const node = document.querySelector('#gallery-demo .nblk-gallery-demo__status');
    const error = document.querySelector('#gallery-demo-error');
    return {
      status: node ? node.textContent.trim() : '',
      demoError: !!(error && !error.hidden)
    };
  });
  check(id + ' demo controls run', allClicked && !status.demoError && !info.error, errorText + JSON.stringify(status));
  await page.screenshot({ path: path.join(shotDir, 'blocks-explain-' + id + '.png'), fullPage: false });
}
// Narrow viewport gallery smoke.
await page.setViewportSize({ width: 390, height: 900 });
for (const id of ['B05','B06','B07','B08','B09','B10']) {
  const info = await open(id);
  const layout = await page.evaluate(() => {
    const demo = document.querySelector('#gallery-demo');
    return {
      viewportOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      demoOverflow: demo ? demo.scrollWidth > demo.clientWidth + 2 : false,
      demoWidth: demo ? demo.clientWidth : 0,
      demoScrollWidth: demo ? demo.scrollWidth : 0,
      demo: !!demo,
      error: document.querySelector('#gallery-demo-error') && !document.querySelector('#gallery-demo-error').hidden
    };
  });
  check(id + ' narrow gallery mount', info.state === 'ready' && layout.demo && !layout.error && !layout.viewportOverflow && !layout.demoOverflow, JSON.stringify(layout));
}
check('gallery console errors empty', consoleErrors.length === 0, consoleErrors.join(' | '));
check('gallery page errors empty', pageErrors.length === 0, pageErrors.join(' | '));

// Exercise each gallery demo's own destroy path in a scratch host. The shell's
// current demo stays mounted; scratch residue is measured only after cleanup.
const baseline = await page.evaluate(() => document.querySelectorAll('.hnv-floating, .nx-focus, .nblk-step-player').length);
const demoCleanup = await page.evaluate(() => {
  const results = [];
  for (const id of ['B05', 'B06', 'B07', 'B08', 'B09', 'B10']) {
    const factory = window.NoteGalleryDemos && window.NoteGalleryDemos[id];
    const host = document.createElement('div');
    document.body.appendChild(host);
    let mounted = false;
    let handle = null;
    let error = '';
    try {
      handle = factory ? factory(host) : null;
      mounted = host.children.length > 0;
      if (handle && typeof handle.destroy === 'function') handle.destroy();
    } catch (err) {
      error = String(err && err.stack || err);
    }
    const after = {
      childCount: host.children.length,
      blockRoots: host.querySelectorAll('.nblk-codetrace, .nblk-framefields, .nblk-flow, .nblk-sequence-diagram, .nblk-hierarchy, .nblk-chart-explain').length,
      buttons: host.querySelectorAll('button').length
    };
    host.remove();
    results.push({ id, mounted, error, after });
  }
  return results;
});
for (const item of demoCleanup) {
  check(item.id + ' demo factory mounts and destroys cleanly', item.mounted && !item.error && item.after.childCount === 0 && item.after.blockRoots === 0, JSON.stringify(item));
}
const scratchFloating = await page.evaluate(() => document.querySelectorAll('.hnv-floating, .nx-focus, .nblk-step-player').length);
check('no floating/stepper residue after demo destroy', scratchFloating === baseline, 'before=' + baseline + ' after=' + scratchFloating);
await browser.close();
console.log('\nGallery summary: ' + (failures.length ? failures.length + ' failed' : 'all passed'));
if (failures.length) process.exitCode = 1;
