import { chromium } from '../tools/node_modules/playwright-core/index.mjs';
import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';
import { cacheDir } from '../lib/test-output.mjs';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const outDir = cacheDir(root, 'checks', 'blocks-stage');
const gallery = url.pathToFileURL(path.join(root, 'gallery', 'index.html')).href;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const checks = [];
const consoleRecords = [];
let browser;

function record(name, ok, detail) {
  checks.push({ name, ok, detail: detail == null ? '' : String(detail) });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : ' — ' + String(detail).split('\n')[0]));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function openEntry(page, id) {
  await page.goto(gallery + '#' + id, { waitUntil: 'load' });
  await page.waitForFunction((entryId) => {
    const detail = document.getElementById('gallery-detail');
    if (!detail) return false;
    const current = detail.getAttribute('data-current-id') || '';
    const host = document.getElementById('gallery-demo');
    return document.documentElement.getAttribute('data-gallery-state') === 'ready' &&
      host && host.children.length > 0 &&
      (!current || current === entryId);
  }, id, { timeout: 15000 });
  await page.waitForTimeout(180);
}

async function main() {
  browser = await chromium.launch({ headless: true, executablePath: edge });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleRecords.push({ type: message.type(), text: message.text() });
    }
  });
  page.on('pageerror', (error) => {
    consoleRecords.push({ type: 'pageerror', text: error.stack || String(error) });
  });

  try {
    await page.route('**/gallery/demos/blocks-explain.js', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* not built in this stage */' });
    });
  } catch (error) {
    /* file:// routing is optional; the missing future module is reported separately */
  }

  try {
    await openEntry(page, 'B01');
    const b01 = await page.evaluate(() => {
      const stage = document.querySelector('#gallery-demo .nblk-demo-stage__stage');
      return {
        exists: !!document.querySelector('#gallery-demo .nblk-demo-stage'),
        stageChildren: stage ? stage.children.length : 0,
        controls: document.querySelectorAll('#gallery-demo .nblk-demo-stage__controls button').length,
        demoText: document.getElementById('gallery-demo').textContent.length
      };
    });
    assert(b01.exists && b01.stageChildren > 0, 'B01 gallery stage empty');
    assert(b01.controls >= 3, 'B01 gallery controls missing');
    record('Gallery B01 demo stage is non-empty', true, JSON.stringify(b01));
    await page.screenshot({ path: path.join(outDir, 'blocks-stage-gallery-B01.png'), fullPage: false });

    await openEntry(page, 'B02');
    const b02Before = await page.evaluate(() => {
      const host = document.getElementById('gallery-demo');
      const stage = host.querySelector('.nblk-demo-stage__stage');
      const caption = host.querySelector('.nblk-demo-stage__caption');
      return {
        exists: !!host.querySelector('.nblk-step-player'),
        stageChildren: stage ? stage.children.length : 0,
        stageHeight: stage ? stage.getBoundingClientRect().height : 0,
        captionHeight: caption ? caption.getBoundingClientRect().height : 0,
        sequences: host.querySelectorAll('.nviz-sequence').length,
        objects: host.querySelectorAll('.nui-data-object').length,
        hasReadout: host.textContent.includes('完整快照'),
        caption: caption ? caption.textContent : ''
      };
    });
    assert(b02Before.exists && b02Before.stageChildren > 0, 'B02 gallery stage empty');
    assert(b02Before.stageHeight > 40, 'B02 gallery stage height zero');
    assert(b02Before.sequences === 1 && b02Before.objects === 2, 'B02 initial visualization/readouts incomplete');
    record('Gallery B02 initial stop shows sequence, readouts and caption', true, JSON.stringify(b02Before));
    await page.screenshot({ path: path.join(outDir, 'blocks-stage-gallery-B02-initial.png'), fullPage: false });

    await page.locator('#gallery-demo').getByRole('button', { name: '下一步', exact: true }).click();
    await page.waitForTimeout(120);
    const b02After = await page.evaluate(() => {
      const host = document.getElementById('gallery-demo');
      const player = host.querySelector('.nblk-step-player');
      const stage = host.querySelector('.nblk-demo-stage__stage');
      return {
        index: player ? player.getAttribute('data-step-index') : null,
        stageHeight: stage ? stage.getBoundingClientRect().height : 0,
        captionHeight: host.querySelector('.nblk-demo-stage__caption').getBoundingClientRect().height,
        sequences: host.querySelectorAll('.nviz-sequence').length,
        objects: host.querySelectorAll('.nui-data-object').length,
        hasReadout: host.textContent.includes('完整快照'),
        caption: host.querySelector('.nblk-demo-stage__caption').textContent
      };
    });
    assert(b02After.index === '1', 'Gallery B02 next did not advance');
    assert(b02After.sequences === 1 && b02After.objects === 2 && b02After.hasReadout, 'Gallery B02 second stop incomplete');
    assert(Math.abs(b02After.stageHeight - b02Before.stageHeight) <= 2, 'Gallery B02 stage height changed: ' +
      b02Before.stageHeight + ' vs ' + b02After.stageHeight);
    assert(Math.abs(b02After.captionHeight - b02Before.captionHeight) <= 1.1, 'Gallery B02 caption height changed');
    record('Gallery B02 second stop visual/readout present and stage height stable', true, JSON.stringify(b02After));
    await page.screenshot({ path: path.join(outDir, 'blocks-stage-gallery-B02-second.png'), fullPage: false });

    await page.locator('#gallery-demo').getByRole('button', { name: '重看', exact: true }).click();
    await page.waitForTimeout(100);
    const b02Replay = await page.evaluate(() => {
      const host = document.getElementById('gallery-demo');
      return {
        index: host.querySelector('.nblk-step-player').getAttribute('data-step-index'),
        sequences: host.querySelectorAll('.nviz-sequence').length,
        replayed: host.querySelector('.nblk-demo-stage__stage [data-replay="true"]') != null,
        caption: host.querySelector('.nblk-demo-stage__caption').textContent
      };
    });
    assert(b02Replay.index === '1' && b02Replay.sequences === 1, 'Gallery B02 replay left duplicates');
    assert(b02Replay.replayed, 'Gallery B02 host did not receive replay flag');
    assert(b02Replay.caption === b02After.caption, 'Gallery B02 replay changed caption');
    record('Gallery B02 replay re-renders current snapshot without residue', true, JSON.stringify(b02Replay));

    await page.locator('#gallery-demo').getByRole('button', { name: '上一步', exact: true }).click();
    await page.waitForTimeout(100);
    const b02Back = await page.evaluate(() => {
      const host = document.getElementById('gallery-demo');
      return {
        index: host.querySelector('.nblk-step-player').getAttribute('data-step-index'),
        sequences: host.querySelectorAll('.nviz-sequence').length,
        caption: host.querySelector('.nblk-demo-stage__caption').textContent
      };
    });
    assert(b02Back.index === '0' && b02Back.sequences === 1, 'Gallery B02 rollback left residue');
    assert(b02Back.caption === b02Before.caption, 'Gallery B02 rollback caption mismatch');
    record('Gallery B02 rollback restores initial snapshot without residue', true, JSON.stringify(b02Back));

    await page.locator('#gallery-demo').getByRole('button', { name: '换用备用快照组（3 停点）', exact: true }).click();
    await page.waitForTimeout(100);
    const b02Switch = await page.evaluate(() => {
      const host = document.getElementById('gallery-demo');
      const stage = host.querySelector('.nblk-demo-stage__stage');
      return {
        options: host.querySelectorAll('.nblk-step-player select option').length,
        stageChildren: stage.children.length,
        stageHeight: stage.getBoundingClientRect().height,
        objects: host.querySelectorAll('.nui-data-object').length,
        sequences: host.querySelectorAll('.nviz-sequence').length
      };
    });
    assert(b02Switch.options === 3 && b02Switch.stageChildren > 0 && b02Switch.objects === 2 && b02Switch.sequences === 1,
      'Gallery B02 switch dataset incomplete');
    record('Gallery B02 snapshot-set replacement replays host data', true, JSON.stringify(b02Switch));

    await openEntry(page, 'B03');
    const b03 = await page.evaluate(() => {
      const host = document.getElementById('gallery-demo');
      return {
        exists: !!host.querySelector('.nblk-rule-compare'),
        tables: host.querySelectorAll('.nui-table').length,
        notices: host.querySelectorAll('.nui-notice').length,
        rows: host.querySelectorAll('.nui-table__body tr').length,
        text: host.textContent.length
      };
    });
    assert(b03.exists && b03.tables === 1 && b03.rows >= 3, 'B03 gallery table incomplete');
    assert(b03.notices >= 1, 'B03 gallery notices missing');
    record('Gallery B03 demo table and notices are non-empty', true, JSON.stringify(b03));
    await page.screenshot({ path: path.join(outDir, 'blocks-stage-gallery-B03.png'), fullPage: false });

    await openEntry(page, 'B04');
    const b04Before = await page.evaluate(() => {
      const host = document.getElementById('gallery-demo');
      return {
        exists: !!host.querySelector('.nblk-state-compare'),
        compares: host.querySelectorAll('.nviz-compare').length,
        objects: host.querySelectorAll('.nui-data-object').length,
        changed: host.querySelectorAll('.nui-data-object--changed').length,
        focusLayers: document.querySelectorAll('.nx-focus').length,
        summary: host.querySelector('.nblk-state-compare__summary') ? host.querySelector('.nblk-state-compare__summary').textContent : ''
      };
    });
    assert(b04Before.exists && b04Before.compares === 1 && b04Before.objects >= 8, 'B04 gallery compare incomplete');
    assert(b04Before.summary.includes('本步变化'), 'B04 gallery summary missing');
    assert(b04Before.focusLayers === 0, 'B04 gallery default should be static without Focus');
    await page.locator('#gallery-demo').getByRole('button', { name: '显示关注标记', exact: true }).click();
    await page.waitForTimeout(350);
    const b04Focus = await page.evaluate(() => {
      return {
        focusLayers: document.querySelectorAll('.nx-focus').length,
        state: document.querySelector('.nx-focus') ? document.querySelector('.nx-focus').getAttribute('data-nx-state') : null
      };
    });
    assert(b04Focus.focusLayers === 1 && b04Focus.state === 'shown', 'B04 gallery Focus not shown after user action');
    record('Gallery B04 demo compare/summary present and Focus user-triggered', true,
      JSON.stringify({ before: b04Before, focus: b04Focus }));
    await page.screenshot({ path: path.join(outDir, 'blocks-stage-gallery-B04-focus.png'), fullPage: false });

    await page.evaluate(() => { window.location.hash = 'B01'; });
    await page.waitForFunction(() => {
      const host = document.getElementById('gallery-demo');
      return host && host.querySelector('.nblk-demo-stage') && !host.querySelector('.nblk-step-player');
    }, { timeout: 10000 });
    await page.waitForTimeout(80);
    const cleaned = await page.evaluate(() => ({
      focusLayers: document.querySelectorAll('.nx-focus').length,
      b04: document.querySelectorAll('.nblk-state-compare').length,
      b02: document.querySelectorAll('.nblk-step-player').length
    }));
    assert(cleaned.focusLayers === 0 && cleaned.b04 === 0 && cleaned.b02 === 0,
      'Gallery switch left block content or Focus layer behind');
    record('Gallery switch tears down B04 Focus and demo overlays', true, JSON.stringify(cleaned));

    const relevantConsole = consoleRecords.filter((item) => {
      const text = item.text || '';
      if (/blocks-explain\.js/.test(text) && /ERR_FILE_NOT_FOUND|Failed to load resource/.test(text)) return false;
      return item.type === 'error' || item.type === 'warning' || item.type === 'pageerror';
    });
    record('Gallery has no console errors from B01–B04', relevantConsole.length === 0,
      relevantConsole.map(item => item.type + ': ' + item.text).join('\n'));
  } finally {
    const summary = {
      checkedAt: new Date().toISOString(),
      pass: checks.filter(item => item.ok).length,
      fail: checks.filter(item => !item.ok).length,
      checks,
      consoleRecords
    };
    fs.writeFileSync(path.join(outDir, 'blocks-stage-gallery-smoke-result.json'), JSON.stringify(summary, null, 2) + '\n');
    console.log('SUMMARY ' + summary.pass + ' passed, ' + summary.fail + ' failed');
    if (summary.fail) process.exitCode = 1;
    await browser.close().catch(() => {});
  }
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  if (browser) await browser.close().catch(() => {});
  process.exitCode = 1;
}
