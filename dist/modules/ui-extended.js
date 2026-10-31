/*! note-library module: ui-extended
 * dependencies: core, ui-navigation
 * type: JavaScript
 * generated-by: scripts/build.mjs; do-not-edit.
 */

/* ---- source: src/ui/extended-shared.js ---- */
/* NoteUI extended — module-internal shared helpers (not public API).
 * Scope: window.NoteUIInternals.extended.
 * Depends on: NoteCore. Load before the extended component files
 * (order is declared in src/manifests/ui-extended.json).
 * 内部共享文件：仅供 src/ui/extended*.js 使用，不属于公开 API。 */
(function (global) {
  'use strict';

  var hasOwn = Object.prototype.hasOwnProperty;
  var Internals = global.NoteUIInternals = global.NoteUIInternals || {};
  var shared = Internals.extended = Internals.extended || {};

  function core() {
    var value = global.NoteCore;
    if (!value) throw new Error('NoteCore 未加载；NoteUI 扩展组件需要先加载 core。');
    return value;
  }

  function own(object, key) {
    return object != null && hasOwn.call(Object(object), key);
  }

  function text(value) {
    return value == null ? '' : String(value);
  }

  function make(tag, className, content) {
    return core().el(tag, className, content);
  }

  function validateHost(host) {
    return core().validateHost(host);
  }

  function uid(prefix) {
    return core().uid(prefix);
  }

  function isNode(value) {
    return core().isNode(value);
  }

  function append(parent) {
    var C = core();
    for (var i = 1; i < arguments.length; i += 1) C.append(parent, arguments[i]);
    return parent;
  }


  function setHidden(node, hidden) {
    if (!node) return;
    if (hidden) node.setAttribute('hidden', '');
    else node.removeAttribute('hidden');
  }




  function focusNode(node) {
    if (!node || node.isConnected === false || typeof node.focus !== 'function') return false;
    try {
      node.focus({ preventScroll: true });
    } catch (error) {
      try { node.focus(); } catch (ignored) { return false; }
    }
    return document.activeElement === node || node.contains(document.activeElement);
  }

  function isEditableTarget(target) {
    if (!target || typeof target.closest !== 'function') return false;
    return !!target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
  }

  function valueKey(value) {
    if (value === null) return 'null';
    var type = typeof value;
    if (type === 'undefined') return 'undefined';
    if (type === 'string') return 'string:' + value;
    if (type === 'number' || type === 'boolean') return type + ':' + String(value);
    if (type === 'object') {
      if (typeof value.valueOf === 'function') {
        var primitive = value.valueOf();
        if (primitive !== value && (typeof primitive === 'string' ||
            typeof primitive === 'number' || typeof primitive === 'boolean')) {
          return typeof primitive + ':' + String(primitive);
        }
      }
      try { return 'object:' + JSON.stringify(value); } catch (error) { return 'object:' + String(value); }
    }
    return type + ':' + String(value);
  }

  function signatureOf(values) {
    return values.map(valueKey).join('\u0001');
  }

  function uniqueValues(values) {
    var seen = {};
    var out = [];
    (Array.isArray(values) ? values : []).forEach(function (value) {
      var key = valueKey(value);
      if (!own(seen, key)) {
        seen[key] = true;
        out.push(value);
      }
    });
    return out;
  }



  function appendContent(target, value) {
    var C = core();
    if (value == null) return target;
    if (Array.isArray(value)) {
      value.forEach(function (item) { appendContent(target, item); });
    } else if (isNode(value)) {
      C.append(target, value);
    } else {
      C.append(target, text(value));
    }
    return target;
  }

  function readLive(node, message) {
    if (node) node.textContent = text(message);
  }

  shared.VERSION = '1.0.0';
  shared.core = core;
  shared.own = own;
  shared.text = text;
  shared.make = make;
  shared.validateHost = validateHost;
  shared.uid = uid;
  shared.isNode = isNode;
  shared.append = append;
  shared.setHidden = setHidden;
  shared.focusNode = focusNode;
  shared.isEditableTarget = isEditableTarget;
  shared.valueKey = valueKey;
  shared.signatureOf = signatureOf;
  shared.uniqueValues = uniqueValues;
  shared.appendContent = appendContent;
  shared.readLive = readLive;
})(window);

/* ---- source: src/ui/extended.js ---- */
/* NoteUI extended — X01 Avatar, X02 Carousel and X03 Rating.
 * Internal helpers: window.NoteUIInternals.extended (extended-shared.js).
 * Depends on: NoteCore. String content is always inserted as text;
 * no fetch, eval, HTML string injection. */
