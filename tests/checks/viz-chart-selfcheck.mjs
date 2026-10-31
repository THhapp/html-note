// NoteViz.Chart (V01) self check — real Edge via playwright-core.
// Usage: node tests/checks/viz-chart-selfcheck.mjs
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pageUrl = pathToFileURL(path.join(root, 'tests', 'checks', 'viz-chart-test.html')).href;
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
function near(a, b, tolerance = 1.5) {
  return Math.abs(Number(a) - Number(b)) <= tolerance;
}

const browser = await chromium.launch({ executablePath: edge, headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', (err) => pageErrors.push(err.message));
page.on('requestfailed', (req) => failedRequests.push(req.url() + ' :: ' + (req.failure()?.errorText || '')));
await page.goto(pageUrl, { waitUntil: 'load' });
await page.waitForTimeout(150);

// ---------------------------------------------------------------------------
// 1. Single-series bar: negative value, zero baseline, focus/changed, table, targets.
// ---------------------------------------------------------------------------
let bar = await page.evaluate(() => {
  const host = document.getElementById('host');
  host.replaceChildren();
  host.style.width = '720px';
  const inst = window.__chart = NoteViz.Chart.mount(host, {
    type: 'bar',
    data: [
      { label: 'Q1', value: 42 },
      { label: 'Q2', value: 58 },
      { label: 'Q3', value: 51 },
      { label: 'Q4', value: -12 }
    ],
    label: '季度销量',
    unit: '万件',
    table: true,
    height: 300,
    focus: { index: 1 },
    changed: { index: 2 }
  });
  const svg = host.querySelector('svg');
  const bars = Array.from(host.querySelectorAll('.nviz-chart__bar'));
  const zero = host.querySelector('.nviz-chart__zero-line');
  const details = host.querySelector('details');
  const rects = bars.map((barEl) => {
    const box = barEl.getBBox();
    return {
      y: box.y,
      h: box.height,
      cls: barEl.getAttribute('class'),
      tag: barEl.tagName
    };
  });
  return {
    role: svg && svg.getAttribute('role'),
    aria: svg && svg.getAttribute('aria-label'),
    barCount: bars.length,
    rects,
    zeroY: zero ? Number(zero.getAttribute('y1')) : null,
    bands: host.querySelectorAll('.nviz-chart__band').length,
    tags: Array.from(host.querySelectorAll('.nviz-chart__tag')).map((t) => t.textContent),
    focusBars: host.querySelectorAll('.nviz-chart__bar.is-focus').length,
    changedBars: host.querySelectorAll('.nviz-chart__bar.is-changed').length,
    targetPoint: !!inst.getTarget('point:0'),
    targetPointShape: inst.getTarget('point:0') && inst.getTarget('point:0').tagName,
    targetSeries: !!inst.getTarget('series:main'),
    targetSlice: inst.getTarget('slice:0'),
    targetMissing: inst.getTarget('series:nope'),
    details: !!details,
    summary: details && details.querySelector('summary').textContent,
    caption: details && details.querySelector('caption').textContent,
    rows: details ? details.querySelectorAll('tbody tr').length : 0,
    headers: details ? Array.from(details.querySelectorAll('thead th')).map((th) => th.textContent) : [],
    firstRow: details ? details.querySelector('tbody tr').textContent : '',
    tableText: details ? details.querySelector('tbody').textContent : '',
    viewBox: svg && svg.getAttribute('viewBox'),
    plotWidth: host.querySelector('.nviz-chart__plot').clientWidth,
    svgWidth: svg ? svg.getBoundingClientRect().width : 0,
    height: svg ? svg.getBoundingClientRect().height : 0
  };
});
check('bar: role img', bar.role === 'img', bar.role);
check('bar: aria has type/title/unit/range/focus/change',
  /柱状图/.test(bar.aria) && /季度销量/.test(bar.aria) && /万件/.test(bar.aria) &&
  /数值范围/.test(bar.aria) && /当前关注/.test(bar.aria) && /本步变化/.test(bar.aria), bar.aria);
check('bar: four bars', bar.barCount === 4, bar.barCount);
check('bar: zero baseline present', bar.zeroY !== null, String(bar.zeroY));
check('bar: mixed positive/negative around zero', bar.rects.filter((r) => r.y < bar.zeroY - 0.5).length === 3 &&
  bar.rects.filter((r) => Math.abs(r.y - bar.zeroY) < 1.5 && r.h > 1).length === 1, JSON.stringify(bar.rects));
check('bar: focus index has one bar', bar.focusBars === 1, bar.focusBars);
check('bar: changed index has one bar', bar.changedBars === 1, bar.changedBars);
check('bar: two category bands + two tags', bar.bands === 2 && bar.tags.length === 2, `${bar.bands}/${bar.tags.length}`);
check('bar: tag text has status and category', bar.tags.some((t) => /关注/.test(t) && /Q2/.test(t)) &&
  bar.tags.some((t) => /变化/.test(t) && /Q3/.test(t)), JSON.stringify(bar.tags));
check('bar: point target is element', bar.targetPoint && bar.targetPointShape === 'path', bar.targetPointShape);
check('bar: series target exists, slice target null', bar.targetSeries && bar.targetSlice === null, `${bar.targetSeries}/${bar.targetSlice}`);
check('bar: missing target null', bar.targetMissing === null, String(bar.targetMissing));
check('bar: data table summary/caption/headers/rows',
  bar.details && bar.summary === '数据表' && /季度销量/.test(bar.caption) && /万件/.test(bar.caption) &&
  bar.rows === 4 && bar.headers.join(',') === '类别,数值', JSON.stringify({ summary: bar.summary, caption: bar.caption, headers: bar.headers, rows: bar.rows }));
check('bar: table keeps negative value', /-12/.test(bar.tableText), bar.tableText);
check('bar: viewBox/width matches container', /^0 0 720 300$/.test(bar.viewBox) && near(bar.svgWidth, 720) && near(bar.plotWidth, 720),
  `${bar.viewBox} ${bar.svgWidth} ${bar.plotWidth}`);
check('bar: height option applied', near(bar.height, 300), bar.height);

// ---------------------------------------------------------------------------
// 2. update(): data replacement, no stale labels, multi-series switch, empty, focus-only.
// ---------------------------------------------------------------------------
let update = await page.evaluate(() => {
  const inst = window.__chart;
  const host = document.getElementById('host');
  inst.update({ data: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }] });
  const afterData = {
    bars: host.querySelectorAll('.nviz-chart__bar').length,
    textHasQ1: host.textContent.includes('Q1'),
    rows: host.querySelectorAll('tbody tr').length,
    point1: !!inst.getTarget('point:1'),
    bands: host.querySelectorAll('.nviz-chart__band').length
  };
  inst.update({
    series: [
      { key: 'a', label: '甲', values: [10, 20] },
      { key: 'b', label: '乙', values: [15, 5] }
    ],
    labels: ['X', 'Y']
  });
  const afterSeries = {
    bars: host.querySelectorAll('.nviz-chart__bar').length,
    groups: host.querySelectorAll('.nviz-chart__series').length,
    headers: Array.from(host.querySelectorAll('thead th')).map((th) => th.textContent),
    rows: host.querySelectorAll('tbody tr').length,
    target: !!inst.getTarget('series:a'),
    staleA: host.textContent.includes('Q1') || host.textContent.includes('Q2'),
    categories: Array.from(host.querySelectorAll('.nviz-chart__category-label')).map((n) => {
      const tspan = n.querySelector('tspan');
      return tspan ? tspan.textContent : n.textContent;
    }),
    aria: host.querySelector('svg') && host.querySelector('svg').getAttribute('aria-label')
  };
  inst.update({ data: [] });
  const afterEmpty = {
    empty: !!host.querySelector('.nviz-chart__empty'),
    svg: !!host.querySelector('svg'),
    table: !!host.querySelector('.nviz-chart__table'),
    text: host.textContent
  };
  inst.update({
    series: [
      { key: 'a', label: '甲', values: [10, 20] },
      { key: 'b', label: '乙', values: [15, 5] }
    ],
    labels: ['X', 'Y']
  });
  const details = host.querySelector('.nviz-chart__table');
  if (details) details.open = true;
  inst.update({ focus: { series: 'a' }, changed: { series: 'b' } });
  const afterFocus = {
    detailsOpen: !!host.querySelector('.nviz-chart__table') && host.querySelector('.nviz-chart__table').open,
    rows: host.querySelectorAll('tbody tr').length,
    badges: Array.from(host.querySelectorAll('.nviz-chart__badge')).map((n) => n.textContent),
    focusSeries: host.querySelectorAll('.nviz-chart__series.is-focus').length,
    changedSeries: host.querySelectorAll('.nviz-chart__series.is-changed').length,
    dataStillThere: host.querySelectorAll('.nviz-chart__bar').length === 4
  };
  return { afterData, afterSeries, afterEmpty, afterFocus };
});
check('update data: replaces bars/rows and removes old labels',
  update.afterData.bars === 2 && !update.afterData.textHasQ1 && update.afterData.rows === 2 && update.afterData.point1,
  JSON.stringify(update.afterData));
