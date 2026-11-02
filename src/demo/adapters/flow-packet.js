/* NoteDemo Adapter — flow-packet (D08 PacketFlow scene adapter).
 * Scope: window.NoteDemoInternals.adapters['flow-packet']; registers itself, does not edit index.js.
 * commit uses PacketFlow.update; readView uses PacketFlow.getState; groups are per changed
 * message/participant; reduced motion commits final state and returns no effects.
 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var ADAPTER_NAME = 'flow-packet';
  function componentApi() {
    var Flow = global.NoteViz && global.NoteViz.Flow;
    var api = Flow && Flow.PacketFlow;
    if (!api || typeof api.mount !== 'function') {
      throw new Error('flow-packetflow Adapter 需要先加载 NoteViz.Flow.PacketFlow（flow-core.js + flow-packet.js）；只加载 demo-runtime 时本 Adapter 可在真实挂载时再报错。');
    }
    return api;
  }
  function fail(message) { throw new Error(ADAPTER_NAME + ' Adapter：' + message); }
  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function text(value) { return value == null ? '' : String(value); }
  function textOrEmpty(value) { return value == null ? '' : String(value).trim(); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function typeOf(value) { return value === 'async' || value === 'return' ? value : 'sync'; }
  function normalizeRaw(input) {
    var source = isObject(input) && isObject(input.model) ? input.model : (isObject(input) ? input : {});
    var participants = array(source.participants).map(function (item, index) {
      var raw = isObject(item) ? item : {};
      var id = textOrEmpty(raw.id) || ('participant-' + (index + 1));
      return { id: id, label: raw.label == null ? id : text(raw.label), note: raw.note == null ? '' : text(raw.note), status: textOrEmpty(raw.status) };
    });
    var indexById = Object.create(null);
    participants.forEach(function (participant, index) { indexById[participant.id] = index; });
    var messages = array(source.messages).map(function (item, index) {
      var raw = isObject(item) ? item : {};
      var id = textOrEmpty(raw.id) || ('message-' + (index + 1));
      var from = textOrEmpty(raw.from);
      var to = textOrEmpty(raw.to);
      var type = typeOf(textOrEmpty(raw.type));
      var dashed = typeof raw.dashed === 'boolean' ? raw.dashed : (type === 'async' ? true : false);
      return {
        id: id, from: from, to: to,
        label: raw.label == null ? '' : text(raw.label),
        note: raw.note == null ? '' : text(raw.note),
        type: type,
        dashed: dashed,
        status: textOrEmpty(raw.status),
        valid: Object.prototype.hasOwnProperty.call(indexById, from) && Object.prototype.hasOwnProperty.call(indexById, to)
      };
    });
    var valid = messages.filter(function (message) { return message.valid; });
    var revealedSet = Object.create(null);
    if (source.revealed != null) {
      array(source.revealed).forEach(function (id) { revealedSet[text(id)] = true; });
    } else if (source.visibleCount != null) {
      var count = Math.max(0, Math.min(valid.length, Math.floor(Number(source.visibleCount) || 0)));
      valid.slice(0, count).forEach(function (message) { revealedSet[message.id] = true; });
    } else {
      valid.forEach(function (message) { revealedSet[message.id] = true; });
    }
    var focus = textOrEmpty(source.focus) || null;
    var current = null;
    var outputMessages = valid.map(function (message) {
      var revealed = !!revealedSet[message.id];
      var item = { id: message.id, from: message.from, to: message.to, label: message.label, note: message.note, type: message.type, dashed: message.dashed, status: message.status, revealed: revealed };
      if (focus === message.id) current = item;
      return item;
    });
    return {
      participants: participants,
      messages: outputMessages,
      revealed: outputMessages.filter(function (message) { return message.revealed; }).map(function (message) { return message.id; }),
      visibleCount: outputMessages.filter(function (message) { return message.revealed; }).length,
      focus: current ? current.id : null,
      current: current,
      showIndexes: source.showIndexes === true,
      label: source.label == null ? '消息流' : text(source.label)
    };
  }
  function modelFromState(state, attachment) {
    return {
      participants: array(state.participants).map(function (participant) {
        return { id: participant.id, label: participant.label, note: participant.note || '', status: participant.status || '' };
      }),
      messages: array(state.messages).map(function (message) {
        return {
          id: message.id, from: message.from, to: message.to,
          label: message.label, note: message.note || '',
          type: typeOf(message.type), dashed: message.dashed === true,
          status: message.status || '', revealed: message.revealed === true
        };
      }),
      revealed: array(state.revealed).slice(),
      visibleCount: state.visibleCount == null ? 0 : state.visibleCount,
      focus: state.focus == null ? null : state.focus,
      current: state.current || null,
      showIndexes: attachment.showIndexes === true,
      label: attachment.label || '消息流'
    };
  }
  function diffGroups(source, target) {
    var groups = [];
    var sourceMessages = Object.create(null);
    source.messages.forEach(function (message) { sourceMessages[message.id] = message; });
    target.messages.forEach(function (message) {
      var before = sourceMessages[message.id];
      if (!before || before.label !== message.label || before.type !== message.type || before.dashed !== message.dashed ||
          before.status !== message.status || before.revealed !== message.revealed || before.from !== message.from || before.to !== message.to) {
        groups.push('message:' + message.id);
      }
    });
    var sourceParticipants = Object.create(null);
    source.participants.forEach(function (participant) { sourceParticipants[participant.id] = participant; });
    target.participants.forEach(function (participant) {
      var before = sourceParticipants[participant.id];
      if (!before || before.label !== participant.label || before.note !== participant.note || before.status !== participant.status) groups.push('participant:' + participant.id);
    });
    return groups;
  }
  function targetFor(group) {
    if (group.indexOf('message:') === 0) return 'message:' + group.slice(8);
    if (group.indexOf('participant:') === 0) return 'participant:' + group.slice(12);
    return null;
  }
  function normalizeView(input) { return { model: normalizeRaw(input), cues: {} }; }
  function validateAction() { fail('flow-packet 只用于 scene，不支持 actions。'); }
  function mount(host, options) {
    var config = isObject(options) ? options : {};
    var attachment = { label: config.label == null ? '消息流' : text(config.label), showIndexes: config.showIndexes === true };
    var api = componentApi();
    var componentOptions = Object.assign({}, config);
    if (config.density != null) componentOptions.density = config.density;
    var component = api.mount(host, componentOptions);
    var destroyed = false;
    function apply(model) {
      component.update({
        participants: model.participants,
        messages: model.messages.map(function (message) {
          return { id: message.id, from: message.from, to: message.to, label: message.label, note: message.note, type: message.type, dashed: message.dashed, status: message.status };
        }),
        revealed: model.revealed,
        focus: model.focus,
        showIndexes: model.showIndexes,
        label: model.label
      });
      attachment.label = model.label;
      attachment.showIndexes = model.showIndexes;
    }
    var handle = {
      restore: function (view) { if (!destroyed) apply(normalizeView(view).model); },
      readView: function () {
        if (destroyed) return null;
        return { model: modelFromState(component.getState(), attachment), cues: {} };
      },
      target: function (query) {
        if (destroyed || !isObject(query)) return null;
        if (query.part === 'root' || query.part === 'component' || query.part === 'el') return component.el;
        if (query.part === 'viewport') return component.getTarget('viewport');
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
        var sourceMessages = Object.create(null);
        source.messages.forEach(function (message) { sourceMessages[message.id] = message; });
        target.messages.forEach(function (message) {
          var before = sourceMessages[message.id];
          if (message.revealed && (!before || !before.revealed)) {
            records.push({ kind: 'reveal', group: 'message:' + message.id, targetKey: 'message:' + message.id });
          }
        });
        function resolveElement(record) {
          if (record.prehideEl) return record.prehideEl;
          return component.getTarget(record.targetKey);
        }
        return {
          groups: function () { return groups.slice(); },
          commit: function () {
            apply(target);
            if (reduced) return;
            records.forEach(function (record) {
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
              return { el: node, keyframes: [{ opacity: '0' }, { opacity: '1' }], options: options, group: record.group, gate: 'ready' };
            }).filter(Boolean);
          },
          cleanup: function () {
            records.forEach(function (record) {
              if (!record.prehideEl) return;
              record.prehideEl.style.opacity = record.savedOpacity == null ? '' : record.savedOpacity;
              record.prehideEl = null;
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