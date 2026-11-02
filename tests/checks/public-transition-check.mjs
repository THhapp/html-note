// 公共过渡能力首批靶向检查：update after ready/finished、源视觉保持、无变化不重播、
// Matrix update、Expression、keyed marks。真实 Edge + 真实 src 直载。
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleScripts, moduleStyles, readModuleSources } from '../lib/src-sources.mjs';
const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const src = (rel) => path.join(root, rel);
const checks = [];
const pageErrors = [];
function check(name, ok, detail = '') { checks.push({ name, ok: !!ok, detail: String(detail) }); }
// 源码加载清单从 src/manifests 推导：demo-runtime / demo-ui / objects 等拆分后自动覆盖新文件。
const CHECK_MODULES = ['core', 'legacy', 'ui-layout', 'ui-content', 'viz-objects', 'blocks', 'demo-runtime', 'demo-ui'];
const SCRIPTS = moduleScripts(root, CHECK_MODULES);
const STYLES = moduleStyles(root, CHECK_MODULES);
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
const page = await context.newPage();
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (msg) => { if (msg.type() === 'error') pageErrors.push(msg.text()); });
await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>');
for (const rel of STYLES) await page.addStyleTag({ path: src(rel) });
for (const rel of SCRIPTS) await page.addScriptTag({ path: src(rel) });

/* 1. defaultSceneMode 与 after 循环 */
const compile = await page.evaluate(() => {
  const mk = () => {
    const rootEl = document.getElementById('root');
    rootEl.innerHTML = '<div id="a"></div><div id="b"></div>';
    return { rootEl, slots: { a: document.getElementById('a'), b: document.getElementById('b') } };
  };
  const domDefinition = (after) => ({
    bindings: { a: { adapter: 'dom', slot: 'a' }, b: { adapter: 'dom', slot: 'b' } },
    frames: [
      { id: 'f0', caption: '0', views: { a: { text: 'a0' }, b: { text: 'b0' } }, marks: [] },
      { id: 'f1', caption: '1', views: { a: { text: 'a1' }, b: { text: 'b1' } }, marks: [] }
    ],
    transitions: [{ from: 'f0', to: 'f1', scene: { bindings: [{ binding: 'a', after: after ? 'b' : undefined }, { binding: 'b', after: after ? 'a' : undefined }] } }]
  });
  const out = {};
  out.modes = {
    sequence: NoteDemoInternals.adapters.sequence.defaultSceneMode,
    matrix: NoteDemoInternals.adapters.matrix.defaultSceneMode,
    dom: NoteDemoInternals.adapters.dom.defaultSceneMode,
    expression: NoteDemoInternals.adapters.expression.defaultSceneMode
  };
  try { NoteDemo.create({ definition: domDefinition(true), slots: mk().slots }); out.cycle = 'no error'; }
  catch (error) { out.cycle = error.message; }
  try { NoteDemo.create({ definition: domDefinition(false), slots: mk().slots }); out.default = 'ok'; }
  catch (error) { out.default = error.message; }
  return out;
});
check('内置 Adapter 默认 scene 模式正确', JSON.stringify(compile.modes) === JSON.stringify({ sequence: 'layout', matrix: 'update', dom: 'update', expression: 'layout' }), JSON.stringify(compile.modes));
check('after 自连/循环被拒绝', /循环|不得引用自身/.test(compile.cycle), compile.cycle);
check('省略 mode 使用 Adapter 默认', compile.default === 'ok', compile.default);

