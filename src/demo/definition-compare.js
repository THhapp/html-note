/* NoteDemo definition comparison — 规范化 model/cues 比较与差异描述。
 * Scope: window.NoteDemoInternals.definitionCompare
 * Depends on: 无（纯数据比较，不接触 DOM）。
 * model 数组按序比较；cues 数组按集合比较（顺序不参与提示语义）。
 * 经典脚本，无模块 / 无网络 / 无 eval。 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var hasOwn = Object.prototype.hasOwnProperty;

  function own(object, key) {
    return object != null && hasOwn.call(Object(object), key);
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function isArray(value) {
    return Array.isArray(value);
  }

  function pathKey(path, key) {
    return path + '.' + key;
  }

  function pathIndex(path, index) {
    return path + '[' + index + ']';
  }

  function diffAt(path, expected, actual) {
    return { path: path, expected: expected, actual: actual };
  }

  /* 集合比较的稳定键：字符串/数字/布尔/对象/数组共用同一套规范化。 */
  function canonicalJSON(value) {
    if (value === null) return 'null';
    var type = typeof value;
    if (type === 'number') return 'n:' + String(value);
    if (type === 'string') return 's:' + JSON.stringify(value);
    if (type === 'boolean') return value ? 'b:true' : 'b:false';
    if (type === 'undefined') return 'undefined';
    if (isArray(value)) {
      var items = [];
      for (var i = 0; i < value.length; i += 1) items.push(canonicalJSON(value[i]));
      return '[' + items.join(',') + ']';
    }
    if (type === 'object') {
      var keys = Object.keys(value).sort();
      var parts = [];
      for (var k = 0; k < keys.length; k += 1) {
        parts.push(JSON.stringify(keys[k]) + ':' + canonicalJSON(value[keys[k]]));
      }
      return '{' + parts.join(',') + '}';
    }
    return 'f:' + String(value);
  }

  function sortedSet(values) {
    var entries = [];
    var seen = {};
    for (var i = 0; i < values.length; i += 1) {
      var key = canonicalJSON(values[i]);
      if (own(seen, key)) continue;
      seen[key] = true;
      entries.push({ key: key, value: values[i] });
    }
    entries.sort(function (left, right) {
      if (left.key < right.key) return -1;
      if (left.key > right.key) return 1;
      return 0;
    });
    return entries;
  }

  var ORDERED = { setArrays: false };
  var AS_SET = { setArrays: true };

  function compareValue(expected, actual, path, mode) {
    if (Object.is(expected, actual)) return null;
    var expectedIsArray = isArray(expected);
    var actualIsArray = isArray(actual);
    if (expectedIsArray || actualIsArray) {
      if (!(expectedIsArray && actualIsArray)) return diffAt(path, expected, actual);
      if (mode.setArrays) {
        var expectedSet = sortedSet(expected);
        var actualSet = sortedSet(actual);
        if (expectedSet.length !== actualSet.length) {
          return diffAt(pathKey(path, 'length'), expectedSet.length, actualSet.length);
        }
        for (var s = 0; s < expectedSet.length; s += 1) {
          if (expectedSet[s].key !== actualSet[s].key) {
            return diffAt(pathIndex(path, s), expectedSet[s].value, actualSet[s].value);
          }
        }
        return null;
      }
      if (expected.length !== actual.length) {
        return diffAt(pathKey(path, 'length'), expected.length, actual.length);
      }
      for (var i = 0; i < expected.length; i += 1) {
        var itemDiff = compareValue(expected[i], actual[i], pathIndex(path, i), mode);
        if (itemDiff) return itemDiff;
      }
      return null;
    }
    var expectedIsObject = isObject(expected);
    var actualIsObject = isObject(actual);
    if (expectedIsObject && actualIsObject) {
      var keys = Object.keys(expected).concat(Object.keys(actual));
      var seen = {};
      for (var k = 0; k < keys.length; k += 1) {
        var key = keys[k];
        if (own(seen, key)) continue;
        seen[key] = true;
        var expectedHas = own(expected, key);
        var actualHas = own(actual, key);
        if (!expectedHas || !actualHas) {
          return diffAt(pathKey(path, key), expectedHas ? expected[key] : undefined, actualHas ? actual[key] : undefined);
        }
        var childDiff = compareValue(expected[key], actual[key], pathKey(path, key), mode);
        if (childDiff) return childDiff;
      }
      return null;
    }
    return diffAt(path, expected, actual);
  }

  function compareModel(expected, actual) {
    return compareValue(expected, actual, '$', ORDERED);
  }

  function compareCues(expected, actual) {
    return compareValue(expected, actual, '$', AS_SET);
  }

  function shortValue(value) {
    var output;
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') output = JSON.stringify(value);
    else if (isArray(value) || isObject(value)) {
      try {
        output = JSON.stringify(value);
      } catch (error) {
        output = String(value);
      }
      if (output == null) output = String(value);
    } else {
      output = String(value);
    }
    if (output.length > 160) output = output.slice(0, 157) + '...';
    return output;
  }

  function actionLabel(action) {
    if (action == null) return 'action';
    if (typeof action === 'string') return action;
    if (isObject(action) && isArray(action.parallel)) return 'parallel';
    if (isObject(action) && action.type != null) return String(action.type);
    return 'action';
  }

  function describeDiff(frameId, bindingId, action, diff) {
    var head = 'Frame "' + (frameId == null ? '' : String(frameId)) + '" / Binding "' +
      (bindingId == null ? '' : String(bindingId)) + '" / Action "' + actionLabel(action) + '"';
    if (!diff || typeof diff !== 'object') return head + '：与目标 Frame 不一致（无可用的差异信息）。';
    return head + '：与目标 Frame 不一致，path=' + String(diff.path) +
      ' expected=' + shortValue(diff.expected) + ' actual=' + shortValue(diff.actual) + '。';
  }

  Internals.definitionCompare = {
    compareModel: compareModel,
    compareCues: compareCues,
    describeDiff: describeDiff
  };
})(window);
