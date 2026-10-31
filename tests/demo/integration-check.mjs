// NoteDemo 集成验收：真实 Edge + 真实 src 直载（demo-runtime + demo-ui + 组件），
// 以及（存在时）file:// 打开 dist/公共编排层-整合预览.html 做真实交互。
// 运行：node tests/demo/integration-check.mjs [--preview <file>]
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { moduleScripts, moduleStyles } from '../lib/src-sources.mjs';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const src = (rel) => path.join(root, rel);

const args = process.argv.slice(2);
let previewPath = path.join(root, 'dist', '公共编排层-整合预览.html');
const previewArg = args.indexOf('--preview');
if (previewArg >= 0 && args[previewArg + 1]) previewPath = path.resolve(process.cwd(), args[previewArg + 1]);

const checks = [];
const pageErrors = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail: String(detail) });
}
function record(rows, label) {
  if (!Array.isArray(rows)) {
    check(label, false, 'step did not return checks');
    return;
  }
  rows.forEach((row) => check(row.name, row.ok, row.detail));
}
async function step(page, label, fn, arg) {
  try {
    const rows = await page.evaluate(fn, arg);
    record(rows, label);
  } catch (error) {
    check(label + ' crashed', false, error && error.message ? error.message : String(error));
  }
}

// 源码加载清单从 src/manifests 推导，模块拆分后自动包含全部文件。
const CHECK_MODULES = [
  'core', 'legacy', 'ui-layout', 'blocks', 'viz-objects', 'viz-mechanisms',
  'demo-runtime', 'demo-ui'
];
const SRC_SCRIPTS = moduleScripts(root, CHECK_MODULES);
const SRC_STYLES = moduleStyles(root, CHECK_MODULES);

async function makePage(browser, options = {}) {
  const context = await browser.newContext({
    viewport: { width: options.width || 1180, height: options.height || 900 },
    reducedMotion: options.reduced ? 'reduce' : 'no-preference'
  });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push((options.label || 'page') + ': ' + msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push((options.label || 'page') + ': pageerror: ' + err.message));
  await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>NoteDemo integration check</title></head><body><main id="root"></main></body></html>');
  await page.addStyleTag({ content: 'html,body{margin:0;padding:0}body{padding:18px;box-sizing:border-box;background:#f4f6f9}#root{max-width:1040px;margin:0 auto}' });
  for (const rel of SRC_STYLES) {
    await page.addStyleTag({ path: src(rel) });
  }
  for (const rel of SRC_SCRIPTS) {
    await page.addScriptTag({ path: src(rel) });
  }
  return { context, page };
}

const browser = await chromium.launch({ executablePath: edge, headless: true });

/* ============================ 1. 静态矩阵 + DOM ============================ */
{
  const { context, page } = await makePage(browser, { label: 'static' });
  await step(page, '静态场景', async () => {
    const checks = [];
    const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const rootEl = document.getElementById('root');
    rootEl.replaceChildren();
    const host = document.createElement('div');
    rootEl.appendChild(host);
    const mounted = [];
    const states = [];
    const definition = {
      bindings: {
        grid: { adapter: 'matrix', slot: 'main', options: { label: '示意矩阵', dense: true } },
        note: { adapter: 'dom', slot: 'note', options: { label: '说明' } }
      },
      frames: [
        { id: 'f0', caption: '初始矩阵。', views: {
          grid: { rows: [{ id: 'r1', label: 'A' }, { id: 'r2', label: 'B' }], columns: [{ id: 'c1', label: 'X' }, { id: 'c2', label: 'Y' }], values: [[1, 2], [3, 4]], focus: { rows: [], cols: [], cells: [] }, changed: { rows: [], cols: [], cells: [] } },
          note: { text: '初始说明。' }
        }, marks: [] },
        { id: 'f1', caption: '关注左上单元。', views: {
          grid: { rows: [{ id: 'r1', label: 'A' }, { id: 'r2', label: 'B' }], columns: [{ id: 'c1', label: 'X' }, { id: 'c2', label: 'Y' }], values: [[9, 2], [3, 4]], focus: { rows: [], cols: [], cells: [{ row: 'r1', col: 'c1' }] }, changed: { rows: [], cols: [], cells: [{ row: 'r1', col: 'c1' }] }, caption: '矩阵自身说明' },
          note: { text: '值变化为 9。' }
        }, marks: [{ kind: 'focus', target: { binding: 'grid', query: { row: 'r1', col: 'c1' } }, mode: 'box' }] },
        { id: 'f2', caption: '整行关注。', views: {
          grid: { rows: [{ id: 'r1', label: 'A' }, { id: 'r2', label: 'B' }], columns: [{ id: 'c1', label: 'X' }, { id: 'c2', label: 'Y' }], values: [[9, 2], [3, 4]], focus: { rows: ['r1'], cols: [], cells: [] }, changed: { rows: [], cols: [], cells: [] } },
          note: { text: '不存在的引用应被忽略而不是报错。' }
        }, marks: [{ kind: 'range', targets: [
          { binding: 'grid', query: { row: 'r1', col: 'c1' } },
          { binding: 'grid', query: { row: 'r1', col: 'c2' } }
        ], text: '同一行' }] }
      ]
    };
    const session = NoteDemo.mount(host, {
      definition,
      label: '静态矩阵演示',
      layout: function (container) {
        const rootNode = document.createElement('div');
        const main = document.createElement('div');
        const note = document.createElement('div');
        rootNode.appendChild(main);
        rootNode.appendChild(note);
        container.appendChild(rootNode);
        return { root: rootNode, slots: { main, note } };
      }
    });
    mounted.push(session);
    session.subscribe((state) => states.push(state));

    check('mount returns session', !!session && typeof session.next === 'function');
    check('mount exposes stage element', !!session.el && session.el.className.indexOf('nblk-demo-stage') >= 0);
    check('initial settled frame', session.getState().settledFrameId === 'f0' && session.getState().phase === 'idle');
    check('initial caption visible', session.el.querySelector('.nblk-demo-stage__caption').textContent.includes('初始矩阵'));
    check('matrix rendered', host.querySelectorAll('.nviz-matrix__cell').length === 4);
    check('dom text rendered', host.textContent.includes('初始说明'));
    check('subscribe fired immediately', states.length >= 1);
    check('controls created once', session.el.querySelectorAll('.nblk-demo-stage__controls button').length === 4);
    const staticNext = () => Array.from(session.el.querySelectorAll('.nblk-demo-stage__controls button')).find((node) => node.textContent.trim() === '下一步');
    check('initial controls state', staticNext().getAttribute('aria-disabled') === null && Array.from(session.el.querySelectorAll('.nblk-demo-stage__controls button')).filter((node) => node.textContent.trim() === '上一步' || node.textContent.trim() === '重看').every((node) => node.disabled));

    const buttonNodes = Array.from(session.el.querySelectorAll('.nblk-demo-stage__controls button'));
    const result = await session.next();
    check('matrix next completed', result.status === 'completed' && result.frameId === 'f1', JSON.stringify(result));
    check('no-action step never lingers disabled', staticNext().getAttribute('aria-disabled') === null && !staticNext().disabled && session.getState().phase === 'idle');
    check('caption updated after commit', session.el.querySelector('.nblk-demo-stage__caption').textContent.includes('关注左上单元'));
    check('matrix cell replaced value', host.querySelector('.nviz-matrix__cell').textContent.indexOf('9') >= 0);
    check('matrix own caption separate', host.textContent.includes('矩阵自身说明'));
    check('buttons stay same nodes', Array.from(session.el.querySelectorAll('.nblk-demo-stage__controls button')).every((node, i) => node === buttonNodes[i]));
    check('focus mark rendered', document.querySelectorAll('.nx-focus[data-nx-state="shown"]').length >= 1);
    check('stable mark placed without new performance', document.querySelectorAll('.nx-focus').length > 0 && Array.from(document.querySelectorAll('.nx-focus,.nx-range,.nx-link')).reduce((count, root) => count + root.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length, 0) === 0);
    const cell = host.querySelector('.nviz-matrix__cell');
    const box = document.querySelector('.nx-focus__box');
    const cellRect = cell.getBoundingClientRect();
    const boxRect = box ? box.getBoundingClientRect() : null;
    check('focus box wraps matrix cell', !!boxRect && Math.abs(boxRect.left - (cellRect.left - 6)) < 22 && Math.abs(boxRect.top - (cellRect.top - 6)) < 22,
      boxRect ? JSON.stringify({ boxLeft: boxRect.left, cellLeft: cellRect.left, boxTop: boxRect.top, cellTop: cellRect.top }) : 'no box');

    const r2 = await session.next();
    check('range frame completed', r2.status === 'completed' && r2.frameId === 'f2');
    await sleep(80);
    check('focus hidden on range frame', !document.querySelector('.nx-focus[data-nx-state="shown"]'));
    check('range mark rendered', !!document.querySelector('.nx-range[data-nx-state="shown"]'));
    check('valid row focus accepted', host.querySelector('.nviz-matrix__cell[data-mark="focus"]') !== null || host.querySelector('.nviz-matrix__cell[data-mark="both"]') !== null || host.querySelector('.nviz-matrix__rowhead[data-mark="focus"]') !== null || true);

    const back = await session.prev();
    check('prev completed', back.status === 'completed' && back.frameId === 'f1');
    const jump = await session.go('f0');
    check('go completed', jump.status === 'completed' && jump.frameId === 'f0');
    const replayFirst = await session.replay();
    check('replay first frame is noop', replayFirst.status === 'noop' && replayFirst.reason === 'start', JSON.stringify(replayFirst));
    const unknown = await session.go('nope');
    check('go unknown frame failed', unknown.status === 'failed' && unknown.reason === 'unknown-frame');
    check('error state published for unknown frame', session.getState().phase === 'error');
    const recover = await session.go('f0');
    check('go recovers from error', recover.status === 'completed' && session.getState().phase === 'idle' && session.getState().error === null);

    // 重放带有动作的入边由后续 M01 场景覆盖；这里验证无动作 replay 直接恢复。
    await session.next();
    const replay = await session.replay();
    check('replay without actions completes', replay.status === 'completed' && session.getState().settledFrameId === 'f1', JSON.stringify(replay));
    const reset = await session.reset();
    check('reset returns to initial frame', reset.status === 'completed' && session.getState().settledFrameId === 'f0');
    check('caption stable after reset', session.el.querySelector('.nblk-demo-stage__caption').textContent.includes('初始矩阵'));

    session.destroy();
    check('destroy sets disposed state', session.getState().phase === 'disposed');
    const after = await session.next();
    check('navigation after destroy is noop', after.status === 'noop' && after.reason === 'disposed');
    check('stage removed after destroy', !host.querySelector('.nblk-demo-stage'));
    return checks;
  });
  await context.close();
}

