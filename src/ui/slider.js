/* NoteUI forms-advanced — F10 Slider（滑块）。
 * 从 src/ui/forms-advanced.js 拆出；只依赖 forms-advanced-internal.js 的公共内部 helper
 * 与 NoteCore；不复制其他表单组件实现，也不另造字段/消息框架。
 * Programmatic update() never fires onChange；坏 segments/ticks 在写入 state/DOM 前失败。
 * 依赖顺序：forms-advanced-internal.js -> slider.js（Form 的 slider 字段在运行期使用 NoteUI.Slider）。
 * 经典脚本，无模块 / 无网络 / 无 eval。 */
(function (global) {
  'use strict';

  var NoteUI = global.NoteUI = global.NoteUI || {};

  var Internal = NoteUI._formsAdvancedInternal;
  if (!Internal) throw new Error('NoteUI Slider 组件文件需要在 forms-advanced-internal.js 之后加载。');
  var own = Internal.own;
  var text = Internal.text;
  var hintWithReason = Internal.hintWithReason;
  var make = Internal.make;
  var uid = Internal.uid;
  var validateHost = Internal.validateHost;
  var listen = Internal.listen;
  var component = Internal.component;
  var call = Internal.call;
  var labelRow = Internal.labelRow;
  var messageLine = Internal.messageLine;
  var syncMessages = Internal.syncMessages;
  var readOptions = Internal.readOptions;


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

})(window);
