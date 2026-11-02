/*! note-library module: viz-objects
 * dependencies: core
 * type: JavaScript
 * generated-by: scripts/build.mjs; do-not-edit.
 */

/* ---- source: src/viz/objects.js ---- */
/*! NoteViz objects — internal shared helpers for D01-D06.
 *  INTERNAL SHARED FILE, NOT A PUBLIC ENTRY. It only defines the internal
 *  namespace window.NoteVizObjectsInternals and the window.NoteViz namespace
 *  object; the public components live in objects-sequence-matrix.js,
 *  objects-graph.js, objects-timeline-tree.js and objects-compare.js and must
 *  be loaded after this file. Load order: src/manifests/viz-objects.json.
 *  Plain JavaScript, no dependencies except NoteCore (loaded first).
 *  NoteVizObjectsInternals is an implementation detail, not a public API.
 *  No network, no eval, no HTML parsing. */
(function (global) {
  'use strict';

  var NoteViz = global.NoteViz = global.NoteViz || {};
  var Core = global.NoteCore || null;
  var fallbackUidCount = 0;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  /* ---------- small shared helpers ---------- */

  function text(value) {
    return value == null ? '' : String(value);
  }

  function own(object, key) {
    return object != null && Object.prototype.hasOwnProperty.call(object, key);
  }

  function isNode(value) {
    return !!value && (value.nodeType === 1 || value.nodeType === 3 || value.nodeType === 11);
  }

  function el(tag, className, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = text(content);
    return node;
  }

  function svgEl(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (name) {
        if (attrs[name] != null) node.setAttribute(name, String(attrs[name]));
      });
    }
    return node;
  }

  function setText(node, value) {
    if (node) node.textContent = text(value);
  }

  function setContent(target, value) {
    if (!target) return;
    if (Core && typeof Core.setContent === 'function') {
      Core.setContent(target, value);
      return;
    }
    target.replaceChildren();
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach(function (item) {
        if (item == null) return;
        target.appendChild(isNode(item) ? item : document.createTextNode(text(item)));
      });
      return;
    }
    if (isNode(value)) {
      target.appendChild(value);
      return;
    }
    target.textContent = text(value);
  }

  function uniqueId(prefix) {
    if (Core && typeof Core.uid === 'function') return Core.uid(prefix);
    fallbackUidCount += 1;
    return 'nviz-' + prefix + '-' + fallbackUidCount;
  }

  function validateHost(host) {
    if (Core && typeof Core.validateHost === 'function') return Core.validateHost(host);
    if (!host || (host.nodeType !== 1 && host.nodeType !== 11)) {
      throw new TypeError('NoteViz.mount 需要一个元素或 DocumentFragment 容器。');
    }
    return host;
  }

  function listenersFor(target) {
    if (Core && typeof Core.listeners === 'function') return Core.listeners(target);
    var records = [];
    return {
      on: function (type, handler, options) {
        if (typeof handler !== 'function') return this;
        target.addEventListener(type, handler, options);
        records.push({ type: type, handler: handler, options: options });
        return this;
      },
      off: function (type, handler) {
        for (var i = records.length - 1; i >= 0; i -= 1) {
          if (records[i].type === type && records[i].handler === handler) {
            target.removeEventListener(records[i].type, records[i].handler, records[i].options);
            records.splice(i, 1);
          }
        }
        return this;
      },
      clear: function () {
        records.forEach(function (record) {
          target.removeEventListener(record.type, record.handler, record.options);
        });
        records.length = 0;
        return this;
      }
    };
  }

  function onResize(element, handler) {
    if (Core && typeof Core.onResize === 'function') return Core.onResize(element, handler);
    if (typeof global.ResizeObserver === 'function') {
      var observer = new global.ResizeObserver(function () { handler(); });
      observer.observe(element);
      return function () { observer.disconnect(); };
    }
    var wrapped = function () { handler(); };
    global.addEventListener('resize', wrapped);
    return function () { global.removeEventListener('resize', wrapped); };
  }

  function requestFrame(callback) {
    if (typeof global.requestAnimationFrame === 'function') return global.requestAnimationFrame(callback);
    return global.setTimeout(callback, 16);
  }

  function cancelFrame(handle) {
    if (!handle) return;
    if (typeof global.cancelAnimationFrame === 'function') global.cancelAnimationFrame(handle);
    else global.clearTimeout(handle);
  }

  function numberOr(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function clampNumber(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function markOf(focus, changed) {
    if (focus && changed) return 'both';
    if (changed) return 'changed';
    if (focus) return 'focus';
    return '';
  }

  function markLabel(mark) {
    if (mark === 'both') return '关注 · 变化';
    if (mark === 'changed') return '变化';
    if (mark === 'focus') return '关注';
    return '';
  }

  function markAria(mark) {
    if (mark === 'both') return '，当前关注且发生变化';
    if (mark === 'changed') return '，发生变化';
    if (mark === 'focus') return '，当前关注';
    return '';
  }

  function emptyLine(message) {
    return el('p', 'nviz-empty', message);
  }

  function makeScrollHint(className) {
    var hint = el('p', 'nviz-scrollhint' + (className ? ' ' + className : ''));
    hint.hidden = true;
    hint.id = uniqueId('nviz-scrollhint');
    return hint;
  }

  function bindScrollKeys(viewport, mode) {
    var bag = listenersFor(viewport);
    bag.on('keydown', function (event) {
      if (event.target !== viewport) return;
      var overflowX = viewport.scrollWidth > viewport.clientWidth + 1;
      var overflowY = viewport.scrollHeight > viewport.clientHeight + 1;
      var step = 48;
      var handled = false;
      var vertical = mode !== 'x';
      var horizontal = mode !== 'y';
      if (vertical && (event.key === 'ArrowDown' || event.key === 'PageDown')) {
        if (overflowY) {
          viewport.scrollTop += event.key === 'PageDown' ? Math.max(80, viewport.clientHeight * 0.8) : step;
          handled = true;
        }
      } else if (vertical && (event.key === 'ArrowUp' || event.key === 'PageUp')) {
        if (overflowY) {
          viewport.scrollTop -= event.key === 'PageUp' ? Math.max(80, viewport.clientHeight * 0.8) : step;
          handled = true;
        }
      } else if (vertical && event.key === 'Home') {
        if (overflowY) {
          viewport.scrollTop = 0;
          handled = true;
        }
      } else if (vertical && event.key === 'End') {
        if (overflowY) {
          viewport.scrollTop = viewport.scrollHeight;
          handled = true;
        }
      }
      if (!handled && horizontal && (event.key === 'ArrowRight' || event.key === 'PageDown')) {
        if (overflowX) {
          viewport.scrollLeft += event.key === 'PageDown' ? Math.max(80, viewport.clientWidth * 0.8) : step;
          handled = true;
        }
      } else if (!handled && horizontal && (event.key === 'ArrowLeft' || event.key === 'PageUp')) {
        if (overflowX) {
          viewport.scrollLeft -= event.key === 'PageUp' ? Math.max(80, viewport.clientWidth * 0.8) : step;
          handled = true;
        }
      } else if (!handled && horizontal && event.key === 'Home' && !overflowY) {
        if (overflowX) {
          viewport.scrollLeft = 0;
          handled = true;
        }
      } else if (!handled && horizontal && event.key === 'End' && !overflowY) {
        if (overflowX) {
          viewport.scrollLeft = viewport.scrollWidth;
          handled = true;
        }
      }
      if (handled) event.preventDefault();
    });
    return bag;
  }

  function createOverflowWatcher(viewport, hint) {
    var frame = 0;
    var alive = true;
    var disconnect = null;

    function apply() {
      if (!alive) return;
      var overflowX = viewport.scrollWidth > viewport.clientWidth + 1;
      var overflowY = viewport.scrollHeight > viewport.clientHeight + 1;
      viewport.setAttribute('data-overflow-x', overflowX ? 'true' : 'false');
      viewport.setAttribute('data-overflow-y', overflowY ? 'true' : 'false');
      var parts = [];
      if (overflowX) parts.push('横向');
      if (overflowY) parts.push('纵向');
      hint.hidden = parts.length === 0;
      hint.textContent = parts.length ? '内容超出，可' + parts.join('、') + '滚动查看。' : '';
    }

    function schedule() {
      if (!alive || frame) return;
      frame = requestFrame(function () {
        frame = 0;
        apply();
      });
    }

    disconnect = onResize(viewport, schedule);
    apply();

    return {
      schedule: schedule,
      measure: apply,
      destroy: function () {
        if (!alive) return;
        alive = false;
        if (frame) cancelFrame(frame);
        frame = 0;
        if (disconnect) disconnect();
      }
    };
  }

  /* 统一局部滚动区：可聚焦区域语义、键盘滚动、溢出提示与清理。
   * 返回 { schedule(), destroy() }；destroy 幂等，组件 cleanup 只调用一次。 */
  function attachScrollRegion(viewport, hint, mode) {
    viewport.tabIndex = 0;
    viewport.setAttribute('role', 'region');
    if (hint && hint.id) viewport.setAttribute('aria-describedby', hint.id);
    var watcher = createOverflowWatcher(viewport, hint);
    var keys = bindScrollKeys(viewport, mode || 'both');
    var destroyed = false;
    return {
      schedule: function () {
        if (!destroyed) watcher.schedule();
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        watcher.destroy();
        keys.clear();
      }
    };
  }

  function charUnits(character) {
    if (!character) return 0;
    if (/\s/.test(character)) return 0.35;
    var code = character.codePointAt ? character.codePointAt(0) : character.charCodeAt(0);
    if (code >= 0x2e80) return 1;
    if (/[il.,:;!'|]/.test(character)) return 0.32;
    if (/[mwMW@#%&]/.test(character)) return 0.9;
    return 0.58;
  }

  function wrapText(value, maxUnits) {
    var source = text(value).replace(/\r\n?/g, '\n');
    var paragraphs = source.split('\n');
    var lines = [];
    paragraphs.forEach(function (paragraph) {
      if (!paragraph) {
        lines.push('');
        return;
      }
      var chars = Array.from ? Array.from(paragraph) : paragraph.split('');
      var line = '';
      var units = 0;
      chars.forEach(function (character) {
        var next = charUnits(character);
        if (line && units + next > maxUnits) {
          lines.push(line.replace(/\s+$/, ''));
          line = '';
          units = 0;
          if (/\s/.test(character)) return;
        }
        if (!line && /\s/.test(character)) return;
        line += character;
        units += next;
      });
      if (line) lines.push(line.replace(/\s+$/, ''));
    });
    return lines.length ? lines : [''];
  }

  function closestInside(node, selector, boundary) {
    var current = node;
    while (current && current !== boundary) {
      if (current.nodeType === 1 && typeof current.matches === 'function' && current.matches(selector)) {
        return current;
      }
      current = current.parentNode;
    }
    return null;
  }

  function findDescriptorIndex(list, ref) {
    if (ref == null) return -1;
    if (typeof ref === 'object') {
      if (ref.id != null) return findDescriptorIndex(list, ref.id);
      if (ref.index != null) return findDescriptorIndex(list, ref.index);
      return -1;
    }
    var raw = String(ref);
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].id === raw) return i;
    }
    if (/^-?\d+$/.test(raw)) {
      var index = Number(raw);
      if (index >= 0 && index < list.length) return index;
    }
    return -1;
  }

  function toIdSet(value) {
    var result = new Set();
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
      result.add(String(item));
    }
    add(value);
    return result;
  }

  function resolveItemKeys(value, items, options) {
    var settings = options || {};
    var result = new Set();

    function addIndex(index) {
      if (index >= 0 && index < items.length) result.add(items[index].id);
    }

    function addRef(ref) {
      if (ref == null || ref === false || ref === '') return;
      var raw = String(ref);
      var matched = false;
      for (var i = 0; i < items.length; i += 1) {
        if (items[i].id === raw) {
          result.add(items[i].id);
          matched = true;
        }
      }
      if (!matched && /^-?\d+$/.test(raw)) addIndex(Number(raw));
    }

    function addRange(item) {
      var start = item.start != null ? Number(item.start) : (item.from != null ? Number(item.from) : 0);
      var finish = start;
      if (item.count != null) finish = start + Number(item.count) - 1;
      else if (item.to != null) finish = Number(item.to);
      if (!isFinite(start) || !isFinite(finish)) return;
      for (var i = Math.min(start, finish); i <= Math.max(start, finish); i += 1) addIndex(i);
    }

    function addObject(item) {
      if (Array.isArray(item.ids)) {
        walk(item.ids);
        return;
      }
      if (item.id != null) {
        addRef(item.id);
        return;
      }
      if (settings.ranges && (item.start != null || item.from != null || item.count != null || item.to != null)) {
        addRange(item);
        return;
      }
      if (settings.indexRefs && item.index != null) addRef(item.index);
    }

    function walk(item) {
      if (item == null || item === false || item === '') return;
      if (Array.isArray(item)) {
        item.forEach(walk);
        return;
      }
      if (item instanceof Set) {
        item.forEach(walk);
        return;
      }
      if (typeof item === 'object') {
        addObject(item);
        return;
      }
      addRef(item);
    }

    walk(value);
    return result;
  }

  global.NoteVizObjectsInternals = {
    Core: Core,
    text: text,
    own: own,
    isNode: isNode,
    el: el,
    svgEl: svgEl,
    setText: setText,
    setContent: setContent,
    uniqueId: uniqueId,
    validateHost: validateHost,
    listenersFor: listenersFor,
    numberOr: numberOr,
    clampNumber: clampNumber,
    markOf: markOf,
    markLabel: markLabel,
    markAria: markAria,
    emptyLine: emptyLine,
    makeScrollHint: makeScrollHint,
    attachScrollRegion: attachScrollRegion,
    charUnits: charUnits,
    wrapText: wrapText,
    closestInside: closestInside,
    findDescriptorIndex: findDescriptorIndex,
    toIdSet: toIdSet,
    resolveItemKeys: resolveItemKeys
  };
})(window);

