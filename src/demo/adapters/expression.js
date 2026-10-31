/* NoteDemo Adapter — expression（C13；默认 layout，项级排布与内容交换）。
 * Scope: window.NoteDemoInternals.adapters.expression
 * Depends on: NoteCore（可选）、NoteUI.Expression、NoteDemoInternals.effects（只在实际 mount/adopt/prepare 时检查）。
 * 经典脚本，无模块/无网络/无 eval。
 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var ADAPTER_NAME = 'expression';
  var CUE_PROPS = ['backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor',
    'borderLeftColor', 'outlineColor', 'outlineWidth', 'outlineOffset', 'color'];

  function fail(message) {
    throw new Error(ADAPTER_NAME + ' Adapter：' + message);
  }
  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }
  function text(value) {
    return value == null ? '' : String(value);
  }
  function own(object, key) {
    return object != null && Object.prototype.hasOwnProperty.call(object, key);
  }
  function effectsModule() {
    var effects = Internals.effects;
    if (!effects || typeof effects.captureContent !== 'function' ||
        typeof effects.planValueSwap !== 'function' || typeof effects.planCueChanges !== 'function') {
      throw new Error('expression Adapter 需要先加载 NoteDemoInternals.effects。');
    }
    return effects;
  }
  function requireExpression() {
    var ui = global.NoteUI;
    if (!ui || !ui.Expression || typeof ui.Expression.mount !== 'function') {
      throw new Error('expression Adapter 需要先加载 NoteUI.Expression（src/ui/expression.js）。');
    }
    return ui.Expression;
  }
  function normalizeId(value, where) {
    var id = text(value);
    if (!id) fail(where + ' 不能为空');
    return id;
  }
  function normalizeParts(input, where) {
    if (!Array.isArray(input)) fail(where + ' 必须是数组');
    var seen = {};
    var output = [];
    input.forEach(function (part, index) {
      if (!isObject(part)) fail(where + '[' + index + '] 必须是对象');
      var id = normalizeId(part.id, where + '[' + index + '].id');
      if (own(seen, id)) fail(where + ' 中 id "' + id + '" 重复');
      seen[id] = true;
      var hasText = own(part, 'text');
      var hasTex = own(part, 'tex');
      if (hasText === hasTex) fail(where + '[' + index + '] 必须在 text 与 tex 中二选一');
      if (hasText) output.push({ id: id, text: text(part.text) });
      else {
        var tex = text(part.tex);
        if (!tex) fail(where + '[' + index + '].tex 不能为空');
        output.push({ id: id, tex: tex });
      }
    });
    return output;
  }
  function normalizeCueList(input, ids, where) {
    if (input == null) return [];
    if (!Array.isArray(input)) fail(where + ' 必须是数组');
    var seen = {};
    var output = [];
    input.forEach(function (value, index) {
      var id = normalizeId(value, where + '[' + index + ']');
      if (!own(ids, id)) fail(where + ' 引用了不存在的项 "' + id + '"');
      if (!own(seen, id)) {
        seen[id] = true;
        output.push(id);
      }
    });
    return output;
  }
  function normalizeView(input) {
    if (!isObject(input)) fail('view 必须是 {parts,focus?,changed?,label?} 对象');
    var parts = normalizeParts(input.parts == null ? [] : input.parts, 'view.parts');
    var ids = {};
    parts.forEach(function (part) { ids[part.id] = true; });
    return {
      model: { parts: parts, label: text(input.label) },
      cues: {
        focus: normalizeCueList(input.focus, ids, 'view.focus'),
        changed: normalizeCueList(input.changed, ids, 'view.changed')
      }
    };
  }
  function copyModel(model) {
    return {
      parts: model.parts.map(function (part) {
        return part.tex !== undefined ? { id: part.id, tex: part.tex } : { id: part.id, text: part.text };
      }),
      label: model.label
    };
  }
  function copyCues(cues) {
    return { focus: cues.focus.slice(), changed: cues.changed.slice() };
  }
  function canonicalFromState(state) {
    if (!isObject(state) || !Array.isArray(state.parts)) fail('getState() 必须返回 parts');
    var ids = {};
    var parts = state.parts.map(function (part, index) {
      if (!isObject(part)) fail('getState().parts[' + index + '] 不是对象');
      var id = normalizeId(part.id, 'getState().parts[' + index + '].id');
      if (own(ids, id)) fail('getState() 读回重复 id "' + id + '"');
      ids[id] = true;
      if (part.tex !== undefined) return { id: id, tex: text(part.tex) };
      return { id: id, text: text(part.text) };
    });
    return {
      model: { parts: parts, label: text(state.label) },
      cues: {
        focus: normalizeCueList(state.focus, ids, 'getState().focus'),
        changed: normalizeCueList(state.changed, ids, 'getState().changed')
      }
    };
  }
  function viewPatch(view) {
    var model = isObject(view && view.model) ? view.model : { parts: [], label: '' };
    var cues = isObject(view && view.cues) ? view.cues : {};
    return {
      parts: copyModel(model).parts,
      label: text(model.label),
      focus: Array.isArray(cues.focus) ? cues.focus.slice() : [],
      changed: Array.isArray(cues.changed) ? cues.changed.slice() : []
    };
  }
  function validateAction(action) {
    var type = isObject(action) && action.type != null ? String(action.type) : '';
    fail('expression 是 scene 接入 Adapter，不使用 old actions 动作路径' + (type ? '（收到 "' + type + '"）' : '') + '。');
  }
  function rectOf(element) {
    if (!element || typeof element.getBoundingClientRect !== 'function') return null;
    var rect = element.getBoundingClientRect();
    return rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null;
  }
  function targetMap(instance) {
    var list = instance.getMotionTargets();
    var map = {};
    (Array.isArray(list) ? list : []).forEach(function (target) {
      if (target && target.id != null) map[String(target.id)] = target;
    });
    return map;
  }
  function sourceUnits(instance) {
    var list = instance.getMotionTargets();
    var output = {};
    (Array.isArray(list) ? list : []).forEach(function (target) {
      if (!target || !target.unit || typeof target.unit.cloneNode !== 'function') return;
      var clone = target.unit.cloneNode(true);
      clone.removeAttribute('data-part-id');
      clone.removeAttribute('data-mark');
      clone.setAttribute('aria-hidden', 'true');
      if (clone.querySelectorAll) {
        Array.prototype.forEach.call(clone.querySelectorAll('[data-part-id]'), function (item) { item.removeAttribute('data-part-id'); });
        Array.prototype.forEach.call(clone.querySelectorAll('[aria-label]'), function (item) { item.setAttribute('aria-hidden', 'true'); });
      }
      output[target.id] = { clone: clone, rect: rectOf(target.unit) };
    });
    return output;
  }
  function makePreparedChange(instance, context) {
    var sourceView = isObject(context.sourceView) ? context.sourceView : null;
    var targetView = isObject(context.targetView) ? context.targetView : null;
    if (!sourceView || !isObject(sourceView.model)) fail('prepareChange 需要 sourceView.model');
    if (!targetView || !isObject(targetView.model)) fail('prepareChange 需要 targetView.model');
    var effects = effectsModule();
    var sourceParts = sourceView.model.parts || [];
    var targetParts = targetView.model.parts || [];
    var sourceById = {};
    var targetById = {};
    sourceParts.forEach(function (part) { sourceById[part.id] = part; });
    targetParts.forEach(function (part) { targetById[part.id] = part; });
    var sourceTargets = targetMap(instance);
    var clones = sourceUnits(instance);
    var sourceCueStyles = effects.captureStyles(
      Object.keys(sourceTargets).map(function (id) { return { id: id, el: sourceTargets[id].unit }; }),
      CUE_PROPS
    );
    var facts = {
      entered: targetParts.filter(function (part) { return !own(sourceById, part.id); }).map(function (part) { return part.id; }),
      exited: sourceParts.filter(function (part) { return !own(targetById, part.id); }).map(function (part) { return part.id; }),
      valueChanged: targetParts.filter(function (part) {
        var before = sourceById[part.id];
        return before && JSON.stringify(before) !== JSON.stringify(part);
      }).map(function (part) { return part.id; })
    };
    var sourceContents = {};
    facts.valueChanged.forEach(function (id) {
      var source = sourceTargets[id];
      if (!source || !source.contentEl || !source.valueEl) return;
      sourceContents[id] = effects.captureContent({ valueEl: source.valueEl, carrier: source.contentEl });
    });
    var committed = false;
    var ghostCleanups = [];
    var exitGhosts = [];
    var valueGhosts = [];
    var effectsCache = null;
    function cleanup() {
      for (var i = 0; i < ghostCleanups.length; i += 1) {
        try { ghostCleanups[i](); } catch (error) { /* ignore */ }
      }
      ghostCleanups = [];
      for (var e = 0; e < exitGhosts.length; e += 1) {
        try { if (exitGhosts[e].parentNode) exitGhosts[e].parentNode.removeChild(exitGhosts[e]); } catch (error) { /* ignore */ }
      }
      exitGhosts = [];
      for (var v = 0; v < valueGhosts.length; v += 1) {
        try { if (valueGhosts[v].parentNode) valueGhosts[v].parentNode.removeChild(valueGhosts[v]); } catch (error) { /* ignore */ }
      }
      valueGhosts = [];
      if (effectsCache && effectsCache.cleanup) {
        try { effectsCache.cleanup(); } catch (error) { /* ignore */ }
      }
      effectsCache = null;
      try { instance.setSceneActive(false); } catch (error) { /* ignore */ }
    }
    return {
      commit: function () {
        if (committed) return;
        committed = true;
        instance.setSceneActive(true);
        instance.update(viewPatch(targetView));
      },
      targets: function () {
        var list = instance.getMotionTargets();
        return Array.isArray(list) ? list : [];
      },
      effects: function (effectCtx) {
        var motion = isObject(effectCtx) && effectCtx.motion === 'never' ? 'never' : 'auto';
        var timing = isObject(effectCtx) && isObject(effectCtx.timing) ? effectCtx.timing : effects.mergeTiming();
        if (effectsCache) return effectsCache.specs;
        if (motion === 'never') {
          effectsCache = { specs: [], cleanup: function () {} };
          return [];
        }
        var targets = targetMap(instance);
        var specs = [];
        try {
          var enteredIndex = 0;
          facts.entered.forEach(function (id) {
            var target = targets[id];
            if (!target || !target.contentEl) return;
            specs.push({
              el: target.contentEl,
              keyframes: [
                { opacity: '0', transform: 'translateY(6px)' },
                { opacity: '1', transform: 'none' }
              ],
              options: {
                duration: timing.enterDuration,
                delay: enteredIndex * timing.stagger,
                easing: timing.easing,
                fill: 'backwards'
              },
              gate: 'ready'
            });
            enteredIndex += 1;
          });

          facts.exited.forEach(function (id) {
            var source = clones[id];
            if (!source || !source.clone || !source.rect || !instance.el) return;
            var ghost = global.document.createElement('span');
            ghost.className = 'nui-expression__ghost nui-expression__ghost--exit';
            ghost.setAttribute('aria-hidden', 'true');
            ghost.setAttribute('data-exit-ghost', id);
            ghost.style.position = 'fixed';
            ghost.style.left = source.rect.left + 'px';
            ghost.style.top = source.rect.top + 'px';
            ghost.style.width = source.rect.width + 'px';
            ghost.style.height = source.rect.height + 'px';
            ghost.style.display = 'inline-flex';
            ghost.style.alignItems = 'baseline';
            ghost.style.pointerEvents = 'none';
            ghost.style.zIndex = '3';
            ghost.appendChild(source.clone);
            try {
              instance.el.appendChild(ghost);
            } catch (error) {
              ghost = null;
            }
            if (!ghost) return;
            exitGhosts.push(ghost);
            specs.push({
              el: ghost,
              keyframes: [{ opacity: '1' }, { opacity: '1', offset: 0.35 }, { opacity: '0', transform: 'translateY(-6px)' }],
              options: { duration: timing.exitDuration, easing: 'linear', fill: 'backwards' },
              cleanupEl: ghost,
              gate: 'finish'
            });
          });

          var changedIndex = 0;
          facts.valueChanged.forEach(function (id) {
            var target = targets[id];
            if (!target || !target.valueEl) return;
            var swap = effects.planValueSwap({
              source: sourceContents[id],
              target: { carrier: target.contentEl, valueEl: target.valueEl },
              timing: timing,
              recipe: {
                ghostClass: 'nui-expression__ghost nui-expression__ghost--value',
                ghostDisplay: 'inline-flex',
                ghostAlignItems: 'baseline',
                ghostJustifyContent: 'flex-start',
                ghostKeyframes: [
                  { opacity: '1' },
                  { opacity: '1', offset: 0.45 },
                  { opacity: '0' }
                ],
                ghostDuration: timing.valueSwapDuration,
                ghostDelay: timing.valueSwapDelay + changedIndex * timing.stagger,
                ghostEasing: 'linear',
                targetKeyframes: [
                  { opacity: '0' },
                  { opacity: '0', offset: 0.3 },
                  { opacity: '1' }
                ],
                targetDuration: timing.valueSwapDuration,
                targetDelay: timing.valueSwapDelay + changedIndex * timing.stagger,
                targetEasing: 'linear',
                targetGate: 'ready'
              }
            });
            if (swap.cleanup) ghostCleanups.push(swap.cleanup);
            swap.specs.forEach(function (spec) { if (spec.cleanupEl) valueGhosts.push(spec.cleanupEl); });
            specs = specs.concat(swap.specs);
            changedIndex += 1;
          });

          var skip = {};
          facts.entered.concat(facts.exited, facts.valueChanged).forEach(function (id) { skip[id] = true; });
          var cueTargets = Object.keys(targets).filter(function (id) { return !skip[id]; }).map(function (id) {
            return { id: id, el: targets[id].unit };
          });
          specs = specs.concat(effects.planCueChanges({
            source: sourceCueStyles,
            targets: cueTargets,
            timing: timing,
            properties: CUE_PROPS,
            duration: timing.cueDuration,
            gate: 'ready'
          }));

          effectsCache = {
            specs: specs,
            cleanup: function () {
              for (var c = 0; c < ghostCleanups.length; c += 1) {
                try { ghostCleanups[c](); } catch (error) { /* ignore */ }
              }
              ghostCleanups = [];
              for (var e = 0; e < exitGhosts.length; e += 1) {
                try { if (exitGhosts[e].parentNode) exitGhosts[e].parentNode.removeChild(exitGhosts[e]); } catch (error) { /* ignore */ }
              }
              exitGhosts = [];
              valueGhosts = [];
            }
          };
          return specs;
        } catch (error) {
          cleanup();
          throw error;
        }
      },
      facts: function () { return facts; },
      cleanup: cleanup,
      readView: function () {
        return canonicalFromState(instance.getState());
      }
    };
  }
  function createHandle(instance, container, owned) {
    var destroyed = false;
    return {
      restore: function (view) {
        if (destroyed) return;
        instance.update(viewPatch(view));
        instance.setSceneActive(false);
      },
      target: function (query) {
        if (destroyed || !isObject(query)) return null;
        if (query.part === 'root') return instance.el;
        if (query.id == null) return null;
        return instance.getTarget({ id: query.id, part: query.part });
      },
      readView: function () {
        return destroyed ? null : canonicalFromState(instance.getState());
      },
      prepareChange: function (ctx) {
        if (destroyed) fail('已销毁的 expression 实例不能 prepareChange');
        return makePreparedChange(instance, isObject(ctx) ? ctx : {});
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        if (owned && instance.destroy) instance.destroy();
        if (container && container.parentNode) container.parentNode.removeChild(container);
      }
    };
  }
  function mount(host, options) {
    var Expression = requireExpression();
    if (!host || host.nodeType !== 1) throw new TypeError('expression Adapter.mount(host, options)：host 必须是宿主任意元素。');
    var container = global.document.createElement('div');
    container.className = 'note-demo-adapter note-demo-adapter--expression';
    container.setAttribute('data-adapter', ADAPTER_NAME);
    host.appendChild(container);
    var instance;
    try {
      instance = Expression.mount(container, isObject(options) ? options : {});
    } catch (error) {
      if (container.parentNode) container.parentNode.removeChild(container);
      throw error;
    }
    return createHandle(instance, container, true);
  }
  function adopt(instance) {
    if (!instance || typeof instance.update !== 'function' || typeof instance.getState !== 'function' ||
        typeof instance.getMotionTargets !== 'function' || typeof instance.setSceneActive !== 'function') {
      fail('adopt 需要一个 NoteUI.Expression 实例（含 update/getState/getMotionTargets/setSceneActive）。');
    }
    if (instance.destroyed) fail('adopt 的 expression 实例已销毁。');
    return createHandle(instance, null, false);
  }
  Internals.adapters = Internals.adapters || {};
  Internals.adapters[ADAPTER_NAME] = {
    name: ADAPTER_NAME,
    sceneModes: ['layout', 'cut'],
    defaultSceneMode: 'layout',
    sceneTimingDefaults: {
      enterDuration: 360,
      exitDuration: 320,
      valueSwapDelay: 0,
      valueSwapDuration: 420
    },
    normalizeView: normalizeView,
    validateAction: validateAction,
    mount: mount,
    adopt: adopt
  };
})(window);