check('update data: clears old focus when not supplied', update.afterData.bands === 0, update.afterData.bands);
check('update series: 2x2 bars, 2 groups, table headers update, no stale data',
  update.afterSeries.bars === 4 && update.afterSeries.groups === 2 &&
  update.afterSeries.rows === 2 && update.afterSeries.headers.join(',') === '类别,甲,乙' &&
  update.afterSeries.target && !update.afterSeries.staleA, JSON.stringify(update.afterSeries));
check('update series: labels/aria updated', update.afterSeries.categories.join(',') === 'X,Y' &&
  /2 个系列，2 个类别/.test(update.afterSeries.aria), update.afterSeries.aria);
check('update empty: visible empty state, no fake svg/table',
  update.afterEmpty.empty && !update.afterEmpty.svg && !update.afterEmpty.table, JSON.stringify(update.afterEmpty));
check('focus-only update: keeps data, table open state and focus/changed series',
  update.afterFocus.detailsOpen && update.afterFocus.rows === 2 && update.afterFocus.dataStillThere &&
  update.afterFocus.badges.length === 2 && update.afterFocus.focusSeries === 1 && update.afterFocus.changedSeries === 1,
  JSON.stringify(update.afterFocus));

// ---------------------------------------------------------------------------
// 3. Line: paths, markers, dash, series focus, point change, target.
// ---------------------------------------------------------------------------
let line = await page.evaluate(() => {
  const host = document.getElementById('host');
  const old = window.__chart;
  if (old) old.destroy();
  host.replaceChildren();
  const inst = window.__chart = NoteViz.Chart.mount(host, {
    type: 'line',
    series: [
      { key: 'a', label: '线上', values: [20, 34, 28, 44] },
      { key: 'b', label: '门店', values: [14, 22, 31, 26] }
    ],
    labels: ['Q1', 'Q2', 'Q3', 'Q4'],
    label: '渠道走势',
    table: true,
    focus: { series: 'a' },
    changed: { series: 'b', index: 2 }
  });
  const before = {
    paths: host.querySelectorAll('.nviz-chart__line').length,
    markers: host.querySelectorAll('.nviz-chart__marker').length,
    rings: host.querySelectorAll('.nviz-chart__focus-ring').length,
    tags: host.querySelectorAll('.nviz-chart__tag').length,
    dash: host.querySelectorAll('.nviz-chart__line')[1].getAttribute('stroke-dasharray'),
    focusSeries: host.querySelectorAll('.nviz-chart__series.is-focus').length,
    changedSeries: host.querySelectorAll('.nviz-chart__series.is-changed').length,
    rows: host.querySelectorAll('tbody tr').length,
    headers: Array.from(host.querySelectorAll('thead th')).map((th) => th.textContent),
    pointTarget: !!inst.getTarget('point:2'),
    seriesTarget: !!inst.getTarget('series:b'),
    markersNamed: Array.from(host.querySelectorAll('.nviz-chart__marker-shape')).map((n) => n.tagName),
    aria: host.querySelector('svg').getAttribute('aria-label')
  };
  inst.update({ focus: { series: 'a', index: 1 }, changed: { series: 'b', index: 2 } });
  const after = {
    rings: host.querySelectorAll('.nviz-chart__focus-ring').length,
    tags: Array.from(host.querySelectorAll('.nviz-chart__tag')).map((n) => n.textContent),
    focusRings: host.querySelectorAll('.nviz-chart__focus-ring.is-focus').length,
    changedRings: host.querySelectorAll('.nviz-chart__focus-ring.is-changed').length
  };
  inst.update({ focus: { series: 'a', index: 1 }, changed: { series: 'a', index: 1 } });
  const combined = {
    rings: host.querySelectorAll('.nviz-chart__focus-ring').length,
    ringClass: host.querySelector('.nviz-chart__focus-ring') && host.querySelector('.nviz-chart__focus-ring').getAttribute('class'),
    tags: Array.from(host.querySelectorAll('.nviz-chart__tag')).map((n) => n.textContent),
    markerClass: host.querySelector('.nviz-chart__marker.is-focus') && host.querySelector('.nviz-chart__marker.is-focus').getAttribute('class')
  };
  return { before, after, combined };
});
check('line: two paths, eight markers, dashed second series',
  line.before.paths === 2 && line.before.markers === 8 && Boolean(line.before.dash), JSON.stringify(line.before));
