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
