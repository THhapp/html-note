/*! note-library module: viz-mechanisms
 * dependencies: core
 * type: JavaScript
 * generated-by: scripts/build.mjs; do-not-edit.
 */

/* ---- source: src/viz/mechanisms.js ---- */
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

/* ---- source: src/viz/mechanisms-sequence-edit.js ---- */
/*!
 * HTML 笔记 · 可复用变化机制 M01 · NoteViz.SequenceEdit
 * 范围：序列对象的删除、移动、交换、撤销、重置与重看；公开到 window.NoteViz.SequenceEdit。
 * 依赖：NoteCore（core.js、motion.js）与 src/viz/mechanisms.js（内部共享工具，须先加载）。
 * 插入不在此文件实现；课程播放器式插入请复用 R10 SeqInsert。
 * 内容一律按纯文本写入；动画停稳或取消后清除 ghost 与填充效果。
 */
(function (global) {
  'use strict';

  var NoteViz = global.NoteViz = global.NoteViz || {};
  var VERSION = '1.0.0';

  function requireShared() {
    var internals = global.NoteVizInternals && global.NoteVizInternals.mechanisms;
    if (!internals) {
      throw new Error('NoteViz.SequenceEdit 需要先加载 src/viz/mechanisms.js（内部共享工具）。');
    }
    return internals;
  }

  NoteViz.SequenceEdit = {
    version: VERSION,
    mount: function (host, options) {
      var shared = requireShared();
      var core = shared.requireCore();
      shared.requireHost(core, host);
      var own = shared.own;
      var text = shared.text;
      var displayText = shared.displayText;
      var copyObject = shared.copyObject;
      var copyList = shared.copyList;
      var normalizeObjects = shared.normalizeObjects;
      var normalizeIdList = shared.normalizeIdList;
      var listIds = shared.listIds;
      var mergeChanged = shared.mergeChanged;
      var movedIds = shared.movedIds;
      var sameItemOrder = shared.sameItemOrder;
      var shouldAnimate = shared.shouldAnimate;
      var setAnimState = shared.setAnimState;
      var removeNode = shared.removeNode;

      var config = options && typeof options === 'object' ? options : {};
      var destroyed = false;
      var root = core.el('section', 'nviz-sequence-edit');
      root.setAttribute('data-anim', 'idle');
      var stage = core.el('div', 'nviz-sequence-edit__stage');
      var list = core.el('ol', 'nviz-sequence-edit__list');
      var ghostLayer = core.el('div', 'nviz-sequence-edit__ghost-layer');
      ghostLayer.setAttribute('aria-hidden', 'true');
      var statusEl = core.el('p', 'nviz-sequence-edit__status');
      statusEl.setAttribute('role', 'status');
      statusEl.setAttribute('aria-live', 'polite');
      var label = text(config.label) || '序列编辑';
      root.setAttribute('aria-label', label);
      list.setAttribute('aria-label', label);
      stage.appendChild(list);
      stage.appendChild(ghostLayer);
      root.appendChild(stage);
      root.appendChild(statusEl);

      var baseItems = normalizeObjects(config.items, 'seq');
      var items = copyList(baseItems);
      var focusIds = normalizeIdList(config.focus);
      var baseChanged = normalizeIdList(config.changed);
      var activeChanged = mergeChanged(baseChanged, [], items);
      var animateDefault = config.animate !== false;
      var onChange = typeof config.onChange === 'function' ? config.onChange : null;
      var history = [];
      var lastOp = null;
      var replayFrom = null;
      var nodes = {};
      var motion = shared.createMotionBag(core);
      var timers = shared.createTimers(function () { return !destroyed; });
      var running = false;
      var motionGeneration = 0;
      var activeAction = null;
      var stopResize = null;
      var motionDuration = shared.explainMs(core);
      var motionEase = '';
      var holdMs = Math.max(180, Math.min(300, Math.round(motionDuration * 0.45)));

      function makeNode(item) {
        var li = core.el('li', 'nviz-sequence-edit__item');
        var indexEl = core.el('span', 'nviz-sequence-edit__index');
        indexEl.setAttribute('aria-hidden', 'true');
        var body = core.el('span', 'nviz-sequence-edit__body');
        var labelEl = core.el('span', 'nviz-sequence-edit__label');
        var marker = core.el('span', 'nviz-sequence-edit__marker');
        body.appendChild(labelEl);
        body.appendChild(marker);
        li.appendChild(indexEl);
        li.appendChild(body);
        li.setAttribute('data-id', item.id);
        return { li: li, index: indexEl, label: labelEl, marker: marker };
      }

      function ensureNode(item) {
        var node = nodes[item.id];
        if (!node) {
          node = makeNode(item);
          nodes[item.id] = node;
        }
        return node;
      }

      function syncDom(itemsList, changedList) {
        var keep = {};
        itemsList.forEach(function (item, index) {
          var node = ensureNode(item);
          keep[item.id] = true;
          node.label.textContent = displayText(item.label);
          node.index.textContent = String(index + 1);
          node.li.setAttribute('aria-posinset', String(index + 1));
          node.li.setAttribute('aria-setsize', String(itemsList.length));
          var focused = focusIds.indexOf(item.id) >= 0;
          var changed = changedList.indexOf(item.id) >= 0;
          node.li.setAttribute('data-focus', focused ? 'true' : 'false');
          node.li.setAttribute('data-changed', changed ? 'true' : 'false');
          if (focused) node.li.setAttribute('aria-current', 'true');
          else node.li.removeAttribute('aria-current');
          var mark = focused && changed ? '变化 · 关注' : changed ? '变化' : focused ? '关注' : '';
          if (mark) {
            node.marker.textContent = mark;
            node.marker.hidden = false;
          } else {
            node.marker.textContent = '';
            node.marker.hidden = true;
          }
          node.li.setAttribute('aria-label',
            '第 ' + (index + 1) + ' 项，' + displayText(item.label) +
            (focused ? '，当前关注' : '') + (changed ? '，本步变化' : ''));
          list.appendChild(node.li);
        });
        Object.keys(nodes).forEach(function (id) {
          if (own(keep, id)) return;
          var node = nodes[id];
          try { core.motion.stop(node.li); } catch (error) {}
          removeNode(node.li);
          delete nodes[id];
        });
      }

      /* 只记录动作前各项的真实视口矩形；ghost 的定位原点由 ghostLayer 决定。 */
      function captureRectInfo() {
        var rects = {};
        Object.keys(nodes).forEach(function (id) {
          rects[id] = nodes[id].li.getBoundingClientRect();
        });
        return { items: rects };
      }

      function stopAnimations() {
        motion.cancelAll();
        Object.keys(nodes).forEach(function (id) {
          try { core.motion.stop(nodes[id].li); } catch (error) {}
        });
      }

      function clearGhosts() {
        core.clear(ghostLayer);
      }

      function settleActionState(state, status) {
        if (!state || state.settled) return;
        state.settled = true;
        state.resolve({ status: status });
      }

      function finishActiveAction(status) {
        var record = activeAction;
        if (!record) return;
        activeAction = null;
        settleActionState(record.state, status);
      }

      function cancelActionState(state) {
        if (!state || state.settled) return;
        var isActive = activeAction && activeAction.state === state;
        settleActionState(state, 'cancelled');
        if (isActive) {
          activeAction = null;
          cancelMotion();
        }
      }

      function createActionState() {
        var state = { settled: false, resolve: null };
        state.finished = new Promise(function (resolve) { state.resolve = resolve; });
        state.handle = {
          finished: state.finished,
          cancel: function () { cancelActionState(state); }
        };
        return state;
      }

      function cancelMotion() {
        motionGeneration += 1;
        finishActiveAction('cancelled');
        timers.clear();
        stopAnimations();
        clearGhosts();
        running = false;
        setAnimState(root, 'idle');
      }

      function settleCurrentVisual() {
        cancelMotion();
        syncDom(items, activeChanged);
      }

      function updateStatus(message) {
        statusEl.textContent = message;
      }

      function snapshot() {
        var previous = replayFrom ? replayFrom.items : items;
        return {
          items: copyList(items),
          previousItems: copyList(previous),
          lastOp: lastOp ? copyObject(lastOp) : null,
          focus: focusIds.slice(),
          changed: activeChanged.slice(),
          canUndo: history.length > 0,
          total: items.length
        };
      }

      function emitChange(detail) {
        if (destroyed || !onChange) return;
        onChange(snapshot(), detail || {});
      }

      function createGhostRecord(id) {
        var node = nodes[id];
        if (!node) return null;
        var clone = node.li.cloneNode(true);
        clone.classList.add('nviz-sequence-edit__item--ghost');
        clone.removeAttribute('aria-current');
        clone.setAttribute('aria-hidden', 'true');
        clone.removeAttribute('role');
        return clone;
      }

      function animateVisual(fromInfo, leaving, enterIds, onDone) {
        var fromRects = fromInfo.items;
        var endAt = 0;
        items.forEach(function (item) {
          var node = nodes[item.id];
          if (!node) return;
          var fromRect = fromRects[item.id];
          if (fromRect) {
            var toRect = node.li.getBoundingClientRect();
            var dx = fromRect.left - toRect.left;
            var dy = fromRect.top - toRect.top;
            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
            motion.play(node.li, [
              { transform: 'translate3d(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px,0)' },
              { transform: 'translate3d(0,0,0)' }
            ], {
              duration: motionDuration,
              easing: motionEase,
              id: 'nviz-seq-edit-move'
            });
            endAt = Math.max(endAt, motionDuration);
          } else if (own(enterIds, item.id)) {
            motion.play(node.li, [
              { opacity: '0', transform: 'translate3d(0,8px,0) scale(.95)' },
              { opacity: '1', transform: 'translate3d(0,0,0) scale(1)' }
            ], {
              duration: Math.max(240, Math.round(motionDuration * .72)),
              easing: motionEase,
              id: 'nviz-seq-edit-enter'
            });
            endAt = Math.max(endAt, Math.max(240, Math.round(motionDuration * .72)));
          }
        });

        if (leaving && leaving.length) {
          var ghostBox = ghostLayer.getBoundingClientRect();
          leaving.forEach(function (record) {
            if (!record || !record.clone || !record.rect) return;
            record.clone.style.left = (record.rect.left - ghostBox.left) + 'px';
            record.clone.style.top = (record.rect.top - ghostBox.top) + 'px';
            record.clone.style.width = record.rect.width + 'px';
            record.clone.style.height = record.rect.height + 'px';
            ghostLayer.appendChild(record.clone);
            motion.play(record.clone, [
              { opacity: '1', transform: 'translate3d(0,0,0) scale(1)' },
              { opacity: '0', transform: 'translate3d(0,-7px,0) scale(.96)' }
            ], {
              duration: Math.max(220, Math.round(motionDuration * .62)),
              easing: motionEase,
              id: 'nviz-seq-edit-leave'
            });
            endAt = Math.max(endAt, Math.max(220, Math.round(motionDuration * .62)));
          });
        }

        if (!endAt) {
          cancelMotion();
          if (onDone) onDone();
          return;
        }
        running = true;
        setAnimState(root, 'running');
        var generation = (motionGeneration += 1);
        var completionDone = false;
        var pendingAnimations = motion.count();

        /* 完成边界跟随真实动画结束：所有已登记位移/离场动画结算后立刻收尾并通知句柄，
         * 不再以“估计时长 + 固定余量”作为常规完成路径（固定余量只作兜底）。 */
        function finishVisual() {
          if (completionDone) return;
          completionDone = true;
          if (generation !== motionGeneration) return;
          running = false;
          stopAnimations();
          clearGhosts();
          setAnimState(root, 'idle');
          if (onDone) onDone();
        }

        function oneSettled() {
          if (completionDone) return;
          pendingAnimations -= 1;
          if (pendingAnimations > 0) return;
          finishVisual();
        }

        motion.list().forEach(function (handle) {
          if (handle && handle.finished && typeof handle.finished.then === 'function') {
            handle.finished.then(oneSettled, oneSettled);
          } else {
            oneSettled();
          }
        });
        timers.schedule(function () {
          if (!completionDone) finishVisual();
        }, endAt + 120);
      }

      function runChange(nextItems, nextChanged, meta) {
        if (destroyed) return view;
        /* 先记录当前可见矩形（含进行中的位移动画），再取消旧动画落定；
         * 这样动画中再次操作可从当前视觉位置继续移动，而不是先跳回终态。 */
        var fromInfo = captureRectInfo();
        settleCurrentVisual();
        var before = { items: copyList(items), changed: activeChanged.slice() };
        var nextMap = listIds(nextItems);
        var leaving = [];
        var enterIds = {};
        Object.keys(nodes).forEach(function (id) {
          if (own(nextMap, id)) return;
          var record = createGhostRecord(id);
          if (record && fromInfo.items[id]) leaving.push({ clone: record, rect: fromInfo.items[id] });
        });
        Object.keys(nextMap).forEach(function (id) {
          if (!own(nodes, id)) enterIds[id] = true;
        });

        if (meta.pushHistory !== false) history.push(before);
        items = copyList(nextItems);
        activeChanged = mergeChanged(baseChanged, nextChanged, items);
        lastOp = meta.op ? copyObject(meta.op) : lastOp;
        replayFrom = before;
        syncDom(items, activeChanged);
        updateStatus(meta.status);

        var animate = shouldAnimate(core, animateDefault, meta.animateOpt);
        if (animate) {
          animateVisual(fromInfo, leaving, enterIds, meta.onSettled);
        } else {
          cancelMotion();
        }
        if (meta.emit !== false) emitChange(meta.event || (lastOp ? copyObject(lastOp) : {}));
        return view;
      }

      function runPlanned(plan, opts) {
        var animate = shouldAnimate(core, animateDefault, opts && opts.animate);
        runChange(plan.nextItems, plan.changed, {
          op: plan.op,
          status: plan.status,
          event: plan.event,
          animateOpt: animate ? true : false
        });
      }

      function operationChanged(nextItems) {
        return mergeChanged([], movedIds(items, nextItems), nextItems);
      }

      /* 动作计算收敛：runAction 与公开的 remove/move/swap 共用同一份目标序列、
       * 变化 id、状态文字与事件形状；无效动作返回 null，原地移动返回 {noop:true}。 */
      function planAction(type, params) {
        var source = params && typeof params === 'object' ? params : {};
        var key;
        var index;
        var i;
        if (type === 'remove') {
          key = source.id == null ? '' : String(source.id);
          index = -1;
          for (i = 0; i < items.length; i += 1) {
            if (items[i].id === key) { index = i; break; }
          }
          if (index < 0) return null;
          var removed = items[index];
          var withoutRemoved = items.filter(function (item) { return item.id !== key; });
          var removedStatus = '已删除「' + displayText(removed.label) + '」 · 剩余 ' + withoutRemoved.length + ' 项已就位';
          return {
            nextItems: withoutRemoved,
            changed: operationChanged(withoutRemoved),
            op: { type: 'remove', id: key, label: removed.label, fromIndex: index, status: removedStatus },
            status: removedStatus,
            event: { type: 'remove', id: key, index: index }
          };
        }
        if (type === 'swap') {
          var a = source.a == null ? '' : String(source.a);
          var b = source.b == null ? '' : String(source.b);
          if (a === b) return null;
          var indexA = -1;
          var indexB = -1;
          for (i = 0; i < items.length; i += 1) {
            if (items[i].id === a) indexA = i;
            if (items[i].id === b) indexB = i;
          }
          if (indexA < 0 || indexB < 0) return null;
          var swapped = copyList(items);
          var temporary = swapped[indexA];
          swapped[indexA] = swapped[indexB];
          swapped[indexB] = temporary;
          var swapStatus = '已交换「' + displayText(items[indexA].label) + '」与「' + displayText(items[indexB].label) + '」 · 共 ' + swapped.length + ' 项';
          return {
            nextItems: swapped,
            changed: operationChanged(swapped),
            op: { type: 'swap', ids: [a, b], indices: [indexA, indexB], labels: [items[indexA].label, items[indexB].label], status: swapStatus },
            status: swapStatus,
            event: { type: 'swap', ids: [a, b] }
          };
        }
        if (type === 'move') {
          key = source.id == null ? '' : String(source.id);
          var fromIndex = -1;
          for (i = 0; i < items.length; i += 1) {
            if (items[i].id === key) { fromIndex = i; break; }
          }
          if (fromIndex < 0) return null;
          var targetIndex = Math.round(Number(source.index));
          if (!isFinite(targetIndex)) targetIndex = fromIndex;
          targetIndex = Math.max(0, Math.min(items.length - 1, targetIndex));
          if (targetIndex === fromIndex) {
            return { noop: true, message: '「' + displayText(items[fromIndex].label) + '」已在该位置' };
          }
          var moved = items[fromIndex];
          var movedItems = copyList(items);
          movedItems.splice(fromIndex, 1);
          movedItems.splice(targetIndex, 0, moved);
          var moveStatus = '「' + displayText(moved.label) + '」移到第 ' + (targetIndex + 1) + ' 位 · 共 ' + movedItems.length + ' 项';
          return {
            nextItems: movedItems,
            changed: operationChanged(movedItems),
            op: { type: 'move', id: key, label: moved.label, fromIndex: fromIndex, toIndex: targetIndex, status: moveStatus },
            status: moveStatus,
            event: { type: 'move', id: key, fromIndex: fromIndex, toIndex: targetIndex }
          };
        }
        return null;
      }

      var view = {
        el: root,
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return view;
          cancelMotion();
          if (own(patch, 'label')) {
            label = text(patch.label) || '序列编辑';
            root.setAttribute('aria-label', label);
            list.setAttribute('aria-label', label);
          }
          if (own(patch, 'focus')) focusIds = normalizeIdList(patch.focus);
          if (own(patch, 'changed')) baseChanged = normalizeIdList(patch.changed);
          if (own(patch, 'animate')) animateDefault = patch.animate !== false;
          if (own(patch, 'onChange')) onChange = typeof patch.onChange === 'function' ? patch.onChange : null;
          if (own(patch, 'items')) {
            baseItems = normalizeObjects(patch.items, 'seq');
            items = copyList(baseItems);
            history = [];
            lastOp = null;
            replayFrom = null;
            activeChanged = mergeChanged(baseChanged, [], items);
            syncDom(items, activeChanged);
            updateStatus('共 ' + items.length + ' 项 · 已更新');
          } else {
            activeChanged = mergeChanged(baseChanged, activeChanged, items);
            syncDom(items, activeChanged);
            statusEl.textContent = lastOp && lastOp.status ? lastOp.status : ('共 ' + items.length + ' 项');
          }
          return view;
        },
        restoreView: function (input) {
          if (destroyed) return;
          var viewData = input && typeof input === 'object' ? input : {};
          var model = viewData.model && typeof viewData.model === 'object' ? viewData.model : {};
          var cues = viewData.cues && typeof viewData.cues === 'object' ? viewData.cues : {};
          var rawItems = Array.isArray(model.items) ? model.items : [];
          var nextItems = rawItems.map(function (item) {
            if (item && typeof item === 'object') {
              return {
                id: item.id == null ? '' : String(item.id),
                label: item.label == null ? '' : text(item.label)
              };
            }
            return { id: '', label: text(item) };
          });
          cancelMotion();
          items = nextItems;
          focusIds = normalizeIdList(cues.focus);
          baseChanged = [];
          activeChanged = mergeChanged([], normalizeIdList(cues.changed), items);
          history = [];
          lastOp = null;
          replayFrom = null;
          syncDom(items, activeChanged);
          updateStatus(items.length ? ('共 ' + items.length + ' 项') : '共 0 项 · 无可操作对象');
        },
        applyViewCues: function (cues) {
          if (destroyed) return;
          var input = cues && typeof cues === 'object' ? cues : {};
          focusIds = normalizeIdList(input.focus);
          activeChanged = mergeChanged([], normalizeIdList(input.changed), items);
          syncDom(items, activeChanged);
        },
        runAction: function (action, opts) {
          var state = createActionState();
          if (destroyed) {
            settleActionState(state, 'cancelled');
            return state.handle;
          }
          var optsObject = opts && typeof opts === 'object' ? opts : {};
          var animateOpt = own(optsObject, 'animate') ? optsObject.animate !== false : undefined;
          var type = action && typeof action === 'object' ? text(action.type) : '';
          var params = action && typeof action === 'object' && action.params && typeof action.params === 'object' ? action.params : {};
          var meta = {
            emit: false,
            pushHistory: false,
            animateOpt: animateOpt,
            onSettled: function () {
              settleActionState(state, 'completed');
              if (activeAction && activeAction.state === state) activeAction = null;
            }
          };
          var plan;
          if (type === 'remove') {
            plan = planAction('remove', { id: params.id == null ? '' : String(params.id) });
          } else if (type === 'swap') {
            plan = planAction('swap', { a: params.a, b: params.b });
          } else {
            settleActionState(state, 'cancelled');
            return state.handle;
          }
          if (!plan || plan.noop) {
            settleActionState(state, 'completed');
            return state.handle;
          }
          meta.op = plan.op;
          meta.status = plan.status;
          meta.event = plan.event;
          runChange(plan.nextItems, plan.changed, meta);
          if (!state.settled) {
            if (running) activeAction = { state: state };
            else settleActionState(state, 'completed');
          }
          return state.handle;
        },
        remove: function (id, opts) {
          if (destroyed) return view;
          var plan = planAction('remove', { id: String(id) });
          if (!plan) return view;
          runPlanned(plan, opts);
          return view;
        },
        move: function (id, index, opts) {
          if (destroyed) return view;
          var plan = planAction('move', { id: String(id), index: index });
          if (!plan) return view;
          if (plan.noop) {
            updateStatus(plan.message);
            return view;
          }
          runPlanned(plan, opts);
          return view;
        },
        swap: function (idA, idB, opts) {
          if (destroyed) return view;
          var plan = planAction('swap', { a: String(idA), b: String(idB) });
          if (!plan || plan.noop) return view;
          runPlanned(plan, opts);
          return view;
        },
        undo: function (opts) {
          if (destroyed || !history.length) return view;
          var before = { items: copyList(items), changed: activeChanged.slice() };
          var target = history.pop();
          var nextItems = copyList(target.items);
          var animate = shouldAnimate(core, animateDefault, opts && opts.animate);
          var removedIds = movedIds(items, nextItems);
          var op = {
            type: 'undo',
            restored: removedIds.filter(function (id) {
              return !own(listIds(items), id);
            }),
            status: ''
          };
          op.status = '已回退到上一快照 · 共 ' + nextItems.length + ' 项';
          runChange(nextItems, target.changed || [], {
            op: op,
            status: op.status,
            pushHistory: false,
            event: { type: 'undo' },
            animateOpt: animate ? true : false
          });
          replayFrom = before;
          return view;
        },
        reset: function (opts) {
          if (destroyed) return view;
          var baselineChanged = mergeChanged(baseChanged, [], baseItems);
          if (sameItemOrder(items, baseItems) && activeChanged.slice().sort().join('|') === baselineChanged.slice().sort().join('|')) {
            updateStatus('已重置 · 共 ' + items.length + ' 项');
            return view;
          }
          var animate = shouldAnimate(core, animateDefault, opts && opts.animate);
          var op = {
            type: 'reset',
            status: '已重置 · 共 ' + baseItems.length + ' 项'
          };
          runChange(copyList(baseItems), baselineChanged, {
            op: op,
            status: op.status,
            event: { type: 'reset' },
            animateOpt: animate ? true : false
          });
          return view;
        },
        replay: function (opts) {
          if (destroyed) return view;
          var animate = shouldAnimate(core, animateDefault, opts && opts.animate);
          cancelMotion();
          syncDom(items, activeChanged);
          if (!animate) return view;
          if (!replayFrom) {
            updateStatus(lastOp && lastOp.status ? lastOp.status : ('共 ' + items.length + ' 项'));
            return view;
          }
          var targetItems = copyList(items);
          var targetChanged = activeChanged.slice();
          var targetStatus = statusEl.textContent;
          var fromItems = copyList(replayFrom.items);
          var fromChanged = (replayFrom.changed || []).slice();
          var fromMap = listIds(fromItems);
          var targetMap = listIds(targetItems);
          syncDom(fromItems, fromChanged);
          updateStatus('重看上一步 · 先呈现变化前状态');
          setAnimState(root, 'waiting');
          var fromInfo = captureRectInfo();
          var leaving = [];
          Object.keys(nodes).forEach(function (id) {
            if (!own(targetMap, id)) {
              var record = createGhostRecord(id);
              if (record && fromInfo.items[id]) leaving.push({ clone: record, rect: fromInfo.items[id] });
            }
          });
          var enterIds = {};
          Object.keys(targetMap).forEach(function (id) {
            if (!own(fromMap, id)) enterIds[id] = true;
          });
          timers.schedule(function () {
            syncDom(targetItems, targetChanged);
            updateStatus(targetStatus);
            animateVisual(fromInfo, leaving, enterIds);
          }, holdMs);
          return view;
        },
        /* 停稳提示（关注/变化/当前项颜色）在 action 结算后仍有短过渡；
         * 供编排层在“本步完成”前等待这段必要提示收束；独立用法不受影响。 */
        settleVisual: function () {
          if (destroyed) return Promise.resolve();
          var cueAnimations = [];
          try {
            list.getAnimations({ subtree: true }).forEach(function (animation) {
              if (animation && animation.playState === 'running' && animation.transitionProperty) cueAnimations.push(animation);
            });
          } catch (error) { cueAnimations = []; }
          if (!cueAnimations.length) return Promise.resolve();
          var waits = cueAnimations.map(function (animation) {
            return animation.finished.then(function () {}, function () {});
          });
          var guard = new Promise(function (resolve) { global.setTimeout(resolve, 400); });
          return Promise.race([Promise.all(waits), guard]);
        },
        getState: function () { return snapshot(); },
        getTarget: function (id) {
          var key = String(id);
          var allowed = listIds(items);
          if (!allowed[key]) return null;
          return nodes[key] ? nodes[key].li : null;
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          cancelMotion();
          if (typeof stopResize === 'function') stopResize();
          stopResize = null;
          nodes = {};
          core.clear(ghostLayer);
          root.remove();
        }
      };

      host.appendChild(root);
      motionEase = shared.explainEase(root);
      syncDom(items, activeChanged);
      updateStatus(items.length ? ('共 ' + items.length + ' 项 · 待操作') : '共 0 项 · 无可操作对象');
      if (core.onResize && typeof core.onResize === 'function') {
        var observedWidth = root.getBoundingClientRect().width;
        stopResize = core.onResize(root, function () {
          if (destroyed) return;
          var nextWidth = root.getBoundingClientRect().width;
          if (Math.abs(nextWidth - observedWidth) < 1) return;
          observedWidth = nextWidth;
          if (running) settleCurrentVisual();
        });
      }
      return view;
    }
  };
})(window);

