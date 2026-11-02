import fs from 'node:fs';
import path from 'node:path';
import { MODULE_ORDER } from '../lib/source-order.mjs';

const CORPUS_PATH = 'docs/查询语料.md';
const MANIFEST_DIR = 'src/manifests';
const DOCS_DIR = 'docs';
const TYPE_LABEL = { I: '设计基础', B: '组合块' };

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function posix(value) { return String(value).replace(/\\/g, '/'); }
function rel(root, file) { return posix(path.relative(root, file)); }
function isInside(root, file) { const resolved = path.resolve(file); return resolved === root || resolved.startsWith(root + path.sep); }

function parseLinks(text) {
  const links = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let match;
  while ((match = re.exec(String(text || '')))) links.push({ label: match[1].trim(), href: match[2].trim() });
  return links;
}

function parseResourceSpec(text) {
  const resources = [];
  for (const part of String(text || '').split(/[；;]/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) resources.push({ key: trimmed.slice(0, eq).trim(), value: trimmed.slice(eq + 1).trim() });
  }
  return resources;
}

function splitAliases(text) {
  return String(text || '').split(/[、,，;；\s]+/).map((item) => item.trim()).filter(Boolean);
}

/* 结构化字段只认显式条目，不解析自然语言。
 * 模块依赖：module[, module...]；none 表示无浏览器组件模块。
 * 运行入口：independent|scene|public|recipe|authoring|example|tool（当前用于说明/校验，不猜上下文）。
 * 区域组件依赖：region=module[；region=module...]；caller 表示由调用方 bindings 决定。 */
const RUNTIME_VALUES = new Set(['independent', 'scene', 'public', 'recipe', 'authoring', 'example', 'tool']);
function parseModuleNames(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  if (normalizeName(raw) === 'none') return [];
  const names = raw.split(/[、,，;；\s]+/).map((item) => item.trim()).filter(Boolean);
  return [...new Set(names)];
}
function parseRuntime(text) {
  const value = normalizeName(text);
  return RUNTIME_VALUES.has(value) ? value : null;
}
function parseRegionDependencies(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  if (normalizeName(raw) === 'caller') return { caller: true, groups: [] };
  const groups = [];
  for (const part of raw.split(/[；;]/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const region = trimmed.slice(0, eq).trim();
    const moduleName = trimmed.slice(eq + 1).trim();
    if (!region || !moduleName) continue;
    const existing = groups.find((item) => item.module === moduleName);
    if (existing) existing.regions.push(region);
    else groups.push({ module: moduleName, regions: [region] });
  }
  return { caller: false, groups };
}
function normalizeName(value) { return String(value || '').replace(/\s+/g, '').toLowerCase(); }

function topicType(typeLine) {
  const line = String(typeLine || '');
  if (line.includes('代码配方')) return '配方';
  if (line.includes('公共入口')) return '公共入口';
  if (line.includes('接入主题')) return '公共接法';
  if (line.includes('作者辅助')) return '作者辅助';
  if (line.includes('构建工具')) return '构建工具';
  if (line.includes('验证工具')) return '验证工具';
  if (line.includes('完整示例')) return '完整示例';
  return '资料主题';
}

function parseCorpus(root) {
  const file = path.join(root, CORPUS_PATH);
  if (!fs.existsSync(file)) throw new Error('查询语料不存在：' + CORPUS_PATH);
  const text = fs.readFileSync(file, 'utf8');
  const headings = [];
  const re = /^### (Q\d+)\s+(.+)$/gm;
  let match;
  while ((match = re.exec(text))) headings.push({ q: match[1], title: match[2].trim(), index: match.index });
  const records = [];
  for (let i = 0; i < headings.length; i += 1) {
    const start = headings[i].index;
    const end = i + 1 < headings.length ? headings[i + 1].index : text.length;
    const body = text.slice(start, end);
    const fields = {};
    for (const line of body.split(/\r?\n/)) {
      const field = /^- ([^：:]+)[：:]\s*(.+)$/.exec(line.trim());
      if (field) fields[field[1].trim()] = field[2].trim();
    }
    const typeLine = fields['类型／关联'] || '';
    const idLine = fields['条目 ID'] || '';
    const ids = [...typeLine.matchAll(/\b([A-Z]\d{2})\b/g)].map((item) => item[1]);
    const isPublicEntry = /公共入口/.test(typeLine);
    const componentId = !idLine && ids.length ? ids[0] : null;
    records.push({
      q: headings[i].q, title: headings[i].title, typeLine, fields, componentId,
      topicId: idLine || null, topicType: idLine ? topicType(typeLine) : null,
      displayName: fields['展示名'] || null, terms: splitAliases(fields['检索词']),
      purpose: fields['用途'] || '', boundary: fields['适用与边界'] || '',
      related: fields['关联'] || '', reads: fields['后续读取'] || '',
      links: parseLinks(body), resources: parseResourceSpec(fields['资源']),
      contextText: fields['调用上下文'] || '', usageText: fields['最小用法'] || '',
      depsText: fields['依赖'] || '', roleText: fields['资料角色'] || '',
      moduleNames: parseModuleNames(fields['模块依赖']),
      runtime: parseRuntime(fields['运行入口']),
      runtimeText: fields['运行入口'] || '',
      regionDependencies: parseRegionDependencies(fields['区域组件依赖']),
      regionText: fields['区域组件依赖'] || '',
      publicEntry: isPublicEntry && componentId === 'I07'
    });
  }
  return records;
}

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

function parseSceneSupport(text) {
  const support = { modes: [], note: '' };
  const raw = String(text || '');
  const noteMatch = /说明[=：]([\s\S]*)$/.exec(raw);
  if (noteMatch) support.note = noteMatch[1].trim();
  const base = noteMatch ? raw.slice(0, noteMatch.index) : raw;
  for (const part of base.split(/[；;]/)) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 'mode') support.modes = value.split('|').map((item) => item.trim()).filter(Boolean);
    else if (key === '默认') support.defaultMode = value;
  }
  return support;
}

