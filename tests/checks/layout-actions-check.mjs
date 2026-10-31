import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('../tools/node_modules/playwright-core');

const here = path.dirname(fileURLToPath(import.meta.url));
const hostUrl = pathToFileURL(path.join(here, 'layout-source-host.html')).href;
const edgePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const browser = await chromium.launch({ executablePath: edgePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleErrors = [];
const pageErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(String(error)));

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log('PASS ' + name);
  } catch (error) {
    results.push({ name, ok: false, error: String(error && error.stack || error) });
    console.log('FAIL ' + name + '\n' + (error && error.stack || error));
  }
}

function freshSandbox(width = '900px') {
  return page.evaluate((nextWidth) => {
    const host = document.querySelector('#sandbox');
    host.replaceChildren();
    host.className = 'check-sandbox';
    host.style.width = nextWidth;
    host.style.maxWidth = '100%';
    return true;
  }, width);
}

await page.goto(hostUrl);
await page.waitForTimeout(80);

await step('source loads and all 11 public entries + demos exist', async () => {
  const info = await page.evaluate(() => ({
    core: !!window.NoteCore,
    button: !!window.NoteUI.Button,
    entries: ['Container', 'Stack', 'Inline', 'Grid', 'Panel', 'Divider', 'ScrollArea', 'SplitPane', 'ButtonGroup', 'CopyButton', 'Toggle'].map((name) => [name, !!(window.NoteUI[name] && window.NoteUI[name].mount)]),
    demos: ['L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08', 'A01', 'A02', 'A03'].every((id) => typeof window.NoteGalleryDemos[id] === 'function')
  }));
  assert.equal(info.core, true);
  assert.equal(info.button, true);
  assert.ok(info.entries.every((entry) => entry[1]), JSON.stringify(info.entries));
  assert.equal(info.demos, true);
});

await step('L01 Container mounts, updates, appends and destroys', async () => {
  await freshSandbox();
  const initial = await page.evaluate(() => {
    const host = document.querySelector('#sandbox');
    const content = document.createElement('p');
    content.textContent = '内容 ' + '长中文内容 '.repeat(30);
    const inst = window.NoteUI.Container.mount(host, { maxWidth: 500, padding: 'lg', align: 'start', content });
    window.__test = inst;
    const style = getComputedStyle(inst.el);
    return { child: host.firstElementChild === inst.el, maxWidth: inst.el.style.maxWidth, paddingTop: style.paddingTop, align: inst.el.dataset.align, content: inst.el.textContent.includes('长中文内容') };
  });
  assert.equal(initial.child, true);
  assert.equal(initial.maxWidth, '500px');
  assert.equal(initial.align, 'start');
  assert.ok(parseFloat(initial.paddingTop) >= 20);
  assert.equal(initial.content, true);
  const updated = await page.evaluate(() => {
    const inst = window.__test;
    const next = document.createElement('span');
    next.textContent = '更新后的内容';
    inst.update({ maxWidth: '20rem', padding: 'none', align: 'center', content: next });
    inst.el.appendChild(document.createTextNode(' + append'));
    return { maxWidth: inst.el.style.maxWidth, padding: getComputedStyle(inst.el).paddingTop, align: inst.el.dataset.align, text: inst.el.textContent };
  });
  assert.equal(updated.maxWidth, '20rem');
  assert.equal(updated.padding, '0px');
  assert.equal(updated.align, 'center');
  assert.ok(updated.text.includes('更新后的内容 + append'));
  const destroyed = await page.evaluate(() => {
    window.__test.destroy();
    window.__test.destroy();
    return document.querySelector('#sandbox').children.length;
  });
  assert.equal(destroyed, 0);
});

