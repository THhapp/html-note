import fs from 'node:fs';
import path from 'node:path';
import { MODULE_ORDER } from '../lib/source-order.mjs';
import { TOPICS } from './entries.mjs';

const MANIFEST_DIR = 'src/manifests';
const DOCS_DIR = 'docs';
const TYPE_LABEL = { I: '设计基础', B: '组合块' };
const RUNTIME_VALUES = new Set(['independent', 'scene', 'public', 'recipe', 'authoring', 'example', 'tool']);

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function posix(value) { return String(value).replace(/\\/g, '/'); }
function rel(root, file) { return posix(path.relative(root, file)); }
function isInside(root, file) { const resolved = path.resolve(file); return resolved === root || resolved.startsWith(root + path.sep); }
function normalizeName(value) { return String(value || '').replace(/\s+/g, '').toLowerCase(); }
function buildModules(root) {
  const dir = path.join(root, MANIFEST_DIR);
  if (!fs.existsSync(dir)) throw new Error('manifest 目录不存在：' + MANIFEST_DIR);
  const modules = new Map();
  const manifests = [];
  for (const name of fs.readdirSync(dir).filter((item) => item.endsWith('.json')).sort()) {
    const raw = readJson(path.join(dir, name));
    if (!raw || typeof raw.module !== 'string') continue;
    manifests.push({ name, raw });
    modules.set(raw.module, raw);
  }
  return { modules, manifests };
}

const MODULE_RANK = new Map(MODULE_ORDER.map((name, index) => [name, index]));
function moduleClosure(modules, names) {
  const roots = Array.isArray(names) ? names : [names];
  const seen = new Set();
  const order = [];
  function visit(current) {
    if (!current || seen.has(current)) return;
    seen.add(current);
    const module = modules.get(current);
    if (module && Array.isArray(module.dependencies)) module.dependencies.forEach(visit);
    order.push(current);
  }
  roots.forEach(visit);
  /* 多模块闭包合并后按发布/加载顺序（MODULE_ORDER）稳定输出。 */
  order.sort((a, b) => {
    const rankA = MODULE_RANK.has(a) ? MODULE_RANK.get(a) : MODULE_ORDER.length;
    const rankB = MODULE_RANK.has(b) ? MODULE_RANK.get(b) : MODULE_ORDER.length;
    return rankA - rankB;
  });
  return order;
}

function moduleLoading(modules, moduleName) {
  return moduleClosure(modules, moduleName).map((name) => {
    const data = modules.get(name) || {};
    return { module: name, js: 'dist/modules/' + name + '.js', css: data.css && data.css.length ? 'dist/modules/' + name + '.css' : null };
  });
}

function moduleLoadingMany(modules, moduleNames) {
  return moduleClosure(modules, moduleNames).map((name) => {
    const data = modules.get(name) || {};
    return { module: name, js: 'dist/modules/' + name + '.js', css: data.css && data.css.length ? 'dist/modules/' + name + '.css' : null };
  });
}

function sceneLoading(catalog, entry) {
  return catalog.moduleLoadingMany([entry.module, 'demo-runtime']);
}

function loadingSummary(loading) {
  return loading.map((item) => item.module).join(' + ');
}

function resourceLabel(key, file) {
  if (key === 'api') return '完整 API 文档';
  if (key === 'source') return '实现源码';
  if (key === 'fragment') return '局部接入片段';
  if (key === 'control') return '受控视觉接管说明';
  if (key === 'preview') return '离线预览入口';
  if (key === 'full') return '完整示例';
  if (key === 'minimal') return '最小示例';
  if (key === 'guide') return '接入文档';
  if (key === 'example') return /minimal\.html$/i.test(file) ? '最小示例' : '完整示例';
  return key;
}

function validateResources(root, resources, owner) {
  if (!Array.isArray(resources)) throw new Error(owner + ' 的 resources 必须是数组');
  const seen = new Set();
  for (const spec of resources) {
    if (!spec || typeof spec !== 'object') throw new Error(owner + ' 的 resource 项必须是对象');
    const key = spec.key;
    if (typeof key !== 'string' || !key.trim()) throw new Error(owner + ' 的 resource.key 缺失');
    if (/^ref\d+$/.test(key)) throw new Error(owner + ' 不应再使用 refN 资源键：' + key);
    const resourcePath = spec.path;
    if (typeof resourcePath !== 'string' || !resourcePath.trim()) throw new Error(owner + ' 的 resource.path 缺失：' + key);
    if (resourcePath.includes('#')) throw new Error(owner + ' 的 resource.path 不能带锚点：' + resourcePath);
    if (!fs.existsSync(path.join(root, resourcePath))) throw new Error(owner + ' 的资源路径不存在：' + resourcePath);
    const signature = key + ':' + resourcePath + ':' + (spec.anchor || '');
    if (seen.has(signature)) continue;
    seen.add(signature);
  }
}

