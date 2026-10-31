/* Self-check for S01–S06 feedback components and gallery demos.
 * Run: node tests/checks/feedback-check.cjs
 * Uses the local playwright-core and the installed Edge; no network.
 */
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('../tools/node_modules/playwright-core');

const ROOT = path.resolve(__dirname, '..', '..');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PATHS = {
  tokens: path.join(ROOT, 'src/core/tokens.css'),
  base: path.join(ROOT, 'src/core/base.css'),
  core: path.join(ROOT, 'src/core/core.js'),
  iconsData: path.join(ROOT, 'src/core/icons-data.js'),
  icons: path.join(ROOT, 'src/core/icons.js'),
  motion: path.join(ROOT, 'src/core/motion.js'),
  floating: path.join(ROOT, 'src/core/floating.js'),
  feedbackJs: path.join(ROOT, 'src/ui/feedback.js'),
  feedbackCss: path.join(ROOT, 'src/ui/feedback.css'),
  demos: path.join(ROOT, 'gallery/demos/ui-feedback.js')
};

function log(name) {
  console.log('PASS ' + name);
}

async function createPage(browser, reducedMotion) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference'
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', function (error) { errors.push('pageerror: ' + error.message); });
  page.on('console', function (message) {
    if (message.type() === 'error') errors.push('console: ' + message.text());
  });
  await page.setContent(
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>feedback self-check</title></head>' +
    '<body><main id="sandbox"></main><div id="local-host"></div><div id="component-hosts"></div>' +
    '<div id="demo-mount"></div></body></html>'
  );
  await page.addStyleTag({ path: PATHS.tokens });
  await page.addStyleTag({ path: PATHS.base });
  await page.addStyleTag({ path: PATHS.feedbackCss });
  await page.addScriptTag({ path: PATHS.core });
  await page.addScriptTag({ path: PATHS.iconsData });
  await page.addScriptTag({ path: PATHS.icons });
  await page.addScriptTag({ path: PATHS.motion });
  await page.addScriptTag({ path: PATHS.floating });
  await page.addScriptTag({ path: PATHS.feedbackJs });
  await page.addScriptTag({ path: PATHS.demos });
  return { context, page, errors };
}

async function countToasts(page) {
  return page.evaluate(function () { return document.querySelectorAll('.nui-toast').length; });
}

async function clearToasts(page) {
  await page.evaluate(function () {
    if (window.NoteUI && window.NoteUI.Toast) {
      window.NoteUI.Toast.configure({ max: 4 });
      window.NoteUI.Toast.clear();
    }
  });
}

