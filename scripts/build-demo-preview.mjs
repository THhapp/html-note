#!/usr/bin/env node
/*
 * Build the standalone NoteDemo preview as one offline HTML file.
 *
 * Input template: examples/demo-scene/standalone.html
 *   The template may reference local stylesheets and classic scripts with plain
 *   <link rel="stylesheet" href="..."> and <script src="..."></script> tags.
 *   Every such reference is resolved relative to the template directory and
 *   inlined; the result must contain no residual local or external URL.
 *
 * Output (default): <library-root>/dist/公共编排层-整合预览.html
 *
 * Usage:
 *   node scripts/build-demo-preview.mjs
 *   node scripts/build-demo-preview.mjs --output <file>
 *   node scripts/build-demo-preview.mjs --template <file> --output <file>
 *   node scripts/build-demo-preview.mjs --help
 *
 * Exit codes (stable):
 *   0  preview written
 *   1  unexpected internal error
 *   2  usage error (unknown/missing option, bad value)
 *   3  template missing/unreadable (or output would overwrite the template)
 *   4  local resources incomplete (missing/external/ES module/@import/local url())
 *   5  result is not self-contained
 *   6  output could not be written
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const EXIT = {
  OK: 0,
  UNEXPECTED: 1,
  USAGE: 2,
  TEMPLATE: 3,
  RESOURCES: 4,
  SELF_CONTAINED: 5,
  OUTPUT: 6
};

const HELP = [
  'NoteDemo 单文件预览构建 · build-demo-preview',
  '',
  '用法:',
  '  node scripts/build-demo-preview.mjs [--template <HTML>] [--output <HTML>]',
  '  node scripts/build-demo-preview.mjs --help',
  '',
  '默认值:',
  '  --template  examples/demo-scene/standalone.html',
  '  --output    dist/公共编排层-整合预览.html',
  '  相对路径按当前工作目录解析；--template=... / --output=... 写法同样支持。',
  '',
  '做什么:',
  '  - 读取模板中的本地 <link rel="stylesheet"> 与经典 <script src>，按模板目录解析后内联为单文件。',
  '  - 校验产物不再含本地/外部资源引用；没有模板就不会被读取（--help 不需要模板存在）。',
  '',
  '限制（不符合会以退出码 4/5 报错，不写半成品）:',
  '  - 仅支持经典脚本；ES module <script type="module"> 不能内联。',
  '  - 仅支持本地文件资源；http(s)://、// 外链、@import、非 data:/#/blob: 的 url() 都是错误。',
  '  - <base> 会被移除；外部资源属性（img src 等）会让产物判定为不自包含。',
  '  - 输出不能与模板是同一文件；输出目录不存在会自动创建。',
  '',
  '退出码（稳定）:',
  '  0 已写出预览',
  '  1 未预期内部错误',
  '  2 用法错误（未知/缺少选项、值非法）',
  '  3 模板缺失/不可读（或输出会覆盖模板）',
  '  4 本地资源不完整（缺失/外链/ES module/@import/本地 url()）',
  '  5 结果不是自包含单文件',
  '  6 输出无法写入',
  '',
  '示例:',
  '  node scripts/build-demo-preview.mjs --help',
  '  node scripts/build-demo-preview.mjs --template examples/authoring/index.html --output dist/作者装配与聚焦-预览.html',
  '  node scripts/build-demo-preview.mjs --template examples/propagation/index.html --output tests/.cache/propagation-preview.html'
].join('\n');

function toolError(code, exitCode, message, extra) {
  const error = new Error(message);
  error.code = code;
  error.exitCode = exitCode;
  if (extra) Object.assign(error, extra);
  return error;
}

function usageError(message) {
  return toolError('usage', EXIT.USAGE, message + ' 使用 --help 查看用法。');
}

function parseArgs(argv) {
  const args = {
    help: false,
    template: path.join(ROOT, 'examples', 'demo-scene', 'standalone.html'),
    output: path.join(ROOT, 'dist', '公共编排层-整合预览.html')
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--template') args.template = path.resolve(process.cwd(), requireValue(argv, ++i, '--template'));
    else if (arg.startsWith('--template=')) args.template = path.resolve(process.cwd(), requireValue(argv, i, '--template', arg.slice('--template='.length)));
    else if (arg === '--output') args.output = path.resolve(process.cwd(), requireValue(argv, ++i, '--output'));
    else if (arg.startsWith('--output=')) args.output = path.resolve(process.cwd(), requireValue(argv, i, '--output', arg.slice('--output='.length)));
    else throw usageError('未知参数：' + arg + '。');
  }
  return args;
}

function requireValue(argv, index, name, inlineValue) {
  if (inlineValue !== undefined) {
    if (!inlineValue) throw usageError(name + ' 需要一个非空值。');
    return inlineValue;
  }
  const value = argv[index];
  if (value == null || value.startsWith('--')) throw usageError(name + ' 需要一个值。');
  if (!value.trim()) throw usageError(name + ' 需要一个非空值。');
  return value;
}

function displayPath(file) {
  const relative = path.relative(ROOT, file);
  return relative && !relative.startsWith('..') ? relative : file;
}

function existsFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function readText(file, label) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    throw toolError('template_unreadable', EXIT.TEMPLATE,
      label + ' 无法读取：' + displayPath(file) + '（' + (error && error.message ? error.message : String(error)) + '）。');
  }
}

function getAttr(attrs, name) {
  const re = new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i');
  const match = String(attrs).match(re);
  if (!match) return null;
  return match[1] !== undefined ? match[1] : match[2] !== undefined ? match[2] : match[3];
}

function removeAttr(attrs, name) {
  const re = new RegExp('\\s+\\b' + name + '\\s*=\\s*(?:"[^"]*"|\'[^\']*\'|[^\\s>]+)', 'gi');
  return String(attrs).replace(re, '');
}

function isExternal(value) {
  return /^(?:https?:)?\/\//i.test(String(value).trim());
}

function localFile(href, baseDir) {
  const clean = String(href).split('#')[0].split('?')[0];
  if (!clean) return null;
  if (isExternal(clean) || /^[a-z][a-z0-9+.-]*:/i.test(clean)) return null;
  return path.resolve(baseDir, clean);
}

function inlineCss(css, context, errors) {
  // Checks ignore comments so explanatory text such as "no @import" is not a
  // false positive; the comments themselves stay in the emitted CSS.
  const comments = [];
  const masked = String(css).replace(/\/\*[\s\S]*?\*\//g, (comment) => {
    const token = '\u0000HNVCSSCOMMENT' + comments.length + '\u0000';
    comments.push(comment);
    return token;
  });
  if (/@import\b/i.test(masked)) errors.push(context + ' 含 @import（不支持，需改为内联后的本地样式）');
  masked.replace(/url\(\s*(?:(["'])(.*?)\1|([^)"']*))\s*\)/gi, (whole, quote, quoted, raw) => {
    const value = String(quoted !== undefined ? quoted : raw).trim();
    if (!value || value.startsWith('data:') || value.startsWith('#') || value.startsWith('blob:')) return whole;
    errors.push(context + ' 仍引用本地/外部 CSS 资源：' + value + '（请改为 data: 或本地可内联资源）');
    return whole;
  });
  return String(css);
}

function inlineStylesheets(html, baseDir, errors) {
  return html.replace(/<link\b([^>]*)>/gi, (whole, attrs) => {
    if (!/\brel\s*=\s*["']?stylesheet/i.test(attrs)) return whole;
    const href = getAttr(attrs, 'href');
    if (href === null) {
      errors.push('存在没有 href 的 stylesheet link');
      return whole;
    }
    if (isExternal(href)) {
      errors.push('外部样式表不能内联：' + href);
      return whole;
    }
    const file = localFile(href, baseDir);
    if (!file || !existsFile(file)) {
      errors.push('找不到样式表：' + href + (file ? '（解析为 ' + displayPath(file) + '）' : ''));
      return whole;
    }
    const css = inlineCss(readText(file, '样式表 ' + href), '样式表 ' + href, errors);
    return '<style>\n' + css + '\n</style>';
  });
}

function inlineScripts(html, baseDir, errors) {
  return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (whole, attrs, body) => {
    const src = getAttr(attrs, 'src');
    if (src === null) return whole;
    if (/\btype\s*=\s*["'][^"']*module/i.test(attrs)) {
      errors.push('ES module 脚本不能内联为经典脚本：' + src);
      return '';
    }
    if (isExternal(src)) {
      errors.push('外部脚本不能内联：' + src);
      return '';
    }
    const file = localFile(src, baseDir);
    if (!file || !existsFile(file)) {
      errors.push('找不到脚本：' + src + (file ? '（解析为 ' + displayPath(file) + '）' : ''));
      return '';
    }
    const code = readText(file, '脚本 ' + src).replace(/<\/script/gi, '<\\/script');
    let cleaned = attrs;
    for (const name of ['src', 'integrity', 'crossorigin', 'referrerpolicy', 'async', 'defer']) {
      cleaned = removeAttr(cleaned, name);
    }
    return '<script' + cleaned + '>\n' + code + '\n</script>';
  });
}

function verifySingleFile(html) {
  const issues = [];
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
  if (/<script\b[^>]*\bsrc\s*=/i.test(withoutComments)) issues.push('产物仍含 <script src=>');
  if (/<link\b[^>]*\brel\s*=\s*["']?stylesheet/i.test(withoutComments)) issues.push('产物仍含样式表 link');
  if (/<base\b/i.test(withoutComments)) issues.push('产物仍含 <base>');
  const markup = withoutComments
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '<script></script>')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '<style></style>');
  if (/(?:src|href|poster)\s*=\s*["']?(?:https?:)?\/\//i.test(markup)) issues.push('产物仍含外部资源属性');
  const resAttrs = markup.match(/\b(?:src|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi) || [];
  for (const attr of resAttrs) {
    const value = attr.replace(/^\w+\s*=\s*/, '').replace(/^["']|["']$/g, '');
    if (!/^data:/i.test(value) && !value.startsWith('#')) issues.push('非 data: 资源引用：' + attr);
  }
  const styleBlocks = withoutComments.match(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi) || [];
  for (const block of styleBlocks) {
    const css = block.replace(/^<style\b[^>]*>/i, '').replace(/<\/style\s*>$/i, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (/(?:@import\b)/i.test(css)) issues.push('CSS 仍含 @import');
    const urls = css.match(/url\(\s*(?:(["'])(.*?)\1|([^)"']*))\s*\)/gi) || [];
    for (const whole of urls) {
      const value = whole.replace(/^url\(\s*/i, '').replace(/\s*\)$/, '').replace(/^["']|["']$/g, '').trim();
      if (value.startsWith('data:') || value.startsWith('#') || value.startsWith('blob:')) continue;
      issues.push('CSS 仍引用本地/外部资源：' + value);
    }
  }
  return issues;
}

function main() {
  const argv = process.argv.slice(2);
  // --help 必须在读取任何模板之前生效：不需要模板存在，也不写文件。
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    return;
  }
  const args = parseArgs(argv);
  console.log('NoteDemo standalone preview build');
  if (path.resolve(args.template) === path.resolve(args.output)) {
    throw toolError('same_input_output', EXIT.TEMPLATE, '输出不能与模板是同一文件：' + displayPath(args.template));
  }
  if (!existsFile(args.template)) {
    throw toolError('template_missing', EXIT.TEMPLATE,
      '模板不存在或不是文件：' + displayPath(args.template) + '。用 --template <文件> 指定模板。');
  }
  const baseDir = path.dirname(args.template);
  const errors = [];
  let html = readText(args.template, '模板');
  html = html.replace(/<base\b[^>]*>/gi, '');
  html = inlineStylesheets(html, baseDir, errors);
  html = inlineScripts(html, baseDir, errors);
  if (errors.length) {
    for (const error of errors) console.error('[error] ' + error);
    throw toolError('resources_incomplete', EXIT.RESOURCES,
      '单文件预览未写出：模板 ' + displayPath(args.template) + ' 的本地资源不完整（' + errors.length + ' 个问题，见上）。');
  }
  const issues = verifySingleFile(html);
  if (issues.length) {
    for (const issue of issues) console.error('[error] ' + issue);
    throw toolError('not_self_contained', EXIT.SELF_CONTAINED,
      '单文件预览未写出：结果不是自包含单文件（' + issues.length + ' 个问题，见上）。');
  }
  try {
    fs.mkdirSync(path.dirname(args.output), { recursive: true });
    fs.writeFileSync(args.output, html, 'utf8');
  } catch (error) {
    throw toolError('output_unwritable', EXIT.OUTPUT,
      '无法写出预览：' + displayPath(args.output) + '（' + (error && error.message ? error.message : String(error)) + '）。',
      { cause: error });
  }
  const bytes = fs.statSync(args.output).size;
  console.log('standalone preview: ' + args.output + ' (' + bytes + ' bytes)');
}

try {
  main();
} catch (error) {
  if (error && error.exitCode) {
    console.error('[build-demo-preview] ' + error.message);
    process.exitCode = error.exitCode;
  } else {
    console.error('[build-demo-preview] 未预期错误：' + (error && error.message ? error.message : String(error)));
    if (error && error.stack) console.error(error.stack);
    process.exitCode = EXIT.UNEXPECTED;
  }
}
