#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveLibraryRoot } from './query.mjs';

const scriptFile = fileURLToPath(import.meta.url);

function stripRoot(args) {
  const out = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--root') { i += 1; continue; }
    if (args[i].startsWith('--root=')) continue;
    out.push(args[i]);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptFile) {
  const args = process.argv.slice(2);
  try {
    const root = resolveLibraryRoot(args);
    const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'inspect-note.mjs'), ...stripRoot(args)], {
      stdio: 'inherit',
      windowsHide: true
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (error) {
    if (args.includes('--json')) console.log(JSON.stringify({ ok: false, tool: 'inspect-note', error: { code: 'library_unavailable', message: error.message } }));
    else console.error(error.message);
    process.exitCode = 1;
  }
}
