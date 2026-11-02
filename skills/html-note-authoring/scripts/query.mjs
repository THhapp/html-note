#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptFile = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptFile);

function isLibrary(root) {
  return fs.existsSync(path.join(root, 'scripts', 'query.mjs')) &&
    fs.existsSync(path.join(root, 'src', 'manifests'));
}

export function resolveLibraryRoot(args = []) {
  let explicit;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--root') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('--root 需要库目录。');
      explicit = args[++i];
    } else if (args[i].startsWith('--root=')) {
      explicit = args[i].slice('--root='.length);
    }
  }
  if (explicit !== undefined) {
    if (!explicit) throw new Error('--root 需要库目录。');
    const root = path.resolve(explicit);
    if (!isLibrary(root)) throw new Error('指定目录没有 html-note 查询入口与源清单：' + root);
    return root;
  }

  const adjacent = path.resolve(scriptDir, '..', '..', '..');
  if (isLibrary(adjacent)) return adjacent;

  let current = process.cwd();
  while (true) {
    if (isLibrary(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error('未定位到 html-note 库。请使用任务中给出的库目录，并添加 --root <库目录>。');
}

function report(error, args) {
  if (args.includes('--json')) {
    console.log(JSON.stringify({ ok: false, error: { code: 'library_unavailable', message: error.message } }));
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptFile) {
  const args = process.argv.slice(2);
  try {
    const root = resolveLibraryRoot(args);
    const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'query.mjs'), ...args], {
      stdio: 'inherit',
      windowsHide: true
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (error) {
    report(error, args);
  }
}
