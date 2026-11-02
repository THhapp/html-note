/* NoteDemo controller — 会话状态、导航、取消、错误恢复与订阅。
 * Scope: window.NoteDemoInternals.controller
 * Depends on: NoteDemoInternals.runner（执行过渡）；NoteCore.motion（减少动效，可选）。
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

  function repr(value) {
    if (typeof value === 'string') return '"' + value + '"';
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (isArray(value)) return '数组';
    if (typeof value === 'object') return '对象';
    return String(value);
  }

  function messageOf(error) {
    if (error == null) return '';
    if (typeof error === 'string') return error;
    if (error.message != null) return String(error.message);
    return String(error);
  }

  function actionLabel(action) {
    if (action == null) return null;
    if (typeof action === 'string') return action;
    if (isObject(action) && isArray(action.parallel)) return 'parallel';
    if (isObject(action) && action.type != null) return String(action.type);
    return 'action';
  }

  function create(config) {
    var options = isObject(config) ? config : {};
    var plan = options.plan;
    var bindings = options.bindings;
    var presentation = options.presentation || null;

    if (!isObject(plan) || !isObject(plan.frameById) || !isArray(plan.frameOrder)) {
      throw new Error('NoteDemo controller.create 需要 definition.prepare 生成的 plan。');
    }
    if (!bindings || typeof bindings.restoreFrame !== 'function') {
      throw new Error('NoteDemo controller.create 需要 bindings bag（含 restoreFrame）。');
    }
    var startFrameId = options.initialFrameId === undefined || options.initialFrameId === null
      ? plan.initialFrameId
      : options.initialFrameId;
    if (!own(plan.frameById, startFrameId)) {
      throw new Error('NoteDemo controller.create 的 initialFrameId 不是已定义的 Frame：' + repr(startFrameId));
    }

    var frameById = plan.frameById;
    var frameOrder = plan.frameOrder;
    var transitions = isObject(plan.transitions) ? plan.transitions : {};
    var bindingOrder = isArray(plan.bindingOrder) ? plan.bindingOrder : Object.keys(plan.bindings || {});
    var AbortControllerCtor = typeof global.AbortController === 'function' ? global.AbortController : null;

    var disposed = false;
    var state = freezeState({
      phase: 'idle',
      settledFrameId: startFrameId,
      targetFrameId: null,
      replaying: false,
      error: null
    });
    var listeners = [];
    var activeOp = null;
    var activeRunOp = null;
    var pendingOps = [];
    /* 最近一次公开导航的原因：scene 运行配置与默认舞台呈现用它区分正常下一步与回看/重播。 */
    var navigationCause = null;

    /* ---------------- 状态发布 ---------------- */

    function freezeError(error) {
      if (error == null) return null;
      var output = {};
      if (error.binding !== undefined && error.binding !== null) output.binding = String(error.binding);
      if (error.action !== undefined && error.action !== null) output.action = String(error.action);
      if (error.query !== undefined) output.query = error.query;
      output.message = error.message == null ? '' : String(error.message);
      return Object.freeze(output);
    }

    function freezeState(source) {
      return Object.freeze({
        phase: source.phase,
        settledFrameId: source.settledFrameId === undefined ? null : source.settledFrameId,
        targetFrameId: source.targetFrameId === undefined ? null : source.targetFrameId,
        replaying: !!source.replaying,
        error: freezeError(source.error)
      });
    }

    function setState(patch) {
      var next = {
        phase: own(patch, 'phase') ? patch.phase : state.phase,
        settledFrameId: own(patch, 'settledFrameId') ? patch.settledFrameId : state.settledFrameId,
        targetFrameId: own(patch, 'targetFrameId') ? patch.targetFrameId : state.targetFrameId,
        replaying: own(patch, 'replaying') ? patch.replaying : state.replaying,
        error: own(patch, 'error') ? patch.error : state.error
      };
      state = freezeState(next);
      notify();
    }

    function notify() {
      if (!listeners.length) return;
      var snapshot = listeners.slice();
      for (var i = 0; i < snapshot.length; i += 1) {
        try {
          snapshot[i](state);
        } catch (error) {
          /* 订阅者异常不得中断导航 */
        }
      }
    }

    /* ---------------- 结果对象 ---------------- */

    function makeResult(status, frameId, extra) {
      var output = {
        status: status,
        frameId: frameId === undefined ? state.settledFrameId : frameId
      };
      if (extra) {
        if (extra.reason !== undefined) output.reason = extra.reason;
        if (extra.error !== undefined) output.error = extra.error;
      }
      return output;
    }

    function disposedResult() {
      return makeResult('noop', state.settledFrameId, { reason: 'disposed' });
    }

    function publicErrorOf(errorLike) {
      var message = '';
      var binding;
      var action;
      var query;
      if (errorLike && typeof errorLike === 'object') {
        message = errorLike.message != null ? String(errorLike.message) : String(errorLike);
        if (errorLike.binding !== undefined && errorLike.binding !== null) binding = errorLike.binding;
        if (errorLike.action !== undefined && errorLike.action !== null) action = actionLabel(errorLike.action);
        if (errorLike.query !== undefined) query = errorLike.query;
        if (isObject(errorLike.details)) {
          if (errorLike.details.binding !== undefined && errorLike.details.binding !== null) {
            binding = errorLike.details.binding;
          }
          if (errorLike.details.action !== undefined && errorLike.details.action !== null) {
            action = actionLabel(errorLike.details.action);
          }
        }
      } else {
        message = String(errorLike == null ? '' : errorLike);
      }
      var output = {};
      if (binding !== undefined && binding !== null) output.binding = binding;
      if (action !== undefined && action !== null) output.action = action;
      if (query !== undefined) output.query = query;
      output.message = message;
      return output;
    }

    function publishErrorState(publicError, settledFrameId) {
      setState({
        phase: 'error',
        settledFrameId: settledFrameId,
        targetFrameId: null,
        replaying: false,
        error: publicError
      });
      return state.error;
    }

    /* ---------------- Frame 定位与恢复 ---------------- */

    function frameOf(frameId) {
      return frameId != null && own(frameById, frameId) ? frameById[frameId] : null;
    }

    function frameIndexOf(frameId) {
      var frame = frameOf(frameId);
      return frame ? frame.index : -1;
    }

    function nextFrameIdOf(frameId) {
      var index = frameIndexOf(frameId);
      if (index < 0 || index + 1 >= frameOrder.length) return null;
      return frameOrder[index + 1];
    }

    function prevFrameIdOf(frameId) {
      var index = frameIndexOf(frameId);
      if (index <= 0) return null;
      return frameOrder[index - 1];
    }

    function restoreFrameById(frameId) {
      var frame = frameOf(frameId);
      if (!frame) throw new Error('Frame ' + repr(frameId) + ' 不存在，无法恢复。');
      bindings.restoreFrame(frame);
    }

    function motionMode() {
      try {
        var Core = global.NoteCore;
        if (Core && Core.motion && typeof Core.motion.reduced === 'function') {
          return Core.motion.reduced() ? 'reduced' : 'normal';
        }
      } catch (error) {
        /* 无 core 时按普通动效 */
      }
      return 'normal';
    }

    function runnerModule() {
      var runner = Internals.runner;
      if (!runner || typeof runner.run !== 'function') {
        throw new Error('NoteDemo controller 需要先加载 NoteDemoInternals.runner。');
      }
      return runner;
    }

    function sceneModule() {
      var scene = Internals.scene;
      if (!scene || typeof scene.run !== 'function') {
        throw new Error('NoteDemo controller 需要先加载 NoteDemoInternals.scene。');
      }
      return scene;
    }

    function transitionHasScene(transition) {
      return !!(transition && isObject(transition.scene));
    }

    function transitionRunnable(transition) {
      if (!transition) return false;
      if (transitionHasScene(transition)) return true;
      return isArray(transition.actions) && transition.actions.length > 0;
    }

    /* ---------------- 结果落地 ---------------- */

    function applySuccess(targetFrameId) {
      setState({
        phase: 'idle',
        settledFrameId: targetFrameId,
        targetFrameId: null,
        replaying: false,
        error: null
      });
      return makeResult('completed', targetFrameId);
    }

    function applyFailure(op, error) {
      var settledBefore = op && op.settledBefore !== undefined && op.settledBefore !== null
        ? op.settledBefore
        : state.settledFrameId;
      var recoveryFailed = null;
      try {
        restoreFrameById(settledBefore);
      } catch (recoveryError) {
        recoveryFailed = recoveryError;
      }
      var publicError = publicErrorOf(error);
      if (recoveryFailed) {
        publicError.message = (publicError.message || '演示动作失败。') +
          '；恢复已停稳 Frame ' + repr(settledBefore) + ' 失败：' + messageOf(recoveryFailed);
      }
      publishErrorState(publicError, settledBefore);
      return makeResult('failed', settledBefore, { error: state.error });
    }

    function applyCancelled(op) {
      var sourceFrameId = op && op.sourceFrameId !== undefined && op.sourceFrameId !== null
        ? op.sourceFrameId
        : state.settledFrameId;
      var recoveryFailed = null;
      try {
        restoreFrameById(sourceFrameId);
      } catch (error) {
        recoveryFailed = error;
      }
      if (recoveryFailed) {
        var publicError = publicErrorOf(new Error('取消运行后恢复来源 Frame ' + repr(sourceFrameId) +
          ' 失败：' + messageOf(recoveryFailed)));
        publishErrorState(publicError, sourceFrameId);
      } else {
        setState({
          phase: 'idle',
          settledFrameId: sourceFrameId,
          targetFrameId: null,
          replaying: false,
          error: null
        });
      }
      return makeResult('cancelled', sourceFrameId);
    }

    function restoreAndIdle(targetFrameId, op) {
      try {
        restoreFrameById(targetFrameId);
      } catch (error) {
        return applyFailure(op, error);
      }
      return applySuccess(targetFrameId);
    }

    function failUnknownFrame(frameId) {
      var publicError = publicErrorOf(new Error('Frame ' + repr(frameId) + ' 不存在（可用 Frame：' +
        frameOrder.join('、') + '）。'));
      publishErrorState(publicError, state.settledFrameId);
      return makeResult('failed', state.settledFrameId, { reason: 'unknown-frame', error: state.error });
    }

    /* 同步恢复使用的占位操作：只提供结果落地需要的来源与停稳信息。 */
    function pseudoOp() {
      return {
        settledBefore: state.settledFrameId,
        sourceFrameId: state.settledFrameId
      };
    }

    /* ---------------- 异步运行与取消 ---------------- */

    function createOp(spec) {
      spec = isObject(spec) ? spec : {};
      var op = {
        settledBefore: state.settledFrameId,
        sourceFrameId: spec.sourceFrameId === undefined || spec.sourceFrameId === null
          ? state.settledFrameId
          : spec.sourceFrameId,
        targetFrameId: spec.targetFrameId === undefined ? null : spec.targetFrameId,
        transition: spec.transition || null,
        resolved: false,
        abort: null,
        cancelPromise: null,
        resolveExternal: null,
        resolveDone: null
      };
      op.promise = new Promise(function (resolve) {
        op.resolveExternal = resolve;
      });
      op.done = new Promise(function (resolve) {
        op.resolveDone = resolve;
      });
      if (AbortControllerCtor) {
        try {
          op.abort = new AbortControllerCtor();
        } catch (error) {
          op.abort = null;
        }
      }
      return op;
    }

    function closeOp(op, value) {
      if (!op || op.resolved) return false;
      op.resolved = true;
      var index = pendingOps.indexOf(op);
      if (index >= 0) pendingOps.splice(index, 1);
      if (activeOp === op) activeOp = null;
      if (activeRunOp === op) activeRunOp = null;
      if (op.resolveDone) {
        try {
          op.resolveDone();
        } catch (error) {
          /* ignore */
        }
      }
      if (op.resolveExternal) {
        try {
          op.resolveExternal(value);
        } catch (error) {
          /* ignore */
        }
      }
      return true;
    }

    function cancelOp(op) {
      if (!op || op.resolved) return Promise.resolve();
      if (!op.cancelPromise) {
        op.cancelPromise = (function () {
          if (op.abort) {
            try {
              op.abort.abort();
            } catch (error) {
              /* 已取消 */
            }
          }
          return op.done.then(function () {
            return undefined;
          }, function () {
            return undefined;
          });
        })();
      }
      return op.cancelPromise;
    }

    // 动作涉及的 binding 集合（含 parallel 成员，按首次出现顺序）。
    function actionBindingIds(transition) {
      var ids = [];
      var seen = {};
      var actions = transition && isArray(transition.actions) ? transition.actions : [];
      function add(bindingId) {
        if (typeof bindingId !== 'string' || own(seen, bindingId)) return;
        seen[bindingId] = true;
        ids.push(bindingId);
      }
      for (var i = 0; i < actions.length; i += 1) {
        var action = actions[i];
        if (!isObject(action)) continue;
        if (isArray(action.parallel)) {
          for (var m = 0; m < action.parallel.length; m += 1) {
            add(action.parallel[m] && action.parallel[m].binding);
          }
        } else {
          add(action.binding);
        }
      }
      return ids;
    }

    function sceneBindingIds(transition) {
      var ids = [];
      if (!transition || !isObject(transition.scene) || !isArray(transition.scene.bindings)) return ids;
      for (var i = 0; i < transition.scene.bindings.length; i += 1) {
        var member = transition.scene.bindings[i];
        if (member && typeof member.binding === 'string') ids.push(member.binding);
      }
      return ids;
    }

    function staticBindingIds(transition) {
      var taken = actionBindingIds(transition).concat(sceneBindingIds(transition));
      var staticIds = [];
      for (var i = 0; i < bindingOrder.length; i += 1) {
        if (taken.indexOf(bindingOrder[i]) < 0) staticIds.push(bindingOrder[i]);
      }
      return staticIds;
    }

    function runTransition(op, spec) {
      return new Promise(function (resolve) {
        var staticIds = staticBindingIds(spec.transition);
        try {
          if (spec.restoreSourceFirst) restoreFrameById(op.sourceFrameId);
          if (staticIds.length) {
            var targetFrame = frameOf(spec.targetFrameId);
            if (!targetFrame) throw new Error('Frame ' + repr(spec.targetFrameId) + ' 不存在，无法恢复静态绑定。');
            bindings.restoreBindings(staticIds, targetFrame);
          }
        } catch (error) {
          resolve(applyFailure(op, error));
          return;
        }
        if (disposed || op.resolved) {
          resolve(null);
          return;
        }
        /* 先登记 activeRunOp 再发布 running：订阅者在 running 回调里同步导航时也能取消本次运行。 */
        activeRunOp = op;
        setState({
          phase: 'running',
          settledFrameId: op.sourceFrameId,
          targetFrameId: spec.targetFrameId,
          replaying: !!spec.replaying,
          error: null
        });
        if (disposed || op.resolved) {
          resolve(null);
          return;
        }
        /* scene 与旧 actions 共用同一结果落地：completed 提交目标，否则回到来源并 cancelled，异常恢复停稳点。 */
        function settleRunPromise(runPromise) {
          runPromise.then(function (outcome) {
            if (activeRunOp === op) activeRunOp = null;
            if (disposed || op.resolved) {
              resolve(null);
              return;
            }
            if (outcome && outcome.status === 'completed') resolve(applySuccess(spec.targetFrameId));
            else resolve(applyCancelled(op));
          }, function (error) {
            if (activeRunOp === op) activeRunOp = null;
            if (disposed || op.resolved) {
              resolve(null);
              return;
            }
            resolve(applyFailure(op, error));
          });
        }
        if (transitionHasScene(spec.transition)) {
          var scene;
          try {
            scene = sceneModule();
          } catch (error) {
            if (activeRunOp === op) activeRunOp = null;
            resolve(applyFailure(op, error));
            return;
          }
          var scenePromise;
          try {
            scenePromise = scene.run({
              plan: plan,
              transition: spec.transition,
              bindings: bindings,
              signal: op.abort ? op.abort.signal : null,
              motion: motionMode(),
              presentation: presentation,
              reason: opCause(spec),
              cause: opCause(spec)
            });
          } catch (error) {
            if (activeRunOp === op) activeRunOp = null;
            resolve(applyFailure(op, error));
            return;
          }
          if (!scenePromise || typeof scenePromise.then !== 'function') {
            if (activeRunOp === op) activeRunOp = null;
            resolve(applyFailure(op, new Error('NoteDemo scene.run 没有返回 Promise。')));
            return;
          }
          settleRunPromise(scenePromise);
          return;
        }
        var runner;
        try {
          runner = runnerModule();
        } catch (error) {
          if (activeRunOp === op) activeRunOp = null;
          resolve(applyFailure(op, error));
          return;
        }
        var runPromise;
        try {
          runPromise = runner.run({
            plan: plan,
            transition: spec.transition,
            bindings: bindings,
            signal: op.abort ? op.abort.signal : null,
            motion: motionMode(),
            reason: opCause(spec),
            cause: opCause(spec)
          });
        } catch (error) {
          if (activeRunOp === op) activeRunOp = null;
          resolve(applyFailure(op, error));
          return;
        }
        if (!runPromise || typeof runPromise.then !== 'function') {
          if (activeRunOp === op) activeRunOp = null;
          resolve(applyFailure(op, new Error('NoteDemo runner.run 没有返回 Promise。')));
          return;
        }
        settleRunPromise(runPromise);
      });
    }

    function scheduleOp(spec, executor) {
      var op = createOp(spec);
      var previous = activeOp;
      var preempted = activeRunOp;
      if (preempted && preempted !== op) cancelOp(preempted);
      activeOp = op;
      pendingOps.push(op);
      var started = false;

      function run() {
        if (started) return;
        started = true;
        if (op.resolved) return;
        if (disposed) {
          closeOp(op, disposedResult());
          return;
        }
        var produced;
        try {
          produced = executor(op, preempted);
        } catch (error) {
          closeOp(op, applyFailure(op, error));
          return;
        }
        Promise.resolve(produced).then(function (value) {
          if (!op.resolved) closeOp(op, value);
        }, function (error) {
          if (!op.resolved) closeOp(op, applyFailure(op, error));
        });
      }

      if (previous && previous !== op) previous.done.then(run, run);
      else run();
      return op.promise;
    }

    /* ---------------- 公开导航 ---------------- */

    function setCause(cause) {
      navigationCause = cause;
    }

    function getNavigationCause() {
      return navigationCause;
    }

    function opCause(spec) {
      return spec && typeof spec.cause === 'string' && spec.cause ? spec.cause : 'next';
    }

    function next() {
      if (disposed) return Promise.resolve(disposedResult());
      if (activeOp) return Promise.resolve(makeResult('noop', state.settledFrameId, { reason: 'busy' }));
      setCause('next');
      var currentFrameId = state.settledFrameId;
      var targetFrameId = nextFrameIdOf(currentFrameId);
      if (!targetFrameId) return Promise.resolve(makeResult('noop', currentFrameId, { reason: 'end' }));
      var transition = own(transitions, currentFrameId) ? transitions[currentFrameId] : null;
      if (!transitionRunnable(transition)) {
        return Promise.resolve(restoreAndIdle(targetFrameId, pseudoOp()));
      }
      var spec = {
        sourceFrameId: currentFrameId,
        targetFrameId: targetFrameId,
        transition: transition,
        replaying: false,
        cause: 'next'
      };
      return scheduleOp(spec, function (op) {
        return runTransition(op, spec);
      });
    }

    function prev() {
      if (disposed) return Promise.resolve(disposedResult());
      setCause('prev');
      if (activeOp) {
        var preempted = activeRunOp;
        return scheduleOp({}, function (op) {
          var currentFrameId = state.settledFrameId;
          var targetFrameId;
          if (preempted && preempted.sourceFrameId !== undefined && preempted.sourceFrameId !== null &&
              currentFrameId === preempted.sourceFrameId) {
            targetFrameId = currentFrameId;
          } else {
            targetFrameId = prevFrameIdOf(currentFrameId);
          }
          if (!targetFrameId) return makeResult('noop', currentFrameId, { reason: 'start' });
          return restoreAndIdle(targetFrameId, op);
        });
      }
      var targetFrameId = prevFrameIdOf(state.settledFrameId);
      if (!targetFrameId) return Promise.resolve(makeResult('noop', state.settledFrameId, { reason: 'start' }));
      return Promise.resolve(restoreAndIdle(targetFrameId, pseudoOp()));
    }

    function go(frameId) {
      if (disposed) return Promise.resolve(disposedResult());
      setCause('go');
      var known = typeof frameId === 'string' && own(frameById, frameId);
      if (activeOp) {
        return scheduleOp({ targetFrameId: known ? frameId : null }, function (op) {
          if (!known) return failUnknownFrame(frameId);
          return restoreAndIdle(frameId, op);
        });
      }
      if (!known) return Promise.resolve(failUnknownFrame(frameId));
      return Promise.resolve(restoreAndIdle(frameId, pseudoOp()));
    }

    function executeIdleReplay(op) {
      var currentFrameId = state.settledFrameId;
      var index = frameIndexOf(currentFrameId);
      if (index <= 0) return makeResult('noop', currentFrameId, { reason: 'start' });
      var sourceFrameId = frameOrder[index - 1];
      var transition = own(transitions, sourceFrameId) ? transitions[sourceFrameId] : null;
      if (!transitionRunnable(transition)) {
        return restoreAndIdle(currentFrameId, op);
      }
      var spec = {
        sourceFrameId: sourceFrameId,
        targetFrameId: currentFrameId,
        transition: transition,
        replaying: true,
        restoreSourceFirst: true
      };
      return runTransition(op, spec);
    }

    function replay() {
      if (disposed) return Promise.resolve(disposedResult());
      setCause('replay');
      var previous = activeOp;
      if (previous) {
        var preempted = activeRunOp;
        var runningSpec = null;
        if (preempted && preempted.transition && transitionRunnable(preempted.transition) &&
            preempted.targetFrameId !== undefined &&
            preempted.targetFrameId !== null) {
          runningSpec = {
            sourceFrameId: preempted.sourceFrameId,
            targetFrameId: preempted.targetFrameId,
            transition: preempted.transition,
            replaying: true,
            restoreSourceFirst: true,
            cause: 'replay'
          };
        }
        return scheduleOp(runningSpec || {}, function (op) {
          if (runningSpec) return runTransition(op, runningSpec);
          return executeIdleReplay(op);
        });
      }
      var currentFrameId = state.settledFrameId;
      var index = frameIndexOf(currentFrameId);
      if (index <= 0) return Promise.resolve(makeResult('noop', currentFrameId, { reason: 'start' }));
      var sourceFrameId = frameOrder[index - 1];
      var transition = own(transitions, sourceFrameId) ? transitions[sourceFrameId] : null;
      if (!transitionRunnable(transition)) {
        return Promise.resolve(restoreAndIdle(currentFrameId, pseudoOp()));
      }
      var spec = {
        sourceFrameId: sourceFrameId,
        targetFrameId: currentFrameId,
        transition: transition,
        replaying: true,
        restoreSourceFirst: true,
        cause: 'replay'
      };
      return scheduleOp(spec, function (op) {
        return runTransition(op, spec);
      });
    }

    /* 默认舞台“上一步”：从所选步骤的初态重播上一步（不是逐帧倒播）。
     * 运行中先取消旧运行，目标是被取消运行的来源停点；否则目标为上一个停点。
     * 目标停点有可运行入边时恢复其来源再重播该步；没有则直接恢复该停点。
     * 两种入口都走 scheduleOp，保证运行可被再次取消/打断；session.prev() 仍保持
     * “恢复上一停点”语义，供自定义宿主使用。 */
    function replayStepSpec(targetFrameId) {
      var targetIndex = frameIndexOf(targetFrameId);
      var sourceFrameId = targetIndex > 0 ? frameOrder[targetIndex - 1] : null;
      var transition = sourceFrameId != null && own(transitions, sourceFrameId) ? transitions[sourceFrameId] : null;
      if (!transition || !transitionRunnable(transition) || transition.to !== targetFrameId) return null;
      return {
        sourceFrameId: sourceFrameId,
        targetFrameId: targetFrameId,
        transition: transition,
        replaying: true,
        restoreSourceFirst: true,
        cause: 'replayPrevious'
      };
    }

    function runReplayStep(op, spec) {
      op.sourceFrameId = spec.sourceFrameId;
      op.targetFrameId = spec.targetFrameId;
      op.transition = spec.transition;
      return runTransition(op, spec);
    }

    function replayPreviousStep() {
      if (disposed) return Promise.resolve(disposedResult());
      setCause('replayPrevious');
      if (activeOp) {
        var preempted = activeRunOp;
        return scheduleOp({ cause: 'replayPrevious' }, function (op) {
          var currentFrameId = state.settledFrameId;
          var targetFrameId;
          if (preempted && preempted.sourceFrameId !== undefined && preempted.sourceFrameId !== null &&
              currentFrameId === preempted.sourceFrameId) {
            targetFrameId = currentFrameId;
          } else {
            targetFrameId = prevFrameIdOf(currentFrameId);
          }
          if (!targetFrameId) return makeResult('noop', currentFrameId, { reason: 'start' });
          var spec = replayStepSpec(targetFrameId);
          if (!spec) return restoreAndIdle(targetFrameId, op);
          return runReplayStep(op, spec);
        });
      }
      var current = state.settledFrameId;
      var target = prevFrameIdOf(current);
      if (!target) return Promise.resolve(makeResult('noop', current, { reason: 'start' }));
      var idleSpec = replayStepSpec(target);
      if (!idleSpec) return Promise.resolve(restoreAndIdle(target, pseudoOp()));
      return scheduleOp(idleSpec, function (op) {
        return runReplayStep(op, idleSpec);
      });
    }

    function reset() {
      if (disposed) return Promise.resolve(disposedResult());
      setCause('reset');
      if (activeOp) {
        return scheduleOp({ targetFrameId: startFrameId }, function (op) {
          return restoreAndIdle(startFrameId, op);
        });
      }
      return Promise.resolve(restoreAndIdle(startFrameId, pseudoOp()));
    }

    /* ---------------- 只读状态与订阅 ---------------- */

    function getState() {
      return state;
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') {
        throw new TypeError('session.subscribe(listener) 需要一个函数。');
      }
      if (disposed) {
        try {
          listener(state);
        } catch (error) {
          /* 订阅者异常不得中断 */
        }
        return function () {};
      }
      listeners.push(listener);
      var active = true;
      try {
        listener(state);
      } catch (error) {
        /* 立即回调也不得中断创建 */
      }
      return function unsubscribe() {
        if (!active) return;
        active = false;
        var index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    }

    function reportError(errorLike) {
      if (disposed) return;
      var publicError = publicErrorOf(errorLike);
      if (!publicError.message) publicError.message = '演示无法继续。';
      publishErrorState(publicError, state.settledFrameId);
    }

    function destroy() {
      if (disposed) return;
      disposed = true;
      var ops = pendingOps.slice();
      var i;
      if (activeRunOp && activeRunOp.abort) {
        try {
          activeRunOp.abort.abort();
        } catch (error) {
          /* 已失效 */
        }
      }
      for (i = 0; i < ops.length; i += 1) {
        var op = ops[i];
        if (op.resolved) continue;
        var frameId = op.sourceFrameId !== undefined && op.sourceFrameId !== null
          ? op.sourceFrameId
          : state.settledFrameId;
        closeOp(op, makeResult('cancelled', frameId));
      }
      activeOp = null;
      activeRunOp = null;
      if (bindings && typeof bindings.destroy === 'function') {
        try {
          bindings.destroy();
        } catch (error) {
          /* 销毁必须同步完成 */
        }
      }
      state = freezeState({
        phase: 'disposed',
        settledFrameId: state.settledFrameId,
        targetFrameId: null,
        replaying: false,
        error: null
      });
      notify();
      listeners.length = 0;
    }

    var session = {
      next: next,
      prev: prev,
      go: go,
      replay: replay,
      replayPreviousStep: replayPreviousStep,
      reset: reset,
      getState: getState,
      subscribe: subscribe,
      destroy: destroy,
      __reportError: reportError,
      __getNavigationCause: getNavigationCause
    };
    try {
      Object.defineProperty(session, '__plan', { value: plan, enumerable: false, writable: false, configurable: false });
      Object.defineProperty(session, '__bindings', { value: bindings, enumerable: false, writable: false, configurable: false });
    } catch (error) {
      session.__plan = plan;
      session.__bindings = bindings;
    }
    return session;
  }

  Internals.controller = {
    create: create
  };
})(window);