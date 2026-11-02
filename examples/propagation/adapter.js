/*!
 * 传播过程示例 · 自定义 NoteDemo Adapter（examples/propagation/adapter.js）
 * Scope: window.PropagationAdapter（名称 propagation-graph）
 * 依赖：window.PropagationGraph（graph.js）与 NoteDemo demo-runtime 提供的公开契约。
 * 只使用公开 Adapter 契约：normalizeView / validateAction / mount -> BindingHandle
 * （restore/readView/target/prepareChange -> PreparedChange{groups,commit,targets,effects,cleanup}）。
 * 不访问 NoteDemoInternals，不自建播放器、时钟或清理框架。
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';
  var ADAPTER_NAME = 'propagation-graph';

  function fail(message) {
    throw new Error('PropagationAdapter：' + message);
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function graphModule() {
    var Graph = global.PropagationGraph;
    if (!Graph || typeof Graph.mount !== 'function') {
      throw new Error('PropagationAdapter 需要先加载 examples/propagation/graph.js。');
    }
    return Graph;
  }

  function normalizeStage(input, where) {
    var raw = isObject(input) && input.stage != null ? input.stage : 0;
    var stage = Number(raw);
    var Graph = graphModule();
    var maxStage = typeof Graph.maxStage === 'number' ? Graph.maxStage : 3;
    if (!isFinite(stage) || stage % 1 !== 0 || stage < 0 || stage > maxStage) {
      fail(where + '.stage 必须是 0–' + maxStage + ' 的整数，收到 ' + String(raw));
    }
    return stage;
  }

  function normalizeView(input) {
    if (input != null && !isObject(input)) fail('view 必须是 {stage} 对象');
    return { model: { stage: normalizeStage(input, 'view') }, cues: {} };
  }

  function validateAction(action) {
    fail('示例不使用 actions 动作；scene 过渡只提交目标并播放受控效果。');
  }

  function mount(host, options) {
    if (!host || host.nodeType !== 1) fail('mount(host)：host 必须是元素。');
    var Graph = graphModule();
    var graph = Graph.mount(host, isObject(options) ? options : {});
    var destroyed = false;

    function assertAlive() {
      if (destroyed) fail('实例已销毁。');
    }

    var handle = {
      restore: function (view) {
        if (destroyed) return;
        assertAlive();
        var model = isObject(view) && isObject(view.model) ? view.model : {};
        graph.restoreStage(normalizeStage(model, 'restore().model'));
      },
      readView: function () {
        if (destroyed) return null;
        return { model: graph.readModel(), cues: {} };
      },
      target: function (query) {
        if (destroyed) return null;
        return graph.targetAt(query);
      },
      /* scene update 参与者：在同步提交前准备一层新视觉（保持来源视觉），提交时只追加这一层。 */
      prepareChange: function (ctx) {
        assertAlive();
        var sourceStage = normalizeStage(ctx && ctx.sourceView && ctx.sourceView.model, 'prepareChange().sourceView.model');
        var targetStage = normalizeStage(ctx && ctx.targetView && ctx.targetView.model, 'prepareChange().targetView.model');
        if (targetStage !== sourceStage + 1) {
          fail('只支持点到点的前进一步：来源 stage=' + sourceStage + '，目标 stage=' + targetStage + '。');
        }
        var reduced = !!(ctx && ctx.motion === 'never');
        /* 公开作者工具：用 NoteDemo.effects.rectOf 读取上一步前沿的真实视口矩形，
         * 作为新层起点的几何依据；第一步没有上一前沿时回退到 graph 的静态常量。 */
        var sourceRect = null;
        var Effects = global.NoteDemo && global.NoteDemo.effects;
        if (Effects && typeof Effects.rectOf === 'function') {
          var sourceFront = graph.targetAt({ part: 'front' });
          if (sourceFront) {
            try { sourceRect = Effects.rectOf(sourceFront); } catch (error) { sourceRect = null; }
          }
        }
        var plan = graph.prepareLayer(targetStage, { reduced: reduced, sourceRect: sourceRect });
        var committed = false;
        return {
          groups: function () {
            return plan.groups.slice();
          },
          commit: function () {
            if (committed) return;
            committed = true;
            graph.attachLayer(plan, { reduced: reduced });
          },
          targets: function () {
            /* update 模式不参与布局 FLIP，不需要布局载体。 */
            return [];
          },
          effects: function (effectCtx) {
            if (destroyed) return [];
            var timing = effectCtx && effectCtx.timing ? effectCtx.timing : {};
            return plan.effects(timing);
          },
          cleanup: function () {
            /* 成功完成时层就是目标视觉，必须保留；只清掉未放行阶段的内联隐藏值，让 CSS 终态接住。
             * 取消/失败由 controller 恢复来源 Frame（adapter.restore -> graph.restoreStage）移除更晚的层；
             * 未提交的临时层在这里释放。 */
            if (!committed) plan.detach();
            else plan.releasePreState();
          }
        };
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        graph.destroy();
      }
    };

    return handle;
  }

  global.PropagationAdapter = {
    version: VERSION,
    name: ADAPTER_NAME,
    sceneModes: ['update'],
    defaultSceneMode: 'update',
    /* 示例内容节奏约 0.9s；attention scene 上公共 attentionContentTiming 仍会先合并，
     * 最终以 demo 中每个 scene 的 timing 为准（只为传播过程留辨认时间，不改全局默认）。 */
    sceneTimingDefaults: { enterDuration: 900 },
    normalizeView: normalizeView,
    validateAction: validateAction,
    mount: mount
  };
})(window);
