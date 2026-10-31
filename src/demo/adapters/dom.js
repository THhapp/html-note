/* NoteDemo Adapter — dom（最小文本占位画面）。
 * Scope: window.NoteDemoInternals.adapters.dom
 * Depends on: NoteCore（可选）、NoteDemoInternals.effects（场景值交换时）。
 * 经典脚本，无模块/无网络/无 eval。
 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var ADAPTER_NAME = 'dom';

  function fail(message) {
    throw new Error(ADAPTER_NAME + ' Adapter：' + message);
  }
  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }
  function effectsModule() {
    var effects = Internals.effects;
    if (!effects || typeof effects.captureContent !== 'function' || typeof effects.planValueSwap !== 'function') {
      throw new Error('dom Adapter 需要先加载 NoteDemoInternals.effects。');
    }
    return effects;
  }
  function normalizeView(input) {
    if (!isObject(input)) fail('view 必须是 {text:string} 对象');
    var value = input.text;
    if (value == null) value = '';
    if (typeof value !== 'string') fail('view.text 必须是字符串');
    return { model: { text: value }, cues: {} };
  }
  function validateAction(action) {
    var type = isObject(action) && action.type != null ? String(action.type) : '';
    fail('dom 是静态恢复型 Adapter，不支持动作' + (type ? ' "' + type + '"' : '') + '。');
  }
  function viewText(view) {
    var model = isObject(view && view.model) ? view.model : {};
    return typeof model.text === 'string' ? model.text : (model.text == null ? '' : String(model.text));
  }
  function canonical(value) {
    return { model: { text: value == null ? '' : String(value) }, cues: {} };
  }
  function makePreparedChange(root, valueSlot, context) {
    var sourceView = isObject(context) ? context.sourceView : null;
    var targetView = isObject(context) ? context.targetView : null;
    var sourceText = viewText(sourceView);
    var targetText = viewText(targetView);
    var effects = effectsModule();
    var source = effects.captureContent({ valueEl: valueSlot, carrier: root });
    var committed = false;
    var ghostCleanup = null;
    return {
      commit: function () {
        if (committed) return;
        committed = true;
        valueSlot.textContent = targetText;
      },
      effects: function (effectCtx) {
        var motion = isObject(effectCtx) && effectCtx.motion === 'never' ? 'never' : 'auto';
        var timing = isObject(effectCtx) && isObject(effectCtx.timing) ? effectCtx.timing : effects.mergeTiming();
        if (sourceText === targetText || motion === 'never') return [];
        var swap = effects.planValueSwap({
          source: source,
          target: { carrier: root, valueEl: valueSlot },
          timing: timing,
          recipe: {
            ghostClass: 'note-demo-dom__ghost',
            ghostDisplay: 'flex',
            ghostAlignItems: 'center',
            ghostJustifyContent: 'flex-start',
            ghostKeyframes: [
              { opacity: '1' },
              { opacity: '1', offset: 0.45 },
              { opacity: '0' }
            ],
            ghostDuration: timing.valueSwapDuration,
            ghostDelay: timing.valueSwapDelay,
            ghostEasing: 'linear',
            targetKeyframes: [
              { opacity: '0' },
              { opacity: '0', offset: 0.35 },
              { opacity: '1' }
            ],
            targetDuration: timing.valueSwapDuration,
            targetDelay: timing.valueSwapDelay,
            targetEasing: 'linear',
            targetGate: 'ready'
          }
        });
        ghostCleanup = swap.cleanup;
        return swap.specs;
      },
      facts: function () {
        return { textChanged: sourceText !== targetText };
      },
      cleanup: function () {
        if (ghostCleanup) {
          try { ghostCleanup(); } catch (error) { /* ignore */ }
          ghostCleanup = null;
        }
      },
      readView: function () {
        return canonical(valueSlot.textContent);
      }
    };
  }
  function initRoot(root) {
    var valueSlot = root.querySelector ? root.querySelector('.note-demo-dom__value') : null;
    if (!valueSlot) {
      valueSlot = global.document.createElement('span');
      valueSlot.className = 'note-demo-dom__value';
      valueSlot.setAttribute('data-adapter-part', 'value');
      var existing = Array.prototype.slice.call(root.childNodes || []);
      existing.forEach(function (node) {
        if (node === valueSlot) return;
        try { valueSlot.appendChild(node); } catch (error) { /* ignore */ }
      });
      root.appendChild(valueSlot);
    }
    return valueSlot;
  }
  function createHandle(root, container, owned) {
    var destroyed = false;
    var valueSlot = initRoot(root);
    return {
      restore: function (view) {
        if (destroyed) return;
        valueSlot.textContent = viewText(view);
      },
      target: function (query) {
        if (destroyed || !isObject(query)) return null;
        if (query.part === 'root') return root;
        if (query.part === 'value') return valueSlot;
        return null;
      },
      readView: function () {
        if (destroyed) return null;
        return canonical(valueSlot.textContent);
      },
      prepareChange: function (context) {
        if (destroyed) fail('已销毁的 dom 实例不能 prepareChange');
        return makePreparedChange(root, valueSlot, context);
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        if (owned && root.parentNode) root.parentNode.removeChild(root);
        if (container && container.parentNode) container.parentNode.removeChild(container);
      }
    };
  }
  function mount(host) {
    if (!host || host.nodeType !== 1) {
      throw new TypeError('dom Adapter.mount(host, options)：host 必须是宿主任意元素。');
    }
    var container = global.document.createElement('div');
    container.className = 'note-demo-adapter note-demo-adapter--dom';
    container.setAttribute('data-adapter', ADAPTER_NAME);
    var root = global.document.createElement('div');
    root.className = 'note-demo-dom';
    root.setAttribute('data-adapter-part', 'root');
    container.appendChild(root);
    host.appendChild(container);
    return createHandle(root, container, true);
  }
  function adopt(instance) {
    var root = null;
    if (instance && instance.nodeType === 1) root = instance;
    else if (instance && instance.el && instance.el.nodeType === 1) root = instance.el;
    if (!root) fail('adopt 需要一个元素或 {el:Element} 作为借用实例。');
    return createHandle(root, null, false);
  }
  Internals.adapters = Internals.adapters || {};
  Internals.adapters[ADAPTER_NAME] = {
    name: ADAPTER_NAME,
    sceneModes: ['cut', 'update', 'reveal'],
    defaultSceneMode: 'update',
    sceneTimingDefaults: {
      valueSwapDelay: 0,
      valueSwapDuration: 420
    },
    normalizeView: normalizeView,
    validateAction: validateAction,
    mount: mount,
    adopt: adopt
  };
})(window);
