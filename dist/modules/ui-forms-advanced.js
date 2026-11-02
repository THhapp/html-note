/*! note-library module: ui-forms-advanced
 * dependencies: core, ui-forms-basic
 * type: JavaScript
 * generated-by: scripts/build.mjs; do-not-edit.
 */

/* ---- source: src/ui/forms-advanced-internal.js ---- */
/* NoteUI forms-advanced internal — F09–F15 的私有共享实现（非公开 API）。
   F09–F15 组件文件共用的 DOM、选项、提示/错误、浮层与监听工具集中在本文件，
   避免各组件重复实现。必须先加载 src/core（core.js、floating.js）；
   本文件不承诺任何 NoteUI 公开名称，只通过 NoteUI._formsAdvancedInternal
   在模块内部文件之间共享。
   加载顺序：core → forms-advanced-internal.js → forms-advanced.js →
   forms-advanced-pickers.js → forms-advanced-inputs.js。 */
(function (global) {
  'use strict';

  var NoteCore = global.NoteCore;
  if (!NoteCore) throw new Error('NoteUI forms-advanced 需要 NoteCore（core 模块）。');
  var NoteUI = global.NoteUI = global.NoteUI || {};
  var hasOwn = Object.prototype.hasOwnProperty;

  function own(object, key) {
    return object != null && hasOwn.call(Object(object), key);
  }

  function text(value) {
    return NoteCore.text(value);
  }

  function tokens(value) {
    return text(value).split(/\s+/).filter(Boolean);
  }

  function hintJoin(parts) {
    var cleaned = [];
    (parts || []).forEach(function (part) {
      var value = text(part).trim().replace(/^[；;。.\s]+/, '').replace(/[；;。.\s]+$/, '');
      if (value) cleaned.push(value);
    });
    if (!cleaned.length) return '';
    var joined = cleaned.join('；');
    return /[！？!?]$/.test(cleaned[cleaned.length - 1]) ? joined : joined + '。';
  }

  /* hint + “不可用：原因” + 组件自身的固定格式说明，统一成一句可见提示。 */
  function hintWithReason(state, parts) {
    var values = [];
    if (text(state.hint)) values.push(text(state.hint));
    if (state.disabled && text(state.disabledReason)) values.push('不可用：' + text(state.disabledReason));
    (parts || []).forEach(function (part) {
      if (text(part)) values.push(text(part));
    });
    return hintJoin(values);
  }

  function make(tag, className, content) {
    return NoteCore.el(tag, className, content);
  }

  function uid(prefix) {
    return NoteCore.uid(prefix);
  }

  function validateHost(host) {
    NoteCore.validateHost(host);
  }

  function listen(target) {
    return NoteCore.listeners(target);
  }

  function component(root, state, render, cleanup) {
    return NoteCore.component(root, state, render, cleanup);
  }

  function copy(value) {
    if (Array.isArray(value)) return value.slice();
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
      var output = {};
      Object.keys(value).forEach(function (key) { output[key] = copy(value[key]); });
      return output;
    }
    return value;
  }

  function setHidden(node, hidden) {
    if (!node) return;
    node.hidden = Boolean(hidden);
  }

  function addDescribedBy(node, id) {
    if (!node || !id) return;
    var list = tokens(node.getAttribute('aria-describedby'));
    if (list.indexOf(id) < 0) list.push(id);
    node.setAttribute('aria-describedby', list.join(' '));
  }

  function removeDescribedBy(node, id) {
    if (!node || !id) return;
    var list = tokens(node.getAttribute('aria-describedby')).filter(function (token) {
      return token !== id;
    });
    if (list.length) node.setAttribute('aria-describedby', list.join(' '));
    else node.removeAttribute('aria-describedby');
  }

  function call(fn, value, event) {
    if (typeof fn === 'function') return fn(value, event);
    return undefined;
  }

  function isNode(value) {
    return Boolean(value) && (value.nodeType === 1 || value.nodeType === 3 || value.nodeType === 11);
  }

  function icon(name, size) {
    if (typeof NoteCore.icon !== 'function') return null;
    try {
      var node = NoteCore.icon(name, { size: size || 16, label: null });
      return node || null;
    } catch (error) {
      /* icon names are optional decoration */
      return null;
    }
  }

  function labelRow(prefix, label, required, labelId) {
    var head = make('div', prefix + '__head');
    var labelEl = make('span', prefix + '__label');
    labelEl.id = labelId;
    labelEl.textContent = text(label);
    if (required) {
      var mark = make('span', prefix + '__required', '必填');
      labelEl.appendChild(document.createTextNode(' '));
      labelEl.appendChild(mark);
    }
    head.appendChild(labelEl);
    if (!text(label) && !required) head.hidden = true;
    return head;
  }

  function syncHeadLabel(head, selector, label) {
    if (!head) return;
    var node = head.querySelector(selector);
    if (node) node.textContent = text(label);
    head.hidden = !text(label);
  }

  function messageLine(prefix, suffix, id) {
    var node = make('p', prefix + '__' + suffix);
    if (id) node.id = id;
    node.hidden = true;
    if (suffix === 'error') node.setAttribute('role', 'alert');
    return node;
  }

  /* 选项合并：默认值 + 调用方传入的键；未知键保留在 state 中（与 NoteCore.component
     的程序 update 合并语义一致）。 */
  function readOptions(input, defaults) {
    var state = {};
    Object.keys(defaults).forEach(function (key) { state[key] = defaults[key]; });
    if (input && typeof input === 'object') {
      Object.keys(input).forEach(function (key) { state[key] = input[key]; });
    }
    return state;
  }

  function updateMessage(node, message) {
    if (!node) return false;
    var value = text(message);
    node.textContent = value;
    node.hidden = value === '';
    return value !== '';
  }

  /* 统一同步 hint/错误/反馈文本与 aria-describedby / aria-invalid。
     config: { hintEl, hint, errorEl, error, feedbackEl, feedback, nodes,
               hintId, errorId, feedbackId, hintAlways } */
  function syncMessages(config) {
    var hint = text(config.hint);
    var error = text(config.error);
    var feedback = text(config.feedback);
    updateMessage(config.hintEl, hint);
    updateMessage(config.errorEl, error);
    if (config.feedbackEl) updateMessage(config.feedbackEl, feedback);
    (config.nodes || []).forEach(function (node) {
      if (!node) return;
      if (config.hintId) removeDescribedBy(node, config.hintId);
      if (config.errorId) removeDescribedBy(node, config.errorId);
      if (config.feedbackId) removeDescribedBy(node, config.feedbackId);
      if (config.hintId && (hint || config.hintAlways)) addDescribedBy(node, config.hintId);
      if (config.errorId && error) addDescribedBy(node, config.errorId);
      if (config.feedbackId && feedback) addDescribedBy(node, config.feedbackId);
      if (error) node.setAttribute('aria-invalid', 'true');
      else node.removeAttribute('aria-invalid');
    });
  }

  function externalErrorText(state) {
    return text(state.externalError) || text(state.internalError);
  }

  /* 日期/时间面板共用的 NoteCore.floating 配置：dialog 语义、Tab 焦点约束、
     外点/Esc 关闭、关闭返回触发点、视口限宽。 */
  function createDialogLayer(settings) {
    if (!(NoteCore.floating && typeof NoteCore.floating.create === 'function')) {
      throw new Error((settings.name || 'NoteUI forms-advanced') + ' 需要 NoteCore.floating（core 模块）。');
    }
    var config = settings || {};
    return NoteCore.floating.create({
      anchor: config.anchor,
      content: null,
      placement: 'bottom-start',
      offset: 6,
      role: 'dialog',
      className: config.className,
      modal: false,
      backdrop: false,
      trapFocus: true,
      returnFocus: true,
      closeOnEsc: true,
      closeOnOutside: true,
      lockScroll: false,
      maxWidth: 'calc(100vw - 16px)',
      onOpen: config.onOpen || null,
      onClose: config.onClose || null
    });
  }

  /* 面板打开时，点击触发按钮不应先被 floating 的“外点关闭”处理掉，
     再被组件的 click 重新打开；在 document 捕获阶段拦住这一次 pointerdown。 */
  function guardTriggerPointer(trigger, docEvents, isOpen) {
    docEvents.on('pointerdown', function (event) {
      if (typeof isOpen === 'function' && !isOpen()) return;
      if (event.target === trigger || (trigger.contains && trigger.contains(event.target))) {
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        else event.stopPropagation();
      }
    }, true);
  }

  NoteUI._formsAdvancedInternal = {
    own: own,
    text: text,
    hintJoin: hintJoin,
    hintWithReason: hintWithReason,
    make: make,
    uid: uid,
    validateHost: validateHost,
    listen: listen,
    component: component,
    copy: copy,
    setHidden: setHidden,
    addDescribedBy: addDescribedBy,
    removeDescribedBy: removeDescribedBy,
    call: call,
    isNode: isNode,
    icon: icon,
    labelRow: labelRow,
    syncHeadLabel: syncHeadLabel,
    messageLine: messageLine,
    readOptions: readOptions,
    updateMessage: updateMessage,
    syncMessages: syncMessages,
    externalErrorText: externalErrorText,
    createDialogLayer: createDialogLayer,
    guardTriggerPointer: guardTriggerPointer
  };
})(window);