check('line: series focus + point change rings, legend badge',
  line.before.rings === 5 && line.before.tags === 1 && line.before.focusSeries === 1 && line.before.changedSeries === 0,
  JSON.stringify(line.before));
check('line: table rows/headers/targets',
  line.before.rows === 4 && line.before.headers.join(',') === '类别,线上,门店' &&
  line.before.pointTarget && line.before.seriesTarget, JSON.stringify(line.before));
check('line: marker shapes differ by series', line.before.markersNamed.includes('circle') && line.before.markersNamed.includes('rect'),
  JSON.stringify(line.before.markersNamed));
check('line: point focus/changed yields two composite rings + tags',
  line.after.rings === 2 && line.after.focusRings === 1 && line.after.changedRings === 1 &&
  line.after.tags.length === 2, JSON.stringify(line.after));
check('line: same object combines focus+changed into one ring and one tag',
  line.combined.rings === 1 && /is-focus/.test(line.combined.ringClass) && /is-changed/.test(line.combined.ringClass) &&
  line.combined.tags.length === 1 && /关注·变化/.test(line.combined.tags[0]) &&
  /is-focus/.test(line.combined.markerClass) && /is-changed/.test(line.combined.markerClass),
  JSON.stringify(line.combined));
check('line: aria has range and focus/change', /折线图/.test(line.before.aria) && /数值范围/.test(line.before.aria),
  line.before.aria);

// ---------------------------------------------------------------------------
// 4. Scatter: 2D axes, point labels, target, table, focus/change tags.
// ---------------------------------------------------------------------------
let scatter = await page.evaluate(() => {
  const host = document.getElementById('host');
  window.__chart.destroy();
  host.replaceChildren();
  const inst = window.__chart = NoteViz.Chart.mount(host, {
    type: 'scatter',
    series: [
      { key: 'a', label: 'A 组', points: [{ x: 1, y: 4, label: '甲' }, { x: 2, y: 7, label: '乙' }] },
      { key: 'b', label: 'B 组', points: [{ x: 1.5, y: 3 }, { x: 3, y: 6, label: '丙' }] }
    ],
    label: '两组测量',
    xLabel: '投入',
    yLabel: '产出',
    unit: '件',
    table: true,
    focus: { series: 'a', index: 1 },
    changed: { index: 0 }
  });
  const svg = host.querySelector('svg');
  const tickLabels = Array.from(host.querySelectorAll('.nviz-chart__tick-label')).map((n) => n.textContent);
  const axisTitles = Array.from(host.querySelectorAll('.nviz-chart__axis-title')).map((n) => n.textContent);
  return {
    markers: host.querySelectorAll('.nviz-chart__marker').length,
    rings: host.querySelectorAll('.nviz-chart__focus-ring').length,
    tags: Array.from(host.querySelectorAll('.nviz-chart__tag')).map((n) => n.textContent),
    groups: host.querySelectorAll('.nviz-chart__series').length,
    tickLabels,
    axisTitles,
    gridLines: host.querySelectorAll('.nviz-chart__grid-line').length,
    pointTarget: !!inst.getTarget('point:0'),
    seriesTarget: !!inst.getTarget('series:a'),
    sliceTarget: inst.getTarget('slice:0'),
    rows: host.querySelectorAll('tbody tr').length,
    headers: Array.from(host.querySelectorAll('thead th')).map((n) => n.textContent),
    firstRow: host.querySelector('tbody tr') && host.querySelector('tbody tr').textContent,
    aria: svg && svg.getAttribute('aria-label'),
    pointLabels: Array.from(host.querySelectorAll('.nviz-chart__point-label')).map((n) => n.textContent)
  };
});
check('scatter: four markers and both series groups', scatter.markers === 4 && scatter.groups === 2, `${scatter.markers}/${scatter.groups}`);
check('scatter: x/y axes with ticks and titles', scatter.tickLabels.length >= 6 &&
  scatter.axisTitles.includes('投入') && scatter.axisTitles.includes('产出') && scatter.gridLines >= 4,
  JSON.stringify({ ticks: scatter.tickLabels, titles: scatter.axisTitles, grid: scatter.gridLines }));
check('scatter: category + point emphasis combines into rings/tags',
  scatter.rings === 3 && scatter.tags.length === 2 &&
  scatter.tags.some((t) => /关注/.test(t)) && scatter.tags.some((t) => /变化/.test(t)), JSON.stringify(scatter.tags));
check('scatter: targets and table', scatter.pointTarget && scatter.seriesTarget && scatter.sliceTarget === null &&
  scatter.rows === 4 && scatter.headers.join(',') === '数据点,投入,产出,标签', JSON.stringify(scatter));
check('scatter: aria has x/y ranges/unit', /散点图/.test(scatter.aria) && /x 范围/.test(scatter.aria) &&
  /y 范围/.test(scatter.aria) && /件/.test(scatter.aria), scatter.aria);
check('scatter: all point labels shown for single series? (2 series -> labels only when space)',
  Array.isArray(scatter.pointLabels), JSON.stringify(scatter.pointLabels));

// ---------------------------------------------------------------------------
// 5. Pie: slices, legend values/percent, table, targets, combined states.
// ---------------------------------------------------------------------------
let pie = await page.evaluate(() => {
  const host = document.getElementById('host');
  window.__chart.destroy();
  host.replaceChildren();
  const inst = window.__chart = NoteViz.Chart.mount(host, {
    type: 'pie',
    data: [
      { label: '直营', value: 48 },
      { label: '加盟', value: 31 },
      { label: '电商', value: 26 },
      { label: '其他', value: 9 }
    ],
    label: '渠道占比',
    unit: '万件',
    table: true,
    focus: { index: 1 },
    changed: { index: 2 }
  });
  const slices = host.querySelectorAll('.nviz-chart__slice');
  const legendItems = Array.from(host.querySelectorAll('.nviz-chart__legend-item')).map((n) => n.textContent);
  const firstRow = host.querySelector('tbody tr');
  const tableHeader = Array.from(host.querySelectorAll('thead th')).map((th) => th.textContent);
  const result = {
    slices: slices.length,
    legend: legendItems,
    badges: host.querySelectorAll('.nviz-chart__badge').length,
    tags: Array.from(host.querySelectorAll('.nviz-chart__tag')).map((n) => n.textContent),
    focusSlices: host.querySelectorAll('.nviz-chart__slice.is-focus').length,
    changedSlices: host.querySelectorAll('.nviz-chart__slice.is-changed').length,
    sliceTargets: [0, 1, 2, 3].map((i) => !!inst.getTarget('slice:' + i)),
    pointTarget: inst.getTarget('point:1'),
    seriesTarget: !!inst.getTarget('series:main'),
    rows: host.querySelectorAll('tbody tr').length,
    tableHeader,
    firstRow: firstRow ? firstRow.textContent : '',
    percentCells: Array.from(host.querySelectorAll('tbody tr')).map((tr) => tr.children[2].textContent),
    aria: host.querySelector('svg').getAttribute('aria-label'),
    sliceLabels: Array.from(host.querySelectorAll('.nviz-chart__slice-label')).map((n) => n.textContent),
    tableCaption: host.querySelector('caption') && host.querySelector('caption').textContent
  };
  inst.update({ data: [{ label: '负值', value: -4 }, { label: '零值', value: 0 }] });
  const negative = {
    empty: !!host.querySelector('.nviz-chart__empty'),
    note: host.querySelector('.nviz-chart__note') && host.querySelector('.nviz-chart__note').textContent,
    table: !!host.querySelector('.nviz-chart__table'),
    rows: host.querySelectorAll('tbody tr').length,
    sliceTarget: inst.getTarget('slice:0')
  };
  return { result, negative };
});
check('pie: four slices + four legend items with values/percent',
  pie.result.slices === 4 && pie.result.legend.length === 4 &&
  pie.result.legend.every((t) => /%/.test(t)), JSON.stringify(pie.result.legend));
