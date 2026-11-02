#!/usr/bin/env node
/*
 * Flow 几何与更新稳定性回归（src 直载，真实 Edge）。
 * - StageTrack 在 1280/900 宽度：圆点圆心 = 连接线中心（<0.5px），目标徽标显隐不改轨道高度；
 * - PacketFlow visibleCount 1 → 全部：viewBox/height/宿主高度不变；
 * - 同模型 update 不应无条件重写 DOM（MutationObserver，四图形，device 必测）。
 *
 * Usage: node tests/checks/flow-geometry-check.mjs
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
const MODULES = ['core', 'viz-flow'];
const STYLES = moduleStyles(root, MODULES);
const SCRIPTS = moduleScripts(root, MODULES);

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail) });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : ' :: ' + String(detail).slice(0, 600)));
}

const browser = await chromium.launch({ executablePath: edge, headless: true });
const pageErrors = [];

async function makePage(width) {
  const context = await browser.newContext({ viewport: { width: width, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(width + ' pageerror: ' + error.message));
  page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(width + ' console: ' + message.text()); });
  await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}body{padding:16px;background:#f4f6f9}#root{width:100%;max-width:' + (width === 1280 ? 1180 : 820) + 'px;margin:0 auto}.geo-host{margin:0 0 20px}</style></head><body><main id="root"></main></body></html>');
  for (const rel of STYLES) await page.addStyleTag({ path: src(rel) });
  for (const rel of SCRIPTS) await page.addScriptTag({ path: src(rel) });
  return { context, page };
}

/* ---------- StageTrack 1280 / 900 圆心与连接线中心 ---------- */
for (const width of [1280, 900]) {
  const { context, page } = await makePage(width);
  const out = await page.evaluate(() => {
    const result = { bad: [], sample: null, badge: null };
    const host = document.createElement('div');
    host.className = 'geo-host';
    document.getElementById('root').appendChild(host);
    const track = window.NoteViz.Flow.StageTrack.mount(host, {
      label: '几何检查',
      stages: [{ id: 's1', label: '准备' }, { id: 's2', label: '校验' }, { id: 's3', label: '执行' }, { id: 's4', label: '确认' }],
      current: 's2', target: 's3', skipped: [], failed: []
    });
    function lineCenter(stageNode) {
      const style = getComputedStyle(stageNode, '::before');
      const stageRect = stageNode.getBoundingClientRect();
      const top = parseFloat(style.top);
      const height = parseFloat(style.height);
      return {
        stageRect: stageRect,
        lineY: stageRect.top + top + height / 2,
        lineX: stageRect.left + stageRect.width / 2,
        lineWidth: stageRect.width,
        lineLeft: stageRect.left,
        top: top, height: height
      };
    }
    const stages = Array.from(track.el.querySelectorAll('.nviz-flow-stagetrack__stage'));
    stages.forEach((stageNode, index) => {
      if (index === 0) return;
      const node = stageNode.querySelector('.nviz-flow-stagetrack__node');
      const nodeRect = node.getBoundingClientRect();
      const line = lineCenter(stageNode);
      const circleX = nodeRect.left + nodeRect.width / 2;
      const circleY = nodeRect.top + nodeRect.height / 2;
      const dx = Math.abs(circleX - line.lineX);
      const dy = Math.abs(circleY - line.lineY);
      if (!result.sample) result.sample = { index: index, dx: dx, dy: dy, nodeRect: { left: nodeRect.left, top: nodeRect.top, w: nodeRect.width, h: nodeRect.height }, line: line };
      if (dx > 0.5 || dy > 0.5) result.bad.push({ index: index, id: stageNode.getAttribute('data-id'), dx: dx, dy: dy, lineTop: line.top, lineHeight: line.height });
    });
    const rootHeight = track.el.getBoundingClientRect().height;
    const stageHeights = stages.map((node) => node.getBoundingClientRect().height);
    const badge = track.getTarget('s3').querySelector('.nviz-flow-stagetrack__badge');
    const badgeHeight = badge ? badge.getBoundingClientRect().height : 0;
    track.update({ target: null });
    const rootHeightNoTarget = track.el.getBoundingClientRect().height;
    const stageHeightsNoTarget = Array.from(track.el.querySelectorAll('.nviz-flow-stagetrack__stage')).map((node) => node.getBoundingClientRect().height);
    result.badge = { rootHeight: rootHeight, rootHeightNoTarget: rootHeightNoTarget, stageHeights: stageHeights, stageHeightsNoTarget: stageHeightsNoTarget, badgeHeight: badgeHeight };
    result.stageCount = stages.length;
    result.rootHeight = rootHeight;
    track.destroy();
    host.remove();
    return result;
  });
  check(width + '：StageTrack 圆点圆心与连接线中心偏差 <0.5px', out.bad.length === 0 && out.stageCount >= 2 && !!out.sample,
    JSON.stringify({ bad: out.bad, sample: out.sample, stageCount: out.stageCount }).slice(0, 600));
  const heightsStable = Math.abs(out.badge.rootHeight - out.badge.rootHeightNoTarget) <= 0.5 &&
    out.badge.stageHeights.every((height, index) => Math.abs(height - out.badge.stageHeightsNoTarget[index]) <= 0.5);
  check(width + '：目标徽标显隐不改变轨道/阶段高度', heightsStable && out.badge.badgeHeight > 0,
    JSON.stringify({ root: [out.badge.rootHeight, out.badge.rootHeightNoTarget], stages: [out.badge.stageHeights, out.badge.stageHeightsNoTarget] }));

  /* PacketFlow viewBox/height 不随显现变化 */
  const packet = await page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 'geo-host';
    document.getElementById('root').appendChild(host);
    const participants = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
    const messages = Array.from({ length: 5 }, (_, index) => ({ id: 'm' + (index + 1), from: index % 2 ? 'b' : 'a', to: index % 2 ? 'a' : 'b', label: '消息 ' + (index + 1) }));
    const component = window.NoteViz.Flow.PacketFlow.mount(host, { participants: participants, messages: messages, visibleCount: 1, focus: 'm1', label: '几何' });
    const svg = component.el.querySelector('.nviz-flow-packetflow__svg');
    const hostHeight = host.getBoundingClientRect().height;
    const before = { viewBox: svg.getAttribute('viewBox'), height: svg.getBoundingClientRect().height, hostHeight: hostHeight, attrHeight: svg.getAttribute('height') };
    component.update({ visibleCount: messages.length });
    const after = { viewBox: svg.getAttribute('viewBox'), height: svg.getBoundingClientRect().height, hostHeight: host.getBoundingClientRect().height, attrHeight: svg.getAttribute('height') };
    component.update({ visibleCount: 1 });
    const back = { viewBox: svg.getAttribute('viewBox'), height: svg.getBoundingClientRect().height, hostHeight: host.getBoundingClientRect().height };
    component.destroy();
    host.remove();
    return { before: before, after: after, back: back };
  });
  check(width + '：PacketFlow visibleCount 1→全部 viewBox/height/宿主高度不变',
    packet.before.viewBox === packet.after.viewBox && packet.before.viewBox === packet.back.viewBox &&
    Math.abs(packet.before.height - packet.after.height) <= 0.5 && Math.abs(packet.before.hostHeight - packet.after.hostHeight) <= 0.5 &&
    Math.abs(packet.before.height - packet.back.height) <= 0.5 && Math.abs(packet.before.hostHeight - packet.back.hostHeight) <= 0.5,
    JSON.stringify(packet));

  /* 同模型 update 不重写 DOM（MutationObserver，四图形） */
  const mutationOut = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const results = [];
    function observe(host, component, label) {
      const records = [];
      const observer = new MutationObserver((list) => records.push.apply(records, list));
      observer.observe(host, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true, characterDataOldValue: true });
      component.update(component.getState());
      return frames().then(() => sleep(60)).then(() => {
        observer.disconnect();
        results.push({ label: label, count: records.length, sample: records.slice(0, 5).map((record) => ({ type: record.type, target: record.target && (record.target.className && String(record.target.className).slice(0, 60) || record.target.nodeName), attributeName: record.attributeName, oldValue: record.oldValue, added: record.addedNodes && record.addedNodes.length, removed: record.removedNodes && record.removedNodes.length })) });
      });
    }
    const rootEl = document.getElementById('root');
    function host() { const node = document.createElement('div'); node.className = 'geo-host'; rootEl.appendChild(node); return node; }
    const Flow = window.NoteViz.Flow;
    const stageHost = host();
    const stage = Flow.StageTrack.mount(stageHost, { stages: [{ id: 's1', label: '一' }, { id: 's2', label: '二' }, { id: 's3', label: '三' }], current: 's2', target: 's3', skipped: [], failed: [] });
    await observe(stageHost, stage, 'StageTrack');
    stage.destroy(); stageHost.remove();
    const packetHost = host();
    const packet = Flow.PacketFlow.mount(packetHost, {
      participants: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      messages: [{ id: 'm1', from: 'a', to: 'b', label: '一' }, { id: 'm2', from: 'b', to: 'a', label: '二' }],
      visibleCount: 2, focus: 'm2', label: '消息'
    });
    await observe(packetHost, packet, 'PacketFlow');
    packet.destroy(); packetHost.remove();
    const segmentHost = host();
    const segment = Flow.SegmentBar.mount(segmentHost, {
      segments: [{ id: 's1', label: 'A', value: 10 }, { id: 's2', label: 'B', value: 30 }, { id: 's3', label: 'C', value: 0 }],
      scaleMax: 40, minWidth: 18, label: '段条'
    });
    await observe(segmentHost, segment, 'SegmentBar');
    segment.destroy(); segmentHost.remove();
    const deviceHost = host();
    const device = Flow.DeviceLinks.mount(deviceHost, {
      devices: [{ id: 'a', label: 'A', ports: [{ id: 'out', label: 'OUT' }] }, { id: 'b', label: 'B', ports: [{ id: 'in', label: 'IN' }] }],
      links: [{ id: 'link-ab', from: { device: 'a', port: 'out' }, to: { device: 'b', port: 'in' }, label: 'A→B', status: 'active' }],
      label: '连接'
    });
    await observe(deviceHost, device, 'DeviceLinks');
    device.destroy(); deviceHost.remove();
    return results;
  });
  for (const result of mutationOut) {
    check(width + '：同模型 update 无 DOM 重写（' + result.label + '）', result.count === 0, JSON.stringify(result));
  }
  check(width + '：几何区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  await context.close();
}

await browser.close();
const failed = checks.filter((row) => !row.ok);
console.log('SUMMARY ' + (checks.length - failed.length) + '/' + checks.length + ' passed');
if (failed.length) process.exitCode = 1;