/* ---- source: src/ui/forms-advanced.js ---- */
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
        onChange: null,
        ticks: null,
        segments: null
      });
      state.range = Boolean(state.range);
      state.showValue = state.showValue !== false;
      state.disabled = Boolean(state.disabled);
      state.required = Boolean(state.required);
      validateSliderOptions({}); /* 坏 segments/ticks 在创建 DOM 前失败 */

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
      var mapping = null;
      var tickList = [];
      var ticksEl = make('div', 'nui-slider__ticks');
      ticksEl.setAttribute('aria-hidden', 'true');
      ticksEl.hidden = true;

      head = labelRow('nui-slider', state.label, state.required, labelId);
      readout.id = valueId;
      if (state.showValue) head.appendChild(readout);
      head.hidden = !text(state.label) && !state.required && !state.showValue;
      track.setAttribute('aria-hidden', 'true');
      track.appendChild(fill);
      root.appendChild(head);
      root.appendChild(track);
      root.appendChild(ticksEl);
      root.appendChild(inputWrap);
      root.appendChild(hintEl);
      root.appendChild(errorEl);

      function readGeometry(source) {
        source = source || state;
        var min = Number(source.min);
        var max = Number(source.max);
        if (!isFinite(min)) min = 0;
        if (!isFinite(max)) max = min + 100;
        if (max < min) {
          var swap = min;
          min = max;
          max = swap;
        }
        if (max === min) max = min + 1;
        var step = Number(source.step);
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

      /* ---------- 刻度与分段映射（F10 可选增强） ---------- */

      function sliderOptionError(message) {
        return new TypeError('NoteUI.Slider: ' + message);
      }

      function segmentNumber(segment, name, index) {
        var value = Number(segment[name]);
        if (!isFinite(value)) {
          throw sliderOptionError('segments[' + index + '].' + name + ' 必须是有限数字。');
        }
        return value;
      }

      /* 分段描述：每个分段给出 valueStart/valueEnd/positionStart/positionEnd，
         position 使用 0–100 的百分比；分段必须按顺序覆盖 min..max 和 0–100，
         且 value/position 各自单调不减。线性模式不传 segments。 */
      function readSegments(raw, geo) {
        if (raw == null) return null;
        if (!Array.isArray(raw) || raw.length === 0) {
          throw sliderOptionError('segments 必须是非空数组。');
        }
        var segments = raw.map(function (entry, index) {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw sliderOptionError('segments[' + index + '] 必须是对象。');
          }
          var valueStart = segmentNumber(entry, 'valueStart', index);
          var valueEnd = segmentNumber(entry, 'valueEnd', index);
          var positionStart = segmentNumber(entry, 'positionStart', index);
          var positionEnd = segmentNumber(entry, 'positionEnd', index);
          if (positionStart < 0 || positionEnd > 100) {
            throw sliderOptionError('segments[' + index + '] 的 positionStart/positionEnd 必须在 0–100 内。');
          }
          if (!(positionEnd > positionStart)) {
            throw sliderOptionError('segments[' + index + '].positionEnd 必须大于 positionStart（位置段不能为零宽）。');
          }
          if (valueEnd < valueStart) {
            throw sliderOptionError('segments[' + index + '].valueEnd 必须不小于 valueStart。');
          }
          return {
            valueStart: valueStart,
            valueEnd: valueEnd,
            positionStart: positionStart,
            positionEnd: positionEnd
          };
        });
        var epsilon = 1e-9;
        function near(a, b) { return Math.abs(a - b) <= epsilon; }
        if (!near(segments[0].valueStart, geo.min)) {
          throw sliderOptionError('segments[0].valueStart 必须等于 min（' + geo.min + '）。');
        }
        if (!near(segments[segments.length - 1].valueEnd, geo.max)) {
          throw sliderOptionError('最后一段的 valueEnd 必须等于 max（' + geo.max + '）。');
        }
        if (!near(segments[0].positionStart, 0)) {
          throw sliderOptionError('segments[0].positionStart 必须等于 0。');
        }
        if (!near(segments[segments.length - 1].positionEnd, 100)) {
          throw sliderOptionError('最后一段的 positionEnd 必须等于 100。');
        }
        for (var i = 1; i < segments.length; i += 1) {
          if (!near(segments[i].valueStart, segments[i - 1].valueEnd)) {
            throw sliderOptionError('segments[' + i + '].valueStart 必须等于上一段的 valueEnd（分段在值域上必须连续）。');
          }
          if (!near(segments[i].positionStart, segments[i - 1].positionEnd)) {
            throw sliderOptionError('segments[' + i + '].positionStart 必须等于上一段的 positionEnd（位置必须连续）。');
          }
        }
        return segments;
      }

      function snapTo(geo, value) {
        var clamped = Number(value);
        if (!isFinite(clamped)) clamped = geo.min;
        clamped = Math.min(geo.max, Math.max(geo.min, clamped));
        var steps = Math.round((clamped - geo.min) / geo.step);
        var snapped = geo.min + steps * geo.step;
        snapped = Math.min(geo.max, Math.max(geo.min, snapped));
        return Number(snapped.toFixed(10));
      }

      function buildMapping(geo, rawSegments) {
        var segments = readSegments(rawSegments, geo);
        var span = geo.max - geo.min;

        function positionOfValue(value) {
          var number = Number(value);
          if (!isFinite(number)) number = geo.min;
          if (number <= geo.min) return 0;
          if (number >= geo.max) return 100;
          if (!segments) return span > 0 ? ((number - geo.min) / span) * 100 : 0;
          for (var i = 0; i < segments.length; i += 1) {
            var segment = segments[i];
            if (number <= segment.valueEnd || i === segments.length - 1) {
              var valueSpan = segment.valueEnd - segment.valueStart;
              if (valueSpan <= 0) return segment.positionStart;
              var t = (number - segment.valueStart) / valueSpan;
              t = Math.min(1, Math.max(0, t));
              return segment.positionStart + t * (segment.positionEnd - segment.positionStart);
            }
          }
          return 100;
        }

        function rawValueAtPosition(position) {
          var pos = Number(position);
          if (!isFinite(pos)) pos = 0;
          pos = Math.min(100, Math.max(0, pos));
          if (!segments) return geo.min + (pos / 100) * span;
          for (var i = 0; i < segments.length; i += 1) {
            var segment = segments[i];
            if (pos <= segment.positionEnd || i === segments.length - 1) {
              var positionSpan = segment.positionEnd - segment.positionStart;
              var t = (pos - segment.positionStart) / positionSpan;
              t = Math.min(1, Math.max(0, t));
              return segment.valueStart + t * (segment.valueEnd - segment.valueStart);
            }
          }
          return geo.max;
        }

        function valueOfPosition(position) {
          return snapTo(geo, rawValueAtPosition(position));
        }

        return {
          segmented: Boolean(segments),
          segments: segments,
          positionOfValue: positionOfValue,
          valueOfPosition: valueOfPosition,
          /* 原生 input 的位置域是 0–1000 的整数，避免浮点 value 字符串与步进差异。 */
          inputPositionOfValue: function (value) { return Math.round(positionOfValue(value) * 10); },
          valueOfInputPosition: function (position) { return valueOfPosition(Number(position) / 10); }
        };
      }

      /* ticks：数字或 { value, label }；label 省略时用 format，传空串则只画刻度不写字。 */
      function normalizeTicks(raw, geo) {
        if (raw == null) return [];
        if (!Array.isArray(raw)) throw sliderOptionError('ticks 必须是数组。');
        var epsilon = 1e-9;
        return raw.map(function (entry, index) {
          var value;
          var label = null;
          if (typeof entry === 'number') {
            value = entry;
          } else if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
            value = Number(entry.value);
            if (own(entry, 'label')) label = entry.label == null ? '' : String(entry.label);
          } else {
            throw sliderOptionError('ticks[' + index + '] 必须是数字或 { value, label } 对象。');
          }
          if (!isFinite(value)) throw sliderOptionError('ticks[' + index + '].value 必须是有限数字。');
          if (value < geo.min - epsilon || value > geo.max + epsilon) {
            throw sliderOptionError('ticks[' + index + '].value 超出 [' + geo.min + ', ' + geo.max + ']。');
          }
          value = Math.min(geo.max, Math.max(geo.min, value));
          return { value: value, label: label };
        }).sort(function (a, b) { return a.value - b.value; });
      }

      /* 在写入 state/DOM 之前验证一次，保证 update(坏 segments/ticks) 不先破坏旧组件。 */
      function validateSliderOptions(patch) {
        var geo = readGeometry({
          min: own(patch, 'min') ? patch.min : state.min,
          max: own(patch, 'max') ? patch.max : state.max,
          step: own(patch, 'step') ? patch.step : state.step
        });
        buildMapping(geo, own(patch, 'segments') ? patch.segments : state.segments);
        normalizeTicks(own(patch, 'ticks') ? patch.ticks : state.ticks, geo);
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
          var start = mapping ? mapping.positionOfValue(state.value[0]) : 0;
          var end = mapping ? mapping.positionOfValue(state.value[1]) : 100;
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
        var segmented = Boolean(mapping && mapping.segmented);
        if (state.range) {
          if (lowInput) lowInput.value = String(segmented ? mapping.inputPositionOfValue(state.value[0]) : state.value[0]);
          if (highInput) highInput.value = String(segmented ? mapping.inputPositionOfValue(state.value[1]) : state.value[1]);
        } else if (singleInput) {
          singleInput.value = String(segmented ? mapping.inputPositionOfValue(state.value) : state.value);
        }
      }

      function commitSingle(next, event) {
        var previous = state.value;
        state.value = next;
        state.error = '';
        applyValuesToInputs();
        updateChrome();
        if (previous !== next) call(state.onChange, next, event);
      }

      function commitRange(nextLow, nextHigh, event) {
        var previousLow = state.value[0];
        var previousHigh = state.value[1];
        state.value = [nextLow, nextHigh];
        state.error = '';
        applyValuesToInputs();
        updateChrome();
        if (previousLow !== nextLow || previousHigh !== nextHigh) call(state.onChange, [nextLow, nextHigh], event);
      }

      function handleSingleInput(event) {
        if (destroyed || state.disabled) return;
        var next = mapping && mapping.segmented
          ? mapping.valueOfInputPosition(singleInput.value)
          : snapNumber(singleInput.value);
        commitSingle(next, event);
      }

      function handleRangeInput(event) {
        if (destroyed || state.disabled) return;
        var part = event.target === highInput ? 'high' : 'low';
        var low = mapping && mapping.segmented
          ? mapping.valueOfInputPosition(lowInput.value)
          : snapNumber(lowInput.value);
        var high = mapping && mapping.segmented
          ? mapping.valueOfInputPosition(highInput.value)
          : snapNumber(highInput.value);
        if (part === 'low' && low > high) low = high;
        if (part === 'high' && high < low) high = low;
        commitRange(low, high, event);
      }

      /* 分段映射时原生 input 处在位置域；方向键、PageUp/Down、Home/End
         一律按真实值与 step 计算，再换算回位置写回。线性默认不拦截，
         保留原生 range 的既有键盘行为。 */
      function handleKeydown(event) {
        if (destroyed || state.disabled || !mapping || !mapping.segmented) return;
        if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
        var node = event.target;
        if (node !== singleInput && node !== lowInput && node !== highInput) return;
        var key = event.key;
        var direction = 0;
        var multiplier = 1;
        var absolute = null;
        if (key === 'ArrowRight' || key === 'ArrowUp' || key === 'Right' || key === 'Up') direction = 1;
        else if (key === 'ArrowLeft' || key === 'ArrowDown' || key === 'Left' || key === 'Down') direction = -1;
        else if (key === 'PageUp') { direction = 1; multiplier = 10; }
        else if (key === 'PageDown') { direction = -1; multiplier = 10; }
        else if (key === 'Home') absolute = geometry.min;
        else if (key === 'End') absolute = geometry.max;
        else return;
        event.preventDefault();
        if (state.range) {
          var low = state.value[0];
          var high = state.value[1];
          if (node === lowInput) {
            low = absolute == null
              ? Math.min(high, snapNumber(low + direction * geometry.step * multiplier))
              : Math.min(absolute, high);
          } else {
            high = absolute == null
              ? Math.max(low, snapNumber(high + direction * geometry.step * multiplier))
              : Math.max(absolute, low);
          }
          commitRange(low, high, event);
          return;
        }
        var next = absolute == null
          ? snapNumber(state.value + direction * geometry.step * multiplier)
          : (absolute === geometry.min ? geometry.min : geometry.max);
        commitSingle(next, event);
      }

      function inputDomain() {
        if (mapping && mapping.segmented) {
          return { min: '0', max: '1000', step: '1', position: true };
        }
        return { min: String(geometry.min), max: String(geometry.max), step: String(geometry.step), position: false };
      }

      function inputValueOf(value, segmented) {
        return String(segmented ? mapping.inputPositionOfValue(value) : value);
      }

      function buildInputs() {
        inputWrap.replaceChildren();
        singleInput = null;
        lowInput = null;
        highInput = null;
        var domain = inputDomain();
        var segmented = domain.position;
        if (state.range) {
          lowInput = make('input', 'nui-slider__input');
          lowInput.type = 'range';
          lowInput.min = domain.min;
          lowInput.max = domain.max;
          lowInput.step = domain.step;
          lowInput.value = inputValueOf(state.value[0], segmented);
          lowInput.dataset.part = 'low';

          highInput = make('input', 'nui-slider__input');
          highInput.type = 'range';
          highInput.min = domain.min;
          highInput.max = domain.max;
          highInput.step = domain.step;
          highInput.value = inputValueOf(state.value[1], segmented);
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
          singleInput.min = domain.min;
          singleInput.max = domain.max;
          singleInput.step = domain.step;
          singleInput.value = inputValueOf(state.value, segmented);
          inputWrap.appendChild(singleInput);
        }
        updateChrome();
      }

      function renderTicks() {
        ticksEl.replaceChildren();
        if (!tickList.length) {
          ticksEl.hidden = true;
          return;
        }
        ticksEl.hidden = false;
        tickList.forEach(function (tick) {
          var percent = mapping.positionOfValue(tick.value);
          var node = make('span', 'nui-slider__tick');
          node.style.left = percent + '%';
          if (percent <= 0.05) node.classList.add('nui-slider__tick--start');
          else if (percent >= 99.95) node.classList.add('nui-slider__tick--end');
          var mark = make('span', 'nui-slider__tick-mark');
          mark.setAttribute('aria-hidden', 'true');
          node.appendChild(mark);
          var labelText = tick.label === null ? formatNumber(tick.value) : tick.label;
          if (labelText !== '') node.appendChild(make('span', 'nui-slider__tick-label', labelText));
          ticksEl.appendChild(node);
        });
      }

      function rebuild() {
        geometry = readGeometry();
        mapping = buildMapping(geometry, state.segments);
        tickList = normalizeTicks(state.ticks, geometry);
        state.value = normalizeValue(state.value);
        buildInputs();
        renderTicks();
      }

      function handleChange(event) {
        if (state.range) handleRangeInput(event);
        else handleSingleInput(event);
      }

      events.on('input', handleChange);
      events.on('keydown', handleKeydown);
      rebuild();
      host.appendChild(root);

      var instance = component(root, state, function (patch) {
        var geometryChanged = own(patch, 'min') || own(patch, 'max') || own(patch, 'step') ||
          own(patch, 'range') || own(patch, 'segments') || own(patch, 'ticks') || own(patch, 'format');
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

      var baseUpdate = instance.update;
      instance.update = function (patch) {
        if (!patch || typeof patch !== 'object' || instance.destroyed) return;
        /* 先验证再合并：坏 segments/ticks 或与新 min/max 冲突时保持旧状态与旧 DOM。 */
        validateSliderOptions(patch);
        baseUpdate(patch);
      };

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

/* ---- source: src/ui/forms-advanced-pickers.js ---- */
/* NoteUI forms-advanced pickers — F12–F13: DatePicker, TimePicker.
   Plain browser script (no framework, no external libraries).
   依赖 core（NoteCore，含 floating）；F12/F13 的日历与时间面板复用
   NoteCore.floating。私有共享 helper 位于 forms-advanced-internal.js，
   必须先加载。Programmatic update() never fires onChange. */
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
  /* Date helpers (local dates only; never rely on Date.parse of ISO)    */
  /* ------------------------------------------------------------------ */

  var WEEKDAY_LONG = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  var WEEKDAY_SHORT = ['日', '一', '二', '三', '四', '五', '六'];
  var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  var REORDER_FEEDBACK = '已调整起止顺序，使开始日期不晚于结束日期。';

  function pad2(number) {
    return (number < 10 ? '0' : '') + String(number);
  }

  function localDate(year, month, day) {
    var date = new Date(2000, 0, 1, 12, 0, 0, 0);
    date.setFullYear(year, month - 1, day);
    return date;
  }

  function dateKeyFromParts(year, month, day) {
    return String(year).padStart(4, '0') + '-' + pad2(month) + '-' + pad2(day);
  }

  function dateKeyFromDate(date) {
    return dateKeyFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  function parseDateKey(value) {
    var source = text(value).trim();
    var match = DATE_RE.exec(source);
    if (!match) return null;
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    var date = localDate(year, month, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return {
      year: year,
      month: month,
      day: day,
      key: dateKeyFromParts(year, month, day),
      date: date
    };
  }

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function shiftDateKey(key, days) {
    var parsed = parseDateKey(key);
    if (!parsed) return null;
    var date = localDate(parsed.year, parsed.month, parsed.day + Number(days));
    return dateKeyFromDate(date);
  }

  function shiftMonthKey(key, months) {
    var parsed = parseDateKey(key);
    if (!parsed) return null;
    var total = parsed.year * 12 + (parsed.month - 1) + Number(months);
    var year = Math.floor(total / 12);
    var month = total % 12;
    if (month < 0) { month += 12; year -= 1; }
    if (year < 1) year = 1;
    if (year > 9999) year = 9999;
    var day = Math.min(parsed.day, daysInMonth(year, month + 1));
    return dateKeyFromParts(year, month + 1, day);
  }

  function localTodayKey() {
    return dateKeyFromDate(new Date());
  }

  function sameDateValue(a, b) {
    if (a == null && b == null) return true;
    if (typeof a === 'string' && typeof b === 'string') return a === b;
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      return (a.start || null) === (b.start || null) && (a.end || null) === (b.end || null);
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* F12 DatePicker                                                     */
  /* ------------------------------------------------------------------ */

  NoteUI.DatePicker = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var input = options && typeof options === 'object' ? options : {};
      var state = readOptions(input, {
        value: null,
        range: false,
        min: '',
        max: '',
        disabledDates: null,
        weekStartsOn: 1,
        today: '',
        label: '日期',
        hint: '',
        placeholder: 'YYYY-MM-DD',
        disabled: false,
        clearable: true,
        disabledReason: '',
        onChange: null,
        externalError: '',
        internalError: '',
        feedback: '',
        open: false,
        viewYear: 2000,
        viewMonth: 1,
        focusKey: ''
      });
      if (input.error != null) state.externalError = text(input.error);
      state.range = Boolean(state.range);
      state.disabled = Boolean(state.disabled);
      state.clearable = state.clearable !== false;
      state.weekStartsOn = Number(state.weekStartsOn) === 0 ? 0 : 1;

      var minParsed = parseDateKey(state.min);
      var maxParsed = parseDateKey(state.max);
      state.min = minParsed ? minParsed.key : '';
      state.max = maxParsed ? maxParsed.key : '';
      if (state.min && state.max && state.min > state.max) {
        var boundSwap = state.min;
        state.min = state.max;
        state.max = boundSwap;
      }
      var todayParsed = parseDateKey(state.today);
      state.today = todayParsed ? todayParsed.key : localTodayKey();

      var base = uid('nui-datepicker');
      var labelId = base + '-label';
      var hintId = base + '-hint';
      var errorId = base + '-error';
      var feedbackId = base + '-feedback';
      var root = make('div', 'nui-datepicker');
      var head = labelRow('nui-datepicker', state.label, false, labelId);
      var row = make('div', 'nui-datepicker__row');
      var inputsWrap = make('div', 'nui-datepicker__inputs');
      var trigger = make('button', 'nui-datepicker__trigger');
      var triggerIcon = icon('calendar', 16);
      var triggerText = make('span', 'nui-datepicker__trigger-text', '选择日期');
      var clearButton = make('button', 'nui-datepicker__clear', '清空');
      var hintEl = messageLine('nui-datepicker', 'hint', hintId);
      var errorEl = messageLine('nui-datepicker', 'error', errorId);
      var feedbackEl = make('p', 'nui-datepicker__feedback');
      feedbackEl.id = feedbackId;
      feedbackEl.setAttribute('role', 'status');
      feedbackEl.hidden = true;
      var rootEvents = listen(root);
      var docEvents = listen(document);
      var panelEvents = null;
      var layer = null;
      var panel = null;
      var grid = null;
      var monthLabel = null;
      var noteEl = null;
      var liveEl = null;
      var prevButton = null;
      var nextButton = null;
      var singleInput = null;
      var startInput = null;
      var endInput = null;
      var destroyed = false;
      var lastEvent = null;

      root.appendChild(head);
      root.appendChild(row);
      inputsWrap.id = base + '-inputs';
      row.appendChild(inputsWrap);
      trigger.type = 'button';
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-label', '打开日期选择');
      if (triggerIcon) {
        triggerIcon.setAttribute('aria-hidden', 'true');
        trigger.appendChild(triggerIcon);
      }
      trigger.appendChild(triggerText);
      row.appendChild(trigger);
      clearButton.type = 'button';
      clearButton.setAttribute('aria-label', '清空日期');
      row.appendChild(clearButton);
      root.appendChild(hintEl);
      root.appendChild(errorEl);
      root.appendChild(feedbackEl);

      function baseHint() {
        return hintWithReason(state, [state.range
          ? '格式 YYYY-MM-DD；本地日期，不做时区换算；范围按开始不晚于结束整理。'
          : '格式 YYYY-MM-DD；本地日期，不做时区换算。']);
      }

      function renderMessages() {
        syncMessages({
          hintEl: hintEl,
          hint: baseHint(),
          errorEl: errorEl,
          error: externalErrorText(state),
          feedbackEl: feedbackEl,
          feedback: state.feedback,
          nodes: [singleInput, startInput, endInput, trigger, clearButton],
          hintId: hintId,
          errorId: errorId,
          feedbackId: feedbackId,
          hintAlways: true
        });
      }

      function buildInputs() {
        inputsWrap.replaceChildren();
        singleInput = null;
        startInput = null;
        endInput = null;
        if (state.range) {
          var startWrap = make('label', 'nui-datepicker__part');
          var startText = make('span', 'nui-datepicker__part-label', '开始');
          startInput = make('input', 'nui-datepicker__input');
          startInput.type = 'text';
          startInput.inputMode = 'numeric';
          startInput.autocomplete = 'off';
          startInput.spellcheck = false;
          startInput.placeholder = state.placeholder;
          startInput.setAttribute('aria-haspopup', 'dialog');
          startInput.setAttribute('aria-expanded', 'false');
          startWrap.appendChild(startText);
          startWrap.appendChild(startInput);

          var endWrap = make('label', 'nui-datepicker__part');
          var endText = make('span', 'nui-datepicker__part-label', '结束');
          endInput = make('input', 'nui-datepicker__input');
          endInput.type = 'text';
          endInput.inputMode = 'numeric';
          endInput.autocomplete = 'off';
          endInput.spellcheck = false;
          endInput.placeholder = state.placeholder;
          endInput.setAttribute('aria-haspopup', 'dialog');
          endInput.setAttribute('aria-expanded', 'false');
          endWrap.appendChild(endText);
          endWrap.appendChild(endInput);
          inputsWrap.appendChild(startWrap);
          inputsWrap.appendChild(endWrap);
        } else {
          var singleWrap = make('div', 'nui-datepicker__part');
          singleInput = make('input', 'nui-datepicker__input');
          singleInput.type = 'text';
          singleInput.inputMode = 'numeric';
          singleInput.autocomplete = 'off';
          singleInput.spellcheck = false;
          singleInput.placeholder = state.placeholder;
          singleInput.setAttribute('aria-labelledby', labelId);
          singleInput.setAttribute('aria-haspopup', 'dialog');
          singleInput.setAttribute('aria-expanded', 'false');
          singleWrap.appendChild(singleInput);
          inputsWrap.appendChild(singleWrap);
        }
      }

      function inputNodes() {
        return [singleInput, startInput, endInput].filter(Boolean);
      }

      function syncInputsFromValue(overwriteText) {
        if (singleInput) {
          if (overwriteText !== false) singleInput.value = typeof state.value === 'string' ? state.value : '';
        } else {
          var start = state.value && typeof state.value === 'object' ? state.value.start : '';
          var end = state.value && typeof state.value === 'object' ? state.value.end : '';
          if (overwriteText !== false) {
            startInput.value = start || '';
            endInput.value = end || '';
          }
        }
      }

      function syncChrome() {
        var disabled = Boolean(state.disabled);
        root.classList.toggle('nui-datepicker--disabled', disabled);
        root.dataset.range = state.range ? 'true' : 'false';
        trigger.disabled = disabled;
        var labelPrefix = text(state.label) ? text(state.label) + '：' : '';
        trigger.setAttribute('aria-label', labelPrefix + '打开日期选择');
        clearButton.setAttribute('aria-label', labelPrefix + '清空日期');
        inputNodes().forEach(function (node) {
          node.disabled = disabled;
        });
        if (state.range) {
          var prefix = text(state.label) ? text(state.label) + ' ' : '';
          inputsWrap.setAttribute('role', 'group');
          if (text(state.label)) {
            inputsWrap.removeAttribute('aria-label');
            inputsWrap.setAttribute('aria-labelledby', labelId);
          } else {
            inputsWrap.removeAttribute('aria-labelledby');
            inputsWrap.setAttribute('aria-label', '日期范围');
          }
          if (startInput) startInput.setAttribute('aria-label', prefix + '开始日期');
          if (endInput) endInput.setAttribute('aria-label', prefix + '结束日期');
        } else if (singleInput) {
          inputsWrap.removeAttribute('role');
          inputsWrap.removeAttribute('aria-labelledby');
          inputsWrap.removeAttribute('aria-label');
          if (text(state.label)) {
            singleInput.removeAttribute('aria-label');
            singleInput.setAttribute('aria-labelledby', labelId);
          } else {
            singleInput.removeAttribute('aria-labelledby');
            singleInput.setAttribute('aria-label', '日期值');
          }
        }
        clearButton.disabled = disabled;
        var hasText = false;
        inputNodes().forEach(function (node) { if (node.value !== '') hasText = true; });
        var hasValue = state.value != null;
        clearButton.hidden = !(state.clearable && !disabled && (hasText || hasValue));
        triggerText.textContent = state.range ? '选择日期范围' : '选择日期';
        syncHeadLabel(head, '.nui-datepicker__label', state.label);
        inputNodes().forEach(function (node) { node.placeholder = state.placeholder; });
        renderMessages();
      }

      function setError(message) {
        state.externalError = message == null ? '' : String(message);
        renderMessages();
      }

      function isDisabledDate(key) {
        if (!key) return false;
        if (state.min && key < state.min) return true;
        if (state.max && key > state.max) return true;
        var list = state.disabledDates;
        if (typeof list === 'function') {
          try {
            var parsedKey = parseDateKey(key);
            if (list(key, parsedKey ? parsedKey.date : null)) return true;
          } catch (error) { /* a host predicate must not break the calendar */ }
          return false;
        }
        if (Array.isArray(list)) {
          for (var i = 0; i < list.length; i += 1) {
            var parsed = parseDateKey(list[i]);
            if (parsed && parsed.key === key) return true;
          }
        }
        return false;
      }

      function constraintMessage(key) {
        if (!key) return '请输入有效日期。';
        if (state.min && key < state.min) return '日期不能早于 ' + state.min + '。';
        if (state.max && key > state.max) return '日期不能晚于 ' + state.max + '。';
        if (isDisabledDate(key)) return '该日期不可选择。';
        return '';
      }

      function currentRange() {
        if (!state.value || typeof state.value !== 'object') return { start: null, end: null };
        return {
          start: parseDateKey(state.value.start) ? parseDateKey(state.value.start).key : null,
          end: parseDateKey(state.value.end) ? parseDateKey(state.value.end).key : null
        };
      }

      function setValue(next, event, optionsObject) {
        var previous = state.value == null ? null : copy(state.value);
        state.value = next == null ? null : copy(next);
        var opts = optionsObject || {};
        if (opts.overwriteText !== false) syncInputsFromValue(true);
        if (opts.clearError !== false) {
          state.internalError = '';
          state.externalError = '';
          state.feedback = '';
        }
        syncChrome();
        if (layer && layer.isOpen()) renderPanel();
        if (!sameDateValue(previous, state.value)) call(state.onChange, state.value == null ? null : copy(state.value), event);
      }

      function normalizeLoadedValue(raw) {
        state.internalError = '';
        state.feedback = '';
        if (state.range) {
          var source = raw;
          if (Array.isArray(source)) source = { start: source[0], end: source[1] };
          if (!source || typeof source !== 'object') {
            if (raw == null || raw === '') return null;
            state.internalError = '范围值应为 { start, end }。';
            return null;
          }
          var startRaw = source.start == null ? '' : text(source.start).trim();
          var endRaw = source.end == null ? '' : text(source.end).trim();
          var startParsed = startRaw === '' ? null : parseDateKey(startRaw);
          var endParsed = endRaw === '' ? null : parseDateKey(endRaw);
          if (startRaw !== '' && !startParsed) state.internalError = '开始日期格式无效，应为 YYYY-MM-DD。';
          else if (endRaw !== '' && !endParsed) state.internalError = '结束日期格式无效，应为 YYYY-MM-DD。';
          else {
            if (startParsed && constraintMessage(startParsed.key)) state.internalError = '开始日期：' + constraintMessage(startParsed.key);
            else if (endParsed && constraintMessage(endParsed.key)) state.internalError = '结束日期：' + constraintMessage(endParsed.key);
          }
          if (state.internalError) {
            // Keep raw text visible, but do not invent a value from invalid input.
            return null;
          }
          if (!startParsed && !endParsed) return null;
          if (startParsed && endParsed) {
            var a = startParsed.key;
            var b = endParsed.key;
            if (a > b) {
              var swap = a; a = b; b = swap;
              state.feedback = '已调整起止顺序，使开始日期不晚于结束日期。';
            }
            return { start: a, end: b };
          }
          return { start: startParsed ? startParsed.key : null, end: endParsed ? endParsed.key : null };
        }
        if (raw == null || raw === '') return null;
        var parsed = parseDateKey(raw);
        if (!parsed) {
          state.internalError = '日期格式无效，应为 YYYY-MM-DD。';
          return null;
        }
        var constrained = constraintMessage(parsed.key);
        if (constrained) {
          state.internalError = constrained;
          return null;
        }
        return parsed.key;
      }

      function applyLoadedValue(raw, overwriteText) {
        var loaded = normalizeLoadedValue(raw);
        state.value = loaded;
        if (overwriteText !== false) {
          syncInputsFromValue(true);
          if (state.range && (raw && typeof raw === 'object')) {
            // Preserve raw invalid text so it is not silently replaced.
            if (state.internalError) {
              if (startInput) startInput.value = raw.start == null ? '' : text(raw.start);
              if (endInput) endInput.value = raw.end == null ? '' : text(raw.end);
            }
          } else if (!state.range && state.internalError && raw != null) {
            if (singleInput) singleInput.value = text(raw);
          }
        } else {
          syncInputsFromValue(false);
        }
        setViewFromValue();
        syncChrome();
      }

      function setViewFromValue() {
        var parsed = null;
        if (typeof state.value === 'string') parsed = parseDateKey(state.value);
        else if (state.value && typeof state.value === 'object') parsed = parseDateKey(state.value.start || state.value.end);
        if (!parsed) parsed = parseDateKey(state.today);
        state.viewYear = parsed ? parsed.year : 2000;
        state.viewMonth = parsed ? parsed.month : 1;
        state.focusKey = parsed ? parsed.key : dateKeyFromParts(state.viewYear, state.viewMonth, 1);
      }

      function buildPanel() {
        if (!layer) return;
        panel = layer.el;
        panel.setAttribute('aria-label', state.range ? '选择日期范围' : '选择日期');
        panelEvents = listen(panel);

        var header = make('div', 'nui-datepicker__header');
        prevButton = make('button', 'nui-datepicker__nav', '‹');
        prevButton.type = 'button';
        prevButton.setAttribute('aria-label', '上个月');
        nextButton = make('button', 'nui-datepicker__nav', '›');
        nextButton.type = 'button';
        nextButton.setAttribute('aria-label', '下个月');
        monthLabel = make('div', 'nui-datepicker__month');
        monthLabel.setAttribute('aria-live', 'polite');
        header.appendChild(prevButton);
        header.appendChild(monthLabel);
        header.appendChild(nextButton);

        var weekdays = make('div', 'nui-datepicker__weekdays');
        weekdays.setAttribute('aria-hidden', 'true');
        for (var i = 0; i < 7; i += 1) {
          var dayIndex = (state.weekStartsOn + i) % 7;
          weekdays.appendChild(make('span', 'nui-datepicker__weekday', WEEKDAY_SHORT[dayIndex]));
        }

        grid = make('div', 'nui-datepicker__grid');
        grid.setAttribute('role', 'grid');
        grid.setAttribute('aria-label', state.range ? '日期范围日历' : '日期日历');

        noteEl = make('p', 'nui-datepicker__note');
        liveEl = make('div', 'nui-datepicker__status hnv-visually-hidden');
        liveEl.setAttribute('aria-live', 'polite');

        panel.appendChild(header);
        panel.appendChild(weekdays);
        panel.appendChild(grid);
        panel.appendChild(noteEl);
        panel.appendChild(liveEl);

        panelEvents.on('click', function (event) {
          if (event.target === prevButton) {
            event.preventDefault();
            changeMonth(-1);
            return;
          }
          if (event.target === nextButton) {
            event.preventDefault();
            changeMonth(1);
            return;
          }
          var day = event.target.closest ? event.target.closest('[data-date]') : null;
          if (!day || !grid.contains(day)) return;
          event.preventDefault();
          var key = day.getAttribute('data-date');
          if (day.getAttribute('aria-disabled') === 'true') {
            if (liveEl) liveEl.textContent = '该日期不可选择。';
            state.feedback = '该日期不可选择。';
            renderMessages();
            return;
          }
          selectDay(key, event);
        });
        panelEvents.on('keydown', function (event) {
          if (event.key === 'Escape' || event.key === 'Esc') return;
          var day = event.target.closest ? event.target.closest('[data-date]') : null;
          if (!day || !grid.contains(day)) return;
          var key = day.getAttribute('data-date');
          var nextKey = '';
          if (event.key === 'ArrowLeft') nextKey = shiftDateKey(key, -1);
          else if (event.key === 'ArrowRight') nextKey = shiftDateKey(key, 1);
          else if (event.key === 'ArrowUp') nextKey = shiftDateKey(key, -7);
          else if (event.key === 'ArrowDown') nextKey = shiftDateKey(key, 7);
          else if (event.key === 'Home' || event.key === 'End') {
            var parsed = parseDateKey(key);
            if (!parsed) return;
            var offset = (parsed.date.getDay() - state.weekStartsOn + 7) % 7;
            nextKey = shiftDateKey(key, event.key === 'Home' ? -offset : 6 - offset);
          } else if (event.key === 'PageUp' || event.key === 'PageDown') {
            var direction = event.key === 'PageUp' ? -1 : 1;
            var months = event.shiftKey ? direction * 12 : direction;
            nextKey = shiftMonthKey(key, months);
          } else {
            return;
          }
          if (!nextKey) return;
          event.preventDefault();
          moveFocusTo(nextKey);
        });
      }

      function ensureLayer() {
        if (layer) return layer;
        layer = createDialogLayer({
          name: 'NoteUI.DatePicker',
          anchor: trigger,
          className: 'nui-datepicker__panel',
          onOpen: function () {
            state.open = true;
            trigger.setAttribute('aria-expanded', 'true');
            inputNodes().forEach(function (node) { node.setAttribute('aria-expanded', 'true'); });
            renderPanel();
            focusDay(state.focusKey);
          },
          onClose: function () {
            state.open = false;
            trigger.setAttribute('aria-expanded', 'false');
            inputNodes().forEach(function (node) { node.setAttribute('aria-expanded', 'false'); });
          }
        });
        buildPanel();
        return layer;
      }

      function openPanel() {
        if (destroyed || state.disabled) return;
        ensureLayer();
        if (layer.isOpen()) {
          renderPanel();
          focusDay(state.focusKey);
          return;
        }
        setViewForOpen();
        renderPanel();
        if (!root.contains(document.activeElement)) trigger.focus();
        layer.open();
      }

      function closePanel(reason) {
        if (layer && layer.isOpen()) layer.close(reason || 'api', { restoreFocus: true });
      }

      function setViewForOpen() {
        var parsed = null;
        if (typeof state.value === 'string') parsed = parseDateKey(state.value);
        else if (state.value && typeof state.value === 'object') parsed = parseDateKey(state.value.start || state.value.end);
        if (!parsed) parsed = parseDateKey(state.today);
        state.viewYear = parsed ? parsed.year : 2000;
        state.viewMonth = parsed ? parsed.month : 1;
        var preferred = parsed ? parsed.key : state.today;
        if (state.focusKey && parseDateKey(state.focusKey)) preferred = state.focusKey;
        state.focusKey = preferred;
      }

      function ensureFocusKeyInView() {
        if (state.focusKey) {
          var parsed = parseDateKey(state.focusKey);
          if (parsed && parsed.year === state.viewYear && parsed.month === state.viewMonth) return;
        }
        var selectedKey = typeof state.value === 'string' ? state.value : (state.value && (state.value.start || state.value.end));
        var selected = parseDateKey(selectedKey);
        if (selected && selected.year === state.viewYear && selected.month === state.viewMonth) {
          state.focusKey = selected.key;
          return;
        }
        var today = parseDateKey(state.today);
        if (today && today.year === state.viewYear && today.month === state.viewMonth) {
          state.focusKey = today.key;
          return;
        }
        state.focusKey = dateKeyFromParts(state.viewYear, state.viewMonth, 1);
      }

      function renderPanel() {
        if (!panel) return;
        if (state.viewYear < 1) state.viewYear = 1;
        if (state.viewYear > 9999) state.viewYear = 9999;
        if (monthLabel) monthLabel.textContent = String(state.viewYear) + '年' + String(state.viewMonth) + '月';
        if (prevButton) prevButton.disabled = state.viewYear === 1 && state.viewMonth === 1;
        if (nextButton) nextButton.disabled = state.viewYear === 9999 && state.viewMonth === 12;
        ensureFocusKeyInView();
        renderGrid();
        var notes = [];
        if (state.min || state.max) notes.push('可选范围：' + (state.min || '不限') + ' 至 ' + (state.max || '不限'));
        if (state.disabledDates) notes.push(typeof state.disabledDates === 'function' ? '部分日期由宿主规则禁用' : '部分日期不可选');
        notes.push('今天 ' + state.today + ' · 本地日期');
        if (noteEl) noteEl.textContent = hintJoin(notes);
      }

      function renderGrid() {
        if (!grid) return;
        grid.replaceChildren();
        var first = localDate(state.viewYear, state.viewMonth, 1);
        var offset = (first.getDay() - state.weekStartsOn + 7) % 7;
        var total = daysInMonth(state.viewYear, state.viewMonth);
        var weekRow = make('div', 'nui-datepicker__week');
        weekRow.setAttribute('role', 'row');
        for (var blank = 0; blank < offset; blank += 1) {
          var emptyCell = make('span', 'nui-datepicker__blank');
          emptyCell.setAttribute('role', 'gridcell');
          emptyCell.setAttribute('aria-hidden', 'true');
          weekRow.appendChild(emptyCell);
        }
        var range = currentRange();
        var inRangeStart = range.start && range.end && range.start <= range.end ? range.start : null;
        var inRangeEnd = range.start && range.end && range.start <= range.end ? range.end : null;
        for (var day = 1; day <= total; day += 1) {
          var key = dateKeyFromParts(state.viewYear, state.viewMonth, day);
          var parsedDay = parseDateKey(key);
          var disabled = isDisabledDate(key);
          var button = make('button', 'nui-datepicker__day', String(day));
          button.type = 'button';
          button.dataset.date = key;
          button.setAttribute('role', 'gridcell');
          button.setAttribute('aria-label', key + ' ' + WEEKDAY_LONG[parsedDay.date.getDay()] +
            (disabled ? '，不可选' : ''));
          button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
          button.tabIndex = key === state.focusKey ? 0 : -1;

          var selected = false;
          var suffix = '';
          if (state.range) {
            if (range.start && key === range.start) { selected = true; suffix = '，已选开始日期'; }
            if (range.end && key === range.end) { selected = true; suffix = '，已选结束日期'; }
            if (inRangeStart && inRangeEnd && key >= inRangeStart && key <= inRangeEnd) {
              selected = true;
              button.classList.add('nui-datepicker__day--in-range');
              if (key === inRangeStart) button.classList.add('nui-datepicker__day--range-start');
              if (key === inRangeEnd) button.classList.add('nui-datepicker__day--range-end');
              if (!suffix) suffix = '，在所选范围内';
            }
            if (range.start && !range.end && key === range.start) suffix = '，已选开始日期，请选择结束日期';
          } else if (typeof state.value === 'string' && key === state.value) {
            selected = true;
            suffix = '，已选择';
          }
          if (selected) {
            button.setAttribute('aria-selected', 'true');
            button.classList.add('nui-datepicker__day--selected');
          }
          if (suffix) button.setAttribute('aria-label', button.getAttribute('aria-label') + suffix);
          if (disabled) button.classList.add('nui-datepicker__day--disabled');
          if (key === state.today) {
            button.classList.add('nui-datepicker__day--today');
            button.setAttribute('aria-current', 'date');
          }
          weekRow.appendChild(button);
          if ((offset + day) % 7 === 0) {
            grid.appendChild(weekRow);
            weekRow = make('div', 'nui-datepicker__week');
            weekRow.setAttribute('role', 'row');
          }
        }
        if (weekRow.childNodes.length) grid.appendChild(weekRow);
      }

      function focusDay(key) {
        if (!grid || !key) return;
        var button = grid.querySelector('[data-date="' + key + '"]');
        if (!button) return;
        grid.querySelectorAll('[data-date]').forEach(function (node) { node.tabIndex = -1; });
        button.tabIndex = 0;
        try { button.focus({ preventScroll: true }); } catch (error) { button.focus(); }
      }

      function moveFocusTo(key) {
        var parsed = parseDateKey(key);
        if (!parsed) return;
        state.focusKey = key;
        state.viewYear = parsed.year;
        state.viewMonth = parsed.month;
        renderPanel();
        focusDay(key);
      }

      function changeMonth(delta) {
        var total = state.viewYear * 12 + (state.viewMonth - 1) + delta;
        var year = Math.floor(total / 12);
        var month = total % 12;
        if (month < 0) { month += 12; year -= 1; }
        if (year < 1) { year = 1; month = 0; }
        if (year > 9999) { year = 9999; month = 11; }
        state.viewYear = year;
        state.viewMonth = month + 1;
        var preferredDay = parseDateKey(state.focusKey);
        var day = preferredDay ? Math.min(preferredDay.day, daysInMonth(year, month + 1)) : 1;
        state.focusKey = dateKeyFromParts(year, month + 1, day);
        renderPanel();
      }

      function commitRange(start, end, reordered) {
        setValue({ start: start, end: end }, lastEvent, { overwriteText: true, clearError: true });
        state.feedback = reordered ? REORDER_FEEDBACK : '';
        renderMessages();
        closePanel('select');
      }

      function daySelected(key) {
        if (state.range) {
          var range = currentRange();
          if (range.start && !range.end) {
            var reordered = range.start > key;
            commitRange(reordered ? key : range.start, reordered ? range.start : key, reordered);
            return;
          }
          if (!range.start && range.end) {
            var swapped = key > range.end;
            commitRange(swapped ? range.end : key, swapped ? key : range.end, swapped);
            return;
          }
          setValue({ start: key, end: null }, lastEvent, { overwriteText: true, clearError: true });
          state.feedback = '已选择开始日期，请选择结束日期。';
          renderMessages();
          state.focusKey = key;
          renderPanel();
          focusDay(key);
          if (liveEl) liveEl.textContent = '已选择开始日期 ' + key + '，请选择结束日期。';
          return;
        }
        setValue(key, lastEvent, { overwriteText: true, clearError: true });
        closePanel('select');
      }

      function selectDay(key, event) {
        lastEvent = event || null;
        daySelected(key);
        lastEvent = null;
      }

      function handleTextInput(event) {
        if (destroyed || state.disabled) return;
        state.internalError = '';
        state.externalError = '';
        state.feedback = '';
        syncChrome();
        lastEvent = event || null;
      }

      function rejectTyped(message, event) {
        var previous = state.value;
        state.internalError = message;
        state.feedback = '';
        state.value = null;
        syncChrome();
        if (previous != null) call(state.onChange, null, event);
      }

      function commitText(event) {
        if (destroyed || state.disabled) return;
        lastEvent = event || null;
        if (state.range) {
          var startRaw = startInput ? startInput.value.trim() : '';
          var endRaw = endInput ? endInput.value.trim() : '';
          if (startRaw === '' && endRaw === '') {
            setValue(null, lastEvent, { overwriteText: true, clearError: true });
            lastEvent = null;
            return;
          }
          var startParsed = startRaw === '' ? null : parseDateKey(startRaw);
          var endParsed = endRaw === '' ? null : parseDateKey(endRaw);
          if (startRaw !== '' && !startParsed) {
            rejectTyped('开始日期格式无效，应为 YYYY-MM-DD。', lastEvent);
            lastEvent = null;
            return;
          }
          if (endRaw !== '' && !endParsed) {
            rejectTyped('结束日期格式无效，应为 YYYY-MM-DD。', lastEvent);
            lastEvent = null;
            return;
          }
          var startKey = startParsed ? startParsed.key : null;
          var endKey = endParsed ? endParsed.key : null;
          var startConstraint = startKey ? constraintMessage(startKey) : '';
          var endConstraint = endKey ? constraintMessage(endKey) : '';
          if (startConstraint || endConstraint) {
            rejectTyped(startConstraint ? ('开始日期：' + startConstraint) : ('结束日期：' + endConstraint), lastEvent);
            lastEvent = null;
            return;
          }
          var reordered = false;
          if (startKey && endKey && startKey > endKey) {
            var swap = startKey;
            startKey = endKey;
            endKey = swap;
            reordered = true;
          }
          setValue({ start: startKey, end: endKey }, lastEvent, { overwriteText: true, clearError: true });
          state.feedback = reordered ? REORDER_FEEDBACK : '';
          renderMessages();
          lastEvent = null;
          return;
        }
        var raw = singleInput ? singleInput.value.trim() : '';
        if (raw === '') {
          setValue(null, lastEvent, { overwriteText: true, clearError: true });
          lastEvent = null;
          return;
        }
        var parsed = parseDateKey(raw);
        if (!parsed) {
          rejectTyped('日期格式无效，应为 YYYY-MM-DD。', lastEvent);
          lastEvent = null;
          return;
        }
        var constraint = constraintMessage(parsed.key);
        if (constraint) {
          rejectTyped(constraint, lastEvent);
          lastEvent = null;
          return;
        }
        setValue(parsed.key, lastEvent, { overwriteText: true, clearError: true });
        lastEvent = null;
      }

      function handleTextBlur(event) {
        commitText(event);
      }

      function handleTextKeydown(event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitText(event);
          return;
        }
        if (event.key === 'ArrowDown' && event.altKey) {
          event.preventDefault();
          openPanel();
        }
      }

      function clearValue(event) {
        if (destroyed || state.disabled) return;
        var had = state.value != null;
        inputNodes().forEach(function (node) { if (node.value !== '') had = true; });
        state.value = null;
        state.internalError = '';
        state.externalError = '';
        state.feedback = '';
        if (singleInput) singleInput.value = '';
        if (startInput) startInput.value = '';
        if (endInput) endInput.value = '';
        closePanel('api');
        syncChrome();
        if (had) call(state.onChange, null, event);
        var target = singleInput || startInput;
        if (target) target.focus();
      }

      rootEvents.on('click', function (event) {
        if (event.target === trigger || (trigger.contains && trigger.contains(event.target))) {
          event.preventDefault();
          if (layer && layer.isOpen()) closePanel('api');
          else openPanel();
          return;
        }
        if (event.target === clearButton || (clearButton.contains && clearButton.contains(event.target))) {
          event.preventDefault();
          clearValue(event);
        }
      });
      rootEvents.on('input', function (event) {
        if (event.target === singleInput || event.target === startInput || event.target === endInput) handleTextInput(event);
      });
      rootEvents.on('blur', function (event) {
        if (event.target === singleInput || event.target === startInput || event.target === endInput) handleTextBlur(event);
      }, true);
      rootEvents.on('keydown', function (event) {
        if (event.target === singleInput || event.target === startInput || event.target === endInput) handleTextKeydown(event);
      });
      guardTriggerPointer(trigger, docEvents, function () { return Boolean(layer && layer.isOpen()); });

      buildInputs();
      applyLoadedValue(input.value, true);
      host.appendChild(root);

      var instance = component(root, state, function (patch) {
        var rangeChanged = own(patch, 'range');
        var weekChanged = own(patch, 'weekStartsOn');
        if (rangeChanged || weekChanged) {
          state.weekStartsOn = Number(state.weekStartsOn) === 0 ? 0 : 1;
          if (panel) {
            panelEvents.clear();
            panel.replaceChildren();
            buildPanel();
          }
          buildInputs();
          if (weekChanged && !rangeChanged) syncInputsFromValue(true);
        }
        if (rangeChanged) {
          if (state.range) {
            if (typeof state.value === 'string') state.value = { start: state.value, end: null };
          } else if (state.value && typeof state.value === 'object') {
            state.value = state.value.start || state.value.end || null;
          }
        }
        if (own(patch, 'min') || own(patch, 'max')) {
          var minP = parseDateKey(state.min);
          var maxP = parseDateKey(state.max);
          state.min = minP ? minP.key : '';
          state.max = maxP ? maxP.key : '';
          if (state.min && state.max && state.min > state.max) {
            var swap = state.min;
            state.min = state.max;
            state.max = swap;
          }
        }
        if (own(patch, 'today')) {
          var todayP = parseDateKey(state.today);
          state.today = todayP ? todayP.key : localTodayKey();
        }
        if (own(patch, 'disabled')) {
          state.disabled = Boolean(state.disabled);
          if (state.disabled) closePanel('api');
        }
        if (own(patch, 'clearable')) state.clearable = state.clearable !== false;
        if (own(patch, 'error')) state.externalError = state.error == null ? '' : String(state.error);
        if (own(patch, 'value') || rangeChanged) applyLoadedValue(state.value, true);
        syncChrome();
        if (layer && layer.isOpen()) renderPanel();
      }, function () {
        rootEvents.clear();
        docEvents.clear();
        if (panelEvents) panelEvents.clear();
        if (layer) {
          layer.destroy();
          layer = null;
          panel = null;
        }
      });

      instance.getValue = function () {
        return state.value == null ? null : copy(state.value);
      };
      instance.setError = setError;
      instance.getError = function () { return externalErrorText(state); };
      instance.open = function () { openPanel(); };
      instance.close = function () { closePanel('api'); };
      instance.focus = function () {
        var target = singleInput || startInput;
        if (target) target.focus();
      };
      return instance;
    }
  };

  /* ------------------------------------------------------------------ */
  /* Time helpers (local wall-clock only; no timezone conversion)        */
  /* ------------------------------------------------------------------ */

  var TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

  function timeText(parts, seconds) {
    var output = pad2(parts.hour) + ':' + pad2(parts.minute);
    if (seconds) output += ':' + pad2(parts.second);
    return output;
  }

  /* 宽松解析（约界值用，两种精度都接受）与严格解析（文本值用）共用同一实现。 */
  function parseLooseTimeParts(value) {
    var match = TIME_RE.exec(text(value).trim());
    if (!match) return null;
    var hour = Number(match[1]);
    var minute = Number(match[2]);
    var second = match[3] == null ? 0 : Number(match[3]);
    if (hour > 23 || minute > 59 || second > 59) return null;
    return {
      hour: hour,
      minute: minute,
      second: second,
      hasSeconds: match[3] != null,
      total: hour * 3600 + minute * 60 + second
    };
  }

  function parseTimeParts(value, requireSeconds) {
    var parsed = parseLooseTimeParts(value);
    if (!parsed || parsed.hasSeconds !== Boolean(requireSeconds)) return null;
    return parsed;
  }

  function minutesForStep(step) {
    var values = [];
    for (var minute = 0; minute < 60; minute += step) values.push(minute);
    return values;
  }

  function secondsForStep(step) {
    var values = [];
    for (var second = 0; second < 60; second += step) values.push(second);
    return values;
  }

  /* ------------------------------------------------------------------ */
  /* F13 TimePicker                                                     */
  /* ------------------------------------------------------------------ */

  NoteUI.TimePicker = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var input = options && typeof options === 'object' ? options : {};
      var state = readOptions(input, {
        value: null,
        seconds: false,
        step: null,
        min: '',
        max: '',
        label: '时间',
        hint: '',
        disabled: false,
        disabledReason: '',
        clearable: true,
        onChange: null,
        externalError: '',
        internalError: '',
        open: false
      });
      if (input.error != null) state.externalError = text(input.error);
      state.seconds = Boolean(state.seconds);
      state.disabled = Boolean(state.disabled);
      state.clearable = state.clearable !== false;
      var stepNumber = Math.floor(Number(state.step));
      if (!isFinite(stepNumber) || stepNumber < 1) stepNumber = state.seconds ? 30 : 15;
      if (stepNumber > 60) stepNumber = 60;
      state.step = stepNumber;

      var base = uid('nui-timepicker');
      var labelId = base + '-label';
      var hintId = base + '-hint';
      var errorId = base + '-error';
      var root = make('div', 'nui-timepicker');
      var head = labelRow('nui-timepicker', state.label, false, labelId);
      var row = make('div', 'nui-timepicker__row');
      var control = make('input', 'nui-timepicker__input');
      var trigger = make('button', 'nui-timepicker__trigger');
      var triggerIcon = icon('clock', 16);
      var triggerText = make('span', 'nui-timepicker__trigger-text', '选择时间');
      var clearButton = make('button', 'nui-timepicker__clear', '清空');
      var hintEl = messageLine('nui-timepicker', 'hint', hintId);
      var errorEl = messageLine('nui-timepicker', 'error', errorId);
      var rootEvents = listen(root);
      var docEvents = listen(document);
      var panelEvents = null;
      var layer = null;
      var panel = null;
      var hourSelect = null;
      var minuteSelect = null;
      var secondSelect = null;
      var secondsUnit = null;
      var draftText = null;
      var panelError = null;
      var noteEl = null;
      var doneButton = null;
      var draft = { hour: 0, minute: 0, second: 0 };
      var destroyed = false;

      root.appendChild(head);
      root.appendChild(row);
      row.appendChild(control);
      control.type = 'text';
      control.autocomplete = 'off';
      control.inputMode = 'numeric';
      control.spellcheck = false;
      control.setAttribute('aria-haspopup', 'dialog');
      control.setAttribute('aria-expanded', 'false');
      trigger.type = 'button';
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-label', '打开时间选择');
      if (triggerIcon) {
        triggerIcon.setAttribute('aria-hidden', 'true');
        trigger.appendChild(triggerIcon);
      }
      trigger.appendChild(triggerText);
      row.appendChild(trigger);
      clearButton.type = 'button';
      clearButton.setAttribute('aria-label', '清空时间');
      row.appendChild(clearButton);
      root.appendChild(hintEl);
      root.appendChild(errorEl);

      function hourValues() {
        var values = [];
        for (var hour = 0; hour < 24; hour += 1) values.push(hour);
        return values;
      }

      function minuteValues() {
        return minutesForStep(state.seconds ? 1 : state.step);
      }

      function secondValues() {
        return state.seconds ? secondsForStep(state.step) : [0];
      }

      function parseBound(raw) {
        if (raw == null || raw === '') return null;
        var parsed = parseLooseTimeParts(raw);
        if (!parsed) return null;
        if (!state.seconds && parsed.second !== 0) return null;
        return parsed;
      }

      function normalizeBounds() {
        var minParsed = parseBound(state.min);
        var maxParsed = parseBound(state.max);
        state.min = minParsed ? timeText(minParsed, state.seconds) : '';
        state.max = maxParsed ? timeText(maxParsed, state.seconds) : '';
        if (minParsed && maxParsed && minParsed.total > maxParsed.total) {
          var swap = state.min;
          state.min = state.max;
          state.max = swap;
          minParsed = parseBound(state.min);
          maxParsed = parseBound(state.max);
        }
        return { min: minParsed, max: maxParsed };
      }

      var bounds = normalizeBounds();

      function formatHint() {
        var parts = ['格式 ' + (state.seconds ? 'HH:mm:ss' : 'HH:mm') + '；本地时间，不做时区换算。'];
        if (state.min || state.max) parts.push('允许范围 ' + (state.min || '不限') + ' 至 ' + (state.max || '不限') + '（含端点）。');
        parts.push(state.seconds ? ('秒步长 ' + state.step + ' 秒') : ('分钟步长 ' + state.step + ' 分钟'));
        return hintWithReason(state, parts);
      }

      function renderMessages() {
        syncMessages({
          hintEl: hintEl,
          hint: formatHint(),
          errorEl: errorEl,
          error: externalErrorText(state),
          nodes: [control, trigger, clearButton],
          hintId: hintId,
          errorId: errorId,
          hintAlways: true
        });
      }

      function syncChrome() {
        var disabled = Boolean(state.disabled);
        root.classList.toggle('nui-timepicker--disabled', disabled);
        control.disabled = disabled;
        trigger.disabled = disabled;
        clearButton.disabled = disabled;
        control.placeholder = state.seconds ? 'HH:mm:ss' : 'HH:mm';
        clearButton.hidden = !(state.clearable && !disabled && (control.value !== '' || state.value != null));
        var timePrefix = text(state.label) ? text(state.label) + '：' : '';
        if (text(state.label)) {
          control.removeAttribute('aria-label');
          control.setAttribute('aria-labelledby', labelId);
        } else {
          control.removeAttribute('aria-labelledby');
          control.setAttribute('aria-label', '时间值');
        }
        trigger.setAttribute('aria-label', timePrefix + '打开时间选择');
        clearButton.setAttribute('aria-label', timePrefix + '清空时间');
        syncHeadLabel(head, '.nui-timepicker__label', state.label);
        renderMessages();
      }

      function setError(message) {
        state.externalError = message == null ? '' : String(message);
        renderMessages();
      }

      function unitAllowed(parts) {
        if (state.seconds) {
          if (secondValues().indexOf(parts.second) < 0) return '秒必须为 ' + state.step + ' 的步长。';
        } else if (minutesForStep(state.step).indexOf(parts.minute) < 0) {
          return '分钟必须为 ' + state.step + ' 的步长。';
        }
        if (bounds.min && parts.total < bounds.min.total) {
          return '时间不能早于 ' + state.min + '。';
        }
        if (bounds.max && parts.total > bounds.max.total) {
          return '时间不能晚于 ' + state.max + '。';
        }
        return '';
      }

      function loadValue(raw) {
        state.internalError = '';
        var parsed = raw == null || raw === '' ? null : parseTimeParts(raw, state.seconds);
        if (raw != null && raw !== '' && !parsed) {
          state.internalError = '时间格式无效，应为 ' + (state.seconds ? 'HH:mm:ss' : 'HH:mm') + '。';
          state.value = null;
          control.value = text(raw);
          return;
        }
        if (parsed) {
          var problem = unitAllowed(parsed);
          if (problem) {
            state.internalError = problem;
            state.value = null;
            control.value = timeText(parsed, state.seconds);
            return;
          }
        }
        state.value = parsed ? timeText(parsed, state.seconds) : null;
        control.value = state.value || '';
      }

      function commitTime(parts, event) {
        var next = timeText(parts, state.seconds);
        var previous = state.value;
        var problem = unitAllowed(parts);
        if (problem) {
          state.internalError = problem;
          renderMessages();
          return false;
        }
        state.value = next;
        state.internalError = '';
        state.externalError = '';
        control.value = next;
        syncChrome();
        if (previous !== next) call(state.onChange, next, event);
        return true;
      }

      function rejectTyped(message, event) {
        var previous = state.value;
        state.internalError = message;
        state.value = null;
        syncChrome();
        if (previous != null) call(state.onChange, null, event);
      }

      function commitText(event) {
        if (destroyed || state.disabled) return;
        var raw = control.value.trim();
        if (raw === '') {
          if (!state.clearable) {
            rejectTyped('时间不能为空。', event);
            return;
          }
          var previous = state.value;
          state.value = null;
          state.internalError = '';
          state.externalError = '';
          syncChrome();
          if (previous != null) call(state.onChange, null, event);
          return;
        }
        var parsed = parseTimeParts(raw, state.seconds);
        if (!parsed) {
          rejectTyped('时间格式无效，应为 ' + (state.seconds ? 'HH:mm:ss' : 'HH:mm') + '。', event);
          return;
        }
        var problem = unitAllowed(parsed);
        if (problem) {
          rejectTyped(problem, event);
          return;
        }
        control.value = timeText(parsed, state.seconds);
        commitTime(parsed, event);
      }

      function defaultDraft() {
        var target = null;
        if (state.value) {
          var parsed = parseTimeParts(state.value, state.seconds);
          if (parsed) {
            target = parsed.total;
            if (!unitAllowed(parsed)) {
              return { hour: parsed.hour, minute: parsed.minute, second: parsed.second };
            }
          }
        }
        if (target == null) {
          var now = new Date();
          target = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        }
        var minutes = minuteValues();
        var seconds = secondValues();
        var best = null;
        var bestDistance = Infinity;
        var first = null;
        for (var hour = 0; hour < 24; hour += 1) {
          for (var minuteIndex = 0; minuteIndex < minutes.length; minuteIndex += 1) {
            var minute = minutes[minuteIndex];
            for (var secondIndex = 0; secondIndex < seconds.length; secondIndex += 1) {
              var second = seconds[secondIndex];
              var total = hour * 3600 + minute * 60 + second;
              var candidate = { hour: hour, minute: minute, second: second };
              if (!first) first = candidate;
              if (bounds.min && total < bounds.min.total) continue;
              if (bounds.max && total > bounds.max.total) continue;
              var distance = Math.abs(total - target);
              if (!best || distance < bestDistance) {
                best = candidate;
                bestDistance = distance;
              }
            }
          }
        }
        return best || first || { hour: 0, minute: 0, second: 0 };
      }

      function draftParts() {
        return {
          hour: draft.hour,
          minute: draft.minute,
          second: draft.second,
          total: draft.hour * 3600 + draft.minute * 60 + draft.second
        };
      }

      function optionDisabled(unit, value) {
        var h = unit === 'hour' ? value : draft.hour;
        var m = unit === 'minute' ? value : draft.minute;
        var s = unit === 'second' ? value : draft.second;
        if (bounds.min) {
          if (unit === 'hour' && h < bounds.min.hour) return true;
          if (unit === 'minute' && h === bounds.min.hour && m < bounds.min.minute) return true;
          if (unit === 'second' && h === bounds.min.hour && m === bounds.min.minute && s < bounds.min.second) return true;
        }
        if (bounds.max) {
          if (unit === 'hour' && h > bounds.max.hour) return true;
          if (unit === 'minute' && h === bounds.max.hour && m > bounds.max.minute) return true;
          if (unit === 'second' && h === bounds.max.hour && m === bounds.max.minute && s > bounds.max.second) return true;
        }
        return false;
      }

      function fillSelect(select, values, selected, unit) {
        if (!select) return;
        var fragment = document.createDocumentFragment();
        values.forEach(function (value) {
          var option = document.createElement('option');
          option.value = pad2(value);
          option.textContent = pad2(value);
          option.disabled = optionDisabled(unit, value);
          if (value === selected) option.selected = true;
          fragment.appendChild(option);
        });
        select.replaceChildren(fragment);
      }

      function renderPanelControls() {
        if (!layer) return;
        fillSelect(hourSelect, hourValues(), draft.hour, 'hour');
        fillSelect(minuteSelect, minuteValues(), draft.minute, 'minute');
        if (state.seconds) fillSelect(secondSelect, secondValues(), draft.second, 'second');
        var parts = draftParts();
        if (draftText) draftText.textContent = '当前选择：' + timeText(parts, state.seconds);
        if (noteEl) {
          var notes = ['本地时间，不做时区换算。'];
          if (bounds.min || bounds.max) notes.push('允许 ' + (state.min || '不限') + ' 至 ' + (state.max || '不限') + '（含端点）');
          notes.push(state.seconds ? ('秒步长 ' + state.step + ' 秒') : ('分钟步长 ' + state.step + ' 分钟'));
          noteEl.textContent = hintJoin(notes);
        }
      }

      function setPanelError(message) {
        if (!panelError) return;
        panelError.textContent = message == null ? '' : String(message);
        setHidden(panelError, !message);
      }

      function readDraftFromSelects() {
        draft.hour = Number(hourSelect.value);
        draft.minute = Number(minuteSelect.value);
        if (state.seconds && secondSelect) draft.second = Number(secondSelect.value);
        else draft.second = 0;
      }

      function handleSelectChange(event) {
        if (destroyed || state.disabled) return;
        readDraftFromSelects();
        var parts = draftParts();
        var problem = unitAllowed(parts);
        if (problem) {
          setPanelError('该组合不可用：' + problem);
          renderPanelControls();
          return;
        }
        setPanelError('');
        commitTime(parts, event);
        renderPanelControls();
      }

      function buildPanel() {
        if (!layer) return;
        panel = layer.el;
        panel.setAttribute('aria-label', '选择时间');
        panelEvents = listen(panel);
        var title = make('h3', 'nui-timepicker__panel-title', '选择时间');
        var units = make('div', 'nui-timepicker__units');

        function unit(labelText, ariaLabel) {
          var wrap = make('label', 'nui-timepicker__unit');
          var label = make('span', 'nui-timepicker__unit-label', labelText);
          var select = make('select', 'nui-timepicker__select');
          select.setAttribute('aria-label', ariaLabel);
          wrap.appendChild(label);
          wrap.appendChild(select);
          units.appendChild(wrap);
          return select;
        }

        hourSelect = unit('时', '小时');
        minuteSelect = unit('分', '分钟');
        var secondUnitSelect = unit('秒', '秒钟');
        secondSelect = secondUnitSelect;
        secondsUnit = secondUnitSelect.closest('.nui-timepicker__unit');
        if (!state.seconds) secondsUnit.hidden = true;

        draftText = make('p', 'nui-timepicker__draft');
        draftText.setAttribute('aria-live', 'polite');
        noteEl = make('p', 'nui-timepicker__note');
        panelError = make('p', 'nui-timepicker__panel-error');
        panelError.setAttribute('role', 'alert');
        panelError.hidden = true;
        doneButton = make('button', 'nui-timepicker__done', '完成');
        doneButton.type = 'button';

        panel.appendChild(title);
        panel.appendChild(units);
        panel.appendChild(draftText);
        panel.appendChild(noteEl);
        panel.appendChild(panelError);
        panel.appendChild(doneButton);

        panelEvents.on('change', function (event) {
          if (event.target === hourSelect || event.target === minuteSelect || event.target === secondSelect) {
            handleSelectChange(event);
          }
        });
        panelEvents.on('click', function (event) {
          if (event.target === doneButton) {
            event.preventDefault();
            closePanel('select');
          }
        });
      }

      function ensureLayer() {
        if (layer) return layer;
        layer = createDialogLayer({
          name: 'NoteUI.TimePicker',
          anchor: trigger,
          className: 'nui-timepicker__panel',
          onOpen: function () {
            state.open = true;
            control.setAttribute('aria-expanded', 'true');
            trigger.setAttribute('aria-expanded', 'true');
            draft = defaultDraft();
            setPanelError('');
            renderPanelControls();
            if (hourSelect) {
              try { hourSelect.focus({ preventScroll: true }); } catch (error) { hourSelect.focus(); }
            }
          },
          onClose: function () {
            state.open = false;
            control.setAttribute('aria-expanded', 'false');
            trigger.setAttribute('aria-expanded', 'false');
          }
        });
        buildPanel();
        return layer;
      }

      function openPanel() {
        if (destroyed || state.disabled) return;
        ensureLayer();
        if (layer.isOpen()) {
          draft = defaultDraft();
          renderPanelControls();
          return;
        }
        if (!root.contains(document.activeElement)) trigger.focus();
        layer.open();
      }

      function closePanel(reason) {
        if (layer && layer.isOpen()) layer.close(reason || 'api', { restoreFocus: true });
      }

      function clearValue(event) {
        if (destroyed || state.disabled) return;
        var had = state.value != null || control.value !== '';
        state.value = null;
        state.internalError = '';
        state.externalError = '';
        control.value = '';
        closePanel('api');
        syncChrome();
        if (had) call(state.onChange, null, event);
        control.focus();
      }

      rootEvents.on('click', function (event) {
        if (event.target === trigger || (trigger.contains && trigger.contains(event.target))) {
          event.preventDefault();
          if (layer && layer.isOpen()) closePanel('api');
          else openPanel();
          return;
        }
        if (event.target === clearButton || (clearButton.contains && clearButton.contains(event.target))) {
          event.preventDefault();
          clearValue(event);
        }
      });
      rootEvents.on('input', function (event) {
        if (event.target !== control) return;
        state.internalError = '';
        state.externalError = '';
        syncChrome();
      });
      rootEvents.on('blur', function (event) {
        if (event.target === control) commitText(event);
      }, true);
      rootEvents.on('keydown', function (event) {
        if (event.target !== control) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          commitText(event);
        } else if (event.key === 'ArrowDown' && event.altKey) {
          event.preventDefault();
          openPanel();
        }
      });
      guardTriggerPointer(trigger, docEvents, function () { return Boolean(layer && layer.isOpen()); });

      loadValue(input.value);
      syncChrome();
      host.appendChild(root);

      var instance = component(root, state, function (patch) {
        var structural = own(patch, 'seconds');
        if (own(patch, 'step')) {
          var stepNumber = Math.floor(Number(state.step));
          if (!isFinite(stepNumber) || stepNumber < 1) stepNumber = state.seconds ? 30 : 15;
          if (stepNumber > 60) stepNumber = 60;
          state.step = stepNumber;
        }
        if (own(patch, 'seconds')) state.seconds = Boolean(state.seconds);
        if (own(patch, 'min') || own(patch, 'max') || own(patch, 'seconds')) bounds = normalizeBounds();
        if (own(patch, 'disabled')) {
          state.disabled = Boolean(state.disabled);
          if (state.disabled) closePanel('api');
        }
        if (own(patch, 'clearable')) state.clearable = state.clearable !== false;
        if (own(patch, 'error')) state.externalError = state.error == null ? '' : String(state.error);
        if (structural) {
          closePanel('api');
          if (layer) {
            if (panelEvents) panelEvents.clear();
            layer.destroy();
            layer = null;
            panel = null;
          }
          if (!own(patch, 'value') && state.value) {
            var loose = parseLooseTimeParts(state.value);
            state.value = loose ? timeText(loose, state.seconds) : null;
          }
        }
        if (own(patch, 'value') || structural) loadValue(state.value);
        syncChrome();
        if (layer && layer.isOpen()) {
          renderPanelControls();
          setPanelError('');
        }
      }, function () {
        rootEvents.clear();
        docEvents.clear();
        if (panelEvents) panelEvents.clear();
        if (layer) {
          layer.destroy();
          layer = null;
          panel = null;
        }
      });

      instance.getValue = function () { return state.value; };
      instance.setError = setError;
      instance.getError = function () { return externalErrorText(state); };
      instance.open = function () { openPanel(); };
      instance.close = function () { closePanel('api'); };
      instance.focus = function () { control.focus(); };
      return instance;
    }
  };

})(window);