/* 2. DOM update 源视觉保持 + after ready */
const domReach = await page.evaluate(async () => {
  const rootEl = document.getElementById('root');
  rootEl.innerHTML = '<div id="a"></div><div id="b"></div>';
  const hostA = document.getElementById('a');
  const hostB = document.getElementById('b');
  const definition = {
    bindings: { a: { adapter: 'dom', slot: 'a' }, b: { adapter: 'dom', slot: 'b' } },
    frames: [
      { id: 'f0', caption: '0', views: { a: { text: 'A1' }, b: { text: 'B1' } }, marks: [] },
      { id: 'f1', caption: '1', views: { a: { text: 'A2' }, b: { text: 'B1' } }, marks: [] },
      { id: 'f2', caption: '2', views: { a: { text: 'A3' }, b: { text: 'B2' } }, marks: [] }
    ],
    transitions: [
      { from: 'f0', to: 'f1', scene: { bindings: [{ binding: 'a' }] } },
      { from: 'f1', to: 'f2', scene: { bindings: [{ binding: 'a' }, { binding: 'b', after: 'a' }] } }
    ]
  };
  const session = NoteDemo.create({ definition, slots: { a: hostA, b: hostB } });
  const p1 = session.next();
  await new Promise((r) => setTimeout(r, 100));
  const ghost1 = hostA.querySelector('.note-demo-dom__ghost');
  const domRoot1 = hostA.querySelector('.note-demo-dom');
  const during1 = {
    ghost: hostA.querySelectorAll('.note-demo-dom__ghost').length,
    ghostText: Array.from(hostA.querySelectorAll('.note-demo-dom__ghost')).map((n) => n.textContent).join(''),
    targetOpacity: Number(getComputedStyle(hostA.querySelector('.note-demo-dom__value')).opacity),
    ghostParent: ghost1 ? ghost1.parentElement.className : null,
    ghostPosition: ghost1 ? getComputedStyle(ghost1).position : null,
    ghostInset: ghost1 ? ghost1.style.inset : null,
    ghostLeft: ghost1 ? ghost1.style.left : null,
    rootPosition: domRoot1 ? getComputedStyle(domRoot1).position : null,
    parentPosition: getComputedStyle(hostA).position,
    phase: session.getState().phase
  };
  await p1;
  const after1 = { ghost: hostA.querySelectorAll('.note-demo-dom__ghost').length, text: hostA.querySelector('.note-demo-dom').textContent, rootPosition: domRoot1 ? getComputedStyle(domRoot1).position : null, phase: session.getState().phase };
  const p2 = session.next();
  await new Promise((r) => setTimeout(r, 100));
  const during2 = {
    aGhost: hostA.querySelectorAll('.note-demo-dom__ghost').length,
    bGhost: hostB.querySelectorAll('.note-demo-dom__ghost').length,
    bGhostText: Array.from(hostB.querySelectorAll('.note-demo-dom__ghost')).map((n) => n.textContent).join(''),
    bTargetOpacity: Number(getComputedStyle(hostB.querySelector('.note-demo-dom__value')).opacity),
    phase: session.getState().phase
  };
  await p2;
  const after2 = { aGhost: hostA.querySelectorAll('.note-demo-dom__ghost').length, bGhost: hostB.querySelectorAll('.note-demo-dom__ghost').length, aText: hostA.querySelector('.note-demo-dom').textContent, bText: hostB.querySelector('.note-demo-dom').textContent, phase: session.getState().phase };
  session.destroy();
  return { during1, after1, during2, after2 };
});
check('DOM update 期间旧值 ghost 与目标文字保持', domReach.during1.ghost === 1 && domReach.during1.ghostText === 'A1' && domReach.during1.targetOpacity < 1 && domReach.during1.phase === 'running', JSON.stringify(domReach.during1));
check('DOM 局部 ghost 在 root 内且不改宿主父容器', domReach.during1.ghostParent === 'note-demo-dom' && domReach.during1.ghostPosition === 'absolute' && domReach.during1.ghostInset === '' && /px$/.test(domReach.during1.ghostLeft || '') && domReach.during1.rootPosition === 'relative' && domReach.during1.parentPosition === 'static' && domReach.after1.rootPosition === 'static', JSON.stringify({ during: domReach.during1, after: domReach.after1 }));
check('DOM update 完成清除 ghost 并落目标', domReach.after1.ghost === 0 && domReach.after1.text === 'A2' && domReach.after1.phase === 'idle', JSON.stringify(domReach.after1));
check('after 成员在依赖 ready 前保持源视觉', domReach.during2.bGhost === 1 && domReach.during2.bGhostText === 'B1' && domReach.during2.bTargetOpacity < 1, JSON.stringify(domReach.during2));
check('after 链完成清理', domReach.after2.aGhost === 0 && domReach.after2.bGhost === 0 && domReach.after2.aText === 'A3' && domReach.after2.bText === 'B2' && domReach.after2.phase === 'idle', JSON.stringify(domReach.after2));

/* 3. 无变化不重播 */
const noChange = await page.evaluate(async () => {
  const rootEl = document.getElementById('root');
  rootEl.innerHTML = '<div id="a"></div>';
  const host = document.getElementById('a');
  const definition = {
    bindings: { a: { adapter: 'dom', slot: 'a' } },
    frames: [
      { id: 'f0', caption: '0', views: { a: { text: 'SAME' } }, marks: [] },
      { id: 'f1', caption: '1', views: { a: { text: 'SAME' } }, marks: [] }
    ],
    transitions: [{ from: 'f0', to: 'f1', scene: { bindings: [{ binding: 'a' }] } }]
  };
  const session = NoteDemo.create({ definition, slots: { a: host } });
  const started = performance.now();
  await session.next();
  const elapsed = performance.now() - started;
  const out = { elapsed, ghosts: host.querySelectorAll('.note-demo-dom__ghost').length, phase: session.getState().phase };
  session.destroy();
  return out;
});
check('无变化 update 不制造旧值/等待', noChange.ghosts === 0 && noChange.elapsed < 300 && noChange.phase === 'idle', JSON.stringify(noChange));

