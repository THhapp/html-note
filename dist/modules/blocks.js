/*! note-library module: blocks
 * dependencies: core, legacy, ui-layout, ui-content, ui-navigation, viz-objects, viz-chart, blocks-base, viz-flow, demo-stage
 * type: JavaScript
 * generated-by: scripts/build.mjs; do-not-edit.
 */

/* ---- source: src/blocks/codetrace.js ---- */
/* NoteBlocks B05 — CodeTrace.
 * Plain JavaScript; composes public NoteBlocks.StepPlayer, NoteUI.CodeBlock,
 * NoteUI.DataObject, NoteUI.Badge and NoteUI.Notice.
 * Code is always pre-written text: this file never evaluates or executes it.
 * Loads after src/blocks/shared.js (internal helpers, not a public entry).
 * No network, no HTML parsing, no automatic playback. */
(function (global) {
  'use strict';

  var NoteBlocks = global.NoteBlocks = global.NoteBlocks || {};

  var shared = global.NoteBlocksInternals;
  if (!shared) {
    throw new Error('NoteBlocks 组合块需要先加载 src/blocks/shared.js（内部共享文件）。');
  }
  var ui = shared.ui;
  var own = shared.own;
  var text = shared.text;
  var isNode = shared.isNode;
  var make = shared.make;
  var uniqueId = shared.uniqueId;
  var validateHost = shared.validateHost;
  var requireComponents = shared.requireComponents;
  var safeDestroy = shared.safeDestroy;
  var stepArray = shared.stepArray;
  var stepWrappers = shared.stepWrappers;
  function variableName(variable, index) {
    if (variable && variable.name != null && text(variable.name) !== '') return text(variable.name);
    return 'var-' + index;
  }

  function variableLabel(variable, index) {
    if (variable && variable.label != null && text(variable.label) !== '') return text(variable.label);
    return variableName(variable, index);
  }

  function valueWithUnit(variable) {
    if (!variable) return '';
    if (isNode(variable.value)) return variable.value;
    var value = variable.value == null ? '' : text(variable.value);
    var unit = variable.unit == null ? '' : text(variable.unit).trim();
    return unit ? value + ' ' + unit : value;
  }

  function normaliseStepLabel(labels) {
    if (!labels || typeof labels !== 'object') return null;
    return labels;
  }

  function stepIndex(value, steps) {
    if (!steps.length || value == null) return 0;
    if (typeof value === 'string') {
      var wanted = text(value);
      for (var index = 0; index < steps.length; index += 1) {
        if (steps[index] && steps[index].id != null && text(steps[index].id) === wanted) return index;
      }
    }
    if (typeof value === 'number' || (typeof value === 'string' && /^-?\d+$/.test(value.trim()))) {
      var number = Math.trunc(Number(value));
      if (isFinite(number)) return Math.max(0, Math.min(steps.length - 1, number));
    }
    return 0;
  }

  NoteBlocks.CodeTrace = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host, 'NoteBlocks.CodeTrace');
      requireComponents('NoteBlocks.CodeTrace', ['NoteUI.CodeBlock', 'NoteUI.DataObject', 'NoteUI.Badge', 'NoteUI.Notice', 'NoteBlocks.StepPlayer']);

      var UI = ui();
      var input = options || {};
      var state = {
        code: input.code == null ? '' : text(input.code),
        language: input.language == null ? '' : text(input.language),
        title: input.title == null ? '' : input.title,
        steps: stepArray(input.steps),
        current: input.current,
        labels: normaliseStepLabel(input.labels),
        onStep: typeof input.onStep === 'function' ? input.onStep : null,
        maxWidth: input.maxWidth == null ? null : input.maxWidth,
        label: input.label == null ? '' : text(input.label)
      };
      var destroyed = false;
      var player = null;
      var refs = { code: null, body: null, vars: Object.create(null), stepId: null };

      function cleanupRefs() {
        refs.code = null;
        refs.body = null;
        refs.vars = Object.create(null);
        refs.stepId = null;
      }

      function render(step, context) {
        cleanupRefs();
        var wrap = make('div', 'nblk-codetrace__layout');
        var codeHost = make('div', 'nblk-codetrace__code');
        var side = make('div', 'nblk-codetrace__side');
        var bodyId = uniqueId('nblk-codetrace-body');
        wrap.id = bodyId;
        wrap.setAttribute('data-step-id', step && step.id != null ? text(step.id) : '');
        refs.body = wrap;
        refs.stepId = step && step.id != null ? text(step.id) : null;

        var codeInstance = UI.CodeBlock.mount(codeHost, {
          code: state.code,
          language: state.language,
          title: '',
          lineNumbers: true,
          highlight: step ? step.highlight : null,
          copy: true,
          maxHeight: 'min(26rem, 62vh)'
        });
        refs.code = codeInstance.el;

        var sideTitle = make('h3', 'nblk-codetrace__side-title', '变量快照');
        side.appendChild(sideTitle);

        var variables = step && Array.isArray(step.variables) ? step.variables : [];
        var changed = variables.map(function (variable, index) {
          return { variable: variable, index: index };
        }).filter(function (entry) {
          return Boolean(entry.variable && entry.variable.changed);
        });
        var summary = make('div', 'nblk-codetrace__change-summary');
        var summaryBadge = UI.Badge.mount(summary, {
          label: changed.length
            ? '本步变化：' + changed.map(function (entry) {
              return variableLabel(entry.variable, entry.index);
            }).join('、')
            : '本步无变量变化',
          tone: changed.length ? 'warning' : 'neutral'
        });
        var summaryText = make('span', 'nblk-codetrace__change-text',
          changed.length
            ? '变化字段以文字标记和更新后的快照值同时呈现。'
            : '变量值仍为当前停点的完整快照。');
        summary.appendChild(summaryText);
        side.appendChild(summary);

        var variableList = make('div', 'nblk-codetrace__variables');
        var dataInstances = [];
        var badgeInstances = [summaryBadge];

        if (!variables.length) {
          variableList.appendChild(make('p', 'nblk-codetrace__empty', '本停点未提供变量。'));
        } else {
          variables.forEach(function (variable, index) {
            var card = make('div', 'nblk-codetrace__variable');
            var cardHead = make('div', 'nblk-codetrace__variable-head');
            if (variable && variable.changed) {
              var badge = UI.Badge.mount(cardHead, { label: '本步变化', tone: 'warning' });
              badgeInstances.push(badge);
            }
            card.appendChild(cardHead);
            var name = variableName(variable, index);
            var label = variableLabel(variable, index);
            var unit = variable && variable.unit != null ? text(variable.unit).trim() : '';
            var caption = variable && variable.changed
              ? '相对上一停点发生变化。'
              : '';
            if (unit && isNode(variable && variable.value)) {
              caption = [caption, '单位：' + unit].filter(Boolean).join(' ');
            }
            var instance = UI.DataObject.mount(card, {
              label: label,
              value: valueWithUnit(variable),
              caption: caption,
              changed: Boolean(variable && variable.changed)
            });
            dataInstances.push(instance);
            refs.vars[name] = card;
            variableList.appendChild(card);
          });
        }
        side.appendChild(variableList);

        var readOnlyNote = make('p', 'nblk-codetrace__readonly',
          '代码为宿主提供的预置文本，只读显示，不会执行。');
        side.appendChild(readOnlyNote);

        var extra = make('div', 'nblk-codetrace__extra');
        var notice = null;
        if (step && step.explanation != null && text(step.explanation).trim()) {
          notice = UI.Notice.mount(extra, {
            title: '本步说明',
            content: step.explanation,
            tone: 'neutral'
          });
        }

        wrap.append(codeHost, side, extra);
        context.stageEl.appendChild(wrap);

        return function cleanup() {
          safeDestroy(notice);
          dataInstances.forEach(safeDestroy);
          badgeInstances.forEach(safeDestroy);
          safeDestroy(codeInstance);
          cleanupRefs();
          wrap.remove();
        };
      }

      var labels = state.labels;
      player = NoteBlocks.StepPlayer.mount(host, {
        steps: stepWrappers(state.steps),
        render: render,
        initialIndex: stepIndex(state.current, state.steps),
        labels: labels,
        onStep: function (index, wrapper, event) {
          if (destroyed) return;
          if (typeof state.onStep === 'function') {
            state.onStep(index, wrapper && wrapper.state ? wrapper.state : null, event);
          }
        },
        title: state.title,
        maxWidth: state.maxWidth,
        label: state.label || '代码与状态跟踪'
      });
      player.el.classList.add('nblk-codetrace');

      function visibleStep() {
        if (destroyed || !player) return null;
        var wrapper = player.getStep();
        return wrapper && wrapper.state ? wrapper.state : null;
      }

      function getTarget(id) {
        if (destroyed || id == null) return null;
        var key = text(id);
        if (key === 'code') return refs.code;
        if (key.indexOf('var:') === 0) return refs.vars[key.slice(4)] || null;
        if (refs.stepId != null && key === refs.stepId) return refs.body;
        return null;
      }

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        if (own(patch, 'code')) state.code = patch.code == null ? '' : text(patch.code);
        if (own(patch, 'language')) state.language = patch.language == null ? '' : text(patch.language);
        if (own(patch, 'title')) state.title = patch.title == null ? '' : patch.title;
        if (own(patch, 'steps')) state.steps = stepArray(patch.steps);
        if (own(patch, 'current')) state.current = patch.current;
        if (own(patch, 'labels')) state.labels = normaliseStepLabel(patch.labels);
        if (own(patch, 'onStep')) state.onStep = typeof patch.onStep === 'function' ? patch.onStep : null;
        if (own(patch, 'maxWidth')) state.maxWidth = patch.maxWidth;
        if (own(patch, 'label')) state.label = patch.label == null ? '' : text(patch.label);

        var stepsChanged = own(patch, 'steps') || own(patch, 'code') || own(patch, 'language');
        var playerPatch = {
          title: state.title,
          maxWidth: state.maxWidth,
          label: state.label || '代码与状态跟踪'
        };
        if (stepsChanged) playerPatch.steps = stepWrappers(state.steps);
        if (own(patch, 'labels')) playerPatch.labels = state.labels;
        player.update(playerPatch);

        if (own(patch, 'current')) {
          if (state.steps.length) {
            player.go(stepIndex(state.current, state.steps));
          }
        }
      }

      function destroy() {
        if (destroyed) return;
        destroyed = true;
        cleanupRefs();
        safeDestroy(player);
        player = null;
      }

      return {
        el: player.el,
        go: function (index) { if (!destroyed) player.go(index); },
        next: function () { if (!destroyed) player.next(); },
        prev: function () { if (!destroyed) player.prev(); },
        replay: function () { if (!destroyed) player.replay(); },
        reset: function () { if (!destroyed) player.reset(); },
        getStep: visibleStep,
        getTarget: getTarget,
        update: update,
        destroy: destroy
      };
    }
  };
})(window);

/* ---- source: src/blocks/framefields.js ---- */
/* NoteBlocks B06 — FrameFields.
 * Composes public NoteViz.Sequence with NoteUI.Stack, NoteUI.Badge and
 * NoteUI.Notice. Field names, order, ranges, units and values come from the
 * host; this block does not contain protocol semantics.
 * Values are only read from host-provided bits, never evaluated as code.
 * Loads after src/blocks/shared.js (internal helpers, not a public entry).
 */
