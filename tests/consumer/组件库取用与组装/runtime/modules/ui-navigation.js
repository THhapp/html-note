/*! note-library module: ui-navigation
 * dependencies: core
 * type: JavaScript
 * generated-by: scripts/build.mjs; do-not-edit.
 */

/* ---- source: src/ui/navigation-shared.js ---- */
/* NoteUI navigation — module-internal shared helpers (not public API).
 * Scope: window.NoteUIInternals.navigation.
 * Depends on: NoteCore. Load before the navigation component files
 * (order is declared in src/manifests/ui-navigation.json).
 * 内部共享文件：仅供 src/ui/navigation*.js 使用，不属于公开 API。 */
(function (global) {
  'use strict';

  var hasOwn = Object.prototype.hasOwnProperty;
  var Internals = global.NoteUIInternals = global.NoteUIInternals || {};
  var shared = Internals.navigation = Internals.navigation || {};

  function own(object, key) {
    return object != null && hasOwn.call(Object(object), key);
  }

  function core() {
    var value = global.NoteCore;
    if (!value) throw new Error('NoteCore 未加载；导航组件需要先加载 core。');
    return value;
  }

  function text(value) {
    return value == null ? '' : String(value);
  }


  function make(tag, className) {
    var node = global.document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function content(target, value) {
    var c = core();
    if (typeof c.setContent === 'function') return c.setContent(target, value);
    if (value && (value.nodeType === 1 || value.nodeType === 3 || value.nodeType === 11)) {
      target.replaceChildren(value);
    } else if (Array.isArray(value)) {
      target.replaceChildren();
      value.forEach(function (entry) {
        if (entry && entry.nodeType) target.appendChild(entry);
        else target.appendChild(document.createTextNode(text(entry)));
      });
    } else {
      target.textContent = text(value);
    }
    return target;
  }

  function validateHost(host) {
    var c = core();
    if (typeof c.validateHost === 'function') return c.validateHost(host);
    if (!host || (host.nodeType !== 1 && host.nodeType !== 11) || typeof host.appendChild !== 'function') {
      throw new TypeError('NoteUI.mount 需要一个元素或 DocumentFragment 容器。');
    }
    return host;
  }

  function uniqueId(prefix) {
    var c = core();
    if (typeof c.uid === 'function') return c.uid(prefix);
    return prefix + '-' + Math.random().toString(36).slice(2);
  }

  function isElement(value) {
    return !!value && value.nodeType === 1;
  }

  function findElement(value) {
    if (isElement(value)) return value;
    if (value === global || value === global.document) return global;
    if (typeof value === 'string' && value) {
      try {
        return global.document.querySelector(value);
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  function focusNode(node) {
    if (!node || !node.isConnected || typeof node.focus !== 'function') return false;
    try {
      node.focus({ preventScroll: true });
    } catch (error) {
      try { node.focus(); } catch (ignored) { return false; }
    }
    return true;
  }

  function makeIcon(value, size) {
    if (value && value.nodeType === 1) return value;
    if (typeof value !== 'string' || !value) return null;
    var c = core();
    if (typeof c.icon !== 'function') return null;
    return c.icon(value, { size: size || 16 });
  }

  function reducedMotion() {
    var c = global.NoteCore;
    if (c && c.motion && typeof c.motion.reduced === 'function') {
      try { return !!c.motion.reduced(); } catch (error) { return false; }
    }
    try {
      return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (error) {
      return false;
    }
  }

  function scrollIntoNearest(element, container) {
    if (!element) return;
    var c = global.NoteCore;
    if (c && typeof c.scrollIntoViewIfNeeded === 'function') {
      c.scrollIntoViewIfNeeded(element, container || null, { block: 'nearest', inline: 'nearest' });
      return;
    }
    if (typeof element.scrollIntoView === 'function') {
      try { element.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (error) {}
    }
  }

  shared.own = own;
  shared.core = core;
  shared.text = text;
  shared.make = make;
  shared.content = content;
  shared.validateHost = validateHost;
  shared.uniqueId = uniqueId;
  shared.isElement = isElement;
  shared.findElement = findElement;
  shared.focusNode = focusNode;
  shared.makeIcon = makeIcon;
  shared.reducedMotion = reducedMotion;
  shared.scrollIntoNearest = scrollIntoNearest;
})(window);

/* ---- source: src/ui/navigation.js ---- */
/* NoteUI navigation — N01 Tabs and N02 AnchorNav.
 * Internal helpers: window.NoteUIInternals.navigation (navigation-shared.js).
 * Depends on: NoteCore. String content is always inserted as text;
 * no network, no timers that advance content. */
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
   * N01 — Tabs
   * ------------------------------------------------------------------- */
  NoteUI.Tabs = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var C = core();
      var initial = options && typeof options === 'object' ? options : {};
      var state = {
        items: Array.isArray(initial.items) ? initial.items : [],
        value: initial.value,
        keepMounted: initial.keepMounted !== false,
        onChange: typeof initial.onChange === 'function' ? initial.onChange : null,
        label: initial.label == null ? '标签页' : text(initial.label),
        orientation: initial.orientation === 'vertical' ? 'vertical' : 'horizontal'
      };
      var baseId = uniqueId('nui-tabs');
      var root = make('div', 'nui-tabs');
      var list = make('div', 'nui-tabs__list');
      var panelsWrap = make('div', 'nui-tabs__panels');
      var empty = make('p', 'nui-tabs__empty');
      var items = [];
      var tabButtons = [];
      var panelNodes = [];
      var currentIndex = -1;
      var mountedPanelIndex = -1;
      var destroyed = false;
      list.setAttribute('role', 'tablist');
      empty.textContent = '暂无可用标签页';
      root.appendChild(list);
      root.appendChild(panelsWrap);
      root.appendChild(empty);

      function normalizeItems() {
        items = (Array.isArray(state.items) ? state.items : []).filter(function (item) {
          return item && typeof item === 'object';
        }).map(function (item, index) {
          return {
            id: item.id == null ? 'tab-' + index : item.id,
            label: item.label == null ? '标签 ' + (index + 1) : item.label,
            content: item.content,
            disabled: Boolean(item.disabled)
          };
        });
      }

      function indexOfId(value) {
        for (var i = 0; i < items.length; i += 1) {
          if (Object.is(items[i].id, value)) return i;
        }
        return -1;
      }

      function firstEnabled() {
        for (var i = 0; i < items.length; i += 1) {
          if (!items[i].disabled) return i;
        }
        return -1;
      }

      function ensureValue() {
        var index = indexOfId(state.value);
        if (index >= 0 && !items[index].disabled) return index;
        var first = firstEnabled();
        if (first >= 0) {
          state.value = items[first].id;
          return first;
        }
        state.value = undefined;
        return -1;
      }

      function tabId(index) {
        return baseId + '-tab-' + index;
      }

      function panelId(index) {
        return baseId + '-panel-' + index;
      }

      function createButton(item, index) {
        var button = make('button', 'nui-tabs__tab');
        button.type = 'button';
        button.id = tabId(index);
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-controls', panelId(index));
        button.setAttribute('aria-selected', 'false');
        button.tabIndex = -1;
        if (item.disabled) {
          button.disabled = true;
          button.setAttribute('aria-disabled', 'true');
          button.classList.add('nui-tabs__tab--disabled');
        }
        var label = make('span', 'nui-tabs__label');
        content(label, item.label);
        button.appendChild(label);
        return button;
      }

      function createPanel(index) {
        var item = items[index];
        if (!item) return null;
        var panel = make('div', 'nui-tabs__panel');
        panel.id = panelId(index);
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', tabId(index));
        panel.tabIndex = 0;
        content(panel, item.content);
        return panel;
      }

      function syncPanelState() {
        if (state.keepMounted) {
          panelNodes.forEach(function (panel, index) {
            if (panel) panel.hidden = index !== currentIndex;
          });
          return;
        }
        if (mountedPanelIndex === currentIndex) {
          if (currentIndex >= 0 && panelNodes[0]) panelNodes[0].hidden = false;
          return;
        }
        C.clear(panelsWrap);
        panelNodes = [];
        mountedPanelIndex = -1;
        if (currentIndex >= 0) {
          var panel = createPanel(currentIndex);
          if (panel) {
            panelsWrap.appendChild(panel);
            panelNodes.push(panel);
            mountedPanelIndex = currentIndex;
          }
        }
      }

      function syncButtons() {
        tabButtons.forEach(function (button, index) {
          var selected = index === currentIndex;
          button.setAttribute('aria-selected', selected ? 'true' : 'false');
          button.tabIndex = selected && !items[index].disabled ? 0 : -1;
          button.classList.toggle('nui-tabs__tab--selected', selected);
        });
      }

      function syncSelection(focusActive) {
        syncButtons();
        syncPanelState();
        empty.hidden = items.length > 0 && currentIndex >= 0;
        if (focusActive && currentIndex >= 0 && tabButtons[currentIndex]) {
          focusNode(tabButtons[currentIndex]);
        }
      }

      function syncOrientation() {
        var vertical = state.orientation === 'vertical';
        root.classList.toggle('nui-tabs--vertical', vertical);
        root.classList.toggle('nui-tabs--horizontal', !vertical);
        list.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal');
        root.setAttribute('data-orientation', state.orientation);
      }

      function build() {
        var hadFocus = root.contains(document.activeElement);
        currentIndex = ensureValue();
        C.clear(list);
        C.clear(panelsWrap);
        tabButtons = [];
        panelNodes = [];
        mountedPanelIndex = -1;
        items.forEach(function (item, index) {
          var button = createButton(item, index);
          list.appendChild(button);
          tabButtons.push(button);
        });
        list.setAttribute('aria-label', state.label || '标签页');
        syncOrientation();
        if (state.keepMounted) {
          items.forEach(function (item, index) {
            var panel = createPanel(index);
            if (!panel) return;
            panel.hidden = index !== currentIndex;
            panelsWrap.appendChild(panel);
            panelNodes.push(panel);
          });
        } else if (currentIndex >= 0) {
          var panel = createPanel(currentIndex);
          if (panel) {
            panelsWrap.appendChild(panel);
            panelNodes.push(panel);
            mountedPanelIndex = currentIndex;
          }
        }
        syncButtons();
        empty.hidden = items.length > 0 && currentIndex >= 0;
        if (hadFocus && currentIndex >= 0) focusNode(tabButtons[currentIndex]);
      }

      function userActivate(index, event, moveFocus) {
        if (destroyed || index < 0 || index >= items.length || items[index].disabled) return;
        var changed = !Object.is(state.value, items[index].id);
        state.value = items[index].id;
        currentIndex = index;
        syncSelection(moveFocus);
        if (changed && typeof state.onChange === 'function') {
          state.onChange(state.value, event);
        }
      }

      function clicked(event) {
        var button = event.target && event.target.closest ? event.target.closest('.nui-tabs__tab') : null;
        if (!button || button.parentNode !== list || button.disabled) return;
        var index = tabButtons.indexOf(button);
        if (index < 0) return;
        userActivate(index, event, false);
      }

      function keyed(event) {
        var button = event.target && event.target.closest ? event.target.closest('.nui-tabs__tab') : null;
        if (!button || button.parentNode !== list) return;
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        var vertical = state.orientation === 'vertical';
        var key = event.key;
        var enabled = [];
        items.forEach(function (item, index) {
          if (!item.disabled) enabled.push(index);
        });
        if (!enabled.length) return;
        var position = enabled.indexOf(tabButtons.indexOf(button));
        if (position < 0) position = 0;
        var next = null;
        if (key === 'Home') next = enabled[0];
        else if (key === 'End') next = enabled[enabled.length - 1];
        else if (!vertical && key === 'ArrowRight') next = enabled[(position + 1) % enabled.length];
        else if (!vertical && key === 'ArrowLeft') next = enabled[(position - 1 + enabled.length) % enabled.length];
        else if (vertical && key === 'ArrowDown') next = enabled[(position + 1) % enabled.length];
        else if (vertical && key === 'ArrowUp') next = enabled[(position - 1 + enabled.length) % enabled.length];
        else return;
        event.preventDefault();
        userActivate(next, event, true);
      }

      function onOptionChange(patch) {
        var itemsChanged = own(patch, 'items');
        var keepChanged = own(patch, 'keepMounted');
        var labelChanged = own(patch, 'label');
        var orientationChanged = own(patch, 'orientation');
        var valueChanged = own(patch, 'value');
        if (itemsChanged) {
          state.items = patch.items;
          normalizeItems();
        }
        if (keepChanged) state.keepMounted = patch.keepMounted !== false;
        if (labelChanged) state.label = patch.label == null ? '标签页' : text(patch.label);
        if (orientationChanged) state.orientation = patch.orientation === 'vertical' ? 'vertical' : 'horizontal';
        if (own(patch, 'onChange')) state.onChange = typeof patch.onChange === 'function' ? patch.onChange : null;
        if (valueChanged) state.value = patch.value;
        if (itemsChanged || keepChanged) {
          build();
        } else if (valueChanged) {
          currentIndex = ensureValue();
          syncSelection(false);
          syncOrientation();
          list.setAttribute('aria-label', state.label || '标签页');
        } else {
          syncOrientation();
          list.setAttribute('aria-label', state.label || '标签页');
        }
      }

      list.addEventListener('click', clicked);
      list.addEventListener('keydown', keyed);
      normalizeItems();
      build();
      host.appendChild(root);

      return {
        el: root,
        getValue: function () { return destroyed ? undefined : state.value; },
        activate: function (id) {
          if (destroyed) return false;
          currentIndex = indexOfId(id);
          if (currentIndex < 0 || items[currentIndex].disabled) return false;
          state.value = items[currentIndex].id;
          syncSelection(false);
          return true;
        },
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          onOptionChange(patch);
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          list.removeEventListener('click', clicked);
          list.removeEventListener('keydown', keyed);
          root.remove();
        }
      };
    }
  };

  /* ---------------------------------------------------------------------
   * N02 — AnchorNav
   * ------------------------------------------------------------------- */
  NoteUI.AnchorNav = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var C = core();
      var initial = options && typeof options === 'object' ? options : {};
      var state = {
        items: Array.isArray(initial.items) ? initial.items : [],
        active: initial.active,
        target: initial.target,
        offset: isFinite(Number(initial.offset)) ? Number(initial.offset) : 16,
        label: initial.label == null ? '章节导航' : text(initial.label)
      };
      var root = make('nav', 'nui-anchor-nav');
      var list = make('ol', 'nui-anchor-nav__list');
      var empty = make('p', 'nui-anchor-nav__empty');
      var items = [];
      var links = [];
      var activeIndex = -1;
      var destroyed = false;
      var scrollTarget = null;
      var scrollHandler = null;
      var resizeHandler = null;
      var pendingJump = null;
      var jumpTimer = null;
      empty.textContent = '暂无章节';
      root.appendChild(list);
      root.appendChild(empty);

      function normalizeItems() {
        items = (Array.isArray(state.items) ? state.items : []).filter(function (item) {
          return item && typeof item === 'object' && item.id != null;
        }).map(function (item) {
          var level = Number(item.level);
          return {
            id: item.id,
            label: item.label == null ? text(item.id) : item.label,
            level: isFinite(level) ? Math.max(1, Math.min(6, Math.floor(level))) : 1
          };
        });
      }

      function resolveTarget() {
        var raw = state.target;
        if (typeof raw === 'string') {
          try { raw = document.querySelector(raw); } catch (error) { raw = null; }
        }
        if (raw === global || raw === document || raw === document.documentElement || raw === document.body) {
          return global;
        }
        return isElement(raw) ? raw : global;
      }

      function targetElement(item) {
        if (!item || item.id == null) return null;
        try { return document.getElementById(String(item.id)); } catch (error) { return null; }
      }

      function currentIndexFromScroll() {
        if (!items.length) return -1;
        var usable = [];
        items.forEach(function (item, index) {
          var target = targetElement(item);
          if (target) usable.push({ index: index, node: target });
        });
        if (!usable.length) return activeIndex >= 0 ? activeIndex : 0;
        var isWindow = scrollTarget === global;
        var viewTop;
        var viewHeight;
        var atEnd = false;
        if (isWindow) {
          viewTop = 0;
          viewHeight = global.innerHeight || document.documentElement.clientHeight || 0;
          var scrolling = document.scrollingElement || document.documentElement;
          var maxScroll = Math.max(0, (scrolling ? scrolling.scrollHeight : 0) - viewHeight);
          atEnd = (global.scrollY || scrolling.scrollTop || 0) >= maxScroll - 2;
        } else {
          var box = scrollTarget.getBoundingClientRect();
          viewTop = box.top;
          viewHeight = scrollTarget.clientHeight || box.height || 0;
          atEnd = scrollTarget.scrollTop >= scrollTarget.scrollHeight - scrollTarget.clientHeight - 2;
        }
        if (atEnd) return usable[usable.length - 1].index;
        var pick = viewTop + Math.min(240, Math.max(80, viewHeight * 0.28));
        var found = usable[0].index;
        usable.forEach(function (entry) {
          var rect = entry.node.getBoundingClientRect();
          if (rect.top <= pick + 1) found = entry.index;
        });
        return found;
      }

      function revealLink(link) {
        if (!link) return;
        if (root.scrollHeight <= root.clientHeight + 1) return;
        var linkRect = link.getBoundingClientRect();
        var rootRect = root.getBoundingClientRect();
        if (linkRect.top < rootRect.top) {
          root.scrollTop -= rootRect.top - linkRect.top;
        } else if (linkRect.bottom > rootRect.bottom) {
          root.scrollTop += linkRect.bottom - rootRect.bottom;
        }
      }

      function syncActive(index) {
        clearJumpGuard();
        if (!items.length) {
          activeIndex = -1;
          return;
        }
        if (index < 0 || index >= items.length) index = currentIndexFromScroll();
        if (index < 0) index = 0;
        activeIndex = index;
        state.active = items[activeIndex].id;
        links.forEach(function (link, linkIndex) {
          var current = linkIndex === activeIndex;
          link.classList.toggle('nui-anchor-nav__link--current', current);
          if (current) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
        revealLink(links[activeIndex]);
      }

      function build() {
        var focusedId = null;
        var activeElement = document.activeElement;
        if (activeElement && activeElement.closest && list.contains(activeElement)) {
          var focusedHolder = activeElement.closest('[data-nui-anchor-index]');
          var focusedIndex = focusedHolder ? Number(focusedHolder.getAttribute('data-nui-anchor-index')) : NaN;
          if (focusedIndex >= 0 && items[focusedIndex]) focusedId = items[focusedIndex].id;
        }
        clearJumpGuard();
        C.clear(list);
        links = [];
        normalizeItems();
        items.forEach(function (item, index) {
          var li = make('li', 'nui-anchor-nav__item');
          li.style.paddingInlineStart = (Math.max(0, item.level - 1) * 14) + 'px';
          var link = make('a', 'nui-anchor-nav__link');
          link.href = '#' + String(item.id);
          link.setAttribute('data-nui-anchor-index', String(index));
          content(link, item.label);
          li.appendChild(link);
          list.appendChild(li);
          links.push(link);
        });
        empty.hidden = items.length > 0;
        if (empty.hidden) empty.setAttribute('hidden', '');
        else empty.removeAttribute('hidden');
        root.setAttribute('aria-label', state.label || '章节导航');
        var wanted = -1;
        if (state.active != null) {
          wanted = items.findIndex(function (item) { return Object.is(item.id, state.active); });
        }
        if (wanted >= 0) {
          activeIndex = -1;
          syncActive(wanted);
        } else if (links.length) {
          activeIndex = -1;
          syncActive(currentIndexFromScroll());
        } else {
          activeIndex = -1;
        }
        if (focusedId != null) {
          var restoreIndex = -1;
          items.forEach(function (item, index) {
            if (restoreIndex < 0 && Object.is(item.id, focusedId)) restoreIndex = index;
          });
          if (restoreIndex >= 0) focusNode(links[restoreIndex]);
        }
      }

      /* Smooth scrolling fires scroll events on the way to the target. Without a
       * guard the scroll-driven calculation would move aria-current through the
       * sections the reader is merely passing, so the requested section is held
       * until the scroll position actually reaches it (or the guard times out
       * for browsers that clamp the target, e.g. the last section). */
      function scrollOffset() {
        if (scrollTarget === global) {
          var scrolling = document.scrollingElement || document.documentElement;
          return global.scrollY || (scrolling ? scrolling.scrollTop : 0) || 0;
        }
        return scrollTarget ? scrollTarget.scrollTop || 0 : 0;
      }

      function clearJumpGuard() {
        pendingJump = null;
        if (jumpTimer) {
          global.clearTimeout(jumpTimer);
          jumpTimer = null;
        }
      }

      function armJumpGuard(index, top) {
        clearJumpGuard();
        if (Math.abs(scrollOffset() - top) <= 2) return;
        pendingJump = { index: index, top: top };
        jumpTimer = global.setTimeout(function () {
          jumpTimer = null;
          if (destroyed || !pendingJump) return;
          pendingJump = null;
          syncActive(currentIndexFromScroll());
        }, 900);
      }

      function bindScroll() {
        if (scrollHandler) scrollTarget.removeEventListener('scroll', scrollHandler);
        if (resizeHandler) global.removeEventListener('resize', resizeHandler);
        scrollTarget = resolveTarget();
        scrollHandler = function () {
          if (destroyed) return;
          if (pendingJump) {
            if (Math.abs(scrollOffset() - pendingJump.top) <= 2) {
              var landed = pendingJump.index;
              clearJumpGuard();
              syncActive(landed);
            }
            return;
          }
          syncActive(currentIndexFromScroll());
        };
        resizeHandler = function () {
          if (destroyed) return;
          clearJumpGuard();
          syncActive(currentIndexFromScroll());
        };
        scrollTarget.addEventListener('scroll', scrollHandler, { passive: true });
        global.addEventListener('resize', resizeHandler, { passive: true });
      }

      function jumpTo(index) {
        var item = items[index];
        var node = targetElement(item);
        if (!node) return false;
        var offset = isFinite(Number(state.offset)) ? Number(state.offset) : 16;
        var behavior = reducedMotion() ? 'auto' : 'smooth';
        var targetTop;
        var maxScroll;
        if (scrollTarget === global) {
          targetTop = Math.max(0,
            (global.scrollY || (document.scrollingElement || document.documentElement).scrollTop || 0) +
            node.getBoundingClientRect().top - offset);
          try {
            global.scrollTo({ top: targetTop, behavior: behavior });
          } catch (error) {
            global.scrollTo(global.pageXOffset || 0, targetTop);
          }
        } else {
          var containerRect = scrollTarget.getBoundingClientRect();
          maxScroll = Math.max(0, scrollTarget.scrollHeight - scrollTarget.clientHeight);
          targetTop = Math.max(0, Math.min(maxScroll,
            scrollTarget.scrollTop + node.getBoundingClientRect().top - containerRect.top - offset));
          try {
            if (typeof scrollTarget.scrollTo === 'function') {
              scrollTarget.scrollTo({ top: targetTop, behavior: behavior });
            } else {
              scrollTarget.scrollTop = targetTop;
            }
          } catch (error) {
            scrollTarget.scrollTop = targetTop;
          }
        }
        armJumpGuard(index, targetTop);
        return true;
      }

      function clicked(event) {
        var link = event.target && event.target.closest ? event.target.closest('.nui-anchor-nav__link') : null;
        if (!link || link.parentNode.parentNode !== list) return;
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
            event.shiftKey || event.altKey) return;
        var index = Number(link.getAttribute('data-nui-anchor-index'));
        if (!isFinite(index) || !items[index]) return;
        if (!targetElement(items[index])) return;
        event.preventDefault();
        syncActive(index);
        jumpTo(index);
      }

      list.addEventListener('click', clicked);
      host.appendChild(root);
      scrollTarget = resolveTarget();
      build();
      bindScroll();
      root.setAttribute('aria-label', state.label || '章节导航');

      return {
        el: root,
        getValue: function () { return destroyed ? undefined : state.active; },
        setActive: function (id, settings) {
          if (destroyed) return false;
          var index = items.findIndex(function (item) { return Object.is(item.id, id); });
          if (index < 0) return false;
          syncActive(index);
          var opts = settings && typeof settings === 'object' ? settings : {};
          if (opts.scroll === true) jumpTo(index);
          return true;
        },
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          if (own(patch, 'items')) state.items = patch.items;
          if (own(patch, 'active')) state.active = patch.active;
          if (own(patch, 'target')) state.target = patch.target;
          if (own(patch, 'offset')) state.offset = isFinite(Number(patch.offset)) ? Number(patch.offset) : 16;
          if (own(patch, 'label')) state.label = patch.label == null ? '章节导航' : text(patch.label);
          if (own(patch, 'items')) build();
          else if (own(patch, 'active')) {
            var wanted = items.findIndex(function (item) { return Object.is(item.id, state.active); });
            if (wanted >= 0) syncActive(wanted);
          }
          root.setAttribute('aria-label', state.label || '章节导航');
          if (own(patch, 'target')) {
            clearJumpGuard();
            bindScroll();
            if (!own(patch, 'active')) syncActive(currentIndexFromScroll());
          }
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          clearJumpGuard();
          list.removeEventListener('click', clicked);
          if (scrollHandler && scrollTarget) scrollTarget.removeEventListener('scroll', scrollHandler);
          if (resizeHandler) global.removeEventListener('resize', resizeHandler);
          scrollTarget = null;
          scrollHandler = null;
          resizeHandler = null;
          root.remove();
        }
      };
    }
  };
})(window);

