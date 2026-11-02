// 组件接入自检：内置 Adapter（含 D01 sequence scene 接入）+ M01/R10 最小增补（真实 Edge，源码直载）。
// 运行：node tests/demo/adapters-check.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { moduleScripts, moduleStyles, readModuleSourceText } from '../lib/src-sources.mjs';
import { writeCacheJson } from '../lib/test-output.mjs';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const src = (rel) => path.join(root, rel);

// 源码加载清单从 src/manifests 推导：模块拆分后自动包含新增文件。
const CHECK_MODULES = ['core', 'legacy', 'viz-mechanisms', 'viz-objects', 'demo-runtime'];
const CHECK_SCRIPTS = moduleScripts(root, CHECK_MODULES);
const CHECK_STYLES = moduleStyles(root, CHECK_MODULES);

const checks = [];
const pageErrors = [];
function check(name, ok, detail = '') {
  checks.push({ name: String(name), ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 500) });
}

async function makePage(browser, options = {}) {
  const context = await browser.newContext({
    viewport: { width: options.width || 1100, height: options.height || 900 },
    reducedMotion: options.reduced ? 'reduce' : 'no-preference'
  });
  const page = await context.newPage();
  const label = options.label || 'page';
  page.on('console', (msg) => { if (msg.type() === 'error') pageErrors.push(label + ': ' + msg.text()); });
  page.on('pageerror', (err) => pageErrors.push(label + ': pageerror: ' + err.message));
  await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>adapters check</title></head><body><main id="root"></main></body></html>');
  await page.addStyleTag({ content: 'html,body{margin:0;padding:0}body{padding:20px;box-sizing:border-box;background:#f4f6f9}#root{max-width:980px;margin:0 auto}' });
  for (const rel of CHECK_STYLES) {
    await page.addStyleTag({ path: src(rel) });
  }
  for (const rel of CHECK_SCRIPTS) {
    await page.addScriptTag({ path: src(rel) });
  }
  return { context, page };
}

async function evalChecks(label, page, fn) {
  try {
    const rows = await page.evaluate(fn);
    if (!Array.isArray(rows)) {
      check(label, false, 'step did not return checks');
      return;
    }
    rows.forEach((row) => check(row.name, row.ok, row.detail));
  } catch (error) {
    check(label + ' crashed', false, error && error.message ? error.message : String(error));
  }
}

const browser = await chromium.launch({ executablePath: edge, headless: true });

/* =========================================================================
 * 正常动效页：注册表、M01、R10、matrix、dom、旧 API 冒烟
 * ======================================================================= */
