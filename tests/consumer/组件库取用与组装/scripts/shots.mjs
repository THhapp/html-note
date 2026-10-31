/* 重拍代表截图（交付用的 evidence/*.png）。
   node scripts/shots.mjs */
import { ROOT, edgeExecutable, loadChromium } from './paths.mjs';
const chromium = await loadChromium();
const EDGE = edgeExecutable();
import { pathToFileURL } from 'node:url';

const A = pathToFileURL(ROOT + '/src/page-a.html').href;
const B = pathToFileURL(ROOT + '/src/page-b.html').href;

const browser = await chromium.launch({ headless: true, executablePath: EDGE });

async function shot(url, viewport, name, opts = {}) {
  const page = await browser.newPage({ viewport });
  await page.goto(url);
  await page.waitForTimeout(400);
  if (opts.before) await opts.before(page);
  await page.screenshot({ path: ROOT + '/evidence/' + name + '.png', fullPage: !!opts.full });
  await page.close();
}

await shot(A, { width: 1280, height: 800 }, 'a-1280-full', { full: true });
await shot(A, { width: 1024, height: 768 }, 'a-1024');
await shot(A, { width: 560, height: 900 }, 'a-560');
await shot(A, { width: 560, height: 900 }, 'a-560-second', {
  before: async (page) => {
    await page.getByRole('radio', { name: '示例二 · 3×2' }).click().catch(async () => {
      await page.getByRole('button', { name: '示例二 · 3×2' }).click();
    });
    await page.waitForTimeout(250);
  }
});
await shot(B, { width: 1280, height: 800 }, 'b-1280-full', { full: true });
await shot(B, { width: 1024, height: 768 }, 'b-1024');
await shot(B, { width: 560, height: 900 }, 'b-560-long', {
  before: async (page) => {
    await page.getByRole('radio', { name: '长标签' }).click().catch(async () => {
      await page.getByRole('button', { name: '长标签' }).click();
    });
    await page.waitForTimeout(300);
  }
});
await shot(B, { width: 560, height: 900 }, 'b-560-step2', {
  before: async (page) => {
    await page.getByRole('button', { name: '下一步' }).click();
    await page.waitForTimeout(650);
    await page.getByRole('button', { name: '下一步' }).click();
    await page.waitForTimeout(700);
  }
});

/* 125% 缩放等效 */
const zoomA = await browser.newPage({ viewport: { width: 1024, height: 640 }, deviceScaleFactor: 1.25 });
await zoomA.goto(A);
await zoomA.waitForTimeout(400);
await zoomA.screenshot({ path: ROOT + '/evidence/a-zoom125.png' });
await zoomA.close();

const zoomB = await browser.newPage({ viewport: { width: 1024, height: 640 }, deviceScaleFactor: 1.25 });
await zoomB.goto(B);
await zoomB.waitForTimeout(400);
await zoomB.screenshot({ path: ROOT + '/evidence/b-zoom125.png' });
await zoomB.close();

/* 第 1、2 步停稳画面 */
const steps = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await steps.goto(B);
await steps.waitForTimeout(400);
await steps.getByRole('button', { name: '下一步' }).click();
await steps.waitForTimeout(750);
await steps.screenshot({ path: ROOT + '/evidence/b-step1.png' });
await steps.getByRole('button', { name: '下一步' }).click();
await steps.waitForTimeout(750);
await steps.screenshot({ path: ROOT + '/evidence/b-step2.png' });
await steps.close();

console.log('screenshots refreshed');
await browser.close();
