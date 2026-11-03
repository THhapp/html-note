#!/usr/bin/env node
/*
 * Skill 独立使用检查：复制到仓库外，确认自身说明/参考完整，
 * 只通过 --root 薄调用库查询与观察工具，不依赖项目 docs 或同步脚本。
 * 用法：node tests/checks/skill-independent-check.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(root, 'skills', 'html-note-authoring');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'html-note-skill-'));
const target = path.join(temp, 'html-note-authoring');
let passes = 0;
const failures = [];
function check(ok, name, detail) {
  if (ok) { passes += 1; console.log('PASS  ' + name); }
  else { failures.push(name); console.log('FAIL  ' + name + (detail == null ? '' : ' :: ' + String(detail).slice(0, 400))); }
}
function run(args, cwd) {
  return spawnSync(process.execPath, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 60000 });
}
try {
  fs.cpSync(source, target, { recursive: true });
  const query = path.join(target, 'scripts', 'query.mjs');
  const inspect = path.join(target, 'scripts', 'inspect-note.mjs');
  check(fs.existsSync(query) && fs.existsSync(inspect), 'Skill 复制后有 query/inspect 薄脚本');
  check(!fs.existsSync(path.join(target, 'scripts', 'sync-references.mjs')), 'Skill 不再携带 docs 同步脚本');

  const info = run([query, 'info', '--root', root, '--json'], target);
  let infoData = null;
  try { infoData = JSON.parse(info.stdout); } catch (error) { /* 下面统一报错 */ }
  check(info.status === 0 && infoData && infoData.ok === true && infoData.library.components === 105 && infoData.library.totalEntries === 125,
    '仓库外 Skill 可通过 --root 调用真实查询', info.stderr || (info.stdout || '').slice(0, 300));
  check(infoData && infoData.docs && infoData.docs.queryEntries === 'scripts/query/entries.mjs' && !infoData.docs.corpus,
    '查询信息来自程序数据，不指向旧语料 MD', JSON.stringify(infoData && infoData.docs));

  const show = run([query, 'show', 'public:continuous-adapter', '--root', root, '--json'], target);
  let showData = null;
  try { showData = JSON.parse(show.stdout); } catch (error) { /* 下面统一报错 */ }
  const entry = showData && showData.entries && showData.entries[0];
  const guide = entry && (entry.resources || []).find((item) => item.key === 'guide');
  const guideFile = guide && path.join(root, guide.path);
  check(show.status === 0 && showData && showData.ok === true && guide && fs.existsSync(guideFile) && guide.anchor === 'author-custom-scene',
    'Skill 查询可直接定位合并后的接入文档章节', JSON.stringify(guide));

  const help = run([inspect, '--help'], target);
  check(help.status === 0 && /--frame/.test(help.stdout) && /--root/.test(help.stdout),
    '仓库外 inspect 薄脚本可独立显示帮助并说明 --root', help.stderr || (help.stdout || '').slice(0, 300));

  const mdFiles = [];
  function walk(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) walk(file);
      else if (/\.md$/i.test(item.name)) mdFiles.push(file);
    }
  }
  walk(target);
  let localLinks = 0;
  let badLinks = [];
  for (const file of mdFiles) {
    const text = fs.readFileSync(file, 'utf8');
    if (/\.\.\/\.\.\/|docs\/查询|sync-references|同步自.*docs/.test(text)) badLinks.push(path.relative(target, file) + ' 含 docs/同步依赖');
    for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const href = match[1].split('#')[0];
      if (!href || /^https?:/i.test(href)) continue;
      localLinks += 1;
      if (!fs.existsSync(path.resolve(path.dirname(file), href))) badLinks.push(path.relative(target, file) + ' -> ' + match[1]);
    }
  }
  check(mdFiles.length >= 5 && localLinks >= 3 && badLinks.length === 0, 'Skill 参考内部相对链接完整，不依赖项目 docs', badLinks.slice(0, 6).join('; '));

  const refs = fs.readdirSync(path.join(target, 'references')).filter((name) => name.endsWith('.md'));
  check(refs.includes('principles.md') && refs.includes('task-brief.md') && refs.includes('library-usage.md') && refs.includes('validation.md'),
    'Skill 参考覆盖原则、底稿、取用与验证', refs.join(','));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
console.log('SUMMARY ' + passes + '/' + (passes + failures.length) + ' passed');
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