function validateQuery(root, entry, modules, owner) {
  const query = entry.query;
  if (query == null) return null;
  if (typeof query !== 'object' || Array.isArray(query)) throw new Error(owner + ' 的 query 必须是对象');
  if (!Array.isArray(query.terms) || !Array.isArray(query.aliases)) throw new Error(owner + ' 的 query.terms/aliases 必须是数组');
  if (typeof query.boundary !== 'string') throw new Error(owner + ' 的 query.boundary 必须是字符串');
  validateResources(root, query.resources || [], owner);
  if (query.scene != null) {
    const scene = query.scene;
    if (!scene || !Array.isArray(scene.modes) || !scene.modes.length) throw new Error(owner + ' 的 query.scene.modes 必须非空');
    for (const mode of scene.modes) if (typeof mode !== 'string' || !mode) throw new Error(owner + ' 的 query.scene.modes 含非法值');
    if (!scene.modes.includes(scene.defaultMode)) throw new Error(owner + ' 的 query.scene.defaultMode 不在 modes 中');
    if (typeof scene.note !== 'string') throw new Error(owner + ' 的 query.scene.note 必须是字符串');
  }
  return query;
}

function validateTopic(root, topic, modules, owner) {
  if (!topic || typeof topic !== 'object') throw new Error(owner + ' 必须是对象');
  const allowedRuntime = RUNTIME_VALUES;
  if (!allowedRuntime.has(topic.runtime)) throw new Error(owner + ' 的 runtime 非法：' + topic.runtime);
  if (!Array.isArray(topic.moduleDependencies)) throw new Error(owner + ' 的 moduleDependencies 必须是数组');
  for (const name of topic.moduleDependencies) if (!modules.has(name)) throw new Error(owner + ' 的模块不存在：' + name);
  if (topic.regionDependencies) {
    const region = topic.regionDependencies;
    if (typeof region !== 'object' || !Array.isArray(region.groups)) throw new Error(owner + ' 的 regionDependencies 非法');
    for (const group of region.groups) {
      if (!group || typeof group.module !== 'string' || !Array.isArray(group.regions)) throw new Error(owner + ' 的 regionDependencies 组非法');
      if (!modules.has(group.module)) throw new Error(owner + ' 的 regionDependencies 模块不存在：' + group.module);
    }
  }
  validateResources(root, topic.resources || [], owner);
}

function buildComponent(entry, moduleName, modules, query, root) {
  const prefix = String(entry.id || '').charAt(0);
  const type = TYPE_LABEL[prefix] || '组件';
  const aliases = new Set([entry.id, entry.name, entry.cn].filter(Boolean));
  if (query) {
    for (const alias of query.aliases) if (alias) aliases.add(alias);
    for (const term of query.terms) if (term) aliases.add(term);
  }
  const nameParts = String(entry.name || '').split('.');
  if (nameParts.length > 1) aliases.add(nameParts[nameParts.length - 1]);
  const resources = [];
  const seenResources = new Set();
  function addResource(resource, preferred) {
    if (!resource) return;
    const target = resource.path ? resource.path + (resource.anchor ? '#' + resource.anchor : '') : resource.href;
    if (!target || seenResources.has(target)) return;
    const sameKey = resources.findIndex((item) => item.key === resource.key);
    if (sameKey >= 0) {
      if (!preferred || resources[sameKey].preferred) return;
      resources[sameKey] = resource;
      seenResources.add(target);
      return;
    }
    seenResources.add(target);
    resources.push(resource);
  }
  if (entry.docs) {
    const parts = String(entry.docs).split('#');
    addResource({ key: 'api', label: '完整 API 文档', path: parts[0], anchor: parts[1] || null, readable: true });
  }
  const sourcePaths = (Array.isArray(entry.source) && entry.source.length) ? entry.source.slice() : [];
  if (!sourcePaths.length) {
    const module = modules.get(moduleName) || {};
    if (Array.isArray(module.js) && module.js.length) sourcePaths.push(module.js[0]);
  }
  if (sourcePaths.length) addResource({ key: 'source', label: '实现源码', path: sourcePaths[0], anchor: null, readable: true, note: entry.source ? null : '源清单未单列条目 source，这里取模块首个源文件；其余见模块 js。' });
  if (entry.demo) {
    const parts = String(entry.demo).split('#');
    addResource({ key: 'demo', label: 'Gallery 示例（按条目段读取）', path: parts[0], anchor: parts[1] || null, demoSection: entry.id, readable: true });
  } else {
    const module = modules.get(moduleName) || {};
    if (Array.isArray(module.demos) && module.demos.length) addResource({ key: 'demo', label: 'Gallery 模块示例（按条目段读取）', path: module.demos[0], anchor: null, demoSection: entry.id, readable: true });
  }
  if (entry.preview) addResource({ key: 'preview', label: 'Gallery 入口', href: entry.preview, readable: false });
  if (query) {
    for (const spec of query.resources) {
      addResource({ key: spec.key, label: resourceLabel(spec.key, spec.path), path: spec.path, anchor: spec.anchor || null, readable: true }, true);
    }
  }
  const limitations = Array.isArray(entry.limitations) ? entry.limitations : [];
  const limits = query && query.boundary ? [query.boundary].concat(limitations.slice(0, 5)) : limitations.slice(0, 5);
  return {
    kind: 'component', id: entry.id, name: entry.name, cn: entry.cn || '', type,
    category: entry.category || '', module: moduleName, purpose: entry.purpose || '',
    coverage: query ? 'curated' : 'catalog', aliases: [...aliases], terms: query ? query.terms.slice() : [],
    limits, allLimitations: limitations, manifest: entry, source: entry.source || [], inputs: entry.inputs || [],
    customizable: entry.customizable || [], states: entry.states || [], usage: entry.usage || '',
    dependencies: entry.dependencies || [], resources, docs: entry.docs || null, demo: entry.demo || null,
    preview: entry.preview || null, notes: [entry.notes, query && query.notes].filter(Boolean).join('\n'),
    query, adapter: entry.adapter || null, adapterLabel: entry.adapterLabel || null
  };
}

