/*! note-library module: viz-flow
 * dependencies: core
 * type: JavaScript
 * generated-by: scripts/build.mjs; do-not-edit.
 */

/* ---- source: src/viz/flow-core.js ---- */
/*!
 * NoteViz Flow — shared foundation (helpers, namespace, Propagation).
 * Scope: window.NoteViz.Flow namespace + window.NoteVizFlowInternals.
 * Four graphics live in flow-stage.js / flow-packet.js / flow-segment.js / flow-device.js.
 * Optional dependency: window.NoteCore.component; local fallback otherwise.
 * No network, no eval, no HTML parsing, no automatic playback.
 */
(function (global) {
  'use strict';

  var NoteViz = global.NoteViz = global.NoteViz || {};
  var Core = global.NoteCore || null;
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var VERSION = '1.0.0';
  NoteViz.Flow = NoteViz.Flow || {};

  /* ---------------- shared helpers ---------------- */

  function text(value) {
    return value == null ? '' : String(value);
  }

  function own(object, key) {
    return object != null && Object.prototype.hasOwnProperty.call(object, key);
  }

  function array(value) {
    return Array.isArray(value) ? value : [];
  }

  function isNode(value) {
    return !!value && (value.nodeType === 1 || value.nodeType === 3 || value.nodeType === 11);
  }

  function el(tag, className, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = text(content);
    return node;
  }

  function svgEl(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (name) {
        if (attrs[name] != null) node.setAttribute(name, String(attrs[name]));
      });
    }
    return node;
  }

  function setAttrs(node, attrs) {
    if (!node || !attrs) return node;
    Object.keys(attrs).forEach(function (name) {
      if (attrs[name] == null) node.removeAttribute(name);
      else node.setAttribute(name, String(attrs[name]));
    });
    return node;
  }

  function setText(node, value) {
    if (node) {
      var next = text(value);
      if (node.textContent !== next) node.textContent = next;
    }
  }

  /* 只在值真正变化时写属性/文字，避免同模型 update 产生无意义 DOM 变更。 */
  function setAttributeIf(node, name, value) {
    if (!node) return;
    if (value == null) {
      if (node.hasAttribute(name)) node.removeAttribute(name);
      return;
    }
    var next = String(value);
    if (node.getAttribute(name) !== next) node.setAttribute(name, next);
  }

  function setTextIf(node, value) {
    if (!node) return;
    var next = text(value);
    if (node.textContent !== next) node.textContent = next;
  }

  function clear(node) {
    if (!node) return node;
    if (typeof node.replaceChildren === 'function') node.replaceChildren();
    else node.textContent = '';
    return node;
  }

  function numberOr(value, fallback) {
    var number = typeof value === 'number' ? value : Number(value);
    return isFinite(number) ? number : fallback;
  }

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  function textOrEmpty(value) {
    return value == null ? '' : String(value).trim();
  }

  var uidCount = 0;
  function uniqueId(prefix) {
    var stem = prefix || 'nviz-flow';
    var id;
    do {
      uidCount += 1;
      id = stem + '-' + uidCount;
    } while (document.getElementById(id));
    return id;
  }

  function validateHost(host, name) {
    if (!host || host.nodeType !== 1 || typeof host.appendChild !== 'function') {
      throw new TypeError(name + ' 需要一个可追加的元素作为宿主。');
    }
  }

  function defaultId(prefix, index) {
    return prefix + '-' + (index + 1);
  }

  /* Local lifecycle fallback; NoteCore.component has the same contract when loaded. */
  function component(root, model, render, cleanup) {
    if (Core && typeof Core.component === 'function') {
      return Core.component(root, model, render, cleanup);
    }
    var destroyed = false;
    var instance = { el: root };
    Object.defineProperty(instance, 'destroyed', { enumerable: true, get: function () { return destroyed; } });
    instance.update = function (patch) {
      if (destroyed || !patch || typeof patch !== 'object') return;
      Object.keys(patch).forEach(function (key) {
        if (own(patch, key)) model[key] = patch[key];
      });
      render(patch);
    };
    instance.destroy = function () {
      if (destroyed) return;
      destroyed = true;
      try {
        if (typeof cleanup === 'function') cleanup();
      } finally {
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
    return instance;
  }

  function makeSvgAccessible(svg, titleText, descText, prefix) {
    var titleId = uniqueId((prefix || 'nviz-flow') + '-title');
    var descId = uniqueId((prefix || 'nviz-flow') + '-desc');
    var title = svgEl('title');
    var desc = svgEl('desc');
    title.id = titleId;
    desc.id = descId;
    title.textContent = text(titleText);
    desc.textContent = text(descText);
    svg.insertBefore(desc, svg.firstChild);
    svg.insertBefore(title, svg.firstChild);
    svg.setAttribute('aria-labelledby', titleId + ' ' + descId);
    svg.setAttribute('role', 'img');
    svg.setAttribute('focusable', 'false');
    return { title: title, desc: desc, titleId: titleId, descId: descId };
  }

  function setViewportMessage(node, message) {
    if (!node) return;
    var next = textOrEmpty(message);
    if (next) {
      if (node.textContent !== text(next)) node.textContent = text(next);
      if (node.hidden) node.hidden = false;
    } else {
      if (node.textContent !== '') node.textContent = '';
      if (!node.hidden) node.hidden = true;
    }
  }

  function normalizeStatus(value) {
    return textOrEmpty(value).toLowerCase().replace(/\s+/g, '-');
  }

  function statusList(value) {
    var set = Object.create(null);
    var list = Array.isArray(value) ? value : (value == null ? [] : [value]);
    list.forEach(function (item) {
      var key = textOrEmpty(item);
      if (key) set[key] = true;
    });
    return set;
  }


  /* ---------------- Propagation：沿 SVG path 的公共传播机制 ---------------- */

  var Propagation = {};
  Propagation.version = VERSION;
  Propagation.mount = function (host, options) {
    validateHost(host, 'NoteViz.Flow.Propagation');
    var model = Object.assign({
      path: null,
      paths: null,
      copies: 1,
      start: 0,
      end: 1,
      offset: 0,
      rotate: false,
      className: '',
      label: '传播'
    }, options || {});
    var destroyed = false;
    var svgHost = host.namespaceURI === SVG_NS ? host : null;
    var root = svgEl('g', { class: 'nviz-flow-propagation', role: 'group' });
    if (model.label) root.setAttribute('aria-label', text(model.label));
    var overlay = null;
    if (svgHost) {
      svgHost.appendChild(root);
    } else {
      overlay = svgEl('svg', { class: 'nviz-flow-propagation__host', 'aria-hidden': 'true' });
      overlay.appendChild(root);
      host.appendChild(overlay);
      svgHost = overlay;
    }
    var copyNodes = new Map();
    var pathNodes = new Map();
    var currentProgress = 0;

    function resolvePath(value) {
      if (!value) return null;
      if (value.nodeType === 1 && value.namespaceURI === SVG_NS) return value;
      if (typeof value !== 'string') return null;
      var node = value.charAt(0) === '#' ? document.getElementById(value.slice(1)) : document.querySelector(value);
      return node && node.namespaceURI === SVG_NS ? node : null;
    }

    function pathEntries() {
      var entries = [];
      if (model.path) entries.push({ id: '', path: resolvePath(model.path) });
      if (model.paths && typeof model.paths === 'object') {
        Object.keys(model.paths).forEach(function (key) {
          entries.push({ id: key, path: resolvePath(model.paths[key]) });
        });
      }
      entries = entries.filter(function (entry) { return !!entry.path; });
      entries.forEach(function (entry) {
        if (entry.id) pathNodes.set(entry.id, entry.path);
      });
      return entries;
    }

    function normalizeCopies() {
      var list;
      if (Array.isArray(model.copies)) list = model.copies;
      else {
        var count = Math.max(0, Math.floor(numberOr(model.copies, 1)));
        list = [];
        for (var i = 0; i < count; i += 1) list.push(null);
      }
      return list.map(function (source, index) {
        var item = source && typeof source === 'object' ? source : {};
        return {
          id: textOrEmpty(item.id) || defaultId('copy', index),
          pathId: item.pathId == null ? '' : text(item.pathId),
          path: item.path == null ? null : item.path,
          offset: item.offset,
          className: item.className == null ? '' : text(item.className),
          rotate: item.rotate
        };
      });
    }

    function offsetFor(copy, index) {
      if (copy.offset != null) return numberOr(copy.offset, 0);
      if (Array.isArray(model.offset)) return numberOr(model.offset[index], 0);
      return numberOr(model.offset, 0);
    }

    function copyPath(copy, entries) {
      if (copy.path) return resolvePath(copy.path);
      if (copy.pathId) {
        for (var i = 0; i < entries.length; i += 1) if (entries[i].id === copy.pathId) return entries[i].path;
        return pathNodes.get(copy.pathId) || null;
      }
      return entries.length ? entries[0].path : null;
    }

    function place(progress) {
      var value = typeof progress === 'number' ? progress : (progress && progress.progress);
      currentProgress = clamp(numberOr(value, 0), 0, 1);
      var entries = pathEntries();
      var copies = normalizeCopies();
      var seen = Object.create(null);
      copies.forEach(function (copy, index) {
        var node = copyNodes.get(copy.id);
        if (!node) {
          node = svgEl('g', { class: 'nviz-flow-propagation__copy', 'data-id': copy.id });
          node.appendChild(svgEl('circle', { class: 'nviz-flow-propagation__marker', r: 5 }));
          root.appendChild(node);
          copyNodes.set(copy.id, node);
        }
        if (copy.className) node.setAttribute('class', 'nviz-flow-propagation__copy ' + copy.className);
        else node.setAttribute('class', 'nviz-flow-propagation__copy');
        seen[copy.id] = true;
        var path = copyPath(copy, entries);
        var offset = offsetFor(copy, index);
        var ratio = model.start + (model.end - model.start) * currentProgress + offset;
        var inside = ratio >= 0 && ratio <= 1;
        var clampedRatio = clamp(ratio, 0, 1);
        node.setAttribute('data-ratio', String(Math.round(clampedRatio * 10000) / 10000));
        node.setAttribute('data-offset', String(offset));
        node.setAttribute('data-path-id', copy.pathId || '');
        if (!path) {
          node.setAttribute('data-missing-path', 'true');
          node.setAttribute('transform', 'translate(-9999,-9999)');
          return;
        }
        node.removeAttribute('data-missing-path');
        var total = 0;
        try { total = path.getTotalLength(); } catch (error) { total = 0; }
        if (!(total > 0)) {
          node.setAttribute('data-missing-path', 'true');
          node.setAttribute('transform', 'translate(-9999,-9999)');
          return;
        }
        var point = path.getPointAtLength(total * clampedRatio);
        var transform = 'translate(' + point.x.toFixed(2) + ',' + point.y.toFixed(2) + ')';
        if (model.rotate === true || copy.rotate === true) {
          var before = path.getPointAtLength(clamp(total * clampedRatio - 2, 0, total));
          var after = path.getPointAtLength(clamp(total * clampedRatio + 2, 0, total));
          var angle = Math.atan2(after.y - before.y, after.x - before.x);
          transform += ' rotate(' + (angle * 180 / Math.PI).toFixed(2) + ')';
        }
        node.setAttribute('transform', transform);
        node.setAttribute('data-x', point.x.toFixed(2));
        node.setAttribute('data-y', point.y.toFixed(2));
        if (inside) node.removeAttribute('data-outside');
        else node.setAttribute('data-outside', 'true');
      });
      Array.from(copyNodes.keys()).forEach(function (id) {
        if (seen[id]) return;
        var node = copyNodes.get(id);
        if (node && node.parentNode) node.parentNode.removeChild(node);
        copyNodes.delete(id);
      });
    }

    var instance = { el: root };
    Object.defineProperty(instance, 'destroyed', { enumerable: true, get: function () { return destroyed; } });
    instance.update = function (progress) {
      if (destroyed) return;
      place(progress);
    };
    instance.getTarget = function (id) {
      if (destroyed || id == null) return null;
      var key = text(id);
      if (key === 'group' || key === 'root') return root;
      if (key === 'svg') return svgHost;
      if (key.indexOf('path:') === 0) return pathNodes.get(key.slice(5)) || null;
      if (copyNodes.has(key)) return copyNodes.get(key);
      return null;
    };
    instance.getState = function () {
      if (destroyed) return null;
      return {
        progress: currentProgress,
        start: model.start,
        end: model.end,
        copies: Array.from(copyNodes.keys()).map(function (id) {
          var node = copyNodes.get(id);
          return {
            id: id,
            ratio: Number(node.getAttribute('data-ratio')),
            x: Number(node.getAttribute('data-x')),
            y: Number(node.getAttribute('data-y')),
            outside: node.getAttribute('data-outside') === 'true'
          };
        })
      };
    };
    instance.destroy = function () {
      if (destroyed) return;
      destroyed = true;
      try {
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        else if (root.parentNode) root.parentNode.removeChild(root);
      } catch (error) { /* ignore */ }
      copyNodes.clear();
      pathNodes.clear();
    };
    place(0);
    return instance;
  };
  NoteViz.Flow.Propagation = Propagation;


  global.NoteVizFlowInternals = {
    version: VERSION,
    SVG_NS: SVG_NS,
    text: text, own: own, array: array, isNode: isNode, el: el, svgEl: svgEl,
    setAttrs: setAttrs, setText: setText, setAttributeIf: setAttributeIf, setTextIf: setTextIf,
    clear: clear, numberOr: numberOr,
    clamp: clamp, textOrEmpty: textOrEmpty, uniqueId: uniqueId,
    validateHost: validateHost, defaultId: defaultId, component: component,
    makeSvgAccessible: makeSvgAccessible, setViewportMessage: setViewportMessage,
    normalizeStatus: normalizeStatus, statusList: statusList
  };
})(window);

