// 主控表单组件高风险检查（真实 Edge + 全量 dist）。
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { writeCacheJson } from '../lib/test-output.mjs';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hostUrl = pathToFileURL(path.join(root, 'tests', 'checks', 'host.html')).href;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const results = [];
const errors = [];
function ok(name, pass, detail = '') {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
  if (!pass) console.log('  ✗ ' + name + ' ' + detail);
}
const browser = await chromium.launch({ executablePath: edge, headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const wait = (ms = 120) => page.waitForTimeout(ms);
async function fresh() {
  errors.length = 0;
  await page.goto(hostUrl, { waitUntil: 'load' });
  await page.evaluate(() => { window.__h = {}; window.__events = []; });
  await wait(80);
}

// F01 Field association and error
await fresh();
{
  const state = await page.evaluate(() => {
    const host = document.getElementById('host');
    const input = document.createElement('input');
    input.id = 'manual-input';
    window.__h.field = NoteUI.Field.mount(host, {
      label: '固定标签', hint: '默认可见的辅助说明', required: true, control: input
    });
    const label = host.querySelector('label');
    window.__h.field.setError('这个值不合法。');
    return {
      labelFor: label && label.getAttribute('for'),
      described: (input.getAttribute('aria-describedby') || '').split(/\s+/),
      invalid: input.getAttribute('aria-invalid'),
      error: host.querySelector('.nui-field__error')?.textContent || ''
    };
  });
  ok('Field links label and hint to control', state.labelFor === 'manual-input' && state.described.length >= 2, JSON.stringify(state));
  ok('Field setError is visible and marked invalid', state.invalid === 'true' && /不合法/.test(state.error), JSON.stringify(state));
}

// F02 TextInput user events vs program update
await fresh();
{
  const state = await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.text = NoteUI.TextInput.mount(host, {
      value: '初始', clearable: true,
      onChange: (value, event) => window.__events.push({ value, isEvent: !!event })
    });
    const input = host.querySelector('.nui-textinput__control');
    input.value = '用户输入';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const afterUser = window.__events.length;
    window.__h.text.update({ value: '程序更新' });
    const afterProgram = window.__events.length;
    host.querySelector('.nui-textinput__clear').click();
    return { afterUser, afterProgram, value: window.__h.text.getValue(), events: window.__events };
  });
  ok('TextInput fires onChange for user input', state.afterUser === 1 && state.events[0].value === '用户输入', JSON.stringify(state));
  ok('TextInput program update is silent', state.afterProgram === 1, JSON.stringify(state));
  ok('TextInput clear button clears', state.value === '', JSON.stringify(state));
}

// F03 Textarea count + program update silence
await fresh();
{
  const state = await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.area = NoteUI.Textarea.mount(host, {
      value: '一二三', autoGrow: true, maxLength: 10, showCount: true,
      onChange: () => window.__events.push('user')
    });
    const area = host.querySelector('.nui-textarea__control');
    area.value = '一二三四五六';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    const count = host.querySelector('.nui-textarea__count')?.textContent || '';
    window.__h.area.update({ value: '程序' });
    return { count, events: window.__events.length, value: window.__h.area.getValue() };
  });
  ok('Textarea shows count and stays silent on update', /6/.test(state.count) && /10/.test(state.count) && state.events === 1 && state.value === '程序', JSON.stringify(state));
}

// F04 NumberInput empty/invalid/clamp
await fresh();
{
  const state = await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.num = NoteUI.NumberInput.mount(host, {
      value: 3, min: 0, max: 10, step: 2,
      onChange: (value) => window.__events.push(value)
    });
    const input = host.querySelector('.nui-numberinput__control');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    const empty = window.__h.num.getValue();
    input.value = 'abc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    const invalid = window.__h.num.getValue();
    const error = host.querySelector('.nui-numberinput__message')?.textContent || '';
    input.value = '8';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    const valid = window.__h.num.getValue();
    host.querySelector('.nui-numberinput__step').click();
    return { empty, invalid, error, valid, afterStep: window.__h.num.getValue() };
  });
  ok('NumberInput keeps empty as null, not 0', state.empty === null, JSON.stringify(state));
  ok('NumberInput rejects invalid text', state.invalid === null && /数字|有效|格式/.test(state.error), JSON.stringify(state));
  ok('NumberInput accepts valid number and steps', state.valid === 8 && state.afterStep === 10, JSON.stringify(state));
}

// F05 Checkbox indeterminate and toggle
await fresh();
{
  const state = await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.check = NoteUI.Checkbox.mount(host, {
      label: '选择全部', indeterminate: true,
      onChange: (checked) => window.__events.push(checked)
    });
    const input = host.querySelector('.nui-checkbox__control');
    const indeterminate = input.indeterminate;
    input.click();
    return { indeterminate, checked: window.__h.check.getValue(), events: window.__events };
  });
  ok('Checkbox supports indeterminate and user toggle', state.indeterminate === true && state.checked === true && state.events.length === 1, JSON.stringify(state));
}

