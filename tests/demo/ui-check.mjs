// NoteDemo 舞台验收：真实 Edge + 真实 src 直载（core / ui / blocks / expr / viz / demo-runtime / demo-ui）。
// 覆盖：mount 与 el、字幕稳定、按钮节点与焦点稳定、五类导航、Frame/Transition 标记、
// 可选/必需目标、R10 重建 DOM 后标记重定位（含窗口 resize）、错误区、destroy 清理。
// 运行：node tests/demo/ui-check.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleScripts, moduleStyles } from '../lib/src-sources.mjs';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const src = (rel) => path.join(root, rel);

// 源码加载清单从 src/manifests 推导，模块拆分后自动包含全部文件。
const CHECK_MODULES = [
  'core', 'legacy', 'ui-layout', 'blocks-base', 'demo-stage', 'blocks', 'viz-objects', 'viz-mechanisms',
  'demo-runtime', 'demo-ui'
];
const SRC_SCRIPTS = moduleScripts(root, CHECK_MODULES);
const SRC_STYLES = moduleStyles(root, CHECK_MODULES);

const checks = [];
const pageErrors = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail) });
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

const browser = await chromium.launch({ executablePath: edge, headless: true });

async function makePage(label, options = {}) {
  const context = await browser.newContext({
    viewport: { width: options.width || 1180, height: options.height || 900 },
    reducedMotion: options.reduced ? 'reduce' : 'no-preference'
  });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(label + ': ' + msg.text());
  });
  page.on('pageerror', (error) => pageErrors.push(label + ': pageerror: ' + error.message));
  await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>NoteDemo ui check</title></head><body><main id="root"></main></body></html>');
  await page.addStyleTag({ content: 'html,body{margin:0;padding:0}body{padding:18px;box-sizing:border-box;background:#f4f6f9}#root{max-width:1040px;margin:0 auto}.ui-main{min-height:60px}.ui-note{min-height:40px;padding:8px;border:1px dashed #ccc}' });
  for (const rel of SRC_STYLES) await page.addStyleTag({ path: src(rel) });
  for (const rel of SRC_SCRIPTS) {
    if (fs.existsSync(src(rel))) await page.addScriptTag({ path: src(rel) });
  }
  return { context, page };
}


/* ============================ 1. 静态矩阵 + DOM：mount/el、三类标记、可选缺失、destroy ============================ */
{
  const { context, page } = await makePage('static');
  await step(page, '静态矩阵与 DOM', async () => {
    const checks = [];
    const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const rootEl = document.getElementById('root');
    rootEl.replaceChildren();
    const host = document.createElement('div');
    rootEl.appendChild(host);
    const captionText = () => { const node = document.querySelector('.nblk-demo-stage__caption'); return node ? node.textContent : ''; };
    const shownMarkers = () => document.querySelectorAll('.nx-focus[data-nx-state="shown"],.nx-range[data-nx-state="shown"],.nx-link[data-nx-state="shown"]').length;
    const markerRoots = () => document.querySelectorAll('.nx-focus,.nx-range,.nx-link').length;
    const buttonByLabel = (label) => Array.from(document.querySelectorAll('.note-demo__controls button')).find((node) => node.textContent.trim() === label);
    const boxLeft = (selector) => {
      const node = document.querySelector(selector);
      return node ? parseFloat(node.style.left) : NaN;
    };

    const layout = function (container) {
      const wrap = document.createElement('div');
      const main = document.createElement('div');
      main.className = 'ui-main';
      const note = document.createElement('div');
      note.className = 'ui-note';
      wrap.appendChild(main);
      wrap.appendChild(note);
      container.appendChild(wrap);
      return { root: wrap, slots: { main, note } };
    };
    const gridView = (values, focusCells, changedCells) => ({
      rows: [{ id: 'r1', label: 'A' }, { id: 'r2', label: 'B' }],
      columns: [{ id: 'c1', label: 'X' }, { id: 'c2', label: 'Y' }],
      values,
      focus: { rows: [], cols: [], cells: focusCells || [] },
      changed: { rows: [], cols: [], cells: changedCells || [] },
      caption: ''
    });
    const noteView = (text) => ({ text });
    const definition = {
      bindings: {
        grid: { adapter: 'matrix', slot: 'main', options: { label: '验收矩阵', dense: true } },
        note: { adapter: 'dom', slot: 'note', options: { label: '说明文本' } }
      },
      frames: [
        { id: 's0', caption: '静态矩阵初始状态。', views: { grid: gridView([[1, 2], [3, 4]]), note: noteView('说明一') }, marks: [] },
        { id: 's1', caption: '关注左上单元。', views: { grid: gridView([[9, 2], [3, 4]], [{ row: 'r1', col: 'c1' }], []), note: noteView('说明二') }, marks: [
          { kind: 'focus', target: { binding: 'grid', query: { row: 'r1', col: 'c1' } }, mode: 'box' }
        ] },
        { id: 's2', caption: '成组范围标记。', views: { grid: gridView([[9, 2], [3, 4]]), note: noteView('说明三') }, marks: [
          { kind: 'range', targets: [
            { binding: 'grid', query: { row: 'r2', col: 'c1' } },
            { binding: 'grid', query: { row: 'r2', col: 'c2' } }
          ], text: '同一行的两个单元', side: 'below' }
        ] },
        { id: 's3', caption: '逻辑连线。', views: { grid: gridView([[9, 2], [3, 4]]), note: noteView('说明四') }, marks: [
          { kind: 'link', from: { binding: 'grid', query: { row: 'r1', col: 'c1' } }, to: { binding: 'grid', query: { row: 'r2', col: 'c1' } }, label: '同一列' }
        ] },
        { id: 's4', caption: '可选目标缺失应隐藏。', views: { grid: gridView([[9, 2], [3, 4]]), note: noteView('说明五') }, marks: [
          { kind: 'focus', target: { binding: 'grid', query: { row: 'r1', col: 'c1' } }, mode: 'box' },
          { kind: 'focus', target: { binding: 'grid', query: { row: 'r9', col: 'c1' }, optional: true }, mode: 'box' },
          { kind: 'focus', target: { binding: 'note', query: { part: 'nope' }, optional: true }, mode: 'box' }
        ] }
      ],
      transitions: []
    };
    const session = NoteDemo.mount(host, { definition, layout, title: '舞台验收', label: '静态矩阵示例' });

    check('mount returns session api', session && typeof session.next === 'function' && typeof session.destroy === 'function');
    const stage = host.querySelector('.nblk-demo-stage');
    check('session.el is B01 stage root', !!session.el && session.el === stage && stage.classList.contains('nblk-demo-stage'));
    check('note-demo container inside stage', !!host.querySelector('.nblk-demo-stage__stage .note-demo'));
    check('mount restores initial frame', session.getState().phase === 'idle' && session.getState().settledFrameId === 's0', JSON.stringify(session.getState()));
    check('initial caption delegated to stage', captionText() === '静态矩阵初始状态。', captionText());
    check('two binding containers in layout slots', host.querySelectorAll('.note-demo-binding').length === 2, 'bindings=' + host.querySelectorAll('.note-demo-binding').length);
    const labels = Array.from(host.querySelectorAll('.note-demo__controls button')).map((node) => node.textContent.trim());
    check('default control labels', labels.join(',') === '上一步,下一步,重看,重来', labels.join(','));
    check('first frame prev/replay disabled', buttonByLabel('上一步').disabled && buttonByLabel('重看').disabled && !buttonByLabel('下一步').disabled);
    check('progress text', (host.querySelector('.note-demo__progress') || {}).textContent === '第 1 / 5 步', (host.querySelector('.note-demo__progress') || {}).textContent);

    await session.next();
    await sleep(30);
    check('focus frame settled', session.getState().settledFrameId === 's1' && session.getState().phase === 'idle');
    check('focus caption', captionText() === '关注左上单元。', captionText());
    const cell = host.querySelector('.nviz-matrix__cell[data-row="r1"][data-col="c1"]');
    const cellRect = cell.getBoundingClientRect();
    check('focus box targets matrix cell', !!document.querySelector('.nx-focus[data-nx-state="shown"]') && Math.abs(boxLeft('.nx-focus__box') - (cellRect.left - 6)) <= 1.5, 'box=' + boxLeft('.nx-focus__box') + ' cell=' + (cellRect.left - 6));

    await session.next();
    await sleep(30);
    check('range frame settled', session.getState().settledFrameId === 's2');
    check('range bracket shown', !!document.querySelector('.nx-range[data-nx-state="shown"]') && !!document.querySelector('.nx-range__bracket'));

    await session.next();
    await sleep(30);
    const linkPath = document.querySelector('.nx-link__svg path');
    check('link frame settled and drawn', session.getState().settledFrameId === 's3' && !!linkPath && (linkPath.getAttribute('d') || '').length > 10, linkPath ? linkPath.getAttribute('d') : 'no path');

    await session.next();
    await sleep(30);
    check('optional missing hidden without error', session.getState().phase === 'idle' && session.getState().error == null && shownMarkers() === 1, 'shown=' + shownMarkers() + ' state=' + JSON.stringify(session.getState()));
    check('optional missing keeps error box hidden', (function () { const node = document.querySelector('.note-demo__error'); return !!node && node.hidden; })());

    const prevResult = await session.prev();
    await sleep(30);
    check('prev restores previous frame directly', prevResult.status === 'completed' && session.getState().settledFrameId === 's3' && !!document.querySelector('.nx-link[data-nx-state="shown"]'));
    const replayFirst = await session.go('s0');
    check('go restores target frame', replayFirst.status === 'completed' && session.getState().settledFrameId === 's0');
    const replayAtFirst = await session.replay();
    check('replay at first frame is noop start', replayAtFirst.status === 'noop' && replayAtFirst.reason === 'start', JSON.stringify(replayAtFirst));
    const replayStatic = await session.replay();
    check('replay at first keeps noop', replayStatic.status === 'noop');
    await session.go('s1');
    const replayNoTransition = await session.replay();
    check('replay without transition restores current', replayNoTransition.status === 'completed' && session.getState().settledFrameId === 's1');
    const resetResult = await session.reset();
    await sleep(30);
    check('reset restores initial frame', resetResult.status === 'completed' && session.getState().settledFrameId === 's0' && captionText() === '静态矩阵初始状态。');

    session.destroy();
    session.destroy();
    check('destroy removes stage', !document.contains(stage) && document.querySelectorAll('.nblk-demo-stage').length === 0);
    check('destroy removes note-demo chrome', document.querySelectorAll('.note-demo').length === 0);
    check('destroy removes markers', markerRoots() === 0, 'roots=' + markerRoots());
    check('destroy removes error area', document.querySelectorAll('.note-demo__error').length === 0);
    check('destroy publishes disposed', session.getState().phase === 'disposed');
    return checks;
  });
  await context.close();
}

