/* NoteDemo runner — 按计划串行/并行执行一次过渡动作，核对组件真实状态。
 * Scope: window.NoteDemoInternals.runner
 * Depends on: NoteDemoInternals.definition（compareModel / compareCues / describeDiff）。
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

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
  }

  function messageOf(error) {
    if (error == null) return '';
    if (typeof error === 'string') return error;
    if (error.message != null) return String(error.message);
    return String(error);
  }

  function noop() {}

  function definitionModule() {
    var definition = Internals.definition;
    if (!definition || typeof definition.compareModel !== 'function' ||
        typeof definition.compareCues !== 'function' || typeof definition.describeDiff !== 'function') {
      throw new Error('runner 需要先加载 NoteDemoInternals.definition。');
    }
    return definition;
  }

  function viewsFor(plan, frameId) {
    if (!plan || !plan.frameById) return null;
    var frame = plan.frameById[frameId];
    return frame && frame.views ? frame.views : null;
  }

  function mismatchError(definition, kind, frameId, binding, action, diff) {
    var suffix = kind === 'model'
      ? '动作执行后的 model 与目标 Frame 不一致（不调用 restore 掩盖）。'
      : '应用目标 cues 后读回与目标 Frame 不一致。';
    var error = new Error(definition.describeDiff(frameId, binding, action, diff) + suffix);
    error.details = {
      frameId: frameId,
      binding: binding,
      action: action,
      path: diff.path,
      expected: diff.expected,
      actual: diff.actual
    };
    error.binding = binding;
    error.action = action;
    return error;
  }

  function augment(error, frameId, binding, action) {
    var base = error instanceof Error ? error : new Error(messageOf(error));
    var details = isObject(base.details) ? base.details : {};
    if (details.frameId === undefined) details.frameId = frameId;
    if (details.binding === undefined && binding != null) details.binding = binding;
    if (details.action === undefined && action != null) details.action = action;
    base.details = details;
    if (base.binding === undefined && binding != null) base.binding = binding;
    if (base.action === undefined && action != null) base.action = action;
    return base;
  }

  function run(config) {
    var options = isObject(config) ? config : {};
    var plan = options.plan;
    var transition = options.transition || null;
    var bindings = options.bindings;
    var signal = options.signal || null;
    var motion = options.motion === 'reduced' ? 'reduced' : 'normal';

    return new Promise(function (resolve, reject) {
      var definition;
      var actions;
      var sourceViews;
      var targetViews;
      var frameId;
      var started = [];
      var actionBindings = [];
      var seenActionBindings = {};
      var cancelled = false;
      var closed = false;

      try {
        definition = definitionModule();
        if (!isObject(plan) || !isObject(plan.frameById)) throw new Error('runner.run 需要有效的 plan。');
        if (!bindings || typeof bindings.readView !== 'function' || typeof bindings.applyCues !== 'function' ||
            typeof bindings.entry !== 'function') {
          throw new Error('runner.run 需要 bindings bag（含 readView / applyCues / entry）。');
        }
      } catch (error) {
        reject(error);
        return;
      }

      actions = transition && isArray(transition.actions) ? transition.actions : [];
      sourceViews = viewsFor(plan, transition && transition.from);
      targetViews = viewsFor(plan, transition && transition.to);
      frameId = transition ? transition.to : null;

      function cleanup() {
        if (signal && typeof signal.removeEventListener === 'function') {
          try {
            signal.removeEventListener('abort', onAbort);
          } catch (error) {
            /* ignore */
          }
        }
      }

      function finish(value) {
        if (closed) return;
        closed = true;
        cleanup();
        resolve(value);
      }

      function fail(error) {
        if (closed) return;
        closed = true;
        cleanup();
        reject(error);
      }

      function cancelStarted() {
        for (var i = 0; i < started.length; i += 1) {
          try {
            started[i].cancel();
          } catch (error) {
            /* 取消失败也必须继续让其他句柄失效 */
          }
        }
      }

      function waitStarted() {
        var waits = [];
        for (var i = 0; i < started.length; i += 1) {
          waits.push(started[i].finished.then(noop, noop));
        }
        return Promise.all(waits);
      }

      function closeCancelled() {
        finish({ status: 'cancelled' });
      }

      /* 外部 abort 与组件自报 cancelled 共用同一失效路径：先取消句柄并等待结算，再以 cancelled 关闭。 */
      function cancelRun() {
        if (closed || cancelled) return;
        cancelled = true;
        cancelStarted();
        waitStarted().then(closeCancelled, closeCancelled);
      }

      function onAbort() {
        cancelRun();
      }

      function rememberActionBinding(bindingId, action) {
        if (!own(seenActionBindings, bindingId)) {
          seenActionBindings[bindingId] = actionBindings.length;
          actionBindings.push({ binding: bindingId, action: action });
          return;
        }
        actionBindings[seenActionBindings[bindingId]].action = action;
      }

      function startPerform(bindingId, action) {
        if (!isNonEmptyString(bindingId)) {
          fail(augment(new Error('动作缺少 binding。'), frameId, null, action));
          return null;
        }
        var entry = null;
        try {
          entry = bindings.entry(bindingId);
        } catch (error) {
          entry = null;
        }
        var handle = entry && entry.handle ? entry.handle : null;
        if (!handle || typeof handle.perform !== 'function') {
          fail(augment(new Error('Binding "' + bindingId + '" 没有 perform，无法执行动作。'), frameId, bindingId, action));
          return null;
        }
        var effect;
        try {
          effect = handle.perform(action, {
            signal: signal,
            motion: motion,
            sourceView: sourceViews ? sourceViews[bindingId] : null,
            targetView: targetViews ? targetViews[bindingId] : null
          });
        } catch (error) {
          fail(augment(error, frameId, bindingId, action));
          return null;
        }
        if (!effect || typeof effect.cancel !== 'function' ||
            !effect.finished || typeof effect.finished.then !== 'function') {
          fail(augment(new Error('Binding "' + bindingId + '" 的 perform 必须返回 {finished: Promise, cancel: Function}。'),
            frameId, bindingId, action));
          return null;
        }
        var finished = Promise.resolve(effect.finished);
        finished.catch(noop);
        var item = {
          binding: bindingId,
          action: action,
          finished: finished,
          cancel: function () {
            try {
              effect.cancel();
            } catch (error) {
              /* ignore */
            }
          }
        };
        started.push(item);
        rememberActionBinding(bindingId, action);
        return item;
      }

      function runSingle(action, next) {
        var item = startPerform(action.binding, action);
        if (!item) return;
        item.finished.then(function (outcome) {
          if (closed || cancelled) return;
          if (outcome && outcome.status === 'completed') {
            next();
            return;
          }
          cancelRun();
        }, function (error) {
          if (closed || cancelled) return;
          cancelStarted();
          fail(augment(error, frameId, action.binding, action));
        });
      }

      function runParallel(action, next) {
        var members = action.parallel;
        var items = [];
        for (var i = 0; i < members.length; i += 1) {
          var member = members[i];
          if (!isObject(member) || !isNonEmptyString(member.binding)) {
            fail(augment(new Error('parallel 组内的动作缺少 binding。'), frameId, null, action));
            return;
          }
          var item = startPerform(member.binding, member);
          if (!item) return;
          items.push({ item: item, binding: member.binding, action: member });
        }
        if (closed || cancelled) return;
        var waits = [];
        for (var w = 0; w < items.length; w += 1) {
          (function (entry) {
            waits.push(entry.item.finished.then(function (outcome) {
              return { entry: entry, outcome: outcome };
            }, function (error) {
              return { entry: entry, error: error };
            }));
          })(items[w]);
        }
        Promise.all(waits).then(function (results) {
          if (closed || cancelled) return;
          for (var r = 0; r < results.length; r += 1) {
            if (results[r].error) {
              cancelStarted();
              fail(augment(results[r].error, frameId, results[r].entry.binding, results[r].entry.action));
              return;
            }
          }
          for (var c = 0; c < results.length; c += 1) {
            var outcome = results[c].outcome;
            if (!outcome || outcome.status !== 'completed') {
              cancelRun();
              return;
            }
          }
          next();
        });
      }

      function readActionView(bindingId, action) {
        var view;
        try {
          view = bindings.readView(bindingId);
        } catch (error) {
          fail(augment(error, frameId, bindingId, action));
          return null;
        }
        if (!isObject(view) || !own(view, 'model')) {
          fail(augment(new Error('Binding "' + bindingId + '" 的 readView 没有返回 {model,cues}。'), frameId, bindingId, action));
          return null;
        }
        return view;
      }

      function afterActions() {
        if (closed || cancelled) return;
        var i;
        var entry;
        for (i = 0; i < actionBindings.length; i += 1) {
          entry = actionBindings[i];
          var targetView = targetViews ? targetViews[entry.binding] : null;
          if (!targetView) {
            fail(augment(new Error('目标 Frame 缺少 binding "' + entry.binding + '" 的视图。'), frameId, entry.binding, entry.action));
            return;
          }
          var actual = readActionView(entry.binding, entry.action);
          if (closed) return;
          var diff = definition.compareModel(targetView.model, actual.model);
          if (diff) {
            fail(mismatchError(definition, 'model', frameId, entry.binding, entry.action, diff));
            return;
          }
        }
        if (closed || cancelled) return;
        for (i = 0; i < actionBindings.length; i += 1) {
          entry = actionBindings[i];
          var cueTarget = targetViews ? targetViews[entry.binding] : null;
          if (!cueTarget) {
            fail(augment(new Error('目标 Frame 缺少 binding "' + entry.binding + '" 的视图。'), frameId, entry.binding, entry.action));
            return;
          }
          try {
            bindings.applyCues(entry.binding, cueTarget.cues);
          } catch (error) {
            fail(augment(error, frameId, entry.binding, entry.action));
            return;
          }
          var readBack = readActionView(entry.binding, entry.action);
          if (closed) return;
          var cueDiff = definition.compareCues(cueTarget.cues, readBack.cues);
          if (cueDiff) {
            fail(mismatchError(definition, 'cues', frameId, entry.binding, entry.action, cueDiff));
            return;
          }
        }
        if (closed || cancelled) return;
        /* 本步必要的最终提示（组件内的颜色/文字淡入等）也应在本步结束前收束，
         * 避免按钮恢复可用后画面又自行开始一轮提示动效。 */
        var settleWaits = [];
        for (var s = 0; s < actionBindings.length; s += 1) {
          var settleId = actionBindings[s].binding;
          var settlePromise = null;
          try {
            settlePromise = bindings.settleVisual(settleId);
          } catch (settleError) {
            settlePromise = null;
          }
          if (settlePromise && typeof settlePromise.then === 'function') settleWaits.push(settlePromise);
        }
        if (!settleWaits.length) {
          finish({ status: 'completed' });
          return;
        }
        Promise.all(settleWaits.map(function (promise) {
          return Promise.resolve(promise).then(noop, noop);
        })).then(function () {
          if (closed || cancelled) return;
          finish({ status: 'completed' });
        });

      }

      function runActionAt(index) {
        if (closed || cancelled) return;
        if (index >= actions.length) {
          afterActions();
          return;
        }
        var action = actions[index];
        if (isObject(action) && isArray(action.parallel)) {
          runParallel(action, function () {
            runActionAt(index + 1);
          });
          return;
        }
        runSingle(action, function () {
          runActionAt(index + 1);
        });
      }

      if (signal && typeof signal.addEventListener === 'function') {
        try {
          signal.addEventListener('abort', onAbort);
        } catch (error) {
          /* 没有可用的取消通道时仍继续正常执行 */
        }
      }
      if (signal && signal.aborted) {
        onAbort();
        return;
      }
      runActionAt(0);
    });
  }

  Internals.runner = {
    run: run
  };
})(window);