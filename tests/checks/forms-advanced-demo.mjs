import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { moduleDemos, moduleScripts, moduleStyles } from '../lib/src-sources.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('../tools/node_modules/playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const MODULES = ['core', 'ui-forms-basic', 'ui-forms-advanced'];
const css = moduleStyles(root, MODULES).map(f=>path.join(root,f));
const js = [...moduleScripts(root, MODULES), ...moduleDemos(root, ['ui-forms-advanced'])].map(f=>path.join(root,f));
const browser = await chromium.launch({ executablePath: edge, headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.setContent('<div id="host"></div>');
for (const f of css) await page.addStyleTag({ path: f });
for (const f of js) await page.addScriptTag({ path: f });
const results = await page.evaluate(() => {
  const out = [];
  const host = document.getElementById('host');
  ['F09','F10','F11','F12','F13','F14','F15'].forEach((id) => {
    try {
      host.replaceChildren();
      const demo = window.NoteGalleryDemos[id];
      if (typeof demo !== 'function') { out.push({ id, ok: false, error: 'missing demo' }); return; }
      const instance = demo(host);
      const root = host.firstElementChild;
      const mounted = !!root && host.textContent.trim().length > 0;
      const buttons = root ? Array.from(root.querySelectorAll('button')).filter((b) => !b.classList.contains('nui-fileinput__drop')) : [];
      let clicked = 0;
      buttons.forEach((button) => {
        try { button.click(); clicked += 1; } catch (error) { errors.push(id + ' button: ' + error.message); }
      });
      const floatingBeforeDestroy = document.querySelectorAll('.hnv-floating').length;
      if (instance && typeof instance.destroy === 'function') instance.destroy();
      else root.remove();
      const floatingAfter = document.querySelectorAll('.hnv-floating').length;
      out.push({ id, ok: mounted && floatingAfter === 0 && host.children.length === 0, mounted, clicked, floatingBeforeDestroy, floatingAfter });
    } catch (error) {
      out.push({ id, ok: false, error: error.message });
    }
  });
  return out;
});
await browser.close();
console.log(JSON.stringify({ results, errors }, null, 2));
if (errors.length || results.some(r => !r.ok)) process.exit(1);