await step('L02 Stack uses .nui-vstack, configurable gaps/alignment, supports append', async () => {
  await freshSandbox();
  const result = await page.evaluate(() => {
    const host = document.querySelector('#sandbox');
    const inst = window.NoteUI.Stack.mount(host, { gap: 12, align: 'center' });
    const first = document.createElement('div'); first.textContent = '第一项';
    const second = document.createElement('div'); second.textContent = '第二项';
    inst.append(first, second);
    const before = { cls: inst.el.className, gap: getComputedStyle(inst.el).rowGap, align: getComputedStyle(inst.el).alignItems, direction: getComputedStyle(inst.el).flexDirection };
    inst.update({ gap: 'lg', align: 'start' });
    const after = { gap: getComputedStyle(inst.el).rowGap, align: getComputedStyle(inst.el).alignItems, count: inst.el.children.length };
    window.__test = inst;
    return { before, after };
  });
  assert.ok(result.before.cls.includes('nui-vstack'));
  assert.ok(!/(^|\s)nui-stack(\s|$)/.test(result.before.cls));
  assert.equal(result.before.gap, '12px');
  assert.equal(result.before.align, 'center');
  assert.equal(result.before.direction, 'column');
  assert.equal(result.after.gap, '28px');
  assert.equal(result.after.align, 'flex-start');
  assert.equal(result.after.count, 2);
  await page.evaluate(() => window.__test.destroy());
});

await step('L03 Inline wraps, does not shrink items, supports nowrap local overflow', async () => {
  await freshSandbox('320px');
  const result = await page.evaluate(() => {
    const host = document.querySelector('#sandbox');
    const inst = window.NoteUI.Inline.mount(host, { gap: 'sm', wrap: true });
    const a = document.createElement('span');
    a.textContent = '长中文标签内容';
    a.style.whiteSpace = 'nowrap';
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = '操作按钮';
    b.style.whiteSpace = 'nowrap';
    inst.append(a, b);
    const before = { cls: inst.el.className, wrap: getComputedStyle(inst.el).flexWrap, gap: getComputedStyle(inst.el).columnGap };
    inst.update({ wrap: false });
    const after = { wrap: getComputedStyle(inst.el).flexWrap, overflowX: getComputedStyle(inst.el).overflowX, shrink: getComputedStyle(a).flexShrink };
    window.__test = inst;
    return { before, after };
  });
  assert.ok(result.before.cls.includes('nui-hstack'));
  assert.equal(result.before.wrap, 'wrap');
  assert.equal(result.before.gap, '8px');
  assert.equal(result.after.wrap, 'nowrap');
  assert.equal(result.after.overflowX, 'auto');
  assert.equal(result.after.shrink, '0');
  await page.evaluate(() => window.__test.destroy());
});

await step('L04 Grid auto-fit/fixed columns, spans and direct-child observation', async () => {
  await freshSandbox('900px');
  const result = await page.evaluate(async () => {
    const host = document.querySelector('#sandbox');
    const inst = window.NoteUI.Grid.mount(host, { columns: 'auto', minColumnWidth: '12rem', gap: 'md' });
    const a = document.createElement('div'); a.textContent = 'A';
    const b = document.createElement('div'); b.textContent = 'B'; b.setAttribute('data-nui-span', '2');
    inst.append(a, b);
    const autoTemplate = inst.el.style.gridTemplateColumns;
    const autoSpan = b.style.gridColumn;
    inst.update({ columns: 3 });
    const fixedTemplate = inst.el.style.gridTemplateColumns;
    const c = document.createElement('div'); c.textContent = 'C'; c.setAttribute('data-nui-span', '9');
    inst.el.appendChild(c);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const clampedSpan = c.style.gridColumn;
    window.__test = inst;
    return { autoTemplate, autoSpan, fixedTemplate, clampedSpan };
  });
  assert.ok(result.autoTemplate.includes('auto-fit'));
  assert.ok(result.autoTemplate.includes('minmax'));
  assert.equal(result.autoSpan, 'span 2');
  assert.ok(result.fixedTemplate.includes('repeat(3'));
  assert.equal(result.clampedSpan, 'span 3');
  await page.evaluate(() => window.__test.destroy());
});