/* ---- source: src/viz/objects-sequence-matrix.js ---- */
/*! NoteViz objects D01-D06 — D01 Sequence, D02 Matrix.
 *  Classic script; load after src/viz/objects.js (internal shared helpers).
 *  Public entries: NoteViz.Sequence, NoteViz.Matrix.
 *  No network, no eval, no HTML parsing. */
(function (global) {
  'use strict';

  var NoteViz = global.NoteViz = global.NoteViz || {};
  var shared = global.NoteVizObjectsInternals;
  if (!shared) {
    throw new Error('NoteViz objects 组件需要先加载 src/viz/objects.js（内部共享文件）。');
  }
  var Core = shared.Core;
  var text = shared.text;
  var isNode = shared.isNode;
  var el = shared.el;
  var setText = shared.setText;
  var setContent = shared.setContent;
  var validateHost = shared.validateHost;
  var numberOr = shared.numberOr;
  var clampNumber = shared.clampNumber;
  var markOf = shared.markOf;
  var markLabel = shared.markLabel;
  var markAria = shared.markAria;
  var emptyLine = shared.emptyLine;
  var makeScrollHint = shared.makeScrollHint;
  var attachScrollRegion = shared.attachScrollRegion;
  var findDescriptorIndex = shared.findDescriptorIndex;
  var resolveItemKeys = shared.resolveItemKeys;

  /* =====================================================================
   * D01 — Sequence
   * ===================================================================== */

  NoteViz.Sequence = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var root = el('div', 'nviz-sequence');
      var viewport = el('div', 'nviz-sequence__viewport');
      var track = el('div', 'nviz-sequence__track');
      var hint = makeScrollHint('nviz-sequence__hint');
      var note = el('p', 'nviz-sequence__note');
      var empty = emptyLine('暂无可显示的序列对象。');
      var scroll = null;
      var parts = new Map();
      var targets = new Map();
      var lastItems = [];
      var lastGroups = [];
      var lastFocus = new Set();
      var lastChanged = new Set();

      viewport.appendChild(track);
      note.hidden = true;
      empty.hidden = true;
      root.setAttribute('role', 'group');
      root.append(viewport, hint, empty, note);

      var model = Object.assign({
        items: [],
        variant: 'boxes',
        index: false,
        groups: null,
        focus: null,
        changed: null,
        dense: false,
        label: '序列',
        summary: true,
        stateText: true,
        stable: false
      }, options || {});

      function normalizeItems(input) {
        var list = Array.isArray(input) ? input : [];
        return list.map(function (item, index) {
          var id = 'item-' + index;
          var label = '';
          var value = '';
          if (item != null && typeof item === 'object' && !isNode(item)) {
            if (item.id != null && text(item.id) !== '') id = text(item.id);
            label = item.label == null ? '' : text(item.label);
            value = item.value == null ? (item.label == null ? '' : text(item.label)) : text(item.value);
          } else {
            value = item == null ? '' : text(item);
          }
          return { id: id, key: id, index: index, label: label, value: value };
        });
      }

      function buildSections(items, groups) {
        var n = items.length;
        var declared = [];
        if (!n) return { sections: [], hasLabels: false, groups: declared };
        var assignments = new Array(n);
        if (Array.isArray(groups) && groups.length) {
          var cursor = 0;
          groups.forEach(function (group) {
            if (!group || typeof group !== 'object' || group.ids != null && !Array.isArray(group.ids)) return;
            var indexes = [];
            var groupLabel = group.label == null ? '' : text(group.label);
            if (Array.isArray(group.ids)) {
              group.ids.forEach(function (id) {
                for (var i = 0; i < n; i += 1) {
                  if (items[i].id === String(id)) {
                    indexes.push(i);
                    break;
                  }
                }
              });
              indexes.sort(function (a, b) { return a - b; });
            } else {
              var start = group.start != null ? Math.floor(numberOr(group.start, cursor)) : cursor;
              var count;
              if (group.count != null) count = Math.floor(numberOr(group.count, 0));
              else if (group.end != null) count = Math.floor(numberOr(group.end, start + 1)) - start;
              else count = 1;
              start = clampNumber(start, 0, n);
              count = Math.max(0, Math.min(count, n - start));
              for (var offset = 0; offset < count; offset += 1) indexes.push(start + offset);
              cursor = start + count;
            }
            var groupIds = [];
            indexes.forEach(function (index) {
              if (index >= 0 && index < n && !assignments[index]) {
                assignments[index] = { group: declared.length, label: groupLabel };
                groupIds.push(items[index].id);
              }
            });
            declared.push({ label: groupLabel, ids: groupIds });
          });
        }
        var hasLabels = assignments.some(function (assignment) { return assignment && assignment.label; });
        var sections = [];
        var current = null;
        for (var i = 0; i < n; i += 1) {
          var assigned = assignments[i];
          var key = assigned ? 'g' + assigned.group : 'none';
          if (!current || current.key !== key) {
            current = {
              key: key,
              label: assigned ? assigned.label : (hasLabels ? '未分组' : ''),
              items: []
            };
            sections.push(current);
          }
          current.items.push(items[i]);
        }
        return { sections: sections, hasLabels: hasLabels, groups: declared };
      }

      function createUnit() {
        var unit = el('div', 'nviz-sequence__unit');
        unit.setAttribute('role', 'listitem');
        var cell = el('span', 'nviz-sequence__cell');
        var indexEl = el('span', 'nviz-sequence__index');
        indexEl.setAttribute('aria-hidden', 'true');
        var valueEl = el('span', 'nviz-sequence__value');
        var labelEl = el('span', 'nviz-sequence__label');
        var markEl = el('span', 'nviz-sequence__mark');
        cell.append(indexEl, valueEl, labelEl, markEl);
        unit.appendChild(cell);
        return { unit: unit, cell: cell, index: indexEl, value: valueEl, label: labelEl, mark: markEl };
      }

      function render(patch) {
        var variant = ['bits', 'bytes', 'boxes'].indexOf(model.variant) >= 0 ? model.variant : 'boxes';
        var label = text(model.label) || '序列';
        var items = normalizeItems(model.items);
        var focus = resolveItemKeys(model.focus, items, { ranges: true });
        var changed = resolveItemKeys(model.changed, items, { ranges: true });
        var grouped = buildSections(items, model.groups);
        var sections = grouped.sections || [];
        var hasGroupLabels = !!grouped.hasLabels;
        lastItems = items;
        lastFocus = focus;
        lastChanged = changed;
        lastGroups = grouped.groups || [];

        root.setAttribute('data-variant', variant);
        root.setAttribute('data-dense', model.dense ? 'true' : 'false');
        root.setAttribute('data-index', model.index ? 'true' : 'false');
        root.setAttribute('data-stable', model.stable ? 'true' : 'false');
        root.setAttribute('data-summary', model.summary ? 'true' : 'false');
        root.setAttribute('aria-label', label);
        viewport.setAttribute('aria-label', label + '，可滚动区域');
        setText(note, '');
        note.hidden = true;

        var oldParts = parts;
        var newParts = new Map();
        var newTargets = new Map();
        track.replaceChildren();

        if (!items.length) {
          viewport.hidden = true;
          empty.hidden = false;
          hint.hidden = true;
          note.hidden = true;
          note.style.visibility = '';
          note.removeAttribute('aria-hidden');
          parts = newParts;
          targets = newTargets;
          if (scroll) scroll.schedule();
          return;
        }

        viewport.hidden = false;
        empty.hidden = true;
        var focusItems = [];
        var changedItems = [];
        var bothItems = [];
        var sectionNodes = sections.map(function (section) {
          var sectionEl = el('div', 'nviz-sequence__group');
          if (hasGroupLabels) {
            var heading = el('div', 'nviz-sequence__group-label', section.label);
            sectionEl.appendChild(heading);
            sectionEl.setAttribute('role', 'group');
            sectionEl.setAttribute('aria-label', '分组：' + section.label);
          }
          var cells = el('div', 'nviz-sequence__cells');
          cells.setAttribute('role', 'list');
          cells.setAttribute('aria-label', section.label ? section.label + ' 的对象' : '序列对象');
          sectionEl.appendChild(cells);
          track.appendChild(sectionEl);
          return cells;
        });

        var cursorById = new Map();
        sections.forEach(function (section, sectionIndex) {
          section.items.forEach(function (item) {
            cursorById.set(item.id, sectionIndex);
          });
        });

        items.forEach(function (item) {
          var old = oldParts.get(item.id);
          var created = old || createUnit();
          var unit = created.unit;
          var mark = markOf(focus.has(item.id), changed.has(item.id));
          var sectionIndex = cursorById.has(item.id) ? cursorById.get(item.id) : 0;
          var sectionCells = sectionNodes[sectionIndex] || sectionNodes[0];

          setText(created.index, String(item.index));
          created.index.hidden = !model.index;
          setText(created.value, item.value === '' ? '∅' : item.value);
          var labelShown = !!(item.label && item.label !== item.value);
          setText(created.label, labelShown ? item.label : '');
          if (model.stable) {
            /* 稳定排布：标签行始终占位，缺席时只隐藏可见性，不改变对象高度。 */
            created.label.hidden = false;
            created.label.style.visibility = labelShown ? '' : 'hidden';
            created.label.setAttribute('aria-hidden', labelShown ? 'false' : 'true');
          } else {
            created.label.hidden = !labelShown;
            created.label.style.visibility = '';
            created.label.removeAttribute('aria-hidden');
          }
          var markShown = !!mark && variant !== 'bits' && model.stateText;
          setText(created.mark, markShown ? markLabel(mark) : '');
          if (model.stable && model.stateText && variant !== 'bits') {
            /* 稳定排布且状态文字可见：状态行始终占位。 */
            created.mark.hidden = false;
            created.mark.style.visibility = markShown ? '' : 'hidden';
            created.mark.setAttribute('aria-hidden', markShown ? 'false' : 'true');
          } else {
            /* 状态文字关闭时不再为不可见行预留高度，对象盒更紧凑。 */
            created.mark.hidden = !markShown;
            created.mark.style.visibility = '';
            created.mark.removeAttribute('aria-hidden');
          }
          unit.setAttribute('data-id', item.id);
          unit.setAttribute('data-mark', mark || 'none');
          unit.setAttribute('aria-label',
            '对象 ' + (item.index + 1) + '，索引 ' + item.index +
            (item.label ? '，' + item.label : '') +
            '，值 ' + (item.value === '' ? '空' : item.value) + markAria(mark));
          var itemRef = '索引 ' + item.index + (item.label || item.value ? '（' + (item.label || item.value) + '）' : '');
          if (mark === 'both') bothItems.push(itemRef);
          else if (mark === 'changed') changedItems.push(itemRef);
          else if (mark === 'focus') focusItems.push(itemRef);

          if (sectionCells) sectionCells.appendChild(unit);
          newParts.set(item.id, created);
          newTargets.set(item.id, unit);
        });

        parts = newParts;
        targets = newTargets;

        var noteParts = [];
        if (focusItems.length) noteParts.push('关注：' + focusItems.join('、'));
        if (changedItems.length) noteParts.push('变化：' + changedItems.join('、'));
        if (bothItems.length) noteParts.push('关注并变化：' + bothItems.join('、'));
        if (!model.summary) {
          /* 摘要只属于组件可选的可见说明；对象 aria-label 与视觉 cues 仍保留。 */
          note.textContent = '';
          note.hidden = true;
          note.style.visibility = '';
          note.removeAttribute('aria-hidden');
        } else if (noteParts.length) {
          note.textContent = noteParts.join('；') + '。';
          note.hidden = false;
          note.style.visibility = '';
          note.removeAttribute('aria-hidden');
        } else if (model.stable) {
          note.textContent = '';
          note.hidden = false;
          note.style.visibility = 'hidden';
          note.setAttribute('aria-hidden', 'true');
        } else {
          note.textContent = '';
          note.hidden = true;
          note.style.visibility = '';
          note.removeAttribute('aria-hidden');
        }

        if (scroll) scroll.schedule();
      }

      var cleanup = function () {
        if (scroll) scroll.destroy();
      };
      var instance = Core.component(root, model, render, cleanup);
      render({});
      host.appendChild(root);
      scroll = attachScrollRegion(viewport, hint, 'x');
      scroll.schedule();

      instance.getTarget = function (id) {
        if (instance.destroyed || id == null) return null;
        var key = String(id);
        if (targets.has(key)) return targets.get(key);
        if (/^-?\d+$/.test(key)) {
          var index = Number(key);
          if (index >= 0 && index < lastItems.length) return targets.get(lastItems[index].id) || null;
        }
        return null;
      };
      instance.getState = function () {
        if (instance.destroyed) return null;
        var items = lastItems.map(function (item) {
          return { id: item.id, value: item.value, label: item.label };
        });
        var groups = lastGroups.map(function (group) {
          return { label: group.label, ids: group.ids.slice() };
        });
        var focus = [];
        var changed = [];
        lastItems.forEach(function (item) {
          if (lastFocus.has(item.id)) focus.push(item.id);
          if (lastChanged.has(item.id)) changed.push(item.id);
        });
        return { items: items, groups: groups, cues: { focus: focus, changed: changed } };
      };
      instance.getMotionTargets = function () {
        if (instance.destroyed) return [];
        var list = [];
        lastItems.forEach(function (item) {
          var part = parts.get(item.id);
          if (!part) return;
          list.push({
            id: item.id,
            unit: part.unit,
            contentEl: part.cell,
            valueEl: part.value,
            labelEl: part.label,
            markEl: part.mark
          });
        });
        return list;
      };
      return instance;
    }
  };

  /* =====================================================================
   * D02 — Matrix
   * ===================================================================== */

  function normalizeAxis(input, prefix, fallbackLabels) {
    var list = Array.isArray(input) ? input : [];
    return list.map(function (item, index) {
      if (item != null && typeof item === 'object') {
        return {
          id: item.id != null && text(item.id) !== '' ? text(item.id) : prefix + '-' + index,
          label: item.label != null ? text(item.label) : (item.name != null ? text(item.name) : prefix + ' ' + (index + 1)),
          raw: item
        };
      }
      return {
        id: prefix + '-' + index,
        label: item == null ? prefix + ' ' + (index + 1) : text(item),
        raw: item
      };
    }).map(function (item, index) {
      if (item.label === '' && fallbackLabels) item.label = fallbackLabels(index);
      return item;
    });
  }

  function matrixCellKey(rowId, colId) {
    return rowId + '\u0000' + colId;
  }

  function matrixSelection(rows, cols, value) {
    var result = {
      rows: new Set(),
      cols: new Set(),
      cells: new Set(),
      ranges: 0
    };

    function rowIndex(ref) {
      return findDescriptorIndex(rows, ref);
    }
    function colIndex(ref) {
      return findDescriptorIndex(cols, ref);
    }
    function addRow(ref) {
      var index = rowIndex(ref);
      if (index >= 0) result.rows.add(rows[index].id);
    }
    function addCol(ref) {
      var index = colIndex(ref);
      if (index >= 0) result.cols.add(cols[index].id);
    }
    function addCell(spec) {
      if (!spec || typeof spec !== 'object') return;
      var ri = rowIndex(spec.row);
      var ci = colIndex(spec.col != null ? spec.col : spec.column);
      if (ri >= 0 && ci >= 0) result.cells.add(matrixCellKey(rows[ri].id, cols[ci].id));
    }
    function addRange(spec) {
      if (!spec || typeof spec !== 'object') return;
      var rowStartRef = spec.rowStart != null ? spec.rowStart : spec.startRow;
      var rowEndRef = spec.rowEnd != null ? spec.rowEnd : spec.endRow;
      var colStartRef = spec.colStart != null ? spec.colStart : spec.columnStart;
      var colEndRef = spec.colEnd != null ? spec.colEnd : spec.columnEnd;
      if (Array.isArray(spec.rows) && spec.rows.length) {
        rowStartRef = spec.rows[0];
        rowEndRef = spec.rows[spec.rows.length - 1];
      }
      if (Array.isArray(spec.columns) && spec.columns.length) {
        colStartRef = spec.columns[0];
        colEndRef = spec.columns[spec.columns.length - 1];
      } else if (Array.isArray(spec.cols) && spec.cols.length) {
        colStartRef = spec.cols[0];
        colEndRef = spec.cols[spec.cols.length - 1];
      }
      var hasRowBounds = rowStartRef != null || rowEndRef != null;
      var hasColBounds = colStartRef != null || colEndRef != null;
      var r1 = hasRowBounds ? findDescriptorIndex(rows, rowStartRef != null ? rowStartRef : 0) : 0;
      var r2 = hasRowBounds ? findDescriptorIndex(rows, rowEndRef != null ? rowEndRef : (rows.length - 1)) : rows.length - 1;
      var c1 = hasColBounds ? findDescriptorIndex(cols, colStartRef != null ? colStartRef : 0) : 0;
      var c2 = hasColBounds ? findDescriptorIndex(cols, colEndRef != null ? colEndRef : (cols.length - 1)) : cols.length - 1;
      if (r1 < 0 || r2 < 0 || c1 < 0 || c2 < 0) return;
      result.ranges += 1;
      for (var r = Math.min(r1, r2); r <= Math.max(r1, r2); r += 1) {
        for (var c = Math.min(c1, c2); c <= Math.max(c1, c2); c += 1) {
          result.cells.add(matrixCellKey(rows[r].id, cols[c].id));
        }
      }
    }

    function walk(item) {
      if (item == null || item === false) return;
      if (Array.isArray(item)) {
        item.forEach(walk);
        return;
      }
      if (item instanceof Set) {
        item.forEach(walk);
        return;
      }
      if (typeof item !== 'object') {
        var ri = rowIndex(item);
        if (ri >= 0) result.rows.add(rows[ri].id);
        else {
          var ci = colIndex(item);
          if (ci >= 0) result.cols.add(cols[ci].id);
        }
        return;
      }
      if (Array.isArray(item.cells)) item.cells.forEach(addCell);
      if (item.cell) addCell(item.cell);
      if (item.row != null || item.col != null || item.column != null) {
        if (item.row != null && (item.col != null || item.column != null)) {
          addCell({ row: item.row, col: item.col != null ? item.col : item.column });
        } else if (item.row != null) {
          addRow(item.row);
        } else {
          addCol(item.col != null ? item.col : item.column);
        }
      }
      if (Array.isArray(item.rows)) item.rows.forEach(addRow);
      var columnRefs = Array.isArray(item.columns) ? item.columns : (Array.isArray(item.cols) ? item.cols : null);
      if (columnRefs) columnRefs.forEach(addCol);
      if (item.range) addRange(item.range);
      if (item.rowStart != null || item.rowEnd != null || item.colStart != null ||
          item.colEnd != null || item.columnStart != null || item.columnEnd != null ||
          item.startRow != null || item.endRow != null) {
        addRange(item);
      }
    }
    walk(value);
    return result;
  }

  NoteViz.Matrix = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var root = el('div', 'nviz-matrix');
      var viewport = el('div', 'nviz-matrix__viewport');
      var hint = makeScrollHint('nviz-matrix__hint');
      var empty = emptyLine('暂无可显示的矩阵数据。');
      var note = el('p', 'nviz-matrix__note');
      var scroll = null;
      var cellParts = new Map();
      var targets = new Map();
      var currentValues = [];
      var currentRows = [];
      var currentCols = [];
      var currentFocus = { rows: [], cols: [], cells: [] };
      var currentChanged = { rows: [], cols: [], cells: [] };
      var currentCaption = '';

      note.hidden = true;
      empty.hidden = true;
      root.setAttribute('role', 'group');
      root.append(viewport, hint, empty, note);

      var model = Object.assign({
        rows: [],
        values: [],
        focus: null,
        changed: null,
        caption: '',
        cellRenderer: null,
        maxHeight: 'min(60vh, 480px)',
        dense: false,
        label: '矩阵',
        summary: true,
        stateText: true
      }, options || {});

      function normalizeData() {
        var rawRows = Array.isArray(model.rows) ? model.rows : [];
        var rawCols = Array.isArray(model.columns) ? model.columns : (Array.isArray(model.cols) ? model.cols : []);
        var values = model.values;
        if (!Array.isArray(values)) {
          var embedded = rawRows.some(function (row) {
            return row && typeof row === 'object' && (Array.isArray(row.cells) || Array.isArray(row.values));
          });
          if (embedded) {
            values = rawRows.map(function (row) {
              if (Array.isArray(row.cells)) return row.cells;
              if (Array.isArray(row.values)) return row.values;
              return [];
            });
          } else {
            values = [];
          }
        }
        var columnCount = rawCols.length;
        values.forEach(function (row) {
          if (Array.isArray(row)) columnCount = Math.max(columnCount, row.length);
        });
        rawRows.forEach(function (row) {
          if (row && typeof row === 'object') {
            var cells = Array.isArray(row.cells) ? row.cells : row.values;
            if (Array.isArray(cells)) columnCount = Math.max(columnCount, cells.length);
          }
        });
        var rowCount = Math.max(rawRows.length, values.length);
        var rows = normalizeAxis(rawRows.length === rowCount ? rawRows : rawRows.concat(new Array(Math.max(0, rowCount - rawRows.length)).fill(null)), 'row', function (index) {
          return '行 ' + (index + 1);
        });
        var columns = normalizeAxis(rawCols.length === columnCount ? rawCols : rawCols.concat(new Array(Math.max(0, columnCount - rawCols.length)).fill(null)), 'col', function (index) {
          return '列 ' + (index + 1);
        });
        return { rows: rows, columns: columns, values: values };
      }

      function getValue(values, rowIndex, colIndex, row) {
        if (Array.isArray(values[rowIndex])) return values[rowIndex][colIndex];
        if (row && Array.isArray(row.raw && row.raw.cells)) return row.raw.cells[colIndex];
        if (row && Array.isArray(row.raw && row.raw.values)) return row.raw.values[colIndex];
        return '';
      }

      function createCellParts() {
        var td = el('td', 'nviz-matrix__cell');
        var valueEl = el('span', 'nviz-matrix__value');
        var flag = el('span', 'nviz-matrix__cellflag');
        var stateEl = el('span', 'nviz-matrix__state');
        flag.hidden = true;
        td.append(valueEl, flag, stateEl);
        return { td: td, value: valueEl, flag: flag, state: stateEl };
      }

      function render(patch) {
        var data = normalizeData();
        var rows = data.rows;
        var cols = data.columns;
        var label = text(model.label) || '矩阵';
        var caption = text(model.caption);
        var focus = matrixSelection(rows, cols, model.focus);
        var changed = matrixSelection(rows, cols, model.changed);
        currentValues = data.values;
        currentRows = rows;
        currentCols = cols;
        currentCaption = caption;
        currentFocus = {
          rows: Array.from(focus.rows),
          cols: Array.from(focus.cols),
          cells: Array.from(focus.cells).map(function (key) {
            var pair = key.split(String.fromCharCode(0));
            return { row: pair[0], col: pair[1] };
          })
        };
        currentChanged = {
          rows: Array.from(changed.rows),
          cols: Array.from(changed.cols),
          cells: Array.from(changed.cells).map(function (key) {
            var pair = key.split(String.fromCharCode(0));
            return { row: pair[0], col: pair[1] };
          })
        };

        root.setAttribute('aria-label', label);
        root.setAttribute('data-dense', model.dense ? 'true' : 'false');
        root.setAttribute('data-summary', model.summary ? 'true' : 'false');
        root.setAttribute('data-state-text', model.stateText ? 'true' : 'false');
        viewport.style.maxHeight = model.maxHeight == null || model.maxHeight === '' ? '' :
          (typeof model.maxHeight === 'number' ? model.maxHeight + 'px' : text(model.maxHeight));
        viewport.setAttribute('aria-label', label + '，可滚动表格');

        var oldParts = cellParts;
        var newParts = new Map();
        var newTargets = new Map();
        viewport.replaceChildren();

        var noteBits = [];
        if (model.summary) {
          if (focus.rows.size) noteBits.push('行关注 ' + focus.rows.size);
          if (focus.cols.size) noteBits.push('列关注 ' + focus.cols.size);
          if (focus.cells.size) noteBits.push('关注单元 ' + focus.cells.size);
          if (focus.ranges) noteBits.push('关注区域 ' + focus.ranges);
          if (changed.rows.size) noteBits.push('行变化 ' + changed.rows.size);
          if (changed.cols.size) noteBits.push('列变化 ' + changed.cols.size);
          if (changed.cells.size) noteBits.push('变化单元 ' + changed.cells.size);
          if (changed.ranges) noteBits.push('变化区域 ' + changed.ranges);
        }
        note.hidden = noteBits.length === 0;
        note.textContent = noteBits.length ? '标记：' + noteBits.join(' · ') + '。' : '';

        if (!rows.length || !cols.length) {
          viewport.hidden = true;
          empty.hidden = false;
          hint.hidden = true;
          note.hidden = true;
          cellParts = newParts;
          targets = newTargets;
          if (scroll) scroll.schedule();
          return;
        }

        viewport.hidden = false;
        empty.hidden = true;

        var table = el('table', 'nviz-matrix__table');
        if (!caption) table.setAttribute('aria-label', label);
        if (caption) {
          var captionEl = el('caption', 'nviz-matrix__caption', caption);
          table.appendChild(captionEl);
        }

        var thead = el('thead');
        var headRow = el('tr');
        var corner = el('th', 'nviz-matrix__corner');
        corner.setAttribute('scope', 'col');
        var cornerText = el('span', 'nviz-matrix__cornerlabel', '行 \\ 列');
        corner.appendChild(cornerText);
        headRow.appendChild(corner);

        var colMarks = cols.map(function (col) {
          var f = focus.cols.has(col.id);
          var c = changed.cols.has(col.id);
          var mark = markOf(f, c);
          var th = el('th', 'nviz-matrix__colhead');
          th.setAttribute('scope', 'col');
          th.setAttribute('data-id', col.id);
          th.setAttribute('data-mark', mark || 'none');
          var labelWrap = el('span', 'nviz-matrix__headlabel');
          var labelText = el('span', 'nviz-matrix__headtext', col.label);
          labelWrap.appendChild(labelText);
          if (mark && model.stateText) {
            var tag = el('span', 'nviz-matrix__headmark', markLabel(mark));
            labelWrap.appendChild(tag);
          }
          if (mark && !model.stateText) {
            labelWrap.appendChild(el('span', 'nviz-matrix__state', markAria(mark)));
          }
          th.appendChild(labelWrap);
          headRow.appendChild(th);
          return mark;
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        var tbody = el('tbody');
        rows.forEach(function (row, rowIndex) {
          var tr = el('tr');
          var rowFocus = focus.rows.has(row.id);
          var rowChanged = changed.rows.has(row.id);
          var rowMark = markOf(rowFocus, rowChanged);
          var rowHead = el('th', 'nviz-matrix__rowhead');
          rowHead.setAttribute('scope', 'row');
          rowHead.setAttribute('data-id', row.id);
          rowHead.setAttribute('data-mark', rowMark || 'none');
          var rowLabelWrap = el('span', 'nviz-matrix__headlabel');
          var rowText = el('span', 'nviz-matrix__headtext', row.label);
          rowLabelWrap.appendChild(rowText);
          if (rowMark && model.stateText) rowLabelWrap.appendChild(el('span', 'nviz-matrix__headmark', markLabel(rowMark)));
          if (rowMark && !model.stateText) rowLabelWrap.appendChild(el('span', 'nviz-matrix__state', markAria(rowMark)));
          rowHead.appendChild(rowLabelWrap);
          tr.appendChild(rowHead);

          cols.forEach(function (col, colIndex) {
            var key = matrixCellKey(row.id, col.id);
            var old = oldParts.get(key);
            var created = old || createCellParts();
            var td = created.td;
            var directFocus = focus.cells.has(key);
            var directChanged = changed.cells.has(key);
            var anyFocus = rowFocus || colMarks[colIndex] === 'focus' || colMarks[colIndex] === 'both' || directFocus;
            var anyChanged = rowChanged || colMarks[colIndex] === 'changed' || colMarks[colIndex] === 'both' || directChanged;
            var mark = markOf(anyFocus, anyChanged);
            var directMark = markOf(directFocus, directChanged);
            var rawValue = getValue(data.values, rowIndex, colIndex, row);
            var output;
            if (typeof model.cellRenderer === 'function') {
              output = model.cellRenderer(rawValue, {
                row: row.id,
                col: col.id,
                rowIndex: rowIndex,
                colIndex: colIndex,
                rowLabel: row.label,
                colLabel: col.label
              });
            } else {
              output = rawValue;
            }
            setContent(created.value, output == null ? '' : output);
            td.setAttribute('data-row', row.id);
            td.setAttribute('data-col', col.id);
            td.setAttribute('data-mark', mark || 'none');
            td.setAttribute('data-direct-mark', directMark || 'none');
            created.flag.hidden = !directMark || !model.stateText;
            created.flag.textContent = directMark && model.stateText ? markLabel(directMark) : '';
            created.state.textContent = !model.stateText && mark ? markAria(mark) : '';
            td.removeAttribute('aria-label');
            tr.appendChild(td);
            newParts.set(key, created);
            newTargets.set(key, td);
          });
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        viewport.appendChild(table);
        cellParts = newParts;
        targets = newTargets;

        if (scroll) scroll.schedule();
      }

      var cleanup = function () {
        if (scroll) scroll.destroy();
      };
      var instance = Core.component(root, model, render, cleanup);
      render({});
      host.appendChild(root);
      scroll = attachScrollRegion(viewport, hint, 'both');
      scroll.schedule();

      instance.getTarget = function (spec) {
        if (instance.destroyed || !spec || typeof spec !== 'object') return null;
        var rowRef = spec.row;
        var colRef = spec.col != null ? spec.col : spec.column;
        var ri = findDescriptorIndex(currentRows, rowRef);
        var ci = findDescriptorIndex(currentCols, colRef);
        if (ri < 0 || ci < 0) return null;
        return targets.get(matrixCellKey(currentRows[ri].id, currentCols[ci].id)) || null;
      };

      instance.getState = function () {
        if (instance.destroyed) return null;
        return {
          rows: currentRows.map(function (row) { return { id: row.id, label: row.label }; }),
          columns: currentCols.map(function (column) { return { id: column.id, label: column.label }; }),
          values: currentRows.map(function (row, rowIndex) {
            return currentCols.map(function (column, colIndex) {
              var value = getValue(currentValues, rowIndex, colIndex, row);
              return value == null ? '' : value;
            });
          }),
          focus: {
            rows: currentFocus.rows.slice(),
            cols: currentFocus.cols.slice(),
            cells: currentFocus.cells.map(function (cell) { return { row: cell.row, col: cell.col }; })
          },
          changed: {
            rows: currentChanged.rows.slice(),
            cols: currentChanged.cols.slice(),
            cells: currentChanged.cells.map(function (cell) { return { row: cell.row, col: cell.col }; })
          },
          caption: currentCaption
        };
      };

      instance.getMotionTargets = function () {
        if (instance.destroyed) return [];
        var output = [];
        targets.forEach(function (td, key) {
          var pair = key.split(String.fromCharCode(0));
          var valueEl = td.querySelector ? td.querySelector('.nviz-matrix__value') : null;
          var flagEl = td.querySelector ? td.querySelector('.nviz-matrix__cellflag') : null;
          output.push({
            id: key,
            rowId: pair[0],
            colId: pair[1],
            element: td,
            layoutEl: td,
            contentEl: td,
            valueEl: valueEl,
            flagEl: flagEl
          });
        });
        return output;
      };

      return instance;
    }
  };
})(window);

