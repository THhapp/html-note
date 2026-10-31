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
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push('pageerror: ' + error.message));
await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body><div id="host"></div></body></html>');
for (const file of cssFiles) await page.addStyleTag({ path: file });
for (const file of jsFiles) await page.addScriptTag({ path: file });

const results = [];
async function scenario(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
  }
}
function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

await scenario('Switch keyboard Space/Enter', async () => {
  const state = await page.evaluate(() => {
    document.getElementById('host').replaceChildren();
    window.__switchChanges = [];
    const sw = NoteUI.Switch.mount(document.getElementById('host'), {
      label: '键盘开关', hint: '用空格或回车切换',
      onChange: (value) => window.__switchChanges.push(value)
    });
    window.__switch = sw;
    sw.el.querySelector('[role=switch]').focus();
    return sw.getValue();
  });
  ensure(state === false, 'switch starts off');
  await page.keyboard.press('Space');
  const afterSpace = await page.evaluate(() => ({ value: window.__switch.getValue(), changes: window.__switchChanges.slice(), checked: window.__switch.el.querySelector('[role=switch]').getAttribute('aria-checked') }));
  ensure(afterSpace.value === true && afterSpace.changes.length === 1 && afterSpace.checked === 'true', 'Space toggles switch');
  await page.keyboard.press('Enter');
  const afterEnter = await page.evaluate(() => ({ value: window.__switch.getValue(), changes: window.__switchChanges.length }));
  ensure(afterEnter.value === false && afterEnter.changes === 2, 'Enter toggles switch');
  await page.evaluate(() => {
    window.__switch.update({ disabled: true, disabledReason: '演示只读' });
    if (document.activeElement) document.activeElement.blur();
    window.__switch.el.querySelector('[role=switch]').focus();
  });
  const disabledFocus = await page.evaluate(() => document.activeElement === window.__switch.el.querySelector('[role=switch]'));
  ensure(!disabledFocus, 'disabled switch is not focusable');
  await page.evaluate(() => window.__switch.destroy());
});

await scenario('Slider keyboard and range high crossing', async () => {
  await page.evaluate(() => {
    document.getElementById('host').replaceChildren();
    window.__sliderChanges = [];
    window.__slider = NoteUI.Slider.mount(document.getElementById('host'), {
      label: '键盘滑块', min: 0, max: 100, step: 10, value: 50,
      onChange: (value) => window.__sliderChanges.push(value)
    });
    window.__slider.el.querySelector('input').focus();
  });
  await page.keyboard.press('ArrowRight');
  const one = await page.evaluate(() => ({ value: window.__slider.getValue(), changes: window.__sliderChanges.length }));
  ensure(one.value === 60 && one.changes === 1, 'ArrowRight increases slider by step');
  await page.keyboard.press('Home');
  ensure((await page.evaluate(() => window.__slider.getValue())) === 0, 'Home moves slider to minimum');
  await page.keyboard.press('End');
  ensure((await page.evaluate(() => window.__slider.getValue())) === 100, 'End moves slider to maximum');
  const range = await page.evaluate(() => {
    window.__slider.destroy();
    document.getElementById('host').replaceChildren();
    const slider = NoteUI.Slider.mount(document.getElementById('host'), {
      label: '区间', min: 0, max: 100, step: 10, range: true, value: [20, 80]
    });
    const inputs = slider.el.querySelectorAll('input');
    inputs[1].value = '10';
    inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    const crossed = slider.getValue();
    slider.update({ range: false, value: 25 });
    const single = { value: slider.getValue(), inputs: slider.el.querySelectorAll('input').length, text: slider.el.textContent.includes('30') };
    slider.destroy();
    return { crossed, single };
  });
  ensure(range.crossed[0] === range.crossed[1], 'high handle cannot cross below low');
  ensure(range.single.value === 30 && range.single.inputs === 1 && range.single.text, 'Slider can update from range to single: ' + JSON.stringify(range.single));
});