/* 4. Matrix update 源视觉保持 */
const matrixReach = await page.evaluate(async () => {
  const rootEl = document.getElementById('root');
  rootEl.innerHTML = '<div id="m"></div>';
  const host = document.getElementById('m');
  const rows = [{ id: 'r1', label: '1' }, { id: 'r2', label: '2' }];
  const columns = [{ id: 'c1', label: '1' }, { id: 'c2', label: '2' }];
  const make = (cells) => ({ rows, columns, values: [[1, 2], [3, 4]], focus: { rows: [], cols: [], cells }, changed: { rows: [], cols: [], cells: [] }, caption: '' });
  const definition = {
    bindings: { m: { adapter: 'matrix', slot: 'm', options: { label: '矩阵', summary: false } } },
    frames: [
      { id: 'f0', caption: '0', views: { m: make([{ row: 'r1', col: 'c1' }]) }, marks: [] },
      { id: 'f1', caption: '1', views: { m: make([{ row: 'r2', col: 'c2' }]) }, marks: [] }
    ],
    transitions: [{ from: 'f0', to: 'f1', scene: { bindings: [{ binding: 'm' }] } }]
  };
  const session = NoteDemo.create({ definition, slots: { m: host } });
  const target = () => host.querySelector('td[data-row="r2"][data-col="c2"]');
  const oldCell = () => host.querySelector('td[data-row="r1"][data-col="c1"]');
  const p = session.next();
  await new Promise((r) => setTimeout(r, 120));
  const during = {
    phase: session.getState().phase,
    targetMark: target() ? target().getAttribute('data-direct-mark') : null,
    targetBg: target() ? getComputedStyle(target()).backgroundColor : null,
    targetOutline: target() ? getComputedStyle(target()).outlineColor : null,
    oldMark: oldCell() ? oldCell().getAttribute('data-direct-mark') : null,
    oldBg: oldCell() ? getComputedStyle(oldCell()).backgroundColor : null
  };
  await p;
  const after = {
    phase: session.getState().phase,
    targetBg: target() ? getComputedStyle(target()).backgroundColor : null,
    targetOutline: target() ? getComputedStyle(target()).outlineColor : null,
    oldMark: oldCell() ? oldCell().getAttribute('data-direct-mark') : null,
    oldBg: oldCell() ? getComputedStyle(oldCell()).backgroundColor : null
  };
  session.destroy();
  return { during, after };
});
check('Matrix update 提交目标关注并有可见过渡', matrixReach.during.phase === 'running' && matrixReach.during.targetMark === 'focus' &&
  matrixReach.during.targetOutline !== matrixReach.after.targetOutline, JSON.stringify(matrixReach.during) + ' => ' + JSON.stringify(matrixReach.after));
check('Matrix update 完成后目标态正确', matrixReach.after.phase === 'idle' && matrixReach.after.oldMark === 'none' &&
  /111, 130, 183/.test(matrixReach.after.targetOutline), JSON.stringify(matrixReach.after));

/* 5. Expression 静态与 scene 接入 */
const expression = await page.evaluate(async () => {
  const rootEl = document.getElementById('root');
  rootEl.innerHTML = '<div id="e"></div>';
  const host = document.getElementById('e');
  const expr = NoteUI.Expression.mount(host, { parts: [{ id: 'a', text: '4' }, { id: 'plus', text: '+' }, { id: 'b', text: '1' }], label: '四加一' });
  const bodyEl = expr.getTarget({ part: 'body' });
  const before = { state: expr.getState(), labels: expr.el.querySelectorAll('.nui-expression__part').length, aria: expr.el.getAttribute('aria-label'), targets: expr.getMotionTargets().map((t) => t.id), bodyParts: bodyEl ? bodyEl.querySelectorAll('.nui-expression__part').length : -1, bodyParent: bodyEl ? bodyEl.parentNode === expr.el : false };
  expr.update({ parts: [{ id: 'a', text: '4' }, { id: 'plus', text: '+' }, { id: 'b', text: '1' }, { id: 'c', text: '12' }], changed: ['c'] });
  const after = { parts: expr.el.querySelectorAll('.nui-expression__part').length, targets: expr.getMotionTargets().map((t) => t.id), state: expr.getState() };
  const exprRoot = expr.el;
  expr.destroy();
  rootEl.innerHTML = '<div id="s"></div>';
  const slot = document.getElementById('s');
  const session = NoteDemo.create({
    definition: {
      bindings: { e: { adapter: 'expression', slot: 'e' } },
      frames: [
        { id: 'f0', caption: '0', views: { e: { parts: [{ id: 'x', text: '1' }], label: '一' } }, marks: [] },
        { id: 'f1', caption: '1', views: { e: { parts: [{ id: 'x', text: '1' }, { id: 'y', text: '+2' }], label: '一加二' } }, marks: [] }
      ],
      transitions: [{ from: 'f0', to: 'f1', scene: { bindings: [{ binding: 'e' }] } }]
    },
    slots: { e: slot }
  });
  await session.next();
  const scene = { parts: slot.querySelectorAll('.nui-expression__part').length, text: slot.textContent, phase: session.getState().phase, aria: slot.querySelector('.nui-expression').getAttribute('aria-label') };
  session.destroy();
  return { before, after, scene, destroyed: exprRoot.isConnected };
});
check('Expression 静态 mount/update/查询正常', expression.before.labels === 3 && expression.before.aria === '四加一' && expression.after.parts === 4 && expression.after.targets.join(',') === 'a,plus,b,c' && expression.before.state.parts[0].id === 'a' && expression.before.bodyParts === 3 && expression.before.bodyParent === true, JSON.stringify(expression.before));

