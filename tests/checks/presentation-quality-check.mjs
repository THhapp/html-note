#!/usr/bin/env node
/* Presentation default-stage quality check — focused on author-facing labels,
 * keyboard/tab behavior, reduced motion, long progress text and width stability.
 * Source-only Edge harness; no build output dependency. */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleScripts, moduleStyles } from '../lib/src-sources.mjs';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const src = (rel) => path.join(root, rel);
const MODULES = ['core', 'legacy', 'ui-layout', 'ui-content', 'ui-extended', 'blocks-base', 'demo-stage', 'viz-objects', 'viz-mechanisms', 'demo-runtime', 'demo-ui'];
const SCRIPTS = moduleScripts(root, MODULES);
const STYLES = moduleStyles(root, MODULES);
const LONG_PROGRESS = '第 {current} / {total} 步（当前停点：{frameId}；这一行故意写得很长，用来检查窄屏下进度文字是否会溢出并带动整页横向滚动）';
const LABELS = {
  prev: '上一步：回到上一个已经讲过的停点',
  next: '下一步：继续看后面的详细内容',
  replay: '重看当前这一小步',
  reset: '从头重来'
};

const browser = await chromium.launch({ executablePath: edge, headless: true });
const checks = [];
const pageErrors = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
}
async function makePage(reduced) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });
  await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main id="root"></main></body></html>');
  await page.addStyleTag({ content: 'html,body{margin:0;padding:0}body{padding:16px;box-sizing:border-box;background:#f4f6f9}#root{max-width:1120px;margin:0 auto}' });
  for (const rel of STYLES) await page.addStyleTag({ path: src(rel) });
  for (const rel of SCRIPTS) await page.addScriptTag({ path: src(rel) });
  await page.evaluate(() => {
    window.__makeHost = () => {
      const host = document.createElement('div');
      document.getElementById('root').appendChild(host);
      return host;
    };
    window.__layout = (container) => {
      const rootNode = document.createElement('div');
      const main = document.createElement('div');
      rootNode.appendChild(main);
      container.appendChild(rootNode);
      return { root: rootNode, slots: { main } };
    };
    window.__compile = () => window.NoteDemo.compile({
      bindings: { note: { adapter: 'dom', slot: 'main' } },
      initial: { id: 'f0', caption: '初始停点：先看这一句中文长字幕，它需要为后续更高的字幕预留阅读区。', views: { note: { text: 'A' } } },
      steps: [
        { id: 'f1', caption: '第二停点：同一布局里第一处更高的中文字幕；控件位置应保持稳定，不因换句而移动。', replace: { note: { text: 'B' } }, scene: { bindings: [{ binding: 'note', mode: 'update' }] } },
        { id: 'f2', caption: '最后停点：更短。', replace: { note: { text: 'C' } }, scene: { bindings: [{ binding: 'note', mode: 'update' }] } }
      ]
    });
  });
  return { context, page };
}
async function waitIdle(page) {
  await page.waitForFunction(() => {
    const session = window.__session;
    return session && session.getState().phase === 'idle';
  }, null, { timeout: 8000 });
}
async function mount(page) {
  return await page.evaluate(({ labels }) => {
    const host = window.__makeHost();
    window.__host = host;
    window.__session = window.NoteDemo.mount(host, {
      definition: window.__compile(),
      layout: window.__layout,
      labels: Object.assign({}, labels, { progress: labels.progress }),
      title: '默认舞台质量检查',
      label: '默认舞台质量检查'
    });
    return { phase: window.__session.getState().phase, settled: window.__session.getState().settledFrameId };
  }, { labels: Object.assign({}, LABELS, { progress: LONG_PROGRESS }) });
}

