import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { moduleScripts, moduleStyles } from '../lib/src-sources.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('../tools/node_modules/playwright-core');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

// 表单模块拆分后从 manifest 自动加载新增文件。
const MODULES = ['core', 'ui-forms-basic', 'ui-forms-advanced'];
const cssFiles = moduleStyles(root, MODULES).map((file) => path.join(root, file));
const jsFiles = moduleScripts(root, MODULES).map((file) => path.join(root, file));

const browser = await chromium.launch({ executablePath: edge, headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push('pageerror: ' + error.message));

await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>forms-advanced check</title></head><body><div id="host"></div></body></html>');
for (const file of cssFiles) await page.addStyleTag({ path: file });
for (const file of jsFiles) await page.addScriptTag({ path: file });

const results = await page.evaluate(async () => {
  const out = [];
  const assert = (condition, message) => {
    out.push({ ok: Boolean(condition), message });
    if (!condition) throw new Error(message);
  };
  const host = document.getElementById('host');

  // F09 Switch
  (() => {
    host.replaceChildren();
    let changes = 0;
    let last = null;
    const sw = NoteUI.Switch.mount(host, {
      label: '启用提醒', checked: false, hint: '即时生效', disabledReason: '演示禁用原因',
      onChange: (value) => { changes += 1; last = value; }
    });
    const button = sw.el.querySelector('[role=switch]');
    assert(button && button.tagName === 'BUTTON', 'Switch uses native button');
    assert(button.getAttribute('aria-checked') === 'false', 'Switch starts unchecked');
    assert(sw.el.textContent.includes('已关闭'), 'Switch has visible state text');
    button.click();
    assert(sw.getValue() === true && changes === 1 && last === true, 'Switch click updates value and onChange');
    sw.update({ checked: false });
    assert(sw.getValue() === false && changes === 1, 'Switch programmatic update is silent');
    sw.update({ disabled: true, disabledReason: '只读演示' });
    assert(sw.el.textContent.includes('不可用：只读演示'), 'Switch disabled reason visible');
    sw.destroy();
    assert(!document.body.contains(sw.el), 'Switch destroyed');
  })();

  // F10 Slider
  (() => {
    host.replaceChildren();
    let changed = 0;
    let last = null;
    const slider = NoteUI.Slider.mount(host, {
      label: '字号', min: 0, max: 100, step: 5, value: 30,
      format: (value) => value + ' px',
      onChange: (value) => { changed += 1; last = value; }
    });
    const input = slider.el.querySelector('input[type=range]');
    assert(input && input.value === '30', 'Slider single input initialized');
    assert(slider.el.textContent.includes('30 px'), 'Slider formatted readout visible');
    input.value = '55';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    assert(slider.getValue() === 55 && changed === 1 && last === 55, 'Slider single user input updates');
    slider.update({ value: 80 });
    assert(slider.getValue() === 80 && changed === 1, 'Slider programmatic update is silent');
    slider.destroy();

    let rangeChanges = 0;
    const range = NoteUI.Slider.mount(host, {
      label: '价格', min: 0, max: 100, step: 10, range: true, value: [30, 70],
      onChange: () => { rangeChanges += 1; }
    });
    let inputs = range.el.querySelectorAll('input[type=range]');
    assert(inputs.length === 2 && range.getValue().join(',') === '30,70', 'Slider range has two native inputs');
    inputs[0].value = '90';
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    assert(range.getValue()[0] === range.getValue()[1], 'Slider range cannot cross (low clamps)');
    rangeChanges = 0;
    range.update({ value: [80, 20] });
    assert(range.getValue()[0] <= range.getValue()[1], 'Slider range programmatic value normalized');
    assert(rangeChanges === 0, 'Slider range programmatic update silent');
    range.destroy();
  })();

  // F11 Form
  (() => {
    host.replaceChildren();
    const events = { changes: [], submits: [] };
    const form = NoteUI.Form.mount(host, {
      label: '资料表',
      fields: [
        { name: 'name', label: '姓名', control: 'text', required: true, defaultValue: '小李', options: { placeholder: '姓名' } },
        { name: 'email', label: '邮箱', control: 'text', required: true, validate: (value) => /\S+@\S+\.\S+/.test(value) ? null : '邮箱格式不正确。' },
        { name: 'age', label: '年龄', control: 'number', options: { min: 0, max: 120, step: 1 } },
        { name: 'agree', label: '同意条款', control: 'checkbox', required: true, defaultValue: false },
        { name: 'notify', label: '通知', control: 'switch', defaultValue: false },
        { name: 'volume', label: '音量', control: 'slider', defaultValue: 50, options: { min: 0, max: 100, step: 10 } },
        { name: 'role', label: '角色', control: 'select', options: [{ value: 'reader', label: '读者' }, { value: 'editor', label: '编辑' }] }
      ],
      onChange: (values, name) => events.changes.push({ values, name }),
      onSubmit: (values) => events.submits.push(values)
    });
    assert(form.el.querySelectorAll('.nui-form__field').length === 7, 'Form renders all fields');
    assert(form.getValue().name === '小李', 'Form initial default value');
    assert(form.getValue().agree === false, 'Form checkbox default false');
    const submitResult = form.submit();
    assert(submitResult === false, 'Form submit blocks invalid values');
    assert(form.el.querySelector('.nui-form__summary').hidden === false, 'Form error summary visible');
    assert(document.activeElement && document.activeElement.closest('[data-name="email"], [data-name="agree"]'), 'Form focuses first invalid field');
    const nameInput = form.el.querySelector('[data-name="name"] input');
    nameInput.value = '小王';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    assert(events.changes.length === 1 && events.changes[0].name === 'name', 'Form onChange fires for user edit');
    assert(events.changes[0].values.name === '小王', 'Form onChange carries current values');
    form.update({ values: { name: '程序', email: 'program@example.com', agree: true } });
    assert(events.changes.length === 1, 'Form programmatic update does not fire onChange');
    assert(form.getValue().name === '程序', 'Form programmatic values applied');
    form.setErrors({ name: '服务端已存在。' });
    assert(form.el.textContent.includes('服务端已存在。'), 'Form setErrors displays error');
    form.reset();
    assert(form.getValue().name === '小李' && form.getValue().agree === false, 'Form reset restores defaults');
    assert(form.el.querySelector('.nui-form__summary').hidden === true, 'Form reset clears errors');
    form.update({ values: { name: '小王', email: 'a@b.com', agree: true, role: 'reader' } });
    const submitted = form.submit();
    assert(submitted === true && events.submits.length === 1, 'Form submits valid values to host');
    assert(events.submits[0].name === '小王', 'Form onSubmit receives values');
    form.destroy();
  })();

  // F12 DatePicker single, keyboard, invalid text, clear
  (() => {
    host.replaceChildren();
    let changes = 0;
    const picker = NoteUI.DatePicker.mount(host, {
      value: '2026-10-15', label: '日期', min: '2026-10-01', max: '2026-12-31',
      today: '2026-10-27', disabledDates: ['2026-10-20'],
      onChange: () => { changes += 1; }
    });
    assert(picker.getValue() === '2026-10-15', 'DatePicker initial value');
    const input = picker.el.querySelector('input');
    assert(picker.el.textContent.includes('本地日期'), 'DatePicker visible local-date assumption');
    picker.el.querySelector('.nui-datepicker__trigger').click();
    const panel = document.querySelector('.nui-datepicker__panel');
    assert(panel && panel.querySelector('[role=grid]'), 'DatePicker opens floating grid');
    const focused = document.activeElement;
    assert(focused && focused.dataset.date === '2026-10-15', 'DatePicker focuses selected day');
    focused.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert(document.activeElement.dataset.date === '2026-10-16', 'DatePicker ArrowRight moves one day');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
    assert(document.activeElement.dataset.date === '2026-11-16', 'DatePicker PageDown moves one month');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert(!document.querySelector('.nui-datepicker__panel'), 'DatePicker Escape closes panel');
    assert(document.activeElement === picker.el.querySelector('.nui-datepicker__trigger'), 'DatePicker restores focus to trigger');
    input.value = '2026-02-30';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    assert(picker.getValue() === null, 'DatePicker invalid date is not committed');
    assert(picker.el.textContent.includes('格式无效'), 'DatePicker invalid text error visible');
    assert(changes > 0, 'DatePicker onChange fired for user actions');
    picker.el.querySelector('.nui-datepicker__clear').click();
    assert(picker.getValue() === null && input.value === '', 'DatePicker clear empties value');
    assert(!document.querySelector('.nui-datepicker__panel'), 'DatePicker no floating residue after clear');
    picker.destroy();
    assert(!document.querySelector('.nui-datepicker__panel'), 'DatePicker destroy removes floating layer');
  })();

  // F12 DatePicker range
  (() => {
    host.replaceChildren();
    const picker = NoteUI.DatePicker.mount(host, {
      range: true, value: { start: '2026-10-10', end: '2026-10-05' },
      min: '2026-10-01', max: '2026-10-31', today: '2026-10-27', label: '日期范围'
    });
    assert(picker.getValue().start === '2026-10-05' && picker.getValue().end === '2026-10-10', 'DatePicker range normalized on load');
    picker.el.querySelector('.nui-datepicker__trigger').click();
    assert(document.activeElement.dataset.date === '2026-10-05', 'DatePicker range focuses start');
    document.querySelector('.nui-datepicker__day[data-date="2026-10-08"]').click();
    assert(picker.getValue().start === '2026-10-08' && picker.getValue().end === null, 'DatePicker range first calendar click sets start');
    document.querySelector('.nui-datepicker__day[data-date="2026-10-12"]').click();
    assert(picker.getValue().start === '2026-10-08' && picker.getValue().end === '2026-10-12', 'DatePicker range second click completes');
    assert(!document.querySelector('.nui-datepicker__panel'), 'DatePicker range completes and closes');
    picker.destroy();
  })();

  // F13 TimePicker
  (() => {
    host.replaceChildren();
    let changed = 0;
    const picker = NoteUI.TimePicker.mount(host, {
      label: '时间', value: '09:30:00', seconds: true, step: 30,
      min: '08:00:00', max: '18:00:00',
      onChange: () => { changed += 1; }
    });
    assert(picker.getValue() === '09:30:00', 'TimePicker seconds initial value');
    const input = picker.el.querySelector('input');
    input.value = '25:00:00';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    assert(picker.getValue() === null, 'TimePicker invalid hour rejected');
    assert(picker.el.textContent.includes('格式无效'), 'TimePicker invalid text error visible');
    // 打开面板前先提交一个确定的有效值，让 draft 秒固定为 00。否则 defaultDraft 取本地时间
    // 并吸附到 step=30，当前秒数落在 16–45 时会得到 10:30:30，导致断言随墙钟抖动。
    input.value = '10:00:00';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    assert(picker.getValue() === '10:00:00', 'TimePicker valid text commits before panel');
    picker.el.querySelector('.nui-timepicker__trigger').click();
    const panel = document.querySelector('.nui-timepicker__panel');
    assert(panel && panel.querySelectorAll('select').length === 3, 'TimePicker opens three unit selects');
    assert(document.querySelector('.nui-timepicker__select[aria-label="小时"] option[value="07"]').disabled, 'TimePicker disables out-of-range hour');
    const hour = document.querySelector('.nui-timepicker__select[aria-label="小时"]');
    hour.value = '10';
    hour.dispatchEvent(new Event('change', { bubbles: true }));
    const minute = document.querySelector('.nui-timepicker__select[aria-label="分钟"]');
    minute.value = '30';
    minute.dispatchEvent(new Event('change', { bubbles: true }));
    assert(picker.getValue() === '10:30:00', 'TimePicker select change commits valid time');
    assert(changed > 0, 'TimePicker onChange fired');
    document.querySelector('.nui-timepicker__done').click();
    assert(!document.querySelector('.nui-timepicker__panel'), 'TimePicker done closes panel');
    picker.destroy();
    assert(!document.querySelector('.nui-timepicker__panel'), 'TimePicker destroy removes layer');
  })();

  // F14 ColorPicker
  (() => {
    host.replaceChildren();
    let changed = 0;
    const picker = NoteUI.ColorPicker.mount(host, {
      label: '颜色', value: '#315CDA',
      palette: ['#315cda', '#b23a45', '#ffffff'],
      onChange: () => { changed += 1; }
    });
    assert(picker.getValue() === '#315cda', 'ColorPicker normalizes output to lowercase #rrggbb');
    const input = picker.el.querySelector('.nui-colorpicker__input');
    input.value = 'rgba(0,0,0,0.5)';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    assert(picker.getValue() === null, 'ColorPicker rejects alpha syntax');
    assert(picker.el.textContent.includes('不支持透明度'), 'ColorPicker visible format/alpha hint');
    assert(picker.el.textContent.includes('颜色格式无效'), 'ColorPicker invalid value error visible');
    const swatch = picker.el.querySelector('[data-color="#b23a45"]');
    swatch.click();
    assert(picker.getValue() === '#b23a45', 'ColorPicker palette selection commits');
    assert(changed > 0, 'ColorPicker onChange fired');
    input.value = '#fff';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    assert(picker.getValue() === '#ffffff', 'ColorPicker expands #rgb input');
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    assert(input.value === '#ffffff', 'ColorPicker normalizes text on blur');
    picker.destroy();
  })();

  // F15 FileInput
  (() => {
    host.replaceChildren();
    let changes = 0;
    const fileInput = NoteUI.FileInput.mount(host, {
      label: '附件', multiple: true, accept: '.txt,image/*', maxSize: 10,
      maxFiles: 2, onChange: () => { changes += 1; }
    });
    const drop = fileInput.el.querySelector('.nui-fileinput__drop');
    const dt = new DataTransfer();
    dt.items.add(new File(['ok'], 'good.txt', { type: 'text/plain' }));
    dt.items.add(new File(['this file is definitely too large'], 'large.txt', { type: 'text/plain' }));
    dt.items.add(new File(['x'], 'bad.exe', { type: 'application/x-msdownload' }));
    drop.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
    assert(fileInput.el.classList.contains('nui-fileinput--dragover'), 'FileInput dragenter highlights drop area');
    drop.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    assert(fileInput.getValue().length === 1 && fileInput.getValue()[0].name === 'good.txt', 'FileInput accepts matching file and rejects invalid ones');
    assert(fileInput.el.textContent.includes('大小超过上限'), 'FileInput reports size rejection reason');
    assert(fileInput.el.textContent.includes('类型不符合'), 'FileInput reports type rejection reason');
    assert(fileInput.el.textContent.includes('不会上传到服务器'), 'FileInput states local-only behavior');
    assert(changes === 1, 'FileInput onChange fires on accepted files');
    const remove = fileInput.el.querySelector('.nui-fileinput__remove');
    remove.click();
    assert(fileInput.getValue().length === 0, 'FileInput remove deletes selected file');
    assert(changes === 2, 'FileInput onChange fires on removal');
    fileInput.destroy();
  })();

  return out;
});

const bodyLayers = await page.evaluate(() => document.querySelectorAll('.hnv-floating').length);

console.log(JSON.stringify({ results, consoleErrors, bodyLayers }, null, 2));
await browser.close();

const failed = results.filter((item) => !item.ok);
if (failed.length || consoleErrors.length || bodyLayers !== 0) process.exit(1);
