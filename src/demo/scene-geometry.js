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
