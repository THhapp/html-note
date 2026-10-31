/* NoteUI forms-basic — F01–F08: Field, TextInput, Textarea, NumberInput,
   Checkbox, RadioGroup, Select, Combobox.
   Plain browser script. Requires NoteCore (fallback local helpers keep the
   components mountable if only uid/onResize are absent).
   Values are host data. Programmatic update() never fires onChange. */
(function (global) {
  'use strict';

  var NoteUI = global.NoteUI = global.NoteUI || {};
  var fallbackId = 0;

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function noteCore() {
    return global.NoteCore || null;
  }

  function text(value) {
    var core = noteCore();
    if (core && typeof core.text === 'function') return core.text(value);
    return value == null ? '' : String(value);
  }

  function uid(prefix) {
    var core = noteCore();
    if (core && typeof core.uid === 'function') return core.uid(prefix);
    fallbackId += 1;
    return String(prefix || 'nui') + '-' + fallbackId;
  }

  function isNode(value) {
    return Boolean(value) && (value.nodeType === 1 || value.nodeType === 3 || value.nodeType === 11);
  }

  function make(tag, className, value) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (value != null) el.textContent = String(value);
    return el;
  }

  function validateHost(host) {
    var core = noteCore();
    if (core && typeof core.validateHost === 'function') {
      core.validateHost(host);
      return;
    }
    if (!host || (host.nodeType !== 1 && host.nodeType !== 11) || typeof host.appendChild !== 'function') {
      throw new TypeError('NoteUI.mount 需要一个元素或 DocumentFragment 容器。');
    }
  }

  function binder() {
    var entries = [];
    return {
      on: function (target, type, handler, options) {
        target.addEventListener(type, handler, options);
        entries.push([target, type, handler, options]);
      },
      clear: function () {
        var list = entries;
        entries = [];
        list.forEach(function (entry) {
          entry[0].removeEventListener(entry[1], entry[2], entry[3]);
        });
      }
    };
  }

  function onWidthChange(el, callback) {
    var core = noteCore();
    if (core && typeof core.onResize === 'function') return core.onResize(el, callback);
    if (typeof ResizeObserver !== 'undefined') {
      var observer = new ResizeObserver(callback);
      observer.observe(el);
      return function () { observer.disconnect(); };
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('resize', callback);
      return function () { window.removeEventListener('resize', callback); };
    }
    return function () {};
  }

  function tokens(value) {
    return text(value).split(/\s+/).filter(Boolean);
  }

  function describedByAdd(el, id) {
    if (!el || !id) return;
    var list = tokens(el.getAttribute('aria-describedby'));
    if (list.indexOf(id) < 0) list.push(id);
    el.setAttribute('aria-describedby', list.join(' '));
  }

  function describedByRemove(el, ids) {
    if (!el) return;
    var remove = Array.isArray(ids) ? ids : [ids];
    var list = tokens(el.getAttribute('aria-describedby')).filter(function (token) {
      return remove.indexOf(token) < 0;
    });
    if (list.length) el.setAttribute('aria-describedby', list.join(' '));
    else el.removeAttribute('aria-describedby');
  }

  function labelledByAdd(el, id) {
    if (!el || !id) return false;
    var list = tokens(el.getAttribute('aria-labelledby'));
    if (list.indexOf(id) >= 0) return false;
    list.push(id);
    el.setAttribute('aria-labelledby', list.join(' '));
    return true;
  }

  function labelledByRemove(el, id) {
    if (!el || !id) return;
    var list = tokens(el.getAttribute('aria-labelledby')).filter(function (token) {
      return token !== id;
    });
    if (list.length) el.setAttribute('aria-labelledby', list.join(' '));
    else el.removeAttribute('aria-labelledby');
  }

  function isLabelable(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName;
    if (tag === 'INPUT') return el.type !== 'hidden';
    return tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON' ||
      tag === 'METER' || tag === 'OUTPUT' || tag === 'PROGRESS';
  }

  function isGroupLike(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.tagName === 'FIELDSET') return true;
    var role = el.getAttribute('role');
    return role === 'group' || role === 'radiogroup';
  }

  function firstLabelable(root) {
    if (!root || root.nodeType !== 1 || typeof root.querySelector !== 'function') return null;
    var candidate = root.querySelector('input:not([type="hidden"]), select, textarea, button, meter, output, progress');
    if (candidate && !candidate.disabled) return candidate;
    return candidate;
  }

  function resolveControl(control) {
    var node = null;
    if (!control) return null;
    if (isNode(control)) node = control;
    else if (control.el && isNode(control.el)) node = control.el;
    else throw new TypeError('NoteUI.Field 的 control 必须是 DOM 节点或含 .el 的组件实例。');
    return node;
  }

  function numberOrNull(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'number') return isFinite(value) ? (value === 0 ? 0 : value) : null;
    if (typeof value === 'string') {
      var parsed = parseNumber(value);
      return parsed.kind === 'number' ? parsed.value : null;
    }
    return null;
  }

  function parseNumber(raw) {
    var value = text(raw).trim();
    if (value === '') return { kind: 'empty' };
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) return { kind: 'invalid' };
    var number = Number(value);
    if (!isFinite(number)) return { kind: 'invalid' };
    return { kind: 'number', value: number === 0 ? 0 : number };
  }

  function normalizePrecision(value) {
    if (value == null || value === '') return null;
    var number = Number(value);
    if (!isFinite(number) || number < 0) return null;
    return Math.min(10, Math.floor(number));
  }

  function normalizeStep(value) {
    var parsed = numberOrNull(value);
    return parsed != null && parsed > 0 ? parsed : 1;
  }

  function decimalsOf(number) {
    var source = String(number);
    var exponent = 0;
    var match = source.match(/[eE]([+-]?\d+)$/);
    if (match) {
      exponent = Math.abs(parseInt(match[1], 10)) || 0;
      source = source.slice(0, match.index);
    }
    var dot = source.indexOf('.');
    return dot < 0 ? exponent : source.length - dot - 1 + exponent;
  }

  function roundNumber(number, precision) {
    if (precision == null) return number;
    var factor = Math.pow(10, precision);
    var rounded = Math.round(number * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
  }

  /* ------------------------------------------------------------------ */
  /* F01 Field                                                          */
  /* ------------------------------------------------------------------ */

  NoteUI.Field = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var state = {
        label: '',
        hint: '',
        required: false,
        error: '',
        control: null,
        id: ''
      };
      var input = options && typeof options === 'object' ? options : {};
      ['label', 'hint', 'required', 'error', 'control', 'id'].forEach(function (key) {
        if (own(input, key)) state[key] = input[key];
      });

      var base = uid('nui-field');
      var root = make('div', 'nui-field');
      var labelEl = make('label', 'nui-field__label');
      var labelText = make('span', 'nui-field__label-text');
      var requiredMark = make('span', 'nui-field__required', '必填');
      var hintEl = make('div', 'nui-field__hint');
      var slot = make('div', 'nui-field__control');
      var errorEl = make('div', 'nui-field__error');
      var errorTitle = make('strong', 'nui-field__error-title', '错误：');
      var errorText = make('span', 'nui-field__error-text');
      var destroyed = false;

      var labelId = base + '-label';
      var hintId = base + '-hint';
      var errorId = base + '-error';
      var generatedControlId = base + '-control';

      labelEl.id = labelId;
      hintEl.id = hintId;
      errorEl.id = errorId;
      errorEl.setAttribute('role', 'alert');
      labelEl.appendChild(labelText);
      labelEl.appendChild(requiredMark);
      errorEl.appendChild(errorTitle);
      errorEl.appendChild(errorText);
      root.appendChild(labelEl);
      root.appendChild(hintEl);
      root.appendChild(slot);
      root.appendChild(errorEl);

      var currentControl = null;
      var currentTarget = null;
      var currentIsGroup = false;
      var association = null;
      var instance = null;

      function cleanAssociation() {
        if (!association) return;
        var info = association;
        association = null;
        if (info.target) {
          describedByRemove(info.target, [hintId, errorId]);
          if (info.addedRequired) info.target.required = false;
          if (info.addedAriaRequired) info.target.removeAttribute('aria-required');
          if (info.addedLabelledby) labelledByRemove(info.target, labelId);
          if (info.setInvalid) {
            if (info.originalInvalid == null) info.target.removeAttribute('aria-invalid');
            else info.target.setAttribute('aria-invalid', info.originalInvalid);
          }
          if (info.generatedId && info.target.id === info.assignedId) {
            info.target.removeAttribute('id');
          }
        }
      }

      function setControl(next) {
        cleanAssociation();
        currentControl = next || null;
        currentTarget = null;
        currentIsGroup = false;
        while (slot.firstChild) slot.removeChild(slot.firstChild);
        if (!currentControl) {
          if (instance) instance.control = null;
          syncLabelFor();
          return;
        }
        var node = resolveControl(currentControl);
        slot.appendChild(node);

        var target = null;
        var group = false;
        if (isGroupLike(node)) {
          target = node;
          group = true;
        } else if (isLabelable(node)) {
          target = node;
        } else {
          target = firstLabelable(node) || node;
        }
        currentTarget = target;
        currentIsGroup = group && target === node;

        var hadId = target.hasAttribute('id') && target.id !== '';
        var assignedId = state.id ? text(state.id) : (hadId ? target.id : generatedControlId);
        if (!assignedId) assignedId = generatedControlId;
        target.id = assignedId;

        association = {
          target: target,
          group: currentIsGroup,
          assignedId: assignedId,
          generatedId: !state.id && !hadId,
          originalInvalid: target.getAttribute('aria-invalid'),
          setInvalid: false,
          addedRequired: false,
          addedAriaRequired: false,
          addedLabelledby: false
        };

        if (currentIsGroup || !isLabelable(target)) {
          if (labelEl.hidden === false || state.label || state.required) {
            association.addedLabelledby = labelledByAdd(target, labelId);
          }
        }
        syncLabelFor();
        render();
        if (instance) instance.control = currentTarget;
      }

      function syncLabelFor() {
        if (currentTarget && !currentIsGroup && isLabelable(currentTarget)) {
          labelEl.htmlFor = currentTarget.id || '';
        } else {
          labelEl.removeAttribute('for');
        }
      }

      function renderLabel() {
        labelText.textContent = text(state.label);
        requiredMark.hidden = !state.required;
        labelEl.hidden = !state.label && !state.required;
        syncLabelFor();
      }

      function renderHint() {
        hintEl.textContent = text(state.hint);
        hintEl.hidden = hintEl.textContent === '';
      }

      function renderError() {
        var message = text(state.error);
        errorText.textContent = message;
        errorEl.hidden = message === '';
        if (message) root.classList.add('nui-field--invalid');
        else root.classList.remove('nui-field--invalid');
      }

      function syncAssociation() {
        if (!association || !association.target) return;
        var target = association.target;
        syncLabelFor();

        if (state.hint) describedByAdd(target, hintId);
        else describedByRemove(target, hintId);
        if (state.error) describedByAdd(target, errorId);
        else describedByRemove(target, errorId);

        if (association.group) {
          if (labelEl.hidden) {
            if (association.addedLabelledby) {
              labelledByRemove(target, labelId);
              association.addedLabelledby = false;
            }
          } else if (!association.addedLabelledby) {
            association.addedLabelledby = labelledByAdd(target, labelId);
          }
        } else if (association.addedLabelledby) {
          labelledByRemove(target, labelId);
          association.addedLabelledby = false;
        }

        if (state.required) {
          if (!association.group && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
            if (!target.required) {
              target.required = true;
              association.addedRequired = true;
            }
          } else if (!association.addedAriaRequired) {
            target.setAttribute('aria-required', 'true');
            association.addedAriaRequired = true;
          }
        } else {
          if (association.addedRequired) {
            target.required = false;
            association.addedRequired = false;
          }
          if (association.addedAriaRequired) {
            target.removeAttribute('aria-required');
            association.addedAriaRequired = false;
          }
        }

        if (state.error) {
          target.setAttribute('aria-invalid', 'true');
          association.setInvalid = true;
        } else if (association.setInvalid) {
          if (association.originalInvalid == null) target.removeAttribute('aria-invalid');
          else target.setAttribute('aria-invalid', association.originalInvalid);
          association.setInvalid = false;
        }
      }

      function render() {
        renderLabel();
        renderHint();
        renderError();
        syncAssociation();
      }

      function setError(message) {
        if (destroyed) return;
        state.error = message == null ? '' : String(message);
        renderError();
        syncAssociation();
      }

      instance = {
        el: root,
        control: null,
        setError: setError,
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          var controlChanged = false;
          var nextControl = state.control;
          ['label', 'hint', 'required', 'error', 'id'].forEach(function (key) {
            if (own(patch, key)) state[key] = patch[key];
          });
          if (own(patch, 'control')) {
            controlChanged = true;
            nextControl = patch.control;
          }
          state.error = state.error == null ? '' : String(state.error);
          state.required = Boolean(state.required);
          if (controlChanged) {
            state.control = nextControl;
            setControl(nextControl);
          } else {
            if (own(patch, 'id') && association && association.target) {
              if (state.id) association.generatedId = false;
              var nextId = state.id ? text(state.id) : (association.generatedId ? generatedControlId : association.assignedId);
              association.assignedId = nextId;
              association.target.id = nextId;
            }
            render();
          }
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          cleanAssociation();
          root.remove();
        }
      };

      render();
      host.appendChild(root);
      state.required = Boolean(state.required);
      state.error = state.error == null ? '' : String(state.error);
      if (state.control) setControl(state.control);
      else render();
      return instance;
    }
  };

  /* ------------------------------------------------------------------ */
  /* F02 TextInput                                                      */
  /* ------------------------------------------------------------------ */

  NoteUI.TextInput = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var state = {
        placeholder: '',
        disabled: false,
        readonly: false,
        clearable: false,
        type: 'text',
        onChange: null,
        id: ''
      };
      var input = options && typeof options === 'object' ? options : {};
      ['placeholder', 'disabled', 'readonly', 'clearable', 'type', 'onChange', 'id'].forEach(function (key) {
        if (own(input, key)) state[key] = input[key];
      });
      var initialValue = text(input.value);
      state.type = state.type === 'search' ? 'search' : 'text';
      state.disabled = Boolean(state.disabled);
      state.readonly = Boolean(state.readonly);
      state.clearable = Boolean(state.clearable);

      var root = make('div', 'nui-textinput');
      var control = make('input', 'nui-textinput__control');
      var clearButton = make('button', 'nui-textinput__clear');
      var glyph = make('span', 'nui-textinput__clear-glyph', '×');
      var destroyed = false;
      var events = binder();

      glyph.setAttribute('aria-hidden', 'true');
      clearButton.type = 'button';
      clearButton.appendChild(glyph);
      clearButton.setAttribute('aria-label', '清空输入');
      root.appendChild(control);
      root.appendChild(clearButton);

      function syncChrome() {
        root.classList.toggle('nui-textinput--search', state.type === 'search');
        root.classList.toggle('nui-textinput--disabled', state.disabled);
        root.classList.toggle('nui-textinput--readonly', state.readonly);
        clearButton.hidden = !(state.clearable && !state.disabled && !state.readonly && control.value !== '');
      }

      function emitUser(value, event) {
        if (typeof state.onChange === 'function') state.onChange(value, event);
      }

      function handleInput(event) {
        if (destroyed) return;
        syncChrome();
        emitUser(control.value, event);
      }

      function handleClear(event) {
        if (destroyed || state.disabled || state.readonly) return;
        if (control.value === '') return;
        control.value = '';
        syncChrome();
        control.focus();
        emitUser('', event);
      }

      events.on(control, 'input', handleInput);
      events.on(clearButton, 'click', handleClear);

      control.type = state.type;
      control.value = initialValue;
      control.placeholder = text(state.placeholder);
      control.disabled = state.disabled;
      control.readOnly = state.readonly;
      if (state.id) control.id = text(state.id);
      syncChrome();
      host.appendChild(root);

      return {
        el: root,
        getValue: function () { return control.value; },
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          if (own(patch, 'value')) control.value = text(patch.value);
          if (own(patch, 'placeholder')) {
            state.placeholder = patch.placeholder;
            control.placeholder = text(patch.placeholder);
          }
          if (own(patch, 'disabled')) {
            state.disabled = Boolean(patch.disabled);
            control.disabled = state.disabled;
          }
          if (own(patch, 'readonly')) {
            state.readonly = Boolean(patch.readonly);
            control.readOnly = state.readonly;
          }
          if (own(patch, 'clearable')) state.clearable = Boolean(patch.clearable);
          if (own(patch, 'type')) {
            state.type = patch.type === 'search' ? 'search' : 'text';
            control.type = state.type;
          }
          if (own(patch, 'onChange')) state.onChange = patch.onChange;
          if (own(patch, 'id')) {
            state.id = patch.id;
            if (state.id) control.id = text(state.id);
            else control.removeAttribute('id');
          }
          syncChrome();
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          events.clear();
          root.remove();
        }
      };
    }
  };

  /* ------------------------------------------------------------------ */
  /* F03 Textarea                                                       */
  /* ------------------------------------------------------------------ */

  NoteUI.Textarea = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var state = {
        rows: 3,
        autoGrow: true,
        maxRows: 10,
        showCount: false,
        maxLength: null,
        placeholder: '',
        disabled: false,
        readonly: false,
        onChange: null,
        id: ''
      };
      var input = options && typeof options === 'object' ? options : {};
      ['rows', 'autoGrow', 'maxRows', 'showCount', 'maxLength', 'placeholder', 'disabled', 'readonly', 'onChange', 'id'].forEach(function (key) {
        if (own(input, key)) state[key] = input[key];
      });
      var initialValue = text(input.value);
      state.rows = Math.max(1, Math.floor(Number(state.rows)) || 3);
      state.maxRows = Math.max(1, Math.floor(Number(state.maxRows)) || 10);
      state.autoGrow = Boolean(state.autoGrow);
      state.showCount = Boolean(state.showCount);
      state.disabled = Boolean(state.disabled);
      state.readonly = Boolean(state.readonly);
      if (state.maxLength != null && state.maxLength !== '') {
        var max = Math.floor(Number(state.maxLength));
        state.maxLength = isFinite(max) && max >= 0 ? max : null;
      } else {
        state.maxLength = null;
      }

      var base = uid('nui-textarea');
      var root = make('div', 'nui-textarea');
      var control = make('textarea', 'nui-textarea__control');
      var footer = make('div', 'nui-textarea__footer');
      var count = make('span', 'nui-textarea__count');
      var countId = base + '-count';
      var destroyed = false;
      var events = binder();
      var disconnectResize = null;
      var lastWidth = -1;
      var frameId = 0;

      count.id = countId;
      footer.appendChild(count);
      root.appendChild(control);
      root.appendChild(footer);

      function countVisible() {
        return state.showCount || state.maxLength != null;
      }

      function syncChrome() {
        root.classList.toggle('nui-textarea--autogrow', state.autoGrow);
        root.classList.toggle('nui-textarea--disabled', state.disabled);
        root.classList.toggle('nui-textarea--readonly', state.readonly);
        footer.hidden = !countVisible();
        control.readOnly = state.readonly;
        control.disabled = state.disabled;
        control.rows = state.rows;
        control.placeholder = text(state.placeholder);
        if (state.maxLength == null) control.removeAttribute('maxlength');
        else control.setAttribute('maxlength', String(state.maxLength));
        if (countVisible()) describedByAdd(control, countId);
        else describedByRemove(control, countId);
        if (state.autoGrow) control.style.resize = 'none';
        else control.style.removeProperty('resize');
      }

      function syncCount() {
        if (!countVisible()) {
          count.textContent = '';
          count.classList.remove('nui-textarea__count--limit');
          return;
        }
        var length = control.value.length;
        var message = String(length);
        if (state.maxLength != null) message += ' / ' + String(state.maxLength);
        message += ' 字';
        if (state.maxLength != null) {
          if (length > state.maxLength) {
            message += ' · 超出上限';
            count.classList.add('nui-textarea__count--limit');
          } else if (length === state.maxLength) {
            message += ' · 已达上限';
            count.classList.add('nui-textarea__count--limit');
          } else {
            count.classList.remove('nui-textarea__count--limit');
          }
        } else {
          count.classList.remove('nui-textarea__count--limit');
        }
        count.textContent = message;
      }

      function syncHeight() {
        if (!state.autoGrow) {
          control.style.removeProperty('height');
          control.style.removeProperty('overflow-y');
          return;
        }
        var styles = window.getComputedStyle(control);
        var lineHeight = parseFloat(styles.lineHeight);
        if (!isFinite(lineHeight) || lineHeight <= 0) lineHeight = parseFloat(styles.fontSize) * 1.55 || 20;
        var padding = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
        var border = (parseFloat(styles.borderTopWidth) || 0) + (parseFloat(styles.borderBottomWidth) || 0);
        var maxOuter = state.maxRows * lineHeight + padding + border;
        var scrollTop = control.scrollTop;
        control.style.height = 'auto';
        var neededOuter = control.scrollHeight + border;
        var next = Math.min(neededOuter, maxOuter);
        if (next < lineHeight + padding + border) next = lineHeight + padding + border;
        control.style.height = next + 'px';
        control.style.overflowY = neededOuter > maxOuter + 0.5 ? 'auto' : 'hidden';
        control.scrollTop = scrollTop;
      }

      function checkWidth() {
        var width = root.clientWidth;
        if (width === lastWidth) return;
        lastWidth = width;
        syncHeight();
      }

      function handleInput(event) {
        if (destroyed) return;
        syncCount();
        syncHeight();
        if (typeof state.onChange === 'function') state.onChange(control.value, event);
      }

      events.on(control, 'input', handleInput);
      control.value = initialValue;
      if (state.id) control.id = text(state.id);
      syncChrome();
      syncCount();
      host.appendChild(root);
      frameId = window.requestAnimationFrame(function () {
        frameId = 0;
        if (destroyed) return;
        syncHeight();
      });
      disconnectResize = onWidthChange(root, checkWidth);
      syncHeight();

      return {
        el: root,
        getValue: function () { return control.value; },
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          if (own(patch, 'value')) control.value = text(patch.value);
          if (own(patch, 'rows')) {
            state.rows = Math.max(1, Math.floor(Number(patch.rows)) || 3);
            control.rows = state.rows;
          }
          if (own(patch, 'autoGrow')) state.autoGrow = Boolean(patch.autoGrow);
          if (own(patch, 'maxRows')) state.maxRows = Math.max(1, Math.floor(Number(patch.maxRows)) || 10);
          if (own(patch, 'showCount')) state.showCount = Boolean(patch.showCount);
          if (own(patch, 'maxLength')) {
            if (patch.maxLength == null || patch.maxLength === '') state.maxLength = null;
            else {
              var max = Math.floor(Number(patch.maxLength));
              state.maxLength = isFinite(max) && max >= 0 ? max : null;
            }
          }
          if (own(patch, 'placeholder')) state.placeholder = patch.placeholder;
          if (own(patch, 'disabled')) state.disabled = Boolean(patch.disabled);
          if (own(patch, 'readonly')) state.readonly = Boolean(patch.readonly);
          if (own(patch, 'onChange')) state.onChange = patch.onChange;
          if (own(patch, 'id')) {
            state.id = patch.id;
            if (state.id) control.id = text(state.id);
            else control.removeAttribute('id');
          }
          syncChrome();
          syncCount();
          syncHeight();
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          events.clear();
          if (frameId) {
            window.cancelAnimationFrame(frameId);
            frameId = 0;
          }
          if (disconnectResize) disconnectResize();
          disconnectResize = null;
          root.remove();
        }
      };
    }
  };

  /* ------------------------------------------------------------------ */
  /* F04 NumberInput                                                    */
  /* ------------------------------------------------------------------ */

  NoteUI.NumberInput = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var state = {
        value: null,
        min: null,
        max: null,
        step: 1,
        precision: null,
        disabled: false,
        readonly: false,
        placeholder: '',
        clearable: false,
        onChange: null,
        id: ''
      };
      var input = options && typeof options === 'object' ? options : {};
      ['value', 'min', 'max', 'step', 'precision', 'disabled', 'readonly', 'placeholder', 'clearable', 'onChange', 'id'].forEach(function (key) {
        if (own(input, key)) state[key] = input[key];
      });
      state.value = numberOrNull(state.value);
      state.min = numberOrNull(state.min);
      state.max = numberOrNull(state.max);
      state.step = normalizeStep(state.step);
      state.precision = normalizePrecision(state.precision);
      state.disabled = Boolean(state.disabled);
      state.readonly = Boolean(state.readonly);
      state.clearable = Boolean(state.clearable);

      var base = uid('nui-numberinput');
      var messageId = base + '-message';
      var root = make('div', 'nui-numberinput');
      var box = make('div', 'nui-numberinput__box');
      var control = make('input', 'nui-numberinput__control');
      var clearButton = make('button', 'nui-numberinput__clear');
      var clearGlyph = make('span', 'nui-numberinput__clear-glyph', '×');
      var stepper = make('div', 'nui-numberinput__stepper');
      var upButton = make('button', 'nui-numberinput__step');
      var downButton = make('button', 'nui-numberinput__step');
      var upGlyph = make('span', 'nui-numberinput__step-glyph', '▲');
      var downGlyph = make('span', 'nui-numberinput__step-glyph', '▼');
      var messageEl = make('div', 'nui-numberinput__message');
      var destroyed = false;
      var events = binder();
      var messageKind = '';
      var messageText = '';
      var draftError = '';
      var addedMessageDescribed = false;

      control.type = 'text';
      control.inputMode = 'decimal';
      control.autocomplete = 'off';
      control.spellcheck = false;
      control.setAttribute('role', 'spinbutton');
      clearButton.type = 'button';
      clearButton.setAttribute('aria-label', '清空数字');
      clearGlyph.setAttribute('aria-hidden', 'true');
      clearButton.appendChild(clearGlyph);
      upButton.type = 'button';
      upButton.setAttribute('aria-label', '增加数值');
      upGlyph.setAttribute('aria-hidden', 'true');
      upButton.appendChild(upGlyph);
      downButton.type = 'button';
      downButton.setAttribute('aria-label', '减少数值');
      downGlyph.setAttribute('aria-hidden', 'true');
      downButton.appendChild(downGlyph);
      upButton.dataset.nuiDirection = 'up';
      downButton.dataset.nuiDirection = 'down';
      stepper.appendChild(upButton);
      stepper.appendChild(downButton);
      box.appendChild(control);
      box.appendChild(clearButton);
      box.appendChild(stepper);
      messageEl.id = messageId;
      messageEl.setAttribute('role', 'status');
      messageEl.setAttribute('aria-live', 'polite');
      messageEl.hidden = true;
      root.appendChild(box);
      root.appendChild(messageEl);

      function stepPrecision() {
        if (state.precision != null) return state.precision;
        return Math.min(10, Math.max(0, decimalsOf(state.step)));
      }

      function formatValue(value) {
        if (value == null) return '';
        return String(roundNumber(value, state.precision));
      }

      function clampValue(value) {
        var next = value;
        if (state.max != null && next > state.max) next = state.max;
        if (state.min != null && next < state.min) next = state.min;
        return next;
      }

      function inRange(value) {
        if (state.min != null && value < state.min) return false;
        if (state.max != null && value > state.max) return false;
        return true;
      }

      function rangeDescription() {
        if (state.min != null && state.max != null) return state.min + '–' + state.max;
        if (state.min != null) return '不小于 ' + state.min;
        if (state.max != null) return '不大于 ' + state.max;
        return '';
      }

      function clearMessage() {
        messageKind = '';
        messageText = '';
        draftError = '';
        messageEl.textContent = '';
        messageEl.hidden = true;
        messageEl.classList.remove('nui-numberinput__message--error');
        messageEl.classList.remove('nui-numberinput__message--info');
        if (addedMessageDescribed) {
          describedByRemove(control, messageId);
          addedMessageDescribed = false;
        }
        control.removeAttribute('aria-invalid');
        root.classList.remove('nui-numberinput--error');
      }

      function setMessage(kind, message) {
        messageKind = kind;
        messageText = message;
        draftError = '';
        messageEl.textContent = (kind === 'error' ? '输入有误：' : '提示：') + message;
        messageEl.hidden = false;
        messageEl.classList.toggle('nui-numberinput__message--error', kind === 'error');
        messageEl.classList.toggle('nui-numberinput__message--info', kind !== 'error');
        if (!addedMessageDescribed) {
          describedByAdd(control, messageId);
          addedMessageDescribed = true;
        }
        if (kind === 'error') {
          control.setAttribute('aria-invalid', 'true');
          root.classList.add('nui-numberinput--error');
        } else {
          control.removeAttribute('aria-invalid');
          root.classList.remove('nui-numberinput--error');
        }
      }

      function syncButtons() {
        var baseValue = state.value;
        var upBlocked = state.disabled || state.readonly || (baseValue != null && state.max != null && baseValue >= state.max);
        var downBlocked = state.disabled || state.readonly || (baseValue != null && state.min != null && baseValue <= state.min);
        upButton.disabled = upBlocked;
        downButton.disabled = downBlocked;
        clearButton.hidden = !(state.clearable && !state.disabled && !state.readonly && (control.value !== '' || state.value != null));
      }

      function syncAria() {
        if (state.min != null) control.setAttribute('aria-valuemin', String(state.min));
        else control.removeAttribute('aria-valuemin');
        if (state.max != null) control.setAttribute('aria-valuemax', String(state.max));
        else control.removeAttribute('aria-valuemax');
        if (state.value != null) {
          control.setAttribute('aria-valuenow', String(state.value));
          control.setAttribute('aria-valuetext', formatValue(state.value));
        } else {
          control.removeAttribute('aria-valuenow');
          control.setAttribute('aria-valuetext', '未填写');
        }
        control.disabled = state.disabled;
        control.readOnly = state.readonly;
        root.classList.toggle('nui-numberinput--disabled', state.disabled);
        root.classList.toggle('nui-numberinput--readonly', state.readonly);
        syncButtons();
      }

      function emit(value, event) {
        if (typeof state.onChange === 'function') state.onChange(value, event);
      }

      function applyValue(value, event) {
        var previous = state.value;
        state.value = value;
        control.value = formatValue(value);
        syncAria();
        if (!Object.is(previous, value)) emit(value, event);
      }

      function stepBy(direction, multiplier, event) {
        if (destroyed || state.disabled || state.readonly) return;
        var parsed = parseNumber(control.value);
        var baseValue = parsed.kind === 'number' ? parsed.value : state.value;
        if (baseValue == null) baseValue = 0;
        var next = baseValue + direction * state.step * multiplier;
        next = clampValue(next);
        next = clampValue(roundNumber(next, stepPrecision()));
        clearMessage();
        applyValue(next, event);
      }

      function commit(event) {
        if (destroyed) return;
        var parsed = parseNumber(control.value);
        if (parsed.kind === 'empty') {
          var previous = state.value;
          state.value = null;
          control.value = '';
          clearMessage();
          syncAria();
          if (previous !== null) emit(null, event);
          return;
        }
        if (parsed.kind === 'invalid') {
          setMessage('error', '请输入有效数字；当前文本会保留，可继续修改。');
          syncButtons();
          return;
        }
        var raw = parsed.value;
        var clamped = clampValue(raw);
        var precision = state.precision;
        var rounded = clampValue(roundNumber(clamped, precision));
        var previousValue = state.value;
        state.value = rounded;
        control.value = formatValue(rounded);
        if (raw < clamped || raw > clamped) {
          var range = rangeDescription();
          setMessage('info', '超出允许范围' + (range ? '（' + range + '）' : '') + '，已调整为 ' + formatValue(rounded) + '。');
        } else if (!Object.is(rounded, raw)) {
          setMessage('info', '已按精度调整为 ' + formatValue(rounded) + '。');
        } else {
          clearMessage();
        }
        syncAria();
        if (!Object.is(previousValue, rounded)) emit(rounded, event);
      }

      function handleInput(event) {
        if (destroyed) return;
        var parsed = parseNumber(control.value);
        clearMessage();
        if (parsed.kind === 'empty') {
          var previous = state.value;
          state.value = null;
          syncAria();
          if (previous !== null) emit(null, event);
          return;
        }
        if (parsed.kind === 'number' && inRange(parsed.value)) {
          if (state.precision != null && !Object.is(roundNumber(parsed.value, state.precision), parsed.value)) {
            draftError = '数值精度尚未应用，离开输入框时会调整。';
            syncButtons();
            return;
          }
          if (!Object.is(state.value, parsed.value)) {
            state.value = parsed.value;
            syncAria();
            emit(parsed.value, event);
            return;
          }
        } else if (parsed.kind === 'number') {
          draftError = '数值超出允许范围' + (rangeDescription() ? '（' + rangeDescription() + '）' : '') + '，离开输入框时会调整。';
        } else if (parsed.kind === 'invalid') {
          draftError = '请输入有效数字；当前文本会保留，可继续修改。';
        }
        syncButtons();
      }

      function handleBlur(event) {
        commit(event);
      }

      function handleKeydown(event) {
        if (destroyed || state.disabled || state.readonly) return;
        if (event.isComposing) return;
        if (event.ctrlKey || event.altKey || event.metaKey) return;
        var key = event.key;
        if (key === 'ArrowUp' || key === 'ArrowDown') {
          event.preventDefault();
          stepBy(key === 'ArrowUp' ? 1 : -1, 1, event);
          return;
        }
        if (key === 'PageUp' || key === 'PageDown') {
          event.preventDefault();
          stepBy(key === 'PageUp' ? 1 : -1, 10, event);
          return;
        }
        if (key === 'Home' && state.min != null) {
          event.preventDefault();
          clearMessage();
          applyValue(clampValue(roundNumber(state.min, state.precision)), event);
          return;
        }
        if (key === 'End' && state.max != null) {
          event.preventDefault();
          clearMessage();
          applyValue(clampValue(roundNumber(state.max, state.precision)), event);
          return;
        }
        if (key === 'Enter') {
          commit(event);
          return;
        }
        if (key === 'Escape') {
          if (control.value !== formatValue(state.value) || messageKind === 'error') {
            control.value = formatValue(state.value);
            clearMessage();
            syncButtons();
          }
        }
      }

      function handleStepClick(event) {
        var button = event.currentTarget;
        var direction = button.dataset.nuiDirection === 'down' ? -1 : 1;
        stepBy(direction, 1, event);
      }

      function handleClear(event) {
        if (destroyed || state.disabled || state.readonly) return;
        var previous = state.value;
        state.value = null;
        control.value = '';
        clearMessage();
        syncAria();
        control.focus();
        if (previous !== null) emit(null, event);
      }

      function handleButtonMouseDown(event) {
        var target = event.target;
        if (target && target.closest && target.closest('.nui-numberinput__step, .nui-numberinput__clear')) {
          event.preventDefault();
        }
      }

      events.on(control, 'input', handleInput);
      events.on(box, 'mousedown', handleButtonMouseDown);
      events.on(control, 'blur', handleBlur);
      events.on(control, 'keydown', handleKeydown);
      events.on(upButton, 'click', handleStepClick);
      events.on(downButton, 'click', handleStepClick);
      events.on(clearButton, 'click', handleClear);

      control.value = formatValue(state.value);
      control.placeholder = text(state.placeholder);
      if (state.id) control.id = text(state.id);
      syncAria();
      host.appendChild(root);

      return {
        el: root,
        getValue: function () { return state.value; },
        getError: function () { return messageKind === 'error' ? messageText : draftError; },
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          var reformat = false;
          if (own(patch, 'value')) {
            state.value = numberOrNull(patch.value);
            control.value = formatValue(state.value);
            reformat = true;
          }
          if (own(patch, 'min')) state.min = numberOrNull(patch.min);
          if (own(patch, 'max')) state.max = numberOrNull(patch.max);
          if (own(patch, 'step')) state.step = normalizeStep(patch.step);
          if (own(patch, 'precision')) {
            state.precision = normalizePrecision(patch.precision);
            reformat = true;
          }
          if (own(patch, 'disabled')) state.disabled = Boolean(patch.disabled);
          if (own(patch, 'readonly')) state.readonly = Boolean(patch.readonly);
          if (own(patch, 'placeholder')) {
            state.placeholder = patch.placeholder;
            control.placeholder = text(patch.placeholder);
          }
          if (own(patch, 'clearable')) state.clearable = Boolean(patch.clearable);
          if (own(patch, 'onChange')) state.onChange = patch.onChange;
          if (own(patch, 'id')) {
            state.id = patch.id;
            if (state.id) control.id = text(state.id);
            else control.removeAttribute('id');
          }
          if (own(patch, 'value') || own(patch, 'min') || own(patch, 'max') || own(patch, 'step') || own(patch, 'precision')) clearMessage();
          if (reformat && state.value != null && !own(patch, 'value')) control.value = formatValue(state.value);
          syncAria();
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          events.clear();
          root.remove();
        }
      };
    }
  };

  /* ------------------------------------------------------------------ */
  /* F05 Checkbox                                                       */
  /* ------------------------------------------------------------------ */

  NoteUI.Checkbox = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var state = {
        label: '',
        checked: false,
        indeterminate: false,
        disabled: false,
        value: undefined,
        onChange: null
      };
      var input = options && typeof options === 'object' ? options : {};
      ['label', 'checked', 'indeterminate', 'disabled', 'value', 'onChange'].forEach(function (key) {
        if (own(input, key)) state[key] = input[key];
      });
      state.checked = Boolean(state.checked);
      state.indeterminate = Boolean(state.indeterminate);
      state.disabled = Boolean(state.disabled);

      var root = make('label', 'nui-checkbox');
      var control = make('input', 'nui-checkbox__control');
      var labelEl = make('span', 'nui-checkbox__text');
      var destroyed = false;
      var events = binder();

      control.type = 'checkbox';
      root.appendChild(control);
      root.appendChild(labelEl);

      function render() {
        control.checked = state.checked;
        control.indeterminate = state.indeterminate;
        control.disabled = state.disabled;
        if (state.value !== undefined) control.value = text(state.value);
        labelEl.textContent = text(state.label);
        root.classList.toggle('nui-checkbox--disabled', state.disabled);
        root.classList.toggle('nui-checkbox--indeterminate', state.indeterminate);
      }

      function handleChange(event) {
        if (destroyed) return;
        state.checked = control.checked;
        state.indeterminate = control.indeterminate;
        root.classList.toggle('nui-checkbox--indeterminate', state.indeterminate);
        if (typeof state.onChange === 'function') state.onChange(state.checked, event);
      }

      events.on(control, 'change', handleChange);
      render();
      host.appendChild(root);

      return {
        el: root,
        getValue: function () { return control.checked; },
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          ['label', 'checked', 'indeterminate', 'disabled', 'value', 'onChange'].forEach(function (key) {
            if (own(patch, key)) state[key] = patch[key];
          });
          state.checked = Boolean(state.checked);
          state.indeterminate = Boolean(state.indeterminate);
          state.disabled = Boolean(state.disabled);
          render();
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          events.clear();
          root.remove();
        }
      };
    }
  };

  /* ------------------------------------------------------------------ */
  /* F06 RadioGroup                                                     */
  /* ------------------------------------------------------------------ */

  NoteUI.RadioGroup = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var state = {
        options: [],
        value: null,
        label: '',
        disabled: false,
        inline: false,
        onChange: null
      };
      var input = options && typeof options === 'object' ? options : {};
      ['options', 'value', 'label', 'disabled', 'inline', 'onChange'].forEach(function (key) {
        if (own(input, key)) state[key] = input[key];
      });
      state.disabled = Boolean(state.disabled);
      state.inline = Boolean(state.inline);

      var name = uid('nui-radio');
      var root = make('fieldset', 'nui-radiogroup');
      var legend = make('legend', 'nui-radiogroup__legend');
      var legendText = make('span', 'nui-radiogroup__legend-text');
      var fallbackLegend = make('span', 'nui-radiogroup__visually-hidden', '选项组');
      var list = make('div', 'nui-radiogroup__options');
      var destroyed = false;
      var events = binder();
      var controls = [];

      legend.appendChild(legendText);
      legend.appendChild(fallbackLegend);
      root.appendChild(legend);
      root.appendChild(list);

      function normalizeOptions(value) {
        if (!Array.isArray(value)) return [];
        return value.filter(function (item) {
          return item && typeof item === 'object';
        }).map(function (item) {
          return {
            value: item.value,
            label: item.label == null ? text(item.value) : text(item.label),
            disabled: Boolean(item.disabled)
          };
        });
      }

      function selectedIndex() {
        for (var i = 0; i < state.options.length; i += 1) {
          if (Object.is(state.options[i].value, state.value)) return i;
        }
        return -1;
      }

      function build() {
        controls = [];
        while (list.firstChild) list.removeChild(list.firstChild);
        if (!state.options.length) {
          list.appendChild(make('p', 'nui-radiogroup__empty', '暂无选项'));
          return;
        }
        state.options.forEach(function (item, index) {
          var option = make('label', 'nui-radiogroup__option');
          var control = make('input', 'nui-radiogroup__control');
          var label = make('span', 'nui-radiogroup__text');
          control.type = 'radio';
          control.name = name;
          control.value = String(index);
          control.disabled = item.disabled || state.disabled;
          control.dataset.nuiIndex = String(index);
          label.textContent = item.label;
          option.classList.toggle('nui-radiogroup__option--disabled', item.disabled || state.disabled);
          option.appendChild(control);
          option.appendChild(label);
          list.appendChild(option);
          controls.push(control);
        });
        renderSelection();
      }

      function renderSelection() {
        var chosen = selectedIndex();
        controls.forEach(function (control, index) {
          control.checked = index === chosen;
        });
      }

      function render() {
        legendText.textContent = text(state.label);
        fallbackLegend.hidden = Boolean(state.label);
        root.classList.toggle('nui-radiogroup--inline', state.inline);
        root.classList.toggle('nui-radiogroup--disabled', state.disabled);
        controls.forEach(function (control, index) {
          var disabled = state.options[index].disabled || state.disabled;
          control.disabled = disabled;
          control.parentNode.classList.toggle('nui-radiogroup__option--disabled', disabled);
        });
        renderSelection();
      }

      function handleChange(event) {
        if (destroyed) return;
        var control = event.target;
        if (!control || control.type !== 'radio' || control.name !== name) return;
        var index = Number(control.dataset.nuiIndex);
        var item = state.options[index];
        if (!item || item.disabled || state.disabled || !control.checked) return;
        var previous = state.value;
        state.value = item.value;
        if (!Object.is(previous, state.value) && typeof state.onChange === 'function') {
          state.onChange(state.value, event);
        }
      }

      events.on(list, 'change', handleChange);
      state.options = normalizeOptions(state.options);
      if (selectedIndex() < 0) state.value = null;
      build();
      render();
      host.appendChild(root);

      return {
        el: root,
        getValue: function () { return state.value; },
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          if (own(patch, 'label')) state.label = patch.label;
          if (own(patch, 'disabled')) state.disabled = Boolean(patch.disabled);
          if (own(patch, 'inline')) state.inline = Boolean(patch.inline);
          if (own(patch, 'onChange')) state.onChange = patch.onChange;
          var optionsChanged = own(patch, 'options');
          if (optionsChanged) {
            state.options = normalizeOptions(patch.options);
            build();
          }
          if (own(patch, 'value')) state.value = patch.value;
          if (selectedIndex() < 0) state.value = null;
          render();
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          events.clear();
          root.remove();
        }
      };
    }
  };

  /* ------------------------------------------------------------------ */
  /* F07 Select                                                         */
  /* ------------------------------------------------------------------ */

  NoteUI.Select = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var state = {
        options: [],
        value: null,
        multiple: false,
        placeholder: '',
        clearable: false,
        disabled: false,
        onChange: null,
        emptyText: '',
        id: '',
        size: null
      };
      var input = options && typeof options === 'object' ? options : {};
      ['options', 'value', 'multiple', 'placeholder', 'clearable', 'disabled', 'onChange', 'emptyText', 'id', 'size'].forEach(function (key) {
        if (own(input, key)) state[key] = input[key];
      });
      state.multiple = Boolean(state.multiple);
      state.clearable = Boolean(state.clearable);
      state.disabled = Boolean(state.disabled);
      state.options = normalizeOptions(state.options);
      state.value = normalizeDesired(state.value);

      var root = make('div', 'nui-select');
      var row = make('div', 'nui-select__row');
      var control = make('select', 'nui-select__native');
      var clearButton = make('button', 'nui-select__clear');
      var clearGlyph = make('span', 'nui-select__clear-glyph', '×');
      var summary = make('div', 'nui-select__summary');
      var base = uid('nui-select');
      var summaryId = base + '-summary';
      var destroyed = false;
      var events = binder();

      clearButton.type = 'button';
      clearButton.setAttribute('aria-label', '清空选择');
      clearGlyph.setAttribute('aria-hidden', 'true');
      clearButton.appendChild(clearGlyph);
      summary.id = summaryId;
      summary.setAttribute('role', 'status');
      summary.setAttribute('aria-live', 'polite');
      row.appendChild(control);
      row.appendChild(clearButton);
      root.appendChild(row);
      root.appendChild(summary);

      function normalizeOptions(value) {
        if (!Array.isArray(value)) return [];
        return value.filter(function (item) {
          return item && typeof item === 'object';
        }).map(function (item) {
          return {
            value: item.value,
            label: item.label == null ? text(item.value) : text(item.label),
            disabled: Boolean(item.disabled)
          };
        });
      }

      function normalizeDesired(value) {
        if (state.multiple) {
          if (Array.isArray(value)) return value.slice();
          return value == null ? [] : [value];
        }
        if (Array.isArray(value)) return value.length ? value[0] : null;
        return value == null ? null : value;
      }

      function placeholderText() {
        return text(state.placeholder);
      }

      function emptyLabel() {
        return state.emptyText ? text(state.emptyText) : '暂无选项';
      }

      function multipleSize() {
        if (state.size != null) {
          var given = Math.floor(Number(state.size));
          if (isFinite(given) && given > 0) return given;
        }
        var count = state.options.length;
        return Math.min(7, Math.max(2, count || 2));
      }

      function buildOptions() {
        while (control.firstChild) control.removeChild(control.firstChild);
        if (!state.options.length) {
          var empty = make('option', 'nui-select__empty-option', emptyLabel());
          empty.value = '';
          empty.disabled = true;
          control.appendChild(empty);
          return;
        }
        if (!state.multiple && placeholderText()) {
          var hint = make('option', 'nui-select__placeholder', placeholderText());
          hint.value = '';
          control.appendChild(hint);
        }
        state.options.forEach(function (item, index) {
          var option = make('option', 'nui-select__option', item.label);
          option.value = String(index);
          option.disabled = item.disabled;
          control.appendChild(option);
        });
      }

      function selectedOptionIndex() {
        if (control.selectedIndex < 0) return -1;
        var option = control.options[control.selectedIndex];
        if (!option || option.value === '') return -1;
        return Number(option.value);
      }

      function applySelection() {
        if (!state.options.length) {
          state.value = state.multiple ? [] : null;
          renderChrome();
          return;
        }
        if (state.multiple) {
          var desired = normalizeDesired(state.value);
          var matched = [];
          Array.prototype.forEach.call(control.options, function (option, index) {
            if (option.value === '') {
              option.selected = false;
              return;
            }
            var item = state.options[Number(option.value)];
            if (!item) return;
            var found = desired.some(function (value) { return Object.is(value, item.value); });
            option.selected = Boolean(found);
            if (found) matched.push(item.value);
          });
          state.value = matched;
        } else {
          var value = state.value;
          var chosen = false;
          Array.prototype.forEach.call(control.options, function (option) {
            if (option.value === '') {
              option.selected = false;
              return;
            }
            var item = state.options[Number(option.value)];
            if (!item) return;
            if (!chosen && Object.is(item.value, value)) {
              option.selected = true;
              chosen = true;
            } else {
              option.selected = false;
            }
          });
          if (!chosen) {
            state.value = null;
            var placeholderOption = control.options.length && control.options[0].value === '' ? control.options[0] : null;
            if (placeholderOption) placeholderOption.selected = true;
            else control.selectedIndex = -1;
          }
        }
        renderChrome();
      }

      function summaryText() {
        var values = Array.isArray(state.value) ? state.value : [];
        if (!values.length) return '尚未选择。';
        var labels = values.map(function (value) {
          var item = state.options.find(function (option) { return Object.is(option.value, value); });
          return item ? item.label : text(value);
        });
        return '已选 ' + labels.length + ' 项：' + labels.join('、') + '。';
      }

      function renderChrome() {
        control.multiple = state.multiple;
        control.disabled = state.disabled;
        if (state.multiple) {
          control.size = multipleSize();
          describedByAdd(control, summaryId);
          summary.hidden = false;
          summary.textContent = summaryText();
        } else {
          control.removeAttribute('size');
          describedByRemove(control, summaryId);
          summary.hidden = true;
          summary.textContent = '';
        }
        root.classList.toggle('nui-select--multiple', state.multiple);
        root.classList.toggle('nui-select--disabled', state.disabled);
        clearButton.disabled = state.disabled;
        var hasValue = state.multiple ? (Array.isArray(state.value) && state.value.length > 0) : state.value != null;
        clearButton.hidden = !(state.clearable && !state.disabled && hasValue);
      }

      function rebuild() {
        buildOptions();
        applySelection();
      }

      function readControlValue() {
        if (state.multiple) {
          var values = [];
          Array.prototype.forEach.call(control.options, function (option) {
            if (!option.selected || option.value === '') return;
            var item = state.options[Number(option.value)];
            if (item && !item.disabled) values.push(item.value);
          });
          return values;
        }
        var index = selectedOptionIndex();
        if (index < 0) return null;
        var selected = state.options[index];
        return selected ? selected.value : null;
      }

      function handleChange(event) {
        if (destroyed || state.disabled) return;
        state.value = readControlValue();
        renderChrome();
        if (typeof state.onChange === 'function') state.onChange(state.value, event);
      }

      function handleClear(event) {
        if (destroyed || state.disabled) return;
        var hadValue = state.multiple ? (Array.isArray(state.value) && state.value.length > 0) : state.value != null;
        if (!hadValue) return;
        state.value = state.multiple ? [] : null;
        applySelection();
        control.focus();
        if (typeof state.onChange === 'function') state.onChange(state.value, event);
      }

      events.on(control, 'change', handleChange);
      events.on(clearButton, 'click', handleClear);
      if (state.id) control.id = text(state.id);
      rebuild();
      host.appendChild(root);

      return {
        el: root,
        getValue: function () { return state.multiple ? (Array.isArray(state.value) ? state.value.slice() : []) : state.value; },
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          var rebuildNeeded = false;
          if (own(patch, 'multiple')) {
            state.multiple = Boolean(patch.multiple);
            state.value = normalizeDesired(state.value);
            rebuildNeeded = true;
          }
          if (own(patch, 'options')) {
            state.options = normalizeOptions(patch.options);
            rebuildNeeded = true;
          }
          if (own(patch, 'placeholder')) {
            state.placeholder = patch.placeholder;
            rebuildNeeded = true;
          }
          if (own(patch, 'emptyText')) {
            state.emptyText = patch.emptyText;
            rebuildNeeded = true;
          }
          if (own(patch, 'size')) {
            state.size = patch.size;
            rebuildNeeded = true;
          }
          if (own(patch, 'clearable')) state.clearable = Boolean(patch.clearable);
          if (own(patch, 'disabled')) state.disabled = Boolean(patch.disabled);
          if (own(patch, 'onChange')) state.onChange = patch.onChange;
          if (own(patch, 'id')) {
            state.id = patch.id;
            if (state.id) control.id = text(state.id);
            else control.removeAttribute('id');
          }
          if (own(patch, 'value')) {
            state.value = normalizeDesired(patch.value);
            rebuildNeeded = true;
          }
          if (rebuildNeeded) rebuild();
          else renderChrome();
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          events.clear();
          root.remove();
        }
      };
    }
  };

  /* ------------------------------------------------------------------ */
  /* F08 Combobox                                                       */
  /* ------------------------------------------------------------------ */

  NoteUI.Combobox = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var state = {
        options: [],
        value: null,
        placeholder: '',
        clearable: false,
        disabled: false,
        allowFreeText: false,
        emptyText: '',
        onChange: null,
        id: ''
      };
      var input = options && typeof options === 'object' ? options : {};
      ['options', 'value', 'placeholder', 'clearable', 'disabled', 'allowFreeText', 'emptyText', 'onChange', 'id'].forEach(function (key) {
        if (own(input, key)) state[key] = input[key];
      });
      state.clearable = Boolean(state.clearable);
      state.disabled = Boolean(state.disabled);
      state.allowFreeText = Boolean(state.allowFreeText);
      state.options = normalizeOptions(state.options);
      state.value = normalizeValue(state.value);

      var base = uid('nui-combobox');
      var listId = base + '-list';
      var statusId = base + '-status';
      var root = make('div', 'nui-combobox');
      var controlWrap = make('div', 'nui-combobox__control');
      var control = make('input', 'nui-combobox__input');
      var clearButton = make('button', 'nui-combobox__clear');
      var clearGlyph = make('span', 'nui-combobox__clear-glyph', '×');
      var toggleButton = make('button', 'nui-combobox__toggle');
      var toggleGlyph = make('span', 'nui-combobox__toggle-glyph', '▾');
      var list = make('ul', 'nui-combobox__list');
      var status = make('div', 'nui-combobox__status');
      var destroyed = false;
      var events = binder();
      var open = false;
      var activeIndex = -1;
      var visible = [];
      var composing = false;
      var query = '';
      var optionIdBase = 0;

      control.type = 'text';
      control.autocomplete = 'off';
      control.spellcheck = false;
      control.setAttribute('role', 'combobox');
      control.setAttribute('aria-autocomplete', 'list');
      control.setAttribute('aria-haspopup', 'listbox');
      control.setAttribute('aria-expanded', 'false');
      control.setAttribute('aria-controls', listId);
      control.placeholder = text(state.placeholder);
      if (state.id) control.id = text(state.id);

      clearButton.type = 'button';
      clearButton.setAttribute('aria-label', '清空选择');
      clearGlyph.setAttribute('aria-hidden', 'true');
      clearButton.appendChild(clearGlyph);
      toggleButton.type = 'button';
      toggleButton.setAttribute('aria-label', '展开选项');
      toggleButton.setAttribute('aria-haspopup', 'listbox');
      toggleGlyph.setAttribute('aria-hidden', 'true');
      toggleButton.appendChild(toggleGlyph);

      list.id = listId;
      list.setAttribute('role', 'listbox');
      list.setAttribute('aria-label', '候选选项');
      list.hidden = true;
      status.id = statusId;
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.className = 'nui-combobox__status nui-combobox__visually-hidden';

      controlWrap.appendChild(control);
      controlWrap.appendChild(clearButton);
      controlWrap.appendChild(toggleButton);
      root.appendChild(controlWrap);
      root.appendChild(list);
      root.appendChild(status);

      function normalizeOptions(value) {
        if (!Array.isArray(value)) return [];
        return value.filter(function (item) {
          return item && typeof item === 'object';
        }).map(function (item) {
          return {
            value: item.value,
            label: item.label == null ? text(item.value) : text(item.label),
            disabled: Boolean(item.disabled)
          };
        });
      }

      function findOption(value) {
        for (var i = 0; i < state.options.length; i += 1) {
          if (Object.is(state.options[i].value, value)) return state.options[i];
        }
        return null;
      }

      function normalizeValue(value) {
        if (value === undefined || value === '') return null;
        if (value === null) return null;
        var matched = findOption(value);
        if (matched) return matched.value;
        if (state.allowFreeText) return value;
        return null;
      }

      function displayText() {
        if (state.value == null) return '';
        var matched = findOption(state.value);
        if (matched) return matched.label;
        if (state.allowFreeText) return text(state.value);
        return '';
      }

      function emptyMessage(query) {
        if (state.emptyText) return text(state.emptyText);
        return query ? '无匹配选项' : '暂无选项';
      }

      function normalizedQuery() {
        var value = text(query).trim();
        return value ? value.toLocaleLowerCase() : '';
      }

      function filterOptions(query) {
        if (!query) return state.options.map(function (item, index) { return { item: item, index: index }; });
        return state.options.map(function (item, index) {
          return { item: item, index: index };
        }).filter(function (entry) {
          return entry.item.label.toLocaleLowerCase().indexOf(query) >= 0;
        });
      }

      function syncClear() {
        control.disabled = state.disabled;
        clearButton.hidden = !(state.clearable && !state.disabled && (state.value != null || control.value !== ''));
        clearButton.disabled = state.disabled;
        toggleButton.disabled = state.disabled;
      }

      function moveActive(direction) {
        if (!visible.length) {
          activeIndex = -1;
          renderList();
          return;
        }
        var start = activeIndex;
        if (start < 0 || start >= visible.length) start = direction > 0 ? -1 : 0;
        var index = start;
        for (var count = 0; count < visible.length; count += 1) {
          index = (index + direction + visible.length) % visible.length;
          if (!visible[index].item.disabled) {
            activeIndex = index;
            break;
          }
        }
        renderList();
      }

      function scrollActiveIntoView() {
        if (activeIndex < 0) return;
        var activeEl = list.querySelector('[data-nui-active="true"]');
        if (activeEl && typeof activeEl.scrollIntoView === 'function') {
          activeEl.scrollIntoView({ block: 'nearest' });
        }
      }

      function renderList() {
        while (list.firstChild) list.removeChild(list.firstChild);
        var query = normalizedQuery();
        visible = filterOptions(query);
        var selectedIndex = -1;
        for (var i = 0; i < visible.length; i += 1) {
          if (Object.is(visible[i].item.value, state.value)) { selectedIndex = i; break; }
        }
        if (activeIndex >= visible.length) activeIndex = -1;
        if (activeIndex < 0 && visible.length) {
          if (selectedIndex >= 0 && !visible[selectedIndex].item.disabled) activeIndex = selectedIndex;
          else {
            for (var j = 0; j < visible.length; j += 1) {
              if (!visible[j].item.disabled) { activeIndex = j; break; }
            }
          }
        }
        if (!visible.length) {
          activeIndex = -1;
          var empty = make('li', 'nui-combobox__empty', emptyMessage(query));
          empty.setAttribute('role', 'option');
          empty.setAttribute('aria-disabled', 'true');
          list.appendChild(empty);
          control.removeAttribute('aria-activedescendant');
          status.textContent = emptyMessage(query);
          return;
        }
        status.textContent = '';
        visible.forEach(function (entry, index) {
          var option = make('li', 'nui-combobox__option');
          optionIdBase += 1;
          option.id = base + '-option-' + optionIdBase;
          option.setAttribute('role', 'option');
          option.dataset.nuiIndex = String(index);
          if (entry.item.disabled) {
            option.setAttribute('aria-disabled', 'true');
            option.classList.add('nui-combobox__option--disabled');
          }
          var active = index === activeIndex;
          if (active) {
            option.setAttribute('aria-selected', 'true');
            option.dataset.nuiActive = 'true';
            option.classList.add('nui-combobox__option--active');
            control.setAttribute('aria-activedescendant', option.id);
          } else {
            option.setAttribute('aria-selected', 'false');
          }
          option.textContent = entry.item.label;
          list.appendChild(option);
        });
        if (activeIndex < 0) control.removeAttribute('aria-activedescendant');
        scrollActiveIntoView();
      }

      function openList(resetQuery) {
        if (destroyed || state.disabled) return;
        if (resetQuery) query = '';
        if (open) {
          if (resetQuery) activeIndex = -1;
          renderList();
          syncClear();
          return;
        }
        open = true;
        if (!resetQuery) query = control.value;
        activeIndex = -1;
        root.classList.add('nui-combobox--open');
        list.hidden = false;
        control.setAttribute('aria-expanded', 'true');
        toggleButton.setAttribute('aria-label', '收起选项');
        toggleGlyph.textContent = '▴';
        renderList();
        syncClear();
      }

      function closeList(reason, event) {
        if (!open) return;
        open = false;
        activeIndex = -1;
        root.classList.remove('nui-combobox--open');
        list.hidden = true;
        control.setAttribute('aria-expanded', 'false');
        control.removeAttribute('aria-activedescendant');
        toggleButton.setAttribute('aria-label', '展开选项');
        toggleGlyph.textContent = '▾';
        status.textContent = '';
        visible = [];
        var display = displayText();
        if (reason === 'outside' || reason === 'blur') {
          if (state.allowFreeText) {
            var raw = control.value;
            if (raw !== display) {
              var next = raw === '' ? null : raw;
              var previous = state.value;
              state.value = next;
              if (!Object.is(previous, next) && typeof state.onChange === 'function') state.onChange(next, event);
            }
          } else {
            control.value = display;
          }
        } else if (reason === 'esc' || reason === 'toggle' || reason === 'program' || reason === 'destroy') {
          control.value = display;
        }
        query = '';
        syncClear();
      }

      function choose(index, event) {
        var entry = visible[index];
        if (!entry || entry.item.disabled) return;
        var previous = state.value;
        state.value = entry.item.value;
        control.value = entry.item.label;
        activeIndex = -1;
        closeList('select');
        control.focus();
        syncClear();
        if (!Object.is(previous, state.value) && typeof state.onChange === 'function') {
          state.onChange(state.value, event);
        }
      }

      function commitFree(event) {
        var raw = control.value;
        var next = raw === '' ? null : raw;
        var previous = state.value;
        state.value = next;
        activeIndex = -1;
        closeList('select');
        syncClear();
        if (!Object.is(previous, next) && typeof state.onChange === 'function') {
          state.onChange(next, event);
        }
      }

      function handleInput(event) {
        if (destroyed || state.disabled) return;
        if (composing) {
          syncClear();
          return;
        }
        query = control.value;
        if (!open) openList(false);
        else {
          activeIndex = -1;
          renderList();
        }
        syncClear();
      }

      function handleFocus() {
        syncClear();
      }

      function handleClick() {
        if (destroyed || state.disabled) return;
        if (!open) openList(true);
      }

      function handleKeydown(event) {
        if (destroyed || state.disabled) return;
        if (event.isComposing || composing) return;
        var key = event.key;
        if (key === 'ArrowDown') {
          event.preventDefault();
          if (!open) openList(true);
          else moveActive(1);
          return;
        }
        if (key === 'ArrowUp') {
          event.preventDefault();
          if (!open) {
            openList(true);
            activeIndex = visible.length;
            moveActive(-1);
          } else {
            moveActive(-1);
          }
          return;
        }
        if (key === 'Home' && open) {
          event.preventDefault();
          activeIndex = -1;
          moveActive(1);
          return;
        }
        if (key === 'End' && open) {
          event.preventDefault();
          activeIndex = visible.length;
          moveActive(-1);
          return;
        }
        if (key === 'Enter' && open) {
          event.preventDefault();
          if (activeIndex >= 0 && visible[activeIndex] && !visible[activeIndex].item.disabled) {
            choose(activeIndex, event);
          } else if (state.allowFreeText) {
            commitFree(event);
          } else {
            closeList('esc');
          }
          return;
        }
        if (key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          closeList('esc');
          control.focus();
        }
      }

      function handleBlur(event) {
        if (!open) return;
        var next = event.relatedTarget;
        if (next && root.contains(next)) return;
        closeList('blur', event);
      }

      function handleDocumentPointer(event) {
        if (!open) return;
        if (root.contains(event.target)) return;
        closeList('outside', event);
      }

      function handleListMouseDown(event) {
        /* Keep focus in the combobox input while clicking options, padding or
           the list scrollbar; wheel/touch scrolling remains native. */
        event.preventDefault();
      }

      function handleOptionClick(event) {
        var option = event.target.closest ? event.target.closest('.nui-combobox__option') : null;
        if (!option || !list.contains(option)) return;
        choose(Number(option.dataset.nuiIndex), event);
      }

      function handleRootMouseDown(event) {
        var target = event.target;
        if (!target) return;
        if (target.closest && target.closest('.nui-combobox__clear, .nui-combobox__toggle')) {
          event.preventDefault();
        }
      }

      function handleToggle(event) {
        if (destroyed || state.disabled) return;
        if (open) {
          var hadFocus = document.activeElement === toggleButton;
          closeList('toggle');
          if (hadFocus) control.focus();
        } else {
          openList(true);
          control.focus();
        }
      }

      function handleClear(event) {
        if (destroyed || state.disabled) return;
        var previous = state.value;
        state.value = null;
        control.value = '';
        activeIndex = -1;
        closeList('clear');
        syncClear();
        control.focus();
        if (previous != null && typeof state.onChange === 'function') state.onChange(null, event);
      }

      function handleCompositionStart() {
        composing = true;
      }

      function handleCompositionEnd(event) {
        composing = false;
        if (destroyed || state.disabled) return;
        query = control.value;
        if (!open) openList(false);
        else {
          activeIndex = -1;
          renderList();
        }
        syncClear();
      }

      events.on(control, 'input', handleInput);
      events.on(control, 'focus', handleFocus);
      events.on(control, 'click', handleClick);
      events.on(control, 'keydown', handleKeydown);
      events.on(control, 'blur', handleBlur);
      events.on(control, 'compositionstart', handleCompositionStart);
      events.on(control, 'compositionend', handleCompositionEnd);
      events.on(list, 'mousedown', handleListMouseDown);
      events.on(list, 'click', handleOptionClick);
      events.on(root, 'mousedown', handleRootMouseDown);
      events.on(toggleButton, 'click', handleToggle);
      events.on(clearButton, 'click', handleClear);
      events.on(document, 'pointerdown', handleDocumentPointer, true);

      control.value = displayText();
      syncClear();
      host.appendChild(root);

      return {
        el: root,
        getValue: function () { return state.value; },
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          var optionsChanged = own(patch, 'options');
          var allowChanged = own(patch, 'allowFreeText');
          var valuePatch = own(patch, 'value');
          if (optionsChanged) state.options = normalizeOptions(patch.options);
          if (own(patch, 'placeholder')) {
            state.placeholder = patch.placeholder;
            control.placeholder = text(patch.placeholder);
          }
          if (own(patch, 'clearable')) state.clearable = Boolean(patch.clearable);
          if (own(patch, 'disabled')) {
            state.disabled = Boolean(patch.disabled);
            control.disabled = state.disabled;
            if (state.disabled) closeList('program');
          }
          if (allowChanged) state.allowFreeText = Boolean(patch.allowFreeText);
          if (own(patch, 'emptyText')) state.emptyText = patch.emptyText;
          if (own(patch, 'onChange')) state.onChange = patch.onChange;
          if (own(patch, 'id')) {
            state.id = patch.id;
            if (state.id) control.id = text(state.id);
            else control.removeAttribute('id');
          }
          if (valuePatch) state.value = normalizeValue(patch.value);
          else if (optionsChanged || allowChanged) state.value = normalizeValue(state.value);
          if (valuePatch || optionsChanged || allowChanged) {
            control.value = displayText();
            if (open) {
              if (state.disabled) closeList('program');
              else {
                query = '';
                activeIndex = -1;
                renderList();
              }
            }
          } else if (open && own(patch, 'emptyText')) {
            renderList();
          }
          syncClear();
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          if (open) {
            open = false;
            list.hidden = true;
            control.setAttribute('aria-expanded', 'false');
            control.removeAttribute('aria-activedescendant');
          }
          events.clear();
          root.remove();
        }
      };
    }
  };

  NoteUI.formsBasic = {
    version: '1.0.0',
    components: ['Field', 'TextInput', 'Textarea', 'NumberInput', 'Checkbox', 'RadioGroup', 'Select', 'Combobox']
  };
})(window);
