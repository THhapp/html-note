/* NoteBlocks B10 — ChartExplain.
 * Composes public NoteBlocks.StepPlayer, NoteViz.Chart and NoteUI.Notice.
 * Chart data is host-owned and stays unchanged between stops; each stop only
 * changes chart focus/changed marks and the caption. No automatic playback,
 * no derived trends, no multiple simultaneous value changes.
 * Loads after src/blocks/shared.js (internal helpers, not a public entry).
 */
(function (global) {
  'use strict';

  var NoteBlocks = global.NoteBlocks = global.NoteBlocks || {};

  var shared = global.NoteBlocksInternals;
  if (!shared) {
    throw new Error('NoteBlocks 组合块需要先加载 src/blocks/shared.js（内部共享文件）。');
  }
  var ui = shared.ui;
  var viz = shared.viz;
  var own = shared.own;
  var text = shared.text;
  var make = shared.make;
  var validateHost = shared.validateHost;
  var requireComponents = shared.requireComponents;
  var safeDestroy = shared.safeDestroy;
  var stepArray = shared.stepArray;
  var stepWrappers = shared.stepWrappers;

  var CHART_DEFAULTS = {
    type: 'bar',
    data: null,
    series: null,
    labels: null,
    height: 300,
    valueFormat: null,
    table: true,
    label: '',
    unit: '',
    xLabel: '',
    yLabel: ''
  };

  function normalizeChart(value) {
    var result = Object.assign({}, CHART_DEFAULTS);
    if (value && typeof value === 'object') {
      Object.keys(value).forEach(function (key) { result[key] = value[key]; });
    }
    if (!own(value || {}, 'table')) result.table = true;
    return result;
  }

  NoteBlocks.ChartExplain = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host, 'NoteBlocks.ChartExplain');
      requireComponents('NoteBlocks.ChartExplain', ['NoteViz.Chart', 'NoteUI.Notice', 'NoteBlocks.StepPlayer']);
      var UI = ui();
      var V = viz();
      var input = options || {};
      var state = {
        chart: normalizeChart(input.chart),
        steps: stepArray(input.steps),
        title: input.title == null ? '' : input.title,
        labels: input.labels && typeof input.labels === 'object' ? input.labels : null,
        onStep: typeof input.onStep === 'function' ? input.onStep : null,
        maxWidth: input.maxWidth == null ? null : input.maxWidth,
        label: input.label == null ? '' : text(input.label)
      };
      var destroyed = false;
      var player = null;
      var refs = { chart: null, step: null };

      function chartOptions(step) {
        var chart = state.chart;
        return {
          type: chart.type,
          data: chart.data,
          series: chart.series,
          labels: chart.labels,
          focus: step && step.focus != null ? step.focus : null,
          changed: step && step.changed != null ? step.changed : null,
          colors: chart.colors,
          height: chart.height,
          valueFormat: chart.valueFormat,
          table: chart.table !== false,
          label: chart.label == null ? '' : chart.label,
          unit: chart.unit == null ? '' : chart.unit,
          xLabel: chart.xLabel == null ? '' : chart.xLabel,
          yLabel: chart.yLabel == null ? '' : chart.yLabel,
          animate: false
        };
      }

      function render(step, context) {
        refs = { chart: null, step: step || null };
        var wrap = make('div', 'nblk-chart-explain__layout');
        var chartHost = make('div', 'nblk-chart-explain__chart');
        var chartInstance = V.Chart.mount(chartHost, chartOptions(step));
        refs.chart = chartInstance;
        wrap.appendChild(chartHost);

        var tableEnabled = state.chart.table !== false;
        if (tableEnabled) {
          wrap.appendChild(make('p', 'nblk-chart-explain__hint',
            '停点切换会重新挂载图表，数据表因此回到关闭状态；展开后可核对完整读数。'));
        }

        var noteNotice = null;
        if (step && step.note != null && text(step.note).trim()) {
          var noteHost = make('div', 'nblk-chart-explain__note');
          noteNotice = UI.Notice.mount(noteHost, {
            title: '本步说明',
            content: step.note,
            tone: 'neutral'
          });
          wrap.appendChild(noteHost);
        }

        context.stageEl.appendChild(wrap);

        return function cleanup() {
          safeDestroy(noteNotice);
          safeDestroy(chartInstance);
          refs = { chart: null, step: null };
          wrap.remove();
        };
      }

      player = NoteBlocks.StepPlayer.mount(host, {
        steps: stepWrappers(state.steps),
        render: render,
        initialIndex: 0,
        labels: state.labels || undefined,
        onStep: function (index, wrapper, event) {
          if (destroyed) return;
          if (typeof state.onStep === 'function') {
            state.onStep(index, wrapper && wrapper.state ? wrapper.state : null, event);
          }
        },
        title: state.title,
        maxWidth: state.maxWidth,
        label: state.label || '图表讲解'
      });
      player.el.classList.add('nblk-chart-explain');

      function currentStep() {
        if (destroyed || !player) return null;
        var wrapper = player.getStep();
        return wrapper && wrapper.state ? wrapper.state : null;
      }

      function getTarget(id) {
        if (destroyed || !refs.chart || id == null) return null;
        var key = text(id);
        var step = currentStep();
        if (step && step.id != null && key === text(step.id)) return refs.chart.el;
        if (key === 'chart') return refs.chart.el;
        return typeof refs.chart.getTarget === 'function' ? refs.chart.getTarget(key) : null;
      }

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        if (own(patch, 'chart')) state.chart = normalizeChart(patch.chart);
        if (own(patch, 'steps')) state.steps = stepArray(patch.steps);
        if (own(patch, 'title')) state.title = patch.title == null ? '' : patch.title;
        if (own(patch, 'labels')) state.labels = patch.labels && typeof patch.labels === 'object' ? patch.labels : null;
        if (own(patch, 'onStep')) state.onStep = typeof patch.onStep === 'function' ? patch.onStep : null;
        if (own(patch, 'maxWidth')) state.maxWidth = patch.maxWidth;
        if (own(patch, 'label')) state.label = patch.label == null ? '' : text(patch.label);

        var stepsChanged = own(patch, 'chart') || own(patch, 'steps');
        var playerPatch = {
          title: state.title,
          maxWidth: state.maxWidth,
          label: state.label || '图表讲解'
        };
        if (stepsChanged) playerPatch.steps = stepWrappers(state.steps);
        if (own(patch, 'labels')) playerPatch.labels = state.labels;
        player.update(playerPatch);
      }

      function destroyBlock() {
        if (destroyed) return;
        destroyed = true;
        refs = { chart: null, step: null };
        safeDestroy(player);
        player = null;
      }

      return {
        el: player.el,
        go: function (index) { if (!destroyed) player.go(index); },
        next: function () { if (!destroyed) player.next(); },
        prev: function () { if (!destroyed) player.prev(); },
        replay: function () { if (!destroyed) player.replay(); },
        reset: function () { if (!destroyed) player.reset(); },
        getStep: currentStep,
        getTarget: getTarget,
        update: update,
        destroy: destroyBlock
      };
    }
  };
})(window);
