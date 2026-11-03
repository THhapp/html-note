#!/usr/bin/env node
/*
 * Lightweight query CLI check: real process invocations, JSON parsing,
 * outside-cwd invocation, resource reads and explicit failures.
 * No browser, no build, no network.
 *
 * Usage: node tests/checks/query-cli-check.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const cli = path.join(root, 'scripts', 'query.mjs');
const failures = [];
let passes = 0;

function pass(message) { passes += 1; console.log('PASS  ' + message); }
function fail(message) { failures.push(message); console.log('FAIL  ' + message); }
function run(args, cwd = root) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', windowsHide: true });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}
function json(result) {
  try { return JSON.parse(result.stdout); }
  catch (error) { throw new Error('stdout 不是单一 JSON：' + result.stdout.slice(0, 300)); }
}
function expect(condition, message, detail) { if (condition) pass(message); else fail(message + (detail ? ' :: ' + detail : '')); }

const manifestDir = path.join(root, 'src', 'manifests');
let componentCount = 0;
const moduleNames = new Set();
for (const name of fs.readdirSync(manifestDir).filter((item) => item.endsWith('.json'))) {
  const data = JSON.parse(fs.readFileSync(path.join(manifestDir, name), 'utf8'));
  if (typeof data.module === 'string') moduleNames.add(data.module);
  if (Array.isArray(data.entries)) componentCount += data.entries.length;
}
const moduleCount = moduleNames.size;
const corpusHeadingCount = [...fs.readFileSync(path.join(root, 'docs', '查询语料.md'), 'utf8').matchAll(/^### Q\d+\s+/gm)].length;

const infoResult = run(['info', '--json']);
const info = json(infoResult);
expect(infoResult.status === 0 && info.ok === true, 'info JSON 可解析且成功', infoResult.stderr);
expect(path.resolve(info.library.root) === root, 'info 返回实际库位置', info.library.root);
expect(info.library.components === componentCount && info.library.modules === moduleCount, 'info 计数复用源清单', JSON.stringify(info.library));
expect(info.library.curatedRecords === corpusHeadingCount, 'info 精选条数与语料记录一致', String(info.library.curatedCompacts));
expect(info.commands && info.commands.search && info.commands.show, 'info 给出真实命令入口');

const searchMatrix = json(run(['search', '矩阵', '--json']));
expect(searchMatrix.ok === true && searchMatrix.results.some((item) => item.id === 'D02' && item.coverage === 'curated'), '中文用途“矩阵”命中 D02 且标为精选', JSON.stringify(searchMatrix.results.map((item) => item.id)));
const searchDialog = json(run(['search', 'dialog', '--json']));
expect(searchDialog.ok === true && searchDialog.results.some((item) => item.name === 'NoteUI.Dialog' && item.coverage === 'catalog'), '英文名 dialog 命中完整目录组件', JSON.stringify(searchDialog.results.map((item) => item.name)));
const searchSteps = json(run(['search', '分步演示', '--json']));
expect(searchSteps.ok === true && searchSteps.results.some((item) => item.id === 'I07') && searchSteps.results.some((item) => item.id === 'example:continuous-scene'),
  '“分步演示”命中运行层与最小示例', JSON.stringify(searchSteps.results.map((item) => item.id)));
const searchStage = json(run(['search', '静态舞台', '--json']));
expect(searchStage.ok === true && searchStage.results.some((item) => item.id === 'B01'),
  '“静态舞台”命中舞台容器而非运行层', JSON.stringify(searchStage.results.map((item) => item.id)));
const searchButton = json(run(['search', '按钮', '--json']));
expect(searchButton.ok === true && searchButton.results.some((item) => item.id === 'R01' && item.coverage === 'catalog'), '首批语料外组件仍返回基础信息（R01）', JSON.stringify(searchButton.results.map((item) => item.id)));
const searchStageTrack = json(run(['search', '阶段轨', '--json']));
expect(searchStageTrack.ok === true && searchStageTrack.results.some((item) => item.id === 'D07'),
  '“阶段轨”命中 D07', JSON.stringify(searchStageTrack.results.map((item) => item.id)));
const searchPacketFlow = json(run(['search', '消息流', '--json']));
expect(searchPacketFlow.ok === true && searchPacketFlow.results.some((item) => item.id === 'D08'),
  '“消息流”命中 D08', JSON.stringify(searchPacketFlow.results.map((item) => item.id)));
const flowKit = json(run(['show', 'example:flow-kit', '--json']));
const flowKitEntry = flowKit.entries && flowKit.entries[0];
expect(flowKit.ok === true && flowKitEntry && flowKitEntry.resources.some((item) => item.key === 'example') && flowKitEntry.resources.some((item) => item.key === 'fragment'),
  'show example:flow-kit 返回完整示例与局部片段', JSON.stringify(flowKitEntry && flowKitEntry.resources && flowKitEntry.resources.map((item) => item.key)));
const continuousAdapter = json(run(['show', 'public:continuous-adapter', '--json']));
const continuousAdapterEntry = continuousAdapter.entries && continuousAdapter.entries[0];
expect(continuousAdapter.ok === true && continuousAdapterEntry && continuousAdapterEntry.resources.some((item) => item.key === 'api') && continuousAdapterEntry.resources.some((item) => item.key === 'source'),
  'show public:continuous-adapter 返回 API 与源码', JSON.stringify(continuousAdapterEntry && continuousAdapterEntry.resources && continuousAdapterEntry.resources.map((item) => item.key)));
function resourceMap(entry) {
  const map = {};
  for (const resource of entry.resources || []) map[resource.key] = resource;
  return map;
}
const adapterResources = resourceMap(continuousAdapterEntry);
const adapterExpectedResources = ['api', 'guide', 'source', 'example', 'fragment', 'full'];
expect(adapterExpectedResources.every((key) => adapterResources[key]) &&
  adapterResources.api.path === 'docs/公共编排层.md' && adapterResources.api.anchor === 'author-scene-adapter' && adapterResources.api.label === '完整契约 / 用法文档' &&
  adapterResources.guide.path === 'docs/自定义画面接入.md' && adapterResources.guide.label === '接入文档' &&
  adapterResources.example.path === 'examples/continuous-scene/minimal.html' &&
  adapterResources.example.label === '最小示例' &&
  adapterResources.fragment.path === 'examples/continuous-scene/adapter.js' &&
  adapterResources.source.path === 'src/demo/scene-adapter.js' &&
  adapterResources.full.path === 'examples/continuous-scene/index.html' &&
  adapterResources.full.label === '完整示例',
  'public:continuous-adapter 直接定位接入文档、最小宿主、片段、源码与完整示例', JSON.stringify(adapterExpectedResources.map((key) => adapterResources[key] && [key, adapterResources[key].label, adapterResources[key].path])));
expect(adapterExpectedResources.every((key) => fs.existsSync(path.join(root, adapterResources[key].path))),
  'public:continuous-adapter 的资源路径真实存在', JSON.stringify(adapterExpectedResources.map((key) => adapterResources[key] && adapterResources[key].path)));
for (const key of adapterExpectedResources) {
  const read = json(run(['read', 'public:continuous-adapter', key, '--json']));
  expect(read.ok === true && read.resource && read.resource.path === adapterResources[key].path &&
    read.source && read.source.path === adapterResources[key].path,
    'read public:continuous-adapter ' + key + ' 可读取真实资源', read.source && read.source.path);
}
const continuousExample = json(run(['show', 'example:continuous-scene', '--json']));
const continuousExampleEntry = continuousExample.entries && continuousExample.entries[0];
const continuousResources = resourceMap(continuousExampleEntry);
expect(continuousExample.ok === true && continuousResources.minimal && continuousResources.minimal.path === 'examples/continuous-scene/minimal.html' &&
  continuousResources.guide.path === 'docs/自定义画面接入.md' && continuousResources.guide.label === '接入文档' &&
  continuousResources.api.path === 'docs/公共编排层.md' && continuousResources.api.anchor === 'author-continuous-example' &&
  continuousResources.example.path === 'examples/continuous-scene/index.html' &&
  continuousResources.minimal.label === '最小示例',
  'example:continuous-scene 区分最小宿主、接入文档与完整示例', JSON.stringify(Object.fromEntries(Object.entries(continuousResources).map(([key, item]) => [key, [item.label, item.path]]))));
const continuousMinimalRead = json(run(['read', 'example:continuous-scene', 'minimal', '--json']));
expect(continuousMinimalRead.ok === true && continuousMinimalRead.resource.path === 'examples/continuous-scene/minimal.html' &&
  continuousMinimalRead.source.path === 'examples/continuous-scene/minimal.html', 'read example:continuous-scene minimal 可读取最小宿主', continuousMinimalRead.source && continuousMinimalRead.source.path);
const inspectEntryForResources = json(run(['show', 'tool:inspect-note', '--json'])).entries[0];
const inspectResources = resourceMap(inspectEntryForResources);
expect(inspectEntryForResources.contexts[0].usage.includes('--frame') && inspectResources.guide.path === 'docs/自定义画面接入.md' &&
  inspectResources.example.path === 'examples/continuous-scene/minimal.html',
  'tool:inspect-note 补 --frame、接入文档与观察入口', JSON.stringify({ usage: inspectEntryForResources.contexts[0].usage, resources: Object.keys(inspectResources) }));
const inspectFrameSearch = json(run(['search', 'frame', '--json']));
expect(inspectFrameSearch.ok === true && inspectFrameSearch.results.some((item) => item.id === 'tool:inspect-note'),
  'tool:inspect-note 的通用检索词可命中 --frame/停点', JSON.stringify(inspectFrameSearch.results.map((item) => item.id)));
const inspectGuideRead = json(run(['read', 'tool:inspect-note', 'guide', '--json']));
expect(inspectGuideRead.ok === true && inspectGuideRead.resource.path === 'docs/自定义画面接入.md' &&
  inspectGuideRead.source.path === 'docs/自定义画面接入.md', 'read tool:inspect-note guide 指向接入文档', inspectGuideRead.source && inspectGuideRead.source.path);
const customScreenSearch = json(run(['search', '自定义画面', '--json']));
const adapterSearchResult = customScreenSearch.results.find((item) => item.id === 'public:continuous-adapter');
const continuousSearchResult = customScreenSearch.results.find((item) => item.id === 'example:continuous-scene');
expect(customScreenSearch.ok === true && adapterSearchResult && continuousSearchResult &&
  adapterSearchResult.next.some((item) => item.key === 'guide' && item.label === '接入文档') &&
  adapterSearchResult.next.some((item) => item.key === 'full' && item.label === '完整示例') &&
  continuousSearchResult.next.some((item) => item.key === 'guide' && item.label === '接入文档') &&
  continuousSearchResult.next.some((item) => item.key === 'minimal' && item.label === '最小示例'),
  '搜索投影支持 full/minimal 资源键与标签', JSON.stringify({ adapter: adapterSearchResult && adapterSearchResult.next, continuous: continuousSearchResult && continuousSearchResult.next }));
const attentionApi = json(run(['read', 'public:attention', 'api', '--json']));
expect(attentionApi.ok === true && /outset/.test(attentionApi.content) && /optional/.test(attentionApi.content),
  'attention API 含相对范围与 optional union');
const c06Api = json(run(['read', 'C06', 'api', '--json']));
expect(c06Api.ok === true && /rowState/.test(c06Api.content) && /getState/.test(c06Api.content), 'C06 API 含行状态与 getState');
const d03Api = json(run(['read', 'D03', 'api', '--json']));
expect(d03Api.ok === true && /getEdgeTarget/.test(d03Api.content) && /edgeFocus/.test(d03Api.content), 'D03 API 含边目标与状态');
const r04Api = json(run(['read', 'R04', 'api', '--json']));
expect(r04Api.ok === true && /数组/.test(r04Api.content), 'R04 API 含节点数组契约');
const f10Api = json(run(['read', 'F10', 'api', '--json']));
expect(f10Api.ok === true && /ticks/.test(f10Api.content) && /segments/.test(f10Api.content), 'F10 API 含刻度与分段');
const compositionExample = json(run(['show', 'example:flow-composition', '--json']));
expect(compositionExample.ok === true && compositionExample.entries && compositionExample.entries[0] && compositionExample.entries[0].resources.some((item) => item.key === 'example'),
  'show example:flow-composition 返回完整示例', JSON.stringify(compositionExample.entries && compositionExample.entries[0] && compositionExample.entries[0].resources));
const propagationEntry = json(run(['show', 'public:propagation', '--json']));
expect(propagationEntry.ok === true && propagationEntry.entries && propagationEntry.entries[0] && propagationEntry.entries[0].resources.some((item) => item.key === 'api'),
  'show public:propagation 返回 API 资源', JSON.stringify(propagationEntry.entries && propagationEntry.entries[0] && propagationEntry.entries[0].resources));
const tableAdapterEntry = json(run(['show', 'public:table-adapter', '--json']));
expect(tableAdapterEntry.ok === true && tableAdapterEntry.entries && tableAdapterEntry.entries[0] && tableAdapterEntry.entries[0].resources.some((item) => item.key === 'source'),
  'show public:table-adapter 返回源码资源', JSON.stringify(tableAdapterEntry.entries && tableAdapterEntry.entries[0] && tableAdapterEntry.entries[0].resources));
const flowStageEntry = json(run(['show', 'public:flow-stage-adapter', '--json']));
expect(flowStageEntry.ok === true && flowStageEntry.entries && flowStageEntry.entries[0] && flowStageEntry.entries[0].resources.some((item) => item.key === 'source'),
  'show public:flow-stage-adapter 返回源码资源', JSON.stringify(flowStageEntry.entries && flowStageEntry.entries[0] && flowStageEntry.entries[0].resources));
const recipeComposition = json(run(['show', 'recipe:composition', '--json']));
expect(recipeComposition.ok === true && recipeComposition.entries && recipeComposition.entries[0] && recipeComposition.entries[0].resources.some((item) => item.key === 'source'),
  'show recipe:composition 返回配方源码', JSON.stringify(recipeComposition.entries && recipeComposition.entries[0] && recipeComposition.entries[0].resources));
function dependencyModules(entry) {
  const context = entry && entry.contexts && entry.contexts[0];
  return context && Array.isArray(context.dependencies) ? context.dependencies.map((item) => item.module) : null;
}
const expectedDeps = {
  propagation: ['core', 'viz-flow'],
  tableAdapter: ['core', 'ui-content', 'demo-runtime'],
  flowAdapter: ['core', 'viz-flow', 'demo-runtime'],
  flowKit: ['core', 'viz-flow'],
  flowComposition: ['core', 'legacy', 'ui-layout', 'ui-content', 'viz-flow', 'blocks-base', 'demo-stage', 'demo-runtime', 'demo-ui'],
  recipeSkeleton: ['core', 'legacy', 'ui-layout', 'blocks-base', 'demo-stage', 'demo-runtime', 'demo-ui']
};
function sameModules(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}
const propagationDeps = dependencyModules(propagationEntry.entries[0]);
expect(sameModules(propagationDeps, expectedDeps.propagation), 'propagation 实际依赖闭包是 core + viz-flow（不含 demo-runtime）', JSON.stringify(propagationDeps));
expect(propagationEntry.entries[0].contexts[0].runtime === 'independent', 'propagation 标注 independent 运行入口', propagationEntry.entries[0].contexts[0].runtime);
const propagationIndependent = json(run(['show', 'public:propagation', '--context', 'independent', '--json']));
expect(propagationIndependent.ok === true && propagationIndependent.entries[0].contexts[0].key === 'independent' &&
  sameModules(dependencyModules(propagationIndependent.entries[0]), expectedDeps.propagation) &&
  propagationIndependent.entries[0].contexts[0].dependencySummary === expectedDeps.propagation.join(' + ') &&
  propagationIndependent.entries[0].contexts[0].wholeLibrary.length === 2,
  'show public:propagation --context independent 返回真实闭包与整库补充入口', JSON.stringify(propagationIndependent.entries && propagationIndependent.entries[0] && propagationIndependent.entries[0].contexts));
const propagationPublicContext = json(run(['show', 'public:propagation', '--context', 'public', '--json']));
expect(propagationPublicContext.ok === false && propagationPublicContext.missing && propagationPublicContext.missing[0].availableContexts.some((item) => item.key === 'independent'),
  'propagation 不再暴露 public context，availableContexts 指向 independent', JSON.stringify(propagationPublicContext.missing));
const tableAdapterDeps = dependencyModules(tableAdapterEntry.entries[0]);
expect(sameModules(tableAdapterDeps, expectedDeps.tableAdapter), 'table adapter 实际依赖闭包含 core + ui-content + demo-runtime', JSON.stringify(tableAdapterDeps));
const flowAdapterDeps = dependencyModules(flowStageEntry.entries[0]);
expect(sameModules(flowAdapterDeps, expectedDeps.flowAdapter), 'flow-stage adapter 实际依赖闭包含 core + viz-flow + demo-runtime', JSON.stringify(flowAdapterDeps));
const flowPacketEntry = json(run(['show', 'public:flow-packet-adapter', '--json']));
const flowSegmentEntry = json(run(['show', 'public:flow-segment-adapter', '--json']));
const flowDeviceEntry = json(run(['show', 'public:flow-device-adapter', '--json']));
expect(sameModules(dependencyModules(flowPacketEntry.entries[0]), expectedDeps.flowAdapter) &&
  sameModules(dependencyModules(flowSegmentEntry.entries[0]), expectedDeps.flowAdapter) &&
  sameModules(dependencyModules(flowDeviceEntry.entries[0]), expectedDeps.flowAdapter),
  'flow-packet/segment/device adapter 共用同一真实闭包', JSON.stringify({ packet: dependencyModules(flowPacketEntry.entries[0]), segment: dependencyModules(flowSegmentEntry.entries[0]), device: dependencyModules(flowDeviceEntry.entries[0]) }));
const flowKitDeps = dependencyModules(flowKitEntry);
expect(sameModules(flowKitDeps, expectedDeps.flowKit) && !flowKitDeps.includes('demo-ui'), 'flow-kit 实际依赖闭包是 core + viz-flow（不套 demo-ui）', JSON.stringify(flowKitDeps));
const compositionDeps = dependencyModules(compositionExample.entries[0]);
expect(sameModules(compositionDeps, expectedDeps.flowComposition), 'flow-composition 实际依赖闭包含 demo-ui + ui-content + viz-flow', JSON.stringify(compositionDeps));
const recipeDeps = dependencyModules(recipeComposition.entries[0]);
expect(sameModules(recipeDeps, expectedDeps.recipeSkeleton), 'recipe:composition 骨架依赖闭包是 demo-ui，不把区域组件并入骨架', JSON.stringify(recipeDeps));
const recipeContext = recipeComposition.entries[0].contexts[0];
expect(recipeContext.dependencySummary.includes('配方骨架') && recipeContext.dependencySummary.includes('区域组件') &&
  Array.isArray(recipeContext.regionDependencies) &&
  recipeContext.regionDependencies.some((item) => item.module === 'ui-content' && item.regions.includes('table')) &&
  recipeContext.regionDependencies.some((item) => item.module === 'viz-flow' && item.regions.includes('packet')),
  'recipe:composition 分述骨架依赖与区域组件依赖', JSON.stringify({ summary: recipeContext.dependencySummary, regions: recipeContext.regionDependencies }));
const focusWorkbench = json(run(['show', 'recipe:focusWorkbench', '--context', 'recipe', '--json']));
const focusContext = focusWorkbench.entries[0].contexts[0];
expect(sameModules(dependencyModules(focusWorkbench.entries[0]), expectedDeps.recipeSkeleton) &&
  focusContext.regionDependencies && focusContext.regionDependencies.length === 0 &&
  /区域组件由调用方 bindings 决定/.test(focusContext.dependencySummary),
  'focusWorkbench 骨架依赖 demo-ui，区域组件标记为调用方决定', JSON.stringify({ deps: dependencyModules(focusWorkbench.entries[0]), summary: focusContext.dependencySummary }));
const exampleDefaultContext = json(run(['show', 'example:flow-kit', '--json']));
const exampleAuthoringContext = json(run(['show', 'example:flow-kit', '--context', 'authoring', '--json']));
expect(exampleDefaultContext.ok === true && exampleDefaultContext.entries[0].contexts[0].key === 'authoring' &&
  exampleDefaultContext.entries[0].contexts[0].runtime === 'example' &&
  exampleAuthoringContext.ok === true && exampleAuthoringContext.entries[0].contexts[0].key === 'authoring',
  '完整示例没有独立 example context，按 authoring 提供并可 --context authoring 取用', JSON.stringify({ defaultKey: exampleDefaultContext.entries && exampleDefaultContext.entries[0] && exampleDefaultContext.entries[0].contexts[0].key }));
const recipeExplicitContext = json(run(['show', 'recipe:composition', '--context', 'recipe', '--json']));
expect(recipeExplicitContext.ok === true && recipeExplicitContext.entries[0].contexts[0].key === 'recipe' &&
  sameModules(dependencyModules(recipeExplicitContext.entries[0]), expectedDeps.recipeSkeleton),
  'recipe:composition --context recipe 保持骨架依赖与 recipe key', JSON.stringify(recipeExplicitContext.entries && recipeExplicitContext.entries[0] && recipeExplicitContext.entries[0].contexts));
const toolForDeps = json(run(['show', 'tool:inspect-note', '--json'])).entries[0].contexts[0];
const toolDeps = toolForDeps.dependencies.map((item) => item.module);
expect(toolDeps.length === 0 && toolForDeps.moduleDependencies.length === 0, '工具 topic 的结构化模块依赖为空，不混入浏览器模块', JSON.stringify(toolDeps));


const flowKitDoc = json(run(['read', 'public:propagation', 'api', '--json']));
expect(flowKitDoc.ok === true && /Propagation/.test(flowKitDoc.content), 'public:propagation API 含 Propagation 说明');
const empty = json(run(['search', '不存在词xyz', '--json']));
expect(empty.ok === true && empty.total === 0 && empty.results.length === 0 && empty.message, '空搜索是正常结果，不伪造推荐');

const d01 = json(run(['show', 'D01', '--json']));
const d01Entry = d01.entries && d01.entries[0];
expect(d01.ok === true && d01Entry && d01Entry.id === 'D01', 'show D01 成功');
expect(d01Entry.contexts.some((item) => item.key === 'independent') && d01Entry.contexts.some((item) => item.key === 'scene'), 'D01 分开给出独立调用与 scene 上下文');
const d01Scene = d01Entry.contexts.find((item) => item.key === 'scene');
expect(d01Scene.refs.some((item) => item.anchor === '5-1-内置-adapter-的视图与目标'), 'D01 scene 入口指向 Adapter 文档');
expect(d01Scene.dependencies.some((item) => item.module === 'viz-objects') && d01Scene.dependencies.some((item) => item.module === 'demo-runtime') && d01Scene.dependencies.some((item) => item.module === 'core'), 'D01 scene 依赖包含组件模块、运行层与 core', JSON.stringify(d01Scene.dependencies.map((item) => item.module)));
const d02Scene = json(run(['show', 'D02', '--context', 'scene', '--json'])).entries[0].contexts[0];
expect(d02Scene.dependencies.some((item) => item.module === 'viz-objects') && d02Scene.usage.includes('mode: "cut"|"update"') && d02Scene.usage.includes('不支持 layout/reveal'), 'D02 scene 依赖包含 viz-objects 且用法只表达 cut/update', JSON.stringify({ modules: d02Scene.dependencies.map((item) => item.module), usage: d02Scene.usage }));
const c13Scene = json(run(['show', 'C13', '--context', 'scene', '--json'])).entries[0].contexts[0];
expect(c13Scene.dependencies.some((item) => item.module === 'ui-content') && c13Scene.usage.includes('layout') && c13Scene.usage.includes('cut') && !c13Scene.usage.includes('update') && !c13Scene.usage.includes('reveal'), 'C13 scene 依赖包含 ui-content 且用法只表达 layout/cut', JSON.stringify({ modules: c13Scene.dependencies.map((item) => item.module), usage: c13Scene.usage }));
const d01Api = json(run(['read', 'D01', 'api', '--limit', '20', '--json']));
expect(d01Api.ok === true && d01Api.content.trim().startsWith('## 2. D01 NoteViz.Sequence') && /D01 NoteViz\.Sequence/.test(d01Api.content) && d01Api.remaining > 0 && d01Api.nextOffset != null, 'read D01 api 返回完整小节并给出继续偏移', JSON.stringify({ remaining: d01Api.remaining, nextOffset: d01Api.nextOffset }));
const d01Demo = json(run(['read', 'D01', 'demo', '--limit', '6', '--json']));
expect(d01Demo.ok === true && /demos\.D01\s*=\s*function/.test(d01Demo.content) && !d01Demo.content.includes('export function readDocSection'), 'read D01 demo 取得真实示例段且正则替换串无函数声明残留');

const i07 = json(run(['show', 'I07', '--json']));
const i07Entry = i07.entries && i07.entries[0];
const i07Create = i07Entry && i07Entry.contexts.find((item) => item.key === 'create');
const i07Mount = i07Entry && i07Entry.contexts.find((item) => item.key === 'mount');
expect(i07.ok === true && i07Create && i07Mount, 'I07 分开给出 create 与 mount 上下文');
expect(i07Create.dependencies.some((item) => item.module === 'demo-runtime') && !i07Create.dependencies.some((item) => item.module === 'demo-ui'), 'I07 create 依赖止于 demo-runtime');
expect(i07Mount.dependencies.some((item) => item.module === 'demo-ui'), 'I07 mount 依赖包含 demo-ui 闭包');
const i07Limits = (i07Entry.limits || []).join(' ');
expect(i07Limits.includes('弱化保留') && i07Limits.includes('groups:[]') && i07Limits.includes('cut 只观察') && !i07Limits.includes('结算后焦点框不保留'), 'I07 现行边界已替换旧焦点/分组/cut 说明');

const fileRead = json(run(['read', 'D01', '--file', 'examples/authoring/data.js', '--limit', '2', '--json']));
expect(fileRead.ok === true && fileRead.source.path === 'examples/authoring/data.js' && fileRead.content.includes('Authoring example data'), 'read --file 可读明确本地文件');

const recipe = json(run(['show', 'recipe:focusWorkbench', '--context', 'recipe', '--json']));
const recipeEntry = recipe.entries && recipe.entries[0];
expect(recipe.ok === true && recipeEntry && recipeEntry.type === '配方', 'show recipe 成功');
expect(recipeEntry.contexts[0].usage.includes('focusWorkbench') && recipeEntry.contexts[0].notes.some((text) => text.includes('骨架')), '配方包标出骨架并给出实际入口');
const recipeRead = json(run(['read', 'recipe:focusWorkbench', 'api', '--limit', '12', '--json']));
expect(recipeRead.ok === true && recipeRead.content.includes('作者入口与配方'), 'read 配方文档锚点准确');

const progress = json(run(['show', 'public:progress', '--json']));
const progressEntry = progress.entries && progress.entries[0];
expect(progress.ok === true && progressEntry.type === '公共接法', 'show 连续进度主题成功');
expect(progressEntry.contexts[0].usage.includes("type:'progress'") && progressEntry.contexts[0].notes.some((text) => text.includes('逐层追加')), '连续进度包包含 type:progress 与示例结构边界');
const progressRead = json(run(['read', 'public:progress', 'api', '--json']));
expect(progressRead.ok === true && progressRead.content.startsWith('### 5.2 连续进度') && progressRead.content.includes('已经应用') &&
  progressRead.content.indexOf('### 5.3') < 0 && progressRead.remaining === 0,
  'read 连续进度直达具体小节且范围完整', JSON.stringify({ start: progressRead.source.startLine, end: progressRead.source.endLine }));
const progressRefs = progressEntry.contexts[0].refs.map((ref) => ref.key);
const controlRead = json(run(['read', 'public:progress', 'control', '--json']));
expect(controlRead.ok === true && controlRead.content.startsWith('### 5.4 受控画面的视觉接管') && controlRead.remaining === 0,
  'read 受控视觉接管直达生命周期小节', JSON.stringify({ start: controlRead.source.startLine, end: controlRead.source.endLine }));
expect(progressRefs.includes('example') && progressRefs.includes('fragment') && progressRefs.includes('source') && progressRefs.includes('control'), '连续进度包区分完整示例、局部片段、实现源码与接管说明', JSON.stringify(progressRefs));
const attention = json(run(['show', 'public:attention', '--json']));
const attentionRead = json(run(['read', 'public:attention', 'api', '--json']));
expect(attention.ok === true && attention.entries[0].contexts[0].refs.some((ref) => ref.anchor === 'author-attention') &&
  attention.entries[0].contexts[0].refs.some((ref) => ref.anchor === 'author-scene-control') &&
  attentionRead.ok === true && attentionRead.content.startsWith('### 5.3 焦点、效果组') && attentionRead.content.includes('groups:[]'),
  'attention 直达分组与观察小节');
const attentionContext = json(run(['show', 'public:attention', '--context', 'scene', '--json']));
expect(attentionContext.ok === false && attentionContext.missing[0].error === 'unknown_context' &&
  attentionContext.missing[0].availableContexts.some((item) => item.key === 'public') &&
  /show public:attention --context public/.test(attentionContext.missing[0].hint),
  '不支持的上下文返回实际可用上下文和可执行提示');
const exampleSearch = json(run(['search', '连续画面', '--json']));
expect(exampleSearch.ok === true && exampleSearch.results.some((item) => item.id === 'example:continuous-scene'), '最小连续画面示例可被检索');
const splitSearch = json(run(['search', '设备端口连接', '--json']));
expect(splitSearch.ok === true && splitSearch.total === 0 && splitSearch.results.length === 0 &&
  splitSearch.suggestionsTotal > 0 && splitSearch.suggestions.length === splitSearch.suggestionsTotal,
  '零结果精确结果为空，suggestions 非空且与 results 分开', JSON.stringify({ total: splitSearch.total, suggestionsTotal: splitSearch.suggestionsTotal }));
const firstSuggestion = splitSearch.suggestions[0];
expect(firstSuggestion && firstSuggestion.id && Array.isArray(firstSuggestion.matchedBy) && firstSuggestion.matchedBy.length > 0 &&
  Array.isArray(firstSuggestion.suggestionFor) && firstSuggestion.suggestionFor.length > 0,
  '零结果候选保留 matchedBy 来源与实际拆词', JSON.stringify(firstSuggestion && { id: firstSuggestion.id, matchedBy: firstSuggestion.matchedBy, suggestionFor: firstSuggestion.suggestionFor }));
const suggestionEvidence = json(run(['search', firstSuggestion.suggestionFor[0], '--json']));
expect(suggestionEvidence.results.some((item) => item.id === firstSuggestion.id), '候选可由其拆词真实检索复现', JSON.stringify({ query: firstSuggestion.suggestionFor[0], ids: suggestionEvidence.results.map((item) => item.id) }));
const noBasisSearch = json(run(['search', '完全不存在的词组zzz', '--json']));
expect(noBasisSearch.ok === true && noBasisSearch.total === 0 && noBasisSearch.results.length === 0 &&
  noBasisSearch.suggestionsTotal === 0 && noBasisSearch.suggestions.length === 0 &&
  /没有匹配条目/.test(noBasisSearch.message),
  '无依据查询如实空结果，不导向固定热门', JSON.stringify({ total: noBasisSearch.total, suggestionsTotal: noBasisSearch.suggestionsTotal, message: noBasisSearch.message }));
const exactSearch = json(run(['search', '矩阵', '--json']));
expect(exactSearch.results.length > 0 && exactSearch.suggestionsTotal === 0 && exactSearch.suggestions.length === 0,
  '有精确结果时 suggestions 为空，精确结果与零结果候选不混排', JSON.stringify({ total: exactSearch.total, suggestionsTotal: exactSearch.suggestionsTotal }));
const splitSearchText = run(['search', '设备端口连接']);
expect(splitSearchText.status === 0 && /精确命中 0/.test(splitSearchText.stdout) && /非精确结果/.test(splitSearchText.stdout) && /相关候选/.test(splitSearchText.stdout),
  'text 输出分段说明精确结果与相关候选', splitSearchText.stdout.slice(0, 300));
const genericPathSearch = json(run(['search', '路径', '--json']));
const genericPortSearch = json(run(['search', '端口', '--json']));
const genericCustomSearch = json(run(['search', '自定义画面', '--json']));
expect(genericPathSearch.results.some((item) => item.id === 'public:propagation') &&
  genericPortSearch.results.some((item) => item.id === 'D10') &&
  genericCustomSearch.results.some((item) => item.id === 'public:continuous-adapter'),
  '通用用途词可命中真实条目（路径/端口/自定义画面）', JSON.stringify({ path: genericPathSearch.results.map((item) => item.id), port: genericPortSearch.results.map((item) => item.id), custom: genericCustomSearch.results.map((item) => item.id) }));
const exampleShow = json(run(['show', 'example:continuous-scene', '--json']));
expect(exampleShow.ok === true && exampleShow.entries[0].contexts[0].refs.some((ref) => ref.key === 'example') &&
  exampleShow.entries[0].contexts[0].refs.some((ref) => ref.key === 'fragment'), '完整示例条目区分 example 与 fragment');
const inspectTool = json(run(['show', 'tool:inspect-note', '--json']));
const inspectContext = inspectTool.entries[0].contexts[0];
expect(inspectTool.ok === true && inspectContext.wholeLibrary == null && inspectContext.dependencies.length === 0 &&
  /playwright-core/.test(inspectContext.dependencySummary) && /本机 Edge/.test(inspectContext.dependencySummary),
  '验证工具不冒充浏览器组件模块依赖，明确 playwright-core 与本机浏览器', JSON.stringify(inspectContext));
const c13Read = json(run(['read', 'C13', 'api', '--limit', '200', '--json']));
expect(c13Read.ok === true && c13Read.content.includes('## 14. C13 NoteUI.Expression') && !c13Read.content.includes('## 15.'), 'read C13 api 从锚点所属章节标题开始并止于下一章节', JSON.stringify({ start: c13Read.source.startLine, end: c13Read.source.endLine, total: c13Read.source.totalLines }));
const toolShow = json(run(['show', 'tool:demo-preview', '--json']));
const toolContext = toolShow.entries[0].contexts[0];
expect(toolShow.ok === true && Array.isArray(toolContext.dependencies) && toolContext.dependencies.length === 0 && toolContext.wholeLibrary == null && /Node 内置模块/.test(toolContext.dependencySummary), '构建工具不带浏览器整库/demo-runtime 依赖', JSON.stringify({ deps: toolContext.dependencies, wholeLibrary: toolContext.wholeLibrary }));
const r10Scene = json(run(['show', 'R10', '--context', 'scene', '--json'])).entries[0].contexts[0];
expect(r10Scene.usage.includes('未在查询资料中确认') && !r10Scene.usage.includes('"layout"|"update"|"cut"|"reveal"'), '未知 scene 支持范围不冒充全模式骨架', r10Scene.usage);

const missing = json(run(['show', 'D01', 'NOPE', '--json']));
expect(missing.ok === false && missing.entries.length === 1 && missing.missing.some((item) => item.token === 'NOPE'), '多条 show 逐项标记缺失，不填默认成功');
const unknown = run(['show', 'NOPE', '--json']);
const unknownJson = json(unknown);
expect(unknown.status === 1 && unknownJson.ok === false && unknownJson.missing[0].error === 'not_found', '未知 ID 非零退出且 JSON 明确失败');
const badOption = run(['search', 'x', '--bogus', '--json']);
const badOptionJson = json(badOption);
expect(badOption.status === 2 && badOptionJson.error.code === 'usage', '非法参数非零退出且错误可解析');
const badResource = json(run(['read', 'D01', 'no-such-resource', '--json']));
expect(badResource.ok === false && badResource.error && badResource.error.code === 'not_found', '未知资源键明确失败');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'html-note-query-'));
const temp = path.join(tempRoot, '中文 工作目录');
fs.mkdirSync(temp, { recursive: true });
try {
  const outsideInfo = json(run(['info', '--json'], temp));
  expect(path.resolve(outsideInfo.library.root) === root, '工程外/中文工作目录仍定位脚本所属库', outsideInfo.library.root);
  const outsideSearch = json(run(['search', 'D01', '--json'], temp));
  expect(outsideSearch.ok === true && outsideSearch.results[0].id === 'D01', '工程外中文目录可执行查询');
  const explicitRoot = json(run(['search', 'D01', '--root', root, '--json'], temp));
  expect(explicitRoot.ok === true && explicitRoot.results[0].id === 'D01', '--root 明确指定库位置');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('SUMMARY ' + passes + '/' + (passes + failures.length) + ' passed');
if (failures.length) {
  console.error('\n' + failures.join('\n'));
  process.exit(1);
}
