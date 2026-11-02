#!/usr/bin/env node
/*
 * 本地观察入口检查：真实进程调用、probe 复用页面、显式截图、缺失浏览器诊断。
 * 只打开最小示例，不做全库浏览器矩阵。
 *
 * Usage: node tests/checks/inspect-note-check.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const cli = path.join(root, 'scripts', 'inspect-note.mjs');
const example = path.join(root, 'examples', 'continuous-scene', 'index.html');
const cacheDir = path.join(root, 'tests', '.cache');
fs.mkdirSync(cacheDir, { recursive: true });
const probeFile = path.join(cacheDir, 'inspect-note-probe.mjs');
const shotFile = path.join(cacheDir, 'inspect-note-check.png');
const failingProbeFile = path.join(cacheDir, 'inspect-note-failing-probe.mjs');
for (const file of [probeFile, shotFile, failingProbeFile]) {
  if (fs.existsSync(file)) fs.rmSync(file, { force: true });
}
fs.writeFileSync(failingProbeFile, `export default async ({ page }) => {
  await page.evaluate(() => {
    console.error('probe-console-error');
    setTimeout(() => { throw new Error('probe-page-error'); }, 0);
  });
  await page.waitForTimeout(20);
  throw new Error('probe intentional failure');
};
`, 'utf8');

fs.writeFileSync(probeFile, `export default async ({ page }) => {
  await page.waitForFunction(() => window.ContinuousExample && window.ContinuousExample.session);
  return await page.evaluate(() => ({
    title: document.title,
    phase: window.ContinuousExample.session.getState().phase,
    left: document.querySelector('[data-part="left"]').getAttribute('data-visual'),
    right: document.querySelector('[data-part="right"]').getAttribute('data-visual')
  }));
};
`, 'utf8');

let passes = 0;
const failures = [];
function expect(condition, message, detail) {
  if (condition) { passes += 1; console.log('PASS  ' + message); }
  else { failures.push(message); console.log('FAIL  ' + message + (detail == null ? '' : ' :: ' + String(detail).slice(0, 500))); }
}
function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '', error: result.error };
}

try {
  const help = run(['--help']);
  expect(help.status === 0 && /--probe/.test(help.stdout) && /--screenshot/.test(help.stdout) && /不自动安装/.test(help.stdout),
    'inspect-note --help 给出实际参数与环境边界');

  const observed = run([example, '--json', '--width', '860', '--height', '700', '--probe', probeFile, '--screenshot', shotFile]);
  let data = null;
  try { data = JSON.parse(observed.stdout); } catch (error) { /* 下面统一报错 */ }
  expect(observed.status === 0 && data && data.ok === true && data.tool === 'inspect-note' &&
    data.viewport.width === 860 && data.viewport.height === 700,
    'inspect-note 真实打开本地成品并返回指定视口', observed.stderr || observed.stdout.slice(0, 300));
  expect(data && data.observations && data.observations.errorCount === 0 &&
    data.observations.externalRequestCount === 0,
    'inspect-note 区分并报告页面错误/控制台错误/外部请求', JSON.stringify(data && data.observations));
  expect(data && data.probe && data.probe.phase === 'idle' && data.probe.left === 'A' && data.probe.right === 'C',
    '--probe 复用同一页面并取得示例状态', JSON.stringify(data && data.probe));
  expect(fs.existsSync(shotFile) && fs.statSync(shotFile).size > 100 && fs.readFileSync(shotFile).slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    '--screenshot 只在显式请求时写出有效 PNG');

  const failedProbe = run([example, '--json', '--probe', failingProbeFile]);
  let failedData = null;
  try { failedData = JSON.parse(failedProbe.stdout); } catch (error) { /* 下面统一报错 */ }
  expect(failedProbe.status === 1 && failedData && failedData.ok === false && failedData.error.code === 'probe_failed' &&
    failedData.observations && failedData.observations.consoleErrors.some((item) => /probe-console-error/.test(item.text)) &&
    failedData.observations.pageErrors.some((item) => /probe-page-error/.test(item.message)),
    'probe 失败时保留 probe 期间产生的页面/控制台观察事实', failedProbe.stdout.slice(0, 500));

  const missingBrowser = run([example, '--json', '--browser', path.join(cacheDir, 'no-such-browser.exe')]);
  let missingData = null;
  try { missingData = JSON.parse(missingBrowser.stdout); } catch (error) { /* 下面统一报错 */ }
  expect(missingBrowser.status === 1 && missingData && missingData.ok === false && missingData.error.code === 'missing_browser' &&
    /不自动安装/.test(missingData.error.message),
    '缺少浏览器时给出具体诊断，不自动安装或轮换通道', missingBrowser.stdout.slice(0, 300));

  const invalidEntry = run([path.join(cacheDir, 'no-such-note.html'), '--json']);
  let invalidData = null;
  try { invalidData = JSON.parse(invalidEntry.stdout); } catch (error) { /* 下面统一报错 */ }
  expect(invalidEntry.status === 1 && invalidData && invalidData.ok === false && invalidData.error.code === 'invalid_entry',
    '不存在的本地成品明确失败');

} finally {
  // 同步清理，避免把测试输出文件留成默认产物
  if (fs.existsSync(probeFile)) fs.rmSync(probeFile, { force: true });
  if (fs.existsSync(shotFile)) fs.rmSync(shotFile, { force: true });
  if (fs.existsSync(failingProbeFile)) fs.rmSync(failingProbeFile, { force: true });
}

console.log('SUMMARY ' + passes + '/' + (passes + failures.length) + ' passed');
if (failures.length) {
  console.error('\n' + failures.join('\n'));
  process.exit(1);
}
