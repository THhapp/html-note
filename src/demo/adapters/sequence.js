/* NoteDemo Adapter — sequence（D01 序列 scene 接入；layout / cut / reveal）。
 * Scope: window.NoteDemoInternals.adapters.sequence
 * Depends on: NoteViz.Sequence（src/viz/objects-sequence-matrix.js；仅在实际 mount/adopt 时检查）。
 * 经典脚本，无模块/无网络/无 eval。
 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var ADAPTER_NAME = 'sequence';
  var SCENE_MODES = ['layout', 'cut', 'reveal'];
  var EASE = 'cubic-bezier(.3,0,.15,1)';
  var GROUP_STRUCT_FIELDS = ['start', 'count', 'from', 'to'];
  var CUE_PROPS = ['backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor',
    'borderLeftColor', 'outlineColor', 'outlineWidth', 'outlineOffset', 'color'];
  var DEFAULT_TIMING = {
    enterDuration: 420,
    stagger: 40,
    valueSwapDelay: 160,
    valueSwapDuration: 420,
    valueFlashDuration: 560,
    markDelay: 200,
    markDuration: 420
  };

  function fail(message) {
    throw new Error(ADAPTER_NAME + ' Adapter：' + message);
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function hasOwn(object, key) {
    return object != null && Object.prototype.hasOwnProperty.call(Object(object), key);
  }

  function effectsModule() {
    var effects = Internals.effects;
    if (!effects || typeof effects.captureContent !== 'function' || typeof effects.planValueSwap !== 'function' ||
        typeof effects.planCueChanges !== 'function') {
      throw new Error('sequence Adapter 需要先加载 NoteDemoInternals.effects。');
    }
    return effects;
  }

  function requireSequence() {
    var viz = global.NoteViz;
    if (!viz || !viz.Sequence || typeof viz.Sequence.mount !== 'function') {
      throw new Error('sequence Adapter 需要先加载 NoteViz.Sequence（src/viz/objects-sequence-matrix.js）。');
    }
    return viz.Sequence;
  }

  /* ---------------- 规范化 ---------------- */

  function normalizeItemId(value, where) {
    if (typeof value !== 'string' || value === '') {
      fail(where + ' 必须是非空字符串 ID');
    }
    return value;
  }

  function normalizeRefId(value, where) {
    return normalizeItemId(value, where);
  }

  function normalizeItems(input, where) {
    if (!Array.isArray(input)) fail(where + ' 必须是数组');
    var seen = {};
    var result = [];
    input.forEach(function (entry, index) {
      if (!isObject(entry)) fail(where + '[' + index + '] 必须是 {id,value,label} 对象');
      var id = normalizeItemId(entry.id, where + '[' + index + '].id');
      if (hasOwn(seen, id)) fail(where + ' 中的 id "' + id + '" 重复');
      seen[id] = true;
      var value = entry.value;
      value = value == null ? '' : String(value);
      var label = entry.label;
      label = label == null ? '' : String(label);
      result.push({ id: id, value: value, label: label });
    });
    return result;
  }

  function normalizeGroups(input, itemIds, where) {
    if (input == null) return [];
    if (!Array.isArray(input)) fail(where + ' 必须是数组');
    var assigned = {};
    var result = [];
    input.forEach(function (group, index) {
      if (!isObject(group)) fail(where + '[' + index + '] 必须是 {label,ids} 对象');
      GROUP_STRUCT_FIELDS.forEach(function (field) {
        if (hasOwn(group, field)) {
          fail(where + '[' + index + '] 只接受 {label,ids} 分组，不接受 ' + field + ' 形式');
        }
      });
      var label = group.label;
      if (label == null) label = '';
      if (typeof label !== 'string') fail(where + '[' + index + '].label 必须是字符串');
      if (!Array.isArray(group.ids)) fail(where + '[' + index + '].ids 必须是 ID 数组');
      var ids = [];
      group.ids.forEach(function (ref, refIndex) {
        var id = normalizeRefId(ref, where + '[' + index + '].ids[' + refIndex + ']');
        if (!hasOwn(itemIds, id)) fail(where + '[' + index + '].ids[' + refIndex + '] 引用了不存在的对象 "' + id + '"');
        if (hasOwn(assigned, id)) fail(where + ' 中的 id "' + id + '" 被重复分组');
        assigned[id] = true;
        ids.push(id);
      });
      result.push({ label: label, ids: ids });
    });
    return result;
  }

  function normalizeCueList(input, itemIds, where) {
    if (input == null) return [];
    if (!Array.isArray(input)) fail(where + ' 必须是 ID 数组');
    var seen = {};
    var result = [];
    input.forEach(function (ref, index) {
      var id = normalizeRefId(ref, where + '[' + index + ']');
      if (!hasOwn(itemIds, id)) fail(where + '[' + index + '] 引用了不存在的对象 "' + id + '"');
      if (hasOwn(seen, id)) return;
      seen[id] = true;
      result.push(id);
    });
    result.sort();
    return result;
  }

  function itemIdSet(items) {
    var set = {};
    items.forEach(function (item) { set[item.id] = true; });
    return set;
  }

  function normalizeView(input) {
    if (!isObject(input)) fail('view 必须是 {items,groups?,focus?,changed?} 对象');
    var items = normalizeItems(input.items, 'view.items');
    var itemIds = itemIdSet(items);
    return {
      model: {
        items: items,
        groups: normalizeGroups(input.groups, itemIds, 'view.groups')
      },
      cues: {
        focus: normalizeCueList(input.focus, itemIds, 'view.focus'),
        changed: normalizeCueList(input.changed, itemIds, 'view.changed')
      }
    };
  }

  function canonicalFromState(state) {
    if (!isObject(state) || !Array.isArray(state.items)) {
      fail('getState() 没有返回 items 数组，无法读回真实状态');
    }
    var items = state.items.map(function (item, index) {
      if (!isObject(item)) fail('getState().items[' + index + '] 不是对象');
      return {
        id: normalizeItemId(item.id, 'getState().items[' + index + '].id'),
        value: item.value == null ? '' : String(item.value),
        label: item.label == null ? '' : String(item.label)
      };
    });
    var itemIds = {};
    items.forEach(function (item) {
      if (hasOwn(itemIds, item.id)) fail('getState() 读回重复 id "' + item.id + '"');
      itemIds[item.id] = true;
    });
    var cues = isObject(state.cues) ? state.cues : {};
    return {
      model: {
        items: items,
        groups: normalizeGroups(state.groups, itemIds, 'getState().groups')
      },
      cues: {
        focus: normalizeCueList(cues.focus, itemIds, 'getState().cues.focus'),
        changed: normalizeCueList(cues.changed, itemIds, 'getState().cues.changed')
      }
    };
  }

  function copyItems(items) {
    return items.map(function (item) {
      return { id: item.id, value: item.value, label: item.label };
    });
  }

  function copyGroups(groups) {
    return groups.map(function (group) {
      return { label: group.label, ids: group.ids.slice() };
    });
  }

  function validateAction(action) {
    var type = isObject(action) && action.type != null ? String(action.type) : '';
    fail('sequence 是 scene 接入 Adapter，不使用 old actions 动作路径' +
      (type ? '（收到 "' + type + '"）' : '') + '。');
  }

  /* ---------------- 动作准备 ---------------- */

  function mergeTiming(input) {
    var timing = {
      enterDuration: DEFAULT_TIMING.enterDuration,
      stagger: DEFAULT_TIMING.stagger,
      valueSwapDelay: DEFAULT_TIMING.valueSwapDelay,
      valueSwapDuration: DEFAULT_TIMING.valueSwapDuration,
      valueFlashDuration: DEFAULT_TIMING.valueFlashDuration,
      markDelay: DEFAULT_TIMING.markDelay,
      markDuration: DEFAULT_TIMING.markDuration,
      cueDuration: 520,
      easing: EASE
    };
    if (isObject(input)) {
      Object.keys(timing).forEach(function (key) {
        if (key === 'easing') {
          if (typeof input.easing === 'string' && input.easing !== '') timing.easing = input.easing;
          return;
        }
        if (typeof input[key] === 'number' && isFinite(input[key]) && input[key] >= 0) {
          timing[key] = input[key];
        }
      });
    }
    return timing;
  }

  function makePreparedChange(instance, context) {
    var sourceView = isObject(context.sourceView) ? context.sourceView : null;
    var targetView = isObject(context.targetView) ? context.targetView : null;
    if (!sourceView || !isObject(sourceView.model) || !Array.isArray(sourceView.model.items)) {
      fail('prepareChange 需要 sourceView.model.items 数组');
    }
    if (!targetView || !isObject(targetView.model) || !Array.isArray(targetView.model.items)) {
      fail('prepareChange 需要 targetView.model.items 数组');
    }
    var motion = context.motion === 'never' ? 'never' : 'auto';
    var targetItems = copyItems(targetView.model.items);
    var targetGroups = copyGroups(Array.isArray(targetView.model.groups) ? targetView.model.groups : []);
    var targetCues = isObject(targetView.cues) ? targetView.cues : {};
    var targetFocus = Array.isArray(targetCues.focus) ? targetCues.focus.map(String) : [];
    var targetChanged = Array.isArray(targetCues.changed) ? targetCues.changed.map(String) : [];
    var sourceItems = sourceView.model.items;
    var sourceById = {};
    sourceItems.forEach(function (item) {
      if (item && item.id != null) sourceById[String(item.id)] = item;
    });
    var sourceFocus = {};
    var sourceCues = isObject(sourceView.cues) ? sourceView.cues : {};
    (Array.isArray(sourceCues.focus) ? sourceCues.focus : []).forEach(function (id) {
      sourceFocus[String(id)] = true;
    });
    var effects = effectsModule();
    var sourceTargetMap = {};
    var sourceTargets = instance.getMotionTargets();
    (Array.isArray(sourceTargets) ? sourceTargets : []).forEach(function (target) {
      if (target && target.id != null) sourceTargetMap[String(target.id)] = target;
    });
    var capturedFacts = computeFacts();
    var sourceContents = {};
    capturedFacts.valueChanged.forEach(function (id) {
      var source = sourceTargetMap[id];
      if (!source || !source.contentEl || !source.valueEl) return;
      sourceContents[id] = effects.captureContent({ valueEl: source.valueEl, carrier: source.contentEl });
    });
    var sourceCueStyles = effects.captureStyles(Object.keys(sourceTargetMap).map(function (id) {
      return { id: id, el: sourceTargetMap[id].contentEl };
    }), CUE_PROPS);
    var committed = false;
    var cleaned = false;
    var factsValue = capturedFacts;
    var ghostCleanups = [];

    function computeFacts() {
      var targetById = {};
      var entered = [];
      var valueChanged = [];
      var exited = [];
      targetItems.forEach(function (item) {
        targetById[item.id] = item;
        if (!hasOwn(sourceById, item.id)) {
          entered.push(item.id);
        } else {
          var before = sourceById[item.id];
          var beforeValue = before.value == null ? '' : String(before.value);
          if (beforeValue !== item.value) valueChanged.push(item.id);
        }
      });
      sourceItems.forEach(function (item) {
        var id = item && item.id != null ? String(item.id) : '';
        if (id !== '' && !hasOwn(targetById, id)) exited.push(id);
      });
      return { entered: entered, exited: exited, valueChanged: valueChanged };
    }

    function facts() {
      if (!factsValue) factsValue = computeFacts();
      return {
        entered: factsValue.entered.slice(),
        exited: factsValue.exited.slice(),
        valueChanged: factsValue.valueChanged.slice()
      };
    }

    function commit() {
      if (committed) return;
      committed = true;
      /* 先切换 scene 状态（暂停受控节点原 CSS transition），再同步提交唯一一次完整目标。 */
      instance.setSceneActive(true);
      instance.update({
        items: copyItems(targetItems),
        groups: copyGroups(targetGroups),
        focus: targetFocus.slice(),
        changed: targetChanged.slice()
      });
    }

    function targets() {
      var list = instance.getMotionTargets();
      if (!Array.isArray(list)) return [];
      return list.map(function (item) {
        return {
          id: item.id,
          layoutEl: item.unit,
          unit: item.unit,
          contentEl: item.contentEl,
          valueEl: item.valueEl,
          labelEl: item.labelEl,
          markEl: item.markEl
        };
      });
    }

    function collectEnteredEffects(specs, byId, timing) {
      var enteredIndex = 0;
      targetItems.forEach(function (item) {
        if (hasOwn(sourceById, item.id)) return;
        var target = byId[item.id];
        if (!target || !target.contentEl) return;
        specs.push({
          el: target.contentEl,
          keyframes: [
            { opacity: '0', transform: 'translateY(-4px) scale(.94)' },
            { opacity: '1', transform: 'none' }
          ],
          options: {
            duration: timing.enterDuration,
            delay: enteredIndex * timing.stagger,
            easing: timing.easing,
            fill: 'backwards'
          }
        });
        enteredIndex += 1;
      });
    }


    function collectValueEffects(specs, byId, timing) {
      var changedIndex = 0;
      targetItems.forEach(function (item) {
        var before = sourceById[item.id];
        if (!before) return;
        var beforeValue = before.value == null ? '' : String(before.value);
        if (beforeValue === item.value) return;
        var target = byId[item.id];
        if (!target || !target.valueEl) return;
        var swapDelay = timing.valueSwapDelay + changedIndex * timing.stagger;
        var swap = effects.planValueSwap({
          source: sourceContents[item.id],
          target: { carrier: target.contentEl, valueEl: target.valueEl },
          timing: timing,
          recipe: {
            ghostClass: 'nviz-sequence__value nviz-sequence__value--ghost',
            ghostDisplay: 'flex',
            ghostAlignItems: 'center',
            ghostJustifyContent: 'center',
            ghostKeyframes: [
              { opacity: '1', transform: 'translateY(0)', offset: 0 },
              { opacity: '1', transform: 'translateY(0)', offset: 0.5 },
              { opacity: '0', transform: 'translateY(-10px)', offset: 1 }
            ],
            ghostDuration: timing.valueSwapDuration,
            ghostDelay: swapDelay,
            ghostEasing: 'linear',
            targetKeyframes: [
              { opacity: '0', transform: 'translateY(8px)', offset: 0 },
              { opacity: '0', transform: 'translateY(8px)', offset: 0.55 },
              { opacity: '1', transform: 'none', offset: 1 }
            ],
            targetDuration: timing.valueSwapDuration,
            targetDelay: swapDelay,
            targetEasing: 'linear',
            targetGate: 'ready'
          }
        });
        if (swap.cleanup) ghostCleanups.push(swap.cleanup);
        specs.push.apply(specs, swap.specs);
        /* 强调在替换后才退场：先保持，再淡出；属于提示轨道，不拖住 objects-settled 揭示。 */
        specs.push({
          el: target.valueEl,
          keyframes: [
            { backgroundColor: 'rgba(247,201,72,.55)', offset: 0 },
            { backgroundColor: 'rgba(247,201,72,.55)', offset: 0.55 },
            { backgroundColor: 'rgba(247,201,72,0)', offset: 1 }
          ],
          options: {
            duration: timing.valueFlashDuration,
            delay: swapDelay,
            easing: 'linear',
            fill: 'backwards'
          },
          role: 'mark'
        });
        changedIndex += 1;
      });
    }

    function collectFocusEffects(specs, byId, timing) {
      targetItems.forEach(function (item) {
        if (targetFocus.indexOf(item.id) < 0) return;
        if (hasOwn(sourceFocus, item.id)) return;
        var target = byId[item.id];
        if (!target || !target.contentEl) return;
        specs.push({
          el: target.contentEl,
          keyframes: [
            { boxShadow: '0 0 0 0 rgba(49,92,218,.45)' },
            { boxShadow: '0 0 0 6px rgba(49,92,218,0)' }
          ],
          options: {
            duration: timing.markDuration,
            delay: timing.markDelay,
            easing: timing.easing,
            fill: 'backwards'
          },
          /* 提示型效果不进入 objects-settled 对象屏障，但仍属于最终完成边界。 */
          role: 'mark'
        });
      });
    }

    function collectCueEffects(specs, byId, timing) {
      var entered = {};
      targetItems.forEach(function (item) {
        if (!hasOwn(sourceById, item.id)) entered[item.id] = true;
        else if (String(sourceById[item.id].value) !== String(item.value)) entered[item.id] = true;
      });
      var targets = [];
      targetItems.forEach(function (item) {
        var target = byId[item.id];
        if (!target || !target.contentEl || entered[item.id]) return;
        targets.push({ id: item.id, el: target.contentEl });
      });
      specs.push.apply(specs, effects.planCueChanges({
        source: sourceCueStyles,
        targets: targets,
        timing: timing,
        properties: CUE_PROPS,
        duration: timing.cueDuration,
        /* 关注退场/建立的差分作为对象内容之外的提示尾部，不拖住 objects-settled。 */
        gate: 'finish'
      }));
    }

    function planEffects(effectCtx) {
      if (motion === 'never') {
          return [];
      }
      var ctx = isObject(effectCtx) ? effectCtx : {};
      var timing = effects.mergeTiming(null, ctx.timing, null);
      var list = instance.getMotionTargets();
      var byId = {};
      (Array.isArray(list) ? list : []).forEach(function (item) { byId[item.id] = item; });
      var specs = [];
      collectEnteredEffects(specs, byId, timing);
      collectValueEffects(specs, byId, timing);
      collectFocusEffects(specs, byId, timing);
      collectCueEffects(specs, byId, timing);
      return specs;
    }

    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      for (var c = 0; c < ghostCleanups.length; c += 1) {
        try { ghostCleanups[c](); } catch (error) { /* ignore */ }
      }
      ghostCleanups = [];
      instance.setSceneActive(false);
    }

    return {
      commit: commit,
      targets: targets,
      effects: planEffects,
      facts: facts,
      cleanup: cleanup
    };
  }

  /* ---------------- BindingHandle ---------------- */

  function createHandle(instance, owned) {
    var destroyed = false;

    function live(where) {
      if (destroyed) fail(where + '：sequence 实例已销毁');
    }

    function doRestore(view) {
      if (destroyed) return;
      var model = isObject(view && view.model) ? view.model : {};
      var cues = isObject(view && view.cues) ? view.cues : {};
      var items = Array.isArray(model.items) ? copyItems(model.items) : [];
      var groups = Array.isArray(model.groups) ? copyGroups(model.groups) : [];
      instance.update({
        items: items,
        groups: groups,
        focus: Array.isArray(cues.focus) ? cues.focus.slice() : [],
        changed: Array.isArray(cues.changed) ? cues.changed.slice() : []
      });
      instance.setSceneActive(false);
    }

    function doTarget(query) {
      if (destroyed || !isObject(query)) return null;
      if (query.part === 'root') {
        return instance.el && instance.el.nodeType === 1 ? instance.el : null;
      }
      if (query.id == null) return null;
      var id = String(query.id);
      var list = instance.getMotionTargets();
      var found = null;
      var i;
      for (i = 0; i < list.length; i += 1) {
        if (list[i].id === id) { found = list[i]; break; }
      }
      if (!found) return null;
      var part = query.part;
      if (part == null) return found.unit;
      if (part === 'cell') return found.contentEl;
      if (part === 'value') return found.valueEl;
      if (part === 'label') return found.labelEl;
      if (part === 'mark') return found.markEl;
      return null;
    }

    function doReadView() {
      if (destroyed) return null;
      return canonicalFromState(instance.getState());
    }

    function doApplyCues(cues) {
      if (destroyed) return;
      var input = isObject(cues) ? cues : {};
      instance.update({
        focus: Array.isArray(input.focus) ? input.focus.slice() : [],
        changed: Array.isArray(input.changed) ? input.changed.slice() : []
      });
    }

    return {
      restore: doRestore,
      readView: doReadView,
      applyCues: doApplyCues,
      target: doTarget,
      prepareChange: function (ctx) {
        live('prepareChange');
        return makePreparedChange(instance, isObject(ctx) ? ctx : {});
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        if (owned && typeof instance.destroy === 'function') instance.destroy();
      }
    };
  }

  /* ---------------- mount / adopt ---------------- */

  function mapMountOptions(options) {
    var input = isObject(options) ? options : {};
    var mapped = {};
    if (typeof input.variant === 'string') mapped.variant = input.variant;
    if (typeof input.index === 'boolean') mapped.index = input.index;
    if (typeof input.dense === 'boolean') mapped.dense = input.dense;
    if (typeof input.label === 'string') mapped.label = input.label;
    if (typeof input.summary === 'boolean') mapped.summary = input.summary;
    if (typeof input.stateText === 'boolean') mapped.stateText = input.stateText;
    if (typeof input.stable === 'boolean') mapped.stable = input.stable;
    return mapped;
  }

  function mount(host, options) {
    var Sequence = requireSequence();
    if (!host || host.nodeType !== 1) {
      throw new TypeError('sequence Adapter.mount(host, options)：host 必须是宿主任意元素。');
    }
    /* NoteDemo 默认组合：稳定占位、隐藏重复摘要与“变化”文字，保留对象标签、
     * 视觉 cues 与 aria 描述；宿主仍可用 options 覆盖。 */
    var mountOptions = { summary: false, stateText: false, stable: true };
    var provided = mapMountOptions(options);
    Object.keys(provided).forEach(function (key) { mountOptions[key] = provided[key]; });
    var instance = Sequence.mount(host, mountOptions);
    if (typeof instance.getState !== 'function' || typeof instance.getMotionTargets !== 'function' ||
        typeof instance.setSceneActive !== 'function' || typeof instance.update !== 'function') {
      if (typeof instance.destroy === 'function') instance.destroy();
      throw new Error('sequence Adapter 需要 D01 提供 getState / getMotionTargets / setSceneActive（请加载新版 src/viz/objects-sequence-matrix.js）。');
    }
    return createHandle(instance, true);
  }

  function adopt(instance) {
    if (!instance || typeof instance.update !== 'function' || typeof instance.getState !== 'function' ||
        typeof instance.getMotionTargets !== 'function' || typeof instance.setSceneActive !== 'function' ||
        typeof instance.getTarget !== 'function') {
      fail('adopt 需要一个支持 getState / getMotionTargets / setSceneActive 的 NoteViz.Sequence 实例。');
    }
    if (instance.destroyed) fail('adopt 的序列实例已销毁。');
    return createHandle(instance, false);
  }

  Internals.adapters = Internals.adapters || {};
  Internals.adapters[ADAPTER_NAME] = {
    name: ADAPTER_NAME,
    sceneModes: SCENE_MODES.slice(),
    defaultSceneMode: 'layout',
    sceneTimingDefaults: {
      enterDuration: 420,
      stagger: 40,
      valueSwapDelay: 160,
      valueSwapDuration: 420,
      valueFlashDuration: 560,
      markDelay: 200,
      markDuration: 420
    },
    normalizeView: normalizeView,
    validateAction: validateAction,
    mount: mount,
    adopt: adopt
  };
})(window);