/* ---- source: src/viz/flow-stage.js ---- */
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

/* ---- source: src/viz/flow-packet.js ---- */
/*!
 * NoteViz Flow — PacketFlow (D08 message flow).
 * Scope: window.NoteViz.Flow.PacketFlow; shared helpers in flow-core.js.
 * B08-compatible shapes: message type sync|async|return, dashed override, self loop, status,
 * participant note, two-line labels with full text in <title>, optional indexes/focus band,
 * viewport target. Reveal state is host-owned; no player/timer/rAF.
 */
(function (global) {
  'use strict';

  var NoteViz = global.NoteViz = global.NoteViz || {};
  var shared = global.NoteVizFlowInternals;
  if (!shared) throw new Error('NoteViz.Flow PacketFlow 需要先加载 src/viz/flow-core.js。');
  var text = shared.text, own = shared.own, array = shared.array, isNode = shared.isNode,
    el = shared.el, svgEl = shared.svgEl, setAttrs = shared.setAttrs, setText = shared.setText,
    numberOr = shared.numberOr, textOrEmpty = shared.textOrEmpty, validateHost = shared.validateHost,
    component = shared.component, makeSvgAccessible = shared.makeSvgAccessible,
    setViewportMessage = shared.setViewportMessage, normalizeStatus = shared.normalizeStatus,
    statusList = shared.statusList, defaultId = shared.defaultId,
    setAttributeIf = shared.setAttributeIf, setTextIf = shared.setTextIf;

  var TYPES = { sync: 'sync', async: 'async', return: 'return' };

  function wrapText(value, maxUnits, maxLines) {
    var source = text(value).replace(/\s+/g, ' ').trim();
    if (!source) return { lines: [''], truncated: false };
    var lines = [];
    var current = '';
    var units = 0;
    Array.from(source).forEach(function (char) {
      var width = char === ' ' ? 1 : (char.codePointAt(0) > 0x2e7f ? 2 : 1);
      if (units + width > maxUnits && current) {
        lines.push(current.trim());
        current = '';
        units = 0;
      }
      current += char;
      units += width;
    });
    if (current.trim()) lines.push(current.trim());
    if (!lines.length) lines.push('');
    if (lines.length <= maxLines) return { lines: lines, truncated: false };
    return { lines: lines.slice(0, maxLines), truncated: true };
  }

  function setLines(node, lines) {
    while (node.firstChild) node.removeChild(node.firstChild);
    lines.forEach(function (line, index) {
      var tspan = svgEl('tspan', { x: node.getAttribute('x'), dy: index === 0 ? '0' : '15' });
      tspan.textContent = line;
      node.appendChild(tspan);
    });
  }

  function setLinesIf(node, key, lines) {
    if (node.__nvizFlowLinesKey === key) return;
    node.__nvizFlowLinesKey = key;
    setLines(node, lines);
  }

  function ensureOrder(parent, desired) {
    var current = Array.prototype.slice.call(parent.children);
    if (desired.length === current.length && desired.every(function (node, index) { return node === current[index]; })) return;
    desired.forEach(function (node) { if (node) parent.appendChild(node); });
  }

  var PacketFlow = {};
  PacketFlow.version = '1.0.0';
  PacketFlow.mount = function (host, options) {
    validateHost(host, 'NoteViz.Flow.PacketFlow');
    var root = el('div', 'nviz-flow-packetflow');
    root.setAttribute('role', 'group');
    var viewport = el('div', 'nviz-flow-packetflow__viewport');
    viewport.tabIndex = 0;
    var svg = svgEl('svg', { class: 'nviz-flow-packetflow__svg', viewBox: '0 0 1000 220' });
    var note = el('p', 'nviz-flow-packetflow__note');
    note.hidden = true;
    viewport.appendChild(svg);
    root.append(viewport, note);
    host.appendChild(root);

    var accessible = makeSvgAccessible(svg, '消息流', '参与者与按顺序显现的消息方向；内容由宿主提供。', 'nviz-flow-packetflow');
    var focusLayer = svgEl('g', { class: 'nviz-flow-packetflow__focus-layer' });
    var participantLayer = svgEl('g', { class: 'nviz-flow-packetflow__participants' });
    var lifelineLayer = svgEl('g', { class: 'nviz-flow-packetflow__lifelines' });
    var messageLayer = svgEl('g', { class: 'nviz-flow-packetflow__messages' });
    svg.append(focusLayer, participantLayer, lifelineLayer, messageLayer);

    var model = Object.assign({
      participants: [],
      messages: [],
      revealed: null,
      visibleCount: null,
      focus: null,
      showIndexes: false,
      layoutCount: null,
      label: '消息流'
    }, options || {});

    var participantNodes = new Map();
    var lifelineNodes = new Map();
    var messageNodes = new Map();
    var shownMessages = [];

    function normalizeParticipants() {
      return array(model.participants).map(function (source, index) {
        var item = source && typeof source === 'object' && !isNode(source) ? source : {};
        var id = textOrEmpty(item.id) || defaultId('participant', index);
        return {
          id: id,
          label: item.label == null ? id : text(item.label),
          note: item.note == null ? '' : text(item.note),
          status: normalizeStatus(item.status)
        };
      });
    }

    function normalizeMessages(participantIndexById) {
      return array(model.messages).map(function (source, index) {
        var item = source && typeof source === 'object' && !isNode(source) ? source : {};
        var id = textOrEmpty(item.id) || defaultId('message', index);
        var from = textOrEmpty(item.from);
        var to = textOrEmpty(item.to);
        var type = TYPES[normalizeStatus(item.type)] || 'sync';
        var dashed = typeof item.dashed === 'boolean' ? item.dashed : null;
        return {
          id: id,
          from: from,
          to: to,
          label: item.label == null ? '' : text(item.label),
          note: item.note == null ? '' : text(item.note),
          type: type,
          dashed: dashed,
          status: normalizeStatus(item.status),
          valid: own(participantIndexById, from) && own(participantIndexById, to)
        };
      });
    }

    function revealedSet(messages) {
      if (model.revealed != null) return statusList(model.revealed);
      if (model.visibleCount != null) {
        var count = Math.max(0, Math.min(messages.length, Math.floor(numberOr(model.visibleCount, messages.length))));
        var set = Object.create(null);
        messages.slice(0, count).forEach(function (message) { set[message.id] = true; });
        return set;
      }
      var all = Object.create(null);
      messages.forEach(function (message) { all[message.id] = true; });
      return all;
    }

    function effectiveDashed(message) {
      if (message.type === 'return') return false;
      if (message.dashed === true) return true;
      if (message.dashed === false) return false;
      return message.type === 'async';
    }

    function lineDash(message) {
      if (message.type === 'return') return '2 4';
      if (message.type === 'async' || message.dashed === true) return '7 5';
      return null;
    }

    function arrowPath(tip, y, direction, open) {
      if (open) {
        return 'M ' + (tip - direction * 10).toFixed(1) + ' ' + (y - 5) +
          ' L ' + tip.toFixed(1) + ' ' + y +
          ' L ' + (tip - direction * 10).toFixed(1) + ' ' + (y + 5);
      }
      return 'M ' + tip.toFixed(1) + ' ' + y +
        ' L ' + (tip - direction * 10).toFixed(1) + ' ' + (y - 5) +
        ' L ' + (tip - direction * 10).toFixed(1) + ' ' + (y + 5) + ' Z';
    }

    function render() {
      setAttributeIf(root, 'aria-label', textOrEmpty(model.label) || '消息流');
      setTextIf(accessible.title, textOrEmpty(model.label) || '消息流');
      var participants = normalizeParticipants();
      var participantIndexById = Object.create(null);
      participants.forEach(function (participant, index) { participantIndexById[participant.id] = index; });
      var messages = normalizeMessages(participantIndexById);
      var shown = revealedSet(messages);
      var validMessages = messages.filter(function (message) { return message.valid; });
      shownMessages = validMessages.filter(function (message) { return !!shown[message.id]; });
      var invalid = messages.length - validMessages.length;
      var width = 1000;
      var margin = 76;
      var span = width - margin * 2;
      var boxWidth = 144;
      var boxHeight = 64;
      var xs = participants.map(function (participant, index) {
        if (participants.length <= 1) return width / 2;
        return margin + (span * index) / (participants.length - 1);
      });
      var messageTop = 116;
      var step = 56;
      /* 布局按完整已知消息分配；revealed/visibleCount 只控制 data-hidden，不改变坐标/高度。 */
      var layoutCount = Math.max(1, validMessages.length, Math.floor(numberOr(model.layoutCount, validMessages.length)));
      var lifelineEnd = messageTop + layoutCount * step - 30;

      var seenParticipants = Object.create(null);
      var desiredParticipants = [];
      participants.forEach(function (participant, index) {
        var node = participantNodes.get(participant.id);
        if (!node) {
          node = svgEl('g', { class: 'nviz-flow-packetflow__participant', 'data-id': participant.id });
          node.appendChild(svgEl('rect', { class: 'nviz-flow-packetflow__participant-box', x: 0, y: 14, width: boxWidth, height: boxHeight, rx: 9 }));
          node.appendChild(svgEl('text', { class: 'nviz-flow-packetflow__participant-label', 'text-anchor': 'middle', x: 0, y: 34 }));
          node.appendChild(svgEl('text', { class: 'nviz-flow-packetflow__participant-note', 'text-anchor': 'middle', x: 0, y: 52 }));
          node.appendChild(svgEl('title'));
          node.__nvizFlowCache = Object.create(null);
          participantLayer.appendChild(node);
          participantNodes.set(participant.id, node);
        }
        seenParticipants[participant.id] = true;
        desiredParticipants.push(node);
        var cache = node.__nvizFlowCache || (node.__nvizFlowCache = Object.create(null));
        setAttributeIf(node, 'data-status', participant.status || '');
        var x = xs[index];
        var transform = 'translate(' + (x - boxWidth / 2).toFixed(1) + ',0)';
        if (cache.transform !== transform) {
          node.setAttribute('transform', transform);
          cache.transform = transform;
        }
        var labelNode = node.querySelector('.nviz-flow-packetflow__participant-label');
        setAttributeIf(labelNode, 'x', String(boxWidth / 2));
        var labelLines = wrapText(participant.label || participant.id, 16, 2);
        setLinesIf(labelNode, labelLines.lines.join('\u0001'), labelLines.lines);
        var noteNode = node.querySelector('.nviz-flow-packetflow__participant-note');
        var noteLines = wrapText(participant.note, 18, 1);
        setAttributeIf(noteNode, 'x', String(boxWidth / 2));
        setTextIf(noteNode, noteLines.lines[0] || '');
        setAttributeIf(noteNode, 'display', participant.note ? null : 'none');
        var titleText = [participant.label, participant.note].filter(Boolean).join(' · ') || participant.id;
        var ariaText = [participant.label, participant.note].filter(Boolean).join('，') || participant.id;
        var titleNode = node.querySelector('title');
        if (cache.titleText !== titleText) { setTextIf(titleNode, titleText); cache.titleText = titleText; }
        if (cache.ariaText !== ariaText) { setAttributeIf(node, 'aria-label', ariaText); cache.ariaText = ariaText; }
        var line = lifelineNodes.get(participant.id);
        if (!line) {
          line = svgEl('line', { class: 'nviz-flow-packetflow__lifeline' });
          lifelineLayer.appendChild(line);
          lifelineNodes.set(participant.id, line);
        }
        var xText = x.toFixed(1);
        var endText = lifelineEnd.toFixed(1);
        setAttributeIf(line, 'x1', xText);
        setAttributeIf(line, 'y1', '82');
        setAttributeIf(line, 'x2', xText);
        setAttributeIf(line, 'y2', endText);
      });
      Array.from(participantNodes.keys()).forEach(function (id) {
        if (seenParticipants[id]) return;
        var node = participantNodes.get(id);
        if (node && node.parentNode) node.parentNode.removeChild(node);
        participantNodes.delete(id);
        var line = lifelineNodes.get(id);
        if (line && line.parentNode) line.parentNode.removeChild(line);
        lifelineNodes.delete(id);
      });
      ensureOrder(participantLayer, desiredParticipants);

      var focusId = textOrEmpty(model.focus);
      var focusNode = null;
      var seenMessages = Object.create(null);
      var desiredMessages = [];
      validMessages.forEach(function (message, messageIndex) {
        var node = messageNodes.get(message.id);
        if (!node) {
          node = svgEl('g', { class: 'nviz-flow-packetflow__message', 'data-id': message.id });
          node.appendChild(svgEl('path', { class: 'nviz-flow-packetflow__message-line' }));
          node.appendChild(svgEl('path', { class: 'nviz-flow-packetflow__message-arrow' }));
          node.appendChild(svgEl('text', { class: 'nviz-flow-packetflow__message-index', 'text-anchor': 'end' }));
          node.appendChild(svgEl('text', { class: 'nviz-flow-packetflow__message-label', 'text-anchor': 'middle' }));
          node.appendChild(svgEl('title'));
          node.__nvizFlowCache = Object.create(null);
          messageLayer.appendChild(node);
          messageNodes.set(message.id, node);
        }
        seenMessages[message.id] = true;
        desiredMessages.push(node);
        var fromIndex = participantIndexById[message.from];
        var toIndex = participantIndexById[message.to];
        var x1 = xs[fromIndex];
        var x2 = xs[toIndex];
        var hidden = !shown[message.id];
        var y = messageTop + messageIndex * step;
        var self = message.from === message.to;
        var direction = self ? 1 : (x2 >= x1 ? 1 : -1);
        var openArrow = message.type === 'return';
        var typeText = message.type === 'return' ? '返回' : (message.type === 'async' ? '异步' : '同步');
        var fullLabel = message.label || (message.from + ' → ' + message.to);
        var fromLabel = participants[fromIndex] ? participants[fromIndex].label : message.from;
        var toLabel = participants[toIndex] ? participants[toIndex].label : message.to;
        var labelLines = self
          ? wrapText(fullLabel, 16, 2)
          : wrapText(fullLabel, 24, 2);
        var titleText = typeText + '：' + fromLabel + ' → ' + toLabel + '：' + fullLabel +
          (message.note ? '（' + message.note + '）' : '');
        var ariaText = typeText + '消息：' + fromLabel + ' 到 ' + toLabel + '，' + fullLabel;
        var isFocus = focusId === message.id;
        var cache = node.__nvizFlowCache || (node.__nvizFlowCache = Object.create(null));
        var sig = JSON.stringify([
          message.id, message.from, message.to, message.type, message.dashed, message.status, message.note,
          message.label, fullLabel, titleText, ariaText, hidden, messageIndex, isFocus, model.showIndexes === true,
          fromIndex, toIndex, x1, x2, y, labelLines.lines.join('\u0001')
        ]);
        if (cache.sig !== sig) {
          cache.sig = sig;
          var linePath = node.querySelector('.nviz-flow-packetflow__message-line');
          var arrowNode = node.querySelector('.nviz-flow-packetflow__message-arrow');
          var labelNode = node.querySelector('.nviz-flow-packetflow__message-label');
          var indexNode = node.querySelector('.nviz-flow-packetflow__message-index');
          var dash = lineDash(message);
          setAttributeIf(linePath, 'stroke-dasharray', dash);
          if (self) {
            setAttributeIf(linePath, 'd', 'M ' + x1.toFixed(1) + ' ' + y + ' C ' + (x1 + 36).toFixed(1) + ' ' + y +
              ', ' + (x1 + 36).toFixed(1) + ' ' + (y + 34) + ', ' + x1.toFixed(1) + ' ' + (y + 34));
            setAttributeIf(arrowNode, 'd', arrowPath(x1, y + 34, direction, openArrow));
            setAttributeIf(labelNode, 'x', (x1 + 48).toFixed(1));
            setAttributeIf(labelNode, 'y', String(y + 10));
            setAttributeIf(labelNode, 'text-anchor', 'start');
          } else {
            setAttributeIf(linePath, 'd', 'M ' + x1.toFixed(1) + ' ' + y + ' L ' + x2.toFixed(1) + ' ' + y);
            setAttributeIf(arrowNode, 'd', arrowPath(x2, y, direction, openArrow));
            setAttributeIf(labelNode, 'x', ((x1 + x2) / 2).toFixed(1));
            setAttributeIf(labelNode, 'text-anchor', 'middle');
            setAttributeIf(labelNode, 'y', String(y - 22));
          }
          setLinesIf(labelNode, labelLines.lines.join('\u0001'), labelLines.lines);
          setAttributeIf(arrowNode, 'fill', openArrow ? 'none' : null);
          setAttributeIf(arrowNode, 'class', openArrow
            ? 'nviz-flow-packetflow__message-arrow is-open'
            : 'nviz-flow-packetflow__message-arrow');
          setAttributeIf(indexNode, 'x', (x1 - 10).toFixed(1));
          setAttributeIf(indexNode, 'y', String(y - 4));
          setTextIf(indexNode, model.showIndexes === true ? String(messageIndex + 1) : '');
          setAttributeIf(indexNode, 'display', model.showIndexes === true ? null : 'none');
          var titleNode = node.querySelector('title');
          if (cache.titleText !== titleText) { setTextIf(titleNode, titleText); cache.titleText = titleText; }
          if (cache.ariaText !== ariaText) { setAttributeIf(node, 'aria-label', ariaText); cache.ariaText = ariaText; }
          setAttributeIf(node, 'data-type', message.type);
          setAttributeIf(node, 'data-dashed', effectiveDashed(message) ? 'true' : 'false');
          setAttributeIf(node, 'data-status', message.status || '');
          setAttributeIf(node, 'data-from', message.from);
          setAttributeIf(node, 'data-to', message.to);
          setAttributeIf(node, 'data-target', message.to);
          setAttributeIf(node, 'data-index', String(messageIndex));
          setAttributeIf(node, 'data-direction', self ? 'self' : (direction > 0 ? 'right' : 'left'));
          setAttributeIf(node, 'data-hidden', hidden ? 'true' : null);
          setAttributeIf(node, 'data-focus', isFocus ? 'true' : null);
          setAttributeIf(node, 'aria-current', isFocus ? 'step' : null);
        }
        if (isFocus) focusNode = { node: node, y: y, x1: x1, x2: x2, self: self };
      });
      Array.from(messageNodes.keys()).forEach(function (id) {
        if (seenMessages[id]) return;
        var node = messageNodes.get(id);
        if (node && node.parentNode) node.parentNode.removeChild(node);
        messageNodes.delete(id);
      });
      ensureOrder(messageLayer, desiredMessages);

      var focusBand = focusLayer.querySelector('.nviz-flow-packetflow__focus-band');
      if (!focusBand) {
        focusBand = svgEl('rect', { class: 'nviz-flow-packetflow__focus-band', rx: 7 });
        focusLayer.appendChild(focusBand);
      }
      if (focusNode) {
        setAttributeIf(focusBand, 'display', null);
        setAttributeIf(focusBand, 'x', '42');
        setAttributeIf(focusBand, 'y', String(focusNode.y - 18));
        setAttributeIf(focusBand, 'width', String(width - 84));
        setAttributeIf(focusBand, 'height', '36');
      } else {
        setAttributeIf(focusBand, 'display', 'none');
      }

      var height = messageTop + layoutCount * step + 20;
      setAttributeIf(svg, 'viewBox', '0 0 ' + width + ' ' + height);
      if (svg.hasAttribute('height')) svg.removeAttribute('height');
      setViewportMessage(note, invalid ? '已跳过 ' + invalid + ' 条引用未知参与者的消息。' : '');
    }

    var instance = component(root, model, render, function () {
      participantNodes.clear();
      lifelineNodes.clear();
      messageNodes.clear();
    });
    instance.getTarget = function (id) {
      if (instance.destroyed || id == null) return null;
      var key = text(id);
      if (key === 'svg') return svg;
      if (key === 'viewport') return viewport;
      if (key.indexOf('message:') === 0) return messageNodes.get(key.slice(8)) || null;
      if (key.indexOf('participant:') === 0) return participantNodes.get(key.slice(12)) || null;
      if (messageNodes.has(key)) return messageNodes.get(key);
      if (participantNodes.has(key)) return participantNodes.get(key);
      return null;
    };
    instance.getState = function () {
      if (instance.destroyed) return null;
      var participants = normalizeParticipants();
      var participantIndexById = Object.create(null);
      participants.forEach(function (participant, index) { participantIndexById[participant.id] = index; });
      var messages = normalizeMessages(participantIndexById);
      var shown = revealedSet(messages);
      var focus = textOrEmpty(model.focus);
      var current = null;
      var outputMessages = messages.map(function (message) {
        var normalized = {
          id: message.id,
          from: message.from,
          to: message.to,
          label: message.label,
          note: message.note,
          type: message.type,
          dashed: effectiveDashed(message),
          status: message.status,
          revealed: !!shown[message.id]
        };
        if (message.id === focus) current = normalized;
        return normalized;
      });
      return {
        participants: participants.map(function (participant) {
          return { id: participant.id, label: participant.label, note: participant.note, status: participant.status };
        }),
        messages: outputMessages,
        revealed: outputMessages.filter(function (message) { return message.revealed; }).map(function (message) { return message.id; }),
        visibleCount: outputMessages.filter(function (message) { return message.revealed; }).length,
        focus: focus || null,
        current: current
      };
    };
    render({});
    return instance;
  };

  NoteViz.Flow = NoteViz.Flow || {};
  NoteViz.Flow.PacketFlow = PacketFlow;
})(window);