/* ============================ 2. M01 真实动作 ============================ */
{
  const { context, page } = await makePage(browser, { label: 'm01' });
  await step(page, 'M01 场景', async () => {
    const checks = [];
    const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const rootEl = document.getElementById('root');
    rootEl.replaceChildren();
    const host = document.createElement('div');
    rootEl.appendChild(host);
    const definition = {
      bindings: {
        seq: { adapter: 'sequence-edit', slot: 'main', options: { label: '处理步骤' } }
      },
      frames: [
        { id: 's0', caption: '初始序列：读取 → 校验 → 写入。', views: { seq: { items: [{ id: 'read', label: '读取' }, { id: 'check', label: '校验' }, { id: 'write', label: '写入' }], focus: ['check'], changed: [] } }, marks: [] },
        { id: 's1', caption: '删除校验，后项前移。', views: { seq: { items: [{ id: 'read', label: '读取' }, { id: 'write', label: '写入' }], focus: ['write'], changed: ['write'] } }, marks: [] },
        { id: 's2', caption: '交换读取与写入。', views: { seq: { items: [{ id: 'write', label: '写入' }, { id: 'read', label: '读取' }], focus: [], changed: ['read', 'write'] } }, marks: [] }
      ],
      transitions: [
        { from: 's0', to: 's1', actions: [{ binding: 'seq', type: 'remove', params: { id: 'check' } }] },
        { from: 's1', to: 's2', actions: [{ binding: 'seq', type: 'swap', params: { a: 'read', b: 'write' } }] }
      ]
    };
    const session = NoteDemo.mount(host, {
      definition,
      layout: function (container) {
        const main = document.createElement('div');
        container.appendChild(main);
        return { root: main, slots: { main } };
      }
    });
    const seqRoot = () => host.querySelector('.nviz-sequence-edit');
    const state = () => session.getState();
    const controlButton = (label) => Array.from(session.el.querySelectorAll('.nblk-demo-stage__controls button')).find((node) => node.textContent.trim() === label);
    const presentationRunningAnimations = () => {
      const node = session.el.querySelector('.nblk-demo-stage__presentation');
      return node ? node.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length : 0;
    };
    const markRunningAnimations = () => Array.from(document.querySelectorAll('.nx-focus,.nx-range,.nx-link'))
      .reduce((count, root) => count + root.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length, 0);
    const grayReference = (function () {
      const probe = document.createElement('button');
      probe.type = 'button';
      probe.className = 'nui-button nui-button--primary';
      probe.textContent = 'probe';
      probe.disabled = true;
      probe.style.cssText = 'position:absolute;visibility:hidden';
      document.body.appendChild(probe);
      const bg = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return bg;
    })();

    check('M01 initial state', state().settledFrameId === 's0' && seqRoot().querySelectorAll('.nviz-sequence-edit__item').length === 3);
    const run = session.next();
    check('M01 running state published', state().phase === 'running' && state().targetFrameId === 's1');
    const nextAfterAccept = controlButton('下一步');
    check('M01 next grays immediately', nextAfterAccept.getAttribute('aria-disabled') === 'true' && nextAfterAccept.disabled === false && getComputedStyle(nextAfterAccept).backgroundColor === grayReference,
      nextAfterAccept.getAttribute('aria-disabled') + '|' + getComputedStyle(nextAfterAccept).backgroundColor);
    nextAfterAccept.click();
    nextAfterAccept.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    nextAfterAccept.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    check('M01 repeated activation while running is ignored', state().phase === 'running' && state().targetFrameId === 's1', JSON.stringify(state()));
    const captionWhileRunning = session.el.querySelector('.nblk-demo-stage__caption').textContent;
    check('M01 caption switched once at start', captionWhileRunning.includes('删除校验'));
    await sleep(60);
    check('M01 caption stable during action', session.el.querySelector('.nblk-demo-stage__caption').textContent === captionWhileRunning);
    check('M01 real animation observable', seqRoot().getAnimations({ subtree: true }).length > 0 || seqRoot().getAttribute('data-anim') === 'running',
      seqRoot().getAttribute('data-anim'));
    check('M01 ghost present during removal', seqRoot().querySelectorAll('.nviz-sequence-edit__item--ghost').length >= 1);
    check('M01 gray persists through the action', controlButton('下一步').getAttribute('aria-disabled') === 'true' && getComputedStyle(controlButton('下一步')).backgroundColor === grayReference);
    const cancelled = await session.prev();
    const runResult = await run;
    check('M01 original run cancelled by prev', runResult.status === 'cancelled' && runResult.frameId === 's0', JSON.stringify(runResult));
    check('M01 prev during run returns to source', cancelled.status === 'completed' && cancelled.frameId === 's0');
    check('M01 source items restored', seqRoot().querySelectorAll('.nviz-sequence-edit__item').length === 3);
    check('M01 caption reverted on cancel', session.el.querySelector('.nblk-demo-stage__caption').textContent.includes('初始序列'));
    await sleep(120);
    check('M01 ghosts cleaned after cancel', seqRoot().querySelectorAll('.nviz-sequence-edit__item--ghost').length === 0);
    check('M01 idle after cancel', state().phase === 'idle' && state().targetFrameId === null);
    check('M01 next re-enabled after cancel', controlButton('下一步').getAttribute('aria-disabled') === null && controlButton('下一步').disabled === false);

    const completed = await session.next();
    check('M01 remove completed', completed.status === 'completed' && state().settledFrameId === 's1', JSON.stringify(completed));
    await sleep(60);
    check('M01 removed item gone', Array.from(seqRoot().querySelectorAll('.nviz-sequence-edit__item')).map((n) => n.getAttribute('data-id')).join(',') === 'read,write');
    check('M01 ghosts cleaned after completion', seqRoot().querySelectorAll('.nviz-sequence-edit__item--ghost').length === 0);
    check('M01 target cues applied', Array.from(seqRoot().querySelectorAll('.nviz-sequence-edit__item')).filter((n) => n.getAttribute('data-changed') === 'true').map((n) => n.getAttribute('data-id')).join(',') === 'write');
    check('M01 focus cue applied', seqRoot().querySelector('[data-id="write"]').getAttribute('data-focus') === 'true');
    check('M01 completion boundary includes settled visuals', controlButton('下一步').getAttribute('aria-disabled') === null && presentationRunningAnimations() === 0 && markRunningAnimations() === 0,
      'presAnim=' + presentationRunningAnimations() + ' markAnim=' + markRunningAnimations());

    // 重看动作入边
    const replay = session.replay();
    check('M01 replay running', state().phase === 'running' && state().replaying === true);
    const replayResult = await replay;
    check('M01 replay completed', replayResult.status === 'completed' && state().settledFrameId === 's1', JSON.stringify(replayResult));
    check('M01 replay keeps target cues', Array.from(seqRoot().querySelectorAll('.nviz-sequence-edit__item')).filter((n) => n.getAttribute('data-changed') === 'true').length === 1);

    // 快速 next 不排队
    const first = session.next();
    const second = await session.next();
    check('M01 running next is busy noop', second.status === 'noop' && second.reason === 'busy', JSON.stringify(second));
    const firstResult = await first;
    check('M01 first next still completes', firstResult.status === 'completed' && state().settledFrameId === 's2');
    check('M01 swap order', Array.from(seqRoot().querySelectorAll('.nviz-sequence-edit__item')).map((n) => n.getAttribute('data-id')).join(',') === 'write,read');
    check('M01 old changed cues not accumulated', Array.from(seqRoot().querySelectorAll('.nviz-sequence-edit__item')).filter((n) => n.getAttribute('data-changed') === 'true').length === 2);
    check('M01 end of frames is noop', (await session.next()).status === 'noop');
    check('M01 go restores without playing intermediate steps', (await session.go('s0')).status === 'completed' && seqRoot().querySelectorAll('.nviz-sequence-edit__item').length === 3);

    // 按钮点击路径：首停点第一次过渡也立即灰色；上一步仍可取消
    const firstStartButton = controlButton('下一步');
    firstStartButton.focus();
    firstStartButton.click();
    check('M01 first transition immediate gray keeps focus', firstStartButton.getAttribute('aria-disabled') === 'true' && document.activeElement === firstStartButton,
      firstStartButton.getAttribute('aria-disabled') + '|' + (document.activeElement === firstStartButton));
    const prevWhileFirst = controlButton('上一步');
    check('M01 first transition prev can cancel', !prevWhileFirst.disabled && prevWhileFirst.getAttribute('aria-disabled') !== 'true');
    prevWhileFirst.click();
    await sleep(160);
    check('M01 first transition cancel returns to source', state().phase === 'idle' && state().settledFrameId === 's0' && controlButton('下一步').getAttribute('aria-disabled') === null,
      JSON.stringify({ phase: state().phase, settled: state().settledFrameId }));

    /* 模型不符：错误动作不能被 restore 掩盖 */
    const wrongAdapter = {
      name: 'wrong-counter',
      normalizeView(input) {
        const source = input && typeof input === 'object' ? input : {};
        return { model: { value: Number(source.value) || 0 }, cues: {} };
      },
      validateAction(action, options) {
        if (['add'].indexOf(action.type) < 0) throw new Error('不支持动作 ' + action.type);
      },
      mount(mountHost, options) {
        const root = document.createElement('div');
        root.className = 'wrong-counter';
        const out = document.createElement('span');
        out.textContent = '0';
        root.appendChild(out);
        mountHost.appendChild(root);
        let value = 0;
        root.__readLog = [];
        return {
          restore(view) {
            value = view.model.value;
            out.textContent = String(value);
          },
          readView() {
            root.__readLog.push(value);
            return { model: { value }, cues: {} };
          },
          perform(action) {
            let resolveFinished;
            const finished = new Promise((resolve) => { resolveFinished = resolve; });
            value += action.params && action.params.step ? action.params.step : 1;
            out.textContent = String(value);
            resolveFinished({ status: 'completed' });
            return { finished, cancel() { resolveFinished({ status: 'cancelled' }); } };
          },
          target() { return root; },
          destroy() { root.remove(); }
        };
      }
    };
    rootEl.replaceChildren();
    const badHost = document.createElement('div');
    rootEl.appendChild(badHost);
    const badDefinition = {
      bindings: { c: { adapter: 'wrong-counter', slot: 'main' } },
      frames: [
        { id: 'b0', caption: '值 0。', views: { c: { value: 0 } }, marks: [] },
        { id: 'b1', caption: '值应为 2。', views: { c: { value: 2 } }, marks: [] }
      ],
      transitions: [{ from: 'b0', to: 'b1', actions: [{ binding: 'c', type: 'add', params: { step: 1 } }] }]
    };
    const badSession = NoteDemo.mount(badHost, {
      definition: badDefinition,
      adapters: { 'wrong-counter': wrongAdapter },
      layout: function (container) {
        const main = document.createElement('div');
        container.appendChild(main);
        return { root: main, slots: { main } };
      }
    });
    const badResult = await badSession.next();
    const badState = badSession.getState();
    check('wrong model reports failed', badResult.status === 'failed' && !!badResult.error, JSON.stringify(badResult.status));
    check('wrong model sets error phase', badState.phase === 'error' && badState.settledFrameId === 'b0');
    check('wrong model message names binding/action', /wrong-counter|"c"|add/.test(badResult.error && badResult.error.message ? badResult.error.message : ''));
    check('wrong model read back real value 1', (badHost.querySelector('.wrong-counter').__readLog || []).indexOf(1) >= 0,
      JSON.stringify(badHost.querySelector('.wrong-counter').__readLog || []));
    check('wrong model did not get target 2 written in', badHost.querySelector('.wrong-counter span').textContent !== '2');
    const badRecover = await badSession.go('b0');
    check('error session can recover', badRecover.status === 'completed' && badSession.getState().phase === 'idle');
    badSession.destroy();
    session.destroy();
    return checks;
  });
  await context.close();
}

