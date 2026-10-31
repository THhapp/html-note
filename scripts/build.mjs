#!/usr/bin/env node
/*
 * Offline build for the html-note component library.
 *
 * Inputs:
 *   src/manifests/*.json   module metadata + entries (the source of truth; 17 modules)
 *   src/status.json        technical/user-review status (read-only; never inferred)
 *   vendor/                KaTeX 0.19.1, marked 18.1.2
 *   gallery/index.html     optional during development; required for --final preview
 *
 * Outputs:
 *   dist/note-library.js|css, dist/modules/*.js|css, dist/registry.js
 *   registry.json, dist/组件库-预览.html (when the gallery exists)
 *
 * No dependencies. Classic scripts only. No timestamps in dist headers (the
 * registry keeps one build time so package output is otherwise reproducible).
 *
 * Usage:
 *   node scripts/build.mjs
 *   node scripts/build.mjs --final
 *   node scripts/build.mjs --final --release
 *   node scripts/build.mjs --root <library-root> --out <output-dir>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODULE_ORDER, orderedSources, uniqueStrings } from './lib/source-order.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..');
const CONTENT_MODULE = 'ui-content';
const VENDOR_JS = [
  { label: 'marked 18.1.2 (MIT)', file: 'vendor/marked/marked.umd.js' },
  { label: 'KaTeX 0.19.1 (MIT)', file: 'vendor/katex/katex.min.js' }
];
const KATEX_CSS = 'vendor/katex/katex.min.css';
const KATEX_DIR = 'vendor/katex';
const REQUIRED_ENTRY_FIELDS = [
  'id', 'name', 'cn', 'category', 'purpose', 'inputs', 'usage',
  'dependencies', 'limitations', 'userReview', 'reviewScope', 'consensus', 'docs'
];
const STATUS_VALUES = new Set(['planned', 'implemented', 'verified', 'blocked']);
const USER_REVIEW_VALUES = new Set(['not-reviewed', 'positive-with-scope', 'rejected']);
const MIME = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.css': 'text/css;charset=utf-8'
};

function parseArgs(argv) {
  const args = {
    final: false,
    release: false,
    help: false,
    root: DEFAULT_ROOT,
    out: null,
    releaseTarget: null
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--final') args.final = true;
    else if (arg === '--release') args.release = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--root') args.root = requireValue(argv, ++i, '--root');
    else if (arg.startsWith('--root=')) args.root = arg.slice('--root='.length);
    else if (arg === '--out') args.out = requireValue(argv, ++i, '--out');
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg === '--release-target') args.releaseTarget = requireValue(argv, ++i, '--release-target');
    else if (arg.startsWith('--release-target=')) args.releaseTarget = arg.slice('--release-target='.length);
    else throw new Error('Unknown argument: ' + arg);
  }
  args.root = path.resolve(process.cwd(), args.root);
  args.out = path.resolve(args.root, args.out || 'dist');
  args.releaseTarget = args.releaseTarget
    ? path.resolve(process.cwd(), args.releaseTarget)
    : path.resolve(args.root, 'dist', '组件库-预览-发布.html');
  return args;
}

function requireValue(argv, index, name) {
  if (index >= argv.length || argv[index].startsWith('--')) throw new Error(name + ' requires a value');
  return argv[index];
}

function toPosix(file) {
  return String(file).replace(/\\/g, '/');
}

function relativePath(root, file) {
  return toPosix(path.relative(root, file));
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

function freshLine(value) {
  return String(value == null ? '' : value).replace(/\r\n?/g, '\n').trimEnd();
}

function classList(value) {
  return Array.isArray(value) ? value : [];
}

function buildTime() {
  if (process.env.BUILD_TIMESTAMP) {
    const parsed = new Date(process.env.BUILD_TIMESTAMP);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (process.env.SOURCE_DATE_EPOCH) {
    const seconds = Number(process.env.SOURCE_DATE_EPOCH);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString();
  }
  return new Date().toISOString();
}

function createReporter(final) {
  const warnings = [];
  const errors = [];
  return {
    warnings,
    errors,
    warn(message) {
      warnings.push(message);
      console.warn('[warn] ' + message);
    },
    error(message) {
      errors.push(message);
      console.error('[error] ' + message);
    },
    issue(message) {
      if (final) this.error(message);
      else this.warn(message);
    }
  };
}

function readJson(file) {
  let source;
  try {
    source = readText(file);
  } catch (err) {
    throw new Error('Cannot read ' + file + ': ' + err.message);
  }
  try {
    return JSON.parse(source);
  } catch (err) {
    throw new Error('Invalid JSON in ' + file + ': ' + err.message);
  }
}

function loadExpected(root) {
  const file = path.join(root, 'scripts', 'expected-ids.json');
  const data = readJson(file);
  const ids = [];
  const byId = new Map();
  const categories = [];
  for (const group of data.groups || []) {
    if (!categories.includes(group.category)) categories.push(group.category);
    for (const id of group.ids || []) {
      if (byId.has(id)) throw new Error('expected-ids.json contains duplicate ID: ' + id);
      byId.set(id, group.category);
      ids.push(id);
    }
  }
  const declaredTotal = data && data.counts && Number.isFinite(data.counts.total) ? data.counts.total : 101;
  if (ids.length !== declaredTotal) {
    throw new Error('expected-ids.json should contain ' + declaredTotal + ' IDs (counts.total), found ' + ids.length);
  }
  return { ids, byId, categories, raw: data };
}

function readStatus(root) {
  const file = path.join(root, 'src', 'status.json');
  const data = readJson(file);
  if (!data || typeof data !== 'object' || !data.entries) throw new Error('src/status.json must contain an entries object');
  return data;
}

function collectManifests(root, reporter) {
  const dir = path.join(root, 'src', 'manifests');
  if (!fs.existsSync(dir)) {
    reporter.issue('manifest directory is missing: src/manifests');
    return [];
  }
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
  const manifests = [];
  for (const name of files) {
    const file = path.join(dir, name);
    const data = readJson(file);
    manifests.push({ file, name: 'src/manifests/' + toPosix(name), data });
  }
  return manifests;
}

function mergeManifests(manifests, expected, reporter) {
  const modules = new Map();
  const entries = [];
  const seenIds = new Map();

  for (const manifest of manifests) {
    const data = manifest.data;
    if (!data || typeof data !== 'object' || typeof data.module !== 'string' || !data.module) {
      reporter.issue(manifest.name + ' has no string module field; skipped');
      continue;
    }
    if (!MODULE_ORDER.includes(data.module)) {
      reporter.issue(manifest.name + ' declares unknown module "' + data.module + '"; skipped');
      continue;
    }
    if (!modules.has(data.module)) {
      modules.set(data.module, {
        module: data.module,
        title: typeof data.title === 'string' ? data.title : '',
        dependencies: [],
        manifestFiles: [],
        js: [],
        css: [],
        demos: [],
        entries: []
      });
    }
    const mod = modules.get(data.module);
    mod.manifestFiles.push(manifest.name);
    if (typeof data.title === 'string' && data.title) mod.title = mod.title || data.title;
    if (!Array.isArray(data.js)) reporter.issue(manifest.name + ' js should be an array');
    if (!Array.isArray(data.css)) reporter.issue(manifest.name + ' css should be an array');
    if (!Array.isArray(data.demos)) reporter.issue(manifest.name + ' demos should be an array');
    if (!Array.isArray(data.dependencies)) reporter.issue(manifest.name + ' dependencies should be an array');
    if (!Array.isArray(data.entries)) {
      reporter.issue(manifest.name + ' entries should be an array');
      continue;
    }
    mod.js.push(...classList(data.js));
    mod.css.push(...classList(data.css));
    mod.demos.push(...classList(data.demos));
    mod.dependencies.push(...classList(data.dependencies));

    for (const rawEntry of data.entries) {
      if (!rawEntry || typeof rawEntry !== 'object' || typeof rawEntry.id !== 'string' || !rawEntry.id) {
        reporter.error(manifest.name + ' contains an entry without a valid id');
        continue;
      }
      const id = rawEntry.id;
      if (seenIds.has(id)) {
        throw new Error('Duplicate registry ID ' + id + ' in ' + manifest.name + ' and ' + seenIds.get(id));
      }
      seenIds.set(id, manifest.name);
      const missing = REQUIRED_ENTRY_FIELDS.filter((field) => {
        const value = rawEntry[field];
        if (field === 'inputs' || field === 'dependencies' || field === 'limitations' || field === 'consensus') return !Array.isArray(value);
        return typeof value !== 'string' || !value.trim();
      });
      if (missing.length) reporter.issue(manifest.name + ' entry ' + id + ' is missing/invalid required fields: ' + missing.join(', '));
      if (!expected.byId.has(id)) reporter.issue(manifest.name + ' entry ' + id + ' is not in expected-ids.json');
      else if (rawEntry.category !== expected.byId.get(id)) {
        reporter.issue('entry ' + id + ' category "' + rawEntry.category + '" should be "' + expected.byId.get(id) + '"');
      }
      if (!USER_REVIEW_VALUES.has(rawEntry.userReview)) {
        reporter.issue('entry ' + id + ' has invalid userReview: ' + rawEntry.userReview);
      }
      const entry = Object.assign({}, rawEntry, {
        __module: data.module,
        __manifest: manifest.name
      });
      entries.push(entry);
      mod.entries.push(entry);
    }
  }

  for (const mod of modules.values()) {
    mod.js = uniqueStrings(mod.js);
    mod.css = uniqueStrings(mod.css);
    mod.demos = uniqueStrings(mod.demos);
    mod.dependencies = uniqueStrings(mod.dependencies);
    for (const dep of mod.dependencies) {
      if (dep !== 'vendor' && !MODULE_ORDER.includes(dep)) {
        reporter.issue('module ' + mod.module + ' declares unknown dependency "' + dep + '"');
      }
    }
    if (mod.module !== 'core' && mod.entries.length && !mod.demos.length) {
      reporter.issue('module ' + mod.module + ' declares entries but no gallery demo files');
    }
  }
  return { modules, entries };
}

function moduleDependencies(mod) {
  const deps = uniqueStrings(mod.dependencies);
  if (mod.module === CONTENT_MODULE && !deps.includes('vendor')) deps.push('vendor');
  return deps;
}

function header(kind, mod, deps) {
  return '/*! note-library module: ' + mod.module + '\n' +
    ' * dependencies: ' + (deps.length ? deps.join(', ') : 'none') + '\n' +
    ' * type: ' + kind + '\n' +
    ' * generated-by: scripts/build.mjs; do-not-edit.\n' +
    ' */\n';
}

