import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const checkDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(checkDir, '..', '..');
const { chromium } = require(path.join(projectDir, 'tests', 'tools', 'node_modules', 'playwright-core'));
const executablePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const pageUrl = pathToFileURL(path.join(checkDir, 'core-check.html')).href;
const browserErrors = [];
let checks = 0;

function check(condition, label, details) {
  if (!condition) {
    const suffix = details === undefined ? '' : '\n  details: ' + JSON.stringify(details);
    throw new Error('CHECK FAILED: ' + label + suffix);
  }
  checks += 1;
  console.log('ok ' + checks + ' - ' + label);
}

async function activeState(page) {
  return page.evaluate(() => {
    const dialog = window.__tabDialog;
    const popover = window.__tabPopover;
    const active = document.activeElement;
    return {
      id: active && active.id,
      tag: active && active.tagName,
      inDialog: Boolean(dialog && dialog.el && dialog.el.contains(active)),
      inPopover: Boolean(popover && popover.el && popover.el.contains(active)),
      dialogOpen: Boolean(dialog && dialog.isOpen()),
      popoverOpen: Boolean(popover && popover.isOpen()),
      floatingCount: document.querySelectorAll('.hnv-floating').length,
      overflow: document.body.style.overflow
    };
  });
}

async function main() {
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--allow-file-access-from-files']
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    const page = await context.newPage();
    page.on('pageerror', (error) => browserErrors.push('pageerror: ' + error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push('console: ' + message.text());
    });
    await page.goto(pageUrl, { waitUntil: 'load' });

    await page.evaluate(() => {
      const opener = document.createElement('button');
      opener.id = 'tab-dialog-opener';
      opener.textContent = '打开模态对话框';
      opener.style.cssText = 'position:fixed;left:80px;top:80px;width:160px;height:32px';
      document.body.appendChild(opener);
      opener.focus();

      const dialogContent = document.createElement('div');
      dialogContent.style.cssText = 'display:grid;gap:10px;padding:16px';
      const first = document.createElement('button');
      first.id = 'tab-dialog-first';
      first.textContent = 'Dialog 第一项';
      const last = document.createElement('button');
      last.id = 'tab-dialog-last';
      last.textContent = 'Dialog 末项';
      const popoverAnchor = document.createElement('button');
      popoverAnchor.id = 'tab-popover-anchor';
      popoverAnchor.textContent = '打开非模态 Popover';
      dialogContent.appendChild(first);
      dialogContent.appendChild(popoverAnchor);
      dialogContent.appendChild(last);

      const popoverContent = document.createElement('div');
      popoverContent.style.cssText = 'display:grid;gap:8px;padding:14px';
      const popoverFirst = document.createElement('button');
      popoverFirst.id = 'tab-popover-first';
      popoverFirst.textContent = 'Popover 第一项';
      const popoverLast = document.createElement('button');
      popoverLast.id = 'tab-popover-last';
      popoverLast.textContent = 'Popover 末项';
      popoverContent.appendChild(popoverFirst);
      popoverContent.appendChild(popoverLast);

      const reasons = { dialog: [], popover: [] };
      const dialog = window.NoteCore.floating.create({
        anchor: null,
        content: dialogContent,
        modal: true,
        backdrop: true,
        trapFocus: true,
        lockScroll: true,
        role: 'dialog',
        onClose: (reason) => reasons.dialog.push(reason)
      });
      const popover = window.NoteCore.floating.create({
        anchor: popoverAnchor,
        content: popoverContent,
        modal: false,
        backdrop: false,
        trapFocus: false,
        role: 'dialog',
        closeOnEsc: true,
        closeOnOutside: true,
        onClose: (reason) => reasons.popover.push(reason)
      });
      dialog.open();
      popoverAnchor.focus();
      popover.open();
      popoverLast.focus();

      window.__tabDialog = dialog;
      window.__tabPopover = popover;
      window.__tabReasons = reasons;
      window.__tabTrail = [];
      window.__tabTrack = true;
      document.addEventListener('focusin', function (event) {
        if (!window.__tabTrack) return;
        const target = event.target;
        window.__tabTrail.push({
          id: target && target.id,
          inDialog: Boolean(dialog.el && dialog.el.contains(target)),
          inPopover: Boolean(popover.el && popover.el.contains(target))
        });
      }, true);
    });

    const setup = await activeState(page);
    check(setup.dialogOpen && setup.popoverOpen && setup.floatingCount === 2 &&
      setup.id === 'tab-popover-last' && setup.inPopover,
      'modal Dialog + non-trap Popover open with focus in Popover', setup);

    await page.keyboard.press('Tab');
    const afterTab = await activeState(page);
    check(afterTab.inDialog && !afterTab.inPopover && afterTab.dialogOpen &&
      afterTab.popoverOpen && afterTab.id === 'tab-dialog-first',
      'Tab from top non-trap layer falls back to nearest trapFocus layer, not body', afterTab);

    await page.keyboard.press('Shift+Tab');
    const afterShiftTab = await activeState(page);
    check(afterShiftTab.inDialog && afterShiftTab.id === 'tab-dialog-last',
      'Shift+Tab remains in Dialog focus cycle', afterShiftTab);

    await page.keyboard.press('Tab');
    const afterWrap = await activeState(page);
    check(afterWrap.inDialog && afterWrap.id === 'tab-dialog-first',
      'Dialog Tab cycle wraps without leaving visible layers', afterWrap);

    const trail = await page.evaluate(() => window.__tabTrail.slice());
    const escaped = trail.filter((entry) => !entry.inDialog && !entry.inPopover);
    check(escaped.length === 0 && trail.length >= 3,
      'focusin trail never lands on body/outside layers during Tab cycling', { trail, escaped });

    await page.keyboard.press('Escape');
    const afterFirstEsc = await activeState(page);
    const reasonsAfterFirstEsc = await page.evaluate(() => ({
      dialog: window.__tabReasons.dialog.slice(),
      popover: window.__tabReasons.popover.slice()
    }));
    check(!afterFirstEsc.popoverOpen && afterFirstEsc.dialogOpen &&
      afterFirstEsc.inDialog && afterFirstEsc.floatingCount === 1 &&
      reasonsAfterFirstEsc.popover.join(',') === 'esc' &&
      reasonsAfterFirstEsc.dialog.length === 0,
      'Escape closes only top Popover; Dialog remains and focus stays inside it', {
        afterFirstEsc,
        reasonsAfterFirstEsc
      });

    await page.evaluate(() => {
      const anchor = document.getElementById('tab-popover-anchor');
      window.__tabTrail = [];
      window.__tabTrack = true;
      anchor.focus();
      window.__tabPopover.open();
      const first = window.__tabPopover.el.querySelector('#tab-popover-first');
      first.focus();
    });
    const reopened = await activeState(page);
    check(reopened.dialogOpen && reopened.popoverOpen && reopened.id === 'tab-popover-first',
      'Popover reopens inside Dialog', reopened);

    await page.keyboard.press('Escape');
    const afterRestore = await activeState(page);
    const reasonsAfterRestore = await page.evaluate(() => ({
      dialog: window.__tabReasons.dialog.slice(),
      popover: window.__tabReasons.popover.slice()
    }));
    check(!afterRestore.popoverOpen && afterRestore.dialogOpen &&
      afterRestore.id === 'tab-popover-anchor' && afterRestore.inDialog &&
      reasonsAfterRestore.popover.join(',') === 'esc,esc',
      'closing Popover restores focus to its anchor inside Dialog', {
        afterRestore,
        reasonsAfterRestore
      });

    await page.keyboard.press('Escape');
    const afterDialogClose = await activeState(page);
    const reasonsFinal = await page.evaluate(() => window.__tabReasons);
    check(!afterDialogClose.dialogOpen && !afterDialogClose.popoverOpen &&
      afterDialogClose.floatingCount === 0 && afterDialogClose.id === 'tab-dialog-opener' &&
      afterDialogClose.overflow !== 'hidden' &&
      reasonsFinal.dialog.join(',') === 'esc' && reasonsFinal.popover.join(',') === 'esc,esc',
      'second Escape closes Dialog, restores opener focus and scroll lock', {
        afterDialogClose,
        reasonsFinal
      });

    await page.evaluate(() => {
      const anchor = document.createElement('button');
      anchor.id = 'tab-solo-anchor';
      anchor.textContent = '单独浮层锚点';
      anchor.style.cssText = 'position:fixed;left:500px;top:80px;width:140px;height:32px';
      document.body.appendChild(anchor);
      const content = document.createElement('div');
      content.style.cssText = 'display:grid;gap:8px;padding:14px';
      const soloButton = document.createElement('button');
      soloButton.id = 'tab-solo-button';
      soloButton.textContent = '单独浮层按钮';
      content.appendChild(soloButton);
      const solo = window.NoteCore.floating.create({
        anchor,
        content,
        trapFocus: false,
        modal: false,
        backdrop: false
      });
      window.__tabSolo = solo;
      window.__tabSoloAnchor = anchor;
      window.__tabSoloAnchor.focus();
      solo.open();
      soloButton.focus();
      window.__tabDefaultPrevented = null;
      window.__tabRecorder = function (event) {
        if (event.key === 'Tab') window.__tabDefaultPrevented = event.defaultPrevented;
      };
      document.addEventListener('keydown', window.__tabRecorder);
    });
    await page.keyboard.press('Tab');
    const soloDefault = await page.evaluate(() => ({
      defaultPrevented: window.__tabDefaultPrevented,
      floatingCount: document.querySelectorAll('.hnv-floating').length,
      soloOpen: window.__tabSolo.isOpen()
    }));
    check(soloDefault.defaultPrevented === false && soloDefault.floatingCount === 1 &&
      soloDefault.soloOpen,
      'no lower trapFocus layer leaves Tab to browser default', soloDefault);

    const cleanup = await page.evaluate(() => {
      document.removeEventListener('keydown', window.__tabRecorder);
      window.__tabSolo.destroy();
      window.__tabSoloAnchor.remove();
      window.__tabDialog.destroy();
      window.__tabPopover.destroy();
      document.getElementById('tab-dialog-opener').remove();
      return {
        floating: document.querySelectorAll('.hnv-floating').length,
        backdrops: document.querySelectorAll('.hnv-floating__backdrop').length,
        bodyOverflow: document.body.style.overflow
      };
    });
    check(cleanup.floating === 0 && cleanup.backdrops === 0 && cleanup.bodyOverflow !== 'hidden',
      'no floating or backdrop residue after regression check', cleanup);
    check(browserErrors.length === 0, 'browser console / pageerror empty', browserErrors);

    await context.close();
    await browser.close();
    console.log('\nAll ' + checks + ' floating Tab regression checks passed.');
  } catch (error) {
    await browser.close().catch(() => {});
    console.error('\nFAILED after ' + checks + ' checks.');
    console.error(error && error.stack ? error.stack : error);
    if (browserErrors.length) console.error('browser errors:', browserErrors);
    process.exitCode = 1;
  }
}

main();
