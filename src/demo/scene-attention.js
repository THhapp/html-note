/* NoteDemo scene attention — 作者声明注意序列的 Binding 级门控协调。
 * Scope: window.NoteDemoInternals.sceneAttention
 * Depends on: 无（实际焦点展示由 presentation port 负责；本文件只协调内容启动、ready 与到达状态）。
 * 协调粒度是 Binding：同一次 attention 中，参与内容变化的 Binding 只允许一个目标；
 * cut 不能作为门控目标；不参与本 scene 的稳定参照可重复访问；未列入的成员不自动延后。
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

  function create(config) {
    var options = isObject(config) ? config : {};
    var targets = isArray(options.targets) ? options.targets.slice() : [];
    var enabled = options.enabled === true;
    var createError = typeof options.createError === 'function'
      ? options.createError
      : function (message) { return new Error(message); };
    var startRuntime = typeof options.startRuntime === 'function' ? options.startRuntime : function () {};
    var firstByBinding = {};
    var countByBinding = {};
    var arrived = [];
    var runtimes = [];
    for (var t = 0; t < targets.length; t += 1) {
      arrived.push(false);
      runtimes.push([]);
      var target = targets[t];
      var bindingId = target && typeof target.binding === 'string' ? target.binding : '';
      if (!bindingId) continue;
      countByBinding[bindingId] = (countByBinding[bindingId] || 0) + 1;
      if (!own(firstByBinding, bindingId)) firstByBinding[bindingId] = t;
    }

    /* 把 scene 参与者映射到 attention 目标：cut 与重复目标在运行前明确拒绝。 */
    function assign(members) {
      for (var m = 0; m < members.length; m += 1) {
        var member = members[m];
        if (member.mode === 'cut') {
          if (own(firstByBinding, member.binding)) {
            throw createError('Binding "' + member.binding +
              '" 是 cut，不能作为 attention 内容门控目标；cut 在同步提交时已显示目标，请改用 update/reveal 或从 attention 目标中移除。',
              { binding: member.binding });
          }
          continue;
        }
        if (!own(firstByBinding, member.binding)) continue;
        if (countByBinding[member.binding] > 1) {
          throw createError('Binding "' + member.binding +
            '" 被 attention 多次引用；当前门控粒度是 Binding 级内容启动，重复目标无法区分同一 Binding 内的不同对象。请只保留一个内容目标，或把重复访问改成不参与本 scene 的稳定参照。',
            { binding: member.binding });
        }
        member.attentionIndex = firstByBinding[member.binding];
      }
    }

    function gate(member) {
      return enabled && !!member && member.attentionIndex >= 0;
    }

    function attach(member, runtime) {
      if (!gate(member)) return;
      runtimes[member.attentionIndex].push(runtime);
    }

    /* 焦点真实到达某个目标后才启动对应内容；已就绪的成员立即启动，未就绪的等依赖。 */
    function start(index) {
      if (!enabled) return;
      if (!(index >= 0) || index >= arrived.length) return;
      arrived[index] = true;
      var list = runtimes[index] || [];
      for (var i = 0; i < list.length; i += 1) {
        var runtime = list[i];
        if (runtime && runtime.depsReady && !runtime.started) startRuntime(runtime);
      }
    }

    function ready(index) {
      if (!(index >= 0) || index >= runtimes.length) return Promise.resolve(true);
      var list = runtimes[index] || [];
      return Promise.all(list.map(function (runtime) { return runtime.ready; })).then(function () {
        return true;
      });
    }

    function isArrived(member) {
      return gate(member) && arrived[member.attentionIndex] === true;
    }

    return {
      enabled: enabled,
      assign: assign,
      gate: gate,
      attach: attach,
      start: start,
      ready: ready,
      isArrived: isArrived
    };
  }

  Internals.sceneAttention = {
    create: create
  };
})(window);
