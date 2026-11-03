/* 从同一份宿主 HTML 生成测试用自包含页面：把 <link>/<script> 引用的本地文件逐字节内联。
   输入：src/page-a.html、src/page-b.html（按模块加载的独立宿主，引用临时 runtime）
   输出：tests/.cache/consumer-pages/page-a.html、page-b.html（git 忽略、可随时重生成）
   固定证据 01-矩阵转置.html / 02-序列变化.html 不由本脚本重写。
   用法：node scripts/build-pages.mjs */
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENERATED_ROOT, LIBRARY_ROOT, RUNTIME_MODULES, ROOT } from './paths.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const JOBS = [
  { input: 'src/page-a.html', output: 'page-a.html' },
  { input: 'src/page-b.html', output: 'page-b.html' }
];

function inlineOne(htmlPath) {
  const baseDir = dirname(htmlPath);
  let html = readFileSync(htmlPath, 'utf8');
  const inlined = [];

  html = html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*>/g, (match, href) => {
    if (/^https?:/i.test(href)) return match;
    const file = isAbsolute(href) ? href : resolve(baseDir, href);
    const css = readFileSync(file, 'utf8');
    inlined.push({ kind: 'css', file: relative(LIBRARY_ROOT, file).replace(/\\/g, '/'), bytes: Buffer.byteLength(css) });
    return '<style>\n' + css + '\n</style>';
  });

  html = html.replace(/<script\s+src="([^"]+)"\s*><\/script>/g, (match, src) => {
    if (/^https?:/i.test(src)) return match;
    const file = isAbsolute(src) ? src : resolve(baseDir, src);
    const js = readFileSync(file, 'utf8');
    if (/<\/script/i.test(js)) throw new Error('脚本内含 </script，需要转义：' + file);
    inlined.push({ kind: 'js', file: relative(LIBRARY_ROOT, file).replace(/\\/g, '/'), bytes: Buffer.byteLength(js) });
    return '<script>\n' + js + '\n</script>';
  });

  if (/<link\s+[^>]*href="(?!data:|https:)/i.test(html)) {
    throw new Error('仍有未内联的 <link> 引用：' + htmlPath);
  }
  if (/<script\s+src=/i.test(html)) {
    throw new Error('仍有未内联的 <script src>：' + htmlPath);
  }
  return { html, inlined };
}

/* 输入页面引用 tests/.cache/consumer-runtime；不先 prepare 就给出可操作错误。 */
if (!existsSync(RUNTIME_MODULES)) {
  throw new Error('缺少临时 runtime：' + RUNTIME_MODULES + '；请先运行 node scripts/verify-runtime.mjs。');
}
for (const job of JOBS) {
  const inputPath = resolve(root, job.input);
  if (!readFileSync(inputPath, 'utf8').includes('consumer-runtime')) {
    throw new Error('输入页面不是临时 runtime 接法：' + inputPath);
  }
}
rmSync(GENERATED_ROOT, { recursive: true, force: true });
mkdirSync(GENERATED_ROOT, { recursive: true });
for (const job of JOBS) {
  const inputPath = resolve(root, job.input);
  const { html, inlined } = inlineOne(inputPath);
  const outputPath = resolve(GENERATED_ROOT, job.output);
  writeFileSync(outputPath, html, 'utf8');
  const size = statSync(outputPath).size;
  console.log(outputPath + '  ' + (size / 1024).toFixed(1) + ' KB  (' + inlined.length + ' 个内联文件)');
  for (const item of inlined) console.log('  ' + item.kind + '  ' + item.file + '  ' + (item.bytes / 1024).toFixed(1) + ' KB');
}
console.log('generated 2 pages → ' + GENERATED_ROOT);