async function testToastBasics(page) {
  const data = await page.evaluate(function () {
    const U = window.NoteUI;
    const result = {};
    U.Toast.configure({ max: 4 });
    const handles = [];
    for (let index = 1; index <= 6; index += 1) {
      handles.push(U.Toast.show({
        message: 'message-' + index,
        tone: 'info',
        duration: 60000,
        dismissible: true
      }));
    }
    const region = document.querySelector('.nui-toast-region--global');
    const entries = Array.prototype.slice.call(region.querySelectorAll('.nui-toast'));
    result.count = entries.length;
    result.messages = entries.map(function (entry) {
      return entry.querySelector('.nui-toast__message').textContent;
    });
    result.regionPointer = getComputedStyle(region).pointerEvents;
    result.entryPointer = getComputedStyle(entries[0]).pointerEvents;
    result.position = getComputedStyle(region).position;
    result.zIndex = getComputedStyle(region).zIndex;
    result.firstHandleConnected = handles[0].el.isConnected;
    result.lastHandleConnected = handles[5].el.isConnected;
    result.toneLabels = entries.map(function (entry) {
      return entry.querySelector('.nui-toast__tone').textContent;
    });
    U.Toast.clear();
    result.afterClear = Boolean(document.querySelector('.nui-toast-region'));
    result.bodyRegionCount = document.querySelectorAll('body > .nui-toast-region').length;
    return result;
  });
  assert.equal(data.count, 4, 'Toast global queue keeps max 4 entries');
  assert.deepEqual(data.messages, ['message-3', 'message-4', 'message-5', 'message-6'], 'Toast keeps newest entries');
  assert.equal(data.regionPointer, 'none', 'global Toast region does not receive pointer events');
  assert.equal(data.entryPointer, 'auto', 'Toast entries receive pointer events');
  assert.equal(data.position, 'fixed', 'global Toast region is fixed');
  assert.ok(Number(data.zIndex) >= 1000, 'global Toast uses a high z-index token');
  assert.equal(data.firstHandleConnected, false, 'evicted Toast handle is disconnected');
  assert.equal(data.lastHandleConnected, true, 'latest Toast handle is connected');
  assert.deepEqual(data.toneLabels, ['信息', '信息', '信息', '信息'], 'visible tone labels exist');
  assert.equal(data.afterClear, false, 'Toast.clear removes the global region');
  assert.equal(data.bodyRegionCount, 0, 'Toast.clear leaves no body region');
  log('Toast queue limit, pointer policy, z-index and clear');

  const aria = await page.evaluate(function () {
    const U = window.NoteUI;
    U.Toast.clear();
    const errorToast = U.Toast.show({ message: '错误示例', tone: 'error', dismissible: true });
    const successToast = U.Toast.show({ message: '成功示例', tone: 'success', duration: 0 });
    const errorClose = errorToast.el.querySelector('.nui-toast__close');
    return {
      errorRole: errorToast.el.getAttribute('role'),
      errorLive: errorToast.el.getAttribute('aria-live'),
      errorAtomic: errorToast.el.getAttribute('aria-atomic'),
      errorTone: errorToast.el.querySelector('.nui-toast__tone').textContent,
      closeLabel: errorClose && errorClose.getAttribute('aria-label'),
      closeTag: errorClose && errorClose.tagName,
      successRole: successToast.el.getAttribute('role'),
      successLive: successToast.el.getAttribute('aria-live'),
      regionLabel: document.querySelector('.nui-toast-region--global').getAttribute('aria-label')
    };
  });
  assert.equal(aria.errorRole, 'alert', 'error Toast uses role=alert');
  assert.equal(aria.errorLive, 'assertive', 'error Toast uses assertive aria-live');
  assert.equal(aria.errorAtomic, 'true', 'Toast content is atomic');
  assert.equal(aria.errorTone, '失败', 'error Toast has a visible tone label');
  assert.equal(aria.closeTag, 'BUTTON', 'Toast close control is a native button');
  assert.ok(aria.closeLabel && aria.closeLabel.indexOf('关闭') === 0, 'Toast close button has a label');
  assert.equal(aria.successRole, 'status', 'normal Toast uses role=status');
  assert.equal(aria.successLive, 'polite', 'normal Toast uses polite aria-live');
  assert.equal(aria.regionLabel, '通知', 'global Toast region has an accessible name');

  await page.waitForTimeout(300);
  assert.equal(await countToasts(page), 2, 'error Toast persists without a duration before clear');
  await clearToasts(page);
  log('Toast roles, aria-live, labels and persistent error default');

  const queue = await page.evaluate(function () {
    const U = window.NoteUI;
    U.Toast.configure({ max: 2 });
    U.Toast.show({ message: 'q1', duration: 0 });
    U.Toast.show({ message: 'q2', duration: 0 });
    U.Toast.show({ message: 'q3', duration: 0 });
    const messages = Array.prototype.map.call(document.querySelectorAll('.nui-toast__message'), function (node) {
      return node.textContent;
    });
    U.Toast.configure({ max: 4 });
    U.Toast.clear();
    return messages;
  });
  assert.deepEqual(queue, ['q2', 'q3'], 'Toast.configure(max) limits the queue');
  log('Toast configurable queue max');

  const reasons = await page.evaluate(function () {
    const U = window.NoteUI;
    const result = [];
    U.Toast.clear();
    U.Toast.show({
      message: 'api-close',
      duration: 0,
      onClose: function (reason) { result.push(reason); }
    }).close();
    U.Toast.show({
      message: 'clear-close',
      duration: 0,
      onClose: function (reason) { result.push(reason); }
    });
    U.Toast.clear();
    U.Toast.configure({ max: 2 });
    U.Toast.show({
      message: 'old-overflow',
      duration: 0,
      onClose: function (reason) { result.push(reason); }
    });
    U.Toast.show({ message: 'overflow-keep-1', duration: 0 });
    U.Toast.show({ message: 'overflow-keep-2', duration: 0 });
    U.Toast.configure({ max: 4 });
    U.Toast.clear();
    return result;
  });
  assert.deepEqual(reasons, ['api', 'clear', 'overflow'], 'onClose receives api/clear/overflow reasons');
  log('Toast close reasons and overflow callback');

  await clearToasts(page);
  await page.evaluate(function () {
    window.__dismissReasons = [];
    window.NoteUI.Toast.show({
      message: 'keyboard-close',
      tone: 'info',
      duration: 0,
      onClose: function (reason) { window.__dismissReasons.push(reason); }
    });
  });
  const closeButton = page.locator('.nui-toast__close');
  await closeButton.focus();
  await closeButton.press('Enter');
  const dismissReasons = await page.evaluate(function () { return window.__dismissReasons; });
  assert.deepEqual(dismissReasons, ['dismiss'], 'Enter on close button dismisses Toast with reason dismiss');
  log('Toast keyboard close');

  await page.evaluate(function () {
    window.__actionReasons = [];
    window.__actionClicked = 0;
    window.NoteUI.Toast.show({
      message: 'action-toast',
      duration: 0,
      action: {
        label: '演示操作',
        onClick: function () { window.__actionClicked += 1; }
      },
      onClose: function (reason) { window.__actionReasons.push(reason); }
    });
  });
  await page.locator('.nui-toast__action').click();
  const actionResult = await page.evaluate(function () {
    return { clicked: window.__actionClicked, reasons: window.__actionReasons };
  });
  assert.equal(actionResult.clicked, 1, 'Toast action callback runs');
  assert.deepEqual(actionResult.reasons, ['action'], 'Toast action closes with reason action');
  log('Toast action');

  await clearToasts(page);
  await page.mouse.move(0, 0);
  await page.evaluate(function () {
    window.NoteUI.Toast.show({ message: 'auto-close', duration: 200, tone: 'info' });
  });
  await page.waitForTimeout(500);
  assert.equal(await countToasts(page), 0, 'Toast auto-closes after duration');
  log('Toast auto close');

  await clearToasts(page);
  await page.evaluate(function () {
    window.NoteUI.Toast.show({ message: 'hover-pause', duration: 500, tone: 'info' });
  });
  const hoverToast = page.locator('.nui-toast').filter({ hasText: 'hover-pause' });
  await hoverToast.hover();
  await page.waitForTimeout(800);
  assert.equal(await countToasts(page), 1, 'Toast remains while hovered past duration');
  await page.mouse.move(0, 0);
  await page.waitForTimeout(800);
  assert.equal(await countToasts(page), 0, 'Toast closes after hover leaves');
  log('Toast hover pause');

  await clearToasts(page);
  await page.evaluate(function () {
    window.NoteUI.Toast.show({ message: 'focus-pause', duration: 500, tone: 'info', dismissible: true });
  });
  await page.locator('.nui-toast__close').focus();
  await page.waitForTimeout(800);
  assert.equal(await countToasts(page), 1, 'Toast remains while focus is inside past duration');
  await page.evaluate(function () { if (document.activeElement) document.activeElement.blur(); });
  await page.waitForTimeout(800);
  assert.equal(await countToasts(page), 0, 'Toast closes after focus leaves');
  log('Toast focus pause');

  await clearToasts(page);
  const local = await page.evaluate(function () {
    const host = document.getElementById('local-host');
    const U = window.NoteUI;
    const localRegion = U.Toast.mount(host, {
      max: 2,
      label: '局部区域',
      message: '局部初始',
      tone: 'warning',
      duration: 0
    });
    const initial = host.querySelectorAll('.nui-toast').length;
    localRegion.show({ message: '局部二', duration: 0 });
    localRegion.show({ message: '局部三', duration: 0 });
    const beforeTrim = Array.prototype.map.call(host.querySelectorAll('.nui-toast__message'), function (node) {
      return node.textContent;
    });
    const regionEl = host.querySelector('.nui-toast-region--local');
    const result = {
      initial: initial,
      beforeTrim: beforeTrim,
      position: getComputedStyle(regionEl).position,
      label: regionEl.getAttribute('aria-label')
    };
    localRegion.update({ max: 1 });
    result.afterTrim = Array.prototype.map.call(host.querySelectorAll('.nui-toast__message'), function (node) {
      return node.textContent;
    });
    result.childrenBeforeDestroy = host.childNodes.length;
    localRegion.destroy();
    result.childrenAfterDestroy = host.childNodes.length;
    return result;
  });
  assert.equal(local.initial, 1, 'local Toast.mount can show an initial toast');
  assert.deepEqual(local.beforeTrim, ['局部二', '局部三'], 'local Toast queue max is enforced');
  assert.equal(local.position, 'static', 'local Toast region is not fixed');
  assert.equal(local.label, '局部区域', 'local Toast region has its label');
  assert.deepEqual(local.afterTrim, ['局部三'], 'local Toast update(max) trims the queue');
  assert.ok(local.childrenBeforeDestroy > 0, 'local Toast region exists before destroy');
  assert.equal(local.childrenAfterDestroy, 0, 'local Toast destroy removes all host children');
  assert.equal(await countToasts(page), 0, 'local destroy leaves no Toast entries');
  assert.equal(await page.evaluate(function () {
    return Boolean(document.querySelector('.nui-toast-region--global'));
  }), false, 'no global region remains after Toast tests');
  log('Toast local mount, update, destroy and body cleanup');
}

