// 可复用变化机制 M01–M04 自检：真实 Edge + 真实 core + 源码直载。
// 运行：node tests/checks/viz-mechanisms-check.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { moduleDemos, moduleScripts, moduleStyles, readModuleSources } from '../lib/src-sources.mjs';
import { writeCacheJson } from '../lib/test-output.mjs';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const src = (rel) => path.join(root, rel);

const checks = [];
const pageErrors = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail: String(detail) });
}

let activeEvalPage = null;
async function evalChecks(label, fn, arg) {
  try {
    if (!activeEvalPage) throw new Error('no active evaluation page');
    const rows = await activeEvalPage.evaluate(fn, arg);
    if (!Array.isArray(rows)) {
      check(label, false, 'step did not return checks');
      return;
    }
    rows.forEach((row) => check(row.name, row.ok, row.detail));
  } catch (error) {
    check(label + ' crashed', false, error && error.message ? error.message : String(error));
  }
}

async function makePage(browser, options = {}) {
  const context = await browser.newContext({
    viewport: { width: options.width || 1100, height: options.height || 900 },
    reducedMotion: options.reduced ? 'reduce' : 'no-preference'
  });
  const page = await context.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error') pageErrors.push((options.label || 'page') + ': ' + msg.text()); });
  page.on('pageerror', (err) => pageErrors.push((options.label || 'page') + ': pageerror: ' + err.message));
  await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>viz mechanisms check</title></head><body><main id="root"></main></body></html>');
  await page.addStyleTag({
    content: 'html,body{margin:0;padding:0}body{padding:20px;box-sizing:border-box;background:#f4f6f9}#root{max-width:900px;margin:0 auto}'
  });
  // 源码加载清单从 src/manifests 推导：M01–M04 拆成多个文件后自动全部加载。
  const pageModules = ['core', 'viz-mechanisms'];
  for (const rel of moduleStyles(root, pageModules)) {
    await page.addStyleTag({ path: src(rel) });
  }
  for (const rel of moduleScripts(root, pageModules)) {
    await page.addScriptTag({ path: src(rel) });
  }
  if (options.demos) {
    for (const rel of moduleDemos(root, ['viz-mechanisms'])) {
      try { await page.addScriptTag({ path: src(rel) }); } catch (error) {}
    }
  }
  return { context, page };
}

const browser = await chromium.launch({ executablePath: edge, headless: true });

/* ---------------- 正常动效页：四项组件 ---------------- */
const normal = await makePage(browser, { label: 'normal' });
const page = normal.page;
activeEvalPage = page;

await evalChecks('M01 standard', async () => {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail) });
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rootEl = document.getElementById('root');
  rootEl.replaceChildren();
  const host = document.createElement('div');
  rootEl.appendChild(host);
  let changes = 0;
  const m1 = NoteViz.SequenceEdit.mount(host, {
    items: [
      { id: 'a', label: '读取' },
      { id: 'b', label: '校验' },
      { id: 'c', label: '转换' },
      { id: 'd', label: '写入' }
    ],
    focus: ['b'],
    changed: ['c'],
    onChange: () => { changes += 1; }
  });
  check('M01 mount appends root', !!m1.el && m1.el.parentNode === host);
  check('M01 getTarget identity', m1.getTarget('b') && m1.getTarget('b').textContent.includes('校验'));
  check('M01 focus and change share one marker', m1.getTarget('b').querySelector('.nviz-sequence-edit__marker').textContent === '关注');
  check('M01 initial no user callback', changes === 0);
  m1.update({ items: [
    { id: 'a', label: '读取样本' },
    { id: 'b', label: '校验字段' },
    { id: 'c', label: '转换格式' },
    { id: 'd', label: '写入结果' }
  ], focus: ['d'], changed: ['a'] });
  check('M01 update is programmatic', changes === 0);
  check('M01 update keeps stable ID target', m1.getState().items[1].label === '校验字段' && m1.getTarget('b'));
  m1.replay({ animate: false });
  check('M01 replay does not emit change', changes === 0);
  const oldTarget = m1.getTarget('b');
  m1.remove('b');
  check('M01 animation observable after action', m1.el.getAttribute('data-anim') === 'running' && m1.el.getAnimations({ subtree: true }).length > 0, m1.el.getAttribute('data-anim'));
  await sleep(760);
  check('M01 remove terminal state', m1.getState().items.map((x) => x.id).join(',') === 'a,c,d');
  check('M01 remove user callback', changes === 1);
  check('M01 removed target null', m1.getTarget('b') === null);
  check('M01 surviving target can be stable', m1.getTarget('a') !== null && m1.el.querySelectorAll('.nviz-sequence-edit__item--ghost').length === 0);
  check('M01 animation effects cleaned', m1.el.getAnimations({ subtree: true }).length === 0, m1.el.getAnimations({ subtree: true }).length);
  m1.undo();
  await sleep(760);
  check('M01 undo snapshot', m1.getState().items.map((x) => x.id).join(',') === 'a,b,c,d');
  check('M01 undo target returns', !!m1.getTarget('b'));
  const topBefore = m1.getTarget('d').getBoundingClientRect().top;
  m1.move('d', 0);
  await sleep(50);
  m1.swap('a', 'c');
  await sleep(50);
  m1.remove('a');
  await sleep(820);
  check('M01 rapid convergence order', m1.getState().items.map((x) => x.id).join(',') === 'd,c,b', m1.getState().items.map((x) => x.id).join(','));
  check('M01 rapid no ghosts', m1.el.querySelectorAll('.nviz-sequence-edit__item--ghost').length === 0);
  check('M01 rapid DOM count', m1.el.querySelectorAll('.nviz-sequence-edit__item').length === 3);
  check('M01 rapid no running animation', m1.el.getAnimations({ subtree: true }).length === 0, m1.el.getAnimations({ subtree: true }).length);
  const beforeReplay = m1.getState().items.map((x) => x.id).join(',');
  m1.replay();
  await sleep(1100);
  check('M01 replay keeps logical state', m1.getState().items.map((x) => x.id).join(',') === beforeReplay);
  check('M01 replay cleanup', m1.el.querySelectorAll('.nviz-sequence-edit__item--ghost').length === 0 && m1.el.getAnimations({ subtree: true }).length === 0);
  check('M01 focus stable after action', m1.getTarget('d') && m1.getState().focus[0] === 'd');
  m1.reset();
  await sleep(800);
  check('M01 reset restores baseline', m1.getState().items.map((x) => x.id).join(',') === 'a,b,c,d', m1.getState().items.map((x) => x.id).join(','));
  check('M01 reset target', !!m1.getTarget('a') && m1.el.querySelectorAll('.nviz-sequence-edit__item').length === 4);
  m1.destroy();
  m1.destroy();
  check('M01 destroy idempotent', !document.body.contains(m1.el) && m1.getTarget('d') === null);
  return checks;
});

