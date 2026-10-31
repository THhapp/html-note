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