async function testComponents(page) {
  const data = await page.evaluate(function () {
    const U = window.NoteUI;
    const fonts = [];
    function must(condition, message) {
      if (!condition) throw new Error(message);
    }
    function makeHost() {
      const host = document.createElement('div');
      document.getElementById('component-hosts').appendChild(host);
      return host;
    }

    const progressHost = makeHost();
    const progress = U.Progress.mount(progressHost, {
      label: '同步数据',
      value: 25,
      max: 200
    });
    must(progress.el.getAttribute('role') === 'progressbar', 'progress role');
    must(progress.el.getAttribute('aria-valuemin') === '0', 'progress min');
    must(progress.el.getAttribute('aria-valuemax') === '200', 'progress max');
    must(progress.el.getAttribute('aria-valuenow') === '25', 'progress now');
    must(progress.el.querySelector('.nui-progress__label').textContent === '同步数据', 'progress label');
    must(progress.el.querySelector('.nui-progress__value').textContent === '12.5%', 'progress exact display');
    must(progress.getValue() === 25, 'progress getValue');

    progress.update({ value: 50, valueText: '50 / 200 项' });
    must(progress.el.getAttribute('aria-valuenow') === '50', 'progress update now');
    must(progress.el.querySelector('.nui-progress__value').textContent === '50 / 200 项', 'progress custom value text');
    must(progress.el.getAttribute('aria-valuetext') === '50 / 200 项', 'progress custom aria-valuetext');

    progress.update({ value: null });
    must(!progress.el.hasAttribute('aria-valuenow'), 'indeterminate no aria-valuenow');
    must(!progress.el.hasAttribute('aria-valuemin'), 'indeterminate no aria-valuemin');
    must(!progress.el.hasAttribute('aria-valuemax'), 'indeterminate no aria-valuemax');
    must(progress.el.getAttribute('aria-busy') === 'true', 'indeterminate marks busy');
    must(progress.el.querySelector('.nui-progress__fill').hidden, 'indeterminate hides fill');
    must(!progress.el.querySelector('.nui-progress__indeterminate').hidden, 'indeterminate shows static/animated marker');
    must(progress.el.textContent.indexOf('进度未知') >= 0, 'indeterminate visible unknown text');
    must(progress.el.textContent.indexOf('%') < 0, 'indeterminate shows no fake percentage');
    must(progress.getValue() === null, 'indeterminate getValue null');

    progress.update({ value: 250, max: 100 });
    must(progress.el.getAttribute('aria-valuenow') === '100', 'determinate clamps to max');
    must(progress.el.getAttribute('aria-valuemax') === '100', 'progress max updates');
    must(progress.el.getAttribute('aria-valuetext') === null, 'stale custom value text cleared');
    must(progress.getValue() === 100, 'clamped getValue');
    progress.update({ value: NaN });
    must(!progress.el.hasAttribute('aria-valuenow'), 'NaN becomes indeterminate');
    progress.destroy();
    must(progressHost.childNodes.length === 0, 'progress destroy cleans root');
    progressHost.remove();

    const narrowHost = makeHost();
    narrowHost.style.width = '160px';
    const narrowProgress = U.Progress.mount(narrowHost, {
      label: '一个较长的中文进度标签，用于检查窄容器下的换行和可读性',
      value: 42,
      max: 100
    });
    must(narrowProgress.el.getBoundingClientRect().width <= 161, 'progress fits narrow host');
    must(narrowProgress.el.scrollWidth <= narrowProgress.el.clientWidth + 1, 'progress no horizontal overflow');
    narrowProgress.destroy();
    narrowHost.remove();

    const spinnerHost = makeHost();
    const spinner = U.Spinner.mount(spinnerHost, { label: '正在加载示例' });
    const spinnerRing = spinner.el.querySelector('.nui-spinner__ring');
    must(spinner.el.getAttribute('role') === 'status', 'spinner role');
    must(spinner.el.getAttribute('aria-live') === 'polite', 'spinner polite');
    must(spinner.el.querySelector('.nui-spinner__label').textContent === '正在加载示例', 'spinner label');
    must(spinnerRing.getAttribute('aria-hidden') === 'true', 'spinner ring hidden from AT');
    must(getComputedStyle(spinnerRing).animationName !== 'none', 'spinner ring animates normally');
    spinner.update({ label: '读取数据', size: 'lg' });
    must(spinner.el.querySelector('.nui-spinner__label').textContent === '读取数据', 'spinner label update');
    must(spinner.el.getAttribute('data-size') === 'lg', 'spinner keyword size');
    spinner.update({ size: 40 });
    must(spinnerRing.style.width === '40px' && spinnerRing.style.height === '40px', 'spinner numeric size');
    spinner.destroy();
    must(spinnerHost.childNodes.length === 0, 'spinner destroy cleans root');
    spinnerHost.remove();

    const skeletonHost = makeHost();
    const skeleton = U.Skeleton.mount(skeletonHost, {
      variant: 'text',
      lines: 2,
      label: '正文加载中',
      width: 320
    });
    must(skeleton.el.getAttribute('role') === 'status', 'skeleton status');
    must(skeleton.el.getAttribute('aria-busy') === 'true', 'skeleton busy');
    must(skeleton.el.querySelector('.nui-skeleton__visual').getAttribute('aria-hidden') === 'true', 'skeleton visual hidden');
    must(skeleton.el.querySelector('.nui-skeleton__sr').textContent === '正文加载中', 'skeleton accessible name');
    must(skeleton.el.querySelectorAll('.nui-skeleton__line').length === 2, 'skeleton text lines');
    must(skeleton.el.style.width === '320px', 'skeleton width');
    must(getComputedStyle(skeleton.el.querySelector('.nui-skeleton__line')).animationName === 'none', 'skeleton is not animated');
    skeleton.update({ lines: 4 });
    must(skeleton.el.querySelectorAll('.nui-skeleton__line').length === 4, 'skeleton line update');
    skeleton.update({ variant: 'card', lines: 2, height: 120 });
    must(skeleton.el.dataset.variant === 'card', 'skeleton card variant');
    must(skeleton.el.querySelector('.nui-skeleton__media').style.height === '120px', 'skeleton media height');
    must(skeleton.el.querySelectorAll('.nui-skeleton__line').length === 2, 'skeleton card lines');
    skeleton.update({ variant: 'table', rows: 2, columns: 3, height: 18 });
    const tableRows = skeleton.el.querySelectorAll('.nui-skeleton__tr');
    must(tableRows.length === 3, 'skeleton table header + 2 rows');
    must(tableRows[1].children.length === 3, 'skeleton table columns');
    must(tableRows[1].children[0].style.height === '18px', 'skeleton cell height');
    skeleton.update({ width: null, height: null });
    must(skeleton.el.style.width === '', 'skeleton width can be cleared');
    skeleton.destroy();
    must(skeletonHost.childNodes.length === 0, 'skeleton destroy cleans root');
    skeletonHost.remove();

    const emptyHost = makeHost();
    const emptyAction = document.createElement('button');
    emptyAction.type = 'button';
    emptyAction.textContent = '清除筛选';
    const empty = U.Empty.mount(emptyHost, { kind: 'no-results', action: emptyAction });
    must(empty.el.dataset.kind === 'no-results', 'empty kind');
    must(empty.el.getAttribute('role') === 'group', 'empty group');
    must(empty.el.querySelector('.nui-empty__title').textContent === '没有找到匹配结果', 'empty title default');
    must(empty.el.querySelector('.nui-empty__description').textContent.indexOf('筛选') >= 0, 'empty description default');
    must(empty.el.querySelector('.nui-empty__marker').textContent === '?', 'empty marker by kind');
    must(empty.el.querySelector('.nui-empty__actions').contains(emptyAction), 'empty host action moved in');
    must(empty.el.getAttribute('aria-labelledby') === empty.el.querySelector('.nui-empty__title').id, 'empty labelled by title');
    empty.update({ kind: 'empty' });
    must(empty.el.querySelector('.nui-empty__title').textContent === '暂无内容', 'empty default follows kind');
    must(empty.el.querySelector('.nui-empty__actions').contains(emptyAction), 'empty action survives non-action update');
    empty.update({ kind: 'unconfigured', title: '自定义标题' });
    must(empty.el.querySelector('.nui-empty__title').textContent === '自定义标题', 'empty custom title');
    must(empty.el.querySelector('.nui-empty__description').textContent.indexOf('还没有设置内容') >= 0, 'empty description follows kind when not custom');
    empty.update({ title: '' });
    must(empty.el.querySelector('.nui-empty__title').hidden, 'empty title can be hidden');
    must(empty.el.getAttribute('aria-label') === '尚未配置', 'empty fallback accessible label');
    empty.destroy();
    must(emptyHost.childNodes.length === 0, 'empty destroy removes host children');
    must(!emptyAction.isConnected, 'empty host action is detached after destroy');
    emptyHost.remove();

    const resultHost = makeHost();
    const domAction = document.createElement('button');
    domAction.type = 'button';
    domAction.textContent = '宿主 DOM 操作';
    let resultClicked = 0;
    const resultInstance = U.Result.mount(resultHost, {
      status: 'error',
      details: '这是一段默认可见的补充说明。',
      actions: [
        {
          label: '重试',
          variant: 'primary',
          onClick: function () { resultClicked += 1; }
        },
        domAction
      ]
    });
    must(resultInstance.el.dataset.status === 'error', 'result status');
    must(resultInstance.el.querySelector('.nui-result__title').textContent === '操作未完成', 'result default title');
    must(resultInstance.el.querySelector('.nui-result__status').textContent === '失败', 'result visible status');
    must(resultInstance.el.querySelector('.nui-result__description').textContent.indexOf('没有完成') >= 0, 'result default reason');
    must(!resultInstance.el.querySelector('.nui-result__details').hidden, 'result details visible');
    must(resultInstance.el.querySelector('.nui-result__details').textContent.indexOf('可见') >= 0, 'result details text');
    must(resultInstance.el.querySelectorAll('.nui-result__actions button').length === 2, 'result actions count');
    must(resultInstance.el.querySelector('.nui-result__actions').contains(domAction), 'result DOM action moved in');
    const ownAction = resultInstance.el.querySelector('.nui-result__button');
    must(!ownAction.classList.contains('nui-button'), 'result does not use legacy Button classes');
    ownAction.click();
    must(resultClicked === 1, 'result configured action callback');
    resultInstance.update({ status: 'restricted' });
    must(resultInstance.el.querySelector('.nui-result__title').textContent === '当前受限', 'result default follows status');
    must(resultInstance.el.querySelector('.nui-result__actions').contains(domAction), 'result actions survive status-only update');
    resultInstance.update({
      status: 'info',
      details: null,
      actions: [{ label: '知道了', variant: 'quiet' }]
    });
    must(resultInstance.el.querySelector('.nui-result__details').hidden, 'result details can be hidden');
    must(resultInstance.el.querySelectorAll('.nui-result__actions button').length === 1, 'result actions can be replaced with array');
    must(!domAction.isConnected, 'old result DOM action removed on replacement');
    resultInstance.update({ title: '' });
    must(resultInstance.el.querySelector('.nui-result__title').hidden, 'result title can be hidden');
    must(resultInstance.el.getAttribute('aria-label') === '信息', 'result fallback accessible label');
    resultInstance.destroy();
    must(resultHost.childNodes.length === 0, 'result destroy removes host children');
    resultHost.remove();

    const singleActionHost = makeHost();
    const singleActionNode = document.createElement('button');
    singleActionNode.type = 'button';
    singleActionNode.textContent = '单独 DOM 操作';
    const singleActionResult = U.Result.mount(singleActionHost, {
      status: 'success',
      title: '单操作结果',
      actions: singleActionNode
    });
    must(singleActionResult.el.querySelector('.nui-result__actions').contains(singleActionNode),
      'result accepts one DOM node as actions');
    singleActionResult.destroy();
    singleActionHost.remove();

    const hosts = document.getElementById('component-hosts');
    const summary = {
      remainingHosts: hosts.childNodes.length,
      bodyToastRegions: document.querySelectorAll('.nui-toast-region').length
    };
    return summary;
  });
  assert.equal(data.remainingHosts, 0, 'component test hosts cleaned up');
  assert.equal(data.bodyToastRegions, 0, 'component tests leave no Toast regions');
  log('Progress, Spinner, Skeleton, Empty and Result behaviour');
}