const unionRange = await page.evaluate(() => {
  const range = NoteDemo.effects.unionRange([{ binding: 'x', query: { part: 'a' } }, { binding: 'y', query: { part: 'b' } }]);
  let error = '';
  try { NoteDemo.effects.unionRange([]); } catch (failure) { error = String(failure.message); }
  return { range, error };
});
check('NoteDemo.effects.unionRange 组合真实引用并拒绝空数组', unionRange.range && unionRange.range.kind === 'union' && unionRange.range.refs.length === 2 && unionRange.range.refs[1].binding === 'y' && /unionRange/.test(unionRange.error), JSON.stringify(unionRange));
check('Expression 默认 layout scene 完成', expression.scene.parts === 2 && expression.scene.text.includes('+2') && expression.scene.phase === 'idle' && expression.scene.aria === '一加二', JSON.stringify(expression.scene));

/* 5b. timing 继承、0、非法字段与 cut+after */
const timing = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rootEl = document.getElementById('root');
  const rows = [{ id: 'r1', label: '1' }, { id: 'r2', label: '2' }];
  const columns = [{ id: 'c1', label: '1' }, { id: 'c2', label: '2' }];
  const view = (cells, changedValue) => ({ rows: rows, columns: columns, values: changedValue ? [[1, 5], [3, 4]] : [[1, 2], [3, 4]], focus: { cells: cells }, changed: {} });
  function makeDef(memberTiming, sceneTiming, stateText) {
    return {
      bindings: { m: { adapter: 'matrix', slot: 'm', options: { stateText: stateText !== false } } },
      frames: [
        { id: 'f0', caption: '0', views: { m: view([{ row: 'r1', col: 'c1' }]) }, marks: [] },
        { id: 'f1', caption: '1', views: { m: view([{ row: 'r1', col: 'c2' }], true) }, marks: [] }
      ],
      transitions: [{ from: 'f0', to: 'f1', scene: {
        bindings: [Object.assign({ binding: 'm' }, memberTiming ? { timing: memberTiming } : {})],
        timing: sceneTiming || {}
      } }]
    };
  }
  async function sample(definition) {
    rootEl.innerHTML = '<div class="probe-matrix-slot"></div>';
    const host = rootEl.querySelector('.probe-matrix-slot');
    const session = NoteDemo.create({ definition: definition, slots: { m: host } });
    const promise = session.next();
    await sleep(25);
    const anims = document.getAnimations({ subtree: true }).filter((item) => item.effect && item.effect.target &&
      item.effect.target.closest && item.effect.target.closest('.note-demo-adapter--matrix')).map((item) => {
      const timingValue = item.effect.getTiming();
      return { target: String(item.effect.target.className), duration: timingValue.duration, delay: timingValue.delay };
    });
    await promise;
    session.destroy();
    return anims;
  }
  const member = await sample(makeDef({ cueDuration: 40, valueSwapDelay: 10, valueSwapDuration: 200 }, { cueDuration: 60, valueSwapDelay: 1, valueSwapDuration: 2 }, false));
  const profile = await sample(makeDef(null, {}, false));
  const scene = await sample(makeDef(null, { valueSwapDelay: 0, valueSwapDuration: 300 }, false));
  let zero = 'not run';
  try { await sample(makeDef({ cueDuration: 0, valueSwapDelay: 0, valueSwapDuration: 0 }, {}, false)); zero = 'ok'; }
  catch (error) { zero = error.message; }
  let unknownMember = '';
  try { NoteDemo.create({ definition: makeDef({ bogusField: 1 }, {}, false), slots: { m: document.createElement('div') } }); }
  catch (error) { unknownMember = error.message; }
  let cutAfter = '';
  try {
    const two = {
      bindings: { m1: { adapter: 'matrix', slot: 'm1' }, m2: { adapter: 'matrix', slot: 'm2' } },
      frames: [
        { id: 'f0', caption: '0', views: { m1: view([{ row: 'r1', col: 'c1' }]), m2: view([{ row: 'r1', col: 'c1' }]) }, marks: [] },
        { id: 'f1', caption: '1', views: { m1: view([{ row: 'r1', col: 'c2' }]), m2: view([{ row: 'r1', col: 'c2' }]) }, marks: [] }
      ],
      transitions: [{ from: 'f0', to: 'f1', scene: { bindings: [{ binding: 'm1', mode: 'cut', after: 'm2' }, { binding: 'm2' }] } }]
    };
    const one = document.createElement('div'); const twoEl = document.createElement('div');
    NoteDemo.create({ definition: two, slots: { m1: one, m2: twoEl } });
  } catch (error) { cutAfter = error.message; }
  return { member, profile, scene, zero, unknownMember, cutAfter };
});
const findAnim = (list, part) => list.find((item) => item.target.indexOf(part) >= 0) || null;
const memberCell = findAnim(timing.member, 'nviz-matrix__cell');
const memberValue = findAnim(timing.member, 'nviz-matrix__value');
const profileValue = findAnim(timing.profile, 'nviz-matrix__value');
const sceneValue = findAnim(timing.scene, 'nviz-matrix__value');
check('member.timing 覆盖 scene.timing 与 Adapter 默认', !!memberCell && memberCell.duration === 40 && !!memberValue && memberValue.duration === 200 && memberValue.delay === 10, JSON.stringify(timing.member));
check('Adapter.sceneTimingDefaults 进入最终 timing', !!profileValue && profileValue.duration === 320 && profileValue.delay === 80, JSON.stringify(timing.profile));
check('scene.timing 覆盖 Adapter 默认', !!sceneValue && sceneValue.duration === 300 && sceneValue.delay === 0, JSON.stringify(timing.scene));
check('timing 的 0 有效', timing.zero === 'ok', timing.zero);
check('未知 member.timing 字段被拒绝', /未知 timing 字段/.test(timing.unknownMember), timing.unknownMember);
check('cut 与 after 被拒绝', /cut.*after/.test(timing.cutAfter), timing.cutAfter);