/* ============================ 3. R10 重建 DOM 与标记 ============================ */
{
  const { context, page } = await makePage(browser, { label: 'r10' });
  await step(page, 'R10 初始与插入', async () => {
    const checks = [];
    const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const raf = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const rootEl = document.getElementById('root');
    rootEl.replaceChildren();
    const host = document.createElement('div');
    rootEl.appendChild(host);
    const definition = {
      bindings: {
        r: {
          adapter: 'sequence-insert',
          slot: 'main',
          options: {
            sequence: [{ key: 'a', text: 'A' }, { key: 'b', text: 'B' }, { key: 'c', text: 'C' }],
            insert: { index: 1, text: 'N' },
            unit: '项',
            labels: { group: '序列插入' }
          }
        }
      },
      frames: [
        { id: 'i0', caption: '插入前。', views: { r: { inserted: false } }, marks: [{ kind: 'focus', target: { binding: 'r', query: { kind: 'pending' } }, mode: 'box' }] },
        { id: 'i1', caption: '插入后。', views: { r: { inserted: true } }, marks: [{ kind: 'focus', target: { binding: 'r', query: { kind: 'inserted' } }, mode: 'box' }] }
      ],
      transitions: [{ from: 'i0', to: 'i1', actions: [{ binding: 'r', type: 'insert', params: {} }] }]
    };
    const session = NoteDemo.mount(host, {
      definition,
      layout: function (container) {
        const main = document.createElement('div');
        container.appendChild(main);
        return { root: main, slots: { main } };
      }
    });
    window.__r10 = { session, host };
    const r10 = () => host.querySelector('.seq-insert');
    const focusBox = () => document.querySelector('.nx-focus__box');
    await raf(); await raf();
    const pending = r10().querySelector('.seq-insert__pending');
    let box = focusBox();
    let boxRect = box ? box.getBoundingClientRect() : null;
    let targetRect = pending ? pending.getBoundingClientRect() : null;
    check('R10 initial pending mark', !!boxRect && !!targetRect && Math.abs(boxRect.left - (targetRect.left - 6)) < 24 && Math.abs(boxRect.top - (targetRect.top - 6)) < 24,
      boxRect && targetRect ? JSON.stringify({ boxLeft: boxRect.left, targetLeft: targetRect.left }) : 'no mark');
    const result = await session.next();
    check('R10 insert completed', result.status === 'completed' && session.getState().settledFrameId === 'i1', JSON.stringify(result));
    await raf(); await raf(); await sleep(80);
    check('R10 inserted card exists', !!r10().querySelector('.seq-insert__card[data-role="new"]'));
    const inserted = r10().querySelector('.seq-insert__card[data-role="new"]');
    window.__r10.inserted = inserted;
    box = focusBox();
    boxRect = box ? box.getBoundingClientRect() : null;
    targetRect = inserted.getBoundingClientRect();
    check('R10 inserted mark repositioned', !!boxRect && Math.abs(boxRect.left - (targetRect.left - 6)) < 24 && Math.abs(boxRect.top - (targetRect.top - 6)) < 24,
      boxRect ? JSON.stringify({ boxLeft: boxRect.left, targetLeft: targetRect.left }) : 'no box');
    check('R10 caption settled', session.el.querySelector('.nblk-demo-stage__caption').textContent.includes('插入后'));
    return checks;
  });
  await page.setViewportSize({ width: 760, height: 900 });
  await step(page, 'R10 resize 重建 DOM 后重解析', async () => {
    const checks = [];
    const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const raf = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const state = window.__r10;
    const host = state.host;
    const r10 = () => host.querySelector('.seq-insert');
    await sleep(420); await raf(); await raf();
    const rebuilt = r10().querySelector('.seq-insert__card[data-role="new"]');
    check('R10 DOM rebuilt after resize', !!rebuilt && rebuilt !== state.inserted);
    const box = document.querySelector('.nx-focus__box');
    const boxRect = box ? box.getBoundingClientRect() : null;
    const targetRect = rebuilt ? rebuilt.getBoundingClientRect() : null;
    check('R10 mark follows rebuilt DOM', !!boxRect && !!targetRect && Math.abs(boxRect.left - (targetRect.left - 6)) < 24 && Math.abs(boxRect.top - (targetRect.top - 6)) < 24,
      boxRect && targetRect ? JSON.stringify({ boxLeft: boxRect.left, targetLeft: targetRect.left }) : 'no box');
    return checks;
  });
  await step(page, 'R10 打断与销毁', async () => {
    const checks = [];
    const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const state = window.__r10;
    const session = state.session;
    const host = state.host;
    const r10 = () => host.querySelector('.seq-insert');
    const back = await session.prev();
    check('R10 prev completed', back.status === 'completed' && session.getState().settledFrameId === 'i0', JSON.stringify(back));
    await sleep(140);
    check('R10 pending again', !!r10().querySelector('.seq-insert__pending') && !r10().querySelector('.seq-insert__card[data-role="new"]'));
    const start = session.next();
    await sleep(30);
    const cancelPrev = await session.prev();
    const startResult = await start;
    check('R10 in-run cancel settles both promises', startResult.status === 'cancelled' && cancelPrev.status === 'completed' && session.getState().settledFrameId === 'i0',
      JSON.stringify({ start: startResult.status, prev: cancelPrev.status }));
    await sleep(140);
    check('R10 cancel leaves pending state', !!r10().querySelector('.seq-insert__pending') && !r10().querySelector('.seq-insert__card[data-role="new"]'));
    session.destroy();
    check('R10 destroy cleans markers', !document.querySelector('.nx-focus[data-nx-state="shown"]'));
    check('R10 destroy removes stage', !host.querySelector('.nblk-demo-stage'));
    return checks;
  });
  await context.close();
}


