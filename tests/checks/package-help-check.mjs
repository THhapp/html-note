#!/usr/bin/env node
/*
 * package.ps1 帮助检查：-Help / -? 只显示帮助，不读取、不创建、不覆盖任何 ZIP。
 * 同时核对帮助包含输入根、默认输出、必含清单来源与“正文导航 vs 加载资源”说明。
 *
 * Usage: node tests/checks/package-help-check.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const script = path.join(root, 'scripts', 'package.ps1');
const zip = path.join(root, 'dist', '公共编排层-整合候选.zip');
const cacheDir = path.join(root, 'tests', '.cache');
fs.mkdirSync(cacheDir, { recursive: true });
const notPacked = path.join(cacheDir, 'package-help-should-not-exist.zip');
if (fs.existsSync(notPacked)) fs.rmSync(notPacked, { force: true });

let passes = 0;
const failures = [];
function expect(condition, message, detail) {
  if (condition) { passes += 1; console.log('PASS  ' + message); }
  else { failures.push(message); console.log('FAIL  ' + message + (detail == null ? '' : ' :: ' + String(detail).slice(0, 700))); }
}
function zipState() {
  if (!fs.existsSync(zip)) return null;
  const buffer = fs.readFileSync(zip);
  return { bytes: buffer.length, hash: createHash('sha256').update(buffer).digest('hex'), mtime: fs.statSync(zip).mtimeMs };
}
function pwshCandidates() {
  return [process.env.DSH_PWSH, 'pwsh', 'C:/Program Files/PowerShell/7/pwsh.exe', 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'].filter(Boolean);
}
function runHelp(flag, extra = []) {
  const args = ['-NoProfile', '-File', script, flag, ...extra];
  let last = null;
  for (const executable of pwshCandidates()) {
    const result = spawnSync(executable, args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000 });
    if (!result.error) return { executable, status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
    last = result.error;
  }
  return { executable: null, status: null, stdout: '', stderr: '无法启动 pwsh：' + String(last && last.message || last) };
}

try {
  const before = zipState();
  const help = runHelp('-Help');
  const qmark = runHelp('-?');
  const helpWithOutput = runHelp('-Help', ['-Output', notPacked]);
  const after = zipState();
  expect(help.status === 0 && !help.stderr, 'package.ps1 -Help 以 0 退出且无错误', help.stderr);
  expect(qmark.status === 0 && !qmark.stderr, 'package.ps1 -? 以 0 退出且无错误', qmark.stderr);
  expect(JSON.stringify(before) === JSON.stringify(after) && !fs.existsSync(notPacked),
    '-Help/-?/-Help -Output 未读取、创建或覆盖 ZIP',
    JSON.stringify({ before, after, notPackedExists: fs.existsSync(notPacked) }));
  const helpText = help.stdout + help.stderr;
  const required = [
    ['用法/参数', /-Help/],
    ['输入根', /输入根/],
    ['默认输出', /公共编排层-整合候选\.zip/],
    ['必含清单来源', /src\/manifests/],
    ['正文导航 vs 加载资源', /正文导航[\s\S]*加载资源|页面加载资源/],
    ['不打包声明', /不读取、不创建、不覆盖/],
    ['自定义输出', /-Output/]
  ];
  for (const [label, pattern] of required) {
    expect(pattern.test(helpText), '帮助包含：' + label, helpText.slice(0, 800));
  }
  expect(!/"Package"\s*:/.test(helpText), '-Help 输出不是打包结果 JSON', helpText.slice(-300));
} finally {
  if (fs.existsSync(notPacked)) fs.rmSync(notPacked, { force: true });
}

console.log('SUMMARY ' + passes + '/' + (passes + failures.length) + ' passed');
if (failures.length) process.exitCode = 1;
