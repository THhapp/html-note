#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const { chromium }=require('../tools/node_modules/playwright-core');
const here=path.dirname(fileURLToPath(import.meta.url));
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser=await chromium.launch({executablePath:edge,headless:true,args:['--allow-file-access-from-files']});
const page=await browser.newPage({viewport:{width:1100,height:900}});
const errors=[],pageErrors=[],requests=[];
page.on('console',(m)=>{if(m.type()==='error')errors.push(m.text());});
page.on('pageerror',(e)=>pageErrors.push(String(e&&e.stack||e)));
page.on('request',(r)=>requests.push(r.url()));
await page.goto(pathToFileURL(path.join(here,'build-full-smoke.html')).href,{waitUntil:'load'});
await page.waitForTimeout(150);
const api=await page.evaluate(async()=>{
  await document.fonts.ready;
  return {
    core:!!window.NoteCore,
    ui:!!window.NoteUI,
    viz:!!window.NoteViz,
    blocks:!!window.NoteBlocks,
    registry:!!window.NOTE_LIBRARY_REGISTRY,
    registryEntries:window.NOTE_LIBRARY_REGISTRY?window.NOTE_LIBRARY_REGISTRY.entries.length:0,
    panel:!!document.querySelector('.nui-panel'),
    math:!!document.querySelector('.nui-math .katex'),
    tabs:!!document.querySelector('.nui-tabs,.nui-tablist,[role="tablist"]'),
    progress:!!document.querySelector('.nui-progress,[role="progressbar"]'),
    token:getComputedStyle(document.documentElement).getPropertyValue('--hnv-color-accent').trim(),
    remainingBody:document.querySelectorAll('body > .hnv-floating,body > .nx-focus,body > .nx-range,body > .nx-link').length
  };
});
const failures=[];
function check(ok,msg){console.log((ok?'PASS  ':'FAIL  ')+msg);if(!ok)failures.push(msg);}
check(api.core&&api.ui&&api.viz,'full bundle exposes available NoteCore/NoteUI/NoteViz');
check(api.registry&&api.registryEntries>0,'registry.js loads with entries ('+api.registryEntries+')');
check(api.panel&&api.math&&api.tabs&&api.progress,'full bundle can mount layout/content/navigation/feedback components');
check(api.token.length>0,'full bundle CSS tokens load');
check(api.remainingBody===0,'no unexpected body-level overlays');
check(requests.every((url)=>/^(?:file:|data:|about:)/.test(url)),'full bundle makes no network requests');
check(errors.length===0&&pageErrors.length===0,'full bundle console/page errors: 0 ('+errors.concat(pageErrors).join(' | ')+')');
await browser.close();
if(failures.length){console.error('FULL SMOKE FAILED');process.exitCode=1;}else console.log('FULL SMOKE OK');
