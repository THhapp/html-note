import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const checkDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(checkDir, '..', '..');
const { chromium } = require(path.join(projectDir, 'tests', 'tools', 'node_modules', 'playwright-core'));
const executablePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const pageUrl = pathToFileURL(path.join(checkDir, 'core-check.html')).href;
const demoPath = path.join(projectDir, 'gallery', 'demos', 'core.js');
const browserErrors = [];
let checks = 0;

function check(condition, label, details) {
  if (!condition) {
    const suffix = details === undefined ? '' : '\n  details: ' + JSON.stringify(details);
    throw new Error('CHECK FAILED: ' + label + suffix);
  }
  checks += 1;
  console.log('ok ' + checks + ' - ' + label);
}

async function mountDemo(page, id) {
  return page.evaluate((demoId) => {
    const host = document.createElement('div');
    host.id = 'core-demo-test-host';
    host.style.cssText = 'padding:12px;border:1px dashed #999;background:#fff';
    document.body.appendChild(host);
    const factory = window.NoteGalleryDemos && window.NoteGalleryDemos[demoId];
    if (typeof factory !== 'function') throw new Error('missing demo factory ' + demoId);
    const cleanup = factory(host);
    window.__coreDemoHost = host;
    window.__coreDemoCleanup = cleanup;
    const root = host.querySelector('[data-core-demo="' + demoId + '"]');
    return {
      hasRoot: Boolean(root),
      cleanupType: typeof cleanup,
      hostConnected: host.isConnected
    };
  }, id);
}

async function cleanupDemo(page) {
  return page.evaluate(() => {
    let error = null;
    try {
      if (typeof window.__coreDemoCleanup === 'function') window.__coreDemoCleanup();
    } catch (caught) {
      error = String(caught);
    }
    if (window.__coreDemoHost) {
      window.__coreDemoHost.remove();
      window.__coreDemoHost = null;
    }
    window.__coreDemoCleanup = null;
    return {
      error,
      floatingLeft: document.querySelectorAll('.hnv-floating').length,
      backdropLeft: document.querySelectorAll('.hnv-floating__backdrop').length
    };
  });
}

