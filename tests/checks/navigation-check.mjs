import { chromium } from '../tools/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleScripts, moduleStyles } from '../lib/src-sources.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const failures = [];
let passCount = 0;

function check(name, condition, detail) {
  if (condition) {
    passCount += 1;
    console.log('PASS  ' + name);
  } else {
    failures.push(name + (detail == null ? '' : ' :: ' + detail));
    console.log('FAIL  ' + name + (detail == null ? '' : ' :: ' + detail));
  }
}

function equal(name, actual, expected) {
  check(name, Object.is(actual, expected), 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

const browser = await chromium.launch({ executablePath: edge, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const runtimeErrors = [];
page.on('pageerror', (error) => runtimeErrors.push('pageerror: ' + error.stack));
page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push('console: ' + message.text()); });
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body><div id="host"></div></body></html>');
// 源码加载清单从 src/manifests 推导，模块拆分后自动包含新增文件。
const pageModules = ['core', 'ui-navigation'];
for (const file of moduleScripts(root, pageModules)) {
  await page.addScriptTag({ path: path.join(root, file) });
}
for (const file of moduleStyles(root, pageModules)) {
  await page.addStyleTag({ path: path.join(root, file) });
}

async function reset() {
  await page.evaluate(() => {
    document.querySelectorAll('.hnv-floating').forEach((node) => node.remove());
    document.querySelectorAll('.nui-menu__point-anchor').forEach((node) => node.remove());
    const host = document.getElementById('host');
    host.replaceChildren();
    window.__tests = {};
  });
}

/* -----------------------------------------------------------------------
 * N01 Tabs
 * --------------------------------------------------------------------- */
await reset();
await page.evaluate(() => {
  const host = document.getElementById('host');
  const calls = [];
  const rich = document.createElement('div');
  rich.className = 'rich';
  const input = document.createElement('input');
  input.className = 'state-input';
  input.value = '保留中的内容';
  rich.appendChild(input);
  const tabs = NoteUI.Tabs.mount(host, {
    items: [
      { id: 'a', label: '概览', content: rich },
      { id: 'b', label: '细节', content: '纯文本细节' },
      { id: 'x', label: '禁用', content: 'disabled panel', disabled: true },
      { id: 'c', label: '设置', content: 'settings' }
    ],
    value: 'a',
    onChange: (value, event) => calls.push({ value: value, type: event && event.type })
  });
  window.__tests.tabs = tabs;
  window.__tests.tabsCalls = calls;
  window.__tests.tabsInput = input;
  window.__tests.tabsRich = rich;
});
equal('Tabs mounts a tablist', await page.locator('[role="tablist"]').count(), 1);
equal('Tabs renders every tab including disabled', await page.locator('.nui-tabs [role="tab"]').count(), 4);
equal('Tabs keepMounted=true keeps all panels', await page.locator('.nui-tabs [role="tabpanel"]').count(), 4);
equal('Tabs initially selects value a', await page.locator('[role="tab"][aria-selected="true"] .nui-tabs__label').textContent(), '概览');
check('Tabs links tab and panel ids', await page.evaluate(() => {
  const tab = document.querySelector('[role="tab"][aria-selected="true"]');
  const panel = document.getElementById(tab.getAttribute('aria-controls'));
  return !!panel && panel.getAttribute('aria-labelledby') === tab.id && panel.getAttribute('aria-controls') === null;
}));
check('Tabs panel string is text, not markup', await page.evaluate(() => {
  const panels = [...document.querySelectorAll('[role="tabpanel"]')];
  return panels.some((panel) => panel.textContent.includes('纯文本细节'));
}));
equal('Tabs inactive panels are hidden', await page.evaluate(() => {
  const panels = [...document.querySelectorAll('[role="tabpanel"]')];
  return panels.filter((panel) => panel.hidden).length;
}), 3);
equal('Tabs disabled tab is natively disabled', await page.locator('[role="tab"]:disabled').count(), 1);
check('Tabs disabled tab has aria-disabled', await page.evaluate(() => document.querySelector('[role="tab"]:disabled').getAttribute('aria-disabled') === 'true'));

await page.locator('[role="tab"][aria-controls]:has-text("细节")').click();
equal('Tabs click changes getValue', await page.evaluate(() => window.__tests.tabs.getValue()), 'b');
equal('Tabs click fires onChange', await page.evaluate(() => window.__tests.tabsCalls.length), 1);
equal('Tabs click reveals its panel', await page.evaluate(() => {
  const tab = [...document.querySelectorAll('[role="tab"]')].find((node) => node.textContent.includes('细节'));
  return document.getElementById(tab.getAttribute('aria-controls')).hidden;
}), false);
await page.locator('[role="tab"]:has-text("概览")').click();
equal('Tabs DOM panel input state survives keepMounted switch', await page.evaluate(() => {
  const input = window.__tests.tabsInput;
  return input.isConnected && input.value === '保留中的内容' && input === window.__tests.tabsInput;
}), true);
equal('Tabs onChange count after second user switch', await page.evaluate(() => window.__tests.tabsCalls.length), 2);

await page.locator('[role="tab"][aria-selected="true"]').focus();
await page.keyboard.press('ArrowRight');
equal('Tabs ArrowRight moves to next enabled tab', await page.evaluate(() => window.__tests.tabs.getValue()), 'b');
equal('Tabs ArrowRight focuses the new tab', await page.evaluate(() => document.activeElement.getAttribute('aria-selected')), 'true');
await page.keyboard.press('End');
equal('Tabs End selects last enabled tab', await page.evaluate(() => window.__tests.tabs.getValue()), 'c');
await page.keyboard.press('Home');
equal('Tabs Home selects first tab', await page.evaluate(() => window.__tests.tabs.getValue()), 'a');
await page.keyboard.press('ArrowLeft');
equal('Tabs ArrowLeft wraps to the last enabled tab', await page.evaluate(() => window.__tests.tabs.getValue()), 'c');
check('Tabs roving tabindex has one tab in tab order', await page.evaluate(() => {
  return [...document.querySelectorAll('[role="tab"]')].filter((tab) => tab.tabIndex === 0).length === 1;
}));

const callsBeforeProgrammatic = await page.evaluate(() => window.__tests.tabsCalls.length);
await page.evaluate(() => { window.__tests.tabs.activate('b'); });
equal('Tabs activate changes value', await page.evaluate(() => window.__tests.tabs.getValue()), 'b');
await page.evaluate(() => { window.__tests.tabs.update({ value: 'a' }); });
equal('Tabs programmatic update applies value', await page.evaluate(() => window.__tests.tabs.getValue()), 'a');
equal('Tabs activate/update do not fire onChange', await page.evaluate(() => window.__tests.tabsCalls.length), callsBeforeProgrammatic);
check('Tabs activate refuses disabled tab', await page.evaluate(() => window.__tests.tabs.activate('x') === false));
equal('Tabs disabled tab stays unselected', await page.evaluate(() => window.__tests.tabs.getValue()), 'a');

await page.evaluate(() => {
  const host = document.getElementById('host');
  const calls = [];
  const tabs = NoteUI.Tabs.mount(host, {
    items: [
      { id: 'a', label: 'A', content: 'A body' },
      { id: 'b', label: 'B', content: 'B body' }
    ],
    value: 'a',
    keepMounted: false,
    orientation: 'vertical',
    onChange: (value) => calls.push(value)
  });
  window.__tests.tabsUnmounted = tabs;
  window.__tests.tabsUnmountedCalls = calls;
});
equal('Tabs total panels across two instances (4 kept + 1 active)', await page.locator('.nui-tabs__panel').count(), 5);
// There are two Tabs roots now: first keepMounted=true with 4 panels, second with 1. Use the latest root.
check('Tabs second instance keepMounted=false has only active panel', await page.evaluate(() => {
  const root = window.__tests.tabsUnmounted.el;
  return root.querySelectorAll('[role="tabpanel"]').length === 1;
}));
check('Tabs vertical sets aria-orientation', await page.evaluate(() => window.__tests.tabsUnmounted.el.querySelector('[role="tablist"]').getAttribute('aria-orientation') === 'vertical'));
await page.locator('.nui-tabs').nth(1).locator('[role="tab"]:has-text("A")').focus();
await page.keyboard.press('ArrowDown');
equal('Tabs vertical ArrowDown activates next tab', await page.evaluate(() => window.__tests.tabsUnmounted.getValue()), 'b');
await page.keyboard.press('ArrowRight');
equal('Tabs vertical ignores horizontal arrows', await page.evaluate(() => window.__tests.tabsUnmounted.getValue()), 'b');
check('Tabs vertical unmounts inactive panel', await page.evaluate(() => window.__tests.tabsUnmounted.el.querySelectorAll('[role="tabpanel"]').length === 1));
await page.evaluate(() => {
  window.__tests.tabs.destroy();
  window.__tests.tabsUnmounted.destroy();
});
equal('Tabs destroy removes both roots', await page.locator('.nui-tabs').count(), 0);

/* -----------------------------------------------------------------------
 * N02 AnchorNav
 * --------------------------------------------------------------------- */
await reset();
await page.evaluate(() => {
  const host = document.getElementById('host');
  const layout = document.createElement('div');
  layout.className = 'anchor-test-layout';
  layout.style.cssText = 'display:flex;gap:20px;align-items:flex-start;';
  const navHost = document.createElement('div');
  navHost.style.cssText = 'flex:0 0 220px;';
  const scroll = document.createElement('div');
  scroll.id = 'anchor-scroll';
  scroll.style.cssText = 'flex:1;height:300px;overflow:auto;border:1px solid #ddd;';
  layout.appendChild(navHost);
  layout.appendChild(scroll);
  host.appendChild(layout);
  for (let index = 1; index <= 5; index += 1) {
    const section = document.createElement('section');
    section.id = 'anchor-section-' + index;
    section.style.cssText = 'height:260px;padding:10px;box-sizing:border-box;';
    const heading = document.createElement('h3');
    heading.textContent = '第 ' + index + ' 章';
    section.appendChild(heading);
    for (let paragraph = 0; paragraph < 3; paragraph += 1) {
      const p = document.createElement('p');
      p.textContent = '章节 ' + index + ' 的说明文字 ' + paragraph;
      section.appendChild(p);
    }
    scroll.appendChild(section);
  }
  const nav = NoteUI.AnchorNav.mount(navHost, {
    items: [
      { id: 'anchor-section-1', label: '第一章', level: 1 },
      { id: 'anchor-section-2', label: '第二章', level: 2 },
      { id: 'anchor-section-3', label: '第三章与一个更长一些的标题', level: 2 },
      { id: 'anchor-section-4', label: '第四章', level: 1 },
      { id: 'anchor-section-5', label: '第五章', level: 1 }
    ],
    target: scroll
  });
  window.__tests.anchor = nav;
  window.__tests.anchorScroll = scroll;
});
equal('AnchorNav renders as nav with accessible label', await page.locator('nav.nui-anchor-nav').getAttribute('aria-label'), '章节导航');
equal('AnchorNav renders all section links', await page.locator('.nui-anchor-nav__link').count(), 5);
equal('AnchorNav initial aria-current is set', await page.locator('.nui-anchor-nav__link[aria-current="location"]').count(), 1);
await page.locator('.nui-anchor-nav__link').nth(2).click();
await page.waitForTimeout(80);
check('AnchorNav click scrolls its target container', await page.evaluate(() => window.__tests.anchorScroll.scrollTop > 0));
equal('AnchorNav clicked link becomes current', await page.locator('.nui-anchor-nav__link').nth(2).getAttribute('aria-current'), 'location');
check('AnchorNav target container did not change page scroll unexpectedly', await page.evaluate(() => window.scrollY === 0 || window.__tests.anchorScroll.contains(document.activeElement)));
await page.evaluate(() => { window.__tests.anchorScroll.scrollTop = 0; window.__tests.anchorScroll.dispatchEvent(new Event('scroll')); });
await page.waitForTimeout(50);
equal('AnchorNav scroll position updates current section', await page.locator('.nui-anchor-nav__link').nth(0).getAttribute('aria-current'), 'location');
equal('AnchorNav setActive changes current', await page.evaluate(() => window.__tests.anchor.setActive('anchor-section-4')), true);
equal('AnchorNav setActive marks fourth link', await page.locator('.nui-anchor-nav__link').nth(3).getAttribute('aria-current'), 'location');
await page.evaluate(() => {
  window.__tests.anchor.update({ active: 'anchor-section-2' });
});
equal('AnchorNav update active is silent and visible', await page.locator('.nui-anchor-nav__link').nth(1).getAttribute('aria-current'), 'location');
equal('AnchorNav getValue reflects active', await page.evaluate(() => window.__tests.anchor.getValue()), 'anchor-section-2');
await page.evaluate(() => window.__tests.anchor.destroy());
equal('AnchorNav destroy removes root', await page.locator('.nui-anchor-nav').count(), 0);

/* -----------------------------------------------------------------------
 * N03 Breadcrumb
 * --------------------------------------------------------------------- */
await reset();
await page.evaluate(() => {
  const host = document.getElementById('host');
  window.__tests.crumbCalls = [];
  const breadcrumb = NoteUI.Breadcrumb.mount(host, {
    items: [
      { label: '首页', onClick: (event) => { event.preventDefault(); window.__tests.crumbCalls.push('首页'); } },
      { label: '知识库', onClick: (event) => { event.preventDefault(); window.__tests.crumbCalls.push('知识库'); } },
      { label: '网络', onClick: (event) => { event.preventDefault(); window.__tests.crumbCalls.push('网络'); } },
      { label: '协议', onClick: (event) => { event.preventDefault(); window.__tests.crumbCalls.push('协议'); } },
      { label: '传输层', onClick: (event) => { event.preventDefault(); window.__tests.crumbCalls.push('传输层'); } },
      { label: '当前页：一个较长但仍可完整阅读的面包屑标题' }
    ],
    maxItems: 4
  });
  window.__tests.breadcrumb = breadcrumb;
});
equal('Breadcrumb renders nav with default label', await page.locator('nav.nui-breadcrumb').getAttribute('aria-label'), '面包屑');
equal('Breadcrumb uses an ordered list', await page.locator('.nui-breadcrumb ol').count(), 1);
equal('Breadcrumb current item uses aria-current=page', await page.locator('.nui-breadcrumb [aria-current="page"]').count(), 1);
equal('Breadcrumb maxItems limits visible rows', await page.locator('.nui-breadcrumb__list > li').count(), 4);
equal('Breadcrumb collapses a middle range into one menu trigger', await page.locator('.nui-breadcrumb .nui-menu__trigger').count(), 1);
const crumbTrigger = page.locator('.nui-breadcrumb .nui-menu__trigger');
await crumbTrigger.focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(30);
equal('Breadcrumb overflow opens a menu', await page.locator('.nui-menu__panel').count(), 1);
check('Breadcrumb overflow menu contains omitted levels', await page.evaluate(() => {
  const texts = [...document.querySelectorAll('.nui-menu__panel .nui-menu__item')].map((node) => node.textContent);
  return texts.join('|').includes('知识库') && texts.join('|').includes('网络');
}));
await page.keyboard.press('Escape');
await page.waitForTimeout(30);
equal('Breadcrumb overflow Escape closes menu', await page.locator('.nui-menu__panel').count(), 0);
check('Breadcrumb overflow Escape returns focus to trigger', await page.evaluate(() => document.activeElement === document.querySelector('.nui-breadcrumb .nui-menu__trigger')));
await page.keyboard.press('Enter');
await page.waitForTimeout(20);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await page.waitForTimeout(20);
equal('Breadcrumb overflow menu selection reports original crumb', await page.evaluate(() => window.__tests.crumbCalls[window.__tests.crumbCalls.length - 1]), '网络');
equal('Breadcrumb overflow selection closes menu', await page.locator('.nui-menu__panel').count(), 0);
check('Breadcrumb overflow selection returns focus to trigger', await page.evaluate(() => document.activeElement === document.querySelector('.nui-breadcrumb .nui-menu__trigger')));
await page.evaluate(() => window.__tests.breadcrumb.update({ maxItems: 0 }));
equal('Breadcrumb maxItems=0 shows the full path', await page.locator('.nui-breadcrumb__list > li').count(), 6);
equal('Breadcrumb full path has no overflow menu', await page.locator('.nui-breadcrumb .nui-menu__trigger').count(), 0);
await page.evaluate(() => window.__tests.breadcrumb.destroy());
equal('Breadcrumb destroy removes nav and any floating UI', await page.evaluate(() => !document.querySelector('.nui-breadcrumb') && !document.querySelector('.hnv-floating')), true);

/* -----------------------------------------------------------------------
 * N04 Menu
 * --------------------------------------------------------------------- */
await reset();
await page.evaluate(() => {
  const host = document.getElementById('host');
  window.__tests.menuCalls = [];
  const area = document.createElement('div');
  area.tabIndex = 0;
  area.className = 'context-area';
  area.textContent = '右键菜单测试区域';
  area.style.cssText = 'width:260px;height:120px;border:1px dashed #aaa;';
  host.appendChild(area);
  const menu = NoteUI.Menu.mount(host, {
    trigger: { type: 'button', label: '操作菜单' },
    label: '操作菜单',
    items: [
      { id: 'open', label: '打开', shortcut: 'Ctrl+O' },
      { id: 'share', label: '分享', children: [
        { id: 'copy-link', label: '复制链接', shortcut: 'Ctrl+L' },
        { id: 'email', label: '邮件发送' },
        { id: 'missing', label: '待接入', disabled: true }
      ] },
      { type: 'separator' },
      { id: 'rename', label: '重命名', disabled: true },
      { id: 'delete', label: '删除' }
    ],
    onSelect: (item, event) => window.__tests.menuCalls.push({ id: item.id, type: event && event.type })
  });
  window.__tests.menu = menu;
  const contextMenu = NoteUI.Menu.mount(host, {
    trigger: { type: 'contextmenu', label: '上下文菜单' },
    anchor: area,
    label: '上下文菜单',
    items: [
      { id: 'ctx-open', label: '打开' },
      { id: 'ctx-copy', label: '复制路径' }
    ],
    onSelect: (item) => window.__tests.menuCalls.push({ id: item.id, type: 'context' })
  });
  window.__tests.contextMenu = contextMenu;
  window.__tests.contextArea = area;
});
const menuTrigger = page.locator('.nui-menu__trigger').first();
await menuTrigger.click();
await page.waitForTimeout(20);
equal('Menu trigger opens a menu layer', await page.locator('.hnv-floating__panel[role="menu"]').count(), 1);
check('Menu trigger sets aria-expanded=true', await page.evaluate(() => document.querySelector('.nui-menu__trigger').getAttribute('aria-expanded') === 'true'));
equal('Menu focuses first enabled item', await page.evaluate(() => document.activeElement.textContent.includes('打开')), true);
check('Menu exposes icon/shortcut/separator/disabled markers', await page.evaluate(() => {
  return !!document.querySelector('.nui-menu__shortcut') &&
    document.querySelectorAll('.nui-menu__separator').length >= 1 &&
    document.querySelectorAll('.nui-menu__item:disabled').length === 1;
}));
const firstMenuId = await page.evaluate(() => document.activeElement.textContent);
await page.keyboard.press('ArrowDown');
check('Menu ArrowDown moves focus', await page.evaluate((oldText) => document.activeElement.textContent !== oldText, firstMenuId));
await page.keyboard.press('Home');
check('Menu Home returns first item', await page.evaluate(() => document.activeElement.textContent.includes('打开')));
await page.keyboard.press('End');
check('Menu End focuses last enabled item', await page.evaluate(() => document.activeElement.textContent.includes('删除')));
await page.keyboard.press('Home');
await page.keyboard.press('ArrowDown');
check('Menu focus lands on submenu parent', await page.evaluate(() => document.activeElement.textContent.includes('分享')));
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(20);
equal('Menu ArrowRight opens a submenu layer', await page.locator('.hnv-floating__panel[role="menu"]').count(), 2);
check('Menu submenu parent exposes aria-haspopup/expanded', await page.evaluate(() => {
  const parent = [...document.querySelectorAll('.nui-menu__item')].find((node) => node.textContent.includes('分享'));
  return parent.getAttribute('aria-haspopup') === 'menu' && parent.getAttribute('aria-expanded') === 'true';
}));
equal('Menu submenu focuses first child', await page.evaluate(() => document.activeElement.textContent.includes('复制链接')), true);
await page.keyboard.press('Escape');
await page.waitForTimeout(20);
equal('Menu Escape closes only the submenu', await page.locator('.hnv-floating__panel[role="menu"]').count(), 1);
check('Menu Escape on submenu returns focus to its parent', await page.evaluate(() => document.activeElement.textContent.includes('分享')));
check('Menu closed submenu parent aria-expanded=false', await page.evaluate(() => {
  const parent = [...document.querySelectorAll('.nui-menu__item')].find((node) => node.textContent.includes('分享'));
  return parent.getAttribute('aria-expanded') === 'false';
}));
await page.keyboard.press('Escape');
await page.waitForTimeout(20);
equal('Menu second Escape closes the root menu', await page.locator('.hnv-floating__panel[role="menu"]').count(), 0);
check('Menu root Escape returns focus to trigger', await page.evaluate(() => document.activeElement.classList.contains('nui-menu__trigger')));
check('Menu root Escape sets trigger aria-expanded=false', await page.evaluate(() => document.querySelector('.nui-menu__trigger').getAttribute('aria-expanded') === 'false'));

// Clicking the trigger while open toggles the menu closed (including nested layers).
await menuTrigger.click();
await page.waitForTimeout(20);
equal('Menu trigger click opens menu before toggle test', await page.locator('.hnv-floating__panel[role="menu"]').count(), 1);
await menuTrigger.click();
await page.waitForTimeout(30);
equal('Menu trigger second click closes instead of reopening', await page.locator('.hnv-floating__panel[role="menu"]').count(), 0);
check('Menu trigger toggle sets aria-expanded=false', await page.evaluate(() => document.querySelector('.nui-menu__trigger').getAttribute('aria-expanded') === 'false'));

// Leaf selection: open, navigate down, activate via keyboard.
await menuTrigger.click();
await page.waitForTimeout(10);
await page.keyboard.press('Enter');
await page.waitForTimeout(20);
equal('Menu Enter selects the focused leaf and closes the root', await page.locator('.hnv-floating__panel[role="menu"]').count(), 0);
equal('Menu onSelect receives the original item id', await page.evaluate(() => window.__tests.menuCalls[0].id), 'open');
check('Menu onSelect receives a user event', await page.evaluate(() => window.__tests.menuCalls[0].type === 'click'));
check('Menu selection returns focus to trigger', await page.evaluate(() => document.activeElement.classList.contains('nui-menu__trigger')));

// Nested selection closes both layers.
await menuTrigger.click();
await page.waitForTimeout(10);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(10);
await page.keyboard.press('Enter');
await page.waitForTimeout(20);
equal('Menu nested selection closes every layer', await page.locator('.hnv-floating__panel[role="menu"]').count(), 0);
equal('Menu nested selection reports child item', await page.evaluate(() => window.__tests.menuCalls[window.__tests.menuCalls.length - 1].id), 'copy-link');

// Space activates a focused leaf like Enter.
await menuTrigger.focus();
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(20);
check('Menu trigger ArrowDown opens menu with first item focused', await page.evaluate(() => document.activeElement.textContent.includes('打开')));
await page.keyboard.press('Space');
await page.waitForTimeout(20);
equal('Menu Space selects a leaf', await page.evaluate(() => window.__tests.menuCalls[window.__tests.menuCalls.length - 1].id), 'open');
equal('Menu Space selection closes the root', await page.locator('.hnv-floating__panel[role="menu"]').count(), 0);

// Tab closes the menu and moves focus into the page.
await menuTrigger.focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(20);
await page.keyboard.press('Tab');
await page.waitForTimeout(30);
equal('Menu Tab closes the menu', await page.locator('.hnv-floating__panel[role="menu"]').count(), 0);
check('Menu Tab moves focus outside the removed menu', await page.evaluate(() => {
  return document.activeElement && !document.activeElement.closest('.hnv-floating');
}));

// Outside click with submenu: only the current layer closes.
await menuTrigger.click();
await page.waitForTimeout(10);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(10);
await page.locator('body').click({ position: { x: 5, y: 5 } });
await page.waitForTimeout(30);
equal('Menu outside click closes only the submenu', await page.locator('.hnv-floating__panel[role="menu"]').count(), 1);
await page.locator('body').click({ position: { x: 5, y: 5 } });
await page.waitForTimeout(30);
equal('Menu second outside click closes the root', await page.locator('.hnv-floating__panel[role="menu"]').count(), 0);

// Context menu at pointer and focus return.
await page.evaluate(() => window.__tests.contextArea.focus());
await page.locator('.context-area').click({ button: 'right', position: { x: 80, y: 40 } });
await page.waitForTimeout(30);
equal('Context menu opens from contextmenu trigger', await page.locator('.hnv-floating__panel[role="menu"]').count(), 1);
check('Context menu is positioned at the pointer region', await page.evaluate(() => {
  const root = document.querySelector('.hnv-floating');
  const rect = root.getBoundingClientRect();
  return rect.left > 0 && rect.top > 0;
}));
await page.keyboard.press('Escape');
await page.waitForTimeout(30);
equal('Context menu Escape closes it', await page.locator('.hnv-floating__panel[role="menu"]').count(), 0);
check('Context menu Escape returns focus to anchor', await page.evaluate(() => document.activeElement === window.__tests.contextArea));
equal('Context menu point anchor is cleaned up', await page.locator('.nui-menu__point-anchor').count(), 0);
await page.evaluate(() => window.__tests.contextArea.focus());
await page.keyboard.press('Shift+F10');
await page.waitForTimeout(30);
equal('Context menu supports keyboard Shift+F10 invocation', await page.locator('.hnv-floating__panel[role="menu"]').count(), 1);
await page.keyboard.press('Escape');
await page.waitForTimeout(20);
equal('Keyboard context menu Escape closes it', await page.locator('.hnv-floating__panel[role="menu"]').count(), 0);

// Controlled menu opens through public API.
await page.evaluate(() => {
  const external = document.createElement('button');
  external.id = 'controlled-anchor';
  external.type = 'button';
  external.textContent = '受控锚点';
  document.getElementById('host').appendChild(external);
  const controlled = NoteUI.Menu.mount(document.getElementById('host'), {
    items: [{ id: 'one', label: '受控项' }],
    trigger: null,
    label: '受控菜单'
  });
  window.__tests.controlledMenu = controlled;
  window.__tests.controlledAnchor = external;
});
await page.evaluate(() => window.__tests.controlledMenu.open(window.__tests.controlledAnchor));
await page.waitForTimeout(20);
equal('Controlled Menu open(anchor) works', await page.locator('.hnv-floating__panel[role="menu"]').count(), 1);
await page.evaluate(() => window.__tests.controlledMenu.close());
await page.waitForTimeout(20);
equal('Controlled Menu close() works', await page.locator('.hnv-floating__panel[role="menu"]').count(), 0);

await page.evaluate(() => {
  window.__tests.priorCalls = window.__tests.menuCalls.length;
  window.__tests.menu.update({ onSelect: (item) => window.__tests.menuCalls.push({ id: item.id, type: 'updated' }) });
  window.__tests.menu.update({ items: [{ id: 'new', label: '新项' }] });
});
equal('Menu programmatic update does not fire onSelect', await page.evaluate(() => window.__tests.menuCalls.length), await page.evaluate(() => window.__tests.priorCalls));

// Destroy while a point-anchored context menu is open must clear floating DOM.
await page.evaluate(() => window.__tests.contextArea.focus());
await page.locator('.context-area').click({ button: 'right', position: { x: 30, y: 20 } });
await page.waitForTimeout(20);
equal('Context menu can reopen after prior close', await page.locator('.hnv-floating__panel[role="menu"]').count(), 1);
await page.evaluate(() => window.__tests.contextMenu.destroy());
equal('Menu destroy while open removes its floating layer and point anchor', await page.evaluate(() => document.querySelectorAll('.hnv-floating, .nui-menu__point-anchor').length), 0);
await page.evaluate(() => {
  window.__tests.menu.destroy();
  window.__tests.controlledMenu.destroy();
});
equal('Menu destroy leaves no floating layers or point anchors', await page.evaluate(() => document.querySelectorAll('.hnv-floating, .nui-menu__point-anchor').length), 0);

/* -----------------------------------------------------------------------
 * N05 Pagination
 * --------------------------------------------------------------------- */
await reset();
await page.evaluate(() => {
  const host = document.getElementById('host');
  window.__tests.pageCalls = [];
  const pagination = NoteUI.Pagination.mount(host, {
    total: 137,
    page: 1,
    pageSize: 10,
    pageSizes: [10, 20, 50],
    onChange: (page, pageSize, event) => window.__tests.pageCalls.push({ page, pageSize, type: event && event.type })
  });
  window.__tests.pagination = pagination;
});
check('Pagination summary shows page 1 of 14 and total', await page.locator('.nui-pagination__summary').textContent().then((text) => text.includes('第 1 / 14 页') && text.includes('137')));
equal('Pagination previous is disabled on first page', await page.locator('.nui-pagination__control[data-nui-page-action="previous"]').isDisabled(), true);
equal('Pagination has aria-current=page', await page.locator('.nui-pagination__page[aria-current="page"]').textContent(), '1');
check('Pagination renders an accessible ellipsis', await page.locator('.nui-pagination__ellipsis[aria-label="省略的页码"]').count() >= 1);
await page.locator('.nui-pagination__control[data-nui-page-action="next"]').click();
await page.waitForTimeout(20);
equal('Pagination next changes current page', await page.evaluate(() => window.__tests.pagination.getValue().page), 2);
equal('Pagination next fires onChange(page,pageSize,event)', await page.evaluate(() => JSON.stringify(window.__tests.pageCalls[0])), JSON.stringify({ page: 2, pageSize: 10, type: 'click' }));
equal('Pagination DOM current page updated', await page.locator('.nui-pagination__page[aria-current="page"]').textContent(), '2');
await page.locator('.nui-pagination__page[data-nui-page="14"]').click();
await page.waitForTimeout(20);
equal('Pagination can select last page', await page.evaluate(() => window.__tests.pagination.getValue().page), 14);
equal('Pagination next disabled on last page', await page.locator('.nui-pagination__control[data-nui-page-action="next"]').isDisabled(), true);
await page.locator('.nui-pagination__select').selectOption('20');
await page.waitForTimeout(20);
equal('Pagination pageSize change fires once with new size', await page.evaluate(() => JSON.stringify(window.__tests.pageCalls[window.__tests.pageCalls.length - 1])), JSON.stringify({ page: 7, pageSize: 20, type: 'change' }));
equal('Pagination pageSize is reflected in getValue', await page.evaluate(() => window.__tests.pagination.getValue().pageSize), 20);
const callsBeforeUpdate = await page.evaluate(() => window.__tests.pageCalls.length);
await page.evaluate(() => window.__tests.pagination.update({ total: 5, page: 99 }));
equal('Pagination update clamps page without firing onChange', await page.evaluate(() => JSON.stringify(window.__tests.pagination.getValue())), JSON.stringify({ page: 1, pageSize: 20 }));
equal('Pagination update kept event count', await page.evaluate(() => window.__tests.pageCalls.length), callsBeforeUpdate);
await page.evaluate(() => window.__tests.pagination.update({ total: 0 }));
equal('Pagination empty state is visible at total 0', await page.locator('.nui-pagination__summary').textContent(), '共 0 条，暂无可分页内容');
equal('Pagination empty state has no page buttons', await page.locator('.nui-pagination__page').count(), 0);
await page.evaluate(() => window.__tests.pagination.destroy());
equal('Pagination destroy removes root', await page.locator('.nui-pagination').count(), 0);

await page.evaluate(() => {
  const host = document.getElementById('host');
  const pagination = NoteUI.Pagination.mount(host, { total: 100, page: 0, pageSize: 10 });
  window.__tests.paginationClamp = pagination;
});
equal('Pagination clamps page 0 to 1', await page.evaluate(() => window.__tests.paginationClamp.getValue().page), 1);
await page.evaluate(() => window.__tests.paginationClamp.destroy());

/* -----------------------------------------------------------------------
 * N06 Steps
 * --------------------------------------------------------------------- */
await reset();
await page.evaluate(() => {
  const host = document.getElementById('host');
  window.__tests.stepCalls = [];
  const steps = NoteUI.Steps.mount(host, {
    items: [
      { label: '准备材料与统一术语', description: '先确认输入与单位。' },
      { label: '执行转换', description: '当前停点由宿主控制。' },
      { label: '检查结果', description: '对照目标格式复核。' },
      { label: '归档', description: '保留可追溯记录。' }
    ],
    current: 1,
    clickable: true,
    onChange: (index, event) => window.__tests.stepCalls.push({ index, type: event && event.type })
  });
  window.__tests.steps = steps;
});
equal('Steps current item has aria-current=step', await page.locator('.nui-steps__item[aria-current="step"]').getAttribute('data-step-index'), '1');
equal('Steps visibly labels completed/current/upcoming', await page.evaluate(() => {
  const texts = [...document.querySelectorAll('.nui-steps__state')].map((node) => node.textContent);
  return texts.join('|');
}), '已完成|当前步骤|未开始|未开始');
check('Steps uses different marker shapes for complete and current', await page.evaluate(() => {
  const complete = document.querySelector('.nui-steps__item--complete .nui-steps__marker');
  const current = document.querySelector('.nui-steps__item--current .nui-steps__marker');
  return complete.textContent === '✓' && current.textContent === '2';
}));
await page.locator('.nui-steps__title--button').nth(2).click();
await page.waitForTimeout(50);
equal('Steps clickable step calls onChange(index,event)', await page.evaluate(() => JSON.stringify(window.__tests.stepCalls[0])), JSON.stringify({ index: 2, type: 'click' }));
equal('Steps does not advance current itself', await page.locator('.nui-steps__item[aria-current="step"]').getAttribute('data-step-index'), '1');
await page.waitForTimeout(350);
equal('Steps does not auto-advance after wait', await page.locator('.nui-steps__item[aria-current="step"]').getAttribute('data-step-index'), '1');
await page.evaluate(() => window.__tests.steps.update({ current: 2 }));
equal('Steps host update changes current', await page.locator('.nui-steps__item[aria-current="step"]').getAttribute('data-step-index'), '2');
equal('Steps update does not fire onChange', await page.evaluate(() => window.__tests.stepCalls.length), 1);
await page.locator('.nui-steps__title--button').nth(2).click();
equal('Steps clicking current produces no callback', await page.evaluate(() => window.__tests.stepCalls.length), 1);
await page.evaluate(() => window.__tests.steps.update({ orientation: 'vertical', clickable: false }));
check('Steps vertical orientation class is applied', await page.evaluate(() => window.__tests.steps.el.classList.contains('nui-steps--vertical')));
equal('Steps non-clickable renders no step buttons', await page.locator('.nui-steps__title--button').count(), 0);
await page.evaluate(() => window.__tests.steps.update({ items: [] }));
equal('Steps empty state is visible', await page.locator('.nui-steps__empty').textContent(), '暂无步骤');
await page.evaluate(() => window.__tests.steps.destroy());
equal('Steps destroy removes root', await page.locator('.nui-steps').count(), 0);

/* -----------------------------------------------------------------------
 * N07 TreeView
 * --------------------------------------------------------------------- */
await reset();
await page.evaluate(() => {
  const host = document.getElementById('host');
  window.__tests.treeCalls = [];
  window.__tests.treeToggles = [];
  const tree = NoteUI.TreeView.mount(host, {
    label: '文档目录',
    nodes: [
      {
        id: 'guide', label: '指南', children: [
          { id: 'start', label: '开始使用', children: [
            { id: 'install', label: '安装与初始化', children: [
              { id: 'deep', label: '一个非常深并且很长的目录节点标签，用来说明换行与缩进不会截断文字' }
            ] },
            { id: 'theme', label: '主题设置' }
          ] },
          { id: 'legacy', label: '旧版迁移', disabled: true }
        ]
      },
      { id: 'reference', label: '参考资料', children: [
        { id: 'api', label: 'API 索引' }
      ] }
    ],
    expanded: ['guide', 'start', 'install'],
    selected: 'theme',
    onSelect: (selected, event) => window.__tests.treeCalls.push({ selected, type: event && event.type }),
    onToggle: (id, open, event) => window.__tests.treeToggles.push({ id, open, type: event && event.type })
  });
  window.__tests.tree = tree;
});
equal('TreeView exposes role=tree with label', await page.locator('.nui-tree[role="tree"]').getAttribute('aria-label'), '文档目录');
check('TreeView uses treeitem and group roles', await page.evaluate(() => {
  return document.querySelectorAll('[role="treeitem"]').length >= 6 && document.querySelectorAll('[role="group"]').length >= 3;
}));
equal('TreeView initially has exactly one roving tab stop', await page.evaluate(() => document.querySelectorAll('.nui-tree [role="treeitem"][tabindex="0"]').length), 1);
equal('TreeView initial selection uses aria-selected', await page.locator('.nui-tree [role="treeitem"][aria-selected="true"]').getAttribute('data-nui-tree-id'), 'theme');
check('TreeView exposes expanded state on parents', await page.evaluate(() => {
  const guide = document.querySelector('[data-nui-tree-id="guide"]');
  const start = document.querySelector('[data-nui-tree-id="start"]');
  const leaf = document.querySelector('[data-nui-tree-id="theme"]');
  return guide.getAttribute('aria-expanded') === 'true' &&
    start.getAttribute('aria-expanded') === 'true' &&
    !leaf.hasAttribute('aria-expanded');
}));
check('TreeView disabled node has aria-disabled and visible text', await page.evaluate(() => {
  const node = document.querySelector('[data-nui-tree-id="legacy"]');
  return node.getAttribute('aria-disabled') === 'true' && node.textContent.includes('不可用');
}));
check('TreeView getTarget returns the treeitem element', await page.evaluate(() => {
  const target = window.__tests.tree.getTarget('theme');
  return target && target.getAttribute('role') === 'treeitem' && target.getAttribute('data-nui-tree-id') === 'theme';
}));
equal('TreeView getSelected returns the id', await page.evaluate(() => window.__tests.tree.getSelected()), 'theme');

// Keyboard navigation over visible nodes.
await page.evaluate(() => window.__tests.tree.getTarget('theme').focus());
await page.keyboard.press('ArrowDown');
equal('TreeView ArrowDown moves to the next visible node (disabled node remains discoverable)', await page.evaluate(() => document.activeElement.getAttribute('data-nui-tree-id')), 'legacy');
await page.keyboard.press('ArrowLeft');
equal('TreeView ArrowLeft on a disabled leaf still moves to parent', await page.evaluate(() => document.activeElement.getAttribute('data-nui-tree-id')), 'guide');
await page.keyboard.press('Home');
equal('TreeView Home moves to first visible node', await page.evaluate(() => document.activeElement.getAttribute('data-nui-tree-id')), 'guide');
await page.keyboard.press('End');
equal('TreeView End moves to last visible node', await page.evaluate(() => document.activeElement.getAttribute('data-nui-tree-id')), 'reference');
await page.keyboard.press('ArrowRight');
equal('TreeView ArrowRight expands a collapsed parent', await page.evaluate(() => document.querySelector('[data-nui-tree-id="reference"]').getAttribute('aria-expanded')), 'true');
await page.keyboard.press('ArrowRight');
equal('TreeView ArrowRight on expanded parent enters first child', await page.evaluate(() => document.activeElement.getAttribute('data-nui-tree-id')), 'api');
await page.keyboard.press('ArrowLeft');
equal('TreeView ArrowLeft on a leaf moves to its parent', await page.evaluate(() => document.activeElement.getAttribute('data-nui-tree-id')), 'reference');
await page.keyboard.press('ArrowLeft');
equal('TreeView ArrowLeft collapses an expanded parent', await page.evaluate(() => document.querySelector('[data-nui-tree-id="reference"]').getAttribute('aria-expanded')), 'false');
equal('TreeView collapse fires onToggle', await page.evaluate(() => JSON.stringify(window.__tests.treeToggles[window.__tests.treeToggles.length - 1])), JSON.stringify({ id: 'reference', open: false, type: 'keydown' }));
await page.keyboard.press('ArrowRight');
equal('TreeView ArrowRight re-expands a collapsed parent', await page.evaluate(() => document.querySelector('[data-nui-tree-id="reference"]').getAttribute('aria-expanded')), 'true');
await page.keyboard.press('ArrowRight');
equal('TreeView ArrowRight returns to first child after re-expand', await page.evaluate(() => document.activeElement.getAttribute('data-nui-tree-id')), 'api');

// Enter selects focused node.
await page.keyboard.press('Enter');
await page.waitForTimeout(20);
equal('TreeView Enter selects node', await page.evaluate(() => window.__tests.tree.getSelected()), 'api');
equal('TreeView user selection fires onSelect', await page.evaluate(() => window.__tests.treeCalls[window.__tests.treeCalls.length - 1].selected), 'api');
equal('TreeView selection callback received a keyboard event', await page.evaluate(() => window.__tests.treeCalls[window.__tests.treeCalls.length - 1].type), 'keydown');
await page.keyboard.press('Space');
await page.waitForTimeout(20);
equal('TreeView Space also selects the focused node', await page.evaluate(() => window.__tests.treeCalls[window.__tests.treeCalls.length - 1].type), 'keydown');

// Disabled node is reachable but cannot be selected or expanded.
await page.evaluate(() => {
  const node = window.__tests.tree.getTarget('legacy');
  node.focus();
});
await page.keyboard.press('Enter');
await page.waitForTimeout(10);
check('TreeView disabled node is not selected by Enter', await page.evaluate(() => window.__tests.tree.getSelected() !== 'legacy'));

// Programmatic expansion and selection.
const togglesBefore = await page.evaluate(() => window.__tests.treeToggles.length);
equal('TreeView programmatic expand returns true', await page.evaluate(() => window.__tests.tree.expand('guide', false)), true);
equal('TreeView programmatic expand is silent', await page.evaluate(() => window.__tests.treeToggles.length), togglesBefore);
check('TreeView programmatic expand changes group visibility', await page.evaluate(() => document.querySelector('[data-nui-tree-id="guide"]').getAttribute('aria-expanded') === 'false'));
await page.evaluate(() => window.__tests.tree.expand('guide', true));
const callsBeforeSilent = await page.evaluate(() => window.__tests.treeCalls.length);
await page.evaluate(() => window.__tests.tree.select('install', { silent: true }));
equal('TreeView select silent changes getSelected', await page.evaluate(() => window.__tests.tree.getSelected()), 'install');
equal('TreeView select silent suppresses onSelect', await page.evaluate(() => window.__tests.treeCalls.length), callsBeforeSilent);
await page.evaluate(() => window.__tests.tree.select('theme'));
equal('TreeView programmatic select without silent reports selection', await page.evaluate(() => window.__tests.treeCalls.length), callsBeforeSilent + 1);

// Multi-select mode.
await page.evaluate(() => window.__tests.tree.update({ multi: true, selected: ['theme', 'api'] }));
equal('TreeView multi mode sets aria-multiselectable', await page.locator('.nui-tree').getAttribute('aria-multiselectable'), 'true');
check('TreeView multi getSelected returns an array', await page.evaluate(() => {
  const value = window.__tests.tree.getSelected();
  return Array.isArray(value) && value.length === 2 && value.includes('theme') && value.includes('api');
}));
const multiBefore = await page.evaluate(() => window.__tests.treeCalls.length);
await page.evaluate(() => window.__tests.tree.select('install'));
check('TreeView multi select adds a node', await page.evaluate(() => window.__tests.tree.getSelected().includes('install')));
equal('TreeView multi programmatic select reports selection once', await page.evaluate(() => window.__tests.treeCalls.length), multiBefore + 1);
await page.evaluate(() => window.__tests.tree.select('install', { selected: false, silent: true }));
check('TreeView multi select can remove a node silently', await page.evaluate(() => !window.__tests.tree.getSelected().includes('install')));

// Programmatic update is silent and clamps remaining data.
const allCallbacksBeforeUpdate = await page.evaluate(() => window.__tests.treeCalls.length + window.__tests.treeToggles.length);
await page.evaluate(() => window.__tests.tree.update({
  nodes: [
    { id: 'guide', label: '指南更新', children: [{ id: 'theme', label: '主题更新' }] }
  ],
  expanded: ['guide'],
  selected: ['theme'],
  multi: true
}));
equal('TreeView update does not fire selection/toggle callbacks', await page.evaluate(() => window.__tests.treeCalls.length + window.__tests.treeToggles.length), allCallbacksBeforeUpdate);
check('TreeView update refreshes label and keeps target', await page.evaluate(() => {
  const target = window.__tests.tree.getTarget('theme');
  return target && target.textContent.includes('主题更新');
}));
await page.evaluate(() => window.__tests.tree.destroy());
equal('TreeView destroy removes root', await page.locator('.nui-tree').count(), 0);

/* -----------------------------------------------------------------------
 * Cross-component cleanup and runtime errors
 * --------------------------------------------------------------------- */
await reset();
const leftovers = await page.evaluate(() => ({
  floating: document.querySelectorAll('.hnv-floating').length,
  pointAnchors: document.querySelectorAll('.nui-menu__point-anchor').length
}));
equal('No body-level floating leftovers after cleanup', JSON.stringify(leftovers), JSON.stringify({ floating: 0, pointAnchors: 0 }));
equal('No uncaught page errors or console errors', runtimeErrors.length, 0);
if (runtimeErrors.length) console.log(runtimeErrors.join('\n'));

await browser.close();
console.log('\nSUMMARY: ' + passCount + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log(failures.map((item) => ' - ' + item).join('\n'));
  process.exit(1);
}
