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
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

function parseArgs(argv) {
  const args = {
    template: path.join(ROOT, 'examples', 'demo-scene', 'standalone.html'),
    output: path.join(ROOT, 'dist', '公共编排层-整合预览.html')
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--template') args.template = path.resolve(process.cwd(), requireValue(argv, ++i, '--template'));
    else if (arg.startsWith('--template=')) args.template = path.resolve(process.cwd(), arg.slice('--template='.length));
    else if (arg === '--output') args.output = path.resolve(process.cwd(), requireValue(argv, ++i, '--output'));
    else if (arg.startsWith('--output=')) args.output = path.resolve(process.cwd(), arg.slice('--output='.length));
    else throw new Error('Unknown argument: ' + arg);
  }
  return args;
}

function requireValue(argv, index, name) {
  if (index >= argv.length || argv[index].startsWith('--')) throw new Error(name + ' requires a value');
  return argv[index];
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function existsFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
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
  if (/@import\b/i.test(masked)) errors.push(context + ' contains @import');
  masked.replace(/url\(\s*(?:(["'])(.*?)\1|([^)"']*))\s*\)/gi, (whole, quote, quoted, raw) => {
    const value = String(quoted !== undefined ? quoted : raw).trim();
    if (!value || value.startsWith('data:') || value.startsWith('#') || value.startsWith('blob:')) return whole;
    errors.push(context + ' still references a local/external CSS asset: ' + value);
    return whole;
  });
  return String(css);
}

function inlineStylesheets(html, baseDir, errors) {
  return html.replace(/<link\b([^>]*)>/gi, (whole, attrs) => {
    if (!/\brel\s*=\s*["']?stylesheet/i.test(attrs)) return whole;
    const href = getAttr(attrs, 'href');
    if (href === null) {
      errors.push('stylesheet link without href');
      return whole;
    }
    if (isExternal(href)) {
      errors.push('external stylesheet: ' + href);
      return whole;
    }
    const file = localFile(href, baseDir);
    if (!file || !existsFile(file)) {
      errors.push('missing stylesheet: ' + href);
      return whole;
    }
    const css = inlineCss(readText(file), 'stylesheet ' + href, errors);
    return '<style>\n' + css + '\n</style>';
  });
}

function inlineScripts(html, baseDir, errors) {
  return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (whole, attrs, body) => {
    const src = getAttr(attrs, 'src');
    if (src === null) return whole;
    if (/\btype\s*=\s*["'][^"']*module/i.test(attrs)) {
      errors.push('ES module script cannot be inlined as a classic script: ' + src);
      return '';
    }
    if (isExternal(src)) {
      errors.push('external script: ' + src);
      return '';
    }
    const file = localFile(src, baseDir);
    if (!file || !existsFile(file)) {
      errors.push('missing script: ' + src);
      return '';
    }
    const code = readText(file).replace(/<\/script/gi, '<\\/script');
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
  if (/<script\b[^>]*\bsrc\s*=/i.test(withoutComments)) issues.push('still contains <script src=>');
  if (/<link\b[^>]*\brel\s*=\s*["']?stylesheet/i.test(withoutComments)) issues.push('still contains a stylesheet link');
  if (/<base\b/i.test(withoutComments)) issues.push('still contains <base>');
  const markup = withoutComments
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '<script></script>')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '<style></style>');
  if (/(?:src|href|poster)\s*=\s*["']?(?:https?:)?\/\//i.test(markup)) issues.push('contains an external resource attribute');
  const resAttrs = markup.match(/\b(?:src|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi) || [];
  for (const attr of resAttrs) {
    const value = attr.replace(/^\w+\s*=\s*/, '').replace(/^["']|["']$/g, '');
    if (!/^data:/i.test(value) && !value.startsWith('#')) issues.push('non-data resource reference: ' + attr);
  }
  const styleBlocks = withoutComments.match(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi) || [];
  for (const block of styleBlocks) {
    const css = block.replace(/^<style\b[^>]*>/i, '').replace(/<\/style\s*>$/i, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (/(?:@import\b)/i.test(css)) issues.push('CSS still has @import');
    const urls = css.match(/url\(\s*(?:(["'])(.*?)\1|([^)"']*))\s*\)/gi) || [];
    for (const whole of urls) {
      const value = whole.replace(/^url\(\s*/i, '').replace(/\s*\)$/, '').replace(/^["']|["']$/g, '').trim();
      if (value.startsWith('data:') || value.startsWith('#') || value.startsWith('blob:')) continue;
      issues.push('CSS still references a local/external asset: ' + value);
    }
  }
  return issues;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log('NoteDemo standalone preview build');
  if (!existsFile(args.template)) throw new Error('template is missing: ' + path.relative(ROOT, args.template));
  const baseDir = path.dirname(args.template);
  const errors = [];
  let html = readText(args.template);
  html = html.replace(/<base\b[^>]*>/gi, '');
  html = inlineStylesheets(html, baseDir, errors);
  html = inlineScripts(html, baseDir, errors);
  if (errors.length) {
    for (const error of errors) console.error('[error] ' + error);
    throw new Error('standalone preview was not written because its local resources are incomplete');
  }
  const issues = verifySingleFile(html);
  if (issues.length) {
    for (const issue of issues) console.error('[error] ' + issue);
    throw new Error('standalone preview is not self-contained');
  }
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, html, 'utf8');
  const bytes = fs.statSync(args.output).size;
  console.log('standalone preview: ' + args.output + ' (' + bytes + ' bytes)');
}

try {
  main();
} catch (error) {
  console.error('[build-demo-preview] ' + (error && error.stack ? error.stack : error));
  process.exitCode = 1;
}