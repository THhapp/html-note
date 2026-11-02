/* NoteDemo Adapter registry — 汇总内置 Adapter。
 * Scope: window.NoteDemoInternals.adapters
 * Load after adapters/matrix.js、sequence.js、sequence-edit.js、sequence-insert.js、dom.js、expression.js、table.js、flow-stage.js、flow-packet.js、flow-segment.js、flow-device.js。
 * 经典脚本，无模块/无网络/无 eval。
 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var ORDER = ['matrix', 'sequence', 'sequence-edit', 'sequence-insert', 'dom', 'expression', 'table', 'flow-stage', 'flow-packet', 'flow-segment', 'flow-device'];
  var source = isObject(Internals.adapters) ? Internals.adapters : {};
  var adapters = {};

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  ORDER.forEach(function (name) {
    var adapter = source[name];
    if (adapter && typeof adapter === 'object') adapters[name] = adapter;
  });

  Internals.adapters = adapters;
})(window);
