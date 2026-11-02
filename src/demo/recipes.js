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

  /* 配方密度：只压缩配方外壳的间距/内边距，不改变领域数据、停点或动效节奏。 */
  function densityOf(options) {
    var density = isObject(options) ? options.density : null;
    if (density == null || density === 'default') return 'default';
    if (density === 'compact') return 'compact';
    fail('density 只支持省略/"default" 或 "compact"。');
    return 'default';
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

  /* ---------------- 可复用组合配方（图形+状态表 / 阶段+报文+读数） ---------------- */

  function requireDom() {
    if (!global.document || typeof global.document.createElement !== 'function') {
      fail('配方需要浏览器 DOM。');
    }
    return global.document;
  }

  function requireGridStack() {
    return requireUI();
  }

  function normalizeRegion(value, name) {
    if (value == null || value === false) return null;
    if (value === true) return { slot: name };
    if (!isObject(value)) fail(name + ' 区域必须是对象、true 或省略。');
    if (value.slot != null && value.mount != null) {
      fail(name + ' 区域不能同时声明 slot 与 mount。');
    }
    if (value.slot == null && typeof value.mount !== 'function') {
      fail(name + ' 区域需要 slot（Binding 插槽名）或 mount(host) 回调。');
    }
    if (value.slot != null && text(value.slot) === '') fail(name + '.slot 必须是非空字符串。');
    return value;
  }

  function regionHost(region, name, context) {
    if (!region) return null;
    var target = el('div', 'nd-recipe__slot nd-recipe__region');
    target.setAttribute('data-recipe-region', name);
    if (region.slot != null) {
      target.setAttribute('data-demo-slot', text(region.slot));
      context.required.push(text(region.slot));
    } else {
      context.pendingMounts.push({ host: target, mount: region.mount, name: name });
    }
    return target;
  }

  function regionCard(region, name, cardClass, context) {
    if (!region) return null;
    var node = el('section', cardClass || 'nd-recipe__board');
    if (region.title || region.meta) node.appendChild(head(region.title, region.meta));
    var host = regionHost(region, name, context);
    node.appendChild(host);
    return node;
  }

  function releaseRecords(records) {
    if (!records || !records.length) return;
    for (var i = records.length - 1; i >= 0; i -= 1) {
      try { if (records[i] && typeof records[i] === 'function') records[i](); } catch (error) { /* keep cleanup moving */ }
    }
    records.length = 0;
  }

  /* 把一个 mount(host) 回调的返回值收敛成幂等 cleanup，并记录到 context。 */
  function mountRegion(record, context) {
    var result = record.mount(record.host);
    var cleanup = null;
    if (typeof result === 'function') {
      cleanup = result;
    } else if (result && typeof result.destroy === 'function') {
      cleanup = function () { result.destroy(); };
    } else if (result && result.el && typeof result.el.remove === 'function') {
      cleanup = function () { result.el.remove(); };
    }
    if (cleanup) context.cleanups.push(cleanup);
    context.mounted[record.name] = result;
  }

  /* 主区（图形/表格/阶段/报文）+ 可选页脚区。允许省略任一区域；槽位只收集真实声明的 slot。 */
  function buildRegionsLayout(container, options) {
    var UI = requireGridStack();
    var density = densityOf(options);
    var compact = density === 'compact';
    var context = {
      required: [],
      pendingMounts: [],
      mounted: {},
      cleanups: [],
      released: false
    };
    var root = el('div', 'nd-recipe' + (options.className ? ' ' + options.className : '') +
      (compact ? ' nd-recipe--compact' : ''));
    var release = function () {
      if (context.released) return;
      context.released = true;
      releaseRecords(context.cleanups);
      if (root.parentNode) root.parentNode.removeChild(root);
    };
    try {
      var mainNode = null;
      if (options.mode === 'stack') {
        mainNode = UI.Stack.mount(root, { gap: compact ? 'sm' : 'md', align: 'stretch' });
        context.cleanups.push(function () { mainNode.destroy(); });
        var mainList = el('div', 'nd-recipe__process-body');
        mainNode.append(mainList);
        (options.main || []).forEach(function (entry) {
          var card = regionCard(entry.region, entry.name, entry.cardClass, context);
          if (card) mainList.appendChild(card);
        });
      } else {
        mainNode = UI.Grid.mount(root, {
          columns: 'auto',
          minColumnWidth: options.mainMinWidth || '20rem',
          gap: compact ? 'sm' : 'md'
        });
        context.cleanups.push(function () { mainNode.destroy(); });
        (options.main || []).forEach(function (entry) {
          var card = regionCard(entry.region, entry.name, entry.cardClass, context);
          if (card) mainNode.append(card);
        });
      }

      var footerRegions = (options.footer || []).filter(function (entry) { return Boolean(entry.region); });
      if (footerRegions.length) {
        var footerGrid = UI.Grid.mount(root, {
          columns: 'auto',
          minColumnWidth: options.footerMinWidth || '10rem',
          gap: 'sm'
        });
        context.cleanups.push(function () { footerGrid.destroy(); });
        footerRegions.forEach(function (entry) {
          var card = regionCard(entry.region, entry.name, entry.cardClass || 'nd-recipe__readout', context);
          if (card) footerGrid.append(card);
        });
      }

      container.appendChild(root);
      /* mount 回调在真实 DOM 中执行；失败时统一释放已建布局与资源。 */
      context.pendingMounts.forEach(function (record) { mountRegion(record, context); });
      context.pendingMounts = [];

      var slots = {};
      if (context.required.length) {
        var collected = global.NoteDemo && typeof global.NoteDemo.collectSlots === 'function'
          ? global.NoteDemo.collectSlots(root, context.required)
          : global.NoteDemoAuthor.collectSlots(root, context.required);
        slots = collected;
      }
      return {
        root: root,
        slots: slots,
        cleanup: release,
        mounted: context.mounted
      };
    } catch (error) {
      release();
      throw error;
    }
  }

  /* 配方可接受作者已编译好的 Definition（例如 repeatStages 的输出），否则自行 compile。 */
  function resolveDefinition(options) {
    if (options.definition != null) {
      var definition = options.definition;
      if (!isObject(definition) || !Array.isArray(definition.frames) || !Array.isArray(definition.transitions)) {
        fail('definition 必须是 {bindings, frames, transitions} 形式的完整 Definition。');
      }
      return definition;
    }
    var Author = requireCompile();
    if (!isObject(options.bindings) || !Object.keys(options.bindings).length) {
      fail('未提供 definition 时，配方需要非空 bindings。');
    }
    if (!isObject(options.initial)) fail('未提供 definition 时，配方需要 initial。');
    return Author.compile({
      bindings: options.bindings,
      initial: options.initial,
      steps: options.steps,
      adapters: options.adapters
    });
  }

  /* 图形 + 状态表：主区两块（任一可省），页脚可放读数/状态。 */
  function diagramTable(options) {
    if (!isObject(options)) fail('diagramTable 需要一个配置对象。');
    var density = densityOf(options);
    var regions = {
      diagram: normalizeRegion(options.diagram, 'diagram'),
      table: normalizeRegion(options.table, 'table'),
      readout: normalizeRegion(options.readout, 'readout'),
      status: normalizeRegion(options.status, 'status')
    };
    if (!regions.diagram && !regions.table) fail('diagramTable 至少需要 diagram 或 table 区域。');
    var definition = resolveDefinition(options);
    return {
      definition: definition,
      layout: function (container) {
        return buildRegionsLayout(container, {
          className: 'nd-recipe--diagram-table',
          density: density,
          mode: 'grid',
          mainMinWidth: options.mainMinWidth,
          footerMinWidth: options.footerMinWidth,
          main: [
            { name: 'diagram', region: regions.diagram, cardClass: 'nd-recipe__board' },
            { name: 'table', region: regions.table, cardClass: 'nd-recipe__board' }
          ],
          footer: [
            { name: 'readout', region: regions.readout, cardClass: 'nd-recipe__readout' },
            { name: 'status', region: regions.status, cardClass: 'nd-recipe__readout' }
          ]
        });
      },
      recipeVersion: VERSION,
      recipe: 'diagramTable'
    };
  }

  /* 阶段 + 报文/读数：主区纵向排列，任何区域可省。 */
  function stagePacket(options) {
    if (!isObject(options)) fail('stagePacket 需要一个配置对象。');
    var density = densityOf(options);
    var regions = {
      stage: normalizeRegion(options.stage, 'stage'),
      packet: normalizeRegion(options.packet, 'packet'),
      readout: normalizeRegion(options.readout, 'readout'),
      status: normalizeRegion(options.status, 'status')
    };
    if (!regions.stage && !regions.packet) fail('stagePacket 至少需要 stage 或 packet 区域。');
    var definition = resolveDefinition(options);
    return {
      definition: definition,
      layout: function (container) {
        return buildRegionsLayout(container, {
          className: 'nd-recipe--stage-packet',
          density: density,
          mode: 'stack',
          mainMinWidth: options.mainMinWidth,
          footerMinWidth: options.footerMinWidth,
          main: [
            { name: 'stage', region: regions.stage, cardClass: 'nd-recipe__board' },
            { name: 'packet', region: regions.packet, cardClass: 'nd-recipe__board' }
          ],
          footer: [
            { name: 'readout', region: regions.readout, cardClass: 'nd-recipe__readout' },
            { name: 'status', region: regions.status, cardClass: 'nd-recipe__readout' }
          ]
        });
      },
      recipeVersion: VERSION,
      recipe: 'stagePacket'
    };
  }

  /* 重复阶段展开：作者给 items + expand(item,index)，配方只补稳定 id / caption 回退并交 NoteDemo.compile；
   * 不生成第二套定义，也不持有播放器。 */
  function repeatStages(options) {
    if (!isObject(options)) fail('repeatStages 需要一个配置对象。');
    if (!isObject(options.bindings) || !Object.keys(options.bindings).length) fail('repeatStages 需要非空 bindings。');
    if (!isObject(options.initial)) fail('repeatStages 需要 initial。');
    if (!Array.isArray(options.items) || !options.items.length) fail('repeatStages 需要非空 items 数组。');
    if (typeof options.expand !== 'function') fail('repeatStages 需要 expand(item,index) 返回一个 step。');
    var prefix = options.idPrefix == null ? 'stage-' : text(options.idPrefix);
    var steps = options.items.map(function (item, index) {
      var raw = options.expand(item, index);
      if (!isObject(raw)) fail('repeatStages.expand 第 ' + (index + 1) + ' 项必须返回对象。');
      var step = {};
      Object.keys(raw).forEach(function (key) { step[key] = raw[key]; });
      if (step.id == null || text(step.id).trim() === '') step.id = prefix + (index + 1);
      if (step.caption == null && typeof options.caption === 'function') step.caption = options.caption(item, index);
      return step;
    });
    var Author = requireCompile();
    return {
      recipeVersion: VERSION,
      recipe: 'repeatStages',
      steps: steps,
      definition: Author.compile({
        bindings: options.bindings,
        initial: options.initial,
        steps: steps,
        adapters: options.adapters
      })
    };
  }

  Recipes.diagramTable = diagramTable;
  Recipes.stagePacket = stagePacket;
  Recipes.repeatStages = repeatStages;
  Recipes.focusWorkbench = focusWorkbench;
  Recipes.version = VERSION;
})(window);