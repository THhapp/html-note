#!/usr/bin/env node
/*
 * 组合注意力回归（dist 单文件预览，真实 Edge）：
 * - 下段 diagramTable next 后 focus 指向 message:<id>（几何与 note 单元区分），主报文组 gate 生效；
 * - 表格/读数辅助同步；减少动效不显示 focus 且只发 reduced 事实；运行中 reset 取消可收尾。
 *
 * Usage: node tests/checks/attention-composition-check.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const preview = path.join(root, 'dist', '流程组合-预览.html');
const previewUrl = 'file:///' + preview.replace(/\\/g, '/');

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail) });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : ' :: ' + String(detail).slice(0, 600)));
}

const browser = await chromium.launch({ executablePath: edge, headless: true });

async function openPreview(reduced) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push('pageerror: ' + error.message));
  page.on('console', (message) => { if (message.type() === 'error') pageErrors.push('console: ' + message.text()); });
  await page.goto(previewUrl, { waitUntil: 'load' });
  await page.waitForFunction(() => window.FlowCompositionSessions && window.FlowCompositionSessions.length >= 2, null, { timeout: 20000 });
  return { context, page, pageErrors };
}

/* ---------------- 正常动效：focus → message 组、gate、表格/读数同步 ---------------- */
{
  const { context, page, pageErrors } = await openPreview(false);
  const started = Date.now();
  await page.evaluate(() => {
    const session = window.FlowCompositionSessions[1].session;
    window.__attentionRec = window.NoteDemo.timingFacts.watch(session, { label: 'attention' });
    const host = session.el.parentElement;
    const button = Array.from(host.querySelectorAll('.nblk-demo-stage__controls button')).find((node) => node.textContent.trim() === '下一步');
    button.click();
  });
  await page.waitForFunction(() => window.FlowCompositionSessions[1].session.getState().phase === 'idle', null, { timeout: 10000 });
  await page.waitForTimeout(350);
  const out = await page.evaluate(() => {
    const session = window.FlowCompositionSessions[1].session;
    const host = session.el.parentElement;
    const facts = window.__attentionRec.snapshot();
    const kindOrder = facts.map((fact) => fact.kind + '|' + (fact.binding || '-') + '|' + (fact.group || (fact.groups ? fact.groups.join(',') : '')));
    const arrivalIndex = facts.findIndex((fact) => fact.kind === 'focus-arrival' && fact.binding === 'packet');
    const packetStartIndex = facts.findIndex((fact) => fact.kind === 'effect-start' && fact.binding === 'packet');
    const tableStartIndex = facts.findIndex((fact) => fact.kind === 'effect-start' && fact.binding === 'table');
    const readoutStartIndex = facts.findIndex((fact) => fact.kind === 'effect-start' && fact.binding === 'readout');
    const arrival = facts[arrivalIndex] || null;
    const packetStart = facts[packetStartIndex] || null;
    const focus = document.querySelector('.nx-focus');
    const box = focus ? focus.querySelector('.nx-focus__box') : null;
    const boxRect = box ? box.getBoundingClientRect() : null;
    const messages = Array.from(host.querySelectorAll('.nviz-flow-packetflow__message'));
    const targetMessage = host.querySelector('.nviz-flow-packetflow__message[data-id="syn"]');
    const targetRect = targetMessage ? targetMessage.getBoundingClientRect() : null;
    const noteCells = Array.from(host.querySelectorAll('td[data-col-key="note"]'));
    const noteRects = noteCells.map((cell) => cell.getBoundingClientRect());
    const row = host.querySelector('.nui-table tbody tr[data-row-key="syn"]');
    const noteCell = row ? row.querySelector('td[data-col-key="note"]') : null;
    const readout = host.querySelector('[data-demo-slot="readout"]');
    const overlapsBox = (rect) => !!boxRect && rect.left < boxRect.right && rect.right > boxRect.left && rect.top < boxRect.bottom && rect.bottom > boxRect.top;
    return {
      state: session.getState(),
      facts: facts.map((fact) => ({ kind: fact.kind, binding: fact.binding, frameId: fact.frameId, groups: fact.groups, group: fact.group, track: fact.track })),
      kindOrder: kindOrder,
      arrivalIndex: arrivalIndex, packetStartIndex: packetStartIndex, tableStartIndex: tableStartIndex, readoutStartIndex: readoutStartIndex,
      arrival: arrival, packetStart: packetStart,
      focus: focus ? {
        cls: focus.className, state: focus.getAttribute('data-nx-state'), emphasis: focus.getAttribute('data-nx-emphasis'),
        hidden: focus.getAttribute('aria-hidden'), mode: focus.getAttribute('data-nx-mode'),
        rect: focus.getBoundingClientRect ? { top: focus.getBoundingClientRect().top, left: focus.getBoundingClientRect().left } : null
      } : null,
      boxRect: boxRect ? { top: boxRect.top, left: boxRect.left, right: boxRect.right, bottom: boxRect.bottom, width: boxRect.width, height: boxRect.height } : null,
      targetRect: targetRect ? { top: targetRect.top, left: targetRect.left, right: targetRect.right, bottom: targetRect.bottom, width: targetRect.width, height: targetRect.height } : null,
      targetHidden: targetMessage ? targetMessage.getAttribute('data-hidden') : null,
      visibleMessages: messages.filter((node) => !node.getAttribute('data-hidden')).map((node) => node.getAttribute('data-id')),
      noteCells: noteCells.map((cell) => cell.textContent.trim()),
      noteOverlapsBox: noteRects.map((rect) => overlapsBox(rect)),
      attentionClassOnTable: !!host.querySelector('.nui-table .note-demo-attention'),
      rowState: row ? row.getAttribute('data-row-state') : null,
      noteCellText: noteCell ? noteCell.textContent.trim() : null,
      readout: readout ? readout.textContent.trim() : null,
      caption: session.el.querySelector('.nblk-demo-stage__caption').textContent
    };
  });
  const boxCenterY = out.boxRect ? out.boxRect.top + out.boxRect.height / 2 : NaN;
  const targetCenterY = out.targetRect ? out.targetRect.top + out.targetRect.height / 2 : NaN;
  check('attention：下段 next 后 focus 落在 message:syn', out.state.phase === 'idle' && out.state.settledFrameId === 'syn' &&
    !!out.focus && out.focus.state === 'shown' && out.focus.emphasis === 'weak' && out.focus.mode === 'box' &&
    !!out.arrival && out.arrival.frameId === 'syn' && Array.isArray(out.arrival.groups) && out.arrival.groups.indexOf('message:syn') >= 0 &&
    !!out.targetRect && out.targetHidden === null && Math.abs(boxCenterY - targetCenterY) <= 6,
    JSON.stringify({ state: out.state, focus: out.focus, arrival: out.arrival, box: out.boxRect, target: out.targetRect }).slice(0, 600));
  check('attention：focus 几何包住报文组且不落在表格 note 单元',
    !!out.boxRect && !!out.targetRect && out.boxRect.left <= out.targetRect.left + 1 && out.boxRect.right >= out.targetRect.right - 1 &&
    out.boxRect.top <= out.targetRect.top + 1 && out.boxRect.bottom >= out.targetRect.bottom - 1 &&
    out.noteOverlapsBox.every((overlap) => overlap === false) && out.attentionClassOnTable === false,
    JSON.stringify({ box: out.boxRect, target: out.targetRect, noteOverlaps: out.noteOverlapsBox, noteCells: out.noteCells }));
  check('attention：主报文组 gate 生效（focus-arrival 先于 packet effects）',
    out.arrivalIndex >= 0 && out.packetStartIndex > out.arrivalIndex &&
    !!out.packetStart && out.packetStart.group === 'message:syn' && out.packetStart.track === 'group',
    JSON.stringify({ order: out.kindOrder, arrivalIndex: out.arrivalIndex, packetStartIndex: out.packetStartIndex, packetStart: out.packetStart }));
  check('attention：表格/读数辅助同步且不参与框选',
    out.rowState === 'current' && out.noteCellText === '当前报文' && out.noteCells[0] === '当前报文' &&
    out.readout === '握手：客户端 → 服务端 SYN' && out.visibleMessages.join(',') === 'syn' &&
    out.tableStartIndex >= 0 && out.readoutStartIndex >= 0 &&
    out.caption.indexOf('SYN') >= 0,
    JSON.stringify({ rowState: out.rowState, note: out.noteCellText, readout: out.readout, visible: out.visibleMessages, caption: out.caption }));
  check('attention：正常动效区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 4).join(' | '));

  /* 运行中 reset：取消可收尾，不遗留可见 focus 框。 */
  const cancel = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const session = window.FlowCompositionSessions[1].session;
    if (window.__attentionRec) window.__attentionRec.stop();
    let promise = session.next();
    await sleep(45);
    const mid = { phase: session.getState().phase };
    let resetReturn = null, resetError = null;
    try { resetReturn = session.reset(); } catch (error) { resetError = String(error && error.message || error); }
    const resetPhase = session.getState().phase;
    let result = null;
    try { result = await Promise.race([promise, sleep(3000).then(() => ({ status: 'timeout' }))]); } catch (error) { result = { status: 'threw', error: String(error && error.message || error) }; }
    await sleep(250);
    const focus = document.querySelector('.nx-focus');
    return { mid: mid, resetPhase: resetPhase, resetError: resetError, result: result, final: session.getState(),
      focus: focus ? { state: focus.getAttribute('data-nx-state'), box: !!focus.querySelector('.nx-focus__box') } : null,
      caption: session.el.querySelector('.nblk-demo-stage__caption').textContent };
  });
  check('attention：运行中 reset 取消并回到初始停点', cancel.mid.phase === 'running' && cancel.resetError === null &&
    (cancel.resetPhase === 'running' || cancel.resetPhase === 'idle') && cancel.result && cancel.result.status === 'cancelled' &&
    cancel.final.phase === 'idle' && cancel.final.settledFrameId === 'idle' &&
    cancel.caption.indexOf('连接尚未开始') >= 0 && (!cancel.focus || cancel.focus.state === 'idle' || !cancel.focus.box),
    JSON.stringify(cancel).slice(0, 600));
  await context.close();
}

