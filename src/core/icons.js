/* NoteCore icons — builds local SVG elements from generated icon data.
   Scope: NoteCore.icons and NoteCore.icon. Depends on: core.js, icons-data.js.
   No external requests, no HTML string injection. */
(function (global) {
  'use strict';

  var NoteCore = global.NoteCore = global.NoteCore || {};
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var data = NoteCore.iconData && typeof NoteCore.iconData === 'object' ? NoteCore.iconData : {};
  var hasOwn = Object.prototype.hasOwnProperty;
  var names = Object.keys(data).sort();
  var ALLOWED_TAGS = ['circle', 'ellipse', 'line', 'path', 'polygon', 'polyline', 'rect'];
  var ALLOWED_ATTRIBUTES = {
    cx: true, cy: true, d: true, height: true, points: true, r: true,
    rx: true, ry: true, width: true, x: true, x1: true, x2: true,
    y: true, y1: true, y2: true
  };

  function has(name) {
    return typeof name === 'string' && hasOwn.call(data, name) &&
      data[name] && typeof data[name] === 'object';
  }

  function appendShape(parent, descriptor) {
    if (!descriptor || ALLOWED_TAGS.indexOf(descriptor.tag) < 0) return;
    var child = document.createElementNS(SVG_NS, descriptor.tag);
    var attributes = descriptor.attrs || {};
    Object.keys(attributes).forEach(function (key) {
      if (!ALLOWED_ATTRIBUTES[key] || typeof attributes[key] !== 'string') return;
      child.setAttribute(key, attributes[key]);
    });
    parent.appendChild(child);
  }

  function sizeValue(value, fallback) {
    var number = Number(value);
    return isFinite(number) && number > 0 ? number : fallback;
  }

  function build(name, size, label, className) {
    if (!has(name)) return null;
    var source = data[name];
    var dimension = sizeValue(size, 16);
    var svg = document.createElementNS(SVG_NS, 'svg');
    var classes = 'hnv-icon';
    if (className != null && String(className) !== '') classes += ' ' + String(className);
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('class', classes);
    svg.setAttribute('viewBox', source.viewBox || '0 0 24 24');
    svg.setAttribute('width', String(dimension));
    svg.setAttribute('height', String(dimension));
    svg.style.width = dimension + 'px';
    svg.style.height = dimension + 'px';
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', source.strokeWidth || '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    if (label != null && String(label) !== '') {
      svg.removeAttribute('aria-hidden');
      svg.removeAttribute('focusable');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', String(label));
    }
    (Array.isArray(source.children) ? source.children : []).forEach(function (descriptor) {
      appendShape(svg, descriptor);
    });
    return svg;
  }

  NoteCore.icons = {
    names: function () {
      return names.slice();
    },
    has: has,
    get: function (name) {
      return build(name, 24, null, '');
    }
  };

  NoteCore.icon = function (name, options) {
    var settings = options && typeof options === 'object' ? options : {};
    return build(name, settings.size == null ? 16 : settings.size,
      settings.label == null ? null : settings.label, settings.className);
  };
})(window);
