/* NoteDemo scene attention — 作者声明注意序列的组级门控协调与等待语义。
 * Scope: window.NoteDemoInternals.sceneAttention
 * Depends on: 无（实际焦点展示由 presentation port 负责；本文件只协调内容放行、ready 与停留）。
 * 协调单位是“观察目标 / 效果组”：
 *  - groups 省略 = 整 Binding 默认门控（仅未声明效果组的 Adapter）；
 *  - groups: [] = 只观察，不启动内容；
 *  - groups 非空 = 到达后放行这些效果组。
 * ready(index) 的语义是“该目标内容可承接 + 该目标的观察停留都已满足”，
 * 因此 presentation 只需 show → 到达 → start(index) → await ready(index) → 下一目标，
 * 不再叠加自己的 hold 计时（避免双重计时）。最后落点不倒计时。
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

  function create(config) {
    var options = isObject(config) ? config : {};
    var targets = isArray(options.targets) ? options.targets.slice() : [];
    var enabled = options.enabled === true;
    var stepDuration = typeof options.stepDuration === 'number' && isFinite(options.stepDuration)
      ? options.stepDuration
      : 560;
    var createError = typeof options.createError === 'function'
      ? options.createError
      : function (message) { return new Error(message); };
    var resolveMember = typeof options.resolveMember === 'function' ? options.resolveMember : function () { return null; };
    var startDefault = typeof options.startDefault === 'function' ? options.startDefault : function () {};
    var startGroups = typeof options.startGroups === 'function' ? options.startGroups : function () {};
    var readyDefault = typeof options.readyDefault === 'function' ? options.readyDefault : function () { return Promise.resolve(true); };
    var readyGroups = typeof options.readyGroups === 'function' ? options.readyGroups : function () { return Promise.resolve(true); };

    var validated = false;
    var infos = [];
    var firstContent = {};
    var started = [];
    var startedWaiters = [];
    var startedPromises = [];
    var timers = [];
    var cancelled = false;

    for (var t = 0; t < targets.length; t += 1) {
      started.push(false);
      startedWaiters.push([]);
      startedPromises.push(new Promise(function (resolve) { startedWaiters[t].push(resolve); }));
    }

    function failAt(path, message, details) {
      var extra = details && typeof details === 'object' ? details : {};
      extra.path = path;
      return createError(message, extra);
    }

    function memberOf(binding) {
      var member = resolveMember(binding);
      return isObject(member) ? member : null;
    }

    /* 编译后 target 已带 groups（省略=undefined / 观察=[] / 放行=非空）；此时结合成员分组能力做联合校验。 */
    function validate() {
      if (validated) return infos;
      validated = true;
      var defaultGate = {};
      var groupGate = {};
      for (var i = 0; i < targets.length; i += 1) {
        var target = targets[i];
        var path = (target && target.path) || ('attention.targets[' + i + ']');
        if (!isObject(target) || !isNonEmptyString(target.binding)) {
          throw failAt(path, 'attention 目标缺少有效 binding。');
        }
        var groupsProvided = isArray(target.groups);
        var observeOnly = groupsProvided && target.groups.length === 0;
        var member = memberOf(target.binding);
        var holdDuration = typeof target.holdDuration === 'number' && isFinite(target.holdDuration) && target.holdDuration >= 0
          ? target.holdDuration : null;
        var info = {
          index: i,
          binding: target.binding,
          target: target,
          member: member,
          kind: 'observe',
          groups: null,
          holdDuration: holdDuration
        };
        if (!enabled) {
          info.kind = 'observe';
          infos.push(info);
          continue;
        }
        if (!member) {
          if (groupsProvided && target.groups.length > 0) {
            throw failAt(path, '稳定参照（不参与本 scene 的 binding "' + target.binding + '"）不能声明 groups 非空；只观察请写 groups: []');
          }
          /* 稳定参照：只观察，默认从到达起停留 stepDuration。 */
          infos.push(info);
          continue;
        }
        var mode = member.mode;
        if (mode === 'cut') {
          if (!observeOnly) {
            throw failAt(path, 'Binding "' + target.binding +
              '" 是 cut：cut 在同步提交时已经显示目标，不能作为 attention 内容门控目标；观察请用 groups: []，需要延后展开请改用 update/layout/reveal');
          }
          infos.push(info);
          continue;
        }
        if (mode === 'reveal') {
          if (groupsProvided && target.groups.length > 0) {
            throw failAt(path, 'Binding "' + target.binding + '" 是 reveal，没有分组内容效果；groups 只能省略（整 Binding 门控）或 []（只观察）');
          }
          if (observeOnly) {
            infos.push(info);
            continue;
          }
          if (own(defaultGate, target.binding)) {
            throw failAt(path, 'Binding "' + target.binding + '" 的整 Binding 默认门控重复：目标 ' +
              defaultGate[target.binding] + ' 与 ' + i + ' 都在门控同一内容；重复目标请改成 groups: [] 观察');
          }
          defaultGate[target.binding] = i;
          info.kind = 'content';
          info.groups = null;
          infos.push(info);
          continue;
        }
        /* layout / update：可能声明效果组。 */
        if (member.grouped) {
          if (!groupsProvided) {
            throw failAt(path, 'Binding "' + target.binding +
              '" 的 Adapter 声明了效果组，attention 目标必须显式声明 groups（[] 表示只观察，非空数组表示到达后放行这些组）');
          }
          if (observeOnly) {
            infos.push(info);
            continue;
          }
          if (!own(groupGate, target.binding)) groupGate[target.binding] = {};
          for (var g = 0; g < target.groups.length; g += 1) {
            var groupName = target.groups[g];
            if (member.groups.indexOf(groupName) < 0) {
              throw failAt(path, 'Binding "' + target.binding + '" 的未知效果组 "' + groupName +
                '"（该 Binding 声明：' + member.groups.join('、') + '）');
            }
            if (own(groupGate[target.binding], groupName)) {
              throw failAt(path, 'Binding "' + target.binding + '" 的组 "' + groupName + '" 重复门控：目标 ' +
                groupGate[target.binding][groupName] + ' 与 ' + i + ' 都在门控同一组');
            }
            groupGate[target.binding][groupName] = i;
          }
          info.kind = 'content';
          info.groups = target.groups.slice();
          infos.push(info);
          continue;
        }
        if (groupsProvided && target.groups.length > 0) {
          throw failAt(path, 'Binding "' + target.binding +
            '" 的 Adapter 未声明效果组，不能声明 groups 非空；整 Binding 门控请省略 groups，只观察请写 groups: []');
        }
        if (observeOnly) {
          infos.push(info);
          continue;
        }
        if (own(defaultGate, target.binding)) {
          throw failAt(path, 'Binding "' + target.binding + '" 的整 Binding 默认门控重复：目标 ' +
            defaultGate[target.binding] + ' 与 ' + i + ' 都在门控同一内容；重复目标请改成 groups: [] 观察');
        }
        defaultGate[target.binding] = i;
        info.kind = 'content';
        info.groups = null;
        infos.push(info);
      }
      /* 第一个内容放行目标：分组成员的 layout 轨道随它一起启动。 */
      for (var f = 0; f < infos.length; f += 1) {
        if (infos[f].kind !== 'content' || !infos[f].member) continue;
        if (firstContent[infos[f].binding] === undefined) firstContent[infos[f].binding] = f;
      }
      return infos;
    }

    function waitStarted(index) {
      if (!(index >= 0) || index >= startedPromises.length) return Promise.resolve();
      if (started[index]) return Promise.resolve();
      return startedPromises[index];
    }

    function addTimer(fn, ms) {
      var handle = { done: false, cancelled: false, timer: 0, onCancel: null };
      handle.timer = global.setTimeout(function () {
        if (handle.cancelled) return;
        handle.done = true;
        fn();
      }, ms);
      timers.push(handle);
      return handle;
    }

    /* 焦点真实到达后由 presentation 调用：放行该目标的内容组（观察目标不放行任何内容）。 */
    function start(index) {
      if (!(index >= 0) || index >= targets.length) return;
      if (!started[index]) {
        started[index] = true;
        var waiters = startedWaiters[index] || [];
        startedWaiters[index] = [];
        waiters.forEach(function (resolve) { resolve(); });
      }
      if (!enabled || cancelled) return;
      var info = infos[index];
      if (!info || info.kind !== 'content' || !info.member) return;
      if (info.groups == null) startDefault(info.member, info);
      else startGroups(info.member, info.groups, info);
    }

    /* 返回“内容可承接 + 停留已满足”的 Promise；最后落点不倒计时。 */
    function ready(index) {
      var info = infos[index];
      if (!enabled || cancelled) return Promise.resolve(true);
      if (!info) return Promise.resolve(true);
      var isLast = index === targets.length - 1;
      var hold;
      if (isLast) hold = 0;
      else if (info.kind === 'observe') hold = info.holdDuration == null ? stepDuration : info.holdDuration;
      else hold = info.holdDuration == null ? 0 : info.holdDuration;
      var contentReady;
      if (info.kind !== 'content' || !info.member) {
        contentReady = Promise.resolve(true);
      } else if (info.groups == null) {
        contentReady = Promise.resolve(readyDefault(info.member, info));
      } else {
        contentReady = Promise.resolve(readyGroups(info.member, info.groups, info));
      }
      return waitStarted(index).then(function () {
        if (cancelled) return true;
        return contentReady.then(function () {
          if (cancelled || hold <= 0) return true;
          return new Promise(function (resolve) {
            var handle = addTimer(function () { resolve(true); }, hold);
            handle.onCancel = function () { resolve(true); };
          });
        });
      }).then(function (value) {
        return value !== false;
      });
    }

    function cancel() {
      if (cancelled) return;
      cancelled = true;
      for (var i = 0; i < timers.length; i += 1) {
        var handle = timers[i];
        if (!handle || handle.done) continue;
        handle.cancelled = true;
        try { global.clearTimeout(handle.timer); } catch (error) { /* ignore */ }
        if (typeof handle.onCancel === 'function') {
          try { handle.onCancel(); } catch (error) { /* ignore */ }
        }
      }
      timers = [];
      for (var s = 0; s < startedWaiters.length; s += 1) {
        var waiters = startedWaiters[s] || [];
        startedWaiters[s] = [];
        waiters.forEach(function (resolve) { resolve(); });
      }
    }

    function firstContentIndex(binding) {
      return own(firstContent, binding) ? firstContent[binding] : -1;
    }

    function targetInfos() {
      return infos;
    }

    return {
      enabled: enabled,
      validate: validate,
      start: start,
      ready: ready,
      cancel: cancel,
      firstContentIndex: firstContentIndex,
      targetInfos: targetInfos,
      stepDuration: stepDuration
    };
  }

  Internals.sceneAttention = {
    create: create
  };
})(window);