check('pie: focus/changed slices and legend badges',
  pie.result.focusSlices === 1 && pie.result.changedSlices === 1 && pie.result.badges === 2 &&
  pie.result.tags.length === 2, JSON.stringify({ f: pie.result.focusSlices, c: pie.result.changedSlices, b: pie.result.badges, t: pie.result.tags }));
check('pie: slice targets and series target, no point target',
  pie.result.sliceTargets.every(Boolean) && pie.result.seriesTarget && pie.result.pointTarget === null,
  JSON.stringify({ slices: pie.result.sliceTargets, series: pie.result.seriesTarget, point: pie.result.pointTarget }));
check('pie: table rows/headers/percent values',
  pie.result.rows === 4 && pie.result.tableHeader.join(',') === '类别,数值,占比' &&
  pie.result.percentCells.every((t) => /%/.test(t)) && /万件/.test(pie.result.tableCaption),
  JSON.stringify({ rows: pie.result.rows, head: pie.result.tableHeader, pct: pie.result.percentCells, cap: pie.result.tableCaption }));
check('pie: aria has total/slices/unit', /饼图/.test(pie.result.aria) && /总量/.test(pie.result.aria) && /万件/.test(pie.result.aria),
  pie.result.aria);
check('pie: percent labels visible for large slices', pie.result.sliceLabels.length >= 3, JSON.stringify(pie.result.sliceLabels));
check('pie negative: empty state + note + table, no slice target',
  pie.negative.empty && /负值/.test(pie.negative.note || '') && pie.negative.table &&
  pie.negative.rows === 2 && pie.negative.sliceTarget === null, JSON.stringify(pie.negative));

// Zero slice should not fabricate a slice; legend still lists it.
let pieZero = await page.evaluate(() => {
  const host = document.getElementById('host');
  window.__chart.destroy();
  host.replaceChildren();
  const inst = window.__chart = NoteViz.Chart.mount(host, {
    type: 'pie',
    data: [{ label: '有', value: 5 }, { label: '零', value: 0 }, { label: '也有', value: 5 }],
    table: true
  });
  return {
    slices: host.querySelectorAll('.nviz-chart__slice').length,
    legend: host.querySelectorAll('.nviz-chart__legend-item').length,
    note: host.querySelector('.nviz-chart__note') && host.querySelector('.nviz-chart__note').textContent,
    slice1: inst.getTarget('slice:1'),
    slice0: !!inst.getTarget('slice:0'),
    slice2: !!inst.getTarget('slice:2')
  };
});
check('pie zero: two drawn slices, three legend rows, note, zero target null',
  pieZero.slices === 2 && pieZero.legend === 3 && /0/.test(pieZero.note || '') &&
  pieZero.slice1 === null && pieZero.slice0 && pieZero.slice2, JSON.stringify(pieZero));

// ---------------------------------------------------------------------------
// 6. Long labels + narrow container: no page overflow, text wraps, full title.
// ---------------------------------------------------------------------------
let narrow = await page.evaluate(() => {
  const host = document.getElementById('host');
  window.__chart.destroy();
  host.replaceChildren();
  host.style.width = '280px';
  const inst = window.__chart = NoteViz.Chart.mount(host, {
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
  });
  const svg = host.querySelector('svg');
  const plot = host.querySelector('.nviz-chart__plot');
  const categoryTexts = Array.from(host.querySelectorAll('.nviz-chart__category-label'));
  const titles = categoryTexts.map((n) => n.querySelector('title') && n.querySelector('title').textContent);
  const details = host.querySelector('.nviz-chart__table');
  if (details) details.open = true;
  const scroll = host.querySelector('.nviz-chart__table-scroll');
  return {
    rootWidth: host.querySelector('.nviz-chart').getBoundingClientRect().width,
    plotWidth: plot.getBoundingClientRect().width,
    viewBox: svg.getAttribute('viewBox'),
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    categoryCount: categoryTexts.length,
    lineCounts: categoryTexts.map((n) => n.querySelectorAll('tspan').length),
    titles,
    tableVisible: details && details.open,
    tableOverflowX: scroll ? scroll.scrollWidth - scroll.clientWidth : null,
    tableRows: host.querySelectorAll('tbody tr').length,
    target: !!inst.getTarget('point:0')
  };
});
check('narrow: root/plot fit 280px and no page horizontal overflow',
  narrow.rootWidth <= 281 && narrow.plotWidth <= 281 && narrow.pageOverflow <= 2,
  JSON.stringify({ root: narrow.rootWidth, plot: narrow.plotWidth, overflow: narrow.pageOverflow }));
check('narrow: viewBox follows container width', /^0 0 280 260$/.test(narrow.viewBox), narrow.viewBox);
check('narrow: category labels wrap and keep full title',
  narrow.categoryCount === 4 && narrow.lineCounts.some((n) => n > 1) &&
  narrow.titles.includes('非常长的中文类别标签一') && narrow.titles.includes('A very long English label two'),
  JSON.stringify({ lines: narrow.lineCounts, titles: narrow.titles }));
check('narrow: table stays readable via local scroll, rows intact',
  narrow.tableVisible && narrow.tableRows === 4 && (narrow.tableOverflowX === null || narrow.tableOverflowX >= 0),
  JSON.stringify(narrow));

