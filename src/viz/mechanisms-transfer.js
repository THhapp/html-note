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
