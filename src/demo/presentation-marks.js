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

    var destroyed = false;
    var slots = [];
    var reportedMissing = {};
    var reportedCount = 0;
    var lastReportedFrameId = null;
    var following = false;
    var followRaf = 0;
    var sceneState = null;
    var sceneAttention = null;

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

    /* ---------------- scene attention（作者声明的注意交接） ---------------- */

    /* 只显示一个连续 Focus 框，按作者给出的顺序迁移；不新增标签、不遮罩其他区域。 */
    function destroySceneAttention() {
      var ctrl = sceneAttention;
      if (!ctrl) return;
      sceneAttention = null;
      ctrl.closed = true;
      if (ctrl.timer) {
        try { global.clearTimeout(ctrl.timer); } catch (error) { /* ignore */ }
        ctrl.timer = 0;
      }
      if (ctrl.instance) {
        try { ctrl.instance.destroy(); } catch (error) { /* ignore */ }
      }
      if (typeof ctrl.resolve === 'function') ctrl.resolve(false);
    }

    function startSceneAttention(attention, frameId, coordinator) {
      destroySceneAttention();
      if (!attention || !Array.isArray(attention.targets) || attention.targets.length === 0) return null;
      /* 减少动效不做迁移，也不增加执行窗口；内容和稳定终态仍完整。 */
      if (prefersReducedMotion()) return null;
      var Focus = global.NoteExpr && global.NoteExpr.Focus;
      if (!Focus || typeof Focus.mount !== 'function') {
        throw new Error('scene attention 需要先加载 NoteExpr.Focus（用于按注意顺序迁移局部焦点框）。');
      }
      var elements = [];
      for (var i = 0; i < attention.targets.length; i += 1) {
        var ref = attention.targets[i];
        var element = resolveTarget(ref);
        if (!element) {
          throw new Error('Frame "' + text(frameId) + '" 的 attention 目标缺失：Binding "' +
            text(ref && ref.binding) + '"，query ' + readQuery(ref && ref.query) + '。');
        }
        elements.push(element);
      }
      var ctrl = {
        instance: null,
        timer: 0,
        closed: false,
        resolve: null,
        done: null
      };
      ctrl.done = new Promise(function (resolve) { ctrl.resolve = resolve; });
      var instance = Focus.mount({ motion: 'auto', entrance: 'soft', zIndex: 1300 });
      try {
        instance.el.classList.add('note-demo-attention');
        instance.el.style.setProperty('--nx-accent', 'var(--hnv-color-accent, #315cda)');
      } catch (error) { /* keep default */ }
      ctrl.instance = instance;
      sceneAttention = ctrl;
      var index = 0;
      function fail(error) {
        if (ctrl.closed) return;
        ctrl.closed = true;
        logError('NoteDemo presentation：attention 协调失败。', error);
        if (typeof ctrl.resolve === 'function') ctrl.resolve(false);
      }
      function finish() {
        if (ctrl.closed) return;
        ctrl.closed = true;
        if (instance) {
          try { instance.hide(); } catch (error) { /* keep completion */ }
        }
        var hidden = instance && typeof instance.whenHidden === 'function'
          ? Promise.resolve(instance.whenHidden()).then(function () { return true; }, function () { return true; })
          : Promise.resolve();
        hidden.then(function () {
          if (typeof ctrl.resolve === 'function') ctrl.resolve(true);
        });
      }
      function holdFor(i) {
        var target = attention.targets[i];
        var hold = target && typeof target.holdDuration === 'number' && target.holdDuration > 0
          ? target.holdDuration : attention.stepDuration;
        return Math.max(0, hold);
      }
      function waitHold(ms) {
        return new Promise(function (resolve) {
          ctrl.timer = global.setTimeout(function () {
            ctrl.timer = 0;
            resolve();
          }, ms);
        });
      }
      function step() {
        if (ctrl.closed) return;
        if (index >= elements.length) {
          finish();
          return;
        }
        var targetIndex = index;
        var arrived;
        try {
          instance.show(elements[targetIndex]);
          arrived = typeof instance.whenArrived === 'function' ? instance.whenArrived() : Promise.resolve(true);
        } catch (error) {
          fail(error);
          return;
        }
        Promise.resolve(arrived).then(function (ok) {
          if (ctrl.closed || ok === false) return;
          var ready;
          try {
            if (coordinator && typeof coordinator.start === 'function') coordinator.start(targetIndex);
            ready = coordinator && typeof coordinator.ready === 'function'
              ? Promise.resolve(coordinator.ready(targetIndex)) : Promise.resolve(true);
          } catch (error) {
            fail(error);
            return;
          }
          Promise.all([ready, waitHold(holdFor(targetIndex))]).then(function () {
            if (ctrl.closed) return;
            index += 1;
            step();
          }, function (error) {
            fail(error);
          });
        }, function (error) {
          fail(error);
        });
      }
      step();
      return ctrl;
    }

    /* ---------------- scene port（默认舞台的私有呈现服务） ---------------- */

    /* scene 引擎在目标 commit 前调用：隐藏已有标记、停跟帧、准备目标 Frame 的受控标记。 */
    function prepareScene(info) {
      if (destroyed) return null;
      destroySceneAttention();
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
          var attentionDone = sceneAttention && sceneAttention.done && typeof sceneAttention.done.then === 'function'
            ? sceneAttention.done.then(function () { return true; }, function () { return false; })
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
        if (state.attention) startSceneAttention(state.attention, state.frameId, state.attentionCoordinator);
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

    /* scene 全部真实效果结束：受控标记转稳定测量并保持到下一次渲染。 */
    function settleScene() {
      if (!sceneState) return;
      destroySceneAttention();
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
      /* 结算完成后的普通滚动只平移受控标记，不重新选边。 */
      startSceneScrollFollow();
    }

    /* scene 取消：隐藏受控标记的临时状态；后续稳定渲染会重新解析来源 Frame 标记。 */
    function cancelScene() {
      destroySceneAttention();
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

    var currentState = null;

    function applyState(state) {
      if (destroyed || !state) return;
      currentState = state;
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
    }

    function teardown() {
      if (destroyed) return;
      destroyed = true;
      destroySceneAttention();
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