await scenario('Form blur/input timing, custom control, button submit, updates', async () => {
  const result = await page.evaluate(() => {
    document.getElementById('host').replaceChildren();
    const custom = document.createElement('input');
    custom.value = '初始自定义';
    custom.setAttribute('aria-label', '自定义字段');
    const changes = [];
    const submits = [];
    const form = NoteUI.Form.mount(document.getElementById('host'), {
      fields: [
        { name: 'name', label: '姓名', control: 'text', required: true, defaultValue: '小李' },
        { name: 'email', label: '邮箱', control: 'text', validate: (value, values) => values.name === '小李' && !/@/.test(value) ? '请输入带 @ 的邮箱。' : null },
        { name: 'agree', label: '同意', control: 'checkbox', required: true },
        { name: 'notify', label: '通知', control: 'switch' },
        { name: 'volume', label: '音量', control: 'slider', defaultValue: 40, options: { min: 0, max: 100, step: 10 } },
        { name: 'custom', label: '自定义', control: 'custom', custom: custom, required: true }
      ],
      onChange: (values, name) => changes.push({ name, values }),
      onSubmit: (values, event) => submits.push({ values, eventType: event && event.type })
    });
    const initial = form.getValue();
    const email = form.el.querySelector('[data-name="email"] input');
    email.focus();
    email.value = 'bad';
    email.dispatchEvent(new Event('input', { bubbles: true }));
    form.el.querySelector('[data-name="name"] input').focus();
    const blurError = form.el.textContent.includes('请输入带 @ 的邮箱。');
    form.el.querySelector('.nui-form__submit').click();
    const focusName = document.activeElement && document.activeElement.closest('[data-name]') && document.activeElement.closest('[data-name]').dataset.name;
    const summaryVisible = form.el.querySelector('.nui-form__summary').hidden === false;
    const agreeError = form.el.textContent.includes('同意为必填项。');
    const changesBeforeUpdate = changes.length;
    form.update({ values: { name: '小王', email: 'ok@example.com', agree: true, custom: '程序值' } });
    const afterUpdate = { ...form.getValue() };
    const changesAfterUpdate = changes.length - changesBeforeUpdate;
    const submitted = form.submit();
    const submitCount = submits.length;
    const eventType = submits[0] && submits[0].eventType;
    form.setErrors({ email: '外部错误。' });
    const externalError = form.el.textContent.includes('外部错误。');
    form.el.querySelector('[data-name="email"] input').dispatchEvent(new Event('input', { bubbles: true }));
    const clearedAfterInput = !form.el.textContent.includes('外部错误。');
    const switchControl = form.el.querySelector('.nui-switch [role=switch]');
    switchControl.click();
    const switchValue = form.getValue().notify;
    const slider = form.el.querySelector('.nui-slider input');
    slider.value = '70';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    const sliderValue = form.getValue().volume;
    form.el.querySelector('.nui-form__reset').click();
    const afterReset = { ...form.getValue() };
    form.destroy();
    return {
      initial, blurError, focusName, summaryVisible, agreeError, afterUpdate, changesAfterUpdate,
      submitted, submitCount, eventType, externalError, clearedAfterInput,
      switchValue, sliderValue, afterReset
    };
  });
  ensure(result.initial.custom === '初始自定义', 'Form keeps custom control initial value');
  ensure(result.blurError, 'Form validates on blur by default');
  ensure(result.summaryVisible && result.focusName === 'email', 'Submit click focuses first invalid field and shows summary');
  ensure(result.agreeError, 'Required checkbox false produces a visible error');
  ensure(result.afterUpdate.custom === '程序值' && result.changesAfterUpdate === 0, 'Form programmatic update applies custom value silently: ' + JSON.stringify({ afterUpdate: result.afterUpdate, changes: result.changesAfterUpdate }));
  ensure(result.submitted === true && result.submitCount === 1, 'Form submits valid values');
  ensure(result.eventType == null, 'Programmatic submit passes no event');
  ensure(result.externalError && result.clearedAfterInput, 'Form setErrors and user input clears error');
  ensure(result.switchValue === true, 'Form switch user change updates values');
  ensure(result.sliderValue === 70, 'Form slider user change updates values');
  ensure(result.afterReset.name === '小李' && result.afterReset.notify === false && result.afterReset.volume === 40, 'Form reset restores defaults and switch/slider');
});

