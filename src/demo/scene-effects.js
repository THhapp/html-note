/* NoteDemo scene effects — 一次 scene 运行的 WAAPI/进度句柄、布局 FLIP、揭示与标记渐入。
 * Scope: window.NoteDemoInternals.sceneEffects
 * Depends on: NoteDemoInternals.effects（WAAPI/进度句柄、计时）、NoteDemoInternals.sceneGeometry（FLIP）。
 * 私有执行文件：EffectScope 拥有本次运行创建的全部句柄与临时视觉，取消/完成统一释放；
 * 不决定 after、不拥有第二套会话状态、不扫描宿主全部动画。
 * 效果按“轨道”归集：未分组 Binding 一条 default 轨道；分组 Binding 为 layout 轨道 + 每个效果组一条轨道。
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

  function makeSceneError(message, details) {
    var error = new Error(message);
    error.name = 'NoteDemoSceneError';
    if (details && typeof details === 'object') error.details = details;
    return error;
  }

  function effectsModule() {
    var effects = Internals.effects;
    if (!effects || typeof effects.createHandle !== 'function' || typeof effects.mergeTiming !== 'function' ||
        typeof effects.createProgressHandle !== 'function') {
      throw new Error('NoteDemo 核心加载顺序错误：scene 效果需要先加载 NoteDemoInternals.effects（src/demo/effects.js）。');
    }
    return effects;
  }

  function geometryModule() {
    var geometry = Internals.sceneGeometry;
    if (!geometry || typeof geometry.flipElement !== 'function') {
      throw new Error('NoteDemo 核心加载顺序错误：scene 效果需要先加载 NoteDemoInternals.sceneGeometry（src/demo/scene-geometry.js）。');
    }
    return geometry;
  }

  /* frameId / markTiming：本次过渡的目标 Frame 与 Frame 外部标记使用的时间键。
   * 轨道来自 scene 运行时（见 scene.js createTrack）：{ name, readyHandles, finishHandles }。 */
  function createScope(config) {
    var options = isObject(config) ? config : {};
    var effects = effectsModule();
    var geometry = geometryModule();
    var frameId = options.frameId;
    var markTiming = isObject(options.timing) ? options.timing : effects.mergeTiming();
    var handles = [];
    var revealContainers = [];
    var markRoots = [];
    var released = false;

    function track(handle) {
      if (!handle) return handle;
      if (released) {
        try { handle.cancel(); } catch (error) { /* 已释放 */ }
        return handle;
      }
      handles.push(handle);
      return handle;
    }

    /* gate 规则：显式 gate 优先；role:'mark' 旧语义只进入 finished；其余进入 ready。 */
    function gateOf(spec) {
      if (spec.gate === 'ready' || spec.gate === 'finish') return spec.gate;
      return ((spec.role || spec.track) === 'mark') ? 'finish' : 'ready';
    }

    function addHandleToTrack(trackInfo, handle, spec) {
      if (!trackInfo) return;
      if (gateOf(spec) === 'ready') trackInfo.readyHandles.push(handle);
      trackInfo.finishHandles.push(handle);
    }

    function planLayoutEffects(runtime, targetsByMember) {
      var member = runtime && runtime.member;
      if (!member || member.mode !== 'layout') return;
      var trackInfo = runtime.grouped ? runtime.layoutTrack : runtime.defaultTrack;
      if (!trackInfo) return;
      var targets = targetsByMember[member.binding] || [];
      for (var i = 0; i < targets.length; i += 1) {
        var target = targets[i];
        if (!target || !isElement(target.layoutEl)) continue;
        var fromRect = member.sourceRects[String(target.id)];
        if (!fromRect) continue;
        var handle = geometry.flipElement(target.layoutEl, fromRect, member.finalTiming.duration,
          member.finalTiming.easing, {
            frameId: frameId,
            bindingId: member.binding,
            effect: 'layout-flip:' + String(target.id)
          });
        if (!handle) continue;
        track(handle);
        trackInfo.readyHandles.push(handle);
        trackInfo.finishHandles.push(handle);
      }
    }

    function adapterTrack(runtime, spec, index) {
      var member = runtime.member;
      if (runtime.grouped) {
        if (spec.type === 'progress' || isObject(spec)) {
          /* 分组成员：每个 spec 必须显式归属到已声明组。 */
          if (!isObject(spec) || typeof spec.group !== 'string' || spec.group === '') {
            throw makeSceneError('Binding "' + member.binding + '" 的 effect[' + index +
              '] 缺少 group 归属（该 Binding 已声明效果组：' + runtime.groupNames.join('、') + '）。', {
              binding: member.binding,
              path: 'scene.bindings["' + member.binding + '"].effects[' + index + ']'
            });
          }
          if (runtime.groupNames.indexOf(spec.group) < 0) {
            throw makeSceneError('Binding "' + member.binding + '" 的 effect[' + index +
              '] 声明了未知效果组 "' + spec.group + '"（已声明：' + runtime.groupNames.join('、') + '）。', {
              binding: member.binding,
              group: spec.group
            });
          }
          var groupTrack = runtime.groupTracks[spec.group];
          if (!groupTrack) {
            throw makeSceneError('Binding "' + member.binding + '" 的效果组 "' + spec.group + '" 缺少运行轨道。', {
              binding: member.binding,
              group: spec.group
            });
          }
          return groupTrack;
        }
        return null;
      }
      if (spec && spec.group != null) {
        throw makeSceneError('Binding "' + member.binding + '" 的 Adapter 未声明效果组，但 effect[' + index +
          '] 声明了 group "' + String(spec.group) + '"。', {
          binding: member.binding,
          group: String(spec.group)
        });
      }
      return runtime.defaultTrack;
    }

    /* EffectSpec.handoff：仅 WAAPI spec 支持 'hold'；progress 的终态由 update(1) 落位，显式声明定位报错。 */
    function handoffOf(spec, member, index) {
      if (!own(spec, 'handoff')) return null;
      if (spec.handoff !== 'hold') {
        throw makeSceneError('Binding "' + member.binding + '" 的 effect[' + index +
          '] handoff 只支持 "hold"（收到 ' + JSON.stringify(spec.handoff) + '）。', {
          binding: member.binding,
          path: 'scene.bindings["' + member.binding + '"].effects[' + index + '].handoff'
        });
      }
      if (spec.type === 'progress') {
        throw makeSceneError('Binding "' + member.binding + '" 的 progress effect[' + index +
          '] 不能声明 handoff：progress 的最终视觉由 update(1) 自己落位。', {
          binding: member.binding,
          path: 'scene.bindings["' + member.binding + '"].effects[' + index + '].handoff'
        });
      }
      return 'hold';
    }

    function planAdapterEffects(runtime) {
      var member = runtime && runtime.member;
      if (!member || (member.mode !== 'layout' && member.mode !== 'update')) return;
      if (!member.prepared || typeof member.prepared.effects !== 'function') return;
      var specs;
      try {
        specs = member.prepared.effects({
          timing: member.finalTiming,
          motion: 'auto',
          bindingId: member.binding,
          attention: runtime.attention === true,
          grouped: runtime.grouped === true,
          groups: runtime.groupNames ? runtime.groupNames.slice() : []
        });
      } catch (error) {
        if (error && error.name === 'NoteDemoSceneError') throw error;
        throw makeSceneError('Binding "' + member.binding + '" 的 scene effects 规划失败：' + messageOf(error), { binding: member.binding });
      }
      if (!isArray(specs)) return;
      for (var i = 0; i < specs.length; i += 1) {
        var spec = specs[i];
        if (!isObject(spec)) {
          throw makeSceneError('Binding "' + member.binding + '" 的 effect[' + i + '] 不是对象。', { binding: member.binding });
        }
        var targetTrack = adapterTrack(runtime, spec, i);
        var handoff = handoffOf(spec, member, i);
        var handle;
        if (spec.type === 'progress') {
          if (typeof spec.update !== 'function') {
            throw makeSceneError('Binding "' + member.binding + '" 的 progress effect[' + i + '] 缺少 update(progress) 函数。', {
              binding: member.binding,
              group: spec.group || null
            });
          }
          handle = effects.createProgressHandle(spec, {
            frameId: frameId,
            bindingId: member.binding,
            effect: spec.effect || ('progress:' + (spec.group || i))
          });
          addHandleToTrack(targetTrack, handle, spec);
          track(handle);
        } else {
          if (!isElement(spec.el)) {
            throw makeSceneError('Binding "' + member.binding + '" 的 effect[' + i + '] 缺少有效目标元素。', {
              binding: member.binding,
              group: spec.group || null
            });
          }
          /* handoff:'hold' 只改该 spec 的 fill：正常完成后保持末帧到 scene 收束，
           * cleanup 取消句柄后由 Adapter cleanup 在同一 JS 任务内释放预置隐藏值。 */
          var settings = Object.assign({}, spec.options || {}, { paused: true });
          if (handoff === 'hold') settings.fill = 'both';
          handle = effects.createHandle(spec.el, spec.keyframes, settings, {
              frameId: frameId,
              bindingId: member.binding,
              effect: spec.effect || 'adapter'
            });
          addHandleToTrack(targetTrack, handle, spec);
          track(handle);
        }
        if (spec.cleanupEl && isElement(spec.cleanupEl)) {
          (function (el) {
            handle.finished.then(function () {
              try { if (el.parentNode) el.parentNode.removeChild(el); } catch (error) { /* ignore */ }
            }, function () {
              try { if (el.parentNode) el.parentNode.removeChild(el); } catch (error) { /* ignore */ }
            });
          })(spec.cleanupEl);
        }
      }
    }

    function setMarkRoots(list) {
      markRoots = (isArray(list) ? list : []).filter(isElement);
      for (var i = 0; i < markRoots.length; i += 1) {
        try { markRoots[i].style.opacity = '0'; } catch (error) { /* ignore */ }
      }
    }

    function planMarkEffects() {
      var planned = [];
      if (!markRoots.length) return planned;
      for (var i = 0; i < markRoots.length; i += 1) {
        var root = markRoots[i];
        var handle = effects.createHandle(root, [{ opacity: 0 }, { opacity: 1 }], {
          duration: markTiming.markDuration,
          delay: markTiming.markDelay,
          easing: markTiming.easing,
          paused: true
        }, { frameId: frameId, effect: 'scene-mark' });
        track(handle);
        handle.play();
        (function (el) {
          handle.finished.then(function () {
            try { el.style.opacity = ''; } catch (error) { /* ignore */ }
          }, function () {
            try { el.style.opacity = ''; } catch (error) { /* ignore */ }
          });
        })(root);
        planned.push(handle);
      }
      return planned;
    }

    function hideReveal(container) {
      if (!isElement(container)) return;
      revealContainers.push(container);
      container.style.visibility = 'hidden';
      container.style.opacity = '0';
    }

    /* 目标已提交后整块显现；返回 Promise<boolean>（true=正常显现，false=句柄被取消）。 */
    function reveal(container, timing, meta) {
      var revealTiming = isObject(timing) ? timing : markTiming;
      if (!isElement(container)) return Promise.resolve(true);
      container.style.visibility = 'visible';
      container.style.opacity = '0';
      var handle = effects.createHandle(container, [{ opacity: 0 }, { opacity: 1 }], {
        duration: revealTiming.revealDuration,
        delay: revealTiming.revealDelay,
        easing: revealTiming.easing
      }, meta);
      track(handle);
      handle.finished.then(function () {
        try { container.style.opacity = ''; } catch (error) { /* ignore */ }
      }, function () {
        try { container.style.opacity = ''; } catch (error) { /* ignore */ }
      });
      return handle.finished.then(function (completed) {
        return completed !== false;
      });
    }

    function showRevealContainers() {
      for (var i = 0; i < revealContainers.length; i += 1) {
        try {
          revealContainers[i].style.visibility = '';
          revealContainers[i].style.opacity = '';
        } catch (error) { /* ignore */ }
      }
    }

    function showMarkRoots() {
      for (var i = 0; i < markRoots.length; i += 1) {
        try { markRoots[i].style.opacity = ''; } catch (error) { /* ignore */ }
      }
    }

    /* 取消/完成共用：取消全部句柄（已完成的取消只清 fill），恢复 reveal/mark 的临时内联状态。 */
    function release() {
      if (released) return;
      released = true;
      for (var h = 0; h < handles.length; h += 1) {
        try { handles[h].cancel(); } catch (error) { /* 继续清理 */ }
      }
      showRevealContainers();
      showMarkRoots();
      handles = [];
      revealContainers = [];
      markRoots = [];
    }

    return {
      planLayoutEffects: planLayoutEffects,
      planAdapterEffects: planAdapterEffects,
      planMarkEffects: planMarkEffects,
      setMarkRoots: setMarkRoots,
      hideReveal: hideReveal,
      reveal: reveal,
      showRevealContainers: showRevealContainers,
      showMarkRoots: showMarkRoots,
      release: release
    };
  }

  Internals.sceneEffects = {
    createScope: createScope
  };
})(window);
