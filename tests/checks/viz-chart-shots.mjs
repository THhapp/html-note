// Visual capture for NoteViz.Chart (V01). Not part of the delivered library.
// Usage: node tests/checks/viz-chart-shots.mjs
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { cacheDir } from '../lib/test-output.mjs';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pageUrl = pathToFileURL(path.join(root, 'tests', 'checks', 'viz-chart-test.html')).href;
const outDir = cacheDir(root, 'checks', 'viz-chart-shots');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const browser = await chromium.launch({ executablePath: edge, headless: true });
const context = await browser.newContext({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage();
await page.goto(pageUrl, { waitUntil: 'load' });
await page.waitForTimeout(150);

async function shot(name, options, width = 720) {
  await page.evaluate(({ options, width }) => {
    const host = document.getElementById('host');
    if (window.__shotChart) window.__shotChart.destroy();
    host.replaceChildren();
    host.style.width = width + 'px';
    window.__shotChart = NoteViz.Chart.mount(host, options);
  }, { options, width });
  await page.waitForTimeout(180);
  const host = await page.$('#host');
  await host.screenshot({ path: path.join(outDir, name + '.png') });
}

await shot('bar-multi', {
  type: 'bar',
  labels: ['Q1', 'Q2', 'Q3', 'Q4'],
  series: [
    { key: 'online', label: '线上', values: [42, 58, 51, 76] },
    { key: 'store', label: '门店', values: [36, 41, 47, 52] }
  ],
  label: '渠道季度销量',
  unit: '万件',
  table: true,
  focus: { series: 'online', index: 2 },
  changed: { series: 'store', index: 3 }
});

await shot('bar-negative', {
  type: 'bar',
  data: [
    { label: '一月', value: 22 },
    { label: '二月', value: -14 },
    { label: '三月', value: 8 },
    { label: '四月', value: -6 }
  ],
  label: '月度净变化',
  table: true,
  focus: { index: 1 },
  changed: { index: 3 }
});

await shot('line', {
  type: 'line',
  series: [
    { key: 'a', label: '线上', values: [20, 34, 28, 44, 39] },
    { key: 'b', label: '门店', values: [14, 22, 31, 26, 35] }
  ],
  labels: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'],
  label: '渠道走势',
  table: true,
  focus: { series: 'a' },
  changed: { series: 'b', index: 3 }
});

await shot('scatter', {
  type: 'scatter',
  series: [
    { key: 'a', label: 'A 组', points: [{ x: 1, y: 4, label: '甲' }, { x: 2, y: 7, label: '乙' }, { x: 2.6, y: 5.5, label: '丙' }] },
    { key: 'b', label: 'B 组', points: [{ x: 1.5, y: 3 }, { x: 3, y: 6, label: '丁' }, { x: 3.6, y: 4.4 }] }
  ],
  label: '两组测量',
  xLabel: '投入',
  yLabel: '产出',
  table: true,
  focus: { series: 'a', index: 1 },
  changed: { index: 0 }
});

await shot('pie', {
  type: 'pie',
  data: [
    { label: '直营', value: 48 },
    { label: '加盟', value: 31 },
    { label: '电商', value: 26 },
    { label: '其他', value: 9 }
  ],
  label: '渠道销量占比',
  unit: '万件',
  table: true,
  focus: { index: 1 },
  changed: { index: 2 }
});

await shot('long-narrow', {
  type: 'bar',
  data: [
    { label: '非常长的中文类别标签一', value: 10 },
    { label: 'A very long English label two', value: 20 },
    { label: '中英 mixed 标签三号', value: 15 },
    { label: '短标签', value: 8 }
  ],
  label: '长标签与窄容器',
  table: true,
  height: 260
}, 300);

await shot('bar-narrow-focus', {
  type: 'bar',
  data: [
    { label: '一季度', value: 22 },
    { label: '二季度', value: 36 },
    { label: '三季度', value: 28 },
    { label: '四季度', value: 40 }
  ],
  label: '相邻类别强调',
  table: true,
  height: 260,
  focus: { index: 1 },
  changed: { index: 2 }
}, 300);

await shot('pie-narrow', {
  type: 'pie',
  data: [
    { label: '非常长的渠道名称甲', value: 48 },
    { label: '另一个很长的渠道名称乙', value: 31 },
    { label: '渠道丙', value: 21 }
  ],
  label: '窄容器饼图',
  table: true
}, 300);

await page.evaluate(() => {
  const host = document.getElementById('demo');
  host.replaceChildren();
  window.__demoShot = window.NoteGalleryDemos.V01(host);
});
await page.waitForTimeout(250);
const demoHost = await page.$('#demo');
await demoHost.screenshot({ path: path.join(outDir, 'demo-default.png') });
await page.locator('#demo').getByRole('button', { name: '饼图', exact: true }).click();
await page.waitForTimeout(150);
await demoHost.screenshot({ path: path.join(outDir, 'demo-pie.png') });
await page.locator('#demo').getByRole('button', { name: '散点图', exact: true }).click();
await page.locator('#demo').getByRole('button', { name: '长标签', exact: true }).click();
await page.waitForTimeout(150);
await demoHost.screenshot({ path: path.join(outDir, 'demo-scatter-long.png') });
await page.locator('#demo').getByRole('button', { name: '空数据', exact: true }).click();
await page.waitForTimeout(150);
await demoHost.screenshot({ path: path.join(outDir, 'demo-empty.png') });
await page.evaluate(() => { if (window.__demoShot) window.__demoShot.destroy(); });

await browser.close();
console.log('shots:', outDir);
