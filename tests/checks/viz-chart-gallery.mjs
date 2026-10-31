// V01 gallery integration check — real dist build + gallery shell, real Edge.
// The current repository is missing B-block demo files (not V01); initial
// console noise from those missing scripts is reported but not counted against V01.
// Usage: node tests/checks/viz-chart-gallery.mjs
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const root = process.env.NOTE_LIB_ROOT
  ? path.resolve(process.env.NOTE_LIB_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const galleryUrl = pathToFileURL(path.join(root, 'gallery', 'index.html')).href;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const failures = [];
const passes = [];
function check(name, ok, detail = '') {
  if (ok) passes.push(name);
  else {
    failures.push({ name, detail });
    console.log(`  FAIL ${name}${detail ? ' :: ' + detail : ''}`);
  }
}

const browser = await chromium.launch({ executablePath: edge, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', (err) => pageErrors.push(err.message));
await page.goto(galleryUrl, { waitUntil: 'load' });
await page.waitForTimeout(500);

const initialErrors = consoleErrors.slice();
const initialPageErrors = pageErrors.slice();

const selected = await page.evaluate(async () => {
  if (!window.NoteGallery || typeof window.NoteGallery.select !== 'function') {
    return { ok: false, reason: 'NoteGallery missing' };
  }
  const ok = window.NoteGallery.select('V01');
  await window.NoteGallery.ready();
  await new Promise((resolve) => setTimeout(resolve, 120));
  const demo = document.querySelector('.nviz-chart-demo');
  const chart = demo && demo.querySelector('.nviz-chart');
  const details = demo && demo.querySelector('.nviz-chart__table');
  return {
    ok,
    hasDemo: !!demo,
    type: chart && chart.getAttribute('data-type'),
    bars: demo ? demo.querySelectorAll('.nviz-chart__bar').length : 0,
    tableOpen: !!(details && details.open),
    status: demo && demo.querySelector('.nviz-chart-demo__status') &&
      demo.querySelector('.nviz-chart-demo__status').textContent,
    demoButtons: demo ? demo.querySelectorAll('button').length : 0,
    registryCount: window.NOTE_LIBRARY_REGISTRY ? window.NOTE_LIBRARY_REGISTRY.entries.length : 0
  };
});
check('gallery: V01 selectable', selected.ok, JSON.stringify(selected));
check('gallery: V01 demo mounted from dist with table open',
  selected.hasDemo && selected.type === 'bar' && selected.bars === 8 && selected.tableOpen &&
  selected.demoButtons >= 10 && /柱状图/.test(selected.status || ''), JSON.stringify(selected));

const errorsBeforeV01Actions = consoleErrors.length;
const demo = page.locator('.nviz-chart-demo').first();
await demo.getByRole('button', { name: '饼图', exact: true }).click();
await page.waitForTimeout(120);
const pieState = await page.evaluate(() => {
  const demo = document.querySelector('.nviz-chart-demo');
  return {
    type: demo.querySelector('.nviz-chart').getAttribute('data-type'),
    slices: demo.querySelectorAll('.nviz-chart__slice').length,
    legend: demo.querySelectorAll('.nviz-chart__legend-item').length
  };
});
check('gallery: V01 demo type switch works in dist',
  pieState.type === 'pie' && pieState.slices === 4 && pieState.legend === 4, JSON.stringify(pieState));

await demo.getByRole('button', { name: '长标签', exact: true }).click();
await page.waitForTimeout(120);
const longState = await page.evaluate(() => {
  const demo = document.querySelector('.nviz-chart-demo');
  return {
    rows: demo.querySelectorAll('tbody tr').length,
    labels: Array.from(demo.querySelectorAll('.nviz-chart__legend-label')).map((n) => n.textContent)
  };
});
check('gallery: V01 long-label update works in dist',
  longState.rows === 3 && longState.labels.some((label) => /非常长的直营/.test(label)), JSON.stringify(longState));

await demo.getByRole('button', { name: '空数据', exact: true }).click();
await page.waitForTimeout(120);
const emptyState = await page.evaluate(() => {
  const demo = document.querySelector('.nviz-chart-demo');
  return {
    empty: !!demo.querySelector('.nviz-chart__empty'),
    svg: !!demo.querySelector('.nviz-chart__svg'),
    table: !!demo.querySelector('.nviz-chart__table'),
    disabled: demo.querySelectorAll('button:disabled').length
  };
});
check('gallery: V01 empty state works in dist',
  emptyState.empty && !emptyState.svg && !emptyState.table && emptyState.disabled >= 4,
  JSON.stringify(emptyState));

await demo.getByRole('button', { name: '恢复默认', exact: true }).click();
await page.waitForTimeout(120);
const resetState = await page.evaluate(() => {
  const demo = document.querySelector('.nviz-chart-demo');
  const details = demo.querySelector('.nviz-chart__table');
  return {
    type: demo.querySelector('.nviz-chart').getAttribute('data-type'),
    bars: demo.querySelectorAll('.nviz-chart__bar').length,
    tableOpen: !!(details && details.open),
    tags: demo.querySelectorAll('.nviz-chart__tag').length
  };
});
check('gallery: V01 reset works in dist',
  resetState.type === 'bar' && resetState.bars === 8 && resetState.tableOpen && resetState.tags >= 2,
  JSON.stringify(resetState));

const newConsoleErrors = consoleErrors.slice(errorsBeforeV01Actions);
check('gallery: no new console errors during V01 interactions', newConsoleErrors.length === 0,
  newConsoleErrors.join(' | ').slice(0, 500));
check('gallery: no page errors', pageErrors.length === initialPageErrors.length,
  pageErrors.slice(initialPageErrors.length).join(' | ').slice(0, 500));

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(320);
const narrow = await page.evaluate(() => {
  const demo = document.querySelector('.nviz-chart-demo');
  const chart = demo && demo.querySelector('.nviz-chart');
  return {
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    chartWidth: chart ? chart.getBoundingClientRect().width : 0,
    demoWidth: demo ? demo.getBoundingClientRect().width : 0,
    tableScroll: demo && demo.querySelector('.nviz-chart__table-scroll')
      ? demo.querySelector('.nviz-chart__table-scroll').scrollWidth -
        demo.querySelector('.nviz-chart__table-scroll').clientWidth
      : null
  };
});
check('gallery: V01 390px no page overflow',
  narrow.pageOverflow <= 2 && narrow.chartWidth <= narrow.demoWidth + 1 &&
  (narrow.tableScroll === null || narrow.tableScroll >= 0), JSON.stringify(narrow));

console.log(`\nviz-chart gallery check: ${passes.length} passed, ${failures.length} failed`);
console.log('registry entries in current build:', selected.registryCount, '(以 registry.counts 为准)');
if (initialErrors.length) {
  console.log('pre-existing console errors (unrelated missing files):');
  initialErrors.slice(0, 6).forEach((error) => console.log('  - ' + error));
}
if (failures.length) {
  console.log('FAILURES:');
  for (const failure of failures) console.log('- ' + failure.name + (failure.detail ? ' :: ' + failure.detail : ''));
}
await browser.close();
process.exit(failures.length ? 1 : 0);