await evalChecks('M01 no-animation and isolation', async () => {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail) });
  const rootEl = document.getElementById('root');
  rootEl.replaceChildren();
  const hostA = document.createElement('div');
  const hostB = document.createElement('div');
  rootEl.appendChild(hostA); rootEl.appendChild(hostB);
  const a = NoteViz.SequenceEdit.mount(hostA, { items: [{ id: 'x', label: '甲' }, { id: 'y', label: '乙' }] });
  const b = NoteViz.SequenceEdit.mount(hostB, { items: [{ id: 'p', label: '丙' }, { id: 'q', label: '丁' }] });
  a.remove('x', { animate: false });
  check('M01 animate:false immediate', a.getState().items.length === 1 && a.getTarget('x') === null);
  check('M01 animate:false no ghost/animation', a.el.querySelectorAll('.nviz-sequence-edit__item--ghost').length === 0 && a.el.getAnimations({ subtree: true }).length === 0);
  check('M01 multi-instance isolation', b.getState().items.length === 2 && b.getTarget('x') === null && b.getTarget('p'));
  a.destroy();
  b.remove('p', { animate: false });
  check('M01 other instance continues after destroy', b.getState().items.length === 1 && !!b.el.parentNode);
  b.destroy();
  const c = NoteViz.SequenceEdit.mount(hostA, { items: [{ id: 'm', label: 'M' }, { id: 'n', label: 'N' }] });
  c.remove('m');
  c.destroy();
  check('M01 destroy during animation cleanup', !document.body.contains(c.el) && document.getAnimations().filter((anim) => anim.effect && anim.effect.target && anim.effect.target.isConnected).length === 0);
  return checks;
});

await evalChecks('M02 standard', async () => {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail) });
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rootEl = document.getElementById('root');
  rootEl.replaceChildren();
  const host = document.createElement('div');
  rootEl.appendChild(host);
  let settles = 0;
  const m2 = NoteViz.Transfer.mount(host, {
    object: { id: 'packet', label: '数据包 A' },
    sourceLabel: '发送端',
    targetLabel: '接收端',
    onSettle: () => { settles += 1; }
  });
  const obj = m2.getTarget('object');
  const source = m2.getTarget('source');
  const target = m2.getTarget('target');
  check('M02 internal regions', !!source && !!target && source !== target);
  check('M02 initial object attribution', source.contains(obj) && !target.contains(obj));
  m2.send();
  check('M02 transfer animation observable', m2.el.getAttribute('data-anim') === 'running' && document.querySelectorAll('.nviz-transfer__trail').length === 1, m2.el.getAttribute('data-anim'));
  await sleep(820);
  check('M02 send terminal attribution', target.contains(obj) && !source.contains(obj));
  check('M02 only one object', document.querySelectorAll('.nviz-transfer__object').length === 1);
  check('M02 path removed after settle', document.querySelectorAll('.nviz-transfer__trail').length === 0);
  check('M02 onSettle fires after terminal', settles === 1 && m2.getState().settled && m2.getState().at === 'target');
  check('M02 object animations cleaned', obj.getAnimations().length === 0 && m2.el.getAnimations({ subtree: true }).length === 0);
  const targetObj = m2.getTarget('object');
  m2.update({ object: { id: 'packet-2', label: '数据包 B' }, sourceLabel: '发送区', targetLabel: '接收区' });
  check('M02 update object in place', m2.getTarget('object') === targetObj && target.contains(targetObj) && targetObj.textContent.includes('数据包 B'));
  check('M02 update labels', m2.getTarget('source').textContent.includes('发送区') && m2.getTarget('target').textContent.includes('接收区'));
  m2.reset({ animate: false });
  check('M02 reset no-animation immediate', source.contains(obj) && !target.contains(obj) && m2.getState().at === 'source');
  m2.replay({ animate: false });
  check('M02 replay no-animation immediate target', target.contains(obj) && !source.contains(obj) && document.querySelectorAll('.nviz-transfer__trail').length === 0);
  m2.destroy();
  check('M02 destroy cleanup', !document.body.contains(m2.el) && !document.body.contains(obj) && document.querySelectorAll('.nviz-transfer__trail').length === 0);
  return checks;
});