(function (global) {
  'use strict';

  var NoteBlocks = global.NoteBlocks = global.NoteBlocks || {};

  var shared = global.NoteBlocksInternals;
  if (!shared) {
    throw new Error('NoteBlocks 组合块需要先加载 src/blocks/shared.js（内部共享文件）。');
  }
  var core = shared.core;
  var ui = shared.ui;
  var viz = shared.viz;
  var own = shared.own;
  var text = shared.text;
  var isNode = shared.isNode;
  var make = shared.make;
  var clear = shared.clear;
  var validateHost = shared.validateHost;
  var requireComponents = shared.requireComponents;
  var safeDestroy = shared.safeDestroy;
  var array = shared.array;
  function idSet(value) {
    var set = Object.create(null);
    var list = Array.isArray(value) ? value : (value == null ? [] : [value]);
    list.forEach(function (entry) {
      if (entry != null && text(entry) !== '') set[text(entry)] = true;
    });
    return set;
  }

  function normalizeItems(input) {
    return array(input).map(function (item, index) {
      var source = item;
      var id = 'frame-item-' + index;
      var label = '';
      var value = '';
      if (source != null && typeof source === 'object' && !isNode(source)) {
        if (source.id != null && text(source.id) !== '') id = text(source.id);
        label = source.label == null ? '' : text(source.label);
        value = source.value == null ? (source.label == null ? '' : text(source.label)) : text(source.value);
      } else if (source != null) {
        value = text(source);
      }
      return { id: id, label: label, value: value, source: source };
    });
  }

  function normalizeFields(input) {
    return array(input).map(function (field, index) {
      if (!field || typeof field !== 'object') return null;
      return {
        id: field.id != null && text(field.id) !== '' ? text(field.id) : 'field-' + index,
        label: field.label == null ? '' : text(field.label),
        start: field.start,
        end: field.end,
        note: field.note == null ? '' : field.note,
        unit: field.unit == null ? '' : text(field.unit),
        value: field.value,
        hasValue: own(field, 'value') && field.value !== undefined,
        raw: field
      };
    }).filter(Boolean);
  }

  function clampIndex(value, count) {
    if (count < 1) return -1;
    var number = typeof value === 'number' ? value : Number(value);
    if (!isFinite(number)) return -1;
    return Math.max(0, Math.min(count - 1, Math.trunc(number)));
  }

  function normalizeRange(field, count) {
    if (!field || count < 1) return null;
    var start = clampIndex(field.start, count);
    var end = clampIndex(field.end, count);
    if (start < 0 || end < 0) return null;
    return { start: Math.min(start, end), end: Math.max(start, end) };
  }

  function bitValueList(items, range) {
    if (!range) return null;
    var bits = [];
    for (var index = range.start; index <= range.end; index += 1) {
      var value = items[index] ? text(items[index].value).trim() : '';
      if (value !== '0' && value !== '1') return null;
      bits.push(value);
    }
    return bits;
  }

  function computeBinaryValue(bits, bitOrder) {
    if (!bits || !bits.length) return null;
    var ordered = bitOrder === 'lsb' ? bits.slice().reverse() : bits.slice();
    var binary = ordered.join('');
    try {
      if (typeof global.BigInt === 'function') return global.BigInt('0b' + binary).toString(10);
    } catch (error) {
      /* fall through to the conservative number path */
    }
    var number = global.parseInt(binary, 2);
    return isFinite(number) ? String(number) : null;
  }

  function fieldDisplayValue(field, items, bitOrder) {
    if (field.hasValue) {
      if (isNode(field.value)) return { node: field.value, text: '', computed: false, note: '' };
      var explicit = field.value == null ? '' : text(field.value);
      return {
        node: null,
        text: explicit,
        computed: false,
        note: ''
      };
    }
    var range = normalizeRange(field, items.length);
    var bits = bitValueList(items, range);
    var computed = computeBinaryValue(bits, bitOrder);
    if (computed == null) {
      return {
        node: null,
        text: '—',
        computed: false,
        note: range
          ? '宿主未提供字段值，且该位范围不是完整的 0/1 位串，无法按当前位序计算。'
          : '宿主未提供字段值，字段也没有可用的位范围。'
      };
    }
    return { node: null, text: computed, computed: true, note: '' };
  }

  NoteBlocks.FrameFields = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host, 'NoteBlocks.FrameFields');
      requireComponents('NoteBlocks.FrameFields', ['NoteViz.Sequence', 'NoteUI.Stack', 'NoteUI.Badge', 'NoteUI.Notice']);
      var UI = ui();
      var V = viz();
      var C = core();
      var input = options || {};
      var defaults = {
        items: [],
        fields: [],
        focusField: null,
        bitOrder: 'msb',
        caption: '',
        changed: [],
        label: '位串与字段结构',
        onSelect: null
      };
      var state = Object.assign({}, defaults, input);
      state.items = array(state.items);
      state.fields = normalizeFields(state.fields);
      state.bitOrder = state.bitOrder === 'lsb' ? 'lsb' : 'msb';
      state.changed = Array.isArray(state.changed) ? state.changed.slice() : (state.changed == null ? [] : [state.changed]);
      state.onSelect = typeof state.onSelect === 'function' ? state.onSelect : null;
      state.label = state.label == null ? '' : text(state.label);

      var destroyed = false;
      var seqItems = normalizeItems(state.items);
      var selectedId = null;
      var seq = null;
      var badgeInstances = [];
      var captionInstance = null;
      var fieldButtons = Object.create(null);
      var fieldRows = Object.create(null);
      var bag = null;
      var fallbackClick = false;
      var fallbackFocus = false;
      var suppressFocusSelection = false;

      var root = make('section', 'nblk-framefields');
      root.setAttribute('role', 'group');
      var stack = UI.Stack.mount(root, { gap: 'sm', align: 'stretch' });
      var header = make('div', 'nblk-framefields__header');
      var heading = make('h3', 'nblk-framefields__title', '位串与字段');
      var meta = make('p', 'nblk-framefields__meta');
      header.append(heading, meta);
      var seqHost = make('div', 'nblk-framefields__sequence');
      var fieldsSection = make('section', 'nblk-framefields__section');
      fieldsSection.setAttribute('aria-label', '字段列表');
      var fieldsHead = make('div', 'nblk-framefields__section-head');
      var fieldsTitle = make('h4', 'nblk-framefields__section-title', '字段');
      var basis = make('p', 'nblk-framefields__basis',
        '字段值优先使用宿主提供的 value；未提供时，按位范围与位序从 items 中的 0/1 值计算无符号整数。');
      fieldsHead.append(fieldsTitle, basis);
      var fieldScroll = make('div', 'nblk-framefields__field-scroll');
      fieldScroll.tabIndex = 0;
      fieldScroll.setAttribute('role', 'region');
      fieldScroll.setAttribute('aria-label', '字段列表，可纵向滚动');
      var fieldList = make('div', 'nblk-framefields__fields');
      fieldList.setAttribute('role', 'list');
      fieldList.setAttribute('aria-label', '可聚焦字段');
      fieldScroll.appendChild(fieldList);
      fieldsSection.append(fieldsHead, fieldScroll);
      var captionHost = make('div', 'nblk-framefields__caption');
      stack.append(header, seqHost, fieldsSection, captionHost);

      function fieldById(id) {
        var key = text(id);
        for (var i = 0; i < state.fields.length; i += 1) {
          if (state.fields[i].id === key) return state.fields[i];
        }
        return null;
      }

      function changedIds() {
        return idSet(state.changed);
      }

      function rangeIds(field) {
        var range = normalizeRange(field, seqItems.length);
        if (!range) return [];
        var result = [];
        for (var index = range.start; index <= range.end; index += 1) {
          if (seqItems[index]) result.push(seqItems[index].id);
        }
        return result;
      }

      function allChangedIds() {
        var changed = changedIds();
        var result = [];
        state.fields.forEach(function (field) {
          if (changed[field.id]) result = result.concat(rangeIds(field));
        });
        return result;
      }

      function buildGroups() {
        return state.fields.map(function (field) {
          var ids = rangeIds(field);
          if (!ids.length) return null;
          return {
            label: field.label || field.id,
            ids: ids
          };
        }).filter(Boolean);
      }

      function syncSequence() {
        if (!seq) return;
        var currentField = selectedId == null ? null : fieldById(selectedId);
        seq.update({
          items: seqItems.map(function (item) {
            return { id: item.id, label: item.label, value: item.value };
          }),
          variant: 'bits',
          index: true,
          groups: buildGroups(),
          focus: currentField ? rangeIds(currentField) : [],
          changed: allChangedIds(),
          label: (state.label || '位串') + ' 序列'
        });
      }

      function statusFor(field) {
        var focused = selectedId != null && field.id === selectedId;
        var changed = Boolean(changedIds()[field.id]);
        if (focused && changed) return { label: '当前字段 · 本步变化', tone: 'warning' };
        if (focused) return { label: '当前字段', tone: 'accent' };
        if (changed) return { label: '本步变化', tone: 'warning' };
        return null;
      }

      function renderFields(restoreFocus) {
        var activeId = null;
        if (restoreFocus && global.document && global.document.activeElement &&
            fieldList.contains(global.document.activeElement)) {
          var active = global.document.activeElement;
          var holder = active.closest ? active.closest('[data-field-id]') : null;
          if (holder) activeId = holder.getAttribute('data-field-id');
        }

        badgeInstances.forEach(safeDestroy);
        badgeInstances = [];
        clear(fieldList);
        fieldButtons = Object.create(null);
        fieldRows = Object.create(null);

        if (!state.fields.length) {
          var empty = make('p', 'nblk-framefields__empty',
            '宿主未提供字段。序列仍可独立查看；字段说明和值不会被本块猜造。');
          empty.setAttribute('role', 'status');
          fieldList.appendChild(empty);
          return;
        }

        state.fields.forEach(function (field) {
          var row = make('div', 'nblk-framefields__field');
          row.setAttribute('role', 'listitem');
          row.setAttribute('data-field-id', field.id);
          if (selectedId === field.id) row.classList.add('is-selected');
          if (changedIds()[field.id]) row.classList.add('is-changed');

          var button = make('button', 'nblk-framefields__field-button');
          button.type = 'button';
          button.setAttribute('data-field-id', field.id);
          button.setAttribute('aria-pressed', selectedId === field.id ? 'true' : 'false');
          var labelSpan = make('span', 'nblk-framefields__field-label', field.label || field.id);
          var range = normalizeRange(field, seqItems.length);
          var rangeText = range
            ? '索引 ' + range.start + '–' + range.end
            : '未指定有效位范围';
          var rangeSpan = make('span', 'nblk-framefields__range', rangeText);
          button.append(labelSpan, rangeSpan);
          button.setAttribute('aria-label',
            '查看字段 ' + (field.label || field.id) + '，' + rangeText);
          row.appendChild(button);
          fieldButtons[field.id] = button;
          fieldRows[field.id] = row;

          var badges = make('div', 'nblk-framefields__badges');
          var status = statusFor(field);
          if (status) {
            var badge = UI.Badge.mount(badges, status);
            badgeInstances.push(badge);
          }
          row.appendChild(badges);

          var valueRow = make('div', 'nblk-framefields__value-row');
          var valueLabel = make('span', 'nblk-framefields__value-label', '值');
          var valueEl = make('span', 'nblk-framefields__value');
          var display = fieldDisplayValue(field, seqItems, state.bitOrder);
          if (display.node) valueEl.appendChild(display.node);
          else valueEl.appendChild(global.document.createTextNode(display.text === '' ? '（空）' : display.text));
          if (field.unit) {
            valueEl.appendChild(make('span', 'nblk-framefields__unit', ' ' + field.unit));
          }
          valueRow.append(valueLabel, valueEl);
          row.appendChild(valueRow);
          if (display.note || field.note) {
            var note = make('p', 'nblk-framefields__note', display.note || field.note);
            row.appendChild(note);
          }
          fieldList.appendChild(row);
        });

        if (activeId && fieldButtons[activeId]) {
          var previousSuppression = suppressFocusSelection;
          suppressFocusSelection = true;
          try {
            try { fieldButtons[activeId].focus({ preventScroll: true }); } catch (error) {
              try { fieldButtons[activeId].focus(); } catch (ignored) { /* optional */ }
            }
          } finally {
            suppressFocusSelection = previousSuppression;
          }
        }
      }

      function renderMeta() {
        heading.textContent = '位串与字段';
        var order = state.bitOrder === 'lsb' ? 'LSB 在前（低位索引权重较小）' : 'MSB 在前（低位索引权重较大）';
        meta.textContent = '位序：' + order + '。字段顺序、名称、单位和值均由宿主提供。';
      }

      function renderCaption() {
        safeDestroy(captionInstance);
        captionInstance = null;
        clear(captionHost);
        if (state.caption == null || (typeof state.caption === 'string' && !state.caption.trim())) return;
        captionInstance = UI.Notice.mount(captionHost, {
          title: '字段说明',
          content: state.caption,
          tone: 'neutral'
        });
      }

      function applyLabel() {
        var label = text(state.label).trim() || '位串与字段结构';
        root.setAttribute('aria-label', label);
      }

      function resolveFieldId(id) {
        if (id == null) return null;
        var field = fieldById(id);
        return field ? field.id : null;
      }

      function revealField(field) {
        if (!field || !fieldButtons[field.id]) return;
        if (typeof C.scrollIntoViewIfNeeded === 'function') {
          C.scrollIntoViewIfNeeded(fieldButtons[field.id], fieldScroll, { block: 'nearest', inline: 'nearest' });
        }
      }

      function applySelection(next, moveFocus) {
        selectedId = next;
        syncSequence();
        suppressFocusSelection = true;
        try {
          renderFields(true);
          if (moveFocus && next && fieldButtons[next]) {
            try {
              fieldButtons[next].focus({ preventScroll: true });
            } catch (error) {
              try { fieldButtons[next].focus(); } catch (ignored) { /* optional */ }
            }
          }
        } finally {
          suppressFocusSelection = false;
        }
        if (next) revealField(fieldById(next));
      }

      function focusField(id, focusOptions) {
        if (destroyed) return;
        var settings = focusOptions && typeof focusOptions === 'object' ? focusOptions : {};
        var silent = settings.silent === true;
        var next = resolveFieldId(id);
        if (id != null && next == null) return;
        var previous = selectedId;
        applySelection(next, false);
        if (previous !== selectedId && !silent && typeof state.onSelect === 'function') {
          state.onSelect(selectedId, settings.event || null);
        }
      }

      function onClick(event) {
        if (destroyed) return;
        var target = event.target;
        var row = target && target.closest ? target.closest('.nblk-framefields__field') : null;
        if (!row || !fieldList.contains(row)) return;
        var id = row.getAttribute('data-field-id');
        if (!id) return;
        var field = fieldById(id);
        if (!field) return;
        applySelection(field.id, true);
        if (typeof state.onSelect === 'function') state.onSelect(field.id, event);
      }

      function onFieldFocus(event) {
        if (destroyed || suppressFocusSelection) return;
        var target = event.target;
        var button = target && target.closest ? target.closest('.nblk-framefields__field-button') : null;
        if (!button || !fieldList.contains(button)) return;
        if (typeof button.matches === 'function' && !button.matches(':focus-visible')) return;
        var id = button.getAttribute('data-field-id');
        if (!id || id === selectedId) return;
        var field = fieldById(id);
        if (!field) return;
        applySelection(field.id, false);
      }

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        var hadFocus = fieldList.contains(global.document.activeElement);
        if (own(patch, 'items')) {
          state.items = array(patch.items);
          seqItems = normalizeItems(state.items);
        }
        if (own(patch, 'fields')) state.fields = normalizeFields(patch.fields);
        if (own(patch, 'bitOrder')) state.bitOrder = patch.bitOrder === 'lsb' ? 'lsb' : 'msb';
        if (own(patch, 'caption')) state.caption = patch.caption;
        if (own(patch, 'changed')) {
          state.changed = Array.isArray(patch.changed)
            ? patch.changed.slice()
            : (patch.changed == null ? [] : [patch.changed]);
        }
        if (own(patch, 'label')) state.label = patch.label == null ? '' : text(patch.label);
        if (own(patch, 'onSelect')) state.onSelect = typeof patch.onSelect === 'function' ? patch.onSelect : null;
        if (own(patch, 'focusField')) {
          selectedId = resolveFieldId(patch.focusField);
        } else if (selectedId != null && !fieldById(selectedId)) {
          selectedId = null;
        }
        applyLabel();
        syncSequence();
        renderMeta();
        renderFields(hadFocus);
        renderCaption();
        if (selectedId) revealField(fieldById(selectedId));
      }

      function destroy() {
        if (destroyed) return;
        destroyed = true;
        badgeInstances.forEach(safeDestroy);
        badgeInstances = [];
        safeDestroy(captionInstance);
        captionInstance = null;
        safeDestroy(seq);
        seq = null;
        if (bag) bag.clear();
        if (fallbackClick) fieldList.removeEventListener('click', onClick);
        if (fallbackFocus) fieldList.removeEventListener('focusin', onFieldFocus);
        safeDestroy(stack);
        stack = null;
        root.remove();
      }

      selectedId = resolveFieldId(state.focusField);
      applyLabel();
      seq = V.Sequence.mount(seqHost, {
        items: [],
        variant: 'bits',
        index: true,
        label: (state.label || '位串') + ' 序列'
      });
      syncSequence();
      renderMeta();
      renderFields(false);
      renderCaption();
      host.appendChild(root);
      if (selectedId) revealField(fieldById(selectedId));

      if (C.listeners) {
        bag = C.listeners(fieldList);
        bag.on('click', onClick);
        bag.on('focusin', onFieldFocus);
      } else {
        fallbackClick = true;
        fallbackFocus = true;
        fieldList.addEventListener('click', onClick);
        fieldList.addEventListener('focusin', onFieldFocus);
      }

      return {
        el: root,
        focusField: focusField,
        getSelected: function () { return destroyed ? null : selectedId; },
        getTarget: function (id) {
          if (destroyed || id == null) return null;
          var key = text(id);
          if (key === 'sequence') return seq ? seq.el : null;
          if (fieldById(key)) return fieldRows[key] || null;
          return seq && typeof seq.getTarget === 'function' ? seq.getTarget(key) : null;
        },
        update: update,
        destroy: destroy
      };
    }
  };
})(window);

