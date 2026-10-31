/*! note-library module: core
 * dependencies: none
 * type: JavaScript
 * generated-by: scripts/build.mjs; do-not-edit.
 */

/* ---- source: src/core/core.js ---- */
/* NoteCore — shared DOM, lifecycle, geometry and content helpers.
   Scope: NoteCore only. Depends on: nothing (load first).
   No network, no framework, no runtime build step. */
(function (global) {
  'use strict';

  var NoteCore = global.NoteCore = global.NoteCore || {};
  var hasOwn = Object.prototype.hasOwnProperty;
  var uidCount = 0;

  function own(object, key) {
    return object != null && hasOwn.call(Object(object), key);
  }

  function text(value) {
    return value == null ? '' : String(value);
  }

  function isNode(value) {
    return !!value && (value.nodeType === 1 || value.nodeType === 3 || value.nodeType === 11);
  }

  function el(tag, className, content) {
    var node = document.createElement(tag);
    if (className != null && String(className) !== '') node.setAttribute('class', String(className));
    if (content != null) node.textContent = String(content);
    return node;
  }

  function contentNode(value) {
    if (isNode(value)) return value;
    if (value == null) return null;
    return document.createTextNode(String(value));
  }

  function setContent(target, value) {
    if (!target || typeof target.replaceChildren !== 'function') {
      throw new TypeError('NoteCore.setContent 需要一个元素或 DocumentFragment。');
    }
    if (value == null) {
      target.replaceChildren();
      return target;
    }
    if (Array.isArray(value)) {
      var nodes = [];
      value.forEach(function (item) {
        var node = contentNode(item);
        if (node) nodes.push(node);
      });
      target.replaceChildren.apply(target, nodes);
      return target;
    }
    if (isNode(value)) {
      target.replaceChildren(value);
      return target;
    }
    target.textContent = String(value);
    return target;
  }

  function append(parent, items) {
    if (!parent || typeof parent.appendChild !== 'function') {
      throw new TypeError('NoteCore.append 需要一个可追加的父节点。');
    }
    for (var i = 1; i < arguments.length; i += 1) {
      var item = arguments[i];
      if (item == null) continue;
      parent.appendChild(contentNode(item));
    }
    return parent;
  }

  function clear(node) {
    if (!node) return node;
    if (typeof node.replaceChildren === 'function') node.replaceChildren();
    else if (typeof node.textContent === 'string') node.textContent = '';
    return node;
  }

  function uid(prefix) {
    var stem = prefix == null || String(prefix) === '' ? 'hnv' : String(prefix);
    var id;
    do {
      uidCount += 1;
      id = stem + '-' + uidCount;
    } while (document.getElementById(id));
    return id;
  }

  function escapeHtml(value) {
    var entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return text(value).replace(/[&<>"']/g, function (character) {
      return entities[character];
    });
  }

  function component(root, state, render, cleanup) {
    if (!root || root.nodeType !== 1) {
      throw new TypeError('NoteCore.component 需要一个元素作为 root。');
    }
    if (typeof render !== 'function') {
      throw new TypeError('NoteCore.component 需要一个 render 函数。');
    }
    var model = state && typeof state === 'object' ? state : {};
    var destroyed = false;
    var instance = { el: root };

    Object.defineProperty(instance, 'destroyed', {
      enumerable: true,
      get: function () { return destroyed; }
    });

    instance.update = function (patch) {
      if (destroyed || !patch || typeof patch !== 'object') return;
      Object.keys(patch).forEach(function (key) {
        if (own(patch, key)) model[key] = patch[key];
      });
      render(patch);
    };

    instance.destroy = function () {
      if (destroyed) return;
      destroyed = true;
      try {
        if (typeof cleanup === 'function') cleanup();
      } finally {
        root.remove();
      }
    };

    return instance;
  }

  function listeners(target) {
    if (!target || typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') {
      throw new TypeError('NoteCore.listeners 需要一个 Element、Window 或 Document。');
    }
    var records = [];
    var bag = {
      on: function (type, handler, options) {
        if (typeof handler !== 'function') return bag;
        target.addEventListener(type, handler, options);
        records.push({ type: type, handler: handler, options: options });
        return bag;
      },
      off: function (type, handler) {
        for (var i = records.length - 1; i >= 0; i -= 1) {
          var record = records[i];
          if (record.type === type && record.handler === handler) {
            target.removeEventListener(record.type, record.handler, record.options);
            records.splice(i, 1);
          }
        }
        return bag;
      },
      clear: function () {
        for (var i = records.length - 1; i >= 0; i -= 1) {
          var record = records[i];
          target.removeEventListener(record.type, record.handler, record.options);
        }
        records.length = 0;
        return bag;
      }
    };
    return bag;
  }

  function rect(element) {
    if (!element || typeof element.getBoundingClientRect !== 'function') return null;
    var source = element.getBoundingClientRect();
    return {
      x: source.x == null ? source.left : source.x,
      y: source.y == null ? source.top : source.y,
      width: source.width,
      height: source.height,
      top: source.top,
      right: source.right,
      bottom: source.bottom,
      left: source.left
    };
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(Number(value), Number(min)), Number(max));
  }

  function onResize(element, handler) {
    if (typeof handler !== 'function') return function () {};
    var disconnected = false;
    var observer = null;
    var usesWindow = false;

    function stop() {
      if (disconnected) return;
      disconnected = true;
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (usesWindow) global.removeEventListener('resize', windowHandler);
    }

    function windowHandler() {
      if (!disconnected) handler();
    }

    if (element && typeof global.ResizeObserver === 'function') {
      try {
        observer = new global.ResizeObserver(function () {
          if (!disconnected) handler();
        });
        observer.observe(element);
      } catch (error) {
        if (observer) observer.disconnect();
        observer = null;
      }
    }
    if (!observer) {
      usesWindow = true;
      global.addEventListener('resize', windowHandler);
    }
    return stop;
  }

  function prefersReduced() {
    try {
      return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (error) {
      return false;
    }
  }

  function scrollIntoViewIfNeeded(element, container, options) {
    if (!element || typeof element.getBoundingClientRect !== 'function') return;
    var settings = options && typeof options === 'object' ? options : {};
    var block = settings.block || 'nearest';
    var inline = settings.inline || 'nearest';
    var behavior = settings.behavior || 'auto';
    if (prefersReduced()) behavior = 'auto';
    if (['nearest', 'start', 'center', 'end'].indexOf(block) < 0) block = 'nearest';
    if (['nearest', 'start', 'center', 'end'].indexOf(inline) < 0) inline = 'nearest';

    var target = element.getBoundingClientRect();
    var useWindow = !container || container === global || container === document ||
      container === document.documentElement || container === document.body;
    var view;
    if (useWindow) {
      view = {
        top: 0,
        left: 0,
        right: global.innerWidth || document.documentElement.clientWidth,
        bottom: global.innerHeight || document.documentElement.clientHeight
      };
    } else {
      if (typeof container.getBoundingClientRect !== 'function') return;
      var box = container.getBoundingClientRect();
      view = {
        top: box.top + (container.clientTop || 0),
        left: box.left + (container.clientLeft || 0),
        right: box.left + (container.clientLeft || 0) + container.clientWidth,
        bottom: box.top + (container.clientTop || 0) + container.clientHeight
      };
    }
    view.width = view.right - view.left;
    view.height = view.bottom - view.top;

    var deltaX = 0;
    var deltaY = 0;
    if (block === 'start') deltaY = target.top - view.top;
    else if (block === 'end') deltaY = target.bottom - view.bottom;
    else if (block === 'center') deltaY = target.top - (view.top + (view.height - target.height) / 2);
    else if (target.top < view.top) deltaY = target.top - view.top;
    else if (target.bottom > view.bottom) deltaY = target.bottom - view.bottom;

    if (inline === 'start') deltaX = target.left - view.left;
    else if (inline === 'end') deltaX = target.right - view.right;
    else if (inline === 'center') deltaX = target.left - (view.left + (view.width - target.width) / 2);
    else if (target.left < view.left) deltaX = target.left - view.left;
    else if (target.right > view.right) deltaX = target.right - view.right;

    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;

    if (useWindow) {
      try {
        if (typeof global.scrollBy === 'function') {
          global.scrollBy({ left: deltaX, top: deltaY, behavior: behavior });
        } else {
          global.scrollTo(global.pageXOffset + deltaX, global.pageYOffset + deltaY);
        }
      } catch (error) {
        global.scrollTo(global.pageXOffset + deltaX, global.pageYOffset + deltaY);
      }
      return;
    }

    var nextLeft = container.scrollLeft + deltaX;
    var nextTop = container.scrollTop + deltaY;
    try {
      if (behavior !== 'auto' && typeof container.scrollTo === 'function') {
        container.scrollTo({ left: nextLeft, top: nextTop, behavior: behavior });
      } else {
        container.scrollLeft = nextLeft;
        container.scrollTop = nextTop;
      }
    } catch (error) {
      container.scrollLeft = nextLeft;
      container.scrollTop = nextTop;
    }
  }

  function copy(value) {
    var valueText = text(value);

    function executeFallback(resolve) {
      var textarea = null;
      var previous = document.activeElement;
      var ok = false;
      try {
        textarea = document.createElement('textarea');
        textarea.value = valueText;
        textarea.setAttribute('readonly', '');
        textarea.setAttribute('aria-hidden', 'true');
        textarea.setAttribute('tabindex', '-1');
        textarea.style.position = 'fixed';
        textarea.style.top = '0';
        textarea.style.left = '-9999px';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        (document.body || document.documentElement).appendChild(textarea);
        textarea.focus();
        textarea.select();
        try { textarea.setSelectionRange(0, valueText.length); } catch (error) {}
        ok = typeof document.execCommand === 'function' && document.execCommand('copy');
      } catch (error) {
        ok = false;
      } finally {
        if (textarea && textarea.parentNode) textarea.parentNode.removeChild(textarea);
        if (previous && previous !== document.body && previous.isConnected &&
            typeof previous.focus === 'function') {
          try { previous.focus({ preventScroll: true }); } catch (error) {
            try { previous.focus(); } catch (ignored) {}
          }
        }
      }
      resolve({ ok: !!ok, method: ok ? 'exec' : 'manual' });
    }

    return new Promise(function (resolve) {
      var clipboard = global.navigator && global.navigator.clipboard;
      if (!clipboard || typeof clipboard.writeText !== 'function') {
        executeFallback(resolve);
        return;
      }
      var result;
      try {
        result = clipboard.writeText(valueText);
      } catch (error) {
        executeFallback(resolve);
        return;
      }
      Promise.resolve(result).then(function () {
        resolve({ ok: true, method: 'clipboard' });
      }, function () {
        executeFallback(resolve);
      });
    });
  }

  function assign(target, input) {
    if (target == null) target = {};
    if (input == null) return target;
    return Object.assign(target, input);
  }

  function validateHost(host) {
    if (!host || (host.nodeType !== 1 && host.nodeType !== 11)) {
      throw new TypeError('NoteUI.mount 需要一个元素或 DocumentFragment 容器。');
    }
    return host;
  }

  function focusables(container) {
    if (!container || typeof container.querySelectorAll !== 'function') return [];
    var selector = [
      'a[href]',
      'area[href]',
      'button',
      'input',
      'select',
      'textarea',
      'summary',
      'iframe',
      'object',
      'embed',
      'audio[controls]',
      'video[controls]',
      '[contenteditable]:not([contenteditable="false"])',
      '[tabindex]'
    ].join(',');
    var found;
    try {
      found = container.querySelectorAll(selector);
    } catch (error) {
      return [];
    }
    return Array.prototype.filter.call(found, function (node) {
      if (!node || node.disabled || node.getAttribute('hidden') != null) return false;
      if (node.getAttribute('aria-hidden') === 'true') return false;
      if (node.type === 'hidden') return false;
      var tabIndexAttribute = node.getAttribute('tabindex');
      if (tabIndexAttribute != null && Number(tabIndexAttribute) < 0) return false;
      try {
        if (node.matches(':disabled')) return false;
      } catch (error) {}
      var current = node;
      while (current && current.nodeType === 1) {
        if (current.hasAttribute('hidden') || current.hasAttribute('inert') ||
            current.getAttribute('aria-hidden') === 'true') return false;
        try {
          var style = global.getComputedStyle(current);
          if (style && (style.display === 'none' || style.visibility === 'hidden' ||
              style.visibility === 'collapse' || style.contentVisibility === 'hidden')) return false;
        } catch (error) {}
        current = current.parentElement;
      }
      return true;
    });
  }

  NoteCore.own = own;
  NoteCore.text = text;
  NoteCore.el = el;
  NoteCore.isNode = isNode;
  NoteCore.setContent = setContent;
  NoteCore.append = append;
  NoteCore.clear = clear;
  NoteCore.uid = uid;
  NoteCore.escapeHtml = escapeHtml;
  NoteCore.component = component;
  NoteCore.listeners = listeners;
  NoteCore.rect = rect;
  NoteCore.clamp = clamp;
  NoteCore.onResize = onResize;
  NoteCore.scrollIntoViewIfNeeded = scrollIntoViewIfNeeded;
  NoteCore.copy = copy;
  NoteCore.assign = assign;
  NoteCore.validateHost = validateHost;
  NoteCore.focusables = focusables;
})(window);

