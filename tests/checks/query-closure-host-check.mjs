#!/usr/bin/env node
/* Query CLI dependency-closure host check.
 *
 * For selected curated topics, read the real `show --json` dependency closure, generate a
 * minimal host page that loads only those dist/modules files, and verify the topic's smallest
 * useful entry actually mounts/runs without demo-ui/demo-runtime being pulled in by habit.
 *
 * Usage: node tests/checks/query-closure-host-check.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cacheDir } from '../lib/test-output.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('../tools/node_modules/playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const cli = path.join(root, 'scripts', 'query.mjs');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const outDir = cacheDir(root, 'query-closure-host');
const failures = [];
let passes = 0;
function pass(name, detail) { passes += 1; console.log('PASS  ' + name + (detail ? ' :: ' + detail : '')); }
function fail(name, detail) { failures.push(name + (detail ? ' :: ' + detail : '')); console.log('FAIL  ' + name + (detail ? ' :: ' + detail : '')); }
function expect(ok, name, detail) { if (ok) pass(name, detail); else fail(name, detail); }

function runShow(topic, contextKey) {
  const args = [cli, 'show', topic, '--json'];
  if (contextKey) args.push('--context', contextKey);
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', windowsHide: true });
  const data = JSON.parse(result.stdout || '{}');
  const context = data.entries && data.entries[0] && data.entries[0].contexts && data.entries[0].contexts[0];
  return { result, data, context, modules: context ? context.dependencies.map((item) => item.module) : [] };
}

const cases = [
  {
    id: 'propagation',
    topic: 'public:propagation',
    expected: ['core', 'viz-flow'],
    contextKey: 'independent',
    note: '仅 core + viz-flow 的宿主应能挂载 Propagation'
  },
  {
    id: 'flow-kit',
    topic: 'example:flow-kit',
    expected: ['core', 'viz-flow'],
    contextKey: 'authoring',
    note: '仅 core + viz-flow 的宿主应能挂载四个 Flow 图形'
  },
  {
    id: 'table-adapter',
    topic: 'public:table-adapter',
    expected: ['core', 'ui-content', 'demo-runtime'],
    contextKey: 'public',
    note: 'core + ui-content + demo-runtime 应能运行 table Adapter 的最小 scene'
  },
  {
    id: 'flow-packet-adapter',
    topic: 'public:flow-packet-adapter',
    expected: ['core', 'viz-flow', 'demo-runtime'],
    contextKey: 'public',
    note: 'core + viz-flow + demo-runtime 应能运行 flow-packet Adapter 的最小 scene'
  }
];

function generatePage(item, modules) {
  const asset = (kind, moduleName) => {
    const extension = kind === 'js' ? 'js' : 'css';
    const relative = '../../../dist/modules/' + moduleName + '.' + extension;
    if (!fs.existsSync(path.join(root, 'dist/modules', moduleName + '.' + extension))) return '';
    return kind === 'js'
      ? '  <script src="' + relative + '"></script>\n'
      : '  <link rel="stylesheet" href="' + relative + '">\n';
  };
  const html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">\n' +
    modules.map((name) => asset('css', name)).join('') +
    '</head><body><div id="host"></div><div id="second"></div>\n' +
    modules.map((name) => asset('js', name)).join('') +
    '</body></html>';
  const file = path.join(outDir, item.id + '.html');
  fs.writeFileSync(file, html);
  return file;
}

const browser = await chromium.launch({ executablePath: edge, headless: true });
try {
  for (const item of cases) {
    const fetched = runShow(item.topic, item.contextKey);
    expect(fetched.result.status === 0 && fetched.data.ok === true, item.id + ' show --json 成功');
    expect(fetched.context && fetched.context.key === item.contextKey, item.id + ' --context 返回运行入口对应的 context key', fetched.context && fetched.context.key);
    expect(JSON.stringify(fetched.modules) === JSON.stringify(item.expected), item.id + ' 声明闭包与实际 JSON 一致', JSON.stringify(fetched.modules));
    const pageFile = generatePage(item, fetched.modules);
    const page = await browser.newPage({ viewport: { width: 1120, height: 860 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push('pageerror: ' + error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push('console: ' + message.text()); });
    await page.goto(pathToFileURL(pageFile).href, { waitUntil: 'load' });
    const state = await page.evaluate(async (caseId) => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const out = {
        scripts: Array.from(document.querySelectorAll('script[src]')).map((node) => node.getAttribute('src')),
        noteDemo: typeof window.NoteDemo,
        noteUI: typeof window.NoteUI,
        noteBlocks: typeof window.NoteBlocks,
        noteViz: typeof window.NoteViz,
        errors: []
      };
      try {
        if (caseId === 'propagation') {
          out.propagation = typeof (window.NoteViz && window.NoteViz.Flow && window.NoteViz.Flow.Propagation && window.NoteViz.Flow.Propagation.mount);
          const host = document.getElementById('host');
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('viewBox', '0 0 200 60');
          const pathNode = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          pathNode.setAttribute('d', 'M 10 30 L 190 30');
          svg.appendChild(pathNode);
          host.appendChild(svg);
          const rec = window.NoteViz.Flow.Propagation.mount(host, { paths: { main: pathNode }, copies: [{ id: 'p1', pathId: 'main' }] });
          rec.update(0.5);
          out.copy = host.querySelector('.nviz-flow-propagation__copy') ? host.querySelector('.nviz-flow-propagation__copy').getAttribute('data-ratio') : null;
          rec.destroy();
        } else if (caseId === 'flow-kit') {
          const host = document.getElementById('host');
          const stageHost = document.createElement('div');
          const packetHost = document.createElement('div');
          const segmentHost = document.createElement('div');
          const deviceHost = document.createElement('div');
          host.append(stageHost, packetHost, segmentHost, deviceHost);
          const stage = window.NoteViz.Flow.StageTrack.mount(stageHost, { stages: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], current: 'a' });
          const packet = window.NoteViz.Flow.PacketFlow.mount(packetHost, { participants: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }], messages: [{ id: 'm1', from: 'x', to: 'y', label: 'M1' }], visibleCount: 1 });
          const segment = window.NoteViz.Flow.SegmentBar.mount(segmentHost, { segments: [{ id: 's1', label: 'S1', value: 10 }] });
          const device = window.NoteViz.Flow.DeviceLinks.mount(deviceHost, { devices: [{ id: 'd1', label: 'D1' }, { id: 'd2', label: 'D2' }], links: [{ id: 'l1', from: 'd1', to: 'd2' }] });
          out.components = Boolean(stage.el && packet.el && segment.el && device.el);
          out.stageTarget = Boolean(stage.getTarget('a'));
          out.packetTarget = Boolean(packet.getTarget('m1'));
          stage.destroy(); packet.destroy(); segment.destroy(); device.destroy();
        } else if (caseId === 'table-adapter') {
          out.adapter = Boolean(window.NoteDemoInternals && window.NoteDemoInternals.adapters && window.NoteDemoInternals.adapters.table);
          out.uiTable = Boolean(window.NoteUI && window.NoteUI.Table);
          out.uiGrid = typeof (window.NoteUI && window.NoteUI.Grid);
          const host = document.getElementById('host');
          const definition = window.NoteDemo.compile({
            bindings: { table: { adapter: 'table', slot: 'table' } },
            initial: {
              id: 'a', caption: 'A',
              views: { table: { columns: [{ key: 'name', label: '名称' }], rows: [{ id: 'r1', name: '一' }] } }
            },
            steps: [{
              id: 'b', caption: 'B',
              replace: { table: { columns: [{ key: 'name', label: '名称' }], rows: [{ id: 'r1', name: '二' }] } },
              scene: { bindings: [{ binding: 'table' }] }
            }]
          });
          const session = window.NoteDemo.create({ definition, slots: { table: host } });
          const next = await session.next();
          await wait(60);
          const publicState = session.getState();
          out.next = next.status;
          out.phase = publicState.phase;
          out.settled = publicState.settledFrameId;
          out.text = host.querySelector('.nui-table') ? host.querySelector('.nui-table').textContent : '';
          session.destroy();
        } else if (caseId === 'flow-packet-adapter') {
          out.adapter = Boolean(window.NoteDemoInternals && window.NoteDemoInternals.adapters && window.NoteDemoInternals.adapters['flow-packet']);
          const host = document.getElementById('host');
          const definition = window.NoteDemo.compile({
            bindings: { packet: { adapter: 'flow-packet', slot: 'packet' } },
            initial: {
              id: 'a', caption: 'A',
              views: { packet: { participants: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }], messages: [{ id: 'm1', from: 'x', to: 'y', label: 'M1' }], visibleCount: 0 } }
            },
            steps: [{
              id: 'b', caption: 'B',
              replace: { packet: { participants: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }], messages: [{ id: 'm1', from: 'x', to: 'y', label: 'M1' }], visibleCount: 1, focus: 'm1' } },
              scene: { bindings: [{ binding: 'packet' }] }
            }]
          });
          const session = window.NoteDemo.create({ definition, slots: { packet: host } });
          const next = await session.next();
          await wait(60);
          const publicState = session.getState();
          out.next = next.status;
          out.phase = publicState.phase;
          out.settled = publicState.settledFrameId;
          out.messages = host.querySelectorAll('.nviz-flow-packetflow__message:not([data-hidden])').length;
          out.focus = host.querySelector('[data-focus="true"]') ? host.querySelector('[data-focus="true"]').getAttribute('data-id') : null;
          session.destroy();
        }
      } catch (error) {
        out.errors.push(String(error && error.message || error));
      }
      return out;
    }, item.id);
    await page.close();

    expect(errors.length === 0, item.id + ' 页面错误/console error 为空', errors.join(' | '));
    expect(state.errors.length === 0, item.id + ' 最小宿主执行无异常', state.errors.join(' | '));
    expect(state.scripts.length === fetched.modules.length, item.id + ' 只加载声明闭包的脚本', JSON.stringify(state.scripts));
    if (item.id === 'propagation') {
      expect(state.propagation === 'function' && state.copy != null && Math.abs(Number(state.copy) - 0.5) < 0.01, item.note, JSON.stringify(state));
      expect(state.noteDemo === 'undefined' && state.noteBlocks === 'undefined', 'propagation 闭包不含 demo-runtime/demo-ui/blocks', JSON.stringify({ noteDemo: state.noteDemo, noteBlocks: state.noteBlocks }));
    } else if (item.id === 'flow-kit') {
      expect(state.components === true && state.stageTarget && state.packetTarget, item.note, JSON.stringify(state));
      expect(state.noteDemo === 'undefined' && state.noteBlocks === 'undefined', 'flow-kit 闭包不套 demo-ui/demo-runtime', JSON.stringify({ noteDemo: state.noteDemo, noteBlocks: state.noteBlocks }));
    } else if (item.id === 'table-adapter') {
      expect(state.adapter && state.uiTable && state.uiGrid === 'undefined', item.note, JSON.stringify(state));
      expect(state.next === 'completed' && state.phase === 'idle' && state.settled === 'b' && /二/.test(state.text), 'table Adapter 最小 scene 推进成功', JSON.stringify(state));
    } else if (item.id === 'flow-packet-adapter') {
      expect(state.adapter, item.note, JSON.stringify(state));
      expect(state.next === 'completed' && state.phase === 'idle' && state.settled === 'b' && state.messages === 1 && state.focus === 'm1', 'flow-packet Adapter 最小 scene 推进成功', JSON.stringify(state));
    }
  }
} finally {
  await browser.close();
}
console.log('SUMMARY ' + passes + '/' + (passes + failures.length) + ' passed');
if (failures.length) {
  console.error('\n' + failures.join('\n'));
  process.exit(1);
}
