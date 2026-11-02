#!/usr/bin/env node
/*
 * Visual handoff v3 contract checks on an ordinary DOM fixture (no SVG, no transparent proxy):
 * - PreparedChange.sourceElements() is called once between prepareChange and commit; the source
 *   element stays visibly restored while the attention observation target is pending;
 * - EffectSpec.handoff:'hold' keeps the finished end frame until the scene settles (no flash back
 *   to the committed hidden pre-state before idle);
 * - fill:'both' is applied only to the handoff spec (normal specs keep their old fill);
 * - ready waits for the handoff target visual, progress effects must not declare handoff and unknown
 *   handoff values are rejected with located errors;
 * - cancel restores the source stop visual; reduced motion lands on the final visual with no animation.
 *
 * Loads src directly through tests/lib/src-sources.mjs. Usage: node tests/checks/handoff-check.mjs
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

const PAGE_CSS = [
  'html,body{margin:0;padding:0}body{padding:16px;background:#f4f6f9;font-family:sans-serif}',
  '#root{max-width:760px;margin:0 auto}',
  '.handoff-fixture{position:relative;width:280px;height:150px;border:1px solid #ccd4e0;background:#fff}',
  '.handoff-source{position:absolute;left:16px;top:18px;padding:6px 10px;background:#dce8ff;border:1px solid #9db2d6;opacity:1}',
  '.handoff-target{position:absolute;left:16px;top:72px;padding:6px 10px;background:#d8f0d8;border:1px solid #8fbc8f;opacity:0}',
  '.handoff-accent{position:absolute;right:16px;top:18px;width:18px;height:18px;border-radius:50%;background:#e8b3c8;opacity:0.2}',
  '.handoff-fixture.is-target .handoff-source{opacity:0}',
  '.handoff-fixture.is-target .handoff-target{opacity:1}'
].join('\n');

const browser = await chromium.launch({ executablePath: edge, headless: true });
async function makePage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1000, height: 800 }, reducedMotion: options.reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push('pageerror: ' + error.message));
  page.on('console', (message) => { if (message.type() === 'error') pageErrors.push('console: ' + message.text()); });
  await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>' + PAGE_CSS + '</style></head><body><main id="root"></main></body></html>');
  for (const rel of STYLES) await page.addStyleTag({ path: src(rel) });
  for (const rel of SCRIPTS) await page.addScriptTag({ path: src(rel) });
  return { context, page, pageErrors };
}
function report(rows) { for (const row of rows) check(row.name, row.ok, row.detail); }

/* Builds the ordinary DOM adapter + definition inside the page. mode: normal | progress-handoff | unknown-handoff. */
const FIXTURE_SCRIPT = `
  window.__makeHandoffAdapter = function (mode) {
    return {
      name: 'handoff-dom',
      sceneModes: ['update'],
      defaultSceneMode: 'update',
      normalizeView(input) {
        const source = input && typeof input === 'object' ? input : {};
        return { model: { value: Number(source.value) || 0, target: source.target === true }, cues: {} };
      },
      mount(host) {
        const root = document.createElement('div');
        root.className = 'handoff-fixture';
        const sourceEl = document.createElement('div');
        sourceEl.className = 'handoff-source';
        sourceEl.textContent = '来源视觉';
        const targetEl = document.createElement('div');
        targetEl.className = 'handoff-target';
        targetEl.textContent = '目标内容';
        const accentEl = document.createElement('div');
        accentEl.className = 'handoff-accent';
        root.appendChild(sourceEl);
        root.appendChild(targetEl);
        root.appendChild(accentEl);
        host.appendChild(root);
        let model = { value: 0, target: false };
        function paint() { root.classList.toggle('is-target', !!model.target); }
        return {
          restore(view) { model = { value: Number(view.model.value) || 0, target: view.model.target === true }; paint(); },
          readView() { return { model: { value: model.value, target: model.target }, cues: {} }; },
          target(query) {
            if (!query) return null;
            if (query.part === 'root') return root;
            if (query.part === 'target') return targetEl;
            return null;
          },
          prepareChange(ctx) {
            window.__handoffLog = window.__handoffLog || [];
            window.__handoffLog.push('prepareChange');
            const targetModel = ctx && ctx.targetView && ctx.targetView.model ? ctx.targetView.model : {};
            return {
              sourceElements() {
                window.__handoffLog.push('sourceElements');
                if (mode === 'source-nonarray') return sourceEl;
                if (mode === 'source-non-element') return ['not-an-element'];
                if (mode === 'source-disconnected') return [document.createElement('div')];
                if (mode === 'source-throws') throw new Error('adapter source 探针');
                return [sourceEl];
              },
              commit() {
                window.__handoffLog.push('commit');
                model = { value: Number(targetModel.value) || 0, target: targetModel.target === true };
                paint();
              },
              effects() {
                window.__handoffLog.push('effects');
                if (mode === 'progress-handoff') {
                  return [{ type: 'progress', duration: 120, handoff: 'hold', update() {} }];
                }
                if (mode === 'unknown-handoff') {
                  return [{ el: targetEl, keyframes: [{ opacity: 0 }, { opacity: 1 }], options: { duration: 120, easing: 'linear' }, gate: 'ready', handoff: 'sometimes' }];
                }
                return [
                  { el: targetEl, keyframes: [{ opacity: 0 }, { opacity: 1 }], options: { duration: 160, easing: 'linear' }, gate: 'ready', handoff: 'hold', effect: 'handoff-target' },
                  { el: accentEl, keyframes: [{ opacity: 0.2 }, { opacity: 1 }], options: { duration: 120, easing: 'linear' }, gate: 'ready', effect: 'handoff-accent' }
                ];
              },
              cleanup() { root.classList.remove('is-preheard'); }
            };
          },
          destroy() { root.remove(); }
        };
      }
    };
  };
`;

