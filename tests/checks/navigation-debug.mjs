import { chromium } from '../tools/node_modules/playwright-core/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleScripts, moduleStyles } from '../lib/src-sources.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.setContent('<!doctype html><html><body><div id="host"></div></body></html>');
for (const file of moduleScripts(root, ['core', 'ui-navigation'])) await page.addScriptTag({path:path.join(root,file)});
for (const file of moduleStyles(root, ['core', 'ui-navigation'])) await page.addStyleTag({path:path.join(root,file)});
const out=await page.evaluate(()=>{
 const tree=NoteUI.TreeView.mount(document.getElementById('host'), {nodes:[{id:'root',label:'根',children:[{id:'leaf',label:'叶'}]}], expanded:[], selected:'root'});
 return {html:tree.el.outerHTML, rootRole:tree.el.getAttribute('role'), group:!!tree.el.querySelector('[role="group"]'), roles:[...tree.el.querySelectorAll('[role]')].map(x=>[x.tagName,x.getAttribute('role')])};
});
console.log(JSON.stringify(out,null,2));
await browser.close();
