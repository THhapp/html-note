#!/usr/bin/env node
/*
 * New-contract checks for attention observation targets, effect groups and range:
 * - normalized attention target shape (groups / holdDuration / range);
 * - groups() declaration rules: every spec owned, no unknown/duplicate gating, reject before commit;
 * - one Binding, different groups released by different observation targets;
 * - observation-only targets (groups: []) do not start content;
 * - range local/union focus geometry.
 *
 * Loads src directly through tests/lib/src-sources.mjs. Usage: node tests/checks/groups-check.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleScripts, moduleStyles } from '../lib/src-sources.mjs';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const src = (rel) => path.join(root, rel);
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const MODULES = ['core', 'legacy', 'ui-layout', 'blocks-base', 'demo-stage', 'blocks', 'viz-objects', 'viz-mechanisms', 'demo-runtime', 'demo-ui'];
const STYLES = moduleStyles(root, MODULES);
const SCRIPTS = moduleScripts(root, MODULES);

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail) });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : ' :: ' + String(detail).slice(0, 400)));
}

const browser = await chromium.launch({ executablePath: edge, headless: true });
async function makePage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, reducedMotion: options.reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push('pageerror: ' + error.message));
  page.on('console', (message) => { if (message.type() === 'error') pageErrors.push('console: ' + message.text()); });
  await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}body{padding:16px;background:#f4f6f9}#root{max-width:1040px;margin:0 auto}</style></head><body><main id="root"></main></body></html>');
  for (const rel of STYLES) await page.addStyleTag({ path: src(rel) });
  for (const rel of SCRIPTS) await page.addScriptTag({ path: src(rel) });
  return { context, page, pageErrors };
}
function report(rows) { for (const row of rows) check(row.name, row.ok, row.detail); }

/* ---------------- 1. normalized attention target shape ---------------- */
{
  const { context, page, pageErrors } = await makePage({ label: 'groups-shape' });
  const rows = await page.evaluate(() => {
    const out = [];
    const check = (name, ok, detail) => out.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    function domDefinition(attention) {
      return {
        bindings: { a: { adapter: 'dom', slot: 'a' }, b: { adapter: 'dom', slot: 'b' } },
        frames: [
          { id: 'f0', caption: '0', views: { a: { text: 'A0' }, b: { text: 'B0' } }, marks: [] },
          { id: 'f1', caption: '1', views: { a: { text: 'A1' }, b: { text: 'B1' } }, marks: [] }
        ],
        transitions: [{ from: 'f0', to: 'f1', scene: { bindings: [{ binding: 'a', mode: 'update' }, { binding: 'b', mode: 'update' }], attention: attention } }]
      };
    }
    try {
      const plan = NoteDemoInternals.definition.prepare(domDefinition({
        targets: [
          { binding: 'a', query: { part: 'value' } },
          { binding: 'b', query: { part: 'root' }, groups: [] },
          { binding: 'a', query: { part: 'value' }, groups: ['g2', 'g1'], holdDuration: 0, range: { kind: 'local', dx: -4, dy: -6, width: 120, height: 36 } }
        ]
      }));
      const attention = plan.transitions.f0.scene.attention;
      const first = attention.targets[0];
      const second = attention.targets[1];
      const third = attention.targets[2];
      check('attention 默认 stepDuration=560', attention.stepDuration === 560, JSON.stringify(attention.stepDuration));
      check('attentionMotionDefaults 最终常量', NoteDemoInternals.definition.attentionMotionDefaults.stepDuration === 560 &&
        NoteDemoInternals.definition.attentionMotionDefaults.triggerHold === 0,
        JSON.stringify(NoteDemoInternals.definition.attentionMotionDefaults));
      check('attention target 省略 groups 时无该键', !('groups' in first), JSON.stringify(first));
      check('attention groups:[] 原样保留', Array.isArray(second.groups) && second.groups.length === 0, JSON.stringify(second.groups));
      check('attention groups 保持声明顺序', JSON.stringify(third.groups) === JSON.stringify(['g2', 'g1']), JSON.stringify(third.groups));
      check('attention 显式 holdDuration 0 保留', third.holdDuration === 0, JSON.stringify(third.holdDuration));
      check('attention range local 规范化', JSON.stringify(third.range) === JSON.stringify({ kind: 'local', dx: -4, dy: -6, width: 120, height: 36 }), JSON.stringify(third.range));
      const union = NoteDemoInternals.definition.prepare(domDefinition({
        stepDuration: 90,
        targets: [{ binding: 'a', query: { part: 'value' }, groups: [], range: { kind: 'union', refs: [{ binding: 'b', query: { part: 'value' } }] } }]
      })).transitions.f0.scene.attention;
      check('attention range union 规范化', union.stepDuration === 90 &&
        JSON.stringify(union.targets[0].range) === JSON.stringify({ kind: 'union', refs: [{ binding: 'b', query: { part: 'value' } }] }),
        JSON.stringify(union));
    } catch (error) {
      check('attention 正常形状可 prepare', false, error && error.message);
    }
    function definitionWithScene(scene, extraBindings) {
      const bindings = Object.assign({ a: { adapter: 'dom', slot: 'a' }, b: { adapter: 'dom', slot: 'b' } }, extraBindings || {});
      return {
        bindings: bindings,
        frames: [
          { id: 'f0', caption: '0', views: { a: { text: 'A0' }, b: { text: 'B0' } }, marks: [] },
          { id: 'f1', caption: '1', views: { a: { text: 'A1' }, b: { text: 'B1' } }, marks: [] }
        ],
        transitions: [{ from: 'f0', to: 'f1', scene: scene }]
      };
    }
    function expectPrepareReject(label, definition, matcher) {
      try {
        NoteDemoInternals.definition.prepare(definition);
        check('attention 拒绝：' + label, false, '未抛错');
      } catch (error) {
        const message = String(error && error.message);
        check('attention 拒绝：' + label, matcher.test(message), message.slice(0, 240));
      }
    }
    expectPrepareReject('稳定参照声明非空 groups',
      definitionWithScene({ bindings: [{ binding: 'a' }], attention: { targets: [{ binding: 'b', query: { part: 'value' }, groups: ['g1'] }] } }),
      /稳定参照/);
    expectPrepareReject('cut 目标作为内容门控',
      definitionWithScene({ bindings: [{ binding: 'a', mode: 'cut' }, { binding: 'b', mode: 'cut' }], attention: { targets: [{ binding: 'a', query: { part: 'root' } }] } }),
      /cut[\s\S]*内容门控/);
    expectPrepareReject('reveal 目标声明非空 groups',
      definitionWithScene({ bindings: [{ binding: 'a', mode: 'reveal' }, { binding: 'b', mode: 'reveal' }], attention: { targets: [{ binding: 'a', query: { part: 'root' }, groups: ['g1'] }] } }),
      /reveal|groups/);
    const badCases = [
      ['负 holdDuration', { targets: [{ binding: 'a', query: { part: 'value' }, holdDuration: -1 }] }, 'holdDuration'],
      ['超上限 holdDuration', { targets: [{ binding: 'a', query: { part: 'value' }, holdDuration: 10001 }] }, 'holdDuration'],
      ['非数字 holdDuration', { targets: [{ binding: 'a', query: { part: 'value' }, holdDuration: 'x' }] }, 'holdDuration'],
      ['空 groups 元素', { targets: [{ binding: 'a', query: { part: 'value' }, groups: [''] }] }, 'groups'],
      ['重复声明组', { targets: [{ binding: 'a', query: { part: 'value' }, groups: ['g1', 'g1'] }] }, '重复'],
      ['range 非法 kind', { targets: [{ binding: 'a', query: { part: 'value' }, groups: [], range: { kind: 'zoom' } }] }, 'range'],
      ['union refs 为空', { targets: [{ binding: 'a', query: { part: 'value' }, groups: [], range: { kind: 'union', refs: [] } }] }, 'range']
    ];
    for (const [label, attention, field] of badCases) {
      try {
        NoteDemoInternals.definition.prepare(domDefinition(attention));
        check('attention 拒绝：' + label, false, '未抛错');
      } catch (error) {
        const message = String(error && error.message);
        check('attention 拒绝：' + label, /attention/.test(message) && message.indexOf(field) >= 0, message.slice(0, 200));
      }
    }
    return out;
  });
  report(rows);
  check('attention shape 区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  await context.close();
}

/* ---------------- 2. groups() 归属、放行顺序与拒绝 ---------------- */
{
  const { context, page, pageErrors } = await makePage({ label: 'groups-runtime' });
  const rows = await page.evaluate(async () => {
    const out = [];
    const check = (name, ok, detail) => out.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    function layout(container) {
      const wrap = document.createElement('div');
      const main = document.createElement('div');
      wrap.appendChild(main);
      container.appendChild(wrap);
      return { root: wrap, slots: { main: main } };
    }
    function makeAdapter(id, groups, specsFactory, options) {
      const config = options || {};
      return {
        name: id,
        normalizeView(input) { return { model: {}, cues: {} }; },
        sceneModes: ['update'],
        defaultSceneMode: 'update',
        mount(mountHost) {
          const rootNode = document.createElement('div');
          rootNode.className = 'contract-' + id;
          mountHost.appendChild(rootNode);
          window.__starts = window.__starts || [];
          let committed = false;
          return {
            restore() {},
            readView() { return { model: {}, cues: {} }; },
            target(query) { return query && query.part === 'root' ? rootNode : null; },
            prepareChange() {
              return {
                groups() { return groups; },
                commit() { committed = true; },
                effects() {
                  const specs = specsFactory ? specsFactory() : [];
                  return specs;
                },
                cleanup() { committed = false; }
              };
            },
            destroy() { rootNode.remove(); }
          };
        }
      };
    }
    function progressSpec(group, key) {
      return {
        group,
        type: 'progress',
        duration: 90,
        update(progress) {
          // progress spec 创建时会先 update(0)；把首个 >0 的推进视为真正启动。
          if (!window.__starts[key] && progress > 0.0001) window.__starts[key] = { at: performance.now(), first: progress };
          window.__progress = window.__progress || {};
          window.__progress[key] = progress;
        }
      };
    }
    function groupedDefinition(attentionGroups) {
      const targets = attentionGroups.map((groups) => ({ binding: 'g', query: { part: 'root' }, groups: groups }));
      return {
        bindings: { g: { adapter: 'g', slot: 'main' } },
        frames: [
          { id: 'f0', caption: '0', views: { g: {} }, marks: [] },
          { id: 'f1', caption: '1', views: { g: {} }, marks: [] }
        ],
        transitions: [{ from: 'f0', to: 'f1', scene: { bindings: [{ binding: 'g', mode: 'update' }], attention: { stepDuration: 60, targets: targets } } }]
      };
    }
    if (!window.__focusArrivalProbeInstalled) {
      window.__focusArrivalProbeInstalled = true;
      window.__focusGroupArrivals = [];
      const originalMount = NoteExpr.Focus.mount;
      NoteExpr.Focus.mount = function (options) {
        const view = originalMount.call(NoteExpr.Focus, options);
        const originalWhenArrived = view.whenArrived;
        view.whenArrived = function () {
          const promise = originalWhenArrived.call(view);
          try { Promise.resolve(promise).then(() => { window.__focusGroupArrivals.push(performance.now()); }); } catch (error) { /* ignore */ }
          return promise;
        };
        return view;
      };
    }
    window.__starts = {};
    const adapter = makeAdapter('g', ['g1', 'g2'], () => [progressSpec('g1', 'g1'), progressSpec('g2', 'g2')]);
    const host = document.createElement('div');
    document.getElementById('root').appendChild(host);
    let session = null;
    try {
      session = NoteDemo.mount(host, { definition: groupedDefinition([['g1'], ['g2']]), adapters: { g: adapter }, layout: layout, label: 'groups' });
    } catch (error) {
      check('groups 场景可挂载', false, error && error.message);
      return out;
    }
    const run = session.next();
    const samples = [];
    for (let index = 0; index < 60; index += 1) {
      await sleep(20);
      samples.push({ g1: window.__progress && window.__progress.g1, g2: window.__progress && window.__progress.g2 });
      if (session.getState().phase === 'idle') break;
    }
    const result = await run;
    check('groups 场景完成', result.status === 'completed', JSON.stringify(result));
    check('groups 按观察目标顺序分别启动', !!window.__starts.g1 && !!window.__starts.g2 &&
      window.__starts.g1.at < window.__starts.g2.at,
      JSON.stringify({ g1: window.__starts.g1 && Math.round(window.__starts.g1.at), g2: window.__starts.g2 && Math.round(window.__starts.g2.at) }));
    check('groups 不同组不合并启动', samples.some((sample) => Number(sample.g1) > 0 && !(Number(sample.g2) > 0)) &&
      samples.some((sample) => Number(sample.g2) > 0),
      JSON.stringify(samples.slice(0, 12)));
    check('groups 最终进度为 1', Number(window.__progress.g1) >= 0.999 && Number(window.__progress.g2) >= 0.999,
      JSON.stringify(window.__progress));
    session.destroy();

    window.__starts = {};
    const observeAdapter = makeAdapter('g', ['g1'], () => [progressSpec('g1', 'g1')]);
    const observeHost = document.createElement('div');
    document.getElementById('root').appendChild(observeHost);
    const observeArrivalBase = window.__focusGroupArrivals.length;
    const observeSession = NoteDemo.mount(observeHost, {
      definition: groupedDefinition([[], ['g1']]),
      adapters: { g: observeAdapter },
      layout: layout,
      label: 'groups-observe'
    });
    await observeSession.next();
    const observeArrivals = window.__focusGroupArrivals.slice(observeArrivalBase);
    const lastObserveArrival = observeArrivals.length ? observeArrivals[observeArrivals.length - 1] : -1;
    // groups:[] 的观察目标本身不启动内容；内容只应由后面的门控目标到达后启动。
    check('groups:[] 只观察，内容由后续门控目标启动', !!window.__starts.g1 && lastObserveArrival > 0 &&
      window.__starts.g1.at >= lastObserveArrival - 32 && window.__starts.g1.at <= lastObserveArrival + 120,
      JSON.stringify({ starts: window.__starts.g1, lastArrival: Math.round(lastObserveArrival), arrivals: observeArrivals.map((value) => Math.round(value)) }));
    observeSession.destroy();
    return out;
  });
  report(rows);
  check('groups 运行区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  await context.close();
}

/* ---------------- 3. 拒绝路径（未知组/重复门控/漏归属/未声明组） ---------------- */
{
  const { context, page, pageErrors } = await makePage({ label: 'groups-reject' });
  const rows = await page.evaluate(async () => {
    const out = [];
    const check = (name, ok, detail) => out.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    function layout(container) {
      const wrap = document.createElement('div');
      const main = document.createElement('div');
      wrap.appendChild(main);
      container.appendChild(wrap);
      return { root: wrap, slots: { main: main } };
    }
    function makeAdapter(id, groups, specs) {
      return {
        name: id,
        normalizeView() { return { model: {}, cues: {} }; },
        sceneModes: ['update'],
        defaultSceneMode: 'update',
        mount(mountHost) {
          const rootNode = document.createElement('div');
          mountHost.appendChild(rootNode);
          return {
            restore() {},
            readView() { return { model: {}, cues: {} }; },
            target(query) { return query && query.part === 'root' ? rootNode : null; },
            prepareChange() {
              return {
                groups() { return groups; },
                commit() {},
                effects() { return specs; },
                cleanup() {}
              };
            },
            destroy() { rootNode.remove(); }
          };
        }
      };
    }
    function definitionFor(targets, groupsForAdapter) {
      return {
        bindings: { g: { adapter: 'g', slot: 'main' } },
        frames: [
          { id: 'f0', caption: '0', views: { g: {} }, marks: [] },
          { id: 'f1', caption: '1', views: { g: {} }, marks: [] }
        ],
        transitions: [{ from: 'f0', to: 'f1', scene: { bindings: [{ binding: 'g', mode: 'update' }], attention: { stepDuration: 40, targets: targets } } }]
      };
    }
    async function runCase(label, adapter, targets, matcher) {
      const host = document.createElement('div');
      document.getElementById('root').appendChild(host);
      let session = null;
      let error = null;
      try {
        session = NoteDemo.mount(host, { definition: definitionFor(targets), adapters: { g: adapter }, layout: layout, label: label });
        const result = await session.next();
        if (result.status !== 'completed') error = result.error || result;
      } catch (caught) {
        error = caught;
      }
      const message = error ? String(error.message || error) : '';
      check(label, !!message && matcher.test(message), message.slice(0, 300));
      if (session && typeof session.destroy === 'function') session.destroy();
      host.remove();
    }
    const okSpec = [{ group: 'g1', type: 'progress', duration: 50, update() {} }];
    await runCase('分组成员省略 groups 被拒绝', makeAdapter('g', ['g1'], okSpec),
      [{ binding: 'g', query: { part: 'root' } }], /必须显式声明 groups/);
    await runCase('未知效果组被拒绝', makeAdapter('g', ['g1'], okSpec),
      [{ binding: 'g', query: { part: 'root' }, groups: ['nope'] }], /未知效果组/);
    await runCase('重复门控被拒绝', makeAdapter('g', ['g1'], okSpec),
      [{ binding: 'g', query: { part: 'root' }, groups: ['g1'] }, { binding: 'g', query: { part: 'root' }, groups: ['g1'] }], /重复门控/);
    await runCase('effects 漏 group 归属被拒绝', makeAdapter('g', ['g1'], [{ type: 'progress', duration: 50, update() {} }]),
      [{ binding: 'g', query: { part: 'root' }, groups: ['g1'] }], /缺少 group 归属/);
    await runCase('未声明组的 Adapter 带 spec.group 被拒绝', makeAdapter('g', null, [{ group: 'g1', type: 'progress', duration: 50, update() {} }]),
      [{ binding: 'g', query: { part: 'root' }, groups: ['g1'] }], /未声明效果组/);
    await runCase('未声明效果组的 Adapter 被目标门控被拒绝', makeAdapter('g', null, []),
      [{ binding: 'g', query: { part: 'root' }, groups: ['g1'] }], /未声明效果组/);
    return out;
  });
  report(rows);
  check('groups 拒绝区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  await context.close();
}

/* ---------------- 4. range local/union 焦点几何 ---------------- */
{
  const { context, page, pageErrors } = await makePage({ label: 'groups-range' });
  const rows = await page.evaluate(async () => {
    const out = [];
    const check = (name, ok, detail) => out.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    function layout(container) {
      const wrap = document.createElement('div');
      const main = document.createElement('div');
      wrap.appendChild(main);
      container.appendChild(wrap);
      return { root: wrap, slots: { main: main } };
    }
    function definitionFor(range) {
      return {
        bindings: { a: { adapter: 'dom', slot: 'main' } },
        frames: [
          { id: 'f0', caption: '0', views: { a: { text: 'A0' } }, marks: [] },
          { id: 'f1', caption: '1', views: { a: { text: 'A1' } }, marks: [] }
        ],
        transitions: [{ from: 'f0', to: 'f1', scene: { bindings: [{ binding: 'a', mode: 'update' }], attention: { stepDuration: 40, targets: [{ binding: 'a', query: { part: 'value' }, range: range }] } } }]
      };
    }
    function boxRect() {
      const box = document.querySelector('.nx-focus__box');
      if (!box) return null;
      const rect = box.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }
    async function runRange(range, verify) {
      const host = document.createElement('div');
      document.getElementById('root').appendChild(host);
      const session = NoteDemo.mount(host, { definition: definitionFor(range), layout: layout, label: 'range' });
      await session.next();
      await sleep(80);
      const box = boxRect();
      check('range 焦点框存在（' + range.kind + '）', !!box, JSON.stringify(box));
      if (box) verify(box);
      session.destroy();
      host.remove();
    }
    const valueRect = { rect: null };
    await runRange({ kind: 'local', dx: -8, dy: -4, width: 140, height: 40 }, (box) => {
      const value = document.querySelector('.nui-dom__value, .note-demo-dom__value');
      const vr = value.getBoundingClientRect();
      valueRect.rect = vr;
      check('range local 聚焦到指定局部矩形', Math.abs(box.left - (vr.left - 8 - 6)) <= 3 && Math.abs(box.top - (vr.top - 4 - 6)) <= 3 &&
        Math.abs(box.width - (140 + 12)) <= 3 && Math.abs(box.height - (40 + 12)) <= 3,
        JSON.stringify({ box, value: { left: vr.left, top: vr.top } }));
    });
    const host2 = document.createElement('div');
    document.getElementById('root').appendChild(host2);
    const unionSession = NoteDemo.mount(host2, {
      definition: {
        bindings: { a: { adapter: 'dom', slot: 'main' }, b: { adapter: 'dom', slot: 'aside' } },
        frames: [
          { id: 'f0', caption: '0', views: { a: { text: 'A0' }, b: { text: 'B0' } }, marks: [] },
          { id: 'f1', caption: '1', views: { a: { text: 'A1' }, b: { text: 'B1' } }, marks: [] }
        ],
        transitions: [{ from: 'f0', to: 'f1', scene: { bindings: [{ binding: 'a', mode: 'update' }, { binding: 'b', mode: 'update' }], attention: { stepDuration: 40, targets: [{ binding: 'a', query: { part: 'value' },
          range: { kind: 'union', refs: [{ binding: 'b', query: { part: 'value' } }] } }] } } }]
      },
      layout: (container) => {
        const wrap = document.createElement('div');
        const main = document.createElement('div');
        main.style.width = '200px';
        const aside = document.createElement('div');
        wrap.append(main, aside);
        container.appendChild(wrap);
        return { root: wrap, slots: { main: main, aside: aside } };
      },
      label: 'range-union'
    });
    await unionSession.next();
    await sleep(80);
    const unionBox = boxRect();
    const targets = Array.from(document.querySelectorAll('.note-demo-dom__value')).map((node) => node.getBoundingClientRect());
    const unionRect = targets.reduce((acc, rect) => ({
      left: Math.min(acc.left, rect.left), top: Math.min(acc.top, rect.top),
      right: Math.max(acc.right, rect.right), bottom: Math.max(acc.bottom, rect.bottom)
    }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    check('range union 覆盖主元素与 refs 并集', !!unionBox &&
      Math.abs(unionBox.left - (unionRect.left - 6)) <= 3 && Math.abs(unionBox.top - (unionRect.top - 6)) <= 3 &&
      Math.abs(unionBox.width - (unionRect.right - unionRect.left + 12)) <= 3,
      JSON.stringify({ unionBox, unionRect }));
    unionSession.destroy();
    return out;
  });
  report(rows);
  check('groups range 区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  await context.close();
}

await browser.close();
const failed = checks.filter((row) => !row.ok);
console.log('SUMMARY ' + (checks.length - failed.length) + '/' + checks.length + ' passed');
if (failed.length) process.exitCode = 1;