/* ---- source: src/core/icons-data.js ---- */
/* Generated by scripts/gen-icons.mjs from vendor/lucide/icons/*.svg. Do not edit. */
/*! Lucide static icons v1.62.0, ISC license; see vendor/lucide/LICENSE. */
/* Pure data; runtime SVG construction is in icons.js. */
(function (global) {
  'use strict';
  var NoteCore = global.NoteCore = global.NoteCore || {};
  NoteCore.iconData = {
    "alert-circle": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "circle",
          "attrs": {
            "cx": "12",
            "cy": "12",
            "r": "10"
          }
        },
        {
          "tag": "line",
          "attrs": {
            "x1": "12",
            "x2": "12",
            "y1": "8",
            "y2": "12"
          }
        },
        {
          "tag": "line",
          "attrs": {
            "x1": "12",
            "x2": "12.01",
            "y1": "16",
            "y2": "16"
          }
        }
      ]
    },
    "alert-triangle": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M12 9v4"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M12 17h.01"
          }
        }
      ]
    },
    "arrow-down": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M12 5v14"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "m19 12-7 7-7-7"
          }
        }
      ]
    },
    "arrow-left": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "m12 19-7-7 7-7"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M19 12H5"
          }
        }
      ]
    },
    "arrow-right": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M5 12h14"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "m12 5 7 7-7 7"
          }
        }
      ]
    },
    "arrow-up": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "m5 12 7-7 7 7"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M12 19V5"
          }
        }
      ]
    },
    "bold": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"
          }
        }
      ]
    },
    "calendar": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M8 2v3"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M16 2v3"
          }
        },
        {
          "tag": "rect",
          "attrs": {
            "height": "18",
            "rx": "2",
            "width": "18",
            "x": "3",
            "y": "3"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M3 9h18"
          }
        }
      ]
    },
    "check": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M20 6 9 17l-5-5"
          }
        }
      ]
    },
    "chevron-down": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "m6 9 6 6 6-6"
          }
        }
      ]
    },
    "chevron-left": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "m15 18-6-6 6-6"
          }
        }
      ]
    },
    "chevron-right": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "m9 18 6-6-6-6"
          }
        }
      ]
    },
    "chevron-up": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "m18 15-6-6-6 6"
          }
        }
      ]
    },
    "circle-alert": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "circle",
          "attrs": {
            "cx": "12",
            "cy": "12",
            "r": "10"
          }
        },
        {
          "tag": "line",
          "attrs": {
            "x1": "12",
            "x2": "12",
            "y1": "8",
            "y2": "12"
          }
        },
        {
          "tag": "line",
          "attrs": {
            "x1": "12",
            "x2": "12.01",
            "y1": "16",
            "y2": "16"
          }
        }
      ]
    },
    "circle-check": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "circle",
          "attrs": {
            "cx": "12",
            "cy": "12",
            "r": "10"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "m16 9-5.5 5.5L8 12"
          }
        }
      ]
    },
    "circle-x": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "circle",
          "attrs": {
            "cx": "12",
            "cy": "12",
            "r": "10"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "m15 9-6 6"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "m9 9 6 6"
          }
        }
      ]
    },
    "clock": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "circle",
          "attrs": {
            "cx": "12",
            "cy": "12",
            "r": "10"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M12 6v6l4 2"
          }
        }
      ]
    },
    "code": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "m16 18 6-6-6-6"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "m8 6-6 6 6 6"
          }
        }
      ]
    },
    "copy": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "rect",
          "attrs": {
            "height": "14",
            "rx": "2",
            "ry": "2",
            "width": "14",
            "x": "8",
            "y": "8"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
          }
        }
      ]
    },
    "dot": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "circle",
          "attrs": {
            "cx": "12",
            "cy": "12",
            "r": "1"
          }
        }
      ]
    },
    "download": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M12 15V3"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "m7 10 5 5 5-5"
          }
        }
      ]
    },
    "ellipsis": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "circle",
          "attrs": {
            "cx": "12",
            "cy": "12",
            "r": "1"
          }
        },
        {
          "tag": "circle",
          "attrs": {
            "cx": "19",
            "cy": "12",
            "r": "1"
          }
        },
        {
          "tag": "circle",
          "attrs": {
            "cx": "5",
            "cy": "12",
            "r": "1"
          }
        }
      ]
    },
    "external-link": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M15 3h6v6"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M10 14 21 3"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
          }
        }
      ]
    },
    "eye": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"
          }
        },
        {
          "tag": "circle",
          "attrs": {
            "cx": "12",
            "cy": "12",
            "r": "3"
          }
        }
      ]
    },
    "eye-off": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M14.084 14.158a3 3 0 0 1-4.242-4.242"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "m2 2 20 20"
          }
        }
      ]
    },
    "file": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M14 2v5a1 1 0 0 0 1 1h5"
          }
        }
      ]
    },
    "filter": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"
          }
        }
      ]
    },
    "folder": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
          }
        }
      ]
    },
    "folder-open": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"
          }
        }
      ]
    },
    "git-branch": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M15 6a9 9 0 0 0-9 9V3"
          }
        },
        {
          "tag": "circle",
          "attrs": {
            "cx": "18",
            "cy": "6",
            "r": "3"
          }
        },
        {
          "tag": "circle",
          "attrs": {
            "cx": "6",
            "cy": "18",
            "r": "3"
          }
        }
      ]
    },
    "grip-vertical": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "circle",
          "attrs": {
            "cx": "9",
            "cy": "12",
            "r": "1"
          }
        },
        {
          "tag": "circle",
          "attrs": {
            "cx": "9",
            "cy": "5",
            "r": "1"
          }
        },
        {
          "tag": "circle",
          "attrs": {
            "cx": "9",
            "cy": "19",
            "r": "1"
          }
        },
        {
          "tag": "circle",
          "attrs": {
            "cx": "15",
            "cy": "12",
            "r": "1"
          }
        },
        {
          "tag": "circle",
          "attrs": {
            "cx": "15",
            "cy": "5",
            "r": "1"
          }
        },
        {
          "tag": "circle",
          "attrs": {
            "cx": "15",
            "cy": "19",
            "r": "1"
          }
        }
      ]
    },
    "image": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "rect",
          "attrs": {
            "height": "18",
            "rx": "2",
            "ry": "2",
            "width": "18",
            "x": "3",
            "y": "3"
          }
        },
        {
          "tag": "circle",
          "attrs": {
            "cx": "9",
            "cy": "9",
            "r": "2"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"
          }
        }
      ]
    },
    "info": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "circle",
          "attrs": {
            "cx": "12",
            "cy": "12",
            "r": "10"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M12 16v-4"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M12 8h.01"
          }
        }
      ]
    },
    "italic": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "line",
          "attrs": {
            "x1": "19",
            "x2": "10",
            "y1": "4",
            "y2": "4"
          }
        },
        {
          "tag": "line",
          "attrs": {
            "x1": "14",
            "x2": "5",
            "y1": "20",
            "y2": "20"
          }
        },
        {
          "tag": "line",
          "attrs": {
            "x1": "15",
            "x2": "9",
            "y1": "4",
            "y2": "20"
          }
        }
      ]
    },
    "layers": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"
          }
        }
      ]
    },
    "link": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
          }
        }
      ]
    },
    "list": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M3 5h.01"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M3 12h.01"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M3 19h.01"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M8 5h13"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M8 12h13"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M8 19h13"
          }
        }
      ]
    },
    "loader-circle": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M21 12a9 9 0 1 1-6.219-8.56"
          }
        }
      ]
    },
    "maximize-2": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M15 3h6v6"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "m21 3-7 7"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "m3 21 7-7"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M9 21H3v-6"
          }
        }
      ]
    },
    "menu": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M4 5h16"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M4 12h16"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M4 19h16"
          }
        }
      ]
    },
    "merge": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "m8 6 4-4 4 4"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M12 2v10.3a4 4 0 0 1-1.172 2.872L4 22"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "m20 22-5-5"
          }
        }
      ]
    },
    "minimize-2": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "m14 10 7-7"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M20 10h-6V4"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "m3 21 7-7"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M4 14h6v6"
          }
        }
      ]
    },
    "minus": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M5 12h14"
          }
        }
      ]
    },
    "more-horizontal": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "circle",
          "attrs": {
            "cx": "12",
            "cy": "12",
            "r": "1"
          }
        },
        {
          "tag": "circle",
          "attrs": {
            "cx": "19",
            "cy": "12",
            "r": "1"
          }
        },
        {
          "tag": "circle",
          "attrs": {
            "cx": "5",
            "cy": "12",
            "r": "1"
          }
        }
      ]
    },
    "move": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M12 2v20"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "m15 19-3 3-3-3"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "m19 9 3 3-3 3"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M2 12h20"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "m5 9-3 3 3 3"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "m9 5 3-3 3 3"
          }
        }
      ]
    },
    "panel-bottom": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "rect",
          "attrs": {
            "height": "18",
            "rx": "2",
            "width": "18",
            "x": "3",
            "y": "3"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M3 15h18"
          }
        }
      ]
    },
    "panel-left": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "rect",
          "attrs": {
            "height": "18",
            "rx": "2",
            "width": "18",
            "x": "3",
            "y": "3"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M9 3v18"
          }
        }
      ]
    },
    "panel-right": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "rect",
          "attrs": {
            "height": "18",
            "rx": "2",
            "width": "18",
            "x": "3",
            "y": "3"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M15 3v18"
          }
        }
      ]
    },
    "panel-top": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "rect",
          "attrs": {
            "height": "18",
            "rx": "2",
            "width": "18",
            "x": "3",
            "y": "3"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M3 9h18"
          }
        }
      ]
    },
    "pause": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "rect",
          "attrs": {
            "height": "18",
            "rx": "1",
            "width": "5",
            "x": "14",
            "y": "3"
          }
        },
        {
          "tag": "rect",
          "attrs": {
            "height": "18",
            "rx": "1",
            "width": "5",
            "x": "5",
            "y": "3"
          }
        }
      ]
    },
    "play": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"
          }
        }
      ]
    },
    "plus": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M5 12h14"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M12 5v14"
          }
        }
      ]
    },
    "redo-2": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "m15 14 5-5-5-5"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"
          }
        }
      ]
    },
    "repeat": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "m17 2 4 4-4 4"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M3 11v-1a4 4 0 0 1 4-4h14"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "m7 22-4-4 4-4"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M21 13v1a4 4 0 0 1-4 4H3"
          }
        }
      ]
    },
    "rotate-ccw": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M3 3v5h5"
          }
        }
      ]
    },
    "search": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "m21 21-4.34-4.34"
          }
        },
        {
          "tag": "circle",
          "attrs": {
            "cx": "11",
            "cy": "11",
            "r": "8"
          }
        }
      ]
    },
    "settings": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"
          }
        },
        {
          "tag": "circle",
          "attrs": {
            "cx": "12",
            "cy": "12",
            "r": "3"
          }
        }
      ]
    },
    "shuffle": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "m18 14 4 4-4 4"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "m18 2 4 4-4 4"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M2 6h1.972a4 4 0 0 1 3.6 2.2"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"
          }
        }
      ]
    },
    "skip-forward": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M21 4v16"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z"
          }
        }
      ]
    },
    "split": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M16 3h5v5"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M8 3H3v5"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "m15 9 6-6"
          }
        }
      ]
    },
    "star": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"
          }
        }
      ]
    },
    "step-back": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M13.971 4.285A2 2 0 0 1 17 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M21 20V4"
          }
        }
      ]
    },
    "step-forward": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M10.029 4.285A2 2 0 0 0 7 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M3 4v16"
          }
        }
      ]
    },
    "table": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M12 3v18"
          }
        },
        {
          "tag": "rect",
          "attrs": {
            "height": "18",
            "rx": "2",
            "width": "18",
            "x": "3",
            "y": "3"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M3 9h18"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M3 15h18"
          }
        }
      ]
    },
    "trash-2": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M10 11v6"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M14 11v6"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M3 6h18"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
          }
        }
      ]
    },
    "undo-2": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M9 14 4 9l5-5"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"
          }
        }
      ]
    },
    "upload": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M12 3v12"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "m17 8-5-5-5 5"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
          }
        }
      ]
    },
    "x": {
      "viewBox": "0 0 24 24",
      "strokeWidth": "2",
      "children": [
        {
          "tag": "path",
          "attrs": {
            "d": "M18 6 6 18"
          }
        },
        {
          "tag": "path",
          "attrs": {
            "d": "m6 6 12 12"
          }
        }
      ]
    }
  };
})(window);

