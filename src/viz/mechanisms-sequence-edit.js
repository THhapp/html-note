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