await step('L05 Panel exposes header/body/footer and updates presentation', async () => {
  await freshSandbox();
  const result = await page.evaluate(() => {
    const host = document.querySelector('#sandbox');
    const actions = document.createElement('button'); actions.type = 'button'; actions.textContent = '操作';
    const inst = window.NoteUI.Panel.mount(host, {
      title: '标题', description: '说明', content: '主体', actions, footer: '页脚', tone: 'plain', padding: 'md', border: true
    });
    const initial = { tag: inst.el.tagName, hasHeader: !!inst.header, hasBody: !!inst.body, hasFooter: !!inst.footer, aria: inst.el.getAttribute('aria-labelledby'), body: inst.body.textContent, actions: inst.header.textContent };
    inst.update({ tone: 'accent', padding: 'none', border: false, title: '', description: '', actions: '', content: '新主体' });
    const after = { tone: inst.el.dataset.tone, border: inst.el.dataset.border, padding: getComputedStyle(inst.body).paddingTop, headerHidden: inst.header.hidden, body: inst.body.textContent, aria: inst.el.hasAttribute('aria-labelledby') };
    inst.update({ title: '重新加回的标题' });
    const restored = { headerHidden: inst.header.hidden, title: inst.header.textContent.includes('重新加回的标题') };
    window.__test = inst;
    return { initial, after, restored };
  });
  assert.equal(result.initial.tag, 'SECTION');
  assert.equal(result.initial.hasHeader, true);
  assert.equal(result.initial.hasBody, true);
  assert.equal(result.initial.hasFooter, true);
  assert.ok(result.initial.aria);
  assert.ok(result.initial.actions.includes('操作'));
  assert.equal(result.after.tone, 'accent');
  assert.equal(result.after.border, 'none');
  assert.equal(result.after.padding, '0px');
  assert.equal(result.after.headerHidden, true);
  assert.equal(result.after.body, '新主体');
  assert.equal(result.after.aria, false);
  assert.equal(result.restored.headerHidden, false);
  assert.equal(result.restored.title, true);
  await page.evaluate(() => window.__test.destroy());
});

await step('L06 Divider has separator semantics, labels and orientation spacing', async () => {
  await freshSandbox();
  const result = await page.evaluate(() => {
    const host = document.querySelector('#sandbox');
    const inst = window.NoteUI.Divider.mount(host, { orientation: 'horizontal', label: '其他说明', spacing: 'lg' });
    const h = {
      role: inst.el.getAttribute('role'),
      orientation: inst.el.getAttribute('aria-orientation'),
      label: inst.el.getAttribute('aria-label'),
      paddingTop: getComputedStyle(inst.el).paddingTop
    };
    inst.update({ orientation: 'vertical', label: '或者', spacing: 'sm' });
    const v = {
      orientation: inst.el.getAttribute('aria-orientation'),
      label: inst.el.getAttribute('aria-label'),
      paddingLeft: getComputedStyle(inst.el).paddingLeft,
      minHeight: getComputedStyle(inst.el).minHeight,
      writing: getComputedStyle(inst.el.querySelector('.nui-divider__label')).writingMode
    };
    window.__test = inst;
    return { h, v };
  });
  assert.equal(result.h.role, 'separator');
  assert.equal(result.h.orientation, 'horizontal');
  assert.equal(result.h.label, '其他说明');
  assert.equal(result.h.paddingTop, '28px');
  assert.equal(result.v.orientation, 'vertical');
  assert.equal(result.v.label, '或者');
  assert.equal(result.v.paddingLeft, '8px');
  assert.ok(parseFloat(result.v.minHeight) >= 40);
  assert.ok(result.v.writing.includes('vertical'));
  await page.evaluate(() => window.__test.destroy());
});