(function (global) {
  'use strict';

  var NoteUI = global.NoteUI = global.NoteUI || {};
  var shared = global.NoteUIInternals && global.NoteUIInternals.extended;
  if (!shared) {
    throw new Error('ui-extended 组件需要先加载 src/ui/extended-shared.js（内部共享 helper）。');
  }
  var core = shared.core;
  var own = shared.own;
  var text = shared.text;
  var make = shared.make;
  var validateHost = shared.validateHost;
  var uid = shared.uid;
  var isNode = shared.isNode;
  var append = shared.append;
  var setHidden = shared.setHidden;
  var focusNode = shared.focusNode;
  var isEditableTarget = shared.isEditableTarget;
  var valueKey = shared.valueKey;
  var signatureOf = shared.signatureOf;
  var uniqueValues = shared.uniqueValues;
  var appendContent = shared.appendContent;
  var readLive = shared.readLive;
  var VERSION = shared.VERSION;
  var AVATAR_TONES = ['neutral', 'accent', 'sky', 'sage', 'amber', 'rose'];


  /* -----------------------------------------------------------------------
   * X01 — Avatar
   * -------------------------------------------------------------------- */

  function avatarInitials(item) {
    var explicit = text(item.initials).trim();
    if (explicit) return Array.from(explicit).slice(0, 3).join('');
    var source = text(item.label || item.name || item.alt).trim();
    if (!source) return '?';
    var parts = source.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      return (Array.from(parts[0])[0] || '') + (Array.from(parts[1])[0] || '');
    }
    var chars = Array.from(source);
    if (/[㐀-鿿]/.test(source)) return chars.slice(0, 2).join('');
    return chars.slice(0, 2).join('').toUpperCase();
  }

  function avatarAccessibleName(item) {
    if (item.decorative) return '';
    if (item.altSpecified) return text(item.alt).trim();
    return text(item.name || item.label || item.alt).trim();
  }

  function normalizeAvatarTone(value) {
    return AVATAR_TONES.indexOf(value) >= 0 ? value : 'neutral';
  }

  function normalizeAvatarShape(value) {
    return value === 'square' || value === 'rounded' ? value : 'circle';
  }

  function normalizeAvatarSize(value) {
    if (value === 'sm' || value === 'md' || value === 'lg' || value === 'xl') return value;
    var number = Number(value);
    if (isFinite(number) && number > 0) return Math.max(24, Math.min(128, Math.round(number)));
    return 'md';
  }

  function avatarItemFrom(source, shared) {
    var raw = source;
    if (typeof raw === 'string' || typeof raw === 'number') raw = { name: text(source) };
    if (!raw || typeof raw !== 'object') raw = {};
    var fallbackName = raw.name != null ? raw.name :
      (raw.label != null ? raw.label : (raw.alt != null ? raw.alt : ''));
    return {
      src: raw.src != null ? raw.src : (shared.src != null ? shared.src : ''),
      alt: raw.alt,
      altSpecified: own(raw, 'alt'),
      name: fallbackName,
      label: raw.label,
      initials: raw.initials,
      tone: normalizeAvatarTone(raw.tone || shared.tone),
      decorative: Boolean(raw.decorative),
      caption: raw.caption
    };
  }

  NoteUI.Avatar = {
    version: VERSION,
    mount: function (host, options) {
      validateHost(host);
      var C = core();
      var input = options && typeof options === 'object' ? options : {};
      var root = make('div', 'nui-avatar');
      var alive = true;
      var state = {
        group: Boolean(input.group) || Array.isArray(input.items),
        src: input.src == null ? '' : text(input.src),
        alt: input.alt,
        altSpecified: own(input, 'alt'),
        name: input.name,
        label: input.label,
        initials: input.initials,
        tone: normalizeAvatarTone(input.tone),
        size: normalizeAvatarSize(input.size),
        shape: normalizeAvatarShape(input.shape),
        caption: input.caption,
        decorative: Boolean(input.decorative),
        items: Array.isArray(input.items) ? input.items.slice() : [],
        max: Math.max(0, Math.floor(input.max == null ? 4 : (isFinite(Number(input.max)) ? Number(input.max) : 4))),
        groupLabel: input.groupLabel == null ? '头像组' : text(input.groupLabel),
        _failed: {}
      };

      function itemForSingle() {
        var source = {
          src: state.src,
          name: state.name,
          label: state.label,
          initials: state.initials,
          tone: state.tone,
          decorative: state.decorative,
          caption: state.caption
        };
        if (state.altSpecified) source.alt = state.alt;
        return avatarItemFrom(source, state);
      }

      function itemForGroup(source) {
        return avatarItemFrom(source, state);
      }

      function applySize(frame, size) {
        if (typeof size === 'number') {
          frame.classList.add('nui-avatar__frame--custom');
          frame.style.width = size + 'px';
          frame.style.height = size + 'px';
          frame.style.fontSize = Math.max(10, Math.round(size * 0.36)) + 'px';
        } else {
          frame.classList.add('nui-avatar__frame--' + size);
        }
      }

      function buildFrame(item, scope, index) {
        var frame = make('span', 'nui-avatar__frame nui-avatar__frame--' + normalizeAvatarShape(state.shape));
        frame.classList.add('nui-avatar__frame--tone-' + normalizeAvatarTone(item.tone || state.tone));
        applySize(frame, state.size);
        if (scope === 'group') frame.classList.add('nui-avatar__group-item');
        var accessible = avatarAccessibleName(item);
        var src = text(item.src).trim();
        var key = scope + ':' + index + ':' + src;
        var showImage = src && !state._failed[key];

        if (showImage) {
          var image = make('img', 'nui-avatar__img');
          image.alt = accessible;
          image.decoding = 'async';
          if (!accessible) image.setAttribute('aria-hidden', 'true');
          image.addEventListener('error', function () {
            if (!alive) return;
            state._failed[key] = true;
            render();
          }, { once: true });
          image.src = src;
          frame.classList.add('nui-avatar__frame--has-image');
          frame.appendChild(image);
        }

        var fallback = make('span', 'nui-avatar__fallback', avatarInitials(item));
        fallback.setAttribute('aria-hidden', 'true');
        frame.appendChild(fallback);
        if (!showImage) {
          if (accessible) {
            frame.setAttribute('role', 'img');
            frame.setAttribute('aria-label', accessible);
          } else {
            frame.setAttribute('aria-hidden', 'true');
          }
        }

        return frame;
      }

      function renderSingle() {
        root.className = 'nui-avatar';
        root.removeAttribute('role');
        root.removeAttribute('aria-label');
        var item = itemForSingle();
        var frame = buildFrame(item, 'single', 0);
        root.replaceChildren(frame);
        var captionText = '';
        if (item.caption === true) captionText = text(item.label || item.name || item.alt);
        else if (item.caption != null && item.caption !== false) captionText = text(item.caption);
        if (captionText) {
          var accessible = avatarAccessibleName(item);
          var caption = make('span', 'nui-avatar__caption', captionText);
          if (accessible) caption.setAttribute('aria-hidden', 'true');
          root.classList.add('nui-avatar--captioned');
          root.appendChild(caption);
        }
      }

      function renderGroup() {
        root.className = 'nui-avatar-group';
        root.setAttribute('role', 'group');
        var items = Array.isArray(state.items) ? state.items : [];
        var max = Math.max(0, Math.floor(Number(state.max) || 0));
        var shown = items.slice(0, max);
        var overflow = Math.max(0, items.length - shown.length);
        var label = state.groupLabel + '，共 ' + items.length + ' 项';
        if (overflow) {
          label += '，显示前 ' + shown.length + ' 项，另有 ' + overflow + ' 项';
        }
        root.setAttribute('aria-label', label);
        root.replaceChildren();
        if (!items.length) {
          root.appendChild(make('span', 'nui-avatar-group__empty', '暂无头像'));
          return;
        }
        shown.forEach(function (source, index) {
          root.appendChild(buildFrame(itemForGroup(source), 'group', index));
        });
        if (overflow) {
          var more = make('span', 'nui-avatar__frame nui-avatar__group-item nui-avatar__overflow',
            '+' + overflow);
          more.classList.add('nui-avatar__frame--' + normalizeAvatarShape(state.shape));
          more.setAttribute('aria-hidden', 'true');
          applySize(more, state.size);
          root.appendChild(more);
        }
      }

      function render() {
        if (state.group) renderGroup();
        else renderSingle();
      }

      var inst = C.component(root, state, render, function () {
        alive = false;
      });
      var baseUpdate = inst.update;
      inst.update = function (patch) {
        if (inst.destroyed || !patch || typeof patch !== 'object') return;
        if (own(patch, 'alt')) state.altSpecified = true;
        return baseUpdate(patch);
      };
      render();
      host.appendChild(root);
      return inst;
    }
  };

  /* -----------------------------------------------------------------------
   * X02 — Carousel
   * -------------------------------------------------------------------- */

  function normalizeCarouselItems(items) {
    return (Array.isArray(items) ? items : []).filter(function (item) {
      return item != null;
    }).map(function (item, index) {
      if (typeof item === 'string' || typeof item === 'number') {
        return { id: 'slide-' + index, label: '', content: text(item), raw: item };
      }
      if (typeof item !== 'object') {
        return { id: 'slide-' + index, label: '', content: text(item), raw: item };
      }
      return {
        id: item.id == null ? 'slide-' + index : item.id,
        label: item.label == null ? '' : text(item.label),
        content: own(item, 'content') ? item.content : text(item.label),
        raw: item
      };
    });
  }

  NoteUI.Carousel = {
    version: VERSION,
    mount: function (host, options) {
      validateHost(host);
      var C = core();
      var input = options && typeof options === 'object' ? options : {};
      var root = make('section', 'nui-carousel');
      var viewport = make('div', 'nui-carousel__viewport');
      var slides = make('div', 'nui-carousel__slides');
      var empty = make('p', 'nui-carousel__empty', '暂无轮播内容');
      var controls = make('div', 'nui-carousel__controls');
      var prev = make('button', 'nui-carousel__button nui-carousel__step');
      var next = make('button', 'nui-carousel__button nui-carousel__step');
      var counter = make('span', 'nui-carousel__counter');
      var dots = make('div', 'nui-carousel__dots');
      var autoButton = make('button', 'nui-carousel__button nui-carousel__autoplay');
      var live = make('span', 'nui-carousel__live hnv-visually-hidden');
      var bag = C.listeners(root);
      var docBag = C.listeners(document);
      var timer = null;
      var alive = true;
      var dotButtons = [];
      var reducedUnsubscribe = null;

      root.setAttribute('role', 'region');
      root.setAttribute('aria-roledescription', '轮播');
      prev.type = 'button';
      prev.setAttribute('aria-label', '上一张');
      prev.setAttribute('data-carousel-action', 'prev');
      prev.appendChild(make('span', 'nui-carousel__glyph', '‹'));
      prev.lastChild.setAttribute('aria-hidden', 'true');
      next.type = 'button';
      next.setAttribute('aria-label', '下一张');
      next.setAttribute('data-carousel-action', 'next');
      next.appendChild(make('span', 'nui-carousel__glyph', '›'));
      next.lastChild.setAttribute('aria-hidden', 'true');
      autoButton.type = 'button';
      autoButton.setAttribute('data-carousel-action', 'autoplay');
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('aria-atomic', 'true');
      dots.setAttribute('role', 'group');
      dots.setAttribute('aria-label', '选择轮播页');
      append(viewport, slides, empty);
      append(controls, prev, counter, dots, next, autoButton, live);
      root.appendChild(viewport);
      root.appendChild(controls);
      setHidden(empty, true);

      var state = {
        items: normalizeCarouselItems(input.items),
        index: isFinite(Number(input.index)) ? Math.floor(Number(input.index)) : 0,
        label: input.label == null ? '内容轮播' : text(input.label),
        auto: Boolean(input.auto),
        interval: isFinite(Number(input.interval)) ? Math.max(1000, Number(input.interval)) : 6000,
        loop: input.loop !== false,
        onChange: typeof input.onChange === 'function' ? input.onChange : null,
        _playRequested: Boolean(input.auto),
        _hover: false,
        _focus: false
      };

      function reduced() {
        if (C.motion && typeof C.motion.reduced === 'function') {
          try { return !!C.motion.reduced(); } catch (error) { return false; }
        }
        try { return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches); }
        catch (error) { return false; }
      }

      function clampIndex(value) {
        if (!state.items.length) return 0;
        var index = Math.floor(Number(value));
        if (!isFinite(index)) index = 0;
        if (index < 0) index = 0;
        if (index >= state.items.length) index = state.items.length - 1;
        return index;
      }

      function itemLabel(item, index) {
        return '第 ' + (index + 1) + ' 张，共 ' + state.items.length + ' 张' +
          (item.label ? '：' + item.label : '');
      }

      function buildSlides() {
        slides.replaceChildren();
        state.items.forEach(function (item, index) {
          var slide = make('div', 'nui-carousel__slide');
          slide.setAttribute('role', 'group');
          slide.setAttribute('aria-roledescription', '幻灯片');
          slide.setAttribute('aria-label', itemLabel(item, index));
          slide.setAttribute('data-carousel-slide', String(index));
          appendContent(slide, item.content);
          var active = index === state.index;
          if (!active) {
            slide.setAttribute('aria-hidden', 'true');
            slide.setAttribute('inert', '');
            slide.inert = true;
          }
          slide.classList.toggle('is-active', active);
          slides.appendChild(slide);
        });
      }

      function ensureDots() {
        if (dotButtons.length === state.items.length) return;
        var hadFocus = dotButtons.indexOf(document.activeElement) >= 0;
        dots.replaceChildren();
        dotButtons = state.items.map(function (item, index) {
          var button = make('button', 'nui-carousel__dot');
          button.type = 'button';
          button.setAttribute('data-carousel-action', 'dot');
          button.setAttribute('data-carousel-index', String(index));
          var mark = make('span', 'nui-carousel__dot-mark');
          mark.setAttribute('aria-hidden', 'true');
          button.appendChild(mark);
          button.appendChild(make('span', 'nui-carousel__dot-label hnv-visually-hidden',
            '转到第 ' + (index + 1) + ' 张' + (item.label ? '：' + item.label : '')));
          dots.appendChild(button);
          return button;
        });
        dots.setAttribute('aria-label', state.label + '，选择轮播页');
        if (hadFocus) {
          var focusedDot = dots.querySelector('[data-carousel-index="' + state.index + '"]');
          if (focusedDot) focusNode(focusedDot);
        }
      }

      function syncDots() {
        dotButtons.forEach(function (button, index) {
          var current = index === state.index;
          button.classList.toggle('is-current', current);
          if (current) button.setAttribute('aria-current', 'true');
          else button.removeAttribute('aria-current');
          button.disabled = state.items.length < 2;
          var labelNode = button.querySelector('.nui-carousel__dot-label');
          if (labelNode) {
            var item = state.items[index];
            labelNode.textContent = '转到第 ' + (index + 1) + ' 张' +
              (item && item.label ? '：' + item.label : '');
          }
        });
        dots.setAttribute('aria-label', state.label + '，选择轮播页');
      }

      function syncControls() {
        var count = state.items.length;
        var atStart = state.index <= 0;
        var atEnd = state.index >= count - 1;
        prev.disabled = count < 2 || (!state.loop && atStart);
        next.disabled = count < 2 || (!state.loop && atEnd);
        counter.textContent = count ? (state.index + 1) + ' / ' + count : '0 / 0';
        ensureDots();
        syncDots();
        if (!count) {
          counter.textContent = '暂无内容';
          state.index = 0;
        }
      }

      function syncAutoplay() {
        if (timer != null) {
          global.clearInterval(timer);
          timer = null;
        }
        var canRun = alive && state.auto && state._playRequested && state.items.length > 1 &&
          !reduced() && !state._hover && !state._focus && !document.hidden;
        setHidden(autoButton, !(state.auto && state.items.length > 1));
        if (!state.auto || state.items.length < 2) return;
        var reducedNow = reduced();
        if (reducedNow) {
          autoButton.disabled = true;
          autoButton.textContent = '自动播放已停用';
          autoButton.setAttribute('aria-label', '自动播放已停用：系统启用了减少动效');
          return;
        }
        autoButton.disabled = false;
        if (state._playRequested) {
          autoButton.textContent = '暂停自动播放';
          autoButton.setAttribute('aria-label', '暂停自动播放');
        } else {
          autoButton.textContent = '播放';
          autoButton.setAttribute('aria-label', '开始自动播放');
        }
        if (!canRun) return;
        timer = global.setInterval(function () {
          if (!alive || !state.auto || !state._playRequested) return;
          var nextIndex = state.index + 1;
          if (nextIndex >= state.items.length) {
            if (!state.loop) {
              state._playRequested = false;
              render();
              return;
            }
            nextIndex = 0;
          }
          setIndex(nextIndex, null);
        }, state.interval);
      }

      function render() {
        state.index = clampIndex(state.index);
        root.setAttribute('aria-label', state.label);
        root.setAttribute('tabindex', '0');
        slides.replaceChildren();
        if (!state.items.length) {
          setHidden(empty, false);
          slides.hidden = true;
          counter.textContent = '暂无内容';
        } else {
          setHidden(empty, true);
          slides.hidden = false;
          buildSlides();
        }
        syncControls();
        var announcement = state.items.length ?
          ('第 ' + (state.index + 1) + ' 张，共 ' + state.items.length + ' 张' +
            (state.items[state.index] && state.items[state.index].label ? '：' + state.items[state.index].label : '')) :
          '暂无轮播内容';
        readLive(live, announcement);
        syncAutoplay();
      }

      function setIndex(nextIndex, event, options) {
        if (!state.items.length) return false;
        var target = clampIndex(nextIndex);
        if (target === state.index) return false;
        var previous = document.activeElement;
        var oldSlide = slides.querySelector('[data-carousel-slide="' + state.index + '"]');
        var focusWasInSlide = !!(oldSlide && previous && oldSlide.contains(previous));
        state.index = target;
        render();
        if (focusWasInSlide) focusNode(root);
        if (typeof state.onChange === 'function') {
          state.onChange(state.index, event || null);
        }
        return true;
      }

      function goRelative(step, event) {
        if (state.items.length < 2) return;
        var nextIndex = state.index + step;
        if (nextIndex < 0) {
          if (!state.loop) return;
          nextIndex = state.items.length - 1;
        } else if (nextIndex >= state.items.length) {
          if (!state.loop) return;
          nextIndex = 0;
        }
        setIndex(nextIndex, event);
      }

      function clicked(event) {
        var trigger = event.target && event.target.closest ?
          event.target.closest('[data-carousel-action]') : null;
        if (!trigger || !root.contains(trigger)) return;
        var action = trigger.getAttribute('data-carousel-action');
        if (action === 'prev') goRelative(-1, event);
        else if (action === 'next') goRelative(1, event);
        else if (action === 'dot') {
          var index = Number(trigger.getAttribute('data-carousel-index'));
          if (isFinite(index)) setIndex(index, event);
        } else if (action === 'autoplay' && state.auto) {
          state._playRequested = !state._playRequested;
          render();
        }
      }

      function keyed(event) {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (isEditableTarget(event.target)) return;
        var handled = false;
        if (event.key === 'ArrowLeft' || event.key === 'Left') {
          goRelative(-1, event);
          handled = true;
        } else if (event.key === 'ArrowRight' || event.key === 'Right') {
          goRelative(1, event);
          handled = true;
        } else if (event.key === 'Home') {
          setIndex(0, event);
          handled = true;
        } else if (event.key === 'End') {
          setIndex(state.items.length - 1, event);
          handled = true;
        }
        if (handled) event.preventDefault();
      }

      bag.on('click', clicked);
      bag.on('keydown', keyed);
      bag.on('mouseenter', function () {
        state._hover = true;
        syncAutoplay();
      });
      bag.on('mouseleave', function () {
        state._hover = false;
        syncAutoplay();
      });
      bag.on('focusin', function () {
        state._focus = true;
        syncAutoplay();
      });
      bag.on('focusout', function (event) {
        if (!root.contains(event.relatedTarget)) {
          state._focus = false;
          syncAutoplay();
        }
      });
      docBag.on('visibilitychange', function () { syncAutoplay(); });

      if (C.motion && typeof C.motion.onChange === 'function') {
        reducedUnsubscribe = C.motion.onChange(function () {
          if (alive) render();
        });
      }

      var inst = C.component(root, state, render, function () {
        alive = false;
        bag.clear();
        docBag.clear();
        if (timer != null) {
          global.clearInterval(timer);
          timer = null;
        }
        if (typeof reducedUnsubscribe === 'function') {
          try { reducedUnsubscribe(); } catch (error) {}
          reducedUnsubscribe = null;
        }
      });

      var baseUpdate = inst.update;
      inst.update = function (patch) {
        if (inst.destroyed || !patch || typeof patch !== 'object') return;
        var next = C.assign({}, patch);
        if (own(next, 'items')) next.items = normalizeCarouselItems(next.items);
        if (own(next, 'interval')) {
          next.interval = isFinite(Number(next.interval)) ?
            Math.max(1000, Number(next.interval)) : 6000;
        }
        if (own(next, 'auto')) state._playRequested = Boolean(next.auto);
        return baseUpdate(next);
      };

      inst.getValue = function () { return state.index; };
      render();
      host.appendChild(root);
      return inst;
    }
  };

  /* -----------------------------------------------------------------------
   * X03 — Rating
   * -------------------------------------------------------------------- */

  NoteUI.Rating = {
    version: VERSION,
    mount: function (host, options) {
      validateHost(host);
      var C = core();
      var input = options && typeof options === 'object' ? options : {};
      var root = make('div', 'nui-rating');
      var labelEl = make('span', 'nui-rating__label');
      var control = make('div', 'nui-rating__control');
      var stars = make('span', 'nui-rating__stars');
      var valueEl = make('span', 'nui-rating__value');
      var labelId = uid('nui-rating-label');
      var bag = C.listeners(control);
      var state = {
        value: input.value == null ? 0 : input.value,
        max: input.max == null ? 5 : input.max,
        readonly: Boolean(input.readonly),
        disabled: Boolean(input.disabled),
        allowClear: input.allowClear !== false,
        label: input.label == null ? '' : text(input.label),
        onChange: typeof input.onChange === 'function' ? input.onChange : null
      };
      control.setAttribute('role', 'slider');
      control.setAttribute('aria-orientation', 'horizontal');
      control.tabIndex = 0;
      labelEl.id = labelId;
      valueEl.setAttribute('aria-hidden', 'true');
      append(control, stars, valueEl);
      append(root, labelEl, control);

      function normalizeMax(value) {
        var number = isFinite(Number(value)) ? Math.floor(Number(value)) : 5;
        return Math.max(1, Math.min(10, number));
      }

      function normalizeValue(value, max) {
        var number = Number(value);
        if (!isFinite(number)) number = 0;
        number = Math.round(number);
        return Math.max(0, Math.min(max, number));
      }

      function valueText(value, max) {
        return value === 0 ? '未评分，共 ' + max + ' 星' : value + ' 星，共 ' + max + ' 星';
      }

      function render() {
        state.max = normalizeMax(state.max);
        state.value = normalizeValue(state.value, state.max);
        labelEl.textContent = state.label;
        setHidden(labelEl, !state.label);
        if (state.label) {
          control.setAttribute('aria-labelledby', labelId);
          control.removeAttribute('aria-label');
        } else {
          control.removeAttribute('aria-labelledby');
          control.setAttribute('aria-label', '评分');
        }
        control.tabIndex = state.disabled ? -1 : 0;
        control.setAttribute('aria-valuemin', '0');
        control.setAttribute('aria-valuemax', String(state.max));
        control.setAttribute('aria-valuenow', String(state.value));
        control.setAttribute('aria-valuetext', valueText(state.value, state.max));
        if (state.readonly) control.setAttribute('aria-readonly', 'true');
        else control.removeAttribute('aria-readonly');
        if (state.disabled) control.setAttribute('aria-disabled', 'true');
        else control.removeAttribute('aria-disabled');
        control.classList.toggle('is-readonly', state.readonly);
        control.classList.toggle('is-disabled', state.disabled);
        root.classList.toggle('is-readonly', state.readonly);
        root.classList.toggle('is-disabled', state.disabled);

        stars.replaceChildren();
        for (var index = 1; index <= state.max; index += 1) {
          var star = make('span', 'nui-rating__star', index <= state.value ? '★' : '☆');
          star.setAttribute('aria-hidden', 'true');
          star.setAttribute('data-rating-value', String(index));
          star.classList.toggle('is-filled', index <= state.value);
          stars.appendChild(star);
        }
        valueEl.textContent = state.value + ' / ' + state.max;
      }

      function commit(next, event) {
        var normalized = normalizeValue(next, state.max);
        if (normalized === state.value) return;
        state.value = normalized;
        render();
        if (typeof state.onChange === 'function') state.onChange(state.value, event);
      }

      function clicked(event) {
        if (state.readonly || state.disabled) return;
        var star = event.target && event.target.closest ?
          event.target.closest('[data-rating-value]') : null;
        if (!star || !control.contains(star)) return;
        focusNode(control);
        var next = Number(star.getAttribute('data-rating-value'));
        if (!isFinite(next)) return;
        if (state.allowClear && next === state.value) next = 0;
        commit(next, event);
      }

      function keyed(event) {
        if (state.readonly || state.disabled) return;
        var handled = true;
        var next = state.value;
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp' ||
            event.key === 'Right' || event.key === 'Up') {
          next = Math.min(state.max, state.value + 1);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown' ||
            event.key === 'Left' || event.key === 'Down') {
          next = Math.max(0, state.value - 1);
        } else if (event.key === 'Home') {
          next = 0;
        } else if (event.key === 'End') {
          next = state.max;
        } else if ((event.key === 'Delete' || event.key === 'Backspace') && state.allowClear) {
          next = 0;
        } else {
          handled = false;
        }
        if (!handled) return;
        event.preventDefault();
        commit(next, event);
      }

      bag.on('click', clicked);
      bag.on('keydown', keyed);

      var inst = C.component(root, state, render, function () {
        bag.clear();
      });
      inst.getValue = function () { return state.value; };
      render();
      host.appendChild(root);
      return inst;
    }
  };
})(window);

