#!/usr/bin/env node
/*
 * 密度配置回归（src 直载 + dist 预览，真实 Edge）。
 * - PacketFlow normal vs compact：viewBox/height/首行/行距真实变化，1→N 显现稳定，可运行时切换；
 * - StageTrack compact：高度/内边距缩小、圆心=线中心、徽标槽保留；
 * - recipe stagePacket/diagramTable density:'compact'：class/padding/readout/head 缩小，无 min-height/fixed/内部滚动；
 * - flow-composition 使用 compact 且区域 head/meta 为 0；
 * - 稳定舞台内组件 update({density}) normal→compact→normal：stage 预留重新测量/回缩，不死锁旧大预留。
 *
 * Usage: node tests/checks/density-config-check.mjs
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
const MODULES = ['core', 'legacy', 'ui-layout', 'viz-flow', 'blocks-base', 'demo-stage', 'blocks', 'demo-runtime', 'demo-ui'];
const STYLES = moduleStyles(root, MODULES);
const SCRIPTS = moduleScripts(root, MODULES);
const previewUrl = 'file:///' + path.join(root, 'dist', '流程组合-预览.html').replace(/\\/g, '/');

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail) });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : ' :: ' + String(detail).slice(0, 700)));
}

const browser = await chromium.launch({ executablePath: edge, headless: true });
const pageErrors = [];
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on('pageerror', (error) => pageErrors.push('pageerror: ' + error.message));
page.on('console', (message) => { if (message.type() === 'error') pageErrors.push('console: ' + message.text()); });
await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}body{padding:16px;background:#f4f6f9}#root{max-width:1000px;margin:0 auto}.density-host{margin:0 0 18px}</style></head><body><main id="root"></main></body></html>');
for (const rel of STYLES) await page.addStyleTag({ path: src(rel) });
for (const rel of SCRIPTS) await page.addScriptTag({ path: src(rel) });

/* ---------------- A. PacketFlow normal vs compact ---------------- */
const packetOut = await page.evaluate(() => {
  const out = {};
  const host = document.createElement('div');
  host.className = 'density-host';
  document.getElementById('root').appendChild(host);
  const participants = [{ id: 'a', label: 'A', note: '发起' }, { id: 'b', label: 'B', note: '接收' }];
  const messages = Array.from({ length: 5 }, (_, index) => ({ id: 'm' + (index + 1), from: index % 2 ? 'b' : 'a', to: index % 2 ? 'a' : 'b', label: '消息 ' + (index + 1) }));
  function read(component) {
    const svg = component.el.querySelector('.nviz-flow-packetflow__svg');
    const firstMessage = component.getTarget('message:m1');
    const label = firstMessage.querySelector('.nviz-flow-packetflow__message-label');
    const participantBox = component.el.querySelector('.nviz-flow-packetflow__participant-box');
    const secondLabel = component.getTarget('message:m2').querySelector('.nviz-flow-packetflow__message-label');
    return {
      viewBox: svg.getAttribute('viewBox'),
      svgHeight: +svg.getBoundingClientRect().height.toFixed(2),
      hostHeight: +host.getBoundingClientRect().height.toFixed(2),
      firstY: label ? Number(label.getAttribute('y')) : null,
      secondY: secondLabel ? Number(secondLabel.getAttribute('y')) : null,
      boxHeight: participantBox ? Number(participantBox.getAttribute('height')) : null,
      rootClass: component.el.className,
      dataDensity: component.el.getAttribute('data-density')
    };
  }
  const normal = window.NoteViz.Flow.PacketFlow.mount(host, { participants: participants, messages: messages, visibleCount: 1, focus: 'm1', density: 'normal', label: 'normal' });
  const normalRead = read(normal);
  normal.update({ visibleCount: messages.length });
  const normalAll = read(normal);
  normal.update({ visibleCount: 1 });
  const normalBack = read(normal);
  normal.destroy();
  host.remove();
  const compactHost = document.createElement('div');
  compactHost.className = 'density-host';
  document.getElementById('root').appendChild(compactHost);
  const compact = window.NoteViz.Flow.PacketFlow.mount(compactHost, { participants: participants, messages: messages, visibleCount: 1, focus: 'm1', density: 'compact', label: 'compact' });
  const compactRead = read(compact);
  compact.update({ visibleCount: messages.length });
  const compactAll = read(compact);
  compact.update({ density: 'normal' });
  const compactToNormal = read(compact);
  compact.update({ density: 'compact' });
  const compactAgain = read(compact);
  compact.destroy();
  compactHost.remove();
  return { normal: normalRead, normalAll: normalAll, normalBack: normalBack, compact: compactRead, compactAll: compactAll, compactToNormal: compactToNormal, compactAgain: compactAgain };
});
const normalView = packetOut.normal.viewBox;
const compactView = packetOut.compact.viewBox;
const normalHeight = Number(String(normalView).split(' ')[3]);
const compactHeight = Number(String(compactView).split(' ')[3]);
check('PacketFlow compact：viewBox/height/首行/行距真实变小', normalView !== compactView &&
  compactHeight < normalHeight && normalHeight - compactHeight >= 50 &&
  packetOut.compact.svgHeight < packetOut.normal.svgHeight &&
  packetOut.compact.boxHeight === 52 && packetOut.normal.boxHeight === 64 &&
  packetOut.compact.firstY < packetOut.normal.firstY &&
  (packetOut.normal.secondY - packetOut.normal.firstY) === 56 &&
  (packetOut.compact.secondY - packetOut.compact.firstY) === 48 &&
  packetOut.compact.dataDensity === 'compact' && packetOut.normal.dataDensity === 'normal' &&
  packetOut.compact.rootClass.indexOf('nviz-flow-packetflow--compact') >= 0,
  JSON.stringify(packetOut).slice(0, 700));
