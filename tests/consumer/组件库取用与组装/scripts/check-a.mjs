/* 场景 A 的内容、公式、矩阵与换数据核对。
   node scripts/check-a.mjs */
import { ROOT, generatedPageUrl, edgeExecutable, loadChromium } from './paths.mjs';
const chromium = await loadChromium();
const EDGE = edgeExecutable();
const URL_A = generatedPageUrl('a');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : '  ' + JSON.stringify(detail)));
}

const browser = await chromium.launch({ headless: true, executablePath: EDGE });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL_A);
await page.waitForTimeout(400);

const snapshot = () => page.evaluate(() => {
  const mats = Array.from(document.querySelectorAll('.nviz-matrix')).map((root) => ({
    caption: root.querySelector('caption') ? root.querySelector('caption').textContent.trim() : '',
    cols: Array.from(root.querySelectorAll('thead th')).map((th) => th.textContent.trim()).filter((t) => t && t !== '行 \\ 列'),
    rows: Array.from(root.querySelectorAll('tbody th')).map((th) => th.textContent.replace(/关注|变化/g, '').trim()),
    cells: Array.from(root.querySelectorAll('tbody td')).map((td) => ({
      row: td.getAttribute('data-row'),
      col: td.getAttribute('data-col'),
      mark: td.getAttribute('data-direct-mark'),
      text: td.textContent.replace(/关注|变化/g, '').trim()
    }))
  }));
  const table = {
    caption: document.querySelector('.nui-table caption') ? document.querySelector('.nui-table caption').textContent.trim() : '',
    head: Array.from(document.querySelectorAll('.nui-table thead th')).map((th) => th.textContent.trim()),
    rows: Array.from(document.querySelectorAll('.nui-table tbody tr')).map((tr) => Array.from(tr.children).map((c) => c.textContent.trim())),
    emphasized: Array.from(document.querySelectorAll('.nui-table tbody tr')).map((tr) => tr.className + '|' + tr.getAttribute('data-emphasis'))
  };
  return {
    mats,
    table,
    dim: document.querySelector('.nd-dim') ? document.querySelector('.nd-dim').textContent : '',
    figureCaption: document.querySelector('.nd-figure-caption') ? document.querySelector('.nd-figure-caption').textContent : '',
    math: {
      count: document.querySelectorAll('.nui-math').length,
      katex: document.querySelectorAll('.katex').length,
      error: (function () {
        var node = document.querySelector('.nui-math__error');
        return node && !node.hidden && getComputedStyle(node).display !== 'none' ? 1 : 0;
      })(),
      text: document.querySelector('.nui-math') ? document.querySelector('.nui-math').textContent.slice(0, 40) : ''
    },
    pageW: document.documentElement.scrollWidth,
    innerW: window.innerWidth
  };
});

let snap = await snapshot();
check('公式：KaTeX 渲染，无错误块', snap.math.katex === 1 && snap.math.error === 0, snap.math);
check('矩阵 A：2 行 × 3 列，6 个单元', snap.mats[0].rows.length === 2 && snap.mats[0].cols.length === 3 && snap.mats[0].cells.length === 6,
  { rows: snap.mats[0].rows, cols: snap.mats[0].cols });
check('矩阵 A：值与输入一致', snap.mats[0].cells.map((c) => c.text).join(',') === '1,2,3,4,5,6', snap.mats[0].cells.map((c) => c.text));
check('矩阵 B：3 行 × 2 列', snap.mats[1].rows.length === 3 && snap.mats[1].cols.length === 2, { rows: snap.mats[1].rows.length, cols: snap.mats[1].cols.length });
check('矩阵 B：值与输入一致', snap.mats[1].cells.map((c) => c.text).join(',') === '1,4,2,5,3,6', snap.mats[1].cells.map((c) => c.text));
check('矩阵说明：标题含尺寸', /2 行 × 3 列/.test(snap.mats[0].caption) && /3 行 × 2 列/.test(snap.mats[1].caption), [snap.mats[0].caption, snap.mats[1].caption]);
check('关注标记：A 的第 1 行第 3 列', snap.mats[0].cells.filter((c) => c.mark === 'focus').map((c) => c.row + '/' + c.col).join(',') === 'r1/c3',
  snap.mats[0].cells.filter((c) => c.mark !== 'none'));
check('关注标记：B 的第 3 行第 1 列', snap.mats[1].cells.filter((c) => c.mark === 'focus').map((c) => c.row + '/' + c.col).join(',') === 'r3/c1',
  snap.mats[1].cells.filter((c) => c.mark !== 'none'));
check('示例句同时给出 A/B 位置与同一个数', /第 1 行第 3 列是 3/.test(snap.figureCaption) && /第 3 行第 1 列也是 3/.test(snap.figureCaption), snap.figureCaption);
check('尺寸说明随数据生成', /2 行 3 列/.test(snap.dim) && /3 行 2 列/.test(snap.dim) && /6 个/.test(snap.dim), snap.dim);
check('对照表：3 行、3 列、含示例行', snap.table.rows.length === 3 && snap.table.head.length === 3 && snap.table.rows[1][1] === '3', snap.table);
check('对照表：高亮行是第 2 行', /is-emphasis|emphasis/.test(snap.table.emphasized[1] || '') || snap.table.emphasized[1].includes('true'),
  snap.table.emphasized);

