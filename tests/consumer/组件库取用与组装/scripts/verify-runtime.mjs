/* 核对 runtime/ 与正式 dist；--sync 先逐字节刷新本测试副本。
   node scripts/verify-runtime.mjs [--sync] → 写 runtime/SOURCES.md 并报告 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, statSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIBRARY_ROOT, ownedPath } from './paths.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const LIB = LIBRARY_ROOT;
const sync = process.argv.includes('--sync');

const FILES = [
  ['runtime/modules/core.js', 'dist/modules/core.js'],
  ['runtime/modules/core.css', 'dist/modules/core.css'],
  ['runtime/modules/legacy.js', 'dist/modules/legacy.js'],
  ['runtime/modules/legacy.css', 'dist/modules/legacy.css'],
  ['runtime/modules/ui-layout.js', 'dist/modules/ui-layout.js'],
  ['runtime/modules/ui-layout.css', 'dist/modules/ui-layout.css'],
  ['runtime/modules/ui-content.js', 'dist/modules/ui-content.js'],
  ['runtime/modules/ui-content.css', 'dist/modules/ui-content.css'],
  ['runtime/modules/ui-navigation.js', 'dist/modules/ui-navigation.js'],
  ['runtime/modules/ui-navigation.css', 'dist/modules/ui-navigation.css'],
  ['runtime/modules/viz-objects.js', 'dist/modules/viz-objects.js'],
  ['runtime/modules/viz-objects.css', 'dist/modules/viz-objects.css'],
  ['runtime/modules/viz-mechanisms.js', 'dist/modules/viz-mechanisms.js'],
  ['runtime/modules/viz-mechanisms.css', 'dist/modules/viz-mechanisms.css'],
  ['runtime/modules/viz-chart.js', 'dist/modules/viz-chart.js'],
  ['runtime/modules/viz-chart.css', 'dist/modules/viz-chart.css'],
  ['runtime/modules/blocks.js', 'dist/modules/blocks.js'],
  ['runtime/modules/blocks.css', 'dist/modules/blocks.css'],
  ['runtime/THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
  ['runtime/licenses/KaTeX-LICENSE.txt', 'vendor/katex/LICENSE'],
  ['runtime/licenses/marked-LICENSE.txt', 'vendor/marked/LICENSE'],
  ['runtime/licenses/lucide-LICENSE.txt', 'vendor/lucide/LICENSE']
];

const hash = (buf) => createHash('sha256').update(buf).digest('hex');
const rows = [];
let allSame = true;

for (const [localRel, libRel] of FILES) {
  const localPath = ownedPath(localRel);
  const libPath = resolve(LIB, libRel);
  if (sync) {
    mkdirSync(dirname(localPath), { recursive: true });
    copyFileSync(libPath, localPath);
  }
  const local = readFileSync(localPath);
  const source = readFileSync(libPath);
  const same = hash(local) === hash(source);
  if (!same) allSame = false;
  rows.push({
    local: localRel.replace(/\\/g, '/'),
    source: libRel,
    bytes: local.length,
    sha256: hash(local),
    same,
    libMtime: statSync(libPath).mtime.toISOString()
  });
}

const lines = [
  '# runtime/ 来源与校验',
  '',
  '本目录中的模块文件是从正式组件库 `dist/modules/` 逐字节复制的运行副本，未做任何修改；',
  '`licenses/` 与 `THIRD_PARTY_NOTICES.md` 同样逐字节复制。',
  '',
  '| 本目录文件 | 正式库来源 | 字节 | SHA-256 | 与来源一致 |',
  '| --- | --- | --- | --- | --- |'
];
for (const r of rows) {
  lines.push(`| \`${r.local}\` | \`${r.source}\` | ${r.bytes} | \`${r.sha256}\` | ${r.same ? '是' : '否'} |`);
}
lines.push('', `核对时间：${new Date().toISOString()}`, '', `全部一致：${allSame ? '是' : '否'}`);
writeFileSync(resolve(root, 'runtime/SOURCES.md'), lines.join('\n') + '\n', 'utf8');

console.log(rows.map((r) => `${r.same ? 'OK  ' : 'DIFF'} ${r.local}  ${r.bytes}B  ${r.sha256.slice(0, 16)}`).join('\n'));
console.log('\n全部一致：' + (allSame ? '是' : '否'));
if (!allSame) process.exitCode = 1;