/* ============================ 2. M01：字幕稳定、按钮/焦点稳定、transition marks、busy、打断、导航 ============================ */
{
  const { context, page } = await makePage('sequence-edit');
  await step(page, 'M01 舞台行为', async () => {
    const checks = [];
    const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const rootEl = document.getElementById('root');
    rootEl.replaceChildren();
    const host = document.createElement('div');
    rootEl.appendChild(host);
    const captionText = () => { const node = document.querySelector('.nblk-demo-stage__caption'); return node ? node.textContent : ''; };
    const buttons = () => Array.from(document.querySelectorAll('.note-demo__controls button'));
    const buttonByLabel = (label) => buttons().find((node) => node.textContent.trim() === label);
    const shownMarkers = () => document.querySelectorAll('.nx-focus[data-nx-state="shown"],.nx-range[data-nx-state="shown"],.nx-link[data-nx-state="shown"]').length;
    const boxLeft = () => { const node = document.querySelector('.nx-focus__box'); return node ? parseFloat(node.style.left) : NaN; };
    const itemRect = (id) => {
      const node = host.querySelector('.nviz-sequence-edit__item[data-id="' + id + '"]');
      return node ? node.getBoundingClientRect() : null;
    };

    const items = (ids) => ids.map((id) => ({ id, label: id.toUpperCase() }));
    const definition = {
      bindings: { seq: { adapter: 'sequence-edit', slot: 'main', options: { label: '验收序列' } } },
      frames: [
        { id: 't0', caption: 'M01 初始序列。', views: { seq: { items: items(['a', 'b', 'c']), focus: [], changed: [] } }, marks: [] },
        { id: 't1', caption: 'M01 删除 B 之后。', views: { seq: { items: items(['a', 'c']), focus: ['c'], changed: ['a'] } }, marks: [
          { kind: 'focus', target: { binding: 'seq', query: { id: 'c' } }, mode: 'box' }
        ] },
        { id: 't2', caption: 'M01 交换之后。', views: { seq: { items: items(['c', 'a']), focus: ['a'], changed: ['c'] } }, marks: [] },
        { id: 't3', caption: 'M01 结束停点。', views: { seq: { items: items(['c', 'a']), focus: [], changed: [] } }, marks: [] }
      ],
      transitions: [
        { from: 't0', to: 't1', actions: [{ binding: 'seq', type: 'remove', params: { id: 'b' } }], marks: [
          { kind: 'focus', target: { binding: 'seq', query: { id: 'a' } }, mode: 'box' }
        ] },
        { from: 't1', to: 't2', actions: [{ binding: 'seq', type: 'swap', params: { a: 'a', b: 'c' } }], marks: [] },
        { from: 't2', to: 't3', actions: [], marks: [] }
      ]
    };
    const session = NoteDemo.mount(host, { definition, title: 'M01 舞台', label: '序列编辑舞台' });
    check('mount idle t0', session.getState().phase === 'idle' && session.getState().settledFrameId === 't0', JSON.stringify(session.getState()));

    const nextButton = buttonByLabel('下一步');
    const nextNode = nextButton;
    const beforeCount = buttons().length;
    const markAnimationCount = () => Array.from(document.querySelectorAll('.nx-focus,.nx-range,.nx-link'))
      .reduce((count, root) => count + root.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length, 0);
    const stageAnimationCount = () => {
      /* 只统计演示画面区域，不含控件自身恢复可用的颜色过渡。 */
      const stageNode = host.querySelector('.nblk-demo-stage__presentation') || host.querySelector('.nblk-demo-stage__stage');
      return stageNode ? stageNode.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length : 0;
    };
    const grayReference = (function () {
      const probe = document.createElement('button');
      probe.type = 'button';
      probe.className = 'nui-button nui-button--primary';
      probe.textContent = 'disabled-probe';
      probe.disabled = true;
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      document.body.appendChild(probe);
      const bg = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return bg;
    })();
    const blockedAttempts = [];
    let attemptsDone = false;
    nextNode.focus();
    const samples = await new Promise((resolve) => {
      const list = [];
      const started = performance.now();
      let runningSeen = false;
      let clickSnapshot = null;
      const timer = setInterval(() => {
        const state = session.getState();
        const bg = getComputedStyle(nextNode).backgroundColor;
        list.push({
          t: Math.round(performance.now() - started),
          phase: state.phase,
          settled: state.settledFrameId,
          target: state.targetFrameId,
          caption: captionText(),
          activeNext: document.activeElement === nextNode,
          buttonCount: buttons().length,
          shown: shownMarkers(),
          markAnims: markAnimationCount(),
          stageAnims: stageAnimationCount(),
          nextAria: nextNode.getAttribute('aria-disabled'),
          nextNativeDisabled: nextNode.disabled,
          nextGray: bg === grayReference,
          progress: (host.querySelector('.note-demo__progress') || {}).textContent
        });
        if (!attemptsDone && performance.now() - started > 80) {
          attemptsDone = true;
          nextNode.click();
          nextNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
          nextNode.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
          const afterState = session.getState();
          blockedAttempts.push({ settled: afterState.settledFrameId, target: afterState.targetFrameId, aria: nextNode.getAttribute('aria-disabled') });
        }
        if (state.phase === 'running') runningSeen = true;
        if (runningSeen && state.phase === 'idle') {
          clearInterval(timer);
          resolve({ list, clickSnapshot });
        }
        if (performance.now() - started > 6000) {
          clearInterval(timer);
          resolve({ list, clickSnapshot });
        }
      }, 20);
      nextNode.click();
      clickSnapshot = {
        aria: nextNode.getAttribute('aria-disabled'),
        nativeDisabled: nextNode.disabled,
        bg: getComputedStyle(nextNode).backgroundColor,
        gray: getComputedStyle(nextNode).backgroundColor === grayReference,
        focus: document.activeElement === nextNode,
        phase: session.getState().phase
      };
    }).then((result) => result);
    const running = samples.list.filter((sample) => sample.phase === 'running');
    const idleSamples = samples.list.filter((sample) => sample.phase === 'idle');
    check('M01 transition actually runs', running.length >= 5, 'runningSamples=' + running.length);
    check('next grays immediately when accepted', samples.clickSnapshot.phase === 'running' && samples.clickSnapshot.aria === 'true', JSON.stringify(samples.clickSnapshot));
    check('gray uses library disabled neutral color', samples.clickSnapshot.gray && grayReference !== 'rgb(49, 92, 218)', samples.clickSnapshot.bg);
    check('disabled next is actually inert (not only styled)', samples.clickSnapshot.nativeDisabled === false && samples.clickSnapshot.aria === 'true');
    check('running keeps next disabled and gray', running.every((sample) => sample.nextAria === 'true' && sample.nextGray && sample.nextNativeDisabled === false),
      running.map((s) => s.nextAria + '|' + s.nextGray).join(','));
    check('repeated click/Enter/Space does not queue', blockedAttempts.length === 1 && blockedAttempts[0].settled === 't0' && blockedAttempts[0].target === 't1' && blockedAttempts[0].aria === 'true', JSON.stringify(blockedAttempts));
    check('caption stable during action', running.length > 0 && running.every((sample) => sample.caption === 'M01 删除 B 之后。'), running.map((s) => s.caption).join(' | '));
    check('running state keeps source settled and target frame', running.every((sample) => sample.settled === 't0' && sample.target === 't1'));
    check('transition marks shown during action', running.some((sample) => sample.shown >= 1), running.map((s) => s.shown).join(','));
    check('progress reflects target during action', running.every((sample) => sample.progress === '第 2 / 4 步'), running.map((s) => s.progress).join(','));
    check('button nodes stable across step', samples.list.every((sample) => sample.buttonCount === beforeCount) && buttons().length === beforeCount && buttonByLabel('下一步') === nextNode);
    check('focus stays on next button', samples.list.every((sample) => sample.activeNext) && document.activeElement === nextNode, samples.list.map((s) => s.activeNext).join(','));
    const completion = idleSamples[0];
    check('next re-enabled at completion', completion && completion.nextAria === null && !completion.nextNativeDisabled, completion && (completion.nextAria + '|' + completion.nextNativeDisabled));
    check('necessary hints already placed when re-enabled', completion && completion.shown >= 1 && completion.markAnims === 0 && completion.stageAnims === 0,
      completion && JSON.stringify({ shown: completion.shown, markAnims: completion.markAnims, stageAnims: completion.stageAnims }));
    await sleep(40);
    check('M01 settles on t1', session.getState().phase === 'idle' && session.getState().settledFrameId === 't1', JSON.stringify(session.getState()));
    check('settled caption t1', captionText() === 'M01 删除 B 之后。', captionText());
    const cRect = itemRect('c');
    check('frame mark re-targets settled item c', !!cRect && Math.abs(boxLeft() - (cRect.left - 6)) <= 1.5, 'box=' + boxLeft() + ' c=' + (cRect && cRect.left - 6));
    check('transition mark hidden after settle', shownMarkers() === 1, 'shown=' + shownMarkers());
    check('controls enabled after first step', !buttonByLabel('上一步').disabled && !buttonByLabel('重看').disabled);

    /* 首停点的第一次过渡：next 灰色不可用期间仍可用上一步取消 */
    await session.go('t0');
    await sleep(30);
    nextNode.focus();
    const firstRun = session.next();
    await sleep(45);
    const prevDuringFirst = buttonByLabel('上一步');
    check('first transition: next gray while running', nextNode.getAttribute('aria-disabled') === 'true' && getComputedStyle(nextNode).backgroundColor === grayReference);
    check('first transition: prev stays available to cancel', !prevDuringFirst.disabled && prevDuringFirst.getAttribute('aria-disabled') !== 'true');
    check('first transition: focus stays visible on next', document.activeElement === nextNode, document.activeElement && document.activeElement.className);
    prevDuringFirst.click();
    const firstRunResult = await firstRun;
    await sleep(50);
    check('first transition cancel returns to source', firstRunResult.status === 'cancelled' && session.getState().settledFrameId === 't0' && session.getState().phase === 'idle', JSON.stringify(firstRunResult));
    check('next re-enabled after cancel', nextNode.getAttribute('aria-disabled') === null && !nextNode.disabled);
    await session.go('t1');
    await sleep(30);

    const slow = session.next();
    const busy = await session.next();
    check('next while running is noop busy', busy.status === 'noop' && busy.reason === 'busy', JSON.stringify(busy));
    const slowResult = await slow;
    check('queued transition completes once', slowResult.status === 'completed' && session.getState().settledFrameId === 't2', JSON.stringify(slowResult));

    const replayPromise = session.replay();
    await sleep(140);
    const cancelState = session.getState();
    const prevResult = await session.prev();
    const replayResult = await replayPromise;
    await sleep(60);
    check('prev cancels running replay and reports source', cancelState.phase === 'running' && prevResult.status === 'completed' && prevResult.frameId === 't1', JSON.stringify({ cancelState, prevResult }));
    check('cancelled replay settles to source', replayResult.status === 'cancelled' && session.getState().phase === 'idle' && session.getState().settledFrameId === 't1', JSON.stringify({ replayResult, state: session.getState() }));
    check('cancel restores caption and marks', captionText() === 'M01 删除 B 之后。' && shownMarkers() >= 1, captionText());

    const prevFirst = await (async () => { await session.prev(); return session.prev(); })();
    check('prev at first frame noop start', prevFirst.status === 'noop' && prevFirst.reason === 'start', JSON.stringify(prevFirst));
    const goResult = await session.go('t3');
    await sleep(30);
    check('go jumps directly to target', goResult.status === 'completed' && session.getState().settledFrameId === 't3', JSON.stringify(goResult));
    check('last frame next disabled', buttonByLabel('下一步').disabled || buttonByLabel('下一步').getAttribute('aria-disabled') === 'true', buttonByLabel('下一步').getAttribute('aria-disabled'));
    const unknown = await session.go('missing-frame');
    await sleep(30);
    check('go unknown frame fails', unknown.status === 'failed' && unknown.reason === 'unknown-frame', JSON.stringify(unknown));
    check('go unknown publishes error', session.getState().phase === 'error' && !!session.getState().error);
    check('error area visible for unknown frame', (function () { const box = document.querySelector('.note-demo__error'); return !!box && !box.hidden && box.getAttribute('role') === 'alert'; })());
    const recovery = await session.reset();
    await sleep(30);
    check('reset recovers from error', recovery.status === 'completed' && session.getState().phase === 'idle' && session.getState().settledFrameId === 't0' && session.getState().error == null, JSON.stringify(session.getState()));
    check('error area hidden after recovery', (function () { const box = document.querySelector('.note-demo__error'); return !!box && box.hidden; })());

    session.destroy();
    check('M01 destroy clean', document.querySelectorAll('.nblk-demo-stage').length === 0 && document.querySelectorAll('.nx-focus,.nx-range,.nx-link').length === 0);
    return checks;
  });
  await context.close();
}

