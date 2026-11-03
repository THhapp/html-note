#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, showCatalog, search, find, resolveEntryResource, readFilePage, paths } from './query/catalog.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDir, '..');
const COMMANDS = ['info', 'search', 'show', 'read'];

function fail(code, message, extra = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  throw error;
}

function parseArgs(argv) {
  const options = { json: false, root: null, context: null, file: null, offset: null, limit: null, type: null, module: null, resource: null };
  const allowed = new Set(['json', 'help', 'root', 'context', 'file', 'offset', 'limit', 'type', 'module', 'resource']);
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') { options.json = true; continue; }
    if (arg === '--help' || arg === '-h') { options.help = true; continue; }
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const eq = arg.indexOf('=');
    const key = (eq >= 0 ? arg.slice(2, eq) : arg.slice(2)).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (!allowed.has(key)) fail('usage', '未知选项 --' + key);
    let value = eq >= 0 ? arg.slice(eq + 1) : null;
    if (!['json', 'help'].includes(key)) {
      if (value == null) {
        value = argv[i + 1];
        if (value == null || value.startsWith('--')) fail('usage', '选项 --' + key + ' 需要一个值');
        i += 1;
      }
    }
    if (key === 'limit' || key === 'offset') {
      const number = Number(value);
      if (!Number.isInteger(number) || number < 0) fail('usage', '--' + key + ' 必须是非负整数');
      value = number;
    }
    options[key] = value;
  }
  return { options, positional };
}

function publicResource(resource) {
  return { key: resource.key, label: resource.label, path: resource.path || null, anchor: resource.anchor || null, query: resource.query || null, href: resource.href || null, readable: resource.readable !== false };
}

function searchProjection(result) {
  const entry = result.entry;
  const resources = (entry.resources || []).filter((item) => ['api', 'source', 'example', 'fragment', 'demo', 'full', 'minimal', 'guide'].includes(item.key)).slice(0, 8).map(publicResource);
  return {
    id: entry.id,
    name: entry.name,
    cn: entry.cn || '',
    type: entry.type,
    category: entry.category,
    module: entry.module || null,
    coverage: entry.coverage,
    coverageLabel: entry.coverage === 'curated' ? '精选资料' : '基础清单',
    purpose: entry.purpose,
    limits: (entry.limits || []).slice(0, 2),
    matchedBy: result.matchedBy,
    next: resources
  };
}

function showProjection(entry) {
  return {
    id: entry.id,
    name: entry.name,
    cn: entry.cn || '',
    type: entry.type,
    category: entry.category,
    module: entry.module || null,
    coverage: entry.coverage,
    purpose: entry.purpose,
    limits: entry.limits || [],
    inputs: entry.inputs || [],
    dependencies: entry.dependencies || [],
    source: entry.source || [],
    docs: entry.docs || null,
    demo: entry.demo || null,
    contexts: entry.contexts || [],
    resources: (entry.resources || []).map(publicResource),
    notes: entry.notes || '',
    curated: entry.curated ? { q: entry.curated.q, title: entry.curated.title, reads: entry.curated.reads, related: entry.curated.related } : null
  };
}