/* ---- source: src/core/icons.js ---- */
/* NoteCore icons — builds local SVG elements from generated icon data.
   Scope: NoteCore.icons and NoteCore.icon. Depends on: core.js, icons-data.js.
   No external requests, no HTML string injection. */
(function (global) {
  'use strict';

  var NoteCore = global.NoteCore = global.NoteCore || {};
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var data = NoteCore.iconData && typeof NoteCore.iconData === 'object' ? NoteCore.iconData : {};
  var hasOwn = Object.prototype.hasOwnProperty;
  var names = Object.keys(data).sort();
  var ALLOWED_TAGS = ['circle', 'ellipse', 'line', 'path', 'polygon', 'polyline', 'rect'];
  var ALLOWED_ATTRIBUTES = {
    cx: true, cy: true, d: true, height: true, points: true, r: true,
    rx: true, ry: true, width: true, x: true, x1: true, x2: true,
    y: true, y1: true, y2: true
  };

  function has(name) {
    return typeof name === 'string' && hasOwn.call(data, name) &&
      data[name] && typeof data[name] === 'object';
  }

  function appendShape(parent, descriptor) {
    if (!descriptor || ALLOWED_TAGS.indexOf(descriptor.tag) < 0) return;
    var child = document.createElementNS(SVG_NS, descriptor.tag);
    var attributes = descriptor.attrs || {};
    Object.keys(attributes).forEach(function (key) {
      if (!ALLOWED_ATTRIBUTES[key] || typeof attributes[key] !== 'string') return;
      child.setAttribute(key, attributes[key]);
    });
    parent.appendChild(child);
  }

  function sizeValue(value, fallback) {
    var number = Number(value);
    return isFinite(number) && number > 0 ? number : fallback;
  }

  function build(name, size, label, className) {
    if (!has(name)) return null;
    var source = data[name];
    var dimension = sizeValue(size, 16);
    var svg = document.createElementNS(SVG_NS, 'svg');
    var classes = 'hnv-icon';
    if (className != null && String(className) !== '') classes += ' ' + String(className);
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('class', classes);
    svg.setAttribute('viewBox', source.viewBox || '0 0 24 24');
    svg.setAttribute('width', String(dimension));
    svg.setAttribute('height', String(dimension));
    svg.style.width = dimension + 'px';
    svg.style.height = dimension + 'px';
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', source.strokeWidth || '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    if (label != null && String(label) !== '') {
      svg.removeAttribute('aria-hidden');
      svg.removeAttribute('focusable');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', String(label));
    }
    (Array.isArray(source.children) ? source.children : []).forEach(function (descriptor) {
      appendShape(svg, descriptor);
    });
    return svg;
  }

  NoteCore.icons = {
    names: function () {
      return names.slice();
    },
    has: has,
    get: function (name) {
      return build(name, 24, null, '');
    }
  };

  NoteCore.icon = function (name, options) {
    var settings = options && typeof options === 'object' ? options : {};
    return build(name, settings.size == null ? 16 : settings.size,
      settings.label == null ? null : settings.label, settings.className);
  };
})(window);

