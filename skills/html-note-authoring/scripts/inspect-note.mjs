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
    if ((args.includes('--help') || args.includes('-h')) && !args.includes('--json')) {
      console.log([
        '本地观察入口 · inspect-note（Skill 独立副本）',
        '',
        '用法:',
        '  node scripts/inspect-note.mjs <成品HTML绝对路径> --root <库目录> [--json]',
        '      [--screenshot <输出PNG绝对路径>] [--probe <probe模块绝对路径>]',
        '      [--session <页面内会话表达式>] [--frame <frameId>]',
        '      [--width <像素>] [--height <像素>] [--browser <浏览器可执行文件>]',
        '',
        '说明:',
        '  - 在仓库外使用必须用 --root 指向 html-note 库；在库内可省略。',
        '  - --frame 用 session.go(frameId) 恢复指定停点后再截图/probe；只证明停点，不证明动画。',
        '  - 参数与完整说明以目标库 scripts/inspect-note.mjs --help 为准。'
      ].join('\n'));
      process.exitCode = 0;
    } else if (args.includes('--json')) {
      console.log(JSON.stringify({ ok: false, tool: 'inspect-note', error: { code: 'library_unavailable', message: error.message } }));
      process.exitCode = 1;
    } else {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