/* ---- source: src/ui/forms-advanced-inputs.js ---- */
/* NoteUI forms-advanced inputs — F14–F15: ColorPicker, FileInput.
   Plain browser script (no framework, no external libraries).
   F14 使用原生 input[type=color]，F15 使用原生 input[type=file]；
   私有共享 helper 位于 forms-advanced-internal.js，必须先加载。
   模块清单 NoteUI.formsAdvanced 定义在本文件末尾。
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
  /* F14 ColorPicker                                                    */
  /* ------------------------------------------------------------------ */

  var DEFAULT_PALETTE = [
    '#1f2937', '#475569', '#94a3b8', '#e2e8f0', '#ffffff', '#000000',
    '#b91c1c', '#dc2626', '#ea580c', '#ca8a04', '#15803d', '#0d9488',
    '#2563eb', '#315cda', '#7c3aed', '#db2777'
  ];

  function normalizeHexColor(raw) {
    if (typeof raw !== 'string') return null;
    var value = raw.trim();
    var short = /^#([0-9a-fA-F]{3})$/.exec(value);
    if (short) {
      var expanded = short[1].toLowerCase().split('').map(function (character) {
        return character + character;
      }).join('');
      return '#' + expanded;
    }
    var full = /^#([0-9a-fA-F]{6})$/.exec(value);
    return full ? '#' + full[1].toLowerCase() : null;
  }

  function relativeLuminance(hex) {
    var value = normalizeHexColor(hex);
    if (!value) return 0;
    var rgb = [1, 3, 5].map(function (index) {
      var channel = parseInt(value.slice(index, index + 2), 16) / 255;
      return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  }

  NoteUI.ColorPicker = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var input = options && typeof options === 'object' ? options : {};
      var state = readOptions(input, {
        value: null,
        palette: DEFAULT_PALETTE.slice(),
        label: '颜色',
        hint: '',
        disabled: false,
        disabledReason: '',
        clearable: true,
        onChange: null,
        externalError: '',
        internalError: '',
        textInvalid: false
      });
      if (input.error != null) state.externalError = text(input.error);
      state.disabled = Boolean(state.disabled);
      state.clearable = state.clearable !== false;
      if (state.palette == null) state.palette = DEFAULT_PALETTE.slice();
      if (!Array.isArray(state.palette)) state.palette = [];
      state.palette = state.palette.map(normalizeHexColor).filter(Boolean);

      var base = uid('nui-colorpicker');
      var labelId = base + '-label';
      var hintId = base + '-hint';
      var errorId = base + '-error';
      var root = make('div', 'nui-colorpicker');
      var head = labelRow('nui-colorpicker', state.label, false, labelId);
      var paletteGroup = make('div', 'nui-colorpicker__palette');
      var row = make('div', 'nui-colorpicker__row');
      var nativeWrap = make('label', 'nui-colorpicker__native-wrap');
      var nativeText = make('span', 'nui-colorpicker__native-label', '系统拾色器');
      var nativeInput = make('input', 'nui-colorpicker__native');
      var textWrap = make('label', 'nui-colorpicker__text-wrap');
      var textLabel = make('span', 'nui-colorpicker__text-label', '颜色值');
      var control = make('input', 'nui-colorpicker__input');
      var clearButton = make('button', 'nui-colorpicker__clear', '清空');
      var status = make('div', 'nui-colorpicker__status');
      var preview = make('span', 'nui-colorpicker__preview');
      var readout = make('span', 'nui-colorpicker__readout');
      var hintEl = messageLine('nui-colorpicker', 'hint', hintId);
      var errorEl = messageLine('nui-colorpicker', 'error', errorId);
      var rootEvents = listen(root);
      var paletteButtons = [];
      var destroyed = false;

      root.appendChild(head);
      paletteGroup.setAttribute('role', 'group');
      paletteGroup.setAttribute('aria-label', '预设颜色');
      root.appendChild(paletteGroup);
      row.appendChild(nativeWrap);
      nativeWrap.appendChild(nativeText);
      nativeInput.type = 'color';
      nativeInput.value = '#000000';
      nativeInput.setAttribute('aria-label', '使用系统拾色器选择颜色');
      nativeWrap.appendChild(nativeInput);
      row.appendChild(textWrap);
      textWrap.appendChild(textLabel);
      control.type = 'text';
      control.autocomplete = 'off';
      control.spellcheck = false;
      control.setAttribute('aria-label', '颜色值，支持 #rgb 或 #rrggbb');
      textWrap.appendChild(control);
      row.appendChild(clearButton);
      clearButton.type = 'button';
      clearButton.setAttribute('aria-label', '清空颜色');
      root.appendChild(row);
      status.appendChild(preview);
      status.appendChild(readout);
      root.appendChild(status);
      root.appendChild(hintEl);
      root.appendChild(errorEl);

      function hintText() {
        return hintWithReason(state, [
          '支持 #rgb 与 #rrggbb 输入；输出统一为 #rrggbb。不支持透明度（alpha），#rgba/#rrggbbaa 与 rgba() 会被拒绝。'
        ]);
      }

      function renderMessages() {
        syncMessages({
          hintEl: hintEl,
          hint: hintText(),
          errorEl: errorEl,
          error: externalErrorText(state),
          nodes: [control, nativeInput, clearButton],
          hintId: hintId,
          errorId: errorId,
          hintAlways: true
        });
      }

      function buildPalette() {
        paletteGroup.replaceChildren();
        paletteButtons = [];
        if (!state.palette.length) {
          paletteGroup.hidden = true;
          return;
        }
        paletteGroup.hidden = false;
        state.palette.forEach(function (color) {
          var button = make('button', 'nui-colorpicker__swatch');
          button.type = 'button';
          button.dataset.color = color;
          button.setAttribute('aria-label', '预设颜色 ' + color);
          button.setAttribute('aria-pressed', 'false');
          button.title = color;
          button.style.backgroundColor = color;
          var check = make('span', 'nui-colorpicker__swatch-check', '✓');
          check.setAttribute('aria-hidden', 'true');
          check.style.color = relativeLuminance(color) > 0.55 ? '#111827' : '#ffffff';
          button.appendChild(check);
          paletteGroup.appendChild(button);
          paletteButtons.push(button);
        });
      }

      function syncChrome() {
        var disabled = Boolean(state.disabled);
        root.classList.toggle('nui-colorpicker--disabled', disabled);
        syncHeadLabel(head, '.nui-colorpicker__label', state.label);
        var colorPrefix = text(state.label) ? text(state.label) + '：' : '';
        nativeInput.setAttribute('aria-label', colorPrefix + '系统拾色器');
        control.setAttribute('aria-label', colorPrefix + '颜色值，支持 #rgb 或 #rrggbb');
        clearButton.setAttribute('aria-label', colorPrefix + '清空颜色');
        paletteGroup.setAttribute('aria-label', colorPrefix + '预设颜色');
        nativeInput.disabled = disabled;
        control.disabled = disabled;
        clearButton.disabled = disabled;
        var hasText = control.value !== '';
        clearButton.hidden = !(state.clearable && !disabled && (hasText || state.value != null || state.textInvalid));
        paletteButtons.forEach(function (button) {
          button.disabled = disabled;
          var selected = !state.textInvalid && state.value === button.dataset.color;
          button.setAttribute('aria-pressed', selected ? 'true' : 'false');
          button.classList.toggle('nui-colorpicker__swatch--selected', selected);
        });
        var visibleValue = state.textInvalid ? null : state.value;
        if (visibleValue) {
          preview.style.backgroundColor = visibleValue;
          preview.classList.remove('nui-colorpicker__preview--empty');
          readout.textContent = '当前颜色 ' + visibleValue;
        } else {
          preview.style.removeProperty('background-color');
          preview.classList.add('nui-colorpicker__preview--empty');
          readout.textContent = state.textInvalid ? '文本值尚未通过校验' : '未选择颜色';
        }
        nativeInput.value = state.value || '#000000';
        renderMessages();
      }

      function loadValue(raw) {
        state.internalError = '';
        state.textInvalid = false;
        if (raw == null || raw === '') {
          state.value = null;
          control.value = '';
          return;
        }
        var normalized = normalizeHexColor(raw);
        if (!normalized) {
          state.value = null;
          state.textInvalid = true;
          state.internalError = '颜色格式无效。仅支持 #rgb 或 #rrggbb，且不支持透明度（alpha）。';
          control.value = text(raw);
          return;
        }
        state.value = normalized;
        control.value = normalized;
      }

      function setValue(next, event) {
        var previous = state.value;
        var wasInvalid = state.textInvalid;
        state.value = next;
        state.textInvalid = false;
        state.internalError = '';
        control.value = next || '';
        syncChrome();
        if (previous !== state.value || wasInvalid) call(state.onChange, state.value, event);
      }

      function handlePaletteClick(event) {
        if (destroyed || state.disabled) return;
        var button = event.target.closest ? event.target.closest('[data-color]') : null;
        if (!button || !paletteGroup.contains(button)) return;
        var color = normalizeHexColor(button.dataset.color);
        if (!color) return;
        state.externalError = '';
        setValue(color, event);
      }

      function handleNativeInput(event) {
        if (destroyed || state.disabled) return;
        var color = normalizeHexColor(nativeInput.value);
        if (!color) return;
        state.externalError = '';
        setValue(color, event);
      }

      function handleTextInput(event) {
        if (destroyed || state.disabled) return;
        var raw = control.value.trim();
        state.externalError = '';
        if (raw === '') {
          var previous = state.value;
          var wasInvalid = state.textInvalid;
          state.value = null;
          state.textInvalid = false;
          state.internalError = '';
          syncChrome();
          if (previous !== null || wasInvalid) call(state.onChange, null, event);
          return;
        }
        var normalized = normalizeHexColor(raw);
        if (!normalized) {
          state.textInvalid = true;
          state.internalError = '颜色格式无效。仅支持 #rgb 或 #rrggbb，且不支持透明度（alpha）。';
          syncChrome();
          return;
        }
        state.textInvalid = false;
        state.internalError = '';
        var before = state.value;
        state.value = normalized;
        syncChrome();
        if (before !== normalized) call(state.onChange, normalized, event);
      }

      function handleTextBlur() {
        if (destroyed) return;
        if (state.textInvalid) {
          var previous = state.value;
          state.value = null;
          state.textInvalid = false;
          syncChrome();
          if (previous !== null) call(state.onChange, null, null);
          return;
        }
        if (state.value && normalizeHexColor(control.value) === state.value) control.value = state.value;
      }

      function clearValue(event) {
        if (destroyed || state.disabled) return;
        var had = state.value != null || state.textInvalid || control.value !== '';
        state.value = null;
        state.textInvalid = false;
        state.internalError = '';
        state.externalError = '';
        control.value = '';
        syncChrome();
        if (had) call(state.onChange, null, event);
        control.focus();
      }

      rootEvents.on('click', function (event) {
        if (event.target === clearButton || (clearButton.contains && clearButton.contains(event.target))) {
          event.preventDefault();
          clearValue(event);
          return;
        }
        if (event.target.closest && event.target.closest('[data-color]')) handlePaletteClick(event);
      });
      rootEvents.on('input', function (event) {
        if (event.target === nativeInput) handleNativeInput(event);
        else if (event.target === control) handleTextInput(event);
      });
      rootEvents.on('blur', function (event) {
        if (event.target === control) handleTextBlur();
      }, true);

      buildPalette();
      loadValue(input.value);
      syncChrome();
      host.appendChild(root);

      var instance = component(root, state, function (patch) {
        if (own(patch, 'palette')) {
          state.palette = Array.isArray(state.palette) ? state.palette.map(normalizeHexColor).filter(Boolean) : [];
          buildPalette();
        }
        if (own(patch, 'disabled')) state.disabled = Boolean(state.disabled);
        if (own(patch, 'clearable')) state.clearable = state.clearable !== false;
        if (own(patch, 'error')) state.externalError = state.error == null ? '' : String(state.error);
        if (own(patch, 'value')) loadValue(state.value);
        syncChrome();
      }, function () {
        rootEvents.clear();
      });

      instance.getValue = function () {
        return state.textInvalid ? null : state.value;
      };
      instance.setError = function (message) {
        state.externalError = message == null ? '' : String(message);
        renderMessages();
      };
      instance.getError = function () { return externalErrorText(state); };
      instance.focus = function () { control.focus(); };
      return instance;
    }
  };

  /* ------------------------------------------------------------------ */
  /* F15 FileInput                                                      */
  /* ------------------------------------------------------------------ */

  function formatBytes(bytes) {
    var number = Number(bytes);
    if (!isFinite(number) || number < 0) return '未知大小';
    if (number < 1024) return number + ' B';
    if (number < 1024 * 1024) return (Math.round(number / 1024 * 10) / 10) + ' KB';
    if (number < 1024 * 1024 * 1024) return (Math.round(number / (1024 * 1024) * 10) / 10) + ' MB';
    return (Math.round(number / (1024 * 1024 * 1024) * 10) / 10) + ' GB';
  }

  function parseAcceptTokens(accept) {
    return text(accept).split(',').map(function (token) {
      return token.trim().toLowerCase();
    }).filter(Boolean);
  }

  function fileMatchesAccept(file, tokens) {
    if (!tokens.length) return true;
    var name = text(file && file.name).toLowerCase();
    var type = text(file && file.type).toLowerCase();
    for (var i = 0; i < tokens.length; i += 1) {
      var token = tokens[i];
      if (!token) continue;
      if (token.charAt(0) === '.') {
        if (name.slice(-token.length) === token) return true;
      } else if (token.slice(-2) === '/*') {
        if (type.indexOf(token.slice(0, -1)) === 0) return true;
      } else if (token.indexOf('*') >= 0) {
        var pattern = '^' + token.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
        if (new RegExp(pattern).test(type)) return true;
      } else if (type === token) {
        return true;
      }
    }
    return false;
  }

  NoteUI.FileInput = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var input = options && typeof options === 'object' ? options : {};
      var state = readOptions(input, {
        files: [],
        multiple: false,
        accept: '',
        maxSize: null,
        maxFiles: null,
        label: '文件',
        hint: '',
        disabled: false,
        disabledReason: '',
        onChange: null,
        errors: []
      });
      state.multiple = Boolean(state.multiple);
      state.disabled = Boolean(state.disabled);
      state.accept = text(state.accept);
      state.files = Array.isArray(state.files) ? state.files.slice() : [];
      var maxSize = Number(state.maxSize);
      state.maxSize = isFinite(maxSize) && maxSize > 0 ? Math.floor(maxSize) : null;
      var maxFiles = Math.floor(Number(state.maxFiles));
      state.maxFiles = isFinite(maxFiles) && maxFiles > 0 ? maxFiles : null;

      var base = uid('nui-fileinput');
      var hintId = base + '-hint';
      var errorId = base + '-error';
      var root = make('div', 'nui-fileinput');
      var head = labelRow('nui-fileinput', state.label, false, base + '-label');
      var dropButton = make('button', 'nui-fileinput__drop');
      var dropTitle = make('span', 'nui-fileinput__drop-title', '选择文件');
      var dropText = make('span', 'nui-fileinput__drop-text', '或将文件拖放到此区域');
      var nativeInput = make('input', 'nui-fileinput__native');
      var meta = make('div', 'nui-fileinput__meta');
      var hintEl = make('p', 'nui-fileinput__hint');
      var countEl = make('span', 'nui-fileinput__count');
      var errorBox = make('div', 'nui-fileinput__errors');
      var list = make('ul', 'nui-fileinput__list');
      var emptyItem = make('li', 'nui-fileinput__empty', '尚未选择文件');
      var note = make('p', 'nui-fileinput__note', '仅在浏览器内选择，不会上传到服务器。');
      var clearAll = make('button', 'nui-fileinput__clear-all', '全部清除');
      var events = listen(root);
      var destroyed = false;
      var dragDepth = 0;

      hintEl.id = hintId;
      errorBox.id = errorId;
      errorBox.setAttribute('role', 'alert');
      errorBox.hidden = true;
      list.setAttribute('aria-label', '已选文件');
      list.appendChild(emptyItem);
      dropButton.type = 'button';
      dropButton.setAttribute('aria-describedby', hintId + ' ' + errorId);
      dropTitle.setAttribute('aria-hidden', 'true');
      dropText.setAttribute('aria-hidden', 'true');
      dropButton.appendChild(dropTitle);
      dropButton.appendChild(dropText);
      nativeInput.type = 'file';
      nativeInput.hidden = true;
      nativeInput.tabIndex = -1;
      countEl.setAttribute('role', 'status');
      countEl.setAttribute('aria-live', 'polite');
      clearAll.type = 'button';
      clearAll.hidden = true;

      root.appendChild(head);
      root.appendChild(dropButton);
      root.appendChild(nativeInput);
      meta.appendChild(hintEl);
      meta.appendChild(countEl);
      root.appendChild(meta);
      root.appendChild(errorBox);
      root.appendChild(list);
      root.appendChild(clearAll);
      root.appendChild(note);

      function acceptTokens() {
        return parseAcceptTokens(state.accept);
      }

      function typeHint() {
        return state.accept ? '允许类型：' + state.accept : '文件类型不限';
      }

      function renderHint() {
        var parts = [typeHint()];
        if (state.maxSize) parts.push('单个文件不超过 ' + formatBytes(state.maxSize));
        if (state.maxFiles) parts.push('最多 ' + state.maxFiles + ' 个文件');
        if (!state.multiple) parts.push('单文件模式；拖入多个时只接受第一个');
        hintEl.textContent = hintWithReason(state, parts);
      }

      function syncChrome() {
        var disabled = Boolean(state.disabled);
        root.classList.toggle('nui-fileinput--disabled', disabled);
        syncHeadLabel(head, '.nui-fileinput__label', state.label);
        dropButton.disabled = disabled;
        nativeInput.disabled = disabled;
        nativeInput.multiple = Boolean(state.multiple);
        nativeInput.accept = state.accept;
        dropTitle.textContent = state.multiple ? '选择文件（可多选）' : '选择文件';
        dropText.textContent = dragDepth > 0 ? '松开以添加文件' : '或将文件拖放到此区域';
        var filePrefix = text(state.label) ? text(state.label) + '：' : '';
        dropButton.setAttribute('aria-label', filePrefix + (state.multiple ? '选择本地文件，可多选' : '选择本地文件'));
        clearAll.setAttribute('aria-label', filePrefix + '全部清除');
        countEl.textContent = '已选 ' + state.files.length + ' 个文件';
        clearAll.hidden = !(state.files.length && !disabled);
        clearAll.disabled = disabled;
        var total = 0;
        state.files.forEach(function (file) { total += Number(file.size) || 0; });
        countEl.title = state.files.length ? '合计 ' + formatBytes(total) : '';
        renderHint();
        renderErrors();
        renderFiles();
        if (errorBox.hidden) removeDescribedBy(dropButton, errorId);
        else addDescribedBy(dropButton, errorId);
      }

      function renderErrors() {
        errorBox.replaceChildren();
        if (!state.errors.length) {
          errorBox.hidden = true;
          return;
        }
        errorBox.hidden = false;
        var title = make('p', 'nui-fileinput__errors-title', '以下文件未添加：');
        var errorList = make('ul', 'nui-fileinput__error-list');
        state.errors.forEach(function (item) {
          var li = make('li', 'nui-fileinput__error-item');
          var name = make('strong', 'nui-fileinput__error-name', item.file ? item.file.name : '文件');
          li.appendChild(name);
          li.appendChild(document.createTextNode('：' + item.reason));
          errorList.appendChild(li);
        });
        errorBox.appendChild(title);
        errorBox.appendChild(errorList);
      }

      function renderFiles() {
        list.replaceChildren();
        if (!state.files.length) {
          list.appendChild(make('li', 'nui-fileinput__empty', '尚未选择文件'));
          return;
        }
        state.files.forEach(function (file, index) {
          var li = make('li', 'nui-fileinput__file');
          var main = make('div', 'nui-fileinput__file-main');
          var name = make('span', 'nui-fileinput__file-name', file.name);
          var metaLine = make('span', 'nui-fileinput__file-meta',
            formatBytes(file.size) + ' · ' + (text(file.type) || '未知类型'));
          main.appendChild(name);
          main.appendChild(metaLine);
          var remove = make('button', 'nui-fileinput__remove', '移除');
          remove.type = 'button';
          remove.disabled = Boolean(state.disabled);
          remove.setAttribute('aria-label', '移除 ' + file.name);
          remove.dataset.fileIndex = String(index);
          li.appendChild(main);
          li.appendChild(remove);
          list.appendChild(li);
        });
      }

      function sameFiles(a, b) {
        return a.length === b.length && a.every(function (file, index) { return file === b[index]; });
      }

      function filesChanged(next, event) {
        var previous = state.files;
        state.files = next;
        syncChrome();
        if (!sameFiles(previous, state.files)) call(state.onChange, state.files.slice(), event);
      }

      function reject(file, reason) {
        state.errors.push({ file: file, reason: reason });
      }

      function processFiles(fileList, event) {
        if (destroyed || state.disabled) return;
        var incoming = Array.prototype.slice.call(fileList || []).filter(function (file) {
          return file && typeof file === 'object' && typeof file.name === 'string';
        });
        if (!incoming.length) return;
        state.errors = [];
        var tokens = acceptTokens();
        var multiple = Boolean(state.multiple);
        var limit = multiple ? (state.maxFiles == null ? Infinity : state.maxFiles) : 1;
        var base = multiple ? state.files.slice() : [];
        var slots = Math.max(0, limit - base.length);
        var accepted = [];
        var candidates = multiple ? incoming : incoming.slice(0, 1);
        if (!multiple && incoming.length > 1) {
          incoming.slice(1).forEach(function (file) { reject(file, '单文件模式只接受第一个文件'); });
        }
        candidates.forEach(function (file) {
          if (slots <= 0) {
            reject(file, state.maxFiles == null ? '只允许选择 1 个文件' : ('已达到最多 ' + state.maxFiles + ' 个文件'));
            return;
          }
          if (!fileMatchesAccept(file, tokens)) {
            reject(file, '类型不符合（' + (state.accept || '未限制类型') + '）');
            return;
          }
          if (state.maxSize && Number(file.size) > state.maxSize) {
            reject(file, '大小超过上限（' + formatBytes(state.maxSize) + '）');
            return;
          }
          accepted.push(file);
          slots -= 1;
        });
        // 单选模式下如果所有候选都被拒绝，保留原清单（拒绝不清空已有文件）。
        var next = multiple ? base.concat(accepted) : (accepted.length ? accepted.slice(0, 1) : state.files);
        if (sameFiles(state.files, next)) syncChrome();
        else filesChanged(next, event);
      }

      function setDragActive(active) {
        root.classList.toggle('nui-fileinput--dragover', active);
        dropText.textContent = active ? '松开以添加文件' : '或将文件拖放到此区域';
      }

      function resetDrag() {
        dragDepth = 0;
        setDragActive(false);
      }

      events.on('click', function (event) {
        if (event.target === dropButton || (dropButton.contains && dropButton.contains(event.target))) {
          if (state.disabled) return;
          event.preventDefault();
          nativeInput.click();
          return;
        }
        if (event.target === clearAll || (clearAll.contains && clearAll.contains(event.target))) {
          event.preventDefault();
          clear(event);
          return;
        }
        var remove = event.target.closest ? event.target.closest('[data-file-index]') : null;
        if (remove && list.contains(remove) && !state.disabled) {
          event.preventDefault();
          removeFile(Number(remove.dataset.fileIndex), event);
        }
      });

      events.on('change', function (event) {
        if (event.target !== nativeInput) return;
        var selected = Array.prototype.slice.call(nativeInput.files || []);
        nativeInput.value = '';
        processFiles(selected, event);
        var active = document.activeElement;
        if (!active || active === document.body || active === nativeInput || !root.contains(active)) {
          dropButton.focus();
        }
      });

      function insideDropArea(event) {
        return event.target === dropButton || dropButton.contains(event.target);
      }

      events.on('dragenter', function (event) {
        event.preventDefault();
        if (state.disabled || !insideDropArea(event)) return;
        dragDepth += 1;
        setDragActive(true);
      });
      events.on('dragover', function (event) {
        event.preventDefault();
        if (state.disabled || !insideDropArea(event)) return;
        if (event.dataTransfer) {
          try { event.dataTransfer.dropEffect = 'copy'; } catch (error) { /* read-only in some browsers */ }
        }
      });
      events.on('dragleave', function (event) {
        if (state.disabled || !insideDropArea(event)) return;
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) setDragActive(false);
      });
      events.on('drop', function (event) {
        event.preventDefault();
        if (state.disabled || !insideDropArea(event)) return;
        resetDrag();
        var files = event.dataTransfer ? Array.prototype.slice.call(event.dataTransfer.files || []) : [];
        processFiles(files, event);
      });

      function removeFile(index, event) {
        if (index < 0 || index >= state.files.length) return;
        state.errors = [];
        var next = state.files.slice();
        next.splice(index, 1);
        filesChanged(next, event);
        var buttons = list.querySelectorAll('[data-file-index]');
        var target = buttons[Math.min(index, buttons.length - 1)];
        if (target) target.focus();
        else dropButton.focus();
      }

      function clear(event) {
        if (destroyed || state.disabled) return;
        var had = state.files.length > 0;
        state.files = [];
        state.errors = [];
        nativeInput.value = '';
        syncChrome();
        if (event && had) call(state.onChange, [], event);
        dropButton.focus();
      }

      syncChrome();
      host.appendChild(root);

      var instance = component(root, state, function (patch) {
        if (own(patch, 'multiple')) state.multiple = Boolean(state.multiple);
        if (own(patch, 'accept')) state.accept = text(state.accept);
        if (own(patch, 'maxSize')) {
          var maxSizeValue = Number(state.maxSize);
          state.maxSize = isFinite(maxSizeValue) && maxSizeValue > 0 ? Math.floor(maxSizeValue) : null;
        }
        if (own(patch, 'maxFiles')) {
          var maxFilesValue = Math.floor(Number(state.maxFiles));
          state.maxFiles = isFinite(maxFilesValue) && maxFilesValue > 0 ? maxFilesValue : null;
        }
        if (own(patch, 'disabled')) {
          state.disabled = Boolean(state.disabled);
          if (state.disabled) resetDrag();
        }
        if (own(patch, 'files')) {
          state.files = Array.isArray(state.files) ? state.files.slice() : [];
          state.errors = [];
        }
        nativeInput.value = '';
        syncChrome();
      }, function () {
        events.clear();
        resetDrag();
        state.files = [];
        state.errors = [];
        nativeInput.value = '';
      });

      instance.getValue = function () { return state.files.slice(); };
      instance.clear = function (event) { clear(event); };
      instance.focus = function () { dropButton.focus(); };
      return instance;
    }
  };

  NoteUI.formsAdvanced = {
    version: '1.0.0',
    components: ['Switch', 'Slider', 'Form', 'DatePicker', 'TimePicker', 'ColorPicker', 'FileInput']
  };

})(window);