let page = null;
let context = null;
try {
  ({ page, context } = await makePage(false));
  const mounted = await mount(page);
  check('default stage mounts', mounted.phase === 'idle' && mounted.settled === 'f0', JSON.stringify(mounted));

  const a11y = await page.evaluate(() => {
    const host = window.__host;
    const controls = host.querySelector('.note-demo__controls');
    const buttons = Array.from(controls.querySelectorAll('button'));
    const progress = controls.querySelector('.note-demo__progress');
    const caption = host.querySelector('.nblk-demo-stage__caption');
    return {
      viewport: innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      controlsOverflow: controls.scrollWidth > controls.clientWidth + 1,
      controlsRole: controls.getAttribute('role'),
      controlsLabel: controls.getAttribute('aria-label'),
      progressText: progress.textContent,
      progressScrollWidth: progress.scrollWidth,
      progressClientWidth: progress.clientWidth,
      progressWhiteSpace: getComputedStyle(progress).whiteSpace,
      buttonNames: buttons.map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim()),
      captionAriaLive: caption ? caption.getAttribute('aria-live') : null,
      captionText: caption ? caption.textContent : ''
    };
  });
  check('long progress does not overflow narrow page', !a11y.horizontalOverflow && !a11y.controlsOverflow,
    JSON.stringify({ viewport: a11y.viewport, documentWidth: a11y.documentScrollWidth, controls: a11y.controlsOverflow }));
  check('long progress wraps instead of nowrap overflow', a11y.progressWhiteSpace === 'normal' && a11y.progressScrollWidth <= a11y.progressClientWidth + 1,
    JSON.stringify({ whiteSpace: a11y.progressWhiteSpace, scrollWidth: a11y.progressScrollWidth, clientWidth: a11y.progressClientWidth }));
  check('buttons keep author-visible accessible names', a11y.buttonNames.join('|') === [LABELS.prev, LABELS.next, LABELS.replay, LABELS.reset].join('|'), JSON.stringify(a11y.buttonNames));
  check('controls expose a group name', a11y.controlsRole === 'group' && !!String(a11y.controlsLabel || '').trim(), a11y.controlsRole + '|' + a11y.controlsLabel);
  check('caption is announced politely', a11y.captionAriaLive === 'polite' && !!a11y.captionText, a11y.captionAriaLive);

  // Tab order: disabled prev/replay are native-disabled and skipped; enabled next/reset reachable.
  await page.evaluate(() => { document.body.focus(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
  const tabs = [];
  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press('Tab');
    tabs.push(await page.evaluate(() => ({
      tag: document.activeElement.tagName,
      name: (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent || '').trim()
    })));
  }
  const tabNames = tabs.map((item) => item.name);
  check('initial tab order skips disabled prev/replay', tabNames.indexOf(LABELS.next) >= 0 && tabNames.indexOf(LABELS.reset) >= 0 &&
    tabNames.indexOf(LABELS.prev) < 0 && tabNames.indexOf(LABELS.replay) < 0, JSON.stringify(tabNames));

  // Enter and Space advance; focus stays on the pressed control.
  const nextButton = page.locator('#root .note-demo__controls button').filter({ hasText: LABELS.next }).first();
  await nextButton.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  await waitIdle(page);
  let state = await page.evaluate(() => ({ settled: window.__session.getState().settledFrameId, active: (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent || '').trim() }));
  check('Enter advances and keeps focus', state.settled === 'f1' && state.active === LABELS.next, JSON.stringify(state));
  await nextButton.focus();
  await page.keyboard.press(' ');
  await page.waitForTimeout(120);
  await waitIdle(page);
  state = await page.evaluate(() => ({ settled: window.__session.getState().settledFrameId, active: (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent || '').trim() }));
  check('Space advances and keeps focus', state.settled === 'f2' && state.active === LABELS.next, JSON.stringify(state));

  // Last frame: next is announced disabled; Enter/Space must not advance.
  const last = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('#root .note-demo__controls button')).find((b) => (b.textContent || '').trim() === '下一步：继续看后面的详细内容');
    const next = button;
    return { settled: window.__session.getState().settledFrameId, disabled: next ? next.disabled : null, ariaDisabled: next ? next.getAttribute('aria-disabled') : null };
  });
  const lastInfo = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('#root .note-demo__controls button')).find((b) => (b.getAttribute('aria-label') || b.textContent || '').trim() === '下一步：继续看后面的详细内容');
    return { settled: window.__session.getState().settledFrameId, disabled: button.disabled, ariaDisabled: button.getAttribute('aria-disabled') };
  });
  const nextAtEnd = page.locator('#root .note-demo__controls button').filter({ hasText: LABELS.next }).first();
  await nextAtEnd.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press(' ');
  await page.waitForTimeout(100);
  const endState = await page.evaluate(() => ({ phase: window.__session.getState().phase, settled: window.__session.getState().settledFrameId }));
  check('last-frame next is announced disabled and activation is blocked', (lastInfo.disabled || lastInfo.ariaDisabled === 'true') && endState.phase === 'idle' && endState.settled === 'f2',
    JSON.stringify({ lastInfo, endState }));

  // Caption reserve / controls stability across frames and narrow→wide→narrow.
  await page.evaluate(() => window.__session.reset());
  await page.waitForTimeout(100);
  const topOf = async (label) => page.evaluate(({ label }) => {
    const demo = document.querySelector('#root .nblk-demo-stage');
    const controls = demo.querySelector('.note-demo__controls');
    const caption = demo.querySelector('.nblk-demo-stage__caption');
    return { label, controlsTop: Math.round(controls.getBoundingClientRect().top * 10) / 10, captionReserve: getComputedStyle(caption).minHeight };
  }, { label });
  const stable = [];
  stable.push(await topOf('initial'));
  await page.evaluate(async () => { await window.__session.next(); });
  await page.waitForTimeout(80);
  await waitIdle(page);
  stable.push(await topOf('f1'));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(450);
  stable.push(await topOf('wide'));
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(450);
  stable.push(await topOf('narrow'));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(450);
  stable.push(await topOf('wide-back'));
  const tops = stable.map((item) => item.controlsTop);
  check('caption reserve keeps controls stable across frames', Math.abs(tops[0] - tops[1]) <= 1.5, JSON.stringify(stable.slice(0, 2)));
  check('width cycle does not leak stale stage/caption height', Math.abs(tops[2] - tops[4]) <= 1.5, JSON.stringify([stable[2], stable[4]]));

  // Tall content at a narrow viewport: caption + controls remain a readable, operable footer.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const stage = document.querySelector('#root .nblk-demo-stage__stage');
    if (stage) stage.style.minHeight = '1400px';
    document.querySelector('#root .nblk-demo-stage').scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(180);
  const sticky = await page.evaluate(() => {
    const rootEl = document.querySelector('#root .nblk-demo-stage');
    const footer = rootEl.querySelector('.nblk-demo-stage__footer');
    const caption = rootEl.querySelector('.nblk-demo-stage__caption');
    const controls = rootEl.querySelector('.nblk-demo-stage__controls');
    if (!footer || !caption || !controls) return null;
    const f = footer.getBoundingClientRect(); const c = caption.getBoundingClientRect(); const p = controls.getBoundingClientRect();
    return {
      viewport: innerHeight, position: getComputedStyle(footer).position,
      footerTop: Math.round(f.top), footerBottom: Math.round(f.bottom), footerHeight: Math.round(f.height),
      captionTop: Math.round(c.top), captionBottom: Math.round(c.bottom),
      controlsTop: Math.round(p.top), controlsBottom: Math.round(p.bottom),
      captionText: caption.textContent.trim().slice(0, 20)
    };
  });
  check('narrow tall stage keeps caption and controls in view', !!sticky && sticky.position === 'sticky' &&
    sticky.footerTop >= 0 && sticky.footerBottom <= sticky.viewport + 1 && sticky.captionTop >= 0 &&
    sticky.controlsBottom <= sticky.viewport + 1 && sticky.captionBottom <= sticky.controlsTop + 1,
    JSON.stringify(sticky));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(180);
  const desktopFooter = await page.evaluate(() => {
    const footer = document.querySelector('#root .nblk-demo-stage__footer');
    return footer ? getComputedStyle(footer).position : null;
  });
  check('desktop stage keeps normal footer flow', desktopFooter === 'static', String(desktopFooter));

  // Host-level labels and --hnv-* token overrides remain scoped and effective.
  const theme = await page.evaluate(async () => {
    const host = window.__makeHost();
    host.style.setProperty('--hnv-color-accent', '#7a4bd6');
    host.style.setProperty('--hnv-color-accent-soft', '#f0ebff');
    const session = window.NoteDemo.mount(host, {
      definition: window.__compile(),
      layout: window.__layout,
      title: '主题覆盖检查',
      labels: { prev: '后退一步', next: '前进一步', replay: '再看一次', reset: '回到开头', progress: '第 {current} 步，共 {total} 步' },
      captionLabel: '说明',
      maxWidth: '920px',
      minStageHeight: '420px'
    });
    await new Promise((resolve) => setTimeout(resolve, 260));
    const rootEl = host.querySelector('.nblk-demo-stage');
    const primary = host.querySelector('.note-demo__controls .nui-button--primary');
    return {
      phase: session.getState().phase,
      rootMaxWidth: getComputedStyle(rootEl).maxWidth,
      stageMinHeight: host.querySelector('.nblk-demo-stage__stage').style.minHeight,
      captionLabel: host.querySelector('.nblk-demo-stage__caption-label').textContent.trim(),
      progress: host.querySelector('.note-demo__progress').textContent.trim(),
      buttonNames: Array.from(host.querySelectorAll('.note-demo__controls button')).map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim()),
      primaryBg: primary ? getComputedStyle(primary).backgroundColor : null,
      hostAccent: getComputedStyle(host).getPropertyValue('--hnv-color-accent').trim()
    };
  });
  check('host labels and caption labels are scoped and applied', theme.phase === 'idle' &&
    theme.captionLabel === '说明' && theme.progress === '第 1 步，共 3 步' &&
    theme.buttonNames.join('|') === '后退一步|前进一步|再看一次|回到开头',
    JSON.stringify(theme));
  check('host maxWidth/minStageHeight and --hnv accent override apply', theme.rootMaxWidth === '920px' &&
    theme.stageMinHeight === 'calc(420px)' && theme.hostAccent === '#7a4bd6' && theme.primaryBg === 'rgb(122, 75, 214)',
    JSON.stringify(theme));

  await page.screenshot({ path: path.join(root, 'tests/.cache/presentation-quality-390.png') });
  check('no page/console errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  await context.close();

  // Reduced motion: no running presentation animations/focus and still advances.
  const reduced = await makePage(true);
  page = reduced.page;
  pageErrors.length = 0;
  await mount(page);
  const reducedResult = await page.evaluate(async () => {
    const session = window.__session;
    const started = performance.now();
    const run = session.next();
    const deadline = performance.now() + 6000;
    while (performance.now() < deadline && session.getState().phase !== 'idle') await new Promise((resolve) => setTimeout(resolve, 30));
    await run;
    const demo = document.querySelector('#root .nblk-demo-stage');
    return {
      phase: session.getState().phase,
      settled: session.getState().settledFrameId,
      elapsed: Math.round((performance.now() - started) * 10) / 10,
      runningAnimations: demo.getAnimations ? demo.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length : null,
      focusRoots: document.querySelectorAll('.nx-focus').length,
      nextDisabled: Array.from(demo.querySelectorAll('.note-demo__controls button')).find((b) => (b.getAttribute('aria-label') || b.textContent || '').trim() === '下一步：继续看后面的详细内容').disabled
    };
  });
  check('reduced motion advances without running animations or demo focus', reducedResult.phase === 'idle' && reducedResult.settled === 'f1' &&
    reducedResult.runningAnimations === 0 && reducedResult.focusRoots === 0, JSON.stringify(reducedResult));
  check('reduced motion check has no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  await reduced.context.close();
} finally {
  if (context && !context._closed) await context.close().catch(() => {});
}
const failed = checks.filter((item) => !item.ok).length;
for (const item of checks) console.log((item.ok ? 'PASS ' : 'FAIL ') + item.name + (item.detail ? ' :: ' + item.detail : ''));
console.log('SUMMARY ' + (checks.length - failed) + '/' + checks.length + ' passed');
await browser.close();
if (failed) process.exitCode = 1;
