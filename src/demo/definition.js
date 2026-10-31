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