function makeChunk(label, content) {
  return '/* ---- ' + label + ' ---- */\n' + freshLine(content) + '\n';
}

function concatChunks(chunks) {
  return chunks.map((chunk) => freshLine(chunk)).filter(Boolean).join('\n\n') + '\n';
}

function buildKatexCss(root, reporter) {
  const cssFile = path.join(root, KATEX_CSS);
  let css;
  try {
    css = readText(cssFile);
  } catch (err) {
    reporter.issue('cannot read KaTeX CSS (' + KATEX_CSS + '): ' + err.message);
    return '';
  }
  let missing = false;
  css = css.replace(/@font-face\{[^}]*\}/g, (block) => {
    const match = block.match(/url\((?:["']?)([^"')]+\.woff2)(?:["']?)\)\s*format\(["']woff2["']\)/i) ||
      block.match(/url\((?:["']?)([^"')]+\.woff2)(?:["']?)\)/i);
    if (!match) {
      missing = true;
      return block;
    }
    const rel = match[1];
    const file = path.resolve(path.dirname(cssFile), rel);
    if (!existsFile(file)) {
      missing = true;
      reporter.issue('KaTeX woff2 font is missing: ' + relativePath(root, file));
      return block;
    }
    const data = fs.readFileSync(file).toString('base64');
    const prefix = block.slice(0, block.indexOf('src:'));
    const rest = block.slice(block.indexOf('src:'));
    const suffix = rest.slice(rest.indexOf('}'));
    return prefix + 'src:url(data:font/woff2;base64,' + data + ') format("woff2")' + suffix;
  });
  if (missing) reporter.issue('KaTeX CSS still contains an unresolved font reference; preview/dist fonts may be incomplete');
  if (/url\([^)]*fonts\//i.test(css)) {
    reporter.issue('KaTeX CSS contains an unresolved fonts/ URL after font inlining');
  }
  return '/*! KaTeX 0.19.1 CSS with woff2 fonts embedded as data URIs (MIT). */\n' + freshLine(css) + '\n';
}

function normalizeEntry(raw, mod, expected, statusData, reporter, root, outDir) {
  const id = raw.id;
  const entryDeps = Array.isArray(raw.dependencies) && raw.dependencies.length
    ? uniqueStrings(raw.dependencies)
    : moduleDependencies(mod);
  const moduleJs = orderedSources(mod, 'js');
  const moduleCss = orderedSources(mod, 'css');
  const moduleDist = [
    relativePath(root, path.join(outDir, 'modules', mod.module + '.js')),
    relativePath(root, path.join(outDir, 'modules', mod.module + '.css')),
    relativePath(root, path.join(outDir, 'note-library.js')),
    relativePath(root, path.join(outDir, 'note-library.css'))
  ];
  const source = Array.isArray(raw.source) && raw.source.length
    ? uniqueStrings(raw.source)
    : uniqueStrings(moduleJs.concat(moduleCss));
  const dist = Array.isArray(raw.dist) && raw.dist.length
    ? uniqueStrings(raw.dist)
    : moduleDist;
  const statusEntry = statusData.entries && statusData.entries[id];
  if (!statusEntry) reporter.issue('src/status.json has no entry for ' + id + '; using planned');
  const status = statusEntry && typeof statusEntry.status === 'string' ? statusEntry.status : 'planned';
  if (!STATUS_VALUES.has(status)) reporter.issue('src/status.json has invalid status for ' + id + ': ' + status);
  const verification = statusEntry && Array.isArray(statusEntry.verification) ? statusEntry.verification.slice() : [];
  const demo = raw.demo || firstDemoFor(mod, id, root);
  const preview = raw.preview || ('gallery/index.html#' + id);
  const example = raw.example || ('examples/run.html?id=' + id);
  const entry = {
    id,
    name: raw.name,
    cn: raw.cn,
    category: raw.category,
    module: mod.module,
    purpose: raw.purpose,
    inputs: classList(raw.inputs).slice(),
    customizable: classList(raw.customizable).slice(),
    states: classList(raw.states).slice(),
    usage: raw.usage,
    dependencies: entryDeps,
    source,
    dist,
    demo,
    preview,
    example,
    limitations: classList(raw.limitations).slice(),
    status,
    verification,
    userReview: raw.userReview,
    reviewScope: raw.reviewScope,
    consensus: classList(raw.consensus).slice(),
    docs: raw.docs,
    notes: typeof raw.notes === 'string' ? raw.notes : ''
  };
  return entry;
}

function firstDemoFor(mod, id, root) {
  if (!mod.demos.length) return null;
  for (const demoFile of mod.demos) {
    const abs = path.resolve(root, demoFile);
    if (!existsFile(abs)) continue;
    let source = '';
    try {
      source = readText(abs);
    } catch {
      continue;
    }
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp('(?:demo|demos|window\\.NoteGalleryDemos)\\s*\\[\\s*["\']' + escaped + '["\']\\s*\\]'),
      new RegExp('\\[\\s*["\']' + escaped + '["\']\\s*\\]\\s*=\\s*(?:function|\\()'),
      new RegExp('\\.' + escaped + '\\s*=\\s*(?:function|\\()'),
      new RegExp('["\']' + escaped + '["\']\\s*:\\s*(?:function|\\()')
    ];
    if (patterns.some((pattern) => pattern.test(source))) return toPosix(demoFile) + '#' + id;
  }
  return (mod.demos[0] ? toPosix(mod.demos[0]) : 'gallery/index.html') + '#' + id;
}

function countBy(items, key, keys) {
  const counts = {};
  for (const value of keys) counts[value] = 0;
  for (const item of items) {
    const value = item[key];
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function collectSourceIssues(root, modules, entries, reporter) {
  for (const mod of modules.values()) {
    for (const file of mod.js.concat(mod.css)) {
      const abs = path.resolve(root, file);
      if (!existsFile(abs)) reporter.issue('source is missing for module ' + mod.module + ': ' + toPosix(file));
    }
    for (const file of mod.demos) {
      const abs = path.resolve(root, file);
      if (!existsFile(abs)) reporter.issue('demo file is missing for module ' + mod.module + ': ' + toPosix(file));
    }
  }
  for (const entry of entries) {
    for (const file of Array.isArray(entry.source) ? entry.source : []) {
      if (/^[a-z]+:/i.test(file) || file.startsWith('//')) {
        reporter.issue(entry.id + ' source should be a local relative path: ' + file);
        continue;
      }
      const abs = path.resolve(root, file);
      if (!existsFile(abs)) reporter.issue(entry.id + ' source is missing: ' + toPosix(file));
    }
  }
}

function prepareOutput(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.rmSync(path.join(outDir, 'modules'), { recursive: true, force: true });
  for (const file of ['note-library.js', 'note-library.css', 'registry.js', '组件库-预览.html']) {
    fs.rmSync(path.join(outDir, file), { force: true });
  }
  fs.mkdirSync(path.join(outDir, 'modules'), { recursive: true });
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function safeReadSource(root, rel, reporter) {
  const abs = path.resolve(root, rel);
  if (!existsFile(abs)) {
    reporter.issue('cannot include missing source: ' + toPosix(rel));
    return '';
  }
  try {
    return readText(abs);
  } catch (err) {
    reporter.issue('cannot read source ' + toPosix(rel) + ': ' + err.message);
    return '';
  }
}

function buildBundles(args, modules, entries, reporter) {
  const katexCss = modules.has(CONTENT_MODULE) ? buildKatexCss(args.root, reporter) : '';
  const moduleOutputs = new Map();

  for (const moduleName of MODULE_ORDER) {
    const mod = modules.get(moduleName);
    if (!mod) continue;
    const deps = moduleDependencies(mod);
    const jsChunks = [];
    const cssChunks = [];
    const js = orderedSources(mod, 'js');
    const css = orderedSources(mod, 'css');

    if (moduleName === CONTENT_MODULE) {
      for (const vendor of VENDOR_JS) {
        const source = safeReadSource(args.root, vendor.file, reporter);
        if (source) jsChunks.push(makeChunk('vendor: ' + vendor.label, source));
      }
    }
    for (const file of js) {
      const source = safeReadSource(args.root, file, reporter);
      if (source) jsChunks.push(makeChunk('source: ' + toPosix(file), source));
    }
    if (moduleName === CONTENT_MODULE && katexCss) cssChunks.push(katexCss);
    for (const file of css) {
      const source = safeReadSource(args.root, file, reporter);
      if (source) cssChunks.push(makeChunk('source: ' + toPosix(file), source));
    }

    const jsOut = header('JavaScript', mod, deps) + '\n' + concatChunks(jsChunks);
    const cssOut = header('CSS', mod, deps) + '\n' + concatChunks(cssChunks);
    const jsRel = path.join('modules', moduleName + '.js');
    const cssRel = path.join('modules', moduleName + '.css');
    const jsPath = path.join(args.out, jsRel);
    const cssPath = path.join(args.out, cssRel);
    writeFile(jsPath, jsOut);
    writeFile(cssPath, cssOut);
    moduleOutputs.set(moduleName, {
      js: jsPath,
      css: cssPath,
      jsRel: relativePath(args.root, jsPath),
      cssRel: relativePath(args.root, cssPath),
      deps
    });
  }

  const fullJsChunks = [];
  const fullCssChunks = [];
  const presentModules = [];
  for (const moduleName of MODULE_ORDER) {
    const mod = modules.get(moduleName);
    if (!mod) continue;
    presentModules.push(moduleName);
    if (moduleName === CONTENT_MODULE) {
      for (const vendor of VENDOR_JS) {
        const source = safeReadSource(args.root, vendor.file, reporter);
        if (source) fullJsChunks.push(makeChunk('vendor: ' + vendor.label, source));
      }
    }
    for (const file of orderedSources(mod, 'js')) {
      const source = safeReadSource(args.root, file, reporter);
      if (source) fullJsChunks.push(makeChunk('source: ' + toPosix(file), source));
    }
    if (moduleName === CONTENT_MODULE && katexCss) fullCssChunks.push(katexCss);
    for (const file of orderedSources(mod, 'css')) {
      const source = safeReadSource(args.root, file, reporter);
      if (source) fullCssChunks.push(makeChunk('source: ' + toPosix(file), source));
    }
  }

  const fullJsHeader = '/*! note-library full bundle (JavaScript)\n' +
    ' * modules: ' + (presentModules.join(', ') || '(none)') + '\n' +
    ' * vendor: marked 18.1.2 + KaTeX 0.19.1 embedded once at ui-content\n' +
    ' * generated-by: scripts/build.mjs; do-not-edit.\n' +
    ' */\n';
  const fullCssHeader = '/*! note-library full bundle (CSS)\n' +
    ' * modules: ' + (presentModules.join(', ') || '(none)') + '\n' +
    ' * vendor: KaTeX 0.19.1 CSS with embedded woff2 at ui-content\n' +
    ' * generated-by: scripts/build.mjs; do-not-edit.\n' +
    ' */\n';
  const fullJsPath = path.join(args.out, 'note-library.js');
  const fullCssPath = path.join(args.out, 'note-library.css');
  writeFile(fullJsPath, fullJsHeader + '\n' + concatChunks(fullJsChunks));
  writeFile(fullCssPath, fullCssHeader + '\n' + concatChunks(fullCssChunks));
  return { katexCss, moduleOutputs, presentModules, fullJsPath, fullCssPath };
}

function makeRegistry(args, expected, statusData, modules, entries, bundleInfo, reporter) {
  const actualExpected = entries.filter((entry) => expected.byId.has(entry.id));
  const presentIds = new Set(entries.map((entry) => entry.id));
  const missingIds = expected.ids.filter((id) => !presentIds.has(id));
  const byStatus = countBy(actualExpected, 'status', [...STATUS_VALUES]);
  const byCategory = countBy(actualExpected, 'category', expected.categories);
  const moduleList = [];
  for (const moduleName of MODULE_ORDER) {
    const mod = modules.get(moduleName);
    if (!mod) continue;
    const output = bundleInfo.moduleOutputs.get(moduleName);
    moduleList.push({
      module: moduleName,
      title: mod.title,
      dependencies: moduleDependencies(mod),
      manifests: mod.manifestFiles.slice(),
      js: orderedSources(mod, 'js'),
      css: orderedSources(mod, 'css'),
      demos: mod.demos.slice(),
      dist: output ? [output.jsRel, output.cssRel] : [],
      entries: mod.entries.map((entry) => entry.id)
    });
  }
  const sortedEntries = entries.slice().sort((a, b) => {
    const ai = expected.ids.indexOf(a.id);
    const bi = expected.ids.indexOf(b.id);
    if (ai !== -1 || bi !== -1) {
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }
    return a.id.localeCompare(b.id);
  });
  const build = {
    time: buildTime(),
    mode: args.final ? 'final' : 'development',
    command: 'node scripts/build.mjs' + (args.final ? ' --final' : '') + (args.release ? ' --release' : ''),
    moduleOrder: MODULE_ORDER.slice(),
    outputDir: relativePath(args.root, args.out),
    outputs: [
      relativePath(args.root, bundleInfo.fullJsPath),
      relativePath(args.root, bundleInfo.fullCssPath),
      relativePath(args.root, path.join(args.out, 'registry.js')),
      'registry.json'
    ],
    vendor: {
      marked: '18.1.2',
      katex: '0.19.1',
      lucide: '1.62.0'
    }
  };
  return {
    schemaVersion: 1,
    generatedBy: 'scripts/build.mjs',
    build,
    statusLegend: statusData.statusLegend || {},
    counts: {
      total: sortedEntries.length,
      expected: expected.ids.length,
      missing: missingIds.length,
      extra: entries.filter((entry) => !expected.byId.has(entry.id)).length,
      byStatus,
      byCategory
    },
    missingIds,
    modules: moduleList,
    entries: sortedEntries
  };
}

function normalizeHref(value) {
  return String(value || '').replace(/&amp;/gi, '&').trim();
}

function isExternalResource(value) {
  return /^(?:https?:)?\/\//i.test(value.trim());
}

function isDataOrSpecial(value) {
  return /^(?:data:|blob:|#|mailto:|tel:|javascript:|about:)/i.test(value.trim());
}

function dataUriFor(file) {
  const ext = path.extname(file).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  return 'data:' + mime + ';base64,' + fs.readFileSync(file).toString('base64');
}

function inlineCssUrls(css, baseDir, context, errors) {
  // Keep comments opaque so examples such as `url(fonts/example.woff2)` inside
  // explanatory text are not mistaken for live resources.
  const comments = [];
  let masked = String(css).replace(/\/\*[\s\S]*?\*\//g, (comment) => {
    const token = '\u0000HNVCSSCOMMENT' + comments.length + '\u0000';
    comments.push(comment);
    return token;
  });
  masked = masked.replace(/url\(\s*(?:(["'])(.*?)\1|([^)"']*))\s*\)/gi, (whole, quote, quoted, raw) => {
    const value = normalizeHref(quoted !== undefined ? quoted : raw);
    if (!value || isDataOrSpecial(value)) return whole;
    if (isExternalResource(value)) {
      errors.push(context + ' references an external CSS URL: ' + value);
      return whole;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return whole;
    const clean = value.split('#')[0].split('?')[0];
    if (!clean) return whole;
    const abs = path.resolve(baseDir, clean);
    if (!existsFile(abs)) {
      errors.push(context + ' references a missing local CSS asset: ' + clean);
      return whole;
    }
    return 'url("' + dataUriFor(abs) + '")';
  });
  return masked.replace(/\u0000HNVCSSCOMMENT(\d+)\u0000/g, (whole, index) => comments[Number(index)] || '');
}

function getAttr(attrs, name) {
  const re = new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i');
  const match = String(attrs).match(re);
  if (!match) return null;
  return normalizeHref(match[1] !== undefined ? match[1] : match[2] !== undefined ? match[2] : match[3]);
}

function removeAttr(attrs, name) {
  const re = new RegExp('\\s+\\b' + name + '\\s*=\\s*(?:"[^"]*"|\'[^\']*\'|[^\\s>]+)', 'gi');
  return String(attrs).replace(re, '');
}

function replaceAttr(tag, name, replacement) {
  const re = new RegExp('(\\b' + name + '\\s*=\\s*)(?:"[^"]*"|\'[^\']*\'|[^\\s>]+)', 'i');
  return tag.replace(re, (match, prefix) => prefix + '"' + replacement.replace(/"/g, '&quot;') + '"');
}

function inlineResourceValue(value, baseDir, context, errors) {
  const cleanValue = normalizeHref(value);
  if (!cleanValue || isDataOrSpecial(cleanValue)) return null;
  if (isExternalResource(cleanValue)) {
    errors.push(context + ' references an external resource: ' + cleanValue);
    return null;
  }
  const file = cleanValue.split('#')[0].split('?')[0];
  if (!file || /^[a-z][a-z0-9+.-]*:/i.test(file)) return null;
  const abs = path.resolve(baseDir, file);
  if (!existsFile(abs)) {
    errors.push(context + ' references a missing local asset: ' + file);
    return null;
  }
  return dataUriFor(abs);
}

function inlineStylesheet(attrs, baseDir, galleryDir, errors) {
  const href = getAttr(attrs, 'href');
  if (href === null) return '';
  const context = 'gallery stylesheet ' + href;
  let css = '';
  if (isExternalResource(href)) {
    errors.push(context + ' is external and cannot be inlined');
    return '';
  }
  if (href.startsWith('data:')) {
    const comma = href.indexOf(',');
    css = comma >= 0 ? decodeURIComponent(href.slice(comma + 1)) : '';
  } else {
    const file = href.split('#')[0].split('?')[0];
    const abs = path.resolve(baseDir, file);
    if (!existsFile(abs)) {
      errors.push(context + ' is missing');
      return '';
    }
    css = readText(abs);
    baseDir = path.dirname(abs);
  }
  css = inlineCssUrls(css, baseDir, context, errors);
  const cleaned = removeAttr(removeAttr(removeAttr(removeAttr(removeAttr(removeAttr(attrs, 'rel'), 'href'), 'type'), 'integrity'), 'crossorigin'), 'referrerpolicy');
  return '<style' + cleaned.replace(/\s*\/\s*$/, '') + '>\n' + css + '\n</style>';
}

function inlineStyleBlocks(html, baseDir, errors) {
  return html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi, (whole, attrs, css) => {
    return '<style' + attrs + '>' + inlineCssUrls(css, baseDir, 'gallery inline style', errors) + '</style>';
  });
}

function inlineStyleAttributes(html, baseDir, errors) {
  return html.replace(/(\bstyle\s*=\s*)(["'])([\s\S]*?)\2/gi, (whole, prefix, quote, css) => {
    return prefix + quote + inlineCssUrls(css, baseDir, 'gallery style attribute', errors).replace(new RegExp(quote, 'g'), quote === '"' ? '&quot;' : '&#39;') + quote;
  });
}

function inlineScripts(html, baseDir, errors) {
  return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (whole, attrs, body) => {
    const src = getAttr(attrs, 'src');
    if (src === null) return whole;
    const scriptType = getAttr(attrs, 'type') || '';
    if (/\bmodule\b/i.test(scriptType)) {
      errors.push('gallery script is an ES module and cannot be inlined as a classic script: ' + src);
      return '';
    }
    if (isExternalResource(src)) {
      errors.push('gallery script is external: ' + src);
      return '';
    }
    const file = src.split('#')[0].split('?')[0];
    const abs = path.resolve(baseDir, file);
    if (!existsFile(abs)) {
      errors.push('gallery script is missing: ' + file);
      return '';
    }
    let js = readText(abs).replace(/<\/script/gi, '<\\/script');
    let cleaned = attrs;
    for (const name of ['src', 'integrity', 'crossorigin', 'referrerpolicy', 'async', 'defer']) {
      cleaned = removeAttr(cleaned, name);
    }
    return '<script' + cleaned + '>\n' + js + '\n</script>';
  });
}

function inlineImages(html, baseDir, errors) {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    let out = tag;
    const src = getAttr(tag, 'src');
    if (src !== null) {
      const data = inlineResourceValue(src, baseDir, 'gallery image', errors);
      if (data) out = replaceAttr(out, 'src', data);
    }
    const srcset = getAttr(tag, 'srcset');
    if (srcset && !/^(?:data:|https?:|\/\/)/i.test(srcset.trim())) {
      const parts = srcset.split(',').map((part) => {
        const bits = part.trim().split(/\s+/);
        const data = inlineResourceValue(bits[0], baseDir, 'gallery image srcset', errors);
        return data ? (data + (bits.length > 1 ? ' ' + bits.slice(1).join(' ') : '')) : part.trim();
      });
      out = replaceAttr(out, 'srcset', parts.join(', '));
    }
    return out;
  });
}

function neutralizeLinks(html) {
  let changed = 0;
  html = html.replace(/<a\b[^>]*>/gi, (tag) => {
    const href = getAttr(tag, 'href');
    if (href === null || href.startsWith('#')) return tag;
    if (!/^(?:https?:|mailto:|tel:|javascript:)/i.test(href) && !href.startsWith('//')) {
      // Relative anchors point outside a self-contained single file.
    }
    changed += 1;
    return replaceAttr(tag, 'href', '#');
  });
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (/\brel\s*=\s*["']?stylesheet/i.test(tag)) return tag;
    const href = getAttr(tag, 'href');
    if (href === null) return tag;
    if (/\brel\s*=\s*["']?(?:icon|shortcut icon)/i.test(tag) && href.startsWith('data:')) return tag;
    changed += 1;
    return /\brel\s*=\s*["']?(?:icon|shortcut icon)/i.test(tag)
      ? replaceAttr(tag, 'href', 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E')
      : '';
  });
  return { html, changed };
}

function checkSingleFile(html, errors) {
  const issues = [];
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
  if (/<script\b[^>]*\bsrc\s*=/i.test(withoutComments)) issues.push('single-file preview still has <script src=>');
  if (/<link\b[^>]*\brel\s*=\s*["']?stylesheet[^>]*\bhref\s*=/i.test(withoutComments)) issues.push('single-file preview still has a stylesheet link');
  if (/<base\b/i.test(withoutComments)) issues.push('single-file preview still has <base>');

  const markup = withoutComments
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '<script></script>')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '<style></style>');
  const resourceAttrs = markup.match(/\b(?:src|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi) || [];
  for (const attr of resourceAttrs) {
    const value = attr.replace(/^\w+\s*=\s*/, '').replace(/^["']|["']$/g, '');
    if (!/^data:/i.test(value) && !/^#/.test(value)) issues.push('single-file preview has a non-data resource reference: ' + attr);
  }
  const links = markup.match(/<link\b[^>]*>/gi) || [];
  for (const tag of links) {
    if (/\bhref\s*=/i.test(tag) && !/\bhref\s*=\s*["']?data:/i.test(tag) && !/\bhref\s*=\s*["']?#/.test(tag)) {
      issues.push('single-file preview has a non-data <link>: ' + tag.slice(0, 100));
    }
  }
  if (/(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i.test(markup)) issues.push('single-file preview has an external resource attribute');

  const cssBlocks = [];
  const styleMatches = withoutComments.match(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi) || [];
  for (const block of styleMatches) {
    const css = block.replace(/^<style\b[^>]*>/i, '').replace(/<\/style\s*>$/i, '').replace(/\/\*[\s\S]*?\*\//g, '');
    cssBlocks.push(css);
    if (/@import\b/i.test(css)) issues.push('single-file preview CSS still has @import');
    if (/url\(\s*(?:["']?)(?:https?:)?\/\//i.test(css)) issues.push('single-file preview CSS still has an external URL');
    if (/url\(\s*(?:["']?)(?!data:|#)[^)"']+/i.test(css)) issues.push('single-file preview CSS still has a local url()');
    if (/url\([^)]*fonts\//i.test(css)) issues.push('single-file preview CSS still has an unresolved fonts/ URL');
  }
  const styleAttrs = markup.match(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi) || [];
  for (const attr of styleAttrs) {
    const css = attr.replace(/\/\*[\s\S]*?\*\//g, '');
    if (/url\(\s*(?:["']?)(?:https?:)?\/\//i.test(css)) issues.push('single-file preview style attribute has an external URL');
    if (/url\(\s*(?:["']?)(?!data:|#)[^)"']+/i.test(css)) issues.push('single-file preview style attribute has a local url()');
  }
  for (const issue of issues) errors.push(issue);
}

function collectExampleAssets(root) {
  const base = path.join(root, 'examples', 'assets');
  if (!fs.existsSync(base)) return {};
  const assets = {};
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!MIME[ext] || !/^(?:image\/|font\/)/.test(MIME[ext])) continue;
      const rel = toPosix(path.relative(base, abs));
      assets['examples/assets/' + rel] = dataUriFor(abs);
    }
  }
  walk(base);
  return assets;
}

function makePreviewAssetShim(root) {
  const assets = collectExampleAssets(root);
  if (!Object.keys(assets).length) return '';
  const map = JSON.stringify(assets);
  const code = `(function () {
  'use strict';
  var assets = ${map};
  function resolve(value) {
    if (typeof value !== 'string' || !value) return value;
    var clean = value.split('#')[0].split('?')[0].split(String.fromCharCode(92)).join('/');
    for (var key in assets) {
      if (!Object.prototype.hasOwnProperty.call(assets, key)) continue;
      if (clean === key || clean.slice(-(key.length + 1)) === '/' + key) return assets[key];
    }
    return value;
  }
  var setAttribute = Element.prototype.setAttribute;
  if (setAttribute && !setAttribute.__notePreviewPatched) {
    var patched = function (name, value) {
      var attr = String(name).toLowerCase();
      if (attr === 'src' || attr === 'href' || attr === 'poster') value = resolve(value);
      return setAttribute.call(this, name, value);
    };
    patched.__notePreviewPatched = true;
    Element.prototype.setAttribute = patched;
  }
  function patchProperty(proto, property) {
    if (!proto) return;
    try {
      var descriptor = Object.getOwnPropertyDescriptor(proto, property);
      if (!descriptor || !descriptor.set || descriptor.set.__notePreviewPatched) return;
      var setter = function (value) { descriptor.set.call(this, resolve(value)); };
      setter.__notePreviewPatched = true;
      Object.defineProperty(proto, property, {
        configurable: true,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
        set: setter
      });
    } catch (error) { /* best effort */ }
  }
  patchProperty(window.HTMLImageElement && HTMLImageElement.prototype, 'src');
  patchProperty(window.HTMLSourceElement && HTMLSourceElement.prototype, 'src');
  patchProperty(window.HTMLAnchorElement && HTMLAnchorElement.prototype, 'href');
})();`;
  return '<script id="note-preview-assets">' + code.replace(/<\/script/gi, '<\\/script') + '</script>';
}

function buildPreview(args, reporter) {
  const galleryPath = path.join(args.root, 'gallery', 'index.html');
  if (!existsFile(galleryPath)) {
    reporter.issue('gallery/index.html is not ready; self-contained preview skipped');
    return null;
  }
  let html;
  try {
    html = readText(galleryPath);
  } catch (err) {
    reporter.issue('cannot read gallery/index.html: ' + err.message);
    return null;
  }
  const galleryDir = path.dirname(galleryPath);
  const errors = [];
  let baseTags = 0;
  html = html.replace(/<base\b[^>]*>/gi, () => { baseTags += 1; return ''; });
  if (baseTags) reporter.warn('removed <base> from single-file preview to keep local resolution predictable');
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/\brel\s*=\s*["']?stylesheet/i.test(tag)) return tag;
    return inlineStylesheet(tag.replace(/^<link/i, '').replace(/>$/, ''), galleryDir, galleryDir, errors);
  });
  html = inlineStyleBlocks(html, galleryDir, errors);
  html = inlineStyleAttributes(html, galleryDir, errors);
  // Do markup-level image/link work before external JS is inserted so source
  // strings inside gallery scripts can never be mistaken for HTML attributes.
  html = inlineImages(html, galleryDir, errors);
  const neutralized = neutralizeLinks(html);
  html = neutralized.html;
  if (neutralized.changed) reporter.warn('single-file preview neutralized ' + neutralized.changed + ' out-of-page link/icon target(s)');
  const assetShim = makePreviewAssetShim(args.root);
  if (assetShim) {
    if (/<head\b[^>]*>/i.test(html)) html = html.replace(/<head\b[^>]*>/i, (tag) => tag + '\n' + assetShim);
    else if (/<body\b[^>]*>/i.test(html)) html = html.replace(/<body\b[^>]*>/i, (tag) => tag + '\n' + assetShim);
    else html = assetShim + '\n' + html;
  }
  html = inlineScripts(html, galleryDir, errors);
  checkSingleFile(html, errors);
  if (errors.length) {
    for (const error of errors) reporter.issue('single-file preview: ' + error);
    reporter.issue('self-contained preview was not written because its resources are incomplete');
    return null;
  }
  const out = path.join(args.out, '组件库-预览.html');
  writeFile(out, html);
  return out;
}

function buildRegistryFile(registry, args, reporter) {
  const json = JSON.stringify(registry, null, 2) + '\n';
  const rootRegistry = path.join(args.root, 'registry.json');
  writeFile(rootRegistry, json);
  const registryJs = '/*! note-library registry, generated by scripts/build.mjs; do-not-edit. */\n' +
    'window.NOTE_LIBRARY_REGISTRY = ' + json.trim() + ';\n';
  const registryJsPath = path.join(args.out, 'registry.js');
  writeFile(registryJsPath, registryJs);
  return { rootRegistry, registryJsPath };
}

function copyRelease(args, previewPath, reporter) {
  if (!args.release) return;
  if (!previewPath || !existsFile(previewPath)) {
    reporter.error('--release requires a generated dist/组件库-预览.html');
    return;
  }
  if (!args.releaseTarget || args.releaseTarget === args.root) {
    reporter.error('invalid --release-target');
    return;
  }
  fs.mkdirSync(path.dirname(args.releaseTarget), { recursive: true });
  fs.copyFileSync(previewPath, args.releaseTarget);
  const sourceBytes = fs.readFileSync(previewPath);
  const targetBytes = fs.readFileSync(args.releaseTarget);
  if (!sourceBytes.equals(targetBytes)) reporter.error('release copy differs from dist preview');
  else console.log('released self-contained preview -> ' + args.releaseTarget);
}

function printHelp() {
  console.log('Usage: node scripts/build.mjs [--final] [--release] [--root <dir>] [--out <dir>] [--release-target <file>]');
  console.log('  --final    fail when any expected ID/manifest/source/gallery input is missing');
  console.log('  --release  copy dist/组件库-预览.html to the release target (default: dist/组件库-预览-发布.html)');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();
  const reporter = createReporter(args.final);
  console.log('html-note library build · ' + (args.final ? 'FINAL' : 'development') + ' · root ' + args.root);

  const expected = loadExpected(args.root);
  const statusData = readStatus(args.root);
  const manifests = collectManifests(args.root, reporter);
  if (!manifests.length) reporter.issue('no module manifests found under src/manifests');
  const { modules, entries } = mergeManifests(manifests, expected, reporter);

  const presentModules = new Set(modules.keys());
  const missingModules = MODULE_ORDER.filter((moduleName) => !presentModules.has(moduleName));
  if (missingModules.length) {
    reporter.issue('manifest(s) still missing for module(s): ' + missingModules.join(', '));
  }
  const presentIds = new Set(entries.map((entry) => entry.id));
  const missingIds = expected.ids.filter((id) => !presentIds.has(id));
  if (missingIds.length) {
    if (args.final) reporter.error('missing ' + missingIds.length + ' expected ID(s): ' + missingIds.join(', '));
    else reporter.warn('development build: ' + missingIds.length + ' of ' + expected.ids.length + ' expected IDs are not present yet');
  }
  const extraIds = entries.filter((entry) => !expected.byId.has(entry.id)).map((entry) => entry.id);
  if (extraIds.length) reporter.issue('IDs not present in expected-ids.json: ' + extraIds.join(', '));

  const normalizedEntries = entries.map((raw) => {
    const mod = modules.get(raw.__module);
    return normalizeEntry(raw, mod, expected, statusData, reporter, args.root, args.out);
  });
  collectSourceIssues(args.root, modules, normalizedEntries, reporter);

  prepareOutput(args.out);
  const bundleInfo = buildBundles(args, modules, normalizedEntries, reporter);
  const registry = makeRegistry(args, expected, statusData, modules, normalizedEntries, bundleInfo, reporter);
  const registryFiles = buildRegistryFile(registry, args, reporter);
  const preview = buildPreview(args, reporter);
  if (preview) {
    registry.build.outputs.push(relativePath(args.root, preview));
    registry.build.preview = {
      path: relativePath(args.root, preview),
      selfContained: true,
      bytes: fs.statSync(preview).size
    };
    // Keep registry.js in sync with the preview metadata.
    buildRegistryFile(registry, args, reporter);
  }
  if (args.release && reporter.errors.length) {
    reporter.error('--release skipped because the build has errors');
  } else {
    copyRelease(args, preview, reporter);
  }

  const jsSize = fs.statSync(bundleInfo.fullJsPath).size;
  const cssSize = fs.statSync(bundleInfo.fullCssPath).size;
  console.log('modules built: ' + (bundleInfo.presentModules.join(', ') || '(none)'));
  console.log('registry entries: ' + registry.entries.length + ' / expected ' + expected.ids.length);
  console.log('full JavaScript: ' + jsSize + ' bytes');
  console.log('full CSS: ' + cssSize + ' bytes');
  if (preview) console.log('self-contained preview: ' + preview + ' (' + fs.statSync(preview).size + ' bytes)');
  else console.log('self-contained preview: skipped');
  console.log('registry: ' + registryFiles.rootRegistry + ' + ' + registryFiles.registryJsPath);
  if (reporter.warnings.length) console.log('warnings: ' + reporter.warnings.length);
  if (reporter.errors.length) {
    console.error('build failed with ' + reporter.errors.length + ' error(s)');
    process.exitCode = 1;
  } else {
    console.log('build ok');
  }
}

try {
  main();
} catch (err) {
  console.error('[build] ' + (err && err.stack ? err.stack : err));
  process.exitCode = 1;
}