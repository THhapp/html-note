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