/* ---- source: src/viz/objects-graph.js ---- */
/*! NoteViz objects D01-D06 — D03 Graph.
 *  Classic script; load after src/viz/objects.js (internal shared helpers).
 *  Public entry: NoteViz.Graph.
 *  No network, no eval, no HTML parsing.
 *
 *  Edge identity and targets (D03 extension):
 *    edges[].id 可选稳定 ID；缺省按 from -> to 生成，平行同向边为 "from -> to #2"…
 *    （与 NoteBlocks.ProcessFlow 的 edgeIds 解析约定一致；重复显式 id 也补后缀）。
 *    edgeFocus / edgeChanged 是独立的边状态选项，节点 focus / changed 仍是节点专用。
 *    边 <g>、path 在 update() 时按稳定 id 复用；节点 getTarget 不解析边 ID。
 *
 *  查询 API（实例方法）：
 *    getEdgeTarget(id) -> <g> | null
 *    getEdgePath(id) -> <path> | null
 *    getEdgeLength(id) -> number(局部用户单位) | null
 *    getEdgePoint(id, ratio) -> {x,y} 局部坐标 | null
 *    getEdgePointAt(id, distance) -> {x,y,distance,ratio} 局部坐标 | null
 *    getEdgePointClient(id, ratio) -> {x,y} DOM client 坐标（路径 screen CTM 转换）| null
 *    getEdgeEndpoints(id) -> {start:{x,y}, end:{x,y}} 局部坐标 | null
 *    getEdgeInfo(id) -> {id,from,to,label,directed,mark,length,endpoints} | null
 *    局部坐标与 viewBox/节点坐标同一空间；边是作者声明的 from/to 直连锚点，
 *    不做自动路由，查询返回路径真实几何而不是“元素中心连线”的语义。 */