function topicResourceLabel(key, file) {
  if (key === 'api') return '完整契约 / 用法文档';
  if (key === 'source') return '实现源码';
  if (key === 'fragment') return '局部接入片段';
  if (key === 'control') return '受控视觉接管说明';
  if (key === 'preview') return '离线预览入口';
  if (key === 'full') return '完整示例';
  if (key === 'minimal') return '最小示例';
  if (key === 'guide') return '接入文档';
  if (key === 'example') return /minimal\.html$/i.test(file) ? '最小示例' : '完整示例';
  return key;
}

function buildTopic(topic) {
  const resources = (topic.resources || []).map((spec) => ({
    key: spec.key, label: topicResourceLabel(spec.key, spec.path), path: spec.path,
    anchor: spec.anchor || null, readable: !/^https?:/.test(spec.path)
  }));
  const aliases = new Set([topic.id, topic.name, topic.cn].filter(Boolean));
  for (const alias of topic.aliases || []) if (alias) aliases.add(alias);
  return {
    kind: 'topic', id: topic.id, name: topic.name, cn: topic.cn, type: topic.type,
    category: topic.category, purpose: topic.purpose, coverage: 'curated',
    aliases: [...aliases], terms: (topic.terms || []).slice(), limits: (topic.limits || []).slice(),
    resources, runtime: topic.runtime, moduleDependencies: topic.moduleDependencies.slice(),
    regionDependencies: topic.regionDependencies || null, usageText: topic.usage || '',
    roleText: topic.notes || '', usage: topic.usage || '', notes: topic.notes || '',
    depsText: '', related: '', reads: '', contextText: ''
  };
}
function resolveRef(root, href, baseFile = null) {
  const raw = String(href || '').trim();
  if (!raw) return null;
  if (/^https?:/i.test(raw)) return { external: true, href: raw };
  if (raw.startsWith('#')) return { external: false, href: raw, path: null, anchor: raw.slice(1) };
  const [withoutHash, hash] = raw.split('#');
  const [pathPart, query] = withoutHash.split('?');
  let resolved;
  if (pathPart.startsWith('/')) resolved = path.join(root, pathPart);
  else if (baseFile) resolved = path.resolve(path.dirname(baseFile), pathPart);
  else resolved = path.resolve(root, pathPart);
  return { external: false, href: raw, path: isInside(root, resolved) ? rel(root, resolved) : null, absolute: resolved, anchor: hash || null, query: query || null };
}

