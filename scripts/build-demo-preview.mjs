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
  '  - 最终校验按标签/属性用途分类：正文导航 <a href>/<area href>（http(s)、相对页、#）保留；',
  '    页面加载资源（script src、link rel=stylesheet/preload/prefetch/icon 等 href、img/source src/srcset、',
  '    video/audio src、video poster、iframe/embed src、object data、track src、input[type=image] src、',
  '    SVG image/use href 等）必须已内联或为 data:/blob:/#。实体编码（如 https&#58;//）按解码后判断。',
  '  - 没有模板就不会被读取（--help 不需要模板存在）；导航链接不会被误报为外部资源。',
  '',
  '限制（不符合会以退出码 4/5 报错，不写半成品）:',
  '  - 仅支持经典脚本；ES module <script type="module"> 不能内联。',
  '  - 仅支持本地文件资源；http(s)://、// 外链、@import、非 data:/#/blob: 的 url() 都是错误。',
  '  - <base> 会被移除；正文导航链接可保留，但加载资源属性（img src 等）未内联会让产物判定为不自包含，',
  '    错误会指出标签、属性、原值与解码后的值/解析路径。',
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

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", colon: ':', sol: '/', period: '.', num: '#', equals: '=', quest: '?', commat: '@' };

/* 解码 HTML 实体；只用于判断用途，不修改输出中的原文。 */
function decodeEntities(value) {
  return String(value == null ? '' : value)
    .replace(/&#x([0-9a-f]+);?/gi, (match, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    })
    .replace(/&#([0-9]+);?/g, (match, digits) => {
      const code = parseInt(digits, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    })
    .replace(/&([a-z][a-z0-9]+);/gi, (match, name) => {
      const key = String(name).toLowerCase();
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key) ? NAMED_ENTITIES[key] : match;
    });
}

function parseAttrs(raw) {
  const attrs = Object.create(null);
  const text = String(raw == null ? '' : raw);
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const name = match[1].toLowerCase();
    const rawValue = match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4];
    attrs[name] = { raw: rawValue === undefined ? '' : rawValue, value: decodeEntities(rawValue === undefined ? '' : rawValue) };
  }
  return attrs;
}

const RESOURCE_RELS = new Set(['stylesheet', 'preload', 'prefetch', 'icon', 'apple-touch-icon', 'apple-touch-icon-precomposed', 'manifest', 'modulepreload', 'preconnect', 'dns-prefetch', 'prerender']);

function tagHtml(tag, attrs, attrName) {
  const item = attrs[attrName];
  return '<' + tag + (item ? ' ' + attrName + '="' + item.raw + '"' : '') + '>';
}

function resourceRefs(tag, attrs) {
  const refs = [];
  const add = (attrName) => {
    const item = attrs[attrName];
    if (item !== undefined) refs.push({ tag: tag, attr: attrName, raw: item.raw, value: item.value });
  };
  if (tag === 'script') add('src');
  else if (tag === 'link') {
    const rel = (attrs.rel ? attrs.rel.value : '').toLowerCase().split(/\s+/).filter(Boolean);
    if (rel.some((token) => RESOURCE_RELS.has(token))) add('href');
  } else if (tag === 'img') { add('src'); add('srcset'); }
  else if (tag === 'source') { add('src'); add('srcset'); }
  else if (tag === 'video') { add('src'); add('poster'); }
  else if (tag === 'audio') { add('src'); }
  else if (tag === 'iframe') { add('src'); }
  else if (tag === 'embed') { add('src'); }
  else if (tag === 'object') { add('data'); }
  else if (tag === 'track') { add('src'); }
  else if (tag === 'input') {
    if (attrs.type && attrs.type.value.toLowerCase() === 'image') add('src');
  } else if (tag === 'image' || tag === 'use' || tag === 'feimage') {
    add('href'); add('xlink:href');
  } else if (tag === 'body' || tag === 'table' || tag === 'td' || tag === 'th') add('background');
  return refs;
}

function splitSrcset(value) {
  const tokens = [];
  const masked = String(value).replace(/data:[^\s]+/gi, () => {
    tokens.push('__HNVDATA__');
    return '__HNVDATA__';
  });
  return masked.split(',').map((part) => part.trim().split(/\s+/)[0]).filter(Boolean).map((candidate) => candidate === '__HNVDATA__' ? 'data:' : candidate);
}

