/* NoteUI navigation — module-internal shared helpers (not public API).
 * Scope: window.NoteUIInternals.navigation.
 * Depends on: NoteCore. Load before the navigation component files
 * (order is declared in src/manifests/ui-navigation.json).
 * 内部共享文件：仅供 src/ui/navigation*.js 使用，不属于公开 API。 */
(function (global) {
  'use strict';

  var hasOwn = Object.prototype.hasOwnProperty;
  var Internals = global.NoteUIInternals = global.NoteUIInternals || {};
  var shared = Internals.navigation = Internals.navigation || {};

  function own(object, key) {
    return object != null && hasOwn.call(Object(object), key);
  }

  function core() {
    var value = global.NoteCore;
    if (!value) throw new Error('NoteCore 未加载；导航组件需要先加载 core。');
    return value;
  }

  function text(value) {
    return value == null ? '' : String(value);
  }


  function make(tag, className) {
    var node = global.document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function content(target, value) {
    var c = core();
    if (typeof c.setContent === 'function') return c.setContent(target, value);
    if (value && (value.nodeType === 1 || value.nodeType === 3 || value.nodeType === 11)) {
      target.replaceChildren(value);
    } else if (Array.isArray(value)) {
      target.replaceChildren();
      value.forEach(function (entry) {
        if (entry && entry.nodeType) target.appendChild(entry);
        else target.appendChild(document.createTextNode(text(entry)));
      });
    } else {
      target.textContent = text(value);
    }
    return target;
  }

  function validateHost(host) {
    var c = core();
    if (typeof c.validateHost === 'function') return c.validateHost(host);
    if (!host || (host.nodeType !== 1 && host.nodeType !== 11) || typeof host.appendChild !== 'function') {
      throw new TypeError('NoteUI.mount 需要一个元素或 DocumentFragment 容器。');
    }
    return host;
  }

  function uniqueId(prefix) {
    var c = core();
    if (typeof c.uid === 'function') return c.uid(prefix);
    return prefix + '-' + Math.random().toString(36).slice(2);
  }

  function isElement(value) {
    return !!value && value.nodeType === 1;
  }

  function findElement(value) {
    if (isElement(value)) return value;
    if (value === global || value === global.document) return global;
    if (typeof value === 'string' && value) {
      try {
        return global.document.querySelector(value);
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  function focusNode(node) {
    if (!node || !node.isConnected || typeof node.focus !== 'function') return false;
    try {
      node.focus({ preventScroll: true });
    } catch (error) {
      try { node.focus(); } catch (ignored) { return false; }
    }
    return true;
  }

  function makeIcon(value, size) {
    if (value && value.nodeType === 1) return value;
    if (typeof value !== 'string' || !value) return null;
    var c = core();
    if (typeof c.icon !== 'function') return null;
    return c.icon(value, { size: size || 16 });
  }

  function reducedMotion() {
    var c = global.NoteCore;
    if (c && c.motion && typeof c.motion.reduced === 'function') {
      try { return !!c.motion.reduced(); } catch (error) { return false; }
    }
    try {
      return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (error) {
      return false;
    }
  }

  function scrollIntoNearest(element, container) {
    if (!element) return;
    var c = global.NoteCore;
    if (c && typeof c.scrollIntoViewIfNeeded === 'function') {
      c.scrollIntoViewIfNeeded(element, container || null, { block: 'nearest', inline: 'nearest' });
      return;
    }
    if (typeof element.scrollIntoView === 'function') {
      try { element.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (error) {}
    }
  }

  shared.own = own;
  shared.core = core;
  shared.text = text;
  shared.make = make;
  shared.content = content;
  shared.validateHost = validateHost;
  shared.uniqueId = uniqueId;
  shared.isElement = isElement;
  shared.findElement = findElement;
  shared.focusNode = focusNode;
  shared.makeIcon = makeIcon;
  shared.reducedMotion = reducedMotion;
  shared.scrollIntoNearest = scrollIntoNearest;
})(window);
