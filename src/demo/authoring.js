/* NoteDemo authoring helpers — slot collection and full-Definition compilation.
 * Scope: window.NoteDemoAuthor / NoteDemo.collectSlots / NoteDemo.compile.
 * Depends on: NoteDemoInternals.definition and the adapters used by the author.
 * Plain JavaScript, classic script, offline file:// safe. No DOM mutation except collectSlots reads.
 */
(function (global) {
  'use strict';

  var NoteDemoAuthor = global.NoteDemoAuthor = global.NoteDemoAuthor || {};
  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};

  function fail(message) {
    throw new Error('NoteDemoAuthor: ' + message);
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function isArray(value) {
    return Array.isArray(value);
  }

  function own(object, key) {
    return object != null && Object.prototype.hasOwnProperty.call(Object(object), key);
  }

  function text(value) {
    return value == null ? '' : String(value);
  }

  function clone(value, seen) {
    if (value == null || typeof value !== 'object') return value;
    var list = seen || [];
    if (list.indexOf(value) >= 0) return value;
    list.push(value);
    var output;
    var i;
    if (isArray(value)) {
      output = [];
      for (i = 0; i < value.length; i += 1) output.push(clone(value[i], list));
      return output;
    }
    output = {};
    var keys = Object.keys(value);
    for (i = 0; i < keys.length; i += 1) output[keys[i]] = clone(value[keys[i]], list);
    return output;
  }

  function resolveAdapters(explicit) {
    var merged = {};
    var builtin = Internals.adapters;
    var keys;
    var i;
    if (isObject(builtin)) {
      keys = Object.keys(builtin);
      for (i = 0; i < keys.length; i += 1) {
        if (builtin[keys[i]] && typeof builtin[keys[i]] === 'object') merged[keys[i]] = builtin[keys[i]];
      }
    }
    if (explicit != null) {
      if (!isObject(explicit)) fail('adapters 必须是名称到 Adapter 对象的映射。');
      keys = Object.keys(explicit);
      for (i = 0; i < keys.length; i += 1) {
        if (explicit[keys[i]] && typeof explicit[keys[i]] === 'object') merged[keys[i]] = explicit[keys[i]];
      }
    }
    return merged;
  }

  function normalizeView(bindingId, binding, rawView, adapters) {
    if (!isObject(binding)) fail('binding "' + bindingId + '" 必须是对象。');
    var adapterName = text(binding.adapter);
    var adapter = adapters[adapterName];
    if (!adapter) fail('binding "' + bindingId + '" 使用未注册 Adapter "' + adapterName + '"。');
    if (typeof adapter.normalizeView !== 'function') fail('Adapter "' + adapterName + '" 缺少 normalizeView。');
    var normalized;
    try {
      normalized = adapter.normalizeView(clone(rawView), binding.options);
    } catch (error) {
      fail('binding "' + bindingId + '" 的 normalizeView 失败：' + (error && error.message ? error.message : error));
    }
    if (!isObject(normalized) || !own(normalized, 'model') || !own(normalized, 'cues')) {
      fail('Adapter "' + adapterName + '" 的 normalizeView 必须返回 {model,cues}。');
    }
    return normalized;
  }

  function frameNormalized(views, bindings, adapters) {
    var output = {};
    Object.keys(bindings).forEach(function (bindingId) {
      if (!own(views, bindingId)) fail('Frame 缺少 binding "' + bindingId + '" 的视图。');
      output[bindingId] = normalizeView(bindingId, bindings[bindingId], views[bindingId], adapters);
    });
    return output;
  }

  function changedBindings(fromNorm, toNorm, bindingIds) {
    var changed = [];
    var definition = Internals.definition;
    if (!definition || typeof definition.compareModel !== 'function' || typeof definition.compareCues !== 'function') {
      fail('需要先加载 NoteDemoInternals.definition。');
    }
    for (var i = 0; i < bindingIds.length; i += 1) {
      var id = bindingIds[i];
      var modelChanged = definition.compareModel(fromNorm[id].model, toNorm[id].model);
      var cuesChanged = definition.compareCues(fromNorm[id].cues, toNorm[id].cues);
      if (modelChanged || cuesChanged) changed.push(id);
    }
    return changed;
  }

  function copyScene(scene) {
    if (!isObject(scene)) fail('scene 必须是对象。');
    var output = clone(scene);
    if (output.bindings !== undefined && !isArray(output.bindings)) fail('scene.bindings 必须是数组。');
    return output;
  }

  function hasBinding(list, id) {
    for (var i = 0; i < list.length; i += 1) {
      if (list[i] && list[i].binding === id) return list[i];
    }
    return null;
  }

  /* after 引用未显式列入的稳定 Binding 时，补一个只提交目标的 cut 参与者。
   * 若缺失的 Binding 本身发生变化，不能静默吞掉改动，直接报错。 */
  function closeAfterParticipants(scene, changed, bindings, adapters) {
    var list = isArray(scene.bindings) ? scene.bindings.slice() : [];
    var changedMap = {};
    changed.forEach(function (id) { changedMap[id] = true; });
    var guard = 0;
    var added = true;
    while (added && guard < 100) {
      added = false;
      guard += 1;
      for (var i = 0; i < list.length; i += 1) {
        var member = list[i];
        if (!isObject(member)) continue;
        var after = member.after == null ? [] : (isArray(member.after) ? member.after : [member.after]);
        for (var a = 0; a < after.length; a += 1) {
          var ref = after[a];
          if (typeof ref !== 'string' || !own(bindings, ref)) {
            fail('scene 参与者的 after 引用了未定义的 Binding "' + text(ref) + '"。');
          }
          if (hasBinding(list, ref)) continue;
          if (changedMap[ref]) {
            fail('Binding "' + ref + '" 在目标 Frame 有变化，不能只作为 after 闭包静默补入；请显式列入 scene。');
          }
          var adapterName = text(bindings[ref].adapter);
          var adapter = adapters[adapterName];
          if (!adapter || !isArray(adapter.sceneModes) || adapter.sceneModes.indexOf('cut') < 0) {
            fail('Binding "' + ref + '" 作为稳定 after 参与者需要 Adapter 支持 cut；当前 Adapter "' + adapterName + '" 不支持。');
          }
          list.push({ binding: ref, mode: 'cut' });
          added = true;
        }
      }
    }
    scene.bindings = list;
    return scene;
  }

  function makeTransition(step, changed, bindings, adapters) {
    var scene = null;
    if (step.scene !== undefined && step.scene !== null) {
      scene = copyScene(step.scene);
      if (!isArray(scene.bindings) || scene.bindings.length === 0) {
        fail('步骤 "' + text(step.id) + '" 的 scene.bindings 必须是非空数组。');
      }
      for (var c = 0; c < changed.length; c += 1) {
        if (!hasBinding(scene.bindings, changed[c])) {
          fail('步骤 "' + text(step.id) + '" 的 Binding "' + changed[c] + '" 视图发生变化，但未列入 scene；不能静默降级为 cut。');
        }
      }
      scene = closeAfterParticipants(scene, changed, bindings, adapters);
    } else if (changed.length) {
      fail('步骤 "' + text(step.id) + '" 改变了 Binding：' + changed.join('、') +
        '，但没有声明 scene；请显式给出场景参与者，不能静默降级为 cut。');
    }
    if (step.attention !== undefined && step.attention !== null) {
      if (!scene) fail('步骤 "' + text(step.id) + '" 声明了 attention，但没有 scene。');
      scene.attention = clone(step.attention);
    }
    return scene;
  }

  function collectSlots(root, required) {
    if (!root || root.nodeType !== 1 || typeof root.querySelectorAll !== 'function') {
      throw new TypeError('NoteDemo.collectSlots 需要一个 Element 根。');
    }
    var nodes = root.querySelectorAll('[data-demo-slot]');
    var found = {};
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      var name = text(node.getAttribute('data-demo-slot')).trim();
      if (!name) throw new Error('NoteDemo.collectSlots：第 ' + (i + 1) + ' 个 [data-demo-slot] 缺少名称。');
      if (own(found, name)) throw new Error('NoteDemo.collectSlots：插槽 "' + name + '" 重复。');
      found[name] = node;
    }
    if (required != null) {
      if (!isArray(required)) throw new TypeError('NoteDemo.collectSlots 的 required 必须是名称数组。');
      var missing = [];
      var seen = {};
      for (var r = 0; r < required.length; r += 1) {
        var slotName = text(required[r]).trim();
        if (!slotName || own(seen, slotName)) continue;
        seen[slotName] = true;
        if (!own(found, slotName)) missing.push(slotName);
      }
      if (missing.length) {
        throw new Error('NoteDemo.collectSlots：缺少插槽 ' + missing.map(function (name) {
          return '"' + name + '"';
        }).join('、') + '。');
      }
    }
    return found;
  }

  function compile(config) {
    if (!isObject(config)) fail('compile 需要一个配置对象：{ bindings, initial, steps, adapters? }。');
    var bindings = config.bindings;
    if (!isObject(bindings) || Object.keys(bindings).length === 0) fail('bindings 必须是非空对象。');
    var adapters = resolveAdapters(config.adapters);
    var bindingIds = Object.keys(bindings);
    var initial = config.initial;
    if (!isObject(initial)) fail('initial 必须是 {id, caption, views}。');
    if (typeof initial.id !== 'string' || !initial.id.trim()) fail('initial.id 必须是非空字符串。');
    if (!isObject(initial.views)) fail('initial.views 必须是 Binding ID 到视图的映射。');
    var current = {};
    bindingIds.forEach(function (id) {
      if (!own(initial.views, id)) fail('initial.views 缺少 binding "' + id + '" 的完整视图。');
      current[id] = clone(initial.views[id]);
    });
    var frames = [{
      id: initial.id,
      caption: initial.caption == null ? '' : String(initial.caption),
      views: clone(current),
      marks: clone(initial.marks == null ? [] : initial.marks)
    }];
    var normalized = [frameNormalized(current, bindings, adapters)];
    var steps = config.steps == null ? [] : config.steps;
    if (!isArray(steps)) fail('steps 必须是数组。');
    var seenIds = {};
    seenIds[initial.id] = true;
    var transitions = [];
    for (var s = 0; s < steps.length; s += 1) {
      var step = steps[s];
      if (!isObject(step)) fail('steps[' + s + '] 必须是对象。');
      if (typeof step.id !== 'string' || !step.id.trim()) fail('steps[' + s + '].id 必须是非空字符串。');
      if (own(seenIds, step.id)) fail('Frame ID "' + step.id + '" 重复。');
      seenIds[step.id] = true;
      var replace = step.replace == null ? {} : step.replace;
      if (!isObject(replace)) fail('步骤 "' + step.id + '" 的 replace 必须是 Binding ID 到完整视图的映射。');
      Object.keys(replace).forEach(function (bindingId) {
        if (!own(bindings, bindingId)) fail('步骤 "' + step.id + '" 替换了未定义的 Binding "' + bindingId + '"。');
        current[bindingId] = clone(replace[bindingId]);
      });
      frames.push({
        id: step.id,
        caption: step.caption == null ? '' : String(step.caption),
        views: clone(current),
        marks: clone(step.marks == null ? [] : step.marks)
      });
      var nextNorm = frameNormalized(current, bindings, adapters);
      var changed = changedBindings(normalized[normalized.length - 1], nextNorm, bindingIds);
      normalized.push(nextNorm);
      var scene = makeTransition(step, changed, bindings, adapters);
      if (scene) {
        transitions.push({
          from: frames[frames.length - 2].id,
          to: frames[frames.length - 1].id,
          scene: scene
        });
      }
    }
    return {
      bindings: bindings,
      frames: frames,
      transitions: transitions
    };
  }

  /* ---------------- 作者图形效果工具（公开包装，不暴露 Internals） ---------------- */

  function effectsApi() {
    var effects = Internals.effects;
    if (!effects || typeof effects.captureContent !== 'function') {
      fail('NoteDemo.effects 需要先加载 demo-runtime 的 effects（src/demo/effects.js）。');
    }
    return effects;
  }

  /* 这些函数是 Adapter/作者侧可用的窄工具：捕获来源内容/样式、生成局部 ghost、
   * 规划值交换与 cue 差分、读取真实矩形。返回的 spec 仍交给 scene 统一启动/取消/清理。 */
  NoteDemoAuthor.effects = {
    captureContent: function (input) { return effectsApi().captureContent(input); },
    createGhost: function (input) { return effectsApi().createGhost(input); },
    planValueSwap: function (input) { return effectsApi().planValueSwap(input); },
    captureStyles: function (targets, properties) { return effectsApi().captureStyles(targets, properties); },
    planCueChanges: function (input) { return effectsApi().planCueChanges(input); },
    rectOf: function (element) { return effectsApi().rectOf(element); },
    /* 复用 range.union 的窄组合：用于把“移动对象 + 它的轨迹/标签”等真实元素
     * 合成一个观察区域。只返回 Definition 数据，不创建第二套测量或动画。 */
    unionRange: function (refs) {
      if (!isArray(refs) || refs.length === 0) {
        fail('NoteDemo.effects.unionRange(refs) 需要非空的 {binding,query} 数组。');
      }
      var output = [];
      for (var i = 0; i < refs.length; i += 1) {
        var ref = refs[i];
        if (!isObject(ref) || typeof ref.binding !== 'string' || !ref.binding || ref.query == null) {
          fail('NoteDemo.effects.unionRange(refs)[' + i + '] 必须是 {binding,query}。');
        }
        output.push({ binding: ref.binding, query: clone(ref.query) });
      }
      return { kind: 'union', refs: output };
    }
  };

  NoteDemoAuthor.collectSlots = collectSlots;
  NoteDemoAuthor.compile = compile;
  NoteDemoAuthor.version = '1.0.0';
})(window);
