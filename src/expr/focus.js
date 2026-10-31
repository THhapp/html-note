/*!
 * 关注与范围标记 · 组件核心 v1.0.0
 * 依赖：无（原生 DOM + Web Animations API），file:// 直接可用。
 *
 * 挂载：
 *   var focus = NoteExpr.Focus.mount({ motion: 'auto', zIndex: 1210 });
 *   focus.show(el);                              // 元素 → 框选
 *   focus.show({ el: p, text: '缓存是否命中' });  // 文本子串 → 下划线
 *   focus.show({ el: p, text: '...', mode: 'box' }); // 强制模式
 *   focus.show(otherEl);                         // 已有标记 → 迁移
 *   focus.hide();  focus.refresh();  focus.destroy();
 *   var soft = NoteExpr.Focus.mount({ entrance: 'soft' }); // attention 的软出现
 *   await focus.whenArrived();                    // 本次出现/迁移实际完成
 *   await focus.whenHidden();                     // 本次淡出实际完成
 *
 * 只读：focus.el / focus.visible / focus.target / focus.mode / focus.text
 * 显示期间按目标真实 rect 每帧跟随；动画完成由 WAAPI finished 决定，不另设计时器。
 *
 * 几何契约（视口坐标，叠加层 position:fixed; inset:0）：
 *   框选：框 = 目标 rect 四边各外扩 6px；1.5px 描边画在框内侧（border-box），圆角 8px；
 *   下划线：Range.getClientRects() 每行盒一段（过滤宽 < 1px），
 *           left = rect.left + 1、width = rect.width - 2、top = rect.bottom - 1、高 2px。
 *
 * 动效契约（SPEC §6）：首次显示默认 220ms 淡入 + 缩放 .97→1；entrance:'soft'（attention 使用）320ms 淡入 + 上浮 5px/.93→1；下划线逐段 240ms 画出、段间 30ms；
 *   迁移 280ms 几何过渡；取消 150ms 淡出；motion:'never' 或系统减少动效 → 0ms 直落、不建动画。
 *
 * 职责边界：只做“当前关注”这一种标记的几何与动效；不判断重点、不自动播放、不显示文字；
 * 不做全局样式、不引用外部资源。实例之间、与 B/C 组件之间不共享 DOM / 变量。
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';

  var EASE = 'cubic-bezier(.22,.7,.25,1)';   /* 迁移：前段快、尾段稳（SPEC §6） */
  var EASE_OUT = 'cubic-bezier(.4,0,.2,1)';  /* 淡入 / 淡出 / 下划线画出：可感知的匀速收尾 */

  /* 几何与动效基线（SPEC §4 / §6），集中在此便于核对 */
  var G = {
    pad: 6,           // 框选外扩
    ruleInset: 1,     // 下划线左右内缩
    ruleH: 2,         // 下划线高度（CSS 中同样固定为 2px）
    showBoxDur: 220,  // 框首次淡入 + 缩放
    showBoxSoftDur: 320, // attention 的软收束出现
    showRuleDur: 240, // 下划线单段画出
    ruleStagger: 30,  // 段间延迟
    migrateBoxDur: 280,
    migrateOutDur: 120, // 迁移时旧下划线淡出
    hideDur: 150,
    eps: 0.5          // 重测量比较阈值
  };

  var DOC = global.document;
  var SHOW_TEXT = 4; // NodeFilter.SHOW_TEXT，避免依赖 NodeFilter 全局

  /* ---------------- 小工具 ---------------- */

  function h(tag, cls) {
    var node = DOC.createElement(tag);
    if (cls) node.className = cls;
    return node;
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function px(n) {
    return round1(n) + 'px';
  }

  function isEl(node) {
    return !!node && node.nodeType === 1;
  }

  function isConnected(node) {
    if (!node) return false;
    if (typeof node.isConnected === 'boolean') return node.isConnected;
    return !!(DOC.documentElement && DOC.documentElement.contains(node));
  }

  function fail(message) {
    throw new Error('NoteExpr.Focus: ' + message);
  }

  /* scene 受控测量：geometry.rect 由宿主提供（冻结目标几何）；缺省走原生 rect。 */
  function normalizeGeometry(input) {
    if (input && typeof input === 'object' && typeof input.rect === 'function') return input;
    return null;
  }

  function readRect(el, geometry) {
    if (geometry && typeof geometry.rect === 'function') return geometry.rect(el);
    return el.getBoundingClientRect();
  }

  function removeNode(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  /* ---------------- 文本定位 ---------------- */

  /* 把 textContent 中的字符下标映射回 (textNode, offset)；跨内联元素时同样成立 */
  function pointAt(nodes, pos, isEnd) {
    var i;
    var entry;
    for (i = 0; i < nodes.length; i++) {
      entry = nodes[i];
      if (isEnd) {
        if (pos > entry.start && pos <= entry.end) {
          return { node: entry.node, offset: pos - entry.start };
        }
      } else if (pos >= entry.start && pos < entry.end) {
        return { node: entry.node, offset: pos - entry.start };
      }
    }
    if (!nodes.length) return null;
    var last = nodes[nodes.length - 1];
    return { node: last.node, offset: isEnd ? last.end - last.start : 0 };
  }

  /* 返回覆盖 needle 首次出现的 Range；找不到返回 null。定位口径 = element.textContent 首次出现 */
  function findRange(el, needle) {
    var walker = DOC.createTreeWalker(el, SHOW_TEXT, null);
    var nodes = [];
    var text = '';
    var node;
    while ((node = walker.nextNode())) {
      var value = node.nodeValue || '';
      nodes.push({ node: node, start: text.length, end: text.length + value.length });
      text += value;
    }
    var from = text.indexOf(needle);
    if (from < 0) return null;
    var to = from + needle.length;
    var start = pointAt(nodes, from, false);
    var end = pointAt(nodes, to, true);
    if (!start || !end) return null;
    var range = DOC.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return range;
  }

  /* Range 每行盒 → 下划线几何（过滤宽 < 1px 的空行盒） */
  function rangeRects(range) {
    var out = [];
    var list;
    try {
      list = range.getClientRects();
    } catch (err) {
      return out;
    }
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!(r.width >= 1)) continue;
      out.push({
        left: r.left + G.ruleInset,
        top: r.bottom - 1,
        width: Math.max(0, r.width - G.ruleInset * 2)
      });
    }
    return out;
  }

  /* ---------------- 测量 ---------------- */

  function roundBox(box) {
    return {
      left: round1(box.left),
      top: round1(box.top),
      width: round1(box.width),
      height: round1(box.height)
    };
  }

  function measureSpec(spec, geometry) {
    if (!isEl(spec.el)) fail('目标必须是 DOM 元素');
    if (!isConnected(spec.el)) fail('目标元素不在文档中');
    if (spec.mode === 'underline') {
      var raw = null;
      if (geometry && typeof geometry.textRects === 'function') {
        raw = geometry.textRects(spec.el, spec.text);
        raw = Array.isArray(raw) ? raw.map(function (r) {
          return { left: r.left + G.ruleInset, top: r.bottom - 1, width: Math.max(0, r.width - G.ruleInset * 2) };
        }) : [];
      } else {
        var range = findRange(spec.el, spec.text);
        if (!range) fail('在目标元素中找不到文本「' + spec.text + '」');
        raw = rangeRects(range);
      }
      if (!raw.length) fail('文本「' + spec.text + '」没有可见行盒');
      var rects = [];
      for (var i = 0; i < raw.length; i++) {
        rects.push({ left: round1(raw[i].left), top: round1(raw[i].top), width: round1(raw[i].width) });
      }
      return { kind: 'underline', rects: rects };
    }
    var r = readRect(spec.el, geometry);
    return {
      kind: 'box',
      box: roundBox({
        left: r.left - G.pad,
        top: r.top - G.pad,
        width: r.width + G.pad * 2,
        height: r.height + G.pad * 2
      })
    };
  }

  function geoSame(a, b) {
    if (!a || !b || a.kind !== b.kind) return false;
    var i;
    var k;
    if (a.kind === 'box') {
      var keys = ['left', 'top', 'width', 'height'];
      for (i = 0; i < keys.length; i++) {
        if (Math.abs((a.box[keys[i]] || 0) - (b.box[keys[i]] || 0)) > G.eps) return false;
      }
      return true;
    }
    if (a.rects.length !== b.rects.length) return false;
    var segKeys = ['left', 'top', 'width'];
    for (i = 0; i < a.rects.length; i++) {
      for (k = 0; k < segKeys.length; k++) {
        if (Math.abs((a.rects[i][segKeys[k]] || 0) - (b.rects[i][segKeys[k]] || 0)) > G.eps) return false;
      }
    }
    return true;
  }

  /* ---------------- 参数校验 ---------------- */

  function normalizeSpec(arg) {
    if (isEl(arg)) return { el: arg, mode: 'box', text: null };
    if (arg && typeof arg === 'object') {
      if (!isEl(arg.el)) fail('show() 需要 DOM 元素：show(el) 或 show({ el, text, mode })');
      var forced = arg.mode === undefined || arg.mode === null ? '' : String(arg.mode);
      if (forced && forced !== 'box' && forced !== 'underline') {
        fail('show() 的 mode 只能是 "box" 或 "underline"');
      }
      var text = arg.text === undefined || arg.text === null ? null : String(arg.text);
      if (forced === 'underline') {
        if (!text) fail('下划线模式需要非空的 text');
        return { el: arg.el, mode: 'underline', text: text };
      }
      if (forced === 'box') return { el: arg.el, mode: 'box', text: null };
      if (text === null) return { el: arg.el, mode: 'box', text: null };
      if (text === '') fail('text 不能是空字符串');
      return { el: arg.el, mode: 'underline', text: text };
    }
    fail('show() 需要目标元素或 { el, text, mode }');
  }

  /* ---------------- 实例 ---------------- */

  function mount(options) {
    if (!DOC || !DOC.body) fail('当前环境没有 document.body，无法挂载');
    options = options || {};

    var motionMode = options.motion === 'never' || options.motion === 'always' ? options.motion : 'auto';
    var entranceMode = options.entrance === 'soft' ? 'soft' : 'default';
    var observeEnabled = options.observe !== false;
    var geometryProvider = normalizeGeometry(options.geometry);
    var reduceMq = null;
    try {
      reduceMq = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
    } catch (err) {
      reduceMq = null;
    }

    var root = h('div', 'nx-focus');
    root.setAttribute('data-nx-component', 'focus');
    root.setAttribute('data-nx-state', 'idle');
    root.setAttribute('aria-hidden', 'true');
    if (typeof options.zIndex === 'number' && isFinite(options.zIndex)) {
      root.style.zIndex = String(Math.round(options.zIndex));
    }
    DOC.body.appendChild(root);

    var destroyed = false;
    var visible = false;
    var hiding = false;
    var spec = null;       // 当前目标描述 { el, mode, text }
    var targetEl = null;
    var mode = null;
    var text = null;
    var boxEl = null;
    var ruleNodes = [];
    var staleNodes = [];
    var animations = [];
    var lastGeo = null;
    var rafId = 0;
    var followId = 0;
    var currentArrival = null;
    var currentHide = null;
    var hideWaiters = [];
    var listenersOn = false;
    var resizeObserver = null;
    var mutationObserver = null;
    var reduceListening = false;

    var view = { el: root, version: VERSION };

    /* ---------- 动效能力与登记 ---------- */

    function canAnimate() {
      if (motionMode === 'never') return false;
      if (motionMode === 'always') return true;
      return !(reduceMq && reduceMq.matches);
    }

    function removeAnim(anim) {
      var i = animations.indexOf(anim);
      if (i >= 0) animations.splice(i, 1);
    }

    function deferred() {
      var value = { resolved: false, resolve: null, promise: null };
      value.promise = new Promise(function (resolve) { value.resolve = resolve; });
      return value;
    }

    function resolveDeferred(value, result) {
      if (!value || value.resolved) return;
      value.resolved = true;
      value.resolve(result);
    }

    function resolveArrival(value, result) {
      if (currentArrival !== value) return;
      resolveDeferred(value, result);
      if (result) startFollow();
      else stopFollow();
    }

    function resolveHidden(value, result) {
      if (currentHide !== value) return;
      resolveDeferred(value, result);
      currentHide = null;
    }

    /* 淡出进行中再次 hide() 时，后到的 whenHidden() 也应在同一次实际收尾时完成。 */
    function resolveHideWaiters(result) {
      var waiters = hideWaiters;
      hideWaiters = [];
      for (var i = 0; i < waiters.length; i += 1) resolveDeferred(waiters[i], result);
    }

    function play(node, frames, timing, onDone) {
      if (!node || typeof node.animate !== 'function') return null;
      var anim;
      try {
        anim = node.animate(frames, timing);
      } catch (err) {
        return null;
      }
      animations.push(anim);
      anim.finished.then(function () {
        removeAnim(anim);
        if (!destroyed && typeof onDone === 'function') onDone();
      }).catch(function () { /* 被取消：不回调 */ });
      return anim;
    }

    function cancelAnimations() {
      if (!animations.length) return;
      var list = animations.slice();
      animations.length = 0;
      for (var i = 0; i < list.length; i++) {
        try { list[i].cancel(); } catch (err) { /* 已结束 */ }
      }
    }

    function addStale(node) {
      if (node) staleNodes.push(node);
    }

    function purgeStale() {
      for (var i = 0; i < staleNodes.length; i++) removeNode(staleNodes[i]);
      staleNodes.length = 0;
    }

    function fadeOne(node, duration) {
      if (!node || !node.parentNode) return;
      addStale(node);
      play(node, [{ opacity: '1' }, { opacity: '0' }], { duration: duration, easing: EASE_OUT }, function () {
        var i = staleNodes.indexOf(node);
        if (i >= 0) staleNodes.splice(i, 1);
        removeNode(node);
      });
    }

    function fadeOut(nodes, duration) {
      for (var i = 0; i < nodes.length; i++) fadeOne(nodes[i], duration);
    }

    /* 取消进行中的动画并清掉正在淡出的旧节点；基础样式已经是终态 */
    function settleMotion() {
      cancelAnimations();
      purgeStale();
    }

    /* ---------- 标记节点 ---------- */

    function setBoxGeometry(box, geo) {
      box.style.left = px(geo.left);
      box.style.top = px(geo.top);
      box.style.width = px(Math.max(0, geo.width));
      box.style.height = px(Math.max(0, geo.height));
    }

    function setRuleGeometry(node, seg) {
      node.style.left = px(seg.left);
      node.style.top = px(seg.top);
      node.style.width = px(Math.max(0, seg.width));
    }

    function ensureBox() {
      if (!boxEl) {
        boxEl = h('div', 'nx-focus__box');
        root.appendChild(boxEl);
      }
      return boxEl;
    }

    function removeBox() {
      removeNode(boxEl);
      boxEl = null;
    }

    function removeRules() {
      for (var i = 0; i < ruleNodes.length; i++) removeNode(ruleNodes[i]);
      ruleNodes = [];
    }

    function createRules(rects) {
      var nodes = [];
      for (var i = 0; i < rects.length; i++) {
        var node = h('div', 'nx-focus__rule');
        setRuleGeometry(node, rects[i]);
        root.appendChild(node);
        nodes.push(node);
      }
      return nodes;
    }

    function syncRules(rects) {
      if (ruleNodes.length !== rects.length) {
        removeRules();
        ruleNodes = createRules(rects);
        return;
      }
      for (var i = 0; i < ruleNodes.length; i++) setRuleGeometry(ruleNodes[i], rects[i]);
    }

    function clearMarker() {
      removeBox();
      removeRules();
    }

    /* 无动画地落到测量结果（refresh / 重复 show / 布局跟随） */
    function applyGeoNoMotion(geo) {
      if (geo.kind === 'box') {
        if (ruleNodes.length) removeRules();
        setBoxGeometry(ensureBox(), geo.box);
      } else {
        removeBox();
        syncRules(geo.rects);
      }
      lastGeo = geo;
    }

    function drawRules(nodes, baseDelay) {
      for (var i = 0; i < nodes.length; i++) {
        play(nodes[i], [
          { clipPath: 'inset(0 100% 0 0)' },
          { clipPath: 'inset(0 0 0 0)' }
        ], {
          duration: G.showRuleDur,
          delay: (baseDelay || 0) + i * G.ruleStagger,
          easing: EASE_OUT
        });
      }
    }

    function firstShowAnim(box) {
      if (entranceMode === 'soft') {
        play(box, [
          { opacity: '0', transform: 'translateY(5px) scale(.93)' },
          { opacity: '1', transform: 'translateY(0) scale(1)' }
        ], { duration: G.showBoxSoftDur, easing: 'cubic-bezier(.2,.8,.3,1)' });
        return;
      }
      play(box, [
        { opacity: '0', transform: 'scale(.97)' },
        { opacity: '1', transform: 'scale(1)' }
      ], { duration: G.showBoxDur, easing: EASE_OUT });
    }

    /* ---------- 三种出现方式 ---------- */

    function showFirst(geo, animate) {
      if (geo.kind === 'box') {
        var box = ensureBox();
        setBoxGeometry(box, geo.box);
        if (animate) firstShowAnim(box);
        return;
      }
      ruleNodes = createRules(geo.rects);
      if (animate) drawRules(ruleNodes, 0);
    }

    function showMigrate(geo, animate) {
      var old = lastGeo;
      if (geo.kind === 'box') {
        var box = ensureBox();
        setBoxGeometry(box, geo.box);
        if (!animate || !old || old.kind !== 'box') return;
        play(box, [
          { left: px(old.box.left), top: px(old.box.top), width: px(old.box.width), height: px(old.box.height) },
          { left: px(geo.box.left), top: px(geo.box.top), width: px(geo.box.width), height: px(geo.box.height) }
        ], { duration: G.migrateBoxDur, easing: EASE });
        return;
      }
      var oldRules = ruleNodes;
      ruleNodes = createRules(geo.rects);
      if (!animate) {
        for (var i = 0; i < oldRules.length; i++) removeNode(oldRules[i]);
        return;
      }
      if (oldRules.length) fadeOut(oldRules, G.migrateOutDur);
      drawRules(ruleNodes, 0);
    }

    function showCrossfade(geo, animate) {
      var oldNodes = [];
      var i;
      if (boxEl) {
        oldNodes.push(boxEl);
        boxEl = null;
      }
      for (i = 0; i < ruleNodes.length; i++) oldNodes.push(ruleNodes[i]);
      ruleNodes = [];
      if (animate) {
        fadeOut(oldNodes, G.migrateOutDur);
      } else {
        for (i = 0; i < oldNodes.length; i++) removeNode(oldNodes[i]);
      }
      if (geo.kind === 'box') {
        var box = ensureBox();
        setBoxGeometry(box, geo.box);
        if (animate) firstShowAnim(box);
      } else {
        ruleNodes = createRules(geo.rects);
        if (animate) drawRules(ruleNodes, 0);
      }
    }

    /* ---------- 测量调度 ---------- */

    /* 焦点框到达后持续跟随目标：目标在布局/内容动画中移动或改尺寸时，
     * 直接按真实 rect 更新，避免观察器离散重测造成跳格。 */
    function stopFollow() {
      if (followId) {
        try { global.cancelAnimationFrame(followId); } catch (err) { /* ignore */ }
        followId = 0;
      }
    }

    function startFollow() {
      if (followId || destroyed || !visible || hiding || !observeEnabled) return;
      followId = global.requestAnimationFrame(followTick);
    }

    function followTick() {
      followId = 0;
      if (destroyed || !visible || hiding || !spec) return;
      if (!isConnected(targetEl)) {
        autoHide();
        return;
      }
      if (!animations.length) {
        var geo;
        try {
          geo = measureSpec(spec, geometryProvider);
        } catch (err) {
          autoHide();
          return;
        }
        if (!geoSame(geo, lastGeo)) applyGeoNoMotion(geo);
      }
      startFollow();
    }

    function scheduleMeasure() {
      if (destroyed || rafId || !visible) return;
      rafId = global.requestAnimationFrame(function () {
        rafId = 0;
        if (destroyed || !visible) return;
        measureNow();
      });
    }

    function cancelFrame() {
      if (rafId) {
        try { global.cancelAnimationFrame(rafId); } catch (err) { /* ignore */ }
        rafId = 0;
      }
    }

    /* 滚动 / 尺寸变化 / DOM 变化的统一重定位：不播动画；几何变了就取消进行中的动画落终态 */
    function measureNow() {
      if (destroyed || !visible || !spec) return;
      if (!isConnected(targetEl)) {
        autoHide();
        return;
      }
      /* 已显示时由 rAF 跟随；不要用观察器的离散重测中断焦点动画。 */
      if (followId) return;
      var geo;
      try {
        geo = measureSpec(spec, geometryProvider);
      } catch (err) {
        autoHide();
        return;
      }
      if (geoSame(geo, lastGeo)) return;
      settleMotion();
      applyGeoNoMotion(geo);
    }

    /* ---------- 监听器与观察器（仅显示期间存在） ---------- */

    function attach() {
      if (destroyed) return;
      if (!observeEnabled) {
        /* 受控模式：不挂滚动/尺寸/DOM 自动重测；refresh() 仍由宿主手动调用。 */
        detach();
        return;
      }
      if (!listenersOn) {
        try {
          global.addEventListener('scroll', onViewportEvent, { capture: true, passive: true });
          global.addEventListener('resize', onViewportEvent, { passive: true });
          listenersOn = true;
        } catch (err) {
          listenersOn = false;
        }
      }
      if (typeof global.ResizeObserver === 'function') {
        if (!resizeObserver) resizeObserver = new global.ResizeObserver(onViewportEvent);
        try {
          resizeObserver.disconnect();
          resizeObserver.observe(targetEl);
        } catch (err) { /* ignore */ }
      }
      if (typeof global.MutationObserver === 'function' && DOC.body) {
        if (!mutationObserver) mutationObserver = new global.MutationObserver(onViewportEvent);
        try {
          mutationObserver.disconnect();
          mutationObserver.observe(DOC.body, { childList: true, subtree: true, characterData: true });
        } catch (err) { /* ignore */ }
      }
    }

    function detach() {
      stopFollow();
      if (listenersOn) {
        try {
          global.removeEventListener('scroll', onViewportEvent, true);
          global.removeEventListener('resize', onViewportEvent);
        } catch (err) { /* ignore */ }
        listenersOn = false;
      }
      if (resizeObserver) {
        try { resizeObserver.disconnect(); } catch (err) { /* ignore */ }
      }
      if (mutationObserver) {
        try { mutationObserver.disconnect(); } catch (err) { /* ignore */ }
      }
      cancelFrame();
    }

    function onViewportEvent() {
      if (!observeEnabled) return;
      scheduleMeasure();
    }

    function onReduceChange() {
      if (destroyed || canAnimate()) return;
      if (hiding) {
        cancelAnimations();
        purgeStale();
        finishHide();
        return;
      }
      if (visible) settleMotion();
    }

    /* ---------- 状态收尾 ---------- */

    function resetStateAttributes() {
      root.setAttribute('data-nx-state', 'idle');
      root.removeAttribute('data-nx-mode');
    }

    function resetTarget() {
      targetEl = null;
      spec = null;
      mode = null;
      text = null;
      lastGeo = null;
    }

    function finishHide() {
      if (destroyed) return;
      var hidden = currentHide;
      hiding = false;
      cancelAnimations();
      purgeStale();
      clearMarker();
      resetStateAttributes();
      resetTarget();
      stopFollow();
      if (hidden) resolveHidden(hidden, true);
      resolveHideWaiters(true);
    }

    function autoHide() {
      if (destroyed) return;
      if (!visible && !hiding) return;
      visible = false;
      hiding = false;
      detach();
      cancelAnimations();
      purgeStale();
      clearMarker();
      resetStateAttributes();
      resetTarget();
      stopFollow();
      if (currentArrival) resolveDeferred(currentArrival, false);
      if (currentHide) resolveHidden(currentHide, true);
      resolveHideWaiters(true);
    }

    /* ---------- 公开方法 ---------- */

    function show(arg) {
      if (destroyed) return view;
      var previousHide = currentHide;
      if (previousHide) resolveHidden(previousHide, true);
      var next = normalizeSpec(arg); // 校验失败先抛，不改内部状态
      if (arg && typeof arg === 'object' && !isEl(arg)) {
        if (Object.prototype.hasOwnProperty.call(arg, 'observe')) observeEnabled = arg.observe !== false;
        if (Object.prototype.hasOwnProperty.call(arg, 'geometry')) geometryProvider = normalizeGeometry(arg.geometry);
      }
      var geo = measureSpec(next, geometryProvider);   // 找不到文本同样先抛
      var prevVisible = visible;
      var prevMode = mode;
      var same = prevVisible && !!spec && targetEl === next.el &&
        mode === next.mode && (text || '') === (next.text || '');
      var animate = canAnimate();
      var arrival = deferred();
      var previousArrival = currentArrival;
      currentArrival = arrival;
      if (previousArrival && !previousArrival.resolved) resolveDeferred(previousArrival, false);

      settleMotion();
      hiding = false;
      if (!prevVisible) clearMarker();
      resolveHideWaiters(true);

      targetEl = next.el;
      mode = next.mode;
      text = next.text;
      spec = next;
      visible = true;
      root.setAttribute('data-nx-state', 'shown');
      root.setAttribute('data-nx-mode', mode);

      if (same) {
        applyGeoNoMotion(geo);
      } else if (!prevVisible) {
        showFirst(geo, animate);
        lastGeo = geo;
      } else if (prevMode === mode) {
        showMigrate(geo, animate);
        lastGeo = geo;
      } else {
        showCrossfade(geo, animate);
        lastGeo = geo;
      }
      var created = animations.slice();
      if (!animate || !created.length) {
        resolveArrival(arrival, true);
      } else {
        var remaining = created.length;
        var done = function () {
          remaining -= 1;
          if (remaining <= 0) resolveArrival(arrival, true);
        };
        for (var ai = 0; ai < created.length; ai += 1) {
          created[ai].finished.then(done, done);
        }
      }
      attach();
      startFollow();
      return view;
    }

    function hide() {
      var hideToken = deferred();
      if (destroyed) {
        resolveDeferred(hideToken, true);
        return view;
      }
      if (hiding) {
        hideWaiters.push(hideToken);
        return view;
      }
      var previousHide = currentHide;
      if (previousHide) resolveHidden(previousHide, true);
      currentHide = hideToken;
      if (!visible) {
        resolveHidden(hideToken, true);
        return view;
      }
      resolveArrival(currentArrival, false);
      visible = false;
      detach();
      settleMotion();
      var nodes = [];
      if (boxEl) nodes.push(boxEl);
      for (var i = 0; i < ruleNodes.length; i++) nodes.push(ruleNodes[i]);
      if (!nodes.length || !canAnimate()) {
        finishHide();
        return view;
      }
      hiding = true;
      var remaining = nodes.length;
      var done = function () {
        remaining -= 1;
        if (remaining <= 0) finishHide();
      };
      for (var j = 0; j < nodes.length; j++) {
        play(nodes[j], [{ opacity: '1' }, { opacity: '0' }], { duration: G.hideDur, easing: EASE_OUT }, done);
      }
      return view;
    }

    function refresh() {
      if (destroyed || !visible || !spec) return view;
      if (!isConnected(targetEl)) {
        autoHide();
        return view;
      }
      settleMotion();
      var geo;
      try {
        geo = measureSpec(spec, geometryProvider);
      } catch (err) {
        autoHide();
        return view;
      }
      applyGeoNoMotion(geo);
      return view;
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      visible = false;
      hiding = false;
      detach();
      cancelAnimations();
      purgeStale();
      clearMarker();
      stopFollow();
      if (currentArrival) resolveDeferred(currentArrival, false);
      if (currentHide) resolveHidden(currentHide, true);
      resolveHideWaiters(true);
      if (reduceListening && reduceMq) {
        try {
          if (typeof reduceMq.removeEventListener === 'function') reduceMq.removeEventListener('change', onReduceChange);
          else if (typeof reduceMq.removeListener === 'function') reduceMq.removeListener(onReduceChange);
        } catch (err) { /* ignore */ }
        reduceListening = false;
      }
      removeNode(root);
      resetTarget();
    }

    view.show = show;
    view.hide = hide;
    view.refresh = refresh;
    view.destroy = destroy;
    view.whenArrived = function () {
      return currentArrival ? currentArrival.promise : Promise.resolve(visible);
    };
    view.whenHidden = function () {
      return currentHide ? currentHide.promise : Promise.resolve(!visible);
    };
    Object.defineProperty(view, 'visible', { get: function () { return visible; }, enumerable: true });
    Object.defineProperty(view, 'target', { get: function () { return targetEl; }, enumerable: true });
    Object.defineProperty(view, 'mode', { get: function () { return mode; }, enumerable: true });
    Object.defineProperty(view, 'text', { get: function () { return text; }, enumerable: true });

    if (reduceMq) {
      try {
        if (typeof reduceMq.addEventListener === 'function') {
          reduceMq.addEventListener('change', onReduceChange);
          reduceListening = true;
        } else if (typeof reduceMq.addListener === 'function') {
          reduceMq.addListener(onReduceChange);
          reduceListening = true;
        }
      } catch (err) { /* ignore */ }
    }

    return view;
  }

  /* ---------------- 注册 ---------------- */

  if (!global.NoteExpr) global.NoteExpr = {};
  global.NoteExpr.Focus = {
    version: VERSION,
    mount: mount
  };
})(typeof window !== 'undefined' ? window : this);