async function main() {
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--allow-file-access-from-files']
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    const page = await context.newPage();
    page.on('pageerror', (error) => browserErrors.push('pageerror: ' + error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push('console: ' + message.text());
    });
    await page.goto(pageUrl, { waitUntil: 'load' });
    await page.addScriptTag({ path: demoPath });

    const registered = await page.evaluate(() => Object.keys(window.NoteGalleryDemos || {}).sort());
    check(registered.join(',') === 'I01,I02,I03,I04,I05',
      'core demos registered for I01-I05', registered);

    /* I01 */
    let mounted = await mountDemo(page, 'I01');
    check(mounted.hasRoot && mounted.cleanupType === 'function' && mounted.hostConnected,
      'I01 demo mounts with cleanup', mounted);
    const i01Before = await page.evaluate(() => {
      const sample = document.querySelector('[data-core-sample="I01"]');
      const root = document.querySelector('[data-core-demo="I01"]');
      return {
        font: sample ? getComputedStyle(sample).getPropertyValue('--hnv-font-size-reading').trim() : '',
        pageType: document.documentElement.getAttribute('data-hnv-type'),
        pageSpace: document.documentElement.getAttribute('data-hnv-space'),
        buttons: root ? root.querySelectorAll('[data-core-action]').length : 0
      };
    });
    await page.locator('[data-core-action="type-readable"]').click();
    await page.locator('[data-core-action="space-compact"]').click();
    const i01After = await page.evaluate(() => {
      const sample = document.querySelector('[data-core-sample="I01"]');
      const computed = getComputedStyle(sample);
      const status = document.querySelector('[data-core-demo="I01"] [role="status"]');
      return {
        font: computed.getPropertyValue('--hnv-font-size-reading').trim(),
        line: computed.getPropertyValue('--hnv-font-line-reading').trim(),
        inner: computed.getPropertyValue('--hnv-space-object-inner').trim(),
        pageType: document.documentElement.getAttribute('data-hnv-type'),
        pageSpace: document.documentElement.getAttribute('data-hnv-space'),
        status: status ? status.textContent : ''
      };
    });
    check(i01Before.buttons > 0 && i01After.font === '18px' && i01After.line === '1.7' &&
      i01After.inner === '15px' && i01After.pageType === i01Before.pageType &&
      i01After.pageSpace === i01Before.pageSpace && /仅覆盖本演示/.test(i01After.status),
      'I01 local readable/compact presets, root attributes restored', i01After);
    let cleaned = await cleanupDemo(page);
    check(!cleaned.error && cleaned.floatingLeft === 0 && await page.evaluate(() =>
      !document.querySelector('[data-core-demo="I01"]')), 'I01 demo cleanup', cleaned);

    /* I02 */
    mounted = await mountDemo(page, 'I02');
    check(mounted.hasRoot, 'I02 demo mounts', mounted);
    const i02Initial = await page.evaluate(() => {
      const root = document.querySelector('[data-core-demo="I02"]');
      return {
        count: root.querySelectorAll('[data-icon-name]').length,
        previewName: root.querySelector('[data-core-preview-name]').textContent,
        previewSvgCount: root.querySelectorAll('[data-core-preview-icon] svg').length,
        unique: new Set(Array.prototype.map.call(root.querySelectorAll('[data-icon-name]'), (node) => node.getAttribute('data-icon-name'))).size
      };
    });
    check(i02Initial.count === 68 && i02Initial.unique === 68 &&
      i02Initial.previewName === 'info' && i02Initial.previewSvgCount === 1,
      'I02 lists all 68 names and renders selected icon', i02Initial);
    await page.locator('[data-icon-name="check"]').click();
    const i02Selected = await page.evaluate(() => ({
      previewName: document.querySelector('[data-core-preview-name]').textContent,
      pressed: document.querySelector('[data-icon-name="check"]').getAttribute('aria-pressed')
    }));
    check(i02Selected.previewName === 'check' && i02Selected.pressed === 'true',
      'I02 renders by selected name', i02Selected);
    await page.locator('[data-core-action="icon-unknown"]').click();
    const i02Unknown = await page.evaluate(() => {
      const root = document.querySelector('[data-core-demo="I02"]');
      return {
        previewName: root.querySelector('[data-core-preview-name]').textContent,
        previewSvgCount: root.querySelectorAll('[data-core-preview-icon] svg').length,
        status: root.querySelector('[role="status"]').textContent
      };
    });
    check(i02Unknown.previewName === '未知名称' && i02Unknown.previewSvgCount === 0 &&
      /null/.test(i02Unknown.status), 'I02 unknown icon shows null state', i02Unknown);
    cleaned = await cleanupDemo(page);
    check(!cleaned.error && await page.evaluate(() =>
      !document.querySelector('[data-core-demo="I02"]')), 'I02 demo cleanup', cleaned);

    /* I03 */
    mounted = await mountDemo(page, 'I03');
    check(mounted.hasRoot, 'I03 demo mounts', mounted);
    const i03Initial = await page.evaluate(() => {
      const root = document.querySelector('[data-core-demo="I03"]');
      return {
        badge: root.querySelector('[role="status"]').textContent,
        animations: document.getAnimations ? document.getAnimations().length : 0,
        marker: root.querySelector('[data-position]').getAttribute('data-position')
      };
    });
    check(/减少动效/.test(i03Initial.badge) && i03Initial.animations === 0 &&
      i03Initial.marker === 'left', 'I03 starts static and reports reduced-motion state', i03Initial);
    await page.locator('[data-core-action="motion-play"]').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-core-demo="I03"] [data-core-status]');
      return status && /解释动效完成|减少动效/.test(status.textContent);
    }, null, { timeout: 3000 });
    const i03Played = await page.evaluate(() =>
      document.querySelector('[data-core-demo="I03"] [data-core-status]').textContent);
    check(/解释动效完成/.test(i03Played), 'I03 plays a real motion with token duration', i03Played);
    await page.locator('[data-core-action="motion-flip"]').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-core-demo="I03"] [data-core-status]');
      return status && /FLIP 完成|减少动效/.test(status.textContent);
    }, null, { timeout: 3000 });
    const i03Flipped = await page.evaluate(() => ({
      status: document.querySelector('[data-core-demo="I03"] [data-core-status]').textContent,
      marker: document.querySelector('[data-core-demo="I03"] [data-position]').getAttribute('data-position')
    }));
    check(/FLIP 完成/.test(i03Flipped.status) && i03Flipped.marker === 'right',
      'I03 FLIP animation changes target position', i03Flipped);
    await page.locator('[data-core-action="motion-reset"]').click();
    const i03Reset = await page.evaluate(() => ({
      status: document.querySelector('[data-core-demo="I03"] [data-core-status]').textContent,
      marker: document.querySelector('[data-core-demo="I03"] [data-position]').getAttribute('data-position')
    }));
    check(/已重置/.test(i03Reset.status) && i03Reset.marker === 'left', 'I03 reset returns to static state', i03Reset);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => {
      const badge = document.querySelector('[data-core-demo="I03"] [role="status"]');
      return badge && /减少动效：开/.test(badge.textContent);
    }, null, { timeout: 2000 });
    await page.locator('[data-core-action="motion-play"]').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-core-demo="I03"] [data-core-status]');
      return status && /立即呈现终态/.test(status.textContent);
    }, null, { timeout: 1000 });
    const i03Reduced = await page.evaluate(() =>
      document.querySelector('[data-core-demo="I03"] [data-core-status]').textContent);
    check(/立即呈现终态/.test(i03Reduced), 'I03 reduced-motion play lands immediately', i03Reduced);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    cleaned = await cleanupDemo(page);
    check(!cleaned.error && await page.evaluate(() =>
      !document.querySelector('[data-core-demo="I03"]')), 'I03 demo cleanup', cleaned);

    /* I04 */
    mounted = await mountDemo(page, 'I04');
    check(mounted.hasRoot, 'I04 demo mounts', mounted);
    const i04Before = await page.evaluate(() => ({
      layers: document.querySelectorAll('.hnv-floating').length,
      triggerExpanded: document.querySelector('[data-core-action="open-parent"]').getAttribute('aria-expanded')
    }));
    check(i04Before.layers === 0 && i04Before.triggerExpanded === 'false',
      'I04 demo starts with no floating layer', i04Before);
    await page.locator('[data-core-action="open-parent"]').click();
    await page.waitForFunction(() => document.querySelectorAll('.hnv-floating').length === 1);
    const i04Parent = await page.evaluate(() => {
      const panels = Array.from(document.querySelectorAll('[data-core-demo-layer]'));
      const parent = document.querySelector('[data-core-demo-layer="parent"]');
      const trigger = document.querySelector('[data-core-action="open-parent"]');
      return {
        layerCount: document.querySelectorAll('.hnv-floating').length,
        panels: panels.map((node) => node.getAttribute('data-core-demo-layer')),
        activeInside: Boolean(parent && parent.contains(document.activeElement)),
        placement: parent ? parent.closest('.hnv-floating').getAttribute('data-placement') : '',
        triggerExpanded: trigger.getAttribute('aria-expanded'),
        bodyChild: Boolean(parent && parent.closest('.hnv-floating') && parent.closest('.hnv-floating').parentNode === document.body)
      };
    });
    check(i04Parent.layerCount === 1 && i04Parent.panels.join(',') === 'parent' &&
      i04Parent.activeInside && i04Parent.triggerExpanded === 'true' && i04Parent.bodyChild,
      'I04 opens body-level parent layer with focus inside', i04Parent);

    await page.locator('[data-core-action="open-child"]').click();
    await page.waitForFunction(() => document.querySelectorAll('.hnv-floating').length === 2);
    const i04Child = await page.evaluate(() => {
      const panels = Array.from(document.querySelectorAll('[data-core-demo-layer]'));
      const child = document.querySelector('[data-core-demo-layer="child"]');
      return {
        layerCount: document.querySelectorAll('.hnv-floating').length,
        panels: panels.map((node) => node.getAttribute('data-core-demo-layer')),
        activeInsideChild: Boolean(child && child.contains(document.activeElement)),
        placement: child ? child.closest('.hnv-floating').getAttribute('data-placement') : ''
      };
    });
    check(i04Child.layerCount === 2 && i04Child.panels.join(',') === 'parent,child' &&
      i04Child.activeInsideChild, 'I04 nested child layer opens and keeps parent', i04Child);

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelectorAll('.hnv-floating').length === 1);
    const i04AfterChildEsc = await page.evaluate(() => ({
      layers: document.querySelectorAll('.hnv-floating').length,
      parentOpen: Boolean(document.querySelector('[data-core-demo-layer="parent"]')),
      childOpen: Boolean(document.querySelector('[data-core-demo-layer="child"]')),
      focusAction: document.activeElement && document.activeElement.getAttribute('data-core-action'),
      status: document.querySelector('[data-core-demo="I04"] [role="status"]').textContent
    }));
    check(i04AfterChildEsc.parentOpen && !i04AfterChildEsc.childOpen &&
      i04AfterChildEsc.focusAction === 'open-child' && /子层已关闭/.test(i04AfterChildEsc.status),
      'I04 Esc closes child only and restores parent focus', i04AfterChildEsc);

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelectorAll('.hnv-floating').length === 0);
    const i04AfterParentEsc = await page.evaluate(() => ({
      layers: document.querySelectorAll('.hnv-floating').length,
      focusAction: document.activeElement && document.activeElement.getAttribute('data-core-action'),
      status: document.querySelector('[data-core-demo="I04"] [role="status"]').textContent,
      triggerExpanded: document.querySelector('[data-core-action="open-parent"]').getAttribute('aria-expanded')
    }));
    check(i04AfterParentEsc.layers === 0 && i04AfterParentEsc.focusAction === 'open-parent' &&
      i04AfterParentEsc.triggerExpanded === 'false' && /父层已关闭/.test(i04AfterParentEsc.status),
      'I04 Esc closes parent and restores trigger focus', i04AfterParentEsc);
    cleaned = await cleanupDemo(page);
    check(!cleaned.error && cleaned.floatingLeft === 0 && cleaned.backdropLeft === 0 &&
      await page.evaluate(() => !document.querySelector('[data-core-demo="I04"]')),
      'I04 demo cleanup leaves no floating layer', cleaned);

    /* I05 */
    mounted = await mountDemo(page, 'I05');
    check(mounted.hasRoot, 'I05 demo mounts', mounted);
    const i05Initial = await page.evaluate(() => {
      const root = document.querySelector('[data-core-demo="I05"]');
      return {
        stringText: root.querySelector('[data-core-target="string"]').textContent,
        component: Boolean(root.querySelector('[data-core-component="I05-instance"]')),
        nodeInSource: Boolean(root.querySelector('[data-core-node-source] .core-demo-node')),
        nodeTargetText: root.querySelector('[data-core-target="node"]').textContent
      };
    });
    check(/初始字符串/.test(i05Initial.stringText) && i05Initial.component &&
      i05Initial.nodeInSource && /尚未移入/.test(i05Initial.nodeTargetText),
      'I05 default content and component instance', i05Initial);
    await page.locator('[data-core-action="set-string"]').click();
    const i05String = await page.evaluate(() => {
      const target = document.querySelector('[data-core-target="string"]');
      return {
        text: target.textContent,
        children: target.children.length,
        status: document.querySelector('[data-core-demo="I05"] [role="status"]').textContent
      };
    });
    check(i05String.children === 0 && i05String.text.indexOf('<strong>') === 0 &&
      /textContent/.test(i05String.status), 'I05 string is plain text, not HTML', i05String);
    await page.locator('[data-core-action="move-node"]').click();
    const i05Node = await page.evaluate(() => {
      const root = document.querySelector('[data-core-demo="I05"]');
      return {
        sourceCount: root.querySelector('[data-core-node-source]').childNodes.length,
        targetHasNode: Boolean(root.querySelector('[data-core-target="node"] .core-demo-node')),
        status: root.querySelector('[role="status"]').textContent
      };
    });
    check(i05Node.sourceCount === 0 && i05Node.targetHasNode && /未克隆/.test(i05Node.status),
      'I05 DOM node is moved rather than cloned', i05Node);
    await page.locator('[data-core-action="update-instance"]').click();
    const i05Updated = await page.evaluate(() =>
      document.querySelector('[data-core-component-info]').textContent);
    check(/render 次数 2/.test(i05Updated) && /继承键是否进入 state：否/.test(i05Updated),
      'I05 component update renders and ignores inherited keys', i05Updated);
    await page.locator('[data-core-action="destroy-instance"]').click();
    const i05Destroyed = await page.evaluate(() => ({
      info: document.querySelector('[data-core-component-info]').textContent,
      instanceLeft: Boolean(document.querySelector('[data-core-component="I05-instance"]')),
      status: document.querySelector('[data-core-demo="I05"] [role="status"]').textContent
    }));
    check(/cleanup 次数 1/.test(i05Destroyed.info) && /root 是否移除：true/.test(i05Destroyed.info) &&
      !i05Destroyed.instanceLeft && /幂等/.test(i05Destroyed.status),
      'I05 destroy is idempotent and removes root', i05Destroyed);
    await page.locator('[data-core-action="remount-instance"]').click();
    const i05Remounted = await page.evaluate(() =>
      Boolean(document.querySelector('[data-core-component="I05-instance"]')));
    check(i05Remounted, 'I05 remounts a new instance after destroy');
    cleaned = await cleanupDemo(page);
    check(!cleaned.error && await page.evaluate(() =>
      !document.querySelector('[data-core-demo="I05"]') &&
      !document.querySelector('[data-core-component="I05-instance"]')), 'I05 demo cleanup', cleaned);

    const cleanup = await page.evaluate(() => ({
      demos: document.querySelectorAll('[data-core-demo]').length,
      floating: document.querySelectorAll('.hnv-floating').length,
      textareas: document.querySelectorAll('textarea').length
    }));
    check(cleanup.demos === 0 && cleanup.floating === 0 && cleanup.textareas === 0,
      'no core demo or floating residue', cleanup);
    check(browserErrors.length === 0, 'browser console / pageerror empty', browserErrors);

    await context.close();
    await browser.close();
    console.log('\nAll ' + checks + ' core demo checks passed.');
  } catch (error) {
    await browser.close().catch(() => {});
    console.error('\nFAILED after ' + checks + ' checks.');
    console.error(error && error.stack ? error.stack : error);
    if (browserErrors.length) console.error('browser errors:', browserErrors);
    process.exitCode = 1;
  }
}

main();