await scenario('Form text/textarea/number/checkbox/select control types', async () => {
  const result = await page.evaluate(() => {
    document.getElementById('host').replaceChildren();
    const form = NoteUI.Form.mount(document.getElementById('host'), {
      fields: [
        { name: 'text', label: '文本', control: 'text', required: true },
        { name: 'bio', label: '说明', control: 'textarea', options: { rows: 2 } },
        { name: 'age', label: '年龄', control: 'number', options: { min: 0, max: 120 } },
        { name: 'terms', label: '条款', control: 'checkbox' },
        { name: 'role', label: '角色', control: 'select', options: [{ value: 'reader', label: '读者' }, { value: 'editor', label: '编辑' }] }
      ]
    });
    const text = form.el.querySelector('[data-name="text"] input');
    text.value = 'hello';
    text.dispatchEvent(new Event('input', { bubbles: true }));
    const bio = form.el.querySelector('[data-name="bio"] textarea');
    bio.value = '多行说明';
    bio.dispatchEvent(new Event('input', { bubbles: true }));
    const age = form.el.querySelector('[data-name="age"] input');
    age.value = '42';
    age.dispatchEvent(new Event('input', { bubbles: true }));
    const terms = form.el.querySelector('[data-name="terms"] input[type=checkbox]');
    terms.click();
    const select = form.el.querySelector('[data-name="role"] select');
    select.selectedIndex = 1;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const values = form.getValue();
    const built = {
      text: !!text,
      textarea: !!bio,
      number: !!age,
      checkbox: terms.checked,
      select: !!select
    };
    const ok = form.submit();
    form.destroy();
    return { values, built, ok };
  });
  ensure(result.built.text && result.built.textarea && result.built.number && result.built.checkbox && result.built.select, 'Form mounts all basic control types');
  ensure(result.values.text === 'hello' && result.values.bio === '多行说明' && result.values.age === 42 && result.values.terms === true && result.values.role === 'editor', 'Form basic control values synced: ' + JSON.stringify(result.values));
});

await scenario('Form custom field listener cleanup on rebuild and destroy', async () => {
  const result = await page.evaluate(() => {
    document.getElementById('host').replaceChildren();
    const custom = document.createElement('input');
    custom.value = 'before';
    let changes = 0;
    const form = NoteUI.Form.mount(document.getElementById('host'), {
      fields: [{ name: 'custom', label: '自定义', control: 'custom', custom: custom }],
      onChange: () => { changes += 1; }
    });
    custom.value = 'first';
    custom.dispatchEvent(new Event('input', { bubbles: true }));
    const afterFirst = changes;
    form.update({ fields: [{ name: 'custom', label: '自定义（重建）', control: 'custom', custom: custom }] });
    custom.value = 'second';
    custom.dispatchEvent(new Event('input', { bubbles: true }));
    const afterRebuild = changes;
    form.destroy();
    custom.value = 'third';
    custom.dispatchEvent(new Event('input', { bubbles: true }));
    const afterDestroy = changes;
    return { afterFirst, afterRebuild, afterDestroy };
  });
  ensure(result.afterFirst === 1 && result.afterRebuild === 2, 'Form custom listener works after field rebuild');
  ensure(result.afterDestroy === 2, 'Form removes custom listener on destroy');
});

await scenario('Form validateOn input and submit button event', async () => {
  const result = await page.evaluate(() => {
    document.getElementById('host').replaceChildren();
    let submits = [];
    const form = NoteUI.Form.mount(document.getElementById('host'), {
      validateOn: 'input',
      fields: [{ name: 'code', label: '代码', control: 'text', required: true, validate: (value) => /^[A-Z]{3}$/.test(value) ? null : '需要三个大写字母。' }],
      onSubmit: (values, event) => submits.push(event && event.type)
    });
    const input = form.el.querySelector('input');
    input.value = 'ab';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const immediateError = form.el.textContent.includes('需要三个大写字母。');
    input.value = 'ABC';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const immediateClear = !form.el.textContent.includes('需要三个大写字母。');
    form.el.querySelector('.nui-form__submit').click();
    const submitEventType = submits[0];
    form.destroy();
    return { immediateError, immediateClear, submitEventType };
  });
  ensure(result.immediateError && result.immediateClear, 'Form validateOn input updates errors while typing');
  ensure(result.submitEventType === 'submit', 'Form submit button passes the submit event to onSubmit');
});