/* ---- source: src/viz/mechanisms-transfer.js ---- */
/*!
 * HTML 笔记 · 可复用变化机制 M02 · NoteViz.Transfer
 * 范围：唯一对象从起点移动到终点，终态在目标区域真实归属，临时路径提示停稳即移除；
 *       公开到 window.NoteViz.Transfer。
 * 依赖：NoteCore（core.js、motion.js）与 src/viz/mechanisms.js（内部共享工具，须先加载）。
 * 同一对象节点在源/目标容器间移动，不克隆；源侧终态没有副本。
 */
(function (global) {
  'use strict';

  var NoteViz = global.NoteViz = global.NoteViz || {};
  var VERSION = '1.0.0';

  function requireShared() {
    var internals = global.NoteVizInternals && global.NoteVizInternals.mechanisms;
    if (!internals) {
      throw new Error('NoteViz.Transfer 需要先加载 src/viz/mechanisms.js（内部共享工具）。');
    }
    return internals;
  }

  function resolveZone(host, value) {
    if (value && value.nodeType === 1) return value;
    if (typeof value !== 'string' || value === '') return null;
    try {
      if (host && host.nodeType === 1 && host.querySelector) {
        var local = host.querySelector(value);
        if (local) return local;
      }
    } catch (error) {}
    try {
      return document.querySelector(value);
    } catch (error) {
      return null;
    }
  }

  NoteViz.Transfer = {
    version: VERSION,
    mount: function (host, options) {
      var shared = requireShared();
      var core = shared.requireCore();
      shared.requireHost(core, host);
      var own = shared.own;
      var text = shared.text;
      var displayText = shared.displayText;
      var shouldAnimate = shared.shouldAnimate;
      var setAnimState = shared.setAnimState;
      var removeNode = shared.removeNode;
      var svgElement = shared.svgElement;

      var config = options && typeof options === 'object' ? options : {};
      var destroyed = false;
      var sourceOption = config.source;
      var targetOption = config.target;
      var external = sourceOption != null || targetOption != null;
      var sourceZone = null;
      var targetZone = null;
      var sourceSlot = null;
      var targetSlot = null;
      var sourceCaption = null;
      var targetCaption = null;
      var sourceEmptyNote = null;
      var targetEmptyNote = null;

      if (external) {
        sourceZone = resolveZone(host, sourceOption);
        targetZone = resolveZone(host, targetOption);
        if (!sourceZone || !targetZone) {
          throw new TypeError('NoteViz.Transfer.mount：source / target 需要是可解析的元素或选择器。');
        }
        if (sourceZone === targetZone) {
          throw new TypeError('NoteViz.Transfer.mount：source 与 target 不能是同一个容器。');
        }
      }

      var root = core.el('section', 'nviz-transfer');
      root.setAttribute('role', 'group');
      root.setAttribute('data-at', 'source');
      root.setAttribute('data-anim', 'idle');
      var sourceLabel = text(config.sourceLabel) || '起点';
      var targetLabel = text(config.targetLabel) || '终点';
      var objectData = {
        id: config.object && config.object.id != null ? String(config.object.id) : 'object',
        label: config.object && config.object.label != null ? text(config.object.label) : '对象'
      };
      var animateDefault = config.animate !== false;
      var onSettle = typeof config.onSettle === 'function' ? config.onSettle : null;
      var motionDuration = Math.max(300, Math.min(680, Math.round(shared.explainMs(core) * 1.05)));
      var motionEase = '';
      var at = 'source';
      var running = null;
      var motion = shared.createMotionBag(core);
      var timers = shared.createTimers(function () { return !destroyed; });
      var trail = null;
      var legendSource = null;
      var legendTarget = null;

      var objectEl = core.el('div', 'nviz-transfer__object');
      objectEl.setAttribute('role', 'group');
      objectEl.setAttribute('data-object-id', objectData.id);
      var objectMark = core.el('span', 'nviz-transfer__object-mark');
      objectMark.setAttribute('aria-hidden', 'true');
      var objectLabel = core.el('span', 'nviz-transfer__object-label');
      var objectState = core.el('span', 'nviz-transfer__object-state');
      objectEl.appendChild(objectMark);
      objectEl.appendChild(objectLabel);
      objectEl.appendChild(objectState);

      if (external) {
        root.classList.add('nviz-transfer--external');
        var legend = core.el('div', 'nviz-transfer__legend');
        legendSource = core.el('span', 'nviz-transfer__legend-text');
        var legendArrow = core.el('span', 'nviz-transfer__legend-arrow');
        legendArrow.setAttribute('aria-hidden', 'true');
        legendArrow.textContent = '→';
        legendTarget = core.el('span', 'nviz-transfer__legend-text');
        var legendFrom = core.el('span', 'nviz-transfer__legend-label');
        legendFrom.textContent = '起点';
        var legendTo = core.el('span', 'nviz-transfer__legend-label');
        legendTo.textContent = '终点';
        legend.appendChild(legendFrom);
        legend.appendChild(legendSource);
        legend.appendChild(legendArrow);
        legend.appendChild(legendTo);
        legend.appendChild(legendTarget);
        root.appendChild(legend);
      } else {
        var stage = core.el('div', 'nviz-transfer__stage');
        var sourceSection = core.el('section', 'nviz-transfer__zone nviz-transfer__zone--source');
        var sourceHead = core.el('div', 'nviz-transfer__zone-head');
        var sourceKicker = core.el('span', 'nviz-transfer__zone-kicker');
        sourceKicker.textContent = '起点';
        sourceCaption = core.el('span', 'nviz-transfer__zone-caption');
        sourceHead.appendChild(sourceKicker);
        sourceHead.appendChild(sourceCaption);
        sourceSlot = core.el('div', 'nviz-transfer__slot');
        sourceEmptyNote = core.el('span', 'nviz-transfer__slot-empty', '对象已移出');
        sourceEmptyNote.setAttribute('aria-hidden', 'true');
        sourceSlot.appendChild(sourceEmptyNote);
        sourceSection.appendChild(sourceHead);
        sourceSection.appendChild(sourceSlot);
        sourceZone = sourceSection;

        var arrow = core.el('span', 'nviz-transfer__arrow');
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '→';

        var targetSection = core.el('section', 'nviz-transfer__zone nviz-transfer__zone--target');
        var targetHead = core.el('div', 'nviz-transfer__zone-head');
        var targetKicker = core.el('span', 'nviz-transfer__zone-kicker');
        targetKicker.textContent = '终点';
        targetCaption = core.el('span', 'nviz-transfer__zone-caption');
        targetHead.appendChild(targetKicker);
        targetHead.appendChild(targetCaption);
        targetSlot = core.el('div', 'nviz-transfer__slot');
        targetEmptyNote = core.el('span', 'nviz-transfer__slot-empty', '等待对象');
        targetEmptyNote.setAttribute('aria-hidden', 'true');
        targetSlot.appendChild(targetEmptyNote);
        targetSection.appendChild(targetHead);
        targetSection.appendChild(targetSlot);
        targetZone = targetSection;

        stage.appendChild(sourceZone);
        stage.appendChild(arrow);
        stage.appendChild(targetZone);
        root.appendChild(stage);
      }

      var statusEl = core.el('p', 'nviz-transfer__status');
      statusEl.setAttribute('role', 'status');
      statusEl.setAttribute('aria-live', 'polite');
      root.appendChild(statusEl);

      function containerFor(destination) {
        if (destination === 'source') return sourceSlot || sourceZone;
        return targetSlot || targetZone;
      }

      function objectVisibleRect() {
        if (!objectEl || !objectEl.isConnected) return null;
        var box = objectEl.getBoundingClientRect();
        if (!box || box.width <= 0 || box.height <= 0) return null;
        return box;
      }

      function updateLabels() {
        objectLabel.textContent = displayText(objectData.label);
        root.setAttribute('aria-label', '对象传递：' + displayText(objectData.label) + '，从' + sourceLabel + '到' + targetLabel);
        if (external) {
          if (legendSource) legendSource.textContent = sourceLabel;
          if (legendTarget) legendTarget.textContent = targetLabel;
        } else {
          if (sourceCaption) sourceCaption.textContent = sourceLabel;
          if (targetCaption) targetCaption.textContent = targetLabel;
          if (sourceZone) sourceZone.setAttribute('aria-label', '起点：' + sourceLabel);
          if (targetZone) targetZone.setAttribute('aria-label', '终点：' + targetLabel);
        }
      }

      function updateObjectState() {
        if (running) objectState.textContent = '传递中';
        else if (at === 'target') objectState.textContent = '已到达';
        else objectState.textContent = '待传递';
        objectEl.setAttribute('aria-label', '传递对象：' + displayText(objectData.label) + '，' + objectState.textContent);
        root.setAttribute('data-at', at);
        root.setAttribute('data-busy', running ? 'true' : 'false');
        if (!external) {
          if (sourceZone) {
            sourceZone.classList.toggle('nviz-transfer__zone--holding', objectEl.parentNode === containerFor('source'));
          }
          if (targetZone) {
            targetZone.classList.toggle('nviz-transfer__zone--holding', objectEl.parentNode === containerFor('target'));
          }
          if (sourceEmptyNote) sourceEmptyNote.hidden = objectEl.parentNode === containerFor('source');
          if (targetEmptyNote) targetEmptyNote.hidden = objectEl.parentNode === containerFor('target');
        }
      }

      function statusForIdle() {
        if (at === 'target') {
          return '对象已归入「' + targetLabel + '」；「' + sourceLabel + '」没有副本。';
        }
        return '对象位于「' + sourceLabel + '」；终点「' + targetLabel + '」尚无该对象。';
      }

      function setStatus(message) {
        statusEl.textContent = message;
      }

      function snapshot() {
        return {
          at: at,
          settled: !running,
          object: { id: objectData.id, label: objectData.label },
          sourceLabel: sourceLabel,
          targetLabel: targetLabel
        };
      }

      function emitSettle() {
        if (destroyed || !onSettle) return;
        onSettle(snapshot());
      }

      function removeTrail() {
        if (trail && trail.parentNode) trail.parentNode.removeChild(trail);
        trail = null;
      }

      function stopAnimations() {
        motion.cancelAll();
        try { core.motion.stop(objectEl); } catch (error) {}
      }

      function cancelMotion() {
        timers.clear();
        stopAnimations();
        removeTrail();
        running = null;
        setAnimState(root, 'idle');
        updateObjectState();
      }

      function buildTrail(fromRect, toRect, duration) {
        removeTrail();
        if (!fromRect || !toRect) return;
        var doc = global.document;
        var body = doc.body || doc.documentElement;
        if (!body) return;
        var width = global.innerWidth || doc.documentElement.clientWidth || 1;
        var height = global.innerHeight || doc.documentElement.clientHeight || 1;
        var startX = fromRect.left + fromRect.width / 2;
        var startY = fromRect.top + fromRect.height / 2;
        var endX = toRect.left + toRect.width / 2;
        var endY = toRect.top + toRect.height / 2;
        var dx = endX - startX;
        var dy = endY - startY;
        var distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 8) return;
        var bow = Math.min(52, Math.max(18, distance * 0.16));
        var normalX = (-dy / distance) * bow;
        var normalY = (dx / distance) * bow;
        var c1x = startX + dx * 0.32 + normalX;
        var c1y = startY + dy * 0.32 + normalY;
        var c2x = startX + dx * 0.68 + normalX;
        var c2y = startY + dy * 0.68 + normalY;

        var svg = svgElement('svg', 'nviz-transfer__trail');
        svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
        svg.setAttribute('width', String(width));
        svg.setAttribute('height', String(height));
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        var path = svgElement('path', 'nviz-transfer__trail-path');
        path.setAttribute('d',
          'M ' + startX.toFixed(1) + ' ' + startY.toFixed(1) +
          ' C ' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) +
          ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) +
          ' ' + endX.toFixed(1) + ' ' + endY.toFixed(1));
        path.setAttribute('fill', 'none');
        var startDot = svgElement('circle', 'nviz-transfer__trail-dot');
        startDot.setAttribute('cx', String(startX));
        startDot.setAttribute('cy', String(startY));
        startDot.setAttribute('r', '3');
        var endDot = svgElement('circle', 'nviz-transfer__trail-dot');
        endDot.setAttribute('cx', String(endX));
        endDot.setAttribute('cy', String(endY));
        endDot.setAttribute('r', '3');
        svg.appendChild(path);
        svg.appendChild(startDot);
        svg.appendChild(endDot);
        body.appendChild(svg);
        trail = svg;
        motion.play(svg, [
          { opacity: '0' },
          { opacity: '0.9', offset: 0.18 },
          { opacity: '0.82', offset: 0.7 },
          { opacity: '0' }
        ], {
          duration: duration,
          easing: 'ease-out',
          id: 'nviz-transfer-trail'
        });
      }

      function renderIdleStatus() {
        setStatus(statusForIdle());
      }

      function finishTo(destination, emit) {
        if (destroyed) return;
        cancelMotion();
        at = destination;
        var container = containerFor(destination);
        if (container && objectEl.parentNode !== container) container.appendChild(objectEl);
        updateLabels();
        updateObjectState();
        renderIdleStatus();
        if (emit !== false) emitSettle();
      }

      function beginTransfer(destination, animate, kind) {
        if (destroyed) return view;
        var fromRect = objectVisibleRect();
        var fromZoneRect = destination === 'source' ? null : (sourceZone ? sourceZone.getBoundingClientRect() : null);
        if (!fromRect && fromZoneRect) fromRect = fromZoneRect;
        cancelMotion();
        at = destination;
        var container = containerFor(destination);
        if (container) container.appendChild(objectEl);
        updateLabels();
        var targetRect = objectVisibleRect();
        running = { destination: destination, kind: kind };
        updateObjectState();
        setStatus(destination === 'target'
          ? '正在从「' + sourceLabel + '」传递到「' + targetLabel + '」…'
          : '正在把对象送回「' + sourceLabel + '」…');
        setAnimState(root, 'running');
        if (!animate || !targetRect) {
          finishTo(destination, true);
          return view;
        }
        var dx = fromRect ? fromRect.left - targetRect.left : 0;
        var dy = fromRect ? fromRect.top - targetRect.top : 0;
        var sx = fromRect && targetRect.width > 0 ? fromRect.width / targetRect.width : 1;
        var sy = fromRect && targetRect.height > 0 ? fromRect.height / targetRect.height : 1;
        if (!isFinite(sx) || sx <= 0) sx = 1;
        if (!isFinite(sy) || sy <= 0) sy = 1;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) {
          finishTo(destination, true);
          return view;
        }
        motion.play(objectEl, [
          {
            transform: 'translate3d(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px,0) scale(' + sx.toFixed(3) + ',' + sy.toFixed(3) + ')',
            transformOrigin: '0 0'
          },
          { transform: 'translate3d(0,0,0) scale(1,1)', transformOrigin: '0 0' }
        ], {
          duration: motionDuration,
          easing: motionEase,
          id: 'nviz-transfer-object'
        });
        buildTrail(fromRect, targetRect, motionDuration);
        timers.schedule(function () {
          if (!running || running.destination !== destination) return;
          finishTo(destination, true);
        }, motionDuration + 50);
        return view;
      }

      /* send/reset 只差目标区域与动作名：同向重复操作立即落定，反向从当前视觉位置重建一次移动。 */
      function moveObject(destination, opts, kind) {
        if (destroyed) return view;
        var animate = shouldAnimate(core, animateDefault, opts && opts.animate);
        if (running) {
          if (running.destination === destination) finishTo(destination, true);
          else beginTransfer(destination, animate, kind);
          return view;
        }
        if (at === destination && objectEl.parentNode === containerFor(destination)) return view;
        beginTransfer(destination, animate, kind);
        return view;
      }

      var view = {
        el: root,
        send: function (opts) {
          return moveObject('target', opts, 'send');
        },
        reset: function (opts) {
          return moveObject('source', opts, 'reset');
        },
        replay: function (opts) {
          if (destroyed) return view;
          var animate = shouldAnimate(core, animateDefault, opts && opts.animate);
          var sourceContainer = containerFor('source');
          cancelMotion();
          at = 'source';
          if (sourceContainer) sourceContainer.appendChild(objectEl);
          updateLabels();
          updateObjectState();
          setStatus('重看：对象先从「' + sourceLabel + '」出发。');
          if (!animate) {
            finishTo('target', true);
            return view;
          }
          beginTransfer('target', true, 'replay');
          return view;
        },
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return view;
          if (running) {
            cancelMotion();
            var container = containerFor(at);
            if (container) container.appendChild(objectEl);
            setStatus(statusForIdle());
          }
          if (own(patch, 'object') && patch.object && typeof patch.object === 'object') {
            if (own(patch.object, 'id')) objectData.id = patch.object.id != null ? String(patch.object.id) : objectData.id;
            if (own(patch.object, 'label')) objectData.label = text(patch.object.label);
            objectEl.setAttribute('data-object-id', objectData.id);
          }
          if (own(patch, 'sourceLabel')) sourceLabel = text(patch.sourceLabel) || '起点';
          if (own(patch, 'targetLabel')) targetLabel = text(patch.targetLabel) || '终点';
          if (own(patch, 'animate')) animateDefault = patch.animate !== false;
          if (own(patch, 'onSettle')) onSettle = typeof patch.onSettle === 'function' ? patch.onSettle : null;
          updateLabels();
          updateObjectState();
          if (!running) renderIdleStatus();
          return view;
        },
        getState: function () { return snapshot(); },
        getTarget: function (key) {
          if (destroyed) return null;
          if (key === 'object') return objectEl;
          if (key === 'source') return sourceZone;
          if (key === 'target') return targetZone;
          return null;
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          cancelMotion();
          removeNode(objectEl);
          sourceZone = null;
          targetZone = null;
          sourceSlot = null;
          targetSlot = null;
          root.remove();
        }
      };

      host.appendChild(root);
      motionEase = shared.explainEase(root);
      var initialContainer = containerFor('source');
      if (initialContainer) initialContainer.appendChild(objectEl);
      updateLabels();
      updateObjectState();
      renderIdleStatus();
      return view;
    }
  };
})(window);

