/* NoteDemo Adapter — flow-stage (D07 StageTrack scene adapter).
 * Scope: window.NoteDemoInternals.adapters['flow-stage']; registers itself, does not edit index.js.
 * Public scene contract only: normalizeView / mount(handle: restore/readView/target/prepareChange/destroy).
 * commit uses StageTrack.update; readView uses StageTrack.getState; effects are local reveal hints;
 * reduced motion commits the final state and returns no effects. Groups are per changed stage/bypass.
 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var ADAPTER_NAME = 'flow-stage';
  function componentApi() {
    var Flow = global.NoteViz && global.NoteViz.Flow;
    var api = Flow && Flow.StageTrack;
    if (!api || typeof api.mount !== 'function') {
      throw new Error('flow-stage Adapter 需要先加载 NoteViz.Flow.StageTrack（flow-core.js + flow-stage.js）；只加载 demo-runtime 时本 Adapter 可在真实挂载时再报错。');
    }
    return api;
  }
  function fail(message) { throw new Error(ADAPTER_NAME + ' Adapter：' + message); }
  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function text(value) { return value == null ? '' : String(value); }
  function textOrEmpty(value) { return value == null ? '' : String(value).trim(); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function idList(source, prefix) {
    return array(source).map(function (item) { return textOrEmpty(item); }).filter(Boolean);
  }
  function statusSet(value) {
    var set = Object.create(null);
    idList(value).forEach(function (item) { set[item] = true; });
    return set;
  }
  function normalizeRaw(input) {
    var source = isObject(input) && isObject(input.model) ? input.model : (isObject(input) ? input : {});
    var stages = array(source.stages).map(function (item, index) {
      var raw = isObject(item) ? item : {};
      return {
        id: textOrEmpty(raw.id) || ('stage-' + (index + 1)),
        label: raw.label == null ? textOrEmpty(raw.id) || ('stage-' + (index + 1)) : text(raw.label),
        status: textOrEmpty(raw.status) || null
      };
    });
    var indexById = Object.create(null);
    stages.forEach(function (stage, index) { indexById[stage.id] = index; });
    var skipped = statusSet(source.skipped);
    var failed = statusSet(source.failed);
    var current = textOrEmpty(source.current);
    var target = textOrEmpty(source.target);
    var currentIndex = Object.prototype.hasOwnProperty.call(indexById, current) ? indexById[current] : -1;
    var bypass = array(source.bypass).map(function (item, index) {
      var raw = isObject(item) ? item : {};
      return {
        from: textOrEmpty(raw.from),
        to: textOrEmpty(raw.to),
        label: raw.label == null ? '' : text(raw.label),
        id: 'bypass:' + textOrEmpty(raw.from) + '>' + textOrEmpty(raw.to)
      };
    }).filter(function (item) {
      return item.from && item.to && Object.prototype.hasOwnProperty.call(indexById, item.from) && Object.prototype.hasOwnProperty.call(indexById, item.to);
    });
    function derive(stage, index) {
      if (stage.status) return stage.status;
      if (failed[stage.id]) return 'failed';
      if (skipped[stage.id]) return 'skipped';
      if (currentIndex >= 0 && index === currentIndex) return 'current';
      if (currentIndex >= 0 && index < currentIndex) return 'done';
      return 'pending';
    }
    return {
      stages: stages.map(function (stage, index) {
        return { id: stage.id, label: stage.label, status: derive(stage, index), target: !!target && stage.id === target };
      }),
      current: Object.prototype.hasOwnProperty.call(indexById, current) ? current : null,
      target: Object.prototype.hasOwnProperty.call(indexById, target) ? target : null,
      skipped: stages.filter(function (stage) { return skipped[stage.id]; }).map(function (stage) { return stage.id; }),
      failed: stages.filter(function (stage) { return failed[stage.id]; }).map(function (stage) { return stage.id; }),
      bypass: bypass,
      invalidBypass: 0,
      statusLabels: isObject(source.statusLabels) ? source.statusLabels : null,
      label: source.label == null ? '阶段轨' : text(source.label)
    };
  }
  function modelFromState(state, attachment) {
    return {
      stages: array(state.stages).map(function (stage) { return { id: stage.id, label: stage.label, status: stage.status, target: stage.target === true }; }),
      current: state.current == null ? null : state.current,
      target: state.target == null ? null : state.target,
      skipped: array(state.skipped).slice(),
      failed: array(state.failed).slice(),
      bypass: array(state.bypass).map(function (item) { return { from: item.from, to: item.to, label: item.label || '', id: item.id }; }),
      invalidBypass: state.invalidBypass || 0,
      statusLabels: attachment.statusLabels || null,
      label: attachment.label || '阶段轨'
    };
  }
  function diffGroups(source, target) {
    var groups = [];
    var sourceStage = Object.create(null);
    source.stages.forEach(function (stage) { sourceStage[stage.id] = stage; });
    target.stages.forEach(function (stage) {
      var before = sourceStage[stage.id];
      if (!before || before.status !== stage.status || before.label !== stage.label || before.target !== stage.target) groups.push('stage:' + stage.id);
    });
    var sourceBypass = Object.create(null);
    source.bypass.forEach(function (item) { sourceBypass[item.id] = item; });
    target.bypass.forEach(function (item) {
      var before = sourceBypass[item.id];
      if (!before || before.label !== item.label) groups.push(item.id);
    });
    return groups;
  }
  function targetKeyFor(group) {
    if (group.indexOf('stage:') === 0) return group.slice(6);
    if (group.indexOf('bypass:') === 0) return group;
    return null;
  }
  function normalizeView(input) {
    var model = normalizeRaw(input);
    return { model: model, cues: {} };
  }
  function validateAction() { fail('flow-stage 只用于 scene，不支持 actions。'); }
  function mount(host, options) {
    var config = isObject(options) ? options : {};
    var attachment = { label: config.label == null ? '阶段轨' : text(config.label), statusLabels: isObject(config.statusLabels) ? config.statusLabels : null };
    var api = componentApi();
    var component = api.mount(host, config);
    var destroyed = false;
    function apply(model) {
      component.update({
        stages: model.stages.map(function (stage) { return { id: stage.id, label: stage.label, status: stage.status }; }),
        current: model.current,
        target: model.target,
        skipped: model.skipped,
        failed: model.failed,
        bypass: model.bypass.map(function (item) { return { from: item.from, to: item.to, label: item.label }; }),
        statusLabels: model.statusLabels,
        label: model.label
      });
      attachment.label = model.label;
      attachment.statusLabels = model.statusLabels;
    }
    var handle = {
      restore: function (view) { if (!destroyed) apply(normalizeView(view).model); },
      readView: function () {
        if (destroyed) return null;
        var state = component.getState();
        return { model: modelFromState(state, attachment), cues: {} };
      },
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
        var sourceStages = Object.create(null);
        source.stages.forEach(function (stage) { sourceStages[stage.id] = stage; });
        var sourceBypass = Object.create(null);
        source.bypass.forEach(function (item) { sourceBypass[item.id] = item; });
        function styleValue(node, property) {
          return node && global.getComputedStyle ? global.getComputedStyle(node).getPropertyValue(property) : '';
        }
        function resolveElement(record) {
          if (record.prehideEl) return record.prehideEl;
          if (record.kind === 'new') {
            return record.target === 'stage' ? component.getTarget(record.id) : component.getTarget(record.group);
          }
          return record.el || null;
        }
        groups.forEach(function (group) {
          if (group.indexOf('stage:') === 0) {
            var id = group.slice(6);
            var before = sourceStages[id];
            var targetStage = null;
            target.stages.forEach(function (stage) { if (stage.id === id) targetStage = stage; });
            if (!targetStage) return;
            if (!before) {
              records.push({ kind: 'new', group: group, target: 'stage', id: id });
            } else if (before.status !== targetStage.status || before.label !== targetStage.label || before.target !== targetStage.target) {
              var node = component.getTarget(id);
              if (node) records.push({
                kind: 'stage-style', group: group, id: id, el: node,
                source: { border: styleValue(node, 'border-top-color'), background: styleValue(node, 'background-color') }
              });
            }
          } else if (group.indexOf('bypass:') === 0 && !sourceBypass[group]) {
            records.push({ kind: 'new', group: group, target: 'bypass' });
          }
        });
        return {
          groups: function () { return groups.slice(); },
          commit: function () {
            apply(target);
            if (reduced) return;
            records.forEach(function (record) {
              if (record.kind !== 'new') return;
              var node = resolveElement(record);
              if (!node) return;
              record.prehideEl = node;
              record.savedOpacity = node.style.opacity;
              node.style.opacity = '0';
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
              if (record.kind === 'stage-style') {
                return {
                  el: node,
                  keyframes: [
                    { borderColor: record.source.border, backgroundColor: record.source.background },
                    { borderColor: styleValue(node, 'border-top-color'), backgroundColor: styleValue(node, 'background-color') }
                  ],
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
              if (record.kind !== 'new' || !record.prehideEl) return;
              record.prehideEl.style.opacity = record.savedOpacity == null ? '' : record.savedOpacity;
              record.prehideEl = null;
            });
          }
        };
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        component.destroy();
      }
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