/* 5c. Matrix stateText 与真实可访问状态 */
const matrixState = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rootEl = document.getElementById('root');
  const rows = [{ id: 'r1', label: '1' }, { id: 'r2', label: '2' }];
  const columns = [{ id: 'c1', label: '1' }, { id: 'c2', label: '2' }];
  const view = (cells) => ({ rows: rows, columns: columns, values: [[1, 2], [3, 4]], focus: { cells: cells }, changed: { cells: cells } });
  function def(stateText) {
    return {
      bindings: { m: { adapter: 'matrix', slot: 'm', options: { stateText: stateText } } },
      frames: [
        { id: 'f0', caption: '0', views: { m: view([{ row: 'r1', col: 'c1' }]) }, marks: [] },
        { id: 'f1', caption: '1', views: { m: view([{ row: 'r1', col: 'c2' }]) }, marks: [] }
      ],
      transitions: [{ from: 'f0', to: 'f1', scene: { bindings: [{ binding: 'm' }], timing: { cueDuration: 80, enterDuration: 100 } } }]
    };
  }
  async function run(stateText) {
    rootEl.innerHTML = '<div class="probe-state-slot"></div>';
    const host = rootEl.querySelector('.probe-state-slot');
    const session = NoteDemo.create({ definition: def(stateText), slots: { m: host } });
    const promise = session.next();
    await sleep(40);
    const mid = {
      cellFlags: Array.from(host.querySelectorAll('.nviz-matrix__cellflag:not([hidden])')).map((node) => node.textContent),
      headmarks: Array.from(host.querySelectorAll('.nviz-matrix__headmark')).map((node) => node.textContent),
      labelGhosts: host.querySelectorAll('.nviz-matrix__cellflag--ghost,.nviz-matrix__headmark--ghost').length,
      stateTexts: Array.from(host.querySelectorAll('.nviz-matrix__state')).map((node) => node.textContent),
      cellText: Array.from(host.querySelectorAll('.nviz-matrix__cell')).map((node) => node.textContent)
    };
    await promise;
    const end = {
      cellFlags: Array.from(host.querySelectorAll('.nviz-matrix__cellflag:not([hidden])')).map((node) => node.textContent),
      ghosts: host.querySelectorAll('.nviz-matrix__cellflag--ghost,.nviz-matrix__headmark--ghost').length
    };
    session.destroy();
    return { mid: mid, end: end };
  }
  return { rich: await run(true), plain: await run(false) };
});
check('stateText:true 保留可见状态文字与旧标签副本', matrixState.rich.mid.cellFlags.length >= 1 && matrixState.rich.mid.labelGhosts >= 1 && matrixState.rich.end.ghosts === 0, JSON.stringify(matrixState.rich));
check('stateText:false 隐藏可见标签且不创建副本', matrixState.plain.mid.cellFlags.length === 0 && matrixState.plain.mid.headmarks.length === 0 && matrixState.plain.mid.labelGhosts === 0, JSON.stringify(matrixState.plain.mid));
check('stateText:false 保留真实状态描述', matrixState.plain.mid.stateTexts.some((text) => text.indexOf('关注') >= 0) && matrixState.plain.mid.cellText.some((text) => text.indexOf('关注') >= 0), JSON.stringify(matrixState.plain.mid));

