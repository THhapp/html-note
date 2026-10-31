/* NoteBlocks comparison compositions — B03 RuleCompare, B04 StateCompare.
 * Plain JavaScript; depends on NoteCore, NoteUI.Table/Notice,
 * NoteViz.CompareView, NoteUI.DataObject/Badge and optionally NoteExpr.Focus.
 * This file composes public components only. It does not copy their markup.
 * Loads after src/blocks/shared.js (internal helpers, not a public entry).
 * No network, no eval, no HTML parsing. */
(function (global) {
  'use strict';

  var NoteBlocks = global.NoteBlocks = global.NoteBlocks || {};

  var shared = global.NoteBlocksInternals;
  if (!shared) {
    throw new Error('NoteBlocks 组合块需要先加载 src/blocks/shared.js（内部共享文件）。');
  }
  var core = shared.core;
  var ui = shared.ui;
  var viz = shared.viz;
  var text = shared.text;
  var isNode = shared.isNode;
  var make = shared.make;
  var clear = shared.clear;
  var setContent = shared.setContent;
  var uniqueId = shared.uniqueId;
  var validateHost = shared.validateHost;
  var requireComponents = shared.requireComponents;
  function contentText(value) {
    if (value == null) return '';
    if (isNode(value)) return text(value.textContent).trim();
    return text(value).trim();
  }

  function hasContent(value) {
    if (value == null) return false;
    if (typeof value === 'string') return value.trim() !== '';
    if (isNode(value)) return true;
    return true;
  }

  /* =====================================================================
   * B03 — RuleCompare
   * ===================================================================== */

  var DEFAULT_RULE_COLUMNS = [
    { key: 'rule', label: '规则', width: '18%' },
    { key: 'condition', label: '条件', width: '27%' },
    { key: 'result', label: '结果', width: '27%' },
    { key: 'note', label: '说明', width: '28%' }
  ];

  function normaliseColumns(input) {
    if (Array.isArray(input) && input.length) {
      var columns = input.filter(function (column) {
        return column && typeof column === 'object' && column.key != null && text(column.key) !== '';
      }).map(function (column, index) {
        var fallback = DEFAULT_RULE_COLUMNS.filter(function (item) {
          return String(item.key) === String(column.key);
        })[0];
        return Object.assign({}, column, {
          key: column.key,
          label: column.label != null ? column.label : (fallback ? fallback.label : text(column.key)),
          align: column.align
        });
      });
      if (columns.length) return columns;
    }
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      return DEFAULT_RULE_COLUMNS.map(function (column) {
        var copy = Object.assign({}, column);
        if (input[column.key] != null) copy.label = input[column.key];
        return copy;
      });
    }
    return DEFAULT_RULE_COLUMNS.map(function (column) { return Object.assign({}, column); });
  }

  function normaliseRuleRows(input) {
    var source = Array.isArray(input) ? input : [];
    return source.map(function (raw, index) {
      var data = raw && typeof raw === 'object' && !isNode(raw) ? raw : { label: raw };
      var id = data.id != null && text(data.id) !== '' ? text(data.id) : 'rule-' + index;
      var label = data.label != null ? data.label : id;
      var row = {};
      Object.keys(data).forEach(function (key) { row[key] = data[key]; });
      row.key = id;
      row.id = id;
      row.rule = label;
      row.label = label;
      return {
        id: id,
        label: label,
        labelText: contentText(label) || id,
        note: hasContent(data.note) ? data.note : null,
        raw: data,
        row: row
      };
    });
  }

  function listStrings(value) {
    var out = [];
    var seen = Object.create(null);
    function add(item) {
      if (item == null || item === false) return;
      if (Array.isArray(item)) {
        item.forEach(add);
        return;
      }
      if (typeof item === 'object') {
        if (Array.isArray(item.ids)) add(item.ids);
        else if (item.id != null) add(item.id);
        return;
      }
      var key = String(item);
      if (key === '' || seen[key]) return;
      seen[key] = true;
      out.push(key);
    }
    add(value);
    return out;
  }

  function normaliseEmphasis(input) {
    var rows = [];
    var columns = [];
    if (input == null) return { row: rows, column: columns };
    if (typeof input === 'string' || typeof input === 'number') {
      return { row: listStrings(input), column: columns };
    }
    if (Array.isArray(input)) {
      return { row: listStrings(input), column: columns };
    }
    if (typeof input === 'object') {
      if (input.row != null) rows = rows.concat(listStrings(input.row));
      if (input.rows != null) rows = rows.concat(listStrings(input.rows));
      if (input.id != null && input.row == null && input.rows == null) rows = rows.concat(listStrings(input.id));
      if (input.column != null) columns = columns.concat(listStrings(input.column));
      if (input.columns != null) columns = columns.concat(listStrings(input.columns));
    }
    function unique(items) {
      var found = Object.create(null);
      return items.filter(function (item) {
        if (found[item]) return false;
        found[item] = true;
        return true;
      });
    }
    return { row: unique(rows), column: unique(columns) };
  }

  function rowNoteText(note) {
    if (isNode(note)) return text(note.textContent).trim();
    return note;
  }

  NoteBlocks.RuleCompare = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      requireComponents('NoteBlocks', ['NoteUI.Table', 'NoteUI.Notice']);
      var UI = ui();
      var state = Object.assign({
        rules: [],
        columns: null,
        caption: '',
        emphasize: null,
        note: null,
        label: ''
      }, options || {});
      var destroyed = false;
      var notices = [];

      var root = make('section', 'nblk-rule-compare');
      var emphasisNote = make('p', 'nblk-rule-compare__emphasis');
      var tableHost = make('div', 'nblk-rule-compare__table');
      var notesSection = make('section', 'nblk-rule-compare__notes');
      var notesTitle = make('h4', 'nblk-rule-compare__notes-title', '规则说明');
      var notesList = make('div', 'nblk-rule-compare__notice-list');
      emphasisNote.hidden = true;
      notesSection.hidden = true;
      notesSection.setAttribute('aria-label', '规则说明');
      notesSection.append(notesTitle, notesList);
      root.append(emphasisNote, tableHost, notesSection);

      var table = UI.Table.mount(tableHost, {
        columns: normaliseColumns(state.columns),
        rows: [],
        rowKey: 'id',
        caption: '',
        empty: '暂无规则数据',
        sort: false,
        emphasis: { row: [], column: [] }
      });

      function applyRootLabel() {
        var label = text(state.label).trim() || text(contentText(state.caption)) || '规则对照';
        root.setAttribute('aria-label', label);
      }

      function destroyNotices() {
        notices.forEach(function (instance) {
          try { instance.destroy(); } catch (error) { /* keep cleanup moving */ }
        });
        notices = [];
        clear(notesList);
      }

      function findRule(rules, id) {
        for (var i = 0; i < rules.length; i += 1) {
          if (rules[i].id === id) return rules[i];
        }
        return null;
      }

      function renderEmphasisSummary(rules, columns, emphasis) {
        var rowLabels = [];
        var columnLabels = [];
        emphasis.row.forEach(function (id) {
          var rule = findRule(rules, id);
          if (rule) rowLabels.push(rule.labelText);
        });
        emphasis.column.forEach(function (key) {
          columns.forEach(function (column) {
            if (String(column.key) === key) {
              var label = contentText(column.label) || key;
              if (columnLabels.indexOf(label) < 0) columnLabels.push(label);
            }
          });
        });
        var bits = [];
        if (rowLabels.length) bits.push('强调行：' + rowLabels.join('、') + '。');
        if (columnLabels.length) bits.push('强调列：' + columnLabels.join('、') + '。');
        emphasisNote.textContent = bits.join(' ');
        emphasisNote.hidden = bits.length === 0;
      }

      function renderNotices(rules, emphasis) {
        destroyNotices();
        var emphasized = Object.create(null);
        emphasis.row.forEach(function (id) { emphasized[id] = true; });
        var noticeCount = 0;
        emphasis.row.forEach(function (id) {
          var rule = findRule(rules, id);
          if (!rule || !emphasized[rule.id] || !rule.note) return;
          var content = rowNoteText(rule.note);
          if (!hasContent(content)) return;
          var instance = UI.Notice.mount(notesList, {
            title: rule.labelText + ' · 规则说明',
            content: content,
            tone: 'accent'
          });
          notices.push(instance);
          noticeCount += 1;
          delete emphasized[rule.id];
        });
        if (hasContent(state.note)) {
          var noteInstance = UI.Notice.mount(notesList, {
            title: '补充说明',
            content: state.note,
            tone: 'neutral'
          });
          notices.push(noteInstance);
          noticeCount += 1;
        }
        notesSection.hidden = noticeCount === 0;
      }

      function applyData() {
        var columns = normaliseColumns(state.columns);
        var rules = normaliseRuleRows(state.rules);
        var emphasis = normaliseEmphasis(state.emphasize);
        var rows = rules.map(function (rule) { return rule.row; });
        table.update({
          columns: columns,
          rows: rows,
          rowKey: 'id',
          caption: state.caption == null ? '' : state.caption,
          empty: '暂无规则数据',
          emphasis: { row: emphasis.row, column: emphasis.column }
        });
        renderEmphasisSummary(rules, columns, emphasis);
        renderNotices(rules, emphasis);
        applyRootLabel();
      }

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        Object.keys(patch).forEach(function (key) { state[key] = patch[key]; });
        applyData();
      }

      function destroy() {
        if (destroyed) return;
        destroyed = true;
        destroyNotices();
        try { table.destroy(); } catch (error) { /* optional */ }
        root.remove();
      }

      applyData();
      host.appendChild(root);

      return {
        el: root,
        update: update,
        destroy: destroy,
        getTarget: function (id) {
          if (destroyed) return null;
          return table.getTarget(id);
        }
      };
    }
  };

  /* =====================================================================
   * B04 — StateCompare
   * ===================================================================== */

  function compareIds(value) {
    var out = [];
    var seen = Object.create(null);
    function add(item) {
      if (item == null || item === false) return;
      if (Array.isArray(item)) {
        item.forEach(add);
        return;
      }
      if (item instanceof Set) {
        item.forEach(add);
        return;
      }
      if (typeof item === 'object') {
        if (Array.isArray(item.ids)) add(item.ids);
        else if (item.id != null) add(item.id);
        return;
      }
      var id = String(item);
      if (id === '' || seen[id]) return;
      seen[id] = true;
      out.push(id);
    }
    add(value);
    return out;
  }

  function normaliseObjects(input) {
    if (!Array.isArray(input)) return null;
    return input.map(function (raw, index) {
      var data = raw && typeof raw === 'object' && !isNode(raw) ? raw : { value: raw };
      var id = data.id != null && text(data.id) !== '' ? text(data.id) : 'object-' + index;
      return {
        id: id,
        label: data.label == null ? '' : text(data.label),
        value: data.value,
        caption: data.caption == null ? '' : text(data.caption),
        raw: data
      };
    });
  }

  function valueText(value) {
    if (value == null) return '空';
    if (isNode(value)) return text(value.textContent).trim() || '（对象内容）';
    return text(value);
  }

  function objectById(list, id) {
    if (!list) return null;
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  NoteBlocks.StateCompare = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      requireComponents('NoteBlocks', ['NoteUI.DataObject', 'NoteUI.Badge']);
      if (!viz().CompareView || typeof viz().CompareView.mount !== 'function') {
        throw new Error('NoteBlocks.StateCompare 需要先加载 NoteViz.CompareView。');
      }
      var UI = ui();
      var C = core();
      var state = Object.assign({
        before: null,
        after: null,
        changed: [],
        invariant: [],
        caption: '',
        mode: 'side-by-side',
        label: '',
        focusChanged: false
      }, options || {});
      var destroyed = false;
      var compare = null;
      var objectsById = { before: new Map(), after: new Map() };
      var childInstances = [];
      var focus = null;
      var focusFrame = 0;
      var focusToken = 0;
      var root = make('section', 'nblk-state-compare');
      var caption = make('p', 'nblk-state-compare__caption');
      var views = make('div', 'nblk-state-compare__views');
      var summary = make('div', 'nblk-state-compare__summary');
      var captionId = uniqueId('nblk-state-caption');
      caption.id = captionId;
      caption.hidden = true;
      root.append(caption, views, summary);

      var leftContent = make('div', 'nblk-state-compare__objects');
      var rightContent = make('div', 'nblk-state-compare__objects');
      leftContent.setAttribute('data-side', 'before');
      rightContent.setAttribute('data-side', 'after');

      function makeSideContent(objects, side, changedSet, invariantSet) {
        var content = side === 'before' ? leftContent : rightContent;
        clear(content);
        if (!objects) return content;
        if (!objects.length) {
          content.appendChild(make('p', 'nblk-state-compare__empty',
            side === 'before' ? '变化前没有对象。' : '变化后没有对象。'));
          return content;
        }
        objects.forEach(function (object) {
          var isChanged = changedSet[object.id] === true;
          var isInvariant = !isChanged && invariantSet[object.id] === true;
          var cell = make('div', 'nblk-state-compare__object');
          cell.setAttribute('data-object-id', object.id);
          cell.setAttribute('data-side', side);
          if (isChanged) cell.setAttribute('data-mark', 'changed');
          else if (isInvariant) cell.setAttribute('data-mark', 'invariant');
          var data = UI.DataObject.mount(cell, {
            label: object.label,
            value: object.value,
            caption: object.caption,
            changed: isChanged
          });
          childInstances.push(data);
          if (isChanged || isInvariant) {
            var flags = make('div', 'nblk-state-compare__flags');
            var badge = UI.Badge.mount(flags, {
              label: isChanged ? '本步变化' : '未变',
              tone: isChanged ? 'accent' : 'neutral'
            });
            childInstances.push(badge);
            flags.appendChild(make('span', 'nblk-state-compare__flag-copy',
              isChanged ? '相对于上一状态已更新。' : '此对象在本步保持原值。'));
            cell.appendChild(flags);
          }
          content.appendChild(cell);
          objectsById[side].set(object.id, data.el);
        });
        return content;
      }

      function destroyChildren() {
        childInstances.forEach(function (instance) {
          try { instance.destroy(); } catch (error) { /* keep cleanup moving */ }
        });
        childInstances = [];
        objectsById = { before: new Map(), after: new Map() };
        clear(leftContent);
        clear(rightContent);
      }

      function destroyFocus() {
        focusToken += 1;
        if (focusFrame) {
          if (typeof global.cancelAnimationFrame === 'function') global.cancelAnimationFrame(focusFrame);
          else global.clearTimeout(focusFrame);
          focusFrame = 0;
        }
        if (focus) {
          try { focus.hide(); } catch (error) { /* optional */ }
          try { focus.destroy(); } catch (error) { /* optional */ }
          focus = null;
        }
      }

      function ensureFocus() {
        var expr = global.NoteExpr;
        if (!expr || !expr.Focus || typeof expr.Focus.mount !== 'function') return null;
        var reduced = false;
        if (C.motion && typeof C.motion.reduced === 'function') {
          try { reduced = C.motion.reduced(); } catch (error) { reduced = false; }
        }
        try {
          return expr.Focus.mount({ motion: reduced ? 'never' : 'auto' });
        } catch (error) {
          return null;
        }
      }

      function refreshFocus() {
        if (destroyed || !focus) return;
        try { focus.refresh(); } catch (error) { /* optional */ }
      }

      function scheduleFocus(target) {
        destroyFocus();
        if (destroyed || !state.focusChanged || !target) return;
        var token = focusToken;
        var run = function () {
          focusFrame = 0;
          if (destroyed || token !== focusToken || !target.isConnected) return;
          focus = ensureFocus();
          if (!focus) return;
          try {
            focus.show(target);
          } catch (error) {
            try { focus.destroy(); } catch (ignore) { /* optional */ }
            focus = null;
          }
        };
        if (typeof global.requestAnimationFrame === 'function') {
          focusFrame = global.requestAnimationFrame(run);
        } else {
          focusFrame = global.setTimeout(run, 16);
        }
      }

      function findFocusTarget(changedIds) {
        for (var i = 0; i < changedIds.length; i += 1) {
          var id = changedIds[i];
          if (objectsById.after.has(id)) return objectsById.after.get(id);
          if (objectsById.before.has(id)) return objectsById.before.get(id);
        }
        return null;
      }

      function appendSummarySection(title, items, emptyText) {
        var section = make('section', 'nblk-state-compare__summary-section');
        section.appendChild(make('h4', 'nblk-state-compare__summary-title', title));
        if (items.length) {
          var list = make('ul', 'nblk-state-compare__summary-list');
          items.forEach(function (item) {
            list.appendChild(make('li', 'nblk-state-compare__summary-item', item));
          });
          section.appendChild(list);
        } else if (emptyText) {
          section.appendChild(make('p', 'nblk-state-compare__summary-text', emptyText));
        }
        return section;
      }

      function renderSummary(beforeObjects, afterObjects, changedIds, invariantIds) {
        clear(summary);
        var changeItems = [];
        changedIds.forEach(function (id) {
          var beforeObject = objectById(beforeObjects, id);
          var afterObject = objectById(afterObjects, id);
          var label = (afterObject && afterObject.label) || (beforeObject && beforeObject.label) || id;
          if (beforeObject && afterObject) {
            changeItems.push(label + '：' + valueText(beforeObject.value) + ' → ' + valueText(afterObject.value) + '。');
          } else if (afterObject) {
            changeItems.push(label + '：本步出现在变化后状态，值为 ' + valueText(afterObject.value) + '。');
          } else if (beforeObject) {
            changeItems.push(label + '：在变化后状态中不再出现。');
          } else {
            changeItems.push(id + '：宿主标记为变化，但两侧对象列表中没有找到该 ID。');
          }
        });
        summary.appendChild(appendSummarySection(
          '本步变化',
          changeItems,
          '本步没有标记变化对象。'
        ));

        if (invariantIds.length) {
          var invariantItems = [];
          invariantIds.forEach(function (id) {
            var beforeObject = objectById(beforeObjects, id);
            var afterObject = objectById(afterObjects, id);
            var label = (afterObject && afterObject.label) || (beforeObject && beforeObject.label) || id;
            if (beforeObject && afterObject) {
              var beforeValue = valueText(beforeObject.value);
              var afterValue = valueText(afterObject.value);
              if (beforeValue === afterValue) {
                invariantItems.push(label + '：两侧均为「' + beforeValue + '」，本步未变。');
              } else {
                invariantItems.push(label + '：宿主标记为未变；两侧显示值分别为「' +
                  beforeValue + '」与「' + afterValue + '」。');
              }
            } else if (beforeObject || afterObject) {
              invariantItems.push(label + '：只在一侧对象列表中出现；宿主标记为未变。');
            } else {
              invariantItems.push(id + '：宿主标记为未变，但两侧对象列表中没有找到该 ID。');
            }
          });
          summary.appendChild(appendSummarySection('保持未变', invariantItems, ''));
        }
      }

      function updateCaption() {
        var value = state.caption;
        var hasText = value != null && (isNode(value) ? true : text(value).trim() !== '');
        if (hasText) {
          setContent(caption, value);
          caption.hidden = false;
          root.setAttribute('aria-describedby', captionId);
        } else {
          clear(caption);
          caption.hidden = true;
          root.removeAttribute('aria-describedby');
        }
        var label = text(state.label).trim() || '前后状态对照';
        root.setAttribute('aria-label', label);
      }

      function rebuild() {
        if (destroyed) return;
        destroyFocus();
        destroyChildren();
        var beforeObjects = normaliseObjects(state.before);
        var afterObjects = normaliseObjects(state.after);
        var changedIds = compareIds(state.changed);
        var invariantIds = compareIds(state.invariant);
        var changedSet = Object.create(null);
        var invariantSet = Object.create(null);
        changedIds.forEach(function (id) { changedSet[id] = true; });
        invariantIds.forEach(function (id) {
          if (!changedSet[id]) invariantSet[id] = true;
        });
        var leftPresent = beforeObjects !== null;
        var rightPresent = afterObjects !== null;
        makeSideContent(beforeObjects, 'before', changedSet, invariantSet);
        makeSideContent(afterObjects, 'after', changedSet, invariantSet);

        var viewOptions = {
          left: leftPresent ? { title: '变化前', content: leftContent } : null,
          right: rightPresent ? { title: '变化后', content: rightContent } : null,
          mode: state.mode === 'stacked' ? 'stacked' : 'side-by-side',
          focusChanged: false,
          labels: {
            left: '变化前',
            right: '变化后',
            compare: '对照',
            changed: '变化侧',
            stacked: '容器较窄，已改为上下对照'
          }
        };
        if (!compare) {
          compare = viz().CompareView.mount(views, viewOptions);
        } else {
          compare.update(viewOptions);
        }
        renderSummary(beforeObjects, afterObjects, changedIds, invariantIds);
        updateCaption();
        scheduleFocus(findFocusTarget(changedIds));
      }

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        Object.keys(patch).forEach(function (key) { state[key] = patch[key]; });
        rebuild();
      }

      var resizeBag = null;
      var disconnectRootResize = null;
      if (C.listeners) {
        resizeBag = C.listeners(global);
        resizeBag.on('resize', refreshFocus);
      } else {
        global.addEventListener('resize', refreshFocus);
      }
      if (C.onResize) {
        disconnectRootResize = C.onResize(root, refreshFocus);
      }

      function destroy() {
        if (destroyed) return;
        destroyed = true;
        destroyFocus();
        destroyChildren();
        if (resizeBag) resizeBag.clear();
        else global.removeEventListener('resize', refreshFocus);
        if (disconnectRootResize) {
          try { disconnectRootResize(); } catch (error) { /* optional */ }
          disconnectRootResize = null;
        }
        if (compare) {
          try { compare.destroy(); } catch (error) { /* optional */ }
          compare = null;
        }
        root.remove();
      }

      rebuild();
      host.appendChild(root);

      return {
        el: root,
        update: update,
        destroy: destroy,
        getTarget: function (id) {
          if (destroyed) return null;
          if (id === 'left' || id === 'right') {
            return compare ? compare.getTarget(id) : null;
          }
          var key = text(id);
          if (objectsById.after.has(key)) return objectsById.after.get(key);
          if (objectsById.before.has(key)) return objectsById.before.get(key);
          return null;
        }
      };
    }
  };
})(window);
