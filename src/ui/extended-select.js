/* NoteUI extended — X04 Cascader, X05 TreeSelect and X06 TransferList.
 * Internal helpers: window.NoteUIInternals.extended (extended-shared.js).
 * Depends on: NoteCore; X05 TreeSelect also needs NoteUI.TreeView (ui-navigation).
 * Overlays reuse NoteCore.floating; no fetch, eval, HTML string injection. */
(function (global) {
  'use strict';

  var NoteUI = global.NoteUI = global.NoteUI || {};
  var shared = global.NoteUIInternals && global.NoteUIInternals.extended;
  if (!shared) {
    throw new Error('ui-extended 组件需要先加载 src/ui/extended-shared.js（内部共享 helper）。');
  }
  var core = shared.core;
  var own = shared.own;
  var text = shared.text;
  var make = shared.make;
  var validateHost = shared.validateHost;
  var uid = shared.uid;
  var isNode = shared.isNode;
  var append = shared.append;
  var setHidden = shared.setHidden;
  var focusNode = shared.focusNode;
  var isEditableTarget = shared.isEditableTarget;
  var valueKey = shared.valueKey;
  var signatureOf = shared.signatureOf;
  var uniqueValues = shared.uniqueValues;
  var appendContent = shared.appendContent;
  var readLive = shared.readLive;
  var VERSION = shared.VERSION;


  /* -----------------------------------------------------------------------
   * X04 — Cascader
   * -------------------------------------------------------------------- */

  function normalizeCascaderNodes(nodes) {
    if (!Array.isArray(nodes)) return [];
    return nodes.filter(function (node) {
      return node && typeof node === 'object';
    }).map(function (node, index) {
      var value = own(node, 'value') ? node.value : node.id;
      return {
        raw: node,
        value: value,
        label: node.label == null ? text(value) : text(node.label),
        disabled: Boolean(node.disabled),
        children: normalizeCascaderNodes(node.children),
        index: index
      };
    });
  }

  function findCascaderNode(nodes, value) {
    if (!Array.isArray(nodes)) return null;
    for (var index = 0; index < nodes.length; index += 1) {
      if (Object.is(nodes[index].value, value)) return nodes[index];
    }
    return null;
  }

  function resolveCascaderPath(nodes, values) {
    var path = [];
    var level = Array.isArray(nodes) ? nodes : [];
    (Array.isArray(values) ? values : []).forEach(function (value) {
      var node = findCascaderNode(level, value);
      if (!node) return;
      path.push(node);
      level = node.children;
    });
    return path;
  }

  function cascaderValueArray(value) {
    if (Array.isArray(value)) return value.slice();
    if (value == null || value === '') return [];
    return [value];
  }

  function pathValues(path) {
    return path.map(function (node) { return node.value; });
  }

  NoteUI.Cascader = {
    version: VERSION,
    mount: function (host, options) {
      validateHost(host);
      var C = core();
      var input = options && typeof options === 'object' ? options : {};
      var root = make('div', 'nui-cascader');
      var trigger = make('button', 'nui-cascader__trigger');
      var summary = make('span', 'nui-cascader__summary');
      var indicator = make('span', 'nui-cascader__indicator', '▾');
      var clearButton = make('button', 'nui-cascader__clear');
      var live = make('span', 'nui-cascader__live hnv-visually-hidden');
      var panelId = uid('nui-cascader-panel');
      var helpId = uid('nui-cascader-help');
      var bag = C.listeners(root);
      var windowBag = C.listeners(global);
      var popupBag = null;
      var layer = null;
      var panelEl = null;
      var pathLine = null;
      var columnsHost = null;
      var emptyEl = null;
      var state = null;
      var alive = true;

      trigger.type = 'button';
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', panelId);
      indicator.setAttribute('aria-hidden', 'true');
      append(trigger, summary, indicator);
      clearButton.type = 'button';
      clearButton.setAttribute('aria-label', '清除级联选择');
      clearButton.appendChild(make('span', 'nui-cascader__clear-glyph', '×'));
      clearButton.firstChild.setAttribute('aria-hidden', 'true');
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('aria-atomic', 'true');
      append(root, trigger, clearButton, live);

      state = {
        options: input.options,
        value: cascaderValueArray(input.value),
        placeholder: input.placeholder == null ? '请选择' : text(input.placeholder),
        clearable: input.clearable !== false,
        disabled: Boolean(input.disabled),
        separator: input.separator == null ? ' / ' : text(input.separator),
        label: input.label == null ? '级联选择' : text(input.label),
        onChange: typeof input.onChange === 'function' ? input.onChange : null,
        _options: [],
        _path: [],
        _browse: [],
        _activeLevel: 0,
        _activeIndex: 0,
        _columns: [],
        _open: false,
        _suppressAnchorClick: false
      };

      function syncOpenState() {
        if (!alive) return;
        var open = !!(layer && layer.isOpen());
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
        root.classList.toggle('is-open', open);
      }

      function currentBrowsePath() {
        return resolveCascaderPath(state._options, state._browse);
      }

      function columnsForBrowse() {
        var columns = [{ level: 0, nodes: state._options }];
        var path = currentBrowsePath();
        for (var index = 0; index < path.length; index += 1) {
          var node = path[index];
          if (!node.children.length) break;
          columns.push({ level: index + 1, nodes: node.children });
        }
        return columns;
      }

      function firstOptionIndex(nodes) {
        if (!Array.isArray(nodes) || !nodes.length) return -1;
        for (var index = 0; index < nodes.length; index += 1) {
          if (!nodes[index].disabled) return index;
        }
        return 0;
      }

      function currentPathText() {
        var path = currentBrowsePath();
        return path.map(function (node) { return node.label; }).join(state.separator);
      }

      function ensureLayer() {
        if (layer) return layer;
        panelEl = make('div', 'nui-cascader__panel');
        panelEl.id = panelId;
        panelEl.tabIndex = -1;
        pathLine = make('div', 'nui-cascader__pathline');
        columnsHost = make('div', 'nui-cascader__columns');
        emptyEl = make('p', 'nui-cascader__empty', '暂无可选项');
        var help = make('p', 'hnv-visually-hidden',
          '使用上下方向键在各列移动，左右方向键切换层级，Enter 选择，Esc 关闭。');
        help.id = helpId;
        setHidden(emptyEl, true);
        append(panelEl, pathLine, columnsHost, emptyEl, help);

        layer = C.floating.create({
          anchor: trigger,
          content: panelEl,
          placement: 'bottom-start',
          offset: 6,
          role: 'dialog',
          className: 'nui-cascader__popup',
          modal: false,
          trapFocus: true,
          returnFocus: true,
          closeOnEsc: true,
          closeOnOutside: true,
          lockScroll: false,
          maxWidth: 'min(94vw, 44rem)',
          onOpen: function () {
            state._open = true;
            syncOpenState();
          },
          onClose: function () {
            state._open = false;
            syncOpenState();
          }
        });
        layer.el.setAttribute('aria-label', state.label);
        layer.el.setAttribute('aria-describedby', helpId);
        popupBag = C.listeners(panelEl);
        popupBag.on('click', popupClicked);
        popupBag.on('keydown', popupKeyed);
        return layer;
      }

      function setPathLine() {
        pathLine.replaceChildren();
        pathLine.appendChild(make('span', 'nui-cascader__pathlabel', '当前路径'));
        var values = currentPathText();
        pathLine.appendChild(make('span', 'nui-cascader__pathvalue', values || '尚未选择'));
        pathLine.setAttribute('aria-live', 'polite');
      }

      function applyActiveDom() {
        if (!columnsHost) return;
        Array.prototype.forEach.call(columnsHost.querySelectorAll('[data-cascader-level]'), function (option) {
          var level = Number(option.getAttribute('data-cascader-level'));
          var index = Number(option.getAttribute('data-cascader-index'));
          var active = level === state._activeLevel && index === state._activeIndex;
          option.tabIndex = active ? 0 : -1;
          option.classList.toggle('is-active', active);
        });
      }

      function focusActiveOption() {
        if (!layer || !layer.isOpen() || !columnsHost) return;
        var option = columnsHost.querySelector(
          '[data-cascader-level="' + state._activeLevel + '"][data-cascader-index="' + state._activeIndex + '"]');
        if (option) {
          focusNode(option);
          C.scrollIntoViewIfNeeded(option, columnsHost, { block: 'nearest', inline: 'nearest' });
        } else {
          focusNode(panelEl);
        }
      }

      function renderPopup(focusWanted) {
        if (!layer || !panelEl) return;
        setPathLine();
        setHidden(emptyEl, !!state._options.length);
        columnsHost.replaceChildren();
        state._columns = columnsForBrowse();
        if (!state._options.length) {
          state._activeLevel = 0;
          state._activeIndex = -1;
          if (focusWanted) focusNode(panelEl);
          return;
        }
        if (state._activeLevel < 0) state._activeLevel = 0;
        if (state._activeLevel >= state._columns.length) state._activeLevel = state._columns.length - 1;
        var activeColumn = state._columns[state._activeLevel];
        if (!activeColumn.nodes.length) {
          state._activeIndex = -1;
        } else if (state._activeIndex < 0 || state._activeIndex >= activeColumn.nodes.length) {
          state._activeIndex = firstOptionIndex(activeColumn.nodes);
        }

        var selectedPath = resolveCascaderPath(state._options, state.value);
        state._columns.forEach(function (column) {
          var listbox = make('div', 'nui-cascader__column');
          listbox.setAttribute('role', 'listbox');
          listbox.setAttribute('aria-label', state.label + '，第 ' + (column.level + 1) + ' 级');
          column.nodes.forEach(function (node, index) {
            var selectedNode = selectedPath[column.level];
            var selected = !!selectedNode && Object.is(selectedNode.value, node.value);
            var option = make('div', 'nui-cascader__option');
            option.setAttribute('role', 'option');
            option.setAttribute('data-cascader-level', String(column.level));
            option.setAttribute('data-cascader-index', String(index));
            option.setAttribute('aria-selected', selected ? 'true' : 'false');
            option.tabIndex = (column.level === state._activeLevel && index === state._activeIndex) ? 0 : -1;
            if (node.disabled) option.setAttribute('aria-disabled', 'true');
            option.classList.toggle('is-selected', selected);
            option.classList.toggle('is-disabled', node.disabled);
            option.classList.toggle('is-active',
              column.level === state._activeLevel && index === state._activeIndex);
            option.appendChild(make('span', 'nui-cascader__option-label', node.label));
            if (selected) {
              var check = make('span', 'nui-cascader__option-check', '✓');
              check.setAttribute('aria-hidden', 'true');
              option.appendChild(check);
            }
            if (node.disabled) {
              option.appendChild(make('span', 'nui-cascader__option-note', '不可选'));
            }
            if (node.children.length) {
              var more = make('span', 'nui-cascader__option-more', '›');
              more.setAttribute('aria-hidden', 'true');
              option.appendChild(more);
            }
            listbox.appendChild(option);
          });
          columnsHost.appendChild(listbox);
        });
        applyActiveDom();
        if (focusWanted) focusActiveOption();
      }

      function render() {
        state._options = normalizeCascaderNodes(state.options);
        state._path = resolveCascaderPath(state._options, cascaderValueArray(state.value));
        state.value = pathValues(state._path);
        if (!state._open) {
          state._browse = state.value.slice();
        } else {
          var browsePath = resolveCascaderPath(state._options, state._browse);
          state._browse = pathValues(browsePath);
        }
        var pathText = state._path.map(function (node) { return node.label; }).join(state.separator);
        summary.textContent = pathText || state.placeholder;
        summary.classList.toggle('is-placeholder', !pathText);
        trigger.disabled = state.disabled;
        trigger.setAttribute('aria-label',
          state.label + '：' + (pathText || state.placeholder));
        setHidden(clearButton, !state.clearable || state.disabled || !state._path.length);
        clearButton.disabled = state.disabled;
        root.classList.toggle('is-disabled', state.disabled);
        readLive(live, pathText ? '已选择：' + pathText : '未选择级联项');
        if (layer) layer.el.setAttribute('aria-label', state.label);
        if (layer && layer.isOpen()) {
          var hadFocus = panelEl.contains(document.activeElement);
          if (state.disabled) layer.close('api');
          else renderPopup(hadFocus);
        }
        syncOpenState();
      }

      function startBrowse() {
        if (state.disabled) return;
        ensureLayer();
        state._browse = state.value.slice();
        state._activeLevel = 0;
        var firstNodes = state._options;
        var firstSelected = state._path.length ? findCascaderNode(firstNodes, state._path[0].value) : null;
        state._activeIndex = firstSelected ? firstSelected.index : firstOptionIndex(firstNodes);
        renderPopup(false);
        layer.open();
        syncOpenState();
        focusActiveOption();
      }

      function openPanel() {
        if (state.disabled) return;
        if (layer && layer.isOpen()) return;
        ensureLayer();
        startBrowse();
      }

      function closePanel(reason) {
        if (layer && layer.isOpen()) layer.close(reason || 'api');
        syncOpenState();
      }

      function togglePanel() {
        if (layer && layer.isOpen()) closePanel('api');
        else openPanel();
      }

      function setActive(level, index, focusWanted) {
        state._activeLevel = level;
        state._activeIndex = index;
        renderPopup(focusWanted !== false);
      }

      function nodeForOption(level, index) {
        var column = state._columns[level];
        return column && column.nodes[index] ? column.nodes[index] : null;
      }

      function expandOption(level, index) {
        var node = nodeForOption(level, index);
        if (!node || node.disabled || !node.children.length) return false;
        var ancestors = currentBrowsePath().slice(0, level).map(function (entry) { return entry.value; });
        state._browse = ancestors.concat([node.value]);
        state._activeLevel = level + 1;
        state._activeIndex = firstOptionIndex(node.children);
        renderPopup(true);
        return true;
      }

      function commitOption(level, index, event) {
        var node = nodeForOption(level, index);
        if (!node || node.disabled) return;
        var ancestors = currentBrowsePath().slice(0, level);
        var finalPath = ancestors.concat([node]);
        var values = pathValues(finalPath);
        state.value = values;
        state._path = finalPath;
        state._browse = values.slice();
        closePanel('select');
        render();
        if (typeof state.onChange === 'function') {
          state.onChange(values.slice(), finalPath.map(function (entry) { return entry.raw; }), event);
        }
      }

      function activateOption(level, index, event) {
        var node = nodeForOption(level, index);
        if (!node || node.disabled) return;
        state._activeLevel = level;
        state._activeIndex = index;
        if (node.children.length) expandOption(level, index);
        else commitOption(level, index, event);
      }

      function popupClicked(event) {
        var option = event.target && event.target.closest ?
          event.target.closest('.nui-cascader__option') : null;
        if (!option || !columnsHost.contains(option)) return;
        var level = Number(option.getAttribute('data-cascader-level'));
        var index = Number(option.getAttribute('data-cascader-index'));
        if (!isFinite(level) || !isFinite(index)) return;
        activateOption(level, index, event);
      }

      function popupKeyed(event) {
        if (!layer || !layer.isOpen()) return;
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        var option = event.target && event.target.closest ?
          event.target.closest('.nui-cascader__option') : null;
        if (!option || !columnsHost.contains(option)) return;
        var level = Number(option.getAttribute('data-cascader-level'));
        var index = Number(option.getAttribute('data-cascader-index'));
        var column = state._columns[level];
        if (!column) return;
        var nodes = column.nodes;
        var handled = true;
        if (event.key === 'ArrowDown' || event.key === 'Down') {
          setActive(level, Math.min(nodes.length - 1, index + 1));
        } else if (event.key === 'ArrowUp' || event.key === 'Up') {
          setActive(level, Math.max(0, index - 1));
        } else if (event.key === 'Home') {
          setActive(level, 0);
        } else if (event.key === 'End') {
          setActive(level, nodes.length - 1);
        } else if (event.key === 'ArrowLeft' || event.key === 'Left') {
          if (level > 0) {
            var previousColumn = state._columns[level - 1];
            var previousPath = currentBrowsePath();
            var wanted = previousPath[level - 1];
            var previousIndex = wanted ? previousColumn.nodes.findIndex(function (node) {
              return Object.is(node.value, wanted.value);
            }) : -1;
            if (previousIndex < 0) previousIndex = firstOptionIndex(previousColumn.nodes);
            setActive(level - 1, previousIndex);
          }
        } else if (event.key === 'ArrowRight' || event.key === 'Right') {
          var current = nodes[index];
          if (current && current.children.length && !current.disabled) {
            expandOption(level, index);
          }
        } else if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
          activateOption(level, index, event);
        } else {
          handled = false;
        }
        if (handled) event.preventDefault();
      }

      function clearValue(event) {
        if (state.disabled || !state.clearable || !state._path.length) return;
        state.value = [];
        state._path = [];
        state._browse = [];
        closePanel('api');
        render();
        if (typeof state.onChange === 'function') state.onChange([], [], event);
      }

      bag.on('click', function (event) {
        var action = event.target && event.target.closest ?
          event.target.closest('[data-cascader-action]') : null;
        if (!action) {
          if (event.target === trigger || trigger.contains(event.target)) {
            event.preventDefault();
            togglePanel();
          }
          return;
        }
        var name = action.getAttribute('data-cascader-action');
        if (name === 'toggle') {
          event.preventDefault();
          if (state._suppressAnchorClick) {
            state._suppressAnchorClick = false;
            return;
          }
          togglePanel();
        } else if (name === 'clear') {
          event.preventDefault();
          clearValue(event);
        }
      });
      bag.on('keydown', function (event) {
        if (event.target !== trigger) return;
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
          state._suppressAnchorClick = false;
          return;
        }
        if (event.key === 'ArrowDown' || event.key === 'Down' ||
            event.key === 'ArrowUp' || event.key === 'Up') {
          event.preventDefault();
          openPanel();
        }
      });

      trigger.setAttribute('data-cascader-action', 'toggle');
      clearButton.setAttribute('data-cascader-action', 'clear');
      windowBag.on('pointerdown', function (event) {
        var target = event.target;
        state._suppressAnchorClick = !!(layer && layer.isOpen() && target &&
          (target === trigger || trigger.contains(target)));
      }, true);

      var inst = C.component(root, state, render, function () {
        alive = false;
        bag.clear();
        windowBag.clear();
        if (popupBag) {
          popupBag.clear();
          popupBag = null;
        }
        if (layer) {
          layer.destroy();
          layer = null;
        }
        panelEl = null;
        columnsHost = null;
      });

      inst.getValue = function () {
        return state._path.map(function (node) { return node.value; });
      };

      render();
      host.appendChild(root);
      return inst;
    }
  };

  /* -----------------------------------------------------------------------
   * X05 — TreeSelect
   * -------------------------------------------------------------------- */

  function readableLabel(value) {
    if (value && (value.nodeType === 1 || value.nodeType === 3 || value.nodeType === 11)) {
      return text(value.textContent || value.nodeValue || '');
    }
    return text(value);
  }

  function treeNodeMap(nodes) {
    var map = Object.create(null);
    var list = [];
    function walk(items, parentPath) {
      (Array.isArray(items) ? items : []).forEach(function (raw) {
        if (!raw || typeof raw !== 'object') return;
        var id = own(raw, 'id') ? raw.id : own(raw, 'value') ? raw.value : undefined;
        var entry = {
          raw: raw,
          id: id,
          key: valueKey(id),
          label: raw.label == null ? text(id) : raw.label,
          disabled: Boolean(raw.disabled),
          parentPath: parentPath,
          children: Array.isArray(raw.children) ? raw.children : []
        };
        list.push(entry);
        if (!own(map, entry.key)) map[entry.key] = entry;
        walk(raw.children, parentPath.concat([entry]));
      });
    }
    walk(nodes, []);
    return { map: map, list: list };
  }

  function normalizeTreeValue(raw, multi) {
    var values;
    if (multi) {
      values = Array.isArray(raw) ? raw.slice() : (raw == null ? [] : [raw]);
    } else if (Array.isArray(raw)) {
      values = raw.length ? [raw[raw.length - 1]] : [];
    } else {
      values = raw == null ? [] : [raw];
    }
    return uniqueValues(values.filter(function (value) { return value !== undefined; }));
  }

  function treeSelectedShape(values, multi) {
    if (multi) return values.slice();
    return values.length ? values[values.length - 1] : null;
  }

  NoteUI.TreeSelect = {
    version: VERSION,
    mount: function (host, options) {
      validateHost(host);
      var C = core();
      if (!NoteUI.TreeView || typeof NoteUI.TreeView.mount !== 'function') {
        throw new Error('NoteUI.TreeSelect 需要先加载 ui-navigation（NoteUI.TreeView）；' +
          '加载顺序应为 core → ui-navigation → ui-extended，或直接使用整库/模块依赖顺序。');
      }
      var input = options && typeof options === 'object' ? options : {};
      var root = make('div', 'nui-treeselect');
      var trigger = make('button', 'nui-treeselect__trigger');
      var summary = make('span', 'nui-treeselect__summary');
      var count = make('span', 'nui-treeselect__count');
      var indicator = make('span', 'nui-treeselect__indicator', '▾');
      var clearButton = make('button', 'nui-treeselect__clear');
      var live = make('span', 'nui-treeselect__live hnv-visually-hidden');
      var panelId = uid('nui-treeselect-panel');
      var helpId = uid('nui-treeselect-help');
      var bag = C.listeners(root);
      var windowBag = C.listeners(global);
      var layer = null;
      var panelEl = null;
      var treeHost = null;
      var emptyEl = null;
      var hintEl = null;
      var treeView = null;
      var alive = true;
      var state = null;

      trigger.type = 'button';
      trigger.setAttribute('aria-haspopup', 'tree');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', panelId);
      indicator.setAttribute('aria-hidden', 'true');
      append(trigger, summary, count, indicator);
      clearButton.type = 'button';
      clearButton.setAttribute('aria-label', '清除树形选择');
      clearButton.appendChild(make('span', 'nui-treeselect__clear-glyph', '×'));
      clearButton.firstChild.setAttribute('aria-hidden', 'true');
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('aria-atomic', 'true');
      append(root, trigger, clearButton, live);

      state = {
        nodes: Array.isArray(input.nodes) ? input.nodes : [],
        value: input.value,
        multi: Boolean(input.multi),
        placeholder: input.placeholder == null ? '请选择' : text(input.placeholder),
        clearable: input.clearable !== false,
        disabled: Boolean(input.disabled),
        expanded: input.expanded,
        label: input.label == null ? '树形选择' : text(input.label),
        emptyText: input.emptyText == null ? '暂无可选节点' : text(input.emptyText),
        onChange: typeof input.onChange === 'function' ? input.onChange : null,
        _flat: { map: Object.create(null), list: [] },
        _selected: [],
        _treeStale: true,
        _open: false,
        _suppressAnchorClick: false
      };

      function syncOpenState() {
        if (!alive) return;
        var open = !!(layer && layer.isOpen());
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
        root.classList.toggle('is-open', open);
      }

      function selectedValues() {
        return normalizeTreeValue(state.value, state.multi);
      }

      function selectedNodes(values) {
        var result = [];
        (values || []).forEach(function (value) {
          var entry = state._flat.map[valueKey(value)];
          if (entry) result.push(entry.raw);
        });
        return result;
      }

      function summaryParts(values) {
        return values.map(function (value) {
          var entry = state._flat.map[valueKey(value)];
          return entry ? readableLabel(entry.label) : text(value);
        });
      }

      function updatePanelHint() {
        if (!hintEl) return;
        hintEl.textContent = state.multi ?
          '可选择多项；点击面板外部或按 Esc 完成。' :
          '选择一项后将自动关闭。';
        setHidden(emptyEl, !!state.nodes.length);
      }

      function renderTrigger() {
        state._flat = treeNodeMap(state.nodes);
        state._selected = selectedValues();
        var labels = summaryParts(state._selected);
        var summaryText = labels.join('、');
        summary.textContent = summaryText || state.placeholder;
        summary.classList.toggle('is-placeholder', !summaryText);
        count.textContent = state.multi && state._selected.length ? state._selected.length + ' 项' : '';
        setHidden(count, !state.multi || !state._selected.length);
        trigger.disabled = state.disabled;
        trigger.setAttribute('aria-label',
          state.label + '：' + (summaryText || state.placeholder));
        setHidden(clearButton, !state.clearable || state.disabled || !state._selected.length);
        clearButton.disabled = state.disabled;
        root.classList.toggle('is-disabled', state.disabled);
        setHidden(indicator, false);
        if (layer) layer.el.setAttribute('aria-label', state.label);
        readLive(live, state._selected.length ?
          ('已选择 ' + state._selected.length + ' 项：' + summaryText) : '未选择树形项');
        updatePanelHint();
        syncOpenState();
      }

      function ensureLayer() {
        if (layer) return layer;
        panelEl = make('div', 'nui-treeselect__panel');
        panelEl.id = panelId;
        panelEl.tabIndex = -1;
        treeHost = make('div', 'nui-treeselect__tree');
        emptyEl = make('p', 'nui-treeselect__empty', state.emptyText);
        hintEl = make('p', 'nui-treeselect__hint');
        var help = make('p', 'hnv-visually-hidden',
          '使用上下方向键在树中移动，左右方向键展开或收起，Enter 选择，Esc 关闭。');
        help.id = helpId;
        append(panelEl, treeHost, emptyEl, hintEl, help);
        layer = C.floating.create({
          anchor: trigger,
          content: panelEl,
          placement: 'bottom-start',
          offset: 6,
          role: 'dialog',
          className: 'nui-treeselect__popup',
          modal: false,
          trapFocus: true,
          returnFocus: true,
          closeOnEsc: true,
          closeOnOutside: true,
          lockScroll: false,
          maxWidth: 'min(94vw, 30rem)',
          onOpen: function () {
            state._open = true;
            syncOpenState();
          },
          onClose: function () {
            state._open = false;
            syncOpenState();
          }
        });
        layer.el.setAttribute('aria-label', state.label);
        layer.el.setAttribute('aria-describedby', helpId);
        updatePanelHint();
        return layer;
      }

      function destroyTree() {
        if (treeView) {
          try { treeView.destroy(); } catch (error) {}
          treeView = null;
        }
        if (treeHost) treeHost.replaceChildren();
      }

      function buildTree() {
        ensureLayer();
        destroyTree();
        setHidden(emptyEl, !!state.nodes.length);
        setHidden(treeHost, !state.nodes.length);
        if (!state.nodes.length) {
          state._treeStale = false;
          return;
        }
        var values = selectedValues();
        treeView = NoteUI.TreeView.mount(treeHost, {
          nodes: state.nodes,
          expanded: state.expanded,
          selected: treeSelectedShape(values, state.multi),
          multi: state.multi,
          label: state.label,
          onSelect: function (selection, event) {
            treeSelected(selection, event);
          }
        });
        state._treeStale = false;
      }

      function rememberSelection(values, event) {
        var normalized = normalizeTreeValue(values, state.multi);
        var old = selectedValues();
        if (signatureOf(normalized) === signatureOf(old)) return false;
        state.value = state.multi ? normalized.slice() : (normalized.length ? normalized[normalized.length - 1] : null);
        state._selected = normalized;
        renderTrigger();
        return true;
      }

      function treeSelected(selection, event) {
        if (!alive) return;
        var changed = rememberSelection(selection, event);
        if (!changed) return;
        if (!state.multi && layer && layer.isOpen()) layer.close('select');
        if (typeof state.onChange === 'function') {
          var value = state.multi ? selectedValues().slice() : (state._selected.length ? state._selected[state._selected.length - 1] : null);
          state.onChange(value, selectedNodes(state._selected), event || null);
        }
      }

      function focusTree() {
        if (!treeView || !treeView.el) {
          if (panelEl) focusNode(panelEl);
          return;
        }
        var item = treeView.el.querySelector('[role="treeitem"][tabindex="0"]');
        if (!item) item = treeView.el.querySelector('[role="treeitem"]');
        if (item) {
          if (item.tabIndex < 0) item.tabIndex = 0;
          focusNode(item);
          return;
        }
        if (!focusNode(treeView.el)) focusNode(panelEl);
      }

      function openPanel() {
        if (state.disabled || !alive) return;
        ensureLayer();
        if (state._treeStale) buildTree();
        updatePanelHint();
        layer.open();
        syncOpenState();
        focusTree();
      }

      function closePanel(reason) {
        if (layer && layer.isOpen()) layer.close(reason || 'api');
        syncOpenState();
      }

      function togglePanel() {
        if (layer && layer.isOpen()) closePanel('api');
        else openPanel();
      }

      function clearValue(event) {
        if (state.disabled || !state.clearable || !state._selected.length) return;
        state.value = state.multi ? [] : null;
        state._selected = [];
        if (treeView) {
          try { treeView.update({ selected: state.multi ? [] : null }); } catch (error) {
            state._treeStale = true;
          }
        }
        closePanel('api');
        renderTrigger();
        if (typeof state.onChange === 'function') {
          state.onChange(state.multi ? [] : null, [], event);
        }
      }

      bag.on('click', function (event) {
        var action = event.target && event.target.closest ?
          event.target.closest('[data-treeselect-action]') : null;
        if (!action) {
          if (event.target === trigger || trigger.contains(event.target)) {
            event.preventDefault();
            togglePanel();
          }
          return;
        }
        var name = action.getAttribute('data-treeselect-action');
        if (name === 'toggle') {
          event.preventDefault();
          if (state._suppressAnchorClick) {
            state._suppressAnchorClick = false;
            return;
          }
          togglePanel();
        } else if (name === 'clear') {
          event.preventDefault();
          clearValue(event);
        }
      });
      bag.on('keydown', function (event) {
        if (event.target !== trigger) return;
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
          state._suppressAnchorClick = false;
          return;
        }
        if (event.key === 'ArrowDown' || event.key === 'Down' ||
            event.key === 'ArrowUp' || event.key === 'Up') {
          event.preventDefault();
          openPanel();
        }
      });
      trigger.setAttribute('data-treeselect-action', 'toggle');
      clearButton.setAttribute('data-treeselect-action', 'clear');
      windowBag.on('pointerdown', function (event) {
        var target = event.target;
        state._suppressAnchorClick = !!(layer && layer.isOpen() && target &&
          (target === trigger || trigger.contains(target)));
      }, true);

      function render() {
        renderTrigger();
        if (layer && layer.isOpen() && (state._treeStale || state.disabled)) {
          closePanel('api');
        }
      }

      var inst = C.component(root, state, render, function () {
        alive = false;
        bag.clear();
        windowBag.clear();
        destroyTree();
        if (layer) {
          layer.destroy();
          layer = null;
        }
        panelEl = null;
        treeHost = null;
        hintEl = null;
        emptyEl = null;
      });

      var baseUpdate = inst.update;
      inst.update = function (patch) {
        if (inst.destroyed || !patch || typeof patch !== 'object') return;
        /* Nodes and multi change the tree structure and require a rebuild; value,
         * expanded and label are pushed into the live TreeView instead, so a host
         * sync keeps expansion state the reader created in the popup. */
        if (own(patch, 'nodes') || own(patch, 'multi')) state._treeStale = true;
        if (own(patch, 'emptyText') && emptyEl) emptyEl.textContent = text(patch.emptyText);
        if (own(patch, 'nodes') && Array.isArray(patch.nodes)) state.nodes = patch.nodes;
        var result = baseUpdate(patch);
        if (!state._treeStale && treeView && typeof treeView.update === 'function') {
          try {
            if (own(patch, 'value')) {
              treeView.update({ selected: treeSelectedShape(selectedValues(), state.multi) });
            }
            if (own(patch, 'expanded')) treeView.update({ expanded: state.expanded });
            if (own(patch, 'label')) treeView.update({ label: state.label });
          } catch (error) {
            state._treeStale = true;
          }
        }
        return result;
      };

      inst.getValue = function () {
        if (state.multi) return selectedValues();
        var values = selectedValues();
        return values.length ? values[values.length - 1] : null;
      };

      renderTrigger();
      host.appendChild(root);
      return inst;
    }
  };

  /* -----------------------------------------------------------------------
   * X06 — TransferList
   * -------------------------------------------------------------------- */

  function normalizeTransferItems(items) {
    return (Array.isArray(items) ? items : []).filter(function (item) {
      return item != null;
    }).map(function (item) {
      if (typeof item !== 'object') {
        return { value: item, label: text(item), disabled: false, key: valueKey(item) };
      }
      var value = own(item, 'value') ? item.value : item.id;
      return {
        value: value,
        label: item.label == null ? text(value) : text(item.label),
        disabled: Boolean(item.disabled),
        key: valueKey(value)
      };
    });
  }

  function normalizeTransferTitles(titles) {
    if (Array.isArray(titles)) {
      return {
        source: titles[0] == null ? '候选' : text(titles[0]),
        target: titles[1] == null ? '已选' : text(titles[1])
      };
    }
    if (titles && typeof titles === 'object') {
      return {
        source: titles.source == null ? '候选' : text(titles.source),
        target: titles.target == null ? '已选' : text(titles.target)
      };
    }
    return { source: '候选', target: '已选' };
  }

  NoteUI.TransferList = {
    version: VERSION,
    mount: function (host, options) {
      validateHost(host);
      var C = core();
      var input = options && typeof options === 'object' ? options : {};
      var root = make('div', 'nui-transfer');
      var layout = make('div', 'nui-transfer__layout');
      var baseId = uid('nui-transfer');
      var bag = C.listeners(root);
      var alive = true;
      var state = {
        source: normalizeTransferItems(input.source),
        target: normalizeTransferItems(input.target),
        titles: normalizeTransferTitles(input.titles),
        filterable: input.filterable !== false,
        disabled: Boolean(input.disabled),
        label: input.label == null ? '穿梭选择' : text(input.label),
        onChange: typeof input.onChange === 'function' ? input.onChange : null,
        filters: { source: '', target: '' },
        selected: { source: Object.create(null), target: Object.create(null) }
      };

      root.setAttribute('role', 'group');
      root.setAttribute('aria-label', state.label);

      function buildSide(side, label) {
        var section = make('section', 'nui-transfer__side');
        var titleId = baseId + '-title-' + side;
        var filterId = baseId + '-filter-' + side;
        var header = make('div', 'nui-transfer__header');
        var title = make('span', 'nui-transfer__title', label);
        var count = make('span', 'nui-transfer__count');
        var filterWrap = make('label', 'nui-transfer__filter');
        var filter = make('input', 'nui-transfer__search');
        var list = make('div', 'nui-transfer__list');
        var empty = make('p', 'nui-transfer__empty');
        title.id = titleId;
        section.setAttribute('aria-labelledby', titleId);
        filter.htmlFor = filterId;
        filter.id = filterId;
        filter.type = 'search';
        filter.autocomplete = 'off';
        filter.setAttribute('data-transfer-filter', side);
        filter.setAttribute('placeholder', '筛选' + label);
        var filterCap = make('span', 'hnv-visually-hidden', '筛选' + label);
        filterWrap.appendChild(filterCap);
        filterWrap.appendChild(filter);
        list.setAttribute('role', 'list');
        list.setAttribute('aria-label', label + '选项');
        empty.setAttribute('role', 'status');
        append(header, title, count);
        append(section, header, filterWrap, list, empty);
        return {
          section: section,
          title: title,
          titleId: titleId,
          count: count,
          filterWrap: filterWrap,
          filter: filter,
          list: list,
          empty: empty
        };
      }

      function buildAction(direction) {
        var button = make('button', 'nui-transfer__action');
        var glyph = make('span', 'nui-transfer__action-glyph');
        var label = make('span', 'nui-transfer__action-label');
        var count = make('span', 'nui-transfer__action-count');
        button.type = 'button';
        button.setAttribute('data-transfer-action', direction);
        glyph.setAttribute('aria-hidden', 'true');
        count.setAttribute('aria-hidden', 'true');
        append(button, glyph, label, count);
        return { button: button, glyph: glyph, label: label, count: count };
      }

      var sides = {
        source: buildSide('source', state.titles.source),
        target: buildSide('target', state.titles.target)
      };
      var actions = make('div', 'nui-transfer__actions');
      actions.setAttribute('role', 'group');
      actions.setAttribute('aria-label', '移动选项');
      var toTarget = buildAction('to-target');
      var toSource = buildAction('to-source');
      toTarget.glyph.textContent = '→';
      toSource.glyph.textContent = '←';
      append(actions, toTarget.button, toSource.button);
      var note = make('p', 'nui-transfer__note',
        '使用复选框选择后移动；两侧筛选互不影响，筛选只改变列表显示。');
      var live = make('span', 'nui-transfer__live hnv-visually-hidden');
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('aria-atomic', 'true');
      append(layout, sides.source.section, actions, sides.target.section);
      append(root, layout, note, live);

      function otherSide(side) {
        return side === 'source' ? 'target' : 'source';
      }

      function sideItems(side) {
        return side === 'source' ? state.source : state.target;
      }

      function pruneSelection() {
        ['source', 'target'].forEach(function (side) {
          var selected = state.selected[side];
          var present = Object.create(null);
          sideItems(side).forEach(function (item) {
            if (!item.disabled && own(selected, item.key)) present[item.key] = true;
          });
          state.selected[side] = present;
        });
      }

      function selectedItems(side) {
        var map = state.selected[side];
        return sideItems(side).filter(function (item) {
          return !item.disabled && own(map, item.key);
        });
      }

      function filteredItems(side) {
        var query = state.filters[side].trim().toLowerCase();
        if (!query) return sideItems(side).slice();
        var terms = query.split(/\s+/);
        return sideItems(side).filter(function (item) {
          var haystack = (item.label + ' ' + text(item.value)).toLowerCase();
          return terms.every(function (term) { return haystack.indexOf(term) >= 0; });
        });
      }

      function updateActionButton(entry, side, count) {
        var title = state.titles[otherSide(side)];
        entry.button.disabled = state.disabled || !count;
        entry.label.textContent = '移至' + title;
        entry.count.textContent = count ? String(count) : '';
        entry.button.setAttribute('aria-label', count ?
          '将 ' + count + ' 项移至' + title : '没有选中的' + state.titles[side] + '项可移动');
      }

      function syncActions() {
        var sourceSelected = selectedItems('source').length;
        var targetSelected = selectedItems('target').length;
        updateActionButton(toTarget, 'source', sourceSelected);
        updateActionButton(toSource, 'target', targetSelected);
        root.classList.toggle('is-disabled', state.disabled);
        if (state.disabled) root.setAttribute('aria-disabled', 'true');
        else root.removeAttribute('aria-disabled');
      }

      function renderSide(side) {
        var entry = sides[side];
        var all = sideItems(side);
        var filtered = filteredItems(side);
        var query = state.filters[side].trim();
        entry.title.textContent = state.titles[side];
        setHidden(entry.filterWrap, !state.filterable);
        entry.filter.disabled = state.disabled;
        if (entry.filter.value !== state.filters[side]) entry.filter.value = state.filters[side];
        entry.filter.setAttribute('placeholder', '筛选' + state.titles[side]);
        entry.count.textContent = query ?
          filtered.length + ' / ' + all.length + ' 项' : all.length + ' 项';
        entry.list.replaceChildren();
        filtered.forEach(function (item) {
          var row = make('div', 'nui-transfer__item');
          row.setAttribute('role', 'listitem');
          var label = make('label', 'nui-transfer__item-label');
          var checkbox = make('input', 'nui-transfer__checkbox');
          checkbox.type = 'checkbox';
          checkbox.setAttribute('data-transfer-side', side);
          checkbox.setAttribute('data-transfer-key', item.key);
          checkbox.checked = own(state.selected[side], item.key);
          checkbox.disabled = state.disabled || item.disabled;
          var labelText = make('span', 'nui-transfer__item-text', item.label);
          append(label, checkbox, labelText);
          if (item.disabled) {
            row.classList.add('is-disabled');
            var flag = make('span', 'nui-transfer__item-flag', '不可移动');
            label.appendChild(flag);
          }
          row.appendChild(label);
          entry.list.appendChild(row);
        });
        entry.list.hidden = filtered.length === 0;
        if (!filtered.length) {
          entry.empty.textContent = query ? '没有匹配项' : (side === 'source' ? '暂无候选' : '暂无已选项');
          setHidden(entry.empty, false);
        } else {
          setHidden(entry.empty, true);
        }
      }

      function render() {
        state.source = normalizeTransferItems(state.source);
        state.target = normalizeTransferItems(state.target);
        state.titles = normalizeTransferTitles(state.titles);
        pruneSelection();
        root.setAttribute('aria-label', state.label);
        sides.source.title.textContent = state.titles.source;
        sides.target.title.textContent = state.titles.target;
        renderSide('source');
        renderSide('target');
        syncActions();
      }

      function updateSelection(side, key, checked) {
        if (state.disabled) return;
        if (checked) state.selected[side][key] = true;
        else delete state.selected[side][key];
        syncActions();
      }

      function move(from, event) {
        if (state.disabled) return;
        var destination = otherSide(from);
        var moving = selectedItems(from);
        if (!moving.length) return;
        var movingKeys = Object.create(null);
        moving.forEach(function (item) { movingKeys[item.key] = true; });
        var fromItems = sideItems(from).filter(function (item) { return !own(movingKeys, item.key); });
        var toItems = sideItems(destination).concat(moving);
        if (from === 'source') {
          state.source = fromItems;
          state.target = toItems;
        } else {
          state.target = fromItems;
          state.source = toItems;
        }
        state.selected[from] = Object.create(null);
        render();
        readLive(live, '已将 ' + moving.length + ' 项移至' + state.titles[destination]);
        if (typeof state.onChange === 'function') {
          state.onChange(state.target.map(function (item) { return item.value; }),
            moving.map(function (item) { return item.value; }), event);
        }
      }

      bag.on('input', function (event) {
        var filter = event.target && event.target.closest ?
          event.target.closest('[data-transfer-filter]') : null;
        if (!filter || !root.contains(filter)) return;
        var side = filter.getAttribute('data-transfer-filter');
        if (side !== 'source' && side !== 'target') return;
        state.filters[side] = filter.value;
        renderSide(side);
      });
      bag.on('change', function (event) {
        var checkbox = event.target;
        if (!checkbox || checkbox.type !== 'checkbox' ||
            !checkbox.hasAttribute('data-transfer-side')) return;
        var side = checkbox.getAttribute('data-transfer-side');
        var key = checkbox.getAttribute('data-transfer-key');
        if ((side !== 'source' && side !== 'target') || !key) return;
        updateSelection(side, key, checkbox.checked);
      });
      bag.on('click', function (event) {
        var button = event.target && event.target.closest ?
          event.target.closest('[data-transfer-action]') : null;
        if (!button || !root.contains(button)) return;
        if (button.disabled) return;
        var direction = button.getAttribute('data-transfer-action');
        if (direction === 'to-target') move('source', event);
        else if (direction === 'to-source') move('target', event);
      });

      var inst = C.component(root, state, render, function () {
        alive = false;
        bag.clear();
      });
      inst.getValue = function () {
        return state.target.map(function (item) { return item.value; });
      };
      var baseUpdate = inst.update;
      inst.update = function (patch) {
        if (inst.destroyed || !patch || typeof patch !== 'object') return;
        var next = C.assign({}, patch);
        if (own(next, 'source')) next.source = normalizeTransferItems(next.source);
        if (own(next, 'target')) next.target = normalizeTransferItems(next.target);
        if (own(next, 'titles')) next.titles = normalizeTransferTitles(next.titles);
        return baseUpdate(next);
      };
      render();
      host.appendChild(root);
      return inst;
    }
  };
})(window);
