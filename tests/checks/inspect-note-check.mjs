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
const selectorDir = path.join(cacheDir, 'inspect 中文 路径');
const selectorShotFile = path.join(selectorDir, '元素 截图.png');
const spacePageFile = path.join(selectorDir, '预览 页面.html');
const spaceProbeFile = path.join(selectorDir, '空格 probe.mjs');
fs.rmSync(selectorDir, { recursive: true, force: true });
fs.mkdirSync(selectorDir, { recursive: true });
fs.copyFileSync(path.join(root, 'dist', '连续画面局部变化-预览.html'), spacePageFile);
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

fs.writeFileSync(spaceProbeFile, `export default async ({ page }) => {
  await page.waitForFunction(() => window.ContinuousExample && window.ContinuousExample.session);
  return await page.evaluate(() => ({ title: document.title, hasStage: !!document.querySelector('.nblk-demo-stage') }));
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
function run(args, cwd = root) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: cwd, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '', error: result.error };
}

try {
  const help = run(['--help']);
  expect(help.status === 0 && /--probe/.test(help.stdout) && /--screenshot/.test(help.stdout) &&
    /--frame/.test(help.stdout) && /--selector/.test(help.stdout) && /--selector-index/.test(help.stdout) &&
    /--frame "right-again"/.test(help.stdout) && /step\('go', 'frame-id'\)/.test(help.stdout) &&
    /静态停点/.test(help.stdout) && /next\(\).*replay\(\)|replay\(\).*观察/.test(help.stdout) &&
    /当前工作目录/.test(help.stdout) && /不自动安装/.test(help.stdout),
    'inspect-note --help 给出 --frame/--selector 用法、go 字符串参数、静态停点/过程观察与路径基准');
  const helpOutside = run(['--help'], selectorDir);
  expect(helpOutside.status === 0 && /inspect-note/.test(helpOutside.stdout) && !helpOutside.stderr,
    '--help 从工程外只显示帮助（不读页面/模板）', helpOutside.stderr || helpOutside.stdout.slice(0, 300));

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

  /* --selector：唯一/无截图状态/缺失/多个/下标，以及中文+空格路径。 */
  const selectorShot = run([example, '--json', '--selector', '.nblk-demo-stage', '--screenshot', selectorShotFile]);
  let selectorShotData = null;
  try { selectorShotData = JSON.parse(selectorShot.stdout); } catch (error) { /* 下面统一报错 */ }
  expect(selectorShot.status === 0 && selectorShotData && selectorShotData.ok === true &&
    selectorShotData.selector === '.nblk-demo-stage' && selectorShotData.element &&
    selectorShotData.element.count === 1 && selectorShotData.element.visible === true &&
    selectorShotData.element.box.width > 0 && selectorShotData.element.tagName === 'section' &&
    fs.existsSync(selectorShotFile) && fs.readFileSync(selectorShotFile).slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    '--selector 唯一选择器截取指定元素并返回元素状态（有效 PNG）', selectorShot.stdout.slice(0, 600));
  const selectorOnly = run([example, '--json', '--selector', '.nblk-demo-stage']);
  let selectorOnlyData = null;
  try { selectorOnlyData = JSON.parse(selectorOnly.stdout); } catch (error) { /* 下面统一报错 */ }
  expect(selectorOnly.status === 0 && selectorOnlyData && selectorOnlyData.screenshot === null &&
    selectorOnlyData.element && selectorOnlyData.element.count === 1 && Number.isFinite(selectorOnlyData.element.box.top),
    '--selector 未指定 --screenshot 时只返回元素状态', selectorOnly.stdout.slice(0, 500));
  const missingSelector = run([example, '--json', '--selector', '.no-such-selector']);
  let missingSelectorData = null;
  try { missingSelectorData = JSON.parse(missingSelector.stdout); } catch (error) { /* 下面统一报错 */ }
  expect(missingSelector.status === 1 && missingSelectorData && missingSelectorData.error &&
    missingSelectorData.error.code === 'selector_not_found' &&
    /no-such-selector/.test(missingSelectorData.error.message) &&
    missingSelectorData.error.message.includes(example) &&
    /--selector-index|--help/.test(missingSelectorData.error.message),
    '--selector 不存在时明确错误（含选择器、页面文件、下一步）', missingSelector.stdout.slice(0, 700));
  const multiSelector = run([example, '--json', '--selector', 'div']);
  let multiSelectorData = null;
  try { multiSelectorData = JSON.parse(multiSelector.stdout); } catch (error) { /* 下面统一报错 */ }
  expect(multiSelector.status === 1 && multiSelectorData && multiSelectorData.error &&
    multiSelectorData.error.code === 'selector_not_unique' &&
    /--selector-index 0\.\./.test(multiSelectorData.error.message),
    '--selector 命中多个时明确报错并建议 --selector-index', multiSelector.stdout.slice(0, 600));
  const indexedSelector = run([example, '--json', '--selector', 'div', '--selector-index', '2']);
  let indexedSelectorData = null;
  try { indexedSelectorData = JSON.parse(indexedSelector.stdout); } catch (error) { /* 下面统一报错 */ }
  expect(indexedSelector.status === 0 && indexedSelectorData && indexedSelectorData.selectorIndex === 2 &&
    indexedSelectorData.element && indexedSelectorData.element.index === 2 && indexedSelectorData.element.count > 2,
    '--selector-index 指定多个命中中的元素', indexedSelector.stdout.slice(0, 500));
  const indexWithoutSelector = run([example, '--selector-index', '0', '--json']);
  expect(indexWithoutSelector.status === 2 && /--selector-index/.test(indexWithoutSelector.stderr + indexWithoutSelector.stdout),
    '--selector-index 不能脱离 --selector 使用', (indexWithoutSelector.stderr || indexWithoutSelector.stdout).slice(0, 300));
  const spaceSelector = run([spacePageFile, '--json', '--selector', 'body', '--screenshot', path.join(selectorDir, '空间 截图.png')]);
  let spaceSelectorData = null;
  try { spaceSelectorData = JSON.parse(spaceSelector.stdout); } catch (error) { /* 下面统一报错 */ }
  expect(spaceSelector.status === 0 && spaceSelectorData && spaceSelectorData.ok === true &&
    spaceSelectorData.element && spaceSelectorData.element.count === 1 && spaceSelectorData.element.tagName === 'body' &&
    fs.existsSync(path.join(selectorDir, '空间 截图.png')),
    '中文+空格页面/截图路径可用', spaceSelector.stdout.slice(0, 500));
  const spaceProbe = run([example, '--json', '--probe', spaceProbeFile]);
  let spaceProbeData = null;
  try { spaceProbeData = JSON.parse(spaceProbe.stdout); } catch (error) { /* 下面统一报错 */ }
  expect(spaceProbe.status === 0 && spaceProbeData && spaceProbeData.probe && spaceProbeData.probe.hasStage === true &&
    /连续画面/.test(spaceProbeData.probe.title || ''),
    '中文+空格 probe 路径可用', spaceProbe.stdout.slice(0, 500));

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
  if (fs.existsSync(selectorDir)) fs.rmSync(selectorDir, { recursive: true, force: true });
}

console.log('SUMMARY ' + passes + '/' + (passes + failures.length) + ' passed');
if (failures.length) {
  console.error('\n' + failures.join('\n'));
  process.exit(1);
}