/* ---- source: src/ui/extended-select.js ---- */
/* NoteUI extended — X04 Cascader, X05 TreeSelect and X06 TransferList.
 * Internal helpers: window.NoteUIInternals.extended (extended-shared.js).
 * Depends on: NoteCore; X05 TreeSelect also needs NoteUI.TreeView (ui-navigation).
 * Overlays reuse NoteCore.floating; no fetch, eval, HTML string injection. */
(function (global) {
  'use strict';

  var NoteUI = global.NoteUI = global.NoteUI || {};
  var shared = global.NoteUIInternals && global.NoteUIInternals.extended;
  if (!shared) {
    throw new Error('ui-extended 组件需要先加载 src/ui/extended-shared.js（内部共享 helper）。');
  }
  var core = shared.core;
  var own = shared.own;
  var text = shared.text;
  var make = shared.make;
  var validateHost = shared.validateHost;
  var uid = shared.uid;
  var isNode = shared.isNode;
  var append = shared.append;
  var setHidden = shared.setHidden;
  var focusNode = shared.focusNode;
  var isEditableTarget = shared.isEditableTarget;
  var valueKey = shared.valueKey;
  var signatureOf = shared.signatureOf;
  var uniqueValues = shared.uniqueValues;
  var appendContent = shared.appendContent;
  var readLive = shared.readLive;
  var VERSION = shared.VERSION;


  /* -----------------------------------------------------------------------
   * X04 — Cascader
   * -------------------------------------------------------------------- */

  function normalizeCascaderNodes(nodes) {
    if (!Array.isArray(nodes)) return [];
    return nodes.filter(function (node) {
      return node && typeof node === 'object';
    }).map(function (node, index) {
      var value = own(node, 'value') ? node.value : node.id;
      return {
        raw: node,
        value: value,
        label: node.label == null ? text(value) : text(node.label),
        disabled: Boolean(node.disabled),
        children: normalizeCascaderNodes(node.children),
        index: index
      };
    });
  }

  function findCascaderNode(nodes, value) {
    if (!Array.isArray(nodes)) return null;
    for (var index = 0; index < nodes.length; index += 1) {
      if (Object.is(nodes[index].value, value)) return nodes[index];
    }
    return null;
  }

  function resolveCascaderPath(nodes, values) {
    var path = [];
    var level = Array.isArray(nodes) ? nodes : [];
    (Array.isArray(values) ? values : []).forEach(function (value) {
      var node = findCascaderNode(level, value);
      if (!node) return;
      path.push(node);
      level = node.children;
    });
    return path;
  }

  function cascaderValueArray(value) {
    if (Array.isArray(value)) return value.slice();
    if (value == null || value === '') return [];
    return [value];
  }

  function pathValues(path) {
    return path.map(function (node) { return node.value; });
  }

  NoteUI.Cascader = {
    version: VERSION,
    mount: function (host, options) {
      validateHost(host);
      var C = core();
      var input = options && typeof options === 'object' ? options : {};
      var root = make('div', 'nui-cascader');
      var trigger = make('button', 'nui-cascader__trigger');
      var summary = make('span', 'nui-cascader__summary');
      var indicator = make('span', 'nui-cascader__indicator', '▾');
      var clearButton = make('button', 'nui-cascader__clear');
      var live = make('span', 'nui-cascader__live hnv-visually-hidden');
      var panelId = uid('nui-cascader-panel');
      var helpId = uid('nui-cascader-help');
      var bag = C.listeners(root);
      var windowBag = C.listeners(global);
      var popupBag = null;
      var layer = null;
      var panelEl = null;
      var pathLine = null;
      var columnsHost = null;
      var emptyEl = null;
      var state = null;
      var alive = true;

      trigger.type = 'button';
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', panelId);
      indicator.setAttribute('aria-hidden', 'true');
      append(trigger, summary, indicator);
      clearButton.type = 'button';
      clearButton.setAttribute('aria-label', '清除级联选择');
      clearButton.appendChild(make('span', 'nui-cascader__clear-glyph', '×'));
      clearButton.firstChild.setAttribute('aria-hidden', 'true');
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('aria-atomic', 'true');
      append(root, trigger, clearButton, live);

      state = {
        options: input.options,
        value: cascaderValueArray(input.value),
        placeholder: input.placeholder == null ? '请选择' : text(input.placeholder),
        clearable: input.clearable !== false,
        disabled: Boolean(input.disabled),
        separator: input.separator == null ? ' / ' : text(input.separator),
        label: input.label == null ? '级联选择' : text(input.label),
        onChange: typeof input.onChange === 'function' ? input.onChange : null,
        _options: [],
        _path: [],
        _browse: [],
        _activeLevel: 0,
        _activeIndex: 0,
        _columns: [],
        _open: false,
        _suppressAnchorClick: false
      };

      function syncOpenState() {
        if (!alive) return;
        var open = !!(layer && layer.isOpen());
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
        root.classList.toggle('is-open', open);
      }

      function currentBrowsePath() {
        return resolveCascaderPath(state._options, state._browse);
      }

      function columnsForBrowse() {
        var columns = [{ level: 0, nodes: state._options }];
        var path = currentBrowsePath();
        for (var index = 0; index < path.length; index += 1) {
          var node = path[index];
          if (!node.children.length) break;
          columns.push({ level: index + 1, nodes: node.children });
        }
        return columns;
      }

      function firstOptionIndex(nodes) {
        if (!Array.isArray(nodes) || !nodes.length) return -1;
        for (var index = 0; index < nodes.length; index += 1) {
          if (!nodes[index].disabled) return index;
        }
        return 0;
      }

      function currentPathText() {
        var path = currentBrowsePath();
        return path.map(function (node) { return node.label; }).join(state.separator);
      }

      function ensureLayer() {
        if (layer) return layer;
        panelEl = make('div', 'nui-cascader__panel');
        panelEl.id = panelId;
        panelEl.tabIndex = -1;
        pathLine = make('div', 'nui-cascader__pathline');
        columnsHost = make('div', 'nui-cascader__columns');
        emptyEl = make('p', 'nui-cascader__empty', '暂无可选项');
        var help = make('p', 'hnv-visually-hidden',
          '使用上下方向键在各列移动，左右方向键切换层级，Enter 选择，Esc 关闭。');
        help.id = helpId;
        setHidden(emptyEl, true);
        append(panelEl, pathLine, columnsHost, emptyEl, help);

        layer = C.floating.create({
          anchor: trigger,
          content: panelEl,
          placement: 'bottom-start',
          offset: 6,
          role: 'dialog',
          className: 'nui-cascader__popup',
          modal: false,
          trapFocus: true,
          returnFocus: true,
          closeOnEsc: true,
          closeOnOutside: true,
          lockScroll: false,
          maxWidth: 'min(94vw, 44rem)',
          onOpen: function () {
            state._open = true;
            syncOpenState();
          },
          onClose: function () {
            state._open = false;
            syncOpenState();
          }
        });
        layer.el.setAttribute('aria-label', state.label);
        layer.el.setAttribute('aria-describedby', helpId);
        popupBag = C.listeners(panelEl);
        popupBag.on('click', popupClicked);
        popupBag.on('keydown', popupKeyed);
        return layer;
      }

      function setPathLine() {
        pathLine.replaceChildren();
        pathLine.appendChild(make('span', 'nui-cascader__pathlabel', '当前路径'));
        var values = currentPathText();
        pathLine.appendChild(make('span', 'nui-cascader__pathvalue', values || '尚未选择'));
        pathLine.setAttribute('aria-live', 'polite');
      }

      function applyActiveDom() {
        if (!columnsHost) return;
        Array.prototype.forEach.call(columnsHost.querySelectorAll('[data-cascader-level]'), function (option) {
          var level = Number(option.getAttribute('data-cascader-level'));
          var index = Number(option.getAttribute('data-cascader-index'));
          var active = level === state._activeLevel && index === state._activeIndex;
          option.tabIndex = active ? 0 : -1;
          option.classList.toggle('is-active', active);
        });
      }

      function focusActiveOption() {
        if (!layer || !layer.isOpen() || !columnsHost) return;
        var option = columnsHost.querySelector(
          '[data-cascader-level="' + state._activeLevel + '"][data-cascader-index="' + state._activeIndex + '"]');
        if (option) {
          focusNode(option);
          C.scrollIntoViewIfNeeded(option, columnsHost, { block: 'nearest', inline: 'nearest' });
        } else {
          focusNode(panelEl);
        }
      }

      function renderPopup(focusWanted) {
        if (!layer || !panelEl) return;
        setPathLine();
        setHidden(emptyEl, !!state._options.length);
        columnsHost.replaceChildren();
        state._columns = columnsForBrowse();
        if (!state._options.length) {
          state._activeLevel = 0;
          state._activeIndex = -1;
          if (focusWanted) focusNode(panelEl);
          return;
        }
        if (state._activeLevel < 0) state._activeLevel = 0;
        if (state._activeLevel >= state._columns.length) state._activeLevel = state._columns.length - 1;
        var activeColumn = state._columns[state._activeLevel];
        if (!activeColumn.nodes.length) {
          state._activeIndex = -1;
        } else if (state._activeIndex < 0 || state._activeIndex >= activeColumn.nodes.length) {
          state._activeIndex = firstOptionIndex(activeColumn.nodes);
        }

        var selectedPath = resolveCascaderPath(state._options, state.value);
        state._columns.forEach(function (column) {
          var listbox = make('div', 'nui-cascader__column');
          listbox.setAttribute('role', 'listbox');
          listbox.setAttribute('aria-label', state.label + '，第 ' + (column.level + 1) + ' 级');
          column.nodes.forEach(function (node, index) {
            var selectedNode = selectedPath[column.level];
            var selected = !!selectedNode && Object.is(selectedNode.value, node.value);
            var option = make('div', 'nui-cascader__option');
            option.setAttribute('role', 'option');
            option.setAttribute('data-cascader-level', String(column.level));
            option.setAttribute('data-cascader-index', String(index));
            option.setAttribute('aria-selected', selected ? 'true' : 'false');
            option.tabIndex = (column.level === state._activeLevel && index === state._activeIndex) ? 0 : -1;
            if (node.disabled) option.setAttribute('aria-disabled', 'true');
            option.classList.toggle('is-selected', selected);
            option.classList.toggle('is-disabled', node.disabled);
            option.classList.toggle('is-active',
              column.level === state._activeLevel && index === state._activeIndex);
            option.appendChild(make('span', 'nui-cascader__option-label', node.label));
            if (selected) {
              var check = make('span', 'nui-cascader__option-check', '✓');
              check.setAttribute('aria-hidden', 'true');
              option.appendChild(check);
            }
            if (node.disabled) {
              option.appendChild(make('span', 'nui-cascader__option-note', '不可选'));
            }
            if (node.children.length) {
              var more = make('span', 'nui-cascader__option-more', '›');
              more.setAttribute('aria-hidden', 'true');
              option.appendChild(more);
            }
            listbox.appendChild(option);
          });
          columnsHost.appendChild(listbox);
        });
        applyActiveDom();
        if (focusWanted) focusActiveOption();
      }

      function render() {
        state._options = normalizeCascaderNodes(state.options);
        state._path = resolveCascaderPath(state._options, cascaderValueArray(state.value));
        state.value = pathValues(state._path);
        if (!state._open) {
          state._browse = state.value.slice();
        } else {
          var browsePath = resolveCascaderPath(state._options, state._browse);
          state._browse = pathValues(browsePath);
        }
        var pathText = state._path.map(function (node) { return node.label; }).join(state.separator);
        summary.textContent = pathText || state.placeholder;
        summary.classList.toggle('is-placeholder', !pathText);
        trigger.disabled = state.disabled;
        trigger.setAttribute('aria-label',
          state.label + '：' + (pathText || state.placeholder));
        setHidden(clearButton, !state.clearable || state.disabled || !state._path.length);
        clearButton.disabled = state.disabled;
        root.classList.toggle('is-disabled', state.disabled);
        readLive(live, pathText ? '已选择：' + pathText : '未选择级联项');
        if (layer) layer.el.setAttribute('aria-label', state.label);
        if (layer && layer.isOpen()) {
          var hadFocus = panelEl.contains(document.activeElement);
          if (state.disabled) layer.close('api');
          else renderPopup(hadFocus);
        }
        syncOpenState();
      }

      function startBrowse() {
        if (state.disabled) return;
        ensureLayer();
        state._browse = state.value.slice();
        state._activeLevel = 0;
        var firstNodes = state._options;
        var firstSelected = state._path.length ? findCascaderNode(firstNodes, state._path[0].value) : null;
        state._activeIndex = firstSelected ? firstSelected.index : firstOptionIndex(firstNodes);
        renderPopup(false);
        layer.open();
        syncOpenState();
        focusActiveOption();
      }

      function openPanel() {
        if (state.disabled) return;
        if (layer && layer.isOpen()) return;
        ensureLayer();
        startBrowse();
      }

      function closePanel(reason) {
        if (layer && layer.isOpen()) layer.close(reason || 'api');
        syncOpenState();
      }

      function togglePanel() {
        if (layer && layer.isOpen()) closePanel('api');
        else openPanel();
      }

      function setActive(level, index, focusWanted) {
        state._activeLevel = level;
        state._activeIndex = index;
        renderPopup(focusWanted !== false);
      }

      function nodeForOption(level, index) {
        var column = state._columns[level];
        return column && column.nodes[index] ? column.nodes[index] : null;
      }

      function expandOption(level, index) {
        var node = nodeForOption(level, index);
        if (!node || node.disabled || !node.children.length) return false;
        var ancestors = currentBrowsePath().slice(0, level).map(function (entry) { return entry.value; });
        state._browse = ancestors.concat([node.value]);
        state._activeLevel = level + 1;
        state._activeIndex = firstOptionIndex(node.children);
        renderPopup(true);
        return true;
      }

      function commitOption(level, index, event) {
        var node = nodeForOption(level, index);
        if (!node || node.disabled) return;
        var ancestors = currentBrowsePath().slice(0, level);
        var finalPath = ancestors.concat([node]);
        var values = pathValues(finalPath);
        state.value = values;
        state._path = finalPath;
        state._browse = values.slice();
        closePanel('select');
        render();
        if (typeof state.onChange === 'function') {
          state.onChange(values.slice(), finalPath.map(function (entry) { return entry.raw; }), event);
        }
      }

      function activateOption(level, index, event) {
        var node = nodeForOption(level, index);
        if (!node || node.disabled) return;
        state._activeLevel = level;
        state._activeIndex = index;
        if (node.children.length) expandOption(level, index);
        else commitOption(level, index, event);
      }

      function popupClicked(event) {
        var option = event.target && event.target.closest ?
          event.target.closest('.nui-cascader__option') : null;
        if (!option || !columnsHost.contains(option)) return;
        var level = Number(option.getAttribute('data-cascader-level'));
        var index = Number(option.getAttribute('data-cascader-index'));
        if (!isFinite(level) || !isFinite(index)) return;
        activateOption(level, index, event);
      }

      function popupKeyed(event) {
        if (!layer || !layer.isOpen()) return;
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        var option = event.target && event.target.closest ?
          event.target.closest('.nui-cascader__option') : null;
        if (!option || !columnsHost.contains(option)) return;
        var level = Number(option.getAttribute('data-cascader-level'));
        var index = Number(option.getAttribute('data-cascader-index'));
        var column = state._columns[level];
        if (!column) return;
        var nodes = column.nodes;
        var handled = true;
        if (event.key === 'ArrowDown' || event.key === 'Down') {
          setActive(level, Math.min(nodes.length - 1, index + 1));
        } else if (event.key === 'ArrowUp' || event.key === 'Up') {
          setActive(level, Math.max(0, index - 1));
        } else if (event.key === 'Home') {
          setActive(level, 0);
        } else if (event.key === 'End') {
          setActive(level, nodes.length - 1);
        } else if (event.key === 'ArrowLeft' || event.key === 'Left') {
          if (level > 0) {
            var previousColumn = state._columns[level - 1];
            var previousPath = currentBrowsePath();
            var wanted = previousPath[level - 1];
            var previousIndex = wanted ? previousColumn.nodes.findIndex(function (node) {
              return Object.is(node.value, wanted.value);
            }) : -1;
            if (previousIndex < 0) previousIndex = firstOptionIndex(previousColumn.nodes);
            setActive(level - 1, previousIndex);
          }
        } else if (event.key === 'ArrowRight' || event.key === 'Right') {
          var current = nodes[index];
          if (current && current.children.length && !current.disabled) {
            expandOption(level, index);
          }
        } else if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
          activateOption(level, index, event);
        } else {
          handled = false;
        }
        if (handled) event.preventDefault();
      }

      function clearValue(event) {
        if (state.disabled || !state.clearable || !state._path.length) return;
        state.value = [];
        state._path = [];
        state._browse = [];
        closePanel('api');
        render();
        if (typeof state.onChange === 'function') state.onChange([], [], event);
      }

      bag.on('click', function (event) {
        var action = event.target && event.target.closest ?
          event.target.closest('[data-cascader-action]') : null;
        if (!action) {
          if (event.target === trigger || trigger.contains(event.target)) {
            event.preventDefault();
            togglePanel();
          }
          return;
        }
        var name = action.getAttribute('data-cascader-action');
        if (name === 'toggle') {
          event.preventDefault();
          if (state._suppressAnchorClick) {
            state._suppressAnchorClick = false;
            return;
          }
          togglePanel();
        } else if (name === 'clear') {
          event.preventDefault();
          clearValue(event);
        }
      });
      bag.on('keydown', function (event) {
        if (event.target !== trigger) return;
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
          state._suppressAnchorClick = false;
          return;
        }
        if (event.key === 'ArrowDown' || event.key === 'Down' ||
            event.key === 'ArrowUp' || event.key === 'Up') {
          event.preventDefault();
          openPanel();
        }
      });

      trigger.setAttribute('data-cascader-action', 'toggle');
      clearButton.setAttribute('data-cascader-action', 'clear');
      windowBag.on('pointerdown', function (event) {
        var target = event.target;
        state._suppressAnchorClick = !!(layer && layer.isOpen() && target &&
          (target === trigger || trigger.contains(target)));
      }, true);

      var inst = C.component(root, state, render, function () {
        alive = false;
        bag.clear();
        windowBag.clear();
        if (popupBag) {
          popupBag.clear();
          popupBag = null;
        }
        if (layer) {
          layer.destroy();
          layer = null;
        }
        panelEl = null;
        columnsHost = null;
      });

      inst.getValue = function () {
        return state._path.map(function (node) { return node.value; });
      };

      render();
      host.appendChild(root);
      return inst;
    }
  };

  /* -----------------------------------------------------------------------
   * X05 — TreeSelect
   * -------------------------------------------------------------------- */

  function readableLabel(value) {
    if (value && (value.nodeType === 1 || value.nodeType === 3 || value.nodeType === 11)) {
      return text(value.textContent || value.nodeValue || '');
    }
    return text(value);
  }

  function treeNodeMap(nodes) {
    var map = Object.create(null);
    var list = [];
    function walk(items, parentPath) {
      (Array.isArray(items) ? items : []).forEach(function (raw) {
        if (!raw || typeof raw !== 'object') return;
        var id = own(raw, 'id') ? raw.id : own(raw, 'value') ? raw.value : undefined;
        var entry = {
          raw: raw,
          id: id,
          key: valueKey(id),
          label: raw.label == null ? text(id) : raw.label,
          disabled: Boolean(raw.disabled),
          parentPath: parentPath,
          children: Array.isArray(raw.children) ? raw.children : []
        };
        list.push(entry);
        if (!own(map, entry.key)) map[entry.key] = entry;
        walk(raw.children, parentPath.concat([entry]));
      });
    }
    walk(nodes, []);
    return { map: map, list: list };
  }

  function normalizeTreeValue(raw, multi) {
    var values;
    if (multi) {
      values = Array.isArray(raw) ? raw.slice() : (raw == null ? [] : [raw]);
    } else if (Array.isArray(raw)) {
      values = raw.length ? [raw[raw.length - 1]] : [];
    } else {
      values = raw == null ? [] : [raw];
    }
    return uniqueValues(values.filter(function (value) { return value !== undefined; }));
  }

  function treeSelectedShape(values, multi) {
    if (multi) return values.slice();
    return values.length ? values[values.length - 1] : null;
  }

  NoteUI.TreeSelect = {
    version: VERSION,
    mount: function (host, options) {
      validateHost(host);
      var C = core();
      if (!NoteUI.TreeView || typeof NoteUI.TreeView.mount !== 'function') {
        throw new Error('NoteUI.TreeSelect 需要先加载 ui-navigation（NoteUI.TreeView）；' +
          '加载顺序应为 core → ui-navigation → ui-extended，或直接使用整库/模块依赖顺序。');
      }
      var input = options && typeof options === 'object' ? options : {};
      var root = make('div', 'nui-treeselect');
      var trigger = make('button', 'nui-treeselect__trigger');
      var summary = make('span', 'nui-treeselect__summary');
      var count = make('span', 'nui-treeselect__count');
      var indicator = make('span', 'nui-treeselect__indicator', '▾');
      var clearButton = make('button', 'nui-treeselect__clear');
      var live = make('span', 'nui-treeselect__live hnv-visually-hidden');
      var panelId = uid('nui-treeselect-panel');
      var helpId = uid('nui-treeselect-help');
      var bag = C.listeners(root);
      var windowBag = C.listeners(global);
      var layer = null;
      var panelEl = null;
      var treeHost = null;
      var emptyEl = null;
      var hintEl = null;
      var treeView = null;
      var alive = true;
      var state = null;

      trigger.type = 'button';
      trigger.setAttribute('aria-haspopup', 'tree');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', panelId);
      indicator.setAttribute('aria-hidden', 'true');
      append(trigger, summary, count, indicator);
      clearButton.type = 'button';
      clearButton.setAttribute('aria-label', '清除树形选择');
      clearButton.appendChild(make('span', 'nui-treeselect__clear-glyph', '×'));
      clearButton.firstChild.setAttribute('aria-hidden', 'true');
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('aria-atomic', 'true');
      append(root, trigger, clearButton, live);

      state = {
        nodes: Array.isArray(input.nodes) ? input.nodes : [],
        value: input.value,
        multi: Boolean(input.multi),
        placeholder: input.placeholder == null ? '请选择' : text(input.placeholder),
        clearable: input.clearable !== false,
        disabled: Boolean(input.disabled),
        expanded: input.expanded,
        label: input.label == null ? '树形选择' : text(input.label),
        emptyText: input.emptyText == null ? '暂无可选节点' : text(input.emptyText),
        onChange: typeof input.onChange === 'function' ? input.onChange : null,
        _flat: { map: Object.create(null), list: [] },
        _selected: [],
        _treeStale: true,
        _open: false,
        _suppressAnchorClick: false
      };

      function syncOpenState() {
        if (!alive) return;
        var open = !!(layer && layer.isOpen());
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
        root.classList.toggle('is-open', open);
      }

      function selectedValues() {
        return normalizeTreeValue(state.value, state.multi);
      }

      function selectedNodes(values) {
        var result = [];
        (values || []).forEach(function (value) {
          var entry = state._flat.map[valueKey(value)];
          if (entry) result.push(entry.raw);
        });
        return result;
      }

      function summaryParts(values) {
        return values.map(function (value) {
          var entry = state._flat.map[valueKey(value)];
          return entry ? readableLabel(entry.label) : text(value);
        });
      }

      function updatePanelHint() {
        if (!hintEl) return;
        hintEl.textContent = state.multi ?
          '可选择多项；点击面板外部或按 Esc 完成。' :
          '选择一项后将自动关闭。';
        setHidden(emptyEl, !!state.nodes.length);
      }

      function renderTrigger() {
        state._flat = treeNodeMap(state.nodes);
        state._selected = selectedValues();
        var labels = summaryParts(state._selected);
        var summaryText = labels.join('、');
        summary.textContent = summaryText || state.placeholder;
        summary.classList.toggle('is-placeholder', !summaryText);
        count.textContent = state.multi && state._selected.length ? state._selected.length + ' 项' : '';
        setHidden(count, !state.multi || !state._selected.length);
        trigger.disabled = state.disabled;
        trigger.setAttribute('aria-label',
          state.label + '：' + (summaryText || state.placeholder));
        setHidden(clearButton, !state.clearable || state.disabled || !state._selected.length);
        clearButton.disabled = state.disabled;
        root.classList.toggle('is-disabled', state.disabled);
        setHidden(indicator, false);
        if (layer) layer.el.setAttribute('aria-label', state.label);
        readLive(live, state._selected.length ?
          ('已选择 ' + state._selected.length + ' 项：' + summaryText) : '未选择树形项');
        updatePanelHint();
        syncOpenState();
      }

      function ensureLayer() {
        if (layer) return layer;
        panelEl = make('div', 'nui-treeselect__panel');
        panelEl.id = panelId;
        panelEl.tabIndex = -1;
        treeHost = make('div', 'nui-treeselect__tree');
        emptyEl = make('p', 'nui-treeselect__empty', state.emptyText);
        hintEl = make('p', 'nui-treeselect__hint');
        var help = make('p', 'hnv-visually-hidden',
          '使用上下方向键在树中移动，左右方向键展开或收起，Enter 选择，Esc 关闭。');
        help.id = helpId;
        append(panelEl, treeHost, emptyEl, hintEl, help);
        layer = C.floating.create({
          anchor: trigger,
          content: panelEl,
          placement: 'bottom-start',
          offset: 6,
          role: 'dialog',
          className: 'nui-treeselect__popup',
          modal: false,
          trapFocus: true,
          returnFocus: true,
          closeOnEsc: true,
          closeOnOutside: true,
          lockScroll: false,
          maxWidth: 'min(94vw, 30rem)',
          onOpen: function () {
            state._open = true;
            syncOpenState();
          },
          onClose: function () {
            state._open = false;
            syncOpenState();
          }
        });
        layer.el.setAttribute('aria-label', state.label);
        layer.el.setAttribute('aria-describedby', helpId);
        updatePanelHint();
        return layer;
      }

      function destroyTree() {
        if (treeView) {
          try { treeView.destroy(); } catch (error) {}
          treeView = null;
        }
        if (treeHost) treeHost.replaceChildren();
      }

      function buildTree() {
        ensureLayer();
        destroyTree();
        setHidden(emptyEl, !!state.nodes.length);
        setHidden(treeHost, !state.nodes.length);
        if (!state.nodes.length) {
          state._treeStale = false;
          return;
        }
        var values = selectedValues();
        treeView = NoteUI.TreeView.mount(treeHost, {
          nodes: state.nodes,
          expanded: state.expanded,
          selected: treeSelectedShape(values, state.multi),
          multi: state.multi,
          label: state.label,
          onSelect: function (selection, event) {
            treeSelected(selection, event);
          }
        });
        state._treeStale = false;
      }

      function rememberSelection(values, event) {
        var normalized = normalizeTreeValue(values, state.multi);
        var old = selectedValues();
        if (signatureOf(normalized) === signatureOf(old)) return false;
        state.value = state.multi ? normalized.slice() : (normalized.length ? normalized[normalized.length - 1] : null);
        state._selected = normalized;
        renderTrigger();
        return true;
      }

      function treeSelected(selection, event) {
        if (!alive) return;
        var changed = rememberSelection(selection, event);
        if (!changed) return;
        if (!state.multi && layer && layer.isOpen()) layer.close('select');
        if (typeof state.onChange === 'function') {
          var value = state.multi ? selectedValues().slice() : (state._selected.length ? state._selected[state._selected.length - 1] : null);
          state.onChange(value, selectedNodes(state._selected), event || null);
        }
      }

      function focusTree() {
        if (!treeView || !treeView.el) {
          if (panelEl) focusNode(panelEl);
          return;
        }
        var item = treeView.el.querySelector('[role="treeitem"][tabindex="0"]');
        if (!item) item = treeView.el.querySelector('[role="treeitem"]');
        if (item) {
          if (item.tabIndex < 0) item.tabIndex = 0;
          focusNode(item);
          return;
        }
        if (!focusNode(treeView.el)) focusNode(panelEl);
      }

      function openPanel() {
        if (state.disabled || !alive) return;
        ensureLayer();
        if (state._treeStale) buildTree();
        updatePanelHint();
        layer.open();
        syncOpenState();
        focusTree();
      }

      function closePanel(reason) {
        if (layer && layer.isOpen()) layer.close(reason || 'api');
        syncOpenState();
      }

      function togglePanel() {
        if (layer && layer.isOpen()) closePanel('api');
        else openPanel();
      }

      function clearValue(event) {
        if (state.disabled || !state.clearable || !state._selected.length) return;
        state.value = state.multi ? [] : null;
        state._selected = [];
        if (treeView) {
          try { treeView.update({ selected: state.multi ? [] : null }); } catch (error) {
            state._treeStale = true;
          }
        }
        closePanel('api');
        renderTrigger();
        if (typeof state.onChange === 'function') {
          state.onChange(state.multi ? [] : null, [], event);
        }
      }

      bag.on('click', function (event) {
        var action = event.target && event.target.closest ?
          event.target.closest('[data-treeselect-action]') : null;
        if (!action) {
          if (event.target === trigger || trigger.contains(event.target)) {
            event.preventDefault();
            togglePanel();
          }
          return;
        }
        var name = action.getAttribute('data-treeselect-action');
        if (name === 'toggle') {
          event.preventDefault();
          if (state._suppressAnchorClick) {
            state._suppressAnchorClick = false;
            return;
          }
          togglePanel();
        } else if (name === 'clear') {
          event.preventDefault();
          clearValue(event);
        }
      });
      bag.on('keydown', function (event) {
        if (event.target !== trigger) return;
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
          state._suppressAnchorClick = false;
          return;
        }
        if (event.key === 'ArrowDown' || event.key === 'Down' ||
            event.key === 'ArrowUp' || event.key === 'Up') {
          event.preventDefault();
          openPanel();
        }
      });
      trigger.setAttribute('data-treeselect-action', 'toggle');
      clearButton.setAttribute('data-treeselect-action', 'clear');
      windowBag.on('pointerdown', function (event) {
        var target = event.target;
        state._suppressAnchorClick = !!(layer && layer.isOpen() && target &&
          (target === trigger || trigger.contains(target)));
      }, true);

      function render() {
        renderTrigger();
        if (layer && layer.isOpen() && (state._treeStale || state.disabled)) {
          closePanel('api');
        }
      }

      var inst = C.component(root, state, render, function () {
        alive = false;
        bag.clear();
        windowBag.clear();
        destroyTree();
        if (layer) {
          layer.destroy();
          layer = null;
        }
        panelEl = null;
        treeHost = null;
        hintEl = null;
        emptyEl = null;
      });

      var baseUpdate = inst.update;
      inst.update = function (patch) {
        if (inst.destroyed || !patch || typeof patch !== 'object') return;
        /* Nodes and multi change the tree structure and require a rebuild; value,
         * expanded and label are pushed into the live TreeView instead, so a host
         * sync keeps expansion state the reader created in the popup. */
        if (own(patch, 'nodes') || own(patch, 'multi')) state._treeStale = true;
        if (own(patch, 'emptyText') && emptyEl) emptyEl.textContent = text(patch.emptyText);
        if (own(patch, 'nodes') && Array.isArray(patch.nodes)) state.nodes = patch.nodes;
        var result = baseUpdate(patch);
        if (!state._treeStale && treeView && typeof treeView.update === 'function') {
          try {
            if (own(patch, 'value')) {
              treeView.update({ selected: treeSelectedShape(selectedValues(), state.multi) });
            }
            if (own(patch, 'expanded')) treeView.update({ expanded: state.expanded });
            if (own(patch, 'label')) treeView.update({ label: state.label });
          } catch (error) {
            state._treeStale = true;
          }
        }
        return result;
      };

      inst.getValue = function () {
        if (state.multi) return selectedValues();
        var values = selectedValues();
        return values.length ? values[values.length - 1] : null;
      };

      renderTrigger();
      host.appendChild(root);
      return inst;
    }
  };

  /* -----------------------------------------------------------------------
   * X06 — TransferList
   * -------------------------------------------------------------------- */

  function normalizeTransferItems(items) {
    return (Array.isArray(items) ? items : []).filter(function (item) {
      return item != null;
    }).map(function (item) {
      if (typeof item !== 'object') {
        return { value: item, label: text(item), disabled: false, key: valueKey(item) };
      }
      var value = own(item, 'value') ? item.value : item.id;
      return {
        value: value,
        label: item.label == null ? text(value) : text(item.label),
        disabled: Boolean(item.disabled),
        key: valueKey(value)
      };
    });
  }

  function normalizeTransferTitles(titles) {
    if (Array.isArray(titles)) {
      return {
        source: titles[0] == null ? '候选' : text(titles[0]),
        target: titles[1] == null ? '已选' : text(titles[1])
      };
    }
    if (titles && typeof titles === 'object') {
      return {
        source: titles.source == null ? '候选' : text(titles.source),
        target: titles.target == null ? '已选' : text(titles.target)
      };
    }
    return { source: '候选', target: '已选' };
  }

  NoteUI.TransferList = {
    version: VERSION,
    mount: function (host, options) {
      validateHost(host);
      var C = core();
      var input = options && typeof options === 'object' ? options : {};
      var root = make('div', 'nui-transfer');
      var layout = make('div', 'nui-transfer__layout');
      var baseId = uid('nui-transfer');
      var bag = C.listeners(root);
      var alive = true;
      var state = {
        source: normalizeTransferItems(input.source),
        target: normalizeTransferItems(input.target),
        titles: normalizeTransferTitles(input.titles),
        filterable: input.filterable !== false,
        disabled: Boolean(input.disabled),
        label: input.label == null ? '穿梭选择' : text(input.label),
        onChange: typeof input.onChange === 'function' ? input.onChange : null,
        filters: { source: '', target: '' },
        selected: { source: Object.create(null), target: Object.create(null) }
      };

      root.setAttribute('role', 'group');
      root.setAttribute('aria-label', state.label);

      function buildSide(side, label) {
        var section = make('section', 'nui-transfer__side');
        var titleId = baseId + '-title-' + side;
        var filterId = baseId + '-filter-' + side;
        var header = make('div', 'nui-transfer__header');
        var title = make('span', 'nui-transfer__title', label);
        var count = make('span', 'nui-transfer__count');
        var filterWrap = make('label', 'nui-transfer__filter');
        var filter = make('input', 'nui-transfer__search');
        var list = make('div', 'nui-transfer__list');
        var empty = make('p', 'nui-transfer__empty');
        title.id = titleId;
        section.setAttribute('aria-labelledby', titleId);
        filter.htmlFor = filterId;
        filter.id = filterId;
        filter.type = 'search';
        filter.autocomplete = 'off';
        filter.setAttribute('data-transfer-filter', side);
        filter.setAttribute('placeholder', '筛选' + label);
        var filterCap = make('span', 'hnv-visually-hidden', '筛选' + label);
        filterWrap.appendChild(filterCap);
        filterWrap.appendChild(filter);
        list.setAttribute('role', 'list');
        list.setAttribute('aria-label', label + '选项');
        empty.setAttribute('role', 'status');
        append(header, title, count);
        append(section, header, filterWrap, list, empty);
        return {
          section: section,
          title: title,
          titleId: titleId,
          count: count,
          filterWrap: filterWrap,
          filter: filter,
          list: list,
          empty: empty
        };
      }

      function buildAction(direction) {
        var button = make('button', 'nui-transfer__action');
        var glyph = make('span', 'nui-transfer__action-glyph');
        var label = make('span', 'nui-transfer__action-label');
        var count = make('span', 'nui-transfer__action-count');
        button.type = 'button';
        button.setAttribute('data-transfer-action', direction);
        glyph.setAttribute('aria-hidden', 'true');
        count.setAttribute('aria-hidden', 'true');
        append(button, glyph, label, count);
        return { button: button, glyph: glyph, label: label, count: count };
      }

      var sides = {
        source: buildSide('source', state.titles.source),
        target: buildSide('target', state.titles.target)
      };
      var actions = make('div', 'nui-transfer__actions');
      actions.setAttribute('role', 'group');
      actions.setAttribute('aria-label', '移动选项');
      var toTarget = buildAction('to-target');
      var toSource = buildAction('to-source');
      toTarget.glyph.textContent = '→';
      toSource.glyph.textContent = '←';
      append(actions, toTarget.button, toSource.button);
      var note = make('p', 'nui-transfer__note',
        '使用复选框选择后移动；两侧筛选互不影响，筛选只改变列表显示。');
      var live = make('span', 'nui-transfer__live hnv-visually-hidden');
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('aria-atomic', 'true');
      append(layout, sides.source.section, actions, sides.target.section);
      append(root, layout, note, live);

      function otherSide(side) {
        return side === 'source' ? 'target' : 'source';
      }

      function sideItems(side) {
        return side === 'source' ? state.source : state.target;
      }

      function pruneSelection() {
        ['source', 'target'].forEach(function (side) {
          var selected = state.selected[side];
          var present = Object.create(null);
          sideItems(side).forEach(function (item) {
            if (!item.disabled && own(selected, item.key)) present[item.key] = true;
          });
          state.selected[side] = present;
        });
      }

      function selectedItems(side) {
        var map = state.selected[side];
        return sideItems(side).filter(function (item) {
          return !item.disabled && own(map, item.key);
        });
      }

      function filteredItems(side) {
        var query = state.filters[side].trim().toLowerCase();
        if (!query) return sideItems(side).slice();
        var terms = query.split(/\s+/);
        return sideItems(side).filter(function (item) {
          var haystack = (item.label + ' ' + text(item.value)).toLowerCase();
          return terms.every(function (term) { return haystack.indexOf(term) >= 0; });
        });
      }

      function updateActionButton(entry, side, count) {
        var title = state.titles[otherSide(side)];
        entry.button.disabled = state.disabled || !count;
        entry.label.textContent = '移至' + title;
        entry.count.textContent = count ? String(count) : '';
        entry.button.setAttribute('aria-label', count ?
          '将 ' + count + ' 项移至' + title : '没有选中的' + state.titles[side] + '项可移动');
      }

      function syncActions() {
        var sourceSelected = selectedItems('source').length;
        var targetSelected = selectedItems('target').length;
        updateActionButton(toTarget, 'source', sourceSelected);
        updateActionButton(toSource, 'target', targetSelected);
        root.classList.toggle('is-disabled', state.disabled);
        if (state.disabled) root.setAttribute('aria-disabled', 'true');
        else root.removeAttribute('aria-disabled');
      }

      function renderSide(side) {
        var entry = sides[side];
        var all = sideItems(side);
        var filtered = filteredItems(side);
        var query = state.filters[side].trim();
        entry.title.textContent = state.titles[side];
        setHidden(entry.filterWrap, !state.filterable);
        entry.filter.disabled = state.disabled;
        if (entry.filter.value !== state.filters[side]) entry.filter.value = state.filters[side];
        entry.filter.setAttribute('placeholder', '筛选' + state.titles[side]);
        entry.count.textContent = query ?
          filtered.length + ' / ' + all.length + ' 项' : all.length + ' 项';
        entry.list.replaceChildren();
        filtered.forEach(function (item) {
          var row = make('div', 'nui-transfer__item');
          row.setAttribute('role', 'listitem');
          var label = make('label', 'nui-transfer__item-label');
          var checkbox = make('input', 'nui-transfer__checkbox');
          checkbox.type = 'checkbox';
          checkbox.setAttribute('data-transfer-side', side);
          checkbox.setAttribute('data-transfer-key', item.key);
          checkbox.checked = own(state.selected[side], item.key);
          checkbox.disabled = state.disabled || item.disabled;
          var labelText = make('span', 'nui-transfer__item-text', item.label);
          append(label, checkbox, labelText);
          if (item.disabled) {
            row.classList.add('is-disabled');
            var flag = make('span', 'nui-transfer__item-flag', '不可移动');
            label.appendChild(flag);
          }
          row.appendChild(label);
          entry.list.appendChild(row);
        });
        entry.list.hidden = filtered.length === 0;
        if (!filtered.length) {
          entry.empty.textContent = query ? '没有匹配项' : (side === 'source' ? '暂无候选' : '暂无已选项');
          setHidden(entry.empty, false);
        } else {
          setHidden(entry.empty, true);
        }
      }

      function render() {
        state.source = normalizeTransferItems(state.source);
        state.target = normalizeTransferItems(state.target);
        state.titles = normalizeTransferTitles(state.titles);
        pruneSelection();
        root.setAttribute('aria-label', state.label);
        sides.source.title.textContent = state.titles.source;
        sides.target.title.textContent = state.titles.target;
        renderSide('source');
        renderSide('target');
        syncActions();
      }

      function updateSelection(side, key, checked) {
        if (state.disabled) return;
        if (checked) state.selected[side][key] = true;
        else delete state.selected[side][key];
        syncActions();
      }

      function move(from, event) {
        if (state.disabled) return;
        var destination = otherSide(from);
        var moving = selectedItems(from);
        if (!moving.length) return;
        var movingKeys = Object.create(null);
        moving.forEach(function (item) { movingKeys[item.key] = true; });
        var fromItems = sideItems(from).filter(function (item) { return !own(movingKeys, item.key); });
        var toItems = sideItems(destination).concat(moving);
        if (from === 'source') {
          state.source = fromItems;
          state.target = toItems;
        } else {
          state.target = fromItems;
          state.source = toItems;
        }
        state.selected[from] = Object.create(null);
        render();
        readLive(live, '已将 ' + moving.length + ' 项移至' + state.titles[destination]);
        if (typeof state.onChange === 'function') {
          state.onChange(state.target.map(function (item) { return item.value; }),
            moving.map(function (item) { return item.value; }), event);
        }
      }

      bag.on('input', function (event) {
        var filter = event.target && event.target.closest ?
          event.target.closest('[data-transfer-filter]') : null;
        if (!filter || !root.contains(filter)) return;
        var side = filter.getAttribute('data-transfer-filter');
        if (side !== 'source' && side !== 'target') return;
        state.filters[side] = filter.value;
        renderSide(side);
      });
      bag.on('change', function (event) {
        var checkbox = event.target;
        if (!checkbox || checkbox.type !== 'checkbox' ||
            !checkbox.hasAttribute('data-transfer-side')) return;
        var side = checkbox.getAttribute('data-transfer-side');
        var key = checkbox.getAttribute('data-transfer-key');
        if ((side !== 'source' && side !== 'target') || !key) return;
        updateSelection(side, key, checkbox.checked);
      });
      bag.on('click', function (event) {
        var button = event.target && event.target.closest ?
          event.target.closest('[data-transfer-action]') : null;
        if (!button || !root.contains(button)) return;
        if (button.disabled) return;
        var direction = button.getAttribute('data-transfer-action');
        if (direction === 'to-target') move('source', event);
        else if (direction === 'to-source') move('target', event);
      });

      var inst = C.component(root, state, render, function () {
        alive = false;
        bag.clear();
      });
      inst.getValue = function () {
        return state.target.map(function (item) { return item.value; });
      };
      var baseUpdate = inst.update;
      inst.update = function (patch) {
        if (inst.destroyed || !patch || typeof patch !== 'object') return;
        var next = C.assign({}, patch);
        if (own(next, 'source')) next.source = normalizeTransferItems(next.source);
        if (own(next, 'target')) next.target = normalizeTransferItems(next.target);
        if (own(next, 'titles')) next.titles = normalizeTransferTitles(next.titles);
        return baseUpdate(next);
      };
      render();
      host.appendChild(root);
      return inst;
    }
  };
})(window);

