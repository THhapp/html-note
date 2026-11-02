/* NoteDemo Adapter — flow-device (D10 DeviceLinks scene adapter).
 * Scope: window.NoteDemoInternals.adapters['flow-device']; registers itself, does not edit index.js.
 * commit uses DeviceLinks.update; readView uses DeviceLinks.getState; groups are per changed
 * device/link; reduced motion commits final state and returns no effects.
 */
(function (global) {
  'use strict';
  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var ADAPTER_NAME = 'flow-device';
  function componentApi() {
    var Flow = global.NoteViz && global.NoteViz.Flow;
    var api = Flow && Flow.DeviceLinks;
    if (!api || typeof api.mount !== 'function') {
      throw new Error('flow-devicelinks Adapter 需要先加载 NoteViz.Flow.DeviceLinks（flow-core.js + flow-device.js）；只加载 demo-runtime 时本 Adapter 可在真实挂载时再报错。');
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
    var devices = array(source.devices).map(function (item, index) {
      var raw = isObject(item) ? item : {};
      var id = textOrEmpty(raw.id) || ('device-' + (index + 1));
      var ports = array(raw.ports).map(function (portSource, portIndex) {
        var port = isObject(portSource) ? portSource : {};
        var portId = textOrEmpty(port.id) || ('port-' + (portIndex + 1));
        return { id: portId, label: port.label == null ? portId : text(port.label) };
      });
      return { id: id, label: raw.label == null ? id : text(raw.label), status: textOrEmpty(raw.status), ports: ports };
    });
    var deviceById = Object.create(null);
    devices.forEach(function (device) {
      var ports = Object.create(null);
      device.ports.forEach(function (port) { ports[port.id] = true; });
      deviceById[device.id] = { ports: ports };
    });
    var links = array(source.links).map(function (item, index) {
      var raw = isObject(item) ? item : {};
      var from = isObject(raw.from) ? raw.from : {};
      var to = isObject(raw.to) ? raw.to : {};
      var fromDevice = textOrEmpty(from.device || from.deviceId || from[0]);
      var fromPort = textOrEmpty(from.port || from.portId || from[1]);
      var toDevice = textOrEmpty(to.device || to.deviceId || to[0]);
      var toPort = textOrEmpty(to.port || to.portId || to[1]);
      var fromInfo = deviceById[fromDevice];
      var toInfo = deviceById[toDevice];
      return {
        id: textOrEmpty(raw.id) || ('link-' + (index + 1)),
        from: { device: fromDevice, port: fromPort },
        to: { device: toDevice, port: toPort },
        label: raw.label == null ? '' : text(raw.label),
        status: textOrEmpty(raw.status),
        valid: !!(fromInfo && fromInfo.ports[fromPort] && toInfo && toInfo.ports[toPort])
      };
    });
    return {
      devices: devices,
      links: links,
      invalidLinks: links.filter(function (link) { return !link.valid; }).length,
      label: source.label == null ? '设备连接' : text(source.label)
    };
  }
  function modelFromState(state, attachment) {
    return {
      devices: array(state.devices).map(function (device) {
        return { id: device.id, label: device.label, status: device.status || '', ports: array(device.ports).map(function (port) { return { id: port.id, label: port.label }; }) };
      }),
      links: array(state.links).map(function (link) {
        return { id: link.id, from: { device: link.from.device, port: link.from.port }, to: { device: link.to.device, port: link.to.port }, label: link.label || '', status: link.status || '', valid: link.valid === true };
      }),
      invalidLinks: state.invalidLinks || 0,
      label: attachment.label || '设备连接'
    };
  }
  function diffGroups(source, target) {
    var groups = [];
    var beforeDevices = Object.create(null);
    source.devices.forEach(function (device) { beforeDevices[device.id] = device; });
    target.devices.forEach(function (device) {
      var before = beforeDevices[device.id];
      if (!before || before.label !== device.label || before.status !== device.status || JSON.stringify(before.ports) !== JSON.stringify(device.ports)) groups.push('device:' + device.id);
    });
    var beforeLinks = Object.create(null);
    source.links.forEach(function (link) { beforeLinks[link.id] = link; });
    target.links.forEach(function (link) {
      var before = beforeLinks[link.id];
      if (!before || before.label !== link.label || before.status !== link.status || JSON.stringify(before.from) !== JSON.stringify(link.from) || JSON.stringify(before.to) !== JSON.stringify(link.to)) groups.push('link:' + link.id);
    });
    return groups;
  }
  function normalizeView(input) { return { model: normalizeRaw(input), cues: {} }; }
  function validateAction() { fail('flow-device 只用于 scene，不支持 actions。'); }
  function mount(host, options) {
    var config = isObject(options) ? options : {};
    var attachment = { label: config.label == null ? '设备连接' : text(config.label) };
    var api = componentApi();
    var component = api.mount(host, config);
    var destroyed = false;
    function apply(model) {
      component.update({
        devices: model.devices,
        links: model.links.map(function (link) {
          return { id: link.id, from: { device: link.from.device, port: link.from.port }, to: { device: link.to.device, port: link.to.port }, label: link.label, status: link.status };
        }),
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
        return {
          groups: function () { return groups.slice(); },
          commit: function () { apply(target); },
          targets: function () { return []; },
          effects: function (effectCtx) {
            if (reduced) return [];
            var timing = effectCtx && isObject(effectCtx.timing) ? effectCtx.timing : {};
            var duration = typeof timing.enterDuration === 'number' ? Math.max(0, timing.enterDuration) : 420;
            var specs = [];
            groups.forEach(function (group) {
              var node = component.getTarget(group);
              if (!node) return;
              specs.push({ el: node, keyframes: [{ opacity: '0.3' }, { opacity: '1' }], options: { duration: duration, easing: timing.easing }, group: group, gate: 'ready' });
            });
            return specs;
          },
          cleanup: function () {}
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