check('PacketFlow 两种密度下 visibleCount 1→N 的 viewBox/height/宿主高度稳定',
  packetOut.normal.viewBox === packetOut.normalAll.viewBox && packetOut.normal.viewBox === packetOut.normalBack.viewBox &&
  packetOut.compact.viewBox === packetOut.compactAll.viewBox &&
  Math.abs(packetOut.normal.svgHeight - packetOut.normalAll.svgHeight) <= 0.5 &&
  Math.abs(packetOut.compact.svgHeight - packetOut.compactAll.svgHeight) <= 0.5 &&
  Math.abs(packetOut.normal.hostHeight - packetOut.normalAll.hostHeight) <= 0.5 &&
  Math.abs(packetOut.compact.hostHeight - packetOut.compactAll.hostHeight) <= 0.5,
  JSON.stringify({ normal: [packetOut.normal.viewBox, packetOut.normalAll.viewBox], compact: [packetOut.compact.viewBox, packetOut.compactAll.viewBox] }));
check('PacketFlow 运行时 density 切换重算 viewBox 并可回到原密度',
  packetOut.compactToNormal.dataDensity === 'normal' && packetOut.compactToNormal.viewBox === packetOut.normal.viewBox &&
  packetOut.compactAgain.dataDensity === 'compact' && packetOut.compactAgain.viewBox === packetOut.compact.viewBox,
  JSON.stringify({ normal: packetOut.normal.viewBox, toNormal: packetOut.compactToNormal.viewBox, again: packetOut.compactAgain.viewBox }));

