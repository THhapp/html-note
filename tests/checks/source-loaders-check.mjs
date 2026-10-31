#!/usr/bin/env node
/*
 * Static loading-list check for hosts that load src/ classic scripts directly.
 *
 * The HTML fixtures under tests/checks and the development hosts under examples
 * list source files by hand. After a module split those lists silently go stale,
 * which shows up later as a missing-object browser error. This check is cheap
 * and needs no browser:
 *
 *   - every referenced src/ file is declared by some manifest (no renamed file);
 *   - js references follow the module's manifest order (css likewise);
 *   - modules appear in the build order;
 *   - modules that must be loaded whole are complete:
 *       examples/ hosts: every referenced component module except core/legacy;
 *       tests/ HTML fixtures: same, but demo/content modules may stay partial
 *       because those fixtures intentionally test one component.
 *
 * Usage: node tests/checks/source-loaders-check.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODULE_ORDER } from '../../scripts/lib/source-order.mjs';
import { loadManifestModules } from '../lib/src-sources.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

const HOSTS = [
  'examples/demo-scene/index.html',
  'examples/demo-scene/standalone.html',
  'examples/reuse-matrix-product/index.html',
  'examples/reuse-matrix-product/standalone.html',
  ...fs.readdirSync(here).filter((name) => name.endsWith('.html')).sort().map((name) => 'tests/checks/' + name)
];

// Fixtures may load only the component under test from these grab-bag/demo modules.
const PARTIAL_ALLOWED = new Set(['core', 'legacy']);
const PARTIAL_TESTS_ONLY = new Set(['ui-content', 'demo-runtime', 'demo-ui']);
// The demo runtime hosts pick adapters selectively; presentation recipes are optional.
const OPTIONAL_RUNTIME_FILE = /\/demo\/adapters\/|\/demo\/recipes\.js$/;
// examples/ hosts must load these modules whole because they exercise the runtime,
// objects and content paths end to end; blocks/legacy may stay partial.
const EXAMPLE_COMPLETE = new Set(['demo-runtime', 'demo-ui', 'viz-objects', 'ui-layout', 'ui-content']);

const failures = [];
function fail(message) {
  failures.push(message);
  console.log('FAIL  ' + message);
}
function pass(message) {
  console.log('PASS  ' + message);
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}
function toPosix(value) {
  return String(value).replace(/\\/g, '/');
}

function loadDeclarations() {
  const { modules } = loadManifestModules(root);
  const byFile = new Map();
  for (const [moduleName, mod] of modules.entries()) {
    for (const kind of ['js', 'css']) {
      for (const rel of mod[kind]) {
        const key = toPosix(rel);
        if (!byFile.has(key)) byFile.set(key, { module: moduleName, kind });
      }
    }
  }
  return { modules, byFile };
}

function referencedSources(host) {
  const html = readText(path.join(root, host));
  const refs = [];
  const tagPattern = /<(script|link)\b([^>]*)>/gi;
  let match;
  while ((match = tagPattern.exec(html))) {
    const tag = match[1].toLowerCase();
    const attrs = match[2];
    if (tag === 'link' && !/\brel\s*=\s*["']?stylesheet/i.test(attrs)) continue;
    const attrMatch = attrs.match(/\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (!attrMatch) continue;
    const value = (attrMatch[1] !== undefined ? attrMatch[1] : attrMatch[2] !== undefined ? attrMatch[2] : attrMatch[3] || '').trim();
    if (!value || /^(?:data:|https?:|\/\/|#)/i.test(value)) continue;
    const clean = value.split('#')[0].split('?')[0];
    const abs = path.resolve(path.dirname(path.join(root, host)), clean);
    const rel = toPosix(path.relative(root, abs));
    if (rel.startsWith('src/')) refs.push({ rel, kind: tag === 'link' ? 'css' : 'js' });
  }
  return refs;
}

function completeRequired(host, moduleName) {
  if (PARTIAL_ALLOWED.has(moduleName)) return false;
  if (host.startsWith('examples/')) return EXAMPLE_COMPLETE.has(moduleName);
  return !PARTIAL_TESTS_ONLY.has(moduleName);
}

const declarations = loadDeclarations();
for (const host of HOSTS) {
  const abs = path.join(root, host);
  if (!fs.existsSync(abs)) {
    fail(host + ' is missing');
    continue;
  }
  const refs = referencedSources(host);
  if (!refs.length) continue;
  const seen = new Set();
  const byModule = new Map();
  let hostOk = true;
  refs.forEach((ref) => {
    const declared = declarations.byFile.get(ref.rel);
    if (!declared) {
      hostOk = false;
      fail(host + ' references a src file that no manifest declares: ' + ref.rel);
      return;
    }
    if (declared.kind !== ref.kind) {
      hostOk = false;
      fail(host + ' loads ' + ref.rel + ' as ' + ref.kind + ' but manifest declares it as ' + declared.kind);
      return;
    }
    if (seen.has(ref.rel)) {
      hostOk = false;
      fail(host + ' references ' + ref.rel + ' more than once');
      return;
    }
    seen.add(ref.rel);
    if (!byModule.has(declared.module)) byModule.set(declared.module, []);
    byModule.get(declared.module).push(ref);
  });

  const moduleFirst = new Map();
  for (const ref of refs) {
    const declared = declarations.byFile.get(ref.rel);
    if (!declared) continue;
    if (!moduleFirst.has(declared.module)) moduleFirst.set(declared.module, []);
    moduleFirst.get(declared.module).push(ref.kind);
  }
  const jsOrder = refs.filter((ref) => ref.kind === 'js').map((ref) => declarations.byFile.get(ref.rel)).filter(Boolean).map((item) => item.module);
  const jsModuleOrder = [...new Set(jsOrder)];
  const sortedJsModules = [...jsModuleOrder].sort((a, b) => MODULE_ORDER.indexOf(a) - MODULE_ORDER.indexOf(b));
  if (jsModuleOrder.join(',') !== sortedJsModules.join(',')) {
    hostOk = false;
    fail(host + ' module order should be ' + sortedJsModules.join(' -> ') + ', found ' + jsModuleOrder.join(' -> '));
  }

  for (const [moduleName, moduleRefs] of byModule.entries()) {
    const mod = declarations.modules.get(moduleName);
    for (const kind of ['js', 'css']) {
      const encountered = moduleRefs.filter((ref) => ref.kind === kind).map((ref) => ref.rel);
      if (!encountered.length) continue;
      const expected = mod[kind].map(toPosix).filter((rel) => encountered.includes(rel));
      if (expected.join(',') !== encountered.join(',')) {
        hostOk = false;
        fail(host + ' ' + moduleName + ' ' + kind + ' files are not in manifest order: expected [' + expected.join(', ') + '], found [' + encountered.join(', ') + ']');
      }
    }
    const loadedJs = moduleRefs.filter((ref) => ref.kind === 'js').map((ref) => ref.rel);
    // 无论模块是否整载，内部共享文件（shared.js / *-shared.js / *-internal.js）都必须加载，
    // 这类文件不在公开 API 里，漏载只会在浏览器运行期报 "undefined"。
    const internalFiles = mod.js.map(toPosix).filter((rel) => /(?:^|\/)(?:shared|[^/]*-shared|[^/]*-internal)\.js$/.test(rel));
    const requiredFiles = completeRequired(host, moduleName)
      ? mod.js.map(toPosix).filter((rel) => !OPTIONAL_RUNTIME_FILE.test('/' + rel))
      : internalFiles;
    const missing = requiredFiles.filter((rel) => !loadedJs.includes(rel));
    if (missing.length) {
      hostOk = false;
      fail(host + ' ' + moduleName + ' is missing declared script(s): ' + missing.join(', '));
    }
  }
  if (hostOk) pass(host + ' (' + refs.length + ' src refs)');
}

if (failures.length) {
  console.error('source loaders check failed with ' + failures.length + ' issue(s)');
  process.exitCode = 1;
} else {
  console.log('source loaders check ok');
}