await scenario('DatePicker disabled dates, Home/End, Alt+ArrowDown, outside close, toggle', async () => {
  const result = await page.evaluate(() => {
    document.getElementById('host').replaceChildren();
    let changes = 0;
    const picker = NoteUI.DatePicker.mount(document.getElementById('host'), {
      label: '日期', value: '2026-10-15', today: '2026-10-15',
      disabledDates: ['2026-10-20'], onChange: () => { changes += 1; }
    });
    const input = picker.el.querySelector('input');
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true }));
    const opened = !!document.querySelector('.nui-datepicker__panel');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    const home = document.activeElement.dataset.date;
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    const end = document.activeElement.dataset.date;
    const disabledDay = document.querySelector('.nui-datepicker__day[data-date="2026-10-20"]');
    const ariaDisabled = disabledDay.getAttribute('aria-disabled');
    disabledDay.click();
    const afterDisabled = picker.getValue();
    document.querySelector('.nui-datepicker__trigger').click();
    const toggledClosed = !document.querySelector('.nui-datepicker__panel');
    document.querySelector('.nui-datepicker__trigger').click();
    const openAgain = !!document.querySelector('.nui-datepicker__panel');
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const outsideClosed = !document.querySelector('.nui-datepicker__panel');
    const beforeUpdate = changes;
    picker.update({ value: '2026-11-03' });
    const updatedValue = picker.getValue();
    const updatedText = input.value;
    const updateSilent = changes === beforeUpdate;
    return { opened, home, end, ariaDisabled, afterDisabled, toggledClosed, openAgain, outsideClosed, updatedValue, updatedText, updateSilent };
  });
  ensure(result.opened, 'DatePicker Alt+ArrowDown opens calendar from input');
  ensure(result.home === '2026-10-12' && result.end === '2026-10-18', 'DatePicker Home/End move within Monday week');
  ensure(result.ariaDisabled === 'true' && result.afterDisabled === '2026-10-15', 'DatePicker disabled date cannot be selected');
  ensure(result.toggledClosed && result.openAgain, 'DatePicker trigger toggles calendar closed and open');
  ensure(result.outsideClosed, 'DatePicker outside pointerdown closes calendar');
  ensure(result.updatedValue === '2026-11-03' && result.updatedText === '2026-11-03' && result.updateSilent, 'DatePicker programmatic update is silent and refreshes text');
});

await scenario('DatePicker typed ranges, order normalization, partial and invalid', async () => {
  const result = await page.evaluate(() => {
    document.getElementById('host').replaceChildren();
    const picker = NoteUI.DatePicker.mount(document.getElementById('host'), {
      label: '范围', range: true, min: '2026-10-01', max: '2026-10-31', today: '2026-10-15'
    });
    const start = picker.el.querySelectorAll('input')[0];
    const end = picker.el.querySelectorAll('input')[1];
    start.value = '2026-10-20';
    start.dispatchEvent(new Event('input', { bubbles: true }));
    start.dispatchEvent(new Event('blur', { bubbles: true }));
    const partial = picker.getValue();
    end.value = '2026-10-10';
    end.dispatchEvent(new Event('input', { bubbles: true }));
    end.dispatchEvent(new Event('blur', { bubbles: true }));
    const normalized = picker.getValue();
    const feedback = picker.el.textContent.includes('已调整起止顺序');
    start.value = '2026-02-30';
    start.dispatchEvent(new Event('blur', { bubbles: true }));
    const invalidValue = picker.getValue();
    const invalidVisible = picker.el.textContent.includes('格式无效');
    start.value = '2026-09-01';
    start.dispatchEvent(new Event('blur', { bubbles: true }));
    const minError = picker.el.textContent.includes('不能早于');
    picker.update({ range: false, value: '2026-10-12' });
    const singleValue = picker.getValue();
    const inputCount = picker.el.querySelectorAll('input').length;
    picker.update({ range: true });
    const converted = picker.getValue();
    picker.destroy();
    return { partial, normalized, feedback, invalidValue, invalidVisible, minError, singleValue, inputCount, converted };
  });
  ensure(result.partial.start === '2026-10-20' && result.partial.end === null, 'DatePicker partial range keeps start');
  ensure(result.normalized.start === '2026-10-10' && result.normalized.end === '2026-10-20' && result.feedback, 'DatePicker typed range normalizes order with visible feedback');
  ensure(result.invalidValue === null && result.invalidVisible, 'DatePicker invalid typed range clears value and shows error');
  ensure(result.minError, 'DatePicker typed date below min shows error');
  ensure(result.singleValue === '2026-10-12' && result.inputCount === 1, 'DatePicker update can switch to single mode');
  ensure(result.converted && result.converted.start === '2026-10-12', 'DatePicker update can switch back to range with partial value');
});

