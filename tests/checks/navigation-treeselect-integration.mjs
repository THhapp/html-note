import { chromium } from '../tools/node_modules/playwright-core/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleScripts, moduleStyles } from '../lib/src-sources.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(e.stack));
page.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
await page.setContent('<!doctype html><html><body><div id="host"></div></body></html>');
// 源码加载清单从 src/manifests 推导，navigation/extended 拆分后自动包含新增文件。
const pageModules = ['core', 'ui-navigation', 'ui-extended'];
for (const file of moduleScripts(root, pageModules)) await page.addScriptTag({path:path.join(root,file)});
for (const file of moduleStyles(root, pageModules)) await page.addStyleTag({path:path.join(root,file)});
const mounted = await page.evaluate(() => {
  const host=document.getElementById('host');
  window.__changes=[];
  window.__ts=NoteUI.TreeSelect.mount(host, {
    label:'文档选择',
    nodes:[
      {id:'a',label:'目录',children:[{id:'a1',label:'文件一'},{id:'a2',label:'文件二'}]},
      {id:'b',label:'另一目录',children:[{id:'b1',label:'禁用文件',disabled:true}]}
    ],
    expanded:['a'],
    value:null,
    onChange:(value,nodes,event)=>window.__changes.push({value,nodes:nodes.map(n=>n.id),type:event&&event.type})
  });
  return {has:!!window.__ts, treeBefore:host.querySelectorAll('[role=tree]').length};
});
console.log('mounted',mounted);
await page.locator('.nui-treeselect__trigger').click();
await page.waitForTimeout(100);
console.log('popup tree', await page.locator('.nui-treeselect__popup [role=tree]').count(), 'treeitems', await page.locator('.nui-treeselect__popup [role=treeitem]').count());
const first = page.locator('.nui-treeselect__popup [role=treeitem]').nth(1);
await first.click();
await page.waitForTimeout(100);
console.log('changes', await page.evaluate(()=>window.__changes));
console.log('summary', await page.locator('.nui-treeselect__summary').textContent());
console.log('popup closed', await page.locator('.nui-treeselect__popup').count());
console.log('errors', errors);
await browser.close();
if (errors.length) process.exit(1);