const normal = await makePage(browser, { label: 'normal' });
await evalChecks('normal adapters', normal.page, async () => {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail).slice(0, 500) });
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const settling = (handle, timeout = 6000) => Promise.race([
    handle.finished.then((value) => ({ kind: 'settled', value })),
    sleep(timeout).then(() => ({ kind: 'timeout' }))
  ]);
  const runningAnims = (node) => node.getAnimations({ subtree: true }).filter((anim) => !('transitionProperty' in anim) && anim.playState === 'running');
  const attempt = (fn) => { try { fn(); return null; } catch (error) { return error; } };
  const hasError = (error, pattern) => !!error && (!pattern || pattern.test(String(error.message)));
  const rootEl = document.getElementById('root');
  rootEl.replaceChildren();
  const makeHost = () => { const node = document.createElement('div'); rootEl.appendChild(node); return node; };
  const adapters = window.NoteDemoInternals && window.NoteDemoInternals.adapters;
  // 完整 demo-runtime manifest 会注册全部内置 Adapter（含 expression），顺序由 adapters/index.js 决定。
  const names = ['matrix', 'sequence', 'sequence-edit', 'sequence-insert', 'dom', 'expression'];
  const ids = (handle) => (handle.readView().model.items || []).map((item) => item.id).join(',');

  /* ---------- 注册表 ---------- */
  check('adapters registry exists', !!adapters && names.every((name) => !!adapters[name]), adapters ? Object.keys(adapters).join(',') : 'missing');
  check('adapters registry order', !!adapters && Object.keys(adapters).join(',') === names.join(','), adapters && Object.keys(adapters).join(','));
  names.forEach((name) => {
    const adapter = adapters && adapters[name];
    check('adapter ' + name + ' contract shape', !!adapter && adapter.name === name &&
      typeof adapter.normalizeView === 'function' &&
      typeof adapter.validateAction === 'function' &&
      typeof adapter.mount === 'function', adapter && typeof adapter.adopt);
  });
  const sequenceAdapter = adapters && adapters.sequence;
  check('sequence adapter declares scene modes', !!sequenceAdapter &&
    Array.isArray(sequenceAdapter.sceneModes) &&
    sequenceAdapter.sceneModes.join(',') === 'layout,cut,reveal',
    sequenceAdapter && Array.isArray(sequenceAdapter.sceneModes) ? sequenceAdapter.sceneModes.join(',') : 'missing');
  check('sequence adapter exposes adopt', !!sequenceAdapter && typeof sequenceAdapter.adopt === 'function');

  /* ---------- M01 sequence-edit：规范化 ---------- */
  const seqAdapter = adapters['sequence-edit'];
  const input = {
    items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }],
    focus: ['c', 'a', 'c'],
    changed: []
  };
  const inputBefore = JSON.stringify(input);
  const seqView = seqAdapter.normalizeView(input);
  check('M01 normalize items', seqView.model.items.length === 3 && seqView.model.items[1].id === 'b' && seqView.model.items[1].label === 'B');
  check('M01 normalize cues dedupe+sort', seqView.cues.focus.join(',') === 'a,c' && seqView.cues.changed.length === 0, JSON.stringify(seqView.cues));
  check('M01 normalize readonly copy', JSON.stringify(input) === inputBefore && seqView.model.items !== input.items);
  const seqDefaults = seqAdapter.normalizeView({ items: [{ id: 'a', label: 'A' }] });
  check('M01 normalize defaults', seqDefaults.cues.focus.length === 0 && seqDefaults.cues.changed.length === 0);
  check('M01 normalize rejects missing items', hasError(attempt(() => seqAdapter.normalizeView({})), /items/));
  check('M01 normalize rejects duplicate id', hasError(attempt(() => seqAdapter.normalizeView({ items: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] })), /重复/));
  check('M01 normalize rejects unknown focus ref', hasError(attempt(() => seqAdapter.normalizeView({ items: [{ id: 'a', label: 'A' }], focus: ['zzz'] })), /不存在/));
  check('M01 normalize rejects non-string label', hasError(attempt(() => seqAdapter.normalizeView({ items: [{ id: 'a', label: 5 }] })), /label/));

  /* ---------- M01 validateAction ---------- */
  check('M01 validateAction remove', attempt(() => seqAdapter.validateAction({ binding: 'seq', type: 'remove', params: { id: 'b' } })) === null);
  check('M01 validateAction swap', attempt(() => seqAdapter.validateAction({ binding: 'seq', type: 'swap', params: { a: 'a', b: 'b' } })) === null);
  check('M01 validateAction rejects unknown', hasError(attempt(() => seqAdapter.validateAction({ binding: 'seq', type: 'move', params: { id: 'a' } })), /不支持/));
  check('M01 validateAction rejects missing id', hasError(attempt(() => seqAdapter.validateAction({ binding: 'seq', type: 'remove', params: {} })), /params/));
  check('M01 validateAction rejects missing swap operand', hasError(attempt(() => seqAdapter.validateAction({ binding: 'seq', type: 'swap', params: { a: 'a' } })), /params/));
  check('M01 validateAction rejects parallel inline', hasError(attempt(() => seqAdapter.validateAction({ parallel: [{ binding: 'seq', type: 'remove', params: { id: 'a' } }] }))));

  /* ---------- M01 mount / restore / readView ---------- */
  const hostA = makeHost();
  let m01Changes = 0;
  const m01 = seqAdapter.mount(hostA, { label: '序列自检', onChange: () => { m01Changes += 1; } });
  const containerA = hostA.querySelector('[data-adapter="sequence-edit"]');
  check('M01 adapter mount independent container', !!containerA && containerA.parentNode === hostA && hostA.children.length === 1);
  check('M01 handle capabilities', typeof m01.restore === 'function' && typeof m01.readView === 'function' &&
    typeof m01.applyCues === 'function' && typeof m01.perform === 'function' &&
    typeof m01.target === 'function' && typeof m01.destroy === 'function');
  const hostChanged = () => hostA.querySelectorAll('.nviz-sequence-edit__item[data-changed="true"]').length;
  const hostFocus = () => hostA.querySelectorAll('.nviz-sequence-edit__item[data-focus="true"]').length;
  m01.restore({ model: seqView.model, cues: { focus: ['b'], changed: ['a'] } });
  check('M01 restore items order', ids(m01) === 'a,b,c', ids(m01));
  check('M01 restore cues', m01.readView().cues.focus.join(',') === 'b' && m01.readView().cues.changed.join(',') === 'a');
  check('M01 target by id', !!m01.target({ id: 'b' }) && m01.target({ id: 'b' }).textContent.indexOf('B') >= 0);
  check('M01 target missing/invalid null', m01.target({ id: 'zzz' }) === null && m01.target(null) === null && m01.target({}) === null);
  check('M01 restore applies hints', hostFocus() === 1 && hostChanged() === 1, 'focus=' + hostFocus() + ',changed=' + hostChanged());

  m01.restore({ model: { items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }] }, cues: { focus: ['a'], changed: [] } });
  check('M01 repeated restore no residue', hostFocus() === 1 && hostChanged() === 0, 'focus=' + hostFocus() + ',changed=' + hostChanged());
  m01.restore({ model: { items: [{ id: 'b', label: 'B' }] }, cues: { focus: [], changed: ['b'] } });
  check('M01 replace model removes stale items', hostA.querySelectorAll('.nviz-sequence-edit__list > li').length === 1 && hostChanged() === 1 && hostFocus() === 0);
  check('M01 repeated restore does not accumulate markers', hostA.querySelectorAll('.nviz-sequence-edit__marker:not([hidden])').length === 1);

  const hostBaseline = makeHost();
  const m01Baseline = seqAdapter.mount(hostBaseline, {
    items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }],
    changed: ['c']
  });
  m01Baseline.restore({ model: { items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }] }, cues: { focus: [], changed: [] } });
  check('M01 restore clears configured baseline changed', hostBaseline.querySelectorAll('.nviz-sequence-edit__item[data-changed="true"]').length === 0);
  m01Baseline.destroy();

  /* ---------- M01 remove / swap 真实动效 ---------- */
  const fourItems = [{ id: 'a', label: '读取' }, { id: 'b', label: '校验' }, { id: 'c', label: '转换' }, { id: 'd', label: '写入' }];
  m01.restore({ model: { items: fourItems }, cues: { focus: [], changed: [] } });
  const removeHandle = m01.perform({ type: 'remove', params: { id: 'b' } }, { motion: 'normal' });
  check('M01 remove returns effect handle', !!removeHandle && removeHandle.finished instanceof Promise && typeof removeHandle.cancel === 'function');
  check('M01 remove running observable', runningAnims(hostA).length > 0 || !!hostA.querySelector('[data-anim="running"]'), 'anims=' + runningAnims(hostA).length);
  check('M01 remove real ghost', hostA.querySelectorAll('.nviz-sequence-edit__item--ghost').length === 1,
    'ghosts=' + hostA.querySelectorAll('.nviz-sequence-edit__item--ghost').length);
  let removeSettledEarly = false;
  removeHandle.finished.then(() => { removeSettledEarly = true; });
  await sleep(150);
  check('M01 finished not early', !removeSettledEarly, 'settled=' + removeSettledEarly);
  const removeResult = await removeHandle.finished;
  check('M01 remove completed', removeResult && removeResult.status === 'completed', JSON.stringify(removeResult));
  check('M01 remove readback model', ids(m01) === 'a,c,d', ids(m01));
  check('M01 remove ghost cleaned', hostA.querySelectorAll('.nviz-sequence-edit__item--ghost').length === 0);
  check('M01 remove cleanup settled', hostA.querySelector('.nviz-sequence-edit').getAttribute('data-anim') === 'idle' &&
    !hostA.querySelector('[aria-busy="true"]') && runningAnims(hostA).length === 0, 'anims=' + runningAnims(hostA).length);
  check('M01 runAction does not emit onChange', m01Changes === 0, 'changes=' + m01Changes);

  m01.restore({ model: { items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }] }, cues: { focus: [], changed: [] } });
  const swapHandle = m01.perform({ type: 'swap', params: { a: 'a', b: 'c' } }, { motion: 'normal' });
  check('M01 swap running observable', runningAnims(hostA).length > 0 || !!hostA.querySelector('[data-anim="running"]'));
  const swapResult = await swapHandle.finished;
  check('M01 swap completed and order', swapResult.status === 'completed' && ids(m01) === 'c,b,a', swapResult.status + ' / ' + ids(m01));
  check('M01 swap clean', hostA.querySelectorAll('.nviz-sequence-edit__item--ghost').length === 0 && runningAnims(hostA).length === 0);

  /* ---------- M01 无动作 / animate:false ---------- */
  m01.restore({ model: { items: [{ id: 'a', label: 'A' }] }, cues: { focus: [], changed: [] } });
  const noopRemove = await m01.perform({ type: 'remove', params: { id: 'zzz' } }, { motion: 'normal' }).finished;
  const noopSwap = await m01.perform({ type: 'swap', params: { a: 'a', b: 'a' } }, { motion: 'normal' }).finished;
  check('M01 no-action completed', noopRemove.status === 'completed' && noopSwap.status === 'completed', noopRemove.status + '/' + noopSwap.status);
  check('M01 no-action leaves idle', hostA.querySelector('.nviz-sequence-edit').getAttribute('data-anim') === 'idle' && ids(m01) === 'a');
  const instantHandle = m01.perform({ type: 'remove', params: { id: 'a' } }, { animate: false });
  const instantResult = await instantHandle.finished;
  check('M01 animate:false completed without running', instantResult.status === 'completed' && ids(m01) === '' &&
    hostA.querySelector('.nviz-sequence-edit').getAttribute('data-anim') === 'idle');

  /* ---------- M01 cancel ---------- */
  m01.restore({ model: { items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }, { id: 'd', label: 'D' }] }, cues: { focus: [], changed: [] } });
  const cancelHandle = m01.perform({ type: 'remove', params: { id: 'c' } }, { motion: 'normal' });
  await sleep(150);
  check('M01 cancel while running', runningAnims(hostA).length > 0 || !!hostA.querySelector('[data-anim="running"]'));
  cancelHandle.cancel();
  cancelHandle.cancel();
  const cancelResult = await cancelHandle.finished;
  check('M01 cancel settles cancelled', cancelResult.status === 'cancelled', JSON.stringify(cancelResult));
  await sleep(80);
  check('M01 cancel no residue', hostA.querySelectorAll('.nviz-sequence-edit__item--ghost').length === 0 &&
    runningAnims(hostA).length === 0 && hostA.querySelector('.nviz-sequence-edit').getAttribute('data-anim') === 'idle' &&
    !hostA.querySelector('[aria-busy="true"]'));

  /* ---------- M01 动作打断 ---------- */
  m01.restore({ model: { items: fourItems }, cues: { focus: [], changed: [] } });
  const firstAction = m01.perform({ type: 'remove', params: { id: 'b' } }, { motion: 'normal' });
  await sleep(140);
  const secondAction = m01.perform({ type: 'swap', params: { a: 'a', b: 'd' } }, { motion: 'normal' });
  const firstResult = await firstAction.finished;
  const secondResult = await secondAction.finished;
  check('M01 interrupted action cancelled', firstResult.status === 'cancelled', JSON.stringify(firstResult));
  check('M01 successor completed', secondResult.status === 'completed' && ids(m01) === 'd,c,a', secondResult.status + ' / ' + ids(m01));
  check('M01 succession clean', hostA.querySelectorAll('.nviz-sequence-edit__item--ghost').length === 0 && runningAnims(hostA).length === 0);

  /* ---------- M01 restore 打断动作 ---------- */
  m01.restore({ model: { items: fourItems }, cues: { focus: [], changed: [] } });
  const strayAction = m01.perform({ type: 'remove', params: { id: 'b' } }, { motion: 'normal' });
  await sleep(140);
  m01.restore({ model: { items: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }] }, cues: { focus: ['x'], changed: [] } });
  const strayResult = await strayAction.finished;
  check('M01 restore during action settles', strayResult.status === 'cancelled', JSON.stringify(strayResult));
  check('M01 restore during action no residue', ids(m01) === 'x,y' && hostA.querySelectorAll('.nviz-sequence-edit__item--ghost').length === 0 &&
    hostFocus() === 1 && hostChanged() === 0 && runningAnims(hostA).length === 0);

  /* ---------- M01 逐帧 changed 不进入下一步基线 ---------- */
  m01.restore({ model: { items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }] }, cues: { focus: ['a'], changed: ['b'] } });
  await m01.perform({ type: 'remove', params: { id: 'b' } }, { motion: 'normal' }).finished;
  m01.applyCues({ focus: ['a'], changed: [] });
  check('M01 per-action changed not persisted', m01.readView().cues.changed.join(',') === '' && hostChanged() === 0,
    JSON.stringify(m01.readView().cues));
  await m01.perform({ type: 'swap', params: { a: 'a', b: 'c' } }, { motion: 'normal' }).finished;
  m01.applyCues({ focus: [], changed: ['c'] });
  check('M01 next action cues from frame only', m01.readView().cues.changed.join(',') === 'c' && hostChanged() === 1 && hostFocus() === 0,
    JSON.stringify(m01.readView().cues));

  /* ---------- M01 destroy 结算 ---------- */
  const hostDoomed = makeHost();
  const doomed = seqAdapter.mount(hostDoomed, {});
  doomed.restore({ model: { items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }] }, cues: { focus: [], changed: [] } });
  const doomedHandle = doomed.perform({ type: 'remove', params: { id: 'b' } }, { motion: 'normal' });
  await sleep(120);
  doomed.destroy();
  const doomedResult = await doomedHandle.finished;
  check('M01 destroy settles cancelled', doomedResult.status === 'cancelled', JSON.stringify(doomedResult));
  check('M01 destroy removes adapter container', hostDoomed.children.length === 0);
  await sleep(100);

  /* ---------- M01 缺失组件依赖 ---------- */
  const savedSequenceEdit = window.NoteViz.SequenceEdit;
  delete window.NoteViz.SequenceEdit;
  const missingSeqError = attempt(() => seqAdapter.mount(makeHost(), {}));
  window.NoteViz.SequenceEdit = savedSequenceEdit;
  check('M01 mount requires component loaded', hasError(missingSeqError, /需要先加载/), missingSeqError && missingSeqError.message);

  /* ---------- M01 旧 API 冒烟（返回值/回调不变） ---------- */
  const legacyHost = makeHost();
  let legacyChanges = 0;
  const legacy = window.NoteViz.SequenceEdit.mount(legacyHost, {
    items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }],
    focus: ['a'],
    changed: [],
    onChange: () => { legacyChanges += 1; }
  });
  check('M01 legacy remove returns view', legacy.remove('b') === legacy);
  check('M01 legacy remove immediate state', legacy.getState().items.map((item) => item.id).join(',') === 'a,c');
  check('M01 legacy onChange fires', legacyChanges === 1, 'changes=' + legacyChanges);
  check('M01 legacy anim observable', legacyHost.getAnimations({ subtree: true }).length > 0 || legacy.el.getAttribute('data-anim') === 'running');
  await sleep(800);
  check('M01 legacy settled clean', legacyHost.getAnimations({ subtree: true }).length === 0 && legacy.el.getAttribute('data-anim') === 'idle');
  check('M01 legacy undo returns view', legacy.undo() === legacy);
  await sleep(800);
  check('M01 legacy undo restores', legacy.getState().items.map((item) => item.id).join(',') === 'a,b,c');
  check('M01 legacy swap returns view', legacy.swap('a', 'c') === legacy);
  await sleep(800);
  check('M01 legacy swap order', legacy.getState().items.map((item) => item.id).join(',') === 'c,b,a');
  check('M01 legacy getTarget', legacy.getTarget('b') !== null && legacy.getTarget('zzz') === null);
  legacy.destroy();
  check('M01 legacy destroy', legacyHost.children.length === 0);
  m01.destroy();
  check('M01 adapter destroy removes its container', hostA.children.length === 0);

  /* ---------- matrix adapter ---------- */
  const matrixAdapter = adapters.matrix;
  check('matrix adapter exposes cut/update with update default',
    JSON.stringify(matrixAdapter.sceneModes) === JSON.stringify(['cut', 'update']) && matrixAdapter.defaultSceneMode === 'update',
    JSON.stringify(matrixAdapter.sceneModes) + '/' + matrixAdapter.defaultSceneMode);
  const matrixInput = {
    rows: [{ id: 'r1', label: '行一' }, { id: 'r2', label: '行二' }],
    columns: [{ id: 'c1', label: '列一' }, { id: 'c2', label: '列二' }],
    values: [[1], [2]],
    focus: { rows: ['r1'], cols: ['c2', 'c2'], cells: [{ row: 'r1', col: 'c2' }] },
    changed: { rows: [], cols: [], cells: [] },
    caption: '矩阵说明'
  };
  const matrixView = matrixAdapter.normalizeView(matrixInput);
  check('matrix normalize rows/columns', matrixView.model.rows.length === 2 && matrixView.model.columns.length === 2);
  check('matrix normalize pads values', JSON.stringify(matrixView.model.values) === JSON.stringify([[1, ''], [2, '']]), JSON.stringify(matrixView.model.values));
  check('matrix normalize cues sorted', matrixView.cues.focus.rows.join(',') === 'r1' && matrixView.cues.focus.cols.join(',') === 'c2' &&
    matrixView.cues.focus.cells.length === 1 && matrixView.cues.focus.cells[0].row === 'r1');
  check('matrix normalize caption default', matrixAdapter.normalizeView({ rows: [], columns: [], values: [] }).cues.caption === '');
  check('matrix normalize rejects duplicate row', hasError(attempt(() => matrixAdapter.normalizeView({
    rows: [{ id: 'r1', label: 'A' }, { id: 'r1', label: 'B' }], columns: [], values: []
  })), /重复/));
  check('matrix normalize rejects unknown focus row', hasError(attempt(() => matrixAdapter.normalizeView({
    rows: [{ id: 'r1', label: 'A' }], columns: [{ id: 'c1', label: 'C' }], values: [['x']], focus: { rows: ['zzz'] }
  })), /不存在/));
  check('matrix normalize rejects unknown focus cell', hasError(attempt(() => matrixAdapter.normalizeView({
    rows: [{ id: 'r1', label: 'A' }], columns: [{ id: 'c1', label: 'C' }], values: [['x']], focus: { cells: [{ row: 'r1', col: 'zzz' }] }
  })), /不存在/));
  check('matrix normalize rejects non-array values', hasError(attempt(() => matrixAdapter.normalizeView({
    rows: [], columns: [], values: 'x'
  })), /values/));
  check('matrix validateAction rejects', hasError(attempt(() => matrixAdapter.validateAction({ binding: 'm', type: 'update' })), /不支持/));

  const matrixHost = makeHost();
  const matrix = matrixAdapter.mount(matrixHost, { label: '矩阵自检', dense: false });
  check('matrix handle exposes update hook and readView', typeof matrix.restore === 'function' && typeof matrix.target === 'function' &&
    typeof matrix.prepareChange === 'function' && typeof matrix.readView === 'function' && !('perform' in matrix));
  check('matrix target before restore null', matrix.target({ row: 'r1', col: 'c1' }) === null);
  matrix.restore({ model: matrixView.model, cues: matrixView.cues });
  const cellTarget = matrix.target({ row: 'r1', col: 'c2' });
  check('matrix target cell', !!cellTarget && cellTarget.getAttribute('data-row') === 'r1' && cellTarget.getAttribute('data-col') === 'c2');
  check('matrix restore caption', !!matrixHost.querySelector('caption') && matrixHost.querySelector('caption').textContent === '矩阵说明');
  check('matrix restore marks', matrixHost.querySelectorAll('td[data-mark="focus"]').length === 3 &&
    matrixHost.querySelectorAll('td[data-mark="changed"]').length === 0 &&
    matrixHost.querySelectorAll('td[data-mark="none"]').length === 1,
    'focus=' + matrixHost.querySelectorAll('td[data-mark="focus"]').length +
    ',both=' + matrixHost.querySelectorAll('td[data-mark="both"]').length +
    ',none=' + matrixHost.querySelectorAll('td[data-mark="none"]').length);
  check('matrix target unknown cell null', matrix.target({ row: 'r1', col: 'zzz' }) === null && matrix.target({ row: 'r1' }) === null && matrix.target(null) === null);
  const matrixRead = matrix.readView();
  check('matrix readView returns actual state', JSON.stringify(matrixRead.model.values) === JSON.stringify(matrixView.model.values) &&
    JSON.stringify(matrixRead.cues.focus) === JSON.stringify(matrixView.cues.focus) &&
    matrixRead.cues.caption === '矩阵说明');
  matrix.restore({
    model: {
      rows: [{ id: 'r1', label: '行一' }, { id: 'r2', label: '行二' }],
      columns: [{ id: 'c1', label: '列一' }, { id: 'c2', label: '列二' }],
      values: [['新值', 9], [2, 3]]
    },
    cues: { focus: { rows: [], cols: [], cells: [] }, changed: { rows: [], cols: [], cells: [] }, caption: '' }
  });
  check('matrix restore clears old hints', matrixHost.querySelectorAll('td[data-mark="none"]').length === 4 &&
    matrixHost.querySelectorAll('th[data-mark="focus"], th[data-mark="changed"], th[data-mark="both"]').length === 0 &&
    !matrixHost.querySelector('caption'));
  check('matrix restore rewrites values', matrixHost.querySelector('td[data-row="r1"][data-col="c1"]').textContent.indexOf('新值') >= 0);
  matrix.applyCues({ focus: { rows: ['r2'], cols: [], cells: [] }, changed: { rows: [], cols: [], cells: [] }, caption: '只看行二' });
  check('matrix applyCues updates marks only', matrixHost.querySelectorAll('th[data-mark="focus"]').length === 1 &&
    matrixHost.querySelector('td[data-row="r1"][data-col="c1"]').textContent.indexOf('新值') >= 0);
  matrix.destroy();
  check('matrix destroy removes container', matrixHost.children.length === 0);
  const savedMatrix = window.NoteViz.Matrix;
  delete window.NoteViz.Matrix;
  const missingMatrixError = attempt(() => matrixAdapter.mount(makeHost(), {}));
  window.NoteViz.Matrix = savedMatrix;
  check('matrix mount requires component loaded', hasError(missingMatrixError, /需要先加载/), missingMatrixError && missingMatrixError.message);

  /* ---------- dom adapter ---------- */
  const domAdapter = adapters.dom;
  const domView = domAdapter.normalizeView({ text: '最小画面' });
  check('dom normalize', domView.model.text === '最小画面' && Object.keys(domView.cues).length === 0);
  check('dom normalize defaults text', domAdapter.normalizeView({}).model.text === '');
  check('dom normalize rejects non-string', hasError(attempt(() => domAdapter.normalizeView({ text: 3 })), /text/));
  check('dom validateAction rejects', hasError(attempt(() => domAdapter.validateAction({ binding: 'd', type: 'write' })), /不支持/));
  const domHost = makeHost();
  const dom = domAdapter.mount(domHost, {});
  check('dom handle exposes update hook and readView', typeof dom.restore === 'function' && typeof dom.target === 'function' &&
    typeof dom.prepareChange === 'function' && typeof dom.readView === 'function' && !('perform' in dom));
  check('dom adapter defaults to update', domAdapter.defaultSceneMode === 'update');
  dom.restore(domView);
  const domRoot = dom.target({ part: 'root' });
  check('dom restore writes text', !!domRoot && domRoot.textContent === '最小画面' && domRoot.parentNode !== domHost);
  check('dom target other part null', dom.target({ part: 'child' }) === null && dom.target(null) === null);
  dom.restore({ model: { text: '更新文本' }, cues: {} });
  check('dom restore replaces text only', dom.target({ part: 'root' }).textContent === '更新文本' && domHost.children.length === 1);
  dom.destroy();
  check('dom destroy removes container', domHost.children.length === 0);

  /* ---------- sequence-insert adapter ---------- */
  const insertAdapter = adapters['sequence-insert'];
  const insertView = insertAdapter.normalizeView({ inserted: true });
  check('R10 normalize model', insertView.model.inserted === true && Object.keys(insertView.cues).length === 0);
  check('R10 normalize defaults false', insertAdapter.normalizeView({}).model.inserted === false);
  check('R10 normalize rejects non-boolean', hasError(attempt(() => insertAdapter.normalizeView({ inserted: 'yes' })), /inserted/));
  check('R10 validateAction insert', attempt(() => insertAdapter.validateAction({ binding: 'ins', type: 'insert' })) === null);
  check('R10 validateAction restore empty params', attempt(() => insertAdapter.validateAction({ binding: 'ins', type: 'restore', params: {} })) === null);
  check('R10 validateAction rejects unknown', hasError(attempt(() => insertAdapter.validateAction({ binding: 'ins', type: 'toggle' })), /不支持/));
  check('R10 validateAction rejects non-empty params', hasError(attempt(() => insertAdapter.validateAction({ binding: 'ins', type: 'insert', params: { index: 1 } })), /params/));

  const r10Host = makeHost();
  let settleCount = 0;
  const r10 = insertAdapter.mount(r10Host, {
    sequence: [{ key: 'a', text: '甲' }, { key: 'b', text: '乙' }, { key: 'c', text: '丙' }],
    insert: { index: 1, text: '新' },
    unit: '项',
    onSettle: () => { settleCount += 1; }
  });
  const r10Root = () => r10Host.querySelector('.seq-insert');
  check('R10 mount container', !!r10Root() && !!r10Host.querySelector('[data-adapter="sequence-insert"]'));
  check('R10 handle capabilities', typeof r10.restore === 'function' && typeof r10.readView === 'function' &&
    typeof r10.perform === 'function' && typeof r10.target === 'function');
  r10.restore({ model: { inserted: false }, cues: {} });
  check('R10 restore pending state', r10.readView().model.inserted === false);
  const pendingCard = r10.target({ kind: 'pending' });
  const sourceA = r10.target({ kind: 'source', key: 'a' });
  check('R10 pending/source targets', !!pendingCard && !!sourceA && sourceA.isConnected && r10.target({ kind: 'inserted' }) === null);
  check('R10 source unknown/__new null', r10.target({ kind: 'source', key: 'zzz' }) === null &&
    r10.target({ kind: 'source', key: '__new' }) === null && r10.target(null) === null);

  const insertHandle = r10.perform({ type: 'insert' }, { motion: 'normal' });
  check('R10 insert handle shape', !!insertHandle && insertHandle.finished instanceof Promise && typeof insertHandle.cancel === 'function');
  check('R10 insert running observable', runningAnims(r10Host).length > 0 || r10Root().getAttribute('data-anim') === 'running', 'anims=' + runningAnims(r10Host).length);
  let insertSettledEarly = false;
  insertHandle.finished.then(() => { insertSettledEarly = true; });
  await sleep(150);
  check('R10 insert finished not early', !insertSettledEarly && r10.readView().model.inserted === true);
  const insertResult = await insertHandle.finished;
  check('R10 insert completed', insertResult.status === 'completed', JSON.stringify(insertResult));
  check('R10 insert onSettle original callback', settleCount >= 1, 'settles=' + settleCount);
  check('R10 insert cleanup', runningAnims(r10Host).length === 0 && r10Root().getAttribute('data-anim') === 'idle' &&
    r10Host.querySelectorAll('.seq-insert__caret').length === 0);

  const insertedCard = r10.target({ kind: 'inserted' });
  const shiftedA = r10.target({ kind: 'source', key: 'a' });
  check('R10 inserted target after action', !!insertedCard && insertedCard.isConnected && r10.target({ kind: 'pending' }) === null);
  check('R10 target reparse after render rebuild', !!shiftedA && shiftedA !== sourceA && shiftedA.isConnected && !sourceA.isConnected,
    'same=' + (shiftedA === sourceA) + ',oldConnected=' + (sourceA && sourceA.isConnected));

  const restoreHandle = r10.perform({ type: 'restore' }, { motion: 'normal' });
  check('R10 restore running observable', runningAnims(r10Host).length > 0 || r10Root().getAttribute('data-anim') === 'running');
  const restoreResult = await restoreHandle.finished;
  check('R10 restore completed', restoreResult.status === 'completed' && r10.readView().model.inserted === false, JSON.stringify(restoreResult));
  const restoredA = r10.target({ kind: 'source', key: 'a' });
  check('R10 restore pending/card targets', r10.target({ kind: 'pending' }) !== null && r10.target({ kind: 'inserted' }) === null &&
    !!restoredA && restoredA !== shiftedA);

  const sameTargetResult = await r10.perform({ type: 'restore' }, { motion: 'normal' }).finished;
  check('R10 same-target noop completed', sameTargetResult.status === 'completed' && r10Root().getAttribute('data-anim') === 'idle');

  const runningInsert = r10.perform({ type: 'insert' }, { motion: 'normal' });
  await sleep(130);
  const sameWhileRunning = r10.perform({ type: 'insert' }, { motion: 'normal' });
  const sameWhileResult = await sameWhileRunning.finished;
  const runningInsertResult = await runningInsert.finished;
  check('R10 same-target while running completed', sameWhileResult.status === 'completed', JSON.stringify(sameWhileResult));
  check('R10 interrupted same-target cancelled', runningInsertResult.status === 'cancelled', JSON.stringify(runningInsertResult));
  check('R10 same-target running cleanup', runningAnims(r10Host).length === 0 && r10Root().getAttribute('data-anim') === 'idle');

  r10.restore({ model: { inserted: false }, cues: {} });
  const cancelInsert = r10.perform({ type: 'insert' }, { motion: 'normal' });
  await sleep(150);
  check('R10 cancel while running', runningAnims(r10Host).length > 0 || r10Root().getAttribute('data-anim') === 'running');
  cancelInsert.cancel();
  cancelInsert.cancel();
  const cancelInsertResult = await cancelInsert.finished;
  check('R10 cancel settles cancelled', cancelInsertResult.status === 'cancelled', JSON.stringify(cancelInsertResult));
  await sleep(80);
  check('R10 cancel no residue', runningAnims(r10Host).length === 0 && r10Root().getAttribute('data-anim') === 'idle' &&
    r10Host.querySelectorAll('.seq-insert__caret').length === 0);

  r10.restore({ model: { inserted: false }, cues: {} });
  const resizeHandle = r10.perform({ type: 'insert' }, { motion: 'normal' });
  await sleep(150);
  check('R10 resize precondition running', r10Root().getAttribute('data-anim') === 'running');
  r10Host.style.width = '280px';
  const resizeSettled = await settling(resizeHandle, 5000);
  check('R10 resize settles completed', resizeSettled.kind === 'settled' && resizeSettled.value.status === 'completed',
    JSON.stringify(resizeSettled.kind === 'settled' ? resizeSettled.value : resizeSettled));
  check('R10 resize cleanup', r10Root().getAttribute('data-anim') === 'idle' && runningAnims(r10Host).length === 0);

  r10.restore({ model: { inserted: false }, cues: {} });
  const strayInsert = r10.perform({ type: 'insert' }, { motion: 'normal' });
  await sleep(150);
  r10.restore({ model: { inserted: false }, cues: {} });
  const strayInsertResult = await settling(strayInsert, 3000);
  check('R10 restore during action settles', strayInsertResult.kind === 'settled' && r10.readView().model.inserted === false,
    JSON.stringify(strayInsertResult.kind === 'settled' ? strayInsertResult.value : strayInsertResult));
  check('R10 restore during action clean', runningAnims(r10Host).length === 0 && r10Root().getAttribute('data-anim') === 'idle');

  const doomedR10Host = makeHost();
  const doomedR10 = insertAdapter.mount(doomedR10Host, { sequence: [{ key: 'a', text: 'A' }], insert: { index: 1, text: 'N' } });
  doomedR10.restore({ model: { inserted: false }, cues: {} });
  const doomedInsert = doomedR10.perform({ type: 'insert' }, { motion: 'normal' });
  await sleep(130);
  doomedR10.destroy();
  const doomedInsertResult = await doomedInsert.finished;
  check('R10 destroy settles cancelled', doomedInsertResult.status === 'cancelled', JSON.stringify(doomedInsertResult));
  check('R10 destroy removes container', doomedR10Host.children.length === 0);
  await sleep(100);

  const legacyR10Host = makeHost();
  let legacySettles = 0;
  const legacyR10 = window.SeqInsert.mount(legacyR10Host, {
    sequence: [{ key: 'a', text: 'A' }, { key: 'b', text: 'B' }],
    insert: { index: 1, text: 'X' },
    onSettle: () => { legacySettles += 1; }
  });
  check('R10 legacy insert returns view', legacyR10.insert({ animate: false }) === legacyR10);
  check('R10 legacy insert state', legacyR10.inserted === true && legacyR10.state.total === 3);
  check('R10 legacy restore returns view', legacyR10.restore({ animate: false }) === legacyR10);
  check('R10 legacy toggle returns view', legacyR10.toggle({ animate: false }) === legacyR10 && legacyR10.inserted === true);
  check('R10 legacy replay returns view', legacyR10.replay({ animate: false }) === legacyR10);
  check('R10 legacy setData', legacyR10.setData({ sequence: [{ key: 'x', text: 'X' }], insert: { index: 0, text: 'N' } }) === legacyR10);
  check('R10 legacy onSettle fired', legacySettles >= 3, 'settles=' + legacySettles);
  legacyR10.destroy();
  check('R10 legacy destroy', legacyR10Host.children.length === 0);

  const savedSeqInsert = window.SeqInsert;
  delete window.SeqInsert;
  const missingInsertError = attempt(() => insertAdapter.mount(makeHost(), {}));
  window.SeqInsert = savedSeqInsert;
  check('R10 mount requires component loaded', hasError(missingInsertError, /需要先加载/), missingInsertError && missingInsertError.message);

  r10.destroy();
  check('R10 adapter destroy removes container', r10Host.children.length === 0);

  /* ---------- D01 sequence adapter：normalize 校验 ---------- */
  const sequence = adapters.sequence;
  const seqIn = {
    items: [
      { id: 'p0', value: '41' },
      { id: 'p1', value: '7E', label: '原' },
      { id: 'p2', value: 0x7d }
    ],
    groups: [{ label: '数据', ids: ['p0', 'p1'] }],
    focus: ['p1', 'p1'],
    changed: ['p2']
  };
  const seqInBefore = JSON.stringify(seqIn);
  const seqNorm = sequence.normalizeView(seqIn);
  check('sequence normalize items', seqNorm.model.items.length === 3 &&
    seqNorm.model.items[1].label === '原' && seqNorm.model.items[2].value === '125',
    JSON.stringify(seqNorm.model.items));
  check('sequence normalize groups', seqNorm.model.groups.length === 1 &&
    seqNorm.model.groups[0].label === '数据' && seqNorm.model.groups[0].ids.join(',') === 'p0,p1');
  check('sequence normalize cues dedupe', seqNorm.cues.focus.join(',') === 'p1' && seqNorm.cues.changed.join(',') === 'p2');
  check('sequence normalize does not mutate input', JSON.stringify(seqIn) === seqInBefore);
  const seqMinimal = sequence.normalizeView({ items: [{ id: 'x' }] });
  check('sequence normalize defaults', seqMinimal.model.items[0].value === '' && seqMinimal.model.items[0].label === '' &&
    seqMinimal.model.groups.length === 0 && seqMinimal.cues.focus.length === 0);
  check('sequence normalize rejects missing items', hasError(attempt(() => sequence.normalizeView({})), /items/));
  check('sequence normalize rejects non-array items', hasError(attempt(() => sequence.normalizeView({ items: 'x' })), /items/));
  check('sequence normalize rejects non-object item', hasError(attempt(() => sequence.normalizeView({ items: ['a'] })), /items\[0\]/));
  check('sequence normalize rejects missing id', hasError(attempt(() => sequence.normalizeView({ items: [{ value: '1' }] })), /id/));
  check('sequence normalize rejects numeric id', hasError(attempt(() => sequence.normalizeView({ items: [{ id: 3 }] })), /字符串/));
  check('sequence normalize rejects empty id', hasError(attempt(() => sequence.normalizeView({ items: [{ id: '' }] })), /非空字符串/));
  check('sequence normalize rejects duplicate id', hasError(attempt(() => sequence.normalizeView({
    items: [{ id: 'a', value: '1' }, { id: 'a', value: '2' }]
  })), /重复/));
  check('sequence normalize rejects start-style group', hasError(attempt(() => sequence.normalizeView({
    items: [{ id: 'a', value: '1' }], groups: [{ label: 'G', start: 0, count: 1 }]
  })), /只接受/));
  check('sequence normalize rejects group unknown id', hasError(attempt(() => sequence.normalizeView({
    items: [{ id: 'a', value: '1' }], groups: [{ label: 'G', ids: ['zzz'] }]
  })), /不存在/));
  check('sequence normalize rejects double-assigned id', hasError(attempt(() => sequence.normalizeView({
    items: [{ id: 'a', value: '1' }, { id: 'b', value: '2' }],
    groups: [{ label: 'G', ids: ['a'] }, { label: 'H', ids: ['a'] }]
  })), /重复分组/));
  check('sequence normalize rejects unknown focus ref', hasError(attempt(() => sequence.normalizeView({
    items: [{ id: 'a', value: '1' }], focus: ['zzz']
  })), /不存在/));
  check('sequence normalize rejects non-array changed', hasError(attempt(() => sequence.normalizeView({
    items: [{ id: 'a', value: '1' }], changed: 'a'
  })), /数组/));
  check('sequence validateAction rejects action path', hasError(attempt(() => sequence.validateAction({
    binding: 'wire', type: 'remove', params: { id: 'p0' }
  })), /动作路径/));

  /* ---------- D01 sequence adapter：restore / readView / target ---------- */
  const sourceInput = {
    items: [{ id: 'a', value: '41' }, { id: 'b', value: '7E' }, { id: 'c', value: '7D' }],
    groups: [],
    focus: [],
    changed: []
  };
  const sourceView = sequence.normalizeView(sourceInput);
  const sHost = makeHost();
  const s = sequence.mount(sHost, { variant: 'bytes', label: '线路自检' });
  const sRoot = sHost.querySelector('.nviz-sequence');
  check('sequence mount creates D01 root', !!sRoot && sRoot.parentNode === sHost && s.target({ part: 'root' }) === sRoot);
  check('sequence handle capabilities', typeof s.restore === 'function' && typeof s.readView === 'function' &&
    typeof s.applyCues === 'function' && typeof s.target === 'function' &&
    typeof s.prepareChange === 'function' && typeof s.destroy === 'function');
  s.restore(sourceView);
  const sRead = s.readView();
  check('sequence restore/readView canonical', JSON.stringify(sRead) === JSON.stringify(sourceView), JSON.stringify(sRead));
  check('sequence restore renders units', sHost.querySelectorAll('.nviz-sequence__unit').length === 3 &&
    sHost.querySelector('.nviz-sequence__unit[data-id="b"] .nviz-sequence__value').textContent === '7E');
  s.restore({ model: sourceView.model, cues: { focus: ['b'], changed: ['a'] } });
  check('sequence restore cues rendered', sHost.querySelector('.nviz-sequence__unit[data-id="a"]').getAttribute('data-mark') === 'changed' &&
    sHost.querySelector('.nviz-sequence__unit[data-id="b"]').getAttribute('data-mark') === 'focus');
  s.restore({
    model: { items: [{ id: 'x', value: '1', label: '' }], groups: [] },
    cues: { focus: [], changed: [] }
  });
  check('sequence repeated restore clears stale', sHost.querySelectorAll('.nviz-sequence__unit').length === 1 &&
    sHost.querySelector('.nviz-sequence__unit').getAttribute('data-mark') === 'none');
  s.applyCues({ focus: ['x'], changed: [] });
  const sCueRead = s.readView();
  check('sequence applyCues', sCueRead.cues.focus.join(',') === 'x' && sCueRead.model.items.length === 1 &&
    sHost.querySelector('.nviz-sequence__unit').getAttribute('data-mark') === 'focus');
  s.restore(sourceView);
  check('sequence target unit id', s.target({ id: 'b' }).getAttribute('data-id') === 'b');
  check('sequence target parts', s.target({ id: 'b', part: 'cell' }).className.indexOf('nviz-sequence__cell') >= 0 &&
    s.target({ id: 'b', part: 'value' }).textContent === '7E' &&
    s.target({ id: 'b', part: 'label' }) !== null &&
    s.target({ id: 'b', part: 'mark' }).className.indexOf('nviz-sequence__mark') >= 0);
  check('sequence target unknown null', s.target({ id: 'zzz' }) === null &&
    s.target({ id: 'b', part: 'nope' }) === null && s.target(null) === null);

  /* ---------- D01 getState / getMotionTargets ---------- */
  const compHost = makeHost();
  const comp = window.NoteViz.Sequence.mount(compHost, {
    variant: 'bytes',
    items: [{ id: 'p0', value: '41' }, { id: 'p1', value: '7E', label: '原' }],
    groups: [{ label: '组', ids: ['p0'] }, { start: 1, count: 1 }],
    focus: ['p1'],
    changed: ['p0']
  });
  const compState = comp.getState();
  check('D01 getState items copy', compState.items.length === 2 &&
    compState.items[1].id === 'p1' && compState.items[1].value === '7E' &&
    compState.items[1].label === '原' && !('key' in compState.items[0]), JSON.stringify(compState.items));
  // T5 修复后的 groups 读回契约：按实际渲染分组归一为 {label, ids}，只含现存对象 ID，
  // start/count 形式也必须读回为完整分组，而不是空数组或原样透传。不要放宽回旧行为。
  check('D01 getState groups only label+ids', compState.groups.length === 2 &&
    compState.groups[0].label === '组' && compState.groups[0].ids.join(',') === 'p0' &&
    compState.groups[1].label === '' && compState.groups[1].ids.join(',') === 'p1' &&
    compState.groups.every((group) => !('start' in group) && !('count' in group)));
  check('D01 getState cues in items order', compState.cues.focus.join(',') === 'p1' &&
    compState.cues.changed.join(',') === 'p0');
  compState.items[0].value = 'mutated';
  compState.groups.push({ label: 'x', ids: [] });
  const compStateAgain = comp.getState();
  check('D01 getState returns fresh copy', compStateAgain.items[0].value === '41' && compStateAgain.groups.length === 2);
  comp.update({
    items: [{ id: 'q0', value: 'AA' }, { id: 'q1', value: 'BB' }],
    groups: [],
    focus: ['q0'],
    changed: []
  });
  const compStateUpdated = comp.getState();
  check('D01 getState reads last rendered state', compStateUpdated.items.map((item) => item.id).join(',') === 'q0,q1' &&
    compStateUpdated.cues.focus.join(',') === 'q0' && compStateUpdated.cues.changed.length === 0);
  const compTargets = comp.getMotionTargets();
  check('D01 getMotionTargets real nodes', compTargets.length === 2 && compTargets[0].id === 'q0' &&
    compTargets[0].unit.nodeType === 1 && compTargets[0].unit.isConnected &&
    compTargets[0].contentEl === compTargets[0].unit.querySelector('.nviz-sequence__cell') &&
    compTargets[0].valueEl.textContent === 'AA' &&
    compTargets[0].labelEl.className.indexOf('nviz-sequence__label') >= 0 &&
    compTargets[0].markEl.className.indexOf('nviz-sequence__mark') >= 0, JSON.stringify(compTargets.map((target) => target.id)));
  check('D01 getTarget original behavior kept', comp.getTarget('q1') === compTargets[1].unit && comp.getTarget('zzz') === null);
  const oldCompTarget = comp.getTarget('q0');
  comp.update({ items: [{ id: 'r0', value: 'CC' }], groups: [], focus: [], changed: [] });
  const afterTargets = comp.getMotionTargets();
  check('D01 getMotionTargets refreshed after render', afterTargets.length === 1 && afterTargets[0].id === 'r0' &&
    afterTargets[0].unit !== oldCompTarget && !oldCompTarget.isConnected);
  /* ---------- sequence prepareChange：commit / targets / facts / effects / cleanup ---------- */
  const pcSource = sequence.normalizeView({
    items: [{ id: 'a', value: '41' }, { id: 'b', value: '7E' }, { id: 'c', value: '7D' }]
  });
  const pcTarget = sequence.normalizeView({
    items: [
      { id: 'a', value: '41' },
      { id: 'e1', value: '7D', label: '插入' },
      { id: 'e2', value: '7D', label: '插入' },
      { id: 'b', value: '5E' },
      { id: 'c', value: '5D' }
    ],
    groups: [{ label: '转义', ids: ['e1', 'b'] }],
    focus: ['b'],
    changed: ['e1', 'b']
  });
  const signal = new AbortController().signal;
  s.restore(pcSource);
  const unitsBeforePrepare = sHost.querySelectorAll('.nviz-sequence__unit').length;
  const change = s.prepareChange({ sourceView: pcSource, targetView: pcTarget, signal, motion: 'auto' });
  check('sequence prepareChange returns prepared', !!change &&
    typeof change.commit === 'function' && typeof change.targets === 'function' &&
    typeof change.effects === 'function' && typeof change.facts === 'function' &&
    typeof change.cleanup === 'function' && !(change instanceof Promise));
  check('sequence prepare does not commit early', sHost.querySelectorAll('.nviz-sequence__unit').length === unitsBeforePrepare);
  const prepareTargets = change.targets();
  check('sequence targets before commit = source', prepareTargets.length === 3 &&
    prepareTargets.map((target) => target.id).join(',') === 'a,b,c' &&
    prepareTargets[0].layoutEl === prepareTargets[0].unit &&
    prepareTargets[0].layoutEl.isConnected);
  check('sequence prepare readView still source', s.readView().model.items.map((item) => item.id).join(',') === 'a,b,c');
  const prepareFacts = change.facts();
  check('sequence facts entered/exited/valueChanged', prepareFacts.entered.join(',') === 'e1,e2' &&
    prepareFacts.exited.length === 0 && prepareFacts.valueChanged.join(',') === 'b,c', JSON.stringify(prepareFacts));
  change.facts().entered.push('tampered');
  check('sequence facts returns fresh copy', change.facts().entered.join(',') === 'e1,e2');
  check('sequence prepareChange requires source/target views',
    hasError(attempt(() => s.prepareChange({})), /sourceView/) &&
    hasError(attempt(() => s.prepareChange({ sourceView: pcSource })), /targetView/));

  const originalSequenceMount = window.NoteViz.Sequence.mount;
  const callLog = [];
  window.NoteViz.Sequence.mount = function (host, options) {
    const instance = originalSequenceMount.call(window.NoteViz.Sequence, host, options);
    const originalUpdate = instance.update;
    instance.update = function (patch) {
      callLog.push('update');
      return originalUpdate.call(instance, patch);
    };
    return instance;
  };
  const spyHost = makeHost();
  const spyHandle = sequence.mount(spyHost, { variant: 'bytes' });
  window.NoteViz.Sequence.mount = originalSequenceMount;
  spyHandle.restore(pcSource);
  callLog.length = 0;
  const spyChange = spyHandle.prepareChange({ sourceView: pcSource, targetView: pcTarget, signal, motion: 'auto' });
  spyChange.commit();
  check('sequence commit performs one update', callLog.join(',') === 'update', callLog.join(','));
  check('sequence commit applies target', spyHandle.readView().model.items.map((item) => item.id).join(',') === 'a,e1,e2,b,c' &&
    spyHost.querySelectorAll('.nviz-sequence__unit').length === 5);
  check('sequence commit renders groups', spyHost.textContent.indexOf('转义') >= 0);
  check('sequence commit renders cues', spyHost.querySelector('.nviz-sequence__unit[data-id="b"]').getAttribute('data-mark') === 'both' &&
    spyHost.querySelector('.nviz-sequence__unit[data-id="e1"]').getAttribute('data-mark') === 'changed');
  check('sequence readView matches target canonical', JSON.stringify(spyHandle.readView()) === JSON.stringify(pcTarget),
    JSON.stringify(spyHandle.readView()).slice(0, 300));
  const committedTargets = spyChange.targets();
  check('sequence targets after commit layoutEl', committedTargets.length === 5 && committedTargets[1].id === 'e1' &&
    committedTargets[1].layoutEl === committedTargets[1].unit && committedTargets[1].layoutEl.isConnected &&
    committedTargets[1].contentEl.nodeType === 1 && committedTargets[1].valueEl.textContent === '7D');

  const defaultSpecs = spyChange.effects();
  check('sequence effects count', defaultSpecs.length === 9, 'specs=' + defaultSpecs.length);
  const isGhost = (spec) => spec.el.classList && spec.el.classList.contains('nviz-sequence__value--ghost');
  const ghostSpecs = defaultSpecs.filter(isGhost);
  check('sequence effects value ghost', ghostSpecs.length === 2 &&
    ghostSpecs.every((spec) => spec.cleanupEl === spec.el && spec.el.getAttribute('aria-hidden') === 'true') &&
    ghostSpecs[0].keyframes[1].opacity === '1' && ghostSpecs[0].keyframes[2].opacity === '0',
    JSON.stringify(ghostSpecs.map((spec) => ({ text: spec.el.textContent, options: spec.options }))));
  const enteredSpecs = defaultSpecs.filter((spec) => spec.el.classList &&
    spec.el.classList.contains('nviz-sequence__cell') && spec.keyframes[0].transform !== undefined);
  check('sequence effects entered', enteredSpecs.length === 2 &&
    enteredSpecs[0].keyframes[0].opacity === '0' &&
    enteredSpecs[0].keyframes[0].transform === 'translateY(-4px) scale(.94)' &&
    enteredSpecs[0].keyframes[1].opacity === '1' &&
    enteredSpecs[0].keyframes[1].transform === 'none' &&
    enteredSpecs[0].options.duration === 420 &&
    enteredSpecs[0].options.delay === 0 &&
    enteredSpecs[1].options.delay === 40, JSON.stringify(enteredSpecs.map((spec) => spec.options)));
  const valueFadeSpecs = defaultSpecs.filter((spec) => !isGhost(spec) && spec.el.classList &&
    spec.el.classList.contains('nviz-sequence__value') && spec.keyframes[0].opacity !== undefined);
  check('sequence effects value replacement', valueFadeSpecs.length === 2 &&
    valueFadeSpecs[0].keyframes[0].opacity === '0' &&
    valueFadeSpecs[0].keyframes[1].opacity === '0' &&
    valueFadeSpecs[0].keyframes[2].opacity === '1' &&
    valueFadeSpecs[0].options.duration === 420 && valueFadeSpecs[0].options.delay === 160 &&
    valueFadeSpecs[1].options.delay === 200 && valueFadeSpecs[0].options.easing === 'linear',
    JSON.stringify(valueFadeSpecs.map((spec) => spec.options)));
  const valueSpecs = defaultSpecs.filter((spec) => spec.keyframes[0].backgroundColor);
  check('sequence effects value flash', valueSpecs.length === 2 &&
    valueSpecs[0].keyframes[0].backgroundColor === 'rgba(247,201,72,.55)' &&
    valueSpecs[0].keyframes[1].backgroundColor === 'rgba(247,201,72,.55)' &&
    valueSpecs[0].keyframes[2].backgroundColor === 'rgba(247,201,72,0)' &&
    valueSpecs[0].options.duration === 560 && valueSpecs[0].options.delay === 160 &&
    valueSpecs[0].role === 'mark' && valueSpecs[1].options.delay === 200);
  const focusSpecs = defaultSpecs.filter((spec) => spec.keyframes[0].boxShadow);
  check('sequence effects focus pulse', focusSpecs.length === 1 &&
    focusSpecs[0].keyframes[0].boxShadow === '0 0 0 0 rgba(49,92,218,.45)' &&
    focusSpecs[0].keyframes[1].boxShadow === '0 0 0 6px rgba(49,92,218,0)' &&
    focusSpecs[0].options.delay === 200 && focusSpecs[0].options.duration === 420);
  check('sequence effects keep unit transforms for layout engine',
    defaultSpecs.every((spec) => !spec.el.classList.contains('nviz-sequence__unit')));
  const customSpecs = spyChange.effects({
    timing: {
      enterDuration: 300, stagger: 30,
      valueSwapDelay: 80, valueSwapDuration: 260, valueFlashDuration: 500,
      markDelay: 50, markDuration: 200, easing: 'ease-out'
    }
  });
  const customGhosts = customSpecs.filter(isGhost);
  const customEntered = customSpecs.filter((spec) => spec.el.classList &&
    spec.el.classList.contains('nviz-sequence__cell') && spec.keyframes[0].transform !== undefined);
  const customValue = customSpecs.filter((spec) => spec.keyframes[0].backgroundColor);
  const customFocus = customSpecs.filter((spec) => spec.keyframes[0].boxShadow);
  check('sequence effects custom timing', customEntered.length === 2 &&
    customEntered[0].options.duration === 300 && customEntered[1].options.delay === 30 &&
    customEntered[0].options.easing === 'ease-out' &&
    customGhosts.length === 2 && customGhosts[0].options.delay === 80 &&
    customGhosts[1].options.delay === 110 && customGhosts[0].options.duration === 260 &&
    customValue.length === 2 && customValue[0].options.duration === 500 &&
    customFocus.length === 1 && customFocus[0].options.delay === 50 && customFocus[0].options.duration === 200);
  spyChange.cleanup();
  spyChange.cleanup();
  check('sequence cleanup idempotent', spyHost.querySelectorAll('.nviz-sequence__unit').length === 5 &&
    spyHost.querySelectorAll('.nviz-sequence__value--ghost').length === 0);
  check('sequence commit/cleanup call order', callLog.join(',') === 'update', callLog.join(','));
  spyHandle.destroy();

  const neverHost = makeHost();
  const neverHandle = sequence.mount(neverHost, { variant: 'bytes' });
  neverHandle.restore(pcSource);
  const neverChange = neverHandle.prepareChange({ sourceView: pcSource, targetView: pcTarget, signal, motion: 'never' });
  neverChange.commit();
  check('sequence motion:never still commits', neverHandle.readView().model.items.length === 5);
  check('sequence motion:never declares no effects', neverChange.effects().length === 0);
  neverChange.cleanup();
  neverHandle.destroy();

  /* ---------- sequence adopt / destroy / 缺失依赖 ---------- */
  const borrowedSeqSceneHost = makeHost();
  const borrowedSeqComp = window.NoteViz.Sequence.mount(borrowedSeqSceneHost, {
    items: [{ id: 'x', value: '1' }], groups: [], focus: [], changed: []
  });
  const borrowedSeq = sequence.adopt(borrowedSeqComp);
  check('sequence adopt handle', typeof borrowedSeq.prepareChange === 'function' && typeof borrowedSeq.readView === 'function');
  borrowedSeq.restore(pcSource);
  check('sequence borrowed readView external state', borrowedSeq.readView().model.items.map((item) => item.id).join(',') === 'a,b,c');
  borrowedSeqComp.update({ focus: ['a'] });
  check('sequence readView reflects live external state', borrowedSeq.readView().cues.focus.join(',') === 'a');
  borrowedSeq.destroy();
  check('sequence borrowed destroy keeps external instance', borrowedSeqComp.el.isConnected && borrowedSeqSceneHost.children.length === 1);
  borrowedSeqComp.destroy();
  check('sequence adopt rejects invalid instance', hasError(attempt(() => sequence.adopt({})), /adopt/));
  const savedSequence = window.NoteViz.Sequence;
  delete window.NoteViz.Sequence;
  const missingSequenceError = attempt(() => sequence.mount(makeHost(), {}));
  window.NoteViz.Sequence = savedSequence;
  check('sequence mount requires component loaded', hasError(missingSequenceError, /需要先加载/), missingSequenceError && missingSequenceError.message);

  const doomedSeqHost = makeHost();
  const doomedSeq = sequence.mount(doomedSeqHost, {});
  doomedSeq.restore(pcSource);
  const doomedSeqChange = doomedSeq.prepareChange({ sourceView: pcSource, targetView: pcTarget, signal, motion: 'auto' });
  doomedSeqChange.commit();
  doomedSeq.destroy();
  doomedSeqChange.cleanup();
  check('sequence destroy releases owned instance', doomedSeqHost.children.length === 0);

  /* ---------- borrowed（adopt）边界：不销毁外部实例、不覆盖回调 ---------- */
  check('M01 adopt rejects invalid instance', hasError(attempt(() => seqAdapter.adopt({})), /adopt/));
  check('matrix adopt rejects invalid instance', hasError(attempt(() => matrixAdapter.adopt({})), /adopt/));
  const borrowedSeqHost = makeHost();
  let borrowedExternalChanges = 0;
  const borrowedSeqInstance = window.NoteViz.SequenceEdit.mount(borrowedSeqHost, {
    items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    onChange: () => { borrowedExternalChanges += 1; }
  });
  const borrowedSeqHandle = seqAdapter.adopt(borrowedSeqInstance);
  borrowedSeqHandle.restore({
    model: { items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }] },
    cues: { focus: ['c'], changed: [] }
  });
  check('M01 borrowed restore/readView', ids(borrowedSeqHandle) === 'a,b,c' && borrowedSeqHandle.readView().cues.focus.join(',') === 'c');
  const borrowedActionResult = await borrowedSeqHandle.perform({ type: 'remove', params: { id: 'b' } }, { motion: 'normal' }).finished;
  check('M01 borrowed perform', borrowedActionResult.status === 'completed' && ids(borrowedSeqHandle) === 'a,c', JSON.stringify(borrowedActionResult));
  borrowedSeqHandle.destroy();
  check('M01 borrowed destroy keeps external instance', borrowedSeqInstance.el.isConnected && borrowedSeqHost.children.length === 1);
  const changesBeforeExternal = borrowedExternalChanges;
  borrowedSeqInstance.remove('a');
  check('M01 borrowed external callback preserved', borrowedExternalChanges === changesBeforeExternal + 1 &&
    borrowedSeqInstance.getState().items.map((item) => item.id).join(',') === 'c', 'changes=' + borrowedExternalChanges);
  await sleep(700);
  borrowedSeqInstance.destroy();

  const borrowedMatrixHost = makeHost();
  const borrowedMatrixInstance = window.NoteViz.Matrix.mount(borrowedMatrixHost, {
    rows: [{ id: 'r1', label: 'R' }], columns: [{ id: 'c1', label: 'C' }], values: [['x']]
  });
  const borrowedMatrixHandle = matrixAdapter.adopt(borrowedMatrixInstance);
  borrowedMatrixHandle.restore({
    model: { rows: [{ id: 'r1', label: 'R' }], columns: [{ id: 'c1', label: 'C' }], values: [['y']] },
    cues: { focus: { rows: [], cols: [], cells: [] }, changed: { rows: [], cols: [], cells: [] }, caption: '' }
  });
  const borrowedMatrixCell = borrowedMatrixHandle.target({ row: 'r1', col: 'c1' });
  check('matrix borrowed restore/target', !!borrowedMatrixCell && borrowedMatrixCell.textContent.indexOf('y') >= 0);
  borrowedMatrixHandle.destroy();
  check('matrix borrowed destroy keeps external instance', borrowedMatrixInstance.el.isConnected && borrowedMatrixHost.children.length === 1);
  borrowedMatrixInstance.destroy();

  const borrowedInsertHost = makeHost();
  const borrowedInsertInstance = window.SeqInsert.mount(borrowedInsertHost, {
    sequence: [{ key: 'a', text: 'A' }], insert: { index: 1, text: 'N' }
  });
  const borrowedInsertHandle = insertAdapter.adopt(borrowedInsertInstance);
  borrowedInsertHandle.restore({ model: { inserted: false }, cues: {} });
  const borrowedInsertResult = await borrowedInsertHandle.perform({ type: 'insert' }, { motion: 'normal' }).finished;
  check('R10 borrowed perform', borrowedInsertResult.status === 'completed' && borrowedInsertInstance.inserted === true, JSON.stringify(borrowedInsertResult));
  borrowedInsertHandle.destroy();
  check('R10 borrowed destroy keeps external instance', borrowedInsertInstance.el.isConnected && borrowedInsertHost.children.length === 1);
  borrowedInsertInstance.destroy();

  const borrowedDomRoot = document.createElement('span');
  rootEl.appendChild(borrowedDomRoot);
  const borrowedDomHandle = domAdapter.adopt(borrowedDomRoot);
  borrowedDomHandle.restore({ model: { text: '借用' }, cues: {} });
  check('dom borrowed restore/target', borrowedDomRoot.textContent === '借用' && borrowedDomHandle.target({ part: 'root' }) === borrowedDomRoot);
  borrowedDomHandle.destroy();
  check('dom borrowed destroy keeps element', borrowedDomRoot.isConnected && borrowedDomRoot.textContent === '借用');
  borrowedDomRoot.remove();

  return checks;
});
await normal.context.close();

