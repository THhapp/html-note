/* Gallery demo for V01 NoteViz.Chart.
   Scope: demo only. Uses the public NoteViz.Chart API; no auto-play and no timers.
   Default is static; every update is a direct result of a user click. */
(function () {
  'use strict';

  var demoRegistry = window.NoteGalleryDemos = window.NoteGalleryDemos || {};
  var TYPE_LABEL = { bar: '柱状图', line: '折线图', scatter: '散点图', pie: '饼图' };
  var VARIANT_LABEL = {
    default: '默认数据',
    alt: '另一组数据',
    long: '长标签',
    negative: '含负值',
    empty: '空数据'
  };

  var MULTI = {
    default: {
      labels: ['Q1', 'Q2', 'Q3', 'Q4'],
      series: [
        { key: 'online', label: '线上', values: [42, 58, 51, 76] },
        { key: 'store', label: '门店', values: [36, 41, 47, 52] }
      ]
    },
    alt: {
      labels: ['一月', '二月', '三月', '四月', '五月'],
      series: [
        { key: 'online', label: '线上', values: [31, 45, 39, 62, 58] },
        { key: 'store', label: '门店', values: [28, 33, 42, 40, 47] }
      ]
    },
    long: {
      labels: ['第一季度线上渠道', '第二季度线下门店', '第三季度批发与分销', '第四季度其他渠道'],
      series: [
        { key: 'online', label: '线上渠道', values: [42, 58, 51, 76] },
        { key: 'store', label: '门店渠道', values: [36, 41, 47, 52] }
      ]
    },
    negative: {
      labels: ['一月', '二月', '三月', '四月'],
      series: [
        { key: 'online', label: '线上', values: [22, -14, 18, -6] },
        { key: 'store', label: '门店', values: [-8, 12, -3, 9] }
      ]
    }
  };

  var SCATTER = {
    default: {
      series: [
        { key: 'a', label: 'A 组', points: [
          { x: 1, y: 4, label: '甲' },
          { x: 2, y: 7, label: '乙' },
          { x: 2.6, y: 5.5, label: '丙' }
        ] },
        { key: 'b', label: 'B 组', points: [
          { x: 1.5, y: 3 },
          { x: 3, y: 6, label: '丁' },
          { x: 3.6, y: 4.4 }
        ] }
      ]
    },
    alt: {
      series: [
        { key: 'a', label: 'A 组', points: [
          { x: 0.8, y: 5.2, label: '甲' },
          { x: 1.8, y: 6.4, label: '乙' },
          { x: 2.4, y: 4.8, label: '丙' },
          { x: 3.2, y: 7.1, label: '丁' }
        ] },
        { key: 'b', label: 'B 组', points: [
          { x: 1.2, y: 3.1 },
          { x: 2.1, y: 4.2 },
          { x: 2.9, y: 5.8 },
          { x: 3.8, y: 6.6 }
        ] }
      ]
    },
    long: {
      series: [
        { key: 'a', label: 'A 组', points: [
          { x: 1, y: 4, label: '很长的测量点标签甲' },
          { x: 2, y: 7, label: 'another long measurement label' },
          { x: 3, y: 5.5, label: '中英混排 measurement 丙' },
          { x: 3.6, y: 3.8, label: '第四个点的长标签' }
        ] }
      ]
    },
    negative: {
      series: [
        { key: 'a', label: 'A 组', points: [
          { x: -3, y: -2, label: '甲' },
          { x: -1, y: 4, label: '乙' },
          { x: 2, y: 1.5, label: '丙' }
        ] },
        { key: 'b', label: 'B 组', points: [
          { x: -2, y: 3 },
          { x: 1, y: -3, label: '丁' },
          { x: 3, y: 2.5 }
        ] }
      ]
    }
  };

  var PIE = {
    default: {
      data: [
        { label: '直营', value: 48 },
        { label: '加盟', value: 31 },
        { label: '电商', value: 26 },
        { label: '其他', value: 9 }
      ]
    },
    alt: {
      data: [
        { label: '华东', value: 34 },
        { label: '华南', value: 27 },
        { label: '华北', value: 22 },
        { label: '西部', value: 17 }
      ]
    },
    long: {
      data: [
        { label: '非常长的直营渠道名称', value: 48 },
        { label: '另一个很长的加盟渠道名称', value: 31 },
        { label: '其他渠道', value: 21 }
      ]
    },
    empty: { data: [] }
  };

  function element(tag, className, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined && content !== null) node.textContent = String(content);
    return node;
  }

  function cloneData(source) {
    var result = { data: null, series: null, labels: null };
    if (source.data) {
      result.data = source.data.map(function (item) {
        return { label: item.label, value: item.value };
      });
    }
    if (source.labels) result.labels = source.labels.slice();
    if (source.series) {
      result.series = source.series.map(function (series) {
        var copy = { key: series.key, label: series.label };
        if (series.values) copy.values = series.values.slice();
        if (series.points) {
          copy.points = series.points.map(function (point) {
            return { x: point.x, y: point.y, label: point.label };
          });
        }
        return copy;
      });
    }
    return result;
  }

  function sourceFor(type, variant) {
    if (variant === 'empty') {
      if (type === 'pie') return { data: [] };
      return { series: [] };
    }
    if (type === 'pie') return PIE[variant] || PIE.default;
    if (type === 'scatter') return SCATTER[variant] || SCATTER.default;
    return MULTI[variant] || MULTI.default;
  }

  function labelFor(type, variant) {
    var base = {
      bar: '渠道季度销量',
      line: '渠道走势',
      scatter: '散点测量',
      pie: '渠道销量占比'
    }[type] || '图表';
    if (variant === 'empty') return base + '（空数据）';
    if (variant === 'long') return '长标签演示 · ' + base;
    if (variant === 'negative') return '含负值 · ' + base;
    if (variant === 'alt') return '另一组数据 · ' + base;
    return base;
  }

  function emphasisDefault(type, variant) {
    if (variant === 'empty') return { focus: null, changed: null };
    if (type === 'pie') {
      return { focus: { index: 1 }, changed: { index: 2 } };
    }
    if (type === 'scatter') {
      return { focus: { series: 'a', index: 1 }, changed: { index: 0 } };
    }
    return { focus: { series: 'online', index: 2 }, changed: { series: 'store', index: 3 } };
  }

  demoRegistry.V01 = function (host) {
    if (!host || typeof host.appendChild !== 'function') return { destroy: function () {} };

    var listeners = [];
    var destroyed = false;
    var currentType = 'bar';
    var currentVariant = 'default';
    var tableOn = true;
    var emphasisOn = true;
    var emphasis = emphasisDefault('bar', 'default');
    var shouldOpenTable = true;

    var root = element('div', 'nviz-chart-demo');
    var style = document.createElement('style');
    style.textContent = [
      '.nviz-chart-demo { display: grid; gap: 12px; min-width: 0; max-width: 100%; color: var(--hnv-color-ink, #202938); font-family: var(--hnv-font-family, "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif); font-size: 14px; }',
      '.nviz-chart-demo__toolbar { display: grid; gap: 8px; min-width: 0; }',
      '.nviz-chart-demo__row { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; min-width: 0; }',
      '.nviz-chart-demo__group { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-width: 0; }',
      '.nviz-chart-demo__group-label { color: var(--hnv-color-muted, #5c6879); font-size: 12px; line-height: 1.4; white-space: nowrap; }',
      '.nviz-chart-demo__button { box-sizing: border-box; min-height: 34px; max-width: 100%; padding: 6px 12px; border: 1px solid var(--hnv-color-border, #dce2ea); border-radius: var(--hnv-radius-control, 8px); background: var(--hnv-color-surface, #ffffff); color: var(--hnv-color-ink, #202938); font-family: inherit; font-size: 13px; line-height: 1.4; white-space: normal; overflow-wrap: anywhere; cursor: pointer; touch-action: manipulation; }',
      '.nviz-chart-demo__button:hover { background: var(--hnv-color-page, #f4f6f9); border-color: var(--hnv-color-attention, #6f82b7); }',
      '.nviz-chart-demo__button[aria-pressed="true"] { border-color: var(--hnv-color-accent, #315cda); background: var(--hnv-color-accent-soft, #eef2ff); color: var(--hnv-color-accent, #315cda); font-weight: 600; }',
      '.nviz-chart-demo__button:focus-visible { outline: 3px solid var(--hnv-color-focus, #315cda); outline-offset: 2px; }',
      '.nviz-chart-demo__button:disabled { opacity: 0.55; cursor: not-allowed; }',
      '.nviz-chart-demo__status { margin: 0; min-height: 21px; color: var(--hnv-color-muted, #5c6879); font-size: 13px; line-height: 1.55; }',
      '.nviz-chart-demo__status strong { color: var(--hnv-color-ink, #202938); font-weight: 600; }',
      '.nviz-chart-demo__hint { margin: 0; color: var(--hnv-color-muted, #5c6879); font-size: 12px; line-height: 1.55; }',
      '.nviz-chart-demo__chart { min-width: 0; max-width: 100%; }'
    ].join('\n');
    root.appendChild(style);

    var toolbar = element('div', 'nviz-chart-demo__toolbar');
    toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', '图表演示控制');
    var typeRow = element('div', 'nviz-chart-demo__row');
    var dataRow = element('div', 'nviz-chart-demo__row');
    var emphasisRow = element('div', 'nviz-chart-demo__row');
    toolbar.appendChild(typeRow);
    toolbar.appendChild(dataRow);
    toolbar.appendChild(emphasisRow);

    function group(labelText, row) {
      var groupNode = element('div', 'nviz-chart-demo__group');
      groupNode.appendChild(element('span', 'nviz-chart-demo__group-label', labelText));
      row.appendChild(groupNode);
      return groupNode;
    }

    function listen(target, type, handler) {
      target.addEventListener(type, handler);
      listeners.push({ target: target, type: type, handler: handler });
    }

    function button(parent, label, handler) {
      var node = element('button', 'nviz-chart-demo__button', label);
      node.type = 'button';
      listen(node, 'click', handler);
      parent.appendChild(node);
      return node;
    }

    var typeGroup = group('类型', typeRow);
    var typeButtons = {};
    ['bar', 'line', 'scatter', 'pie'].forEach(function (type) {
      typeButtons[type] = button(typeGroup, TYPE_LABEL[type], function () {
        if (destroyed) return;
        currentType = type;
        currentVariant = 'default';
        if (emphasisOn) {
          emphasis = emphasisDefault(currentType, currentVariant);
        } else {
          emphasis = { focus: null, changed: null };
        }
        apply();
      });
    });

    var dataGroup = group('数据', dataRow);
    var changeButton = button(dataGroup, '换数据', function () {
      if (destroyed) return;
      currentVariant = currentVariant === 'alt' ? 'default' : 'alt';
      resetEmphasisForData();
      apply();
    });
    var longButton = button(dataGroup, '长标签', function () {
      if (destroyed) return;
      currentVariant = 'long';
      resetEmphasisForData();
      apply();
    });
    var negativeButton = button(dataGroup, '负值', function () {
      if (destroyed) return;
      if (currentType === 'pie') currentType = 'bar';
      currentVariant = 'negative';
      resetEmphasisForData();
      apply();
    });
    var emptyButton = button(dataGroup, '空数据', function () {
      if (destroyed) return;
      currentVariant = 'empty';
      emphasis = { focus: null, changed: null };
      apply();
    });
    var resetButton = button(dataGroup, '恢复默认', function () {
      if (destroyed) return;
      currentType = 'bar';
      currentVariant = 'default';
      tableOn = true;
      emphasisOn = true;
      emphasis = emphasisDefault(currentType, currentVariant);
      shouldOpenTable = true;
      apply();
    });

    var emphasisGroup = group('强调', emphasisRow);
    var focusButton = button(emphasisGroup, '关注', function () {
      if (destroyed || currentVariant === 'empty') return;
      var defaults = emphasisDefault(currentType, currentVariant);
      emphasis.focus = defaults.focus;
      emphasisOn = true;
      apply();
    });
    var changedButton = button(emphasisGroup, '本步变化', function () {
      if (destroyed || currentVariant === 'empty') return;
      var defaults = emphasisDefault(currentType, currentVariant);
      emphasis.changed = defaults.changed;
      emphasisOn = true;
      apply();
    });
    var clearButton = button(emphasisGroup, '清除强调', function () {
      if (destroyed) return;
      emphasisOn = false;
      emphasis = { focus: null, changed: null };
      apply();
    });
    var viewGroup = group('视图', emphasisRow);
    var tableButton = button(viewGroup, '数据表', function () {
      if (destroyed) return;
      tableOn = !tableOn;
      if (tableOn) shouldOpenTable = true;
      apply();
    });

    var status = element('p', 'nviz-chart-demo__status');
    status.setAttribute('aria-live', 'polite');
    var chartHost = element('div', 'nviz-chart-demo__chart');
    var hint = element('p', 'nviz-chart-demo__hint',
      '图表只随按钮静态更新；图例、描边和就地标签共同标出关注与变化。有数据时展开图表下方“数据表”可核对原始数值。');
    var chart = null;

    root.appendChild(toolbar);
    root.appendChild(status);
    root.appendChild(chartHost);
    root.appendChild(hint);
    host.appendChild(root);

    function resetEmphasisForData() {
      if (emphasisOn) emphasis = emphasisDefault(currentType, currentVariant);
      else emphasis = { focus: null, changed: null };
    }

    function dataSummary(type, variant) {
      if (variant === 'empty') return '无数据';
      var source = sourceFor(type, variant);
      if (type === 'pie') return (source.data ? source.data.length : 0) + ' 个扇区';
      if (type === 'scatter') {
        var count = 0;
        (source.series || []).forEach(function (series) {
          count += series.points ? series.points.length : 0;
        });
        return (source.series ? source.series.length : 0) + ' 个系列、' + count + ' 个点';
      }
      return (source.series ? source.series.length : 0) + ' 个系列、' +
        (source.labels ? source.labels.length : 0) + ' 个类别';
    }

    function emphasisSummary() {
      if (!emphasisOn || (!emphasis.focus && !emphasis.changed)) return '未设置关注与变化';
      var source = sourceFor(currentType, currentVariant);
      var parts = [];
      function seriesLabel(key) {
        var list = source.series || [];
        for (var i = 0; i < list.length; i += 1) {
          if (list[i].key === key) return list[i].label;
        }
        return key || '';
      }
      function categoryLabel(index) {
        if (currentType === 'pie') return source.data && source.data[index] ? source.data[index].label : ('第 ' + (index + 1) + ' 项');
        if (currentType === 'scatter') return '第 ' + (index + 1) + ' 个点';
        return source.labels && source.labels[index] ? source.labels[index] : ('第 ' + (index + 1) + ' 项');
      }
      if (emphasis.focus) {
        if (currentType === 'pie') {
          parts.push('关注 ' + categoryLabel(emphasis.focus.index));
        } else if (currentType === 'scatter') {
          parts.push('关注 ' + (emphasis.focus.series ? seriesLabel(emphasis.focus.series) : '') +
            (emphasis.focus.index !== undefined && emphasis.focus.index !== null ? ' 第 ' + (emphasis.focus.index + 1) + ' 点' : ''));
        } else {
          parts.push('关注 ' + (emphasis.focus.series ? seriesLabel(emphasis.focus.series) : '') +
            (emphasis.focus.index !== undefined && emphasis.focus.index !== null ? ' ' + categoryLabel(emphasis.focus.index) : ''));
        }
      }
      if (emphasis.changed) {
        if (currentType === 'pie') {
          parts.push('变化 ' + categoryLabel(emphasis.changed.index));
        } else if (currentType === 'scatter') {
          parts.push('变化 ' + (emphasis.changed.series ? seriesLabel(emphasis.changed.series) + ' ' : '') +
            (emphasis.changed.index !== undefined && emphasis.changed.index !== null ? '第 ' + (emphasis.changed.index + 1) + ' 点' : ''));
        } else {
          parts.push('变化 ' + (emphasis.changed.series ? seriesLabel(emphasis.changed.series) : '') +
            (emphasis.changed.index !== undefined && emphasis.changed.index !== null ? ' ' + categoryLabel(emphasis.changed.index) : ''));
        }
      }
      return parts.join('；');
    }

    function updateStatus() {
      var tableStatus = currentVariant === 'empty'
        ? '数据表：无数据'
        : '数据表' + (tableOn ? '开' : '关');
      var parts = [
        TYPE_LABEL[currentType],
        VARIANT_LABEL[currentVariant] || currentVariant,
        dataSummary(currentType, currentVariant),
        emphasisSummary(),
        tableStatus
      ];
      status.textContent = parts.join(' · ');
    }

    function syncButtons() {
      ['bar', 'line', 'scatter', 'pie'].forEach(function (type) {
        typeButtons[type].setAttribute('aria-pressed', type === currentType ? 'true' : 'false');
      });
      changeButton.setAttribute('aria-pressed', currentVariant === 'alt' ? 'true' : 'false');
      longButton.setAttribute('aria-pressed', currentVariant === 'long' ? 'true' : 'false');
      negativeButton.setAttribute('aria-pressed', currentVariant === 'negative' ? 'true' : 'false');
      emptyButton.setAttribute('aria-pressed', currentVariant === 'empty' ? 'true' : 'false');
      focusButton.setAttribute('aria-pressed', emphasisOn && emphasis.focus ? 'true' : 'false');
      changedButton.setAttribute('aria-pressed', emphasisOn && emphasis.changed ? 'true' : 'false');
      clearButton.setAttribute('aria-pressed', !emphasisOn ? 'true' : 'false');
      tableButton.setAttribute('aria-pressed', tableOn ? 'true' : 'false');
      var empty = currentVariant === 'empty';
      tableButton.textContent = empty ? '数据表：无数据' : (tableOn ? '数据表：开' : '数据表：关');
      tableButton.disabled = empty;
      focusButton.disabled = empty;
      changedButton.disabled = empty;
      clearButton.disabled = empty;
    }

    function openTableIfNeeded() {
      if (!shouldOpenTable || !tableOn || !chart) return;
      var details = chart.el.querySelector('.nviz-chart__table');
      if (details) details.open = true;
      shouldOpenTable = false;
    }

    function patchForCurrent() {
      var source = cloneData(sourceFor(currentType, currentVariant));
      var patch = {
        type: currentType,
        data: source.data,
        series: source.series,
        labels: source.labels,
        label: labelFor(currentType, currentVariant),
        unit: currentVariant === 'empty' || currentType === 'scatter' ? '' : '万件',
        xLabel: currentType === 'scatter' ? '投入指数' : '',
        yLabel: currentType === 'scatter' ? '产出指数' : '',
        colors: null,
        height: 320,
        table: tableOn,
        focus: emphasisOn ? emphasis.focus : null,
        changed: emphasisOn ? emphasis.changed : null,
        animate: false
      };
      return patch;
    }

    function apply() {
      if (destroyed) return;
      chart.update(patchForCurrent());
      syncButtons();
      updateStatus();
      openTableIfNeeded();
    }

    if (!window.NoteViz || !window.NoteViz.Chart) {
      var error = element('p', 'nviz-chart-demo__hint', '图表组件未加载：请先加载 src/viz/chart.js。');
      root.appendChild(error);
      return {
        destroy: function () {
          destroyed = true;
          for (var i = listeners.length - 1; i >= 0; i -= 1) {
            listeners[i].target.removeEventListener(listeners[i].type, listeners[i].handler);
          }
          listeners.length = 0;
          if (root.parentNode) root.parentNode.removeChild(root);
        }
      };
    }

    chart = window.NoteViz.Chart.mount(chartHost, patchForCurrent());
    syncButtons();
    updateStatus();
    openTableIfNeeded();

    return {
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        for (var i = listeners.length - 1; i >= 0; i -= 1) {
          listeners[i].target.removeEventListener(listeners[i].type, listeners[i].handler);
        }
        listeners.length = 0;
        if (chart) {
          chart.destroy();
          chart = null;
        }
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  };
})();
