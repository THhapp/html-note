import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { moduleStyles } from '../lib/src-sources.mjs';
const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage();
// CSS 清单从 manifest 推导；extended 样式拆分后自动合并检查。
const css = moduleStyles(root, ['ui-extended']).map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
await page.setContent('<!doctype html><html><head><style>' + css + '</style></head><body></body></html>');
const result = await page.evaluate(() => {
  const selectors = [];
  const sheets = Array.from(document.styleSheets);
  function walk(rules) {
    for (const rule of Array.from(rules || [])) {
      if (rule.selectorText) selectors.push(rule.selectorText);
      if (rule.cssRules) walk(rule.cssRules);
    }
  }
  sheets.forEach((sheet) => walk(sheet.cssRules));
  return {
    sheets: sheets.length,
    total: selectors.length,
    unscoped: selectors.filter((selector) => selector.split(',').some((part) => !part.trim().startsWith('.nui-'))),
    selectors
  };
});
console.log(JSON.stringify({ sheets: result.sheets, total: result.total, unscoped: result.unscoped }, null, 2));
await browser.close();
if (!result.sheets || result.unscoped.length) process.exitCode = 1;