/* =========================================================================
 * 减少动效页：无原生动画路径也应结算 completed
 * ======================================================================= */
const reduced = await makePage(browser, { label: 'reduced', reduced: true });
await evalChecks('reduced motion', reduced.page, async () => {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail).slice(0, 500) });
  const runningAnims = (node) => node.getAnimations({ subtree: true }).filter((anim) => !('transitionProperty' in anim) && anim.playState === 'running');
  const rootEl = document.getElementById('root');
  rootEl.replaceChildren();
  const host = document.createElement('div');
  rootEl.appendChild(host);
  const adapters = window.NoteDemoInternals.adapters;

  const m01 = adapters['sequence-edit'].mount(host, {});
  m01.restore({ model: { items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }] }, cues: { focus: [], changed: [] } });
  const reducedAction = m01.perform({ type: 'remove', params: { id: 'b' } }, { motion: 'reduced' });
  const reducedResult = await reducedAction.finished;
  check('M01 reduced motion completed', reducedResult.status === 'completed' && m01.readView().model.items.map((item) => item.id).join(',') === 'a,c',
    JSON.stringify(reducedResult));
  check('M01 reduced motion no animation', runningAnims(host).length === 0 && host.querySelector('.nviz-sequence-edit').getAttribute('data-anim') === 'idle');
  m01.destroy();

  const host2 = document.createElement('div');
  rootEl.appendChild(host2);
  const r10 = adapters['sequence-insert'].mount(host2, { sequence: [{ key: 'a', text: 'A' }], insert: { index: 1, text: 'N' } });
  r10.restore({ model: { inserted: false }, cues: {} });
  const reducedInsert = r10.perform({ type: 'insert' }, { motion: 'reduced' });
  const reducedInsertResult = await reducedInsert.finished;
  check('R10 reduced motion completed', reducedInsertResult.status === 'completed' && r10.readView().model.inserted === true,
    JSON.stringify(reducedInsertResult));
  check('R10 reduced motion no animation', runningAnims(host2).length === 0 && host2.querySelector('.seq-insert').getAttribute('data-anim') === 'idle');
  r10.destroy();

  return checks;
});
await reduced.context.close();
await browser.close();

