/*! note-library module: ui-overlay
 * dependencies: core, legacy
 * type: JavaScript
 * generated-by: scripts/build.mjs; do-not-edit.
 */

/* ---- source: src/ui/overlay.js ---- */
/* NoteUI overlay components — Tooltip / Popover / Dialog / Drawer.
 * Plain JavaScript, no framework. All positioning, stacking, outside/Esc closing
 * and focus trapping/restoring go through NoteCore.floating (I04).
 * Component content/styles live under .nui-tooltip, .nui-popover, .nui-dialog,
 * .nui-drawer; the panel base is .hnv-floating from core.
 */
(function (global) {
  'use strict';

  var NoteUI = global.NoteUI = global.NoteUI || {};
  var VERSION = '1.0.0';
  var PLACEMENTS = {
    top: 1, bottom: 1, left: 1, right: 1,
    'top-start': 1, 'top-end': 1,
    'bottom-start': 1, 'bottom-end': 1,
    'left-start': 1, 'left-end': 1,
    'right-start': 1, 'right-end': 1,
    auto: 1
  };
  var SIZES = { sm: '420px', md: '560px', lg: '760px' };

  var NoteCore = global.NoteCore;
  if (!NoteCore) throw new Error('NoteUI 浮层组件需要 NoteCore（core 模块）。');

  function core() {
    if (!NoteCore.floating || typeof NoteCore.floating.create !== 'function') {
      throw new Error('NoteUI 浮层组件需要 NoteCore.floating（I04）。');
    }
    return NoteCore;
  }

  /* core 模块已提供这些工具；浮层模块不再复制回退实现。 */
  function make(tag, className) {
    return NoteCore.el(tag, className || '');
  }

  function txt(value) {
    return NoteCore.text(value);
  }

  function setContent(target, value) {
    NoteCore.setContent(target, value);
  }

  function uid(prefix) {
    return NoteCore.uid(prefix);
  }

  function checkHost(host) {
    NoteCore.validateHost(host);
  }

  function bagFor(target) {
    return NoteCore.listeners(target);
  }

  function isNode(value) {
    return NoteCore.isNode(value);
  }

  function hasContent(value) {
    return isNode(value) || txt(value) !== '';
  }

  function normalizePlacement(value, fallback) {
    return PLACEMENTS[value] ? value : fallback;
  }

  function normalizeDelay(value, fallback) {
    var number = Number(value);
    return isFinite(number) && number >= 0 ? number : fallback;
  }

  function normalizeSize(value, fallback) {
    if (typeof value === 'number' && isFinite(value) && value > 0) return value + 'px';
    if (typeof value === 'string' && value.trim()) return value.trim();
    return fallback;
  }

  function sizeFor(value) {
    if (typeof value === 'string' && SIZES[value]) return SIZES[value];
    return normalizeSize(value, SIZES.md);
  }

  function addUserClass(value) {
    var out = '';
    txt(value).split(/\s+/).forEach(function (name) {
      if (/^[A-Za-z_][\w-]*$/.test(name)) out += ' ' + name;
    });
    return out;
  }

  function rememberAttributes(target, names) {
    var saved = {};
    names.forEach(function (name) { saved[name] = target.getAttribute(name); });
    return function restore() {
      if (!target || typeof target.getAttribute !== 'function') return;
      names.forEach(function (name) {
        if (saved[name] == null) target.removeAttribute(name);
        else target.setAttribute(name, saved[name]);
      });
    };
  }

  function addFocusRingClass(node) {
    if (node && node.classList) node.classList.add('nui-overlay-focusable');
    return node;
  }

  function setHidden(node, hidden) {
    if (!node) return;
    if (hidden) node.setAttribute('hidden', '');
    else node.removeAttribute('hidden');
  }

  /* ---------------------------------------------------------------- actions */

  function makeFallbackButton(container, label, variant, disabled, handler) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'nui-button nui-button--' + variant;
    button.textContent = label;
    button.disabled = Boolean(disabled);
    button.addEventListener('click', handler);
    container.appendChild(button);
    return button;
  }

  /* 面板操作项的附加类由浮层模块维护；legacy Button.update() 会重写 className，
     因此每次禁用态切换后都要重新补类。 */
  function decorateAction(record) {
    var el = record.el;
    if (!el || !el.classList) return;
    el.classList.add(record.prefix + '__action');
    el.classList.add(record.prefix + '__action--' + record.variant);
    if (record.tone) el.classList.add(record.prefix + '__action--' + record.tone);
    addFocusRingClass(el);
  }

  function buildActions(container, actions, prefix, ctx) {
    var records = [];
    container.replaceChildren();
    if (actions == null) return records;

    var list;
    if (isNode(actions)) list = [actions];
    else if (Array.isArray(actions)) list = actions;
    else list = [actions];

    list.forEach(function (item) {
      if (isNode(item)) {
        if (item.nodeType === 3 || item.nodeType === 11) {
          container.appendChild(item);
        } else {
          item.classList.add('nui-overlay-action-node');
          container.appendChild(item);
        }
        return;
      }
      if (typeof item === 'string' || typeof item === 'number') item = { label: txt(item) };
      if (!item || typeof item !== 'object') return;

      var variant = ['primary', 'secondary', 'quiet'].indexOf(item.variant) >= 0 ? item.variant : 'secondary';
      var tone = item.tone === 'danger' ? 'danger' : (item.tone === 'primary' || item.tone === 'accent' ? 'primary' : '');
      var label = item.label == null ? '' : txt(item.label);
      var ariaLabel = item.ariaLabel == null ? '' : txt(item.ariaLabel);
      var title = item.title == null ? '' : txt(item.title);
      var onClick = typeof item.onClick === 'function' ? item.onClick : null;
      var shouldClose = item.close === true;
      var instance = null;
      var buttonEl = null;
      var handler = function (event) {
        if (!buttonEl || buttonEl.disabled) return;
        var api = {
          el: buttonEl,
          close: function (reason) { ctx.close(reason || 'api'); },
          dialog: ctx.instance(),
          drawer: ctx.instance()
        };
        if (onClick) onClick(event, api);
        if (shouldClose && !event.defaultPrevented) ctx.close(item.reason || 'api');
      };

      if (global.NoteUI && global.NoteUI.Button && typeof global.NoteUI.Button.mount === 'function') {
        /* ariaLabel/title 必须进入 Button 的选项状态，否则 Button.update() 会把
           直接写在元素上的属性清掉。 */
        instance = global.NoteUI.Button.mount(container, {
          label: label,
          variant: variant,
          disabled: Boolean(item.disabled),
          ariaLabel: ariaLabel,
          title: title,
          onClick: handler
        });
        buttonEl = instance.el;
      } else {
        buttonEl = makeFallbackButton(container, label, variant, item.disabled, handler);
      }

      if (item.id) buttonEl.setAttribute('data-action', txt(item.id));
      if (ariaLabel) buttonEl.setAttribute('aria-label', ariaLabel);
      if (title) buttonEl.setAttribute('title', title);

      records.push({
        el: buttonEl,
        instance: instance,
        handler: handler,
        native: !instance,
        prefix: prefix,
        variant: variant,
        tone: tone,
        baseDisabled: Boolean(item.disabled)
      });
      decorateAction(records[records.length - 1]);
    });
    return records;
  }

  function destroyActions(records) {
    records.forEach(function (record) {
      if (record.instance) record.instance.destroy();
      else if (record.el && record.native) record.el.removeEventListener('click', record.handler);
    });
  }

  function setActionsDisabled(records, disabled) {
    records.forEach(function (record) {
      var next = Boolean(disabled || record.baseDisabled);
      if (record.instance && typeof record.instance.update === 'function') {
        record.instance.update({ disabled: next });
        decorateAction(record);
      } else if (record.el) {
        record.el.disabled = next;
        decorateAction(record);
      }
    });
  }

  function closeButton(prefix, label) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = prefix + '__close nui-overlay-focusable';
    button.setAttribute('aria-label', label);
    var glyph = document.createElement('span');
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = '×';
    button.appendChild(glyph);
    return button;
  }

  /* ---------------------------------------------------------------- Tooltip */

  NoteUI.Tooltip = {
    version: VERSION,
    mount: function (host, options) {
      checkHost(host);
      var O = options || {};
      var state = {
        content: O.content,
        label: O.label == null ? '查看说明' : txt(O.label),
        anchor: O.anchor && O.anchor.nodeType === 1 ? O.anchor : null,
        placement: normalizePlacement(O.placement, 'top'),
        delay: normalizeDelay(O.delay, 400),
        focusDelay: normalizeDelay(O.focusDelay, 0),
        hideDelay: normalizeDelay(O.hideDelay, 100),
        disabled: Boolean(O.disabled),
        maxWidth: O.maxWidth == null ? 'min(300px, calc(100vw - 16px))' : normalizeSize(O.maxWidth, 300),
        onShow: typeof O.onShow === 'function' ? O.onShow : null,
        onHide: typeof O.onHide === 'function' ? O.onHide : null
      };

      var root = make('span', 'nui-tooltip');
      var tooltipId = uid('nui-tooltip');
      var trigger = null;
      var ownsTrigger = false;
      var bag = null;
      var layer = null;
      var layerPlacement = null;
      var open = false;
      var destroyed = false;
      var suppress = false;
      var described = false;
      var hovered = false;
      var showTimer = null;
      var hideTimer = null;
      var listeningScroll = false;

      function anchor() { return state.anchor || trigger; }

      if (!state.anchor) {
        ownsTrigger = true;
        trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'nui-tooltip__trigger nui-overlay-focusable';
        trigger.textContent = state.label;
        trigger.disabled = Boolean(state.disabled);
        root.appendChild(trigger);
      }

      function detachDescribedBy() {
        var target = state.anchor || trigger;
        if (!target || !described) return;
        described = false;
        var current = target.getAttribute('aria-describedby') || '';
        var parts = current.split(/\s+/).filter(function (value) { return value && value !== tooltipId; });
        if (parts.length) target.setAttribute('aria-describedby', parts.join(' '));
        else target.removeAttribute('aria-describedby');
      }

      function attachDescribedBy() {
        var target = state.anchor || trigger;
        if (!target || described) return;
        var current = target.getAttribute('aria-describedby');
        if (!current) target.setAttribute('aria-describedby', tooltipId);
        else if (current.split(/\s+/).indexOf(tooltipId) < 0) target.setAttribute('aria-describedby', current + ' ' + tooltipId);
        described = true;
      }

      function onWindowScroll() {
        if (open) hide('outside');
      }

      function startScrollWatch() {
        if (listeningScroll) return;
        listeningScroll = true;
        global.addEventListener('scroll', onWindowScroll, true);
      }

      function stopScrollWatch() {
        if (!listeningScroll) return;
        listeningScroll = false;
        global.removeEventListener('scroll', onWindowScroll, true);
      }

      function clearTimers() {
        if (showTimer != null) { global.clearTimeout(showTimer); showTimer = null; }
        if (hideTimer != null) { global.clearTimeout(hideTimer); hideTimer = null; }
      }

      function ensureLayer() {
        if (layer) return layer;
        layerPlacement = state.placement;
        layer = core().floating.create({
          anchor: anchor(),
          content: state.content,
          placement: state.placement,
          offset: 8,
          role: 'tooltip',
          className: 'nui-tooltip__panel',
          modal: false,
          backdrop: false,
          trapFocus: false,
          returnFocus: false,
          closeOnEsc: true,
          closeOnOutside: true,
          lockScroll: false,
          maxWidth: state.maxWidth,
          onClose: function (reason) {
            open = false;
            stopScrollWatch();
            detachDescribedBy();
            clearTimers();
            if (!suppress && state.onHide) state.onHide(reason);
            suppress = false;
          }
        });
        layer.el.id = tooltipId;
        return layer;
      }

      function showNow() {
        if (destroyed || state.disabled || !anchor() || !anchor().isConnected) return;
        if (layer && layerPlacement !== state.placement) {
          suppress = true;
          layer.destroy();
          layer = null;
          open = false;
          detachDescribedBy();
          suppress = false;
        }
        ensureLayer();
        if (open) return;
        attachDescribedBy();
        startScrollWatch();
        if (typeof layer.isOpen === 'function' && layer.isOpen()) {
          open = true;
          return;
        }
        layer.open();
        if (typeof layer.isOpen === 'function' && !layer.isOpen()) {
          open = false;
          return;
        }
        open = true;
        if (!suppress && state.onShow) state.onShow();
      }

      function hide(reason) {
        clearTimers();
        stopScrollWatch();
        if (!layer || !open) {
          detachDescribedBy();
          return;
        }
        layer.close(reason || 'api', { restoreFocus: false });
      }

      function scheduleShow(delay) {
        if (destroyed || state.disabled) return;
        clearTimers();
        if (delay <= 0) showNow();
        else showTimer = global.setTimeout(function () { showTimer = null; showNow(); }, delay);
      }

      function scheduleHide(delay) {
        clearTimers();
        if (delay <= 0) hide('api');
        else hideTimer = global.setTimeout(function () { hideTimer = null; hide('api'); }, delay);
      }

      bag = bagFor(trigger || state.anchor);
      if (!state.anchor) {
        bag.on('mouseenter', function () { hovered = true; scheduleShow(state.delay); });
        bag.on('mouseleave', function () {
          hovered = false;
          var target = trigger;
          if (target && target.contains(document.activeElement)) return;
          scheduleHide(state.hideDelay);
        });
        bag.on('focusin', function () {
          if (!trigger.contains(document.activeElement)) return;
          scheduleShow(state.focusDelay);
        });
        bag.on('focusout', function (event) {
          if (event.relatedTarget && trigger.contains(event.relatedTarget)) return;
          if (hovered) return;
          scheduleHide(state.hideDelay);
        });
      } else {
        bag.on('mouseenter', function () { hovered = true; scheduleShow(state.delay); });
        bag.on('mouseleave', function () {
          hovered = false;
          if (state.anchor.contains(document.activeElement)) return;
          scheduleHide(state.hideDelay);
        });
        bag.on('focusin', function () {
          if (!state.anchor.contains(document.activeElement)) return;
          scheduleShow(state.focusDelay);
        });
        bag.on('focusout', function (event) {
          if (event.relatedTarget && state.anchor.contains(event.relatedTarget)) return;
          if (hovered) return;
          scheduleHide(state.hideDelay);
        });
      }

      host.appendChild(root);

      var instance = {
        el: root,
        version: VERSION,
        getAnchor: function () { return anchor(); },
        getPanel: function () { return layer ? layer.el : null; },
        isOpen: function () { return open; },
        show: function () {
          if (destroyed || state.disabled) return;
          showNow();
        },
        hide: function () { hide('api'); },
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          var oldPlacement = state.placement;
          var oldMaxWidth = state.maxWidth;
          if (Object.prototype.hasOwnProperty.call(patch, 'content')) state.content = patch.content;
          if (Object.prototype.hasOwnProperty.call(patch, 'delay')) state.delay = normalizeDelay(patch.delay, state.delay);
          if (Object.prototype.hasOwnProperty.call(patch, 'hideDelay')) state.hideDelay = normalizeDelay(patch.hideDelay, state.hideDelay);
          if (Object.prototype.hasOwnProperty.call(patch, 'focusDelay')) state.focusDelay = normalizeDelay(patch.focusDelay, state.focusDelay);
          if (Object.prototype.hasOwnProperty.call(patch, 'onShow')) state.onShow = typeof patch.onShow === 'function' ? patch.onShow : null;
          if (Object.prototype.hasOwnProperty.call(patch, 'onHide')) state.onHide = typeof patch.onHide === 'function' ? patch.onHide : null;
          if (Object.prototype.hasOwnProperty.call(patch, 'label')) {
            state.label = patch.label == null ? '' : txt(patch.label);
            if (ownsTrigger) trigger.textContent = state.label;
          }
          if (Object.prototype.hasOwnProperty.call(patch, 'placement')) state.placement = normalizePlacement(patch.placement, state.placement);
          if (Object.prototype.hasOwnProperty.call(patch, 'maxWidth')) state.maxWidth = normalizeSize(patch.maxWidth, state.maxWidth);
          if (Object.prototype.hasOwnProperty.call(patch, 'disabled')) state.disabled = Boolean(patch.disabled);
          if (Object.prototype.hasOwnProperty.call(patch, 'content') && layer) {
            setContent(layer.el, state.content);
            if (layer.isOpen && layer.isOpen()) layer.reposition();
          }
          if (state.disabled && open) {
            suppress = true;
            hide('api');
            if (!open) suppress = false;
          }
          if (ownsTrigger) trigger.disabled = state.disabled;
          if (layer && (oldPlacement !== state.placement || oldMaxWidth !== state.maxWidth)) {
            var wasOpen = open;
            suppress = true;
            layer.destroy();
            layer = null;
            open = false;
            detachDescribedBy();
            if (wasOpen && !state.disabled) showNow();
            suppress = false;
          }
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          clearTimers();
          stopScrollWatch();
          detachDescribedBy();
          if (bag) { bag.clear(); bag = null; }
          if (layer) { layer.destroy(); layer = null; }
          open = false;
          root.remove();
        }
      };
      return instance;
    }
  };

  /* ---------------------------------------------------------------- Popover */

  NoteUI.Popover = {
    version: VERSION,
    mount: function (host, options) {
      checkHost(host);
      var O = options || {};
      var state = {
        content: O.content,
        triggerLabel: O.triggerLabel == null ? (O.anchor ? '' : '打开') : txt(O.triggerLabel),
        label: O.label == null ? '' : txt(O.label),
        placement: normalizePlacement(O.placement, 'bottom-start'),
        anchor: O.anchor && O.anchor.nodeType === 1 ? O.anchor : null,
        disabled: Boolean(O.disabled),
        maxWidth: O.maxWidth == null ? 'min(360px, calc(100vw - 16px))' : normalizeSize(O.maxWidth, 360),
        onOpen: typeof O.onOpen === 'function' ? O.onOpen : null,
        onClose: typeof O.onClose === 'function' ? O.onClose : null
      };

      var root = make('div', 'nui-popover');
      var panelId = uid('nui-popover');
      var trigger = null;
      var ownsTrigger = false;
      var restoreTriggerAttrs = null;
      var bag = null;
      var layer = null;
      var layerPlacement = null;
      var open = false;
      var destroyed = false;
      var suppress = false;
      var lastCloseReason = '';
      var lastCloseAt = 0;
      var skipTriggerClick = false;
      var skipClickTimer = null;

      function now() {
        return global.performance && typeof global.performance.now === 'function' ? global.performance.now() : Date.now();
      }

      function clearSkipClick() {
        skipTriggerClick = false;
        if (skipClickTimer != null) {
          global.clearTimeout(skipClickTimer);
          skipClickTimer = null;
        }
      }

      if (!state.anchor) {
        ownsTrigger = true;
        trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'nui-popover__trigger nui-overlay-focusable';
        trigger.textContent = state.triggerLabel;
        root.appendChild(trigger);
      } else {
        trigger = state.anchor;
        restoreTriggerAttrs = rememberAttributes(trigger, ['aria-haspopup', 'aria-expanded', 'aria-controls']);
      }

      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', panelId);
      if (ownsTrigger) trigger.disabled = Boolean(state.disabled);

      function setExpanded(value) {
        if (trigger) trigger.setAttribute('aria-expanded', value ? 'true' : 'false');
      }

      function panelLabel() {
        if (state.label) return state.label;
        if (state.triggerLabel) return state.triggerLabel;
        if (!ownsTrigger && trigger) {
          var explicit = trigger.getAttribute('aria-label');
          if (explicit) return explicit;
          var triggerText = txt(trigger.textContent).trim();
          if (triggerText) return triggerText;
        }
        return '弹出内容';
      }

      function ensureLayer() {
        if (layer) return layer;
        layerPlacement = state.placement;
        layer = core().floating.create({
          anchor: trigger,
          content: state.content,
          placement: state.placement,
          offset: 8,
          role: 'dialog',
          className: 'nui-popover__panel',
          modal: false,
          backdrop: false,
          trapFocus: false,
          returnFocus: true,
          closeOnEsc: true,
          closeOnOutside: true,
          lockScroll: false,
          maxWidth: state.maxWidth,
          onClose: function (reason) {
            open = false;
            lastCloseReason = reason;
            lastCloseAt = now();
            setExpanded(false);
            if (!suppress && state.onClose) state.onClose(reason);
            suppress = false;
          }
        });
        layer.el.id = panelId;
        layer.el.setAttribute('aria-label', panelLabel());
        return layer;
      }

      function show() {
        if (destroyed || state.disabled) return;
        if (layer && layerPlacement !== state.placement) {
          suppress = true;
          layer.destroy();
          layer = null;
          open = false;
          suppress = false;
        }
        ensureLayer();
        layer.el.setAttribute('aria-label', panelLabel());
        if (open) return;
        setExpanded(true);
        layer.open();
        if (typeof layer.isOpen === 'function' && !layer.isOpen()) {
          open = false;
          setExpanded(false);
          return;
        }
        open = true;
        if (!suppress && state.onOpen) state.onOpen();
      }

      function close(reason) {
        if (!layer || !open) return;
        layer.close(reason || 'api', { restoreFocus: true });
      }

      function onTriggerPointerDown(event) {
        if (destroyed) return;
        var thisPointerClosedLayer = false;
        if (!open && lastCloseReason === 'outside' && (event.button == null || event.button === 0)) {
          if (isFinite(event.timeStamp) && event.timeStamp > 0) {
            /* Core closes on pointerdown (capture) before this bubble listener.
             * A close from this same event is after event.timeStamp; a later
             * pointerdown has a newer timestamp, so it cannot be mistaken for it. */
            var delta = lastCloseAt - event.timeStamp;
            thisPointerClosedLayer = delta >= -1 && delta < 100;
          } else {
            thisPointerClosedLayer = (now() - lastCloseAt) < 80;
          }
        }
        if (thisPointerClosedLayer) {
          skipTriggerClick = true;
          if (skipClickTimer != null) global.clearTimeout(skipClickTimer);
          skipClickTimer = global.setTimeout(function () {
            skipTriggerClick = false;
            skipClickTimer = null;
          }, 700);
        } else {
          clearSkipClick();
        }
      }

      function onTriggerClick(event) {
        if (destroyed || state.disabled) return;
        if (skipTriggerClick) {
          clearSkipClick();
          return;
        }
        if (open) close('api');
        else show();
      }

      bag = bagFor(trigger);
      bag.on('pointerdown', onTriggerPointerDown);
      bag.on('click', onTriggerClick);

      host.appendChild(root);

      var instance = {
        el: root,
        version: VERSION,
        getTrigger: function () { return trigger; },
        getPanel: function () { return layer ? layer.el : null; },
        isOpen: function () { return open; },
        open: show,
        close: close,
        toggle: function () { if (open) close('api'); else show(); },
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          var oldPlacement = state.placement;
          var oldMaxWidth = state.maxWidth;
          if (Object.prototype.hasOwnProperty.call(patch, 'content')) state.content = patch.content;
          if (Object.prototype.hasOwnProperty.call(patch, 'onOpen')) state.onOpen = typeof patch.onOpen === 'function' ? patch.onOpen : null;
          if (Object.prototype.hasOwnProperty.call(patch, 'onClose')) state.onClose = typeof patch.onClose === 'function' ? patch.onClose : null;
          if (Object.prototype.hasOwnProperty.call(patch, 'triggerLabel')) {
            state.triggerLabel = patch.triggerLabel == null ? '' : txt(patch.triggerLabel);
            if (ownsTrigger) trigger.textContent = state.triggerLabel;
          }
          if (Object.prototype.hasOwnProperty.call(patch, 'label')) state.label = patch.label == null ? '' : txt(patch.label);
          if (Object.prototype.hasOwnProperty.call(patch, 'placement')) state.placement = normalizePlacement(patch.placement, state.placement);
          if (Object.prototype.hasOwnProperty.call(patch, 'maxWidth')) state.maxWidth = normalizeSize(patch.maxWidth, state.maxWidth);
          if (Object.prototype.hasOwnProperty.call(patch, 'disabled')) state.disabled = Boolean(patch.disabled);
          if (layer) {
            layer.el.setAttribute('aria-label', panelLabel());
            if (Object.prototype.hasOwnProperty.call(patch, 'content')) {
              setContent(layer.el, state.content);
              if (layer.isOpen && layer.isOpen()) layer.reposition();
            }
            if (oldMaxWidth !== state.maxWidth) {
              layer.el.style.maxWidth = state.maxWidth;
              if (layer.isOpen && layer.isOpen()) layer.reposition();
            }
            if (oldPlacement !== state.placement && open) {
              var wasOpen = true;
              suppress = true;
              layer.destroy();
              layer = null;
              open = false;
              setExpanded(false);
              if (wasOpen && !state.disabled) show();
              suppress = false;
            }
          }
          if (state.disabled && open) {
            suppress = true;
            close('api');
            if (!open) suppress = false;
          }
          if (ownsTrigger) trigger.disabled = state.disabled;
          if (Object.prototype.hasOwnProperty.call(patch, 'open') && !state.disabled) {
            if (patch.open && !open) show();
            else if (!patch.open && open) {
              suppress = true;
              close('api');
              suppress = false;
            }
          }
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          clearSkipClick();
          if (bag) { bag.clear(); bag = null; }
          if (layer) { layer.destroy(); layer = null; }
          open = false;
          if (ownsTrigger) {
            if (trigger) trigger.remove();
          } else if (restoreTriggerAttrs) {
            restoreTriggerAttrs();
            restoreTriggerAttrs = null;
          }
          root.remove();
        }
      };
      if (O.open) show();
      return instance;
    }
  };

  /* ------------------------------------------------------------- Dialog/Drawer */

  function buildTitle(prefix, title, showClose, closeLabel, onCloseClick) {
    var header = make('div', prefix + '__header');
    var titleEl = make('h2', prefix + '__title');
    var closeEl = showClose ? closeButton(prefix, closeLabel) : null;
    if (closeEl) closeEl.addEventListener('click', onCloseClick);
    header.appendChild(titleEl);
    if (closeEl) header.appendChild(closeEl);
    setContent(titleEl, title);
    setHidden(header, !hasContent(title) && !showClose);
    setHidden(titleEl, !hasContent(title));
    return { header: header, title: titleEl, close: closeEl };
  }

  function applyModalAria(el, modal) {
    if (!el) return;
    if (modal) el.setAttribute('aria-modal', 'true');
    else el.removeAttribute('aria-modal');
  }

  function dialogDescribe(state) {
    if (!hasContent(state.content)) return false;
    if (state.describeContent === false) return false;
    if (state.describeContent === true) return true;
    return typeof state.content === 'string';
  }

  NoteUI.Dialog = {
    version: VERSION,
    mount: function (host, options) {
      checkHost(host);
      var O = options || {};
      var state = {
        title: O.title,
        content: O.content,
        actions: O.actions,
        size: O.size == null ? 'md' : O.size,
        modal: O.modal !== false,
        closeOnOutside: O.closeOnOutside === true,
        closeOnEsc: O.closeOnEsc !== false,
        label: O.label == null ? '对话框' : txt(O.label),
        showClose: O.showClose !== false,
        describeContent: O.describeContent,
        className: addUserClass(O.className),
        onClose: typeof O.onClose === 'function' ? O.onClose : null,
        onOpen: typeof O.onOpen === 'function' ? O.onOpen : null
      };

      var root = make('div', 'nui-dialog');
      var layer = null;
      var layerPolicy = '';
      var layerModal = state.modal;
      var open = false;
      var destroyed = false;
      var suppress = false;
      var titleId = null;
      var contentId = null;
      var parts = null;
      var actionsRow = null;
      var actionRecords = [];
      var footer = null;

      function policyKey() {
        return [state.modal, state.closeOnOutside, state.closeOnEsc].join('|');
      }

      function resolvedSize() { return sizeFor(state.size); }

      function applySize() {
        if (!layer) return;
        var resolved = resolvedSize();
        layer.el.classList.remove('nui-dialog__panel--sm', 'nui-dialog__panel--md', 'nui-dialog__panel--lg');
        if (typeof state.size === 'string' && SIZES[state.size]) {
          layer.el.classList.add('nui-dialog__panel--' + state.size);
          layer.el.style.width = '';
        } else {
          layer.el.style.width = 'min(' + resolved + ', calc(100vw - 32px))';
        }
        layer.el.style.maxWidth = resolved;
      }

      function renderActions() {
        destroyActions(actionRecords);
        actionRecords = [];
        if (!footer) return;
        footer.replaceChildren();
        actionsRow = null;
        if (state.actions == null || (Array.isArray(state.actions) && !state.actions.length)) {
          setHidden(footer, true);
          return;
        }
        setHidden(footer, false);
        actionsRow = make('div', 'nui-dialog__actions');
        footer.appendChild(actionsRow);
        actionRecords = buildActions(actionsRow, state.actions, 'nui-dialog', {
          close: function (reason) { close(reason); },
          instance: function () { return instance; }
        });
        if (!actionsRow.childNodes.length) setHidden(footer, true);
      }

      function syncAria() {
        if (!layer) return;
        var hasTitle = hasContent(state.title);
        if (hasTitle) {
          layer.el.setAttribute('aria-labelledby', titleId);
          layer.el.removeAttribute('aria-label');
        } else {
          layer.el.removeAttribute('aria-labelledby');
          layer.el.setAttribute('aria-label', state.label || '对话框');
        }
        if (dialogDescribe(state)) layer.el.setAttribute('aria-describedby', contentId);
        else layer.el.removeAttribute('aria-describedby');
        applyModalAria(layer.el, layerModal);
      }

      function ensureLayer() {
        var nextPolicy = policyKey();
        if (layer && layerPolicy !== nextPolicy) {
          destroyActions(actionRecords);
          actionRecords = [];
          layer.destroy();
          layer = null;
          parts = null;
        }
        if (layer) return layer;

        titleId = uid('nui-dialog-title');
        contentId = uid('nui-dialog-content');
        var fragment = document.createDocumentFragment();
        var titleParts = buildTitle('nui-dialog', state.title, state.showClose, '关闭对话框', function () {
          close('api');
        });
        var contentEl = make('div', 'nui-dialog__content');
        contentEl.id = contentId;
        footer = make('div', 'nui-dialog__footer');
        fragment.appendChild(titleParts.header);
        fragment.appendChild(contentEl);
        fragment.appendChild(footer);

        layerPolicy = nextPolicy;
        layerModal = state.modal;
        layer = core().floating.create({
          anchor: null,
          content: fragment,
          placement: 'auto',
          role: 'dialog',
          className: 'nui-dialog__panel' + (typeof state.size === 'string' && SIZES[state.size] ? ' nui-dialog__panel--' + state.size : '') + state.className,
          modal: true,
          backdrop: state.modal,
          trapFocus: state.modal,
          returnFocus: true,
          closeOnEsc: state.closeOnEsc,
          closeOnOutside: state.closeOnOutside,
          lockScroll: state.modal,
          maxWidth: resolvedSize(),
          onClose: function (reason) {
            open = false;
            if (!suppress && state.onClose) state.onClose(reason);
            suppress = false;
          }
        });
        layer.el.id = uid('nui-dialog-panel');
        layer.el.setAttribute('aria-labelledby', titleId);
        parts = { header: titleParts.header, title: titleParts.title, close: titleParts.close, content: contentEl, footer: footer };
        parts.title.id = titleId;
        setContent(contentEl, state.content);
        applySize();
        renderActions();
        syncAria();
        return layer;
      }

      function openDialog() {
        if (destroyed || open) return;
        ensureLayer();
        open = true;
        layer.open();
        if (typeof layer.isOpen === 'function' && !layer.isOpen()) {
          open = false;
          return;
        }
        if (!suppress && state.onOpen) state.onOpen();
      }

      function close(reason) {
        if (destroyed || !layer || !open) return;
        layer.close(reason || 'api', { restoreFocus: true });
      }

      host.appendChild(root);

      var instance = {
        el: root,
        version: VERSION,
        getPanel: function () { return layer ? layer.el : null; },
        isOpen: function () { return open; },
        open: openDialog,
        close: close,
        setActionsDisabled: function (disabled) { setActionsDisabled(actionRecords, disabled); },
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          if (Object.prototype.hasOwnProperty.call(patch, 'onClose')) state.onClose = typeof patch.onClose === 'function' ? patch.onClose : null;
          if (Object.prototype.hasOwnProperty.call(patch, 'onOpen')) state.onOpen = typeof patch.onOpen === 'function' ? patch.onOpen : null;
          if (Object.prototype.hasOwnProperty.call(patch, 'label')) state.label = patch.label == null ? '对话框' : txt(patch.label);
          if (Object.prototype.hasOwnProperty.call(patch, 'modal')) state.modal = patch.modal !== false;
          if (Object.prototype.hasOwnProperty.call(patch, 'closeOnOutside')) state.closeOnOutside = patch.closeOnOutside === true;
          if (Object.prototype.hasOwnProperty.call(patch, 'closeOnEsc')) state.closeOnEsc = patch.closeOnEsc !== false;
          if (Object.prototype.hasOwnProperty.call(patch, 'showClose')) state.showClose = patch.showClose !== false;
          if (Object.prototype.hasOwnProperty.call(patch, 'describeContent')) state.describeContent = patch.describeContent;
          if (Object.prototype.hasOwnProperty.call(patch, 'size')) state.size = patch.size == null ? 'md' : patch.size;

          if (layer) {
            if (Object.prototype.hasOwnProperty.call(patch, 'title') || Object.prototype.hasOwnProperty.call(patch, 'showClose')) {
              if (Object.prototype.hasOwnProperty.call(patch, 'title')) state.title = patch.title;
              var titleParts = buildTitle('nui-dialog', state.title, state.showClose, '关闭对话框', function () { close('api'); });
              titleParts.title.id = titleId;
              parts.header.replaceWith(titleParts.header);
              parts.header = titleParts.header;
              parts.title = titleParts.title;
              parts.close = titleParts.close;
            }
            if (Object.prototype.hasOwnProperty.call(patch, 'content')) {
              state.content = patch.content;
              setContent(parts.content, state.content);
            }
            if (Object.prototype.hasOwnProperty.call(patch, 'actions')) {
              state.actions = patch.actions;
              renderActions();
            }
            if (Object.prototype.hasOwnProperty.call(patch, 'size')) applySize();
            syncAria();
            if (open && layer.isOpen && layer.isOpen()) layer.reposition();
          } else {
            if (Object.prototype.hasOwnProperty.call(patch, 'title')) state.title = patch.title;
            if (Object.prototype.hasOwnProperty.call(patch, 'content')) state.content = patch.content;
            if (Object.prototype.hasOwnProperty.call(patch, 'actions')) state.actions = patch.actions;
          }

          if (Object.prototype.hasOwnProperty.call(patch, 'open')) {
            if (patch.open && !open) openDialog();
            else if (!patch.open && open) {
              suppress = true;
              close('api');
              suppress = false;
            }
          }
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          destroyActions(actionRecords);
          actionRecords = [];
          if (layer) { layer.destroy(); layer = null; }
          open = false;
          root.remove();
        }
      };

      if (Boolean(O.open)) openDialog();
      return instance;
    },
    confirm: function (options) {
      var O = options || {};
      var settled = false;
      var confirmed = false;
      var busy = false;
      var resolvePromise = null;
      var dialog = null;
      var promise = new Promise(function (resolve) { resolvePromise = resolve; });

      function finish(value) {
        if (settled) return;
        settled = true;
        resolvePromise(value);
        /* core has already removed the layer and restored focus before onClose.
         * Destroy the host marker synchronously so no empty node stays in body. */
        if (dialog) dialog.destroy();
      }

      dialog = NoteUI.Dialog.mount(document.body, {
        open: true,
        title: O.title == null ? '请确认' : O.title,
        content: O.content,
        size: O.size == null ? 'sm' : O.size,
        label: O.label == null ? '确认对话框' : O.label,
        showClose: false,
        describeContent: true,
        modal: true,
        closeOnOutside: false,
        closeOnEsc: true,
        actions: [
          {
            label: O.cancelLabel == null ? '取消' : O.cancelLabel,
            variant: 'secondary',
            id: 'cancel',
            onClick: function () {
              if (busy) return;
              confirmed = false;
              dialog.close('api');
            }
          },
          {
            label: O.confirmLabel == null ? '确认' : O.confirmLabel,
            variant: 'primary',
            id: 'confirm',
            tone: O.tone === 'danger' ? 'danger' : (O.tone === 'primary' || O.tone === 'accent' ? 'primary' : ''),
            onClick: function () {
              if (busy || settled) return;
              busy = true;
              dialog.setActionsDisabled(true);
              var result;
              try {
                result = typeof O.onConfirm === 'function' ? O.onConfirm() : true;
              } catch (error) {
                busy = false;
                if (!settled) dialog.setActionsDisabled(false);
                if (global.console && global.console.error) global.console.error('NoteUI.Dialog.confirm onConfirm 失败：', error);
                return;
              }
              Promise.resolve(result).then(function (value) {
                if (settled) return;
                if (value === false) {
                  busy = false;
                  dialog.setActionsDisabled(false);
                  return;
                }
                confirmed = true;
                dialog.close('api');
              }, function (error) {
                busy = false;
                if (!settled) dialog.setActionsDisabled(false);
                if (global.console && global.console.error) global.console.error('NoteUI.Dialog.confirm onConfirm 失败：', error);
              });
            }
          }
        ],
        onClose: function () {
          finish(confirmed);
        }
      });
      return promise;
    }
  };

  /* ---------------------------------------------------------------- Drawer */

  NoteUI.Drawer = {
    version: VERSION,
    mount: function (host, options) {
      checkHost(host);
      var O = options || {};
      var state = {
        side: O.side === 'left' ? 'left' : 'right',
        title: O.title,
        content: O.content,
        actions: O.actions,
        footer: O.footer,
        size: O.size == null ? 420 : O.size,
        closeOnOutside: O.closeOnOutside === true,
        closeOnEsc: O.closeOnEsc !== false,
        label: O.label == null ? '侧边抽屉' : txt(O.label),
        showClose: O.showClose !== false,
        className: addUserClass(O.className),
        onClose: typeof O.onClose === 'function' ? O.onClose : null,
        onOpen: typeof O.onOpen === 'function' ? O.onOpen : null
      };

      var root = make('div', 'nui-drawer');
      var anchorEl = make('span', 'nui-drawer__anchor nui-drawer__anchor--' + state.side);
      anchorEl.setAttribute('aria-hidden', 'true');
      root.appendChild(anchorEl);

      var layer = null;
      var layerSide = null;
      var layerPolicy = '';
      var open = false;
      var destroyed = false;
      var suppress = false;
      var titleId = null;
      var parts = null;
      var actionRecords = [];
      var footerEl = null;
      var footerContent = null;
      var actionsRow = null;

      function resolvedWidth() {
        return typeof state.size === 'number' && isFinite(state.size) && state.size > 0
          ? state.size + 'px'
          : (typeof state.size === 'string' && state.size.trim() ? state.size.trim() : '420px');
      }

      function syncAnchor() {
        anchorEl.classList.remove('nui-drawer__anchor--left', 'nui-drawer__anchor--right');
        anchorEl.classList.add('nui-drawer__anchor--' + state.side);
      }

      function renderActions() {
        destroyActions(actionRecords);
        actionRecords = [];
        if (!actionsRow) return;
        actionsRow.replaceChildren();
        if (state.actions == null || (Array.isArray(state.actions) && !state.actions.length)) {
          setHidden(actionsRow, true);
          return;
        }
        setHidden(actionsRow, false);
        actionRecords = buildActions(actionsRow, state.actions, 'nui-drawer', {
          close: function (reason) { close(reason); },
          instance: function () { return instance; }
        });
        if (!actionsRow.childNodes.length) setHidden(actionsRow, true);
      }

      function renderFooter() {
        if (!footerContent || !actionsRow || !footerEl) return;
        setContent(footerContent, state.footer);
        setHidden(footerContent, !hasContent(state.footer));
        renderActions();
        var noFooter = !hasContent(state.footer) && (!actionsRow || actionsRow.hidden || !actionsRow.childNodes.length);
        setHidden(footerEl, noFooter);
      }

      function syncAria() {
        if (!layer) return;
        var hasTitle = hasContent(state.title);
        if (hasTitle) {
          layer.el.setAttribute('aria-labelledby', titleId);
          layer.el.removeAttribute('aria-label');
        } else {
          layer.el.removeAttribute('aria-labelledby');
          layer.el.setAttribute('aria-label', state.label || '侧边抽屉');
        }
        layer.el.setAttribute('aria-modal', 'true');
      }

      function ensureLayer() {
        var nextPolicy = String(state.closeOnOutside) + '|' + String(state.closeOnEsc);
        if (layer && (layerSide !== state.side || layerPolicy !== nextPolicy)) {
          destroyActions(actionRecords);
          actionRecords = [];
          layer.destroy();
          layer = null;
          parts = null;
          footerEl = footerContent = actionsRow = null;
        }
        if (layer) return layer;

        titleId = uid('nui-drawer-title');
        var titleParts = buildTitle('nui-drawer', state.title, state.showClose, '关闭抽屉', function () { close('api'); });
        var contentEl = make('div', 'nui-drawer__content');
        footerEl = make('div', 'nui-drawer__footer');
        footerContent = make('div', 'nui-drawer__footer-content');
        actionsRow = make('div', 'nui-drawer__actions');
        footerEl.appendChild(footerContent);
        footerEl.appendChild(actionsRow);

        var fragment = document.createDocumentFragment();
        fragment.appendChild(titleParts.header);
        fragment.appendChild(contentEl);
        fragment.appendChild(footerEl);

        layerSide = state.side;
        layerPolicy = nextPolicy;
        layer = core().floating.create({
          anchor: anchorEl,
          content: fragment,
          placement: state.side === 'left' ? 'right-start' : 'left-start',
          offset: 0,
          role: 'dialog',
          className: 'nui-drawer__panel nui-drawer__panel--' + state.side + state.className,
          modal: true,
          backdrop: true,
          trapFocus: true,
          returnFocus: true,
          closeOnEsc: state.closeOnEsc,
          closeOnOutside: state.closeOnOutside,
          lockScroll: true,
          maxWidth: 'calc(100vw - 16px)',
          onClose: function (reason) {
            open = false;
            if (!suppress && state.onClose) state.onClose(reason);
            suppress = false;
          }
        });
        layer.el.id = uid('nui-drawer-panel');
        layer.el.style.width = 'min(' + resolvedWidth() + ', calc(100vw - 16px))';
        layer.el.style.maxWidth = 'calc(100vw - 16px)';
        layer.el.setAttribute('aria-labelledby', titleId);
        parts = { header: titleParts.header, title: titleParts.title, close: titleParts.close, content: contentEl, footer: footerEl };
        parts.title.id = titleId;
        setContent(contentEl, state.content);
        renderFooter();
        syncAria();
        return layer;
      }

      function openDrawer() {
        if (destroyed || open) return;
        syncAnchor();
        ensureLayer();
        open = true;
        layer.open();
        if (typeof layer.isOpen === 'function' && !layer.isOpen()) {
          open = false;
          return;
        }
        if (!suppress && state.onOpen) state.onOpen();
      }

      function close(reason) {
        if (destroyed || !layer || !open) return;
        layer.close(reason || 'api', { restoreFocus: true });
      }

      host.appendChild(root);

      var instance = {
        el: root,
        version: VERSION,
        getPanel: function () { return layer ? layer.el : null; },
        getSide: function () { return open && layerSide ? layerSide : state.side; },
        isOpen: function () { return open; },
        open: openDrawer,
        close: close,
        setActionsDisabled: function (disabled) { setActionsDisabled(actionRecords, disabled); },
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          if (Object.prototype.hasOwnProperty.call(patch, 'onClose')) state.onClose = typeof patch.onClose === 'function' ? patch.onClose : null;
          if (Object.prototype.hasOwnProperty.call(patch, 'onOpen')) state.onOpen = typeof patch.onOpen === 'function' ? patch.onOpen : null;
          if (Object.prototype.hasOwnProperty.call(patch, 'label')) state.label = patch.label == null ? '侧边抽屉' : txt(patch.label);
          if (Object.prototype.hasOwnProperty.call(patch, 'closeOnOutside')) state.closeOnOutside = patch.closeOnOutside === true;
          if (Object.prototype.hasOwnProperty.call(patch, 'closeOnEsc')) state.closeOnEsc = patch.closeOnEsc !== false;
          if (Object.prototype.hasOwnProperty.call(patch, 'showClose')) state.showClose = patch.showClose !== false;
          if (Object.prototype.hasOwnProperty.call(patch, 'side')) state.side = patch.side === 'left' ? 'left' : 'right';
          if (Object.prototype.hasOwnProperty.call(patch, 'size')) state.size = patch.size == null ? 420 : patch.size;
          if (!open) syncAnchor();

          if (layer) {
            if (Object.prototype.hasOwnProperty.call(patch, 'title') || Object.prototype.hasOwnProperty.call(patch, 'showClose')) {
              if (Object.prototype.hasOwnProperty.call(patch, 'title')) state.title = patch.title;
              var titleParts = buildTitle('nui-drawer', state.title, state.showClose, '关闭抽屉', function () { close('api'); });
              titleParts.title.id = titleId;
              parts.header.replaceWith(titleParts.header);
              parts.header = titleParts.header;
              parts.title = titleParts.title;
              parts.close = titleParts.close;
            }
            if (Object.prototype.hasOwnProperty.call(patch, 'content')) {
              state.content = patch.content;
              setContent(parts.content, state.content);
            }
            if (Object.prototype.hasOwnProperty.call(patch, 'actions')) state.actions = patch.actions;
            if (Object.prototype.hasOwnProperty.call(patch, 'footer')) state.footer = patch.footer;
            if (Object.prototype.hasOwnProperty.call(patch, 'actions') || Object.prototype.hasOwnProperty.call(patch, 'footer')) renderFooter();
            if (Object.prototype.hasOwnProperty.call(patch, 'size')) {
              layer.el.style.width = 'min(' + resolvedWidth() + ', calc(100vw - 16px))';
              layer.el.style.maxWidth = 'calc(100vw - 16px)';
            }
            syncAria();
            if (open && layer.isOpen && layer.isOpen()) layer.reposition();
          } else {
            if (Object.prototype.hasOwnProperty.call(patch, 'title')) state.title = patch.title;
            if (Object.prototype.hasOwnProperty.call(patch, 'content')) state.content = patch.content;
            if (Object.prototype.hasOwnProperty.call(patch, 'actions')) state.actions = patch.actions;
            if (Object.prototype.hasOwnProperty.call(patch, 'footer')) state.footer = patch.footer;
          }

          if (Object.prototype.hasOwnProperty.call(patch, 'open')) {
            if (patch.open && !open) openDrawer();
            else if (!patch.open && open) {
              suppress = true;
              close('api');
              suppress = false;
            }
          }
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          destroyActions(actionRecords);
          actionRecords = [];
          if (layer) { layer.destroy(); layer = null; }
          open = false;
          root.remove();
        }
      };

      if (Boolean(O.open)) openDrawer();
      return instance;
    }
  };
})(window);
