#!/usr/bin/env node
/*
 * Static checks for the offline html-note component library build.
 *
 * Strict by default:
 *   - 101 expected IDs, unique, with sources/dists/demo functions present
 *   - module dependency headers, classic-script syntax, no runtime fetch/eval
 *   - no external resources and no unresolved fonts/ URLs
 *   - self-contained gallery preview with local assets inlined
 *   - registry status/verification copied from src/status.json and counts consistent
 *
 * --partial is only for development while other module manifests are still
 * being written. It downgrades missing expected IDs/modules and a missing
 * generated preview to warnings; structural errors in present data still fail.
 *
 * Usage: node scripts/check.mjs [--final] [--partial] [--root <dir>] [--out <dir>]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODULE_ORDER } from './lib/source-order.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..');
const REQUIRED_ENTRY_FIELDS = [
  'id', 'name', 'cn', 'category', 'module', 'purpose', 'inputs', 'customizable',
  'states', 'usage', 'dependencies', 'source', 'dist', 'demo', 'preview',
  'example', 'limitations', 'status', 'verification', 'userReview',
  'reviewScope', 'consensus', 'docs'
];
const STATUS_VALUES = new Set(['planned', 'implemented', 'verified', 'blocked']);
const USER_REVIEW_VALUES = new Set(['not-reviewed', 'positive-with-scope', 'rejected']);
const R_CONSENSUS = ['K06', 'K07', 'K12', 'K15', 'K16'];
const I06_CONSENSUS = ['K10', 'K11', 'K16'];
const I07_CONSENSUS = ['K03', 'K04', 'K05', 'K06', 'K12', 'K16'];

function parseArgs(argv) {
  const args = { root: DEFAULT_ROOT, out: null, partial: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--partial') args.partial = true;
    else if (arg === '--final') args.partial = false;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--root') args.root = requireValue(argv, ++i, '--root');
    else if (arg.startsWith('--root=')) args.root = arg.slice('--root='.length);
    else if (arg === '--out') args.out = requireValue(argv, ++i, '--out');
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else throw new Error('Unknown argument: ' + arg);
  }
  args.root = path.resolve(process.cwd(), args.root);
  args.out = path.resolve(args.root, args.out || 'dist');
  return args;
}

function requireValue(argv, index, name) {
  if (index >= argv.length || argv[index].startsWith('--')) throw new Error(name + ' requires a value');
  return argv[index];
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error('Cannot read JSON ' + file + ': ' + err.message);
  }
}

function existsFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function toPosix(file) {
  return String(file).replace(/\\/g, '/');
}

function sameArray(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function splitDemoLocation(value) {
  const at = String(value || '').lastIndexOf('#');
  if (at < 0) return { file: value, id: '' };
  return { file: value.slice(0, at), id: value.slice(at + 1) };
}

function hasDemoAssignment(source, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp('\\[\\s*["\']' + escaped + '["\']\\s*\\]\\s*='),
    new RegExp('\\.' + escaped + '\\s*='),
    new RegExp('["\']' + escaped + '["\']\\s*:')
  ];
  return patterns.some((pattern) => pattern.test(source));
}

function githubHeadingSlug(text) {
  // GitHub-style heading slug: lowercase, drop HTML tags and punctuation, spaces -> '-'.
  return String(text)
    .replace(/<[^>]*>/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-');
}

function collectDocAnchors(source) {
  const anchors = new Set();
  for (const match of String(source).matchAll(/<a\b[^>]*?\b(?:id|name)\s*=\s*["']?([^"'\s>]+)["']?[^>]*>/gi)) {
    anchors.add(match[1]);
  }
  const used = new Map();
  let fenced = false;
  for (const line of String(source).split(/\r?\n/)) {
    if (/^\s{0,3}```/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.*?)(?:\s+#+\s*)?$/);
    if (!heading) continue;
    const base = githubHeadingSlug(heading[1]);
    if (!base) continue;
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    anchors.add(count ? base + '-' + count : base);
  }
  return anchors;
}

function checkDocLinks(reporter, root, entries) {
  const cache = new Map();
  let checked = 0;
  for (const entry of entries) {
    const docs = entry && entry.docs;
    if (typeof docs !== 'string' || !docs.trim()) {
      reporter.error((entry && entry.id ? entry.id : '(no id)') + ' has no docs link');
      continue;
    }
    const hashAt = docs.indexOf('#');
    const file = (hashAt >= 0 ? docs.slice(0, hashAt) : docs).trim();
    const rawAnchor = hashAt >= 0 ? docs.slice(hashAt + 1).trim() : '';
    if (!file || /^[a-z][a-z0-9+.-]*:/i.test(file) || path.isAbsolute(file)) {
      reporter.error(entry.id + ' docs link must be a local relative file: ' + docs);
      continue;
    }
    const abs = path.resolve(root, file);
    if (!existsFile(abs)) {
      reporter.error(entry.id + ' docs file is missing: ' + toPosix(file));
      continue;
    }
    if (!rawAnchor) continue;
    let anchors = cache.get(abs);
    if (!anchors) {
      anchors = collectDocAnchors(fs.readFileSync(abs, 'utf8'));
      cache.set(abs, anchors);
    }
    let anchor = rawAnchor;
    try {
      anchor = decodeURIComponent(rawAnchor);
    } catch {
      // keep the raw anchor when it is not valid percent-encoding
    }
    checked += 1;
    if (!anchors.has(rawAnchor) && !anchors.has(anchor)) {
      reporter.error(entry.id + ' docs anchor is missing: ' + toPosix(file) + '#' + rawAnchor);
    }
  }
  return checked;
}

function headerInfo(source) {
  const match = String(source).slice(0, 4000).match(/^\/\*![\s\S]*?\*\//);
  if (!match) return null;
  const text = match[0];
  const moduleMatch = text.match(/note-library module:\s*([^\s*]+)/);
  const depsMatch = text.match(/\bdependencies:\s*([^\n*]+)/);
  let deps = depsMatch ? depsMatch[1].split(',').map((value) => value.trim()).filter(Boolean) : null;
  if (deps && deps.length === 1 && deps[0] === 'none') deps = [];
  const modulesMatch = text.match(/\bmodules:\s*([^\n*]+)/);
  let modules = modulesMatch ? modulesMatch[1].split(',').map((value) => value.trim()).filter(Boolean) : null;
  if (modules && modules.length === 1 && modules[0] === '(none)') modules = [];
  return {
    raw: text,
    full: /note-library full bundle/.test(text),
    module: moduleMatch ? moduleMatch[1].trim() : null,
    deps,
    modules
  };
}

function stripCssComments(css) {
  return String(css).replace(/\/\*[\s\S]*?\*\//g, '');
}

function stripVendorJs(source) {
  // The regenerated KaTeX parser has a method named fetch(); it is not network
  // I/O. Vendor blocks are explicit build markers, so exclude them from the
  // library's runtime-network scan while keeping them in the syntax check.
  return String(source).replace(/\/\* ---- vendor:[\s\S]*?\*\/[\s\S]*?(?=\/\* ---- (?:vendor|source):|\/\*! note-library|$)/g, '');
}

function cssReferencesLocal(css) {
  const withoutComments = stripCssComments(css);
  return /@import\b/i.test(withoutComments) ||
    /url\(\s*(?:["']?)(?:https?:)?\/\//i.test(withoutComments) ||
    /url\(\s*(?:["']?)(?!data:|#|https?:|blob:)[^)"']+/i.test(withoutComments);
}

function hasGlobalFetch(source) {
  return /(?:^|[^.\w$])fetch\s*\(/m.test(source) || /(?:window|globalThis|self)\.fetch\s*\(/m.test(source);
}

function hasEval(source) {
  return /(?:^|[^.\w$])eval\s*\(/m.test(source);
}

function hasExternalRuntimeResource(source) {
  return /(?:\b(?:src|href)\s*=|\.setAttribute\(\s*["'](?:src|href)["']\s*,|importScripts\s*\(|document\.createElement\(\s*["']script["']\s*\)[\s\S]{0,200}?\.src\s*=)\s*["'](?:https?:)?\/\//i.test(source);
}

function safeSyntaxCheck(source, label, errors) {
  try {
    // eslint-disable-next-line no-new-func
    new Function(source);
    return true;
  } catch (err) {
    errors.push(label + ' does not parse as a classic script: ' + err.message);
    return false;
  }
}

function lintPreview(html, errors) {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
  if (/<script\b[^>]*\bsrc\s*=/i.test(withoutComments)) errors.push('single-file preview contains <script src=>');
  if (/<link\b[^>]*\brel\s*=\s*["']?stylesheet[^>]*\bhref\s*=/i.test(withoutComments)) errors.push('single-file preview contains a stylesheet link');
  if (/<base\b/i.test(withoutComments)) errors.push('single-file preview contains <base>');

  // Ignore inline script bodies when looking for markup resource attributes.
  // A string such as "<img src=...>" inside gallery JS is not a live request.
  const markup = withoutComments
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '<script></script>')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '<style></style>');
  const srcTags = markup.match(/\b(?:src|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi) || [];
  for (const attr of srcTags) {
    const value = attr.replace(/^\w+\s*=\s*/, '').replace(/^["']|["']$/g, '');
    if (!/^data:/i.test(value) && !/^#/.test(value)) errors.push('single-file preview has a non-data resource reference: ' + attr);
  }
  const srcsets = markup.match(/\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi) || [];
  for (const attr of srcsets) {
    if (/(?:^|[,\s])(?!data:)https?:\/\//i.test(attr) || /(?:^|[,\s])(?!data:)[^\s,]+\.(?:png|jpe?g|gif|svg|webp)/i.test(attr)) {
      errors.push('single-file preview has a non-data srcset: ' + attr.slice(0, 80));
    }
  }
  const linkTags = markup.match(/<link\b[^>]*>/gi) || [];
  for (const tag of linkTags) {
    if (/\bhref\s*=/i.test(tag) && !/\bhref\s*=\s*["']?data:/i.test(tag) && !/\bhref\s*=\s*["']?#/.test(tag)) {
      errors.push('single-file preview contains a non-data <link>: ' + tag.slice(0, 100));
    }
  }
  const anchors = markup.match(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi) || [];
  for (const tag of anchors) {
    const match = tag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const href = match ? (match[1] !== undefined ? match[1] : match[2] !== undefined ? match[2] : match[3]) : '';
    if (!href.startsWith('#')) errors.push('single-file preview contains an out-of-page anchor: ' + tag.slice(0, 100));
  }
  if (/(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i.test(markup)) {
    errors.push('single-file preview contains an external resource attribute');
  }

  const styles = withoutComments.match(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi) || [];
  for (const block of styles) {
    const css = stripCssComments(block.replace(/^<style\b[^>]*>/i, '').replace(/<\/style\s*>$/i, ''));
    if (/@import\b/i.test(css)) errors.push('single-file preview CSS still contains @import');
    if (/url\(\s*(?:["']?)(?:https?:)?\/\//i.test(css)) errors.push('single-file preview CSS still contains an external url()');
    if (/url\(\s*(?:["']?)(?!data:|#)[^)"']+/i.test(css)) errors.push('single-file preview CSS still contains a local url()');
    if (/url\([^)]*fonts\//i.test(css)) errors.push('single-file preview CSS still contains an unresolved fonts/ URL');
  }
  const styleAttrs = markup.match(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi) || [];
  for (const attr of styleAttrs) {
    const css = stripCssComments(attr);
    if (/url\(\s*(?:["']?)(?:https?:)?\/\//i.test(css)) errors.push('single-file preview style attribute contains an external url()');
    if (/url\(\s*(?:["']?)(?!data:|#)[^)"']+/i.test(css)) errors.push('single-file preview style attribute contains a local url()');
  }
}

function checkManifestDemo(reporter, root, manifests, registryEntries) {
  for (const manifest of manifests) {
    const data = manifest.data;
    if (!Array.isArray(data.demos)) continue;
    if (!data.demos.length) {
      if (data.module !== 'core' && Array.isArray(data.entries) && data.entries.length) {
        reporter.issue(manifest.name + ' declares entries but no demo files');
      }
      continue;
    }
    for (const demoFile of data.demos) {
      const abs = path.resolve(root, demoFile);
      if (!existsFile(abs)) {
        reporter.issue('demo file is missing: ' + toPosix(demoFile) + ' (' + manifest.name + ')');
      }
    }
    for (const raw of Array.isArray(data.entries) ? data.entries : []) {
      if (!raw || !raw.id) continue;
      const entry = registryEntries.get(raw.id);
      const location = (entry && entry.demo) || (raw.demo || '');
      let demoFile = location;
      let found = false;
      if (location) {
        const split = splitDemoLocation(location);
        demoFile = split.file;
        const abs = path.resolve(root, demoFile);
        if (existsFile(abs)) {
          const source = fs.readFileSync(abs, 'utf8');
          found = hasDemoAssignment(source, raw.id);
        } else {
          reporter.issue('demo target for ' + raw.id + ' is missing: ' + toPosix(demoFile));
          continue;
        }
      } else {
        for (const candidate of data.demos) {
          const abs = path.resolve(root, candidate);
          if (existsFile(abs) && hasDemoAssignment(fs.readFileSync(abs, 'utf8'), raw.id)) {
            found = true;
            demoFile = candidate;
            break;
          }
        }
      }
      if (!found) {
        reporter.issue('manifest entry ' + raw.id + ' has no demo function in ' + toPosix(demoFile || '(no demo file)'));
      }
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/check.mjs [--partial] [--root <dir>] [--out <dir>]');
    return;
  }
  const errors = [];
  const warnings = [];
  const reporter = {
    error(message) { errors.push(message); console.error('[error] ' + message); },
    warn(message) { warnings.push(message); console.warn('[warn] ' + message); },
    issue(message) { if (args.partial) this.warn(message); else this.error(message); }
  };

  console.log('html-note library check · ' + (args.partial ? 'PARTIAL' : 'STRICT') + ' · root ' + args.root);

  const expected = readJson(path.join(args.root, 'scripts', 'expected-ids.json'));
  const expectedIds = [];
  const expectedCategory = new Map();
  const expectedCategories = [];
  for (const group of expected.groups || []) {
    if (!expectedCategories.includes(group.category)) expectedCategories.push(group.category);
    for (const id of group.ids || []) {
      if (expectedCategory.has(id)) throw new Error('expected-ids.json duplicate ID: ' + id);
      expectedCategory.set(id, group.category);
      expectedIds.push(id);
    }
  }
  const declaredTotal = expected.counts && Number.isFinite(expected.counts.total) ? expected.counts.total : 101;
  if (expectedIds.length !== declaredTotal) {
    reporter.error('expected-ids.json has ' + expectedIds.length + ' IDs, expected ' + declaredTotal + ' (counts.total)');
  }

  const statusData = readJson(path.join(args.root, 'src', 'status.json'));
  const registryPath = path.join(args.root, 'registry.json');
  if (!existsFile(registryPath)) {
    reporter.error('registry.json is missing; run node scripts/build.mjs first');
    finish();
    return;
  }
  const registry = readJson(registryPath);
  if (!registry || typeof registry !== 'object') {
    reporter.error('registry.json is not an object');
    finish();
    return;
  }
  if (!registry.build || typeof registry.build.time !== 'string') reporter.error('registry.build.time is missing');
  if (!registry.counts) reporter.error('registry.counts is missing');
  if (!Array.isArray(registry.entries)) reporter.error('registry.entries must be an array');
  if (!Array.isArray(registry.modules)) reporter.error('registry.modules must be an array');
  const entries = Array.isArray(registry.entries) ? registry.entries : [];
  const entryById = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string') {
      reporter.error('registry has an entry without an id');
      continue;
    }
    if (entryById.has(entry.id)) reporter.error('registry has duplicate ID: ' + entry.id);
    entryById.set(entry.id, entry);
  }
  if (!args.partial && registry.build && registry.build.mode !== 'final') {
    reporter.error('registry was built in development mode; run node scripts/build.mjs --final');
  }

  for (const id of expectedIds) {
    if (!entryById.has(id)) reporter.issue('expected ID is missing from registry: ' + id);
  }
  for (const id of entryById.keys()) {
    if (!expectedCategory.has(id)) reporter.error('registry contains unknown ID: ' + id);
  }
  if (entries.length !== expectedIds.length) {
    reporter.issue('registry has ' + entries.length + ' entries; expected-ids.json has ' + expectedIds.length);
  }

  // Registry counts must describe the actual entries, not hopeful file existence.
  const byStatus = { planned: 0, implemented: 0, verified: 0, blocked: 0 };
  const byCategory = {};
  for (const entry of entries) {
    if (!STATUS_VALUES.has(entry.status)) reporter.error(entry.id + ' has invalid technical status: ' + entry.status);
    else byStatus[entry.status] += 1;
    if (typeof entry.category === 'string') byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
  }
  if (registry.counts) {
    if (registry.counts.total !== entries.length) reporter.error('registry.counts.total=' + registry.counts.total + ' but entries=' + entries.length);
    if (registry.counts.expected !== expectedIds.length) reporter.error('registry.counts.expected=' + registry.counts.expected + ' but expected-ids=' + expectedIds.length);
    const missingIds = expectedIds.filter((id) => !entryById.has(id));
    if (registry.counts.missing !== missingIds.length) reporter.error('registry.counts.missing=' + registry.counts.missing + ' but actual missing=' + missingIds.length);
    const extra = entries.filter((entry) => !expectedCategory.has(entry.id)).length;
    if (registry.counts.extra !== extra) reporter.error('registry.counts.extra=' + registry.counts.extra + ' but actual extra=' + extra);
    for (const status of STATUS_VALUES) {
      if (!registry.counts.byStatus || registry.counts.byStatus[status] !== byStatus[status]) {
        reporter.error('registry.counts.byStatus.' + status + ' does not match actual entries');
      }
    }
    const actualCategories = new Set([...expectedCategories, ...Object.keys(byCategory)]);
    for (const category of actualCategories) {
      if (!registry.counts.byCategory || registry.counts.byCategory[category] !== (byCategory[category] || 0)) {
        reporter.error('registry.counts.byCategory["' + category + '"] does not match actual entries');
      }
    }
    const sumStatus = Object.values(registry.counts.byStatus || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
    const sumCategory = Object.values(registry.counts.byCategory || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
    if (sumStatus !== entries.length) reporter.error('registry status counts do not sum to entries');
    if (sumCategory !== entries.length) reporter.error('registry category counts do not sum to entries');
  }
  if (Array.isArray(registry.missingIds)) {
    const actualMissing = expectedIds.filter((id) => !entryById.has(id));
    if (!sameArray(registry.missingIds, actualMissing)) reporter.error('registry.missingIds does not match entries');
  } else {
    reporter.error('registry.missingIds must be an array');
  }

  // Entry fields, source/dists, status provenance, review scope, consensus.
  for (const entry of entries) {
    for (const field of REQUIRED_ENTRY_FIELDS) {
      if (!(field in entry)) reporter.error(entry.id + ' is missing registry field: ' + field);
    }
    for (const field of ['inputs', 'customizable', 'states', 'dependencies', 'source', 'dist', 'limitations', 'consensus']) {
      if (!Array.isArray(entry[field])) reporter.error(entry.id + '.' + field + ' must be an array');
    }
    if (typeof entry.source === 'string' || (Array.isArray(entry.source) && !entry.source.length)) reporter.error(entry.id + '.source is empty or invalid');
    if (typeof entry.dist === 'string' || (Array.isArray(entry.dist) && !entry.dist.length)) reporter.error(entry.id + '.dist is empty or invalid');
    for (const listName of ['source', 'dist']) {
      for (const file of Array.isArray(entry[listName]) ? entry[listName] : []) {
        if (typeof file !== 'string' || !file.trim()) {
          reporter.error(entry.id + '.' + listName + ' contains an empty path');
          continue;
        }
        if (/^[a-z]+:/i.test(file) || file.startsWith('//') || path.isAbsolute(file)) {
          reporter.error(entry.id + '.' + listName + ' must be a local relative path: ' + file);
          continue;
        }
        const abs = path.resolve(args.root, file);
        if (!existsFile(abs)) {
          if (listName === 'dist' && !args.partial) reporter.error(entry.id + ' dist file is missing: ' + toPosix(file));
          else if (listName === 'dist') reporter.warn(entry.id + ' dist file is missing (partial): ' + toPosix(file));
          else reporter.error(entry.id + ' source file is missing: ' + toPosix(file));
        }
      }
    }
    if (!USER_REVIEW_VALUES.has(entry.userReview)) reporter.error(entry.id + ' has invalid userReview: ' + entry.userReview);
    if (typeof entry.reviewScope !== 'string' || !entry.reviewScope.trim()) reporter.error(entry.id + ' has no reviewScope');
    if (expectedCategory.has(entry.id) && entry.category !== expectedCategory.get(entry.id)) {
      reporter.error(entry.id + ' category should be "' + expectedCategory.get(entry.id) + '"');
    }
    const statusEntry = statusData.entries && statusData.entries[entry.id];
    if (!statusEntry) {
      reporter.error(entry.id + ' is absent from src/status.json');
    } else {
      if (entry.status !== statusEntry.status) reporter.error(entry.id + ' status was changed away from src/status.json');
      const expectedVerification = Array.isArray(statusEntry.verification) ? statusEntry.verification : [];
      if (!sameArray(entry.verification || [], expectedVerification)) reporter.error(entry.id + ' verification does not match src/status.json');
    }
    if (/^R\d{2}$/.test(entry.id)) {
      if (entry.category !== '复用与接入') reporter.error(entry.id + ' must use category 复用与接入');
      if (!sameArray(entry.consensus, R_CONSENSUS)) reporter.error(entry.id + ' consensus should be ' + R_CONSENSUS.join(', '));
      if (/^R0[1-6]$/.test(entry.id) && entry.userReview !== 'not-reviewed') reporter.error(entry.id + ' should remain not-reviewed in this batch');
      if (/^R(?:07|08|09|10)$/.test(entry.id) && entry.userReview !== 'positive-with-scope') reporter.error(entry.id + ' should be positive-with-scope');
    }
    if (entry.id === 'I06') {
      if (entry.category !== '共享基础与交付') reporter.error('I06 category must be 共享基础与交付');
      if (!sameArray(entry.consensus, I06_CONSENSUS)) reporter.error('I06 consensus should be ' + I06_CONSENSUS.join(', '));
      if (entry.userReview !== 'not-reviewed') reporter.error('I06 should be not-reviewed');
    }
    if (entry.id === 'I07') {
      if (entry.category !== '共享基础与交付') reporter.error('I07 category must be 共享基础与交付');
      if (!sameArray(entry.consensus, I07_CONSENSUS)) reporter.error('I07 consensus should be ' + I07_CONSENSUS.join(', '));
      if (entry.userReview !== 'not-reviewed') reporter.error('I07 should be not-reviewed');
    }
    if (typeof entry.demo === 'string' && entry.demo.includes('#')) {
      const split = splitDemoLocation(entry.demo);
      const abs = path.resolve(args.root, split.file);
      if (!existsFile(abs)) reporter.issue(entry.id + ' demo file is missing: ' + toPosix(split.file));
      else if (!hasDemoAssignment(fs.readFileSync(abs, 'utf8'), entry.id)) reporter.issue(entry.id + ' demo function is not defined in ' + toPosix(split.file));
    } else if (entry.demo === null || entry.demo === '') {
      const mod = (registry.modules || []).find((item) => item.module === entry.module);
      if (mod && Array.isArray(mod.demos) && mod.demos.length) {
        reporter.issue(entry.id + ' has demo files declared by its module but no demo location');
      }
    } else {
      reporter.issue(entry.id + ' demo location must be file#id or null');
    }
  }

  // Docs links from registry entries must resolve to real files and anchors.
  const docsLinksChecked = checkDocLinks(reporter, args.root, entries);
  if (docsLinksChecked) console.log('docs links checked: ' + docsLinksChecked);

  // Manifests must match the built registry; reading them again catches stale builds.
  const manifestDir = path.join(args.root, 'src', 'manifests');
  const manifests = [];
  if (!fs.existsSync(manifestDir)) reporter.error('src/manifests is missing');
  else {
    for (const name of fs.readdirSync(manifestDir).filter((item) => item.endsWith('.json')).sort()) {
      const file = path.join(manifestDir, name);
      manifests.push({ name: 'src/manifests/' + toPosix(name), data: readJson(file) });
    }
  }
  const manifestIds = new Set();
  for (const manifest of manifests) {
    if (!manifest.data || typeof manifest.data.module !== 'string') {
      reporter.error(manifest.name + ' has no module');
      continue;
    }
    if (!MODULE_ORDER.includes(manifest.data.module)) reporter.error(manifest.name + ' declares unknown module ' + manifest.data.module);
    for (const raw of Array.isArray(manifest.data.entries) ? manifest.data.entries : []) {
      if (!raw || typeof raw.id !== 'string') {
        reporter.error(manifest.name + ' has an entry without id');
        continue;
      }
      if (manifestIds.has(raw.id)) reporter.error('duplicate ID across manifests: ' + raw.id);
      manifestIds.add(raw.id);
      if (!entryById.has(raw.id)) reporter.error('manifest entry ' + raw.id + ' is absent from registry; rebuild');
    }
  }
  for (const id of entryById.keys()) {
    if (!manifestIds.has(id)) reporter.error('registry entry ' + id + ' is absent from manifests; rebuild');
  }
  checkManifestDemo(reporter, args.root, manifests, entryById);

  // Modules and dist headers.
  const moduleNames = new Set();
  for (const mod of Array.isArray(registry.modules) ? registry.modules : []) {
    if (!mod || typeof mod.module !== 'string') {
      reporter.error('registry.modules contains an invalid entry');
      continue;
    }
    if (!MODULE_ORDER.includes(mod.module)) reporter.error('registry.modules contains unknown module: ' + mod.module);
    if (moduleNames.has(mod.module)) reporter.error('registry.modules contains duplicate module: ' + mod.module);
    moduleNames.add(mod.module);
    const dist = Array.isArray(mod.dist) ? mod.dist : [];
    if (dist.length !== 2) reporter.error('module ' + mod.module + ' should have two dist files');
    for (const file of dist) {
      const abs = path.resolve(args.root, file);
      if (!existsFile(abs)) {
        reporter.issue('module dist is missing: ' + toPosix(file));
        continue;
      }
      const info = headerInfo(fs.readFileSync(abs, 'utf8'));
      if (!info) {
        reporter.error(toPosix(file) + ' has no /*! module header');
        continue;
      }
      if (info.module !== mod.module) reporter.error(toPosix(file) + ' header module is ' + info.module + ', expected ' + mod.module);
      if (!info.deps) reporter.error(toPosix(file) + ' header has no dependencies line');
      else if (!sameArray(info.deps.slice().sort(), (mod.dependencies || []).slice().sort())) {
        reporter.error(toPosix(file) + ' header deps [' + info.deps.join(', ') + '] do not match registry [' + (mod.dependencies || []).join(', ') + ']');
      }
      for (const dep of info.deps || []) {
        if (dep !== 'vendor' && dep !== 'none' && !MODULE_ORDER.includes(dep)) reporter.error(toPosix(file) + ' header has unknown dependency: ' + dep);
      }
    }
    if (!Array.isArray(mod.entries) || mod.entries.length !== mod.entries.filter((id) => entryById.has(id)).length) {
      reporter.error('module ' + mod.module + ' lists entries not present in registry.entries');
    }
    for (const id of mod.entries || []) {
      const entry = entryById.get(id);
      if (entry && entry.module !== mod.module) reporter.error(id + ' is listed under ' + mod.module + ' but entry.module=' + entry.module);
    }
  }
  for (const moduleName of MODULE_ORDER) {
    if (!moduleNames.has(moduleName)) reporter.issue('module has no built dist: ' + moduleName);
  }

  const expectedModuleOrder = MODULE_ORDER.filter((moduleName) => moduleNames.has(moduleName));
  if (!args.partial) {
    for (const moduleName of MODULE_ORDER) {
      if (!moduleNames.has(moduleName)) reporter.error('required module has no built dist: ' + moduleName);
    }
  }
  for (const expected of expectedModuleOrder) {
    const mod = (registry.modules || []).find((item) => item.module === expected);
    for (const dep of (mod && mod.dependencies) || []) {
      if (dep !== 'vendor' && dep !== 'none' && !moduleNames.has(dep)) {
        reporter.issue('module ' + expected + ' declares dependency ' + dep + ' but no ' + dep + ' module dist exists');
      }
    }
  }

  const fullJs = path.join(args.out, 'note-library.js');
  const fullCss = path.join(args.out, 'note-library.css');
  const registryJs = path.join(args.out, 'registry.js');
  for (const file of [fullJs, fullCss, registryJs]) {
    if (!existsFile(file)) reporter.issue('dist file is missing: ' + toPosix(path.relative(args.root, file)));
  }
  if (existsFile(fullJs)) {
    const source = fs.readFileSync(fullJs, 'utf8');
    const info = headerInfo(source);
    if (!info || !info.full) reporter.error('dist/note-library.js has no full bundle header');
    else if (!sameArray(info.modules || [], expectedModuleOrder)) {
      reporter.error('dist/note-library.js header module order does not match the built modules');
    }
  }
  if (existsFile(fullCss)) {
    const source = fs.readFileSync(fullCss, 'utf8');
    const info = headerInfo(source);
    if (!info || !info.full) reporter.error('dist/note-library.css has no full bundle header');
    else if (!sameArray(info.modules || [], expectedModuleOrder)) {
      reporter.error('dist/note-library.css header module order does not match the built modules');
    }
  }

  const contentMod = (registry.modules || []).find((item) => item.module === 'ui-content');
  if (contentMod) {
    const contentModuleJs = path.join(args.out, 'modules', 'ui-content.js');
    const contentModuleCss = path.join(args.out, 'modules', 'ui-content.css');
    if (!existsFile(contentModuleJs)) reporter.issue('ui-content module JavaScript is missing');
    else {
      const source = fs.readFileSync(contentModuleJs, 'utf8');
      const vendorCount = (source.match(/\/\* ---- vendor:/g) || []).length;
      if (vendorCount !== 2) reporter.error('ui-content module should embed marked and KaTeX exactly once (found ' + vendorCount + ' vendor markers)');
      if (!source.includes('marked 18.1.2 (MIT)') || !source.includes('KaTeX 0.19.1 (MIT)')) {
        reporter.error('ui-content module JavaScript is missing the marked/KaTeX vendor markers');
      }
    }
    if (!existsFile(contentModuleCss)) reporter.issue('ui-content module CSS is missing');
    else {
      const source = fs.readFileSync(contentModuleCss, 'utf8');
      const katexCount = (source.match(/KaTeX 0\.19\.1 CSS with woff2 fonts embedded/g) || []).length;
      if (katexCount !== 1) reporter.error('ui-content module should embed KaTeX CSS exactly once (found ' + katexCount + ')');
      if (!/data:font\/woff2;base64,/.test(source)) reporter.error('ui-content module CSS has no woff2 data URI');
    }
    if (existsFile(fullJs)) {
      const source = fs.readFileSync(fullJs, 'utf8');
      const fullVendorCount = (source.match(/\/\* ---- vendor:/g) || []).length;
      if (fullVendorCount !== 2) reporter.error('full JavaScript should embed marked/KaTeX exactly once (found ' + fullVendorCount + ' vendor markers)');
      const vendorIndex = source.indexOf('vendor: marked 18.1.2');
      const contentSourceMatch = source.match(/\/\* ---- source: [^\n]*ui\/content\.js[^\n]*\*\//);
      const contentSourceIndex = contentSourceMatch ? contentSourceMatch.index : -1;
      if (vendorIndex < 0 || contentSourceIndex < 0 || vendorIndex > contentSourceIndex) {
        reporter.error('full JavaScript must place vendor code after core and before ui/content.js');
      }
    }
    if (existsFile(fullCss)) {
      const source = fs.readFileSync(fullCss, 'utf8');
      const katexCount = (source.match(/KaTeX 0\.19\.1 CSS with woff2 fonts embedded/g) || []).length;
      if (katexCount !== 1) reporter.error('full CSS should embed KaTeX CSS exactly once (found ' + katexCount + ')');
      const katexIndex = source.indexOf('KaTeX 0.19.1 CSS with woff2 fonts embedded');
      const contentCssMatch = source.match(/\/\* ---- source: [^\n]*ui\/content\.css[^\n]*\*\//);
      const contentCssIndex = contentCssMatch ? contentCssMatch.index : -1;
      if (katexIndex < 0 || contentCssIndex < 0 || katexIndex > contentCssIndex) {
        reporter.error('full CSS must place KaTeX CSS before ui/content.css');
      }
    }
  }

  // Syntax and offline-only scan across generated JavaScript.
  const jsFiles = new Set();
  if (existsFile(fullJs)) jsFiles.add(fullJs);
  if (existsFile(registryJs)) jsFiles.add(registryJs);
  for (const mod of Array.isArray(registry.modules) ? registry.modules : []) {
    for (const file of Array.isArray(mod.dist) ? mod.dist : []) {
      if (String(file).endsWith('.js') && existsFile(path.resolve(args.root, file))) jsFiles.add(path.resolve(args.root, file));
    }
  }
  for (const file of jsFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const librarySource = stripVendorJs(source);
    const label = toPosix(path.relative(args.root, file));
    safeSyntaxCheck(source, label, errors);
    if (hasGlobalFetch(librarySource)) reporter.error(label + ' contains a global fetch() call');
    if (hasEval(librarySource)) reporter.error(label + ' contains eval()');
    if (hasExternalRuntimeResource(librarySource)) reporter.error(label + ' contains an external runtime resource URL');
    if (/XMLHttpRequest|WebSocket|sendBeacon/i.test(librarySource)) reporter.error(label + ' contains a networking API');
  }
  for (const demo of manifests) {
    for (const file of Array.isArray(demo.data.demos) ? demo.data.demos : []) {
      const abs = path.resolve(args.root, file);
      if (!existsFile(abs)) {
        reporter.issue('demo script not checked (missing): ' + toPosix(file));
        continue;
      }
      const source = fs.readFileSync(abs, 'utf8');
      safeSyntaxCheck(source, toPosix(file), errors);
      if (hasGlobalFetch(source)) reporter.error(toPosix(file) + ' contains fetch()');
      if (hasEval(source)) reporter.error(toPosix(file) + ' contains eval()');
    }
  }
  const cssFiles = new Set();
  if (existsFile(fullCss)) cssFiles.add(fullCss);
  for (const mod of Array.isArray(registry.modules) ? registry.modules : []) {
    for (const file of Array.isArray(mod.dist) ? mod.dist : []) {
      if (String(file).endsWith('.css') && existsFile(path.resolve(args.root, file))) cssFiles.add(path.resolve(args.root, file));
    }
  }
  for (const file of cssFiles) {
    const source = fs.readFileSync(file, 'utf8');
    if (cssReferencesLocal(source)) reporter.error(toPosix(path.relative(args.root, file)) + ' contains @import or a non-data local/external url()');
    if (/url\([^)]*fonts\//i.test(source)) reporter.error(toPosix(path.relative(args.root, file)) + ' contains an unresolved fonts/ URL');
  }

  // Self-contained preview.
  const preview = path.join(args.out, '组件库-预览.html');
  if (!existsFile(preview)) reporter.issue('self-contained preview is missing: dist/组件库-预览.html');
  else lintPreview(fs.readFileSync(preview, 'utf8'), errors);

  finish();

  function finish() {
    console.log('checked entries: ' + entries.length + ' · modules: ' + (registry.modules ? registry.modules.length : 0));
    if (warnings.length) console.log('warnings: ' + warnings.length);
    if (errors.length) {
      console.error('check failed with ' + errors.length + ' error(s)');
      process.exitCode = 1;
    } else {
      console.log('check ok');
    }
  }
}

try {
  main();
} catch (err) {
  console.error('[check] ' + (err && err.stack ? err.stack : err));
  process.exitCode = 1;
}