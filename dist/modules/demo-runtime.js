/*! note-library module: demo-runtime
 * dependencies: core
 * type: JavaScript
 * generated-by: scripts/build.mjs; do-not-edit.
 */

/* ---- source: src/demo/definition-compare.js ---- */
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

/* ---- source: src/demo/definition-compile.js ---- */
/* NoteDemo definition compile — 校验并规范化 Frame/Transition/动作/标记/timing/attention 数据。
 * Scope: window.NoteDemoInternals.definitionCompile
 * Depends on: NoteDemoInternals.definitionCompare（scene 来源/目标视图差异比较）。
 * 只做纯数据校验与冻结，不组装 plan（plan 组装见 definition-prepare.js）。
 * 经典脚本，无模块 / 无网络 / 无 eval。 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var hasOwn = Object.prototype.hasOwnProperty;
  var MAX_ISSUES = 12;

  function own(object, key) {
    return object != null && hasOwn.call(Object(object), key);
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function isArray(value) {
    return Array.isArray(value);
  }

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
  }

  function repr(value) {
    if (typeof value === 'string') return '"' + value + '"';
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (isArray(value)) return '数组';
    if (typeof value === 'object') return '对象';
    return String(value);
  }

  function messageOf(error) {
    if (error == null) return '';
    if (typeof error === 'string') return error;
    if (error.message != null) return String(error.message);
    return String(error);
  }

  function pathKey(path, key) {
    return path + '.' + key;
  }

  function pathIndex(path, index) {
    return path + '[' + index + ']';
  }

  function deepFreeze(value, seen) {
    if (value == null || typeof value !== 'object') return value;
    var list = seen || [];
    if (list.indexOf(value) >= 0) return value;
    list.push(value);
    Object.freeze(value);
    var keys = Object.keys(value);
    for (var i = 0; i < keys.length; i += 1) deepFreeze(value[keys[i]], list);
    return value;
  }

  /* 标记等“保留原形”的数据拷贝：只复制数组与普通对象，其他引用保留。 */
  function cloneData(value, seen) {
    if (value == null || typeof value !== 'object') return value;
    var list = seen || [];
    if (list.indexOf(value) >= 0) return value;
    list.push(value);
    var output;
    var i;
    if (isArray(value)) {
      output = [];
      for (i = 0; i < value.length; i += 1) output.push(cloneData(value[i], list));
      return output;
    }
    output = {};
    var keys = Object.keys(value);
    for (i = 0; i < keys.length; i += 1) output[keys[i]] = cloneData(value[keys[i]], list);
    return output;
  }

  function compareModule() {
    var compare = Internals.definitionCompare;
    if (!compare || typeof compare.compareModel !== 'function' || typeof compare.compareCues !== 'function') {
      throw new Error('NoteDemo 核心加载顺序错误：定义编译需要先加载 NoteDemoInternals.definitionCompare（src/demo/definition-compare.js）。');
    }
    return compare;
  }

  /* ---------------- 定义错误 ---------------- */

  function NoteDemoDefinitionError(issues, total) {
    var list = isArray(issues) ? issues.slice(0, MAX_ISSUES) : [];
    var count = typeof total === 'number' ? total : list.length;
    var lines = [];
    for (var i = 0; i < list.length; i += 1) lines.push('  ' + (i + 1) + '. ' + list[i]);
    var message = 'NoteDemo 定义错误（共 ' + count + ' 个问题' +
      (count > list.length ? '，仅列出前 ' + list.length + ' 条' : '') + '）：' + (lines.length ? '\n' + lines.join('\n') : '');
    var error = new Error(message);
    error.name = 'NoteDemoDefinitionError';
    error.issues = list;
    error.issueCount = count;
    if (Object.setPrototypeOf) Object.setPrototypeOf(error, NoteDemoDefinitionError.prototype);
    else error.__proto__ = NoteDemoDefinitionError.prototype; // eslint-disable-line no-proto
    return error;
  }
  NoteDemoDefinitionError.prototype = Object.create(Error.prototype);
  NoteDemoDefinitionError.prototype.constructor = NoteDemoDefinitionError;
  NoteDemoDefinitionError.prototype.name = 'NoteDemoDefinitionError';

  function Issues() {
    this.all = [];
  }

  Issues.prototype.push = function (path, message) {
    this.all.push((path ? path + ': ' : '') + message);
  };

  Issues.prototype.has = function () {
    return this.all.length > 0;
  };

  Issues.prototype.thrown = function () {
    return new NoteDemoDefinitionError(this.all.slice(0, MAX_ISSUES), this.all.length);
  };

  /* ---------------- 定义准备 ---------------- */

  function resolveAdapters(explicit) {
    var merged = {};
    var builtin = Internals.adapters;
    var keys;
    var i;
    var name;
    if (isObject(builtin)) {
      keys = Object.keys(builtin);
      for (i = 0; i < keys.length; i += 1) {
        name = keys[i];
        if (builtin[name] && typeof builtin[name] === 'object') merged[name] = builtin[name];
      }
    }
    if (isObject(explicit)) {
      keys = Object.keys(explicit);
      for (i = 0; i < keys.length; i += 1) {
        name = keys[i];
        if (explicit[name] && typeof explicit[name] === 'object') merged[name] = explicit[name];
      }
    }
    return merged;
  }

  function validateRef(ref, path, bindings, issues) {
    if (!isObject(ref)) {
      issues.push(path, '必须是 {binding, query, optional?} 对象');
      return;
    }
    if (!isNonEmptyString(ref.binding)) {
      issues.push(pathKey(path, 'binding'), '必须是非空字符串');
    } else if (!own(bindings, ref.binding)) {
      issues.push(pathKey(path, 'binding'), '引用了未定义的 binding ' + repr(ref.binding));
    }
    if (ref.query == null) issues.push(pathKey(path, 'query'), '不能为空（Adapter 需要逻辑目标）');
    if (ref.optional !== undefined && typeof ref.optional !== 'boolean') {
      issues.push(pathKey(path, 'optional'), '必须是布尔值');
    }
  }

  function compileMarks(input, path, bindings, issues) {
    var output = [];
    var seenIds = {};
    if (!isArray(input)) {
      issues.push(path, '必须是数组');
      return output;
    }
    for (var i = 0; i < input.length; i += 1) {
      var mark = input[i];
      var markPath = pathIndex(path, i);
      if (!isObject(mark)) {
        issues.push(markPath, '必须是对象');
        continue;
      }
      var kind = mark.kind;
      if (kind !== 'focus' && kind !== 'range' && kind !== 'link') {
        issues.push(pathKey(markPath, 'kind'), "必须是 'focus' | 'range' | 'link'");
        continue;
      }
      if (mark.id !== undefined && mark.id !== null) {
        if (!isNonEmptyString(mark.id)) {
          issues.push(pathKey(markPath, 'id'), '必须是非空字符串');
        } else if (own(seenIds, mark.id)) {
          issues.push(pathKey(markPath, 'id'), '同一 Frame 内不得重复标记 id ' + repr(mark.id));
        } else {
          seenIds[mark.id] = true;
        }
      }
      var copy = cloneData(mark);
      if (kind === 'focus') {
        validateRef(mark.target, pathKey(markPath, 'target'), bindings, issues);
        if (mark.mode === undefined || mark.mode === null) copy.mode = 'box';
        else if (mark.mode !== 'box' && mark.mode !== 'underline') {
          issues.push(pathKey(markPath, 'mode'), "必须是 'box' | 'underline'");
        }
        if (mark.mode === 'underline') {
          if (!isNonEmptyString(mark.text)) issues.push(pathKey(markPath, 'text'), 'underline 模式必须提供非空 text');
        } else if (mark.text !== undefined && typeof mark.text !== 'string') {
          issues.push(pathKey(markPath, 'text'), '必须是字符串');
        }
      } else if (kind === 'range') {
        if (!isArray(mark.targets) || mark.targets.length === 0) {
          issues.push(pathKey(markPath, 'targets'), '必须是非空数组');
        } else {
          for (var t = 0; t < mark.targets.length; t += 1) {
            validateRef(mark.targets[t], pathKey(markPath, 'targets') + '[' + t + ']', bindings, issues);
          }
        }
        if (mark.text !== undefined && typeof mark.text !== 'string') issues.push(pathKey(markPath, 'text'), '必须是字符串');
        if (mark.side !== undefined && typeof mark.side !== 'string') issues.push(pathKey(markPath, 'side'), '必须是字符串');
        if (mark.orientation !== undefined && typeof mark.orientation !== 'string') {
          issues.push(pathKey(markPath, 'orientation'), '必须是字符串');
        }
      } else {
        validateRef(mark.from, pathKey(markPath, 'from'), bindings, issues);
        validateRef(mark.to, pathKey(markPath, 'to'), bindings, issues);
        if (mark.label !== undefined && mark.label !== null && typeof mark.label !== 'string') {
          issues.push(pathKey(markPath, 'label'), '必须是字符串');
        }
        if (mark.arrow !== undefined && typeof mark.arrow !== 'boolean') {
          issues.push(pathKey(markPath, 'arrow'), '必须是布尔值');
        }
      }
      output.push(deepFreeze(copy));
    }
    return output;
  }

  function compileSingleAction(action, path, bindings, issues, insideParallel) {
    if (own(action, 'parallel')) {
      issues.push(pathKey(path, 'parallel'), insideParallel ? 'parallel 内不得再嵌套 parallel' : 'parallel 组必须写在 parallel 数组中');
      return null;
    }
    var bindingId = action.binding;
    var binding = null;
    if (!isNonEmptyString(bindingId)) {
      issues.push(pathKey(path, 'binding'), '必须是非空字符串');
    } else if (!own(bindings, bindingId)) {
      issues.push(pathKey(path, 'binding'), '引用了未定义的 binding ' + repr(bindingId));
    } else {
      binding = bindings[bindingId];
    }
    var type = action.type;
    if (!isNonEmptyString(type)) issues.push(pathKey(path, 'type'), '必须是非空字符串');
    var paramsValue = action.params;
    if (paramsValue !== undefined && paramsValue !== null && !isObject(paramsValue)) {
      issues.push(pathKey(path, 'params'), '必须是对象');
      paramsValue = undefined;
    }
    if (binding && binding.adapter && typeof binding.adapter.validateAction === 'function' && isNonEmptyString(type)) {
      try {
        binding.adapter.validateAction(action, binding.options);
      } catch (error) {
        issues.push(path, 'Adapter "' + String(binding.adapterName) + '" 拒绝了该动作：' + messageOf(error));
      }
    }
    if (!isNonEmptyString(bindingId) || !isNonEmptyString(type)) return null;
    return deepFreeze({
      binding: bindingId,
      type: type,
      params: paramsValue === undefined || paramsValue === null ? {} : deepFreeze(cloneData(paramsValue))
    });
  }

  function compileActions(input, path, bindings, issues) {
    var output = [];
    if (!isArray(input)) {
      issues.push(path, '必须是数组');
      return output;
    }
    for (var i = 0; i < input.length; i += 1) {
      var action = input[i];
      var actionPath = pathIndex(path, i);
      if (!isObject(action)) {
        issues.push(actionPath, '必须是 {binding,type,params?} 或 {parallel:[...]} 对象');
        continue;
      }
      if (own(action, 'parallel')) {
        if (!isArray(action.parallel) || action.parallel.length === 0) {
          issues.push(pathKey(actionPath, 'parallel'), '必须是非空动作数组');
          continue;
        }
        var group = [];
        var seenBindings = {};
        for (var m = 0; m < action.parallel.length; m += 1) {
          var member = action.parallel[m];
          var memberPath = pathKey(actionPath, 'parallel') + '[' + m + ']';
          if (!isObject(member)) {
            issues.push(memberPath, '必须是 {binding,type,params?} 对象');
            continue;
          }
          var compiled = compileSingleAction(member, memberPath, bindings, issues, true);
          if (!compiled) continue;
          if (own(seenBindings, compiled.binding)) {
            issues.push(pathKey(memberPath, 'binding'), '同一 parallel 组内不得重复 binding ' + repr(compiled.binding));
            continue;
          }
          seenBindings[compiled.binding] = true;
          group.push(compiled);
        }
        output.push(deepFreeze({ parallel: group }));
        continue;
      }
      var single = compileSingleAction(action, actionPath, bindings, issues, false);
      if (single) output.push(single);
    }
    return output;
  }

  var SCENE_MODES = { layout: true, update: true, cut: true, reveal: true };
  var SCENE_REVEAL_AT = { start: true, 'objects-settled': true };
  var SCENE_TIMING_KEYS = {
    duration: true,
    stagger: true,
    enterDuration: true,
    exitDuration: true,
    valueSwapDelay: true,
    valueSwapDuration: true,
    valueFlashDuration: true,
    cueDuration: true,
    markDelay: true,
    markDuration: true,
    revealDelay: true,
    revealDuration: true,
    easing: true
  };
  var ATTENTION_STEP_DEFAULT = 560;
  /* attention 场景使用的公共内容节奏：比基础默认更慢、留出识别与交接时间；
   * 只在该 scene 声明 attention 时作为 public 层生效，author timing 仍可覆盖。 */
  var ATTENTION_CONTENT_TIMING = {
    duration: 760,
    stagger: 70,
    enterDuration: 560,
    exitDuration: 320,
    valueSwapDelay: 0,
    valueSwapDuration: 560,
    valueFlashDuration: 720,
    cueDuration: 680,
    markDelay: 260,
    markDuration: 600,
    revealDelay: 100,
    revealDuration: 420,
    easing: 'cubic-bezier(.22,.7,.25,1)'
  };
  var SCENE_TIMING_DEFAULTS = {
    duration: 600,
    stagger: 40,
    enterDuration: 420,
    exitDuration: 220,
    valueSwapDelay: 160,
    valueSwapDuration: 420,
    valueFlashDuration: 560,
    cueDuration: 520,
    markDelay: 200,
    markDuration: 420,
    revealDelay: 0,
    revealDuration: 260,
    easing: 'cubic-bezier(.3,0,.15,1)'
  };

  function easingIsValid(value) {
    if (typeof value !== 'string' || value.trim() === '') return false;
    if (global.CSS && typeof global.CSS.supports === 'function') {
      try {
        return global.CSS.supports('animation-timing-function', value) ||
          global.CSS.supports('transition-timing-function', value);
      } catch (error) { /* 回退到非空检查 */ }
    }
    return true;
  }

  function compileTimingMap(input, path, issues) {
    var timing = {};
    if (input == null) return timing;
    if (!isObject(input)) {
      issues.push(path, '必须是对象');
      return timing;
    }
    Object.keys(input).forEach(function (key) {
      var value = input[key];
      if (!own(SCENE_TIMING_KEYS, key)) {
        issues.push(pathKey(path, key), '未知 timing 字段');
        return;
      }
      if (key === 'easing') {
        if (!easingIsValid(value)) issues.push(pathKey(path, key), '必须是可被浏览器接受的 easing 字符串');
        else timing[key] = value;
        return;
      }
      if (typeof value !== 'number' || !isFinite(value) || value < 0) {
        issues.push(pathKey(path, key), '必须是大于等于 0 的有限数字');
      } else {
        timing[key] = value;
      }
    });
    return timing;
  }

  /* 观察范围：单个元素框的局部偏移，或主元素+若干稳定引用的并集（深度只 1 层）。 */
  function compileRange(input, path, bindings, issues) {
    if (!isObject(input)) {
      issues.push(path, "必须是 {kind:'local'|'union'} 对象");
      return null;
    }
    var kind = input.kind;
    if (kind === 'local') {
      var localAllowed = { kind: true, dx: true, dy: true, width: true, height: true };
      Object.keys(input).forEach(function (key) {
        if (!own(localAllowed, key)) issues.push(pathKey(path, key), 'local range 只允许 kind/dx/dy/width/height');
      });
      var numbers = {};
      var valid = true;
      ['dx', 'dy'].forEach(function (key) {
        if (typeof input[key] !== 'number' || !isFinite(input[key])) {
          issues.push(pathKey(path, key), '必须是有限数字（相对主元素矩形的偏移）');
          valid = false;
        } else {
          numbers[key] = input[key];
        }
      });
      ['width', 'height'].forEach(function (key) {
        if (typeof input[key] !== 'number' || !isFinite(input[key]) || input[key] < 0) {
          issues.push(pathKey(path, key), '必须是大于等于 0 的有限数字');
          valid = false;
        } else {
          numbers[key] = input[key];
        }
      });
      if (!valid) return null;
      return deepFreeze({ kind: 'local', dx: numbers.dx, dy: numbers.dy, width: numbers.width, height: numbers.height });
    }
    if (kind === 'union') {
      var unionAllowed = { kind: true, refs: true };
      Object.keys(input).forEach(function (key) {
        if (!own(unionAllowed, key)) issues.push(pathKey(path, key), 'union range 只允许 kind/refs');
      });
      if (!isArray(input.refs) || input.refs.length === 0) {
        issues.push(pathKey(path, 'refs'), '必须是非空数组（[{binding,query},...]）');
        return null;
      }
      var refs = [];
      var refsValid = true;
      for (var r = 0; r < input.refs.length; r += 1) {
        var refPath = pathKey(path, 'refs') + '[' + r + ']';
        var ref = input.refs[r];
        validateRef(ref, refPath, bindings, issues);
        if (!isObject(ref)) {
          refsValid = false;
          continue;
        }
        Object.keys(ref).forEach(function (key) {
          if (key !== 'binding' && key !== 'query') {
            issues.push(pathKey(refPath, key), 'union refs 只允许 binding 与 query（深度 ≤1，不再嵌套 range）');
          }
        });
        if (isNonEmptyString(ref.binding) && ref.query != null) {
          refs.push(deepFreeze({ binding: ref.binding, query: cloneData(ref.query) }));
        } else {
          refsValid = false;
        }
      }
      if (!refsValid || refs.length !== input.refs.length) return null;
      return deepFreeze({ kind: 'union', refs: refs });
    }
    issues.push(pathKey(path, 'kind'), "必须是 'local' | 'union'");
    return null;
  }

  function compileAttention(input, path, bindings, issues) {
    if (input == null) return null;
    if (!isObject(input)) {
      issues.push(path, '必须是 {targets, stepDuration?} 对象');
      return null;
    }
    var allowed = { targets: true, stepDuration: true };
    Object.keys(input).forEach(function (key) {
      if (!own(allowed, key)) issues.push(pathKey(path, key), '未知字段（attention 只允许 targets 与 stepDuration）');
    });
    var targets = [];
    if (!isArray(input.targets) || input.targets.length === 0) {
      issues.push(pathKey(path, 'targets'), '必须是非空数组（按注意顺序排列的 {binding, query, groups?, holdDuration?, range?}）');
    } else {
      for (var i = 0; i < input.targets.length; i += 1) {
        var targetPath = pathKey(path, 'targets') + '[' + i + ']';
        var ref = input.targets[i];
        validateRef(ref, targetPath, bindings, issues);
        if (!isObject(ref)) continue;
        var targetKeys = { binding: true, query: true, groups: true, holdDuration: true, range: true };
        Object.keys(ref).forEach(function (key) {
          if (!own(targetKeys, key)) {
            issues.push(pathKey(targetPath, key), 'attention 目标只允许 binding、query、groups、holdDuration 与 range');
          }
        });
        var compiledGroups = null;
        if (ref.groups !== undefined) {
          if (!isArray(ref.groups)) {
            issues.push(pathKey(targetPath, 'groups'), '必须是数组（[] 表示只观察；省略表示整 Binding 默认门控）');
          } else {
            var groups = [];
            var groupSeen = {};
            var groupsValid = true;
            for (var g = 0; g < ref.groups.length; g += 1) {
              var groupName = ref.groups[g];
              if (!isNonEmptyString(groupName)) {
                issues.push(pathKey(targetPath, 'groups') + '[' + g + ']', '必须是非空字符串');
                groupsValid = false;
                continue;
              }
              if (own(groupSeen, groupName)) {
                issues.push(pathKey(targetPath, 'groups') + '[' + g + ']', '不得重复声明组 ' + repr(groupName));
                groupsValid = false;
                continue;
              }
              groupSeen[groupName] = true;
              groups.push(groupName);
            }
            if (groupsValid) compiledGroups = groups;
          }
        }
        var holdDuration = ref.holdDuration;
        var hasHold = holdDuration !== undefined && holdDuration !== null;
        if (hasHold && (typeof holdDuration !== 'number' || !isFinite(holdDuration) || holdDuration < 0 || holdDuration > 10000)) {
          issues.push(pathKey(targetPath, 'holdDuration'), '必须是 [0, 10000] 内的有限数字（毫秒；0 有效）');
          hasHold = false;
        }
        var compiledRange = null;
        if (ref.range !== undefined && ref.range !== null) {
          compiledRange = compileRange(ref.range, pathKey(targetPath, 'range'), bindings, issues);
        }
        if (!isNonEmptyString(ref.binding) || ref.query == null) continue;
        var compiledTarget = { binding: ref.binding, query: cloneData(ref.query) };
        if (compiledGroups !== null) compiledTarget.groups = compiledGroups;
        if (hasHold) compiledTarget.holdDuration = holdDuration;
        if (compiledRange) compiledTarget.range = compiledRange;
        try {
          Object.defineProperty(compiledTarget, 'path', { value: targetPath, enumerable: false, writable: false, configurable: false });
        } catch (error) { /* 旧环境没有 defineProperty 时仍可运行 */ }
        targets.push(deepFreeze(compiledTarget));
      }
    }
    var stepDuration = input.stepDuration;
    if (stepDuration === undefined || stepDuration === null) stepDuration = ATTENTION_STEP_DEFAULT;
    else if (typeof stepDuration !== 'number' || !isFinite(stepDuration) || stepDuration <= 0 || stepDuration > 10000) {
      issues.push(pathKey(path, 'stepDuration'), '必须是 (0, 10000] 内的有限数字（毫秒）');
    }
    var compiledAttention = { targets: targets, stepDuration: stepDuration };
    try {
      Object.defineProperty(compiledAttention, 'path', { value: path, enumerable: false, writable: false, configurable: false });
    } catch (error) { /* ignore */ }
    return deepFreeze(compiledAttention);
  }

  function compileScene(input, path, bindings, issues) {
    var compare = compareModule();
    if (!isObject(input)) {
      issues.push(path, '必须是对象');
      return null;
    }
    var allowed = { bindings: true, timing: true, attention: true };
    Object.keys(input).forEach(function (key) {
      if (!own(allowed, key)) issues.push(pathKey(path, key), '未知字段（scene 只允许 bindings、timing 与 attention）');
    });
    var members = [];
    var seen = {};
    if (!isArray(input.bindings) || input.bindings.length === 0) {
      issues.push(pathKey(path, 'bindings'), '必须是非空数组');
    } else {
      for (var i = 0; i < input.bindings.length; i += 1) {
        var member = input.bindings[i];
        var memberPath = pathKey(path, 'bindings') + '[' + i + ']';
        if (!isObject(member)) {
          issues.push(memberPath, '必须是 {binding, mode?, at?, after?} 对象');
          continue;
        }
        var memberKeys = { binding: true, mode: true, at: true, after: true, timing: true };
        Object.keys(member).forEach(function (key) {
          if (!own(memberKeys, key)) issues.push(pathKey(memberPath, key), '未知字段（scene 参与者只允许 binding/mode/at/after/timing）');
        });
        var bindingId = member.binding;
        var binding = null;
        if (!isNonEmptyString(bindingId)) {
          issues.push(pathKey(memberPath, 'binding'), '必须是非空字符串');
        } else if (!own(bindings, bindingId)) {
          issues.push(pathKey(memberPath, 'binding'), '引用了未定义的 binding ' + repr(bindingId));
        } else {
          binding = bindings[bindingId];
        }
        if (isNonEmptyString(bindingId) && own(seen, bindingId)) {
          issues.push(pathKey(memberPath, 'binding'), '同一 scene 内不得重复 binding ' + repr(bindingId));
        }
        if (isNonEmptyString(bindingId)) seen[bindingId] = true;
        var mode = member.mode;
        if (mode === undefined || mode === null) {
          var defaultMode = binding && binding.adapter ? binding.adapter.defaultSceneMode : null;
          if (isNonEmptyString(defaultMode) && own(SCENE_MODES, defaultMode)) {
            mode = defaultMode;
          } else {
            issues.push(pathKey(memberPath, 'mode'), '必须显式声明 scene 模式（Adapter 未提供 defaultSceneMode）');
            continue;
          }
        }
        if (!isNonEmptyString(mode) || !own(SCENE_MODES, mode)) {
          issues.push(pathKey(memberPath, 'mode'), "必须是 'layout' | 'update' | 'cut' | 'reveal'");
          continue;
        }
        var after = [];
        if (member.after !== undefined && member.after !== null) {
          var afterInput = isArray(member.after) ? member.after : [member.after];
          var afterKeys = {};
          for (var a = 0; a < afterInput.length; a += 1) {
            var entryPath = pathKey(memberPath, 'after') + (isArray(member.after) ? '[' + a + ']' : '');
            var entryValue = afterInput[a];
            var refBinding = null;
            var refGroup = null;
            if (isNonEmptyString(entryValue)) {
              refBinding = entryValue;
            } else if (isObject(entryValue)) {
              Object.keys(entryValue).forEach(function (key) {
                if (key !== 'binding' && key !== 'group') {
                  issues.push(entryPath, 'after 条目只允许 {binding, group} 或 Binding ID');
                }
              });
              if (!isNonEmptyString(entryValue.binding)) {
                issues.push(pathKey(entryPath, 'binding'), '必须是非空字符串');
              } else {
                refBinding = entryValue.binding;
              }
              if (entryValue.group === undefined || entryValue.group === null) {
                issues.push(pathKey(entryPath, 'group'), '组引用必须提供 group（等待该组 ready）');
              } else if (!isNonEmptyString(entryValue.group)) {
                issues.push(pathKey(entryPath, 'group'), '必须是非空字符串');
              } else {
                refGroup = entryValue.group;
              }
            } else {
              issues.push(entryPath, '必须是 Binding ID 或 {binding, group} 对象');
            }
            if (!refBinding) continue;
            if (refBinding === bindingId) {
              issues.push(entryPath, '不得引用自身 ' + repr(refBinding));
              continue;
            }
            var afterKey = refBinding + '\u0000' + (refGroup || '');
            if (own(afterKeys, afterKey)) {
              issues.push(entryPath, '不得重复引用 ' + repr(refBinding) + (refGroup ? ' 的组 ' + repr(refGroup) : ''));
              continue;
            }
            afterKeys[afterKey] = true;
            after.push(deepFreeze({ binding: refBinding, group: refGroup }));
          }
        }
        var at = 'objects-settled';
        if (member.at !== undefined && member.at !== null) {
          if (after.length) {
            issues.push(pathKey(memberPath, 'at'), '不能与 after 同时声明（after 已决定启动时机）');
          } else if (mode !== 'reveal') {
            issues.push(pathKey(memberPath, 'at'), '只有 reveal 参与者可以声明 at');
          } else if (!isNonEmptyString(member.at) || !own(SCENE_REVEAL_AT, member.at)) {
            issues.push(pathKey(memberPath, 'at'), "必须是 'start' | 'objects-settled'");
          } else {
            at = member.at;
          }
        }
        if (binding && binding.adapter) {
          var adapter = binding.adapter;
          var modes = adapter.sceneModes;
          if (!isArray(modes) || modes.indexOf(mode) < 0) {
            issues.push(pathKey(memberPath, 'mode'),
              'Adapter "' + String(binding.adapterName) + '" 未声明支持 scene 模式 ' + repr(mode) +
              '（sceneModes：' + (isArray(modes) ? modes.join('、') : '未声明') + '）');
          }
        }
        var memberTiming = compileTimingMap(member.timing, pathKey(memberPath, 'timing'), issues);
        if (mode === 'cut' && after.length) {
          issues.push(pathKey(memberPath, 'after'),
            'cut 在同步提交时已经显示目标，不能声明 after；需要可承接的视觉内容请改用 update 或 reveal');
        }
        if (isNonEmptyString(bindingId) && isNonEmptyString(mode)) {
          members.push(deepFreeze({
            binding: bindingId,
            mode: mode,
            at: mode === 'reveal' && after.length === 0 ? at : null,
            after: after,
            timing: deepFreeze(memberTiming)
          }));
        }
      }
    }
    var memberById = {};
    for (var m = 0; m < members.length; m += 1) memberById[members[m].binding] = members[m];
    var timing = compileTimingMap(input.timing, pathKey(path, 'timing'), issues);
    var attention = compileAttention(input.attention, pathKey(path, 'attention'), bindings, issues);
    /* after 引用必须在同一 scene 内。 */
    for (var c = 0; c < members.length; c += 1) {
      for (var q = 0; q < members[c].after.length; q += 1) {
        var afterEntry = members[c].after[q];
        if (!own(memberById, afterEntry.binding)) {
          issues.push(pathKey(path, 'bindings'), 'after 引用了同一 scene 中不存在的 binding ' + repr(afterEntry.binding));
        }
      }
    }
    /* attention 目标与 scene 成员/模式的编译期形状校验；组是否存在依赖 prepare 后的 groups()，运行期再查。 */
    var firstContentTarget = {};
    if (attention) {
      for (var ti = 0; ti < attention.targets.length; ti += 1) {
        var target = attention.targets[ti];
        var targetMember = memberById[target.binding];
        var targetPath = target.path || (pathKey(path, 'attention') + '.targets[' + ti + ']');
        var hasContentGate = !(isArray(target.groups) && target.groups.length === 0);
        if (!targetMember) {
          if (isArray(target.groups) && target.groups.length > 0) {
            issues.push(targetPath, '稳定参照（不参与本 scene 的 binding）不能声明 groups 非空；只观察请写 groups: []');
          }
          continue;
        }
        if (targetMember.mode === 'cut') {
          if (hasContentGate) {
            issues.push(targetPath, 'cut 参与者已经在同步提交时显示目标，不能作为 attention 内容门控目标；观察请用 groups: []，延后展开请改用 update/layout/reveal');
          }
          continue;
        }
        if (targetMember.mode === 'reveal' && isArray(target.groups) && target.groups.length > 0) {
          issues.push(targetPath, 'reveal 参与者没有分组内容效果，groups 只能省略（整 Binding 门控）或 []（只观察）');
          continue;
        }
        if (hasContentGate && firstContentTarget[target.binding] === undefined) {
          firstContentTarget[target.binding] = ti;
        }
      }
    }
    /* 联合 waits-for 图：attention 顺序 + Binding after + reveal 隐含 objects-settled。
     * 定义期只能判定 Binding 级依赖；组级依赖在 prepare 后、commit 前用实际 groups() 再检查一次。 */
    var edges = {};
    function graphNode(id) { if (!own(edges, id)) edges[id] = []; return id; }
    function graphEdge(from, to) { graphNode(from); if (edges[from].indexOf(to) < 0) edges[from].push(to); }
    members.forEach(function (member) {
      graphNode('start:' + member.binding);
      graphNode('ready:' + member.binding);
      /* 成员 ready 恒在其 start 之后（cut 同步、reveal 整块显现同理）。 */
      graphEdge('start:' + member.binding, 'ready:' + member.binding);
      var deps = [];
      if (member.after.length) {
        member.after.forEach(function (entry) {
          if (entry.group == null) deps.push('ready:' + entry.binding);
          else deps.push('readyGroup:' + entry.binding + ':' + entry.group);
        });
      } else if (member.mode === 'reveal' && member.at === 'objects-settled') {
        members.forEach(function (other) {
          if (other.binding === member.binding || other.mode === 'reveal') return;
          deps.push('ready:' + other.binding);
        });
      }
      deps.forEach(function (dep) { graphEdge(dep, 'start:' + member.binding); });
    });
    if (attention) {
      for (var ai = 0; ai < attention.targets.length; ai += 1) {
        graphNode('attnArrive:' + ai);
        graphNode('attnReady:' + ai);
        graphEdge('attnArrive:' + ai, 'attnReady:' + ai);
        if (ai > 0) graphEdge('attnReady:' + (ai - 1), 'attnArrive:' + ai);
        var gateTarget = attention.targets[ai];
        var gateMember = memberById[gateTarget.binding];
        var gateGroups = gateTarget.groups;
        var contentGate = !(isArray(gateGroups) && gateGroups.length === 0);
        if (gateMember && contentGate) {
          if (firstContentTarget[gateTarget.binding] === ai) {
            graphEdge('attnArrive:' + ai, 'start:' + gateTarget.binding);
          }
          if (!isArray(gateGroups)) {
            /* 整 Binding 默认门控：目标 ready 等成员 ready（Binding 级可判定）。 */
            graphEdge('ready:' + gateTarget.binding, 'attnReady:' + ai);
          }
          /* 非空 groups 的组级 ready 依赖 prepare 后才能判定，运行期联合检查。 */
        }
      }
    }
    function graphNodeLabel(id) {
      var parts = id.split(':');
      if (parts[0] === 'attnReady') return 'attention[' + parts[1] + '] ready';
      if (parts[0] === 'attnArrive') return 'attention[' + parts[1] + '] 到达';
      if (parts[0] === 'start') return 'Binding "' + parts.slice(1).join(':') + '" start';
      if (parts[0] === 'ready') return 'Binding "' + parts.slice(1).join(':') + '" ready';
      if (parts[0] === 'readyGroup') return 'Binding "' + parts[1] + '" 的组 "' + parts.slice(2).join(':') + '" ready';
      return id;
    }
    var visitState = {};
    var stack = [];
    var cycleReported = 0;
    function visit(id) {
      if (visitState[id] === 2 || cycleReported > 2) return;
      if (visitState[id] === 1) {
        var cycleStart = stack.indexOf(id);
        var cycle = stack.slice(cycleStart >= 0 ? cycleStart : 0).concat([id]);
        cycleReported += 1;
        issues.push(attention ? pathKey(path, 'attention') : pathKey(path, 'bindings'),
          'scene 联合依赖形成循环（waits-for，attention 顺序 + after/reveal）：' + cycle.map(graphNodeLabel).join(' → '));
        return;
      }
      visitState[id] = 1;
      stack.push(id);
      var next = edges[id] || [];
      for (var e = 0; e < next.length; e += 1) visit(next[e]);
      stack.pop();
      visitState[id] = 2;
    }
    Object.keys(edges).forEach(function (id) { visit(id); });
    var sceneResult = { bindings: members, timing: deepFreeze(timing), attention: attention };
    try {
      Object.defineProperty(sceneResult, 'path', { value: path, enumerable: false, writable: false, configurable: false });
    } catch (error) { /* ignore */ }
    return deepFreeze(sceneResult);
  }

  Internals.definitionCompile = {
    support: {
      own: own,
      isObject: isObject,
      isArray: isArray,
      isNonEmptyString: isNonEmptyString,
      repr: repr,
      messageOf: messageOf,
      pathKey: pathKey,
      pathIndex: pathIndex,
      deepFreeze: deepFreeze
    },
    createIssues: function () { return new Issues(); },
    resolveAdapters: resolveAdapters,
    compileMarks: compileMarks,
    compileActions: compileActions,
    compileTimingMap: compileTimingMap,
    compileScene: compileScene,
    NoteDemoDefinitionError: NoteDemoDefinitionError,
    timingDefaults: deepFreeze(Object.assign({}, SCENE_TIMING_DEFAULTS)),
    attentionContentTiming: deepFreeze(Object.assign({}, ATTENTION_CONTENT_TIMING)),
    attentionMotionDefaults: deepFreeze({ stepDuration: ATTENTION_STEP_DEFAULT, triggerHold: 0 })
  };
})(window);