(function (global) {
  'use strict';

  var NoteViz = global.NoteViz = global.NoteViz || {};
  var shared = global.NoteVizObjectsInternals;
  if (!shared) {
    throw new Error('NoteViz objects 组件需要先加载 src/viz/objects.js（内部共享文件）。');
  }
  var Core = shared.Core;
  var text = shared.text;
  var el = shared.el;
  var svgEl = shared.svgEl;
  var setText = shared.setText;
  var uniqueId = shared.uniqueId;
  var validateHost = shared.validateHost;
  var listenersFor = shared.listenersFor;
  var numberOr = shared.numberOr;
  var markOf = shared.markOf;
  var markLabel = shared.markLabel;
  var markAria = shared.markAria;
  var emptyLine = shared.emptyLine;
  var makeScrollHint = shared.makeScrollHint;
  var attachScrollRegion = shared.attachScrollRegion;
  var charUnits = shared.charUnits;
  var wrapText = shared.wrapText;
  var closestInside = shared.closestInside;
  var toIdSet = shared.toIdSet;

  function removeNode(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  /* =====================================================================
   * D03 — Graph
   * ===================================================================== */

  function normalizeGraphNodes(input) {
    var list = Array.isArray(input) ? input : [];
    var groups = new Map();
    return list.map(function (item, index) {
      var source = item && typeof item === 'object' ? item : { label: item };
      var id = source.id != null && text(source.id) !== '' ? text(source.id) : 'node-' + index;
      var group = source.group == null ? '' : text(source.group);
      if (group && !groups.has(group)) groups.set(group, groups.size + 1);
      return {
        id: id,
        label: source.label == null ? id : text(source.label),
        group: group,
        groupIndex: group ? groups.get(group) : 0,
        x: source.x,
        y: source.y,
        originalIndex: index
      };
    });
  }

  function normalizeGraphEdges(input, nodes) {
    var byId = new Map();
    nodes.forEach(function (node) { byId.set(node.id, node); });
    var list = Array.isArray(input) ? input : [];
    var routeSeen = new Map();
    var used = new Set();
    return list.map(function (edge) {
      if (!edge || typeof edge !== 'object') return null;
      var from = edge.from == null ? '' : text(edge.from);
      var to = edge.to == null ? '' : text(edge.to);
      if (!byId.has(from) || !byId.has(to)) return null;
      var route = from + ' -> ' + to;
      var routeCount = routeSeen.get(route) || 0;
      routeSeen.set(route, routeCount + 1);
      var base = edge.id == null ? '' : text(edge.id);
      if (!base) {
        /* 缺省稳定键与 NoteBlocks.ProcessFlow 的 edgeIds 解析约定一致：
           route 第一次出现为 "from -> to"，之后为 "from -> to #2"…；
           显式 id 的边也占用 route 序号。 */
        base = routeCount === 0 ? route : route + ' #' + (routeCount + 1);
      }
      /* 作者提供重复 id 时也补后缀，保证每条边的 DOM 目标/路径句柄唯一。 */
      var id = base;
      var suffix = 1;
      while (used.has(id)) {
        suffix += 1;
        id = base + ' #' + suffix;
      }
      used.add(id);
      return {
        id: id,
        from: from,
        to: to,
        route: route,
        label: edge.label == null ? '' : text(edge.label),
        directed: edge.directed === true
      };
    }).filter(Boolean);
  }

  function graphLayeredLevels(nodes, edges) {
    var indegree = new Map();
    var outgoing = new Map();
    nodes.forEach(function (node) {
      indegree.set(node.id, 0);
      outgoing.set(node.id, []);
    });
    edges.forEach(function (edge) {
      if (edge.from === edge.to) return;
      outgoing.get(edge.from).push(edge.to);
      indegree.set(edge.to, indegree.get(edge.to) + 1);
    });
    var queue = [];
    nodes.forEach(function (node) {
      if (indegree.get(node.id) === 0) queue.push(node.id);
    });
    var levels = new Map();
    queue.forEach(function (id) { levels.set(id, 0); });
    var head = 0;
    var maxLevel = -1;
    while (head < queue.length) {
      var id = queue[head];
      head += 1;
      var current = levels.get(id) || 0;
      maxLevel = Math.max(maxLevel, current);
      outgoing.get(id).forEach(function (next) {
        levels.set(next, Math.max(levels.has(next) ? levels.get(next) : 0, current + 1));
        indegree.set(next, indegree.get(next) - 1);
        if (indegree.get(next) === 0) queue.push(next);
      });
    }
    nodes.forEach(function (node) {
      if (!levels.has(node.id)) levels.set(node.id, maxLevel + 1);
    });
    return levels;
  }

  function nodeBoxMetrics(node) {
    var labelX = node.group ? 34 : 12;
    var maxUnits = node.group ? 12 : 14;
    var lines = wrapText(node.label, maxUnits);
    var width = 196;
    var height = 36 + lines.length * 18;
    return {
      width: width,
      height: height,
      lines: lines,
      labelX: labelX
    };
  }

  function rectEdgePoint(cx, cy, width, height, dx, dy) {
    if (!dx && !dy) return { x: cx, y: cy };
    var tx = dx === 0 ? Infinity : (width / 2) / Math.abs(dx);
    var ty = dy === 0 ? Infinity : (height / 2) / Math.abs(dy);
    var ratio = Math.min(tx, ty);
    return { x: cx + dx * ratio, y: cy + dy * ratio };
  }

  NoteViz.Graph = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var root = el('div', 'nviz-graph');
      var legend = el('div', 'nviz-graph__legend');
      var viewport = el('div', 'nviz-graph__viewport');
      var hint = makeScrollHint('nviz-graph__hint');
      var note = el('p', 'nviz-graph__note');
      var empty = emptyLine('暂无可显示的图节点。');
      var scroll = null;
      var svgBag = null;
      var nodeEls = new Map();
      var edgeEls = new Map();     // 边稳定 id → <g>，更新时复用
      var edgeState = new Map();   // 当前渲染边记录：path/group/端点/mark，供查询 API
      var markerId = uniqueId('nviz-graph-arrow');
      var titleId = uniqueId('nviz-graph-title');
      var descId = uniqueId('nviz-graph-desc');
      var svg = svgEl('svg', { class: 'nviz-graph__svg', role: 'group' });
      var svgTitle = svgEl('title');
      var svgDesc = svgEl('desc');
      var defs = svgEl('defs');
      var marker = svgEl('marker', {
        id: markerId,
        viewBox: '0 0 10 10',
        refX: '9',
        refY: '5',
        markerWidth: '8',
        markerHeight: '8',
        orient: 'auto-start-reverse'
      });
      var markerPath = svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'nviz-graph__arrowhead' });
      var edgeLayer = svgEl('g', { class: 'nviz-graph__edges' });
      var nodeLayer = svgEl('g', { class: 'nviz-graph__nodes' });

      svgTitle.id = titleId;
      svgDesc.id = descId;
      svg.setAttribute('aria-labelledby', titleId + ' ' + descId);
      marker.appendChild(markerPath);
      defs.appendChild(marker);
      svg.append(svgTitle, svgDesc, defs, edgeLayer, nodeLayer);
      viewport.appendChild(svg);
      legend.hidden = true;
      note.hidden = true;
      empty.hidden = true;
      root.setAttribute('role', 'group');
      root.append(legend, viewport, hint, note, empty);

      var model = Object.assign({
        nodes: [],
        edges: [],
        layout: 'layered',
        width: null,
        height: null,
        focus: null,
        changed: null,
        edgeFocus: null,
        edgeChanged: null,
        label: '节点关系图',
        onSelect: null
      }, options || {});

      function layoutGraph(nodes, edges, positionsMap) {
        var layout = model.layout === 'manual' ? 'manual' : 'layered';
        var metrics = new Map();
        nodes.forEach(function (node) {
          metrics.set(node.id, nodeBoxMetrics(node));
        });

        if (layout === 'manual') {
          var gridCols = Math.max(1, Math.ceil(Math.sqrt(nodes.length || 1)));
          nodes.forEach(function (node, index) {
            var m = metrics.get(node.id);
            var cx;
            var cy;
            var hasPoint = node.x != null && node.y != null && isFinite(Number(node.x)) && isFinite(Number(node.y));
            if (hasPoint) {
              cx = Number(node.x);
              cy = Number(node.y);
            } else {
              var col = index % gridCols;
              var row = Math.floor(index / gridCols);
              cx = 120 + col * 240;
              cy = 80 + row * 140;
            }
            positionsMap.set(node.id, {
              x: cx - m.width / 2,
              y: cy - m.height / 2,
              width: m.width,
              height: m.height,
              cx: cx,
              cy: cy
            });
          });
          var minX = Infinity;
          var minY = Infinity;
          var maxX = -Infinity;
          var maxY = -Infinity;
          positionsMap.forEach(function (box) {
            minX = Math.min(minX, box.x);
            minY = Math.min(minY, box.y);
            maxX = Math.max(maxX, box.x + box.width);
            maxY = Math.max(maxY, box.y + box.height);
          });
          var margin = 28;
          minX -= margin;
          minY -= margin;
          maxX += margin;
          maxY += margin;
          var canvasW = Math.max(numberOr(model.width, 0), maxX - minX, 280);
          var canvasH = Math.max(numberOr(model.height, 0), maxY - minY, 180);
          return { minX: minX, minY: minY, width: canvasW, height: canvasH };
        }

        var levels = graphLayeredLevels(nodes, edges);
        var buckets = new Map();
        nodes.forEach(function (node) {
          var level = levels.get(node.id) || 0;
          if (!buckets.has(level)) buckets.set(level, []);
          buckets.get(level).push(node);
        });
        var levelKeys = Array.from(buckets.keys()).sort(function (a, b) { return a - b; });
        var gapX = 34;
        var gapY = 54;
        var margin = 30;
        var totalWidth = 0;
        var levelWidths = new Map();
        var levelHeights = new Map();
        levelKeys.forEach(function (level) {
          var row = buckets.get(level);
          var rowWidth = 0;
          var rowHeight = 0;
          row.forEach(function (node, index) {
            var m = metrics.get(node.id);
            rowWidth += m.width + (index ? gapX : 0);
            rowHeight = Math.max(rowHeight, m.height);
          });
          levelWidths.set(level, rowWidth);
          levelHeights.set(level, rowHeight);
          totalWidth = Math.max(totalWidth, rowWidth);
        });
        var canvasW = Math.max(numberOr(model.width, 0), totalWidth + margin * 2, 300);
        var contentOffsetX = margin + Math.max(0, (canvasW - totalWidth - margin * 2) / 2);
        var y = margin;
        levelKeys.forEach(function (level) {
          var row = buckets.get(level);
          var rowWidth = levelWidths.get(level);
          var x = contentOffsetX + Math.max(0, (totalWidth - rowWidth) / 2);
          row.forEach(function (node) {
            var m = metrics.get(node.id);
            positionsMap.set(node.id, {
              x: x,
              y: y,
              width: m.width,
              height: m.height,
              cx: x + m.width / 2,
              cy: y + m.height / 2
            });
            x += m.width + gapX;
          });
          y += levelHeights.get(level) + gapY;
        });
        var contentH = levelKeys.length ? y - gapY + margin : 160;
        var canvasH = Math.max(numberOr(model.height, 0), contentH, 180);
        return { minX: 0, minY: 0, width: canvasW, height: canvasH };
      }

      function nodeContent(g, node, box, mark, interactive) {
        g.replaceChildren();
        var m = nodeBoxMetrics(node);
        var title = svgEl('title');
        title.textContent = node.label;
        g.appendChild(title);
        g.appendChild(svgEl('rect', {
          class: 'nviz-graph__box',
          x: '0',
          y: '0',
          width: String(box.width),
          height: String(box.height),
          rx: '10'
        }));

        if (node.group) {
          g.appendChild(svgEl('rect', {
            class: 'nviz-graph__groupchip',
            x: '9',
            y: '10',
            width: '17',
            height: '17',
            rx: '5'
          }));
          var chipText = svgEl('text', {
            class: 'nviz-graph__groupnum',
            x: '17.5',
            y: '22.5',
            'text-anchor': 'middle'
          });
          chipText.textContent = String(node.groupIndex);
          g.appendChild(chipText);
        }

        var label = svgEl('text', {
          class: 'nviz-graph__nodelabel',
          x: String(m.labelX),
          y: '25'
        });
        m.lines.forEach(function (line, index) {
          var tspan = svgEl('tspan', { x: String(m.labelX), dy: index === 0 ? '0' : '18' });
          tspan.textContent = line;
          label.appendChild(tspan);
        });
        g.appendChild(label);

        if (mark) {
          var state = svgEl('text', {
            class: 'nviz-graph__nodestate',
            x: '12',
            y: String(box.height - 10)
          });
          state.textContent = markLabel(mark);
          g.appendChild(state);
        }

        var aria = '节点 ' + node.label + (node.group ? '，分组 ' + node.group : '') + markAria(mark) +
          (interactive ? '，可点击或按回车选择' : '');
        g.setAttribute('aria-label', aria);
        g.setAttribute('role', interactive ? 'button' : 'group');
        if (interactive) g.setAttribute('tabindex', '0');
        else g.removeAttribute('tabindex');
        g.setAttribute('data-mark', mark || 'none');
        g.setAttribute('data-id', node.id);
        g.setAttribute('class', 'nviz-graph__node' + (interactive ? ' nviz-graph__node--interactive' : ''));
        g.setAttribute('transform', 'translate(' + box.x + ',' + box.y + ')');
      }

      function edgeLabel(parent, edge, x, y) {
        if (!edge.label) return;
        var lines = wrapText(edge.label, 18);
        var lineHeight = 14;
        var width = 0;
        lines.forEach(function (line) {
          var units = 0;
          Array.from(line).forEach(function (character) { units += charUnits(character); });
          width = Math.max(width, units * 7.2);
        });
        width = Math.max(30, width + 14);
        var height = lines.length * lineHeight + 7;
        parent.appendChild(svgEl('rect', {
          class: 'nviz-graph__edgelabel-bg',
          x: String(x - width / 2),
          y: String(y - height / 2),
          width: String(width),
          height: String(height),
          rx: '5'
        }));
        var label = svgEl('text', {
          class: 'nviz-graph__edgelabel',
          x: String(x),
          y: String(y - height / 2 + 12),
          'text-anchor': 'middle'
        });
        lines.forEach(function (line, index) {
          var tspan = svgEl('tspan', { x: String(x), dy: index === 0 ? '0' : String(lineHeight) });
          tspan.textContent = line;
          label.appendChild(tspan);
        });
        parent.appendChild(label);
      }

      /* 边 <g> 在更新时复用：title/path/label 容器各自保持同一节点；
         path 始终是 <path>，可直接用原生 getTotalLength/getPointAtLength 查询。 */
      function ensureEdgeStructure(group) {
        var title = null;
        var path = null;
        var labelWrap = null;
        var child = group.firstChild;
        while (child) {
          if (child.nodeType === 1) {
            if (child.tagName && child.tagName.toLowerCase() === 'title') title = child;
            else if (child.getAttribute('class') === 'nviz-graph__edgeline') path = child;
            else if (child.getAttribute('class') === 'nviz-graph__edgelabelwrap') labelWrap = child;
          }
          child = child.nextSibling;
        }
        if (!title) {
          title = svgEl('title');
          group.insertBefore(title, group.firstChild);
        }
        if (path && path.tagName && path.tagName.toLowerCase() !== 'path') {
          removeNode(path);
          path = null;
        }
        if (!path) {
          path = svgEl('path', { class: 'nviz-graph__edgeline' });
          group.appendChild(path);
        }
        if (!labelWrap) {
          labelWrap = svgEl('g', { class: 'nviz-graph__edgelabelwrap' });
          group.appendChild(labelWrap);
        }
        return { title: title, path: path, labelWrap: labelWrap };
      }

      /* 路径在 SVG 局部坐标（与节点 box 同在边/节点层的用户坐标系）生成；
         自环沿用固定小回环，普通边为直线。端点/标签位置同时缓存供查询。 */
      function edgePathGeometry(edge, from, to) {
        if (edge.from === edge.to) {
          var loopStart = { x: from.cx + from.width / 2, y: from.cy - 10 };
          var loopEnd = { x: to.cx + to.width / 2, y: to.cy + 10 };
          return {
            d: 'M ' + loopStart.x + ' ' + loopStart.y +
              ' C ' + (loopStart.x + 52) + ' ' + (loopStart.y - 38) + ' ' +
              (loopEnd.x + 52) + ' ' + (loopEnd.y + 38) + ' ' +
              loopEnd.x + ' ' + loopEnd.y,
            start: loopStart,
            end: loopEnd,
            labelX: loopStart.x + 56,
            labelY: from.cy
          };
        }
        var dx = to.cx - from.cx;
        var dy = to.cy - from.cy;
        var start = rectEdgePoint(from.cx, from.cy, from.width, from.height, dx, dy);
        var end = rectEdgePoint(to.cx, to.cy, to.width, to.height, -dx, -dy);
        return {
          d: 'M ' + start.x + ' ' + start.y + ' L ' + end.x + ' ' + end.y,
          start: start,
          end: end,
          labelX: (start.x + end.x) / 2,
          labelY: (start.y + end.y) / 2 - 7
        };
      }

      function render(patch) {
        var nodes = normalizeGraphNodes(model.nodes);
        var edges = normalizeGraphEdges(model.edges, nodes);
        var label = text(model.label) || '节点关系图';
        var focus = toIdSet(model.focus);
        var changed = toIdSet(model.changed);
        var edgeFocus = toIdSet(model.edgeFocus);
        var edgeChanged = toIdSet(model.edgeChanged);
        var interactive = typeof model.onSelect === 'function';
        var positions = new Map();
        var oldNodeEls = nodeEls;
        var newNodeEls = new Map();
        var groupMap = new Map();

        root.setAttribute('aria-label', label);
        root.setAttribute('data-layout', model.layout === 'manual' ? 'manual' : 'layered');
        viewport.setAttribute('aria-label', label + '，可滚动画布');
        nodeLayer.replaceChildren();
        setText(svgTitle, label);
        setText(svgDesc, '');
        note.textContent = '';
        note.hidden = true;

        nodes.forEach(function (node) {
          if (!node.group) return;
          if (!groupMap.has(node.group)) groupMap.set(node.group, []);
          groupMap.get(node.group).push(node);
        });

        /* 先清理本次不存在的边，空节点早退时旧边目标也会立即失效。 */
        var nextEdgeIds = new Set();
        edges.forEach(function (edge) { nextEdgeIds.add(edge.id); });
        edgeEls.forEach(function (group, id) {
          if (!nextEdgeIds.has(id)) {
            removeNode(group);
            edgeEls.delete(id);
          }
        });
        edgeState.clear();

        if (!nodes.length) {
          viewport.hidden = true;
          legend.hidden = true;
          hint.hidden = true;
          note.hidden = true;
          empty.hidden = false;
          nodeEls = newNodeEls;
          edgeState.clear();
          if (scroll) scroll.schedule();
          return;
        }
        viewport.hidden = false;
        empty.hidden = true;

        var canvas = layoutGraph(nodes, edges, positions);
        svg.setAttribute('width', String(Math.ceil(canvas.width)));
        svg.setAttribute('height', String(Math.ceil(canvas.height)));
        svg.setAttribute('viewBox', canvas.minX + ' ' + canvas.minY + ' ' +
          Math.ceil(canvas.width) + ' ' + Math.ceil(canvas.height));
        setText(svgDesc, '共 ' + nodes.length + ' 个节点、' + edges.length + ' 条边。' +
          (groupMap.size ? '分组：' + Array.from(groupMap.keys()).join('、') + '。' : '') +
          '画布超出容器时可滚动查看。');

        legend.hidden = groupMap.size === 0;
        if (groupMap.size) legend.setAttribute('role', 'list');
        else legend.removeAttribute('role');
        legend.replaceChildren();
        groupMap.forEach(function (groupNodes, groupName) {
          var chip = el('span', 'nviz-graph__legenditem');
          chip.setAttribute('role', 'listitem');
          var groupIndex = groupNodes[0].groupIndex;
          chip.appendChild(el('span', 'nviz-graph__legendnum', String(groupIndex)));
          chip.appendChild(el('span', 'nviz-graph__legendtext', groupName));
          chip.setAttribute('aria-label', '分组 ' + groupIndex + '：' + groupName + '，' + groupNodes.length + ' 个节点');
          legend.appendChild(chip);
        });

        edges.forEach(function (edge) {
          var from = positions.get(edge.from);
          var to = positions.get(edge.to);
          if (!from || !to) return;
          var mark = markOf(edgeFocus.has(edge.id), edgeChanged.has(edge.id));
          var geometry = edgePathGeometry(edge, from, to);
          var group = edgeEls.get(edge.id) || svgEl('g');
          var parts = ensureEdgeStructure(group);
          group.setAttribute('class', 'nviz-graph__edge');
          group.setAttribute('data-edge-id', edge.id);
          group.setAttribute('data-from', edge.from);
          group.setAttribute('data-to', edge.to);
          group.setAttribute('data-mark', mark || 'none');
          parts.title.textContent = (edge.directed ? '方向 ' : '') + edge.from + ' 到 ' + edge.to +
            (edge.label ? '：' + edge.label : '') + markAria(mark);
          parts.path.setAttribute('d', geometry.d);
          if (edge.directed) parts.path.setAttribute('marker-end', 'url(#' + markerId + ')');
          else parts.path.removeAttribute('marker-end');
          parts.labelWrap.replaceChildren();
          if (edge.label) edgeLabel(parts.labelWrap, edge, geometry.labelX, geometry.labelY);
          edgeLayer.appendChild(group);
          edgeEls.set(edge.id, group);
          edgeState.set(edge.id, {
            id: edge.id,
            from: edge.from,
            to: edge.to,
            label: edge.label,
            directed: edge.directed,
            mark: mark,
            group: group,
            path: parts.path,
            start: { x: geometry.start.x, y: geometry.start.y },
            end: { x: geometry.end.x, y: geometry.end.y }
          });
        });

        var focusLabels = [];
        var changedLabels = [];
        var bothLabels = [];
        nodes.forEach(function (node) {
          var box = positions.get(node.id);
          if (!box) return;
          var g = oldNodeEls.get(node.id) || svgEl('g');
          var mark = markOf(focus.has(node.id), changed.has(node.id));
          nodeContent(g, node, box, mark, interactive);
          nodeLayer.appendChild(g);
          newNodeEls.set(node.id, g);
          if (mark === 'both') bothLabels.push(node.label);
          else if (mark === 'changed') changedLabels.push(node.label);
          else if (mark === 'focus') focusLabels.push(node.label);
        });
        nodeEls = newNodeEls;

        var summary = [];
        if (focusLabels.length) summary.push('关注：' + focusLabels.join('、'));
        if (changedLabels.length) summary.push('变化：' + changedLabels.join('、'));
        if (bothLabels.length) summary.push('关注并变化：' + bothLabels.join('、'));
        if (summary.length) {
          note.textContent = summary.join('；') + '。';
          note.hidden = false;
        }

        if (scroll) scroll.schedule();
      }

      var cleanup = function () {
        if (scroll) scroll.destroy();
        if (svgBag) svgBag.clear();
      };
      var instance = Core.component(root, model, render, cleanup);
      render({});
      host.appendChild(root);
      scroll = attachScrollRegion(viewport, hint, 'both');
      svgBag = listenersFor(svg);
      svgBag.on('click', function (event) {
        if (typeof model.onSelect !== 'function') return;
        var g = closestInside(event.target, '.nviz-graph__node', svg);
        if (!g || g.getAttribute('tabindex') !== '0') return;
        model.onSelect(g.getAttribute('data-id'), event);
      });
      svgBag.on('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
        if (typeof model.onSelect !== 'function') return;
        var g = closestInside(event.target, '.nviz-graph__node', svg);
        if (!g || g.getAttribute('tabindex') !== '0') return;
        event.preventDefault();
        model.onSelect(g.getAttribute('data-id'), event);
      });
      scroll.schedule();

      instance.getTarget = function (id) {
        if (instance.destroyed || id == null) return null;
        return nodeEls.get(String(id)) || null;
      };

      /* ---------- 边目标与路径查询 ----------
       * 边 id：作者提供 edge.id；缺省为 "from -> to"，平行同向边追加 " #2"…
       * 所有点/端点坐标均为 SVG 局部用户坐标（与 viewBox 同坐标系）；
       * getEdgePointClient 用路径的 screen CTM 转成 DOM 视口 client 坐标。
       * 边查询与节点 getTarget 分开：getTarget 永远只返回节点 <g>。 */
      function liveEdge(id) {
        if (instance.destroyed || id == null) return null;
        var record = edgeState.get(String(id));
        if (!record || !record.path) return null;
        return record;
      }

      function edgeLengthOf(record) {
        var length = 0;
        try { length = record.path.getTotalLength(); } catch (err) { length = 0; }
        return isFinite(length) ? length : 0;
      }

      function edgePointAtRatio(record, ratio) {
        var value = Number(ratio);
        if (!isFinite(value)) value = 0;
        value = Math.min(1, Math.max(0, value));
        var length = edgeLengthOf(record);
        if (!length) return { x: record.start.x, y: record.start.y, ratio: value };
        var point = record.path.getPointAtLength(length * value);
        return { x: point.x, y: point.y, ratio: value };
      }

      function edgePointToClient(record, point) {
        var ctm = null;
        try { ctm = record.path.getScreenCTM(); } catch (err) { ctm = null; }
        if (ctm) {
          return {
            x: ctm.a * point.x + ctm.c * point.y + ctm.e,
            y: ctm.b * point.x + ctm.d * point.y + ctm.f
          };
        }
        var rect = svg.getBoundingClientRect();
        var view = svg.viewBox && svg.viewBox.baseVal;
        if (!view || !view.width || !view.height) {
          return { x: rect.left + point.x, y: rect.top + point.y };
        }
        return {
          x: rect.left + (point.x - view.x) * rect.width / view.width,
          y: rect.top + (point.y - view.y) * rect.height / view.height
        };
      }

      instance.getEdgeTarget = function (id) {
        var record = liveEdge(id);
        return record ? record.group : null;
      };
      instance.getEdgePath = function (id) {
        var record = liveEdge(id);
        return record ? record.path : null;
      };
      instance.getEdgeLength = function (id) {
        var record = liveEdge(id);
        return record ? edgeLengthOf(record) : null;
      };
      instance.getEdgePoint = function (id, ratio) {
        var record = liveEdge(id);
        if (!record) return null;
        var point = edgePointAtRatio(record, ratio);
        return { x: point.x, y: point.y };
      };
      instance.getEdgePointClient = function (id, ratio) {
        var record = liveEdge(id);
        if (!record) return null;
        var point = edgePointAtRatio(record, ratio);
        return edgePointToClient(record, point);
      };
      instance.getEdgePointAt = function (id, distance) {
        var record = liveEdge(id);
        if (!record) return null;
        var length = edgeLengthOf(record);
        var offset = Number(distance);
        if (!isFinite(offset)) offset = 0;
        offset = Math.min(length, Math.max(0, offset));
        if (!length) return { x: record.start.x, y: record.start.y, distance: 0, ratio: 0 };
        var point = record.path.getPointAtLength(offset);
        return { x: point.x, y: point.y, distance: offset, ratio: offset / length };
      };
      instance.getEdgeEndpoints = function (id) {
        var record = liveEdge(id);
        if (!record) return null;
        return {
          start: { x: record.start.x, y: record.start.y },
          end: { x: record.end.x, y: record.end.y }
        };
      };
      instance.getEdgeInfo = function (id) {
        var record = liveEdge(id);
        if (!record) return null;
        return {
          id: record.id,
          from: record.from,
          to: record.to,
          label: record.label,
          directed: record.directed,
          mark: record.mark || 'none',
          length: edgeLengthOf(record),
          endpoints: instance.getEdgeEndpoints(id)
        };
      };
      return instance;
    }
  };
})(window);