/* ---- source: src/blocks/flow.js ---- */
/* NoteBlocks B07 — ProcessFlow.
 * Composes public NoteBlocks.StepPlayer, NoteViz.Graph and NoteUI.Steps.
 * Flow data and stops are host-owned. Node focus and edge focus/changed use the
 * Graph public options; current edge targets are Graph.getEdgeTarget() rather
 * than a parallel text card. The relation area keeps only supplementary text
 * (route/label/warnings), never the only edge emphasis.
 * No automatic playback, no general-purpose flow editor.
 * Loads after src/blocks/shared.js (internal helpers, not a public entry).
 */
(function (global) {
  'use strict';

  var NoteBlocks = global.NoteBlocks = global.NoteBlocks || {};

  var shared = global.NoteBlocksInternals;
  if (!shared) {
    throw new Error('NoteBlocks 组合块需要先加载 src/blocks/shared.js（内部共享文件）。');
  }
  var ui = shared.ui;
  var viz = shared.viz;
  var own = shared.own;
  var text = shared.text;
  var make = shared.make;
  var validateHost = shared.validateHost;
  var requireComponents = shared.requireComponents;
  var safeDestroy = shared.safeDestroy;
  var array = shared.array;
  function hasManualPositions(nodes) {
    return nodes.length > 0 && nodes.every(function (node) {
      return node && node.x != null && node.y != null &&
        isFinite(Number(node.x)) && isFinite(Number(node.y));
    });
  }

  function stepLabel(step, index, nodeById) {
    if (step && step.label != null && text(step.label).trim()) return text(step.label);
    var node = step && step.nodeId != null ? nodeById[text(step.nodeId)] : null;
    if (node && node.label != null && text(node.label).trim()) return text(node.label);
    return '停点 ' + (index + 1);
  }

  NoteBlocks.ProcessFlow = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host, 'NoteBlocks.ProcessFlow');
      requireComponents('NoteBlocks.ProcessFlow', ['NoteViz.Graph', 'NoteUI.Steps', 'NoteUI.Notice', 'NoteBlocks.StepPlayer']);
      var UI = ui();
      var V = viz();
      var input = options || {};
      var state = {
        nodes: array(input.nodes),
        edges: array(input.edges),
        steps: array(input.steps).filter(function (step) { return step && typeof step === 'object'; }),
        title: input.title == null ? '' : input.title,
        labels: input.labels && typeof input.labels === 'object' ? input.labels : null,
        onStep: typeof input.onStep === 'function' ? input.onStep : null,
        maxWidth: input.maxWidth == null ? null : input.maxWidth,
        label: input.label == null ? '' : text(input.label)
      };
      var destroyed = false;
      var player = null;
      var liveGraph = null;   // 跨停点复用的 Graph 实例；只通过公开 mount/update/getTarget 操作
      var refs = { graph: null, edges: Object.create(null), unresolved: Object.create(null), progress: null, stepIds: Object.create(null) };

      function nodeMap() {
        var map = Object.create(null);
        state.nodes.forEach(function (node) {
          if (node && node.id != null) map[text(node.id)] = node;
        });
        return map;
      }

      function nodeLabel(id) {
        var map = nodeMap();
        var node = id != null ? map[text(id)] : null;
        return node && node.label != null ? text(node.label) : (id == null ? '未指定' : text(id));
      }

      /* 与 NoteViz.Graph 的 normalizeGraphEdges 使用同一套稳定 ID 规则，
         这样 getTarget('edge:<key>') 才能直接对应 Graph.getEdgeTarget(key)。 */
      function edgeRecords() {
        var routeSeen = Object.create(null);
        var used = Object.create(null);
        return state.edges.map(function (edge, index) {
          var source = edge && typeof edge === 'object' ? edge : {};
          var from = source.from == null ? '' : text(source.from);
          var to = source.to == null ? '' : text(source.to);
          var route = from + ' -> ' + to;
          var routeCount = routeSeen[route] || 0;
          routeSeen[route] = routeCount + 1;
          var base;
          if (source.id != null && text(source.id) !== '') base = text(source.id);
          else if (routeCount === 0) base = route;
          else base = route + ' #' + (routeCount + 1);
          var key = base;
          var suffix = 1;
          while (used[key]) {
            suffix += 1;
            key = base + ' #' + suffix;
          }
          used[key] = true;
          return {
            key: key,
            route: route,
            from: from,
            to: to,
            label: source.label == null ? '' : text(source.label),
            directed: source.directed,
            index: index,
            raw: source
          };
        });
      }

      function buildStepWrappers() {
        var map = nodeMap();
        return state.steps.map(function (step, index) {
          return {
            id: step.id,
            label: stepLabel(step, index, map),
            caption: step.caption == null ? '' : text(step.caption),
            state: step
          };
        });
      }

      function resolveEdgeRefs(refsValue, records) {
        var refsIn = refsValue == null ? [] : (Array.isArray(refsValue) ? refsValue : [refsValue]);
        var resolved = [];
        var unresolved = [];
        refsIn.forEach(function (ref) {
          if (ref == null || text(ref) === '') return;
          var key = text(ref);
          var found = null;
          records.some(function (record) {
            if (record.key === key || record.route === key || String(record.index) === key) {
              found = record;
              return true;
            }
            return false;
          });
          if (found) {
            if (resolved.indexOf(found) < 0) resolved.push(found);
          } else if (unresolved.indexOf(key) < 0) {
            unresolved.push(key);
          }
        });
        return { edges: resolved, unresolved: unresolved };
      }

      function currentStep() {
        if (destroyed || !player) return null;
        var wrapper = player.getStep();
        return wrapper && wrapper.state ? wrapper.state : null;
      }

      function render(step, context) {
        refs = { graph: null, edges: Object.create(null), unresolved: Object.create(null), progress: null, stepIds: Object.create(null) };
        var wrap = make('div', 'nblk-flow__layout');
        var summary = make('div', 'nblk-flow__summary');
        var stepNode = step && step.nodeId != null ? text(step.nodeId) : '';
        var map = nodeMap();
        var exists = Boolean(stepNode && map[stepNode]);
        var stepIndex = context.index;
        var currentLabel = exists ? nodeLabel(stepNode) : (stepNode || '未指定节点');
        var summaryTitle = make('h3', 'nblk-flow__summary-title', '当前停点：' + currentLabel);
        var summaryMeta = make('p', 'nblk-flow__summary-meta',
          '第 ' + (stepIndex + 1) + ' / ' + state.steps.length + ' 个停点。节点关注由宿主停点数据指定。');
        summary.append(summaryTitle, summaryMeta);

        var records = edgeRecords();
        var focusRelation = resolveEdgeRefs(step && step.edgeIds, records);
        var changedRelation = resolveEdgeRefs(step && step.changedEdgeIds, records);
        var focusKeys = focusRelation.edges.map(function (record) { return record.key; });
        var changedKeys = changedRelation.edges.map(function (record) { return record.key; });

        var canvas = make('div', 'nblk-flow__canvas');
        var graphOptions = {
          nodes: state.nodes,
          edges: state.edges,
          layout: hasManualPositions(state.nodes) ? 'manual' : 'layered',
          focus: exists ? [stepNode] : [],
          changed: [],
          /* 边强调在图中由 Graph 的公开状态表达；关系区只保留文字说明与警告。 */
          edgeFocus: focusKeys,
          edgeChanged: changedKeys,
          label: (state.label || '流程') + '：' + currentLabel
        };
        var graph;
        if (!liveGraph) {
          graph = V.Graph.mount(canvas, graphOptions);
          liveGraph = graph;
        } else {
          /* 停点切换/flow.update 复用同一 Graph：节点与边按稳定 ID 保留目标，
             只更新 focus/edgeFocus/edgeChanged 与数据，避免每步重建 SVG。 */
          graph = liveGraph;
          canvas.appendChild(graph.el);
          graph.update(graphOptions);
        }
        refs.graph = graph;

        var canEdgeTargets = typeof graph.getEdgeTarget === 'function';
        var refsEdges = Object.create(null);
        var refsUnresolved = Object.create(null);
        var missingEdges = Object.create(null);
        function registerRecord(record) {
          if (!canEdgeTargets) return;
          var target = graph.getEdgeTarget(record.key);
          if (target) refsEdges[record.key] = target;
          else missingEdges[record.key] = record;
        }
        focusRelation.edges.forEach(registerRecord);
        changedRelation.edges.forEach(registerRecord);

        var relations = make('section', 'nblk-flow__relations');
        var relationsTitle = make('h4', 'nblk-flow__relations-title', '本步关系');
        relations.appendChild(relationsTitle);
        if (focusRelation.edges.length || changedRelation.edges.length) {
          relations.appendChild(make('p', 'nblk-flow__relations-meta',
            '边强调已画在图中；这里只补充起止节点、边标签和未解析引用。'));
        }
        var relationList = make('div', 'nblk-flow__relation-list');
        var changedOnly = changedRelation.edges.filter(function (record) {
          return focusRelation.edges.indexOf(record) < 0;
        });

        if (!focusRelation.edges.length && !changedRelation.edges.length &&
            !focusRelation.unresolved.length && !changedRelation.unresolved.length) {
          relationList.appendChild(make('p', 'nblk-flow__relation-empty',
            '本停点未指定边；当前关注节点仍由图中虚线标记。'));
        }

        function relationRow(record, tagText) {
          var row = make('div', 'nblk-flow__relation');
          row.setAttribute('data-edge-key', record.key);
          var tag = make('span', 'nblk-flow__relation-tag', tagText);
          var route = make('span', 'nblk-flow__relation-route',
            nodeLabel(record.from) + ' → ' + nodeLabel(record.to));
          var label = record.label
            ? make('span', 'nblk-flow__relation-label', record.label)
            : null;
          row.append(tag, route);
          if (label) row.appendChild(label);
          relationList.appendChild(row);
          return row;
        }

        focusRelation.edges.forEach(function (record) {
          var both = changedRelation.edges.indexOf(record) >= 0;
          var row = relationRow(record, both ? '当前边 · 变化边' : '当前边');
          if (canEdgeTargets) {
            if (!refsEdges[record.key]) row.classList.add('nblk-flow__relation--missing');
          } else {
            refsEdges[record.key] = row;   // 旧版 Graph 回退：关系行仍是可查询目标
          }
        });
        changedOnly.forEach(function (record) {
          var row = relationRow(record, '变化边');
          if (canEdgeTargets) {
            if (!refsEdges[record.key]) row.classList.add('nblk-flow__relation--missing');
          } else if (!refsEdges[record.key]) {
            refsEdges[record.key] = row;
          }
        });

        function addUnresolved(key, changedFlag) {
          var card = make('div', 'nblk-flow__relation nblk-flow__relation--missing');
          card.setAttribute('data-edge-key', key);
          var tag = make('span', 'nblk-flow__relation-tag', changedFlag ? '未找到变化边' : '未找到边');
          var msg = make('span', 'nblk-flow__relation-route',
            '停点引用了边 ' + key + '，但 edges 中没有匹配的 id、from -> to 或索引。');
          card.append(tag, msg);
          relationList.appendChild(card);
          refsUnresolved[key] = card;
        }
        focusRelation.unresolved.forEach(function (key) { addUnresolved(key, false); });
        changedRelation.unresolved.forEach(function (key) {
          if (!refsUnresolved[key]) addUnresolved(key, true);
        });

        if (canEdgeTargets) {
          Object.keys(missingEdges).forEach(function (key) {
            if (refsUnresolved[key]) return;
            var record = missingEdges[key];
            var card = make('div', 'nblk-flow__relation nblk-flow__relation--missing');
            card.setAttribute('data-edge-key', key);
            var tag = make('span', 'nblk-flow__relation-tag', '边不在图中');
            var msg = make('span', 'nblk-flow__relation-route',
              '边「' + record.key + '」引用存在，但 Graph 未渲染该边（端点无效或 ID 冲突）。');
            card.append(tag, msg);
            relationList.appendChild(card);
            refsUnresolved[key] = card;
          });
        }

        refs.edges = refsEdges;
        refs.unresolved = refsUnresolved;
        relations.appendChild(relationList);

        var noteHost = make('div', 'nblk-flow__note');
        var notice = null;
        if (step && step.note != null && text(step.note).trim()) {
          notice = UI.Notice.mount(noteHost, {
            title: '本步说明',
            content: step.note,
            tone: 'neutral'
          });
        }

        var progressHost = make('div', 'nblk-flow__progress');
        var stepsInstance = null;
        if (state.steps.length > 1) {
          var progressTitle = make('h4', 'nblk-flow__progress-title', '流程进度');
          progressHost.appendChild(progressTitle);
          stepsInstance = UI.Steps.mount(progressHost, {
            items: state.steps.map(function (item, index) {
              return { label: stepLabel(item, index, map) };
            }),
            current: stepIndex,
            clickable: false,
            orientation: 'horizontal'
          });
        }
        refs.progress = progressHost;
        /* 进度区只有当前停点一个实例；非当前 step id 不映射为目标。 */
        if (step && step.id != null) refs.stepIds[text(step.id)] = progressHost;

        var warning = null;
        if (stepNode && !exists) {
          warning = make('p', 'nblk-flow__warning',
            '当前停点的 nodeId「' + stepNode + '」不在 nodes 中，因此没有节点关注。');
          warning.setAttribute('role', 'status');
        }

        var aside = make('aside', 'nblk-flow__aside');
        aside.setAttribute('aria-label', '本步关系、说明与流程进度');
        aside.append(relations, noteHost, progressHost);
        var main = make('div', 'nblk-flow__main');
        main.append(canvas, aside);
        wrap.append(summary);
        if (warning) wrap.appendChild(warning);
        wrap.appendChild(main);
        context.stageEl.appendChild(wrap);

        return function cleanup() {
          safeDestroy(stepsInstance);
          safeDestroy(notice);
          /* Graph 保留给下一个停点/update 复用；由 destroyBlock 统一销毁。 */
          refs = { graph: null, edges: Object.create(null), unresolved: Object.create(null), progress: null, stepIds: Object.create(null) };
          wrap.remove();
        };
      }

      player = NoteBlocks.StepPlayer.mount(host, {
        steps: buildStepWrappers(),
        render: render,
        initialIndex: 0,
        labels: state.labels || undefined,
        onStep: function (index, wrapper, event) {
          if (destroyed) return;
          if (typeof state.onStep === 'function') {
            state.onStep(index, wrapper && wrapper.state ? wrapper.state : null, event);
          }
        },
        title: state.title,
        maxWidth: state.maxWidth,
        label: state.label || '流程步进'
      });
      player.el.classList.add('nblk-flow');

      function getTarget(id) {
        if (destroyed || id == null) return null;
        var key = text(id);
        if (refs.graph && typeof refs.graph.getTarget === 'function') {
          var nodeTarget = refs.graph.getTarget(key);
          if (nodeTarget) return nodeTarget;
        }
        if (key.indexOf('edge:') === 0) {
          var edgeKey = key.slice(5);
          return refs.edges[edgeKey] || refs.unresolved[edgeKey] || null;
        }
        if (refs.edges[key]) return refs.edges[key];
        if (refs.unresolved[key]) return refs.unresolved[key];
        if (refs.stepIds[key]) return refs.stepIds[key];
        return null;
      }

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        if (own(patch, 'nodes')) state.nodes = array(patch.nodes);
        if (own(patch, 'edges')) state.edges = array(patch.edges);
        if (own(patch, 'steps')) {
          state.steps = array(patch.steps).filter(function (step) { return step && typeof step === 'object'; });
        }
        if (own(patch, 'title')) state.title = patch.title == null ? '' : patch.title;
        if (own(patch, 'labels')) state.labels = patch.labels && typeof patch.labels === 'object' ? patch.labels : null;
        if (own(patch, 'onStep')) state.onStep = typeof patch.onStep === 'function' ? patch.onStep : null;
        if (own(patch, 'maxWidth')) state.maxWidth = patch.maxWidth;
        if (own(patch, 'label')) state.label = patch.label == null ? '' : text(patch.label);

        var stepsChanged = own(patch, 'nodes') || own(patch, 'edges') || own(patch, 'steps') || own(patch, 'label');
        var playerPatch = {
          title: state.title,
          maxWidth: state.maxWidth,
          label: state.label || '流程步进'
        };
        if (stepsChanged) playerPatch.steps = buildStepWrappers();
        if (own(patch, 'labels')) playerPatch.labels = state.labels;
        player.update(playerPatch);
      }

      function destroyBlock() {
        if (destroyed) return;
        destroyed = true;
        refs = { graph: null, edges: Object.create(null), unresolved: Object.create(null), progress: null, stepIds: Object.create(null) };
        safeDestroy(player);
        player = null;
        if (liveGraph) {
          safeDestroy(liveGraph);
          liveGraph = null;
        }
      }

      return {
        el: player.el,
        go: function (index) { if (!destroyed) player.go(index); },
        next: function () { if (!destroyed) player.next(); },
        prev: function () { if (!destroyed) player.prev(); },
        replay: function () { if (!destroyed) player.replay(); },
        reset: function () { if (!destroyed) player.reset(); },
        getStep: currentStep,
        getTarget: getTarget,
        update: update,
        destroy: destroyBlock
      };
    }
  };
})(window);

