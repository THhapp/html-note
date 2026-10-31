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
