/* 动效取样：正常速度下对象是否连续移动、时长与停稳是否可追踪。
   node scripts/motion-b.mjs */
import { ROOT, generatedPageUrl, edgeExecutable, loadChromium, outputPath } from './paths.mjs';
const chromium = await loadChromium();
const EDGE = edgeExecutable();
const browser = await chromium.launch({ headless: true, executablePath: EDGE });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.goto(generatedPageUrl('b'));
await page.waitForTimeout(400);

const stage = page.locator('.nblk-demo-stage');
const sample = () => page.evaluate(() => {
  const items = Array.from(document.querySelectorAll('.nviz-sequence-edit__item'));
  const d = items.find((el) => el.getAttribute('data-id') === 'd');
  const e = items.find((el) => el.getAttribute('data-id') === 'e');
  return {
    t: Math.round(performance.now()),
    d: d ? { x: Math.round(d.getBoundingClientRect().left), tx: getComputedStyle(d).transform } : null,
    e: e ? { x: Math.round(e.getBoundingClientRect().left), tx: getComputedStyle(e).transform } : null,
    ghost: document.querySelectorAll('.nviz-sequence-edit__item--ghost').length,
    anim: document.querySelector('.nviz-sequence-edit').getAttribute('data-anim')
  };
});

console.log('== 删除 c（第 1 步）==');
const start = Date.now();
await page.getByRole('button', { name: '下一步' }).click();
const frames = [];
for (const delay of [0, 60, 120, 180, 240, 320, 400, 480, 560, 720]) {
  const wait = delay - (Date.now() - start);
  if (wait > 0) await page.waitForTimeout(wait);
  frames.push({ delay, ...(await sample()) });
}
for (const f of frames) {
  console.log(String(f.delay).padStart(4) + 'ms  d.x=' + (f.d ? f.d.x : '-') + '  e.x=' + (f.e ? f.e.x : '-') +
    '  transform(d)=' + (f.d ? f.d.tx.slice(0, 28) : '-') + '  ghost=' + f.ghost + '  anim=' + f.anim);
}
await page.screenshot({ path: outputPath('b-motion-after.png') });

/* 逐帧截图（删除步） */
await page.getByRole('button', { name: '重来' }).click();
await page.waitForTimeout(700);
await page.getByRole('button', { name: '下一步' }).click();
for (const [wait, name] of [[50, 'b-frame-050'], [110, 'b-frame-160'], [120, 'b-frame-280'], [180, 'b-frame-460']]) {
  await page.waitForTimeout(wait);
  await stage.screenshot({ path: outputPath(name + '.png') });
}

console.log('\n== 重看（第 2 步）==');
await page.waitForTimeout(500);
await page.getByRole('button', { name: '下一步' }).click();
await page.waitForTimeout(700);
const t2 = Date.now();
await page.getByRole('button', { name: '重看' }).click();
for (const delay of [0, 100, 250, 400, 600, 800, 1000]) {
  const wait = delay - (Date.now() - t2);
  if (wait > 0) await page.waitForTimeout(wait);
  const s = await sample();
  const status = await page.evaluate(() => document.querySelector('.nviz-sequence-edit [role="status"]').textContent);
  console.log(String(delay).padStart(4) + 'ms  d.x=' + (s.d ? s.d.x : '-') + '  e.x=' + (s.e ? s.e.x : '-') + '  ghost=' + s.ghost + '  anim=' + s.anim + '  status=' + status);
}
await browser.close();