/* ---- source: src/demo/definition-prepare.js ---- */
/* NoteDemo definition prepare — 组装并冻结可执行 plan（bindings / frames / transitions / initialFrameId）。
 * Scope: window.NoteDemoInternals.definitionPrepare
 * Depends on: NoteDemoInternals.definitionCompile（校验/编译与公共 timing 默认表）。
 * 经典脚本，无模块 / 无网络 / 无 eval；只做纯数据组装，不接触 DOM。 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var compileModule = Internals.definitionCompile;
  if (!compileModule ||
      typeof compileModule.compileScene !== 'function' ||
      typeof compileModule.createIssues !== 'function' ||
      !compileModule.support) {
    throw new Error('NoteDemo 核心加载顺序错误：definition 准备需要先加载 NoteDemoInternals.definitionCompile（src/demo/definition-compile.js）。');
  }

  var support = compileModule.support;
  var own = support.own;
  var isObject = support.isObject;
  var isArray = support.isArray;
  var isNonEmptyString = support.isNonEmptyString;
  var repr = support.repr;
  var messageOf = support.messageOf;
  var pathKey = support.pathKey;
  var pathIndex = support.pathIndex;
  var deepFreeze = support.deepFreeze;
  var compare = Internals.definitionCompare;
  if (!compare || typeof compare.compareModel !== 'function' || typeof compare.compareCues !== 'function') {
    throw new Error('NoteDemo 核心加载顺序错误：definition 准备需要先加载 NoteDemoInternals.definitionCompare（src/demo/definition-compare.js）。');
  }
  var Issues = compileModule.createIssues;
  var PLAN_VERSION = 1;

  function prepare(definition, options) {
    var opts = isObject(options) ? options : {};
    var issues = new Issues();
    var plan = {
      planVersion: PLAN_VERSION,
      initialFrameId: '',
      bindingOrder: [],
      bindings: {},
      frames: [],
      frameById: {},
      frameOrder: [],
      transitions: {},
      hasSceneTransitions: false,
      requiresPresentation: false
    };

    if (!isObject(definition)) {
      issues.push('definition', '必须是对象');
      throw issues.thrown();
    }

    var adapters = compileModule.resolveAdapters(opts.adapters);

    /* ---- bindings ---- */
    var bindingsInput = definition.bindings;
    var bindingIds = [];
    if (!isObject(bindingsInput)) {
      issues.push('bindings', '必须是非空对象');
    } else {
      bindingIds = Object.keys(bindingsInput);
      if (bindingIds.length === 0) issues.push('bindings', '不能为空（至少一个受控 binding）');
    }
    for (var b = 0; b < bindingIds.length; b += 1) {
      var bindingId = bindingIds[b];
      var bindingConfig = bindingsInput[bindingId];
      var bindingPath = pathKey('bindings', bindingId);
      plan.bindingOrder.push(bindingId);
      if (!isNonEmptyString(bindingId)) {
        issues.push('bindings', 'binding id 必须是非空字符串');
      }
      if (!isObject(bindingConfig)) {
        issues.push(bindingPath, '必须是对象');
        continue;
      }
      var adapterName = bindingConfig.adapter;
      var adapter = null;
      if (!isNonEmptyString(adapterName)) {
        issues.push(pathKey(bindingPath, 'adapter'), '必须是非空字符串（Adapter 名称）');
      } else if (!own(adapters, adapterName)) {
        issues.push(pathKey(bindingPath, 'adapter'),
          '未找到 Adapter ' + repr(adapterName) + '（可用：' + (Object.keys(adapters).join('、') || '无') + '）');
      } else {
        adapter = adapters[adapterName];
      }
      var slot = bindingConfig.slot;
      if (!isNonEmptyString(slot)) issues.push(pathKey(bindingPath, 'slot'), '必须是非空字符串（宿主 slot 名称）');
      var optionsValue = bindingConfig.options;
      if (optionsValue === undefined || optionsValue === null) optionsValue = {};
      else if (!isObject(optionsValue)) {
        issues.push(pathKey(bindingPath, 'options'), '必须是对象');
        optionsValue = {};
      }
      var instance = bindingConfig.instance;
      var hasInstance = instance !== undefined && instance !== null;
      var ownership = bindingConfig.ownership;
      if (ownership !== undefined && ownership !== 'owned' && ownership !== 'borrowed') {
        issues.push(pathKey(bindingPath, 'ownership'), "必须是 'owned' 或 'borrowed'");
        ownership = undefined;
      }
      if (hasInstance) {
        if (ownership === 'owned') {
          issues.push(pathKey(bindingPath, 'ownership'), '提供 instance 时 ownership 只能是 borrowed');
        }
        ownership = 'borrowed';
        if (adapter && typeof adapter.adopt !== 'function') {
          issues.push(pathKey(bindingPath, 'adapter'), '借用外部实例需要 Adapter 提供 adopt');
        }
      } else {
        if (ownership === 'borrowed') issues.push(pathKey(bindingPath, 'instance'), 'borrowed 必须提供 instance');
        if (ownership === undefined) ownership = 'owned';
        if (adapter && typeof adapter.mount !== 'function') {
          issues.push(pathKey(bindingPath, 'adapter'), 'Adapter 缺少 mount');
        }
      }
      if (adapter && typeof adapter.normalizeView !== 'function') {
        issues.push(pathKey(bindingPath, 'adapter'), 'Adapter 缺少 normalizeView');
      }
      var timingDefaults = {};
      if (adapter && adapter.sceneTimingDefaults !== undefined && adapter.sceneTimingDefaults !== null) {
        timingDefaults = compileModule.compileTimingMap(adapter.sceneTimingDefaults,
          pathKey(pathKey(bindingPath, 'adapter'), 'sceneTimingDefaults'), issues);
      }
      plan.bindings[bindingId] = Object.freeze({
        id: bindingId,
        adapterName: isNonEmptyString(adapterName) ? adapterName : '',
        adapter: adapter,
        slot: isNonEmptyString(slot) ? slot : '',
        options: optionsValue,
        instance: hasInstance ? instance : null,
        ownership: ownership,
        timingDefaults: deepFreeze(timingDefaults)
      });
    }

    /* ---- frames ---- */
    var framesInput = definition.frames;
    var frameIndexById = {};
    if (!isArray(framesInput)) {
      issues.push('frames', '必须是非空数组');
      framesInput = [];
    } else if (framesInput.length === 0) {
      issues.push('frames', '不能为空（至少一个 Frame）');
    }
    for (var f = 0; f < framesInput.length; f += 1) {
      var frame = framesInput[f];
      var framePath = pathIndex('frames', f);
      if (!isObject(frame)) {
        issues.push(framePath, '必须是对象');
        continue;
      }
      var frameId = frame.id;
      var usableId = false;
      if (!isNonEmptyString(frameId)) {
        issues.push(pathKey(framePath, 'id'), 'Frame id 必须是非空字符串');
      } else if (own(frameIndexById, frameId)) {
        issues.push(pathKey(framePath, 'id'), 'Frame id 重复：' + repr(frameId));
      } else {
        usableId = true;
      }
      var caption = frame.caption;
      if (caption === undefined || caption === null) caption = '';
      else if (typeof caption !== 'string') {
        issues.push(pathKey(framePath, 'caption'), '必须是字符串');
        caption = '';
      }
      var viewsInput = frame.views;
      var views = {};
      if (!isObject(viewsInput)) {
        issues.push(pathKey(framePath, 'views'), '必须是对象（覆盖全部 binding）');
      } else {
        var viewKeys = Object.keys(viewsInput);
        for (var vk = 0; vk < viewKeys.length; vk += 1) {
          if (!own(plan.bindings, viewKeys[vk])) {
            issues.push(pathKey(framePath, 'views') + '.' + viewKeys[vk],
              '是未知 binding（Frame 只能引用已定义的 binding）');
          }
        }
        for (var bo = 0; bo < plan.bindingOrder.length; bo += 1) {
          var viewBindingId = plan.bindingOrder[bo];
          var bindingEntry = plan.bindings[viewBindingId];
          var viewPath = pathKey(framePath, 'views') + '.' + viewBindingId;
          if (!own(viewsInput, viewBindingId)) {
            issues.push(viewPath, '缺少该 binding 的视图（Frame 必须显式覆盖全部 binding，不隐式继承）');
            continue;
          }
          if (!bindingEntry || !bindingEntry.adapter ||
              typeof bindingEntry.adapter.normalizeView !== 'function') {
            continue;
          }
          var view;
          try {
            view = bindingEntry.adapter.normalizeView(viewsInput[viewBindingId], bindingEntry.options);
          } catch (error) {
            issues.push(viewPath, 'normalizeView 失败：' + messageOf(error));
            continue;
          }
          if (!isObject(view) || !own(view, 'model')) {
            issues.push(viewPath, 'normalizeView 必须返回 {model,cues} 对象');
            continue;
          }
          var cues = own(view, 'cues') ? view.cues : {};
          views[viewBindingId] = deepFreeze({ model: view.model, cues: cues });
        }
      }
      var marks = [];
      if (frame.marks !== undefined && frame.marks !== null) {
        if (!isArray(frame.marks)) issues.push(pathKey(framePath, 'marks'), '必须是数组');
        else marks = compileModule.compileMarks(frame.marks, pathKey(framePath, 'marks'), plan.bindings, issues);
      }
      if (usableId) {
        var compiledFrame = deepFreeze({
          id: frameId,
          index: plan.frames.length,
          caption: caption,
          views: views,
          marks: marks
        });
        plan.frames.push(compiledFrame);
        plan.frameOrder.push(frameId);
        plan.frameById[frameId] = compiledFrame;
        frameIndexById[frameId] = compiledFrame.index;
      }
    }

    /* ---- initialFrameId ---- */
    var initial = null;
    var optionsInitial = opts.initialFrameId;
    var definitionInitial = definition.initialFrameId;
    if (optionsInitial !== undefined && optionsInitial !== null && optionsInitial !== '') {
      if (!isNonEmptyString(optionsInitial)) {
        issues.push('initialFrameId', 'options.initialFrameId 必须是非空字符串');
      } else if (!own(frameIndexById, optionsInitial)) {
        issues.push('initialFrameId', 'options.initialFrameId 引用了不存在的 Frame ' + repr(optionsInitial));
      } else {
        initial = optionsInitial;
      }
    } else if (definitionInitial !== undefined && definitionInitial !== null && definitionInitial !== '') {
      if (!isNonEmptyString(definitionInitial)) {
        issues.push('definition.initialFrameId', '必须是非空字符串');
      } else if (!own(frameIndexById, definitionInitial)) {
        issues.push('definition.initialFrameId', '引用了不存在的 Frame ' + repr(definitionInitial));
      } else {
        initial = definitionInitial;
      }
    } else if (plan.frameOrder.length) {
      initial = plan.frameOrder[0];
    }

    /* ---- transitions ---- */
    var transitionsInput = definition.transitions;
    var seenFrom = {};
    if (transitionsInput !== undefined && transitionsInput !== null) {
      if (!isArray(transitionsInput)) {
        issues.push('transitions', '必须是数组');
      } else {
        for (var t = 0; t < transitionsInput.length; t += 1) {
          var transition = transitionsInput[t];
          var transitionPath = pathIndex('transitions', t);
          if (!isObject(transition)) {
            issues.push(transitionPath, '必须是对象');
            continue;
          }
          var from = transition.from;
          var to = transition.to;
          var fromValid = false;
          var toValid = false;
          if (!isNonEmptyString(from)) {
            issues.push(pathKey(transitionPath, 'from'), '必须是非空字符串');
          } else if (!own(frameIndexById, from)) {
            issues.push(pathKey(transitionPath, 'from'), '引用了不存在的 Frame ' + repr(from));
          } else if (own(seenFrom, from)) {
            issues.push(pathKey(transitionPath, 'from'), '同一 from 不得重复定义过渡：' + repr(from));
          } else {
            fromValid = true;
          }
          if (!isNonEmptyString(to)) {
            issues.push(pathKey(transitionPath, 'to'), '必须是非空字符串');
          } else if (!own(frameIndexById, to)) {
            issues.push(pathKey(transitionPath, 'to'), '引用了不存在的 Frame ' + repr(to));
          } else {
            toValid = true;
          }
          if (fromValid && toValid && frameIndexById[to] !== frameIndexById[from] + 1) {
            issues.push(pathKey(transitionPath, 'to'), '必须指向 from 的下一个 Frame（只支持相邻前进过渡）');
          }
          if (fromValid) seenFrom[from] = true;
          var actions = [];
          if (transition.actions !== undefined && transition.actions !== null) {
            if (!isArray(transition.actions)) issues.push(pathKey(transitionPath, 'actions'), '必须是数组');
            else actions = compileModule.compileActions(transition.actions, pathKey(transitionPath, 'actions'), plan.bindings, issues);
          }
          var scene = null;
          if (transition.scene !== undefined && transition.scene !== null) {
            scene = compileModule.compileScene(transition.scene, pathKey(transitionPath, 'scene'), plan.bindings, issues);
            if (actions.length) {
              issues.push(transitionPath, 'scene 与 actions/parallel 互斥：同一过渡只能选一种路径');
            }
            if (transition.marks !== undefined && transition.marks !== null && isArray(transition.marks) && transition.marks.length) {
              issues.push(pathKey(transitionPath, 'marks'), 'scene 路径的关系提示请写在目标 Frame 的 marks 中（稳定停点仍可见）');
            }
            if (scene && fromValid && toValid) {
              var fromFrame = plan.frameById[from];
              var toFrame = plan.frameById[to];
              var sceneMemberIds = {};
              for (var sbi = 0; sbi < scene.bindings.length; sbi += 1) {
                var sceneMember = scene.bindings[sbi];
                sceneMemberIds[sceneMember.binding] = true;
                var fromHas = fromFrame && fromFrame.views && own(fromFrame.views, sceneMember.binding);
                var toHas = toFrame && toFrame.views && own(toFrame.views, sceneMember.binding);
                if (!toHas) {
                  issues.push(pathKey(transitionPath, 'scene'), '目标 Frame 缺少参与 binding ' + repr(sceneMember.binding) + ' 的视图');
                } else if (sceneMember.mode === 'layout' && !fromHas) {
                  issues.push(pathKey(transitionPath, 'scene'), 'layout 参与 binding ' + repr(sceneMember.binding) + ' 在来源 Frame 缺少视图');
                }
              }
              /* 来源/目标不同的 Binding 必须在 scene 中显式声明，否则会被 static 提前恢复，破坏“先收齐旧布局再统一提交”。 */
              if (fromFrame && fromFrame.views && toFrame && toFrame.views) {
                for (var cbi = 0; cbi < plan.bindingOrder.length; cbi += 1) {
                  var changedBinding = plan.bindingOrder[cbi];
                  if (own(sceneMemberIds, changedBinding)) continue;
                  var fromView = own(fromFrame.views, changedBinding) ? fromFrame.views[changedBinding] : null;
                  var toView = own(toFrame.views, changedBinding) ? toFrame.views[changedBinding] : null;
                  if (!fromView || !toView) continue;
                  var modelChanged = compare.compareModel(fromView.model, toView.model);
                  var cuesChanged = compare.compareCues(fromView.cues, toView.cues);
                  if (modelChanged || cuesChanged) {
                    issues.push(pathKey(transitionPath, 'scene'),
                      'Binding ' + repr(changedBinding) + ' 在来源/目标的视图不同，必须显式列入 scene（layout/cut/reveal）；未变化的 Binding 才可以省略');
                  }
                }
              }
            }
          }
          var transitionMarks = [];
          if (transition.marks !== undefined && transition.marks !== null) {
            if (!isArray(transition.marks)) issues.push(pathKey(transitionPath, 'marks'), '必须是数组');
            else transitionMarks = compileModule.compileMarks(transition.marks, pathKey(transitionPath, 'marks'), plan.bindings, issues);
          }
          if (fromValid && toValid && !own(plan.transitions, from)) {
            plan.transitions[from] = deepFreeze({
              from: from,
              to: to,
              actions: actions,
              marks: transitionMarks,
              scene: scene
            });
            if (scene) {
              plan.hasSceneTransitions = true;
              var targetFrameForScene = plan.frameById[to];
              if (targetFrameForScene && isArray(targetFrameForScene.marks) && targetFrameForScene.marks.length > 0) {
                plan.requiresPresentation = true;
              }
              if (scene.attention) plan.requiresPresentation = true;
            }
          }
        }
      }
    }

    if (issues.has()) throw issues.thrown();

    plan.initialFrameId = initial || plan.frameOrder[0] || '';
    plan.bindingOrder = Object.freeze(plan.bindingOrder);
    plan.frames = Object.freeze(plan.frames);
    plan.frameOrder = Object.freeze(plan.frameOrder);
    plan.frameById = Object.freeze(plan.frameById);
    plan.bindings = Object.freeze(plan.bindings);
    plan.transitions = Object.freeze(plan.transitions);
    return Object.freeze(plan);
  }

  Internals.definitionPrepare = {
    prepare: prepare
  };
})(window);

/* ---- source: src/demo/definition.js ---- */
/* NoteDemo definition — 对外组装定义编译、规范化比较与计划准备接口。
 * Scope: window.NoteDemoInternals.definition
 * Depends on: definition-compare.js（比较）、definition-compile.js（校验/编译）、
 *             definition-prepare.js（plan 组装），三者必须先于本文件加载。
 * 经典脚本，无模块 / 无网络 / 无 eval。 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};

  function requireModule(name, detail, check) {
    var module = Internals[name];
    if (!module || !check(module)) {
      throw new Error('NoteDemo 核心加载顺序错误：definition 需要先加载 ' + detail + '。');
    }
    return module;
  }

  var compare = requireModule('definitionCompare', 'NoteDemoInternals.definitionCompare（src/demo/definition-compare.js）', function (module) {
    return typeof module.compareModel === 'function' &&
      typeof module.compareCues === 'function' &&
      typeof module.describeDiff === 'function';
  });
  var compile = requireModule('definitionCompile', 'NoteDemoInternals.definitionCompile（src/demo/definition-compile.js）', function (module) {
    return typeof module.compileScene === 'function' &&
      typeof module.createIssues === 'function' &&
      module.timingDefaults != null;
  });
  var prepare = requireModule('definitionPrepare', 'NoteDemoInternals.definitionPrepare（src/demo/definition-prepare.js）', function (module) {
    return typeof module.prepare === 'function';
  });

  Internals.definition = {
    prepare: prepare.prepare,
    compareModel: compare.compareModel,
    compareCues: compare.compareCues,
    describeDiff: compare.describeDiff,
    timingDefaults: compile.timingDefaults,
    attentionContentTiming: compile.attentionContentTiming,
    attentionMotionDefaults: compile.attentionMotionDefaults,
    NoteDemoDefinitionError: compile.NoteDemoDefinitionError
  };
})(window);

/* ---- source: src/demo/effects.js ---- */
/* NoteDemo 私有效果工具 — WAAPI 句柄、局部值交换与连续 cue 差分。
 * Scope: window.NoteDemoInternals.effects
 * Depends on: NoteDemoInternals.definition（只读取已冻结的公共 timing 默认表）。
 * 私有执行文件，不暴露给笔记作者；scene 统一创建/启动/取消句柄，Adapter 只提交 EffectSpec。
 * 经典脚本，无模块 / 无网络 / 无 eval。 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var hasOwn = Object.prototype.hasOwnProperty;
  var CUE_PROPS = {
    backgroundColor: true,
    borderTopColor: true,
    borderRightColor: true,
    borderBottomColor: true,
    borderLeftColor: true,
    outlineColor: true,
    outlineWidth: true,
    outlineOffset: true,
    color: true,
    opacity: true,
    boxShadow: true
  };

  function own(object, key) {
    return object != null && hasOwn.call(Object(object), key);
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function isElement(value) {
    return !!value && value.nodeType === 1;
  }

  function messageOf(error) {
    if (error == null) return '';
    if (typeof error === 'string') return error;
    if (error.message != null) return String(error.message);
    return String(error);
  }

  function noop() {}

  function makeError(message, details) {
    var error = new Error(message);
    error.name = 'NoteDemoEffectError';
    if (details && typeof details === 'object') error.details = details;
    return error;
  }

  function effectLabel(meta) {
    var details = isObject(meta) ? meta : {};
    var parts = [];
    if (details.frameId != null) parts.push('Frame "' + String(details.frameId) + '"');
    if (details.bindingId != null) parts.push('Binding "' + String(details.bindingId) + '"');
    if (details.effect != null) parts.push('effect "' + String(details.effect) + '"');
    return parts.length ? '（' + parts.join(' / ') + '）' : '';
  }

  function fail(message, meta, cause) {
    var error = makeError('scene 效果失败' + effectLabel(meta) + '：' + message, meta);
    if (cause !== undefined) error.cause = cause;
    return error;
  }

  /* 公共 timing 默认表只维护在 definition 一处；缺少 definition 时给出加载顺序错误，
   * 不再静默回退到第二份默认值（两份默认值会随维护漂移）。 */
  function timingDefaults() {
    var definition = Internals.definition;
    if (!definition || !isObject(definition.timingDefaults)) {
      throw new Error('NoteDemo 核心加载顺序错误：effects 需要先加载 NoteDemoInternals.definition（src/demo/definition.js）。');
    }
    return definition.timingDefaults;
  }

  function mergeTiming(profile, sceneTiming, memberTiming) {
    var output = {};
    var defaults = timingDefaults();
    Object.keys(defaults).forEach(function (key) { output[key] = defaults[key]; });
    [profile, sceneTiming, memberTiming].forEach(function (input) {
      if (!isObject(input)) return;
      Object.keys(input).forEach(function (key) {
        if (own(defaults, key)) output[key] = input[key];
      });
    });
    return output;
  }

  function timeValue(settings, key, fallback) {
    if (settings && typeof settings[key] === 'number' && isFinite(settings[key]) && settings[key] >= 0) {
      return settings[key];
    }
    return fallback;
  }

  function createHandle(element, keyframes, options, meta) {
    var settings = isObject(options) ? options : {};
    if (!isElement(element)) throw fail('目标不是有效元素。', meta);
    if (typeof element.animate !== 'function') throw fail('目标元素不支持 Web Animations。', meta);
    if (keyframes == null) throw fail('缺少关键帧。', meta);
    var animation;
    try {
      animation = element.animate(keyframes, {
        duration: timeValue(settings, 'duration', timingDefaults().enterDuration),
        delay: timeValue(settings, 'delay', 0),
        easing: typeof settings.easing === 'string' && settings.easing !== ''
          ? settings.easing : timingDefaults().easing,
        fill: settings.fill == null ? 'none' : settings.fill
      });
    } catch (error) {
      throw fail('创建动画失败：' + messageOf(error), meta, error);
    }
    if (!animation || typeof animation.play !== 'function') {
      throw fail('浏览器没有返回可用 Animation 句柄。', meta);
    }
    if (settings.paused === true) {
      try {
        animation.pause();
        animation.currentTime = 0;
      } catch (error) {
        try { animation.cancel(); } catch (cancelError) { /* 继续抛出原始错误 */ }
        throw fail('预置暂停起点失败：' + messageOf(error), meta, error);
      }
    }

    var settled = false;
    var cancelRequested = false;
    var resolveFinished;
    var rejectFinished;
    var finished = new Promise(function (resolve, reject) {
      resolveFinished = resolve;
      rejectFinished = reject;
    });
    /* 内部挂一个消费用的 catch；调用方仍拿到原始 Promise。 */
    finished.catch(noop);

    function settleOk() {
      if (settled) return;
      settled = true;
      resolveFinished(true);
    }

    function settleCancelled() {
      if (settled) return;
      settled = true;
      resolveFinished(false);
    }

    function settleFailed(error) {
      if (settled) return;
      settled = true;
      rejectFinished(error);
    }

    if (animation.finished && typeof animation.finished.then === 'function') {
      animation.finished.then(function () {
        if (cancelRequested) settleCancelled();
        else settleOk();
      }, function (error) {
        if (cancelRequested) settleCancelled();
        else settleFailed(fail('动画被意外取消或失效：' + messageOf(error), meta, error));
      });
    } else {
      animation.onfinish = function () { settleOk(); };
      animation.oncancel = function () {
        if (cancelRequested) settleCancelled();
        else settleFailed(fail('动画被意外取消。', meta));
      };
    }

    return {
      el: element,
      animation: animation,
      finished: finished,
      meta: isObject(meta) ? meta : {},
      play: function () {
        if (settled || cancelRequested) return;
        try {
          if (animation.playState === 'paused' || animation.playState === 'idle') animation.play();
        } catch (error) {
          settleFailed(fail('启动动画失败：' + messageOf(error), meta, error));
          throw fail('启动动画失败：' + messageOf(error), meta, error);
        }
      },
      cancel: function () {
        if (settled) {
          try { if (animation.playState !== 'idle') animation.cancel(); } catch (error) { /* 已失效 */ }
          return;
        }
        cancelRequested = true;
        try {
          if (animation.playState !== 'idle') animation.cancel();
        } catch (error) {
          settleFailed(fail('取消动画失败：' + messageOf(error), meta, error));
          return;
        }
        settleCancelled();
      }
    };
  }



  /* ---------------- 来源可见性保持（视觉交接） ---------------- */

  function isConnectedElement(element) {
    if (!element) return false;
    if (typeof element.isConnected === 'boolean') return element.isConnected;
    return !!(global.document && global.document.documentElement && global.document.documentElement.contains(element));
  }

  function computedVisibility(element) {
    var fallback = { opacity: 1, visibility: 'visible', display: '' };
    if (!element || !global.getComputedStyle) return fallback;
    var computed;
    try { computed = global.getComputedStyle(element); } catch (error) { return fallback; }
    if (!computed) return fallback;
    return {
      opacity: computed.opacity,
      visibility: computed.visibility,
      display: computed.display
    };
  }

  function visibilityHidden(state) {
    if (!state) return false;
    var opacity = state.opacity === '' || state.opacity == null ? 1 : Number(state.opacity);
    if (!isFinite(opacity)) opacity = 1;
    return state.visibility === 'hidden' || state.visibility === 'collapse' ||
      state.display === 'none' || !(opacity > 0.001);
  }

  /* commit 前捕获来源元素的计算可见状态与调用前内联值；返回幂等 token。 */
  function captureVisibility(elements) {
    var token = { items: [], held: false, released: false };
    var seen = [];
    (Array.isArray(elements) ? elements : []).forEach(function (element) {
      if (!isElement(element) || seen.indexOf(element) >= 0) return;
      seen.push(element);
      var style = element.style || {};
      token.items.push({
        el: element,
        connected: isConnectedElement(element),
        source: computedVisibility(element),
        inline: {
          opacity: style.opacity,
          visibility: style.visibility,
          display: style.display
        }
      });
    });
    return token;
  }

  /* commit 后调用：元素仍连接、来源本来可见、目标状态压成不可见时，用内联恢复来源可见状态。
   * 不克隆/不替换 DOM；已持有/已释放/断开元素幂等跳过。 */
  function holdVisibility(token) {
    if (!token || token.released || token.held) return token;
    token.held = true;
    for (var i = 0; i < token.items.length; i += 1) {
      var item = token.items[i];
      var element = item.el;
      if (!element || !isConnectedElement(element)) continue;
      if (visibilityHidden(item.source)) continue;
      if (!visibilityHidden(computedVisibility(element))) continue;
      try {
        element.style.opacity = item.source.opacity === '' || item.source.opacity == null ? '1' : item.source.opacity;
        if (item.source.visibility) element.style.visibility = item.source.visibility;
        if (item.source.display) element.style.display = item.source.display;
      } catch (error) { /* 单个元素失败不阻断交接 */ }
    }
    return token;
  }

  /* 取消/完成/首次内容轨道启动时调用：恢复调用前的内联值（幂等、可重复）。 */
  function releaseVisibility(token) {
    if (!token || token.released) return token;
    token.released = true;
    for (var i = 0; i < token.items.length; i += 1) {
      var item = token.items[i];
      var element = item.el;
      if (!element || !element.style) continue;
      try {
        element.style.opacity = item.inline.opacity == null ? '' : item.inline.opacity;
        element.style.visibility = item.inline.visibility == null ? '' : item.inline.visibility;
        element.style.display = item.inline.display == null ? '' : item.inline.display;
      } catch (error) { /* 单个元素失败不阻断清理 */ }
    }
    token.items = [];
    return token;
  }

  /* ---------------- 进度效果（rAF 句柄，与 WAAPI 句柄同语义） ---------------- */

  function linearEase(progress) { return progress; }

  function cubicBezierEase(x1, y1, x2, y2) {
    function sample(t, a1, a2) {
      var c = 3 * a1;
      var b = 3 * (a2 - a1) - c;
      var a = 1 - c - b;
      return ((a * t + b) * t + c) * t;
    }
    function sampleDerivative(t, a1, a2) {
      var c = 3 * a1;
      var b = 3 * (a2 - a1) - c;
      var a = 1 - c - b;
      return (3 * a * t + 2 * b) * t + c;
    }
    function solveX(x) {
      var t = x;
      for (var i = 0; i < 8; i += 1) {
        var error = sample(t, x1, x2) - x;
        if (Math.abs(error) < 1e-6) return t;
        var derivative = sampleDerivative(t, x1, x2);
        if (Math.abs(derivative) < 1e-6) break;
        t -= error / derivative;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
      }
      var low = 0;
      var high = 1;
      t = x;
      for (var b = 0; b < 20; b += 1) {
        var value = sample(t, x1, x2);
        if (Math.abs(value - x) < 1e-6) return t;
        if (value < x) low = t;
        else high = t;
        t = (low + high) / 2;
      }
      return t;
    }
    return function (progress) {
      if (!(progress > 0)) return 0;
      if (progress >= 1) return 1;
      return sample(solveX(progress), y1, y2);
    };
  }

  var EASING_KEYWORDS = {
    linear: [0, 0, 1, 1],
    ease: [0.25, 0.1, 0.25, 1],
    'ease-in': [0.42, 0, 1, 1],
    'ease-out': [0, 0, 0.58, 1],
    'ease-in-out': [0.42, 0, 0.58, 1]
  };

  function easingFunction(easing) {
    if (easing == null || easing === '') return linearEase;
    var value = String(easing).trim();
    if (own(EASING_KEYWORDS, value)) {
      var keyword = EASING_KEYWORDS[value];
      return cubicBezierEase(keyword[0], keyword[1], keyword[2], keyword[3]);
    }
    var match = /^cubic-bezier\(([^)]*)\)$/.exec(value);
    if (match) {
      var parts = match[1].split(',').map(function (part) { return Number(part.trim()); });
      if (parts.length === 4 && parts.every(function (part) { return isFinite(part); })) {
        return cubicBezierEase(parts[0], parts[1], parts[2], parts[3]);
      }
    }
    /* steps()/spring 等非连续缓动不在这里展开；进度效果回退线性，实际视觉由 update 自行处理。 */
    return linearEase;
  }

  function nowMs() {
    if (global.performance && typeof global.performance.now === 'function') return global.performance.now();
    return Date.now();
  }

  function rafRequest(callback) {
    if (typeof global.requestAnimationFrame === 'function') return global.requestAnimationFrame(callback);
    return global.setTimeout(callback, 16);
  }

  function rafCancel(id) {
    if (typeof global.cancelAnimationFrame === 'function') {
      try { global.cancelAnimationFrame(id); } catch (error) { /* ignore */ }
    } else {
      try { global.clearTimeout(id); } catch (error) { /* ignore */ }
    }
  }

  /* EffectSpec.type === 'progress'：不在 WAAPI 上伪造进度，用 rAF 驱动 update(p)；
   * 句柄语义与 createHandle 一致（finished resolve true/false、reject 失败、cancel 幂等）。 */
  function createProgressHandle(spec, meta) {
    var settings = isObject(spec) ? spec : {};
    if (typeof settings.update !== 'function') throw fail('progress 效果缺少 update(progress) 函数。', meta);
    var duration = settings.duration;
    if (typeof duration !== 'number' || !isFinite(duration) || duration < 0) {
      throw fail('progress 效果 duration 必须是大于等于 0 的有限数字。', meta);
    }
    var delay = typeof settings.delay === 'number' && isFinite(settings.delay) && settings.delay >= 0 ? settings.delay : 0;
    var ease = easingFunction(settings.easing);
    var settled = false;
    var cancelRequested = false;
    var playing = false;
    var rafId = 0;
    var startTime = 0;
    var resolveFinished;
    var rejectFinished;
    var finished = new Promise(function (resolve, reject) {
      resolveFinished = resolve;
      rejectFinished = reject;
    });
    finished.catch(noop);

    function settleOk() {
      if (settled) return;
      settled = true;
      resolveFinished(true);
    }
    function settleCancelled() {
      if (settled) return;
      settled = true;
      resolveFinished(false);
    }
    function settleFailed(error) {
      if (settled) return;
      settled = true;
      rejectFinished(error);
    }
    function tick() {
      rafId = 0;
      if (settled || cancelRequested) return;
      var elapsed = nowMs() - startTime - delay;
      if (elapsed < 0) {
        rafId = rafRequest(tick);
        return;
      }
      var progress = duration <= 0 ? 1 : Math.min(1, elapsed / duration);
      try {
        settings.update(ease(progress));
      } catch (error) {
        settleFailed(fail('progress update 失败：' + messageOf(error), meta, error));
        return;
      }
      if (progress >= 1) {
        settleOk();
        return;
      }
      rafId = rafRequest(tick);
    }

    /* 暂停起点：创建时先画 p=0，保证未启动内容保持来源视觉。 */
    try {
      settings.update(ease(0));
    } catch (error) {
      throw fail('progress 预置 p=0 失败：' + messageOf(error), meta, error);
    }

    return {
      progress: true,
      finished: finished,
      meta: isObject(meta) ? meta : {},
      play: function () {
        if (settled || cancelRequested || playing) return;
        playing = true;
        startTime = nowMs();
        rafId = rafRequest(tick);
      },
      cancel: function () {
        if (settled) return;
        cancelRequested = true;
        if (rafId) rafCancel(rafId);
        rafId = 0;
        settleCancelled();
      }
    };
  }

  function rectOf(element) {
    if (!element || typeof element.getBoundingClientRect !== 'function') return null;
    var rect = element.getBoundingClientRect();
    if (!rect) return null;
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
  }

  function copyTypography(source, target) {
    if (!source || !target || !global.getComputedStyle) return;
    var computed = global.getComputedStyle(source);
    if (!computed) return;
    ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing',
      'textAlign', 'textTransform', 'color', 'whiteSpace', 'wordBreak', 'overflowWrap'].forEach(function (prop) {
      if (computed[prop]) target.style[prop] = computed[prop];
    });
  }

  function stripClone(node) {
    if (!node || !isElement(node)) return node;
    node.removeAttribute('id');
    node.removeAttribute('data-mark');
    node.removeAttribute('aria-label');
    node.setAttribute('aria-hidden', 'true');
    if (node.querySelectorAll) {
      Array.prototype.forEach.call(node.querySelectorAll('[id]'), function (item) { item.removeAttribute('id'); });
      Array.prototype.forEach.call(node.querySelectorAll('[aria-label]'), function (item) { item.setAttribute('aria-hidden', 'true'); });
      Array.prototype.forEach.call(node.querySelectorAll('[tabindex]'), function (item) { item.removeAttribute('tabindex'); });
    }
    return node;
  }

  function captureContent(input) {
    var source = isObject(input) ? input : {};
    var valueEl = source.valueEl;
    var carrier = source.carrier;
    if (!isElement(valueEl) || !isElement(carrier)) return null;
    var valueRect = rectOf(valueEl);
    var carrierRect = rectOf(carrier);
    if (!valueRect || !carrierRect) return null;
    var clone = null;
    try {
      clone = stripClone(valueEl.cloneNode(true));
    } catch (error) {
      clone = null;
    }
    var visible = valueRect.width > 0.5 || valueRect.height > 0.5;
    return {
      valueEl: valueEl,
      carrier: carrier,
      clone: clone,
      visible: visible,
      localBox: {
        left: valueRect.left - carrierRect.left,
        top: valueRect.top - carrierRect.top,
        width: valueRect.width,
        height: valueRect.height
      }
    };
  }

  function ensureLocalCarrier(carrier) {
    if (!isElement(carrier)) return noop;
    var previous = { position: carrier.style.position || '' };
    if (global.getComputedStyle) {
      try {
        if (global.getComputedStyle(carrier).position === 'static') carrier.style.position = 'relative';
      } catch (error) { /* 保持原样 */ }
    }
    return function restore() {
      try { carrier.style.position = previous.position; } catch (error) { /* ignore */ }
    };
  }

  function createGhost(input) {
    var source = isObject(input) ? input : {};
    var target = isObject(source.target) ? source.target : {};
    var carrier = target.carrier || source.carrier;
    if (!isElement(carrier) || !source.source || !source.source.clone || typeof global.document === 'undefined') return null;
    var ghost = global.document.createElement('span');
    var className = source.className || 'note-demo-value-ghost';
    ghost.className = className;
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('data-value-ghost', 'true');
    ghost.style.position = 'absolute';
    ghost.style.left = source.source.localBox.left + 'px';
    ghost.style.top = source.source.localBox.top + 'px';
    ghost.style.width = source.source.localBox.width + 'px';
    ghost.style.height = source.source.localBox.height + 'px';
    ghost.style.boxSizing = 'border-box';
    ghost.style.display = source.display || 'flex';
    ghost.style.alignItems = source.alignItems || 'center';
    ghost.style.justifyContent = source.justifyContent || 'center';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = source.zIndex || '2';
    copyTypography(source.source.valueEl, ghost);
    try {
      ghost.appendChild(source.source.clone);
    } catch (error) {
      return null;
    }
    var restoreCarrier = ensureLocalCarrier(carrier);
    try {
      carrier.appendChild(ghost);
    } catch (error) {
      restoreCarrier();
      return null;
    }
    return {
      el: ghost,
      cleanup: function () {
        try { if (ghost.parentNode) ghost.parentNode.removeChild(ghost); } catch (error) { /* ignore */ }
        restoreCarrier();
      }
    };
  }

  function planValueSwap(input) {
    var options = isObject(input) ? input : {};
    var source = options.source;
    var target = isObject(options.target) ? options.target : {};
    var timing = isObject(options.timing) ? options.timing : mergeTiming();
    var recipe = isObject(options.recipe) ? options.recipe : {};
    var specs = [];
    var cleanup = noop;
    if (source && source.visible && recipe.ghostClass && target.carrier) {
      var ghost = createGhost({
        source: source,
        target: target,
        className: recipe.ghostClass,
        display: recipe.ghostDisplay,
        alignItems: recipe.ghostAlignItems,
        justifyContent: recipe.ghostJustifyContent,
        zIndex: recipe.ghostZIndex
      });
      if (ghost) {
        cleanup = ghost.cleanup;
        specs.push({
          el: ghost.el,
          keyframes: recipe.ghostKeyframes || [
            { opacity: '1', transform: 'translateY(0)' },
            { opacity: '1', transform: 'translateY(0)', offset: 0.5 },
            { opacity: '0', transform: 'translateY(-8px)' }
          ],
          options: {
            duration: timeValue(recipe, 'ghostDuration', timing.valueSwapDuration),
            delay: timeValue(recipe, 'ghostDelay', timing.valueSwapDelay),
            easing: recipe.ghostEasing || timing.easing,
            fill: 'backwards'
          },
          cleanupEl: ghost.el,
          gate: 'finish'
        });
      }
    }
    if (isElement(target.valueEl) && recipe.targetKeyframes) {
      specs.push({
        el: target.valueEl,
        keyframes: recipe.targetKeyframes,
        options: {
          duration: timeValue(recipe, 'targetDuration', timing.valueSwapDuration),
          delay: timeValue(recipe, 'targetDelay', timing.valueSwapDelay),
          easing: recipe.targetEasing || 'linear',
          fill: 'backwards'
        },
        gate: recipe.targetGate === 'finish' ? 'finish' : 'ready'
      });
    }
    return { specs: specs, cleanup: cleanup };
  }

  function captureStyles(targets, properties) {
    var output = {};
    var props = Array.isArray(properties) ? properties : Object.keys(CUE_PROPS);
    (Array.isArray(targets) ? targets : []).forEach(function (target) {
      if (!target || target.id == null || !isElement(target.el)) return;
      var computed = global.getComputedStyle ? global.getComputedStyle(target.el) : null;
      if (!computed) return;
      var style = {};
      props.forEach(function (prop) {
        if (CUE_PROPS[prop] && computed[prop] != null) style[prop] = String(computed[prop]);
      });
      output[String(target.id)] = { el: target.el, style: style };
    });
    return output;
  }

  function planCueChanges(input) {
    var options = isObject(input) ? input : {};
    var source = isObject(options.source) ? options.source : {};
    var targets = Array.isArray(options.targets) ? options.targets : [];
    var timing = isObject(options.timing) ? options.timing : mergeTiming();
    var properties = Array.isArray(options.properties) ? options.properties : Object.keys(CUE_PROPS);
    var specs = [];
    targets.forEach(function (target) {
      if (!target || target.id == null || !isElement(target.el)) return;
      var before = source[String(target.id)];
      if (!before || !isObject(before.style)) return;
      var computed = global.getComputedStyle ? global.getComputedStyle(target.el) : null;
      if (!computed) return;
      var from = {};
      var to = {};
      var changed = false;
      properties.forEach(function (prop) {
        if (!CUE_PROPS[prop]) return;
        var a = before.style[prop] == null ? '' : before.style[prop];
        var b = computed[prop] == null ? '' : String(computed[prop]);
        if (a !== b) {
          from[prop] = a;
          to[prop] = b;
          changed = true;
        }
      });
      if (!changed) return;
      var keyframes = [Object.assign({ offset: 0 }, from), Object.assign({ offset: 1 }, to)];
      specs.push({
        el: target.el,
        keyframes: keyframes,
        options: {
          duration: timeValue(options, 'duration', timing.cueDuration),
          easing: options.easing || timing.easing,
          fill: 'backwards'
        },
        gate: options.gate === 'finish' ? 'finish' : 'ready'
      });
    });
    return specs;
  }

  Internals.effects = {
    mergeTiming: mergeTiming,
    createHandle: createHandle,
    captureVisibility: captureVisibility,
    holdVisibility: holdVisibility,
    releaseVisibility: releaseVisibility,
    captureContent: captureContent,
    createGhost: createGhost,
    planValueSwap: planValueSwap,
    captureStyles: captureStyles,
    planCueChanges: planCueChanges,
    rectOf: rectOf,
    createProgressHandle: createProgressHandle
  };
})(window);

