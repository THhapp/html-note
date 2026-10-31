/*!
 * HTML 笔记 · 可复用变化机制 M01–M04 · 模块引导与内部共享工具
 * 范围：window.NoteVizInternals.mechanisms；本文件不定义任何 NoteViz.* 公开入口。
 * 依赖：NoteCore（DOM、motion、onResize、validateHost）。
 * 加载顺序：本文件必须最先加载，随后依次加载
 *   mechanisms-sequence-edit.js（M01）、mechanisms-transfer.js（M02）、
 *   mechanisms-split-merge.js（M03）、mechanisms-replace-reveal.js（M04）。
 * 四个组件文件只使用这里的私有工具，不互相依赖；公开 API 由各组件文件注册。
 * 约定：所有内容以 textContent 写入；动画结束时取消填充效果；减少动效时直接呈现终态。
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var hasOwn = Object.prototype.hasOwnProperty;

  /* ---------------- 基础值与依赖 ---------------- */

  function own(object, key) {
    return object != null && hasOwn.call(Object(object), key);
  }

  function text(value) {
    return value == null ? '' : String(value);
  }

  function displayText(value) {
    var output = text(value);
    return output === '' ? '（空内容）' : output;
  }

  function requireCore() {
    var core = global.NoteCore;
    if (!core || !core.motion || typeof core.motion.play !== 'function' ||
        typeof core.el !== 'function' || typeof core.validateHost !== 'function') {
      throw new Error('NoteViz 变化机制需要先加载 NoteCore（core.js、motion.js）。');
    }
    return core;
  }

  function requireHost(core, host) {
    core.validateHost(host);
    return host;
  }

  /* ---------------- 内容副本与 id 规范化 ---------------- */

  function copyObject(value) {
    if (!value || typeof value !== 'object') return value;
    var result = {};
    Object.keys(value).forEach(function (key) { result[key] = value[key]; });
    return result;
  }

  function copyList(list) {
    return list.map(function (item) {
      var result = {};
      Object.keys(item).forEach(function (key) { result[key] = item[key]; });
      return result;
    });
  }

  function uniqueId(candidate, seen, prefix, position) {
    var id = candidate == null || String(candidate) === '' ? prefix + '-' + (position + 1) : String(candidate);
    if (!own(seen, id)) {
      seen[id] = true;
      return id;
    }
    var base = id;
    var suffix = 2;
    while (own(seen, base + '~' + suffix)) suffix += 1;
    id = base + '~' + suffix;
    seen[id] = true;
    return id;
  }

  function normalizeObjects(raw, prefix) {
    var source = Array.isArray(raw) ? raw : [];
    var seen = {};
    var items = [];
    source.forEach(function (entry, index) {
      var item = entry;
      var idValue = null;
      var labelValue = '';
      if (item && typeof item === 'object') {
        idValue = own(item, 'id') ? item.id : null;
        if (own(item, 'label')) labelValue = item.label;
        else if (own(item, 'name')) labelValue = item.name;
        else if (own(item, 'value')) labelValue = item.value;
      } else {
        labelValue = item;
      }
      items.push({
        id: uniqueId(idValue, seen, prefix, index),
        label: text(labelValue)
      });
    });
    return items;
  }

  function normalizeIdList(value) {
    var source;
    if (Array.isArray(value)) source = value;
    else if (value == null || value === '') source = [];
    else source = [value];
    var seen = {};
    var result = [];
    source.forEach(function (entry) {
      if (entry == null) return;
      var id = String(entry);
      if (!own(seen, id)) {
        seen[id] = true;
        result.push(id);
      }
    });
    return result;
  }

  function listIds(items) {
    var seen = {};
    items.forEach(function (item) { seen[item.id] = true; });
    return seen;
  }

  function mergeChanged(base, extra, items) {
    var allowed = listIds(items);
    var seen = {};
    var result = [];
    base.concat(extra || []).forEach(function (id) {
      var key = String(id);
      if (allowed[key] && !own(seen, key)) {
        seen[key] = true;
        result.push(key);
      }
    });
    return result;
  }

  function movedIds(beforeItems, afterItems) {
    var beforeIndex = {};
    var afterIndex = {};
    var changed = [];
    beforeItems.forEach(function (item, index) { beforeIndex[item.id] = index; });
    afterItems.forEach(function (item, index) { afterIndex[item.id] = index; });
    afterItems.forEach(function (item, index) {
      if (beforeIndex[item.id] !== index) changed.push(item.id);
    });
    Object.keys(beforeIndex).forEach(function (id) {
      if (!own(afterIndex, id)) changed.push(id);
    });
    return changed;
  }

  function sameItemOrder(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i += 1) {
      if (a[i].id !== b[i].id || a[i].label !== b[i].label) return false;
    }
    return true;
  }

  /* ---------------- 动效参数 ---------------- */

  function explainMs(core) {
    var value = Number(core.motion.explainDuration ? core.motion.explainDuration() : 460);
    if (!isFinite(value) || value <= 0) value = 460;
    return Math.max(260, Math.min(620, value));
  }

  function explainEase(root) {
    try {
      var value = global.getComputedStyle(root).getPropertyValue('--hnv-motion-ease-explain').trim();
      if (value) return value;
    } catch (error) {}
    return 'cubic-bezier(0.2, 0.8, 0.2, 1)';
  }

  function shouldAnimate(core, preferred, methodOption) {
    if (core.motion.reduced()) return false;
    if (methodOption === false) return false;
    if (methodOption === true) return true;
    return preferred !== false;
  }

  /* ---------------- 根状态、忙碌与节点 ---------------- */

  function setBusy(root, busy) {
    if (busy) root.setAttribute('aria-busy', 'true');
    else root.removeAttribute('aria-busy');
  }

  /* data-anim 与 aria-busy 始终成对更新：idle 表示停稳，running 表示动作中，
     waiting 表示重看前短暂呈现变化前状态。 */
  function setAnimState(root, state) {
    root.setAttribute('data-anim', state);
    setBusy(root, state !== 'idle');
  }

  function removeNode(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  function svgElement(tag, className) {
    var node = document.createElementNS(SVG_NS, tag);
    if (className) node.setAttribute('class', className);
    return node;
  }

  /* ---------------- 定时器与动画句柄 ---------------- */

  /* isAlive 用于销毁后丢弃迟到回调；clear() 可重复调用。 */
  function createTimers(isAlive) {
    var timers = [];
    function schedule(fn, delay) {
      if (typeof fn !== 'function') return 0;
      var timer = global.setTimeout(function () {
        var index = timers.indexOf(timer);
        if (index >= 0) timers.splice(index, 1);
        if (typeof isAlive !== 'function' || isAlive()) fn();
      }, Math.max(0, delay));
      timers.push(timer);
      return timer;
    }
    function clear() {
      for (var i = 0; i < timers.length; i += 1) global.clearTimeout(timers[i]);
      timers.length = 0;
    }
    return { schedule: schedule, clear: clear };
  }

  /* 统一登记 core.motion.play 返回的控制器：取消时逐个 cancel，避免停稳/销毁后残留填充动画。 */
  function createMotionBag(core) {
    var handles = [];
    function play(node, keyframes, options) {
      var handle = core.motion.play(node, keyframes, options);
      handles.push(handle);
      return handle;
    }
    function list() {
      return handles.slice();
    }
    function count() {
      return handles.length;
    }
    function cancelAll() {
      if (!handles.length) return;
      var pending = handles.slice();
      handles.length = 0;
      for (var i = 0; i < pending.length; i += 1) {
        try { pending[i].cancel(); } catch (error) {}
      }
    }
    return { play: play, list: list, count: count, cancelAll: cancelAll };
  }

  var note = global.NoteVizInternals = global.NoteVizInternals || {};
  note.mechanisms = {
    version: VERSION,
    own: own,
    text: text,
    displayText: displayText,
    requireCore: requireCore,
    requireHost: requireHost,
    copyObject: copyObject,
    copyList: copyList,
    normalizeObjects: normalizeObjects,
    normalizeIdList: normalizeIdList,
    listIds: listIds,
    mergeChanged: mergeChanged,
    movedIds: movedIds,
    sameItemOrder: sameItemOrder,
    explainMs: explainMs,
    explainEase: explainEase,
    shouldAnimate: shouldAnimate,
    setBusy: setBusy,
    setAnimState: setAnimState,
    removeNode: removeNode,
    svgElement: svgElement,
    createTimers: createTimers,
    createMotionBag: createMotionBag
  };
})(window);
