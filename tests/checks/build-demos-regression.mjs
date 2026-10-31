#!/usr/bin/env node
/*
 * Mount every legacy gallery demo in real Edge with the current core + legacy
 * modules, exercise the main controls, destroy it, and verify no body overlays
 * or console errors remain. This is an integration check, not the gallery shell.
 */
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('../tools/node_modules/playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const harness = pathToFileURL(path.join(here, 'build-demos-harness.html')).href;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const failures = [];
function check(condition, message) {
  if (condition) console.log('PASS  ' + message);
  else {
    failures.push(message);
    console.log('FAIL  ' + message);
  }
}

const browser = await chromium.launch({ executablePath: edge, headless: true, args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const consoleErrors = [];
const pageErrors = [];
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', (error) => pageErrors.push(String(error && error.stack || error)));

const ids = ['R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08', 'R09', 'R10', 'I06'];

try {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(harness, { waitUntil: 'load' });
  await page.waitForFunction(() => window.NoteGalleryDemos && window.NoteGalleryDemos.R01);
  const globals = await page.evaluate(() => ({
    core: !!window.NoteCore,
    ui: !!window.NoteUI,
    expr: !!window.NoteExpr,
    seq: !!window.SeqInsert,
    registry: !!window.NOTE_LIBRARY_REGISTRY,
    demos: Object.keys(window.NoteGalleryDemos || {}).sort()
  }));
  check(globals.core && globals.ui && globals.expr && globals.seq, 'core, NoteUI, NoteExpr and SeqInsert are available in harness');
  check(globals.registry, 'registry.js is available in harness');
  check(ids.every((id) => globals.demos.includes(id)), 'all R01–R10 + I06 demo functions are registered');

  await page.evaluate(() => {
    window.__resolverSentinel = function () { return null; };
    NoteUI.Button.iconResolver = window.__resolverSentinel;
  });

  async function open(id) {
    await page.evaluate((demoId) => {
      const host = document.createElement('div');
      host.id = 'demo-host';
      document.body.appendChild(host);
      window.__demoHost = host;
      window.__demoHandle = window.NoteGalleryDemos[demoId](host);
    }, id);
    await page.waitForTimeout(30);
  }

  async function action(text) {
    const button = page.locator('#demo-host .legacy-demo__action', { hasText: text }).first();
    await button.click();
    await page.waitForTimeout(35);
  }

  async function close() {
    const result = await page.evaluate(() => {
      const handle = window.__demoHandle;
      const hadDestroy = !!(handle && typeof handle.destroy === 'function');
      if (hadDestroy) handle.destroy();
      if (window.__demoHost) window.__demoHost.remove();
      window.__demoHost = null;
      window.__demoHandle = null;
      return {
        hadDestroy,
        hostGone: !document.getElementById('demo-host'),
        focus: document.querySelectorAll('.nx-focus,.nx-range,.nx-link').length,
        seq: document.querySelectorAll('.seq-insert').length,
        demo: document.querySelectorAll('.legacy-demo').length
      };
    });
    check(result.hadDestroy, 'demo returns { destroy() }');
    check(result.hostGone && result.focus === 0 && result.seq === 0 && result.demo === 0, 'destroy removes demo and all body overlay/temporary nodes');
  }

  // R01
  await open('R01');
  check(await page.locator('#demo-host .nui-button').count() >= 7, 'R01 demo mounts multiple real NoteUI.Button variants');
  check(await page.locator('#demo-host .nui-button--icon-only').count() >= 2, 'R01 demo shows icon-only buttons');
  await page.locator('#demo-host .nui-button[aria-label="新建条目"]').click();
  check((await page.textContent('#demo-host .legacy-demo__feedback')).includes('ariaLabel'), 'R01 icon-only accessible action works');
  await action('更新 DOM 图标按钮文案');
  check((await page.textContent('#demo-host .legacy-demo__feedback')).includes('同一个 DOM 图标节点'), 'R01 update preserves the icon DOM node');
  await action('切换加载 1.2 秒');
  check(await page.locator('#demo-host .nui-button[aria-busy="true"]').count() === 1, 'R01 loading state visible');
  await close();
  await page.waitForTimeout(1300);
  check(await page.evaluate(() => NoteUI.Button.iconResolver === window.__resolverSentinel), 'R01 destroy restores the previous iconResolver');
  check(consoleErrors.length === 0, 'R01 cleanup leaves no console errors');

  // R02
  await open('R02');
  check(await page.locator('#demo-host .nui-segmented').count() === 2, 'R02 demo mounts two Segmented instances');
  await action('换一组选项（程序更新）');
  check((await page.textContent('#demo-host .nui-segmented')).includes('按对象'), 'R02 programmatic options update works');
  check((await page.textContent('#demo-host .legacy-demo__feedback')).includes('onChange 没有被调用'), 'R02 documents that program update does not emit change');
  await close();

  // R03
  await open('R03');
  check(await page.locator('#demo-host .nui-badge').count() >= 5, 'R03 demo mounts multiple Badge states');
  await action('更新最后一个标签');
  const tone = await page.locator('#demo-host .nui-badge').last().getAttribute('data-tone');
  check(tone === 'warning', 'R03 live update changes the badge tone');
  await close();

  // R04
  await open('R04');
  check(await page.locator('#demo-host .nui-notice').count() === 3, 'R04 demo mounts all Notice tones');
  await action('切换说明内容与语气');
  const notice = page.locator('#demo-host .nui-notice').last();
  check((await notice.getAttribute('data-tone')) === 'accent', 'R04 live update changes Notice tone');
  await close();

  // R05
  await open('R05');
  check(await page.locator('#demo-host .nui-disclosure').count() === 2, 'R05 demo mounts closed and open Disclosure');
  await action('程序开合');
  const opened = await page.locator('#demo-host details.nui-disclosure').first().evaluate((el) => el.open);
  check(opened === true, 'R05 programmatic open works');
  check((await page.textContent('#demo-host .legacy-demo__feedback')).includes('event 为 null'), 'R05 records programmatic onToggle event=null');
  await close();

  // R06
  await open('R06');
  check(await page.locator('#demo-host .nui-data-object').count() === 3, 'R06 demo mounts DataObject states');
  await action('更新对象状态');
  check((await page.locator('#demo-host .nui-data-object').last().getAttribute('class')).includes('changed'), 'R06 live update marks changed object');
  await close();

  // R07
  await open('R07');
  check(await page.locator('#demo-host .legacy-demo').count() === 1, 'R07 demo is mounted');
  await action('关注目标 A');
  check(await page.locator('body > .nx-focus[data-nx-state="shown"]').count() === 1, 'R07 Focus really shows a marker');
  await action('迁移到目标 B');
  check((await page.textContent('#demo-host .legacy-demo__feedback')).includes('目标 B'), 'R07 Focus migration updates target');
  await action('标注文本子串');
  check((await page.textContent('#demo-host .legacy-demo__feedback')).includes('下划线'), 'R07 text underline mode works');
  await action('隐藏');
  check(await page.locator('body > .nx-focus[data-nx-state="shown"]').count() === 0, 'R07 Focus hide clears marker');
  await close();

  // R08
  await open('R08');
  await action('标注前两步');
  check(await page.locator('body > .nx-range[data-nx-state="shown"]').count() === 1, 'R08 Range really shows a bracket');
  await action('更新到后两步');
  check((await page.textContent('#demo-host .legacy-demo__feedback')).includes('后两步'), 'R08 Range update works');
  await action('隐藏');
  check(await page.locator('body > .nx-range[data-nx-state="shown"]').count() === 0, 'R08 Range hide clears bracket');
  await close();

  // R09
  await open('R09');
  await action('配置 → 读取函数');
  check(await page.locator('body > .nx-link[data-nx-state="shown"]').count() === 1, 'R09 Link really shows a relation');
  await action('读取函数 → 缓存对象');
  check((await page.textContent('#demo-host .legacy-demo__feedback')).includes('写入结果'), 'R09 Link updates endpoints and label');
  await action('隐藏');
  check(await page.locator('body > .nx-link[data-nx-state="shown"]').count() === 0, 'R09 Link hide clears relation');
  await close();

  // R10
  await open('R10');
  check(await page.locator('#demo-host .seq-insert[data-inserted="0"]').count() === 1, 'R10 demo mounts SeqInsert before insertion');
  await action('插入');
  await page.waitForTimeout(60);
  check(await page.locator('#demo-host .seq-insert[data-inserted="1"]').count() === 1, 'R10 insert advances to inserted state');
  check((await page.textContent('#demo-host .legacy-demo__feedback')).includes('已插入'), 'R10 onSettle reports inserted state');
  await action('setData 保留停点');
  check(await page.locator('#demo-host .seq-insert[data-inserted="1"]').count() === 1, 'R10 setData keepState keeps inserted state');
  await action('恢复');
  await page.waitForTimeout(60);
  check(await page.locator('#demo-host .seq-insert[data-inserted="0"]').count() === 1, 'R10 restore returns to pre-insert state');
  await action('重看当前停点');
  await page.waitForTimeout(60);
  check(await page.locator('#demo-host .seq-insert[data-inserted="0"]').count() === 1, 'R10 replay at restore stoppoint stays at restore state');
  await action('setData 重置停点');
  check(await page.locator('#demo-host .seq-insert[data-inserted="0"]').count() === 1, 'R10 setData keepState=false resets to initial state');
  await close();

  // I06
  await open('I06');
  const i06Text = await page.textContent('#demo-host');
  // 条目数以运行时 registry 为准，不再把某一轮的总数（曾为 100）写死。
  const i06Counts = await page.evaluate(() => {
    const registry = window.NOTE_LIBRARY_REGISTRY;
    return registry && registry.counts ? { total: registry.counts.total, expected: registry.counts.expected } : null;
  });
  check(i06Text.includes('构建与交付') && i06Text.includes('dist/note-library.js'), 'I06 demo shows real distribution information');
  check(i06Text.includes('条目') && !!i06Counts && i06Text.includes(String(i06Counts.total)) && i06Text.includes(String(i06Counts.expected)), 'I06 demo reads registry counts rather than fake data');
  await action('重新读取运行时信息');
  check((await page.textContent('#demo-host .legacy-demo__feedback')).includes('registry'), 'I06 refresh reads runtime registry state');
  await close();

  check(consoleErrors.length === 0, 'all legacy demos run with no console errors');
  check(pageErrors.length === 0, 'all legacy demos run with no uncaught page errors');
} catch (err) {
  failures.push('runner exception: ' + (err && err.stack || err));
  console.error(err);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error('\nLEGACY DEMO REGRESSION FAILED: ' + failures.length + ' assertion(s)');
  failures.forEach((failure) => console.error('- ' + failure));
  process.exitCode = 1;
} else {
  console.log('\nLEGACY DEMO REGRESSION OK');
}