await step('L07 ScrollArea shows/updates native overflow hints and is focusable', async () => {
  await freshSandbox();
  await page.evaluate(() => {
    const host = document.querySelector('#sandbox');
    const content = document.createElement('div');
    for (let index = 0; index < 12; index += 1) {
      const p = document.createElement('p');
      p.textContent = '第 ' + index + ' 行：长内容用于测试原生局部滚动与可见溢出提示。';
      content.appendChild(p);
    }
    const inst = window.NoteUI.ScrollArea.mount(host, { maxHeight: 120, content, label: '测试滚动区', hints: true, tabIndex: 0 });
    window.__test = inst;
  });
  // 提示状态由 mount 后的 rAF 更新；等它落定再断言，避免高负载下把“尚未更新”当失败。
  await page.waitForFunction(() => {
    const inst = window.__test;
    if (!inst) return false;
    const top = inst.el.querySelector('.nui-scroll-area__hint--top');
    const bottom = inst.el.querySelector('.nui-scroll-area__hint--bottom');
    return top && bottom && top.hidden === true && bottom.hidden === false;
  }, null, { timeout: 5000 });
  const initial = await page.evaluate(() => {
    const inst = window.__test;
    return {
      role: inst.viewport.getAttribute('role'),
      label: inst.viewport.getAttribute('aria-label'),
      tabindex: inst.viewport.tabIndex,
      bottom: !inst.el.querySelector('.nui-scroll-area__hint--bottom').hidden,
      top: !inst.el.querySelector('.nui-scroll-area__hint--top').hidden,
      overflowY: inst.viewport.scrollHeight > inst.viewport.clientHeight,
      overscroll: getComputedStyle(inst.viewport).overscrollBehaviorY
    };
  });
  assert.equal(initial.role, 'region');
  assert.equal(initial.label, '测试滚动区');
  assert.equal(initial.tabindex, 0);
  assert.equal(initial.bottom, true);
  assert.equal(initial.top, false);
  assert.equal(initial.overflowY, true);
  assert.equal(initial.overscroll, 'auto');
  await page.evaluate(() => {
    const inst = window.__test;
    inst.viewport.scrollTop = inst.viewport.scrollHeight;
  });
  await page.waitForFunction(() => {
    const inst = window.__test;
    if (!inst) return false;
    const top = inst.el.querySelector('.nui-scroll-area__hint--top');
    const bottom = inst.el.querySelector('.nui-scroll-area__hint--bottom');
    return top && bottom && top.hidden === false && bottom.hidden === true;
  }, null, { timeout: 5000 });
  const bottom = await page.evaluate(() => {
    const inst = window.__test;
    inst.focus();
    return {
      top: !inst.el.querySelector('.nui-scroll-area__hint--top').hidden,
      bottom: !inst.el.querySelector('.nui-scroll-area__hint--bottom').hidden,
      active: document.activeElement === inst.viewport
    };
  });
  assert.equal(bottom.top, true);
  assert.equal(bottom.bottom, false);
  assert.equal(bottom.active, true);
  await page.evaluate(() => {
    const inst = window.__test;
    inst.update({ content: '短内容' });
  });
  await page.waitForFunction(() => {
    const inst = window.__test;
    if (!inst) return false;
    const top = inst.el.querySelector('.nui-scroll-area__hint--top');
    const bottom = inst.el.querySelector('.nui-scroll-area__hint--bottom');
    return top && bottom && top.hidden === true && bottom.hidden === true;
  }, null, { timeout: 5000 });
  const short = await page.evaluate(() => {
    const inst = window.__test;
    return {
      top: inst.el.querySelector('.nui-scroll-area__hint--top').hidden,
      bottom: inst.el.querySelector('.nui-scroll-area__hint--bottom').hidden,
      overflow: inst.viewport.scrollHeight > inst.viewport.clientHeight
    };
  });
  assert.equal(short.overflow, false);
  assert.equal(short.top, true);
  assert.equal(short.bottom, true);
  await page.evaluate(() => window.__test.destroy());
  assert.equal(await page.evaluate(() => document.querySelector('#sandbox').children.length), 0);
});

