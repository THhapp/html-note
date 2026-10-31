/* forms-basic gallery demo check: every demo mounts, reacts to one control,
   destroys cleanly, and leaves no overlays/style/timers behind. */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('../tools/node_modules/playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PAGE = pathToFileURL(path.resolve(process.env.FORMS_BASIC_PAGE || 'tests/checks/forms-basic-real-test.html')).href;

const failures = [];
let passed = 0;
function check(name, condition, detail) {
  if (condition) { passed += 1; return true; }
  failures.push({ name, detail });
  return false;
}

async function main() {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  page.setDefaultTimeout(5000);
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(String(error && error.stack || error)));
  await page.goto(PAGE);
  await page.waitForFunction(() => window.NoteGalleryDemos && window.NoteUI && window.NoteCore);

  const ids = ['F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08'];
  for (const id of ids) {
    const mounted = await page.evaluate((demoId) => {
      window.clearInstances();
      const root = document.getElementById('test-root');
      root.replaceChildren();
      const host = document.createElement('div');
      host.id = 'demo-host';
      root.appendChild(host);
      const has = typeof window.NoteGalleryDemos[demoId] === 'function';
      if (!has) return { has: has };
      window.__demo = window.NoteGalleryDemos[demoId](host);
      return {
        has: has,
        returns: Boolean(window.__demo && typeof window.__demo.destroy === 'function'),
        childCount: host.children.length,
        demoRoot: Boolean(host.querySelector('.nui-forms-demo')),
        sections: host.querySelectorAll('.nui-forms-demo__section').length,
        stylePresent: Boolean(document.getElementById('nui-forms-demo-style'))
      };
    }, id);
    check(id + ' demo function exists and mounts real components', mounted.has && mounted.returns && mounted.childCount > 0 && mounted.demoRoot && mounted.sections > 0, mounted);
    check(id + ' demo injects scoped demo styles', mounted.stylePresent === true, mounted);

    if (id === 'F01') {
      let state = await page.evaluate(() => ({
        errorShown: !document.querySelector('#demo-host .nui-field__error').hidden,
        inputValue: document.querySelector('#demo-host .nui-textinput__control').value
      }));
      check('F01 demo shows an error and long hint by default', state.errorShown === true, state);
      await page.locator('#demo-host button', { hasText: '清除错误' }).click();
      state = await page.evaluate(() => ({ errorHidden: document.querySelector('#demo-host .nui-field__error').hidden }));
      check('F01 demo error toggle works', state.errorHidden === true, state);
      await page.locator('#demo-host button', { hasText: '程序填入（update）' }).click();
      state = await page.evaluate(() => ({
        value: document.querySelector('#demo-host .nui-textinput__control').value,
        log: document.querySelector('#demo-host .nui-forms-demo__log').textContent
      }));
      check('F01 demo program update changes the control value', state.value === '程序填入的标题' && state.log.includes('程序 update'), state);
    }

    if (id === 'F02') {
      await page.locator('#demo-host button', { hasText: '程序填入' }).first().click();
      let state = await page.evaluate(() => ({ value: document.querySelector('#demo-host .nui-textinput__control').value }));
      check('F02 demo program update fills text input', state.value === '程序更新的文本', state);
      await page.locator('#demo-host .nui-textinput__clear').first().click();
      state = await page.evaluate(() => ({ value: document.querySelector('#demo-host .nui-textinput__control').value, log: document.querySelector('#demo-host .nui-forms-demo__log').textContent }));
      check('F02 demo clear button is real and logs a user event', state.value === '' && state.log.includes('click'), state);
      const search = await page.evaluate(() => ({
        type: document.querySelectorAll('#demo-host .nui-textinput__control')[1].type,
        overflow: document.querySelectorAll('#demo-host .nui-forms-demo__narrow')[0].scrollWidth <= document.querySelectorAll('#demo-host .nui-forms-demo__narrow')[0].clientWidth + 1
      }));
      check('F02 demo shows search variant without container overflow', search.type === 'search' && search.overflow === true, search);
    }

    if (id === 'F03') {
      await page.locator('#demo-host button', { hasText: '填入长文本' }).click();
      let state = await page.evaluate(() => ({
        length: document.querySelector('#demo-host textarea').value.length,
        height: document.querySelector('#demo-host textarea').getBoundingClientRect().height,
        count: document.querySelector('#demo-host .nui-textarea__count').textContent
      }));
      check('F03 demo fills long text and keeps count/height working', state.length > 240 && state.count.indexOf('超出上限') >= 0, state);
      await page.locator('#demo-host button', { hasText: '关闭自动增高' }).click();
      state = await page.evaluate(() => ({ inlineHeight: document.querySelector('#demo-host textarea').style.height }));
      check('F03 demo can turn auto-grow off', state.inlineHeight === '', state);
    }

    if (id === 'F04') {
      await page.locator('#demo-host button', { hasText: '程序设为 42.5' }).click();
      let state = await page.evaluate(() => ({
        value: document.querySelector('#demo-host .nui-numberinput__control').value,
        now: document.querySelector('#demo-host .nui-numberinput__control').getAttribute('aria-valuenow')
      }));
      check('F04 demo program value updates native spinbutton text', state.value === '42.5' && state.now === '42.5', state);
      await page.locator('#demo-host .nui-numberinput__control').fill('abc');
      await page.locator('#demo-host .nui-numberinput__control').press('Enter');
      state = await page.evaluate(() => ({
        value: document.querySelector('#demo-host .nui-numberinput__control').value,
        message: document.querySelector('#demo-host .nui-numberinput__message').textContent,
        hidden: document.querySelector('#demo-host .nui-numberinput__message').hidden
      }));
      check('F04 demo invalid text keeps text and shows a visible message', state.value === 'abc' && state.hidden === false && state.message.includes('输入有误'), state);
    }

    if (id === 'F05') {
      let state = await page.evaluate(() => ({
        indeterminate: document.querySelector('#demo-host .nui-checkbox__control').indeterminate,
        disabled: document.querySelectorAll('#demo-host .nui-checkbox__control')[1].disabled
      }));
      check('F05 demo starts with native indeterminate and disabled examples', state.indeterminate === true && state.disabled === true, state);
      await page.locator('#demo-host .nui-checkbox__control').first().click();
      state = await page.evaluate(() => ({ indeterminate: document.querySelector('#demo-host .nui-checkbox__control').indeterminate, checked: document.querySelector('#demo-host .nui-checkbox__control').checked }));
      check('F05 demo click clears indeterminate natively', state.indeterminate === false && state.checked === true, state);
      const groupCount = await page.evaluate(() => document.querySelectorAll('#demo-host .nui-checkbox__control').length);
      check('F05 demo demonstrates checkbox group usage', groupCount >= 5, groupCount);
    }

    if (id === 'F06') {
      await page.locator('#demo-host button', { hasText: '程序选择“公开”' }).click();
      let state = await page.evaluate(() => {
        const radios = Array.from(document.querySelectorAll('#demo-host input[type="radio"]'));
        return { checked: radios.map((radio) => radio.checked), disabled: radios[2].disabled, legend: document.querySelector('#demo-host legend').textContent };
      });
      check('F06 demo program selects one option and shows long/disabled options', state.checked[3] === true && state.checked.filter(Boolean).length === 1 && state.disabled === true && state.legend.includes('发布范围'), state);
      await page.locator('#demo-host input[type="radio"]').first().focus();
      await page.keyboard.press('ArrowDown');
      state = await page.evaluate(() => {
        const radios = Array.from(document.querySelectorAll('#demo-host input[type="radio"]'));
        return { checked: radios.map((radio) => radio.checked), log: document.querySelector('#demo-host .nui-forms-demo__log').textContent };
      });
      check('F06 demo native arrow key changes selection', state.checked[1] === true && state.log.includes('change'), state);
    }

    if (id === 'F07') {
      await page.locator('#demo-host button', { hasText: '程序选“邮件”' }).click();
      let state = await page.evaluate(() => {
        const selects = Array.from(document.querySelectorAll('#demo-host select'));
        return {
          count: selects.length,
          singleText: selects[0].options[selects[0].selectedIndex].textContent,
          multiSummary: document.querySelector('#demo-host .nui-select__summary').textContent
        };
      });
      check('F07 demo single select program value works', state.count === 3 && state.singleText.indexOf('邮件') === 0, state);
      await page.locator('#demo-host .nui-select__clear').first().click();
      state = await page.evaluate(() => ({ index: document.querySelector('#demo-host select').selectedIndex }));
      check('F07 demo clear returns to placeholder', state.index === 0, state);
      await page.locator('#demo-host button', { hasText: '程序全选' }).click();
      state = await page.evaluate(() => ({ summary: Array.from(document.querySelectorAll('#demo-host .nui-select__summary')).filter((el) => !el.hidden)[0].textContent }));
      check('F07 demo multiple summary updates', state.summary.includes('已选 4 项'), state);
      await page.locator('#demo-host .nui-select__clear').nth(1).click();
      state = await page.evaluate(() => ({ summary: Array.from(document.querySelectorAll('#demo-host .nui-select__summary')).filter((el) => !el.hidden)[0].textContent }));
      check('F07 demo multiple clear shows empty summary', state.summary.indexOf('尚未选择') === 0, state);
      await page.locator('#demo-host button', { hasText: '载入选项（update）' }).click();
      state = await page.evaluate(() => {
        const selects = Array.from(document.querySelectorAll('#demo-host select'));
        return { count: selects[2].options.length, disabled: document.querySelector('#demo-host button[disabled]') !== null };
      });
      check('F07 demo empty state can be replaced and button marks loaded', state.count === 3 && state.disabled === true, state);
    }

    if (id === 'F08') {
      const comboInputs = page.locator('#demo-host .nui-combobox__input');
      await comboInputs.first().click();
      let state = await page.evaluate(() => ({
        open: !document.querySelector('#demo-host .nui-combobox__list').hidden,
        expanded: document.querySelector('#demo-host .nui-combobox__input').getAttribute('aria-expanded')
      }));
      check('F08 demo list opens from the input', state.open === true && state.expanded === 'true', state);
      await comboInputs.first().fill('北');
      state = await page.evaluate(() => ({
        options: Array.from(document.querySelectorAll('#demo-host .nui-combobox__option')).map((option) => option.textContent)
      }));
      check('F08 demo filters options as user types', state.options.length === 1 && state.options[0] === '北京', state);
      await page.keyboard.press('Escape');
      await page.locator('#demo-host button', { hasText: '程序设为“杭州”' }).click();
      state = await page.evaluate(() => ({
        value: document.querySelectorAll('#demo-host .nui-combobox__input')[0].value,
        log: document.querySelector('#demo-host .nui-forms-demo__log').textContent
      }));
      check('F08 demo program value updates strict combobox silently', state.value === '杭州' && state.log.includes('程序 update'), state);
      await comboInputs.nth(1).fill('自定义标签');
      await page.keyboard.press('Enter');
      state = await page.evaluate(() => ({
        value: document.querySelectorAll('#demo-host .nui-combobox__input')[1].value,
        expanded: document.querySelectorAll('#demo-host .nui-combobox__input')[1].getAttribute('aria-expanded'),
        log: document.querySelector('#demo-host .nui-forms-demo__log').textContent
      }));
      check('F08 demo free-text Enter commits and logs', state.value === '自定义标签' && state.expanded === 'false' && state.log.includes('自定义标签'), state);
      await page.evaluate(() => { document.getElementById('demo-host').click(); });
    }

    const destroyed = await page.evaluate(() => {
      window.__demo.destroy();
      window.__demo.destroy();
      return {
        hostEmpty: document.getElementById('demo-host').children.length === 0,
        demoRootGone: !document.querySelector('.nui-forms-demo'),
        styleGone: !document.getElementById('nui-forms-demo-style'),
        comboboxLists: document.querySelectorAll('.nui-combobox__list').length
      };
    });
    check(id + ' demo destroy is clean and idempotent', destroyed.hostEmpty && destroyed.demoRootGone && destroyed.styleGone && destroyed.comboboxLists === 0, destroyed);
  }

  check('Demo checks produced no page errors', pageErrors.length === 0, pageErrors);
  check('Demo checks produced no console errors', consoleErrors.length === 0, consoleErrors);

  console.log('\n=== forms-basic demo check ===');
  console.log('PASSED:', passed, 'FAILED:', failures.length);
  if (failures.length) console.log(JSON.stringify(failures, null, 2));
  await browser.close();
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((error) => {
  console.error('DEMO CHECK CRASHED', error);
  process.exit(2);
});