function commandInfo(catalog, options) {
  const curatedComponents = catalog.components.filter((entry) => entry.coverage === 'curated').length;
  const docs = {
    readme: 'README.md',
    usage: 'docs/取用与组合.md',
    design: 'docs/查询CLI.md',
    corpus: paths.CORPUS_PATH,
    publicApi: 'docs/公共编排层.md'
  };
  const commands = {
    info: 'node scripts/query.mjs info [--json]',
    search: 'node scripts/query.mjs search <中文/英文名称或用途> [--type <类型>] [--module m] [--limit n] [--json]',
    show: 'node scripts/query.mjs show <id|公开名|别名> [更多条目...] [--context independent|scene|create|mount|recipe|public|authoring|tool] [--json]',
    read: 'node scripts/query.mjs read <条目> <资源键|api|source|demo> [--offset n] [--limit n] [--file path] [--json]'
  };
  return {
    ok: true,
    command: 'info',
    library: {
      root: catalog.root,
      manifests: 'src/manifests/*.json',
      modules: catalog.modules.size,
      components: catalog.components.length,
      curatedRecords: catalog.corpus.length,
      curatedComponents,
      topicEntries: catalog.topics.length,
      totalEntries: catalog.entries.length
    },
    coverage: {
      componentCatalog: '全部 ' + catalog.components.length + ' 个源清单条目可按 ID/公开名/中文/类别/用途发现',
      curatedComponents: curatedComponents + ' 个组件有作者用途与别名',
      topicEntries: catalog.topics.length + ' 个配方/公共接法/作者辅助/工具/示例独立条目',
      notDefault: '不索引 archive、测试残料、ZIP 或生成的单文件 HTML',
      status: '资料覆盖表示可检索范围；具体能力边界由对应文档和源码维护'
    },
    docs,
    loading: {
      wholeLibrary: ['dist/note-library.css', 'dist/note-library.js'],
      moduleMode: '按 src/manifests 的模块依赖闭包使用 dist/modules/<module>.js|css',
      demoRuntime: catalog.closure('demo-runtime'),
      demoUi: catalog.closure('demo-ui'),
      note: 'NoteDemo.create 使用 demo-runtime + 自备 presentation；NoteDemo.mount 使用 demo-ui 及其传递依赖，不能只按 create 的依赖加载。'
    },
    commands,
    sourceOfTruth: ['src/manifests/*.json', paths.CORPUS_PATH, 'docs/*.md', '当前源码与 examples'],
    generated: 'registry.json 与 dist 是构建生成物；CLI 不修改它们，也不在查询时自动构建。',
    exit: '0 正常；1 未找到/资源读取失败/上下文不匹配；2 参数错误'
  };
}

function textInfo(data) {
  const lines = [];
  lines.push('html-note · 查询 CLI');
  lines.push('库位置: ' + data.library.root);
  lines.push('范围: ' + data.library.components + ' 个源条目 / ' + data.library.modules + ' 个模块；精选资料 ' + data.library.curatedRecords + ' 条（' + data.library.curatedComponents + ' 组件 + ' + data.library.topicEntries + ' 其他条目）');
  lines.push('');
  lines.push('资料覆盖:');
  for (const value of Object.values(data.coverage)) lines.push('  - ' + value);
  lines.push('');
  lines.push('现行文档入口:');
  for (const [key, value] of Object.entries(data.docs)) lines.push('  ' + key + ': ' + value);
  lines.push('');
  lines.push('加载方式:');
  lines.push('  整库: ' + data.loading.wholeLibrary.join(' + '));
  lines.push('  按模块: ' + data.loading.moduleMode);
  lines.push('  demo-runtime: ' + data.loading.demoRuntime.join(' -> '));
  lines.push('  demo-ui: ' + data.loading.demoUi.join(' -> '));
  lines.push('  注意: ' + data.loading.note);
  lines.push('');
  lines.push('命令:');
  for (const command of Object.values(data.commands)) lines.push('  ' + command);
  lines.push('');
  lines.push('退出码: ' + data.exit);
  return lines.join('\n');
}

function commandSearch(catalog, query, options) {
  if (!query || !query.trim()) fail('usage', 'search 需要一个非空查询（中文用途、英文别名、ID 或公开名）');
  const limit = options.limit == null ? 10 : Number(options.limit);
  if (!Number.isFinite(limit) || limit < 1) fail('usage', '--limit 必须是正整数');
  const filters = {};
  if (options.type) filters.type = String(options.type);
  if (options.module) filters.module = String(options.module);
  const result = search(catalog, query, { filters, limit });
  const suggestions = (result.suggestions || []).map((item) => ({
    ...searchProjection(item),
    suggestionFor: item.suggestionQueries.slice()
  }));
  const data = {
    ok: true, command: 'search', query,
    filters,
    scanned: catalog.entries.length,
    total: result.total,
    returned: result.results.length,
    results: result.results.map(searchProjection),
    suggestionsTotal: suggestions.length,
    suggestions
  };
  if (!result.total) {
    data.message = suggestions.length
      ? '没有精确匹配；以下 suggestions 只来自查询拆词后的真实检索命中，请逐项确认是否相关。'
      : '没有匹配条目，也没有可依据的相关候选；可以换用用途词、公开名、ID，或查完整组件目录 docs/组件目录.md。不要据此判断库缺少能力。';
  }
  return data;
}