await step('L08 SplitPane pointer drag, keyboard, aria, auto orientation and program updates', async () => {
  await freshSandbox('900px');
  await page.evaluate(() => {
    const host = document.querySelector('#sandbox');
    const wrap = document.createElement('div');
    wrap.style.width = '800px';
    wrap.style.maxWidth = '100%';
    host.appendChild(wrap);
    window.__splitCalls = [];
    window.__split = window.NoteUI.SplitPane.mount(wrap, {
      start: '起始区域 ' + '长内容 '.repeat(20),
      end: '结束区域 ' + '英文 content '.repeat(20),
      ratio: 0.5,
      minStart: 120,
      minEnd: 120,
      onChange: function (ratio, event) {
        window.__splitCalls.push({ ratio, type: event && event.type, key: event && event.key });
      }
    });
  });
  await page.waitForTimeout(100);
  const initial = await page.evaluate(() => {
    const inst = window.__split;
    return {
      orientation: inst.getOrientation(),
      dataOrientation: inst.el.dataset.orientation,
      ratio: inst.getValue(),
      now: inst.separator.getAttribute('aria-valuenow'),
      min: inst.separator.getAttribute('aria-valuemin'),
      max: inst.separator.getAttribute('aria-valuemax'),
      role: inst.separator.getAttribute('role'),
      tabindex: inst.separator.tabIndex,
      ariaOrientation: inst.separator.getAttribute('aria-orientation'),
      columns: inst.el.style.gridTemplateColumns
    };
  });
  assert.equal(initial.orientation, 'horizontal');
  assert.equal(initial.dataOrientation, 'horizontal');
  assert.equal(initial.role, 'separator');
  assert.equal(initial.tabindex, 0);
  assert.equal(initial.ariaOrientation, 'vertical');
  assert.ok(initial.columns.includes('px'));
  assert.ok(Number(initial.now) >= Number(initial.min) && Number(initial.now) <= Number(initial.max));
  const separator = page.locator('#sandbox .nui-split__separator');
  const box = await separator.boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const afterDrag = await page.evaluate(() => ({
    ratio: window.__split.getValue(),
    calls: window.__splitCalls.length,
    now: Number(window.__split.separator.getAttribute('aria-valuenow'))
  }));
  assert.ok(afterDrag.ratio > initial.ratio);
  assert.ok(afterDrag.calls > 0);
  assert.ok(afterDrag.now > Number(initial.now));
  await page.evaluate(() => window.__split.separator.focus());
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Home');
  const afterKeys = await page.evaluate(() => ({
    ratio: window.__split.getValue(),
    calls: window.__splitCalls.map((entry) => entry.key).filter(Boolean),
    now: Number(window.__split.separator.getAttribute('aria-valuenow')),
    min: Number(window.__split.separator.getAttribute('aria-valuemin')),
    startWidth: window.__split.startEl.getBoundingClientRect().width,
    endWidth: window.__split.endEl.getBoundingClientRect().width
  }));
  assert.ok(afterKeys.calls.includes('ArrowLeft'));
  assert.ok(afterKeys.calls.includes('Home'));
  assert.equal(Math.round(afterKeys.ratio * 100), afterKeys.min);
  assert.ok(afterKeys.startWidth >= 119);
  assert.ok(afterKeys.endWidth >= 119);
  const beforeProgramCalls = await page.evaluate(() => window.__splitCalls.length);
  const program = await page.evaluate(() => {
    window.__split.update({ ratio: 0.3, start: '程序更新的起始内容' });
    return { ratio: window.__split.getValue(), calls: window.__splitCalls.length, start: window.__split.startEl.textContent };
  });
  assert.equal(program.calls, beforeProgramCalls);
  assert.equal(program.start, '程序更新的起始内容');
  assert.ok(program.ratio >= 0 && program.ratio <= 1);
  await page.evaluate(() => {
    const host = document.querySelector('#sandbox');
    host.firstElementChild.style.width = '470px';
  });
  await page.waitForTimeout(160);
  const narrow = await page.evaluate(() => {
    const inst = window.__split;
    return {
      orientation: inst.getOrientation(),
      dataOrientation: inst.el.dataset.orientation,
      ariaOrientation: inst.separator.getAttribute('aria-orientation'),
      height: getComputedStyle(inst.el).height,
      rows: inst.el.style.gridTemplateRows
    };
  });
  assert.equal(narrow.orientation, 'vertical');
  assert.equal(narrow.dataOrientation, 'vertical');
  assert.equal(narrow.ariaOrientation, 'horizontal');
  assert.ok(parseFloat(narrow.height) > 200);
  assert.ok(narrow.rows.includes('px'));
  await page.evaluate(() => {
    window.__split.destroy();
    const host = document.querySelector('#sandbox');
    host.replaceChildren();
  });
  assert.equal(await page.evaluate(() => document.querySelectorAll('#sandbox .nui-split').length), 0);
});

