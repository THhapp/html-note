import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { moduleDemos, moduleScripts, moduleStyles } from '../lib/src-sources.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('../tools/node_modules/playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const MODULES = ['core', 'ui-forms-basic', 'ui-forms-advanced'];
const css = moduleStyles(root, MODULES).map(f=>path.join(root,f));
const js = [...moduleScripts(root, MODULES), ...moduleDemos(root, ['ui-forms-advanced'])].map(f=>path.join(root,f));
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.setContent('<style>html,body{margin:0;padding:0}</style><div id="host" style="padding:12px"></div>');
for (const f of css) await page.addStyleTag({ path: f });
for (const f of js) await page.addScriptTag({ path: f });
const result = await page.evaluate(() => {
  const host = document.getElementById('host');
  const out = {};
  ['F12','F13'].forEach((id) => {
    host.replaceChildren();
    const instance = window.NoteGalleryDemos[id](host);
    const trigger = host.querySelector(id === 'F12' ? '.nui-datepicker__trigger' : '.nui-timepicker__trigger');
    trigger.click();
    const panel = document.querySelector(id === 'F12' ? '.hnv-floating' : '.hnv-floating');
    const rect = panel.getBoundingClientRect();
    out[id] = {
      width: innerWidth,
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      panelWidth: Math.round(rect.width)
    };
    instance.destroy();
    document.querySelectorAll('.hnv-floating').forEach(n => n.remove());
  });
  host.replaceChildren();
  const form = NoteUI.Form.mount(host, {
    fields: [
      { name: 'a', label: '很长的中文字段标签用于检查窄容器中的换行与可读性', control: 'text', required: true, hint: '这是一段较长的辅助说明，应该在窄容器内自然换行，不把标签或输入挤到不可读。' },
      { name: 'b', label: '滑块', control: 'slider', defaultValue: 50, options: { min: 0, max: 100, step: 10 } }
    ]
  });
  form.submit();
  out.form = {
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    summaryVisible: form.el.querySelector('.nui-form__summary').hidden === false
  };
  form.destroy();

  return out;
});
console.log(JSON.stringify(result,null,2));
await browser.close();
const bad = Object.values(result).some(v => v && typeof v === 'object' && typeof v.scrollWidth === 'number' && v.scrollWidth > v.clientWidth + 1) || errors.length;
if (bad) process.exit(1);
