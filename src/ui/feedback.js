/*!
 * NoteUI 反馈与状态 · feedback.js
 *
 * S01 NoteUI.Toast    短消息（含全局区域与局部 mount 区域）
 * S02 NoteUI.Progress 确定 / 不确定进度
 * S03 NoteUI.Spinner  局部加载
 * S04 NoteUI.Skeleton 加载占位
 * S05 NoteUI.Empty    空内容 / 无结果 / 未配置
 * S06 NoteUI.Result   宿主给定的结果说明
 *
 * 依赖：NoteCore（必须先加载 core.js / icons-data.js / icons.js / motion.js / floating.js）。
 * 公开接口与生命周期遵循《00-接口与文件契约》§4、§9。字符串内容一律按纯文本处理；
 * 宿主传入的 DOM 节点会被移入组件，而不是克隆。
 */
(function (global) {
  'use strict';

  var NoteUI = global.NoteUI = global.NoteUI || {};
  var NoteCore = global.NoteCore;
  if (!NoteCore) throw new Error('NoteUI feedback 组件需要先加载 NoteCore（core 模块）。');
  var VERSION = '1.0.0';
  var hasOwn = NoteCore.own;

  /* core 模块已提供这些工具；反馈组件不再复制回退实现。 */
  function element(tag, className, value) {
    return NoteCore.el(tag, className, value);
  }

  function text(value) {
    return NoteCore.text(value);
  }

  function isNode(value) {
    return NoteCore.isNode(value);
  }

  function setContent(target, value) {
    NoteCore.setContent(target, value);
  }

  function clearNode(target) {
    NoteCore.clear(target);
  }

  function uniqueId(prefix) {
    return NoteCore.uid(prefix);
  }

  function normalizeCount(value, fallback) {
    var number = Number(value);
    if (!isFinite(number) || number < 1) return fallback;
    return Math.min(50, Math.floor(number));
  }

  function cssLength(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'number' && isFinite(value) && value >= 0) return value + 'px';
    var string = text(value).trim();
    return string || null;
  }

  function bind(target, type, handler, options, cleanups) {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(type, handler, options);
    if (cleanups) {
      cleanups.push(function () {
        target.removeEventListener(type, handler, options);
      });
    }
  }

  function call(fn) {
    if (typeof fn !== 'function') return undefined;
    var args = Array.prototype.slice.call(arguments, 1);
    return fn.apply(null, args);
  }

  /* ---------------------------------------------------------------------
   * S01 Toast
   * ------------------------------------------------------------------- */

  var TOAST_TONES = {
    success: { label: '成功', glyph: '✓', duration: 5000 },
    error: { label: '失败', glyph: '×', duration: 0 },
    warning: { label: '提醒', glyph: '!', duration: 8000 },
    info: { label: '信息', glyph: 'i', duration: 5000 }
  };
  var TOAST_DEFAULT_MAX = 4;
  var toastGlobalConfig = { max: TOAST_DEFAULT_MAX, label: '通知' };
  var toastGlobalRegion = null;

  function normalizeToastTone(value) {
    return hasOwn(TOAST_TONES, value) ? value : 'info';
  }

  function normalizeToastMax(value, fallback) {
    var number = Number(value);
    if (!isFinite(number) || number < 1) return fallback;
    return Math.max(1, Math.floor(number));
  }

  function resolveToastDuration(value, tone) {
    if (value === undefined || value === null) return TOAST_TONES[tone].duration;
    if (value === Infinity) return 0;
    var number = Number(value);
    if (!isFinite(number) || number < 0) return TOAST_TONES[tone].duration;
    return number === 0 ? 0 : number;
  }

  function createToastRegion(host, options, isGlobal, onEmpty) {
    var settings = options || {};
    var state = {
      max: normalizeToastMax(settings.max, TOAST_DEFAULT_MAX),
      label: text(settings.label) || '通知'
    };
    var root = element('div', 'nui-toast-region ' + (isGlobal ? 'nui-toast-region--global' : 'nui-toast-region--local'));
    var active = [];
    var destroyed = false;

    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', state.label);
    host.appendChild(root);

    function removeEntry(entry) {
      var index = active.indexOf(entry);
      if (index >= 0) active.splice(index, 1);
      if (!destroyed && active.length === 0 && typeof onEmpty === 'function') onEmpty(region);
    }

    function trim() {
      var guard = 0;
      while (!destroyed && active.length > state.max && guard < 100) {
        guard += 1;
        var oldest = active[0];
        if (!oldest) break;
        oldest.close('overflow');
        if (active[0] === oldest) break;
      }
    }

    function createEntry(input, tone) {
      var entryClosed = false;
      var entryEl = element('div', 'nui-toast');
      var marker = element('span', 'nui-toast__marker');
      var body = element('div', 'nui-toast__body');
      var toneEl = element('span', 'nui-toast__tone');
      var message = element('div', 'nui-toast__message');
      var actions = element('div', 'nui-toast__actions');
      var closeButton = null;
      var timer = null;
      var remaining = 0;
      var startedAt = 0;
      var hovered = false;
      var focused = false;
      var cleanups = [];
      var entryRecord = null;

      marker.setAttribute('aria-hidden', 'true');
      entryEl.dataset.tone = tone;
      entryEl.setAttribute('role', tone === 'error' ? 'alert' : 'status');
      entryEl.setAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite');
      entryEl.setAttribute('aria-atomic', 'true');
      toneEl.textContent = TOAST_TONES[tone].label;
      marker.textContent = TOAST_TONES[tone].glyph;
      setContent(message, input.message);
      message.hidden = input.message == null || (typeof input.message === 'string' && input.message === '');
      actions.hidden = true;

      function pauseTimer() {
        if (!timer) return;
        remaining = Math.max(0, remaining - (Date.now() - startedAt));
        global.clearTimeout(timer);
        timer = null;
        startedAt = 0;
        entryEl.setAttribute('data-timer-paused', 'true');
      }

      function timerTick() {
        timer = null;
        startedAt = 0;
        if (!entryClosed) closeEntry('timeout');
      }

      function resumeTimer() {
        if (entryClosed || timer) return;
        if (hovered || focused) return;
        if (remaining <= 0) {
          closeEntry('timeout');
          return;
        }
        startedAt = Date.now();
        timer = global.setTimeout(timerTick, remaining);
        entryEl.removeAttribute('data-timer-paused');
      }

      function startTimer(duration) {
        remaining = duration;
        if (remaining <= 0) return;
        resumeTimer();
      }

      function closeEntry(reason) {
        if (entryClosed) return;
        entryClosed = true;
        if (timer) {
          global.clearTimeout(timer);
          timer = null;
        }
        cleanups.forEach(function (cleanup) {
          try { cleanup(); } catch (error) { /* cleanup must not block removal */ }
        });
        cleanups = [];
        entryEl.removeAttribute('data-timer-paused');
        if (entryEl.parentNode) entryEl.parentNode.removeChild(entryEl);
        if (entryRecord) removeEntry(entryRecord);
        call(input.onClose, reason);
      }

      if (input.dismissible !== false) {
        closeButton = element('button', 'nui-toast__close');
        closeButton.type = 'button';
        closeButton.setAttribute('aria-label', '关闭' + TOAST_TONES[tone].label + '通知');
        closeButton.appendChild(element('span', 'nui-toast__close-glyph', '×'));
        closeButton.lastChild.setAttribute('aria-hidden', 'true');
        bind(closeButton, 'click', function () { closeEntry('dismiss'); }, false, cleanups);
      }

      if (input.action != null) {
        if (isNode(input.action)) {
          actions.appendChild(input.action);
        } else if (typeof input.action === 'object' && input.action.label != null) {
          var actionButton = element('button', 'nui-toast__action', input.action.label);
          actionButton.type = 'button';
          actionButton.disabled = Boolean(input.action.disabled);
          if (input.action.ariaLabel) actionButton.setAttribute('aria-label', text(input.action.ariaLabel));
          bind(actionButton, 'click', function (event) {
            var result = call(input.action.onClick, event);
            if (input.action.dismiss !== false && result !== false) closeEntry('action');
          }, false, cleanups);
          actions.appendChild(actionButton);
        }
      }
      actions.hidden = actions.childNodes.length === 0;

      body.appendChild(toneEl);
      body.appendChild(message);
      body.appendChild(actions);
      entryEl.appendChild(marker);
      entryEl.appendChild(body);
      if (closeButton) entryEl.appendChild(closeButton);

      bind(entryEl, 'mouseenter', function () {
        hovered = true;
        pauseTimer();
      }, false, cleanups);
      bind(entryEl, 'mouseleave', function () {
        hovered = false;
        resumeTimer();
      }, false, cleanups);
      bind(entryEl, 'focusin', function () {
        focused = true;
        pauseTimer();
      }, false, cleanups);
      bind(entryEl, 'focusout', function (event) {
        if (event.relatedTarget && entryEl.contains(event.relatedTarget)) return;
        focused = false;
        resumeTimer();
      }, false, cleanups);

      var handle = {
        id: uniqueId('nui-toast'),
        el: entryEl,
        close: function () { closeEntry('api'); }
      };

      entryRecord = {
        el: entryEl,
        handle: handle,
        start: startTimer,
        close: closeEntry
      };
      return entryRecord;
    }

    function show(input) {
      if (destroyed) return null;
      var optionsForToast = input && typeof input === 'object' ? input : {};
      var tone = normalizeToastTone(optionsForToast.tone);
      var entry = createEntry(optionsForToast, tone);
      active.push(entry);
      root.appendChild(entry.el);
      trim();
      entry.start(resolveToastDuration(optionsForToast.duration, tone));
      return entry.handle;
    }

    function clearToasts() {
      if (destroyed) return;
      active.slice().forEach(function (entry) { entry.close('clear'); });
    }

    function update(settingsPatch) {
      if (destroyed || !settingsPatch || typeof settingsPatch !== 'object') return;
      if (hasOwn(settingsPatch, 'max')) state.max = normalizeToastMax(settingsPatch.max, state.max);
      if (hasOwn(settingsPatch, 'label')) state.label = text(settingsPatch.label) || '通知';
      root.setAttribute('aria-label', state.label);
      trim();
    }

    function destroyRegion() {
      if (destroyed) return;
      destroyed = true;
      active.slice().forEach(function (entry) { entry.close('destroy'); });
      active = [];
      if (root.parentNode) root.parentNode.removeChild(root);
    }

    var region = {
      el: root,
      show: show,
      clear: clearToasts,
      update: update,
      destroy: destroyRegion,
      activeCount: function () { return active.length; }
    };

    return region;
  }

  function ensureGlobalToastRegion() {
    if (toastGlobalRegion && !toastGlobalRegion.el.isConnected) {
      /* 宿主把全局区域移出文档后，旧区域仍持有计时器与条目；先按 destroy
         语义关闭，避免旧 onClose 迟到或回调泄漏。 */
      var staleRegion = toastGlobalRegion;
      toastGlobalRegion = null;
      staleRegion.destroy();
    }
    if (!toastGlobalRegion) {
      var region;
      region = createToastRegion(global.document.body, {
        max: toastGlobalConfig.max,
        label: toastGlobalConfig.label
      }, true, function () {
        if (toastGlobalRegion === region) {
          toastGlobalRegion = null;
          region.destroy();
        }
      });
      toastGlobalRegion = region;
    }
    return toastGlobalRegion;
  }

  function shouldMountInitialToast(options) {
    return Boolean(options && (hasOwn(options, 'message') || (hasOwn(options, 'action') && options.action != null)));
  }

  NoteUI.Toast = {
    version: VERSION,

    /*
     * 全局区域。show() 是唯一不遵守 mount(host, options) 形状的公开入口；
     * 原因与约定见 docs/ui-feedback.md#s01-toast。
     */
    show: function (options) {
      return ensureGlobalToastRegion().show(options);
    },

    clear: function () {
      if (!toastGlobalRegion) return;
      var region = toastGlobalRegion;
      region.clear();
      if (region.activeCount() === 0 && region.el.isConnected) {
        toastGlobalRegion = null;
        region.destroy();
      }
    },

    configure: function (options) {
      if (!options || typeof options !== 'object') return;
      if (hasOwn(options, 'max')) toastGlobalConfig.max = normalizeToastMax(options.max, toastGlobalConfig.max);
      if (hasOwn(options, 'label')) toastGlobalConfig.label = text(options.label) || '通知';
      if (toastGlobalRegion) {
        toastGlobalRegion.update({ max: toastGlobalConfig.max, label: toastGlobalConfig.label });
      }
    },

    /*
     * 局部区域：向 host 追加一个 .nui-toast-region，并返回区域实例。
     * options 可带 max / label 区域设置；若同时带 message 或 action，会立即显示一条局部通知。
     * 实例的 update() 只更新区域设置（max / label）。局部通知同样通过 show() 添加。
     */
    mount: function (host, options) {
      NoteCore.validateHost(host);
      var settings = options && typeof options === 'object' ? options : {};
      var region = createToastRegion(host, settings, false, null);
      if (shouldMountInitialToast(settings)) region.show(settings);
      return {
        el: region.el,
        show: region.show,
        clear: region.clear,
        update: region.update,
        destroy: region.destroy
      };
    }
  };

  /* ---------------------------------------------------------------------
   * S02 Progress
   * ------------------------------------------------------------------- */

  function normalizeProgressMax(value) {
    var number = Number(value);
    if (!isFinite(number) || number <= 0) return 100;
    return number;
  }

  function progressValue(value, max) {
    if (value === null || value === undefined) return null;
    var number = Number(value);
    if (!isFinite(number)) return null;
    return Math.max(0, Math.min(max, number));
  }

  function formatProgressPercent(value, max) {
    var percent = max > 0 ? (value / max) * 100 : 0;
    var rounded = Math.round(percent * 10) / 10;
    return String(rounded) + '%';
  }

  NoteUI.Progress = {
    version: VERSION,
    mount: function (host, options) {
      NoteCore.validateHost(host);
      var state = {
        value: undefined,
        max: 100,
        label: undefined,
        valueText: undefined
      };
      var input = options && typeof options === 'object' ? options : {};
      ['value', 'max', 'label', 'valueText'].forEach(function (key) {
        if (hasOwn(input, key)) state[key] = input[key];
      });

      var root = element('div', 'nui-progress');
      var head = element('div', 'nui-progress__head');
      var labelEl = element('div', 'nui-progress__label');
      var valueEl = element('div', 'nui-progress__value');
      var track = element('div', 'nui-progress__track');
      var fill = element('div', 'nui-progress__fill');
      var unknown = element('div', 'nui-progress__indeterminate');
      var destroyed = false;

      root.setAttribute('role', 'progressbar');
      track.setAttribute('aria-hidden', 'true');
      head.appendChild(labelEl);
      head.appendChild(valueEl);
      track.appendChild(fill);
      track.appendChild(unknown);
      root.appendChild(head);
      root.appendChild(track);

      function readValue() {
        var max = normalizeProgressMax(state.max);
        return { max: max, value: progressValue(state.value, max) };
      }

      function render() {
        if (destroyed) return;
        var current = readValue();
        var indeterminate = current.value === null;
        var defaultLabel = indeterminate ? '处理中' : '进度';
        var label = state.label === undefined || state.label === null ? defaultLabel : text(state.label);
        var accessibleLabel = label || defaultLabel;
        var customValueText = state.valueText === undefined || state.valueText === null ? '' : text(state.valueText);
        var visibleValue = customValueText || (indeterminate ? '进行中，进度未知' : formatProgressPercent(current.value, current.max));

        root.dataset.indeterminate = indeterminate ? 'true' : 'false';
        root.setAttribute('aria-label', accessibleLabel);
        labelEl.textContent = label;
        labelEl.hidden = !label;
        valueEl.textContent = visibleValue;
        valueEl.hidden = false;

        if (indeterminate) {
          root.removeAttribute('aria-valuemin');
          root.removeAttribute('aria-valuemax');
          root.removeAttribute('aria-valuenow');
          root.setAttribute('aria-valuetext', customValueText || '进行中，进度未知');
          root.setAttribute('aria-busy', 'true');
          fill.hidden = true;
          unknown.hidden = false;
          fill.style.width = '';
        } else {
          var percent = current.max > 0 ? (current.value / current.max) * 100 : 0;
          root.setAttribute('aria-valuemin', '0');
          root.setAttribute('aria-valuemax', String(current.max));
          root.setAttribute('aria-valuenow', String(current.value));
          if (customValueText) root.setAttribute('aria-valuetext', customValueText);
          else root.removeAttribute('aria-valuetext');
          root.removeAttribute('aria-busy');
          fill.hidden = false;
          unknown.hidden = true;
          fill.style.width = percent + '%';
        }
      }

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        ['value', 'max', 'label', 'valueText'].forEach(function (key) {
          if (hasOwn(patch, key)) state[key] = patch[key];
        });
        if ((hasOwn(patch, 'value') || hasOwn(patch, 'max')) && !hasOwn(patch, 'valueText')) {
          state.valueText = undefined;
        }
        render();
      }

      render();
      host.appendChild(root);

      return {
        el: root,
        getValue: function () {
          var current = readValue();
          return current.value;
        },
        update: update,
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          if (root.parentNode) root.parentNode.removeChild(root);
        }
      };
    }
  };

  /* ---------------------------------------------------------------------
   * S03 Spinner
   * ------------------------------------------------------------------- */

  function normalizeSpinnerSize(value) {
    if (value === 'sm' || value === 'md' || value === 'lg') return value;
    var number = Number(value);
    if (isFinite(number) && number >= 12) return Math.min(64, number);
    return 'md';
  }

  NoteUI.Spinner = {
    version: VERSION,
    mount: function (host, options) {
      NoteCore.validateHost(host);
      var state = {
        label: options && options.label !== undefined ? options.label : '加载中',
        size: options && options.size !== undefined ? options.size : 'md'
      };
      var root = element('div', 'nui-spinner');
      var ring = element('span', 'nui-spinner__ring');
      var labelEl = element('span', 'nui-spinner__label');
      var destroyed = false;

      root.setAttribute('role', 'status');
      root.setAttribute('aria-live', 'polite');
      root.setAttribute('aria-atomic', 'true');
      ring.setAttribute('aria-hidden', 'true');
      root.appendChild(ring);
      root.appendChild(labelEl);

      function render() {
        if (destroyed) return;
        var label = text(state.label) || '加载中';
        var size = normalizeSpinnerSize(state.size);
        labelEl.textContent = label;
        root.dataset.size = typeof size === 'number' ? 'custom' : size;
        if (typeof size === 'number') {
          ring.style.width = size + 'px';
          ring.style.height = size + 'px';
          ring.style.borderWidth = size >= 24 ? '3px' : '2px';
        } else {
          ring.style.width = '';
          ring.style.height = '';
          ring.style.borderWidth = '';
        }
      }

      render();
      host.appendChild(root);

      return {
        el: root,
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          if (hasOwn(patch, 'label')) state.label = patch.label;
          if (hasOwn(patch, 'size')) state.size = patch.size;
          render();
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          if (root.parentNode) root.parentNode.removeChild(root);
        }
      };
    }
  };

  /* ---------------------------------------------------------------------
   * S04 Skeleton
   * ------------------------------------------------------------------- */

  function normalizeSkeletonVariant(value) {
    return value === 'card' || value === 'table' ? value : 'text';
  }

  NoteUI.Skeleton = {
    version: VERSION,
    mount: function (host, options) {
      NoteCore.validateHost(host);
      var input = options && typeof options === 'object' ? options : {};
      var state = {
        variant: hasOwn(input, 'variant') ? input.variant : 'text',
        lines: hasOwn(input, 'lines') ? input.lines : 3,
        rows: hasOwn(input, 'rows') ? input.rows : 3,
        columns: hasOwn(input, 'columns') ? input.columns : 3,
        width: hasOwn(input, 'width') ? input.width : null,
        height: hasOwn(input, 'height') ? input.height : null,
        label: hasOwn(input, 'label') ? input.label : '内容加载中'
      };
      var root = element('div', 'nui-skeleton');
      var visual = element('div', 'nui-skeleton__visual');
      var sr = element('span', 'nui-skeleton__sr');
      var destroyed = false;

      root.setAttribute('role', 'status');
      root.setAttribute('aria-live', 'polite');
      root.setAttribute('aria-atomic', 'true');
      root.setAttribute('aria-busy', 'true');
      visual.setAttribute('aria-hidden', 'true');
      root.appendChild(sr);
      root.appendChild(visual);

      function lineWidth(index, total) {
        if (total <= 1) return '100%';
        if (index === total - 1) return '64%';
        if (index === total - 2) return '82%';
        return index % 3 === 1 ? '94%' : '100%';
      }

      function line(height, width) {
        var item = element('div', 'nui-skeleton__line');
        item.style.width = width || '100%';
        if (height) item.style.height = height;
        return item;
      }

      function buildText(variant, lineHeight) {
        var lines = normalizeCount(state.lines, 3);
        for (var index = 0; index < lines; index += 1) {
          variant.appendChild(line(lineHeight, lineWidth(index, lines)));
        }
      }

      function buildCard(variant, blockHeight) {
        var media = element('div', 'nui-skeleton__media');
        var title = element('div', 'nui-skeleton__title');
        if (blockHeight) media.style.height = blockHeight;
        variant.appendChild(media);
        variant.appendChild(title);
        var lines = normalizeCount(state.lines, 3);
        for (var index = 0; index < lines; index += 1) {
          variant.appendChild(line(null, lineWidth(index, lines)));
        }
      }

      function buildTable(variant, cellHeight) {
        var rows = normalizeCount(state.rows, 3);
        var columns = normalizeCount(state.columns, 3);
        var gridTemplate = 'repeat(' + columns + ', minmax(0, 1fr))';
        var header = element('div', 'nui-skeleton__tr nui-skeleton__tr--head');
        header.style.gridTemplateColumns = gridTemplate;
        for (var column = 0; column < columns; column += 1) {
          var headCell = element('div', 'nui-skeleton__cell');
          if (cellHeight) headCell.style.height = cellHeight;
          header.appendChild(headCell);
        }
        variant.appendChild(header);
        for (var rowIndex = 0; rowIndex < rows; rowIndex += 1) {
          var row = element('div', 'nui-skeleton__tr');
          row.style.gridTemplateColumns = gridTemplate;
          for (var colIndex = 0; colIndex < columns; colIndex += 1) {
            var cell = element('div', 'nui-skeleton__cell');
            if (cellHeight) cell.style.height = cellHeight;
            row.appendChild(cell);
          }
          variant.appendChild(row);
        }
      }

      function render() {
        if (destroyed) return;
        var variant = normalizeSkeletonVariant(state.variant);
        var width = cssLength(state.width);
        var height = cssLength(state.height);
        var label = text(state.label) || '内容加载中';

        root.dataset.variant = variant;
        root.style.width = width || '';
        root.style.maxWidth = '100%';
        sr.textContent = label;
        clearNode(visual);
        if (variant === 'card') buildCard(visual, height);
        else if (variant === 'table') buildTable(visual, height);
        else buildText(visual, height);
      }

      render();
      host.appendChild(root);

      return {
        el: root,
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          ['variant', 'lines', 'rows', 'columns', 'width', 'height', 'label'].forEach(function (key) {
            if (hasOwn(patch, key)) state[key] = patch[key];
          });
          render();
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          if (root.parentNode) root.parentNode.removeChild(root);
        }
      };
    }
  };

  /* ---------------------------------------------------------------------
   * S05 Empty
   * ------------------------------------------------------------------- */

  var EMPTY_KINDS = {
    empty: {
      label: '空内容',
      glyph: '∅',
      title: '暂无内容',
      description: '这里还没有可显示的内容。可以先添加内容，或稍后再回来查看。'
    },
    'no-results': {
      label: '无匹配结果',
      glyph: '?',
      title: '没有找到匹配结果',
      description: '当前筛选条件下没有内容。可以调整关键词或清除筛选后再试。'
    },
    unconfigured: {
      label: '尚未配置',
      glyph: '!',
      title: '尚未配置',
      description: '这个区域还没有设置内容。请先补充数据或完成配置。'
    }
  };

  function normalizeEmptyKind(value) {
    return hasOwn(EMPTY_KINDS, value) ? value : 'empty';
  }

  function appendNodeList(target, value) {
    clearNode(target);
    var nodes = [];
    if (isNode(value)) nodes = [value];
    else if (Array.isArray(value)) {
      value.forEach(function (item) {
        if (isNode(item)) nodes.push(item);
      });
    }
    nodes.forEach(function (node) { target.appendChild(node); });
    target.hidden = nodes.length === 0;
  }

  NoteUI.Empty = {
    version: VERSION,
    mount: function (host, options) {
      NoteCore.validateHost(host);
      var input = options && typeof options === 'object' ? options : {};
      var state = {
        kind: hasOwn(input, 'kind') ? input.kind : 'empty',
        title: hasOwn(input, 'title') ? input.title : undefined,
        description: hasOwn(input, 'description') ? input.description : undefined,
        action: hasOwn(input, 'action') ? input.action : null
      };
      var root = element('section', 'nui-empty');
      var marker = element('span', 'nui-empty__marker');
      var content = element('div', 'nui-empty__content');
      var title = element('h3', 'nui-empty__title');
      var description = element('p', 'nui-empty__description');
      var actions = element('div', 'nui-empty__actions');
      var destroyed = false;
      title.id = uniqueId('nui-empty-title');
      description.id = uniqueId('nui-empty-description');
      root.setAttribute('role', 'group');
      marker.setAttribute('aria-hidden', 'true');
      content.appendChild(title);
      content.appendChild(description);
      content.appendChild(actions);
      root.appendChild(marker);
      root.appendChild(content);

      function render() {
        if (destroyed) return;
        var kind = normalizeEmptyKind(state.kind);
        var defaults = EMPTY_KINDS[kind];
        var titleText = state.title === undefined || state.title === null ? defaults.title : text(state.title);
        var descriptionText = state.description === undefined || state.description === null ? defaults.description : text(state.description);

        root.dataset.kind = kind;
        marker.textContent = defaults.glyph;
        title.textContent = titleText;
        title.hidden = !titleText;
        description.textContent = descriptionText;
        description.hidden = !descriptionText;
        appendNodeList(actions, state.action);

        if (titleText) {
          root.setAttribute('aria-labelledby', title.id);
          root.removeAttribute('aria-label');
        } else {
          root.removeAttribute('aria-labelledby');
          root.setAttribute('aria-label', defaults.label);
        }
        if (descriptionText) root.setAttribute('aria-describedby', description.id);
        else root.removeAttribute('aria-describedby');
      }

      render();
      host.appendChild(root);

      return {
        el: root,
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          ['kind', 'title', 'description', 'action'].forEach(function (key) {
            if (hasOwn(patch, key)) state[key] = patch[key];
          });
          render();
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          if (root.parentNode) root.parentNode.removeChild(root);
        }
      };
    }
  };

  /* ---------------------------------------------------------------------
   * S06 Result
   * ------------------------------------------------------------------- */

  var RESULT_STATUSES = {
    success: {
      label: '成功',
      glyph: '✓',
      title: '操作已完成',
      description: '本次操作已经结束。你可以继续下一步，或返回查看其他内容。'
    },
    error: {
      label: '失败',
      glyph: '×',
      title: '操作未完成',
      description: '本次操作没有完成。你可以查看原因后重试，或返回上一步。'
    },
    restricted: {
      label: '受限',
      glyph: '!',
      title: '当前受限',
      description: '当前条件不允许继续。你可以确认权限、可用范围，或稍后再试。'
    },
    info: {
      label: '信息',
      glyph: 'i',
      title: '结果说明',
      description: '这是本次操作的结果说明。请根据需要继续下一步。'
    }
  };

  function normalizeResultStatus(value) {
    return hasOwn(RESULT_STATUSES, value) ? value : 'info';
  }

  function normalizeResultActions(value) {
    if (value == null) return [];
    if (isNode(value)) return [value];
    if (Array.isArray(value)) return value;
    if (typeof value === 'object' && value.label != null) return [value];
    return [];
  }

  function resultActionButton(descriptor) {
    var variant = descriptor.variant === 'primary' || descriptor.variant === 'quiet' ? descriptor.variant : 'secondary';
    var button = element('button', 'nui-result__button nui-result__button--' + variant, descriptor.label);
    button.type = 'button';
    button.disabled = Boolean(descriptor.disabled);
    if (descriptor.ariaLabel) button.setAttribute('aria-label', text(descriptor.ariaLabel));
    if (typeof descriptor.onClick === 'function') {
      button.addEventListener('click', function (event) {
        descriptor.onClick(event);
      });
    }
    return button;
  }

  NoteUI.Result = {
    version: VERSION,
    mount: function (host, options) {
      NoteCore.validateHost(host);
      var input = options && typeof options === 'object' ? options : {};
      var state = {
        status: hasOwn(input, 'status') ? input.status : 'info',
        title: hasOwn(input, 'title') ? input.title : undefined,
        description: hasOwn(input, 'description') ? input.description : undefined,
        details: hasOwn(input, 'details') ? input.details : null,
        actions: hasOwn(input, 'actions') ? input.actions : [],
        statusLabel: hasOwn(input, 'statusLabel') ? input.statusLabel : undefined
      };
      var root = element('section', 'nui-result');
      var marker = element('span', 'nui-result__marker');
      var content = element('div', 'nui-result__content');
      var statusEl = element('div', 'nui-result__status');
      var title = element('h3', 'nui-result__title');
      var description = element('div', 'nui-result__description');
      var details = element('div', 'nui-result__details');
      var actions = element('div', 'nui-result__actions');
      var destroyed = false;
      title.id = uniqueId('nui-result-title');
      description.id = uniqueId('nui-result-description');
      marker.setAttribute('aria-hidden', 'true');
      content.appendChild(statusEl);
      content.appendChild(title);
      content.appendChild(description);
      content.appendChild(details);
      content.appendChild(actions);
      root.appendChild(marker);
      root.appendChild(content);

      function renderActions() {
        clearNode(actions);
        var items = normalizeResultActions(state.actions);
        var appended = 0;
        items.forEach(function (item) {
          if (isNode(item)) {
            actions.appendChild(item);
            appended += 1;
          } else if (item && typeof item === 'object' && item.label != null) {
            actions.appendChild(resultActionButton(item));
            appended += 1;
          }
        });
        actions.hidden = appended === 0;
      }

      function render(patch) {
        if (destroyed) return;
        var status = normalizeResultStatus(state.status);
        var defaults = RESULT_STATUSES[status];
        var titleText = state.title === undefined || state.title === null ? defaults.title : text(state.title);
        var descriptionText = state.description === undefined || state.description === null ? defaults.description : text(state.description);
        var statusLabel = state.statusLabel === undefined || state.statusLabel === null ? defaults.label : text(state.statusLabel);

        root.dataset.status = status;
        marker.textContent = defaults.glyph;
        statusEl.textContent = statusLabel;
        title.textContent = titleText;
        title.hidden = !titleText;
        if (titleText) {
          root.setAttribute('aria-labelledby', title.id);
          root.removeAttribute('aria-label');
        } else {
          root.removeAttribute('aria-labelledby');
          root.setAttribute('aria-label', statusLabel || '结果说明');
        }
        description.textContent = descriptionText;
        description.hidden = !descriptionText;
        if (descriptionText) root.setAttribute('aria-describedby', description.id);
        else root.removeAttribute('aria-describedby');

        if (state.details === undefined || state.details === null || state.details === '') {
          clearNode(details);
          details.hidden = true;
        } else {
          setContent(details, state.details);
          details.hidden = false;
        }

        if (!patch || hasOwn(patch, 'actions')) renderActions();
      }

      render(null);
      host.appendChild(root);

      return {
        el: root,
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          ['status', 'title', 'description', 'details', 'actions', 'statusLabel'].forEach(function (key) {
            if (hasOwn(patch, key)) state[key] = patch[key];
          });
          render(patch);
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          if (root.parentNode) root.parentNode.removeChild(root);
        }
      };
    }
  };
})(window);