/* ---- source: src/blocks/sequence-diagram.js ---- */
/* NoteBlocks B08 — SequenceDiagram.
 * A bounded, host-data sequence diagram (participants, lifelines, ordered
 * messages, current message). It composes NoteBlocks.StepPlayer for stop
 * controls and caption; participant/lifeline/message drawing comes from the
 * public NoteViz.Flow.PacketFlow renderer. This block owns the stop player,
 * legend/hint, warnings, stable target mapping and the current-message scroll.
 * No automatic playback and no network access.
 * Loads after src/blocks/shared.js (internal helpers, not a public entry) and
 * after the viz-flow module (PacketFlow).
 */
(function (global) {
  'use strict';

  var NoteBlocks = global.NoteBlocks = global.NoteBlocks || {};

  var shared = global.NoteBlocksInternals;
  if (!shared) {
    throw new Error('NoteBlocks 组合块需要先加载 src/blocks/shared.js（内部共享文件）。');
  }
  var core = shared.core;
  var own = shared.own;
  var text = shared.text;
  var make = shared.make;
  var validateHost = shared.validateHost;
  var requireComponents = shared.requireComponents;
  var safeDestroy = shared.safeDestroy;
  var array = shared.array;
  var TYPES = {
    sync: { label: '同步' },
    async: { label: '异步' },
    return: { label: '返回' }
  };

  function typeInfo(value) {
    return TYPES[value] || TYPES.sync;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function resolveCurrent(value, messages) {
    if (value == null || !messages.length) return 0;
    if (typeof value === 'object') {
      if (value.id != null) return resolveCurrent(value.id, messages);
      if (value.index != null) return resolveCurrent(value.index, messages);
      return 0;
    }
    var raw = text(value).trim();
    if (!raw) return 0;
    for (var i = 0; i < messages.length; i += 1) {
      if (messages[i].id === raw) return i;
    }
    if (/^-?\d+$/.test(raw)) {
      var number = Number(raw);
      if (isFinite(number)) return clamp(Math.trunc(number), 0, messages.length - 1);
    }
    return 0;
  }

  function participantMap(participants) {
    var map = Object.create(null);
    participants.forEach(function (participant) {
      if (!map[participant.id]) map[participant.id] = participant;
    });
    return map;
  }

  NoteBlocks.SequenceDiagram = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host, 'NoteBlocks.SequenceDiagram');
      requireComponents('NoteBlocks.SequenceDiagram', ['NoteBlocks.StepPlayer', 'NoteUI.Button', 'NoteViz.Flow.PacketFlow']);
      var C = core();
      var input = options || {};
      var raw = {
        participants: array(input.participants),
        messages: array(input.messages),
        current: input.current,
        title: input.title == null ? '' : input.title,
        caption: input.caption == null ? '' : input.caption,
        label: input.label == null ? '' : text(input.label),
        maxWidth: input.maxWidth == null ? null : input.maxWidth
      };
      var destroyed = false;
      var player = null;
      var refs = { messages: Object.create(null), participants: Object.create(null) };
      var renderedIndex = -1;
      var transformed = normalizeData(raw);

      function normalizeData(data) {
        var warnings = [];
        var seenParticipants = Object.create(null);
        var participants = [];
        array(data.participants).forEach(function (source, index) {
          if (!source || typeof source !== 'object' || source.id == null || text(source.id) === '') {
            warnings.push('参与者 ' + (index + 1) + ' 缺少 id，已忽略。');
            return;
          }
          var id = text(source.id);
          if (seenParticipants[id]) {
            warnings.push('参与者 id「' + id + '」重复，只保留第一个。');
            return;
          }
          seenParticipants[id] = true;
          participants.push({
            id: id,
            label: source.label == null ? id : text(source.label),
            note: source.note == null ? '' : text(source.note),
            index: participants.length,
            raw: source
          });
        });
        var byId = participantMap(participants);
        var seenMessages = Object.create(null);
        var messages = [];
        array(data.messages).forEach(function (source, index) {
          if (!source || typeof source !== 'object') return;
          var id = source.id != null && text(source.id) !== '' ? text(source.id) : 'message-' + (index + 1);
          if (seenMessages[id]) {
            warnings.push('消息 id「' + id + '」重复；getTarget 会返回最后渲染的同 id 消息。');
          }
          seenMessages[id] = true;
          var from = source.from == null ? '' : text(source.from);
          var to = source.to == null ? '' : text(source.to);
          if (!byId[from] || !byId[to]) {
            warnings.push('消息「' + id + '」的 from/to 不在参与者中，未进入消息图与停点。');
            return;
          }
          var requestedType = source.type == null ? 'sync' : text(source.type);
          var type = TYPES[requestedType] ? requestedType : 'sync';
          if (!TYPES[requestedType]) {
            warnings.push('消息「' + id + '」的 type「' + requestedType + '」未知，按 sync 显示。');
          }
          var message = {
            id: id,
            index: messages.length,
            sourceIndex: index,
            from: from,
            to: to,
            fromLabel: byId[from].label,
            toLabel: byId[to].label,
            label: source.label == null ? '' : text(source.label),
            type: type,
            typeLabel: typeInfo(type).label,
            note: source.note == null ? '' : text(source.note),
            raw: source
          };
          messages.push(message);
        });
        return {
          participants: participants,
          messages: messages,
          warnings: warnings,
          participantById: byId
        };
      }

      function messageCaption(message, index) {
        if (!message) return '';
        var base = '第 ' + (index + 1) + ' 条：' + message.fromLabel + ' → ' + message.toLabel +
          '，' + (message.label || '未命名消息') + '（' + message.typeLabel + '）。';
        if (message.note) return base + ' ' + message.note;
        return base;
      }

      function messageStepWrappers() {
        return transformed.messages.map(function (message, index) {
          return {
            id: message.id,
            label: '消息 ' + (index + 1),
            caption: messageCaption(message, index),
            state: message
          };
        });
      }

      function initialIndex() {
        return resolveCurrent(raw.current, transformed.messages);
      }

      function currentMessage() {
        if (destroyed || !player) return null;
        var wrapper = player.getStep();
        return wrapper && wrapper.state ? wrapper.state : null;
      }

      /* PacketFlow 负责参与者、生命线、消息线与当前行；B08 只保留块级 chrome、
         StepPlayer 停点与公开目标映射，不再私有绘制消息图。 */
      function renderDiagram(message, context) {
        var index = context.index;
        renderedIndex = index;
        var wrap = make('div', 'nblk-sequence-diagram__layout');
        var contextText = text(raw.caption).trim();
        if (contextText) {
          wrap.appendChild(make('p', 'nblk-sequence-diagram__context', contextText));
        }
        if (transformed.warnings.length) {
          var warning = make('p', 'nblk-sequence-diagram__warning', transformed.warnings.join(' '));
          warning.setAttribute('role', 'status');
          wrap.appendChild(warning);
        }
        var Flow = global.NoteViz && global.NoteViz.Flow;
        if (!Flow || !Flow.PacketFlow || typeof Flow.PacketFlow.mount !== 'function') {
          throw new Error('NoteBlocks.SequenceDiagram 需要先加载 NoteViz.Flow.PacketFlow（viz-flow 模块）。');
        }
        var label = raw.label || '消息时序';
        var diagramHost = make('div', 'nblk-sequence-diagram__diagram');
        wrap.appendChild(diagramHost);
        var flow = Flow.PacketFlow.mount(diagramHost, {
          participants: transformed.participants.map(function (participant) {
            return { id: participant.id, label: participant.label, note: participant.note };
          }),
          messages: transformed.messages.map(function (item) {
            return {
              id: item.id,
              from: item.from,
              to: item.to,
              label: typeInfo(item.type).label + ' · ' + (item.label || '未命名消息'),
              type: item.type,
              note: item.note || ''
            };
          }),
          visibleCount: transformed.messages.length,
          focus: message ? message.id : null,
          showIndexes: true,
          label: label
        });
        var svg = flow.getTarget('svg');
        if (svg && svg.classList) svg.classList.add('nblk-sequence-diagram__svg');
        var viewport = flow.getTarget('viewport');
        if (viewport) {
          /* PacketFlow 负责绘图与横向滚动；B08 继续保留原视口的纵向高度语义。 */
          viewport.style.maxHeight = 'min(34rem, 66vh)';
          viewport.style.overflowY = 'auto';
          viewport.setAttribute('role', 'region');
          viewport.setAttribute('aria-label', label + '，可滚动查看全部参与者与消息');
        }
        var messageTargets = Object.create(null);
        var participantTargets = Object.create(null);
        transformed.participants.forEach(function (participant) {
          var node = flow.getTarget('participant:' + participant.id);
          if (!node) return;
          node.setAttribute('data-participant-id', participant.id);
          participantTargets[participant.id] = node;
        });
        transformed.messages.forEach(function (item) {
          var node = flow.getTarget('message:' + item.id);
          if (!node) return;
          node.setAttribute('data-message-id', item.id);
          messageTargets[item.id] = node;
        });
        refs = { messages: messageTargets, participants: participantTargets };

        var hint = make('p', 'nblk-sequence-diagram__hint',
          '消息按编号自上而下排列；实线为同步，虚线为异步，点线为返回。参与者较多时可在图内滚动。');
        var legend = make('div', 'nblk-sequence-diagram__legend');
        legend.setAttribute('role', 'group');
        legend.setAttribute('aria-label', '消息线型说明');
        [
          { key: 'sync', text: '同步：实线 + 实心箭头' },
          { key: 'async', text: '异步：虚线 + 实心箭头' },
          { key: 'return', text: '返回：点线 + 开口箭头' }
        ].forEach(function (item) {
          var entry = make('span', 'nblk-sequence-diagram__legend-item');
          entry.setAttribute('data-type', item.key);
          entry.textContent = item.text;
          legend.appendChild(entry);
        });
        wrap.append(hint, legend);
        context.stageEl.appendChild(wrap);

        if (message && messageTargets[message.id] && viewport &&
            typeof C.scrollIntoViewIfNeeded === 'function') {
          C.scrollIntoViewIfNeeded(messageTargets[message.id], viewport, {
            block: 'nearest',
            inline: 'nearest'
          });
        }

        return function cleanup() {
          refs = { messages: Object.create(null), participants: Object.create(null) };
          safeDestroy(flow);
          flow = null;
          wrap.remove();
        };
      }


      function applyCurrentAfterUpdate(patch) {
        if (!own(patch, 'current')) return;
        if (!transformed.messages.length) {
          renderedIndex = -1;
          return;
        }
        var target = resolveCurrent(raw.current, transformed.messages);
        player.go(target);
      }

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        if (own(patch, 'participants')) raw.participants = array(patch.participants);
        if (own(patch, 'messages')) raw.messages = array(patch.messages);
        if (own(patch, 'current')) raw.current = patch.current;
        if (own(patch, 'title')) raw.title = patch.title == null ? '' : patch.title;
        if (own(patch, 'caption')) raw.caption = patch.caption == null ? '' : patch.caption;
        if (own(patch, 'label')) raw.label = patch.label == null ? '' : text(patch.label);
        if (own(patch, 'maxWidth')) raw.maxWidth = patch.maxWidth;
        transformed = normalizeData(raw);

        var stepsChanged = own(patch, 'participants') || own(patch, 'messages') ||
          own(patch, 'title') || own(patch, 'caption') || own(patch, 'label');
        var playerPatch = {
          title: raw.title,
          maxWidth: raw.maxWidth,
          label: raw.label || '消息时序'
        };
        if (stepsChanged) playerPatch.steps = messageStepWrappers();
        player.update(playerPatch);
        applyCurrentAfterUpdate(patch);
        if (!transformed.messages.length) renderedIndex = -1;
      }

      function getState() {
        if (destroyed) return null;
        var message = currentMessage();
        if (!message) return null;
        var index = renderedIndex;
        if (index < 0 || !transformed.messages[index] || transformed.messages[index].id !== message.id) {
          index = transformed.messages.findIndex ? transformed.messages.findIndex(function (item) {
            return item.id === message.id;
          }) : 0;
        }
        if (index < 0) index = 0;
        return {
          index: index,
          total: transformed.messages.length,
          message: message,
          caption: messageCaption(message, index)
        };
      }

      function destroyBlock() {
        if (destroyed) return;
        destroyed = true;
        refs = { messages: Object.create(null), participants: Object.create(null) };
        safeDestroy(player);
        player = null;
      }

      player = NoteBlocks.StepPlayer.mount(host, {
        steps: messageStepWrappers(),
        render: renderDiagram,
        initialIndex: initialIndex(),
        title: raw.title,
        maxWidth: raw.maxWidth,
        label: raw.label || '消息时序'
      });
      player.el.classList.add('nblk-sequence-diagram');
      renderedIndex = transformed.messages.length ? initialIndex() : -1;

      return {
        el: player.el,
        go: function (index) { if (!destroyed) player.go(index); },
        next: function () { if (!destroyed) player.next(); },
        prev: function () { if (!destroyed) player.prev(); },
        replay: function () { if (!destroyed) player.replay(); },
        reset: function () { if (!destroyed) player.reset(); },
        getStep: currentMessage,
        getState: getState,
        getTarget: function (id) {
          if (destroyed || id == null) return null;
          var key = text(id);
          if (refs.messages[key]) return refs.messages[key];
          if (refs.participants[key]) return refs.participants[key];
          return null;
        },
        update: update,
        destroy: destroyBlock
      };
    }
  };
})(window);