async function testReducedMotion(browser) {
  const session = await createPage(browser, true);
  const page = session.page;
  const data = await page.evaluate(function () {
    const U = window.NoteUI;
    function makeHost() {
      const host = document.createElement('div');
      document.getElementById('component-hosts').appendChild(host);
      return host;
    }
    const spinnerHost = makeHost();
    const spinner = U.Spinner.mount(spinnerHost, { label: '减少动效加载' });
    const progressHost = makeHost();
    const progress = U.Progress.mount(progressHost, { label: '未知进度', value: null });
    const skeletonHost = makeHost();
    const skeleton = U.Skeleton.mount(skeletonHost, { variant: 'text', lines: 2, label: '减少动效骨架' });
    const ring = spinner.el.querySelector('.nui-spinner__ring');
    const unknown = progress.el.querySelector('.nui-progress__indeterminate');
    const line = skeleton.el.querySelector('.nui-skeleton__line');
    const result = {
      spinnerAnimation: getComputedStyle(ring).animationName,
      spinnerLabel: spinner.el.querySelector('.nui-spinner__label').textContent,
      progressAnimation: getComputedStyle(unknown).animationName,
      progressHasNow: progress.el.hasAttribute('aria-valuenow'),
      progressText: progress.el.querySelector('.nui-progress__value').textContent,
      skeletonAnimation: getComputedStyle(line).animationName,
      skeletonLabel: skeleton.el.querySelector('.nui-skeleton__sr').textContent
    };
    spinner.destroy();
    progress.destroy();
    skeleton.destroy();
    spinnerHost.remove();
    progressHost.remove();
    skeletonHost.remove();
    return result;
  });
  assert.equal(data.spinnerAnimation, 'none', 'reduced motion stops Spinner rotation');
  assert.equal(data.spinnerLabel, '减少动效加载', 'reduced motion Spinner keeps visible label');
  assert.equal(data.progressAnimation, 'none', 'reduced motion stops indeterminate stripes');
  assert.equal(data.progressHasNow, false, 'reduced motion indeterminate still has no fake value');
  assert.ok(data.progressText.indexOf('进度未知') >= 0, 'reduced motion indeterminate keeps readable text');
  assert.equal(data.skeletonAnimation, 'none', 'reduced motion Skeleton is static');
  assert.equal(data.skeletonLabel, '减少动效骨架', 'reduced motion Skeleton keeps accessible name');
  assert.deepEqual(session.errors, [], 'reduced-motion page has no console errors');
  await session.context.close();
  log('Reduced-motion static Spinner / Progress / Skeleton');
}