function buildCatalog(root) {
  root = path.resolve(root);
  const { modules, manifests } = buildModules(root);
  const components = [];
  for (const manifest of manifests) {
    for (const entry of manifest.raw.entries || []) {
      if (!entry || typeof entry.id !== 'string') continue;
      const owner = 'manifest ' + manifest.name + ' / ' + entry.id;
      const query = validateQuery(root, entry, modules, owner);
      components.push(buildComponent(entry, manifest.raw.module, modules, query, root));
    }
  }
  const topics = TOPICS.map((topic, index) => {
    const owner = 'entries.mjs#' + (index + 1) + ' / ' + (topic && topic.id);
    validateTopic(root, topic, modules, owner);
    return buildTopic(topic);
  });
  const byId = new Map();
  const byName = new Map();
  for (const entry of components.concat(topics)) {
    byId.set(String(entry.id).toLowerCase(), entry);
    for (const key of [entry.name, entry.id, entry.cn].concat(entry.aliases || [])) {
      const normalized = normalizeName(key);
      if (!normalized) continue;
      if (!byName.has(normalized)) byName.set(normalized, []);
      if (!byName.get(normalized).includes(entry)) byName.get(normalized).push(entry);
    }
  }
  return { root, modules, manifests, components, topics, entries: components.concat(topics), byId, byName,
    moduleLoading: (name) => moduleLoading(modules, name),
    moduleLoadingMany: (names) => moduleLoadingMany(modules, names),
    closure: (name) => moduleClosure(modules, name),
    resolveRef: (href, baseFile) => resolveRef(root, href, baseFile) };
}
function findEntry(catalog, token) {
  const raw = String(token || '').trim();
  if (!raw) return { error: 'empty' };
  const exactId = catalog.byId.get(raw.toLowerCase());
  if (exactId) return { entry: exactId };
  const matches = catalog.byName.get(normalizeName(raw)) || [];
  if (matches.length === 1) return { entry: matches[0] };
  if (matches.length > 1) {
    const exact = matches.find((entry) => entry.id === raw || entry.name === raw || entry.cn === raw);
    if (exact) return { entry: exact };
    return { error: 'ambiguous', matches };
  }
  const normalized = normalizeName(raw);
  for (const entry of catalog.entries) for (const key of [entry.name, entry.cn, ...(entry.aliases || [])]) if (normalizeName(key) === normalized) return { entry };
  return { error: 'not_found' };
}

function scoreEntry(entry, query) {
  const q = String(query || '').trim();
  if (!q) return { score: 0, matchedBy: [] };
  const lower = q.toLowerCase();
  const compact = normalizeName(q);
  const fields = [['id', entry.id], ['name', entry.name], ['cn', entry.cn], ['type', entry.type], ['alias', ...(entry.aliases || [])], ['term', ...(entry.terms || [])], ['purpose', entry.purpose], ['category', entry.category], ['module', entry.module || ''], ['limit', ...(entry.limits || [])]];
  let best = 0;
  const matchedBy = [];
  for (const [kind, ...values] of fields) {
    for (const value of values) {
      if (value == null || value === '') continue;
      const text = String(value);
      const textLower = text.toLowerCase();
      const textCompact = normalizeName(text);
      if (textLower === lower || textCompact === compact) { best = Math.max(best, 100); matchedBy.push(kind + '=' + text); }
      else if (textLower.startsWith(lower) || textCompact.startsWith(compact)) { best = Math.max(best, 70); matchedBy.push(kind + '=' + text); }
      else if (textLower.includes(lower) || textCompact.includes(compact)) { best = Math.max(best, 50); matchedBy.push(kind + '=' + text); }
    }
  }
  const tokens = q.split(/\s+/).map((item) => item.trim()).filter(Boolean);
  if (tokens.length > 1) {
    const haystack = [entry.id, entry.name, entry.cn, entry.purpose, entry.category, ...(entry.aliases || []), ...(entry.terms || [])].join(' ').toLowerCase();
    let hits = 0;
    for (const token of tokens) if (haystack.includes(token.toLowerCase())) hits += 1;
    if (hits) {
      best = Math.max(best, 30 + hits * 5);
      if (matchedBy.length === 0) matchedBy.push('tokens=' + tokens.filter((token) => haystack.includes(token.toLowerCase())).join(' '));
    }
  }
  return { score: best, matchedBy: [...new Set(matchedBy)].slice(0, 4) };
}

function searchMatches(catalog, query, options = {}) {
  const filters = options.filters || {};
  const limit = Number.isFinite(options.limit) ? Math.max(1, options.limit) : 10;
  const results = [];
  for (const entry of catalog.entries) {
    if (filters.type && entry.type !== filters.type) continue;
    if (filters.module && entry.module !== filters.module) continue;
    const scored = scoreEntry(entry, query);
    if (scored.score <= 0) continue;
    results.push({ entry, ...scored });
  }
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if ((b.entry.kind === 'component') !== (a.entry.kind === 'component')) return a.entry.kind === 'component' ? -1 : 1;
    return a.entry.id.localeCompare(b.entry.id);
  });
  return { results: results.slice(0, limit), total: results.length };
}