// ---------------------------------------------------------------------------
// 7. Tall chart scroll; animate update-only; reduced motion.
// ---------------------------------------------------------------------------
let tall = await page.evaluate(() => {
  const host = document.getElementById('host');
  window.__chart.destroy();
  host.replaceChildren();
  host.style.width = '720px';
  const inst = window.__chart = NoteViz.Chart.mount(host, {
    type: 'bar',
    data: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }],
    height: 800,
    animate: true,
    table: true
  });
  const plot = host.querySelector('.nviz-chart__plot');
  return {
    tallClass: host.querySelector('.nviz-chart').classList.contains('nviz-chart--tall'),
    tabindex: plot.getAttribute('tabindex'),
    maxHeight: getComputedStyle(plot).maxHeight,
    clientHeight: plot.clientHeight,
    scrollHeight: plot.scrollHeight,
    animatingAtMount: host.querySelector('.nviz-chart').classList.contains('is-animating')
  };
});
check('tall: tall class, focusable local vertical scroll', tall.tallClass && tall.tabindex === '0' &&
  tall.scrollHeight > tall.clientHeight && tall.maxHeight !== 'none',
  JSON.stringify(tall));
check('animate: no animation at mount', !tall.animatingAtMount);

let animation = await page.evaluate(async () => {
  const host = document.getElementById('host');
  const inst = window.__chart;
  inst.update({ data: [{ label: 'A', value: 3 }, { label: 'B', value: 4 }] });
  const immediate = host.querySelector('.nviz-chart').classList.contains('is-animating');
  await new Promise((resolve) => setTimeout(resolve, 620));
  const later = host.querySelector('.nviz-chart').classList.contains('is-animating');
  return { immediate, later, bars: host.querySelectorAll('.nviz-chart__bar').length };
});
check('animate: class only during an update, then removed', animation.immediate && !animation.later,
  JSON.stringify(animation));

await page.emulateMedia({ reducedMotion: 'reduce' });
let reduced = await page.evaluate(() => {
  const host = document.getElementById('host');
  const inst = window.__chart;
  inst.update({ data: [{ label: 'A', value: 7 }, { label: 'B', value: 8 }] });
  return {
    animating: host.querySelector('.nviz-chart').classList.contains('is-animating'),
    bars: host.querySelectorAll('.nviz-chart__bar').length
  };
});
await page.emulateMedia({ reducedMotion: 'no-preference' });
check('reduced motion: update does not build animation', !reduced.animating && reduced.bars === 2, JSON.stringify(reduced));

// ---------------------------------------------------------------------------
// 8. valueFormat, single-point line, series color override, empty data defaults.
// ---------------------------------------------------------------------------
let variants = await page.evaluate(() => {
  const host = document.getElementById('host');
  window.__chart.destroy();
  host.replaceChildren();
  const inst = window.__chart = NoteViz.Chart.mount(host, {
    type: 'line',
    data: [{ label: '唯一', value: 42 }],
    label: '单点',
    table: true,
    valueFormat: function (value) { return value + ' 元'; },
    colors: ['#8e2a68']
  });
  const single = {
    markers: host.querySelectorAll('.nviz-chart__marker').length,
    valueLabel: host.querySelector('.nviz-chart__value-label') && host.querySelector('.nviz-chart__value-label').textContent,
    cell: host.querySelector('tbody td') && host.querySelector('tbody td').textContent,
    lineStroke: host.querySelector('.nviz-chart__line') && host.querySelector('.nviz-chart__line').getAttribute('stroke'),
    hasLegend: !!host.querySelector('.nviz-chart__legend'),
    rows: host.querySelectorAll('tbody tr').length,
    target: !!inst.getTarget('point:0')
  };
  inst.update({
    series: [
      { key: 'a', label: '甲', values: [1, 2] },
      { key: 'b', label: '乙', values: [2, 3] }
    ],
    labels: ['X', 'Y'],
    colors: ['#8e2a68', '#b54708']
  });
  const multi = {
    legendItems: host.querySelectorAll('.nviz-chart__legend-item').length,
    legendStrokes: Array.from(host.querySelectorAll('.nviz-chart__swatch-svg line')).map((n) => n.getAttribute('stroke')),
    lineStrokes: Array.from(host.querySelectorAll('.nviz-chart__line')).map((n) => n.getAttribute('stroke')),
    valueLabels: Array.from(host.querySelectorAll('.nviz-chart__value-label')).map((n) => n.textContent)
  };
  inst.update({
    data: [
      { label: 'A', value: 1 },
      { label: 'B', value: 5 },
      { label: 'C', value: 3 },
      { label: 'D', value: 2 },
      { label: 'E', value: 4 }
    ],
    series: null,
    labels: null,
    valueFormat: null
  });
  const selective = {
    labels: Array.from(host.querySelectorAll('.nviz-chart__value-label')).map((n) => n.textContent),
    legend: !!host.querySelector('.nviz-chart__legend')
  };
  inst.update({ data: [] });
  const empty = { empty: !!host.querySelector('.nviz-chart__empty'), table: !!host.querySelector('.nviz-chart__table') };
  return { single, multi, selective, empty };
});
check('valueFormat: applies to endpoint label and table', variants.single.valueLabel === '42 元' &&
  variants.single.cell === '42 元', JSON.stringify(variants.single));
check('single point line: one marker, table row, target, no redundant legend',
  variants.single.markers === 1 && variants.single.rows === 1 && variants.single.target &&
  !variants.single.hasLegend, JSON.stringify(variants.single));
check('colors override: single line and multi-series legend use custom colors',
  variants.single.lineStroke === '#8e2a68' &&
  variants.multi.legendItems === 2 &&
  variants.multi.legendStrokes.includes('#8e2a68') && variants.multi.legendStrokes.includes('#b54708') &&
  variants.multi.lineStrokes.includes('#8e2a68') && variants.multi.lineStrokes.includes('#b54708'),
  JSON.stringify({ single: variants.single.lineStroke, multi: variants.multi }));
check('single-series line: labels only endpoint and extremes, never every point',
  variants.selective.labels.length === 3 && variants.selective.labels.includes('1') &&
  variants.selective.labels.includes('5') && variants.selective.labels.includes('4') &&
  !variants.selective.legend, JSON.stringify(variants.selective));
check('empty data: empty state, no fake table', variants.empty.empty && !variants.empty.table, JSON.stringify(variants.empty));

