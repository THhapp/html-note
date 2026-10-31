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
