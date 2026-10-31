/* NoteCore motion — Web Animations orchestration, reduced-motion handling and FLIP.
   Scope: NoteCore.motion. Depends on: tokens.css, core.js.
   Durations default to host-overridable tokens; callers may pass explicit values. */
(function (global) {
  'use strict';

  var NoteCore = global.NoteCore = global.NoteCore || {};
  var active = new WeakMap();
  var mediaQuery = null;
  var mediaAttached = false;
  var changeListeners = [];

  function getMediaQuery() {
    if (mediaQuery) return mediaQuery;
    if (typeof global.matchMedia !== 'function') return null;
    try {
      mediaQuery = global.matchMedia('(prefers-reduced-motion: reduce)');
    } catch (error) {
      mediaQuery = null;
    }
    return mediaQuery;
  }

  function reduced() {
    var query = getMediaQuery();
    return !!(query && query.matches);
  }

  function notifyMotionChange(event) {
    var value = reduced();
    changeListeners.slice().forEach(function (handler) {
      handler(value, event);
    });
  }

  function attachMedia() {
    var query = getMediaQuery();
    if (!query || mediaAttached) return;
    if (typeof query.addEventListener === 'function') query.addEventListener('change', notifyMotionChange);
    else if (typeof query.addListener === 'function') query.addListener(notifyMotionChange);
    mediaAttached = true;
  }

  function detachMedia() {
    var query = getMediaQuery();
    if (!query || !mediaAttached || changeListeners.length) return;
    if (typeof query.removeEventListener === 'function') query.removeEventListener('change', notifyMotionChange);
    else if (typeof query.removeListener === 'function') query.removeListener(notifyMotionChange);
    mediaAttached = false;
  }

  function onChange(handler) {
    if (typeof handler !== 'function') return function () {};
    changeListeners.push(handler);
    attachMedia();
    var activeSubscription = true;
    return function unsubscribe() {
      if (!activeSubscription) return;
      activeSubscription = false;
      var index = changeListeners.indexOf(handler);
      if (index >= 0) changeListeners.splice(index, 1);
      detachMedia();
    };
  }

  function readStyleValue(name) {
    var nodes = [];
    if (document.body) nodes.push(document.body);
    if (document.documentElement) nodes.push(document.documentElement);
    for (var i = 0; i < nodes.length; i += 1) {
      try {
        var value = global.getComputedStyle(nodes[i]).getPropertyValue(name);
        if (value && String(value).trim() !== '') return String(value).trim();
      } catch (error) {}
    }
    return '';
  }

  function readDuration(name, fallback) {
    var value = readStyleValue(name);
    if (!value) return fallback;
    if (/ms$/i.test(value)) {
      var milliseconds = parseFloat(value);
      return isFinite(milliseconds) ? milliseconds : fallback;
    }
    if (/s$/i.test(value)) {
      var seconds = parseFloat(value);
      return isFinite(seconds) ? seconds * 1000 : fallback;
    }
    var number = parseFloat(value);
    return isFinite(number) ? number : fallback;
  }

  function uiDuration() {
    return readDuration('--hnv-motion-ui', 160);
  }

  function explainDuration() {
    return readDuration('--hnv-motion-explain', 460);
  }

  function uiEasing() {
    return readStyleValue('--hnv-motion-ease-ui') || 'ease';
  }

  function reducedController(element) {
    return {
      finished: Promise.resolve(false),
      cancel: function () {},
      el: element
    };
  }

  function applyTerminal(element, keyframes) {
    if (!element || !element.style || keyframes == null) return;
    var finalFrame;
    if (Array.isArray(keyframes)) {
      finalFrame = keyframes.length ? keyframes[keyframes.length - 1] : null;
    } else if (typeof keyframes === 'object') {
      finalFrame = keyframes;
    }
    if (!finalFrame || typeof finalFrame !== 'object') return;
    Object.keys(finalFrame).forEach(function (key) {
      if (key === 'offset' || key === 'easing' || key === 'computedOffset' || key === 'composite') return;
      var value = finalFrame[key];
      if (Array.isArray(value)) value = value.length ? value[value.length - 1] : null;
      if (value == null) return;
      try {
        if (key.slice(0, 2) === '--' || key.indexOf('-') >= 0) {
          element.style.setProperty(key, String(value));
        } else {
          element.style[key] = value;
        }
      } catch (error) {}
    });
  }

  function cancelCurrent(element) {
    var current = active.get(element);
    if (current) {
      current.cancel();
      active.delete(element);
    }
  }

  function timingOptions(settings) {
    var duration = settings.duration == null ? uiDuration() : settings.duration;
    var easing = settings.easing == null ? uiEasing() : settings.easing;
    var delay = settings.delay == null ? 0 : settings.delay;
    var fill = settings.fill == null ? 'both' : settings.fill;
    return {
      duration: duration,
      easing: easing,
      delay: delay,
      fill: fill
    };
  }

  function animateElement(element, keyframes, settings, applyFinal) {
    if (!element || typeof element.animate !== 'function') {
      if (applyFinal) applyTerminal(element, keyframes);
      return reducedController(element);
    }
    var animation;
    try {
      animation = element.animate(keyframes, timingOptions(settings));
    } catch (error) {
      if (applyFinal) applyTerminal(element, keyframes);
      return reducedController(element);
    }
    if (settings.id != null) {
      try { animation.id = String(settings.id); } catch (error) {}
    }

    var settled = false;
    var resolveFinished;
    var finishedPromise = new Promise(function (resolve) {
      resolveFinished = resolve;
    });
    var controller = {
      finished: finishedPromise,
      el: element,
      cancel: function () {
        if (active.get(element) === controller) active.delete(element);
        try {
          if (animation.playState !== 'idle') animation.cancel();
        } catch (error) {}
        settle(false);
      }
    };

    function settle(value) {
      if (settled) return;
      settled = true;
      resolveFinished(value);
    }

    function onFailure() {
      settle(false);
      if (active.get(element) === controller) active.delete(element);
    }

    active.set(element, controller);
    if (animation.finished && typeof animation.finished.then === 'function') {
      animation.finished.then(function () {
        settle(true);
      }, onFailure);
    } else {
      animation.onfinish = function () { settle(true); };
      animation.oncancel = onFailure;
    }
    return controller;
  }

  function play(element, keyframes, options) {
    var settings = options && typeof options === 'object' ? options : {};
    cancelCurrent(element);
    if (reduced()) {
      applyTerminal(element, keyframes);
      return reducedController(element);
    }
    return animateElement(element, keyframes, settings, true);
  }

  function stop(element) {
    cancelCurrent(element);
  }

  function measure(elements) {
    var map = new Map();
    function add(element) {
      if (!element || typeof element.getBoundingClientRect !== 'function') return;
      map.set(element, element.getBoundingClientRect());
    }
    if (!elements) return map;
    if (typeof elements.getBoundingClientRect === 'function') {
      add(elements);
      return map;
    }
    if (typeof elements[Symbol.iterator] === 'function') {
      for (var value of elements) add(value);
      return map;
    }
    if (typeof elements.length === 'number') {
      for (var i = 0; i < elements.length; i += 1) add(elements[i]);
    }
    return map;
  }

  function flip(element, fromRect, options) {
    var settings = options && typeof options === 'object' ? options : {};
    cancelCurrent(element);
    if (reduced() || !element || typeof element.getBoundingClientRect !== 'function') {
      return reducedController(element);
    }
    if (!fromRect) return reducedController(element);
    var target = element.getBoundingClientRect();
    var deltaX = Number(fromRect.left) - target.left;
    var deltaY = Number(fromRect.top) - target.top;
    if (!isFinite(deltaX)) deltaX = 0;
    if (!isFinite(deltaY)) deltaY = 0;
    var scaleX = target.width > 0 && Number(fromRect.width) > 0 ? Number(fromRect.width) / target.width : 1;
    var scaleY = target.height > 0 && Number(fromRect.height) > 0 ? Number(fromRect.height) / target.height : 1;
    if (!isFinite(scaleX)) scaleX = 1;
    if (!isFinite(scaleY)) scaleY = 1;
    var keyframes = [
      {
        transform: 'translate(' + deltaX + 'px, ' + deltaY + 'px) scale(' + scaleX + ', ' + scaleY + ')',
        transformOrigin: '0 0'
      },
      {
        transform: 'translate(0px, 0px) scale(1, 1)',
        transformOrigin: '0 0'
      }
    ];
    return animateElement(element, keyframes, settings, false);
  }

  NoteCore.motion = {
    reduced: reduced,
    onChange: onChange,
    play: play,
    stop: stop,
    measure: measure,
    flip: flip,
    uiDuration: uiDuration,
    explainDuration: explainDuration
  };
})(window);
