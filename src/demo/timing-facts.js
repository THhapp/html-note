/* NoteDemo timing facts — 按需的 scene 时序观察。
 * Scope: window.NoteDemoInternals.timingFacts（由 src/demo/index.js 发布为 NoteDemo.timingFacts）
 * Depends on: src/demo/scene.js 的窄时序出口（Internals.scene.supportsTimingFacts）。
 *
 * 默认关闭：只有调用 watch()/collect() 时才安装 scene 的轻量 emit 出口，停止后移除；
 * 全部数据只在内存，不写文件、不发网络请求、不参与运行决策。
 *
 * fact 字段（scene 发出）：
 *   { kind, at, sessionId, runId, frameId, sourceFrameId, motion, binding, index, groups, track, group }
 *   kind: 'focus-arrival' | 'attention-ready' | 'effect-start' | 'ready' | 'finished' | 'reduced'
 *   sessionId = controller 为会话生成的稳定标识（direct scene.run 无会话时为 null）；
 *   watch(session) 只收同 sessionId 的事实，collect() 收全局事实并保留 sessionId 供自行分组；
 *   frameId = 本次过渡目标 Frame，sourceFrameId = 来源 Frame；binding 为 scene 参与者；
 *   track: 'default' | 'layout' | 'group'；group 仅在 track==='group' 时为组名；
 *   index/groups 仅 attention 到达/ready 事实携带。
 *
 * 用法：
 *   var rec = NoteDemo.timingFacts.watch(session, { onFact: function (fact) {} });
 *   session.next();
 *   rec.summary();  // 按 run/frame/binding/组汇总时长
 *   rec.stop();
 * 经典脚本，无模块 / 无网络 / 无 eval。
 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var VERSION = '1.1.0';
  var recorders = [];
  var installed = false;

  function fail(message) {
    throw new Error('NoteDemo.timingFacts: ' + message);
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function isArray(value) {
    return Array.isArray(value);
  }

  function nowMs() {
    if (global.performance && typeof global.performance.now === 'function') {
      return global.performance.now();
    }
    return Date.now();
  }

  /* scene.js 的窄出口标记；旧构建没有该标记时明确报错，而不是静默返回空事实。 */
  function supported() {
    return !!(Internals.scene && Internals.scene.supportsTimingFacts === true);
  }

  function sinkEmit(fact) {
    if (!fact) return;
    for (var i = 0; i < recorders.length; i += 1) {
      var recorder = recorders[i];
      if (!recorder || !recorder.active) continue;
      try {
        recorder._accept(fact);
      } catch (error) {
        /* 观察失败不打断运行，也不影响其它 recorder。 */
      }
    }
  }

  function install() {
    if (installed) return;
    if (!supported()) {
      fail('当前 scene.js 没有提供时序事实出口（需要新版公共编排层）。');
    }
    installed = true;
    Internals.sceneTimingFacts = {
      version: 1,
      emit: sinkEmit
    };
  }

  function uninstall() {
    installed = false;
    if (!Internals.sceneTimingFacts) return;
    try {
      delete Internals.sceneTimingFacts;
    } catch (error) {
      Internals.sceneTimingFacts = null;
    }
  }

  function normalizeFact(fact) {
    var source = isObject(fact) ? fact : {};
    var at = typeof source.at === 'number' && isFinite(source.at) ? source.at : nowMs();
    return {
      kind: typeof source.kind === 'string' ? source.kind : '',
      at: at,
      sessionId: source.sessionId === undefined || source.sessionId === null ? null : source.sessionId,
      runId: source.runId == null ? null : source.runId,
      frameId: source.frameId == null ? null : String(source.frameId),
      sourceFrameId: source.sourceFrameId == null ? null : String(source.sourceFrameId),
      motion: source.motion === 'reduced' ? 'reduced' : 'normal',
      binding: source.binding == null ? null : String(source.binding),
      index: typeof source.index === 'number' ? source.index : null,
      groups: isArray(source.groups) ? source.groups.slice() : null,
      track: source.track == null ? null : String(source.track),
      group: source.group == null ? null : String(source.group)
    };
  }

  function createRecorder(options) {
    var config = isObject(options) ? options : {};
    var list = [];
    var listeners = [];
    var predicate = typeof config.predicate === 'function' ? config.predicate : null;
    var recorder = {
      active: false,
      label: config.label == null ? null : String(config.label),
      /* 会话级 recorder 的固定 sessionId；全局 collect 为 null。 */
      sessionId: config.sessionId === undefined || config.sessionId === null ? null : config.sessionId,
      startedAt: nowMs(),
      version: VERSION,
      _unsubscribe: null
    };

    function notify(fact) {
      for (var i = 0; i < listeners.length; i += 1) {
        try {
          listeners[i](fact);
        } catch (error) {
          /* 观察回调异常不回传给 scene。 */
        }
      }
    }

    function accept(fact) {
      var normalized = normalizeFact(fact);
      if (predicate && predicate(normalized) !== true) return;
      list.push(normalized);
      notify(normalized);
    }

    recorder._accept = accept;
    recorder.snapshot = function () {
      return list.slice();
    };
    recorder.count = function () {
      return list.length;
    };
    recorder.clear = function () {
      list.length = 0;
    };
    recorder.onFact = function (callback) {
      if (typeof callback !== 'function') fail('onFact(callback) 需要函数。');
      listeners.push(callback);
      return function off() {
        var index = listeners.indexOf(callback);
        if (index >= 0) listeners.splice(index, 1);
      };
    };
    recorder.summary = function () {
      return summarize(list);
    };
    recorder.stop = function () {
      if (!recorder.active) return;
      recorder.active = false;
      if (typeof recorder._unsubscribe === 'function') {
        try {
          recorder._unsubscribe();
        } catch (error) { /* 已销毁的 session 等，忽略 */ }
        recorder._unsubscribe = null;
      }
      var index = recorders.indexOf(recorder);
      if (index >= 0) recorders.splice(index, 1);
      /* 已收集事实保留；回调引用随 stop 释放，避免会话销毁后仍持有观察闭包。 */
      listeners.length = 0;
      if (!recorders.length) uninstall();
    };

    if (typeof config.onFact === 'function') recorder.onFact(config.onFact);
    /* 先安装 scene 出口：旧构建不支持时在返回 recorder 前明确抛错，不注册半成品。 */
    install();
    recorders.push(recorder);
    recorder.active = true;
    return recorder;
  }

  function trackKey(track, group) {
    return String(track || '') + '\u0000' + String(group || '');
  }

  /* 汇总：按 sessionId + run（runId+目标/来源 Frame+motion）→ Binding → 轨道（track+group）聚合。
   * sessionId 进入 run key 与输出，同名 Frame 跨会话不会被合并；同一轨道多次出现时取第一次
   * startedAt/readyAt/finishedAt；时长只在两者都有时计算。 */
  function summarize(facts) {
    var runs = [];
    var runMap = {};
    var sessionIds = [];
    for (var i = 0; i < facts.length; i += 1) {
      var fact = facts[i];
      var sessionKey = String(fact.sessionId);
      var runKey = sessionKey + '|' + String(fact.runId) + '|' + String(fact.frameId) + '|' +
        String(fact.sourceFrameId) + '|' + fact.motion;
      var run = runMap[runKey];
      if (!run) {
        run = {
          sessionId: fact.sessionId,
          runId: fact.runId,
          frameId: fact.frameId,
          sourceFrameId: fact.sourceFrameId,
          motion: fact.motion,
          firstAt: fact.at,
          lastAt: fact.at,
          bindings: {}
        };
        runMap[runKey] = run;
        runs.push(run);
      }
      if (fact.at < run.firstAt) run.firstAt = fact.at;
      if (fact.at > run.lastAt) run.lastAt = fact.at;
      if (sessionIds.indexOf(fact.sessionId) < 0) sessionIds.push(fact.sessionId);
      if (!fact.binding) continue;
      var binding = run.bindings[fact.binding];
      if (!binding) {
        binding = { binding: fact.binding, focusArrivals: [], attentionReady: [], tracks: {} };
        run.bindings[fact.binding] = binding;
      }
      if (fact.kind === 'focus-arrival') {
        binding.focusArrivals.push({ at: fact.at, index: fact.index, groups: fact.groups ? fact.groups.slice() : null });
        continue;
      }
      if (fact.kind === 'attention-ready') {
        binding.attentionReady.push({ at: fact.at, index: fact.index });
        continue;
      }
      if (!fact.track) continue;
      var key = trackKey(fact.track, fact.group);
      var track = binding.tracks[key];
      if (!track) {
        track = { track: fact.track, group: fact.group, startedAt: null, readyAt: null, finishedAt: null };
        binding.tracks[key] = track;
      }
      if (fact.kind === 'effect-start' && track.startedAt == null) track.startedAt = fact.at;
      else if (fact.kind === 'ready' && track.readyAt == null) track.readyAt = fact.at;
      else if (fact.kind === 'finished' && track.finishedAt == null) track.finishedAt = fact.at;
    }
    for (var r = 0; r < runs.length; r += 1) {
      var current = runs[r];
      current.bindings = Object.keys(current.bindings).map(function (bindingId) {
        var binding = current.bindings[bindingId];
        binding.tracks = Object.keys(binding.tracks).map(function (key) {
          var track = binding.tracks[key];
          track.readyMs = track.startedAt != null && track.readyAt != null
            ? Math.round((track.readyAt - track.startedAt) * 100) / 100
            : null;
          track.finishedMs = track.startedAt != null && track.finishedAt != null
            ? Math.round((track.finishedAt - track.startedAt) * 100) / 100
            : null;
          return track;
        });
        return binding;
      });
    }
    var firstAt = null;
    var lastAt = null;
    for (var f = 0; f < facts.length; f += 1) {
      if (firstAt == null || facts[f].at < firstAt) firstAt = facts[f].at;
      if (lastAt == null || facts[f].at > lastAt) lastAt = facts[f].at;
    }
    /* 单一来源（watch 会话）时顶层也给出 sessionId；全局 collect 用 sessionIds 区分。 */
    var soleSessionId = sessionIds.length === 1 ? sessionIds[0] : null;
    return {
      count: facts.length,
      firstAt: firstAt,
      lastAt: lastAt,
      sessionId: soleSessionId,
      sessionIds: sessionIds,
      runs: runs
    };
  }

  /* 会话级窄订阅：只收集 session.__sessionId 相同的 fact；Frame 只用于会话内内容分组，
   * 不再是跨会话判断依据。session 销毁、watch 初始化失败、stop 都释放订阅。 */
  function watch(session, options) {
    if (!session || typeof session.getState !== 'function' || typeof session.subscribe !== 'function') {
      fail('watch(session, options) 需要一个 NoteDemo 会话。');
    }
    var sessionId = session.__sessionId;
    if (sessionId === undefined || sessionId === null) {
      fail('watch(session, options) 需要一个带稳定 __sessionId 的会话（旧构建或非 controller 会话无法隔离观察）。');
    }
    var initialState = null;
    try {
      initialState = session.getState();
    } catch (error) {
      initialState = null;
    }
    if (isObject(initialState) && initialState.phase === 'disposed') {
      fail('watch(session, options) 的会话已销毁，不能继续观察。');
    }
    var config = isObject(options) ? options : {};
    var recorder = null;
    var disposedWhileSettingUp = false;
    /* 订阅只用于会话销毁时自动收尾，不再缓存/匹配 Frame。 */
    var unsubscribe = session.subscribe(function (state) {
      if (!isObject(state) || state.phase !== 'disposed') return;
      disposedWhileSettingUp = true;
      if (!recorder) return;
      try {
        recorder.stop();
      } catch (error) {
        /* 清理失败不影响会话销毁。 */
      }
    });
    try {
      recorder = createRecorder({
        label: config.label == null ? null : config.label,
        onFact: typeof config.onFact === 'function' ? config.onFact : null,
        sessionId: sessionId,
        predicate: function (fact) {
          return fact.sessionId === sessionId;
        }
      });
    } catch (error) {
      /* 初始化失败（如 scene 出口不支持）必须退订，不能留下半成品监听。 */
      try {
        unsubscribe();
      } catch (cleanupError) {
        /* 会话已销毁等，忽略 */
      }
      throw error;
    }
    recorder._unsubscribe = unsubscribe;
    if (disposedWhileSettingUp) {
      try {
        recorder.stop();
      } catch (error) {
        /* 已停止 */
      }
    }
    return recorder;
  }

  /* 全局收集：不绑定 session，用于单页调试或探针对照；默认仍然关闭。 */
  function collect(options) {
    var config = isObject(options) ? options : {};
    return createRecorder({
      label: config.label == null ? null : config.label,
      onFact: typeof config.onFact === 'function' ? config.onFact : null,
      predicate: typeof config.filter === 'function' ? config.filter : null
    });
  }

  var api = {
    version: VERSION,
    supported: supported,
    watch: watch,
    collect: collect
  };

  Internals.timingFacts = api;
  if (global.NoteDemo) global.NoteDemo.timingFacts = api;
  if (global.NoteDemoAuthor) global.NoteDemoAuthor.timingFacts = api;
})(window);