/* NoteDemo Adapter — flow-segment (D09 SegmentBar scene adapter).
 * Scope: window.NoteDemoInternals.adapters['flow-segment']; registers itself, does not edit index.js.
 * commit uses SegmentBar.update; readView uses SegmentBar.getState; groups are per changed
 * segment/range; reduced motion commits final state and returns no effects.
 */
(function (global) {
  'use strict';
  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var ADAPTER_NAME = 'flow-segment';
  function componentApi() {
    var Flow = global.NoteViz && global.NoteViz.Flow;
    var api = Flow && Flow.SegmentBar;
    if (!api || typeof api.mount !== 'function') {
      throw new Error('flow-segmentbar Adapter 需要先加载 NoteViz.Flow.SegmentBar（flow-core.js + flow-segment.js）；只加载 demo-runtime 时本 Adapter 可在真实挂载时再报错。');
    }
    return api;
  }
  function fail(message) { throw new Error(ADAPTER_NAME + ' Adapter：' + message); }
  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function text(value) { return value == null ? '' : String(value); }
  function textOrEmpty(value) { return value == null ? '' : String(value).trim(); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function num(value, fallback) { var n = typeof value === 'number' ? value : Number(value); return isFinite(n) ? n : fallback; }
  function normalizeRaw(input) {
    var source = isObject(input) && isObject(input.model) ? input.model : (isObject(input) ? input : {});
    var segments = array(source.segments).map(function (item, index) {
      var raw = isObject(item) ? item : {};
      var id = textOrEmpty(raw.id) || ('segment-' + (index + 1));
      return { id: id, label: raw.label == null ? id : text(raw.label), value: Math.max(0, num(raw.value, 0)) };
    });
    var values = segments.map(function (segment) { return segment.value; });
    var sum = values.reduce(function (total, value) { return total + value; }, 0);
    var autoMax = Math.max(sum, values.length ? Math.max.apply(null, values) : 1, 1);
    var scaleMax = num(source.scaleMax, autoMax);
    if (!(scaleMax > 0)) scaleMax = autoMax;
    var minWidth = Math.max(2, num(source.minWidth, 14));
    var x = 0;
    var outputSegments = segments.map(function (segment) {
      var ratio = segment.value / scaleMax;
      var rawWidth = ratio * 1000;
      var zero = segment.value === 0;
      var clamped = !zero && rawWidth < minWidth;
      var displayWidth = zero ? minWidth : Math.max(minWidth, rawWidth);
      var item = { id: segment.id, label: segment.label, value: segment.value, ratio: Math.round(ratio * 10000) / 10000, zero: zero, clamped: clamped, displayWidth: displayWidth, x: x };
      x += displayWidth;
      return item;
    });
    var indexById = Object.create(null);
    segments.forEach(function (segment, index) { indexById[segment.id] = index; });
    var ranges = array(source.ranges).map(function (item, index) {
      var raw = isObject(item) ? item : {};
      var startRef = raw.startId != null ? raw.startId : raw.start;
      var endRef = raw.endId != null ? raw.endId : raw.end;
      var startIndex = -1;
      var endIndex = -1;
      if (typeof startRef === 'number' && isFinite(startRef) && Math.floor(startRef) === startRef) startIndex = startRef;
      else startIndex = Object.prototype.hasOwnProperty.call(indexById, textOrEmpty(startRef)) ? indexById[textOrEmpty(startRef)] : -1;
      if (typeof endRef === 'number' && isFinite(endRef) && Math.floor(endRef) === endRef) endIndex = endRef;
      else endIndex = Object.prototype.hasOwnProperty.call(indexById, textOrEmpty(endRef)) ? indexById[textOrEmpty(endRef)] : -1;
      if (startIndex < 0 || endIndex < 0 || startIndex >= segments.length || endIndex >= segments.length) return null;
      return {
        id: textOrEmpty(raw.id) || ('range-' + (index + 1)),
        label: raw.label == null ? '' : text(raw.label),
        start: Math.min(startIndex, endIndex),
        end: Math.max(startIndex, endIndex),
        startId: segments[Math.min(startIndex, endIndex)].id,
        endId: segments[Math.max(startIndex, endIndex)].id
      };
    }).filter(Boolean);
    return {
      segments: outputSegments,
      totalValue: sum,
      scaleMax: scaleMax,
      minWidth: minWidth,
      displayWidth: x,
      ranges: ranges,
      invalidRanges: array(source.ranges).length - ranges.length,
      label: source.label == null ? '段条' : text(source.label)
    };
  }
  function modelFromState(state, attachment) {
    return {
      segments: array(state.segments).map(function (segment) {
        return { id: segment.id, label: segment.label, value: segment.value, ratio: segment.ratio, zero: segment.zero === true, clamped: segment.clamped === true, displayWidth: segment.displayWidth, x: segment.x };
      }),
      totalValue: state.totalValue,
      scaleMax: state.scaleMax,
      minWidth: state.minWidth,
      displayWidth: state.displayWidth,
      ranges: array(state.ranges).map(function (range) { return { id: range.id, label: range.label || '', start: range.start, end: range.end, startId: range.startId, endId: range.endId }; }),
      invalidRanges: state.invalidRanges || 0,
      label: attachment.label || '段条'
    };
  }
  function diffGroups(source, target) {
    var groups = [];
    var before = Object.create(null);
    source.segments.forEach(function (segment) { before[segment.id] = segment; });
    target.segments.forEach(function (segment) {
      var old = before[segment.id];
      if (!old || old.value !== segment.value || old.label !== segment.label || old.zero !== segment.zero || old.displayWidth !== segment.displayWidth) groups.push('segment:' + segment.id);
    });
    var oldRanges = Object.create(null);
    source.ranges.forEach(function (range) { oldRanges[range.id] = range; });
    target.ranges.forEach(function (range) {
      var old = oldRanges[range.id];
      if (!old || old.start !== range.start || old.end !== range.end || old.label !== range.label) groups.push('range:' + range.id);
    });
    return groups;
  }
  function normalizeView(input) { return { model: normalizeRaw(input), cues: {} }; }
  function validateAction() { fail('flow-segment 只用于 scene，不支持 actions。'); }
  function mount(host, options) {
    var config = isObject(options) ? options : {};
    var attachment = { label: config.label == null ? '段条' : text(config.label) };
    var api = componentApi();
    var component = api.mount(host, config);
    var destroyed = false;
    function apply(model) {
      component.update({
        segments: model.segments.map(function (segment) { return { id: segment.id, label: segment.label, value: segment.value }; }),
        scaleMax: model.scaleMax,
        minWidth: model.minWidth,
        ranges: model.ranges.map(function (range) { return { id: range.id, label: range.label, start: range.startId, end: range.endId }; }),
        label: model.label
      });
      attachment.label = model.label;
    }
    var handle = {
      restore: function (view) { if (!destroyed) apply(normalizeView(view).model); },
      readView: function () { if (destroyed) return null; return { model: modelFromState(component.getState(), attachment), cues: {} }; },
      target: function (query) {
        if (destroyed || !isObject(query)) return null;
        if (query.part === 'root' || query.part === 'component' || query.part === 'el') return component.el;
        if (query.id != null) return component.getTarget(query.id);
        if (query.target != null) return component.getTarget(query.target);
        if (typeof query.part === 'string' && component.getTarget(query.part)) return component.getTarget(query.part);
        return null;
      },
      prepareChange: function (ctx) {
        if (destroyed) fail('已销毁的实例不能 prepareChange');
        var source = normalizeView(ctx && ctx.sourceView).model;
        var target = normalizeView(ctx && ctx.targetView).model;
        var reduced = !!(ctx && ctx.motion === 'never');
        var groups = diffGroups(source, target);
        var records = [];
        var sourceSegments = Object.create(null);
        source.segments.forEach(function (segment) { sourceSegments[segment.id] = segment; });
        var sourceRanges = Object.create(null);
        source.ranges.forEach(function (range) { sourceRanges[range.id] = range; });
        target.segments.forEach(function (segment) {
          var before = sourceSegments[segment.id];
          if (!before) {
            records.push({ kind: 'new', group: 'segment:' + segment.id, targetKey: segment.id });
            return;
          }
          if (before.value !== segment.value || before.displayWidth !== segment.displayWidth || before.zero !== segment.zero) {
            var groupNode = component.getTarget(segment.id);
            var rect = groupNode && groupNode.querySelector('.nviz-flow-segmentbar__segment-rect');
            var sourceWidth = rect ? Number(rect.getAttribute('width')) : NaN;
            if (rect && isFinite(sourceWidth)) {
              records.push({ kind: 'width', group: 'segment:' + segment.id, targetKey: segment.id, sourceWidth: sourceWidth });
            }
          }
        });
        target.ranges.forEach(function (range) {
          if (!sourceRanges[range.id]) records.push({ kind: 'new', group: 'range:' + range.id, targetKey: 'range:' + range.id });
        });
        function resolveElement(record) {
          if (record.rect) return record.rect;
          if (record.prehideEl) return record.prehideEl;
          return component.getTarget(record.targetKey);
        }
        return {
          groups: function () { return groups.slice(); },
          commit: function () {
            apply(target);
            if (reduced) return;
            records.forEach(function (record) {
              if (record.kind === 'new') {
                var node = component.getTarget(record.targetKey);
                if (!node) return;
                record.prehideEl = node;
                record.savedOpacity = node.style.opacity;
                node.style.opacity = '0';
                return;
              }
              if (record.kind === 'width') {
                var groupNode = component.getTarget(record.targetKey);
                var rect = groupNode && groupNode.querySelector('.nviz-flow-segmentbar__segment-rect');
                var targetWidth = rect ? Number(rect.getAttribute('width')) : NaN;
                if (!rect || !isFinite(targetWidth) || !(targetWidth > 0)) return;
                record.rect = rect;
                record.ratio = record.sourceWidth / targetWidth;
                record.savedTransform = rect.style.transform;
                record.savedTransformBox = rect.style.transformBox;
                record.savedTransformOrigin = rect.style.transformOrigin;
                rect.style.transformBox = 'fill-box';
                rect.style.transformOrigin = 'left center';
                rect.style.transform = 'scaleX(' + record.ratio + ')';
              }
            });
          },
          targets: function () { return []; },
          effects: function (effectCtx) {
            if (reduced) return [];
            var timing = effectCtx && isObject(effectCtx.timing) ? effectCtx.timing : {};
            var duration = typeof timing.enterDuration === 'number' ? Math.max(0, timing.enterDuration) : 420;
            var easing = typeof timing.easing === 'string' ? timing.easing : undefined;
            return records.map(function (record) {
              var node = resolveElement(record);
              if (!node) return null;
              var options = { duration: duration, fill: 'both' };
              if (easing) options.easing = easing;
              if (record.kind === 'new') {
                return { el: node, keyframes: [{ opacity: '0' }, { opacity: '1' }], options: options, group: record.group, gate: 'ready' };
              }
              if (record.kind === 'width') {
                return {
                  el: node,
                  keyframes: [{ transform: 'scaleX(' + record.ratio + ')' }, { transform: 'scaleX(1)' }],
                  options: options,
                  group: record.group,
                  gate: 'ready'
                };
              }
              return null;
            }).filter(Boolean);
          },
          cleanup: function () {
            records.forEach(function (record) {
              if (record.prehideEl) {
                record.prehideEl.style.opacity = record.savedOpacity == null ? '' : record.savedOpacity;
                record.prehideEl = null;
              }
              if (record.rect) {
                record.rect.style.transform = record.savedTransform == null ? '' : record.savedTransform;
                record.rect.style.transformBox = record.savedTransformBox == null ? '' : record.savedTransformBox;
                record.rect.style.transformOrigin = record.savedTransformOrigin == null ? '' : record.savedTransformOrigin;
                record.rect = null;
              }
            });
          }
        };
      },
      destroy: function () { if (destroyed) return; destroyed = true; component.destroy(); }
    };
    return handle;
  }
  Internals.adapters = Internals.adapters || {};
  Internals.adapters[ADAPTER_NAME] = {
    name: ADAPTER_NAME,
    sceneModes: ['cut', 'update'],
    defaultSceneMode: 'update',
    sceneTimingDefaults: { enterDuration: 420, markDuration: 360 },
    normalizeView: normalizeView,
    validateAction: validateAction,
    mount: mount
  };
})(window);