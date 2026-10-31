/* NoteUI forms-advanced — F09–F11: Switch, Slider, Form.
   Plain browser script (no framework, no external libraries).
   依赖 core（NoteCore）；Form 的标准文本/文本域/数字/复选/下拉行还依赖
   src/ui/forms-basic.js 的 Field/TextInput/Textarea/NumberInput/Checkbox/Select。
   私有共享 helper 集中在 forms-advanced-internal.js，必须在组件文件之前加载。
   Programmatic update() never fires onChange. */
(function (global) {
  'use strict';

  var NoteUI = global.NoteUI = global.NoteUI || {};

  var Internal = NoteUI._formsAdvancedInternal;
  if (!Internal) throw new Error('NoteUI forms-advanced 组件文件需要在 forms-advanced-internal.js 之后加载。');
  var own = Internal.own;
  var text = Internal.text;
  var hintJoin = Internal.hintJoin;
  var hintWithReason = Internal.hintWithReason;
  var make = Internal.make;
  var uid = Internal.uid;
  var validateHost = Internal.validateHost;
  var listen = Internal.listen;
  var component = Internal.component;
  var copy = Internal.copy;
  var setHidden = Internal.setHidden;
  var addDescribedBy = Internal.addDescribedBy;
  var removeDescribedBy = Internal.removeDescribedBy;
  var call = Internal.call;
  var isNode = Internal.isNode;
  var icon = Internal.icon;
  var labelRow = Internal.labelRow;
  var syncHeadLabel = Internal.syncHeadLabel;
  var messageLine = Internal.messageLine;
  var readOptions = Internal.readOptions;
  var updateMessage = Internal.updateMessage;
  var syncMessages = Internal.syncMessages;
  var externalErrorText = Internal.externalErrorText;
  var createDialogLayer = Internal.createDialogLayer;
  var guardTriggerPointer = Internal.guardTriggerPointer;

  /* ------------------------------------------------------------------ */
  /* F09 Switch                                                         */
  /* ------------------------------------------------------------------ */

  NoteUI.Switch = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var input = options && typeof options === 'object' ? options : {};
      var state = readOptions(input, {
        checked: false,
        label: '开关',
        disabled: false,
        onChange: null,
        hint: '',
        disabledReason: '',
        required: false,
        ariaLabel: '',
        error: ''
      });
      state.checked = Boolean(state.checked);
      state.disabled = Boolean(state.disabled);
      state.required = Boolean(state.required);

      var base = uid('nui-switch');
      var labelId = base + '-label';
      var hintId = base + '-hint';
      var errorId = base + '-error';
      var root = make('div', 'nui-switch');
      var button = make('button', 'nui-switch__button');
      var track = make('span', 'nui-switch__track');
      var thumb = make('span', 'nui-switch__thumb');
      var textWrap = make('span', 'nui-switch__text');
      var labelEl = make('span', 'nui-switch__label');
      var requiredMark = make('span', 'nui-switch__required', '必填');
      var stateEl = make('span', 'nui-switch__state');
      var hintEl = messageLine('nui-switch', 'hint', hintId);
      var errorEl = messageLine('nui-switch', 'error', errorId);
      var events = listen(root);
      var destroyed = false;

      button.type = 'button';
      button.setAttribute('role', 'switch');
      button.setAttribute('aria-labelledby', labelId);
      button.setAttribute('aria-describedby', hintId + ' ' + errorId);
      track.setAttribute('aria-hidden', 'true');
      stateEl.setAttribute('aria-hidden', 'true');
      labelEl.id = labelId;
      track.appendChild(thumb);
      textWrap.appendChild(labelEl);
      textWrap.appendChild(stateEl);
      button.appendChild(track);
      button.appendChild(textWrap);
      root.appendChild(button);
      root.appendChild(hintEl);
      root.appendChild(errorEl);

      function render() {
        var checked = Boolean(state.checked);
        var hasLabel = text(state.label) !== '';
        button.disabled = Boolean(state.disabled);
        button.setAttribute('aria-checked', checked ? 'true' : 'false');
        if (state.required) button.setAttribute('aria-required', 'true');
        else button.removeAttribute('aria-required');
        labelEl.textContent = text(state.label);
        if (state.required) {
          labelEl.appendChild(document.createTextNode(' '));
          labelEl.appendChild(requiredMark);
        }
        labelEl.hidden = !hasLabel && !state.required;
        stateEl.textContent = checked ? '已开启' : '已关闭';
        root.classList.toggle('nui-switch--checked', checked);
        root.classList.toggle('nui-switch--disabled', Boolean(state.disabled));
        syncMessages({
          hintEl: hintEl,
          hint: hintWithReason(state),
          errorEl: errorEl,
          error: state.error,
          nodes: [button],
          hintId: hintId,
          errorId: errorId
        });
        if (!hasLabel && !state.required) {
          button.removeAttribute('aria-labelledby');
          button.setAttribute('aria-label', text(state.ariaLabel) || '开关');
        } else {
          button.removeAttribute('aria-label');
          button.setAttribute('aria-labelledby', labelId);
        }
      }

      function handleClick(event) {
        if (destroyed || state.disabled) return;
        if (!button.contains(event.target)) return;
        state.checked = !state.checked;
        state.error = '';
        render();
        call(state.onChange, state.checked, event);
      }

      events.on('click', handleClick);
      render();
      host.appendChild(root);

      var instance = component(root, state, function (patch) {
        if (own(patch, 'checked')) state.checked = Boolean(state.checked);
        if (own(patch, 'disabled')) state.disabled = Boolean(state.disabled);
        if (own(patch, 'required')) state.required = Boolean(state.required);
        if (own(patch, 'error')) state.error = state.error == null ? '' : String(state.error);
        render();
      }, function () {
        events.clear();
      });

      instance.getValue = function () { return Boolean(state.checked); };
      instance.setError = function (message) {
        state.error = message == null ? '' : String(message);
        render();
      };
      instance.focus = function () { button.focus(); };
      instance.button = button;
      return instance;
    }
  };

  /* ------------------------------------------------------------------ */
  /* F10 Slider                                                         */
  /* ------------------------------------------------------------------ */

  NoteUI.Slider = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var input = options && typeof options === 'object' ? options : {};
      var state = readOptions(input, {
        value: undefined,
        min: 0,
        max: 100,
        step: 1,
        range: false,
        showValue: true,
        format: null,
        label: '数值',
        hint: '',
        disabled: false,
        disabledReason: '',
        required: false,
        error: '',
        ariaLabel: '',
        onChange: null
      });
      state.range = Boolean(state.range);
      state.showValue = state.showValue !== false;
      state.disabled = Boolean(state.disabled);
      state.required = Boolean(state.required);

      var base = uid('nui-slider');
      var labelId = base + '-label';
      var hintId = base + '-hint';
      var errorId = base + '-error';
      var valueId = base + '-value';
      var root = make('div', 'nui-slider');
      var head;
      var readout = make('output', 'nui-slider__readout');
      var track = make('div', 'nui-slider__range-track');
      var fill = make('span', 'nui-slider__range-fill');
      var inputWrap = make('div', 'nui-slider__controls');
      var hintEl = messageLine('nui-slider', 'hint', hintId);
      var errorEl = messageLine('nui-slider', 'error', errorId);
      var events = listen(root);
      var destroyed = false;
      var lowInput = null;
      var highInput = null;
      var singleInput = null;
      var geometry = { min: 0, max: 100, step: 1 };

      head = labelRow('nui-slider', state.label, state.required, labelId);
      readout.id = valueId;
      if (state.showValue) head.appendChild(readout);
      head.hidden = !text(state.label) && !state.required && !state.showValue;
      track.setAttribute('aria-hidden', 'true');
      track.appendChild(fill);
      root.appendChild(head);
      root.appendChild(track);
      root.appendChild(inputWrap);
      root.appendChild(hintEl);
      root.appendChild(errorEl);

      function readGeometry() {
        var min = Number(state.min);
        var max = Number(state.max);
        if (!isFinite(min)) min = 0;
        if (!isFinite(max)) max = min + 100;
        if (max < min) {
          var swap = min;
          min = max;
          max = swap;
        }
        if (max === min) max = min + 1;
        var step = Number(state.step);
        if (!isFinite(step) || step <= 0) step = 1;
        return { min: min, max: max, step: step };
      }

      function clampNumber(value, fallback) {
        var number = Number(value);
        if (!isFinite(number)) number = fallback;
        return Math.min(geometry.max, Math.max(geometry.min, number));
      }

      function snapNumber(value) {
        var clamped = clampNumber(value, geometry.min);
        var steps = Math.round((clamped - geometry.min) / geometry.step);
        var snapped = geometry.min + steps * geometry.step;
        snapped = Math.min(geometry.max, Math.max(geometry.min, snapped));
        return Number(snapped.toFixed(10));
      }

      function normalizeValue(raw) {
        if (state.range) {
          var values = Array.isArray(raw) ? raw : (raw == null ? [geometry.min, geometry.max] : [geometry.min, raw]);
          var a = snapNumber(values[0]);
          var b = snapNumber(values.length > 1 ? values[1] : geometry.max);
          if (a > b) {
            var swap = a;
            a = b;
            b = swap;
          }
          return [a, b];
        }
        var value = Array.isArray(raw) ? raw[0] : raw;
        if (value == null || value === '') return geometry.min;
        return snapNumber(value);
      }

      function formatNumber(value) {
        if (typeof state.format === 'function') {
          try {
            var formatted = state.format(value, {
              min: geometry.min,
              max: geometry.max,
              step: geometry.step,
              range: state.range
            });
            if (formatted != null && String(formatted) !== '') return String(formatted);
          } catch (error) { /* fall through to the plain number */ }
        }
        return String(value);
      }

      function readoutText() {
        if (state.range) return formatNumber(state.value[0]) + ' – ' + formatNumber(state.value[1]);
        return formatNumber(state.value);
      }

      function updateChrome() {
        syncMessages({
          hintEl: hintEl,
          hint: hintWithReason(state),
          errorEl: errorEl,
          error: state.error,
          nodes: [lowInput, highInput, singleInput],
          hintId: hintId,
          errorId: errorId
        });
        root.classList.toggle('nui-slider--range', state.range);
        root.classList.toggle('nui-slider--disabled', Boolean(state.disabled));
        if (state.range) {
          inputWrap.setAttribute('role', 'group');
          if (text(state.label) || state.required) {
            inputWrap.removeAttribute('aria-label');
            inputWrap.setAttribute('aria-labelledby', labelId);
          } else {
            inputWrap.removeAttribute('aria-labelledby');
            inputWrap.setAttribute('aria-label', text(state.ariaLabel) || '数值区间');
          }
        } else {
          inputWrap.removeAttribute('role');
          inputWrap.removeAttribute('aria-labelledby');
          inputWrap.removeAttribute('aria-label');
        }
        readout.hidden = !state.showValue;
        readout.textContent = state.showValue ? readoutText() : '';
        head.hidden = !text(state.label) && !state.required && !state.showValue;
        track.hidden = !state.range;
        if (state.range) {
          var span = geometry.max - geometry.min;
          var start = span > 0 ? ((state.value[0] - geometry.min) / span) * 100 : 0;
          var end = span > 0 ? ((state.value[1] - geometry.min) / span) * 100 : 100;
          fill.style.left = start + '%';
          fill.style.width = Math.max(0, end - start) + '%';
        }
        var suffix = text(state.label) ? text(state.label) + ' ' : '';
        [lowInput, highInput, singleInput].forEach(function (node) {
          if (!node) return;
          node.disabled = Boolean(state.disabled);
          if (state.required) node.setAttribute('aria-required', 'true');
          else node.removeAttribute('aria-required');
          if (state.range) {
            if (node === lowInput) {
              node.removeAttribute('aria-labelledby');
              node.setAttribute('aria-label', suffix + '最小值');
              node.setAttribute('aria-valuetext', formatNumber(state.value[0]));
            } else {
              node.removeAttribute('aria-labelledby');
              node.setAttribute('aria-label', suffix + '最大值');
              node.setAttribute('aria-valuetext', formatNumber(state.value[1]));
            }
          } else {
            node.removeAttribute('aria-label');
            if (text(state.label) || state.required) node.setAttribute('aria-labelledby', labelId);
            else {
              node.removeAttribute('aria-labelledby');
              node.setAttribute('aria-label', text(state.ariaLabel) || '数值');
            }
            node.setAttribute('aria-valuetext', formatNumber(state.value));
          }
        });
      }

      function applyValuesToInputs() {
        if (state.range) {
          if (lowInput) lowInput.value = String(state.value[0]);
          if (highInput) highInput.value = String(state.value[1]);
        } else if (singleInput) {
          singleInput.value = String(state.value);
        }
      }

      function handleSingleInput(event) {
        if (destroyed || state.disabled) return;
        var next = snapNumber(singleInput.value);
        var previous = state.value;
        state.value = next;
        if (singleInput.value !== String(next)) singleInput.value = String(next);
        state.error = '';
        updateChrome();
        if (previous !== next) call(state.onChange, next, event);
      }

      function handleRangeInput(event) {
        if (destroyed || state.disabled) return;
        var part = event.target === highInput ? 'high' : 'low';
        var low = snapNumber(lowInput.value);
        var high = snapNumber(highInput.value);
        var previousLow = state.value[0];
        var previousHigh = state.value[1];
        if (part === 'low' && low > high) low = high;
        if (part === 'high' && high < low) high = low;
        state.value = [low, high];
        lowInput.value = String(low);
        highInput.value = String(high);
        state.error = '';
        updateChrome();
        if (previousLow !== low || previousHigh !== high) call(state.onChange, [low, high], event);
      }

      function buildInputs() {
        inputWrap.replaceChildren();
        singleInput = null;
        lowInput = null;
        highInput = null;
        if (state.range) {
          lowInput = make('input', 'nui-slider__input');
          lowInput.type = 'range';
          lowInput.min = String(geometry.min);
          lowInput.max = String(geometry.max);
          lowInput.step = String(geometry.step);
          lowInput.value = String(state.value[0]);
          lowInput.dataset.part = 'low';

          highInput = make('input', 'nui-slider__input');
          highInput.type = 'range';
          highInput.min = String(geometry.min);
          highInput.max = String(geometry.max);
          highInput.step = String(geometry.step);
          highInput.value = String(state.value[1]);
          highInput.dataset.part = 'high';

          var lowRow = make('label', 'nui-slider__part');
          var lowText = make('span', 'nui-slider__part-label', '最小值');
          lowRow.appendChild(lowText);
          lowRow.appendChild(lowInput);
          var highRow = make('label', 'nui-slider__part');
          var highText = make('span', 'nui-slider__part-label', '最大值');
          highRow.appendChild(highText);
          highRow.appendChild(highInput);
          inputWrap.appendChild(lowRow);
          inputWrap.appendChild(highRow);
        } else {
          singleInput = make('input', 'nui-slider__input');
          singleInput.type = 'range';
          singleInput.min = String(geometry.min);
          singleInput.max = String(geometry.max);
          singleInput.step = String(geometry.step);
          singleInput.value = String(state.value);
          inputWrap.appendChild(singleInput);
        }
        updateChrome();
      }

      function rebuild() {
        geometry = readGeometry();
        state.value = normalizeValue(state.value);
        buildInputs();
      }

      function handleChange(event) {
        if (state.range) handleRangeInput(event);
        else handleSingleInput(event);
      }

      events.on('input', handleChange);
      rebuild();
      host.appendChild(root);

      var instance = component(root, state, function (patch) {
        var geometryChanged = own(patch, 'min') || own(patch, 'max') || own(patch, 'step') || own(patch, 'range');
        if (own(patch, 'showValue')) state.showValue = state.showValue !== false;
        if (own(patch, 'disabled')) state.disabled = Boolean(state.disabled);
        if (own(patch, 'required')) state.required = Boolean(state.required);
        if (own(patch, 'error')) state.error = state.error == null ? '' : String(state.error);
        var nextHead = labelRow('nui-slider', state.label, state.required, labelId);
        readout.id = valueId;
        if (state.showValue) nextHead.appendChild(readout);
        nextHead.hidden = !text(state.label) && !state.required && !state.showValue;
        if (head && head.parentNode === root) root.replaceChild(nextHead, head);
        else root.insertBefore(nextHead, root.firstChild);
        head = nextHead;
        if (geometryChanged) {
          rebuild();
        } else {
          state.value = normalizeValue(state.value);
          applyValuesToInputs();
          updateChrome();
        }
      }, function () {
        events.clear();
      });

      instance.getValue = function () {
        return state.range ? state.value.slice() : state.value;
      };
      instance.setError = function (message) {
        state.error = message == null ? '' : String(message);
        updateChrome();
      };
      instance.focus = function () {
        var target = state.range ? lowInput : singleInput;
        if (target) target.focus();
      };
      return instance;
    }
  };

  /* ------------------------------------------------------------------ */
  /* F11 Form                                                           */
  /* ------------------------------------------------------------------ */

  function formControlType(field) {
    if (!field || typeof field !== 'object') return 'text';
    if (typeof field.control === 'string') return field.control;
    if (isCustomNode(field)) return 'custom';
    return 'text';
  }

  function isCustomNode(field) {
    if (!field) return null;
    if (isNode(field.custom)) return field.custom;
    if (field.custom && field.custom.el) return field.custom;
    if (isNode(field.options)) return field.options;
    if (field.options && (isNode(field.options.custom) || (field.options.custom && field.options.custom.el))) {
      return field.options.custom;
    }
    if (isNode(field.control)) return field.control;
    if (field.control && field.control.el) return field.control;
    return null;
  }

  function defaultFormValue(field) {
    if (field && field.defaultValue !== undefined) return copy(field.defaultValue);
    var type = formControlType(field);
    var options = field && field.options && typeof field.options === 'object' && !Array.isArray(field.options) ? field.options : {};
    if (type === 'checkbox' || type === 'switch') return false;
    if (type === 'number') return null;
    if (type === 'slider') {
      var geometryMin = Number(options.min);
      if (!isFinite(geometryMin)) geometryMin = 0;
      if (options.range) {
        var geometryMax = Number(options.max);
        if (!isFinite(geometryMax)) geometryMax = 100;
        return [geometryMin, geometryMax];
      }
      return geometryMin;
    }
    if (type === 'select') {
      if (options.multiple) return [];
      return null;
    }
    if (type === 'custom') return undefined;
    return '';
  }

  function isEmptyValue(value) {
    if (value == null) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    return false;
  }

  NoteUI.Form = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var input = options && typeof options === 'object' ? options : {};
      var state = readOptions(input, {
        fields: [],
        values: {},
        onSubmit: null,
        onChange: null,
        submitLabel: '提交',
        resetLabel: '重置',
        label: '表单',
        validateOn: null,
        errors: {}
      });
      if (!Array.isArray(state.fields)) state.fields = [];
      if (!state.values || typeof state.values !== 'object' || Array.isArray(state.values)) state.values = {};
      // 内部持有值的副本：用户输入不能反向修改宿主传入的 options.values 对象。
      var valuesState = {};
      Object.keys(state.values).forEach(function (key) { valuesState[key] = copy(state.values[key]); });
      state.values = valuesState;

      var formId = uid('nui-form');
      var root = make('form', 'nui-form');
      var summary = make('div', 'nui-form__summary');
      var fieldsContainer = make('div', 'nui-form__fields');
      var actions = make('div', 'nui-form__actions');
      var submitButton = make('button', 'nui-form__submit');
      var resetButton = make('button', 'nui-form__reset');
      var events = listen(root);
      var fieldContainerEvents = listen(fieldsContainer);
      var destroyed = false;
      var descriptorList = [];
      var fieldMap = {};
      var ownedInstances = [];

      root.id = formId;
      root.noValidate = true;
      root.setAttribute('role', 'form');
      root.setAttribute('aria-label', text(state.label) || '表单');
      summary.setAttribute('role', 'alert');
      summary.hidden = true;
      submitButton.type = 'submit';
      resetButton.type = 'button';
      root.appendChild(summary);
      root.appendChild(fieldsContainer);
      root.appendChild(actions);
      actions.appendChild(submitButton);
      actions.appendChild(resetButton);

      function timing() {
        var raw = state.validateOn;
        var list;
        if (Array.isArray(raw)) list = raw.slice();
        else if (raw == null || raw === '') list = ['submit', 'blur'];
        else list = [raw];
        var allowed = list.filter(function (item) {
          return item === 'submit' || item === 'blur' || item === 'input';
        });
        if (!allowed.length) allowed = ['submit', 'blur'];
        return allowed;
      }

      function wantsWhen(when) {
        return timing().indexOf(when) >= 0;
      }

      function currentValues() {
        var output = {};
        descriptorList.forEach(function (field) {
          output[field.name] = copy(state.values[field.name]);
        });
        return output;
      }

      function fieldHint(field) {
        return hintWithReason(field);
      }

      function controlOf(field) {
        return fieldMap[field.name] ? fieldMap[field.name] : null;
      }

      function focusOf(field) {
        var record = controlOf(field);
        if (!record) return false;
        if (record.control && typeof record.control.focus === 'function') {
          record.control.focus();
          return true;
        }
        if (record.focusTarget && typeof record.focusTarget.focus === 'function' && record.focusTarget.isConnected) {
          record.focusTarget.focus();
          return true;
        }
        var wrapper = record.wrapper;
        if (wrapper) {
          var target = wrapper.querySelector('input:not([type="hidden"]), select, textarea, button, [tabindex]:not([tabindex="-1"])');
          if (target && typeof target.focus === 'function') {
            target.focus();
            return true;
          }
        }
        return false;
      }

      function errorTextOf(value) {
        if (value == null) return '';
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        if (value.message != null) return text(value.message);
        return '';
      }

      function fieldError(field, value) {
        var values = currentValues();
        var type = formControlType(field);
        var requiredEmpty = type === 'checkbox' || type === 'switch' ? value !== true : isEmptyValue(value);
        if (field.required && requiredEmpty) {
          return text(field.requiredMessage) || (text(field.label) || field.name) + '为必填项。';
        }
        var controlError = '';
        var record = controlOf(field);
        if (record && record.control && typeof record.control.getError === 'function') {
          try { controlError = text(record.control.getError()); } catch (error) { controlError = ''; }
        }
        if (controlError) return controlError;
        if (typeof field.validate === 'function') {
          try {
            var result = field.validate(value, values);
            if (typeof result === 'string' && result !== '') return result;
          } catch (error) {
            return '校验无法完成：' + (error && error.message ? error.message : String(error));
          }
        }
        return '';
      }

      function setRecordError(field, message) {
        var record = controlOf(field);
        var value = message == null ? '' : String(message);
        state.errors[field.name] = value;
        if (!record) return;
        if (record.fieldInstance && typeof record.fieldInstance.setError === 'function') {
          record.fieldInstance.setError(value);
        } else if (record.control && typeof record.control.setError === 'function') {
          record.control.setError(value);
        }
        if (record.errorEl) {
          record.errorEl.textContent = value;
          setHidden(record.errorEl, value === '');
        }
        if (record.wrapper) {
          if (value) record.wrapper.setAttribute('data-invalid', 'true');
          else record.wrapper.removeAttribute('data-invalid');
        }
      }

      function summaryItems() {
        return descriptorList.map(function (field) {
          return { field: field, message: text(state.errors[field.name]) };
        }).filter(function (item) { return item.message !== ''; });
      }

      function renderSummary() {
        var items = summaryItems();
        summary.replaceChildren();
        if (!items.length) {
          summary.hidden = true;
          return;
        }
        summary.hidden = false;
        var title = make('p', 'nui-form__summary-title', '有 ' + items.length + ' 个字段需要修正：');
        var list = make('ul', 'nui-form__summary-list');
        items.forEach(function (item) {
          var li = make('li', 'nui-form__summary-item');
          var button = make('button', 'nui-form__summary-link');
          button.type = 'button';
          button.textContent = (text(item.field.label) || item.field.name) + '：' + item.message;
          button.addEventListener('click', function () { focusOf(item.field); });
          li.appendChild(button);
          list.appendChild(li);
        });
        summary.appendChild(title);
        summary.appendChild(list);
      }

      function validateField(field) {
        var message = fieldError(field, state.values[field.name]);
        setRecordError(field, message);
        renderSummary();
        return message === '';
      }

      function validateAll(focusFirst) {
        var firstInvalid = null;
        descriptorList.forEach(function (field) {
          var value = state.values[field.name];
          var message = fieldError(field, value);
          setRecordError(field, message);
          if (message && !firstInvalid) firstInvalid = field;
        });
        renderSummary();
        if (firstInvalid && focusFirst) focusOf(firstInvalid);
        return !firstInvalid;
      }

      function syncCustom(field) {
        var record = controlOf(field);
        if (!record || !record.isCustom) return state.values[field.name];
        var value = readCustomValue(record);
        if (value !== undefined) state.values[field.name] = value;
        return state.values[field.name];
      }

      function readCustomValue(record) {
        if (!record) return undefined;
        var control = record.control;
        if (control && typeof control.getValue === 'function') {
          try { return control.getValue(); } catch (error) { return undefined; }
        }
        var node = record.customNode || (control && control.el) || record.wrapper;
        if (!node) return undefined;
        var target = node;
        if (node.nodeType !== 1) return undefined;
        if (node.matches && node.matches('input, select, textarea')) target = node;
        else target = node.querySelector ? node.querySelector('input:not([type="hidden"]), select, textarea') : null;
        if (!target) return undefined;
        if (target.type === 'checkbox' || target.type === 'radio') return target.checked;
        if (target.type === 'number') return target.value === '' ? null : Number(target.value);
        if (target.tagName === 'SELECT' && target.multiple) {
          return Array.prototype.slice.call(target.selectedOptions || []).map(function (option) { return option.value; });
        }
        return target.value;
      }

      function assignCustomValue(record, value) {
        if (!record) return;
        var control = record.control;
        if (control && typeof control.update === 'function') {
          try { control.update({ value: value, checked: value }); } catch (error) { /* host custom controls may not accept value */ }
          return;
        }
        var node = record.customNode || (control && control.el);
        if (!node || node.nodeType !== 1) return;
        var target = node.matches && node.matches('input, select, textarea') ? node : (node.querySelector ? node.querySelector('input:not([type="hidden"]), select, textarea') : null);
        if (!target) return;
        if (target.type === 'checkbox' || target.type === 'radio') target.checked = Boolean(value);
        else if (target.tagName === 'SELECT' && target.multiple && Array.isArray(value)) {
          Array.prototype.forEach.call(target.options, function (option) {
            option.selected = value.indexOf(option.value) >= 0;
          });
        } else if (value != null) target.value = String(value);
        else target.value = '';
      }

      function emitFormChange(changedName) {
        call(state.onChange, currentValues(), changedName);
      }

      function handleUserChange(field, value, event) {
        if (destroyed) return;
        state.values[field.name] = value;
        if (wantsWhen('input')) validateField(field);
        else {
          setRecordError(field, '');
          renderSummary();
        }
        emitFormChange(field.name);
      }

      function detachCustomListeners() {
        Object.keys(fieldMap).forEach(function (name) {
          var record = fieldMap[name];
          if (record && record.customNode && record.customInputHandler) {
            record.customNode.removeEventListener('input', record.customInputHandler);
            record.customInputHandler = null;
          }
        });
      }

      function releaseCustomDisabled() {
        Object.keys(fieldMap).forEach(function (name) {
          var record = fieldMap[name];
          if (!record || !record.customDisabledNodes) return;
          record.customDisabledNodes.forEach(function (node) {
            if (node && node.nodeType === 1) node.disabled = false;
          });
          record.customDisabledNodes = [];
        });
      }

      function attachRows() {
        detachCustomListeners();
        releaseCustomDisabled();
        // Destroy anything owned by the previous build.
        ownedInstances.forEach(function (instance) {
          try { if (instance && typeof instance.destroy === 'function') instance.destroy(); } catch (error) { /* continue */ }
        });
        ownedInstances = [];
        fieldsContainer.replaceChildren();
        descriptorList = [];
        fieldMap = {};
        state.errors = {};

        (Array.isArray(state.fields) ? state.fields : []).forEach(function (field, index) {
          if (!field || typeof field !== 'object') return;
          var name = text(field.name) || ('field' + String(index + 1));
          var descriptor = Object.assign({}, field, { name: name });
          descriptor.label = field.label == null ? name : text(field.label);
          descriptor.hint = text(field.hint);
          descriptor.required = Boolean(field.required);
          descriptorList.push(descriptor);
          var wrapper = make('div', 'nui-form__field');
          wrapper.dataset.name = name;
          fieldsContainer.appendChild(wrapper);
          var record = buildField(descriptor, wrapper);
          if (!record) return;
          record.wrapper = wrapper;
          fieldMap[name] = record;
          var needsInitial = !own(state.values, name) || state.values[name] === undefined;
          if (needsInitial) {
            if (record.type === 'custom' && descriptor.defaultValue === undefined) {
              var initialCustom = readCustomValue(record);
              state.values[name] = initialCustom === undefined ? undefined : initialCustom;
            } else {
              state.values[name] = defaultFormValue(descriptor);
            }
          }
          if (state.values[name] !== undefined || record.type !== 'custom') {
            setControlValue(record, state.values[name]);
          }
        });

        renderSummary();
      }

      function registerOwned(instance) {
        if (instance && typeof instance.destroy === 'function') ownedInstances.push(instance);
        return instance;
      }

      function buildField(field, wrapper) {
        var type = formControlType(field);
        var value = state.values[field.name];
        var record = {
          field: field,
          type: type,
          control: null,
          fieldInstance: null,
          wrapper: wrapper,
          isCustom: false,
          customNode: null,
          customDisabledNodes: [],
          errorEl: null,
          focusTarget: null
        };

        if (type === 'switch' || type === 'slider') {
          if (type === 'switch' && !(NoteUI.Switch && typeof NoteUI.Switch.mount === 'function')) {
            return buildFieldFallbackText(field, wrapper, record);
          }
          if (type === 'slider' && !(NoteUI.Slider && typeof NoteUI.Slider.mount === 'function')) {
            return buildFieldFallbackText(field, wrapper, record);
          }
          var optionsObject = field.options && typeof field.options === 'object' && !Array.isArray(field.options) ? field.options : {};
          var advancedOptions = Object.assign({}, optionsObject, {
            label: field.label,
            hint: text(field.hint),
            disabledReason: field.disabledReason,
            required: field.required,
            disabled: Boolean(field.disabled || optionsObject.disabled),
            error: '',
            onChange: function (next, event) { handleUserChange(field, next, event); }
          });
          var advanced = type === 'switch'
            ? NoteUI.Switch.mount(wrapper, advancedOptions)
            : NoteUI.Slider.mount(wrapper, advancedOptions);
          registerOwned(advanced);
          record.control = advanced;
          record.focusTarget = advanced.button || (advanced.el && advanced.el.querySelector('input, button'));
          return record;
        }

        if (type === 'custom') {
          var custom = isCustomNode(field);
          if (!custom) return buildFieldFallbackText(field, wrapper, record);
          record.isCustom = true;
          record.control = custom;
          record.customNode = isNode(custom) ? custom : (custom.el || null);
          var customControl = isNode(custom) ? custom : custom.el;
          var customField = NoteUI.Field && typeof NoteUI.Field.mount === 'function'
            ? NoteUI.Field.mount(wrapper, {
              label: field.label,
              hint: fieldHint(field),
              required: field.required,
              control: customControl
            })
            : null;
          if (customField) {
            registerOwned(customField);
            record.fieldInstance = customField;
          } else {
            wrapper.appendChild(customControl);
          }
          if (field.disabled) {
            if (custom && typeof custom.update === 'function') {
              try { custom.update({ disabled: true }); } catch (error) { /* fall through to native disabling */ }
            }
            if (customControl && customControl.nodeType === 1) {
              var customFocusables = customControl.matches && customControl.matches('input, select, textarea, button')
                ? [customControl]
                : Array.prototype.slice.call(customControl.querySelectorAll ? customControl.querySelectorAll('input, select, textarea, button') : []);
              customFocusables.forEach(function (node) {
                if (!node.disabled) {
                  node.disabled = true;
                  record.customDisabledNodes.push(node);
                }
              });
            }
          }
          if (record.customNode) {
            var customInputHandler = function (event) {
              var next = readCustomValue(record);
              if (next !== undefined && !destroyed) handleUserChange(field, next, event);
            };
            record.customInputHandler = customInputHandler;
            record.customNode.addEventListener('input', customInputHandler);
          }
          return record;
        }

        var options = field.options;
        var controlOptions = options && typeof options === 'object' && !Array.isArray(options) ? Object.assign({}, options) : {};
        var mountHost = make('div', 'nui-form__mount');
        var instance = null;
        var disabled = Boolean(field.disabled || controlOptions.disabled);
        var onChange = function (next, event) { handleUserChange(field, next, event); };

        if (type === 'text') {
          if (!(NoteUI.TextInput && typeof NoteUI.TextInput.mount === 'function')) return buildFieldFallbackText(field, wrapper, record);
          controlOptions.value = text(value);
          controlOptions.disabled = disabled;
          controlOptions.onChange = onChange;
          instance = NoteUI.TextInput.mount(mountHost, controlOptions);
        } else if (type === 'textarea') {
          if (!(NoteUI.Textarea && typeof NoteUI.Textarea.mount === 'function')) return buildFieldFallbackText(field, wrapper, record);
          controlOptions.value = text(value);
          controlOptions.disabled = disabled;
          controlOptions.onChange = onChange;
          instance = NoteUI.Textarea.mount(mountHost, controlOptions);
        } else if (type === 'number') {
          if (!(NoteUI.NumberInput && typeof NoteUI.NumberInput.mount === 'function')) return buildFieldFallbackText(field, wrapper, record);
          controlOptions.value = value == null ? null : value;
          controlOptions.disabled = disabled;
          controlOptions.onChange = onChange;
          instance = NoteUI.NumberInput.mount(mountHost, controlOptions);
        } else if (type === 'checkbox') {
          if (!(NoteUI.Checkbox && typeof NoteUI.Checkbox.mount === 'function')) return buildFieldFallbackText(field, wrapper, record);
          controlOptions.label = '';
          controlOptions.checked = Boolean(value);
          controlOptions.disabled = disabled;
          controlOptions.onChange = onChange;
          instance = NoteUI.Checkbox.mount(mountHost, controlOptions);
        } else if (type === 'select') {
          if (!(NoteUI.Select && typeof NoteUI.Select.mount === 'function')) return buildFieldFallbackText(field, wrapper, record);
          var selectOptions = Array.isArray(field.options) ? field.options : controlOptions.options;
          if (Array.isArray(selectOptions)) {
            controlOptions.options = selectOptions;
            delete controlOptions.value;
          }
          controlOptions.value = value;
          controlOptions.disabled = disabled;
          controlOptions.onChange = onChange;
          instance = NoteUI.Select.mount(mountHost, controlOptions);
        } else {
          return buildFieldFallbackText(field, wrapper, record);
        }

        if (!instance) return buildFieldFallbackText(field, wrapper, record);
        registerOwned(instance);
        record.control = instance;
        var fieldInstance = NoteUI.Field && typeof NoteUI.Field.mount === 'function'
          ? NoteUI.Field.mount(wrapper, {
            label: field.label,
            hint: fieldHint(field),
            required: field.required,
            control: instance
          })
          : null;
        if (fieldInstance) {
          registerOwned(fieldInstance);
          record.fieldInstance = fieldInstance;
          record.focusTarget = fieldInstance.control;
        } else {
          wrapper.appendChild(instance.el);
          record.focusTarget = instance.el.querySelector ? instance.el.querySelector('input, select, textarea, button') : null;
        }
        return record;
      }

      function buildFieldFallbackText(field, wrapper, record) {
        var nativeInput = make('input', 'nui-form__native');
        nativeInput.type = 'text';
        nativeInput.disabled = Boolean(field.disabled);
        nativeInput.addEventListener('input', function (event) {
          handleUserChange(field, nativeInput.value, event);
        });
        var fieldInstance = NoteUI.Field && typeof NoteUI.Field.mount === 'function'
          ? NoteUI.Field.mount(wrapper, {
            label: field.label,
            hint: fieldHint(field),
            required: field.required,
            control: nativeInput
          })
          : null;
        if (fieldInstance) {
          registerOwned(fieldInstance);
          record.fieldInstance = fieldInstance;
          record.focusTarget = nativeInput;
        } else {
          wrapper.appendChild(nativeInput);
          record.focusTarget = nativeInput;
        }
        record.control = nativeInput;
        return record;
      }

      function setControlValue(record, value) {
        if (!record || !record.control) return;
        var control = record.control;
        if (record.type === 'checkbox') {
          if (typeof control.update === 'function') control.update({ checked: Boolean(value) });
        } else if (record.type === 'number') {
          if (typeof control.update === 'function') control.update({ value: value == null ? null : value });
        } else if (record.type === 'switch') {
          if (typeof control.update === 'function') control.update({ checked: Boolean(value) });
        } else if (record.type === 'slider') {
          if (typeof control.update === 'function') control.update({ value: value });
        } else if (record.type === 'custom') {
          assignCustomValue(record, value);
        } else if (typeof control.update === 'function') {
          control.update({ value: value == null ? '' : value });
        } else if (isNode(control)) {
          if (control.type === 'checkbox') control.checked = Boolean(value);
          else control.value = value == null ? '' : String(value);
        }
      }

      function handleFocusOut(event) {
        if (destroyed) return;
        var wrapper = event.target && event.target.closest ? event.target.closest('.nui-form__field') : null;
        if (!wrapper || !fieldsContainer.contains(wrapper)) return;
        if (event.relatedTarget && wrapper.contains(event.relatedTarget)) return;
        var record = fieldMap[wrapper.dataset.name];
        if (!record) return;
        syncCustom(record.field);
        if (wantsWhen('blur')) validateField(record.field);
      }

      function renderLabels() {
        root.setAttribute('aria-label', text(state.label) || '表单');
        submitButton.textContent = text(state.submitLabel) || '提交';
        resetButton.textContent = text(state.resetLabel) || '重置';
        submitButton.hidden = state.submitLabel === false;
        resetButton.hidden = state.resetLabel === false || state.resetLabel === null || state.resetLabel === '';
        actions.hidden = submitButton.hidden && resetButton.hidden;
      }

      function performSubmit(event) {
        syncCustomAll();
        var ok = validateAll(true);
        if (!ok) return false;
        var values = currentValues();
        if (state.onSubmit) call(state.onSubmit, values, event || null);
        return true;
      }

      function handleSubmit(event) {
        if (event) event.preventDefault();
        if (destroyed) return;
        performSubmit(event || null);
      }

      function handleResetClick(event) {
        if (event) event.preventDefault();
        reset();
      }

      function reset() {
        descriptorList.forEach(function (field) {
          var value = defaultFormValue(field);
          state.values[field.name] = value;
          var record = controlOf(field);
          setControlValue(record, value);
          setRecordError(field, '');
        });
        renderSummary();
      }

      function setErrors(errors) {
        state.errors = {};
        descriptorList.forEach(function (field) { setRecordError(field, ''); });
        if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
          descriptorList.forEach(function (field) {
            if (own(errors, field.name)) setRecordError(field, errorTextOf(errors[field.name]));
          });
        }
        renderSummary();
      }

      events.on('submit', handleSubmit);
      events.on('click', function (event) {
        if (event.target === resetButton || (resetButton.contains && resetButton.contains(event.target))) handleResetClick(event);
      });
      fieldContainerEvents.on('focusout', handleFocusOut);

      renderLabels();
      attachRows();
      host.appendChild(root);

      var instance = component(root, state, function (patch) {
        if (own(patch, 'validateOn')) state.validateOn = patch.validateOn;
        if (own(patch, 'label')) state.label = patch.label;
        if (own(patch, 'submitLabel')) state.submitLabel = patch.submitLabel;
        if (own(patch, 'resetLabel')) state.resetLabel = patch.resetLabel;
        if (own(patch, 'onSubmit')) state.onSubmit = patch.onSubmit;
        if (own(patch, 'onChange')) state.onChange = patch.onChange;
        var valuePatch = null;
        if (own(patch, 'values')) {
          valuePatch = patch.values && typeof patch.values === 'object' && !Array.isArray(patch.values) ? patch.values : {};
          Object.keys(valuePatch).forEach(function (key) {
            valuesState[key] = copy(valuePatch[key]);
          });
          state.values = valuesState;
        }
        if (own(patch, 'fields')) {
          attachRows();
        } else if (valuePatch) {
          descriptorList.forEach(function (field) {
            if (own(valuePatch, field.name)) {
              state.values[field.name] = copy(valuePatch[field.name]);
              setControlValue(controlOf(field), state.values[field.name]);
            }
          });
        }
        if (own(patch, 'errors')) setErrors(patch.errors);
        renderLabels();
      }, function () {
        events.clear();
        fieldContainerEvents.clear();
        detachCustomListeners();
        releaseCustomDisabled();
        ownedInstances.forEach(function (owned) {
          try { if (owned && typeof owned.destroy === 'function') owned.destroy(); } catch (error) { /* continue */ }
        });
        ownedInstances = [];
      });

      instance.getValue = function () {
        syncCustomAll();
        return currentValues();
      };
      instance.setErrors = function (errors) { setErrors(errors); };
      instance.reset = function () { reset(); };
      instance.submit = function (event) {
        syncCustomAll();
        return performSubmit(event || null);
      };
      instance.focusField = function (name) {
        var field = descriptorList.filter(function (item) { return item.name === name; })[0];
        return field ? focusOf(field) : false;
      };

      function syncCustomAll() {
        descriptorList.forEach(function (field) {
          if (formControlType(field) === 'custom') syncCustom(field);
        });
      }

      return instance;
    }
  };

})(window);
