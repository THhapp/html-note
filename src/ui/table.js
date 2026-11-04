/*!
 * NoteUI table module — C06 Table（从 content.js 按职责拆出）
 * Depends on NoteCore. C10 Markdown 运行时通过 NoteUI.Table 复用本组件。
 * 稳定行/单元身份、作者状态、getTarget/getState 与旧输入兼容语义保持不变。
 */
(function (global) {
  'use strict';

  var NoteUI = global.NoteUI = global.NoteUI || {};
  var VERSION = '1.0.0';
  var own = function (object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  };

  function core() {
    var api = global.NoteCore;
    if (!api) throw new Error('NoteUI 内容组件需要先加载 NoteCore。');
    return api;
  }

  function text(value) {
    return value == null ? '' : String(value);
  }

  function create(tag, className, content) {
    var C = core();
    var node = C.el(tag, className);
    if (arguments.length > 2) C.setContent(node, content);
    return node;
  }

  function setContent(target, value) {
    core().setContent(target, value);
  }

  function clear(target) {
    core().clear(target);
  }

  function isNode(value) {
    return Boolean(core().isNode(value));
  }

  function hidden(element, hide) {
    if (hide) element.setAttribute('hidden', '');
    else element.removeAttribute('hidden');
  }

  function maxHeightValue(value) {
    if (typeof value === 'number' && isFinite(value) && value > 0) return value + 'px';
    if (typeof value === 'string' && value.trim()) return value.trim();
    return '';
  }

  /* ------------------------------------------------------------------ *
   * C06 Table
   *
   * 兼容边界（旧输入全部保持）：
   * - columns/rows/rowKey/caption/empty/sort/onSort/emphasis/maxHeight/dense 语义不变；
   * - getTarget(rowKey) 仍返回当前 <tr>，行键重复时仍只保留最后一个映射；
   * - 表头排序、稳定排序、空态、滚动区与既有类名/aria 保持不变。
   * - reserveRows: 已知未来最大行数时预留隐藏正文行槽，只影响布局高度；
   *   getState().rows / readModel / getTarget 仍只含真实数据行。
   *
   * 本轮新增（设计 6.1）：
   * - 稳定行/单元身份：<tr data-row-key>、<td data-col-key>；同键/同列局部更新不再重建整表。
   * - 作者声明状态（不内置课程规则；state/cellStates 是行数据保留字段，不要再用作列键）：
   *     row.state        string | number | string[] | { type|name, label? } | 上述数组
   *     row.cellStates   { [columnKey]: 同上 }（按列替换；整行替换后旧状态自然消失）
   *     也可以不给行数据，改用 options.rowState(row,index,rowKey) 或
   *     options.cellState(row,column,rowKey,index) 计算状态；声明了对应函数时以函数为准，
   *     不再读取 row.state / row.cellStates。
   *   状态渲染为 data-row-state / data-cell-state（空格分隔类型）和
   *   nui-table__row--state-<type> / nui-table__cell--state-<type> 类；
   *   只有状态带 label 时才渲染可见的 .nui-table__state 标签，不自动补“关注/变化”文字。
   *   type 建议用不含空白的单 token；带空白时 data 属性按空格拆分，类名会换成连字符。
   * - getTarget(query) 扩展：
   *     getTarget(rowKey)                          -> <tr>（兼容）
   *     getTarget({ row|rowKey|key: rowKey })      -> <tr>
   *     getTarget({ row, column|col: columnKey })  -> <td>
   *     part:'row' 强制返回行；part:'cell' 需要列键。
   * - getState() 返回当前列/行/排序/强调/状态快照（见实例方法注释；销毁后为 null）。
   * - 值、强调、状态或排序方向变化只更新对应行/单元；只有列键/顺序/对齐/可排序列
   *   等结构变化才重建该行单元或表头。行键不变时 <tr> 身份保留；排序只移动现有节点。
   *   空行（rows 为空）会清除行节点缓存，恢复数据时按新行创建。
   *   重复行键仍按旧兼容语义：两行都渲染，getTarget 返回最后一个映射。
   * ------------------------------------------------------------------ */

  var TABLE_DEFAULTS = {
    columns: [],
    rows: [],
    rowKey: null,
    caption: '',
    empty: '暂无数据',
    sort: false,
    onSort: null,
    emphasis: null,
    maxHeight: null,
    dense: false,
    rowState: null,
    cellState: null,
    /* opt-in：为已知的未来行数预留正文行槽（隐藏占位行），让表格高度不随行数增长。
     * 0 表示不预留，空态仍按普通空行渲染。 */
    reserveRows: 0,
    /* opt-in：状态 label 使用稳定槽（每行常驻隐藏占位，label 显隐不改变行高）。
     * Adapter 场景默认开启；独立使用默认关闭。 */
    stableStateLabels: false
  };
  var MAX_RESERVE_ROWS = 100;
  var TABLE_NO_VALUE = {};

  /* reserveRows 是对“已知未来行数”的布局容量，不是数据；在创建任何占位 DOM 前
   * 统一拒绝非整数、负数、非有限值和超出上限的值，避免把 Infinity 变成无界循环。 */
  function normalizeReserveRows(value) {
    var shown = value === Infinity ? 'Infinity' : (value === -Infinity ? '-Infinity' : (Number.isNaN && Number.isNaN(value) ? 'NaN' : String(value)));
    if (typeof value !== 'number' || !isFinite(value) || Math.floor(value) !== value || value < 0 || value > MAX_RESERVE_ROWS) {
      throw new RangeError('Table reserveRows 必须是 0 到 ' + MAX_RESERVE_ROWS + ' 之间的整数（当前 ' + shown + '）。');
    }
    return value;
  }
  var tableCollator = null;

  function sameKey(left, right) {
    return String(left) === String(right);
  }

  function anyKeyMatch(candidate, key) {
    if (Array.isArray(candidate)) {
      return candidate.some(function (item) { return sameKey(item, key); });
    }
    return candidate != null && sameKey(candidate, key);
  }

  function tableAlignment(value) {
    if (value === 'left' || value === 'start') return 'start';
    if (value === 'right' || value === 'end') return 'end';
    if (value === 'center') return 'center';
    return 'start';
  }

  function tableCellValue(row, column) {
    if (!row || column == null) return '';
    return row[column.key];
  }

  function sortText(value) {
    if (isNode(value)) return value.textContent || '';
    return value == null ? '' : String(value);
  }

  function tableSort(sort) {
    if (!sort) return { enabled: false, key: null, direction: null };
    if (sort === true) return { enabled: true, key: null, direction: null };
    if (typeof sort === 'object') {
      var key = sort.key == null ? null : sort.key;
      var direction = key == null ? null : (sort.direction === 'desc' ? 'desc' : 'asc');
      return { enabled: true, key: key, direction: direction };
    }
    return { enabled: true, key: null, direction: null };
  }

  /* 状态值归一：字符串/数字、数组、{type|name,label} 与它们的数组。无效项忽略。 */
  function tableStateItems(value) {
    var items = [];
    var seen = {};
    function add(item) {
      if (item == null || item === false || item === '') return;
      if (Array.isArray(item)) {
        item.forEach(add);
        return;
      }
      if (typeof item === 'string' || typeof item === 'number') {
        var type = text(item).trim();
        if (!type || own(seen, '$' + type)) return;
        seen['$' + type] = true;
        items.push({ type: type, label: '' });
        return;
      }
      if (typeof item === 'object') {
        var rawType = item.type != null ? item.type : item.name;
        var typeText = rawType == null ? '' : text(rawType).trim();
        if (!typeText || own(seen, '$' + typeText)) return;
        seen['$' + typeText] = true;
        items.push({ type: typeText, label: item.label == null ? '' : text(item.label).trim() });
      }
    }
    add(value);
    return items;
  }

  function tableStateToken(type) {
    return String(type).trim().replace(/\s+/g, '-');
  }

  /* 只写 data 属性与服务端声明状态的类；不解释状态含义，也不自动生成文案。 */
  function setTableState(node, attr, classPrefix, items, previousTokens) {
    var names = [];
    var tokens = [];
    var seen = {};
    items.forEach(function (item) {
      if (!own(seen, '$' + item.type)) {
        seen['$' + item.type] = true;
        names.push(item.type);
        var token = tableStateToken(item.type);
        if (token && tokens.indexOf(token) < 0) tokens.push(token);
      }
    });
    if (names.length) node.setAttribute(attr, names.join(' '));
    else node.removeAttribute(attr);
    var previous = Array.isArray(previousTokens) ? previousTokens : [];
    previous.forEach(function (token) {
      if (tokens.indexOf(token) < 0) node.classList.remove(classPrefix + token);
    });
    tokens.forEach(function (token) {
      if (previous.indexOf(token) < 0) node.classList.add(classPrefix + token);
    });
    return tokens;
  }

  /* 状态可见标签：仅作者显式给 label 时出现；内容替换会清掉子节点，所以调用方在 setContent 之后调用。
   * stableState 不为空时（opt-in），无标签也保留一个真实文本行高度的隐藏槽：
   * - 隐藏槽用同一个 .nui-table__state 盒模型和已见过的示例文字，label 出现/消失时行高与列宽不跳；
   * - 槽内文字是真实 DOM 文本（不是固定 min-height），不裁切换行文字；aria-hidden 且 visibility:hidden；
   * - 没有标签时不再 removeChild，避免 label 消失导致表格高度回缩。 */
  function setTableStateLabel(host, items, box, stableState) {
    if (!box) return;
    var stable = stableState && stableState.enabled === true ? stableState : null;
    var labels = [];
    items.forEach(function (item) {
      if (item.label && labels.indexOf(item.label) < 0) labels.push(item.label);
    });
    var label = labels.join(' ');
    if (!label) {
      if (!stable) {
        if (box.el && box.el.parentNode === host) host.removeChild(box.el);
        return;
      }
      if (!box.el) box.el = create('span', 'nui-table__state nui-table__state--slot');
      else box.el.className = 'nui-table__state nui-table__state--slot';
      var placeholder = stable.sampleText || '\u00A0';
      if (box.el.textContent !== placeholder) box.el.textContent = placeholder;
      box.el.setAttribute('aria-hidden', 'true');
      box.el.style.visibility = 'hidden';
      if (box.el.parentNode !== host) host.appendChild(box.el);
      return;
    }
    if (!box.el) box.el = create('span', 'nui-table__state');
    box.el.className = 'nui-table__state';
    box.el.removeAttribute('aria-hidden');
    box.el.style.visibility = '';
    if (box.el.textContent !== label) box.el.textContent = label;
    if (items.length && items[0].type) box.el.setAttribute('data-state', items[0].type);
    else box.el.removeAttribute('data-state');
    if (box.el.parentNode !== host) host.appendChild(box.el);
    if (stable && box.el.parentNode) {
      /* 记录已见 label 的自然宽度作为后续隐藏槽的示例文字；不需要向示例/作者要求 min-height。 */
      var width = box.el.offsetWidth;
      if (width > stable.sampleWidth) {
        stable.sampleWidth = width;
        stable.sampleText = label;
      }
    }
  }

  NoteUI.Table = {
    version: VERSION,
    mount: function (host, input) {
      var C = core();
      C.validateHost(host);
      var state = C.assign({}, TABLE_DEFAULTS);
      var mountInput = input || {};
      C.assign(state, mountInput);
      if (own(mountInput, 'reserveRows')) state.reserveRows = normalizeReserveRows(mountInput.reserveRows);
      var root = create('div', 'nui-table');
      var scroll = create('div', 'nui-table__scroll');
      var table = create('table', 'nui-table__table');
      var caption = create('caption', 'nui-table__caption');
      var colgroup = create('colgroup', 'nui-table__colgroup');
      var thead = create('thead', 'nui-table__head');
      var tbody = create('tbody', 'nui-table__body');
      var hint = create('div', 'nui-table__scroll-hint');
      hint.id = C.uid('nui-table-hint');
      hidden(hint, true);
      scroll.setAttribute('tabindex', '0');
      scroll.setAttribute('role', 'region');
      scroll.setAttribute('aria-describedby', hint.id);
      table.append(caption, colgroup, thead, tbody);
      scroll.appendChild(table);
      root.append(scroll, hint);

      var stableState = {
        enabled: state.stableStateLabels === true,
        sampleText: '\u00A0',
        sampleWidth: 0
      };
      var rowMap = Object.create(null);
      var rowRecordByKey = Object.create(null);
      var rowRecords = Object.create(null);
      var rowOrder = [];
      var renderedRows = [];
      var columnsSignature = '';
      var headerSignature = null;
      var headRow = null;
      var sortEnabled = false;
      var activeSort = { key: null, direction: null };
      var captionBase = '数据表格。';
      var alive = true;
      var frame = 0;
      var bag = C.listeners(root);
      var disconnectResize = null;

      function currentColumns() {
        return Array.isArray(state.columns) ? state.columns : [];
      }

      function columnKeyString(column) {
        return column && column.key != null ? String(column.key) : '';
      }

      function columnSignature(columns) {
        return columns.map(function (column) {
          return columnKeyString(column) + '\u0001' + tableAlignment(column.align);
        }).join('\u0002');
      }

      function createSortRows(columns) {
        var source = Array.isArray(state.rows) ? state.rows : [];
        var indexed = source.map(function (row, index) {
          var key;
          if (typeof state.rowKey === 'function') key = state.rowKey(row, index);
          else if (typeof state.rowKey === 'string' && row && row[state.rowKey] != null) key = row[state.rowKey];
          else if (row && own(row, 'key') && row.key != null) key = row.key;
          if (key == null) key = index;
          return { row: row, index: index, key: key };
        });
        if (activeSort.key == null || activeSort.direction == null) return indexed;
        var column = null;
        columns.some(function (item) {
          if (sameKey(item.key, activeSort.key)) {
            column = item;
            return true;
          }
          return false;
        });
        if (!column) {
          activeSort = { key: null, direction: null };
          return indexed;
        }
        if (!tableCollator && global.Intl && global.Intl.Collator) {
          tableCollator = new global.Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });
        }
        indexed.sort(function (left, right) {
          var leftValue = tableCellValue(left.row, column);
          var rightValue = tableCellValue(right.row, column);
          var leftText = sortText(leftValue).trim();
          var rightText = sortText(rightValue).trim();
          var leftEmpty = leftText === '';
          var rightEmpty = rightText === '';
          if (leftEmpty && rightEmpty) return left.index - right.index;
          if (leftEmpty) return 1;
          if (rightEmpty) return -1;
          var compared;
          if (typeof leftValue === 'number' && typeof rightValue === 'number') {
            compared = leftValue - rightValue;
          } else if (tableCollator) {
            compared = tableCollator.compare(leftText, rightText);
          } else if (leftText < rightText) {
            compared = -1;
          } else if (leftText > rightText) {
            compared = 1;
          } else {
            compared = 0;
          }
          if (compared === 0) return left.index - right.index;
          return activeSort.direction === 'desc' ? -compared : compared;
        });
        return indexed;
      }

      function updateScrollState() {
        if (!alive) return;
        var horizontal = scroll.scrollWidth > scroll.clientWidth + 1;
        var vertical = scroll.scrollHeight > scroll.clientHeight + 1;
        var parts = [];
        if (horizontal) parts.push('横向');
        if (vertical) parts.push('纵向');
        hint.textContent = parts.length ? '表格可' + parts.join('和') + '滚动查看完整内容。' : '';
        hidden(hint, parts.length === 0);
        scroll.setAttribute('aria-label', captionBase + (parts.length ? '可' + parts.join('和') + '滚动查看。' : ''));
      }

      function measure() {
        if (!alive) return;
        if (frame) {
          global.cancelAnimationFrame(frame);
          frame = 0;
        }
        frame = global.requestAnimationFrame(function () {
          frame = 0;
          updateScrollState();
        });
      }

      function bindOverflow() {
        if (!disconnectResize) disconnectResize = C.onResize(scroll, updateScrollState);
      }

      /* ---------------- 状态来源 ---------------- */

      function rowStatesOf(row, index, key) {
        var value = null;
        if (typeof state.rowState === 'function') value = state.rowState(row, index, key);
        else if (row && own(row, 'state')) value = row.state;
        return tableStateItems(value);
      }

      function cellStatesOf(row, column, key, index) {
        var value = null;
        if (typeof state.cellState === 'function') value = state.cellState(row, column, key, index);
        else if (row && row.cellStates && own(row.cellStates, column.key)) value = row.cellStates[column.key];
        return tableStateItems(value);
      }

      /* ---------------- 行/单元增量渲染 ---------------- */

      function createCellRecord(column) {
        var td = create('td', [
          'nui-table__cell',
          'nui-table__cell--' + tableAlignment(column.align)
        ].join(' '));
        if (column.key != null) td.setAttribute('data-col-key', String(column.key));
        return {
          td: td,
          columnKey: columnKeyString(column),
          value: TABLE_NO_VALUE,
          stateTokens: [],
          stateItems: [],
          label: { el: null }
        };
      }

      function createRowRecord(entry, columns) {
        var tr = create('tr', 'nui-table__row');
        var record = {
          tr: tr,
          keyString: String(entry.key),
          row: entry.row,
          index: entry.index,
          cells: [],
          rowStateTokens: [],
          rowStates: [],
          rowLabel: { el: null }
        };
        tr.setAttribute('data-row-key', record.keyString);
        columns.forEach(function (column) {
          var cell = createCellRecord(column);
          record.cells.push(cell);
          tr.appendChild(cell.td);
        });
        return record;
      }

      function rebuildRowCells(record, columns) {
        clear(record.tr);
        record.cells = columns.map(function (column) {
          var cell = createCellRecord(column);
          record.tr.appendChild(cell.td);
          return cell;
        });
        record.rowLabel = { el: null };
      }

      function updateCell(cell, row, column, key, index) {
        var alignment = tableAlignment(column.align);
        ['start', 'center', 'end'].forEach(function (name) {
          cell.td.classList.toggle('nui-table__cell--' + name, name === alignment);
        });
        var emphasisOn = Boolean(state.emphasis && state.emphasis.column != null &&
          anyKeyMatch(state.emphasis.column, column.key));
        cell.td.classList.toggle('nui-table__cell--emphasis', emphasisOn);
        var items = cellStatesOf(row, column, key, index);
        cell.stateItems = items;
        cell.stateTokens = setTableState(cell.td, 'data-cell-state', 'nui-table__cell--state-', items, cell.stateTokens);
        var value = tableCellValue(row, column);
        if (cell.value === TABLE_NO_VALUE || cell.value !== value) {
          setContent(cell.td, value);
          cell.value = value;
        }
        setTableStateLabel(cell.td, items, cell.label,
          stableState.enabled && (items.length > 0 || (cell.label && cell.label.el)) ? stableState : null);
      }

      function updateRowRecord(record, entry, columns) {
        record.row = entry.row;
        record.index = entry.index;
        record.keyString = String(entry.key);
        record.tr.setAttribute('data-row-key', record.keyString);
        var emphasisOn = Boolean(state.emphasis && state.emphasis.row != null &&
          anyKeyMatch(state.emphasis.row, entry.key));
        record.tr.classList.toggle('nui-table__row--emphasis', emphasisOn);
        columns.forEach(function (column, index) {
          updateCell(record.cells[index], entry.row, column, entry.key, entry.index);
        });
        var items = rowStatesOf(entry.row, entry.index, entry.key);
        record.rowStates = items;
        record.rowStateTokens = setTableState(record.tr, 'data-row-state', 'nui-table__row--state-', items, record.rowStateTokens);
        if (record.cells.length) setTableStateLabel(record.cells[0].td, items, record.rowLabel, stableState);
      }

      function removeRowRecord(record) {
        if (!record) return;
        if (record.tr.parentNode) record.tr.parentNode.removeChild(record.tr);
      }

      function nextRowElement(node) {
        var current = node;
        while (current) {
          if (current.nodeType === 1 && current.classList && current.classList.contains('nui-table__row')) return current;
          current = current.nextSibling;
        }
        return null;
      }

      /* 已知容量的隐藏行槽：不进入 rowMap/readModel，也不出现在 getState().rows。
       * 每行用真实 cell 盒模型占位，aria-hidden + visibility:hidden；空态行算一个容量行。 */
      function clearReserveRows() {
        Array.prototype.slice.call(tbody.querySelectorAll('.nui-table__reserve-row')).forEach(function (tr) {
          if (tr.parentNode) tr.parentNode.removeChild(tr);
        });
      }

      function renderReserveRows(columns, usedRows) {
        clearReserveRows();
        var capacity = Math.max(0, Math.floor(Number(state.reserveRows) || 0));
        var count = Math.max(0, capacity - Math.max(0, usedRows | 0));
        for (var i = 0; i < count; i += 1) {
          var tr = create('tr', 'nui-table__reserve-row');
          tr.setAttribute('aria-hidden', 'true');
          tr.setAttribute('data-reserve-row', '');
          tr.style.visibility = 'hidden';
          columns.forEach(function (column) {
            var td = create('td', 'nui-table__cell');
            if (column.key != null) td.setAttribute('data-col-key', String(column.key));
            td.textContent = '\u00A0';
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        }
      }

      function renderEmptyRows(columns) {
        Array.prototype.slice.call(tbody.querySelectorAll('.nui-table__row')).forEach(function (tr) {
          if (tr.parentNode) tr.parentNode.removeChild(tr);
        });
        rowOrder.forEach(function (id) { removeRowRecord(rowRecords[id]); delete rowRecords[id]; });
        rowOrder = [];
        renderedRows = [];
        clear(tbody);
        var count = columns.length;
        var emptyRow = create('tr', 'nui-table__empty-row');
        var emptyCell = create('td', 'nui-table__empty-cell');
        emptyCell.colSpan = count || 1;
        setContent(emptyCell, state.empty == null ? '暂无数据' : state.empty);
        emptyRow.appendChild(emptyCell);
        tbody.appendChild(emptyRow);
        renderReserveRows(columns, 1);
        rowMap = Object.create(null);
        rowRecordByKey = Object.create(null);
      }

      function renderRows(columns) {
        var entries = createSortRows(columns);
        if (!columns.length || !entries.length) {
          renderEmptyRows(columns);
          return;
        }
        /* 空态行先移除；行记录继续复用。 */
        Array.prototype.slice.call(tbody.querySelectorAll('.nui-table__empty-row')).forEach(function (tr) {
          if (tr.parentNode) tr.parentNode.removeChild(tr);
        });
        var counts = Object.create(null);
        entries.forEach(function (entry) {
          var keyString = String(entry.key);
          counts[keyString] = (counts[keyString] || 0) + 1;
        });
        var seen = Object.create(null);
        var desired = [];
        entries.forEach(function (entry) {
          var keyString = String(entry.key);
          seen[keyString] = (seen[keyString] || 0) + 1;
          var id = keyString + '\u0000' + (counts[keyString] > 1 ? seen[keyString] : '');
          desired.push({ entry: entry, id: id, record: null });
        });
        var used = Object.create(null);
        desired.forEach(function (slot) {
          var record = rowRecords[slot.id];
          if (!record) {
            record = createRowRecord(slot.entry, columns);
            rowRecords[slot.id] = record;
            tbody.appendChild(record.tr);
          }
          updateRowRecord(record, slot.entry, columns);
          used[slot.id] = true;
          slot.record = record;
        });
        rowOrder.forEach(function (id) {
          if (used[id]) return;
          removeRowRecord(rowRecords[id]);
          delete rowRecords[id];
        });
        rowOrder = desired.map(function (slot) { return slot.id; });
        /* 最小移动：已按目标顺序的节点不重复插入。 */
        var cursor = nextRowElement(tbody.firstChild);
        desired.forEach(function (slot) {
          if (slot.record.tr === cursor) {
            cursor = nextRowElement(slot.record.tr.nextSibling);
            return;
          }
          tbody.insertBefore(slot.record.tr, cursor);
        });
        rowMap = Object.create(null);
        rowRecordByKey = Object.create(null);
        renderedRows = desired.map(function (slot) {
          var record = slot.record;
          rowMap['$' + record.keyString] = record.tr;
          rowRecordByKey['$' + record.keyString] = record;
          return { entry: slot.entry, record: record };
        });
        renderReserveRows(columns, desired.length);
      }

      /* ---------------- 表头与整体 ---------------- */

      function renderColgroup(columns) {
        clear(colgroup);
        columns.forEach(function (column) {
          var col = create('col');
          if (column.width != null && column.width !== '') {
            col.style.width = typeof column.width === 'number' ? column.width + 'px' : String(column.width);
          }
          colgroup.appendChild(col);
        });
      }

      /* 列键/顺序/对齐/可排序列与排序开关决定表头结构；标签、强调、排序方向可原地更新。 */
      function headerSignatureOf(columns) {
        return (sortEnabled ? '1' : '0') + '\u0003' + columns.map(function (column) {
          return columnKeyString(column) + '\u0001' + tableAlignment(column.align) +
            '\u0001' + (column.sortable === false ? '0' : '1');
        }).join('\u0002');
      }

      function sortButtonLabel(column) {
        var labelText = column.label && column.label.nodeType
          ? C.text(column.label.textContent).trim()
          : C.text(column.label).trim();
        var sortName = labelText || '此列';
        var sortHint = '按“' + sortName + '”排序';
        if (activeSort.key != null && sameKey(activeSort.key, column.key)) {
          sortHint += activeSort.direction === 'desc'
            ? '，当前降序，点击取消排序'
            : '，当前升序，点击切换为降序';
        }
        return sortHint;
      }

      function updateHeaderCell(th, column, index) {
        var alignment = tableAlignment(column.align);
        ['start', 'center', 'end'].forEach(function (name) {
          th.classList.toggle('nui-table__cell--' + name, name === alignment);
        });
        if (activeSort.key != null && sameKey(activeSort.key, column.key)) {
          th.setAttribute('aria-sort', activeSort.direction === 'desc' ? 'descending' : 'ascending');
        } else {
          th.removeAttribute('aria-sort');
        }
        var emphasisOn = Boolean(state.emphasis && state.emphasis.column != null &&
          anyKeyMatch(state.emphasis.column, column.key));
        th.classList.toggle('nui-table__cell--emphasis', emphasisOn);
        var sortable = sortEnabled && column.sortable !== false;
        var labelEl = th.querySelector('.nui-table__sort-label');
        if (labelEl) setContent(labelEl, column.label);
        if (!sortable) return;
        var button = th.querySelector('.nui-table__sort');
        if (!button) return;
        button.setAttribute('data-col-index', String(index));
        button.setAttribute('aria-label', sortButtonLabel(column));
        var indicator = button.querySelector('.nui-table__sort-indicator');
        if (indicator) {
          indicator.textContent = activeSort.key != null && sameKey(activeSort.key, column.key)
            ? (activeSort.direction === 'desc' ? '↓' : '↑')
            : '↕';
        }
      }

      function syncHeader(columns) {
        if (!headRow) return;
        var cells = headRow.children;
        columns.forEach(function (column, index) {
          if (cells[index]) updateHeaderCell(cells[index], column, index);
        });
      }

      function rebuildHeader(columns) {
        clear(thead);
        headRow = create('tr', 'nui-table__head-row');
        columns.forEach(function (column, index) {
          var th = create('th', [
            'nui-table__cell',
            'nui-table__head-cell',
            'nui-table__cell--' + tableAlignment(column.align)
          ].join(' '));
          th.scope = 'col';
          var sortable = sortEnabled && column.sortable !== false;
          if (sortable) {
            var button = create('button', 'nui-table__sort');
            button.type = 'button';
            var label = create('span', 'nui-table__sort-label');
            var indicator = create('span', 'nui-table__sort-indicator');
            indicator.setAttribute('aria-hidden', 'true');
            button.append(label, indicator);
            th.appendChild(button);
          } else {
            th.appendChild(create('span', 'nui-table__sort-label'));
          }
          updateHeaderCell(th, column, index);
          headRow.appendChild(th);
        });
        if (columns.length) thead.appendChild(headRow);
        headerSignature = headerSignatureOf(columns);
      }

      function render() {
        stableState.enabled = state.stableStateLabels === true;
        var columns = currentColumns();
        if (activeSort.key != null) {
          var hasActive = columns.some(function (column) { return sameKey(column.key, activeSort.key); });
          if (!hasActive) activeSort = { key: null, direction: null };
        }
        var signature = columnSignature(columns);
        var structureChanged = signature !== columnsSignature;
        columnsSignature = signature;

        var captionText = text(state.caption).trim();
        captionBase = captionText ? '表格：' + captionText + '。' : '数据表格。';
        hidden(caption, !captionText);
        if (caption.textContent !== captionText) caption.textContent = captionText;

        renderColgroup(columns);
        var nextHeaderSignature = headerSignatureOf(columns);
        if (headerSignature === null || headerSignature !== nextHeaderSignature) {
          rebuildHeader(columns);
        } else {
          syncHeader(columns);
        }
        if (structureChanged) {
          /* 列键/顺序/对齐变化：仅重建每行的单元，保留行节点身份。 */
          Object.keys(rowRecords).forEach(function (id) {
            rebuildRowCells(rowRecords[id], columns);
          });
        }
        renderRows(columns);

        var width = columns.length ? columns.length * 128 : 0;
        table.style.minWidth = width ? Math.min(width, 4096) + 'px' : '';
        var maxHeight = maxHeightValue(state.maxHeight);
        if (maxHeight) scroll.style.maxHeight = maxHeight;
        else scroll.style.removeProperty('max-height');
        root.classList.toggle('nui-table--dense', Boolean(state.dense));
        root.classList.toggle('nui-table--sortable', sortEnabled);
        stableState.enabled = state.stableStateLabels === true;
        root.classList.toggle('nui-table--stable-state', stableState.enabled);
        root.classList.toggle('nui-table--reserve', Math.max(0, Math.floor(Number(state.reserveRows) || 0)) > 0);
        scroll.setAttribute('aria-label', captionBase);
        updateScrollState();
      }

      function syncSort(patch) {
        if (patch === null || (patch && own(patch, 'sort'))) {
          var next = tableSort(state.sort);
          sortEnabled = next.enabled;
          activeSort = { key: sortEnabled ? next.key : null, direction: sortEnabled ? next.direction : null };
        }
      }

      function onRootClick(event) {
        var target = event.target;
        var button = target && target.closest ? target.closest('.nui-table__sort') : null;
        if (!button || !root.contains(button) || !sortEnabled) return;
        var index = Number(button.getAttribute('data-col-index'));
        var columns = currentColumns();
        var column = columns[index];
        if (!column || column.sortable === false) return;
        if (activeSort.key == null || !sameKey(activeSort.key, column.key)) {
          activeSort = { key: column.key, direction: 'asc' };
        } else if (activeSort.direction === 'asc') {
          activeSort = { key: column.key, direction: 'desc' };
        } else {
          activeSort = { key: null, direction: null };
        }
        render();
        var refreshed = root.querySelector('.nui-table__sort[data-col-index="' + index + '"]');
        if (refreshed && typeof refreshed.focus === 'function') {
          try { refreshed.focus({ preventScroll: true }); } catch (ignore) { refreshed.focus(); }
        }
        if (typeof state.onSort === 'function') {
          var sorted = createSortRows(columns);
          state.onSort({
            key: activeSort.key,
            direction: activeSort.direction,
            column: activeSort.key == null ? null : column,
            rows: sorted.map(function (entry) { return entry.row; })
          }, event);
        }
      }

      function cleanup() {
        alive = false;
        bag.clear();
        if (disconnectResize) disconnectResize();
        if (frame && global.cancelAnimationFrame) global.cancelAnimationFrame(frame);
      }

      bag.on('click', onRootClick);

      /* Initial sort state must exist before the first render. */
      syncSort(null);
      var instance = C.component(root, state, function (patch) {
        syncSort(patch);
        render();
      }, cleanup);
      var rawUpdate = instance.update;
      instance.update = function (patch) {
        if (patch && typeof patch === 'object' && own(patch, 'reserveRows')) {
          var nextPatch = {};
          Object.keys(patch).forEach(function (key) { nextPatch[key] = patch[key]; });
          nextPatch.reserveRows = normalizeReserveRows(patch.reserveRows);
          patch = nextPatch;
        }
        return rawUpdate(patch);
      };
      render();
      host.appendChild(root);
      bindOverflow();
      updateScrollState();
      measure();

      function findCell(record, columnKey) {
        if (!record || !record.cells) return null;
        var wanted = String(columnKey);
        for (var i = 0; i < record.cells.length; i += 1) {
          if (record.cells[i].columnKey === wanted) return record.cells[i].td;
        }
        return null;
      }

      function getTarget(query) {
        if (!alive || query == null) return null;
        var rowKey = null;
        var columnKey = null;
        var hasColumn = false;
        if (typeof query === 'object' && query.nodeType == null) {
          if (own(query, 'row')) rowKey = query.row;
          else if (own(query, 'rowKey')) rowKey = query.rowKey;
          else if (own(query, 'key')) rowKey = query.key;
          if (own(query, 'column')) {
            columnKey = query.column;
            hasColumn = true;
          } else if (own(query, 'col')) {
            columnKey = query.col;
            hasColumn = true;
          }
          if (query.part === 'row') hasColumn = false;
          else if (query.part === 'cell' && !hasColumn) return null;
        } else {
          rowKey = query;
        }
        if (rowKey == null) return null;
        var keyString = String(rowKey);
        var tr = rowMap['$' + keyString];
        if (!tr) return null;
        if (!hasColumn) return tr;
        var record = rowRecordByKey['$' + keyString];
        return record ? findCell(record, columnKey) : null;
      }

      function copyStateItems(items) {
        return (items || []).map(function (item) { return { type: item.type, label: item.label }; });
      }

      function getState() {
        if (!alive) return null;
        var columns = currentColumns();
        var rows = renderedRows.map(function (rendered) {
          var record = rendered.record;
          return {
            key: rendered.entry.key,
            keyString: record.keyString,
            index: rendered.entry.index,
            row: rendered.entry.row,
            states: copyStateItems(record.rowStates),
            cells: columns.map(function (column, index) {
              var cell = record.cells[index];
              var value = cell && cell.value !== TABLE_NO_VALUE ? cell.value : undefined;
              return {
                key: column.key,
                column: column,
                value: value,
                states: cell ? copyStateItems(cell.stateItems) : []
              };
            })
          };
        });
        return {
          columns: columns.slice(),
          rows: rows,
          sort: { enabled: sortEnabled, key: activeSort.key, direction: activeSort.direction },
          emphasis: state.emphasis,
          caption: text(state.caption).trim(),
          empty: !rows.length,
          emptyText: typeof state.empty === 'string'
            ? state.empty
            : (state.empty && state.empty.nodeType === 1 ? text(state.empty.textContent) : ''),
          dense: Boolean(state.dense),
          maxHeight: state.maxHeight
        };
      }

      instance.getTarget = getTarget;
      instance.getState = getState;
      return instance;
    }
  };
})(window);
