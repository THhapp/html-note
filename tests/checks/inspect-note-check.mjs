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
const frameShotFile = path.join(cacheDir, 'inspect-note-frame-check.png');
const unknownShotFile = path.join(cacheDir, 'inspect-note-unknown-frame.png');
const failingProbeFile = path.join(cacheDir, 'inspect-note-failing-probe.mjs');
const goArgProbeFile = path.join(cacheDir, 'inspect-note-go-arg-probe.mjs');
for (const file of [probeFile, shotFile, frameShotFile, unknownShotFile, failingProbeFile, goArgProbeFile]) {
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
  return await page.evaluate(() => {
    const state = window.ContinuousExample.session.getState();
    return {
      title: document.title,
      phase: state.phase,
      settledFrameId: state.settledFrameId,
      left: document.querySelector('[data-part="left"]').getAttribute('data-visual'),
      right: document.querySelector('[data-part="right"]').getAttribute('data-visual'),
      caption: (document.querySelector('.nblk-demo-stage__caption') || {}).textContent || ''
    };
  });
};
`, 'utf8');

fs.writeFileSync(goArgProbeFile, `export default async ({ inspect }) => {
  const attempts = [];
  const cases = [
    ['array', ['right-again']],
    ['null', null],
    ['empty', ''],
    ['number', 3]
  ];
  for (const item of cases) {
    try {
      const outcome = await inspect.step('go', item[1]);
      attempts.push({ label: item[0], threw: false, outcome: outcome });
    } catch (error) {
      attempts.push({ label: item[0], threw: true, code: error.code || null, message: String(error.message || error) });
    }
  }
  const afterInvalid = await inspect.state();
  const valid = await inspect.step('go', 'initial');
  return {
    attempts: attempts,
    afterInvalid: afterInvalid,
    valid: valid,
    validKeys: Object.keys(valid).sort()
  };
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
  expect(help.status === 0 && /--probe/.test(help.stdout) && /--screenshot/.test(help.stdout) &&
    /--frame/.test(help.stdout) && /--frame "right-again"/.test(help.stdout) && /不自动安装/.test(help.stdout),
    'inspect-note --help 给出实际参数（含 --frame）与环境边界');

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

  /* --frame：已知 Frame 先恢复并确认落位，再截图/probe。 */
  const framed = run([example, '--json', '--width', '860', '--height', '700',
    '--session', 'window.ContinuousExample.session', '--frame', 'right-again',
    '--probe', probeFile, '--screenshot', frameShotFile]);
  let framedData = null;
  try { framedData = JSON.parse(framed.stdout); } catch (error) { /* 下面统一报错 */ }
  expect(framed.status === 0 && framedData && framedData.ok === true &&
    framedData.requestedFrameId === 'right-again' && framedData.actualFrameId === 'right-again' &&
    framedData.sessionStatus === 'settled' && framedData.result && framedData.result.status === 'completed' &&
    framedData.phase === 'idle' && framedData.settledFrameId === 'right-again',
    '--frame 恢复已知 Frame 并在 JSON 报告 requested/actual/sessionStatus/result/phase/settledFrameId',
    framed.stdout.slice(0, 600));
  expect(framedData && framedData.probe && framedData.probe.settledFrameId === 'right-again' &&
    framedData.probe.phase === 'idle' && framedData.probe.left === 'B' && framedData.probe.right === 'E' &&
    /连续推进/.test(framedData.probe.caption),
    '--frame 先恢复停点再执行 probe（probe 读到目标 Frame 与终态画面）', JSON.stringify(framedData && framedData.probe));
  expect(fs.existsSync(frameShotFile) && fs.statSync(frameShotFile).size > 100 &&
    fs.readFileSync(frameShotFile).slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    '--frame 在恢复落位后截图（有效 PNG）');

  /* --frame：未知 Frame 明确失败，且不执行截图/probe。 */
  const unknownFrame = run([example, '--json', '--frame', 'no-such-frame',
    '--probe', probeFile, '--screenshot', unknownShotFile]);
  let unknownData = null;
  try { unknownData = JSON.parse(unknownFrame.stdout); } catch (error) { /* 下面统一报错 */ }
  expect(unknownFrame.status === 1 && unknownData && unknownData.ok === false &&
    unknownData.error && /no-such-frame/.test(unknownData.error.message) &&
    unknownData.requestedFrameId === 'no-such-frame' && unknownData.actualFrameId === 'initial' &&
    unknownData.sessionStatus === 'settled' && unknownData.result && unknownData.result.status === 'failed' &&
    unknownData.phase === 'error' && unknownData.settledFrameId === 'initial' &&
    unknownData.probe === null && !fs.existsSync(unknownShotFile),
    '--frame 未知 Frame 明确失败且恢复未落位时不截图/probe（不默默停在初态）', unknownFrame.stdout.slice(0, 700));

  /* --frame 参数诊断：缺值、重复、--frame 与坏 session 组合。 */
  const missingFrame = run([example, '--frame']);
  expect(missingFrame.status === 2 && /--frame/.test(missingFrame.stderr + missingFrame.stdout) &&
    /right-again/.test(missingFrame.stderr + missingFrame.stdout),
    '--frame 缺值给出 usage 与正确示例', (missingFrame.stderr || missingFrame.stdout).slice(0, 400));
  const repeatedFrame = run([example, '--frame', 'initial', '--frame', 'right-again', '--json']);
  let repeatedData = null;
  try { repeatedData = JSON.parse(repeatedFrame.stdout); } catch (error) { /* 下面统一报错 */ }
  expect(repeatedFrame.status === 2 && repeatedData && repeatedData.error && repeatedData.error.code === 'usage' &&
    /只接受一个/.test(repeatedData.error.message),
    '--frame 只接受一个 Frame ID', repeatedFrame.stdout.slice(0, 300));
  const badFrameSession = run([example, '--frame', 'initial', '--session', 'window.Nope', '--json', '--screenshot', unknownShotFile]);
  let badFrameSessionData = null;
  try { badFrameSessionData = JSON.parse(badFrameSession.stdout); } catch (error) { /* 下面统一报错 */ }
  expect(badFrameSession.status === 1 && badFrameSessionData && badFrameSessionData.ok === false &&
    badFrameSessionData.error && badFrameSessionData.error.code === 'invalid_session' &&
    /window\.Nope/.test(badFrameSessionData.error.message) && !fs.existsSync(unknownShotFile),
    '--frame 与不可用 --session 组合时明确 invalid_session 且不截图', badFrameSession.stdout.slice(0, 500));

  /* inspect.start/step('go') 参数诊断：数组/null/空串/非字符串立即 usage，合法 go 保留字段与 navigation。 */
  const goArgs = run([example, '--json', '--session', 'window.ContinuousExample.session', '--probe', goArgProbeFile]);
  let goArgsData = null;
  try { goArgsData = JSON.parse(goArgs.stdout); } catch (error) { /* 下面统一报错 */ }
  const attempts = goArgsData && goArgsData.probe && Array.isArray(goArgsData.probe.attempts) ? goArgsData.probe.attempts : [];
  const invalidAttempts = attempts.filter((attempt) => attempt.label !== 'valid');
  expect(goArgs.status === 0 && attempts.length === 4 &&
    attempts.every((attempt) => attempt.threw === true && attempt.code === 'usage' && /start\('go', frameId\)/.test(attempt.message)) &&
    goArgsData.probe.afterInvalid && goArgsData.probe.afterInvalid.phase === 'idle' &&
    goArgsData.probe.afterInvalid.settledFrameId === 'initial',
    'inspect.start/step(\'go\') 对数组/null/空串/非字符串立即 usage 且不触发导航',
    goArgs.stdout.slice(0, 700));
  const validGo = goArgsData && goArgsData.probe ? goArgsData.probe.valid : null;
  expect(validGo && validGo.action === 'go' && validGo.status === 'settled' &&
    validGo.requestedFrameId === 'initial' && validGo.actualFrameId === 'initial' &&
    validGo.phase === 'idle' && validGo.navigation && validGo.navigation.ok === true &&
    typeof validGo.wallMs === 'number' && typeof validGo.elapsedMs === 'number' &&
    goArgsData.probe.validKeys.includes('result') && goArgsData.probe.validKeys.includes('message'),
    '合法 go 保留既有字段并额外给出 requested/actual/phase/navigation（settled≠导航成功）',
    JSON.stringify(validGo).slice(0, 600));

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
  if (fs.existsSync(frameShotFile)) fs.rmSync(frameShotFile, { force: true });
  if (fs.existsSync(unknownShotFile)) fs.rmSync(unknownShotFile, { force: true });
  if (fs.existsSync(goArgProbeFile)) fs.rmSync(goArgProbeFile, { force: true });
}

console.log('SUMMARY ' + passes + '/' + (passes + failures.length) + ' passed');
if (failures.length) {
  console.error('\n' + failures.join('\n'));
  process.exit(1);
}