function textSearch(data) {
  const lines = [];
  lines.push('搜索 "' + data.query + '" · 精确命中 ' + data.total + ' / 返回 ' + data.returned + '（扫描 ' + data.scanned + ' 条目）');
  function appendItem(index, item) {
    lines.push('');
    lines.push((index + 1) + '. ' + item.id + ' · ' + item.name + ' · ' + item.type + ' · ' + item.coverageLabel);
    if (item.category) lines.push('  类别/模块: ' + item.category + ' / ' + (item.module || '-'));
    lines.push('  用途: ' + item.purpose);
    if (item.limits && item.limits.length) lines.push('  边界: ' + item.limits[0]);
    lines.push('  匹配: ' + (item.matchedBy && item.matchedBy.length ? item.matchedBy.join('; ') : 'query'));
    if (item.next && item.next.length) lines.push('  入口: ' + item.next.map((resource) => resource.path ? resource.path + (resource.anchor ? '#' + resource.anchor : '') : resource.href).join(' | '));
  }
  if (!data.results.length) {
    lines.push('');
    lines.push(data.message);
    if (data.suggestions && data.suggestions.length) {
      lines.push('');
      const basis = [...new Set(data.suggestions.flatMap((item) => item.suggestionFor || []))];
      lines.push('相关候选（非精确结果；由拆词真实命中 ' + basis.join('/') + '）:');
      for (const [index, item] of data.suggestions.entries()) appendItem(index, item);
    }
    return lines.join('\n');
  }
  for (const [index, item] of data.results.entries()) appendItem(index, item);
  return lines.join('\n');
}

function commandShow(catalog, tokens, options) {
  if (!tokens.length) fail('usage', 'show 需要至少一个条目 ID/公开名/别名');
  if (options.context && !['independent', 'scene', 'create', 'mount', 'recipe', 'public', 'authoring', 'tool'].includes(options.context)) {
    fail('usage', '未知 --context "' + options.context + '"；有效值: independent, scene, create, mount, recipe, public, authoring, tool');
  }
  const result = showCatalog(catalog, tokens, { context: options.context || null });
  const entries = result.entries.map(showProjection);
  const missing = result.missing.map((item) => {
    const available = (item.availableContexts || []).map((entry) => entry.key);
    const message = item.error === 'unknown_context'
      ? '该条目没有请求的上下文' + (available.length ? '；实际可用: ' + available.join(', ') : '')
      : item.error === 'ambiguous' ? '名称匹配多个条目，请用 ID' : '未找到条目';
    return {
      token: item.token,
      entryId: item.entryId || null,
      error: item.error,
      message,
      availableContexts: item.availableContexts || [],
      hint: item.error === 'unknown_context' && item.entryId && available.length
        ? 'node scripts/query.mjs show ' + item.entryId + ' --context ' + available[0]
        : item.error === 'ambiguous' ? '使用其中一个 ID 重新 show' : '检查条目 ID/名称，或用 search 查找',
      suggestions: item.error === 'ambiguous' ? (item.matches || []).map((entry) => entry.id) : []
    };
  });
  return { ok: missing.length === 0, command: 'show', library: { root: catalog.root }, entries, missing };
}