/* 零结果时只按真实可拆片段再搜索；候选来自 searchMatches 的实际命中，
 * 不维护热门词、不按 ID 特判、不生成没有命中的条目。 */
function queryFragments(query) {
  const text = String(query || '').trim();
  if (!text) return [];
  const whole = normalizeName(text);
  const fragments = [];
  const seen = new Set();
  function add(value) {
    const raw = String(value || '').trim();
    const compact = normalizeName(raw);
    if (!compact || compact === whole || compact.length < 2) return;
    if (seen.has(compact)) return;
    seen.add(compact);
    fragments.push(raw);
  }
  const parts = text.split(/[\s,，、;；/|+]+/).map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    add(part);
    let segmented = false;
    try {
      if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
        const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
        for (const item of segmenter.segment(part)) {
          if (item.isWordLike) { add(item.segment); segmented = true; }
        }
      }
    } catch (ignore) { segmented = false; }
    /* 中文整段没有分隔时，用 2–3 字窗口做真实子搜索；单字噪声过大不加入。 */
    if (/[\u3400-\u9fff]/.test(part)) {
      for (let size = 2; size <= 3; size += 1) {
        for (let i = 0; i + size <= part.length; i += 1) add(part.slice(i, i + size));
      }
    }
    if (!segmented && /[a-z0-9]/i.test(part)) add(part);
  }
  return fragments.slice(0, 24);
}

function searchSuggestions(catalog, query, options = {}) {
  const fragments = queryFragments(query);
  if (!fragments.length) return [];
  const filters = options.filters || {};
  const limit = Number.isFinite(options.limit) ? Math.max(1, options.limit) : 8;
  const candidates = new Map();
  const identityKind = /^(id|name|cn|type|alias|term|category|module)=/;
  for (const fragment of fragments) {
    const matches = searchMatches(catalog, fragment, { filters, limit: 3 });
    for (const match of matches.results) {
      /* 只把命中身份/别名/检索词/类别的片段当依据；仅命中长用途或限制文字
       * 容易把无意义拆词变成“相关候选”，不作为建议来源。 */
      if (!match.matchedBy.some((item) => identityKind.test(item))) continue;
      const id = match.entry.id;
      const current = candidates.get(id);
      if (!current) {
        candidates.set(id, {
          entry: match.entry,
          score: match.score,
          matchedBy: match.matchedBy.slice(),
          suggestionQueries: [fragment]
        });
      } else {
        if (!current.suggestionQueries.includes(fragment)) current.suggestionQueries.push(fragment);
        if (match.score > current.score) {
          current.score = match.score;
          current.matchedBy = match.matchedBy.slice();
        }
      }
    }
  }
  return [...candidates.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if ((b.entry.kind === 'component') !== (a.entry.kind === 'component')) return a.entry.kind === 'component' ? -1 : 1;
    return a.entry.id.localeCompare(b.entry.id);
  }).slice(0, limit);
}

function searchCatalog(catalog, query, options = {}) {
  return searchMatches(catalog, query, options);
}

function refsOf(entry) {
  return entry.resources.map((item) => ({ key: item.key, label: item.label, path: item.path || null, anchor: item.anchor || null, href: item.href || null, query: item.query || null }));
}

