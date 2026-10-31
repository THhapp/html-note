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