function buildComponent(entry, moduleName, modules, curated, root) {
  const prefix = entry.id.charAt(0);
  const type = TYPE_LABEL[prefix] || (String(entry.category || '').includes('组合块') ? '组合块' : '组件');
  const aliases = new Set([entry.id, entry.name, entry.cn].filter(Boolean));
  if (curated) {
    for (const term of curated.terms) aliases.add(term);
    for (const name of [curated.displayName, curated.title]) if (name) aliases.add(name);
    for (const word of String(curated.typeLine).matchAll(/[A-Za-z][A-Za-z0-9_.:-]*/g)) if (word[0].length > 2) aliases.add(word[0]);
  }
  const nameParts = String(entry.name || '').split('.');
  if (nameParts.length > 1) aliases.add(nameParts[nameParts.length - 1]);
  const resources = [];
  const seenResources = new Set();
  const corpusFile = path.join(root, CORPUS_PATH);
  function addResource(resource) {
    if (!resource) return;
    const target = resource.path ? resource.path + (resource.anchor ? '#' + resource.anchor : '') : resource.href;
    if (!target || seenResources.has(target)) return;
    const sameKey = resources.findIndex((item) => item.key === resource.key);
    if (sameKey >= 0) {
      if (!resource.preferred || resources[sameKey].preferred) return;
      resources[sameKey] = resource;
      seenResources.add(target);
      return;
    }
    seenResources.add(target);
    resources.push(resource);
  }
  if (entry.docs) {
    const [file, anchor] = String(entry.docs).split('#');
    addResource({ key: 'api', label: '完整 API 文档', path: file, anchor: anchor || null, readable: true });
  }
  const sourcePaths = (Array.isArray(entry.source) && entry.source.length) ? entry.source.slice() : [];
  if (!sourcePaths.length) {
    const module = modules.get(moduleName) || {};
    if (Array.isArray(module.js) && module.js.length) sourcePaths.push(module.js[0]);
  }
  if (sourcePaths.length) addResource({ key: 'source', label: '实现源码', path: sourcePaths[0], anchor: null, readable: true, note: entry.source ? null : '源清单未单列条目 source，这里取模块首个源文件；其余见模块 js。' });
  if (entry.demo) {
    const [file, anchor] = String(entry.demo).split('#');
    addResource({ key: 'demo', label: 'Gallery 示例（按条目段读取）', path: file, anchor: anchor || null, demoSection: entry.id, readable: true });
  } else {
    const module = modules.get(moduleName) || {};
    if (Array.isArray(module.demos) && module.demos.length) addResource({ key: 'demo', label: 'Gallery 模块示例（按条目段读取）', path: module.demos[0], anchor: null, demoSection: entry.id, readable: true });
  }
  if (entry.preview) addResource({ key: 'preview', label: 'Gallery 入口', href: entry.preview, readable: false });
  // Curated resource specs are root-relative and take precedence when they name a concrete source/example.
  if (curated) {
    for (const item of curated.resources || []) {
      const [fileWithQuery, anchor] = item.value.split('#');
      if (!fileWithQuery) continue;
      const [file, query] = fileWithQuery.split('?');
      const label = item.key === 'api' ? '精选引用文档' : item.key === 'source' ? '精选引用源码' : item.key === 'example' ? (file.includes('examples/run.html') ? '独立示例入口（页面加载器）' : file.includes('examples/authoring') ? '完整作者实例' : '真实示例') : item.key;
      addResource({ key: item.key, label, path: file, anchor: anchor || null, query: query || null, preferred: true, readable: !/^https?:/.test(file) });
    }
  }
  if (curated) {
    let refIndex = 0;
    for (const link of curated.links) {
      if (!link.label || !link.href || refIndex >= 8) continue;
      const resolved = resolveRef(root, link.href, corpusFile);
      if (!resolved) continue;
      if (resolved.external) addResource({ key: 'ref' + (++refIndex), label: link.label, href: resolved.href, readable: false });
      else if (resolved.path) addResource({ key: 'ref' + (++refIndex), label: link.label, path: resolved.path, anchor: resolved.anchor || null, href: resolved.href, readable: true });
    }
  }
  return {
    kind: 'component', id: entry.id, name: entry.name, cn: entry.cn || '', type,
    category: entry.category || '', module: moduleName,
    purpose: curated && curated.purpose ? curated.purpose : (entry.purpose || ''),
    manifestPurpose: entry.purpose || '', coverage: curated ? 'curated' : 'catalog',
    aliases: [...aliases], terms: curated ? curated.terms.slice() : [],
    limits: curated && curated.boundary ? [curated.boundary].concat((entry.limitations || []).slice(0, entry.id === 'I07' ? 6 : 3)) : (entry.limitations || []).slice(0, 5),
    allLimitations: entry.limitations || [], curated, manifest: entry,
    source: entry.source || [], inputs: entry.inputs || [], customizable: entry.customizable || [],
    states: entry.states || [], usage: entry.usage || '', dependencies: entry.dependencies || [],
    resources, docs: entry.docs || null, demo: entry.demo || null, preview: entry.preview || null, notes: entry.notes || ''
  };
}