function contextForComponent(catalog, entry, contextKey) {
  const contexts = [];
  if (entry.id === 'I07') {
    const refs = refsOf(entry);
    contexts.push({ key: 'create', label: '自备舞台（运行核心）', usage: 'NoteDemo.create({ definition, slots, adapters? })', wholeLibrary: ['dist/note-library.css', 'dist/note-library.js'], dependencies: catalog.moduleLoading('demo-runtime'), dependencySummary: 'demo-runtime → core', refs, notes: ['自备 slots 与 presentation；不加载默认舞台时不会自动渲染标记。', 'scene.attention 需要同一 presentation port 语义，否则创建/运行期报错。'] });
    contexts.push({ key: 'mount', label: '默认舞台（DemoStage）', usage: 'NoteDemo.mount(host, { definition, layout?, adapters?, title?, label? })', wholeLibrary: ['dist/note-library.css', 'dist/note-library.js'], dependencies: catalog.moduleLoading('demo-ui'), dependencySummary: 'demo-ui → blocks/ui-*/viz-* → demo-runtime → core', refs, notes: ['默认舞台提供画面、字幕、控件、标记呈现和演示 Focus；整库加载最省事。', '按模块加载时必须按依赖闭包加载 demo-ui，不能只加载 core/demo-runtime。'] });
  } else {
    contexts.push({ key: 'independent', label: '独立调用', usage: entry.usage || '', wholeLibrary: ['dist/note-library.css', 'dist/note-library.js'], dependencies: catalog.moduleLoading(entry.module), dependencySummary: entry.dependencies && entry.dependencies.length ? entry.dependencies.join(' → ') : '无额外模块依赖', refs: refsOf(entry), notes: entry.limits && entry.limits.length ? [entry.limits[0]] : [] });
    const scene = entry.query && entry.query.scene;
    if (scene) {
      const modeText = scene.modes.map((mode) => '"' + mode + '"').join('|');
      const usage = 'scene: { bindings:[{ binding, mode: ' + modeText + ' }] }；' + (scene.note || ('默认 ' + scene.defaultMode + '。'));
      contexts.push({ key: 'scene', label: '公共 scene 接入', wholeLibrary: ['dist/note-library.css', 'dist/note-library.js'], usage, dependencies: sceneLoading(catalog, entry), dependencySummary: loadingSummary(sceneLoading(catalog, entry)) + '；默认舞台另加 demo-ui', refs: [{ key: 'scene-api', label: 'Adapter 视图与目标', path: 'docs/公共编排层.md', anchor: '5-1-内置-adapter-的视图与目标' }], notes: ['独立调用直接更新组件状态；scene 需要该 Adapter 的 prepareChange/readView 与布局载体。', '不要把独立调用参数直接混入 Definition；先确认 Adapter 支持的 sceneModes 与 after/timing 边界。'] });
    } else if (entry.adapter) {
      const adapterLabel = entry.adapterLabel || entry.adapter;
      contexts.push({ key: 'scene', label: '公共 scene 接入（' + adapterLabel + '）', wholeLibrary: ['dist/note-library.css', 'dist/note-library.js'], usage: '该 Adapter（' + adapterLabel + '）的 scene 支持范围未在查询资料中确认；先读 Adapter 文档的 sceneModes，再填写 bindings[].mode', dependencies: sceneLoading(catalog, entry), dependencySummary: loadingSummary(sceneLoading(catalog, entry)) + '；默认舞台另加 demo-ui', refs: [{ key: 'scene-api', label: 'Adapter 视图与目标', path: 'docs/公共编排层.md', anchor: '5-1-内置-adapter-的视图与目标' }], notes: ['独立调用直接更新组件状态；scene 需要该 Adapter 的 prepareChange/readView 与布局载体。', '未知支持不冒充全模式；先读 Adapter 文档的 sceneModes。'] });
    }
  }
  if (!contextKey) return contexts;
  return contexts.filter((item) => item.key === contextKey);
}

const RUNTIME_CONTEXT_KEY = {
  independent: 'independent',
  scene: 'scene',
  public: 'public',
  recipe: 'recipe',
  authoring: 'authoring',
  tool: 'tool',
  example: 'authoring'
};

function topicContextKey(entry) {
  const key = entry.runtime && RUNTIME_CONTEXT_KEY[entry.runtime];
  if (!key) throw new Error('主题条目 ' + entry.id + ' 缺少可解析的 runtime');
  return key;
}

function regionDependencyView(entry) {
  const region = entry.regionDependencies;
  if (!region) return null;
  if (region.caller) return { dependencies: [], note: '区域组件由调用方 bindings 决定；配方骨架不内置区域组件模块。' };
  if (!region.groups.length) return null;
  const groups = region.groups.map((group) => ({ module: group.module, regions: group.regions.slice() }));
  const note = '区域组件按调用方 bindings 另加：' + groups.map((group) => group.regions.join('/') + '→' + group.module).join('；') + '。';
  return { dependencies: groups, note };
}