await step('A01 ButtonGroup reuses Button, disables, toolbar roves focus, destroys children', async () => {
  await freshSandbox();
  const result = await page.evaluate(async () => {
    const host = document.querySelector('#sandbox');
    window.__groupClicks = [];
    const icon = window.NoteCore.icons.get('link');
    const group = window.NoteUI.ButtonGroup.mount(host, {
      label: '测试按钮组',
      items: [
        { label: '主要', variant: 'primary', onClick: function () { window.__groupClicks.push('item'); } },
        { label: '链接', icon, iconOnly: true, ariaLabel: '链接' },
        { label: '禁用', disabled: true }
      ],
      onClick: function (item) { window.__groupClicks.push('group:' + item.label); }
    });
    const initial = {
      role: group.el.getAttribute('role'),
      label: group.el.getAttribute('aria-label'),
      buttons: group.el.querySelectorAll('.nui-button').length,
      iconSvg: !!group.el.querySelector('.nui-button--icon-only svg'),
      disabled: group.el.querySelectorAll('.nui-button:disabled').length
    };
    group.el.querySelector('.nui-button').click();
    group.update({ disabled: true });
    const disabled = Array.from(group.el.querySelectorAll('.nui-button')).every((button) => button.disabled);
    group.update({ disabled: false, role: 'toolbar' });
    const tabStops = Array.from(group.el.querySelectorAll('.nui-button')).filter((button) => button.tabIndex === 0).length;
    group.el.querySelector('.nui-button').focus();
    group.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    group.update({ items: [{ label: '新按钮' }] });
    const rebuilt = group.el.querySelectorAll('.nui-button').length;
    window.__testGroup = group;
    return { initial, disabled, tabStops, rebuilt, clicks: window.__groupClicks };
  });
  assert.equal(result.initial.role, 'group');
  assert.equal(result.initial.label, '测试按钮组');
  assert.equal(result.initial.buttons, 3);
  assert.equal(result.initial.iconSvg, true);
  assert.equal(result.initial.disabled, 1);
  assert.deepEqual(result.clicks.slice(0, 2), ['item', 'group:主要']);
  assert.equal(result.disabled, true);
  assert.equal(result.tabStops, 1);
  assert.equal(result.rebuilt, 1);
  await page.evaluate(() => {
    window.__testGroup.destroy();
    const host = document.querySelector('#sandbox');
    host.replaceChildren();
    const toolbar = window.NoteUI.ButtonGroup.mount(host, {
      role: 'toolbar',
      label: '方向键测试',
      items: [{ label: '甲' }, { label: '乙' }, { label: '丙' }]
    });
    window.__toolbar = toolbar;
    toolbar.el.querySelectorAll('.nui-button')[0].focus();
  });
  await page.keyboard.press('ArrowRight');
  const toolbarFocus = await page.evaluate(() => ({
    active: document.activeElement.textContent,
    tabStops: Array.from(document.querySelectorAll('#sandbox .nui-button')).map((button) => button.tabIndex)
  }));
  assert.equal(toolbarFocus.active, '乙');
  assert.deepEqual(toolbarFocus.tabStops, [-1, 0, -1]);
  await page.evaluate(() => window.__toolbar.destroy());
  assert.equal(await page.evaluate(() => document.querySelector('#sandbox').children.length), 0);
});

await step('A02 CopyButton uses Button + NoteCore.copy, feedback timer and manual fallback', async () => {
  await freshSandbox();
  await page.evaluate(() => {
    const host = document.querySelector('#sandbox');
    window.__origCopy = window.NoteCore.copy;
    window.__copyCalls = [];
    window.NoteCore.copy = function () { return Promise.resolve({ ok: true, method: 'clipboard' }); };
    const inst = window.NoteUI.CopyButton.mount(host, {
      text: '复制目标的文本\nSecond line',
      label: '复制测试文本',
      copiedLabel: '成功反馈',
      failedLabel: '失败反馈',
      feedbackDuration: 70,
      onCopy: function (result) { window.__copyCalls.push(result); }
    });
    window.__copy = inst;
  });
  await page.evaluate(() => window.__copy.button.el.click());
  await page.waitForTimeout(35);
  const success = await page.evaluate(() => ({
    status: window.__copy.el.querySelector('.nui-copy-button__status').textContent,
    hidden: window.__copy.el.querySelector('.nui-copy-button__status').hidden,
    fallbackHidden: window.__copy.el.querySelector('.nui-copy-button__fallback').hidden,
    calls: window.__copyCalls.length,
    usesButton: window.__copy.el.querySelector('.nui-copy-button .nui-button') === window.__copy.button.el
  }));
  assert.ok(success.status.includes('成功反馈'));
  assert.equal(success.hidden, false);
  assert.equal(success.fallbackHidden, true);
  assert.equal(success.calls, 1);
  assert.equal(success.usesButton, true);
  await page.waitForTimeout(100);
  const hiddenAfterTimer = await page.evaluate(() => window.__copy.el.querySelector('.nui-copy-button__status').hidden);
  assert.equal(hiddenAfterTimer, true);
  await page.evaluate(() => {
    window.NoteCore.copy = function () { return Promise.resolve({ ok: false, method: 'manual' }); };
    window.__copy.button.el.click();
  });
  await page.waitForTimeout(50);
  const failure = await page.evaluate(() => {
    const fallback = window.__copy.el.querySelector('.nui-copy-button__fallback');
    const textarea = fallback.querySelector('textarea');
    return {
      visible: !fallback.hidden,
      status: window.__copy.el.querySelector('.nui-copy-button__status').textContent,
      value: textarea.value,
      readonly: textarea.readOnly,
      focus: document.activeElement === textarea,
      calls: window.__copyCalls.length,
      last: window.__copyCalls[window.__copyCalls.length - 1]
    };
  });
  assert.equal(failure.visible, true);
  assert.ok(failure.status.includes('失败反馈'));
  assert.equal(failure.value, '复制目标的文本\nSecond line');
  assert.equal(failure.readonly, true);
  assert.equal(failure.focus, true);
  assert.equal(failure.calls, 2);
  assert.equal(failure.last.ok, false);
  const beforeUpdateCalls = await page.evaluate(() => window.__copyCalls.length);
  await page.evaluate(() => window.__copy.update({ text: '更新后文本' }));
  const afterUpdate = await page.evaluate(() => ({
    calls: window.__copyCalls.length,
    fallbackHidden: window.__copy.el.querySelector('.nui-copy-button__fallback').hidden
  }));
  assert.equal(afterUpdate.calls, beforeUpdateCalls);
  assert.equal(afterUpdate.fallbackHidden, true);
  await page.evaluate(() => {
    window.__copy.destroy();
    window.NoteCore.copy = window.__origCopy;
  });
  assert.equal(await page.evaluate(() => document.querySelector('#sandbox').children.length), 0);
});

