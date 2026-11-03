/* 消费测试的运行时副本：测试准备时从当前 dist 临时生成到 tests/.cache/consumer-runtime。
 *
 * 不再维护长期 runtime/ 目录或 SOURCES.md；每次 prepare 先清空临时目录，再从
 * LIBRARY_ROOT/dist/modules + vendor 许可 + THIRD_PARTY_NOTICES 逐字节复制。
 *
 * 用法：
 *   node scripts/verify-runtime.mjs            # prepare：刷新 tests/.cache/consumer-runtime
 *   node scripts/verify-runtime.mjs --check    # 只核对临时副本是否仍与当前 dist 一致
 *   node scripts/verify-runtime.mjs --help
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIBRARY_ROOT, RUNTIME_MODULES, RUNTIME_ROOT } from './paths.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const DIST = resolve(LIBRARY_ROOT, 'dist');
const MODULES_DIR = join(DIST, 'modules');
const MANIFEST_FILE = join(RUNTIME_ROOT, 'SOURCES.json');
const LICENSES = [
  ['licenses/KaTeX-LICENSE.txt', 'vendor/katex/LICENSE'],
  ['licenses/marked-LICENSE.txt', 'vendor/marked/LICENSE'],
  ['licenses/lucide-LICENSE.txt', 'vendor/lucide/LICENSE']
];
const NOTICES = ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'];

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('消费测试 runtime 临时副本\n\n用法:\n  node scripts/verify-runtime.mjs            # prepare 到 tests/.cache/consumer-runtime\n  node scripts/verify-runtime.mjs --check    # 核对临时副本与当前 dist\n  node scripts/verify-runtime.mjs --help');
  process.exit(0);
}
if (args.includes('--sync')) {
  console.error('verify-runtime: --sync 已移除；默认 prepare 会刷新 tests/.cache/consumer-runtime（不再写长期 runtime/SOURCES.md）。');
  process.exit(2);
}
const mode = args.includes('--check') ? 'check' : args.includes('prepare') ? 'prepare' : 'prepare';
const unknown = args.filter((arg) => !['--check', 'prepare', '--help', '-h', '--sync'].includes(arg));
if (unknown.length) {
  console.error('verify-runtime: 未知参数 ' + unknown.join(' '));
  process.exit(2);
}

if (!existsSync(MODULES_DIR)) {
  console.error('verify-runtime: 找不到当前 dist/modules；请先构建 dist：' + MODULES_DIR);
  process.exit(1);
}

const moduleFiles = readdirSync(MODULES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(js|css)$/.test(entry.name))
  .map((entry) => 'modules/' + entry.name)
  .sort();
const files = [
  ...moduleFiles.map((rel) => [rel, 'dist/' + rel]),
  [NOTICES[0], NOTICES[1]],
  ...LICENSES
];

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function describe(rel) {
  const source = files.find((item) => item[0] === rel)[1];
  const sourcePath = resolve(LIBRARY_ROOT, source);
  const targetPath = join(RUNTIME_ROOT, rel);
  if (!existsSync(sourcePath)) return { rel, source, missingSource: true };
  const sourceBuf = readFileSync(sourcePath);
  const targetExists = existsSync(targetPath);
  const targetBuf = targetExists ? readFileSync(targetPath) : null;
  return {
    rel,
    source,
    bytes: sourceBuf.length,
    sha256: sha256(sourceBuf),
    targetSha256: targetBuf ? sha256(targetBuf) : null,
    same: !!targetBuf && targetBuf.length === sourceBuf.length && sha256(targetBuf) === sha256(sourceBuf),
    sourceMtime: statSync(sourcePath).mtime.toISOString()
  };
}

if (mode === 'prepare') {
  rmSync(RUNTIME_ROOT, { recursive: true, force: true });
  mkdirSync(RUNTIME_MODULES, { recursive: true });
  const rows = [];
  for (const [rel, source] of files) {
    const sourcePath = resolve(LIBRARY_ROOT, source);
    if (!existsSync(sourcePath)) {
      console.error('verify-runtime: 来源不存在：' + source);
      process.exit(1);
    }
    const targetPath = join(RUNTIME_ROOT, rel);
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(sourcePath, targetPath);
    const data = readFileSync(targetPath);
    rows.push({ rel, source, bytes: data.length, sha256: sha256(data) });
  }
  let distBuild = null;
  try {
    const registry = JSON.parse(readFileSync(resolve(LIBRARY_ROOT, 'registry.json'), 'utf8'));
    distBuild = registry.build ? { time: registry.build.time, mode: registry.build.mode, command: registry.build.command } : null;
  } catch (error) { distBuild = null; }
  writeFileSync(MANIFEST_FILE, JSON.stringify({
    generatedAt: new Date().toISOString(),
    sourceRoot: 'dist/modules + vendor licenses + THIRD_PARTY_NOTICES',
    distBuild: distBuild,
    files: rows.map((row) => ({ local: row.rel, source: row.source, bytes: row.bytes, sha256: row.sha256 }))
  }, null, 2) + '\n', 'utf8');
  console.log('prepared ' + rows.length + ' files → ' + RUNTIME_ROOT);
  for (const row of rows) console.log('OK   ' + row.rel + '  ' + row.bytes + 'B  ' + row.sha256.slice(0, 16) + '  <- ' + row.source);
  console.log('dist build: ' + (distBuild && distBuild.time ? distBuild.time + ' · ' + distBuild.command : 'unknown'));
  process.exit(0);
}

const rows = files.map(([rel]) => describe(rel));
const missing = rows.filter((row) => row.missingSource || !row.same);
for (const row of rows) {
  if (row.missingSource) console.log('MISS ' + row.rel + '  <- ' + row.source);
  else console.log((row.same ? 'OK   ' : 'DIFF ') + row.rel + '  ' + row.bytes + 'B  ' + row.sha256.slice(0, 16) + '  <- ' + row.source);
}
if (missing.length) {
  console.error('verify-runtime: ' + missing.length + ' 个文件与当前来源不一致或缺失；请重新运行 node scripts/verify-runtime.mjs。');
  process.exit(1);
}
console.log('all ' + rows.length + ' files match current dist/vendor/notices.');
