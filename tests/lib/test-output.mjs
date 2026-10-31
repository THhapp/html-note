/*!
 * Output locations for the browser checks.
 *
 * Generated artifacts (screenshots, logs, result JSON, temporary build copies)
 * belong in tests/.cache, which package.ps1 excludes from the distributable
 * archive. Source fixtures (HTML harnesses, .mjs suites, input JSON) stay where
 * they are next to the check that consumes them.
 *
 * Tooling only; these helpers create directories but never delete anything.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Absolute path of a directory under tests/.cache (created when needed). */
export function cacheDir(root, ...parts) {
  const dir = path.join(root, 'tests', '.cache', ...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Absolute path of a file under tests/.cache (parent directory created). */
export function cacheFile(root, ...parts) {
  const file = path.join(root, 'tests', '.cache', ...parts);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

/** Write generated JSON under tests/.cache. */
export function writeCacheJson(root, parts, value) {
  const list = Array.isArray(parts) ? parts : [parts];
  const file = cacheFile(root, ...list);
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
  return file;
}
