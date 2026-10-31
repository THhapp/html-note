/*!
 * Shared ordering rules for module source files.
 *
 * Used by scripts/build.mjs, scripts/check.mjs and the Node test harness in
 * tests/lib. Keeping the module order and the core/legacy internal order here
 * prevents the build, the static check and the source-loading tests from
 * drifting apart. Tooling only: this file is not part of dist output.
 */

export const MODULE_ORDER = [
  'core', 'legacy', 'ui-layout', 'ui-content', 'ui-actions', 'ui-navigation',
  'ui-forms-basic', 'ui-forms-advanced', 'ui-overlay', 'ui-feedback',
  'ui-extended', 'viz-objects', 'viz-mechanisms', 'viz-chart', 'blocks',
  'demo-runtime', 'demo-ui'
];

export const CORE_JS_ORDER = ['core.js', 'icons-data.js', 'icons.js', 'motion.js', 'floating.js'];
export const CORE_CSS_ORDER = ['tokens.css', 'base.css'];
export const LEGACY_JS_ORDER = ['controls.js', 'primitives.js', 'focus.js', 'range.js', 'link.js', 'sequence-insert.js'];
export const LEGACY_CSS_ORDER = ['controls.css', 'primitives.css', 'focus.css', 'range.css', 'link.css', 'sequence-insert.css', 'legacy-bridge.css'];

export function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    if (typeof value !== 'string' || !value.trim()) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function orderByBasenames(list, preferred) {
  const rank = new Map(preferred.map((name, index) => [name, index]));
  return list
    .map((file, index) => ({
      file,
      index,
      rank: rank.has(fileBasename(file)) ? rank.get(fileBasename(file)) : 1000
    }))
    .sort((a, b) => (a.rank - b.rank) || (a.index - b.index))
    .map((item) => item.file);
}

function fileBasename(file) {
  return String(file).replace(/\\/g, '/').split('/').pop();
}

/**
 * Return the effective source order for one module.
 * @param {{module: string, js?: string[], css?: string[]}} mod merged module object
 * @param {'js'|'css'} kind
 */
export function orderedSources(mod, kind) {
  let list = uniqueStrings(mod[kind]);
  if (mod.module === 'core') {
    list = kind === 'js' ? orderByBasenames(list, CORE_JS_ORDER) : orderByBasenames(list, CORE_CSS_ORDER);
  } else if (mod.module === 'legacy') {
    list = kind === 'js' ? orderByBasenames(list, LEGACY_JS_ORDER) : orderByBasenames(list, LEGACY_CSS_ORDER);
  }
  return list;
}
