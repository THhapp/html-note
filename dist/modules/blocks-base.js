/*! note-library module: blocks-base
 * dependencies: core
 * type: JavaScript
 * generated-by: scripts/build.mjs; do-not-edit.
 */

/* ---- source: src/blocks/shared.js ---- */
/*! NoteBlocks internal shared helpers for B01–B10.
 *  INTERNAL SHARED FILE, NOT A PUBLIC ENTRY. It only defines the internal
 *  namespace window.NoteBlocksInternals and the window.NoteBlocks namespace;
 *  the public block implementations live in stage.js, compare.js,
 *  codetrace.js, framefields.js, flow.js, sequence-diagram.js, hierarchy.js and
 *  chart-explain.js and must be loaded after this file.
 *  Load order: src/blocks/shared.js first in src/manifests/blocks-*.json.
 *  NoteBlocksInternals is an implementation detail, not a public API.
 *  Plain JavaScript; uses NoteCore helpers when present. No network, no eval,
 *  no HTML parsing, no timers. */
(function (global) {
  'use strict';

  global.NoteBlocks = global.NoteBlocks || {};
  var fallbackUid = 0;

  function core() {
    return global.NoteCore || {};
  }

  function ui() {
    return global.NoteUI || {};
  }

  function viz() {
    return global.NoteViz || {};
  }

  function own(object, key) {
    return object != null && Object.prototype.hasOwnProperty.call(object, key);
  }

  function text(value) {
    return value == null ? '' : String(value);
  }

  function isNode(value) {
    return !!value && (value.nodeType === 1 || value.nodeType === 3 || value.nodeType === 11);
  }

  function make(tag, className, content) {
    var node = global.document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = text(content);
    return node;
  }

  function clear(target) {
    if (!target) return target;
    var C = core();
    if (typeof C.clear === 'function') return C.clear(target);
    if (typeof target.replaceChildren === 'function') target.replaceChildren();
    else if (typeof target.textContent === 'string') target.textContent = '';
    return target;
  }

  function setContent(target, value) {
    if (!target) return target;
    var C = core();
    if (typeof C.setContent === 'function') return C.setContent(target, value);
    clear(target);
    if (value == null) return target;
    if (Array.isArray(value)) {
      value.forEach(function (item) {
        if (item == null) return;
        target.appendChild(isNode(item) ? item : global.document.createTextNode(text(item)));
      });
      return target;
    }
    if (isNode(value)) target.appendChild(value);
    else target.textContent = text(value);
    return target;
  }

  function uniqueId(prefix) {
    var C = core();
    if (typeof C.uid === 'function') return C.uid(prefix);
    fallbackUid += 1;
    return text(prefix || 'nblk') + '-' + fallbackUid;
  }

  function validateHost(host, label) {
    var C = core();
    if (typeof C.validateHost === 'function') return C.validateHost(host);
    if (!host || (host.nodeType !== 1 && host.nodeType !== 11) || typeof host.appendChild !== 'function') {
      throw new TypeError(text(label || 'NoteBlocks.mount') + ' 需要一个元素或 DocumentFragment 容器。');
    }
    return host;
  }

  function componentValue(path) {
    var parts = text(path).split('.');
    var scope = global;
    for (var i = 0; i < parts.length; i += 1) {
      if (!scope) return null;
      scope = scope[parts[i]];
    }
    return scope || null;
  }

  /* names use fully qualified paths, e.g. 'NoteUI.Table' or 'NoteBlocks.StepPlayer'. */
  function requireComponents(label, names) {
    var missing = (Array.isArray(names) ? names : []).filter(function (name) {
      var api = componentValue(name);
      return !api || typeof api.mount !== 'function';
    });
    if (missing.length) {
      throw new Error(text(label || 'NoteBlocks') + ' 需要先加载对应公开组件：' + missing.join('、') + '。');
    }
  }

  function safeDestroy(instance) {
    if (!instance || typeof instance.destroy !== 'function') return;
    try { instance.destroy(); } catch (error) { /* keep cleanup moving */ }
  }

  function array(value) {
    return Array.isArray(value) ? value.slice() : [];
  }

  function stepArray(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(function (step) {
      return step && typeof step === 'object';
    }).slice();
  }

  function stepName(step, index) {
    if (!step) return '停点 ' + (index + 1);
    var label = step.label != null ? text(step.label).trim() : '';
    return label || '停点 ' + (index + 1);
  }

  function stepWrappers(steps) {
    return (Array.isArray(steps) ? steps : []).map(function (step, index) {
      return {
        id: step.id,
        label: stepName(step, index),
        caption: step.caption == null ? '' : text(step.caption),
        state: step
      };
    });
  }

  global.NoteBlocksInternals = {
    core: core,
    ui: ui,
    viz: viz,
    own: own,
    text: text,
    isNode: isNode,
    make: make,
    clear: clear,
    setContent: setContent,
    uniqueId: uniqueId,
    validateHost: validateHost,
    requireComponents: requireComponents,
    safeDestroy: safeDestroy,
    array: array,
    stepArray: stepArray,
    stepName: stepName,
    stepWrappers: stepWrappers
  };

})(window);