// F06 RadioGroup keyboard
await fresh();
{
  await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.radio = NoteUI.RadioGroup.mount(host, {
      value: 'a',
      options: [{ value: 'a', label: '选项甲' }, { value: 'b', label: '选项乙，文本比较长一些' }, { value: 'c', label: '选项丙', disabled: true }],
      onChange: (value) => window.__events.push(value)
    });
    host.querySelector('.nui-radiogroup__control').focus();
  });
  await page.keyboard.press('ArrowDown');
  await wait(100);
  const state = await page.evaluate(() => ({ value: window.__h.radio.getValue(), events: window.__events }));
  ok('RadioGroup arrow keys move selection', state.value === 'b' && state.events.includes('b'), JSON.stringify(state));
}

// F07 Select single/multiple/clear
await fresh();
{
  const state = await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.select = NoteUI.Select.mount(host, {
      value: 'a',
      options: [{ value: 'a', label: '甲' }, { value: 'b', label: '乙' }, { value: 'c', label: '丙', disabled: true }],
      onChange: (value) => window.__events.push(value)
    });
    const native = host.querySelector('.nui-select__native');
    native.selectedIndex = 1;
    native.dispatchEvent(new Event('change', { bubbles: true }));
    const single = window.__h.select.getValue();
    const box = document.createElement('div');
    host.appendChild(box);
    window.__h.multi = NoteUI.Select.mount(box, {
      multiple: true, value: ['a'],
      options: [{ value: 'a', label: '甲' }, { value: 'b', label: '乙' }]
    });
    const multi = box.querySelector('.nui-select__native');
    Array.from(multi.options).forEach(o => { o.selected = ['0', '1'].includes(o.value); });
    multi.dispatchEvent(new Event('change', { bubbles: true }));
    const multiValue = window.__h.multi.getValue();
    const clear = box.querySelector('.nui-select__clear');
    clear && clear.click();
    return { single, multiValue, cleared: window.__h.multi.getValue(), events: window.__events };
  });
  ok('Select single changes value', state.single === 'b' && state.events.includes('b'), JSON.stringify(state));
  ok('Select multiple and clear work', Array.isArray(state.multiValue) && state.multiValue.length === 2 && Array.isArray(state.cleared) && state.cleared.length === 0, JSON.stringify(state));
}

// F08 Combobox filter/keyboard/no results/free text
await fresh();
{
  await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.combo = NoteUI.Combobox.mount(host, {
      value: null, allowFreeText: false,
      options: [{ value: 'a', label: '苹果' }, { value: 'b', label: '香蕉' }, { value: 'c', label: '橙子' }],
      onChange: (value) => window.__events.push(value)
    });
    host.querySelector('.nui-combobox__input').focus();
  });
  await page.keyboard.type('香');
  await wait(150);
  const filtered = await page.evaluate(() => Array.from(document.querySelectorAll('.nui-combobox__option')).map(o => o.textContent.trim()));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await wait(150);
  const selected = await page.evaluate(() => ({ value: window.__h.combo.getValue(), events: window.__events, layers: document.querySelectorAll('.hnv-floating').length }));
  ok('Combobox filters and selects via keyboard', filtered.length === 1 && /香蕉/.test(filtered[0]) && selected.value === 'b', JSON.stringify({ filtered, selected }));
  await page.keyboard.type('不存在');
  await wait(150);
  const empty = await page.evaluate(() => ({ empty: document.querySelector('.nui-combobox__empty')?.textContent || '', value: window.__h.combo.getValue() }));
  ok('Combobox shows no-result state', /无|没有/.test(empty.empty), JSON.stringify(empty));
  await page.keyboard.press('Escape');
  await wait();
  const closed = await page.evaluate(() => document.querySelectorAll('.hnv-floating').length);
  ok('Combobox Esc closes results', closed === 0, 'layers=' + closed);
}

// F09 Switch
await fresh();
{
  const state = await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.switch = NoteUI.Switch.mount(host, { checked: false, label: '启用缓存', onChange: (v) => window.__events.push(v) });
    host.querySelector('.nui-switch__button').click();
    return { value: window.__h.switch.getValue(), events: window.__events, checked: host.querySelector('[role=switch]').getAttribute('aria-checked') };
  });
  ok('Switch toggles immediately with aria-checked', state.value === true && state.events[0] === true && state.checked === 'true', JSON.stringify(state));
}

// F10 Slider single/range
await fresh();
{
  const state = await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.slider = NoteUI.Slider.mount(host, { value: 10, min: 0, max: 100, step: 5, showValue: true });
    const input = host.querySelector('.nui-slider__input');
    input.value = '35';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const box = document.createElement('div'); host.appendChild(box);
    window.__h.range = NoteUI.Slider.mount(box, { range: true, value: [20, 80], min: 0, max: 100, step: 10 });
    return { single: window.__h.slider.getValue(), readout: host.querySelector('.nui-slider__readout')?.textContent || '', range: window.__h.range.getValue(), inputs: box.querySelectorAll('.nui-slider__input').length };
  });
  ok('Slider single value and readable output', state.single === 35 && /35/.test(state.readout), JSON.stringify(state));
  ok('Slider dual range has two native inputs', state.inputs === 2 && Array.isArray(state.range) && state.range[0] === 20 && state.range[1] === 80, JSON.stringify(state));
}

