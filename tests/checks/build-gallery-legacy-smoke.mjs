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
const consoleErrors=[],pageErrors=[];
page.on('console',(m)=>{if(m.type()==='error')consoleErrors.push(m.text());});
page.on('pageerror',(e)=>pageErrors.push(String(e&&e.stack||e)));
const failures=[];
function check(ok,msg){console.log((ok?'PASS  ':'FAIL  ')+msg);if(!ok)failures.push(msg);}
async function select(id){
  const ok=await page.evaluate(async(id)=>{const selected=window.NoteGallery.select(id);await window.NoteGallery.ready();return {selected,current:window.NoteGallery.current(),state:document.documentElement.getAttribute('data-gallery-state')};},id);
  await page.waitForTimeout(40);
  return ok;
}
async function action(id,text){
  const host=page.locator('#gallery-demo');
  await host.locator('.legacy-demo__action',{hasText:text}).first().click();
  await page.waitForTimeout(40);
}
try{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto(gallery,{waitUntil:'load'});
  await page.waitForFunction(()=>window.NoteGallery&&window.NoteGallery.select&&window.NoteGallery.ready);
  await page.evaluate(()=>window.NoteGallery.ready());
  let s=await select('R01');
  check(s.selected&&s.current==='R01'&&s.state==='ready','gallery selects R01 and mounts its demo');
  check(await page.locator('#gallery-demo .nui-button').count()>=7,'gallery R01 hosts real Button variants');
  await action('R01','更新 DOM 图标按钮文案');
  check((await page.textContent('#gallery-demo .legacy-demo__feedback')).includes('同一个 DOM 图标节点'),'gallery R01 interaction works');
  s=await select('R02');
  check(await page.locator('#gallery-demo .nui-segmented').count()===2,'gallery switches to R02 and mounts Segmented');
  check(await page.locator('#gallery-demo .nui-button').count()===0,'gallery removes the previous R01 demo');
  s=await select('R07');
  await action('R07','关注目标 A');
  check(await page.locator('body > .nx-focus[data-nx-state="shown"]').count()===1,'gallery R07 shows NoteExpr.Focus overlay');
  s=await select('R08');
  await page.waitForTimeout(60);
  check(await page.locator('body > .nx-focus').count()===0,'gallery switching away from R07 removes Focus overlay');
  await action('R08','标注前两步');
  check(await page.locator('body > .nx-range[data-nx-state="shown"]').count()===1,'gallery R08 shows NoteExpr.Range overlay');
  s=await select('R09');
  await page.waitForTimeout(60);
  check(await page.locator('body > .nx-range').count()===0,'gallery switching away from R08 removes Range overlay');
  await action('R09','配置 → 读取函数');
  check(await page.locator('body > .nx-link[data-nx-state="shown"]').count()===1,'gallery R09 shows NoteExpr.Link overlay');
  s=await select('R10');
  await page.waitForTimeout(60);
  check(await page.locator('body > .nx-link').count()===0,'gallery switching away from R09 removes Link overlay');
  check(await page.locator('#gallery-demo .seq-insert[data-inserted="0"]').count()===1,'gallery R10 mounts SeqInsert');
  await action('R10','插入');
  await page.waitForTimeout(80);
  check(await page.locator('#gallery-demo .seq-insert[data-inserted="1"]').count()===1,'gallery R10 insert works');
  s=await select('I06');
  check((await page.textContent('#gallery-demo')).includes('dist/note-library.js'),'gallery I06 shows distribution information');
  s=await select('R01');
  await page.waitForTimeout(60);
  check(await page.locator('#gallery-demo .seq-insert').count()===0,'gallery switching away from R10 removes SeqInsert');
  const unexpected=consoleErrors.filter((e)=>!e.includes('ERR_FILE_NOT_FOUND'));
  check(unexpected.length===0,'gallery legacy integration has no unexpected console errors ('+unexpected.join(' | ')+')');
  check(pageErrors.length===0,'gallery legacy integration has no page errors');
}catch(err){failures.push('runner exception: '+(err&&err.stack||err));console.error(err);}finally{await browser.close();}
if(failures.length){console.error('GALLERY LEGACY SMOKE FAILED: '+failures.length);process.exitCode=1;}else console.log('GALLERY LEGACY SMOKE OK');
