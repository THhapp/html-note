/* NoteDemo recipes — small executable compositions that return NoteDemo inputs.
 * Scope: window.NoteDemoRecipes. Depends on NoteDemoAuthor, NoteUI.Stack/Grid and the
 * components mounted through NoteDemo bindings. No player, no content inference.
 */
(function (global) {
  'use strict';

  var Recipes = global.NoteDemoRecipes = global.NoteDemoRecipes || {};
  var VERSION = '1.0.0';

  function fail(message) {
    throw new Error('NoteDemoRecipes: ' + message);
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function text(value) {
    return value == null ? '' : String(value);
  }

  function el(tag, className, content) {
    var node = global.document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = String(content);
    return node;
  }

  function slot(name, className) {
    var node = el('div', 'nd-recipe__slot' + (className ? ' ' + className : ''));
    node.setAttribute('data-demo-slot', name);
    return node;
  }

  function head(title, meta) {
    var wrap = el('div', 'nd-recipe__head');
    if (title) wrap.appendChild(el('p', 'nd-recipe__title', title));
    if (meta) wrap.appendChild(el('p', 'nd-recipe__meta', meta));
    return wrap;
  }

  function card(title, meta, slotName, className) {
    var node = el('section', 'nd-recipe__card' + (className ? ' ' + className : ''));
    if (title || meta) node.appendChild(head(title, meta));
    var target = slot(slotName, 'nd-recipe__slot--' + slotName);
    node.appendChild(target);
    return { el: node, slot: target };
  }

  function requireUI() {
    var UI = global.NoteUI;
    if (!UI || !UI.Grid || typeof UI.Grid.mount !== 'function' || !UI.Stack || typeof UI.Stack.mount !== 'function') {
      throw new Error('NoteDemoRecipes.focusWorkbench 需要先加载 NoteUI.Grid 与 NoteUI.Stack。');
    }
    return UI;
  }

  /* layout(container) 返回 { root, slots, cleanup }；cleanup 幂等，供公共层在销毁时调用。
   * 布局回调返回前失败时公共层拿不到 cleanup，因此这里在任何抛出路径都释放已创建的
   * 布局组件（Grid/Stack 自带观察器），不留悬空资源。 */
  function buildLayout(container, options) {
    var UI = requireUI();
    var root = el('div', 'nd-recipe' + (options.className ? ' ' + options.className : ''));
    var cleanups = [];
    var slots = {};
    var released = false;

    function release() {
      if (released) return;
      released = true;
      for (var i = cleanups.length - 1; i >= 0; i -= 1) {
        try { cleanups[i].destroy(); } catch (error) { /* keep cleanup moving */ }
      }
      if (root.parentNode) root.parentNode.removeChild(root);
    }

    try {
      var sourceGrid = UI.Grid.mount(root, {
        columns: 'auto',
        minColumnWidth: options.sourceMinWidth || '16rem',
        gap: 'md'
      });
      cleanups.push(sourceGrid);
      (options.sources || []).forEach(function (source) {
        if (!isObject(source) || !source.slot) fail('sources 每项必须是 {slot,title?,meta?}。');
        var built = card(source.title, source.meta, source.slot, 'nd-recipe__board');
        sourceGrid.append(built.el);
      });
      root.dataset.sources = String((options.sources || []).length);

      var processStack = UI.Stack.mount(root, { gap: 'sm', align: 'stretch' });
      cleanups.push(processStack);

      var processCard = el('section', 'nd-recipe__process');
      if (options.processTitle || options.processMeta) {
        processCard.appendChild(head(options.processTitle, options.processMeta));
      }
      var processBody = el('div', 'nd-recipe__process-body');
      processCard.appendChild(processBody);
      (options.process || []).forEach(function (item) {
        if (!isObject(item) || !item.slot) fail('process 每项必须是 {slot,title?}。');
        var built = card(item.title, item.meta, item.slot, 'nd-recipe__process-slot');
        processBody.appendChild(built.el);
      });

      var hasReadout = !!(options.readout && options.readout.slot);
      var hasResult = !!(options.result && options.result.slot);
      /* 没有读数/结果时不生成空页脚网格，避免无意义的 DOM 与观察器。 */
      if (hasReadout || hasResult) {
        var footerGrid = UI.Grid.mount(processCard, {
          columns: 'auto',
          minColumnWidth: options.footerMinWidth || '12rem',
          gap: 'sm'
        });
        cleanups.push(footerGrid);
        var footer = el('div', 'nd-recipe__footer');
        footerGrid.el.appendChild(footer);
        if (hasReadout) {
          footer.appendChild(card(options.readout.title, options.readout.meta, options.readout.slot, 'nd-recipe__readout').el);
        }
        if (hasResult) {
          footer.appendChild(card(options.result.title, options.result.meta, options.result.slot, 'nd-recipe__result').el);
        }
      }
      processStack.append(processCard);
      container.appendChild(root);

      var required = [];
      (options.sources || []).forEach(function (source) { required.push(source.slot); });
      (options.process || []).forEach(function (item) { required.push(item.slot); });
      if (hasReadout) required.push(options.readout.slot);
      if (hasResult) required.push(options.result.slot);
      var collected = global.NoteDemo && typeof global.NoteDemo.collectSlots === 'function'
        ? global.NoteDemo.collectSlots(root, required)
        : global.NoteDemoAuthor.collectSlots(root, required);
      slots = collected;

      return {
        root: root,
        slots: slots,
        cleanup: release
      };
    } catch (error) {
      release();
      throw error;
    }
  }

  function requireCompile() {
    var Author = global.NoteDemoAuthor;
    if (!Author || typeof Author.compile !== 'function') {
      throw new Error('NoteDemoRecipes.focusWorkbench 需要先加载 NoteDemoAuthor.compile。');
    }
    return Author;
  }

  function focusWorkbench(options) {
    if (!isObject(options)) fail('focusWorkbench 需要一个配置对象。');
    var Author = requireCompile();
    var sources = Array.isArray(options.sources) ? options.sources : [];
    if (!sources.length) fail('focusWorkbench 至少需要一个 source 区域。');
    var definition = Author.compile({
      bindings: options.bindings,
      initial: options.initial,
      steps: options.steps,
      adapters: options.adapters
    });
    return {
      definition: definition,
      layout: function (container) { return buildLayout(container, options); },
      recipeVersion: VERSION
    };
  }

  Recipes.focusWorkbench = focusWorkbench;
  Recipes.version = VERSION;
})(window);