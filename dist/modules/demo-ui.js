/*! note-library module: demo-ui
 * dependencies: core, legacy, ui-layout, ui-content, ui-navigation, viz-objects, viz-chart, blocks, demo-runtime
 * type: JavaScript
 * generated-by: scripts/build.mjs; do-not-edit.
 */

/* ---- source: src/demo/presentation-chrome.js ---- */
/* NoteDemo presentation chrome — default B01 stage chrome for NoteDemo.mount().
 * Scope: NoteDemoInternals.presentationChrome.create (internal shared file; loaded before
 * presentation-marks.js and presentation.js). Owns the default stage controls, the caption
 * reading hint and stable caption/canvas reservation, the error area and stable observers.
 * Depends on: B01 NoteBlocks.DemoStage instance passed in, NoteUI.Button; core loaded first.
 * Plain JavaScript, classic script, offline file:// safe. No network, no eval.
 * Owned roots: .note-demo__controls / .note-demo__error (inside the B01 stage element).
 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var VERSION = '1.0.0';
  var DEFAULT_LABELS = {
    prev: '上一步',
    next: '下一步',
    replay: '重看',
    reset: '重来'
  };

  function text(value) {
    return value == null ? '' : String(value);
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

  function readQuery(value) {
    if (value == null) return 'null';
    try {
      var json = JSON.stringify(value);
      if (json == null) return String(value);
      return json.length > 160 ? json.slice(0, 157) + '...' : json;
    } catch (error) {
      return text(value);
    }
  }

  function prefersReducedMotion() {
    try {
      return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (error) {
      return false;
    }
  }

  function frameById(plan, id) {
    if (id == null || !plan || !plan.frameById) return null;
    return plan.frameById[id] || null;
  }

  function normalizeLabels(input) {
    var labels = {
      prev: DEFAULT_LABELS.prev,
      next: DEFAULT_LABELS.next,
      replay: DEFAULT_LABELS.replay,
      reset: DEFAULT_LABELS.reset,
      progress: null
    };
    if (!input || typeof input !== 'object') return labels;
    ['prev', 'next', 'replay', 'reset'].forEach(function (key) {
      var value = text(input[key]).trim();
      if (value) labels[key] = value;
    });
    if (typeof input.progress === 'function' || typeof input.progress === 'string') {
      labels.progress = input.progress;
    }
    return labels;
  }

  function formatProgress(labels, current, total, frameId) {
    if (typeof labels.progress === 'function') {
      try {
        var custom = labels.progress(current, total, frameId);
        if (custom != null && text(custom).trim()) return text(custom);
      } catch (error) {
        /* 自定义进度文本失败时退回默认文本，不中断演示。 */
      }
    } else if (typeof labels.progress === 'string' && labels.progress) {
      return labels.progress
        .replace(/{current}/g, String(current))
        .replace(/{total}/g, String(total))
        .replace(/{frameId}/g, text(frameId));
    }
    return '第 ' + current + ' / ' + total + ' 步';
  }

  /* 默认舞台界面：控件、字幕提示/预留、错误区与稳定观察器。
   * config = { stage, plan, labels, captionReserve, container,
   *            onCommand(name), onRevalidate() }。 */
  function create(config) {
    var stage = config.stage;
    var plan = config.plan;
    var container = config.container || null;
    var labels = normalizeLabels(config.labels);
    var captionReserveEnabled = config.captionReserve !== false;
    var onCommand = typeof config.onCommand === 'function' ? config.onCommand : null;
    var onRevalidate = typeof config.onRevalidate === 'function' ? config.onRevalidate : null;

    var started = false;
    var destroyed = false;
    var disabled = { prev: true, next: true, replay: true, reset: true };
    var holder = null;
    var buttons = {};
    var progressEl = null;
    var errorBox = null;
    var errorMessageEl = null;
    var errorMetaEl = null;
    var lastProgress = '';
    var lastErrorKey = '';
    var lastCaption = null;
    var captionInitialized = false;
    var captionAnim = null;
    var stageReservePx = 0;
    var stageLayout = null;
    var hostStageFloorRaw = null;
    var hostStageFloorPx = 0;
    var lastAppliedStageMinHeight = null;
    var stableRefreshTimer = 0;
    var watched = false;
    var resizeListener = null;
    var resizeObserver = null;
    var mutationObserver = null;

    /* ---------------- controls ---------------- */

    function setDisabled(name, value) {
      value = Boolean(value);
      if (disabled[name] === value) return;
      disabled[name] = value;
      var button = buttons[name];
      if (button && typeof button.update === 'function') {
        try {
          button.update({ disabled: value });
        } catch (error) {
          /* 控件更新失败不应打断演示。 */
        }
      }
    }

    function buildControls() {
      var UI = global.NoteUI || {};
      holder = make('div', 'note-demo__controls');
      holder.setAttribute('role', 'group');
      holder.setAttribute('aria-label', '演示控制');
      var playback = make('div', 'note-demo__control-group note-demo__control-group--playback');
      var utility = make('div', 'note-demo__control-group note-demo__control-group--utility');
      buttons.prev = UI.Button.mount(playback, {
        label: labels.prev,
        variant: 'secondary',
        disabled: true,
        onClick: function () { if (onCommand) onCommand('prev'); }
      });
      buttons.next = UI.Button.mount(playback, {
        label: labels.next,
        variant: 'primary',
        disabled: true,
        // 执行中需要立刻呈灰色不可用，同时不把键盘焦点从按钮上移走。
        focusableDisabled: true,
        onClick: function () { if (onCommand) onCommand('next'); }
      });
      buttons.replay = UI.Button.mount(utility, {
        label: labels.replay,
        variant: 'quiet',
        disabled: true,
        onClick: function () { if (onCommand) onCommand('replay'); }
      });
      buttons.reset = UI.Button.mount(utility, {
        label: labels.reset,
        variant: 'quiet',
        disabled: true,
        onClick: function () { if (onCommand) onCommand('reset'); }
      });
      progressEl = make('span', 'note-demo__progress');
      progressEl.setAttribute('data-demo-progress', '');
      holder.append(playback, utility, progressEl);
      stage.setControls([holder]);
    }

    function applyControls(state) {
      if (!holder) return;
      var total = plan && Array.isArray(plan.frames) ? plan.frames.length : 0;
      var baseFrame = frameById(plan, state.settledFrameId);
      var running = state.phase === 'running';
      var displayFrame = running ? (frameById(plan, state.targetFrameId) || baseFrame) : baseFrame;
      var baseIndex = baseFrame ? baseFrame.index : 0;
      var displayIndex = displayFrame ? displayFrame.index : baseIndex;
      var currentStep = displayFrame ? displayIndex + 1 : 0;
      var progressText = formatProgress(labels, currentStep, total, displayFrame ? displayFrame.id : state.settledFrameId);
      if (progressText !== lastProgress) {
        lastProgress = progressText;
        progressEl.textContent = progressText;
      }
      holder.setAttribute('data-demo-running', running ? 'true' : 'false');
      holder.setAttribute('aria-busy', running ? 'true' : 'false');
      if (running) {
        /* 本步被接受后，下一步立即不可用并阻止重复推进；整个执行与收尾期间保持。
         * 上一步/重看/重来仍可用于取消本次运行（含从首停点启动的第一次过渡）：
         * 默认舞台“上一步”映射 replayPreviousStep，先取消旧运行再重播上一段步骤。
         * 不能一刀切禁用全部控制。 */
        setDisabled('next', true);
        setDisabled('prev', false);
        setDisabled('replay', false);
        setDisabled('reset', false);
        return;
      }
      /* 停稳态可用条件：首帧禁用上一步/重看；末帧禁用下一步。
       * 末帧禁用只说明没有下一步停点，不等于 running；运行态可由
       * data-demo-running="true" / aria-busy 区分（本函数上面的分支）。 */
      setDisabled('prev', baseIndex <= 0);
      setDisabled('replay', baseIndex <= 0);
      setDisabled('next', total > 0 && baseIndex >= total - 1);
      setDisabled('reset', total <= 0);
    }

    /* ---------------- caption ---------------- */

    function captionFor(state) {
      var frame = null;
      if (state.phase === 'running' && state.targetFrameId) frame = frameById(plan, state.targetFrameId);
      if (!frame) frame = frameById(plan, state.settledFrameId);
      return frame ? text(frame.caption) : '';
    }

    function setCaptionText(caption) {
      try {
        stage.setCaption(caption);
      } catch (error) {
        logError('NoteDemo presentation：字幕更新失败。', error);
      }
    }

    function cancelCaptionHint() {
      var handle = captionAnim;
      captionAnim = null;
      if (!handle || typeof handle.cancel !== 'function') return;
      try { handle.cancel(); } catch (error) { /* 动画已经结束 */ }
    }

    /* 字幕换句提示：整句作为一个阅读单位进入，不逐字、不重复朗读。
     * 只是轻提示，不延长完成边界；运行收尾时由 presentation port 关闭。 */
    function animateCaption(caption) {
      var el = stage && stage.captionEl;
      if (!el || typeof el.animate !== 'function' || prefersReducedMotion()) {
        setCaptionText(caption);
        return;
      }
      setCaptionText(caption);
      cancelCaptionHint();
      try {
        var handle = el.animate([
          { opacity: '0.18', transform: 'translateY(5px)' },
          { opacity: '1', transform: 'none' }
        ], {
          duration: 200,
          easing: 'cubic-bezier(.3,0,.15,1)'
        });
        captionAnim = handle;
        handle.finished.then(function () {
          if (captionAnim === handle) captionAnim = null;
        }, function () {
          if (captionAnim === handle) captionAnim = null;
        });
      } catch (error) {
        captionAnim = null;
      }
    }

    function applyCaption(state) {
      if (!stage || !stage.captionEl) return;
      var caption = captionFor(state);
      var changed = caption !== lastCaption;
      /* 首次挂载、取消/回退/错误和减少动效：直接写正确文本，不制造开场或尾随动画。 */
      if (!captionInitialized || state.phase !== 'running') {
        cancelCaptionHint();
        if (changed) {
          lastCaption = caption;
          setCaptionText(caption);
        }
        captionInitialized = true;
        return;
      }
      if (!changed) return;
      lastCaption = caption;
      animateCaption(caption);
    }

    /* ---------------- stable caption / canvas reservation ---------------- */

    /* 字幕阅读区稳定：按当前宽度测量全部 Frame 的字幕，预留最高者。
     * 预留值不能低于 CSS 设计的阅读下限（.nblk-demo-stage__caption 的 min-height）；
     * 测量时强制“字幕身份标签可见”的最窄布局，避免首帧空字幕（标签隐藏）测出偏小的宽度。
     * 不改变 DOM 顺序，也不使用屏幕 fixed 定位。 */
    function measureCaptionReserve() {
      if (!captionReserveEnabled || destroyed) return;
      var el = stage && stage.captionEl;
      if (!el || !plan || !Array.isArray(plan.frames) || !plan.frames.length) return;
      var label = stage.captionLabelEl || null;
      var narration = stage.narrationEl || null;
      var hasLabel = !!(label && text(label.textContent).trim());
      var labelHidden = label ? Boolean(label.hidden) : false;
      var narrationLabel = narration ? narration.getAttribute('data-caption-label') : null;
      var previousText = el.textContent;
      var previousMinHeight = el.style.minHeight;
      var reserve = 0;
      try {
        if (hasLabel) {
          if (label.hidden) label.hidden = false;
          if (narration && narrationLabel !== 'true') narration.setAttribute('data-caption-label', 'true');
        }
        el.style.minHeight = '';
        el.textContent = '';
        var floor = 0;
        try { floor = el.getBoundingClientRect().height; } catch (error) { floor = 0; }
        /* 宿主容器暂时不在文档流时 rect 为 0，用计算后的 min-height / line-height 兜底，
         * 保证首次测量也不低于 CSS 阅读下限。 */
        try {
          var computed = global.getComputedStyle(el);
          var cssFloor = parseFloat(computed.minHeight);
          if (isFinite(cssFloor) && cssFloor > floor) floor = cssFloor;
          if (!(floor > 0)) floor = parseFloat(computed.lineHeight) || 0;
        } catch (error) {
          /* 无 computed style 时保底为一行的预留。 */
        }
        reserve = floor;
        el.style.minHeight = '0px';
        for (var i = 0; i < plan.frames.length; i += 1) {
          el.textContent = text(plan.frames[i].caption);
          var height = 0;
          try { height = el.getBoundingClientRect().height; } catch (error) { height = 0; }
          if (height > reserve) reserve = height;
        }
      } finally {
        el.textContent = previousText;
        el.style.minHeight = previousMinHeight;
        if (label) label.hidden = labelHidden;
        if (narration) {
          if (narrationLabel === null) narration.removeAttribute('data-caption-label');
          else narration.setAttribute('data-caption-label', narrationLabel);
        }
      }
      var px = reserve > 0 ? Math.ceil(reserve) : 0;
      var value = px > 0 ? px + 'px' : '';
      if ((el.style.minHeight || '') !== value) el.style.minHeight = value;
    }

    /* 舞台画布稳定：同一布局内取各停点的商高；布局宽度变化后重新测量并释放旧预留。
     * 测量时暂时清空内部 min-height，避免上次预留本身成为“内容高度”；
     * 宿主显式 min-height / minStageHeight 作为下限保留，不参与内容测量。 */
    function usableStageFloor(value) {
      var raw = text(value).trim();
      if (!raw || raw === 'auto' || raw === 'none' || raw === 'initial' || raw === 'inherit' || raw === 'unset') return '';
      return raw;
    }

    function readComputedStageFloor() {
      try {
        var computed = global.getComputedStyle(stage.stageEl);
        var value = computed && computed.minHeight;
        if (!value || value === 'auto' || value === 'none') return 0;
        var px = parseFloat(value);
        return isFinite(px) && px > 0 ? px : 0;
      } catch (error) {
        return 0;
      }
    }

    function captureStageFloor() {
      if (!stage || !stage.stageEl || hostStageFloorRaw !== null) return;
      var current = stage.stageEl.style.minHeight || '';
      hostStageFloorRaw = usableStageFloor(current);
      lastAppliedStageMinHeight = current;
      hostStageFloorPx = readComputedStageFloor();
    }

    function stageLayoutSnapshot() {
      var stageWidth = 0;
      var containerWidth = 0;
      try { stageWidth = stage.stageEl.getBoundingClientRect().width; } catch (error) { stageWidth = 0; }
      try { containerWidth = container ? container.getBoundingClientRect().width : 0; } catch (error) { containerWidth = 0; }
      return { stage: stageWidth, container: containerWidth };
    }

    function layoutChanged(previous, next) {
      if (!previous || !next) return true;
      return Math.abs(previous.stage - next.stage) > 0.5 || Math.abs(previous.container - next.container) > 0.5;
    }

    function measureStageContentHeight() {
      var previous = stage.stageEl.style.minHeight || '';
      var height = 0;
      var width = 0;
      try {
        stage.stageEl.style.minHeight = '0px';
        var rect = stage.stageEl.getBoundingClientRect();
        width = rect.width;
        height = Math.max(rect.height, stage.stageEl.scrollHeight || 0);
      } catch (error) {
        height = 0;
      } finally {
        try { stage.stageEl.style.minHeight = previous; } catch (error) { /* 保持可用 */ }
      }
      return width > 0 ? Math.ceil(height) : 0;
    }

    function composeStageMinHeight() {
      var values = [];
      if (hostStageFloorRaw) values.push(hostStageFloorRaw);
      if (hostStageFloorPx > 0) {
        var floor = hostStageFloorPx + 'px';
        if (values.indexOf(floor) < 0) values.push(floor);
      }
      if (stageReservePx > 0) values.push(stageReservePx + 'px');
      if (!values.length) return '';
      return values.length === 1 ? values[0] : 'max(' + values.join(', ') + ')';
    }

    function reserveStageHeight() {
      if (destroyed || !stage || !stage.stageEl) return;
      captureStageFloor();
      var current = stage.stageEl.style.minHeight || '';
      /* 宿主在挂载后直接改内联 min-height：把它当作新的下限，而不是覆盖掉。 */
      if (lastAppliedStageMinHeight !== null && current !== lastAppliedStageMinHeight && current !== '0px') {
        hostStageFloorRaw = usableStageFloor(current);
        hostStageFloorPx = 0;
        lastAppliedStageMinHeight = current;
      }
      var nextLayout = stageLayoutSnapshot();
      if (layoutChanged(stageLayout, nextLayout)) {
        stageReservePx = 0;
        stageLayout = nextLayout;
      }
      var needed = measureStageContentHeight();
      if (needed > stageReservePx) stageReservePx = needed;
      var value = composeStageMinHeight();
      try {
        if ((stage.stageEl.style.minHeight || '') !== value) stage.stageEl.style.minHeight = value;
        /* 浏览器可能把 max()/calc() 规范化；记录实际序列化值，避免下次误判为宿主改动。 */
        lastAppliedStageMinHeight = stage.stageEl.style.minHeight || '';
      } catch (error) {
        /* 画布预留失败时保持演示可用。 */
      }
    }

    function refreshStableLayout() {
      if (destroyed) return;
      measureCaptionReserve();
      reserveStageHeight();
    }

    /* ---------------- error area ---------------- */

    function buildError() {
      errorBox = make('div', 'note-demo__error');
      errorBox.setAttribute('role', 'alert');
      errorBox.hidden = true;
      var title = make('p', 'note-demo__error-title');
      title.textContent = '演示无法完成';
      errorMessageEl = make('p', 'note-demo__error-message');
      errorMetaEl = make('p', 'note-demo__error-meta');
      errorBox.appendChild(title);
      errorBox.appendChild(errorMessageEl);
      errorBox.appendChild(errorMetaEl);
      stage.stageEl.appendChild(errorBox);
    }

    function applyError(state, localError) {
      if (!errorBox) return;
      var error = state.phase === 'error' ? state.error : null;
      if (!error) error = localError || null;
      if (!error) {
        if (!errorBox.hidden) errorBox.hidden = true;
        lastErrorKey = '';
        return;
      }
      var meta = [];
      if (state.settledFrameId) meta.push('Frame：' + state.settledFrameId);
      if (error.binding) meta.push('Binding：' + text(error.binding));
      if (error.action) meta.push('Action：' + text(error.action));
      if (error.query != null) meta.push('Query：' + readQuery(error.query));
      var key = text(error.message) + '|' + meta.join('|');
      if (key !== lastErrorKey) {
        lastErrorKey = key;
        errorMessageEl.textContent = text(error.message) || '演示暂时无法继续。';
        errorMetaEl.textContent = meta.join(' · ');
        errorMetaEl.hidden = meta.length === 0;
      }
      errorBox.hidden = false;
    }

    /* ---------------- stable observers ---------------- */

    function scheduleRevalidate() {
      if (destroyed) return;
      if (stableRefreshTimer) clearTimeoutSafe(stableRefreshTimer);
      stableRefreshTimer = global.setTimeout(function () {
        stableRefreshTimer = 0;
        if (destroyed || typeof onRevalidate !== 'function') return;
        onRevalidate();
      }, 150);
    }

    function clearTimeoutSafe(timer) {
      try { global.clearTimeout(timer); } catch (error) { /* 计时器已经结束 */ }
    }

    function watch() {
      if (destroyed || watched) return;
      watched = true;
      if (typeof global.addEventListener === 'function') {
        resizeListener = function () { scheduleRevalidate(); };
        try { global.addEventListener('resize', resizeListener); } catch (error) { resizeListener = null; }
      }
      if (container && typeof global.ResizeObserver === 'function') {
        try {
          resizeObserver = new global.ResizeObserver(function () { scheduleRevalidate(); });
          resizeObserver.observe(container);
        } catch (error) {
          resizeObserver = null;
        }
      }
      if (container && typeof global.MutationObserver === 'function') {
        try {
          mutationObserver = new global.MutationObserver(function () { scheduleRevalidate(); });
          mutationObserver.observe(container, { childList: true, subtree: true });
        } catch (error) {
          mutationObserver = null;
        }
      }
    }

    /* ---------------- lifecycle ---------------- */

    function start() {
      if (started || destroyed) return;
      started = true;
      buildControls();
      buildError();
    }

    function teardown() {
      if (destroyed) return;
      destroyed = true;
      if (stableRefreshTimer) {
        clearTimeoutSafe(stableRefreshTimer);
        stableRefreshTimer = 0;
      }
      if (resizeListener) {
        try { global.removeEventListener('resize', resizeListener); } catch (error) { /* ignore */ }
        resizeListener = null;
      }
      if (resizeObserver) {
        try { resizeObserver.disconnect(); } catch (error) { /* ignore */ }
        resizeObserver = null;
      }
      if (mutationObserver) {
        try { mutationObserver.disconnect(); } catch (error) { /* ignore */ }
        mutationObserver = null;
      }
      cancelCaptionHint();
      Object.keys(buttons).forEach(function (name) {
        try { buttons[name].destroy(); } catch (error) { /* 清理继续 */ }
      });
      buttons = {};
      if (holder && holder.parentNode) holder.remove();
      holder = null;
      if (errorBox && errorBox.parentNode) errorBox.remove();
      errorBox = null;
      if (stage && stage.stageEl && hostStageFloorRaw !== null) {
        try { stage.stageEl.style.minHeight = hostStageFloorRaw; } catch (error) { /* 舞台已移除 */ }
      }
    }

    return {
      version: VERSION,
      start: start,
      watch: watch,
      applyCaption: applyCaption,
      applyError: applyError,
      applyControls: applyControls,
      refreshStableLayout: refreshStableLayout,
      cancelCaptionHint: cancelCaptionHint,
      teardown: teardown
    };
  }

  Internals.presentationChrome = {
    create: create,
    version: VERSION
  };
})(window);