// ---------------------------------------------------------------------------
// 8b. Zero-value bar and single-slice pie edge cases.
// ---------------------------------------------------------------------------
let edges = await page.evaluate(() => {
  const host = document.getElementById('host');
  window.__chart.destroy();
  host.replaceChildren();
  let inst = window.__chart = NoteViz.Chart.mount(host, {
    type: 'bar',
    data: [{ label: '零值', value: 0 }, { label: '正值', value: 5 }],
    label: '零值柱',
    table: true,
    focus: { index: 0 },
    changed: { index: 1 }
  });
  const bars = Array.from(host.querySelectorAll('.nviz-chart__bar'));
  const zeroBar = bars[0];
  const zero = {
    bars: bars.length,
    zeroHeight: zeroBar && Number(zeroBar.getAttribute('height')),
    zeroClass: zeroBar && zeroBar.getAttribute('class'),
    labels: Array.from(host.querySelectorAll('.nviz-chart__value-label')).map((n) => n.textContent),
    table: host.querySelector('tbody') && host.querySelector('tbody').textContent,
    target: !!inst.getTarget('point:0')
  };
  inst.destroy();
  host.replaceChildren();
  inst = window.__chart = NoteViz.Chart.mount(host, {
    type: 'pie',
    data: [{ label: '唯一渠道', value: 5 }],
    label: '单扇区饼图',
    table: true
  });
  const path = host.querySelector('.nviz-chart__slice');
  const singlePie = {
    slices: host.querySelectorAll('.nviz-chart__slice').length,
    d: path && path.getAttribute('d'),
    labels: Array.from(host.querySelectorAll('.nviz-chart__slice-label')).map((n) => n.textContent),
    legend: host.querySelector('.nviz-chart__legend-item') && host.querySelector('.nviz-chart__legend-item').textContent,
    percentCell: host.querySelector('tbody tr') && host.querySelector('tbody tr').children[2].textContent,
    target: !!inst.getTarget('slice:0')
  };
  return { zero, singlePie };
});
check('bar zero: 2px baseline stub, value label and table keep 0',
  edges.zero.bars === 2 && edges.zero.zeroHeight === 2 && /is-focus/.test(edges.zero.zeroClass) &&
  edges.zero.labels.includes('0') && /\b0\b/.test(edges.zero.table) && edges.zero.target,
  JSON.stringify(edges.zero));
check('pie single slice: one full-circle slice, 100% legend/table, target',
  edges.singlePie.slices === 1 && /^M .* A .* A .* Z$/.test(edges.singlePie.d || '') &&
  edges.singlePie.labels.includes('100%') && /100%/.test(edges.singlePie.legend || '') &&
  edges.singlePie.percentCell === '100%' && edges.singlePie.target,
  JSON.stringify(edges.singlePie));

// ---------------------------------------------------------------------------
// 9. destroy: removes root, clears targets, no leftovers.
// ---------------------------------------------------------------------------
let destroyed = await page.evaluate(() => {
  const host = document.getElementById('host');
  host.replaceChildren();
  const inst = window.__chart = NoteViz.Chart.mount(host, {
    type: 'bar',
    data: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }],
    label: '销毁测试'
  });
  const before = host.querySelectorAll('.nviz-chart').length;
  const targetBefore = !!inst.getTarget('series:main');
  inst.destroy();
  inst.destroy();
  const after = {
    before,
    targetBefore,
    hostChildren: host.children.length,
    targets: inst.getTarget('series:main'),
    pageCharts: document.querySelectorAll('.nviz-chart').length,
    bodyFloating: document.querySelectorAll('.hnv-floating').length
  };
  inst.update({ data: [{ label: 'X', value: 1 }] });
  after.targetsAfterUpdate = inst.getTarget('series:main');
  after.hostChildrenAfterUpdate = host.children.length;
  return after;
});
check('destroy: root removed, targets null, update no-op, no leftovers',
  destroyed.before === 1 && destroyed.targetBefore && destroyed.hostChildren === 0 &&
  destroyed.targets === null && destroyed.pageCharts === 0 && destroyed.bodyFloating === 0 &&
  destroyed.targetsAfterUpdate === null && destroyed.hostChildrenAfterUpdate === 0,
  JSON.stringify(destroyed));

// ---------------------------------------------------------------------------
// 10. Multiple independent instances + aria/table default off.
// ---------------------------------------------------------------------------
let multi = await page.evaluate(() => {
  const host = document.getElementById('host');
  const host2 = document.getElementById('host2');
  host.replaceChildren();
  host2.replaceChildren();
  host.style.width = '720px';
  const a = NoteViz.Chart.mount(host, { type: 'bar', data: [{ label: 'A', value: 1 }], label: 'A' });
  const b = NoteViz.Chart.mount(host2, { type: 'pie', data: [{ label: 'B', value: 2 }], label: 'B' });
  const result = {
    charts: document.querySelectorAll('.nviz-chart').length,
    aBars: host.querySelectorAll('.nviz-chart__bar').length,
    bSlices: host2.querySelectorAll('.nviz-chart__slice').length,
    aTable: !!host.querySelector('.nviz-chart__table'),
    bTable: !!host2.querySelector('.nviz-chart__table'),
    aRole: host.querySelector('svg') && host.querySelector('svg').getAttribute('role'),
    bRole: host2.querySelector('svg') && host2.querySelector('svg').getAttribute('role'),
    aTarget: !!a.getTarget('point:0'),
    bTarget: !!b.getTarget('slice:0')
  };
  a.destroy();
  result.afterADestroy = {
    charts: document.querySelectorAll('.nviz-chart').length,
    bSlices: host2.querySelectorAll('.nviz-chart__slice').length,
    bTarget: !!b.getTarget('slice:0')
  };
  b.destroy();
  result.afterBothDestroy = document.querySelectorAll('.nviz-chart').length;
  host.style.width = '';
  return result;
});
check('multi: independent instances, table default off',
  multi.charts === 2 && multi.aBars === 1 && multi.bSlices === 1 && !multi.aTable && !multi.bTable &&
  multi.aRole === 'img' && multi.bRole === 'img' && multi.aTarget && multi.bTarget,
  JSON.stringify(multi));
check('multi: destroy one leaves the other',
  multi.afterADestroy.charts === 1 && multi.afterADestroy.bSlices === 1 && multi.afterADestroy.bTarget &&
  multi.afterBothDestroy === 0, JSON.stringify(multi));

// ---------------------------------------------------------------------------
// 11. Gallery demo: real mount, static by default, all controls, cleanup.
// ---------------------------------------------------------------------------
let demoInitial = await page.evaluate(() => {
  const host = document.getElementById('demo');
  host.replaceChildren();
  window.__demo = window.NoteGalleryDemos.V01(host);
  const demoRoot = host.querySelector('.nviz-chart-demo');
  const chartRoot = host.querySelector('.nviz-chart');
  const details = host.querySelector('.nviz-chart__table');
  return {
    hasDemo: !!demoRoot,
    chartType: chartRoot && chartRoot.getAttribute('data-type'),
    bars: host.querySelectorAll('.nviz-chart__bar').length,
    table: !!details,
    tableOpen: !!(details && details.open),
    status: host.querySelector('.nviz-chart-demo__status') && host.querySelector('.nviz-chart-demo__status').textContent,
    buttons: Array.from(host.querySelectorAll('button')).map((button) => button.textContent),
    pressedType: host.querySelector('button[aria-pressed="true"]') && host.querySelector('button[aria-pressed="true"]').textContent,
    tags: host.querySelectorAll('.nviz-chart__tag').length,
    animating: !!(chartRoot && chartRoot.classList.contains('is-animating'))
  };
});
check('demo: mounts real bar chart with data table open and static',
  demoInitial.hasDemo && demoInitial.chartType === 'bar' && demoInitial.bars === 8 &&
  demoInitial.table && demoInitial.tableOpen && !demoInitial.animating,
  JSON.stringify(demoInitial));
