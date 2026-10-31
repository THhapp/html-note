// gallery/examples 自检：真实 Edge 打开外壳与最小宿主，检查接口、深链、窄屏与错误处理。
// 用法：node tests/checks/gallery-shell-check.mjs
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const checks = [];
const consoleErrors = [];
const failedRequests = [];

function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`);
}

function galleryUrl() {
  return pathToFileURL(path.join(root, 'gallery', 'index.html')).href;
}
function runUrl(id) {
  return pathToFileURL(path.join(root, 'examples', 'run.html')).href + '?id=' + encodeURIComponent(id);
}

const browser = await chromium.launch({ executablePath: edge, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
page.on('requestfailed', (req) => {
  const url = req.url();
  if (url.startsWith('file:')) failedRequests.push(url + ' :: ' + (req.failure()?.errorText || ''));
});

try {
  await page.goto(galleryUrl(), { waitUntil: 'load' });
  await page.waitForTimeout(600);
  const meta = await page.evaluate(() => ({
    hasApi: !!window.NoteGallery,
    state: document.documentElement.getAttribute('data-gallery-state'),
    registryCount: window.NOTE_LIBRARY_REGISTRY?.entries?.length ?? -1,
    listCount: window.NoteGallery?.list().length ?? -1,
    current: window.NoteGallery?.current() ?? null,
    countText: document.getElementById('gallery-count')?.textContent || '',
    listDom: document.querySelectorAll('#gallery-list a.gallery-item').length,
    categories: document.querySelectorAll('#gallery-categories [data-category]').length,
    detailId: document.querySelector('#gallery-detail [data-entry-id]')?.getAttribute('data-entry-id') || '',
    detailText: (document.getElementById('gallery-detail')?.innerText || '').slice(0, 160)
  }));
  check('gallery API present', meta.hasApi);
  check('list count equals registry', meta.listCount === meta.registryCount, `list=${meta.listCount} registry=${meta.registryCount}`);
  check('list DOM rendered', meta.listDom === meta.registryCount, `dom=${meta.listDom}`);
  check('categories rendered', meta.categories >= 2, `chips=${meta.categories}`);
  check('default selection exists', !!meta.detailId, `current=${meta.current} detail=${meta.detailId}`);
  console.log('gallery meta:', JSON.stringify(meta));

  const ids = await page.evaluate(() => window.NoteGallery.list());
  // 选当前构建存在的代表项；缺失的 ID 留到完整构建后再测。
  const preferred = ['R01', 'R05', 'R07', 'R08', 'R09', 'R10'];
  const available = preferred.filter((id) => ids.includes(id));
  if (!available.length && ids.length) available.push(ids[0]);

  for (const id of available) {
    const before = consoleErrors.length;
    const result = await page.evaluate(async (entryId) => {
      const ok = window.NoteGallery.select(entryId);
      await window.NoteGallery.ready();
      await new Promise((r) => setTimeout(r, 80));
      const host = document.querySelector('#gallery-demo');
      return {
        ok,
        current: window.NoteGallery.current(),
        nodes: host ? host.querySelectorAll('*').length : -1,
        hash: location.hash,
        text: (document.getElementById('gallery-detail')?.innerText || '').slice(0, 100)
      };
    }, id);
    check(`select ${id}`, result.ok && result.current === id && result.nodes > 3, JSON.stringify(result));
    check(`select ${id} no new console errors`, consoleErrors.length === before, consoleErrors.slice(before).join(' | ').slice(0, 300));
  }

  if (ids.length) {
    const filter = await page.evaluate(async () => {
      const input = document.getElementById('gallery-search');
      const name = window.NoteGallery.list()[0];
      const entry = window.NOTE_LIBRARY_REGISTRY.entries.find((e) => e.id === name);
      input.value = entry.cn;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 30));
      return {
        visible: document.querySelectorAll('#gallery-list a.gallery-item').length,
        count: document.getElementById('gallery-count')?.textContent || '',
        emptyHidden: document.getElementById('gallery-empty')?.hidden
      };
    });
    check('filter narrows list', filter.visible >= 1 && filter.visible < meta.registryCount, JSON.stringify(filter));
    await page.evaluate(() => {
      const input = document.getElementById('gallery-search');
      input.value = '___no_such_component___';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(30);
    const empty = await page.evaluate(() => ({
      visible: document.querySelectorAll('#gallery-list a.gallery-item').length,
      emptyHidden: document.getElementById('gallery-empty')?.hidden,
      text: document.getElementById('gallery-empty')?.innerText || ''
    }));
    check('empty filter state', empty.visible === 0 && empty.emptyHidden === false, JSON.stringify(empty));
    await page.click('#gallery-empty-reset');
  }

  if (ids.includes('R08')) {
    await page.evaluate(() => { location.hash = '#R08'; });
    await page.waitForTimeout(350);
    const deep = await page.evaluate(() => ({
      current: window.NoteGallery.current(),
      hash: location.hash,
      active: document.querySelector('#gallery-list a[aria-current="true"]')?.getAttribute('data-id') || '',
      detailId: document.querySelector('#gallery-detail [data-entry-id]')?.getAttribute('data-entry-id') || ''
    }));
    check('hash deep link selects entry', deep.current === 'R08' && deep.active === 'R08' && deep.detailId === 'R08', JSON.stringify(deep));
    const remount = await page.evaluate(async () => {
      const ok = window.NoteGallery.select('R08');
      await window.NoteGallery.ready();
      return { ok, current: window.NoteGallery.current(), nodes: document.querySelector('#gallery-demo')?.querySelectorAll('*').length || 0 };
    });
    check('reselect same entry remounts', remount.ok && remount.nodes > 3, JSON.stringify(remount));
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const overflow390 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('390px gallery no horizontal overflow', overflow390 <= 2, `overflow=${overflow390}`);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(200);
  const overflow1024 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('1024px gallery no horizontal overflow', overflow1024 <= 2, `overflow=${overflow1024}`);

  // 独立示例：存在的条目必须挂载，缺失 ID 必须明确说明而不白屏。
  const runIds = available.slice(0, 3);
  for (const id of runIds) {
    await page.goto(runUrl(id), { waitUntil: 'load' });
    await page.waitForTimeout(250);
    const state = await page.evaluate(() => ({
      nodes: document.querySelector('#example-demo')?.querySelectorAll('*').length ?? -1,
      title: document.getElementById('ex-title')?.textContent || '',
      noticeHidden: document.getElementById('ex-notice')?.hidden,
      current: window.NoteExampleRun?.current?.() ?? null,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }));
    check(`run ${id} demo mounted`, state.nodes > 3 && state.current === id, JSON.stringify(state));
    check(`run ${id} no overflow`, state.overflow <= 2, `overflow=${state.overflow}`);
  }
  await page.goto(runUrl('ZZ99'), { waitUntil: 'load' });
  await page.waitForTimeout(250);
  const bad = await page.evaluate(() => ({
    body: document.body.innerText.slice(0, 220),
    noticeHidden: document.getElementById('ex-notice')?.hidden,
    nodes: document.querySelector('#example-demo')?.querySelectorAll('*').length ?? -1
  }));
  check('run unknown ID shows clear error', bad.noticeHidden === false && /没有找到|错误|未找到/.test(bad.body), JSON.stringify(bad));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const runOverflow390 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('390px run page no horizontal overflow', runOverflow390 <= 2, `overflow=${runOverflow390}`);

  const composedPath = path.join(root, 'examples', 'composed.html');
  if (fs.existsSync(composedPath)) {
    await page.setViewportSize({ width: 1440, height: 900 });
    const composedBefore = consoleErrors.length;
    await page.goto(pathToFileURL(composedPath).href, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    await page.evaluate(() => window.NoteComposed && window.NoteComposed.ready && window.NoteComposed.ready());
    await page.waitForTimeout(400);
    const comp = await page.evaluate(() => {
      function overlap(a, b) {
        if (!a || !b) return 0;
        return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
          Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      }
      const label = document.querySelector('.nx-range__label');
      const hint = document.querySelector('.comp-hint');
      const lr = label ? label.getBoundingClientRect() : null;
      const hr = hint ? hint.getBoundingClientRect() : null;
      return {
        text: document.body.innerText.length,
        current: window.NoteComposed?.current?.(),
        panels: document.querySelectorAll('.nui-panel').length,
        sequences: document.querySelectorAll('.nviz-sequence').length,
        charts: document.querySelectorAll('.nviz-chart').length,
        ruleCompare: document.querySelectorAll('.nblk-rule-compare').length,
        demoStage: document.querySelectorAll('.nblk-demo-stage').length,
        tabs: document.querySelectorAll('.nui-tabs').length,
        dataObjects: document.querySelectorAll('.nui-data-object').length,
        rangeGap: lr && hr ? Math.round(hr.top - lr.bottom) : null,
        rangeOverlap: overlap(lr, hr),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        error: document.getElementById('comp-error')?.hidden === false,
      };
    });
    check('composed has content and blocks/components',
      comp.text > 400 && comp.panels >= 2 && comp.sequences >= 1 && comp.charts >= 1 &&
      comp.ruleCompare >= 1 && comp.demoStage >= 1 && comp.dataObjects >= 4 && comp.tabs >= 1,
      JSON.stringify(comp));
    check('composed initial step static and ready', comp.current && comp.current.index === 0 && !comp.error, JSON.stringify(comp.current));
    check('composed Range label does not overlap following text', comp.rangeOverlap === 0 && comp.rangeGap > 4, `gap=${comp.rangeGap} overlap=${comp.rangeOverlap}`);
    check('composed 1440 no horizontal overflow', comp.overflow <= 2, `overflow=${comp.overflow}`);

    const stepStates = [];
    for (const index of [1, 2, 3]) {
      await page.evaluate(async (i) => {
        window.NoteComposed.go(i);
        await new Promise((r) => setTimeout(r, 450));
      }, index);
      stepStates.push(await page.evaluate(() => ({
        index: window.NoteComposed.current().index,
        key: document.querySelector('#comp-key-value')?.textContent,
        status: document.querySelector('.comp-stage__status .nui-badge')?.textContent,
        bucket: document.querySelector('.comp-bucket-row__badge .nui-badge')?.textContent,
        range: document.querySelector('.nx-range')?.getAttribute('data-nx-state'),
        link: document.querySelector('.nx-link')?.getAttribute('data-nx-state'),
        ruleEmphasis: document.querySelectorAll('.nblk-rule-compare .nui-table__row--emphasis').length,
        slotEmphasis: document.querySelectorAll('.comp-tabs .nui-table__row--emphasis').length,
        caption: document.querySelector('.nblk-demo-stage__caption')?.textContent || ''
      })));
    }
    check('composed step 2 replaces version', /:v2$/.test(stepStates[0].key || '') && /版本已替换/.test(stepStates[0].status || '') && stepStates[0].link === 'shown', JSON.stringify(stepStates[0]));
    check('composed step 3 validates and hides Range', /校验通过/.test(stepStates[1].status || '') && stepStates[1].range === 'idle' && stepStates[1].link === 'idle' && stepStates[1].ruleEmphasis >= 1, JSON.stringify(stepStates[1]));
    check('composed step 4 routes to bucket with emphasis', /命中 · 槽 3/.test(stepStates[2].bucket || '') && stepStates[2].link === 'shown' && stepStates[2].slotEmphasis >= 1, JSON.stringify(stepStates[2]));
    check('composed captions match steps', /收集请求片段/.test(comp.current.caption || '') && /替换版本段/.test(stepStates[0].caption) && /校验归一化键/.test(stepStates[1].caption) && /落到 3 号槽/.test(stepStates[2].caption));

    await page.evaluate(async () => {
      const tabs = Array.from(document.querySelectorAll('.nui-tabs__tab'));
      const tableTab = tabs.find((b) => b.textContent.includes('槽位明细'));
      if (tableTab) tableTab.click();
      await new Promise((r) => setTimeout(r, 300));
    });
    const tabState = await page.evaluate(() => ({
      active: document.querySelector('.nui-tabs__tab[aria-selected="true"]')?.textContent?.trim() || '',
      rows: document.querySelectorAll('.nui-tabs__panel:not([hidden]) .nui-table tbody tr').length
    }));
    check('composed tabs switch to slot table', /槽位明细/.test(tabState.active) && tabState.rows === 8, JSON.stringify(tabState));

    // Official-audit-style button pass: click the first 12 buttons by accessible name.
    await page.evaluate(async () => { window.NoteComposed.reset(); await new Promise((r) => setTimeout(r, 300)); });
    const buttonLabels = await page.evaluate(() => Array.from(document.querySelectorAll('button')).slice(0, 12).map((b) => b.textContent.trim()).filter(Boolean));
    for (const label of buttonLabels) {
      const button = page.getByRole('button', { name: label, exact: true }).first();
      if (await button.count()) await button.click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(160);
    }
    const afterButtons = await page.evaluate(() => ({
      current: window.NoteComposed.current(),
      floats: document.querySelectorAll('.hnv-floating').length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }));
    check('composed button pass leaves no floating layer', afterButtons.floats === 0, JSON.stringify(afterButtons));
    check('composed button pass no new console errors', consoleErrors.length === composedBefore, consoleErrors.slice(composedBefore).join(' | ').slice(0, 300));

    const rangeChecks = [];
    for (const viewport of [{ width: 1024, height: 768 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(200);
      for (const step of [0, 1]) {
        await page.evaluate(async (i) => { window.NoteComposed.go(i); await new Promise((r) => setTimeout(r, 450)); }, step);
        rangeChecks.push(await page.evaluate((width) => {
          function overlap(a, b) {
            if (!a || !b) return 0;
            return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
              Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          }
          const label = document.querySelector('.nx-range__label');
          const hint = document.querySelector('.comp-hint');
          const lr = label ? label.getBoundingClientRect() : null;
          const hr = hint ? hint.getBoundingClientRect() : null;
          return {
            width,
            step: window.NoteComposed.current().index,
            gap: lr && hr ? Math.round(hr.top - lr.bottom) : null,
            overlap: overlap(lr, hr),
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
          };
        }, viewport.width));
      }
    }
    check('composed Range label clear at 1024/390', rangeChecks.every((r) => r.overlap === 0 && r.gap > 4), JSON.stringify(rangeChecks));
    check('composed no horizontal overflow at 1024/390', rangeChecks.every((r) => r.overflow <= 2), JSON.stringify(rangeChecks));

    await page.evaluate(() => window.NoteComposed.cleanup());
    const cleaned = await page.evaluate(() => ({
      nx: document.querySelectorAll('.nx-focus,.nx-range,.nx-link').length,
      floats: document.querySelectorAll('.hnv-floating,.nui-toast-region').length,
      panels: document.querySelectorAll('.nui-panel,.nblk-demo-stage').length
    }));
    check('composed cleanup removes overlays and instances', cleaned.nx === 0 && cleaned.floats === 0 && cleaned.panels === 0, JSON.stringify(cleaned));
  } else {
    console.log('SKIP  composed.html not written yet');
  }

  check('no pageerror', !consoleErrors.some((e) => e.startsWith('pageerror:')), consoleErrors.filter((e) => e.startsWith('pageerror:')).join(' | ').slice(0, 400));
  console.log('\nconsole errors:', consoleErrors.length, consoleErrors.slice(0, 12));
  console.log('failed file requests:', failedRequests.length, failedRequests.slice(0, 12));
} finally {
  await browser.close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length} checks, ${failed.length} failed`);
if (failed.length) process.exitCode = 1;