await evalChecks('M02 external and multi-instance', async () => {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail) });
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rootEl = document.getElementById('root');
  rootEl.replaceChildren();
  const host = document.createElement('div');
  const s = document.createElement('div'); s.id = 'check-source';
  const t = document.createElement('div'); t.id = 'check-target';
  s.textContent = '宿主源内容'; t.textContent = '宿主目标内容';
  host.appendChild(s); host.appendChild(t);
  rootEl.appendChild(host);
  const ext = NoteViz.Transfer.mount(host, { source: '#check-source', target: '#check-target', object: { id: 'ext', label: '外部对象' } });
  const extObj = ext.getTarget('object');
  ext.send({ animate: false });
  check('M02 external selector attribution', t.contains(extObj) && !s.contains(extObj));
  check('M02 external preserves host content', s.textContent.includes('宿主源内容') && t.textContent.includes('宿主目标内容'));
  ext.destroy();
  check('M02 external zones remain', host.contains(s) && host.contains(t));
  host.replaceChildren();

  const c = NoteViz.Transfer.mount(host, { object: { id: 'c', label: '并发一' } });
  const d = NoteViz.Transfer.mount(host, { object: { id: 'd', label: '并发二' } });
  const cObj = c.getTarget('object');
  const dObj = d.getTarget('object');
  c.send();
  d.send();
  await sleep(850);
  check('M02 multi-instance both settle', c.getTarget('target').contains(cObj) && d.getTarget('target').contains(dObj));
  check('M02 multi-instance no cross-move', !c.getTarget('target').contains(dObj) && !d.getTarget('target').contains(cObj));
  check('M02 multi-instance no trail', document.querySelectorAll('.nviz-transfer__trail').length === 0);
  c.destroy();
  d.destroy();
  rootEl.replaceChildren();
  const host2 = document.createElement('div');
  rootEl.appendChild(host2);
  const m2 = NoteViz.Transfer.mount(host2, { object: { id: 'z', label: '取消对象' } });
  const zObj = m2.getTarget('object');
  m2.send();
  m2.destroy();
  check('M02 destroy during animation cleanup', !document.body.contains(m2.el) && !document.body.contains(zObj) && document.querySelectorAll('.nviz-transfer__trail').length === 0);
  return checks;
});

await evalChecks('M03 standard', async () => {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail) });
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rootEl = document.getElementById('root');
  rootEl.replaceChildren();
  const host = document.createElement('div');
  rootEl.appendChild(host);
  let settles = 0;
  const m3 = NoteViz.SplitMerge.mount(host, {
    mode: 'split',
    before: [{ id: 's', label: '整段数据' }],
    after: [{ id: 'h', label: '帧头' }, { id: 'p', label: '载荷' }, { id: 'c', label: '校验' }],
    onSettle: () => { settles += 1; }
  });
  check('M03 default split mapping', m3.getState().links.length === 3);
  check('M03 getTarget after', !!m3.getTarget('h') && !m3.getTarget('nope'));
  const afterCard = m3.getTarget('h');
  check('M03 before hides results', getComputedStyle(afterCard).visibility === 'hidden');
  m3.play();
  check('M03 animation observable', m3.el.getAttribute('data-anim') === 'running' && m3.el.getAnimations({ subtree: true }).length > 0, m3.el.getAttribute('data-anim'));
  await sleep(1150);
  check('M03 after terminal', m3.getState().phase === 'after');
  check('M03 mapping rendered', m3.el.querySelectorAll('.nviz-split-merge__link').length === 3, m3.el.querySelectorAll('.nviz-split-merge__link').length);
  check('M03 no object duplication', m3.el.querySelectorAll('.nviz-split-merge__card').length === 4);
  check('M03 result visible', getComputedStyle(afterCard).visibility === 'visible');
  check('M03 onSettle once', settles === 1);
  check('M03 animations cleaned', m3.el.getAnimations({ subtree: true }).length === 0, m3.el.getAnimations({ subtree: true }).length);
  m3.reset();
  await sleep(1050);
  check('M03 reset terminal', m3.getState().phase === 'before' && getComputedStyle(afterCard).visibility === 'hidden');
  m3.replay({ animate: false });
  check('M03 replay no-animation terminal', m3.getState().phase === 'after' && getComputedStyle(afterCard).visibility === 'visible');
  check('M03 replay no-animation onSettle', settles === 3, settles);
  m3.update({
    mode: 'merge',
    before: [{ id: 't', label: '温度' }, { id: 'w', label: '湿度' }],
    after: [{ id: 'env', label: '环境记录' }]
  });
  check('M03 update default merge mapping', m3.getState().phase === 'before' && m3.getState().links.length === 2 && m3.getState().mode === 'merge');
  m3.play({ animate: false });
  check('M03 animate:false immediate', m3.getState().phase === 'after');
  m3.update({
    mode: 'split',
    before: [{ id: 'one', label: '整体' }],
    after: [{ id: 'a', label: '部分 A' }, { id: 'b', label: '部分 B' }],
    links: [{ from: 'one', to: 'a' }]
  });
  check('M03 explicit links accepted', m3.getState().links.length === 1 && !!m3.getTarget('b'));
  m3.play({ animate: false });
  check('M03 explicit links rendered', m3.el.querySelectorAll('.nviz-split-merge__link').length === 1);
  m3.reset({ animate: false });
  m3.play();
  await sleep(20);
  m3.destroy();
  check('M03 destroy during animation', !document.body.contains(m3.el));
  await sleep(60);
  check('M03 destroy stops animations', document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.isConnected).length === 0);
  return checks;
});