/* ---- source: src/demo/scene-geometry.js ---- */
/* NoteDemo scene geometry — 布局载体的真实矩形与 translate-only FLIP 原语。
 * Scope: window.NoteDemoInternals.sceneGeometry
 * Depends on: NoteDemoInternals.effects（rectOf / createHandle）。
 * 只做位移补偿：尺寸/字体变化不通过 scale 拉伸内层文字；不接触模型与状态。
 * 经典脚本，无模块 / 无网络 / 无 eval。 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};

  function effectsModule() {
    var effects = Internals.effects;
    if (!effects || typeof effects.createHandle !== 'function' || typeof effects.rectOf !== 'function') {
      throw new Error('NoteDemo 核心加载顺序错误：scene 几何需要先加载 NoteDemoInternals.effects（src/demo/effects.js）。');
    }
    return effects;
  }

  function isArray(value) {
    return Array.isArray(value);
  }

  function rectOf(element) {
    return effectsModule().rectOf(element);
  }

  /* 旧 rect -> 当前布局的反向位移；两者几乎相同则不生成空 FLIP。 */
  function flipElement(element, fromRect, duration, easing, meta) {
    if (!element || !fromRect) return null;
    var effects = effectsModule();
    var target = effects.rectOf(element);
    if (!target) return null;
    var dx = fromRect.left - target.left;
    var dy = fromRect.top - target.top;
    if (!isFinite(dx)) dx = 0;
    if (!isFinite(dy)) dy = 0;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return null;
    return effects.createHandle(element, [
      { transform: 'translate3d(' + dx + 'px, ' + dy + 'px, 0)' },
      { transform: 'translate3d(0px, 0px, 0)' }
    ], { duration: duration, easing: easing, paused: true }, meta);
  }

  /* commit 前冻结 layout 参与者的旧位置；按逻辑 target.id 记录，commit 后再交给 FLIP。 */
  function captureSourceRects(members) {
    (isArray(members) ? members : []).forEach(function (member) {
      member.sourceRects = {};
      if (!member || member.mode !== 'layout') return;
      var targets;
      try { targets = member.prepared.targets(); } catch (error) { targets = []; }
      if (!isArray(targets)) targets = [];
      targets.forEach(function (target) {
        if (!target || target.id == null) return;
        var rect = rectOf(target.layoutEl);
        if (rect) member.sourceRects[String(target.id)] = rect;
      });
    });
  }

  Internals.sceneGeometry = {
    rectOf: rectOf,
    flipElement: flipElement,
    captureSourceRects: captureSourceRects
  };
})(window);

/* ---- source: src/demo/scene-effects.js ---- */
/* NoteDemo scene effects — 一次 scene 运行的 WAAPI/进度句柄、布局 FLIP、揭示与标记渐入。
 * Scope: window.NoteDemoInternals.sceneEffects
 * Depends on: NoteDemoInternals.effects（WAAPI/进度句柄、计时）、NoteDemoInternals.sceneGeometry（FLIP）。
 * 私有执行文件：EffectScope 拥有本次运行创建的全部句柄与临时视觉，取消/完成统一释放；
 * 不决定 after、不拥有第二套会话状态、不扫描宿主全部动画。
 * 效果按“轨道”归集：未分组 Binding 一条 default 轨道；分组 Binding 为 layout 轨道 + 每个效果组一条轨道。
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

  function isElement(value) {
    return !!value && value.nodeType === 1;
  }

  function messageOf(error) {
    if (error == null) return '';
    if (typeof error === 'string') return error;
    if (error.message != null) return String(error.message);
    return String(error);
  }

  function makeSceneError(message, details) {
    var error = new Error(message);
    error.name = 'NoteDemoSceneError';
    if (details && typeof details === 'object') error.details = details;
    return error;
  }

  function effectsModule() {
    var effects = Internals.effects;
    if (!effects || typeof effects.createHandle !== 'function' || typeof effects.mergeTiming !== 'function' ||
        typeof effects.createProgressHandle !== 'function') {
      throw new Error('NoteDemo 核心加载顺序错误：scene 效果需要先加载 NoteDemoInternals.effects（src/demo/effects.js）。');
    }
    return effects;
  }

  function geometryModule() {
    var geometry = Internals.sceneGeometry;
    if (!geometry || typeof geometry.flipElement !== 'function') {
      throw new Error('NoteDemo 核心加载顺序错误：scene 效果需要先加载 NoteDemoInternals.sceneGeometry（src/demo/scene-geometry.js）。');
    }
    return geometry;
  }

  /* frameId / markTiming：本次过渡的目标 Frame 与 Frame 外部标记使用的时间键。
   * 轨道来自 scene 运行时（见 scene.js createTrack）：{ name, readyHandles, finishHandles }。 */
  function createScope(config) {
    var options = isObject(config) ? config : {};
    var effects = effectsModule();
    var geometry = geometryModule();
    var frameId = options.frameId;
    var markTiming = isObject(options.timing) ? options.timing : effects.mergeTiming();
    var handles = [];
    var revealContainers = [];
    var markRoots = [];
    var released = false;

    function track(handle) {
      if (!handle) return handle;
      if (released) {
        try { handle.cancel(); } catch (error) { /* 已释放 */ }
        return handle;
      }
      handles.push(handle);
      return handle;
    }

    /* gate 规则：显式 gate 优先；role:'mark' 旧语义只进入 finished；其余进入 ready。 */
    function gateOf(spec) {
      if (spec.gate === 'ready' || spec.gate === 'finish') return spec.gate;
      return ((spec.role || spec.track) === 'mark') ? 'finish' : 'ready';
    }

    function addHandleToTrack(trackInfo, handle, spec) {
      if (!trackInfo) return;
      if (gateOf(spec) === 'ready') trackInfo.readyHandles.push(handle);
      trackInfo.finishHandles.push(handle);
    }

    function planLayoutEffects(runtime, targetsByMember) {
      var member = runtime && runtime.member;
      if (!member || member.mode !== 'layout') return;
      var trackInfo = runtime.grouped ? runtime.layoutTrack : runtime.defaultTrack;
      if (!trackInfo) return;
      var targets = targetsByMember[member.binding] || [];
      for (var i = 0; i < targets.length; i += 1) {
        var target = targets[i];
        if (!target || !isElement(target.layoutEl)) continue;
        var fromRect = member.sourceRects[String(target.id)];
        if (!fromRect) continue;
        var handle = geometry.flipElement(target.layoutEl, fromRect, member.finalTiming.duration,
          member.finalTiming.easing, {
            frameId: frameId,
            bindingId: member.binding,
            effect: 'layout-flip:' + String(target.id)
          });
        if (!handle) continue;
        track(handle);
        trackInfo.readyHandles.push(handle);
        trackInfo.finishHandles.push(handle);
      }
    }

    function adapterTrack(runtime, spec, index) {
      var member = runtime.member;
      if (runtime.grouped) {
        if (spec.type === 'progress' || isObject(spec)) {
          /* 分组成员：每个 spec 必须显式归属到已声明组。 */
          if (!isObject(spec) || typeof spec.group !== 'string' || spec.group === '') {
            throw makeSceneError('Binding "' + member.binding + '" 的 effect[' + index +
              '] 缺少 group 归属（该 Binding 已声明效果组：' + runtime.groupNames.join('、') + '）。', {
              binding: member.binding,
              path: 'scene.bindings["' + member.binding + '"].effects[' + index + ']'
            });
          }
          if (runtime.groupNames.indexOf(spec.group) < 0) {
            throw makeSceneError('Binding "' + member.binding + '" 的 effect[' + index +
              '] 声明了未知效果组 "' + spec.group + '"（已声明：' + runtime.groupNames.join('、') + '）。', {
              binding: member.binding,
              group: spec.group
            });
          }
          var groupTrack = runtime.groupTracks[spec.group];
          if (!groupTrack) {
            throw makeSceneError('Binding "' + member.binding + '" 的效果组 "' + spec.group + '" 缺少运行轨道。', {
              binding: member.binding,
              group: spec.group
            });
          }
          return groupTrack;
        }
        return null;
      }
      if (spec && spec.group != null) {
        throw makeSceneError('Binding "' + member.binding + '" 的 Adapter 未声明效果组，但 effect[' + index +
          '] 声明了 group "' + String(spec.group) + '"。', {
          binding: member.binding,
          group: String(spec.group)
        });
      }
      return runtime.defaultTrack;
    }

    /* EffectSpec.handoff：仅 WAAPI spec 支持 'hold'；progress 的终态由 update(1) 落位，显式声明定位报错。 */
    function handoffOf(spec, member, index) {
      if (!own(spec, 'handoff')) return null;
      if (spec.handoff !== 'hold') {
        throw makeSceneError('Binding "' + member.binding + '" 的 effect[' + index +
          '] handoff 只支持 "hold"（收到 ' + JSON.stringify(spec.handoff) + '）。', {
          binding: member.binding,
          path: 'scene.bindings["' + member.binding + '"].effects[' + index + '].handoff'
        });
      }
      if (spec.type === 'progress') {
        throw makeSceneError('Binding "' + member.binding + '" 的 progress effect[' + index +
          '] 不能声明 handoff：progress 的最终视觉由 update(1) 自己落位。', {
          binding: member.binding,
          path: 'scene.bindings["' + member.binding + '"].effects[' + index + '].handoff'
        });
      }
      return 'hold';
    }

    function planAdapterEffects(runtime) {
      var member = runtime && runtime.member;
      if (!member || (member.mode !== 'layout' && member.mode !== 'update')) return;
      if (!member.prepared || typeof member.prepared.effects !== 'function') return;
      var specs;
      try {
        specs = member.prepared.effects({
          timing: member.finalTiming,
          motion: 'auto',
          bindingId: member.binding,
          attention: runtime.attention === true,
          grouped: runtime.grouped === true,
          groups: runtime.groupNames ? runtime.groupNames.slice() : []
        });
      } catch (error) {
        if (error && error.name === 'NoteDemoSceneError') throw error;
        throw makeSceneError('Binding "' + member.binding + '" 的 scene effects 规划失败：' + messageOf(error), { binding: member.binding });
      }
      if (!isArray(specs)) return;
      for (var i = 0; i < specs.length; i += 1) {
        var spec = specs[i];
        if (!isObject(spec)) {
          throw makeSceneError('Binding "' + member.binding + '" 的 effect[' + i + '] 不是对象。', { binding: member.binding });
        }
        var targetTrack = adapterTrack(runtime, spec, i);
        var handoff = handoffOf(spec, member, i);
        var handle;
        if (spec.type === 'progress') {
          if (typeof spec.update !== 'function') {
            throw makeSceneError('Binding "' + member.binding + '" 的 progress effect[' + i + '] 缺少 update(progress) 函数。', {
              binding: member.binding,
              group: spec.group || null
            });
          }
          handle = effects.createProgressHandle(spec, {
            frameId: frameId,
            bindingId: member.binding,
            effect: spec.effect || ('progress:' + (spec.group || i))
          });
          addHandleToTrack(targetTrack, handle, spec);
          track(handle);
        } else {
          if (!isElement(spec.el)) {
            throw makeSceneError('Binding "' + member.binding + '" 的 effect[' + i + '] 缺少有效目标元素。', {
              binding: member.binding,
              group: spec.group || null
            });
          }
          /* handoff:'hold' 只改该 spec 的 fill：正常完成后保持末帧到 scene 收束，
           * cleanup 取消句柄后由 Adapter cleanup 在同一 JS 任务内释放预置隐藏值。 */
          var settings = Object.assign({}, spec.options || {}, { paused: true });
          if (handoff === 'hold') settings.fill = 'both';
          handle = effects.createHandle(spec.el, spec.keyframes, settings, {
              frameId: frameId,
              bindingId: member.binding,
              effect: spec.effect || 'adapter'
            });
          addHandleToTrack(targetTrack, handle, spec);
          track(handle);
        }
        if (spec.cleanupEl && isElement(spec.cleanupEl)) {
          (function (el) {
            handle.finished.then(function () {
              try { if (el.parentNode) el.parentNode.removeChild(el); } catch (error) { /* ignore */ }
            }, function () {
              try { if (el.parentNode) el.parentNode.removeChild(el); } catch (error) { /* ignore */ }
            });
          })(spec.cleanupEl);
        }
      }
    }

    function setMarkRoots(list) {
      markRoots = (isArray(list) ? list : []).filter(isElement);
      for (var i = 0; i < markRoots.length; i += 1) {
        try { markRoots[i].style.opacity = '0'; } catch (error) { /* ignore */ }
      }
    }

    function planMarkEffects() {
      var planned = [];
      if (!markRoots.length) return planned;
      for (var i = 0; i < markRoots.length; i += 1) {
        var root = markRoots[i];
        var handle = effects.createHandle(root, [{ opacity: 0 }, { opacity: 1 }], {
          duration: markTiming.markDuration,
          delay: markTiming.markDelay,
          easing: markTiming.easing,
          paused: true
        }, { frameId: frameId, effect: 'scene-mark' });
        track(handle);
        handle.play();
        (function (el) {
          handle.finished.then(function () {
            try { el.style.opacity = ''; } catch (error) { /* ignore */ }
          }, function () {
            try { el.style.opacity = ''; } catch (error) { /* ignore */ }
          });
        })(root);
        planned.push(handle);
      }
      return planned;
    }

    function hideReveal(container) {
      if (!isElement(container)) return;
      revealContainers.push(container);
      container.style.visibility = 'hidden';
      container.style.opacity = '0';
    }

    /* 目标已提交后整块显现；返回 Promise<boolean>（true=正常显现，false=句柄被取消）。 */
    function reveal(container, timing, meta) {
      var revealTiming = isObject(timing) ? timing : markTiming;
      if (!isElement(container)) return Promise.resolve(true);
      container.style.visibility = 'visible';
      container.style.opacity = '0';
      var handle = effects.createHandle(container, [{ opacity: 0 }, { opacity: 1 }], {
        duration: revealTiming.revealDuration,
        delay: revealTiming.revealDelay,
        easing: revealTiming.easing
      }, meta);
      track(handle);
      handle.finished.then(function () {
        try { container.style.opacity = ''; } catch (error) { /* ignore */ }
      }, function () {
        try { container.style.opacity = ''; } catch (error) { /* ignore */ }
      });
      return handle.finished.then(function (completed) {
        return completed !== false;
      });
    }

    function showRevealContainers() {
      for (var i = 0; i < revealContainers.length; i += 1) {
        try {
          revealContainers[i].style.visibility = '';
          revealContainers[i].style.opacity = '';
        } catch (error) { /* ignore */ }
      }
    }

    function showMarkRoots() {
      for (var i = 0; i < markRoots.length; i += 1) {
        try { markRoots[i].style.opacity = ''; } catch (error) { /* ignore */ }
      }
    }

    /* 取消/完成共用：取消全部句柄（已完成的取消只清 fill），恢复 reveal/mark 的临时内联状态。 */
    function release() {
      if (released) return;
      released = true;
      for (var h = 0; h < handles.length; h += 1) {
        try { handles[h].cancel(); } catch (error) { /* 继续清理 */ }
      }
      showRevealContainers();
      showMarkRoots();
      handles = [];
      revealContainers = [];
      markRoots = [];
    }

    return {
      planLayoutEffects: planLayoutEffects,
      planAdapterEffects: planAdapterEffects,
      planMarkEffects: planMarkEffects,
      setMarkRoots: setMarkRoots,
      hideReveal: hideReveal,
      reveal: reveal,
      showRevealContainers: showRevealContainers,
      showMarkRoots: showMarkRoots,
      release: release
    };
  }

  Internals.sceneEffects = {
    createScope: createScope
  };
})(window);

/* ---- source: src/demo/scene-attention.js ---- */
/* NoteDemo scene attention — 作者声明注意序列的组级门控协调与等待语义。
 * Scope: window.NoteDemoInternals.sceneAttention
 * Depends on: 无（实际焦点展示由 presentation port 负责；本文件只协调内容放行、ready 与停留）。
 * 协调单位是“观察目标 / 效果组”：
 *  - groups 省略 = 整 Binding 默认门控（仅未声明效果组的 Adapter）；
 *  - groups: [] = 只观察，不启动内容；
 *  - groups 非空 = 到达后放行这些效果组。
 * ready(index) 的语义是“该目标内容可承接 + 该目标的观察停留都已满足”，
 * 因此 presentation 只需 show → 到达 → start(index) → await ready(index) → 下一目标，
 * 不再叠加自己的 hold 计时（避免双重计时）。最后落点不倒计时。
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

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
  }

  function create(config) {
    var options = isObject(config) ? config : {};
    var targets = isArray(options.targets) ? options.targets.slice() : [];
    var enabled = options.enabled === true;
    var stepDuration = typeof options.stepDuration === 'number' && isFinite(options.stepDuration)
      ? options.stepDuration
      : 560;
    var createError = typeof options.createError === 'function'
      ? options.createError
      : function (message) { return new Error(message); };
    var resolveMember = typeof options.resolveMember === 'function' ? options.resolveMember : function () { return null; };
    var startDefault = typeof options.startDefault === 'function' ? options.startDefault : function () {};
    var startGroups = typeof options.startGroups === 'function' ? options.startGroups : function () {};
    var readyDefault = typeof options.readyDefault === 'function' ? options.readyDefault : function () { return Promise.resolve(true); };
    var readyGroups = typeof options.readyGroups === 'function' ? options.readyGroups : function () { return Promise.resolve(true); };

    var validated = false;
    var infos = [];
    var firstContent = {};
    var started = [];
    var startedWaiters = [];
    var startedPromises = [];
    var timers = [];
    var cancelled = false;

    for (var t = 0; t < targets.length; t += 1) {
      started.push(false);
      startedWaiters.push([]);
      startedPromises.push(new Promise(function (resolve) { startedWaiters[t].push(resolve); }));
    }

    function failAt(path, message, details) {
      var extra = details && typeof details === 'object' ? details : {};
      extra.path = path;
      return createError(message, extra);
    }

    function memberOf(binding) {
      var member = resolveMember(binding);
      return isObject(member) ? member : null;
    }

    /* 编译后 target 已带 groups（省略=undefined / 观察=[] / 放行=非空）；此时结合成员分组能力做联合校验。 */
    function validate() {
      if (validated) return infos;
      validated = true;
      var defaultGate = {};
      var groupGate = {};
      for (var i = 0; i < targets.length; i += 1) {
        var target = targets[i];
        var path = (target && target.path) || ('attention.targets[' + i + ']');
        if (!isObject(target) || !isNonEmptyString(target.binding)) {
          throw failAt(path, 'attention 目标缺少有效 binding。');
        }
        var groupsProvided = isArray(target.groups);
        var observeOnly = groupsProvided && target.groups.length === 0;
        var member = memberOf(target.binding);
        var holdDuration = typeof target.holdDuration === 'number' && isFinite(target.holdDuration) && target.holdDuration >= 0
          ? target.holdDuration : null;
        var info = {
          index: i,
          binding: target.binding,
          target: target,
          member: member,
          kind: 'observe',
          groups: null,
          holdDuration: holdDuration
        };
        if (!enabled) {
          info.kind = 'observe';
          infos.push(info);
          continue;
        }
        if (!member) {
          if (groupsProvided && target.groups.length > 0) {
            throw failAt(path, '稳定参照（不参与本 scene 的 binding "' + target.binding + '"）不能声明 groups 非空；只观察请写 groups: []');
          }
          /* 稳定参照：只观察，默认从到达起停留 stepDuration。 */
          infos.push(info);
          continue;
        }
        var mode = member.mode;
        if (mode === 'cut') {
          if (!observeOnly) {
            throw failAt(path, 'Binding "' + target.binding +
              '" 是 cut：cut 在同步提交时已经显示目标，不能作为 attention 内容门控目标；观察请用 groups: []，需要延后展开请改用 update/layout/reveal');
          }
          infos.push(info);
          continue;
        }
        if (mode === 'reveal') {
          if (groupsProvided && target.groups.length > 0) {
            throw failAt(path, 'Binding "' + target.binding + '" 是 reveal，没有分组内容效果；groups 只能省略（整 Binding 门控）或 []（只观察）');
          }
          if (observeOnly) {
            infos.push(info);
            continue;
          }
          if (own(defaultGate, target.binding)) {
            throw failAt(path, 'Binding "' + target.binding + '" 的整 Binding 默认门控重复：目标 ' +
              defaultGate[target.binding] + ' 与 ' + i + ' 都在门控同一内容；重复目标请改成 groups: [] 观察');
          }
          defaultGate[target.binding] = i;
          info.kind = 'content';
          info.groups = null;
          infos.push(info);
          continue;
        }
        /* layout / update：可能声明效果组。 */
        if (member.grouped) {
          if (!groupsProvided) {
            throw failAt(path, 'Binding "' + target.binding +
              '" 的 Adapter 声明了效果组，attention 目标必须显式声明 groups（[] 表示只观察，非空数组表示到达后放行这些组）');
          }
          if (observeOnly) {
            infos.push(info);
            continue;
          }
          if (!own(groupGate, target.binding)) groupGate[target.binding] = {};
          for (var g = 0; g < target.groups.length; g += 1) {
            var groupName = target.groups[g];
            if (member.groups.indexOf(groupName) < 0) {
              throw failAt(path, 'Binding "' + target.binding + '" 的未知效果组 "' + groupName +
                '"（该 Binding 声明：' + member.groups.join('、') + '）');
            }
            if (own(groupGate[target.binding], groupName)) {
              throw failAt(path, 'Binding "' + target.binding + '" 的组 "' + groupName + '" 重复门控：目标 ' +
                groupGate[target.binding][groupName] + ' 与 ' + i + ' 都在门控同一组');
            }
            groupGate[target.binding][groupName] = i;
          }
          info.kind = 'content';
          info.groups = target.groups.slice();
          infos.push(info);
          continue;
        }
        if (groupsProvided && target.groups.length > 0) {
          throw failAt(path, 'Binding "' + target.binding +
            '" 的 Adapter 未声明效果组，不能声明 groups 非空；整 Binding 门控请省略 groups，只观察请写 groups: []');
        }
        if (observeOnly) {
          infos.push(info);
          continue;
        }
        if (own(defaultGate, target.binding)) {
          throw failAt(path, 'Binding "' + target.binding + '" 的整 Binding 默认门控重复：目标 ' +
            defaultGate[target.binding] + ' 与 ' + i + ' 都在门控同一内容；重复目标请改成 groups: [] 观察');
        }
        defaultGate[target.binding] = i;
        info.kind = 'content';
        info.groups = null;
        infos.push(info);
      }
      /* 第一个内容放行目标：分组成员的 layout 轨道随它一起启动。 */
      for (var f = 0; f < infos.length; f += 1) {
        if (infos[f].kind !== 'content' || !infos[f].member) continue;
        if (firstContent[infos[f].binding] === undefined) firstContent[infos[f].binding] = f;
      }
      return infos;
    }

    function waitStarted(index) {
      if (!(index >= 0) || index >= startedPromises.length) return Promise.resolve();
      if (started[index]) return Promise.resolve();
      return startedPromises[index];
    }

    function addTimer(fn, ms) {
      var handle = { done: false, cancelled: false, timer: 0, onCancel: null };
      handle.timer = global.setTimeout(function () {
        if (handle.cancelled) return;
        handle.done = true;
        fn();
      }, ms);
      timers.push(handle);
      return handle;
    }

    /* 焦点真实到达后由 presentation 调用：放行该目标的内容组（观察目标不放行任何内容）。 */
    function start(index) {
      if (!(index >= 0) || index >= targets.length) return;
      if (!started[index]) {
        started[index] = true;
        var waiters = startedWaiters[index] || [];
        startedWaiters[index] = [];
        waiters.forEach(function (resolve) { resolve(); });
      }
      if (!enabled || cancelled) return;
      var info = infos[index];
      if (!info || info.kind !== 'content' || !info.member) return;
      if (info.groups == null) startDefault(info.member, info);
      else startGroups(info.member, info.groups, info);
    }

    /* 返回“内容可承接 + 停留已满足”的 Promise；最后落点不倒计时。 */
    function ready(index) {
      var info = infos[index];
      if (!enabled || cancelled) return Promise.resolve(true);
      if (!info) return Promise.resolve(true);
      var isLast = index === targets.length - 1;
      var hold;
      if (isLast) hold = 0;
      else if (info.kind === 'observe') hold = info.holdDuration == null ? stepDuration : info.holdDuration;
      else hold = info.holdDuration == null ? 0 : info.holdDuration;
      var contentReady;
      if (info.kind !== 'content' || !info.member) {
        contentReady = Promise.resolve(true);
      } else if (info.groups == null) {
        contentReady = Promise.resolve(readyDefault(info.member, info));
      } else {
        contentReady = Promise.resolve(readyGroups(info.member, info.groups, info));
      }
      return waitStarted(index).then(function () {
        if (cancelled) return true;
        return contentReady.then(function () {
          if (cancelled || hold <= 0) return true;
          return new Promise(function (resolve) {
            var handle = addTimer(function () { resolve(true); }, hold);
            handle.onCancel = function () { resolve(true); };
          });
        });
      }).then(function (value) {
        return value !== false;
      });
    }

    function cancel() {
      if (cancelled) return;
      cancelled = true;
      for (var i = 0; i < timers.length; i += 1) {
        var handle = timers[i];
        if (!handle || handle.done) continue;
        handle.cancelled = true;
        try { global.clearTimeout(handle.timer); } catch (error) { /* ignore */ }
        if (typeof handle.onCancel === 'function') {
          try { handle.onCancel(); } catch (error) { /* ignore */ }
        }
      }
      timers = [];
      for (var s = 0; s < startedWaiters.length; s += 1) {
        var waiters = startedWaiters[s] || [];
        startedWaiters[s] = [];
        waiters.forEach(function (resolve) { resolve(); });
      }
    }

    function firstContentIndex(binding) {
      return own(firstContent, binding) ? firstContent[binding] : -1;
    }

    function targetInfos() {
      return infos;
    }

    return {
      enabled: enabled,
      validate: validate,
      start: start,
      ready: ready,
      cancel: cancel,
      firstContentIndex: firstContentIndex,
      targetInfos: targetInfos,
      stepDuration: stepDuration
    };
  }

  Internals.sceneAttention = {
    create: create
  };
})(window);