check('demo: controls cover type/data/emphasis/table and status is readable',
  demoInitial.buttons.includes('柱状图') && demoInitial.buttons.includes('折线图') &&
  demoInitial.buttons.includes('散点图') && demoInitial.buttons.includes('饼图') &&
  demoInitial.buttons.includes('换数据') && demoInitial.buttons.includes('长标签') &&
  demoInitial.buttons.includes('负值') && demoInitial.buttons.includes('空数据') &&
  /柱状图/.test(demoInitial.status) && /数据表开/.test(demoInitial.status),
  JSON.stringify({ buttons: demoInitial.buttons, status: demoInitial.status }));

await page.locator('#demo').getByRole('button', { name: '折线图', exact: true }).click();
await page.waitForTimeout(60);
let demoLine = await page.evaluate(() => {
  const host = document.getElementById('demo');
  return {
    type: host.querySelector('.nviz-chart').getAttribute('data-type'),
    paths: host.querySelectorAll('.nviz-chart__line').length,
    status: host.querySelector('.nviz-chart-demo__status').textContent,
    pressed: host.querySelector('button[aria-pressed="true"]').textContent
  };
});
check('demo: switches to line chart', demoLine.type === 'line' && demoLine.paths === 2 && demoLine.pressed === '折线图',
  JSON.stringify(demoLine));

await page.locator('#demo').getByRole('button', { name: '散点图', exact: true }).click();
await page.waitForTimeout(60);
let demoScatter = await page.evaluate(() => {
  const host = document.getElementById('demo');
  return {
    type: host.querySelector('.nviz-chart').getAttribute('data-type'),
    markers: host.querySelectorAll('.nviz-chart__marker').length,
    status: host.querySelector('.nviz-chart-demo__status').textContent
  };
});
check('demo: switches to scatter chart', demoScatter.type === 'scatter' && demoScatter.markers === 6,
  JSON.stringify(demoScatter));

await page.locator('#demo').getByRole('button', { name: '饼图', exact: true }).click();
await page.waitForTimeout(60);
let demoPie = await page.evaluate(() => {
  const host = document.getElementById('demo');
  return {
    type: host.querySelector('.nviz-chart').getAttribute('data-type'),
    slices: host.querySelectorAll('.nviz-chart__slice').length,
    status: host.querySelector('.nviz-chart-demo__status').textContent
  };
});
check('demo: switches to pie chart', demoPie.type === 'pie' && demoPie.slices === 4, JSON.stringify(demoPie));

await page.locator('#demo').getByRole('button', { name: '长标签', exact: true }).click();
await page.waitForTimeout(60);
let demoLong = await page.evaluate(() => {
  const host = document.getElementById('demo');
  return {
    legend: Array.from(host.querySelectorAll('.nviz-chart__legend-label')).map((n) => n.textContent),
    status: host.querySelector('.nviz-chart-demo__status').textContent,
    rows: host.querySelectorAll('tbody tr').length
  };
});
check('demo: long-label data updates legend and table', demoLong.legend.some((label) => /非常长的直营/.test(label)) &&
  demoLong.rows === 3 && /长标签/.test(demoLong.status), JSON.stringify(demoLong));

await page.locator('#demo').getByRole('button', { name: '换数据', exact: true }).click();
await page.waitForTimeout(60);
let demoAlt = await page.evaluate(() => {
  const host = document.getElementById('demo');
  return {
    legend: Array.from(host.querySelectorAll('.nviz-chart__legend-label')).map((n) => n.textContent),
    rows: host.querySelectorAll('tbody tr').length,
    status: host.querySelector('.nviz-chart-demo__status').textContent,
    pressed: host.querySelector('button[aria-pressed="true"][class~="nviz-chart-demo__button"]') &&
      host.querySelector('button[aria-pressed="true"][class~="nviz-chart-demo__button"]').textContent
  };
});
check('demo: replace data button changes dataset', demoAlt.legend.includes('华东') && demoAlt.rows === 4 &&
  /另一组数据/.test(demoAlt.status), JSON.stringify(demoAlt));

await page.locator('#demo').getByRole('button', { name: '负值', exact: true }).click();
await page.waitForTimeout(60);
let demoNegative = await page.evaluate(() => {
  const host = document.getElementById('demo');
  const zero = host.querySelector('.nviz-chart__zero-line');
  const bars = Array.from(host.querySelectorAll('.nviz-chart__bar'));
  const zeroY = zero ? Number(zero.getAttribute('y1')) : null;
  const negativeBars = bars.filter((bar) => {
    const box = bar.getBBox();
    return Math.abs(box.y - zeroY) < 1.5 && box.height > 1;
  });
  return {
    type: host.querySelector('.nviz-chart').getAttribute('data-type'),
    bars: bars.length,
    zeroY,
    negativeBars: negativeBars.length,
    status: host.querySelector('.nviz-chart-demo__status').textContent,
    pressedBar: host.querySelector('button[aria-pressed="true"]').textContent
  };
});
check('demo: negative button switches pie to bar and draws below zero',
  demoNegative.type === 'bar' && demoNegative.bars === 8 && demoNegative.zeroY !== null &&
  demoNegative.negativeBars >= 3 && demoNegative.pressedBar === '柱状图' && /含负值/.test(demoNegative.status),
  JSON.stringify(demoNegative));

await page.locator('#demo').getByRole('button', { name: '空数据', exact: true }).click();
await page.waitForTimeout(60);
let demoEmpty = await page.evaluate(() => {
  const host = document.getElementById('demo');
  return {
    empty: !!host.querySelector('.nviz-chart__empty'),
    svg: !!host.querySelector('svg'),
    table: !!host.querySelector('.nviz-chart__table'),
    disabledFocus: host.querySelectorAll('button:disabled').length,
    status: host.querySelector('.nviz-chart-demo__status').textContent
  };
});
check('demo: empty data shows empty state and disables emphasis controls',
  demoEmpty.empty && !demoEmpty.svg && !demoEmpty.table && demoEmpty.disabledFocus >= 3 &&
  /空数据/.test(demoEmpty.status), JSON.stringify(demoEmpty));

