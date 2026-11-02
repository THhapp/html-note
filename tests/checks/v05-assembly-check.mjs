#!/usr/bin/env node
/*
 * V05 assembly contract checks (T3 source changes, all additive):
 * - NoteExpr.Range: optional show({ offset }) / read-only range.offset (default 10, invalid throws).
 * - NoteUI.Field: optional hintSlot / errorSlot (aria-describedby + stable height).
 * - NoteUI.NumberInput: optional messageSlot (message placed there, control height stable).
 * - NoteUI.Notice: content accepts text or a single DOM node; arrays/objects throw TypeError.
 *
 * Loads src directly through tests/lib/src-sources.mjs. Usage: node tests/checks/v05-assembly-check.mjs
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
const MODULES = ['core', 'legacy', 'ui-forms-basic'];
const STYLES = moduleStyles(root, MODULES);
const SCRIPTS = moduleScripts(root, MODULES);

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail: String(detail == null ? '' : detail) });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : ' :: ' + String(detail).slice(0, 400)));
}

const browser = await chromium.launch({ executablePath: edge, headless: true });
const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push('pageerror: ' + error.message));
page.on('console', (message) => { if (message.type() === 'error') pageErrors.push('console: ' + message.text()); });
await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}body{padding:20px;background:#f4f6f9}.v05-target{position:fixed;z-index:5;background:#e8eefc;border:1px solid #9db2d6}</style></head><body><main id="root"></main></body></html>');
for (const rel of STYLES) await page.addStyleTag({ path: src(rel) });
for (const rel of SCRIPTS) await page.addScriptTag({ path: src(rel) });

function report(rows, label) {
  for (const row of rows) check(row.name, row.ok, row.detail);
}

/* 1. Range offset */
{
  const rows = await page.evaluate(async () => {
    const out = [];
    const check = (name, ok, detail) => out.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const rootEl = document.getElementById('root');
    rootEl.replaceChildren();
    const a = document.createElement('div');
    a.className = 'v05-target';
    a.style.cssText += 'left:80px;top:120px;width:80px;height:36px';
    const b = document.createElement('div');
    b.className = 'v05-target';
    b.style.cssText += 'left:260px;top:120px;width:120px;height:36px';
    document.body.append(a, b);
    const unionBottom = Math.max(a.getBoundingClientRect().bottom, b.getBoundingClientRect().bottom);
    const range = NoteExpr.Range.mount({ motion: 'never' });
    out.push({ name: 'Range offset 默认 10', ok: range.offset === 10, detail: String(range.offset) });
    range.show({ targets: [a, b], text: '范围', side: 'below', orientation: 'h' });
    await sleep(40);
    const bracket = range.el.querySelector('.nx-range__bracket');
    const firstTop = bracket ? bracket.getBoundingClientRect().top : NaN;
    out.push({ name: 'Range 默认 offset 的括线位置', ok: !!bracket && Math.abs(firstTop - (unionBottom + 10)) <= 1.5,
      detail: JSON.stringify({ bracketTop: firstTop, expected: unionBottom + 10 }) });
    range.show({ targets: [a, b], text: '范围', side: 'below', orientation: 'h', offset: 24 });
    await sleep(40);
    const bracket2 = range.el.querySelector('.nx-range__bracket');
    const secondTop = bracket2 ? bracket2.getBoundingClientRect().top : NaN;
    out.push({ name: 'Range 自定义 offset 24 生效且只读 offset=24', ok: range.offset === 24 &&
      !!bracket2 && Math.abs(secondTop - (unionBottom + 24)) <= 1.5,
      detail: JSON.stringify({ offset: range.offset, bracketTop: secondTop, expected: unionBottom + 24 }) });
    let invalidMessage = '';
    try { range.show({ targets: [a], text: '', offset: -5 }); } catch (error) { invalidMessage = String(error.message); }
    out.push({ name: 'Range 非法 offset 负数报错', ok: /NoteExpr\.Range/.test(invalidMessage) && /offset/.test(invalidMessage), detail: invalidMessage });
    let nonNumericMessage = '';
    try { range.show({ targets: [a], text: '', offset: 'abc' }); } catch (error) { nonNumericMessage = String(error.message); }
    out.push({ name: 'Range 非法 offset 非数字报错', ok: /NoteExpr\.Range/.test(nonNumericMessage) && /offset/.test(nonNumericMessage), detail: nonNumericMessage });
    range.show({ targets: [a, b], text: '范围', side: 'below', orientation: 'h' });
    await sleep(40);
    out.push({ name: 'Range 省略 offset 回到默认 10', ok: range.offset === 10, detail: String(range.offset) });
    range.destroy();
    a.remove();
    b.remove();
    return out;
  });
  report(rows);
}