function textShow(data) {
  const lines = [];
  if (!data.entries.length) lines.push('没有取得条目。');
  for (const entry of data.entries) {
    lines.push('');
    lines.push('# ' + entry.id + ' · ' + entry.name + ' · ' + entry.type + ' · ' + entry.coverage);
    lines.push('用途: ' + entry.purpose);
    if (entry.category) lines.push('类别: ' + entry.category + (entry.module ? ' / 模块 ' + entry.module : ''));
    lines.push('资料覆盖: ' + (entry.coverage === 'curated' ? '精选资料（有作者用途/别名/边界）' : '基础清单（仅 ID、名称、用途、接口摘要）'));
    for (const context of entry.contexts) {
      lines.push('');
      lines.push('## ' + context.label + ' [' + context.key + ']');
      if (context.usage) lines.push('用法: ' + context.usage);
      if (context.wholeLibrary) lines.push('整库加载: ' + context.wholeLibrary.join(' + '));
      if (context.dependencySummary) lines.push('依赖: ' + context.dependencySummary);
      if (context.dependencies && context.dependencies.length) lines.push('模块: ' + context.dependencies.map((item) => item.module + (item.css ? ' (js+css)' : ' (js)')).join(', '));
      for (const note of context.notes || []) lines.push('注意: ' + note);
      if (context.refs && context.refs.length) lines.push('入口: ' + context.refs.map((ref) => ref.key + (ref.label ? '(' + ref.label + ')' : '') + '=' + (ref.path || ref.href) + (ref.anchor ? '#' + ref.anchor : '') + (ref.query ? '?' + ref.query : '')).join(' | '));
    }
    lines.push('');
    lines.push('关键限制:');
    for (const limit of entry.limits) lines.push('  - ' + limit);
    if (entry.inputs && entry.inputs.length) lines.push('主要输入: ' + entry.inputs.join(', '));
    if (entry.source && entry.source.length) lines.push('源码: ' + entry.source.join(', '));
    if (entry.resources && entry.resources.length) {
      lines.push('可读资源:');
      for (const resource of entry.resources) lines.push('  - ' + resource.key + ': ' + (resource.path || resource.href) + (resource.anchor ? '#' + resource.anchor : '') + (resource.query ? '?' + resource.query : '') + '（' + resource.label + (resource.readable ? '，可 read' : '，链接') + '）');
    }
    if (entry.curated && entry.curated.reads) lines.push('后续读取: ' + entry.curated.reads);
  }
  if (data.missing.length) {
    lines.push('');
    lines.push('未取得:');
    for (const item of data.missing) {
      lines.push('  - ' + item.token + ': ' + item.message + (item.suggestions.length ? '（' + item.suggestions.join(', ') + '）' : ''));
      if (item.hint) lines.push('    可执行: ' + item.hint);
    }
  }
  return lines.join('\n');
}

function commandRead(catalog, entryToken, resourceKey, options) {
  const found = find(catalog, entryToken);
  if (!found.entry) {
    if (found.error === 'ambiguous') fail('not_found', '条目名称匹配多个结果，请使用 ID：' + (found.matches || []).map((entry) => entry.id).join(', '));
    fail('not_found', '未找到条目：' + entryToken);
  }
  const entry = found.entry;
  let key = resourceKey || null;
  if (!key && !options.file) {
    if ((entry.resources || []).some((item) => item.key === 'api')) key = 'api';
    else if ((entry.resources || []).some((item) => item.key === 'source')) key = 'source';
    else fail('usage', '条目没有默认可读资源；可用资源: ' + (entry.resources || []).map((item) => item.key).join(', ') || '（无）');
  }
  let page;
  try {
    if (options.file) {
      page = readFilePage(catalog.root, options.file, options);
      page.resource = { key: 'file', label: '指定文件', path: options.file };
    } else {
      const result = resolveEntryResource(catalog, entry, key, options);
      if (result.error === 'unknown_resource') fail('not_found', '资源键不存在：' + key + '；可用: ' + (entry.resources || []).map((item) => item.key).join(', '));
      if (result.error === 'external_link') fail('read_failed', '该资源是外部/入口链接，不能作为本地正文读取：' + (result.resource.href || ''));
      if (result.error) fail('read_failed', '资源不可读：' + key);
      page = result;
    }
  } catch (error) {
    if (error.code) throw error;
    fail('read_failed', error.message);
  }
  return {
    ok: true, command: 'read',
    entry: { id: entry.id, name: entry.name, type: entry.type },
    resource: { key: page.resource.key, label: page.resource.label, path: page.resource.path || page.path || null, anchor: page.resource.anchor || page.anchor || null },
    source: { path: page.path, anchor: page.anchor || null, startLine: page.startLine, endLine: page.endLine || page.totalLines, totalLines: page.totalLines },
    offset: page.offset,
    returnedLines: page.returnedLines,
    remaining: page.remaining,
    nextOffset: page.nextOffset,
    next: page.nextOffset != null ? 'node scripts/query.mjs read ' + entry.id + (options.file ? ' --file ' + options.file : ' ' + key) + ' --offset ' + page.nextOffset + (options.limit ? ' --limit ' + options.limit : '') : null,
    content: page.content
  };
}

