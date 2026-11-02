#!/usr/bin/env node
/*
 * 最小连续画面示例检查：一个 Binding 的两个局部效果组按焦点先后启动。
 * 真实检查计算透明度、文字内容、受控标记与关键帧，而不是只读 data-* 诊断字段。
 * 额外注入一条 CSS transition，证明公共接管能压住受控内容原生的自动补间。
 *
 * Usage: node tests/checks/continuous-scene-check.mjs
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const entry = pathToFileURL(path.join(root, 'examples/continuous-scene/index.html')).href;
const failures = [];
let passes = 0;
function expect(condition, message, detail) {
  if (condition) { passes += 1; console.log('PASS  ' + message); }
  else { failures.push(message); console.log('FAIL  ' + message + (detail == null ? '' : ' :: ' + String(detail).slice(0, 700))); }
}

const browser = await chromium.launch({ executablePath: edge, headless: true });
const pageErrors = [];
async function openPage(reduced = false) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 940 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') pageErrors.push('console: ' + message.text()); });
  await page.goto(entry, { waitUntil: 'load' });
  await page.waitForFunction(() => window.ContinuousExample && window.ContinuousExample.session, null, { timeout: 15000 });
  await page.waitForTimeout(100);
  return { context, page };
}

try {
  const { context, page } = await openPage(false);
  // 故意让受控内容带一条作者 CSS transition；公共接管必须压住它。
  await page.addStyleTag({ content: '.cs-panel__value > span { transition: opacity 1000ms linear; }' });
  const run = await page.evaluate(async () => {
    const session = window.ContinuousExample.session;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const snapshot = () => {
      const read = (part) => {
        const el = document.querySelector('[data-part="' + part + '"]');
        if (!el) return null;
        const source = el.querySelector('[data-role="source"]');
        const target = el.querySelector('[data-role="target"]');
        return {
          visual: el.getAttribute('data-visual'),
          progress: Number(el.getAttribute('data-progress') || 0),
          sourceText: source.textContent,
          targetText: target.textContent,
          sourceOpacity: Number(getComputedStyle(source).opacity),
          targetOpacity: Number(getComputedStyle(target).opacity),
          targetTransition: getComputedStyle(target).transitionDuration,
          targetVisibility: getComputedStyle(target).visibility,
          targetDisplay: getComputedStyle(target).display
        };
      };
      return {
        phase: session.getState().phase,
        frame: session.getState().settledFrameId,
        record: document.querySelector('[data-part="record"] span:last-child').textContent,
        control: (document.querySelector('.note-demo-binding') || {}).getAttribute
          ? document.querySelector('.note-demo-binding').getAttribute('data-note-scene-active') : null,
        left: read('left'), right: read('right')
      };
    };
    const sampleStep = async (action) => {
      const samples = [];
      let collecting = true;
      const frame = () => {
        samples.push(snapshot());
        if (collecting) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      const result = await action();
      collecting = false;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return { result, samples, final: snapshot() };
    };
    const initial = snapshot();
    const first = await sampleStep(() => session.next());
    const replay = await sampleStep(() => session.replay());
    const second = await sampleStep(() => session.next());
    const prev = await sampleStep(() => session.prev());
    const afterPrev = snapshot();
    // 代表性取消：从上一停点推进，在左组已开始后恢复来源。
    const cancelBase = await session.go('initial');
    const cancelPending = session.next();
    for (let i = 0; i < 160; i += 1) {
      const state = session.getState();
      const left = Number(document.querySelector('[data-part="left"]').getAttribute('data-progress') || 0);
      if (state.phase === 'running' && left > 0.001) break;
      await sleep(8);
    }
    const cancelGo = session.go('initial');
    const cancelRun = await cancelPending;
    const cancelResult = await cancelGo;
    const afterCancel = snapshot();
    return { initial, first, replay, second, prev, afterPrev, cancelBase, cancelRun, cancelResult, afterCancel };
  });

  const first = run.first;
  const firstControl = first.samples.findIndex((sample) => sample.control === 'true');
  const firstLeft = first.samples.findIndex((sample, index) => index >= firstControl && sample.left.progress > 0.001);
  const firstRight = first.samples.findIndex((sample, index) => index >= firstControl && sample.right.progress > 0.001);
  const firstCommit = first.samples[firstControl] || null;
  const leftPlaying = first.samples.find((sample) => sample.left.progress > 0.02 && sample.left.progress < 0.98 && sample.right.progress === 0) || null;
  const firstVisibleLeft = first.samples.findIndex((sample) => sample.left.targetOpacity > 0.01);
  const firstVisibleRight = first.samples.findIndex((sample) => sample.right.targetOpacity > 0.01);
  const second = run.second;
  const secondControl = second.samples.findIndex((sample) => sample.control === 'true');
  const secondCommit = second.samples[secondControl] || null;

  expect(run.initial.left.visual === 'A' && run.initial.right.visual === 'C' && run.initial.record.includes('等待提交'),
    '示例初始来源视觉与辅助记录正确', JSON.stringify(run.initial));
  expect(first.result.status === 'completed' && firstLeft >= 0 && firstRight > firstLeft,
    '两个效果组按左、右焦点先后启动', JSON.stringify({ firstLeft, firstRight, result: first.result }));
  expect(firstCommit && firstCommit.left.targetOpacity <= 0.01 && firstCommit.right.targetOpacity <= 0.01 &&
    firstCommit.left.sourceOpacity >= 0.99 && firstCommit.right.sourceOpacity >= 0.99,
    '提交后的首个受控帧没有提前露出 B、D', JSON.stringify(firstCommit));
  expect(firstCommit && firstCommit.left.targetText === 'B' && firstCommit.right.targetText === 'D' &&
    firstCommit.left.sourceText === 'A' && firstCommit.right.sourceText === 'C',
    '提交帧的真实文字层保持来源/目标职责', JSON.stringify(firstCommit && { left: firstCommit.left, right: firstCommit.right }));
  expect(leftPlaying && leftPlaying.right.visual === 'C' && leftPlaying.right.targetOpacity <= 0.01 && leftPlaying.right.sourceOpacity >= 0.99,
    '左组播放时右格真实保持来源 C，不被左组绘制覆盖', JSON.stringify(leftPlaying && leftPlaying.right));
  expect(leftPlaying && leftPlaying.control === 'true' && leftPlaying.left.targetTransition === '0s' && leftPlaying.right.targetTransition === '0s',
    '受控期间作者 CSS transition 被公共接管压住', JSON.stringify(leftPlaying && { left: leftPlaying.left.targetTransition, right: leftPlaying.right.targetTransition }));
  expect(firstVisibleLeft >= 0 && firstRight > firstVisibleLeft && firstVisibleRight >= firstRight,
    '真实可见变化顺序为左组先、右组后', JSON.stringify({ firstVisibleLeft, firstRight, firstVisibleRight }));
  expect(first.final.left.visual === 'B' && first.final.right.visual === 'D' && first.final.record.includes('目标已提交') && first.final.control === null,
    '第一步最终落位且释放接管', JSON.stringify(first.final));
  expect(run.replay.result.status === 'completed' && run.replay.final.left.visual === 'B' && run.replay.final.right.visual === 'D',
    'replay 重演后画面正确', JSON.stringify({ status: run.replay.result.status, final: run.replay.final }));
  expect(second.result.status === 'completed' && secondCommit && secondCommit.control === 'true' &&
    secondCommit.left.targetText === 'B' && secondCommit.left.visual === 'B' &&
    secondCommit.right.targetText === 'E' && secondCommit.right.targetOpacity <= 0.01 &&
    secondCommit.right.sourceText === 'D' && secondCommit.right.sourceOpacity >= 0.99,
    '下一步提交帧没有先闪 E，右格从 D 开始过渡', JSON.stringify(secondCommit && { left: secondCommit.left, right: secondCommit.right }));
  expect(second.final.left.visual === 'B' && second.final.right.visual === 'E' && second.final.control === null,
    '第二步最终落位且释放接管', JSON.stringify(second.final));
  expect(run.prev.result.status === 'completed' && run.afterPrev.left.visual === 'B' && run.afterPrev.right.visual === 'D' && run.afterPrev.control === null,
    'prev 回到上一停点视觉', JSON.stringify(run.afterPrev));
  expect(run.cancelBase.status === 'completed' && run.cancelRun.status === 'cancelled' &&
    run.cancelResult.status === 'completed' && run.afterCancel.left.visual === 'A' && run.afterCancel.right.visual === 'C' &&
    run.afterCancel.control === null,
    '代表性取消恢复来源且释放接管', JSON.stringify({ base: run.cancelBase.status, run: run.cancelRun.status, go: run.cancelResult.status, final: run.afterCancel }));
  await context.close();

  const reducedPage = await openPage(true);
  const reduced = await reducedPage.page.evaluate(async () => {
    const session = window.ContinuousExample.session;
    const status = await session.next();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const read = (part) => {
      const el = document.querySelector('[data-part="' + part + '"]');
      return {
        visual: el && el.getAttribute('data-visual'),
        leftSource: el && el.querySelector('[data-role="source"]').textContent,
        leftTarget: el && el.querySelector('[data-role="target"]').textContent
      };
    };
    return {
      status,
      phase: session.getState().phase,
      left: read('left'), right: read('right'),
      record: document.querySelector('[data-part="record"] span:last-child').textContent
    };
  });
  expect(reduced.status.status === 'completed' && reduced.phase === 'idle' &&
    reduced.left.visual === 'B' && reduced.right.visual === 'D' && reduced.record.includes('目标已提交'),
    'reduced 直接落目标并保持辅助记录', JSON.stringify(reduced));
  await reducedPage.context.close();

  // 最小恢复用例：自定义 Adapter 的真实 transform 带 1s CSS transition。
  // go() 必须直接落到目标位置，不能把恢复写入变成 CSS 补间；接管标记必须已释放。
  const restorePage = await openPage(false);
  const restore = await restorePage.page.evaluate(async () => {
    const host = document.createElement('div');
    host.style.cssText = 'width:300px;height:100px;';
    document.body.appendChild(host);
    let box = null;
    const adapter = {
      name: 'restore-position-test',
      sceneModes: ['update'],
      normalizeView(input) { return { model: { x: Number(input && input.x) || 0 }, cues: {} }; },
      mount(container) {
        const root = document.createElement('div');
        root.style.cssText = 'width:200px;height:60px;';
        box = document.createElement('div');
        box.style.cssText = 'width:120px;height:60px;background:#315cda;transform:translateX(0px);transition:transform 1000ms linear;';
        root.appendChild(box);
        container.appendChild(root);
        return {
          restore(view) { box.style.transform = 'translateX(' + ((view && view.model && view.model.x) || 0) + 'px)'; },
          readView() { return { model: { x: parseFloat((box.style.transform.match(/translateX\(([-0-9.]+)px\)/) || [])[1]) || 0 }, cues: {} }; },
          target(query) { return query && query.part === 'root' ? root : null; },
          destroy() { root.remove(); }
        };
      }
    };
    const definition = {
      initialFrameId: 'zero',
      bindings: { main: { adapter: 'restore-position-test', slot: 'main' } },
      frames: [
        { id: 'zero', caption: 'zero', views: { main: { x: 0 } } },
        { id: 'moved', caption: 'moved', views: { main: { x: 120 } } }
      ],
      transitions: []
    };
    const session = window.NoteDemo.create({ definition, slots: { main: host }, adapters: { 'restore-position-test': adapter } });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const before = { transform: getComputedStyle(box).transform, animations: box.getAnimations().length };
    const result = await session.go('moved');
    const immediate = {
      transform: getComputedStyle(box).transform,
      animations: box.getAnimations().length,
      control: host.querySelector('.note-demo-binding').getAttribute('data-note-scene-active')
    };
    await new Promise((resolve) => setTimeout(resolve, 160));
    const after = { transform: getComputedStyle(box).transform, animations: box.getAnimations().length };
    session.destroy();
    host.remove();
    return { before, result: result && result.status, immediate, after };
  });
  expect(restore.before.transform === 'matrix(1, 0, 0, 1, 0, 0)' && restore.before.animations === 0,
    '恢复用例初始位置与无动画', JSON.stringify(restore.before));
  expect(restore.result === 'completed' && /matrix\(1, 0, 0, 1, 120, 0\)/.test(restore.immediate.transform) &&
    restore.immediate.animations === 0 && restore.immediate.control === null,
    'go() 恢复直接落位且不启动 CSS transition', JSON.stringify(restore.immediate));
  expect(restore.after.transform === restore.immediate.transform && restore.after.animations === 0,
    '恢复后没有未登记的 CSS 补间尾巴', JSON.stringify(restore.after));
  await restorePage.context.close();

  expect(pageErrors.length === 0, '示例无页面/控制台错误', pageErrors.slice(0, 4).join(' | '));
} finally {
  await browser.close();
}

console.log('SUMMARY ' + passes + '/' + (passes + failures.length) + ' passed');
if (failures.length) {
  console.error('\n' + failures.join('\n'));
  process.exit(1);
}
