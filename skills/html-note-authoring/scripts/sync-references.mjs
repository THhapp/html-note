#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveLibraryRoot } from './query.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function libraryLinks(text) {
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (whole, label, target) => {
    if (/^(?:https?:|#)/.test(target)) return whole;
    const resource = path.posix.normalize('docs/' + target);
    return '`' + resource + '`（' + label + '）';
  });
}

function sectionStart(text, title) {
  const lines = text.split('\n');
  let offset = 0;
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      const heading = line.replace(/^##\s+(?:\d+\.\s*)?/, '').trim();
      if (heading === title) return offset;
    }
    offset += line.length + 1;
  }
  throw new Error('提示词维护源缺少章节：' + title);
}

try {
  const root = resolveLibraryRoot(process.argv.slice(2));
  const principles = fs.readFileSync(path.join(root, 'docs', '设计共识.md'), 'utf8').replace(/\r\n/g, '\n');
  const prompt = fs.readFileSync(path.join(root, 'docs', '提示词撰写.md'), 'utf8').replace(/\r\n/g, '\n');
  const start = sectionStart(prompt, '通用制作底稿');
  const end = sectionStart(prompt, '维护分寸');
  const validationStart = sectionStart(prompt, '验证与观察');
  if (end <= start || validationStart <= end) throw new Error('提示词维护源章节顺序不正确。');

  const principleBody = libraryLinks(principles.replace(/^# 设计共识\s*/, ''));
  const taskBody = libraryLinks(prompt.slice(start, end).trim());
  const validationBody = libraryLinks(prompt.slice(validationStart).trim());
  const outputs = [
    ['principles.md', '# 阅读与演示共识\n\n正文同步自库内 `docs/设计共识.md`。修改维护源后运行本 Skill 的 `scripts/sync-references.mjs`；本文件不独立维护另一份共识。文中库内路径相对于实际库根。\n\n' + principleBody.trim() + '\n'],
    ['task-brief.md', '# 制作底稿与按任务条款\n\n正文同步自库内 `docs/提示词撰写.md` 的通用制作底稿与按任务条款。修改维护源后运行本 Skill 的 `scripts/sync-references.mjs`，不逐份手改副本。底稿中的库内路径相对于实际库根。\n\n收到制作请求时直接完成作品；底稿帮助理解和补足本次要求，不要求先提交另一份任务文档。占位项按当前任务替换，无关条款按范围裁剪。\n\n' + taskBody + '\n'],
    ['validation.md', '# 验证与观察\n\n正文同步自库内 `docs/提示词撰写.md` 的验证与观察章节。修改维护源后运行本 Skill 的 `scripts/sync-references.mjs`，不逐份手改副本。工具参数以库内 `scripts/inspect-note.mjs --help` 为准。\n\n' + validationBody + '\n']
  ];

  const referenceDir = path.join(skillRoot, 'references');
  fs.mkdirSync(referenceDir, { recursive: true });
  for (const [name, content] of outputs) {
    fs.writeFileSync(path.join(referenceDir, name), content, 'utf8');
    console.log('同步 references/' + name);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