/* =========================================================================
 * 静态与清单检查：适配器文件与顺序全部从 src/manifests 推导
 * ======================================================================= */
const runtimeFiles = moduleScripts(root, ['demo-runtime']);
const adapterFiles = runtimeFiles.filter((rel) => rel.indexOf('/demo/adapters/') >= 0);
check('manifest declares adapter sources', adapterFiles.length >= 2, adapterFiles.join(', '));
// 目录里的适配器源文件必须全部进入 manifest，否则拆分会静默漏载。
const adapterDir = path.join(root, 'src', 'demo', 'adapters');
const adapterDiskFiles = fs.existsSync(adapterDir)
  ? fs.readdirSync(adapterDir).filter((name) => name.endsWith('.js')).map((name) => 'src/demo/adapters/' + name).sort()
  : [];
check('adapter directory files all declared in manifest',
  adapterDiskFiles.length > 0 && adapterDiskFiles.every((rel) => runtimeFiles.indexOf(rel) >= 0),
  adapterDiskFiles.filter((rel) => runtimeFiles.indexOf(rel) < 0).join(', ') || adapterDiskFiles.join(', '));
adapterFiles.forEach((rel) => {
  check('file exists ' + rel, fs.existsSync(src(rel)), rel);
  if (!fs.existsSync(src(rel))) return;
  const code = fs.readFileSync(src(rel), 'utf8');
  check('no eval in ' + rel, !/\beval\s*\(/.test(code));
  check('no fetch in ' + rel, !/\bfetch\s*\(/.test(code));
  check('no XHR/WebSocket in ' + rel, !/XMLHttpRequest|WebSocket/.test(code));
  check('no external URL in ' + rel, !/https?:\/\//.test(code));
  check('no innerHTML in ' + rel, !/\.innerHTML\s*=/.test(code));
  check('classic script wrapper ' + rel, /^\(function \(global\) \{/m.test(code) && /\}\)\(window\);\s*$/.test(code));
});
const adapterIndex = adapterFiles.findIndex((rel) => /\/adapters\/index\.js$/.test(rel));
check('adapter registry file loads after component adapters',
  adapterIndex === adapterFiles.length - 1 && adapterIndex > 0,
  adapterFiles.join(', '));
check('adapter registry loads after timeline/scene runtime sources',
  adapterIndex > 0 && runtimeFiles.indexOf(adapterFiles[adapterIndex]) > 0,
  adapterFiles[adapterIndex] || 'missing index.js');
check('module public entry files load after the adapter registry',
  adapterIndex >= 0 && runtimeFiles.slice(runtimeFiles.indexOf(adapterFiles[adapterIndex]) + 1).length > 0,
  runtimeFiles.join(', '));
const mechanismsSource = readModuleSourceText(root, 'viz-mechanisms');
check('M01 restoreView/applyViewCues/runAction exported',
  ['restoreView: function', 'applyViewCues: function', 'runAction: function'].every((key) => mechanismsSource.indexOf(key) >= 0));
const legacySource = readModuleSourceText(root, 'legacy');
check('R10 restoreView/runAction/getTarget exported',
  ['view.restoreView = function', 'view.runAction = function', 'view.getTarget = function'].every((key) => legacySource.indexOf(key) >= 0));

const failed = checks.filter((item) => !item.ok);
const summary = {
  total: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  consoleErrors: pageErrors,
  failures: failed,
  checkedAt: new Date().toISOString()
};
writeCacheJson(root, ['demo', 'adapters-check-result.json'], { summary, checks });
console.log(JSON.stringify(summary, null, 2));
if (failed.length || pageErrors.length) process.exitCode = 1;
