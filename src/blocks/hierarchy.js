/* NoteBlocks B09 — HierarchyDetail.
 * Composes public NoteUI.TreeView, NoteUI.Panel, NoteUI.DataObject,
 * NoteUI.Badge and NoteUI.Notice. The tree is a browsable directory, not a
 * mechanism diagram. Selection and detail content are host-owned.
 * No network, no timers, no implicit selection callbacks from update().
 * Loads after src/blocks/shared.js (internal helpers, not a public entry).
 */
(function (global) {
  'use strict';

  var NoteBlocks = global.NoteBlocks = global.NoteBlocks || {};

  var shared = global.NoteBlocksInternals;
  if (!shared) {
    throw new Error('NoteBlocks 组合块需要先加载 src/blocks/shared.js（内部共享文件）。');
  }
  var core = shared.core;
  var ui = shared.ui;
  var own = shared.own;
  var text = shared.text;
  var isNode = shared.isNode;
  var make = shared.make;
  var clear = shared.clear;
  var setContent = shared.setContent;
  var uniqueId = shared.uniqueId;
  var validateHost = shared.validateHost;
  var requireComponents = shared.requireComponents;
  var safeDestroy = shared.safeDestroy;
  var DEFAULT_LABELS = {
    block: '层级与详情',
    tree: '目录',
    detail: '条目详情',
    empty: '从目录中选择一个条目以查看详情。',
    noDetail: '该条目暂时没有提供详情内容。',
    fields: '字段',
    note: '说明'
  };

  function normalizeLabels(input) {
    var result = Object.assign({}, DEFAULT_LABELS);
    if (typeof input === 'string' && input.trim()) {
      result.tree = input;
    } else if (input && typeof input === 'object') {
      Object.keys(DEFAULT_LABELS).forEach(function (key) {
        if (input[key] != null && text(input[key]).trim()) result[key] = text(input[key]);
      });
    }
    return result;
  }

  function findNode(nodes, id, trail) {
    if (id == null) return null;
    var wanted = text(id);
    var path = trail || [];
    var list = Array.isArray(nodes) ? nodes : [];
    for (var i = 0; i < list.length; i += 1) {
      var node = list[i];
      if (!node || typeof node !== 'object') continue;
      var current = path.concat(node.id == null ? [] : [text(node.id)]);
      if (node.id != null && text(node.id) === wanted) {
        return { node: node, path: current };
      }
      if (Array.isArray(node.children) && node.children.length) {
        var found = findNode(node.children, wanted, current);
        if (found) return found;
      }
    }
    return null;
  }

  function selectablePath(nodes, id) {
    var found = findNode(nodes, id, []);
    if (!found) return null;
    return {
      node: found.node,
      ancestors: found.path.slice(0, -1)
    };
  }

  function singleSelection(value) {
    if (Array.isArray(value)) return value.length ? value[0] : null;
    return value;
  }

  NoteBlocks.HierarchyDetail = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host, 'NoteBlocks.HierarchyDetail');
      requireComponents('NoteBlocks.HierarchyDetail', ['NoteUI.TreeView', 'NoteUI.Panel', 'NoteUI.DataObject', 'NoteUI.Badge', 'NoteUI.Notice']);
      var UI = ui();
      var C = core();
      var input = options || {};
      var state = {
        nodes: Array.isArray(input.nodes) ? input.nodes.slice() : [],
        selected: singleSelection(input.selected),
        details: input.details && typeof input.details === 'object' ? input.details : {},
        labels: normalizeLabels(input.labels),
        onSelect: typeof input.onSelect === 'function' ? input.onSelect : null
      };
      var destroyed = false;
      var tree = null;
      var treePanel = null;
      var detailPanel = null;
      var selectedId = state.selected == null ? null : text(state.selected);
      var detailInstances = [];
      var renderedDetailId = null;
      var titleId = uniqueId('nblk-hierarchy-detail-title');

      var root = make('section', 'nblk-hierarchy');
      root.setAttribute('role', 'group');
      root.setAttribute('aria-label', state.labels.block);

      treePanel = UI.Panel.mount(root, {
        title: state.labels.tree,
        padding: 'sm',
        tone: 'plain'
      });
      var treeHost = make('div', 'nblk-hierarchy__tree');
      treePanel.body.appendChild(treeHost);

      detailPanel = UI.Panel.mount(root, {
        title: state.labels.detail,
        padding: 'sm',
        tone: 'plain'
      });
      var detailScroll = make('div', 'nblk-hierarchy__detail-scroll');
      detailScroll.tabIndex = 0;
      detailScroll.setAttribute('role', 'region');
      detailScroll.setAttribute('aria-label', state.labels.detail);
      detailPanel.body.appendChild(detailScroll);

      function detailEntry(id) {
        if (id == null) return null;
        var key = text(id);
        return state.details && own(state.details, key) ? state.details[key] : null;
      }

      function nodeLabel(id) {
        var found = findNode(state.nodes, id, []);
        return found && found.node && found.node.label != null ? text(found.node.label) : (id == null ? '' : text(id));
      }

      function clearDetail() {
        detailInstances.forEach(safeDestroy);
        detailInstances = [];
        clear(detailScroll);
      }

      function normalizeFields(value) {
        if (Array.isArray(value)) return value;
        if (value && typeof value === 'object' && !isNode(value)) {
          return Object.keys(value).map(function (key) {
            return { label: key, value: value[key] };
          });
        }
        return [];
      }

      function renderDetail() {
        var previousTop = detailScroll.scrollTop;
        var nextId = selectedId;
        var keepScroll = nextId === renderedDetailId;
        clearDetail();
        var entry = detailEntry(nextId);
        var objectLabel = nodeLabel(nextId);

        if (nextId == null) {
          var emptyNotice = UI.Notice.mount(detailScroll, {
            title: state.labels.empty,
            content: '目录选中项会同步到这里；选择变化不会重建目录树。',
            tone: 'neutral'
          });
          detailInstances.push(emptyNotice);
          renderedDetailId = null;
          detailScroll.scrollTop = 0;
          return;
        }

        var heading = make('h3', 'nblk-hierarchy__detail-title');
        heading.id = titleId;
        heading.setAttribute('aria-live', 'polite');
        heading.textContent = entry && entry.title != null
          ? text(entry.title)
          : (objectLabel || text(nextId));
        detailScroll.appendChild(heading);
        var subtitle = make('p', 'nblk-hierarchy__detail-id',
          '目录项：' + (objectLabel || text(nextId)));
        detailScroll.appendChild(subtitle);

        if (!entry) {
          var noDetail = UI.Notice.mount(detailScroll, {
            title: state.labels.noDetail,
            content: '目录仍保持选中；宿主可在 details 中补充该 id 的详情。',
            tone: 'neutral'
          });
          detailInstances.push(noDetail);
          renderedDetailId = nextId;
          detailScroll.scrollTop = keepScroll ? previousTop : 0;
          return;
        }

        var fields = normalizeFields(entry.fields);
        if (fields.length) {
          var fieldSection = make('section', 'nblk-hierarchy__fields-section');
          fieldSection.setAttribute('aria-label', state.labels.fields);
          var fieldsHeading = make('h4', 'nblk-hierarchy__section-title', state.labels.fields);
          fieldSection.appendChild(fieldsHeading);
          var fieldsGrid = make('div', 'nblk-hierarchy__fields');
          fields.forEach(function (field, index) {
            var source = field && typeof field === 'object' ? field : { value: field };
            var fieldWrap = make('div', 'nblk-hierarchy__field');
            if (source.changed) {
              var badge = UI.Badge.mount(fieldWrap, { label: '本步变化', tone: 'warning' });
              detailInstances.push(badge);
            }
            var label = source.label != null ? text(source.label)
              : (source.name != null ? text(source.name)
                : (source.key != null ? text(source.key) : '字段 ' + (index + 1)));
            var value = source.value == null ? '' : source.value;
            var unit = source.unit == null ? '' : text(source.unit).trim();
            if (unit && !isNode(value)) value = text(value) + ' ' + unit;
            else if (unit && isNode(value)) {
              var valueWrap = make('span', 'nblk-hierarchy__value-with-unit');
              valueWrap.appendChild(value);
              valueWrap.appendChild(make('span', 'nblk-hierarchy__unit', ' ' + unit));
              value = valueWrap;
            }
            var dataObject = UI.DataObject.mount(fieldWrap, {
              label: label,
              value: value,
              caption: source.caption == null ? (source.note == null ? '' : source.note) : source.caption,
              attention: Boolean(source.attention),
              changed: Boolean(source.changed)
            });
            detailInstances.push(dataObject);
            fieldsGrid.appendChild(fieldWrap);
          });
          fieldSection.appendChild(fieldsGrid);
          detailScroll.appendChild(fieldSection);
        }

        if (entry.content != null && !(typeof entry.content === 'string' && !entry.content.trim())) {
          var contentSection = make('section', 'nblk-hierarchy__content-section');
          contentSection.setAttribute('aria-label', '详情内容');
          var content = make('div', 'nblk-hierarchy__content');
          setContent(content, entry.content);
          contentSection.appendChild(content);
          detailScroll.appendChild(contentSection);
        }

        if (entry.note != null && text(entry.note).trim()) {
          var noteHost = make('div', 'nblk-hierarchy__note');
          var notice = UI.Notice.mount(noteHost, {
            title: state.labels.note,
            content: entry.note,
            tone: 'neutral'
          });
          detailInstances.push(notice);
          detailScroll.appendChild(noteHost);
        }

        renderedDetailId = nextId;
        detailScroll.scrollTop = keepScroll ? previousTop : 0;
      }

      function revealSelected() {
        if (!tree || selectedId == null) return;
        var target = typeof tree.getTarget === 'function' ? tree.getTarget(selectedId) : null;
        if (target && typeof C.scrollIntoViewIfNeeded === 'function') {
          C.scrollIntoViewIfNeeded(target, tree.el, { block: 'nearest', inline: 'nearest' });
        }
      }

      function syncSelectionFromTree(reveal) {
        var value = tree.getSelected();
        selectedId = value == null ? null : text(value);
        renderDetail();
        if (reveal) revealSelected();
      }

      function expandAncestors(id) {
        var path = selectablePath(state.nodes, id);
        if (!path) return null;
        path.ancestors.forEach(function (ancestorId) {
          try { tree.expand(ancestorId, true); } catch (error) { /* public method; keep going */ }
        });
        return path;
      }

      function selectInternal(id, settings) {
        if (destroyed) return false;
        var requested = singleSelection(id);
        var targetId = requested == null ? null : text(requested);
        var path = targetId == null ? null : selectablePath(state.nodes, targetId);
        if (targetId != null && !path) return false;
        var previous = selectedId;
        if (targetId != null) expandAncestors(targetId);
        try {
          tree.select(targetId, { silent: true });
        } catch (error) {
          return false;
        }
        syncSelectionFromTree(Boolean(settings && settings.reveal));
        if (previous !== selectedId && settings && settings.notify && typeof state.onSelect === 'function') {
          state.onSelect(selectedId, settings.event || null);
        }
        return previous !== selectedId;
      }

      function onTreeSelect(selected, event) {
        if (destroyed) return;
        selectedId = selected == null ? null : text(selected);
        renderDetail();
        if (typeof state.onSelect === 'function') state.onSelect(selectedId, event);
      }

      var initialPath = state.selected == null ? null : selectablePath(state.nodes, state.selected);
      var initialExpanded = initialPath ? initialPath.ancestors : [];
      tree = UI.TreeView.mount(treeHost, {
        nodes: state.nodes,
        expanded: initialExpanded,
        selected: state.selected,
        multi: false,
        label: state.labels.tree,
        onSelect: onTreeSelect
      });
      selectedId = tree.getSelected();
      if (selectedId != null) selectedId = text(selectedId);
      renderDetail();

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        var nodesChanged = own(patch, 'nodes');
        var labelsChanged = own(patch, 'labels');
        if (nodesChanged) state.nodes = Array.isArray(patch.nodes) ? patch.nodes.slice() : [];
        if (own(patch, 'details')) {
          state.details = patch.details && typeof patch.details === 'object' ? patch.details : {};
        }
        if (own(patch, 'onSelect')) state.onSelect = typeof patch.onSelect === 'function' ? patch.onSelect : null;
        if (labelsChanged) {
          if (typeof patch.labels === 'string') state.labels = normalizeLabels(patch.labels);
          else if (patch.labels && typeof patch.labels === 'object') {
            state.labels = normalizeLabels(Object.assign({}, state.labels, patch.labels));
          } else {
            state.labels = normalizeLabels(null);
          }
        }

        var treePatch = {};
        if (nodesChanged) treePatch.nodes = state.nodes;
        if (labelsChanged) treePatch.label = state.labels.tree;
        if (Object.keys(treePatch).length) tree.update(treePatch);

        /* 文案更新只改面板与详情，不重复重建详情一次。 */
        if (labelsChanged) {
          root.setAttribute('aria-label', state.labels.block);
          treePanel.update({ title: state.labels.tree });
          detailPanel.update({ title: state.labels.detail });
          detailScroll.setAttribute('aria-label', state.labels.detail);
        }

        if (own(patch, 'selected')) {
          selectInternal(patch.selected, { reveal: true });
        } else {
          var current = tree.getSelected();
          selectedId = current == null ? null : text(current);
          if (selectedId != null) {
            expandAncestors(selectedId);
            revealSelected();
          }
          renderDetail();
        }
      }

      function destroyBlock() {
        if (destroyed) return;
        destroyed = true;
        clearDetail();
        safeDestroy(tree);
        tree = null;
        safeDestroy(treePanel);
        treePanel = null;
        safeDestroy(detailPanel);
        detailPanel = null;
        root.remove();
      }

      host.appendChild(root);
      if (selectedId != null) revealSelected();

      return {
        el: root,
        select: function (id, selectOptions) {
          if (destroyed) return false;
          var settings = selectOptions && typeof selectOptions === 'object' ? selectOptions : {};
          var silent = settings.silent === true;
          return selectInternal(id, {
            reveal: true,
            notify: !silent,
            event: settings.event || null
          });
        },
        getSelected: function () {
          if (destroyed || !tree) return null;
          var value = tree.getSelected();
          return value == null ? null : value;
        },
        getTarget: function (id) {
          if (destroyed || id == null) return null;
          if (text(id) === 'detail') return detailPanel ? detailPanel.el : null;
          return tree && typeof tree.getTarget === 'function' ? tree.getTarget(id) : null;
        },
        update: update,
        destroy: destroyBlock
      };
    }
  };
})(window);