/* ---- source: src/viz/objects-timeline-tree.js ---- */
/*! NoteViz objects D01-D06 — D04 Timeline, D05 TreeDiagram.
 *  Classic script; load after src/viz/objects.js (internal shared helpers).
 *  Public entries: NoteViz.Timeline, NoteViz.TreeDiagram.
 *  No network, no eval, no HTML parsing. */
(function (global) {
  'use strict';

  var NoteViz = global.NoteViz = global.NoteViz || {};
  var shared = global.NoteVizObjectsInternals;
  if (!shared) {
    throw new Error('NoteViz objects 组件需要先加载 src/viz/objects.js（内部共享文件）。');
  }
  var Core = shared.Core;
  var text = shared.text;
  var el = shared.el;
  var svgEl = shared.svgEl;
  var setText = shared.setText;
  var uniqueId = shared.uniqueId;
  var validateHost = shared.validateHost;
  var markOf = shared.markOf;
  var markLabel = shared.markLabel;
  var markAria = shared.markAria;
  var emptyLine = shared.emptyLine;
  var makeScrollHint = shared.makeScrollHint;
  var attachScrollRegion = shared.attachScrollRegion;
  var charUnits = shared.charUnits;
  var wrapText = shared.wrapText;
  var findDescriptorIndex = shared.findDescriptorIndex;
  var toIdSet = shared.toIdSet;
  var resolveItemKeys = shared.resolveItemKeys;

  /* =====================================================================
   * D04 — Timeline
   * ===================================================================== */

  NoteViz.Timeline = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var root = el('div', 'nviz-timeline');
      var rangeBar = el('p', 'nviz-timeline__range');
      var viewport = el('div', 'nviz-timeline__viewport');
      var list = el('ol', 'nviz-timeline__list');
      var hint = makeScrollHint('nviz-timeline__hint');
      var empty = emptyLine('暂无可显示的时间线事件。');
      var scroll = null;
      var parts = new Map();
      var targets = new Map();
      var currentItems = [];

      rangeBar.hidden = true;
      viewport.appendChild(list);
      empty.hidden = true;
      root.setAttribute('role', 'group');
      root.append(rangeBar, viewport, hint, empty);

      var model = Object.assign({
        items: [],
        orientation: 'horizontal',
        current: null,
        focus: null,
        changed: null,
        start: null,
        end: null,
        formatTime: null,
        label: '时间线'
      }, options || {});

      function formatValue(value, item) {
        if (value == null || value === '') return '';
        if (typeof model.formatTime === 'function') {
          try {
            return text(model.formatTime(value, item || null));
          } catch (error) {
            return text(value);
          }
        }
        return text(value);
      }

      function normalizeTimelineItems(input) {
        var source = Array.isArray(input) ? input : [];
        return source.map(function (item, index) {
          var data = item != null && typeof item === 'object' ? item : { label: item };
          var hasRange = data.start != null && data.end != null;
          var kind = data.kind === 'range' || data.kind === 'phase' || data.kind === 'event' ? data.kind :
            (hasRange ? 'range' : 'event');
          if ((kind === 'phase' || kind === 'range') && !hasRange) kind = 'event';
          var id = data.id != null && text(data.id) !== '' ? text(data.id) : 'event-' + index;
          var label = data.label == null ? (data.title == null ? '未命名事件' : text(data.title)) : text(data.label);
          var timeLabel = '';
          if (data.timeLabel != null) {
            timeLabel = text(data.timeLabel);
          } else if (kind !== 'event' && hasRange) {
            timeLabel = formatValue(data.start, data) + ' – ' + formatValue(data.end, data);
          } else if (data.time != null) {
            timeLabel = formatValue(data.time, data);
          } else if (data.start != null) {
            timeLabel = formatValue(data.start, data);
          }
          return {
            id: id,
            index: index,
            label: label,
            description: data.description == null ? '' : text(data.description),
            kind: kind,
            start: data.start,
            end: data.end,
            timeLabel: timeLabel,
            raw: data
          };
        });
      }

      function createParts() {
        var li = el('li', 'nviz-timeline__item');
        var time = el('div', 'nviz-timeline__time');
        var rail = el('div', 'nviz-timeline__rail');
        rail.setAttribute('aria-hidden', 'true');
        var marker = el('span', 'nviz-timeline__marker');
        rail.appendChild(marker);
        var card = el('div', 'nviz-timeline__card');
        var head = el('div', 'nviz-timeline__cardhead');
        var label = el('span', 'nviz-timeline__label');
        var kind = el('span', 'nviz-timeline__kind');
        var state = el('span', 'nviz-timeline__state');
        head.append(label, kind, state);
        var desc = el('p', 'nviz-timeline__desc');
        card.append(head, desc);
        li.append(time, rail, card);
        return {
          li: li,
          time: time,
          label: label,
          kind: kind,
          state: state,
          desc: desc,
          card: card
        };
      }

      function render(patch) {
        var items = normalizeTimelineItems(model.items);
        var label = text(model.label) || '时间线';
        var orientation = model.orientation === 'vertical' ? 'vertical' : 'horizontal';
        var focus = resolveItemKeys(model.focus, items, { indexRefs: true });
        var changed = resolveItemKeys(model.changed, items, { indexRefs: true });
        var currentIndex = findDescriptorIndex(items, model.current);
        var current = currentIndex >= 0 ? items[currentIndex].id : '';
        var oldParts = parts;
        var newParts = new Map();
        var newTargets = new Map();
        currentItems = items;

        root.setAttribute('data-orientation', orientation);
        root.setAttribute('aria-label', label);
        viewport.setAttribute('aria-label', label + '，可滚动列表');
        viewport.setAttribute('data-orientation', orientation);

        var startLabel = formatValue(model.start, null);
        var endLabel = formatValue(model.end, null);
        if (startLabel || endLabel) {
          rangeBar.hidden = false;
          rangeBar.textContent = '时间范围：' + (startLabel || '起点') + ' — ' + (endLabel || '终点');
        } else {
          rangeBar.hidden = true;
          rangeBar.textContent = '';
        }

        list.replaceChildren();
        if (!items.length) {
          viewport.hidden = true;
          empty.hidden = false;
          hint.hidden = true;
          rangeBar.hidden = true;
          parts = newParts;
          targets = newTargets;
          if (scroll) scroll.schedule();
          return;
        }
        viewport.hidden = false;
        empty.hidden = true;

        items.forEach(function (item) {
          var created = oldParts.get(item.id) || createParts();
          var li = created.li;
          var isCurrent = item.id === current;
          var isFocus = focus.has(item.id);
          var isChanged = changed.has(item.id);
          var mark = markOf(isFocus, isChanged);
          var stateParts = [];
          if (isCurrent) stateParts.push('当前');
          if (isFocus) stateParts.push('关注');
          if (isChanged) stateParts.push('变化');
          created.time.textContent = item.timeLabel || '时间未标注';
          created.label.textContent = item.label;
          var kindText = item.kind === 'phase' ? '阶段' : (item.kind === 'range' ? '区间' : '');
          created.kind.textContent = kindText;
          created.kind.hidden = !kindText;
          created.state.textContent = stateParts.join(' · ');
          created.state.hidden = !stateParts.length;
          created.desc.textContent = item.description;
          created.desc.hidden = !item.description;
          created.card.setAttribute('data-kind', item.kind);
          li.setAttribute('data-id', item.id);
          li.setAttribute('data-kind', item.kind);
          li.setAttribute('data-current', isCurrent ? 'true' : 'false');
          li.setAttribute('data-focus', isFocus ? 'true' : 'false');
          li.setAttribute('data-changed', isChanged ? 'true' : 'false');
          li.setAttribute('data-mark', mark || 'none');
          if (isCurrent) li.setAttribute('aria-current', 'step');
          else li.removeAttribute('aria-current');
          li.removeAttribute('aria-label');
          list.appendChild(li);
          newParts.set(item.id, created);
          newTargets.set(item.id, li);
        });

        parts = newParts;
        targets = newTargets;
        if (scroll) scroll.schedule();
      }

      var cleanup = function () {
        if (scroll) scroll.destroy();
      };
      var instance = Core.component(root, model, render, cleanup);
      render({});
      host.appendChild(root);
      scroll = attachScrollRegion(viewport, hint, 'both');
      scroll.schedule();

      instance.getTarget = function (id) {
        if (instance.destroyed || id == null) return null;
        var key = String(id);
        if (targets.has(key)) return targets.get(key);
        if (/^-?\d+$/.test(key)) {
          var index = Number(key);
          if (index >= 0 && index < currentItems.length) return targets.get(currentItems[index].id) || null;
        }
        return null;
      };
      return instance;
    }
  };

  /* =====================================================================
   * D05 — Tree diagram
   * ===================================================================== */

  function normalizeTree(input) {
    var rootsSource;
    if (Array.isArray(input)) rootsSource = input;
    else if (input != null && typeof input === 'object') rootsSource = [input];
    else rootsSource = [];

    var flat = [];
    var roots = [];

    function walk(source, parent, depth, path, ancestors) {
      if (source == null) return null;
      if (typeof source !== 'object') source = { label: source };
      if (ancestors.indexOf(source) >= 0) return null;

      var id = source.id != null && text(source.id) !== '' ? text(source.id) : 'tree-' + path;
      var label = source.label == null ?
        (source.title == null ? (source.name == null ? '未命名节点' : text(source.name)) : text(source.title)) :
        text(source.label);
      var node = {
        id: id,
        label: label,
        depth: depth,
        parent: parent,
        children: [],
        source: source
      };
      flat.push(node);
      var childSource = Array.isArray(source.children) ? source.children : [];
      var nextAncestors = ancestors.concat([source]);
      childSource.forEach(function (child, index) {
        var childNode = walk(child, node, depth + 1, path + '-' + index, nextAncestors);
        if (childNode) node.children.push(childNode);
      });
      return node;
    }

    rootsSource.forEach(function (root, index) {
      var rootNode = walk(root, null, 0, String(index), []);
      if (rootNode) roots.push(rootNode);
    });

    return { roots: roots, flat: flat };
  }

  NoteViz.TreeDiagram = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var root = el('div', 'nviz-tree');
      var viewport = el('div', 'nviz-tree__viewport');
      var hint = makeScrollHint('nviz-tree__hint');
      var empty = emptyLine('暂无可显示的层级节点。');
      var titleId = uniqueId('nviz-tree-title');
      var descId = uniqueId('nviz-tree-desc');
      var svg = svgEl('svg', { class: 'nviz-tree__svg', role: 'group' });
      var svgTitle = svgEl('title');
      var svgDesc = svgEl('desc');
      var edgeLayer = svgEl('g', { class: 'nviz-tree__edges' });
      var nodeLayer = svgEl('g', { class: 'nviz-tree__nodes' });
      var nodeEls = new Map();
      var scroll = null;

      svgTitle.id = titleId;
      svgDesc.id = descId;
      svg.setAttribute('aria-labelledby', titleId + ' ' + descId);
      svg.append(svgTitle, svgDesc, edgeLayer, nodeLayer);
      viewport.appendChild(svg);
      empty.hidden = true;
      root.setAttribute('role', 'group');
      root.append(viewport, hint, empty);

      var model = Object.assign({
        nodes: [],
        orientation: 'down',
        focus: null,
        changed: null,
        label: '层级结构图'
      }, options || {});
      if (!Array.isArray(model.nodes) && model.root != null) model.nodes = model.root;

      function metricsFor(node, mark) {
        var lines = wrapText(node.label, 13);
        var width = 180;
        var height = 40 + Math.max(0, lines.length - 1) * 18 + (mark ? 20 : 0);
        return { lines: lines, width: width, height: height };
      }

      function layoutTree(flat, roots, metrics, orientation, positions) {
        if (!flat.length) return { width: 280, height: 160 };
        var leafCounter = 0;

        function assignOrder(node) {
          if (!node.children.length) {
            node.order = leafCounter;
            leafCounter += 1;
            return node.order;
          }
          node.children.forEach(assignOrder);
          var first = node.children[0].order;
          var last = node.children[node.children.length - 1].order;
          node.order = (first + last) / 2;
          return node.order;
        }
        roots.forEach(assignOrder);

        var maxDepth = 0;
        var maxHeight = 0;
        var maxWidth = 0;
        flat.forEach(function (node) {
          var m = metrics.get(node.id);
          maxDepth = Math.max(maxDepth, node.depth);
          maxHeight = Math.max(maxHeight, m.height);
          maxWidth = Math.max(maxWidth, m.width);
        });

        var margin = 26;
        if (orientation === 'right') {
          var gapX = 64;
          var gapY = 24;
          var slotH = maxHeight + gapY;
          var levelGap = maxWidth + gapX;
          var canvasW = margin * 2 + maxWidth + maxDepth * levelGap;
          var canvasH = margin * 2 + maxHeight + Math.max(0, leafCounter - 1) * slotH;
          flat.forEach(function (node) {
            var m = metrics.get(node.id);
            var x = margin + node.depth * levelGap;
            var centerY = margin + maxHeight / 2 + node.order * slotH;
            positions.set(node.id, {
              x: x,
              y: centerY - m.height / 2,
              width: m.width,
              height: m.height,
              cx: x + m.width / 2,
              cy: centerY
            });
          });
          return { width: Math.max(canvasW, 320), height: Math.max(canvasH, 180) };
        }

        var gapX = 30;
        var gapY = 48;
        var nodeW = 180;
        var slotW = nodeW + gapX;
        var levelHeights = [];
        flat.forEach(function (node) {
          var m = metrics.get(node.id);
          levelHeights[node.depth] = Math.max(levelHeights[node.depth] || 0, m.height);
        });
        var levelY = [];
        var y = margin;
        for (var depth = 0; depth <= maxDepth; depth += 1) {
          levelY[depth] = y;
          y += (levelHeights[depth] || 40) + gapY;
        }
        var canvasW = margin * 2 + nodeW + Math.max(0, leafCounter - 1) * slotW;
        var canvasH = y - gapY + margin;
        flat.forEach(function (node) {
          var m = metrics.get(node.id);
          var x = margin + node.order * slotW;
          positions.set(node.id, {
            x: x,
            y: levelY[node.depth],
            width: m.width,
            height: m.height,
            cx: x + m.width / 2,
            cy: levelY[node.depth] + m.height / 2
          });
        });
        return { width: Math.max(canvasW, 320), height: Math.max(canvasH, 180) };
      }

      function nodeContent(g, node, box, mark) {
        g.replaceChildren();
        var m = metricsFor(node, mark);
        var title = svgEl('title');
        title.textContent = node.label;
        g.appendChild(title);
        g.appendChild(svgEl('rect', {
          class: 'nviz-tree__box',
          x: '0',
          y: '0',
          width: String(box.width),
          height: String(box.height),
          rx: '9'
        }));

        var label = svgEl('text', { class: 'nviz-tree__label', x: '12', y: '26' });
        m.lines.forEach(function (line, index) {
          var tspan = svgEl('tspan', { x: '12', dy: index === 0 ? '0' : '18' });
          tspan.textContent = line;
          label.appendChild(tspan);
        });
        g.appendChild(label);

        if (mark) {
          var statusText = markLabel(mark);
          var units = 0;
          Array.from(statusText).forEach(function (character) { units += charUnits(character); });
          var statusWidth = Math.max(36, units * 7.2 + 14);
          g.appendChild(svgEl('rect', {
            class: 'nviz-tree__statusbg',
            x: '10',
            y: String(box.height - 23),
            width: String(statusWidth),
            height: '16',
            rx: '5'
          }));
          var status = svgEl('text', {
            class: 'nviz-tree__status',
            x: '17',
            y: String(box.height - 11)
          });
          status.textContent = statusText;
          g.appendChild(status);
        }

        var parentText = node.parent ? '，上级 ' + node.parent.label : '，根节点';
        var aria = '节点 ' + node.label + parentText + '，' + node.children.length + ' 个子节点' + markAria(mark);
        g.setAttribute('aria-label', aria);
        g.setAttribute('role', 'group');
        g.setAttribute('data-id', node.id);
        g.setAttribute('data-mark', mark || 'none');
        g.setAttribute('class', 'nviz-tree__node');
        g.setAttribute('transform', 'translate(' + box.x + ',' + box.y + ')');
      }

      function render(patch) {
        var tree = normalizeTree(model.nodes);
        var flat = tree.flat;
        var roots = tree.roots;
        var orientation = model.orientation === 'right' ? 'right' : 'down';
        var label = text(model.label) || '层级结构图';
        var focus = toIdSet(model.focus);
        var changed = toIdSet(model.changed);
        var metrics = new Map();
        var positions = new Map();
        var oldNodeEls = nodeEls;
        var newNodeEls = new Map();

        root.setAttribute('data-orientation', orientation);
        root.setAttribute('aria-label', label);
        viewport.setAttribute('aria-label', label + '，可滚动画布');
        setText(svgTitle, label);
        setText(svgDesc, '');
        edgeLayer.replaceChildren();
        nodeLayer.replaceChildren();

        flat.forEach(function (node) {
          var mark = markOf(focus.has(node.id), changed.has(node.id));
          node.mark = mark;
          metrics.set(node.id, metricsFor(node, mark));
        });

        if (!flat.length) {
          viewport.hidden = true;
          empty.hidden = false;
          hint.hidden = true;
          nodeEls = newNodeEls;
          if (scroll) scroll.schedule();
          return;
        }
        viewport.hidden = false;
        empty.hidden = true;

        var canvas = layoutTree(flat, roots, metrics, orientation, positions);
        svg.setAttribute('width', String(Math.ceil(canvas.width)));
        svg.setAttribute('height', String(Math.ceil(canvas.height)));
        svg.setAttribute('viewBox', '0 0 ' + Math.ceil(canvas.width) + ' ' + Math.ceil(canvas.height));
        setText(svgDesc, '共 ' + flat.length + ' 个节点，' +
          (roots.length > 1 ? roots.length + ' 个根节点，' : '') +
          '方向' + (orientation === 'right' ? '向右' : '向下') + '。画布超出容器时可滚动查看。');

        flat.forEach(function (node) {
          if (!node.parent) return;
          var parentBox = positions.get(node.parent.id);
          var childBox = positions.get(node.id);
          if (!parentBox || !childBox) return;
          var path = svgEl('path', { class: 'nviz-tree__edge' });
          if (orientation === 'right') {
            var startX = parentBox.x + parentBox.width;
            var startY = parentBox.y + parentBox.height / 2;
            var endX = childBox.x;
            var endY = childBox.y + childBox.height / 2;
            var midX = (startX + endX) / 2;
            path.setAttribute('d', 'M ' + startX + ' ' + startY + ' H ' + midX +
              ' V ' + endY + ' H ' + endX);
          } else {
            var sx = parentBox.x + parentBox.width / 2;
            var sy = parentBox.y + parentBox.height;
            var ex = childBox.x + childBox.width / 2;
            var ey = childBox.y;
            var midY = (sy + ey) / 2;
            path.setAttribute('d', 'M ' + sx + ' ' + sy + ' V ' + midY + ' H ' + ex + ' V ' + ey);
          }
          edgeLayer.appendChild(path);
        });

        flat.forEach(function (node) {
          var box = positions.get(node.id);
          if (!box) return;
          var metric = metrics.get(node.id);
          box.height = metric.height;
          var g = oldNodeEls.get(node.id) || svgEl('g');
          nodeContent(g, node, box, node.mark);
          nodeLayer.appendChild(g);
          newNodeEls.set(node.id, g);
        });
        nodeEls = newNodeEls;
        if (scroll) scroll.schedule();
      }

      var cleanup = function () {
        if (scroll) scroll.destroy();
      };
      var instance = Core.component(root, model, render, cleanup);
      render({});
      host.appendChild(root);
      scroll = attachScrollRegion(viewport, hint, 'both');
      scroll.schedule();

      instance.getTarget = function (id) {
        if (instance.destroyed || id == null) return null;
        return nodeEls.get(String(id)) || null;
      };
      return instance;
    }
  };
})(window);