/* ---- source: src/demo/scene.js ---- */
/* NoteDemo scene — 完整目标画面的受控过渡编排（layout / update / cut / reveal）。
 * Scope: window.NoteDemoInternals.scene
 * Depends on: definition（提交后读回比较）、effects（timing 合并/进度句柄）、sceneGeometry（FLIP/矩形）、
 *             sceneEffects（轨道化的 WAAPI/进度效果、揭示与标记）、sceneAttention（观察目标与效果组门控）。
 * 一次运行拥有全部效果、延后启动、临时资源与清理；经典脚本，无模块 / 无网络 / 无 eval。
 *
 * 运行原因（reason）由 controller 传入：next | replay | replayPrevious | go | reset | prev；
 * 缺省 'next'。它只透传给 presentation（info.reason / info.cause），scene 自身行为不变。 */
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

  function isElement(value) {
    return !!value && value.nodeType === 1;
  }

  function messageOf(error) {
    if (error == null) return '';
    if (typeof error === 'string') return error;
    if (error.message != null) return String(error.message);
    return String(error);
  }

  function noop() {}

  function loadModule(name, check, detail) {
    var module = Internals[name];
    if (!module || !check(module)) {
      throw new Error('NoteDemo 核心加载顺序错误：scene 执行需要先加载 ' + detail + '。');
    }
    return module;
  }

  function definitionModule() {
    return loadModule('definition', function (definition) {
      return typeof definition.compareModel === 'function' &&
        typeof definition.compareCues === 'function' &&
        typeof definition.describeDiff === 'function';
    }, 'NoteDemoInternals.definition（src/demo/definition.js）');
  }

  function effectsModule() {
    return loadModule('effects', function (effects) {
      return typeof effects.mergeTiming === 'function';
    }, 'NoteDemoInternals.effects（src/demo/effects.js）');
  }

  function geometryModule() {
    return loadModule('sceneGeometry', function (geometry) {
      return typeof geometry.captureSourceRects === 'function' && typeof geometry.flipElement === 'function';
    }, 'NoteDemoInternals.sceneGeometry（src/demo/scene-geometry.js）');
  }

  function effectsScopeModule() {
    return loadModule('sceneEffects', function (sceneEffects) {
      return typeof sceneEffects.createScope === 'function';
    }, 'NoteDemoInternals.sceneEffects（src/demo/scene-effects.js）');
  }

  function attentionModule() {
    return loadModule('sceneAttention', function (sceneAttention) {
      return typeof sceneAttention.create === 'function';
    }, 'NoteDemoInternals.sceneAttention（src/demo/scene-attention.js）');
  }

  function afterFrame() {
    return new Promise(function (resolve) {
      if (typeof global.requestAnimationFrame !== 'function') {
        resolve();
        return;
      }
      global.requestAnimationFrame(function () { resolve(); });
    });
  }

  function makeSceneError(message, details) {
    var error = new Error(message);
    error.name = 'NoteDemoSceneError';
    if (details && typeof details === 'object') error.details = details;
    return error;
  }

  /* cut / reveal 的同步 restore 也可以包成 PreparedChange；没有 layout 载体可提供。 */
  function restorePrepared(entry, targetView) {
    var handle = entry.handle;
    return {
      commit: function () {
        handle.restore(targetView);
      },
      targets: function () { return []; },
      effects: function () { return []; },
      cleanup: noop,
      facts: function () { return { entered: [], exited: [], valueChanged: [] }; }
    };
  }

  function runPreparedComparison(definition, frameId, bindingId, targetView, handle) {
    if (!handle || typeof handle.readView !== 'function') return;
    var actual;
    try {
      actual = handle.readView();
    } catch (error) {
      throw makeSceneError('Frame "' + String(frameId) + '" / Binding "' + String(bindingId) +
        '" / Scene：读回组件真实状态失败：' + messageOf(error), { binding: bindingId });
    }
    if (!isObject(actual) || !own(actual, 'model')) {
      throw makeSceneError('Frame "' + String(frameId) + '" / Binding "' + String(bindingId) +
        '" / Scene：readView 没有返回 {model,cues}。', { binding: bindingId });
    }
    var modelDiff = definition.compareModel(targetView.model, actual.model);
    if (modelDiff) {
      throw makeSceneError(definition.describeDiff(frameId, bindingId, 'scene', modelDiff) +
        'scene 提交后的 model 与目标 Frame 不一致（不调用 restore 掩盖）。', {
        frameId: frameId,
        binding: bindingId,
        path: modelDiff.path,
        expected: modelDiff.expected,
        actual: modelDiff.actual
      });
    }
    var cueDiff = definition.compareCues(targetView.cues, actual.cues);
    if (cueDiff) {
      throw makeSceneError(definition.describeDiff(frameId, bindingId, 'scene', cueDiff) +
        'scene 提交后的 cues 与目标 Frame 不一致。', {
        frameId: frameId,
        binding: bindingId,
        path: cueDiff.path,
        expected: cueDiff.expected,
        actual: cueDiff.actual
      });
    }
  }

  function normalizeReason(options) {
    var value = options.reason != null ? options.reason : options.cause;
    if (value == null) return 'next';
    var text = String(value);
    return text || 'next';
  }

  function run(config) {
    var options = isObject(config) ? config : {};
    var plan = options.plan;
    var transition = options.transition || null;
    var bindings = options.bindings;
    var signal = options.signal || null;
    var presentation = options.presentation || null;
    var motionName = options.motion === 'reduced' ? 'reduced' : 'normal';
    var reason = normalizeReason(options);

    return new Promise(function (resolve, reject) {
      var definition;
      var effects;
      var scene;
      var sourceFrame;
      var targetFrame;
      var members = [];
      var memberMap = {};
      var markTiming = null;
      var port = null;
      var attention = null;
      var attentionCoordinator = null;
      var attentionEnabled = false;
      var runtimes = {};
      var scope = null;
      var closed = false;
      var cancelled = false;
      var cleaned = false;
      var preparedList = [];

      function scenePath() {
        if (scene && scene.path) return scene.path;
        if (transition) return 'transition "' + String(transition.from) + '" → "' + String(transition.to) + '" 的 scene';
        return 'scene';
      }

      function releasePrepared() {
        for (var p = 0; p < preparedList.length; p += 1) {
          try {
            if (preparedList[p] && typeof preparedList[p].cleanup === 'function') preparedList[p].cleanup();
          } catch (error) { /* 清理失败不阻断 */ }
        }
        preparedList = [];
      }

      /* 取消与完成共用同一个清理入口：先让运行失效，再释放句柄/副本与 presentation 资源。 */
      function cleanup() {
        if (cleaned) return;
        cleaned = true;
        if (signal && typeof signal.removeEventListener === 'function') {
          try { signal.removeEventListener('abort', onAbort); } catch (error) { /* ignore */ }
        }
        if (attention && typeof attention.cancel === 'function') {
          try { attention.cancel(); } catch (error) { /* ignore */ }
        }
        /* 来源可见性交接优先释放：源视觉恢复内联原值，随后句柄取消与 Adapter cleanup 在同一任务内完成。 */
        releaseAllSourceVisibility();
        if (scope) {
          try { scope.release(); } catch (error) { /* 清理失败不阻断 */ }
        }
        releasePrepared();
        if (port && typeof port.cancel === 'function') {
          try { port.cancel(); } catch (error) { /* ignore */ }
        }
        port = null;
        /* 目标效果已收束/取消，最后释放受控载体的接管；恢复路径会在 restore 内再次短暂接管。 */
        if (bindings && typeof bindings.endSceneControl === 'function') {
          try { bindings.endSceneControl(members.map(function (member) { return member.binding; })); } catch (error) { /* 清理失败不阻断 */ }
        }
      }

      function finish(value) {
        if (closed) return;
        closed = true;
        resolve(value);
      }

      function fail(error) {
        if (closed) return;
        closed = true;
        cleanup();
        reject(error);
      }

      function onAbort() {
        cancel();
      }

      function cancel() {
        if (closed || cancelled) return;
        cancelled = true;
        cleanup();
        afterFrame().then(function () {
          if (!closed) finish({ status: 'cancelled' });
        }, function () {
          if (!closed) finish({ status: 'cancelled' });
        });
      }

      /* ---------------- 收集参与者 ---------------- */

      function collectMembers() {
        scene = transition && isObject(transition.scene) ? transition.scene : null;
        if (!scene) throw makeSceneError('scene 执行缺少 transition.scene。');
        sourceFrame = plan.frameById[transition.from];
        targetFrame = plan.frameById[transition.to];
        if (!sourceFrame || !targetFrame) throw makeSceneError('scene 过渡引用了不存在的 Frame。');
        /* attention 场景使用较慢的公共内容节奏；普通 scene 保持公共默认。 */
        var attentionContent = scene.attention ? definition.attentionContentTiming : null;
        var effectiveSceneTiming = scene.timing;
        if (attentionContent) {
          effectiveSceneTiming = Object.assign({}, attentionContent, isObject(scene.timing) ? scene.timing : {});
        }
        markTiming = effects.mergeTiming(null, effectiveSceneTiming, null);
        if (!isArray(scene.bindings) || scene.bindings.length === 0) {
          throw makeSceneError('scene 没有参与者。');
        }
        for (var i = 0; i < scene.bindings.length; i += 1) {
          var spec = scene.bindings[i];
          var entry = bindings.entry(spec.binding);
          if (!entry || !entry.handle) {
            throw makeSceneError('scene 参与 binding "' + String(spec.binding) + '" 没有已挂载的组件。', { binding: spec.binding });
          }
          var sourceView = sourceFrame.views ? sourceFrame.views[spec.binding] : null;
          var targetView = targetFrame.views ? targetFrame.views[spec.binding] : null;
          if (!targetView || !isObject(targetView)) {
            throw makeSceneError('目标 Frame "' + String(transition.to) + '" 缺少 binding "' + String(spec.binding) + '" 的视图。', { binding: spec.binding });
          }
          if (spec.mode === 'cut' && isArray(spec.after) && spec.after.length) {
            throw makeSceneError('Binding "' + String(spec.binding) +
              '" 是 cut；cut 在同步提交时已经显示目标，不能声明 after。请改用 update 或 reveal。',
              { binding: spec.binding });
          }
          var member = {
            binding: spec.binding,
            mode: spec.mode,
            at: spec.at || 'objects-settled',
            after: isArray(spec.after) ? spec.after.slice() : [],
            timing: isObject(spec.timing) ? spec.timing : {},
            finalTiming: effects.mergeTiming(entry.timingDefaults, effectiveSceneTiming, spec.timing),
            entry: entry,
            handle: entry.handle,
            sourceView: sourceView,
            targetView: targetView,
            prepared: null,
            grouped: false,
            groups: [],
            gatedGroups: null,
            defaultGateIndex: null,
            firstContentIndex: null,
            attentionContent: false,
            revealContainer: null,
            sourceElements: [],
            sourceVisibilityToken: null,
            sourceReleased: false
          };
          members.push(member);
          memberMap[member.binding] = member;
        }
      }

      /* ---------------- 准备与校验 ---------------- */

      function prepareAll() {
        var waits = [];
        members.forEach(function (member) {
          var controlled = member.mode === 'layout' || member.mode === 'update';
          if (controlled) {
            if (typeof member.handle.prepareChange !== 'function') {
              throw makeSceneError('Binding "' + member.binding + '" 的 Adapter 未提供 prepareChange，无法作为 scene ' +
                member.mode + ' 参与者。', { binding: member.binding });
            }
            if (typeof member.handle.readView !== 'function') {
              throw makeSceneError('Binding "' + member.binding + '" 缺少 readView，无法核对 scene 提交结果。', { binding: member.binding });
            }
            var prepared;
            try {
              prepared = member.handle.prepareChange({
                bindingId: member.binding,
                sourceFrameId: transition.from,
                targetFrameId: transition.to,
                sourceView: member.sourceView,
                targetView: member.targetView,
                signal: signal,
                motion: motionName === 'reduced' ? 'never' : 'auto'
              });
            } catch (error) {
              throw makeSceneError('Binding "' + member.binding + '" 的 prepareChange 失败：' + messageOf(error), { binding: member.binding });
            }
            if (prepared && typeof prepared.then === 'function') {
              waits.push(Promise.resolve(prepared).then(function (value) {
                if (closed || cleaned) {
                  try { if (value && typeof value.cleanup === 'function') value.cleanup(); } catch (error) { /* ignore */ }
                  return;
                }
                member.prepared = value;
                preparedList.push(value);
              }, function (error) {
                throw makeSceneError('Binding "' + member.binding + '" 的 prepareChange 异步失败：' + messageOf(error), { binding: member.binding });
              }));
            } else {
              member.prepared = prepared;
              preparedList.push(prepared);
            }
            if (!member.prepared && !prepared) {
              throw makeSceneError('Binding "' + member.binding + '" 的 prepareChange 没有返回 PreparedChange。', { binding: member.binding });
            }
          } else {
            member.prepared = restorePrepared(member.entry, member.targetView);
            preparedList.push(member.prepared);
          }
        });
        return waits.length ? Promise.all(waits) : Promise.resolve();
      }

      function validatePrepared() {
        members.forEach(function (member) {
          var prepared = member.prepared;
          if (!prepared || typeof prepared.commit !== 'function') {
            throw makeSceneError('Binding "' + member.binding + '" 的 PreparedChange 缺少同步 commit()。', { binding: member.binding });
          }
          if (member.mode === 'layout' && typeof prepared.targets !== 'function') {
            throw makeSceneError('Binding "' + member.binding + '" 的 PreparedChange 缺少 targets()，无法取得布局载体。', { binding: member.binding });
          }
          if (member.mode === 'update' && typeof prepared.effects !== 'function') {
            throw makeSceneError('Binding "' + member.binding + '" 的 prepared update 缺少 effects()，不能静默降为 cut。', { binding: member.binding });
          }
        });
      }

      /* ---------------- 来源可见性交接（PreparedChange.sourceElements） ---------------- */

      function releaseSourceVisibility(member) {
        if (!member || !member.sourceVisibilityToken) return;
        var token = member.sourceVisibilityToken;
        member.sourceVisibilityToken = null;
        member.sourceReleased = true;
        try { effects.releaseVisibility(token); } catch (error) { /* 清理失败不阻断 */ }
      }

      function releaseAllSourceVisibility() {
        for (var i = 0; i < members.length; i += 1) releaseSourceVisibility(members[i]);
      }

      /* prepareChange 返回后、commit 前调用一次；只捕获来源视觉，不克隆/替换 DOM。 */
      function collectSourceElements() {
        members.forEach(function (member) {
          if (member.mode !== 'layout' && member.mode !== 'update') return;
          var prepared = member.prepared;
          if (!prepared || typeof prepared.sourceElements !== 'function') return;
          var value;
          try {
            value = prepared.sourceElements();
          } catch (error) {
            throw makeSceneError('Binding "' + member.binding + '" 的 sourceElements() 失败：' + messageOf(error), {
              binding: member.binding,
              path: 'scene.bindings["' + member.binding + '"].sourceElements'
            });
          }
          if (value === undefined || value === null) return;
          if (!isArray(value)) {
            throw makeSceneError('Binding "' + member.binding + '" 的 sourceElements() 必须返回 Element[]（或省略）。', {
              binding: member.binding,
              path: 'scene.bindings["' + member.binding + '"].sourceElements'
            });
          }
          var elements = [];
          for (var i = 0; i < value.length; i += 1) {
            var element = value[i];
            if (!element || element.nodeType !== 1) {
              throw makeSceneError('Binding "' + member.binding + '" 的 sourceElements()[' + i + '] 必须是 DOM Element。', {
                binding: member.binding,
                path: 'scene.bindings["' + member.binding + '"].sourceElements[' + i + ']'
              });
            }
            if (!element.isConnected) {
              throw makeSceneError('Binding "' + member.binding + '" 的 sourceElements()[' + i +
                '] 在 commit 前已从文档断开；请在 prepare 阶段返回仍连接的真实来源对象。', {
                binding: member.binding,
                path: 'scene.bindings["' + member.binding + '"].sourceElements[' + i + ']'
              });
            }
            if (elements.indexOf(element) < 0) elements.push(element);
          }
          member.sourceElements = elements;
          member.sourceVisibilityToken = elements.length ? effects.captureVisibility(elements) : null;
        });
      }

      function holdSourceVisibility() {
        members.forEach(function (member) {
          if (!member.sourceVisibilityToken) return;
          try {
            effects.holdVisibility(member.sourceVisibilityToken);
          } catch (error) {
            throw makeSceneError('Binding "' + member.binding + '" 的来源可见性保持失败：' + messageOf(error), {
              binding: member.binding
            });
          }
        });
      }

      function discoverGroups() {
        members.forEach(function (member) {
          if (member.mode !== 'layout' && member.mode !== 'update') return;
          var prepared = member.prepared;
          if (!prepared || typeof prepared.groups !== 'function') return;
          var value;
          try {
            value = prepared.groups();
          } catch (error) {
            throw makeSceneError('Binding "' + member.binding + '" 的 groups() 失败：' + messageOf(error), { binding: member.binding });
          }
          if (value === undefined || value === null) return;
          if (!isArray(value)) {
            throw makeSceneError('Binding "' + member.binding + '" 的 groups() 必须返回 string[]（或省略）。', { binding: member.binding });
          }
          var names = [];
          var seen = {};
          for (var i = 0; i < value.length; i += 1) {
            var name = value[i];
            if (typeof name !== 'string' || name.trim() === '') {
              throw makeSceneError('Binding "' + member.binding + '" 的 groups()[' + i + '] 必须是非空字符串。', { binding: member.binding });
            }
            if (own(seen, name)) {
              throw makeSceneError('Binding "' + member.binding + '" 的 groups() 重复声明组 "' + name + '"。', { binding: member.binding, group: name });
            }
            seen[name] = true;
            names.push(name);
          }
          if (names.length) {
            member.grouped = true;
            member.groups = names;
          }
        });
      }

      function setupAttention() {
        attentionEnabled = motionName !== 'reduced' && !!scene.attention;
        if (!scene.attention) {
          attention = null;
          attentionCoordinator = null;
          return;
        }
        attention = attentionModule().create({
          targets: scene.attention.targets,
          enabled: attentionEnabled,
          stepDuration: scene.attention.stepDuration,
          createError: makeSceneError,
          resolveMember: function (binding) { return memberMap[binding] || null; },
          startDefault: function (member) {
            var runtime = runtimes[member.binding];
            if (!runtime) return;
            requestStart(runtime, function () { startDefaultTrack(runtime); });
          },
          startGroups: function (member, groups) {
            var runtime = runtimes[member.binding];
            if (!runtime) return;
            requestStart(runtime, function () { startGroupTracks(runtime, groups); });
          },
          readyDefault: function (member) {
            var runtime = runtimes[member.binding];
            return runtime ? runtime.defaultTrack.ready : Promise.resolve(true);
          },
          readyGroups: function (member, groups, info) {
            var runtime = runtimes[member.binding];
            if (!runtime) return Promise.resolve(true);
            var list = [];
            for (var i = 0; i < groups.length; i += 1) {
              var trackInfo = runtime.groupTracks[groups[i]];
              if (trackInfo) list.push(trackInfo.ready);
            }
            if (runtime.layoutTrack && member.firstContentIndex === info.index) list.push(runtime.layoutTrack.ready);
            return Promise.all(list);
          }
        });
        if (!attentionEnabled) {
          attentionCoordinator = null;
          return;
        }
        attention.validate();
        attentionCoordinator = {
          start: function (index) { attention.start(index); },
          ready: function (index) { return attention.ready(index); }
        };
        var infos = attention.targetInfos();
        infos.forEach(function (info) {
          if (!info || !info.member) return;
          var member = info.member;
          if (info.kind !== 'content') return;
          member.attentionContent = true;
          if (info.groups == null) {
            member.defaultGateIndex = info.index;
          } else {
            if (!member.gatedGroups) member.gatedGroups = {};
            info.groups.forEach(function (name) { member.gatedGroups[name] = info.index; });
          }
          if (member.firstContentIndex === null || info.index < member.firstContentIndex) {
            member.firstContentIndex = info.index;
          }
        });
        /* 只被 groups: [] 观察、没有任何内容放行的 scene 成员：观察目标本身不启动内容，
         * 按未门控成员正常调度（不会卡住完成边界）；作者若要延后内容应补内容目标。 */
      }

      /* ---------------- 轨道与运行时 ---------------- */

      function createTrack(name) {
        var resolveReady;
        var resolveFinished;
        var trackInfo = {
          name: name,
          started: false,
          readyHandles: [],
          finishHandles: [],
          readyResolved: false,
          finishedResolved: false,
          ready: null,
          finished: null,
          resolveReady: null,
          resolveFinished: null
        };
        trackInfo.ready = new Promise(function (resolve) { resolveReady = resolve; });
        trackInfo.finished = new Promise(function (resolve) { resolveFinished = resolve; });
        trackInfo.resolveReady = resolveReady;
        trackInfo.resolveFinished = resolveFinished;
        return trackInfo;
      }

      function createMemberRuntime(member) {
        var runtime = {
          member: member,
          grouped: member.grouped === true,
          groupNames: member.groups.slice(),
          defaultTrack: createTrack('default'),
          layoutTrack: null,
          groupTracks: {},
          trackList: [],
          attention: member.attentionContent === true,
          planned: false,
          depsReady: false,
          pending: [],
          revealStarted: false,
          releaseStarted: false,
          revealContainer: member.revealContainer || null
        };
        if (runtime.grouped) {
          if (member.mode === 'layout') runtime.layoutTrack = createTrack('layout');
          runtime.groupNames.forEach(function (name) {
            runtime.groupTracks[name] = createTrack(name);
          });
          if (runtime.layoutTrack) runtime.trackList.push(runtime.layoutTrack);
          runtime.groupNames.forEach(function (name) { runtime.trackList.push(runtime.groupTracks[name]); });
        } else {
          runtime.trackList.push(runtime.defaultTrack);
        }
        runtime.memberReady = Promise.all(runtime.trackList.map(function (trackInfo) { return trackInfo.ready; }));
        runtime.memberFinished = Promise.all(runtime.trackList.map(function (trackInfo) { return trackInfo.finished; }));
        return runtime;
      }

      function resolveTrackReady(trackInfo) {
        if (!trackInfo || trackInfo.readyResolved) return;
        trackInfo.readyResolved = true;
        trackInfo.resolveReady(true);
      }

      function resolveTrackFinished(trackInfo) {
        if (!trackInfo || trackInfo.finishedResolved) return;
        trackInfo.finishedResolved = true;
        trackInfo.resolveFinished(true);
      }

      function waitHandle(handle) {
        if (!handle || !handle.finished || typeof handle.finished.then !== 'function') {
          return Promise.resolve();
        }
        return handle.finished.then(function (completed) {
          if (completed === false && !cancelled && !closed) {
            throw makeSceneError('scene 效果在未取消的情况下提前结束。');
          }
          return true;
        });
      }

      function playTrackHandles(trackInfo) {
        var played = [];
        trackInfo.readyHandles.forEach(function (handle) {
          if (handle && typeof handle.play === 'function') {
            handle.play();
            played.push(handle);
          }
        });
        trackInfo.finishHandles.forEach(function (handle) {
          if (played.indexOf(handle) >= 0) return;
          if (handle && typeof handle.play === 'function') handle.play();
        });
      }

      function startTrack(runtime, trackInfo) {
        if (!trackInfo || trackInfo.started || closed || cancelled) return;
        trackInfo.started = true;
        /* 本 Binding 的第一个内容效果轨道开始接管：来源视觉交接释放。 */
        releaseSourceVisibility(runtime.member);
        if (!trackInfo.readyHandles.length && !trackInfo.finishHandles.length) {
          resolveTrackReady(trackInfo);
          resolveTrackFinished(trackInfo);
          return;
        }
        try {
          playTrackHandles(trackInfo);
        } catch (error) {
          fail(error);
          return;
        }
        if (!trackInfo.readyHandles.length) resolveTrackReady(trackInfo);
        else Promise.all(trackInfo.readyHandles.map(waitHandle)).then(function () {
          if (!cancelled && !closed) resolveTrackReady(trackInfo);
        }, function (error) {
          if (!cancelled && !closed) fail(error);
        });
        if (!trackInfo.finishHandles.length) resolveTrackFinished(trackInfo);
        else Promise.all(trackInfo.finishHandles.map(waitHandle)).then(function () {
          if (!cancelled && !closed) resolveTrackFinished(trackInfo);
        }, function (error) {
          if (!cancelled && !closed) fail(error);
        });
      }

      function startReveal(runtime) {
        if (!runtime || runtime.revealStarted || closed || cancelled) return;
        runtime.revealStarted = true;
        releaseSourceVisibility(runtime.member);
        var trackInfo = runtime.defaultTrack;
        trackInfo.started = true;
        var member = runtime.member;
        if (!runtime.revealContainer) {
          resolveTrackReady(trackInfo);
          resolveTrackFinished(trackInfo);
          return;
        }
        scope.reveal(runtime.revealContainer, member.finalTiming, {
          frameId: transition.to,
          bindingId: member.binding,
          effect: 'reveal'
        }).then(function (shown) {
          if (cancelled || closed) return;
          if (shown === false) {
            fail(makeSceneError('Binding "' + member.binding + '" 的 reveal 效果在未取消的情况下提前结束。', { binding: member.binding }));
            return;
          }
          resolveTrackReady(trackInfo);
          resolveTrackFinished(trackInfo);
        }, function (error) {
          if (cancelled || closed) return;
          fail(error);
        });
      }

      function startDefaultTrack(runtime) {
        if (!runtime || closed || cancelled) return;
        var member = runtime.member;
        if (member.mode === 'reveal') {
          startReveal(runtime);
          return;
        }
        if (member.mode === 'cut') {
          resolveTrackReady(runtime.defaultTrack);
          resolveTrackFinished(runtime.defaultTrack);
          return;
        }
        startTrack(runtime, runtime.defaultTrack);
      }

      function startGroupTracks(runtime, groups) {
        if (!runtime || !runtime.grouped || closed || cancelled) return;
        var member = runtime.member;
        if (!runtime.releaseStarted) {
          runtime.releaseStarted = true;
          if (runtime.layoutTrack) startTrack(runtime, runtime.layoutTrack);
          runtime.groupNames.forEach(function (name) {
            if (member.gatedGroups && own(member.gatedGroups, name)) return;
            startTrack(runtime, runtime.groupTracks[name]);
          });
        }
        groups.forEach(function (name) {
          if (runtime.groupTracks[name]) startTrack(runtime, runtime.groupTracks[name]);
        });
      }

      function startAllTracks(runtime) {
        if (!runtime || closed || cancelled) return;
        if (!runtime.grouped) {
          startDefaultTrack(runtime);
          return;
        }
        if (runtime.layoutTrack) startTrack(runtime, runtime.layoutTrack);
        runtime.groupNames.forEach(function (name) { startTrack(runtime, runtime.groupTracks[name]); });
      }

      function flushRuntime(runtime) {
        if (!runtime || !runtime.planned || !runtime.depsReady || closed || cancelled) return;
        var list = runtime.pending;
        runtime.pending = [];
        list.forEach(function (action) {
          if (closed || cancelled) return;
          try { action(); } catch (error) { fail(error); }
        });
      }

      function requestStart(runtime, action) {
        if (!runtime || closed || cancelled) return;
        runtime.pending.push(action);
        flushRuntime(runtime);
      }

      /* ---------------- after / reveal 依赖 ---------------- */

      function afterDependencyRefs(member) {
        var refs = [];
        if (member.after && member.after.length) {
          member.after.forEach(function (entry) {
            var targetMember = memberMap[entry && entry.binding];
            if (!targetMember) {
              throw makeSceneError('Binding "' + member.binding + '" 的 after 引用了本 scene 中不存在的 binding "' +
                String(entry && entry.binding) + '"。', { binding: member.binding, path: scenePath() });
            }
            if (entry.group == null) {
              refs.push({ kind: 'member', binding: entry.binding });
              return;
            }
            if (!targetMember.grouped) {
              throw makeSceneError('Binding "' + member.binding + '" 的 after 引用了 Binding "' + entry.binding +
                '" 的组 "' + entry.group + '"，但该 Binding 的 Adapter 未声明效果组。', {
                binding: member.binding,
                path: scenePath()
              });
            }
            if (targetMember.groups.indexOf(entry.group) < 0) {
              throw makeSceneError('Binding "' + member.binding + '" 的 after 引用了 Binding "' + entry.binding +
                '" 的未知效果组 "' + entry.group + '"（已声明：' + targetMember.groups.join('、') + '）。', {
                binding: member.binding,
                path: scenePath()
              });
            }
            refs.push({ kind: 'group', binding: entry.binding, group: entry.group });
          });
          return refs;
        }
        if (member.mode === 'reveal' && member.at === 'objects-settled') {
          members.forEach(function (other) {
            if (other.binding === member.binding || other.mode === 'reveal') return;
            refs.push({ kind: 'member', binding: other.binding });
          });
        }
        return refs;
      }

      function dependencyNode(ref) {
        if (ref.kind === 'group') return 'readyTrack:' + ref.binding + ':' + ref.group;
        return 'readyMember:' + ref.binding;
      }

      function dependencyPromise(ref) {
        var runtime = runtimes[ref.binding];
        if (!runtime) return Promise.resolve(true);
        if (ref.kind === 'group') {
          return runtime.groupTracks[ref.group] ? runtime.groupTracks[ref.group].ready : Promise.resolve(true);
        }
        return runtime.memberReady;
      }

      /* ---------------- 联合 waits-for 图（组级，prepare 后 commit 前） ---------------- */

      function graphNodeLabel(id) {
        var parts = id.split(':');
        if (parts[0] === 'attnArrive') return 'attention[' + parts[1] + '] 到达';
        if (parts[0] === 'attnReady') return 'attention[' + parts[1] + '] ready';
        if (parts[0] === 'startTrack') return 'Binding "' + parts[1] + '" 轨道 "' + parts.slice(2).join(':') + '" start';
        if (parts[0] === 'readyTrack') return 'Binding "' + parts[1] + '" 轨道 "' + parts.slice(2).join(':') + '" ready';
        if (parts[0] === 'readyMember') return 'Binding "' + parts[1] + '" ready';
        return id;
      }

      function verifyJointGraph() {
        var edges = {};
        function node(id) { if (!own(edges, id)) edges[id] = []; return id; }
        function edge(from, to) {
          node(from);
          if (edges[from].indexOf(to) < 0) edges[from].push(to);
        }
        function startTrackNode(member, name) { return 'startTrack:' + member.binding + ':' + name; }
        function readyTrackNode(member, name) { return 'readyTrack:' + member.binding + ':' + name; }
        members.forEach(function (member) {
          var runtime = runtimes[member.binding];
          node('readyMember:' + member.binding);
          var deps = afterDependencyRefs(member).map(dependencyNode);
          runtime.trackList.forEach(function (trackInfo) {
            edge(startTrackNode(member, trackInfo.name), readyTrackNode(member, trackInfo.name));
            edge(readyTrackNode(member, trackInfo.name), 'readyMember:' + member.binding);
            deps.forEach(function (dep) { edge(dep, startTrackNode(member, trackInfo.name)); });
          });
          if (!attentionEnabled || !runtime.attention) return;
          if (!runtime.grouped) {
            if (member.defaultGateIndex != null) {
              edge('attnArrive:' + member.defaultGateIndex, startTrackNode(member, 'default'));
            }
            return;
          }
          runtime.groupNames.forEach(function (name) {
            if (member.gatedGroups && own(member.gatedGroups, name)) {
              edge('attnArrive:' + member.gatedGroups[name], startTrackNode(member, name));
            } else {
              edge('attnArrive:' + member.firstContentIndex, startTrackNode(member, name));
            }
          });
          if (runtime.layoutTrack) {
            edge('attnArrive:' + member.firstContentIndex, startTrackNode(member, 'layout'));
          }
        });
        if (attentionEnabled && attention) {
          var infos = attention.targetInfos();
          infos.forEach(function (info, index) {
            node('attnArrive:' + index);
            node('attnReady:' + index);
            edge('attnArrive:' + index, 'attnReady:' + index);
            if (index > 0) edge('attnReady:' + (index - 1), 'attnArrive:' + index);
            if (!info || info.kind !== 'content' || !info.member) return;
            var runtime = runtimes[info.member.binding];
            if (!runtime) return;
            if (info.groups == null) {
              edge(readyTrackNode(info.member, 'default'), 'attnReady:' + index);
              return;
            }
            info.groups.forEach(function (name) {
              edge(readyTrackNode(info.member, name), 'attnReady:' + index);
            });
            if (runtime.layoutTrack && info.member.firstContentIndex === index) {
              edge(readyTrackNode(info.member, 'layout'), 'attnReady:' + index);
            }
          });
        }
        var visitState = {};
        var stack = [];
        var cycleReported = 0;
        function visit(id) {
          if (visitState[id] === 2 || cycleReported > 2) return;
          if (visitState[id] === 1) {
            var cycleStart = stack.indexOf(id);
            var cycle = stack.slice(cycleStart >= 0 ? cycleStart : 0).concat([id]);
            cycleReported += 1;
            throw makeSceneError('scene 联合依赖形成循环（waits-for，attention 顺序 + after/reveal）：' +
              cycle.map(graphNodeLabel).join(' → '), {
              path: scenePath(),
              cycle: cycle.map(graphNodeLabel)
            });
          }
          visitState[id] = 1;
          stack.push(id);
          var next = edges[id] || [];
          for (var e = 0; e < next.length; e += 1) visit(next[e]);
          stack.pop();
          visitState[id] = 2;
        }
        Object.keys(edges).forEach(function (id) { visit(id); });
      }

      /* ---------------- 提交 ---------------- */

      function commitAll() {
        members.forEach(function (member) {
          try {
            member.prepared.commit();
          } catch (error) {
            throw makeSceneError('Binding "' + member.binding + '" 提交 scene 目标失败：' + messageOf(error), { binding: member.binding });
          }
        });
        members.forEach(function (member) {
          if (member.mode !== 'reveal') return;
          var container = member.entry.container;
          if (!isElement(container)) return;
          member.revealContainer = container;
          var runtime = runtimes[member.binding];
          if (runtime) runtime.revealContainer = container;
          if (member.at === 'start') return;
          /* after 与旧 objects-settled 都要求目标内容先保持隐藏，启动时整块显现。 */
          scope.hideReveal(container);
        });
      }

      /* 目标提交后，调用方/参与者的真实状态都必须与目标 Frame 一致；cut/reveal 有 readView 时同样核对。 */
      function verifyCommitted() {
        members.forEach(function (member) {
          runPreparedComparison(definition, transition.to, member.binding, member.targetView, member.handle);
        });
      }

      function captureTargetsByMember() {
        var targetsByMember = {};
        members.forEach(function (member) {
          if (member.mode !== 'layout') return;
          var targets;
          try { targets = member.prepared.targets(); } catch (error) { targets = []; }
          targetsByMember[member.binding] = isArray(targets) ? targets : [];
        });
        return targetsByMember;
      }

      function planEffects(targetsByMember) {
        members.forEach(function (member) {
          var runtime = runtimes[member.binding];
          scope.planLayoutEffects(runtime, targetsByMember);
          scope.planAdapterEffects(runtime);
          runtime.planned = true;
        });
      }

      function scheduleMembers() {
        members.forEach(function (member) {
          var runtime = runtimes[member.binding];
          var deps;
          try {
            deps = afterDependencyRefs(member).map(dependencyPromise);
          } catch (error) {
            fail(error);
            return;
          }
          Promise.all(deps).then(function () {
            if (closed || cancelled) return;
            runtime.depsReady = true;
            flushRuntime(runtime);
            if (!attentionEnabled || !runtime.attention) {
              requestStart(runtime, function () { startAllTracks(runtime); });
            }
          }, function (error) {
            if (!closed && !cancelled) fail(error);
          });
        });
      }

      function waitForAll(promises) {
        return Promise.all(promises.map(function (p) {
          return p && typeof p.then === 'function' ? p : Promise.resolve();
        }));
      }

      function waitPresentationFinished() {
        if (!port || typeof port.finished !== 'function') return Promise.resolve();
        try {
          return Promise.resolve(port.finished());
        } catch (error) {
          return Promise.reject(makeSceneError('scene 字幕/标记收尾失败：' + messageOf(error)));
        }
      }

      function settlePort() {
        if (!port) return null;
        var error = null;
        try {
          if (typeof port.settle === 'function') port.settle();
        } catch (settleFailure) {
          error = settleFailure;
          try { if (typeof port.cancel === 'function') port.cancel(); } catch (cancelFailure) { /* ignore */ }
        }
        port = null;
        return error;
      }

      function createRuntimes() {
        members.forEach(function (member) {
          runtimes[member.binding] = createMemberRuntime(member);
        });
      }

      function execute() {
        if (signal && signal.aborted) {
          cancel();
          return;
        }
        if (signal && typeof signal.addEventListener === 'function') {
          try { signal.addEventListener('abort', onAbort); } catch (error) { /* ignore */ }
        }
        collectMembers();
        scope = effectsScopeModule().createScope({ frameId: transition.to, timing: markTiming });
        if (scene && scene.attention && (!presentation || typeof presentation.prepareScene !== 'function')) {
          fail(makeSceneError('scene attention 需要默认舞台 presentation（NoteDemo.mount 默认提供；NoteDemo.create 自定义宿主需提供同一 port）'));
          return;
        }
        prepareAll().then(function () {
          if (closed || cancelled) {
            if (!closed) cancel();
            return;
          }
          try {
            validatePrepared();
            /* 提交前捕获来源可见性（sourceElements）；减少动效不建立交接，直接落终态。 */
            if (motionName !== 'reduced') {
              collectSourceElements();
            }
            if (motionName !== 'reduced') {
              discoverGroups();
            }
            /* attention 先完成分组门控校验，再创建含 attention/分组信息的运行轨道。 */
            setupAttention();
            createRuntimes();
            if (motionName !== 'reduced') {
              verifyJointGraph();
            }
            if (presentation && typeof presentation.prepareScene === 'function') {
              /* 先建立 port 与隐藏旧标记，再捕获旧布局并提交。 */
              try {
                port = presentation.prepareScene({
                  sourceFrame: sourceFrame,
                  targetFrame: targetFrame,
                  attention: scene.attention,
                  attentionCoordinator: attentionCoordinator,
                  motion: motionName,
                  reason: reason,
                  cause: reason,
                  bindings: members.map(function (member) {
                    return { bindingId: member.binding, handle: member.handle, container: member.entry.container };
                  })
                }) || null;
              } catch (error) {
                throw makeSceneError('scene 标记准备失败：' + messageOf(error));
              }
            }
            geometryModule().captureSourceRects(members);
            /* 在任何目标/来源样式写入之前进入受控模式；commit 与第一条效果轨道之间不暴露未接管画面。 */
            if (typeof bindings.beginSceneControl !== 'function') {
              throw makeSceneError('scene 需要 bindings.beginSceneControl 以接管受控画面。');
            }
            bindings.beginSceneControl(members.map(function (member) { return member.binding; }));
            commitAll();
            /* commit 后目标状态可能把来源对象压成不可见；在同一个同步任务里用内联覆盖恢复来源视觉。 */
            holdSourceVisibility();
            var targetsByMember = captureTargetsByMember();
            verifyCommitted();
            if (port && typeof port.commitTargetGeometry === 'function') {
              var geometryInfo = port.commitTargetGeometry();
              if (geometryInfo && isArray(geometryInfo.markRoots)) scope.setMarkRoots(geometryInfo.markRoots);
            }
            if (motionName === 'reduced') {
              /* 减少动效：揭示与标记直接到位，不创建动画/进度；仍执行提交后核对与收尾。 */
              scope.showRevealContainers();
              scope.showMarkRoots();
              var reducedSettleError = settlePort();
              cleanup();
              if (reducedSettleError) {
                fail(makeSceneError('scene 标记/字幕收尾失败：' + messageOf(reducedSettleError)));
                return;
              }
              afterFrame().then(function () {
                if (!closed) finish({ status: 'completed' });
              });
              return;
            }
            /* 所有 update/layout 的效果在同一提交任务里按轨道预置为暂停起点；
             * after/attention 只决定各轨道 play 的时机，不会让目标值先闪现。 */
            planEffects(targetsByMember);
            var markHandles = scope.planMarkEffects();
            scheduleMembers();
            waitForAll(members.map(function (member) { return runtimes[member.binding].memberFinished; })).then(function () {
              if (closed || cancelled) return null;
              return waitForAll(markHandles.map(waitHandle));
            }).then(function () {
              if (closed || cancelled) return null;
              return waitPresentationFinished();
            }).then(function () {
              if (closed || cancelled) return;
              var settleError = settlePort();
              cleanup();
              if (settleError) {
                fail(makeSceneError('scene 标记/字幕收尾失败：' + messageOf(settleError)));
                return;
              }
              afterFrame().then(function () {
                if (!closed) finish({ status: 'completed' });
              });
            }).then(null, function (error) {
              if (!closed && !cancelled) fail(error);
            });
          } catch (error) {
            fail(error);
          }
        }, function (error) {
          fail(error);
        });
      }

      try {
        definition = definitionModule();
        effects = effectsModule();
        if (!isObject(plan) || !isObject(plan.frameById)) throw makeSceneError('scene.run 需要有效的 plan。');
        if (!bindings || typeof bindings.entry !== 'function' || typeof bindings.readView !== 'function') {
          throw makeSceneError('scene.run 需要 bindings bag（含 entry / readView）。');
        }
        execute();
      } catch (error) {
        fail(error);
      }
    });
  }

  Internals.scene = {
    run: run
  };
})(window);