function textRead(data) {
  const lines = [];
  lines.push('# ' + data.entry.id + ' · ' + data.entry.name + ' · ' + data.resource.key + ' · ' + data.source.path + (data.source.anchor ? '#' + data.source.anchor : ''));
  lines.push('文件行 ' + data.source.startLine + '-' + data.source.endLine + '；本次 ' + data.returnedLines + ' 行；剩余 ' + data.remaining + ' 行（起始偏移 ' + data.offset + '）');
  lines.push('');
  lines.push(data.content);
  if (data.next) { lines.push(''); lines.push('继续: ' + data.next); }
  return lines.join('\n');
}

function main() {
  const { options, positional } = parseArgs(process.argv.slice(2));
  const root = options.root ? path.resolve(options.root) : defaultRoot;
  if (options.help || positional[0] === 'help') { printHelp(options.json); return; }
  if (!COMMANDS.includes(positional[0])) fail('usage', '未知命令 "' + (positional[0] || '') + '"；有效命令: ' + COMMANDS.join(', '));
  const command = positional.shift();
  const catalog = load(root);
  let data;
  if (command === 'info') {
    if (positional.length) fail('usage', 'info 不接受额外位置参数');
    data = commandInfo(catalog, options);
    console.log(options.json ? JSON.stringify(data, null, 2) : textInfo(data));
  } else if (command === 'search') {
    const query = positional.join(' ').trim();
    data = commandSearch(catalog, query, options);
    console.log(options.json ? JSON.stringify(data, null, 2) : textSearch(data));
  } else if (command === 'show') {
    data = commandShow(catalog, positional, options);
    console.log(options.json ? JSON.stringify(data, null, 2) : textShow(data));
    if (!data.ok) process.exitCode = 1;
  } else if (command === 'read') {
    if (!positional.length) fail('usage', 'read 需要条目和资源键，例如: read D01 api');
    const entry = positional[0];
    const resource = positional[1] || options.resource || null;
    if (options.file && !path.isAbsolute(options.file)) {
      const candidate = path.resolve(process.cwd(), options.file);
      if (fs.existsSync(candidate)) options.file = candidate;
    }
    data = commandRead(catalog, entry, resource, options);
    console.log(options.json ? JSON.stringify(data, null, 2) : textRead(data));
  }
}

function printHelp(json) {
  const help = {
    usage: 'node scripts/query.mjs <info|search|show|read> ... [--json] [--root <库目录>]',
    commands: {
      info: '库位置、资料覆盖、文档入口、加载方式',
      search: '按中文/英文名称、ID、别名、用途检索；支持 --type、--module、--limit',
      show: '取得一个或多个条目的开工包；支持 --context',
      read: '读取条目的完整文档段、源码或指定文件；支持 --offset/--limit/--file'
    },
    examples: [
      'node scripts/query.mjs info',
      'node scripts/query.mjs search 矩阵 --json',
      'node scripts/query.mjs show D01',
      'node scripts/query.mjs show recipe:focusWorkbench --context recipe',
      'node scripts/query.mjs show public:progress',
      'node scripts/query.mjs read public:progress api',
      'node scripts/query.mjs show example:continuous-scene',
      'node scripts/query.mjs show tool:inspect-note',
      'node scripts/query.mjs read D01 api',
      'node scripts/query.mjs read D01 source --offset 0 --limit 80'
    ],
    exitCodes: { 0: '成功（空搜索也是 0）', 1: '未找到/读取失败/上下文不匹配', 2: '参数错误' }
  };
  console.log(json ? JSON.stringify(help, null, 2) : ['html-note 查询 CLI', '', '用法: ' + help.usage, '', '命令:'].concat(Object.entries(help.commands).map(([key, value]) => '  ' + key + ': ' + value)).concat(['', '示例:'].concat(help.examples.map((line) => '  ' + line)).concat(['', '退出码: 0 成功；1 未找到/读取失败；2 参数错误'])).join('\n'));
}

try {
  main();
} catch (error) {
  const isUsage = error.code === 'usage';
  const data = { ok: false, command: process.argv[2] || null, error: { code: error.code || 'error', message: error.message } };
  if (process.argv.includes('--json')) console.log(JSON.stringify(data, null, 2));
  else console.error('error: ' + error.message);
  process.exitCode = isUsage ? 2 : 1;
}