/* ---------------- B. StageTrack compact ---------------- */
const stageOut = await page.evaluate(() => {
  const host = document.createElement('div');
  host.className = 'density-host';
  document.getElementById('root').appendChild(host);
  const stages = [{ id: 's1', label: '准备' }, { id: 's2', label: '校验' }, { id: 's3', label: '执行' }];
  function read(component) {
    const rootNode = component.el;
    const stageNode = rootNode.querySelector('.nviz-flow-stagetrack__stage');
    const node = stageNode.querySelector('.nviz-flow-stagetrack__node');
    const badge = stageNode.querySelector('.nviz-flow-stagetrack__badge');
    const style = getComputedStyle(stageNode, '::before');
    const nodeRect = node.getBoundingClientRect();
    const stageRect = stageNode.getBoundingClientRect();
    const badgeStyle = getComputedStyle(badge);
    return {
      rootHeight: +rootNode.getBoundingClientRect().height.toFixed(2),
      rootPaddingTop: parseFloat(getComputedStyle(rootNode).paddingTop),
      stagePaddingTop: parseFloat(getComputedStyle(stageNode).paddingTop),
      dataDensity: rootNode.getAttribute('data-density'),
      compactClass: rootNode.classList.contains('nviz-flow-stagetrack--compact'),
      nodeHeight: +nodeRect.height.toFixed(2),
      badgeHeight: +badge.getBoundingClientRect().height.toFixed(2),
      badgeVisibility: badgeStyle.visibility,
      badgeEmpty: badge.getAttribute('data-empty'),
      circleLineDelta: Math.abs((nodeRect.top + nodeRect.height / 2) - (stageRect.top + parseFloat(style.top) + parseFloat(style.height) / 2))
    };
  }
  const normal = window.NoteViz.Flow.StageTrack.mount(host, { stages: stages, current: 's2', target: null, skipped: [], failed: [], density: 'normal', label: 'normal' });
  const normalRead = read(normal);
  normal.update({ target: 's3' });
  const normalTarget = read(normal);
  normal.destroy();
  host.remove();
  const compactHost = document.createElement('div');
  compactHost.className = 'density-host';
  document.getElementById('root').appendChild(compactHost);
  const compact = window.NoteViz.Flow.StageTrack.mount(compactHost, { stages: stages, current: 's2', target: 's3', skipped: [], failed: [], density: 'compact', label: 'compact' });
  const compactRead = read(compact);
  compact.update({ target: null });
  const compactNoTarget = read(compact);
  compact.destroy();
  compactHost.remove();
  return { normal: normalRead, normalTarget: normalTarget, compact: compactRead, compactNoTarget: compactNoTarget };
});
check('StageTrack compact：高度/内边距缩小且徽标槽保留',
  stageOut.compact.rootHeight < stageOut.normal.rootHeight &&
  stageOut.compact.rootPaddingTop === 8 && stageOut.normal.rootPaddingTop === 12 &&
  stageOut.compact.stagePaddingTop === 4 && stageOut.normal.stagePaddingTop === 6 &&
  stageOut.compact.dataDensity === 'compact' && stageOut.compact.compactClass &&
  stageOut.compact.nodeHeight === stageOut.normal.nodeHeight &&
  stageOut.compact.badgeHeight > 0 && stageOut.compact.badgeVisibility === 'hidden' && stageOut.compact.badgeEmpty === 'true' &&
  Math.abs(stageOut.compact.rootHeight - stageOut.compactNoTarget.rootHeight) <= 0.5 &&
  Math.abs(stageOut.normal.rootHeight - stageOut.normalTarget.rootHeight) <= 0.5,
  JSON.stringify(stageOut).slice(0, 700));
check('StageTrack compact：圆心=连接线中心（<0.5px）', stageOut.compact.circleLineDelta < 0.5 && stageOut.normal.circleLineDelta < 0.5,
  JSON.stringify({ compact: stageOut.compact.circleLineDelta, normal: stageOut.normal.circleLineDelta }));