/* 5d. Expression 稳定载体、同 ID 换值、cue-only */
const expressionStable = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rootEl = document.getElementById('root');
  rootEl.innerHTML = '<div class="probe-expr-host"></div>';
  const host = rootEl.querySelector('.probe-expr-host');
  const expr = NoteUI.Expression.mount(host, { parts: [{ id: 'a', text: '1' }, { id: 'b', text: '+2' }], focus: ['a'] });
  const unitA = expr.getTarget({ id: 'a' });
  const valueA = expr.getTarget({ id: 'a', part: 'value' });
  expr.update({ parts: [{ id: 'b', text: '+2' }, { id: 'a', text: '3' }], focus: ['b'], changed: ['a'] });
  const component = {
    unitStable: unitA === expr.getTarget({ id: 'a' }),
    valueStable: valueA === expr.getTarget({ id: 'a', part: 'value' }),
    order: Array.from(expr.el.querySelectorAll('.nui-expression__part')).map((node) => node.getAttribute('data-part-id')),
    value: expr.getTarget({ id: 'a', part: 'value' }).textContent
  };
  expr.destroy();
  function def(fromParts, toParts, focus0, focus1) {
    return {
      bindings: { e: { adapter: 'expression', slot: 'e' } },
      frames: [
        { id: 'f0', caption: '0', views: { e: { parts: fromParts, focus: focus0 } }, marks: [] },
        { id: 'f1', caption: '1', views: { e: { parts: toParts, focus: focus1 } }, marks: [] }
      ],
      transitions: [{ from: 'f0', to: 'f1', scene: { bindings: [{ binding: 'e' }], timing: { duration: 120, enterDuration: 120, exitDuration: 100, valueSwapDelay: 10, valueSwapDuration: 200, cueDuration: 160 } } }]
    };
  }
  async function runScene(definition) {
    rootEl.innerHTML = '<div class="probe-expr-scene"></div>';
    const slot = rootEl.querySelector('.probe-expr-scene');
    const session = NoteDemo.create({ definition: definition, slots: { e: slot } });
    const beforeA = slot.querySelector('.nui-expression__part[data-part-id="a"]');
    const beforeB = slot.querySelector('.nui-expression__part[data-part-id="b"]');
    const promise = session.next();
    await sleep(60);
    const mid = {
      aStable: beforeA === slot.querySelector('.nui-expression__part[data-part-id="a"]'),
      bStable: beforeB === slot.querySelector('.nui-expression__part[data-part-id="b"]'),
      ghosts: Array.from(slot.querySelectorAll('.nui-expression__ghost')).map((node) => ({ parent: node.parentElement.className, position: getComputedStyle(node).position, text: node.textContent })),
      cueAnims: document.getAnimations({ subtree: true }).filter((item) => item.effect && item.effect.target && item.effect.target.closest && item.effect.target.closest('.nui-expression')).filter((item) => String(item.effect.target.className).indexOf('nui-expression__part') >= 0).map((item) => item.effect.getTiming().duration)
    };
    await promise;
    const end = {
      aStable: beforeA === slot.querySelector('.nui-expression__part[data-part-id="a"]'),
      bStable: beforeB === slot.querySelector('.nui-expression__part[data-part-id="b"]'),
      ghosts: slot.querySelectorAll('.nui-expression__ghost').length,
      text: slot.querySelector('.nui-expression') ? slot.querySelector('.nui-expression').textContent : ''
    };
    session.destroy();
    return { mid: mid, end: end };
  }
  const value = await runScene(def([{ id: 'a', text: '1' }, { id: 'b', text: '+2' }], [{ id: 'b', text: '+2' }, { id: 'a', text: '3' }], ['a'], ['b']));
  const cue = await runScene(def([{ id: 'a', text: '1' }, { id: 'b', text: '+2' }], [{ id: 'a', text: '1' }, { id: 'b', text: '+2' }], ['a'], ['b']));
  rootEl.innerHTML = '';
  const mathExpr = NoteUI.Expression.mount(rootEl, { parts: [{ id: 'x', tex: 'x^2' }, { id: 'y', text: '+1' }] });
  const mathNode = mathExpr.getTarget({ id: 'x', part: 'value' }).querySelector('.nui-math');
  mathExpr.update({ focus: ['y'] });
  const mathStable = mathNode === mathExpr.getTarget({ id: 'x', part: 'value' }).querySelector('.nui-math');
  mathExpr.destroy();
  return { component: component, value: value, cue: cue, mathStable: mathStable };
});
check('Expression 稳定 unit/content/value 载体', expressionStable.component.unitStable && expressionStable.component.valueStable && expressionStable.component.order.join(',') === 'b,a' && expressionStable.component.value === '3', JSON.stringify(expressionStable.component));
check('Expression 同 ID 换值副本跟随目标载体', expressionStable.value.mid.aStable && expressionStable.value.mid.bStable && expressionStable.value.mid.ghosts.length === 1 && expressionStable.value.mid.ghosts[0].parent === 'nui-expression__content' && expressionStable.value.mid.ghosts[0].position === 'absolute' && expressionStable.value.end.ghosts === 0 && expressionStable.value.end.text.includes('3'), JSON.stringify(expressionStable.value));
check('Expression cue-only 生成受控交接且不变项不重播', expressionStable.cue.mid.ghosts.length === 0 && expressionStable.cue.mid.cueAnims.length >= 2 && expressionStable.cue.mid.aStable && expressionStable.cue.mid.bStable, JSON.stringify(expressionStable.cue));
check('Expression 未变 tex 复用 Math 实例', expressionStable.mathStable === true, String(expressionStable.mathStable));