/* ---- source: src/ui/extended-command.js ---- */
/* NoteUI extended — X07 CommandPalette.
 * Internal helpers: window.NoteUIInternals.extended (extended-shared.js).
 * Depends on: NoteCore. Commands are local and host-provided; the dialog reuses
 * NoteCore.floating. No fetch, eval, HTML string injection. */
(function (global) {
  'use strict';

  var NoteUI = global.NoteUI = global.NoteUI || {};
  var shared = global.NoteUIInternals && global.NoteUIInternals.extended;
  if (!shared) {
    throw new Error('ui-extended 组件需要先加载 src/ui/extended-shared.js（内部共享 helper）。');
  }
  var core = shared.core;
  var own = shared.own;
  var text = shared.text;
  var make = shared.make;
  var validateHost = shared.validateHost;
  var uid = shared.uid;
  var isNode = shared.isNode;
  var append = shared.append;
  var setHidden = shared.setHidden;
  var focusNode = shared.focusNode;
  var isEditableTarget = shared.isEditableTarget;
  var valueKey = shared.valueKey;
  var signatureOf = shared.signatureOf;
  var uniqueValues = shared.uniqueValues;
  var appendContent = shared.appendContent;
  var readLive = shared.readLive;
  var VERSION = shared.VERSION;


  /* -----------------------------------------------------------------------
   * X07 — CommandPalette
   * -------------------------------------------------------------------- */

  function normalizeCommands(commands) {
    return (Array.isArray(commands) ? commands : []).filter(function (command) {
      return command && typeof command === 'object';
    }).map(function (command, index) {
      var keywords = Array.isArray(command.keywords) ? command.keywords.map(text).join(' ') :
        text(command.keywords);
      return {
        raw: command,
        id: command.id == null ? 'command-' + (index + 1) : command.id,
        label: command.label == null ? ('命令 ' + (index + 1)) : text(command.label),
        group: command.group == null || String(command.group).trim() === '' ? '命令' : text(command.group),
        keywords: keywords,
        shortcut: command.shortcut == null ? '' : text(command.shortcut),
        disabled: Boolean(command.disabled),
        run: typeof command.run === 'function' ? command.run : null
      };
    });
  }

  function parseHotkey(value) {
    if (!value) return null;
    var raw = value;
    var parts;
    if (typeof raw === 'string') {
      parts = raw.split('+').map(function (part) { return part.trim(); }).filter(Boolean);
      if (!parts.length) return null;
      var key = parts.pop().toLowerCase();
      var spec = { key: key === 'space' ? ' ' : key, ctrl: false, meta: false, alt: false, shift: false, mod: false };
      parts.forEach(function (part) {
        var token = part.toLowerCase();
        if (token === 'ctrl' || token === 'control') spec.ctrl = true;
        else if (token === 'meta' || token === 'cmd' || token === 'command') spec.meta = true;
        else if (token === 'alt' || token === 'option') spec.alt = true;
        else if (token === 'shift') spec.shift = true;
        else if (token === 'mod') spec.mod = true;
      });
      return spec;
    }
    if (typeof raw === 'object' && raw.key) {
      var objectKey = text(raw.key).toLowerCase();
      return {
        key: objectKey === 'space' ? ' ' : objectKey,
        ctrl: Boolean(raw.ctrl),
        meta: Boolean(raw.meta),
        alt: Boolean(raw.alt),
        shift: Boolean(raw.shift),
        mod: Boolean(raw.mod)
      };
    }
    return null;
  }

  function hotkeyMatches(spec, event) {
    if (!spec || !event) return false;
    var key = text(event.key).toLowerCase();
    if (key !== spec.key) return false;
    if (spec.mod) {
      if (!(event.ctrlKey || event.metaKey)) return false;
    } else if (Boolean(event.ctrlKey) !== spec.ctrl || Boolean(event.metaKey) !== spec.meta) {
      return false;
    }
    if (Boolean(event.altKey) !== spec.alt) return false;
    if (Boolean(event.shiftKey) !== spec.shift) return false;
    return true;
  }

  NoteUI.CommandPalette = {
    version: VERSION,
    mount: function (host, options) {
      validateHost(host);
      var C = core();
      var input = options && typeof options === 'object' ? options : {};
      var root = make('div', 'nui-command-host');
      var docBag = C.listeners(document);
      var layer = null;
      var panelEl = null;
      var searchInput = null;
      var closeButton = null;
      var listEl = null;
      var emptyEl = null;
      var countEl = null;
      var resultHint = null;
      var listId = uid('nui-command-list');
      var helpId = uid('nui-command-help');
      var alive = true;
      var state = {
        commands: normalizeCommands(input.commands),
        placeholder: input.placeholder == null ? '输入命令或关键词…' : text(input.placeholder),
        emptyText: input.emptyText == null ? '没有匹配的命令' : text(input.emptyText),
        label: input.label == null ? '命令面板' : text(input.label),
        hotkeySpec: parseHotkey(input.hotkey),
        query: '',
        _matches: [],
        _groups: [],
        _activeIndex: -1,
        _open: false
      };

      function normalizedQuery() {
        return state.query.trim().toLowerCase();
      }

      function matchesFor(query) {
        var terms = query ? query.split(/\s+/) : [];
        return state.commands.filter(function (command) {
          if (!terms.length) return true;
          var haystack = (command.label + ' ' + command.group + ' ' + command.keywords).toLowerCase();
          return terms.every(function (term) { return haystack.indexOf(term) >= 0; });
        });
      }

      function firstEnabled() {
        for (var index = 0; index < state._matches.length; index += 1) {
          if (!state._matches[index].disabled) return index;
        }
        return -1;
      }

      function lastEnabled() {
        for (var index = state._matches.length - 1; index >= 0; index -= 1) {
          if (!state._matches[index].disabled) return index;
        }
        return -1;
      }

      function stepEnabled(from, direction) {
        var count = state._matches.length;
        if (!count) return -1;
        var index = from;
        for (var step = 0; step < count; step += 1) {
          index += direction;
          if (index < 0) index = count - 1;
          if (index >= count) index = 0;
          if (!state._matches[index].disabled) return index;
        }
        return -1;
      }

      function optionId(index) {
        return listId + '-option-' + index;
      }

      function applyActive() {
        if (!listEl) return;
        Array.prototype.forEach.call(listEl.querySelectorAll('[role="option"]'), function (option) {
          var index = Number(option.getAttribute('data-command-index'));
          var active = index === state._activeIndex;
          option.classList.toggle('is-active', active);
          option.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        if (state._activeIndex >= 0 && state._activeIndex < state._matches.length) {
          searchInput.setAttribute('aria-activedescendant', optionId(state._activeIndex));
          var activeOption = listEl.querySelector('[data-command-index="' + state._activeIndex + '"]');
          if (activeOption) textUnderOption(activeOption);
        } else {
          searchInput.removeAttribute('aria-activedescendant');
        }
      }

      function textUnderOption(option) {
        if (!option) return;
        C.scrollIntoViewIfNeeded(option, listEl, { block: 'nearest' });
      }

      function setActive(index) {
        if (index < 0 || index >= state._matches.length || state._matches[index].disabled) return;
        state._activeIndex = index;
        applyActive();
      }

      function buildGroups() {
        var groups = [];
        var byKey = Object.create(null);
        state._matches.forEach(function (command, matchIndex) {
          var key = command.group;
          var group = byKey[key];
          if (!group) {
            group = { name: key, commands: [] };
            byKey[key] = group;
            groups.push(group);
          }
          group.commands.push({ command: command, matchIndex: matchIndex });
        });
        state._groups = groups;
      }

      function optionFor(command, matchIndex) {
        var option = make('div', 'nui-command__option');
        option.id = optionId(matchIndex);
        option.setAttribute('role', 'option');
        option.setAttribute('data-command-index', String(matchIndex));
        option.setAttribute('aria-selected', matchIndex === state._activeIndex ? 'true' : 'false');
        option.classList.toggle('is-active', matchIndex === state._activeIndex);
        if (command.disabled) option.setAttribute('aria-disabled', 'true');
        option.classList.toggle('is-disabled', command.disabled);
        append(option, make('span', 'nui-command__label', command.label));
        if (command.shortcut) {
          var shortcut = make('kbd', 'nui-command__shortcut', command.shortcut);
          shortcut.setAttribute('aria-label', '快捷键 ' + command.shortcut);
          option.appendChild(shortcut);
        }
        if (command.disabled) {
          option.appendChild(make('span', 'nui-command__unavailable', '不可用'));
        }
        return option;
      }

      function refreshMatches(options) {
        var settings = options && typeof options === 'object' ? options : {};
        state.query = settings.query == null ? state.query : text(settings.query);
        state._matches = matchesFor(normalizedQuery());
        buildGroups();
        if (settings.resetActive === false) {
          if (state._activeIndex < 0 || state._activeIndex >= state._matches.length ||
              state._matches[state._activeIndex].disabled) {
            state._activeIndex = firstEnabled();
          }
        } else {
          state._activeIndex = firstEnabled();
        }
      }

      function renderResults() {
        if (!listEl) return;
        listEl.replaceChildren();
        if (!state._matches.length) {
          setHidden(emptyEl, false);
          emptyEl.textContent = state.emptyText;
          searchInput.removeAttribute('aria-activedescendant');
        } else {
          setHidden(emptyEl, true);
          state._groups.forEach(function (group, index) {
            var groupEl = make('div', 'nui-command__group');
            groupEl.setAttribute('role', 'group');
            var headingId = listId + '-group-' + index;
            var heading = make('div', 'nui-command__group-label', group.name);
            heading.id = headingId;
            groupEl.setAttribute('aria-labelledby', headingId);
            groupEl.appendChild(heading);
            group.commands.forEach(function (entry) {
              groupEl.appendChild(optionFor(entry.command, entry.matchIndex));
            });
            listEl.appendChild(groupEl);
          });
        }
        var total = state.commands.length;
        if (normalizedQuery()) {
          countEl.textContent = state._matches.length + ' / ' + total + ' 个命令';
        } else {
          countEl.textContent = total + ' 个命令';
        }
        resultHint.textContent = state._matches.length ? '↑↓ 选择 · Enter 执行 · Esc 关闭' :
          '输入其他关键词试试，或按 Esc 关闭';
        applyActive();
      }

      function ensureLayer() {
        if (layer) return layer;
        panelEl = make('div', 'nui-command__panel');
        var searchRow = make('div', 'nui-command__search');
        var searchCap = make('span', 'hnv-visually-hidden', state.label + '，筛选命令');
        searchInput = make('input', 'nui-command__input');
        closeButton = make('button', 'nui-command__close');
        var body = make('div', 'nui-command__body');
        listEl = make('div', 'nui-command__list');
        emptyEl = make('p', 'nui-command__empty');
        var footer = make('div', 'nui-command__footer');
        resultHint = make('span', 'nui-command__hint');
        countEl = make('span', 'nui-command__count');
        var help = make('p', 'hnv-visually-hidden',
          '输入以筛选本地命令；上下方向键选择，Enter 执行，Esc 关闭。');
        help.id = helpId;
        searchInput.type = 'text';
        searchInput.autocomplete = 'off';
        searchInput.spellcheck = false;
        searchInput.setAttribute('role', 'combobox');
        searchInput.setAttribute('aria-autocomplete', 'list');
        searchInput.setAttribute('aria-haspopup', 'listbox');
        searchInput.setAttribute('aria-expanded', 'true');
        searchInput.setAttribute('aria-controls', listId);
        searchInput.setAttribute('aria-describedby', helpId);
        searchInput.placeholder = state.placeholder;
        searchInput.setAttribute('aria-label', state.label + '，筛选命令');
        closeButton.type = 'button';
        closeButton.setAttribute('aria-label', '关闭命令面板');
        closeButton.appendChild(make('span', 'nui-command__close-glyph', '×'));
        closeButton.firstChild.setAttribute('aria-hidden', 'true');
        listEl.id = listId;
        listEl.setAttribute('role', 'listbox');
        listEl.setAttribute('aria-label', state.label + '结果');
        emptyEl.setAttribute('role', 'status');
        countEl.setAttribute('aria-live', 'polite');
        append(searchRow, searchCap, searchInput, closeButton);
        append(body, listEl, emptyEl);
        append(footer, resultHint, countEl);
        append(panelEl, searchRow, body, footer, help);
        layer = C.floating.create({
          anchor: null,
          content: panelEl,
          modal: true,
          backdrop: true,
          trapFocus: true,
          returnFocus: true,
          closeOnEsc: true,
          closeOnOutside: true,
          lockScroll: true,
          role: 'dialog',
          className: 'nui-command__dialog',
          maxWidth: 'min(94vw, 40rem)',
          onOpen: function () {
            state._open = true;
            searchInput.setAttribute('aria-expanded', 'true');
          },
          onClose: function () {
            state._open = false;
            if (searchInput) searchInput.setAttribute('aria-expanded', 'false');
          }
        });
        layer.el.setAttribute('aria-label', state.label);
        layer.el.setAttribute('aria-describedby', helpId);
        var bag = C.listeners(panelEl);
        bag.on('click', function (event) {
          if (event.target === closeButton || closeButton.contains(event.target)) {
            event.preventDefault();
            close('api');
            return;
          }
          var option = event.target && event.target.closest ?
            event.target.closest('[role="option"]') : null;
          if (!option || !listEl.contains(option)) return;
          var index = Number(option.getAttribute('data-command-index'));
          if (!isFinite(index)) return;
          execute(index, event);
        });
        bag.on('keydown', function (event) {
          if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
          if (!layer || !layer.isOpen()) return;
          if (event.key === 'ArrowDown' || event.key === 'Down') {
            event.preventDefault();
            if (state._activeIndex < 0) setActive(firstEnabled());
            else setActive(stepEnabled(state._activeIndex, 1));
          } else if (event.key === 'ArrowUp' || event.key === 'Up') {
            event.preventDefault();
            if (state._activeIndex < 0) setActive(lastEnabled());
            else setActive(stepEnabled(state._activeIndex, -1));
          } else if (event.key === 'Home') {
            event.preventDefault();
            setActive(firstEnabled());
          } else if (event.key === 'End') {
            event.preventDefault();
            setActive(lastEnabled());
          } else if (event.key === 'Enter') {
            event.preventDefault();
            execute(state._activeIndex, event);
          }
        });
        bag.on('input', function (event) {
          if (event.target !== searchInput) return;
          refreshMatches({ query: searchInput.value, resetActive: true });
          renderResults();
        });
        layer.el._nuiCommandBag = bag;
        return layer;
      }

      function syncChrome() {
        if (!layer) return;
        layer.el.setAttribute('aria-label', state.label);
        if (searchInput) {
          searchInput.placeholder = state.placeholder;
          searchInput.setAttribute('aria-label', state.label + '，筛选命令');
        }
      }

      function execute(index, event) {
        if (!alive || !layer || !layer.isOpen()) return;
        if (!isFinite(Number(index)) || Number(index) < 0 || Number(index) >= state._matches.length) return;
        var command = state._matches[Number(index)];
        if (!command || command.disabled) return;
        close('select');
        if (typeof command.run === 'function') command.run(command.raw, event || null);
      }

      function open() {
        if (!alive) return false;
        ensureLayer();
        if (layer.isOpen()) {
          focusNode(searchInput);
          if (typeof searchInput.select === 'function') searchInput.select();
          return true;
        }
        state.query = '';
        searchInput.value = '';
        refreshMatches({ query: '', resetActive: true });
        renderResults();
        syncChrome();
        layer.open();
        focusNode(searchInput);
        return true;
      }

      function close(reason) {
        if (!layer || !layer.isOpen()) return false;
        layer.close(reason == null ? 'api' : reason);
        return true;
      }

      function isOpen() {
        return !!(layer && layer.isOpen());
      }

      function hotkeyed(event) {
        if (!alive || event.isComposing || event.defaultPrevented) return;
        var spec = state.hotkeySpec;
        if (!spec || !hotkeyMatches(spec, event)) return;
        var noModifier = !spec.ctrl && !spec.meta && !spec.alt && !spec.mod;
        if (noModifier && !isOpen() && isEditableTarget(event.target)) return;
        event.preventDefault();
        if (isOpen()) {
          focusNode(searchInput);
          if (searchInput && typeof searchInput.select === 'function') searchInput.select();
        } else {
          open();
        }
      }

      docBag.on('keydown', hotkeyed);

      var inst = C.component(root, state, function () {
        if (!layer) return;
        if (layer.isOpen()) {
          refreshMatches({ query: state.query, resetActive: false });
          renderResults();
        }
        syncChrome();
      }, function () {
        alive = false;
        docBag.clear();
        if (layer) {
          if (layer.el && layer.el._nuiCommandBag) {
            layer.el._nuiCommandBag.clear();
            layer.el._nuiCommandBag = null;
          }
          layer.destroy();
          layer = null;
        }
        panelEl = null;
        searchInput = null;
        closeButton = null;
        listEl = null;
        emptyEl = null;
        countEl = null;
        resultHint = null;
      });

      var baseUpdate = inst.update;
      inst.update = function (patch) {
        if (inst.destroyed || !patch || typeof patch !== 'object') return;
        var next = C.assign({}, patch);
        if (own(next, 'commands')) next.commands = normalizeCommands(next.commands);
        if (own(next, 'hotkey')) next.hotkeySpec = parseHotkey(next.hotkey);
        return baseUpdate(next);
      };

      inst.open = open;
      inst.close = close;
      inst.isOpen = isOpen;
      host.appendChild(root);
      return inst;
    }
  };
})(window);