/* ---- source: src/ui/navigation-menu.js ---- */
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

/* ---- source: src/ui/navigation-paging.js ---- */
/* NoteUI navigation — N05 Pagination and N06 Steps.
 * Internal helpers: window.NoteUIInternals.navigation (navigation-shared.js).
 * Depends on: NoteCore. Pagination only reports page changes in the browser;
 * no network, no timers that advance content. */
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
   * N05 — Pagination
   * ------------------------------------------------------------------- */
  NoteUI.Pagination = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var C = core();
      var initial = options && typeof options === 'object' ? options : {};
      var state = {
        total: initial.total,
        page: initial.page,
        pageSize: initial.pageSize,
        pageSizes: Array.isArray(initial.pageSizes) ? initial.pageSizes.slice() : [10, 20, 50],
        label: initial.label == null ? '分页' : text(initial.label),
        siblingCount: initial.siblingCount == null ? 1 : initial.siblingCount,
        onChange: typeof initial.onChange === 'function' ? initial.onChange : null
      };
      var root = make('nav', 'nui-pagination');
      var destroyed = false;
      var pageButtons = [];
      var sizeSelect = null;
      var pendingFocus = null;

      function integer(value, fallback, minimum) {
        var number = Number(value);
        if (!isFinite(number)) return fallback;
        number = Math.floor(number);
        if (minimum != null && number < minimum) return minimum;
        return number;
      }

      function normalizePageSizes() {
        var values = [];
        state.pageSizes.forEach(function (value) {
          var size = integer(value, 0, 1);
          if (size > 0 && values.indexOf(size) < 0) values.push(size);
        });
        var current = integer(state.pageSize, 10, 1);
        if (values.indexOf(current) < 0) values.push(current);
        values.sort(function (a, b) { return a - b; });
        return values;
      }

      function normalizeState() {
        state.total = integer(state.total, 0, 0);
        state.pageSize = integer(state.pageSize, 10, 1);
        state.siblingCount = Math.max(1, Math.min(3, integer(state.siblingCount, 1, 1)));
        var totalPages = state.total === 0 ? 0 : Math.ceil(state.total / state.pageSize);
        var rawPage = integer(state.page, 1, 1);
        state.page = totalPages === 0 ? 1 : Math.max(1, Math.min(totalPages, rawPage));
        return totalPages;
      }

      function pageSequence(totalPages) {
        if (totalPages <= 7) {
          var all = [];
          for (var page = 1; page <= totalPages; page += 1) all.push(page);
          return all;
        }
        var current = state.page;
        var sibling = state.siblingCount;
        var start = Math.max(2, current - sibling);
        var end = Math.min(totalPages - 1, current + sibling);
        var result = [1];
        if (start > 2) {
          if (start === 3) result.push(2);
          else result.push('gap-start');
        }
        for (var number = start; number <= end; number += 1) result.push(number);
        if (end < totalPages - 1) {
          if (end === totalPages - 2) result.push(totalPages - 1);
          else result.push('gap-end');
        }
        if (totalPages > 1) result.push(totalPages);
        return result;
      }

      function makeControl(label, action, disabled) {
        var button = make('button', 'nui-pagination__control');
        button.type = 'button';
        button.textContent = label;
        button.disabled = Boolean(disabled);
        button.setAttribute('data-nui-page-action', action);
        if (action === 'previous') button.setAttribute('aria-label', '上一页');
        else if (action === 'next') button.setAttribute('aria-label', '下一页');
        return button;
      }

      function render() {
        var totalPages = normalizeState();
        C.clear(root);
        root.className = 'nui-pagination' + (state.total === 0 ? ' nui-pagination--empty' : '');
        root.setAttribute('aria-label', state.label || '分页');
        pageButtons = [];
        sizeSelect = null;
        var summary = make('p', 'nui-pagination__summary');
        summary.setAttribute('role', 'status');
        summary.setAttribute('aria-live', 'polite');
        if (state.total === 0) {
          summary.textContent = '共 0 条，暂无可分页内容';
          root.appendChild(summary);
          pendingFocus = null;
          return;
        }
        summary.textContent = '第 ' + state.page + ' / ' + totalPages + ' 页，共 ' + state.total + ' 条';
        root.appendChild(summary);
        var controls = make('div', 'nui-pagination__controls');
        controls.setAttribute('role', 'group');
        controls.setAttribute('aria-label', '页码导航');
        var previous = makeControl('上一页', 'previous', state.page <= 1);
        controls.appendChild(previous);
        var pages = make('span', 'nui-pagination__pages');
        pageSequence(totalPages).forEach(function (entry, index) {
          if (typeof entry === 'string') {
            var ellipsis = make('span', 'nui-pagination__ellipsis');
            ellipsis.setAttribute('role', 'img');
            ellipsis.setAttribute('aria-label', '省略的页码');
            ellipsis.textContent = '…';
            ellipsis.setAttribute('data-nui-page-gap', entry);
            pages.appendChild(ellipsis);
            return;
          }
          var button = make('button', 'nui-pagination__page');
          button.type = 'button';
          button.textContent = String(entry);
          button.setAttribute('data-nui-page', String(entry));
          button.setAttribute('aria-label', entry === state.page ? '第 ' + entry + ' 页，当前页' : '第 ' + entry + ' 页');
          if (entry === state.page) {
            button.setAttribute('aria-current', 'page');
            button.classList.add('nui-pagination__page--current');
          }
          pages.appendChild(button);
          pageButtons.push(button);
        });
        controls.appendChild(pages);
        var next = makeControl('下一页', 'next', state.page >= totalPages);
        controls.appendChild(next);
        root.appendChild(controls);
        var sizeLabel = make('label', 'nui-pagination__size');
        var sizeText = make('span', 'nui-pagination__size-label');
        sizeText.textContent = '每页';
        sizeLabel.appendChild(sizeText);
        var select = make('select', 'nui-pagination__select');
        normalizePageSizes().forEach(function (size) {
          var option = document.createElement('option');
          option.value = String(size);
          option.textContent = String(size) + ' 条';
          if (size === state.pageSize) option.selected = true;
          select.appendChild(option);
        });
        sizeSelect = select;
        sizeLabel.appendChild(select);
        root.appendChild(sizeLabel);

        if (pendingFocus === 'size') {
          focusNode(sizeSelect);
          pendingFocus = null;
        } else if (pendingFocus === 'page') {
          var target = null;
          pageButtons.forEach(function (button) {
            if (Number(button.getAttribute('data-nui-page')) === state.page) target = button;
          });
          if (target) focusNode(target);
          else if (previous && !previous.disabled) focusNode(previous);
          else if (next && !next.disabled) focusNode(next);
          pendingFocus = null;
        }
      }

      function setPage(nextPage, event) {
        var totalPages = state.total === 0 ? 0 : Math.ceil(state.total / state.pageSize);
        if (totalPages === 0) return;
        var page = Math.max(1, Math.min(totalPages, integer(nextPage, state.page, 1)));
        if (page === state.page) return;
        state.page = page;
        pendingFocus = 'page';
        render();
        if (typeof state.onChange === 'function') state.onChange(state.page, state.pageSize, event);
      }

      function setPageSize(nextSize, event) {
        var size = integer(nextSize, state.pageSize, 1);
        var available = normalizePageSizes();
        if (available.indexOf(size) < 0 || size === state.pageSize) return;
        state.pageSize = size;
        normalizeState();
        pendingFocus = 'size';
        render();
        if (typeof state.onChange === 'function') state.onChange(state.page, state.pageSize, event);
      }

      function clicked(event) {
        var actionButton = event.target && event.target.closest ?
          event.target.closest('[data-nui-page-action]') : null;
        if (actionButton && root.contains(actionButton) && !actionButton.disabled) {
          var totalPages = state.total === 0 ? 0 : Math.ceil(state.total / state.pageSize);
          if (totalPages === 0) return;
          if (actionButton.getAttribute('data-nui-page-action') === 'previous') setPage(state.page - 1, event);
          else if (actionButton.getAttribute('data-nui-page-action') === 'next') setPage(state.page + 1, event);
          return;
        }
        var pageButton = event.target && event.target.closest ? event.target.closest('[data-nui-page]') : null;
        if (!pageButton || !root.contains(pageButton)) return;
        var page = Number(pageButton.getAttribute('data-nui-page'));
        if (!isFinite(page) || page === state.page) return;
        setPage(page, event);
      }

      function changed(event) {
        if (!event.target || event.target !== sizeSelect) return;
        setPageSize(event.target.value, event);
      }

      root.addEventListener('click', clicked);
      root.addEventListener('change', changed);
      render();
      host.appendChild(root);

      return {
        el: root,
        getValue: function () {
          return destroyed ? undefined : { page: state.page, pageSize: state.pageSize };
        },
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          var active = document.activeElement;
          var keepFocus = root.contains(active);
          if (own(patch, 'total')) state.total = patch.total;
          if (own(patch, 'page')) state.page = patch.page;
          if (own(patch, 'pageSize')) state.pageSize = patch.pageSize;
          if (own(patch, 'pageSizes')) state.pageSizes = Array.isArray(patch.pageSizes) ? patch.pageSizes.slice() : [10, 20, 50];
          if (own(patch, 'label')) state.label = patch.label == null ? '分页' : text(patch.label);
          if (own(patch, 'siblingCount')) state.siblingCount = patch.siblingCount;
          if (own(patch, 'onChange')) state.onChange = typeof patch.onChange === 'function' ? patch.onChange : null;
          pendingFocus = keepFocus && active === sizeSelect ? 'size' : (keepFocus ? 'page' : null);
          render();
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          root.removeEventListener('click', clicked);
          root.removeEventListener('change', changed);
          root.remove();
        }
      };
    }
  };

  /* ---------------------------------------------------------------------
   * N06 — Steps (display only; the host owns current and progression)
   * ------------------------------------------------------------------- */
  NoteUI.Steps = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var C = core();
      var initial = options && typeof options === 'object' ? options : {};
      var state = {
        items: Array.isArray(initial.items) ? initial.items : [],
        current: initial.current,
        clickable: Boolean(initial.clickable),
        orientation: initial.orientation === 'vertical' ? 'vertical' : 'horizontal',
        onChange: typeof initial.onChange === 'function' ? initial.onChange : null
      };
      var root = make('div', 'nui-steps');
      var currentIndex = -1;
      var destroyed = false;
      var statusLabels = { complete: '已完成', current: '当前步骤', upcoming: '未开始' };
      var items = [];

      function normalizeItems() {
        items = (Array.isArray(state.items) ? state.items : []).filter(function (item) {
          return item && typeof item === 'object';
        }).map(function (item, index) {
          return {
            label: item.label == null ? '步骤 ' + (index + 1) : item.label,
            description: item.description,
            status: item.status,
            disabled: Boolean(item.disabled)
          };
        });
      }

      function normalizeCurrent() {
        if (!items.length) {
          currentIndex = -1;
          state.current = -1;
          return;
        }
        var number = Number(state.current);
        if (!isFinite(number)) number = 0;
        number = Math.floor(number);
        currentIndex = Math.max(0, Math.min(items.length - 1, number));
        state.current = currentIndex;
      }

      function resolvedStatus(item, index) {
        if (index === currentIndex) return 'current';
        if (item.status === 'complete' || item.status === 'upcoming') return item.status;
        return index < currentIndex ? 'complete' : 'upcoming';
      }

      function build(preserveFocus) {
        var focusIndex = null;
        if (preserveFocus && root.contains(document.activeElement)) {
          var active = document.activeElement;
          var holder = active.closest ? active.closest('[data-step-index]') : null;
          if (holder) focusIndex = Number(holder.getAttribute('data-step-index'));
        }
        C.clear(root);
        normalizeItems();
        normalizeCurrent();
        root.className = 'nui-steps nui-steps--' + state.orientation;
        root.setAttribute('data-orientation', state.orientation);
        if (!items.length) {
          var empty = make('p', 'nui-steps__empty');
          empty.textContent = '暂无步骤';
          root.appendChild(empty);
          return;
        }
        var list = make('ol', 'nui-steps__list');
        list.setAttribute('aria-label', '步骤');
        items.forEach(function (item, index) {
          var status = resolvedStatus(item, index);
          var li = make('li', 'nui-steps__item nui-steps__item--' + status);
          li.setAttribute('data-step-index', String(index));
          li.setAttribute('data-status', status);
          if (index === currentIndex) li.setAttribute('aria-current', 'step');
          var rail = make('div', 'nui-steps__rail');
          rail.setAttribute('aria-hidden', 'true');
          var marker = make('span', 'nui-steps__marker');
          marker.textContent = status === 'complete' ? '✓' : String(index + 1);
          var line = make('span', 'nui-steps__line');
          rail.appendChild(marker);
          rail.appendChild(line);
          var body = make('div', 'nui-steps__body');
          var title;
          if (state.clickable) {
            title = make('button', 'nui-steps__title nui-steps__title--button');
            title.type = 'button';
            title.setAttribute('data-step-index', String(index));
            title.disabled = item.disabled;
          } else {
            title = make('span', 'nui-steps__title');
          }
          content(title, item.label);
          body.appendChild(title);
          var stateLabel = make('span', 'nui-steps__state');
          stateLabel.textContent = statusLabels[status] + (item.disabled ? '，不可用' : '');
          body.appendChild(stateLabel);
          if (item.description != null) {
            var description = make('p', 'nui-steps__description');
            content(description, item.description);
            body.appendChild(description);
          }
          li.appendChild(rail);
          li.appendChild(body);
          list.appendChild(li);
        });
        root.appendChild(list);
        if (focusIndex != null && isFinite(focusIndex)) {
          var buttons = root.querySelectorAll('.nui-steps__title--button');
          for (var i = 0; i < buttons.length; i += 1) {
            if (Number(buttons[i].getAttribute('data-step-index')) === focusIndex) {
              focusNode(buttons[i]);
              break;
            }
          }
        }
      }

      function clicked(event) {
        var button = event.target && event.target.closest ?
          event.target.closest('.nui-steps__title--button') : null;
        if (!button || !root.contains(button) || button.disabled || !state.clickable) return;
        var index = Number(button.getAttribute('data-step-index'));
        if (!isFinite(index) || index === currentIndex) return;
        // Deliberately do not write state.current here: Steps reports the user's
        // choice and the host decides whether to advance the indicator.
        if (typeof state.onChange === 'function') state.onChange(index, event);
      }

      root.addEventListener('click', clicked);
      host.appendChild(root);
      build(false);

      return {
        el: root,
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          if (own(patch, 'items')) state.items = Array.isArray(patch.items) ? patch.items : [];
          if (own(patch, 'current')) state.current = patch.current;
          if (own(patch, 'clickable')) state.clickable = Boolean(patch.clickable);
          if (own(patch, 'orientation')) state.orientation = patch.orientation === 'vertical' ? 'vertical' : 'horizontal';
          if (own(patch, 'onChange')) state.onChange = typeof patch.onChange === 'function' ? patch.onChange : null;
          build(true);
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          root.removeEventListener('click', clicked);
          root.remove();
        }
      };
    }
  };
})(window);

