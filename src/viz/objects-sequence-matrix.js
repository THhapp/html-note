/*! NoteViz objects D01-D06 — D01 Sequence, D02 Matrix.
 *  Classic script; load after src/viz/objects.js (internal shared helpers).
 *  Public entries: NoteViz.Sequence, NoteViz.Matrix.
 *  No network, no eval, no HTML parsing. */
(function (global) {
  'use strict';

  var NoteViz = global.NoteViz = global.NoteViz || {};
  var shared = global.NoteVizObjectsInternals;
  if (!shared) {
    throw new Error('NoteViz objects 组件需要先加载 src/viz/objects.js（内部共享文件）。');
  }
  var Core = shared.Core;
  var text = shared.text;
  var isNode = shared.isNode;
  var el = shared.el;
  var setText = shared.setText;
  var setContent = shared.setContent;
  var validateHost = shared.validateHost;
  var numberOr = shared.numberOr;
  var clampNumber = shared.clampNumber;
  var markOf = shared.markOf;
  var markLabel = shared.markLabel;
  var markAria = shared.markAria;
  var emptyLine = shared.emptyLine;
  var makeScrollHint = shared.makeScrollHint;
  var attachScrollRegion = shared.attachScrollRegion;
  var findDescriptorIndex = shared.findDescriptorIndex;
  var resolveItemKeys = shared.resolveItemKeys;

  /* =====================================================================
   * D01 — Sequence
   * ===================================================================== */

  NoteViz.Sequence = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var root = el('div', 'nviz-sequence');
      var viewport = el('div', 'nviz-sequence__viewport');
      var track = el('div', 'nviz-sequence__track');
      var hint = makeScrollHint('nviz-sequence__hint');
      var note = el('p', 'nviz-sequence__note');
      var empty = emptyLine('暂无可显示的序列对象。');
      var scroll = null;
      var parts = new Map();
      var targets = new Map();
      var lastItems = [];
      var lastGroups = [];
      var lastFocus = new Set();
      var lastChanged = new Set();

      viewport.appendChild(track);
      note.hidden = true;
      empty.hidden = true;
      root.setAttribute('role', 'group');
      root.append(viewport, hint, empty, note);

      var model = Object.assign({
        items: [],
        variant: 'boxes',
        index: false,
        groups: null,
        focus: null,
        changed: null,
        dense: false,
        label: '序列',
        summary: true,
        stateText: true,
        stable: false
      }, options || {});

      function normalizeItems(input) {
        var list = Array.isArray(input) ? input : [];
        return list.map(function (item, index) {
          var id = 'item-' + index;
          var label = '';
          var value = '';
          if (item != null && typeof item === 'object' && !isNode(item)) {
            if (item.id != null && text(item.id) !== '') id = text(item.id);
            label = item.label == null ? '' : text(item.label);
            value = item.value == null ? (item.label == null ? '' : text(item.label)) : text(item.value);
          } else {
            value = item == null ? '' : text(item);
          }
          return { id: id, key: id, index: index, label: label, value: value };
        });
      }

      function buildSections(items, groups) {
        var n = items.length;
        var declared = [];
        if (!n) return { sections: [], hasLabels: false, groups: declared };
        var assignments = new Array(n);
        if (Array.isArray(groups) && groups.length) {
          var cursor = 0;
          groups.forEach(function (group) {
            if (!group || typeof group !== 'object' || group.ids != null && !Array.isArray(group.ids)) return;
            var indexes = [];
            var groupLabel = group.label == null ? '' : text(group.label);
            if (Array.isArray(group.ids)) {
              group.ids.forEach(function (id) {
                for (var i = 0; i < n; i += 1) {
                  if (items[i].id === String(id)) {
                    indexes.push(i);
                    break;
                  }
                }
              });
              indexes.sort(function (a, b) { return a - b; });
            } else {
              var start = group.start != null ? Math.floor(numberOr(group.start, cursor)) : cursor;
              var count;
              if (group.count != null) count = Math.floor(numberOr(group.count, 0));
              else if (group.end != null) count = Math.floor(numberOr(group.end, start + 1)) - start;
              else count = 1;
              start = clampNumber(start, 0, n);
              count = Math.max(0, Math.min(count, n - start));
              for (var offset = 0; offset < count; offset += 1) indexes.push(start + offset);
              cursor = start + count;
            }
            var groupIds = [];
            indexes.forEach(function (index) {
              if (index >= 0 && index < n && !assignments[index]) {
                assignments[index] = { group: declared.length, label: groupLabel };
                groupIds.push(items[index].id);
              }
            });
            declared.push({ label: groupLabel, ids: groupIds });
          });
        }
        var hasLabels = assignments.some(function (assignment) { return assignment && assignment.label; });
        var sections = [];
        var current = null;
        for (var i = 0; i < n; i += 1) {
          var assigned = assignments[i];
          var key = assigned ? 'g' + assigned.group : 'none';
          if (!current || current.key !== key) {
            current = {
              key: key,
              label: assigned ? assigned.label : (hasLabels ? '未分组' : ''),
              items: []
            };
            sections.push(current);
          }
          current.items.push(items[i]);
        }
        return { sections: sections, hasLabels: hasLabels, groups: declared };
      }

      function createUnit() {
        var unit = el('div', 'nviz-sequence__unit');
        unit.setAttribute('role', 'listitem');
        var cell = el('span', 'nviz-sequence__cell');
        var indexEl = el('span', 'nviz-sequence__index');
        indexEl.setAttribute('aria-hidden', 'true');
        var valueEl = el('span', 'nviz-sequence__value');
        var labelEl = el('span', 'nviz-sequence__label');
        var markEl = el('span', 'nviz-sequence__mark');
        cell.append(indexEl, valueEl, labelEl, markEl);
        unit.appendChild(cell);
        return { unit: unit, cell: cell, index: indexEl, value: valueEl, label: labelEl, mark: markEl };
      }

      function render(patch) {
        var variant = ['bits', 'bytes', 'boxes'].indexOf(model.variant) >= 0 ? model.variant : 'boxes';
        var label = text(model.label) || '序列';
        var items = normalizeItems(model.items);
        var focus = resolveItemKeys(model.focus, items, { ranges: true });
        var changed = resolveItemKeys(model.changed, items, { ranges: true });
        var grouped = buildSections(items, model.groups);
        var sections = grouped.sections || [];
        var hasGroupLabels = !!grouped.hasLabels;
        lastItems = items;
        lastFocus = focus;
        lastChanged = changed;
        lastGroups = grouped.groups || [];

        root.setAttribute('data-variant', variant);
        root.setAttribute('data-dense', model.dense ? 'true' : 'false');
        root.setAttribute('data-index', model.index ? 'true' : 'false');
        root.setAttribute('data-stable', model.stable ? 'true' : 'false');
        root.setAttribute('data-summary', model.summary ? 'true' : 'false');
        root.setAttribute('aria-label', label);
        viewport.setAttribute('aria-label', label + '，可滚动区域');
        setText(note, '');
        note.hidden = true;

        var oldParts = parts;
        var newParts = new Map();
        var newTargets = new Map();
        track.replaceChildren();

        if (!items.length) {
          viewport.hidden = true;
          empty.hidden = false;
          hint.hidden = true;
          note.hidden = true;
          note.style.visibility = '';
          note.removeAttribute('aria-hidden');
          parts = newParts;
          targets = newTargets;
          if (scroll) scroll.schedule();
          return;
        }

        viewport.hidden = false;
        empty.hidden = true;
        var focusItems = [];
        var changedItems = [];
        var bothItems = [];
        var sectionNodes = sections.map(function (section) {
          var sectionEl = el('div', 'nviz-sequence__group');
          if (hasGroupLabels) {
            var heading = el('div', 'nviz-sequence__group-label', section.label);
            sectionEl.appendChild(heading);
            sectionEl.setAttribute('role', 'group');
            sectionEl.setAttribute('aria-label', '分组：' + section.label);
          }
          var cells = el('div', 'nviz-sequence__cells');
          cells.setAttribute('role', 'list');
          cells.setAttribute('aria-label', section.label ? section.label + ' 的对象' : '序列对象');
          sectionEl.appendChild(cells);
          track.appendChild(sectionEl);
          return cells;
        });

        var cursorById = new Map();
        sections.forEach(function (section, sectionIndex) {
          section.items.forEach(function (item) {
            cursorById.set(item.id, sectionIndex);
          });
        });

        items.forEach(function (item) {
          var old = oldParts.get(item.id);
          var created = old || createUnit();
          var unit = created.unit;
          var mark = markOf(focus.has(item.id), changed.has(item.id));
          var sectionIndex = cursorById.has(item.id) ? cursorById.get(item.id) : 0;
          var sectionCells = sectionNodes[sectionIndex] || sectionNodes[0];

          setText(created.index, String(item.index));
          created.index.hidden = !model.index;
          setText(created.value, item.value === '' ? '∅' : item.value);
          var labelShown = !!(item.label && item.label !== item.value);
          setText(created.label, labelShown ? item.label : '');
          if (model.stable) {
            /* 稳定排布：标签行始终占位，缺席时只隐藏可见性，不改变对象高度。 */
            created.label.hidden = false;
            created.label.style.visibility = labelShown ? '' : 'hidden';
            created.label.setAttribute('aria-hidden', labelShown ? 'false' : 'true');
          } else {
            created.label.hidden = !labelShown;
            created.label.style.visibility = '';
            created.label.removeAttribute('aria-hidden');
          }
          var markShown = !!mark && variant !== 'bits' && model.stateText;
          setText(created.mark, markShown ? markLabel(mark) : '');
          if (model.stable && model.stateText && variant !== 'bits') {
            /* 稳定排布且状态文字可见：状态行始终占位。 */
            created.mark.hidden = false;
            created.mark.style.visibility = markShown ? '' : 'hidden';
            created.mark.setAttribute('aria-hidden', markShown ? 'false' : 'true');
          } else {
            /* 状态文字关闭时不再为不可见行预留高度，对象盒更紧凑。 */
            created.mark.hidden = !markShown;
            created.mark.style.visibility = '';
            created.mark.removeAttribute('aria-hidden');
          }
          unit.setAttribute('data-id', item.id);
          unit.setAttribute('data-mark', mark || 'none');
          unit.setAttribute('aria-label',
            '对象 ' + (item.index + 1) + '，索引 ' + item.index +
            (item.label ? '，' + item.label : '') +
            '，值 ' + (item.value === '' ? '空' : item.value) + markAria(mark));
          var itemRef = '索引 ' + item.index + (item.label || item.value ? '（' + (item.label || item.value) + '）' : '');
          if (mark === 'both') bothItems.push(itemRef);
          else if (mark === 'changed') changedItems.push(itemRef);
          else if (mark === 'focus') focusItems.push(itemRef);

          if (sectionCells) sectionCells.appendChild(unit);
          newParts.set(item.id, created);
          newTargets.set(item.id, unit);
        });

        parts = newParts;
        targets = newTargets;

        var noteParts = [];
        if (focusItems.length) noteParts.push('关注：' + focusItems.join('、'));
        if (changedItems.length) noteParts.push('变化：' + changedItems.join('、'));
        if (bothItems.length) noteParts.push('关注并变化：' + bothItems.join('、'));
        if (!model.summary) {
          /* 摘要只属于组件可选的可见说明；对象 aria-label 与视觉 cues 仍保留。 */
          note.textContent = '';
          note.hidden = true;
          note.style.visibility = '';
          note.removeAttribute('aria-hidden');
        } else if (noteParts.length) {
          note.textContent = noteParts.join('；') + '。';
          note.hidden = false;
          note.style.visibility = '';
          note.removeAttribute('aria-hidden');
        } else if (model.stable) {
          note.textContent = '';
          note.hidden = false;
          note.style.visibility = 'hidden';
          note.setAttribute('aria-hidden', 'true');
        } else {
          note.textContent = '';
          note.hidden = true;
          note.style.visibility = '';
          note.removeAttribute('aria-hidden');
        }

        if (scroll) scroll.schedule();
      }

      var cleanup = function () {
        if (scroll) scroll.destroy();
      };
      var instance = Core.component(root, model, render, cleanup);
      render({});
      host.appendChild(root);
      scroll = attachScrollRegion(viewport, hint, 'x');
      scroll.schedule();

      instance.getTarget = function (id) {
        if (instance.destroyed || id == null) return null;
        var key = String(id);
        if (targets.has(key)) return targets.get(key);
        if (/^-?\d+$/.test(key)) {
          var index = Number(key);
          if (index >= 0 && index < lastItems.length) return targets.get(lastItems[index].id) || null;
        }
        return null;
      };
      instance.getState = function () {
        if (instance.destroyed) return null;
        var items = lastItems.map(function (item) {
          return { id: item.id, value: item.value, label: item.label };
        });
        var groups = lastGroups.map(function (group) {
          return { label: group.label, ids: group.ids.slice() };
        });
        var focus = [];
        var changed = [];
        lastItems.forEach(function (item) {
          if (lastFocus.has(item.id)) focus.push(item.id);
          if (lastChanged.has(item.id)) changed.push(item.id);
        });
        return { items: items, groups: groups, cues: { focus: focus, changed: changed } };
      };
      instance.getMotionTargets = function () {
        if (instance.destroyed) return [];
        var list = [];
        lastItems.forEach(function (item) {
          var part = parts.get(item.id);
          if (!part) return;
          list.push({
            id: item.id,
            unit: part.unit,
            contentEl: part.cell,
            valueEl: part.value,
            labelEl: part.label,
            markEl: part.mark
          });
        });
        return list;
      };
      return instance;
    }
  };

  /* =====================================================================
   * D02 — Matrix
   * ===================================================================== */

  function normalizeAxis(input, prefix, fallbackLabels) {
    var list = Array.isArray(input) ? input : [];
    return list.map(function (item, index) {
      if (item != null && typeof item === 'object') {
        return {
          id: item.id != null && text(item.id) !== '' ? text(item.id) : prefix + '-' + index,
          label: item.label != null ? text(item.label) : (item.name != null ? text(item.name) : prefix + ' ' + (index + 1)),
          raw: item
        };
      }
      return {
        id: prefix + '-' + index,
        label: item == null ? prefix + ' ' + (index + 1) : text(item),
        raw: item
      };
    }).map(function (item, index) {
      if (item.label === '' && fallbackLabels) item.label = fallbackLabels(index);
      return item;
    });
  }

  function matrixCellKey(rowId, colId) {
    return rowId + '\u0000' + colId;
  }

  function matrixSelection(rows, cols, value) {
    var result = {
      rows: new Set(),
      cols: new Set(),
      cells: new Set(),
      ranges: 0
    };

    function rowIndex(ref) {
      return findDescriptorIndex(rows, ref);
    }
    function colIndex(ref) {
      return findDescriptorIndex(cols, ref);
    }
    function addRow(ref) {
      var index = rowIndex(ref);
      if (index >= 0) result.rows.add(rows[index].id);
    }
    function addCol(ref) {
      var index = colIndex(ref);
      if (index >= 0) result.cols.add(cols[index].id);
    }
    function addCell(spec) {
      if (!spec || typeof spec !== 'object') return;
      var ri = rowIndex(spec.row);
      var ci = colIndex(spec.col != null ? spec.col : spec.column);
      if (ri >= 0 && ci >= 0) result.cells.add(matrixCellKey(rows[ri].id, cols[ci].id));
    }
    function addRange(spec) {
      if (!spec || typeof spec !== 'object') return;
      var rowStartRef = spec.rowStart != null ? spec.rowStart : spec.startRow;
      var rowEndRef = spec.rowEnd != null ? spec.rowEnd : spec.endRow;
      var colStartRef = spec.colStart != null ? spec.colStart : spec.columnStart;
      var colEndRef = spec.colEnd != null ? spec.colEnd : spec.columnEnd;
      if (Array.isArray(spec.rows) && spec.rows.length) {
        rowStartRef = spec.rows[0];
        rowEndRef = spec.rows[spec.rows.length - 1];
      }
      if (Array.isArray(spec.columns) && spec.columns.length) {
        colStartRef = spec.columns[0];
        colEndRef = spec.columns[spec.columns.length - 1];
      } else if (Array.isArray(spec.cols) && spec.cols.length) {
        colStartRef = spec.cols[0];
        colEndRef = spec.cols[spec.cols.length - 1];
      }
      var hasRowBounds = rowStartRef != null || rowEndRef != null;
      var hasColBounds = colStartRef != null || colEndRef != null;
      var r1 = hasRowBounds ? findDescriptorIndex(rows, rowStartRef != null ? rowStartRef : 0) : 0;
      var r2 = hasRowBounds ? findDescriptorIndex(rows, rowEndRef != null ? rowEndRef : (rows.length - 1)) : rows.length - 1;
      var c1 = hasColBounds ? findDescriptorIndex(cols, colStartRef != null ? colStartRef : 0) : 0;
      var c2 = hasColBounds ? findDescriptorIndex(cols, colEndRef != null ? colEndRef : (cols.length - 1)) : cols.length - 1;
      if (r1 < 0 || r2 < 0 || c1 < 0 || c2 < 0) return;
      result.ranges += 1;
      for (var r = Math.min(r1, r2); r <= Math.max(r1, r2); r += 1) {
        for (var c = Math.min(c1, c2); c <= Math.max(c1, c2); c += 1) {
          result.cells.add(matrixCellKey(rows[r].id, cols[c].id));
        }
      }
    }

    function walk(item) {
      if (item == null || item === false) return;
      if (Array.isArray(item)) {
        item.forEach(walk);
        return;
      }
      if (item instanceof Set) {
        item.forEach(walk);
        return;
      }
      if (typeof item !== 'object') {
        var ri = rowIndex(item);
        if (ri >= 0) result.rows.add(rows[ri].id);
        else {
          var ci = colIndex(item);
          if (ci >= 0) result.cols.add(cols[ci].id);
        }
        return;
      }
      if (Array.isArray(item.cells)) item.cells.forEach(addCell);
      if (item.cell) addCell(item.cell);
      if (item.row != null || item.col != null || item.column != null) {
        if (item.row != null && (item.col != null || item.column != null)) {
          addCell({ row: item.row, col: item.col != null ? item.col : item.column });
        } else if (item.row != null) {
          addRow(item.row);
        } else {
          addCol(item.col != null ? item.col : item.column);
        }
      }
      if (Array.isArray(item.rows)) item.rows.forEach(addRow);
      var columnRefs = Array.isArray(item.columns) ? item.columns : (Array.isArray(item.cols) ? item.cols : null);
      if (columnRefs) columnRefs.forEach(addCol);
      if (item.range) addRange(item.range);
      if (item.rowStart != null || item.rowEnd != null || item.colStart != null ||
          item.colEnd != null || item.columnStart != null || item.columnEnd != null ||
          item.startRow != null || item.endRow != null) {
        addRange(item);
      }
    }
    walk(value);
    return result;
  }

  NoteViz.Matrix = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var root = el('div', 'nviz-matrix');
      var viewport = el('div', 'nviz-matrix__viewport');
      var hint = makeScrollHint('nviz-matrix__hint');
      var empty = emptyLine('暂无可显示的矩阵数据。');
      var note = el('p', 'nviz-matrix__note');
      var scroll = null;
      var cellParts = new Map();
      var targets = new Map();
      var currentValues = [];
      var currentRows = [];
      var currentCols = [];
      var currentFocus = { rows: [], cols: [], cells: [] };
      var currentChanged = { rows: [], cols: [], cells: [] };
      var currentCaption = '';

      note.hidden = true;
      empty.hidden = true;
      root.setAttribute('role', 'group');
      root.append(viewport, hint, empty, note);

      var model = Object.assign({
        rows: [],
        values: [],
        focus: null,
        changed: null,
        caption: '',
        cellRenderer: null,
        maxHeight: 'min(60vh, 480px)',
        dense: false,
        label: '矩阵',
        summary: true,
        stateText: true
      }, options || {});

      function normalizeData() {
        var rawRows = Array.isArray(model.rows) ? model.rows : [];
        var rawCols = Array.isArray(model.columns) ? model.columns : (Array.isArray(model.cols) ? model.cols : []);
        var values = model.values;
        if (!Array.isArray(values)) {
          var embedded = rawRows.some(function (row) {
            return row && typeof row === 'object' && (Array.isArray(row.cells) || Array.isArray(row.values));
          });
          if (embedded) {
            values = rawRows.map(function (row) {
              if (Array.isArray(row.cells)) return row.cells;
              if (Array.isArray(row.values)) return row.values;
              return [];
            });
          } else {
            values = [];
          }
        }
        var columnCount = rawCols.length;
        values.forEach(function (row) {
          if (Array.isArray(row)) columnCount = Math.max(columnCount, row.length);
        });
        rawRows.forEach(function (row) {
          if (row && typeof row === 'object') {
            var cells = Array.isArray(row.cells) ? row.cells : row.values;
            if (Array.isArray(cells)) columnCount = Math.max(columnCount, cells.length);
          }
        });
        var rowCount = Math.max(rawRows.length, values.length);
        var rows = normalizeAxis(rawRows.length === rowCount ? rawRows : rawRows.concat(new Array(Math.max(0, rowCount - rawRows.length)).fill(null)), 'row', function (index) {
          return '行 ' + (index + 1);
        });
        var columns = normalizeAxis(rawCols.length === columnCount ? rawCols : rawCols.concat(new Array(Math.max(0, columnCount - rawCols.length)).fill(null)), 'col', function (index) {
          return '列 ' + (index + 1);
        });
        return { rows: rows, columns: columns, values: values };
      }

      function getValue(values, rowIndex, colIndex, row) {
        if (Array.isArray(values[rowIndex])) return values[rowIndex][colIndex];
        if (row && Array.isArray(row.raw && row.raw.cells)) return row.raw.cells[colIndex];
        if (row && Array.isArray(row.raw && row.raw.values)) return row.raw.values[colIndex];
        return '';
      }

      function createCellParts() {
        var td = el('td', 'nviz-matrix__cell');
        var valueEl = el('span', 'nviz-matrix__value');
        var flag = el('span', 'nviz-matrix__cellflag');
        var stateEl = el('span', 'nviz-matrix__state');
        flag.hidden = true;
        td.append(valueEl, flag, stateEl);
        return { td: td, value: valueEl, flag: flag, state: stateEl };
      }

      function render(patch) {
        var data = normalizeData();
        var rows = data.rows;
        var cols = data.columns;
        var label = text(model.label) || '矩阵';
        var caption = text(model.caption);
        var focus = matrixSelection(rows, cols, model.focus);
        var changed = matrixSelection(rows, cols, model.changed);
        currentValues = data.values;
        currentRows = rows;
        currentCols = cols;
        currentCaption = caption;
        currentFocus = {
          rows: Array.from(focus.rows),
          cols: Array.from(focus.cols),
          cells: Array.from(focus.cells).map(function (key) {
            var pair = key.split(String.fromCharCode(0));
            return { row: pair[0], col: pair[1] };
          })
        };
        currentChanged = {
          rows: Array.from(changed.rows),
          cols: Array.from(changed.cols),
          cells: Array.from(changed.cells).map(function (key) {
            var pair = key.split(String.fromCharCode(0));
            return { row: pair[0], col: pair[1] };
          })
        };

        root.setAttribute('aria-label', label);
        root.setAttribute('data-dense', model.dense ? 'true' : 'false');
        root.setAttribute('data-summary', model.summary ? 'true' : 'false');
        root.setAttribute('data-state-text', model.stateText ? 'true' : 'false');
        viewport.style.maxHeight = model.maxHeight == null || model.maxHeight === '' ? '' :
          (typeof model.maxHeight === 'number' ? model.maxHeight + 'px' : text(model.maxHeight));
        viewport.setAttribute('aria-label', label + '，可滚动表格');

        var oldParts = cellParts;
        var newParts = new Map();
        var newTargets = new Map();
        viewport.replaceChildren();

        var noteBits = [];
        if (model.summary) {
          if (focus.rows.size) noteBits.push('行关注 ' + focus.rows.size);
          if (focus.cols.size) noteBits.push('列关注 ' + focus.cols.size);
          if (focus.cells.size) noteBits.push('关注单元 ' + focus.cells.size);
          if (focus.ranges) noteBits.push('关注区域 ' + focus.ranges);
          if (changed.rows.size) noteBits.push('行变化 ' + changed.rows.size);
          if (changed.cols.size) noteBits.push('列变化 ' + changed.cols.size);
          if (changed.cells.size) noteBits.push('变化单元 ' + changed.cells.size);
          if (changed.ranges) noteBits.push('变化区域 ' + changed.ranges);
        }
        note.hidden = noteBits.length === 0;
        note.textContent = noteBits.length ? '标记：' + noteBits.join(' · ') + '。' : '';

        if (!rows.length || !cols.length) {
          viewport.hidden = true;
          empty.hidden = false;
          hint.hidden = true;
          note.hidden = true;
          cellParts = newParts;
          targets = newTargets;
          if (scroll) scroll.schedule();
          return;
        }

        viewport.hidden = false;
        empty.hidden = true;

        var table = el('table', 'nviz-matrix__table');
        if (!caption) table.setAttribute('aria-label', label);
        if (caption) {
          var captionEl = el('caption', 'nviz-matrix__caption', caption);
          table.appendChild(captionEl);
        }

        var thead = el('thead');
        var headRow = el('tr');
        var corner = el('th', 'nviz-matrix__corner');
        corner.setAttribute('scope', 'col');
        var cornerText = el('span', 'nviz-matrix__cornerlabel', '行 \\ 列');
        corner.appendChild(cornerText);
        headRow.appendChild(corner);

        var colMarks = cols.map(function (col) {
          var f = focus.cols.has(col.id);
          var c = changed.cols.has(col.id);
          var mark = markOf(f, c);
          var th = el('th', 'nviz-matrix__colhead');
          th.setAttribute('scope', 'col');
          th.setAttribute('data-id', col.id);
          th.setAttribute('data-mark', mark || 'none');
          var labelWrap = el('span', 'nviz-matrix__headlabel');
          var labelText = el('span', 'nviz-matrix__headtext', col.label);
          labelWrap.appendChild(labelText);
          if (mark && model.stateText) {
            var tag = el('span', 'nviz-matrix__headmark', markLabel(mark));
            labelWrap.appendChild(tag);
          }
          if (mark && !model.stateText) {
            labelWrap.appendChild(el('span', 'nviz-matrix__state', markAria(mark)));
          }
          th.appendChild(labelWrap);
          headRow.appendChild(th);
          return mark;
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        var tbody = el('tbody');
        rows.forEach(function (row, rowIndex) {
          var tr = el('tr');
          var rowFocus = focus.rows.has(row.id);
          var rowChanged = changed.rows.has(row.id);
          var rowMark = markOf(rowFocus, rowChanged);
          var rowHead = el('th', 'nviz-matrix__rowhead');
          rowHead.setAttribute('scope', 'row');
          rowHead.setAttribute('data-id', row.id);
          rowHead.setAttribute('data-mark', rowMark || 'none');
          var rowLabelWrap = el('span', 'nviz-matrix__headlabel');
          var rowText = el('span', 'nviz-matrix__headtext', row.label);
          rowLabelWrap.appendChild(rowText);
          if (rowMark && model.stateText) rowLabelWrap.appendChild(el('span', 'nviz-matrix__headmark', markLabel(rowMark)));
          if (rowMark && !model.stateText) rowLabelWrap.appendChild(el('span', 'nviz-matrix__state', markAria(rowMark)));
          rowHead.appendChild(rowLabelWrap);
          tr.appendChild(rowHead);

          cols.forEach(function (col, colIndex) {
            var key = matrixCellKey(row.id, col.id);
            var old = oldParts.get(key);
            var created = old || createCellParts();
            var td = created.td;
            var directFocus = focus.cells.has(key);
            var directChanged = changed.cells.has(key);
            var anyFocus = rowFocus || colMarks[colIndex] === 'focus' || colMarks[colIndex] === 'both' || directFocus;
            var anyChanged = rowChanged || colMarks[colIndex] === 'changed' || colMarks[colIndex] === 'both' || directChanged;
            var mark = markOf(anyFocus, anyChanged);
            var directMark = markOf(directFocus, directChanged);
            var rawValue = getValue(data.values, rowIndex, colIndex, row);
            var output;
            if (typeof model.cellRenderer === 'function') {
              output = model.cellRenderer(rawValue, {
                row: row.id,
                col: col.id,
                rowIndex: rowIndex,
                colIndex: colIndex,
                rowLabel: row.label,
                colLabel: col.label
              });
            } else {
              output = rawValue;
            }
            setContent(created.value, output == null ? '' : output);
            td.setAttribute('data-row', row.id);
            td.setAttribute('data-col', col.id);
            td.setAttribute('data-mark', mark || 'none');
            td.setAttribute('data-direct-mark', directMark || 'none');
            created.flag.hidden = !directMark || !model.stateText;
            created.flag.textContent = directMark && model.stateText ? markLabel(directMark) : '';
            created.state.textContent = !model.stateText && mark ? markAria(mark) : '';
            td.removeAttribute('aria-label');
            tr.appendChild(td);
            newParts.set(key, created);
            newTargets.set(key, td);
          });
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        viewport.appendChild(table);
        cellParts = newParts;
        targets = newTargets;

        if (scroll) scroll.schedule();
      }

      var cleanup = function () {
        if (scroll) scroll.destroy();
      };
      var instance = Core.component(root, model, render, cleanup);
      render({});
      host.appendChild(root);
      scroll = attachScrollRegion(viewport, hint, 'both');
      scroll.schedule();

      instance.getTarget = function (spec) {
        if (instance.destroyed || !spec || typeof spec !== 'object') return null;
        var rowRef = spec.row;
        var colRef = spec.col != null ? spec.col : spec.column;
        var ri = findDescriptorIndex(currentRows, rowRef);
        var ci = findDescriptorIndex(currentCols, colRef);
        if (ri < 0 || ci < 0) return null;
        return targets.get(matrixCellKey(currentRows[ri].id, currentCols[ci].id)) || null;
      };

      instance.getState = function () {
        if (instance.destroyed) return null;
        return {
          rows: currentRows.map(function (row) { return { id: row.id, label: row.label }; }),
          columns: currentCols.map(function (column) { return { id: column.id, label: column.label }; }),
          values: currentRows.map(function (row, rowIndex) {
            return currentCols.map(function (column, colIndex) {
              var value = getValue(currentValues, rowIndex, colIndex, row);
              return value == null ? '' : value;
            });
          }),
          focus: {
            rows: currentFocus.rows.slice(),
            cols: currentFocus.cols.slice(),
            cells: currentFocus.cells.map(function (cell) { return { row: cell.row, col: cell.col }; })
          },
          changed: {
            rows: currentChanged.rows.slice(),
            cols: currentChanged.cols.slice(),
            cells: currentChanged.cells.map(function (cell) { return { row: cell.row, col: cell.col }; })
          },
          caption: currentCaption
        };
      };

      instance.getMotionTargets = function () {
        if (instance.destroyed) return [];
        var output = [];
        targets.forEach(function (td, key) {
          var pair = key.split(String.fromCharCode(0));
          var valueEl = td.querySelector ? td.querySelector('.nviz-matrix__value') : null;
          var flagEl = td.querySelector ? td.querySelector('.nviz-matrix__cellflag') : null;
          output.push({
            id: key,
            rowId: pair[0],
            colId: pair[1],
            element: td,
            layoutEl: td,
            contentEl: td,
            valueEl: valueEl,
            flagEl: flagEl
          });
        });
        return output;
      };

      return instance;
    }
  };
})(window);
