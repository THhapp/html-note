#!/usr/bin/env node
/*
 * NoteViz.Flow 独立图形模块回归（src 直载，真实 Edge）。
 * 覆盖：四个部件独立 mount、稳定 ID 与 update 复用、getTarget 分支、
 * StageTrack 状态/目标/显式旁路、PacketFlow 逐步显现与方向、
 * SegmentBar 零长度/显示尺度分离、DeviceLinks getLinkPath/pointAt；
 * 无页面/控制台错误。
 *
 * Usage: node tests/checks/flow-kit-check.mjs
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
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : ' :: ' + String(detail).slice(0, 500)));
}

const browser = await chromium.launch({ executablePath: edge, headless: true });
const context = await browser.newContext({ viewport: { width: 1200, height: 1100 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push('pageerror: ' + error.message));
page.on('console', (message) => { if (message.type() === 'error') pageErrors.push('console: ' + message.text()); });
await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}body{padding:16px;background:#f4f6f9}#root{max-width:1000px;margin:0 auto}</style></head><body><main id="root"></main></body></html>');
for (const rel of STYLES) await page.addStyleTag({ path: src(rel) });
for (const rel of SCRIPTS) await page.addScriptTag({ path: src(rel) });

const rows = await page.evaluate(() => {
  const out = [];
  const check = (name, ok, detail) => out.push({ name: name, ok: !!ok, detail: detail == null ? '' : String(detail) });
  const rootEl = document.getElementById('root');
  function host() { const node = document.createElement('div'); rootEl.appendChild(node); return node; }
  const Flow = window.NoteViz && window.NoteViz.Flow;
  check('导出 window.NoteViz.Flow 四个部件', !!Flow && Flow.version === '1.0.0' &&
    ['StageTrack', 'PacketFlow', 'SegmentBar', 'DeviceLinks'].every((name) => Flow[name] && typeof Flow[name].mount === 'function'),
    JSON.stringify(Object.keys(Flow || {})));

  /* ---------- StageTrack ---------- */
  const stageHost = host();
  const stages = [
    { id: 's1', label: '准备' }, { id: 's2', label: '校验' }, { id: 's3', label: '执行' },
    { id: 's4', label: '确认' }, { id: 's5', label: '收尾' }
  ];
  const stage = Flow.StageTrack.mount(stageHost, {
    label: '阶段轨', stages: stages,
    current: 's3', target: 's4', skipped: ['s2'], failed: [],
    bypass: [{ from: 's2', to: 's4', label: '显式旁路' }]
  });
  const stageTarget = (id) => stage.getTarget(id);
  check('StageTrack 稳定 ID 与状态', stage.el.classList.contains('nviz-flow-stagetrack') &&
    stageTarget('s3').getAttribute('data-status') === 'current' &&
    stageTarget('s2').getAttribute('data-status') === 'skipped' &&
    stageTarget('s4').getAttribute('data-target') === 'true' &&
    !!stageTarget('s1') && stageTarget('missing') === null,
    JSON.stringify({
      s3: stageTarget('s3') && stageTarget('s3').getAttribute('data-status'),
      s2: stageTarget('s2') && stageTarget('s2').getAttribute('data-status'),
      s4target: stageTarget('s4') && stageTarget('s4').getAttribute('data-target'),
      s1: !!stageTarget('s1'), missing: stageTarget('missing'),
      ids: Array.from(stage.el.querySelectorAll('[data-id]')).map((node) => node.getAttribute('data-id'))
    }));
  const stageS1 = stageTarget('s1');
  const bypassNode = stage.getTarget('bypass:s2>s4');
  check('StageTrack 显式旁路作为独立 target', !!bypassNode && bypassNode.getAttribute('data-from') === 's2' &&
    bypassNode.getAttribute('data-to') === 's4', JSON.stringify({ bypass: !!bypassNode }));
  stage.update({ current: 's4', target: 's5', failed: ['s3'], skipped: ['s2'] });
  check('StageTrack update 复用节点并更新状态', stageTarget('s1') === stageS1 &&
    stageTarget('s4').getAttribute('data-status') === 'current' &&
    stageTarget('s3').getAttribute('data-status') === 'failed' &&
    stageTarget('s5').getAttribute('data-target') === 'true' &&
    stage.getTarget('bypass:s2>s4') === bypassNode,
    JSON.stringify({ s4: stageTarget('s4').getAttribute('data-status'), s3: stageTarget('s3').getAttribute('data-status') }));
  stage.update({ current: 's3', target: 's4', failed: [], skipped: ['s2'] });
  check('StageTrack 可恢复原状态', stageTarget('s3').getAttribute('data-status') === 'current' &&
    stageTarget('s3').getAttribute('data-status') !== 'failed');
  stage.destroy();
  check('StageTrack destroy 移除根', stageHost.querySelectorAll('.nviz-flow-stagetrack').length === 0 && stage.getTarget('s1') === null);

  /* ---------- PacketFlow ---------- */
  const flowHost = host();
  const messages = [
    { id: 'm1', from: 'client', to: 'gateway', label: '请求 1' },
    { id: 'm2', from: 'gateway', to: 'service', label: '转发请求' },
    { id: 'm3', from: 'service', to: 'gateway', label: '响应' },
    { id: 'm4', from: 'gateway', to: 'client', label: '返回结果' }
  ];
  const flow = Flow.PacketFlow.mount(flowHost, {
    label: '消息流',
    participants: [{ id: 'client', label: '客户端' }, { id: 'gateway', label: '网关' }, { id: 'service', label: '服务端' }],
    messages: messages, visibleCount: 2, focus: 'm1'
  });
  const flowTarget = (id) => flow.getTarget(id);
  check('PacketFlow 稳定 ID/参与者/方向', !!flowTarget('m1') && flowTarget('m1') === flowTarget('message:m1') &&
    !!flowTarget('participant:client') && flowTarget('m1').getAttribute('data-direction') === 'right' &&
    flowTarget('m3').getAttribute('data-direction') === 'left' &&
    flowTarget('m1').getAttribute('data-target') === 'gateway' && flowTarget('missing') === null,
    JSON.stringify({ m1: !!flowTarget('m1'), direction: flowTarget('m3') && flowTarget('m3').getAttribute('data-direction') }));
  const m1Node = flowTarget('m1');
  check('PacketFlow 逐步显现（visibleCount 只读宿主状态）', flowTarget('m2').getAttribute('data-hidden') == null &&
    flowTarget('m3').getAttribute('data-hidden') === 'true',
    JSON.stringify({ m2: flowTarget('m2').getAttribute('data-hidden'), m3: flowTarget('m3').getAttribute('data-hidden') }));
  flow.update({ visibleCount: 4, focus: 'm4' });
  check('PacketFlow update 复用节点并显示/聚焦', flowTarget('m1') === m1Node &&
    flowTarget('m3').getAttribute('data-hidden') == null && flowTarget('m4').getAttribute('data-hidden') == null &&
    flowTarget('m4').getAttribute('data-focus') === 'true',
    JSON.stringify({ m4: flowTarget('m4').getAttribute('data-focus') }));
  flow.update({ visibleCount: 1, focus: 'm1' });
  check('PacketFlow 可回到更少显现', flowTarget('m2').getAttribute('data-hidden') === 'true' &&
    flowTarget('m1').getAttribute('data-hidden') == null);
  flow.destroy();

  /* ---------- SegmentBar ---------- */
  const segmentHost = host();
  const segments = [
    { id: 'seg-a', label: 'A', value: 120 },
    { id: 'seg-b', label: 'B', value: 0 },
    { id: 'seg-c', label: 'C', value: 320 },
    { id: 'seg-d', label: 'D', value: 0 },
    { id: 'seg-e', label: 'E', value: 80 }
  ];
  const bar = Flow.SegmentBar.mount(segmentHost, {
    label: '段条', segments: segments, scaleMax: 600, minWidth: 18,
    ranges: [{ id: 'range-bd', label: '零/低值范围', start: 'seg-b', end: 'seg-d' }]
  });
  const barTarget = (id) => bar.getTarget(id);
  const zeroRect = barTarget('seg-b').querySelector('.nviz-flow-segmentbar__segment-rect');
  check('SegmentBar 稳定 ID/零长度/范围 target', !!barTarget('seg-a') && !!barTarget('label:seg-b') &&
    barTarget('seg-b').getAttribute('data-real-value') === '0' &&
    barTarget('seg-b').getAttribute('data-ratio') === '0' &&
    Number(zeroRect.getAttribute('width')) === 18 &&
    barTarget('range-bd').getAttribute('data-start-id') === 'seg-b' &&
    barTarget('range-bd').getAttribute('data-end-id') === 'seg-d' && !!barTarget('track'),
    JSON.stringify({ real: barTarget('seg-b').getAttribute('data-real-value'), width: zeroRect.getAttribute('width') }));
  const segANode = barTarget('seg-a');
  const segAWidth = Number(barTarget('seg-a').querySelector('rect').getAttribute('width'));
  bar.update({ segments: segments.concat([{ id: 'seg-f', label: 'F', value: 40 }]) });
  check('SegmentBar 插入字段复用已有节点', !!barTarget('seg-f') && barTarget('seg-a') === segANode);
  bar.update({ segments: segments });
  check('SegmentBar 移除字段后 target 失效', barTarget('seg-f') === null);
  bar.update({ scaleMax: 1000 });
  const scaledA = Number(barTarget('seg-a').querySelector('rect').getAttribute('width'));
  const scaledZero = Number(barTarget('seg-b').querySelector('rect').getAttribute('width'));
  check('SegmentBar 显示尺度变化不改真实值/零宽', scaledA < segAWidth && scaledZero === 18 &&
    barTarget('seg-a').getAttribute('data-real-value') === '120' &&
    barTarget('seg-b').getAttribute('data-real-value') === '0',
    JSON.stringify({ before: segAWidth, after: scaledA, zero: scaledZero }));
  bar.destroy();

  /* ---------- DeviceLinks ---------- */
  const linksHost = host();
  const devices = [
    { id: 'dev-a', label: '设备 A', ports: [{ id: 'in', label: 'IN' }, { id: 'out', label: 'OUT' }] },
    { id: 'dev-b', label: '设备 B', ports: [{ id: 'in', label: 'IN' }, { id: 'out', label: 'OUT' }] }
  ];
  const deviceLinks = Flow.DeviceLinks.mount(linksHost, {
    label: '设备连接', devices: devices,
    links: [{ id: 'link-ab', from: { device: 'dev-a', port: 'out' }, to: { device: 'dev-b', port: 'in' }, label: 'A → B', status: 'active' }]
  });
  const linksTarget = (id) => deviceLinks.getTarget(id);
  const pathNode = deviceLinks.getLinkPath('link-ab');
  const total = pathNode && pathNode.getTotalLength ? pathNode.getTotalLength() : -1;
  const p0 = deviceLinks.pointAt('link-ab', 0);
  const p1 = deviceLinks.pointAt('link-ab', 1);
  const pm = deviceLinks.pointAt('link-ab', 0.5);
  check('DeviceLinks 设备/端口/连接稳定 target', !!linksTarget('dev-a') && !!linksTarget('link-ab') &&
    !!linksTarget('port:dev-a:out') && linksTarget('missing') === null);
  check('DeviceLinks getLinkPath 返回可用 SVG path', !!pathNode && pathNode.tagName === 'path' && total > 0, JSON.stringify({ total: total }));
  check('DeviceLinks pointAt 采样路径点', !!p0 && !!p1 && !!pm && isFinite(pm.angle) &&
    Math.hypot(p1.x - p0.x, p1.y - p0.y) > 10, JSON.stringify({ p0: p0, pm: pm, p1: p1 }));
  const deviceNode = linksTarget('dev-a');
  const linkNode = linksTarget('link-ab');
  deviceLinks.update({ links: [
    { id: 'link-ab', from: { device: 'dev-a', port: 'out' }, to: { device: 'dev-b', port: 'in' }, label: 'A → B', status: 'idle' },
    { id: 'link-ba', from: { device: 'dev-b', port: 'out' }, to: { device: 'dev-a', port: 'in' }, label: 'B → A', status: 'active' }
  ] });
  check('DeviceLinks update 复用设备/连接与 path', linksTarget('dev-a') === deviceNode && linksTarget('link-ab') === linkNode &&
    deviceLinks.getLinkPath('link-ab') === pathNode && !!linksTarget('link-ba') &&
    linksTarget('link-ab').getAttribute('data-status') === 'idle',
    JSON.stringify({ ab: linksTarget('link-ab') && linksTarget('link-ab').getAttribute('data-status') }));
  deviceLinks.destroy();

  /* ---------- 独立挂载（无其他组件） ---------- */
  const soloHost = document.createElement('div');
  document.body.appendChild(soloHost);
  const soloStage = Flow.StageTrack.mount(soloHost, { stages: [{ id: 'only', label: 'Only' }], current: 'only' });
  check('独立挂载单个部件可用', !!soloStage.getTarget('only') && !!soloStage.el);
  soloStage.destroy();
  soloHost.remove();
  return out;
});
for (const row of rows) check(row.name, row.ok, row.detail);
check('flow-kit 区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
await context.close();
await browser.close();
const failed = checks.filter((row) => !row.ok);
console.log('SUMMARY ' + (checks.length - failed.length) + '/' + checks.length + ' passed');
if (failed.length) process.exitCode = 1;