async function openFixturePage(browser, options) {
  const { context, page, pageErrors } = await makePage(options);
  await page.addScriptTag({ content: FIXTURE_SCRIPT });
  return { context, page, pageErrors };
}

/* ---------------- 1. normal handoff: source visible during observation, hold to idle, no flash ---------------- */
{
  const { context, page, pageErrors } = await openFixturePage(browser);
  const rows = await page.evaluate(async () => {
    const out = [];
    const check = (name, ok, detail) => out.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    if (!window.__makeHandoffAdapter) { check('普通 DOM 交接 fixture 可创建', false, 'adapter 未注入'); return out; }
    // 捕获 WAAPI 创建参数以核对 handoff 的 fill 只作用于声明它的 spec。
    window.__handoffAnimations = [];
    window.__handoffFinishChecks = [];
    const nativeAnimate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const record = { classes: typeof this.className === 'string' ? this.className : '', fill: options && options.fill, at: performance.now() };
      window.__handoffAnimations.push(record);
      const animation = nativeAnimate.call(this, keyframes, options);
      if (record.classes.indexOf('handoff-target') >= 0) {
        const element = this;
        animation.finished.then(() => {
          window.__handoffFinishChecks.push({ at: performance.now() - (window.__handoffStart || 0), opacity: Number(getComputedStyle(element).opacity) });
        }, () => {});
      }
      return animation;
    };
    const host = document.createElement('div');
    document.getElementById('root').appendChild(host);
    const definition = {
      bindings: { h: { adapter: 'handoff-dom', slot: 'main' } },
      frames: [
        { id: 'h0', caption: '来源', views: { h: { value: 0, target: false } }, marks: [] },
        { id: 'h1', caption: '目标', views: { h: { value: 1, target: true } }, marks: [] }
      ],
      transitions: [{
        from: 'h0', to: 'h1',
        scene: {
          bindings: [{ binding: 'h', mode: 'update' }],
          attention: { stepDuration: 120, targets: [{ binding: 'h', query: { part: 'target' } }] }
        }
      }]
    };
    const layout = (container) => {
      const wrap = document.createElement('div');
      const main = document.createElement('div');
      wrap.appendChild(main);
      container.appendChild(wrap);
      return { root: wrap, slots: { main: main } };
    };
    const session = NoteDemo.mount(host, { definition: definition, adapters: { 'handoff-dom': window.__makeHandoffAdapter('normal') }, layout: layout, label: 'handoff' });
    const sourceEl = host.querySelector('.handoff-source');
    const targetEl = host.querySelector('.handoff-target');
    const accentEl = host.querySelector('.handoff-accent');
    const opacity = (el) => Number(getComputedStyle(el).opacity);
    const samples = [];
    let sampling = true;
    const startedAt = performance.now();
    window.__handoffStart = startedAt;
    const runPromise = session.next();
    const sample = () => {
      if (!sampling) return;
      const state = session.getState();
      samples.push({
        at: performance.now() - startedAt,
        phase: state.phase,
        sourceOpacity: opacity(sourceEl),
        targetOpacity: opacity(targetEl),
        targetAnimations: targetEl.getAnimations().map((animation) => animation.playState),
        focusShown: document.querySelectorAll('.nx-focus[data-nx-state="shown"]').length
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    const result = await runPromise;
    await new Promise((resolve) => setTimeout(resolve, 120));
    sampling = false;
    const idleSample = samples[samples.length - 1];
    // sourceElements 调用时机与次数。
    const log = window.__handoffLog || [];
    const prepareIndex = log.indexOf('prepareChange');
    const sourceIndex = log.indexOf('sourceElements');
    const commitIndex = log.indexOf('commit');
    const effectsIndex = log.indexOf('effects');
    check('sourceElements 在 prepareChange 之后、commit 之前调用一次', prepareIndex >= 0 && sourceIndex === prepareIndex + 1 &&
      commitIndex > sourceIndex && effectsIndex > commitIndex &&
      log.filter((item) => item === 'sourceElements').length === 1, JSON.stringify(log));
    // 观察期间来源对象仍可见（焦点正在观察真实目标）。
    const observing = samples.find((sampleItem) => sampleItem.phase === 'running' && sampleItem.focusShown > 0 && sampleItem.sourceOpacity > 0.9 && sampleItem.targetOpacity < 0.2);
    check('观察目标期间来源对象保持可见', !!observing, JSON.stringify(samples.slice(0, 10)));
    // 无透明代理：普通 DOM 夹具只有真实来源/目标节点。
    check('交接 fixture 使用真实 DOM 对象', !!sourceEl && !!targetEl && sourceEl !== targetEl && host.querySelectorAll('.handoff-proxy').length === 0);
    // handoff 的 fill 只作用于声明它的 spec。
    const targetAnimation = window.__handoffAnimations.find((record) => record.classes.indexOf('handoff-target') >= 0);
    const accentAnimation = window.__handoffAnimations.find((record) => record.classes.indexOf('handoff-accent') >= 0);
    check('handoff 动画 fill=both（普通 effect 仍非 both）', !!targetAnimation && targetAnimation.fill === 'both' &&
      !!accentAnimation && accentAnimation.fill !== 'both',
      JSON.stringify(window.__handoffAnimations));
    // 目标首次接住画面之后不得回落到 commit 预置的隐藏状态；handoff 末帧保持到 scene 收束。
    const firstTargetVisible = samples.findIndex((sampleItem) => sampleItem.targetOpacity > 0.9);
    const dropsAfterVisible = firstTargetVisible < 0 ? [] : samples.slice(firstTargetVisible).filter((sampleItem) => sampleItem.targetOpacity < 0.85);
    const finishChecks = window.__handoffFinishChecks || [];
    const firstIdle = samples.find((sampleItem) => sampleItem.phase === 'idle');
    const lastFinishAt = finishChecks.length ? Math.max.apply(null, finishChecks.map((item) => item.at)) : -1;
    // 目标首次接住画面之后，不允许再出现来源/目标同时不可见的中间帧（首帧淡入前不算闪回）。
    const flashBack = firstTargetVisible < 0 ? [] : samples.slice(firstTargetVisible).filter((sampleItem) =>
      sampleItem.targetOpacity < 0.5 && sampleItem.sourceOpacity < 0.5);
    check('动画结束到 idle 前目标保持可见（无闪回）', finishChecks.length >= 1 &&
      finishChecks.every((item) => item.opacity >= 0.9) && dropsAfterVisible.length === 0 &&
      (!firstIdle || lastFinishAt < 0 || firstIdle.at >= lastFinishAt - 16),
      JSON.stringify({ finishChecks, firstIdle, dropsAfterVisible, samples: samples.slice(-8) }));
    check('交接过程无来源/目标同时不可见的中间帧', flashBack.length === 0, JSON.stringify(flashBack));
    // 最终停点：目标可见、来源退出、临时内联覆盖恢复。
    check('正常完成：目标视觉保持且无运行中动画', result.status === 'completed' && idleSample &&
      idleSample.targetOpacity >= 0.95 && idleSample.sourceOpacity < 0.2 && idleSample.targetAnimations.every((state) => state !== 'running'),
      JSON.stringify({ result: result.status, idleSample }));
    check('来源对象的内联覆盖在完成后恢复', (sourceEl.getAttribute('style') || '').indexOf('opacity') < 0 || sourceEl.style.opacity === '',
      JSON.stringify({ style: sourceEl.getAttribute('style') }));
    session.destroy();
    return out;
  });
  report(rows);
  check('普通交接区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  await context.close();
}

/* ---------------- 2. cancel restores source stop ---------------- */
{
  const { context, page, pageErrors } = await openFixturePage(browser);
  const rows = await page.evaluate(async () => {
    const out = [];
    const check = (name, ok, detail) => out.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const host = document.createElement('div');
    document.getElementById('root').appendChild(host);
    const definition = {
      bindings: { h: { adapter: 'handoff-dom', slot: 'main' } },
      frames: [
        { id: 'h0', caption: '来源', views: { h: { value: 0, target: false } }, marks: [] },
        { id: 'h1', caption: '目标', views: { h: { value: 1, target: true } }, marks: [] }
      ],
      transitions: [{ from: 'h0', to: 'h1', scene: { bindings: [{ binding: 'h', mode: 'update' }], attention: { stepDuration: 300, targets: [{ binding: 'h', query: { part: 'target' } }] } } }]
    };
    const layout = (container) => { const wrap = document.createElement('div'); const main = document.createElement('div'); wrap.appendChild(main); container.appendChild(wrap); return { root: wrap, slots: { main: main } }; };
    const session = NoteDemo.mount(host, { definition: definition, adapters: { 'handoff-dom': window.__makeHandoffAdapter('normal') }, layout: layout, label: 'handoff-cancel' });
    const sourceEl = host.querySelector('.handoff-source');
    const targetEl = host.querySelector('.handoff-target');
    const opacity = (el) => Number(getComputedStyle(el).opacity);
    const running = session.next();
    const deadline = performance.now() + 5000;
    while (performance.now() < deadline) {
      if (session.getState().phase === 'running' && opacity(sourceEl) > 0.9) break;
      await sleep(20);
    }
    const observedSourceOpacity = opacity(sourceEl);
    const prevResult = await session.prev();
    const runningResult = await running;
    await sleep(220);
    const sourceAfter = opacity(sourceEl);
    const targetAfter = opacity(targetEl);
    const animationsRunning = targetEl.getAnimations().filter((animation) => animation.playState === 'running').length + sourceEl.getAnimations().filter((animation) => animation.playState === 'running').length;
    check('取消运行：旧 Promise cancelled 且恢复来源停点', runningResult.status === 'cancelled' && prevResult.status === 'completed' &&
      session.getState().phase === 'idle' && session.getState().settledFrameId === 'h0',
      JSON.stringify({ running: runningResult.status, prev: prevResult.status, state: session.getState() }));
    check('取消后来源对象可见、目标隐藏、无运行中动画', observedSourceOpacity > 0.9 && sourceAfter > 0.9 && targetAfter < 0.2 && animationsRunning === 0,
      JSON.stringify({ observedSourceOpacity, sourceAfter, targetAfter, animationsRunning }));
    check('取消后来源内联覆盖恢复', (sourceEl.getAttribute('style') || '').indexOf('opacity') < 0 || sourceEl.style.opacity === '',
      JSON.stringify({ style: sourceEl.getAttribute('style') }));
    session.destroy();
    return out;
  });
  report(rows);
  check('取消区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  await context.close();
}

/* ---------------- 3. progress handoff / unknown handoff 定位错误 ---------------- */
{
  const { context, page, pageErrors } = await openFixturePage(browser);
  const rows = await page.evaluate(async () => {
    const out = [];
    const check = (name, ok, detail) => out.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    const layout = (container) => { const wrap = document.createElement('div'); const main = document.createElement('div'); wrap.appendChild(main); container.appendChild(wrap); return { root: wrap, slots: { main: main } }; };
    function definitionFor() {
      return {
        bindings: { h: { adapter: 'handoff-dom', slot: 'main' } },
        frames: [
          { id: 'h0', caption: '来源', views: { h: { value: 0, target: false } }, marks: [] },
          { id: 'h1', caption: '目标', views: { h: { value: 1, target: true } }, marks: [] }
        ],
        transitions: [{ from: 'h0', to: 'h1', scene: { bindings: [{ binding: 'h', mode: 'update' }] } }]
      };
    }
    async function runCase(label, mode, required) {
      window.__handoffLog = [];
      const host = document.createElement('div');
      document.getElementById('root').appendChild(host);
      let error = null;
      let session = null;
      try {
        session = NoteDemo.mount(host, { definition: definitionFor(), adapters: { 'handoff-dom': window.__makeHandoffAdapter(mode) }, layout: layout, label: label });
        const result = await session.next();
        if (result.status !== 'completed') error = result.error || result;
      } catch (caught) { error = caught; }
      const message = error ? String(error.message || error) : '';
      const missing = required.filter((token) => message.indexOf(token) < 0);
      check(label, !!message && missing.length === 0, JSON.stringify({ missing: missing, message: message.slice(0, 320) }));
      if (session && typeof session.destroy === 'function') session.destroy();
      host.remove();
    }
    await runCase('progress effect 声明 handoff 被定位拒绝', 'progress-handoff', ['handoff', 'progress', 'update(1)']);
    await runCase('未知 handoff 取值被定位拒绝', 'unknown-handoff', ['handoff', 'hold']);
    await runCase('sourceElements 非数组被定位拒绝', 'source-nonarray', ['sourceElements()', 'Element[]']);
    await runCase('sourceElements 含非 Element 被定位拒绝', 'source-non-element', ['sourceElements()', 'Element']);
    await runCase('sourceElements 返回断开元素被定位拒绝', 'source-disconnected', ['sourceElements()', '断开']);
    await runCase('sourceElements 抛错被定位拒绝', 'source-throws', ['sourceElements()']);
    return out;
  });
  report(rows);
  check('handoff 拒绝区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  await context.close();
}

/* ---------------- 4. reduced motion lands on the final visual ---------------- */
{
  const { context, page, pageErrors } = await openFixturePage(browser, { reduced: true });
  const rows = await page.evaluate(async () => {
    const out = [];
    const check = (name, ok, detail) => out.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const host = document.createElement('div');
    document.getElementById('root').appendChild(host);
    const definition = {
      bindings: { h: { adapter: 'handoff-dom', slot: 'main' } },
      frames: [
        { id: 'h0', caption: '来源', views: { h: { value: 0, target: false } }, marks: [] },
        { id: 'h1', caption: '目标', views: { h: { value: 1, target: true } }, marks: [] }
      ],
      transitions: [{ from: 'h0', to: 'h1', scene: { bindings: [{ binding: 'h', mode: 'update' }], attention: { stepDuration: 300, targets: [{ binding: 'h', query: { part: 'target' } }] } } }]
    };
    const layout = (container) => { const wrap = document.createElement('div'); const main = document.createElement('div'); wrap.appendChild(main); container.appendChild(wrap); return { root: wrap, slots: { main: main } }; };
    const startedAt = performance.now();
    const session = NoteDemo.mount(host, { definition: definition, adapters: { 'handoff-dom': window.__makeHandoffAdapter('normal') }, layout: layout, label: 'handoff-reduced' });
    const result = await session.next();
    await sleep(150);
    const sourceEl = host.querySelector('.handoff-source');
    const targetEl = host.querySelector('.handoff-target');
    const opacity = (el) => Number(getComputedStyle(el).opacity);
    const animations = sourceEl.getAnimations().concat(targetEl.getAnimations());
    check('减少动效：直接落到目标终态', result.status === 'completed' && performance.now() - startedAt < 1500 &&
      opacity(targetEl) > 0.95 && opacity(sourceEl) < 0.2,
      JSON.stringify({ status: result.status, elapsed: Math.round(performance.now() - startedAt), source: opacity(sourceEl), target: opacity(targetEl) }));
    check('减少动效：无运行中动画、不建会话焦点', animations.filter((animation) => animation.playState === 'running').length === 0 &&
      document.querySelectorAll('.nx-focus[data-nx-state="shown"]').length === 0,
      JSON.stringify({ animations: animations.map((animation) => animation.playState), focus: document.querySelectorAll('.nx-focus[data-nx-state="shown"]').length }));
    check('减少动效：不调用 sourceElements 交接', !(window.__handoffLog || []).includes('sourceElements'),
      JSON.stringify(window.__handoffLog));
    session.destroy();
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