/* ---- source: src/blocks/hierarchy.js ---- */
/* NoteBlocks B09 — HierarchyDetail.
 * Composes public NoteUI.TreeView, NoteUI.Panel, NoteUI.DataObject,
 * NoteUI.Badge and NoteUI.Notice. The tree is a browsable directory, not a
 * mechanism diagram. Selection and detail content are host-owned.
 * No network, no timers, no implicit selection callbacks from update().
 * Loads after src/blocks/shared.js (internal helpers, not a public entry).
 */
(function (global) {
  'use strict';

  var NoteBlocks = global.NoteBlocks = global.NoteBlocks || {};

  var shared = global.NoteBlocksInternals;
  if (!shared) {
    throw new Error('NoteBlocks 组合块需要先加载 src/blocks/shared.js（内部共享文件）。');
  }
  var core = shared.core;
  var ui = shared.ui;
  var own = shared.own;
  var text = shared.text;
  var isNode = shared.isNode;
  var make = shared.make;
  var clear = shared.clear;
  var setContent = shared.setContent;
  var uniqueId = shared.uniqueId;
  var validateHost = shared.validateHost;
  var requireComponents = shared.requireComponents;
  var safeDestroy = shared.safeDestroy;
  var DEFAULT_LABELS = {
    block: '层级与详情',
    tree: '目录',
    detail: '条目详情',
    empty: '从目录中选择一个条目以查看详情。',
    noDetail: '该条目暂时没有提供详情内容。',
    fields: '字段',
    note: '说明'
  };

  function normalizeLabels(input) {
    var result = Object.assign({}, DEFAULT_LABELS);
    if (typeof input === 'string' && input.trim()) {
      result.tree = input;
    } else if (input && typeof input === 'object') {
      Object.keys(DEFAULT_LABELS).forEach(function (key) {
        if (input[key] != null && text(input[key]).trim()) result[key] = text(input[key]);
      });
    }
    return result;
  }

  function findNode(nodes, id, trail) {
    if (id == null) return null;
    var wanted = text(id);
    var path = trail || [];
    var list = Array.isArray(nodes) ? nodes : [];
    for (var i = 0; i < list.length; i += 1) {
      var node = list[i];
      if (!node || typeof node !== 'object') continue;
      var current = path.concat(node.id == null ? [] : [text(node.id)]);
      if (node.id != null && text(node.id) === wanted) {
        return { node: node, path: current };
      }
      if (Array.isArray(node.children) && node.children.length) {
        var found = findNode(node.children, wanted, current);
        if (found) return found;
      }
    }
    return null;
  }

  function selectablePath(nodes, id) {
    var found = findNode(nodes, id, []);
    if (!found) return null;
    return {
      node: found.node,
      ancestors: found.path.slice(0, -1)
    };
  }

  function singleSelection(value) {
    if (Array.isArray(value)) return value.length ? value[0] : null;
    return value;
  }

  NoteBlocks.HierarchyDetail = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host, 'NoteBlocks.HierarchyDetail');
      requireComponents('NoteBlocks.HierarchyDetail', ['NoteUI.TreeView', 'NoteUI.Panel', 'NoteUI.DataObject', 'NoteUI.Badge', 'NoteUI.Notice']);
      var UI = ui();
      var C = core();
      var input = options || {};
      var state = {
        nodes: Array.isArray(input.nodes) ? input.nodes.slice() : [],
        selected: singleSelection(input.selected),
        details: input.details && typeof input.details === 'object' ? input.details : {},
        labels: normalizeLabels(input.labels),
        onSelect: typeof input.onSelect === 'function' ? input.onSelect : null
      };
      var destroyed = false;
      var tree = null;
      var treePanel = null;
      var detailPanel = null;
      var selectedId = state.selected == null ? null : text(state.selected);
      var detailInstances = [];
      var renderedDetailId = null;
      var titleId = uniqueId('nblk-hierarchy-detail-title');

      var root = make('section', 'nblk-hierarchy');
      root.setAttribute('role', 'group');
      root.setAttribute('aria-label', state.labels.block);

      treePanel = UI.Panel.mount(root, {
        title: state.labels.tree,
        padding: 'sm',
        tone: 'plain'
      });
      var treeHost = make('div', 'nblk-hierarchy__tree');
      treePanel.body.appendChild(treeHost);

      detailPanel = UI.Panel.mount(root, {
        title: state.labels.detail,
        padding: 'sm',
        tone: 'plain'
      });
      var detailScroll = make('div', 'nblk-hierarchy__detail-scroll');
      detailScroll.tabIndex = 0;
      detailScroll.setAttribute('role', 'region');
      detailScroll.setAttribute('aria-label', state.labels.detail);
      detailPanel.body.appendChild(detailScroll);

      function detailEntry(id) {
        if (id == null) return null;
        var key = text(id);
        return state.details && own(state.details, key) ? state.details[key] : null;
      }

      function nodeLabel(id) {
        var found = findNode(state.nodes, id, []);
        return found && found.node && found.node.label != null ? text(found.node.label) : (id == null ? '' : text(id));
      }

      function clearDetail() {
        detailInstances.forEach(safeDestroy);
        detailInstances = [];
        clear(detailScroll);
      }

      function normalizeFields(value) {
        if (Array.isArray(value)) return value;
        if (value && typeof value === 'object' && !isNode(value)) {
          return Object.keys(value).map(function (key) {
            return { label: key, value: value[key] };
          });
        }
        return [];
      }

      function renderDetail() {
        var previousTop = detailScroll.scrollTop;
        var nextId = selectedId;
        var keepScroll = nextId === renderedDetailId;
        clearDetail();
        var entry = detailEntry(nextId);
        var objectLabel = nodeLabel(nextId);

        if (nextId == null) {
          var emptyNotice = UI.Notice.mount(detailScroll, {
            title: state.labels.empty,
            content: '目录选中项会同步到这里；选择变化不会重建目录树。',
            tone: 'neutral'
          });
          detailInstances.push(emptyNotice);
          renderedDetailId = null;
          detailScroll.scrollTop = 0;
          return;
        }

        var heading = make('h3', 'nblk-hierarchy__detail-title');
        heading.id = titleId;
        heading.setAttribute('aria-live', 'polite');
        heading.textContent = entry && entry.title != null
          ? text(entry.title)
          : (objectLabel || text(nextId));
        detailScroll.appendChild(heading);
        var subtitle = make('p', 'nblk-hierarchy__detail-id',
          '目录项：' + (objectLabel || text(nextId)));
        detailScroll.appendChild(subtitle);

        if (!entry) {
          var noDetail = UI.Notice.mount(detailScroll, {
            title: state.labels.noDetail,
            content: '目录仍保持选中；宿主可在 details 中补充该 id 的详情。',
            tone: 'neutral'
          });
          detailInstances.push(noDetail);
          renderedDetailId = nextId;
          detailScroll.scrollTop = keepScroll ? previousTop : 0;
          return;
        }

        var fields = normalizeFields(entry.fields);
        if (fields.length) {
          var fieldSection = make('section', 'nblk-hierarchy__fields-section');
          fieldSection.setAttribute('aria-label', state.labels.fields);
          var fieldsHeading = make('h4', 'nblk-hierarchy__section-title', state.labels.fields);
          fieldSection.appendChild(fieldsHeading);
          var fieldsGrid = make('div', 'nblk-hierarchy__fields');
          fields.forEach(function (field, index) {
            var source = field && typeof field === 'object' ? field : { value: field };
            var fieldWrap = make('div', 'nblk-hierarchy__field');
            if (source.changed) {
              var badge = UI.Badge.mount(fieldWrap, { label: '本步变化', tone: 'warning' });
              detailInstances.push(badge);
            }
            var label = source.label != null ? text(source.label)
              : (source.name != null ? text(source.name)
                : (source.key != null ? text(source.key) : '字段 ' + (index + 1)));
            var value = source.value == null ? '' : source.value;
            var unit = source.unit == null ? '' : text(source.unit).trim();
            if (unit && !isNode(value)) value = text(value) + ' ' + unit;
            else if (unit && isNode(value)) {
              var valueWrap = make('span', 'nblk-hierarchy__value-with-unit');
              valueWrap.appendChild(value);
              valueWrap.appendChild(make('span', 'nblk-hierarchy__unit', ' ' + unit));
              value = valueWrap;
            }
            var dataObject = UI.DataObject.mount(fieldWrap, {
              label: label,
              value: value,
              caption: source.caption == null ? (source.note == null ? '' : source.note) : source.caption,
              attention: Boolean(source.attention),
              changed: Boolean(source.changed)
            });
            detailInstances.push(dataObject);
            fieldsGrid.appendChild(fieldWrap);
          });
          fieldSection.appendChild(fieldsGrid);
          detailScroll.appendChild(fieldSection);
        }

        if (entry.content != null && !(typeof entry.content === 'string' && !entry.content.trim())) {
          var contentSection = make('section', 'nblk-hierarchy__content-section');
          contentSection.setAttribute('aria-label', '详情内容');
          var content = make('div', 'nblk-hierarchy__content');
          setContent(content, entry.content);
          contentSection.appendChild(content);
          detailScroll.appendChild(contentSection);
        }

        if (entry.note != null && text(entry.note).trim()) {
          var noteHost = make('div', 'nblk-hierarchy__note');
          var notice = UI.Notice.mount(noteHost, {
            title: state.labels.note,
            content: entry.note,
            tone: 'neutral'
          });
          detailInstances.push(notice);
          detailScroll.appendChild(noteHost);
        }

        renderedDetailId = nextId;
        detailScroll.scrollTop = keepScroll ? previousTop : 0;
      }

      function revealSelected() {
        if (!tree || selectedId == null) return;
        var target = typeof tree.getTarget === 'function' ? tree.getTarget(selectedId) : null;
        if (target && typeof C.scrollIntoViewIfNeeded === 'function') {
          C.scrollIntoViewIfNeeded(target, tree.el, { block: 'nearest', inline: 'nearest' });
        }
      }

      function syncSelectionFromTree(reveal) {
        var value = tree.getSelected();
        selectedId = value == null ? null : text(value);
        renderDetail();
        if (reveal) revealSelected();
      }

      function expandAncestors(id) {
        var path = selectablePath(state.nodes, id);
        if (!path) return null;
        path.ancestors.forEach(function (ancestorId) {
          try { tree.expand(ancestorId, true); } catch (error) { /* public method; keep going */ }
        });
        return path;
      }

      function selectInternal(id, settings) {
        if (destroyed) return false;
        var requested = singleSelection(id);
        var targetId = requested == null ? null : text(requested);
        var path = targetId == null ? null : selectablePath(state.nodes, targetId);
        if (targetId != null && !path) return false;
        var previous = selectedId;
        if (targetId != null) expandAncestors(targetId);
        try {
          tree.select(targetId, { silent: true });
        } catch (error) {
          return false;
        }
        syncSelectionFromTree(Boolean(settings && settings.reveal));
        if (previous !== selectedId && settings && settings.notify && typeof state.onSelect === 'function') {
          state.onSelect(selectedId, settings.event || null);
        }
        return previous !== selectedId;
      }

      function onTreeSelect(selected, event) {
        if (destroyed) return;
        selectedId = selected == null ? null : text(selected);
        renderDetail();
        if (typeof state.onSelect === 'function') state.onSelect(selectedId, event);
      }

      var initialPath = state.selected == null ? null : selectablePath(state.nodes, state.selected);
      var initialExpanded = initialPath ? initialPath.ancestors : [];
      tree = UI.TreeView.mount(treeHost, {
        nodes: state.nodes,
        expanded: initialExpanded,
        selected: state.selected,
        multi: false,
        label: state.labels.tree,
        onSelect: onTreeSelect
      });
      selectedId = tree.getSelected();
      if (selectedId != null) selectedId = text(selectedId);
      renderDetail();

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        var nodesChanged = own(patch, 'nodes');
        var labelsChanged = own(patch, 'labels');
        if (nodesChanged) state.nodes = Array.isArray(patch.nodes) ? patch.nodes.slice() : [];
        if (own(patch, 'details')) {
          state.details = patch.details && typeof patch.details === 'object' ? patch.details : {};
        }
        if (own(patch, 'onSelect')) state.onSelect = typeof patch.onSelect === 'function' ? patch.onSelect : null;
        if (labelsChanged) {
          if (typeof patch.labels === 'string') state.labels = normalizeLabels(patch.labels);
          else if (patch.labels && typeof patch.labels === 'object') {
            state.labels = normalizeLabels(Object.assign({}, state.labels, patch.labels));
          } else {
            state.labels = normalizeLabels(null);
          }
        }

        var treePatch = {};
        if (nodesChanged) treePatch.nodes = state.nodes;
        if (labelsChanged) treePatch.label = state.labels.tree;
        if (Object.keys(treePatch).length) tree.update(treePatch);

        /* 文案更新只改面板与详情，不重复重建详情一次。 */
        if (labelsChanged) {
          root.setAttribute('aria-label', state.labels.block);
          treePanel.update({ title: state.labels.tree });
          detailPanel.update({ title: state.labels.detail });
          detailScroll.setAttribute('aria-label', state.labels.detail);
        }

        if (own(patch, 'selected')) {
          selectInternal(patch.selected, { reveal: true });
        } else {
          var current = tree.getSelected();
          selectedId = current == null ? null : text(current);
          if (selectedId != null) {
            expandAncestors(selectedId);
            revealSelected();
          }
          renderDetail();
        }
      }

      function destroyBlock() {
        if (destroyed) return;
        destroyed = true;
        clearDetail();
        safeDestroy(tree);
        tree = null;
        safeDestroy(treePanel);
        treePanel = null;
        safeDestroy(detailPanel);
        detailPanel = null;
        root.remove();
      }

      host.appendChild(root);
      if (selectedId != null) revealSelected();

      return {
        el: root,
        select: function (id, selectOptions) {
          if (destroyed) return false;
          var settings = selectOptions && typeof selectOptions === 'object' ? selectOptions : {};
          var silent = settings.silent === true;
          return selectInternal(id, {
            reveal: true,
            notify: !silent,
            event: settings.event || null
          });
        },
        getSelected: function () {
          if (destroyed || !tree) return null;
          var value = tree.getSelected();
          return value == null ? null : value;
        },
        getTarget: function (id) {
          if (destroyed || id == null) return null;
          if (text(id) === 'detail') return detailPanel ? detailPanel.el : null;
          return tree && typeof tree.getTarget === 'function' ? tree.getTarget(id) : null;
        },
        update: update,
        destroy: destroyBlock
      };
    }
  };
})(window);