await step('A03 Toggle pressed semantics, exclusive/multi groups, silent update values', async () => {
  await freshSandbox();
  const result = await page.evaluate(() => {
    const host = document.querySelector('#sandbox');
    window.__toggleCalls = { single: 0, exclusive: [], multi: [] };
    const single = window.NoteUI.Toggle.mount(host, {
      label: '加粗长标签',
      pressed: false,
      onChange: function () { window.__toggleCalls.single += 1; }
    });
    const singleButton = single.el.querySelector('.nui-toggle__button');
    const before = { pressed: singleButton.getAttribute('aria-pressed'), value: single.getValue() };
    singleButton.click();
    const afterClick = { pressed: singleButton.getAttribute('aria-pressed'), value: single.getValue(), calls: window.__toggleCalls.single };
    single.update({ pressed: false });
    const afterUpdate = { pressed: singleButton.getAttribute('aria-pressed'), value: single.getValue(), calls: window.__toggleCalls.single };
    const exclusive = window.NoteUI.Toggle.mount(host, {
      label: '互斥组',
      options: [
        { value: 'a', label: '选项 A' },
        { value: 'b', label: '选项 B' },
        { value: 'off', label: '禁用项', disabled: true }
      ],
      value: 'a',
      exclusive: true,
      onChange: function (value) { window.__toggleCalls.exclusive.push(value); }
    });
    const exButtons = Array.from(exclusive.el.querySelectorAll('.nui-toggle__button'));
    exButtons[1].click();
    const exAfter = {
      role: exclusive.el.getAttribute('role'),
      label: exclusive.el.getAttribute('aria-label'),
      pressed: exButtons.map((button) => button.getAttribute('aria-pressed')),
      value: exclusive.getValue()
    };
    exButtons[2].click();
    const exDisabled = { value: exclusive.getValue(), calls: window.__toggleCalls.exclusive.length };
    const multi = window.NoteUI.Toggle.mount(host, {
      label: '多选组',
      options: [
        { value: 'x', label: 'X' },
        { value: 'y', label: 'Y' },
        { value: 'z', label: 'Z', disabled: true }
      ],
      multi: true,
      value: ['x'],
      onChange: function (value) { window.__toggleCalls.multi.push(value); }
    });
    const multiButtons = Array.from(multi.el.querySelectorAll('.nui-toggle__button'));
    multiButtons[1].click();
    const multiAfter = { value: multi.getValue(), calls: window.__toggleCalls.multi.length };
    multi.update({ value: ['z'] });
    const multiUpdate = { value: multi.getValue(), calls: window.__toggleCalls.multi.length };
    multiButtons[0].click();
    const multiToggle = { value: multi.getValue(), calls: window.__toggleCalls.multi.length };
    window.__toggleInstances = [single, exclusive, multi];
    return { before, afterClick, afterUpdate, exAfter, exDisabled, multiAfter, multiUpdate, multiToggle };
  });
  assert.deepEqual(result.before, { pressed: 'false', value: false });
  assert.deepEqual(result.afterClick, { pressed: 'true', value: true, calls: 1 });
  assert.deepEqual(result.afterUpdate, { pressed: 'false', value: false, calls: 1 });
  assert.equal(result.exAfter.role, 'group');
  assert.equal(result.exAfter.label, '互斥组');
  assert.deepEqual(result.exAfter.pressed, ['false', 'true', 'false']);
  assert.equal(result.exAfter.value, 'b');
  assert.equal(result.exDisabled.calls, 1);
  assert.deepEqual(result.multiAfter.value, ['x', 'y']);
  assert.equal(result.multiAfter.calls, 1);
  assert.deepEqual(result.multiUpdate.value, ['z']);
  assert.equal(result.multiUpdate.calls, 1);
  assert.deepEqual(result.multiToggle.value, ['z', 'x']);
  for (const name of ['__toggleInstances']) {
    await page.evaluate((key) => { window[key].forEach((instance) => instance.destroy()); }, name);
  }
  assert.equal(await page.evaluate(() => document.querySelector('#sandbox').children.length), 0);
});

