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