await scenario('DatePicker destroy while open and mutable copy', async () => {
  const result = await page.evaluate(() => {
    document.getElementById('host').replaceChildren();
    const picker = NoteUI.DatePicker.mount(document.getElementById('host'), { range: true, value: { start: '2026-10-01', end: '2026-10-05' }, today: '2026-10-01' });
    const copy = picker.getValue();
    copy.start = '2030-01-01';
    const unaffected = picker.getValue().start;
    (document.querySelector('.nui-datepicker__trigger') || picker.el.querySelector('.nui-datepicker__trigger')).click();
    const openBefore = !!document.querySelector('.nui-datepicker__panel');
    picker.destroy();
    return { unaffected, openBefore, after: !!document.querySelector('.nui-datepicker__panel') };
  });
  ensure(result.unaffected === '2026-10-01', 'DatePicker getValue returns a copy');
  ensure(result.openBefore && !result.after, 'DatePicker destroy while open removes floating layer');
});

await scenario('TimePicker strict parsing, step, bounds, clear and update', async () => {
  const result = await page.evaluate(() => {
    document.getElementById('host').replaceChildren();
    let changes = 0;
    const picker = NoteUI.TimePicker.mount(document.getElementById('host'), {
      label: '时间', value: '10:15', step: 15, min: '09:00', max: '11:00',
      onChange: () => { changes += 1; }
    });
    const input = picker.el.querySelector('input');
    input.value = '10:07';
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    const stepError = picker.el.textContent.includes('步长');
    input.value = '12:00';
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    const rangeError = picker.el.textContent.includes('不能晚于');
    input.value = '10:30';
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    const valid = picker.getValue();
    input.value = '10:30:00';
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    const secondsRejected = picker.getValue() === null && picker.el.textContent.includes('HH:mm');
    input.value = '09:00';
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    const minInclusive = picker.getValue();
    input.value = '11:00';
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    const maxInclusive = picker.getValue();
    const beforeUpdate = changes;
    picker.update({ value: '10:45' });
    const updateSilent = changes === beforeUpdate && picker.getValue() === '10:45';
    picker.update({ value: '10:05' });
    const invalidUpdateValue = picker.getValue();
    const invalidUpdateVisible = picker.el.textContent.includes('步长');
    picker.el.querySelector('.nui-timepicker__clear').click();
    const cleared = picker.getValue();
    picker.destroy();
    return { stepError, rangeError, valid, secondsRejected, minInclusive, maxInclusive, updateSilent, invalidUpdateValue, invalidUpdateVisible, cleared };
  });
  ensure(result.stepError, 'TimePicker rejects typed value off the step');
  ensure(result.rangeError, 'TimePicker rejects typed value outside max');
  ensure(result.valid === '10:30', 'TimePicker accepts valid typed value');
  ensure(result.secondsRejected, 'TimePicker HH:mm mode rejects seconds text');
  ensure(result.minInclusive === '09:00' && result.maxInclusive === '11:00', 'TimePicker min/max are inclusive');
  ensure(result.updateSilent, 'TimePicker programmatic update is silent');
  ensure(result.invalidUpdateValue === null && result.invalidUpdateVisible, 'TimePicker invalid programmatic value shows error and no value');
  ensure(result.cleared === null, 'TimePicker clear empties value');
});

