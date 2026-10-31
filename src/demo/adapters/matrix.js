/* NoteDemo Adapter — matrix（D02 矩阵；首版只做静态恢复）。
 * Scope: window.NoteDemoInternals.adapters.matrix
 * Depends on: NoteCore、NoteViz.Matrix（src/viz/objects-sequence-matrix.js）；可选组件只在实际 mount/adopt 时检查，文件顶层不依赖。
 * 经典脚本，无模块/无网络/无 eval。
 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var ADAPTER_NAME = 'matrix';
  var EMPTY_SELECTION = { rows: [], cols: [], cells: [] };

  function fail(message) {
    throw new Error(ADAPTER_NAME + ' Adapter：' + message);
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function requireMatrix() {
    var viz = global.NoteViz;
    if (!viz || !viz.Matrix || typeof viz.Matrix.mount !== 'function') {
      throw new Error('matrix Adapter 需要先加载 NoteViz.Matrix（src/viz/objects-sequence-matrix.js）。');
    }
    return viz.Matrix;
  }

  function normalizeId(value, where) {
    if (value == null) fail(where + ' 不能为空');
    if (typeof value !== 'string' && typeof value !== 'number') fail(where + ' 必须是字符串 ID');
    var id = String(value);
    if (id === '') fail(where + ' 不能为空字符串');
    return id;
  }

  function normalizeAxis(list, where) {
    if (!Array.isArray(list)) fail(where + ' 必须是数组');
    var seen = {};
    var result = [];
    list.forEach(function (entry, index) {
      if (!isObject(entry)) fail(where + '[' + index + '] 必须是 {id,label} 对象');
      var id = normalizeId(entry.id, where + '[' + index + '].id');
      if (Object.prototype.hasOwnProperty.call(seen, id)) fail(where + ' 中的 id "' + id + '" 重复');
      seen[id] = true;
      var label = entry.label;
      if (label == null) label = '';
      if (typeof label !== 'string') fail(where + '[' + index + '].label 必须是字符串');
      result.push({ id: id, label: label });
    });
    return result;
  }

  function normalizeValues(values, rowCount, colCount) {
    if (!Array.isArray(values)) fail('view.values 必须是二维数组');
    var result = [];
    var rowIndex;
    var colIndex;
    for (rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      var source = values[rowIndex];
      var row = [];
      for (colIndex = 0; colIndex < colCount; colIndex += 1) {
        var cell = Array.isArray(source) ? source[colIndex] : undefined;
        row.push(cell === undefined || cell === null ? '' : cell);
      }
      result.push(row);
    }
    return result;
  }

  function normalizeSelection(input, rowIds, colIds, where) {
    var result = { rows: [], cols: [], cells: [] };
    if (input == null) return result;
    if (!isObject(input)) fail(where + ' 必须是 {rows,cols,cells} 对象');
    var rowSet = {};
    var colSet = {};
    rowIds.forEach(function (id) { rowSet[id] = true; });
    colIds.forEach(function (id) { colSet[id] = true; });

    if (input.rows != null) {
      if (!Array.isArray(input.rows)) fail(where + '.rows 必须是数组');
      var seenRows = {};
      input.rows.forEach(function (ref, index) {
        var id = normalizeId(ref, where + '.rows[' + index + ']');
        if (!rowSet[id]) fail(where + '.rows 引用了不存在的行 "' + id + '"');
        if (!seenRows[id]) {
          seenRows[id] = true;
          result.rows.push(id);
        }
      });
    }
    if (input.cols != null) {
      if (!Array.isArray(input.cols)) fail(where + '.cols 必须是数组');
      var seenCols = {};
      input.cols.forEach(function (ref, index) {
        var id = normalizeId(ref, where + '.cols[' + index + ']');
        if (!colSet[id]) fail(where + '.cols 引用了不存在的列 "' + id + '"');
        if (!seenCols[id]) {
          seenCols[id] = true;
          result.cols.push(id);
        }
      });
    }
    if (input.cells != null) {
      if (!Array.isArray(input.cells)) fail(where + '.cells 必须是数组');
      var seenCells = {};
      input.cells.forEach(function (cell, index) {
        if (!isObject(cell)) fail(where + '.cells[' + index + '] 必须是 {row,col} 对象');
        var rowId = normalizeId(cell.row, where + '.cells[' + index + '].row');
        var colId = normalizeId(cell.col != null ? cell.col : cell.column, where + '.cells[' + index + '].col');
        if (!rowSet[rowId]) fail(where + '.cells 引用了不存在的行 "' + rowId + '"');
        if (!colSet[colId]) fail(where + '.cells 引用了不存在的列 "' + colId + '"');
        var key = rowId + '\u0000' + colId;
        if (!seenCells[key]) {
          seenCells[key] = true;
          result.cells.push({ row: rowId, col: colId });
        }
      });
    }
    result.rows.sort();
    result.cols.sort();
    result.cells.sort(function (a, b) {
      if (a.row < b.row) return -1;
      if (a.row > b.row) return 1;
      if (a.col < b.col) return -1;
      if (a.col > b.col) return 1;
      return 0;
    });
    return result;
  }

  function copySelection(input) {
    var source = isObject(input) ? input : EMPTY_SELECTION;
    return {
      rows: Array.isArray(source.rows) ? source.rows.slice() : [],
      cols: Array.isArray(source.cols) ? source.cols.slice() : [],
      cells: (Array.isArray(source.cells) ? source.cells : []).map(function (cell) {
        return { row: cell.row, col: cell.col };
      })
    };
  }

  function normalizeView(input) {
    if (!isObject(input)) fail('view 必须是 {rows,columns,values,focus?,changed?,caption?} 对象');
    var rows = normalizeAxis(input.rows, 'view.rows');
    var columns = normalizeAxis(input.columns, 'view.columns');
    var rowIds = rows.map(function (row) { return row.id; });
    var colIds = columns.map(function (column) { return column.id; });
    var caption = input.caption;
    if (caption == null) caption = '';
    if (typeof caption !== 'string') fail('view.caption 必须是字符串');
    return {
      model: {
        rows: rows,
        columns: columns,
        values: normalizeValues(input.values, rows.length, columns.length)
      },
      cues: {
        focus: normalizeSelection(input.focus, rowIds, colIds, 'view.focus'),
        changed: normalizeSelection(input.changed, rowIds, colIds, 'view.changed'),
        caption: caption
      }
    };
  }

  function validateAction(action) {
    var type = isObject(action) && action.type != null ? String(action.type) : '';
    fail('matrix 是静态恢复型 Adapter，不支持动作' + (type ? ' "' + type + '"' : '') + '。');
  }

  function viewCuePatch(view) {
    var model = isObject(view && view.model) ? view.model : { rows: [], columns: [], values: [] };
    var cues = isObject(view && view.cues) ? view.cues : {};
    return {
      rows: model.rows,
      columns: model.columns,
      values: model.values,
      focus: copySelection(cues.focus),
      changed: copySelection(cues.changed),
      caption: cues.caption == null ? '' : String(cues.caption)
    };
  }

  function applyCuesPatch(cues) {
    var input = isObject(cues) ? cues : {};
    return {
      focus: copySelection(input.focus),
      changed: copySelection(input.changed),
      caption: input.caption == null ? '' : String(input.caption)
    };
  }

  function queryTarget(instance, query) {
    if (!isObject(query) || query.row == null || query.col == null) return null;
    var target = instance.getTarget({ row: query.row, col: query.col });
    return target && target.nodeType === 1 ? target : null;
  }

  function copyStateSelection(selection) {
    var input = isObject(selection) ? selection : {};
    return {
      rows: Array.isArray(input.rows) ? input.rows.slice() : [],
      cols: Array.isArray(input.cols) ? input.cols.slice() : [],
      cells: (Array.isArray(input.cells) ? input.cells : []).map(function (cell) {
        return { row: cell.row, col: cell.col };
      })
    };
  }

  function canonicalFromState(state) {
    if (!isObject(state) || !Array.isArray(state.rows) || !Array.isArray(state.columns)) {
      fail('getState() 必须返回 rows/columns/values/focus/changed');
    }
    return normalizeView({
      rows: state.rows,
      columns: state.columns,
      values: state.values,
      focus: copyStateSelection(state.focus),
      changed: copyStateSelection(state.changed),
      caption: state.caption == null ? '' : String(state.caption)
    });
  }

  function effectsModule() {
    var effects = Internals.effects;
    if (!effects || typeof effects.captureContent !== 'function' ||
        typeof effects.planValueSwap !== 'function' || typeof effects.planCueChanges !== 'function') {
      throw new Error('matrix Adapter 需要先加载 NoteDemoInternals.effects。');
    }
    return effects;
  }
  var CUE_PROPS = ['backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor',
    'borderLeftColor', 'outlineColor', 'outlineWidth', 'outlineOffset', 'color'];

  function motionTargets(instance) {
    var list = typeof instance.getMotionTargets === 'function' ? instance.getMotionTargets() : [];
    return Array.isArray(list) ? list.filter(function (target) { return target && target.element; }) : [];
  }

  function headerTargets(instance) {
    var root = instance.el || instance.root || null;
    var output = [];
    if (!root || !root.querySelectorAll) return output;
    Array.prototype.forEach.call(root.querySelectorAll('.nviz-matrix__rowhead[data-id], .nviz-matrix__colhead[data-id]'), function (th) {
      var kind = th.classList.contains('nviz-matrix__rowhead') ? 'row' : 'col';
      var id = th.getAttribute('data-id');
      if (id == null) return;
      output.push({ id: kind + ':' + id, el: th });
    });
    return output;
  }

  function labelInfo(el, carrier) {
    if (!el || !carrier || el.hidden) return null;
    var effects = effectsModule();
    var content = effects.captureContent({ valueEl: el, carrier: carrier });
    if (!content || !content.visible) return null;
    return {
      el: el,
      carrier: carrier,
      text: el.textContent || '',
      content: content,
      className: el.classList && el.classList.contains('nviz-matrix__headmark')
        ? 'nviz-matrix__headmark nviz-matrix__headmark--ghost'
        : 'nviz-matrix__cellflag nviz-matrix__cellflag--ghost'
    };
  }

  function captureSnapshot(instance, view) {
    var effects = effectsModule();
    var cells = {};
    motionTargets(instance).forEach(function (target) {
      var cell = target.element;
      var flag = target.flagEl;
      var visible = !!(flag && !flag.hidden && (flag.textContent || '').trim() !== '');
      cells[String(target.id)] = {
        el: cell,
        valueEl: target.valueEl,
        flagEl: flag,
        flagVisible: visible,
        flagText: flag ? (flag.textContent || '') : '',
        flagLabel: visible ? labelInfo(flag, cell) : null
      };
    });
    var headers = {};
    headerTargets(instance).forEach(function (target) {
      var mark = target.el.querySelector ? target.el.querySelector('.nviz-matrix__headmark') : null;
      var visible = !!(mark && !mark.hidden && (mark.textContent || '').trim() !== '');
      headers[target.id] = {
        el: target.el,
        markEl: mark,
        markVisible: visible,
        markText: mark ? (mark.textContent || '') : '',
        markLabel: visible ? labelInfo(mark, target.el) : null
      };
    });
    var values = {};
    var data = isObject(view && view.model) ? view.model : {};
    var rows = Array.isArray(data.rows) ? data.rows : [];
    var columns = Array.isArray(data.columns) ? data.columns : [];
    rows.forEach(function (row, rowIndex) {
      columns.forEach(function (column, colIndex) {
        var list = Array.isArray(data.values) ? data.values[rowIndex] : null;
        var value = Array.isArray(list) ? list[colIndex] : '';
        values[row.id + String.fromCharCode(0) + column.id] = value == null ? '' : String(value);
      });
    });
    return { cells: cells, headers: headers, values: values,
      cellStyles: effects.captureStyles(motionTargets(instance).map(function (target) {
        return { id: String(target.id), el: target.element };
      }), CUE_PROPS),
      headerStyles: effects.captureStyles(headerTargets(instance), CUE_PROPS) };
  }

  function captureTargetSnapshot(instance) {
    var effects = effectsModule();
    var cells = {};
    motionTargets(instance).forEach(function (target) {
      var cell = target.element;
      var flag = target.flagEl;
      var visible = !!(flag && !flag.hidden && (flag.textContent || '').trim() !== '');
      cells[String(target.id)] = {
        el: cell,
        valueEl: target.valueEl,
        flagEl: flag,
        flagVisible: visible,
        flagText: flag ? (flag.textContent || '') : '',
        flagLabel: visible ? labelInfo(flag, cell) : null
      };
    });
    var headers = {};
    headerTargets(instance).forEach(function (target) {
      var mark = target.el.querySelector ? target.el.querySelector('.nviz-matrix__headmark') : null;
      var visible = !!(mark && !mark.hidden && (mark.textContent || '').trim() !== '');
      headers[target.id] = {
        el: target.el,
        markEl: mark,
        markVisible: visible,
        markText: mark ? (mark.textContent || '') : '',
        markLabel: visible ? labelInfo(mark, target.el) : null
      };
    });
    return {
      cells: cells,
      headers: headers,
      cellStyles: effects.captureStyles(motionTargets(instance).map(function (target) {
        return { id: String(target.id), el: target.element };
      }), CUE_PROPS),
      headerStyles: effects.captureStyles(headerTargets(instance), CUE_PROPS)
    };
  }

  function addLabelEffects(specs, sourceLabels, targetLabels, timing, effectName, cleanups) {
    Object.keys(targetLabels).forEach(function (key) {
      var target = targetLabels[key];
      var source = sourceLabels[key];
      if (target && target.flagVisible && (!source || !source.flagVisible || source.flagText !== target.flagText)) {
        specs.push({
          el: target.flagEl,
          keyframes: [
            { opacity: '0', transform: 'translateY(-3px)' },
            { opacity: '1', transform: 'none' }
          ],
          options: { duration: timing.enterDuration, easing: timing.easing, fill: 'backwards' },
          gate: 'finish',
          effect: effectName + ':enter'
        });
      }
      if (source && source.flagVisible && source.flagLabel &&
          (!target || !target.flagVisible || source.flagText !== target.flagText)) {
        var carrier = target && target.el ? target.el : source.flagLabel.carrier;
        if (!carrier) return;
        var ghost = effectsModule().createGhost({
          source: source.flagLabel.content,
          target: { carrier: carrier, valueEl: source.flagEl },
          className: source.flagLabel.className,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center'
        });
        if (!ghost) return;
        cleanups.push(ghost.cleanup);
        specs.push({
          el: ghost.el,
          keyframes: [
            { opacity: '1', transform: 'translateY(0)' },
            { opacity: '0', transform: 'translateY(-4px)' }
          ],
          options: { duration: timing.enterDuration, easing: timing.easing, fill: 'backwards' },
          cleanupEl: ghost.el,
          gate: 'finish',
          effect: effectName + ':exit'
        });
      }
    });
  }

  function headerLabelMap(snapshot) {
    var output = {};
    Object.keys(snapshot.headers || {}).forEach(function (key) {
      var item = snapshot.headers[key];
      output[key] = {
        flagVisible: !!item.markVisible,
        flagText: item.markText || '',
        flagEl: item.markEl,
        flagLabel: item.markLabel,
        el: item.el
      };
    });
    return output;
  }

  function cellLabelMap(snapshot) {
    var output = {};
    Object.keys(snapshot.cells || {}).forEach(function (key) {
      var item = snapshot.cells[key];
      output[key] = {
        flagVisible: !!item.flagVisible,
        flagText: item.flagText || '',
        flagEl: item.flagEl,
        flagLabel: item.flagLabel,
        el: item.el
      };
    });
    return output;
  }

  function makePreparedChange(instance, context) {
    var sourceView = isObject(context.sourceView) ? context.sourceView : null;
    var targetView = isObject(context.targetView) ? context.targetView : null;
    if (!sourceView || !isObject(sourceView.model)) fail('matrix prepareChange 需要 sourceView.model');
    if (!targetView || !isObject(targetView.model)) fail('matrix prepareChange 需要 targetView.model');
    var effects = effectsModule();
    var sourceSnapshot = captureSnapshot(instance, sourceView);
    var sourceValues = sourceSnapshot.values;
    var targetData = targetView.model;
    var targetValues = {};
    var rows = Array.isArray(targetData.rows) ? targetData.rows : [];
    var columns = Array.isArray(targetData.columns) ? targetData.columns : [];
    rows.forEach(function (row, rowIndex) {
      columns.forEach(function (column, colIndex) {
        var list = Array.isArray(targetData.values) ? targetData.values[rowIndex] : null;
        var value = Array.isArray(list) ? list[colIndex] : '';
        targetValues[row.id + String.fromCharCode(0) + column.id] = value == null ? '' : String(value);
      });
    });
    var changedKeys = Object.keys(targetValues).filter(function (key) {
      return sourceValues[key] !== targetValues[key];
    });
    /* 值内容必须在 commit 前冻结局部坐标；commit 后只把副本放到目标单元内。 */
    var sourceContents = {};
    changedKeys.forEach(function (key) {
      var cell = sourceSnapshot.cells[key];
      if (!cell) return;
      sourceContents[key] = effects.captureContent({ valueEl: cell.valueEl, carrier: cell.el });
    });
    var sourceCellLabels = cellLabelMap(sourceSnapshot);
    var sourceHeaderLabels = headerLabelMap(sourceSnapshot);
    var committed = false;
    var effectsCache = null;
    var ghostCleanups = [];
    var facts = {
      valueChanged: changedKeys.length,
      cueChanged: JSON.stringify(sourceView.cues || {}) !== JSON.stringify(targetView.cues || {})
    };
    function cleanup() {
      try { instance.setSceneActive(false); } catch (error) { /* ignore */ }
      for (var i = 0; i < ghostCleanups.length; i += 1) {
        try { ghostCleanups[i](); } catch (error) { /* ignore */ }
      }
      ghostCleanups = [];
      if (effectsCache && effectsCache.cleanup) {
        try { effectsCache.cleanup(); } catch (error) { /* ignore */ }
      }
      effectsCache = null;
    }
    return {
      commit: function () {
        if (committed) return;
        committed = true;
        try { instance.setSceneActive(true); } catch (error) { /* ignore */ }
        instance.update(viewCuePatch(targetView));
      },
      targets: function () {
        return typeof instance.getMotionTargets === 'function' ? instance.getMotionTargets() : [];
      },
      effects: function (effectCtx) {
        var motion = isObject(effectCtx) && effectCtx.motion === 'never' ? 'never' : 'auto';
        var timing = isObject(effectCtx) && isObject(effectCtx.timing) ? effectCtx.timing : effects.mergeTiming();
        if (effectsCache) return effectsCache.specs;
        if (motion === 'never') {
          effectsCache = { specs: [], cleanup: function () {} };
          return [];
        }
        var targetSnapshot = captureTargetSnapshot(instance);
        var specs = [];
        try {
          /* 连续 cue 差分：只比较组件明确选择的连续属性，不扫描任意 CSS。 */
          specs = specs.concat(effects.planCueChanges({
            source: sourceSnapshot.cellStyles,
            targets: motionTargets(instance).map(function (target) { return { id: String(target.id), el: target.element }; }),
            timing: timing,
            properties: CUE_PROPS,
            duration: timing.cueDuration,
            gate: 'ready'
          }));
          specs = specs.concat(effects.planCueChanges({
            source: sourceSnapshot.headerStyles,
            targets: headerTargets(instance),
            timing: timing,
            properties: CUE_PROPS,
            duration: timing.cueDuration,
            gate: 'ready'
          }));
          if (targetSnapshot) {
            addLabelEffects(specs, sourceCellLabels, cellLabelMap(targetSnapshot), timing, 'matrix-label-cell', ghostCleanups);
            addLabelEffects(specs, sourceHeaderLabels, headerLabelMap(targetSnapshot), timing, 'matrix-label-header', ghostCleanups);
            changedKeys.forEach(function (key) {
              var target = targetSnapshot.cells[key];
              if (!target || !target.valueEl) return;
              var swap = effects.planValueSwap({
                source: sourceContents[key],
                target: { carrier: target.el, valueEl: target.valueEl },
                timing: timing,
                recipe: {
                  ghostClass: 'nviz-matrix__value nviz-matrix__value--ghost',
                  ghostKeyframes: [
                    { opacity: '1', transform: 'translateY(0)' },
                    { opacity: '1', transform: 'translateY(0)', offset: 0.5 },
                    { opacity: '0', transform: 'translateY(-8px)' }
                  ],
                  ghostDuration: timing.valueSwapDuration,
                  ghostDelay: timing.valueSwapDelay,
                  ghostEasing: 'linear',
                  targetKeyframes: [
                    { opacity: '0', transform: 'translateY(6px)' },
                    { opacity: '1', transform: 'none' }
                  ],
                  targetDuration: timing.valueSwapDuration,
                  targetDelay: timing.valueSwapDelay,
                  targetEasing: timing.easing,
                  targetGate: 'ready'
                }
              });
              if (swap.cleanup) ghostCleanups.push(swap.cleanup);
              specs = specs.concat(swap.specs);
            });
          }
          effectsCache = {
            specs: specs,
            cleanup: function () {
              for (var c = 0; c < ghostCleanups.length; c += 1) {
                try { ghostCleanups[c](); } catch (error) { /* ignore */ }
              }
              ghostCleanups = [];
            }
          };
          return specs;
        } catch (error) {
          cleanup();
          throw error;
        }
      },
      facts: function () { return facts; },
      cleanup: cleanup,
      readView: function () {
        return typeof instance.getState === 'function' ? canonicalFromState(instance.getState()) : null;
      }
    };
  }

  function createHandle(instance, container, owned) {
    var destroyed = false;
    return {
      restore: function (view) {
        if (destroyed) return;
        instance.update(viewCuePatch(view));
      },
      applyCues: function (cues) {
        if (destroyed) return;
        instance.update(applyCuesPatch(cues));
      },
      target: function (query) {
        if (destroyed) return null;
        return queryTarget(instance, query);
      },
      readView: function () {
        if (destroyed || typeof instance.getState !== 'function') return null;
        return canonicalFromState(instance.getState());
      },
      prepareChange: function (ctx) {
        if (destroyed) fail('已销毁的矩阵实例不能 prepareChange');
        return makePreparedChange(instance, isObject(ctx) ? ctx : {});
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        if (owned) instance.destroy();
        if (container && container.parentNode) container.parentNode.removeChild(container);
      }
    };
  }

  function mount(host, options) {
    var Matrix = requireMatrix();
    if (!host || host.nodeType !== 1) {
      throw new TypeError('matrix Adapter.mount(host, options)：host 必须是宿主任意元素。');
    }
    var container = global.document.createElement('div');
    container.className = 'note-demo-adapter note-demo-adapter--matrix';
    container.setAttribute('data-adapter', ADAPTER_NAME);
    host.appendChild(container);
    var instance;
    try {
      var mountOptions = isObject(options) ? Object.assign({}, options) : {};
      if (!Object.prototype.hasOwnProperty.call(mountOptions, 'stateText')) mountOptions.stateText = false;
      instance = Matrix.mount(container, mountOptions);
    } catch (error) {
      if (container.parentNode) container.parentNode.removeChild(container);
      throw error;
    }
    return createHandle(instance, container, true);
  }

  function adopt(instance) {
    if (!instance || typeof instance.update !== 'function' || typeof instance.getTarget !== 'function' ||
        typeof instance.getState !== 'function' || typeof instance.getMotionTargets !== 'function' ||
        typeof instance.setSceneActive !== 'function') {
      fail('adopt 需要一个 NoteViz.Matrix 实例（含 update/getTarget/getState/getMotionTargets/setSceneActive）。');
    }
    if (instance.destroyed) fail('adopt 的矩阵实例已销毁。');
    return createHandle(instance, null, false);
  }

  Internals.adapters = Internals.adapters || {};
  Internals.adapters[ADAPTER_NAME] = {
    name: ADAPTER_NAME,
    /* 固定行列身份下可做内容/cues 的 update；整表重排仍显式 cut。
     * layout/reveal 不声明，避免把更新伪装成布局动画。 */
    sceneModes: ['cut', 'update'],
    defaultSceneMode: 'update',
    sceneTimingDefaults: {
      enterDuration: 180,
      valueSwapDelay: 80,
      valueSwapDuration: 320
    },
    normalizeView: normalizeView,
    validateAction: validateAction,
    mount: mount,
    adopt: adopt
  };
})(window);
