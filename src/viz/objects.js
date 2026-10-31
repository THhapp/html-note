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