/* 6. keyed Focus 标记延续 */
const keyed = await page.evaluate(async () => {
  const host = document.createElement('div');
  host.style.width = '700px';
  document.getElementById('root').appendChild(host);
  const layout = (container) => {
    const slot = document.createElement('div');
    slot.style.minHeight = '120px';
    container.appendChild(slot);
    return { root: slot, slots: { main: slot, d: slot } };
  };
  const mark = { kind: 'focus', id: 'stable-1', target: { binding: 'd', query: { part: 'root' } }, mode: 'box' };
  const definition = {
    bindings: { d: { adapter: 'dom', slot: 'd' } },
    frames: [
      { id: 'f0', caption: '一', views: { d: { text: '同一个读数' } }, marks: [mark] },
      { id: 'f1', caption: '二', views: { d: { text: '同一个读数' } }, marks: [mark] }
    ],
    transitions: [{ from: 'f0', to: 'f1', scene: { bindings: [{ binding: 'd', mode: 'cut' }] } }]
  };
  const session = NoteDemo.mount(host, { definition, layout });
  await new Promise((r) => setTimeout(r, 100));
  const before = document.querySelector('.nx-focus');
  await session.next();
  const after = document.querySelector('.nx-focus');
  const out = { same: !!before && before === after, count: document.querySelectorAll('.nx-focus').length, state: session.getState().phase };
  session.destroy();
  return out;
});
check('keyed Focus 在 scene 中复用同一实例', keyed.same && keyed.count === 1 && keyed.state === 'idle', JSON.stringify(keyed));