/* ---- source: src/ui/navigation-tree.js ---- */
/* NoteUI navigation — N07 TreeView.
 * Internal helpers: window.NoteUIInternals.navigation (navigation-shared.js).
 * Depends on: NoteCore. No async loading, no network, no timers. */
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
   * N07 — TreeView
   * ------------------------------------------------------------------- */
  NoteUI.TreeView = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var C = core();
      var initial = options && typeof options === 'object' ? options : {};
      var state = {
        nodes: Array.isArray(initial.nodes) ? initial.nodes : [],
        expanded: initial.expanded,
        selected: initial.selected,
        multi: Boolean(initial.multi),
        onSelect: typeof initial.onSelect === 'function' ? initial.onSelect : null,
        onToggle: typeof initial.onToggle === 'function' ? initial.onToggle : null,
        label: initial.label == null ? '目录树' : text(initial.label)
      };
      var baseId = uniqueId('nui-tree');
      var root = make('div', 'nui-tree');
      var topNodes = [];
      var allNodes = [];
      var nodeByKey = Object.create(null);
      var expandedKeys = [];
      var selectedKeys = [];
      var focusedKey = null;
      var renderRovingKey = null;
      var destroyed = false;

      function hasKey(list, key) {
        return list.indexOf(key) >= 0;
      }

      function asList(value) {
        if (value == null) return [];
        return Array.isArray(value) ? value.slice() : [value];
      }

      function normalizeNodes(input) {
        topNodes = [];
        allNodes = [];
        nodeByKey = Object.create(null);
        var fallbackCount = 0;

        function createNode(raw, parent, depth, index, siblings) {
          if (!raw || typeof raw !== 'object') return null;
          var id = raw.id != null && String(raw.id) !== '' ? raw.id : baseId + '-node-' + (++fallbackCount);
          var key = String(id);
          var node = {
            id: id,
            key: key,
            label: raw.label == null ? '未命名节点' : raw.label,
            disabled: Boolean(raw.disabled),
            children: [],
            parent: parent || null,
            depth: depth,
            index: index,
            siblingCount: siblings,
            source: raw,
            element: null
          };
          nodeByKey[key] = node;
          allNodes.push(node);
          var children = Array.isArray(raw.children) ? raw.children : [];
          children.forEach(function (child, childIndex) {
            var childNode = createNode(child, node, depth + 1, childIndex, children.length);
            if (childNode) node.children.push(childNode);
          });
          return node;
        }

        (Array.isArray(input) ? input : []).forEach(function (raw, index) {
          var node = createNode(raw, null, 0, index, input.length);
          if (node) topNodes.push(node);
        });
      }

      function applyExpanded(value) {
        var keys = [];
        asList(value).forEach(function (id) {
          var node = nodeByKey[String(id)];
          if (node && node.children.length && !hasKey(keys, node.key)) keys.push(node.key);
        });
        expandedKeys = keys;
      }

      function applySelected(value) {
        var keys = [];
        asList(value).forEach(function (id) {
          var node = nodeByKey[String(id)];
          if (node && !hasKey(keys, node.key)) keys.push(node.key);
        });
        if (!state.multi && keys.length > 1) keys = [keys[0]];
        selectedKeys = keys;
      }

      function selectedValue() {
        var nodes = selectedKeys.map(function (key) { return nodeByKey[key]; }).filter(Boolean);
        if (state.multi) return nodes.map(function (node) { return node.id; });
        return nodes.length ? nodes[0].id : null;
      }

      function isExpanded(node) {
        return hasKey(expandedKeys, node.key);
      }

      function visibleNodes() {
        var out = [];
        function walk(list) {
          list.forEach(function (node) {
            out.push(node);
            if (node.children.length && isExpanded(node)) walk(node.children);
          });
        }
        walk(topNodes);
        return out;
      }

      function rovingNode() {
        var visible = visibleNodes();
        if (!visible.length) return null;
        if (focusedKey) {
          var focused = nodeByKey[focusedKey];
          if (focused && visible.indexOf(focused) >= 0) return focused;
        }
        for (var i = 0; i < selectedKeys.length; i += 1) {
          var selected = nodeByKey[selectedKeys[i]];
          if (selected && visible.indexOf(selected) >= 0) return selected;
        }
        return visible[0];
      }

      function syncRovingDom() {
        var roving = rovingNode();
        var rovingKey = roving ? roving.key : null;
        allNodes.forEach(function (node) {
          if (node.element) node.element.tabIndex = node.key === rovingKey ? 0 : -1;
        });
      }

      function focusTreeItem(node) {
        if (!node || !node.element) return;
        focusedKey = node.key;
        syncRovingDom();
        focusNode(node.element);
        scrollIntoNearest(node.element, root);
      }

      function setExpanded(node, open) {
        if (!node || !node.children.length) return false;
        var key = node.key;
        var present = hasKey(expandedKeys, key);
        if (open && !present) {
          expandedKeys.push(key);
          return true;
        }
        if (!open && present) {
          expandedKeys = expandedKeys.filter(function (entry) { return entry !== key; });
          return true;
        }
        return false;
      }

      function nodeClasses(node) {
        var classes = 'nui-tree__item';
        if (hasKey(selectedKeys, node.key)) classes += ' nui-tree__item--selected';
        if (node.disabled) classes += ' nui-tree__item--disabled';
        return classes;
      }

      function createNodeElement(node) {
        var li = make('li', nodeClasses(node));
        li.setAttribute('role', 'treeitem');
        li.setAttribute('data-nui-tree-id', node.key);
        li.setAttribute('aria-level', String(node.depth + 1));
        li.setAttribute('aria-setsize', String(node.siblingCount));
        li.setAttribute('aria-posinset', String(node.index + 1));
        li.setAttribute('aria-selected', hasKey(selectedKeys, node.key) ? 'true' : 'false');
        if (node.disabled) li.setAttribute('aria-disabled', 'true');
        if (node.children.length) {
          li.setAttribute('aria-expanded', isExpanded(node) ? 'true' : 'false');
        }
        li.tabIndex = renderRovingKey === node.key ? 0 : -1;
        node.element = li;

        var row = make('div', 'nui-tree__row');
        row.style.paddingInlineStart = (8 + node.depth * 16) + 'px';
        var toggle = make('span', 'nui-tree__toggle');
        toggle.setAttribute('aria-hidden', 'true');
        if (node.children.length) {
          toggle.setAttribute('data-nui-tree-toggle', 'true');
          var expanded = isExpanded(node);
          toggle.classList.add(expanded ? 'nui-tree__toggle--open' : 'nui-tree__toggle--closed');
          toggle.textContent = expanded ? '▾' : '▸';
        } else {
          toggle.classList.add('nui-tree__toggle--leaf');
        }
        row.appendChild(toggle);
        var mark = make('span', 'nui-tree__mark');
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = hasKey(selectedKeys, node.key) ? '✓' : '';
        row.appendChild(mark);
        var label = make('span', 'nui-tree__label');
        content(label, node.label);
        row.appendChild(label);
        if (node.disabled) {
          var flag = make('span', 'nui-tree__flag');
          flag.textContent = '不可用';
          row.appendChild(flag);
        }
        li.appendChild(row);

        if (node.children.length) {
          var group = make('ul', 'nui-tree__group');
          group.setAttribute('role', 'group');
          group.hidden = !isExpanded(node);
          node.children.forEach(function (child) { group.appendChild(createNodeElement(child)); });
          li.appendChild(group);
        }
        return li;
      }

      function render(focusAfter) {
        var hadFocus = root.contains(document.activeElement);
        C.clear(root);
        root.setAttribute('role', 'tree');
        root.setAttribute('aria-label', state.label || '目录树');
        if (state.multi) root.setAttribute('aria-multiselectable', 'true');
        else root.removeAttribute('aria-multiselectable');
        if (!topNodes.length) {
          var empty = make('p', 'nui-tree__empty');
          empty.textContent = '暂无目录项';
          root.appendChild(empty);
          renderRovingKey = null;
          return;
        }
        var roving = rovingNode();
        renderRovingKey = roving ? roving.key : null;
        var list = make('ul', 'nui-tree__list');
        list.setAttribute('role', 'none');
        topNodes.forEach(function (node) { list.appendChild(createNodeElement(node)); });
        root.appendChild(list);
        if (focusAfter || hadFocus) {
          var target = rovingNode();
          if (target) focusTreeItem(target);
        }
      }

      function selectUser(node, event) {
        if (!node || node.disabled) return;
        var key = node.key;
        focusedKey = key;
        var index = selectedKeys.indexOf(key);
        var changed = false;
        if (state.multi) {
          if (index >= 0) {
            selectedKeys = selectedKeys.filter(function (entry) { return entry !== key; });
          } else {
            selectedKeys = selectedKeys.concat([key]);
          }
          changed = true;
        } else if (index < 0) {
          selectedKeys = [key];
          changed = true;
        }
        if (changed) render(true);
        else {
          syncRovingDom();
          focusTreeItem(node);
        }
        if (changed && typeof state.onSelect === 'function') {
          state.onSelect(selectedValue(), event);
        }
      }

      function toggleExpandedUser(node, event) {
        if (!node || node.disabled || !node.children.length) return;
        var open = !isExpanded(node);
        if (!setExpanded(node, open)) return;
        focusedKey = node.key;
        render(true);
        if (typeof state.onToggle === 'function') state.onToggle(node.id, open, event);
      }

      function clicked(event) {
        var item = event.target && event.target.closest ? event.target.closest('[role="treeitem"]') : null;
        if (!item || !root.contains(item) || !item.hasAttribute('data-nui-tree-id')) return;
        var node = nodeByKey[item.getAttribute('data-nui-tree-id')];
        if (!node) return;
        var toggle = event.target && event.target.closest ? event.target.closest('.nui-tree__toggle') : null;
        if (toggle && toggle.hasAttribute('data-nui-tree-toggle')) {
          event.preventDefault();
          focusedKey = node.key;
          if (node.disabled) {
            syncRovingDom();
            focusTreeItem(node);
            return;
          }
          toggleExpandedUser(node, event);
          return;
        }
        focusedKey = node.key;
        if (node.disabled) {
          syncRovingDom();
          focusTreeItem(node);
          return;
        }
        selectUser(node, event);
      }

      function keyed(event) {
        var item = event.target && event.target.closest ? event.target.closest('[role="treeitem"]') : null;
        if (!item || !root.contains(item) || !item.hasAttribute('data-nui-tree-id')) return;
        var node = nodeByKey[item.getAttribute('data-nui-tree-id')];
        if (!node) return;
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        var visible = visibleNodes();
        var index = visible.indexOf(node);
        var next = null;
        if (event.key === 'ArrowDown') {
          next = visible[Math.min(visible.length - 1, index + 1)];
        } else if (event.key === 'ArrowUp') {
          next = visible[Math.max(0, index - 1)];
        } else if (event.key === 'Home') {
          next = visible[0];
        } else if (event.key === 'End') {
          next = visible[visible.length - 1];
        } else if (event.key === 'ArrowRight') {
          if (node.disabled) {
            if (node.children.length) event.preventDefault();
            return;
          }
          if (node.children.length) {
            event.preventDefault();
            if (!isExpanded(node)) toggleExpandedUser(node, event);
            else focusTreeItem(node.children[0]);
          }
          return;
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          if (node.children.length && isExpanded(node) && !node.disabled) {
            toggleExpandedUser(node, event);
          } else if (node.parent) {
            focusTreeItem(node.parent);
          }
          return;
        } else if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
          event.preventDefault();
          if (!node.disabled) selectUser(node, event);
          return;
        } else {
          return;
        }
        if (!next) return;
        event.preventDefault();
        focusTreeItem(next);
      }

      function setMulti(multi) {
        state.multi = Boolean(multi);
        if (!state.multi && selectedKeys.length > 1) selectedKeys = [selectedKeys[0]];
      }

      root.addEventListener('click', clicked);
      root.addEventListener('keydown', keyed);
      normalizeNodes(state.nodes);
      applyExpanded(state.expanded);
      applySelected(state.selected);
      host.appendChild(root);
      render(false);

      return {
        el: root,
        getSelected: function () { return destroyed ? null : selectedValue(); },
        select: function (id, selectOptions) {
          if (destroyed) return;
          var settings = selectOptions && typeof selectOptions === 'object' ? selectOptions : {};
          var silent = settings.silent === true;
          var changed = false;
          if (id == null) {
            if (selectedKeys.length) {
              selectedKeys = [];
              changed = true;
            }
          } else if (Array.isArray(id)) {
            if (!state.multi) return;
            var keys = [];
            id.forEach(function (entry) {
              var node = nodeByKey[String(entry)];
              if (node && !hasKey(keys, node.key)) keys.push(node.key);
            });
            if (keys.join('\u0000') !== selectedKeys.join('\u0000')) {
              selectedKeys = keys;
              changed = true;
            }
          } else {
            var node = nodeByKey[String(id)];
            if (!node) return;
            if (state.multi) {
              var present = hasKey(selectedKeys, node.key);
              if (settings.selected === false) {
                if (present) {
                  selectedKeys = selectedKeys.filter(function (key) { return key !== node.key; });
                  changed = true;
                }
              } else if (!present) {
                selectedKeys = selectedKeys.concat([node.key]);
                changed = true;
              }
            } else {
              if (settings.selected === false) {
                if (selectedKeys.indexOf(node.key) >= 0) {
                  selectedKeys = [];
                  changed = true;
                }
              } else if (selectedKeys.length !== 1 || selectedKeys[0] !== node.key) {
                selectedKeys = [node.key];
                changed = true;
              }
            }
          }
          if (!changed) return;
          render(root.contains(document.activeElement));
          if (!silent && typeof state.onSelect === 'function') {
            state.onSelect(selectedValue(), null);
          }
        },
        expand: function (id, open) {
          if (destroyed) return false;
          var node = nodeByKey[String(id)];
          if (!node || !node.children.length) return false;
          var next = open == null ? !isExpanded(node) : Boolean(open);
          if (!setExpanded(node, next)) return false;
          render(root.contains(document.activeElement));
          return true;
        },
        getTarget: function (id) {
          if (destroyed || id == null) return null;
          var node = nodeByKey[String(id)];
          return node && node.element ? node.element : null;
        },
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          var hadFocus = root.contains(document.activeElement);
          if (own(patch, 'multi')) setMulti(patch.multi);
          if (own(patch, 'nodes')) {
            state.nodes = Array.isArray(patch.nodes) ? patch.nodes : [];
            normalizeNodes(state.nodes);
            expandedKeys = expandedKeys.filter(function (key) {
              var node = nodeByKey[key];
              return node && node.children.length;
            });
            selectedKeys = selectedKeys.filter(function (key) { return !!nodeByKey[key]; });
            if (focusedKey && !nodeByKey[focusedKey]) focusedKey = null;
          }
          if (own(patch, 'expanded')) applyExpanded(patch.expanded);
          if (own(patch, 'selected')) applySelected(patch.selected);
          if (own(patch, 'label')) state.label = patch.label == null ? '目录树' : text(patch.label);
          if (own(patch, 'onSelect')) state.onSelect = typeof patch.onSelect === 'function' ? patch.onSelect : null;
          if (own(patch, 'onToggle')) state.onToggle = typeof patch.onToggle === 'function' ? patch.onToggle : null;
          render(hadFocus);
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          root.removeEventListener('click', clicked);
          root.removeEventListener('keydown', keyed);
          root.remove();
        }
      };
    }
  };
})(window);