/* ---- source: src/demo/presentation-marks.js ---- */
/* NoteDemo presentation marks — Frame/Transition/scene mark rendering and the private
 * scene presentation port for NoteDemo.mount().
 * Scope: NoteDemoInternals.presentationMarks.create (internal shared file; loaded after
 * presentation-chrome.js and before presentation.js). Owns marker slot lifecycles, scene
 * attention, controlled scene geometry/settle/cancel and stable-state scroll follow.
 * Depends on: NoteExpr.Focus/Range/Link when a definition actually uses marks, bindings bag
 * target(), and the presentation port contract used by demo-runtime scene.js
 * (prepareScene -> { commitTargetGeometry, settle, cancel, finished }).
 * Plain JavaScript, classic script, offline file:// safe. No network, no eval.
 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var VERSION = '1.0.0';
  var MARK_COMPONENTS = { focus: 'Focus', range: 'Range', link: 'Link' };
  var MAX_REPORTED_MISSING = 64;

  function text(value) {
    return value == null ? '' : String(value);
  }

  function isElement(value) {
    return !!value && value.nodeType === 1;
  }

  function isConnected(node) {
    if (!node) return false;
    if (typeof node.isConnected === 'boolean') return node.isConnected;
    var doc = global.document;
    return !!(doc && doc.documentElement && doc.documentElement.contains(node));
  }

  function logError(message, error) {
    if (global.console && typeof global.console.error === 'function') {
      global.console.error(message, error);
    }
  }

  function readQuery(value) {
    if (value == null) return 'null';
    try {
      var json = JSON.stringify(value);
      if (json == null) return String(value);
      return json.length > 160 ? json.slice(0, 157) + '...' : json;
    } catch (error) {
      return text(value);
    }
  }

  function prefersReducedMotion() {
    try {
      return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (error) {
      return false;
    }
  }

  function frameById(plan, id) {
    if (id == null || !plan || !plan.frameById) return null;
    return plan.frameById[id] || null;
  }

  /* 默认舞台的标记呈现与 scene 私有 port。
   * config = { plan, bag, reportError(payload), onUnexpected(error), finishCaptionHint() }。 */
  function create(config) {
    var plan = config.plan;
    var bag = config.bag || null;
    var reportError = typeof config.reportError === 'function' ? config.reportError : null;
    var onUnexpected = typeof config.onUnexpected === 'function' ? config.onUnexpected : null;
    var finishCaptionHint = typeof config.finishCaptionHint === 'function' ? config.finishCaptionHint : null;
    var getCause = typeof config.getCause === 'function' ? config.getCause : null;

    var destroyed = false;
    var currentState = null;
    var slots = [];
    var reportedMissing = {};
    var reportedCount = 0;
    var lastReportedFrameId = null;
    var following = false;
    var followRaf = 0;
    var sceneState = null;
    /* 会话焦点：每个 presenter 懒创建一次，跨 attention 场景复用，由 settle/cancel/导航决定 weak/hide。 */
    var focusSession = null;
    var focusRegistry = typeof global.Map === 'function' ? new global.Map() : null;
    var attentionRun = null;
    var lastFocusDesc = null;
    var focusShowCount = 0;
    var navFocusBaseline = -1;

    /* scene 受控标记共享的几何提供器：commit 期间冻结目标几何，settle 后回到实时测量。 */
    var sceneGeometry = {
      frozen: false,
      cache: null,
      rect: function (element) {
        if (!element || typeof element.getBoundingClientRect !== 'function') {
          return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
        }
        if (sceneGeometry.frozen && sceneGeometry.cache && sceneGeometry.cache.has(element)) {
          return sceneGeometry.cache.get(element);
        }
        var raw = element.getBoundingClientRect();
        var rect = {
          left: raw.left, top: raw.top, right: raw.right, bottom: raw.bottom,
          width: raw.width, height: raw.height
        };
        if (sceneGeometry.frozen && sceneGeometry.cache) sceneGeometry.cache.set(element, rect);
        return rect;
      }
    };

    function beginSceneGeometry() {
      sceneGeometry.frozen = true;
      sceneGeometry.cache = typeof global.Map === 'function' ? new global.Map() : null;
    }

    function resetSceneGeometry() {
      sceneGeometry.frozen = false;
      sceneGeometry.cache = null;
    }

    /* ---------------- stable-state scroll follow ---------------- */

    /* scene 完成后的稳定期滚动跟随：只做视口坐标平移，不重新选边/重测。 */
    var sceneScroll = {
      active: false,
      listener: null,
      raf: 0,
      startX: 0,
      startY: 0
    };

    function readWindowScroll() {
      var x = typeof global.scrollX === 'number' ? global.scrollX : (global.pageXOffset || 0);
      var y = typeof global.scrollY === 'number' ? global.scrollY : (global.pageYOffset || 0);
      return { x: x, y: y };
    }

    function controlledSceneSlots() {
      var list = [];
      for (var i = 0; i < slots.length; i += 1) {
        var slot = slots[i];
        if (slot && slot.controlled && slot.visible && slot.instance && slot.instance.el) list.push(slot);
      }
      return list;
    }

    function hasControlledSceneSlots() {
      return controlledSceneSlots().length > 0;
    }

    function clearControlledTransforms() {
      var list = controlledSceneSlots();
      for (var i = 0; i < list.length; i += 1) {
        try { list[i].instance.el.style.transform = ''; } catch (error) { /* ignore */ }
      }
    }

    function sceneScrollTick() {
      sceneScroll.raf = 0;
      if (!sceneScroll.active || destroyed) return;
      var now = readWindowScroll();
      var dx = sceneScroll.startX - now.x;
      var dy = sceneScroll.startY - now.y;
      var list = controlledSceneSlots();
      var value = (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5)
        ? ''
        : 'translate(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px)';
      for (var i = 0; i < list.length; i += 1) {
        try { list[i].instance.el.style.transform = value; } catch (error) { /* ignore */ }
      }
    }

    function scheduleSceneScrollTick() {
      if (!sceneScroll.active || destroyed || sceneScroll.raf) return;
      if (typeof global.requestAnimationFrame !== 'function') return;
      sceneScroll.raf = global.requestAnimationFrame(sceneScrollTick);
    }

    function startSceneScrollFollow() {
      if (destroyed || sceneScroll.active) return;
      if (!hasControlledSceneSlots()) return;
      var start = readWindowScroll();
      sceneScroll.active = true;
      sceneScroll.startX = start.x;
      sceneScroll.startY = start.y;
      sceneScroll.listener = function () { scheduleSceneScrollTick(); };
      try {
        global.addEventListener('scroll', sceneScroll.listener, { passive: true });
      } catch (error) {
        sceneScroll.active = false;
        sceneScroll.listener = null;
      }
    }

    function stopSceneScrollFollow() {
      if (sceneScroll.raf) {
        try { global.cancelAnimationFrame(sceneScroll.raf); } catch (error) { /* ignore */ }
        sceneScroll.raf = 0;
      }
      if (sceneScroll.listener) {
        try { global.removeEventListener('scroll', sceneScroll.listener); } catch (error) { /* ignore */ }
        sceneScroll.listener = null;
      }
      sceneScroll.active = false;
      clearControlledTransforms();
    }

    /* ---------------- mark targets ---------------- */

    function transitionFor(state) {
      if (!state || state.phase !== 'running' || !state.settledFrameId) return null;
      var table = plan && plan.transitions;
      if (!table || typeof table !== 'object') return null;
      var transition = table[state.settledFrameId];
      if (!transition) return null;
      if (state.targetFrameId && transition.to !== state.targetFrameId) return null;
      return transition;
    }

    function markRefs(mark) {
      if (!mark || typeof mark !== 'object') return [];
      if (mark.kind === 'focus') return mark.target ? [mark.target] : [];
      if (mark.kind === 'range') return Array.isArray(mark.targets) ? mark.targets.slice() : [];
      if (mark.kind === 'link') {
        var refs = [];
        if (mark.from) refs.push(mark.from);
        if (mark.to) refs.push(mark.to);
        return refs;
      }
      return [];
    }

    function hasRequiredRef(mark) {
      var refs = markRefs(mark);
      for (var i = 0; i < refs.length; i += 1) {
        if (!refs[i] || refs[i].optional !== true) return refs[i] || null;
      }
      return null;
    }

    function resolveTarget(ref) {
      if (!ref || typeof ref !== 'object') return null;
      var element = null;
      try {
        if (bag && typeof bag.target === 'function') element = bag.target(ref);
      } catch (error) {
        element = null;
      }
      return isElement(element) && isConnected(element) ? element : null;
    }

    /* ---------------- mark slots ---------------- */

    function createSlot(kind, controlled) {
      var Expr = global.NoteExpr || {};
      var name = MARK_COMPONENTS[kind];
      var component = name ? Expr[name] : null;
      if (!component || typeof component.mount !== 'function') {
        throw new Error('NoteDemo.mount 需要先加载 NoteExpr.' + (name || kind) + '。');
      }
      var mountOptions = { motion: 'never' };
      if (controlled) {
        mountOptions.observe = false;
        mountOptions.geometry = sceneGeometry;
      }
      return {
        kind: kind,
        instance: component.mount(mountOptions),
        visible: false,
        elements: null,
        optionKey: '',
        controlled: !!controlled
      };
    }

    function destroySlotObject(slot) {
      if (!slot) return;
      try {
        slot.instance.destroy();
      } catch (error) {
        logError('NoteDemo presentation：销毁标记实例失败。', error);
      }
    }

    function destroySlot(index) {
      var slot = slots[index];
      if (!slot) {
        slots[index] = null;
        return;
      }
      slots[index] = null;
      destroySlotObject(slot);
    }

    function destroyAllSlots() {
      for (var i = 0; i < slots.length; i += 1) destroySlot(i);
      slots = [];
    }

    function sameElements(left, right) {
      if (!left || !right || left.length !== right.length) return false;
      for (var i = 0; i < left.length; i += 1) {
        if (left[i] !== right[i]) return false;
      }
      return true;
    }

    function markOptionKey(mark) {
      var key = text(mark.kind);
      if (mark.kind === 'focus') {
        key += '|' + text(mark.mode || 'box') + '|' + (mark.text == null ? '' : String(mark.text));
      } else if (mark.kind === 'range') {
        key += '|' + (mark.text == null ? '' : String(mark.text))
          + '|' + text(mark.side || '')
          + '|' + text(mark.orientation || '');
      } else if (mark.kind === 'link') {
        key += '|' + (mark.label == null ? '' : String(mark.label))
          + '|' + (typeof mark.arrow === 'boolean' ? String(mark.arrow) : '');
      }
      return key;
    }

    function buildMarkArg(mark, elements) {
      if (mark.kind === 'focus') {
        return {
          el: elements[0],
          mode: text(mark.mode || 'box'),
          text: mark.text == null ? null : String(mark.text)
        };
      }
      if (mark.kind === 'range') {
        var rangeArg = {
          targets: elements,
          text: mark.text == null ? '' : String(mark.text)
        };
        if (mark.side != null) rangeArg.side = mark.side;
        if (mark.orientation != null) rangeArg.orientation = mark.orientation;
        return rangeArg;
      }
      var linkArg = {
        from: elements[0],
        to: elements[1],
        label: mark.label == null ? '' : String(mark.label)
      };
      if (typeof mark.arrow === 'boolean') linkArg.arrow = mark.arrow;
      return linkArg;
    }

    function hideSlot(slot) {
      if (!slot) return;
      slot.visible = false;
      slot.elements = null;
      slot.optionKey = '';
      if (slot.instance.el) {
        try { slot.instance.el.style.transform = ''; } catch (error) { /* ignore */ }
      }
      try {
        slot.instance.hide();
      } catch (error) {
        /* 隐藏已断开的标记不能打断舞台。 */
      }
    }

    function showSlot(slot, mark, elements) {
      var optionKey = markOptionKey(mark);
      if (slot.visible && slot.optionKey === optionKey && sameElements(slot.elements, elements)) {
        try {
          slot.instance.refresh();
          return true;
        } catch (error) {
          hideSlot(slot);
          return false;
        }
      }
      try {
        slot.instance.show(buildMarkArg(mark, elements));
        slot.visible = true;
        slot.elements = elements.slice();
        slot.optionKey = optionKey;
        slot.markId = mark.id == null ? '' : String(mark.id);
        return true;
      } catch (error) {
        hideSlot(slot);
        return false;
      }
    }

    function reportMissingTarget(mark, ref, index, frameId, reason) {
      var kind = mark && mark.kind ? text(mark.kind) : '标记';
      var binding = ref ? text(ref.binding) : '';
      var query = readQuery(ref ? ref.query : null);
      var key = text(frameId) + '|' + index + '|' + binding + '|' + query;
      if (reportedMissing[key]) return;
      if (reportedCount >= MAX_REPORTED_MISSING) return;
      reportedMissing[key] = true;
      reportedCount += 1;
      var message = 'Frame "' + text(frameId) + '" 的 ' + kind + ' 标记目标缺失'
        + (binding ? '：Binding "' + binding + '"，query ' + query : '：' + query)
        + '。' + (reason ? '（' + reason + '）' : '');
      var payload = {
        message: message,
        binding: binding || undefined,
        query: ref ? ref.query : undefined
      };
      if (!reportError) {
        logError('NoteDemo presentation：必需标记缺失，但没有可用的错误上报通道。', payload.message);
        return;
      }
      try {
        reportError(payload);
      } catch (error) {
        logError('NoteDemo presentation：必需标记缺失上报失败。', error);
      }
    }

    function renderMarkList(marks, context) {
      var list = Array.isArray(marks) ? marks : [];
      var i;
      for (i = list.length; i < slots.length; i += 1) destroySlot(i);
      if (slots.length > list.length) slots.length = list.length;
      for (i = 0; i < list.length; i += 1) {
        var mark = list[i];
        var kind = mark && typeof mark === 'object' ? text(mark.kind) : '';
        if (!MARK_COMPONENTS[kind]) {
          if (slots[i]) destroySlot(i);
          continue;
        }
        var slot = slots[i];
        if (!slot || slot.kind !== kind) {
          if (slot) destroySlot(i);
          slot = createSlot(kind, false);
          slots[i] = slot;
        }
        var refs = markRefs(mark);
        var elements = [];
        var missingRef = null;
        var optionalMissing = false;
        for (var r = 0; r < refs.length; r += 1) {
          var ref = refs[r];
          var element = resolveTarget(ref);
          elements.push(element);
          if (!element) {
            if (ref && ref.optional === true) optionalMissing = true;
            else if (!missingRef) missingRef = ref || {};
          }
        }
        var missing = Boolean(missingRef) || optionalMissing || elements.length === 0;
        for (var e = 0; e < elements.length; e += 1) {
          if (!elements[e]) missing = true;
        }
        if (missing) {
          hideSlot(slot);
          if (missingRef && context.stable && context.allowReport) {
            reportMissingTarget(mark, missingRef, i, context.frameId);
          }
          continue;
        }
        var shown = showSlot(slot, mark, elements);
        if (!shown && context.stable && context.allowReport) {
          var requiredRef = hasRequiredRef(mark);
          if (requiredRef) reportMissingTarget(mark, requiredRef, i, context.frameId, '标记无法在目标上显示');
        }
      }
    }

    function renderCurrentMarksNow() {
      var state = currentState;
      if (!state || destroyed) return;
      if (state.phase === 'running') {
        var transition = transitionFor(state);
        /* scene 的目标标记由 prepareScene/commitTargetGeometry 接管；running 阶段先不要
         * 按 transition.marks 销毁稳定槽位，否则 keyed Focus/Range/Link 无法延续。 */
        if (transition && transition.scene && Array.isArray(transition.scene.bindings)) return;
        renderMarkList(transition && Array.isArray(transition.marks) ? transition.marks : [], {
          stable: false,
          allowReport: false,
          frameId: state.targetFrameId || state.settledFrameId
        });
        return;
      }
      var frame = frameById(plan, state.settledFrameId);
      renderMarkList(frame && Array.isArray(frame.marks) ? frame.marks : [], {
        stable: true,
        allowReport: state.phase === 'idle',
        frameId: state.settledFrameId
      });
    }

    function renderCurrentMarks() {
      /* 重排前撤掉滚动平移：按真实 rect 重测后，再以当前滚动位置重新锚定。 */
      var rebase = sceneScroll.active;
      if (rebase) stopSceneScrollFollow();
      try {
        renderCurrentMarksNow();
      } finally {
        if (rebase && !destroyed && hasControlledSceneSlots()) startSceneScrollFollow();
      }
    }

    /* ---------------- 会话焦点（attention 复用、弱化保留与承接） ---------------- */

    /* Focus 实例懒创建一次，跨 attention 场景复用；weak/restore/reanchor 由 Focus 实现，
     * presentation 只决定何时 show/weak/hide，不直接改弱化类或动画。 */

    var focusGeometry = {
      rect: function (element) {
        return measureFocusRect(element);
      }
    };

    function zeroRect() {
      return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
    }

    function rawRectOf(element) {
      if (!element || typeof element.getBoundingClientRect !== 'function') return zeroRect();
      var raw = element.getBoundingClientRect();
      return {
        left: raw.left, top: raw.top, right: raw.right, bottom: raw.bottom,
        width: raw.width, height: raw.height
      };
    }

    function unionRectOf(rects) {
      if (!rects || !rects.length) return zeroRect();
      var left = Infinity;
      var top = Infinity;
      var right = -Infinity;
      var bottom = -Infinity;
      for (var i = 0; i < rects.length; i += 1) {
        var rect = rects[i];
        if (!rect) continue;
        if (rect.left < left) left = rect.left;
        if (rect.top < top) top = rect.top;
        if (rect.right > right) right = rect.right;
        if (rect.bottom > bottom) bottom = rect.bottom;
      }
      if (!isFinite(left) || !isFinite(top)) return zeroRect();
      return { left: left, top: top, right: right, bottom: bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
    }

    function numberOr(value, fallback) {
      var number = typeof value === 'number' ? value : Number(value);
      return isFinite(number) ? number : fallback;
    }

    function measureFocusRect(element) {
      if (focusRegistry) {
        var entry = focusRegistry.get(element);
        if (entry && typeof entry.measure === 'function') return entry.measure();
      }
      return rawRectOf(element);
    }

    function sessionFocusView() {
      if (destroyed || !focusSession) return null;
      return focusSession.view || null;
    }

    function ensureSessionFocus() {
      if (destroyed) return null;
      if (focusSession) return focusSession;
      var Focus = global.NoteExpr && global.NoteExpr.Focus;
      if (!Focus || typeof Focus.mount !== 'function') {
        throw new Error('scene attention 需要先加载 NoteExpr.Focus（用于会话焦点）。');
      }
      var view = Focus.mount({ motion: 'auto', entrance: 'soft', zIndex: 1300, geometry: focusGeometry });
      try {
        view.el.classList.add('note-demo-attention');
        view.el.style.setProperty('--nx-accent', 'var(--hnv-color-accent, #315cda)');
      } catch (error) { /* 保持默认外观 */ }
      focusSession = { view: view };
      return focusSession;
    }

    function hideSessionFocus() {
      var view = sessionFocusView();
      if (!view) return;
      try { view.hide(); } catch (error) { logError('NoteDemo presentation：隐藏会话焦点失败。', error); }
      lastFocusDesc = null;
      if (focusRegistry) focusRegistry.clear();
    }

    function destroySessionFocus() {
      var session = focusSession;
      focusSession = null;
      lastFocusDesc = null;
      if (focusRegistry) focusRegistry.clear();
      if (!session || !session.view) return;
      try { session.view.destroy(); } catch (error) { logError('NoteDemo presentation：销毁会话焦点失败。', error); }
    }

    /* settle 时弱化保留；旧 Focus 没有 weak 生命周期时退化为隐藏，避免停稳后留活动框。 */
    function weakSessionFocus() {
      var view = sessionFocusView();
      if (!view || !view.visible) return false;
      if (typeof view.weak !== 'function') {
        hideSessionFocus();
        return false;
      }
      try {
        view.weak();
        return true;
      } catch (error) {
        logError('NoteDemo presentation：弱化会话焦点失败。', error);
        hideSessionFocus();
        return false;
      }
    }

    /* ---------------- attention target resolution（有效性 / range local / union） ---------------- */

    function missingAttentionError(frameId, index, target, detail) {
      return new Error('Frame "' + text(frameId) + '" 的 attention 目标缺失（第 ' + (index + 1) +
        ' 个目标，Binding "' + text(target && target.binding) + '"，query ' + readQuery(target && target.query) + '）' +
        (detail ? '：' + detail : '') + '。');
    }

    function geometryInternals() {
      var geometry = Internals.sceneGeometry;
      if (!geometry || typeof geometry.readTargetGeometry !== 'function' ||
          typeof geometry.applyLocalRange !== 'function' || typeof geometry.unionRects !== 'function') {
        throw new Error('NoteDemo 默认舞台需要先加载 scene-geometry.js（scene attention 目标几何判定）。');
      }
      return geometry;
    }

    function attentionGeometryError(desc, detail) {
      return new Error('Frame "' + text(desc.frameId) + '" 的 attention 目标几何无效（第 ' + (desc.index + 1) +
        ' 个目标，Binding "' + text(desc.binding) + '"，query ' + readQuery(desc.query) + '）：' + detail + '。');
    }

    function unionRefLabel(ref) {
      return 'Binding "' + text(ref && ref.binding) + '"，query ' + readQuery(ref && ref.query);
    }

    /* 目标几何：主目标必须可定位；display:none/断开/无布局矩形不当作 0,0 参与迁移或 union。
     * opacity:0 的待入场内容只要有真实矩形仍有效；SVG 线允许一维为 0，SVG 点需显式范围。
     * 返回视口矩形（尚未叠加 Focus 组件的默认 6px 外扩，避免重复叠加）。 */
    function computeAttentionGeometry(desc) {
      var geometry = geometryInternals();
      var mainGeo = geometry.readTargetGeometry(desc.mainElement);
      if (!mainGeo.ok) throw attentionGeometryError(desc, mainGeo.issue || '目标不可用');
      var base = mainGeo.rect;
      var range = desc.range;
      if (!range) {
        if (mainGeo.kind === 'point') {
          throw attentionGeometryError(desc, '目标为零尺寸点，不能作为观察范围；请提供 local/union 显式范围，或指向有真实布局区域的元素');
        }
        return base;
      }
      if (range.kind === 'local') {
        var local = geometry.applyLocalRange(base, range);
        if (!local.ok) throw attentionGeometryError(desc, local.issue || 'local range 不可用');
        return local.rect;
      }
      if (range.kind === 'union') {
        /* 主元素始终参与并集；无效几何成员不参与。optional 成员缺失/暂不可用跳过，必需成员明确报错。 */
        var rects = [base];
        for (var i = 0; i < desc.unionRefs.length; i += 1) {
          var entry = desc.unionRefs[i];
          var optional = !!(entry.ref && entry.ref.optional === true);
          var element = resolveTarget(entry.ref);
          if (!element) {
            if (optional) { entry.element = null; continue; }
            throw attentionGeometryError(desc, 'union 辅助成员不可解析（必需）：' + unionRefLabel(entry.ref) +
              '；确可缺失请显式声明 optional:true');
          }
          entry.element = element;
          var memberGeo = geometry.readTargetGeometry(element);
          if (!memberGeo.ok) {
            if (optional) continue;
            throw attentionGeometryError(desc, 'union 辅助成员几何无效（必需）：' + unionRefLabel(entry.ref) + '：' +
              (memberGeo.issue || '不可用'));
          }
          rects.push(memberGeo.rect);
        }
        var union = geometry.unionRects(rects);
        if (!union) throw attentionGeometryError(desc, 'union 范围无法形成有效矩形');
        if (typeof geometry.classifyRect === 'function' && geometry.classifyRect(union) === 'point') {
          throw attentionGeometryError(desc, 'union 范围退化为零尺寸点');
        }
        return union;
      }
      throw new Error('Frame "' + text(desc.frameId) + '" 的 attention range 未知类型：' + text(range.kind) + '。');
    }

    function makeAttentionMeasure(desc) {
      return function measure() {
        var main = desc.mainElement;
        if (!main || !isConnected(main)) {
          /* 运行中临时重建/断开：保留上一有效落点，由 reanchor 重新按逻辑身份解析。 */
          if (desc.lastRect) return desc.lastRect;
          throw new Error('attention 目标元素已断开。');
        }
        try {
          var rect = computeAttentionGeometry(desc);
          desc.lastRect = rect;
          return rect;
        } catch (error) {
          if (desc.lastRect) return desc.lastRect;
          throw error;
        }
      };
    }

    function resolveAttentionTarget(target, frameId, index) {
      var binding = target && typeof target.binding === 'string' ? target.binding : '';
      var query = target ? target.query : null;
      var main = resolveTarget({ binding: binding, query: query });
      if (!main) throw missingAttentionError(frameId, index, target, 'Binding 目标不可解析');
      var desc = {
        target: target,
        frameId: text(frameId),
        index: index,
        binding: binding,
        query: query,
        range: target && target.range ? target.range : null,
        unionRefs: [],
        mainElement: main,
        lastRect: null,
        measure: null
      };
      if (desc.range && typeof desc.range === 'object') {
        if (desc.range.kind === 'union') {
          var refs = Array.isArray(desc.range.refs) ? desc.range.refs : [];
          if (!refs.length) {
            throw new Error('Frame "' + text(frameId) + '" 的 attention union range 缺少 refs。');
          }
          for (var r = 0; r < refs.length; r += 1) {
            desc.unionRefs.push({ ref: refs[r], element: null });
          }
        } else if (desc.range.kind !== 'local') {
          throw new Error('Frame "' + text(frameId) + '" 的 attention range 未知类型：' + text(desc.range.kind) + '。');
        }
      }
      desc.measure = makeAttentionMeasure(desc);
      /* 先算一次初始几何：缺少布局/dispaly:none/必需 union 成员无效在此明确报错，不静默退化。 */
      var initial = desc.measure();
      if (!initial) throw attentionGeometryError(desc, '目标初始几何不可用');
      desc.lastRect = initial;
      if (focusRegistry) focusRegistry.set(main, { measure: desc.measure });
      return desc;
    }

    /* DOM 重建后重新解析同一逻辑目标并静默 reanchor；missing 由调用方隐藏，invalid/failed 保留上一有效落点。 */
    function reanchorFocusTo(desc) {
      var view = sessionFocusView();
      if (!view || !desc) return 'missing';
      var main = resolveTarget({ binding: desc.binding, query: desc.query });
      if (!main) return 'missing';
      if (main !== desc.mainElement) {
        if (focusRegistry) focusRegistry.delete(desc.mainElement);
        desc.mainElement = main;
        if (focusRegistry) focusRegistry.set(main, { measure: desc.measure });
      }
      if (typeof view.reanchor !== 'function') return 'ok';
      try {
        /* 若新元素暂不可用，measure 会返回上一有效落点；静默重绑定，不回到屏幕角落再飞入。 */
        view.reanchor({ el: main, geometry: focusGeometry });
        return 'ok';
      } catch (error) {
        logError('NoteDemo presentation：会话焦点 reanchor 失败。', error);
        return 'failed';
      }
    }

    function refreshSessionFocus() {
      if (!lastFocusDesc) return;
      var view = sessionFocusView();
      if (!view || !view.visible) return;
      var status = reanchorFocusTo(lastFocusDesc);
      if (status === 'missing') {
        hideSessionFocus();
        return;
      }
      try { view.refresh(); } catch (error) { hideSessionFocus(); }
    }

    /* 无 attention 停点：旧目标仍可解析则保留弱线索，否则清除，不让旧框悬空。 */
    function keepOrHideWeakFocus() {
      if (!lastFocusDesc) return;
      var view = sessionFocusView();
      if (!view || !view.visible) return;
      var status = reanchorFocusTo(lastFocusDesc);
      if (status === 'missing') {
        hideSessionFocus();
        return;
      }
      weakSessionFocus();
    }

    /* ---------------- attention 序列（show → whenArrived → start → ready → 迁移） ---------------- */

    function stopAttention() {
      var ctrl = attentionRun;
      if (!ctrl) return;
      attentionRun = null;
      ctrl.closed = true;
      if (ctrl.resolve) ctrl.resolve(false);
    }

    function showAttentionTarget(desc) {
      var session;
      try {
        session = ensureSessionFocus();
      } catch (error) {
        return Promise.reject(error);
      }
      if (!session) return Promise.resolve(false);
      /* 解析到 show 之间若 DOM 已重建：按逻辑身份重新取当前元素，再交给 Focus。 */
      var current = resolveTarget({ binding: desc.binding, query: desc.query });
      if (!current) {
        return Promise.reject(missingAttentionError(desc.frameId, desc.index, desc.target, 'Binding 目标不可解析'));
      }
      if (current !== desc.mainElement) {
        if (focusRegistry) focusRegistry.delete(desc.mainElement);
        desc.mainElement = current;
        if (focusRegistry) focusRegistry.set(current, { measure: desc.measure });
      }
      var view = session.view;
      try {
        view.show({ el: desc.mainElement, geometry: focusGeometry });
        focusShowCount += 1;
      } catch (error) {
        return Promise.reject(error);
      }
      return typeof view.whenArrived === 'function' ? Promise.resolve(view.whenArrived()) : Promise.resolve(true);
    }

    function finishAttention(ctrl) {
      if (ctrl.closed) return;
      ctrl.closed = true;
      if (attentionRun === ctrl) attentionRun = null;
      if (ctrl.resolve) ctrl.resolve(true);
    }

    function failAttention(ctrl, error) {
      if (ctrl.closed) return;
      ctrl.closed = true;
      if (attentionRun === ctrl) attentionRun = null;
      logError('NoteDemo presentation：attention 协调失败。', error);
      if (ctrl.resolve) ctrl.resolve(false);
    }

    function stepAttention(ctrl, index) {
      if (ctrl.closed || attentionRun !== ctrl) return;
      if (index >= ctrl.descs.length) {
        finishAttention(ctrl);
        return;
      }
      var desc = ctrl.descs[index];
      showAttentionTarget(desc).then(function (arrived) {
        if (ctrl.closed || attentionRun !== ctrl) return;
        if (arrived === false) {
          /* 到达被新的运行取代且没有走取消路径：结算本次 attention，避免运行悬挂。 */
          failAttention(ctrl, new Error('attention 目标到达被新的运行取代。'));
          return;
        }
        ctrl.current = index;
        lastFocusDesc = desc;
        var ready;
        try {
          if (ctrl.coordinator && typeof ctrl.coordinator.start === 'function') ctrl.coordinator.start(index);
          ready = ctrl.coordinator && typeof ctrl.coordinator.ready === 'function'
            ? Promise.resolve(ctrl.coordinator.ready(index))
            : Promise.resolve(true);
        } catch (error) {
          failAttention(ctrl, error);
          return;
        }
        ready.then(function () {
          if (ctrl.closed || attentionRun !== ctrl) return;
          stepAttention(ctrl, index + 1);
        }, function (error) {
          failAttention(ctrl, error);
        });
      }, function (error) {
        failAttention(ctrl, error);
      });
    }

    /* 开始本次 attention：先解析全部目标（缺失在这里明确抛错），再按顺序迁移。
     * ready(index) 已包含观察停留与最后落点规则，这里不再叠加 waitHold。 */
    function startSceneAttention(attention, frameId, coordinator) {
      stopAttention();
      if (!attention || !Array.isArray(attention.targets) || attention.targets.length === 0) return null;
      if (prefersReducedMotion()) {
        /* 减少动效：不解析目标、不迁移、不增加等待；本步不保留旧会话焦点。
         * 场景仍在 settle 后落正确终态。 */
        if (sceneState) sceneState.reducedAttention = true;
        hideSessionFocus();
        return null;
      }
      var descs = [];
      for (var i = 0; i < attention.targets.length; i += 1) {
        descs.push(resolveAttentionTarget(attention.targets[i], frameId, i));
      }
      var ctrl = {
        closed: false,
        resolve: null,
        done: null,
        descs: descs,
        current: 0,
        coordinator: coordinator,
        reduced: false
      };
      ctrl.done = new Promise(function (resolve) { ctrl.resolve = resolve; });
      attentionRun = ctrl;
      ensureSessionFocus();
      lastFocusDesc = null;
      stepAttention(ctrl, 0);
      return ctrl;
    }

    /* ---------------- 导航原因与会话焦点的取舍 ---------------- */

    /* 正常 next：保留上一落点（weak）作为承接起点；replay/replayPrevious/go/reset/prev
     * 属于回看或跳转：先 hide 并清引用，再由本次运行的 attention 重建。 */
    function normalizeCause(info) {
      var cause = info && (info.reason || info.cause);
      if (typeof cause === 'string' && cause) return cause;
      if (getCause) {
        try {
          var external = getCause();
          if (typeof external === 'string' && external) return external;
        } catch (error) { /* keep default */ }
      }
      if (currentState && currentState.replaying) return 'replay';
      return 'next';
    }

    function applyFocusNavigation(state) {
      if (!focusSession) return;
      if (state.phase === 'running') {
        /* 重看/上一步重播：不承接旧落点，hide 后由重播中的 attention 重新显示。
         * 记录本次运行前的显示次数：若整次运行没有重新显示焦点（如无可运行入边的
         * 空重看），idle 时保持隐藏，而不是留下旧弱线索。 */
        if (state.replaying) {
          hideSessionFocus();
          navFocusBaseline = focusShowCount;
        }
        return;
      }
      if (state.phase === 'error' || state.phase === 'disposed') {
        hideSessionFocus();
        return;
      }
      if (state.phase !== 'idle') return;
      var cause = null;
      if (getCause) {
        try { cause = getCause(); } catch (error) { cause = null; }
      }
      if (cause === 'go' || cause === 'reset' || cause === 'prev') {
        hideSessionFocus();
        navFocusBaseline = -1;
        return;
      }
      if (cause === 'replay' || cause === 'replayPrevious') {
        if (navFocusBaseline >= 0 && focusShowCount === navFocusBaseline) hideSessionFocus();
        navFocusBaseline = -1;
      }
    }

    /* ---------------- scene port（默认舞台的私有呈现服务） ---------------- */

    /* scene 引擎在目标 commit 前调用：隐藏已有标记、停跟帧、准备目标 Frame 的受控标记。 */
    function prepareScene(info) {
      if (destroyed) return null;
      var cause = normalizeCause(info);
      /* 新的运行开始：结束上一次 attention 序列（会话 Focus 实例保留，跨场景复用）。 */
      stopAttention();
      if (cause !== 'next') hideSessionFocus();
      var targetFrame = info && info.targetFrame ? info.targetFrame : null;
      stopSceneScrollFollow();
      stopFollow();
      var targetMarks = targetFrame && Array.isArray(targetFrame.marks) ? targetFrame.marks : [];
      var retainedIds = {};
      targetMarks.forEach(function (mark) {
        if (mark && mark.id != null && mark.kind) retainedIds[text(mark.kind) + '|' + String(mark.id)] = true;
      });
      /* 同 id 同类型标记在 scene 准备阶段不被藏起；若几何不变，完成时也不重播淡入。 */
      for (var i = 0; i < slots.length; i += 1) {
        var slot = slots[i];
        var key = slot && slot.markId ? text(slot.kind) + '|' + slot.markId : '';
        if (!key || !Object.prototype.hasOwnProperty.call(retainedIds, key)) hideSlot(slot);
      }
      sceneState = {
        active: true,
        targetFrame: targetFrame,
        frameId: targetFrame ? text(targetFrame.id) : '',
        marks: targetMarks,
        attention: info && info.attention ? info.attention : null,
        attentionCoordinator: info && info.attentionCoordinator ? info.attentionCoordinator : null,
        attentionCtrl: null,
        hadAttention: !!(info && info.attention && Array.isArray(info.attention.targets) && info.attention.targets.length),
        reducedAttention: false,
        cause: cause,
        held: false,
        heldFrameId: null
      };
      return {
        commitTargetGeometry: commitTargetGeometry,
        settle: settleScene,
        cancel: cancelScene,
        /* 字幕换句提示只是轻提示，不延长完成边界：收尾时关闭，不等待 200ms 动画。
         * attention 属于本次运行内容，仍按真实收尾等待。 */
        finished: function () {
          if (finishCaptionHint) finishCaptionHint();
          var ctrl = sceneState && sceneState.attentionCtrl;
          var attentionDone = ctrl && ctrl.done && typeof ctrl.done.then === 'function'
            ? ctrl.done.then(function () { return true; }, function () { return false; })
            : Promise.resolve(true);
          return attentionDone;
        }
      };
    }

    /* 目标 DOM 提交后同步调用：解析目标 Frame.marks、按冻结几何建受控标记并先藏起来。
     * 中途失败时释放本次已建立的全部标记与旧槽位，避免失败后残留不可达的标记 DOM。 */
    function commitTargetGeometry() {
      var state = sceneState;
      var marks = state && Array.isArray(state.marks) ? state.marks : [];
      beginSceneGeometry();
      var previousSlots = slots.slice();
      var nextSlots = [];
      var markRoots = [];

      function takeSlot(kind, mark, index) {
        var markId = mark && mark.id != null ? String(mark.id) : '';
        var found = null;
        for (var s = 0; s < previousSlots.length; s += 1) {
          var candidate = previousSlots[s];
          if (!candidate || candidate.kind !== kind) continue;
          if (markId) {
            if (candidate.markId !== markId) continue;
          } else if (s !== index) {
            continue;
          }
          found = candidate;
          previousSlots[s] = null;
          break;
        }
        return found || createSlot(kind, true);
      }

      try {
        for (var i = 0; i < marks.length; i += 1) {
          var mark = marks[i];
          var kind = mark && typeof mark === 'object' ? text(mark.kind) : '';
          if (!MARK_COMPONENTS[kind]) continue;
          var refs = markRefs(mark);
          var elements = [];
          var missingRef = null;
          var optionalMissing = false;
          for (var r = 0; r < refs.length; r += 1) {
            var ref = refs[r];
            var element = resolveTarget(ref);
            elements.push(element);
            if (!element) {
              if (ref && ref.optional === true) optionalMissing = true;
              else if (!missingRef) missingRef = ref || {};
            }
          }
          var slot = takeSlot(kind, mark, i);
          var markId = mark && mark.id != null ? String(mark.id) : '';
          slot.markId = markId;
          nextSlots.push(slot);
          if (missingRef) {
            hideSlot(slot);
            throw new Error('Frame "' + text(state.frameId) + '" 的 ' + kind + ' 标记目标缺失：Binding "' +
              text(missingRef.binding) + '"，query ' + readQuery(missingRef.query) + '。');
          }
          if (optionalMissing || elements.length === 0) {
            hideSlot(slot);
            continue;
          }
          var optionKey = markOptionKey(mark);
          var unchanged = !!markId && slot.visible && slot.optionKey === optionKey && sameElements(slot.elements, elements);
          if (unchanged) {
            try { slot.instance.refresh(); } catch (error) { hideSlot(slot); }
            continue;
          }
          slot.instance.show(buildMarkArg(mark, elements));
          slot.visible = true;
          slot.elements = elements.slice();
          slot.optionKey = optionKey;
          if (slot.instance.el) {
            slot.instance.el.style.opacity = '0';
            markRoots.push(slot.instance.el);
          }
        }
        for (var p = 0; p < previousSlots.length; p += 1) {
          if (previousSlots[p]) destroySlotObject(previousSlots[p]);
        }
        slots = nextSlots;
        if (state.attention) {
          state.attentionCtrl = startSceneAttention(state.attention, state.frameId, state.attentionCoordinator);
        }
        return { markRoots: markRoots };
      } catch (error) {
        for (var n = 0; n < nextSlots.length; n += 1) destroySlotObject(nextSlots[n]);
        for (var q = 0; q < previousSlots.length; q += 1) {
          if (previousSlots[q]) destroySlotObject(previousSlots[q]);
        }
        slots = [];
        resetSceneGeometry();
        throw error;
      }
    }

    /* scene 全部真实效果结束：受控标记转稳定测量并保持到下一次渲染。
     * 会话焦点在这里 weak（不销毁、不额外计时），作为下一次正常 next 的承接起点。 */
    function settleScene() {
      if (!sceneState) return;
      stopAttention();
      var ctrl = sceneState.attentionCtrl;
      var hadAttention = !!sceneState.hadAttention;
      var reducedAttention = !!sceneState.reducedAttention;
      stopSceneScrollFollow();
      sceneGeometry.frozen = false;
      for (var i = 0; i < slots.length; i += 1) {
        var slot = slots[i];
        if (!slot || !slot.controlled) continue;
        if (slot.instance.el) {
          try {
            slot.instance.el.style.opacity = '';
            slot.instance.el.style.transform = '';
          } catch (error) { /* ignore */ }
        }
        try { slot.instance.refresh(); } catch (error) { /* keep stage alive */ }
      }
      sceneState.active = false;
      sceneState.held = true;
      sceneState.heldFrameId = sceneState.frameId;
      /* 有 attention：最后落点弱化保留；减少动效不迁移也不保留本步旧框。
       * 无 attention：若旧 attention 目标仍可解析则保留弱线索，否则清除。 */
      if (hadAttention) {
        if (reducedAttention) {
          hideSessionFocus();
        } else {
          /* DOM 在运行中重建时，先按逻辑引用 reanchor 到当前元素再弱化。 */
          if (lastFocusDesc) reanchorFocusTo(lastFocusDesc);
          if (!weakSessionFocus()) hideSessionFocus();
        }
      } else {
        keepOrHideWeakFocus();
      }
      /* 结算完成后的普通滚动只平移受控标记，不重新选边。 */
      startSceneScrollFollow();
    }

    /* scene 取消：隐藏受控标记与本次会话焦点，后续稳定渲染重新解析来源 Frame。 */
    function cancelScene() {
      stopAttention();
      hideSessionFocus();
      stopSceneScrollFollow();
      for (var i = 0; i < slots.length; i += 1) {
        var slot = slots[i];
        if (!slot || !slot.controlled) continue;
        hideSlot(slot);
        if (slot.instance.el) {
          try { slot.instance.el.style.opacity = ''; } catch (error) { /* ignore */ }
        }
      }
      resetSceneGeometry();
      sceneState = null;
      stopFollow();
    }

    /* ---------------- follow loop（运行期每帧重新解析逻辑目标） ---------------- */

    function scheduleFollow() {
      if (!following || destroyed) return;
      if (typeof global.requestAnimationFrame !== 'function') {
        following = false;
        return;
      }
      followRaf = global.requestAnimationFrame(followTick);
    }

    function followTick() {
      followRaf = 0;
      if (destroyed || !following) return;
      try {
        renderCurrentMarks();
      } catch (error) {
        if (onUnexpected) onUnexpected(error);
      }
      scheduleFollow();
    }

    function startFollow() {
      if (following || destroyed) return;
      following = true;
      scheduleFollow();
    }

    function stopFollow() {
      following = false;
      if (followRaf && typeof global.cancelAnimationFrame === 'function') {
        try {
          global.cancelAnimationFrame(followRaf);
        } catch (error) {
          /* frame already gone */
        }
      }
      followRaf = 0;
    }

    /* ---------------- state pipeline ---------------- */

    function applyState(state) {
      if (destroyed || !state) return;
      currentState = state;
      applyFocusNavigation(state);
      if (lastReportedFrameId !== state.settledFrameId) {
        reportedMissing = {};
        reportedCount = 0;
        if (sceneState && sceneState.heldFrameId && sceneState.heldFrameId !== state.settledFrameId) {
          sceneState.held = false;
          sceneState.heldFrameId = null;
        }
      }
      lastReportedFrameId = state.settledFrameId;
      var sceneActive = !!(sceneState && sceneState.active);
      var sceneHeld = !!(sceneState && sceneState.held && sceneState.heldFrameId === state.settledFrameId);
      if (state.phase === 'running') {
        if (sceneActive) {
          /* scene 的最终标记由 port 在提交后接管，运行期不再跟帧重建。 */
          stopFollow();
        } else {
          startFollow();
          renderCurrentMarks();
        }
        return;
      }
      stopFollow();
      if (sceneHeld) {
        /* 完成边界已由 port.settle 摆好受控标记；本次 idle 不重建，下一渲染起转常态。 */
        sceneState.held = false;
        return;
      }
      renderCurrentMarks();
    }

    /* 稳定停点没有跟帧；但组件可能因 resize / relayout 重建 DOM（如 R10）。
     * 此时逻辑引用没有变、Element 却换了，需要重新解析一次目标并 show。 */
    function refreshStable() {
      if (destroyed) return;
      try {
        renderCurrentMarks();
      } catch (error) {
        if (onUnexpected) onUnexpected(error);
      }
      /* DOM 重建后重新解析会话焦点的同一逻辑目标并静默 reanchor；缺失则清除弱线索。 */
      try {
        refreshSessionFocus();
      } catch (error) {
        if (onUnexpected) onUnexpected(error);
      }
    }

    function teardown() {
      if (destroyed) return;
      destroyed = true;
      stopAttention();
      destroySessionFocus();
      stopSceneScrollFollow();
      stopFollow();
      resetSceneGeometry();
      sceneState = null;
      currentState = null;
      destroyAllSlots();
    }

    return {
      version: VERSION,
      applyState: applyState,
      refreshStable: refreshStable,
      prepareScene: prepareScene,
      teardown: teardown
    };
  }

  Internals.presentationMarks = {
    create: create,
    version: VERSION
  };
})(window);