await evalChecks('M03 quick actions and multi-instance', async () => {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail) });
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rootEl = document.getElementById('root');
  rootEl.replaceChildren();
  const hostA = document.createElement('div');
  const hostB = document.createElement('div');
  rootEl.appendChild(hostA); rootEl.appendChild(hostB);
  const a = NoteViz.SplitMerge.mount(hostA, { mode: 'split', before: [{ id: 's', label: '源' }], after: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }] });
  const b = NoteViz.SplitMerge.mount(hostB, { mode: 'merge', before: [{ id: 'm', label: 'M' }, { id: 'n', label: 'N' }], after: [{ id: 'r', label: 'R' }] });
  a.play();
  b.play();
  await sleep(40);
  a.reset();
  await sleep(1200);
  check('M03 quick final target', a.getState().phase === 'before');
  check('M03 multi-instance independent', b.getState().phase === 'after' && b.getState().mode === 'merge');
  check('M03 quick no animations running', a.el.getAnimations({ subtree: true }).length === 0 && b.el.getAnimations({ subtree: true }).length === 0);
  a.destroy();
  b.destroy();
  return checks;
});

await evalChecks('M04 replace', async () => {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail) });
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rootEl = document.getElementById('root');
  rootEl.replaceChildren();
  const host = document.createElement('div');
  rootEl.appendChild(host);
  const m4 = NoteViz.ReplaceReveal.mount(host, {
    mode: 'replace',
    before: { id: 'count', label: '计数器', value: 12 },
    after: { id: 'count', label: '计数器', value: 14 }
  });
  const object = m4.getTarget('object');
  const detail = m4.getTarget('detail');
  const topBefore = object.getBoundingClientRect().top;
  check('M04 object and detail targets', !!object && !!detail);
  check('M04 initial before value', object.querySelector('.nviz-replace-reveal__value').textContent === '12');
  m4.play();
  check('M04 replace animation observable', m4.el.getAttribute('data-anim') === 'running' && object.getAnimations({ subtree: true }).length > 0, m4.el.getAttribute('data-anim'));
  await sleep(620);
  check('M04 replace terminal', m4.getState().phase === 'after' && object.querySelector('.nviz-replace-reveal__value').textContent === '14');
  check('M04 replace top stable', Math.abs(object.getBoundingClientRect().top - topBefore) <= 1);
  check('M04 replace compare visible', getComputedStyle(object.querySelector('.nviz-replace-reveal__compare')).display !== 'none');
  check('M04 replace same node', m4.getTarget('object') === object);
  check('M04 replace animations cleaned', object.getAnimations({ subtree: true }).length === 0, object.getAnimations({ subtree: true }).length);
  m4.reset();
  await sleep(620);
  check('M04 replace reset', m4.getState().phase === 'before' && object.querySelector('.nviz-replace-reveal__value').textContent === '12');
  m4.play();
  await sleep(40);
  m4.reset();
  await sleep(650);
  check('M04 replace rapid latest target', m4.getState().phase === 'before' && object.querySelector('.nviz-replace-reveal__value').textContent === '12');
  m4.play({ animate: false });
  m4.replay();
  await sleep(40);
  check('M04 replay starts from before', m4.getState().phase === 'before' && m4.el.getAttribute('data-anim') === 'waiting', m4.getState().phase);
  await sleep(800);
  check('M04 replay ends after with one value', m4.getState().phase === 'after' && object.querySelectorAll('.nviz-replace-reveal__value').length === 1 && object.querySelector('.nviz-replace-reveal__value').textContent === '14');
  m4.update({ mode: 'reveal', before: { id: 'count', label: '计数器', value: 12 }, after: { id: 'count', label: '计数器', value: 14, detail: '内部说明' } });
  check('M04 update mode resets', m4.getState().mode === 'reveal' && m4.getState().phase === 'before' && m4.getTarget('object') === object);
  m4.destroy();
  m4.destroy();
  check('M04 destroy idempotent', !document.body.contains(m4.el) && m4.getTarget('object') === null);
  return checks;
});

