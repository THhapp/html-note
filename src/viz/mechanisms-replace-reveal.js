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