/* ---- source: src/blocks/chart-explain.js ---- */
/* NoteBlocks B10 — ChartExplain.
 * Composes public NoteBlocks.StepPlayer, NoteViz.Chart and NoteUI.Notice.
 * Chart data is host-owned and stays unchanged between stops; each stop only
 * changes chart focus/changed marks and the caption. No automatic playback,
 * no derived trends, no multiple simultaneous value changes.
 * Loads after src/blocks/shared.js (internal helpers, not a public entry).
 */
(function (global) {
  'use strict';

  var NoteBlocks = global.NoteBlocks = global.NoteBlocks || {};

  var shared = global.NoteBlocksInternals;
  if (!shared) {
    throw new Error('NoteBlocks 组合块需要先加载 src/blocks/shared.js（内部共享文件）。');
  }
  var ui = shared.ui;
  var viz = shared.viz;
  var own = shared.own;
  var text = shared.text;
  var make = shared.make;
  var validateHost = shared.validateHost;
  var requireComponents = shared.requireComponents;
  var safeDestroy = shared.safeDestroy;
  var stepArray = shared.stepArray;
  var stepWrappers = shared.stepWrappers;

  var CHART_DEFAULTS = {
    type: 'bar',
    data: null,
    series: null,
    labels: null,
    height: 300,
    valueFormat: null,
    table: true,
    label: '',
    unit: '',
    xLabel: '',
    yLabel: ''
  };

  function normalizeChart(value) {
    var result = Object.assign({}, CHART_DEFAULTS);
    if (value && typeof value === 'object') {
      Object.keys(value).forEach(function (key) { result[key] = value[key]; });
    }
    if (!own(value || {}, 'table')) result.table = true;
    return result;
  }

  NoteBlocks.ChartExplain = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host, 'NoteBlocks.ChartExplain');
      requireComponents('NoteBlocks.ChartExplain', ['NoteViz.Chart', 'NoteUI.Notice', 'NoteBlocks.StepPlayer']);
      var UI = ui();
      var V = viz();
      var input = options || {};
      var state = {
        chart: normalizeChart(input.chart),
        steps: stepArray(input.steps),
        title: input.title == null ? '' : input.title,
        labels: input.labels && typeof input.labels === 'object' ? input.labels : null,
        onStep: typeof input.onStep === 'function' ? input.onStep : null,
        maxWidth: input.maxWidth == null ? null : input.maxWidth,
        label: input.label == null ? '' : text(input.label)
      };
      var destroyed = false;
      var player = null;
      var refs = { chart: null, step: null };

      function chartOptions(step) {
        var chart = state.chart;
        return {
          type: chart.type,
          data: chart.data,
          series: chart.series,
          labels: chart.labels,
          focus: step && step.focus != null ? step.focus : null,
          changed: step && step.changed != null ? step.changed : null,
          colors: chart.colors,
          height: chart.height,
          valueFormat: chart.valueFormat,
          table: chart.table !== false,
          label: chart.label == null ? '' : chart.label,
          unit: chart.unit == null ? '' : chart.unit,
          xLabel: chart.xLabel == null ? '' : chart.xLabel,
          yLabel: chart.yLabel == null ? '' : chart.yLabel,
          animate: false
        };
      }

      function render(step, context) {
        refs = { chart: null, step: step || null };
        var wrap = make('div', 'nblk-chart-explain__layout');
        var chartHost = make('div', 'nblk-chart-explain__chart');
        var chartInstance = V.Chart.mount(chartHost, chartOptions(step));
        refs.chart = chartInstance;
        wrap.appendChild(chartHost);

        var tableEnabled = state.chart.table !== false;
        if (tableEnabled) {
          wrap.appendChild(make('p', 'nblk-chart-explain__hint',
            '停点切换会重新挂载图表，数据表因此回到关闭状态；展开后可核对完整读数。'));
        }

        var noteNotice = null;
        if (step && step.note != null && text(step.note).trim()) {
          var noteHost = make('div', 'nblk-chart-explain__note');
          noteNotice = UI.Notice.mount(noteHost, {
            title: '本步说明',
            content: step.note,
            tone: 'neutral'
          });
          wrap.appendChild(noteHost);
        }

        context.stageEl.appendChild(wrap);

        return function cleanup() {
          safeDestroy(noteNotice);
          safeDestroy(chartInstance);
          refs = { chart: null, step: null };
          wrap.remove();
        };
      }

      player = NoteBlocks.StepPlayer.mount(host, {
        steps: stepWrappers(state.steps),
        render: render,
        initialIndex: 0,
        labels: state.labels || undefined,
        onStep: function (index, wrapper, event) {
          if (destroyed) return;
          if (typeof state.onStep === 'function') {
            state.onStep(index, wrapper && wrapper.state ? wrapper.state : null, event);
          }
        },
        title: state.title,
        maxWidth: state.maxWidth,
        label: state.label || '图表讲解'
      });
      player.el.classList.add('nblk-chart-explain');

      function currentStep() {
        if (destroyed || !player) return null;
        var wrapper = player.getStep();
        return wrapper && wrapper.state ? wrapper.state : null;
      }

      function getTarget(id) {
        if (destroyed || !refs.chart || id == null) return null;
        var key = text(id);
        var step = currentStep();
        if (step && step.id != null && key === text(step.id)) return refs.chart.el;
        if (key === 'chart') return refs.chart.el;
        return typeof refs.chart.getTarget === 'function' ? refs.chart.getTarget(key) : null;
      }

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        if (own(patch, 'chart')) state.chart = normalizeChart(patch.chart);
        if (own(patch, 'steps')) state.steps = stepArray(patch.steps);
        if (own(patch, 'title')) state.title = patch.title == null ? '' : patch.title;
        if (own(patch, 'labels')) state.labels = patch.labels && typeof patch.labels === 'object' ? patch.labels : null;
        if (own(patch, 'onStep')) state.onStep = typeof patch.onStep === 'function' ? patch.onStep : null;
        if (own(patch, 'maxWidth')) state.maxWidth = patch.maxWidth;
        if (own(patch, 'label')) state.label = patch.label == null ? '' : text(patch.label);

        var stepsChanged = own(patch, 'chart') || own(patch, 'steps');
        var playerPatch = {
          title: state.title,
          maxWidth: state.maxWidth,
          label: state.label || '图表讲解'
        };
        if (stepsChanged) playerPatch.steps = stepWrappers(state.steps);
        if (own(patch, 'labels')) playerPatch.labels = state.labels;
        player.update(playerPatch);
      }

      function destroyBlock() {
        if (destroyed) return;
        destroyed = true;
        refs = { chart: null, step: null };
        safeDestroy(player);
        player = null;
      }

      return {
        el: player.el,
        go: function (index) { if (!destroyed) player.go(index); },
        next: function () { if (!destroyed) player.next(); },
        prev: function () { if (!destroyed) player.prev(); },
        replay: function () { if (!destroyed) player.replay(); },
        reset: function () { if (!destroyed) player.reset(); },
        getStep: currentStep,
        getTarget: getTarget,
        update: update,
        destroy: destroyBlock
      };
    }
  };
})(window);

/* ---- source: src/blocks/stage.js ---- */
/* NoteBlocks B02 — StepPlayer（稳定状态步进）。
 * B01 DemoStage 已拆到 src/blocks/demo-stage.js；本文件只保留 B02 及其中私有 helper。
 * Depends on: 先加载 src/blocks/shared.js，再加载 src/blocks/demo-stage.js
 * （StepPlayer 在 mount 时使用 NoteBlocks.DemoStage）。
 * 不复制 DemoStage 实现，也不另造播放器；经典脚本，无模块 / 无网络 / 无 eval。 */