/* 2. Field hintSlot / errorSlot */
{
  const rows = await page.evaluate(async () => {
    const out = [];
    const check = (name, ok, detail) => out.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const rootEl = document.getElementById('root');
    rootEl.replaceChildren();
    const wrap = document.createElement('div');
    const fieldHost = document.createElement('div');
    const hintSlot = document.createElement('div');
    hintSlot.className = 'v05-hint-slot';
    const errorSlot = document.createElement('div');
    errorSlot.className = 'v05-error-slot';
    wrap.append(fieldHost, hintSlot, errorSlot);
    rootEl.appendChild(wrap);
    const inputHost = document.createElement('div');
    wrap.appendChild(inputHost);
    const text = NoteUI.TextInput.mount(inputHost, { value: '', label: '标题' });
    const field = NoteUI.Field.mount(fieldHost, { label: '标题', hint: '默认说明', control: text, hintSlot: hintSlot, errorSlot: errorSlot });
    await sleep(30);
    const input = fieldHost.querySelector('input, textarea, select, [role="textbox"]') || wrap.querySelector('input');
    const hintEl = hintSlot.querySelector('.nui-field__hint, [id]') || hintSlot.firstElementChild;
    const describedBy = input ? (input.getAttribute('aria-describedby') || '') : '';
    const describedNodes = describedBy.split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)).filter(Boolean);
    check('Field hintSlot：hint 节点进入外部 slot', !!hintEl && hintSlot.contains(hintEl),
      JSON.stringify({ hintSlotChildren: hintSlot.children.length, describedBy }));
    check('Field hintSlot：aria-describedby 指向 slot 内说明', describedBy.length > 0 && describedNodes.some((node) => hintSlot.contains(node)),
      JSON.stringify({ describedBy, ids: describedNodes.map((node) => node && node.id) }));
    const heightBefore = fieldHost.getBoundingClientRect().height;
    field.setError('必填错误');
    await sleep(30);
    const errorEl = errorSlot.querySelector('.nui-field__error, [id]') || errorSlot.firstElementChild;
    const heightAfter = fieldHost.getBoundingClientRect().height;
    check('Field errorSlot：错误显示在外部 slot', !!errorEl && errorSlot.textContent.includes('必填错误'),
      JSON.stringify({ errorText: errorSlot.textContent }));
    check('Field slot：错误出现时字段高度稳定', Math.abs(heightAfter - heightBefore) <= 1.5,
      JSON.stringify({ heightBefore, heightAfter }));
    const describedAfter = input ? (input.getAttribute('aria-describedby') || '') : '';
    check('Field slot：错误时 aria-describedby 含错误区', describedAfter.length > 0 &&
      describedAfter.split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)).some((node) => node && errorSlot.contains(node)),
      JSON.stringify({ describedAfter }));
    field.destroy();
    text.destroy();
    const remaining = hintSlot.childElementCount + errorSlot.childElementCount;
    check('Field slot：destroy 清理外部 slot 中的节点', remaining === 0 && !fieldHost.children.length,
      JSON.stringify({ hintSlotChildren: hintSlot.childElementCount, errorSlotChildren: errorSlot.childElementCount }));
    return out;
  });
  report(rows);
}