/* ---- source: src/viz/mechanisms-split-merge.js ---- */
/*!
 * HTML 笔记 · 可复用变化机制 M03 · NoteViz.SplitMerge
 * 范围：按宿主给定的前后对象与映射呈现拆分或合并；来源、结果与连线同屏保留；
 *       公开到 window.NoteViz.SplitMerge。
 * 依赖：NoteCore（core.js、motion.js）与 src/viz/mechanisms.js（内部共享工具，须先加载）。
 * 只呈现映射，不推断数据语义；不克隆对象节点。
 */
(function (global) {
  'use strict';

  var NoteViz = global.NoteViz = global.NoteViz || {};
  var VERSION = '1.0.0';

  function requireShared() {
    var internals = global.NoteVizInternals && global.NoteVizInternals.mechanisms;
    if (!internals) {
      throw new Error('NoteViz.SplitMerge 需要先加载 src/viz/mechanisms.js（内部共享工具）。');
    }
    return internals;
  }

  NoteViz.SplitMerge = {
    version: VERSION,
    mount: function (host, options) {
      var shared = requireShared();
      var core = shared.requireCore();
      shared.requireHost(core, host);
      var own = shared.own;
      var text = shared.text;
      var displayText = shared.displayText;
      var copyList = shared.copyList;
      var normalizeObjects = shared.normalizeObjects;
      var shouldAnimate = shared.shouldAnimate;
      var setAnimState = shared.setAnimState;
      var svgElement = shared.svgElement;

      var config = options && typeof options === 'object' ? options : {};
      var destroyed = false;
      var root = core.el('section', 'nviz-split-merge');
      root.setAttribute('role', 'group');
      root.setAttribute('data-anim', 'idle');
      root.setAttribute('data-phase', 'before');
      var mode = config.mode === 'merge' ? 'merge' : 'split';
      var label = text(config.label) || (mode === 'merge' ? '合并关系' : '拆分关系');
      var beforeItems = normalizeObjects(config.before, 'before');
      var afterItems = normalizeObjects(config.after, 'after');
      var links = [];
      var animateDefault = config.animate !== false;
      var onSettle = typeof config.onSettle === 'function' ? config.onSettle : null;
      var phase = 'before';
      var running = null;
      var motion = shared.createMotionBag(core);
      var timers = shared.createTimers(function () { return !destroyed; });
      var motionDuration = shared.explainMs(core);
      var motionEase = '';
      var holdMs = Math.max(190, Math.min(320, Math.round(motionDuration * 0.5)));
      var stopResize = null;
      var beforeNodes = {};
      var afterNodes = {};
      var sourceLinks = {};
      var targetLinks = {};
      var svg = null;
      var stage = null;
      var beforeLane = null;
      var afterLane = null;
      var beforeList = null;
      var afterList = null;
      var statusEl = null;
      var emptyEl = null;
      var srList = null;

      function modeWords() {
        if (mode === 'merge') {
          return {
            before: '合并前',
            after: '合并后',
            badge: '合并',
            empty: '播放后显示合并结果',
            source: '来源',
            result: '结果'
          };
        }
        return {
          before: '拆分前',
          after: '拆分后',
          badge: '拆分',
          empty: '播放后显示拆分结果',
          source: '来源',
          result: '结果'
        };
      }

      function normalizeLinks(raw) {
        var beforeMap = {};
        var afterMap = {};
        beforeItems.forEach(function (item) { beforeMap[item.id] = true; });
        afterItems.forEach(function (item) { afterMap[item.id] = true; });
        var result = [];
        var seen = {};
        var source = Array.isArray(raw) ? raw : [];
        if (!source.length) {
          if (mode === 'merge') {
            if (afterItems[0]) {
              beforeItems.forEach(function (item) {
                result.push({ from: item.id, to: afterItems[0].id });
              });
            }
          } else if (beforeItems[0]) {
            afterItems.forEach(function (item) {
              result.push({ from: beforeItems[0].id, to: item.id });
            });
          }
          return result;
        }
        source.forEach(function (entry) {
          if (!entry || typeof entry !== 'object') return;
          var from = entry.from == null ? '' : String(entry.from);
          var to = entry.to == null ? '' : String(entry.to);
          if (!beforeMap[from] || !afterMap[to]) return;
          var key = from + '\u0000' + to;
          if (own(seen, key)) return;
          seen[key] = true;
          result.push({ from: from, to: to });
        });
        return result;
      }

      function buildMaps() {
        sourceLinks = {};
        targetLinks = {};
        beforeItems.forEach(function (item) { sourceLinks[item.id] = []; });
        afterItems.forEach(function (item) { targetLinks[item.id] = []; });
        links.forEach(function (link) {
          sourceLinks[link.from].push(link);
          targetLinks[link.to].push(link);
        });
      }

      function labelsForTargets(id) {
        return sourceLinks[id].map(function (link) {
          var targetItem = null;
          for (var i = 0; i < afterItems.length; i += 1) {
            if (afterItems[i].id === link.to) targetItem = afterItems[i];
          }
          return targetItem ? displayText(targetItem.label) : '';
        }).filter(Boolean);
      }

      function labelsForSources(id) {
        return targetLinks[id].map(function (link) {
          var sourceItem = null;
          for (var i = 0; i < beforeItems.length; i += 1) {
            if (beforeItems[i].id === link.from) sourceItem = beforeItems[i];
          }
          return sourceItem ? displayText(sourceItem.label) : '';
        }).filter(Boolean);
      }

      function makeCard(item, side) {
        var li = core.el('li', 'nviz-split-merge__card nviz-split-merge__card--' + side);
        li.setAttribute('data-id', item.id);
        var sideTag = core.el('span', 'nviz-split-merge__card-side');
        sideTag.textContent = side === 'before' ? modeWords().source : modeWords().result;
        var labelEl = core.el('span', 'nviz-split-merge__card-label');
        labelEl.textContent = displayText(item.label);
        var mapEl = core.el('span', 'nviz-split-merge__card-map');
        var mapped = side === 'before' ? labelsForTargets(item.id) : labelsForSources(item.id);
        if (mapped.length) {
          mapEl.textContent = (side === 'before' ? '→ ' : '← ') + mapped.join('、');
        } else {
          mapEl.textContent = '（无映射）';
        }
        li.appendChild(sideTag);
        li.appendChild(labelEl);
        li.appendChild(mapEl);
        if (side === 'before') {
          li.setAttribute('aria-label', displayText(item.label) +
            (mapped.length ? '，映射到 ' + mapped.join('、') : '，没有映射'));
        } else {
          li.setAttribute('aria-label', displayText(item.label) +
            (mapped.length ? '，来自 ' + mapped.join('、') : '，没有来源'));
        }
        return li;
      }

      function mappingText() {
        if (!links.length) return '映射：当前数据没有可显示的前后对应。';
        if (mode === 'merge') {
          var byTarget = [];
          afterItems.forEach(function (item) {
            var sources = labelsForSources(item.id);
            if (sources.length) byTarget.push(sources.join(' + ') + ' → ' + displayText(item.label));
          });
          return '映射：' + byTarget.join('；');
        }
        var bySource = [];
        beforeItems.forEach(function (item) {
          var targets = labelsForTargets(item.id);
          if (targets.length) bySource.push(displayText(item.label) + ' → ' + targets.join('、'));
        });
        return '映射：' + bySource.join('；');
      }

      function updatePhaseUi() {
        root.setAttribute('data-phase', phase);
        if (afterList) afterList.setAttribute('aria-hidden', phase === 'before' ? 'true' : 'false');
        if (emptyEl) emptyEl.setAttribute('aria-hidden', phase === 'before' ? 'false' : 'true');
      }

      function renderMappingScreenReader() {
        if (!srList) return;
        core.clear(srList);
        links.forEach(function (link) {
          var sourceItem = null;
          var targetItem = null;
          beforeItems.forEach(function (item) { if (item.id === link.from) sourceItem = item; });
          afterItems.forEach(function (item) { if (item.id === link.to) targetItem = item; });
          if (!sourceItem || !targetItem) return;
          var li = core.el('li', '');
          li.textContent = displayText(sourceItem.label) + ' → ' + displayText(targetItem.label);
          srList.appendChild(li);
        });
      }

      function statusIdle() {
        if (phase === 'after') {
          return mode === 'merge'
            ? '合并完成：来源与结果同时保留，可沿连线核对对应关系。'
            : '拆分完成：来源与结果同时保留，可沿连线核对对应关系。';
        }
        return '共 ' + beforeItems.length + ' 个来源对象、' + afterItems.length +
          ' 个结果对象。播放后按映射展示' + (mode === 'merge' ? '合并' : '拆分') + '。';
      }

      function setStatus(message) {
        if (statusEl) statusEl.textContent = message;
      }

      function snapshot() {
        return {
          mode: mode,
          before: copyList(beforeItems),
          after: copyList(afterItems),
          links: links.map(function (link) { return { from: link.from, to: link.to }; }),
          phase: phase,
          running: !!running
        };
      }

      function emitSettle() {
        if (destroyed || !onSettle) return;
        onSettle(snapshot());
      }

      function stopAllAnimations() {
        motion.cancelAll();
        Object.keys(beforeNodes).forEach(function (id) {
          try { core.motion.stop(beforeNodes[id]); } catch (error) {}
        });
        Object.keys(afterNodes).forEach(function (id) {
          try {
            core.motion.stop(afterNodes[id]);
            afterNodes[id].style.transform = '';
            afterNodes[id].style.opacity = '';
          } catch (error) {}
        });
        if (svg) {
          Array.prototype.forEach.call(svg.querySelectorAll('.nviz-split-merge__link'), function (path) {
            try {
              core.motion.stop(path);
              path.style.opacity = '';
              path.style.strokeDashoffset = '';
            } catch (error) {}
          });
        }
      }

      function cancelMotion() {
        timers.clear();
        stopAllAnimations();
        running = null;
        setAnimState(root, 'idle');
      }

      function drawLinks() {
        if (!svg || !stage) return;
        core.clear(svg);
        var stageBox = stage.getBoundingClientRect();
        var width = Math.max(1, stageBox.width);
        var height = Math.max(1, stageBox.height);
        svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
        svg.setAttribute('width', String(width));
        svg.setAttribute('height', String(height));
        if (!links.length || !beforeLane || !afterLane) return;
        var beforeBox = beforeLane.getBoundingClientRect();
        var afterBox = afterLane.getBoundingClientRect();
        var horizontal = beforeBox.right <= afterBox.left + 2;
        links.forEach(function (link, linkIndex) {
          var sourceNode = beforeNodes[link.from];
          var targetNode = afterNodes[link.to];
          if (!sourceNode || !targetNode) return;
          var sourceRect = sourceNode.getBoundingClientRect();
          var targetRect = targetNode.getBoundingClientRect();
          var sx;
          var sy;
          var tx;
          var ty;
          if (horizontal) {
            sx = sourceRect.right - stageBox.left;
            sy = sourceRect.top + sourceRect.height / 2 - stageBox.top;
            tx = targetRect.left - stageBox.left;
            ty = targetRect.top + targetRect.height / 2 - stageBox.top;
          } else {
            // 纵向布局时在右缘留一条窄通道，避免连线穿过其他卡片。
            sx = sourceRect.right - stageBox.left;
            sy = sourceRect.top + sourceRect.height / 2 - stageBox.top;
            tx = targetRect.right - stageBox.left;
            ty = targetRect.top + targetRect.height / 2 - stageBox.top;
          }
          var dx = tx - sx;
          var dy = ty - sy;
          var path = svgElement('path', 'nviz-split-merge__link');
          var d;
          if (horizontal) {
            var bend = Math.max(18, Math.abs(dx) * 0.42);
            d = 'M ' + sx.toFixed(1) + ' ' + sy.toFixed(1) +
              ' C ' + (sx + bend).toFixed(1) + ' ' + sy.toFixed(1) +
              ' ' + (tx - bend).toFixed(1) + ' ' + ty.toFixed(1) +
              ' ' + tx.toFixed(1) + ' ' + ty.toFixed(1);
          } else {
            var channel = width - 5 - (linkIndex % 4) * 4;
            var route = 8;
            var down = ty > sy;
            var startY = sy + (down ? route : -route);
            var endY = ty - (down ? route : -route);
            d = 'M ' + sx.toFixed(1) + ' ' + sy.toFixed(1) +
              ' L ' + channel.toFixed(1) + ' ' + sy.toFixed(1) +
              ' Q ' + channel.toFixed(1) + ' ' + sy.toFixed(1) +
              ' ' + channel.toFixed(1) + ' ' + startY.toFixed(1) +
              ' L ' + channel.toFixed(1) + ' ' + endY.toFixed(1) +
              ' Q ' + channel.toFixed(1) + ' ' + ty.toFixed(1) +
              ' ' + (channel - 8).toFixed(1) + ' ' + ty.toFixed(1) +
              ' L ' + tx.toFixed(1) + ' ' + ty.toFixed(1);
          }
          path.setAttribute('d', d);
          path.setAttribute('pathLength', '1');
          path.setAttribute('fill', 'none');
          svg.appendChild(path);
          var dot = svgElement('circle', 'nviz-split-merge__link-dot');
          dot.setAttribute('cx', String(tx));
          dot.setAttribute('cy', String(ty));
          dot.setAttribute('r', '3');
          svg.appendChild(dot);
        });
      }

      function startCenterForTarget(targetId) {
        var linked = targetLinks[targetId] || [];
        var x = 0;
        var y = 0;
        var count = 0;
        linked.forEach(function (link) {
          var sourceNode = beforeNodes[link.from];
          if (!sourceNode) return;
          var box = sourceNode.getBoundingClientRect();
          x += box.left + box.width / 2;
          y += box.top + box.height / 2;
          count += 1;
        });
        if (count) return { x: x / count, y: y / count };
        if (beforeLane) {
          var lane = beforeLane.getBoundingClientRect();
          return { x: lane.left + lane.width / 2, y: lane.top + lane.height / 2 };
        }
        if (stage) {
          var stageBox = stage.getBoundingClientRect();
          return { x: stageBox.left + stageBox.width / 2, y: stageBox.top + stageBox.height / 2 };
        }
        return { x: 0, y: 0 };
      }

      function runAfterAnimation(animate, emit) {
        if (destroyed) return view;
        cancelMotion();
        phase = 'after';
        updatePhaseUi();
        drawLinks();
        stopAllAnimations();
        setStatus('正在展示' + (mode === 'merge' ? '合并' : '拆分') + '：来源与结果按连线对应…');
        if (!animate || core.motion.reduced()) {
          setAnimState(root, 'idle');
          setStatus(statusIdle());
          if (emit !== false) emitSettle();
          return view;
        }
        var token = {};
        running = token;
        setAnimState(root, 'running');
        var total = 0;
        var afterIds = afterItems.map(function (item) { return item.id; });
        afterIds.forEach(function (id, index) {
          var node = afterNodes[id];
          if (!node) return;
          var targetRect = node.getBoundingClientRect();
          var start = startCenterForTarget(id);
          var dx = start.x - (targetRect.left + targetRect.width / 2);
          var dy = start.y - (targetRect.top + targetRect.height / 2);
          var delay = index * 55;
          motion.play(node, [
            { opacity: '0', transform: 'translate3d(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px,0) scale(.88)' },
            { opacity: '1', transform: 'translate3d(0,0,0) scale(1)' }
          ], {
            duration: motionDuration,
            delay: delay,
            easing: motionEase,
            id: 'nviz-split-merge-result'
          });
          total = Math.max(total, delay + motionDuration);
        });
        if (svg) {
          var paths = svg.querySelectorAll('.nviz-split-merge__link');
          Array.prototype.forEach.call(paths, function (path, index) {
            var delay = 70 + index * 45;
            motion.play(path, [
              { opacity: '0', strokeDashoffset: '1' },
              { opacity: '1', strokeDashoffset: '0' }
            ], {
              duration: Math.max(220, Math.round(motionDuration * 0.7)),
              delay: delay,
              easing: motionEase,
              id: 'nviz-split-merge-link'
            });
            total = Math.max(total, delay + Math.max(220, Math.round(motionDuration * 0.7)));
          });
        }
        if (!total) total = 60;
        timers.schedule(function () {
          if (!running || running !== token) return;
          running = null;
          stopAllAnimations();
          phase = 'after';
          updatePhaseUi();
          setAnimState(root, 'idle');
          drawLinks();
          setStatus(statusIdle());
          if (emit !== false) emitSettle();
        }, total + 55);
        return view;
      }

      function runBeforeAnimation(animate, emit) {
        if (destroyed) return view;
        cancelMotion();
        phase = 'before';
        setStatus('正在回到变化前…');
        if (!animate || core.motion.reduced()) {
          phase = 'before';
          updatePhaseUi();
          setAnimState(root, 'idle');
          setStatus(statusIdle());
          if (emit !== false) emitSettle();
          return view;
        }
        var token = {};
        running = token;
        setAnimState(root, 'running');
        var total = 0;
        afterItems.forEach(function (item, index) {
          var node = afterNodes[item.id];
          if (!node) return;
          var targetRect = node.getBoundingClientRect();
          var start = startCenterForTarget(item.id);
          var dx = start.x - (targetRect.left + targetRect.width / 2);
          var dy = start.y - (targetRect.top + targetRect.height / 2);
          var delay = index * 45;
          motion.play(node, [
            { opacity: '1', transform: 'translate3d(0,0,0) scale(1)' },
            { opacity: '0', transform: 'translate3d(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px,0) scale(.88)' }
          ], {
            duration: motionDuration,
            delay: delay,
            easing: motionEase,
            id: 'nviz-split-merge-reverse'
          });
          total = Math.max(total, delay + motionDuration);
        });
        if (svg) {
          var paths = svg.querySelectorAll('.nviz-split-merge__link');
          Array.prototype.forEach.call(paths, function (path, index) {
            var delay = index * 30;
            motion.play(path, [
              { opacity: '1', strokeDashoffset: '0' },
              { opacity: '0', strokeDashoffset: '1' }
            ], {
              duration: Math.max(180, Math.round(motionDuration * 0.6)),
              delay: delay,
              easing: motionEase,
              id: 'nviz-split-merge-link-out'
            });
            total = Math.max(total, delay + Math.max(180, Math.round(motionDuration * 0.6)));
          });
        }
        if (!total) total = 60;
        timers.schedule(function () {
          if (!running || running !== token) return;
          running = null;
          stopAllAnimations();
          phase = 'before';
          updatePhaseUi();
          setAnimState(root, 'idle');
          drawLinks();
          setStatus(statusIdle());
          if (emit !== false) emitSettle();
        }, total + 55);
        return view;
      }

      function applyImmediate(targetPhase, emit) {
        if (destroyed) return view;
        cancelMotion();
        phase = targetPhase;
        updatePhaseUi();
        drawLinks();
        setAnimState(root, 'idle');
        setStatus(statusIdle());
        if (emit !== false) emitSettle();
        return view;
      }

      function rebuildContent() {
        if (destroyed) return;
        core.clear(root);
        root.setAttribute('aria-label', label);
        var words = modeWords();
        root.setAttribute('data-mode', mode);
        var header = core.el('div', 'nviz-split-merge__header');
        var badge = core.el('span', 'nviz-split-merge__badge');
        badge.textContent = words.badge;
        var hint = core.el('span', 'nviz-split-merge__hint');
        hint.textContent = '来源与结果同时保留，由连线对应';
        header.appendChild(badge);
        header.appendChild(hint);
        var mappingEl = core.el('p', 'nviz-split-merge__mapping');
        mappingEl.textContent = mappingText();
        stage = core.el('div', 'nviz-split-merge__stage');
        var lanes = core.el('div', 'nviz-split-merge__lanes');

        beforeLane = core.el('section', 'nviz-split-merge__lane nviz-split-merge__lane--before');
        var beforeTitle = core.el('h4', 'nviz-split-merge__lane-title');
        beforeTitle.textContent = words.before;
        var beforeCount = core.el('span', 'nviz-split-merge__lane-count');
        beforeCount.textContent = String(beforeItems.length) + ' 个';
        beforeTitle.appendChild(beforeCount);
        beforeList = core.el('ul', 'nviz-split-merge__cards');
        beforeList.setAttribute('aria-label', words.before + '对象');
        beforeLane.appendChild(beforeTitle);
        beforeLane.appendChild(beforeList);

        afterLane = core.el('section', 'nviz-split-merge__lane nviz-split-merge__lane--after');
        var afterTitle = core.el('h4', 'nviz-split-merge__lane-title');
        afterTitle.textContent = words.after;
        var afterCount = core.el('span', 'nviz-split-merge__lane-count');
        afterCount.textContent = String(afterItems.length) + ' 个';
        afterTitle.appendChild(afterCount);
        afterList = core.el('ul', 'nviz-split-merge__cards');
        afterList.setAttribute('aria-label', words.after + '对象');
        emptyEl = core.el('p', 'nviz-split-merge__lane-empty');
        emptyEl.textContent = words.empty;
        afterLane.appendChild(afterTitle);
        afterLane.appendChild(afterList);
        afterLane.appendChild(emptyEl);

        lanes.appendChild(beforeLane);
        lanes.appendChild(afterLane);
        svg = svgElement('svg', 'nviz-split-merge__links');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        stage.appendChild(lanes);
        stage.appendChild(svg);
        statusEl = core.el('p', 'nviz-split-merge__status');
        statusEl.setAttribute('role', 'status');
        statusEl.setAttribute('aria-live', 'polite');
        srList = core.el('ul', 'hnv-visually-hidden nviz-split-merge__mapping-sr');
        root.appendChild(header);
        root.appendChild(mappingEl);
        root.appendChild(stage);
        root.appendChild(statusEl);
        root.appendChild(srList);

        beforeNodes = {};
        afterNodes = {};
        beforeItems.forEach(function (item, index) {
          var node = makeCard(item, 'before');
          node.setAttribute('aria-posinset', String(index + 1));
          node.setAttribute('aria-setsize', String(beforeItems.length));
          beforeList.appendChild(node);
          beforeNodes[item.id] = node;
        });
        afterItems.forEach(function (item, index) {
          var node = makeCard(item, 'after');
          node.setAttribute('aria-posinset', String(index + 1));
          node.setAttribute('aria-setsize', String(afterItems.length));
          afterList.appendChild(node);
          afterNodes[item.id] = node;
        });
        renderMappingScreenReader();
        updatePhaseUi();
        setStatus(statusIdle());
        drawLinks();
      }

      function sameItems(a, b) {
        if (a.length !== b.length) return false;
        for (var i = 0; i < a.length; i += 1) {
          if (a[i].id !== b[i].id || a[i].label !== b[i].label) return false;
        }
        return true;
      }

      function sameLinks(a, b) {
        if (a.length !== b.length) return false;
        for (var i = 0; i < a.length; i += 1) {
          if (a[i].from !== b[i].from || a[i].to !== b[i].to) return false;
        }
        return true;
      }

      /* play/reset 只差目标阶段与动画函数；动画中再次操作直接落定最新目标。 */
      function goToPhase(targetPhase, opts, runAnimation) {
        if (destroyed) return view;
        var animate = shouldAnimate(core, animateDefault, opts && opts.animate);
        if (running) {
          applyImmediate(targetPhase, true);
          return view;
        }
        if (phase === targetPhase) return view;
        phase = targetPhase;
        if (!animate) {
          applyImmediate(targetPhase, true);
          return view;
        }
        runAnimation(true, true);
        return view;
      }

      var view = {
        el: root,
        play: function (opts) {
          return goToPhase('after', opts, runAfterAnimation);
        },
        reset: function (opts) {
          return goToPhase('before', opts, runBeforeAnimation);
        },
        replay: function (opts) {
          if (destroyed) return view;
          var animate = shouldAnimate(core, animateDefault, opts && opts.animate);
          cancelMotion();
          phase = 'before';
          updatePhaseUi();
          drawLinks();
          setStatus('重看：先呈现变化前状态。');
          if (!animate) {
            applyImmediate('after', true);
            return view;
          }
          var token = {};
          running = token;
          setAnimState(root, 'waiting');
          timers.schedule(function () {
            if (!running || running !== token) return;
            phase = 'after';
            runAfterAnimation(true, true);
          }, holdMs);
          return view;
        },
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return view;
          cancelMotion();
          var prevMode = mode;
          var prevBefore = beforeItems;
          var prevAfter = afterItems;
          var prevLinks = links;
          if (own(patch, 'mode')) mode = patch.mode === 'merge' ? 'merge' : 'split';
          if (own(patch, 'label')) {
            label = text(patch.label) || (mode === 'merge' ? '合并关系' : '拆分关系');
            root.setAttribute('aria-label', label);
          }
          if (own(patch, 'before')) beforeItems = normalizeObjects(patch.before, 'before');
          if (own(patch, 'after')) afterItems = normalizeObjects(patch.after, 'after');
          if (own(patch, 'links') || own(patch, 'mode') || own(patch, 'before') || own(patch, 'after')) {
            links = normalizeLinks(own(patch, 'links') ? patch.links : []);
          }
          if (own(patch, 'animate')) animateDefault = patch.animate !== false;
          if (own(patch, 'onSettle')) onSettle = typeof patch.onSettle === 'function' ? patch.onSettle : null;
          var structural = mode !== prevMode ||
            !sameItems(beforeItems, prevBefore) ||
            !sameItems(afterItems, prevAfter) ||
            !sameLinks(links, prevLinks);
          phase = 'before';
          if (structural) {
            buildMaps();
            rebuildContent();
            return view;
          }
          /* 只更新开关/回调/名称时不重建卡片，保留 getTarget 节点身份。 */
          updatePhaseUi();
          setStatus(statusIdle());
          return view;
        },
        getState: function () { return snapshot(); },
        getTarget: function (id) {
          var key = String(id);
          if (afterNodes[key]) return afterNodes[key];
          if (beforeNodes[key]) return beforeNodes[key];
          return null;
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          cancelMotion();
          if (typeof stopResize === 'function') stopResize();
          stopResize = null;
          beforeNodes = {};
          afterNodes = {};
          root.remove();
        }
      };

      links = normalizeLinks(config.links);
      buildMaps();
      host.appendChild(root);
      motionEase = shared.explainEase(root);
      rebuildContent();
      if (core.onResize && typeof core.onResize === 'function') {
        stopResize = core.onResize(root, function () {
          if (destroyed) return;
          if (running) return;
          drawLinks();
        });
      }
      return view;
    }
  };
})(window);

