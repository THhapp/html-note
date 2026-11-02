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
    if (node) node.textContent = text(value);
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
    if (textOrEmpty(message)) {
      node.textContent = text(message);
      node.hidden = false;
    } else {
      node.textContent = '';
      node.hidden = true;
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
    setAttrs: setAttrs, setText: setText, clear: clear, numberOr: numberOr,
    clamp: clamp, textOrEmpty: textOrEmpty, uniqueId: uniqueId,
    validateHost: validateHost, defaultId: defaultId, component: component,
    makeSvgAccessible: makeSvgAccessible, setViewportMessage: setViewportMessage,
    normalizeStatus: normalizeStatus, statusList: statusList
  };
})(window);
