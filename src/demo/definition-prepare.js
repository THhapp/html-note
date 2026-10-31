/* NoteDemo definition prepare — 组装并冻结可执行 plan（bindings / frames / transitions / initialFrameId）。
 * Scope: window.NoteDemoInternals.definitionPrepare
 * Depends on: NoteDemoInternals.definitionCompile（校验/编译与公共 timing 默认表）。
 * 经典脚本，无模块 / 无网络 / 无 eval；只做纯数据组装，不接触 DOM。 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var compileModule = Internals.definitionCompile;
  if (!compileModule ||
      typeof compileModule.compileScene !== 'function' ||
      typeof compileModule.createIssues !== 'function' ||
      !compileModule.support) {
    throw new Error('NoteDemo 核心加载顺序错误：definition 准备需要先加载 NoteDemoInternals.definitionCompile（src/demo/definition-compile.js）。');
  }

  var support = compileModule.support;
  var own = support.own;
  var isObject = support.isObject;
  var isArray = support.isArray;
  var isNonEmptyString = support.isNonEmptyString;
  var repr = support.repr;
  var messageOf = support.messageOf;
  var pathKey = support.pathKey;
  var pathIndex = support.pathIndex;
  var deepFreeze = support.deepFreeze;
  var compare = Internals.definitionCompare;
  if (!compare || typeof compare.compareModel !== 'function' || typeof compare.compareCues !== 'function') {
    throw new Error('NoteDemo 核心加载顺序错误：definition 准备需要先加载 NoteDemoInternals.definitionCompare（src/demo/definition-compare.js）。');
  }
  var Issues = compileModule.createIssues;
  var PLAN_VERSION = 1;

  function prepare(definition, options) {
    var opts = isObject(options) ? options : {};
    var issues = new Issues();
    var plan = {
      planVersion: PLAN_VERSION,
      initialFrameId: '',
      bindingOrder: [],
      bindings: {},
      frames: [],
      frameById: {},
      frameOrder: [],
      transitions: {},
      hasSceneTransitions: false,
      requiresPresentation: false
    };

    if (!isObject(definition)) {
      issues.push('definition', '必须是对象');
      throw issues.thrown();
    }

    var adapters = compileModule.resolveAdapters(opts.adapters);

    /* ---- bindings ---- */
    var bindingsInput = definition.bindings;
    var bindingIds = [];
    if (!isObject(bindingsInput)) {
      issues.push('bindings', '必须是非空对象');
    } else {
      bindingIds = Object.keys(bindingsInput);
      if (bindingIds.length === 0) issues.push('bindings', '不能为空（至少一个受控 binding）');
    }
    for (var b = 0; b < bindingIds.length; b += 1) {
      var bindingId = bindingIds[b];
      var bindingConfig = bindingsInput[bindingId];
      var bindingPath = pathKey('bindings', bindingId);
      plan.bindingOrder.push(bindingId);
      if (!isNonEmptyString(bindingId)) {
        issues.push('bindings', 'binding id 必须是非空字符串');
      }
      if (!isObject(bindingConfig)) {
        issues.push(bindingPath, '必须是对象');
        continue;
      }
      var adapterName = bindingConfig.adapter;
      var adapter = null;
      if (!isNonEmptyString(adapterName)) {
        issues.push(pathKey(bindingPath, 'adapter'), '必须是非空字符串（Adapter 名称）');
      } else if (!own(adapters, adapterName)) {
        issues.push(pathKey(bindingPath, 'adapter'),
          '未找到 Adapter ' + repr(adapterName) + '（可用：' + (Object.keys(adapters).join('、') || '无') + '）');
      } else {
        adapter = adapters[adapterName];
      }
      var slot = bindingConfig.slot;
      if (!isNonEmptyString(slot)) issues.push(pathKey(bindingPath, 'slot'), '必须是非空字符串（宿主 slot 名称）');
      var optionsValue = bindingConfig.options;
      if (optionsValue === undefined || optionsValue === null) optionsValue = {};
      else if (!isObject(optionsValue)) {
        issues.push(pathKey(bindingPath, 'options'), '必须是对象');
        optionsValue = {};
      }
      var instance = bindingConfig.instance;
      var hasInstance = instance !== undefined && instance !== null;
      var ownership = bindingConfig.ownership;
      if (ownership !== undefined && ownership !== 'owned' && ownership !== 'borrowed') {
        issues.push(pathKey(bindingPath, 'ownership'), "必须是 'owned' 或 'borrowed'");
        ownership = undefined;
      }
      if (hasInstance) {
        if (ownership === 'owned') {
          issues.push(pathKey(bindingPath, 'ownership'), '提供 instance 时 ownership 只能是 borrowed');
        }
        ownership = 'borrowed';
        if (adapter && typeof adapter.adopt !== 'function') {
          issues.push(pathKey(bindingPath, 'adapter'), '借用外部实例需要 Adapter 提供 adopt');
        }
      } else {
        if (ownership === 'borrowed') issues.push(pathKey(bindingPath, 'instance'), 'borrowed 必须提供 instance');
        if (ownership === undefined) ownership = 'owned';
        if (adapter && typeof adapter.mount !== 'function') {
          issues.push(pathKey(bindingPath, 'adapter'), 'Adapter 缺少 mount');
        }
      }
      if (adapter && typeof adapter.normalizeView !== 'function') {
        issues.push(pathKey(bindingPath, 'adapter'), 'Adapter 缺少 normalizeView');
      }
      var timingDefaults = {};
      if (adapter && adapter.sceneTimingDefaults !== undefined && adapter.sceneTimingDefaults !== null) {
        timingDefaults = compileModule.compileTimingMap(adapter.sceneTimingDefaults,
          pathKey(pathKey(bindingPath, 'adapter'), 'sceneTimingDefaults'), issues);
      }
      plan.bindings[bindingId] = Object.freeze({
        id: bindingId,
        adapterName: isNonEmptyString(adapterName) ? adapterName : '',
        adapter: adapter,
        slot: isNonEmptyString(slot) ? slot : '',
        options: optionsValue,
        instance: hasInstance ? instance : null,
        ownership: ownership,
        timingDefaults: deepFreeze(timingDefaults)
      });
    }

    /* ---- frames ---- */
    var framesInput = definition.frames;
    var frameIndexById = {};
    if (!isArray(framesInput)) {
      issues.push('frames', '必须是非空数组');
      framesInput = [];
    } else if (framesInput.length === 0) {
      issues.push('frames', '不能为空（至少一个 Frame）');
    }
    for (var f = 0; f < framesInput.length; f += 1) {
      var frame = framesInput[f];
      var framePath = pathIndex('frames', f);
      if (!isObject(frame)) {
        issues.push(framePath, '必须是对象');
        continue;
      }
      var frameId = frame.id;
      var usableId = false;
      if (!isNonEmptyString(frameId)) {
        issues.push(pathKey(framePath, 'id'), 'Frame id 必须是非空字符串');
      } else if (own(frameIndexById, frameId)) {
        issues.push(pathKey(framePath, 'id'), 'Frame id 重复：' + repr(frameId));
      } else {
        usableId = true;
      }
      var caption = frame.caption;
      if (caption === undefined || caption === null) caption = '';
      else if (typeof caption !== 'string') {
        issues.push(pathKey(framePath, 'caption'), '必须是字符串');
        caption = '';
      }
      var viewsInput = frame.views;
      var views = {};
      if (!isObject(viewsInput)) {
        issues.push(pathKey(framePath, 'views'), '必须是对象（覆盖全部 binding）');
      } else {
        var viewKeys = Object.keys(viewsInput);
        for (var vk = 0; vk < viewKeys.length; vk += 1) {
          if (!own(plan.bindings, viewKeys[vk])) {
            issues.push(pathKey(framePath, 'views') + '.' + viewKeys[vk],
              '是未知 binding（Frame 只能引用已定义的 binding）');
          }
        }
        for (var bo = 0; bo < plan.bindingOrder.length; bo += 1) {
          var viewBindingId = plan.bindingOrder[bo];
          var bindingEntry = plan.bindings[viewBindingId];
          var viewPath = pathKey(framePath, 'views') + '.' + viewBindingId;
          if (!own(viewsInput, viewBindingId)) {
            issues.push(viewPath, '缺少该 binding 的视图（Frame 必须显式覆盖全部 binding，不隐式继承）');
            continue;
          }
          if (!bindingEntry || !bindingEntry.adapter ||
              typeof bindingEntry.adapter.normalizeView !== 'function') {
            continue;
          }
          var view;
          try {
            view = bindingEntry.adapter.normalizeView(viewsInput[viewBindingId], bindingEntry.options);
          } catch (error) {
            issues.push(viewPath, 'normalizeView 失败：' + messageOf(error));
            continue;
          }
          if (!isObject(view) || !own(view, 'model')) {
            issues.push(viewPath, 'normalizeView 必须返回 {model,cues} 对象');
            continue;
          }
          var cues = own(view, 'cues') ? view.cues : {};
          views[viewBindingId] = deepFreeze({ model: view.model, cues: cues });
        }
      }
      var marks = [];
      if (frame.marks !== undefined && frame.marks !== null) {
        if (!isArray(frame.marks)) issues.push(pathKey(framePath, 'marks'), '必须是数组');
        else marks = compileModule.compileMarks(frame.marks, pathKey(framePath, 'marks'), plan.bindings, issues);
      }
      if (usableId) {
        var compiledFrame = deepFreeze({
          id: frameId,
          index: plan.frames.length,
          caption: caption,
          views: views,
          marks: marks
        });
        plan.frames.push(compiledFrame);
        plan.frameOrder.push(frameId);
        plan.frameById[frameId] = compiledFrame;
        frameIndexById[frameId] = compiledFrame.index;
      }
    }

    /* ---- initialFrameId ---- */
    var initial = null;
    var optionsInitial = opts.initialFrameId;
    var definitionInitial = definition.initialFrameId;
    if (optionsInitial !== undefined && optionsInitial !== null && optionsInitial !== '') {
      if (!isNonEmptyString(optionsInitial)) {
        issues.push('initialFrameId', 'options.initialFrameId 必须是非空字符串');
      } else if (!own(frameIndexById, optionsInitial)) {
        issues.push('initialFrameId', 'options.initialFrameId 引用了不存在的 Frame ' + repr(optionsInitial));
      } else {
        initial = optionsInitial;
      }
    } else if (definitionInitial !== undefined && definitionInitial !== null && definitionInitial !== '') {
      if (!isNonEmptyString(definitionInitial)) {
        issues.push('definition.initialFrameId', '必须是非空字符串');
      } else if (!own(frameIndexById, definitionInitial)) {
        issues.push('definition.initialFrameId', '引用了不存在的 Frame ' + repr(definitionInitial));
      } else {
        initial = definitionInitial;
      }
    } else if (plan.frameOrder.length) {
      initial = plan.frameOrder[0];
    }

    /* ---- transitions ---- */
    var transitionsInput = definition.transitions;
    var seenFrom = {};
    if (transitionsInput !== undefined && transitionsInput !== null) {
      if (!isArray(transitionsInput)) {
        issues.push('transitions', '必须是数组');
      } else {
        for (var t = 0; t < transitionsInput.length; t += 1) {
          var transition = transitionsInput[t];
          var transitionPath = pathIndex('transitions', t);
          if (!isObject(transition)) {
            issues.push(transitionPath, '必须是对象');
            continue;
          }
          var from = transition.from;
          var to = transition.to;
          var fromValid = false;
          var toValid = false;
          if (!isNonEmptyString(from)) {
            issues.push(pathKey(transitionPath, 'from'), '必须是非空字符串');
          } else if (!own(frameIndexById, from)) {
            issues.push(pathKey(transitionPath, 'from'), '引用了不存在的 Frame ' + repr(from));
          } else if (own(seenFrom, from)) {
            issues.push(pathKey(transitionPath, 'from'), '同一 from 不得重复定义过渡：' + repr(from));
          } else {
            fromValid = true;
          }
          if (!isNonEmptyString(to)) {
            issues.push(pathKey(transitionPath, 'to'), '必须是非空字符串');
          } else if (!own(frameIndexById, to)) {
            issues.push(pathKey(transitionPath, 'to'), '引用了不存在的 Frame ' + repr(to));
          } else {
            toValid = true;
          }
          if (fromValid && toValid && frameIndexById[to] !== frameIndexById[from] + 1) {
            issues.push(pathKey(transitionPath, 'to'), '必须指向 from 的下一个 Frame（只支持相邻前进过渡）');
          }
          if (fromValid) seenFrom[from] = true;
          var actions = [];
          if (transition.actions !== undefined && transition.actions !== null) {
            if (!isArray(transition.actions)) issues.push(pathKey(transitionPath, 'actions'), '必须是数组');
            else actions = compileModule.compileActions(transition.actions, pathKey(transitionPath, 'actions'), plan.bindings, issues);
          }
          var scene = null;
          if (transition.scene !== undefined && transition.scene !== null) {
            scene = compileModule.compileScene(transition.scene, pathKey(transitionPath, 'scene'), plan.bindings, issues);
            if (actions.length) {
              issues.push(transitionPath, 'scene 与 actions/parallel 互斥：同一过渡只能选一种路径');
            }
            if (transition.marks !== undefined && transition.marks !== null && isArray(transition.marks) && transition.marks.length) {
              issues.push(pathKey(transitionPath, 'marks'), 'scene 路径的关系提示请写在目标 Frame 的 marks 中（稳定停点仍可见）');
            }
            if (scene && fromValid && toValid) {
              var fromFrame = plan.frameById[from];
              var toFrame = plan.frameById[to];
              var sceneMemberIds = {};
              for (var sbi = 0; sbi < scene.bindings.length; sbi += 1) {
                var sceneMember = scene.bindings[sbi];
                sceneMemberIds[sceneMember.binding] = true;
                var fromHas = fromFrame && fromFrame.views && own(fromFrame.views, sceneMember.binding);
                var toHas = toFrame && toFrame.views && own(toFrame.views, sceneMember.binding);
                if (!toHas) {
                  issues.push(pathKey(transitionPath, 'scene'), '目标 Frame 缺少参与 binding ' + repr(sceneMember.binding) + ' 的视图');
                } else if (sceneMember.mode === 'layout' && !fromHas) {
                  issues.push(pathKey(transitionPath, 'scene'), 'layout 参与 binding ' + repr(sceneMember.binding) + ' 在来源 Frame 缺少视图');
                }
              }
              /* 来源/目标不同的 Binding 必须在 scene 中显式声明，否则会被 static 提前恢复，破坏“先收齐旧布局再统一提交”。 */
              if (fromFrame && fromFrame.views && toFrame && toFrame.views) {
                for (var cbi = 0; cbi < plan.bindingOrder.length; cbi += 1) {
                  var changedBinding = plan.bindingOrder[cbi];
                  if (own(sceneMemberIds, changedBinding)) continue;
                  var fromView = own(fromFrame.views, changedBinding) ? fromFrame.views[changedBinding] : null;
                  var toView = own(toFrame.views, changedBinding) ? toFrame.views[changedBinding] : null;
                  if (!fromView || !toView) continue;
                  var modelChanged = compare.compareModel(fromView.model, toView.model);
                  var cuesChanged = compare.compareCues(fromView.cues, toView.cues);
                  if (modelChanged || cuesChanged) {
                    issues.push(pathKey(transitionPath, 'scene'),
                      'Binding ' + repr(changedBinding) + ' 在来源/目标的视图不同，必须显式列入 scene（layout/cut/reveal）；未变化的 Binding 才可以省略');
                  }
                }
              }
            }
          }
          var transitionMarks = [];
          if (transition.marks !== undefined && transition.marks !== null) {
            if (!isArray(transition.marks)) issues.push(pathKey(transitionPath, 'marks'), '必须是数组');
            else transitionMarks = compileModule.compileMarks(transition.marks, pathKey(transitionPath, 'marks'), plan.bindings, issues);
          }
          if (fromValid && toValid && !own(plan.transitions, from)) {
            plan.transitions[from] = deepFreeze({
              from: from,
              to: to,
              actions: actions,
              marks: transitionMarks,
              scene: scene
            });
            if (scene) {
              plan.hasSceneTransitions = true;
              var targetFrameForScene = plan.frameById[to];
              if (targetFrameForScene && isArray(targetFrameForScene.marks) && targetFrameForScene.marks.length > 0) {
                plan.requiresPresentation = true;
              }
              if (scene.attention) plan.requiresPresentation = true;
            }
          }
        }
      }
    }

    if (issues.has()) throw issues.thrown();

    plan.initialFrameId = initial || plan.frameOrder[0] || '';
    plan.bindingOrder = Object.freeze(plan.bindingOrder);
    plan.frames = Object.freeze(plan.frames);
    plan.frameOrder = Object.freeze(plan.frameOrder);
    plan.frameById = Object.freeze(plan.frameById);
    plan.bindings = Object.freeze(plan.bindings);
    plan.transitions = Object.freeze(plan.transitions);
    return Object.freeze(plan);
  }

  Internals.definitionPrepare = {
    prepare: prepare
  };
})(window);