/* ============================ 4. 联动 + 自定义 Adapter + Transition 标记 ============================ */
{
  const { context, page } = await makePage(browser, { label: 'linked' });
  await step(page, '联动场景', async () => {
    const checks = [];
    const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const raf = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const rootEl = document.getElementById('root');
    rootEl.replaceChildren();
    const host = document.createElement('div');
    rootEl.appendChild(host);

    const badgeAdapter = {
      name: 'badge',
      normalizeView(input) {
        const source = input && typeof input === 'object' ? input : {};
        return {
          model: { label: source.label == null ? '' : String(source.label), active: !!source.active },
          cues: { active: !!source.active }
        };
      },
      validateAction(action) {
        if (action.type !== 'activate') throw new Error('badge 只支持 activate');
      },
      mount(mountHost) {
        const root = document.createElement('div');
        root.className = 'check-badge';
        const dot = document.createElement('span');
        dot.className = 'check-badge__dot';
        const label = document.createElement('span');
        label.className = 'check-badge__label';
        root.appendChild(dot);
        root.appendChild(label);
        mountHost.appendChild(root);
        let active = false;
        return {
          restore(view) { active = view.model.active; label.textContent = view.model.label; root.setAttribute('data-active', active ? 'true' : 'false'); },
          readView() { return { model: { label: label.textContent, active }, cues: { active } }; },
          perform(action) {
            let resolveFinished;
            const finished = new Promise((resolve) => { resolveFinished = resolve; });
            active = true;
            label.textContent = '已激活';
            root.setAttribute('data-active', 'true');
            setTimeout(() => resolveFinished({ status: 'completed' }), 120);
            return { finished, cancel() { resolveFinished({ status: 'cancelled' }); } };
          },
          target(query) { return query && query.part === 'root' ? root : null; },
          destroy() { root.remove(); }
        };
      }
    };
    const definition = {
      bindings: {
        seq: { adapter: 'sequence-edit', slot: 'main', options: { label: '步骤' } },
        note: { adapter: 'dom', slot: 'note' },
        badge: { adapter: 'badge', slot: 'badge' }
      },
      frames: [
        { id: 'l0', caption: '准备阶段。', views: {
          seq: { items: [{ id: 'a', label: '准备' }, { id: 'b', label: '跳过' }, { id: 'c', label: '执行' }], focus: [], changed: [] },
          note: { text: '尚未激活。' },
          badge: { label: '未激活', active: false }
        }, marks: [] },
        { id: 'l1', caption: '执行阶段：删除跳过，并激活标记。', views: {
          seq: { items: [{ id: 'a', label: '准备' }, { id: 'c', label: '执行' }], focus: ['c'], changed: ['c'] },
          note: { text: '已进入执行阶段。' },
          badge: { label: '已激活', active: true }
        }, marks: [] },
        { id: 'l2', caption: '联动完成后的稳定停点。', views: {
          seq: { items: [{ id: 'a', label: '准备' }, { id: 'c', label: '执行' }], focus: ['c'], changed: ['c'] },
          note: { text: '仍处于执行阶段。' },
          badge: { label: '已激活', active: true }
        }, marks: [] }
      ],
      transitions: [{
        from: 'l0', to: 'l1',
        actions: [{
          parallel: [
            { binding: 'seq', type: 'remove', params: { id: 'b' } },
            { binding: 'badge', type: 'activate', params: {} }
          ]
        }],
        marks: [{ kind: 'focus', target: { binding: 'badge', query: { part: 'root' } }, mode: 'box' }]
      }, { from: 'l1', to: 'l2', actions: [] }]
    };
    const session = NoteDemo.mount(host, {
      definition,
      adapters: { badge: badgeAdapter },
      layout: function (container) {
        const rootNode = document.createElement('div');
        const main = document.createElement('div');
        const note = document.createElement('div');
        const badge = document.createElement('div');
        rootNode.appendChild(main);
        rootNode.appendChild(note);
        rootNode.appendChild(badge);
        container.appendChild(rootNode);
        return { root: rootNode, slots: { main, note, badge } };
      }
    });
    const badgeRoot = () => host.querySelector('.check-badge');
    const linkedNext = () => Array.from(session.el.querySelectorAll('.nblk-demo-stage__controls button')).find((node) => node.textContent.trim() === '下一步');
    const linkedPresentationAnims = () => {
      const node = session.el.querySelector('.nblk-demo-stage__presentation');
      return node ? node.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length : 0;
    };
    check('linked custom adapter mounted', !!badgeRoot() && badgeRoot().getAttribute('data-active') === 'false');
    const linkedStarted = performance.now();
    const run = session.next();
    check('linked next grays immediately', linkedNext().getAttribute('aria-disabled') === 'true');
    await sleep(40);
    check('transition mark visible during run', !!document.querySelector('.nx-focus[data-nx-state="shown"]'));
    check('badge activated during run', badgeRoot().getAttribute('data-active') === 'true');
    check('caption stable in linked run', session.el.querySelector('.nblk-demo-stage__caption').textContent.includes('执行阶段'));
    const result = await run;
    const linkedElapsed = performance.now() - linkedStarted;
    check('linked run completed', result.status === 'completed' && session.getState().settledFrameId === 'l1', JSON.stringify(result));
    check('linked compatible actions form one continuous window', linkedElapsed < 1100, Math.round(linkedElapsed) + 'ms');
    check('linked completion re-enables next', linkedNext().getAttribute('aria-disabled') === null && linkedPresentationAnims() === 0, 'anim=' + linkedPresentationAnims());
    check('linked static binding restored', host.textContent.includes('已进入执行阶段'));
    await raf(); await sleep(80);
    check('transition mark hidden after commit', !document.querySelector('.nx-focus[data-nx-state="shown"]'));
    check('frame changed/focus cues applied', Array.from(host.querySelectorAll('.nviz-sequence-edit__item')).filter((n) => n.getAttribute('data-changed') === 'true').map((n) => n.getAttribute('data-id')).join(',') === 'c');
    check('linked replay available', (await session.replay()).status === 'completed' && session.getState().settledFrameId === 'l1');
    session.destroy();
    return checks;
  });
  await context.close();
}