/* ---- source: src/core/motion.js ---- */
/* NoteCore motion — Web Animations orchestration, reduced-motion handling and FLIP.
   Scope: NoteCore.motion. Depends on: tokens.css, core.js.
   Durations default to host-overridable tokens; callers may pass explicit values. */
(function (global) {
  'use strict';

  var NoteCore = global.NoteCore = global.NoteCore || {};
  var active = new WeakMap();
  var mediaQuery = null;
  var mediaAttached = false;
  var changeListeners = [];

  function getMediaQuery() {
    if (mediaQuery) return mediaQuery;
    if (typeof global.matchMedia !== 'function') return null;
    try {
      mediaQuery = global.matchMedia('(prefers-reduced-motion: reduce)');
    } catch (error) {
      mediaQuery = null;
    }
    return mediaQuery;
  }

  function reduced() {
    var query = getMediaQuery();
    return !!(query && query.matches);
  }

  function notifyMotionChange(event) {
    var value = reduced();
    changeListeners.slice().forEach(function (handler) {
      handler(value, event);
    });
  }

  function attachMedia() {
    var query = getMediaQuery();
    if (!query || mediaAttached) return;
    if (typeof query.addEventListener === 'function') query.addEventListener('change', notifyMotionChange);
    else if (typeof query.addListener === 'function') query.addListener(notifyMotionChange);
    mediaAttached = true;
  }

  function detachMedia() {
    var query = getMediaQuery();
    if (!query || !mediaAttached || changeListeners.length) return;
    if (typeof query.removeEventListener === 'function') query.removeEventListener('change', notifyMotionChange);
    else if (typeof query.removeListener === 'function') query.removeListener(notifyMotionChange);
    mediaAttached = false;
  }

  function onChange(handler) {
    if (typeof handler !== 'function') return function () {};
    changeListeners.push(handler);
    attachMedia();
    var activeSubscription = true;
    return function unsubscribe() {
      if (!activeSubscription) return;
      activeSubscription = false;
      var index = changeListeners.indexOf(handler);
      if (index >= 0) changeListeners.splice(index, 1);
      detachMedia();
    };
  }

  function readStyleValue(name) {
    var nodes = [];
    if (document.body) nodes.push(document.body);
    if (document.documentElement) nodes.push(document.documentElement);
    for (var i = 0; i < nodes.length; i += 1) {
      try {
        var value = global.getComputedStyle(nodes[i]).getPropertyValue(name);
        if (value && String(value).trim() !== '') return String(value).trim();
      } catch (error) {}
    }
    return '';
  }

  function readDuration(name, fallback) {
    var value = readStyleValue(name);
    if (!value) return fallback;
    if (/ms$/i.test(value)) {
      var milliseconds = parseFloat(value);
      return isFinite(milliseconds) ? milliseconds : fallback;
    }
    if (/s$/i.test(value)) {
      var seconds = parseFloat(value);
      return isFinite(seconds) ? seconds * 1000 : fallback;
    }
    var number = parseFloat(value);
    return isFinite(number) ? number : fallback;
  }

  function uiDuration() {
    return readDuration('--hnv-motion-ui', 160);
  }

  function explainDuration() {
    return readDuration('--hnv-motion-explain', 460);
  }

  function uiEasing() {
    return readStyleValue('--hnv-motion-ease-ui') || 'ease';
  }

  function reducedController(element) {
    return {
      finished: Promise.resolve(false),
      cancel: function () {},
      el: element
    };
  }

  function applyTerminal(element, keyframes) {
    if (!element || !element.style || keyframes == null) return;
    var finalFrame;
    if (Array.isArray(keyframes)) {
      finalFrame = keyframes.length ? keyframes[keyframes.length - 1] : null;
    } else if (typeof keyframes === 'object') {
      finalFrame = keyframes;
    }
    if (!finalFrame || typeof finalFrame !== 'object') return;
    Object.keys(finalFrame).forEach(function (key) {
      if (key === 'offset' || key === 'easing' || key === 'computedOffset' || key === 'composite') return;
      var value = finalFrame[key];
      if (Array.isArray(value)) value = value.length ? value[value.length - 1] : null;
      if (value == null) return;
      try {
        if (key.slice(0, 2) === '--' || key.indexOf('-') >= 0) {
          element.style.setProperty(key, String(value));
        } else {
          element.style[key] = value;
        }
      } catch (error) {}
    });
  }

  function cancelCurrent(element) {
    var current = active.get(element);
    if (current) {
      current.cancel();
      active.delete(element);
    }
  }

  function timingOptions(settings) {
    var duration = settings.duration == null ? uiDuration() : settings.duration;
    var easing = settings.easing == null ? uiEasing() : settings.easing;
    var delay = settings.delay == null ? 0 : settings.delay;
    var fill = settings.fill == null ? 'both' : settings.fill;
    return {
      duration: duration,
      easing: easing,
      delay: delay,
      fill: fill
    };
  }

  function animateElement(element, keyframes, settings, applyFinal) {
    if (!element || typeof element.animate !== 'function') {
      if (applyFinal) applyTerminal(element, keyframes);
      return reducedController(element);
    }
    var animation;
    try {
      animation = element.animate(keyframes, timingOptions(settings));
    } catch (error) {
      if (applyFinal) applyTerminal(element, keyframes);
      return reducedController(element);
    }
    if (settings.id != null) {
      try { animation.id = String(settings.id); } catch (error) {}
    }

    var settled = false;
    var resolveFinished;
    var finishedPromise = new Promise(function (resolve) {
      resolveFinished = resolve;
    });
    var controller = {
      finished: finishedPromise,
      el: element,
      cancel: function () {
        if (active.get(element) === controller) active.delete(element);
        try {
          if (animation.playState !== 'idle') animation.cancel();
        } catch (error) {}
        settle(false);
      }
    };

    function settle(value) {
      if (settled) return;
      settled = true;
      resolveFinished(value);
    }

    function onFailure() {
      settle(false);
      if (active.get(element) === controller) active.delete(element);
    }

    active.set(element, controller);
    if (animation.finished && typeof animation.finished.then === 'function') {
      animation.finished.then(function () {
        settle(true);
      }, onFailure);
    } else {
      animation.onfinish = function () { settle(true); };
      animation.oncancel = onFailure;
    }
    return controller;
  }

  function play(element, keyframes, options) {
    var settings = options && typeof options === 'object' ? options : {};
    cancelCurrent(element);
    if (reduced()) {
      applyTerminal(element, keyframes);
      return reducedController(element);
    }
    return animateElement(element, keyframes, settings, true);
  }

  function stop(element) {
    cancelCurrent(element);
  }

  function measure(elements) {
    var map = new Map();
    function add(element) {
      if (!element || typeof element.getBoundingClientRect !== 'function') return;
      map.set(element, element.getBoundingClientRect());
    }
    if (!elements) return map;
    if (typeof elements.getBoundingClientRect === 'function') {
      add(elements);
      return map;
    }
    if (typeof elements[Symbol.iterator] === 'function') {
      for (var value of elements) add(value);
      return map;
    }
    if (typeof elements.length === 'number') {
      for (var i = 0; i < elements.length; i += 1) add(elements[i]);
    }
    return map;
  }

  function flip(element, fromRect, options) {
    var settings = options && typeof options === 'object' ? options : {};
    cancelCurrent(element);
    if (reduced() || !element || typeof element.getBoundingClientRect !== 'function') {
      return reducedController(element);
    }
    if (!fromRect) return reducedController(element);
    var target = element.getBoundingClientRect();
    var deltaX = Number(fromRect.left) - target.left;
    var deltaY = Number(fromRect.top) - target.top;
    if (!isFinite(deltaX)) deltaX = 0;
    if (!isFinite(deltaY)) deltaY = 0;
    var scaleX = target.width > 0 && Number(fromRect.width) > 0 ? Number(fromRect.width) / target.width : 1;
    var scaleY = target.height > 0 && Number(fromRect.height) > 0 ? Number(fromRect.height) / target.height : 1;
    if (!isFinite(scaleX)) scaleX = 1;
    if (!isFinite(scaleY)) scaleY = 1;
    var keyframes = [
      {
        transform: 'translate(' + deltaX + 'px, ' + deltaY + 'px) scale(' + scaleX + ', ' + scaleY + ')',
        transformOrigin: '0 0'
      },
      {
        transform: 'translate(0px, 0px) scale(1, 1)',
        transformOrigin: '0 0'
      }
    ];
    return animateElement(element, keyframes, settings, false);
  }

  NoteCore.motion = {
    reduced: reduced,
    onChange: onChange,
    play: play,
    stop: stop,
    measure: measure,
    flip: flip,
    uiDuration: uiDuration,
    explainDuration: explainDuration
  };
})(window);

