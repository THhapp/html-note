/* 从同一份宿主 HTML 生成自包含页面：把 <link>/<script> 引用的本地文件逐字节内联。
   用法：node scripts/build-pages.mjs
   输入：src/page-a.html、src/page-b.html（按模块加载的独立宿主）
   输出：01-矩阵转置.html、02-序列变化.html（可单独下载、无需服务） */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const JOBS = [
  { input: 'src/page-a.html', output: '01-矩阵转置.html' },
  { input: 'src/page-b.html', output: '02-序列变化.html' }
];

function inlineOne(htmlPath) {
  const baseDir = dirname(htmlPath);
  let html = readFileSync(htmlPath, 'utf8');
  const inlined = [];

  html = html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*>/g, (match, href) => {
    if (/^https?:/i.test(href)) return match;
    const file = isAbsolute(href) ? href : resolve(baseDir, href);
    const css = readFileSync(file, 'utf8');
    inlined.push({ kind: 'css', file: relative(root, file).replace(/\\/g, '/'), bytes: Buffer.byteLength(css) });
    return '<style>\n' + css + '\n</style>';
  });

  html = html.replace(/<script\s+src="([^"]+)"\s*><\/script>/g, (match, src) => {
    if (/^https?:/i.test(src)) return match;
    const file = isAbsolute(src) ? src : resolve(baseDir, src);
    const js = readFileSync(file, 'utf8');
    if (/<\/script/i.test(js)) throw new Error('脚本内含 </script，需要转义：' + file);
    inlined.push({ kind: 'js', file: relative(root, file).replace(/\\/g, '/'), bytes: Buffer.byteLength(js) });
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

for (const job of JOBS) {
  const inputPath = resolve(root, job.input);
  const { html, inlined } = inlineOne(inputPath);
  const outputPath = resolve(root, job.output);
  writeFileSync(outputPath, html, 'utf8');
  const size = statSync(outputPath).size;
  console.log(`${job.output}  ${(size / 1024).toFixed(1)} KB  (${inlined.length} 个内联文件)`);
  for (const item of inlined) console.log(`  ${item.kind}  ${item.file}  ${(item.bytes / 1024).toFixed(1)} KB`);
}
