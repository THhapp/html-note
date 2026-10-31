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
