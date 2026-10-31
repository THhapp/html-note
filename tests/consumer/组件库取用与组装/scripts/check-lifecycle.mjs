/* 多实例、清理与互不影响的最小核对（在已加载的两页上追加临时容器）。
   node scripts/check-lifecycle.mjs */
import { ROOT, edgeExecutable, loadChromium } from './paths.mjs';
const chromium = await loadChromium();
const EDGE = edgeExecutable();
import { pathToFileURL } from 'node:url';

const browser = await chromium.launch({ headless: true, executablePath: EDGE });
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : '  ' + JSON.stringify(detail)));
}

/* A：第三个矩阵与第三个表格的挂载/更新/销毁 */
const pageA = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await pageA.goto(pathToFileURL(ROOT + '/src/page-a.html').href);
await pageA.waitForTimeout(400);
const a = await pageA.evaluate(() => {
  const host = document.createElement('div');
  host.id = 'probe-a';
  document.body.appendChild(host);
  const m = NoteViz.Matrix.mount(host, {
    rows: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }],
    columns: [{ id: 'p', label: 'P' }],
    values: [[1], [2]],
    caption: '临时矩阵'
  });
  const before = Array.from(host.querySelectorAll('tbody td')).map((td) => td.textContent.trim()).join(',');
  m.update({ values: [[9], [8]] });
  const after = Array.from(host.querySelectorAll('tbody td')).map((td) => td.textContent.trim()).join(',');
  const mainCells = document.querySelectorAll('.nd-note .nviz-matrix tbody td').length;
  m.destroy();
  const left = host.children.length;
  host.remove();
  return { before, after, mainCells, left };
});
check('A 多实例：临时矩阵独立更新', a.before === '1,2' && a.after === '9,8', a);
check('A 多实例：页面两个矩阵不受影响', a.mainCells === 12, a.mainCells);
check('A 清理：destroy 后宿主无残留', a.left === 0, a.left);

/* B：第二个序列编辑与标记的挂载/动作/销毁 */
const pageB = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await pageB.goto(pathToFileURL(ROOT + '/src/page-b.html').href);
await pageB.waitForTimeout(400);
const b = await pageB.evaluate(async () => {
  const host = document.createElement('div');
  host.id = 'probe-b';
  document.body.appendChild(host);
  const seq = NoteViz.SequenceEdit.mount(host, {
    items: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }, { id: 'z', label: 'Z' }]
  });
  seq.remove('y');
  const afterRemove = seq.getState().items.map((i) => i.id).join('');
  const markerBase = document.querySelectorAll('.nx-focus').length;
  const focus = NoteExpr.Focus.mount();
  focus.show(seq.getTarget('x'));
  const markerShown = focus.visible && document.querySelectorAll('.nx-focus').length === markerBase + 1;
  seq.destroy();
  focus.destroy();
  const left = host.children.length;
  const markersLeft = document.querySelectorAll('.nx-focus').length;
  const ghostLeft = document.querySelectorAll('.nviz-sequence-edit__item--ghost').length;
  host.remove();
  return { afterRemove, markerShown, markerBase, left, markersLeft, ghostLeft };
});
check('B 多实例：临时序列独立完成删除', b.afterRemove === 'xz', b.afterRemove);
check('B 标记：独立实例可显示（新增一层）', b.markerShown, b);
check('B 清理：destroy 后宿主无残留', b.left === 0, b.left);
check('B 清理：销毁后标记层数回到页面原有数量、无 ghost', b.markersLeft === b.markerBase && b.ghostLeft === 0, { markers: b.markersLeft, base: b.markerBase, ghost: b.ghostLeft });
await pageB.getByRole('button', { name: '下一步' }).click();
await pageB.waitForTimeout(650);
const stillWorks = await pageB.evaluate(() => window.__sceneB.state().sequence.join(''));
check('B 清理：页面的演示仍可继续操作', stillWorks === 'abde', stillWorks);

/* 125% 缩放等效（B） */
const zoom = await browser.newPage({ viewport: { width: 1024, height: 640 }, deviceScaleFactor: 1.25 });
await zoom.goto(pathToFileURL(ROOT + '/src/page-b.html').href);
await zoom.waitForTimeout(400);
const zoomInfo = await zoom.evaluate(() => ({
  pageW: document.documentElement.scrollWidth,
  innerW: window.innerWidth,
  stageW: Math.round(document.querySelector('.nblk-demo-stage').getBoundingClientRect().width)
}));
await zoom.screenshot({ path: ROOT + '/evidence/b-zoom125.png' });
check('B 125% 缩放等效视口：无横向溢出', zoomInfo.pageW <= zoomInfo.innerW + 1, zoomInfo);

const failed = results.filter((r) => !r.ok);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过');
await browser.close();
if (failed.length) process.exitCode = 1;
