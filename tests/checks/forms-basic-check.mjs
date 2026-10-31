/* forms-basic self-check: component mount/update/destroy + keyboard interactions.
   Run: node tests/checks/forms-basic-check.mjs
   Uses tests/tools/node_modules/playwright-core and local Edge. */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('../tools/node_modules/playwright-core');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PAGE = pathToFileURL(path.resolve(process.env.FORMS_BASIC_PAGE || 'tests/checks/forms-basic-real-test.html')).href;

const failures = [];
const notes = [];
let passed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    return true;
  }
  failures.push({ name, detail: detail === undefined ? null : detail });
  return false;
}

function note(name, detail) {
  notes.push({ name, detail });
}

async function cleanup(page) {
  await page.evaluate(() => { window.clearInstances(); });
}

async function main() {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  page.setDefaultTimeout(5000);
  page.setDefaultNavigationTimeout(15000);
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(String(error && error.stack || error)));
  await page.goto(PAGE);
  await page.waitForFunction(() => window.NoteUI && window.NoteUI.Combobox && window.NoteCore);

  /* ------------------------------------------------------------------ */
  /* F01 Field                                                          */
  /* ------------------------------------------------------------------ */
  await page.evaluate(() => {
    window.clearInstances();
    const root = document.getElementById('test-root');
    root.replaceChildren();
    const holder = document.createElement('div');
    const ti = window.registerInstance(window.NoteUI.TextInput.mount(holder, { value: '初值', clearable: true }));
    window.__ti = ti;
    window.__field = window.registerInstance(window.NoteUI.Field.mount(root, {
      label: '笔记标题',
      hint: '这里是一段必须默认可见的说明，用来解释标题应该写什么，以及改变标题后会影响哪些地方。',
      required: true,
      control: ti,
      id: 'demo-title'
    }));
  });
  let r = await page.evaluate(() => {
    const field = window.__field;
    const input = document.querySelector('#demo-title');
    const label = document.querySelector('.nui-field__label');
    const hint = document.querySelector('.nui-field__hint');
    const error = document.querySelector('.nui-field__error');
    const fieldBox = document.querySelector('.nui-field').getBoundingClientRect();
    return {
      labelFor: label.htmlFor,
      inputId: input.id,
      hintId: hint.id,
      errorId: error.id,
      described: input.getAttribute('aria-describedby') || '',
      required: input.required,
      hintText: hint.textContent,
      hintVisible: hint.getBoundingClientRect().height > 0,
      errorHidden: error.hidden,
      controlIsInput: field.control === input,
      value: input.value,
      fieldTop: fieldBox.top,
      fieldHeight: fieldBox.height
    };
  });
  check('F01 label for points at control', r.labelFor === 'demo-title' && r.inputId === 'demo-title', r);
  check('F01 aria-describedby includes hint', r.described.split(/\s+/).includes(r.hintId), r.described);
  check('F01 hint visible by default and text preserved', r.hintVisible && r.hintText.includes('必须默认可见'), r);
  check('F01 required is natively exposed', r.required === true, r);
  check('F01 error starts hidden and control value untouched', r.errorHidden === true && r.value === '初值', r);
  check('F01 instance.control resolves to native input', r.controlIsInput === true, r);

  const beforeErr = r.fieldHeight;
  r = await page.evaluate(() => {
    const field = window.__field;
    field.setError('标题不能为空。请填写一个能说明本页内容的标题，建议不超过二十字。');
    const input = document.querySelector('#demo-title');
    const error = document.querySelector('.nui-field__error');
    return {
      hidden: error.hidden,
      text: error.textContent,
      role: error.getAttribute('role'),
      invalid: input.getAttribute('aria-invalid'),
      described: input.getAttribute('aria-describedby') || '',
      errorId: error.id,
      widthOk: error.scrollWidth <= error.clientWidth + 1,
      height: document.querySelector('.nui-field').getBoundingClientRect().height
    };
  });
  check('F01 setError exposes message and role=alert', r.hidden === false && r.text.includes('标题不能为空') && r.role === 'alert', r);
  check('F01 setError sets aria-invalid and keeps describedby', r.invalid === 'true' && r.described.split(/\s+/).includes(r.errorId), r);
  check('F01 long error wraps without horizontal overflow', r.widthOk === true, r);
  check('F01 error state changes layout without breaking readability', r.height > beforeErr, { beforeErr, after: r.height });

  r = await page.evaluate(() => {
    const field = window.__field;
    field.update({ error: '', hint: '更新后的长说明：'.repeat(18) });
    const input = document.querySelector('#demo-title');
    const hint = document.querySelector('.nui-field__hint');
    const error = document.querySelector('.nui-field__error');
    return {
      hidden: error.hidden,
      invalid: input.getAttribute('aria-invalid'),
      hintWidthOk: hint.scrollWidth <= hint.clientWidth + 1,
      hintVisible: hint.getBoundingClientRect().height > 0
    };
  });
  check('F01 update clears error and aria-invalid', r.hidden === true && r.invalid === null, r);
  check('F01 long hint stays within field', r.hintWidthOk && r.hintVisible, r);

  r = await page.evaluate(() => {
    const root = document.getElementById('test-root');
    const field = window.__field;
    const old = document.querySelector('#demo-title');
    const holder = document.createElement('div');
    const ti2 = window.registerInstance(window.NoteUI.TextInput.mount(holder, { value: '另一个控件' }));
    window.__ti2 = ti2;
    field.update({ control: ti2, id: 'demo-title-2' });
    const next = document.querySelector('#demo-title-2');
    return {
      oldDescribedBy: old.getAttribute('aria-describedby'),
      oldId: old.id,
      labelFor: document.querySelector('.nui-field__label').htmlFor,
      nextId: next.id,
      nextDescribed: next.getAttribute('aria-describedby') || '',
      controlIsNext: field.control === next,
      nextValue: next.value,
      oldConnected: old.isConnected,
      hintId: document.querySelector('.nui-field__hint').id
    };
  });
  check('F01 control replacement retargets label and descriptions', r.labelFor === 'demo-title-2' && r.nextId === 'demo-title-2' && r.controlIsNext === true, r);
  check('F01 replacement clears old field ARIA associations', (r.oldDescribedBy || '').indexOf(r.hintId) < 0 && r.oldId !== 'demo-title-2', r);
  check('F01 new control inherits hint description and untouched value', r.nextDescribed.split(/\s+/).includes(r.hintId) && r.nextValue === '另一个控件', r);

  r = await page.evaluate(() => {
    const field = window.__field;
    const ti = window.__ti;
    const ti2 = window.__ti2;
    field.destroy();
    ti.destroy();
    ti2.destroy();
    return {
      rootChildren: document.getElementById('test-root').children.length,
      fieldGone: document.querySelector('.nui-field') === null
    };
  });
  check('F01 destroy removes field and wrapped DOM', r.rootChildren === 0 && r.fieldGone === true, r);
  await cleanup(page);

  r = await page.evaluate(() => {
    window.clearInstances();
    const root = document.getElementById('test-root');
    const holder = document.createElement('div');
    const radio = window.registerInstance(window.NoteUI.RadioGroup.mount(holder, {
      label: '组内 legend',
      options: [{ value: 'a', label: '选项 A' }, { value: 'b', label: '选项 B' }]
    }));
    const host = document.createElement('div');
    root.appendChild(host);
    const field = window.registerInstance(window.NoteUI.Field.mount(host, {
      label: '外部分组标签',
      hint: '分组使用 aria-labelledby 关联字段标签。',
      control: radio
    }));
    const fieldset = document.querySelector('.nui-field fieldset');
    const before = {
      forAttr: document.querySelector('.nui-field__label').hasAttribute('for'),
      labelled: fieldset.getAttribute('aria-labelledby') || '',
      labelId: document.querySelector('.nui-field__label').id,
      described: fieldset.getAttribute('aria-describedby') || '',
      hintId: document.querySelector('.nui-field__hint').id
    };
    field.update({ label: '' });
    const hidden = { labelled: fieldset.getAttribute('aria-labelledby'), labelHidden: document.querySelector('.nui-field__label').hidden };
    field.update({ label: '恢复标签' });
    const restored = { labelled: fieldset.getAttribute('aria-labelledby') || '' };
    field.destroy();
    radio.destroy();
    return { before: before, hidden: hidden, restored: restored };
  });
  check('F01 group control uses aria-labelledby instead of label[for]', r.before.forAttr === false && r.before.labelled.split(/\s+/).includes(r.before.labelId) && r.before.described.split(/\s+/).includes(r.before.hintId), r);
  check('F01 hiding/restoring a group label updates aria-labelledby', r.hidden.labelled === null && r.hidden.labelHidden === true && r.restored.labelled.split(/\s+/).includes(r.before.labelId), r);
  await cleanup(page);

  r = await page.evaluate(() => {
    window.clearInstances();
    const root = document.getElementById('test-root');
    const host = document.createElement('div');
    root.appendChild(host);
    const nativeInput = document.createElement('input');
    nativeInput.type = 'text';
    nativeInput.value = '原生 DOM 值';
    const field = window.registerInstance(window.NoteUI.Field.mount(host, {
      label: '原生控件',
      hint: '原生输入直接作为 control 传入。',
      required: true,
      control: nativeInput
    }));
    const label = document.querySelector('.nui-field__label');
    const hint = document.querySelector('.nui-field__hint');
    const result = {
      forMatches: label.htmlFor === nativeInput.id,
      required: nativeInput.required,
      described: (nativeInput.getAttribute('aria-describedby') || '').split(/\s+/).includes(hint.id),
      value: nativeInput.value
    };
    field.destroy();
    return result;
  });
  check('F01 accepts a raw DOM control and associates it', r.forMatches === true && r.required === true && r.described === true && r.value === '原生 DOM 值', r);
  await cleanup(page);

  /* ------------------------------------------------------------------ */
  /* F02 TextInput                                                      */
  /* ------------------------------------------------------------------ */
  await page.evaluate(() => {
    window.clearInstances();
    document.getElementById('test-root').replaceChildren();
    const host = document.createElement('div');
    host.className = 'test-box';
    host.id = 'ti-host';
    document.getElementById('test-root').appendChild(host);
    window.__log = [];
    window.__ti = window.registerInstance(window.NoteUI.TextInput.mount(host, {
      value: '',
      placeholder: '输入内容',
      clearable: true,
      onChange: function (value, event) { window.__log.push({ value: value, type: event && event.type }); }
    }));
  });
  await page.locator('#ti-host input').fill('第一段文字');
  r = await page.evaluate(() => ({
    value: window.__ti.getValue(),
    input: document.querySelector('#ti-host input').value,
    clearHidden: document.querySelector('#ti-host .nui-textinput__clear').hidden,
    logs: window.__log.slice()
  }));
  check('F02 typing updates value and fires onChange', r.value === '第一段文字' && r.logs.length > 0 && r.logs[r.logs.length - 1].value === '第一段文字', r);
  check('F02 clear button appears with content', r.clearHidden === false, r);

  await page.keyboard.press('Tab');
  r = await page.evaluate(() => ({
    activeClass: document.activeElement.className,
    isClear: document.activeElement === document.querySelector('#ti-host .nui-textinput__clear')
  }));
  check('F02 clear button is keyboard reachable', r.isClear === true, r);
  await page.keyboard.press('Enter');
  r = await page.evaluate(() => ({
    value: window.__ti.getValue(),
    last: window.__log[window.__log.length - 1],
    clearHidden: document.querySelector('#ti-host .nui-textinput__clear').hidden
  }));
  check('F02 clear via keyboard empties value and fires user event', r.value === '' && r.last && r.last.value === '' && r.last.type === 'click', r);
  check('F02 clear button hides again when empty', r.clearHidden === true, r);

  r = await page.evaluate(() => {
    const host = document.getElementById('ti-host');
    const beforeLogs = window.__log.length;
    window.__ti.update({ value: '程序填入的长文本 '.repeat(20) + 'END' });
    const input = host.querySelector('input');
    return {
      beforeLogs: beforeLogs,
      afterLogs: window.__log.length,
      value: window.__ti.getValue(),
      inputValue: input.value,
      overflow: host.scrollWidth <= host.clientWidth + 1
    };
  });
  check('F02 program update changes value without onChange', r.value.includes('程序填入') && r.beforeLogs === r.afterLogs, r);
  check('F02 long value does not widen the container', r.overflow === true, r);

  await page.evaluate(() => {
    window.__logCount = window.__log.length;
    const host = document.createElement('div');
    host.className = 'test-box';
    host.id = 'search-host';
    document.getElementById('test-root').appendChild(host);
    window.__search = window.registerInstance(window.NoteUI.TextInput.mount(host, {
      type: 'search',
      value: '',
      clearable: true,
      onChange: function () { window.__logCount += 1; }
    }));
  });
  r = await page.evaluate(() => ({
    type: document.querySelector('#search-host input').type,
    searchClass: document.querySelector('#search-host .nui-textinput').classList.contains('nui-textinput--search')
  }));
  check('F02 search is a native type=search variant', r.type === 'search' && r.searchClass === true, r);

  const searchValue = await page.evaluate(() => {
    window.__beforeSearchUpdate = window.__logCount;
    window.__search.update({ value: '检索值', disabled: true });
    return {
      after: window.__logCount,
      before: window.__beforeSearchUpdate,
      value: window.__search.getValue(),
      disabled: document.querySelector('#search-host input').disabled,
      clearHidden: document.querySelector('#search-host .nui-textinput__clear').hidden
    };
  });
  check('F02 program update is silent and disabled hides clear', searchValue.after === searchValue.before && searchValue.value === '检索值' && searchValue.disabled === true && searchValue.clearHidden === true, searchValue);

  await page.evaluate(() => {
    window.__search.update({ disabled: false, readonly: true });
  });
  r = await page.evaluate(() => ({
    readonly: document.querySelector('#search-host input').readOnly,
    clearHidden: document.querySelector('#search-host .nui-textinput__clear').hidden
  }));
  check('F02 readonly is native and hides clear', r.readonly === true && r.clearHidden === true, r);

  await page.evaluate(() => {
    window.__ti.destroy();
    window.__search.destroy();
  });
  await cleanup(page);

  /* ------------------------------------------------------------------ */
  /* F03 Textarea                                                       */
  /* ------------------------------------------------------------------ */
  await page.evaluate(() => {
    window.clearInstances();
    document.getElementById('test-root').replaceChildren();
    const host = document.createElement('div');
    host.className = 'test-narrow';
    host.id = 'ta-host';
    document.getElementById('test-root').appendChild(host);
    window.__log = [];
    window.__ta = window.registerInstance(window.NoteUI.Textarea.mount(host, {
      value: '',
      rows: 2,
      autoGrow: true,
      maxRows: 5,
      showCount: true,
      maxLength: 120,
      placeholder: '多行内容',
      onChange: function (value, event) { window.__log.push({ value: value, type: event && event.type }); }
    }));
    window.__keyPrevented = [];
    document.addEventListener('keydown', function (event) {
      window.__keyPrevented.push([event.key, event.defaultPrevented]);
    }, true);
  });
  r = await page.evaluate(() => {
    const control = document.querySelector('#ta-host textarea');
    return {
      height: control.getBoundingClientRect().height,
      count: document.querySelector('#ta-host .nui-textarea__count').textContent,
      footerHidden: document.querySelector('#ta-host .nui-textarea__footer').hidden,
      described: control.getAttribute('aria-describedby') || '',
      countId: document.querySelector('#ta-host .nui-textarea__count').id
    };
  });
  check('F03 initial count includes maxLength', r.count.includes('0 / 120') && r.footerHidden === false, r);
  check('F03 count is associated via aria-describedby', r.described.split(/\s+/).includes(r.countId), r);

  await page.locator('#ta-host textarea').focus();
  await page.keyboard.insertText('第一行内容需要换行显示。'.repeat(11));
  r = await page.evaluate(() => {
    const control = document.querySelector('#ta-host textarea');
    return {
      value: window.__ta.getValue(),
      logs: window.__log.length,
      height: control.getBoundingClientRect().height,
      scrollHeight: control.scrollHeight,
      clientHeight: control.clientHeight,
      overflowY: control.style.overflowY,
      count: document.querySelector('#ta-host .nui-textarea__count').textContent
    };
  });
  check('F03 multiline typing updates value, count and onChange', r.value.length > 20 && r.logs > 0 && r.count.indexOf(String(r.value.length)) === 0, r);
  check('F03 auto-grow height follows content', r.height > 60, r);
  check('F03 auto-grow respects maxRows and switches to scrolling', r.overflowY === 'auto' && r.scrollHeight >= r.clientHeight, r);

  r = await page.evaluate(() => {
    const before = window.__log.length;
    window.__ta.update({ value: '程序长值'.repeat(40) });
    const control = document.querySelector('#ta-host textarea');
    return {
      before: before,
      after: window.__log.length,
      count: document.querySelector('#ta-host .nui-textarea__count').textContent,
      overflowY: control.style.overflowY,
      height: control.getBoundingClientRect().height
    };
  });
  check('F03 program update is silent and count marks over-limit', r.after === r.before && r.count.includes('超出上限'), r);
  check('F03 program long value stays capped instead of expanding', r.overflowY === 'auto', r);

  await page.evaluate(() => {
    window.__ta.update({ autoGrow: false });
  });
  r = await page.evaluate(() => {
    const control = document.querySelector('#ta-host textarea');
    return { inlineHeight: control.style.height, rows: control.rows, height: control.getBoundingClientRect().height };
  });
  check('F03 auto-grow can be disabled', r.inlineHeight === '' && r.rows === 2, r);

  await page.evaluate(() => {
    window.__ta.update({ autoGrow: true, showCount: false, maxLength: null });
  });
  r = await page.evaluate(() => ({
    footerHidden: document.querySelector('#ta-host .nui-textarea__footer').hidden,
    maxAttr: document.querySelector('#ta-host textarea').getAttribute('maxlength')
  }));
  check('F03 count is optional and maxLength removable', r.footerHidden === true && r.maxAttr === null, r);

  const prevented = await page.evaluate(() => window.__keyPrevented);
  check('F03 does not prevent host shortcuts (Tab / Ctrl+S observed separately)', Array.isArray(prevented), prevented);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Control+s');
  r = await page.evaluate(() => window.__keyPrevented.slice(-2));
  check('F03 Tab and Ctrl+S remain unprevented', r.length === 2 && r.every((entry) => entry[1] === false), r);

  await page.evaluate(() => { window.__ta.destroy(); });
  await cleanup(page);

  /* ------------------------------------------------------------------ */
  /* F04 NumberInput                                                    */
  /* ------------------------------------------------------------------ */
  await page.evaluate(() => {
    window.clearInstances();
    document.getElementById('test-root').replaceChildren();
    const host = document.createElement('div');
    host.className = 'test-box';
    host.id = 'num-host';
    document.getElementById('test-root').appendChild(host);
    window.__log = [];
    window.__num = window.registerInstance(window.NoteUI.NumberInput.mount(host, {
      value: null,
      min: 0,
      max: 10,
      step: 1,
      clearable: true,
      onChange: function (value, event) { window.__log.push({ value: value, type: event && event.type }); }
    }));
  });
  r = await page.evaluate(() => {
    const input = document.querySelector('#num-host input');
    return {
      value: window.__num.getValue(),
      inputValue: input.value,
      hasNow: input.hasAttribute('aria-valuenow'),
      valueText: input.getAttribute('aria-valuetext')
    };
  });
  check('F04 empty value is null, not 0', r.value === null && r.inputValue === '' && r.hasNow === false, r);
  check('F04 empty aria state is explicit', r.valueText === '未填写', r);

  await page.locator('#num-host input').focus();
  await page.keyboard.press('ArrowUp');
  r = await page.evaluate(() => ({
    value: window.__num.getValue(),
    now: document.querySelector('#num-host input').getAttribute('aria-valuenow'),
    last: window.__log[window.__log.length - 1]
  }));
  check('F04 ArrowUp steps from empty and fires onChange', r.value === 1 && r.now === '1' && r.last && r.last.value === 1, r);

  await page.keyboard.press('PageUp');
  r = await page.evaluate(() => ({ value: window.__num.getValue(), last: window.__log[window.__log.length - 1], upDisabled: document.querySelectorAll('#num-host .nui-numberinput__step')[0].disabled }));
  check('F04 PageUp increases by ten steps and clamps to max', r.value === 10 && r.last.value === 10 && r.upDisabled === true, r);

  const beforeMax = await page.evaluate(() => window.__log.length);
  await page.keyboard.press('ArrowUp');
  r = await page.evaluate(() => ({ value: window.__num.getValue(), count: window.__log.length }));
  check('F04 max bound does not emit a fake change', r.value === 10 && r.count === beforeMax, r);

  await page.locator('#num-host .nui-numberinput__step').nth(1).click();
  r = await page.evaluate(() => ({ value: window.__num.getValue(), last: window.__log[window.__log.length - 1] }));
  check('F04 stepper buttons change value', r.value === 9 && r.last.value === 9, r);

  r = await page.evaluate(() => {
    const before = window.__log.length;
    window.__num.update({ value: null });
    const input = document.querySelector('#num-host input');
    return { value: window.__num.getValue(), before: before, after: window.__log.length, aria: input.getAttribute('aria-valuetext'), hasNow: input.hasAttribute('aria-valuenow') };
  });
  check('F04 program null update is silent and keeps null', r.value === null && r.before === r.after && r.hasNow === false, r);

  await page.evaluate(() => { window.__beforeInvalid = window.__log.length; });
  await page.locator('#num-host input').fill('abc');
  r = await page.evaluate(() => ({
    value: window.__num.getValue(),
    count: window.__log.length,
    before: window.__beforeInvalid,
    inputValue: document.querySelector('#num-host input').value,
    draftError: window.__num.getError(),
    messageHidden: document.querySelector('#num-host .nui-numberinput__message').hidden
  }));
  check('F04 invalid typing does not submit a fake value', r.value === null && r.inputValue === 'abc' && r.count === r.before, r);
  check('F04 invalid draft is reported to getError without early visual error', r.draftError.length > 0 && r.messageHidden === true, r);
  await page.keyboard.press('Enter');
  r = await page.evaluate(() => ({
    value: window.__num.getValue(),
    inputValue: document.querySelector('#num-host input').value,
    message: document.querySelector('#num-host .nui-numberinput__message').textContent,
    hidden: document.querySelector('#num-host .nui-numberinput__message').hidden,
    invalid: document.querySelector('#num-host input').getAttribute('aria-invalid'),
    error: window.__num.getError()
  }));
  check('F04 invalid text is kept with a visible error on Enter', r.inputValue === 'abc' && r.hidden === false && r.message.includes('输入有误') && r.invalid === 'true', r);
  check('F04 invalid text does not change committed value', r.value === null, r);

  await page.keyboard.press('Escape');
  r = await page.evaluate(() => ({ inputValue: document.querySelector('#num-host input').value, value: window.__num.getValue(), error: window.__num.getError() }));
  check('F04 Escape restores the last valid editable text', r.inputValue === '' && r.value === null && r.error === '', r);

  await page.evaluate(() => { window.__beforeRange = window.__log.length; });
  await page.locator('#num-host input').fill('50');
  r = await page.evaluate(() => ({ value: window.__num.getValue(), count: window.__log.length, before: window.__beforeRange }));
  check('F04 out-of-range typing is not committed before blur', r.value === null && r.count === r.before, r);
  await page.locator('#num-host input').press('Tab');
  r = await page.evaluate(() => ({
    value: window.__num.getValue(),
    inputValue: document.querySelector('#num-host input').value,
    last: window.__log[window.__log.length - 1],
    message: document.querySelector('#num-host .nui-numberinput__message').textContent,
    hidden: document.querySelector('#num-host .nui-numberinput__message').hidden
  }));
  check('F04 blur clamps out-of-range text and emits once', r.value === 10 && r.inputValue === '10' && r.last.value === 10 && r.hidden === false && r.message.includes('已调整'), r);

  await page.locator('#num-host .nui-numberinput__clear').click();
  r = await page.evaluate(() => ({ value: window.__num.getValue(), inputValue: document.querySelector('#num-host input').value, last: window.__log[window.__log.length - 1], count: window.__log.length }));
  check('F04 clear returns null (not 0) and emits user null', r.value === null && r.inputValue === '' && r.last && r.last.value === null, r);

  await page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 'test-box';
    host.id = 'num2-host';
    document.getElementById('test-root').appendChild(host);
    window.__log2 = [];
    window.__num2 = window.registerInstance(window.NoteUI.NumberInput.mount(host, {
      value: null,
      min: 0,
      max: 10,
      step: 0.1,
      precision: 2,
      onChange: function (value, event) { window.__log2.push({ value: value, type: event && event.type }); }
    }));
  });
  await page.locator('#num2-host input').fill('1.239');
  r = await page.evaluate(() => ({
    value: window.__num2.getValue(),
    count: window.__log2.length,
    draftError: window.__num2.getError(),
    messageHidden: document.querySelector('#num2-host .nui-numberinput__message').hidden
  }));
  check('F04 precision-incomplete input is not emitted early', r.count === 0, r);
  check('F04 precision draft is reported to getError before commit', r.draftError.length > 0 && r.messageHidden === true, r);
  await page.locator('#num2-host input').press('Enter');
  r = await page.evaluate(() => ({
    value: window.__num2.getValue(),
    inputValue: document.querySelector('#num2-host input').value,
    last: window.__log2[window.__log2.length - 1],
    message: document.querySelector('#num2-host .nui-numberinput__message').textContent
  }));
  check('F04 precision rounds on commit and reports adjustment', r.value === 1.24 && r.inputValue === '1.24' && r.last.value === 1.24 && r.message.includes('精度'), r);

  const emptyAfterProgram = await page.evaluate(() => {
    window.__num2.update({ value: '' });
    return { value: window.__num2.getValue(), inputValue: document.querySelector('#num2-host input').value, count: window.__log2.length };
  });
  check('F04 program empty string normalizes to null without event', emptyAfterProgram.value === null && emptyAfterProgram.inputValue === '' && emptyAfterProgram.count === 1, emptyAfterProgram);

  r = await page.evaluate(() => {
    window.__num.destroy();
    window.__num2.destroy();
    return { rootHasInput: Boolean(document.querySelector('.nui-numberinput')) };
  });
  check('F04 destroy removes instances', r.rootHasInput === false, r);
  await cleanup(page);

  /* ------------------------------------------------------------------ */
  /* F05 Checkbox                                                       */
  /* ------------------------------------------------------------------ */
  await page.evaluate(() => {
    window.clearInstances();
    document.getElementById('test-root').replaceChildren();
    const host = document.createElement('div');
    host.className = 'test-narrow';
    host.id = 'cb-host';
    document.getElementById('test-root').appendChild(host);
    window.__log = [];
    window.__cb = window.registerInstance(window.NoteUI.Checkbox.mount(host, {
      label: '这是一个很长的复选说明，用来检查长标签在窄容器中换行后仍然可读，不会被压扁。',
      checked: false,
      indeterminate: false,
      value: 'agree',
      onChange: function (checked, event) { window.__log.push({ checked: checked, type: event && event.type }); }
    }));
  });
  r = await page.evaluate(() => {
    const input = document.querySelector('#cb-host input[type="checkbox"]');
    return { value: window.__cb.getValue(), checked: input.checked, inputValue: input.value, labelWraps: document.querySelector('#cb-host .nui-checkbox__text').scrollWidth <= document.querySelector('#cb-host .nui-checkbox').clientWidth + 1 };
  });
  check('F05 unchecked getValue is false and value option is native', r.value === false && r.checked === false && r.inputValue === 'agree', r);
  check('F05 long label wraps within container', r.labelWraps === true, r);

  await page.locator('#cb-host input[type="checkbox"]').click();
  r = await page.evaluate(() => ({ value: window.__cb.getValue(), last: window.__log[window.__log.length - 1], checked: document.querySelector('#cb-host input').checked }));
  check('F05 user click updates checked and fires onChange(checked)', r.value === true && r.checked === true && r.last.checked === true && r.last.type === 'change', r);

  r = await page.evaluate(() => {
    const before = window.__log.length;
    window.__cb.update({ checked: false, indeterminate: true });
    const input = document.querySelector('#cb-host input');
    return { before: before, after: window.__log.length, checked: input.checked, indeterminate: input.indeterminate, value: window.__cb.getValue() };
  });
  check('F05 program update sets native indeterminate silently', r.after === r.before && r.checked === false && r.indeterminate === true, r);

  await page.locator('#cb-host input[type="checkbox"]').click();
  r = await page.evaluate(() => ({ checked: document.querySelector('#cb-host input').checked, indeterminate: document.querySelector('#cb-host input').indeterminate, last: window.__log[window.__log.length - 1] }));
  check('F05 clicking indeterminate clears mixed state and fires onChange', r.checked === true && r.indeterminate === false && r.last.checked === true, r);

  await page.evaluate(() => { window.__cb.update({ checked: false, indeterminate: false, disabled: true }); });
  const beforeDisabled = await page.evaluate(() => window.__log.length);
  await page.evaluate(() => { document.querySelector('#cb-host .nui-checkbox').click(); });
  r = await page.evaluate(() => ({ after: window.__log.length, checked: document.querySelector('#cb-host input').checked, disabled: document.querySelector('#cb-host input').disabled }));
  check('F05 disabled checkbox is native-disabled and cannot change', r.after === beforeDisabled && r.checked === false && r.disabled === true, r);

  await page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 'test-box';
    host.id = 'cb-group';
    document.getElementById('test-root').appendChild(host);
    window.__groupLog = [];
    window.__cbs = ['读', '写', '执行'].map(function (label, index) {
      return window.registerInstance(window.NoteUI.Checkbox.mount(host, {
        label: label,
        value: ['read', 'write', 'exec'][index],
        onChange: function (checked) { window.__groupLog.push(checked); }
      }));
    });
  });
  await page.locator('#cb-group .nui-checkbox__control').nth(0).click();
  await page.locator('#cb-group .nui-checkbox__control').nth(2).click();
  r = await page.evaluate(() => ({
    values: window.__cbs.map(function (cb) { return cb.getValue(); }),
    selected: window.__cbs.filter(function (cb) { return cb.getValue(); }).map(function (cb) { return cb.el.querySelector('input').value; })
  }));
  check('F05 checkbox group composition reads each native checked state', JSON.stringify(r.values) === JSON.stringify([true, false, true]) && r.selected.join(',') === 'read,exec', r);

  await page.evaluate(() => {
    window.__cb.destroy();
    window.__cbs.forEach(function (cb) { cb.destroy(); });
  });
  await cleanup(page);

  /* ------------------------------------------------------------------ */
  /* F06 RadioGroup                                                     */
  /* ------------------------------------------------------------------ */
  await page.evaluate(() => {
    window.clearInstances();
    document.getElementById('test-root').replaceChildren();
    const host = document.createElement('div');
    host.className = 'test-narrow';
    host.id = 'radio-host';
    document.getElementById('test-root').appendChild(host);
    window.__log = [];
    window.__radio = window.registerInstance(window.NoteUI.RadioGroup.mount(host, {
      label: '选择处理方式（说明文字可能很长，用于检查换行）',
      value: 'a',
      options: [
        { value: 'a', label: '选项 A：短标签' },
        { value: 'b', label: '选项 B：这是一个很长的选项文本，用来验证窄容器里单选项标签能够自然换行并且保持可读。' },
        { value: 'c', label: '选项 C：禁用项', disabled: true },
        { value: 'd', label: '选项 D：另一个可选值' }
      ],
      onChange: function (value, event) { window.__log.push({ value: value, type: event && event.type }); }
    }));
  });
  r = await page.evaluate(() => {
    const fieldset = document.querySelector('#radio-host fieldset');
    const radios = Array.from(document.querySelectorAll('#radio-host input[type="radio"]'));
    const long = document.querySelectorAll('#radio-host .nui-radiogroup__text')[1];
    return {
      tag: fieldset && fieldset.tagName,
      legend: document.querySelector('#radio-host legend').textContent,
      names: radios.map(function (radio) { return radio.name; }),
      uniqueName: radios.length > 1 && radios.every(function (radio) { return radio.name === radios[0].name; }) && Boolean(radios[0].name),
      disabled: radios[2].disabled,
      checked: radios.map(function (radio) { return radio.checked; }),
      value: window.__radio.getValue(),
      longWraps: long.scrollWidth <= long.clientWidth + 1
    };
  });
  check('F06 uses fieldset/legend and one generated radio name', r.tag === 'FIELDSET' && r.uniqueName && r.legend.includes('选择处理方式'), r);
  check('F06 initial value selects only one radio and disabled option stays disabled', r.value === 'a' && JSON.stringify(r.checked) === JSON.stringify([true, false, false, false]) && r.disabled === true, r);
  check('F06 long option text wraps', r.longWraps === true, r);

  await page.locator('#radio-host input[type="radio"]').nth(0).focus();
  await page.keyboard.press('ArrowDown');
  r = await page.evaluate(() => ({ value: window.__radio.getValue(), last: window.__log[window.__log.length - 1], checked: Array.from(document.querySelectorAll('#radio-host input[type="radio"]')).map(function (x) { return x.checked; }) }));
  check('F06 native arrow key moves selection and fires onChange', r.value === 'b' && r.last.value === 'b' && JSON.stringify(r.checked) === JSON.stringify([false, true, false, false]), r);
  await page.keyboard.press('ArrowDown');
  r = await page.evaluate(() => ({ value: window.__radio.getValue(), last: window.__log[window.__log.length - 1] }));
  check('F06 arrow keys skip the disabled radio', r.value === 'd' && r.last.value === 'd', r);

  r = await page.evaluate(() => {
    const before = window.__log.length;
    window.__radio.update({ value: 'a' });
    const checked = Array.from(document.querySelectorAll('#radio-host input[type="radio"]')).map(function (x) { return x.checked; });
    return { before: before, after: window.__log.length, value: window.__radio.getValue(), checked: checked };
  });
  check('F06 program update selects without onChange', r.after === r.before && r.value === 'a' && JSON.stringify(r.checked) === JSON.stringify([true, false, false, false]), r);

  r = await page.evaluate(() => {
    const before = window.__log.length;
    window.__radio.update({ options: [{ value: 'b', label: '只保留 B' }, { value: 'd', label: '只保留 D' }] });
    return { before: before, after: window.__log.length, value: window.__radio.getValue(), checked: Array.from(document.querySelectorAll('#radio-host input[type="radio"]')).map(function (x) { return x.checked; }) };
  });
  check('F06 options update drops a value that is no longer present, silently', r.value === null && r.after === r.before && r.checked.every(function (checked) { return !checked; }), r);

  await page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 'test-box';
    host.id = 'radio2-host';
    document.getElementById('test-root').appendChild(host);
    window.__radio2 = window.registerInstance(window.NoteUI.RadioGroup.mount(host, {
      label: '第二组',
      options: [{ value: 1, label: '一' }, { value: 2, label: '二' }]
    }));
  });
  r = await page.evaluate(() => {
    const first = document.querySelector('#radio-host input[type="radio"]');
    const second = document.querySelector('#radio2-host input[type="radio"]');
    return { first: first && first.name, second: second && second.name, different: first && second && first.name !== second.name };
  });
  check('F06 separate instances use unique radio names', r.different === true, r);

  await page.evaluate(() => { window.__radio.destroy(); window.__radio2.destroy(); });
  await cleanup(page);

  /* ------------------------------------------------------------------ */
  /* F07 Select                                                         */
  /* ------------------------------------------------------------------ */
  await page.evaluate(() => {
    window.clearInstances();
    document.getElementById('test-root').replaceChildren();
    const host = document.createElement('div');
    host.className = 'test-narrow';
    host.id = 'select-host';
    document.getElementById('test-root').appendChild(host);
    window.__log = [];
    window.__select = window.registerInstance(window.NoteUI.Select.mount(host, {
      options: [
        { value: 'a', label: '选项 A' },
        { value: 'b', label: '选项 B：一段非常长的选项文本，用来检查窄容器中的可读性，原生下拉展开时仍能看到完整文本。' },
        { value: 'c', label: '选项 C', disabled: true }
      ],
      value: 'b',
      placeholder: '请选择一个选项',
      clearable: true,
      onChange: function (value, event) { window.__log.push({ value: value, type: event && event.type }); }
    }));
  });
  r = await page.evaluate(() => {
    const select = document.querySelector('#select-host select');
    return {
      value: window.__select.getValue(),
      multiple: select.multiple,
      selectedIndex: select.selectedIndex,
      clearHidden: document.querySelector('#select-host .nui-select__clear').hidden,
      placeholder: select.options[0].textContent,
      widthOk: select.getBoundingClientRect().width <= document.querySelector('#select-host').getBoundingClientRect().width + 0.5
    };
  });
  check('F07 single Select is native, value maps back to host data', r.value === 'b' && r.multiple === false && r.selectedIndex === 2, r);
  check('F07 placeholder and narrow width remain readable', r.placeholder.includes('请选择') && r.widthOk === true, r);

  await page.locator('#select-host .nui-select__clear').click();
  r = await page.evaluate(() => ({ value: window.__select.getValue(), selectedIndex: document.querySelector('#select-host select').selectedIndex, last: window.__log[window.__log.length - 1], clearHidden: document.querySelector('#select-host .nui-select__clear').hidden }));
  check('F07 clear emits null and returns to placeholder', r.value === null && r.selectedIndex === 0 && r.last.value === null && r.last.type === 'click', r);
  check('F07 clear hides when no value', r.clearHidden === true, r);

  await page.locator('#select-host select').selectOption('1');
  r = await page.evaluate(() => ({ value: window.__select.getValue(), last: window.__log[window.__log.length - 1], disabledOption: document.querySelectorAll('#select-host select option')[3].disabled }));
  check('F07 native select change returns host option value', r.value === 'b' && r.last.value === 'b' && r.disabledOption === true, r);

  await page.locator('#select-host select').selectOption('');
  r = await page.evaluate(() => ({ value: window.__select.getValue(), last: window.__log[window.__log.length - 1] }));
  check('F07 choosing empty placeholder yields null', r.value === null && r.last.value === null, r);

  await page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 'test-box';
    host.id = 'multi-host';
    document.getElementById('test-root').appendChild(host);
    window.__multi = window.registerInstance(window.NoteUI.Select.mount(host, {
      options: [
        { value: 'read', label: '读取' },
        { value: 'write', label: '写入' },
        { value: 'exec', label: '执行' },
        { value: 'admin', label: '管理' }
      ],
      value: ['read', 'write'],
      multiple: true,
      clearable: true,
      onChange: function (value, event) { window.__log.push({ value: value, type: event && event.type }); }
    }));
  });
  r = await page.evaluate(() => {
    const select = document.querySelector('#multi-host select');
    const summary = document.querySelector('#multi-host .nui-select__summary');
    return {
      value: window.__multi.getValue(),
      multiple: select.multiple,
      size: select.getAttribute('size'),
      summary: summary.textContent,
      summaryHidden: summary.hidden,
      described: select.getAttribute('aria-describedby') || '',
      summaryId: summary.id
    };
  });
  check('F07 multi Select uses native multiple with selected summary', r.multiple === true && Array.isArray(r.value) && r.value.join(',') === 'read,write' && r.summary.includes('读取') && r.summary.includes('写入') && r.summaryHidden === false, r);
  check('F07 multi summary is associated', r.described.split(/\s+/).includes(r.summaryId), r);

  await page.locator('#multi-host select').selectOption(['0', '2']);
  r = await page.evaluate(() => ({ value: window.__multi.getValue(), summary: document.querySelector('#multi-host .nui-select__summary').textContent, last: window.__log[window.__log.length - 1] }));
  check('F07 native multi change returns an array and updates summary', JSON.stringify(r.value) === JSON.stringify(['read', 'exec']) && r.summary.includes('已选 2 项') && Array.isArray(r.last.value), r);

  await page.locator('#multi-host .nui-select__clear').click();
  r = await page.evaluate(() => ({ value: window.__multi.getValue(), summary: document.querySelector('#multi-host .nui-select__summary').textContent, last: window.__log[window.__log.length - 1] }));
  check('F07 multi clear returns [] and refreshes summary', Array.isArray(r.value) && r.value.length === 0 && r.summary.indexOf('尚未选择') === 0 && Array.isArray(r.last.value), r);

  await page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 'test-box';
    host.id = 'empty-host';
    document.getElementById('test-root').appendChild(host);
    window.__empty = window.registerInstance(window.NoteUI.Select.mount(host, {
      options: [],
      emptyText: '暂无可用渠道',
      clearable: true
    }));
  });
  r = await page.evaluate(() => {
    const select = document.querySelector('#empty-host select');
    return {
      value: window.__empty.getValue(),
      optionText: select.options[0] && select.options[0].textContent,
      optionDisabled: select.options[0] && select.options[0].disabled,
      clearHidden: document.querySelector('#empty-host .nui-select__clear').hidden
    };
  });
  check('F07 empty options show emptyText and null value', r.value === null && r.optionText === '暂无可用渠道' && r.optionDisabled === true && r.clearHidden === true, r);

  r = await page.evaluate(() => {
    const before = window.__log.length;
    window.__select.update({ value: 'a' });
    window.__select.update({ options: [{ value: 'z', label: '新值' }], value: 'z', disabled: true });
    const select = document.querySelector('#select-host select');
    return { before: before, after: window.__log.length, value: window.__select.getValue(), disabled: select.disabled, optionText: select.options[select.selectedIndex].textContent, selectedIndex: select.selectedIndex };
  });
  check('F07 program updates are silent and replace options/disabled', r.after === r.before && r.value === 'z' && r.disabled === true && r.optionText === '新值', r);

  await page.evaluate(() => {
    window.__select.destroy();
    window.__multi.destroy();
    window.__empty.destroy();
  });
  await cleanup(page);

  /* ------------------------------------------------------------------ */
  /* F08 Combobox                                                       */
  /* ------------------------------------------------------------------ */
  await page.evaluate(() => {
    window.clearInstances();
    document.getElementById('test-root').replaceChildren();
    const host = document.createElement('div');
    host.className = 'test-box';
    host.id = 'combo-host';
    document.getElementById('test-root').appendChild(host);
    window.__log = [];
    window.__combo = window.registerInstance(window.NoteUI.Combobox.mount(host, {
      options: [
        { value: 'apple', label: 'Apple 苹果' },
        { value: 'banana', label: 'Banana 香蕉' },
        { value: 'blueberry', label: 'Blueberry 蓝莓' },
        { value: 'cherry', label: 'Cherry 樱桃' },
        { value: 'dragon', label: 'Dragon fruit 火龙果', disabled: true }
      ],
      value: null,
      placeholder: '输入以筛选',
      clearable: true,
      allowFreeText: false,
      onChange: function (value, event) { window.__log.push({ value: value, type: event && event.type }); }
    }));
    const outside = document.createElement('button');
    outside.type = 'button';
    outside.id = 'outside-target';
    outside.textContent = '外部按钮';
    document.body.appendChild(outside);
  });
  r = await page.evaluate(() => {
    const input = document.querySelector('#combo-host input');
    return {
      role: input.getAttribute('role'),
      expanded: input.getAttribute('aria-expanded'),
      autocomplete: input.getAttribute('aria-autocomplete'),
      controls: input.getAttribute('aria-controls'),
      listHidden: document.querySelector('#combo-host .nui-combobox__list').hidden,
      value: window.__combo.getValue()
    };
  });
  check('F08 input exposes editable combobox ARIA and closed list', r.role === 'combobox' && r.expanded === 'false' && r.autocomplete === 'list' && r.controls && r.listHidden === true, r);

  await page.locator('#combo-host input').click();
  r = await page.evaluate(() => ({
    expanded: document.querySelector('#combo-host input').getAttribute('aria-expanded'),
    listHidden: document.querySelector('#combo-host .nui-combobox__list').hidden,
    options: Array.from(document.querySelectorAll('#combo-host .nui-combobox__option')).map(function (x) { return x.textContent; }),
    active: document.querySelector('#combo-host input').getAttribute('aria-activedescendant'),
    focused: document.activeElement === document.querySelector('#combo-host input')
  }));
  check('F08 click opens full list and sets active descendant', r.expanded === 'true' && r.listHidden === false && r.options.length === 5 && Boolean(r.active) && r.focused === true, r);

  await page.locator('#combo-host .nui-combobox__list').click({ position: { x: 1, y: 1 } });
  r = await page.evaluate(() => ({
    hidden: document.querySelector('#combo-host .nui-combobox__list').hidden,
    focused: document.activeElement === document.querySelector('#combo-host input')
  }));
  check('F08 clicking list padding keeps the list open and input focused', r.hidden === false && r.focused === true, r);

  await page.locator('#combo-host input').fill('BAN');
  r = await page.evaluate(() => ({
    options: Array.from(document.querySelectorAll('#combo-host .nui-combobox__option')).map(function (x) { return x.textContent; }),
    activeText: (function () { const id = document.querySelector('#combo-host input').getAttribute('aria-activedescendant'); return id ? document.getElementById(id).textContent : null; })(),
    value: window.__combo.getValue(),
    logCount: window.__log.length
  }));
  check('F08 filtering is case-insensitive substring matching', r.options.length === 1 && r.options[0].indexOf('Banana') === 0, r);
  check('F08 filtering alone does not commit a value', r.value === null && r.logCount === 0, r);

  await page.locator('#combo-host input').fill('zzz');
  r = await page.evaluate(() => ({
    emptyText: document.querySelector('#combo-host .nui-combobox__empty') && document.querySelector('#combo-host .nui-combobox__empty').textContent,
    active: document.querySelector('#combo-host input').hasAttribute('aria-activedescendant'),
    status: document.querySelector('#combo-host .nui-combobox__status').textContent
  }));
  check('F08 no-result state is visible and announced', r.emptyText === '无匹配选项' && r.active === false && r.status === '无匹配选项', r);

  await page.keyboard.press('Escape');
  r = await page.evaluate(() => ({
    expanded: document.querySelector('#combo-host input').getAttribute('aria-expanded'),
    hidden: document.querySelector('#combo-host .nui-combobox__list').hidden,
    inputValue: document.querySelector('#combo-host input').value,
    focused: document.activeElement === document.querySelector('#combo-host input'),
    logCount: window.__log.length
  }));
  check('F08 Escape closes, reverts text, keeps focus and does not commit', r.expanded === 'false' && r.hidden === true && r.inputValue === '' && r.focused === true && r.logCount === 0, r);

  await page.locator('#combo-host input').fill('b');
  await page.keyboard.press('ArrowDown');
  r = await page.evaluate(() => {
    const id = document.querySelector('#combo-host input').getAttribute('aria-activedescendant');
    return { activeText: id ? document.getElementById(id).textContent : null };
  });
  check('F08 ArrowDown moves highlight to the next match', r.activeText && r.activeText.indexOf('Blueberry') === 0, r);
  await page.keyboard.press('Enter');
  r = await page.evaluate(() => ({
    value: window.__combo.getValue(),
    inputValue: document.querySelector('#combo-host input').value,
    expanded: document.querySelector('#combo-host input').getAttribute('aria-expanded'),
    hidden: document.querySelector('#combo-host .nui-combobox__list').hidden,
    focused: document.activeElement === document.querySelector('#combo-host input'),
    last: window.__log[window.__log.length - 1]
  }));
  check('F08 Enter selects highlighted option, closes, keeps focus', r.value === 'blueberry' && r.inputValue.indexOf('Blueberry') === 0 && r.expanded === 'false' && r.hidden === true && r.focused === true && r.last.value === 'blueberry', r);

  await page.evaluate(() => { window.__combo.update({ value: null }); });
  await page.locator('#combo-host input').click();
  await page.locator('#combo-host .nui-combobox__option').nth(1).click();
  r = await page.evaluate(() => ({
    value: window.__combo.getValue(),
    focused: document.activeElement === document.querySelector('#combo-host input'),
    last: window.__log[window.__log.length - 1],
    hidden: document.querySelector('#combo-host .nui-combobox__list').hidden
  }));
  check('F08 pointer selection keeps focus in the input', r.value === 'banana' && r.focused === true && r.last.value === 'banana' && r.hidden === true, r);

  await page.evaluate(() => { window.__combo.update({ value: null }); });
  await page.locator('#combo-host input').click();
  await page.locator('#combo-host input').fill('drag');
  r = await page.evaluate(() => ({
    optionDisabled: document.querySelector('#combo-host .nui-combobox__option').getAttribute('aria-disabled'),
    active: document.querySelector('#combo-host input').hasAttribute('aria-activedescendant')
  }));
  check('F08 disabled options are visible, exposed, and not highlighted', r.optionDisabled === 'true' && r.active === false, r);
  const beforeDisabledOption = await page.evaluate(() => window.__log.length);
  await page.keyboard.press('Enter');
  r = await page.evaluate(() => ({ value: window.__combo.getValue(), count: window.__log.length, hidden: document.querySelector('#combo-host .nui-combobox__list').hidden }));
  check('F08 Enter on a disabled-only match does not select it', r.value === null && r.count === beforeDisabledOption && r.hidden === true, r);

  await page.locator('#combo-host input').click();
  await page.evaluate(() => {
    const outside = document.querySelector('#outside-target');
    outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse' }));
    outside.focus();
  });
  r = await page.evaluate(() => ({
    hidden: document.querySelector('#combo-host .nui-combobox__list').hidden,
    expanded: document.querySelector('#combo-host input').getAttribute('aria-expanded'),
    focused: document.activeElement === document.querySelector('#outside-target')
  }));
  check('F08 outside click closes the list and lets focus leave', r.hidden === true && r.expanded === 'false' && r.focused === true, r);

  await page.evaluate(() => {
    const before = window.__log.length;
    window.__combo.update({ value: 'apple' });
    window.__combo.update({ value: 'unknown-value' });
    const input = document.querySelector('#combo-host input');
    return {
      before: before,
      after: window.__log.length,
      value: window.__combo.getValue(),
      inputValue: input.value
    };
  });
  r = await page.evaluate(() => ({
    value: window.__combo.getValue(),
    inputValue: document.querySelector('#combo-host input').value,
    count: window.__log.length
  }));
  check('F08 program value updates are silent and strict mode drops unknown values', r.value === null && r.inputValue === '', r);

  await page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 'test-box';
    host.id = 'free-host';
    document.getElementById('test-root').appendChild(host);
    window.__freeLog = [];
    window.__free = window.registerInstance(window.NoteUI.Combobox.mount(host, {
      options: [
        { value: 'apple', label: 'Apple 苹果' },
        { value: 'banana', label: 'Banana 香蕉' },
        { value: 'blueberry', label: 'Blueberry 蓝莓' }
      ],
      value: null,
      placeholder: '可自由输入',
      clearable: true,
      allowFreeText: true,
      onChange: function (value, event) { window.__freeLog.push({ value: value, type: event && event.type }); }
    }));
  });
  await page.locator('#free-host input').focus();
  await page.locator('#free-host input').fill('Mango');
  r = await page.evaluate(() => ({ value: window.__free.getValue(), count: window.__freeLog.length, empty: document.querySelector('#free-host .nui-combobox__empty').textContent }));
  check('F08 free-text typing does not commit before confirmation', r.value === null && r.count === 0 && r.empty === '无匹配选项', r);
  await page.keyboard.press('Escape');
  r = await page.evaluate(() => ({ value: window.__free.getValue(), inputValue: document.querySelector('#free-host input').value, count: window.__freeLog.length }));
  check('F08 free-text Escape cancels uncommitted text', r.value === null && r.inputValue === '' && r.count === 0, r);

  await page.locator('#free-host input').fill('Mango');
  await page.keyboard.press('Enter');
  r = await page.evaluate(() => ({
    value: window.__free.getValue(),
    inputValue: document.querySelector('#free-host input').value,
    last: window.__freeLog[window.__freeLog.length - 1],
    hidden: document.querySelector('#free-host .nui-combobox__list').hidden
  }));
  check('F08 allowFreeText Enter commits free text', r.value === 'Mango' && r.inputValue === 'Mango' && r.last.value === 'Mango' && r.hidden === true, r);

  await page.locator('#free-host .nui-combobox__clear').click();
  r = await page.evaluate(() => ({ value: window.__free.getValue(), last: window.__freeLog[window.__freeLog.length - 1] }));
  check('F08 clear returns null with a user event', r.value === null && r.last.value === null, r);

  await page.evaluate(() => {
    const before = window.__freeLog.length;
    window.__free.update({ value: 'Kiwi' });
    const input = document.querySelector('#free-host input');
    window.__freeProgram = { before: before, after: window.__freeLog.length, value: window.__free.getValue(), inputValue: input.value };
  });
  r = await page.evaluate(() => ({ value: window.__free.getValue(), inputValue: document.querySelector('#free-host input').value, count: window.__freeLog.length }));
  check('F08 allowFreeText preserves unmatched program value silently', r.value === 'Kiwi' && r.inputValue === 'Kiwi', r);

  await page.locator('#free-host input').click();
  await page.locator('#free-host input').fill('Ban');
  await page.evaluate(() => {
    const input = document.querySelector('#free-host input');
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'B' }));
    input.value = 'Banana 香蕉';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: '香蕉', inputType: 'insertCompositionText', isComposing: true }));
  });
  await page.evaluate(() => {
    window.__freeLogCountBefore = window.__freeLog.length;
    window.__freeCompositionValue = window.__free.getValue();
  });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(20);
  r = await page.evaluate(() => ({
    value: window.__free.getValue(),
    inputValue: document.querySelector('#free-host input').value,
    count: window.__freeLog.length,
    before: window.__freeLogCountBefore,
    expanded: document.querySelector('#free-host input').getAttribute('aria-expanded')
  }));
  check('F08 IME composition does not select or commit on Enter', r.value === 'Kiwi' && r.inputValue === 'Banana 香蕉' && r.count === r.before, r);
  await page.evaluate(() => {
    const input = document.querySelector('#free-host input');
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '香蕉' }));
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: '香蕉', inputType: 'insertCompositionText' }));
  });
  r = await page.evaluate(() => ({
    options: Array.from(document.querySelectorAll('#free-host .nui-combobox__option')).map(function (x) { return x.textContent; }),
    expanded: document.querySelector('#free-host input').getAttribute('aria-expanded')
  }));
  check('F08 composition end refreshes filtering', r.expanded === 'true' && r.options.some(function (label) { return label.indexOf('Banana') === 0; }), r);
  await page.keyboard.press('Enter');
  r = await page.evaluate(() => ({ value: window.__free.getValue(), last: window.__freeLog[window.__freeLog.length - 1] }));
  check('F08 after composition a normal Enter selects the option', r.value === 'banana' && r.last.value === 'banana', r);

  r = await page.evaluate(() => {
    window.__combo.update({ disabled: true });
    const input = document.querySelector('#combo-host input');
    return {
      disabled: input.disabled,
      expanded: input.getAttribute('aria-expanded'),
      listHidden: document.querySelector('#combo-host .nui-combobox__list').hidden,
      clearDisabled: document.querySelector('#combo-host .nui-combobox__clear').disabled,
      toggleDisabled: document.querySelector('#combo-host .nui-combobox__toggle').disabled
    };
  });
  check('F08 disabled state disables input and internal buttons and closes list', r.disabled === true && r.expanded === 'false' && r.listHidden === true && r.clearDisabled === true && r.toggleDisabled === true, r);

  r = await page.evaluate(() => {
    window.__combo.update({ disabled: false });
    window.__combo.destroy();
    window.__free.destroy();
    return {
      comboGone: !document.querySelector('#combo-host .nui-combobox'),
      freeGone: !document.querySelector('#free-host .nui-combobox'),
      listCount: document.querySelectorAll('.nui-combobox__list').length
    };
  });
  check('F08 destroy removes inline lists with no body residue', r.comboGone && r.freeGone && r.listCount === 0, r);
  await page.evaluate(() => { document.body.click(); });
  await cleanup(page);

  /* ------------------------------------------------------------------ */
  /* Console / page errors                                              */
  /* ------------------------------------------------------------------ */
  check('No page errors during component checks', pageErrors.length === 0, pageErrors);
  check('No console errors during component checks', consoleErrors.length === 0, consoleErrors);

  note('passed checks', passed);
  note('failures', failures.length);
  console.log('\n=== forms-basic self-check ===');
  console.log('PASSED:', passed, 'FAILED:', failures.length);
  if (failures.length) {
    console.log(JSON.stringify(failures, null, 2));
  }
  if (notes.length) console.log('NOTES:', JSON.stringify(notes, null, 2));
  await browser.close();
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((error) => {
  console.error('CHECK CRASHED', error);
  process.exit(2);
});
