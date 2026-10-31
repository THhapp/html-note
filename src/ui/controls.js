/* NoteUI controls — plain JavaScript, no dependencies. */
(function (global) {
  'use strict';
  var NoteUI = global.NoteUI = global.NoteUI || {};
  var own = function (object, key) { return Object.prototype.hasOwnProperty.call(object, key); };
  function hostElement(host) {
    if (!host || host.nodeType !== 1 || typeof host.appendChild !== 'function') throw new TypeError('NoteUI.mount requires a host element');
    return host;
  }
  function text(value) { return value == null ? '' : String(value); }
  function isNode(value) {
    return !!value && typeof value === 'object' && [1, 3, 11].indexOf(value.nodeType) !== -1;
  }

  /* legacy 模块内部共享 helper（非公开 API）：primitives.js 按 legacy manifest 顺序在
     controls.js 之后加载，复用这里的 DOM/内容小工具；宿主不应依赖 NoteUILegacyInternals。 */
  var legacyInternals = global.NoteUILegacyInternals = global.NoteUILegacyInternals || {};
  legacyInternals.own = own;
  legacyInternals.text = text;
  legacyInternals.element = function (tag, className, content) {
    var node = document.createElement(tag);
    node.className = className;
    if (content !== undefined) node.textContent = content == null ? '' : String(content);
    return node;
  };
  legacyInternals.validateHost = function (host) {
    if (!host || typeof host.appendChild !== 'function' || (host.nodeType !== 1 && host.nodeType !== 11)) {
      throw new TypeError('NoteUI.mount 需要一个元素或 DocumentFragment 容器。');
    }
  };
  legacyInternals.setContent = function (target, value) {
    if (value && typeof value === 'object' && [1, 3, 11].indexOf(value.nodeType) !== -1) {
      if (target.childNodes.length === 1 && target.firstChild === value) return;
      target.replaceChildren(value);
    } else {
      target.textContent = text(value);
    }
  };

  function iconName(icon) {
    if (typeof icon === 'string') return icon.trim();
    if (isNode(icon) && icon.nodeType === 1) {
      var named = icon.getAttribute('aria-label') || icon.getAttribute('title') || icon.getAttribute('data-icon');
      if (named) return text(named).trim();
      var title = icon.querySelector ? icon.querySelector('title') : null;
      if (title) return text(title.textContent).trim();
    }
    return '';
  }
  function resolvedIcon(icon) {
    if (isNode(icon)) return icon;
    if (typeof icon !== 'string' || !icon) return null;
    var resolver = NoteUI.Button.iconResolver;
    var node = null;
    try {
      if (typeof resolver === 'function') node = resolver(icon);
      else if (resolver && typeof resolver === 'object' && own(resolver, icon)) node = resolver[icon];
    } catch (err) {
      node = null;
    }
    return isNode(node) ? node : null;
  }

  NoteUI.Button = {
    // Optional public hook: function (name) -> DOM node, or a { name: node } map.
    // A string icon never throws when this hook is absent; it simply has no glyph.
    iconResolver: null,
    mount: function (host, options) {
      hostElement(host);
      var input = options || {};
      var state = Object.assign({
        label: '按钮', variant: 'secondary', disabled: false, onClick: null,
        icon: null, iconPosition: 'start', iconOnly: false, loading: false,
        focusableDisabled: false,
        ariaLabel: '', title: '', size: 'md'
      }, input);
      var labelWasSet = own(input, 'label');
      var el = document.createElement('button');
      var labelEl = document.createElement('span');
      var iconEl = document.createElement('span');
      var spinnerEl = document.createElement('span');
      var destroyed = false;
      el.type = 'button';
      labelEl.className = 'nui-button__label';
      iconEl.className = 'nui-button__icon';
      iconEl.setAttribute('aria-hidden', 'true');
      spinnerEl.className = 'nui-button__spinner';
      spinnerEl.setAttribute('aria-hidden', 'true');

      function accessibleName(glyphName) {
        var explicit = text(state.ariaLabel).trim();
        if (explicit) return explicit;
        if (!state.iconOnly) return '';
        var label = text(state.label).trim();
        // The built-in default "按钮" is a last-resort name, not a caller label.
        if (label && (labelWasSet || label !== '按钮')) return label;
        if (glyphName) return glyphName;
        return label || '按钮';
      }

      function render() {
        var variant = ['primary', 'secondary', 'quiet'].indexOf(state.variant) >= 0 ? state.variant : 'secondary';
        var position = state.iconPosition === 'end' ? 'end' : 'start';
        var size = state.size === 'sm' ? 'sm' : 'md';
        var glyph = resolvedIcon(state.icon);
        var glyphName = iconName(state.icon);
        var handle = accessibleName(glyphName);
        var className = 'nui-button nui-button--' + variant;
        if (size === 'sm') className += ' nui-button--sm';
        if (state.iconOnly) className += ' nui-button--icon-only';
        if (state.loading) className += ' is-loading';

        var disabled = Boolean(state.disabled);
        /* 默认使用原生 disabled；focusableDisabled 时保留可聚焦的禁用语义，
         * 由事件拦截保证实际不可激活（不是只写 aria-disabled）。 */
        var softDisabled = disabled && Boolean(state.focusableDisabled);
        el.className = className + (disabled ? ' is-disabled' : '');
        el.replaceChildren();
        el.disabled = disabled && !softDisabled;
        if (disabled) el.setAttribute('data-disabled', 'true');
        else el.removeAttribute('data-disabled');
        if (softDisabled) el.setAttribute('aria-disabled', 'true');
        else el.removeAttribute('aria-disabled');
        el.classList.toggle('is-loading', Boolean(state.loading));
        if (state.loading) {
          el.setAttribute('aria-busy', 'true');
        } else {
          el.removeAttribute('aria-busy');
        }
        if (state.loading) el.setAttribute('data-loading', 'true');
        else el.removeAttribute('data-loading');
        if (handle) el.setAttribute('aria-label', handle);
        else el.removeAttribute('aria-label');
        if (text(state.title)) el.title = text(state.title);
        else el.removeAttribute('title');

        if (state.loading) el.appendChild(spinnerEl);
        if (glyph && position === 'start') {
          iconEl.replaceChildren(glyph);
          el.appendChild(iconEl);
        }
        if (!state.iconOnly) {
          labelEl.textContent = text(state.label);
          el.appendChild(labelEl);
        }
        if (glyph && position === 'end') {
          iconEl.replaceChildren(glyph);
          el.appendChild(iconEl);
        }
      }
      function blocked() {
        return Boolean(state.disabled) || Boolean(state.loading) || el.disabled;
      }
      function clicked(event) {
        if (destroyed) return;
        if (blocked()) {
          /* 可聚焦的禁用态也必须完整拦截激活，不能只靠外观。 */
          if (Boolean(state.disabled) && Boolean(state.focusableDisabled) && event && typeof event.preventDefault === 'function') {
            event.preventDefault();
            if (typeof event.stopPropagation === 'function') event.stopPropagation();
          }
          return;
        }
        if (typeof state.onClick === 'function') state.onClick(event);
      }
      function keyed(event) {
        if (destroyed || !event || !blocked()) return;
        if (Boolean(state.disabled) && Boolean(state.focusableDisabled) &&
            (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar')) {
          /* 阻止浏览器由键盘合成 click，避免「可聚焦但实际仍能触发」。 */
          event.preventDefault();
        }
      }
      el.addEventListener('click', clicked);
      el.addEventListener('keydown', keyed);
      render();
      host.appendChild(el);
      return {
        el: el,
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          ['label', 'variant', 'disabled', 'focusableDisabled', 'onClick', 'icon', 'iconPosition', 'iconOnly',
            'loading', 'ariaLabel', 'title', 'size'].forEach(function (key) {
            if (own(patch, key)) {
              state[key] = patch[key];
              if (key === 'label') labelWasSet = true;
            }
          });
          render();
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          el.removeEventListener('click', clicked);
          el.removeEventListener('keydown', keyed);
          el.remove();
        }
      };
    }
  };

  NoteUI.Segmented = {
    mount: function (host, options) {
      hostElement(host);
      var state = Object.assign({ options: [], value: undefined, onChange: null }, options || {});
      var destroyed = false;
      var items = [], buttons = [];
      var el = document.createElement('div');
      el.className = 'nui-segmented';
      el.setAttribute('role', 'radiogroup');
      el.setAttribute('aria-label', host.getAttribute('aria-label') || '分段选择');
      function findValue(value) {
        return items.findIndex(function (item) { return !item.disabled && Object.is(item.value, value); });
      }
      function normalizeValue() {
        if (findValue(state.value) < 0) {
          var first = items.find(function (item) { return !item.disabled; });
          state.value = first ? first.value : undefined;
        }
      }
      function renderSelection() {
        var chosen = findValue(state.value);
        buttons.forEach(function (button, index) {
          var selected = chosen === index;
          button.setAttribute('aria-checked', String(selected));
          button.tabIndex = selected ? 0 : -1;
          button.disabled = items[index].disabled;
        });
      }
      function buildOptions() {
        items = Array.isArray(state.options) ? state.options.filter(function (item) { return item && typeof item === 'object'; }).map(function (item) {
          return { value: item.value, label: item.label == null ? text(item.value) : text(item.label), disabled: Boolean(item.disabled) };
        }) : [];
        el.replaceChildren();
        buttons = items.map(function (item, index) {
          var button = document.createElement('button');
          button.type = 'button';
          button.className = 'nui-segment';
          button.setAttribute('role', 'radio');
          button.dataset.nuiIndex = String(index);
          button.textContent = item.label;
          el.appendChild(button);
          return button;
        });
        normalizeValue();
        renderSelection();
      }
      function select(index, event) {
        if (destroyed || !items[index] || items[index].disabled) return;
        var previous = state.value;
        state.value = items[index].value;
        renderSelection();
        if (!Object.is(previous, state.value) && typeof state.onChange === 'function') state.onChange(state.value, event);
      }
      function clicked(event) {
        var button = event.target.closest('.nui-segment');
        if (!button || button.parentElement !== el || button.disabled) return;
        select(Number(button.dataset.nuiIndex), event);
      }
      function keyed(event) {
        var button = event.target.closest('.nui-segment');
        if (!button || button.parentElement !== el) return;
        var enabled = buttons.map(function (_, index) { return index; }).filter(function (index) { return !items[index].disabled; });
        if (!enabled.length) return;
        var position = enabled.indexOf(Number(button.dataset.nuiIndex));
        var target;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') target = enabled[(position + 1) % enabled.length];
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') target = enabled[(position - 1 + enabled.length) % enabled.length];
        else if (event.key === 'Home') target = enabled[0];
        else if (event.key === 'End') target = enabled[enabled.length - 1];
        else return;
        event.preventDefault();
        buttons[target].focus();
        select(target, event);
      }
      el.addEventListener('click', clicked);
      el.addEventListener('keydown', keyed);
      buildOptions();
      host.appendChild(el);
      return {
        el: el,
        getValue: function () { return state.value; },
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          ['options', 'value', 'onChange'].forEach(function (key) { if (own(patch, key)) state[key] = patch[key]; });
          if (own(patch, 'options')) buildOptions();
          else { normalizeValue(); renderSelection(); }
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          el.removeEventListener('click', clicked);
          el.removeEventListener('keydown', keyed);
          el.remove();
        }
      };
    }
  };
})(window);

