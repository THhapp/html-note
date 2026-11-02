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