// F11 Form validation/focus/submit/reset
await fresh();
{
  await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__submitted = null;
    window.__h.form = NoteUI.Form.mount(host, {
      fields: [
        { name: 'name', label: '名称', required: true, control: 'text' },
        { name: 'count', label: '数量', control: 'number', options: { min: 1, max: 9, step: 1 } }
      ],
      values: { name: '', count: null },
      onSubmit: (values) => { window.__submitted = values; }
    });
  });
  await page.getByRole('button', { name: '提交' }).click();
  await wait(150);
  const invalid = await page.evaluate(() => ({
    submitted: window.__submitted,
    errors: document.querySelectorAll('.nui-field__error:not([hidden])').length,
    focused: document.activeElement?.className || ''
  }));
  ok('Form blocks submit and focuses first error', invalid.submitted === null && invalid.errors >= 1 && /nui-(textinput|form|field)/.test(invalid.focused), JSON.stringify(invalid));
  await page.evaluate(() => {
    const input = document.querySelector('.nui-textinput__control');
    input.value = '任务一';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  });
  await page.getByRole('button', { name: '提交' }).click();
  await wait(150);
  const valid = await page.evaluate(() => ({ submitted: window.__submitted }));
  ok('Form submits through host callback', valid.submitted && valid.submitted.name === '任务一', JSON.stringify(valid));
  await page.getByRole('button', { name: '重置' }).click();
  await wait(100);
  const reset = await page.evaluate(() => window.__h.form.getValue());
  ok('Form reset restores defaults', reset.name === '' && reset.count === null, JSON.stringify(reset));
}

// F13 TimePicker invalid/valid
await fresh();
{
  const state = await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.time = NoteUI.TimePicker.mount(host, { value: '09:00', step: 15, onChange: (v) => window.__events.push(v) });
    const input = host.querySelector('.nui-timepicker__input');
    input.value = '25:00';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    const invalid = { value: window.__h.time.getValue(), error: host.querySelector('.nui-timepicker__error')?.textContent || '' };
    input.value = '10:30';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    return { invalid, valid: window.__h.time.getValue() };
  });
  ok('TimePicker rejects invalid and accepts valid local time', state.invalid.value === null && /时间|有效|格式/.test(state.invalid.error) && state.valid === '10:30', JSON.stringify(state));
}

// F14 ColorPicker invalid/valid
await fresh();
{
  const state = await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.color = NoteUI.ColorPicker.mount(host, { value: '#123456', onChange: (v) => window.__events.push(v) });
    const input = host.querySelector('.nui-colorpicker__input');
    input.value = 'not-a-color';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    const invalid = { value: window.__h.color.getValue(), error: host.querySelector('.nui-colorpicker__error')?.textContent || '' };
    input.value = '#f00';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    return { invalid, valid: window.__h.color.getValue() };
  });
  ok('ColorPicker validates text and normalizes hex', state.invalid.value === null && /颜色|格式|有效/.test(state.invalid.error) && state.valid === '#ff0000', JSON.stringify(state));
}

// F15 FileInput local selection/removal
await fresh();
{
  await page.evaluate(() => {
    const host = document.getElementById('host');
    window.__h.file = NoteUI.FileInput.mount(host, { multiple: true, maxFiles: 3, accept: '.txt,.csv' });
  });
  await page.setInputFiles('.nui-fileinput__native', [
    { name: '说明.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
    { name: '数据.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b') }
  ]);
  await wait(200);
  const state = await page.evaluate(() => ({
    files: window.__h.file.getValue().map(f => f.name),
    text: document.getElementById('host').innerText,
    remove: !!document.querySelector('.nui-fileinput__remove')
  }));
  ok('FileInput lists local files without upload', state.files.length === 2 && /说明\.txt/.test(state.text) && state.remove, JSON.stringify(state));
  await page.evaluate(() => {
    const remove = document.querySelector('.nui-fileinput__remove');
    remove && remove.click();
  });
  await wait(100);
  const after = await page.evaluate(() => window.__h.file.getValue().length);
  ok('FileInput removes selected file', after === 1, 'remaining=' + after);
}

await browser.close();
const failed = results.filter(r => !r.pass);
const summary = { checks: results.length, passed: results.length - failed.length, failed: failed.length, failures: failed, errors: errors.slice(0, 30) };
writeCacheJson(root, ['checks', 'high-risk-forms.json'], { summary, results });
console.log(JSON.stringify(summary, null, 2));
if (failed.length) process.exitCode = 1;