await evalChecks('M04 reveal and cancellation', async () => {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail) });
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rootEl = document.getElementById('root');
  rootEl.replaceChildren();
  const host = document.createElement('div');
  rootEl.appendChild(host);
  const m4 = NoteViz.ReplaceReveal.mount(host, {
    mode: 'reveal',
    before: { id: 'box', label: '配置对象', value: '{ … }', detail: '' },
    after: { id: 'box', label: '配置对象', value: '{ … }', detail: 'theme = quiet；density = 3。' }
  });
  const object = m4.getTarget('object');
  const detail = m4.getTarget('detail');
  const topBefore = object.getBoundingClientRect().top;
  check('M04 reveal collapsed initially', getComputedStyle(detail.parentElement).visibility === 'hidden' || detail.parentElement.getBoundingClientRect().height === 0);
  m4.play();
  check('M04 reveal animation observable', m4.el.getAttribute('data-anim') === 'running' && object.getAnimations({ subtree: true }).length > 0, m4.el.getAttribute('data-anim'));
  await sleep(650);
  check('M04 reveal terminal', m4.getState().phase === 'after');
  check('M04 detail visible and accessible', detail.getBoundingClientRect().height > 20 && detail.parentElement.getAttribute('aria-hidden') === 'false');
  check('M04 reveal top stable', Math.abs(object.getBoundingClientRect().top - topBefore) <= 1);
  check('M04 reveal has before cue', detail.textContent.includes('展开前') && detail.textContent.includes('{ … }'));
  check('M04 reveal animations cleaned', object.getAnimations({ subtree: true }).length === 0, object.getAnimations({ subtree: true }).length);
  m4.reset();
  await sleep(650);
  check('M04 reveal collapse reset', m4.getState().phase === 'before' && (detail.parentElement.getAttribute('aria-hidden') === 'true'));
  m4.play();
  await sleep(30);
  m4.destroy();
  check('M04 destroy during reveal animation', !document.body.contains(m4.el) && m4.getTarget('detail') === null);
  await sleep(50);
  check('M04 destroy stops animations', document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.isConnected).length === 0);
  return checks;
});

await evalChecks('M04 multi-instance', async () => {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail) });
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rootEl = document.getElementById('root');
  rootEl.replaceChildren();
  const host = document.createElement('div');
  rootEl.appendChild(host);
  const a = NoteViz.ReplaceReveal.mount(host, {
    mode: 'replace',
    before: { id: 'a', label: 'A', value: 1 },
    after: { id: 'a', label: 'A', value: 2 }
  });
  const b = NoteViz.ReplaceReveal.mount(host, {
    mode: 'reveal',
    before: { id: 'b', label: 'B', value: 'x' },
    after: { id: 'b', label: 'B', value: 'x', detail: '细节' }
  });
  a.play();
  b.play();
  await sleep(650);
  check('M04 multi-instance states independent', a.getState().phase === 'after' && b.getState().phase === 'after');
  check('M04 multi-instance values independent', a.getState().value === '2' && b.getState().value === 'x');
  a.destroy();
  check('M04 other instance survives destroy', document.body.contains(b.el) && b.getState().phase === 'after');
  b.destroy();
  return checks;
});

await evalChecks('narrow container at wide viewport', async () => {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail) });
  const rootEl = document.getElementById('root');
  rootEl.replaceChildren();
  const host = document.createElement('div');
  host.style.width = '300px';
  rootEl.appendChild(host);
  const m2 = NoteViz.Transfer.mount(host, { object: { id: 'n', label: '窄容器对象' } });
  const m3 = NoteViz.SplitMerge.mount(host, { mode: 'split', before: [{ id: 's', label: '来源' }], after: [{ id: 'a', label: '结果 A' }, { id: 'b', label: '结果 B' }] });
  m3.play({ animate: false });
  await new Promise((resolve) => setTimeout(resolve, 80));
  const stage = m2.el.querySelector('.nviz-transfer__stage');
  const cols = getComputedStyle(stage).gridTemplateColumns.trim().split(/\s+/).filter(Boolean);
  check('M02 container query stacks internal zones', cols.length === 1, cols.join(' | '));
  check('M03 narrow container renders links', m3.el.querySelectorAll('.nviz-split-merge__link').length === 2);
  const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  check('narrow host no page overflow', overflow <= 2, 'overflow=' + overflow);
  m2.destroy(); m3.destroy();
  return checks;
});

check('normal page console empty', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 600));
await normal.context.close();

/* ---------------- 减少动效页 ---------------- */
const reduced = await makePage(browser, { label: 'reduced', reduced: true });
activeEvalPage = reduced.page;
await evalChecks('reduced motion', async () => {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail) });
  const rootEl = document.getElementById('root');
  rootEl.replaceChildren();
  const host = document.createElement('div');
  rootEl.appendChild(host);
  check('reduced preference seen', NoteCore.motion.reduced());
  const m1 = NoteViz.SequenceEdit.mount(host, { items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], animate: true });
  m1.remove('a');
  check('reduced M01 immediate', m1.getState().items.length === 1 && m1.el.querySelectorAll('.nviz-sequence-edit__item--ghost').length === 0);
  check('reduced M01 no animation', m1.el.getAnimations({ subtree: true }).length === 0);

  let settle = 0;
  const m2 = NoteViz.Transfer.mount(host, { object: { id: 'p', label: 'P' }, onSettle: () => { settle += 1; } });
  const obj = m2.getTarget('object');
  m2.send();
  check('reduced M02 immediate target', m2.getTarget('target').contains(obj) && m2.getState().settled);
  check('reduced M02 no trail', document.querySelectorAll('.nviz-transfer__trail').length === 0);
  check('reduced M02 settle sync', settle === 1);

  let settle3 = 0;
  const m3 = NoteViz.SplitMerge.mount(host, {
    mode: 'split',
    before: [{ id: 's', label: 'S' }],
    after: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    onSettle: () => { settle3 += 1; }
  });
  m3.play();
  check('reduced M03 immediate after', m3.getState().phase === 'after' && getComputedStyle(m3.getTarget('a')).visibility === 'visible');
  check('reduced M03 no animation', m3.el.getAnimations({ subtree: true }).length === 0 && settle3 === 1);

  const m4 = NoteViz.ReplaceReveal.mount(host, {
    mode: 'reveal',
    before: { id: 'o', label: 'O', value: '1', detail: '' },
    after: { id: 'o', label: 'O', value: '1', detail: '内部内容' }
  });
  m4.play();
  const detail = m4.getTarget('detail');
  check('reduced M04 immediate detail', m4.getState().phase === 'after' && detail.getBoundingClientRect().height > 20);
  check('reduced M04 no animation', m4.getTarget('object').getAnimations({ subtree: true }).length === 0);

  m1.destroy(); m2.destroy(); m3.destroy(); m4.destroy();
  return checks;
});
check('reduced page console empty', pageErrors.filter((x) => x.startsWith('reduced')).length === 0, pageErrors.filter((x) => x.startsWith('reduced')).join(' | ').slice(0, 600));
await reduced.context.close();

