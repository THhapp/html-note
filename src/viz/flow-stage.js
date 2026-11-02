/*!
 * NoteViz Flow — StageTrack.
 * Scope: window.NoteViz.Flow; shared helpers live in flow-core.js.
 * Plain classic script, no modules/network/eval/third-party. Load after flow-core.js.
 */
(function (global) {
  'use strict';

  var NoteViz = global.NoteViz = global.NoteViz || {};
  var shared = global.NoteVizFlowInternals;
  var VERSION = shared && shared.version ? shared.version : '1.0.0';
  if (!shared) throw new Error('NoteViz.Flow StageTrack 需要先加载 src/viz/flow-core.js。');
  var text = shared.text, own = shared.own, array = shared.array, isNode = shared.isNode,
    el = shared.el, svgEl = shared.svgEl, setAttrs = shared.setAttrs, setText = shared.setText,
    clear = shared.clear, numberOr = shared.numberOr, clamp = shared.clamp, textOrEmpty = shared.textOrEmpty,
    uniqueId = shared.uniqueId, validateHost = shared.validateHost, defaultId = shared.defaultId,
    component = shared.component, makeSvgAccessible = shared.makeSvgAccessible,
    setViewportMessage = shared.setViewportMessage, normalizeStatus = shared.normalizeStatus,
    statusList = shared.statusList;

  /* ---------------- StageTrack ---------------- */

  var STAGE_STATUS_LABELS = {
    pending: '待处理',
    current: '当前',
    done: '完成',
    skipped: '跳过',
    failed: '失败'
  };

  var StageTrack = {};
  StageTrack.version = VERSION;
  StageTrack.mount = function (host, options) {
    validateHost(host, 'NoteViz.Flow.StageTrack');
    var root = el('div', 'nviz-flow-stagetrack');
    root.setAttribute('role', 'group');
    var list = el('ol', 'nviz-flow-stagetrack__list');
    var bypasses = el('div', 'nviz-flow-stagetrack__bypasses');
    var note = el('p', 'nviz-flow-stagetrack__note');
    note.hidden = true;
    root.append(list, bypasses, note);
    host.appendChild(root);

    var model = Object.assign({
      stages: [],
      current: null,
      target: null,
      skipped: null,
      failed: null,
      bypass: [],
      statusLabels: null,
      label: '阶段轨'
    }, options || {});

    var stageNodes = new Map();
    var bypassNodes = new Map();

    function statusLabels() {
      var labels = Object.assign({}, STAGE_STATUS_LABELS);
      if (model.statusLabels && typeof model.statusLabels === 'object') {
        Object.keys(model.statusLabels).forEach(function (key) {
          var value = textOrEmpty(model.statusLabels[key]);
          if (value) labels[normalizeStatus(key)] = value;
        });
      }
      return labels;
    }

    function normalizeStages() {
      return array(model.stages).map(function (source, index) {
        var item = source && typeof source === 'object' && !isNode(source) ? source : {};
        var id = textOrEmpty(item.id) || defaultId('stage', index);
        var label = item.label == null ? id : text(item.label);
        var status = textOrEmpty(item.status);
        return { id: id, label: label, status: status || null, raw: item };
      });
    }

    function normalizeBypasses(stageIndexById) {
      var valid = [];
      var invalid = 0;
      array(model.bypass).forEach(function (source, index) {
        var item = source && typeof source === 'object' ? source : {};
        var from = textOrEmpty(item.from);
        var to = textOrEmpty(item.to);
        if (!from || !to || !own(stageIndexById, from) || !own(stageIndexById, to)) {
          invalid += 1;
          return;
        }
        valid.push({
          from: from,
          to: to,
          label: item.label == null ? '' : text(item.label),
          key: 'bypass:' + from + '>' + to,
          index: index
        });
      });
      return { valid: valid, invalid: invalid };
    }

    function deriveStatus(stage, index, currentIndex, skippedSet, failedSet) {
      if (stage.status) return normalizeStatus(stage.status);
      if (failedSet[stage.id]) return 'failed';
      if (skippedSet[stage.id]) return 'skipped';
      if (currentIndex >= 0 && index === currentIndex) return 'current';
      if (currentIndex >= 0 && index < currentIndex) return 'done';
      return 'pending';
    }

    function render() {
      root.setAttribute('aria-label', textOrEmpty(model.label) || '阶段轨');
      var labels = statusLabels();
      var stages = normalizeStages();
      var stageIndexById = Object.create(null);
      stages.forEach(function (stage, index) { stageIndexById[stage.id] = index; });
      var currentId = textOrEmpty(model.current);
      var currentIndex = own(stageIndexById, currentId) ? stageIndexById[currentId] : -1;
      var targetId = textOrEmpty(model.target);
      var skippedSet = statusList(model.skipped);
      var failedSet = statusList(model.failed);
      list.style.setProperty('--nviz-flow-stagetrack-count', String(Math.max(1, stages.length)));

      var seen = Object.create(null);
      stages.forEach(function (stage, index) {
        var node = stageNodes.get(stage.id);
        if (!node) {
          node = el('li', 'nviz-flow-stagetrack__stage');
          node.setAttribute('data-id', stage.id);
          node.appendChild(el('span', 'nviz-flow-stagetrack__node'));
          node.appendChild(el('span', 'nviz-flow-stagetrack__label'));
          node.appendChild(el('span', 'nviz-flow-stagetrack__status'));
          node.appendChild(el('span', 'nviz-flow-stagetrack__badge'));
          stageNodes.set(stage.id, node);
        }
        seen[stage.id] = true;
        var status = deriveStatus(stage, index, currentIndex, skippedSet, failedSet);
        node.setAttribute('data-status', status);
        node.setAttribute('data-index', String(index));
        if (status === 'current') node.setAttribute('aria-current', 'step');
        else node.removeAttribute('aria-current');
        if (targetId && stage.id === targetId) node.setAttribute('data-target', 'true');
        else node.removeAttribute('data-target');
        setText(node.querySelector('.nviz-flow-stagetrack__label'), stage.label || stage.id);
        setText(node.querySelector('.nviz-flow-stagetrack__status'), labels[status] || status);
        var badge = node.querySelector('.nviz-flow-stagetrack__badge');
        var isTarget = targetId && stage.id === targetId;
        badge.textContent = isTarget ? '目标' : '';
        badge.hidden = !isTarget;
        if (node.parentNode !== list) list.appendChild(node);
      });
      Array.from(stageNodes.keys()).forEach(function (id) {
        if (seen[id]) return;
        var node = stageNodes.get(id);
        if (node && node.parentNode) node.parentNode.removeChild(node);
        stageNodes.delete(id);
      });
      /* Keep visual order equal to the host array while reusing the same nodes. */
      stages.forEach(function (stage) {
        var node = stageNodes.get(stage.id);
        if (node) list.appendChild(node);
      });

      var normalizedBypass = normalizeBypasses(stageIndexById);
      var bypassSeen = Object.create(null);
      var labelsById = Object.create(null);
      stages.forEach(function (stage) { labelsById[stage.id] = stage.label || stage.id; });
      normalizedBypass.valid.forEach(function (item) {
        var row = bypassNodes.get(item.key);
        if (!row) {
          row = el('div', 'nviz-flow-stagetrack__bypass');
          row.setAttribute('data-key', item.key);
          row.setAttribute('role', 'group');
          var svg = svgEl('svg', { class: 'nviz-flow-stagetrack__bypass-svg', viewBox: '0 0 1000 20', preserveAspectRatio: 'none' });
          svg.appendChild(svgEl('path', { class: 'nviz-flow-stagetrack__bypass-path' }));
          svg.appendChild(svgEl('path', { class: 'nviz-flow-stagetrack__bypass-arrow' }));
          var sourceDot = svgEl('circle', { class: 'nviz-flow-stagetrack__bypass-endpoint is-from', r: '2.6' });
          var targetDot = svgEl('circle', { class: 'nviz-flow-stagetrack__bypass-endpoint is-to', r: '2.6' });
          svg.appendChild(sourceDot);
          svg.appendChild(targetDot);
          row.appendChild(svg);
          row.appendChild(el('span', 'nviz-flow-stagetrack__bypass-label'));
          bypasses.appendChild(row);
          bypassNodes.set(item.key, row);
        }
        bypassSeen[item.key] = true;
        row.setAttribute('data-from', item.from);
        row.setAttribute('data-to', item.to);
        var fromIndex = stageIndexById[item.from];
        var toIndex = stageIndexById[item.to];
        var total = Math.max(1, stages.length);
        var fx = ((fromIndex + 0.5) / total) * 1000;
        var tx = ((toIndex + 0.5) / total) * 1000;
        var lift = clamp(Math.abs(tx - fx) / 8, 8, 44);
        var path = row.querySelector('.nviz-flow-stagetrack__bypass-path');
        path.setAttribute('d', 'M ' + fx.toFixed(1) + ' 3 C ' + fx.toFixed(1) + ' ' + (3 + lift).toFixed(1) +
          ', ' + tx.toFixed(1) + ' ' + (17 - lift).toFixed(1) + ', ' + tx.toFixed(1) + ' 17');
        var arrowX = tx;
        row.querySelector('.nviz-flow-stagetrack__bypass-arrow').setAttribute('d',
          'M ' + (arrowX - 4).toFixed(1) + ' 13 L ' + (arrowX + 4).toFixed(1) + ' 13 L ' + arrowX.toFixed(1) + ' 19 Z');
        setAttrs(row.querySelector('.nviz-flow-stagetrack__bypass-endpoint.is-from'), { cx: fx.toFixed(1), cy: '3' });
        setAttrs(row.querySelector('.nviz-flow-stagetrack__bypass-endpoint.is-to'), { cx: tx.toFixed(1), cy: '17' });
        var bypassLabel = item.label || ('旁路：' + (labelsById[item.from] || item.from) + ' → ' + (labelsById[item.to] || item.to));
        setText(row.querySelector('.nviz-flow-stagetrack__bypass-label'), bypassLabel);
        row.setAttribute('aria-label', bypassLabel);
      });
      Array.from(bypassNodes.keys()).forEach(function (key) {
        if (bypassSeen[key]) return;
        var row = bypassNodes.get(key);
        if (row && row.parentNode) row.parentNode.removeChild(row);
        bypassNodes.delete(key);
      });
      setViewportMessage(note, normalizedBypass.invalid
        ? '已跳过 ' + normalizedBypass.invalid + ' 条引用未知阶段的显式旁路。'
        : '');
    }

    var instance = component(root, model, render, function () {
      stageNodes.clear();
      bypassNodes.clear();
    });
    instance.getTarget = function (id) {
      if (instance.destroyed || id == null) return null;
      var key = text(id);
      if (stageNodes.has(key)) return stageNodes.get(key);
      if (bypassNodes.has(key)) return bypassNodes.get(key);
      if (key === 'track') return list;
      if (key === 'bypasses') return bypasses;
      return null;
    };
    instance.getState = function () {
      if (instance.destroyed) return null;
      var stages = normalizeStages();
      var stageIndexById = Object.create(null);
      stages.forEach(function (stage, index) { stageIndexById[stage.id] = index; });
      var skippedSet = statusList(model.skipped);
      var failedSet = statusList(model.failed);
      var current = textOrEmpty(model.current);
      var target = textOrEmpty(model.target);
      var currentIndex = own(stageIndexById, current) ? stageIndexById[current] : -1;
      var bypass = normalizeBypasses(stageIndexById);
      return {
        stages: stages.map(function (stage, index) {
          var status = deriveStatus(stage, index, currentIndex, skippedSet, failedSet);
          return { id: stage.id, label: stage.label, status: status, target: !!target && stage.id === target };
        }),
        current: own(stageIndexById, current) ? current : null,
        target: own(stageIndexById, target) ? target : null,
        skipped: stages.filter(function (stage) { return skippedSet[stage.id]; }).map(function (stage) { return stage.id; }),
        failed: stages.filter(function (stage) { return failedSet[stage.id]; }).map(function (stage) { return stage.id; }),
        bypass: bypass.valid.map(function (item) { return { from: item.from, to: item.to, label: item.label, id: item.key }; }),
        invalidBypass: bypass.invalid
      };
    };

    render({});
    return instance;
  };


  NoteViz.Flow = NoteViz.Flow || {};
  NoteViz.Flow.StageTrack = StageTrack;
})(window);
