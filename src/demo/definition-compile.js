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
      var localAllowed = { kind: true, dx: true, dy: true, width: true, height: true, outset: true, inset: true };
      Object.keys(input).forEach(function (key) {
        if (!own(localAllowed, key)) issues.push(pathKey(path, key), 'local range 只允许 kind/dx/dy/width/height/outset/inset');
      });
      var hasOutset = own(input, 'outset');
      var hasInset = own(input, 'inset');
      var hasAbsolute = own(input, 'dx') || own(input, 'dy') || own(input, 'width') || own(input, 'height');
      if (hasOutset || hasInset) {
        /* 相对形式：以主目标当前视口矩形四边等量外扩（outset）或内缩（inset），单位 CSS 像素；
         * 与绝对 dx/dy/width/height 互斥，避免两种语义叠加。 */
        if (hasAbsolute) {
          issues.push(path, 'local range 的相对外扩/内缩（outset/inset）与绝对 dx/dy/width/height 互斥');
          return null;
        }
        if (hasOutset && hasInset) {
          issues.push(pathKey(path, 'inset'), 'outset 与 inset 只能声明一个');
          return null;
        }
        var relativeKey = hasOutset ? 'outset' : 'inset';
        var relativeValue = input[relativeKey];
        if (typeof relativeValue !== 'number' || !isFinite(relativeValue) || relativeValue < 0) {
          issues.push(pathKey(path, relativeKey), '必须是大于等于 0 的有限数字（CSS 像素）');
          return null;
        }
        var relative = { kind: 'local' };
        relative[relativeKey] = relativeValue;
        return deepFreeze(relative);
      }
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
          if (key !== 'binding' && key !== 'query' && key !== 'optional') {
            issues.push(pathKey(refPath, key), 'union refs 只允许 binding/query/optional（深度 ≤1，不再嵌套 range）');
          }
        });
        if (isNonEmptyString(ref.binding) && ref.query != null && ref.optional !== undefined && typeof ref.optional !== 'boolean') {
          refsValid = false;
          continue;
        }
        if (isNonEmptyString(ref.binding) && ref.query != null) {
          var unionRef = { binding: ref.binding, query: cloneData(ref.query) };
          /* 只有显式 optional:true 才保留字段；false 与省略等价，保持旧快照形状。 */
          if (ref.optional === true) unionRef.optional = true;
          refs.push(deepFreeze(unionRef));
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