/* ---- source: src/viz/objects-compare.js ---- */
/*! NoteViz objects D01-D06 — D06 CompareView.
 *  Classic script; load after src/viz/objects.js (internal shared helpers).
 *  Public entry: NoteViz.CompareView.
 *  No network, no eval, no HTML parsing. */
(function (global) {
  'use strict';

  var NoteViz = global.NoteViz = global.NoteViz || {};
  var shared = global.NoteVizObjectsInternals;
  if (!shared) {
    throw new Error('NoteViz objects 组件需要先加载 src/viz/objects.js（内部共享文件）。');
  }
  var Core = shared.Core;
  var text = shared.text;
  var own = shared.own;
  var isNode = shared.isNode;
  var el = shared.el;
  var setContent = shared.setContent;
  var uniqueId = shared.uniqueId;
  var validateHost = shared.validateHost;
  var emptyLine = shared.emptyLine;

  /* =====================================================================
   * D06 — CompareView
   * ===================================================================== */

  function compareLabels(value) {
    var labels = {
      left: '',
      right: '',
      compare: '对照',
      changed: '变化侧',
      stacked: '窄容器：已改为上下对照'
    };
    if (Array.isArray(value)) {
      if (value.length) labels.left = value[0] == null ? '' : text(value[0]);
      if (value.length > 1) labels.right = value[1] == null ? '' : text(value[1]);
      return labels;
    }
    if (value && typeof value === 'object') {
      if (value.left != null) labels.left = text(value.left);
      if (value.right != null) labels.right = text(value.right);
      if (value.compare != null) labels.compare = text(value.compare);
      if (value.changed != null) labels.changed = text(value.changed);
      else if (value.change != null) labels.changed = text(value.change);
      else if (value.changedSide != null) labels.changed = text(value.changedSide);
      if (value.stacked != null) labels.stacked = text(value.stacked);
      else if (value.stackedHint != null) labels.stacked = text(value.stackedHint);
    }
    return labels;
  }

  function compareSide(value) {
    if (value == null) return null;
    if (value && typeof value === 'object' && !isNode(value)) {
      return {
        title: value.title == null ? '' : text(value.title),
        content: value.content
      };
    }
    return { title: '', content: value };
  }

  function compareContentSpecified(value) {
    if (value == null) return false;
    if (typeof value === 'object' && !isNode(value)) return own(value, 'content');
    return true;
  }

  function compareFocusSides(value, hasLeft, hasRight) {
    var sides = new Set();
    function add(side) {
      var normalized = side == null ? '' : String(side).toLowerCase();
      if (normalized === 'both') {
        if (hasLeft) sides.add('left');
        if (hasRight) sides.add('right');
      } else if ((normalized === 'left' || normalized === 'right') &&
        (normalized === 'left' ? hasLeft : hasRight)) {
        sides.add(normalized);
      }
    }
    if (value === true) {
      if (hasRight) sides.add('right');
      else if (hasLeft) sides.add('left');
    } else if (value && typeof value === 'object') {
      if (Array.isArray(value)) value.forEach(add);
      else if (Array.isArray(value.sides)) value.sides.forEach(add);
      else if (value.side != null) add(text(value.side));
    } else if (typeof value === 'string') {
      add(value.toLowerCase());
    }
    return sides;
  }

  NoteViz.CompareView = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var STACK_THRESHOLD = 560;
      var root = el('div', 'nviz-compare');
      var grid = el('div', 'nviz-compare__grid');
      var join = el('div', 'nviz-compare__join');
      var joinLabel = el('span', 'nviz-compare__join-label', '对照');
      var empty = emptyLine('暂无可对照内容。');
      var adaptive = el('p', 'nviz-compare__adaptive');
      var firstRender = true;
      var currentSides = { left: false, right: false };
      var resizeStop = null;
      var alive = true;

      join.setAttribute('aria-hidden', 'true');
      join.appendChild(joinLabel);
      adaptive.hidden = true;
      empty.hidden = true;
      root.setAttribute('role', 'group');

      function createPane(side) {
        var section = el('section', 'nviz-compare__pane');
        var header = el('header', 'nviz-compare__header');
        var titleWrap = el('div', 'nviz-compare__titlewrap');
        var eyebrow = el('span', 'nviz-compare__eyebrow');
        var title = el('h3', 'nviz-compare__title');
        var badge = el('span', 'nviz-compare__changed');
        title.id = uniqueId('nviz-compare-' + side + '-title');
        eyebrow.id = uniqueId('nviz-compare-' + side + '-eyebrow');
        titleWrap.append(eyebrow, title);
        header.append(titleWrap, badge);
        var body = el('div', 'nviz-compare__body');
        section.append(header, body);
        section.setAttribute('data-side', side);
        section.setAttribute('aria-labelledby', title.id);
        return {
          el: section,
          header: header,
          eyebrow: eyebrow,
          title: title,
          badge: badge,
          body: body
        };
      }

      var panes = { left: createPane('left'), right: createPane('right') };
      grid.append(panes.left.el, join, panes.right.el);
      panes.left.el.hidden = true;
      panes.right.el.hidden = true;
      root.append(grid, adaptive, empty);

      var model = Object.assign({
        left: null,
        right: null,
        mode: 'side-by-side',
        labels: null,
        focusChanged: false
      }, options || {});

      function render(patch) {
        var labels = compareLabels(model.labels);
        var left = compareSide(model.left);
        var right = compareSide(model.right);
        var leftPresent = left != null;
        var rightPresent = right != null;
        var both = leftPresent && rightPresent;
        var mode = model.mode === 'stacked' ? 'stacked' : 'side-by-side';
        var emphasized = compareFocusSides(model.focusChanged, leftPresent, rightPresent);

        grid.hidden = !leftPresent && !rightPresent;
        empty.hidden = leftPresent || rightPresent;
        root.setAttribute('data-mode', mode);
        root.setAttribute('aria-label', labels.compare + '：' +
          (leftPresent ? (left.title || labels.left || '左侧') : '无') + ' 对 ' +
          (rightPresent ? (right.title || labels.right || '右侧') : '无'));

        function updatePane(side, data, updateContent) {
          var pane = panes[side];
          var present = data != null;
          var sideLabel = labels[side] || '';
          var titleText = present && data.title ? text(data.title) : '';
          if (!present) {
            pane.el.hidden = true;
            pane.el.removeAttribute('data-focus-changed');
            if (currentSides[side]) {
              setContent(pane.body, '');
              pane.body.removeAttribute('data-content');
            }
            return;
          }
          var visibleTitle = titleText || sideLabel || (side === 'left' ? '左侧' : '右侧');
          pane.el.hidden = false;
          pane.el.setAttribute('data-focus-changed', emphasized.has(side) ? 'true' : 'false');
          pane.el.setAttribute('data-side', side);
          pane.title.textContent = visibleTitle;
          pane.eyebrow.textContent = sideLabel && visibleTitle !== sideLabel ? sideLabel : '';
          pane.eyebrow.hidden = !(sideLabel && visibleTitle !== sideLabel);
          pane.badge.textContent = emphasized.has(side) ? labels.changed : '';
          pane.badge.hidden = !emphasized.has(side);
          if (updateContent) {
            var contentValue = data.content;
            var isNodeContent = isNode(contentValue) || Array.isArray(contentValue);
            if (isNodeContent) pane.body.removeAttribute('data-content');
            else pane.body.setAttribute('data-content', 'text');
            setContent(pane.body, contentValue);
          }
        }

        updatePane('left', left, firstRender || (leftPresent && own(patch, 'left') && compareContentSpecified(model.left)));
        updatePane('right', right, firstRender || (rightPresent && own(patch, 'right') && compareContentSpecified(model.right)));
        currentSides = { left: leftPresent, right: rightPresent };
        firstRender = false;

        join.hidden = !both;
        joinLabel.textContent = labels.compare;
        join.setAttribute('data-layout-label', labels.compare);
        applyLayout();
      }

      function applyLayout() {
        if (!alive) return;
        var both = currentSides.left && currentSides.right;
        var labels = compareLabels(model.labels);
        var requested = model.mode === 'stacked' ? 'stacked' : 'side-by-side';
        var layout = 'single';
        var autoStacked = false;
        if (both) {
          if (requested === 'stacked') {
            layout = 'stacked';
          } else {
            var width = root.getBoundingClientRect().width;
            if (width > 0 && width < STACK_THRESHOLD) {
              layout = 'stacked';
              autoStacked = true;
            } else {
              layout = 'side-by-side';
            }
          }
        }
        root.setAttribute('data-layout', layout);
        root.setAttribute('data-auto-stacked', autoStacked ? 'true' : 'false');
        adaptive.hidden = !autoStacked;
        adaptive.textContent = labels.stacked;
      }

      var cleanup = function () {
        alive = false;
        if (resizeStop) resizeStop();
      };
      var instance = Core.component(root, model, render, cleanup);
      render({});
      host.appendChild(root);
      resizeStop = Core.onResize(root, function () {
        applyLayout();
      });
      applyLayout();

      instance.getTarget = function (side) {
        if (instance.destroyed || (side !== 'left' && side !== 'right')) return null;
        if (!currentSides[side]) return null;
        return panes[side].el;
      };
      return instance;
    }
  };
})(window);