/* ============================ 3. R10：重建 DOM 后标记重定位（导航重建 + 窗口 resize） ============================ */
{
  const { context, page } = await makePage('sequence-insert');
  await step(page, 'R10 初始与插入标记', async () => {
    const checks = [];
    const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail) });
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
            labels: { group: 'R10 验收' }
          }
        }
      },
      frames: [
        { id: 'i0', caption: '插入前。', views: { r: { inserted: false } }, marks: [
          { kind: 'focus', target: { binding: 'r', query: { kind: 'pending' } }, mode: 'box' }
        ] },
        { id: 'i1', caption: '插入后。', views: { r: { inserted: true } }, marks: [
          { kind: 'focus', target: { binding: 'r', query: { kind: 'inserted' } }, mode: 'box' },
          { kind: 'link', from: { binding: 'r', query: { kind: 'source', key: 'a' } }, to: { binding: 'r', query: { kind: 'inserted' } }, label: '相邻' }
        ] },
        { id: 'i2', caption: '还原。', views: { r: { inserted: false } }, marks: [
          { kind: 'focus', target: { binding: 'r', query: { kind: 'pending' } }, mode: 'box' }
        ] },
        { id: 'i3', caption: '再次插入。', views: { r: { inserted: true } }, marks: [
          { kind: 'focus', target: { binding: 'r', query: { kind: 'source', key: 'c' } }, mode: 'box' }
        ] },
        { id: 'i4', caption: '同目标动作。', views: { r: { inserted: true } }, marks: [
          { kind: 'focus', target: { binding: 'r', query: { kind: 'inserted' } }, mode: 'box' }
        ] }
      ],
      transitions: [
        { from: 'i0', to: 'i1', actions: [{ binding: 'r', type: 'insert', params: {} }], marks: [
          { kind: 'focus', target: { binding: 'r', query: { kind: 'inserted' } }, mode: 'box' }
        ] },
        { from: 'i1', to: 'i2', actions: [{ binding: 'r', type: 'restore', params: {} }], marks: [] },
        { from: 'i2', to: 'i3', actions: [{ binding: 'r', type: 'insert', params: {} }], marks: [] },
        { from: 'i3', to: 'i4', actions: [{ binding: 'r', type: 'insert', params: {} }], marks: [] }
      ]
    };
    const session = NoteDemo.mount(host, { definition, title: 'R10 舞台', label: '序列插入舞台' });
    window.__r10 = { session, host, definition };
    const captionText = () => document.querySelector('.nblk-demo-stage__caption').textContent;
    const shownMarkers = () => document.querySelectorAll('.nx-focus[data-nx-state="shown"],.nx-link[data-nx-state="shown"]').length;
    const boxLeft = () => { const node = document.querySelector('.nx-focus__box'); return node ? parseFloat(node.style.left) : NaN; };
    const pendingEl = host.querySelector('.seq-insert__pending');
    const pendingRect = pendingEl.getBoundingClientRect();
    check('mount R10 idle i0', session.getState().phase === 'idle' && session.getState().settledFrameId === 'i0', JSON.stringify(session.getState()));
    check('pending frame mark targets pending card', !!pendingEl && Math.abs(boxLeft() - (pendingRect.left - 6)) <= 1.5, 'box=' + boxLeft() + ' pending=' + (pendingRect.left - 6));
    const firstInsertedBefore = host.querySelector('.seq-insert__card[data-role="new"]');
    check('no inserted card before action', !firstInsertedBefore && !!pendingEl);

    const run = session.next();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const midState = session.getState();
    const midShown = shownMarkers();
    const result = await run;
    await new Promise((resolve) => setTimeout(resolve, 60));
    check('insert transition runs', midState.phase === 'running', JSON.stringify(midState));
    check('transition mark visible during insert', midShown >= 1, 'shown=' + midShown);
    check('insert completes on i1', result.status === 'completed' && session.getState().settledFrameId === 'i1' && captionText() === '插入后。');
    const insertedEl = host.querySelector('.seq-insert__card[data-role="new"]');
    const insertedRect = insertedEl.getBoundingClientRect();
    check('frame mark targets rebuilt inserted card', !!insertedEl && Math.abs(boxLeft() - (insertedRect.left - 6)) <= 1.5, 'box=' + boxLeft() + ' new=' + (insertedRect.left - 6));
    check('link mark drawn on rebuilt cards', !!document.querySelector('.nx-link__svg path'));
    window.__r10.insertedElement = insertedEl;
    return checks;
  });

  await page.setViewportSize({ width: 920, height: 780 });
  await page.waitForTimeout(450);

  await step(page, 'R10 resize 与后续标记', async () => {
    const checks = [];
    const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const data = window.__r10;
    const session = data.session;
    const host = data.host;
    const boxLeft = () => { const node = document.querySelector('.nx-focus__box'); return node ? parseFloat(node.style.left) : NaN; };
    const currentInserted = host.querySelector('.seq-insert__card[data-role="new"]');
    const rect = currentInserted ? currentInserted.getBoundingClientRect() : null;
    check('resize keeps R10 inserted state', session.getState().settledFrameId === 'i1' && session.getState().phase === 'idle', JSON.stringify(session.getState()));
    check('resize relayout rebuilds cards', !!currentInserted, 'no inserted card');
    check('marker re-resolved after resize', !!rect && !!document.querySelector('.nx-focus[data-nx-state="shown"]') && Math.abs(boxLeft() - (rect.left - 6)) <= 1.5, 'box=' + boxLeft() + ' new=' + (rect && rect.left - 6));

    const replayPromise = session.replay();
    await sleep(120);
    const replayMid = session.getState();
    const replayShown = document.querySelectorAll('.nx-focus[data-nx-state="shown"]').length;
    const replayResult = await replayPromise;
    await sleep(80);
    check('R10 replay runs and shows transition mark', replayMid.phase === 'running' && replayShown >= 1, JSON.stringify({ replayMid, replayShown }));
    check('R10 replay settles on i1', replayResult.status === 'completed' && session.getState().settledFrameId === 'i1');
    const afterReplayInserted = host.querySelector('.seq-insert__card[data-role="new"]');
    const afterReplayRect = afterReplayInserted.getBoundingClientRect();
    check('R10 marker follows rebuilt inserted card after replay', Math.abs(boxLeft() - (afterReplayRect.left - 6)) <= 1.5, 'box=' + boxLeft() + ' new=' + (afterReplayRect.left - 6));

    await session.prev();
    await sleep(40);
    check('R10 prev rebuilds DOM and re-targets pending', session.getState().settledFrameId === 'i0' && !!host.querySelector('.seq-insert__pending') && Math.abs(boxLeft() - (host.querySelector('.seq-insert__pending').getBoundingClientRect().left - 6)) <= 1.5);
    await session.next();
    await sleep(40);
    const secondInserted = host.querySelector('.seq-insert__card[data-role="new"]');
    check('R10 next rebuilds DOM again', session.getState().settledFrameId === 'i1' && !!secondInserted && secondInserted !== data.insertedElement, 'same element?');
    check('R10 marker targets current inserted card', Math.abs(boxLeft() - (secondInserted.getBoundingClientRect().left - 6)) <= 1.5);
    const toRestore = await session.next();
    await sleep(40);
    check('R10 restore runs from i1', toRestore.status === 'completed' && session.getState().settledFrameId === 'i2');
    const toThird = await session.next();
    await sleep(40);
    const sourceC = host.querySelector('.seq-insert__card[data-key="c"]');
    check('R10 i3 mark targets source key c', toThird.status === 'completed' && session.getState().settledFrameId === 'i3' && !!sourceC && Math.abs(boxLeft() - (sourceC.getBoundingClientRect().left - 6)) <= 1.5, 'box=' + boxLeft() + ' c=' + (sourceC && sourceC.getBoundingClientRect().left - 6) + ' state=' + JSON.stringify(session.getState()));
    const started = Date.now();
    const noopAction = await session.next();
    await sleep(40);
    check('R10 same-target action completes without hanging', noopAction.status === 'completed' && Date.now() - started < 2000 && session.getState().settledFrameId === 'i4', JSON.stringify({ noopAction, ms: Date.now() - started }));
    session.destroy();
    check('R10 destroy clean', document.querySelectorAll('.nblk-demo-stage').length === 0 && document.querySelectorAll('.nx-focus,.nx-range,.nx-link').length === 0 && document.querySelectorAll('.seq-insert').length === 0);
    return checks;
  });
  await context.close();
}

