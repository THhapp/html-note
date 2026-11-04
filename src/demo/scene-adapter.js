/* NoteDemo scene adapter helper — 自定义图形接入 scene 的共享胶水。
 * Scope: window.NoteDemoInternals.sceneAdapter（由 src/demo/index.js 发布为 NoteDemo.sceneAdapter）
 * Depends on: 无（只组织现有 Adapter / PreparedChange 契约，不调用 scene 内部实现）。
 *
 * 作者提供：领域视图、绘图/恢复方法、目标解析、每步局部变化计划（planStep）。
 * 公共 helper 统一：normalizeView 包装、restore/readView 包装、PreparedChange 的
 * commit/groups/targets/effects/cleanup/sourceElements 组织、减少动效直接落终态、
 * effectCtx.timing 的最终值透传（0 合法，不夹入未声明最低时长）。
 *
 * 不新建播放器、不持有会话历史、不启动第二套动画；效果句柄、ready/finished、
 * 取消与清理仍归公共 scene 所有。经典脚本，无模块 / 无网络 / 无 eval。
 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var VERSION = '1.0.0';

  function fail(message) {
    throw new Error('NoteDemo.sceneAdapter: ' + message);
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function isArray(value) {
    return Array.isArray(value);
  }

  function own(object, key) {
    return object != null && Object.prototype.hasOwnProperty.call(Object(object), key);
  }

  function messageOf(error) {
    if (error == null) return '';
    if (typeof error === 'string') return error;
    if (error.message != null) return String(error.message);
    return String(error);
  }

  function viewModel(view) {
    return isObject(view) && own(view, 'model') ? view.model : null;
  }

  function copyStrings(value, where) {
    if (!isArray(value)) fail(where + ' 必须是 string[]。');
    var output = [];
    for (var i = 0; i < value.length; i += 1) {
      if (typeof value[i] !== 'string' || value[i].trim() === '') {
        fail(where + '[' + i + '] 必须是非空字符串。');
      }
      if (output.indexOf(value[i]) < 0) output.push(value[i]);
    }
    return output;
  }

  function validateTimingDefaults(input) {
    if (!isObject(input)) fail('spec.sceneTimingDefaults 必须是稀疏 timing 对象。');
    var output = {};
    Object.keys(input).forEach(function (key) {
      var value = input[key];
      if (key === 'easing') {
        if (typeof value !== 'string' || value.trim() === '') {
          fail('spec.sceneTimingDefaults.easing 必须是非空字符串。');
        }
        output[key] = value;
        return;
      }
      if (typeof value !== 'number' || !isFinite(value) || value < 0) {
        fail('spec.sceneTimingDefaults.' + key + ' 必须是大于等于 0 的有限数字（0 合法）。');
      }
      output[key] = value;
    });
    return output;
  }

  /* 可选作者便利：生成 progress EffectSpec。只做最小结构校验，duration/easing 由
   * 作者从 effectCtx.timing 的最终值传入；0 是合法时长，不做最低时长夹取。 */
  function progress(config) {
    if (!isObject(config)) fail('progress(config) 需要一个对象。');
    var spec = { type: 'progress' };
    if (typeof config.update !== 'function') fail('progress(config).update 必须是函数。');
    spec.update = config.update;
    if (config.onStart != null) {
      if (typeof config.onStart !== 'function') fail('progress(config).onStart 必须是函数。');
      spec.onStart = config.onStart;
    }
    if (typeof config.duration !== 'number' || !isFinite(config.duration) || config.duration < 0) {
      fail('progress(config).duration 必须是大于等于 0 的有限数字（0 合法）。');
    }
    spec.duration = config.duration;
    if (config.delay != null) {
      if (typeof config.delay !== 'number' || !isFinite(config.delay) || config.delay < 0) {
        fail('progress(config).delay 必须是大于等于 0 的有限数字。');
      }
      spec.delay = config.delay;
    }
    if (config.easing != null) {
      if (typeof config.easing !== 'string' || config.easing.trim() === '') {
        fail('progress(config).easing 必须是非空字符串。');
      }
      spec.easing = config.easing;
    }
    if (config.group != null) {
      if (typeof config.group !== 'string' || config.group.trim() === '') {
        fail('progress(config).group 必须是非空字符串。');
      }
      spec.group = config.group;
    }
    if (config.gate != null) {
      if (config.gate !== 'ready' && config.gate !== 'finish') {
        fail('progress(config).gate 只支持 "ready" 或 "finish"。');
      }
      spec.gate = config.gate;
    }
    if (config.effect != null) spec.effect = String(config.effect);
    return spec;
  }

  function preparedFromPlan(plan, reduced, name) {
    if (!isObject(plan)) fail(name + ' 的 planStep() 必须返回 PreparedChange 形状的对象。');
    if (typeof plan.commit !== 'function') fail(name + ' 的 planStep() 缺少同步 commit()。');
    var committed = false;
    var cleaned = false;

    function groups() {
      var value = typeof plan.groups === 'function' ? plan.groups() : plan.groups;
      if (value == null) return undefined;
      return copyStrings(value, name + ' plan.groups()');
    }

    function targets() {
      if (typeof plan.targets !== 'function') return [];
      var value = plan.targets();
      if (value == null) return [];
      if (!isArray(value)) fail(name + ' plan.targets() 必须返回数组。');
      return value;
    }

    function effects(ctx) {
      /* 减少动效：由 helper 统一跳过效果，Adapter 的 commit 已按 reduced 直接落目标终态。 */
      if (reduced) return [];
      if (typeof plan.effects !== 'function') return [];
      var timing = isObject(ctx) && isObject(ctx.timing) ? ctx.timing : null;
      if (!timing) fail(name + ' 的 scene effects 上下文缺少 timing（加载顺序或 scene 版本不匹配）。');
      var meta = {
        bindingId: isObject(ctx) && ctx.bindingId != null ? ctx.bindingId : null,
        motion: isObject(ctx) && ctx.motion != null ? ctx.motion : 'auto',
        attention: isObject(ctx) && ctx.attention === true,
        grouped: isObject(ctx) && ctx.grouped === true,
        groups: isObject(ctx) && isArray(ctx.groups) ? ctx.groups.slice() : []
      };
      var specs = plan.effects(timing, meta);
      if (specs == null) return [];
      if (!isArray(specs)) fail(name + ' 的 plan.effects(timing) 必须返回 EffectSpec[]。');
      return specs;
    }

    function sourceElements() {
      if (typeof plan.sourceElements !== 'function') return undefined;
      return plan.sourceElements();
    }

    return {
      /* 同步提交完整目标；helper 只做一次性守卫，不替 Adapter 改活 DOM。 */
      commit: function () {
        if (committed) return;
        committed = true;
        plan.commit();
      },
      targets: targets,
      groups: groups,
      effects: effects,
      sourceElements: sourceElements,
      cleanup: function () {
        if (cleaned) return;
        cleaned = true;
        if (typeof plan.cleanup === 'function') plan.cleanup();
      },
      facts: function () {
        if (typeof plan.facts === 'function') return plan.facts();
        return { entered: [], exited: [], valueChanged: [] };
      }
    };
  }

  function prepareChange(instance, name, ctx) {
    if (!isObject(ctx)) fail(name + ' 的 prepareChange(ctx) 收到无效上下文。');
    var reduced = ctx.motion === 'never';
    var input = {
      bindingId: ctx.bindingId == null ? null : ctx.bindingId,
      sourceFrameId: ctx.sourceFrameId == null ? null : ctx.sourceFrameId,
      targetFrameId: ctx.targetFrameId == null ? null : ctx.targetFrameId,
      sourceView: ctx.sourceView == null ? null : ctx.sourceView,
      targetView: ctx.targetView == null ? null : ctx.targetView,
      sourceModel: viewModel(ctx.sourceView),
      targetModel: viewModel(ctx.targetView),
      motion: ctx.motion == null ? 'auto' : ctx.motion,
      reduced: reduced,
      signal: ctx.signal == null ? null : ctx.signal
    };
    var plan;
    try {
      plan = instance.planStep(input);
    } catch (error) {
      fail(name + ' 的 planStep() 失败：' + messageOf(error));
    }
    if (plan && typeof plan.then === 'function') {
      return Promise.resolve(plan).then(function (value) {
        return preparedFromPlan(value, reduced, name);
      }, function (error) {
        fail(name + ' 的 planStep() 异步失败：' + messageOf(error));
      });
    }
    return preparedFromPlan(plan, reduced, name);
  }

  function mountFactory(spec, name) {
    return function mount(host, options) {
      var instance;
      try {
        instance = spec.mount(host, options);
      } catch (error) {
        fail('Adapter "' + name + '" mount() 失败：' + messageOf(error));
      }
      if (!isObject(instance)) fail('Adapter "' + name + '" mount() 必须返回实例对象。');
      if (typeof instance.restore !== 'function') {
        fail('Adapter "' + name + '" 的实例缺少 restore(model, view)。');
      }
      var handle = {
        restore: function (view) {
          return instance.restore(viewModel(view), view);
        }
      };
      if (typeof instance.readView === 'function') {
        handle.readView = function () {
          return instance.readView();
        };
      } else if (typeof instance.readModel === 'function') {
        handle.readView = function () {
          var model = instance.readModel();
          if (!isObject(model)) fail('Adapter "' + name + '" 的 readModel() 必须返回 model 对象。');
          var cues = typeof instance.cues === 'function' ? instance.cues(model) : {};
          if (cues == null) cues = {};
          if (!isObject(cues)) fail('Adapter "' + name + '" 的 cues(model) 必须返回对象。');
          return { model: model, cues: cues };
        };
      }
      if (typeof instance.target === 'function') {
        handle.target = function (query) {
          return instance.target(query);
        };
      }
      if (typeof instance.applyCues === 'function') {
        handle.applyCues = function (cues) {
          return instance.applyCues(cues);
        };
      }
      if (typeof instance.settleVisual === 'function') {
        handle.settleVisual = function () {
          return instance.settleVisual();
        };
      }
      if (typeof instance.planStep === 'function') {
        handle.prepareChange = function (ctx) {
          return prepareChange(instance, name, ctx);
        };
      }
      if (typeof instance.destroy === 'function') {
        handle.destroy = function () {
          return instance.destroy();
        };
      }
      return handle;
    };
  }

  /* 定义一个完整 Adapter。spec：
   *   name（必填）、sceneModes?、defaultSceneMode?、sceneTimingDefaults?、
   *   normalizeView(input, options)（必填）、validateAction?、mount(host, options)（必填）。
   * mount 返回的实例：
   *   restore(model, view)（必填）、readModel()/readView()（scene 参与者需要）、
   *   cues(model)?、target(query)?、applyCues?、settleVisual?、destroy?、
   *   planStep(input)（layout/update 参与者需要）→ PreparedChange 形状：
   *   { groups?, commit(), targets?, effects?(timing, meta), sourceElements?, cleanup?, facts? }。
   * planStep(input)：{bindingId, sourceFrameId, targetFrameId, sourceView, targetView,
   *   sourceModel, targetModel, motion, reduced, signal}；同步或返回 Promise 均可。
   */
  function define(spec) {
    if (!isObject(spec)) fail('define(spec) 需要一个对象。');
    var name = typeof spec.name === 'string' ? spec.name.trim() : '';
    if (!name) fail('spec.name 必须是非空字符串。');
    if (typeof spec.normalizeView !== 'function') fail('spec.normalizeView 必须是函数。');
    if (typeof spec.mount !== 'function') fail('spec.mount 必须是函数。');
    var sceneModes = null;
    if (spec.sceneModes != null) sceneModes = copyStrings(spec.sceneModes, 'spec.sceneModes');
    if (spec.defaultSceneMode != null) {
      if (typeof spec.defaultSceneMode !== 'string' || spec.defaultSceneMode.trim() === '') {
        fail('spec.defaultSceneMode 必须是非空字符串。');
      }
      if (sceneModes && sceneModes.indexOf(spec.defaultSceneMode) < 0) {
        fail('spec.defaultSceneMode "' + spec.defaultSceneMode + '" 必须出现在 spec.sceneModes 中。');
      }
    }
    var timingDefaults = spec.sceneTimingDefaults == null ? null : validateTimingDefaults(spec.sceneTimingDefaults);
    var adapter = {
      name: name,
      normalizeView: function (input, options) {
        var normalized = spec.normalizeView(input, options);
        if (!isObject(normalized)) fail('Adapter "' + name + '" 的 normalizeView() 必须返回对象。');
        if (own(normalized, 'model') || own(normalized, 'cues')) {
          if (!own(normalized, 'model') || !own(normalized, 'cues')) {
            fail('Adapter "' + name + '" 的 normalizeView() 返回含 model/cues 时必须两者都有。');
          }
          return { model: normalized.model, cues: normalized.cues };
        }
        return { model: normalized, cues: {} };
      },
      validateAction: function (action, options) {
        if (typeof spec.validateAction === 'function') return spec.validateAction(action, options);
        fail('Adapter "' + name + '" 只用于 scene，不支持 actions。');
      },
      mount: mountFactory(spec, name)
    };
    if (sceneModes) adapter.sceneModes = sceneModes;
    if (spec.defaultSceneMode != null) adapter.defaultSceneMode = spec.defaultSceneMode;
    if (timingDefaults) adapter.sceneTimingDefaults = timingDefaults;
    return adapter;
  }

  var api = {
    version: VERSION,
    define: define,
    progress: progress
  };

  Internals.sceneAdapter = api;
  if (global.NoteDemo) global.NoteDemo.sceneAdapter = api;
  if (global.NoteDemoAuthor) global.NoteDemoAuthor.sceneAdapter = api;
})(window);
