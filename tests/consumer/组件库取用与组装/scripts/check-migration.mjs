/* Focused verification after directory integration; not the original full suite. */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ROOT, ownedPath, generatedPageUrl, edgeExecutable, loadChromium } from './paths.mjs';

const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, executablePath: edgeExecutable() });
const evidence = ownedPath('evidence');
mkdirSync(evidence, { recursive: true });
const findings = [];
const errors = [];
const external = [];

async function openUrl(url, viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({ viewport });
  await context.route('**/*', route => route.request().url().startsWith('file:') ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (!request.url().startsWith('file:')) external.push(request.url()); });
  await page.goto(url);
  await page.waitForTimeout(200);
  return { context, page };
}

async function open(file, viewport) {
  return openUrl(pathToFileURL(ownedPath(file)).href, viewport);
}

async function openGenerated(id, viewport) {
  return openUrl(generatedPageUrl(id), viewport);
}

try {
  const a = await openGenerated('a');
  assert.equal(await a.page.locator('.katex').count(), 1);
  assert.equal(await a.page.locator('.nviz-matrix').count(), 2);
  assert.equal(await a.page.locator('.nviz-matrix tbody td').count(), 12);
  await a.page.getByRole('radio', { name: '示例二 · 3×2' }).click();
  const aValues = await a.page.locator('.nviz-matrix').first().locator('tbody td').allTextContents();
  assert.deepEqual(aValues.map(text => Number(text.replace(/关注/g, '').trim())), [7, 8, 9, 10, 11, 12]);
  await a.page.screenshot({ path: ownedPath('evidence/migration-a.png'), fullPage: true });
  findings.push('A 模块宿主：公式、矩阵与换数据正常');
  await a.context.close();

  const b = await openGenerated('b');
  const state = () => b.page.evaluate(() => window.__sceneB.state());
  assert.equal((await state()).sequence.join(''), 'abcde');
  await b.page.getByRole('button', { name: '下一步' }).click();
  await b.page.waitForTimeout(50);
  assert.equal(await b.page.locator('.nviz-sequence-edit__item--ghost').count(), 1);
  await b.page.waitForTimeout(650);
  assert.equal((await state()).sequence.join(''), 'abde');
  await b.page.getByRole('button', { name: '下一步' }).click();
  await b.page.waitForTimeout(700);
  assert.equal((await state()).sequence.join(''), 'aedb');
  const caption = (await state()).caption;
  await b.page.getByRole('button', { name: '重看' }).click();
  await b.page.waitForTimeout(1000);
  assert.equal((await state()).sequence.join(''), 'aedb');
  assert.equal((await state()).caption, caption);
  await b.page.getByRole('button', { name: '上一步' }).click();
  await b.page.waitForTimeout(700);
  assert.equal((await state()).sequence.join(''), 'abde');
  await b.page.getByRole('button', { name: '重来' }).click();
  await b.page.waitForTimeout(700);
  assert.equal((await state()).sequence.join(''), 'abcde');
  await b.page.getByRole('radio', { name: '长标签' }).click();
  assert.equal((await state()).dataset, 'long');
  await b.page.setViewportSize({ width: 700, height: 900 });
  await b.page.waitForTimeout(100);
  assert.equal(await b.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await b.page.screenshot({ path: ownedPath('evidence/migration-b-narrow.png') });
  findings.push('B 模块宿主：删除、交换、回退、重看、重来、换标签及700px窗口正常');
  await b.context.close();

  for (const file of ['01-矩阵转置.html', '02-序列变化.html']) {
    const built = await open(file);
    if (file.startsWith('01-')) assert.equal(await built.page.locator('.katex').count(), 1);
    else {
      await built.page.getByRole('button', { name: '下一步' }).click();
      await built.page.waitForTimeout(700);
      assert.equal(await built.page.evaluate(() => window.__sceneB.state().sequence.join('')), 'abde');
    }
    await built.context.close();
  }
  findings.push('两个自包含页面在禁止网络的上下文中正常打开和操作');
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'PASS', browser: browser.version(), findings, externalRequests: external.length, errors }, null, 2));
} finally {
  await browser.close();
}