/* 7. 受控效果失败：定位、清理、恢复来源、阻止下游 */
const failure = await page.evaluate(async () => {
  const rootEl = document.getElementById('root');
  rootEl.innerHTML = '<div id="fa"></div><div id="fb"></div>';
  const hostA = document.getElementById('fa');
  const hostB = document.getElementById('fb');
  const definition = {
    bindings: { a: { adapter: 'dom', slot: 'a' }, b: { adapter: 'dom', slot: 'b' } },
    frames: [
      { id: 'f0', caption: '0', views: { a: { text: 'A1' }, b: { text: 'B1' } }, marks: [] },
      { id: 'f1', caption: '1', views: { a: { text: 'A2' }, b: { text: 'B2' } }, marks: [] }
    ],
    transitions: [{ from: 'f0', to: 'f1', scene: { bindings: [{ binding: 'a' }, { binding: 'b', after: 'a' }] } }]
  };
  const session = NoteDemo.create({ definition: definition, slots: { a: hostA, b: hostB } });
  const original = Element.prototype.animate;
  Element.prototype.animate = function () {
    if (this.classList && this.classList.contains('note-demo-dom__value')) throw new Error('forced-animate-failure');
    return original.apply(this, arguments);
  };
  let result;
  try { result = await session.next(); } catch (error) { result = { status: 'threw', error: error.message }; }
  Element.prototype.animate = original;
  const state = session.getState();
  const out = {
    status: result.status,
    phase: state.phase,
    error: result.error && result.error.message ? result.error.message : (result.error || ''),
    aText: hostA.querySelector('.note-demo-dom__value') ? hostA.querySelector('.note-demo-dom__value').textContent : '',
    bText: hostB.querySelector('.note-demo-dom__value') ? hostB.querySelector('.note-demo-dom__value').textContent : '',
    ghosts: hostA.querySelectorAll('.note-demo-dom__ghost').length + hostB.querySelectorAll('.note-demo-dom__ghost').length
  };
  session.destroy();
  return out;
});
check('受控效果创建失败被定位并恢复合法停点', failure.status === 'failed' && failure.phase === 'error' && /Scene 效果失败|scene 效果失败/.test(failure.error) && failure.aText === 'A1' && failure.bText === 'B1' && failure.ghosts === 0, JSON.stringify(failure));
/* 8. 作者槽位、快照简写、after 闭包与 attention 编译 */
const authoring = await page.evaluate(() => {
  const rootEl = document.getElementById('root');
  rootEl.innerHTML = '<div data-demo-slot="a"></div><div data-demo-slot="b"></div>';
  const out = {};
  const slots = NoteDemo.collectSlots(rootEl, ['a', 'b']);
  out.slots = Object.keys(slots).sort().join(',');
  rootEl.innerHTML = '<div data-demo-slot="dup"></div><div data-demo-slot="dup"></div>';
  try { NoteDemo.collectSlots(rootEl); out.duplicate = 'no error'; } catch (error) { out.duplicate = error.message; }
  rootEl.innerHTML = '<div data-demo-slot="a"></div>';
  try { NoteDemo.collectSlots(rootEl, ['a', 'b']); out.missing = 'no error'; } catch (error) { out.missing = error.message; }
  const bindings = { a: { adapter: 'dom', slot: 'a' }, b: { adapter: 'dom', slot: 'b' } };
  const compiled = NoteDemo.compile({
    bindings: bindings,
    initial: { id: 'f0', caption: '0', views: { a: { text: 'A1' }, b: { text: 'B1' } } },
    steps: [{
      id: 'f1', caption: '1', replace: { a: { text: 'A2' } },
      scene: { bindings: [{ binding: 'a', after: 'b' }] }
    }]
  });
  const plan = NoteDemoInternals.definition.prepare(compiled);
  const scene = plan.transitions.f0.scene;
  out.frames = compiled.frames.length;
  out.fullViews = compiled.frames[1].views.a.text === 'A2' && compiled.frames[1].views.b.text === 'B1';
  out.closure = scene.bindings.some((m) => m.binding === 'b' && m.mode === 'cut');
  try {
    NoteDemo.compile({
      bindings: bindings,
      initial: { id: 'f0', caption: '0', views: { a: { text: 'A1' }, b: { text: 'B1' } } },
      steps: [{ id: 'f1', caption: '1', replace: { a: { text: 'A2' } } }]
    });
    out.noScene = 'no error';
  } catch (error) { out.noScene = error.message; }
  const attentionDef = NoteDemo.compile({
    bindings: bindings,
    initial: { id: 'f0', caption: '0', views: { a: { text: 'A1' }, b: { text: 'B1' } } },
    steps: [{
      id: 'f1', caption: '1', replace: { a: { text: 'A2' } },
      scene: { bindings: [{ binding: 'a' }] },
      attention: { targets: [{ binding: 'a', query: { part: 'value' }, holdDuration: 600 }, { binding: 'b', query: { part: 'value' } }], stepDuration: 120 }
    }]
  });
  const attentionPlan = NoteDemoInternals.definition.prepare(attentionDef);
  // T1 最终 normalized shape：groups/holdDuration 省略即无键；常量含 triggerHold。
  const attentionTargets = attentionPlan.transitions.f0.scene.attention.targets;
  out.attention = attentionPlan.transitions.f0.scene.attention.stepDuration === 120 &&
    attentionTargets.length === 2 &&
    attentionTargets[0].holdDuration === 600 &&
    !('groups' in attentionTargets[0]) && !('range' in attentionTargets[0]) &&
    !('holdDuration' in attentionTargets[1]) && !('groups' in attentionTargets[1]) &&
    NoteDemoInternals.definition.attentionMotionDefaults.stepDuration === 560 &&
    NoteDemoInternals.definition.attentionMotionDefaults.triggerHold === 0 &&
    NoteDemoInternals.definition.attentionContentTiming.enterDuration === 560 &&
    NoteDemoInternals.definition.attentionContentTiming.valueSwapDelay === 0;
  rootEl.innerHTML = '<div data-demo-slot="a"></div><div data-demo-slot="b"></div>';
  try {
    NoteDemo.create({ definition: attentionDef, slots: { a: document.querySelector('[data-demo-slot="a"]'), b: document.querySelector('[data-demo-slot="b"]') } });
    out.needsPresentation = 'no error';
  } catch (error) { out.needsPresentation = error.message; }
  return out;
});
check('collectSlots 收集并定位重复/缺失插槽', authoring.slots === 'a,b' && /重复/.test(authoring.duplicate) && /缺少/.test(authoring.missing), JSON.stringify(authoring));
check('compile 输出完整 Frame 并补齐 after 的稳定参与者', authoring.frames === 2 && authoring.fullViews && authoring.closure, JSON.stringify(authoring));
check('compile 不为未声明 scene 的变化静默降级', /scene/.test(authoring.noScene) && /不能静默降级/.test(authoring.noScene), authoring.noScene);
check('scene.attention 编译与 presentation 要求', authoring.attention && /presentation/.test(authoring.needsPresentation), JSON.stringify(authoring));
const focusCompletion = await page.evaluate(async () => {
  const rootEl = document.getElementById('root');
  rootEl.innerHTML = '<div id="focus-probe-target">probe</div>';
  const target = document.getElementById('focus-probe-target');
  const focus = NoteExpr.Focus.mount();
  focus.show(target);
  const arrived = await focus.whenArrived();
  focus.hide();
  const hidden = await focus.whenHidden();
  const visible = document.querySelectorAll('.nx-focus[data-nx-state="shown"]').length;
  focus.destroy();
  return { arrived: arrived, hidden: hidden, visible: visible };
});
check('Focus whenArrived/whenHidden 按实际动画完成', focusCompletion.arrived === true && focusCompletion.hidden === true && focusCompletion.visible === 0, JSON.stringify(focusCompletion));
// 按 manifest 扫描整个模块，而不是固定读某个文件名：拆分后新文件也受约束。
const runtimeSources = readModuleSources(root, 'demo-runtime');
const presentationSources = readModuleSources(root, 'demo-ui');
const runtimeOffenders = runtimeSources.filter((item) => /attentionStarts|attentionTimers|attentionEpoch/.test(item.content)).map((item) => item.relative);
const presentationOffenders = presentationSources.filter((item) => /exitTimer|ctrl\.exitDuration|instance\.show\(elements\[0\]\)/.test(item.content)).map((item) => item.relative);
const hasWhenArrived = presentationSources.some((item) => /whenArrived/.test(item.content));
check('聚焦协调不再保留累计到达或固定收尾计时',
  runtimeOffenders.length === 0 &&
  presentationOffenders.length === 0 &&
  hasWhenArrived,
  JSON.stringify({ runtimeOffenders, presentationOffenders, hasWhenArrived }));
check('靶向检查无页面错误', pageErrors.length === 0, pageErrors.join(' | '));

await context.close();
await browser.close();
const failed = checks.filter((row) => !row.ok);
checks.forEach((row) => console.log((row.ok ? 'PASS ' : 'FAIL ') + row.name + (row.ok ? '' : ' :: ' + row.detail)));
console.log('SUMMARY ' + (checks.length - failed.length) + '/' + checks.length + ' passed');
if (failed.length) process.exitCode = 1;