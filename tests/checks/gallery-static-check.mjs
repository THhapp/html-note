// 预览/示例静态契约检查：无外部依赖、加载顺序、关键入口与 demo 脚本。
// 用法：node tests/checks/gallery-static-check.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const files = {
  galleryHtml: path.join(root, 'gallery', 'index.html'),
  galleryJs: path.join(root, 'gallery', 'gallery.js'),
  galleryCss: path.join(root, 'gallery', 'gallery.css'),
  runHtml: path.join(root, 'examples', 'run.html'),
  composedHtml: path.join(root, 'examples', 'composed.html'),
  exampleCss: path.join(root, 'examples', 'example.css'),
  docs: path.join(root, 'docs', '预览与示例.md')
};
const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`);
}
function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}
function scripts(html) {
  return [...html.matchAll(/<script\b([^>]*)>/gi)].map((m) => {
    const src = /\bsrc\s*=\s*"([^"]+)"/i.exec(m[1]);
    return src ? src[1] : '(inline)';
  });
}
function inlineScripts(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
}
function stylesheets(html) {
  return [...html.matchAll(/<link\b[^>]*\brel\s*=\s*"stylesheet"[^>]*>/gi)].map((m) => {
    const href = /\bhref\s*=\s*"([^"]+)"/i.exec(m[0]);
    return href ? href[1] : '';
  });
}

const galleryHtml = read(files.galleryHtml);
const galleryJs = read(files.galleryJs);
const galleryCss = read(files.galleryCss);
const runHtml = read(files.runHtml);
const composedHtml = read(files.composedHtml);
const exampleCss = read(files.exampleCss);
const docs = read(files.docs);

for (const [name, file] of Object.entries(files)) {
  check(`file exists: ${path.relative(root, file)}`, fs.existsSync(file));
}
for (const [name, html] of [['gallery', galleryHtml], ['run', runHtml], ['composed', composedHtml]]) {
  check(`${name} lang=zh-CN`, /<html[^>]*\blang="zh-CN"/i.test(html));
  check(`${name} viewport`, /<meta[^>]*name="viewport"/i.test(html));
  check(`${name} charset`, /<meta[^>]*charset="utf-8"/i.test(html));
  check(`${name} no module scripts`, !/\btype\s*=\s*"module"/i.test(html));
  check(`${name} no external http(s) resource`, !/(?:src|href)\s*=\s*"https?:\/\//i.test(html));
}

const expectGalleryScripts = [
  '../dist/note-library.js',
  '../dist/registry.js',
  './gallery.js',
  'demos/legacy.js',
  'demos/core.js',
  'demos/ui-layout.js',
  'demos/ui-actions.js',
  'demos/ui-content.js',
  'demos/ui-navigation.js',
  'demos/ui-forms-basic.js',
  'demos/ui-forms-advanced.js',
  'demos/ui-overlay.js',
  'demos/ui-feedback.js',
  'demos/ui-extended.js',
  'demos/viz-objects.js',
  'demos/viz-mechanisms.js',
  'demos/viz-chart.js',
  'demos/blocks-stage.js',
  'demos/blocks-explain.js',
  'demos/demo-runtime.js'
];
const galleryScripts = scripts(galleryHtml);
check('gallery script order', JSON.stringify(galleryScripts) === JSON.stringify(expectGalleryScripts), galleryScripts.join(' | '));
check('gallery CSS order', JSON.stringify(stylesheets(galleryHtml)) === JSON.stringify(['../dist/note-library.css', './gallery.css']), stylesheets(galleryHtml).join(' | '));
check('gallery demo order core after legacy', galleryScripts.indexOf('demos/core.js') === galleryScripts.indexOf('demos/legacy.js') + 1, `legacy=${galleryScripts.indexOf('demos/legacy.js')} core=${galleryScripts.indexOf('demos/core.js')}`);
check('gallery uses NoteCore.copy', /NoteCore\.copy/.test(galleryJs));
check('gallery exposes NoteGallery API', /global\.NoteGallery\s*=\s*\{[\s\S]*?select:[\s\S]*?current:[\s\S]*?list:[\s\S]*?ready:/.test(galleryJs));
check('gallery has #gallery-detail', /id="gallery-detail"/.test(galleryHtml));
check('gallery creates #gallery-demo', /id\s*=\s*'gallery-demo'/.test(galleryJs));
check('gallery cleanup selectors', /hnv-floating/.test(galleryJs) && /nui-toast-region/.test(galleryJs) && /nx-focus/.test(galleryJs));
check('gallery hashchange support', /hashchange/.test(galleryJs) && /location\.hash/.test(galleryJs));
check('gallery no hardcoded 99 list', !/NoteGallery\.list\s*=\s*\[/.test(galleryJs));

const runScripts = scripts(runHtml);
const expectedRunDemos = expectGalleryScripts.slice(3).map((s) => '../gallery/' + s);
const expectedRunScripts = ['../dist/note-library.js', '../dist/registry.js', ...expectedRunDemos, '(inline)'];
check('run script order', JSON.stringify(runScripts) === JSON.stringify(expectedRunScripts), runScripts.join(' | '));
check('run does not load gallery shell', !runScripts.includes('./gallery.js') && !stylesheets(runHtml).includes('./gallery.css') && !stylesheets(runHtml).includes('../gallery/gallery.css'));
check('run stylesheet order', JSON.stringify(stylesheets(runHtml)) === JSON.stringify(['../dist/note-library.css', './example.css']), stylesheets(runHtml).join(' | '));
check('run has example-demo host', /id="example-demo"/.test(runHtml) && /data-example-demo/.test(runHtml));
check('run reads ?id', /URLSearchParams/.test(runHtml) && /get\('id'\)/.test(runHtml));
check('run exposes NoteExampleRun', /global\.NoteExampleRun\s*=/.test(runHtml));
check('run uses NoteCore.copy', /NoteCore\.copy/.test(runHtml));
check('run includes core demo script', runScripts.includes('../gallery/demos/core.js'));

const composedScripts = scripts(composedHtml);
check('composed loads only library + registry (+inline)', JSON.stringify(composedScripts) === JSON.stringify(['../dist/note-library.js', '../dist/registry.js', '(inline)']), composedScripts.join(' | '));
check('composed does not load gallery shell or demos', !composedScripts.some((s) => /gallery\.js|gallery\.css|gallery\/demos/.test(s)) && !stylesheets(composedHtml).some((s) => /gallery\.css/.test(s)));
check('composed composes NoteUI', /NoteUI\.(Container|Panel|Stack|Inline|Badge|Notice|DataObject|Table|Tabs)/.test(composedHtml) || /\bUI\.(Container|Panel|Stack|Inline|Badge|Notice|DataObject|Table|Tabs)/.test(composedHtml));
check('composed composes NoteExpr', /NoteExpr\.(Focus|Range|Link)/.test(composedHtml) || /\bExpr\.(Focus|Range|Link)/.test(composedHtml));
check('composed composes NoteViz', /NoteViz\.(Sequence|Chart|CompareView)/.test(composedHtml) || /\bViz\.(Sequence|Chart|CompareView)/.test(composedHtml));
check('composed composes NoteBlocks', /NoteBlocks\.(DemoStage|StepPlayer)/.test(composedHtml) || /\bBlocks\.(DemoStage|StepPlayer)/.test(composedHtml));
check('composed uses a second block (RuleCompare)', /\bBlocks\.RuleCompare|NoteBlocks\.RuleCompare/.test(composedHtml));
check('composed reserves Range label lane', /has-invariant-range/.test(composedHtml) && /has-invariant-range/.test(exampleCss));
check('composed default-static step controller', /重看本步/.test(composedHtml) && /下一步/.test(composedHtml) && !/setInterval/.test(composedHtml));
check('composed uses stable IDs and annotations', /schemaObject\.update/.test(composedHtml) && /refs\.focus\.show/.test(composedHtml) && /refs\.range\.show/.test(composedHtml) && /refs\.link\.show/.test(composedHtml));
check('composed cleanup handlers', /pagehide/.test(composedHtml) && /function cleanup\(/.test(composedHtml) && /hnv-floating/.test(composedHtml));

for (const [name, source] of [['gallery.js', galleryJs], ['run inline', inlineScripts(runHtml).join('\n')], ['composed inline', inlineScripts(composedHtml).join('\n')]]) {
  check(`${name} no fetch`, !/\bfetch\s*\(/.test(source));
  check(`${name} no eval/new Function`, !/\beval\s*\(/.test(source) && !/\bnew\s+Function\s*\(/.test(source));
  check(`${name} no dynamic import`, !/\bimport\s*\(/.test(source));
  check(`${name} no innerHTML assignment`, !/\.innerHTML\s*=/.test(source));
  check(`${name} no script injection`, !/createElement\(\s*['"]script['"]\s*\)/.test(source));
  check(`${name} no XHR/WebSocket`, !/\bXMLHttpRequest\b/.test(source) && !/\bWebSocket\b/.test(source));
}

for (const [name, source] of [['gallery.css', galleryCss], ['example.css', exampleCss]]) {
  check(`${name} no @import`, !/@import\b/.test(source));
  check(`${name} no external url()`, !/url\(\s*['"]?https?:/i.test(source));
  check(`${name} uses --hnv tokens`, /--hnv-/.test(source));
}
check('docs describes gallery/run/composed', /gallery\/index\.html/.test(docs) && /examples\/run\.html/.test(docs) && /examples\/composed\.html/.test(docs));

const missingDemos = expectedRunDemos.filter((rel) => {
  const absolute = path.resolve(root, 'examples', rel.replace(/^\.\.\//, '../'));
  return !fs.existsSync(absolute);
});
console.log('missing demo files (can be expected during partial builds):', missingDemos.length ? missingDemos.join(', ') : 'none');

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length} checks, ${failed.length} failed`);
if (failed.length) process.exitCode = 1;