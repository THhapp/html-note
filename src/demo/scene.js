/* NoteDemo scene — 完整目标画面的受控过渡编排（layout / update / cut / reveal）。
 * Scope: window.NoteDemoInternals.scene
 * Depends on: definition（提交后读回比较）、effects（timing 合并）、sceneGeometry（FLIP/矩形）、
 *             sceneEffects（句柄/揭示/标记）、sceneAttention（注意序列门控）。
 * 一次运行拥有全部效果、延后启动、临时资源与清理；经典脚本，无模块 / 无网络 / 无 eval。 */
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

  function noop() {}

  function loadModule(name, check, detail) {
    var module = Internals[name];
    if (!module || !check(module)) {
      throw new Error('NoteDemo 核心加载顺序错误：scene 执行需要先加载 ' + detail + '。');
    }
    return module;
  }

  function definitionModule() {
    return loadModule('definition', function (definition) {
      return typeof definition.compareModel === 'function' &&
        typeof definition.compareCues === 'function' &&
        typeof definition.describeDiff === 'function';
    }, 'NoteDemoInternals.definition（src/demo/definition.js）');
  }

  function effectsModule() {
    return loadModule('effects', function (effects) {
      return typeof effects.mergeTiming === 'function';
    }, 'NoteDemoInternals.effects（src/demo/effects.js）');
  }

  function geometryModule() {
    return loadModule('sceneGeometry', function (geometry) {
      return typeof geometry.captureSourceRects === 'function' && typeof geometry.flipElement === 'function';
    }, 'NoteDemoInternals.sceneGeometry（src/demo/scene-geometry.js）');
  }

  function effectsScopeModule() {
    return loadModule('sceneEffects', function (sceneEffects) {
      return typeof sceneEffects.createScope === 'function';
    }, 'NoteDemoInternals.sceneEffects（src/demo/scene-effects.js）');
  }

  function attentionModule() {
    return loadModule('sceneAttention', function (sceneAttention) {
      return typeof sceneAttention.create === 'function';
    }, 'NoteDemoInternals.sceneAttention（src/demo/scene-attention.js）');
  }

  function afterFrame() {
    return new Promise(function (resolve) {
      if (typeof global.requestAnimationFrame !== 'function') {
        resolve();
        return;
      }
      global.requestAnimationFrame(function () { resolve(); });
    });
  }

  function makeSceneError(message, details) {
    var error = new Error(message);
    error.name = 'NoteDemoSceneError';
    if (details && typeof details === 'object') error.details = details;
    return error;
  }

  /* cut / reveal 的同步 restore 也可以包成 PreparedChange；没有 layout 载体可提供。 */
  function restorePrepared(entry, targetView) {
    var handle = entry.handle;
    return {
      commit: function () {
        handle.restore(targetView);
      },
      targets: function () { return []; },
      effects: function () { return []; },
      cleanup: noop,
      facts: function () { return { entered: [], exited: [], valueChanged: [] }; }
    };
  }

  function runPreparedComparison(definition, frameId, bindingId, targetView, handle) {
    if (!handle || typeof handle.readView !== 'function') return;
    var actual;
    try {
      actual = handle.readView();
    } catch (error) {
      throw makeSceneError('Frame "' + String(frameId) + '" / Binding "' + String(bindingId) +
        '" / Scene：读回组件真实状态失败：' + messageOf(error), { binding: bindingId });
    }
    if (!isObject(actual) || !own(actual, 'model')) {
      throw makeSceneError('Frame "' + String(frameId) + '" / Binding "' + String(bindingId) +
        '" / Scene：readView 没有返回 {model,cues}。', { binding: bindingId });
    }
    var modelDiff = definition.compareModel(targetView.model, actual.model);
    if (modelDiff) {
      throw makeSceneError(definition.describeDiff(frameId, bindingId, 'scene', modelDiff) +
        'scene 提交后的 model 与目标 Frame 不一致（不调用 restore 掩盖）。', {
        frameId: frameId,
        binding: bindingId,
        path: modelDiff.path,
        expected: modelDiff.expected,
        actual: modelDiff.actual
      });
    }
    var cueDiff = definition.compareCues(targetView.cues, actual.cues);
    if (cueDiff) {
      throw makeSceneError(definition.describeDiff(frameId, bindingId, 'scene', cueDiff) +
        'scene 提交后的 cues 与目标 Frame 不一致。', {
        frameId: frameId,
        binding: bindingId,
        path: cueDiff.path,
        expected: cueDiff.expected,
        actual: cueDiff.actual
      });
    }
  }

  function run(config) {
    var options = isObject(config) ? config : {};
    var plan = options.plan;
    var transition = options.transition || null;
    var bindings = options.bindings;
    var signal = options.signal || null;
    var presentation = options.presentation || null;
    var motionName = options.motion === 'reduced' ? 'reduced' : 'normal';

    return new Promise(function (resolve, reject) {
      var definition;
      var effects;
      var scene;
      var sourceFrame;
      var targetFrame;
      var members = [];
      var markTiming = null;
      var port = null;
      var attention = null;
      var attentionCoordinator = null;
      var scope = null;
      var closed = false;
      var cancelled = false;
      var cleaned = false;
      var preparedList = [];

      function releasePrepared() {
        for (var p = 0; p < preparedList.length; p += 1) {
          try {
            if (preparedList[p] && typeof preparedList[p].cleanup === 'function') preparedList[p].cleanup();
          } catch (error) { /* 清理失败不阻断 */ }
        }
        preparedList = [];
      }

      /* 取消与完成共用同一个清理入口：先让运行失效，再释放句柄/副本与 presentation 资源。 */
      function cleanup() {
        if (cleaned) return;
        cleaned = true;
        if (signal && typeof signal.removeEventListener === 'function') {
          try { signal.removeEventListener('abort', onAbort); } catch (error) { /* ignore */ }
        }
        if (scope) {
          try { scope.release(); } catch (error) { /* 清理失败不阻断 */ }
        }
        releasePrepared();
        if (port && typeof port.cancel === 'function') {
          try { port.cancel(); } catch (error) { /* ignore */ }
        }
        port = null;
      }

      function finish(value) {
        if (closed) return;
        closed = true;
        resolve(value);
      }

      function fail(error) {
        if (closed) return;
        closed = true;
        cleanup();
        reject(error);
      }

      function onAbort() {
        cancel();
      }

      function cancel() {
        if (closed || cancelled) return;
        cancelled = true;
        cleanup();
        afterFrame().then(function () {
          if (!closed) finish({ status: 'cancelled' });
        }, function () {
          if (!closed) finish({ status: 'cancelled' });
        });
      }

      function collectMembers() {
        scene = transition && isObject(transition.scene) ? transition.scene : null;
        if (!scene) throw makeSceneError('scene 执行缺少 transition.scene。');
        sourceFrame = plan.frameById[transition.from];
        targetFrame = plan.frameById[transition.to];
        if (!sourceFrame || !targetFrame) throw makeSceneError('scene 过渡引用了不存在的 Frame。');
        /* attention 场景使用较慢的公共内容节奏；普通 scene 保持公共默认。 */
        var attentionContent = scene.attention ? definition.attentionContentTiming : null;
        var effectiveSceneTiming = scene.timing;
        if (attentionContent) {
          effectiveSceneTiming = Object.assign({}, attentionContent, isObject(scene.timing) ? scene.timing : {});
        }
        markTiming = effects.mergeTiming(null, effectiveSceneTiming, null);
        var attentionTargets = scene.attention && isArray(scene.attention.targets) ? scene.attention.targets : [];
        attention = attentionModule().create({
          targets: attentionTargets,
          enabled: motionName !== 'reduced' && !!scene.attention,
          createError: makeSceneError,
          startRuntime: function (runtime) { beginRuntime(runtime); }
        });
        if (!isArray(scene.bindings) || scene.bindings.length === 0) {
          throw makeSceneError('scene 没有参与者。');
        }
        for (var i = 0; i < scene.bindings.length; i += 1) {
          var spec = scene.bindings[i];
          var entry = bindings.entry(spec.binding);
          if (!entry || !entry.handle) {
            throw makeSceneError('scene 参与 binding "' + String(spec.binding) + '" 没有已挂载的组件。', { binding: spec.binding });
          }
          var sourceView = sourceFrame.views ? sourceFrame.views[spec.binding] : null;
          var targetView = targetFrame.views ? targetFrame.views[spec.binding] : null;
          if (!targetView || !isObject(targetView)) {
            throw makeSceneError('目标 Frame "' + String(transition.to) + '" 缺少 binding "' + String(spec.binding) + '" 的视图。', { binding: spec.binding });
          }
          if (spec.mode === 'cut' && isArray(spec.after) && spec.after.length) {
            throw makeSceneError('Binding "' + String(spec.binding) +
              '" 是 cut；cut 在同步提交时已经显示目标，不能声明 after。请改用 update 或 reveal。',
              { binding: spec.binding });
          }
          members.push({
            binding: spec.binding,
            mode: spec.mode,
            at: spec.at || 'objects-settled',
            after: isArray(spec.after) ? spec.after.slice() : [],
            timing: isObject(spec.timing) ? spec.timing : {},
            finalTiming: effects.mergeTiming(entry.timingDefaults, effectiveSceneTiming, spec.timing),
            entry: entry,
            handle: entry.handle,
            sourceView: sourceView,
            targetView: targetView,
            prepared: null,
            attentionIndex: -1
          });
        }
        attention.assign(members);
        attentionCoordinator = attention.enabled ? {
          start: function (index) { attention.start(index); },
          ready: function (index) { return attention.ready(index); }
        } : null;
      }

      function prepareAll() {
        var waits = [];
        members.forEach(function (member) {
          var controlled = member.mode === 'layout' || member.mode === 'update';
          if (controlled) {
            if (typeof member.handle.prepareChange !== 'function') {
              throw makeSceneError('Binding "' + member.binding + '" 的 Adapter 未提供 prepareChange，无法作为 scene ' +
                member.mode + ' 参与者。', { binding: member.binding });
            }
            if (typeof member.handle.readView !== 'function') {
              throw makeSceneError('Binding "' + member.binding + '" 缺少 readView，无法核对 scene 提交结果。', { binding: member.binding });
            }
            var prepared;
            try {
              prepared = member.handle.prepareChange({
                bindingId: member.binding,
                sourceFrameId: transition.from,
                targetFrameId: transition.to,
                sourceView: member.sourceView,
                targetView: member.targetView,
                signal: signal,
                motion: motionName === 'reduced' ? 'never' : 'auto'
              });
            } catch (error) {
              throw makeSceneError('Binding "' + member.binding + '" 的 prepareChange 失败：' + messageOf(error), { binding: member.binding });
            }
            if (prepared && typeof prepared.then === 'function') {
              waits.push(Promise.resolve(prepared).then(function (value) {
                if (closed || cleaned) {
                  try { if (value && typeof value.cleanup === 'function') value.cleanup(); } catch (error) { /* ignore */ }
                  return;
                }
                member.prepared = value;
                preparedList.push(value);
              }, function (error) {
                throw makeSceneError('Binding "' + member.binding + '" 的 prepareChange 异步失败：' + messageOf(error), { binding: member.binding });
              }));
            } else {
              member.prepared = prepared;
              preparedList.push(prepared);
            }
            if (!member.prepared && !prepared) {
              throw makeSceneError('Binding "' + member.binding + '" 的 prepareChange 没有返回 PreparedChange。', { binding: member.binding });
            }
          } else {
            member.prepared = restorePrepared(member.entry, member.targetView);
            preparedList.push(member.prepared);
          }
        });
        return waits.length ? Promise.all(waits) : Promise.resolve();
      }

      function validatePrepared() {
        members.forEach(function (member) {
          var prepared = member.prepared;
          if (!prepared || typeof prepared.commit !== 'function') {
            throw makeSceneError('Binding "' + member.binding + '" 的 PreparedChange 缺少同步 commit()。', { binding: member.binding });
          }
          if (member.mode === 'layout' && typeof prepared.targets !== 'function') {
            throw makeSceneError('Binding "' + member.binding + '" 的 PreparedChange 缺少 targets()，无法取得布局载体。', { binding: member.binding });
          }
          if (member.mode === 'update' && typeof prepared.effects !== 'function') {
            throw makeSceneError('Binding "' + member.binding + '" 的 prepared update 缺少 effects()，不能静默降为 cut。', { binding: member.binding });
          }
        });
      }

      function commitAll() {
        members.forEach(function (member) {
          try {
            member.prepared.commit();
          } catch (error) {
            throw makeSceneError('Binding "' + member.binding + '" 提交 scene 目标失败：' + messageOf(error), { binding: member.binding });
          }
        });
        members.forEach(function (member) {
          if (member.mode !== 'reveal') return;
          var container = member.entry.container;
          if (!isElement(container)) return;
          member.revealContainer = container;
          if (member.at === 'start') return;
          /* after 与旧 objects-settled 都要求目标内容先保持隐藏，启动时整块显现。 */
          scope.hideReveal(container);
        });
      }

      /* 目标提交后，调用方/参与者的真实状态都必须与目标 Frame 一致；cut/reveal 有 readView 时同样核对。 */
      function verifyCommitted() {
        members.forEach(function (member) {
          runPreparedComparison(definition, transition.to, member.binding, member.targetView, member.handle);
        });
      }

      function captureTargetsByMember() {
        var targetsByMember = {};
        members.forEach(function (member) {
          if (member.mode !== 'layout') return;
          var targets;
          try { targets = member.prepared.targets(); } catch (error) { targets = []; }
          targetsByMember[member.binding] = isArray(targets) ? targets : [];
        });
        return targetsByMember;
      }

      function createMemberRuntime(member) {
        var resolveReady;
        var resolveFinished;
        var ready = new Promise(function (resolve) { resolveReady = resolve; });
        var finished = new Promise(function (resolve) { resolveFinished = resolve; });
        return {
          member: member,
          ready: ready,
          finished: finished,
          resolveReady: resolveReady,
          resolveFinished: resolveFinished,
          readyResolved: false,
          finishedResolved: false,
          started: false,
          depsReady: false,
          readyHandles: [],
          finishHandles: [],
          revealContainer: null
        };
      }

      function resolveRuntimeReady(runtime) {
        if (!runtime || runtime.readyResolved) return;
        runtime.readyResolved = true;
        runtime.resolveReady(true);
      }

      function resolveRuntimeFinished(runtime) {
        if (!runtime || runtime.finishedResolved) return;
        runtime.finishedResolved = true;
        runtime.resolveFinished(true);
      }

      function waitHandle(handle) {
        if (!handle || !handle.finished || typeof handle.finished.then !== 'function') {
          return Promise.resolve();
        }
        return handle.finished.then(function (completed) {
          if (completed === false && !cancelled && !closed) {
            throw makeSceneError('scene 效果在未取消的情况下提前结束。');
          }
          return true;
        });
      }

      function startMember(runtime) {
        if (!runtime || runtime.started || closed || cancelled) return;
        runtime.started = true;
        var member = runtime.member;
        if (member.mode === 'reveal') {
          if (!runtime.revealContainer) {
            resolveRuntimeReady(runtime);
            resolveRuntimeFinished(runtime);
            return;
          }
          scope.reveal(runtime.revealContainer, member.finalTiming, {
            frameId: transition.to,
            bindingId: member.binding,
            effect: 'reveal'
          }).then(function (shown) {
            if (cancelled || closed) return;
            if (shown === false) {
              fail(makeSceneError('Binding "' + member.binding + '" 的 reveal 效果在未取消的情况下提前结束。', { binding: member.binding }));
              return;
            }
            resolveRuntimeReady(runtime);
            resolveRuntimeFinished(runtime);
          }, function (error) {
            if (cancelled || closed) return;
            fail(error);
          });
          return;
        }
        if (member.mode === 'layout' || member.mode === 'update') {
          try {
            runtime.readyHandles.forEach(function (handle) {
              if (handle && typeof handle.play === 'function') handle.play();
            });
            runtime.finishHandles.forEach(function (handle) {
              if (runtime.readyHandles.indexOf(handle) >= 0) return;
              if (handle && typeof handle.play === 'function') handle.play();
            });
          } catch (error) {
            fail(error);
            return;
          }
          if (!runtime.readyHandles.length) resolveRuntimeReady(runtime);
          else Promise.all(runtime.readyHandles.map(waitHandle)).then(function () {
            if (!cancelled && !closed) resolveRuntimeReady(runtime);
          }, function (error) {
            if (!cancelled && !closed) fail(error);
          });
          if (!runtime.finishHandles.length) resolveRuntimeFinished(runtime);
          else Promise.all(runtime.finishHandles.map(waitHandle)).then(function () {
            if (!cancelled && !closed) resolveRuntimeFinished(runtime);
          }, function (error) {
            if (!cancelled && !closed) fail(error);
          });
          return;
        }
        /* cut: 主动同步提交，不补动画；ready/finished 在同一任务内完成。 */
        resolveRuntimeReady(runtime);
        resolveRuntimeFinished(runtime);
      }

      /* attention 到达回调与依赖放行共用同一个启动入口，避免重复启动或失败后放行下游。 */
      function beginRuntime(runtime) {
        if (!runtime || runtime.started || closed || cancelled) return;
        try {
          startMember(runtime);
        } catch (error) {
          fail(error);
        }
      }

      function scheduleMembers(runtimes) {
        members.forEach(function (member) {
          var runtime = runtimes[member.binding];
          var gated = attention && attention.gate(member);
          if (gated) attention.attach(member, runtime);
          var deps = [];
          if (member.after && member.after.length) {
            member.after.forEach(function (id) {
              if (runtimes[id]) deps.push(runtimes[id].ready);
            });
          } else if (member.mode === 'reveal' && member.at === 'objects-settled') {
            members.forEach(function (other) {
              if (other.binding === member.binding) return;
              if (other.mode === 'reveal') return;
              if (runtimes[other.binding]) deps.push(runtimes[other.binding].ready);
            });
          }
          Promise.all(deps).then(function () {
            if (closed || cancelled) return;
            runtime.depsReady = true;
            if (gated) {
              if (attention.isArrived(member)) beginRuntime(runtime);
              return;
            }
            beginRuntime(runtime);
          }, function (error) {
            if (!closed && !cancelled) fail(error);
          });
        });
      }

      function waitForAll(promises) {
        return Promise.all(promises.map(function (p) {
          return p && typeof p.then === 'function' ? p : Promise.resolve();
        }));
      }

      function waitPresentationFinished() {
        if (!port || typeof port.finished !== 'function') return Promise.resolve();
        try {
          return Promise.resolve(port.finished());
        } catch (error) {
          return Promise.reject(makeSceneError('scene 字幕/标记收尾失败：' + messageOf(error)));
        }
      }

      function settlePort() {
        if (!port) return null;
        var error = null;
        try {
          if (typeof port.settle === 'function') port.settle();
        } catch (settleFailure) {
          error = settleFailure;
          try { if (typeof port.cancel === 'function') port.cancel(); } catch (cancelFailure) { /* ignore */ }
        }
        port = null;
        return error;
      }

      function planEffects(runtimes, targetsByMember) {
        members.forEach(function (member) {
          var runtime = runtimes[member.binding];
          scope.planLayoutEffects(runtime, targetsByMember);
          scope.planAdapterEffects(runtime);
        });
      }

      function execute() {
        if (signal && signal.aborted) {
          cancel();
          return;
        }
        if (signal && typeof signal.addEventListener === 'function') {
          try { signal.addEventListener('abort', onAbort); } catch (error) { /* ignore */ }
        }
        collectMembers();
        scope = effectsScopeModule().createScope({ frameId: transition.to, timing: markTiming });
        if (scene && scene.attention && (!presentation || typeof presentation.prepareScene !== 'function')) {
          fail(makeSceneError('scene attention 需要默认舞台 presentation（NoteDemo.mount 默认提供；NoteDemo.create 自定义宿主需提供同一 port）'));
          return;
        }
        prepareAll().then(function () {
          if (closed || cancelled) {
            if (!closed) cancel();
            return;
          }
          try {
            validatePrepared();
            if (presentation && typeof presentation.prepareScene === 'function') {
              /* 先建立 port 与隐藏旧标记，再捕获旧布局并提交。 */
              try {
                port = presentation.prepareScene({
                  sourceFrame: sourceFrame,
                  targetFrame: targetFrame,
                  attention: scene.attention,
                  attentionCoordinator: attentionCoordinator,
                  motion: motionName,
                  bindings: members.map(function (member) {
                    return { bindingId: member.binding, handle: member.handle, container: member.entry.container };
                  })
                }) || null;
              } catch (error) {
                throw makeSceneError('scene 标记准备失败：' + messageOf(error));
              }
            }
            geometryModule().captureSourceRects(members);
            commitAll();
            var targetsByMember = captureTargetsByMember();
            verifyCommitted();
            if (port && typeof port.commitTargetGeometry === 'function') {
              var geometryInfo = port.commitTargetGeometry();
              if (geometryInfo && isArray(geometryInfo.markRoots)) scope.setMarkRoots(geometryInfo.markRoots);
            }
            if (motionName === 'reduced') {
              /* 减少动效：揭示与标记直接到位，不创建动画；仍执行提交后核对与收尾。 */
              scope.showRevealContainers();
              scope.showMarkRoots();
              var reducedSettleError = settlePort();
              cleanup();
              if (reducedSettleError) {
                fail(makeSceneError('scene 标记/字幕收尾失败：' + messageOf(reducedSettleError)));
                return;
              }
              afterFrame().then(function () {
                if (!closed) finish({ status: 'completed' });
              });
              return;
            }
            var runtimes = {};
            members.forEach(function (member) {
              var runtime = createMemberRuntime(member);
              runtime.revealContainer = member.revealContainer || null;
              runtimes[member.binding] = runtime;
            });
            /* 所有 update/layout 的效果在同一提交任务里预置为暂停起点；
             * after 只决定 play 的时机，不会让目标值先闪现。 */
            planEffects(runtimes, targetsByMember);
            var markHandles = scope.planMarkEffects();
            scheduleMembers(runtimes);
            waitForAll(members.map(function (member) { return runtimes[member.binding].finished; })).then(function () {
              if (closed || cancelled) return null;
              return waitForAll(markHandles.map(waitHandle));
            }).then(function () {
              if (closed || cancelled) return null;
              return waitPresentationFinished();
            }).then(function () {
              if (closed || cancelled) return;
              var settleError = settlePort();
              cleanup();
              if (settleError) {
                fail(makeSceneError('scene 标记/字幕收尾失败：' + messageOf(settleError)));
                return;
              }
              afterFrame().then(function () {
                if (!closed) finish({ status: 'completed' });
              });
            }).then(null, function (error) {
              if (!closed && !cancelled) fail(error);
            });
          } catch (error) {
            fail(error);
          }
        }, function (error) {
          fail(error);
        });
      }

      try {
        definition = definitionModule();
        effects = effectsModule();
        if (!isObject(plan) || !isObject(plan.frameById)) throw makeSceneError('scene.run 需要有效的 plan。');
        if (!bindings || typeof bindings.entry !== 'function' || typeof bindings.readView !== 'function') {
          throw makeSceneError('scene.run 需要 bindings bag（含 entry / readView）。');
        }
        execute();
      } catch (error) {
        fail(error);
      }
    });
  }

  Internals.scene = {
    run: run
  };
})(window);
