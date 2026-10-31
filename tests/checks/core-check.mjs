import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const checkDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(checkDir, '..', '..');
const { chromium } = require(path.join(projectDir, 'tests', 'tools', 'node_modules', 'playwright-core'));
const executablePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const pageUrl = pathToFileURL(path.join(checkDir, 'core-check.html')).href;
const coreScriptPath = path.join(projectDir, 'src', 'core', 'core.js');
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

function watchPage(page, name) {
  page.on('pageerror', (error) => {
    browserErrors.push(name + ' pageerror: ' + error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(name + ' console: ' + message.text());
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
    watchPage(page, 'core');
    await page.goto(pageUrl, { waitUntil: 'load' });

    const surface = await page.evaluate(() => {
      const expected = [
        'el', 'text', 'isNode', 'setContent', 'append', 'clear', 'uid', 'escapeHtml',
        'component', 'listeners', 'rect', 'clamp', 'onResize', 'scrollIntoViewIfNeeded',
        'copy', 'own', 'assign', 'validateHost', 'focusables', 'icon'
      ];
      const missing = expected.filter((key) => typeof NoteCore[key] !== 'function');
      const motionExpected = ['reduced', 'onChange', 'play', 'stop', 'measure', 'flip', 'uiDuration', 'explainDuration'];
      const motionMissing = motionExpected.filter((key) => typeof NoteCore.motion[key] !== 'function');
      const floatingExpected = ['create', 'closeTopmost', 'closeAll'];
      const floatingMissing = floatingExpected.filter((key) => typeof NoteCore.floating[key] !== 'function');
      return {
        missing,
        motionMissing,
        floatingMissing,
        icons: {
          names: typeof NoteCore.icons.names,
          has: typeof NoteCore.icons.has,
          get: typeof NoteCore.icons.get
        }
      };
    });
    check(surface.missing.length === 0, 'core API 全部存在', surface);
    check(surface.motionMissing.length === 0, 'motion API 全部存在', surface);
    check(surface.floatingMissing.length === 0, 'floating API 全部存在', surface);
    check(surface.icons.names === 'function' && surface.icons.has === 'function' && surface.icons.get === 'function',
      'icons API 形状');

    const coreOnlyPage = await context.newPage();
    watchPage(coreOnlyPage, 'core-only');
    await coreOnlyPage.setContent('<!doctype html><html><body><div id="core-only-host"></div></body></html>');
    await coreOnlyPage.addScriptTag({ path: coreScriptPath });
    const coreOnly = await coreOnlyPage.evaluate(() => {
      const expected = [
        'el', 'text', 'isNode', 'setContent', 'append', 'clear', 'uid', 'escapeHtml',
        'component', 'listeners', 'rect', 'clamp', 'onResize', 'scrollIntoViewIfNeeded',
        'copy', 'own', 'assign', 'validateHost', 'focusables'
      ];
      const target = document.createElement('div');
      NoteCore.setContent(target, '<b>纯文本</b>');
      return {
        missing: expected.filter((key) => typeof NoteCore[key] !== 'function'),
        textOnly: target.children.length === 0 && target.textContent === '<b>纯文本</b>',
        motionLoaded: typeof NoteCore.motion !== 'undefined',
        floatingLoaded: typeof NoteCore.floating !== 'undefined',
        iconsLoaded: typeof NoteCore.icons !== 'undefined'
      };
    });
    check(coreOnly.missing.length === 0 && coreOnly.textOnly && !coreOnly.motionLoaded &&
      !coreOnly.floatingLoaded && !coreOnly.iconsLoaded,
      'core.js 独立加载时全部基础函数可用', coreOnly);
    await coreOnlyPage.close();

    const iconResult = await page.evaluate(() => {
      const names = NoteCore.icons.names();
      const sorted = names.slice().sort();
      const malformed = [];
      names.forEach((name) => {
        const svg = NoteCore.icon(name, { size: 16 });
        const again = NoteCore.icons.get(name);
        if (!svg || svg.namespaceURI !== 'http://www.w3.org/2000/svg' ||
            svg.getAttribute('width') !== '16' || svg.getAttribute('height') !== '16' ||
            svg.getAttribute('stroke') !== 'currentColor' || svg.getAttribute('fill') !== 'none' ||
            !svg.childNodes.length || !again || again === svg ||
            again.getAttribute('width') !== '24') {
          malformed.push(name);
        }
      });
      const unknown = NoteCore.icon('definitely-not-an-icon');
      const unknownGet = NoteCore.icons.get('definitely-not-an-icon');
      const labeled = NoteCore.icon('info', { size: '20', label: '信息', className: 'custom-info' });
      const plain = NoteCore.icon('info');
      const emptyLabel = NoteCore.icon('info', { label: '' });
      return {
        count: names.length,
        sorted: names.join('|') === sorted.join('|'),
        unique: new Set(names).size === names.length,
        malformed,
        unknownNull: unknown === null,
        unknownGetNull: unknownGet === null,
        unknownHas: NoteCore.icons.has('definitely-not-an-icon'),
        labeled: {
          role: labeled.getAttribute('role'),
          ariaLabel: labeled.getAttribute('aria-label'),
          ariaHidden: labeled.hasAttribute('aria-hidden'),
          focusable: labeled.getAttribute('focusable'),
          width: labeled.getAttribute('width'),
          className: labeled.getAttribute('class')
        },
        plain: {
          ariaHidden: plain.getAttribute('aria-hidden'),
          focusable: plain.getAttribute('focusable'),
          role: plain.getAttribute('role')
        },
        emptyLabelHidden: emptyLabel.getAttribute('aria-hidden')
      };
    });
    check(iconResult.count === 68, '68 个图标名称可用', iconResult);
    check(iconResult.sorted && iconResult.unique, '图标名排序且无重复', iconResult);
    check(iconResult.malformed.length === 0, '所有图标均生成正确 SVG', iconResult.malformed);
    check(iconResult.unknownNull && iconResult.unknownGetNull && iconResult.unknownHas === false,
      '未知图标返回 null / has=false', iconResult);
    check(iconResult.labeled.role === 'img' && iconResult.labeled.ariaLabel === '信息' &&
      !iconResult.labeled.ariaHidden && iconResult.labeled.width === '20' &&
      iconResult.labeled.className.indexOf('custom-info') >= 0,
      '图标 label / size / className 规则', iconResult.labeled);
    check(iconResult.plain.ariaHidden === 'true' && iconResult.plain.focusable === 'false' &&
      iconResult.emptyLabelHidden === 'true', '无 label 图标 aria-hidden 规则', iconResult.plain);

    const contentResult = await page.evaluate(async () => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const target = document.createElement('div');
      NoteCore.setContent(target, '<b>纯文本</b><script>window.__injected = true<\/script>');
      const stringResult = {
        childNodes: target.childNodes.length,
        text: target.textContent,
        elementChildren: target.children.length,
        injected: window.__injected === true
      };

      const holder = document.createElement('div');
      const moved = document.createElement('span');
      moved.textContent = '被移入';
      holder.appendChild(moved);
      NoteCore.setContent(target, moved);
      const nodeResult = {
        inTarget: target.firstChild === moved,
        holderEmpty: holder.childNodes.length === 0
      };

      const first = document.createElement('i');
      first.textContent = 'A';
      const second = document.createElement('i');
      second.textContent = 'B';
      NoteCore.setContent(target, [first, second]);
      const arrayResult = {
        order: Array.prototype.map.call(target.children, (node) => node.textContent).join(''),
        targetFirst: target.firstChild === first
      };

      const appendTarget = document.createElement('div');
      const appendedNode = document.createElement('span');
      appendedNode.textContent = '被移入';
      NoteCore.append(appendTarget, '前缀', appendedNode, null, '后缀');
      const appendResult = {
        types: Array.prototype.map.call(appendTarget.childNodes, (node) => node.nodeType).join(','),
        text: appendTarget.textContent,
        nodeMoved: appendTarget.childNodes[1] === appendedNode
      };
      const clearedBefore = target.childNodes.length;
      NoteCore.clear(target);
      const cleared = clearedBefore > 0 && target.childNodes.length === 0;

      const created = NoteCore.el('span', 'probe', '文本');
      const escapeResult = NoteCore.escapeHtml('<a href="x">&\'"');
      const ids = [];
      for (let index = 0; index < 40; index += 1) ids.push(NoteCore.uid('core-check'));
      const rectNode = document.createElement('div');
      rectNode.style.cssText = 'position:fixed;left:10px;top:20px;width:31px;height:17px';
      document.body.appendChild(rectNode);
      const rectResult = NoteCore.rect(rectNode);

      const clampResult = [
        NoteCore.clamp(-2, 0, 10),
        NoteCore.clamp(4, 0, 10),
        NoteCore.clamp(12, 0, 10)
      ];
      const assignObject = { a: 1 };
      const assignNull = NoteCore.assign(assignObject, null);
      const assignNullTarget = NoteCore.assign(null, { b: 2 });
      let hostError = '';
      try { NoteCore.validateHost({}); } catch (error) { hostError = error.message; }
      const fragment = document.createDocumentFragment();
      const validFragment = NoteCore.validateHost(fragment) === fragment;

      const focusHost = document.createElement('div');
      [
        ['disabled', (element) => { element.disabled = true; }],
        ['hidden-attribute', (element) => { element.hidden = true; }],
        ['display-none', (element) => { element.style.display = 'none'; }],
        ['negative-tab', (element) => { element.tabIndex = -1; }],
        ['normal', () => {}],
        ['link', () => {}],
        ['custom-tab', () => {}],
        ['editable', () => {}]
      ].forEach(([id, configure]) => {
        let element;
        if (id === 'link') {
          element = document.createElement('a');
          element.href = '#focusable-link';
        } else if (id === 'custom-tab') {
          element = document.createElement('div');
          element.tabIndex = 0;
        } else if (id === 'editable') {
          element = document.createElement('div');
          element.contentEditable = 'true';
        } else {
          element = document.createElement('button');
        }
        element.id = id;
        configure(element);
        focusHost.appendChild(element);
      });
      const ariaParent = document.createElement('div');
      ariaParent.setAttribute('aria-hidden', 'true');
      const ariaChild = document.createElement('button');
      ariaChild.id = 'aria-hidden-child';
      ariaParent.appendChild(ariaChild);
      focusHost.appendChild(ariaParent);
      const hiddenParent = document.createElement('div');
      hiddenParent.style.display = 'none';
      const hiddenParentChild = document.createElement('button');
      hiddenParentChild.id = 'hidden-parent-child';
      hiddenParent.appendChild(hiddenParentChild);
      focusHost.appendChild(hiddenParent);
      document.body.appendChild(focusHost);
      const focusableIds = NoteCore.focusables(focusHost).map((node) => node.id);
      const detachedHost = document.createElement('div');
      const detachedButton = document.createElement('button');
      detachedHost.appendChild(detachedButton);
      const detachedFocusable = NoteCore.focusables(detachedHost).length === 1;

      const listenerButton = document.createElement('button');
      document.body.appendChild(listenerButton);
      const bag = NoteCore.listeners(listenerButton);
      let clicks = 0;
      const onClick = () => { clicks += 1; };
      const onClickSecond = () => { clicks += 1; };
      bag.on('click', onClick);
      listenerButton.click();
      bag.off('click', onClick);
      const afterOff = clicks;
      listenerButton.click();
      bag.on('click', onClick).on('click', onClickSecond);
      listenerButton.dispatchEvent(new MouseEvent('click'));
      bag.clear();
      const afterClear = clicks;
      listenerButton.click();
      const afterFinalClick = clicks;

      let resizeDisconnect = null;
      resizeDisconnect = NoteCore.onResize(rectNode, () => {});
      const resizeDisconnectIsFunction = typeof resizeDisconnect === 'function';
      resizeDisconnect();

      const scrollContainer = document.createElement('div');
      scrollContainer.style.cssText = 'position:fixed;left:500px;top:500px;width:180px;height:80px;overflow:auto';
      const scrollTarget = document.createElement('button');
      scrollTarget.style.cssText = 'display:block;margin-top:220px;height:24px';
      scrollContainer.appendChild(scrollTarget);
      document.body.appendChild(scrollContainer);
      NoteCore.scrollIntoViewIfNeeded(scrollTarget, scrollContainer, { block: 'center' });
      const scrollTop = scrollContainer.scrollTop;

      let copyPrimary = null;
      let copyExec = null;
      let copyManual = null;
      let copyError = '';
      let copyTextareas = 0;
      try {
        const ownClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
        const originalExecCommand = document.execCommand;
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: () => Promise.resolve() }
        });
        copyPrimary = await NoteCore.copy('clipboard path');
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: () => Promise.reject(new Error('denied')) }
        });
        document.execCommand = () => true;
        copyExec = await NoteCore.copy('exec path');
        document.execCommand = () => false;
        copyManual = await NoteCore.copy('manual path');
        document.execCommand = originalExecCommand;
        if (ownClipboard) Object.defineProperty(navigator, 'clipboard', ownClipboard);
        else delete navigator.clipboard;
        copyTextareas = document.querySelectorAll('textarea').length;
      } catch (error) {
        copyError = String(error);
      }

      const componentHost = document.createElement('div');
      const componentRoot = document.createElement('div');
      const state = { label: '初始' };
      let renders = 0;
      let cleanups = 0;
      function render() {
        renders += 1;
        componentRoot.textContent = state.label;
      }
      render();
      componentHost.appendChild(componentRoot);
      document.body.appendChild(componentHost);
      const instance = NoteCore.component(componentRoot, state, render, () => { cleanups += 1; });
      const patch = Object.create({ inherited: 'ignored' });
      patch.label = '更新';
      instance.update(patch);
      const afterUpdate = {
        text: componentRoot.textContent,
        inherited: state.inherited,
        renders
      };
      const readonlyDescriptor = Object.getOwnPropertyDescriptor(instance, 'destroyed');
      const elMatches = instance.el === componentRoot;
      instance.update({ label: 'again' });
      const rendersBeforeDestroy = renders;
      instance.destroy();
      instance.destroy();
      instance.update({ label: 'after destroy' });
      const destroyResult = {
        cleanups,
        connected: componentRoot.isConnected,
        destroyed: instance.destroyed,
        rendersUnchanged: renders === rendersBeforeDestroy,
        readonly: typeof readonlyDescriptor.get === 'function' && readonlyDescriptor.set === undefined,
        elMatches
      };

      document.body.removeChild(host);
      document.body.removeChild(rectNode);
      document.body.removeChild(focusHost);
      document.body.removeChild(listenerButton);
      document.body.removeChild(scrollContainer);
      document.body.removeChild(componentHost);

      return {
        stringResult,
        nodeResult,
        arrayResult,
        appendResult,
        cleared,
        elResult: created.tagName + '|' + created.className + '|' + created.textContent,
        escapeResult,
        uidUnique: new Set(ids).size === 40,
        uidPrefixed: ids.every((id) => id.indexOf('core-check-') === 0),
        rectResult,
        clampResult,
        assign: {
          nullInput: assignNull === assignObject && assignObject.a === 1,
          nullTarget: assignNullTarget.b === 2
        },
        hostError,
        validFragment,
        own: {
          own: NoteCore.own({ x: 1 }, 'x'),
          inherited: NoteCore.own(Object.create({ x: 1 }), 'x'),
          nullObject: NoteCore.own(null, 'x')
        },
        focusableIds,
        detachedFocusable,
        listener: {
          afterOff,
          afterClear,
          afterFinalClick,
          returnsBag: bag && typeof bag.on === 'function'
        },
        resizeDisconnectIsFunction,
        scrollTop,
        copy: { copyPrimary, copyExec, copyManual, copyError, copyTextareas },
        component: afterUpdate,
        destroyResult
      };
    });
    check(contentResult.stringResult.childNodes === 1 && contentResult.stringResult.elementChildren === 0 &&
      contentResult.stringResult.text === '<b>纯文本</b><script>window.__injected = true<\/script>' &&
      !contentResult.stringResult.injected,
      'setContent 字符串不解析 HTML', contentResult.stringResult);
    check(contentResult.nodeResult.inTarget && contentResult.nodeResult.holderEmpty,
      'setContent Node 被移入而非克隆', contentResult.nodeResult);
    check(contentResult.arrayResult.order === 'AB' && contentResult.arrayResult.targetFirst,
      'setContent 数组按序移入', contentResult.arrayResult);
    check(contentResult.appendResult.text === '前缀被移入后缀' &&
      contentResult.appendResult.types === '3,1,3' && contentResult.appendResult.nodeMoved,
      'append 字符串变文本、Node 移入', contentResult.appendResult);
    check(contentResult.cleared, 'clear 清空目标');
    check(contentResult.elResult === 'SPAN|probe|文本', 'el 创建元素', contentResult.elResult);
    check(contentResult.escapeResult === '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&quot;',
      'escapeHtml 转义', contentResult.escapeResult);
    check(contentResult.uidUnique && contentResult.uidPrefixed, 'uid 唯一且带前缀');
    check(contentResult.rectResult.left === 10 && contentResult.rectResult.top === 20 &&
      contentResult.rectResult.width === 31 && contentResult.rectResult.height === 17,
      'rect 返回尺寸副本', contentResult.rectResult);
    check(contentResult.clampResult.join(',') === '0,4,10', 'clamp 边界', contentResult.clampResult);
    check(contentResult.assign.nullInput && contentResult.assign.nullTarget, 'assign null 安全');
    check(contentResult.hostError === 'NoteUI.mount 需要一个元素或 DocumentFragment 容器。' &&
      contentResult.validFragment, 'validateHost 错误消息与 fragment', contentResult.hostError);
    check(contentResult.own.own && !contentResult.own.inherited && !contentResult.own.nullObject,
      'own 只认自有属性', contentResult.own);
    check(contentResult.focusableIds.join(',') === 'normal,link,custom-tab,editable' &&
      contentResult.detachedFocusable,
      'focusables 排除禁用/隐藏/tabindex=-1/aria-hidden，并支持脱离文档的容器',
      contentResult.focusableIds);
    check(contentResult.listener.afterOff === 1 && contentResult.listener.afterClear === 3 &&
      contentResult.listener.afterFinalClick === 3 && contentResult.listener.returnsBag,
      'listeners off / clear / on 链式', contentResult.listener);
    check(contentResult.resizeDisconnectIsFunction, 'onResize 返回断开函数');
    check(contentResult.scrollTop > 0, 'scrollIntoViewIfNeeded 滚动容器', contentResult.scrollTop);
    check(contentResult.copy.copyPrimary && contentResult.copy.copyPrimary.ok &&
      contentResult.copy.copyPrimary.method === 'clipboard' && contentResult.copy.copyExec &&
      contentResult.copy.copyExec.ok && contentResult.copy.copyExec.method === 'exec' &&
      contentResult.copy.copyManual && contentResult.copy.copyManual.ok === false &&
      contentResult.copy.copyManual.method === 'manual' && contentResult.copy.copyTextareas === 0 &&
      !contentResult.copy.copyError,
      'copy 主路径与两种回退', contentResult.copy);
    check(contentResult.component.text === '更新' && contentResult.component.inherited === undefined &&
      contentResult.component.renders === 2, 'component update 只赋自有键并 render', contentResult.component);
    check(contentResult.destroyResult.cleanups === 1 && !contentResult.destroyResult.connected &&
      contentResult.destroyResult.destroyed && contentResult.destroyResult.rendersUnchanged &&
      contentResult.destroyResult.readonly && contentResult.destroyResult.elMatches,
      'component destroy 幂等且 root 移除', contentResult.destroyResult);

    const motionResult = await page.evaluate(async () => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const element = document.createElement('div');
      element.style.cssText = 'position:fixed;left:600px;top:100px;width:20px;height:20px;background:red';
      host.appendChild(element);
      const first = NoteCore.motion.play(element, [{ opacity: 0 }, { opacity: 1 }], {
        duration: 80,
        easing: 'linear',
        fill: 'both'
      });
      const shape = {
        el: first.el === element,
        finishedIsPromise: first.finished && typeof first.finished.then === 'function',
        cancelIsFunction: typeof first.cancel === 'function'
      };
      const firstValue = await first.finished;

      const canceled = NoteCore.motion.play(element, [{ opacity: 0.2 }, { opacity: 0.8 }], { duration: 600 });
      const canceledFinished = canceled.finished;
      const latest = NoteCore.motion.play(element, [{ opacity: 0.4 }, { opacity: 1 }], { duration: 40 });
      const canceledValue = await canceledFinished;
      const latestValue = await latest.finished;

      const stopped = NoteCore.motion.play(element, [{ opacity: 0.1 }, { opacity: 0.9 }], { duration: 600 });
      const stoppedFinished = stopped.finished;
      NoteCore.motion.stop(element);
      const stoppedValue = await stoppedFinished;

      const uiDuration = NoteCore.motion.uiDuration();
      const explainDuration = NoteCore.motion.explainDuration();
      const measured = NoteCore.motion.measure([element, document.body]);
      const measureIsMap = measured instanceof Map;
      const measuredElement = measured.get(element);
      const measuredBody = measured.get(document.body);

      const flipElement = document.createElement('div');
      flipElement.style.cssText = 'position:fixed;left:50px;top:50px;width:40px;height:20px;background:blue';
      document.body.appendChild(flipElement);
      const flipController = NoteCore.motion.flip(flipElement, {
        left: 0,
        top: 0,
        width: 20,
        height: 10
      }, { duration: 40, easing: 'linear' });
      const flipValue = await flipController.finished;

      host.remove();
      flipElement.remove();
      return {
        shape,
        firstValue,
        canceledValue,
        latestValue,
        stoppedValue,
        uiDuration,
        explainDuration,
        measureIsMap,
        measuredElementWidth: measuredElement && measuredElement.width,
        measuredBodyHeight: measuredBody && measuredBody.height,
        flipValue
      };
    });
    check(motionResult.shape.el && motionResult.shape.finishedIsPromise && motionResult.shape.cancelIsFunction,
      'motion.play 返回 {finished,cancel,el}', motionResult.shape);
    check(motionResult.firstValue === true, 'motion.play 自然完成 resolve(true)', motionResult.firstValue);
    check(motionResult.canceledValue === false && motionResult.latestValue === true,
      '同一元素新动画取消旧动画', motionResult);
    check(motionResult.stoppedValue === false, 'motion.stop 取消并 resolve(false)', motionResult.stoppedValue);
    check(motionResult.uiDuration > 0 && motionResult.explainDuration > motionResult.uiDuration,
      'ui / explain 时长来自不同 token', {
        ui: motionResult.uiDuration,
        explain: motionResult.explainDuration
      });
    check(motionResult.measureIsMap && motionResult.measuredElementWidth > 0 &&
      motionResult.measuredBodyHeight > 0, 'motion.measure 返回 Map<element,DOMRect>', motionResult);
    check(motionResult.flipValue === true, 'motion.flip 动画完成', motionResult.flipValue);

    await page.evaluate(() => {
      window.__motionEvents = [];
      window.__motionUnsubscribe = NoteCore.motion.onChange((value) => {
        window.__motionEvents.push(value);
      });
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => window.__motionEvents && window.__motionEvents.length > 0);
    const reducedFlag = await page.evaluate(() => ({
      reduced: NoteCore.motion.reduced(),
      events: window.__motionEvents.slice()
    }));
    check(reducedFlag.reduced === true && reducedFlag.events.indexOf(true) >= 0,
      'motion.reduced + onChange 通知变化', reducedFlag);
    await page.evaluate(() => window.__motionUnsubscribe());
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    const reducedContext = await browser.newContext({
      viewport: { width: 1000, height: 700 },
      reducedMotion: 'reduce'
    });
    const reducedPage = await reducedContext.newPage();
    watchPage(reducedPage, 'reduced');
    await reducedPage.goto(pageUrl, { waitUntil: 'load' });
    const reducedResult = await reducedPage.evaluate(async () => {
      let animateCalls = 0;
      const originalAnimate = Element.prototype.animate;
      Element.prototype.animate = function () {
        animateCalls += 1;
        return originalAnimate.apply(this, arguments);
      };
      const element = document.createElement('div');
      element.style.cssText = 'position:fixed;left:20px;top:20px;width:20px;height:20px;opacity:0.2';
      document.body.appendChild(element);
      const playController = NoteCore.motion.play(element, [
        { opacity: 0, transform: 'translateX(0px)' },
        { opacity: 1, transform: 'translateX(24px)' }
      ], { duration: 500 });
      const playValue = await playController.finished;
      const flipController = NoteCore.motion.flip(element, {
        left: 0,
        top: 0,
        width: 20,
        height: 20
      }, { duration: 500 });
      const flipValue = await flipController.finished;
      return {
        reduced: NoteCore.motion.reduced(),
        uiDuration: NoteCore.motion.uiDuration(),
        animateCalls,
        playValue,
        flipValue,
        opacity: element.style.opacity,
        transform: element.style.transform,
        playCancelIsFunction: typeof playController.cancel === 'function'
      };
    });
    check(reducedResult.reduced === true && reducedResult.uiDuration === 0,
      'reduced 下 token 归零且 reduced() 为真', reducedResult);
    check(reducedResult.animateCalls === 0 && reducedResult.playValue === false &&
      reducedResult.flipValue === false, 'reduced 下 play/flip 不建动画并立即 resolve(false)', reducedResult);
    check(reducedResult.opacity === '1' && reducedResult.transform.indexOf('translateX(24px)') >= 0,
      'reduced 下 play 立即落终态', reducedResult);
    await reducedContext.close();

    const floatingContext = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    const floatingPage = await floatingContext.newPage();
    watchPage(floatingPage, 'floating');
    await floatingPage.goto(pageUrl, { waitUntil: 'load' });

    const basic = await floatingPage.evaluate(() => {
      function fixedButton(id, left, top, width) {
        const button = document.createElement('button');
        button.id = id;
        button.type = 'button';
        button.textContent = id;
        button.style.cssText = 'position:fixed;left:' + left + 'px;top:' + top + 'px;width:' + width + 'px;height:32px';
        document.body.appendChild(button);
        return button;
      }
      const anchor = fixedButton('basic-anchor', 80, 90, 160);
      const content = document.createElement('div');
      const first = document.createElement('button');
      first.id = 'basic-one';
      first.type = 'button';
      first.textContent = '第一项';
      const second = document.createElement('button');
      second.id = 'basic-two';
      second.type = 'button';
      second.textContent = '第二项';
      content.appendChild(first);
      content.appendChild(second);
      window.__basicReasons = [];
      anchor.focus();
      window.__basic = NoteCore.floating.create({
        anchor,
        content,
        placement: 'bottom-start',
        offset: 8,
        trapFocus: true,
        matchAnchorWidth: true,
        maxWidth: 280,
        onClose: (reason) => window.__basicReasons.push(reason)
      });
      window.__basic.open();
      const panel = window.__basic.el;
      const root = window.__basic.root;
      const anchorRect = anchor.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      return {
        open: window.__basic.isOpen(),
        rootInBody: root.parentNode === document.body,
        rootClass: root.className,
        panelClass: panel.className,
        role: panel.getAttribute('role'),
        placement: root.dataset.placement,
        leftGap: panelRect.left - anchorRect.left,
        topGap: panelRect.top - anchorRect.bottom,
        widthGap: Math.abs(panelRect.width - anchorRect.width),
        panelInRoot: panel.parentNode === root,
        activeId: document.activeElement.id,
        activeInside: panel.contains(document.activeElement),
        zIndex: root.style.zIndex,
        tokenZ: getComputedStyle(document.body).getPropertyValue('--hnv-z-float').trim(),
        rootRectInside: rootRect.left >= 0 && rootRect.top >= 0 &&
          rootRect.right <= window.innerWidth && rootRect.bottom <= window.innerHeight
      };
    });
    check(basic.open && basic.rootInBody && basic.panelInRoot, 'floating 打开后挂到 body 且层级结构正确', basic);
    check(basic.role === 'dialog' && basic.placement === 'bottom-start' &&
      basic.rootClass.indexOf('hnv-floating') >= 0 && basic.panelClass.indexOf('hnv-floating__panel') >= 0,
      'floating role / placement / 类名', basic);
    check(Math.abs(basic.leftGap) <= 1 && Math.abs(basic.topGap - 8) <= 1 && basic.widthGap <= 1,
      'floating 起始对齐 / offset / matchAnchorWidth', basic);
    check(basic.activeId === 'basic-one' && basic.activeInside, 'floating trapFocus 聚焦首个可聚焦元素', basic);
    check(basic.zIndex === basic.tokenZ && basic.zIndex === '1000', 'floating z-index 从 --hnv-z-float 起', basic);
    check(basic.rootRectInside, 'floating 面板在视口内', basic);

    await floatingPage.evaluate(() => {
      document.getElementById('basic-anchor').style.width = '210px';
    });
    await floatingPage.waitForFunction(() => {
      const layer = window.__basic;
      return layer && layer.isOpen() && Math.abs(layer.el.getBoundingClientRect().width - 210) <= 1;
    });
    const resizedWidth = await floatingPage.evaluate(() => window.__basic.el.getBoundingClientRect().width);
    check(Math.abs(resizedWidth - 210) <= 1, '锚点尺寸变化触发重定位与宽度同步', resizedWidth);

    await floatingPage.keyboard.press('Shift+Tab');
    const shiftTabFocus = await floatingPage.evaluate(() => document.activeElement.id);
    check(shiftTabFocus === 'basic-two', 'trapFocus Shift+Tab 从首项回绕到末项', shiftTabFocus);
    await floatingPage.keyboard.press('Tab');
    const tabFocus = await floatingPage.evaluate(() => document.activeElement.id);
    check(tabFocus === 'basic-one', 'trapFocus Tab 从末项回绕到首项', tabFocus);

    await floatingPage.keyboard.press('Escape');
    const basicAfterEsc = await floatingPage.evaluate(() => ({
      open: window.__basic.isOpen(),
      connected: window.__basic.root.isConnected,
      focus: document.activeElement.id,
      reasons: window.__basicReasons.slice()
    }));
    check(!basicAfterEsc.open && !basicAfterEsc.connected && basicAfterEsc.focus === 'basic-anchor',
      'Escape 关闭最上层并恢复焦点', basicAfterEsc);
    check(basicAfterEsc.reasons.join(',') === 'esc', 'floating onClose(esc)', basicAfterEsc.reasons);

    await floatingPage.evaluate(() => window.__basic.open());
    await floatingPage.mouse.click(800, 500);
    const basicAfterOutside = await floatingPage.evaluate(() => ({
      open: window.__basic.isOpen(),
      connected: window.__basic.root.isConnected,
      reasons: window.__basicReasons.slice()
    }));
    check(!basicAfterOutside.open && !basicAfterOutside.connected &&
      basicAfterOutside.reasons.join(',') === 'esc,outside',
      '外点关闭最上层并回传 outside', basicAfterOutside);
    await floatingPage.evaluate(() => window.__basic.destroy());

    const nested = await floatingPage.evaluate(() => {
      const parentAnchor = document.createElement('button');
      parentAnchor.id = 'nested-parent-anchor';
      parentAnchor.style.cssText = 'position:fixed;left:320px;top:90px;width:180px;height:32px';
      document.body.appendChild(parentAnchor);
      const parentContent = document.createElement('div');
      const parentText = document.createElement('p');
      parentText.textContent = '父层内容';
      const childAnchor = document.createElement('button');
      childAnchor.id = 'nested-child-anchor';
      childAnchor.textContent = '打开子层';
      parentContent.appendChild(parentText);
      parentContent.appendChild(childAnchor);
      const childContent = document.createElement('button');
      childContent.id = 'nested-child-content';
      childContent.textContent = '子层按钮';
      window.__nestedReasons = [];
      window.__parentLayer = NoteCore.floating.create({
        anchor: parentAnchor,
        content: parentContent,
        placement: 'bottom-start',
        onClose: (reason) => window.__nestedReasons.push('parent:' + reason)
      });
      window.__childLayer = NoteCore.floating.create({
        anchor: childAnchor,
        content: childContent,
        placement: 'bottom-start',
        trapFocus: true,
        onClose: (reason) => window.__nestedReasons.push('child:' + reason)
      });
      window.__parentLayer.open();
      childAnchor.focus();
      window.__childLayer.open();
      return {
        parentOpen: window.__parentLayer.isOpen(),
        childOpen: window.__childLayer.isOpen(),
        parentZ: Number(window.__parentLayer.root.style.zIndex),
        childZ: Number(window.__childLayer.root.style.zIndex),
        childFocus: document.activeElement.id
      };
    });
    check(nested.parentOpen && nested.childOpen && nested.childZ === nested.parentZ + 1 &&
      nested.childFocus === 'nested-child-content',
      '嵌套浮层同时存在、栈层级递增且子层聚焦', nested);

    await floatingPage.keyboard.press('Escape');
    const afterChildEsc = await floatingPage.evaluate(() => ({
      parentOpen: window.__parentLayer.isOpen(),
      childOpen: window.__childLayer.isOpen(),
      focus: document.activeElement.id,
      reasons: window.__nestedReasons.slice()
    }));
    check(afterChildEsc.parentOpen && !afterChildEsc.childOpen &&
      afterChildEsc.focus === 'nested-child-anchor' &&
      afterChildEsc.reasons.join(',') === 'child:esc',
      '嵌套子层 Esc 只关子层并恢复父层内焦点', afterChildEsc);

    await floatingPage.evaluate(() => window.__childLayer.open());
    await floatingPage.mouse.click(850, 500);
    const afterNestedOutside = await floatingPage.evaluate(() => ({
      parentOpen: window.__parentLayer.isOpen(),
      childOpen: window.__childLayer.isOpen(),
      reasons: window.__nestedReasons.slice()
    }));
    check(afterNestedOutside.parentOpen && !afterNestedOutside.childOpen &&
      afterNestedOutside.reasons.join(',') === 'child:esc,child:outside',
      '嵌套外点只关子层，不误关父层', afterNestedOutside);
    await floatingPage.keyboard.press('Escape');
    const parentClosed = await floatingPage.evaluate(() => ({
      parentOpen: window.__parentLayer.isOpen(),
      reasons: window.__nestedReasons.slice()
    }));
    check(!parentClosed.parentOpen && parentClosed.reasons.indexOf('parent:esc') >= 0,
      '父层随后可由 Esc 关闭', parentClosed);
    await floatingPage.evaluate(() => {
      window.__parentLayer.destroy();
      window.__childLayer.destroy();
    });

    const flip = await floatingPage.evaluate(() => {
      const anchor = document.createElement('button');
      anchor.id = 'flip-anchor';
      anchor.style.cssText = 'position:fixed;left:120px;top:' + (window.innerHeight - 70) + 'px;width:120px;height:30px';
      document.body.appendChild(anchor);
      const content = document.createElement('div');
      content.style.cssText = 'width:180px;height:100px';
      content.textContent = '需要翻转到上方的面板';
      window.__flipLayer = NoteCore.floating.create({
        anchor,
        content,
        placement: 'bottom-start',
        offset: 8
      });
      window.__flipLayer.open();
      const anchorRect = anchor.getBoundingClientRect();
      const panelRect = window.__flipLayer.el.getBoundingClientRect();
      return {
        placement: window.__flipLayer.root.dataset.placement,
        gap: anchorRect.top - panelRect.bottom,
        panelTop: panelRect.top,
        panelBottom: panelRect.bottom,
        viewportHeight: window.innerHeight
      };
    });
    check(flip.placement === 'top-start' && Math.abs(flip.gap - 8) <= 1 &&
      flip.panelTop >= 7 && flip.panelBottom <= flip.viewportHeight,
      '视口避让翻转并保留 offset', flip);
    await floatingPage.evaluate(() => {
      window.__flipLayer.close('api');
      window.__flipLayer.destroy();
      document.getElementById('flip-anchor').remove();
    });

    const anchorRemoval = await floatingPage.evaluate(() => {
      const anchor = document.createElement('button');
      anchor.id = 'removable-anchor';
      anchor.style.cssText = 'position:fixed;left:220px;top:220px;width:120px;height:30px';
      document.body.appendChild(anchor);
      const reasons = [];
      window.__removeReasons = reasons;
      window.__removeLayer = NoteCore.floating.create({
        anchor,
        content: '将随锚点移除而关闭',
        onClose: (reason) => reasons.push(reason)
      });
      window.__removeLayer.open();
      anchor.remove();
      return true;
    });
    await floatingPage.waitForFunction(() => !window.__removeLayer.isOpen(), null, { timeout: 1500 });
    const removalResult = await floatingPage.evaluate(() => ({
      open: window.__removeLayer.isOpen(),
      connected: window.__removeLayer.root.isConnected,
      reasons: window.__removeReasons.slice()
    }));
    check(anchorRemoval && !removalResult.open && !removalResult.connected &&
      removalResult.reasons.indexOf('anchor-removed') >= 0,
      '锚点移除自动关闭 (anchor-removed)', removalResult);
    await floatingPage.evaluate(() => window.__removeLayer.destroy());

    const hiddenAnchorResult = await floatingPage.evaluate(() => {
      const anchor = document.createElement('button');
      anchor.id = 'hidden-anchor';
      anchor.style.cssText = 'position:fixed;left:420px;top:220px;width:120px;height:30px';
      document.body.appendChild(anchor);
      const reasons = [];
      const layer = NoteCore.floating.create({
        anchor,
        content: '隐藏锚点时关闭',
        onClose: (reason) => reasons.push(reason)
      });
      layer.open();
      anchor.style.display = 'none';
      window.__hiddenLayer = layer;
      window.__hiddenReasons = reasons;
      return true;
    });
    await floatingPage.waitForFunction(() => !window.__hiddenLayer.isOpen(), null, { timeout: 1500 });
    const hiddenResult = await floatingPage.evaluate(() => ({
      open: window.__hiddenLayer.isOpen(),
      reasons: window.__hiddenReasons.slice()
    }));
    check(hiddenAnchorResult && !hiddenResult.open && hiddenResult.reasons.indexOf('anchor-removed') >= 0,
      '锚点不可见时关闭且有合理原因', hiddenResult);
    await floatingPage.evaluate(() => {
      window.__hiddenLayer.destroy();
      document.getElementById('hidden-anchor').remove();
    });

    const scrollLock = await floatingPage.evaluate(() => {
      const initialOverflow = document.body.style.overflow;
      function fixedAnchor(id, left) {
        const anchor = document.createElement('button');
        anchor.id = id;
        anchor.style.cssText = 'position:fixed;left:' + left + 'px;top:300px;width:100px;height:30px';
        document.body.appendChild(anchor);
        return anchor;
      }
      const first = NoteCore.floating.create({
        anchor: fixedAnchor('lock-one', 100),
        content: '锁一',
        lockScroll: true
      });
      const second = NoteCore.floating.create({
        anchor: fixedAnchor('lock-two', 250),
        content: '锁二',
        lockScroll: true
      });
      first.open();
      second.open();
      const bothLocked = document.body.style.overflow === 'hidden';
      first.close('api');
      const oneClosedStillLocked = document.body.style.overflow === 'hidden';
      second.close('api');
      const restored = document.body.style.overflow === initialOverflow;
      first.destroy();
      second.destroy();
      document.getElementById('lock-one').remove();
      document.getElementById('lock-two').remove();
      return { bothLocked, oneClosedStillLocked, restored, initialOverflow, finalOverflow: document.body.style.overflow };
    });
    check(scrollLock.bothLocked && scrollLock.oneClosedStillLocked && scrollLock.restored,
      '滚动锁引用计数与恢复', scrollLock);

    const scrollSetup = await floatingPage.evaluate(() => {
      const scroller = document.createElement('div');
      scroller.id = 'layer-scroller';
      scroller.style.cssText = 'position:fixed;left:620px;top:120px;width:240px;height:160px;overflow:auto;border:1px solid #999';
      const spacer = document.createElement('div');
      spacer.style.height = '80px';
      const anchor = document.createElement('button');
      anchor.id = 'scroll-anchor';
      anchor.style.cssText = 'display:block;width:120px;height:30px';
      const tail = document.createElement('div');
      tail.style.height = '500px';
      scroller.appendChild(spacer);
      scroller.appendChild(anchor);
      scroller.appendChild(tail);
      document.body.appendChild(scroller);
      const layer = NoteCore.floating.create({
        anchor,
        content: '滚动时跟随',
        placement: 'bottom-start'
      });
      layer.open();
      window.__scrollLayer = layer;
      window.__scrollScroller = scroller;
      const before = layer.root.getBoundingClientRect().top;
      scroller.scrollTop = 60;
      return { before };
    });
    await floatingPage.waitForTimeout(120);
    const scrollAfter = await floatingPage.evaluate(() => ({
      top: window.__scrollLayer.root.getBoundingClientRect().top,
      open: window.__scrollLayer.isOpen(),
      scrollTop: window.__scrollScroller.scrollTop
    }));
    check(scrollSetup && scrollAfter.open && scrollAfter.scrollTop === 60 &&
      Math.abs((scrollSetup.before - 60) - scrollAfter.top) <= 1,
      '滚动（capture）时浮层重定位', { scrollSetup, scrollAfter });

    const layerSetContent = await floatingPage.evaluate(() => {
      const anchor = document.getElementById('scroll-anchor');
      window.__scrollLayer.close('api');
      window.__scrollScroller.remove();
      anchor.remove();
      window.__scrollLayer.destroy();
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:100px;top:400px;width:120px;height:30px';
      document.body.appendChild(host);
      const layer = NoteCore.floating.create({ anchor: host, content: '初始文本' });
      layer.open();
      const initialText = layer.el.textContent;
      layer.setContent('<em>纯文本</em>');
      const stringParsed = layer.el.querySelector('em') !== null;
      const stringText = layer.el.textContent;
      const moved = document.createElement('span');
      moved.id = 'moved-floating-content';
      moved.textContent = '移入节点';
      document.body.appendChild(moved);
      layer.setContent(moved);
      const nodeMoved = moved.parentNode === layer.el && moved.parentNode !== document.body;
      layer.close('api');
      layer.destroy();
      host.remove();
      return { initialText, stringParsed, stringText, nodeMoved, openAfter: layer.isOpen() };
    });
    check(layerSetContent.initialText === '初始文本' && !layerSetContent.stringParsed &&
      layerSetContent.stringText === '<em>纯文本</em>' && layerSetContent.nodeMoved &&
      !layerSetContent.openAfter,
      'floating.setContent 纯文本/Node 移入与关闭', layerSetContent);

    const modal = await floatingPage.evaluate(() => {
      const opener = document.createElement('button');
      opener.id = 'modal-opener';
      opener.style.cssText = 'position:fixed;left:700px;top:60px;width:120px;height:30px';
      document.body.appendChild(opener);
      opener.focus();
      const content = document.createElement('button');
      content.id = 'modal-first';
      content.textContent = '对话框内容';
      const reasons = [];
      window.__modalReasons = reasons;
      window.__modalLayer = NoteCore.floating.create({
        anchor: null,
        content,
        modal: true,
        trapFocus: true,
        lockScroll: true,
        onClose: (reason) => reasons.push(reason)
      });
      window.__modalLayer.open();
      const root = window.__modalLayer.root;
      const panel = window.__modalLayer.el;
      const backdrop = root.querySelector('.hnv-floating__backdrop');
      const panelRect = panel.getBoundingClientRect();
      return {
        open: window.__modalLayer.isOpen(),
        backdrop: Boolean(backdrop && backdrop.parentNode === root),
        ariaModal: panel.getAttribute('aria-modal'),
        role: panel.getAttribute('role'),
        active: document.activeElement.id,
        centeredX: Math.abs((panelRect.left + panelRect.width / 2) - window.innerWidth / 2),
        centeredY: Math.abs((panelRect.top + panelRect.height / 2) - window.innerHeight / 2),
        locked: document.body.style.overflow,
        placement: root.dataset.placement
      };
    });
    check(modal.open && modal.backdrop && modal.ariaModal === 'true' && modal.role === 'dialog' &&
      modal.active === 'modal-first', 'modal 遮罩 / aria-modal / 焦点', modal);
    check(modal.centeredX <= 1 && modal.centeredY <= 1 && modal.placement === 'center',
      '无锚点 modal 居中', modal);
    check(modal.locked === 'hidden', 'modal lockScroll 生效', modal);
    await floatingPage.keyboard.press('Escape');
    const modalClosed = await floatingPage.evaluate(() => ({
      open: window.__modalLayer.isOpen(),
      reasons: window.__modalReasons.slice(),
      focus: document.activeElement.id,
      backdropLeft: document.querySelectorAll('.hnv-floating__backdrop').length,
      overflow: document.body.style.overflow
    }));
    check(!modalClosed.open && modalClosed.focus === 'modal-opener' &&
      modalClosed.reasons.join(',') === 'esc' && modalClosed.backdropLeft === 0 &&
      modalClosed.overflow !== 'hidden',
      'modal Esc 关闭、遮罩移除、焦点/滚动恢复', modalClosed);
    await floatingPage.evaluate(() => {
      window.__modalLayer.destroy();
      document.getElementById('modal-opener').remove();
    });

    const destroyResult = await floatingPage.evaluate(() => {
      const opener = document.createElement('button');
      opener.id = 'destroy-opener';
      opener.style.cssText = 'position:fixed;left:850px;top:60px;width:100px;height:30px';
      document.body.appendChild(opener);
      opener.focus();
      const reasons = [];
      const layer = NoteCore.floating.create({
        anchor: opener,
        content: '即将销毁',
        trapFocus: true,
        onClose: (reason) => reasons.push(reason)
      });
      layer.open();
      layer.destroy();
      layer.destroy();
      const afterFirst = {
        open: layer.isOpen(),
        connected: layer.root.isConnected,
        reasons: reasons.slice()
      };
      opener.remove();
      return afterFirst;
    });
    check(!destroyResult.open && !destroyResult.connected &&
      destroyResult.reasons.join(',') === 'destroy',
      'floating.destroy 幂等、移除 root、回调 destroy', destroyResult);

    const closeAllResult = await floatingPage.evaluate(() => {
      function makeLayer(id, left) {
        const anchor = document.createElement('button');
        anchor.id = id;
        anchor.style.cssText = 'position:fixed;left:' + left + 'px;top:450px;width:80px;height:24px';
        document.body.appendChild(anchor);
        const reasons = [];
        const layer = NoteCore.floating.create({
          anchor,
          content: id,
          closeOnOutside: false,
          onClose: (reason) => reasons.push(reason)
        });
        layer.open();
        return { anchor, layer, reasons };
      }
      const one = makeLayer('close-all-one', 100);
      const two = makeLayer('close-all-two', 220);
      NoteCore.floating.closeAll();
      const result = {
        oneOpen: one.layer.isOpen(),
        twoOpen: two.layer.isOpen(),
        oneConnected: one.layer.root.isConnected,
        twoConnected: two.layer.root.isConnected,
        oneReasons: one.reasons.slice(),
        twoReasons: two.reasons.slice(),
        floatingLeft: document.querySelectorAll('.hnv-floating').length
      };
      one.layer.destroy();
      two.layer.destroy();
      one.anchor.remove();
      two.anchor.remove();
      return result;
    });
    check(!closeAllResult.oneOpen && !closeAllResult.twoOpen &&
      !closeAllResult.oneConnected && !closeAllResult.twoConnected &&
      closeAllResult.oneReasons.join(',') === 'api' &&
      closeAllResult.twoReasons.join(',') === 'api' &&
      closeAllResult.floatingLeft === 0,
      'floating.closeAll 清理全部活动层', closeAllResult);

    const cleanup = await floatingPage.evaluate(() => ({
      floating: document.querySelectorAll('.hnv-floating').length,
      backdrops: document.querySelectorAll('.hnv-floating__backdrop').length,
      textareas: document.querySelectorAll('textarea').length,
      bodyOverflow: document.body.style.overflow
    }));
    check(cleanup.floating === 0 && cleanup.backdrops === 0 && cleanup.textareas === 0,
      '检查结束无浮层/遮罩/临时 textarea 残留', cleanup);

    await floatingContext.close();
    await context.close();
    await browser.close();

    check(browserErrors.length === 0, '浏览器 console / pageerror 为空', browserErrors);
    console.log('\nAll ' + checks + ' checks passed.');
  } catch (error) {
    await browser.close().catch(() => {});
    console.error('\nFAILED after ' + checks + ' checks.');
    console.error(error && error.stack ? error.stack : error);
    if (browserErrors.length) console.error('browser errors:', browserErrors);
    process.exitCode = 1;
  }
}

main();