function buildTopic(record) {
  const resources = [];
  for (const item of record.resources) {
    const [file, anchor] = item.value.split('#');
    resources.push({
      key: item.key,
      label: item.key === 'api' ? '完整契约 / 用法文档' : item.key === 'source' ? '实现源码' : item.key === 'example' ? '完整示例' : item.key === 'fragment' ? '局部接入片段' : item.key === 'control' ? '受控视觉接管说明' : item.key === 'preview' ? '离线预览入口' : item.key,
      path: file, anchor: anchor || null, readable: !/^https?:/.test(file)
    });
  }
  const aliases = new Set([record.topicId, record.displayName, record.title].filter(Boolean));
  if (record.displayName) {
    for (const part of String(record.displayName).split(/[\s/]+/)) if (part) aliases.add(part.replace(/\.mjs$/, ''));
    const last = String(record.displayName).split('.').pop();
    if (last) aliases.add(last);
    const topicSuffix = String(record.topicId).split(':').pop();
    if (topicSuffix) aliases.add(topicSuffix);
  }
  for (const term of record.terms) aliases.add(term);
  for (const link of record.links) if (link.label) aliases.add(link.label);
  return {
    kind: 'topic', id: record.topicId, name: record.displayName || record.title,
    cn: record.title, type: record.topicType, category: record.typeLine,
    purpose: record.purpose, coverage: 'curated', aliases: [...aliases],
    terms: record.terms.slice(), limits: record.boundary ? [record.boundary] : [],
    curated: record, resources, contextText: record.contextText, usageText: record.usageText,
    depsText: record.depsText, roleText: record.roleText, related: record.related, reads: record.reads, links: record.links,
    runtime: record.runtime, moduleDependencies: Array.isArray(record.moduleNames) ? record.moduleNames.slice() : null,
    regionDependencies: record.regionDependencies
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
  const corpus = parseCorpus(root);
  /* 结构化模块依赖必须能对应实际 manifest，避免语料写错模块名后静默回退。 */
  for (const record of corpus) {
    const names = record.moduleNames || [];
    for (const name of names) {
      if (!modules.has(name)) throw new Error('查询语料 ' + record.q + ' 模块依赖包含未知模块：' + name);
    }
    if (record.runtimeText && !record.runtime) throw new Error('查询语料 ' + record.q + ' 运行入口无法解析：' + record.runtimeText);
    if (record.regionText || record.regionDependencies) {
      if (!record.regionDependencies) throw new Error('查询语料 ' + record.q + ' 区域组件依赖无法解析：' + record.regionText);
      if (!record.regionDependencies.caller && !record.regionDependencies.groups.length) throw new Error('查询语料 ' + record.q + ' 区域组件依赖没有 region=module 项：' + record.regionText);
      for (const group of record.regionDependencies.groups) {
        if (!modules.has(group.module)) throw new Error('查询语料 ' + record.q + ' 区域组件依赖包含未知模块：' + group.module);
      }
    }
  }

  const curatedByComponent = new Map();
  const topicRecords = [];
  for (const record of corpus) {
    if (record.topicId) topicRecords.push(record);
    else if (record.componentId) {
      if (!curatedByComponent.has(record.componentId)) curatedByComponent.set(record.componentId, record);
      else {
        const current = curatedByComponent.get(record.componentId);
        current.terms = current.terms.concat(record.terms);
        current.links = current.links.concat(record.links);
        current.reads += '\n' + record.reads;
      }
    }
  }
  const components = [];
  for (const manifest of manifests) {
    for (const entry of manifest.raw.entries || []) {
      if (!entry || typeof entry.id !== 'string') continue;
      components.push(buildComponent(entry, manifest.raw.module, modules, curatedByComponent.get(entry.id) || null, root));
    }
  }
  const topics = topicRecords.map(buildTopic);
  const byId = new Map();
  const byName = new Map();
  for (const entry of components.concat(topics)) {
    byId.set(entry.id.toLowerCase(), entry);
    for (const key of [entry.name, entry.id, entry.cn, ...(entry.aliases || [])]) {
      const normalized = normalizeName(key);
      if (!normalized) continue;
      if (!byName.has(normalized)) byName.set(normalized, []);
      if (!byName.get(normalized).includes(entry)) byName.get(normalized).push(entry);
    }
  }
  return { root, modules, manifests, corpus, components, topics, entries: components.concat(topics), byId, byName,
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

function searchCatalog(catalog, query, options = {}) {
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
    contexts.push({ key: 'independent', label: '独立调用', usage: entry.usage || '', wholeLibrary: ['dist/note-library.css', 'dist/note-library.js'], dependencies: catalog.moduleLoading(entry.module), dependencySummary: entry.dependencies && entry.dependencies.length ? entry.dependencies.join(' → ') : '无额外模块依赖', refs: refsOf(entry), notes: entry.curated && entry.curated.boundary ? [entry.curated.boundary] : [] });
    const adapterLink = (entry.curated && entry.curated.links ? entry.curated.links : []).find((link) => /Adapter/i.test(link.label || '') || /adapters\//.test(link.href || ''));
    if (adapterLink) {
      const target = resolveRef(catalog.root, adapterLink.href, path.join(catalog.root, CORPUS_PATH));
      const adapterPath = target && target.path ? target.path : null;
      const support = parseSceneSupport(entry.curated && entry.curated.fields ? entry.curated.fields['场景支持'] : '');
      const usage = support.modes.length
        ? 'scene: { bindings:[{ binding, mode: ' + support.modes.map((mode) => '"' + mode + '"').join('|') + ' }] }；' + (support.note || ('默认 ' + (support.defaultMode || support.modes[0]) + '。'))
        : '该 Adapter（' + adapterLink.label + '）的 scene 支持范围未在查询资料中确认；先读 Adapter 文档的 sceneModes，再填写 bindings[].mode';
      contexts.push({ key: 'scene', label: '公共 scene 接入（' + adapterLink.label + '）', wholeLibrary: ['dist/note-library.css', 'dist/note-library.js'], usage, dependencies: sceneLoading(catalog, entry), dependencySummary: loadingSummary(sceneLoading(catalog, entry)) + '；默认舞台另加 demo-ui', refs: [{ key: 'scene-api', label: 'Adapter 视图与目标', path: 'docs/公共编排层.md', anchor: '5-1-内置-adapter-的视图与目标' }, ...(adapterPath ? [{ key: 'scene-source', label: adapterLink.label, path: adapterPath }] : [])], notes: ['独立调用直接更新组件状态；scene 需要该 Adapter 的 prepareChange/readView 与布局载体。', '不要把独立调用参数直接混入 Definition；先确认 Adapter 支持的 sceneModes 与 after/timing 边界。'] });
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
  if (!key) throw new Error('主题条目 ' + entry.id + ' 缺少可解析的 运行入口');
  return key;
}

function regionDependencyView(entry) {
  const region = entry.regionDependencies;
  if (!region) return null;
  if (region.caller) {
    return {
      dependencies: [],
      note: '区域组件由调用方 bindings 决定；配方骨架不内置区域组件模块。'
    };
  }
  if (!region.groups.length) return null;
  const groups = region.groups.map((group) => ({ module: group.module, regions: group.regions.slice() }));
  const note = '区域组件按调用方 bindings 另加：' + groups.map((group) => group.regions.join('/') + '→' + group.module).join('；') + '。';
  return { dependencies: groups, note };
}

function buildTopicContext(catalog, entry, contextKey) {
  if (!Array.isArray(entry.moduleDependencies)) throw new Error('主题条目 ' + entry.id + ' 缺少 模块依赖');
  const moduleNames = entry.moduleDependencies;
  const dependencies = catalog.moduleLoadingMany(moduleNames);
  const label = topicContextKey(entry);
  const ctx = {
    key: label,
    label: entry.type,
    runtime: entry.runtime || null,
    usage: entry.usageText || '',
    wholeLibrary: ['dist/note-library.css', 'dist/note-library.js'],
    moduleDependencies: moduleNames.slice(),
    dependencies,
    dependencySummary: dependencies.length ? loadingSummary(dependencies) : '无浏览器组件模块依赖',
    refs: refsOf(entry),
    notes: [entry.curated && entry.curated.boundary, entry.roleText, entry.curated && entry.curated.related ? '关联: ' + entry.curated.related : null].filter(Boolean)
  };
  if (entry.type === '配方') {
    const region = regionDependencyView(entry);
    if (region) {
      ctx.regionDependencies = region.dependencies;
      ctx.regionDependencyNote = region.note;
      ctx.dependencySummary = (dependencies.length ? loadingSummary(dependencies) + '（配方骨架）' : '无骨架模块依赖') + '；' + region.note;
      ctx.notes = ctx.notes.concat([
        '配方只提供区域骨架、槽位、布局与清理；区域组件模块按实际 bindings 另加，不随配方骨架默认加载。',
        region.note
      ]);
    }
  }
  if (entry.type === '构建工具') {
    ctx.wholeLibrary = null;
    ctx.moduleDependencies = [];
    ctx.dependencies = [];
    ctx.dependencySummary = 'Node 内置模块；无浏览器运行层、无 demo-runtime、无网络';
  }
  if (entry.type === '验证工具') {
    ctx.wholeLibrary = null;
    ctx.moduleDependencies = [];
    ctx.dependencies = [];
    ctx.dependencySummary = entry.depsText || 'Node 内置模块 + playwright-core + 本机浏览器；无 demo-runtime';
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

export function search(catalog, query, options = {}) { return searchCatalog(catalog, query, options); }
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
    const resolved = resolveRef(catalog.root, resource.href, path.join(catalog.root, CORPUS_PATH));
    if (resolved && resolved.path) return { resource, ...readFilePage(catalog.root, resolved.path, options) };
    return { error: 'external_link', resource };
  }
  return { error: 'unreadable' };
}

export const paths = { CORPUS_PATH, MANIFEST_DIR, DOCS_DIR };
