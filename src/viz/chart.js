/* NoteViz.Chart — self-contained SVG bar / line / scatter / pie chart (V01).
   Single component, one classic script. Internal order by responsibility:
   helpers -> host-data normalization -> model -> scales -> SVG primitives ->
   bar/line/scatter/pie renderers -> legend/data table -> public mount.
   Scope: NoteViz.Chart only. Load after core. No external chart library.
   CSS: src/viz/chart.css. Data is host supplied; no network, no eval, no unsafe HTML injection. */
(function (global) {
  'use strict';

  var NoteViz = global.NoteViz = global.NoteViz || {};
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var VERSION = '1.0.0';
  // Validated on the white chart surface with the dataviz palette checker:
  // adjacent CVD dE 10.0, normal-vision dE 21.6, all slots >= 3:1 contrast.
  // Secondary encoding (marker shapes, line dashes, bar textures, legend) still applies.
  var DEFAULT_COLORS = [
    '#2a78d6', '#b54708', '#0f7a5a', '#c07c00',
    '#b03a72', '#008300', '#6250d6', '#b23a45'
  ];
  var TYPE_NAMES = { bar: '柱状图', line: '折线图', scatter: '散点图', pie: '饼图' };
  var MARKER_SHAPES = ['circle', 'square', 'triangle', 'diamond'];
  var LINE_DASHES = ['', '7 4', '2 4', '9 3 2 3'];
  var BAR_PATTERNS = ['', 'diag', 'dots', 'horiz', 'cross'];
  var hasOwn = Object.prototype.hasOwnProperty;

  /* ---------- 通用小工具：属性、文本、数值与 SVG ---------- */

  function own(object, key) {
    return object != null && hasOwn.call(Object(object), key);
  }

  function text(value) {
    return value == null ? '' : String(value);
  }

  function toNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    var number = typeof value === 'number' ? value : Number(value);
    return isFinite(number) ? number : null;
  }

  function finiteNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function clampNumber(value, fallback, min, max) {
    var number = Number(value);
    if (!isFinite(number)) number = fallback;
    return Math.min(Math.max(number, min), max);
  }

  function safeType(value) {
    return own(TYPE_NAMES, String(value)) ? String(value) : 'bar';
  }

  function svgEl(tag, attributes, className) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attributes) {
      for (var key in attributes) {
        if (!own(attributes, key)) continue;
        var value = attributes[key];
        if (value !== null && value !== undefined) node.setAttribute(key, String(value));
      }
    }
    if (className) node.setAttribute('class', className);
    return node;
  }

  function appendTitle(node, value) {
    var label = text(value);
    if (!label) return node;
    var title = svgEl('title');
    title.textContent = label;
    node.appendChild(title);
    return node;
  }

  function readColor(value) {
    return value == null ? '' : text(value).trim();
  }

  function normalizeColors(input) {
    var colors = [];
    if (Array.isArray(input)) {
      for (var i = 0; i < input.length; i += 1) {
        var color = readColor(input[i]);
        if (color) colors.push(color);
      }
    }
    return colors.length ? colors : DEFAULT_COLORS.slice();
  }

  /* ---------- 宿主数据规范化 ---------- */

  function normalizeData(input, labels) {
    var items = [];
    if (!Array.isArray(input)) return items;
    for (var i = 0; i < input.length; i += 1) {
      var raw = input[i];
      var item = { label: '', value: null, color: '' };
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        item.label = raw.label == null ? '' : text(raw.label);
        item.value = toNumber(own(raw, 'value') ? raw.value : raw.y);
        item.color = readColor(raw.color);
      } else {
        item.value = toNumber(raw);
      }
      if (!item.label && labels && labels[i] != null) item.label = text(labels[i]);
      items.push(item);
    }
    return items;
  }

  function normalizeSeries(input, colors) {
    var result = [];
    if (!Array.isArray(input)) return result;
    var used = Object.create(null);
    for (var i = 0; i < input.length; i += 1) {
      var raw = input[i] && typeof input[i] === 'object' ? input[i] : {};
      var baseKey = raw.key != null && text(raw.key).trim() !== '' ? text(raw.key).trim() : 'series-' + (i + 1);
      var key = baseKey;
      var suffix = 2;
      while (used[key]) {
        key = baseKey + '-' + suffix;
        suffix += 1;
      }
      used[key] = true;
      var values = [];
      if (Array.isArray(raw.values)) {
        for (var v = 0; v < raw.values.length; v += 1) values.push(toNumber(raw.values[v]));
      }
      var points = [];
      if (Array.isArray(raw.points)) {
        for (var p = 0; p < raw.points.length; p += 1) {
          var point = raw.points[p];
          if (!point || typeof point !== 'object') continue;
          var x = toNumber(point.x);
          var y = toNumber(point.y);
          if (x === null || y === null) continue;
          points.push({
            x: x,
            y: y,
            label: point.label == null ? '' : text(point.label),
            index: points.length
          });
        }
      }
      result.push({
        key: key,
        label: raw.label != null && text(raw.label).trim() !== '' ? text(raw.label) : key,
        color: readColor(raw.color) || colors[i % colors.length],
        values: values,
        points: points,
        raw: raw,
        index: i,
        patternId: ''
      });
    }
    return result;
  }

  function findSeries(model, key) {
    for (var i = 0; i < model.series.length; i += 1) {
      if (model.series[i].key === key || model.series[i].label === key) return model.series[i];
    }
    return null;
  }

  function pointAt(series, index) {
    if (!series) return null;
    for (var i = 0; i < series.points.length; i += 1) {
      if (series.points[i].index === index) return series.points[i];
    }
    return null;
  }

  function anyPointAt(model, index) {
    for (var i = 0; i < model.series.length; i += 1) {
      if (pointAt(model.series[i], index)) return true;
    }
    return false;
  }

  function categoryIndex(model, label) {
    for (var i = 0; i < model.categories.length; i += 1) {
      if (model.categories[i] === label) return i;
    }
    return -1;
  }

  function resolveEmphasis(raw, model, isChanged) {
    var result = { seriesKey: null, index: null, label: '', categoryLabel: '', pointLabel: '' };
    if (!raw || typeof raw !== 'object') return result;

    var requestedSeries = raw.series != null && text(raw.series).trim() !== '';
    if (requestedSeries) {
      var foundSeries = findSeries(model, text(raw.series).trim());
      if (!foundSeries) return result;
      result.seriesKey = foundSeries.key;
    }

    var index = null;
    if (raw.index !== null && raw.index !== undefined && raw.index !== '') {
      index = Number(raw.index);
      if (!isFinite(index)) index = null;
      else index = Math.floor(index);
      if (index !== null && index < 0) index = null;
    }
    var label = raw.label == null ? '' : text(raw.label);
    if (!isChanged && !label && raw.category != null) label = text(raw.category);
    if (!isChanged && !label && raw.point != null) label = text(raw.point);

    if (model.type === 'scatter') {
      if (label) {
        var match = null;
        if (result.seriesKey) {
          var targetSeries = findSeries(model, result.seriesKey);
          for (var s = 0; targetSeries && s < targetSeries.points.length; s += 1) {
            if (targetSeries.points[s].label === label) {
              match = { seriesKey: targetSeries.key, index: targetSeries.points[s].index };
              break;
            }
          }
        } else {
          for (var i = 0; i < model.series.length && !match; i += 1) {
            var series = model.series[i];
            for (var j = 0; j < series.points.length; j += 1) {
              if (series.points[j].label === label) {
                match = { seriesKey: series.key, index: series.points[j].index };
                break;
              }
            }
          }
        }
        if (match) {
          result.seriesKey = match.seriesKey;
          result.index = match.index;
          result.label = label;
          result.pointLabel = label;
        } else if (!requestedSeries) {
          var byLabel = findSeries(model, label);
          if (byLabel) result.seriesKey = byLabel.key;
        }
      }
      if (index !== null) {
        if (result.seriesKey) {
          var seriesForIndex = findSeries(model, result.seriesKey);
          if (pointAt(seriesForIndex, index)) result.index = index;
        } else if (anyPointAt(model, index)) {
          result.index = index;
        }
      }
      if (result.index !== null && result.seriesKey) {
        var point = pointAt(findSeries(model, result.seriesKey), result.index);
        if (point) result.pointLabel = point.label;
      }
      return result;
    }

    if (label) {
      var foundIndex = categoryIndex(model, label);
      if (foundIndex >= 0) {
        result.index = foundIndex;
        result.label = label;
        result.categoryLabel = model.categories[foundIndex];
      }
    }
    if (index !== null && index < model.categories.length) {
      result.index = index;
      result.categoryLabel = model.categories[index];
    }
    return result;
  }

  function emphasisKind(emphasis, model) {
    if (!emphasis) return 'none';
    if (emphasis.index !== null && emphasis.seriesKey) return 'point';
    if (emphasis.index !== null) return 'category';
    if (emphasis.seriesKey) return model.type === 'pie' ? 'none' : 'series';
    return 'none';
  }

  function markState(model, seriesKey, index) {
    var focus = false;
    var changed = false;
    var f = model.focus;
    var c = model.changed;
    if (model.focusKind === 'point') focus = f.seriesKey === seriesKey && f.index === index;
    else if (model.focusKind === 'series') focus = f.seriesKey === seriesKey;
    else if (model.focusKind === 'category') focus = f.index === index;
    if (model.changedKind === 'point') changed = c.seriesKey === seriesKey && c.index === index;
    else if (model.changedKind === 'series') changed = c.seriesKey === seriesKey;
    else if (model.changedKind === 'category') changed = c.index === index;
    return { focus: focus, changed: changed };
  }

  function seriesState(model, seriesKey) {
    return {
      focus: model.focusKind === 'series' && model.focus.seriesKey === seriesKey,
      changed: model.changedKind === 'series' && model.changed.seriesKey === seriesKey
    };
  }

  function stateClass(state, base) {
    var className = base || '';
    if (state.focus) className += ' is-focus';
    if (state.changed) className += ' is-changed';
    return className.replace(/^\s+/, '');
  }

  function pointHasTag(model, seriesKey, index) {
    if (model.focusKind === 'point' && model.focus.seriesKey === seriesKey && model.focus.index === index) return true;
    if (model.changedKind === 'point' && model.changed.seriesKey === seriesKey && model.changed.index === index) return true;
    return false;
  }

  function categoryBands(model) {
    var map = Object.create(null);
    if (model.type === 'scatter') return [];
    if (model.focusKind === 'category') {
      map[model.focus.index] = { index: model.focus.index, focus: true, changed: false };
    }
    if (model.changedKind === 'category') {
      var entry = map[model.changed.index];
      if (entry) entry.changed = true;
      else map[model.changed.index] = { index: model.changed.index, focus: false, changed: true };
    }
    var list = [];
    for (var key in map) {
      if (own(map, key)) list.push(map[key]);
    }
    list.sort(function (a, b) { return a.index - b.index; });
    return list;
  }

  function bandLabel(model, band) {
    var status = band.focus && band.changed ? '关注·变化' : band.focus ? '关注' : '变化';
    var label = model.categories[band.index] || ('第 ' + (band.index + 1) + ' 项');
    return status + ' · ' + label;
  }

  function emphasisText(model, emphasis, kind) {
    if (kind === 'none') return '';
    var series = emphasis.seriesKey ? findSeries(model, emphasis.seriesKey) : null;
    var parts = [];
    if (series && model.type !== 'pie') parts.push('系列 ' + series.label);
    if (model.type === 'scatter') {
      if (emphasis.index !== null) {
        var point = series ? pointAt(series, emphasis.index) : null;
        if (point && point.label) parts.push('点 ' + point.label);
        else parts.push('第 ' + (emphasis.index + 1) + ' 个点');
      }
    } else if (emphasis.index !== null) {
      var category = model.categories[emphasis.index];
      if (category) parts.push(category);
    }
    return parts.join(' 的 ');
  }

  function buildAria(model, state) {
    var parts = [];
    var title = text(state.label).trim();
    var unit = text(state.unit).trim();
    parts.push(TYPE_NAMES[model.type] || '图表');
    if (title) parts.push(title);
    if (unit) parts.push('单位 ' + unit);
    if (model.empty) {
      parts.push('暂无数据');
      if (model.emptyReason) parts.push(model.emptyReason);
    } else if (model.type === 'scatter') {
      parts.push(model.series.length + ' 个系列，' + model.pointCount + ' 个点');
      parts.push('x 范围 ' + defaultNumber(model.xMin) + ' 至 ' + defaultNumber(model.xMax));
      parts.push('y 范围 ' + defaultNumber(model.yMin) + ' 至 ' + defaultNumber(model.yMax));
    } else if (model.type === 'pie') {
      parts.push(model.categories.length + ' 个类别，' + model.piePositiveCount + ' 个可绘制扇区');
      parts.push('总量 ' + defaultNumber(model.pieTotal));
    } else {
      parts.push(model.series.length + ' 个系列，' + model.categories.length + ' 个类别');
      parts.push('数值范围 ' + defaultNumber(model.valueMin) + ' 至 ' + defaultNumber(model.valueMax));
    }
    if (model.type !== 'pie' && model.series.length === 1 && model.series[0].label) {
      parts.push('系列 ' + model.series[0].label);
    }
    if (!model.empty) {
      var focusText = emphasisText(model, model.focus, model.focusKind);
      var changedText = emphasisText(model, model.changed, model.changedKind);
      if (focusText) parts.push('当前关注：' + focusText);
      if (changedText) parts.push('本步变化：' + changedText);
    }
    if (state.table && hasTableData(model)) parts.push('下方数据表可展开读取全部数值');
    return parts.join('；') + '。';
  }

  /* ---------- 图表模型：类型、系列、类别、强调与 aria ---------- */

  function buildModel(state) {
    var type = safeType(state.type);
    var colors = normalizeColors(state.colors);
    var labelsInput = Array.isArray(state.labels) ? state.labels : null;
    var dataItems = normalizeData(state.data, labelsInput);
    var rawSeries = Array.isArray(state.series) ? state.series : [];
    var series = [];
    var categories = [];
    var sliceColors = [];
    var notes = [];
    var model = {
      type: type,
      colors: colors,
      series: series,
      categories: categories,
      sliceColors: sliceColors,
      notes: notes,
      empty: false,
      emptyReason: '',
      focus: null,
      changed: null,
      focusKind: 'none',
      changedKind: 'none',
      valueMin: 0,
      valueMax: 0,
      pieTotal: 0,
      piePositiveCount: 0,
      pointCount: 0,
      xMin: 0,
      xMax: 0,
      yMin: 0,
      yMax: 0,
      aria: ''
    };

    if (type === 'scatter') {
      if (rawSeries.length) {
        series = normalizeSeries(rawSeries, colors);
        for (var si = 0; si < series.length; si += 1) {
          var raw = series[si].raw || {};
          var sourceLabels = Array.isArray(raw.labels) ? raw.labels : labelsInput;
          if (!series[si].points.length && series[si].values.length) {
            for (var vi = 0; vi < series[si].values.length; vi += 1) {
              if (series[si].values[vi] === null) continue;
              series[si].points.push({
                x: vi + 1,
                y: series[si].values[vi],
                label: sourceLabels && sourceLabels[vi] != null ? text(sourceLabels[vi]) : '',
                index: series[si].points.length
              });
            }
          }
        }
      } else if (dataItems.length) {
        var fallbackPoints = [];
        for (var di = 0; di < dataItems.length; di += 1) {
          if (dataItems[di].value === null) continue;
          fallbackPoints.push({
            x: di + 1,
            y: dataItems[di].value,
            label: dataItems[di].label,
            index: fallbackPoints.length
          });
        }
        series = [{
          key: 'main',
          label: '数据',
          color: colors[0],
          values: [],
          points: fallbackPoints,
          raw: {},
          index: 0,
          patternId: ''
        }];
      }
      model.series = series;
      var xMin = Infinity;
      var xMax = -Infinity;
      var yMin = Infinity;
      var yMax = -Infinity;
      var pointCount = 0;
      for (var a = 0; a < series.length; a += 1) {
        for (var b = 0; b < series[a].points.length; b += 1) {
          var point = series[a].points[b];
          pointCount += 1;
          if (point.x < xMin) xMin = point.x;
          if (point.x > xMax) xMax = point.x;
          if (point.y < yMin) yMin = point.y;
          if (point.y > yMax) yMax = point.y;
        }
      }
      model.pointCount = pointCount;
      model.xMin = pointCount ? xMin : 0;
      model.xMax = pointCount ? xMax : 0;
      model.yMin = pointCount ? yMin : 0;
      model.yMax = pointCount ? yMax : 0;
      model.empty = pointCount === 0;
      model.emptyReason = '请提供 series[].points（x、y 为数值）或数值型 data。';
    } else if (type === 'pie') {
      var pieSeries = null;
      if (dataItems.length) {
        var count = Math.max(dataItems.length, labelsInput ? labelsInput.length : 0);
        for (var pi = 0; pi < count; pi += 1) {
          var item = dataItems[pi] || { label: '', value: null, color: '' };
          categories.push(item.label || (labelsInput && labelsInput[pi] != null ? text(labelsInput[pi]) : '') || ('类别 ' + (pi + 1)));
          var value = item.value;
          if (pi >= dataItems.length) value = null;
          if (!pieSeries) pieSeries = { key: 'main', label: '数值', color: colors[0], values: [], points: [], raw: {}, index: 0, patternId: '' };
          pieSeries.values.push(value);
          sliceColors.push(item.color || colors[pi % colors.length]);
        }
      } else if (rawSeries.length) {
        var normalized = normalizeSeries(rawSeries.slice(0, 1), colors);
        var first = normalized[0];
        pieSeries = first;
        var pieCount = Math.max(first.values.length, labelsInput ? labelsInput.length : 0);
        for (var qi = 0; qi < pieCount; qi += 1) {
          categories.push(labelsInput && labelsInput[qi] != null ? text(labelsInput[qi]) : ('类别 ' + (qi + 1)));
          pieSeries.values[qi] = qi < first.values.length ? first.values[qi] : null;
          sliceColors.push(colors[qi % colors.length]);
        }
      }
      if (!pieSeries) {
        pieSeries = { key: 'main', label: '数值', color: colors[0], values: [], points: [], raw: {}, index: 0, patternId: '' };
      }
      series = [pieSeries];
      model.series = series;
      model.categories = categories;
      var total = 0;
      var positiveCount = 0;
      var hasNonPositive = false;
      for (var pv = 0; pv < pieSeries.values.length; pv += 1) {
        var pvalue = pieSeries.values[pv];
        if (pvalue === null) continue;
        if (pvalue > 0) {
          total += pvalue;
          positiveCount += 1;
        } else {
          hasNonPositive = true;
        }
      }
      model.pieTotal = total;
      model.piePositiveCount = positiveCount;
      model.empty = positiveCount === 0 || total <= 0;
      model.emptyReason = categories.length
        ? '饼图需要至少一个大于 0 的数值。'
        : '请提供 data 或 series[].values。';
      if (hasNonPositive) notes.push('饼图仅用正值计算角度；0 或负值不显示扇区，数据表仍保留原值。');
    } else {
      var sourceLabels = labelsInput && labelsInput.length ? labelsInput : null;
      if (rawSeries.length) {
        series = normalizeSeries(rawSeries, colors);
        if (!sourceLabels) {
          for (var rs = 0; rs < series.length; rs += 1) {
            if (Array.isArray(series[rs].raw.labels) && series[rs].raw.labels.length) {
              sourceLabels = series[rs].raw.labels;
              break;
            }
          }
        }
        var maxLength = sourceLabels ? sourceLabels.length : 0;
        for (var ml = 0; ml < series.length; ml += 1) {
          if (series[ml].values.length > maxLength) maxLength = series[ml].values.length;
        }
        var categoryCount = maxLength;
        for (var ci = 0; ci < categoryCount; ci += 1) categories.push(
          sourceLabels && sourceLabels[ci] != null && text(sourceLabels[ci]) !== ''
            ? text(sourceLabels[ci])
            : ('类别 ' + (ci + 1))
        );
        for (var pad = 0; pad < series.length; pad += 1) {
          while (series[pad].values.length < categoryCount) series[pad].values.push(null);
        }
      } else if (dataItems.length) {
        var dataCount = Math.max(dataItems.length, labelsInput ? labelsInput.length : 0);
        var values = [];
        for (var dci = 0; dci < dataCount; dci += 1) {
          var dataItem = dataItems[dci] || { label: '', value: null };
          var categoryLabel = dataItem.label ||
            (labelsInput && labelsInput[dci] != null ? text(labelsInput[dci]) : '') ||
            ('类别 ' + (dci + 1));
          categories.push(categoryLabel);
          values.push(dci < dataItems.length ? dataItem.value : null);
        }
        series = [{
          key: 'main',
          label: '数值',
          color: colors[0],
          values: values,
          points: [],
          raw: {},
          index: 0,
          patternId: ''
        }];
      }
      model.series = series;
      model.categories = categories;
      var minValue = Infinity;
      var maxValue = -Infinity;
      var numericCount = 0;
      for (var sm = 0; sm < series.length; sm += 1) {
        for (var vm = 0; vm < series[sm].values.length; vm += 1) {
          var numeric = series[sm].values[vm];
          if (!finiteNumber(numeric)) continue;
          numericCount += 1;
          if (numeric < minValue) minValue = numeric;
          if (numeric > maxValue) maxValue = numeric;
        }
      }
      model.valueMin = numericCount ? minValue : 0;
      model.valueMax = numericCount ? maxValue : 0;
      model.empty = series.length === 0 || categories.length === 0 || numericCount === 0;
      model.emptyReason = '请提供数值型 data 或 series[].values。';
    }

    model.focus = resolveEmphasis(state.focus, model, false);
    model.changed = resolveEmphasis(state.changed, model, true);
    model.focusKind = emphasisKind(model.focus, model);
    model.changedKind = emphasisKind(model.changed, model);
    model.aria = buildAria(model, state);
    return model;
  }

  function hasTableData(model) {
    if (model.type === 'scatter') {
      for (var i = 0; i < model.series.length; i += 1) {
        if (model.series[i].points.length) return true;
      }
      return false;
    }
    return model.categories.length > 0 && model.series.length > 0;
  }

  function defaultNumber(value) {
    var number = Number(value);
    if (!isFinite(number)) return '—';
    if (Math.abs(number) < 1e-12) number = 0;
    var absolute = Math.abs(number);
    if (absolute >= 1000000000) return number.toExponential(2).replace(/\.?0+(?=e)/, '');
    if (absolute >= 10000000) return String(Number(number.toPrecision(6)));
    var rounded = Math.round(number * 10000) / 10000;
    return String(rounded);
  }

  function formatValue(state, value, meta) {
    var number = Number(value);
    if (!isFinite(number)) return '—';
    if (typeof state.valueFormat === 'function') {
      try {
        var output = state.valueFormat(number, meta || {});
        if (output !== null && output !== undefined) return text(output);
        return '';
      } catch (error) {
        return defaultNumber(number);
      }
    }
    return defaultNumber(number);
  }

  function formatPercent(ratio) {
    if (!finiteNumber(ratio)) return '—';
    var percent = ratio * 100;
    if (percent > 0 && percent < 0.1) return '<0.1%';
    var digits = percent >= 10 ? 0 : 1;
    var factor = Math.pow(10, digits);
    return String(Math.round(percent * factor) / factor) + '%';
  }

  function charWidth(character) {
    var code = character.charCodeAt(0);
    if (character === ' ') return 0.3;
    if (code >= 0x2e80) return 1;
    if (character >= 'A' && character <= 'Z') return 0.64;
    if (character >= 'a' && character <= 'z') return 0.56;
    if (character >= '0' && character <= '9') return 0.58;
    if (character === '.' || character === ',') return 0.3;
    return 0.48;
  }

  function textWidth(value, fontSize) {
    var source = text(value);
    var width = 0;
    for (var i = 0; i < source.length; i += 1) width += charWidth(source.charAt(i)) * fontSize;
    return width;
  }

  function ellipsize(value, maxWidth, fontSize) {
    var source = text(value).replace(/\s+/g, ' ').trim();
    if (!source || textWidth(source, fontSize) <= maxWidth) return source;
    var output = '';
    for (var i = 0; i < source.length; i += 1) {
      if (textWidth(output + source.charAt(i) + '…', fontSize) > maxWidth) break;
      output += source.charAt(i);
    }
    return (output || source.charAt(0)) + '…';
  }

  function wrapText(value, maxWidth, fontSize, maxLines) {
    var source = text(value).replace(/\s+/g, ' ').trim();
    if (!source) return [''];
    var lines = [];
    var line = '';
    for (var i = 0; i < source.length; i += 1) {
      var character = source.charAt(i);
      if (line && textWidth(line + character, fontSize) > maxWidth) {
        var breakAt = line.lastIndexOf(' ');
        if (breakAt > 0) {
          lines.push(line.slice(0, breakAt).replace(/\s+$/, ''));
          line = line.slice(breakAt + 1);
          if (character !== ' ') line += character;
        } else {
          lines.push(line.replace(/\s+$/, ''));
          line = character === ' ' ? '' : character;
        }
        if (lines.length >= maxLines) break;
      } else {
        line += character;
      }
    }
    if (lines.length < maxLines && line.trim()) lines.push(line.replace(/\s+$/, ''));
    if (!lines.length) lines.push(source.charAt(0));
    var consumed = lines.join('').replace(/\s+/g, '').length;
    var full = source.replace(/\s+/g, '').length;
    if (consumed < full) {
      var lastIndex = lines.length - 1;
      var last = lines[lastIndex];
      while (last.length > 1 && textWidth(last + '…', fontSize) > maxWidth) {
        last = last.slice(0, -1);
      }
      lines[lastIndex] = last + '…';
    }
    return lines;
  }

  function xLabelMaxLines(slot) {
    return slot >= 44 ? 3 : 2;
  }

  /* ---------- 比例尺与值域 ---------- */

  function niceStep(raw) {
    if (!isFinite(raw) || raw <= 0) return 1;
    var exponent = Math.floor(Math.log(raw) / Math.LN10);
    var base = Math.pow(10, exponent);
    var fraction = raw / base;
    var nice;
    if (fraction <= 1) nice = 1;
    else if (fraction <= 2) nice = 2;
    else if (fraction <= 2.5) nice = 2.5;
    else if (fraction <= 5) nice = 5;
    else nice = 10;
    return nice * base;
  }

  function cleanFloat(value, step) {
    var decimals = 0;
    var probe = Math.abs(step);
    while (decimals < 10 && Math.abs(probe - Math.round(probe)) > 1e-9) {
      probe *= 10;
      decimals += 1;
    }
    return Number(Number(value).toFixed(Math.min(10, decimals)));
  }

  function niceScale(min, max, target, includeZero) {
    if (!isFinite(min) || !isFinite(max)) {
      min = 0;
      max = 1;
    }
    if (min === max) {
      if (min === 0) {
        min = 0;
        max = 1;
      } else {
        var pad = Math.abs(min) * 0.15 || 1;
        min -= pad;
        max += pad;
      }
    }
    if (includeZero) {
      min = Math.min(min, 0);
      max = Math.max(max, 0);
    }
    var span = max - min;
    var step = niceStep(span / Math.max(2, target - 1));
    var start = Math.floor(min / step) * step;
    var end = Math.ceil(max / step) * step;
    if (includeZero) {
      start = Math.min(start, 0);
      end = Math.max(end, 0);
    }
    if (start === end) end = start + step;
    var ticks = [];
    var guard = 0;
    for (var value = start; value <= end + step * 1e-7 && guard < 40; value += step) {
      ticks.push(cleanFloat(value, step));
      guard += 1;
    }
    if (!ticks.length) ticks.push(start);
    return { min: cleanFloat(start, step), max: cleanFloat(end, step), step: step, ticks: ticks };
  }

  function computeValueDomain(values, includeZero, target) {
    var min = Infinity;
    var max = -Infinity;
    var count = 0;
    for (var i = 0; i < values.length; i += 1) {
      if (!finiteNumber(values[i])) continue;
      count += 1;
      if (values[i] < min) min = values[i];
      if (values[i] > max) max = values[i];
    }
    if (!count) {
      min = 0;
      max = 1;
    } else {
      if (includeZero) {
        min = Math.min(min, 0);
        max = Math.max(max, 0);
      }
      if (min !== max) {
        var pad = (max - min) * 0.06;
        if (includeZero) {
          if (min < 0) min -= pad;
          if (max > 0) max += pad;
        } else {
          min -= pad;
          max += pad;
        }
      }
      if (includeZero) {
        min = Math.min(min, 0);
        max = Math.max(max, 0);
      }
    }
    return niceScale(min, max, target || 5, includeZero);
  }

  function allSeriesValues(series) {
    var values = [];
    for (var i = 0; i < series.length; i += 1) {
      for (var j = 0; j < series[i].values.length; j += 1) values.push(series[i].values[j]);
    }
    return values;
  }

  function markerName(index) {
    return MARKER_SHAPES[index % MARKER_SHAPES.length];
  }

  function dashFor(index) {
    return LINE_DASHES[index % LINE_DASHES.length];
  }

  function patternName(index) {
    return BAR_PATTERNS[index % BAR_PATTERNS.length];
  }

  /* ---------- SVG 图形基元、就地标签与轴标签 ---------- */

  function markerShape(name, cx, cy, radius, color) {
    if (name === 'square') {
      return svgEl('rect', {
        x: cx - radius,
        y: cy - radius,
        width: radius * 2,
        height: radius * 2,
        rx: Math.max(1, radius * 0.22),
        fill: color,
        class: 'nviz-chart__marker-shape'
      });
    }
    if (name === 'triangle') {
      return svgEl('path', {
        d: 'M ' + cx + ' ' + (cy - radius * 1.08) +
          ' L ' + (cx + radius * 1.05) + ' ' + (cy + radius * 0.82) +
          ' L ' + (cx - radius * 1.05) + ' ' + (cy + radius * 0.82) + ' Z',
        fill: color,
        class: 'nviz-chart__marker-shape'
      });
    }
    if (name === 'diamond') {
      return svgEl('path', {
        d: 'M ' + cx + ' ' + (cy - radius * 1.05) +
          ' L ' + (cx + radius * 1.05) + ' ' + cy +
          ' L ' + cx + ' ' + (cy + radius * 1.05) +
          ' L ' + (cx - radius * 1.05) + ' ' + cy + ' Z',
        fill: color,
        class: 'nviz-chart__marker-shape'
      });
    }
    return svgEl('circle', {
      cx: cx,
      cy: cy,
      r: radius,
      fill: color,
      class: 'nviz-chart__marker-shape'
    });
  }

  function makeTag(label, x, y, state, options) {
    var settings = options || {};
    var fontSize = 11;
    var maxWidth = settings.maxWidth || 160;
    var fit = ellipsize(label, maxWidth - 14, fontSize);
    var width = Math.max(30, textWidth(fit, fontSize) + 14);
    var height = 18;
    var minX = settings.minX == null ? 3 : settings.minX;
    var maxX = settings.maxX == null ? (settings.width || 720) - 3 : settings.maxX;
    var minY = settings.minY == null ? 3 : settings.minY;
    var maxY = settings.maxY == null ? (settings.height || 300) - 3 : settings.maxY;
    var left = Math.min(Math.max(x - width / 2, minX), Math.max(minX, maxX - width));
    var top = Math.min(Math.max(y - height / 2, minY), Math.max(minY, maxY - height));
    var group = svgEl('g', { class: stateClass(state, 'nviz-chart__tag') });
    var pill = svgEl('rect', {
      x: left,
      y: top,
      width: width,
      height: height,
      rx: height / 2,
      class: 'nviz-chart__tag-pill'
    });
    var labelNode = svgEl('text', {
      x: left + width / 2,
      y: top + height / 2 + 3.8,
      'text-anchor': 'middle',
      class: 'nviz-chart__tag-text'
    });
    labelNode.textContent = fit;
    group.appendChild(pill);
    group.appendChild(labelNode);
    appendTitle(group, settings.title || label);
    return { el: group, x: left + width / 2, y: top + height / 2, width: width, height: height, left: left, top: top };
  }

  function makeValueLabel(label, x, y, anchor, className) {
    var node = svgEl('text', {
      x: x,
      y: y,
      'text-anchor': anchor || 'middle',
      class: className || 'nviz-chart__value-label'
    });
    node.textContent = label;
    return node;
  }

  function labelPlacement(x, label, fontSize, width, padding) {
    var half = textWidth(label, fontSize) / 2;
    var edge = padding == null ? 4 : padding;
    if (x + half > width - edge) {
      return { x: Math.max(edge, width - edge), anchor: 'end' };
    }
    if (x - half < edge) {
      return { x: edge, anchor: 'start' };
    }
    return { x: x, anchor: 'middle' };
  }

  function appendXLabels(parent, categories, centers, top, bottom, slot) {
    var fontSize = 11.5;
    var lineHeight = 13;
    for (var i = 0; i < categories.length; i += 1) {
      var maxWidth = Math.max(18, slot - 6);
      var maxLines = xLabelMaxLines(slot);
      var lines = wrapText(categories[i], maxWidth, fontSize, maxLines);
      var textNode = svgEl('text', {
        x: centers[i],
        y: bottom + 15,
        'text-anchor': 'middle',
        class: 'nviz-chart__category-label'
      });
      for (var line = 0; line < lines.length; line += 1) {
        var tspan = svgEl('tspan', {
          x: centers[i],
          dy: line === 0 ? 0 : lineHeight
        });
        tspan.textContent = lines[line];
        textNode.appendChild(tspan);
      }
      appendTitle(textNode, categories[i]);
      parent.appendChild(textNode);
    }
  }

  function catLabelLines(categories, slot) {
    var maxLines = 1;
    var fontSize = 11.5;
    for (var i = 0; i < categories.length; i += 1) {
      var lines = wrapText(categories[i], Math.max(18, slot - 6), fontSize, xLabelMaxLines(slot));
      if (lines.length > maxLines) maxLines = lines.length;
    }
    return maxLines;
  }

  function yAxisTextWidth(ticks) {
    var maxWidth = 0;
    for (var i = 0; i < ticks.length; i += 1) {
      var width = textWidth(defaultNumber(ticks[i]), 11.5);
      if (width > maxWidth) maxWidth = width;
    }
    return maxWidth;
  }

  function drawGrid(parent, scale, left, top, innerW, innerH, includeZeroStrong) {
    for (var i = 0; i < scale.ticks.length; i += 1) {
      var value = scale.ticks[i];
      var y = top + innerH * (scale.max - value) / (scale.max - scale.min);
      var zero = includeZeroStrong && Math.abs(value) < 1e-9;
      var line = svgEl('line', {
        x1: left,
        y1: y,
        x2: left + innerW,
        y2: y,
        class: zero ? 'nviz-chart__axis-line nviz-chart__zero-line' : 'nviz-chart__grid-line'
      });
      parent.appendChild(line);
      var label = svgEl('text', {
        x: left - 8,
        y: y + 4,
        'text-anchor': 'end',
        class: 'nviz-chart__tick-label'
      });
      label.textContent = defaultNumber(value);
      parent.appendChild(label);
    }
    parent.appendChild(svgEl('line', {
      x1: left,
      y1: top,
      x2: left,
      y2: top + innerH,
      class: 'nviz-chart__axis-line'
    }));
  }

  function drawBand(parent, band, centers, slot, top, innerH) {
    var width = Math.max(10, slot * 0.92);
    var x = centers[band.index] - width / 2;
    var bandNode = svgEl('rect', {
      x: x,
      y: top,
      width: width,
      height: innerH,
      class: stateClass({ focus: band.focus, changed: band.changed }, 'nviz-chart__band'),
      'aria-hidden': 'true'
    });
    parent.appendChild(bandNode);
  }

  function addBandTags(overlay, model, bands, centers, top, width, height) {
    var maxWidth = Math.min(width - 8, 190);
    var lane = 0;
    var lastRight = -Infinity;
    for (var i = 0; i < bands.length; i += 1) {
      var band = bands[i];
      var textValue = bandLabel(model, band);
      var estimated = Math.max(30, Math.min(maxWidth, textWidth(textValue, 11) + 14));
      var left = Math.max(3, Math.min(centers[band.index] - estimated / 2, width - 3 - estimated));
      if (left < lastRight + 6) lane += 1;
      else lane = 0;
      var state = { focus: band.focus, changed: band.changed };
      var tag = makeTag(textValue, centers[band.index], top + 12 + lane * 19, state, {
        maxWidth: maxWidth,
        width: width,
        height: height
      });
      overlay.appendChild(tag.el);
      lastRight = left + estimated;
    }
  }

  function seriesClass(node, state) {
    node.setAttribute('class', stateClass(state, 'nviz-chart__series'));
  }

  function barPath(x, y, width, height, radius, upward) {
    var w = Math.max(0.8, width);
    var h = Math.max(0.8, height);
    var r = Math.min(radius, w / 2, h / 2);
    if (r < 0.6) {
      return 'M ' + x + ' ' + y + ' H ' + (x + w) + ' V ' + (y + h) + ' H ' + x + ' Z';
    }
    if (upward) {
      return 'M ' + x + ' ' + (y + h) +
        ' L ' + x + ' ' + (y + r) +
        ' Q ' + x + ' ' + y + ' ' + (x + r) + ' ' + y +
        ' L ' + (x + w - r) + ' ' + y +
        ' Q ' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + r) +
        ' L ' + (x + w) + ' ' + (y + h) + ' Z';
    }
    return 'M ' + x + ' ' + y +
      ' L ' + (x + w) + ' ' + y +
      ' L ' + (x + w) + ' ' + (y + h - r) +
      ' Q ' + (x + w) + ' ' + (y + h) + ' ' + (x + w - r) + ' ' + (y + h) +
      ' L ' + (x + r) + ' ' + (y + h) +
      ' Q ' + x + ' ' + (y + h) + ' ' + x + ' ' + (y + h - r) + ' Z';
  }

  /* ---------- 四种类型渲染器：bar / line / scatter / pie ---------- */

  function renderBar(model, width, height, state, targets) {
    var svg = svgEl('svg', {
      viewBox: '0 0 ' + width + ' ' + height,
      width: '100%',
      height: String(height),
      role: 'img',
      'aria-label': model.aria,
      preserveAspectRatio: 'xMidYMid meet',
      class: 'nviz-chart__svg'
    });
    var defs = svgEl('defs');
    for (var d = 1; d < model.series.length; d += 1) {
      var pattern = patternName(d);
      if (!pattern) continue;
      var id = global.NoteCore && global.NoteCore.uid ? global.NoteCore.uid('nviz-chart-pattern') : 'nviz-chart-pattern-' + d;
      var pat = svgEl('pattern', {
        id: id,
        width: 8,
        height: 8,
        patternUnits: 'userSpaceOnUse',
        patternTransform: 'rotate(45)'
      });
      pat.appendChild(svgEl('rect', { width: 8, height: 8, fill: model.series[d].color }));
      if (pattern === 'diag') {
        pat.appendChild(svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 8, stroke: '#ffffff', 'stroke-opacity': 0.55, 'stroke-width': 2 }));
      } else if (pattern === 'dots') {
        pat.appendChild(svgEl('circle', { cx: 2, cy: 2, r: 1.5, fill: '#ffffff', 'fill-opacity': 0.6 }));
        pat.appendChild(svgEl('circle', { cx: 6, cy: 6, r: 1.5, fill: '#ffffff', 'fill-opacity': 0.6 }));
      } else if (pattern === 'horiz') {
        pat.appendChild(svgEl('line', { x1: 0, y1: 2, x2: 8, y2: 2, stroke: '#ffffff', 'stroke-opacity': 0.55, 'stroke-width': 2 }));
      } else if (pattern === 'cross') {
        pat.appendChild(svgEl('line', { x1: 0, y1: 0, x2: 8, y2: 8, stroke: '#ffffff', 'stroke-opacity': 0.45, 'stroke-width': 1.5 }));
        pat.appendChild(svgEl('line', { x1: 8, y1: 0, x2: 0, y2: 8, stroke: '#ffffff', 'stroke-opacity': 0.45, 'stroke-width': 1.5 }));
      }
      defs.appendChild(pat);
      model.series[d].patternId = id;
    }
    svg.appendChild(defs);

    var values = allSeriesValues(model.series);
    var target = height < 250 ? 4 : 5;
    var scale = computeValueDomain(values, true, target);
    var left = Math.min(120, Math.max(34, yAxisTextWidth(scale.ticks) + 12));
    var right = 16;
    var innerW = Math.max(40, width - left - right);
    var categoryCount = model.categories.length;
    var slot = innerW / Math.max(1, categoryCount);
    var labelLines = catLabelLines(model.categories, slot);
    var bottom = Math.max(36, 16 + labelLines * 13 + 3);
    var bands = categoryBands(model);
    var top = bands.length ? 32 : 18;
    var innerH = Math.max(30, height - top - bottom);
    if (top + innerH + bottom > height) bottom = Math.max(22, height - top - innerH);
    var centers = [];
    for (var c = 0; c < categoryCount; c += 1) centers.push(left + slot * (c + 0.5));
    var zeroY = top + innerH * (scale.max - 0) / (scale.max - scale.min);
    function y(value) {
      return top + innerH * (scale.max - value) / (scale.max - scale.min);
    }

    var plot = svgEl('g', { class: 'nviz-chart__plot-area' });
    var background = svgEl('g', { class: 'nviz-chart__bands' });
    for (var bi = 0; bi < bands.length; bi += 1) drawBand(background, bands[bi], centers, slot, top, innerH);
    plot.appendChild(background);
    var grid = svgEl('g', { class: 'nviz-chart__grid' });
    drawGrid(grid, scale, left, top, innerW, innerH, true);
    plot.appendChild(grid);

    var seriesCount = model.series.length;
    var maxBarWidth = 24;
    var gap = seriesCount > 1 ? 2 : 0;
    var naturalWidth = seriesCount * maxBarWidth + gap * Math.max(0, seriesCount - 1);
    var groupW = Math.min(slot * 0.78, naturalWidth);
    var barW = seriesCount > 0 ? (groupW - gap * (seriesCount - 1)) / seriesCount : groupW;
    if (barW < 1.2) {
      gap = 0;
      barW = Math.max(0.8, groupW / seriesCount);
    }
    var markMeta = [];
    for (var s = 0; s < seriesCount; s += 1) {
      var series = model.series[s];
      var group = svgEl('g');
      seriesClass(group, seriesState(model, series.key));
      group.setAttribute('data-series', series.key);
      group.setAttribute('data-target', 'series:' + series.key);
      targets['series:' + series.key] = group;
      plot.appendChild(group);
      for (var i = 0; i < categoryCount; i += 1) {
        var value = series.values[i];
        if (!finiteNumber(value)) continue;
        var mark = markState(model, series.key, i);
        var barX = centers[i] - groupW / 2 + s * (barW + gap);
        var valueY = y(value);
        var barTop;
        var barHeight;
        if (value === 0) {
          barTop = zeroY - 1;
          barHeight = 2;
        } else if (value > 0) {
          barTop = valueY;
          barHeight = Math.max(1, zeroY - valueY);
        } else {
          barTop = zeroY;
          barHeight = Math.max(1, valueY - zeroY);
        }
        var fill = series.patternId && patternName(s) ? 'url(#' + series.patternId + ')' : series.color;
        var barNode;
        if (value === 0) {
          barNode = svgEl('rect', {
            x: barX,
            y: barTop,
            width: Math.max(0.8, barW),
            height: barHeight,
            rx: Math.min(1, barW / 2),
            fill: fill,
            class: stateClass(mark, 'nviz-chart__mark nviz-chart__bar is-zero')
          });
        } else {
          barNode = svgEl('path', {
            d: barPath(barX, barTop, barW, barHeight, 4, value > 0),
            fill: fill,
            class: stateClass(mark, 'nviz-chart__mark nviz-chart__bar')
          });
        }
        appendTitle(barNode, series.label + ' · ' + (model.categories[i] || '') + '：' +
          formatValue(state, value, { index: i, seriesKey: series.key, seriesLabel: series.label, type: model.type, label: model.categories[i] }));
        group.appendChild(barNode);
        if (!targets['point:' + i]) targets['point:' + i] = barNode;
        markMeta.push({
          series: series,
          index: i,
          value: value,
          x: centers[i],
          top: barTop,
          height: barHeight,
          y: valueY,
          mark: mark
        });
      }
    }

    var overlay = svgEl('g', { class: 'nviz-chart__annotations' });
    var valueIndices = Object.create(null);
    var showValues = seriesCount === 1;
    if (showValues) {
      var minIndex = -1;
      var maxIndex = -1;
      var minValue = Infinity;
      var maxValue = -Infinity;
      for (var vi = 0; vi < model.series[0].values.length; vi += 1) {
        var vv = model.series[0].values[vi];
        if (!finiteNumber(vv)) continue;
        if (vv < minValue) { minValue = vv; minIndex = vi; }
        if (vv > maxValue) { maxValue = vv; maxIndex = vi; }
      }
      if (minIndex >= 0) valueIndices[minIndex] = true;
      if (maxIndex >= 0) valueIndices[maxIndex] = true;
    }
    var valueGroup = svgEl('g', { class: 'nviz-chart__values' });
    var valueBudget = Math.max(36, Math.min(140, slot - 6));
    for (var m = 0; m < markMeta.length; m += 1) {
      var meta = markMeta[m];
      var hasTag = pointHasTag(model, meta.series.key, meta.index);
      if (!showValues || !valueIndices[meta.index] || hasTag) continue;
      var valueText = formatValue(state, meta.value, {
        index: meta.index,
        seriesKey: meta.series.key,
        seriesLabel: meta.series.label,
        type: model.type,
        label: model.categories[meta.index]
      });
      if (textWidth(valueText, 10.5) > valueBudget) continue;
      var labelY;
      if (meta.value >= 0) {
        labelY = Math.max(top + 12, meta.top - 8);
        if (meta.top - top < 14) labelY = meta.top + 15;
      } else {
        labelY = Math.min(top + innerH - 4, meta.top + meta.height + 14);
      }
      var placement = labelPlacement(meta.x, valueText, 10.5, width);
      valueGroup.appendChild(makeValueLabel(valueText, placement.x, labelY, placement.anchor, 'nviz-chart__value-label'));
    }
    plot.appendChild(valueGroup);
    appendXLabels(plot, model.categories, centers, top, top + innerH, slot);
    if (bands.length) addBandTags(overlay, model, bands, centers, top, width, height);
    for (var t = 0; t < markMeta.length; t += 1) {
      var item = markMeta[t];
      if (!pointHasTag(model, item.series.key, item.index)) continue;
      var status = item.mark.focus && item.mark.changed ? '关注·变化' : item.mark.focus ? '关注' : '变化';
      var val = formatValue(state, item.value, {
        index: item.index,
        seriesKey: item.series.key,
        seriesLabel: item.series.label,
        type: model.type,
        label: model.categories[item.index]
      });
      var tagText = status + (val ? ' ' + val : '');
      var tagY = item.value >= 0 ? item.top - 15 : item.top + item.height + 15;
      if (tagY < top + 12) tagY = Math.min(top + innerH - 6, item.top + 22);
      if (tagY > top + innerH - 6) tagY = Math.max(top + 12, item.top - 14);
      var tag = makeTag(tagText, item.x, tagY, item.mark, {
        maxWidth: Math.min(width - 8, 175),
        width: width,
        height: height
      });
      overlay.appendChild(tag.el);
    }
    plot.appendChild(overlay);
    svg.appendChild(plot);
    return svg;
  }

  function renderLine(model, width, height, state, targets) {
    var svg = svgEl('svg', {
      viewBox: '0 0 ' + width + ' ' + height,
      width: '100%',
      height: String(height),
      role: 'img',
      'aria-label': model.aria,
      preserveAspectRatio: 'xMidYMid meet',
      class: 'nviz-chart__svg'
    });
    var values = allSeriesValues(model.series);
    var target = height < 250 ? 4 : 5;
    var scale = computeValueDomain(values, false, target);
    var left = Math.min(120, Math.max(34, yAxisTextWidth(scale.ticks) + 12));
    var right = 16;
    var innerW = Math.max(40, width - left - right);
    var categoryCount = model.categories.length;
    var slot = innerW / Math.max(1, categoryCount);
    var labelLines = catLabelLines(model.categories, slot);
    var bottom = Math.max(36, 16 + labelLines * 13 + 3);
    var bands = categoryBands(model);
    var top = bands.length ? 32 : 18;
    var innerH = Math.max(30, height - top - bottom);
    if (top + innerH + bottom > height) bottom = Math.max(22, height - top - innerH);
    var centers = [];
    for (var c = 0; c < categoryCount; c += 1) centers.push(left + slot * (c + 0.5));
    function y(value) {
      return top + innerH * (scale.max - value) / (scale.max - scale.min);
    }
    var plot = svgEl('g', { class: 'nviz-chart__plot-area' });
    var background = svgEl('g', { class: 'nviz-chart__bands' });
    for (var bi = 0; bi < bands.length; bi += 1) drawBand(background, bands[bi], centers, slot, top, innerH);
    plot.appendChild(background);
    var grid = svgEl('g', { class: 'nviz-chart__grid' });
    drawGrid(grid, scale, left, top, innerW, innerH, true);
    plot.appendChild(grid);

    var markerMeta = [];
    var markerRadius = categoryCount > 24 ? 4 : 4.4;
    for (var s = 0; s < model.series.length; s += 1) {
      var series = model.series[s];
      var group = svgEl('g');
      seriesClass(group, seriesState(model, series.key));
      group.setAttribute('data-series', series.key);
      group.setAttribute('data-target', 'series:' + series.key);
      targets['series:' + series.key] = group;
      var pathData = '';
      var drawing = false;
      for (var i = 0; i < categoryCount; i += 1) {
        var value = series.values[i];
        if (!finiteNumber(value)) {
          drawing = false;
          continue;
        }
        var pointX = centers[i];
        var pointY = y(value);
        if (!drawing) {
          pathData += 'M ' + pointX + ' ' + pointY;
          drawing = true;
        } else {
          pathData += ' L ' + pointX + ' ' + pointY;
        }
      }
      if (pathData) {
        var path = svgEl('path', {
          d: pathData,
          fill: 'none',
          stroke: series.color,
          'stroke-width': 2.4,
          class: 'nviz-chart__line'
        });
        if (dashFor(s)) path.setAttribute('stroke-dasharray', dashFor(s));
        appendTitle(path, series.label);
        group.appendChild(path);
      }
      for (var j = 0; j < categoryCount; j += 1) {
        var markValue = series.values[j];
        if (!finiteNumber(markValue)) continue;
        var stateForPoint = markState(model, series.key, j);
        var markerX = centers[j];
        var markerY = y(markValue);
        var marker = svgEl('g', {
          class: stateClass(stateForPoint, 'nviz-chart__marker')
        });
        if (stateForPoint.focus || stateForPoint.changed) {
          var ring = svgEl('circle', {
            cx: markerX,
            cy: markerY,
            r: markerRadius + 4,
            class: stateClass(stateForPoint, 'nviz-chart__focus-ring')
          });
          marker.appendChild(ring);
        }
        marker.appendChild(markerShape(markerName(s), markerX, markerY, markerRadius, series.color));
        appendTitle(marker, series.label + ' · ' + (model.categories[j] || '') + '：' +
          formatValue(state, markValue, { index: j, seriesKey: series.key, seriesLabel: series.label, type: model.type, label: model.categories[j] }));
        group.appendChild(marker);
        if (!targets['point:' + j]) targets['point:' + j] = marker;
        markerMeta.push({
          series: series,
          index: j,
          value: markValue,
          x: markerX,
          y: markerY,
          mark: stateForPoint
        });
      }
      plot.appendChild(group);
    }

    var valueIndices = Object.create(null);
    var showValues = model.series.length === 1;
    if (showValues) {
      var lastIndex = -1;
      var lineMinIndex = -1;
      var lineMaxIndex = -1;
      var lineMin = Infinity;
      var lineMax = -Infinity;
      for (var lv = 0; lv < model.series[0].values.length; lv += 1) {
        var lvalue = model.series[0].values[lv];
        if (!finiteNumber(lvalue)) continue;
        lastIndex = lv;
        if (lvalue < lineMin) { lineMin = lvalue; lineMinIndex = lv; }
        if (lvalue > lineMax) { lineMax = lvalue; lineMaxIndex = lv; }
      }
      if (lastIndex >= 0) valueIndices[lastIndex] = true;
      if (lineMinIndex >= 0) valueIndices[lineMinIndex] = true;
      if (lineMaxIndex >= 0) valueIndices[lineMaxIndex] = true;
    }
    var valueGroup = svgEl('g', { class: 'nviz-chart__values' });
    var lineValueBudget = Math.max(36, Math.min(140, slot - 6));
    for (var mv = 0; mv < markerMeta.length; mv += 1) {
      var meta = markerMeta[mv];
      if (!showValues || !valueIndices[meta.index] || pointHasTag(model, meta.series.key, meta.index)) continue;
      var valueText = formatValue(state, meta.value, {
        index: meta.index,
        seriesKey: meta.series.key,
        seriesLabel: meta.series.label,
        type: model.type,
        label: model.categories[meta.index]
      });
      if (textWidth(valueText, 10.5) > lineValueBudget) continue;
      var valueY = meta.y - 9;
      if (valueY < top + 10) valueY = meta.y + 16;
      var placement = labelPlacement(meta.x, valueText, 10.5, width);
      valueGroup.appendChild(makeValueLabel(valueText, placement.x, valueY, placement.anchor, 'nviz-chart__value-label'));
    }
    plot.appendChild(valueGroup);
    appendXLabels(plot, model.categories, centers, top, top + innerH, slot);

    var overlay = svgEl('g', { class: 'nviz-chart__annotations' });
    if (bands.length) addBandTags(overlay, model, bands, centers, top, width, height);
    for (var t = 0; t < markerMeta.length; t += 1) {
      var item = markerMeta[t];
      if (!pointHasTag(model, item.series.key, item.index)) continue;
      var status = item.mark.focus && item.mark.changed ? '关注·变化' : item.mark.focus ? '关注' : '变化';
      var val = formatValue(state, item.value, {
        index: item.index,
        seriesKey: item.series.key,
        seriesLabel: item.series.label,
        type: model.type,
        label: model.categories[item.index]
      });
      var tagText = status + (val ? ' ' + val : '');
      var tagY = item.y - 17;
      if (tagY < top + 12) tagY = item.y + 20;
      var tag = makeTag(tagText, item.x, tagY, item.mark, {
        maxWidth: Math.min(width - 8, 175),
        width: width,
        height: height
      });
      overlay.appendChild(tag.el);
    }
    plot.appendChild(overlay);
    svg.appendChild(plot);
    return svg;
  }

  function renderScatter(model, width, height, state, targets) {
    var svg = svgEl('svg', {
      viewBox: '0 0 ' + width + ' ' + height,
      width: '100%',
      height: String(height),
      role: 'img',
      'aria-label': model.aria,
      preserveAspectRatio: 'xMidYMid meet',
      class: 'nviz-chart__svg'
    });
    var xScale = niceScale(model.xMin, model.xMax, 5, false);
    var yScale = niceScale(model.yMin, model.yMax, height < 250 ? 4 : 5, false);
    var left = Math.min(120, Math.max(38, yAxisTextWidth(yScale.ticks) + 12));
    var right = 18;
    var innerW = Math.max(40, width - left - right);
    var top = 26;
    var bottom = 44;
    var innerH = Math.max(30, height - top - bottom);
    if (top + innerH + bottom > height) bottom = Math.max(24, height - top - innerH);
    var xTarget = Math.min(7, Math.max(3, Math.floor(innerW / 80)));
    xScale = niceScale(model.xMin, model.xMax, xTarget, false);
    var xName = text(state.xLabel).trim() || 'x';
    var yName = text(state.yLabel).trim() || 'y';
    var xTitle = svgEl('text', {
      x: left + innerW / 2,
      y: height - 5,
      'text-anchor': 'middle',
      class: 'nviz-chart__axis-title'
    });
    xTitle.textContent = xName;
    var yTitle = svgEl('text', {
      x: left,
      y: 15,
      'text-anchor': 'start',
      class: 'nviz-chart__axis-title'
    });
    yTitle.textContent = yName;
    function x(value) {
      return left + innerW * (value - xScale.min) / (xScale.max - xScale.min);
    }
    function y(value) {
      return top + innerH * (yScale.max - value) / (yScale.max - yScale.min);
    }
    var plot = svgEl('g', { class: 'nviz-chart__plot-area' });
    var grid = svgEl('g', { class: 'nviz-chart__grid' });
    var zeroX = xScale.min <= 0 && xScale.max >= 0 ? x(0) : null;
    var zeroY = yScale.min <= 0 && yScale.max >= 0 ? y(0) : null;
    for (var xt = 0; xt < xScale.ticks.length; xt += 1) {
      var tickX = x(xScale.ticks[xt]);
      var vertical = svgEl('line', {
        x1: tickX,
        y1: top,
        x2: tickX,
        y2: top + innerH,
        class: zeroX !== null && Math.abs(tickX - zeroX) < 0.5
          ? 'nviz-chart__axis-line nviz-chart__zero-line'
          : 'nviz-chart__grid-line'
      });
      grid.appendChild(vertical);
      var tickText = svgEl('text', {
        x: tickX,
        y: top + innerH + 17,
        'text-anchor': 'middle',
        class: 'nviz-chart__tick-label'
      });
      tickText.textContent = defaultNumber(xScale.ticks[xt]);
      grid.appendChild(tickText);
    }
    for (var yt = 0; yt < yScale.ticks.length; yt += 1) {
      var tickY = y(yScale.ticks[yt]);
      var horizontal = svgEl('line', {
        x1: left,
        y1: tickY,
        x2: left + innerW,
        y2: tickY,
        class: zeroY !== null && Math.abs(tickY - zeroY) < 0.5
          ? 'nviz-chart__axis-line nviz-chart__zero-line'
          : 'nviz-chart__grid-line'
      });
      grid.appendChild(horizontal);
      var tickLabel = svgEl('text', {
        x: left - 8,
        y: tickY + 4,
        'text-anchor': 'end',
        class: 'nviz-chart__tick-label'
      });
      tickLabel.textContent = defaultNumber(yScale.ticks[yt]);
      grid.appendChild(tickLabel);
    }
    grid.appendChild(svgEl('line', { x1: left, y1: top, x2: left, y2: top + innerH, class: 'nviz-chart__axis-line' }));
    plot.appendChild(grid);
    plot.appendChild(xTitle);
    plot.appendChild(yTitle);

    var totalPoints = model.pointCount;
    var showPointLabels = model.series.length === 1 && totalPoints <= 10;
    var markerRadius = totalPoints > 80 ? 4 : totalPoints > 30 ? 4.4 : 4.8;
    var pointMeta = [];
    for (var s = 0; s < model.series.length; s += 1) {
      var series = model.series[s];
      var group = svgEl('g');
      seriesClass(group, seriesState(model, series.key));
      group.setAttribute('data-series', series.key);
      group.setAttribute('data-target', 'series:' + series.key);
      targets['series:' + series.key] = group;
      for (var p = 0; p < series.points.length; p += 1) {
        var point = series.points[p];
        var mark = markState(model, series.key, point.index);
        var markerX = x(point.x);
        var markerY = y(point.y);
        var marker = svgEl('g', { class: stateClass(mark, 'nviz-chart__marker') });
        if (mark.focus || mark.changed) {
          marker.appendChild(svgEl('circle', {
            cx: markerX,
            cy: markerY,
            r: markerRadius + 4,
            class: stateClass(mark, 'nviz-chart__focus-ring')
          }));
        }
        marker.appendChild(markerShape(markerName(s), markerX, markerY, markerRadius, series.color));
        appendTitle(marker, series.label + ' · (' + defaultNumber(point.x) + ', ' + defaultNumber(point.y) + ')' +
          (point.label ? ' · ' + point.label : ''));
        group.appendChild(marker);
        if (!targets['point:' + point.index]) targets['point:' + point.index] = marker;
        pointMeta.push({
          series: series,
          point: point,
          x: markerX,
          y: markerY,
          mark: mark
        });
      }
      plot.appendChild(group);
    }
    var labelGroup = svgEl('g', { class: 'nviz-chart__point-labels' });
    for (var pl = 0; pl < pointMeta.length; pl += 1) {
      var meta = pointMeta[pl];
      if (!showPointLabels || !meta.point.label) continue;
      if (pointHasTag(model, meta.series.key, meta.point.index)) continue;
      var labelText = ellipsize(meta.point.label, Math.max(40, innerW * 0.22), 10.5);
      var labelWidth = textWidth(labelText, 10.5);
      var labelX = meta.x + 7;
      var labelAnchor = 'start';
      if (labelX + labelWidth > width - 4) {
        labelX = meta.x - 7;
        labelAnchor = 'end';
      }
      var labelY = meta.y - 8;
      if (labelY < top + 9) labelY = meta.y + 15;
      var pointLabel = makeValueLabel(labelText, labelX, labelY, labelAnchor, 'nviz-chart__point-label');
      appendTitle(pointLabel, meta.point.label);
      labelGroup.appendChild(pointLabel);
    }
    plot.appendChild(labelGroup);

    var overlay = svgEl('g', { class: 'nviz-chart__annotations' });
    var categoryTagged = Object.create(null);
    for (var pm = 0; pm < pointMeta.length; pm += 1) {
      var item = pointMeta[pm];
      if (!item.mark.focus && !item.mark.changed) continue;
      var isSpecific = (item.mark.focus && model.focusKind === 'point' && model.focus.seriesKey === item.series.key && model.focus.index === item.point.index) ||
        (item.mark.changed && model.changedKind === 'point' && model.changed.seriesKey === item.series.key && model.changed.index === item.point.index);
      var isCategory = model.focusKind === 'category' || model.changedKind === 'category';
      if (!isSpecific && !isCategory) continue;
      if (isCategory && !isSpecific) {
        if (categoryTagged[item.point.index]) continue;
        categoryTagged[item.point.index] = true;
      }
      var status = item.mark.focus && item.mark.changed ? '关注·变化' : item.mark.focus ? '关注' : '变化';
      var detail;
      if (isCategory && !isSpecific) {
        detail = model.series.length === 1 && item.point.label
          ? item.point.label
          : ('第 ' + (item.point.index + 1) + ' 个点');
      } else {
        detail = item.point.label || ('(' + formatValue(state, item.point.x, { axis: 'x', seriesKey: item.series.key, type: model.type }) +
          ', ' + formatValue(state, item.point.y, { axis: 'y', seriesKey: item.series.key, type: model.type }) + ')');
      }
      var tag = makeTag(status + ' ' + detail, item.x, item.y - 17, item.mark, {
        maxWidth: Math.min(width - 8, 180),
        width: width,
        height: height
      });
      overlay.appendChild(tag.el);
    }
    plot.appendChild(overlay);
    svg.appendChild(plot);
    return svg;
  }

  function slicePath(cx, cy, radius, start, end) {
    var delta = end - start;
    var x1 = cx + radius * Math.cos(start);
    var y1 = cy + radius * Math.sin(start);
    var x2 = cx + radius * Math.cos(end);
    var y2 = cy + radius * Math.sin(end);
    if (delta >= Math.PI * 2 - 1e-7) {
      return 'M ' + (cx + radius) + ' ' + cy +
        ' A ' + radius + ' ' + radius + ' 0 1 1 ' + (cx - radius) + ' ' + cy +
        ' A ' + radius + ' ' + radius + ' 0 1 1 ' + (cx + radius) + ' ' + cy + ' Z';
    }
    var large = delta > Math.PI ? 1 : 0;
    return 'M ' + cx + ' ' + cy +
      ' L ' + x1 + ' ' + y1 +
      ' A ' + radius + ' ' + radius + ' 0 ' + large + ' 1 ' + x2 + ' ' + y2 + ' Z';
  }

  function renderPie(model, width, height, state, targets) {
    var svg = svgEl('svg', {
      viewBox: '0 0 ' + width + ' ' + height,
      width: '100%',
      height: String(height),
      role: 'img',
      'aria-label': model.aria,
      preserveAspectRatio: 'xMidYMid meet',
      class: 'nviz-chart__svg'
    });
    var plot = svgEl('g', { class: 'nviz-chart__plot-area' });
    var cx = width / 2;
    var cy = height / 2;
    var radius = Math.max(20, Math.min(width, height) / 2 - 28);
    var total = model.pieTotal;
    var series = model.series[0] || { key: 'main', label: '数值', values: [] };
    var seriesGroup = svgEl('g');
    seriesGroup.setAttribute('data-series', series.key);
    seriesGroup.setAttribute('data-target', 'series:' + series.key);
    targets['series:' + series.key] = seriesGroup;
    var overlay = svgEl('g', { class: 'nviz-chart__annotations' });
    var startAngle = -Math.PI / 2;
    var sliceMeta = [];
    plot.appendChild(seriesGroup);
    for (var i = 0; i < model.categories.length; i += 1) {
      var value = series.values[i];
      if (!finiteNumber(value) || value <= 0) continue;
      var delta = Math.PI * 2 * value / total;
      var endAngle = startAngle + delta;
      var mark = markState(model, series.key, i);
      var offset = mark.focus || mark.changed ? 6 : 0;
      var mid = startAngle + delta / 2;
      var offsetX = Math.cos(mid) * offset;
      var offsetY = Math.sin(mid) * offset;
      var fill = model.sliceColors[i] || model.colors[i % model.colors.length];
      var path = svgEl('path', {
        d: slicePath(cx + offsetX, cy + offsetY, radius, startAngle, endAngle),
        fill: fill,
        class: stateClass(mark, 'nviz-chart__mark nviz-chart__slice')
      });
      appendTitle(path, (model.categories[i] || '') + '：' +
        formatValue(state, value, { index: i, seriesKey: series.key, seriesLabel: series.label, type: model.type, label: model.categories[i] }) +
        '（' + formatPercent(value / total) + '）');
      seriesGroup.appendChild(path);
      targets['slice:' + i] = path;
      var percent = value / total;
      if (percent >= 0.06 && radius >= 42) {
        var labelX = cx + offsetX + Math.cos(mid) * radius * 0.62;
        var labelY = cy + offsetY + Math.sin(mid) * radius * 0.62 + 4;
        var percentLabel = svgEl('text', {
          x: labelX,
          y: labelY,
          'text-anchor': 'middle',
          class: 'nviz-chart__slice-label'
        });
        percentLabel.textContent = formatPercent(percent);
        plot.appendChild(percentLabel);
      }
      sliceMeta.push({ index: i, value: value, percent: percent, mid: mid, mark: mark, offsetX: offsetX, offsetY: offsetY });
      startAngle = endAngle;
    }
    for (var sm = 0; sm < sliceMeta.length; sm += 1) {
      var slice = sliceMeta[sm];
      if (!slice.mark.focus && !slice.mark.changed) continue;
      var status = slice.mark.focus && slice.mark.changed ? '关注·变化' : slice.mark.focus ? '关注' : '变化';
      var tagX = cx + slice.offsetX + Math.cos(slice.mid) * (radius + 25);
      var tagY = cy + slice.offsetY + Math.sin(slice.mid) * (radius + 25);
      var lineStartX = cx + slice.offsetX + Math.cos(slice.mid) * (radius + 2);
      var lineStartY = cy + slice.offsetY + Math.sin(slice.mid) * (radius + 2);
      var tag = makeTag(status + ' ' + formatPercent(slice.percent), tagX, tagY, slice.mark, {
        maxWidth: Math.min(width - 8, 150),
        width: width,
        height: height
      });
      overlay.appendChild(svgEl('line', {
        x1: lineStartX,
        y1: lineStartY,
        x2: tag.x,
        y2: tag.y,
        class: 'nviz-chart__leader'
      }));
      overlay.appendChild(tag.el);
    }
    plot.appendChild(overlay);
    svg.appendChild(plot);
    return svg;
  }

  function renderChartSvg(model, width, height, state, targets) {
    var svg;
    if (model.type === 'line') svg = renderLine(model, width, height, state, targets);
    else if (model.type === 'scatter') svg = renderScatter(model, width, height, state, targets);
    else if (model.type === 'pie') svg = renderPie(model, width, height, state, targets);
    else svg = renderBar(model, width, height, state, targets);
    svg.style.height = height + 'px';
    return svg;
  }

  /* ---------- 图例与数据表 ---------- */

  function makeSeriesSwatch(series, index, type, pattern) {
    if (type === 'line' || type === 'scatter') {
      var mini = svgEl('svg', {
        width: 28,
        height: 14,
        viewBox: '0 0 28 14',
        class: 'nviz-chart__swatch-svg',
        'aria-hidden': 'true',
        focusable: 'false'
      });
      if (type === 'line') {
        var line = svgEl('line', {
          x1: 1,
          y1: 7,
          x2: 27,
          y2: 7,
          stroke: series.color,
          'stroke-width': 2.2,
          'stroke-linecap': 'round'
        });
        var dash = dashFor(index);
        if (dash) line.setAttribute('stroke-dasharray', dash);
        mini.appendChild(line);
      }
      mini.appendChild(markerShape(markerName(index), 14, 7, 3.2, series.color));
      return mini;
    }
    var swatch = document.createElement('span');
    swatch.className = 'nviz-chart__swatch';
    swatch.style.backgroundColor = series.color;
    if (type === 'bar' && pattern) swatch.className += ' nviz-chart__swatch--' + pattern;
    return swatch;
  }

  function pieSwatch(color) {
    var swatch = document.createElement('span');
    swatch.className = 'nviz-chart__swatch nviz-chart__swatch--pie';
    swatch.style.backgroundColor = color;
    return swatch;
  }

  function badgeFor(focus, changed) {
    if (!focus && !changed) return null;
    var span = document.createElement('span');
    span.className = 'nviz-chart__badge' + (focus ? ' is-focus' : '') + (changed ? ' is-changed' : '');
    span.textContent = focus && changed ? '关注 · 变化' : focus ? '关注' : '变化';
    return span;
  }

  function buildLegend(model, state) {
    var list = document.createElement('ul');
    list.className = 'nviz-chart__legend';
    list.setAttribute('aria-label', model.type === 'pie' ? '图例：类别、数值与占比' : '图例');
    if (model.type === 'pie') {
      for (var i = 0; i < model.categories.length; i += 1) {
        var item = document.createElement('li');
        item.className = 'nviz-chart__legend-item';
        var mark = markState(model, model.series[0] ? model.series[0].key : 'main', i);
        item.appendChild(pieSwatch(model.sliceColors[i] || model.colors[i % model.colors.length]));
        var label = document.createElement('span');
        label.className = 'nviz-chart__legend-label';
        label.textContent = model.categories[i];
        item.appendChild(label);
        var value = model.series[0] ? model.series[0].values[i] : null;
        var valueText = document.createElement('span');
        valueText.className = 'nviz-chart__legend-value';
        var percent = finiteNumber(value) && value === 0
          ? 0
          : (model.pieTotal > 0 && finiteNumber(value) && value > 0 ? value / model.pieTotal : null);
        valueText.textContent = formatValue(state, value, { index: i, seriesKey: model.series[0] ? model.series[0].key : 'main', type: model.type, label: model.categories[i] }) +
          (percent !== null ? ' · ' + formatPercent(percent) : ' · —');
        item.appendChild(valueText);
        var badge = badgeFor(mark.focus, mark.changed);
        if (badge) item.appendChild(badge);
        list.appendChild(item);
      }
      return list;
    }
    for (var s = 0; s < model.series.length; s += 1) {
      var series = model.series[s];
      var li = document.createElement('li');
      li.className = 'nviz-chart__legend-item';
      var swatch = makeSeriesSwatch(series, s, model.type, patternName(s));
      li.appendChild(swatch);
      var name = document.createElement('span');
      name.className = 'nviz-chart__legend-label';
      name.textContent = series.label;
      li.appendChild(name);
      var hasSeriesData = model.type === 'scatter'
        ? series.points.length > 0
        : series.values.some(function (value) { return finiteNumber(value); });
      if (!hasSeriesData) {
        var empty = document.createElement('span');
        empty.className = 'nviz-chart__legend-value';
        empty.textContent = '无数据';
        li.appendChild(empty);
      }
      var seriesMark = seriesState(model, series.key);
      var seriesBadge = badgeFor(seriesMark.focus, seriesMark.changed);
      if (seriesBadge) li.appendChild(seriesBadge);
      list.appendChild(li);
    }
    return list;
  }

  function tableCell(value, className) {
    var cell = document.createElement('td');
    if (className) cell.className = className;
    cell.textContent = value;
    return cell;
  }

  function tableHeader(value, className, scope) {
    var cell = document.createElement('th');
    if (className) cell.className = className;
    if (scope) cell.setAttribute('scope', scope);
    cell.textContent = value;
    return cell;
  }

  function buildTable(model, state, wasOpen) {
    if (!hasTableData(model)) return null;
    var details = document.createElement('details');
    details.className = 'nviz-chart__table';
    details.open = Boolean(wasOpen);
    var summary = document.createElement('summary');
    summary.textContent = '数据表';
    details.appendChild(summary);
    var scroll = document.createElement('div');
    scroll.className = 'nviz-chart__table-scroll';
    scroll.setAttribute('tabindex', '0');
    scroll.setAttribute('role', 'group');
    scroll.setAttribute('aria-label', '数据表滚动区域');
    var table = document.createElement('table');
    table.className = 'nviz-chart__data-table';
    var caption = document.createElement('caption');
    var title = text(state.label).trim();
    var unit = text(state.unit).trim();
    caption.textContent = (title ? title + ' · ' : '') + '数据表' + (unit ? '（单位：' + unit + '）' : '');
    table.appendChild(caption);
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    var tbody = document.createElement('tbody');

    if (model.type === 'scatter') {
      var xName = text(state.xLabel).trim() || 'x';
      var yName = text(state.yLabel).trim() || 'y';
      headRow.appendChild(tableHeader('数据点', null, 'col'));
      headRow.appendChild(tableHeader(xName, 'is-numeric', 'col'));
      headRow.appendChild(tableHeader(yName, 'is-numeric', 'col'));
      headRow.appendChild(tableHeader('标签', null, 'col'));
      for (var s = 0; s < model.series.length; s += 1) {
        var series = model.series[s];
        for (var p = 0; p < series.points.length; p += 1) {
          var point = series.points[p];
          var row = document.createElement('tr');
          row.appendChild(tableHeader(series.label + ' · 点 ' + (point.index + 1), null, 'row'));
          row.appendChild(tableCell(formatValue(state, point.x, { axis: 'x', index: point.index, seriesKey: series.key, type: model.type }), 'is-numeric'));
          row.appendChild(tableCell(formatValue(state, point.y, { axis: 'y', index: point.index, seriesKey: series.key, type: model.type }), 'is-numeric'));
          row.appendChild(tableCell(point.label || '—'));
          tbody.appendChild(row);
        }
      }
      thead.appendChild(headRow);
      table.appendChild(thead);
      table.appendChild(tbody);
    } else if (model.type === 'pie') {
      headRow.appendChild(tableHeader('类别', null, 'col'));
      headRow.appendChild(tableHeader('数值', 'is-numeric', 'col'));
      headRow.appendChild(tableHeader('占比', 'is-numeric', 'col'));
      for (var pi = 0; pi < model.categories.length; pi += 1) {
        var value = model.series[0] ? model.series[0].values[pi] : null;
        var row = document.createElement('tr');
        row.appendChild(tableHeader(model.categories[pi], null, 'row'));
        row.appendChild(tableCell(formatValue(state, value, { index: pi, seriesKey: model.series[0] ? model.series[0].key : 'main', type: model.type, label: model.categories[pi] }), 'is-numeric'));
        row.appendChild(tableCell(
          finiteNumber(value) && value === 0
            ? '0%'
            : (model.pieTotal > 0 && finiteNumber(value) && value > 0 ? formatPercent(value / model.pieTotal) : '—'),
          'is-numeric'
        ));
        tbody.appendChild(row);
      }
      thead.appendChild(headRow);
      table.appendChild(thead);
      table.appendChild(tbody);
    } else {
      headRow.appendChild(tableHeader('类别', null, 'col'));
      for (var hs = 0; hs < model.series.length; hs += 1) {
        headRow.appendChild(tableHeader(model.series[hs].label, 'is-numeric', 'col'));
      }
      for (var c = 0; c < model.categories.length; c += 1) {
        var catRow = document.createElement('tr');
        catRow.appendChild(tableHeader(model.categories[c], null, 'row'));
        for (var cs = 0; cs < model.series.length; cs += 1) {
          var cellValue = model.series[cs].values[c];
          catRow.appendChild(tableCell(
            finiteNumber(cellValue)
              ? formatValue(state, cellValue, { index: c, seriesKey: model.series[cs].key, seriesLabel: model.series[cs].label, type: model.type, label: model.categories[c] })
              : '—',
            'is-numeric'
          ));
        }
        tbody.appendChild(catRow);
      }
      thead.appendChild(headRow);
      table.appendChild(thead);
      table.appendChild(tbody);
    }
    scroll.appendChild(table);
    details.appendChild(scroll);
    return details;
  }

  /* ---------- 动效偏好 ---------- */

  function isReducedMotion() {
    var core = global.NoteCore;
    if (core && core.motion && typeof core.motion.reduced === 'function') {
      try { return Boolean(core.motion.reduced()); } catch (error) {}
    }
    try { return Boolean(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (error) {
      return false;
    }
  }

  /* ---------- 公开入口：NoteViz.Chart.mount ---------- */

  NoteViz.Chart = {
    version: VERSION,
    mount: function (host, options) {
      var core = global.NoteCore;
      if (!core || typeof core.component !== 'function' || typeof core.el !== 'function') {
        throw new Error('NoteViz.Chart 需要先加载 NoteCore。');
      }
      core.validateHost(host);
      var input = options || {};
      var defaults = {
        type: 'bar',
        data: null,
        labels: null,
        series: null,
        focus: null,
        changed: null,
        colors: null,
        height: 300,
        valueFormat: null,
        table: false,
        label: '',
        unit: '',
        xLabel: '',
        yLabel: '',
        animate: false
      };
      var state = {};
      for (var key in defaults) {
        if (own(defaults, key)) state[key] = defaults[key];
      }
      for (var inputKey in input) {
        if (own(input, inputKey)) state[inputKey] = input[inputKey];
      }

      var root = core.el('figure', 'nviz-chart');
      var targets = Object.create(null);
      var inst = null;
      var lastWidth = 0;
      var animateNext = false;
      var animationTimer = 0;
      var resizeHandle = null;
      var windowResizeHandler = null;

      function measuredWidth() {
        var width = root.clientWidth || 0;
        if (!width && host && host.nodeType === 1) width = host.clientWidth || 0;
        if (!width) width = 720;
        return Math.round(Math.min(1600, Math.max(240, width)));
      }

      function startAnimation() {
        if (animationTimer) {
          global.clearTimeout(animationTimer);
          animationTimer = 0;
        }
        root.classList.add('is-animating');
        animationTimer = global.setTimeout(function () {
          animationTimer = 0;
          root.classList.remove('is-animating');
        }, 480);
      }

      function render(patch) {
        var width = lastWidth || 720;
        var height = clampNumber(state.height, 300, 180, 1200);
        var oldTable = root.querySelector ? root.querySelector('.nviz-chart__table') : null;
        var tableWasOpen = Boolean(oldTable && oldTable.open);
        var model = buildModel(state);
        var localTargets = Object.create(null);
        var frag = document.createDocumentFragment();
        if (animationTimer) {
          global.clearTimeout(animationTimer);
          animationTimer = 0;
        }
        root.className = 'nviz-chart nviz-chart--' + model.type + (model.empty ? ' is-empty' : '');
        root.setAttribute('data-type', model.type);
        root.setAttribute('data-empty', model.empty ? 'true' : 'false');

        var captionText = text(state.label).trim();
        if (captionText) {
          var caption = document.createElement('figcaption');
          caption.className = 'nviz-chart__caption';
          caption.textContent = captionText;
          frag.appendChild(caption);
        }
        var unitText = text(state.unit).trim();
        if (unitText) {
          var unit = document.createElement('p');
          unit.className = 'nviz-chart__unit';
          unit.textContent = '单位：' + unitText;
          frag.appendChild(unit);
        }

        var plot = document.createElement('div');
        plot.className = 'nviz-chart__plot';
        plot.style.height = height + 'px';
        if (!model.empty && height > 520) {
          root.classList.add('nviz-chart--tall');
          plot.setAttribute('tabindex', '0');
          plot.setAttribute('role', 'group');
          plot.setAttribute('aria-label', '图表滚动区域，可上下滚动');
        }
        if (model.empty) {
          var empty = document.createElement('div');
          empty.className = 'nviz-chart__empty';
          empty.setAttribute('role', 'img');
          empty.setAttribute('aria-label', model.aria);
          var emptyTitle = document.createElement('strong');
          emptyTitle.textContent = '暂无可绘制数据';
          var emptyHint = document.createElement('span');
          emptyHint.textContent = model.emptyReason || '请提供数值型 data 或 series。';
          empty.appendChild(emptyTitle);
          empty.appendChild(emptyHint);
          plot.appendChild(empty);
        } else {
          plot.appendChild(renderChartSvg(model, width, height, state, localTargets));
        }
        frag.appendChild(plot);

        if (!model.empty) {
          var showLegend = model.type === 'pie' || model.series.length > 1;
          if (!showLegend && model.series.length === 1) {
            var singleSeriesState = seriesState(model, model.series[0].key);
            showLegend = singleSeriesState.focus || singleSeriesState.changed;
          }
          if (showLegend) frag.appendChild(buildLegend(model, state));
          if (model.notes.length) {
            var note = document.createElement('p');
            note.className = 'nviz-chart__note';
            note.textContent = model.notes.join(' ');
            frag.appendChild(note);
          }
        } else if (model.notes.length) {
          var emptyNote = document.createElement('p');
          emptyNote.className = 'nviz-chart__note';
          emptyNote.textContent = model.notes.join(' ');
          frag.appendChild(emptyNote);
        }

        if (state.table) {
          var table = buildTable(model, state, tableWasOpen);
          if (table) frag.appendChild(table);
        }

        root.replaceChildren(frag);
        targets = localTargets;
        if (animateNext) {
          animateNext = false;
          if (state.animate && !isReducedMotion()) startAnimation();
        } else {
          animateNext = false;
        }
        return patch;
      }

      function update(patch) {
        if (!inst || inst.destroyed || !patch || typeof patch !== 'object') return;
        var prepared = {};
        for (var patchKey in patch) {
          if (own(patch, patchKey)) prepared[patchKey] = patch[patchKey];
        }
        var sourceTouched = own(prepared, 'type') || own(prepared, 'data') ||
          own(prepared, 'series') || own(prepared, 'labels');
        if (own(prepared, 'data') && !own(prepared, 'series')) {
          prepared.series = null;
          if (!own(prepared, 'labels')) prepared.labels = null;
        }
        if (own(prepared, 'series') && !own(prepared, 'data')) {
          prepared.data = null;
          if (!own(prepared, 'labels')) prepared.labels = null;
        }
        if ((own(prepared, 'data') || own(prepared, 'series')) && !own(prepared, 'labels')) {
          prepared.labels = null;
        }
        if (sourceTouched) {
          if (!own(prepared, 'focus')) prepared.focus = null;
          if (!own(prepared, 'changed')) prepared.changed = null;
        }
        animateNext = sourceTouched;
        inst.update(prepared);
      }

      function cleanup() {
        if (resizeHandle) {
          resizeHandle();
          resizeHandle = null;
        }
        if (windowResizeHandler) {
          global.removeEventListener('resize', windowResizeHandler);
          windowResizeHandler = null;
        }
        if (animationTimer) {
          global.clearTimeout(animationTimer);
          animationTimer = 0;
        }
        targets = Object.create(null);
      }

      inst = core.component(root, state, render, cleanup);
      render();
      host.appendChild(root);
      lastWidth = measuredWidth();
      if (lastWidth !== 720) render();
      if (core.onResize) {
        resizeHandle = core.onResize(root, function () {
          if (!inst || inst.destroyed) return;
          var width = measuredWidth();
          if (width !== lastWidth) {
            lastWidth = width;
            render();
          }
        });
      } else if (global.addEventListener) {
        windowResizeHandler = function () {
          if (!inst || inst.destroyed) return;
          var width = measuredWidth();
          if (width !== lastWidth) {
            lastWidth = width;
            render();
          }
        };
        global.addEventListener('resize', windowResizeHandler);
      }

      return {
        el: root,
        update: update,
        destroy: function () {
          if (!inst || inst.destroyed) return;
          inst.destroy();
        },
        getTarget: function (id) {
          if (!id || !inst || inst.destroyed) return null;
          var found = targets[String(id)];
          return found || null;
        }
      };
    }
  };
})(window);
