/*!
 * continuous-scene · 最小 Adapter
 * 只使用公开契约：normalizeView / validateAction / mount -> BindingHandle；
 * PreparedChange 声明 groups()，由两个 attention 目标分别放行 left / right。
 */
(function (global) {
  'use strict';

  var Scene = global.ContinuousScene;
  var NAME = 'continuous-scene';
  var MAX_STAGE = Scene.STAGES.length - 1;

  function fail(message) { throw new Error('ContinuousAdapter：' + message); }
  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function stageOf(input, where) {
    var raw = isObject(input) && input.stage != null ? input.stage : 0;
    var stage = Number(raw);
    if (!isFinite(stage) || stage % 1 !== 0 || stage < 0 || stage > MAX_STAGE) {
      fail(where + '.stage 必须是 0–' + MAX_STAGE + ' 的整数，收到 ' + String(raw));
    }
    return stage;
  }
  function groupsFor(stage) {
    if (stage === 1) return ['left', 'right'];
    if (stage === 2) return ['right'];
    return [];
  }

  function normalizeView(input) {
    if (input != null && !isObject(input)) fail('view 必须是 {stage} 对象');
    return { model: { stage: stageOf(input, 'view') }, cues: {} };
  }

  function validateAction() {
    fail('本示例不使用 actions；每一步都是 scene update。');
  }

  function mount(host) {
    if (!host || host.nodeType !== 1) fail('mount(host)：host 必须是元素。');
    var scene = Scene.mount(host);
    var destroyed = false;

    function assertAlive() { if (destroyed) fail('实例已销毁。'); }

    return {
      restore: function (view) {
        if (destroyed) return;
        var model = isObject(view) && isObject(view.model) ? view.model : {};
        scene.restoreStage(stageOf(model, 'restore().model'));
      },
      readView: function () {
        if (destroyed) return null;
        return { model: scene.readModel(), cues: {} };
      },
      target: function (query) {
        if (destroyed) return null;
        return scene.targetAt(query);
      },
      prepareChange: function (ctx) {
        assertAlive();
        var from = stageOf(ctx && ctx.sourceView && ctx.sourceView.model, 'prepareChange().sourceView.model');
        var to = stageOf(ctx && ctx.targetView && ctx.targetView.model, 'prepareChange().targetView.model');
        if (to !== from + 1) fail('只支持相邻前进一步：来源 stage=' + from + '，目标 stage=' + to + '。');
        var groups = groupsFor(to);
        var reduced = !!(ctx && ctx.motion === 'never');
        var plan = scene.prepareStep(to, reduced, groups);
        return {
          groups: function () { return plan.groups(); },
          commit: function () { plan.commit(); },
          targets: function () { return []; },
          effects: function (effectCtx) {
            var timing = effectCtx && effectCtx.timing ? effectCtx.timing : {};
            return plan.effects(timing);
          },
          cleanup: function () { plan.cleanup(); }
        };
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        scene.destroy();
      }
    };
  }

  global.ContinuousAdapter = {
    name: NAME,
    sceneModes: ['update'],
    defaultSceneMode: 'update',
    sceneTimingDefaults: { enterDuration: 420 },
    normalizeView: normalizeView,
    validateAction: validateAction,
    mount: mount
  };
})(window);