/* ---------------- 窄视口 ---------------- */
const narrow = await makePage(browser, { label: 'narrow', width: 390, height: 844 });
activeEvalPage = narrow.page;
await evalChecks('narrow layout', async () => {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail) });
  const rootEl = document.getElementById('root');
  rootEl.replaceChildren();
  const host = document.createElement('div');
  rootEl.appendChild(host);
  const m1 = NoteViz.SequenceEdit.mount(host, {
    items: [{ id: 'a', label: '一段较长的中文对象名称' }, { id: 'b', label: 'second-long-english-object-label' }, { id: 'c', label: '第三项' }]
  });
  const m2 = NoteViz.Transfer.mount(host, { object: { id: 'p', label: '窄屏传递对象' }, sourceLabel: '较长的起点名称', targetLabel: '较长的终点名称' });
  const m3 = NoteViz.SplitMerge.mount(host, { mode: 'split', before: [{ id: 's', label: '较长的来源对象' }], after: [{ id: 'a', label: '结果一' }, { id: 'b', label: '结果二' }, { id: 'c', label: '结果三' }] });
  const m4 = NoteViz.ReplaceReveal.mount(host, { mode: 'reveal', before: { id: 'o', label: '窄屏对象', value: 'value', detail: '' }, after: { id: 'o', label: '窄屏对象', value: 'value', detail: '很长的内部说明文字用于测试窄屏换行与高度展开。' } });
  m2.send({ animate: false });
  m3.play({ animate: false });
  m4.play({ animate: false });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  check('narrow 390 no horizontal page overflow', overflow <= 2, 'overflow=' + overflow);
  check('narrow roots exist', !!m1.el.parentNode && !!m2.el.parentNode && !!m3.el.parentNode && !!m4.el.parentNode);
  check('narrow M03 connectors visible', m3.el.querySelectorAll('.nviz-split-merge__link').length === 3);
  check('narrow M02 target owns object', m2.getTarget('target').contains(m2.getTarget('object')));
  check('narrow M04 detail expanded', m4.getTarget('detail').getBoundingClientRect().height > 20);
  m1.destroy(); m2.destroy(); m3.destroy(); m4.destroy();
  return checks;
});
check('narrow page console empty', pageErrors.filter((x) => x.startsWith('narrow')).length === 0, pageErrors.filter((x) => x.startsWith('narrow')).join(' | ').slice(0, 600));
await narrow.context.close();

/* ---------------- Gallery demos ---------------- */
const demoPage = await makePage(browser, { label: 'demos', demos: true, width: 1000, height: 900 });
const dp = demoPage.page;
async function resetDemoHost() {
  await dp.evaluate(() => {
    if (window.__demoInstance && window.__demoInstance.destroy) window.__demoInstance.destroy();
    window.__demoInstance = null;
    document.getElementById('root').replaceChildren();
    const host = document.createElement('div');
    host.id = 'demo-host';
    document.getElementById('root').appendChild(host);
  });
}
async function mountDemo(id) {
  const exists = await dp.evaluate((demoId) => typeof window.NoteGalleryDemos[demoId] === 'function', id);
  check(id + ' demo registered', exists);
  if (!exists) return false;
  await dp.evaluate((demoId) => {
    window.__demoInstance = window.NoteGalleryDemos[demoId](document.getElementById('demo-host'));
  }, id);
  return true;
}

await resetDemoHost();
if (await mountDemo('M01')) {
  const initial = await dp.evaluate(() => ({
    demos: document.querySelectorAll('.nviz-mech-demo').length,
    editables: document.querySelectorAll('button').length,
    objects: document.querySelectorAll('.nviz-sequence-edit__item').length
  }));
  check('M01 demo real mount', initial.demos === 1 && initial.objects === 4 && initial.editables >= 5, JSON.stringify(initial));
  await dp.getByRole('button', { name: /^删除「/ }).click();
  await dp.waitForTimeout(780);
  await dp.getByRole('button', { name: '移动', exact: true }).click();
  await dp.getByRole('button', { name: /^把「/ }).click();
  await dp.waitForTimeout(780);
  check('M01 demo updated objects', await dp.evaluate(() => document.querySelectorAll('.nviz-sequence-edit__item').length === 3));
  check('M01 demo no ghost', await dp.evaluate(() => document.querySelectorAll('.nviz-sequence-edit__item--ghost').length === 0));
  await dp.getByRole('button', { name: '重看', exact: true }).click();
  await dp.waitForTimeout(90);
  await dp.evaluate(() => window.__demoInstance.destroy());
  await dp.waitForTimeout(1050);
  check('M01 demo destroy cleanup and timer', await dp.evaluate(() => document.querySelectorAll('.nviz-sequence-edit').length === 0));
}