await page.locator('#demo').getByRole('button', { name: '折线图', exact: true }).click();
await page.waitForTimeout(60);
let demoRecover = await page.evaluate(() => {
  const host = document.getElementById('demo');
  return {
    type: host.querySelector('.nviz-chart').getAttribute('data-type'),
    empty: !!host.querySelector('.nviz-chart__empty'),
    paths: host.querySelectorAll('.nviz-chart__line').length
  };
});
check('demo: switching type after empty restores usable data', demoRecover.type === 'line' &&
  !demoRecover.empty && demoRecover.paths === 2, JSON.stringify(demoRecover));

await page.locator('#demo').getByRole('button', { name: '清除强调', exact: true }).click();
await page.waitForTimeout(60);
let demoCleared = await page.evaluate(() => {
  const host = document.getElementById('demo');
  return {
    tags: host.querySelectorAll('.nviz-chart__tag').length,
    bands: host.querySelectorAll('.nviz-chart__band').length,
    badges: host.querySelectorAll('.nviz-chart__badge').length,
    status: host.querySelector('.nviz-chart-demo__status').textContent,
    clearPressed: Array.from(host.querySelectorAll('button')).filter((button) => button.textContent === '清除强调')[0].getAttribute('aria-pressed')
  };
});
check('demo: clear emphasis removes tags/bands/badges', demoCleared.tags === 0 && demoCleared.bands === 0 &&
  demoCleared.badges === 0 && /未设置/.test(demoCleared.status), JSON.stringify(demoCleared));

await page.locator('#demo').getByRole('button', { name: '关注', exact: true }).click();
await page.waitForTimeout(60);
let demoFocus = await page.evaluate(() => {
  const host = document.getElementById('demo');
  return {
    tags: host.querySelectorAll('.nviz-chart__tag').length,
    badges: host.querySelectorAll('.nviz-chart__badge').length,
    status: host.querySelector('.nviz-chart-demo__status').textContent
  };
});
check('demo: focus button adds focus marks and status', demoFocus.tags >= 1 &&
  /关注/.test(demoFocus.status), JSON.stringify(demoFocus));

await page.locator('#demo').getByRole('button', { name: '本步变化', exact: true }).click();
await page.waitForTimeout(60);
let demoChanged = await page.evaluate(() => {
  const host = document.getElementById('demo');
  return {
    tags: host.querySelectorAll('.nviz-chart__tag').length,
    status: host.querySelector('.nviz-chart-demo__status').textContent
  };
});
check('demo: changed button adds change marks and status', demoChanged.tags >= 2 && /变化/.test(demoChanged.status),
  JSON.stringify(demoChanged));

await page.locator('#demo').getByRole('button', { name: /数据表：开/ }).click();
await page.waitForTimeout(60);
let demoTableOff = await page.evaluate(() => {
  const host = document.getElementById('demo');
  return {
    table: !!host.querySelector('.nviz-chart__table'),
    button: Array.from(host.querySelectorAll('button')).filter((button) => /数据表/.test(button.textContent))[0].textContent,
    status: host.querySelector('.nviz-chart-demo__status').textContent
  };
});
check('demo: table toggle off removes data table', !demoTableOff.table && /数据表：关/.test(demoTableOff.button) &&
  /数据表关/.test(demoTableOff.status), JSON.stringify(demoTableOff));

await page.locator('#demo').getByRole('button', { name: /数据表：关/ }).click();
await page.waitForTimeout(60);
let demoTableOn = await page.evaluate(() => {
  const host = document.getElementById('demo');
  const details = host.querySelector('.nviz-chart__table');
  return {
    table: !!details,
    open: !!(details && details.open),
    rows: host.querySelectorAll('tbody tr').length
  };
});
check('demo: table toggle on restores and opens data table', demoTableOn.table && demoTableOn.open && demoTableOn.rows > 0,
  JSON.stringify(demoTableOn));

await page.locator('#demo').getByRole('button', { name: '恢复默认', exact: true }).click();
await page.waitForTimeout(60);
let demoReset = await page.evaluate(() => {
  const host = document.getElementById('demo');
  const details = host.querySelector('.nviz-chart__table');
  return {
    type: host.querySelector('.nviz-chart').getAttribute('data-type'),
    bars: host.querySelectorAll('.nviz-chart__bar').length,
    table: !!details,
    open: !!(details && details.open),
    tags: host.querySelectorAll('.nviz-chart__tag').length,
    status: host.querySelector('.nviz-chart-demo__status').textContent
  };
});
check('demo: reset returns to bar default with table open and emphasis',
  demoReset.type === 'bar' && demoReset.bars === 8 && demoReset.table && demoReset.open &&
  demoReset.tags >= 2 && /默认数据/.test(demoReset.status), JSON.stringify(demoReset));

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(240);
let demoNarrow = await page.evaluate(() => {
  const host = document.getElementById('demo');
  const demoRoot = host.querySelector('.nviz-chart-demo');
  const plot = host.querySelector('.nviz-chart__plot');
  return {
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    demoWidth: demoRoot.getBoundingClientRect().width,
    plotWidth: plot.getBoundingClientRect().width,
    rows: host.querySelectorAll('tbody tr').length,
    tableScroll: host.querySelector('.nviz-chart__table-scroll').scrollWidth -
      host.querySelector('.nviz-chart__table-scroll').clientWidth
  };
});
await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForTimeout(120);
check('demo: 390px no page overflow, chart/table stay in container',
  demoNarrow.pageOverflow <= 2 && demoNarrow.plotWidth <= demoNarrow.demoWidth + 1 &&
  demoNarrow.rows === 4 && demoNarrow.tableScroll >= 0, JSON.stringify(demoNarrow));

let demoDestroyed = await page.evaluate(() => {
  const host = document.getElementById('demo');
  window.__demo.destroy();
  window.__demo.destroy();
  const result = {
    demoNodes: host.querySelectorAll('.nviz-chart-demo').length,
    charts: host.querySelectorAll('.nviz-chart').length,
    children: host.children.length
  };
  const styleNode = host.querySelector('style');
  result.hasStyle = !!styleNode;
  return result;
});
check('demo: destroy removes demo, chart and style', demoDestroyed.demoNodes === 0 &&
  demoDestroyed.charts === 0 && demoDestroyed.children === 0 && !demoDestroyed.hasStyle,
  JSON.stringify(demoDestroyed));

// ---------------------------------------------------------------------------
// Final console / request checks.
// ---------------------------------------------------------------------------
await page.waitForTimeout(120);
check('no console errors', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 600));
check('no page errors', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 600));
check('no failed local requests', failedRequests.length === 0, failedRequests.join(' | ').slice(0, 600));

console.log(`\nviz-chart selfcheck: ${passes.length} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('FAILURES:');
  for (const failure of failures) console.log('- ' + failure.name + (failure.detail ? ' :: ' + failure.detail : ''));
}
await browser.close();
process.exit(failures.length ? 1 : 0);