function buildTopicContext(catalog, entry, contextKey) {
  if (!Array.isArray(entry.moduleDependencies)) throw new Error('主题条目 ' + entry.id + ' 缺少 moduleDependencies');
  const moduleNames = entry.moduleDependencies;
  const dependencies = catalog.moduleLoadingMany(moduleNames);
  const ctx = {
    key: topicContextKey(entry), label: entry.type, runtime: entry.runtime,
    usage: entry.usageText || '', wholeLibrary: ['dist/note-library.css', 'dist/note-library.js'],
    moduleDependencies: moduleNames.slice(), dependencies,
    dependencySummary: dependencies.length ? loadingSummary(dependencies) : '无浏览器组件模块依赖',
    refs: refsOf(entry), notes: (entry.limits || []).concat(entry.roleText ? [entry.roleText] : [])
  };
  if (entry.type === '配方') {
    const region = regionDependencyView(entry);
    if (region) {
      ctx.regionDependencies = region.dependencies;
      ctx.regionDependencyNote = region.note;
      ctx.dependencySummary = (dependencies.length ? loadingSummary(dependencies) + '（配方骨架）' : '无骨架模块依赖') + '；' + region.note;
      ctx.notes = ctx.notes.concat(['配方只提供区域骨架、槽位、布局与清理；区域组件模块按实际 bindings 另加，不随配方骨架默认加载。', region.note]);
    }
  }
  if (entry.type === '构建工具') {
    ctx.wholeLibrary = null; ctx.moduleDependencies = []; ctx.dependencies = [];
    ctx.dependencySummary = 'Node 内置模块；无浏览器运行层、无 demo-runtime、无网络';
  }
  if (entry.type === '验证工具') {
    ctx.wholeLibrary = null; ctx.moduleDependencies = []; ctx.dependencies = [];
    ctx.dependencySummary = 'Node 内置模块 + playwright-core + 本机 Edge；无 demo-runtime';
    ctx.notes = ctx.notes.concat(['验证工具不加载整库或 demo-runtime；浏览器组件模块依赖与 Node 工具运行条件要分开读。']);
  }
  if (contextKey && contextKey !== ctx.key) return [];
  return [ctx];
}
export function showCatalog(catalog, tokens, options = {}) {
  const entries = [];
  const missing = [];
  for (const token of tokens) {
    const found = findEntry(catalog, token);
    if (found.entry) {
      const contexts = found.entry.kind === 'component' ? contextForComponent(catalog, found.entry, options.context) : buildTopicContext(catalog, found.entry, options.context);
      if (options.context && contexts.length === 0) {
        const available = found.entry.kind === 'component'
          ? contextForComponent(catalog, found.entry, null)
          : buildTopicContext(catalog, found.entry, null);
        missing.push({
          token,
          entryId: found.entry.id,
          error: 'unknown_context',
          availableContexts: available.map((item) => ({ key: item.key, label: item.label }))
        });
        continue;
      }
      entries.push({ ...found.entry, contexts });
    } else missing.push({ token, error: found.error, matches: found.matches || [] });
  }
  return { ok: missing.length === 0, entries, missing };
}

export function search(catalog, query, options = {}) {
  const exact = searchCatalog(catalog, query, options);
  return { ...exact, suggestions: exact.total ? [] : searchSuggestions(catalog, query, options) };
}
export function find(catalog, token) { return findEntry(catalog, token); }
export function load(root) { return buildCatalog(root); }

export function readDemoSection(root, relativePath, entryId, options = {}) {
  const absolute = path.resolve(root, relativePath);
  if (!isInside(root, absolute) || !fs.existsSync(absolute)) throw new Error('示例文件不存在：' + relativePath);
  const lines = fs.readFileSync(absolute, 'utf8').split(/\r?\n/);
  const normalized = lines.map((line) => line.replace(/\s+/g, ''));
  let start = normalized.findIndex((line) => line.includes('demos.' + entryId + '=function') || line.includes("demos['" + entryId + "']=") || line.includes('demos["' + entryId + '"]='));
  if (start < 0) return readFilePage(root, relativePath, options);
  const nextDemo = /demos\.[A-Z]\d{2}\s*=/;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (nextDemo.test(lines[i])) { end = i; break; }
  }
  while (end > start + 1 && /^\s*$/.test(lines[end - 1])) end -= 1;
  const slice = lines.slice(start, end);
  const offset = Math.max(0, Number(options.offset) || 0);
  const limit = Number.isFinite(options.limit) ? Math.max(1, Number(options.limit)) : 240;
  const page = slice.slice(offset, offset + limit);
  return { path: rel(root, absolute), anchor: entryId, startLine: start + 1, endLine: end, totalLines: slice.length, offset, limit, returnedLines: page.length, remaining: Math.max(0, slice.length - offset - page.length), nextOffset: offset + page.length < slice.length ? offset + page.length : null, content: page.join('\n') };
}


