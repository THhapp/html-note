/*!
 * Manifest-driven source-loading harness for the browser checks.
 *
 * tests/demo/*.mjs and the per-module checks load classic scripts straight from
 * src/ in a real Edge page. Their file lists used to be hardcoded, so every
 * module split silently broke the check. This helper reads src/manifests/*.json
 * (the same source the build uses) and returns the effective js/css order, so a
 * split only needs the manifest update.
 *
 * Tooling only; never writes files and never affects dist output.
 */

import fs from 'node:fs';
import path from 'node:path';
import { MODULE_ORDER, orderedSources, uniqueStrings } from '../../scripts/lib/source-order.mjs';

function toPosix(file) {
  return String(file).replace(/\\/g, '/');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Merge src/manifests/*.json exactly like scripts/build.mjs does.
 * @returns {{ modules: Map<string, object>, warnings: string[] }}
 */
export function loadManifestModules(root) {
  const dir = path.join(root, 'src', 'manifests');
  if (!fs.existsSync(dir)) throw new Error('manifest directory is missing: ' + dir);
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
  const modules = new Map();
  const warnings = [];
  for (const name of files) {
    const file = path.join(dir, name);
    let data;
    try {
      data = readJson(file);
    } catch (error) {
      throw new Error('Invalid manifest JSON ' + toPosix(path.relative(root, file)) + ': ' + error.message);
    }
    if (!data || typeof data.module !== 'string' || !data.module) {
      warnings.push(toPosix(path.relative(root, file)) + ' has no module field; skipped');
      continue;
    }
    if (!MODULE_ORDER.includes(data.module)) {
      warnings.push(toPosix(path.relative(root, file)) + ' declares unknown module "' + data.module + '"; skipped');
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
    mod.manifestFiles.push(toPosix(path.relative(root, file)));
    if (typeof data.title === 'string' && data.title) mod.title = mod.title || data.title;
    for (const key of ['js', 'css', 'demos', 'dependencies']) {
      if (Array.isArray(data[key])) mod[key].push(...data[key]);
      else warnings.push(toPosix(path.relative(root, file)) + ' ' + key + ' should be an array');
    }
    for (const entry of Array.isArray(data.entries) ? data.entries : []) {
      if (entry && typeof entry.id === 'string') mod.entries.push(entry.id);
    }
  }
  for (const mod of modules.values()) {
    mod.js = uniqueStrings(mod.js);
    mod.css = uniqueStrings(mod.css);
    mod.demos = uniqueStrings(mod.demos);
    mod.dependencies = uniqueStrings(mod.dependencies);
  }
  return { modules, warnings };
}

function requireModule(modules, moduleName) {
  const mod = modules.get(moduleName);
  if (!mod) throw new Error('No manifest declares module "' + moduleName + '". Known modules: ' + [...modules.keys()].join(', '));
  return mod;
}

/**
 * Ordered source lists across the requested modules.
 * Module order is the build order; within one module it is the manifest array
 * order (with the same core/legacy internal order as scripts/build.mjs).
 * @param {string} root project root
 * @param {string[]} moduleNames modules to include
 * @returns {{ js: string[], css: string[], demos: string[] }}
 */
export function moduleSources(root, moduleNames) {
  const { modules } = loadManifestModules(root);
  const wanted = new Set(moduleNames);
  for (const name of wanted) requireModule(modules, name);
  const result = { js: [], css: [], demos: [] };
  for (const moduleName of MODULE_ORDER) {
    if (!wanted.has(moduleName)) continue;
    const mod = modules.get(moduleName);
    result.js.push(...orderedSources(mod, 'js'));
    result.css.push(...orderedSources(mod, 'css'));
    result.demos.push(...mod.demos.slice());
  }
  return result;
}

/** Ordered js files (POSIX paths relative to the project root). */
export function moduleScripts(root, moduleNames) {
  return moduleSources(root, moduleNames).js;
}

/** Ordered css files (POSIX paths relative to the project root). */
export function moduleStyles(root, moduleNames) {
  return moduleSources(root, moduleNames).css;
}

/** All declared gallery demo files for the requested modules. */
export function moduleDemos(root, moduleNames) {
  return moduleSources(root, moduleNames).demos;
}

/** @returns {{ relative: string, file: string, content: string }} */
export function readSource(root, relative) {
  const file = path.resolve(root, relative);
  if (!fs.existsSync(file)) throw new Error('Declared source file is missing: ' + relative);
  return { relative: toPosix(relative), file, content: fs.readFileSync(file, 'utf8') };
}

/**
 * Read every declared js (or css) file of one module.
 * Used for module-wide static assertions: a split must not hide logic from
 * a scan that used to target a single filename.
 * @returns {Array<{relative: string, file: string, content: string}>}
 */
export function readModuleSources(root, moduleName, kind = 'js') {
  const { modules } = loadManifestModules(root);
  const mod = requireModule(modules, moduleName);
  const list = orderedSources(mod, kind);
  return list.map((relative) => readSource(root, relative));
}

/** Concatenated text of one module's declared sources, with per-file markers. */
export function readModuleSourceText(root, moduleName, kind = 'js') {
  return readModuleSources(root, moduleName, kind)
    .map((item) => '/* ---- ' + item.relative + ' ---- */\n' + item.content)
    .join('\n\n');
}

/** Locate declared files of a module whose content matches a predicate. */
export function findModuleSources(root, moduleName, predicate, kind = 'js') {
  return readModuleSources(root, moduleName, kind).filter((item) => predicate(item.content, item.relative));
}