(function (global) {
  'use strict';

  var NoteBlocks = global.NoteBlocks = global.NoteBlocks || {};

  var shared = global.NoteBlocksInternals;
  if (!shared) {
    throw new Error('NoteBlocks 组合块需要先加载 src/blocks/shared.js（内部共享文件）。');
  }
  var core = shared.core;
  var ui = shared.ui;
  var own = shared.own;
  var text = shared.text;
  var make = shared.make;
  var clear = shared.clear;
  var validateHost = shared.validateHost;
  var requireComponents = shared.requireComponents;

  /* =====================================================================
   * B02 — StepPlayer
   * ===================================================================== */

  var STEP_LABELS = {
    prev: '上一步',
    next: '下一步',
    jump: '跳到停点',
    replay: '重看',
    reset: '重来',
    empty: '尚未提供停点。'
  };

  function stepNumber(value, count, fallback) {
    var number = typeof value === 'number' ? value : Number(value);
    if (!isFinite(number)) number = fallback;
    number = Math.trunc(number);
    if (!count) return 0;
    return Math.max(0, Math.min(count - 1, number));
  }

  function mergeStepLabels(current, patch) {
    var next = Object.assign({}, STEP_LABELS, current || {});
    if (patch && typeof patch === 'object') {
      Object.keys(patch).forEach(function (key) {
        if (patch[key] != null && String(patch[key]) !== '') next[key] = patch[key];
      });
    }
    return next;
  }

  function readableError(error) {
    if (error && error.message) return text(error.message);
    if (error == null) return '宿主 render 未返回可显示的内容。';
    return text(error);
  }

  NoteBlocks.StepPlayer = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      requireComponents('NoteBlocks', ['NoteUI.Button', 'NoteUI.Stack', 'NoteUI.Inline']);
      if (!NoteBlocks.DemoStage || typeof NoteBlocks.DemoStage.mount !== 'function') {
        throw new Error('NoteBlocks.StepPlayer 需要先加载 NoteBlocks.DemoStage。');
      }
      var UI = ui();
      var C = core();
      var input = options || {};
      var state = {
        steps: Array.isArray(input.steps) ? input.steps.slice() : [],
        render: input.render,
        initialIndex: input.initialIndex == null ? 0 : input.initialIndex,
        labels: mergeStepLabels(null, input.labels),
        onStep: input.onStep,
        title: input.title,
        maxWidth: input.maxWidth,
        label: input.label
      };
      var destroyed = false;
      var index = stepNumber(state.initialIndex, state.steps.length, 0);
      state.initialIndex = index;
      var pendingCleanup = null;
      var lastCaption = null;
      var buttonHolder = make('div', 'nblk-step-player__button-holder');
      var eventBag = null;

      var stage = NoteBlocks.DemoStage.mount(host, {
        title: state.title || '',
        stage: '',
        caption: '',
        controls: [],
        maxWidth: state.maxWidth,
        label: state.label || '分步演示'
      });
      stage.el.classList.add('nblk-step-player');
      stage.el.setAttribute('data-step-count', String(state.steps.length));
      stage.el.setAttribute('data-step-index', String(index));

      function makeButton(label, variant, click) {
        return UI.Button.mount(buttonHolder, {
          label: label,
          variant: variant,
          disabled: true,
          onClick: click
        });
      }

      var prevButton = makeButton(state.labels.prev, 'secondary', function (event) {
        userMove(index - 1, event);
      });
      var nextButton = makeButton(state.labels.next, 'primary', function (event) {
        userMove(index + 1, event);
      });
      var replayButton = makeButton(state.labels.replay, 'quiet', function () {
        if (!destroyed) renderCurrent(true);
      });
      var resetButton = makeButton(state.labels.reset, 'quiet', function (event) {
        userMove(stepNumber(state.initialIndex, state.steps.length, 0), event, true);
      });

      var jumpWrap = make('label', 'nblk-step-player__jump');
      var jumpText = make('span', 'nblk-step-player__jump-label', state.labels.jump);
      var select = make('select', 'nblk-step-player__select');
      select.setAttribute('aria-label', state.labels.jump);
      jumpWrap.append(jumpText, select);

      stage.setControls([
        prevButton.el,
        nextButton.el,
        jumpWrap,
        replayButton.el,
        resetButton.el
      ]);

      function optionLabel(step, position) {
        var explicit = step && step.label != null ? text(step.label).trim() : '';
        if (explicit) return explicit;
        return '停点 ' + (position + 1);
      }

      function rebuildOptions() {
        var fragment = global.document.createDocumentFragment();
        if (!state.steps.length) {
          var emptyOption = make('option', '', state.labels.empty);
          emptyOption.value = '';
          emptyOption.disabled = true;
          fragment.appendChild(emptyOption);
        } else {
          state.steps.forEach(function (step, position) {
            var option = make('option', '', optionLabel(step, position));
            option.value = String(position);
            fragment.appendChild(option);
          });
        }
        select.replaceChildren(fragment);
        select.disabled = state.steps.length < 2;
        select.value = state.steps.length ? String(index) : '';
      }

      function syncControls() {
        var count = state.steps.length;
        var hasStep = count > 0;
        prevButton.update({ disabled: !hasStep || index <= 0 });
        nextButton.update({ disabled: !hasStep || index >= count - 1 });
        replayButton.update({ disabled: !hasStep });
        resetButton.update({ disabled: !hasStep });
        select.disabled = count < 2;
        select.value = hasStep ? String(index) : '';
      }

      function refreshControlLabels() {
        prevButton.update({ label: state.labels.prev });
        nextButton.update({ label: state.labels.next });
        replayButton.update({ label: state.labels.replay });
        resetButton.update({ label: state.labels.reset });
        jumpText.textContent = state.labels.jump;
        select.setAttribute('aria-label', state.labels.jump);
        rebuildOptions();
      }

      function disposeRender() {
        var cleanup = pendingCleanup;
        pendingCleanup = null;
        if (typeof cleanup === 'function') {
          try { cleanup(); } catch (error) {
            if (global.console && typeof global.console.error === 'function') {
              global.console.error('NoteBlocks.StepPlayer：render cleanup 失败。', error);
            }
          }
        }
        clear(stage.stageEl);
      }

      function showRenderError(step, error) {
        var box = make('div', 'nblk-step-player__error');
        box.setAttribute('role', 'alert');
        box.appendChild(make('p', 'nblk-step-player__error-title', '此停点无法显示'));
        box.appendChild(make('p', 'nblk-step-player__error-message',
          '宿主 render 执行失败：' + readableError(error)));
        box.appendChild(make('p', 'nblk-step-player__error-help',
          '可用“重看”重试；其他停点仍可切换。'));
        stage.stageEl.appendChild(box);
        if (global.console && typeof global.console.error === 'function') {
          global.console.error('NoteBlocks.StepPlayer：停点 ' + (index + 1) + ' 渲染失败。', error, step);
        }
      }

      function updateCaption() {
        var current = state.steps[index];
        var caption = current && current.caption != null ? text(current.caption) : '';
        if (caption !== lastCaption) {
          lastCaption = caption;
          stage.setCaption(caption);
        }
      }

      function renderCurrent(replay) {
        if (destroyed) return;
        var hasSteps = state.steps.length > 0;
        stage.el.setAttribute('data-step-count', String(state.steps.length));
        stage.el.setAttribute('data-step-index', String(hasSteps ? index : 0));

        disposeRender();
        if (!hasSteps) {
          index = 0;
          lastCaption = '';
          stage.setCaption('');
          var empty = make('p', 'nblk-step-player__empty', state.labels.empty);
          empty.setAttribute('role', 'status');
          stage.stageEl.appendChild(empty);
          syncControls();
          return;
        }

        index = stepNumber(index, state.steps.length, 0);
        stage.el.setAttribute('data-step-index', String(index));
        updateCaption();
        var step = state.steps[index];
        var renderFunction = state.render;
        if (typeof renderFunction !== 'function') {
          showRenderError(step, new TypeError('缺少 render 函数'));
        } else {
          try {
            var cleanup = renderFunction(step ? step.state : undefined, {
              index: index,
              replay: Boolean(replay),
              stageEl: stage.stageEl
            });
            if (typeof cleanup === 'function') pendingCleanup = cleanup;
          } catch (error) {
            disposeRender();
            showRenderError(step, error);
          }
        }
        syncControls();
      }

      function userMove(target, event, alwaysRender) {
        if (destroyed || !state.steps.length) return;
        var nextIndex = stepNumber(target, state.steps.length, index);
        var changed = nextIndex !== index;
        if (!changed && !alwaysRender) return;
        index = nextIndex;
        renderCurrent(false);
        if (changed && typeof state.onStep === 'function') {
          state.onStep(index, state.steps[index], event);
        }
      }

      function go(target) {
        if (destroyed || !state.steps.length) return;
        var number = typeof target === 'number' ? target : Number(target);
        if (!isFinite(number)) return;
        var nextIndex = stepNumber(number, state.steps.length, index);
        if (nextIndex === index) return;
        index = nextIndex;
        renderCurrent(false);
      }

      function next() {
        if (destroyed || index >= state.steps.length - 1) return;
        index += 1;
        renderCurrent(false);
      }

      function prev() {
        if (destroyed || index <= 0) return;
        index -= 1;
        renderCurrent(false);
      }

      function replay() {
        if (destroyed || !state.steps.length) return;
        renderCurrent(true);
      }

      function reset() {
        if (destroyed || !state.steps.length) return;
        index = stepNumber(state.initialIndex, state.steps.length, 0);
        renderCurrent(false);
      }

      function getStep() {
        if (destroyed) return null;
        return state.steps[index] || null;
      }

      function getState() {
        var step = getStep();
        return step ? step.state : null;
      }

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        var needsRender = false;
        var needsControls = false;
        var needsStageOptions = false;
        if (own(patch, 'steps')) {
          state.steps = Array.isArray(patch.steps) ? patch.steps.slice() : [];
          index = stepNumber(index, state.steps.length, 0);
          state.initialIndex = stepNumber(state.initialIndex, state.steps.length, 0);
          needsRender = true;
          needsControls = true;
        }
        if (own(patch, 'render')) {
          state.render = patch.render;
          needsRender = true;
        }
        if (own(patch, 'initialIndex')) {
          state.initialIndex = stepNumber(patch.initialIndex, state.steps.length, 0);
        }
        if (own(patch, 'labels')) {
          state.labels = mergeStepLabels(state.labels, patch.labels);
          needsControls = true;
        }
        if (own(patch, 'onStep')) state.onStep = patch.onStep;
        if (own(patch, 'title')) { state.title = patch.title; needsStageOptions = true; }
        if (own(patch, 'maxWidth')) { state.maxWidth = patch.maxWidth; needsStageOptions = true; }
        if (own(patch, 'label')) { state.label = patch.label; needsStageOptions = true; }
        if (needsStageOptions) {
          stage.update({
            title: state.title == null ? '' : state.title,
            maxWidth: state.maxWidth,
            label: state.label || '分步演示'
          });
        }
        if (needsRender) {
          renderCurrent(false);
        }
        if (needsControls) {
          refreshControlLabels();
          syncControls();
        }
      }

      function destroy() {
        if (destroyed) return;
        destroyed = true;
        disposeRender();
        if (eventBag) eventBag.clear();
        else select.removeEventListener('change', onSelectChange);
        try { prevButton.destroy(); } catch (error) { /* optional */ }
        try { nextButton.destroy(); } catch (error) { /* optional */ }
        try { replayButton.destroy(); } catch (error) { /* optional */ }
        try { resetButton.destroy(); } catch (error) { /* optional */ }
        try { stage.destroy(); } catch (error) { /* optional */ }
        buttonHolder.remove();
      }

      function onSelectChange(event) {
        if (destroyed) return;
        var target = Number(select.value);
        if (!isFinite(target) || target === index) return;
        userMove(target, event);
      }

      if (C.listeners) {
        eventBag = C.listeners(select);
        eventBag.on('change', onSelectChange);
      } else {
        select.addEventListener('change', onSelectChange);
      }

      rebuildOptions();
      renderCurrent(false);
      refreshControlLabels();
      syncControls();

      return {
        el: stage.el,
        go: go,
        next: next,
        prev: prev,
        replay: replay,
        reset: reset,
        getStep: getStep,
        getState: getState,
        update: update,
        destroy: destroy
      };
    }
  };
})(window);

/* ---- source: src/blocks/compare.js ---- */
/* NoteBlocks comparison compositions — B03 RuleCompare, B04 StateCompare.
 * Plain JavaScript; depends on NoteCore, NoteUI.Table/Notice,
 * NoteViz.CompareView, NoteUI.DataObject/Badge and optionally NoteExpr.Focus.
 * This file composes public components only. It does not copy their markup.
 * Loads after src/blocks/shared.js (internal helpers, not a public entry).
 * No network, no eval, no HTML parsing. */
