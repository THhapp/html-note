/* NoteDemo Adapter — table（C06 NoteUI.Table 的正式 scene 接入）。
 * Scope: window.NoteDemoInternals.adapters.table
 * Depends on: NoteUI.Table（C06）、NoteDemo.sceneAdapter（共享 PreparedChange 胶水）。
 * 经典脚本，无模块/无网络/无 eval。
 *
 * 职责：
 * - normalizeView/readModel 使用同一 canonical model，真实读回走 Table.getState()；
 *   canonical rows 固定按作者输入顺序（row.index）排列，display 排序由 sort 字段表达。
 * - update 只提交完整目标 model；commit 调 Table.update()，不另建播放器。
 * - effects 只针对真实变化的 cell/行做局部 WAAPI：值变化用 cell 来源覆盖层淡出，
 *   新行淡入、行状态变化用行级提示；不对整表做淡入/瞬切冒充过渡。
 * - 组名：cell:<encodeURIComponent(rowKey)>:<encodeURIComponent(colKey)>、row:<encodeURIComponent(rowKey)>。
 * - 减少动效/恢复由 sceneAdapter helper 与公共 scene 收口：commit 直接落目标终态。
 *
 * 兼容边界：Frame 视图中的表格值/状态/标签必须是可序列化标量或普通数据；DOM/函数
 * 只允许出现在 binding options（rowKey/rowState/cellState/onSort）。scene update 不支持
 * 列结构（键/顺序/对齐/sortable）变化，请改用 cut/reveal；行删除不提供退场动画。
 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var NAME = 'table';

  function fail(message) {
    throw new Error(NAME + ' Adapter：' + message);
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function isArray(value) {
    return Array.isArray(value);
  }

  function own(object, key) {
    return object != null && Object.prototype.hasOwnProperty.call(Object(object), key);
  }

  function text(value) {
    return value == null ? '' : String(value);
  }

  function tableComponent() {
    var table = global.NoteUI && global.NoteUI.Table;
    if (!table || typeof table.mount !== 'function') {
      throw new Error('table Adapter 需要先加载 NoteUI.Table（src/ui/table.js）。');
    }
    return table;
  }

  function sceneAdapterHelper() {
    /* 源序里 scene-adapter.js 先于 adapters/index.js，NoteDemo 命名空间可能尚未创建；
     * Internals.sceneAdapter 由 scene-adapter.js 直接挂载，优先使用它。 */
    var helper = Internals.sceneAdapter;
    if (!helper || typeof helper.define !== 'function') {
      helper = global.NoteDemo && global.NoteDemo.sceneAdapter;
    }
    if (!helper || typeof helper.define !== 'function') {
      throw new Error('table Adapter 需要先加载 demo-runtime 的 scene-adapter.js。');
    }
    return helper;
  }

  /* ---------------- 纯数据 canonical 化 ---------------- */

  function cloneData(value, path, seen) {
    if (value == null) return value;
    var type = typeof value;
    if (type === 'string' || type === 'number' || type === 'boolean') return value;
    if (type === 'function') fail(path + ' 不能是函数（函数请放在 binding options）。');
    if (type !== 'object') return value;
    if (value.nodeType === 1) fail(path + ' 不能是 DOM 元素（Frame 视图只保存可序列化数据）。');
    var list = seen || [];
    if (list.indexOf(value) >= 0) fail(path + ' 不能包含循环引用。');
    list.push(value);
    var output;
    var i;
    if (isArray(value)) {
      output = [];
      for (i = 0; i < value.length; i += 1) output.push(cloneData(value[i], path + '[' + i + ']', list));
    } else {
      output = {};
      Object.keys(value).forEach(function (key) {
        output[key] = cloneData(value[key], path + '.' + key, list);
      });
    }
    list.pop();
    return output;
  }

  function canonicalValue(value, path) {
    if (value == null) return '';
    var type = typeof value;
    if (type === 'string' || type === 'number' || type === 'boolean') return value;
    if (type === 'object' && value.nodeType === 1) {
      fail(path + ' 不能是 DOM 元素（Frame 视图只保存文本/标量；DOM 请改用 binding options）。');
    }
    if (type === 'object') return cloneData(value, path);
    fail(path + ' 不是可序列化的表格值。');
    return '';
  }

  function canonicalAlign(value) {
    if (value === 'left' || value === 'start') return 'start';
    if (value === 'right' || value === 'end') return 'end';
    if (value === 'center') return 'center';
    return 'start';
  }

  function canonicalWidth(value) {
    if (typeof value === 'number' && isFinite(value) && value > 0) return value + 'px';
    if (typeof value === 'string' && value.trim()) return value.trim();
    return '';
  }

  function canonicalMaxHeight(value) {
    if (typeof value === 'number' && isFinite(value) && value > 0) return value + 'px';
    if (typeof value === 'string' && value.trim()) return value.trim();
    return null;
  }

  function canonicalLabel(value, path) {
    if (value == null) return '';
    var type = typeof value;
    if (type === 'string' || type === 'number' || type === 'boolean') return text(value);
    if (type === 'object' && value.nodeType === 1) {
      fail(path + ' 不能是 DOM 元素（列标签在 scene 视图中必须是文本）。');
    }
    fail(path + ' 不是可序列化的列标签。');
    return '';
  }

  /* 同时接受作者原始状态值（string/number/数组/{type|name,label}）和 getState() 已归一
   * 的 [{type,label}] —— normalizeView 与真实读回必须走同一个 conversion。 */
  function canonicalStateItems(value) {
    var items = [];
    function add(item) {
      if (item == null || item === false || item === '') return;
      if (isArray(item)) {
        item.forEach(add);
        return;
      }
      if (typeof item === 'string' || typeof item === 'number') {
        var type = text(item).trim();
        if (type && !items.some(function (existing) { return existing.type === type; })) {
          items.push({ type: type, label: '' });
        }
        return;
      }
      if (isObject(item)) {
        var raw = item.type != null ? item.type : item.name;
        var value = raw == null ? '' : text(raw).trim();
        if (value && !items.some(function (existing) { return existing.type === value; })) {
          items.push({ type: value, label: item.label == null ? '' : text(item.label).trim() });
        }
      }
    }
    add(value);
    return items;
  }

  function canonicalColumn(column, path) {
    if (!isObject(column)) fail(path + ' 必须是 {key,label,align,width,sortable} 对象。');
    return {
      key: column.key == null ? null : cloneData(column.key, path + '.key'),
      label: canonicalLabel(column.label, path + '.label'),
      align: canonicalAlign(column.align),
      width: canonicalWidth(column.width),
      sortable: column.sortable === false ? false : true
    };
  }

  function canonicalKey(value) {
    return value == null ? null : String(value);
  }

  function canonicalKeyList(value) {
    if (value == null || value === false) return [];
    var list = isArray(value) ? value : [value];
    var output = [];
    list.forEach(function (item) {
      if (item == null || item === false) return;
      var key = String(item);
      if (output.indexOf(key) < 0) output.push(key);
    });
    return output;
  }

  function canonicalEmphasis(value) {
    if (!isObject(value)) return null;
    var row = canonicalKeyList(value.row);
    var column = canonicalKeyList(value.column);
    if (!row.length && !column.length) return null;
    return { row: row, column: column };
  }

  /* 同时接受作者 sort 配置（true/{key,direction}/false）和 getState().sort 的
   * canonical 形状（{enabled,key,direction}），保证 normalizeView 与真实读回同构。 */
  function canonicalSort(value) {
    if (!value) return { enabled: false, key: null, direction: null };
    if (value === true) return { enabled: true, key: null, direction: null };
    if (isObject(value)) {
      if (own(value, 'enabled')) {
        var enabled = value.enabled === true;
        var enabledKey = enabled && value.key != null ? String(value.key) : null;
        var enabledDirection = enabledKey == null
          ? null
          : (value.direction === 'desc' ? 'desc' : (value.direction === 'asc' ? 'asc' : null));
        return { enabled: enabled, key: enabledKey, direction: enabledDirection };
      }
      var key = value.key == null ? null : value.key;
      var direction = key == null ? null : (value.direction === 'desc' ? 'desc' : 'asc');
      return { enabled: true, key: key == null ? null : String(key), direction: direction };
    }
    return { enabled: true, key: null, direction: null };
  }

  function resolveRowKey(options, row, index) {
    var key;
    if (typeof options.rowKey === 'function') key = options.rowKey(row, index);
    else if (typeof options.rowKey === 'string' && row && row[options.rowKey] != null) key = row[options.rowKey];
    else if (row && own(row, 'key') && row.key != null) key = row.key;
    if (key == null) key = index;
    return key;
  }

  function resolveRowStates(options, row, index, key) {
    var value = null;
    if (typeof options.rowState === 'function') value = options.rowState(row, index, key);
    else if (row && own(row, 'state')) value = row.state;
    return canonicalStateItems(value);
  }

  function resolveCellStates(options, row, column, key, index) {
    var value = null;
    if (typeof options.cellState === 'function') value = options.cellState(row, column, key, index);
    else if (row && row.cellStates && own(row.cellStates, column.key)) value = row.cellStates[column.key];
    return canonicalStateItems(value);
  }

  function canonicalTableFromView(rawView, options) {
    var view = isObject(rawView) ? rawView : {};
    var columnsInput = isArray(view.columns) ? view.columns : [];
    var rowsInput = isArray(view.rows) ? view.rows : [];
    var canonicalColumns = columnsInput.map(function (column, index) {
      return canonicalColumn(column, 'view.columns[' + index + ']');
    });
    var rows = rowsInput.map(function (row, index) {
      var key = resolveRowKey(options, row, index);
      var keyString = String(key);
      var data = cloneData(row, 'view.rows[' + index + ']');
      var states = resolveRowStates(options, row, index, key);
      var cells = canonicalColumns.map(function (column, columnIndex) {
        var rawColumn = columnsInput[columnIndex];
        var value = canonicalValue(row && rawColumn ? row[rawColumn.key] : undefined,
          'view.rows[' + index + '].' + text(rawColumn && rawColumn.key));
        return {
          columnKey: column.key,
          value: value,
          states: resolveCellStates(options, row, rawColumn, key, index)
        };
      });
      return { key: key, keyString: keyString, index: index, data: data, states: states, cells: cells };
    });
    var emptyText = view.empty == null ? '暂无数据' : view.empty;
    if (emptyText != null && typeof emptyText === 'object' && emptyText.nodeType === 1) {
      fail('view.empty 不能是 DOM 元素（scene 视图中请使用文本）。');
    }
    return {
      columns: canonicalColumns,
      rows: rows,
      sort: canonicalSort(view.sort),
      emphasis: canonicalEmphasis(view.emphasis),
      caption: text(view.caption).trim(),
      emptyText: text(emptyText),
      dense: Boolean(view.dense),
      maxHeight: canonicalMaxHeight(view.maxHeight)
    };
  }

  function canonicalTableFromState(state) {
    if (!isObject(state)) fail('getState() 没有返回对象，无法读回表格状态。');
    var columnsInput = isArray(state.columns) ? state.columns : [];
    var canonicalColumns = columnsInput.map(function (column, index) {
      return canonicalColumn(column, 'getState().columns[' + index + ']');
    });
    var rendered = isArray(state.rows) ? state.rows.slice() : [];
    rendered.sort(function (left, right) {
      var a = left && typeof left.index === 'number' ? left.index : 0;
      var b = right && typeof right.index === 'number' ? right.index : 0;
      return a - b;
    });
    var rows = rendered.map(function (entry, index) {
      var data = cloneData(entry.row, 'getState().rows[' + index + '].row');
      var cells = canonicalColumns.map(function (column, columnIndex) {
        var cell = isArray(entry.cells) ? entry.cells[columnIndex] : null;
        return {
          columnKey: column.key,
          value: cell ? canonicalValue(cell.value, 'getState().rows[' + index + '].cells[' + columnIndex + '].value') : '',
          states: canonicalStateItems(cell && cell.states)
        };
      });
      return {
        key: entry.key,
        keyString: entry.keyString == null ? String(entry.key) : String(entry.keyString),
        index: typeof entry.index === 'number' ? entry.index : index,
        data: data,
        states: canonicalStateItems(entry.states),
        cells: cells
      };
    });
    return {
      columns: canonicalColumns,
      rows: rows,
      sort: canonicalSort(state.sort),
      emphasis: canonicalEmphasis(state.emphasis),
      caption: text(state.caption).trim(),
      emptyText: state.emptyText == null ? '' : text(state.emptyText),
      dense: Boolean(state.dense),
      maxHeight: canonicalMaxHeight(state.maxHeight)
    };
  }

  function tablePatch(model) {
    var sort = model.sort && model.sort.enabled
      ? (model.sort.key == null ? true : { key: model.sort.key, direction: model.sort.direction || 'asc' })
      : false;
    return {
      columns: (model.columns || []).map(function (column) {
        return {
          key: column.key,
          label: column.label,
          align: column.align,
          width: column.width,
          sortable: column.sortable
        };
      }),
      rows: (model.rows || []).map(function (row, index) {
        return cloneData(row.data, 'commit().rows[' + index + ']');
      }),
      sort: sort,
      emphasis: model.emphasis ? { row: model.emphasis.row.slice(), column: model.emphasis.column.slice() } : null,
      caption: model.caption,
      empty: model.emptyText,
      dense: model.dense,
      maxHeight: model.maxHeight
    };
  }

  /* ---------------- 差异与局部效果 ---------------- */

  function deepEqual(left, right) {
    if (left === right) return true;
    if (left == null || right == null) return left === right;
    if (typeof left !== typeof right) return false;
    if (typeof left !== 'object') return left === right;
    if (isArray(left) || isArray(right)) {
      if (!isArray(left) || !isArray(right) || left.length !== right.length) return false;
      for (var i = 0; i < left.length; i += 1) if (!deepEqual(left[i], right[i])) return false;
      return true;
    }
    var leftKeys = Object.keys(left);
    var rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    for (var k = 0; k < leftKeys.length; k += 1) {
      if (!own(right, leftKeys[k])) return false;
      if (!deepEqual(left[leftKeys[k]], right[leftKeys[k]])) return false;
    }
    return true;
  }

  function columnSignature(model) {
    return (model.columns || []).map(function (column) {
      return text(column.key) + '\u0001' + column.align + '\u0001' + (column.sortable ? '1' : '0');
    }).join('\u0002');
  }

  function rowBuckets(rows) {
    var buckets = {};
    (rows || []).forEach(function (row) {
      var key = row.keyString;
      if (!own(buckets, '$' + key)) buckets['$' + key] = [];
      buckets['$' + key].push(row);
    });
    return buckets;
  }

  function duplicateKeys(rows) {
    var seen = {};
    var duplicates = [];
    (rows || []).forEach(function (row) {
      var key = '$' + row.keyString;
      if (own(seen, key)) {
        if (duplicates.indexOf(row.keyString) < 0) duplicates.push(row.keyString);
      } else {
        seen[key] = true;
      }
    });
    return duplicates;
  }

  function groupCell(rowKey, columnKey) {
    return 'cell:' + encodeURIComponent(rowKey) + ':' + encodeURIComponent(columnKey);
  }

  function groupRow(rowKey) {
    return 'row:' + encodeURIComponent(rowKey);
  }

  function cellText(value) {
    if (value == null) return '';
    var type = typeof value;
    if (type === 'string' || type === 'number' || type === 'boolean') return String(value);
    return '';
  }

  function buildChangePlan(sourceModel, targetModel) {
    if (!sourceModel || !targetModel) fail('prepareChange 需要来源与目标表格 model。');
    var sourceSignature = columnSignature(sourceModel);
    var targetSignature = columnSignature(targetModel);
    if (sourceSignature !== targetSignature) {
      fail('scene update 不支持列结构（键/顺序/对齐/sortable）变化；请把该 Transition 改为 cut 或 reveal。');
    }
    var sourceDuplicates = duplicateKeys(sourceModel.rows);
    var targetDuplicates = duplicateKeys(targetModel.rows);
    if (sourceDuplicates.length || targetDuplicates.length) {
      fail('scene table 需要唯一行键，无法为重复键生成稳定 target/效果组：' +
        (targetDuplicates.length ? targetDuplicates.join('、') : sourceDuplicates.join('、')));
    }
    var sourceBuckets = rowBuckets(sourceModel.rows);
    var groups = [];
    var effects = [];
    (targetModel.rows || []).forEach(function (targetRow) {
      var bucket = sourceBuckets['$' + targetRow.keyString];
      var sourceRow = bucket && bucket.length ? bucket.shift() : null;
      if (!sourceRow) {
        groups.push(groupRow(targetRow.keyString));
        effects.push({ kind: 'row-enter', rowKey: targetRow.key, keyString: targetRow.keyString, group: groupRow(targetRow.keyString) });
        return;
      }
      (targetRow.cells || []).forEach(function (targetCell, index) {
        var sourceCell = sourceRow.cells[index];
        if (!sourceCell) return;
        var valueChanged = !deepEqual(sourceCell.value, targetCell.value);
        var statesChanged = !deepEqual(sourceCell.states, targetCell.states);
        if (!valueChanged && !statesChanged) return;
        var group = groupCell(targetRow.keyString, text(targetCell.columnKey));
        groups.push(group);
        effects.push({
          kind: 'cell',
          rowKey: targetRow.key,
          keyString: targetRow.keyString,
          columnKey: targetCell.columnKey,
          group: group,
          sourceValue: sourceCell.value,
          targetValue: targetCell.value,
          statesChanged: statesChanged,
          valueChanged: valueChanged
        });
      });
      if (!deepEqual(sourceRow.states, targetRow.states)) {
        var rowGroup = groupRow(targetRow.keyString);
        if (groups.indexOf(rowGroup) < 0) {
          groups.push(rowGroup);
          effects.push({ kind: 'row-state', rowKey: targetRow.key, keyString: targetRow.keyString, group: rowGroup });
        }
      }
    });
    return { groups: groups, effects: effects };
  }

  function timingNumber(timing, key, fallback) {
    var value = timing && typeof timing[key] === 'number' && isFinite(timing[key]) && timing[key] >= 0
      ? timing[key]
      : fallback;
    return value;
  }

  function buildEffects(table, plan, timing, attention, resetVisibility) {
    var easing = timing && typeof timing.easing === 'string' && timing.easing ? timing.easing : 'linear';
    var swapDuration = timingNumber(timing, 'valueSwapDuration', timingNumber(timing, 'enterDuration', 260));
    var cueDuration = timingNumber(timing, 'cueDuration', swapDuration);
    var overlays = [];
    var specs = [];
    (plan.effects || []).forEach(function (effect) {
      if (effect.kind === 'cell') {
        var td = table.getTarget({ row: effect.rowKey, column: effect.columnKey });
        if (!td) return;
        var overlay = global.document.createElement('span');
        overlay.className = 'nui-table__scene-source';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.textContent = cellText(effect.sourceValue);
        td.classList.add('nui-table__cell--scene-anchor');
        td.appendChild(overlay);
        overlays.push(overlay);
        specs.push({
          el: overlay,
          keyframes: [{ opacity: 1 }, { opacity: 0 }],
          options: { duration: swapDuration, easing: easing, fill: 'none' },
          group: effect.group,
          gate: 'ready',
          cleanupEl: overlay,
          effect: 'table-cell'
        });
        return;
      }
      if (effect.kind === 'row-enter') {
        var rowEl = table.getTarget({ row: effect.rowKey, part: 'row' });
        if (!rowEl) return;
        if (attention) {
          var sourceOpacity = rowEl.style.opacity;
          var showRow = function () { rowEl.style.opacity = sourceOpacity; };
          resetVisibility.push(showRow);
          specs.push({
            type: 'progress',
            group: effect.group,
            gate: 'ready',
            duration: 0,
            update: function (p) { if (p === 0) rowEl.style.opacity = '0'; },
            onStart: showRow,
            effect: 'table-row-visibility'
          });
          addRowCue(rowEl, effect.group, swapDuration, 'table-row-enter');
          return;
        }
        specs.push({
          el: rowEl,
          keyframes: [{ opacity: 0 }, { opacity: 1 }],
          options: { duration: swapDuration, easing: easing, fill: 'none' },
          group: effect.group,
          gate: 'ready',
          effect: 'table-row-enter'
        });
        return;
      }
      if (effect.kind === 'row-state') {
        var stateRow = table.getTarget({ row: effect.rowKey, part: 'row' });
        if (stateRow) addRowCue(stateRow, effect.group, cueDuration, 'table-row-state');
      }
    });
    return { specs: specs, overlays: overlays };

    /* 提示描边和正文分别呈现，焦点到达后不用等整行透明度爬升。 */
    function addRowCue(stateRow, group, duration, effectName) {
      var accent = '#315cda';
      try {
        var computed = global.getComputedStyle ? global.getComputedStyle(stateRow) : null;
        var accentValue = computed ? computed.getPropertyValue('--hnv-color-accent').trim() : '';
        if (accentValue) accent = accentValue;
      } catch (error) { /* 回退到默认强调色 */ }
      var cueKeyframes = [
        { boxShadow: 'inset 0 0 0 2px transparent', offset: 0 },
        { boxShadow: 'inset 0 0 0 2px ' + accent, offset: 0.35 },
        { boxShadow: 'inset 0 0 0 2px transparent', offset: 1 }
      ];
      var rowCells = stateRow.querySelectorAll('td');
      if (!rowCells.length) rowCells = [stateRow];
      Array.prototype.forEach.call(rowCells, function (cell) {
        specs.push({
          el: cell,
          keyframes: cueKeyframes,
          options: { duration: duration, easing: 'linear', fill: 'none' },
          group: group,
          gate: 'ready',
          effect: effectName
        });
      });
    }
  }

  function clearOverlays(overlays) {
    (overlays || []).forEach(function (overlay) {
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (overlay && overlay.classList) overlay.classList.remove('nui-table__scene-source');
    });
  }

  /* ---------------- Adapter 定义 ---------------- */

  var helper = sceneAdapterHelper();
  var adapter = helper.define({
    name: NAME,
    sceneModes: ['cut', 'update'],
    defaultSceneMode: 'update',
    sceneTimingDefaults: {
      valueSwapDelay: 0,
      valueSwapDuration: 260,
      cueDuration: 260
    },
    normalizeView: function (input, options) {
      var model = canonicalTableFromView(input, isObject(options) ? options : {});
      return { model: model, cues: {} };
    },
    mount: function (host, options) {
      if (!host || host.nodeType !== 1) fail('mount(host, options)：host 必须是元素。');
      var Table = tableComponent();
      var tableOptions = isObject(options) ? options : {};
      var table = Table.mount(host, {
        columns: [],
        rows: [],
        rowKey: tableOptions.rowKey,
        empty: tableOptions.empty,
        rowState: tableOptions.rowState,
        cellState: tableOptions.cellState,
        onSort: tableOptions.onSort,
        /* scene 表格默认启用稳定状态槽；作者可在 binding options 显式 false 关闭。 */
        stableStateLabels: tableOptions.stableStateLabels !== false
      });
      var destroyed = false;
      var overlays = [];

      function assertAlive() {
        if (destroyed) fail('实例已销毁。');
      }

      function readModel() {
        assertAlive();
        return canonicalTableFromState(table.getState());
      }

      function restore(view) {
        assertAlive();
        clearOverlays(overlays);
        overlays = [];
        var model = isObject(view) && isObject(view.model) ? view.model : view;
        table.update(tablePatch(model));
      }

      function target(query) {
        if (destroyed || query == null) return null;
        if (query === 'root' || (isObject(query) && query.part === 'root')) return table.el;
        return table.getTarget(query);
      }

      return {
        restore: restore,
        readModel: readModel,
        target: target,
        planStep: function (input) {
          assertAlive();
          var plan = buildChangePlan(input.sourceModel, input.targetModel);
          var committed = false;
          var resetVisibility = [];
          return {
            groups: plan.groups,
            commit: function () {
              if (committed) return;
              committed = true;
              clearOverlays(overlays);
              overlays = [];
              table.update(tablePatch(input.targetModel));
            },
            targets: function () { return []; },
            effects: function (timing, context) {
              if (input.reduced) return [];
              var built = buildEffects(table, plan, timing, context.attention, resetVisibility);
              overlays = overlays.concat(built.overlays);
              return built.specs;
            },
            cleanup: function () {
              clearOverlays(overlays);
              overlays = [];
              resetVisibility.forEach(function (reset) { reset(); });
              resetVisibility = [];
            }
          };
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          clearOverlays(overlays);
          overlays = [];
          table.destroy();
        }
      };
    }
  });

  Internals.adapters = Internals.adapters || {};
  Internals.adapters[NAME] = adapter;
})(window);