/* 3. NumberInput messageSlot */
{
  const rows = await page.evaluate(async () => {
    const out = [];
    const check = (name, ok, detail) => out.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const rootEl = document.getElementById('root');
    rootEl.replaceChildren();
    const host = document.createElement('div');
    const messageSlot = document.createElement('div');
    messageSlot.className = 'v05-message-slot';
    rootEl.append(host, messageSlot);
    const number = NoteUI.NumberInput.mount(host, { value: 1, min: 0, max: 10, step: 1, messageSlot: messageSlot });
    await sleep(30);
    const input = host.querySelector('input');
    const heightBefore = host.getBoundingClientRect().height;
    input.value = 'abc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    await sleep(40);
    const heightAfter = host.getBoundingClientRect().height;
    check('NumberInput messageSlot：错误信息进入外部 slot', messageSlot.textContent.trim().length > 0 && !!messageSlot.firstElementChild,
      JSON.stringify({ message: messageSlot.textContent.trim().slice(0, 80) }));
    check('NumberInput messageSlot：错误出现时工具栏高度稳定', Math.abs(heightAfter - heightBefore) <= 1.5,
      JSON.stringify({ heightBefore, heightAfter }));
    number.destroy();
    return out;
  });
  report(rows);
}

/* 4. Notice content contract */
{
  const rows = await page.evaluate(async () => {
    const out = [];
    const check = (name, ok, detail) => out.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    const rootEl = document.getElementById('root');
    rootEl.replaceChildren();
    const host = document.createElement('div');
    rootEl.appendChild(host);
    const textNotice = NoteUI.Notice.mount(host, { title: '说明', content: '纯文本内容' });
    check('Notice 文本内容仍可挂载', textNotice.el.textContent.includes('纯文本内容'));
    const node = document.createElement('strong');
    node.textContent = '单节点内容';
    const nodeNotice = NoteUI.Notice.mount(document.createElement('div'), { title: '说明', content: node });
    check('Notice 单个 DOM 节点被移入', nodeNotice.el.contains(node) && nodeNotice.el.textContent.includes('单节点内容'));
    let arrayError = null;
    try { NoteUI.Notice.mount(document.createElement('div'), { title: '说明', content: [node] }); } catch (error) { arrayError = { name: error.name, message: String(error.message) }; }
    check('Notice 数组内容抛 TypeError', !!arrayError && arrayError.name === 'TypeError' &&
      /NoteUI\.Notice/.test(arrayError.message) && /content/.test(arrayError.message), JSON.stringify(arrayError));
    let objectError = null;
    try { NoteUI.Notice.mount(document.createElement('div'), { title: '说明', content: { text: 'x' } }); } catch (error) { objectError = { name: error.name, message: String(error.message) }; }
    check('Notice 普通对象内容抛 TypeError', !!objectError && objectError.name === 'TypeError' &&
      /NoteUI\.Notice/.test(objectError.message), JSON.stringify(objectError));
    let updateError = null;
    try { textNotice.update({ content: ['x'] }); } catch (error) { updateError = { name: error.name, message: String(error.message) }; }
    check('Notice update 同样校验内容契约', !!updateError && updateError.name === 'TypeError' && /NoteUI\.Notice/.test(updateError.message), JSON.stringify(updateError));
    const replacement = document.createElement('em');
    replacement.textContent = '更新后的节点';
    textNotice.update({ content: replacement });
    check('Notice update 单个 DOM 节点仍可用', textNotice.el.contains(replacement));
    textNotice.destroy();
    nodeNotice.destroy();
    return out;
  });
  report(rows);
}

check('V05 assembly 区无页面/控制台错误', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
await browser.close();
const failed = checks.filter((row) => !row.ok);
console.log('SUMMARY ' + (checks.length - failed.length) + '/' + checks.length + ' passed');
if (failed.length) process.exitCode = 1;