/* ---- source: src/demo/runner.js ---- */
/* NoteDemo runner — 按计划串行/并行执行一次过渡动作，核对组件真实状态。
 * Scope: window.NoteDemoInternals.runner
 * Depends on: NoteDemoInternals.definition（compareModel / compareCues / describeDiff）。
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

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
  }

  function messageOf(error) {
    if (error == null) return '';
    if (typeof error === 'string') return error;
    if (error.message != null) return String(error.message);
    return String(error);
  }

  function noop() {}

  function definitionModule() {
    var definition = Internals.definition;
    if (!definition || typeof definition.compareModel !== 'function' ||
        typeof definition.compareCues !== 'function' || typeof definition.describeDiff !== 'function') {
      throw new Error('runner 需要先加载 NoteDemoInternals.definition。');
    }
    return definition;
  }

  function viewsFor(plan, frameId) {
    if (!plan || !plan.frameById) return null;
    var frame = plan.frameById[frameId];
    return frame && frame.views ? frame.views : null;
  }

  function mismatchError(definition, kind, frameId, binding, action, diff) {
    var suffix = kind === 'model'
      ? '动作执行后的 model 与目标 Frame 不一致（不调用 restore 掩盖）。'
      : '应用目标 cues 后读回与目标 Frame 不一致。';
    var error = new Error(definition.describeDiff(frameId, binding, action, diff) + suffix);
    error.details = {
      frameId: frameId,
      binding: binding,
      action: action,
      path: diff.path,
      expected: diff.expected,
      actual: diff.actual
    };
    error.binding = binding;
    error.action = action;
    return error;
  }

  function augment(error, frameId, binding, action) {
    var base = error instanceof Error ? error : new Error(messageOf(error));
    var details = isObject(base.details) ? base.details : {};
    if (details.frameId === undefined) details.frameId = frameId;
    if (details.binding === undefined && binding != null) details.binding = binding;
    if (details.action === undefined && action != null) details.action = action;
    base.details = details;
    if (base.binding === undefined && binding != null) base.binding = binding;
    if (base.action === undefined && action != null) base.action = action;
    return base;
  }

  function run(config) {
    var options = isObject(config) ? config : {};
    var plan = options.plan;
    var transition = options.transition || null;
    var bindings = options.bindings;
    var signal = options.signal || null;
    var motion = options.motion === 'reduced' ? 'reduced' : 'normal';

    return new Promise(function (resolve, reject) {
      var definition;
      var actions;
      var sourceViews;
      var targetViews;
      var frameId;
      var started = [];
      var actionBindings = [];
      var seenActionBindings = {};
      var cancelled = false;
      var closed = false;

      try {
        definition = definitionModule();
        if (!isObject(plan) || !isObject(plan.frameById)) throw new Error('runner.run 需要有效的 plan。');
        if (!bindings || typeof bindings.readView !== 'function' || typeof bindings.applyCues !== 'function' ||
            typeof bindings.entry !== 'function') {
          throw new Error('runner.run 需要 bindings bag（含 readView / applyCues / entry）。');
        }
      } catch (error) {
        reject(error);
        return;
      }

      actions = transition && isArray(transition.actions) ? transition.actions : [];
      sourceViews = viewsFor(plan, transition && transition.from);
      targetViews = viewsFor(plan, transition && transition.to);
      frameId = transition ? transition.to : null;

      function cleanup() {
        if (signal && typeof signal.removeEventListener === 'function') {
          try {
            signal.removeEventListener('abort', onAbort);
          } catch (error) {
            /* ignore */
          }
        }
      }

      function finish(value) {
        if (closed) return;
        closed = true;
        cleanup();
        resolve(value);
      }

      function fail(error) {
        if (closed) return;
        closed = true;
        cleanup();
        reject(error);
      }

      function cancelStarted() {
        for (var i = 0; i < started.length; i += 1) {
          try {
            started[i].cancel();
          } catch (error) {
            /* 取消失败也必须继续让其他句柄失效 */
          }
        }
      }

      function waitStarted() {
        var waits = [];
        for (var i = 0; i < started.length; i += 1) {
          waits.push(started[i].finished.then(noop, noop));
        }
        return Promise.all(waits);
      }

      function closeCancelled() {
        finish({ status: 'cancelled' });
      }

      /* 外部 abort 与组件自报 cancelled 共用同一失效路径：先取消句柄并等待结算，再以 cancelled 关闭。 */
      function cancelRun() {
        if (closed || cancelled) return;
        cancelled = true;
        cancelStarted();
        waitStarted().then(closeCancelled, closeCancelled);
      }

      function onAbort() {
        cancelRun();
      }

      function rememberActionBinding(bindingId, action) {
        if (!own(seenActionBindings, bindingId)) {
          seenActionBindings[bindingId] = actionBindings.length;
          actionBindings.push({ binding: bindingId, action: action });
          return;
        }
        actionBindings[seenActionBindings[bindingId]].action = action;
      }

      function startPerform(bindingId, action) {
        if (!isNonEmptyString(bindingId)) {
          fail(augment(new Error('动作缺少 binding。'), frameId, null, action));
          return null;
        }
        var entry = null;
        try {
          entry = bindings.entry(bindingId);
        } catch (error) {
          entry = null;
        }
        var handle = entry && entry.handle ? entry.handle : null;
        if (!handle || typeof handle.perform !== 'function') {
          fail(augment(new Error('Binding "' + bindingId + '" 没有 perform，无法执行动作。'), frameId, bindingId, action));
          return null;
        }
        var effect;
        try {
          effect = handle.perform(action, {
            signal: signal,
            motion: motion,
            sourceView: sourceViews ? sourceViews[bindingId] : null,
            targetView: targetViews ? targetViews[bindingId] : null
          });
        } catch (error) {
          fail(augment(error, frameId, bindingId, action));
          return null;
        }
        if (!effect || typeof effect.cancel !== 'function' ||
            !effect.finished || typeof effect.finished.then !== 'function') {
          fail(augment(new Error('Binding "' + bindingId + '" 的 perform 必须返回 {finished: Promise, cancel: Function}。'),
            frameId, bindingId, action));
          return null;
        }
        var finished = Promise.resolve(effect.finished);
        finished.catch(noop);
        var item = {
          binding: bindingId,
          action: action,
          finished: finished,
          cancel: function () {
            try {
              effect.cancel();
            } catch (error) {
              /* ignore */
            }
          }
        };
        started.push(item);
        rememberActionBinding(bindingId, action);
        return item;
      }

      function runSingle(action, next) {
        var item = startPerform(action.binding, action);
        if (!item) return;
        item.finished.then(function (outcome) {
          if (closed || cancelled) return;
          if (outcome && outcome.status === 'completed') {
            next();
            return;
          }
          cancelRun();
        }, function (error) {
          if (closed || cancelled) return;
          cancelStarted();
          fail(augment(error, frameId, action.binding, action));
        });
      }

      function runParallel(action, next) {
        var members = action.parallel;
        var items = [];
        for (var i = 0; i < members.length; i += 1) {
          var member = members[i];
          if (!isObject(member) || !isNonEmptyString(member.binding)) {
            fail(augment(new Error('parallel 组内的动作缺少 binding。'), frameId, null, action));
            return;
          }
          var item = startPerform(member.binding, member);
          if (!item) return;
          items.push({ item: item, binding: member.binding, action: member });
        }
        if (closed || cancelled) return;
        var waits = [];
        for (var w = 0; w < items.length; w += 1) {
          (function (entry) {
            waits.push(entry.item.finished.then(function (outcome) {
              return { entry: entry, outcome: outcome };
            }, function (error) {
              return { entry: entry, error: error };
            }));
          })(items[w]);
        }
        Promise.all(waits).then(function (results) {
          if (closed || cancelled) return;
          for (var r = 0; r < results.length; r += 1) {
            if (results[r].error) {
              cancelStarted();
              fail(augment(results[r].error, frameId, results[r].entry.binding, results[r].entry.action));
              return;
            }
          }
          for (var c = 0; c < results.length; c += 1) {
            var outcome = results[c].outcome;
            if (!outcome || outcome.status !== 'completed') {
              cancelRun();
              return;
            }
          }
          next();
        });
      }

      function readActionView(bindingId, action) {
        var view;
        try {
          view = bindings.readView(bindingId);
        } catch (error) {
          fail(augment(error, frameId, bindingId, action));
          return null;
        }
        if (!isObject(view) || !own(view, 'model')) {
          fail(augment(new Error('Binding "' + bindingId + '" 的 readView 没有返回 {model,cues}。'), frameId, bindingId, action));
          return null;
        }
        return view;
      }

      function afterActions() {
        if (closed || cancelled) return;
        var i;
        var entry;
        for (i = 0; i < actionBindings.length; i += 1) {
          entry = actionBindings[i];
          var targetView = targetViews ? targetViews[entry.binding] : null;
          if (!targetView) {
            fail(augment(new Error('目标 Frame 缺少 binding "' + entry.binding + '" 的视图。'), frameId, entry.binding, entry.action));
            return;
          }
          var actual = readActionView(entry.binding, entry.action);
          if (closed) return;
          var diff = definition.compareModel(targetView.model, actual.model);
          if (diff) {
            fail(mismatchError(definition, 'model', frameId, entry.binding, entry.action, diff));
            return;
          }
        }
        if (closed || cancelled) return;
        for (i = 0; i < actionBindings.length; i += 1) {
          entry = actionBindings[i];
          var cueTarget = targetViews ? targetViews[entry.binding] : null;
          if (!cueTarget) {
            fail(augment(new Error('目标 Frame 缺少 binding "' + entry.binding + '" 的视图。'), frameId, entry.binding, entry.action));
            return;
          }
          try {
            bindings.applyCues(entry.binding, cueTarget.cues);
          } catch (error) {
            fail(augment(error, frameId, entry.binding, entry.action));
            return;
          }
          var readBack = readActionView(entry.binding, entry.action);
          if (closed) return;
          var cueDiff = definition.compareCues(cueTarget.cues, readBack.cues);
          if (cueDiff) {
            fail(mismatchError(definition, 'cues', frameId, entry.binding, entry.action, cueDiff));
            return;
          }
        }
        if (closed || cancelled) return;
        /* 本步必要的最终提示（组件内的颜色/文字淡入等）也应在本步结束前收束，
         * 避免按钮恢复可用后画面又自行开始一轮提示动效。 */
        var settleWaits = [];
        for (var s = 0; s < actionBindings.length; s += 1) {
          var settleId = actionBindings[s].binding;
          var settlePromise = null;
          try {
            settlePromise = bindings.settleVisual(settleId);
          } catch (settleError) {
            settlePromise = null;
          }
          if (settlePromise && typeof settlePromise.then === 'function') settleWaits.push(settlePromise);
        }
        if (!settleWaits.length) {
          finish({ status: 'completed' });
          return;
        }
        Promise.all(settleWaits.map(function (promise) {
          return Promise.resolve(promise).then(noop, noop);
        })).then(function () {
          if (closed || cancelled) return;
          finish({ status: 'completed' });
        });

      }

      function runActionAt(index) {
        if (closed || cancelled) return;
        if (index >= actions.length) {
          afterActions();
          return;
        }
        var action = actions[index];
        if (isObject(action) && isArray(action.parallel)) {
          runParallel(action, function () {
            runActionAt(index + 1);
          });
          return;
        }
        runSingle(action, function () {
          runActionAt(index + 1);
        });
      }

      if (signal && typeof signal.addEventListener === 'function') {
        try {
          signal.addEventListener('abort', onAbort);
        } catch (error) {
          /* 没有可用的取消通道时仍继续正常执行 */
        }
      }
      if (signal && signal.aborted) {
        onAbort();
        return;
      }
      runActionAt(0);
    });
  }

  Internals.runner = {
    run: run
  };
})(window);

/* ---- source: src/demo/bindings.js ---- */
/* NoteDemo bindings — 在宿主 slot 内为每个受控 binding 建立独立子容器并管理 BindingHandle。
 * Scope: window.NoteDemoInternals.bindings
 * Depends on: 无（只使用 DOM 与 plan 数据）。
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

  function isElement(value) {
    return !!value && value.nodeType === 1;
  }

  function messageOf(error) {
    if (error == null) return '';
    if (typeof error === 'string') return error;
    if (error.message != null) return String(error.message);
    return String(error);
  }

  function repr(value) {
    if (typeof value === 'string') return '"' + value + '"';
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (isArray(value)) return '数组';
    if (typeof value === 'object') return '对象';
    return String(value);
  }

  function bindingsError(bindingId, slotName, message, cause) {
    var where = 'Binding "' + String(bindingId) + '"' + (slotName == null ? '' : '（slot "' + String(slotName) + '"）');
    var error = new Error('NoteDemo 绑定错误：' + where + '：' + message);
    error.name = 'NoteDemoBindingError';
    error.binding = bindingId;
    if (slotName != null) error.slot = slotName;
    error.details = { binding: bindingId };
    if (slotName != null) error.details.slot = slotName;
    if (cause !== undefined && cause !== null) {
      error.cause = cause;
      error.details.cause = messageOf(cause);
    }
    return error;
  }

  function removeNode(node) {
    if (node && node.parentNode) {
      try {
        node.parentNode.removeChild(node);
      } catch (error) {
        /* 节点可能已经被适配器移除 */
      }
    }
  }

  function markRefs(mark) {
    if (!isObject(mark)) return [];
    if (mark.kind === 'focus') return mark.target ? [mark.target] : [];
    if (mark.kind === 'range') return isArray(mark.targets) ? mark.targets.slice() : [];
    if (mark.kind === 'link') {
      var refs = [];
      if (mark.from) refs.push(mark.from);
      if (mark.to) refs.push(mark.to);
      return refs;
    }
    return [];
  }

  function collectMarkRefs(marks, target) {
    if (!isArray(marks)) return;
    for (var i = 0; i < marks.length; i += 1) {
      var refs = markRefs(marks[i]);
      for (var r = 0; r < refs.length; r += 1) {
        if (refs[r] && typeof refs[r].binding === 'string') target[refs[r].binding] = true;
      }
    }
  }

  function collectRequirements(plan) {
    var actionBindings = {};
    var targetBindings = {};
    var sceneBindings = {};
    var transitions = plan && plan.transitions ? plan.transitions : {};
    Object.keys(transitions).forEach(function (key) {
      var transition = transitions[key];
      if (!transition) return;
      var actions = isArray(transition.actions) ? transition.actions : [];
      for (var i = 0; i < actions.length; i += 1) {
        var action = actions[i];
        if (!isObject(action)) continue;
        if (isArray(action.parallel)) {
          for (var m = 0; m < action.parallel.length; m += 1) {
            var member = action.parallel[m];
            if (member && typeof member.binding === 'string') actionBindings[member.binding] = true;
          }
        } else if (typeof action.binding === 'string') {
          actionBindings[action.binding] = true;
        }
      }
      collectMarkRefs(transition.marks, targetBindings);
      if (transition.scene && isArray(transition.scene.bindings)) {
        for (var s = 0; s < transition.scene.bindings.length; s += 1) {
          var member = transition.scene.bindings[s];
          if (!member || typeof member.binding !== 'string') continue;
          if (!sceneBindings[member.binding]) sceneBindings[member.binding] = { layout: false, update: false };
          /* layout 与 update 都要求 prepareChange + readView；cut/reveal 可用 restore 包装。 */
          if (member.mode === 'layout') sceneBindings[member.binding].layout = true;
          else if (member.mode === 'update') sceneBindings[member.binding].update = true;
        }
      }
    });
    var frames = plan && isArray(plan.frames) ? plan.frames : [];
    for (var f = 0; f < frames.length; f += 1) collectMarkRefs(frames[f] && frames[f].marks, targetBindings);
    return { action: actionBindings, target: targetBindings, scene: sceneBindings };
  }

  function create(config) {
    var options = isObject(config) ? config : {};
    var plan = options.plan;
    var slots = options.slots === undefined ? {} : options.slots;
    var adapters = isObject(options.adapters) ? options.adapters : {};

    if (!isObject(plan) || !isObject(plan.bindings)) {
      throw new Error('NoteDemo bindings.create 需要 definition.prepare 生成的 plan。');
    }
    if (!isObject(slots)) {
      throw new Error('NoteDemo bindings.create 的 slots 必须是名称到 Element 的映射。');
    }

    var order = isArray(plan.bindingOrder) ? plan.bindingOrder.slice() : Object.keys(plan.bindings);
    var entries = {};
    var created = [];
    var destroyed = false;

    function release(entry) {
      if (!entry || entry.released) return;
      entry.released = true;
      if (entry.handle && typeof entry.handle.destroy === 'function') {
        try {
          entry.handle.destroy();
        } catch (error) {
          /* destroy 必须继续清理其余绑定 */
        }
      }
      removeNode(entry.container);
    }

    function releaseAll() {
      for (var i = created.length - 1; i >= 0; i -= 1) release(created[i]);
    }

    function entryOf(bindingId) {
      return own(entries, bindingId) ? entries[bindingId] : null;
    }

    function viewFor(frame, bindingId) {
      if (!frame || !isObject(frame.views)) return null;
      return own(frame.views, bindingId) ? frame.views[bindingId] : null;
    }

    /* 公共接管标记：只落到本 Binding 容器，CSS 见 src/demo/scene-control.css。
     * 这是一次运行/一次恢复期间的内部状态，不向作者暴露第二套生命周期。 */
    function setSceneControlled(entry, on) {
      if (!entry || !entry.container || !entry.container.setAttribute) return;
      if (on) {
        entry.sceneControlled = true;
        entry.container.setAttribute('data-note-scene-active', 'true');
      } else {
        entry.sceneControlled = false;
        entry.container.removeAttribute('data-note-scene-active');
      }
    }

    function flushControlledStyle(entry) {
      if (!entry || !entry.container) return;
      /* 强制让浏览器在当前任务里按 transition:none 计算受控子树，并完成布局。
       * 只有确认受控状态下的最终样式已经生效，才允许撤掉接管；否则同一任务内的
       * “加标记—写 restore—撤标记”可能被合并，恢复仍会启动自动补间。 */
      try {
        var style = global.getComputedStyle(entry.container);
        if (style) style.getPropertyValue('transition-duration');
        entry.container.getBoundingClientRect();
        // 读取布局尺寸，确保恢复写入引起的 transform/几何变化已结算。
        void entry.container.offsetWidth;
      } catch (error) {
        /* 容器已断开时没有可确认的样式。 */
      }
    }

    function releaseSceneControl(entry) {
      if (!entry || !entry.sceneControlled) return;
      flushControlledStyle(entry);
      setSceneControlled(entry, false);
    }

    function restoreEntry(entry, view) {
      if (!view || !isObject(view)) {
        throw bindingsError(entry.id, entry.slotName, '缺少可恢复的视图 {model,cues}');
      }
      /* 恢复本身也必须是受控写入：先暂停受控内容的 CSS transition，写入来源/目标，
       * 确认受控样式已结算，再释放。这样 go/prev/取消恢复不会出现未登记的补间。 */
      var held = entry.sceneControlled === true;
      if (!held) setSceneControlled(entry, true);
      try {
        entry.handle.restore(view);
      } catch (error) {
        throw bindingsError(entry.id, entry.slotName, 'restore 失败：' + messageOf(error), error);
      } finally {
        if (!held) releaseSceneControl(entry);
      }
    }

    try {
      for (var i = 0; i < order.length; i += 1) {
        var bindingId = order[i];
        var bindingConfig = own(plan.bindings, bindingId) ? plan.bindings[bindingId] : null;
        if (!isObject(bindingConfig)) {
          throw bindingsError(bindingId, null, 'plan.bindings 中缺少该 binding 的配置');
        }
        var slotName = bindingConfig.slot;
        var slotEl = slotName != null && own(slots, slotName) ? slots[slotName] : null;
        if (!slotEl) {
          throw bindingsError(bindingId, slotName, '找不到 slot ' + repr(slotName) + '（bindings 必须在宿主提供的 slots 中挂载）');
        }
        if (!isElement(slotEl)) {
          throw bindingsError(bindingId, slotName, 'slot ' + repr(slotName) + ' 不是 Element');
        }
        var adapter = bindingConfig.adapter;
        if (!adapter && bindingConfig.adapterName && own(adapters, bindingConfig.adapterName)) {
          adapter = adapters[bindingConfig.adapterName];
        }
        if (!adapter || typeof adapter !== 'object') {
          throw bindingsError(bindingId, slotName, '找不到 Adapter ' + repr(bindingConfig.adapterName));
        }
        var owned = bindingConfig.ownership !== 'borrowed';
        var mountOptions = isObject(bindingConfig.options) ? bindingConfig.options : {};
        var container = global.document.createElement('div');
        container.className = 'note-demo-binding';
        container.setAttribute('data-binding', String(bindingId));
        slotEl.appendChild(container);

        var handle;
        try {
          if (owned) {
            if (typeof adapter.mount !== 'function') throw new Error('Adapter 缺少 mount');
            handle = adapter.mount(container, mountOptions);
          } else {
            if (typeof adapter.adopt !== 'function') throw new Error('Adapter 缺少 adopt（borrowed 需要借用外部实例）');
            if (bindingConfig.instance === undefined || bindingConfig.instance === null) {
              throw new Error('borrowed binding 缺少 instance');
            }
            handle = adapter.adopt(bindingConfig.instance, mountOptions);
          }
        } catch (error) {
          removeNode(container);
          throw bindingsError(bindingId, slotName,
            (owned ? 'mount' : 'adopt') + ' 失败：' + messageOf(error), error);
        }
        if (!handle || typeof handle.restore !== 'function') {
          if (handle && typeof handle.destroy === 'function') {
            try { handle.destroy(); } catch (error) { /* ignore */ }
          }
          removeNode(container);
          throw bindingsError(bindingId, slotName, 'Adapter 没有返回有效 BindingHandle（需要 restore）');
        }
        var entry = {
          id: bindingId,
          adapterName: bindingConfig.adapterName || adapter.name || '',
          adapter: adapter,
          handle: handle,
          sceneControlled: false,
          container: container,
          owned: owned,
          slotName: slotName,
          options: mountOptions,
          timingDefaults: bindingConfig.timingDefaults || {}
        };
        entries[bindingId] = entry;
        created.push(entry);
      }

      /* ---- 挂载后能力检查（动作需要 perform+readView，标记需要 target） ---- */
      var requirements = collectRequirements(plan);
      Object.keys(requirements.action).forEach(function (requiredId) {
        var entry = entryOf(requiredId);
        if (!entry) {
          throw bindingsError(requiredId, null, '动作引用了未挂载的 binding');
        }
        if (typeof entry.handle.perform !== 'function') {
          throw bindingsError(requiredId, entry.slotName, '该 binding 被动作引用，但组件没有 perform 能力');
        }
        if (typeof entry.handle.readView !== 'function') {
          throw bindingsError(requiredId, entry.slotName, '该 binding 被动作引用，但组件没有 readView 能力（无法核对动作结果）');
        }
      });
      Object.keys(requirements.scene).forEach(function (requiredId) {
        var sceneEntry = entryOf(requiredId);
        if (!sceneEntry) {
          throw bindingsError(requiredId, null, 'scene 引用了未挂载的 binding');
        }
        var sceneNeeds = requirements.scene[requiredId];
        ['layout', 'update'].forEach(function (mode) {
          if (!sceneNeeds[mode]) return;
          if (typeof sceneEntry.handle.prepareChange !== 'function') {
            throw bindingsError(requiredId, sceneEntry.slotName,
              '该 binding 以 scene ' + mode + ' 参与，但组件没有 prepareChange 能力');
          }
          if (typeof sceneEntry.handle.readView !== 'function') {
            throw bindingsError(requiredId, sceneEntry.slotName,
              '该 binding 以 scene ' + mode + ' 参与，但组件没有 readView 能力（无法核对提交结果）');
          }
        });
      });
      Object.keys(requirements.target).forEach(function (requiredId) {
        var entry = entryOf(requiredId);
        if (!entry) {
          throw bindingsError(requiredId, null, '标记引用了未挂载的 binding');
        }
        if (typeof entry.handle.target !== 'function') {
          throw bindingsError(requiredId, entry.slotName, '该 binding 被标记引用，但组件没有 target 能力（无法定位标记目标）');
        }
      });
    } catch (error) {
      releaseAll();
      throw error;
    }

    var bag = {
      order: order,
      entries: entries,
      restoreFrame: function (frame) {
        for (var i = 0; i < order.length; i += 1) {
          var entry = entries[order[i]];
          if (!entry) continue;
          restoreEntry(entry, viewFor(frame, entry.id));
        }
        return bag;
      },
      restoreBindings: function (ids, frame) {
        var list = isArray(ids) ? ids : [];
        for (var i = 0; i < list.length; i += 1) {
          var entry = entryOf(list[i]);
          if (!entry) throw bindingsError(list[i], null, '恢复时找不到该 binding');
          restoreEntry(entry, viewFor(frame, entry.id));
        }
        return bag;
      },
      applyCues: function (bindingId, cues) {
        var entry = entryOf(bindingId);
        if (!entry || typeof entry.handle.applyCues !== 'function') return undefined;
        try {
          entry.handle.applyCues(cues);
        } catch (error) {
          throw bindingsError(entry.id, entry.slotName, 'applyCues 失败：' + messageOf(error), error);
        }
        return undefined;
      },
      settleVisual: function (bindingId) {
        var entry = entryOf(bindingId);
        if (!entry || typeof entry.handle.settleVisual !== 'function') return undefined;
        try {
          return entry.handle.settleVisual();
        } catch (error) {
          return undefined;
        }
      },
      readView: function (bindingId) {
        var entry = entryOf(bindingId);
        if (!entry || typeof entry.handle.readView !== 'function') return null;
        try {
          return entry.handle.readView();
        } catch (error) {
          throw bindingsError(entry.id, entry.slotName, 'readView 失败：' + messageOf(error), error);
        }
      },
      target: function (ref) {
        if (!isObject(ref) || typeof ref.binding !== 'string') return null;
        var entry = entryOf(ref.binding);
        if (!entry || typeof entry.handle.target !== 'function') return null;
        try {
          var element = entry.handle.target(ref.query);
          return element && element.nodeType === 1 ? element : null;
        } catch (error) {
          return null;
        }
      },
      entry: function (bindingId) {
        return entryOf(bindingId);
      },
      beginSceneControl: function (ids) {
        var list = isArray(ids) ? ids : order;
        for (var i = 0; i < list.length; i += 1) {
          var controlled = entryOf(list[i]);
          if (controlled) setSceneControlled(controlled, true);
        }
        return bag;
      },
      endSceneControl: function (ids) {
        var list = isArray(ids) ? ids : order;
        for (var i = 0; i < list.length; i += 1) {
          var controlled = entryOf(list[i]);
          if (controlled) releaseSceneControl(controlled);
        }
        return bag;
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        releaseAll();
      }
    };

    return bag;
  }

  Internals.bindings = {
    create: create
  };
})(window);

/* ---- source: src/demo/controller.js ---- */
/* NoteDemo controller — 会话状态、导航、取消、错误恢复与订阅。
 * Scope: window.NoteDemoInternals.controller
 * Depends on: NoteDemoInternals.runner（执行过渡）；NoteCore.motion（减少动效，可选）。
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

  function repr(value) {
    if (typeof value === 'string') return '"' + value + '"';
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (isArray(value)) return '数组';
    if (typeof value === 'object') return '对象';
    return String(value);
  }

  function messageOf(error) {
    if (error == null) return '';
    if (typeof error === 'string') return error;
    if (error.message != null) return String(error.message);
    return String(error);
  }

  function actionLabel(action) {
    if (action == null) return null;
    if (typeof action === 'string') return action;
    if (isObject(action) && isArray(action.parallel)) return 'parallel';
    if (isObject(action) && action.type != null) return String(action.type);
    return 'action';
  }

  function create(config) {
    var options = isObject(config) ? config : {};
    var plan = options.plan;
    var bindings = options.bindings;
    var presentation = options.presentation || null;

    if (!isObject(plan) || !isObject(plan.frameById) || !isArray(plan.frameOrder)) {
      throw new Error('NoteDemo controller.create 需要 definition.prepare 生成的 plan。');
    }
    if (!bindings || typeof bindings.restoreFrame !== 'function') {
      throw new Error('NoteDemo controller.create 需要 bindings bag（含 restoreFrame）。');
    }
    var startFrameId = options.initialFrameId === undefined || options.initialFrameId === null
      ? plan.initialFrameId
      : options.initialFrameId;
    if (!own(plan.frameById, startFrameId)) {
      throw new Error('NoteDemo controller.create 的 initialFrameId 不是已定义的 Frame：' + repr(startFrameId));
    }

    var frameById = plan.frameById;
    var frameOrder = plan.frameOrder;
    var transitions = isObject(plan.transitions) ? plan.transitions : {};
    var bindingOrder = isArray(plan.bindingOrder) ? plan.bindingOrder : Object.keys(plan.bindings || {});
    var AbortControllerCtor = typeof global.AbortController === 'function' ? global.AbortController : null;

    var disposed = false;
    var state = freezeState({
      phase: 'idle',
      settledFrameId: startFrameId,
      targetFrameId: null,
      replaying: false,
      error: null
    });
    var listeners = [];
    var activeOp = null;
    var activeRunOp = null;
    var pendingOps = [];
    /* 最近一次公开导航的原因：scene 运行配置与默认舞台呈现用它区分正常下一步与回看/重播。 */
    var navigationCause = null;

    /* ---------------- 状态发布 ---------------- */

    function freezeError(error) {
      if (error == null) return null;
      var output = {};
      if (error.binding !== undefined && error.binding !== null) output.binding = String(error.binding);
      if (error.action !== undefined && error.action !== null) output.action = String(error.action);
      if (error.query !== undefined) output.query = error.query;
      output.message = error.message == null ? '' : String(error.message);
      return Object.freeze(output);
    }

    function freezeState(source) {
      return Object.freeze({
        phase: source.phase,
        settledFrameId: source.settledFrameId === undefined ? null : source.settledFrameId,
        targetFrameId: source.targetFrameId === undefined ? null : source.targetFrameId,
        replaying: !!source.replaying,
        error: freezeError(source.error)
      });
    }

    function setState(patch) {
      var next = {
        phase: own(patch, 'phase') ? patch.phase : state.phase,
        settledFrameId: own(patch, 'settledFrameId') ? patch.settledFrameId : state.settledFrameId,
        targetFrameId: own(patch, 'targetFrameId') ? patch.targetFrameId : state.targetFrameId,
        replaying: own(patch, 'replaying') ? patch.replaying : state.replaying,
        error: own(patch, 'error') ? patch.error : state.error
      };
      state = freezeState(next);
      notify();
    }

    function notify() {
      if (!listeners.length) return;
      var snapshot = listeners.slice();
      for (var i = 0; i < snapshot.length; i += 1) {
        try {
          snapshot[i](state);
        } catch (error) {
          /* 订阅者异常不得中断导航 */
        }
      }
    }

    /* ---------------- 结果对象 ---------------- */

    function makeResult(status, frameId, extra) {
      var output = {
        status: status,
        frameId: frameId === undefined ? state.settledFrameId : frameId
      };
      if (extra) {
        if (extra.reason !== undefined) output.reason = extra.reason;
        if (extra.error !== undefined) output.error = extra.error;
      }
      return output;
    }

    function disposedResult() {
      return makeResult('noop', state.settledFrameId, { reason: 'disposed' });
    }

    function publicErrorOf(errorLike) {
      var message = '';
      var binding;
      var action;
      var query;
      if (errorLike && typeof errorLike === 'object') {
        message = errorLike.message != null ? String(errorLike.message) : String(errorLike);
        if (errorLike.binding !== undefined && errorLike.binding !== null) binding = errorLike.binding;
        if (errorLike.action !== undefined && errorLike.action !== null) action = actionLabel(errorLike.action);
        if (errorLike.query !== undefined) query = errorLike.query;
        if (isObject(errorLike.details)) {
          if (errorLike.details.binding !== undefined && errorLike.details.binding !== null) {
            binding = errorLike.details.binding;
          }
          if (errorLike.details.action !== undefined && errorLike.details.action !== null) {
            action = actionLabel(errorLike.details.action);
          }
        }
      } else {
        message = String(errorLike == null ? '' : errorLike);
      }
      var output = {};
      if (binding !== undefined && binding !== null) output.binding = binding;
      if (action !== undefined && action !== null) output.action = action;
      if (query !== undefined) output.query = query;
      output.message = message;
      return output;
    }

    function publishErrorState(publicError, settledFrameId) {
      setState({
        phase: 'error',
        settledFrameId: settledFrameId,
        targetFrameId: null,
        replaying: false,
        error: publicError
      });
      return state.error;
    }

    /* ---------------- Frame 定位与恢复 ---------------- */

    function frameOf(frameId) {
      return frameId != null && own(frameById, frameId) ? frameById[frameId] : null;
    }

    function frameIndexOf(frameId) {
      var frame = frameOf(frameId);
      return frame ? frame.index : -1;
    }

    function nextFrameIdOf(frameId) {
      var index = frameIndexOf(frameId);
      if (index < 0 || index + 1 >= frameOrder.length) return null;
      return frameOrder[index + 1];
    }

    function prevFrameIdOf(frameId) {
      var index = frameIndexOf(frameId);
      if (index <= 0) return null;
      return frameOrder[index - 1];
    }

    function restoreFrameById(frameId) {
      var frame = frameOf(frameId);
      if (!frame) throw new Error('Frame ' + repr(frameId) + ' 不存在，无法恢复。');
      bindings.restoreFrame(frame);
    }

    function motionMode() {
      try {
        var Core = global.NoteCore;
        if (Core && Core.motion && typeof Core.motion.reduced === 'function') {
          return Core.motion.reduced() ? 'reduced' : 'normal';
        }
      } catch (error) {
        /* 无 core 时按普通动效 */
      }
      return 'normal';
    }

    function runnerModule() {
      var runner = Internals.runner;
      if (!runner || typeof runner.run !== 'function') {
        throw new Error('NoteDemo controller 需要先加载 NoteDemoInternals.runner。');
      }
      return runner;
    }

    function sceneModule() {
      var scene = Internals.scene;
      if (!scene || typeof scene.run !== 'function') {
        throw new Error('NoteDemo controller 需要先加载 NoteDemoInternals.scene。');
      }
      return scene;
    }

    function transitionHasScene(transition) {
      return !!(transition && isObject(transition.scene));
    }

    function transitionRunnable(transition) {
      if (!transition) return false;
      if (transitionHasScene(transition)) return true;
      return isArray(transition.actions) && transition.actions.length > 0;
    }

    /* ---------------- 结果落地 ---------------- */

    function applySuccess(targetFrameId) {
      setState({
        phase: 'idle',
        settledFrameId: targetFrameId,
        targetFrameId: null,
        replaying: false,
        error: null
      });
      return makeResult('completed', targetFrameId);
    }

    function applyFailure(op, error) {
      var settledBefore = op && op.settledBefore !== undefined && op.settledBefore !== null
        ? op.settledBefore
        : state.settledFrameId;
      var recoveryFailed = null;
      try {
        restoreFrameById(settledBefore);
      } catch (recoveryError) {
        recoveryFailed = recoveryError;
      }
      var publicError = publicErrorOf(error);
      if (recoveryFailed) {
        publicError.message = (publicError.message || '演示动作失败。') +
          '；恢复已停稳 Frame ' + repr(settledBefore) + ' 失败：' + messageOf(recoveryFailed);
      }
      publishErrorState(publicError, settledBefore);
      return makeResult('failed', settledBefore, { error: state.error });
    }

    function applyCancelled(op) {
      var sourceFrameId = op && op.sourceFrameId !== undefined && op.sourceFrameId !== null
        ? op.sourceFrameId
        : state.settledFrameId;
      var recoveryFailed = null;
      try {
        restoreFrameById(sourceFrameId);
      } catch (error) {
        recoveryFailed = error;
      }
      if (recoveryFailed) {
        var publicError = publicErrorOf(new Error('取消运行后恢复来源 Frame ' + repr(sourceFrameId) +
          ' 失败：' + messageOf(recoveryFailed)));
        publishErrorState(publicError, sourceFrameId);
      } else {
        setState({
          phase: 'idle',
          settledFrameId: sourceFrameId,
          targetFrameId: null,
          replaying: false,
          error: null
        });
      }
      return makeResult('cancelled', sourceFrameId);
    }

    function restoreAndIdle(targetFrameId, op) {
      try {
        restoreFrameById(targetFrameId);
      } catch (error) {
        return applyFailure(op, error);
      }
      return applySuccess(targetFrameId);
    }

    function failUnknownFrame(frameId) {
      var publicError = publicErrorOf(new Error('Frame ' + repr(frameId) + ' 不存在（可用 Frame：' +
        frameOrder.join('、') + '）。'));
      publishErrorState(publicError, state.settledFrameId);
      return makeResult('failed', state.settledFrameId, { reason: 'unknown-frame', error: state.error });
    }

    /* 同步恢复使用的占位操作：只提供结果落地需要的来源与停稳信息。 */
    function pseudoOp() {
      return {
        settledBefore: state.settledFrameId,
        sourceFrameId: state.settledFrameId
      };
    }

    /* ---------------- 异步运行与取消 ---------------- */

    function createOp(spec) {
      spec = isObject(spec) ? spec : {};
      var op = {
        settledBefore: state.settledFrameId,
        sourceFrameId: spec.sourceFrameId === undefined || spec.sourceFrameId === null
          ? state.settledFrameId
          : spec.sourceFrameId,
        targetFrameId: spec.targetFrameId === undefined ? null : spec.targetFrameId,
        transition: spec.transition || null,
        resolved: false,
        abort: null,
        cancelPromise: null,
        resolveExternal: null,
        resolveDone: null
      };
      op.promise = new Promise(function (resolve) {
        op.resolveExternal = resolve;
      });
      op.done = new Promise(function (resolve) {
        op.resolveDone = resolve;
      });
      if (AbortControllerCtor) {
        try {
          op.abort = new AbortControllerCtor();
        } catch (error) {
          op.abort = null;
        }
      }
      return op;
    }

    function closeOp(op, value) {
      if (!op || op.resolved) return false;
      op.resolved = true;
      var index = pendingOps.indexOf(op);
      if (index >= 0) pendingOps.splice(index, 1);
      if (activeOp === op) activeOp = null;
      if (activeRunOp === op) activeRunOp = null;
      if (op.resolveDone) {
        try {
          op.resolveDone();
        } catch (error) {
          /* ignore */
        }
      }
      if (op.resolveExternal) {
        try {
          op.resolveExternal(value);
        } catch (error) {
          /* ignore */
        }
      }
      return true;
    }

    function cancelOp(op) {
      if (!op || op.resolved) return Promise.resolve();
      if (!op.cancelPromise) {
        op.cancelPromise = (function () {
          if (op.abort) {
            try {
              op.abort.abort();
            } catch (error) {
              /* 已取消 */
            }
          }
          return op.done.then(function () {
            return undefined;
          }, function () {
            return undefined;
          });
        })();
      }
      return op.cancelPromise;
    }

    // 动作涉及的 binding 集合（含 parallel 成员，按首次出现顺序）。
    function actionBindingIds(transition) {
      var ids = [];
      var seen = {};
      var actions = transition && isArray(transition.actions) ? transition.actions : [];
      function add(bindingId) {
        if (typeof bindingId !== 'string' || own(seen, bindingId)) return;
        seen[bindingId] = true;
        ids.push(bindingId);
      }
      for (var i = 0; i < actions.length; i += 1) {
        var action = actions[i];
        if (!isObject(action)) continue;
        if (isArray(action.parallel)) {
          for (var m = 0; m < action.parallel.length; m += 1) {
            add(action.parallel[m] && action.parallel[m].binding);
          }
        } else {
          add(action.binding);
        }
      }
      return ids;
    }

    function sceneBindingIds(transition) {
      var ids = [];
      if (!transition || !isObject(transition.scene) || !isArray(transition.scene.bindings)) return ids;
      for (var i = 0; i < transition.scene.bindings.length; i += 1) {
        var member = transition.scene.bindings[i];
        if (member && typeof member.binding === 'string') ids.push(member.binding);
      }
      return ids;
    }

    function staticBindingIds(transition) {
      var taken = actionBindingIds(transition).concat(sceneBindingIds(transition));
      var staticIds = [];
      for (var i = 0; i < bindingOrder.length; i += 1) {
        if (taken.indexOf(bindingOrder[i]) < 0) staticIds.push(bindingOrder[i]);
      }
      return staticIds;
    }

    function runTransition(op, spec) {
      return new Promise(function (resolve) {
        var staticIds = staticBindingIds(spec.transition);
        try {
          if (spec.restoreSourceFirst) restoreFrameById(op.sourceFrameId);
          if (staticIds.length) {
            var targetFrame = frameOf(spec.targetFrameId);
            if (!targetFrame) throw new Error('Frame ' + repr(spec.targetFrameId) + ' 不存在，无法恢复静态绑定。');
            bindings.restoreBindings(staticIds, targetFrame);
          }
        } catch (error) {
          resolve(applyFailure(op, error));
          return;
        }
        if (disposed || op.resolved) {
          resolve(null);
          return;
        }
        /* 先登记 activeRunOp 再发布 running：订阅者在 running 回调里同步导航时也能取消本次运行。 */
        activeRunOp = op;
        setState({
          phase: 'running',
          settledFrameId: op.sourceFrameId,
          targetFrameId: spec.targetFrameId,
          replaying: !!spec.replaying,
          error: null
        });
        if (disposed || op.resolved) {
          resolve(null);
          return;
        }
        /* scene 与旧 actions 共用同一结果落地：completed 提交目标，否则回到来源并 cancelled，异常恢复停稳点。 */
        function settleRunPromise(runPromise) {
          runPromise.then(function (outcome) {
            if (activeRunOp === op) activeRunOp = null;
            if (disposed || op.resolved) {
              resolve(null);
              return;
            }
            if (outcome && outcome.status === 'completed') resolve(applySuccess(spec.targetFrameId));
            else resolve(applyCancelled(op));
          }, function (error) {
            if (activeRunOp === op) activeRunOp = null;
            if (disposed || op.resolved) {
              resolve(null);
              return;
            }
            resolve(applyFailure(op, error));
          });
        }
        if (transitionHasScene(spec.transition)) {
          var scene;
          try {
            scene = sceneModule();
          } catch (error) {
            if (activeRunOp === op) activeRunOp = null;
            resolve(applyFailure(op, error));
            return;
          }
          var scenePromise;
          try {
            scenePromise = scene.run({
              plan: plan,
              transition: spec.transition,
              bindings: bindings,
              signal: op.abort ? op.abort.signal : null,
              motion: motionMode(),
              presentation: presentation,
              reason: opCause(spec),
              cause: opCause(spec)
            });
          } catch (error) {
            if (activeRunOp === op) activeRunOp = null;
            resolve(applyFailure(op, error));
            return;
          }
          if (!scenePromise || typeof scenePromise.then !== 'function') {
            if (activeRunOp === op) activeRunOp = null;
            resolve(applyFailure(op, new Error('NoteDemo scene.run 没有返回 Promise。')));
            return;
          }
          settleRunPromise(scenePromise);
          return;
        }
        var runner;
        try {
          runner = runnerModule();
        } catch (error) {
          if (activeRunOp === op) activeRunOp = null;
          resolve(applyFailure(op, error));
          return;
        }
        var runPromise;
        try {
          runPromise = runner.run({
            plan: plan,
            transition: spec.transition,
            bindings: bindings,
            signal: op.abort ? op.abort.signal : null,
            motion: motionMode(),
            reason: opCause(spec),
            cause: opCause(spec)
          });
        } catch (error) {
          if (activeRunOp === op) activeRunOp = null;
          resolve(applyFailure(op, error));
          return;
        }
        if (!runPromise || typeof runPromise.then !== 'function') {
          if (activeRunOp === op) activeRunOp = null;
          resolve(applyFailure(op, new Error('NoteDemo runner.run 没有返回 Promise。')));
          return;
        }
        settleRunPromise(runPromise);
      });
    }

    function scheduleOp(spec, executor) {
      var op = createOp(spec);
      var previous = activeOp;
      var preempted = activeRunOp;
      if (preempted && preempted !== op) cancelOp(preempted);
      activeOp = op;
      pendingOps.push(op);
      var started = false;

      function run() {
        if (started) return;
        started = true;
        if (op.resolved) return;
        if (disposed) {
          closeOp(op, disposedResult());
          return;
        }
        var produced;
        try {
          produced = executor(op, preempted);
        } catch (error) {
          closeOp(op, applyFailure(op, error));
          return;
        }
        Promise.resolve(produced).then(function (value) {
          if (!op.resolved) closeOp(op, value);
        }, function (error) {
          if (!op.resolved) closeOp(op, applyFailure(op, error));
        });
      }

      if (previous && previous !== op) previous.done.then(run, run);
      else run();
      return op.promise;
    }

    /* ---------------- 公开导航 ---------------- */

    function setCause(cause) {
      navigationCause = cause;
    }

    function getNavigationCause() {
      return navigationCause;
    }

    function opCause(spec) {
      return spec && typeof spec.cause === 'string' && spec.cause ? spec.cause : 'next';
    }

    function next() {
      if (disposed) return Promise.resolve(disposedResult());
      if (activeOp) return Promise.resolve(makeResult('noop', state.settledFrameId, { reason: 'busy' }));
      setCause('next');
      var currentFrameId = state.settledFrameId;
      var targetFrameId = nextFrameIdOf(currentFrameId);
      if (!targetFrameId) return Promise.resolve(makeResult('noop', currentFrameId, { reason: 'end' }));
      var transition = own(transitions, currentFrameId) ? transitions[currentFrameId] : null;
      if (!transitionRunnable(transition)) {
        return Promise.resolve(restoreAndIdle(targetFrameId, pseudoOp()));
      }
      var spec = {
        sourceFrameId: currentFrameId,
        targetFrameId: targetFrameId,
        transition: transition,
        replaying: false,
        cause: 'next'
      };
      return scheduleOp(spec, function (op) {
        return runTransition(op, spec);
      });
    }

    function prev() {
      if (disposed) return Promise.resolve(disposedResult());
      setCause('prev');
      if (activeOp) {
        var preempted = activeRunOp;
        return scheduleOp({}, function (op) {
          var currentFrameId = state.settledFrameId;
          var targetFrameId;
          if (preempted && preempted.sourceFrameId !== undefined && preempted.sourceFrameId !== null &&
              currentFrameId === preempted.sourceFrameId) {
            targetFrameId = currentFrameId;
          } else {
            targetFrameId = prevFrameIdOf(currentFrameId);
          }
          if (!targetFrameId) return makeResult('noop', currentFrameId, { reason: 'start' });
          return restoreAndIdle(targetFrameId, op);
        });
      }
      var targetFrameId = prevFrameIdOf(state.settledFrameId);
      if (!targetFrameId) return Promise.resolve(makeResult('noop', state.settledFrameId, { reason: 'start' }));
      return Promise.resolve(restoreAndIdle(targetFrameId, pseudoOp()));
    }

    function go(frameId) {
      if (disposed) return Promise.resolve(disposedResult());
      setCause('go');
      var known = typeof frameId === 'string' && own(frameById, frameId);
      if (activeOp) {
        return scheduleOp({ targetFrameId: known ? frameId : null }, function (op) {
          if (!known) return failUnknownFrame(frameId);
          return restoreAndIdle(frameId, op);
        });
      }
      if (!known) return Promise.resolve(failUnknownFrame(frameId));
      return Promise.resolve(restoreAndIdle(frameId, pseudoOp()));
    }

    function executeIdleReplay(op) {
      var currentFrameId = state.settledFrameId;
      var index = frameIndexOf(currentFrameId);
      if (index <= 0) return makeResult('noop', currentFrameId, { reason: 'start' });
      var sourceFrameId = frameOrder[index - 1];
      var transition = own(transitions, sourceFrameId) ? transitions[sourceFrameId] : null;
      if (!transitionRunnable(transition)) {
        return restoreAndIdle(currentFrameId, op);
      }
      var spec = {
        sourceFrameId: sourceFrameId,
        targetFrameId: currentFrameId,
        transition: transition,
        replaying: true,
        restoreSourceFirst: true
      };
      return runTransition(op, spec);
    }

    function replay() {
      if (disposed) return Promise.resolve(disposedResult());
      setCause('replay');
      var previous = activeOp;
      if (previous) {
        var preempted = activeRunOp;
        var runningSpec = null;
        if (preempted && preempted.transition && transitionRunnable(preempted.transition) &&
            preempted.targetFrameId !== undefined &&
            preempted.targetFrameId !== null) {
          runningSpec = {
            sourceFrameId: preempted.sourceFrameId,
            targetFrameId: preempted.targetFrameId,
            transition: preempted.transition,
            replaying: true,
            restoreSourceFirst: true,
            cause: 'replay'
          };
        }
        return scheduleOp(runningSpec || {}, function (op) {
          if (runningSpec) return runTransition(op, runningSpec);
          return executeIdleReplay(op);
        });
      }
      var currentFrameId = state.settledFrameId;
      var index = frameIndexOf(currentFrameId);
      if (index <= 0) return Promise.resolve(makeResult('noop', currentFrameId, { reason: 'start' }));
      var sourceFrameId = frameOrder[index - 1];
      var transition = own(transitions, sourceFrameId) ? transitions[sourceFrameId] : null;
      if (!transitionRunnable(transition)) {
        return Promise.resolve(restoreAndIdle(currentFrameId, pseudoOp()));
      }
      var spec = {
        sourceFrameId: sourceFrameId,
        targetFrameId: currentFrameId,
        transition: transition,
        replaying: true,
        restoreSourceFirst: true,
        cause: 'replay'
      };
      return scheduleOp(spec, function (op) {
        return runTransition(op, spec);
      });
    }

    /* 默认舞台“上一步”：从所选步骤的初态重播上一步（不是逐帧倒播）。
     * 运行中先取消旧运行，目标是被取消运行的来源停点；否则目标为上一个停点。
     * 目标停点有可运行入边时恢复其来源再重播该步；没有则直接恢复该停点。
     * 两种入口都走 scheduleOp，保证运行可被再次取消/打断；session.prev() 仍保持
     * “恢复上一停点”语义，供自定义宿主使用。 */
    function replayStepSpec(targetFrameId) {
      var targetIndex = frameIndexOf(targetFrameId);
      var sourceFrameId = targetIndex > 0 ? frameOrder[targetIndex - 1] : null;
      var transition = sourceFrameId != null && own(transitions, sourceFrameId) ? transitions[sourceFrameId] : null;
      if (!transition || !transitionRunnable(transition) || transition.to !== targetFrameId) return null;
      return {
        sourceFrameId: sourceFrameId,
        targetFrameId: targetFrameId,
        transition: transition,
        replaying: true,
        restoreSourceFirst: true,
        cause: 'replayPrevious'
      };
    }

    function runReplayStep(op, spec) {
      op.sourceFrameId = spec.sourceFrameId;
      op.targetFrameId = spec.targetFrameId;
      op.transition = spec.transition;
      return runTransition(op, spec);
    }

    function replayPreviousStep() {
      if (disposed) return Promise.resolve(disposedResult());
      setCause('replayPrevious');
      if (activeOp) {
        var preempted = activeRunOp;
        return scheduleOp({ cause: 'replayPrevious' }, function (op) {
          var currentFrameId = state.settledFrameId;
          var targetFrameId;
          if (preempted && preempted.sourceFrameId !== undefined && preempted.sourceFrameId !== null &&
              currentFrameId === preempted.sourceFrameId) {
            targetFrameId = currentFrameId;
          } else {
            targetFrameId = prevFrameIdOf(currentFrameId);
          }
          if (!targetFrameId) return makeResult('noop', currentFrameId, { reason: 'start' });
          var spec = replayStepSpec(targetFrameId);
          if (!spec) return restoreAndIdle(targetFrameId, op);
          return runReplayStep(op, spec);
        });
      }
      var current = state.settledFrameId;
      var target = prevFrameIdOf(current);
      if (!target) return Promise.resolve(makeResult('noop', current, { reason: 'start' }));
      var idleSpec = replayStepSpec(target);
      if (!idleSpec) return Promise.resolve(restoreAndIdle(target, pseudoOp()));
      return scheduleOp(idleSpec, function (op) {
        return runReplayStep(op, idleSpec);
      });
    }

    function reset() {
      if (disposed) return Promise.resolve(disposedResult());
      setCause('reset');
      if (activeOp) {
        return scheduleOp({ targetFrameId: startFrameId }, function (op) {
          return restoreAndIdle(startFrameId, op);
        });
      }
      return Promise.resolve(restoreAndIdle(startFrameId, pseudoOp()));
    }

    /* ---------------- 只读状态与订阅 ---------------- */

    function getState() {
      return state;
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') {
        throw new TypeError('session.subscribe(listener) 需要一个函数。');
      }
      if (disposed) {
        try {
          listener(state);
        } catch (error) {
          /* 订阅者异常不得中断 */
        }
        return function () {};
      }
      listeners.push(listener);
      var active = true;
      try {
        listener(state);
      } catch (error) {
        /* 立即回调也不得中断创建 */
      }
      return function unsubscribe() {
        if (!active) return;
        active = false;
        var index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    }

    function reportError(errorLike) {
      if (disposed) return;
      var publicError = publicErrorOf(errorLike);
      if (!publicError.message) publicError.message = '演示无法继续。';
      publishErrorState(publicError, state.settledFrameId);
    }

    function destroy() {
      if (disposed) return;
      disposed = true;
      var ops = pendingOps.slice();
      var i;
      if (activeRunOp && activeRunOp.abort) {
        try {
          activeRunOp.abort.abort();
        } catch (error) {
          /* 已失效 */
        }
      }
      for (i = 0; i < ops.length; i += 1) {
        var op = ops[i];
        if (op.resolved) continue;
        var frameId = op.sourceFrameId !== undefined && op.sourceFrameId !== null
          ? op.sourceFrameId
          : state.settledFrameId;
        closeOp(op, makeResult('cancelled', frameId));
      }
      activeOp = null;
      activeRunOp = null;
      if (bindings && typeof bindings.destroy === 'function') {
        try {
          bindings.destroy();
        } catch (error) {
          /* 销毁必须同步完成 */
        }
      }
      state = freezeState({
        phase: 'disposed',
        settledFrameId: state.settledFrameId,
        targetFrameId: null,
        replaying: false,
        error: null
      });
      notify();
      listeners.length = 0;
    }

    var session = {
      next: next,
      prev: prev,
      go: go,
      replay: replay,
      replayPreviousStep: replayPreviousStep,
      reset: reset,
      getState: getState,
      subscribe: subscribe,
      destroy: destroy,
      __reportError: reportError,
      __getNavigationCause: getNavigationCause
    };
    try {
      Object.defineProperty(session, '__plan', { value: plan, enumerable: false, writable: false, configurable: false });
      Object.defineProperty(session, '__bindings', { value: bindings, enumerable: false, writable: false, configurable: false });
    } catch (error) {
      session.__plan = plan;
      session.__bindings = bindings;
    }
    return session;
  }

  Internals.controller = {
    create: create
  };
})(window);

