#!/usr/bin/env node
/*
 * Module-load check: consume the real `query load --json` output, write a
 * temporary local HTML that loads exactly those dist modules, and open it in
 * real Edge. Covers D01, C06, D08 (flow), and NoteDemo.mount idle.
 * Also reports actual dist module-vs-whole-library file sizes.
 *
 * Usage: node tests/checks/module-load-check.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const cli = path.join(root, 'scripts', 'query.mjs');
const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'html-note-module-load-'));
const failures = [];
let passes = 0;

function pass(message) { passes += 1; console.log('PASS  ' + message); }
function fail(message) { failures.push(message); console.log('FAIL  ' + message); }
function check(name, ok, detail = '') { if (ok) pass(name); else fail(name + (detail ? ' :: ' + String(detail).slice(0, 700) : '')); }
function fileSize(relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) throw new Error('缺少文件：' + relative);
  return fs.statSync(absolute).size;
}
function loadJson(args) {
  const result = spawnSync(process.execPath, [cli, 'load', ...args, '--json'], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('load 失败：' + (result.stderr || result.stdout).slice(0, 600));
  return JSON.parse(result.stdout);
}
function hrefFor(htmlFile, relative) {
  return path.relative(path.dirname(htmlFile), path.join(root, relative)).replace(/\\/g, '/');
}
function htmlFor(data, bodyScript, htmlFile) {
  const links = data.styles.map((item) => '<link rel="stylesheet" href="' + hrefFor(htmlFile, item) + '">').join('\n');
  const scripts = data.scripts.map((item) => '<script src="' + hrefFor(htmlFile, item) + '"></script>').join('\n');
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
    + '<style>html,body{margin:0;padding:0}body{font-family:Segoe UI,Microsoft YaHei,sans-serif;background:#f4f6f9;color:#202938}#host{padding:16px;max-width:1000px}</style>'
    + links + '</head><body><div id="host"></div>' + scripts
    + '<script>' + bodyScript + '</script></body></html>';
}

const scenarios = [
  {
    name: 'D01 Sequence',
    load: ['D01'],
    expect: (value) => value.ok === true && value.items === 2 && value.mounted === true,
    script: `(function(){try{var host=document.getElementById('host');var instance=NoteViz.Sequence.mount(host,{items:[{id:'a',value:1},{id:'b',value:2}]});var state=instance.getState();window.__load={ok:true,mounted:!!instance,items:state.items.length};}catch(error){window.__load={ok:false,error:String(error&&error.stack||error)};}})();`
  },
  {
    name: 'C06 Table',
    load: ['C06'],
    expect: (value) => value.ok === true && value.rows === 2 && value.mounted === true,
    script: `(function(){try{var host=document.getElementById('host');var instance=NoteUI.Table.mount(host,{columns:[{key:'a',label:'A'},{key:'b',label:'B'}],rows:[{a:'1',b:'2'},{a:'3',b:'4'}]});var state=instance.getState();window.__load={ok:true,mounted:!!instance,rows:state.rows.length};}catch(error){window.__load={ok:false,error:String(error&&error.stack||error)};}})();`
  },
  {
    name: 'D08 PacketFlow',
    load: ['D08'],
    expect: (value) => value.ok === true && value.messages === 2 && value.mounted === true,
    script: `(function(){try{var host=document.getElementById('host');var instance=NoteViz.Flow.PacketFlow.mount(host,{participants:[{id:'client',label:'客户端'},{id:'server',label:'服务端'}],messages:[{id:'req',from:'client',to:'server',label:'请求'},{id:'ack',from:'server',to:'client',label:'应答',type:'return'}],visibleCount:1});var state=instance.getState();window.__load={ok:true,mounted:!!instance,messages:state.messages.length};}catch(error){window.__load={ok:false,error:String(error&&error.stack||error)};}})();`
  },
  {
    name: 'NoteDemo.mount idle',
    load: ['I07', '--context', 'mount'],
    expect: (value) => value.ok === true && value.phase === 'idle',
    script: `(function(){try{var definition={initialFrameId:'a',bindings:{text:{adapter:'dom',slot:'text'}},frames:[{id:'a',caption:'初始',views:{text:{text:'A'}}},{id:'b',caption:'变化',views:{text:{text:'B'}}}],transitions:[{from:'a',to:'b',scene:{bindings:[{binding:'text'}]}}]};var layout=function(container){var root=document.createElement('div');var slot=document.createElement('div');slot.setAttribute('data-demo-slot','text');root.appendChild(slot);container.appendChild(root);return {root:root,slots:{text:slot}};};var session=NoteDemo.mount(document.getElementById('host'),{definition:definition,layout:layout,title:'模块加载检查'});window.__load={ok:true,phase:session.getState().phase,session:session};}catch(error){window.__load={ok:false,error:String(error&&error.stack||error)};}})();`
  }
];

const browser = await chromium.launch({ executablePath: edge, headless: true });
const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
try {
  for (const scenario of scenarios) {
    const data = loadJson(scenario.load);
    const moduleJs = data.scripts.reduce((sum, item) => sum + fileSize(item), 0);
    const moduleCss = data.styles.reduce((sum, item) => sum + fileSize(item), 0);
    const wholeJs = fileSize(data.wholeLibrary.scripts[0]);
    const wholeCss = fileSize(data.wholeLibrary.styles[0]);
    console.log('SIZE ' + scenario.name + ' module=' + moduleJs + 'js+' + moduleCss + 'css whole=' + wholeJs + 'js+' + wholeCss + 'css modules=' + data.modules.join('+'));
    check(scenario.name + ' load JSON 有序且文件存在', Array.isArray(data.modules) && data.modules.length > 0 &&
      Array.isArray(data.styles) && Array.isArray(data.scripts) && data.scripts.every((item) => fs.existsSync(path.join(root, item))) &&
      data.styles.every((item) => fs.existsSync(path.join(root, item))) && new Set(data.modules).size === data.modules.length,
      JSON.stringify({ modules: data.modules, styles: data.styles, scripts: data.scripts }));
    const dir = path.join(tempRoot, scenario.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
    fs.mkdirSync(dir, { recursive: true });
    const htmlFile = path.join(dir, 'index.html');
    fs.writeFileSync(htmlFile, htmlFor(data, scenario.script, htmlFile), 'utf8');
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push('pageerror: ' + error.message));
    page.on('console', (message) => { if (message.type() === 'error') pageErrors.push('console: ' + message.text()); });
    await page.goto('file:///' + htmlFile.replace(/\\/g, '/'));
    await page.waitForFunction(() => !!window.__load, null, { timeout: 8000 });
    const value = await page.evaluate(() => window.__load);
    const idle = value && value.phase === 'idle';
    check(scenario.name + ' 在真实 Edge 加载并执行', scenario.expect(value) && pageErrors.length === 0,
      JSON.stringify({ value, pageErrors }));
    if (scenario.name.startsWith('NoteDemo')) check('NoteDemo.mount 加载后 idle', idle, JSON.stringify(value));
    await page.close();
  }
} finally {
  await context.close();
  await browser.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('SUMMARY ' + passes + '/' + (passes + failures.length) + ' passed');
if (failures.length) {
  console.log('FAILURES:\n' + failures.join('\n'));
  process.exitCode = 1;
}