function checkResourceValue(ref, baseDir, issues) {
  const values = ref.attr === 'srcset' ? splitSrcset(ref.value) : [ref.value];
  for (const candidate of values) {
    const value = String(candidate).trim();
    const lower = value.toLowerCase();
    if (!value) {
      issues.push('页面加载资源为空：标签 ' + tagHtml(ref.tag, {}, '') + '，属性 ' + ref.attr + '，原值 ' + JSON.stringify(ref.raw) + '。');
      continue;
    }
    if (lower.startsWith('data:') || lower.startsWith('blob:') || value.startsWith('#')) continue;
    const external = /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//');
    const clean = value.split('#')[0].split('?')[0];
    const resolved = external ? value : path.resolve(baseDir, clean);
    issues.push('页面加载资源未内联：标签 <' + ref.tag + '>，属性 ' + ref.attr + '，原值 ' + JSON.stringify(ref.raw) +
      (ref.attr === 'srcset' ? '，候选值 ' + JSON.stringify(value) : '') +
      '，解码值 ' + JSON.stringify(ref.value) + '，' + (external ? '解析为外部资源 ' + value : '解析为本地文件 ' + displayPath(resolved)) +
      '；只允许 data:/blob:/# 或已内联资源。');
  }
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
    const decodedHref = decodeEntities(href);
    if (isExternal(decodedHref)) {
      errors.push('外部样式表不能内联：标签 <link rel="stylesheet">，属性 href，原值 ' + JSON.stringify(href) +
        '，解码值 ' + JSON.stringify(decodedHref) + '，解析为外部资源 ' + decodedHref + '。');
      return whole;
    }
    const file = localFile(decodedHref, baseDir);
    if (!file || !existsFile(file)) {
      errors.push('找不到样式表：标签 <link rel="stylesheet">，属性 href，原值 ' + JSON.stringify(href) +
        '，解码值 ' + JSON.stringify(decodedHref) + (file ? '（解析为 ' + displayPath(file) + '）' : '') + '。');
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
    const decodedSrc = decodeEntities(src);
    if (/\btype\s*=\s*["'][^"']*module/i.test(attrs)) {
      errors.push('ES module 脚本不能内联为经典脚本：标签 <script>，属性 src，原值 ' + JSON.stringify(src) +
        '，解码值 ' + JSON.stringify(decodedSrc) + '。');
      return '';
    }
    if (isExternal(decodedSrc)) {
      errors.push('外部脚本不能内联：标签 <script>，属性 src，原值 ' + JSON.stringify(src) +
        '，解码值 ' + JSON.stringify(decodedSrc) + '，解析为外部资源 ' + decodedSrc + '。');
      return '';
    }
    const file = localFile(decodedSrc, baseDir);
    if (!file || !existsFile(file)) {
      errors.push('找不到脚本：标签 <script>，属性 src，原值 ' + JSON.stringify(src) +
        '，解码值 ' + JSON.stringify(decodedSrc) + (file ? '（解析为 ' + displayPath(file) + '）' : '') + '。');
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

function verifySingleFile(html, baseDir) {
  const issues = [];
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
  if (/<base\b/i.test(withoutComments)) issues.push('产物仍含 <base>');
  /* 先把脚本/样式正文替换为空，避免内联代码里的字符串被当作标签；再逐标签按属性用途分类。
   * 正文导航链接（a/area href）允许外部/相对/#，加载资源必须 data:/blob:/# 或已内联。 */
  const markup = withoutComments
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, (whole) => whole.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script\s*>)/i, '$1$2'))
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, (whole) => whole.replace(/(<style\b[^>]*>)[\s\S]*?(<\/style\s*>)/i, '$1$2'));
  const tagRe = /<([a-zA-Z][\w:-]*)((?:\s+[^<>]*?)?)\/?>/g;
  let match;
  while ((match = tagRe.exec(markup)) !== null) {
    const tag = match[1].toLowerCase();
    const attrs = parseAttrs(match[2]);
    for (const ref of resourceRefs(tag, attrs)) checkResourceValue(ref, baseDir, issues);
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
  const issues = verifySingleFile(html, baseDir);
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
