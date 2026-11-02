/* NoteDemo — public demo orchestration layer, core entry.
 * Scope: window.NoteDemo.create + NoteDemoInternals.createSession.
 * Depends on: NoteCore (loading order: core first). Adapters and frame content are
 * checked only when a definition is prepared, so missing optional components do not
 * break this file at load time.
 * Plain JavaScript, classic script, offline file:// safe. No network, no eval.
 */
(function (global) {
  'use strict';

  var NoteDemo = global.NoteDemo = global.NoteDemo || {};
  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var VERSION = '1.0.0';

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function requireCoreModules() {
    var missing = [];
    if (!Internals.definition || typeof Internals.definition.prepare !== 'function') missing.push('definition');
    if (!Internals.bindings || typeof Internals.bindings.create !== 'function') missing.push('bindings');
    if (!Internals.runner || typeof Internals.runner.run !== 'function') missing.push('runner');
    if (!Internals.scene || typeof Internals.scene.run !== 'function') missing.push('scene');
    if (!Internals.controller || typeof Internals.controller.create !== 'function') missing.push('controller');
    if (missing.length) {
      throw new Error('NoteDemo 核心未完整加载：缺少 ' + missing.join('、') + ' 模块。请按 demo-runtime 的源码顺序加载。');
    }
  }

  function mergeAdapters(custom) {
    var merged = {};
    var builtin = isObject(Internals.adapters) ? Internals.adapters : {};
    Object.keys(builtin).forEach(function (name) {
      if (builtin[name] && typeof builtin[name] === 'object') merged[name] = builtin[name];
    });
    if (custom != null) {
      if (!isObject(custom)) throw new TypeError('NoteDemo.create 的 adapters 必须是名称到 Adapter 对象的映射。');
      Object.keys(custom).forEach(function (name) {
        var adapter = custom[name];
        if (!adapter || typeof adapter !== 'object') {
          throw new TypeError('NoteDemo.create 的 adapters["' + name + '"] 不是 Adapter 对象。');
        }
        merged[name] = adapter;
      });
    }
    return merged;
  }

  function destroyQuietly(bag) {
    if (!bag) return;
    try {
      bag.destroy();
    } catch (error) {
      if (global.console && typeof global.console.error === 'function') {
        global.console.error('NoteDemo: 创建失败后的清理出现异常。', error);
      }
    }
  }

  function createSession(config) {
    requireCoreModules();
    if (!isObject(config)) {
      throw new TypeError('NoteDemo.create 需要一个配置对象：{ definition, slots, adapters, initialFrameId }。');
    }
    if (!isObject(config.definition)) {
      throw new TypeError('NoteDemo.create 需要 definition 对象。');
    }
    var adapters = mergeAdapters(config.adapters);
    var plan = Internals.definition.prepare(config.definition, {
      adapters: adapters,
      initialFrameId: config.initialFrameId == null ? null : config.initialFrameId
    });
    if (plan.requiresPresentation && !isObject(config.presentation)) {
      throw new Error('NoteDemo 定义错误：scene 目标 Frame 含有标记或 scene.attention，需要 presentation port（NoteDemo.mount 会自动提供；自备宿主请在 create 时传入 presentation）。');
    }
    var bag = null;
    try {
      bag = Internals.bindings.create({
        plan: plan,
        slots: config.slots == null ? {} : config.slots,
        adapters: adapters
      });
      var initialFrame = plan.frameById[plan.initialFrameId];
      if (!initialFrame) {
        throw new Error('NoteDemo 定义错误：找不到初始 Frame "' + plan.initialFrameId + '"。');
      }
      bag.restoreFrame(initialFrame);
      var session = Internals.controller.create({
        plan: plan,
        bindings: bag,
        initialFrameId: plan.initialFrameId,
        presentation: config.presentation || null
      });
      return { session: session, plan: plan, bindings: bag };
    } catch (error) {
      destroyQuietly(bag);
      throw error;
    }
  }

  NoteDemo.create = function (config) {
    return createSession(config).session;
  };
  if (global.NoteDemoAuthor) {
    NoteDemo.collectSlots = global.NoteDemoAuthor.collectSlots;
    NoteDemo.compile = global.NoteDemoAuthor.compile;
    NoteDemo.author = global.NoteDemoAuthor;
    if (global.NoteDemoAuthor.effects) NoteDemo.effects = global.NoteDemoAuthor.effects;
  }
  NoteDemo.version = VERSION;

  Internals.createSession = createSession;
  Internals.version = VERSION;
})(window);