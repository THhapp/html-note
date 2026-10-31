/* NoteDemo bindings — 在宿主 slot 内为每个受控 binding 建立独立子容器并管理 BindingHandle。
 * Scope: window.NoteDemoInternals.bindings
 * Depends on: 无（只使用 DOM 与 plan 数据）。
 * 经典脚本，无模块 / 无网络 / 无 eval。 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var hasOwn = Object.prototype.hasOwnProperty;

  function own(object, key) {
    return object != null && hasOwn.call(Object(object), key);
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function isArray(value) {
    return Array.isArray(value);
  }

  function isElement(value) {
    return !!value && value.nodeType === 1;
  }

  function messageOf(error) {
    if (error == null) return '';
    if (typeof error === 'string') return error;
    if (error.message != null) return String(error.message);
    return String(error);
  }

  function repr(value) {
    if (typeof value === 'string') return '"' + value + '"';
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (isArray(value)) return '数组';
    if (typeof value === 'object') return '对象';
    return String(value);
  }

  function bindingsError(bindingId, slotName, message, cause) {
    var where = 'Binding "' + String(bindingId) + '"' + (slotName == null ? '' : '（slot "' + String(slotName) + '"）');
    var error = new Error('NoteDemo 绑定错误：' + where + '：' + message);
    error.name = 'NoteDemoBindingError';
    error.binding = bindingId;
    if (slotName != null) error.slot = slotName;
    error.details = { binding: bindingId };
    if (slotName != null) error.details.slot = slotName;
    if (cause !== undefined && cause !== null) {
      error.cause = cause;
      error.details.cause = messageOf(cause);
    }
    return error;
  }

  function removeNode(node) {
    if (node && node.parentNode) {
      try {
        node.parentNode.removeChild(node);
      } catch (error) {
        /* 节点可能已经被适配器移除 */
      }
    }
  }

  function markRefs(mark) {
    if (!isObject(mark)) return [];
    if (mark.kind === 'focus') return mark.target ? [mark.target] : [];
    if (mark.kind === 'range') return isArray(mark.targets) ? mark.targets.slice() : [];
    if (mark.kind === 'link') {
      var refs = [];
      if (mark.from) refs.push(mark.from);
      if (mark.to) refs.push(mark.to);
      return refs;
    }
    return [];
  }

  function collectMarkRefs(marks, target) {
    if (!isArray(marks)) return;
    for (var i = 0; i < marks.length; i += 1) {
      var refs = markRefs(marks[i]);
      for (var r = 0; r < refs.length; r += 1) {
        if (refs[r] && typeof refs[r].binding === 'string') target[refs[r].binding] = true;
      }
    }
  }

  function collectRequirements(plan) {
    var actionBindings = {};
    var targetBindings = {};
    var sceneBindings = {};
    var transitions = plan && plan.transitions ? plan.transitions : {};
    Object.keys(transitions).forEach(function (key) {
      var transition = transitions[key];
      if (!transition) return;
      var actions = isArray(transition.actions) ? transition.actions : [];
      for (var i = 0; i < actions.length; i += 1) {
        var action = actions[i];
        if (!isObject(action)) continue;
        if (isArray(action.parallel)) {
          for (var m = 0; m < action.parallel.length; m += 1) {
            var member = action.parallel[m];
            if (member && typeof member.binding === 'string') actionBindings[member.binding] = true;
          }
        } else if (typeof action.binding === 'string') {
          actionBindings[action.binding] = true;
        }
      }
      collectMarkRefs(transition.marks, targetBindings);
      if (transition.scene && isArray(transition.scene.bindings)) {
        for (var s = 0; s < transition.scene.bindings.length; s += 1) {
          var member = transition.scene.bindings[s];
          if (!member || typeof member.binding !== 'string') continue;
          if (!sceneBindings[member.binding]) sceneBindings[member.binding] = { layout: false, update: false };
          /* layout 与 update 都要求 prepareChange + readView；cut/reveal 可用 restore 包装。 */
          if (member.mode === 'layout') sceneBindings[member.binding].layout = true;
          else if (member.mode === 'update') sceneBindings[member.binding].update = true;
        }
      }
    });
    var frames = plan && isArray(plan.frames) ? plan.frames : [];
    for (var f = 0; f < frames.length; f += 1) collectMarkRefs(frames[f] && frames[f].marks, targetBindings);
    return { action: actionBindings, target: targetBindings, scene: sceneBindings };
  }

  function create(config) {
    var options = isObject(config) ? config : {};
    var plan = options.plan;
    var slots = options.slots === undefined ? {} : options.slots;
    var adapters = isObject(options.adapters) ? options.adapters : {};

    if (!isObject(plan) || !isObject(plan.bindings)) {
      throw new Error('NoteDemo bindings.create 需要 definition.prepare 生成的 plan。');
    }
    if (!isObject(slots)) {
      throw new Error('NoteDemo bindings.create 的 slots 必须是名称到 Element 的映射。');
    }

    var order = isArray(plan.bindingOrder) ? plan.bindingOrder.slice() : Object.keys(plan.bindings);
    var entries = {};
    var created = [];
    var destroyed = false;

    function release(entry) {
      if (!entry || entry.released) return;
      entry.released = true;
      if (entry.handle && typeof entry.handle.destroy === 'function') {
        try {
          entry.handle.destroy();
        } catch (error) {
          /* destroy 必须继续清理其余绑定 */
        }
      }
      removeNode(entry.container);
    }

    function releaseAll() {
      for (var i = created.length - 1; i >= 0; i -= 1) release(created[i]);
    }

    function entryOf(bindingId) {
      return own(entries, bindingId) ? entries[bindingId] : null;
    }

    function viewFor(frame, bindingId) {
      if (!frame || !isObject(frame.views)) return null;
      return own(frame.views, bindingId) ? frame.views[bindingId] : null;
    }

    function restoreEntry(entry, view) {
      if (!view || !isObject(view)) {
        throw bindingsError(entry.id, entry.slotName, '缺少可恢复的视图 {model,cues}');
      }
      try {
        entry.handle.restore(view);
      } catch (error) {
        throw bindingsError(entry.id, entry.slotName, 'restore 失败：' + messageOf(error), error);
      }
    }

    try {
      for (var i = 0; i < order.length; i += 1) {
        var bindingId = order[i];
        var bindingConfig = own(plan.bindings, bindingId) ? plan.bindings[bindingId] : null;
        if (!isObject(bindingConfig)) {
          throw bindingsError(bindingId, null, 'plan.bindings 中缺少该 binding 的配置');
        }
        var slotName = bindingConfig.slot;
        var slotEl = slotName != null && own(slots, slotName) ? slots[slotName] : null;
        if (!slotEl) {
          throw bindingsError(bindingId, slotName, '找不到 slot ' + repr(slotName) + '（bindings 必须在宿主提供的 slots 中挂载）');
        }
        if (!isElement(slotEl)) {
          throw bindingsError(bindingId, slotName, 'slot ' + repr(slotName) + ' 不是 Element');
        }
        var adapter = bindingConfig.adapter;
        if (!adapter && bindingConfig.adapterName && own(adapters, bindingConfig.adapterName)) {
          adapter = adapters[bindingConfig.adapterName];
        }
        if (!adapter || typeof adapter !== 'object') {
          throw bindingsError(bindingId, slotName, '找不到 Adapter ' + repr(bindingConfig.adapterName));
        }
        var owned = bindingConfig.ownership !== 'borrowed';
        var mountOptions = isObject(bindingConfig.options) ? bindingConfig.options : {};
        var container = global.document.createElement('div');
        container.className = 'note-demo-binding';
        container.setAttribute('data-binding', String(bindingId));
        slotEl.appendChild(container);

        var handle;
        try {
          if (owned) {
            if (typeof adapter.mount !== 'function') throw new Error('Adapter 缺少 mount');
            handle = adapter.mount(container, mountOptions);
          } else {
            if (typeof adapter.adopt !== 'function') throw new Error('Adapter 缺少 adopt（borrowed 需要借用外部实例）');
            if (bindingConfig.instance === undefined || bindingConfig.instance === null) {
              throw new Error('borrowed binding 缺少 instance');
            }
            handle = adapter.adopt(bindingConfig.instance, mountOptions);
          }
        } catch (error) {
          removeNode(container);
          throw bindingsError(bindingId, slotName,
            (owned ? 'mount' : 'adopt') + ' 失败：' + messageOf(error), error);
        }
        if (!handle || typeof handle.restore !== 'function') {
          if (handle && typeof handle.destroy === 'function') {
            try { handle.destroy(); } catch (error) { /* ignore */ }
          }
          removeNode(container);
          throw bindingsError(bindingId, slotName, 'Adapter 没有返回有效 BindingHandle（需要 restore）');
        }
        var entry = {
          id: bindingId,
          adapterName: bindingConfig.adapterName || adapter.name || '',
          adapter: adapter,
          handle: handle,
          container: container,
          owned: owned,
          slotName: slotName,
          options: mountOptions,
          timingDefaults: bindingConfig.timingDefaults || {}
        };
        entries[bindingId] = entry;
        created.push(entry);
      }

      /* ---- 挂载后能力检查（动作需要 perform+readView，标记需要 target） ---- */
      var requirements = collectRequirements(plan);
      Object.keys(requirements.action).forEach(function (requiredId) {
        var entry = entryOf(requiredId);
        if (!entry) {
          throw bindingsError(requiredId, null, '动作引用了未挂载的 binding');
        }
        if (typeof entry.handle.perform !== 'function') {
          throw bindingsError(requiredId, entry.slotName, '该 binding 被动作引用，但组件没有 perform 能力');
        }
        if (typeof entry.handle.readView !== 'function') {
          throw bindingsError(requiredId, entry.slotName, '该 binding 被动作引用，但组件没有 readView 能力（无法核对动作结果）');
        }
      });
      Object.keys(requirements.scene).forEach(function (requiredId) {
        var sceneEntry = entryOf(requiredId);
        if (!sceneEntry) {
          throw bindingsError(requiredId, null, 'scene 引用了未挂载的 binding');
        }
        var sceneNeeds = requirements.scene[requiredId];
        ['layout', 'update'].forEach(function (mode) {
          if (!sceneNeeds[mode]) return;
          if (typeof sceneEntry.handle.prepareChange !== 'function') {
            throw bindingsError(requiredId, sceneEntry.slotName,
              '该 binding 以 scene ' + mode + ' 参与，但组件没有 prepareChange 能力');
          }
          if (typeof sceneEntry.handle.readView !== 'function') {
            throw bindingsError(requiredId, sceneEntry.slotName,
              '该 binding 以 scene ' + mode + ' 参与，但组件没有 readView 能力（无法核对提交结果）');
          }
        });
      });
      Object.keys(requirements.target).forEach(function (requiredId) {
        var entry = entryOf(requiredId);
        if (!entry) {
          throw bindingsError(requiredId, null, '标记引用了未挂载的 binding');
        }
        if (typeof entry.handle.target !== 'function') {
          throw bindingsError(requiredId, entry.slotName, '该 binding 被标记引用，但组件没有 target 能力（无法定位标记目标）');
        }
      });
    } catch (error) {
      releaseAll();
      throw error;
    }

    var bag = {
      order: order,
      entries: entries,
      restoreFrame: function (frame) {
        for (var i = 0; i < order.length; i += 1) {
          var entry = entries[order[i]];
          if (!entry) continue;
          restoreEntry(entry, viewFor(frame, entry.id));
        }
        return bag;
      },
      restoreBindings: function (ids, frame) {
        var list = isArray(ids) ? ids : [];
        for (var i = 0; i < list.length; i += 1) {
          var entry = entryOf(list[i]);
          if (!entry) throw bindingsError(list[i], null, '恢复时找不到该 binding');
          restoreEntry(entry, viewFor(frame, entry.id));
        }
        return bag;
      },
      applyCues: function (bindingId, cues) {
        var entry = entryOf(bindingId);
        if (!entry || typeof entry.handle.applyCues !== 'function') return undefined;
        try {
          entry.handle.applyCues(cues);
        } catch (error) {
          throw bindingsError(entry.id, entry.slotName, 'applyCues 失败：' + messageOf(error), error);
        }
        return undefined;
      },
      settleVisual: function (bindingId) {
        var entry = entryOf(bindingId);
        if (!entry || typeof entry.handle.settleVisual !== 'function') return undefined;
        try {
          return entry.handle.settleVisual();
        } catch (error) {
          return undefined;
        }
      },
      readView: function (bindingId) {
        var entry = entryOf(bindingId);
        if (!entry || typeof entry.handle.readView !== 'function') return null;
        try {
          return entry.handle.readView();
        } catch (error) {
          throw bindingsError(entry.id, entry.slotName, 'readView 失败：' + messageOf(error), error);
        }
      },
      target: function (ref) {
        if (!isObject(ref) || typeof ref.binding !== 'string') return null;
        var entry = entryOf(ref.binding);
        if (!entry || typeof entry.handle.target !== 'function') return null;
        try {
          var element = entry.handle.target(ref.query);
          return element && element.nodeType === 1 ? element : null;
        } catch (error) {
          return null;
        }
      },
      entry: function (bindingId) {
        return entryOf(bindingId);
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        releaseAll();
      }
    };

    return bag;
  }

  Internals.bindings = {
    create: create
  };
})(window);