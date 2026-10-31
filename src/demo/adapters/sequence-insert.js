/* NoteDemo Adapter — sequence-insert（R10 序列插入与让位）。
 * Scope: window.NoteDemoInternals.adapters['sequence-insert']
 * Depends on: window.SeqInsert（src/viz/sequence-insert.js；仅在实际 mount/adopt 时检查）。
 * 经典脚本，无模块/无网络/无 eval。
 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var ADAPTER_NAME = 'sequence-insert';

  function fail(message) {
    throw new Error(ADAPTER_NAME + ' Adapter：' + message);
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function requireSeqInsert() {
    var api = global.SeqInsert;
    if (!api || typeof api.mount !== 'function') {
      throw new Error('sequence-insert Adapter 需要先加载 SeqInsert（src/viz/sequence-insert.js）。');
    }
    return api;
  }

  function actionType(action) {
    return isObject(action) && action.type != null ? String(action.type) : '';
  }

  function normalizeView(input) {
    if (!isObject(input)) fail('view 必须是 {inserted:boolean} 对象');
    var inserted = input.inserted;
    if (inserted == null) inserted = false;
    if (typeof inserted !== 'boolean') fail('view.inserted 必须是布尔值');
    return { model: { inserted: inserted }, cues: {} };
  }

  function validateAction(action) {
    if (!isObject(action)) fail('action 必须是 {binding,type,params?} 对象');
    var type = actionType(action);
    if (type !== 'insert' && type !== 'restore') {
      fail('不支持动作 "' + (type || '(空)') + '"，sequence-insert 仅支持 insert / restore。');
    }
    if (action.params != null) {
      if (!isObject(action.params)) fail(type + ' 动作的 params 必须是对象');
      var keys = Object.keys(action.params);
      if (keys.length) fail(type + ' 动作的 params 必须为空对象');
    }
  }

  function createHandle(instance, container, owned) {
    var destroyed = false;
    return {
      restore: function (view) {
        if (destroyed) return;
        var model = isObject(view && view.model) ? view.model : {};
        instance.restoreView({ model: { inserted: !!model.inserted }, cues: {} });
      },
      readView: function () {
        if (destroyed) return null;
        return { model: { inserted: !!instance.inserted }, cues: {} };
      },
      perform: function (action, ctx) {
        var reduced = !!(ctx && ctx.motion === 'reduced');
        var effect = instance.runAction({ type: actionType(action) }, { animate: !reduced });
        if (!effect || !effect.finished || typeof effect.finished.then !== 'function') return effect;
        var finished = effect.finished.then(function (outcome) {
          if (!outcome || outcome.status !== 'completed') return outcome;
          var settle = typeof instance.settleVisual === 'function' ? instance.settleVisual() : null;
          if (!settle || typeof settle.then !== 'function') return outcome;
          return Promise.resolve(settle).then(function () { return outcome; }, function () { return outcome; });
        });
        return {
          finished: finished,
          cancel: function () {
            try { effect.cancel(); } catch (error) { /* 已结束或已销毁 */ }
          }
        };
      },
      target: function (query) {
        if (destroyed) return null;
        if (!isObject(query)) return null;
        var target = typeof instance.getTarget === 'function' ? instance.getTarget(query) : null;
        return target && target.nodeType === 1 ? target : null;
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        if (owned) instance.destroy();
        if (container && container.parentNode) container.parentNode.removeChild(container);
      }
    };
  }

  function mount(host, options) {
    var SeqInsert = requireSeqInsert();
    if (!host || host.nodeType !== 1) {
      throw new TypeError('sequence-insert Adapter.mount(host, options)：host 必须是宿主任意元素。');
    }
    var container = global.document.createElement('div');
    container.className = 'note-demo-adapter note-demo-adapter--sequence-insert';
    container.setAttribute('data-adapter', ADAPTER_NAME);
    host.appendChild(container);
    var instance;
    try {
      instance = SeqInsert.mount(container, isObject(options) ? options : {});
    } catch (error) {
      if (container.parentNode) container.parentNode.removeChild(container);
      throw error;
    }
    if (typeof instance.restoreView !== 'function' || typeof instance.runAction !== 'function' ||
        typeof instance.getTarget !== 'function') {
      instance.destroy();
      if (container.parentNode) container.parentNode.removeChild(container);
      throw new Error('sequence-insert Adapter 需要组件提供 restoreView / runAction / getTarget（请加载新版 src/viz/sequence-insert.js）。');
    }
    return createHandle(instance, container, true);
  }

  function adopt(instance) {
    if (!instance || typeof instance.restoreView !== 'function' || typeof instance.runAction !== 'function' ||
        typeof instance.getTarget !== 'function') {
      fail('adopt 需要一个支持 restoreView / runAction / getTarget 的 SeqInsert 实例。');
    }
    return createHandle(instance, null, false);
  }

  Internals.adapters = Internals.adapters || {};
  Internals.adapters[ADAPTER_NAME] = {
    name: ADAPTER_NAME,
    normalizeView: normalizeView,
    validateAction: validateAction,
    mount: mount,
    adopt: adopt
  };
})(window);