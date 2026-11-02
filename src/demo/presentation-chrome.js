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
    var densityObserver = null;
    var forceStageRelayout = false;
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
      if (forceStageRelayout || layoutChanged(stageLayout, nextLayout)) {
        stageReservePx = 0;
        forceStageRelayout = false;
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
      /* 组件密度切换不改宽度，只改 data-density；显式识别并重新测量预留，避免旧的大预留锁住。 */
      if (stage && stage.stageEl && typeof global.MutationObserver === 'function') {
        try {
          densityObserver = new global.MutationObserver(function (records) {
            var changed = false;
            for (var i = 0; i < records.length; i += 1) {
              if (records[i].type === 'attributes' && records[i].attributeName === 'data-density') changed = true;
            }
            if (!changed) return;
            forceStageRelayout = true;
            scheduleRevalidate();
          });
          densityObserver.observe(stage.stageEl, { subtree: true, attributes: true, attributeFilter: ['data-density'] });
        } catch (error) {
          densityObserver = null;
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
      if (densityObserver) {
        try { densityObserver.disconnect(); } catch (error) { /* ignore */ }
        densityObserver = null;
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