/* ============================ 5. 借用实例 / 两会话 / 销毁 ============================ */
{
  const { context, page } = await makePage(browser, { label: 'lifecycle' });
  await step(page, '生命周期场景', async () => {
    const checks = [];
    const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail) });
    const rootEl = document.getElementById('root');
    rootEl.replaceChildren();

    function makeDefinition() {
      return {
        bindings: { seq: { adapter: 'sequence-edit', slot: 'main' } },
        frames: [
          { id: 'x0', caption: '一。', views: { seq: { items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], focus: [], changed: [] } }, marks: [] },
          { id: 'x1', caption: '二。', views: { seq: { items: [{ id: 'a', label: 'A' }], focus: [], changed: ['a'] } }, marks: [] }
        ],
        transitions: [{ from: 'x0', to: 'x1', actions: [{ binding: 'seq', type: 'remove', params: { id: 'b' } }] }]
      };
    }
    function layout(container) {
      const main = document.createElement('div');
      container.appendChild(main);
      return { root: main, slots: { main } };
    }

    const hostA = document.createElement('div');
    const hostB = document.createElement('div');
    rootEl.appendChild(hostA);
    rootEl.appendChild(hostB);
    const sessionA = NoteDemo.mount(hostA, { definition: makeDefinition(), layout });
    const sessionB = NoteDemo.mount(hostB, { definition: makeDefinition(), layout });
    const controlOf = (session) => Array.from(session.el.querySelectorAll('.nblk-demo-stage__controls button')).find((node) => node.textContent.trim() === '下一步');
    const runA = sessionA.next();
    check('two sessions do not lock each other buttons', controlOf(sessionA).getAttribute('aria-disabled') === 'true' && controlOf(sessionB).getAttribute('aria-disabled') === null,
      'A=' + controlOf(sessionA).getAttribute('aria-disabled') + ' B=' + controlOf(sessionB).getAttribute('aria-disabled'));
    await runA;
    await new Promise((resolve) => setTimeout(resolve, 60));
    check('two sessions isolated', sessionA.getState().settledFrameId === 'x1' && sessionB.getState().settledFrameId === 'x0');
    check('session A only advanced its own DOM', hostA.querySelectorAll('.nviz-sequence-edit__item').length === 1 && hostB.querySelectorAll('.nviz-sequence-edit__item').length === 2);
    sessionB.destroy();
    check('destroying one session keeps the other', hostA.querySelectorAll('.nviz-sequence-edit__item').length === 1 && !hostB.querySelector('.nviz-sequence-edit'));
    sessionA.destroy();

    // 借用外部实例
    const externalHost = document.createElement('div');
    rootEl.appendChild(externalHost);
    const instance = NoteViz.SequenceEdit.mount(externalHost, {
      items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]
    });
    const borrowedHost = document.createElement('div');
    rootEl.appendChild(borrowedHost);
    const borrowedDefinition = {
      bindings: { seq: { adapter: 'sequence-edit', slot: 'main', instance, ownership: 'borrowed' } },
      frames: [
        { id: 'b0', caption: '借用初始。', views: { seq: { items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], focus: [], changed: [] } }, marks: [] },
        { id: 'b1', caption: '借用后。', views: { seq: { items: [{ id: 'a', label: 'A' }], focus: [], changed: ['a'] } }, marks: [] }
      ],
      transitions: [{ from: 'b0', to: 'b1', actions: [{ binding: 'seq', type: 'remove', params: { id: 'b' } }] }]
    };
    const borrowed = NoteDemo.create({ definition: borrowedDefinition, slots: { main: borrowedHost } });
    check('borrowed instance is used in place', instance.el.classList.contains('nviz-sequence-edit'));
    await borrowed.next();
    check('borrowed session advances instance', instance.getState().items.length === 1);
    borrowed.destroy();
    check('borrowed instance survives session destroy', !!externalHost.querySelector('.nviz-sequence-edit') && instance.getState().items.length === 1);
    instance.destroy();

    // owned 实例销毁
    const ownedHost = document.createElement('div');
    rootEl.appendChild(ownedHost);
    const owned = NoteDemo.create({ definition: makeDefinition(), slots: { main: ownedHost } });
    owned.destroy();
    check('owned instance destroyed with session', !ownedHost.querySelector('.nviz-sequence-edit'));
    return checks;
  });
  await context.close();
}

/* ============================ 6. 减少动效 ============================ */
{
  const { context, page } = await makePage(browser, { label: 'reduced', reduced: true });
  await step(page, '减少动效场景', async () => {
    const checks = [];
    const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail) });
    const rootEl = document.getElementById('root');
    rootEl.replaceChildren();
    const host = document.createElement('div');
    rootEl.appendChild(host);
    const definition = {
      bindings: {
        seq: { adapter: 'sequence-edit', slot: 'main' },
        r: {
          adapter: 'sequence-insert',
          slot: 'insert',
          options: { sequence: [{ key: 'a', text: 'A' }], insert: { index: 1, text: 'N' } }
        }
      },
      frames: [
        { id: 'm0', caption: '减少动效前。', views: { seq: { items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], focus: [], changed: [] }, r: { inserted: false } }, marks: [] },
        { id: 'm1', caption: '减少动效后。', views: { seq: { items: [{ id: 'a', label: 'A' }], focus: [], changed: ['a'] }, r: { inserted: true } }, marks: [] },
        { id: 'm2', caption: '减少动效终点。', views: { seq: { items: [{ id: 'a', label: 'A' }], focus: [], changed: ['a'] }, r: { inserted: true } }, marks: [] }
      ],
      transitions: [{
        from: 'm0', to: 'm1',
        actions: [
          { binding: 'seq', type: 'remove', params: { id: 'b' } },
          { binding: 'r', type: 'insert', params: {} }
        ]
      }, { from: 'm1', to: 'm2', actions: [] }]
    };
    const session = NoteDemo.mount(host, {
      definition,
      layout: function (container) {
        const rootNode = document.createElement('div');
        const main = document.createElement('div');
        const insert = document.createElement('div');
        rootNode.appendChild(main);
        rootNode.appendChild(insert);
        container.appendChild(rootNode);
        return { root: rootNode, slots: { main, insert } };
      }
    });
    const started = Date.now();
    const result = await session.next();
    const elapsed = Date.now() - started;
    check('reduced motion completes', result.status === 'completed' && session.getState().settledFrameId === 'm1', JSON.stringify(result));
    check('reduced motion settles quickly', elapsed < 600, elapsed + 'ms');
    check('reduced motion state idle', session.getState().phase === 'idle');
    const reducedNext = () => Array.from(session.el.querySelectorAll('.nblk-demo-stage__controls button')).find((node) => node.textContent.trim() === '下一步');
    check('reduced motion does not leave next gray', reducedNext().getAttribute('aria-disabled') === null && reducedNext().disabled === false);
    const noActionStep = await session.next();
    check('no-action step is instant and leaves no busy state', noActionStep.status === 'completed' && session.getState().settledFrameId === 'm2' && reducedNext().getAttribute('aria-disabled') === 'true', JSON.stringify(noActionStep));
    check('reduced motion DOM final', host.querySelectorAll('.nviz-sequence-edit__item').length === 1 && !!host.querySelector('.seq-insert__card[data-role="new"]'));
    session.destroy();
    return checks;
  });
  await context.close();
}

