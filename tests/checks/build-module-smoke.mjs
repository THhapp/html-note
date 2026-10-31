#!/usr/bin/env node
/*
 * Module isolation smoke test: open one small HTML page per module that loads
 * only core + the module under test, exercise real APIs, and verify no console
 * errors or non-file requests. This is not a full visual QA pass.
 */
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('../tools/node_modules/playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const libraryRoot = path.resolve(here, '..', '..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const failures = [];
function check(condition, message) {
  if (condition) console.log('PASS  ' + message);
  else {
    failures.push(message);
    console.log('FAIL  ' + message);
  }
}

const browser = await chromium.launch({ executablePath: edge, headless: true, args: ['--allow-file-access-from-files'] });

async function openPage(file) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const consoleErrors = [];
  const pageErrors = [];
  const requests = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(String(error && error.stack || error)));
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  return { page, consoleErrors, pageErrors, requests };
}

try {
  // core only
  {
    const { page, consoleErrors, pageErrors, requests } = await openPage(path.join(here, 'build-module-core.html'));
    const api = await page.evaluate(() => {
      const token = getComputedStyle(document.documentElement).getPropertyValue('--hnv-color-accent').trim();
      const names = NoteCore.icons.names();
      const icon = NoteCore.icons.get('check');
      const anchor = document.createElement('button');
      anchor.textContent = 'anchor';
      document.body.appendChild(anchor);
      const layer = NoteCore.floating.create({ anchor: anchor, content: '浮层说明', role: 'tooltip' });
      layer.open();
      const layerOpen = layer.isOpen();
      const layerText = layer.el.textContent;
      layer.close('api');
      layer.destroy();
      anchor.remove();
      return {
        hasCore: !!window.NoteCore,
        token,
        iconCount: names.length,
        iconTag: icon && icon.tagName,
        motion: !!NoteCore.motion,
        floating: !!NoteCore.floating,
        layerOpen,
        layerText,
        bodyLayers: document.querySelectorAll('.hnv-floating').length
      };
    });
    check(api.hasCore && api.motion && api.floating, 'core module exposes NoteCore/motion/floating');
    check(api.token.length > 0, 'core CSS tokens load in isolation');
    check(api.iconCount >= 60 && api.iconTag === 'svg', 'core icon registry works in isolation');
    check(api.layerOpen && api.layerText === '浮层说明' && api.bodyLayers === 0, 'core floating opens and destroys cleanly');
    check(consoleErrors.length === 0 && pageErrors.length === 0, 'core module console/page errors: 0');
    check(requests.every((url) => /^(?:file:|data:|about:)/.test(url)), 'core module makes no network requests');
    await page.close();
  }

  // legacy with only core
  {
    const { page, consoleErrors, pageErrors } = await openPage(path.join(here, 'build-module-legacy.html'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const api = await page.evaluate(() => {
      const host = document.getElementById('host');
      const stage = document.createElement('div');
      host.appendChild(stage);
      const targetA = document.createElement('span');
      targetA.textContent = '目标 A';
      const targetB = document.createElement('span');
      targetB.textContent = '目标 B';
      stage.appendChild(targetA);
      stage.appendChild(targetB);
      NoteUI.Button.iconResolver = function (name) { return NoteCore.icons.get(name); };
      const b = NoteUI.Button.mount(host, { label: '继续', icon: 'arrow-right', iconPosition: 'end' });
      const data = NoteUI.DataObject.mount(host, { label: '结果', value: 'C3', changed: true });
      const focus = NoteExpr.Focus.mount({ motion: 'never' });
      focus.show(targetA);
      const focusShown = focus.el.getAttribute('data-nx-state');
      const oldAccent = getComputedStyle(focus.el).getPropertyValue('--nx-accent').trim();
      const seqHost = document.createElement('div');
      host.appendChild(seqHost);
      const seq = SeqInsert.mount(seqHost, { sequence: ['A', 'B'], insert: { text: 'X', index: 1 }, animate: false });
      seq.insert({ animate: false });
      const seqInserted = seq.el.getAttribute('data-inserted');
      focus.destroy();
      seq.destroy();
      const overlayCount = document.querySelectorAll('.nx-focus').length;
      document.body.classList.add('hnv-legacy-bridge');
      const bridgedFocus = NoteExpr.Focus.mount({ motion: 'never' });
      bridgedFocus.show(targetB);
      const bridgedAccent = getComputedStyle(bridgedFocus.el).getPropertyValue('--nx-accent').trim();
      bridgedFocus.destroy();
      document.body.classList.remove('hnv-legacy-bridge');
      return {
        buttonClass: b.el.className,
        buttonText: b.el.textContent,
        dataChanged: data.el.classList.contains('nui-data-object--changed'),
        focusShown,
        oldAccent,
        seqInserted,
        overlayCount,
        bridgedAccent,
        coreAccent: getComputedStyle(document.documentElement).getPropertyValue('--hnv-color-accent').trim()
      };
    });
    check(api.buttonClass.includes('nui-button--secondary') && api.buttonText === '继续', 'legacy Button runs with core only');
    check(api.dataChanged, 'legacy DataObject runs with core only');
    check(api.focusShown === 'shown', 'NoteExpr.Focus runs with core + legacy only');
    check(api.seqInserted === '1', 'SeqInsert runs with core + legacy only');
    check(api.overlayCount === 0, 'legacy NoteExpr overlays are removed by destroy');
    check(api.oldAccent.toLowerCase() === '#1f6f6a', 'legacy default accent remains unchanged without bridge');
    check(api.bridgedAccent.toLowerCase() === api.coreAccent.toLowerCase(), 'opt-in bridge maps Focus accent to core token');
    check(consoleErrors.length === 0 && pageErrors.length === 0, 'legacy module console/page errors: 0');
    await page.close();
  }

  // ui-layout with only core
  {
    const { page, consoleErrors, pageErrors } = await openPage(path.join(here, 'build-module-ui-layout.html'));
    const api = await page.evaluate(() => {
      const host = document.getElementById('host');
      const container = NoteUI.Container.mount(host, { maxWidth: '40rem', content: '容器内容' });
      const stack = NoteUI.Stack.mount(host, { gap: 'sm', content: '第一段' });
      const panel = NoteUI.Panel.mount(host, { title: '面板标题', content: '面板主体' });
      const result = {
        container: !!host.querySelector('.nui-container'),
        stack: !!host.querySelector('.nui-vstack'),
        panel: !!host.querySelector('.nui-panel'),
        title: panel.el.textContent.includes('面板标题'),
        rootWidth: getComputedStyle(container.el).maxWidth
      };
      container.destroy();
      stack.destroy();
      panel.destroy();
      return Object.assign(result, { remaining: host.querySelectorAll('.nui-container,.nui-vstack,.nui-panel').length });
    });
    check(api.container && api.stack && api.panel && api.title, 'layout components mount from core + ui-layout');
    check(api.remaining === 0, 'layout components destroy cleanly');
    check(consoleErrors.length === 0 && pageErrors.length === 0, 'ui-layout module console/page errors: 0');
    await page.close();
  }

  // ui-content with only core (vendor is embedded in this module)
  const contentHtml = path.join(here, 'build-module-ui-content.html');
  const contentJs = path.join(libraryRoot, 'dist', 'modules', 'ui-content.js');
  if (fs.existsSync(contentJs)) {
    const { page, consoleErrors, pageErrors, requests } = await openPage(contentHtml);
    await page.waitForFunction(() => !!(window.NoteUI && NoteUI.Math && NoteUI.Markdown));
    const api = await page.evaluate(async () => {
      const host = document.getElementById('host');
      const math = NoteUI.Math.mount(host, { tex: 'E = mc^2', display: true, ariaLabel: '质能方程' });
      await new Promise((resolve) => setTimeout(resolve, 80));
      const markdown = NoteUI.Markdown.mount(host, { markdown: '# 标题\n\n这是 **粗体** 与 `code`。\n\n| 列 | 值 |\n| --- | --- |\n| A | 1 |' });
      const table = NoteUI.Table.mount(host, { columns: [{ key: 'a', label: '项目' }, { key: 'b', label: '值' }], rows: [{ a: 'A', b: '1' }] });
      const result = {
        katex: !!host.querySelector('.nui-math .katex'),
        mathError: !!host.querySelector('.nui-math--error'),
        markdownHeading: !!host.querySelector('.nui-markdown h1, .nui-markdown h2'),
        markdownStrong: !!host.querySelector('.nui-markdown strong'),
        markdownTable: !!host.querySelector('.nui-markdown table'),
        table: !!host.querySelector('.nui-table table, table'),
        marked: typeof window.marked,
        katexGlobal: typeof window.katex
      };
      math.destroy();
      markdown.destroy();
      table.destroy();
      result.remaining = host.querySelectorAll('.nui-math,.nui-markdown,.nui-table').length;
      return result;
    });
    check(api.katex && !api.mathError, 'ui-content Math renders KaTeX with embedded vendor');
    check(api.markdownHeading && api.markdownStrong, 'ui-content Markdown renders marked output');
    check(api.markdownTable, 'ui-content Markdown renders a table');
    check(api.table, 'ui-content Table mounts');
    check(api.remaining === 0, 'ui-content components destroy cleanly');
    check(consoleErrors.length === 0 && pageErrors.length === 0, 'ui-content module console/page errors: 0');
    check(requests.every((url) => /^(?:file:|data:|about:)/.test(url)), 'ui-content fonts/vendor make no network requests');
    await page.close();
  } else {
    check(false, 'ui-content module dist is not available yet');
  }
} catch (err) {
  failures.push('runner exception: ' + (err && err.stack || err));
  console.error(err);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error('\nMODULE SMOKE FAILED: ' + failures.length + ' assertion(s)');
  failures.forEach((failure) => console.error('- ' + failure));
  process.exitCode = 1;
} else {
  console.log('\nMODULE SMOKE OK');
}
