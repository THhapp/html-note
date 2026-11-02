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

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var EPSILON = 0.01;

  function isElement(value) {
    return !!value && value.nodeType === 1;
  }

  function isConnected(element) {
    if (!element) return false;
    if (typeof element.isConnected === 'boolean') return element.isConnected;
    var doc = global.document;
    return !!(doc && doc.documentElement && doc.documentElement.contains(element));
  }

  function isSvgElement(element) {
    return !!(element && (element.ownerSVGElement || element.namespaceURI === SVG_NS));
  }

  function computedStyleOf(node) {
    if (!global.getComputedStyle) return null;
    try { return global.getComputedStyle(node); } catch (error) { return null; }
  }

  function finite(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function normalizedRect(raw) {
    if (!raw) return null;
    if (!finite(raw.left) || !finite(raw.top) || !finite(raw.width) || !finite(raw.height)) return null;
    return {
      left: raw.left, top: raw.top, width: raw.width, height: raw.height,
      right: finite(raw.right) ? raw.right : raw.left + raw.width,
      bottom: finite(raw.bottom) ? raw.bottom : raw.top + raw.height
    };
  }

  function classifyRect(rect) {
    if (!rect) return 'invalid';
    if (Math.abs(rect.width) <= EPSILON && Math.abs(rect.height) <= EPSILON) return 'point';
    if (Math.abs(rect.width) <= EPSILON || Math.abs(rect.height) <= EPSILON) return 'line';
    return 'area';
  }

  /* 布局可用性：断开、display:none、visibility:hidden/collapse 都不算可定位几何；
   * opacity:0 的待入场内容仍可能有真实矩形，不在这里判无效。 */
  function layoutIssue(element) {
    if (!isConnected(element)) return '节点已从文档断开';
    var node = element;
    while (node && node.nodeType === 1) {
      var style = computedStyleOf(node);
      if (style) {
        if (style.display === 'none') {
          return node === element ? 'display:none' : '祖先 display:none';
        }
      }
      node = node.parentElement;
    }
    return null;
  }

  /* 供 presentation 目标解析使用：区分节点存在/布局有效/零尺寸形态。
   * 返回 { ok, rect, kind:'area'|'line'|'point', issue, connected, svg }。 */
  function readTargetGeometry(element) {
    var output = { ok: false, rect: null, kind: 'invalid', issue: null, connected: false, svg: isSvgElement(element) };
    if (!isElement(element)) {
      output.issue = '目标节点不存在';
      return output;
    }
    output.connected = isConnected(element);
    if (!output.connected) {
      output.issue = '节点已从文档断开';
      return output;
    }
    var issue = layoutIssue(element);
    if (issue) {
      output.issue = '目标布局不可用（' + issue + '）';
      return output;
    }
    var rect = normalizedRect(effectsModule().rectOf(element));
    if (!rect) {
      output.issue = '目标没有可用的布局矩形';
      return output;
    }
    output.rect = rect;
    output.kind = classifyRect(rect);
    output.ok = true;
    return output;
  }

  function finiteNumber(value) {
    return finite(value) ? value : null;
  }

  function nonNegativeNumber(value) {
    return finite(value) && value >= 0 ? value : null;
  }

  /* local range：绝对 dx/dy/width/height 或相对 outset/inset（四边等量，CSS 像素）。
   * 返回 { ok, rect, kind, issue }；不修改输入。 */
  function applyLocalRange(baseRect, range) {
    var output = { ok: false, rect: null, kind: 'invalid', issue: null };
    if (!baseRect || !range || typeof range !== 'object') {
      output.issue = 'local range 缺少基准矩形或范围对象';
      return output;
    }
    var hasOutset = Object.prototype.hasOwnProperty.call(range, 'outset');
    var hasInset = Object.prototype.hasOwnProperty.call(range, 'inset');
    var hasAbsolute = ['dx', 'dy', 'width', 'height'].some(function (key) {
      return Object.prototype.hasOwnProperty.call(range, key);
    });
    if ((hasOutset || hasInset) && hasAbsolute) {
      output.issue = 'local range 的相对外扩/内缩与绝对 dx/dy/width/height 不能同时使用';
      return output;
    }
    if (hasOutset && hasInset) {
      output.issue = 'local range 的 outset 与 inset 只能声明一个';
      return output;
    }
    var rect;
    if (hasOutset || hasInset) {
      var key = hasOutset ? 'outset' : 'inset';
      var amount = nonNegativeNumber(range[key]);
      if (amount == null) {
        output.issue = 'local range 的 ' + key + ' 必须是大于等于 0 的有限数字（CSS 像素）';
        return output;
      }
      var delta = hasOutset ? amount : -amount;
      rect = {
        left: baseRect.left - delta,
        top: baseRect.top - delta,
        width: baseRect.width + delta * 2,
        height: baseRect.height + delta * 2
      };
      if (rect.width < 0) rect.width = 0;
      if (rect.height < 0) rect.height = 0;
    } else {
      var dx = finiteNumber(range.dx);
      var dy = finiteNumber(range.dy);
      var width = nonNegativeNumber(range.width);
      var height = nonNegativeNumber(range.height);
      if (dx == null || dy == null || width == null || height == null) {
        output.issue = 'local range 缺少 dx/dy/width/height（或使用 outset/inset 相对形式）';
        return output;
      }
      rect = { left: baseRect.left + dx, top: baseRect.top + dy, width: width, height: height };
    }
    rect.right = rect.left + rect.width;
    rect.bottom = rect.top + rect.height;
    output.rect = rect;
    output.kind = classifyRect(rect);
    if (output.kind === 'invalid') {
      output.issue = 'local range 归一化失败';
      return output;
    }
    if (output.kind === 'point') {
      output.issue = 'local range 退化为零尺寸（width/height 均为 0）';
      return output;
    }
    output.ok = true;
    return output;
  }

  /* 并集：调用方负责排除无效/可选缺失成员；空集返回 null。 */
  function unionRects(rects) {
    var list = isArray(rects) ? rects : [];
    var left = Infinity;
    var top = Infinity;
    var right = -Infinity;
    var bottom = -Infinity;
    for (var i = 0; i < list.length; i += 1) {
      var rect = list[i];
      if (!rect || !finite(rect.left) || !finite(rect.top) || !finite(rect.width) || !finite(rect.height)) continue;
      if (rect.left < left) left = rect.left;
      if (rect.top < top) top = rect.top;
      var itemRight = finite(rect.right) ? rect.right : rect.left + rect.width;
      var itemBottom = finite(rect.bottom) ? rect.bottom : rect.top + rect.height;
      if (itemRight > right) right = itemRight;
      if (itemBottom > bottom) bottom = itemBottom;
    }
    if (!isFinite(left) || !isFinite(top) || !isFinite(right) || !isFinite(bottom)) return null;
    return {
      left: left, top: top, right: right, bottom: bottom,
      width: Math.max(0, right - left), height: Math.max(0, bottom - top)
    };
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
    captureSourceRects: captureSourceRects,
    readTargetGeometry: readTargetGeometry,
    applyLocalRange: applyLocalRange,
    classifyRect: classifyRect,
    unionRects: unionRects
  };
})(window);