const demoExpected = {
  L01: '.nui-container',
  L02: '.nui-vstack',
  L03: '.nui-hstack',
  L04: '.nui-grid',
  L05: '.nui-panel',
  L06: '.nui-divider',
  L07: '.nui-scroll-area',
  L08: '.nui-split',
  A01: '.nui-button-group',
  A02: '.nui-copy-button',
  A03: '.nui-toggle'
};
for (const id of Object.keys(demoExpected)) {
  await step('Demo ' + id + ' mounts, has real component and cleans up', async () => {
    await page.evaluate(() => {
      const host = document.querySelector('#demo-host');
      host.replaceChildren();
    });
    const mounted = await page.evaluate(({ demoId, selector }) => {
      const host = document.querySelector('#demo-host');
      window.__demoInstance = window.NoteGalleryDemos[demoId](host);
      return {
        root: host.children.length,
        hasComponent: !!host.querySelector(selector)
      };
    }, { demoId: id, selector: demoExpected[id] });
    await page.waitForTimeout(120);
    const checked = await page.evaluate((selector) => ({
      hasComponent: !!document.querySelector('#demo-host ' + selector),
      componentCount: document.querySelectorAll('#demo-host ' + selector).length,
      pageOverflow: document.body.style.overflow,
      bodyChildren: document.body.children.length
    }), demoExpected[id]);
    assert.equal(mounted.root > 0, true);
    assert.equal(checked.hasComponent, true);
    assert.equal(checked.pageOverflow, '');
    if (id === 'L07') {
      const hintVisible = await page.evaluate(() => !!document.querySelector('#demo-host .nui-scroll-area__hint:not([hidden])'));
      assert.equal(hintVisible, true);
    }
    if (id === 'A03') {
      const pressed = await page.evaluate(() => document.querySelectorAll('#demo-host .nui-toggle__button[aria-pressed="true"]').length);
      assert.ok(pressed >= 2);
    }
    if (id === 'A01') {
      const icon = await page.evaluate(() => !!document.querySelector('#demo-host .nui-button--icon-only svg'));
      assert.equal(icon, true);
    }
    await page.evaluate(() => {
      if (window.__demoInstance && typeof window.__demoInstance.destroy === 'function') window.__demoInstance.destroy();
      window.__demoInstance = null;
    });
    await page.waitForTimeout(30);
    const cleanup = await page.evaluate(() => ({
      hostChildren: document.querySelector('#demo-host').children.length,
      bodyExtra: document.querySelectorAll('body > .nui-floating, body > .hnv-floating').length
    }));
    assert.equal(cleanup.hostChildren, 0);
    assert.equal(cleanup.bodyExtra, 0);
  });
}

await step('browser console and page errors remain empty', async () => {
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
});

await browser.close();

const failed = results.filter((entry) => !entry.ok);
console.log('\nSUMMARY ' + (results.length - failed.length) + '/' + results.length + ' checks passed');
if (failed.length) {
  for (const entry of failed) console.log('FAILED: ' + entry.name);
  process.exit(1);
}