/* ---- source: src/demo/adapters/matrix.js ---- */
/* NoteDemo Adapter — matrix（D02 矩阵；首版只做静态恢复）。
 * Scope: window.NoteDemoInternals.adapters.matrix
 * Depends on: NoteCore、NoteViz.Matrix（src/viz/objects-sequence-matrix.js）；可选组件只在实际 mount/adopt 时检查，文件顶层不依赖。
 * 经典脚本，无模块/无网络/无 eval。
 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var ADAPTER_NAME = 'matrix';
  var EMPTY_SELECTION = { rows: [], cols: [], cells: [] };

  function fail(message) {
    throw new Error(ADAPTER_NAME + ' Adapter：' + message);
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function requireMatrix() {
    var viz = global.NoteViz;
    if (!viz || !viz.Matrix || typeof viz.Matrix.mount !== 'function') {
      throw new Error('matrix Adapter 需要先加载 NoteViz.Matrix（src/viz/objects-sequence-matrix.js）。');
    }
    return viz.Matrix;
  }

  function normalizeId(value, where) {
    if (value == null) fail(where + ' 不能为空');
    if (typeof value !== 'string' && typeof value !== 'number') fail(where + ' 必须是字符串 ID');
    var id = String(value);
    if (id === '') fail(where + ' 不能为空字符串');
    return id;
  }

  function normalizeAxis(list, where) {
    if (!Array.isArray(list)) fail(where + ' 必须是数组');
    var seen = {};
    var result = [];
    list.forEach(function (entry, index) {
      if (!isObject(entry)) fail(where + '[' + index + '] 必须是 {id,label} 对象');
      var id = normalizeId(entry.id, where + '[' + index + '].id');
      if (Object.prototype.hasOwnProperty.call(seen, id)) fail(where + ' 中的 id "' + id + '" 重复');
      seen[id] = true;
      var label = entry.label;
      if (label == null) label = '';
      if (typeof label !== 'string') fail(where + '[' + index + '].label 必须是字符串');
      result.push({ id: id, label: label });
    });
    return result;
  }

  function normalizeValues(values, rowCount, colCount) {
    if (!Array.isArray(values)) fail('view.values 必须是二维数组');
    var result = [];
    var rowIndex;
    var colIndex;
    for (rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      var source = values[rowIndex];
      var row = [];
      for (colIndex = 0; colIndex < colCount; colIndex += 1) {
        var cell = Array.isArray(source) ? source[colIndex] : undefined;
        row.push(cell === undefined || cell === null ? '' : cell);
      }
      result.push(row);
    }
    return result;
  }

  function normalizeSelection(input, rowIds, colIds, where) {
    var result = { rows: [], cols: [], cells: [] };
    if (input == null) return result;
    if (!isObject(input)) fail(where + ' 必须是 {rows,cols,cells} 对象');
    var rowSet = {};
    var colSet = {};
    rowIds.forEach(function (id) { rowSet[id] = true; });
    colIds.forEach(function (id) { colSet[id] = true; });

    if (input.rows != null) {
      if (!Array.isArray(input.rows)) fail(where + '.rows 必须是数组');
      var seenRows = {};
      input.rows.forEach(function (ref, index) {
        var id = normalizeId(ref, where + '.rows[' + index + ']');
        if (!rowSet[id]) fail(where + '.rows 引用了不存在的行 "' + id + '"');
        if (!seenRows[id]) {
          seenRows[id] = true;
          result.rows.push(id);
        }
      });
    }
    if (input.cols != null) {
      if (!Array.isArray(input.cols)) fail(where + '.cols 必须是数组');
      var seenCols = {};
      input.cols.forEach(function (ref, index) {
        var id = normalizeId(ref, where + '.cols[' + index + ']');
        if (!colSet[id]) fail(where + '.cols 引用了不存在的列 "' + id + '"');
        if (!seenCols[id]) {
          seenCols[id] = true;
          result.cols.push(id);
        }
      });
    }
    if (input.cells != null) {
      if (!Array.isArray(input.cells)) fail(where + '.cells 必须是数组');
      var seenCells = {};
      input.cells.forEach(function (cell, index) {
        if (!isObject(cell)) fail(where + '.cells[' + index + '] 必须是 {row,col} 对象');
        var rowId = normalizeId(cell.row, where + '.cells[' + index + '].row');
        var colId = normalizeId(cell.col != null ? cell.col : cell.column, where + '.cells[' + index + '].col');
        if (!rowSet[rowId]) fail(where + '.cells 引用了不存在的行 "' + rowId + '"');
        if (!colSet[colId]) fail(where + '.cells 引用了不存在的列 "' + colId + '"');
        var key = rowId + '\u0000' + colId;
        if (!seenCells[key]) {
          seenCells[key] = true;
          result.cells.push({ row: rowId, col: colId });
        }
      });
    }
    result.rows.sort();
    result.cols.sort();
    result.cells.sort(function (a, b) {
      if (a.row < b.row) return -1;
      if (a.row > b.row) return 1;
      if (a.col < b.col) return -1;
      if (a.col > b.col) return 1;
      return 0;
    });
    return result;
  }

  function copySelection(input) {
    var source = isObject(input) ? input : EMPTY_SELECTION;
    return {
      rows: Array.isArray(source.rows) ? source.rows.slice() : [],
      cols: Array.isArray(source.cols) ? source.cols.slice() : [],
      cells: (Array.isArray(source.cells) ? source.cells : []).map(function (cell) {
        return { row: cell.row, col: cell.col };
      })
    };
  }

  function normalizeView(input) {
    if (!isObject(input)) fail('view 必须是 {rows,columns,values,focus?,changed?,caption?} 对象');
    var rows = normalizeAxis(input.rows, 'view.rows');
    var columns = normalizeAxis(input.columns, 'view.columns');
    var rowIds = rows.map(function (row) { return row.id; });
    var colIds = columns.map(function (column) { return column.id; });
    var caption = input.caption;
    if (caption == null) caption = '';
    if (typeof caption !== 'string') fail('view.caption 必须是字符串');
    return {
      model: {
        rows: rows,
        columns: columns,
        values: normalizeValues(input.values, rows.length, columns.length)
      },
      cues: {
        focus: normalizeSelection(input.focus, rowIds, colIds, 'view.focus'),
        changed: normalizeSelection(input.changed, rowIds, colIds, 'view.changed'),
        caption: caption
      }
    };
  }

  function validateAction(action) {
    var type = isObject(action) && action.type != null ? String(action.type) : '';
    fail('matrix 是静态恢复型 Adapter，不支持动作' + (type ? ' "' + type + '"' : '') + '。');
  }

  function viewCuePatch(view) {
    var model = isObject(view && view.model) ? view.model : { rows: [], columns: [], values: [] };
    var cues = isObject(view && view.cues) ? view.cues : {};
    return {
      rows: model.rows,
      columns: model.columns,
      values: model.values,
      focus: copySelection(cues.focus),
      changed: copySelection(cues.changed),
      caption: cues.caption == null ? '' : String(cues.caption)
    };
  }

  function applyCuesPatch(cues) {
    var input = isObject(cues) ? cues : {};
    return {
      focus: copySelection(input.focus),
      changed: copySelection(input.changed),
      caption: input.caption == null ? '' : String(input.caption)
    };
  }

  function queryTarget(instance, query) {
    if (!isObject(query) || query.row == null || query.col == null) return null;
    var target = instance.getTarget({ row: query.row, col: query.col });
    return target && target.nodeType === 1 ? target : null;
  }

  function copyStateSelection(selection) {
    var input = isObject(selection) ? selection : {};
    return {
      rows: Array.isArray(input.rows) ? input.rows.slice() : [],
      cols: Array.isArray(input.cols) ? input.cols.slice() : [],
      cells: (Array.isArray(input.cells) ? input.cells : []).map(function (cell) {
        return { row: cell.row, col: cell.col };
      })
    };
  }

  function canonicalFromState(state) {
    if (!isObject(state) || !Array.isArray(state.rows) || !Array.isArray(state.columns)) {
      fail('getState() 必须返回 rows/columns/values/focus/changed');
    }
    return normalizeView({
      rows: state.rows,
      columns: state.columns,
      values: state.values,
      focus: copyStateSelection(state.focus),
      changed: copyStateSelection(state.changed),
      caption: state.caption == null ? '' : String(state.caption)
    });
  }

  function effectsModule() {
    var effects = Internals.effects;
    if (!effects || typeof effects.captureContent !== 'function' ||
        typeof effects.planValueSwap !== 'function' || typeof effects.planCueChanges !== 'function') {
      throw new Error('matrix Adapter 需要先加载 NoteDemoInternals.effects。');
    }
    return effects;
  }
  var CUE_PROPS = ['backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor',
    'borderLeftColor', 'outlineColor', 'outlineWidth', 'outlineOffset', 'color'];

  function motionTargets(instance) {
    var list = typeof instance.getMotionTargets === 'function' ? instance.getMotionTargets() : [];
    return Array.isArray(list) ? list.filter(function (target) { return target && target.element; }) : [];
  }

  function headerTargets(instance) {
    var root = instance.el || instance.root || null;
    var output = [];
    if (!root || !root.querySelectorAll) return output;
    Array.prototype.forEach.call(root.querySelectorAll('.nviz-matrix__rowhead[data-id], .nviz-matrix__colhead[data-id]'), function (th) {
      var kind = th.classList.contains('nviz-matrix__rowhead') ? 'row' : 'col';
      var id = th.getAttribute('data-id');
      if (id == null) return;
      output.push({ id: kind + ':' + id, el: th });
    });
    return output;
  }

  function labelInfo(el, carrier) {
    if (!el || !carrier || el.hidden) return null;
    var effects = effectsModule();
    var content = effects.captureContent({ valueEl: el, carrier: carrier });
    if (!content || !content.visible) return null;
    return {
      el: el,
      carrier: carrier,
      text: el.textContent || '',
      content: content,
      className: el.classList && el.classList.contains('nviz-matrix__headmark')
        ? 'nviz-matrix__headmark nviz-matrix__headmark--ghost'
        : 'nviz-matrix__cellflag nviz-matrix__cellflag--ghost'
    };
  }

  function captureSnapshot(instance, view) {
    var effects = effectsModule();
    var cells = {};
    motionTargets(instance).forEach(function (target) {
      var cell = target.element;
      var flag = target.flagEl;
      var visible = !!(flag && !flag.hidden && (flag.textContent || '').trim() !== '');
      cells[String(target.id)] = {
        el: cell,
        valueEl: target.valueEl,
        flagEl: flag,
        flagVisible: visible,
        flagText: flag ? (flag.textContent || '') : '',
        flagLabel: visible ? labelInfo(flag, cell) : null
      };
    });
    var headers = {};
    headerTargets(instance).forEach(function (target) {
      var mark = target.el.querySelector ? target.el.querySelector('.nviz-matrix__headmark') : null;
      var visible = !!(mark && !mark.hidden && (mark.textContent || '').trim() !== '');
      headers[target.id] = {
        el: target.el,
        markEl: mark,
        markVisible: visible,
        markText: mark ? (mark.textContent || '') : '',
        markLabel: visible ? labelInfo(mark, target.el) : null
      };
    });
    var values = {};
    var data = isObject(view && view.model) ? view.model : {};
    var rows = Array.isArray(data.rows) ? data.rows : [];
    var columns = Array.isArray(data.columns) ? data.columns : [];
    rows.forEach(function (row, rowIndex) {
      columns.forEach(function (column, colIndex) {
        var list = Array.isArray(data.values) ? data.values[rowIndex] : null;
        var value = Array.isArray(list) ? list[colIndex] : '';
        values[row.id + String.fromCharCode(0) + column.id] = value == null ? '' : String(value);
      });
    });
    return { cells: cells, headers: headers, values: values,
      cellStyles: effects.captureStyles(motionTargets(instance).map(function (target) {
        return { id: String(target.id), el: target.element };
      }), CUE_PROPS),
      headerStyles: effects.captureStyles(headerTargets(instance), CUE_PROPS) };
  }

  function captureTargetSnapshot(instance) {
    var effects = effectsModule();
    var cells = {};
    motionTargets(instance).forEach(function (target) {
      var cell = target.element;
      var flag = target.flagEl;
      var visible = !!(flag && !flag.hidden && (flag.textContent || '').trim() !== '');
      cells[String(target.id)] = {
        el: cell,
        valueEl: target.valueEl,
        flagEl: flag,
        flagVisible: visible,
        flagText: flag ? (flag.textContent || '') : '',
        flagLabel: visible ? labelInfo(flag, cell) : null
      };
    });
    var headers = {};
    headerTargets(instance).forEach(function (target) {
      var mark = target.el.querySelector ? target.el.querySelector('.nviz-matrix__headmark') : null;
      var visible = !!(mark && !mark.hidden && (mark.textContent || '').trim() !== '');
      headers[target.id] = {
        el: target.el,
        markEl: mark,
        markVisible: visible,
        markText: mark ? (mark.textContent || '') : '',
        markLabel: visible ? labelInfo(mark, target.el) : null
      };
    });
    return {
      cells: cells,
      headers: headers,
      cellStyles: effects.captureStyles(motionTargets(instance).map(function (target) {
        return { id: String(target.id), el: target.element };
      }), CUE_PROPS),
      headerStyles: effects.captureStyles(headerTargets(instance), CUE_PROPS)
    };
  }

  function addLabelEffects(specs, sourceLabels, targetLabels, timing, effectName, cleanups) {
    Object.keys(targetLabels).forEach(function (key) {
      var target = targetLabels[key];
      var source = sourceLabels[key];
      if (target && target.flagVisible && (!source || !source.flagVisible || source.flagText !== target.flagText)) {
        specs.push({
          el: target.flagEl,
          keyframes: [
            { opacity: '0', transform: 'translateY(-3px)' },
            { opacity: '1', transform: 'none' }
          ],
          options: { duration: timing.enterDuration, easing: timing.easing, fill: 'backwards' },
          gate: 'finish',
          effect: effectName + ':enter'
        });
      }
      if (source && source.flagVisible && source.flagLabel &&
          (!target || !target.flagVisible || source.flagText !== target.flagText)) {
        var carrier = target && target.el ? target.el : source.flagLabel.carrier;
        if (!carrier) return;
        var ghost = effectsModule().createGhost({
          source: source.flagLabel.content,
          target: { carrier: carrier, valueEl: source.flagEl },
          className: source.flagLabel.className,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center'
        });
        if (!ghost) return;
        cleanups.push(ghost.cleanup);
        specs.push({
          el: ghost.el,
          keyframes: [
            { opacity: '1', transform: 'translateY(0)' },
            { opacity: '0', transform: 'translateY(-4px)' }
          ],
          options: { duration: timing.enterDuration, easing: timing.easing, fill: 'backwards' },
          cleanupEl: ghost.el,
          gate: 'finish',
          effect: effectName + ':exit'
        });
      }
    });
  }

  function headerLabelMap(snapshot) {
    var output = {};
    Object.keys(snapshot.headers || {}).forEach(function (key) {
      var item = snapshot.headers[key];
      output[key] = {
        flagVisible: !!item.markVisible,
        flagText: item.markText || '',
        flagEl: item.markEl,
        flagLabel: item.markLabel,
        el: item.el
      };
    });
    return output;
  }

  function cellLabelMap(snapshot) {
    var output = {};
    Object.keys(snapshot.cells || {}).forEach(function (key) {
      var item = snapshot.cells[key];
      output[key] = {
        flagVisible: !!item.flagVisible,
        flagText: item.flagText || '',
        flagEl: item.flagEl,
        flagLabel: item.flagLabel,
        el: item.el
      };
    });
    return output;
  }

  function makePreparedChange(instance, context) {
    var sourceView = isObject(context.sourceView) ? context.sourceView : null;
    var targetView = isObject(context.targetView) ? context.targetView : null;
    if (!sourceView || !isObject(sourceView.model)) fail('matrix prepareChange 需要 sourceView.model');
    if (!targetView || !isObject(targetView.model)) fail('matrix prepareChange 需要 targetView.model');
    var effects = effectsModule();
    var sourceSnapshot = captureSnapshot(instance, sourceView);
    var sourceValues = sourceSnapshot.values;
    var targetData = targetView.model;
    var targetValues = {};
    var rows = Array.isArray(targetData.rows) ? targetData.rows : [];
    var columns = Array.isArray(targetData.columns) ? targetData.columns : [];
    rows.forEach(function (row, rowIndex) {
      columns.forEach(function (column, colIndex) {
        var list = Array.isArray(targetData.values) ? targetData.values[rowIndex] : null;
        var value = Array.isArray(list) ? list[colIndex] : '';
        targetValues[row.id + String.fromCharCode(0) + column.id] = value == null ? '' : String(value);
      });
    });
    var changedKeys = Object.keys(targetValues).filter(function (key) {
      return sourceValues[key] !== targetValues[key];
    });
    /* 值内容必须在 commit 前冻结局部坐标；commit 后只把副本放到目标单元内。 */
    var sourceContents = {};
    changedKeys.forEach(function (key) {
      var cell = sourceSnapshot.cells[key];
      if (!cell) return;
      sourceContents[key] = effects.captureContent({ valueEl: cell.valueEl, carrier: cell.el });
    });
    var sourceCellLabels = cellLabelMap(sourceSnapshot);
    var sourceHeaderLabels = headerLabelMap(sourceSnapshot);
    var committed = false;
    var effectsCache = null;
    var ghostCleanups = [];
    var facts = {
      valueChanged: changedKeys.length,
      cueChanged: JSON.stringify(sourceView.cues || {}) !== JSON.stringify(targetView.cues || {})
    };
    function cleanup() {
      for (var i = 0; i < ghostCleanups.length; i += 1) {
        try { ghostCleanups[i](); } catch (error) { /* ignore */ }
      }
      ghostCleanups = [];
      if (effectsCache && effectsCache.cleanup) {
        try { effectsCache.cleanup(); } catch (error) { /* ignore */ }
      }
      effectsCache = null;
    }
    return {
      commit: function () {
        if (committed) return;
        committed = true;
        instance.update(viewCuePatch(targetView));
      },
      targets: function () {
        return typeof instance.getMotionTargets === 'function' ? instance.getMotionTargets() : [];
      },
      effects: function (effectCtx) {
        var motion = isObject(effectCtx) && effectCtx.motion === 'never' ? 'never' : 'auto';
        var timing = isObject(effectCtx) && isObject(effectCtx.timing) ? effectCtx.timing : effects.mergeTiming();
        if (effectsCache) return effectsCache.specs;
        if (motion === 'never') {
          effectsCache = { specs: [], cleanup: function () {} };
          return [];
        }
        var targetSnapshot = captureTargetSnapshot(instance);
        var specs = [];
        try {
          /* 连续 cue 差分：只比较组件明确选择的连续属性，不扫描任意 CSS。 */
          specs = specs.concat(effects.planCueChanges({
            source: sourceSnapshot.cellStyles,
            targets: motionTargets(instance).map(function (target) { return { id: String(target.id), el: target.element }; }),
            timing: timing,
            properties: CUE_PROPS,
            duration: timing.cueDuration,
            gate: 'ready'
          }));
          specs = specs.concat(effects.planCueChanges({
            source: sourceSnapshot.headerStyles,
            targets: headerTargets(instance),
            timing: timing,
            properties: CUE_PROPS,
            duration: timing.cueDuration,
            gate: 'ready'
          }));
          if (targetSnapshot) {
            addLabelEffects(specs, sourceCellLabels, cellLabelMap(targetSnapshot), timing, 'matrix-label-cell', ghostCleanups);
            addLabelEffects(specs, sourceHeaderLabels, headerLabelMap(targetSnapshot), timing, 'matrix-label-header', ghostCleanups);
            changedKeys.forEach(function (key) {
              var target = targetSnapshot.cells[key];
              if (!target || !target.valueEl) return;
              var swap = effects.planValueSwap({
                source: sourceContents[key],
                target: { carrier: target.el, valueEl: target.valueEl },
                timing: timing,
                recipe: {
                  ghostClass: 'nviz-matrix__value nviz-matrix__value--ghost',
                  ghostKeyframes: [
                    { opacity: '1', transform: 'translateY(0)' },
                    { opacity: '1', transform: 'translateY(0)', offset: 0.5 },
                    { opacity: '0', transform: 'translateY(-8px)' }
                  ],
                  ghostDuration: timing.valueSwapDuration,
                  ghostDelay: timing.valueSwapDelay,
                  ghostEasing: 'linear',
                  targetKeyframes: [
                    { opacity: '0', transform: 'translateY(6px)' },
                    { opacity: '1', transform: 'none' }
                  ],
                  targetDuration: timing.valueSwapDuration,
                  targetDelay: timing.valueSwapDelay,
                  targetEasing: timing.easing,
                  targetGate: 'ready'
                }
              });
              if (swap.cleanup) ghostCleanups.push(swap.cleanup);
              specs = specs.concat(swap.specs);
            });
          }
          effectsCache = {
            specs: specs,
            cleanup: function () {
              for (var c = 0; c < ghostCleanups.length; c += 1) {
                try { ghostCleanups[c](); } catch (error) { /* ignore */ }
              }
              ghostCleanups = [];
            }
          };
          return specs;
        } catch (error) {
          cleanup();
          throw error;
        }
      },
      facts: function () { return facts; },
      cleanup: cleanup,
      readView: function () {
        return typeof instance.getState === 'function' ? canonicalFromState(instance.getState()) : null;
      }
    };
  }

  function createHandle(instance, container, owned) {
    var destroyed = false;
    return {
      restore: function (view) {
        if (destroyed) return;
        instance.update(viewCuePatch(view));
      },
      applyCues: function (cues) {
        if (destroyed) return;
        instance.update(applyCuesPatch(cues));
      },
      target: function (query) {
        if (destroyed) return null;
        return queryTarget(instance, query);
      },
      readView: function () {
        if (destroyed || typeof instance.getState !== 'function') return null;
        return canonicalFromState(instance.getState());
      },
      prepareChange: function (ctx) {
        if (destroyed) fail('已销毁的矩阵实例不能 prepareChange');
        return makePreparedChange(instance, isObject(ctx) ? ctx : {});
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        if (owned) instance.destroy();
        if (container && container.parentNode) container.parentNode.removeChild(container);
      }
    };
  }

  function mount(host, options) {
    var Matrix = requireMatrix();
    if (!host || host.nodeType !== 1) {
      throw new TypeError('matrix Adapter.mount(host, options)：host 必须是宿主任意元素。');
    }
    var container = global.document.createElement('div');
    container.className = 'note-demo-adapter note-demo-adapter--matrix';
    container.setAttribute('data-adapter', ADAPTER_NAME);
    host.appendChild(container);
    var instance;
    try {
      var mountOptions = isObject(options) ? Object.assign({}, options) : {};
      if (!Object.prototype.hasOwnProperty.call(mountOptions, 'stateText')) mountOptions.stateText = false;
      instance = Matrix.mount(container, mountOptions);
    } catch (error) {
      if (container.parentNode) container.parentNode.removeChild(container);
      throw error;
    }
    return createHandle(instance, container, true);
  }

  function adopt(instance) {
    if (!instance || typeof instance.update !== 'function' || typeof instance.getTarget !== 'function' ||
        typeof instance.getState !== 'function' || typeof instance.getMotionTargets !== 'function') {
      fail('adopt 需要一个 NoteViz.Matrix 实例（含 update/getTarget/getState/getMotionTargets）。');
    }
    if (instance.destroyed) fail('adopt 的矩阵实例已销毁。');
    return createHandle(instance, null, false);
  }

  Internals.adapters = Internals.adapters || {};
  Internals.adapters[ADAPTER_NAME] = {
    name: ADAPTER_NAME,
    /* 固定行列身份下可做内容/cues 的 update；整表重排仍显式 cut。
     * layout/reveal 不声明，避免把更新伪装成布局动画。 */
    sceneModes: ['cut', 'update'],
    defaultSceneMode: 'update',
    sceneTimingDefaults: {
      enterDuration: 180,
      valueSwapDelay: 80,
      valueSwapDuration: 320
    },
    normalizeView: normalizeView,
    validateAction: validateAction,
    mount: mount,
    adopt: adopt
  };
})(window);