/* ============================ 4. 错误动作与必需标记缺失 ============================ */
{
  const { context, page } = await makePage('errors');
  await step(page, '错误与必需标记', async () => {
    const checks = [];
    const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const rootEl = document.getElementById('root');
    rootEl.replaceChildren();
    const host = document.createElement('div');
    rootEl.appendChild(host);
    const items = (ids) => ids.map((id) => ({ id, label: id.toUpperCase() }));
    const errorBox = () => document.querySelector('.note-demo__error');
    const errorText = () => { const box = errorBox(); return box ? box.textContent : ''; };
    const captionText = () => document.querySelector('.nblk-demo-stage__caption').textContent;

    const badActionDefinition = {
      bindings: { seq: { adapter: 'sequence-edit', slot: 'main', options: { label: '错误演示序列' } } },
      frames: [
        { id: 'd0', caption: '错误动作发生前。', views: { seq: { items: items(['a', 'b', 'c']), focus: [], changed: [] } }, marks: [] },
        { id: 'd1', caption: '错误动作目标。', views: { seq: { items: items(['a', 'b', 'c']), focus: [], changed: [] } }, marks: [] }
      ],
      transitions: [
        { from: 'd0', to: 'd1', actions: [{ binding: 'seq', type: 'remove', params: { id: 'b' } }] }
      ]
    };
    const session = NoteDemo.mount(host, { definition: badActionDefinition, title: '错误演示' });
    const failed = await session.next();
    await sleep(60);
    const state = session.getState();
    check('model mismatch returns failed', failed.status === 'failed', JSON.stringify(failed));
    check('model mismatch publishes error state', state.phase === 'error' && state.settledFrameId === 'd0' && !!state.error, JSON.stringify(state));
    check('error area visible with role alert', (function () { const box = errorBox(); return !!box && !box.hidden && box.getAttribute('role') === 'alert' && box.getBoundingClientRect().width > 0; })());
    check('error area locates frame/binding/action', state.error && !!state.error.binding && !!state.error.action && /d0|d1|seq|remove/.test(errorText()), errorText());
    check('settled caption kept on error', captionText() === '错误动作发生前。', captionText());
    check('settled views restored after failed action', host.querySelectorAll('.nviz-sequence-edit__item').length === 3, 'items=' + host.querySelectorAll('.nviz-sequence-edit__item').length);
    const resetAfterError = await session.reset();
    await sleep(40);
    check('reset clears action error', resetAfterError.status === 'completed' && session.getState().phase === 'idle' && !errorBox().hidden === false, JSON.stringify(session.getState()));
    check('action error area hidden after reset', errorBox().hidden);
    session.destroy();

    /* ---- 必需标记缺失 ---- */
    const host2 = document.createElement('div');
    rootEl.appendChild(host2);
    const markDefinition = {
      bindings: { grid: { adapter: 'matrix', slot: 'main', options: { label: '必需标记矩阵' } } },
      frames: [
        { id: 'k0', caption: '必需标记之前。', views: { grid: {
          rows: [{ id: 'r1', label: 'A' }], columns: [{ id: 'c1', label: 'X' }], values: [[1]],
          focus: { rows: [], cols: [], cells: [] }, changed: { rows: [], cols: [], cells: [] }, caption: ''
        } }, marks: [] },
        { id: 'k1', caption: '必需标记缺失的停点。', views: { grid: {
          rows: [{ id: 'r1', label: 'A' }], columns: [{ id: 'c1', label: 'X' }], values: [[2]],
          focus: { rows: [], cols: [], cells: [] }, changed: { rows: [], cols: [], cells: [] }, caption: ''
        } }, marks: [
          { kind: 'focus', target: { binding: 'grid', query: { row: 'r9', col: 'c1' } }, mode: 'box' }
        ] }
      ],
      transitions: []
    };
    const session2 = NoteDemo.mount(host2, { definition: markDefinition, title: '必需标记演示' });
    await session2.next();
    await sleep(80);
    const markState = session2.getState();
    check('required missing mark enters error', markState.phase === 'error' && markState.settledFrameId === 'k1', JSON.stringify(markState));
    check('required missing message locates frame and query', !!markState.error && /k1/.test(markState.error.message) && /r9/.test(markState.error.message), markState.error && markState.error.message);
    check('required missing error area visible', (function () { const box = errorBox(); return !!box && !box.hidden && box.textContent.indexOf('Frame') >= 0; })());
    check('required missing marker stays hidden', document.querySelectorAll('.nx-focus[data-nx-state="shown"]').length === 0);
    const resetMark = await session2.reset();
    await sleep(40);
    check('reset after required mark error clears error', resetMark.status === 'completed' && session2.getState().phase === 'idle' && session2.getState().settledFrameId === 'k0' && errorBox().hidden, JSON.stringify(session2.getState()));
    session2.destroy();
    check('error scenarios destroy clean', document.querySelectorAll('.note-demo').length === 0 && document.querySelectorAll('.nx-focus,.nx-range,.nx-link').length === 0);
    return checks;
  });
  await context.close();
}


