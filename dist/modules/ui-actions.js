/*! note-library module: ui-actions
 * dependencies: core, legacy
 * type: JavaScript
 * generated-by: scripts/build.mjs; do-not-edit.
 */

/* ---- source: src/ui/actions.js ---- */
/* NoteUI action extensions — plain JavaScript, no build step.
 * Range: A01–A03. A01/A02 reuse the legacy NoteUI.Button; A02 reuses
 * NoteCore.copy. Depends on core and the legacy Button module.
 */
(function (global) {
  'use strict';

  var NoteUI = global.NoteUI = global.NoteUI || {};
  var NoteCore = global.NoteCore;
  if (!NoteCore) throw new Error('NoteUI actions 组件需要先加载 NoteCore（core 模块）。');
  var own = NoteCore.own;
  var assign = NoteCore.assign;
  var text = NoteCore.text;

  function make(tag, className) {
    return NoteCore.el(tag, className || '');
  }

  function validateHost(host) {
    NoteCore.validateHost(host);
  }

  function requireButton() {
    if (!NoteUI.Button || typeof NoteUI.Button.mount !== 'function') {
      throw new Error('NoteUI.Button 未加载；请先加载旧组件模块。');
    }
    return NoteUI.Button;
  }

  function uniqueId(prefix) {
    return NoteCore.uid(prefix);
  }

  function makeIcon(name, size, className) {
    if (typeof NoteCore.icon === 'function') {
      var icon = NoteCore.icon(name, { size: size || 16, className: className || '' });
      if (icon) {
        icon.setAttribute('aria-hidden', 'true');
        icon.setAttribute('focusable', 'false');
        return icon;
      }
    }
    var fallback = make('span', className || '');
    fallback.setAttribute('aria-hidden', 'true');
    fallback.style.display = 'inline-flex';
    fallback.style.alignItems = 'center';
    fallback.style.justifyContent = 'center';
    fallback.style.width = (size || 16) + 'px';
    fallback.style.height = (size || 16) + 'px';
    fallback.style.fontWeight = '700';
    fallback.style.lineHeight = '1';
    fallback.textContent = name === 'circle-alert' ? '!' : '✓';
    return fallback;
  }

  function closestButton(node, root) {
    var current = node;
    while (current && current !== root) {
      if (current.nodeType === 1 && current.tagName === 'BUTTON') return current;
      current = current.parentNode;
    }
    return null;
  }

  /* A01 — group of the existing NoteUI.Button instances. */
  NoteUI.ButtonGroup = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      requireButton();
      var initial = options || {};
      var state = {
        items: Array.isArray(initial.items) ? initial.items : [],
        orientation: initial.orientation === 'vertical' ? 'vertical' : 'horizontal',
        role: initial.role === 'toolbar' ? 'toolbar' : 'group',
        label: initial.label != null ? initial.label : (initial.ariaLabel != null ? initial.ariaLabel : initial['aria-label']),
        disabled: Boolean(initial.disabled),
        onClick: typeof initial.onClick === 'function' ? initial.onClick : null
      };
      if (state.label == null) state.label = '按钮组';
      var root = make('div', 'nui-button-group');
      var instances = [];
      var itemOptions = [];
      var destroyed = false;
      var currentToolbarIndex = -1;

      function toolbarButtons() {
        return instances.map(function (instance, index) {
          var el = instance.el;
          var softDisabled = Boolean(el && el.getAttribute && el.getAttribute('data-disabled') === 'true');
          return { el: el, index: index, disabled: Boolean(el.disabled) || softDisabled };
        });
      }

      function enabledToolbarIndexes() {
        return toolbarButtons().filter(function (entry) { return !entry.disabled; }).map(function (entry) { return entry.index; });
      }

      function syncRoving(index) {
        if (state.role !== 'toolbar') return;
        var enabled = enabledToolbarIndexes();
        if (!enabled.length) {
          instances.forEach(function (instance) { instance.el.tabIndex = -1; });
          currentToolbarIndex = -1;
          return;
        }
        if (enabled.indexOf(index) < 0) index = enabled[0];
        currentToolbarIndex = index;
        instances.forEach(function (instance, itemIndex) {
          instance.el.tabIndex = itemIndex === currentToolbarIndex ? 0 : -1;
        });
      }

      function applyGroupSettings() {
        root.dataset.orientation = state.orientation;
        root.setAttribute('role', state.role);
        root.setAttribute('aria-label', text(state.label) || '按钮组');
        if (state.role === 'toolbar') root.setAttribute('aria-orientation', state.orientation);
        else root.removeAttribute('aria-orientation');
      }

      function destroyChildren() {
        instances.forEach(function (instance) {
          if (instance && typeof instance.destroy === 'function') instance.destroy();
        });
        instances = [];
        itemOptions = [];
        root.replaceChildren();
      }

      function buildItems() {
        destroyChildren();
        state.items.forEach(function (item, index) {
          var source = typeof item === 'string' ? { label: item } : (item && typeof item === 'object' ? item : null);
          if (!source) return;
          var buttonOptions = assign({}, source);
          var itemDisabled = Boolean(source.disabled);
          var itemClick = source.onClick;
          buttonOptions.onClick = function (event) {
            if (typeof itemClick === 'function') itemClick(event);
            if (!destroyed && typeof state.onClick === 'function') state.onClick(source, index, event);
          };
          buttonOptions.__itemDisabled = itemDisabled;
          buttonOptions.disabled = itemDisabled || state.disabled;
          var instance = requireButton().mount(root, buttonOptions);
          instance.el.dataset.nuiButtonGroupIndex = String(index);
          instances.push(instance);
          itemOptions.push(buttonOptions);
        });
        syncRoving(currentToolbarIndex >= 0 ? currentToolbarIndex : 0);
      }

      function updateItemDisabledStates() {
        itemOptions.forEach(function (buttonOptions, index) {
          var disabled = Boolean(state.disabled || buttonOptions.__itemDisabled);
          buttonOptions.disabled = disabled;
          if (instances[index]) instances[index].update({ disabled: disabled });
        });
        syncRoving(currentToolbarIndex >= 0 ? currentToolbarIndex : 0);
      }

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        var previousRole = state.role;
        if (own(patch, 'items')) state.items = Array.isArray(patch.items) ? patch.items : [];
        if (own(patch, 'orientation')) state.orientation = patch.orientation === 'vertical' ? 'vertical' : 'horizontal';
        if (own(patch, 'role')) state.role = patch.role === 'toolbar' ? 'toolbar' : 'group';
        if (own(patch, 'label')) state.label = patch.label;
        if (own(patch, 'ariaLabel')) state.label = patch.ariaLabel;
        if (own(patch, 'aria-label')) state.label = patch['aria-label'];
        if (own(patch, 'disabled')) state.disabled = Boolean(patch.disabled);
        if (own(patch, 'onClick')) state.onClick = typeof patch.onClick === 'function' ? patch.onClick : null;
        applyGroupSettings();
        if (own(patch, 'items') || previousRole !== state.role) buildItems();
        else if (own(patch, 'disabled')) updateItemDisabledStates();
      }

      function toolbarKeydown(event) {
        if (state.role !== 'toolbar' || destroyed) return;
        var button = closestButton(event.target, root);
        if (!button) return;
        var enabled = enabledToolbarIndexes();
        if (!enabled.length) return;
        var position = enabled.indexOf(Number(button.dataset.nuiButtonGroupIndex));
        if (position < 0) {
          position = enabled.findIndex(function (index) { return instances[index].el === button; });
        }
        if (position < 0) return;
        var next = null;
        var isHorizontal = state.orientation === 'horizontal';
        if (isHorizontal && event.key === 'ArrowRight') next = enabled[(position + 1) % enabled.length];
        else if (isHorizontal && event.key === 'ArrowLeft') next = enabled[(position - 1 + enabled.length) % enabled.length];
        else if (!isHorizontal && event.key === 'ArrowDown') next = enabled[(position + 1) % enabled.length];
        else if (!isHorizontal && event.key === 'ArrowUp') next = enabled[(position - 1 + enabled.length) % enabled.length];
        else if (event.key === 'Home') next = enabled[0];
        else if (event.key === 'End') next = enabled[enabled.length - 1];
        else return;
        event.preventDefault();
        syncRoving(next);
        instances[next].el.focus();
      }

      function toolbarFocusIn(event) {
        if (state.role !== 'toolbar') return;
        var index = instances.findIndex(function (instance) { return instance.el === event.target; });
        if (index >= 0) syncRoving(index);
      }

      function toolbarClick(event) {
        if (state.role !== 'toolbar') return;
        var index = instances.findIndex(function (instance) { return instance.el === event.target || instance.el.contains(event.target); });
        if (index >= 0) syncRoving(index);
      }

      applyGroupSettings();
      buildItems();
      host.appendChild(root);
      root.addEventListener('keydown', toolbarKeydown);
      root.addEventListener('focusin', toolbarFocusIn);
      root.addEventListener('click', toolbarClick);

      return {
        el: root,
        update: update,
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          root.removeEventListener('keydown', toolbarKeydown);
          root.removeEventListener('focusin', toolbarFocusIn);
          root.removeEventListener('click', toolbarClick);
          destroyChildren();
          root.remove();
        }
      };
    }
  };

  /* A02 — copy action with text feedback and a manual-selection fallback. */
  NoteUI.CopyButton = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var Button = requireButton();
      var state = assign({
        text: '',
        getText: null,
        label: '复制',
        copiedLabel: '已复制到剪贴板',
        failedLabel: '复制失败，请手动选择下方文本',
        variant: 'secondary',
        disabled: false,
        feedbackDuration: 2200,
        onCopy: null,
        buttonOptions: {}
      }, options || {});
      var root = make('div', 'nui-copy-button');
      var status = make('div', 'nui-copy-button__status');
      var fallback = make('div', 'nui-copy-button__fallback');
      var fallbackNote = make('p', 'nui-copy-button__fallback-note');
      var fallbackText = make('textarea', 'nui-copy-button__fallback-text');
      var fallbackLabelId = uniqueId('nui-copy-fallback-label');
      var destroyed = false;
      var copying = false;
      var feedbackTimer = 0;
      var button;

      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.setAttribute('aria-atomic', 'true');
      status.hidden = true;
      fallbackNote.id = fallbackLabelId;
      fallbackNote.textContent = '自动复制不可用。请选择下面的文本，使用系统复制快捷键或菜单手动复制。';
      fallbackText.readOnly = true;
      fallbackText.spellcheck = false;
      fallbackText.setAttribute('aria-label', '待复制文本');
      fallbackText.rows = 3;
      fallback.setAttribute('role', 'group');
      fallback.setAttribute('aria-labelledby', fallbackLabelId);
      fallback.appendChild(fallbackNote);
      fallback.appendChild(fallbackText);
      fallback.hidden = true;

      function buttonOptions(includeClick) {
        var base = state.buttonOptions && typeof state.buttonOptions === 'object' ? state.buttonOptions : {};
        var next = assign({}, base);
        next.label = text(state.label) || '复制';
        next.variant = state.variant || 'secondary';
        next.disabled = Boolean(state.disabled || copying);
        if (own(state, 'icon')) next.icon = state.icon;
        if (own(state, 'iconOnly')) next.iconOnly = Boolean(state.iconOnly);
        if (own(state, 'iconPosition')) next.iconPosition = state.iconPosition;
        if (own(state, 'size')) next.size = state.size;
        if (own(state, 'ariaLabel')) next.ariaLabel = state.ariaLabel;
        if (own(state, 'title')) next.title = state.title;
        if (includeClick) next.onClick = handleCopy;
        return next;
      }

      function syncButton() {
        if (!button) return;
        var options = buttonOptions(true);
        button.update(options);
        if (copying) {
          button.el.setAttribute('aria-busy', 'true');
          button.el.setAttribute('aria-label', text(state.ariaLabel) || text(state.label) || '复制');
        } else {
          button.el.removeAttribute('aria-busy');
        }
      }

      function clearFeedbackTimer() {
        if (!feedbackTimer) return;
        global.clearTimeout(feedbackTimer);
        feedbackTimer = 0;
      }

      function hideFeedback() {
        clearFeedbackTimer();
        status.hidden = true;
        fallback.hidden = true;
        status.dataset.state = '';
      }

      function writeStatus(ok, message) {
        status.replaceChildren();
        var iconWrap = make('span', 'nui-copy-button__status-icon');
        iconWrap.appendChild(makeIcon(ok ? 'check' : 'circle-alert', 16, 'nui-copy-button__status-icon-glyph'));
        var messageEl = make('span', 'nui-copy-button__status-text');
        messageEl.textContent = message;
        status.appendChild(iconWrap);
        status.appendChild(messageEl);
        status.dataset.state = ok ? 'success' : 'failure';
        status.hidden = false;
      }

      function showFailure(value) {
        hideFeedback();
        writeStatus(false, text(state.failedLabel) || '复制失败，请手动选择下方文本');
        fallback.hidden = false;
        fallbackText.value = value;
        fallbackText.rows = Math.min(8, Math.max(3, String(value).split('\n').length + 1));
        fallbackText.scrollTop = 0;
        try { fallbackText.focus({ preventScroll: true }); } catch (error) { fallbackText.focus(); }
        if (typeof fallbackText.select === 'function') fallbackText.select();
      }

      function showSuccess() {
        hideFeedback();
        writeStatus(true, text(state.copiedLabel) || '已复制到剪贴板');
        var duration = Number(state.feedbackDuration);
        if (isFinite(duration) && duration > 0) {
          feedbackTimer = global.setTimeout(function () {
            feedbackTimer = 0;
            if (!destroyed) status.hidden = true;
          }, duration);
        }
      }

      function reportFailure(value) {
        var result = { ok: false, method: 'manual' };
        if (destroyed) return false;
        showFailure(value);
        if (typeof state.onCopy === 'function') state.onCopy(result);
        return false;
      }

      function handleCopy() {
        if (destroyed || copying || state.disabled) return;
        var value;
        try {
          value = typeof state.getText === 'function' ? state.getText() : state.text;
        } catch (error) {
          return reportFailure('');
        }
        value = value == null ? '' : String(value);
        copying = true;
        hideFeedback();
        syncButton();
        var pending;
        if (typeof NoteCore.copy !== 'function') {
          pending = global.Promise.resolve({ ok: false, method: 'manual' });
        } else {
          try {
            pending = global.Promise.resolve(NoteCore.copy(value));
          } catch (error) {
            pending = global.Promise.resolve({ ok: false, method: 'manual' });
          }
        }
        pending.then(function (raw) {
          if (destroyed) return;
          copying = false;
          syncButton();
          var result = raw && typeof raw === 'object'
            ? raw
            : { ok: false, method: 'manual' };
          if (result.ok === true) showSuccess();
          else showFailure(value);
          if (typeof state.onCopy === 'function') state.onCopy(result);
        }, function () {
          if (destroyed) return;
          copying = false;
          syncButton();
          showFailure(value);
          if (typeof state.onCopy === 'function') state.onCopy({ ok: false, method: 'manual' });
        });
      }

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        var sourceChanged = own(patch, 'text') || own(patch, 'getText');
        Object.keys(patch).forEach(function (key) { state[key] = patch[key]; });
        if (sourceChanged || own(patch, 'label') || own(patch, 'disabled') || own(patch, 'copiedLabel') || own(patch, 'failedLabel')) {
          hideFeedback();
        }
        syncButton();
      }

      button = Button.mount(root, buttonOptions(true));
      root.appendChild(status);
      root.appendChild(fallback);
      host.appendChild(root);

      return {
        el: root,
        button: button,
        update: update,
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          clearFeedbackTimer();
          if (button && typeof button.destroy === 'function') button.destroy();
          root.remove();
        }
      };
    }
  };

  /* A03 — pressed toggle and exclusive/multi toggle groups. */
  NoteUI.Toggle = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var initial = options || {};
      var state = assign({
        label: '切换',
        pressed: false,
        value: undefined,
        options: null,
        exclusive: false,
        multi: false,
        disabled: false,
        ariaLabel: '',
        onChange: null
      }, initial);
      if (!own(initial, 'pressed') && typeof initial.value === 'boolean' && !Array.isArray(initial.options)) {
        state.pressed = initial.value;
      }
      if (Array.isArray(initial.options) && !own(initial, 'label')) state.label = '';
      var root = make('div', 'nui-toggle');
      var destroyed = false;
      var buttons = [];
      var groupOptions = [];
      var isGroup = Array.isArray(state.options);

      function groupMode() {
        if (!isGroup) return 'single';
        return state.multi ? 'multi' : 'exclusive';
      }

      function normalizeOptions(list) {
        if (!Array.isArray(list)) return [];
        return list.filter(function (item) { return item != null; }).map(function (item) {
          if (typeof item === 'string') return { value: item, label: item, disabled: false };
          if (typeof item !== 'object') return { value: text(item), label: text(item), disabled: false };
          return {
            value: own(item, 'value') ? item.value : item.label,
            label: item.label == null ? text(item.value) : text(item.label),
            disabled: Boolean(item.disabled)
          };
        });
      }

      function optionIndex(value) {
        for (var index = 0; index < groupOptions.length; index += 1) {
          if (Object.is(groupOptions[index].value, value)) return index;
        }
        return -1;
      }

      function normalizeGroupValue() {
        if (groupMode() === 'multi') {
          var input = Array.isArray(state.value) ? state.value : (state.value == null ? [] : [state.value]);
          var result = [];
          input.forEach(function (value) {
            var index = optionIndex(value);
            if (index >= 0) {
              var duplicate = result.some(function (entry) { return Object.is(entry.value, groupOptions[index].value); });
              if (!duplicate) result.push(groupOptions[index]);
            }
          });
          state.value = result.map(function (entry) { return entry.value; });
        } else if (state.value !== undefined && optionIndex(state.value) < 0) {
          /* Keep a single external value only when it belongs to the option set. */
          state.value = undefined;
        }
      }

      function cloneValue() {
        return groupMode() === 'multi' ? state.value.slice() : state.value;
      }

      function indicator() {
        var span = make('span', 'nui-toggle__indicator');
        span.setAttribute('aria-hidden', 'true');
        span.appendChild(makeIcon('check', 14, 'nui-toggle__indicator-icon'));
        return span;
      }

      function createButton(item, index) {
        var button = make('button', 'nui-toggle__button');
        button.type = 'button';
        button.dataset.nuiToggleIndex = String(index);
        button.setAttribute('aria-pressed', 'false');
        button.appendChild(indicator());
        var labelEl = make('span', 'nui-toggle__label');
        labelEl.textContent = text(item.label);
        button.appendChild(labelEl);
        button.disabled = Boolean(state.disabled || item.disabled);
        return button;
      }

      function pressedFor(item) {
        if (!isGroup) return state.pressed === true;
        if (groupMode() === 'multi') return state.value.indexOf(item.value) >= 0;
        return Object.is(state.value, item.value);
      }

      function syncButton(button, item) {
        var pressed = pressedFor(item);
        button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
        button.disabled = Boolean(state.disabled || item.disabled);
        var ind = button.querySelector('.nui-toggle__indicator');
        if (ind) ind.setAttribute('data-pressed', pressed ? 'true' : 'false');
        var labelEl = button.querySelector('.nui-toggle__label');
        if (labelEl) labelEl.textContent = text(item.label);
      }

      function syncAll() {
        buttons.forEach(function (button, index) {
          var item = isGroup ? groupOptions[index] : { label: state.label, disabled: false };
          syncButton(button, item);
        });
        if (!isGroup && buttons[0]) {
          var singleButton = buttons[0];
          if (state.ariaLabel) singleButton.setAttribute('aria-label', text(state.ariaLabel));
          else singleButton.removeAttribute('aria-label');
        }
      }

      function build() {
        root.replaceChildren();
        buttons = [];
        isGroup = Array.isArray(state.options);
        root.className = 'nui-toggle ' + (isGroup ? 'nui-toggle--group' : 'nui-toggle--single');
        if (isGroup) {
          root.setAttribute('role', 'group');
          root.setAttribute('aria-label', text(state.ariaLabel || state.label) || '切换组');
          root.setAttribute('data-mode', groupMode());
          if (text(state.label)) {
            var heading = make('div', 'nui-toggle__group-label');
            heading.textContent = text(state.label);
            root.appendChild(heading);
          }
          groupOptions = normalizeOptions(state.options);
          normalizeGroupValue();
          var list = make('div', 'nui-toggle__options');
          root.appendChild(list);
          if (!groupOptions.length) {
            var empty = make('span', 'nui-toggle__empty');
            empty.textContent = '暂无可选项';
            list.appendChild(empty);
          }
          groupOptions.forEach(function (item, index) {
            var button = createButton(item, index);
            list.appendChild(button);
            buttons.push(button);
          });
        } else {
          removeGroupAria();
          root.removeAttribute('role');
          root.dataset.mode = 'single';
          var single = createButton({ label: state.label, disabled: false }, 0);
          root.appendChild(single);
          buttons.push(single);
        }
        syncAll();
      }

      function removeGroupAria() {
        root.removeAttribute('aria-label');
        root.removeAttribute('data-mode');
        var heading = root.querySelector('.nui-toggle__group-label');
        if (heading) heading.remove();
      }

      function setSingle(next, event) {
        if (state.disabled) return;
        var pressed = Boolean(next);
        if (pressed === state.pressed) return;
        state.pressed = pressed;
        syncAll();
        if (typeof state.onChange === 'function') state.onChange(state.pressed, event);
      }

      function commitGroup(nextValue, event) {
        if (state.disabled) return;
        var changed = groupMode() === 'multi'
          ? JSON.stringify(state.value) !== JSON.stringify(nextValue)
          : !Object.is(state.value, nextValue);
        if (!changed) return;
        state.value = nextValue;
        syncAll();
        if (typeof state.onChange === 'function') state.onChange(cloneValue(), event);
      }

      function clicked(event) {
        if (destroyed) return;
        var button = closestButton(event.target, root);
        if (!button || button.disabled) return;
        if (!isGroup) {
          setSingle(!state.pressed, event);
          return;
        }
        var index = Number(button.dataset.nuiToggleIndex);
        var item = groupOptions[index];
        if (!item) return;
        if (groupMode() === 'multi') {
          var next = state.value.slice();
          var position = -1;
          for (var cursor = 0; cursor < next.length; cursor += 1) {
            if (Object.is(next[cursor], item.value)) { position = cursor; break; }
          }
          if (position >= 0) next.splice(position, 1);
          else next.push(item.value);
          commitGroup(next, event);
        } else if (!Object.is(state.value, item.value)) {
          commitGroup(item.value, event);
        }
      }

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        var structureChanged = own(patch, 'options') || own(patch, 'multi') || own(patch, 'exclusive');
        Object.keys(patch).forEach(function (key) { state[key] = patch[key]; });
        if (!isGroup && (own(patch, 'pressed') || (typeof patch.value === 'boolean' && !Array.isArray(state.options)))) {
          state.pressed = Boolean(own(patch, 'pressed') ? patch.pressed : patch.value);
        }
        if (own(patch, 'disabled')) {
          buttons.forEach(function (button, index) {
            var item = isGroup ? groupOptions[index] : { label: state.label };
            if (button) button.disabled = Boolean(state.disabled || (item && item.disabled));
          });
        }
        if (structureChanged) {
          isGroup = Array.isArray(state.options);
          build();
        } else {
          if (!isGroup && own(patch, 'label')) {
            var labelEl = buttons[0] ? buttons[0].querySelector('.nui-toggle__label') : null;
            if (labelEl) labelEl.textContent = text(state.label);
          }
          if (isGroup && own(patch, 'label')) {
            root.setAttribute('aria-label', text(patch.ariaLabel || state.ariaLabel || state.label) || '切换组');
            var heading = root.querySelector('.nui-toggle__group-label');
            if (!text(state.label)) {
              if (heading) heading.remove();
            } else if (heading) {
              heading.textContent = text(state.label);
            } else {
              var newHeading = make('div', 'nui-toggle__group-label');
              newHeading.textContent = text(state.label);
              root.insertBefore(newHeading, root.firstChild);
            }
          }
          if (isGroup && (own(patch, 'value') || own(patch, 'ariaLabel'))) {
            groupOptions = normalizeOptions(state.options);
            normalizeGroupValue();
            root.setAttribute('aria-label', text(state.ariaLabel || state.label) || '切换组');
          }
          if (!isGroup && own(patch, 'ariaLabel')) {
            if (state.ariaLabel) buttons[0].setAttribute('aria-label', text(state.ariaLabel));
            else buttons[0].removeAttribute('aria-label');
          }
          syncAll();
        }
      }

      function getValue() {
        if (!isGroup) return state.pressed === true;
        return cloneValue();
      }

      build();
      host.appendChild(root);
      root.addEventListener('click', clicked);

      return {
        el: root,
        getValue: getValue,
        update: update,
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          root.removeEventListener('click', clicked);
          root.remove();
        }
      };
    }
  };
})(window);
