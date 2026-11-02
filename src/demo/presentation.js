/* NoteDemo presentation — default B01 stage for NoteDemo.mount().
 * Scope: public NoteDemo.mount only. Internal parts are split into classic scripts loaded
 * before this file: presentation-chrome.js (controls, caption hint/reservation, error area,
 * stable observers) and presentation-marks.js (marks, scene attention, private presentation
 * port + settle/cancel). This file owns mount lifecycle, layout resolution, session/state
 * pipeline and destroy/failed-mount cleanup.
 * Depends on demo-runtime (NoteDemoInternals.createSession), NoteBlocks.DemoStage,
 * NoteUI.Button, and NoteExpr.Focus/Range/Link when a definition actually uses marks.
 * Load order: ... demo-runtime, presentation-chrome.js, presentation-marks.js, this file.
 * Plain JavaScript, classic script, offline file:// safe. No network, no eval.
 * Owned root: .note-demo (inside NoteBlocks.DemoStage's stage element).
 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var NoteDemo = global.NoteDemo = global.NoteDemo || {};
  var VERSION = '1.0.0';
  var MARK_COMPONENTS = { focus: 'Focus', range: 'Range', link: 'Link' };

  function text(value) {
    return value == null ? '' : String(value);
  }

  function isElement(value) {
    return !!value && value.nodeType === 1;
  }

  function make(tag, className) {
    var node = global.document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function logError(message, error) {
    if (global.console && typeof global.console.error === 'function') {
      global.console.error(message, error);
    }
  }

  function validateHost(host) {
    var Core = global.NoteCore || {};
    if (typeof Core.validateHost === 'function') return Core.validateHost(host);
    if (!isElement(host) && !(host && host.nodeType === 11)) {
      throw new TypeError('NoteDemo.mount 需要一个元素或 DocumentFragment 宿主容器。');
    }
    if (typeof host.appendChild !== 'function') {
      throw new TypeError('NoteDemo.mount 的宿主容器缺少 appendChild。');
    }
    return host;
  }

  function requireMountDependencies() {
    if (!Internals || typeof Internals.createSession !== 'function') {
      throw new Error('NoteDemo.mount 需要先加载 demo-runtime（缺少 NoteDemoInternals.createSession）。');
    }
    if (!Internals.presentationChrome || typeof Internals.presentationChrome.create !== 'function') {
      throw new Error('NoteDemo.mount 需要先加载 presentation-chrome.js（默认舞台控件、字幕与稳定测量）。');
    }
    if (!Internals.presentationMarks || typeof Internals.presentationMarks.create !== 'function') {
      throw new Error('NoteDemo.mount 需要先加载 presentation-marks.js（标记与 scene presentation port）。');
    }
    var Blocks = global.NoteBlocks;
    if (!Blocks || !Blocks.DemoStage || typeof Blocks.DemoStage.mount !== 'function') {
      throw new Error('NoteDemo.mount 需要先加载 NoteBlocks.DemoStage（B01 演示舞台）。');
    }
    var UI = global.NoteUI;
    if (!UI || !UI.Button || typeof UI.Button.mount !== 'function') {
      throw new Error('NoteDemo.mount 需要先加载 NoteUI.Button。');
    }
  }

  function collectMarkKinds(plan) {
    var kinds = {};
    function collect(marks) {
      if (!Array.isArray(marks)) return;
      for (var i = 0; i < marks.length; i += 1) {
        var mark = marks[i];
        if (mark && typeof mark === 'object' && mark.kind) kinds[String(mark.kind)] = true;
      }
    }
    if (plan && Array.isArray(plan.frames)) {
      for (var i = 0; i < plan.frames.length; i += 1) collect(plan.frames[i] && plan.frames[i].marks);
    }
    var transitions = plan && plan.transitions;
    if (transitions && typeof transitions === 'object') {
      Object.keys(transitions).forEach(function (key) {
        collect(transitions[key] && transitions[key].marks);
      });
    }
    return kinds;
  }

  function requireMarkComponents(plan) {
    var kinds = collectMarkKinds(plan);
    var Expr = global.NoteExpr || {};
    var missing = [];
    Object.keys(kinds).forEach(function (kind) {
      var name = MARK_COMPONENTS[kind];
      if (!name) return;
      if (!Expr[name] || typeof Expr[name].mount !== 'function') missing.push('NoteExpr.' + name);
    });
    if (missing.length) {
      throw new Error('NoteDemo.mount 需要先加载 ' + missing.join('、') + '（用于 Frame/Transition 标记）。');
    }
  }

  /* layout(container) -> { root, slots, cleanup? } | Element.
   * 自定义 layout 只按 binding.slot 的真实名称收集插槽；不再强制 main 别名。
   * 返回 Element 的旧单区用法继续映射为 main。 */
  function resolveLayout(container, layout) {
    if (layout == null) return { root: container, slots: { main: container }, cleanup: null };
    if (typeof layout !== 'function') {
      throw new TypeError('NoteDemo.mount 的 layout 必须是本地函数或省略。');
    }
    var output = layout(container);
    var root;
    var rawSlots = null;
    var cleanup = null;
    if (isElement(output)) {
      root = output;
      rawSlots = { main: output };
    } else if (output && typeof output === 'object' && !Array.isArray(output)) {
      root = output.root == null ? container : output.root;
      rawSlots = output.slots;
      if (output.cleanup !== undefined && output.cleanup !== null) {
        if (typeof output.cleanup !== 'function') {
          throw new TypeError('NoteDemo.mount 的 layout.cleanup 必须是函数或省略。');
        }
        cleanup = output.cleanup;
      }
    } else {
      throw new TypeError('NoteDemo.mount 的 layout 必须返回 Element 或 { root, slots }。');
    }
    try {
      if (!isElement(root)) {
        throw new TypeError('NoteDemo.mount 的 layout 返回的 root 必须是 Element。');
      }
      if (!rawSlots || typeof rawSlots !== 'object' || Array.isArray(rawSlots)) {
        throw new TypeError('NoteDemo.mount 的 layout 必须返回 { root, slots }，slots 是名称到 Element 的映射。');
      }
      if (root !== container && root.parentNode !== container) container.appendChild(root);
      var slots = {};
      Object.keys(rawSlots).forEach(function (name) {
        var value = rawSlots[name];
        if (!isElement(value)) {
          throw new TypeError('NoteDemo.mount 的 layout slots["' + name + '"] 必须是 Element。');
        }
        slots[name] = value;
      });
      return { root: root, slots: slots, cleanup: cleanup };
    } catch (error) {
      /* 已经拿到 cleanup 的布局解析失败：调用方拿不到返回值，这里立即释放。 */
      if (cleanup) {
        try { cleanup(); } catch (cleanupError) { logError('NoteDemo.mount：layout 解析失败后的清理异常。', cleanupError); }
      }
      throw error;
    }
  }

  function stateOrDefault() {
    return {
      phase: 'idle',
      settledFrameId: null,
      targetFrameId: null,
      replaying: false,
      error: null
    };
  }

  /* ---------------- presenter ---------------- */

  /* 会话状态到默认舞台的渲染管线。chrome 负责控件/字幕/错误/稳定测量，
   * marks 负责标记与 scene port；这里只做状态分发、错误上报和生命周期。 */
  function createPresenter(config) {
    var stage = config.stage;
    var container = config.container;
    var session = config.session;
    var plan = config.plan;
    var bag = config.bindings;

    var destroyed = false;
    var started = false;
    var currentState = null;
    var localError = null;
    var rendering = false;
    var dirty = false;
    var unsubscribe = null;
    var lastSettledFrameId = null;

    var chrome = Internals.presentationChrome.create({
      stage: stage,
      plan: plan,
      labels: config.labels,
      captionReserve: config.captionReserve,
      container: container,
      onCommand: navigate,
      onRevalidate: revalidate
    });
    var marks = Internals.presentationMarks.create({
      plan: plan,
      bag: bag,
      reportError: reportError,
      onUnexpected: surfaceUnexpected,
      finishCaptionHint: chrome.cancelCaptionHint,
      /* 最近一次公开导航原因：默认舞台 Focus 用它区分正常 next 承接与回看/重播 hide。 */
      getCause: function () {
        return typeof session.__getNavigationCause === 'function' ? session.__getNavigationCause() : null;
      }
    });

    function navigate(name) {
      if (destroyed) return;
      /* 默认舞台的“上一步”是步骤初态重播（replayPreviousStep）；session.prev() 的
       * “恢复上一停点”语义仍保留给自定义宿主。旧会话没有该方法时回退 prev。 */
      var methodName = name === 'prev' && typeof session.replayPreviousStep === 'function'
        ? 'replayPreviousStep' : name;
      var method = session[methodName] || session[name];
      if (typeof method !== 'function') return;
      var result;
      try {
        result = method.call(session);
      } catch (error) {
        surfaceUnexpected(error);
        return;
      }
      if (result && typeof result.catch === 'function') {
        result.catch(surfaceUnexpected);
      }
    }

    function readSessionState() {
      var state = null;
      try {
        state = session.getState();
      } catch (error) {
        state = null;
      }
      return state && typeof state === 'object' ? state : stateOrDefault();
    }

    function reportError(payload) {
      if (typeof session.__reportError === 'function') {
        try {
          session.__reportError(payload);
        } catch (error) {
          logError('NoteDemo presentation：错误上报失败。', error);
        }
        return;
      }
      /* 没有控制器错误通道时退回本地错误区，不让缺失标记静默。 */
      localError = payload;
      render();
    }

    function surfaceUnexpected(error) {
      if (!error || destroyed) return;
      logError('NoteDemo presentation：', error);
      if (typeof session.__reportError !== 'function') return;
      if (!currentState || currentState.phase !== 'idle') return;
      try {
        session.__reportError({ message: text(error.message) || '演示界面出现异常。' });
      } catch (reportError_) {
        /* 上报失败也保持舞台可用 */
      }
    }

    /* 稳定期的 resize / 组件重建：重测字幕与画布，并按真实目标重新落位标记。 */
    function revalidate() {
      if (destroyed) return;
      if (!currentState || currentState.phase === 'running') return;
      chrome.refreshStableLayout();
      marks.refreshStable();
    }

    function applyState(state) {
      if (lastSettledFrameId !== state.settledFrameId) {
        if (state.phase !== 'error') localError = null;
      }
      if (state.phase === 'running') localError = null;
      lastSettledFrameId = state.settledFrameId;
      chrome.applyCaption(state);
      chrome.applyError(state, localError);
      marks.applyState(state);
      if (state.phase !== 'running') chrome.refreshStableLayout();
      /* 控制状态最后应用：停稳时先落下本步结果与必要提示，再恢复“下一步”可用。 */
      chrome.applyControls(state);
    }

    function render() {
      if (destroyed || !currentState) return;
      if (rendering) {
        dirty = true;
        return;
      }
      rendering = true;
      try {
        var guard = 0;
        do {
          dirty = false;
          try {
            applyState(currentState);
          } catch (error) {
            surfaceUnexpected(error);
          }
          guard += 1;
        } while (dirty && !destroyed && guard < 4);
        dirty = false;
      } finally {
        rendering = false;
      }
    }

    function onState(state) {
      if (destroyed) return;
      currentState = state && typeof state === 'object' ? state : stateOrDefault();
      render();
    }

    function start() {
      if (destroyed || started) return;
      started = true;
      chrome.start();
      try {
        unsubscribe = session.subscribe(onState);
      } catch (error) {
        surfaceUnexpected(error);
        throw error;
      }
      if (typeof unsubscribe !== 'function') unsubscribe = null;
      /* subscribe 会同步回调一次当前状态并完成首帧渲染；仅在异常情况下补一次。 */
      if (!currentState) {
        currentState = readSessionState();
        render();
      }
      chrome.watch();
    }

    function prepareScene(info) {
      if (destroyed) return null;
      return marks.prepareScene(info);
    }

    function teardown() {
      if (destroyed) return;
      destroyed = true;
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch (error) {
          /* 订阅可能已由会话销毁清空 */
        }
        unsubscribe = null;
      }
      marks.teardown();
      chrome.teardown();
      if (container && container.parentNode) container.remove();
      currentState = null;
    }

    return {
      version: VERSION,
      start: start,
      prepareScene: prepareScene,
      teardown: teardown
    };
  }

  /* ---------------- mount / cleanup ---------------- */

  function cleanupFailedMount(session, presenter, stage, container, runLayoutCleanup) {
    if (presenter) {
      try {
        presenter.teardown();
      } catch (error) {
        logError('NoteDemo.mount：失败清理 presenter 时异常。', error);
      }
    }
    if (session && typeof session.destroy === 'function') {
      try {
        session.destroy();
      } catch (error) {
        logError('NoteDemo.mount：失败清理会话时异常。', error);
      }
    }
    if (container && container.parentNode) {
      try {
        container.remove();
      } catch (error) {
        /* stage destroy below also clears the stage element */
      }
    }
    if (typeof runLayoutCleanup === 'function') {
      try {
        runLayoutCleanup();
      } catch (error) {
        logError('NoteDemo.mount：失败清理 layout 时异常。', error);
      }
    }
    try {
      stage.destroy();
    } catch (error) {
      logError('NoteDemo.mount：失败清理舞台时异常。', error);
    }
  }

  function mount(host, options) {
    if (!global.document || typeof global.document.createElement !== 'function') {
      throw new Error('NoteDemo.mount 需要浏览器 document 环境。');
    }
    var input = options == null ? {} : options;
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new TypeError('NoteDemo.mount 的第二个参数必须是配置对象：{ definition, layout, adapters, initialFrameId, title, label, labels, captionLabel, captionReserve, maxWidth, minStageHeight }。');
    }
    validateHost(host);
    requireMountDependencies();

    var stage = global.NoteBlocks.DemoStage.mount(host, {
      title: input.title == null ? '' : input.title,
      label: input.label == null ? '' : input.label,
      captionLabel: input.captionLabel == null ? '字幕' : input.captionLabel,
      maxWidth: input.maxWidth == null ? null : input.maxWidth,
      minStageHeight: input.minStageHeight == null ? null : input.minStageHeight
    });

    var container = null;
    var session = null;
    var presenter = null;
    var layoutCleanup = null;
    /* layout.cleanup 恰好调用一次：取出后置空，成功销毁与失败清理共用同一入口。 */
    function runLayoutCleanup() {
      var cleanup = layoutCleanup;
      layoutCleanup = null;
      if (typeof cleanup !== 'function') return;
      try {
        cleanup();
      } catch (error) {
        logError('NoteDemo.mount：清理 layout 时异常。', error);
      }
    }
    /* scene 私有 port：会话创建时先交给核心，presenter 就绪后由它提供实现。 */
    var port = {
      prepareScene: function (info) {
        if (presenter && typeof presenter.prepareScene === 'function') return presenter.prepareScene(info);
        return null;
      }
    };
    try {
      container = make('div', 'note-demo');
      stage.stageEl.appendChild(container);
      var layout = resolveLayout(container, input.layout);
      layoutCleanup = layout.cleanup;
      var created = Internals.createSession({
        definition: input.definition,
        slots: layout.slots,
        adapters: input.adapters,
        initialFrameId: input.initialFrameId,
        presentation: port
      });
      session = created.session;
      if (!session || typeof session.getState !== 'function' || typeof session.subscribe !== 'function') {
        throw new Error('NoteDemo.mount 失败：createSession 没有返回有效会话。');
      }
      if (!created.plan || !created.plan.frameById) {
        throw new Error('NoteDemo.mount 失败：createSession 没有返回有效计划。');
      }
      requireMarkComponents(created.plan);
      var markKinds = collectMarkKinds(created.plan);
      if (container && (markKinds.range || markKinds.link)) {
        /* 关系标记可能画在目标上方：给演示画布留一条标记走廊，避免说明压住场景标题。 */
        container.classList.add('note-demo--has-marks');
      }
      presenter = createPresenter({
        stage: stage,
        container: container,
        session: session,
        bindings: created.bindings,
        plan: created.plan,
        labels: input.labels,
        captionReserve: input.captionReserve
      });
      presenter.start();
    } catch (error) {
      cleanupFailedMount(session, presenter, stage, container, runLayoutCleanup);
      throw error;
    }

    var originalDestroy = session.destroy;
    var disposed = false;
    session.el = stage.el;
    session.destroy = function () {
      if (disposed) return;
      disposed = true;
      try {
        presenter.teardown();
      } finally {
        try {
          if (typeof originalDestroy === 'function') originalDestroy.call(session);
        } finally {
          runLayoutCleanup();
          stage.destroy();
        }
      }
    };
    return session;
  }

  NoteDemo.mount = mount;
  NoteDemo.presentationVersion = VERSION;
})(window);