await scenario('TimePicker panel bounds and seconds update', async () => {
  const result = await page.evaluate(() => {
    document.getElementById('host').replaceChildren();
    const picker = NoteUI.TimePicker.mount(document.getElementById('host'), {
      label: '时间', value: '10:00:00', seconds: true, step: 30, min: '09:30:00', max: '11:00:00'
    });
    picker.el.querySelector('.nui-timepicker__trigger-text').click();
    const panel = document.querySelector('.nui-timepicker__panel');
    const hourOptions = panel.querySelectorAll('select[aria-label="小时"] option');
    const minuteOptions = panel.querySelectorAll('select[aria-label="分钟"] option');
    const secondOptions = panel.querySelectorAll('select[aria-label="秒钟"] option');
    const hourDisabled = panel.querySelector('select[aria-label="小时"] option[value="08"]').disabled;
    const hour = panel.querySelector('select[aria-label="小时"]');
    hour.value = '09';
    hour.dispatchEvent(new Event('change', { bubbles: true }));
    const minuteDisabled = panel.querySelector('select[aria-label="分钟"] option[value="00"]').disabled;
    const secondCount = secondOptions.length;
    const panelBounds = panel.textContent.includes('09:30:00') && panel.textContent.includes('本地时间');
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const closed = !document.querySelector('.nui-timepicker__panel');
    picker.update({ seconds: false });
    const adapted = picker.getValue();
    const inputValue = picker.el.querySelector('input').value;
    const placeholder = picker.el.querySelector('input').placeholder;
    picker.el.querySelector('.nui-timepicker__trigger').click();
    const selectCount = document.querySelectorAll('.nui-timepicker__select').length;
    const secondsHidden = document.querySelector('.nui-timepicker__unit[hidden]') !== null;
    picker.el.querySelector('.nui-timepicker__trigger').click();
    const toggledClosed = !document.querySelector('.nui-timepicker__panel');
    const timeInput = picker.el.querySelector('input');
    timeInput.focus();
    timeInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true }));
    const keyboardOpen = !!document.querySelector('.nui-timepicker__panel');
    const focusedLabel = document.activeElement && document.activeElement.getAttribute('aria-label');
    picker.destroy();
    const afterDestroy = !document.querySelector('.nui-timepicker__panel');
    return {
      hourOptions: hourOptions.length, minuteOptions: minuteOptions.length, secondCount,
      hourDisabled, minuteDisabled, panelBounds, closed, adapted, inputValue, placeholder, selectCount, secondsHidden,
      toggledClosed, keyboardOpen, focusedLabel, afterDestroy
    };
  });
  ensure(result.hourOptions === 24 && result.minuteOptions === 60 && result.secondCount === 2, 'TimePicker builds hour/minute/second option sets: ' + JSON.stringify(result));
  ensure(result.hourDisabled && result.minuteDisabled, 'TimePicker disables options outside min bounds');
  ensure(result.panelBounds, 'TimePicker panel shows local-time and bounds note');
  ensure(result.closed, 'TimePicker outside pointerdown closes panel');
  ensure(result.adapted === '10:00' && result.inputValue === '10:00' && result.placeholder === 'HH:mm', 'TimePicker seconds update rewrites value and format: ' + JSON.stringify(result));
  ensure(result.selectCount === 3 && result.secondsHidden, 'TimePicker hides seconds select after update');
  ensure(result.toggledClosed, 'TimePicker trigger toggles panel closed');
  ensure(result.keyboardOpen && result.focusedLabel === '小时', 'TimePicker Alt+ArrowDown opens and focuses hour select');
  ensure(result.afterDestroy, 'TimePicker destroy while open removes floating layer');
});

