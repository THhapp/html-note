/* Consumer-test paths are relative to this task, not a private checkout. */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute, sep, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const LIBRARY_ROOT = resolve(ROOT, '..', '..', '..');

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
