#!/usr/bin/env node
/*
 * NoteDemo.sceneAdapter / timingFacts 公共辅助回归（src 直载，真实 Edge）。
 * - define/progress 参数校验、normalizeView/mount 包装、PreparedChange 组织与幂等；
 * - timing 最终值透传（scene/Adapter 默认合并、0 合法、不夹最小 duration）；
 * - 减少动效跳过 effects、commit 只发生一次；
 * - timingFacts.watch 收集 focus-arrival / effect-start / ready / finished，stop 后移除监听；
 * - 全程不写文件。
 *
 * Usage: node tests/checks/scene-adapter-check.mjs
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
const MODULES = ['core', 'legacy', 'ui-layout', 'blocks', 'viz-objects', 'viz-mechanisms', 'demo-runtime', 'demo-ui'];
const STYLES = moduleStyles(root, MODULES);
const SCRIPTS = moduleScripts(root, MODULES);

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail) });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : ' :: ' + String(detail).slice(0, 500)));
}

const browser = await chromium.launch({ executablePath: edge, headless: true });
async function makePage(reduced) {
  const context = await browser.newContext({ viewport: { width: 1000, height: 800 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push('pageerror: ' + error.message));
  page.on('console', (message) => { if (message.type() === 'error') pageErrors.push('console: ' + message.text()); });
  await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}body{padding:16px;background:#f4f6f9}#root{max-width:800px;margin:0 auto}.adapter-box{width:140px;height:60px;background:#dce8ff;border:1px solid #9db2d6}</style></head><body><main id="root"></main></body></html>');
  for (const rel of STYLES) await page.addStyleTag({ path: src(rel) });
  for (const rel of SCRIPTS) await page.addScriptTag({ path: src(rel) });
  return { context, page, pageErrors };
}
function report(rows) { for (const row of rows) check(row.name, row.ok, row.detail); }

/* ---------------- 1. define / progress 校验与包装 ---------------- */
{
  const { context, page, pageErrors } = await makePage(false);
  const rows = await page.evaluate(() => {
    const out = [];
    const check = (name, ok, detail) => out.push({ name: name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    const Adapter = window.NoteDemo && window.NoteDemo.sceneAdapter;
    check('NoteDemo.sceneAdapter 可用', !!Adapter && Adapter.version === '1.0.0' && typeof Adapter.define === 'function' &&
      typeof Adapter.progress === 'function', JSON.stringify(Adapter));
    function errorOf(fn) { try { fn(); return null; } catch (error) { return { name: error.name, message: String(error.message) }; } }
    const validSpec = () => ({
      name: 'probe', sceneModes: ['update'], defaultSceneMode: 'update',
      normalizeView: function (input) { return { value: Number(input && input.value) || 0 }; },
      mount: function (host) {
        const node = document.createElement('div');
        node.className = 'adapter-box';
        host.appendChild(node);
        return { restore: function () {}, readModel: function () { return { value: 0 }; }, destroy: function () { node.remove(); } };
      }
    });
    const defineErrors = [
      ['缺 name', Object.assign(validSpec(), { name: '' }), /name/],
      ['缺 normalizeView', Object.assign(validSpec(), { normalizeView: null }), /normalizeView/],
      ['缺 mount', Object.assign(validSpec(), { mount: null }), /mount/],
      ['sceneModes 非数组', Object.assign(validSpec(), { sceneModes: 'update' }), /sceneModes/],
      ['defaultSceneMode 不在 sceneModes', Object.assign(validSpec(), { defaultSceneMode: 'layout' }), /defaultSceneMode/],
      ['timingDefaults 负数', Object.assign(validSpec(), { sceneTimingDefaults: { enterDuration: -1 } }), /enterDuration/],
      ['timingDefaults NaN', Object.assign(validSpec(), { sceneTimingDefaults: { enterDuration: NaN } }), /enterDuration/],
      ['timingDefaults easing 空串', Object.assign(validSpec(), { sceneTimingDefaults: { easing: ' ' } }), /easing/]
    ];
    const defineResults = defineErrors.map(function (item) {
      const error = errorOf(function () { Adapter.define(item[1]); });
      return { label: item[0], ok: !!error && item[2].test(error.message), message: error && error.message };
    });
    check('define 参数定位错误', defineResults.every((item) => item.ok), JSON.stringify(defineResults));
    check('define 接受 0 时长默认值', !errorOf(function () { Adapter.define(Object.assign(validSpec(), { sceneTimingDefaults: { enterDuration: 0, valueSwapDelay: 0 } })); }));
    const adapter = Adapter.define(validSpec());
    check('define 输出 Adapter 名与 scene 模式', adapter.name === 'probe' && adapter.defaultSceneMode === 'update' &&
      JSON.stringify(adapter.sceneModes) === JSON.stringify(['update']));
    check('normalizeView 普通对象包装为 model/cues', JSON.stringify(adapter.normalizeView({ value: 3 })) === JSON.stringify({ model: { value: 3 }, cues: {} }));
    const echoAdapter = Adapter.define(Object.assign(validSpec(), { normalizeView: function (input) { return input; } }));
    check('normalizeView model/cues 形状保留', JSON.stringify(echoAdapter.normalizeView({ model: { value: 1 }, cues: { a: 1 } })) === JSON.stringify({ model: { value: 1 }, cues: { a: 1 } }));
    const halfAdapter = Adapter.define(Object.assign(validSpec(), { normalizeView: function () { return { model: { value: 1 } }; } }));
    const halfView = errorOf(function () { halfAdapter.normalizeView({}); });
    check('normalizeView 半形状定位错误', !!halfView && /model|cues/.test(halfView.message), JSON.stringify(halfView));
    const badMount = Adapter.define(Object.assign(validSpec(), { mount: function (host) { host.appendChild(document.createElement('div')); return {}; } }));
    const missingRestore = errorOf(function () { badMount.mount(document.createElement('div')); });
    check('mount 输出缺少 restore 时定位错误', !!missingRestore && /restore/.test(missingRestore.message), JSON.stringify(missingRestore));

    const progressSpec = Adapter.progress({ duration: 0, update: function () {}, delay: 0, easing: 'linear', group: 'g', gate: 'ready' });
    check('progress 0 时长/组/gate 合法', progressSpec.type === 'progress' && progressSpec.duration === 0 &&
      progressSpec.group === 'g' && progressSpec.gate === 'ready' && typeof progressSpec.update === 'function', JSON.stringify(progressSpec));
    const progressErrors = [
      ['缺 update', { duration: 10 }, /update/],
      ['负 duration', { duration: -2, update: function () {} }, /duration/],
      ['非数字 duration', { duration: 'x', update: function () {} }, /duration/],
      ['负 delay', { duration: 10, delay: -1, update: function () {} }, /delay/],
      ['空 easing', { duration: 10, easing: ' ', update: function () {} }, /easing/],
      ['坏 gate', { duration: 10, gate: 'later', update: function () {} }, /gate/],
      ['空 group', { duration: 10, group: '', update: function () {} }, /group/]
    ];
    const progressResults = progressErrors.map(function (item) {
      const error = errorOf(function () { Adapter.progress(item[1]); });
      return { label: item[0], ok: !!error && item[2].test(error.message), message: error && error.message };
    });
    check('progress 参数定位错误', progressResults.every((item) => item.ok), JSON.stringify(progressResults));
    return out;
  });
  report(rows);
  check('sceneAdapter 校验区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  await context.close();
}

/* ---------------- 2. PreparedChange 组织 / timing 最终值 / reduced / facts ---------------- */
{
  const { context, page, pageErrors } = await makePage(false);
  const rows = await page.evaluate(async () => {
    const out = [];
    const check = (name, ok, detail) => out.push({ name: name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const Adapter = window.NoteDemo.sceneAdapter;
    function errorOf(fn) { try { fn(); return null; } catch (error) { return { name: error.name, message: String(error.message) }; } }
    function makeProbeAdapter(options) {
      const config = options || {};
      return Adapter.define({
        name: config.name || 'probe-adapter',
        sceneModes: ['update'],
        defaultSceneMode: 'update',
        sceneTimingDefaults: config.sceneTimingDefaults || { enterDuration: 240, valueSwapDelay: 0 },
        normalizeView: function (input) { const source = input && typeof input === 'object' ? input : {}; return { model: { value: Number(source.value) || 0 }, cues: {} }; },
        mount: function (host) {
          const node = document.createElement('div');
          node.className = 'adapter-box';
          host.appendChild(node);
          let value = 0;
          return {
            restore: function (model) { value = Number(model && model.value) || 0; node.textContent = String(value); },
            readModel: function () { return { value: value }; },
            target: function (query) { return query && query.part === 'root' ? node : null; },
            destroy: function () { node.remove(); },
            planStep: function (input) {
              window.__planInputSeen = { bindingId: input.bindingId, sourceFrameId: input.sourceFrameId, targetFrameId: input.targetFrameId, motion: input.motion, reduced: input.reduced };
              const targetValue = input.targetModel && input.targetModel.value;
              return {
                commit: function () { window.__commitCount = (window.__commitCount || 0) + 1; value = Number(targetValue) || 0; node.textContent = String(value); },
                groups: function () { return config.groups; },
                targets: function () { return config.badTargets ? 'x' : []; },
                effects: function (timing, meta) {
                  window.__effectsCalled = (window.__effectsCalled || 0) + 1;
                  window.__timingSeen = timing;
                  window.__effectMetaSeen = meta;
                  if (config.badEffects) return 'not-array';
                  return [Adapter.progress({ duration: timing.enterDuration, update: function () {} })];
                },
                sourceElements: function () { window.__sourceElementsCalled = (window.__sourceElementsCalled || 0) + 1; return [node]; },
                cleanup: function () { window.__cleanupCount = (window.__cleanupCount || 0) + 1; }
              };
            }
          };
        }
      });
    }
    const layout = (container) => {
      const wrap = document.createElement('div');
      const main = document.createElement('div');
      const slot = document.createElement('div');
      wrap.append(main, slot);
      container.appendChild(wrap);
      return { root: wrap, slots: { main: main, m: slot } };
    };
    function definitionFor(steps, sceneExtra) {
      return {
        bindings: { m: { adapter: 'probe-adapter', slot: 'm' } },
        frames: [
          { id: 'f0', caption: '0', views: { m: { value: 0 } }, marks: [] },
          { id: 'f1', caption: '1', views: { m: { value: 1 } }, marks: [] },
          { id: 'f2', caption: '2', views: { m: { value: 2 } }, marks: [] }
        ],
        transitions: steps.map((step) => ({
          from: step[0], to: step[1],
          scene: Object.assign({ bindings: [{ binding: 'm', mode: 'update' }] }, step[2] || {}, sceneExtra || {})
        }))
      };
    }
    const host = document.createElement('div');
    document.getElementById('root').appendChild(host);
    const adapter = makeProbeAdapter();
    const session = window.NoteDemo.mount(host, {
      definition: definitionFor([['f0', 'f1', { attention: { stepDuration: 60, targets: [{ binding: 'm', query: { part: 'root' } }] } }], ['f1', 'f2']], { timing: { enterDuration: 0 } }),
      adapters: { 'probe-adapter': adapter }, layout: layout, label: 'scene adapter 探针'
    });
    const rec = window.NoteDemo.timingFacts.watch(session);
    const first = await session.next();
    await sleep(120);
    const facts = rec.snapshot();
    const kinds = Array.from(new Set(facts.map((fact) => fact.kind)));
    const timing = window.__timingSeen || null;
    check('timing 最终值透传（scene 覆盖 0 合法、Adapter 默认补足）', first.status === 'completed' && !!timing &&
      timing.enterDuration === 0 && timing.valueSwapDelay === 0 && timing.valueSwapDelay !== undefined &&
      timing.duration > 0 && timing.easing !== '',
      JSON.stringify({ status: first.status, timing: timing }));
    check('planStep 收到 Binding/Frame/motion 上下文', !!window.__planInputSeen && window.__planInputSeen.bindingId === 'm' &&
      window.__planInputSeen.sourceFrameId === 'f0' && window.__planInputSeen.targetFrameId === 'f1' &&
      window.__planInputSeen.motion === 'auto' && window.__planInputSeen.reduced === false,
      JSON.stringify(window.__planInputSeen));
    check('effects 收到 timing 与 meta（binding/attention/grouped）', !!window.__effectMetaSeen &&
      window.__effectMetaSeen.bindingId === 'm' && window.__effectMetaSeen.attention === true &&
      window.__effectMetaSeen.grouped === false && Array.isArray(window.__effectMetaSeen.groups),
      JSON.stringify(window.__effectMetaSeen));
    check('sourceElements 在本步被调用', (window.__sourceElementsCalled || 0) === 1, String(window.__sourceElementsCalled));
    check('timingFacts.watch 收集 focus-arrival/effect-start/ready/finished', window.NoteDemo.timingFacts.supported() === true &&
      kinds.indexOf('effect-start') >= 0 && kinds.indexOf('ready') >= 0 && kinds.indexOf('finished') >= 0 &&
      kinds.indexOf('focus-arrival') >= 0, JSON.stringify({ kinds: kinds, count: facts.length }));
    const summary = rec.summary();
    check('timingFacts.summary 按 run/binding/track 汇总', summary.count === facts.length && summary.runs.length >= 1 &&
      summary.runs.some((run) => run.bindings && Object.keys(run.bindings).length > 0),
      JSON.stringify({ count: summary.count, runs: summary.runs.length }));
    const countBeforeStop = rec.count();
    rec.stop();
    const second = await session.next();
    await sleep(80);
    check('timingFacts.stop 后不再收集且不影响运行', second.status === 'completed' && rec.count() === countBeforeStop &&
      window.__commitCount >= 2, JSON.stringify({ second: second.status, before: countBeforeStop, after: rec.count(), commits: window.__commitCount }));
    const invalidWatch = errorOf(function () { window.NoteDemo.timingFacts.watch({}); });
    check('timingFacts.watch 非法会话定位错误', !!invalidWatch && /session/.test(invalidWatch.message), JSON.stringify(invalidWatch));
    session.destroy();
    host.remove();

    /* PreparedChange 包装：commit/cleanup 幂等、plan 形状校验 */
    const wrapperHost = document.createElement('div');
    document.getElementById('root').appendChild(wrapperHost);
    window.__commitCount = 0;
    window.__cleanupCount = 0;
    const wrapperAdapter = makeProbeAdapter({ name: 'wrapper-probe', groups: ['g1'] });
    const handle = wrapperAdapter.mount(wrapperHost);
    const ctx = { bindingId: 'm', motion: 'auto', sourceView: { model: { value: 0 } }, targetView: { model: { value: 1 } } };
    const prepared = handle.prepareChange(ctx);
    check('PreparedChange 暴露 commit/targets/groups/effects/cleanup/facts', !!prepared &&
      typeof prepared.commit === 'function' && typeof prepared.targets === 'function' &&
      typeof prepared.groups === 'function' && typeof prepared.effects === 'function' &&
      typeof prepared.cleanup === 'function');
    prepared.commit();
    prepared.commit();
    prepared.cleanup();
    prepared.cleanup();
    check('PreparedChange commit/cleanup 幂等', window.__commitCount === 1 && window.__cleanupCount === 1,
      JSON.stringify({ commit: window.__commitCount, cleanup: window.__cleanupCount }));
    check('PreparedChange groups 透传字符串数组', JSON.stringify(prepared.groups()) === JSON.stringify(['g1']), JSON.stringify(prepared.groups()));
    const effects = prepared.effects({ timing: { enterDuration: 100 }, bindingId: 'm', attention: true, grouped: true, groups: ['g1'] });
    check('PreparedChange effects 透传 timing/meta', Array.isArray(effects) && effects.length === 1 && effects[0].duration === 100 &&
      window.__effectMetaSeen.attention === true && window.__effectMetaSeen.grouped === true,
      JSON.stringify({ duration: effects[0] && effects[0].duration, meta: window.__effectMetaSeen }));
    handle.destroy();

    const badAdapter = makeProbeAdapter({ name: 'bad-probe', badEffects: true });
    const badHandle = badAdapter.mount(document.createElement('div'));
    const badPrepared = badHandle.prepareChange(ctx);
    const badEffects = errorOf(function () { badPrepared.effects({ timing: {} }); });
    check('effects 返回非数组定位错误', !!badEffects && /EffectSpec|数组/.test(badEffects.message), JSON.stringify(badEffects));
    badHandle.destroy();
    wrapperHost.remove();
    return out;
  });
  report(rows);
  check('sceneAdapter 运行区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  await context.close();
}

/* ---------------- 3. 减少动效：跳过 effects、commit 一次 ---------------- */
{
  const { context, page, pageErrors } = await makePage(true);
  const rows = await page.evaluate(async () => {
    const out = [];
    const check = (name, ok, detail) => out.push({ name: name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    const Adapter = window.NoteDemo.sceneAdapter;
    const adapter = Adapter.define({
      name: 'reduced-probe', sceneModes: ['update'], defaultSceneMode: 'update',
      sceneTimingDefaults: { enterDuration: 300 },
      normalizeView: function (input) { return { value: Number(input && input.value) || 0 }; },
      mount: function (host) {
        const node = document.createElement('div');
        node.className = 'adapter-box';
        host.appendChild(node);
        let current = 0;
        return {
          restore: function (model) { current = Number(model && model.value) || 0; node.textContent = String(current); },
          readModel: function () { return { value: current }; }, target: function (query) { return query && query.part === 'root' ? node : null; },
          destroy: function () { node.remove(); },
          planStep: function (input) {
            return {
              commit: function () { window.__reducedCommit = (window.__reducedCommit || 0) + 1; current = Number(input.targetModel && input.targetModel.value) || 0; node.textContent = String(current); },
              effects: function () { window.__reducedEffects = (window.__reducedEffects || 0) + 1; return []; },
              sourceElements: function () { window.__reducedSource = (window.__reducedSource || 0) + 1; return [node]; }
            };
          }
        };
      }
    });
    const host = document.createElement('div');
    document.getElementById('root').appendChild(host);
    const layout = (container) => { const wrap = document.createElement('div'); const main = document.createElement('div'); const slot = document.createElement('div'); wrap.append(main, slot); container.appendChild(wrap); return { root: wrap, slots: { main: main, m: slot } }; };
    const session = window.NoteDemo.mount(host, {
      definition: {
        bindings: { m: { adapter: 'reduced-probe', slot: 'm' } },
        frames: [
          { id: 'f0', caption: '0', views: { m: { value: 0 } }, marks: [] },
          { id: 'f1', caption: '1', views: { m: { value: 1 } }, marks: [] }
        ],
        transitions: [{ from: 'f0', to: 'f1', scene: { bindings: [{ binding: 'm', mode: 'update' }] } }]
      },
      adapters: { 'reduced-probe': adapter }, layout: layout, label: 'reduced probe'
    });
    const startedAt = performance.now();
    const result = await session.next();
    check('减少动效：commit 一次且跳过 effects', result.status === 'completed' && window.__reducedCommit === 1 &&
      !window.__reducedEffects && performance.now() - startedAt < 1500,
      JSON.stringify({ status: result.status, commit: window.__reducedCommit, effects: window.__reducedEffects || 0, elapsed: Math.round(performance.now() - startedAt) }));
    session.destroy();
    host.remove();
    return out;
  });
  report(rows);
  check('减少动效区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  await context.close();
}

await browser.close();
const failed = checks.filter((row) => !row.ok);
console.log('SUMMARY ' + (checks.length - failed.length) + '/' + checks.length + ' passed');
if (failed.length) process.exitCode = 1;
