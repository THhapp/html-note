import { chromium } from '../tools/node_modules/playwright-core/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleDemos, moduleScripts, moduleStyles } from '../lib/src-sources.mjs';
import { cacheDir } from '../lib/test-output.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const shotDir = cacheDir(path.resolve(here, '../..'), 'checks', 'navigation');
const root = path.resolve(here, '..', '..');
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1180, height: 1000 } });
await page.emulateMedia({ reducedMotion: 'reduce' });
const errors = [];
let failures = 0;
function check(name, condition, detail) {
  if (condition) console.log('PASS  ' + name);
  else { failures += 1; console.log('FAIL  ' + name + (detail ? ' :: ' + detail : '')); }
}
page.on('pageerror', error => errors.push(error.stack));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.setContent(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
html,body{margin:0;background:#f4f6f9}
body{padding:24px;font-family:"Microsoft YaHei UI","Segoe UI",sans-serif;color:#202938}
#host{max-width:980px;margin:0 auto;background:#fff;border:1px solid #dce2ea;border-radius:14px;padding:24px}
</style></head><body><div id="host"></div></body></html>`);
// 源码与 demo 加载清单从 src/manifests 推导，模块拆分后自动包含新增文件。
const pageModules = ['core', 'ui-navigation'];
for (const file of [...moduleScripts(root, pageModules), ...moduleDemos(root, ['ui-navigation'])]) {
  await page.addScriptTag({ path: path.join(root, file) });
}
for (const file of moduleStyles(root, pageModules)) {
  await page.addStyleTag({ path: path.join(root, file) });
}

const ids = ['N01','N02','N03','N04','N05','N06','N07'];
for (const id of ids) {
  const mountInfo = await page.evaluate((id) => {
    if (window.__demoInstance && typeof window.__demoInstance.destroy === 'function') window.__demoInstance.destroy();
    const host = document.getElementById('host');
    host.replaceChildren();
    const instance = window.NoteGalleryDemos[id](host);
    window.__demoInstance = instance;
    return {
      returned: !!instance && typeof instance.destroy === 'function',
      root: host.querySelectorAll('.nui-navigation-demo').length,
      tabs: host.querySelectorAll('.nui-tabs').length,
      menus: host.querySelectorAll('.nui-menu').length,
      breadcrumbs: host.querySelectorAll('.nui-breadcrumb').length,
      paginations: host.querySelectorAll('.nui-pagination').length,
      steps: host.querySelectorAll('.nui-steps').length,
      trees: host.querySelectorAll('.nui-tree').length,
      anchors: host.querySelectorAll('.nui-anchor-nav').length
    };
  }, id);
  check(id + ' demo returns destroy and mounts a demo root', mountInfo.returned && mountInfo.root === 1, JSON.stringify(mountInfo));
  await page.screenshot({ path: path.join(shotDir, `navigation-shot-${id}.png`), fullPage: true });

  if (id === 'N01') {
    check('N01 demo mounts Tabs', mountInfo.tabs === 1);
    await page.locator('.nui-tabs__tab').nth(1).click();
    check('N01 demo tab click switches panel', await page.locator('.nui-tabs__tab[aria-selected="true"]').textContent().then(t => t.includes('结构说明')));
    await page.locator('.nui-navigation-demo__button').first().click();
    check('N01 demo keepMounted update leaves one active panel', await page.evaluate(() => document.querySelectorAll('.nui-tabs [role="tabpanel"]').length === 1));
  } else if (id === 'N02') {
    check('N02 demo mounts AnchorNav', mountInfo.anchors === 1);
    await page.locator('.nui-anchor-nav__link').nth(2).click();
    await page.waitForTimeout(80);
    check('N02 demo link click scrolls local target', await page.evaluate(() => document.querySelector('.nui-navigation-demo__scroll').scrollTop > 0));
    check('N02 demo current link follows click', await page.evaluate(() => !!document.querySelector('.nui-anchor-nav__link[aria-current="location"]')));
  } else if (id === 'N03') {
    check('N03 demo mounts two Breadcrumb instances and an overflow menu', mountInfo.breadcrumbs === 2 && mountInfo.menus === 1);
    const trigger = page.locator('.nui-breadcrumb .nui-menu__trigger');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(20);
    check('N03 demo overflow menu opens by keyboard', await page.locator('.hnv-floating__panel[role="menu"]').count() === 1);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(20);
    check('N03 demo overflow Escape returns focus', await page.evaluate(() => document.activeElement.classList.contains('nui-menu__trigger')));
  } else if (id === 'N04') {
    check('N04 demo mounts two Menu instances', mountInfo.menus === 2);
    const trigger = page.locator('.nui-navigation-demo .nui-menu__trigger').first();
    await trigger.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(20);
    check('N04 demo primary menu opens with keyboard', await page.locator('.hnv-floating__panel[role="menu"]').count() === 1);
    check('N04 demo first menu item focused', await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('role') === 'menuitem'));
    await page.screenshot({ path: path.join(shotDir, 'navigation-shot-N04-menu-open.png'), fullPage: true });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(20);
    check('N04 demo submenu opens with ArrowRight', await page.locator('.hnv-floating__panel[role="menu"]').count() === 2);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(20);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(20);
    check('N04 demo menu closes back to trigger', await page.evaluate(() => !document.querySelector('.hnv-floating') && document.activeElement.classList.contains('nui-menu__trigger')));
    check('N04 demo has a focusable context area', await page.locator('.nui-navigation-demo__context[tabindex="0"]').count() === 1);
    await page.evaluate(() => document.querySelector('.nui-navigation-demo .nui-menu__trigger').focus());
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(20);
    check('N04 demo leaves a nested menu open for cleanup test', await page.locator('.hnv-floating__panel[role="menu"]').count() === 2);
  } else if (id === 'N05') {
    check('N05 demo mounts two Pagination instances', mountInfo.paginations === 2);
    await page.locator('.nui-pagination').first().locator('[data-nui-page-action="next"]').click();
    await page.waitForTimeout(20);
    check('N05 demo next page updates summary', await page.locator('.nui-pagination__summary').first().textContent().then(t => t.includes('第 2 / 25 页')));
    await page.locator('.nui-pagination').first().locator('.nui-pagination__select').selectOption('20');
    await page.waitForTimeout(20);
    check('N05 demo page size select is native and usable', await page.locator('.nui-pagination__select').first().inputValue() === '20');
    check('N05 demo empty state is visible', await page.locator('.nui-pagination--empty').count() === 1);
  } else if (id === 'N06') {
    check('N06 demo mounts Steps', mountInfo.steps === 1);
    await page.locator('.nui-steps__title--button').nth(2).click();
    await page.waitForTimeout(20);
    check('N06 demo host is signalled and updates current', await page.locator('.nui-steps__item[aria-current="step"]').getAttribute('data-step-index') === '2');
    await page.locator('.nui-navigation-demo__button').filter({ hasText: '方向：横向' }).click();
    check('N06 demo orientation control works', await page.evaluate(() => document.querySelector('.nui-steps').classList.contains('nui-steps--vertical')));
  } else if (id === 'N07') {
    check('N07 demo mounts TreeView', mountInfo.trees === 1);
    await page.evaluate(() => {
      const selected = document.querySelector('.nui-tree__item[aria-selected="true"]');
      selected.focus();
    });
    await page.keyboard.press('ArrowDown');
    check('N07 demo tree is keyboard operable', await page.evaluate(() => document.activeElement.getAttribute('role') === 'treeitem'));
    await page.locator('.nui-navigation-demo__button').filter({ hasText: '静默选择「API 索引」' }).click();
    check('N07 demo silent programmatic selection is reflected', await page.locator('.nui-navigation-demo__readout').textContent().then(t => t.includes('api')));
  }

  const cleanup = await page.evaluate(() => {
    window.__demoInstance.destroy();
    const host = document.getElementById('host');
    return {
      rootGone: host.querySelectorAll('.nui-navigation-demo').length === 0,
      hostEmpty: host.children.length === 0,
      floating: document.querySelectorAll('.hnv-floating').length,
      points: document.querySelectorAll('.nui-menu__point-anchor').length
    };
  });
  check(id + ' demo destroy removes its root and floating UI', cleanup.rootGone && cleanup.hostEmpty && cleanup.floating === 0 && cleanup.points === 0, JSON.stringify(cleanup));
}
check('No page or console errors across demos', errors.length === 0, errors.join('\n'));
console.log('\nSUMMARY: ' + ids.length + ' demos, ' + failures + ' failed');
await browser.close();
if (failures || errors.length) process.exit(1);