/* ---------------- C. recipe stagePacket / diagramTable compact ---------------- */
const recipeOut = await page.evaluate(() => {
  const dummy = { bindings: {}, frames: [], transitions: [] };
  function build(recipeName, density, withHead) {
    const host = document.createElement('div');
    host.className = 'density-host';
    document.getElementById('root').appendChild(host);
    const regions = recipeName === 'stagePacket'
      ? { stage: { slot: 'stage', title: withHead ? '阶段' : undefined, meta: withHead ? '说明' : undefined },
          packet: { slot: 'packet' }, readout: { slot: 'readout' } }
      : { diagram: { slot: 'packet', title: withHead ? '报文' : undefined, meta: withHead ? '说明' : undefined },
          table: { slot: 'table' }, readout: { slot: 'readout' } };
    const recipe = window.NoteDemoRecipes[recipeName](Object.assign({ definition: dummy, density: density }, regions));
    const layout = recipe.layout(host);
    const root = layout.root;
    const board = root.querySelector('.nd-recipe__board');
    const readout = root.querySelector('.nd-recipe__readout');
    const slot = root.querySelector('.nd-recipe__slot');
    const head = root.querySelector('.nd-recipe__head');
    const result = {
      rootClass: root.className,
      rootHeight: +root.getBoundingClientRect().height.toFixed(2),
      rootGap: parseFloat(getComputedStyle(root).gap),
      boardPadding: getComputedStyle(board).padding,
      readoutPadding: getComputedStyle(readout).padding,
      headCount: root.querySelectorAll('.nd-recipe__head').length,
      titleCount: root.querySelectorAll('.nd-recipe__title').length,
      headMarginBottom: head ? parseFloat(getComputedStyle(head).marginBottom) : null,
      rootMinHeight: getComputedStyle(root).minHeight,
      boardMinHeight: getComputedStyle(board).minHeight,
      boardHeightStyle: board.style.height,
      boardOverflow: getComputedStyle(board).overflow,
      slotOverflow: getComputedStyle(slot).overflow,
      rootScrolls: root.scrollHeight > root.clientHeight + 1,
      boardScrolls: board.scrollHeight > board.clientHeight + 1
    };
    layout.cleanup();
    host.remove();
    return result;
  }
  return {
    stageDefault: build('stagePacket', 'default', false),
    stageCompact: build('stagePacket', 'compact', false),
    diagramDefault: build('diagramTable', 'default', false),
    diagramCompact: build('diagramTable', 'compact', false),
    stageHeadDefault: build('stagePacket', 'default', true),
    stageHeadCompact: build('stagePacket', 'compact', true),
    diagramHeadDefault: build('diagramTable', 'default', true),
    diagramHeadCompact: build('diagramTable', 'compact', true)
  };
});
for (const name of ['stagePacket', 'diagramTable']) {
  const def = recipeOut[name === 'stagePacket' ? 'stageDefault' : 'diagramDefault'];
  const compact = recipeOut[name === 'stagePacket' ? 'stageCompact' : 'diagramCompact'];
  check('recipe ' + name + ' compact：class/padding/readout/head 空间缩小',
    compact.rootClass.indexOf('nd-recipe--compact') >= 0 && compact.rootClass.indexOf('nd-recipe--' + (name === 'stagePacket' ? 'stage-packet' : 'diagram-table')) >= 0 &&
    compact.rootHeight < def.rootHeight && compact.rootGap < def.rootGap &&
    compact.boardPadding === '8px 10px' && def.boardPadding === '12px 14px' &&
    compact.readoutPadding === '6px 10px' && def.readoutPadding === '10px 13px' &&
    compact.headCount === 0 && compact.titleCount === 0,
    JSON.stringify({ default: def, compact: compact }).slice(0, 700));
  const headDef = recipeOut[name === 'stagePacket' ? 'stageHeadDefault' : 'diagramHeadDefault'];
  const headCompact = recipeOut[name === 'stagePacket' ? 'stageHeadCompact' : 'diagramHeadCompact'];
  check('recipe ' + name + ' compact：区域 head 行距缩小',
    headDef.headCount === 1 && headCompact.headCount === 1 &&
    headDef.headMarginBottom === 10 && headCompact.headMarginBottom === 4,
    JSON.stringify({ defaultHead: headDef.headMarginBottom, compactHead: headCompact.headMarginBottom }));
  check('recipe ' + name + ' compact：无 min-height/fixed/内部滚动',
    (compact.rootMinHeight === '0px' || compact.rootMinHeight === 'auto' || compact.rootMinHeight === 'none') &&
    (compact.boardMinHeight === '0px' || compact.boardMinHeight === 'auto' || compact.boardMinHeight === 'none') &&
    compact.boardHeightStyle === '' && compact.boardOverflow !== 'auto' && compact.boardOverflow !== 'scroll' &&
    compact.slotOverflow !== 'auto' && compact.slotOverflow !== 'scroll' &&
    compact.rootScrolls === false && compact.boardScrolls === false,
    JSON.stringify(compact));
}

/* ---------------- D. flow-composition 使用 compact 且区域 head/meta 为 0 ---------------- */
{
  const previewContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const previewPage = await previewContext.newPage();
  const previewErrors = [];
  previewPage.on('pageerror', (error) => previewErrors.push('pageerror: ' + error.message));
  previewPage.on('console', (message) => { if (message.type() === 'error') previewErrors.push('console: ' + message.text()); });
  await previewPage.goto(previewUrl, { waitUntil: 'load' });
  await previewPage.waitForFunction(() => window.FlowCompositionSessions && window.FlowCompositionSessions.length >= 2, null, { timeout: 20000 });
  const out = await previewPage.evaluate(() => {
    const hosts = Array.from(document.querySelectorAll('[data-flow-host]'));
    const recipes = hosts.map((host) => host.querySelector('.nd-recipe'));
    const boards = hosts.flatMap((host) => Array.from(host.querySelectorAll('.nd-recipe__board')));
    const readouts = hosts.flatMap((host) => Array.from(host.querySelectorAll('.nd-recipe__readout')));
    return {
      hostCount: hosts.length,
      recipeCount: recipes.length,
      compactCount: recipes.filter((recipe) => recipe && recipe.classList.contains('nd-recipe--compact')).length,
      nonCompactCount: recipes.filter((recipe) => recipe && !recipe.classList.contains('nd-recipe--compact')).length,
      headCount: hosts.reduce((sum, host) => sum + host.querySelectorAll('.nd-recipe__head').length, 0),
      titleCount: hosts.reduce((sum, host) => sum + host.querySelectorAll('.nd-recipe__title').length, 0),
      metaCount: hosts.reduce((sum, host) => sum + host.querySelectorAll('.nd-recipe__meta').length, 0),
      compactDensityCount: hosts.reduce((sum, host) => sum + host.querySelectorAll('[data-density="compact"]').length, 0),
      boardPadding: boards.length ? getComputedStyle(boards[0]).padding : null,
      readoutPadding: readouts.length ? getComputedStyle(readouts[0]).padding : null,
      scrolls: boards.some((board) => board.scrollHeight > board.clientHeight + 1)
    };
  });
  check('flow-composition 使用 compact 且区域 head/meta 为 0', out.hostCount === 2 && out.recipeCount === 2 &&
    out.compactCount === 2 && out.nonCompactCount === 0 && out.headCount === 0 && out.titleCount === 0 && out.metaCount === 0 &&
    out.compactDensityCount >= 3 && out.boardPadding === '8px 10px' && out.readoutPadding === '6px 10px' && out.scrolls === false,
    JSON.stringify(out));
  check('density-config 预览区无页面/控制台错误', previewErrors.length === 0, previewErrors.slice(0, 4).join(' | '));
  await previewContext.close();
}