/* ---- source: src/demo/adapters/sequence.js ---- */
/* NoteDemo Adapter — sequence（D01 序列 scene 接入；layout / cut / reveal）。
 * Scope: window.NoteDemoInternals.adapters.sequence
 * Depends on: NoteViz.Sequence（src/viz/objects-sequence-matrix.js；仅在实际 mount/adopt 时检查）。
 * 经典脚本，无模块/无网络/无 eval。
 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var ADAPTER_NAME = 'sequence';
  var SCENE_MODES = ['layout', 'cut', 'reveal'];
  var EASE = 'cubic-bezier(.3,0,.15,1)';
  var GROUP_STRUCT_FIELDS = ['start', 'count', 'from', 'to'];
  var CUE_PROPS = ['backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor',
    'borderLeftColor', 'outlineColor', 'outlineWidth', 'outlineOffset', 'color'];
  var DEFAULT_TIMING = {
    enterDuration: 420,
    stagger: 40,
    valueSwapDelay: 160,
    valueSwapDuration: 420,
    valueFlashDuration: 560,
    markDelay: 200,
    markDuration: 420
  };

  function fail(message) {
    throw new Error(ADAPTER_NAME + ' Adapter：' + message);
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function hasOwn(object, key) {
    return object != null && Object.prototype.hasOwnProperty.call(Object(object), key);
  }

  function effectsModule() {
    var effects = Internals.effects;
    if (!effects || typeof effects.captureContent !== 'function' || typeof effects.planValueSwap !== 'function' ||
        typeof effects.planCueChanges !== 'function') {
      throw new Error('sequence Adapter 需要先加载 NoteDemoInternals.effects。');
    }
    return effects;
  }

  function requireSequence() {
    var viz = global.NoteViz;
    if (!viz || !viz.Sequence || typeof viz.Sequence.mount !== 'function') {
      throw new Error('sequence Adapter 需要先加载 NoteViz.Sequence（src/viz/objects-sequence-matrix.js）。');
    }
    return viz.Sequence;
  }

  /* ---------------- 规范化 ---------------- */

  function normalizeItemId(value, where) {
    if (typeof value !== 'string' || value === '') {
      fail(where + ' 必须是非空字符串 ID');
    }
    return value;
  }

  function normalizeRefId(value, where) {
    return normalizeItemId(value, where);
  }

  function normalizeItems(input, where) {
    if (!Array.isArray(input)) fail(where + ' 必须是数组');
    var seen = {};
    var result = [];
    input.forEach(function (entry, index) {
      if (!isObject(entry)) fail(where + '[' + index + '] 必须是 {id,value,label} 对象');
      var id = normalizeItemId(entry.id, where + '[' + index + '].id');
      if (hasOwn(seen, id)) fail(where + ' 中的 id "' + id + '" 重复');
      seen[id] = true;
      var value = entry.value;
      value = value == null ? '' : String(value);
      var label = entry.label;
      label = label == null ? '' : String(label);
      result.push({ id: id, value: value, label: label });
    });
    return result;
  }

  function normalizeGroups(input, itemIds, where) {
    if (input == null) return [];
    if (!Array.isArray(input)) fail(where + ' 必须是数组');
    var assigned = {};
    var result = [];
    input.forEach(function (group, index) {
      if (!isObject(group)) fail(where + '[' + index + '] 必须是 {label,ids} 对象');
      GROUP_STRUCT_FIELDS.forEach(function (field) {
        if (hasOwn(group, field)) {
          fail(where + '[' + index + '] 只接受 {label,ids} 分组，不接受 ' + field + ' 形式');
        }
      });
      var label = group.label;
      if (label == null) label = '';
      if (typeof label !== 'string') fail(where + '[' + index + '].label 必须是字符串');
      if (!Array.isArray(group.ids)) fail(where + '[' + index + '].ids 必须是 ID 数组');
      var ids = [];
      group.ids.forEach(function (ref, refIndex) {
        var id = normalizeRefId(ref, where + '[' + index + '].ids[' + refIndex + ']');
        if (!hasOwn(itemIds, id)) fail(where + '[' + index + '].ids[' + refIndex + '] 引用了不存在的对象 "' + id + '"');
        if (hasOwn(assigned, id)) fail(where + ' 中的 id "' + id + '" 被重复分组');
        assigned[id] = true;
        ids.push(id);
      });
      result.push({ label: label, ids: ids });
    });
    return result;
  }

  function normalizeCueList(input, itemIds, where) {
    if (input == null) return [];
    if (!Array.isArray(input)) fail(where + ' 必须是 ID 数组');
    var seen = {};
    var result = [];
    input.forEach(function (ref, index) {
      var id = normalizeRefId(ref, where + '[' + index + ']');
      if (!hasOwn(itemIds, id)) fail(where + '[' + index + '] 引用了不存在的对象 "' + id + '"');
      if (hasOwn(seen, id)) return;
      seen[id] = true;
      result.push(id);
    });
    result.sort();
    return result;
  }

  function itemIdSet(items) {
    var set = {};
    items.forEach(function (item) { set[item.id] = true; });
    return set;
  }

  function normalizeView(input) {
    if (!isObject(input)) fail('view 必须是 {items,groups?,focus?,changed?} 对象');
    var items = normalizeItems(input.items, 'view.items');
    var itemIds = itemIdSet(items);
    return {
      model: {
        items: items,
        groups: normalizeGroups(input.groups, itemIds, 'view.groups')
      },
      cues: {
        focus: normalizeCueList(input.focus, itemIds, 'view.focus'),
        changed: normalizeCueList(input.changed, itemIds, 'view.changed')
      }
    };
  }

  function canonicalFromState(state) {
    if (!isObject(state) || !Array.isArray(state.items)) {
      fail('getState() 没有返回 items 数组，无法读回真实状态');
    }
    var items = state.items.map(function (item, index) {
      if (!isObject(item)) fail('getState().items[' + index + '] 不是对象');
      return {
        id: normalizeItemId(item.id, 'getState().items[' + index + '].id'),
        value: item.value == null ? '' : String(item.value),
        label: item.label == null ? '' : String(item.label)
      };
    });
    var itemIds = {};
    items.forEach(function (item) {
      if (hasOwn(itemIds, item.id)) fail('getState() 读回重复 id "' + item.id + '"');
      itemIds[item.id] = true;
    });
    var cues = isObject(state.cues) ? state.cues : {};
    return {
      model: {
        items: items,
        groups: normalizeGroups(state.groups, itemIds, 'getState().groups')
      },
      cues: {
        focus: normalizeCueList(cues.focus, itemIds, 'getState().cues.focus'),
        changed: normalizeCueList(cues.changed, itemIds, 'getState().cues.changed')
      }
    };
  }

  function copyItems(items) {
    return items.map(function (item) {
      return { id: item.id, value: item.value, label: item.label };
    });
  }

  function copyGroups(groups) {
    return groups.map(function (group) {
      return { label: group.label, ids: group.ids.slice() };
    });
  }

  function validateAction(action) {
    var type = isObject(action) && action.type != null ? String(action.type) : '';
    fail('sequence 是 scene 接入 Adapter，不使用 old actions 动作路径' +
      (type ? '（收到 "' + type + '"）' : '') + '。');
  }

  /* ---------------- 动作准备 ---------------- */

  function mergeTiming(input) {
    var timing = {
      enterDuration: DEFAULT_TIMING.enterDuration,
      stagger: DEFAULT_TIMING.stagger,
      valueSwapDelay: DEFAULT_TIMING.valueSwapDelay,
      valueSwapDuration: DEFAULT_TIMING.valueSwapDuration,
      valueFlashDuration: DEFAULT_TIMING.valueFlashDuration,
      markDelay: DEFAULT_TIMING.markDelay,
      markDuration: DEFAULT_TIMING.markDuration,
      cueDuration: 520,
      easing: EASE
    };
    if (isObject(input)) {
      Object.keys(timing).forEach(function (key) {
        if (key === 'easing') {
          if (typeof input.easing === 'string' && input.easing !== '') timing.easing = input.easing;
          return;
        }
        if (typeof input[key] === 'number' && isFinite(input[key]) && input[key] >= 0) {
          timing[key] = input[key];
        }
      });
    }
    return timing;
  }

  function makePreparedChange(instance, context) {
    var sourceView = isObject(context.sourceView) ? context.sourceView : null;
    var targetView = isObject(context.targetView) ? context.targetView : null;
    if (!sourceView || !isObject(sourceView.model) || !Array.isArray(sourceView.model.items)) {
      fail('prepareChange 需要 sourceView.model.items 数组');
    }
    if (!targetView || !isObject(targetView.model) || !Array.isArray(targetView.model.items)) {
      fail('prepareChange 需要 targetView.model.items 数组');
    }
    var motion = context.motion === 'never' ? 'never' : 'auto';
    var targetItems = copyItems(targetView.model.items);
    var targetGroups = copyGroups(Array.isArray(targetView.model.groups) ? targetView.model.groups : []);
    var targetCues = isObject(targetView.cues) ? targetView.cues : {};
    var targetFocus = Array.isArray(targetCues.focus) ? targetCues.focus.map(String) : [];
    var targetChanged = Array.isArray(targetCues.changed) ? targetCues.changed.map(String) : [];
    var sourceItems = sourceView.model.items;
    var sourceById = {};
    sourceItems.forEach(function (item) {
      if (item && item.id != null) sourceById[String(item.id)] = item;
    });
    var sourceFocus = {};
    var sourceCues = isObject(sourceView.cues) ? sourceView.cues : {};
    (Array.isArray(sourceCues.focus) ? sourceCues.focus : []).forEach(function (id) {
      sourceFocus[String(id)] = true;
    });
    var effects = effectsModule();
    var sourceTargetMap = {};
    var sourceTargets = instance.getMotionTargets();
    (Array.isArray(sourceTargets) ? sourceTargets : []).forEach(function (target) {
      if (target && target.id != null) sourceTargetMap[String(target.id)] = target;
    });
    var capturedFacts = computeFacts();
    var sourceContents = {};
    capturedFacts.valueChanged.forEach(function (id) {
      var source = sourceTargetMap[id];
      if (!source || !source.contentEl || !source.valueEl) return;
      sourceContents[id] = effects.captureContent({ valueEl: source.valueEl, carrier: source.contentEl });
    });
    var sourceCueStyles = effects.captureStyles(Object.keys(sourceTargetMap).map(function (id) {
      return { id: id, el: sourceTargetMap[id].contentEl };
    }), CUE_PROPS);
    var committed = false;
    var cleaned = false;
    var factsValue = capturedFacts;
    var ghostCleanups = [];

    function computeFacts() {
      var targetById = {};
      var entered = [];
      var valueChanged = [];
      var exited = [];
      targetItems.forEach(function (item) {
        targetById[item.id] = item;
        if (!hasOwn(sourceById, item.id)) {
          entered.push(item.id);
        } else {
          var before = sourceById[item.id];
          var beforeValue = before.value == null ? '' : String(before.value);
          if (beforeValue !== item.value) valueChanged.push(item.id);
        }
      });
      sourceItems.forEach(function (item) {
        var id = item && item.id != null ? String(item.id) : '';
        if (id !== '' && !hasOwn(targetById, id)) exited.push(id);
      });
      return { entered: entered, exited: exited, valueChanged: valueChanged };
    }

    function facts() {
      if (!factsValue) factsValue = computeFacts();
      return {
        entered: factsValue.entered.slice(),
        exited: factsValue.exited.slice(),
        valueChanged: factsValue.valueChanged.slice()
      };
    }

    function commit() {
      if (committed) return;
      committed = true;
      /* 同步提交唯一一次完整目标；公共 bindings 已在 commit 前接管受控内容。 */
      instance.update({
        items: copyItems(targetItems),
        groups: copyGroups(targetGroups),
        focus: targetFocus.slice(),
        changed: targetChanged.slice()
      });
    }

    function targets() {
      var list = instance.getMotionTargets();
      if (!Array.isArray(list)) return [];
      return list.map(function (item) {
        return {
          id: item.id,
          layoutEl: item.unit,
          unit: item.unit,
          contentEl: item.contentEl,
          valueEl: item.valueEl,
          labelEl: item.labelEl,
          markEl: item.markEl
        };
      });
    }

    function collectEnteredEffects(specs, byId, timing) {
      var enteredIndex = 0;
      targetItems.forEach(function (item) {
        if (hasOwn(sourceById, item.id)) return;
        var target = byId[item.id];
        if (!target || !target.contentEl) return;
        specs.push({
          el: target.contentEl,
          keyframes: [
            { opacity: '0', transform: 'translateY(-4px) scale(.94)' },
            { opacity: '1', transform: 'none' }
          ],
          options: {
            duration: timing.enterDuration,
            delay: enteredIndex * timing.stagger,
            easing: timing.easing,
            fill: 'backwards'
          }
        });
        enteredIndex += 1;
      });
    }


    function collectValueEffects(specs, byId, timing, attention) {
      var changedIndex = 0;
      targetItems.forEach(function (item) {
        var before = sourceById[item.id];
        if (!before) return;
        var beforeValue = before.value == null ? '' : String(before.value);
        if (beforeValue === item.value) return;
        var target = byId[item.id];
        if (!target || !target.valueEl) return;
        var swapDelay = timing.valueSwapDelay + changedIndex * timing.stagger;
        var swap = effects.planValueSwap({
          source: sourceContents[item.id],
          target: { carrier: target.contentEl, valueEl: target.valueEl },
          timing: timing,
          recipe: {
            ghostClass: 'nviz-sequence__value nviz-sequence__value--ghost',
            ghostDisplay: 'flex',
            ghostAlignItems: 'center',
            ghostJustifyContent: 'center',
            ghostKeyframes: [
              { opacity: '1', transform: 'translateY(0)', offset: 0 },
              /* attention 门控时新值更早显现，旧值让位也相应提前；普通字节流程保持原波形。 */
              { opacity: '1', transform: 'translateY(0)', offset: attention ? 0.3 : 0.5 },
              { opacity: '0', transform: 'translateY(-10px)', offset: 1 }
            ],
            ghostDuration: timing.valueSwapDuration,
            ghostDelay: swapDelay,
            ghostEasing: 'linear',
            targetKeyframes: [
              { opacity: '0', transform: 'translateY(8px)', offset: 0 },
              { opacity: '0', transform: 'translateY(8px)', offset: attention ? 0.15 : 0.55 },
              { opacity: '1', transform: 'none', offset: 1 }
            ],
            targetDuration: timing.valueSwapDuration,
            targetDelay: swapDelay,
            targetEasing: 'linear',
            targetGate: 'ready'
          }
        });
        if (swap.cleanup) ghostCleanups.push(swap.cleanup);
        specs.push.apply(specs, swap.specs);
        /* 强调在替换后才退场：先保持，再淡出；属于提示轨道，不拖住 objects-settled 揭示。 */
        specs.push({
          el: target.valueEl,
          keyframes: [
            { backgroundColor: 'rgba(247,201,72,.55)', offset: 0 },
            { backgroundColor: 'rgba(247,201,72,.55)', offset: 0.55 },
            { backgroundColor: 'rgba(247,201,72,0)', offset: 1 }
          ],
          options: {
            duration: timing.valueFlashDuration,
            delay: swapDelay,
            easing: 'linear',
            fill: 'backwards'
          },
          role: 'mark'
        });
        changedIndex += 1;
      });
    }

    function collectFocusEffects(specs, byId, timing) {
      targetItems.forEach(function (item) {
        if (targetFocus.indexOf(item.id) < 0) return;
        if (hasOwn(sourceFocus, item.id)) return;
        var target = byId[item.id];
        if (!target || !target.contentEl) return;
        specs.push({
          el: target.contentEl,
          keyframes: [
            { boxShadow: '0 0 0 0 rgba(49,92,218,.45)' },
            { boxShadow: '0 0 0 6px rgba(49,92,218,0)' }
          ],
          options: {
            duration: timing.markDuration,
            delay: timing.markDelay,
            easing: timing.easing,
            fill: 'backwards'
          },
          /* 提示型效果不进入 objects-settled 对象屏障，但仍属于最终完成边界。 */
          role: 'mark'
        });
      });
    }

    function collectCueEffects(specs, byId, timing) {
      var entered = {};
      targetItems.forEach(function (item) {
        if (!hasOwn(sourceById, item.id)) entered[item.id] = true;
        else if (String(sourceById[item.id].value) !== String(item.value)) entered[item.id] = true;
      });
      var targets = [];
      targetItems.forEach(function (item) {
        var target = byId[item.id];
        if (!target || !target.contentEl || entered[item.id]) return;
        targets.push({ id: item.id, el: target.contentEl });
      });
      specs.push.apply(specs, effects.planCueChanges({
        source: sourceCueStyles,
        targets: targets,
        timing: timing,
        properties: CUE_PROPS,
        duration: timing.cueDuration,
        /* 关注退场/建立的差分作为对象内容之外的提示尾部，不拖住 objects-settled。 */
        gate: 'finish'
      }));
    }

    function planEffects(effectCtx) {
      if (motion === 'never') {
          return [];
      }
      var ctx = isObject(effectCtx) ? effectCtx : {};
      var timing = effects.mergeTiming(null, ctx.timing, null);
      var attention = ctx.attention === true;
      var list = instance.getMotionTargets();
      var byId = {};
      (Array.isArray(list) ? list : []).forEach(function (item) { byId[item.id] = item; });
      var specs = [];
      collectEnteredEffects(specs, byId, timing);
      collectValueEffects(specs, byId, timing, attention);
      collectFocusEffects(specs, byId, timing);
      collectCueEffects(specs, byId, timing);
      return specs;
    }

    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      for (var c = 0; c < ghostCleanups.length; c += 1) {
        try { ghostCleanups[c](); } catch (error) { /* ignore */ }
      }
      ghostCleanups = [];
    }

    return {
      commit: commit,
      targets: targets,
      effects: planEffects,
      facts: facts,
      cleanup: cleanup
    };
  }

  /* ---------------- BindingHandle ---------------- */

  function createHandle(instance, owned) {
    var destroyed = false;

    function live(where) {
      if (destroyed) fail(where + '：sequence 实例已销毁');
    }

    function doRestore(view) {
      if (destroyed) return;
      var model = isObject(view && view.model) ? view.model : {};
      var cues = isObject(view && view.cues) ? view.cues : {};
      var items = Array.isArray(model.items) ? copyItems(model.items) : [];
      var groups = Array.isArray(model.groups) ? copyGroups(model.groups) : [];
      instance.update({
        items: items,
        groups: groups,
        focus: Array.isArray(cues.focus) ? cues.focus.slice() : [],
        changed: Array.isArray(cues.changed) ? cues.changed.slice() : []
      });
    }

    function doTarget(query) {
      if (destroyed || !isObject(query)) return null;
      if (query.part === 'root') {
        return instance.el && instance.el.nodeType === 1 ? instance.el : null;
      }
      if (query.id == null) return null;
      var id = String(query.id);
      var list = instance.getMotionTargets();
      var found = null;
      var i;
      for (i = 0; i < list.length; i += 1) {
        if (list[i].id === id) { found = list[i]; break; }
      }
      if (!found) return null;
      var part = query.part;
      if (part == null) return found.unit;
      if (part === 'cell') return found.contentEl;
      if (part === 'value') return found.valueEl;
      if (part === 'label') return found.labelEl;
      if (part === 'mark') return found.markEl;
      return null;
    }

    function doReadView() {
      if (destroyed) return null;
      return canonicalFromState(instance.getState());
    }

    function doApplyCues(cues) {
      if (destroyed) return;
      var input = isObject(cues) ? cues : {};
      instance.update({
        focus: Array.isArray(input.focus) ? input.focus.slice() : [],
        changed: Array.isArray(input.changed) ? input.changed.slice() : []
      });
    }

    return {
      restore: doRestore,
      readView: doReadView,
      applyCues: doApplyCues,
      target: doTarget,
      prepareChange: function (ctx) {
        live('prepareChange');
        return makePreparedChange(instance, isObject(ctx) ? ctx : {});
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        if (owned && typeof instance.destroy === 'function') instance.destroy();
      }
    };
  }

  /* ---------------- mount / adopt ---------------- */

  function mapMountOptions(options) {
    var input = isObject(options) ? options : {};
    var mapped = {};
    if (typeof input.variant === 'string') mapped.variant = input.variant;
    if (typeof input.index === 'boolean') mapped.index = input.index;
    if (typeof input.dense === 'boolean') mapped.dense = input.dense;
    if (typeof input.label === 'string') mapped.label = input.label;
    if (typeof input.summary === 'boolean') mapped.summary = input.summary;
    if (typeof input.stateText === 'boolean') mapped.stateText = input.stateText;
    if (typeof input.stable === 'boolean') mapped.stable = input.stable;
    return mapped;
  }

  function mount(host, options) {
    var Sequence = requireSequence();
    if (!host || host.nodeType !== 1) {
      throw new TypeError('sequence Adapter.mount(host, options)：host 必须是宿主任意元素。');
    }
    /* NoteDemo 默认组合：稳定占位、隐藏重复摘要与“变化”文字，保留对象标签、
     * 视觉 cues 与 aria 描述；宿主仍可用 options 覆盖。 */
    var mountOptions = { summary: false, stateText: false, stable: true };
    var provided = mapMountOptions(options);
    Object.keys(provided).forEach(function (key) { mountOptions[key] = provided[key]; });
    var instance = Sequence.mount(host, mountOptions);
    if (typeof instance.getState !== 'function' || typeof instance.getMotionTargets !== 'function' ||
        typeof instance.update !== 'function') {
      if (typeof instance.destroy === 'function') instance.destroy();
      throw new Error('sequence Adapter 需要 D01 提供 getState / getMotionTargets / update（请加载新版 src/viz/objects-sequence-matrix.js）。');
    }
    return createHandle(instance, true);
  }

  function adopt(instance) {
    if (!instance || typeof instance.update !== 'function' || typeof instance.getState !== 'function' ||
        typeof instance.getMotionTargets !== 'function' ||
        typeof instance.getTarget !== 'function') {
      fail('adopt 需要一个支持 getState / getMotionTargets / update 的 NoteViz.Sequence 实例。');
    }
    if (instance.destroyed) fail('adopt 的序列实例已销毁。');
    return createHandle(instance, false);
  }

  Internals.adapters = Internals.adapters || {};
  Internals.adapters[ADAPTER_NAME] = {
    name: ADAPTER_NAME,
    sceneModes: SCENE_MODES.slice(),
    defaultSceneMode: 'layout',
    sceneTimingDefaults: {
      enterDuration: 420,
      stagger: 40,
      valueSwapDelay: 160,
      valueSwapDuration: 420,
      valueFlashDuration: 560,
      markDelay: 200,
      markDuration: 420
    },
    normalizeView: normalizeView,
    validateAction: validateAction,
    mount: mount,
    adopt: adopt
  };
})(window);

/* ---- source: src/demo/adapters/sequence-edit.js ---- */
/* NoteDemo Adapter — sequence-edit（M01 序列编辑）。
 * Scope: window.NoteDemoInternals.adapters['sequence-edit']
 * Depends on: NoteCore、NoteViz.SequenceEdit（仅在实际 mount/adopt 时检查）。
 * 经典脚本，无模块/无网络/无 eval。
 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var ADAPTER_NAME = 'sequence-edit';

  function fail(message) {
    throw new Error(ADAPTER_NAME + ' Adapter：' + message);
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function requireSequenceEdit() {
    var viz = global.NoteViz;
    if (!viz || !viz.SequenceEdit || typeof viz.SequenceEdit.mount !== 'function') {
      throw new Error('sequence-edit Adapter 需要先加载 NoteViz.SequenceEdit（src/viz/mechanisms-sequence-edit.js）。');
    }
    return viz.SequenceEdit;
  }

  function normalizeId(value, where) {
    if (value == null) fail(where + ' 不能为空');
    if (typeof value !== 'string' && typeof value !== 'number') fail(where + ' 必须是字符串 ID');
    var id = String(value);
    if (id === '') fail(where + ' 不能为空字符串');
    return id;
  }

  function normalizeItems(input) {
    if (!Array.isArray(input)) fail('view.items 必须是数组');
    var seen = {};
    var result = [];
    input.forEach(function (entry, index) {
      if (!isObject(entry)) fail('view.items[' + index + '] 必须是 {id,label} 对象');
      var id = normalizeId(entry.id, 'view.items[' + index + '].id');
      if (Object.prototype.hasOwnProperty.call(seen, id)) fail('view.items 中的 id "' + id + '" 重复');
      seen[id] = true;
      var label = entry.label;
      if (label == null) label = '';
      if (typeof label !== 'string') fail('view.items[' + index + '].label 必须是字符串');
      result.push({ id: id, label: label });
    });
    return result;
  }

  function normalizeIdList(value, where, allowed) {
    if (value == null) return [];
    if (!Array.isArray(value)) fail(where + ' 必须是 ID 数组');
    var seen = {};
    var result = [];
    value.forEach(function (entry, index) {
      var id = normalizeId(entry, where + '[' + index + ']');
      if (allowed && !allowed[id]) fail(where + '[' + index + '] 引用了不存在的对象 "' + id + '"');
      if (!seen[id]) {
        seen[id] = true;
        result.push(id);
      }
    });
    result.sort();
    return result;
  }

  function actionType(action) {
    return isObject(action) && action.type != null ? String(action.type) : '';
  }

  function actionParams(action) {
    return isObject(action) && isObject(action.params) ? action.params : {};
  }

  function normalizeView(input) {
    if (!isObject(input)) fail('view 必须是 {items,focus?,changed?} 对象');
    var items = normalizeItems(input.items);
    var allowed = {};
    items.forEach(function (item) { allowed[item.id] = true; });
    return {
      model: { items: items },
      cues: {
        focus: normalizeIdList(input.focus, 'view.focus', allowed),
        changed: normalizeIdList(input.changed, 'view.changed', allowed)
      }
    };
  }

  function validateAction(action) {
    if (!isObject(action)) fail('action 必须是 {binding,type,params?} 对象');
    var type = actionType(action);
    if (type === 'remove') {
      var removeId = actionParams(action).id;
      if (removeId == null) fail('remove 动作缺少 params.id');
      normalizeId(removeId, 'remove.params.id');
      return;
    }
    if (type === 'swap') {
      var params = actionParams(action);
      if (params.a == null || params.b == null) fail('swap 动作缺少 params.a / params.b');
      normalizeId(params.a, 'swap.params.a');
      normalizeId(params.b, 'swap.params.b');
      return;
    }
    fail('不支持动作 "' + (type || '(空)') + '"，sequence-edit 仅支持 remove / swap。');
  }

  function readViewFrom(state) {
    var items = (Array.isArray(state && state.items) ? state.items : []).map(function (item) {
      return { id: String(item.id), label: item.label == null ? '' : String(item.label) };
    });
    return {
      model: { items: items },
      cues: {
        focus: (Array.isArray(state && state.focus) ? state.focus : []).map(function (id) { return String(id); }),
        changed: (Array.isArray(state && state.changed) ? state.changed : []).map(function (id) { return String(id); })
      }
    };
  }

  function createHandle(instance, container, owned) {
    var destroyed = false;
    return {
      restore: function (view) {
        if (destroyed) return;
        var model = isObject(view && view.model) ? view.model : { items: [] };
        var cues = isObject(view && view.cues) ? view.cues : {};
        instance.restoreView({
          model: { items: model.items },
          cues: { focus: cues.focus, changed: cues.changed }
        });
      },
      readView: function () {
        if (destroyed) return null;
        return readViewFrom(instance.getState());
      },
      applyCues: function (cues) {
        if (destroyed) return;
        var input = isObject(cues) ? cues : {};
        instance.applyViewCues({ focus: input.focus, changed: input.changed });
      },
      perform: function (action, ctx) {
        var reduced = !!(ctx && ctx.motion === 'reduced');
        return instance.runAction(
          { type: actionType(action), params: actionParams(action) },
          { animate: !reduced }
        );
      },
      settleVisual: function () {
        if (destroyed) return Promise.resolve();
        return typeof instance.settleVisual === 'function' ? instance.settleVisual() : Promise.resolve();
      },
      target: function (query) {
        if (destroyed) return null;
        if (!isObject(query) || query.id == null) return null;
        var target = instance.getTarget(query.id);
        return target && target.nodeType === 1 ? target : null;
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        if (owned) instance.destroy();
        if (container && container.parentNode) container.parentNode.removeChild(container);
      }
    };
  }

  function mount(host, options) {
    var SequenceEdit = requireSequenceEdit();
    if (!host || host.nodeType !== 1) {
      throw new TypeError('sequence-edit Adapter.mount(host, options)：host 必须是宿主任意元素。');
    }
    var container = global.document.createElement('div');
    container.className = 'note-demo-adapter note-demo-adapter--sequence-edit';
    container.setAttribute('data-adapter', ADAPTER_NAME);
    host.appendChild(container);
    var instance;
    try {
      instance = SequenceEdit.mount(container, isObject(options) ? options : {});
    } catch (error) {
      if (container.parentNode) container.parentNode.removeChild(container);
      throw error;
    }
    if (typeof instance.restoreView !== 'function' || typeof instance.applyViewCues !== 'function' ||
        typeof instance.runAction !== 'function') {
      instance.destroy();
      if (container.parentNode) container.parentNode.removeChild(container);
      throw new Error('sequence-edit Adapter 需要组件提供 restoreView / applyViewCues / runAction（请加载新版 src/viz/mechanisms-sequence-edit.js）。');
    }
    return createHandle(instance, container, true);
  }

  function adopt(instance) {
    if (!instance || typeof instance.restoreView !== 'function' || typeof instance.applyViewCues !== 'function' ||
        typeof instance.runAction !== 'function' || typeof instance.getState !== 'function') {
      fail('adopt 需要一个支持 restoreView / applyViewCues / runAction 的 NoteViz.SequenceEdit 实例。');
    }
    return createHandle(instance, null, false);
  }

  Internals.adapters = Internals.adapters || {};
  Internals.adapters[ADAPTER_NAME] = {
    name: ADAPTER_NAME,
    normalizeView: normalizeView,
    validateAction: validateAction,
    mount: mount,
    adopt: adopt
  };
})(window);

/* ---- source: src/demo/adapters/sequence-insert.js ---- */
/* NoteDemo Adapter — sequence-insert（R10 序列插入与让位）。
 * Scope: window.NoteDemoInternals.adapters['sequence-insert']
 * Depends on: window.SeqInsert（src/viz/sequence-insert.js；仅在实际 mount/adopt 时检查）。
 * 经典脚本，无模块/无网络/无 eval。
 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var ADAPTER_NAME = 'sequence-insert';

  function fail(message) {
    throw new Error(ADAPTER_NAME + ' Adapter：' + message);
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function requireSeqInsert() {
    var api = global.SeqInsert;
    if (!api || typeof api.mount !== 'function') {
      throw new Error('sequence-insert Adapter 需要先加载 SeqInsert（src/viz/sequence-insert.js）。');
    }
    return api;
  }

  function actionType(action) {
    return isObject(action) && action.type != null ? String(action.type) : '';
  }

  function normalizeView(input) {
    if (!isObject(input)) fail('view 必须是 {inserted:boolean} 对象');
    var inserted = input.inserted;
    if (inserted == null) inserted = false;
    if (typeof inserted !== 'boolean') fail('view.inserted 必须是布尔值');
    return { model: { inserted: inserted }, cues: {} };
  }

  function validateAction(action) {
    if (!isObject(action)) fail('action 必须是 {binding,type,params?} 对象');
    var type = actionType(action);
    if (type !== 'insert' && type !== 'restore') {
      fail('不支持动作 "' + (type || '(空)') + '"，sequence-insert 仅支持 insert / restore。');
    }
    if (action.params != null) {
      if (!isObject(action.params)) fail(type + ' 动作的 params 必须是对象');
      var keys = Object.keys(action.params);
      if (keys.length) fail(type + ' 动作的 params 必须为空对象');
    }
  }

  function createHandle(instance, container, owned) {
    var destroyed = false;
    return {
      restore: function (view) {
        if (destroyed) return;
        var model = isObject(view && view.model) ? view.model : {};
        instance.restoreView({ model: { inserted: !!model.inserted }, cues: {} });
      },
      readView: function () {
        if (destroyed) return null;
        return { model: { inserted: !!instance.inserted }, cues: {} };
      },
      perform: function (action, ctx) {
        var reduced = !!(ctx && ctx.motion === 'reduced');
        var effect = instance.runAction({ type: actionType(action) }, { animate: !reduced });
        if (!effect || !effect.finished || typeof effect.finished.then !== 'function') return effect;
        var finished = effect.finished.then(function (outcome) {
          if (!outcome || outcome.status !== 'completed') return outcome;
          var settle = typeof instance.settleVisual === 'function' ? instance.settleVisual() : null;
          if (!settle || typeof settle.then !== 'function') return outcome;
          return Promise.resolve(settle).then(function () { return outcome; }, function () { return outcome; });
        });
        return {
          finished: finished,
          cancel: function () {
            try { effect.cancel(); } catch (error) { /* 已结束或已销毁 */ }
          }
        };
      },
      target: function (query) {
        if (destroyed) return null;
        if (!isObject(query)) return null;
        var target = typeof instance.getTarget === 'function' ? instance.getTarget(query) : null;
        return target && target.nodeType === 1 ? target : null;
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        if (owned) instance.destroy();
        if (container && container.parentNode) container.parentNode.removeChild(container);
      }
    };
  }

  function mount(host, options) {
    var SeqInsert = requireSeqInsert();
    if (!host || host.nodeType !== 1) {
      throw new TypeError('sequence-insert Adapter.mount(host, options)：host 必须是宿主任意元素。');
    }
    var container = global.document.createElement('div');
    container.className = 'note-demo-adapter note-demo-adapter--sequence-insert';
    container.setAttribute('data-adapter', ADAPTER_NAME);
    host.appendChild(container);
    var instance;
    try {
      instance = SeqInsert.mount(container, isObject(options) ? options : {});
    } catch (error) {
      if (container.parentNode) container.parentNode.removeChild(container);
      throw error;
    }
    if (typeof instance.restoreView !== 'function' || typeof instance.runAction !== 'function' ||
        typeof instance.getTarget !== 'function') {
      instance.destroy();
      if (container.parentNode) container.parentNode.removeChild(container);
      throw new Error('sequence-insert Adapter 需要组件提供 restoreView / runAction / getTarget（请加载新版 src/viz/sequence-insert.js）。');
    }
    return createHandle(instance, container, true);
  }

  function adopt(instance) {
    if (!instance || typeof instance.restoreView !== 'function' || typeof instance.runAction !== 'function' ||
        typeof instance.getTarget !== 'function') {
      fail('adopt 需要一个支持 restoreView / runAction / getTarget 的 SeqInsert 实例。');
    }
    return createHandle(instance, null, false);
  }

  Internals.adapters = Internals.adapters || {};
  Internals.adapters[ADAPTER_NAME] = {
    name: ADAPTER_NAME,
    normalizeView: normalizeView,
    validateAction: validateAction,
    mount: mount,
    adopt: adopt
  };
})(window);

/* ---- source: src/demo/adapters/dom.js ---- */
/* NoteDemo Adapter — dom（最小文本占位画面）。
 * Scope: window.NoteDemoInternals.adapters.dom
 * Depends on: NoteCore（可选）、NoteDemoInternals.effects（场景值交换时）。
 * 经典脚本，无模块/无网络/无 eval。
 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var ADAPTER_NAME = 'dom';

  function fail(message) {
    throw new Error(ADAPTER_NAME + ' Adapter：' + message);
  }
  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }
  function effectsModule() {
    var effects = Internals.effects;
    if (!effects || typeof effects.captureContent !== 'function' || typeof effects.planValueSwap !== 'function') {
      throw new Error('dom Adapter 需要先加载 NoteDemoInternals.effects。');
    }
    return effects;
  }
  function normalizeView(input) {
    if (!isObject(input)) fail('view 必须是 {text:string} 对象');
    var value = input.text;
    if (value == null) value = '';
    if (typeof value !== 'string') fail('view.text 必须是字符串');
    return { model: { text: value }, cues: {} };
  }
  function validateAction(action) {
    var type = isObject(action) && action.type != null ? String(action.type) : '';
    fail('dom 是静态恢复型 Adapter，不支持动作' + (type ? ' "' + type + '"' : '') + '。');
  }
  function viewText(view) {
    var model = isObject(view && view.model) ? view.model : {};
    return typeof model.text === 'string' ? model.text : (model.text == null ? '' : String(model.text));
  }
  function canonical(value) {
    return { model: { text: value == null ? '' : String(value) }, cues: {} };
  }
  function makePreparedChange(root, valueSlot, context) {
    var sourceView = isObject(context) ? context.sourceView : null;
    var targetView = isObject(context) ? context.targetView : null;
    var sourceText = viewText(sourceView);
    var targetText = viewText(targetView);
    var effects = effectsModule();
    var source = effects.captureContent({ valueEl: valueSlot, carrier: root });
    var committed = false;
    var ghostCleanup = null;
    return {
      commit: function () {
        if (committed) return;
        committed = true;
        valueSlot.textContent = targetText;
      },
      effects: function (effectCtx) {
        var motion = isObject(effectCtx) && effectCtx.motion === 'never' ? 'never' : 'auto';
        var attention = isObject(effectCtx) && effectCtx.attention === true;
        var timing = isObject(effectCtx) && isObject(effectCtx.timing) ? effectCtx.timing : effects.mergeTiming();
        if (sourceText === targetText || motion === 'never') return [];
        var swap = effects.planValueSwap({
          source: source,
          target: { carrier: root, valueEl: valueSlot },
          timing: timing,
          recipe: {
            ghostClass: 'note-demo-dom__ghost',
            ghostDisplay: 'flex',
            ghostAlignItems: 'center',
            ghostJustifyContent: 'flex-start',
            ghostKeyframes: [
              { opacity: '1' },
              { opacity: '1', offset: attention ? 0.25 : 0.45 },
              { opacity: '0' }
            ],
            ghostDuration: timing.valueSwapDuration,
            ghostDelay: timing.valueSwapDelay,
            ghostEasing: 'linear',
            targetKeyframes: [
              { opacity: '0' },
              { opacity: '0', offset: attention ? 0.15 : 0.35 },
              { opacity: '1' }
            ],
            targetDuration: timing.valueSwapDuration,
            targetDelay: timing.valueSwapDelay,
            targetEasing: 'linear',
            targetGate: 'ready'
          }
        });
        ghostCleanup = swap.cleanup;
        return swap.specs;
      },
      facts: function () {
        return { textChanged: sourceText !== targetText };
      },
      cleanup: function () {
        if (ghostCleanup) {
          try { ghostCleanup(); } catch (error) { /* ignore */ }
          ghostCleanup = null;
        }
      },
      readView: function () {
        return canonical(valueSlot.textContent);
      }
    };
  }
  function initRoot(root) {
    var valueSlot = root.querySelector ? root.querySelector('.note-demo-dom__value') : null;
    if (!valueSlot) {
      valueSlot = global.document.createElement('span');
      valueSlot.className = 'note-demo-dom__value';
      valueSlot.setAttribute('data-adapter-part', 'value');
      var existing = Array.prototype.slice.call(root.childNodes || []);
      existing.forEach(function (node) {
        if (node === valueSlot) return;
        try { valueSlot.appendChild(node); } catch (error) { /* ignore */ }
      });
      root.appendChild(valueSlot);
    }
    return valueSlot;
  }
  function createHandle(root, container, owned) {
    var destroyed = false;
    var valueSlot = initRoot(root);
    return {
      restore: function (view) {
        if (destroyed) return;
        valueSlot.textContent = viewText(view);
      },
      target: function (query) {
        if (destroyed || !isObject(query)) return null;
        if (query.part === 'root') return root;
        if (query.part === 'value') return valueSlot;
        return null;
      },
      readView: function () {
        if (destroyed) return null;
        return canonical(valueSlot.textContent);
      },
      prepareChange: function (context) {
        if (destroyed) fail('已销毁的 dom 实例不能 prepareChange');
        return makePreparedChange(root, valueSlot, context);
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        if (owned && root.parentNode) root.parentNode.removeChild(root);
        if (container && container.parentNode) container.parentNode.removeChild(container);
      }
    };
  }
  function mount(host) {
    if (!host || host.nodeType !== 1) {
      throw new TypeError('dom Adapter.mount(host, options)：host 必须是宿主任意元素。');
    }
    var container = global.document.createElement('div');
    container.className = 'note-demo-adapter note-demo-adapter--dom';
    container.setAttribute('data-adapter', ADAPTER_NAME);
    var root = global.document.createElement('div');
    root.className = 'note-demo-dom';
    root.setAttribute('data-adapter-part', 'root');
    container.appendChild(root);
    host.appendChild(container);
    return createHandle(root, container, true);
  }
  function adopt(instance) {
    var root = null;
    if (instance && instance.nodeType === 1) root = instance;
    else if (instance && instance.el && instance.el.nodeType === 1) root = instance.el;
    if (!root) fail('adopt 需要一个元素或 {el:Element} 作为借用实例。');
    return createHandle(root, null, false);
  }
  Internals.adapters = Internals.adapters || {};
  Internals.adapters[ADAPTER_NAME] = {
    name: ADAPTER_NAME,
    sceneModes: ['cut', 'update', 'reveal'],
    defaultSceneMode: 'update',
    sceneTimingDefaults: {
      valueSwapDelay: 0,
      valueSwapDuration: 420
    },
    normalizeView: normalizeView,
    validateAction: validateAction,
    mount: mount,
    adopt: adopt
  };
})(window);