await scenario('ColorPicker invalid text, blur null, native input, clear, update', async () => {
  const result = await page.evaluate(() => {
    document.getElementById('host').replaceChildren();
    let changes = [];
    const picker = NoteUI.ColorPicker.mount(document.getElementById('host'), {
      label: '颜色', value: '#abc', palette: ['#315cda', '#ffffff'],
      onChange: (value) => changes.push(value)
    });
    const input = picker.el.querySelector('.nui-colorpicker__input');
    const initial = picker.getValue();
    input.value = '#12';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const duringInvalid = picker.getValue();
    const errorVisible = picker.el.textContent.includes('颜色格式无效');
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    const afterBlur = picker.getValue();
    const invalidChange = changes.slice();
    const native = picker.el.querySelector('.nui-colorpicker__native');
    native.value = '#ff0000';
    native.dispatchEvent(new Event('input', { bubbles: true }));
    const nativeValue = picker.getValue();
    const textAfterNative = input.value;
    const beforeUpdate = changes.length;
    picker.update({ value: 'rgba(0,0,0,.5)' });
    const invalidUpdateValue = picker.getValue();
    const invalidUpdateVisible = picker.el.textContent.includes('不支持透明度');
    const updateSilent = changes.length === beforeUpdate;
    picker.el.querySelector('.nui-colorpicker__clear').click();
    const cleared = picker.getValue();
    picker.update({ palette: [] });
    const paletteHidden = picker.el.querySelector('.nui-colorpicker__palette').hidden;
    picker.destroy();
    return { initial, duringInvalid, errorVisible, afterBlur, invalidChange, nativeValue, textAfterNative, invalidUpdateValue, invalidUpdateVisible, updateSilent, cleared, paletteHidden };
  });
  ensure(result.initial === '#aabbcc', 'ColorPicker expands #rgb');
  ensure(result.duringInvalid === null && result.errorVisible, 'ColorPicker invalid text reports error and null value');
  ensure(result.afterBlur === null && result.invalidChange.indexOf(null) >= 0, 'ColorPicker blur invalid notifies null change');
  ensure(result.nativeValue === '#ff0000' && result.textAfterNative === '#ff0000', 'ColorPicker native color input commits normalized value');
  ensure(result.invalidUpdateValue === null && result.invalidUpdateVisible && result.updateSilent, 'ColorPicker invalid programmatic update is visible and silent');
  ensure(result.cleared === null, 'ColorPicker clear empties value');
  ensure(result.paletteHidden, 'ColorPicker empty palette hides swatches');
});

