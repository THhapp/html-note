/* NoteUI layout components — plain JavaScript, no build step.
 * Range: L01–L08. Depends on NoteCore for the shared lifecycle helpers,
 * node helpers, copy-free DOM utilities, icon rendering and resize hooks.
 * Public roots use their own .nui-* classes; no stylesheet globals.
 */
(function (global) {
  'use strict';

  var NoteUI = global.NoteUI = global.NoteUI || {};
  var idCounter = 0;

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function core() {
    return global.NoteCore || {};
  }

  function assign(target, source) {
    if (!source || typeof source !== 'object') return target;
    Object.keys(source).forEach(function (key) { target[key] = source[key]; });
    return target;
  }

  function text(value) {
    return value == null ? '' : String(value);
  }

  function isNode(value) {
    return Boolean(value) && (value.nodeType === 1 || value.nodeType === 3 || value.nodeType === 11);
  }

  function make(tag, className) {
    var node = global.document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function validateHost(host) {
    var c = core();
    if (typeof c.validateHost === 'function') return c.validateHost(host);
    if (!host || (host.nodeType !== 1 && host.nodeType !== 11) || typeof host.appendChild !== 'function') {
      throw new TypeError('NoteUI.mount 需要一个元素或 DocumentFragment 容器。');
    }
    return host;
  }

  function setContent(target, value) {
    var c = core();
    if (typeof c.setContent === 'function') {
      c.setContent(target, value);
      return;
    }
    target.replaceChildren();
    if (value == null) return;
    if (isNode(value)) {
      target.appendChild(value);
    } else if (Array.isArray(value)) {
      value.forEach(function (item) {
        if (isNode(item)) target.appendChild(item);
        else target.appendChild(global.document.createTextNode(text(item)));
      });
    } else {
      target.appendChild(global.document.createTextNode(text(value)));
    }
  }

  function appendItems(parent, args) {
    if (!args.length) return;
    var c = core();
    if (typeof c.append === 'function') {
      c.append.apply(null, [parent].concat(Array.prototype.slice.call(args)));
      return;
    }
    Array.prototype.slice.call(args).forEach(function (item) {
      if (isNode(item)) parent.appendChild(item);
      else parent.appendChild(global.document.createTextNode(text(item)));
    });
  }

  function hasContent(value) {
    if (value == null) return false;
    if (typeof value === 'string') return value.length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }

  function uniqueId(prefix) {
    var c = core();
    if (typeof c.uid === 'function') return c.uid(prefix);
    idCounter += 1;
    return prefix + '-' + idCounter;
  }

  function normalizeLength(value, fallback) {
    if (typeof value === 'number' && isFinite(value)) return Math.max(0, value) + 'px';
    if (typeof value === 'string' && value.trim()) return value.trim();
    return fallback;
  }

  var SPACE_TOKENS = {
    sm: 'var(--hnv-space-sm, 8px)',
    md: 'var(--hnv-space-object-gap, 14px)',
    lg: 'var(--hnv-space-group, 28px)'
  };

  function gapValue(value, fallback) {
    if (typeof value === 'number' && isFinite(value)) return Math.max(0, value) + 'px';
    if (typeof value === 'string') {
      var trimmed = value.trim();
      if (own(SPACE_TOKENS, trimmed)) return SPACE_TOKENS[trimmed];
      if (trimmed) return trimmed;
    }
    return fallback;
  }

  function alignValue(value) {
    var map = {
      stretch: 'stretch',
      start: 'flex-start',
      'flex-start': 'flex-start',
      center: 'center',
      end: 'flex-end',
      'flex-end': 'flex-end'
    };
    return map[text(value)] || 'stretch';
  }

  function justifyValue(value) {
    var map = {
      start: 'flex-start',
      'flex-start': 'flex-start',
      center: 'center',
      end: 'flex-end',
      'flex-end': 'flex-end',
      between: 'space-between',
      'space-between': 'space-between',
      around: 'space-around',
      'space-around': 'space-around',
      evenly: 'space-evenly',
      'space-evenly': 'space-evenly'
    };
    return map[text(value)] || 'flex-start';
  }

  function observeResize(el, callback) {
    var c = core();
    if (typeof c.onResize === 'function') return c.onResize(el, callback);
    if (typeof global.ResizeObserver === 'function') {
      var observer = new global.ResizeObserver(function () { callback(); });
      observer.observe(el);
      return function () { observer.disconnect(); };
    }
    global.addEventListener('resize', callback);
    return function () { global.removeEventListener('resize', callback); };
  }

  function observeMutations(el, callback) {
    if (typeof global.MutationObserver !== 'function') return function () {};
    var observer = new global.MutationObserver(callback);
    observer.observe(el, { childList: true, characterData: true, subtree: true });
    return function () { observer.disconnect(); };
  }

  function rafThrottle(callback) {
    var frame = 0;
    function run() {
      frame = 0;
      callback();
    }
    return {
      schedule: function () {
        if (frame) return;
        frame = global.requestAnimationFrame(run);
      },
      cancel: function () {
        if (!frame) return;
        global.cancelAnimationFrame(frame);
        frame = 0;
      }
    };
  }

  /* Shared mount shell for the flow containers L01–L03. Their lifecycle,
   * content handling and append/destroy behaviour are identical; only the root
   * class and the state-to-style mapping differ. */
  function mountFlow(host, options, config) {
    validateHost(host);
    var input = options || {};
    var state = assign(assign({}, config.defaults), input);
    var root = make(config.tag || 'div', config.className);
    var destroyed = false;

    function apply() {
      config.apply(root, state);
    }

    function update(patch) {
      if (destroyed || !patch || typeof patch !== 'object') return;
      Object.keys(patch).forEach(function (key) { state[key] = patch[key]; });
      apply();
      if (own(patch, 'content')) setContent(root, state.content);
    }

    function append() {
      if (destroyed) return;
      appendItems(root, arguments);
    }

    apply();
    if (own(input, 'content')) setContent(root, state.content);
    host.appendChild(root);

    return {
      el: root,
      append: append,
      update: update,
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        root.remove();
      }
    };
  }

  /* L01 — readable-width content container. */
  NoteUI.Container = {
    version: '1.0.0',
    mount: function (host, options) {
      return mountFlow(host, options, {
        className: 'nui-container',
        defaults: {
          maxWidth: '72ch',
          padding: 'md',
          align: 'center',
          content: undefined
        },
        apply: function (root, state) {
          root.style.maxWidth = normalizeLength(state.maxWidth, '72ch');
          root.dataset.padding = ['none', 'sm', 'md', 'lg'].indexOf(state.padding) >= 0 ? state.padding : 'md';
          root.dataset.align = state.align === 'start' ? 'start' : 'center';
        }
      });
    }
  };

  /* L02 — vertical rhythm. Root deliberately uses .nui-vstack (not legacy .nui-stack). */
  NoteUI.Stack = {
    version: '1.0.0',
    mount: function (host, options) {
      return mountFlow(host, options, {
        className: 'nui-vstack',
        defaults: {
          gap: 'md',
          align: 'stretch',
          justify: 'start',
          content: undefined
        },
        apply: function (root, state) {
          root.style.gap = gapValue(state.gap, SPACE_TOKENS.md);
          root.style.alignItems = alignValue(state.align);
          root.style.justifyContent = justifyValue(state.justify);
        }
      });
    }
  };

  /* L03 — horizontal inline flow. */
  NoteUI.Inline = {
    version: '1.0.0',
    mount: function (host, options) {
      return mountFlow(host, options, {
        className: 'nui-hstack',
        defaults: {
          gap: 'md',
          align: 'center',
          justify: 'start',
          wrap: true,
          content: undefined
        },
        apply: function (root, state) {
          root.style.gap = gapValue(state.gap, SPACE_TOKENS.md);
          root.style.alignItems = alignValue(state.align);
          root.style.justifyContent = justifyValue(state.justify);
          root.dataset.wrap = state.wrap === false ? 'false' : 'true';
        }
      });
    }
  };

  /* L04 — responsive grid with optional child spans. */
  NoteUI.Grid = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var state = assign({
        columns: 'auto',
        minColumnWidth: '14rem',
        gap: 'md',
        content: undefined
      }, options || {});
      var root = make('div', 'nui-grid');
      var managedSpans = [];
      var destroyed = false;
      var mutationObserver;

      function columnCount() {
        if (typeof state.columns === 'number' && isFinite(state.columns) && state.columns >= 1) {
          return Math.max(1, Math.floor(state.columns));
        }
        if (typeof state.columns === 'string' && /^[1-9][0-9]*$/.test(state.columns.trim())) {
          return Number(state.columns);
        }
        return 0;
      }

      function spanValue(raw) {
        var value = text(raw).trim().toLowerCase();
        if (value === 'full' || value === 'all') return 'full';
        if (!/^[1-9][0-9]*$/.test(value)) return 0;
        return Number(value);
      }

      function applySpans() {
        managedSpans.forEach(function (node) {
          if (node && node.style) node.style.removeProperty('grid-column');
        });
        managedSpans = [];
        var count = columnCount();
        Array.prototype.forEach.call(root.children, function (child) {
          if (!child || child.nodeType !== 1) return;
          var raw = child.getAttribute('data-nui-span');
          if (raw == null) return;
          var span = spanValue(raw);
          if (!span) return;
          if (span === 'full') {
            child.style.gridColumn = '1 / -1';
          } else {
            var effective = count ? Math.min(span, count) : span;
            child.style.gridColumn = effective > 1 ? 'span ' + effective : '';
            if (!child.style.gridColumn) return;
          }
          managedSpans.push(child);
        });
      }

      function apply() {
        var count = columnCount();
        var gap = gapValue(state.gap, SPACE_TOKENS.md);
        root.style.gap = gap;
        if (count) {
          root.dataset.columns = 'fixed';
          root.style.gridTemplateColumns = 'repeat(' + count + ', minmax(0, 1fr))';
        } else {
          root.dataset.columns = 'auto';
          var min = normalizeLength(state.minColumnWidth, '14rem');
          root.style.gridTemplateColumns = 'repeat(auto-fit, minmax(min(100%, ' + min + '), 1fr))';
        }
        applySpans();
      }

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        Object.keys(patch).forEach(function (key) { state[key] = patch[key]; });
        if (own(patch, 'content')) setContent(root, state.content);
        apply();
      }

      function append() {
        if (destroyed) return;
        appendItems(root, arguments);
        applySpans();
      }

      if (own(options || {}, 'content')) setContent(root, state.content);
      host.appendChild(root);
      apply();
      mutationObserver = observeMutations(root, function () { applySpans(); });

      return {
        el: root,
        append: append,
        update: update,
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          if (mutationObserver) mutationObserver();
          managedSpans = [];
          root.remove();
        }
      };
    }
  };

  /* L05 — local panel with configurable surface and padding. */
  NoteUI.Panel = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var state = assign({
        title: '',
        description: '',
        content: undefined,
        actions: undefined,
        footer: undefined,
        tone: 'plain',
        padding: 'md',
        border: true
      }, options || {});
      var root = make('section', 'nui-panel');
      var header = make('div', 'nui-panel__header');
      var heading = make('div', 'nui-panel__heading');
      var titleEl = make('div', 'nui-panel__title');
      var descriptionEl = make('div', 'nui-panel__description');
      var actionsEl = make('div', 'nui-panel__actions');
      var body = make('div', 'nui-panel__body');
      var footer = make('div', 'nui-panel__footer');
      var titleId = uniqueId('nui-panel-title');
      var descriptionId = uniqueId('nui-panel-description');
      var destroyed = false;

      titleEl.id = titleId;
      descriptionEl.id = descriptionId;
      heading.appendChild(titleEl);
      heading.appendChild(descriptionEl);
      header.appendChild(heading);
      header.appendChild(actionsEl);
      root.appendChild(header);
      root.appendChild(body);
      root.appendChild(footer);

      function applySettings() {
        var tone = ['plain', 'raised', 'accent'].indexOf(state.tone) >= 0 ? state.tone : 'plain';
        var padding = ['none', 'sm', 'md', 'lg'].indexOf(state.padding) >= 0 ? state.padding : 'md';
        root.dataset.tone = tone;
        root.dataset.padding = padding;
        root.dataset.border = state.border === false ? 'none' : 'on';
      }

      function renderTitleAndDescription() {
        var hasTitle = hasContent(state.title);
        var hasDescription = hasContent(state.description);
        if (hasTitle) setContent(titleEl, state.title);
        else titleEl.replaceChildren();
        if (hasDescription) setContent(descriptionEl, state.description);
        else descriptionEl.replaceChildren();
        titleEl.hidden = !hasTitle;
        descriptionEl.hidden = !hasDescription;
        heading.hidden = !hasTitle && !hasDescription;
        if (hasTitle) root.setAttribute('aria-labelledby', titleId);
        else root.removeAttribute('aria-labelledby');
        if (hasDescription) root.setAttribute('aria-describedby', descriptionId);
        else root.removeAttribute('aria-describedby');
        syncHeaderVisibility();
      }

      function syncHeaderVisibility() {
        var actionsVisible = hasContent(state.actions);
        actionsEl.hidden = !actionsVisible;
        header.hidden = heading.hidden && !actionsVisible;
      }

      function renderActions() {
        var visible = hasContent(state.actions);
        actionsEl.replaceChildren();
        if (visible) setContent(actionsEl, state.actions);
        syncHeaderVisibility();
      }

      function renderFooter() {
        var visible = hasContent(state.footer);
        footer.replaceChildren();
        if (visible) setContent(footer, state.footer);
        footer.hidden = !visible;
      }

      function renderAll() {
        applySettings();
        renderTitleAndDescription();
        renderActions();
        renderFooter();
        if (own(options || {}, 'content') || state.content !== undefined) setContent(body, state.content);
      }

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        Object.keys(patch).forEach(function (key) { state[key] = patch[key]; });
        applySettings();
        if (own(patch, 'title') || own(patch, 'description')) renderTitleAndDescription();
        if (own(patch, 'actions')) renderActions();
        if (own(patch, 'footer')) renderFooter();
        if (own(patch, 'content')) setContent(body, state.content);
      }

      renderAll();
      host.appendChild(root);

      return {
        el: root,
        body: body,
        header: header,
        footer: footer,
        update: update,
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          root.remove();
        }
      };
    }
  };

  /* L06 — semantic horizontal/vertical divider. Spacing is internal padding. */
  NoteUI.Divider = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var state = assign({
        orientation: 'horizontal',
        label: '',
        spacing: 'md'
      }, options || {});
      var root = make('div', 'nui-divider');
      var lineStart = make('span', 'nui-divider__line');
      var labelEl = make('span', 'nui-divider__label');
      var lineEnd = make('span', 'nui-divider__line');
      var destroyed = false;

      lineStart.setAttribute('aria-hidden', 'true');
      lineEnd.setAttribute('aria-hidden', 'true');
      root.setAttribute('role', 'separator');
      root.appendChild(lineStart);
      root.appendChild(labelEl);
      root.appendChild(lineEnd);

      function apply() {
        var vertical = state.orientation === 'vertical';
        root.dataset.orientation = vertical ? 'vertical' : 'horizontal';
        root.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal');
        var spacing = gapValue(state.spacing, SPACE_TOKENS.md);
        root.style.paddingBlock = vertical ? '0' : spacing;
        root.style.paddingInline = vertical ? spacing : '0';
        var visible = hasContent(state.label);
        labelEl.hidden = !visible;
        if (visible) setContent(labelEl, state.label);
        else labelEl.replaceChildren();
        var accessibleLabel = labelEl.textContent.trim();
        if (accessibleLabel) root.setAttribute('aria-label', accessibleLabel);
        else root.removeAttribute('aria-label');
      }

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        Object.keys(patch).forEach(function (key) { state[key] = patch[key]; });
        apply();
      }

      apply();
      host.appendChild(root);

      return {
        el: root,
        update: update,
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          root.remove();
        }
      };
    }
  };

  /* L07 — locally scrolling viewport with visible overflow indicators.
   * Wheel/touch events are never intercepted; native scroll chaining remains. */
  NoteUI.ScrollArea = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var state = assign({
        content: undefined,
        height: null,
        maxHeight: null,
        label: '可滚动内容',
        hints: true,
        tabIndex: 0,
        hintLabels: null
      }, options || {});
      var defaultHintLabels = {
        top: '↑ 上方还有内容',
        bottom: '↓ 下方还有内容',
        left: '← 左侧还有内容',
        right: '→ 右侧还有内容'
      };
      state.hintLabels = assign(assign({}, defaultHintLabels), state.hintLabels || {});
      var root = make('div', 'nui-scroll-area');
      var viewport = make('div', 'nui-scroll-area__viewport');
      var contentEl = make('div', 'nui-scroll-area__content');
      var hints = {
        top: make('span', 'nui-scroll-area__hint nui-scroll-area__hint--top'),
        bottom: make('span', 'nui-scroll-area__hint nui-scroll-area__hint--bottom'),
        left: make('span', 'nui-scroll-area__hint nui-scroll-area__hint--left'),
        right: make('span', 'nui-scroll-area__hint nui-scroll-area__hint--right')
      };
      var destroyed = false;
      var disconnectViewport = null;
      var disconnectContent = null;
      var disconnectMutation = null;
      var scrollFrame = 0;
      var resizeScheduler = rafThrottle(updateHints);

      viewport.setAttribute('role', 'region');
      viewport.appendChild(contentEl);
      root.appendChild(viewport);
      Object.keys(hints).forEach(function (key) {
        hints[key].setAttribute('aria-hidden', 'true');
        root.appendChild(hints[key]);
      });

      function hintLabels() {
        return state.hintLabels && typeof state.hintLabels === 'object' ? state.hintLabels : {};
      }

      function renderHintLabels() {
        var labels = hintLabels();
        Object.keys(hints).forEach(function (key) {
          hints[key].textContent = text(labels[key] != null ? labels[key] : '');
        });
      }

      function applySettings() {
        if (state.height != null) viewport.style.height = normalizeLength(state.height, '');
        else viewport.style.removeProperty('height');
        if (state.maxHeight != null) viewport.style.maxHeight = normalizeLength(state.maxHeight, '');
        else viewport.style.removeProperty('max-height');
        viewport.setAttribute('aria-label', text(state.label) || '可滚动内容');
        viewport.tabIndex = Number.isFinite(Number(state.tabIndex)) ? Number(state.tabIndex) : 0;
        renderHintLabels();
      }

      function setHint(el, visible) {
        el.hidden = !visible;
      }

      function updateHints() {
        if (destroyed) return;
        var overflowY = viewport.scrollHeight > viewport.clientHeight + 1;
        var overflowX = viewport.scrollWidth > viewport.clientWidth + 1;
        var atTop = viewport.scrollTop <= 1;
        var atBottom = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 1;
        var atLeft = viewport.scrollLeft <= 1;
        var atRight = viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 1;
        var show = state.hints !== false;
        setHint(hints.top, show && overflowY && !atTop);
        setHint(hints.bottom, show && overflowY && !atBottom);
        setHint(hints.left, show && overflowX && !atLeft);
        setHint(hints.right, show && overflowX && !atRight);
        root.dataset.overflowTop = show && overflowY && !atTop ? 'true' : 'false';
        root.dataset.overflowBottom = show && overflowY && !atBottom ? 'true' : 'false';
        root.dataset.overflowLeft = show && overflowX && !atLeft ? 'true' : 'false';
        root.dataset.overflowRight = show && overflowX && !atRight ? 'true' : 'false';
      }

      function onScroll() {
        if (scrollFrame) return;
        scrollFrame = global.requestAnimationFrame(function () {
          scrollFrame = 0;
          updateHints();
        });
      }

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        var hintPatch = own(patch, 'hintLabels') ? patch.hintLabels : null;
        var hintBase = assign(assign({}, defaultHintLabels), state.hintLabels || {});
        Object.keys(patch).forEach(function (key) { state[key] = patch[key]; });
        if (hintPatch && typeof hintPatch === 'object') {
          /* Merge into the labels that were active before this patch so two
           * partial updates do not reset each other; missing keys fall back to
           * the built-in defaults. */
          state.hintLabels = assign(hintBase, hintPatch);
        }
        applySettings();
        if (own(patch, 'content')) setContent(contentEl, state.content);
        resizeScheduler.schedule();
      }

      function focus() {
        if (destroyed) return;
        viewport.focus();
      }

      applySettings();
      if (own(options || {}, 'content')) setContent(contentEl, state.content);
      host.appendChild(root);
      viewport.addEventListener('scroll', onScroll, { passive: true });
      disconnectViewport = observeResize(viewport, resizeScheduler.schedule);
      disconnectContent = observeResize(contentEl, resizeScheduler.schedule);
      disconnectMutation = observeMutations(contentEl, resizeScheduler.schedule);
      resizeScheduler.schedule();

      return {
        el: root,
        viewport: viewport,
        contentEl: contentEl,
        focus: focus,
        update: update,
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          viewport.removeEventListener('scroll', onScroll);
          if (scrollFrame) {
            global.cancelAnimationFrame(scrollFrame);
            scrollFrame = 0;
          }
          resizeScheduler.cancel();
          if (disconnectViewport) disconnectViewport();
          if (disconnectContent) disconnectContent();
          if (disconnectMutation) disconnectMutation();
          root.remove();
        }
      };
    }
  };

  /* L08 — draggable split pane. Ratio is the stored value; minimums are CSS pixels. */
  NoteUI.SplitPane = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var initial = options || {};
      var state = assign({
        start: undefined,
        end: undefined,
        orientation: 'auto',
        ratio: 0.5,
        minStart: 120,
        minEnd: 120,
        stackBelow: 560,
        height: null,
        label: '调整分栏比例；可拖动或使用方向键调整',
        startLabel: '起始区域',
        endLabel: '结束区域',
        onChange: null
      }, initial);
      if (own(initial, 'startContent') && !own(initial, 'start')) state.start = initial.startContent;
      if (own(initial, 'endContent') && !own(initial, 'end')) state.end = initial.endContent;

      var root = make('div', 'nui-split');
      var startEl = make('section', 'nui-split__pane nui-split__pane--start');
      var separator = make('div', 'nui-split__separator');
      var grip = make('span', 'nui-split__grip');
      var endEl = make('section', 'nui-split__pane nui-split__pane--end');
      var startId = uniqueId('nui-split-start');
      var endId = uniqueId('nui-split-end');
      var destroyed = false;
      var dragging = false;
      var pointerId = null;
      var disconnectResize = null;
      var layoutFrame = 0;
      var lastBounds = { minRatio: 0, maxRatio: 1 };

      root.appendChild(startEl);
      root.appendChild(separator);
      root.appendChild(endEl);
      startEl.id = startId;
      endEl.id = endId;
      startEl.setAttribute('aria-label', text(state.startLabel) || '起始区域');
      endEl.setAttribute('aria-label', text(state.endLabel) || '结束区域');
      separator.setAttribute('role', 'separator');
      separator.setAttribute('tabindex', '0');
      separator.setAttribute('aria-controls', startId + ' ' + endId);
      separator.setAttribute('aria-label', text(state.label) || '调整分栏比例');
      separator.appendChild(grip);
      grip.setAttribute('aria-hidden', 'true');
      separator.setAttribute('aria-valuemin', '0');
      separator.setAttribute('aria-valuemax', '100');
      separator.setAttribute('aria-valuenow', '50');

      function numeric(value, fallback) {
        var number = typeof value === 'number' ? value : Number(value);
        return isFinite(number) && number >= 0 ? number : fallback;
      }

      function ratioValue(value) {
        var number = typeof value === 'number' ? value : Number(value);
        if (!isFinite(number)) return 0.5;
        return Math.max(0, Math.min(1, number));
      }

      function currentOrientation() {
        if (state.orientation === 'vertical') return 'vertical';
        if (state.orientation === 'horizontal') return 'horizontal';
        var width = root.clientWidth || root.getBoundingClientRect().width;
        var threshold = numeric(state.stackBelow, 560);
        return width < threshold ? 'vertical' : 'horizontal';
      }

      function renderGrip(orientation) {
        grip.replaceChildren();
        var icon = null;
        var c = core();
        if (typeof c.icon === 'function') {
          icon = c.icon(orientation === 'horizontal' ? 'grip-vertical' : 'grip-horizontal', {
            size: 14,
            className: 'nui-split__grip-icon'
          });
        }
        if (icon) grip.appendChild(icon);
        else grip.textContent = orientation === 'horizontal' ? '⋮' : '⋯';
      }

      function computeGeometry(orientation) {
        var horizontal = orientation === 'horizontal';
        var total = horizontal ? root.clientWidth : root.clientHeight;
        var sep = horizontal ? separator.offsetWidth : separator.offsetHeight;
        if (!sep) sep = 10;
        var available = Math.max(0, total - sep);
        var minStart = Math.min(numeric(state.minStart, 120), available);
        var minEnd = Math.min(numeric(state.minEnd, 120), available);
        if (minStart + minEnd > available) {
          var scale = available / (minStart + minEnd || 1);
          minStart = Math.floor(minStart * scale);
          minEnd = Math.floor(minEnd * scale);
        }
        var minRatio = available > 0 ? minStart / available : 0;
        var maxRatio = available > 0 ? 1 - minEnd / available : 1;
        if (minRatio > maxRatio) {
          var middle = (minRatio + maxRatio) / 2;
          minRatio = middle;
          maxRatio = middle;
        }
        var effective = Math.max(minRatio, Math.min(maxRatio, ratioValue(state.ratio)));
        var startSize = Math.round(available * effective);
        startSize = Math.max(minStart, Math.min(available - minEnd, startSize));
        var endSize = Math.max(0, available - startSize);
        return {
          horizontal: horizontal,
          available: available,
          separator: sep,
          minRatio: minRatio,
          maxRatio: maxRatio,
          ratio: effective,
          startSize: startSize,
          endSize: endSize
        };
      }

      function applyAria(geometry) {
        var now = Math.round(geometry.ratio * 100);
        var min = Math.round(geometry.minRatio * 100);
        var max = Math.round(geometry.maxRatio * 100);
        if (now < min) now = min;
        if (now > max) now = max;
        separator.setAttribute('aria-valuemin', String(min));
        separator.setAttribute('aria-valuemax', String(max));
        separator.setAttribute('aria-valuenow', String(now));
        separator.setAttribute('aria-valuetext', now + '% / ' + (100 - now) + '%');
        separator.setAttribute('aria-orientation', geometry.horizontal ? 'vertical' : 'horizontal');
      }

      function layout() {
        if (destroyed) return;
        var orientation = currentOrientation();
        var was = root.dataset.orientation;
        root.dataset.orientation = orientation;
        if (was !== orientation || !grip.firstChild) renderGrip(orientation);
        var geometry = computeGeometry(orientation);
        state.ratio = geometry.ratio;
        lastBounds.minRatio = geometry.minRatio;
        lastBounds.maxRatio = geometry.maxRatio;
        if (geometry.horizontal) {
          root.style.gridTemplateColumns = geometry.startSize + 'px ' + geometry.separator + 'px ' + geometry.endSize + 'px';
          root.style.removeProperty('grid-template-rows');
        } else {
          root.style.gridTemplateRows = geometry.startSize + 'px ' + geometry.separator + 'px ' + geometry.endSize + 'px';
          root.style.removeProperty('grid-template-columns');
        }
        applyAria(geometry);
      }

      function scheduleLayout() {
        if (destroyed || layoutFrame) return;
        layoutFrame = global.requestAnimationFrame(function () {
          layoutFrame = 0;
          layout();
        });
      }

      function applyHeight() {
        if (state.height != null) root.style.height = normalizeLength(state.height, '');
        else root.style.removeProperty('height');
      }

      function setRatio(next, event, notify) {
        if (destroyed) return;
        var before = state.ratio;
        var clamped = Math.max(lastBounds.minRatio, Math.min(lastBounds.maxRatio, ratioValue(next)));
        state.ratio = clamped;
        layout();
        var after = state.ratio;
        if (notify && Math.abs(after - before) > 0.000001 && typeof state.onChange === 'function') {
          state.onChange(after, event);
        }
      }

      function ratioFromPointer(event) {
        var geometry = computeGeometry(currentOrientation());
        var horizontal = geometry.horizontal;
        var rect = root.getBoundingClientRect();
        var border = horizontal ? (root.clientLeft || 0) : (root.clientTop || 0);
        var position = horizontal
          ? event.clientX - rect.left - border - geometry.separator / 2
          : event.clientY - rect.top - border - geometry.separator / 2;
        if (geometry.available <= 0) return state.ratio;
        return position / geometry.available;
      }

      function pointerDown(event) {
        if (destroyed || dragging) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        dragging = true;
        pointerId = event.pointerId;
        root.dataset.dragging = 'true';
        if (typeof separator.setPointerCapture === 'function') {
          try { separator.setPointerCapture(event.pointerId); } catch (error) { /* capture is an enhancement */ }
        }
        if (typeof event.preventDefault === 'function') event.preventDefault();
        try { separator.focus({ preventScroll: true }); } catch (error) { separator.focus(); }
      }

      function pointerMove(event) {
        if (!dragging || event.pointerId !== pointerId) return;
        if (typeof event.preventDefault === 'function') event.preventDefault();
        setRatio(ratioFromPointer(event), event, true);
      }

      function endDrag(event) {
        if (!dragging || (event && event.pointerId !== pointerId)) return;
        dragging = false;
        if (typeof separator.releasePointerCapture === 'function' && pointerId !== null) {
          try {
            if (!separator.hasPointerCapture || separator.hasPointerCapture(pointerId)) {
              separator.releasePointerCapture(pointerId);
            }
          } catch (error) { /* pointer may already be released */ }
        }
        pointerId = null;
        root.dataset.dragging = 'false';
      }

      function keyDown(event) {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        var step = event.shiftKey ? 0.1 : 0.02;
        var next = null;
        var orientation = root.dataset.orientation === 'vertical' ? 'vertical' : 'horizontal';
        if (orientation === 'horizontal') {
          if (event.key === 'ArrowLeft') next = state.ratio - step;
          else if (event.key === 'ArrowRight') next = state.ratio + step;
        } else {
          if (event.key === 'ArrowUp') next = state.ratio - step;
          else if (event.key === 'ArrowDown') next = state.ratio + step;
        }
        if (event.key === 'Home') next = lastBounds.minRatio;
        else if (event.key === 'End') next = lastBounds.maxRatio;
        if (next === null) return;
        event.preventDefault();
        setRatio(next, event, true);
      }

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        var startPatch = own(patch, 'start') ? patch.start : (own(patch, 'startContent') ? patch.startContent : undefined);
        var endPatch = own(patch, 'end') ? patch.end : (own(patch, 'endContent') ? patch.endContent : undefined);
        Object.keys(patch).forEach(function (key) { state[key] = patch[key]; });
        if (own(patch, 'startContent') && !own(patch, 'start')) state.start = startPatch;
        if (own(patch, 'endContent') && !own(patch, 'end')) state.end = endPatch;
        if (own(patch, 'ratio')) state.ratio = ratioValue(patch.ratio);
        if (state.orientation !== 'vertical' && state.orientation !== 'horizontal') state.orientation = 'auto';
        if (own(patch, 'start') || own(patch, 'startContent')) setContent(startEl, startPatch);
        if (own(patch, 'end') || own(patch, 'endContent')) setContent(endEl, endPatch);
        if (own(patch, 'label')) separator.setAttribute('aria-label', text(state.label) || '调整分栏比例');
        if (own(patch, 'startLabel')) startEl.setAttribute('aria-label', text(state.startLabel) || '起始区域');
        if (own(patch, 'endLabel')) endEl.setAttribute('aria-label', text(state.endLabel) || '结束区域');
        applyHeight();
        layout();
      }

      applyHeight();
      if (own(initial, 'start') || own(initial, 'startContent')) setContent(startEl, state.start);
      if (own(initial, 'end') || own(initial, 'endContent')) setContent(endEl, state.end);
      host.appendChild(root);
      separator.addEventListener('pointerdown', pointerDown);
      separator.addEventListener('pointermove', pointerMove);
      separator.addEventListener('pointerup', endDrag);
      separator.addEventListener('pointercancel', endDrag);
      separator.addEventListener('lostpointercapture', endDrag);
      separator.addEventListener('keydown', keyDown);
      disconnectResize = observeResize(root, scheduleLayout);
      layout();

      return {
        el: root,
        startEl: startEl,
        endEl: endEl,
        separator: separator,
        getValue: function () { return state.ratio; },
        getOrientation: function () { return root.dataset.orientation === 'vertical' ? 'vertical' : 'horizontal'; },
        update: update,
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          endDrag();
          if (layoutFrame) {
            global.cancelAnimationFrame(layoutFrame);
            layoutFrame = 0;
          }
          separator.removeEventListener('pointerdown', pointerDown);
          separator.removeEventListener('pointermove', pointerMove);
          separator.removeEventListener('pointerup', endDrag);
          separator.removeEventListener('pointercancel', endDrag);
          separator.removeEventListener('lostpointercapture', endDrag);
          separator.removeEventListener('keydown', keyDown);
          if (disconnectResize) disconnectResize();
          root.remove();
        }
      };
    }
  };
})(window);