/* ---------------- E. 稳定舞台内组件 update({density}) 重新测量/回缩 ---------------- */
{
  const out = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const rootEl = document.getElementById('root');
    const host = document.createElement('div');
    rootEl.appendChild(host);
    const layout = (container) => {
      const wrap = document.createElement('div');
      const main = document.createElement('div');
      const slot = document.createElement('div');
      wrap.append(main, slot);
      container.appendChild(wrap);
      return { root: wrap, slots: { main: main, m: slot } };
    };
    const adapter = {
      name: 'density-relayout-probe', sceneModes: ['cut', 'update'], defaultSceneMode: 'update',
      normalizeView: function () { return { model: { label: '阶段' }, cues: {} }; },
      mount: function (mountHost) {
        const component = window.NoteViz.Flow.StageTrack.mount(mountHost, {
          label: '阶段', density: 'normal',
          stages: [{ id: 's1', label: '准备' }, { id: 's2', label: '校验' }, { id: 's3', label: '执行' }],
          current: 's2', target: 's3', skipped: [], failed: []
        });
        window.__densityRelayoutComponent = component;
        return {
          restore: function () {}, readView: function () { return { model: { label: '阶段' }, cues: {} }; },
          target: function (query) { return query && query.part === 'root' ? component.el : null; },
          prepareChange: function () { return { commit: function () {}, effects: function () { return []; }, cleanup: function () {} }; },
          destroy: function () { component.destroy(); }
        };
      }
    };
    const session = window.NoteDemo.mount(host, {
      definition: {
        bindings: { m: { adapter: 'density-relayout-probe', slot: 'm' } },
        frames: [
          { id: 'f0', caption: '密度切换检查', views: { m: { label: '阶段' } }, marks: [] },
          { id: 'f1', caption: '密度切换检查', views: { m: { label: '阶段' } }, marks: [] }
        ],
        transitions: [{ from: 'f0', to: 'f1', scene: { bindings: [{ binding: 'm', mode: 'cut' }] } }]
      },
      adapters: { 'density-relayout-probe': adapter }, layout: layout, label: 'density relayout'
    });
    await sleep(500);
    const stageBox = host.querySelector('.nblk-demo-stage__stage');
    const read = () => ({
      minHeight: stageBox.style.minHeight, height: +stageBox.getBoundingClientRect().height.toFixed(2),
      dataDensity: window.__densityRelayoutComponent.el.getAttribute('data-density')
    });
    const normal = read();
    window.__densityRelayoutComponent.update({ density: 'compact' });
    await sleep(450);
    const compact = read();
    window.__densityRelayoutComponent.update({ density: 'normal' });
    await sleep(450);
    const backNormal = read();
    window.__densityRelayoutComponent.update({ density: 'compact' });
    await sleep(450);
    const compactAgain = read();
    const destroyed = session.destroy();
    host.remove();
    return { normal: normal, compact: compact, backNormal: backNormal, compactAgain: compactAgain };
  });
  check('稳定舞台 update({density})：预留重新测量/回缩、不死锁旧大预留',
    out.normal.dataDensity === 'normal' && out.compact.dataDensity === 'compact' &&
    out.compact.height <= out.normal.height - 10 && out.compact.minHeight !== out.normal.minHeight &&
    Math.abs(out.backNormal.height - out.normal.height) <= 1 && out.backNormal.dataDensity === 'normal' &&
    Math.abs(out.compactAgain.height - out.compact.height) <= 1 && out.compactAgain.height <= out.normal.height - 10,
    JSON.stringify(out));
}

check('density-config 区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
await context.close();
await browser.close();
const failed = checks.filter((row) => !row.ok);
console.log('SUMMARY ' + (checks.length - failed.length) + '/' + checks.length + ' passed');
if (failed.length) process.exitCode = 1;
