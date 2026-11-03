/* Consumer-test paths are relative to this task, not a private checkout. */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute, sep, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const LIBRARY_ROOT = resolve(ROOT, '..', '..', '..');
/* 运行时副本与生成页面只在 tests/.cache 临时存在：由 scripts/verify-runtime.mjs
 * 从当前 dist/modules + vendor 许可 + THIRD_PARTY_NOTICES 生成，不长期提交。 */
export const CACHE_ROOT = resolve(LIBRARY_ROOT, 'tests', '.cache');
export const RUNTIME_ROOT = resolve(CACHE_ROOT, 'consumer-runtime');
export const RUNTIME_MODULES = resolve(RUNTIME_ROOT, 'modules');
export const GENERATED_ROOT = resolve(CACHE_ROOT, 'consumer-pages');

export function generatedPage(id) {
  if (id !== 'a' && id !== 'b') throw new Error('generatedPage(id) 只接受 a/b，收到：' + id);
  return resolve(GENERATED_ROOT, 'page-' + id + '.html');
}

export function generatedPageUrl(id) {
  return pathToFileURL(generatedPage(id)).href;
}

export function requireGeneratedPages() {
  for (const id of ['a', 'b']) {
    if (!existsSync(generatedPage(id))) {
      throw new Error('缺少生成页面 ' + generatedPage(id) +
        '；请先运行 node scripts/verify-runtime.mjs 与 node scripts/build-pages.mjs（在 ' + ROOT + ' 下）。');
    }
  }
}

export function ownedPath(value) {
  const target = resolve(ROOT, value);
  const rel = relative(ROOT, target);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
    throw new Error('Test output must stay inside its working directory: ' + target);
  }
  return target;
}

export function edgeExecutable() {
  const explicit = process.env.NOTE_TEST_BROWSER || process.env.EDGE_PATH;
  const candidates = explicit ? [resolve(explicit)] : [
    process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.ProgramFiles && join(process.env.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
  ].filter(Boolean);
  const executable = candidates.find(existsSync);
  if (!executable) throw new Error('Installed Edge not found; set NOTE_TEST_BROWSER to its executable.');
  return executable;
}

export async function loadChromium() {
  const driver = resolve(LIBRARY_ROOT, 'tests', 'tools', 'node_modules', 'playwright-core', 'index.mjs');
  if (!existsSync(driver)) throw new Error('Missing test driver: install the dependencies in tests/tools first.');
  const temp = ownedPath('evidence/browser-profile-temp');
  mkdirSync(temp, { recursive: true });
  process.env.TEMP = temp;
  process.env.TMP = temp;
  return (await import(pathToFileURL(driver).href)).chromium;
}
