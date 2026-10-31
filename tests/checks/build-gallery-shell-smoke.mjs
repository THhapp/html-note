#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const { chromium }=require('../tools/node_modules/playwright-core');
const here=path.dirname(fileURLToPath(import.meta.url));
const gallery=pathToFileURL(path.join(here,'..','..','gallery','index.html')).href;
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser=await chromium.launch({executablePath:edge,headless:true,args:['--allow-file-access-from-files']});
const page=await browser.newPage({viewport:{width:1280,height:1000}});
const errors=[],warnings=[],pageErrors=[];
page.on('console',(m)=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
page.on('pageerror',(e)=>pageErrors.push(String(e&&e.stack||e)));
await page.goto(gallery,{waitUntil:'load'});
await page.waitForTimeout(1200);
const api=await page.evaluate(()=>({
  title:document.title,
  registry:!!window.NOTE_LIBRARY_REGISTRY,
  entryCount:window.NOTE_LIBRARY_REGISTRY?window.NOTE_LIBRARY_REGISTRY.entries.length:0,
  listItems:document.querySelectorAll('#gallery-list li').length,
  countText:(document.getElementById('gallery-count')||{}).textContent,
  buildText:(document.getElementById('gallery-build')||{}).textContent,
  hash:location.hash,
  detailTitle:document.querySelector('#gallery-detail h2')?document.querySelector('#gallery-detail h2').textContent:'',
  demoHost:!!document.getElementById('gallery-demo'),
  missingDemo:!!document.querySelector('.gallery-demo-missing'),
  state:document.documentElement.getAttribute('data-gallery-state'),
  banner:(document.getElementById('gallery-banner')||{}).textContent
}));
console.log(JSON.stringify(api,null,2));
console.log('console errors',JSON.stringify(errors,null,2));
console.log('console warnings',JSON.stringify(warnings,null,2));
console.log('page errors',JSON.stringify(pageErrors,null,2));
await browser.close();
