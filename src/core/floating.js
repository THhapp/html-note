/* NoteCore floating — one stacking context for popovers, tooltips and dialogs.
   Scope: NoteCore.floating. Depends on: core.js, tokens.css, base.css.
   The layer owns positioning, dismiss behaviour, focus trap/restore and scroll lock. */
(function (global) {
  'use strict';

  var NoteCore = global.NoteCore = global.NoteCore || {};
  var stack = [];
  var listening = false;
  var resizeObserver = null;
  var mutationObserver = null;
  var scrollLockCount = 0;
  var scrollLockSnapshot = null;
  var EDGE = 8;
  var SIDES = ['top', 'bottom', 'left', 'right'];
  var OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

  function connected(element) {
    if (!element) return false;
    if (typeof element.isConnected === 'boolean') return element.isConnected;
    return !!(document.documentElement && document.documentElement.contains(element));
  }

  function focusNode(node) {
    if (!node || !connected(node) || typeof node.focus !== 'function') return false;
    try {
      node.focus({ preventScroll: true });
      return document.activeElement === node || node.contains(document.activeElement);
    } catch (error) {
      try {
        node.focus();
        return document.activeElement === node || node.contains(document.activeElement);
      } catch (ignored) {
        return false;
      }
    }
  }

  function viewportBox() {
    var root = document.documentElement;
    return {
      width: (root && root.clientWidth) || global.innerWidth || 0,
      height: global.innerHeight || (root && root.clientHeight) || 0
    };
  }

  function roundPosition(value) {
    return String(Math.round(value * 1000) / 1000);
  }

  function clampAxis(value, min, max) {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
  }

  function parsePlacement(value) {
    var raw = value == null ? 'bottom-start' : String(value);
    if (raw === 'auto') return { auto: true, side: 'bottom', align: 'start' };
    var parts = raw.split('-');
    var side = parts[0];
    var align = parts[1] || 'center';
    if (SIDES.indexOf(side) < 0) {
      side = 'bottom';
      align = 'start';
    }
    if (align !== 'start' && align !== 'end') align = 'center';
    return { auto: false, side: side, align: align };
  }

  function placementName(side, align) {
    return side + (align === 'center' ? '' : '-' + align);
  }

  function anchorAvailable(anchor) {
    if (!anchor || anchor.nodeType !== 1 || !connected(anchor)) return false;
    var rects;
    try { rects = anchor.getClientRects(); } catch (error) { return false; }
    if (!rects || !rects.length) return false;
    var style;
    try { style = global.getComputedStyle(anchor); } catch (error) { style = null; }
    if (style) {
      if (style.display === 'none' || style.display === 'contents') return false;
      if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    }
    return true;
  }

  function anchorRect(anchor) {
    if (!anchorAvailable(anchor)) return null;
    try { return anchor.getBoundingClientRect(); } catch (error) { return null; }
  }

  function baseZIndex() {
    var host = document.body || document.documentElement;
    var raw = '';
    try {
      if (host) raw = global.getComputedStyle(host).getPropertyValue('--hnv-z-float');
    } catch (error) {}
    var value = parseInt(raw, 10);
    return isFinite(value) ? value : 1000;
  }

  function applyStackZ() {
    var base = baseZIndex();
    stack.forEach(function (layer, index) {
      layer.root.style.zIndex = String(base + index);
    });
  }

  function lockScroll() {
    if (scrollLockCount === 0) {
      var body = document.body;
      if (body) {
        var gap = (global.innerWidth || 0) - (document.documentElement.clientWidth || 0);
        var padding = 0;
        try {
          padding = parseFloat(global.getComputedStyle(body).paddingRight) || 0;
        } catch (error) {}
        scrollLockSnapshot = {
          body: body,
          overflow: body.style.overflow,
          paddingRight: body.style.paddingRight
        };
        body.style.overflow = 'hidden';
        if (gap > 0) body.style.paddingRight = (padding + gap) + 'px';
      }
    }
    scrollLockCount += 1;
  }

  function unlockScroll() {
    if (scrollLockCount <= 0) return;
    scrollLockCount -= 1;
    if (scrollLockCount > 0) return;
    if (scrollLockSnapshot) {
      var body = scrollLockSnapshot.body;
      body.style.overflow = scrollLockSnapshot.overflow;
      body.style.paddingRight = scrollLockSnapshot.paddingRight;
      scrollLockSnapshot = null;
    }
  }

  function panelSize(panel) {
    var rect = panel.getBoundingClientRect();
    return {
      width: rect.width || panel.offsetWidth || 0,
      height: rect.height || panel.offsetHeight || 0
    };
  }

  function sideSpace(side, anchor, offset, viewport) {
    if (side === 'top') return anchor.top - offset - EDGE;
    if (side === 'bottom') return viewport.height - EDGE - (anchor.bottom + offset);
    if (side === 'left') return anchor.left - offset - EDGE;
    return viewport.width - EDGE - (anchor.right + offset);
  }

  function neededSpace(side, size) {
    return side === 'top' || side === 'bottom' ? size.height : size.width;
  }

  function chooseSide(side, align, auto, anchor, size, offset, viewport) {
    if (auto) {
      var candidates = ['bottom', 'top', 'right', 'left'];
      var bestSide = candidates[0];
      var bestScore = -Infinity;
      candidates.forEach(function (candidate) {
        var score = sideSpace(candidate, anchor, offset, viewport) - neededSpace(candidate, size);
        if (score > bestScore) {
          bestScore = score;
          bestSide = candidate;
        }
      });
      return { side: bestSide, align: 'start' };
    }
    var available = sideSpace(side, anchor, offset, viewport);
    var opposite = OPPOSITE[side];
    var oppositeAvailable = sideSpace(opposite, anchor, offset, viewport);
    if (available < neededSpace(side, size) && oppositeAvailable > available) {
      return { side: opposite, align: align };
    }
    return { side: side, align: align };
  }

  function desiredPosition(side, align, anchor, size, offset) {
    var left = 0;
    var top = 0;
    if (side === 'top') top = anchor.top - offset - size.height;
    else if (side === 'bottom') top = anchor.bottom + offset;
    else if (side === 'left') left = anchor.left - offset - size.width;
    else if (side === 'right') left = anchor.right + offset;

    if (side === 'top' || side === 'bottom') {
      if (align === 'start') left = anchor.left;
      else if (align === 'end') left = anchor.right - size.width;
      else left = anchor.left + (anchor.width - size.width) / 2;
    } else {
      if (align === 'start') top = anchor.top;
      else if (align === 'end') top = anchor.bottom - size.height;
      else top = anchor.top + (anchor.height - size.height) / 2;
    }
    return { left: left, top: top };
  }

  function positionLayer(layer) {
    if (!layer || !layer._open || layer.destroyed) return;
    var anchor = layer._anchor;
    var anchorBounds = null;
    if (anchor) {
      anchorBounds = anchorRect(anchor);
      if (!anchorBounds) {
        layer.close('anchor-removed');
        return;
      }
    }

    var viewport = viewportBox();
    if (layer._matchAnchorWidth && anchorBounds) {
      var anchorWidth = Math.max(0, anchorBounds.width);
      var widthValue = roundPosition(anchorWidth) + 'px';
      if (layer.el.style.width !== widthValue) layer.el.style.width = widthValue;
    }

    var size = panelSize(layer.el);
    var left;
    var top;
    var actual;
    if (!anchorBounds) {
      left = (viewport.width - size.width) / 2;
      top = (viewport.height - size.height) / 2;
      actual = 'center';
    } else {
      var choice = chooseSide(layer._placement.side, layer._placement.align,
        layer._placement.auto, anchorBounds, size, layer._offset, viewport);
      var position = desiredPosition(choice.side, choice.align, anchorBounds, size, layer._offset);
      left = position.left;
      top = position.top;
      actual = placementName(choice.side, choice.align);
    }

    left = clampAxis(left, EDGE, viewport.width - EDGE - size.width);
    top = clampAxis(top, EDGE, viewport.height - EDGE - size.height);
    layer.root.style.left = roundPosition(left) + 'px';
    layer.root.style.top = roundPosition(top) + 'px';
    layer.root.setAttribute('data-placement', actual);
    layer.el.setAttribute('data-placement', actual);
  }

  function restorePanelTabIndex(layer) {
    if (!layer._tabIndexTouched) return;
    if (layer._originalTabIndex == null) {
      if (layer.el.getAttribute('tabindex') === '-1') layer.el.removeAttribute('tabindex');
    } else {
      layer.el.setAttribute('tabindex', layer._originalTabIndex);
    }
    layer._tabIndexTouched = false;
    layer._originalTabIndex = null;
  }

  function ensurePanelFocusable(layer) {
    if (!layer._tabIndexTouched) {
      layer._originalTabIndex = layer.el.hasAttribute('tabindex') ?
        layer.el.getAttribute('tabindex') : null;
      layer._tabIndexTouched = true;
    }
    layer.el.setAttribute('tabindex', '-1');
  }

  function focusLayer(layer) {
    var items = NoteCore.focusables(layer.el);
    if (items.length) {
      if (focusNode(items[0])) return;
    }
    ensurePanelFocusable(layer);
    focusNode(layer.el);
  }

  function shouldRestoreFocus(layer, activeAtClose, wasTop) {
    if (!layer._returnFocus) return false;
    if (!layer._opener || !connected(layer._opener) || typeof layer._opener.focus !== 'function') return false;
    var activeInside = !!(activeAtClose && layer.el.contains(activeAtClose));
    if (layer._trapFocus) return wasTop || activeInside;
    return activeInside;
  }

  function closeLayer(layer, reason, options) {
    if (!layer || !layer._open) return layer;
    var activeAtClose = document.activeElement;
    var wasTop = stack[stack.length - 1] === layer;
    var restoreAllowed = !options || options.restoreFocus !== false;
    var restore = restoreAllowed && shouldRestoreFocus(layer, activeAtClose, wasTop);

    layer._open = false;
    var index = stack.indexOf(layer);
    if (index >= 0) stack.splice(index, 1);
    if (layer.root.parentNode) layer.root.parentNode.removeChild(layer.root);
    if (layer._locked) {
      layer._locked = false;
      unlockScroll();
    }
    restorePanelTabIndex(layer);
    applyStackZ();
    if (!stack.length) stopListening();
    else unobserveLayer(layer);
    if (restore) focusNode(layer._opener);
    if (typeof layer._onClose === 'function') layer._onClose(reason);
    return layer;
  }

  function handleKeydown(event) {
    var layer = stack[stack.length - 1];
    if (!layer || !layer._open || event.isComposing) return;
    var key = event.key;
    if (key === 'Escape' || key === 'Esc' || event.keyCode === 27) {
      if (!layer._closeOnEsc) return;
      event.preventDefault();
      layer.close('esc');
      return;
    }
    if (key !== 'Tab') return;
    var tabTrap = layer._trapFocus ? layer : null;
    if (!tabTrap) {
      for (var index = stack.length - 2; index >= 0; index -= 1) {
        if (stack[index] && stack[index]._open && stack[index]._trapFocus) {
          tabTrap = stack[index];
          break;
        }
      }
    }
    if (!tabTrap) return;
    constrainTab(event, tabTrap);
  }

  function constrainTab(event, layer) {
    var items = NoteCore.focusables(layer.el);
    var active = document.activeElement;
    if (!items.length) {
      event.preventDefault();
      ensurePanelFocusable(layer);
      focusNode(layer.el);
      return;
    }
    var first = items[0];
    var last = items[items.length - 1];
    var activeIndex = items.indexOf(active);
    var inside = !!(active && layer.el.contains(active));
    if (event.shiftKey) {
      if (!inside || active === layer.el || activeIndex <= 0) {
        event.preventDefault();
        focusNode(last);
      }
    } else if (!inside || active === layer.el || activeIndex < 0 || active === last) {
      event.preventDefault();
      focusNode(first);
    }
  }

  function handlePointerDown(event) {
    var layer = stack[stack.length - 1];
    if (!layer || !layer._open || !layer._closeOnOutside) return;
    var target = event.target;
    if (target && (target === layer.el || layer.el.contains(target))) return;
    layer.close('outside');
  }

  function repositionAll() {
    stack.slice().forEach(function (layer) {
      if (layer._open) positionLayer(layer);
    });
  }

  function handleMutations() {
    if (!stack.length) return;
    stack.slice().forEach(function (layer) {
      if (!layer._open || !layer._anchor) return;
      if (!anchorAvailable(layer._anchor)) layer.close('anchor-removed');
    });
  }

  function handleResize() {
    repositionAll();
  }

  function observeLayer(layer) {
    if (!resizeObserver) return;
    try {
      resizeObserver.observe(layer.el);
      if (layer._anchor) resizeObserver.observe(layer._anchor);
    } catch (error) {}
  }

  function unobserveLayer(layer) {
    if (!resizeObserver || !layer) return;
    try {
      resizeObserver.unobserve(layer.el);
      if (layer._anchor) resizeObserver.unobserve(layer._anchor);
    } catch (error) {}
    /* The observer is shared by the whole stack: re-observe targets that other
       open layers still depend on (observe() is idempotent). */
    stack.forEach(function (other) {
      if (other && other !== layer && other._open) observeLayer(other);
    });
  }

  function startListening(layer) {
    if (listening) {
      observeLayer(layer);
      return;
    }
    listening = true;
    document.addEventListener('keydown', handleKeydown, true);
    document.addEventListener('pointerdown', handlePointerDown, true);
    global.addEventListener('scroll', repositionAll, true);
    global.addEventListener('resize', handleResize);
    if (typeof global.ResizeObserver === 'function') {
      try { resizeObserver = new global.ResizeObserver(repositionAll); } catch (error) { resizeObserver = null; }
    }
    if (typeof global.MutationObserver === 'function' && document.documentElement) {
      try {
        mutationObserver = new global.MutationObserver(handleMutations);
        mutationObserver.observe(document.documentElement, {
          childList: true,
          attributes: true,
          attributeFilter: ['class', 'style', 'hidden', 'open', 'inert', 'aria-hidden'],
          subtree: true
        });
      } catch (error) {
        mutationObserver = null;
      }
    }
    observeLayer(layer);
  }

  function stopListening() {
    if (!listening) return;
    listening = false;
    document.removeEventListener('keydown', handleKeydown, true);
    document.removeEventListener('pointerdown', handlePointerDown, true);
    global.removeEventListener('scroll', repositionAll, true);
    global.removeEventListener('resize', handleResize);
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
  }

  function openLayer(layer) {
    if (!layer || layer.destroyed || layer._open) return layer;
    layer._open = true;
    layer._opener = document.activeElement;
    layer.root.style.visibility = 'hidden';
    (document.body || document.documentElement).appendChild(layer.root);
    stack.push(layer);
    applyStackZ();
    startListening(layer);
    if (layer._lockScroll) {
      layer._locked = true;
      lockScroll();
    }
    positionLayer(layer);
    if (!layer._open) return layer;
    layer.root.style.visibility = '';
    if (layer._trapFocus) focusLayer(layer);
    if (typeof layer._onOpen === 'function') layer._onOpen();
    return layer;
  }

  function closeReason(first, second) {
    var reason = first;
    var options = second;
    if (first && typeof first === 'object') {
      reason = 'api';
      options = first;
    } else if (reason == null) {
      reason = 'api';
    }
    return { reason: String(reason), options: options || {} };
  }

  function create(options) {
    var settings = NoteCore.assign({
      anchor: null,
      content: null,
      placement: 'bottom-start',
      offset: 8,
      role: 'dialog',
      className: '',
      modal: false,
      backdrop: null,
      trapFocus: false,
      returnFocus: true,
      closeOnEsc: true,
      closeOnOutside: true,
      lockScroll: false,
      matchAnchorWidth: false,
      maxWidth: null,
      onOpen: null,
      onClose: null
    }, options);
    var modal = Boolean(settings.modal);
    var anchor = settings.anchor || null;
    if (anchor && anchor.nodeType !== 1) {
      throw new TypeError('NoteCore.floating.create 的 anchor 必须是元素。');
    }
    if (!anchor && !modal) {
      throw new TypeError('NoteCore.floating.create 需要一个 anchor（modal 可省略）。');
    }

    var root = document.createElement('div');
    root.className = 'hnv-floating' + (modal ? ' hnv-floating--modal' : '');
    var useBackdrop = settings.backdrop == null ? modal : Boolean(settings.backdrop);
    var backdrop = null;
    if (useBackdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'hnv-floating__backdrop';
      backdrop.setAttribute('aria-hidden', 'true');
      root.appendChild(backdrop);
    }
    var panel = document.createElement('div');
    panel.className = 'hnv-floating__panel' +
      (settings.className == null || String(settings.className) === '' ? '' : ' ' + String(settings.className));
    var role = settings.role == null ? 'dialog' : String(settings.role);
    if (role) panel.setAttribute('role', role);
    if (modal) panel.setAttribute('aria-modal', 'true');
    root.appendChild(panel);
    if (settings.maxWidth != null) {
      if (typeof settings.maxWidth === 'number' && isFinite(settings.maxWidth)) {
        panel.style.maxWidth = Math.max(0, settings.maxWidth) + 'px';
      } else if (String(settings.maxWidth).trim()) {
        panel.style.maxWidth = String(settings.maxWidth).trim();
      }
    }

    var layer = {
      root: root,
      el: panel,
      open: function () { return openLayer(layer); },
      close: function (reason, closeOptions) {
        var normalized = closeReason(reason, closeOptions);
        return closeLayer(layer, normalized.reason, normalized.options);
      },
      toggle: function () {
        if (layer.destroyed) return layer;
        if (layer._open) return closeLayer(layer, 'api', {});
        return openLayer(layer);
      },
      isOpen: function () { return Boolean(layer._open && !layer.destroyed); },
      setContent: function (value) {
        if (layer.destroyed) return layer;
        NoteCore.setContent(layer.el, value);
        if (layer._open) positionLayer(layer);
        return layer;
      },
      reposition: function () {
        if (layer._open) positionLayer(layer);
        return layer;
      },
      destroy: function () {
        if (layer.destroyed) return;
        layer.destroyed = true;
        try {
          if (layer._open) closeLayer(layer, 'destroy', { restoreFocus: false });
        } finally {
          if (layer.root.parentNode) layer.root.parentNode.removeChild(layer.root);
        }
      }
    };

    layer.destroyed = false;
    layer._anchor = anchor;
    layer._placement = parsePlacement(settings.placement);
    layer._offset = isFinite(Number(settings.offset)) ? Number(settings.offset) : 8;
    layer._modal = modal;
    layer._backdrop = backdrop;
    layer._trapFocus = Boolean(settings.trapFocus);
    layer._returnFocus = settings.returnFocus !== false;
    layer._closeOnEsc = settings.closeOnEsc !== false;
    layer._closeOnOutside = settings.closeOnOutside !== false;
    layer._lockScroll = Boolean(settings.lockScroll);
    layer._matchAnchorWidth = Boolean(settings.matchAnchorWidth);
    layer._onOpen = typeof settings.onOpen === 'function' ? settings.onOpen : null;
    layer._onClose = typeof settings.onClose === 'function' ? settings.onClose : null;
    layer._open = false;
    layer._opener = null;
    layer._locked = false;
    layer._tabIndexTouched = false;
    layer._originalTabIndex = null;

    NoteCore.setContent(panel, settings.content);
    root.setAttribute('data-placement', layer._placement.auto ? 'auto' : placementName(layer._placement.side, layer._placement.align));
    panel.setAttribute('data-placement', root.getAttribute('data-placement'));
    return layer;
  }

  function closeTopmost(reason) {
    var layer = stack[stack.length - 1];
    if (!layer) return false;
    layer.close(reason == null ? 'api' : reason);
    return true;
  }

  function closeAll(reason) {
    stack.slice().reverse().forEach(function (layer) {
      if (layer._open) layer.close(reason == null ? 'api' : reason);
    });
  }

  NoteCore.floating = {
    create: create,
    closeTopmost: closeTopmost,
    closeAll: closeAll
  };
})(window);