await resetDemoHost();
if (await mountDemo('M02')) {
  await dp.getByRole('button', { name: '传递对象', exact: true }).click();
  await dp.waitForTimeout(800);
  check('M02 demo terminal at target', await dp.evaluate(() => {
    const zones = document.querySelectorAll('.nviz-transfer__zone');
    return zones.length === 2 && zones[1].querySelectorAll('.nviz-transfer__object').length === 1 && zones[0].querySelectorAll('.nviz-transfer__object').length === 0;
  }));
  check('M02 demo trail cleaned', await dp.evaluate(() => document.querySelectorAll('.nviz-transfer__trail').length === 0));
  await dp.getByRole('button', { name: '换对象标签', exact: true }).click();
  await dp.getByRole('button', { name: '回到起点', exact: true }).click();
  await dp.waitForTimeout(780);
  await dp.getByRole('button', { name: '传递对象', exact: true }).click();
  await dp.waitForTimeout(40);
  await dp.evaluate(() => window.__demoInstance.destroy());
  await dp.waitForTimeout(100);
  check('M02 demo destroy during animation', await dp.evaluate(() => document.querySelectorAll('.nviz-transfer').length === 0 && document.querySelectorAll('.nviz-transfer__trail').length === 0));
}

await resetDemoHost();
if (await mountDemo('M03')) {
  await dp.getByRole('button', { name: '播放变化', exact: true }).click();
  await dp.waitForTimeout(1200);
  check('M03 demo split result', await dp.evaluate(() => {
    const cards = document.querySelectorAll('.nviz-split-merge__card');
    return cards.length === 4 && document.querySelectorAll('.nviz-split-merge__link').length === 3;
  }));
  await dp.getByRole('button', { name: '合并', exact: true }).click();
  await dp.getByRole('button', { name: '播放变化', exact: true }).click();
  await dp.waitForTimeout(1200);
  check('M03 demo merge result', await dp.evaluate(() => {
    const cards = document.querySelectorAll('.nviz-split-merge__card');
    return cards.length === 4 && document.querySelectorAll('.nviz-split-merge__link').length === 3;
  }));
  await dp.evaluate(() => window.__demoInstance.destroy());
  await dp.waitForTimeout(100);
  check('M03 demo destroy cleanup', await dp.evaluate(() => document.querySelectorAll('.nviz-split-merge').length === 0));
}

await resetDemoHost();
if (await mountDemo('M04')) {
  await dp.getByRole('button', { name: '播放变化', exact: true }).click();
  await dp.waitForTimeout(750);
  check('M04 demo replace state', await dp.evaluate(() => {
    const v = document.querySelector('.nviz-replace-reveal__value');
    return v && v.textContent === '14';
  }));
  await dp.getByRole('button', { name: '展开内部', exact: true }).click();
  await dp.getByRole('button', { name: '播放变化', exact: true }).click();
  await dp.waitForTimeout(750);
  check('M04 demo reveal detail', await dp.evaluate(() => {
    const d = document.querySelector('.nviz-replace-reveal__detail-panel');
    return d && d.getBoundingClientRect().height > 20;
  }));
  await dp.getByRole('button', { name: '重看', exact: true }).click();
  await dp.waitForTimeout(40);
  await dp.evaluate(() => window.__demoInstance.destroy());
  await dp.waitForTimeout(800);
  check('M04 demo destroy during animation and timer', await dp.evaluate(() => document.querySelectorAll('.nviz-replace-reveal').length === 0));
}
await dp.setViewportSize({ width: 390, height: 844 });
for (const id of ['M01', 'M02', 'M03', 'M04']) {
  await resetDemoHost();
  if (await mountDemo(id)) {
    await dp.waitForTimeout(120);
    const narrowInfo = await dp.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      demoCount: document.querySelectorAll('.nviz-mech-demo').length
    }));
    check(id + ' demo narrow 390 no overflow', narrowInfo.overflow <= 2 && narrowInfo.demoCount === 1, JSON.stringify(narrowInfo));
    await dp.evaluate(() => window.__demoInstance.destroy());
    await dp.waitForTimeout(50);
  }
}
check('demo page console empty', pageErrors.filter((x) => x.startsWith('demos')).length === 0, pageErrors.filter((x) => x.startsWith('demos')).join(' | ').slice(0, 600));
const residualLayers = await dp.evaluate(() => ({
  trails: document.querySelectorAll('.nviz-transfer__trail').length,
  floating: document.querySelectorAll('.hnv-floating').length,
  mechanismRoots: document.querySelectorAll('.nviz-sequence-edit, .nviz-transfer, .nviz-split-merge, .nviz-replace-reveal').length
}));
check('demo page no residual overlays', residualLayers.trails === 0 && residualLayers.floating === 0, JSON.stringify(residualLayers));
await demoPage.context.close();

await browser.close();

/* ---------------- 静态与清单检查（文件清单从 manifest 推导） ---------------- */
const productionJsFiles = readModuleSources(root, 'viz-mechanisms');
const productionCssFiles = readModuleSources(root, 'viz-mechanisms', 'css');
const productionDemo = moduleDemos(root, ['viz-mechanisms'])[0];
const productionManifest = src('src/manifests/viz-mechanisms.json');
const productionDocs = src('docs/viz-mechanisms.md');