/* ---------------- 减少动效：不显示 focus，只发 reduced 事实，终态同步 ---------------- */
{
  const { context, page, pageErrors } = await openPreview(true);
  const started = Date.now();
  const result = await page.evaluate(async () => {
    const session = window.FlowCompositionSessions[1].session;
    window.__reducedRec = window.NoteDemo.timingFacts.watch(session, { label: 'reduced-attention' });
    const host = session.el.parentElement;
    const button = Array.from(host.querySelectorAll('.nblk-demo-stage__controls button')).find((node) => node.textContent.trim() === '下一步');
    button.click();
    return { host: host };
  }).catch((error) => ({ error: String(error) }));
  await page.waitForFunction(() => window.FlowCompositionSessions[1].session.getState().phase === 'idle', null, { timeout: 10000 });
  const elapsed = Date.now() - started;
  const out = await page.evaluate(() => {
    const session = window.FlowCompositionSessions[1].session;
    const host = session.el.parentElement;
    return {
      state: session.getState(),
      facts: window.__reducedRec ? window.__reducedRec.snapshot().map((fact) => ({ kind: fact.kind, binding: fact.binding, frameId: fact.frameId })) : [],
      focusCount: document.querySelectorAll('.nx-focus').length,
      messages: Array.from(host.querySelectorAll('.nviz-flow-packetflow__message')).filter((node) => !node.getAttribute('data-hidden')).map((node) => node.getAttribute('data-id')),
      currentRows: Array.from(host.querySelectorAll('.nui-table tbody tr')).filter((row) => row.getAttribute('data-row-state') === 'current').map((row) => row.getAttribute('data-row-key')),
      readout: host.querySelector('[data-demo-slot="readout"]') ? host.querySelector('[data-demo-slot="readout"]').textContent.trim() : null,
      caption: session.el.querySelector('.nblk-demo-stage__caption').textContent
    };
  });
  const kinds = out.facts.map((fact) => fact.kind);
  check('attention：减少动效只发 reduced 事实、不启动 effects', kinds.indexOf('reduced') >= 0 &&
    kinds.indexOf('effect-start') < 0 && kinds.indexOf('focus-arrival') < 0 &&
    kinds.indexOf('ready') < 0 && kinds.indexOf('finished') < 0 && out.facts.every((fact) => fact.frameId === 'syn'),
    JSON.stringify(out.facts));
  check('attention：减少动效不创建/显示 focus 框', out.focusCount === 0 && out.state.phase === 'idle' && out.state.settledFrameId === 'syn',
    JSON.stringify({ focusCount: out.focusCount, state: out.state }));
  check('attention：减少动效终态同步（报文/表格/读数）', out.messages.join(',') === 'syn' && out.currentRows.join(',') === 'syn' &&
    out.readout === '握手：客户端 → 服务端 SYN' && out.caption.indexOf('SYN') >= 0 && elapsed < 1500,
    JSON.stringify({ messages: out.messages, rows: out.currentRows, readout: out.readout, elapsed: elapsed }));
  check('attention：减少动效区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 4).join(' | '));
  await context.close();
}

await browser.close();
const failed = checks.filter((row) => !row.ok);
console.log('SUMMARY ' + (checks.length - failed.length) + '/' + checks.length + ' passed');
if (failed.length) process.exitCode = 1;