/* ---- source: src/core/floating.js ---- */
/* NoteCore floating — one stacking context for popovers, tooltips and dialogs.
   Scope: NoteCore.floating. Depends on: core.js, tokens.css, base.css.
   The layer owns positioning, dismiss behaviour, focus trap/restore and scroll lock. */
(function (global) {
  'use strict';

  var NoteCore = global.NoteCore = global.NoteCore || {};
  var stack = [];
  var listening = false;
  var resizeObserver = null;
  var mutationObserver = null;
  var scrollLockCount = 0;
  var scrollLockSnapshot = null;
  var EDGE = 8;
  var SIDES = ['top', 'bottom', 'left', 'right'];
  var OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

  function connected(element) {
    if (!element) return false;
    if (typeof element.isConnected === 'boolean') return element.isConnected;
    return !!(document.documentElement && document.documentElement.contains(element));
  }

  function focusNode(node) {
    if (!node || !connected(node) || typeof node.focus !== 'function') return false;
    try {
      node.focus({ preventScroll: true });
      return document.activeElement === node || node.contains(document.activeElement);
    } catch (error) {
      try {
        node.focus();
        return document.activeElement === node || node.contains(document.activeElement);
      } catch (ignored) {
        return false;
      }
    }
  }

  function viewportBox() {
    var root = document.documentElement;
    return {
      width: (root && root.clientWidth) || global.innerWidth || 0,
      height: global.innerHeight || (root && root.clientHeight) || 0
    };
  }

  function roundPosition(value) {
    return String(Math.round(value * 1000) / 1000);
  }

  function clampAxis(value, min, max) {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
  }

  function parsePlacement(value) {
    var raw = value == null ? 'bottom-start' : String(value);
    if (raw === 'auto') return { auto: true, side: 'bottom', align: 'start' };
    var parts = raw.split('-');
    var side = parts[0];
    var align = parts[1] || 'center';
    if (SIDES.indexOf(side) < 0) {
      side = 'bottom';
      align = 'start';
    }
    if (align !== 'start' && align !== 'end') align = 'center';
    return { auto: false, side: side, align: align };
  }

  function placementName(side, align) {
    return side + (align === 'center' ? '' : '-' + align);
  }

  function anchorAvailable(anchor) {
    if (!anchor || anchor.nodeType !== 1 || !connected(anchor)) return false;
    var rects;
    try { rects = anchor.getClientRects(); } catch (error) { return false; }
    if (!rects || !rects.length) return false;
    var style;
    try { style = global.getComputedStyle(anchor); } catch (error) { style = null; }
    if (style) {
      if (style.display === 'none' || style.display === 'contents') return false;
      if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    }
    return true;
  }

  function anchorRect(anchor) {
    if (!anchorAvailable(anchor)) return null;
    try { return anchor.getBoundingClientRect(); } catch (error) { return null; }
  }

  function baseZIndex() {
    var host = document.body || document.documentElement;
    var raw = '';
    try {
      if (host) raw = global.getComputedStyle(host).getPropertyValue('--hnv-z-float');
    } catch (error) {}
    var value = parseInt(raw, 10);
    return isFinite(value) ? value : 1000;
  }

  function applyStackZ() {
    var base = baseZIndex();
    stack.forEach(function (layer, index) {
      layer.root.style.zIndex = String(base + index);
    });
  }

  function lockScroll() {
    if (scrollLockCount === 0) {
      var body = document.body;
      if (body) {
        var gap = (global.innerWidth || 0) - (document.documentElement.clientWidth || 0);
        var padding = 0;
        try {
          padding = parseFloat(global.getComputedStyle(body).paddingRight) || 0;
        } catch (error) {}
        scrollLockSnapshot = {
          body: body,
          overflow: body.style.overflow,
          paddingRight: body.style.paddingRight
        };
        body.style.overflow = 'hidden';
        if (gap > 0) body.style.paddingRight = (padding + gap) + 'px';
      }
    }
    scrollLockCount += 1;
  }

  function unlockScroll() {
    if (scrollLockCount <= 0) return;
    scrollLockCount -= 1;
    if (scrollLockCount > 0) return;
    if (scrollLockSnapshot) {
      var body = scrollLockSnapshot.body;
      body.style.overflow = scrollLockSnapshot.overflow;
      body.style.paddingRight = scrollLockSnapshot.paddingRight;
      scrollLockSnapshot = null;
    }
  }

  function panelSize(panel) {
    var rect = panel.getBoundingClientRect();
    return {
      width: rect.width || panel.offsetWidth || 0,
      height: rect.height || panel.offsetHeight || 0
    };
  }

  function sideSpace(side, anchor, offset, viewport) {
    if (side === 'top') return anchor.top - offset - EDGE;
    if (side === 'bottom') return viewport.height - EDGE - (anchor.bottom + offset);
    if (side === 'left') return anchor.left - offset - EDGE;
    return viewport.width - EDGE - (anchor.right + offset);
  }

  function neededSpace(side, size) {
    return side === 'top' || side === 'bottom' ? size.height : size.width;
  }

  function chooseSide(side, align, auto, anchor, size, offset, viewport) {
    if (auto) {
      var candidates = ['bottom', 'top', 'right', 'left'];
      var bestSide = candidates[0];
      var bestScore = -Infinity;
      candidates.forEach(function (candidate) {
        var score = sideSpace(candidate, anchor, offset, viewport) - neededSpace(candidate, size);
        if (score > bestScore) {
          bestScore = score;
          bestSide = candidate;
        }
      });
      return { side: bestSide, align: 'start' };
    }
    var available = sideSpace(side, anchor, offset, viewport);
    var opposite = OPPOSITE[side];
    var oppositeAvailable = sideSpace(opposite, anchor, offset, viewport);
    if (available < neededSpace(side, size) && oppositeAvailable > available) {
      return { side: opposite, align: align };
    }
    return { side: side, align: align };
  }

  function desiredPosition(side, align, anchor, size, offset) {
    var left = 0;
    var top = 0;
    if (side === 'top') top = anchor.top - offset - size.height;
    else if (side === 'bottom') top = anchor.bottom + offset;
    else if (side === 'left') left = anchor.left - offset - size.width;
    else if (side === 'right') left = anchor.right + offset;

    if (side === 'top' || side === 'bottom') {
      if (align === 'start') left = anchor.left;
      else if (align === 'end') left = anchor.right - size.width;
      else left = anchor.left + (anchor.width - size.width) / 2;
    } else {
      if (align === 'start') top = anchor.top;
      else if (align === 'end') top = anchor.bottom - size.height;
      else top = anchor.top + (anchor.height - size.height) / 2;
    }
    return { left: left, top: top };
  }

  function positionLayer(layer) {
    if (!layer || !layer._open || layer.destroyed) return;
    var anchor = layer._anchor;
    var anchorBounds = null;
    if (anchor) {
      anchorBounds = anchorRect(anchor);
      if (!anchorBounds) {
        layer.close('anchor-removed');
        return;
      }
    }

    var viewport = viewportBox();
    if (layer._matchAnchorWidth && anchorBounds) {
      var anchorWidth = Math.max(0, anchorBounds.width);
      var widthValue = roundPosition(anchorWidth) + 'px';
      if (layer.el.style.width !== widthValue) layer.el.style.width = widthValue;
    }

    var size = panelSize(layer.el);
    var left;
    var top;
    var actual;
    if (!anchorBounds) {
      left = (viewport.width - size.width) / 2;
      top = (viewport.height - size.height) / 2;
      actual = 'center';
    } else {
      var choice = chooseSide(layer._placement.side, layer._placement.align,
        layer._placement.auto, anchorBounds, size, layer._offset, viewport);
      var position = desiredPosition(choice.side, choice.align, anchorBounds, size, layer._offset);
      left = position.left;
      top = position.top;
      actual = placementName(choice.side, choice.align);
    }

    left = clampAxis(left, EDGE, viewport.width - EDGE - size.width);
    top = clampAxis(top, EDGE, viewport.height - EDGE - size.height);
    layer.root.style.left = roundPosition(left) + 'px';
    layer.root.style.top = roundPosition(top) + 'px';
    layer.root.setAttribute('data-placement', actual);
    layer.el.setAttribute('data-placement', actual);
  }

  function restorePanelTabIndex(layer) {
    if (!layer._tabIndexTouched) return;
    if (layer._originalTabIndex == null) {
      if (layer.el.getAttribute('tabindex') === '-1') layer.el.removeAttribute('tabindex');
    } else {
      layer.el.setAttribute('tabindex', layer._originalTabIndex);
    }
    layer._tabIndexTouched = false;
    layer._originalTabIndex = null;
  }

  function ensurePanelFocusable(layer) {
    if (!layer._tabIndexTouched) {
      layer._originalTabIndex = layer.el.hasAttribute('tabindex') ?
        layer.el.getAttribute('tabindex') : null;
      layer._tabIndexTouched = true;
    }
    layer.el.setAttribute('tabindex', '-1');
  }

  function focusLayer(layer) {
    var items = NoteCore.focusables(layer.el);
    if (items.length) {
      if (focusNode(items[0])) return;
    }
    ensurePanelFocusable(layer);
    focusNode(layer.el);
  }

  function shouldRestoreFocus(layer, activeAtClose, wasTop) {
    if (!layer._returnFocus) return false;
    if (!layer._opener || !connected(layer._opener) || typeof layer._opener.focus !== 'function') return false;
    var activeInside = !!(activeAtClose && layer.el.contains(activeAtClose));
    if (layer._trapFocus) return wasTop || activeInside;
    return activeInside;
  }

  function closeLayer(layer, reason, options) {
    if (!layer || !layer._open) return layer;
    var activeAtClose = document.activeElement;
    var wasTop = stack[stack.length - 1] === layer;
    var restoreAllowed = !options || options.restoreFocus !== false;
    var restore = restoreAllowed && shouldRestoreFocus(layer, activeAtClose, wasTop);

    layer._open = false;
    var index = stack.indexOf(layer);
    if (index >= 0) stack.splice(index, 1);
    if (layer.root.parentNode) layer.root.parentNode.removeChild(layer.root);
    if (layer._locked) {
      layer._locked = false;
      unlockScroll();
    }
    restorePanelTabIndex(layer);
    applyStackZ();
    if (!stack.length) stopListening();
    else unobserveLayer(layer);
    if (restore) focusNode(layer._opener);
    if (typeof layer._onClose === 'function') layer._onClose(reason);
    return layer;
  }

  function handleKeydown(event) {
    var layer = stack[stack.length - 1];
    if (!layer || !layer._open || event.isComposing) return;
    var key = event.key;
    if (key === 'Escape' || key === 'Esc' || event.keyCode === 27) {
      if (!layer._closeOnEsc) return;
      event.preventDefault();
      layer.close('esc');
      return;
    }
    if (key !== 'Tab') return;
    var tabTrap = layer._trapFocus ? layer : null;
    if (!tabTrap) {
      for (var index = stack.length - 2; index >= 0; index -= 1) {
        if (stack[index] && stack[index]._open && stack[index]._trapFocus) {
          tabTrap = stack[index];
          break;
        }
      }
    }
    if (!tabTrap) return;
    constrainTab(event, tabTrap);
  }

  function constrainTab(event, layer) {
    var items = NoteCore.focusables(layer.el);
    var active = document.activeElement;
    if (!items.length) {
      event.preventDefault();
      ensurePanelFocusable(layer);
      focusNode(layer.el);
      return;
    }
    var first = items[0];
    var last = items[items.length - 1];
    var activeIndex = items.indexOf(active);
    var inside = !!(active && layer.el.contains(active));
    if (event.shiftKey) {
      if (!inside || active === layer.el || activeIndex <= 0) {
        event.preventDefault();
        focusNode(last);
      }
    } else if (!inside || active === layer.el || activeIndex < 0 || active === last) {
      event.preventDefault();
      focusNode(first);
    }
  }

  function handlePointerDown(event) {
    var layer = stack[stack.length - 1];
    if (!layer || !layer._open || !layer._closeOnOutside) return;
    var target = event.target;
    if (target && (target === layer.el || layer.el.contains(target))) return;
    layer.close('outside');
  }

  function repositionAll() {
    stack.slice().forEach(function (layer) {
      if (layer._open) positionLayer(layer);
    });
  }

  function handleMutations() {
    if (!stack.length) return;
    stack.slice().forEach(function (layer) {
      if (!layer._open || !layer._anchor) return;
      if (!anchorAvailable(layer._anchor)) layer.close('anchor-removed');
    });
  }

  function handleResize() {
    repositionAll();
  }

  function observeLayer(layer) {
    if (!resizeObserver) return;
    try {
      resizeObserver.observe(layer.el);
      if (layer._anchor) resizeObserver.observe(layer._anchor);
    } catch (error) {}
  }

  function unobserveLayer(layer) {
    if (!resizeObserver || !layer) return;
    try {
      resizeObserver.unobserve(layer.el);
      if (layer._anchor) resizeObserver.unobserve(layer._anchor);
    } catch (error) {}
    /* The observer is shared by the whole stack: re-observe targets that other
       open layers still depend on (observe() is idempotent). */
    stack.forEach(function (other) {
      if (other && other !== layer && other._open) observeLayer(other);
    });
  }

  function startListening(layer) {
    if (listening) {
      observeLayer(layer);
      return;
    }
    listening = true;
    document.addEventListener('keydown', handleKeydown, true);
    document.addEventListener('pointerdown', handlePointerDown, true);
    global.addEventListener('scroll', repositionAll, true);
    global.addEventListener('resize', handleResize);
    if (typeof global.ResizeObserver === 'function') {
      try { resizeObserver = new global.ResizeObserver(repositionAll); } catch (error) { resizeObserver = null; }
    }
    if (typeof global.MutationObserver === 'function' && document.documentElement) {
      try {
        mutationObserver = new global.MutationObserver(handleMutations);
        mutationObserver.observe(document.documentElement, {
          childList: true,
          attributes: true,
          attributeFilter: ['class', 'style', 'hidden', 'open', 'inert', 'aria-hidden'],
          subtree: true
        });
      } catch (error) {
        mutationObserver = null;
      }
    }
    observeLayer(layer);
  }

  function stopListening() {
    if (!listening) return;
    listening = false;
    document.removeEventListener('keydown', handleKeydown, true);
    document.removeEventListener('pointerdown', handlePointerDown, true);
    global.removeEventListener('scroll', repositionAll, true);
    global.removeEventListener('resize', handleResize);
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
  }

  function openLayer(layer) {
    if (!layer || layer.destroyed || layer._open) return layer;
    layer._open = true;
    layer._opener = document.activeElement;
    layer.root.style.visibility = 'hidden';
    (document.body || document.documentElement).appendChild(layer.root);
    stack.push(layer);
    applyStackZ();
    startListening(layer);
    if (layer._lockScroll) {
      layer._locked = true;
      lockScroll();
    }
    positionLayer(layer);
    if (!layer._open) return layer;
    layer.root.style.visibility = '';
    if (layer._trapFocus) focusLayer(layer);
    if (typeof layer._onOpen === 'function') layer._onOpen();
    return layer;
  }

  function closeReason(first, second) {
    var reason = first;
    var options = second;
    if (first && typeof first === 'object') {
      reason = 'api';
      options = first;
    } else if (reason == null) {
      reason = 'api';
    }
    return { reason: String(reason), options: options || {} };
  }

  function create(options) {
    var settings = NoteCore.assign({
      anchor: null,
      content: null,
      placement: 'bottom-start',
      offset: 8,
      role: 'dialog',
      className: '',
      modal: false,
      backdrop: null,
      trapFocus: false,
      returnFocus: true,
      closeOnEsc: true,
      closeOnOutside: true,
      lockScroll: false,
      matchAnchorWidth: false,
      maxWidth: null,
      onOpen: null,
      onClose: null
    }, options);
    var modal = Boolean(settings.modal);
    var anchor = settings.anchor || null;
    if (anchor && anchor.nodeType !== 1) {
      throw new TypeError('NoteCore.floating.create 的 anchor 必须是元素。');
    }
    if (!anchor && !modal) {
      throw new TypeError('NoteCore.floating.create 需要一个 anchor（modal 可省略）。');
    }

    var root = document.createElement('div');
    root.className = 'hnv-floating' + (modal ? ' hnv-floating--modal' : '');
    var useBackdrop = settings.backdrop == null ? modal : Boolean(settings.backdrop);
    var backdrop = null;
    if (useBackdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'hnv-floating__backdrop';
      backdrop.setAttribute('aria-hidden', 'true');
      root.appendChild(backdrop);
    }
    var panel = document.createElement('div');
    panel.className = 'hnv-floating__panel' +
      (settings.className == null || String(settings.className) === '' ? '' : ' ' + String(settings.className));
    var role = settings.role == null ? 'dialog' : String(settings.role);
    if (role) panel.setAttribute('role', role);
    if (modal) panel.setAttribute('aria-modal', 'true');
    root.appendChild(panel);
    if (settings.maxWidth != null) {
      if (typeof settings.maxWidth === 'number' && isFinite(settings.maxWidth)) {
        panel.style.maxWidth = Math.max(0, settings.maxWidth) + 'px';
      } else if (String(settings.maxWidth).trim()) {
        panel.style.maxWidth = String(settings.maxWidth).trim();
      }
    }

    var layer = {
      root: root,
      el: panel,
      open: function () { return openLayer(layer); },
      close: function (reason, closeOptions) {
        var normalized = closeReason(reason, closeOptions);
        return closeLayer(layer, normalized.reason, normalized.options);
      },
      toggle: function () {
        if (layer.destroyed) return layer;
        if (layer._open) return closeLayer(layer, 'api', {});
        return openLayer(layer);
      },
      isOpen: function () { return Boolean(layer._open && !layer.destroyed); },
      setContent: function (value) {
        if (layer.destroyed) return layer;
        NoteCore.setContent(layer.el, value);
        if (layer._open) positionLayer(layer);
        return layer;
      },
      reposition: function () {
        if (layer._open) positionLayer(layer);
        return layer;
      },
      destroy: function () {
        if (layer.destroyed) return;
        layer.destroyed = true;
        try {
          if (layer._open) closeLayer(layer, 'destroy', { restoreFocus: false });
        } finally {
          if (layer.root.parentNode) layer.root.parentNode.removeChild(layer.root);
        }
      }
    };

    layer.destroyed = false;
    layer._anchor = anchor;
    layer._placement = parsePlacement(settings.placement);
    layer._offset = isFinite(Number(settings.offset)) ? Number(settings.offset) : 8;
    layer._modal = modal;
    layer._backdrop = backdrop;
    layer._trapFocus = Boolean(settings.trapFocus);
    layer._returnFocus = settings.returnFocus !== false;
    layer._closeOnEsc = settings.closeOnEsc !== false;
    layer._closeOnOutside = settings.closeOnOutside !== false;
    layer._lockScroll = Boolean(settings.lockScroll);
    layer._matchAnchorWidth = Boolean(settings.matchAnchorWidth);
    layer._onOpen = typeof settings.onOpen === 'function' ? settings.onOpen : null;
    layer._onClose = typeof settings.onClose === 'function' ? settings.onClose : null;
    layer._open = false;
    layer._opener = null;
    layer._locked = false;
    layer._tabIndexTouched = false;
    layer._originalTabIndex = null;

    NoteCore.setContent(panel, settings.content);
    root.setAttribute('data-placement', layer._placement.auto ? 'auto' : placementName(layer._placement.side, layer._placement.align));
    panel.setAttribute('data-placement', root.getAttribute('data-placement'));
    return layer;
  }

  function closeTopmost(reason) {
    var layer = stack[stack.length - 1];
    if (!layer) return false;
    layer.close(reason == null ? 'api' : reason);
    return true;
  }

  function closeAll(reason) {
    stack.slice().reverse().forEach(function (layer) {
      if (layer._open) layer.close(reason == null ? 'api' : reason);
    });
  }

  NoteCore.floating = {
    create: create,
    closeTopmost: closeTopmost,
    closeAll: closeAll
  };
})(window);
