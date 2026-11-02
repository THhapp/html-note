/* NoteDemo scene — 完整目标画面的受控过渡编排（layout / update / cut / reveal）。
 * Scope: window.NoteDemoInternals.scene
 * Depends on: definition（提交后读回比较）、effects（timing 合并/进度句柄）、sceneGeometry（FLIP/矩形）、
 *             sceneEffects（轨道化的 WAAPI/进度效果、揭示与标记）、sceneAttention（观察目标与效果组门控）。
 * 一次运行拥有全部效果、延后启动、临时资源与清理；经典脚本，无模块 / 无网络 / 无 eval。
 *
 * 运行原因（reason）由 controller 传入：next | replay | replayPrevious | go | reset | prev；
 * 缺省 'next'。它只透传给 presentation（info.reason / info.cause），scene 自身行为不变。 */
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

  /* 可选时序事实出口：由 timing-facts.js 按需安装 Internals.sceneTimingFacts；
   * 默认不存在，观察不参与运行决策，也不改变 scene 行为。 */
  function factsSink() {
    var facts = Internals.sceneTimingFacts;
    return facts && typeof facts.emit === 'function' ? facts : null;
  }

  var factsRunSequence = 0;

  function nowMs() {
    if (global.performance && typeof global.performance.now === 'function') return global.performance.now();
    return Date.now();
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

  function normalizeReason(options) {
    var value = options.reason != null ? options.reason : options.cause;
    if (value == null) return 'next';
    var text = String(value);
    return text || 'next';
  }

  function run(config) {
    var options = isObject(config) ? config : {};
    var plan = options.plan;
    var transition = options.transition || null;
    var bindings = options.bindings;
    var signal = options.signal || null;
    var presentation = options.presentation || null;
    var motionName = options.motion === 'reduced' ? 'reduced' : 'normal';
    var reason = normalizeReason(options);
    var factSink = factsSink();
    var factRunId = factSink ? (factsRunSequence += 1) : 0;

    function emitFact(kind, detail) {
      if (!factSink) return;
      var payload = {
        kind: kind,
        at: nowMs(),
        runId: factRunId,
        frameId: transition ? transition.to : null,
        sourceFrameId: transition ? transition.from : null,
        motion: motionName,
        binding: null,
        index: null,
        groups: null,
        track: null,
        group: null
      };
      if (isObject(detail)) {
        if (detail.binding != null) payload.binding = detail.binding;
        if (typeof detail.index === 'number') payload.index = detail.index;
        if (isArray(detail.groups)) payload.groups = detail.groups.slice();
        if (detail.track != null) payload.track = detail.track;
        if (detail.group != null) payload.group = detail.group;
      }
      try {
        factSink.emit(payload);
      } catch (error) {
        /* 时序观察失败不影响运行。 */
      }
    }

    return new Promise(function (resolve, reject) {
      var definition;
      var effects;
      var scene;
      var sourceFrame;
      var targetFrame;
      var members = [];
      var memberMap = {};
      var markTiming = null;
      var port = null;
      var attention = null;
      var attentionCoordinator = null;
      var attentionInfos = [];
      var attentionEnabled = false;
      var runtimes = {};
      var scope = null;
      var closed = false;
      var cancelled = false;
      var cleaned = false;
      var preparedList = [];

      function scenePath() {
        if (scene && scene.path) return scene.path;
        if (transition) return 'transition "' + String(transition.from) + '" → "' + String(transition.to) + '" 的 scene';
        return 'scene';
      }

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
        if (attention && typeof attention.cancel === 'function') {
          try { attention.cancel(); } catch (error) { /* ignore */ }
        }
        /* 来源可见性交接优先释放：源视觉恢复内联原值，随后句柄取消与 Adapter cleanup 在同一任务内完成。 */
        releaseAllSourceVisibility();
        if (scope) {
          try { scope.release(); } catch (error) { /* 清理失败不阻断 */ }
        }
        releasePrepared();
        if (port && typeof port.cancel === 'function') {
          try { port.cancel(); } catch (error) { /* ignore */ }
        }
        port = null;
        /* 目标效果已收束/取消，最后释放受控载体的接管；恢复路径会在 restore 内再次短暂接管。 */
        if (bindings && typeof bindings.endSceneControl === 'function') {
          try { bindings.endSceneControl(members.map(function (member) { return member.binding; })); } catch (error) { /* 清理失败不阻断 */ }
        }
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

      /* ---------------- 收集参与者 ---------------- */

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
          var member = {
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
            grouped: false,
            groups: [],
            gatedGroups: null,
            defaultGateIndex: null,
            firstContentIndex: null,
            attentionContent: false,
            revealContainer: null,
            sourceElements: [],
            sourceVisibilityToken: null,
            sourceReleased: false
          };
          members.push(member);
          memberMap[member.binding] = member;
        }
      }

      /* ---------------- 准备与校验 ---------------- */

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

      /* ---------------- 来源可见性交接（PreparedChange.sourceElements） ---------------- */

      function releaseSourceVisibility(member) {
        if (!member || !member.sourceVisibilityToken) return;
        var token = member.sourceVisibilityToken;
        member.sourceVisibilityToken = null;
        member.sourceReleased = true;
        try { effects.releaseVisibility(token); } catch (error) { /* 清理失败不阻断 */ }
      }

      function releaseAllSourceVisibility() {
        for (var i = 0; i < members.length; i += 1) releaseSourceVisibility(members[i]);
      }

      /* prepareChange 返回后、commit 前调用一次；只捕获来源视觉，不克隆/替换 DOM。 */
      function collectSourceElements() {
        members.forEach(function (member) {
          if (member.mode !== 'layout' && member.mode !== 'update') return;
          var prepared = member.prepared;
          if (!prepared || typeof prepared.sourceElements !== 'function') return;
          var value;
          try {
            value = prepared.sourceElements();
          } catch (error) {
            throw makeSceneError('Binding "' + member.binding + '" 的 sourceElements() 失败：' + messageOf(error), {
              binding: member.binding,
              path: 'scene.bindings["' + member.binding + '"].sourceElements'
            });
          }
          if (value === undefined || value === null) return;
          if (!isArray(value)) {
            throw makeSceneError('Binding "' + member.binding + '" 的 sourceElements() 必须返回 Element[]（或省略）。', {
              binding: member.binding,
              path: 'scene.bindings["' + member.binding + '"].sourceElements'
            });
          }
          var elements = [];
          for (var i = 0; i < value.length; i += 1) {
            var element = value[i];
            if (!element || element.nodeType !== 1) {
              throw makeSceneError('Binding "' + member.binding + '" 的 sourceElements()[' + i + '] 必须是 DOM Element。', {
                binding: member.binding,
                path: 'scene.bindings["' + member.binding + '"].sourceElements[' + i + ']'
              });
            }
            if (!element.isConnected) {
              throw makeSceneError('Binding "' + member.binding + '" 的 sourceElements()[' + i +
                '] 在 commit 前已从文档断开；请在 prepare 阶段返回仍连接的真实来源对象。', {
                binding: member.binding,
                path: 'scene.bindings["' + member.binding + '"].sourceElements[' + i + ']'
              });
            }
            if (elements.indexOf(element) < 0) elements.push(element);
          }
          member.sourceElements = elements;
          member.sourceVisibilityToken = elements.length ? effects.captureVisibility(elements) : null;
        });
      }

      function holdSourceVisibility() {
        members.forEach(function (member) {
          if (!member.sourceVisibilityToken) return;
          try {
            effects.holdVisibility(member.sourceVisibilityToken);
          } catch (error) {
            throw makeSceneError('Binding "' + member.binding + '" 的来源可见性保持失败：' + messageOf(error), {
              binding: member.binding
            });
          }
        });
      }

      function discoverGroups() {
        members.forEach(function (member) {
          if (member.mode !== 'layout' && member.mode !== 'update') return;
          var prepared = member.prepared;
          if (!prepared || typeof prepared.groups !== 'function') return;
          var value;
          try {
            value = prepared.groups();
          } catch (error) {
            throw makeSceneError('Binding "' + member.binding + '" 的 groups() 失败：' + messageOf(error), { binding: member.binding });
          }
          if (value === undefined || value === null) return;
          if (!isArray(value)) {
            throw makeSceneError('Binding "' + member.binding + '" 的 groups() 必须返回 string[]（或省略）。', { binding: member.binding });
          }
          var names = [];
          var seen = {};
          for (var i = 0; i < value.length; i += 1) {
            var name = value[i];
            if (typeof name !== 'string' || name.trim() === '') {
              throw makeSceneError('Binding "' + member.binding + '" 的 groups()[' + i + '] 必须是非空字符串。', { binding: member.binding });
            }
            if (own(seen, name)) {
              throw makeSceneError('Binding "' + member.binding + '" 的 groups() 重复声明组 "' + name + '"。', { binding: member.binding, group: name });
            }
            seen[name] = true;
            names.push(name);
          }
          if (names.length) {
            member.grouped = true;
            member.groups = names;
          }
        });
      }

      function attentionFactDetail(index) {
        var info = attentionInfos[index] || null;
        return {
          index: index,
          binding: info ? info.binding : null,
          groups: info && isArray(info.groups) ? info.groups : null
        };
      }

      function setupAttention() {
        attentionEnabled = motionName !== 'reduced' && !!scene.attention;
        if (!scene.attention) {
          attention = null;
          attentionCoordinator = null;
          return;
        }
        attention = attentionModule().create({
          targets: scene.attention.targets,
          enabled: attentionEnabled,
          stepDuration: scene.attention.stepDuration,
          createError: makeSceneError,
          resolveMember: function (binding) { return memberMap[binding] || null; },
          startDefault: function (member) {
            var runtime = runtimes[member.binding];
            if (!runtime) return;
            requestStart(runtime, function () { startDefaultTrack(runtime); });
          },
          startGroups: function (member, groups) {
            var runtime = runtimes[member.binding];
            if (!runtime) return;
            requestStart(runtime, function () { startGroupTracks(runtime, groups); });
          },
          readyDefault: function (member) {
            var runtime = runtimes[member.binding];
            return runtime ? runtime.defaultTrack.ready : Promise.resolve(true);
          },
          readyGroups: function (member, groups, info) {
            var runtime = runtimes[member.binding];
            if (!runtime) return Promise.resolve(true);
            var list = [];
            for (var i = 0; i < groups.length; i += 1) {
              var trackInfo = runtime.groupTracks[groups[i]];
              if (trackInfo) list.push(trackInfo.ready);
            }
            if (runtime.layoutTrack && member.firstContentIndex === info.index) list.push(runtime.layoutTrack.ready);
            return Promise.all(list);
          }
        });
        if (!attentionEnabled) {
          attentionCoordinator = null;
          return;
        }
        attention.validate();
        attentionCoordinator = {
          start: function (index) {
            /* presentation 只在 Focus 真实到达后调用 start；先记录到达，再放行内容组，
             * 这样观察到的顺序是 focus-arrival → effect-start。 */
            emitFact('focus-arrival', attentionFactDetail(index));
            attention.start(index);
          },
          ready: function (index) {
            var ready = attention.ready(index);
            Promise.resolve(ready).then(function () {
              emitFact('attention-ready', attentionFactDetail(index));
            }, function () { /* 失败由 scene 统一处理 */ });
            return ready;
          }
        };
        var infos = attention.targetInfos();
        attentionInfos = infos;
        infos.forEach(function (info) {
          if (!info || !info.member) return;
          var member = info.member;
          if (info.kind !== 'content') return;
          member.attentionContent = true;
          if (info.groups == null) {
            member.defaultGateIndex = info.index;
          } else {
            if (!member.gatedGroups) member.gatedGroups = {};
            info.groups.forEach(function (name) { member.gatedGroups[name] = info.index; });
          }
          if (member.firstContentIndex === null || info.index < member.firstContentIndex) {
            member.firstContentIndex = info.index;
          }
        });
        /* 只被 groups: [] 观察、没有任何内容放行的 scene 成员：观察目标本身不启动内容，
         * 按未门控成员正常调度（不会卡住完成边界）；作者若要延后内容应补内容目标。 */
      }

      /* ---------------- 轨道与运行时 ---------------- */

      function createTrack(name) {
        var resolveReady;
        var resolveFinished;
        var trackInfo = {
          name: name,
          started: false,
          readyHandles: [],
          finishHandles: [],
          readyResolved: false,
          finishedResolved: false,
          ready: null,
          finished: null,
          resolveReady: null,
          resolveFinished: null
        };
        trackInfo.ready = new Promise(function (resolve) { resolveReady = resolve; });
        trackInfo.finished = new Promise(function (resolve) { resolveFinished = resolve; });
        trackInfo.resolveReady = resolveReady;
        trackInfo.resolveFinished = resolveFinished;
        return trackInfo;
      }

      function createMemberRuntime(member) {
        var runtime = {
          member: member,
          grouped: member.grouped === true,
          groupNames: member.groups.slice(),
          defaultTrack: createTrack('default'),
          layoutTrack: null,
          groupTracks: {},
          trackList: [],
          attention: member.attentionContent === true,
          planned: false,
          depsReady: false,
          pending: [],
          revealStarted: false,
          releaseStarted: false,
          revealContainer: member.revealContainer || null
        };
        if (runtime.grouped) {
          if (member.mode === 'layout') runtime.layoutTrack = createTrack('layout');
          runtime.groupNames.forEach(function (name) {
            runtime.groupTracks[name] = createTrack(name);
          });
          if (runtime.layoutTrack) runtime.trackList.push(runtime.layoutTrack);
          runtime.groupNames.forEach(function (name) { runtime.trackList.push(runtime.groupTracks[name]); });
        } else {
          runtime.trackList.push(runtime.defaultTrack);
        }
        runtime.defaultTrack.binding = member.binding;
        runtime.defaultTrack.trackKind = 'default';
        if (runtime.layoutTrack) {
          runtime.layoutTrack.binding = member.binding;
          runtime.layoutTrack.trackKind = 'layout';
        }
        runtime.groupNames.forEach(function (name) {
          var track = runtime.groupTracks[name];
          track.binding = member.binding;
          track.trackKind = 'group';
          track.groupName = name;
        });
        runtime.memberReady = Promise.all(runtime.trackList.map(function (trackInfo) { return trackInfo.ready; }));
        runtime.memberFinished = Promise.all(runtime.trackList.map(function (trackInfo) { return trackInfo.finished; }));
        return runtime;
      }

      function trackFactDetail(trackInfo) {
        if (!trackInfo) return null;
        return {
          binding: trackInfo.binding == null ? null : trackInfo.binding,
          track: trackInfo.trackKind == null ? 'default' : trackInfo.trackKind,
          group: trackInfo.groupName == null ? null : trackInfo.groupName
        };
      }

      function resolveTrackReady(trackInfo) {
        if (!trackInfo || trackInfo.readyResolved) return;
        trackInfo.readyResolved = true;
        trackInfo.resolveReady(true);
        emitFact('ready', trackFactDetail(trackInfo));
      }

      function resolveTrackFinished(trackInfo) {
        if (!trackInfo || trackInfo.finishedResolved) return;
        trackInfo.finishedResolved = true;
        trackInfo.resolveFinished(true);
        emitFact('finished', trackFactDetail(trackInfo));
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

      function playTrackHandles(trackInfo) {
        var played = [];
        trackInfo.readyHandles.forEach(function (handle) {
          if (handle && typeof handle.play === 'function') {
            handle.play();
            played.push(handle);
          }
        });
        trackInfo.finishHandles.forEach(function (handle) {
          if (played.indexOf(handle) >= 0) return;
          if (handle && typeof handle.play === 'function') handle.play();
        });
      }

      function startTrack(runtime, trackInfo) {
        if (!trackInfo || trackInfo.started || closed || cancelled) return;
        trackInfo.started = true;
        /* 本 Binding 的第一个内容效果轨道开始接管：来源视觉交接释放。 */
        releaseSourceVisibility(runtime.member);
        emitFact('effect-start', trackFactDetail(trackInfo));
        if (!trackInfo.readyHandles.length && !trackInfo.finishHandles.length) {
          resolveTrackReady(trackInfo);
          resolveTrackFinished(trackInfo);
          return;
        }
        try {
          playTrackHandles(trackInfo);
        } catch (error) {
          fail(error);
          return;
        }
        if (!trackInfo.readyHandles.length) resolveTrackReady(trackInfo);
        else Promise.all(trackInfo.readyHandles.map(waitHandle)).then(function () {
          if (!cancelled && !closed) resolveTrackReady(trackInfo);
        }, function (error) {
          if (!cancelled && !closed) fail(error);
        });
        if (!trackInfo.finishHandles.length) resolveTrackFinished(trackInfo);
        else Promise.all(trackInfo.finishHandles.map(waitHandle)).then(function () {
          if (!cancelled && !closed) resolveTrackFinished(trackInfo);
        }, function (error) {
          if (!cancelled && !closed) fail(error);
        });
      }

      function startReveal(runtime) {
        if (!runtime || runtime.revealStarted || closed || cancelled) return;
        runtime.revealStarted = true;
        releaseSourceVisibility(runtime.member);
        var trackInfo = runtime.defaultTrack;
        trackInfo.started = true;
        emitFact('effect-start', trackFactDetail(trackInfo));
        var member = runtime.member;
        if (!runtime.revealContainer) {
          resolveTrackReady(trackInfo);
          resolveTrackFinished(trackInfo);
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
          resolveTrackReady(trackInfo);
          resolveTrackFinished(trackInfo);
        }, function (error) {
          if (cancelled || closed) return;
          fail(error);
        });
      }

      function startDefaultTrack(runtime) {
        if (!runtime || closed || cancelled) return;
        var member = runtime.member;
        if (member.mode === 'reveal') {
          startReveal(runtime);
          return;
        }
        if (member.mode === 'cut') {
          resolveTrackReady(runtime.defaultTrack);
          resolveTrackFinished(runtime.defaultTrack);
          return;
        }
        startTrack(runtime, runtime.defaultTrack);
      }

      function startGroupTracks(runtime, groups) {
        if (!runtime || !runtime.grouped || closed || cancelled) return;
        var member = runtime.member;
        if (!runtime.releaseStarted) {
          runtime.releaseStarted = true;
          if (runtime.layoutTrack) startTrack(runtime, runtime.layoutTrack);
          runtime.groupNames.forEach(function (name) {
            if (member.gatedGroups && own(member.gatedGroups, name)) return;
            startTrack(runtime, runtime.groupTracks[name]);
          });
        }
        groups.forEach(function (name) {
          if (runtime.groupTracks[name]) startTrack(runtime, runtime.groupTracks[name]);
        });
      }

      function startAllTracks(runtime) {
        if (!runtime || closed || cancelled) return;
        if (!runtime.grouped) {
          startDefaultTrack(runtime);
          return;
        }
        if (runtime.layoutTrack) startTrack(runtime, runtime.layoutTrack);
        runtime.groupNames.forEach(function (name) { startTrack(runtime, runtime.groupTracks[name]); });
      }

      function flushRuntime(runtime) {
        if (!runtime || !runtime.planned || !runtime.depsReady || closed || cancelled) return;
        var list = runtime.pending;
        runtime.pending = [];
        list.forEach(function (action) {
          if (closed || cancelled) return;
          try { action(); } catch (error) { fail(error); }
        });
      }

      function requestStart(runtime, action) {
        if (!runtime || closed || cancelled) return;
        runtime.pending.push(action);
        flushRuntime(runtime);
      }

      /* ---------------- after / reveal 依赖 ---------------- */

      function afterDependencyRefs(member) {
        var refs = [];
        if (member.after && member.after.length) {
          member.after.forEach(function (entry) {
            var targetMember = memberMap[entry && entry.binding];
            if (!targetMember) {
              throw makeSceneError('Binding "' + member.binding + '" 的 after 引用了本 scene 中不存在的 binding "' +
                String(entry && entry.binding) + '"。', { binding: member.binding, path: scenePath() });
            }
            if (entry.group == null) {
              refs.push({ kind: 'member', binding: entry.binding });
              return;
            }
            if (!targetMember.grouped) {
              throw makeSceneError('Binding "' + member.binding + '" 的 after 引用了 Binding "' + entry.binding +
                '" 的组 "' + entry.group + '"，但该 Binding 的 Adapter 未声明效果组。', {
                binding: member.binding,
                path: scenePath()
              });
            }
            if (targetMember.groups.indexOf(entry.group) < 0) {
              throw makeSceneError('Binding "' + member.binding + '" 的 after 引用了 Binding "' + entry.binding +
                '" 的未知效果组 "' + entry.group + '"（已声明：' + targetMember.groups.join('、') + '）。', {
                binding: member.binding,
                path: scenePath()
              });
            }
            refs.push({ kind: 'group', binding: entry.binding, group: entry.group });
          });
          return refs;
        }
        if (member.mode === 'reveal' && member.at === 'objects-settled') {
          members.forEach(function (other) {
            if (other.binding === member.binding || other.mode === 'reveal') return;
            refs.push({ kind: 'member', binding: other.binding });
          });
        }
        return refs;
      }

      function dependencyNode(ref) {
        if (ref.kind === 'group') return 'readyTrack:' + ref.binding + ':' + ref.group;
        return 'readyMember:' + ref.binding;
      }

      function dependencyPromise(ref) {
        var runtime = runtimes[ref.binding];
        if (!runtime) return Promise.resolve(true);
        if (ref.kind === 'group') {
          return runtime.groupTracks[ref.group] ? runtime.groupTracks[ref.group].ready : Promise.resolve(true);
        }
        return runtime.memberReady;
      }

      /* ---------------- 联合 waits-for 图（组级，prepare 后 commit 前） ---------------- */

      function graphNodeLabel(id) {
        var parts = id.split(':');
        if (parts[0] === 'attnArrive') return 'attention[' + parts[1] + '] 到达';
        if (parts[0] === 'attnReady') return 'attention[' + parts[1] + '] ready';
        if (parts[0] === 'startTrack') return 'Binding "' + parts[1] + '" 轨道 "' + parts.slice(2).join(':') + '" start';
        if (parts[0] === 'readyTrack') return 'Binding "' + parts[1] + '" 轨道 "' + parts.slice(2).join(':') + '" ready';
        if (parts[0] === 'readyMember') return 'Binding "' + parts[1] + '" ready';
        return id;
      }

      function verifyJointGraph() {
        var edges = {};
        function node(id) { if (!own(edges, id)) edges[id] = []; return id; }
        function edge(from, to) {
          node(from);
          if (edges[from].indexOf(to) < 0) edges[from].push(to);
        }
        function startTrackNode(member, name) { return 'startTrack:' + member.binding + ':' + name; }
        function readyTrackNode(member, name) { return 'readyTrack:' + member.binding + ':' + name; }
        members.forEach(function (member) {
          var runtime = runtimes[member.binding];
          node('readyMember:' + member.binding);
          var deps = afterDependencyRefs(member).map(dependencyNode);
          runtime.trackList.forEach(function (trackInfo) {
            edge(startTrackNode(member, trackInfo.name), readyTrackNode(member, trackInfo.name));
            edge(readyTrackNode(member, trackInfo.name), 'readyMember:' + member.binding);
            deps.forEach(function (dep) { edge(dep, startTrackNode(member, trackInfo.name)); });
          });
          if (!attentionEnabled || !runtime.attention) return;
          if (!runtime.grouped) {
            if (member.defaultGateIndex != null) {
              edge('attnArrive:' + member.defaultGateIndex, startTrackNode(member, 'default'));
            }
            return;
          }
          runtime.groupNames.forEach(function (name) {
            if (member.gatedGroups && own(member.gatedGroups, name)) {
              edge('attnArrive:' + member.gatedGroups[name], startTrackNode(member, name));
            } else {
              edge('attnArrive:' + member.firstContentIndex, startTrackNode(member, name));
            }
          });
          if (runtime.layoutTrack) {
            edge('attnArrive:' + member.firstContentIndex, startTrackNode(member, 'layout'));
          }
        });
        if (attentionEnabled && attention) {
          var infos = attention.targetInfos();
          infos.forEach(function (info, index) {
            node('attnArrive:' + index);
            node('attnReady:' + index);
            edge('attnArrive:' + index, 'attnReady:' + index);
            if (index > 0) edge('attnReady:' + (index - 1), 'attnArrive:' + index);
            if (!info || info.kind !== 'content' || !info.member) return;
            var runtime = runtimes[info.member.binding];
            if (!runtime) return;
            if (info.groups == null) {
              edge(readyTrackNode(info.member, 'default'), 'attnReady:' + index);
              return;
            }
            info.groups.forEach(function (name) {
              edge(readyTrackNode(info.member, name), 'attnReady:' + index);
            });
            if (runtime.layoutTrack && info.member.firstContentIndex === index) {
              edge(readyTrackNode(info.member, 'layout'), 'attnReady:' + index);
            }
          });
        }
        var visitState = {};
        var stack = [];
        var cycleReported = 0;
        function visit(id) {
          if (visitState[id] === 2 || cycleReported > 2) return;
          if (visitState[id] === 1) {
            var cycleStart = stack.indexOf(id);
            var cycle = stack.slice(cycleStart >= 0 ? cycleStart : 0).concat([id]);
            cycleReported += 1;
            throw makeSceneError('scene 联合依赖形成循环（waits-for，attention 顺序 + after/reveal）：' +
              cycle.map(graphNodeLabel).join(' → '), {
              path: scenePath(),
              cycle: cycle.map(graphNodeLabel)
            });
          }
          visitState[id] = 1;
          stack.push(id);
          var next = edges[id] || [];
          for (var e = 0; e < next.length; e += 1) visit(next[e]);
          stack.pop();
          visitState[id] = 2;
        }
        Object.keys(edges).forEach(function (id) { visit(id); });
      }

      /* ---------------- 提交 ---------------- */

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
          var runtime = runtimes[member.binding];
          if (runtime) runtime.revealContainer = container;
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

      function planEffects(targetsByMember) {
        members.forEach(function (member) {
          var runtime = runtimes[member.binding];
          scope.planLayoutEffects(runtime, targetsByMember);
          scope.planAdapterEffects(runtime);
          runtime.planned = true;
        });
      }

      function scheduleMembers() {
        members.forEach(function (member) {
          var runtime = runtimes[member.binding];
          var deps;
          try {
            deps = afterDependencyRefs(member).map(dependencyPromise);
          } catch (error) {
            fail(error);
            return;
          }
          Promise.all(deps).then(function () {
            if (closed || cancelled) return;
            runtime.depsReady = true;
            flushRuntime(runtime);
            if (!attentionEnabled || !runtime.attention) {
              requestStart(runtime, function () { startAllTracks(runtime); });
            }
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

      function createRuntimes() {
        members.forEach(function (member) {
          runtimes[member.binding] = createMemberRuntime(member);
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
            /* 提交前捕获来源可见性（sourceElements）；减少动效不建立交接，直接落终态。 */
            if (motionName !== 'reduced') {
              collectSourceElements();
            }
            if (motionName !== 'reduced') {
              discoverGroups();
            }
            /* attention 先完成分组门控校验，再创建含 attention/分组信息的运行轨道。 */
            setupAttention();
            createRuntimes();
            if (motionName !== 'reduced') {
              verifyJointGraph();
            }
            if (presentation && typeof presentation.prepareScene === 'function') {
              /* 先建立 port 与隐藏旧标记，再捕获旧布局并提交。 */
              try {
                port = presentation.prepareScene({
                  sourceFrame: sourceFrame,
                  targetFrame: targetFrame,
                  attention: scene.attention,
                  attentionCoordinator: attentionCoordinator,
                  motion: motionName,
                  reason: reason,
                  cause: reason,
                  bindings: members.map(function (member) {
                    return { bindingId: member.binding, handle: member.handle, container: member.entry.container };
                  })
                }) || null;
              } catch (error) {
                throw makeSceneError('scene 标记准备失败：' + messageOf(error));
              }
            }
            geometryModule().captureSourceRects(members);
            /* 在任何目标/来源样式写入之前进入受控模式；commit 与第一条效果轨道之间不暴露未接管画面。 */
            if (typeof bindings.beginSceneControl !== 'function') {
              throw makeSceneError('scene 需要 bindings.beginSceneControl 以接管受控画面。');
            }
            bindings.beginSceneControl(members.map(function (member) { return member.binding; }));
            commitAll();
            /* commit 后目标状态可能把来源对象压成不可见；在同一个同步任务里用内联覆盖恢复来源视觉。 */
            holdSourceVisibility();
            var targetsByMember = captureTargetsByMember();
            verifyCommitted();
            if (port && typeof port.commitTargetGeometry === 'function') {
              var geometryInfo = port.commitTargetGeometry();
              if (geometryInfo && isArray(geometryInfo.markRoots)) scope.setMarkRoots(geometryInfo.markRoots);
            }
            if (motionName === 'reduced') {
              /* 减少动效：揭示与标记直接到位，不创建动画/进度；仍执行提交后核对与收尾。 */
              emitFact('reduced', null);
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
            /* 所有 update/layout 的效果在同一提交任务里按轨道预置为暂停起点；
             * after/attention 只决定各轨道 play 的时机，不会让目标值先闪现。 */
            planEffects(targetsByMember);
            var markHandles = scope.planMarkEffects();
            scheduleMembers();
            waitForAll(members.map(function (member) { return runtimes[member.binding].memberFinished; })).then(function () {
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
    run: run,
    supportsTimingFacts: true,
    timingFactsVersion: 1
  };
})(window);