/* ---- source: src/viz/mechanisms-replace-reveal.js ---- */
/*!
 * HTML 笔记 · 可复用变化机制 M04 · NoteViz.ReplaceReveal
 * 范围：同一对象外框内替换值或展开内部说明，保持对象身份与上缘位置；
 *       公开到 window.NoteViz.ReplaceReveal。
 * 依赖：NoteCore（core.js、motion.js）与 src/viz/mechanisms.js（内部共享工具，须先加载）。
 * 内容一律按纯文本写入；没有 onSettle 公共回调。
 */
(function (global) {
  'use strict';

  var NoteViz = global.NoteViz = global.NoteViz || {};
  var VERSION = '1.0.0';

  function requireShared() {
    var internals = global.NoteVizInternals && global.NoteVizInternals.mechanisms;
    if (!internals) {
      throw new Error('NoteViz.ReplaceReveal 需要先加载 src/viz/mechanisms.js（内部共享工具）。');
    }
    return internals;
  }

  function normalizeDetailValue(value) {
    return value == null ? '' : String(value);
  }

  NoteViz.ReplaceReveal = {
    version: VERSION,
    mount: function (host, options) {
      var shared = requireShared();
      var core = shared.requireCore();
      shared.requireHost(core, host);
      var own = shared.own;
      var text = shared.text;
      var displayText = shared.displayText;
      var copyObject = shared.copyObject;
      var shouldAnimate = shared.shouldAnimate;
      var setAnimState = shared.setAnimState;

      var config = options && typeof options === 'object' ? options : {};
      var destroyed = false;
      var mode = config.mode === 'reveal' ? 'reveal' : 'replace';
      var before = null;
      var after = null;
      var animateDefault = config.animate !== false;
      var phase = 'before';
      var running = false;
      var motion = shared.createMotionBag(core);
      var timers = shared.createTimers(function () { return !destroyed; });
      var motionDuration = shared.explainMs(core);
      var motionEase = '';
      var holdMs = Math.max(190, Math.min(330, Math.round(motionDuration * 0.48)));

      var root = core.el('section', 'nviz-replace-reveal');
      root.setAttribute('role', 'group');
      root.setAttribute('data-mode', mode);
      root.setAttribute('data-phase', 'before');
      root.setAttribute('data-anim', 'idle');
      var frame = core.el('div', 'nviz-replace-reveal__frame');
      var header = core.el('div', 'nviz-replace-reveal__header');
      var identity = core.el('span', 'nviz-replace-reveal__identity');
      identity.textContent = '同一对象';
      var headingWrap = core.el('div', 'nviz-replace-reveal__heading');
      var labelEl = core.el('h4', 'nviz-replace-reveal__label');
      var labelId = core.uid('nviz-replace-reveal-label');
      labelEl.id = labelId;
      var badge = core.el('span', 'nviz-replace-reveal__badge');
      headingWrap.appendChild(identity);
      headingWrap.appendChild(labelEl);
      header.appendChild(headingWrap);
      header.appendChild(badge);

      var valueBox = core.el('div', 'nviz-replace-reveal__value-box');
      var valueKicker = core.el('span', 'nviz-replace-reveal__value-kicker');
      valueKicker.textContent = '当前值';
      var valueEl = core.el('span', 'nviz-replace-reveal__value');
      valueBox.appendChild(valueKicker);
      valueBox.appendChild(valueEl);

      var compare = core.el('div', 'nviz-replace-reveal__compare');
      var compareBeforeLabel = core.el('span', 'nviz-replace-reveal__compare-label');
      compareBeforeLabel.textContent = '替换前';
      var compareBeforeValue = core.el('span', 'nviz-replace-reveal__compare-value nviz-replace-reveal__compare-value--before');
      var compareArrow = core.el('span', 'nviz-replace-reveal__compare-arrow');
      compareArrow.setAttribute('aria-hidden', 'true');
      compareArrow.textContent = '→';
      var compareAfterLabel = core.el('span', 'nviz-replace-reveal__compare-label');
      compareAfterLabel.textContent = '替换后';
      var compareAfterValue = core.el('span', 'nviz-replace-reveal__compare-value nviz-replace-reveal__compare-value--after');
      compare.appendChild(compareBeforeLabel);
      compare.appendChild(compareBeforeValue);
      compare.appendChild(compareArrow);
      compare.appendChild(compareAfterLabel);
      compare.appendChild(compareAfterValue);

      var detailClip = core.el('div', 'nviz-replace-reveal__detail-clip');
      detailClip.setAttribute('aria-hidden', 'true');
      var detailPanel = core.el('div', 'nviz-replace-reveal__detail-panel');
      detailPanel.setAttribute('role', 'region');
      detailPanel.setAttribute('aria-label', '对象内部说明');
      var detailHeading = core.el('span', 'nviz-replace-reveal__detail-title');
      detailHeading.textContent = '内部';
      var detailText = core.el('p', 'nviz-replace-reveal__detail-text');
      var detailPrior = core.el('p', 'nviz-replace-reveal__detail-prior');
      detailPanel.appendChild(detailHeading);
      detailPanel.appendChild(detailText);
      detailPanel.appendChild(detailPrior);
      detailClip.appendChild(detailPanel);

      var statusEl = core.el('p', 'nviz-replace-reveal__status');
      statusEl.setAttribute('role', 'status');
      statusEl.setAttribute('aria-live', 'polite');

      root.setAttribute('aria-labelledby', labelId);
      root.appendChild(frame);
      root.appendChild(statusEl);
      frame.appendChild(header);
      frame.appendChild(valueBox);
      frame.appendChild(compare);
      frame.appendChild(detailClip);

      function normalizeSide(raw, fallback) {
        var source = raw && typeof raw === 'object' ? raw : {};
        var use = fallback || {};
        return {
          id: own(source, 'id') ? text(source.id) : (own(use, 'id') ? text(use.id) : 'object'),
          label: own(source, 'label') ? text(source.label) : (own(use, 'label') ? text(use.label) : ''),
          value: own(source, 'value') ? normalizeDetailValue(source.value) : (own(use, 'value') ? normalizeDetailValue(use.value) : ''),
          detail: own(source, 'detail') ? normalizeDetailValue(source.detail) : (own(use, 'detail') ? normalizeDetailValue(use.detail) : '')
        };
      }

      function normalizePair() {
        var beforeInput = config.before && typeof config.before === 'object' ? config.before : {};
        var afterInput = config.after && typeof config.after === 'object' ? config.after : beforeInput;
        before = normalizeSide(beforeInput, null);
        after = normalizeSide(afterInput, before);
        if (!after.id) after.id = before.id;
        if (!before.label && after.label) before.label = after.label;
      }

      normalizePair();
      root.setAttribute('aria-label', (mode === 'replace' ? '替换演示' : '局部展开演示') + '，' + displayText(after.label || before.label));

      function statusFor(targetPhase) {
        if (targetPhase === 'after') {
          if (mode === 'replace') {
            return '已替换：' + displayText(before.value) + ' → ' + displayText(after.value) +
              '。同一对象仍在原位置，可对照替换前值。';
          }
          return '已展开内部；对象上缘保持原位，可对照展开前状态。';
        }
        if (mode === 'replace') {
          return '替换前：' + displayText(before.value) + '。';
        }
        return '当前值：' + displayText(before.value) + '。内部未展开。';
      }

      function activeLabel(targetPhase) {
        return displayText(targetPhase === 'after' ? (after.label || before.label) : before.label);
      }

      function activeValue(targetPhase) {
        return displayText(targetPhase === 'after' ? after.value : before.value);
      }

      function renderText(targetPhase, valueOverride) {
        labelEl.textContent = activeLabel(targetPhase);
        root.setAttribute('aria-label', (mode === 'replace' ? '替换演示' : '局部展开演示') + '，' + activeLabel(targetPhase));
        badge.textContent = mode === 'replace'
          ? (targetPhase === 'after' ? '替换后' : '替换前')
          : (targetPhase === 'after' ? '已展开' : '展开前');
        valueEl.textContent = valueOverride == null ? activeValue(targetPhase) : displayText(valueOverride);
        compareBeforeValue.textContent = displayText(before.value);
        compareAfterValue.textContent = displayText(after.value);
        detailText.textContent = displayText(after.detail);
        detailPrior.textContent = '展开前：值 ' + displayText(before.value) +
          (before.detail ? '，内部 ' + displayText(before.detail) : '，内部未显示');
        frame.setAttribute('aria-label', '对象 ' + activeLabel(targetPhase) + '，当前值 ' + valueEl.textContent);
      }

      function updatePhaseUi(targetPhase) {
        root.setAttribute('data-mode', mode);
        root.setAttribute('data-phase', targetPhase);
        var detailVisible = targetPhase === 'after' && mode === 'reveal';
        detailClip.setAttribute('aria-hidden', detailVisible ? 'false' : 'true');
      }

      function snapshot() {
        return {
          mode: mode,
          phase: phase,
          before: copyObject(before),
          after: copyObject(after),
          value: valueEl.textContent,
          label: labelEl.textContent,
          running: !!running
        };
      }

      function stopAnimations() {
        motion.cancelAll();
        try { core.motion.stop(valueEl); } catch (error) {}
        try { core.motion.stop(detailClip); } catch (error) {}
        try { core.motion.stop(detailPanel); } catch (error) {}
        try { core.motion.stop(compare); } catch (error) {}
        detailClip.style.height = '';
        detailClip.style.opacity = '';
        detailPanel.style.opacity = '';
        detailPanel.style.transform = '';
        compare.style.opacity = '';
        compare.style.transform = '';
        valueEl.style.opacity = '';
        valueEl.style.transform = '';
      }

      function cancelMotion() {
        timers.clear();
        stopAnimations();
        running = false;
        setAnimState(root, 'idle');
      }

      /* 无动画地落到目标阶段：play/reset 的 animate:false、减少动效与动画收尾共用。 */
      function applyPhase(targetPhase) {
        if (destroyed) return view;
        cancelMotion();
        phase = targetPhase;
        updatePhaseUi(targetPhase);
        renderText(targetPhase);
        statusEl.textContent = statusFor(targetPhase);
        return view;
      }

      function movementDuration() {
        return Math.round(motionDuration * 0.9);
      }

      function animateReplace(targetPhase) {
        var finalValue = targetPhase === 'after' ? after.value : before.value;
        var startValue = targetPhase === 'after' ? before.value : after.value;
        var duration = Math.max(280, movementDuration());
        cancelMotion();
        phase = targetPhase;
        running = true;
        setAnimState(root, 'running');
        updatePhaseUi(targetPhase === 'after' ? 'before' : 'after');
        renderText(targetPhase === 'after' ? 'before' : 'after', startValue);
        statusEl.textContent = targetPhase === 'after' ? '正在替换值…' : '正在回到替换前…';
        motion.play(valueEl, [
          { opacity: '1', transform: 'translate3d(0,0,0)' },
          { opacity: '0', transform: 'translate3d(0,-0.26em,0)', offset: 0.44 },
          { opacity: '0', transform: 'translate3d(0,0.26em,0)', offset: 0.56 },
          { opacity: '1', transform: 'translate3d(0,0,0)' }
        ], {
          duration: duration,
          easing: motionEase,
          id: 'nviz-replace-value'
        });
        var switched = false;
        timers.schedule(function () {
          if (destroyed || !running) return;
          switched = true;
          valueEl.textContent = displayText(finalValue);
        }, Math.round(duration * 0.5));
        timers.schedule(function () {
          if (destroyed || !running) return;
          if (!switched) valueEl.textContent = displayText(finalValue);
          applyPhase(targetPhase);
        }, duration + 45);
      }

      function animateRevealExpand() {
        var duration = movementDuration();
        cancelMotion();
        phase = 'after';
        running = true;
        setAnimState(root, 'running');
        updatePhaseUi('after');
        renderText('after');
        statusEl.textContent = '正在展开内部…';
        detailClip.style.height = 'auto';
        var fullHeight = detailClip.getBoundingClientRect().height;
        detailClip.style.height = '0px';
        detailClip.style.opacity = '0.35';
        detailPanel.style.opacity = '0';
        detailPanel.style.transform = 'translate3d(0,-6px,0)';
        // Force layout before starting the explicit height animation.
        detailClip.getBoundingClientRect();
        motion.play(detailClip, [
          { height: '0px', opacity: '0.35' },
          { height: fullHeight + 'px', opacity: '1' }
        ], {
          duration: duration,
          easing: motionEase,
          id: 'nviz-reveal-height'
        });
        motion.play(detailPanel, [
          { opacity: '0', transform: 'translate3d(0,-6px,0)' },
          { opacity: '1', transform: 'translate3d(0,0,0)' }
        ], {
          duration: Math.round(duration * 0.8),
          delay: Math.round(duration * 0.16),
          easing: motionEase,
          id: 'nviz-reveal-inner'
        });
        timers.schedule(function () {
          if (destroyed || !running) return;
          applyPhase('after');
        }, duration + 45);
      }

      function animateRevealCollapse() {
        var duration = movementDuration();
        cancelMotion();
        phase = 'before';
        running = true;
        updatePhaseUi('after');
        setAnimState(root, 'running');
        statusEl.textContent = '正在收起内部…';
        detailClip.style.height = 'auto';
        var currentHeight = detailClip.getBoundingClientRect().height;
        detailClip.style.height = currentHeight + 'px';
        detailClip.getBoundingClientRect();
        motion.play(detailClip, [
          { height: currentHeight + 'px', opacity: '1' },
          { height: '0px', opacity: '0.2' }
        ], {
          duration: duration,
          easing: motionEase,
          id: 'nviz-reveal-collapse'
        });
        motion.play(detailPanel, [
          { opacity: '1', transform: 'translate3d(0,0,0)' },
          { opacity: '0', transform: 'translate3d(0,-4px,0)' }
        ], {
          duration: Math.round(duration * 0.7),
          easing: motionEase,
          id: 'nviz-reveal-inner-out'
        });
        timers.schedule(function () {
          if (destroyed || !running) return;
          applyPhase('before');
        }, duration + 45);
      }

      function playAfter() {
        if (mode === 'replace') animateReplace('after');
        else animateRevealExpand();
      }

      function playBefore() {
        if (mode === 'replace') animateReplace('before');
        else animateRevealCollapse();
      }

      /* play/reset 只差目标阶段与动画函数；动画中再次操作直接落定最新目标。 */
      function changePhase(targetPhase, opts, runAnimation) {
        if (destroyed) return view;
        var animate = shouldAnimate(core, animateDefault, opts && opts.animate);
        if (running) {
          applyPhase(targetPhase);
          return view;
        }
        if (phase === targetPhase) return view;
        if (!animate) {
          applyPhase(targetPhase);
          return view;
        }
        runAnimation();
        return view;
      }

      var view = {
        el: root,
        play: function (opts) {
          return changePhase('after', opts, playAfter);
        },
        reset: function (opts) {
          return changePhase('before', opts, playBefore);
        },
        replay: function (opts) {
          if (destroyed) return view;
          var animate = shouldAnimate(core, animateDefault, opts && opts.animate);
          cancelMotion();
          phase = 'before';
          updatePhaseUi('before');
          renderText('before');
          setAnimState(root, 'waiting');
          statusEl.textContent = '重看：先呈现变化前状态。';
          if (!animate) {
            applyPhase('after');
            return view;
          }
          var token = {};
          running = token;
          timers.schedule(function () {
            if (destroyed || running !== token) return;
            running = false;
            playAfter();
          }, holdMs);
          return view;
        },
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return view;
          cancelMotion();
          if (own(patch, 'mode')) mode = patch.mode === 'reveal' ? 'reveal' : 'replace';
          if (own(patch, 'before')) config.before = patch.before;
          if (own(patch, 'after')) config.after = patch.after;
          if (own(patch, 'animate')) animateDefault = patch.animate !== false;
          normalizePair();
          phase = 'before';
          updatePhaseUi('before');
          renderText('before');
          statusEl.textContent = statusFor('before');
          return view;
        },
        getState: function () { return snapshot(); },
        getTarget: function (key) {
          if (destroyed) return null;
          if (key === 'object') return frame;
          if (key === 'detail') return detailPanel;
          return null;
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          cancelMotion();
          root.remove();
        }
      };

      host.appendChild(root);
      motionEase = shared.explainEase(root);
      updatePhaseUi('before');
      renderText('before');
      statusEl.textContent = statusFor('before');
      return view;
    }
  };
})(window);