check('manifest declares mechanism javascript', productionJsFiles.length > 0, productionJsFiles.map((file) => file.relative).join(', '));
check('manifest declares mechanism css', productionCssFiles.length > 0, productionCssFiles.map((file) => file.relative).join(', '));
check('demo file exists', !!productionDemo && fs.existsSync(productionDemo), productionDemo || 'no demo declared');
check('manifest file exists', fs.existsSync(productionManifest), productionManifest);
check('docs file exists', fs.existsSync(productionDocs), productionDocs);
for (const file of productionJsFiles) {
  const js = file.content;
  check('no fetch( ' + file.relative, !/\bfetch\s*\(/.test(js));
  check('no https runtime resource ' + file.relative, !/https:\/\//.test(js));
  check('no eval( ' + file.relative, !/\beval\s*\(/.test(js));
  check('no innerHTML assignment ' + file.relative, !/\.innerHTML\s*=/.test(js));
  check('no HTML string injection ' + file.relative, !/insertAdjacentHTML\s*\(/.test(js));
}
for (const file of productionCssFiles) {
  const css = file.content;
  const vars = Array.from(css.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)).map((m) => m[1]);
  const badVars = Array.from(new Set(vars.filter((v) => v.indexOf('--hnv-') !== 0)));
  check('css only --hnv variables', badVars.length === 0, badVars.join(','));
  check('css no :root declarations', !/:root\s*\{/.test(css));
  check('css no bare global body selector', !/(^|\n)\s*body\s*\{/.test(css));
  check('css no raw id selectors', !/(^|\n)\s*#[a-zA-Z]/.test(css));
  const cleanCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let braceDepth = 0;
  let minBraceDepth = 0;
  for (let i = 0; i < cleanCss.length; i += 1) {
    if (cleanCss[i] === '{') braceDepth += 1;
    if (cleanCss[i] === '}') braceDepth -= 1;
    if (braceDepth < minBraceDepth) minBraceDepth = braceDepth;
  }
  check('css braces balanced', braceDepth === 0 && minBraceDepth === 0, 'depth=' + braceDepth + ',min=' + minBraceDepth);
  const selectors = [];
  for (let i = 0; i < cleanCss.length; i += 1) {
    if (cleanCss[i] !== '{') continue;
    let j = i - 1;
    while (j >= 0 && cleanCss[j] !== '}' && cleanCss[j] !== '{' && cleanCss[j] !== ';') j -= 1;
    const candidate = cleanCss.slice(j + 1, i).trim();
    if (candidate && candidate[0] !== '@') selectors.push(candidate);
  }
  const badSelectors = [];
  selectors.forEach((group) => {
    group.split(',').forEach((part) => {
      const selector = part.trim();
      if (selector && selector.indexOf('.nviz-') !== 0) badSelectors.push(selector);
    });
  });
  check('css selectors scoped to .nviz', badSelectors.length === 0, badSelectors.slice(0, 4).join(' | '));
}
if (productionDemo && fs.existsSync(productionDemo)) {
  const demo = fs.readFileSync(productionDemo, 'utf8');
  check('no fetch in demo', !/\bfetch\s*\(/.test(demo));
  check('no https in demo', !/https:\/\//.test(demo));
  check('no innerHTML in demo', !/\.innerHTML\s*=/.test(demo));
  check('demo exposes M01-M04', ['M01', 'M02', 'M03', 'M04'].every((id) => demo.indexOf('demos.' + id) >= 0 || demo.indexOf("demos['" + id + "']") >= 0));
}
if (fs.existsSync(productionManifest)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(productionManifest, 'utf8'));
    const ids = manifest.entries.map((e) => e.id).join(',');
    check('manifest parses and has four IDs', ids === 'M01,M02,M03,M04', ids);
    check('manifest category', manifest.entries.every((e) => e.category === '可复用变化机制'));
    check('manifest consensus', manifest.entries.every((e) => Array.isArray(e.consensus) && e.consensus.join(',') === 'K04,K05,K06,K12'));
    check('manifest review not-reviewed', manifest.entries.every((e) => e.userReview === 'not-reviewed'));
    check('manifest dependency core', manifest.dependencies.join(',') === 'core' && manifest.entries.every((e) => e.dependencies.join(',') === 'core'));
  } catch (error) {
    check('manifest parses', false, error.message);
  }
}
if (fs.existsSync(productionDocs)) {
  const docs = fs.readFileSync(productionDocs, 'utf8');
  check('docs has all anchors', ['M01', 'M02', 'M03', 'M04'].every((id) => docs.includes('<a id="' + id + '"></a>')));
  check('docs names R10 insert boundary', /R10|SeqInsert/.test(docs));
  check('docs documents reduce motion', /减少动效|reduced-motion/.test(docs));
}

const failed = checks.filter((c) => !c.ok);
const summary = {
  total: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  consoleErrors: pageErrors,
  failures: failed,
  checkedAt: new Date().toISOString()
};
writeCacheJson(root, ['checks', 'viz-mechanisms-check-result.json'], { summary, checks });
console.log(JSON.stringify(summary, null, 2));
if (failed.length || pageErrors.length) process.exitCode = 1;