/* ---- source: src/demo/adapters/expression.js ---- */
/* NoteDemo Adapter — expression（C13；默认 layout，项级排布与内容交换）。
 * Scope: window.NoteDemoInternals.adapters.expression
 * Depends on: NoteCore（可选）、NoteUI.Expression、NoteDemoInternals.effects（只在实际 mount/adopt/prepare 时检查）。
 * 经典脚本，无模块/无网络/无 eval。
 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var ADAPTER_NAME = 'expression';
  var CUE_PROPS = ['backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor',
    'borderLeftColor', 'outlineColor', 'outlineWidth', 'outlineOffset', 'color'];

  function fail(message) {
    throw new Error(ADAPTER_NAME + ' Adapter：' + message);
  }
  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }
  function text(value) {
    return value == null ? '' : String(value);
  }
  function own(object, key) {
    return object != null && Object.prototype.hasOwnProperty.call(object, key);
  }
  function effectsModule() {
    var effects = Internals.effects;
    if (!effects || typeof effects.captureContent !== 'function' ||
        typeof effects.planValueSwap !== 'function' || typeof effects.planCueChanges !== 'function') {
      throw new Error('expression Adapter 需要先加载 NoteDemoInternals.effects。');
    }
    return effects;
  }
  function requireExpression() {
    var ui = global.NoteUI;
    if (!ui || !ui.Expression || typeof ui.Expression.mount !== 'function') {
      throw new Error('expression Adapter 需要先加载 NoteUI.Expression（src/ui/expression.js）。');
    }
    return ui.Expression;
  }
  function normalizeId(value, where) {
    var id = text(value);
    if (!id) fail(where + ' 不能为空');
    return id;
  }
  function normalizeParts(input, where) {
    if (!Array.isArray(input)) fail(where + ' 必须是数组');
    var seen = {};
    var output = [];
    input.forEach(function (part, index) {
      if (!isObject(part)) fail(where + '[' + index + '] 必须是对象');
      var id = normalizeId(part.id, where + '[' + index + '].id');
      if (own(seen, id)) fail(where + ' 中 id "' + id + '" 重复');
      seen[id] = true;
      var hasText = own(part, 'text');
      var hasTex = own(part, 'tex');
      if (hasText === hasTex) fail(where + '[' + index + '] 必须在 text 与 tex 中二选一');
      if (hasText) output.push({ id: id, text: text(part.text) });
      else {
        var tex = text(part.tex);
        if (!tex) fail(where + '[' + index + '].tex 不能为空');
        output.push({ id: id, tex: tex });
      }
    });
    return output;
  }
  function normalizeCueList(input, ids, where) {
    if (input == null) return [];
    if (!Array.isArray(input)) fail(where + ' 必须是数组');
    var seen = {};
    var output = [];
    input.forEach(function (value, index) {
      var id = normalizeId(value, where + '[' + index + ']');
      if (!own(ids, id)) fail(where + ' 引用了不存在的项 "' + id + '"');
      if (!own(seen, id)) {
        seen[id] = true;
        output.push(id);
      }
    });
    return output;
  }
  function normalizeView(input) {
    if (!isObject(input)) fail('view 必须是 {parts,focus?,changed?,label?} 对象');
    var parts = normalizeParts(input.parts == null ? [] : input.parts, 'view.parts');
    var ids = {};
    parts.forEach(function (part) { ids[part.id] = true; });
    return {
      model: { parts: parts, label: text(input.label) },
      cues: {
        focus: normalizeCueList(input.focus, ids, 'view.focus'),
        changed: normalizeCueList(input.changed, ids, 'view.changed')
      }
    };
  }
  function copyModel(model) {
    return {
      parts: model.parts.map(function (part) {
        return part.tex !== undefined ? { id: part.id, tex: part.tex } : { id: part.id, text: part.text };
      }),
      label: model.label
    };
  }
  function copyCues(cues) {
    return { focus: cues.focus.slice(), changed: cues.changed.slice() };
  }
  function canonicalFromState(state) {
    if (!isObject(state) || !Array.isArray(state.parts)) fail('getState() 必须返回 parts');
    var ids = {};
    var parts = state.parts.map(function (part, index) {
      if (!isObject(part)) fail('getState().parts[' + index + '] 不是对象');
      var id = normalizeId(part.id, 'getState().parts[' + index + '].id');
      if (own(ids, id)) fail('getState() 读回重复 id "' + id + '"');
      ids[id] = true;
      if (part.tex !== undefined) return { id: id, tex: text(part.tex) };
      return { id: id, text: text(part.text) };
    });
    return {
      model: { parts: parts, label: text(state.label) },
      cues: {
        focus: normalizeCueList(state.focus, ids, 'getState().focus'),
        changed: normalizeCueList(state.changed, ids, 'getState().changed')
      }
    };
  }
  function viewPatch(view) {
    var model = isObject(view && view.model) ? view.model : { parts: [], label: '' };
    var cues = isObject(view && view.cues) ? view.cues : {};
    return {
      parts: copyModel(model).parts,
      label: text(model.label),
      focus: Array.isArray(cues.focus) ? cues.focus.slice() : [],
      changed: Array.isArray(cues.changed) ? cues.changed.slice() : []
    };
  }
  function validateAction(action) {
    var type = isObject(action) && action.type != null ? String(action.type) : '';
    fail('expression 是 scene 接入 Adapter，不使用 old actions 动作路径' + (type ? '（收到 "' + type + '"）' : '') + '。');
  }
  function rectOf(element) {
    if (!element || typeof element.getBoundingClientRect !== 'function') return null;
    var rect = element.getBoundingClientRect();
    return rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null;
  }
  function targetMap(instance) {
    var list = instance.getMotionTargets();
    var map = {};
    (Array.isArray(list) ? list : []).forEach(function (target) {
      if (target && target.id != null) map[String(target.id)] = target;
    });
    return map;
  }
  function sourceUnits(instance) {
    var list = instance.getMotionTargets();
    var output = {};
    (Array.isArray(list) ? list : []).forEach(function (target) {
      if (!target || !target.unit || typeof target.unit.cloneNode !== 'function') return;
      var clone = target.unit.cloneNode(true);
      clone.removeAttribute('data-part-id');
      clone.removeAttribute('data-mark');
      clone.setAttribute('aria-hidden', 'true');
      if (clone.querySelectorAll) {
        Array.prototype.forEach.call(clone.querySelectorAll('[data-part-id]'), function (item) { item.removeAttribute('data-part-id'); });
        Array.prototype.forEach.call(clone.querySelectorAll('[aria-label]'), function (item) { item.setAttribute('aria-hidden', 'true'); });
      }
      output[target.id] = { clone: clone, rect: rectOf(target.unit) };
    });
    return output;
  }
  function makePreparedChange(instance, context) {
    var sourceView = isObject(context.sourceView) ? context.sourceView : null;
    var targetView = isObject(context.targetView) ? context.targetView : null;
    if (!sourceView || !isObject(sourceView.model)) fail('prepareChange 需要 sourceView.model');
    if (!targetView || !isObject(targetView.model)) fail('prepareChange 需要 targetView.model');
    var effects = effectsModule();
    var sourceParts = sourceView.model.parts || [];
    var targetParts = targetView.model.parts || [];
    var sourceById = {};
    var targetById = {};
    sourceParts.forEach(function (part) { sourceById[part.id] = part; });
    targetParts.forEach(function (part) { targetById[part.id] = part; });
    var sourceTargets = targetMap(instance);
    var clones = sourceUnits(instance);
    var sourceCueStyles = effects.captureStyles(
      Object.keys(sourceTargets).map(function (id) { return { id: id, el: sourceTargets[id].unit }; }),
      CUE_PROPS
    );
    var facts = {
      entered: targetParts.filter(function (part) { return !own(sourceById, part.id); }).map(function (part) { return part.id; }),
      exited: sourceParts.filter(function (part) { return !own(targetById, part.id); }).map(function (part) { return part.id; }),
      valueChanged: targetParts.filter(function (part) {
        var before = sourceById[part.id];
        return before && JSON.stringify(before) !== JSON.stringify(part);
      }).map(function (part) { return part.id; })
    };
    var sourceContents = {};
    facts.valueChanged.forEach(function (id) {
      var source = sourceTargets[id];
      if (!source || !source.contentEl || !source.valueEl) return;
      sourceContents[id] = effects.captureContent({ valueEl: source.valueEl, carrier: source.contentEl });
    });
    var committed = false;
    var ghostCleanups = [];
    var exitGhosts = [];
    var valueGhosts = [];
    var effectsCache = null;
    function cleanup() {
      for (var i = 0; i < ghostCleanups.length; i += 1) {
        try { ghostCleanups[i](); } catch (error) { /* ignore */ }
      }
      ghostCleanups = [];
      for (var e = 0; e < exitGhosts.length; e += 1) {
        try { if (exitGhosts[e].parentNode) exitGhosts[e].parentNode.removeChild(exitGhosts[e]); } catch (error) { /* ignore */ }
      }
      exitGhosts = [];
      for (var v = 0; v < valueGhosts.length; v += 1) {
        try { if (valueGhosts[v].parentNode) valueGhosts[v].parentNode.removeChild(valueGhosts[v]); } catch (error) { /* ignore */ }
      }
      valueGhosts = [];
      if (effectsCache && effectsCache.cleanup) {
        try { effectsCache.cleanup(); } catch (error) { /* ignore */ }
      }
      effectsCache = null;
    }
    return {
      commit: function () {
        if (committed) return;
        committed = true;
        instance.update(viewPatch(targetView));
      },
      targets: function () {
        var list = instance.getMotionTargets();
        return Array.isArray(list) ? list : [];
      },
      effects: function (effectCtx) {
        var motion = isObject(effectCtx) && effectCtx.motion === 'never' ? 'never' : 'auto';
        var attention = isObject(effectCtx) && effectCtx.attention === true;
        var timing = isObject(effectCtx) && isObject(effectCtx.timing) ? effectCtx.timing : effects.mergeTiming();
        if (effectsCache) return effectsCache.specs;
        if (motion === 'never') {
          effectsCache = { specs: [], cleanup: function () {} };
          return [];
        }
        var targets = targetMap(instance);
        var specs = [];
        try {
          var enteredIndex = 0;
          facts.entered.forEach(function (id) {
            var target = targets[id];
            if (!target || !target.contentEl) return;
            specs.push({
              el: target.contentEl,
              keyframes: [
                { opacity: '0', transform: 'translateY(6px)' },
                { opacity: '1', transform: 'none' }
              ],
              options: {
                duration: timing.enterDuration,
                delay: enteredIndex * timing.stagger,
                easing: timing.easing,
                fill: 'backwards'
              },
              gate: 'ready'
            });
            enteredIndex += 1;
          });

          facts.exited.forEach(function (id) {
            var source = clones[id];
            if (!source || !source.clone || !source.rect || !instance.el) return;
            var ghost = global.document.createElement('span');
            ghost.className = 'nui-expression__ghost nui-expression__ghost--exit';
            ghost.setAttribute('aria-hidden', 'true');
            ghost.setAttribute('data-exit-ghost', id);
            ghost.style.position = 'fixed';
            ghost.style.left = source.rect.left + 'px';
            ghost.style.top = source.rect.top + 'px';
            ghost.style.width = source.rect.width + 'px';
            ghost.style.height = source.rect.height + 'px';
            ghost.style.display = 'inline-flex';
            ghost.style.alignItems = 'baseline';
            ghost.style.pointerEvents = 'none';
            ghost.style.zIndex = '3';
            ghost.appendChild(source.clone);
            try {
              instance.el.appendChild(ghost);
            } catch (error) {
              ghost = null;
            }
            if (!ghost) return;
            exitGhosts.push(ghost);
            specs.push({
              el: ghost,
              keyframes: [{ opacity: '1' }, { opacity: '1', offset: 0.35 }, { opacity: '0', transform: 'translateY(-6px)' }],
              options: { duration: timing.exitDuration, easing: 'linear', fill: 'backwards' },
              cleanupEl: ghost,
              gate: 'finish'
            });
          });

          var changedIndex = 0;
          facts.valueChanged.forEach(function (id) {
            var target = targets[id];
            if (!target || !target.valueEl) return;
            var swap = effects.planValueSwap({
              source: sourceContents[id],
              target: { carrier: target.contentEl, valueEl: target.valueEl },
              timing: timing,
              recipe: {
                ghostClass: 'nui-expression__ghost nui-expression__ghost--value',
                ghostDisplay: 'inline-flex',
                ghostAlignItems: 'baseline',
                ghostJustifyContent: 'flex-start',
                ghostKeyframes: [
                  { opacity: '1' },
                  { opacity: '1', offset: attention ? 0.25 : 0.45 },
                  { opacity: '0' }
                ],
                ghostDuration: timing.valueSwapDuration,
                ghostDelay: timing.valueSwapDelay + changedIndex * timing.stagger,
                ghostEasing: 'linear',
                targetKeyframes: [
                  { opacity: '0' },
                  { opacity: '0', offset: attention ? 0.15 : 0.3 },
                  { opacity: '1' }
                ],
                targetDuration: timing.valueSwapDuration,
                targetDelay: timing.valueSwapDelay + changedIndex * timing.stagger,
                targetEasing: 'linear',
                targetGate: 'ready'
              }
            });
            if (swap.cleanup) ghostCleanups.push(swap.cleanup);
            swap.specs.forEach(function (spec) { if (spec.cleanupEl) valueGhosts.push(spec.cleanupEl); });
            specs = specs.concat(swap.specs);
            changedIndex += 1;
          });

          var skip = {};
          facts.entered.concat(facts.exited, facts.valueChanged).forEach(function (id) { skip[id] = true; });
          var cueTargets = Object.keys(targets).filter(function (id) { return !skip[id]; }).map(function (id) {
            return { id: id, el: targets[id].unit };
          });
          specs = specs.concat(effects.planCueChanges({
            source: sourceCueStyles,
            targets: cueTargets,
            timing: timing,
            properties: CUE_PROPS,
            duration: timing.cueDuration,
            gate: 'ready'
          }));

          effectsCache = {
            specs: specs,
            cleanup: function () {
              for (var c = 0; c < ghostCleanups.length; c += 1) {
                try { ghostCleanups[c](); } catch (error) { /* ignore */ }
              }
              ghostCleanups = [];
              for (var e = 0; e < exitGhosts.length; e += 1) {
                try { if (exitGhosts[e].parentNode) exitGhosts[e].parentNode.removeChild(exitGhosts[e]); } catch (error) { /* ignore */ }
              }
              exitGhosts = [];
              valueGhosts = [];
            }
          };
          return specs;
        } catch (error) {
          cleanup();
          throw error;
        }
      },
      facts: function () { return facts; },
      cleanup: cleanup,
      readView: function () {
        return canonicalFromState(instance.getState());
      }
    };
  }
  function createHandle(instance, container, owned) {
    var destroyed = false;
    return {
      restore: function (view) {
        if (destroyed) return;
        instance.update(viewPatch(view));
      },
      target: function (query) {
        if (destroyed || !isObject(query)) return null;
        if (query.part === 'root') return instance.el;
        if (query.part === 'body') return instance.getTarget({ part: 'body' });
        if (query.id == null) return null;
        return instance.getTarget({ id: query.id, part: query.part });
      },
      readView: function () {
        return destroyed ? null : canonicalFromState(instance.getState());
      },
      prepareChange: function (ctx) {
        if (destroyed) fail('已销毁的 expression 实例不能 prepareChange');
        return makePreparedChange(instance, isObject(ctx) ? ctx : {});
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        if (owned && instance.destroy) instance.destroy();
        if (container && container.parentNode) container.parentNode.removeChild(container);
      }
    };
  }
  function mount(host, options) {
    var Expression = requireExpression();
    if (!host || host.nodeType !== 1) throw new TypeError('expression Adapter.mount(host, options)：host 必须是宿主任意元素。');
    var container = global.document.createElement('div');
    container.className = 'note-demo-adapter note-demo-adapter--expression';
    container.setAttribute('data-adapter', ADAPTER_NAME);
    host.appendChild(container);
    var instance;
    try {
      instance = Expression.mount(container, isObject(options) ? options : {});
    } catch (error) {
      if (container.parentNode) container.parentNode.removeChild(container);
      throw error;
    }
    return createHandle(instance, container, true);
  }
  function adopt(instance) {
    if (!instance || typeof instance.update !== 'function' || typeof instance.getState !== 'function' ||
        typeof instance.getMotionTargets !== 'function') {
      fail('adopt 需要一个 NoteUI.Expression 实例（含 update/getState/getMotionTargets）。');
    }
    if (instance.destroyed) fail('adopt 的 expression 实例已销毁。');
    return createHandle(instance, null, false);
  }
  Internals.adapters = Internals.adapters || {};
  Internals.adapters[ADAPTER_NAME] = {
    name: ADAPTER_NAME,
    sceneModes: ['layout', 'cut'],
    defaultSceneMode: 'layout',
    sceneTimingDefaults: {
      enterDuration: 360,
      exitDuration: 320,
      valueSwapDelay: 0,
      valueSwapDuration: 420
    },
    normalizeView: normalizeView,
    validateAction: validateAction,
    mount: mount,
    adopt: adopt
  };
})(window);

/* ---- source: src/demo/adapters/index.js ---- */
/* NoteDemo Adapter registry — 汇总内置 Adapter。
 * Scope: window.NoteDemoInternals.adapters
 * Load after adapters/matrix.js、sequence.js、sequence-edit.js、sequence-insert.js、dom.js、expression.js。
 * 经典脚本，无模块/无网络/无 eval。
 */
(function (global) {
  'use strict';

  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var ORDER = ['matrix', 'sequence', 'sequence-edit', 'sequence-insert', 'dom', 'expression'];
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

/* ---- source: src/demo/authoring.js ---- */
/* NoteDemo authoring helpers — slot collection and full-Definition compilation.
 * Scope: window.NoteDemoAuthor / NoteDemo.collectSlots / NoteDemo.compile.
 * Depends on: NoteDemoInternals.definition and the adapters used by the author.
 * Plain JavaScript, classic script, offline file:// safe. No DOM mutation except collectSlots reads.
 */
(function (global) {
  'use strict';

  var NoteDemoAuthor = global.NoteDemoAuthor = global.NoteDemoAuthor || {};
  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};

  function fail(message) {
    throw new Error('NoteDemoAuthor: ' + message);
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function isArray(value) {
    return Array.isArray(value);
  }

  function own(object, key) {
    return object != null && Object.prototype.hasOwnProperty.call(Object(object), key);
  }

  function text(value) {
    return value == null ? '' : String(value);
  }

  function clone(value, seen) {
    if (value == null || typeof value !== 'object') return value;
    var list = seen || [];
    if (list.indexOf(value) >= 0) return value;
    list.push(value);
    var output;
    var i;
    if (isArray(value)) {
      output = [];
      for (i = 0; i < value.length; i += 1) output.push(clone(value[i], list));
      return output;
    }
    output = {};
    var keys = Object.keys(value);
    for (i = 0; i < keys.length; i += 1) output[keys[i]] = clone(value[keys[i]], list);
    return output;
  }

  function resolveAdapters(explicit) {
    var merged = {};
    var builtin = Internals.adapters;
    var keys;
    var i;
    if (isObject(builtin)) {
      keys = Object.keys(builtin);
      for (i = 0; i < keys.length; i += 1) {
        if (builtin[keys[i]] && typeof builtin[keys[i]] === 'object') merged[keys[i]] = builtin[keys[i]];
      }
    }
    if (explicit != null) {
      if (!isObject(explicit)) fail('adapters 必须是名称到 Adapter 对象的映射。');
      keys = Object.keys(explicit);
      for (i = 0; i < keys.length; i += 1) {
        if (explicit[keys[i]] && typeof explicit[keys[i]] === 'object') merged[keys[i]] = explicit[keys[i]];
      }
    }
    return merged;
  }

  function normalizeView(bindingId, binding, rawView, adapters) {
    if (!isObject(binding)) fail('binding "' + bindingId + '" 必须是对象。');
    var adapterName = text(binding.adapter);
    var adapter = adapters[adapterName];
    if (!adapter) fail('binding "' + bindingId + '" 使用未注册 Adapter "' + adapterName + '"。');
    if (typeof adapter.normalizeView !== 'function') fail('Adapter "' + adapterName + '" 缺少 normalizeView。');
    var normalized;
    try {
      normalized = adapter.normalizeView(clone(rawView), binding.options);
    } catch (error) {
      fail('binding "' + bindingId + '" 的 normalizeView 失败：' + (error && error.message ? error.message : error));
    }
    if (!isObject(normalized) || !own(normalized, 'model') || !own(normalized, 'cues')) {
      fail('Adapter "' + adapterName + '" 的 normalizeView 必须返回 {model,cues}。');
    }
    return normalized;
  }

  function frameNormalized(views, bindings, adapters) {
    var output = {};
    Object.keys(bindings).forEach(function (bindingId) {
      if (!own(views, bindingId)) fail('Frame 缺少 binding "' + bindingId + '" 的视图。');
      output[bindingId] = normalizeView(bindingId, bindings[bindingId], views[bindingId], adapters);
    });
    return output;
  }

  function changedBindings(fromNorm, toNorm, bindingIds) {
    var changed = [];
    var definition = Internals.definition;
    if (!definition || typeof definition.compareModel !== 'function' || typeof definition.compareCues !== 'function') {
      fail('需要先加载 NoteDemoInternals.definition。');
    }
    for (var i = 0; i < bindingIds.length; i += 1) {
      var id = bindingIds[i];
      var modelChanged = definition.compareModel(fromNorm[id].model, toNorm[id].model);
      var cuesChanged = definition.compareCues(fromNorm[id].cues, toNorm[id].cues);
      if (modelChanged || cuesChanged) changed.push(id);
    }
    return changed;
  }

  function copyScene(scene) {
    if (!isObject(scene)) fail('scene 必须是对象。');
    var output = clone(scene);
    if (output.bindings !== undefined && !isArray(output.bindings)) fail('scene.bindings 必须是数组。');
    return output;
  }

  function hasBinding(list, id) {
    for (var i = 0; i < list.length; i += 1) {
      if (list[i] && list[i].binding === id) return list[i];
    }
    return null;
  }

  /* after 引用未显式列入的稳定 Binding 时，补一个只提交目标的 cut 参与者。
   * 若缺失的 Binding 本身发生变化，不能静默吞掉改动，直接报错。 */
  function closeAfterParticipants(scene, changed, bindings, adapters) {
    var list = isArray(scene.bindings) ? scene.bindings.slice() : [];
    var changedMap = {};
    changed.forEach(function (id) { changedMap[id] = true; });
    var guard = 0;
    var added = true;
    while (added && guard < 100) {
      added = false;
      guard += 1;
      for (var i = 0; i < list.length; i += 1) {
        var member = list[i];
        if (!isObject(member)) continue;
        var after = member.after == null ? [] : (isArray(member.after) ? member.after : [member.after]);
        for (var a = 0; a < after.length; a += 1) {
          var ref = after[a];
          if (typeof ref !== 'string' || !own(bindings, ref)) {
            fail('scene 参与者的 after 引用了未定义的 Binding "' + text(ref) + '"。');
          }
          if (hasBinding(list, ref)) continue;
          if (changedMap[ref]) {
            fail('Binding "' + ref + '" 在目标 Frame 有变化，不能只作为 after 闭包静默补入；请显式列入 scene。');
          }
          var adapterName = text(bindings[ref].adapter);
          var adapter = adapters[adapterName];
          if (!adapter || !isArray(adapter.sceneModes) || adapter.sceneModes.indexOf('cut') < 0) {
            fail('Binding "' + ref + '" 作为稳定 after 参与者需要 Adapter 支持 cut；当前 Adapter "' + adapterName + '" 不支持。');
          }
          list.push({ binding: ref, mode: 'cut' });
          added = true;
        }
      }
    }
    scene.bindings = list;
    return scene;
  }

  function makeTransition(step, changed, bindings, adapters) {
    var scene = null;
    if (step.scene !== undefined && step.scene !== null) {
      scene = copyScene(step.scene);
      if (!isArray(scene.bindings) || scene.bindings.length === 0) {
        fail('步骤 "' + text(step.id) + '" 的 scene.bindings 必须是非空数组。');
      }
      for (var c = 0; c < changed.length; c += 1) {
        if (!hasBinding(scene.bindings, changed[c])) {
          fail('步骤 "' + text(step.id) + '" 的 Binding "' + changed[c] + '" 视图发生变化，但未列入 scene；不能静默降级为 cut。');
        }
      }
      scene = closeAfterParticipants(scene, changed, bindings, adapters);
    } else if (changed.length) {
      fail('步骤 "' + text(step.id) + '" 改变了 Binding：' + changed.join('、') +
        '，但没有声明 scene；请显式给出场景参与者，不能静默降级为 cut。');
    }
    if (step.attention !== undefined && step.attention !== null) {
      if (!scene) fail('步骤 "' + text(step.id) + '" 声明了 attention，但没有 scene。');
      scene.attention = clone(step.attention);
    }
    return scene;
  }

  function collectSlots(root, required) {
    if (!root || root.nodeType !== 1 || typeof root.querySelectorAll !== 'function') {
      throw new TypeError('NoteDemo.collectSlots 需要一个 Element 根。');
    }
    var nodes = root.querySelectorAll('[data-demo-slot]');
    var found = {};
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      var name = text(node.getAttribute('data-demo-slot')).trim();
      if (!name) throw new Error('NoteDemo.collectSlots：第 ' + (i + 1) + ' 个 [data-demo-slot] 缺少名称。');
      if (own(found, name)) throw new Error('NoteDemo.collectSlots：插槽 "' + name + '" 重复。');
      found[name] = node;
    }
    if (required != null) {
      if (!isArray(required)) throw new TypeError('NoteDemo.collectSlots 的 required 必须是名称数组。');
      var missing = [];
      var seen = {};
      for (var r = 0; r < required.length; r += 1) {
        var slotName = text(required[r]).trim();
        if (!slotName || own(seen, slotName)) continue;
        seen[slotName] = true;
        if (!own(found, slotName)) missing.push(slotName);
      }
      if (missing.length) {
        throw new Error('NoteDemo.collectSlots：缺少插槽 ' + missing.map(function (name) {
          return '"' + name + '"';
        }).join('、') + '。');
      }
    }
    return found;
  }

  function compile(config) {
    if (!isObject(config)) fail('compile 需要一个配置对象：{ bindings, initial, steps, adapters? }。');
    var bindings = config.bindings;
    if (!isObject(bindings) || Object.keys(bindings).length === 0) fail('bindings 必须是非空对象。');
    var adapters = resolveAdapters(config.adapters);
    var bindingIds = Object.keys(bindings);
    var initial = config.initial;
    if (!isObject(initial)) fail('initial 必须是 {id, caption, views}。');
    if (typeof initial.id !== 'string' || !initial.id.trim()) fail('initial.id 必须是非空字符串。');
    if (!isObject(initial.views)) fail('initial.views 必须是 Binding ID 到视图的映射。');
    var current = {};
    bindingIds.forEach(function (id) {
      if (!own(initial.views, id)) fail('initial.views 缺少 binding "' + id + '" 的完整视图。');
      current[id] = clone(initial.views[id]);
    });
    var frames = [{
      id: initial.id,
      caption: initial.caption == null ? '' : String(initial.caption),
      views: clone(current),
      marks: clone(initial.marks == null ? [] : initial.marks)
    }];
    var normalized = [frameNormalized(current, bindings, adapters)];
    var steps = config.steps == null ? [] : config.steps;
    if (!isArray(steps)) fail('steps 必须是数组。');
    var seenIds = {};
    seenIds[initial.id] = true;
    var transitions = [];
    for (var s = 0; s < steps.length; s += 1) {
      var step = steps[s];
      if (!isObject(step)) fail('steps[' + s + '] 必须是对象。');
      if (typeof step.id !== 'string' || !step.id.trim()) fail('steps[' + s + '].id 必须是非空字符串。');
      if (own(seenIds, step.id)) fail('Frame ID "' + step.id + '" 重复。');
      seenIds[step.id] = true;
      var replace = step.replace == null ? {} : step.replace;
      if (!isObject(replace)) fail('步骤 "' + step.id + '" 的 replace 必须是 Binding ID 到完整视图的映射。');
      Object.keys(replace).forEach(function (bindingId) {
        if (!own(bindings, bindingId)) fail('步骤 "' + step.id + '" 替换了未定义的 Binding "' + bindingId + '"。');
        current[bindingId] = clone(replace[bindingId]);
      });
      frames.push({
        id: step.id,
        caption: step.caption == null ? '' : String(step.caption),
        views: clone(current),
        marks: clone(step.marks == null ? [] : step.marks)
      });
      var nextNorm = frameNormalized(current, bindings, adapters);
      var changed = changedBindings(normalized[normalized.length - 1], nextNorm, bindingIds);
      normalized.push(nextNorm);
      var scene = makeTransition(step, changed, bindings, adapters);
      if (scene) {
        transitions.push({
          from: frames[frames.length - 2].id,
          to: frames[frames.length - 1].id,
          scene: scene
        });
      }
    }
    return {
      bindings: bindings,
      frames: frames,
      transitions: transitions
    };
  }

  /* ---------------- 作者图形效果工具（公开包装，不暴露 Internals） ---------------- */

  function effectsApi() {
    var effects = Internals.effects;
    if (!effects || typeof effects.captureContent !== 'function') {
      fail('NoteDemo.effects 需要先加载 demo-runtime 的 effects（src/demo/effects.js）。');
    }
    return effects;
  }

  /* 这些函数是 Adapter/作者侧可用的窄工具：捕获来源内容/样式、生成局部 ghost、
   * 规划值交换与 cue 差分、读取真实矩形。返回的 spec 仍交给 scene 统一启动/取消/清理。 */
  NoteDemoAuthor.effects = {
    captureContent: function (input) { return effectsApi().captureContent(input); },
    createGhost: function (input) { return effectsApi().createGhost(input); },
    planValueSwap: function (input) { return effectsApi().planValueSwap(input); },
    captureStyles: function (targets, properties) { return effectsApi().captureStyles(targets, properties); },
    planCueChanges: function (input) { return effectsApi().planCueChanges(input); },
    rectOf: function (element) { return effectsApi().rectOf(element); },
    /* 复用 range.union 的窄组合：用于把“移动对象 + 它的轨迹/标签”等真实元素
     * 合成一个观察区域。只返回 Definition 数据，不创建第二套测量或动画。 */
    unionRange: function (refs) {
      if (!isArray(refs) || refs.length === 0) {
        fail('NoteDemo.effects.unionRange(refs) 需要非空的 {binding,query} 数组。');
      }
      var output = [];
      for (var i = 0; i < refs.length; i += 1) {
        var ref = refs[i];
        if (!isObject(ref) || typeof ref.binding !== 'string' || !ref.binding || ref.query == null) {
          fail('NoteDemo.effects.unionRange(refs)[' + i + '] 必须是 {binding,query}。');
        }
        output.push({ binding: ref.binding, query: clone(ref.query) });
      }
      return { kind: 'union', refs: output };
    }
  };

  NoteDemoAuthor.collectSlots = collectSlots;
  NoteDemoAuthor.compile = compile;
  NoteDemoAuthor.version = '1.0.0';
})(window);

/* ---- source: src/demo/index.js ---- */
/* NoteDemo — public demo orchestration layer, core entry.
 * Scope: window.NoteDemo.create + NoteDemoInternals.createSession.
 * Depends on: NoteCore (loading order: core first). Adapters and frame content are
 * checked only when a definition is prepared, so missing optional components do not
 * break this file at load time.
 * Plain JavaScript, classic script, offline file:// safe. No network, no eval.
 */
(function (global) {
  'use strict';

  var NoteDemo = global.NoteDemo = global.NoteDemo || {};
  var Internals = global.NoteDemoInternals = global.NoteDemoInternals || {};
  var VERSION = '1.0.0';

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function requireCoreModules() {
    var missing = [];
    if (!Internals.definition || typeof Internals.definition.prepare !== 'function') missing.push('definition');
    if (!Internals.bindings || typeof Internals.bindings.create !== 'function') missing.push('bindings');
    if (!Internals.runner || typeof Internals.runner.run !== 'function') missing.push('runner');
    if (!Internals.scene || typeof Internals.scene.run !== 'function') missing.push('scene');
    if (!Internals.controller || typeof Internals.controller.create !== 'function') missing.push('controller');
    if (missing.length) {
      throw new Error('NoteDemo 核心未完整加载：缺少 ' + missing.join('、') + ' 模块。请按 demo-runtime 的源码顺序加载。');
    }
  }

  function mergeAdapters(custom) {
    var merged = {};
    var builtin = isObject(Internals.adapters) ? Internals.adapters : {};
    Object.keys(builtin).forEach(function (name) {
      if (builtin[name] && typeof builtin[name] === 'object') merged[name] = builtin[name];
    });
    if (custom != null) {
      if (!isObject(custom)) throw new TypeError('NoteDemo.create 的 adapters 必须是名称到 Adapter 对象的映射。');
      Object.keys(custom).forEach(function (name) {
        var adapter = custom[name];
        if (!adapter || typeof adapter !== 'object') {
          throw new TypeError('NoteDemo.create 的 adapters["' + name + '"] 不是 Adapter 对象。');
        }
        merged[name] = adapter;
      });
    }
    return merged;
  }

  function destroyQuietly(bag) {
    if (!bag) return;
    try {
      bag.destroy();
    } catch (error) {
      if (global.console && typeof global.console.error === 'function') {
        global.console.error('NoteDemo: 创建失败后的清理出现异常。', error);
      }
    }
  }

  function createSession(config) {
    requireCoreModules();
    if (!isObject(config)) {
      throw new TypeError('NoteDemo.create 需要一个配置对象：{ definition, slots, adapters, initialFrameId }。');
    }
    if (!isObject(config.definition)) {
      throw new TypeError('NoteDemo.create 需要 definition 对象。');
    }
    var adapters = mergeAdapters(config.adapters);
    var plan = Internals.definition.prepare(config.definition, {
      adapters: adapters,
      initialFrameId: config.initialFrameId == null ? null : config.initialFrameId
    });
    if (plan.requiresPresentation && !isObject(config.presentation)) {
      throw new Error('NoteDemo 定义错误：scene 目标 Frame 含有标记或 scene.attention，需要 presentation port（NoteDemo.mount 会自动提供；自备宿主请在 create 时传入 presentation）。');
    }
    var bag = null;
    try {
      bag = Internals.bindings.create({
        plan: plan,
        slots: config.slots == null ? {} : config.slots,
        adapters: adapters
      });
      var initialFrame = plan.frameById[plan.initialFrameId];
      if (!initialFrame) {
        throw new Error('NoteDemo 定义错误：找不到初始 Frame "' + plan.initialFrameId + '"。');
      }
      bag.restoreFrame(initialFrame);
      var session = Internals.controller.create({
        plan: plan,
        bindings: bag,
        initialFrameId: plan.initialFrameId,
        presentation: config.presentation || null
      });
      return { session: session, plan: plan, bindings: bag };
    } catch (error) {
      destroyQuietly(bag);
      throw error;
    }
  }

  NoteDemo.create = function (config) {
    return createSession(config).session;
  };
  if (global.NoteDemoAuthor) {
    NoteDemo.collectSlots = global.NoteDemoAuthor.collectSlots;
    NoteDemo.compile = global.NoteDemoAuthor.compile;
    NoteDemo.author = global.NoteDemoAuthor;
    if (global.NoteDemoAuthor.effects) NoteDemo.effects = global.NoteDemoAuthor.effects;
  }
  NoteDemo.version = VERSION;

  Internals.createSession = createSession;
  Internals.version = VERSION;
})(window);