await scenario('FileInput limits, single mode, update, clear, disabled drop', async () => {
  const result = await page.evaluate(() => {
    document.getElementById('host').replaceChildren();
    let changes = 0;
    const fileInput = NoteUI.FileInput.mount(document.getElementById('host'), {
      label: '附件', multiple: true, accept: '.txt,image/*', maxSize: 20, maxFiles: 2,
      onChange: () => { changes += 1; }
    });
    const drop = fileInput.el.querySelector('.nui-fileinput__drop');
    const nativeInput = fileInput.el.querySelector('.nui-fileinput__native');
    let nativeClicks = 0;
    nativeInput.click = function () { nativeClicks += 1; };
    fileInput.el.querySelector('.nui-fileinput__drop-text').click();
    const forwardedClick = nativeClicks === 1;
    const dt = new DataTransfer();
    dt.items.add(new File(['a'], 'a.txt', { type: 'text/plain' }));
    dt.items.add(new File(['b'], 'b.txt', { type: 'text/plain' }));
    dt.items.add(new File(['c'], 'c.txt', { type: 'text/plain' }));
    drop.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
    drop.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
    drop.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true, dataTransfer: dt }));
    const stillHighlighted = fileInput.el.classList.contains('nui-fileinput--dragover');
    drop.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true, dataTransfer: dt }));
    const clearedHighlight = !fileInput.el.classList.contains('nui-fileinput--dragover');
    drop.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    const accepted = fileInput.getValue().map((file) => file.name);
    const maxError = fileInput.el.textContent.includes('已达到最多 2 个文件');
    const beforeUpdate = changes;
    fileInput.update({ files: [new File(['x'], 'program.txt', { type: 'text/plain' })] });
    const updateSilent = changes === beforeUpdate;
    const updatedNames = fileInput.getValue().map((file) => file.name);
    fileInput.el.querySelector('.nui-fileinput__clear-all').click();
    const cleared = fileInput.getValue().length;
    fileInput.update({ disabled: true });
    const dropEvent = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
    drop.dispatchEvent(dropEvent);
    const prevented = dropEvent.defaultPrevented;
    const disabledNoFiles = fileInput.getValue().length;
    fileInput.destroy();

    document.getElementById('host').replaceChildren();
    const single = NoteUI.FileInput.mount(document.getElementById('host'), { label: '单个', maxFiles: 5 });
    const sdt = new DataTransfer();
    sdt.items.add(new File(['1'], 'one.txt', { type: 'text/plain' }));
    sdt.items.add(new File(['2'], 'two.txt', { type: 'text/plain' }));
    single.el.querySelector('.nui-fileinput__drop').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: sdt }));
    const singleNames = single.getValue().map((file) => file.name);
    const singleError = single.el.textContent.includes('单文件模式只接受第一个文件');
    single.destroy();
    return {
      stillHighlighted, clearedHighlight, accepted, maxError, updateSilent, updatedNames, cleared,
      prevented, disabledNoFiles, singleNames, singleError, forwardedClick
    };
  });
  ensure(result.forwardedClick, 'FileInput clicking drop area child opens native picker');
  ensure(result.stillHighlighted && result.clearedHighlight, 'FileInput drag counter keeps highlight until all dragleaves');
  ensure(result.accepted.join(',') === 'a.txt,b.txt' && result.maxError, 'FileInput maxFiles accepts limit and reports extra');
  ensure(result.updateSilent && result.updatedNames.join(',') === 'program.txt', 'FileInput programmatic files update is silent');
  ensure(result.cleared === 0, 'FileInput clear all empties list');
  ensure(result.prevented && result.disabledNoFiles === 0, 'FileInput disabled drop prevents default and adds nothing');
  ensure(result.singleNames.join(',') === 'one.txt' && result.singleError, 'FileInput single mode accepts only first dropped file');
});

await scenario('FileInput native picker reselect after removal', async () => {
  await page.evaluate(() => {
    document.getElementById('host').replaceChildren();
    window.__fileChanges = 0;
    window.__fileInput = NoteUI.FileInput.mount(document.getElementById('host'), {
      label: '原生选择', multiple: false,
      onChange: () => { window.__fileChanges += 1; }
    });
  });
  const payload = { name: 'same.txt', mimeType: 'text/plain', buffer: Buffer.from('same') };
  await page.setInputFiles('.nui-fileinput__native', payload);
  let state = await page.evaluate(() => ({ names: window.__fileInput.getValue().map((f) => f.name), changes: window.__fileChanges }));
  ensure(state.names.length === 1 && state.changes === 1, 'FileInput native picker accepts file');
  await page.setInputFiles('.nui-fileinput__native', payload);
  state = await page.evaluate(() => ({ names: window.__fileInput.getValue().map((f) => f.name), changes: window.__fileChanges }));
  ensure(state.names.length === 1 && state.changes === 2, 'FileInput reselects same file in single mode');
  await page.evaluate(() => window.__fileInput.el.querySelector('.nui-fileinput__remove').click());
  await page.setInputFiles('.nui-fileinput__native', payload);
  state = await page.evaluate(() => ({ names: window.__fileInput.getValue().map((f) => f.name), changes: window.__fileChanges }));
  ensure(state.names.length === 1 && state.changes === 4, 'FileInput can reselect same file after removal');
  await page.evaluate(() => window.__fileInput.destroy());
});

await scenario('Floating layers cleaned after all scenarios', async () => {
  const count = await page.evaluate(() => document.querySelectorAll('.hnv-floating').length);
  ensure(count === 0, 'no floating layer remains');
});

await browser.close();
console.log(JSON.stringify({ results, errors }, null, 2));
const failed = results.filter((item) => !item.ok);
if (failed.length || errors.length) process.exit(1);