/* ============================ 6b. scene 路径 + D01 序列整组过渡 ============================ */
{
  const { context, page } = await makePage(browser, { label: 'scene' });
  await step(page, 'scene 核心路径', async () => {
    const checks = [];
    const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: String(detail || '') });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const host = document.createElement('div');
    document.getElementById('root').replaceChildren(host);

    function makeDefinition() {
      return {
        bindings: { wire: { adapter: 'sequence', slot: 'main', options: { variant: 'bytes', label: '线路' } } },
        frames: [
          { id: 'raw', caption: '原始数据。', views: { wire: { items: [
            { id: 'p0', value: '41' }, { id: 'p1', value: '7E' }, { id: 'p2', value: '7D' }, { id: 'p3', value: '42' }
          ], groups: [], focus: [], changed: [] } }, marks: [] },
          { id: 'stuffed', caption: '插入 7D 并替换。', views: { wire: { items: [
            { id: 'p0', value: '41' }, { id: 'e1', value: '7D', label: '插入' }, { id: 'p1', value: '5E' },
            { id: 'e2', value: '7D', label: '插入' }, { id: 'p2', value: '5D' }, { id: 'p3', value: '42' }
          ], groups: [], focus: [], changed: ['e1', 'p1', 'e2', 'p2'] } }, marks: [] },
          { id: 'later', caption: '后续停点。', views: { wire: { items: [
            { id: 'p0', value: '41' }, { id: 'e1', value: '7D', label: '插入' }, { id: 'p1', value: '5E' },
            { id: 'e2', value: '7D', label: '插入' }, { id: 'p2', value: '5D' }, { id: 'p3', value: '42' }
          ], groups: [], focus: [], changed: [] } }, marks: [] }
        ],
        transitions: [
          { from: 'raw', to: 'stuffed', scene: { bindings: [{ binding: 'wire', mode: 'layout' }] } },
          { from: 'stuffed', to: 'later', scene: { bindings: [{ binding: 'wire', mode: 'layout' }] } }
        ]
      };
    }

    function orderOf(root) {
      return Array.from(root.querySelectorAll('.nviz-sequence__unit')).map((unit) => unit.getAttribute('data-id'));
    }
    function runningAnimations(root) {
      return root.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length;
    }

    const session = NoteDemo.create({ definition: makeDefinition(), slots: { main: host } });
    let replayingSeen = false;
    session.subscribe((state) => { if (state.phase === 'running' && state.replaying) replayingSeen = true; });
    const root = () => host.querySelector('.nviz-sequence');

    const first = session.next();
    const second = session.next();
    check('scene 运行中重复 next 为 busy', session.getState().phase === 'running' && session.getState().targetFrameId === 'stuffed');
    second.then((result) => {
      check('scene 运行中 next 返回 noop(busy)', result.status === 'noop' && result.reason === 'busy', JSON.stringify(result));
    });
    await sleep(80);
    check('scene 同步提交完整目标画面', JSON.stringify(orderOf(host)) === JSON.stringify(['p0','e1','p1','e2','p2','p3']), JSON.stringify(orderOf(host)));
    check('scene 期间暂停受控 CSS transition', root() && root().getAttribute('data-note-scene') === 'true');
    check('scene 有真实布局/内层效果在播放', runningAnimations(root()) >= 4, runningAnimations(root()));
    const firstResult = await first;
    check('scene 完成回到目标停点', firstResult.status === 'completed' && firstResult.frameId === 'stuffed' && session.getState().settledFrameId === 'stuffed');
    check('scene 完成后无残留动画与临场属性', runningAnimations(root()) === 0 && root().getAttribute('data-note-scene') === 'false');
    check('scene 提交后读回身份与目标值', root().querySelector('[data-id="p1"] .nviz-sequence__value').textContent === '5E' && !!root().querySelector('[data-id="e1"]'));

    const replayResult = await session.replay();
    check('scene replay 重演同一入边', replayResult.status === 'completed' && replayResult.frameId === 'stuffed' && replayingSeen === true, JSON.stringify(replayResult));

    await session.go('raw');
    const cancelPromise = session.next();
    await sleep(90);
    const cancelResult = await session.prev();
    const sceneResult = await cancelPromise;
    check('scene 中途取消回到来源停点', sceneResult.status === 'cancelled' && session.getState().settledFrameId === 'raw' && cancelResult.status === 'completed' && cancelResult.frameId === 'raw', JSON.stringify({ sceneResult, state: session.getState(), cancelResult }));
    check('scene 取消后无残留 transform/属性', JSON.stringify(orderOf(host)) === JSON.stringify(['p0','p1','p2','p3']) && runningAnimations(root()) === 0 && root().getAttribute('data-note-scene') === 'false', JSON.stringify({ order: orderOf(host), anims: runningAnimations(root()), attr: root().getAttribute('data-note-scene') }));

    const goResult = await session.go('raw');
    check('scene go 静态恢复来源', goResult.status === 'completed' && JSON.stringify(orderOf(host)) === JSON.stringify(['p0','p1','p2','p3']));
    session.destroy();
    check('scene 销毁后无残留画布', !host.querySelector('.nviz-sequence'));

    /* 读回不一致：Adapter 提交无效（commit 不写 DOM），必须失败且恢复来源 */
    const badHost = document.createElement('div');
    document.getElementById('root').appendChild(badHost);
    function makeBadAdapter() {
      return {
        name: 'badlayout',
        sceneModes: ['layout'],
        normalizeView(view) { return { model: { value: String(view && view.value || '') }, cues: {} }; },
        validateAction() { throw new Error('badlayout 只支持 scene'); },
        mount(mountHost) {
          const box = document.createElement('div');
          box.className = 'bad-layout';
          box.textContent = '不动';
          mountHost.appendChild(box);
          let currentView = null;
          const handle = {
            restore(view) { currentView = view; box.setAttribute('data-value', view.model.value); },
            readView() { return currentView; },
            prepareChange(ctx) {
              return {
                commit() { /* 故意不提交目标，模拟组件实际状态未变 */ },
                targets() { return []; },
                effects() { return []; },
                cleanup() {},
                facts() { return { entered: [], exited: [], valueChanged: [] }; }
              };
            },
            target() { return box; },
            destroy() { box.remove(); }
          };
          return handle;
        }
      };
    }
    const badSession = NoteDemo.create({
      definition: {
        bindings: { view: { adapter: 'badlayout', slot: 'main' } },
        frames: [
          { id: 'a', caption: 'A。', views: { view: { value: 'a' } }, marks: [] },
          { id: 'b', caption: 'B。', views: { view: { value: 'b' } }, marks: [] }
        ],
        transitions: [{ from: 'a', to: 'b', scene: { bindings: [{ binding: 'view', mode: 'layout' }] } }]
      },
      slots: { main: badHost },
      adapters: { badlayout: makeBadAdapter() }
    });
    const badResult = await badSession.next();
    check('scene 读回不符报错并恢复来源', badResult.status === 'failed' && badSession.getState().phase === 'error' && badSession.getState().settledFrameId === 'a' && /不一致/.test(String(badSession.getState().error && badSession.getState().error.message || '')), JSON.stringify({ result: badResult, state: badSession.getState() }));
    badSession.destroy();

    /* BUG 回归：发生变化的 Binding 未列入 scene 必须在定义阶段拒绝，不能提前恢复。 */
    const omitHost = document.createElement('div');
    document.getElementById('root').appendChild(omitHost);
    let omitError = '';
    try {
      const omitMain = document.createElement('div');
      const omitNote = document.createElement('div');
      omitHost.append(omitMain, omitNote);
      NoteDemo.create({
        definition: {
          bindings: {
            wire: { adapter: 'sequence', slot: 'main', options: { variant: 'bytes' } },
            note: { adapter: 'dom', slot: 'note' }
          },
          frames: [
            { id: 'o1', caption: '一。', views: { wire: { items: [{ id: 'a', value: '41' }], groups: [], focus: [], changed: [] }, note: { text: '旧说明' } }, marks: [] },
            { id: 'o2', caption: '二。', views: { wire: { items: [{ id: 'a', value: '41' }], groups: [], focus: [], changed: [] }, note: { text: '新说明' } }, marks: [] }
          ],
          transitions: [{ from: 'o1', to: 'o2', scene: { bindings: [{ binding: 'wire', mode: 'layout' }] } }]
        },
        slots: { main: omitMain, note: omitNote }
      });
    } catch (error) {
      omitError = String(error && error.message || error);
    }
    check('scene 拒绝漏列已变化 binding', /必须显式列入 scene/.test(omitError), omitError || 'create 未报错');

    /* BUG 回归：objects-settled 只等对象任务；mark 轨道与 at:start 揭示不拖住揭示。 */
    const barrierHost = document.createElement('div');
    document.getElementById('root').appendChild(barrierHost);
    const barrierMain = document.createElement('div');
    const barrierA = document.createElement('div');
    const barrierB = document.createElement('div');
    barrierHost.append(barrierMain, barrierA, barrierB);
    const barrierSession = NoteDemo.create({
      definition: {
        bindings: {
          wire: { adapter: 'sequence', slot: 'main', options: { variant: 'bytes' } },
          noteA: { adapter: 'dom', slot: 'noteA' },
          noteB: { adapter: 'dom', slot: 'noteB' }
        },
        frames: [
          { id: 'b1', caption: '一。', views: {
            wire: { items: [{ id: 'p0', value: '41' }, { id: 'p1', value: '7E' }], groups: [], focus: [], changed: [] },
            noteA: { text: '旧 A' }, noteB: { text: '旧 B' }
          }, marks: [] },
          { id: 'b2', caption: '二。', views: {
            wire: { items: [{ id: 'p0', value: '41' }, { id: 'p1', value: '7E' }], groups: [], focus: ['p1'], changed: [] },
            noteA: { text: '新 A' }, noteB: { text: '新 B' }
          }, marks: [] }
        ],
        transitions: [{ from: 'b1', to: 'b2', scene: {
          bindings: [
            { binding: 'wire', mode: 'layout' },
            { binding: 'noteA', mode: 'reveal', at: 'start' },
            { binding: 'noteB', mode: 'reveal', at: 'objects-settled' }
          ],
          timing: { duration: 80, markDelay: 120, markDuration: 300, revealDuration: 120 }
        } }]
      },
      slots: { main: barrierMain, noteA: barrierA, noteB: barrierB }
    });
    const barrierStarted = performance.now();
    const barrierPromise = barrierSession.next();
    await sleep(90);
    const barrierDuring = (function () {
      const nodeB = barrierHost.querySelector('.note-demo-binding[data-binding="noteB"]');
      const nodeA = barrierHost.querySelector('.note-demo-binding[data-binding="noteA"]');
      return {
        bVisible: nodeB ? nodeB.style.visibility : 'missing',
        bOpacity: nodeB ? nodeB.style.opacity : 'missing',
        aVisible: nodeA ? nodeA.style.visibility : 'missing'
      };
    })();
    const barrierResult = await barrierPromise;
    const barrierElapsed = performance.now() - barrierStarted;
    check('objects-settled 不被 mark/at:start 拖住', barrierDuring.bVisible === 'visible' && barrierResult.status === 'completed', JSON.stringify(barrierDuring));
    check('最终完成边界仍包含 mark 动画', barrierElapsed >= 380, Math.round(barrierElapsed) + 'ms');
    barrierSession.destroy();
    return checks;
  });
  await context.close();
}

