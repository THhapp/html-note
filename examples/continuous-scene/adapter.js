/*!
 * continuous-scene · 最小 Adapter（使用公共接入辅助）
 * 只提供领域视图、恢复、目标与每步局部变化计划；PreparedChange 的 commit / groups /
 * targets / effects / cleanup / reduced 由 NoteDemo.sceneAdapter 统一组织。
 */
(function (global) {
  'use strict';

  var Scene = global.ContinuousScene;
  var NoteDemo = global.NoteDemo;
  if (!Scene || !NoteDemo || !NoteDemo.sceneAdapter) {
    throw new Error('continuous-scene adapter 需要先加载组件库、scene-adapter.js 与 scene.js。');
  }

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

  global.ContinuousAdapter = NoteDemo.sceneAdapter.define({
    name: 'continuous-scene',
    sceneModes: ['update'],
    defaultSceneMode: 'update',
    sceneTimingDefaults: { enterDuration: 420 },

    normalizeView: function (input) {
      if (input != null && !isObject(input)) fail('view 必须是 {stage} 对象');
      return { model: { stage: stageOf(input, 'view') }, cues: {} };
    },

    /* 作者只保留领域方法；helper 负责挂成 BindingHandle 与 PreparedChange。 */
    mount: function (host) {
      var scene = Scene.mount(host);
      return {
        restore: function (model) {
          scene.restoreStage(stageOf(model, 'restore().model'));
        },
        readModel: function () { return scene.readModel(); },
        target: function (query) { return scene.targetAt(query); },
        planStep: function (input) {
          var from = stageOf(input.sourceModel, 'prepareChange().sourceModel');
          var to = stageOf(input.targetModel, 'prepareChange().targetModel');
          if (to !== from + 1) {
            fail('只支持相邻前进一步：来源 stage=' + from + '，目标 stage=' + to + '。');
          }
          var groups = groupsFor(to);
          return scene.prepareStep(to, input.reduced, groups);
        },
        destroy: function () { scene.destroy(); }
      };
    }
  });
})(window);