async function mountDemo(page, id) {
  await page.evaluate(function (demoId) {
    const host = document.createElement('div');
    host.className = 'demo-instance';
    host.dataset.demo = demoId;
    document.getElementById('demo-mount').appendChild(host);
    const api = window.NoteGalleryDemos[demoId](host);
    window.__feedbackDemos = window.__feedbackDemos || {};
    window.__feedbackDemos[demoId] = { host: host, api: api };
  }, id);
}

async function destroyDemo(page, id) {
  return page.evaluate(function (demoId) {
    const entry = window.__feedbackDemos && window.__feedbackDemos[demoId];
    if (!entry) return { existed: false };
    if (entry.api && typeof entry.api.destroy === 'function') entry.api.destroy();
    const result = {
      existed: true,
      hostChildren: entry.host.childNodes.length,
      toastRegions: document.querySelectorAll('.nui-toast-region').length
    };
    entry.host.remove();
    result.hostConnected = entry.host.isConnected;
    delete window.__feedbackDemos[demoId];
    return result;
  }, id);
}

async function testDemos(page) {
  await clearToasts(page);
  await mountDemo(page, 'S01');
  assert.equal(await countToasts(page), 0, 'S01 demo starts with no automatic Toast');
  const s01 = page.locator('[data-demo="S01"]');
  await s01.getByRole('button', { name: '连续触发 5 条' }).click();
  assert.equal(await countToasts(page), 4, 'S01 demo shows bounded queue of 4');
  await s01.getByRole('button', { name: '清除全局通知' }).click();
  assert.equal(await countToasts(page), 0, 'S01 demo clear removes all notifications');
  await s01.getByRole('button', { name: '成功', exact: true }).click();
  assert.equal(await countToasts(page), 1, 'S01 demo triggers a tone toast');
  const s01Destroy = await destroyDemo(page, 'S01');
  assert.equal(s01Destroy.hostChildren, 0, 'S01 demo destroy clears its subtree');
  assert.equal(s01Destroy.hostConnected, false, 'S01 demo host removed by test harness');
  assert.equal(s01Destroy.toastRegions, 0, 'S01 demo destroy clears body Toast nodes');
  assert.equal(await countToasts(page), 0, 'S01 cleanup leaves no Toast entry');
  log('Gallery S01');

  await mountDemo(page, 'S02');
  const s02 = page.locator('[data-demo="S02"]');
  assert.equal(await s02.locator('.nui-progress').count(), 1, 'S02 demo starts with one determinate Progress');
  assert.equal(await s02.locator('[data-indeterminate="true"]').count(), 0, 'S02 demo starts static');
  await s02.getByRole('button', { name: '显示不确定进度' }).click();
  assert.equal(await s02.locator('.nui-progress').count(), 2, 'S02 demo mounts indeterminate Progress on demand');
  assert.equal(await s02.locator('.nui-progress[aria-valuenow]').count(), 1, 'S02 only determinate one has aria-valuenow');
  await s02.getByRole('button', { name: '更新到 68%' }).click();
  assert.equal(await s02.locator('.nui-progress[aria-valuenow="68"]').count(), 1, 'S02 demo updates Progress value');
  await s02.getByRole('button', { name: '隐藏不确定进度' }).click();
  assert.equal(await s02.locator('.nui-progress').count(), 1, 'S02 demo destroys indeterminate Progress');
  const s02Destroy = await destroyDemo(page, 'S02');
  assert.equal(s02Destroy.hostChildren, 0, 'S02 demo destroy clears its subtree');
  assert.equal(s02Destroy.hostConnected, false, 'S02 demo host removed by test harness');
  log('Gallery S02');

  await mountDemo(page, 'S03');
  const s03 = page.locator('[data-demo="S03"]');
  assert.equal(await s03.locator('.nui-spinner').count(), 0, 'S03 demo starts without spinning');
  await s03.getByRole('button', { name: '开始加载' }).click();
  assert.equal(await s03.locator('.nui-spinner').count(), 1, 'S03 demo mounts a real Spinner on click');
  await page.waitForTimeout(2100);
  assert.equal(await s03.locator('.nui-spinner').count(), 0, 'S03 demo auto-replaces Spinner after timer');
  assert.ok((await s03.locator('.nui-feedback-demo__stage').textContent()).indexOf('已就绪') >= 0, 'S03 replacement content appears');
  await s03.getByRole('button', { name: '开始加载' }).click();
  assert.equal(await s03.locator('.nui-spinner').count(), 1, 'S03 can start loading again');
  const s03Destroy = await destroyDemo(page, 'S03');
  assert.equal(s03Destroy.hostChildren, 0, 'S03 demo destroy clears its subtree immediately');
  assert.equal(s03Destroy.hostConnected, false, 'S03 demo host removed by test harness');
  await page.waitForTimeout(2100);
  assert.equal(await s03.locator('.nui-spinner').count(), 0, 'S03 timer does not resurrect Spinner after destroy');
  assert.equal(await countToasts(page), 0, 'S03 leaves no Toast residue');
  log('Gallery S03 with timer cleanup');

  await mountDemo(page, 'S04');
  const s04 = page.locator('[data-demo="S04"]');
  assert.equal(await s04.locator('.nui-skeleton').count(), 1, 'S04 demo starts with a real Skeleton');
  assert.equal(await s04.locator('.nui-skeleton').getAttribute('data-variant'), 'text', 'S04 starts text skeleton');
  await s04.getByRole('button', { name: '表格骨架' }).click();
  assert.equal(await s04.locator('.nui-skeleton').getAttribute('data-variant'), 'table', 'S04 updates to table skeleton');
  assert.equal(await s04.locator('.nui-skeleton__tr').count(), 5, 'S04 table skeleton has header + 4 rows');
  await s04.getByRole('button', { name: '结束加载并替换' }).click();
  assert.equal(await s04.locator('.nui-skeleton').count(), 0, 'S04 destroys Skeleton on completion');
  assert.ok((await s04.locator('.nui-feedback-demo__stage').textContent()).indexOf('加载结束') >= 0, 'S04 replaces skeleton with content');
  await s04.getByRole('button', { name: '文本骨架' }).click();
  assert.equal(await s04.locator('.nui-skeleton').count(), 1, 'S04 can remount skeleton');
  const s04Destroy = await destroyDemo(page, 'S04');
  assert.equal(s04Destroy.hostChildren, 0, 'S04 demo destroy clears its subtree');
  assert.equal(s04Destroy.hostConnected, false, 'S04 demo host removed by test harness');
  log('Gallery S04');

  await mountDemo(page, 'S05');
  const s05 = page.locator('[data-demo="S05"]');
  assert.equal(await s05.locator('.nui-empty').getAttribute('data-kind'), 'empty', 'S05 starts with empty kind');
  await s05.getByRole('button', { name: '无结果' }).click();
  assert.equal(await s05.locator('.nui-empty').getAttribute('data-kind'), 'no-results', 'S05 updates kind');
  assert.ok((await s05.locator('.nui-empty__title').textContent()).indexOf('没有找到匹配结果') >= 0, 'S05 updates default title');
  assert.equal(await s05.locator('.nui-empty__actions button').count(), 1, 'S05 has host-provided action');
  await s05.locator('.nui-empty__actions button').click();
  assert.ok((await s05.locator('.nui-feedback-demo__output').textContent()).indexOf('已触发') >= 0, 'S05 host action works');
  const s05Destroy = await destroyDemo(page, 'S05');
  assert.equal(s05Destroy.hostChildren, 0, 'S05 demo destroy clears its subtree');
  assert.equal(s05Destroy.hostConnected, false, 'S05 demo host removed by test harness');
  log('Gallery S05');

  await mountDemo(page, 'S06');
  const s06 = page.locator('[data-demo="S06"]');
  assert.equal(await s06.locator('.nui-result').getAttribute('data-status'), 'info', 'S06 starts with host-provided info result');
  await s06.getByRole('button', { name: '成功', exact: true }).click();
  assert.equal(await s06.locator('.nui-result').getAttribute('data-status'), 'success', 'S06 displays success only when host selects it');
  assert.ok((await s06.locator('.nui-result__title').textContent()).indexOf('示例任务已完成') >= 0, 'S06 host supplies title');
  assert.equal(await s06.locator('.nui-result__actions button').count(), 1, 'S06 can show a DOM action node');
  await s06.locator('.nui-result__actions button').click();
  assert.ok((await s06.locator('.nui-feedback-demo__output').textContent()).indexOf('宿主') >= 0, 'S06 DOM action callback runs');
  await s06.getByRole('button', { name: '失败', exact: true }).click();
  assert.equal(await s06.locator('.nui-result').getAttribute('data-status'), 'error', 'S06 changes status on host control');
  assert.equal(await s06.locator('.nui-result__actions button').count(), 2, 'S06 can show an action array');
  const s06Destroy = await destroyDemo(page, 'S06');
  assert.equal(s06Destroy.hostChildren, 0, 'S06 demo destroy clears its subtree');
  assert.equal(s06Destroy.hostConnected, false, 'S06 demo host removed by test harness');
  assert.equal(s06Destroy.toastRegions, 0, 'S06 leaves no Toast regions');
  log('Gallery S06');

  const residue = await page.evaluate(function () {
    return {
      demoChildren: document.getElementById('demo-mount').childNodes.length,
      toastEntries: document.querySelectorAll('.nui-toast').length,
      toastRegions: document.querySelectorAll('.nui-toast-region').length,
      fbRoots: document.querySelectorAll('.nui-feedback-demo').length
    };
  });
  assert.equal(residue.demoChildren, 0, 'all demos removed from demo mount');
  assert.equal(residue.toastEntries, 0, 'no Toast entries after demos destroyed');
  assert.equal(residue.toastRegions, 0, 'no Toast regions after demos destroyed');
  assert.equal(residue.fbRoots, 0, 'no feedback demo roots remain');
}

(async function main() {
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: EDGE,
      headless: true
    });
    const session = await createPage(browser, false);
    const page = session.page;

    await testToastBasics(page);
    await testComponents(page);
    await testDemos(page);

    assert.deepEqual(session.errors, [], 'main page has no console or page errors');
    log('No console errors in main page');
    await session.context.close();

    await testReducedMotion(browser);

    console.log('ALL FEEDBACK SELF-CHECKS PASSED');
  } catch (error) {
    console.error('SELF-CHECK FAILED');
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
})();
