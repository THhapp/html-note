/* NoteUI extended — module-internal shared helpers (not public API).
 * Scope: window.NoteUIInternals.extended.
 * Depends on: NoteCore. Load before the extended component files
 * (order is declared in src/manifests/ui-extended.json).
 * 内部共享文件：仅供 src/ui/extended*.js 使用，不属于公开 API。 */
(function (global) {
  'use strict';

  var hasOwn = Object.prototype.hasOwnProperty;
  var Internals = global.NoteUIInternals = global.NoteUIInternals || {};
  var shared = Internals.extended = Internals.extended || {};

  function core() {
    var value = global.NoteCore;
    if (!value) throw new Error('NoteCore 未加载；NoteUI 扩展组件需要先加载 core。');
    return value;
  }

  function own(object, key) {
    return object != null && hasOwn.call(Object(object), key);
  }

  function text(value) {
    return value == null ? '' : String(value);
  }

  function make(tag, className, content) {
    return core().el(tag, className, content);
  }

  function validateHost(host) {
    return core().validateHost(host);
  }

  function uid(prefix) {
    return core().uid(prefix);
  }

  function isNode(value) {
    return core().isNode(value);
  }

  function append(parent) {
    var C = core();
    for (var i = 1; i < arguments.length; i += 1) C.append(parent, arguments[i]);
    return parent;
  }


  function setHidden(node, hidden) {
    if (!node) return;
    if (hidden) node.setAttribute('hidden', '');
    else node.removeAttribute('hidden');
  }




  function focusNode(node) {
    if (!node || node.isConnected === false || typeof node.focus !== 'function') return false;
    try {
      node.focus({ preventScroll: true });
    } catch (error) {
      try { node.focus(); } catch (ignored) { return false; }
    }
    return document.activeElement === node || node.contains(document.activeElement);
  }

  function isEditableTarget(target) {
    if (!target || typeof target.closest !== 'function') return false;
    return !!target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
  }

  function valueKey(value) {
    if (value === null) return 'null';
    var type = typeof value;
    if (type === 'undefined') return 'undefined';
    if (type === 'string') return 'string:' + value;
    if (type === 'number' || type === 'boolean') return type + ':' + String(value);
    if (type === 'object') {
      if (typeof value.valueOf === 'function') {
        var primitive = value.valueOf();
        if (primitive !== value && (typeof primitive === 'string' ||
            typeof primitive === 'number' || typeof primitive === 'boolean')) {
          return typeof primitive + ':' + String(primitive);
        }
      }
      try { return 'object:' + JSON.stringify(value); } catch (error) { return 'object:' + String(value); }
    }
    return type + ':' + String(value);
  }

  function signatureOf(values) {
    return values.map(valueKey).join('\u0001');
  }

  function uniqueValues(values) {
    var seen = {};
    var out = [];
    (Array.isArray(values) ? values : []).forEach(function (value) {
      var key = valueKey(value);
      if (!own(seen, key)) {
        seen[key] = true;
        out.push(value);
      }
    });
    return out;
  }



  function appendContent(target, value) {
    var C = core();
    if (value == null) return target;
    if (Array.isArray(value)) {
      value.forEach(function (item) { appendContent(target, item); });
    } else if (isNode(value)) {
      C.append(target, value);
    } else {
      C.append(target, text(value));
    }
    return target;
  }

  function readLive(node, message) {
    if (node) node.textContent = text(message);
  }

  shared.VERSION = '1.0.0';
  shared.core = core;
  shared.own = own;
  shared.text = text;
  shared.make = make;
  shared.validateHost = validateHost;
  shared.uid = uid;
  shared.isNode = isNode;
  shared.append = append;
  shared.setHidden = setHidden;
  shared.focusNode = focusNode;
  shared.isEditableTarget = isEditableTarget;
  shared.valueKey = valueKey;
  shared.signatureOf = signatureOf;
  shared.uniqueValues = uniqueValues;
  shared.appendContent = appendContent;
  shared.readLive = readLive;
})(window);