export function readDocSection(root, relativePath, anchor, options = {}) {
  const absolute = path.resolve(root, relativePath);
  if (!isInside(root, absolute) || !fs.existsSync(absolute)) throw new Error('文档不存在：' + relativePath);
  const lines = fs.readFileSync(absolute, 'utf8').split(/\r?\n/);
  let start = 0;
  let level = 0;
  let found = false;
  const decoded = anchor ? decodeURIComponent(String(anchor)) : '';
  for (let i = 0; i < lines.length; i += 1) {
    if (!decoded || !lines[i].includes('id="' + decoded + '"')) continue;
    let headingIndex = -1;
    let next = i + 1;
    while (next < lines.length && lines[next].trim() === '') next += 1;
    if (next < lines.length && /^(#{1,6})\s+/.test(lines[next])) headingIndex = next;
    if (headingIndex < 0) {
      for (let previous = i - 1; previous >= Math.max(0, i - 4); previous -= 1) {
        if (/^(#{1,6})\s+/.test(lines[previous])) { headingIndex = previous; break; }
      }
    }
    if (headingIndex < 0) {
      for (let forward = i + 1; forward < Math.min(lines.length, i + 7); forward += 1) {
        if (/^(#{1,6})\s+/.test(lines[forward])) { headingIndex = forward; break; }
      }
    }
    if (headingIndex < 0) throw new Error('文档锚点未关联标题：' + relativePath + '#' + decoded);
    start = headingIndex;
    level = /^(#{1,6})\s+/.exec(lines[headingIndex])[1].length;
    found = true;
    break;
  }
  if (!found) {
    for (let i = 0; i < lines.length; i += 1) {
      const heading = /^(#{1,6})\s+(.+)$/.exec(lines[i]);
      if (!heading) continue;
      const title = heading[2].trim();
      const variants = [title, title.replace(/^\d+(?:\.\d+)*\.?\s*/, ''), title.replace(/[\u0060*_]/g, '')];
      const slug = (value) => value.toLowerCase().replace(/[\u0060*_~]/g, '').replace(/<[^>]*>/g, '').replace(/\./g, '-').replace(/[^\w\u4e00-\u9fff\- ]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
      if (!decoded || variants.includes(decoded) || variants.some((value) => slug(value) === decoded)) { start = i; level = heading[1].length; found = true; break; }
    }
  }
  if (!found) {
    if (anchor) throw new Error('文档锚点不存在：' + relativePath + '#' + anchor);
    start = 0;
    level = 0;
  }
  let end = lines.length;
  let fenced = false;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\s*(~~~|[\u0060]{3})/.test(lines[i])) fenced = !fenced;
    if (fenced) continue;
    const heading = /^(#{1,6})\s+/.exec(lines[i]);
    if (heading && level && heading[1].length <= level) { end = i; break; }
  }
  if (level === 0) end = lines.length;
  while (end > start + 1) {
    const last = lines[end - 1];
    if (/^\s*$/.test(last) || /^---\s*$/.test(last) || /<a\s+id=["']/.test(last)) end -= 1;
    else break;
  }
  const offset = Math.max(0, Number(options.offset) || 0);
  const limit = Number.isFinite(options.limit) ? Math.max(1, Number(options.limit)) : 240;
  const slice = lines.slice(start, end);
  const page = slice.slice(offset, offset + limit);
  return { path: rel(root, absolute), anchor: decoded || null, startLine: start + 1, endLine: end, totalLines: slice.length, offset, limit, returnedLines: page.length, remaining: Math.max(0, slice.length - offset - page.length), nextOffset: offset + page.length < slice.length ? offset + page.length : null, content: page.join('\n') };
}

export function readFilePage(root, relativePath, options = {}) {
  const absolute = path.resolve(root, relativePath);
  if (!isInside(root, absolute) || !fs.existsSync(absolute)) throw new Error('文件不存在：' + relativePath);
  if (!fs.statSync(absolute).isFile()) throw new Error('不是文本文件：' + relativePath);
  const lines = fs.readFileSync(absolute, 'utf8').split(/\r?\n/);
  const offset = Math.max(0, Number(options.offset) || 0);
  const limit = Number.isFinite(options.limit) ? Math.max(1, Number(options.limit)) : 240;
  const page = lines.slice(offset, offset + limit);
  return { path: rel(root, absolute), startLine: offset + 1, totalLines: lines.length, offset, limit, returnedLines: page.length, remaining: Math.max(0, lines.length - offset - page.length), nextOffset: offset + page.length < lines.length ? offset + page.length : null, content: page.join('\n') };
}

export function resolveEntryResource(catalog, entry, resourceKey, options = {}) {
  const resources = (entry.resources || []).filter((item) => item.key === resourceKey);
  if (!resources.length) return { error: 'unknown_resource' };
  const resource = resources.find((item) => item.preferred) || resources[0];
  if (options.file) return { resource, ...readFilePage(catalog.root, options.file, options) };
  if (resource.path) {
    if (resource.demoSection) return { resource, ...readDemoSection(catalog.root, resource.path, resource.demoSection, options) };
    if (resource.anchor) return { resource, ...readDocSection(catalog.root, resource.path, resource.anchor, options) };
    return { resource, ...readFilePage(catalog.root, resource.path, options) };
  }
  if (resource.href) {
    const resolved = resolveRef(catalog.root, resource.href);
    if (resolved && resolved.path) return { resource, ...readFilePage(catalog.root, resolved.path, options) };
    return { error: 'external_link', resource };
  }
  return { error: 'unreadable' };
}

export const paths = { MANIFEST_DIR, DOCS_DIR };
