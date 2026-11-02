#!/usr/bin/env node
/*
 * Custom graphic example checks (T6 examples/propagation):
 * - page loads as an author entry (single library bundle + local graph/adapter/demo scripts);
 * - attention observation ranges + same-Binding group handoff (send / lead / event / return);
 * - source visual kept before release, progress continuity, history layers never overwritten;
 * - cancel / replay / reset do not stack layers; reduced motion jumps to the final visual;
 * - single-file preview build inlines the example (output under tests/.cache, never dist/).
 *
 * Requires a rebuilt dist/ (public contract merged). Usage: node tests/checks/propagation-example-check.mjs
 */
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const exampleUrl = pathToFileURL(path.join(root, 'examples/propagation/index.html')).href;
const cacheDir = path.join(root, 'tests/.cache');
const previewPath = path.join(cacheDir, '传播过程与局部过渡-预览-检查.html');
const previewUrl = pathToFileURL(previewPath).href;

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail) });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : ' :: ' + String(detail).slice(0, 400)));
}

if (!fs.existsSync(path.join(root, 'dist/note-library.js'))) {
  console.log('SKIP 传播示例检查：dist 尚未构建');
  process.exit(0);
}

/* ---------------- 1. 单文件预览构建（输出到 tests/.cache，绝不动 dist/） ---------------- */
{
  fs.mkdirSync(cacheDir, { recursive: true });
  const build = spawnSync(process.execPath, ['scripts/build-demo-preview.mjs', '--template', 'examples/propagation/index.html', '--output', previewPath], { cwd: root, encoding: 'utf8' });
  check('传播示例可生成自包含预览', build.status === 0 && fs.existsSync(previewPath),
    (build.stderr || build.stdout || '').slice(0, 500));
  if (fs.existsSync(previewPath)) {
    const html = fs.readFileSync(previewPath, 'utf8');
    const localRefs = (html.match(/(?:src|href)="(?!#|data:|https?:)[^"]+"/g) || []).filter((item) => item.indexOf('"../') >= 0 || item.indexOf('"./') >= 0);
    check('传播预览为单文件（无本地相对引用）', localRefs.length === 0, JSON.stringify(localRefs.slice(0, 5)));
    check('传播预览内含示例源码与整库', /PropagationGraph/.test(html) && /PropagationAdapter/.test(html) &&
      /window\.NoteDemo/.test(html) && /data-demo-host/.test(html));
  }
}

/* ---------------- 2. 示例页面运行（作者入口加载方式） ---------------- */
async function openPage(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, reducedMotion: options.reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  const pageErrors = [];
  const externalRequests = [];
  page.on('pageerror', (error) => pageErrors.push('pageerror: ' + error.message));
  page.on('console', (message) => { if (message.type() === 'error') pageErrors.push('console: ' + message.text()); });
  page.on('request', (request) => { if (/^https?:/i.test(request.url())) externalRequests.push(request.url()); });
  await page.goto(options.preview ? previewUrl : exampleUrl, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.PropagationExample && !!document.querySelector('.pg-svg'), null, { timeout: 15000 }).catch(() => {});
  return { context, page, pageErrors, externalRequests };
}

const browser = await chromium.launch({ executablePath: edge, headless: true });
{
  const { context, page, pageErrors, externalRequests } = await openPage(browser);
  const state = await page.evaluate(() => {
    const example = window.PropagationExample;
    const host = document.querySelector('[data-demo-host]');
    return {
      mounted: !!example,
      stage: example ? example.getStage() : -1,
      layers: example ? example.getLayers().length : -1,
      frames: example ? example.getFrames() : [],
      controls: host ? Array.from(host.querySelectorAll('.nblk-demo-stage__controls button')).map((node) => node.textContent.trim()) : [],
      svg: !!document.querySelector('.pg-svg')
    };
  });
  check('传播示例按作者入口可挂载', state.mounted && state.svg && state.stage === 0 && state.layers === 0 && state.frames.length === 4,
    JSON.stringify(state));
  check('传播示例默认舞台控件齐全', state.controls.join(',') === '上一步,下一步,重看,重来', JSON.stringify(state.controls));
  check('传播示例无外部网络请求', externalRequests.length === 0, JSON.stringify(externalRequests.slice(0, 5)));

  const step = async () => {
    // 按帧采样（rAF），避免固定毫秒间隔错过“动画结束到 idle 前”的中间帧。
    const samples = [];
    await page.evaluate(() => {
      const host = document.querySelector('[data-demo-host]');
      const button = Array.from(host.querySelectorAll('.nblk-demo-stage__controls button')).find((node) => node.textContent.trim() === '下一步');
      window.__propagationSamples = [];
      const rectOf = (el) => {
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      const centerOf = (el) => {
        const rect = rectOf(el);
        return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
      };
      const opacityOf = (el) => (el ? Number(getComputedStyle(el).opacity) : -1);
      const inside = (box, point, pad) => !!box && !!point &&
        point.x >= box.left - pad && point.x <= box.right + pad && point.y >= box.top - pad && point.y <= box.bottom + pad;
      const tick = () => {
        const svg = document.querySelector('.pg-svg');
        const layers = Array.from(document.querySelectorAll('.pg-layer'));
        const active = layers[layers.length - 1] || null;
        const previous = layers[layers.length - 2] || null;
        const boxEl = document.querySelector('.nx-focus__box');
        const box = rectOf(boxEl);
        const frontCenter = centerOf(active ? active.querySelector('.pg-front') : null);
        const eventCenter = centerOf(active ? active.querySelector('.pg-event') : null);
        const stationA = centerOf(document.querySelector('.pg-station[data-station="a"] .pg-station-dot') || document.querySelector('.pg-station[data-station="a"]'));
        const stationB = centerOf(document.querySelector('.pg-station[data-station="b"] .pg-station-dot') || document.querySelector('.pg-station[data-station="b"]'));
        window.__propagationSamples.push({
          at: performance.now(),
          stage: svg ? Number(svg.getAttribute('data-stage')) : -1,
          layers: layers.length,
          progress: active ? Number(active.getAttribute('data-progress')) : -1,
          bandWidth: active && active.querySelector('.pg-band') ? Number(active.querySelector('.pg-band').getAttribute('width')) : -1,
          labelOpacity: opacityOf(active ? active.querySelector('.pg-label') : null),
          tickOpacity: opacityOf(active ? active.querySelector('.pg-tick') : null),
          eventOpacity: opacityOf(active ? active.querySelector('.pg-event') : null),
          prevFrontOpacity: opacityOf(previous ? previous.querySelector('.pg-front') : null),
          prevLabelOpacity: opacityOf(previous ? previous.querySelector('.pg-label') : null),
          phase: window.PropagationExample.session.getState().phase,
          focusShown: document.querySelectorAll('.nx-focus[data-nx-state="shown"]').length,
          box: box,
          boxCenter: box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null,
          frontInside: inside(box, frontCenter, 4),
          eventInside: inside(box, eventCenter, 4),
          stationAInside: inside(box, stationA, 4),
          stationBInside: inside(box, stationB, 4),
          pgFocusCount: document.querySelectorAll('.pg-focus').length,
          boxAnimationsRunning: boxEl ? boxEl.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length : 0
        });
        window.__propagationFrame = requestAnimationFrame(tick);
      };
      window.__propagationFrame = requestAnimationFrame(tick);
      button.click();
    });
    await page.waitForFunction(() => window.PropagationExample && window.PropagationExample.session.getState().phase === 'idle', null, { timeout: 20000 }).catch(() => {});
    const result = await page.evaluate(() => {
      cancelAnimationFrame(window.__propagationFrame);
      return {
        stage: window.PropagationExample.getStage(),
        layers: window.PropagationExample.getLayers(),
        samples: window.__propagationSamples,
        status: (document.querySelector('[data-propagation-status]') || {}).textContent || ''
      };
    });
    // 层 stage 唯一；progress 只应 0..1 单调推进（允许采样跨停点，按层当前状态校验）。
    const stages = result.layers.map((layer) => layer.stage);
    result.uniqueStages = new Set(stages).size === stages.length;
    result.progressInRange = result.layers.every((layer) => layer.progress >= 0 && layer.progress <= 1.0001);
    let lastProgress = -1;
    let monotonic = true;
    for (const sample of result.samples) {
      if (sample.layers !== result.layers.length) continue;
      if (sample.progress < lastProgress - 0.02) monotonic = false;
      lastProgress = Math.max(lastProgress, sample.progress);
    }
    result.monotonic = monotonic;
    result.sampleCount = result.samples.length;
    return result;
  };

  function firstIndexWhere(list, predicate) {
    for (let index = 0; index < list.length; index += 1) if (predicate(list[index])) return index;
    return -1;
  }
  // 从首次可见开始，之后不得回落到阈值以下（用于“动画结束到 idle 前不闪回”）。
  function visibleThenNoDrop(list, key, visibleThreshold, dropThreshold) {
    const firstIndex = firstIndexWhere(list, (sample) => Number(sample[key]) > visibleThreshold);
    if (firstIndex < 0) return { present: false, drops: 0, min: -1 };
    const after = list.slice(firstIndex);
    const drops = after.filter((sample) => Number(sample[key]) < dropThreshold).length;
    return { present: true, drops: drops, min: Math.min.apply(null, after.map((sample) => Number(sample[key]))) };
  }
  // Definition 侧意图：三步都是真实运动目标，不再用观察目标重复巡视 sender/receiver/prevFront。
  const definitionIntent = await page.evaluate(() => {
    const definition = window.PropagationDemo && window.PropagationDemo.definition;
    if (!definition) return { error: '缺少 window.PropagationDemo.definition' };
    const transitions = Array.isArray(definition.transitions) ? definition.transitions : [];
    const allowedParts = ['front', 'eventDot', 'event'];
    const forbiddenParts = ['sender', 'receiver', 'prevFront', 'prevLabel'];
    const observationTargets = [];
    const badParts = [];
    const targetCounts = [];
    const enterDurations = [];
    transitions.forEach((transition, index) => {
      const scene = transition && transition.scene ? transition.scene : {};
      const attention = scene.attention || {};
      const targets = Array.isArray(attention.targets) ? attention.targets : [];
      targetCounts.push(targets.length);
      enterDurations.push(scene.timing && typeof scene.timing.enterDuration === 'number' ? scene.timing.enterDuration : null);
      targets.forEach((target) => {
        const part = target.query && target.query.part;
        const groups = Array.isArray(target.groups) ? target.groups : null;
        if (groups && groups.length === 0) observationTargets.push({ transition: index, part: part });
        if (forbiddenParts.indexOf(part) >= 0 || allowedParts.indexOf(part) < 0) badParts.push({ transition: index, part: part });
      });
    });
    const publicDefault = window.NoteDemoInternals && window.NoteDemoInternals.definition && window.NoteDemoInternals.definition.timingDefaults
      ? window.NoteDemoInternals.definition.timingDefaults.enterDuration : null;
    return { transitions: transitions.length, targetCounts: targetCounts, observationTargets: observationTargets, badParts: badParts,
      enterDurations: enterDurations, publicDefault: publicDefault };
  });
  const intentEnter = definitionIntent && Array.isArray(definitionIntent.enterDurations)
    ? definitionIntent.enterDurations[0] : null;
  check('传播例 Definition：三步全部是真实运动目标（无 groups:[] 观察目标）', !!definitionIntent && !definitionIntent.error &&
    definitionIntent.transitions === 3 && definitionIntent.observationTargets.length === 0 &&
    JSON.stringify(definitionIntent.targetCounts) === JSON.stringify([1, 2, 1]),
    JSON.stringify(definitionIntent));
  check('传播例 Definition：目标只指向 front/eventDot/event', !!definitionIntent && definitionIntent.badParts.length === 0,
    JSON.stringify(definitionIntent && definitionIntent.badParts));
  check('传播例 Definition：每步 scene 使用同一较缓 enterDuration（相对公共默认更慢）', !!definitionIntent &&
    definitionIntent.enterDurations.length === 3 && definitionIntent.enterDurations[0] !== null &&
    definitionIntent.enterDurations.every((value) => value === definitionIntent.enterDurations[0]) &&
    (definitionIntent.publicDefault === null || definitionIntent.enterDurations[0] > definitionIntent.publicDefault),
    JSON.stringify({ enterDurations: definitionIntent && definitionIntent.enterDurations, publicDefault: definitionIntent && definitionIntent.publicDefault }));
  function progressWindow(samples) {
    const started = samples.find((sample) => sample.progress > 0);
    const finished = samples.find((sample) => sample.progress >= 0.999);
    return started && finished ? { duration: finished.at - started.at, start: started.at, end: finished.at } : null;
  }
  function frontPlausibility(stepSamples, label) {
    const shown = stepSamples.filter((sample) => sample.focusShown > 0);
    const first = shown[0] || null;
    const moving = stepSamples.filter((sample) => sample.focusShown > 0 && sample.progress > 0.1 && sample.progress < 0.9);
    return { label: label, firstInside: !!first && first.frontInside, movingCount: moving.length, movingAllInside: moving.length > 0 && moving.every((sample) => sample.frontInside), first: first };
  }
  function boxDistance(a, b) { return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : -1; }
  function carryOf(previousSettle, runSamples) {
    const withBox = runSamples.filter((sample) => sample.phase === 'running' && sample.boxCenter);
    if (!previousSettle || !withBox.length) return { ok: false, reason: 'missing' };
    const first = withBox[0];
    const maxMovement = withBox.reduce((max, sample) => Math.max(max, boxDistance(previousSettle.boxCenter, sample.boxCenter)), 0);
    const firstDistance = boxDistance(previousSettle.boxCenter, first.boxCenter);
    return { ok: firstDistance <= Math.max(8, maxMovement * 0.4), firstDistance: firstDistance, maxMovement: maxMovement };
  }
  const s1 = await step();
  check('传播示例 停点1：只追加一层且终态为发送段', s1.stage === 1 && s1.layers.length === 1 &&
    s1.layers[0].progress >= 0.999 && s1.layers[0].active === true &&
    s1.uniqueStages && s1.progressInRange && s1.monotonic && s1.status.indexOf('历史层 1') >= 0,
    JSON.stringify({ stage: s1.stage, layers: s1.layers, unique: s1.uniqueStages, monotonic: s1.monotonic, status: s1.status }));
  const unreleased = s1.samples.find((sample) => sample.layers === 1 && sample.progress === 0 && sample.bandWidth === 0 && sample.labelOpacity === 0);
  check('传播示例 停点1：放行前保持来源视觉（带宽 0/标签隐藏）', !!unreleased,
    JSON.stringify(s1.samples.slice(0, 8)));
  const final1 = s1.samples[s1.samples.length - 1];
  check('传播示例 停点1：放行后进度到 1 且标签可见', !!final1 && final1.progress >= 0.999 && final1.labelOpacity > 0.9 && final1.bandWidth > 0,
    JSON.stringify(final1));
  const labelHold = visibleThenNoDrop(s1.samples.filter((sample) => sample.layers === 1), 'labelOpacity', 0.5, 0.5);
  check('传播示例 停点1：label 在局部效果结束后到 idle 前不闪回', labelHold.present && labelHold.drops === 0,
    JSON.stringify({ labelHold, sampleCount: s1.sampleCount }));
  const tickHold = visibleThenNoDrop(s1.samples.filter((sample) => sample.layers === 1), 'tickOpacity', 0.5, 0.5);
  check('传播示例 停点1：tick 若已出现则持续可见到 idle', !tickHold.present || tickHold.drops === 0,
    JSON.stringify({ tickHold, sampleCount: s1.sampleCount }));
  const s1Front = frontPlausibility(s1.samples);
  check('传播示例 停点1：首个焦点样本即包住真实前沿，推进期间持续跟随', s1Front.firstInside && s1Front.movingAllInside,
    JSON.stringify(s1Front));
  check('传播示例 停点1：无透明焦点代理节点', s1.samples.every((sample) => sample.pgFocusCount === 0),
    JSON.stringify(s1.samples.map((sample) => sample.pgFocusCount).slice(-5)));
  const s1Settle = (() => {
    const withBox = s1.samples.filter((sample) => sample.phase === 'idle' && sample.boxCenter);
    return withBox.length ? withBox[withBox.length - 1] : s1.samples.filter((sample) => sample.boxCenter).slice(-1)[0] || null;
  })();
  const layerNode1 = await page.evaluate(() => {
    const node = document.querySelector('.pg-layer');
    window.__layer1 = node;
    return !!node;
  });

  const s2 = await step();
  check('传播示例 停点2：历史层保留且新增一层命中', s2.stage === 2 && s2.layers.length === 2 &&
    s2.layers.every((layer) => layer.progress >= 0.999) && s2.uniqueStages && s2.progressInRange && s2.monotonic &&
    s2.status.indexOf('历史层 2') >= 0,
    JSON.stringify({ stage: s2.stage, layers: s2.layers, unique: s2.uniqueStages, monotonic: s2.monotonic, status: s2.status }));
  const s2Front = frontPlausibility(s2.samples);
  const firstEvent = s2.samples.find((sample) => sample.layers === 2 && sample.eventOpacity > 0.9);
  const leadMaxBeforeEvent = s2.samples.filter((sample) => sample.layers === 2 && sample.eventOpacity < 0.1)
    .reduce((max, sample) => Math.max(max, sample.progress), 0);
  check('传播示例 停点2：先跟随真实前沿，event 在 lead 接近完成后才出现', s2Front.firstInside && s2Front.movingAllInside &&
    leadMaxBeforeEvent > 0.9 && !!firstEvent && firstEvent.eventInside,
    JSON.stringify({ front: s2Front, leadMaxBeforeEvent: Math.round(leadMaxBeforeEvent * 100) / 100, event: firstEvent && { eventInside: firstEvent.eventInside, progress: firstEvent.progress } }));
  const s2Carry = carryOf(s1Settle, s2.samples);
  check('传播示例 停点2：下一步从上一落点直接承接，不重新巡视旧依据', s2Carry.ok,
    JSON.stringify(s2Carry));
  const eventHold = visibleThenNoDrop(s2.samples.filter((sample) => sample.layers === 2), 'eventOpacity', 0.5, 0.5);
  check('传播示例 停点2：event 局部效果结束后到 idle 前不回落', !eventHold.present || eventHold.drops === 0,
    JSON.stringify({ eventHold, sampleCount: s2.sampleCount }));
  const historyKept = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('.pg-layer'));
    const first = nodes[0];
    return { sameNode: first === window.__layer1, sameProgress: first ? Number(first.getAttribute('data-progress')) : -1, count: nodes.length };
  });
  check('传播示例 停点2：不重建/不覆盖历史层', historyKept.sameNode && historyKept.sameProgress >= 0.999 && historyKept.count === 2,
    JSON.stringify(historyKept));

  const s3 = await step();
  check('传播示例 停点3：回传层追加，历史累计三层', s3.stage === 3 && s3.layers.length === 3 &&
    s3.layers.every((layer) => layer.progress >= 0.999) && s3.uniqueStages && s3.progressInRange && s3.monotonic &&
    s3.status.indexOf('历史层 3') >= 0,
    JSON.stringify({ stage: s3.stage, layers: s3.layers, unique: s3.uniqueStages, monotonic: s3.monotonic, status: s3.status }));

  const s3Front = frontPlausibility(s3.samples);
  check('传播示例 停点3：回传从首个焦点样本起持续包住真实前沿', s3Front.firstInside && s3Front.movingAllInside,
    JSON.stringify(s3Front));
  check('传播示例 停点3：无透明焦点代理节点', s3.samples.every((sample) => sample.pgFocusCount === 0) &&
    s2.samples.every((sample) => sample.pgFocusCount === 0),
    JSON.stringify({ s3: s3.samples.map((sample) => sample.pgFocusCount).slice(-5) }));

  const s2Settle = (() => {
    const withBox = s2.samples.filter((sample) => sample.phase === 'idle' && sample.boxCenter);
    return withBox.length ? withBox[withBox.length - 1] : s2.samples.filter((sample) => sample.boxCenter).slice(-1)[0] || null;
  })();
  const s3Carry = carryOf(s2Settle, s3.samples);
  check('传播示例 停点3：回传从命中落点直接承接，不额外绕经 B 站圆点', s3Carry.ok,
    JSON.stringify(s3Carry));
  // label/tick/event：局部效果结束后到 idle 前不回落（三层分别检查出现的元素）。
  const holdIssues = [];
  [s1, s2, s3].forEach((stepResult, stepIndex) => {
    ['labelOpacity', 'tickOpacity', 'eventOpacity'].forEach((key) => {
      const hold = visibleThenNoDrop(stepResult.samples.filter((sample) => sample.layers === stepIndex + 1), key, 0.5, 0.5);
      if (hold.present && hold.drops > 0) holdIssues.push({ step: stepIndex + 1, key: key, drops: hold.drops });
    });
  });
  check('传播示例：三层 label/tick/event 首次可见后到 idle 不回落', holdIssues.length === 0, JSON.stringify(holdIssues));
  // 每步 progress 的实际完成时间相对于本示例 scene enterDuration（不锁定当次毫秒）。
  const windows = [progressWindow(s1.samples), progressWindow(s2.samples), progressWindow(s3.samples)];
  const durationOk = windows.every((window) => !!window && intentEnter && window.duration >= intentEnter * 0.6 && window.duration <= intentEnter * 1.6);
  check('传播示例：每步内容推进时长与本示例 enterDuration 匹配', durationOk,
    JSON.stringify({ windows: windows.map((window) => window && Math.round(window.duration)), enterDuration: intentEnter }));

  // 重看：同一停点不叠层。
  const replayState = await page.evaluate(async () => {
    const host = document.querySelector('[data-demo-host]');
    const button = Array.from(host.querySelectorAll('.nblk-demo-stage__controls button')).find((node) => node.textContent.trim() === '重看');
    button.click();
    const session = window.PropagationExample.session;
    const deadline = performance.now() + 12000;
    while (performance.now() < deadline && session.getState().phase !== 'idle') await new Promise((resolve) => setTimeout(resolve, 24));
    return { stage: window.PropagationExample.getStage(), layers: window.PropagationExample.getLayers().length };
  });
  check('传播示例 重看：不重复叠历史层', replayState.stage === 3 && replayState.layers === 3, JSON.stringify(replayState));

  // 运行中“上一步”：取消并回到上一停点，层数不残留。
  const cancelState = await page.evaluate(async () => {
    const host = document.querySelector('[data-demo-host]');
    const findButton = (label) => Array.from(host.querySelectorAll('.nblk-demo-stage__controls button')).find((node) => node.textContent.trim() === label);
    const session = window.PropagationExample.session;
    const waitIdle = async (timeoutMs) => {
      const deadline = performance.now() + timeoutMs;
      while (performance.now() < deadline && session.getState().phase !== 'idle') await new Promise((resolve) => setTimeout(resolve, 24));
    };
    const clickAndSettle = async (label) => {
      const before = session.getState().settledFrameId;
      findButton(label).click();
      const deadline = performance.now() + 8000;
      while (performance.now() < deadline && session.getState().phase === 'idle' && session.getState().settledFrameId === before) {
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      await waitIdle(12000);
    };
    findButton('重来').click();
    await waitIdle(12000);
    await clickAndSettle('下一步');
    await clickAndSettle('下一步');
    const sourceStage = window.PropagationExample.getStage();
    findButton('下一步').click();
    let deadline = performance.now() + 8000;
    while (performance.now() < deadline && session.getState().phase !== 'running') await new Promise((resolve) => setTimeout(resolve, 16));
    await new Promise((resolve) => setTimeout(resolve, 90));
    findButton('上一步').click();
    await waitIdle(12000);
    return { stage: window.PropagationExample.getStage(), layers: window.PropagationExample.getLayers().length, phase: session.getState().phase, sourceStage };
  });
  // 冻结契约 E：运行中 prev 的目标是被取消运行的 sourceFrameId（hit=stage2），
  // 再按“目标停点有可运行入边则从其来源恢复并重播该步”，最终应停在 stage2、层数 2。
  check('传播示例 运行中上一步：回到来源停点且无残留层', cancelState.stage === 2 && cancelState.layers === 2 && cancelState.phase === 'idle',
    JSON.stringify(cancelState));

  // 重来：只剩初始停点。
  const resetState = await page.evaluate(async () => {
    const host = document.querySelector('[data-demo-host]');
    const button = Array.from(host.querySelectorAll('.nblk-demo-stage__controls button')).find((node) => node.textContent.trim() === '重来');
    button.click();
    const session = window.PropagationExample.session;
    const deadline = performance.now() + 8000;
    while (performance.now() < deadline && session.getState().phase !== 'idle') await new Promise((resolve) => setTimeout(resolve, 24));
    return { stage: window.PropagationExample.getStage(), layers: window.PropagationExample.getLayers().length };
  });
  check('传播示例 重来：回到初始停点且层清空', resetState.stage === 0 && resetState.layers === 0, JSON.stringify(resetState));
  check('传播示例运行无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  await context.close();
}

/* ---------------- 3. 减少动效：直接终态、不迁移 ---------------- */
{
  const { context, page, pageErrors } = await openPage(browser, { reduced: true });
  const result = await page.evaluate(async () => {
    const startedAt = performance.now();
    const runs = [];
    for (let index = 0; index < 3; index += 1) {
      const host = document.querySelector('[data-demo-host]');
      const button = Array.from(host.querySelectorAll('.nblk-demo-stage__controls button')).find((node) => node.textContent.trim() === '下一步');
      button.click();
      const session = window.PropagationExample.session;
      const deadline = performance.now() + 8000;
      while (performance.now() < deadline && session.getState().phase !== 'idle') await new Promise((resolve) => setTimeout(resolve, 16));
      const active = document.querySelector('.pg-layer[data-active="true"]');
      runs.push({ stage: window.PropagationExample.getStage(), progress: active ? Number(active.getAttribute('data-progress')) : -1,
        running: active ? active.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length : 0 });
    }
    return { runs: runs, elapsed: performance.now() - startedAt, focus: document.querySelectorAll('.nx-focus[data-nx-state="shown"]').length };
  });
  check('传播示例 减少动效：直接落到终态', result.runs.length === 3 && result.runs.every((run) => run.progress >= 0.999) &&
    result.runs[2].stage === 3 && result.elapsed < 6000,
    JSON.stringify(result));
  check('传播示例 减少动效：无焦点迁移残留动画', result.runs.every((run) => run.running === 0) && result.focus === 0, JSON.stringify(result));
  check('传播示例 减少动效区无页面错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  await context.close();
}

await browser.close();
const failed = checks.filter((row) => !row.ok);
console.log('SUMMARY ' + (checks.length - failed.length) + '/' + checks.length + ' passed');
if (failed.length) process.exitCode = 1;