/* ---- source: src/viz/flow-segment.js ---- */
/*!
 * NoteViz Flow — SegmentBar.
 * Scope: window.NoteViz.Flow; shared helpers live in flow-core.js.
 * Plain classic script, no modules/network/eval/third-party. Load after flow-core.js.
 */
(function (global) {
  'use strict';

  var NoteViz = global.NoteViz = global.NoteViz || {};
  var shared = global.NoteVizFlowInternals;
  var VERSION = shared && shared.version ? shared.version : '1.0.0';
  if (!shared) throw new Error('NoteViz.Flow SegmentBar 需要先加载 src/viz/flow-core.js。');
  var text = shared.text, own = shared.own, array = shared.array, isNode = shared.isNode,
    el = shared.el, svgEl = shared.svgEl, setAttrs = shared.setAttrs, setText = shared.setText,
    clear = shared.clear, numberOr = shared.numberOr, clamp = shared.clamp, textOrEmpty = shared.textOrEmpty,
    uniqueId = shared.uniqueId, validateHost = shared.validateHost, defaultId = shared.defaultId,
    component = shared.component, makeSvgAccessible = shared.makeSvgAccessible,
    setViewportMessage = shared.setViewportMessage, normalizeStatus = shared.normalizeStatus,
    statusList = shared.statusList, setAttributeIf = shared.setAttributeIf, setTextIf = shared.setTextIf;

  /* ---------------- SegmentBar ---------------- */

  var SegmentBar = {};
  SegmentBar.version = VERSION;
  SegmentBar.mount = function (host, options) {
    validateHost(host, 'NoteViz.Flow.SegmentBar');
    var root = el('div', 'nviz-flow-segmentbar');
    root.setAttribute('role', 'group');
    var viewport = el('div', 'nviz-flow-segmentbar__viewport');
    viewport.tabIndex = 0;
    var svg = svgEl('svg', { class: 'nviz-flow-segmentbar__svg', viewBox: '0 0 1000 100' });
    var empty = el('p', 'nviz-flow-segmentbar__empty', '暂无可显示的段。');
    var note = el('p', 'nviz-flow-segmentbar__note');
    note.hidden = true;
    viewport.appendChild(svg);
    root.append(viewport, empty, note);
    host.appendChild(root);

    var accessible = makeSvgAccessible(svg, '段条', '真实值、显示尺度与最小可读宽度分离的条形图。', 'nviz-flow-segmentbar');
    var trackLayer = svgEl('g', { class: 'nviz-flow-segmentbar__track' });
    var segmentLayer = svgEl('g', { class: 'nviz-flow-segmentbar__segments' });
    var rangeLayer = svgEl('g', { class: 'nviz-flow-segmentbar__ranges' });
    svg.append(trackLayer, segmentLayer, rangeLayer);
    trackLayer.appendChild(svgEl('rect', { class: 'nviz-flow-segmentbar__track-bg', x: 0, y: 30, width: 1000, height: 26, rx: 7 }));
    var scaleText = svgEl('text', { class: 'nviz-flow-segmentbar__scale', 'text-anchor': 'end', x: 1000, y: 24 });
    trackLayer.appendChild(scaleText);

    var model = Object.assign({
      segments: [],
      ranges: [],
      scaleMax: null,
      minWidth: 14,
      label: '段条'
    }, options || {});

    var segmentNodes = new Map();
    var rangeNodes = new Map();

    function normalizeSegments() {
      return array(model.segments).map(function (source, index) {
        var item = source && typeof source === 'object' && !isNode(source) ? source : {};
        var id = textOrEmpty(item.id) || defaultId('segment', index);
        var value = Math.max(0, numberOr(item.value, 0));
        return { id: id, label: item.label == null ? id : text(item.label), value: value, color: textOrEmpty(item.color), raw: item };
      });
    }

    function normalizeRanges(segments) {
      var indexById = Object.create(null);
      segments.forEach(function (segment, index) { indexById[segment.id] = index; });
      var valid = [];
      var invalid = 0;
      array(model.ranges).forEach(function (source, index) {
        var item = source && typeof source === 'object' ? source : {};
        var id = textOrEmpty(item.id) || defaultId('range', index);
        var startIndex;
        var endIndex;
        if (own(indexById, textOrEmpty(item.start))) startIndex = indexById[textOrEmpty(item.start)];
        else startIndex = numberOr(item.start, -1);
        if (own(indexById, textOrEmpty(item.end))) endIndex = indexById[textOrEmpty(item.end)];
        else endIndex = numberOr(item.end, -1);
        startIndex = Math.floor(startIndex);
        endIndex = Math.floor(endIndex);
        if (startIndex < 0 || endIndex < 0 || startIndex >= segments.length || endIndex >= segments.length) {
          invalid += 1;
          return;
        }
        valid.push({
          id: id,
          label: item.label == null ? '' : text(item.label),
          start: Math.min(startIndex, endIndex),
          end: Math.max(startIndex, endIndex),
          key: 'range:' + id
        });
      });
      return { valid: valid, invalid: invalid };
    }

    function render() {
      setAttributeIf(root, 'aria-label', textOrEmpty(model.label) || '段条');
      setTextIf(accessible.title, textOrEmpty(model.label) || '段条');
      var segments = normalizeSegments();
      var values = segments.map(function (segment) { return segment.value; });
      var sum = values.reduce(function (total, value) { return total + value; }, 0);
      var autoMax = Math.max(sum, values.length ? Math.max.apply(null, values) : 1, 1);
      var scaleMax = numberOr(model.scaleMax, autoMax);
      if (!(scaleMax > 0)) scaleMax = autoMax;
      var minWidth = Math.max(2, numberOr(model.minWidth, 14));
      var trackBase = 1000;
      var x = 0;
      var layout = [];
      segments.forEach(function (segment) {
        var ratio = segment.value / scaleMax;
        var raw = ratio * trackBase;
        var zero = segment.value === 0;
        var clamped = !zero && raw < minWidth;
        var width = zero ? minWidth : Math.max(minWidth, raw);
        layout.push({ id: segment.id, x: x, width: width, ratio: ratio, zero: zero, clamped: clamped });
        x += width;
      });
      var totalWidth = Math.max(trackBase, x);
      setAttributeIf(svg, 'viewBox', '0 0 ' + totalWidth.toFixed(1) + ' 100');
      setAttributeIf(trackLayer.querySelector('.nviz-flow-segmentbar__track-bg'), 'width', totalWidth.toFixed(1));
      setAttributeIf(scaleText, 'x', trackBase.toFixed(1));
      setTextIf(scaleText, String(scaleMax));

      if (empty.hidden !== (segments.length > 0)) empty.hidden = segments.length > 0;
      var displayValue = segments.length ? '' : 'none';
      if (svg.style.display !== displayValue) svg.style.display = displayValue;

      var seenSegments = Object.create(null);
      var desiredSegments = [];
      segments.forEach(function (segment, index) {
        var info = layout[index];
        var node = segmentNodes.get(segment.id);
        if (!node) {
          node = svgEl('g', { class: 'nviz-flow-segmentbar__segment', 'data-id': segment.id });
          node.appendChild(svgEl('rect', { class: 'nviz-flow-segmentbar__segment-rect', y: 30, height: 26, rx: 7 }));
          node.appendChild(svgEl('text', { class: 'nviz-flow-segmentbar__label', 'text-anchor': 'middle', y: 22 }));
          node.appendChild(svgEl('text', { class: 'nviz-flow-segmentbar__value', 'text-anchor': 'middle', y: 48 }));
          segmentLayer.appendChild(node);
          segmentNodes.set(segment.id, node);
        }
        seenSegments[segment.id] = true;
        desiredSegments.push(node);
        var rect = node.querySelector('.nviz-flow-segmentbar__segment-rect');
        setAttributeIf(rect, 'x', info.x.toFixed(1));
        setAttributeIf(rect, 'width', info.width.toFixed(1));
        var colorValue = segment.color ? text(segment.color) : '';
        if (rect.style.getPropertyValue('--nviz-flow-segmentbar-segment-color') !== colorValue) {
          if (colorValue) rect.style.setProperty('--nviz-flow-segmentbar-segment-color', colorValue);
          else rect.style.removeProperty('--nviz-flow-segmentbar-segment-color');
        }
        var label = node.querySelector('.nviz-flow-segmentbar__label');
        setAttributeIf(label, 'x', (info.x + info.width / 2).toFixed(1));
        setTextIf(label, segment.label || segment.id);
        var valueNode = node.querySelector('.nviz-flow-segmentbar__value');
        setAttributeIf(valueNode, 'x', (info.x + info.width / 2).toFixed(1));
        setTextIf(valueNode, String(segment.value));
        setAttributeIf(node, 'data-real-value', String(segment.value));
        setAttributeIf(node, 'data-ratio', String(Math.round(info.ratio * 10000) / 10000));
        setAttributeIf(node, 'data-zero', info.zero ? 'true' : 'false');
        setAttributeIf(node, 'data-clamped', info.clamped ? 'true' : 'false');
        setAttributeIf(node, 'data-index', String(index));
      });
      Array.from(segmentNodes.keys()).forEach(function (id) {
        if (seenSegments[id]) return;
        var node = segmentNodes.get(id);
        if (node && node.parentNode) node.parentNode.removeChild(node);
        segmentNodes.delete(id);
      });
      var currentSegments = Array.prototype.slice.call(segmentLayer.children);
      if (desiredSegments.length !== currentSegments.length ||
          !desiredSegments.every(function (node, index) { return node === currentSegments[index]; })) {
        desiredSegments.forEach(function (node) { segmentLayer.appendChild(node); });
      }

      var ranges = normalizeRanges(segments);
      var seenRanges = Object.create(null);
      var desiredRanges = [];
      ranges.valid.forEach(function (range) {
        var node = rangeNodes.get(range.key);
        if (!node) {
          node = svgEl('g', { class: 'nviz-flow-segmentbar__range', 'data-id': range.id });
          node.appendChild(svgEl('path', { class: 'nviz-flow-segmentbar__range-bracket' }));
          node.appendChild(svgEl('text', { class: 'nviz-flow-segmentbar__range-label', 'text-anchor': 'middle', y: 90 }));
          rangeLayer.appendChild(node);
          rangeNodes.set(range.key, node);
        }
        seenRanges[range.key] = true;
        desiredRanges.push(node);
        var x0 = layout[range.start].x;
        var x1 = layout[range.end].x + layout[range.end].width;
        setAttributeIf(node.querySelector('.nviz-flow-segmentbar__range-bracket'), 'd',
          'M ' + x0.toFixed(1) + ' 66 L ' + x0.toFixed(1) + ' 74 L ' + x1.toFixed(1) + ' 74 L ' + x1.toFixed(1) + ' 66');
        var labelNode = node.querySelector('.nviz-flow-segmentbar__range-label');
        setAttributeIf(labelNode, 'x', ((x0 + x1) / 2).toFixed(1));
        setTextIf(labelNode, range.label || (segments[range.start].label + '–' + segments[range.end].label));
        setAttributeIf(node, 'data-start', String(range.start));
        setAttributeIf(node, 'data-end', String(range.end));
        setAttributeIf(node, 'data-start-id', segments[range.start].id);
        setAttributeIf(node, 'data-end-id', segments[range.end].id);
      });
      Array.from(rangeNodes.keys()).forEach(function (key) {
        if (seenRanges[key]) return;
        var node = rangeNodes.get(key);
        if (node && node.parentNode) node.parentNode.removeChild(node);
        rangeNodes.delete(key);
      });
      var currentRanges = Array.prototype.slice.call(rangeLayer.children);
      if (desiredRanges.length !== currentRanges.length ||
          !desiredRanges.every(function (node, index) { return node === currentRanges[index]; })) {
        desiredRanges.forEach(function (node) { rangeLayer.appendChild(node); });
      }
      setViewportMessage(note, ranges.invalid ? '已跳过 ' + ranges.invalid + ' 个引用未知段的范围。' : '');
    }

    var instance = component(root, model, render, function () {
      segmentNodes.clear();
      rangeNodes.clear();
    });
    instance.getTarget = function (id) {
      if (instance.destroyed || id == null) return null;
      var key = text(id);
      if (key === 'track') return trackLayer;
      if (key.indexOf('label:') === 0) {
        var labelNode = segmentNodes.get(key.slice(6));
        return labelNode ? labelNode.querySelector('.nviz-flow-segmentbar__label') : null;
      }
      if (key.indexOf('range:') === 0) return rangeNodes.get(key) || null;
      if (segmentNodes.has(key)) return segmentNodes.get(key);
      if (rangeNodes.has('range:' + key)) return rangeNodes.get('range:' + key);
      return null;
    };
    instance.getState = function () {
      if (instance.destroyed) return null;
      var segments = normalizeSegments();
      var values = segments.map(function (segment) { return segment.value; });
      var sum = values.reduce(function (total, value) { return total + value; }, 0);
      var autoMax = Math.max(sum, values.length ? Math.max.apply(null, values) : 1, 1);
      var scaleMax = numberOr(model.scaleMax, autoMax);
      if (!(scaleMax > 0)) scaleMax = autoMax;
      var minWidth = Math.max(2, numberOr(model.minWidth, 14));
      var x = 0;
      var output = segments.map(function (segment) {
        var ratio = segment.value / scaleMax;
        var raw = ratio * 1000;
        var zero = segment.value === 0;
        var clamped = !zero && raw < minWidth;
        var displayWidth = zero ? minWidth : Math.max(minWidth, raw);
        var item = {
          id: segment.id,
          label: segment.label,
          value: segment.value,
          ratio: Math.round(ratio * 10000) / 10000,
          zero: zero,
          clamped: clamped,
          displayWidth: displayWidth,
          x: x
        };
        x += displayWidth;
        return item;
      });
      var ranges = normalizeRanges(segments);
      return {
        segments: output,
        totalValue: sum,
        scaleMax: scaleMax,
        minWidth: minWidth,
        displayWidth: x,
        ranges: ranges.valid.map(function (range) {
          return {
            id: range.id,
            label: range.label,
            start: range.start,
            end: range.end,
            startId: segments[range.start].id,
            endId: segments[range.end].id
          };
        }),
        invalidRanges: ranges.invalid
      };
    };

    render({});
    return instance;
  };


  NoteViz.Flow = NoteViz.Flow || {};
  NoteViz.Flow.SegmentBar = SegmentBar;
})(window);

