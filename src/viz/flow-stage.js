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
    statusList = shared.statusList, setAttributeIf = shared.setAttributeIf, setTextIf = shared.setTextIf;

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
      setAttributeIf(root, 'aria-label', textOrEmpty(model.label) || '阶段轨');
      var labels = statusLabels();
      var stages = normalizeStages();
      var stageIndexById = Object.create(null);
      stages.forEach(function (stage, index) { stageIndexById[stage.id] = index; });
      var currentId = textOrEmpty(model.current);
      var currentIndex = own(stageIndexById, currentId) ? stageIndexById[currentId] : -1;
      var targetId = textOrEmpty(model.target);
      var skippedSet = statusList(model.skipped);
      var failedSet = statusList(model.failed);
      var countText = String(Math.max(1, stages.length));
      if (list.style.getPropertyValue('--nviz-flow-stagetrack-count') !== countText) {
        list.style.setProperty('--nviz-flow-stagetrack-count', countText);
      }

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
          node.__nvizFlowCache = Object.create(null);
          stageNodes.set(stage.id, node);
        }
        seen[stage.id] = true;
        var cache = node.__nvizFlowCache || (node.__nvizFlowCache = Object.create(null));
        var status = deriveStatus(stage, index, currentIndex, skippedSet, failedSet);
        setAttributeIf(node, 'data-status', status);
        setAttributeIf(node, 'data-index', String(index));
        setAttributeIf(node, 'aria-current', status === 'current' ? 'step' : null);
        var isTarget = !!targetId && stage.id === targetId;
        setAttributeIf(node, 'data-target', isTarget ? 'true' : null);
        var labelText = stage.label || stage.id;
        var statusText = labels[status] || status;
        var labelNode = node.querySelector('.nviz-flow-stagetrack__label');
        var statusNode = node.querySelector('.nviz-flow-stagetrack__status');
        if (cache.labelText !== labelText) { setTextIf(labelNode, labelText); cache.labelText = labelText; }
        if (cache.statusText !== statusText) { setTextIf(statusNode, statusText); cache.statusText = statusText; }
        var badge = node.querySelector('.nviz-flow-stagetrack__badge');
        var badgeText = isTarget ? '目标' : '';
        if (cache.badgeText !== badgeText) {
          badge.textContent = badgeText;
          cache.badgeText = badgeText;
        }
        if (badge.hidden) badge.hidden = false;
        setAttributeIf(badge, 'data-empty', isTarget ? 'false' : 'true');
      });
      Array.from(stageNodes.keys()).forEach(function (id) {
        if (seen[id]) return;
        var node = stageNodes.get(id);
        if (node && node.parentNode) node.parentNode.removeChild(node);
        stageNodes.delete(id);
      });
      var desiredStages = stages.map(function (stage) { return stageNodes.get(stage.id); });
      var currentStages = Array.prototype.slice.call(list.children);
      var sameStageOrder = desiredStages.length === currentStages.length &&
        desiredStages.every(function (node, index) { return node === currentStages[index]; });
      if (!sameStageOrder) {
        desiredStages.forEach(function (node) { if (node) list.appendChild(node); });
      }

      var normalizedBypass = normalizeBypasses(stageIndexById);
      var bypassSeen = Object.create(null);
      var labelsById = Object.create(null);
      stages.forEach(function (stage) { labelsById[stage.id] = stage.label || stage.id; });
      var desiredBypasses = [];
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
        desiredBypasses.push(row);
        setAttributeIf(row, 'data-from', item.from);
        setAttributeIf(row, 'data-to', item.to);
        var fromIndex = stageIndexById[item.from];
        var toIndex = stageIndexById[item.to];
        var total = Math.max(1, stages.length);
        var fx = ((fromIndex + 0.5) / total) * 1000;
        var tx = ((toIndex + 0.5) / total) * 1000;
        var lift = clamp(Math.abs(tx - fx) / 8, 8, 44);
        var path = row.querySelector('.nviz-flow-stagetrack__bypass-path');
        setAttributeIf(path, 'd', 'M ' + fx.toFixed(1) + ' 3 C ' + fx.toFixed(1) + ' ' + (3 + lift).toFixed(1) +
          ', ' + tx.toFixed(1) + ' ' + (17 - lift).toFixed(1) + ', ' + tx.toFixed(1) + ' 17');
        var arrowX = tx;
        setAttributeIf(row.querySelector('.nviz-flow-stagetrack__bypass-arrow'), 'd',
          'M ' + (arrowX - 4).toFixed(1) + ' 13 L ' + (arrowX + 4).toFixed(1) + ' 13 L ' + arrowX.toFixed(1) + ' 19 Z');
        setAttributeIf(row.querySelector('.nviz-flow-stagetrack__bypass-endpoint.is-from'), 'cx', fx.toFixed(1));
        setAttributeIf(row.querySelector('.nviz-flow-stagetrack__bypass-endpoint.is-from'), 'cy', '3');
        setAttributeIf(row.querySelector('.nviz-flow-stagetrack__bypass-endpoint.is-to'), 'cx', tx.toFixed(1));
        setAttributeIf(row.querySelector('.nviz-flow-stagetrack__bypass-endpoint.is-to'), 'cy', '17');
        var bypassLabel = item.label || ('旁路：' + (labelsById[item.from] || item.from) + ' → ' + (labelsById[item.to] || item.to));
        setTextIf(row.querySelector('.nviz-flow-stagetrack__bypass-label'), bypassLabel);
        setAttributeIf(row, 'aria-label', bypassLabel);
      });
      Array.from(bypassNodes.keys()).forEach(function (key) {
        if (bypassSeen[key]) return;
        var row = bypassNodes.get(key);
        if (row && row.parentNode) row.parentNode.removeChild(row);
        bypassNodes.delete(key);
      });
      var currentBypasses = Array.prototype.slice.call(bypasses.children);
      var sameBypassOrder = desiredBypasses.length === currentBypasses.length &&
        desiredBypasses.every(function (row, index) { return row === currentBypasses[index]; });
      if (!sameBypassOrder) {
        desiredBypasses.forEach(function (row) { bypasses.appendChild(row); });
      }
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
