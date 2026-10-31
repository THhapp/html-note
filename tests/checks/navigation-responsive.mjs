import { chromium } from '../tools/node_modules/playwright-core/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleDemos, moduleScripts, moduleStyles } from '../lib/src-sources.mjs';
import { cacheDir } from '../lib/test-output.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const shotDir = cacheDir(path.resolve(here, '../..'), 'checks', 'navigation');
const root = path.resolve(here, '..', '..');
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
await page.emulateMedia({ reducedMotion: 'reduce' });
const errors = [];
let failures = 0;
page.on('pageerror', error => errors.push(error.stack));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.setContent(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
html,body{margin:0;background:#f4f6f9}
body{padding:12px;font-family:"Microsoft YaHei UI","Segoe UI",sans-serif;color:#202938}
#host{max-width:980px;margin:0 auto;background:#fff;border:1px solid #dce2ea;border-radius:14px;padding:14px}
</style></head><body><div id="host"></div></body></html>`);
// 源码与 demo 加载清单从 src/manifests 推导，模块拆分后自动包含新增文件。
const pageModules = ['core', 'ui-navigation'];
for (const file of [...moduleScripts(root, pageModules), ...moduleDemos(root, ['ui-navigation'])]) {
  await page.addScriptTag({ path: path.join(root, file) });
}
for (const file of moduleStyles(root, pageModules)) {
  await page.addStyleTag({ path: path.join(root, file) });
}
for (const id of ['N01','N02','N03','N04','N05','N06','N07']) {
  const info = await page.evaluate((id) => {
    if (window.__demoInstance) window.__demoInstance.destroy();
    const host = document.getElementById('host');
    host.replaceChildren();
    window.__demoInstance = window.NoteGalleryDemos[id](host);
    const roots = [...host.querySelectorAll('.nui-tabs,.nui-anchor-nav,.nui-breadcrumb,.nui-menu,.nui-pagination,.nui-steps,.nui-tree')];
    return {
      viewport: window.innerWidth,
      docWidth: document.documentElement.scrollWidth,
      hostWidth: host.clientWidth,
      offenders: roots.map(r => ({ cls: r.className, scrollWidth: r.scrollWidth, clientWidth: r.clientWidth })).filter(x => x.scrollWidth > x.clientWidth + 1),
      stepsVertical: document.querySelector('.nui-steps') ? getComputedStyle(document.querySelector('.nui-steps')).getPropertyValue('--x') : null,
      stepDirection: document.querySelector('.nui-steps__list') ? getComputedStyle(document.querySelector('.nui-steps__list')).flexDirection : null,
      anchorColumns: document.querySelector('.nui-navigation-demo__split') ? getComputedStyle(document.querySelector('.nui-navigation-demo__split')).gridTemplateColumns : null
    };
  }, id);
  await page.screenshot({ path: path.join(shotDir, `navigation-narrow-${id}.png`), fullPage: true });
  const noPageOverflow = info.docWidth <= info.viewport + 1;
  const localOnly = info.offenders.every(x => /nui-menu|nui-tree|nui-anchor-nav/.test(x.cls));
  if (!noPageOverflow || !localOnly) failures += 1;
  console.log((noPageOverflow && localOnly ? 'PASS  ' : 'FAIL  ') + id + ' narrow layout ' + JSON.stringify({ docWidth: info.docWidth, viewport: info.viewport, offenders: info.offenders, stepDirection: info.stepDirection, anchorColumns: info.anchorColumns }));
}
console.log('ERRORS', errors.length);
await browser.close();
if (failures || errors.length) process.exit(1);
