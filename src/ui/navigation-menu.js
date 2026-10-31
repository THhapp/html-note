/* NoteUI navigation — N04 Menu and N03 Breadcrumb.
 * Internal helpers: window.NoteUIInternals.navigation (navigation-shared.js).
 * Depends on: NoteCore; Menu/Breadcrumb also use NoteCore.floating.
 * String content is always inserted as text; no network, no timers that advance content. */
(function (global) {
  'use strict';

  var NoteUI = global.NoteUI = global.NoteUI || {};
  var shared = global.NoteUIInternals && global.NoteUIInternals.navigation;
  if (!shared) {
    throw new Error('ui-navigation 组件需要先加载 src/ui/navigation-shared.js（内部共享 helper）。');
  }
  var own = shared.own;
  var core = shared.core;
  var text = shared.text;
  var make = shared.make;
  var content = shared.content;
  var validateHost = shared.validateHost;
  var uniqueId = shared.uniqueId;
  var isElement = shared.isElement;
  var findElement = shared.findElement;
  var focusNode = shared.focusNode;
  var makeIcon = shared.makeIcon;
  var reducedMotion = shared.reducedMotion;
  var scrollIntoNearest = shared.scrollIntoNearest;

  /* ---------------------------------------------------------------------
   * N04 — Menu (the Breadcrumb overflow row below also uses this component)
   * ------------------------------------------------------------------- */
  function normalizeMenuItems(input) {
    if (!Array.isArray(input)) return [];
    return input.filter(function (item) { return item != null; }).map(function (item) {
      if (typeof item === 'string') {
        return { source: item, label: item, disabled: false, children: [] };
      }
      if (typeof item !== 'object') {
        return { source: item, label: text(item), disabled: false, children: [] };
      }
      if (item.type === 'separator' || item.separator === true) {
        return { source: item, separator: true, disabled: false, children: [] };
      }
      var children = Array.isArray(item.children) ? item.children : [];
      return {
        source: item,
        id: item.id,
        label: item.label == null ? '菜单项' : item.label,
        icon: item.icon,
        shortcut: item.shortcut,
        keyshortcuts: item.keyshortcuts,
        disabled: Boolean(item.disabled),
        children: children
      };
    });
  }

  function menuLabelText(item, fallback) {
    if (item && typeof item.label === 'string' && item.label) return item.label;
    if (item && item.label && typeof item.label.textContent === 'string' && item.label.textContent) {
      return item.label.textContent;
    }
    return fallback || '子菜单';
  }

  NoteUI.Menu = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var C = core();
      if (!C.floating || typeof C.floating.create !== 'function') {
        throw new Error('NoteCore.floating 未加载；Menu 需要浮层基础。');
      }
      var initial = options && typeof options === 'object' ? options : {};
      var validPlacements = ['top', 'bottom', 'left', 'right', 'top-start', 'top-end',
        'bottom-start', 'bottom-end', 'left-start', 'left-end', 'right-start',
        'right-end', 'auto'];
      var state = {
        items: Array.isArray(initial.items) ? initial.items : [],
        trigger: initial.trigger && typeof initial.trigger === 'object' ? initial.trigger : null,
        anchor: initial.anchor || null,
        placement: validPlacements.indexOf(initial.placement) >= 0 ? initial.placement : 'bottom-start',
        onSelect: typeof initial.onSelect === 'function' ? initial.onSelect : null,
        label: initial.label == null ? '菜单' : text(initial.label)
      };
      var root = make('div', 'nui-menu');
      var triggerButton = null;
      var triggerClickHandler = null;
      var triggerKeyHandler = null;
      var contextScope = null;
      var contextHandler = null;
      var contextKeyHandler = null;
      var pointAnchor = null;
      var layers = [];
      var rootLayer = null;
      var rootReturnFocus = null;
      var triggerPointerWasOpen = false;
      var pointerWatcher = null;
      var destroyed = false;

      function removePointAnchor() {
        if (pointAnchor && pointAnchor.parentNode) pointAnchor.parentNode.removeChild(pointAnchor);
        pointAnchor = null;
      }

      function makePointAnchor(x, y) {
        removePointAnchor();
        var anchor = make('span', 'nui-menu__point-anchor');
        anchor.setAttribute('aria-hidden', 'true');
        anchor.tabIndex = -1;
        anchor.style.position = 'fixed';
        anchor.style.left = Math.round(x) + 'px';
        anchor.style.top = Math.round(y) + 'px';
        anchor.style.width = '1px';
        anchor.style.height = '1px';
        anchor.style.pointerEvents = 'none';
        (document.body || document.documentElement).appendChild(anchor);
        pointAnchor = anchor;
        return anchor;
      }

      function canReceiveFocus(element) {
        if (!isElement(element) || typeof element.focus !== 'function') return false;
        if (element.disabled) return false;
        if (element.tabIndex >= 0) return true;
        return /^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(element.tagName || '');
      }

      function buildButton(item, path) {
        var button = make('button', 'nui-menu__item');
        button.type = 'button';
        button.setAttribute('role', 'menuitem');
        button.tabIndex = -1;
        button.setAttribute('data-nui-menu-path', path);
        button.__nuiMenuItem = item;
        if (item.disabled) {
          button.disabled = true;
          button.setAttribute('aria-disabled', 'true');
          button.classList.add('nui-menu__item--disabled');
        }
        var icon = makeIcon(item.icon, 16);
        if (icon) {
          var iconWrap = make('span', 'nui-menu__icon');
          iconWrap.setAttribute('aria-hidden', 'true');
          iconWrap.appendChild(icon);
          button.appendChild(iconWrap);
        }
        var label = make('span', 'nui-menu__label');
        content(label, item.label);
        button.appendChild(label);
        if (item.children.length) {
          button.setAttribute('aria-haspopup', 'menu');
          button.setAttribute('aria-expanded', 'false');
          var mark = make('span', 'nui-menu__submenu-mark');
          mark.setAttribute('aria-hidden', 'true');
          mark.textContent = '›';
          button.appendChild(mark);
        } else if (item.shortcut != null && text(item.shortcut) !== '') {
          var shortcut = make('span', 'nui-menu__shortcut');
          shortcut.setAttribute('aria-hidden', 'true');
          shortcut.textContent = text(item.shortcut);
          button.appendChild(shortcut);
        }
        if (item.keyshortcuts) button.setAttribute('aria-keyshortcuts', String(item.keyshortcuts));
        return button;
      }

      function buildContent(items) {
        var fragment = document.createDocumentFragment();
        var optionCount = 0;
        items.forEach(function (item, index) {
          if (item.separator) {
            var separator = make('div', 'nui-menu__separator');
            separator.setAttribute('role', 'separator');
            separator.setAttribute('aria-orientation', 'horizontal');
            fragment.appendChild(separator);
            return;
          }
          optionCount += 1;
          fragment.appendChild(buildButton(item, String(index)));
        });
        if (!optionCount) {
          var empty = make('div', 'nui-menu__empty');
          empty.textContent = '暂无可用操作';
          fragment.appendChild(empty);
        }
        return fragment;
      }

      function menuButtons(rec) {
        if (!rec || !rec.layer) return [];
        return Array.prototype.filter.call(
          rec.layer.el.querySelectorAll('[role="menuitem"]'),
          function (button) { return !button.disabled; }
        );
      }

      function focusMenuItem(rec, which) {
        if (!rec || !rec.layer) return;
        var buttons = menuButtons(rec);
        if (!buttons.length) {
          rec.layer.el.tabIndex = -1;
          focusNode(rec.layer.el);
          return;
        }
        var target = which === 'last' ? buttons[buttons.length - 1] : buttons[0];
        focusNode(target);
        scrollIntoNearest(target, rec.layer.el);
      }

      function finalizeLayer(rec, reason) {
        if (!rec || rec.finalized) return;
        if (!rec.parent && rec.child) {
          var child = rec.child;
          child.pendingFocus = null;
          try { child.layer.close('parent', { restoreFocus: false }); } catch (error) {}
          if (!child.finalized) finalizeLayer(child, 'parent');
        }
        rec.finalized = true;
        var parentRec = rec.parent;
        var parentButton = rec.parentButton;
        rec.child = null;
        var index = layers.indexOf(rec);
        if (index >= 0) layers.splice(index, 1);
        if (parentRec) {
          if (parentRec.child === rec) parentRec.child = null;
          if (parentButton) parentButton.setAttribute('aria-expanded', 'false');
        } else {
          rootLayer = null;
          if (triggerButton) triggerButton.setAttribute('aria-expanded', 'false');
          removePointAnchor();
        }
        var derivedFocus = rec.pendingFocus;
        if (derivedFocus === undefined) {
          if (reason === 'esc' || reason === 'select') {
            derivedFocus = rec.parent ? parentButton : rootReturnFocus;
          } else {
            derivedFocus = null;
          }
        }
        if (typeof rec.dispose === 'function') {
          try { rec.dispose(); } catch (error) {}
        }
        try { rec.layer.destroy(); } catch (error) {}
        if (derivedFocus) focusNode(derivedFocus);
        if (!layers.length && !rootLayer) removePointAnchor();
      }

      function closeLayerRecord(rec, reason, focusTarget) {
        if (!rec || rec.finalized) return;
        rec.pendingFocus = focusTarget == null ? null : focusTarget;
        try {
          rec.layer.close(reason || 'api', { restoreFocus: false });
        } catch (error) {
          if (!rec.finalized) finalizeLayer(rec, reason || 'api');
        }
        if (!rec.finalized) finalizeLayer(rec, reason || 'api');
      }

      function closeAllLayers(reason, focusTarget) {
        var snapshot = layers.slice();
        if (!snapshot.length) return;
        for (var i = snapshot.length - 1; i >= 0; i -= 1) {
          var rec = snapshot[i];
          if (!rec || rec.finalized) continue;
          var target = i === 0 ? focusTarget : null;
          rec.pendingFocus = target == null ? null : target;
          try {
            rec.layer.close(i === 0 ? reason : 'parent', { restoreFocus: false });
          } catch (error) {
            if (!rec.finalized) finalizeLayer(rec, i === 0 ? reason : 'parent');
          }
          if (!rec.finalized) finalizeLayer(rec, i === 0 ? reason : 'parent');
        }
        if (triggerButton) triggerButton.setAttribute('aria-expanded', 'false');
        rootLayer = null;
        removePointAnchor();
      }

      function createLayer(rawItems, anchor, config) {
        var settings = config || {};
        var normalized = normalizeMenuItems(rawItems);
        var fragment = buildContent(normalized);
        var rec = {
          items: normalized,
          layer: null,
          parent: settings.parent || null,
          parentButton: settings.parentButton || null,
          child: null,
          depth: settings.depth || 0,
          finalized: false,
          pendingFocus: undefined,
          clickHandler: null,
          keyHandler: null
        };
        var layer = C.floating.create({
          anchor: anchor,
          content: fragment,
          placement: settings.placement || (settings.depth > 0 ? 'right-start' : state.placement),
          offset: settings.depth > 0 ? 3 : 4,
          role: 'menu',
          className: 'nui-menu__panel',
          closeOnEsc: true,
          closeOnOutside: true,
          trapFocus: false,
          returnFocus: false,
          onClose: function (reason) { finalizeLayer(rec, reason); }
        });
        rec.layer = layer;
        rec.clickHandler = function (event) { clickedInLayer(rec, event); };
        rec.keyHandler = function (event) { keyedInLayer(rec, event); };
        rec.dispose = function () {
          if (rec.layer && rec.layer.el) {
            rec.layer.el.removeEventListener('click', rec.clickHandler);
            rec.layer.el.removeEventListener('keydown', rec.keyHandler);
          }
        };
        layer.el.addEventListener('click', rec.clickHandler);
        layer.el.addEventListener('keydown', rec.keyHandler);
        layer.el.setAttribute('aria-label', settings.label || state.label || '菜单');
        layer.el.tabIndex = -1;
        layer.el.setAttribute('data-menu-depth', String(rec.depth));
        layers.push(rec);
        if (rec.parent) {
          rec.parent.child = rec;
          if (rec.parentButton) rec.parentButton.setAttribute('aria-expanded', 'true');
        } else {
          rootLayer = rec;
          if (triggerButton && rootReturnFocus === triggerButton) {
            triggerButton.setAttribute('aria-expanded', 'true');
          }
        }
        layer.open();
        if (!layer.isOpen()) {
          finalizeLayer(rec, 'anchor-removed');
          return null;
        }
        focusMenuItem(rec, settings.focusLast ? 'last' : 'first');
        return rec;
      }

      function openSubmenu(rec, button, item, focusLast) {
        if (!rec || !button || !item || !item.children.length) return null;
        if (rec.child) closeLayerRecord(rec.child, 'api', null);
        return createLayer(item.children, button, {
          depth: rec.depth + 1,
          label: menuLabelText(item, '子菜单'),
          placement: 'right-start',
          parent: rec,
          parentButton: button,
          focusLast: focusLast
        });
      }

      function closeChild(rec, reason, focusTarget) {
        if (!rec || !rec.child) return;
        closeLayerRecord(rec.child, reason || 'api', focusTarget == null ? null : focusTarget);
      }

      function activateLeaf(rec, item, event) {
        var callback = state.onSelect;
        var source = item.source;
        closeAllLayers('select', rootReturnFocus);
        if (typeof callback === 'function') callback(source, event);
      }

      function clickedInLayer(rec, event) {
        var button = event.target && event.target.closest ? event.target.closest('[role="menuitem"]') : null;
        if (!button || !rec.layer.el.contains(button) || button.disabled) return;
        var item = button.__nuiMenuItem;
        if (!item) return;
        if (item.children.length) {
          if (rec.child) closeChild(rec, 'api', button);
          else openSubmenu(rec, button, item, false);
          return;
        }
        activateLeaf(rec, item, event);
      }

      function focusWasInsideLayer() {
        var active = document.activeElement;
        if (!active || active === document.body) return false;
        for (var i = 0; i < layers.length; i += 1) {
          if (layers[i].layer && layers[i].layer.el && layers[i].layer.el.contains(active)) return true;
        }
        return false;
      }

      function focusableFrom(anchor, backwards) {
        var candidates = C.focusables(document.body || document.documentElement);
        if (!candidates.length) return null;
        var index = candidates.indexOf(anchor);
        if (index >= 0) return candidates[index + (backwards ? -1 : 1)] || null;
        if (isElement(anchor) && typeof anchor.compareDocumentPosition === 'function') {
          if (!backwards) {
            for (var next = 0; next < candidates.length; next += 1) {
              if (anchor.compareDocumentPosition(candidates[next]) & 4) return candidates[next];
            }
          } else {
            for (var previous = candidates.length - 1; previous >= 0; previous -= 1) {
              if (anchor.compareDocumentPosition(candidates[previous]) & 2) return candidates[previous];
            }
          }
        }
        return null;
      }

      function moveFocusAfterMenu(event) {
        var anchor = rootReturnFocus || triggerButton;
        var backwards = !!event.shiftKey;
        var candidates = C.focusables(document.body || document.documentElement);
        closeAllLayers('api', null);
        var target = focusableFrom(anchor, backwards);
        if (!target && candidates.length) target = candidates[backwards ? candidates.length - 1 : 0];
        if (target) focusNode(target);
      }

      function keyedInLayer(rec, event) {
        var current = event.target && event.target.closest ? event.target.closest('[role="menuitem"]') : null;
        if (current && !rec.layer.el.contains(current)) return;
        if (event.key === 'Escape' || event.key === 'Esc') return;
        if (event.key === 'Tab') {
          event.preventDefault();
          moveFocusAfterMenu(event);
          return;
        }
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        var buttons = menuButtons(rec);
        if (!buttons.length) return;
        var index = current ? buttons.indexOf(current) : -1;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
          var next = null;
          if (event.key === 'Home') next = buttons[0];
          else if (event.key === 'End') next = buttons[buttons.length - 1];
          else if (event.key === 'ArrowDown') {
            next = index < 0 ? buttons[0] : buttons[(index + 1) % buttons.length];
          } else {
            next = index < 0 ? buttons[buttons.length - 1] : buttons[(index - 1 + buttons.length) % buttons.length];
          }
          event.preventDefault();
          focusNode(next);
          scrollIntoNearest(next, rec.layer.el);
          return;
        }
        if (event.key === 'ArrowRight' && current) {
          if (buttons[index].getAttribute('aria-haspopup') === 'menu') {
            event.preventDefault();
            if (rec.child) focusMenuItem(rec.child, 'first');
            else openSubmenu(rec, current, current.__nuiMenuItem, false);
          }
          return;
        }
        if (event.key === 'ArrowLeft' && rec.parent) {
          event.preventDefault();
          closeChild(rec.parent, 'api', rec.parentButton);
          return;
        }
        // Enter/Space use the native button click path. Handling them here as well
        // would emit a duplicate selection.
      }

      function openMenu(anchorArg, positionArg, internal) {
        if (destroyed) return;
        var anchorRequest = anchorArg;
        var position = positionArg;
        var config = internal && typeof internal === 'object' ? internal : {};
        if (anchorRequest && typeof anchorRequest === 'object' && !isElement(anchorRequest) &&
            isFinite(Number(anchorRequest.x)) && isFinite(Number(anchorRequest.y)) && !position) {
          position = anchorRequest;
          anchorRequest = null;
        }
        if (layers.length) closeAllLayers('api', null);
        var previousActive = document.activeElement;
        var requestedAnchor = findElement(anchorRequest) || findElement(state.anchor) || triggerButton || root;
        var focusTarget = config.opener || null;
        if (!focusTarget) {
          if (anchorRequest && isElement(anchorRequest) && canReceiveFocus(anchorRequest)) focusTarget = anchorRequest;
          else if (triggerButton && canReceiveFocus(triggerButton)) focusTarget = triggerButton;
          else if (previousActive && previousActive !== document.body && canReceiveFocus(previousActive)) focusTarget = previousActive;
          else if (isElement(requestedAnchor) && canReceiveFocus(requestedAnchor)) focusTarget = requestedAnchor;
        }
        rootReturnFocus = focusTarget || null;
        var anchor = requestedAnchor;
        if (position && isFinite(Number(position.x)) && isFinite(Number(position.y))) {
          anchor = makePointAnchor(Number(position.x), Number(position.y));
        }
        if (!anchor || !anchor.isConnected) {
          removePointAnchor();
          return;
        }
        createLayer(state.items, anchor, {
          depth: 0,
          label: state.label,
          placement: state.placement,
          parent: null,
          parentButton: null,
          focusLast: Boolean(config.focusLast)
        });
      }

      function triggerClicked(event) {
        if (destroyed) return;
        if (event) event.preventDefault();
        if (triggerPointerWasOpen) {
          // The session began on an open trigger. NoteCore.floating may already
          // have closed the topmost layer on pointerdown; finish the toggle here
          // instead of reopening the menu on the following click.
          triggerPointerWasOpen = false;
          if (layers.length) closeAllLayers('api', triggerButton);
          else focusNode(triggerButton);
          return;
        }
        openMenu(triggerButton, null, { opener: triggerButton });
      }

      function triggerKeyed(event) {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
          triggerPointerWasOpen = false;
        }
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          triggerPointerWasOpen = false;
          openMenu(triggerButton, null, { opener: triggerButton, focusLast: event.key === 'ArrowUp' });
        }
      }

      function watchPointer(event) {
        if (!triggerButton) {
          triggerPointerWasOpen = false;
          return;
        }
        var target = event.target;
        var onTrigger = !!(target && (target === triggerButton || triggerButton.contains(target)));
        triggerPointerWasOpen = onTrigger && !!rootLayer;
      }

      function buildTrigger() {
        if (triggerButton && triggerClickHandler) {
          triggerButton.removeEventListener('click', triggerClickHandler);
          triggerButton.removeEventListener('keydown', triggerKeyHandler);
        }
        triggerButton = null;
        triggerClickHandler = null;
        triggerKeyHandler = null;
        C.clear(root);
        var trigger = state.trigger;
        if (trigger && trigger.type === 'button') {
          root.classList.remove('nui-menu--controlled');
          root.classList.add('nui-menu--button');
          triggerButton = make('button', 'nui-menu__trigger');
          triggerButton.type = 'button';
          triggerButton.setAttribute('aria-haspopup', 'menu');
          triggerButton.setAttribute('aria-expanded', 'false');
          var label = make('span', 'nui-menu__trigger-label');
          content(label, trigger.label == null ? state.label || '菜单' : trigger.label);
          triggerButton.appendChild(label);
          var caret = make('span', 'nui-menu__trigger-caret');
          caret.setAttribute('aria-hidden', 'true');
          caret.textContent = '▾';
          triggerButton.appendChild(caret);
          triggerClickHandler = triggerClicked;
          triggerKeyHandler = triggerKeyed;
          triggerButton.addEventListener('click', triggerClickHandler);
          triggerButton.addEventListener('keydown', triggerKeyHandler);
          root.appendChild(triggerButton);
        } else {
          root.classList.add('nui-menu--controlled');
          root.classList.remove('nui-menu--button');
        }
      }

      function unbindContext() {
        if (contextScope && contextHandler) contextScope.removeEventListener('contextmenu', contextHandler);
        if (contextScope && contextKeyHandler) contextScope.removeEventListener('keydown', contextKeyHandler);
        contextScope = null;
        contextHandler = null;
        contextKeyHandler = null;
      }

      function bindContext() {
        unbindContext();
        if (!state.trigger || state.trigger.type !== 'contextmenu') return;
        var scope = findElement(state.anchor);
        if (!scope && isElement(host)) scope = host;
        if (!scope && root.parentElement) scope = root.parentElement;
        if (!isElement(scope)) return;
        contextScope = scope;
        function openFromContext(event) {
          if (destroyed) return false;
          if (!Array.isArray(state.items) || !state.items.length) return false;
          event.preventDefault();
          var x = Number(event.clientX);
          var y = Number(event.clientY);
          if ((!isFinite(x) || !isFinite(y) || (x === 0 && y === 0)) && typeof scope.getBoundingClientRect === 'function') {
            var box = scope.getBoundingClientRect();
            x = box.left + Math.min(24, Math.max(8, box.width / 2));
            y = box.top + Math.min(24, Math.max(8, box.height / 2));
          }
          openMenu(scope, { x: x, y: y }, { opener: scope });
          return true;
        }
        contextHandler = function (event) { openFromContext(event); };
        contextKeyHandler = function (event) {
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            openFromContext(event);
          }
        };
        contextScope.addEventListener('contextmenu', contextHandler);
        contextScope.addEventListener('keydown', contextKeyHandler);
      }

      buildTrigger();
      host.appendChild(root);
      bindContext();
      pointerWatcher = watchPointer;
      global.addEventListener('pointerdown', pointerWatcher, true);

      return {
        el: root,
        open: function (anchor, position) {
          if (destroyed) return;
          openMenu(anchor, position, {});
        },
        close: function () {
          if (destroyed) return;
          var focusTarget = focusWasInsideLayer() ? (rootReturnFocus || triggerButton) : null;
          closeAllLayers('api', focusTarget);
        },
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          var structural = own(patch, 'items') || own(patch, 'trigger') ||
            own(patch, 'anchor') || own(patch, 'placement');
          var restoreFocus = false;
          var previousReturnFocus = rootReturnFocus;
          if (structural && layers.length) {
            /* Closing because the host replaced the menu data must not drop the
             * focus on <body>; focus returns to the trigger (or the previous
             * opener in controlled mode) after the rebuild. */
            restoreFocus = focusWasInsideLayer() ||
              Boolean(triggerButton && triggerButton.contains(document.activeElement));
            closeAllLayers('api', null);
            rootReturnFocus = null;
          }
          if (own(patch, 'items')) state.items = Array.isArray(patch.items) ? patch.items : [];
          if (own(patch, 'trigger')) state.trigger = patch.trigger && typeof patch.trigger === 'object' ? patch.trigger : null;
          if (own(patch, 'anchor')) state.anchor = patch.anchor || null;
          if (own(patch, 'placement')) {
            state.placement = validPlacements.indexOf(patch.placement) >= 0 ? patch.placement : 'bottom-start';
          }
          if (own(patch, 'onSelect')) state.onSelect = typeof patch.onSelect === 'function' ? patch.onSelect : null;
          if (own(patch, 'label')) state.label = patch.label == null ? '菜单' : text(patch.label);
          if (structural) {
            buildTrigger();
            bindContext();
          }
          if (restoreFocus) {
            var restoreTarget = triggerButton ||
              (previousReturnFocus && previousReturnFocus.isConnected ? previousReturnFocus : null);
            if (restoreTarget) focusNode(restoreTarget);
          }
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          if (pointerWatcher) {
            global.removeEventListener('pointerdown', pointerWatcher, true);
            pointerWatcher = null;
          }
          closeAllLayers('destroy', null);
          unbindContext();
          if (triggerButton && triggerClickHandler) {
            triggerButton.removeEventListener('click', triggerClickHandler);
            triggerButton.removeEventListener('keydown', triggerKeyHandler);
          }
          removePointAnchor();
          root.remove();
        }
      };
    }
  };

  /* ---------------------------------------------------------------------
   * N03 — Breadcrumb
   * ------------------------------------------------------------------- */
  NoteUI.Breadcrumb = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var C = core();
      var initial = options && typeof options === 'object' ? options : {};
      var max = Number(initial.maxItems);
      var state = {
        items: Array.isArray(initial.items) ? initial.items : [],
        maxItems: isFinite(max) && max >= 3 ? Math.floor(max) : 0,
        label: initial.label == null ? '面包屑' : text(initial.label),
        onSelect: typeof initial.onSelect === 'function' ? initial.onSelect : null
      };
      var root = make('nav', 'nui-breadcrumb');
      var destroyed = false;
      var overflowMenu = null;

      function normalizeItems() {
        return (Array.isArray(state.items) ? state.items : []).filter(function (item) {
          return item && typeof item === 'object';
        }).map(function (item, index) {
          return {
            label: item.label == null ? '层级 ' + (index + 1) : item.label,
            href: typeof item.href === 'string' ? item.href : null,
            target: item.target,
            onClick: typeof item.onClick === 'function' ? item.onClick : null,
            source: item
          };
        });
      }

      function destroyOverflow() {
        if (overflowMenu) {
          overflowMenu.destroy();
          overflowMenu = null;
        }
      }

      function activate(items, index, event, allowNavigation) {
        var item = items[index];
        if (!item) return;
        if (typeof item.onClick === 'function') item.onClick(event);
        if (typeof state.onSelect === 'function') state.onSelect(item.source, event);
        if (allowNavigation && item.href && !(event && event.defaultPrevented)) {
          if (item.target) {
            var opened = global.open(item.href, String(item.target), 'noopener,noreferrer');
            if (opened) opened.opener = null;
          } else {
            global.location.assign(item.href);
          }
        }
      }

      function crumbNode(item, index, allItems, isCurrent) {
        var li = make('li', 'nui-breadcrumb__item');
        if (isCurrent) {
          li.classList.add('nui-breadcrumb__item--current');
          var current = make('span', 'nui-breadcrumb__current');
          current.setAttribute('aria-current', 'page');
          content(current, item.label);
          li.appendChild(current);
          return li;
        }
        if (item.href) {
          var link = make('a', 'nui-breadcrumb__link');
          link.href = item.href;
          if (item.target) {
            link.target = String(item.target);
            if (String(item.target).toLowerCase() === '_blank') link.rel = 'noopener noreferrer';
          }
          content(link, item.label);
          if (item.onClick || state.onSelect) {
            link.addEventListener('click', function (event) { activate(allItems, index, event); });
          }
          li.appendChild(link);
          return li;
        }
        if (item.onClick || state.onSelect) {
          var button = make('button', 'nui-breadcrumb__button');
          button.type = 'button';
          content(button, item.label);
          button.addEventListener('click', function (event) { activate(allItems, index, event); });
          li.appendChild(button);
          return li;
        }
        var plain = make('span', 'nui-breadcrumb__text');
        content(plain, item.label);
        li.appendChild(plain);
        return li;
      }

      function overflowLabel() {
        var fragment = document.createDocumentFragment();
        var visible = make('span', 'nui-breadcrumb__ellipsis-mark');
        visible.setAttribute('aria-hidden', 'true');
        visible.textContent = '…';
        fragment.appendChild(visible);
        var accessible = make('span', 'hnv-visually-hidden');
        accessible.textContent = '显示省略的层级';
        fragment.appendChild(accessible);
        return fragment;
      }

      function buildOverflow(list, allItems, middleIndexes) {
        var li = make('li', 'nui-breadcrumb__item nui-breadcrumb__item--overflow');
        list.appendChild(li);
        var menuItems = middleIndexes.map(function (index) {
          return {
            id: 'breadcrumb-' + index,
            label: allItems[index].label,
            crumbIndex: index
          };
        });
        overflowMenu = NoteUI.Menu.mount(li, {
          items: menuItems,
          trigger: { type: 'button', label: overflowLabel() },
          placement: 'bottom-start',
          label: '省略的层级',
          onSelect: function (menuItem, event) {
            var index = Number(menuItem.crumbIndex);
            activate(allItems, index, event, true);
          }
        });
      }

      function render() {
        var previousMenu = overflowMenu;
        overflowMenu = null;
        C.clear(root);
        root.setAttribute('aria-label', state.label || '面包屑');
        var allItems = normalizeItems();
        if (!allItems.length) {
          var empty = make('p', 'nui-breadcrumb__empty');
          empty.textContent = '暂无路径';
          root.appendChild(empty);
          if (previousMenu) previousMenu.destroy();
          return;
        }
        var list = make('ol', 'nui-breadcrumb__list');
        root.appendChild(list);
        var headCount = 1;
        var collapse = state.maxItems >= 3 && allItems.length > state.maxItems;
        if (!collapse) {
          allItems.forEach(function (item, index) {
            list.appendChild(crumbNode(item, index, allItems, index === allItems.length - 1));
          });
          if (previousMenu) previousMenu.destroy();
          return;
        }
        var tailCount = Math.max(1, state.maxItems - 2);
        var splitAt = Math.max(headCount, allItems.length - tailCount);
        list.appendChild(crumbNode(allItems[0], 0, allItems, allItems.length === 1));
        var middle = [];
        for (var index = headCount; index < splitAt; index += 1) middle.push(index);
        buildOverflow(list, allItems, middle);
        for (var tail = splitAt; tail < allItems.length; tail += 1) {
          list.appendChild(crumbNode(allItems[tail], tail, allItems, tail === allItems.length - 1));
        }
        if (previousMenu) previousMenu.destroy();
      }

      host.appendChild(root);
      render();

      return {
        el: root,
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          if (own(patch, 'items')) state.items = Array.isArray(patch.items) ? patch.items : [];
          if (own(patch, 'maxItems')) {
            var next = Number(patch.maxItems);
            state.maxItems = isFinite(next) && next >= 3 ? Math.floor(next) : 0;
          }
          if (own(patch, 'label')) state.label = patch.label == null ? '面包屑' : text(patch.label);
          if (own(patch, 'onSelect')) state.onSelect = typeof patch.onSelect === 'function' ? patch.onSelect : null;
          render();
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          destroyOverflow();
          root.remove();
        }
      };
    }
  };
})(window);