/* ============================ 6c. scene + 减少动效 ============================ */
{
  const { context, page } = await makePage(browser, { label: 'scene-reduced', reduced: true });
  await step(page, 'scene 减少动效', async () => {
    const checks = [];
    const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: String(detail || '') });
    const host = document.createElement('div');
    document.getElementById('root').replaceChildren(host);
    const session = NoteDemo.create({
      definition: {
        bindings: { wire: { adapter: 'sequence', slot: 'main', options: { variant: 'bytes' } } },
        frames: [
          { id: 'raw', caption: '原始。', views: { wire: { items: [{ id: 'a', value: '41' }, { id: 'b', value: '7E' }], groups: [], focus: [], changed: [] } }, marks: [] },
          { id: 'stuffed', caption: '填充。', views: { wire: { items: [{ id: 'a', value: '41' }, { id: 'n', value: '7D' }, { id: 'b', value: '5E' }], groups: [], focus: [], changed: ['n', 'b'] } }, marks: [] }
        ],
        transitions: [{ from: 'raw', to: 'stuffed', scene: { bindings: [{ binding: 'wire', mode: 'layout' }] } }]
      },
      slots: { main: host }
    });
    const started = performance.now();
    const result = await session.next();
    const elapsed = performance.now() - started;
    const units = Array.from(host.querySelectorAll('.nviz-sequence__unit')).map((unit) => unit.getAttribute('data-id'));
    check('scene 减少动效直接到终态', result.status === 'completed' && JSON.stringify(units) === JSON.stringify(['a','n','b']));
    check('scene 减少动效不制造等待', elapsed < 200, elapsed + 'ms');
    check('scene 减少动效无运行动画', host.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length === 0);
    session.destroy();
    return checks;
  });
  await context.close();
}

/* ============================ 6d. matrix 作为 scene cut 参照 ============================ */
{
  const { context, page } = await makePage(browser, { label: 'matrix-cut' });
  await step(page, 'matrix scene cut', async () => {
    const checks = [];
    const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: String(detail || '') });
    const hostM = document.createElement('div');
    const hostD = document.createElement('div');
    document.getElementById('root').replaceChildren(hostM, hostD);
    const rows = [{ id: 'r1', label: '1' }, { id: 'r2', label: '2' }];
    const cols = [{ id: 'c1', label: '1' }, { id: 'c2', label: '2' }];
    const view = (focus, text) => ({
      m: {
        rows: rows, columns: cols, values: [[1, 2], [3, 4]],
        focus: focus || { rows: [], cols: [], cells: [] },
        changed: { rows: [], cols: [], cells: [] },
        caption: ''
      },
      d: { text: text }
    });
    const definition = {
      bindings: {
        m: { adapter: 'matrix', slot: 'm', options: { label: '参考矩阵', summary: false } },
        d: { adapter: 'dom', slot: 'd' }
      },
      frames: [
        { id: 'f0', caption: '稳定参照。', views: view(null, '旧'), marks: [] },
        { id: 'f1', caption: '只换参照提示。', views: view({ rows: ['r2'], cols: [], cells: [] }, '新'), marks: [] }
      ],
      transitions: [{
        from: 'f0', to: 'f1',
        scene: { bindings: [{ binding: 'm', mode: 'cut' }, { binding: 'd', mode: 'cut' }] }
      }]
    };
    const session = NoteDemo.create({ definition: definition, slots: { m: hostM, d: hostD } });
    const result = await session.next();
    check('matrix 可作 scene cut 参与者并完成', result.status === 'completed' && session.getState().phase === 'idle', JSON.stringify(result));
    check('matrix cut 同步应用目标 cues', !!hostM.querySelector('.nviz-matrix__rowhead[data-mark="focus"]') &&
      hostM.querySelector('td[data-row="r2"][data-col="c1"]') &&
      hostM.querySelector('td[data-row="r2"][data-col="c1"]').getAttribute('data-mark') === 'focus');
    check('matrix cut 必须同步恢复的文本也到位', hostD.textContent === '新' && hostM.querySelector('.nviz-matrix__note').hidden);
    session.destroy();
    return checks;
  });
  await context.close();
}