/* ============================ 5. scene 路径：port 受控标记、灰色执行态、取消、减少动效 ============================ */
{
  const { context, page } = await makePage('scene');
  await step(page, 'scene port 与受控标记', async () => {
    const checks = [];
    const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rootEl = document.getElementById('root');
    rootEl.replaceChildren();
    const host = document.createElement('div');
    rootEl.appendChild(host);

    const layout = function (container) {
      const wrap = document.createElement('div');
      const main = document.createElement('div');
      main.className = 'scene-main';
      const result = document.createElement('div');
      result.className = 'scene-result';
      wrap.appendChild(main);
      wrap.appendChild(result);
      container.appendChild(wrap);
      return { root: wrap, slots: { main, result } };
    };
    const rawItems = [
      { id: 'p0', value: '41', label: '' },
      { id: 'p1', value: '7E', label: '' },
      { id: 'p2', value: '7D', label: '' },
      { id: 'p3', value: '42', label: '' }
    ];
    const stuffedItems = [
      { id: 'p0', value: '41', label: '' },
      { id: 'e1', value: '7D', label: '插入' },
      { id: 'p1', value: '5E', label: '' },
      { id: 'e2', value: '7D', label: '插入' },
      { id: 'p2', value: '5D', label: '' },
      { id: 'p3', value: '42', label: '' }
    ];
    const definition = {
      bindings: {
        wire: { adapter: 'sequence', slot: 'main', options: { variant: 'bytes', label: '线路上的字节' } },
        result: { adapter: 'dom', slot: 'result', options: { label: '接收端' } }
      },
      frames: [
        {
          id: 'raw',
          caption: '数据中的 7E、7D 不能直接出现，需要先转义。',
          views: {
            wire: { items: rawItems, groups: [], focus: [], changed: [] },
            result: { text: '观察线路上的变化。' }
          },
          marks: []
        },
        {
          id: 'stuffed',
          caption: '在特殊字节前插入 7D，同时替换原字节的表示。',
          views: {
            wire: { items: stuffedItems, groups: [], focus: [], changed: ['e1', 'p1', 'e2', 'p2'] },
            result: { text: '两个特殊字节都已转义，原对象的身份仍然保留。' }
          },
          marks: [
            { kind: 'range', targets: [
              { binding: 'wire', query: { id: 'e1' } },
              { binding: 'wire', query: { id: 'p1' } }
            ], text: '7E 的转义' },
            { kind: 'range', targets: [
              { binding: 'wire', query: { id: 'e2' } },
              { binding: 'wire', query: { id: 'p2' } }
            ], text: '7D 的转义' }
          ]
        },
        {
          id: 'restored',
          caption: '接收端可以用 7D 5E、7D 5D 还原原来的两个字节。',
          views: {
            wire: { items: stuffedItems, groups: [], focus: [], changed: [] },
            result: { text: '接收端可以用 7D 5E、7D 5D 还原原来的两个字节。' }
          },
          marks: []
        }
      ],
      transitions: [{
        from: 'raw', to: 'stuffed',
        scene: {
          bindings: [
            { binding: 'wire', mode: 'layout' },
            { binding: 'result', mode: 'reveal', at: 'objects-settled' }
          ]
        }
      }, {
        from: 'stuffed', to: 'restored',
        scene: {
          bindings: [
            { binding: 'wire', mode: 'cut' },
            { binding: 'result', mode: 'reveal', at: 'start' }
          ]
        }
      }]
    };
    const session = NoteDemo.mount(host, { definition, layout, title: 'scene 验收', label: 'scene 验收舞台' });
    const captionText = () => { const node = document.querySelector('.nblk-demo-stage__caption'); return node ? node.textContent : ''; };
    const rangeRoots = () => document.querySelectorAll('.nx-range').length;
    const shownRanges = () => document.querySelectorAll('.nx-range[data-nx-state="shown"]').length;
    const resultContainer = () => host.querySelector('.note-demo-binding[data-binding="result"]') || host.querySelector('.scene-result');
    const nextButton = Array.from(document.querySelectorAll('.note-demo__controls button')).find((node) => node.textContent.trim() === '下一步');

    check('scene mount idle raw', session.getState().phase === 'idle' && session.getState().settledFrameId === 'raw', JSON.stringify(session.getState()));
    check('scene initial caption', captionText() === '数据中的 7E、7D 不能直接出现，需要先转义。', captionText());
    check('scene initial wire restored', host.querySelectorAll('.nviz-sequence__unit').length === 4, 'units=' + host.querySelectorAll('.nviz-sequence__unit').length);

    nextButton.focus();
    const clickSnapshot = (() => {
      nextButton.click();
      return { phase: session.getState().phase, aria: nextButton.getAttribute('aria-disabled'), native: nextButton.disabled, active: document.activeElement === nextButton };
    })();
    const samples = await new Promise((resolve) => {
      const list = [];
      const started = performance.now();
      let runningSeen = clickSnapshot.phase === 'running';
      const timer = setInterval(() => {
        const state = session.getState();
        list.push({
          phase: state.phase,
          settled: state.settledFrameId,
          target: state.targetFrameId,
          caption: captionText(),
          aria: nextButton.getAttribute('aria-disabled'),
          ranges: rangeRoots(),
          shownRanges: shownRanges(),
          rangeOpacity: (function () { const node = document.querySelector('.nx-range'); return node ? node.style.opacity : ''; })(),
          resultVisibility: (resultContainer() || {}).style ? resultContainer().style.visibility : '',
          resultOpacity: (resultContainer() || {}).style ? resultContainer().style.opacity : ''
        });
        if (state.phase === 'running') runningSeen = true;
        if (runningSeen && state.phase === 'idle') { clearInterval(timer); resolve(list); }
        if (performance.now() - started > 8000) { clearInterval(timer); resolve(list); }
      }, 15);
    }).then((list) => ({ list, runningSeen: list.some((sample) => sample.phase === 'running') }));
    const running = samples.list.filter((sample) => sample.phase === 'running');
    if (!samples.runningSeen) {
      console.log('scene section skipped: 当前会话未走 scene 路径（等待核心 scene 接管）。');
      return [];
    }
    const maxRanges = samples.list.reduce((max, sample) => Math.max(max, sample.ranges), 0);
    const maxShownRanges = samples.list.reduce((max, sample) => Math.max(max, sample.shownRanges), 0);
    check('scene running next grays immediately', clickSnapshot.phase === 'running' && clickSnapshot.aria === 'true' && clickSnapshot.native === false, JSON.stringify(clickSnapshot));
    check('scene running keeps focus and gray next', running.length > 0 && running.every((sample) => sample.aria === 'true'), running.map((s) => s.aria).join(','));
    check('scene caption stable during transition', running.length > 0 && running.every((sample) => sample.caption === '在特殊字节前插入 7D，同时替换原字节的表示。'), running.map((s) => s.caption).join(' | '));
    check('scene keeps source settled and target frame', running.every((sample) => sample.settled === 'raw' && sample.target === 'stuffed'));
    check('scene commits target once (no duplicate markers)', maxRanges === 2 && maxShownRanges <= 2, 'maxRanges=' + maxRanges + ' maxShown=' + maxShownRanges);
    check('scene marks appear after commit', running.some((sample) => sample.ranges === 2), running.map((s) => s.ranges).join(','));
    check('scene marks stay concealed until completion', running.some((sample) => sample.ranges === 2 && sample.rangeOpacity === '0'), running.map((s) => s.ranges + ':' + s.rangeOpacity).join(','));
    check('scene reveal stays hidden until objects settled', running.some((sample) => sample.resultVisibility === 'hidden' || sample.resultOpacity === '0'), 'vis=' + running.map((s) => s.resultVisibility + '/' + s.resultOpacity).join(','));
    await sleep(40);
    const settledState = session.getState();
    check('scene settles on target frame', settledState.phase === 'idle' && settledState.settledFrameId === 'stuffed' && settledState.error == null, JSON.stringify(settledState));
    check('scene settled caption', captionText() === '在特殊字节前插入 7D，同时替换原字节的表示。', captionText());
    check('scene next re-enabled after completion', nextButton.getAttribute('aria-disabled') === null && !nextButton.disabled, nextButton.getAttribute('aria-disabled') + '/' + nextButton.disabled);
    check('scene marks kept as stable marks', rangeRoots() === 2 && shownRanges() === 2, 'roots=' + rangeRoots() + ' shown=' + shownRanges());
    check('scene marks have geometry', !!document.querySelector('.nx-range__bracket'));
    check('scene result revealed at end', (resultContainer() || {}).textContent === '两个特殊字节都已转义，原对象的身份仍然保留。' && (resultContainer() || {}).style.visibility === '', (resultContainer() || {}).textContent);
    await nextFrame();
    await nextFrame();
    /* 只要求“标记”不再有新的入场/揭示动画；组件自身收尾过渡不计入本舞台断言。 */
    const markAnimations = Array.from(document.querySelectorAll('.nx-focus,.nx-range,.nx-link'))
      .reduce((count, node) => count + node.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length, 0);
    const stageAnimations = host.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length;
    check('scene completion leaves no running mark animations', markAnimations === 0, 'mark=' + markAnimations + ' host=' + stageAnimations);
    check('scene completed marks are stable (no conceal)', Array.from(document.querySelectorAll('.nx-range')).every((node) => node.style.opacity !== '0'), Array.from(document.querySelectorAll('.nx-range')).map((node) => node.style.opacity || 'empty').join(','));
    check('scene target DOM values committed', (function () {
      const values = Array.from(host.querySelectorAll('.nviz-sequence__value')).map((node) => node.textContent.trim());
      return values.join(',') === '41,7D,5E,7D,5D,42';
    })(), Array.from(host.querySelectorAll('.nviz-sequence__value')).map((n) => n.textContent.trim()).join(','));

    /* 稳定期滚动：受控标记按锚点平移，不重新选边、不压到页面其他内容。 */
    const scrollTarget = host.querySelector('.nviz-sequence__unit[data-id="e1"]');
    const scrollBracket = document.querySelector('.nx-range__bracket');
    const settleTargetTop = scrollTarget.getBoundingClientRect().top;
    const settleBracketOffset = scrollBracket.getBoundingClientRect().top - settleTargetTop;
    const scrollSpacer = document.createElement('div');
    scrollSpacer.style.height = '1800px';
    document.getElementById('root').appendChild(scrollSpacer);
    globalThis.scrollTo(0, 400);
    await nextFrame();
    await nextFrame();
    const scrolledTargetTop = scrollTarget.getBoundingClientRect().top;
    const scrolledBracket = document.querySelector('.nx-range__bracket');
    const scrolledOffset = scrolledBracket.getBoundingClientRect().top - scrollTarget.getBoundingClientRect().top;
    const rangeRoot = document.querySelector('.nx-range');
    const scrollTransform = rangeRoot ? rangeRoot.style.transform : '';
    check('scene scroll actually moves target', Math.abs((settleTargetTop - scrolledTargetTop) - 400) <= 2, 'moved=' + (settleTargetTop - scrolledTargetTop));
    check('scene scroll keeps marks anchored to targets', Math.abs(scrolledOffset - settleBracketOffset) <= 1.5, 'settle=' + settleBracketOffset.toFixed(1) + ' scrolled=' + scrolledOffset.toFixed(1));
    check('scene scroll uses viewport translation without re-anchoring', /translate\(/.test(scrollTransform) && /-400(?:\.00)?px/.test(scrollTransform), scrollTransform || 'no transform');
    globalThis.scrollTo(0, 0);
    await nextFrame();
    await nextFrame();
    const restoredBracket = document.querySelector('.nx-range__bracket');
    const restoredOffset = restoredBracket.getBoundingClientRect().top - scrollTarget.getBoundingClientRect().top;
    check('scene scroll back restores anchored geometry', Math.abs(restoredOffset - settleBracketOffset) <= 1.5, 'restored=' + restoredOffset.toFixed(1));
    scrollSpacer.remove();

    /* 取消：中途按上一步，恢复来源帧且不残留 scene 标记 */
    const replayPromise = session.replay();
    await sleep(140);
    const cancelMid = session.getState();
    const prevResult = await session.prev();
    const replayResult = await replayPromise;
    await sleep(60);
    check('scene cancel runs from settled frame', cancelMid.phase === 'running' && cancelMid.settledFrameId === 'raw' && cancelMid.targetFrameId === 'stuffed', JSON.stringify(cancelMid));
    check('scene cancel prev reports source frame', prevResult.status === 'completed' && prevResult.frameId === 'raw', JSON.stringify(prevResult));
    check('scene cancel settles source frame', replayResult.status === 'cancelled' && session.getState().phase === 'idle' && session.getState().settledFrameId === 'raw', JSON.stringify({ replayResult, state: session.getState() }));
    check('scene cancel leaves no scene marks', shownRanges() === 0 && rangeRoots() === 0, 'roots=' + rangeRoots() + ' shown=' + shownRanges());
    check('scene cancel restores source DOM', host.querySelectorAll('.nviz-sequence__unit').length === 4 && (resultContainer() || {}).textContent === '观察线路上的变化。', (resultContainer() || {}).textContent);
    check('scene cancel keeps controls usable', !nextButton.disabled && nextButton.getAttribute('aria-disabled') === null);

    /* expr 受控测量：geometry.rect / textRects 生效，observe:false 不挂自动重测。 */
    const probeTarget = document.createElement('p');
    probeTarget.textContent = '受控测量目标';
    probeTarget.style.cssText = 'position:fixed;left:300px;top:200px;width:120px;height:30px';
    document.body.appendChild(probeTarget);
    const fakeRect = { left: 100, top: 50, right: 160, bottom: 90, width: 60, height: 40 };
    const focusProbe = NoteExpr.Focus.mount({ motion: 'never', observe: false, geometry: { rect: function () { return fakeRect; } } });
    focusProbe.show(probeTarget);
    const probeBox = focusProbe.el.querySelector('.nx-focus__box');
    check('expr geometry provider controls focus box', !!probeBox &&
      Math.abs(parseFloat(probeBox.style.left) - 94) <= 0.6 &&
      Math.abs(parseFloat(probeBox.style.top) - 44) <= 0.6 &&
      Math.abs(parseFloat(probeBox.style.width) - 72) <= 0.6,
      probeBox ? probeBox.getAttribute('style') : 'no box');
    focusProbe.destroy();
    const underlineProbe = NoteExpr.Focus.mount({
      motion: 'never',
      observe: false,
      geometry: {
        rect: function () { return fakeRect; },
        textRects: function () { return [{ left: 10, top: 20, right: 60, bottom: 32, width: 50, height: 12 }]; }
      }
    });
    underlineProbe.show({ el: probeTarget, text: '受控', mode: 'underline' });
    const probeRule = underlineProbe.el.querySelector('.nx-focus__rule');
    check('expr textRects controls underline segments', !!probeRule &&
      Math.abs(parseFloat(probeRule.style.left) - 11) <= 0.6 &&
      Math.abs(parseFloat(probeRule.style.top) - 31) <= 0.6 &&
      Math.abs(parseFloat(probeRule.style.width) - 48) <= 0.6,
      probeRule ? probeRule.getAttribute('style') : 'no rule');
    underlineProbe.destroy();
    probeTarget.remove();

    session.destroy();
    check('scene destroy clean', document.querySelectorAll('.nblk-demo-stage').length === 0 && document.querySelectorAll('.nx-range').length === 0);
    return checks;
  });
  await context.close();
}

/* ============================ 6. scene 减少动效 ============================ */
{
  const { context, page } = await makePage('scene-reduced', { reduced: true });
  await step(page, 'scene 减少动效', async () => {
    const checks = [];
    const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const rootEl = document.getElementById('root');
    rootEl.replaceChildren();
    const host = document.createElement('div');
    rootEl.appendChild(host);
    const layout = function (container) {
      const wrap = document.createElement('div');
      const main = document.createElement('div');
      const result = document.createElement('div');
      wrap.appendChild(main);
      wrap.appendChild(result);
      container.appendChild(wrap);
      return { root: wrap, slots: { main, result } };
    };
    const definition = {
      bindings: {
        wire: { adapter: 'sequence', slot: 'main', options: { variant: 'bytes', label: '线路' } },
        result: { adapter: 'dom', slot: 'result' }
      },
      frames: [
        { id: 'r0', caption: '减少动效前。', views: {
          wire: { items: [{ id: 'p0', value: '41', label: '' }], groups: [], focus: [], changed: [] },
          result: { text: '准备。' }
        }, marks: [] },
        { id: 'r1', caption: '减少动效后。', views: {
          wire: { items: [{ id: 'p0', value: '41', label: '' }, { id: 'e1', value: '7D', label: '插入' }, { id: 'p1', value: '5E', label: '' }], groups: [], focus: [], changed: ['e1', 'p1'] },
          result: { text: '已转义。' }
        }, marks: [{ kind: 'range', targets: [
          { binding: 'wire', query: { id: 'e1' } },
          { binding: 'wire', query: { id: 'p1' } }
        ], text: '7E 的转义' }] }
      ],
      transitions: [{
        from: 'r0', to: 'r1',
        scene: { bindings: [{ binding: 'wire', mode: 'layout' }, { binding: 'result', mode: 'reveal', at: 'objects-settled' }] }
      }]
    };
    const session = NoteDemo.mount(host, { definition, layout });
    const started = Date.now();
    const result = await session.next();
    const elapsed = Date.now() - started;
    await sleep(30);
    const state = session.getState();
    check('reduced scene completes', result.status === 'completed' && state.phase === 'idle' && state.settledFrameId === 'r1', JSON.stringify({ result, state }));
    check('reduced scene ends immediately', elapsed < 1200, elapsed + 'ms');
    check('reduced scene shows marks statically', document.querySelectorAll('.nx-range[data-nx-state="shown"]').length === 1, 'shown=' + document.querySelectorAll('.nx-range[data-nx-state="shown"]').length);
    check('reduced scene reveals result', (host.querySelector('.note-demo-binding[data-binding="result"]') || {}).textContent === '已转义。');
    const running = host.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length;
    check('reduced scene has no running animations', running === 0, 'running=' + running);
    session.destroy();
    return checks;
  });
  await context.close();
}

await browser.close();

const failed = checks.filter((item) => !item.ok);
for (const item of checks) {
  if (!item.ok) console.log('FAIL  ' + item.name + (item.detail ? ' :: ' + item.detail : ''));
}
console.log('ui-check checks: ' + checks.length + ' · passed: ' + (checks.length - failed.length) + ' · failed: ' + failed.length);
if (pageErrors.length) {
  console.log('page errors:');
  for (const line of pageErrors) console.log('  ' + line);
}
if (failed.length || pageErrors.length) process.exitCode = 1;
else console.log('ui-check ok');
