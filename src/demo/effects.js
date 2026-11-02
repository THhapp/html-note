/* NoteDemo 私有效果工具 — WAAPI 句柄、局部值交换与连续 cue 差分。
 * Scope: window.NoteDemoInternals.effects
 * Depends on: NoteDemoInternals.definition（只读取已冻结的公共 timing 默认表）。
 * 私有执行文件，不暴露给笔记作者；scene 统一创建/启动/取消句柄，Adapter 只提交 EffectSpec。
 * 经典脚本，无模块 / 无网络 / 无 eval。 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var hasOwn = Object.prototype.hasOwnProperty;
  var CUE_PROPS = {
    backgroundColor: true,
    borderTopColor: true,
    borderRightColor: true,
    borderBottomColor: true,
    borderLeftColor: true,
    outlineColor: true,
    outlineWidth: true,
    outlineOffset: true,
    color: true,
    opacity: true,
    boxShadow: true
  };

  function own(object, key) {
    return object != null && hasOwn.call(Object(object), key);
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function isElement(value) {
    return !!value && value.nodeType === 1;
  }

  function messageOf(error) {
    if (error == null) return '';
    if (typeof error === 'string') return error;
    if (error.message != null) return String(error.message);
    return String(error);
  }

  function noop() {}

  function makeError(message, details) {
    var error = new Error(message);
    error.name = 'NoteDemoEffectError';
    if (details && typeof details === 'object') error.details = details;
    return error;
  }

  function effectLabel(meta) {
    var details = isObject(meta) ? meta : {};
    var parts = [];
    if (details.frameId != null) parts.push('Frame "' + String(details.frameId) + '"');
    if (details.bindingId != null) parts.push('Binding "' + String(details.bindingId) + '"');
    if (details.effect != null) parts.push('effect "' + String(details.effect) + '"');
    return parts.length ? '（' + parts.join(' / ') + '）' : '';
  }

  function fail(message, meta, cause) {
    var error = makeError('scene 效果失败' + effectLabel(meta) + '：' + message, meta);
    if (cause !== undefined) error.cause = cause;
    return error;
  }

  /* 公共 timing 默认表只维护在 definition 一处；缺少 definition 时给出加载顺序错误，
   * 不再静默回退到第二份默认值（两份默认值会随维护漂移）。 */
  function timingDefaults() {
    var definition = Internals.definition;
    if (!definition || !isObject(definition.timingDefaults)) {
      throw new Error('NoteDemo 核心加载顺序错误：effects 需要先加载 NoteDemoInternals.definition（src/demo/definition.js）。');
    }
    return definition.timingDefaults;
  }

  function mergeTiming(profile, sceneTiming, memberTiming) {
    var output = {};
    var defaults = timingDefaults();
    Object.keys(defaults).forEach(function (key) { output[key] = defaults[key]; });
    [profile, sceneTiming, memberTiming].forEach(function (input) {
      if (!isObject(input)) return;
      Object.keys(input).forEach(function (key) {
        if (own(defaults, key)) output[key] = input[key];
      });
    });
    return output;
  }

  function timeValue(settings, key, fallback) {
    if (settings && typeof settings[key] === 'number' && isFinite(settings[key]) && settings[key] >= 0) {
      return settings[key];
    }
    return fallback;
  }

  function createHandle(element, keyframes, options, meta) {
    var settings = isObject(options) ? options : {};
    if (!isElement(element)) throw fail('目标不是有效元素。', meta);
    if (typeof element.animate !== 'function') throw fail('目标元素不支持 Web Animations。', meta);
    if (keyframes == null) throw fail('缺少关键帧。', meta);
    var animation;
    try {
      animation = element.animate(keyframes, {
        duration: timeValue(settings, 'duration', timingDefaults().enterDuration),
        delay: timeValue(settings, 'delay', 0),
        easing: typeof settings.easing === 'string' && settings.easing !== ''
          ? settings.easing : timingDefaults().easing,
        fill: settings.fill == null ? 'none' : settings.fill
      });
    } catch (error) {
      throw fail('创建动画失败：' + messageOf(error), meta, error);
    }
    if (!animation || typeof animation.play !== 'function') {
      throw fail('浏览器没有返回可用 Animation 句柄。', meta);
    }
    if (settings.paused === true) {
      try {
        animation.pause();
        animation.currentTime = 0;
      } catch (error) {
        try { animation.cancel(); } catch (cancelError) { /* 继续抛出原始错误 */ }
        throw fail('预置暂停起点失败：' + messageOf(error), meta, error);
      }
    }

    var settled = false;
    var cancelRequested = false;
    var resolveFinished;
    var rejectFinished;
    var finished = new Promise(function (resolve, reject) {
      resolveFinished = resolve;
      rejectFinished = reject;
    });
    /* 内部挂一个消费用的 catch；调用方仍拿到原始 Promise。 */
    finished.catch(noop);

    function settleOk() {
      if (settled) return;
      settled = true;
      resolveFinished(true);
    }

    function settleCancelled() {
      if (settled) return;
      settled = true;
      resolveFinished(false);
    }

    function settleFailed(error) {
      if (settled) return;
      settled = true;
      rejectFinished(error);
    }

    if (animation.finished && typeof animation.finished.then === 'function') {
      animation.finished.then(function () {
        if (cancelRequested) settleCancelled();
        else settleOk();
      }, function (error) {
        if (cancelRequested) settleCancelled();
        else settleFailed(fail('动画被意外取消或失效：' + messageOf(error), meta, error));
      });
    } else {
      animation.onfinish = function () { settleOk(); };
      animation.oncancel = function () {
        if (cancelRequested) settleCancelled();
        else settleFailed(fail('动画被意外取消。', meta));
      };
    }

    return {
      el: element,
      animation: animation,
      finished: finished,
      meta: isObject(meta) ? meta : {},
      play: function () {
        if (settled || cancelRequested) return;
        try {
          if (animation.playState === 'paused' || animation.playState === 'idle') animation.play();
        } catch (error) {
          settleFailed(fail('启动动画失败：' + messageOf(error), meta, error));
          throw fail('启动动画失败：' + messageOf(error), meta, error);
        }
      },
      cancel: function () {
        if (settled) {
          try { if (animation.playState !== 'idle') animation.cancel(); } catch (error) { /* 已失效 */ }
          return;
        }
        cancelRequested = true;
        try {
          if (animation.playState !== 'idle') animation.cancel();
        } catch (error) {
          settleFailed(fail('取消动画失败：' + messageOf(error), meta, error));
          return;
        }
        settleCancelled();
      }
    };
  }



  /* ---------------- 来源可见性保持（视觉交接） ---------------- */

  function isConnectedElement(element) {
    if (!element) return false;
    if (typeof element.isConnected === 'boolean') return element.isConnected;
    return !!(global.document && global.document.documentElement && global.document.documentElement.contains(element));
  }

  function computedVisibility(element) {
    var fallback = { opacity: 1, visibility: 'visible', display: '' };
    if (!element || !global.getComputedStyle) return fallback;
    var computed;
    try { computed = global.getComputedStyle(element); } catch (error) { return fallback; }
    if (!computed) return fallback;
    return {
      opacity: computed.opacity,
      visibility: computed.visibility,
      display: computed.display
    };
  }

  function visibilityHidden(state) {
    if (!state) return false;
    var opacity = state.opacity === '' || state.opacity == null ? 1 : Number(state.opacity);
    if (!isFinite(opacity)) opacity = 1;
    return state.visibility === 'hidden' || state.visibility === 'collapse' ||
      state.display === 'none' || !(opacity > 0.001);
  }

  /* commit 前捕获来源元素的计算可见状态与调用前内联值；返回幂等 token。 */
  function captureVisibility(elements) {
    var token = { items: [], held: false, released: false };
    var seen = [];
    (Array.isArray(elements) ? elements : []).forEach(function (element) {
      if (!isElement(element) || seen.indexOf(element) >= 0) return;
      seen.push(element);
      var style = element.style || {};
      token.items.push({
        el: element,
        connected: isConnectedElement(element),
        source: computedVisibility(element),
        inline: {
          opacity: style.opacity,
          visibility: style.visibility,
          display: style.display
        }
      });
    });
    return token;
  }

  /* commit 后调用：元素仍连接、来源本来可见、目标状态压成不可见时，用内联恢复来源可见状态。
   * 不克隆/不替换 DOM；已持有/已释放/断开元素幂等跳过。 */
  function holdVisibility(token) {
    if (!token || token.released || token.held) return token;
    token.held = true;
    for (var i = 0; i < token.items.length; i += 1) {
      var item = token.items[i];
      var element = item.el;
      if (!element || !isConnectedElement(element)) continue;
      if (visibilityHidden(item.source)) continue;
      if (!visibilityHidden(computedVisibility(element))) continue;
      try {
        element.style.opacity = item.source.opacity === '' || item.source.opacity == null ? '1' : item.source.opacity;
        if (item.source.visibility) element.style.visibility = item.source.visibility;
        if (item.source.display) element.style.display = item.source.display;
      } catch (error) { /* 单个元素失败不阻断交接 */ }
    }
    return token;
  }

  /* 取消/完成/首次内容轨道启动时调用：恢复调用前的内联值（幂等、可重复）。 */
  function releaseVisibility(token) {
    if (!token || token.released) return token;
    token.released = true;
    for (var i = 0; i < token.items.length; i += 1) {
      var item = token.items[i];
      var element = item.el;
      if (!element || !element.style) continue;
      try {
        element.style.opacity = item.inline.opacity == null ? '' : item.inline.opacity;
        element.style.visibility = item.inline.visibility == null ? '' : item.inline.visibility;
        element.style.display = item.inline.display == null ? '' : item.inline.display;
      } catch (error) { /* 单个元素失败不阻断清理 */ }
    }
    token.items = [];
    return token;
  }

  /* ---------------- 进度效果（rAF 句柄，与 WAAPI 句柄同语义） ---------------- */

  function linearEase(progress) { return progress; }

  function cubicBezierEase(x1, y1, x2, y2) {
    function sample(t, a1, a2) {
      var c = 3 * a1;
      var b = 3 * (a2 - a1) - c;
      var a = 1 - c - b;
      return ((a * t + b) * t + c) * t;
    }
    function sampleDerivative(t, a1, a2) {
      var c = 3 * a1;
      var b = 3 * (a2 - a1) - c;
      var a = 1 - c - b;
      return (3 * a * t + 2 * b) * t + c;
    }
    function solveX(x) {
      var t = x;
      for (var i = 0; i < 8; i += 1) {
        var error = sample(t, x1, x2) - x;
        if (Math.abs(error) < 1e-6) return t;
        var derivative = sampleDerivative(t, x1, x2);
        if (Math.abs(derivative) < 1e-6) break;
        t -= error / derivative;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
      }
      var low = 0;
      var high = 1;
      t = x;
      for (var b = 0; b < 20; b += 1) {
        var value = sample(t, x1, x2);
        if (Math.abs(value - x) < 1e-6) return t;
        if (value < x) low = t;
        else high = t;
        t = (low + high) / 2;
      }
      return t;
    }
    return function (progress) {
      if (!(progress > 0)) return 0;
      if (progress >= 1) return 1;
      return sample(solveX(progress), y1, y2);
    };
  }

  var EASING_KEYWORDS = {
    linear: [0, 0, 1, 1],
    ease: [0.25, 0.1, 0.25, 1],
    'ease-in': [0.42, 0, 1, 1],
    'ease-out': [0, 0, 0.58, 1],
    'ease-in-out': [0.42, 0, 0.58, 1]
  };

  function easingFunction(easing) {
    if (easing == null || easing === '') return linearEase;
    var value = String(easing).trim();
    if (own(EASING_KEYWORDS, value)) {
      var keyword = EASING_KEYWORDS[value];
      return cubicBezierEase(keyword[0], keyword[1], keyword[2], keyword[3]);
    }
    var match = /^cubic-bezier\(([^)]*)\)$/.exec(value);
    if (match) {
      var parts = match[1].split(',').map(function (part) { return Number(part.trim()); });
      if (parts.length === 4 && parts.every(function (part) { return isFinite(part); })) {
        return cubicBezierEase(parts[0], parts[1], parts[2], parts[3]);
      }
    }
    /* steps()/spring 等非连续缓动不在这里展开；进度效果回退线性，实际视觉由 update 自行处理。 */
    return linearEase;
  }

  function nowMs() {
    if (global.performance && typeof global.performance.now === 'function') return global.performance.now();
    return Date.now();
  }

  function rafRequest(callback) {
    if (typeof global.requestAnimationFrame === 'function') return global.requestAnimationFrame(callback);
    return global.setTimeout(callback, 16);
  }

  function rafCancel(id) {
    if (typeof global.cancelAnimationFrame === 'function') {
      try { global.cancelAnimationFrame(id); } catch (error) { /* ignore */ }
    } else {
      try { global.clearTimeout(id); } catch (error) { /* ignore */ }
    }
  }

  /* EffectSpec.type === 'progress'：不在 WAAPI 上伪造进度，用 rAF 驱动 update(p)；
   * 句柄语义与 createHandle 一致（finished resolve true/false、reject 失败、cancel 幂等）。 */
  function createProgressHandle(spec, meta) {
    var settings = isObject(spec) ? spec : {};
    if (typeof settings.update !== 'function') throw fail('progress 效果缺少 update(progress) 函数。', meta);
    var duration = settings.duration;
    if (typeof duration !== 'number' || !isFinite(duration) || duration < 0) {
      throw fail('progress 效果 duration 必须是大于等于 0 的有限数字。', meta);
    }
    var delay = typeof settings.delay === 'number' && isFinite(settings.delay) && settings.delay >= 0 ? settings.delay : 0;
    var ease = easingFunction(settings.easing);
    var settled = false;
    var cancelRequested = false;
    var playing = false;
    var rafId = 0;
    var startTime = 0;
    var resolveFinished;
    var rejectFinished;
    var finished = new Promise(function (resolve, reject) {
      resolveFinished = resolve;
      rejectFinished = reject;
    });
    finished.catch(noop);

    function settleOk() {
      if (settled) return;
      settled = true;
      resolveFinished(true);
    }
    function settleCancelled() {
      if (settled) return;
      settled = true;
      resolveFinished(false);
    }
    function settleFailed(error) {
      if (settled) return;
      settled = true;
      rejectFinished(error);
    }
    function tick() {
      rafId = 0;
      if (settled || cancelRequested) return;
      var elapsed = nowMs() - startTime - delay;
      if (elapsed < 0) {
        rafId = rafRequest(tick);
        return;
      }
      var progress = duration <= 0 ? 1 : Math.min(1, elapsed / duration);
      try {
        settings.update(ease(progress));
      } catch (error) {
        settleFailed(fail('progress update 失败：' + messageOf(error), meta, error));
        return;
      }
      if (progress >= 1) {
        settleOk();
        return;
      }
      rafId = rafRequest(tick);
    }

    /* 暂停起点：创建时先画 p=0，保证未启动内容保持来源视觉。 */
    try {
      settings.update(ease(0));
    } catch (error) {
      throw fail('progress 预置 p=0 失败：' + messageOf(error), meta, error);
    }

    return {
      progress: true,
      finished: finished,
      meta: isObject(meta) ? meta : {},
      play: function () {
        if (settled || cancelRequested || playing) return;
        playing = true;
        startTime = nowMs();
        rafId = rafRequest(tick);
      },
      cancel: function () {
        if (settled) return;
        cancelRequested = true;
        if (rafId) rafCancel(rafId);
        rafId = 0;
        settleCancelled();
      }
    };
  }

  function rectOf(element) {
    if (!element || typeof element.getBoundingClientRect !== 'function') return null;
    var rect = element.getBoundingClientRect();
    if (!rect) return null;
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
  }

  function copyTypography(source, target) {
    if (!source || !target || !global.getComputedStyle) return;
    var computed = global.getComputedStyle(source);
    if (!computed) return;
    ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing',
      'textAlign', 'textTransform', 'color', 'whiteSpace', 'wordBreak', 'overflowWrap'].forEach(function (prop) {
      if (computed[prop]) target.style[prop] = computed[prop];
    });
  }

  function stripClone(node) {
    if (!node || !isElement(node)) return node;
    node.removeAttribute('id');
    node.removeAttribute('data-mark');
    node.removeAttribute('aria-label');
    node.setAttribute('aria-hidden', 'true');
    if (node.querySelectorAll) {
      Array.prototype.forEach.call(node.querySelectorAll('[id]'), function (item) { item.removeAttribute('id'); });
      Array.prototype.forEach.call(node.querySelectorAll('[aria-label]'), function (item) { item.setAttribute('aria-hidden', 'true'); });
      Array.prototype.forEach.call(node.querySelectorAll('[tabindex]'), function (item) { item.removeAttribute('tabindex'); });
    }
    return node;
  }

  function captureContent(input) {
    var source = isObject(input) ? input : {};
    var valueEl = source.valueEl;
    var carrier = source.carrier;
    if (!isElement(valueEl) || !isElement(carrier)) return null;
    var valueRect = rectOf(valueEl);
    var carrierRect = rectOf(carrier);
    if (!valueRect || !carrierRect) return null;
    var clone = null;
    try {
      clone = stripClone(valueEl.cloneNode(true));
    } catch (error) {
      clone = null;
    }
    var visible = valueRect.width > 0.5 || valueRect.height > 0.5;
    return {
      valueEl: valueEl,
      carrier: carrier,
      clone: clone,
      visible: visible,
      localBox: {
        left: valueRect.left - carrierRect.left,
        top: valueRect.top - carrierRect.top,
        width: valueRect.width,
        height: valueRect.height
      }
    };
  }

  function ensureLocalCarrier(carrier) {
    if (!isElement(carrier)) return noop;
    var previous = { position: carrier.style.position || '' };
    if (global.getComputedStyle) {
      try {
        if (global.getComputedStyle(carrier).position === 'static') carrier.style.position = 'relative';
      } catch (error) { /* 保持原样 */ }
    }
    return function restore() {
      try { carrier.style.position = previous.position; } catch (error) { /* ignore */ }
    };
  }

  function createGhost(input) {
    var source = isObject(input) ? input : {};
    var target = isObject(source.target) ? source.target : {};
    var carrier = target.carrier || source.carrier;
    if (!isElement(carrier) || !source.source || !source.source.clone || typeof global.document === 'undefined') return null;
    var ghost = global.document.createElement('span');
    var className = source.className || 'note-demo-value-ghost';
    ghost.className = className;
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('data-value-ghost', 'true');
    ghost.style.position = 'absolute';
    ghost.style.left = source.source.localBox.left + 'px';
    ghost.style.top = source.source.localBox.top + 'px';
    ghost.style.width = source.source.localBox.width + 'px';
    ghost.style.height = source.source.localBox.height + 'px';
    ghost.style.boxSizing = 'border-box';
    ghost.style.display = source.display || 'flex';
    ghost.style.alignItems = source.alignItems || 'center';
    ghost.style.justifyContent = source.justifyContent || 'center';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = source.zIndex || '2';
    copyTypography(source.source.valueEl, ghost);
    try {
      ghost.appendChild(source.source.clone);
    } catch (error) {
      return null;
    }
    var restoreCarrier = ensureLocalCarrier(carrier);
    try {
      carrier.appendChild(ghost);
    } catch (error) {
      restoreCarrier();
      return null;
    }
    return {
      el: ghost,
      cleanup: function () {
        try { if (ghost.parentNode) ghost.parentNode.removeChild(ghost); } catch (error) { /* ignore */ }
        restoreCarrier();
      }
    };
  }

  function planValueSwap(input) {
    var options = isObject(input) ? input : {};
    var source = options.source;
    var target = isObject(options.target) ? options.target : {};
    var timing = isObject(options.timing) ? options.timing : mergeTiming();
    var recipe = isObject(options.recipe) ? options.recipe : {};
    var specs = [];
    var cleanup = noop;
    if (source && source.visible && recipe.ghostClass && target.carrier) {
      var ghost = createGhost({
        source: source,
        target: target,
        className: recipe.ghostClass,
        display: recipe.ghostDisplay,
        alignItems: recipe.ghostAlignItems,
        justifyContent: recipe.ghostJustifyContent,
        zIndex: recipe.ghostZIndex
      });
      if (ghost) {
        cleanup = ghost.cleanup;
        specs.push({
          el: ghost.el,
          keyframes: recipe.ghostKeyframes || [
            { opacity: '1', transform: 'translateY(0)' },
            { opacity: '1', transform: 'translateY(0)', offset: 0.5 },
            { opacity: '0', transform: 'translateY(-8px)' }
          ],
          options: {
            duration: timeValue(recipe, 'ghostDuration', timing.valueSwapDuration),
            delay: timeValue(recipe, 'ghostDelay', timing.valueSwapDelay),
            easing: recipe.ghostEasing || timing.easing,
            fill: 'backwards'
          },
          cleanupEl: ghost.el,
          gate: 'finish'
        });
      }
    }
    if (isElement(target.valueEl) && recipe.targetKeyframes) {
      specs.push({
        el: target.valueEl,
        keyframes: recipe.targetKeyframes,
        options: {
          duration: timeValue(recipe, 'targetDuration', timing.valueSwapDuration),
          delay: timeValue(recipe, 'targetDelay', timing.valueSwapDelay),
          easing: recipe.targetEasing || 'linear',
          fill: 'backwards'
        },
        gate: recipe.targetGate === 'finish' ? 'finish' : 'ready'
      });
    }
    return { specs: specs, cleanup: cleanup };
  }

  function captureStyles(targets, properties) {
    var output = {};
    var props = Array.isArray(properties) ? properties : Object.keys(CUE_PROPS);
    (Array.isArray(targets) ? targets : []).forEach(function (target) {
      if (!target || target.id == null || !isElement(target.el)) return;
      var computed = global.getComputedStyle ? global.getComputedStyle(target.el) : null;
      if (!computed) return;
      var style = {};
      props.forEach(function (prop) {
        if (CUE_PROPS[prop] && computed[prop] != null) style[prop] = String(computed[prop]);
      });
      output[String(target.id)] = { el: target.el, style: style };
    });
    return output;
  }

  function planCueChanges(input) {
    var options = isObject(input) ? input : {};
    var source = isObject(options.source) ? options.source : {};
    var targets = Array.isArray(options.targets) ? options.targets : [];
    var timing = isObject(options.timing) ? options.timing : mergeTiming();
    var properties = Array.isArray(options.properties) ? options.properties : Object.keys(CUE_PROPS);
    var specs = [];
    targets.forEach(function (target) {
      if (!target || target.id == null || !isElement(target.el)) return;
      var before = source[String(target.id)];
      if (!before || !isObject(before.style)) return;
      var computed = global.getComputedStyle ? global.getComputedStyle(target.el) : null;
      if (!computed) return;
      var from = {};
      var to = {};
      var changed = false;
      properties.forEach(function (prop) {
        if (!CUE_PROPS[prop]) return;
        var a = before.style[prop] == null ? '' : before.style[prop];
        var b = computed[prop] == null ? '' : String(computed[prop]);
        if (a !== b) {
          from[prop] = a;
          to[prop] = b;
          changed = true;
        }
      });
      if (!changed) return;
      var keyframes = [Object.assign({ offset: 0 }, from), Object.assign({ offset: 1 }, to)];
      specs.push({
        el: target.el,
        keyframes: keyframes,
        options: {
          duration: timeValue(options, 'duration', timing.cueDuration),
          easing: options.easing || timing.easing,
          fill: 'backwards'
        },
        gate: options.gate === 'finish' ? 'finish' : 'ready'
      });
    });
    return specs;
  }

  Internals.effects = {
    mergeTiming: mergeTiming,
    createHandle: createHandle,
    captureVisibility: captureVisibility,
    holdVisibility: holdVisibility,
    releaseVisibility: releaseVisibility,
    captureContent: captureContent,
    createGhost: createGhost,
    planValueSwap: planValueSwap,
    captureStyles: captureStyles,
    planCueChanges: planCueChanges,
    rectOf: rectOf,
    createProgressHandle: createProgressHandle
  };
})(window);