/* ---- source: src/viz/flow-device.js ---- */
/*!
 * NoteViz Flow — DeviceLinks.
 * Scope: window.NoteViz.Flow; shared helpers live in flow-core.js.
 * Plain classic script, no modules/network/eval/third-party. Load after flow-core.js.
 */
(function (global) {
  'use strict';

  var NoteViz = global.NoteViz = global.NoteViz || {};
  var shared = global.NoteVizFlowInternals;
  var VERSION = shared && shared.version ? shared.version : '1.0.0';
  if (!shared) throw new Error('NoteViz.Flow DeviceLinks 需要先加载 src/viz/flow-core.js。');
  var text = shared.text, own = shared.own, array = shared.array, isNode = shared.isNode,
    el = shared.el, svgEl = shared.svgEl, setAttrs = shared.setAttrs, setText = shared.setText,
    clear = shared.clear, numberOr = shared.numberOr, clamp = shared.clamp, textOrEmpty = shared.textOrEmpty,
    uniqueId = shared.uniqueId, validateHost = shared.validateHost, defaultId = shared.defaultId,
    component = shared.component, makeSvgAccessible = shared.makeSvgAccessible,
    setViewportMessage = shared.setViewportMessage, normalizeStatus = shared.normalizeStatus,
    statusList = shared.statusList, setAttributeIf = shared.setAttributeIf, setTextIf = shared.setTextIf;

  /* ---------------- DeviceLinks ---------------- */

  var DeviceLinks = {};
  DeviceLinks.version = VERSION;
  DeviceLinks.mount = function (host, options) {
    validateHost(host, 'NoteViz.Flow.DeviceLinks');
    var root = el('div', 'nviz-flow-devicelinks');
    root.setAttribute('role', 'group');
    var viewport = el('div', 'nviz-flow-devicelinks__viewport');
    viewport.tabIndex = 0;
    var svg = svgEl('svg', { class: 'nviz-flow-devicelinks__svg', viewBox: '0 0 1000 300' });
    var note = el('p', 'nviz-flow-devicelinks__note');
    note.hidden = true;
    viewport.appendChild(svg);
    root.append(viewport, note);
    host.appendChild(root);

    var accessible = makeSvgAccessible(svg, '设备连接', '设备、命名端口与连接路径；由宿主提供状态。', 'nviz-flow-devicelinks');
    var linkLayer = svgEl('g', { class: 'nviz-flow-devicelinks__links' });
    var deviceLayer = svgEl('g', { class: 'nviz-flow-devicelinks__devices' });
    svg.append(linkLayer, deviceLayer);

    var model = Object.assign({
      devices: [],
      links: [],
      label: '设备连接'
    }, options || {});

    var deviceNodes = new Map();
    var portNodes = new Map();
    var linkNodes = new Map();
    var linkPaths = new Map();

    function normalizeDevices() {
      return array(model.devices).map(function (source, index) {
        var item = source && typeof source === 'object' && !isNode(source) ? source : {};
        var id = textOrEmpty(item.id) || defaultId('device', index);
        var ports = array(item.ports).map(function (portSource, portIndex) {
          var port = portSource && typeof portSource === 'object' ? portSource : {};
          var portId = textOrEmpty(port.id) || defaultId('port', portIndex);
          return { id: portId, label: port.label == null ? portId : text(port.label) };
        });
        return { id: id, label: item.label == null ? id : text(item.label), status: normalizeStatus(item.status), ports: ports };
      });
    }

    function render() {
      setAttributeIf(root, 'aria-label', textOrEmpty(model.label) || '设备连接');
      setTextIf(accessible.title, textOrEmpty(model.label) || '设备连接');
      var devices = normalizeDevices();
      var deviceIndexById = Object.create(null);
      devices.forEach(function (device, index) { deviceIndexById[device.id] = index; });

      var boxWidth = 168;
      var boxHeight = 82;
      var gap = 28;
      var margin = 26;
      var width = Math.max(720, margin * 2 + devices.length * boxWidth + Math.max(0, devices.length - 1) * gap);
      var top = 24;
      var bottom = top + boxHeight;
      var positions = devices.map(function (device, index) {
        var x = margin + index * (boxWidth + gap);
        var portPositions = Object.create(null);
        device.ports.forEach(function (port, portIndex) {
          var px = x + (boxWidth * (portIndex + 1)) / (device.ports.length + 1);
          portPositions[port.id] = { x: px, y: bottom };
        });
        return { x: x, width: boxWidth, height: boxHeight, ports: portPositions };
      });

      var normalizedLinks = array(model.links).map(function (source, index) {
        var item = source && typeof source === 'object' ? source : {};
        var id = textOrEmpty(item.id) || defaultId('link', index);
        var from = item.from && typeof item.from === 'object' ? item.from : {};
        var to = item.to && typeof item.to === 'object' ? item.to : {};
        var fromDevice = textOrEmpty(from.device || from.deviceId || from[0]);
        var fromPort = textOrEmpty(from.port || from.portId || from[1]);
        var toDevice = textOrEmpty(to.device || to.deviceId || to[0]);
        var toPort = textOrEmpty(to.port || to.portId || to[1]);
        var fromIndex = own(deviceIndexById, fromDevice) ? deviceIndexById[fromDevice] : -1;
        var toIndex = own(deviceIndexById, toDevice) ? deviceIndexById[toDevice] : -1;
        var fromPos = fromIndex >= 0 ? positions[fromIndex].ports[fromPort] : null;
        var toPos = toIndex >= 0 ? positions[toIndex].ports[toPort] : null;
        return {
          id: id,
          fromDevice: fromDevice,
          fromPort: fromPort,
          toDevice: toDevice,
          toPort: toPort,
          fromPos: fromPos || null,
          toPos: toPos || null,
          status: normalizeStatus(item.status),
          label: item.label == null ? '' : text(item.label),
          valid: !!fromPos && !!toPos
        };
      }).filter(function (link) { return link.valid; });
      var invalidLinks = array(model.links).length - normalizedLinks.length;

      var maxLane = bottom + 34 + Math.max(0, normalizedLinks.length - 1) * 22;
      var height = Math.max(240, maxLane + 46);

      var seenDevices = Object.create(null);
      var desiredDeviceLayer = [];
      devices.forEach(function (device, index) {
        var node = deviceNodes.get(device.id);
        if (!node) {
          node = svgEl('g', { class: 'nviz-flow-devicelinks__device', 'data-id': device.id });
          node.appendChild(svgEl('rect', { class: 'nviz-flow-devicelinks__device-box', y: top, height: boxHeight, rx: 10 }));
          node.appendChild(svgEl('text', { class: 'nviz-flow-devicelinks__device-label', y: top + 30, 'text-anchor': 'middle' }));
          node.appendChild(svgEl('text', { class: 'nviz-flow-devicelinks__device-status', y: top + 50, 'text-anchor': 'middle' }));
          deviceLayer.appendChild(node);
          deviceNodes.set(device.id, node);
        }
        seenDevices[device.id] = true;
        desiredDeviceLayer.push(node);
        var pos = positions[index];
        setAttributeIf(node, 'data-status', device.status || '');
        setAttributeIf(node.querySelector('.nviz-flow-devicelinks__device-box'), 'x', pos.x.toFixed(1));
        setAttributeIf(node.querySelector('.nviz-flow-devicelinks__device-box'), 'width', boxWidth);
        var labelNode = node.querySelector('.nviz-flow-devicelinks__device-label');
        setAttributeIf(labelNode, 'x', (pos.x + boxWidth / 2).toFixed(1));
        setTextIf(labelNode, device.label || device.id);
        var statusNode = node.querySelector('.nviz-flow-devicelinks__device-status');
        setAttributeIf(statusNode, 'x', (pos.x + boxWidth / 2).toFixed(1));
        setTextIf(statusNode, device.status || '');
        var seenPorts = Object.create(null);
        device.ports.forEach(function (port) {
          var key = device.id + ':' + port.id;
          var portPos = pos.ports[port.id];
          var portNode = portNodes.get(key);
          if (!portNode) {
            portNode = svgEl('g', { class: 'nviz-flow-devicelinks__port', 'data-device': device.id, 'data-port': port.id });
            portNode.appendChild(svgEl('circle', { class: 'nviz-flow-devicelinks__port-dot', r: 4 }));
            portNode.appendChild(svgEl('text', { class: 'nviz-flow-devicelinks__port-label', 'text-anchor': 'middle' }));
            deviceLayer.appendChild(portNode);
            portNodes.set(key, portNode);
          }
          seenPorts[key] = true;
          desiredDeviceLayer.push(portNode);
          setAttributeIf(portNode, 'data-id', key);
          setAttributeIf(portNode.querySelector('.nviz-flow-devicelinks__port-dot'), 'cx', portPos.x.toFixed(1));
          setAttributeIf(portNode.querySelector('.nviz-flow-devicelinks__port-dot'), 'cy', portPos.y.toFixed(1));
          var portLabel = portNode.querySelector('.nviz-flow-devicelinks__port-label');
          setAttributeIf(portLabel, 'x', portPos.x.toFixed(1));
          setAttributeIf(portLabel, 'y', (portPos.y - 9).toFixed(1));
          setTextIf(portLabel, port.label || port.id);
        });
        Array.from(portNodes.keys()).forEach(function (key) {
          if (seenPorts[key] || key.indexOf(device.id + ':') !== 0) return;
          var stale = portNodes.get(key);
          if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
          portNodes.delete(key);
        });
      });
      Array.from(deviceNodes.keys()).forEach(function (id) {
        if (seenDevices[id]) return;
        var node = deviceNodes.get(id);
        if (node && node.parentNode) node.parentNode.removeChild(node);
        deviceNodes.delete(id);
        Array.from(portNodes.keys()).forEach(function (key) {
          if (key.indexOf(id + ':') !== 0) return;
          var port = portNodes.get(key);
          if (port && port.parentNode) port.parentNode.removeChild(port);
          portNodes.delete(key);
        });
      });
      var currentDeviceLayer = Array.prototype.slice.call(deviceLayer.children);
      if (desiredDeviceLayer.length !== currentDeviceLayer.length ||
          !desiredDeviceLayer.every(function (node, index) { return node === currentDeviceLayer[index]; })) {
        desiredDeviceLayer.forEach(function (node) { deviceLayer.appendChild(node); });
      }
      var seenLinks = Object.create(null);
      var desiredLinks = [];
      normalizedLinks.forEach(function (link, index) {
        var node = linkNodes.get(link.id);
        if (!node) {
          node = svgEl('g', { class: 'nviz-flow-devicelinks__link', 'data-id': link.id });
          node.appendChild(svgEl('path', { class: 'nviz-flow-devicelinks__link-path' }));
          node.appendChild(svgEl('path', { class: 'nviz-flow-devicelinks__link-arrow' }));
          node.appendChild(svgEl('text', { class: 'nviz-flow-devicelinks__link-label', 'text-anchor': 'middle' }));
          linkLayer.appendChild(node);
          linkNodes.set(link.id, node);
          linkPaths.set(link.id, node.querySelector('.nviz-flow-devicelinks__link-path'));
        }
        seenLinks[link.id] = true;
        desiredLinks.push(node);
        var fx = link.fromPos.x;
        var fy = link.fromPos.y;
        var tx = link.toPos.x;
        var ty = link.toPos.y;
        var laneY = bottom + 34 + index * 22;
        var d;
        if (link.fromDevice === link.toDevice && link.fromPort === link.toPort) {
          d = 'M ' + fx.toFixed(1) + ' ' + fy + ' V ' + (laneY - 8) + ' Q ' + fx.toFixed(1) + ' ' + laneY +
            ', ' + (fx + 16).toFixed(1) + ' ' + laneY + ' H ' + (fx + 40).toFixed(1) + ' Q ' + (fx + 56).toFixed(1) + ' ' + laneY +
            ', ' + (fx + 56).toFixed(1) + ' ' + (laneY - 16) + ' V ' + (fy - 8);
        } else {
          d = 'M ' + fx.toFixed(1) + ' ' + fy + ' V ' + (laneY - 6) + ' Q ' + fx.toFixed(1) + ' ' + laneY +
            ', ' + (fx + 6).toFixed(1) + ' ' + laneY + ' H ' + (tx - 6).toFixed(1) + ' Q ' + tx.toFixed(1) + ' ' + laneY +
            ', ' + tx.toFixed(1) + ' ' + (laneY - 6) + ' V ' + ty;
        }
        var path = linkPaths.get(link.id);
        setAttributeIf(path, 'd', d);
        setAttributeIf(node.querySelector('.nviz-flow-devicelinks__link-arrow'), 'd',
          'M ' + (tx - 4).toFixed(1) + ' ' + (ty - 12) + ' L ' + (tx + 4).toFixed(1) + ' ' + (ty - 12) + ' L ' + tx.toFixed(1) + ' ' + (ty - 4) + ' Z');
        var labelNode = node.querySelector('.nviz-flow-devicelinks__link-label');
        setAttributeIf(labelNode, 'x', ((fx + tx) / 2).toFixed(1));
        setAttributeIf(labelNode, 'y', String(laneY - 6));
        setTextIf(labelNode, link.label || (link.fromDevice + ' → ' + link.toDevice));
        setAttributeIf(node, 'data-status', link.status || '');
        setAttributeIf(node, 'data-from-device', link.fromDevice);
        setAttributeIf(node, 'data-from-port', link.fromPort);
        setAttributeIf(node, 'data-to-device', link.toDevice);
        setAttributeIf(node, 'data-to-port', link.toPort);
      });
      Array.from(linkNodes.keys()).forEach(function (id) {
        if (seenLinks[id]) return;
        var node = linkNodes.get(id);
        if (node && node.parentNode) node.parentNode.removeChild(node);
        linkNodes.delete(id);
        linkPaths.delete(id);
      });
      var currentLinks = Array.prototype.slice.call(linkLayer.children);
      if (desiredLinks.length !== currentLinks.length ||
          !desiredLinks.every(function (node, index) { return node === currentLinks[index]; })) {
        desiredLinks.forEach(function (node) { linkLayer.appendChild(node); });
      }
      setAttributeIf(svg, 'viewBox', '0 0 ' + width.toFixed(1) + ' ' + height.toFixed(1));
      setViewportMessage(note, invalidLinks ? '已跳过 ' + invalidLinks + ' 条引用未知设备/端口的连接。' : '');
    }

    var instance = component(root, model, render, function () {
      deviceNodes.clear();
      portNodes.clear();
      linkNodes.clear();
      linkPaths.clear();
    });
    instance.getTarget = function (id) {
      if (instance.destroyed || id == null) return null;
      var key = text(id);
      if (key === 'svg') return svg;
      if (key.indexOf('port:') === 0) return portNodes.get(key.slice(5)) || null;
      if (key.indexOf('device:') === 0) return deviceNodes.get(key.slice(7)) || null;
      if (key.indexOf('link:') === 0) return linkNodes.get(key.slice(5)) || null;
      if (deviceNodes.has(key)) return deviceNodes.get(key);
      if (linkNodes.has(key)) return linkNodes.get(key);
      return null;
    };
    instance.getState = function () {
      if (instance.destroyed) return null;
      var devices = normalizeDevices();
      var deviceById = Object.create(null);
      devices.forEach(function (device) {
        var portIds = Object.create(null);
        device.ports.forEach(function (port) { portIds[port.id] = true; });
        deviceById[device.id] = { ports: portIds };
      });
      var links = array(model.links).map(function (source, index) {
        var item = source && typeof source === 'object' ? source : {};
        var from = item.from && typeof item.from === 'object' ? item.from : {};
        var to = item.to && typeof item.to === 'object' ? item.to : {};
        var fromDevice = textOrEmpty(from.device || from.deviceId || from[0]);
        var fromPort = textOrEmpty(from.port || from.portId || from[1]);
        var toDevice = textOrEmpty(to.device || to.deviceId || to[0]);
        var toPort = textOrEmpty(to.port || to.portId || to[1]);
        var fromInfo = deviceById[fromDevice];
        var toInfo = deviceById[toDevice];
        return {
          id: textOrEmpty(item.id) || defaultId('link', index),
          from: { device: fromDevice, port: fromPort },
          to: { device: toDevice, port: toPort },
          label: item.label == null ? '' : text(item.label),
          status: normalizeStatus(item.status),
          valid: !!(fromInfo && fromInfo.ports[fromPort] && toInfo && toInfo.ports[toPort])
        };
      });
      return {
        devices: devices.map(function (device) {
          var ports = Object.create(null);
          device.ports.forEach(function (port) { ports[port.id] = port.label; });
          return { id: device.id, label: device.label, status: device.status, ports: device.ports.map(function (port) { return { id: port.id, label: port.label }; }) };
        }),
        links: links,
        invalidLinks: links.filter(function (link) { return !link.valid; }).length
      };
    };

    instance.getLinkPath = function (id) {
      if (instance.destroyed || id == null) return null;
      var key = text(id);
      var path = linkPaths.get(key) || linkPaths.get(key.replace(/^link:/, ''));
      return path || null;
    };
    instance.pointAt = function (id, ratio) {
      if (instance.destroyed || id == null) return null;
      var path = instance.getLinkPath(id);
      if (!path || typeof path.getTotalLength !== 'function') return null;
      var total = 0;
      try { total = path.getTotalLength(); } catch (error) { return null; }
      if (!(total > 0)) return null;
      var t = clamp(numberOr(ratio, 0), 0, 1);
      var length = total * t;
      var point;
      try { point = path.getPointAtLength(length); } catch (error) { return null; }
      var delta = Math.min(4, total);
      var first = path.getPointAtLength(clamp(length - delta, 0, total));
      var second = path.getPointAtLength(clamp(length + delta, 0, total));
      var angle = Math.atan2(second.y - first.y, second.x - first.x);
      return { x: point.x, y: point.y, angle: angle, length: length, total: total };
    };
    render({});
    return instance;
  };


  NoteViz.Flow = NoteViz.Flow || {};
  NoteViz.Flow.DeviceLinks = DeviceLinks;
})(window);

/* ---- source: src/viz/flow.js ---- */
/*!
 * NoteViz Flow — public entry/version.
 * Scope: window.NoteViz.Flow. Load after flow-core.js and the four graphic files:
 *   flow-core.js -> flow-stage.js -> flow-packet.js -> flow-segment.js -> flow-device.js -> flow.js
 * flow-core defines shared helpers + NoteViz.Flow.Propagation; the four graphic files define
 * D07-D10. This entry only publishes version/metadata and never starts playback.
 * No network, no eval, no third-party.
 */
(function (global) {
  'use strict';

  var NoteViz = global.NoteViz = global.NoteViz || {};
  var Flow = NoteViz.Flow = NoteViz.Flow || {};

  Flow.version = '1.0.0';
  Flow.parts = ['StageTrack', 'PacketFlow', 'SegmentBar', 'DeviceLinks'];
  Flow.propagation = 'Propagation';
})(window);
