#!/usr/bin/env node
/*
 * Lightweight authoring-page smoke for the ordinary DOM handoff example (T4 example, consumes the
 * public handoff v3 contract: PreparedChange.sourceElements + EffectSpec.handoff:'hold').
 * Loads examples/authoring/index.html as the author sees it (needs a rebuilt dist/).
 *
 * Usage: node tests/checks/authoring-page-smoke.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const pageUrl = pathToFileURL(path.join(root, 'examples/authoring/index.html')).href;

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail) });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : ' :: ' + String(detail).slice(0, 500)));
}

const browser = await chromium.launch({ executablePath: edge, headless: true });
async function openPage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, reducedMotion: options.reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  const pageErrors = [];
  const external = [];
  page.on('pageerror', (error) => pageErrors.push('pageerror: ' + error.message));
  page.on('console', (message) => { if (message.type() === 'error') pageErrors.push('console: ' + message.text()); });
  page.on('request', (request) => { if (/^https?:/i.test(request.url())) external.push(request.url()); });
  await page.goto(pageUrl, { waitUntil: 'load' });
  await page.waitForFunction(() => Array.isArray(window.AuthoringSessions) && window.AuthoringSessions.length >= 4, null, { timeout: 15000 }).catch(() => {});
  return { context, page, pageErrors, external };
}

/* ---------------- normal page: initial / observation / settled / reset-cancel ---------------- */
{
  const { context, page, pageErrors, external } = await openPage();
  const state = await page.evaluate(() => {
    const host = document.querySelector('[data-author-demo="handoff"]');
    const stage = host ? host.querySelector('.handoff-demo__stage') : null;
    const source = host ? host.querySelector('[data-adapter-part="source"]') : null;
    const target = host ? host.querySelector('[data-adapter-part="target"]') : null;
    const session = window.AuthoringSessions[2];
    return {
      sessions: Array.isArray(window.AuthoringSessions) ? window.AuthoringSessions.length : -1,
      phases: typeof window.AuthoringPhases === 'function' ? window.AuthoringPhases().length : -1,
      hasHandoff: !!(window.AuthoringHandoff && window.AuthoringHandoff.adapterName === 'handoff-dom'),
      hasHost: !!host,
      stage: stage ? stage.getAttribute('data-stage') : null,
      sourceOpacity: source ? Number(getComputedStyle(source).opacity) : -1,
      targetOpacity: target ? Number(getComputedStyle(target).opacity) : -1,
      phaseText: (host ? host.querySelector('[data-author-phase="handoff"]') : null) || null,
      phaseLabel: host && host.querySelector('[data-author-phase="handoff"]') ? host.querySelector('[data-author-phase="handoff"]').textContent.trim() : '',
      sessionPhase: session ? session.getState().phase : '',
      sessionFrame: session ? session.getState().settledFrameId : ''
    };
  });
  check('作者装配页：第三例与四会话就绪', state.sessions === 4 && state.phases === 4 && state.hasHandoff && state.hasHost, JSON.stringify(state));
  check('作者装配页：默认 DOM 交接例可见状态', state.stage === 'source' && state.sourceOpacity > 0.9 && state.targetOpacity < 0.1 &&
    state.sessionPhase === 'idle', JSON.stringify(state));
  check('作者装配页：无外部网络请求', external.length === 0, JSON.stringify(external.slice(0, 5)));

  // 点击该例“下一步”并逐帧采样：观察期来源可见，内容放行后目标接住，结束后不回退。
  const samples = await page.evaluate(async () => {
    const host = document.querySelector('[data-author-demo="handoff"]');
    const session = window.AuthoringSessions[2];
    const source = host.querySelector('[data-adapter-part="source"]');
    const target = host.querySelector('[data-adapter-part="target"]');
    const stageEl = host.querySelector('.handoff-demo__stage');
    const opacity = (el) => (el ? Number(getComputedStyle(el).opacity) : -1);
    const list = [];
    let sampling = true;
    const tick = () => {
      if (!sampling) return;
      list.push({
        phase: session.getState().phase,
        stage: stageEl.getAttribute('data-stage'),
        source: opacity(source),
        target: opacity(target),
        focusShown: document.querySelectorAll('.nx-focus[data-nx-state="shown"]').length,
        targetAnimations: target.getAnimations().map((animation) => animation.playState)
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const button = Array.from(host.querySelectorAll('.nblk-demo-stage__controls button')).find((node) => node.textContent.trim() === '下一步');
    button.click();
    const run = session.getState().phase === 'idle' ? null : null;
    const deadline = performance.now() + 15000;
    while (performance.now() < deadline && session.getState().phase !== 'idle') await new Promise((resolve) => setTimeout(resolve, 16));
    sampling = false;
    return { list: list, result: { phase: session.getState().phase, frame: session.getState().settledFrameId } };
  });
  const observation = samples.list.find((sample) => sample.phase === 'running' && sample.focusShown > 0 && sample.source > 0.9 && sample.target < 0.2);
  check('作者装配页：观察期来源标签保持可见', !!observation, JSON.stringify(samples.list.slice(0, 8)));
  const settledState = await page.evaluate(() => {
    const host = document.querySelector('[data-author-demo="handoff"]');
    const stage = host.querySelector('.handoff-demo__stage');
    const source = host.querySelector('[data-adapter-part="source"]');
    const target = host.querySelector('[data-adapter-part="target"]');
    const phase = host.querySelector('[data-author-phase="handoff"]');
    return {
      stage: stage.getAttribute('data-stage'),
      source: Number(getComputedStyle(source).opacity),
      target: Number(getComputedStyle(target).opacity),
      targetStyle: target.getAttribute('style') || '',
      sourceStyle: source.getAttribute('style') || '',
      phase: phase ? phase.textContent.trim() : '',
      focusEmphasis: (document.querySelector('.nx-focus[data-nx-state="shown"]') || {}).getAttribute ? (document.querySelector('.nx-focus[data-nx-state="shown"]') || {}).getAttribute('data-nx-emphasis') : ''
    };
  });
  check('作者装配页：完成后目标接住且来源退出', settledState.stage === 'handoff' && settledState.target > 0.9 && settledState.source < 0.2,
    JSON.stringify(settledState));
  check('作者装配页：完成后无残留内联动画样式', settledState.targetStyle.indexOf('opacity') < 0 && settledState.targetStyle.indexOf('transform') < 0,
    JSON.stringify(settledState));
  const finishedHold = samples.list.filter((sample) => sample.phase === 'running' && sample.targetAnimations.indexOf('finished') >= 0);
  const targetSamples = samples.list.filter((sample) => sample.phase === 'running' && sample.target > 0.5);
  check('作者装配页：动画结束到 idle 前目标不回落', finishedHold.length >= 1 && targetSamples.every((sample) => sample.target >= 0.5),
    JSON.stringify({ finishedHold, tail: samples.list.slice(-6) }));

  // 重来后运行中取消：回到 source 停点。
  const cancel = await page.evaluate(async () => {
    const host = document.querySelector('[data-author-demo="handoff"]');
    const session = window.AuthoringSessions[2];
    const findButton = (label) => Array.from(host.querySelectorAll('.nblk-demo-stage__controls button')).find((node) => node.textContent.trim() === label);
    findButton('重来').click();
    const deadline = performance.now() + 8000;
    while (performance.now() < deadline && session.getState().phase !== 'idle') await new Promise((resolve) => setTimeout(resolve, 16));
    const button = findButton('下一步');
    const before = session.getState().settledFrameId;
    button.click();
    let started = performance.now() + 8000;
    while (performance.now() < started && session.getState().phase !== 'running') await new Promise((resolve) => setTimeout(resolve, 16));
    await new Promise((resolve) => setTimeout(resolve, 60));
    findButton('上一步').click();
    const deadline2 = performance.now() + 12000;
    while (performance.now() < deadline2 && session.getState().phase !== 'idle') await new Promise((resolve) => setTimeout(resolve, 16));
    const stage = host.querySelector('.handoff-demo__stage');
    const source = host.querySelector('[data-adapter-part="source"]');
    const target = host.querySelector('[data-adapter-part="target"]');
    return {
      phase: session.getState().phase,
      frame: session.getState().settledFrameId,
      stage: stage.getAttribute('data-stage'),
      source: Number(getComputedStyle(source).opacity),
      target: Number(getComputedStyle(target).opacity),
      running: source.getAnimations().concat(target.getAnimations()).filter((animation) => animation.playState === 'running').length
    };
  });
  check('作者装配页：运行中取消回到 source 停点', cancel.phase === 'idle' && cancel.frame === 'source' && cancel.stage === 'source' &&
    cancel.source > 0.9 && cancel.target < 0.2 && cancel.running === 0, JSON.stringify(cancel));
  check('作者装配页无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  await context.close();
}

/* ---------------- 作者矩阵/读数例：意图读取（attention targets）+ 连续 next 节奏 ---------------- */
{
  const { context, page, pageErrors } = await openPage();
  const rows = await page.evaluate(async () => {
    const out = [];
    const check = (name, ok, detail) => out.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    if (typeof window.AuthoringDemos !== 'function' && typeof window.AuthoringDemos !== 'object') {
      check('作者数据可读取', false, '缺少 window.AuthoringDemos');
      return out;
    }
    const matrixSpec = window.AuthoringDemos.matrix();
    const sequenceSpec = window.AuthoringDemos.sequence();
    const stepsOf = (spec) => (spec.steps || []).map((step) => ({
      id: step.id,
      attention: step.scene && step.scene.attention ? step.scene.attention : null,
      targets: step.scene && step.scene.attention && Array.isArray(step.scene.attention.targets) ? step.scene.attention.targets : []
    }));
    const matrixSteps = stepsOf(matrixSpec);
    const sequenceSteps = stepsOf(sequenceSpec);
    const explicitHolds = [];
    for (const spec of [matrixSpec, sequenceSpec]) {
      for (const step of stepsOf(spec)) {
        for (const target of step.targets) {
          if (typeof target.holdDuration === 'number') explicitHolds.push({ step: step.id, binding: target.binding, holdDuration: target.holdDuration });
        }
      }
    }
    check('矩阵/读数例不再含 900ms 显式停留', explicitHolds.every((item) => item.holdDuration < 900), JSON.stringify(explicitHolds));
    const publicDefault = window.NoteDemoInternals && window.NoteDemoInternals.definition && window.NoteDemoInternals.definition.attentionMotionDefaults
      ? window.NoteDemoInternals.definition.attentionMotionDefaults.stepDuration : null;
    const matrixPairSteps = matrixSteps.slice(0, 3);
    const matrixPairStepsDurations = matrixPairSteps.map((step) => step.attention ? step.attention.stepDuration : null);
    const readStepsDurations = sequenceSteps.slice(0, 3).map((step) => step.attention ? step.attention.stepDuration : null);
    check('矩阵例：三对来源观察使用同一节奏且不拖长', matrixPairStepsDurations.every((value) => value === matrixPairStepsDurations[0]) &&
      matrixPairStepsDurations[0] != null && (publicDefault === null || matrixPairStepsDurations[0] <= publicDefault),
      JSON.stringify({ matrixPairStepsDurations: matrixPairStepsDurations, publicDefault: publicDefault }));
    check('读数例：三步读数使用同一节奏且不拖长', readStepsDurations.every((value) => value === readStepsDurations[0]) &&
      readStepsDurations[0] != null && (publicDefault === null || readStepsDurations[0] <= publicDefault),
      JSON.stringify({ readStepsDurations: readStepsDurations, publicDefault: publicDefault }));
    const firstProductTarget = matrixSteps[0].targets.find((target) => target.binding === 'terms');
    check('矩阵例：第一对乘积到达后不再额外停留', !!firstProductTarget && firstProductTarget.holdDuration === 0,
      JSON.stringify(firstProductTarget));
    // 矩阵：每对步只观察本对 A/B 单元，不重复扫描已停稳的证据；最后一对不再倒计时。
    const observationOf = (step) => step.targets.filter((target) => Array.isArray(target.groups) && target.groups.length === 0);
    const pairSteps = matrixSteps.slice(0, 3);
    const pairObservationsOk = pairSteps.every((step) => {
      const observations = observationOf(step);
      return observations.length === 2 && observations.every((target) => target.binding === 'matrixA' || target.binding === 'matrixB') &&
        step.targets.some((target) => target.binding === 'terms' && !Array.isArray(target.groups));
    });
    const observedCells = pairSteps.map((step) => JSON.stringify(observationOf(step).map((target) => [target.binding, target.query && target.query.row, target.query && target.query.col]).sort()));
    const noRepeatedCells = new Set(observedCells).size === observedCells.length;
    check('矩阵例：每对只观察本对 A/B 单元且不重复扫描', pairObservationsOk && noRepeatedCells, JSON.stringify({ observedCells }));
    const matrixLast = matrixSteps[matrixSteps.length - 1];
    const lastNoCountdown = !!matrixLast && !!matrixLast.attention && !('stepDuration' in matrixLast.attention) &&
      matrixLast.targets.every((target) => !('holdDuration' in target) && !Array.isArray(target.groups));
    check('矩阵例：末步看累计和与结果且不设倒计时', lastNoCountdown, JSON.stringify(matrixLast));
    // 读数：先看当前格，再看右侧读数；末步汇总不设倒计时。
    const sequenceLast = sequenceSteps[sequenceSteps.length - 1];
    const readStepsOk = sequenceSteps.slice(0, 3).every((step) => step.targets.length === 2 &&
      step.targets[0].binding === 'seq' && step.targets[1].binding === 'readout');
    check('读数例：每步先看当前格再看当前读数', readStepsOk, JSON.stringify(sequenceSteps.map((step) => step.targets.map((target) => target.binding))));
    check('读数例：末步汇总不设倒计时', !!sequenceLast && !!sequenceLast.attention && !('stepDuration' in sequenceLast.attention) &&
      sequenceLast.targets.every((target) => !('holdDuration' in target)), JSON.stringify(sequenceLast));
    // 连续 next：按运行状态计时，所有步完成；同一节奏的步长不应出现某一步额外多出的停留。
    function subscribeTiming(session) {
      const times = [];
      let startedAt = 0;
      const unsubscribe = session.subscribe((state) => {
        if (state.phase === 'running' && !startedAt) startedAt = performance.now();
        if (state.phase === 'idle' && startedAt) { times.push(performance.now() - startedAt); startedAt = 0; }
      });
      return { times: times, unsubscribe: unsubscribe };
    }
    const focusBox = () => {
      const box = document.querySelector('.nx-focus__box');
      if (!box) return null;
      const rect = box.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };
    function distance(a, b) { return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : -1; }
    const matrixSession = window.AuthoringSessions[0];
    const matrixHost = document.querySelector('[data-author-demo="matrix"]');
    const matrixTiming = subscribeTiming(matrixSession);
    const pairDurations = [];
    const handoffSamples = [];
    let carryOk = true;
    for (let index = 0; index < 4; index += 1) {
      const startedAt = performance.now();
      const previousBox = focusBox();
      const samples = [];
      let sampling = true;
      const tick = () => {
        if (!sampling) return;
        const box = focusBox();
        if (box) samples.push(box);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      const result = await matrixSession.next();
      await sleep(90);
      sampling = false;
      const elapsed = performance.now() - startedAt;
      if (index < 3) pairDurations.push(elapsed);
      const state = matrixSession.getState();
      check('矩阵例：第 ' + (index + 1) + ' 步完成并停稳', result.status === 'completed' && state.phase === 'idle' && !!state.settledFrameId,
        JSON.stringify({ result: result.status, state: state.phase }));
      const text = matrixHost.textContent || '';
      if (index < 3) {
        const expected = ['4', '1', '12'][index];
        check('矩阵例：第 ' + (index + 1) + ' 对乘积出现在画面', text.indexOf(expected) >= 0, JSON.stringify({ expected: expected }));
      } else {
        check('矩阵例：末步累计和与结果出现', text.indexOf('17') >= 0, JSON.stringify({ tail: text.slice(-120) }));
      }
      if (index > 0 && samples.length) {
        const first = samples[0];
        const maxMovement = samples.reduce((max, sample) => Math.max(max, distance(previousBox, sample)), 0);
        const firstDistance = distance(previousBox, first);
        const carry = firstDistance <= Math.max(8, maxMovement * 0.4);
        if (!carry) carryOk = false;
        handoffSamples.push({ index: index, firstDistance: Math.round(firstDistance), maxMovement: Math.round(maxMovement), carry: carry });
      }
    }
    matrixTiming.unsubscribe();
    const pairRatio = pairDurations.length === 3 ? Math.max.apply(null, pairDurations) / Math.min.apply(null, pairDurations) : -1;
    check('矩阵例：连续 next 每步无额外 900ms 停留（同类步长接近）', pairRatio > 0 && pairRatio <= 1.8,
      JSON.stringify({ pairDurations: pairDurations.map((value) => Math.round(value)), ratio: Math.round(pairRatio * 100) / 100 }));
    check('矩阵例：下一步从上一乘积弱化位置承接', carryOk, JSON.stringify(handoffSamples));
    const matrixFocus = document.querySelector('.nx-focus[data-nx-state="shown"]');
    check('矩阵例：末步停稳后弱化保留', !!matrixFocus && matrixFocus.getAttribute('data-nx-emphasis') === 'weak',
      JSON.stringify({ shown: !!matrixFocus, emphasis: matrixFocus && matrixFocus.getAttribute('data-nx-emphasis') }));
    const sequenceSession = window.AuthoringSessions[1];
    const sequenceHost = document.querySelector('[data-author-demo="sequence"]');
    const sequenceTiming = subscribeTiming(sequenceSession);
    const sequenceDurations = [];
    for (let index = 0; index < 4; index += 1) {
      const result = await sequenceSession.next();
      sequenceDurations.push({ status: result.status });
    }
    sequenceTiming.unsubscribe();
    const sequenceText = sequenceHost.textContent || '';
    check('读数例：连续 next 全部完成并汇总', sequenceDurations.every((item) => item.status === 'completed') &&
      sequenceSession.getState().phase === 'idle' && sequenceText.indexOf('17') >= 0,
      JSON.stringify({ results: sequenceDurations, state: sequenceSession.getState().phase }));
    const readoutRatio = sequenceTiming.times.length === 4 ? Math.max.apply(null, sequenceTiming.times) / Math.min.apply(null, sequenceTiming.times) : -1;
    check('读数例：连续 next 每步无额外 900ms 停留（同类步长接近）', readoutRatio > 0 && readoutRatio <= 1.8,
      JSON.stringify({ times: sequenceTiming.times.map((value) => Math.round(value)), ratio: Math.round(readoutRatio * 100) / 100 }));
    return out;
  });
  for (const row of rows) check(row.name, row.ok, row.detail);
  check('作者矩阵/读数意图区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  await context.close();
}

/* ---------------- reduced motion: final visual without animation ---------------- */
{
  const { context, page, pageErrors } = await openPage({ reduced: true });
  const reduced = await page.evaluate(async () => {
    const host = document.querySelector('[data-author-demo="handoff"]');
    const session = window.AuthoringSessions[2];
    const before = performance.now();
    const button = Array.from(host.querySelectorAll('.nblk-demo-stage__controls button')).find((node) => node.textContent.trim() === '下一步');
    button.click();
    const deadline = performance.now() + 8000;
    while (performance.now() < deadline && session.getState().phase !== 'idle') await new Promise((resolve) => setTimeout(resolve, 16));
    await new Promise((resolve) => setTimeout(resolve, 120));
    const stage = host.querySelector('.handoff-demo__stage');
    const source = host.querySelector('[data-adapter-part="source"]');
    const target = host.querySelector('[data-adapter-part="target"]');
    return {
      elapsed: performance.now() - before,
      stage: stage.getAttribute('data-stage'),
      source: Number(getComputedStyle(source).opacity),
      target: Number(getComputedStyle(target).opacity),
      running: source.getAnimations().concat(target.getAnimations()).filter((animation) => animation.playState === 'running').length,
      focus: document.querySelectorAll('.nx-focus[data-nx-state="shown"]').length
    };
  });
  check('作者装配页 reduced：直接落 handoff 终态', reduced.elapsed < 1500 && reduced.stage === 'handoff' &&
    reduced.source < 0.2 && reduced.target > 0.9 && reduced.running === 0, JSON.stringify(reduced));
  check('作者装配页 reduced：无焦点迁移残留', reduced.focus === 0, JSON.stringify(reduced));
  check('作者装配页 reduced 区无页面错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  await context.close();
}


/* ---------------- public stage reservation: layout change releases history, host floor survives ---------------- */
{
  const { context, page, pageErrors } = await openPage();
  const result = await page.evaluate(async () => {
    const host = document.createElement('div');
    host.style.width = '800px';
    host.style.maxWidth = '100%';
    document.body.appendChild(host);
    function layout(container) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;width:100%;box-sizing:border-box;';
      for (let i = 0; i < 8; i += 1) {
        const card = document.createElement('div');
        card.style.cssText = 'flex:0 0 160px;width:160px;height:100px;box-sizing:border-box;background:#e8eef9;border:1px solid #c9d4e6;';
        wrap.appendChild(card);
      }
      const slot = document.createElement('div');
      slot.setAttribute('data-demo-slot', 'main');
      wrap.appendChild(slot);
      container.appendChild(wrap);
      return { root: wrap, slots: { main: slot } };
    }
    const definition = {
      initialFrameId: 'a',
      bindings: { main: { adapter: 'dom', slot: 'main' } },
      frames: [{ id: 'a', caption: '一个初始停点', views: { main: { text: 'A' } }, marks: [] }],
      transitions: []
    };
    const session = NoteDemo.mount(host, { definition, layout, minStageHeight: 300 });
    const stage = host.querySelector('.nblk-demo-stage__stage');
    const height = () => Math.round(stage.getBoundingClientRect().height);
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await wait(350);
    const wideInitial = height();
    const cycles = [];
    for (let i = 0; i < 3; i += 1) {
      host.style.width = '400px'; await wait(500); const narrow = height();
      host.style.width = '800px'; await wait(500); const wide = height();
      cycles.push({ narrow, wide });
    }
    const state = session.getState();
    session.destroy();
    host.remove();
    return { wideInitial, cycles, phase: state.phase };
  });
  const wideHeights = result.cycles.map((cycle) => cycle.wide);
  const narrowHeights = result.cycles.map((cycle) => cycle.narrow);
  check('公共舞台高度预留：宽屏→窄屏→宽屏可释放历史高度且保留宿主下限',
    result.wideInitial >= 300 && Math.min(...narrowHeights) > result.wideInitial + 40 &&
      wideHeights.every((value) => Math.abs(value - result.wideInitial) <= 2) && result.phase === 'idle',
    JSON.stringify(result));
  check('公共舞台高度预留：重复调整尺寸稳定且无页面错误',
    result.cycles.length === 3 && new Set(wideHeights).size === 1 && new Set(narrowHeights).size === 1 && pageErrors.length === 0,
    JSON.stringify({ wideHeights, narrowHeights, errors: pageErrors.slice(0, 3) }));
  await context.close();
}

await browser.close();
const failed = checks.filter((row) => !row.ok);
console.log('SUMMARY ' + (checks.length - failed.length) + '/' + checks.length + ' passed');
if (failed.length) process.exitCode = 1;
