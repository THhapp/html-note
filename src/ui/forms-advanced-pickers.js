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
