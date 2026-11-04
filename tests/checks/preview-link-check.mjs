#!/usr/bin/env node
/*
 * 离线预览链接分类检查（真实 build-demo-preview 进程，不启动浏览器）：
 * - 正文导航 <a href>/<area href>（http(s)、相对页、#、实体编码）保留，不误报外部资源；
 * - 页面加载资源（img/srcset、link icon、video poster/src、iframe、SVG image 等，含实体编码）
 *   必须失败并指出标签/属性/原值/解码值/解析路径；
 * - 本地 stylesheet/script 仍按既有行为内联；输出不可写出。
 *
 * Usage: node tests/checks/preview-link-check.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const cli = path.join(root, 'scripts', 'build-demo-preview.mjs');
const work = path.join(root, 'tests', '.cache', 'preview-link-check');
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

let passes = 0;
const failures = [];
function expect(condition, message, detail) {
  if (condition) { passes += 1; console.log('PASS  ' + message); }
  else { failures.push(message); console.log('FAIL  ' + message + (detail == null ? '' : ' :: ' + String(detail).slice(0, 900))); }
}
function build(template, output) {
  const result = spawnSync(process.execPath, [cli, '--template', template, '--output', output], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '', output };
}
function write(name, text) {
  const file = path.join(work, name);
  fs.writeFileSync(file, text, 'utf8');
  return file;
}

try {
  /* 1) 正文导航 + 本地内联资源：通过；实体编码导航保持不变。 */
  const passTemplate = write('navigation-pass.html', `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>导航</title>
<link rel="stylesheet" href="./local.css">
</head><body>
<a href="https://example.com/page">外部页面</a>
<a href="relative/page.html">相对页</a>
<a href="#anchor">页内锚点</a>
<a href="https&#58;//example.com/entity">实体编码</a>
<area href="https&#x3a;//example.com/x">
<img srcset="data:image/png;base64,AAAA 1x">
<script src="./local.js"></script>
</body></html>`);
  fs.writeFileSync(path.join(work, 'local.css'), 'body{--fixture-color:#123456}', 'utf8');
  fs.writeFileSync(path.join(work, 'local.js'), 'window.__fixtureLoaded = 1;', 'utf8');
  const passOutput = path.join(work, 'navigation-pass.out.html');
  const pass = build(passTemplate, passOutput);
  const passHtml = fs.existsSync(passOutput) ? fs.readFileSync(passOutput, 'utf8') : '';
  expect(pass.status === 0 && fs.existsSync(passOutput), '正文导航 + 本地资源：构建成功', pass.stderr || pass.stdout);
  expect(/body\s*\{\s*--fixture-color:#123456/.test(passHtml) && /window\.__fixtureLoaded\s*=\s*1/.test(passHtml),
    '本地 stylesheet/script 仍按既有行为内联', passHtml.slice(0, 200));
  expect(passHtml.includes('href="https://example.com/page"') &&
    passHtml.includes('href="relative/page.html"') &&
    passHtml.includes('href="#anchor"') &&
    passHtml.includes('href="https&#58;//example.com/entity"'),
    '正文 <a href> 外部/相对/#/实体编码均保留且未误报', passHtml.slice(0, 400));
  expect(!/页面加载资源未内联/.test(pass.stderr), '正文导航不触发加载资源错误', pass.stderr);

  /* 2) 实际加载资源（含实体编码/大小写/无引号/srcset/SVG）：失败并指出标签/属性/值/路径。 */
  const failTemplate = write('loading-fail.html', `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>资源</title></head><body>
<img src="https://example.com/x.png">
<img src="https&#58;//example.com/entity.png">
<IMG SRC="https://example.com/upper.png">
<img src=https&#58;//example.com/unquoted.png>
<img srcset="https://example.com/a.png 1x, https://example.com/b.png 2x">
<img src="./missing-local.png">
<link rel="icon" href="https://example.com/favicon.ico">
<link rel="preload" as="font" href="https&#58;//example.com/font.woff2">
<video poster="https://example.com/poster.jpg" src="https://example.com/video.mp4"></video>
<source srcset="https://example.com/source.png 1x">
<iframe src="https://example.com/frame"></iframe>
<svg><image href="https://example.com/svg.png"></image><use href="https://example.com/use.svg#id"></use></svg>
</body></html>`);
  const failOutput = path.join(work, 'loading-fail.out.html');
  const fail = build(failTemplate, failOutput);
  const failText = fail.stdout + fail.stderr;
  expect(fail.status === 5 && !fs.existsSync(failOutput), '外部加载资源：exit 5 且不写出半成品', failText.slice(0, 700));
  const expectations = [
    ['img 外部 src', /标签 <img>，属性 src，原值 "https:\/\/example\.com\/x\.png"/],
    ['img 实体编码解码', /标签 <img>，属性 src，原值 "https&#58;\/\/example\.com\/entity\.png"，解码值 "https:\/\/example\.com\/entity\.png"/],
    ['大写标签/属性', /标签 <img>，属性 src，原值 "https:\/\/example\.com\/upper\.png"/],
    ['无引号实体属性', /标签 <img>，属性 src，原值 "https&#58;\/\/example\.com\/unquoted\.png"/],
    ['srcset 候选', /标签 <img>，属性 srcset，.*候选值 "https:\/\/example\.com\/a\.png"/],
    ['link icon', /标签 <link>，属性 href，原值 "https:\/\/example\.com\/favicon\.ico"/],
    ['link preload 实体', /标签 <link>，属性 href，原值 "https&#58;\/\/example\.com\/font\.woff2"/],
    ['video poster', /标签 <video>，属性 poster，原值 "https:\/\/example\.com\/poster\.jpg"/],
    ['video src', /标签 <video>，属性 src，原值 "https:\/\/example\.com\/video\.mp4"/],
    ['source srcset', /标签 <source>，属性 srcset/],
    ['iframe src', /标签 <iframe>，属性 src，原值 "https:\/\/example\.com\/frame"/],
    ['SVG image href', /标签 <image>，属性 href，原值 "https:\/\/example\.com\/svg\.png"/],
    ['SVG use href', /标签 <use>，属性 href，原值 "https:\/\/example\.com\/use\.svg#id"/],
    ['本地未内联资源解析路径', /标签 <img>，属性 src，原值 "\.\/missing-local\.png".*解析为本地文件 .*missing-local\.png/]
  ];
  for (const [label, pattern] of expectations) {
    expect(pattern.test(failText), '加载资源失败指出：' + label, failText.slice(0, 900));
  }

  /* 3) 外部 stylesheet/script 在 inline 阶段失败，也指出标签/属性/值/解析。 */
  const externalInlineTemplate = write('inline-fail.html', `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<link rel="stylesheet" href="https&#58;//example.com/remote.css">
</head><body><script src="https://example.com/remote.js"></script></body></html>`);
  const inlineOutput = path.join(work, 'inline-fail.out.html');
  const inlineFail = build(externalInlineTemplate, inlineOutput);
  const inlineText = inlineFail.stdout + inlineFail.stderr;
  expect(inlineFail.status === 4 && !fs.existsSync(inlineOutput), '外部 stylesheet/script：exit 4 且不写出', inlineText.slice(0, 600));
  expect(/外部样式表不能内联：标签 <link rel="stylesheet">，属性 href，原值 "https&#58;\/\/example\.com\/remote\.css"，解码值 "https:\/\/example\.com\/remote\.css"/
    .test(inlineText), '外部样式表指出标签/属性/实体解码值', inlineText.slice(0, 600));
  expect(/外部脚本不能内联：标签 <script>，属性 src，原值 "https:\/\/example\.com\/remote\.js"/.test(inlineText),
    '外部脚本指出标签/属性/值', inlineText.slice(0, 600));

  /* 4) 产物中残留的加载资源（绕过模板内联的假想产物）由最终校验失败；data:/blob:/# 允许。 */
  const dataTemplate = write('data-pass.html', `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body>
<img src="data:image/png;base64,AAAA"><source srcset="data:image/png;base64,BBBB 2x">
<svg><use href="#icon"></use><image href="data:image/png;base64,CCCC"></image></svg>
<a href="https://example.com/ok">导航</a>
</body></html>`);
  const dataOutput = path.join(work, 'data-pass.out.html');
  const dataResult = build(dataTemplate, dataOutput);
  expect(dataResult.status === 0 && fs.existsSync(dataOutput), 'data:/# 加载资源与外部导航可共存', dataResult.stderr || dataResult.stdout);
  expect(fs.existsSync(dataOutput) && /<body[\s>]/.test(fs.readFileSync(dataOutput, 'utf8')), 'data:/# 产物仍为 HTML 且可写出');
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}

console.log('SUMMARY ' + passes + '/' + (passes + failures.length) + ' passed');
if (failures.length) process.exitCode = 1;