/* ---- source: src/demo/presentation.js ---- */
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

/* ---- source: src/demo/recipes.js ---- */
/* NoteDemo recipes — small executable compositions that return NoteDemo inputs.
 * Scope: window.NoteDemoRecipes. Depends on NoteDemoAuthor, NoteUI.Stack/Grid and the
 * components mounted through NoteDemo bindings. No player, no content inference.
 */
(function (global) {
  'use strict';

  var Recipes = global.NoteDemoRecipes = global.NoteDemoRecipes || {};
  var VERSION = '1.0.0';

  function fail(message) {
    throw new Error('NoteDemoRecipes: ' + message);
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function text(value) {
    return value == null ? '' : String(value);
  }

  function el(tag, className, content) {
    var node = global.document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = String(content);
    return node;
  }

  function slot(name, className) {
    var node = el('div', 'nd-recipe__slot' + (className ? ' ' + className : ''));
    node.setAttribute('data-demo-slot', name);
    return node;
  }

  function head(title, meta) {
    var wrap = el('div', 'nd-recipe__head');
    if (title) wrap.appendChild(el('p', 'nd-recipe__title', title));
    if (meta) wrap.appendChild(el('p', 'nd-recipe__meta', meta));
    return wrap;
  }

  function card(title, meta, slotName, className) {
    var node = el('section', 'nd-recipe__card' + (className ? ' ' + className : ''));
    if (title || meta) node.appendChild(head(title, meta));
    var target = slot(slotName, 'nd-recipe__slot--' + slotName);
    node.appendChild(target);
    return { el: node, slot: target };
  }

  function requireUI() {
    var UI = global.NoteUI;
    if (!UI || !UI.Grid || typeof UI.Grid.mount !== 'function' || !UI.Stack || typeof UI.Stack.mount !== 'function') {
      throw new Error('NoteDemoRecipes.focusWorkbench 需要先加载 NoteUI.Grid 与 NoteUI.Stack。');
    }
    return UI;
  }

  /* layout(container) 返回 { root, slots, cleanup }；cleanup 幂等，供公共层在销毁时调用。
   * 布局回调返回前失败时公共层拿不到 cleanup，因此这里在任何抛出路径都释放已创建的
   * 布局组件（Grid/Stack 自带观察器），不留悬空资源。 */
  function buildLayout(container, options) {
    var UI = requireUI();
    var root = el('div', 'nd-recipe' + (options.className ? ' ' + options.className : ''));
    var cleanups = [];
    var slots = {};
    var released = false;

    function release() {
      if (released) return;
      released = true;
      for (var i = cleanups.length - 1; i >= 0; i -= 1) {
        try { cleanups[i].destroy(); } catch (error) { /* keep cleanup moving */ }
      }
      if (root.parentNode) root.parentNode.removeChild(root);
    }

    try {
      var sourceGrid = UI.Grid.mount(root, {
        columns: 'auto',
        minColumnWidth: options.sourceMinWidth || '16rem',
        gap: 'md'
      });
      cleanups.push(sourceGrid);
      (options.sources || []).forEach(function (source) {
        if (!isObject(source) || !source.slot) fail('sources 每项必须是 {slot,title?,meta?}。');
        var built = card(source.title, source.meta, source.slot, 'nd-recipe__board');
        sourceGrid.append(built.el);
      });
      root.dataset.sources = String((options.sources || []).length);

      var processStack = UI.Stack.mount(root, { gap: 'sm', align: 'stretch' });
      cleanups.push(processStack);

      var processCard = el('section', 'nd-recipe__process');
      if (options.processTitle || options.processMeta) {
        processCard.appendChild(head(options.processTitle, options.processMeta));
      }
      var processBody = el('div', 'nd-recipe__process-body');
      processCard.appendChild(processBody);
      (options.process || []).forEach(function (item) {
        if (!isObject(item) || !item.slot) fail('process 每项必须是 {slot,title?}。');
        var built = card(item.title, item.meta, item.slot, 'nd-recipe__process-slot');
        processBody.appendChild(built.el);
      });

      var hasReadout = !!(options.readout && options.readout.slot);
      var hasResult = !!(options.result && options.result.slot);
      /* 没有读数/结果时不生成空页脚网格，避免无意义的 DOM 与观察器。 */
      if (hasReadout || hasResult) {
        var footerGrid = UI.Grid.mount(processCard, {
          columns: 'auto',
          minColumnWidth: options.footerMinWidth || '12rem',
          gap: 'sm'
        });
        cleanups.push(footerGrid);
        var footer = el('div', 'nd-recipe__footer');
        footerGrid.el.appendChild(footer);
        if (hasReadout) {
          footer.appendChild(card(options.readout.title, options.readout.meta, options.readout.slot, 'nd-recipe__readout').el);
        }
        if (hasResult) {
          footer.appendChild(card(options.result.title, options.result.meta, options.result.slot, 'nd-recipe__result').el);
        }
      }
      processStack.append(processCard);
      container.appendChild(root);

      var required = [];
      (options.sources || []).forEach(function (source) { required.push(source.slot); });
      (options.process || []).forEach(function (item) { required.push(item.slot); });
      if (hasReadout) required.push(options.readout.slot);
      if (hasResult) required.push(options.result.slot);
      var collected = global.NoteDemo && typeof global.NoteDemo.collectSlots === 'function'
        ? global.NoteDemo.collectSlots(root, required)
        : global.NoteDemoAuthor.collectSlots(root, required);
      slots = collected;

      return {
        root: root,
        slots: slots,
        cleanup: release
      };
    } catch (error) {
      release();
      throw error;
    }
  }

  function requireCompile() {
    var Author = global.NoteDemoAuthor;
    if (!Author || typeof Author.compile !== 'function') {
      throw new Error('NoteDemoRecipes.focusWorkbench 需要先加载 NoteDemoAuthor.compile。');
    }
    return Author;
  }

  function focusWorkbench(options) {
    if (!isObject(options)) fail('focusWorkbench 需要一个配置对象。');
    var Author = requireCompile();
    var sources = Array.isArray(options.sources) ? options.sources : [];
    if (!sources.length) fail('focusWorkbench 至少需要一个 source 区域。');
    var definition = Author.compile({
      bindings: options.bindings,
      initial: options.initial,
      steps: options.steps,
      adapters: options.adapters
    });
    return {
      definition: definition,
      layout: function (container) { return buildLayout(container, options); },
      recipeVersion: VERSION
    };
  }

  Recipes.focusWorkbench = focusWorkbench;
  Recipes.version = VERSION;
})(window);