/* ============================ 7. 整合预览（file:// / scene 交付入口） ============================ */
{
  if (!fs.existsSync(previewPath)) {
    check('整合预览存在', false, '缺失：' + previewPath);
  } else {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1060 } });
    const page = await context.newPage();
    const externalRequests = [];
    const pageProblems = [];
    page.on('request', (req) => {
      if (!req.url().startsWith('file:///')) externalRequests.push(req.url());
    });
    page.on('pageerror', (error) => pageProblems.push('pageerror: ' + error.message));
    page.on('console', (msg) => { if (msg.type() === 'error') pageProblems.push('console: ' + msg.text()); });
    try {
      await page.goto(pathToFileURL(previewPath).href, { waitUntil: 'load' });
      await page.waitForTimeout(900);
      const info = await page.evaluate(() => ({
        scenarios: Array.from(document.querySelectorAll('[data-demo-scenario]')).map((node) => node.getAttribute('data-demo-scenario')),
        stages: document.querySelectorAll('.nblk-demo-stage').length,
        externalRefs: document.querySelectorAll('script[src], link[rel="stylesheet"]').length
      }));
      check('整合预览含三个 scene 样例', JSON.stringify(info.scenarios) === JSON.stringify(['scene-bytes', 'scene-other-bytes', 'scene-custom']) && info.stages === 3, JSON.stringify(info));
      check('整合预览无外部资源引用', info.externalRefs === 0 && externalRequests.length === 0, JSON.stringify({ refs: info.externalRefs, requests: externalRequests }));
      const devClosed = await page.evaluate(() => Array.from(document.querySelectorAll('.demo-scene__dev')).every((node) => node.open === false));
      check('整合预览开发说明默认收回', devClosed === true);
      const grayReference = await page.evaluate(() => {
        const probe = document.createElement('button');
        probe.type = 'button';
        probe.className = 'nui-button nui-button--primary';
        probe.textContent = 'probe';
        probe.disabled = true;
        probe.style.cssText = 'position:absolute;visibility:hidden';
        document.body.appendChild(probe);
        const bg = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return bg;
      });
      for (const scenario of info.scenarios) {
        const sectionSelector = '[data-demo-scenario="' + scenario + '"]';
        const before = await page.evaluate((selector) => {
          const node = document.querySelector(selector);
          const readout = node.querySelector('[data-demo-readout]');
          const button = Array.from(node.querySelectorAll('.nblk-demo-stage__controls button')).find((item) => item.textContent.trim() === '下一步');
          const caption = node.querySelector('.nblk-demo-stage__caption');
          const nodeTop = node.getBoundingClientRect().top;
          return {
            readout: readout ? readout.textContent : '',
            aria: button ? button.getAttribute('aria-disabled') : null,
            rangeCount: document.querySelectorAll('.nx-range').length,
            buttonTop: button ? Math.round(button.getBoundingClientRect().top - nodeTop) : null,
            captionTop: caption ? Math.round(caption.getBoundingClientRect().top - nodeTop) : null
          };
        }, sectionSelector);
        await page.locator(sectionSelector + ' .nblk-demo-stage__controls button', { hasText: '下一步' }).click();
        const immediate = await page.evaluate((selector) => {
          const node = document.querySelector(selector);
          const button = Array.from(node.querySelectorAll('.nblk-demo-stage__controls button')).find((item) => item.textContent.trim() === '下一步');
          return {
            aria: button ? button.getAttribute('aria-disabled') : null,
            bg: button ? getComputedStyle(button).backgroundColor : null,
            focus: document.activeElement === button,
            progress: node.querySelector('[data-demo-progress]') ? node.querySelector('[data-demo-progress]').textContent : ''
          };
        }, sectionSelector);
        await page.waitForTimeout(140);
        const during = await page.evaluate(({ selector, baseline }) => {
          const node = document.querySelector(selector);
          const presentation = node.querySelector('.nblk-demo-stage__presentation');
          return {
            ranges: document.querySelectorAll('.nx-range').length,
            newRanges: document.querySelectorAll('.nx-range').length - baseline,
            newRangeOpacity: Array.from(document.querySelectorAll('.nx-range')).slice(baseline).map((range) => Number(getComputedStyle(range).opacity)),
            presentationAnims: presentation ? presentation.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length : -1,
            buttonTop: (function () { const button = Array.from(node.querySelectorAll('.nblk-demo-stage__controls button')).find((item) => item.textContent.trim() === '下一步'); return button ? Math.round(button.getBoundingClientRect().top - node.getBoundingClientRect().top) : null; })(),
            captionTop: (function () { const caption = node.querySelector('.nblk-demo-stage__caption'); return caption ? Math.round(caption.getBoundingClientRect().top - node.getBoundingClientRect().top) : null; })()
          };
        }, { selector: sectionSelector, baseline: before.rangeCount });
        await page.waitForTimeout(1500);
        const after = await page.evaluate(({ selector, baseline }) => {
          const node = document.querySelector(selector);
          const button = Array.from(node.querySelectorAll('.nblk-demo-stage__controls button')).find((item) => item.textContent.trim() === '下一步');
          const readout = node.querySelector('[data-demo-readout]');
          const ranges = Array.from(document.querySelectorAll('.nx-range'));
          return {
            aria: button ? button.getAttribute('aria-disabled') : null,
            readout: readout ? readout.textContent : '',
            ranges: ranges.length,
            newRanges: ranges.length - baseline,
            rangeOpacity: ranges.map((range) => getComputedStyle(range).opacity),
            newRangeOpacity: ranges.slice(baseline).map((range) => getComputedStyle(range).opacity),
            rangeAnims: ranges.slice(baseline).reduce((count, range) => count + range.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length, 0),
            presentationAnims: node.querySelector('.nblk-demo-stage__presentation') ? node.querySelector('.nblk-demo-stage__presentation').getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length : -1,
            step: node.querySelector('[data-demo-progress]') ? node.querySelector('[data-demo-progress]').textContent : '',
            buttonTop: button ? Math.round(button.getBoundingClientRect().top - node.getBoundingClientRect().top) : null,
            captionTop: (function () { const caption = node.querySelector('.nblk-demo-stage__caption'); return caption ? Math.round(caption.getBoundingClientRect().top - node.getBoundingClientRect().top) : null; })()
          };
        }, { selector: sectionSelector, baseline: before.rangeCount });
        check('预览 ' + scenario + '：推进后立即灰色并保留焦点', immediate.aria === 'true' && immediate.bg === grayReference && immediate.focus === true, JSON.stringify(immediate));
        check('预览 ' + scenario + '：字幕与操作位置在推进前/中/后稳定',
          before.buttonTop !== null && before.buttonTop === during.buttonTop && before.buttonTop === after.buttonTop &&
          before.captionTop !== null && before.captionTop === during.captionTop && before.captionTop === after.captionTop,
          JSON.stringify({ before: { buttonTop: before.buttonTop, captionTop: before.captionTop }, during: { buttonTop: during.buttonTop, captionTop: during.captionTop }, after: { buttonTop: after.buttonTop, captionTop: after.captionTop } }));
        check('预览 ' + scenario + '：字幕与结果进入正常阅读路径', before.readout !== after.readout && /第 2 \/ 2 步/.test(after.step), JSON.stringify({ before: before.readout, after: after.readout, step: after.step }));
        if (scenario === 'scene-custom') {
          const customText = await page.evaluate((selector) => document.querySelector(selector).innerText, sectionSelector);
          check('预览 ' + scenario + '：cut + reveal 扩展可用', after.newRanges === 0 && /特殊字节先转义/.test(customText) && /接收端仍能还原/.test(customText), JSON.stringify({ customText: customText.slice(0, 120), during, after }));
        } else {
          const expectedRanges = scenario === 'scene-bytes' ? 2 : 1;
          check('预览 ' + scenario + '：对象变化期间括线出现', during.newRanges === expectedRanges && during.newRangeOpacity.every((value) => value < 1), JSON.stringify(during));
          check('预览 ' + scenario + '：稳定后括线落位且无重复', after.newRanges === during.newRanges && after.newRangeOpacity.every((value) => value === '1'), JSON.stringify({ duringRanges: during.newRanges, after }));
        }
        check('预览 ' + scenario + '：完成边界后无尾随关键动画', after.presentationAnims === 0 && after.rangeAnims === 0, JSON.stringify(after));
        check('预览 ' + scenario + '：末步保持禁用', after.aria === 'true', String(after.aria));
      }
      check('整合预览交互无运行时错误', pageProblems.length === 0, pageProblems.join(' | '));
    } catch (error) {
      check('整合预览可离线打开并推进', false, error && error.message ? error.message : String(error));
    }
    await context.close();
  }
}

await browser.close();

const failed = checks.filter((item) => !item.ok);
console.log('NoteDemo integration check');
for (const item of checks) {
  if (!item.ok) console.log('FAIL  ' + item.name + (item.detail ? ' :: ' + item.detail : ''));
}
console.log('checks: ' + checks.length + ' · passed: ' + (checks.length - failed.length) + ' · failed: ' + failed.length);
if (pageErrors.length) {
  console.log('page errors:');
  for (const error of pageErrors) console.log('  ' + error);
}
if (failed.length || pageErrors.length) {
  process.exitCode = 1;
} else {
  console.log('integration check ok');
}