(function (global) {
  'use strict';

  var NoteBlocks = global.NoteBlocks = global.NoteBlocks || {};

  var shared = global.NoteBlocksInternals;
  if (!shared) {
    throw new Error('NoteBlocks 组合块需要先加载 src/blocks/shared.js（内部共享文件）。');
  }
  var core = shared.core;
  var ui = shared.ui;
  var viz = shared.viz;
  var text = shared.text;
  var isNode = shared.isNode;
  var make = shared.make;
  var clear = shared.clear;
  var setContent = shared.setContent;
  var uniqueId = shared.uniqueId;
  var validateHost = shared.validateHost;
  var requireComponents = shared.requireComponents;
  function contentText(value) {
    if (value == null) return '';
    if (isNode(value)) return text(value.textContent).trim();
    return text(value).trim();
  }

  function hasContent(value) {
    if (value == null) return false;
    if (typeof value === 'string') return value.trim() !== '';
    if (isNode(value)) return true;
    return true;
  }

  /* =====================================================================
   * B03 — RuleCompare
   * ===================================================================== */

  var DEFAULT_RULE_COLUMNS = [
    { key: 'rule', label: '规则', width: '18%' },
    { key: 'condition', label: '条件', width: '27%' },
    { key: 'result', label: '结果', width: '27%' },
    { key: 'note', label: '说明', width: '28%' }
  ];

  function normaliseColumns(input) {
    if (Array.isArray(input) && input.length) {
      var columns = input.filter(function (column) {
        return column && typeof column === 'object' && column.key != null && text(column.key) !== '';
      }).map(function (column, index) {
        var fallback = DEFAULT_RULE_COLUMNS.filter(function (item) {
          return String(item.key) === String(column.key);
        })[0];
        return Object.assign({}, column, {
          key: column.key,
          label: column.label != null ? column.label : (fallback ? fallback.label : text(column.key)),
          align: column.align
        });
      });
      if (columns.length) return columns;
    }
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      return DEFAULT_RULE_COLUMNS.map(function (column) {
        var copy = Object.assign({}, column);
        if (input[column.key] != null) copy.label = input[column.key];
        return copy;
      });
    }
    return DEFAULT_RULE_COLUMNS.map(function (column) { return Object.assign({}, column); });
  }

  function normaliseRuleRows(input) {
    var source = Array.isArray(input) ? input : [];
    return source.map(function (raw, index) {
      var data = raw && typeof raw === 'object' && !isNode(raw) ? raw : { label: raw };
      var id = data.id != null && text(data.id) !== '' ? text(data.id) : 'rule-' + index;
      var label = data.label != null ? data.label : id;
      var row = {};
      Object.keys(data).forEach(function (key) { row[key] = data[key]; });
      row.key = id;
      row.id = id;
      row.rule = label;
      row.label = label;
      return {
        id: id,
        label: label,
        labelText: contentText(label) || id,
        note: hasContent(data.note) ? data.note : null,
        raw: data,
        row: row
      };
    });
  }

  function listStrings(value) {
    var out = [];
    var seen = Object.create(null);
    function add(item) {
      if (item == null || item === false) return;
      if (Array.isArray(item)) {
        item.forEach(add);
        return;
      }
      if (typeof item === 'object') {
        if (Array.isArray(item.ids)) add(item.ids);
        else if (item.id != null) add(item.id);
        return;
      }
      var key = String(item);
      if (key === '' || seen[key]) return;
      seen[key] = true;
      out.push(key);
    }
    add(value);
    return out;
  }

  function normaliseEmphasis(input) {
    var rows = [];
    var columns = [];
    if (input == null) return { row: rows, column: columns };
    if (typeof input === 'string' || typeof input === 'number') {
      return { row: listStrings(input), column: columns };
    }
    if (Array.isArray(input)) {
      return { row: listStrings(input), column: columns };
    }
    if (typeof input === 'object') {
      if (input.row != null) rows = rows.concat(listStrings(input.row));
      if (input.rows != null) rows = rows.concat(listStrings(input.rows));
      if (input.id != null && input.row == null && input.rows == null) rows = rows.concat(listStrings(input.id));
      if (input.column != null) columns = columns.concat(listStrings(input.column));
      if (input.columns != null) columns = columns.concat(listStrings(input.columns));
    }
    function unique(items) {
      var found = Object.create(null);
      return items.filter(function (item) {
        if (found[item]) return false;
        found[item] = true;
        return true;
      });
    }
    return { row: unique(rows), column: unique(columns) };
  }

  function rowNoteText(note) {
    if (isNode(note)) return text(note.textContent).trim();
    return note;
  }

  NoteBlocks.RuleCompare = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      requireComponents('NoteBlocks', ['NoteUI.Table', 'NoteUI.Notice']);
      var UI = ui();
      var state = Object.assign({
        rules: [],
        columns: null,
        caption: '',
        emphasize: null,
        note: null,
        label: ''
      }, options || {});
      var destroyed = false;
      var notices = [];

      var root = make('section', 'nblk-rule-compare');
      var emphasisNote = make('p', 'nblk-rule-compare__emphasis');
      var tableHost = make('div', 'nblk-rule-compare__table');
      var notesSection = make('section', 'nblk-rule-compare__notes');
      var notesTitle = make('h4', 'nblk-rule-compare__notes-title', '规则说明');
      var notesList = make('div', 'nblk-rule-compare__notice-list');
      emphasisNote.hidden = true;
      notesSection.hidden = true;
      notesSection.setAttribute('aria-label', '规则说明');
      notesSection.append(notesTitle, notesList);
      root.append(emphasisNote, tableHost, notesSection);

      var table = UI.Table.mount(tableHost, {
        columns: normaliseColumns(state.columns),
        rows: [],
        rowKey: 'id',
        caption: '',
        empty: '暂无规则数据',
        sort: false,
        emphasis: { row: [], column: [] }
      });

      function applyRootLabel() {
        var label = text(state.label).trim() || text(contentText(state.caption)) || '规则对照';
        root.setAttribute('aria-label', label);
      }

      function destroyNotices() {
        notices.forEach(function (instance) {
          try { instance.destroy(); } catch (error) { /* keep cleanup moving */ }
        });
        notices = [];
        clear(notesList);
      }

      function findRule(rules, id) {
        for (var i = 0; i < rules.length; i += 1) {
          if (rules[i].id === id) return rules[i];
        }
        return null;
      }

      function renderEmphasisSummary(rules, columns, emphasis) {
        var rowLabels = [];
        var columnLabels = [];
        emphasis.row.forEach(function (id) {
          var rule = findRule(rules, id);
          if (rule) rowLabels.push(rule.labelText);
        });
        emphasis.column.forEach(function (key) {
          columns.forEach(function (column) {
            if (String(column.key) === key) {
              var label = contentText(column.label) || key;
              if (columnLabels.indexOf(label) < 0) columnLabels.push(label);
            }
          });
        });
        var bits = [];
        if (rowLabels.length) bits.push('强调行：' + rowLabels.join('、') + '。');
        if (columnLabels.length) bits.push('强调列：' + columnLabels.join('、') + '。');
        emphasisNote.textContent = bits.join(' ');
        emphasisNote.hidden = bits.length === 0;
      }

      function renderNotices(rules, emphasis) {
        destroyNotices();
        var emphasized = Object.create(null);
        emphasis.row.forEach(function (id) { emphasized[id] = true; });
        var noticeCount = 0;
        emphasis.row.forEach(function (id) {
          var rule = findRule(rules, id);
          if (!rule || !emphasized[rule.id] || !rule.note) return;
          var content = rowNoteText(rule.note);
          if (!hasContent(content)) return;
          var instance = UI.Notice.mount(notesList, {
            title: rule.labelText + ' · 规则说明',
            content: content,
            tone: 'accent'
          });
          notices.push(instance);
          noticeCount += 1;
          delete emphasized[rule.id];
        });
        if (hasContent(state.note)) {
          var noteInstance = UI.Notice.mount(notesList, {
            title: '补充说明',
            content: state.note,
            tone: 'neutral'
          });
          notices.push(noteInstance);
          noticeCount += 1;
        }
        notesSection.hidden = noticeCount === 0;
      }

      function applyData() {
        var columns = normaliseColumns(state.columns);
        var rules = normaliseRuleRows(state.rules);
        var emphasis = normaliseEmphasis(state.emphasize);
        var rows = rules.map(function (rule) { return rule.row; });
        table.update({
          columns: columns,
          rows: rows,
          rowKey: 'id',
          caption: state.caption == null ? '' : state.caption,
          empty: '暂无规则数据',
          emphasis: { row: emphasis.row, column: emphasis.column }
        });
        renderEmphasisSummary(rules, columns, emphasis);
        renderNotices(rules, emphasis);
        applyRootLabel();
      }

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        Object.keys(patch).forEach(function (key) { state[key] = patch[key]; });
        applyData();
      }

      function destroy() {
        if (destroyed) return;
        destroyed = true;
        destroyNotices();
        try { table.destroy(); } catch (error) { /* optional */ }
        root.remove();
      }

      applyData();
      host.appendChild(root);

      return {
        el: root,
        update: update,
        destroy: destroy,
        getTarget: function (id) {
          if (destroyed) return null;
          return table.getTarget(id);
        }
      };
    }
  };

  /* =====================================================================
   * B04 — StateCompare
   * ===================================================================== */

  function compareIds(value) {
    var out = [];
    var seen = Object.create(null);
    function add(item) {
      if (item == null || item === false) return;
      if (Array.isArray(item)) {
        item.forEach(add);
        return;
      }
      if (item instanceof Set) {
        item.forEach(add);
        return;
      }
      if (typeof item === 'object') {
        if (Array.isArray(item.ids)) add(item.ids);
        else if (item.id != null) add(item.id);
        return;
      }
      var id = String(item);
      if (id === '' || seen[id]) return;
      seen[id] = true;
      out.push(id);
    }
    add(value);
    return out;
  }

  function normaliseObjects(input) {
    if (!Array.isArray(input)) return null;
    return input.map(function (raw, index) {
      var data = raw && typeof raw === 'object' && !isNode(raw) ? raw : { value: raw };
      var id = data.id != null && text(data.id) !== '' ? text(data.id) : 'object-' + index;
      return {
        id: id,
        label: data.label == null ? '' : text(data.label),
        value: data.value,
        caption: data.caption == null ? '' : text(data.caption),
        raw: data
      };
    });
  }

  function valueText(value) {
    if (value == null) return '空';
    if (isNode(value)) return text(value.textContent).trim() || '（对象内容）';
    return text(value);
  }

  function objectById(list, id) {
    if (!list) return null;
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  NoteBlocks.StateCompare = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      requireComponents('NoteBlocks', ['NoteUI.DataObject', 'NoteUI.Badge']);
      if (!viz().CompareView || typeof viz().CompareView.mount !== 'function') {
        throw new Error('NoteBlocks.StateCompare 需要先加载 NoteViz.CompareView。');
      }
      var UI = ui();
      var C = core();
      var state = Object.assign({
        before: null,
        after: null,
        changed: [],
        invariant: [],
        caption: '',
        mode: 'side-by-side',
        label: '',
        focusChanged: false
      }, options || {});
      var destroyed = false;
      var compare = null;
      var objectsById = { before: new Map(), after: new Map() };
      var childInstances = [];
      var focus = null;
      var focusFrame = 0;
      var focusToken = 0;
      var root = make('section', 'nblk-state-compare');
      var caption = make('p', 'nblk-state-compare__caption');
      var views = make('div', 'nblk-state-compare__views');
      var summary = make('div', 'nblk-state-compare__summary');
      var captionId = uniqueId('nblk-state-caption');
      caption.id = captionId;
      caption.hidden = true;
      root.append(caption, views, summary);

      var leftContent = make('div', 'nblk-state-compare__objects');
      var rightContent = make('div', 'nblk-state-compare__objects');
      leftContent.setAttribute('data-side', 'before');
      rightContent.setAttribute('data-side', 'after');

      function makeSideContent(objects, side, changedSet, invariantSet) {
        var content = side === 'before' ? leftContent : rightContent;
        clear(content);
        if (!objects) return content;
        if (!objects.length) {
          content.appendChild(make('p', 'nblk-state-compare__empty',
            side === 'before' ? '变化前没有对象。' : '变化后没有对象。'));
          return content;
        }
        objects.forEach(function (object) {
          var isChanged = changedSet[object.id] === true;
          var isInvariant = !isChanged && invariantSet[object.id] === true;
          var cell = make('div', 'nblk-state-compare__object');
          cell.setAttribute('data-object-id', object.id);
          cell.setAttribute('data-side', side);
          if (isChanged) cell.setAttribute('data-mark', 'changed');
          else if (isInvariant) cell.setAttribute('data-mark', 'invariant');
          var data = UI.DataObject.mount(cell, {
            label: object.label,
            value: object.value,
            caption: object.caption,
            changed: isChanged
          });
          childInstances.push(data);
          if (isChanged || isInvariant) {
            var flags = make('div', 'nblk-state-compare__flags');
            var badge = UI.Badge.mount(flags, {
              label: isChanged ? '本步变化' : '未变',
              tone: isChanged ? 'accent' : 'neutral'
            });
            childInstances.push(badge);
            flags.appendChild(make('span', 'nblk-state-compare__flag-copy',
              isChanged ? '相对于上一状态已更新。' : '此对象在本步保持原值。'));
            cell.appendChild(flags);
          }
          content.appendChild(cell);
          objectsById[side].set(object.id, data.el);
        });
        return content;
      }

      function destroyChildren() {
        childInstances.forEach(function (instance) {
          try { instance.destroy(); } catch (error) { /* keep cleanup moving */ }
        });
        childInstances = [];
        objectsById = { before: new Map(), after: new Map() };
        clear(leftContent);
        clear(rightContent);
      }

      function destroyFocus() {
        focusToken += 1;
        if (focusFrame) {
          if (typeof global.cancelAnimationFrame === 'function') global.cancelAnimationFrame(focusFrame);
          else global.clearTimeout(focusFrame);
          focusFrame = 0;
        }
        if (focus) {
          try { focus.hide(); } catch (error) { /* optional */ }
          try { focus.destroy(); } catch (error) { /* optional */ }
          focus = null;
        }
      }

      function ensureFocus() {
        var expr = global.NoteExpr;
        if (!expr || !expr.Focus || typeof expr.Focus.mount !== 'function') return null;
        var reduced = false;
        if (C.motion && typeof C.motion.reduced === 'function') {
          try { reduced = C.motion.reduced(); } catch (error) { reduced = false; }
        }
        try {
          return expr.Focus.mount({ motion: reduced ? 'never' : 'auto' });
        } catch (error) {
          return null;
        }
      }

      function refreshFocus() {
        if (destroyed || !focus) return;
        try { focus.refresh(); } catch (error) { /* optional */ }
      }

      function scheduleFocus(target) {
        destroyFocus();
        if (destroyed || !state.focusChanged || !target) return;
        var token = focusToken;
        var run = function () {
          focusFrame = 0;
          if (destroyed || token !== focusToken || !target.isConnected) return;
          focus = ensureFocus();
          if (!focus) return;
          try {
            focus.show(target);
          } catch (error) {
            try { focus.destroy(); } catch (ignore) { /* optional */ }
            focus = null;
          }
        };
        if (typeof global.requestAnimationFrame === 'function') {
          focusFrame = global.requestAnimationFrame(run);
        } else {
          focusFrame = global.setTimeout(run, 16);
        }
      }

      function findFocusTarget(changedIds) {
        for (var i = 0; i < changedIds.length; i += 1) {
          var id = changedIds[i];
          if (objectsById.after.has(id)) return objectsById.after.get(id);
          if (objectsById.before.has(id)) return objectsById.before.get(id);
        }
        return null;
      }

      function appendSummarySection(title, items, emptyText) {
        var section = make('section', 'nblk-state-compare__summary-section');
        section.appendChild(make('h4', 'nblk-state-compare__summary-title', title));
        if (items.length) {
          var list = make('ul', 'nblk-state-compare__summary-list');
          items.forEach(function (item) {
            list.appendChild(make('li', 'nblk-state-compare__summary-item', item));
          });
          section.appendChild(list);
        } else if (emptyText) {
          section.appendChild(make('p', 'nblk-state-compare__summary-text', emptyText));
        }
        return section;
      }

      function renderSummary(beforeObjects, afterObjects, changedIds, invariantIds) {
        clear(summary);
        var changeItems = [];
        changedIds.forEach(function (id) {
          var beforeObject = objectById(beforeObjects, id);
          var afterObject = objectById(afterObjects, id);
          var label = (afterObject && afterObject.label) || (beforeObject && beforeObject.label) || id;
          if (beforeObject && afterObject) {
            changeItems.push(label + '：' + valueText(beforeObject.value) + ' → ' + valueText(afterObject.value) + '。');
          } else if (afterObject) {
            changeItems.push(label + '：本步出现在变化后状态，值为 ' + valueText(afterObject.value) + '。');
          } else if (beforeObject) {
            changeItems.push(label + '：在变化后状态中不再出现。');
          } else {
            changeItems.push(id + '：宿主标记为变化，但两侧对象列表中没有找到该 ID。');
          }
        });
        summary.appendChild(appendSummarySection(
          '本步变化',
          changeItems,
          '本步没有标记变化对象。'
        ));

        if (invariantIds.length) {
          var invariantItems = [];
          invariantIds.forEach(function (id) {
            var beforeObject = objectById(beforeObjects, id);
            var afterObject = objectById(afterObjects, id);
            var label = (afterObject && afterObject.label) || (beforeObject && beforeObject.label) || id;
            if (beforeObject && afterObject) {
              var beforeValue = valueText(beforeObject.value);
              var afterValue = valueText(afterObject.value);
              if (beforeValue === afterValue) {
                invariantItems.push(label + '：两侧均为「' + beforeValue + '」，本步未变。');
              } else {
                invariantItems.push(label + '：宿主标记为未变；两侧显示值分别为「' +
                  beforeValue + '」与「' + afterValue + '」。');
              }
            } else if (beforeObject || afterObject) {
              invariantItems.push(label + '：只在一侧对象列表中出现；宿主标记为未变。');
            } else {
              invariantItems.push(id + '：宿主标记为未变，但两侧对象列表中没有找到该 ID。');
            }
          });
          summary.appendChild(appendSummarySection('保持未变', invariantItems, ''));
        }
      }

      function updateCaption() {
        var value = state.caption;
        var hasText = value != null && (isNode(value) ? true : text(value).trim() !== '');
        if (hasText) {
          setContent(caption, value);
          caption.hidden = false;
          root.setAttribute('aria-describedby', captionId);
        } else {
          clear(caption);
          caption.hidden = true;
          root.removeAttribute('aria-describedby');
        }
        var label = text(state.label).trim() || '前后状态对照';
        root.setAttribute('aria-label', label);
      }

      function rebuild() {
        if (destroyed) return;
        destroyFocus();
        destroyChildren();
        var beforeObjects = normaliseObjects(state.before);
        var afterObjects = normaliseObjects(state.after);
        var changedIds = compareIds(state.changed);
        var invariantIds = compareIds(state.invariant);
        var changedSet = Object.create(null);
        var invariantSet = Object.create(null);
        changedIds.forEach(function (id) { changedSet[id] = true; });
        invariantIds.forEach(function (id) {
          if (!changedSet[id]) invariantSet[id] = true;
        });
        var leftPresent = beforeObjects !== null;
        var rightPresent = afterObjects !== null;
        makeSideContent(beforeObjects, 'before', changedSet, invariantSet);
        makeSideContent(afterObjects, 'after', changedSet, invariantSet);

        var viewOptions = {
          left: leftPresent ? { title: '变化前', content: leftContent } : null,
          right: rightPresent ? { title: '变化后', content: rightContent } : null,
          mode: state.mode === 'stacked' ? 'stacked' : 'side-by-side',
          focusChanged: false,
          labels: {
            left: '变化前',
            right: '变化后',
            compare: '对照',
            changed: '变化侧',
            stacked: '容器较窄，已改为上下对照'
          }
        };
        if (!compare) {
          compare = viz().CompareView.mount(views, viewOptions);
        } else {
          compare.update(viewOptions);
        }
        renderSummary(beforeObjects, afterObjects, changedIds, invariantIds);
        updateCaption();
        scheduleFocus(findFocusTarget(changedIds));
      }

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        Object.keys(patch).forEach(function (key) { state[key] = patch[key]; });
        rebuild();
      }

      var resizeBag = null;
      var disconnectRootResize = null;
      if (C.listeners) {
        resizeBag = C.listeners(global);
        resizeBag.on('resize', refreshFocus);
      } else {
        global.addEventListener('resize', refreshFocus);
      }
      if (C.onResize) {
        disconnectRootResize = C.onResize(root, refreshFocus);
      }

      function destroy() {
        if (destroyed) return;
        destroyed = true;
        destroyFocus();
        destroyChildren();
        if (resizeBag) resizeBag.clear();
        else global.removeEventListener('resize', refreshFocus);
        if (disconnectRootResize) {
          try { disconnectRootResize(); } catch (error) { /* optional */ }
          disconnectRootResize = null;
        }
        if (compare) {
          try { compare.destroy(); } catch (error) { /* optional */ }
          compare = null;
        }
        root.remove();
      }

      rebuild();
      host.appendChild(root);

      return {
        el: root,
        update: update,
        destroy: destroy,
        getTarget: function (id) {
          if (destroyed) return null;
          if (id === 'left' || id === 'right') {
            return compare ? compare.getTarget(id) : null;
          }
          var key = text(id);
          if (objectsById.after.has(key)) return objectsById.after.get(key);
          if (objectsById.before.has(key)) return objectsById.before.get(key);
          return null;
        }
      };
    }
  };
})(window);
