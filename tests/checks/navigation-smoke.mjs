import { chromium } from '../tools/node_modules/playwright-core/index.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { moduleScripts, moduleStyles } from '../lib/src-sources.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const browser = await chromium.launch({ executablePath: edge, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push('pageerror: ' + error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push('console: ' + message.text()); });

await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body><div id="host"></div></body></html>');
// 源码加载清单从 src/manifests 推导，模块拆分后自动包含新增文件。
for (const file of moduleScripts(root, ['core', 'ui-navigation'])) {
  await page.addScriptTag({ path: path.join(root, file) });
}
for (const file of moduleStyles(root, ['core', 'ui-navigation'])) {
  await page.addStyleTag({ path: path.join(root, file) });
}

const report = await page.evaluate(() => {
  const out = { api: {}, tabs: {}, menu: {}, steps: {}, tree: {}, crumbs: {}, pagination: {}, mountErrors: [] };
  ['Tabs', 'AnchorNav', 'Breadcrumb', 'Menu', 'Pagination', 'Steps', 'TreeView'].forEach((name) => {
    out.api[name] = !!(window.NoteUI && window.NoteUI[name] && typeof window.NoteUI[name].mount === 'function');
  });
  const host = document.getElementById('host');
  try {
    const tabs = window.NoteUI.Tabs.mount(host, {
      items: [
        { id: 'a', label: 'A', content: 'Panel A' },
        { id: 'b', label: 'B', content: 'Panel B' },
        { id: 'x', label: 'Disabled', content: 'Disabled', disabled: true }
      ],
      value: 'a',
      onChange: (value) => { out.tabs.lastChange = value; }
    });
    out.tabs.roles = [tabs.el.querySelector('[role="tablist"]') != null,
      tabs.el.querySelectorAll('[role="tab"]').length,
      tabs.el.querySelectorAll('[role="tabpanel"]').length];
    out.tabs.selected = tabs.el.querySelector('[role="tab"][aria-selected="true"]')?.textContent;
    out.tabs.panelLinks = (() => {
      const tab = tabs.el.querySelector('[role="tab"]');
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      return panel && panel.getAttribute('aria-labelledby') === tab.id;
    })();
    tabs.el.querySelectorAll('[role="tab"]')[1].click();
    out.tabs.afterClick = tabs.getValue();
    tabs.activate('a');
    out.tabs.afterActivate = tabs.getValue();
    tabs.destroy();
    out.tabs.removed = !document.body.contains(tabs.el);

    const menu = window.NoteUI.Menu.mount(host, {
      items: [
        { id: 'open', label: '打开', shortcut: 'Enter' },
        { id: 'more', label: '更多', children: [
          { id: 'child', label: '子项' }
        ] },
        { type: 'separator' },
        { id: 'disabled', label: '禁用', disabled: true }
      ],
      trigger: { type: 'button', label: '菜单' },
      label: '测试菜单',
      onSelect: (item) => { out.menu.selected = item.id; }
    });
    menu.el.querySelector('.nui-menu__trigger').click();
    out.menu.opened = !!document.querySelector('[role="menu"]');
    out.menu.focus = document.activeElement && document.activeElement.textContent.trim();
    out.menu.items = document.querySelectorAll('[role="menuitem"]').length;
    out.menu.triggerExpanded = menu.el.querySelector('.nui-menu__trigger').getAttribute('aria-expanded');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    out.menu.closedAfterEsc = !document.querySelector('.nui-menu__panel');
    out.menu.focusAfterEsc = document.activeElement && document.activeElement.className;
    menu.destroy();
    out.menu.floatingLeft = document.querySelectorAll('.hnv-floating').length;

    const steps = window.NoteUI.Steps.mount(host, {
      items: [{ label: 'One' }, { label: 'Two' }, { label: 'Three' }],
      current: 1,
      clickable: true,
      onChange: (index) => { out.steps.change = index; }
    });
    out.steps.current = steps.el.querySelector('[aria-current="step"]')?.textContent.trim();
    steps.el.querySelectorAll('button')[2].click();
    out.steps.afterClickCurrent = steps.el.querySelector('[aria-current="step"]')?.getAttribute('data-step-index') || steps.el.querySelector('[aria-current="step"]')?.textContent.trim();
    out.steps.changeIndex = out.steps.change;
    steps.destroy();

    const tree = window.NoteUI.TreeView.mount(host, {
      nodes: [{ id: 'root', label: '根', children: [{ id: 'leaf', label: '叶' }] }],
      expanded: [],
      selected: 'root'
    });
    out.tree.itemCount = tree.el.querySelectorAll('[role="treeitem"]').length;
    out.tree.roles = !!tree.el.querySelector('[role="tree"]') && !!tree.el.querySelector('[role="group"]');
    tree.expand('root', true);
    out.tree.childVisible = !tree.getTarget('leaf').closest('[role="group"]').hidden;
    tree.select('leaf', { silent: true });
    out.tree.selected = tree.getSelected();
    tree.destroy();

    const crumbs = window.NoteUI.Breadcrumb.mount(host, {
      items: [{ label: '首页', onClick: () => {} }, { label: '目录', onClick: () => {} }, { label: '当前' }],
      maxItems: 0
    });
    out.crumbs.nav = crumbs.el.tagName;
    out.crumbs.current = crumbs.el.querySelector('[aria-current="page"]')?.textContent;
    crumbs.destroy();

    const pag = window.NoteUI.Pagination.mount(host, { total: 137, page: 1, pageSize: 10 });
    out.pagination.pages = pag.el.querySelectorAll('[data-nui-page]').length;
    out.pagination.hasCurrent = !!pag.el.querySelector('[aria-current="page"]');
    pag.destroy();
  } catch (error) {
    out.mountErrors.push(error.stack || error.message);
  }
  return out;
});

console.log(JSON.stringify(report, null, 2));
console.log('ERRORS:', errors);
await browser.close();
