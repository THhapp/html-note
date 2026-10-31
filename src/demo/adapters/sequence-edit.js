/* NoteDemo Adapter — sequence-edit（M01 序列编辑）。
 * Scope: window.NoteDemoInternals.adapters['sequence-edit']
 * Depends on: NoteCore、NoteViz.SequenceEdit（仅在实际 mount/adopt 时检查）。
 * 经典脚本，无模块/无网络/无 eval。
 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var ADAPTER_NAME = 'sequence-edit';

  function fail(message) {
    throw new Error(ADAPTER_NAME + ' Adapter：' + message);
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function requireSequenceEdit() {
    var viz = global.NoteViz;
    if (!viz || !viz.SequenceEdit || typeof viz.SequenceEdit.mount !== 'function') {
      throw new Error('sequence-edit Adapter 需要先加载 NoteViz.SequenceEdit（src/viz/mechanisms-sequence-edit.js）。');
    }
    return viz.SequenceEdit;
  }

  function normalizeId(value, where) {
    if (value == null) fail(where + ' 不能为空');
    if (typeof value !== 'string' && typeof value !== 'number') fail(where + ' 必须是字符串 ID');
    var id = String(value);
    if (id === '') fail(where + ' 不能为空字符串');
    return id;
  }

  function normalizeItems(input) {
    if (!Array.isArray(input)) fail('view.items 必须是数组');
    var seen = {};
    var result = [];
    input.forEach(function (entry, index) {
      if (!isObject(entry)) fail('view.items[' + index + '] 必须是 {id,label} 对象');
      var id = normalizeId(entry.id, 'view.items[' + index + '].id');
      if (Object.prototype.hasOwnProperty.call(seen, id)) fail('view.items 中的 id "' + id + '" 重复');
      seen[id] = true;
      var label = entry.label;
      if (label == null) label = '';
      if (typeof label !== 'string') fail('view.items[' + index + '].label 必须是字符串');
      result.push({ id: id, label: label });
    });
    return result;
  }

  function normalizeIdList(value, where, allowed) {
    if (value == null) return [];
    if (!Array.isArray(value)) fail(where + ' 必须是 ID 数组');
    var seen = {};
    var result = [];
    value.forEach(function (entry, index) {
      var id = normalizeId(entry, where + '[' + index + ']');
      if (allowed && !allowed[id]) fail(where + '[' + index + '] 引用了不存在的对象 "' + id + '"');
      if (!seen[id]) {
        seen[id] = true;
        result.push(id);
      }
    });
    result.sort();
    return result;
  }

  function actionType(action) {
    return isObject(action) && action.type != null ? String(action.type) : '';
  }

  function actionParams(action) {
    return isObject(action) && isObject(action.params) ? action.params : {};
  }

  function normalizeView(input) {
    if (!isObject(input)) fail('view 必须是 {items,focus?,changed?} 对象');
    var items = normalizeItems(input.items);
    var allowed = {};
    items.forEach(function (item) { allowed[item.id] = true; });
    return {
      model: { items: items },
      cues: {
        focus: normalizeIdList(input.focus, 'view.focus', allowed),
        changed: normalizeIdList(input.changed, 'view.changed', allowed)
      }
    };
  }

  function validateAction(action) {
    if (!isObject(action)) fail('action 必须是 {binding,type,params?} 对象');
    var type = actionType(action);
    if (type === 'remove') {
      var removeId = actionParams(action).id;
      if (removeId == null) fail('remove 动作缺少 params.id');
      normalizeId(removeId, 'remove.params.id');
      return;
    }
    if (type === 'swap') {
      var params = actionParams(action);
      if (params.a == null || params.b == null) fail('swap 动作缺少 params.a / params.b');
      normalizeId(params.a, 'swap.params.a');
      normalizeId(params.b, 'swap.params.b');
      return;
    }
    fail('不支持动作 "' + (type || '(空)') + '"，sequence-edit 仅支持 remove / swap。');
  }

  function readViewFrom(state) {
    var items = (Array.isArray(state && state.items) ? state.items : []).map(function (item) {
      return { id: String(item.id), label: item.label == null ? '' : String(item.label) };
    });
    return {
      model: { items: items },
      cues: {
        focus: (Array.isArray(state && state.focus) ? state.focus : []).map(function (id) { return String(id); }),
        changed: (Array.isArray(state && state.changed) ? state.changed : []).map(function (id) { return String(id); })
      }
    };
  }

  function createHandle(instance, container, owned) {
    var destroyed = false;
    return {
      restore: function (view) {
        if (destroyed) return;
        var model = isObject(view && view.model) ? view.model : { items: [] };
        var cues = isObject(view && view.cues) ? view.cues : {};
        instance.restoreView({
          model: { items: model.items },
          cues: { focus: cues.focus, changed: cues.changed }
        });
      },
      readView: function () {
        if (destroyed) return null;
        return readViewFrom(instance.getState());
      },
      applyCues: function (cues) {
        if (destroyed) return;
        var input = isObject(cues) ? cues : {};
        instance.applyViewCues({ focus: input.focus, changed: input.changed });
      },
      perform: function (action, ctx) {
        var reduced = !!(ctx && ctx.motion === 'reduced');
        return instance.runAction(
          { type: actionType(action), params: actionParams(action) },
          { animate: !reduced }
        );
      },
      settleVisual: function () {
        if (destroyed) return Promise.resolve();
        return typeof instance.settleVisual === 'function' ? instance.settleVisual() : Promise.resolve();
      },
      target: function (query) {
        if (destroyed) return null;
        if (!isObject(query) || query.id == null) return null;
        var target = instance.getTarget(query.id);
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
    var SequenceEdit = requireSequenceEdit();
    if (!host || host.nodeType !== 1) {
      throw new TypeError('sequence-edit Adapter.mount(host, options)：host 必须是宿主任意元素。');
    }
    var container = global.document.createElement('div');
    container.className = 'note-demo-adapter note-demo-adapter--sequence-edit';
    container.setAttribute('data-adapter', ADAPTER_NAME);
    host.appendChild(container);
    var instance;
    try {
      instance = SequenceEdit.mount(container, isObject(options) ? options : {});
    } catch (error) {
      if (container.parentNode) container.parentNode.removeChild(container);
      throw error;
    }
    if (typeof instance.restoreView !== 'function' || typeof instance.applyViewCues !== 'function' ||
        typeof instance.runAction !== 'function') {
      instance.destroy();
      if (container.parentNode) container.parentNode.removeChild(container);
      throw new Error('sequence-edit Adapter 需要组件提供 restoreView / applyViewCues / runAction（请加载新版 src/viz/mechanisms-sequence-edit.js）。');
    }
    return createHandle(instance, container, true);
  }

  function adopt(instance) {
    if (!instance || typeof instance.restoreView !== 'function' || typeof instance.applyViewCues !== 'function' ||
        typeof instance.runAction !== 'function' || typeof instance.getState !== 'function') {
      fail('adopt 需要一个支持 restoreView / applyViewCues / runAction 的 NoteViz.SequenceEdit 实例。');
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