/* 换数据 */
await page.getByRole('radio', { name: '示例二 · 3×2' }).click().catch(async () => {
  await page.getByRole('button', { name: '示例二 · 3×2' }).click();
});
await page.waitForTimeout(300);
const snap2 = await snapshot();
check('换数据：A 变 3 行 × 2 列', snap2.mats[0].rows.length === 3 && snap2.mats[0].cols.length === 2, { rows: snap2.mats[0].rows.length, cols: snap2.mats[0].cols.length });
check('换数据：A 无残留「列 3」表头', !snap2.mats[0].cols.some((c) => /列 3/.test(c)), snap2.mats[0].cols);
check('换数据：B 变 2 行 × 3 列', snap2.mats[1].rows.length === 2 && snap2.mats[1].cols.length === 3, { rows: snap2.mats[1].rows.length, cols: snap2.mats[1].cols.length });
check('换数据：A 值与输入一致', snap2.mats[0].cells.map((c) => c.text).join(',') === '7,8,9,10,11,12', snap2.mats[0].cells.map((c) => c.text));
check('换数据：B 值与输入一致', snap2.mats[1].cells.map((c) => c.text).join(',') === '7,9,11,8,10,12', snap2.mats[1].cells.map((c) => c.text));
check('换数据：关注标记移到 A(1,2) 与 B(2,1)', snap2.mats[0].cells.filter((c) => c.mark === 'focus').map((c) => c.row + '/' + c.col).join(',') === 'r1/c2' &&
  snap2.mats[1].cells.filter((c) => c.mark === 'focus').map((c) => c.row + '/' + c.col).join(',') === 'r2/c1',
  { a: snap2.mats[0].cells.filter((c) => c.mark !== 'none'), b: snap2.mats[1].cells.filter((c) => c.mark !== 'none') });
check('换数据：示例句更新为 8', /第 1 行第 2 列是 8/.test(snap2.figureCaption) && /第 2 行第 1 列也是 8/.test(snap2.figureCaption), snap2.figureCaption);
check('换数据：尺寸说明同步为 3×2 / 2×3', /3 行 2 列/.test(snap2.dim) && /2 行 3 列/.test(snap2.dim), snap2.dim);
check('换数据：对照表值同步', snap2.table.rows.map((r) => r[1]).join(',') === '7,8,12', snap2.table.rows);
check('换数据：页面无横向溢出', snap2.pageW <= snap2.innerW + 1, { pageW: snap2.pageW, innerW: snap2.innerW });

/* 布局：1280 / 1024 / 700 */
async function columnsAt(width, height) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(250);
  const info = await page.evaluate(() => {
    const grid = document.querySelector('.nui-grid');
    const kids = Array.from(grid.children).map((el) => Math.round(el.getBoundingClientRect().top));
    const mats = Array.from(document.querySelectorAll('.nviz-matrix')).map((m) => ({
      w: Math.round(m.getBoundingClientRect().width),
      scrollW: m.querySelector('.nviz-matrix__viewport').scrollWidth,
      clientW: m.querySelector('.nviz-matrix__viewport').clientWidth
    }));
    return { rows: new Set(kids).size, mats, pageW: document.documentElement.scrollWidth, innerW: window.innerWidth };
  });
  return info;
}

const at1280 = await columnsAt(1280, 900);
check('1280：两个矩阵并排', at1280.rows === 1, at1280.rows);
check('1280：矩阵不需内部横向滚动', at1280.mats.every((m) => m.scrollW <= m.clientW + 1), at1280.mats);
const at1024 = await columnsAt(1024, 768);
check('1024：两个矩阵仍并排、无页面横向滚动', at1024.rows === 1 && at1024.pageW <= at1024.innerW + 1, at1024);
const at700 = await columnsAt(700, 900);
check('700：矩阵改为上下排列', at700.rows === 2, at700.rows);
check('700：仍无页面横向滚动', at700.pageW <= at700.innerW + 1, { pageW: at700.pageW, innerW: at700.innerW });

/* 125% 页面缩放等效：CSS 视口 1024×640，物理 1280×800 */
const zoom = await browser.newPage({ viewport: { width: 1024, height: 640 }, deviceScaleFactor: 1.25 });
await zoom.goto(URL_A);
await zoom.waitForTimeout(400);
const zoomInfo = await zoom.evaluate(() => ({ pageW: document.documentElement.scrollWidth, innerW: window.innerWidth, h1: document.querySelector('h1').getBoundingClientRect().width }));
await zoom.screenshot({ path: ROOT + '/evidence/a-zoom125.png' });
check('125% 缩放等效视口：无横向溢出', zoomInfo.pageW <= zoomInfo.innerW + 1, zoomInfo);

/* 键盘：Tab 到分段选择，箭头切换数据 */
await page.setViewportSize({ width: 1280, height: 900 });
await page.getByRole('radio', { name: '示例一 · 2×3' }).click().catch(async () => {
  await page.getByRole('button', { name: '示例一 · 2×3' }).click();
});
await page.waitForTimeout(200);
const segments = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('.nui-segment'));
  return { count: btns.length, roles: btns.map((b) => b.getAttribute('role')), tabindex: btns.map((b) => b.getAttribute('tabindex')) };
});
check('分段选择：两个选项、暴露单选语义', segments.count === 2 && segments.roles.every((r) => r === 'radio'), segments);
const focused = await page.evaluate(() => {
  const el = document.querySelector('.nui-segment[aria-checked="true"]');
  el.focus();
  return { tag: document.activeElement.tagName, outline: getComputedStyle(document.activeElement).outlineWidth };
});
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(250);
const afterArrow = await page.evaluate(() => ({
  value: window.__sceneA.getDataset(),
  matA: document.querySelectorAll('.nviz-matrix')[0].querySelectorAll('tbody td').length
}));
check('键盘：方向键切换数据并重绘', afterArrow.value === 'd2' && afterArrow.matA === 6, afterArrow);

console.log('\nerrors:', errors.length ? errors : 'none');
check('无控制台/页面错误', errors.length === 0, errors);
const failed = results.filter((r) => !r.ok);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过');
await browser.close();
if (failed.length) process.exitCode = 1;
