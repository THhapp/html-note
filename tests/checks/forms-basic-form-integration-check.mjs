/* Cross-module check: NoteUI.Form (forms-advanced) consuming F01–F07 controls. */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { moduleScripts, moduleStyles } from '../lib/src-sources.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('../tools/node_modules/playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODULES = ['core', 'ui-forms-basic', 'ui-forms-advanced'];
const failures = [];
let passed = 0;
function check(name, ok, detail) { if (ok) passed += 1; else failures.push({ name, detail }); }
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
page.setDefaultTimeout(5000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
// 源码清单从 manifest 推导，替代旧的 test/checks/*.html 夹具，表单拆分后无需同步。
await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body><div id="test-root"></div></body></html>');
for (const file of moduleStyles(root, MODULES)) await page.addStyleTag({ path: path.join(root, file) });
for (const file of moduleScripts(root, MODULES)) await page.addScriptTag({ path: path.join(root, file) });
await page.waitForFunction(() => window.NoteUI && NoteUI.Form && NoteUI.NumberInput);
const initial = await page.evaluate(() => {
  const host = document.getElementById('test-root');
  window.__changes = [];
  window.__submits = [];
  window.__form = NoteUI.Form.mount(host, {
    label: '集成表单',
    fields: [
      { name: 'title', label: '标题', control: 'text', required: true, defaultValue: '', options: { placeholder: '请输入标题' } },
      { name: 'note', label: '说明', control: 'textarea', defaultValue: '', options: { rows: 2, maxLength: 80 } },
      { name: 'budget', label: '预算', control: 'number', defaultValue: null, options: { min: 0, max: 100, step: 1, clearable: true } },
      { name: 'agree', label: '确认填写无误', control: 'checkbox', defaultValue: false, required: true },
      { name: 'channel', label: '渠道', control: 'select', defaultValue: 'email', options: [
        { value: 'email', label: '邮件' }, { value: 'sms', label: '短信' }
      ] }
    ],
    onChange: function (values, name) { window.__changes.push({ name: name, values: values }); },
    onSubmit: function (values) { window.__submits.push(values); }
  });
  return { value: window.__form.getValue(), fields: document.querySelectorAll('.nui-field').length, formTag: !!document.querySelector('form') };
});
check('Form mounts all basic controls', initial.value && initial.fields === 5 && initial.formTag, initial);
check('Form initial values keep number null and select raw value', initial.value.title === '' && initial.value.budget === null && initial.value.agree === false && initial.value.channel === 'email', initial.value);
await page.locator('#test-root form').evaluate((form) => form.requestSubmit());
let state = await page.evaluate(() => ({
  submits: window.__submits.length,
  errors: Array.from(document.querySelectorAll('.nui-field__error')).filter((el) => !el.hidden).map((el) => el.textContent),
  summary: document.querySelector('.nui-form__summary') ? document.querySelector('.nui-form__summary').textContent : ''
}));
check('required validation prevents submit and shows field errors', state.submits === 0 && state.errors.length >= 2, state);
await page.locator('#test-root .nui-textinput__control').fill('集成标题');
await page.locator('#test-root .nui-checkbox__control').click();
state = await page.evaluate(() => ({ changes: window.__changes.length, value: window.__form.getValue() }));
check('user edits reach Form values and onChange', state.changes >= 2 && state.value.title === '集成标题' && state.value.agree === true, state);
await page.locator('#test-root .nui-numberinput__control').fill('abc');
await page.locator('#test-root form').evaluate((form) => form.requestSubmit());
state = await page.evaluate(() => ({
  submits: window.__submits.length,
  numberError: window.__form.getValue().budget,
  visibleErrors: Array.from(document.querySelectorAll('.nui-field__error')).filter((el) => !el.hidden).map((el) => el.textContent)
}));
check('NumberInput draft error blocks Form submit without fake value', state.submits === 0 && state.numberError === null && state.visibleErrors.some((text) => text.indexOf('请输入有效数字') >= 0), state);
await page.locator('#test-root .nui-numberinput__control').fill('25');
await page.locator('#test-root .nui-numberinput__control').press('Tab');
await page.locator('#test-root .nui-select__native').selectOption({ label: '短信' });
await page.locator('#test-root form').evaluate((form) => form.requestSubmit());
state = await page.evaluate(() => ({ submits: window.__submits.slice(), value: window.__form.getValue(), errors: Array.from(document.querySelectorAll('.nui-field__error')).filter((el) => !el.hidden).length }));
check('valid submit passes raw host values', state.submits.length === 1 && state.submits[0].budget === 25 && state.submits[0].channel === 'sms' && state.errors === 0, state);
await page.evaluate(() => { window.__form.reset(); });
state = await page.evaluate(() => ({ value: window.__form.getValue(), submits: window.__submits.length }));
check('reset restores defaults and keeps number null', state.value.title === '' && state.value.budget === null && state.value.agree === false && state.value.channel === 'email' && state.submits === 1, state);
await page.evaluate(() => { window.__form.destroy(); });
state = await page.evaluate(() => ({ rootChildren: document.getElementById('test-root').children.length, fields: document.querySelectorAll('.nui-field').length }));
check('Form destroy removes wrapped basic components', state.rootChildren === 0 && state.fields === 0, state);
check('No console/page errors in integration', errors.length === 0, errors);
console.log('=== forms-basic + Form integration ===');
console.log('PASSED:', passed, 'FAILED:', failures.length);
if (failures.length) console.log(JSON.stringify(failures, null, 2));
await browser.close();
process.exitCode = failures.length ? 1 : 0;
