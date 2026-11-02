/* NoteBlocks B02 — StepPlayer（稳定状态步进）。
 * B01 DemoStage 已拆到 src/blocks/demo-stage.js；本文件只保留 B02 及其中私有 helper。
 * Depends on: 先加载 src/blocks/shared.js，再加载 src/blocks/demo-stage.js
 * （StepPlayer 在 mount 时使用 NoteBlocks.DemoStage）。
 * 不复制 DemoStage 实现，也不另造播放器；经典脚本，无模块 / 无网络 / 无 eval。 */
(function (global) {
  'use strict';

  var NoteBlocks = global.NoteBlocks = global.NoteBlocks || {};

  var shared = global.NoteBlocksInternals;
  if (!shared) {
    throw new Error('NoteBlocks 组合块需要先加载 src/blocks/shared.js（内部共享文件）。');
  }
  var core = shared.core;
  var ui = shared.ui;
  var own = shared.own;
  var text = shared.text;
  var make = shared.make;
  var clear = shared.clear;
  var validateHost = shared.validateHost;
  var requireComponents = shared.requireComponents;

  /* =====================================================================
   * B02 — StepPlayer
   * ===================================================================== */

  var STEP_LABELS = {
    prev: '上一步',
    next: '下一步',
    jump: '跳到停点',
    replay: '重看',
    reset: '重来',
    empty: '尚未提供停点。'
  };

  function stepNumber(value, count, fallback) {
    var number = typeof value === 'number' ? value : Number(value);
    if (!isFinite(number)) number = fallback;
    number = Math.trunc(number);
    if (!count) return 0;
    return Math.max(0, Math.min(count - 1, number));
  }

  function mergeStepLabels(current, patch) {
    var next = Object.assign({}, STEP_LABELS, current || {});
    if (patch && typeof patch === 'object') {
      Object.keys(patch).forEach(function (key) {
        if (patch[key] != null && String(patch[key]) !== '') next[key] = patch[key];
      });
    }
    return next;
  }

  function readableError(error) {
    if (error && error.message) return text(error.message);
    if (error == null) return '宿主 render 未返回可显示的内容。';
    return text(error);
  }

  NoteBlocks.StepPlayer = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      requireComponents('NoteBlocks', ['NoteUI.Button', 'NoteUI.Stack', 'NoteUI.Inline']);
      if (!NoteBlocks.DemoStage || typeof NoteBlocks.DemoStage.mount !== 'function') {
        throw new Error('NoteBlocks.StepPlayer 需要先加载 NoteBlocks.DemoStage。');
      }
      var UI = ui();
      var C = core();
      var input = options || {};
      var state = {
        steps: Array.isArray(input.steps) ? input.steps.slice() : [],
        render: input.render,
        initialIndex: input.initialIndex == null ? 0 : input.initialIndex,
        labels: mergeStepLabels(null, input.labels),
        onStep: input.onStep,
        title: input.title,
        maxWidth: input.maxWidth,
        label: input.label
      };
      var destroyed = false;
      var index = stepNumber(state.initialIndex, state.steps.length, 0);
      state.initialIndex = index;
      var pendingCleanup = null;
      var lastCaption = null;
      var buttonHolder = make('div', 'nblk-step-player__button-holder');
      var eventBag = null;

      var stage = NoteBlocks.DemoStage.mount(host, {
        title: state.title || '',
        stage: '',
        caption: '',
        controls: [],
        maxWidth: state.maxWidth,
        label: state.label || '分步演示'
      });
      stage.el.classList.add('nblk-step-player');
      stage.el.setAttribute('data-step-count', String(state.steps.length));
      stage.el.setAttribute('data-step-index', String(index));

      function makeButton(label, variant, click) {
        return UI.Button.mount(buttonHolder, {
          label: label,
          variant: variant,
          disabled: true,
          onClick: click
        });
      }

      var prevButton = makeButton(state.labels.prev, 'secondary', function (event) {
        userMove(index - 1, event);
      });
      var nextButton = makeButton(state.labels.next, 'primary', function (event) {
        userMove(index + 1, event);
      });
      var replayButton = makeButton(state.labels.replay, 'quiet', function () {
        if (!destroyed) renderCurrent(true);
      });
      var resetButton = makeButton(state.labels.reset, 'quiet', function (event) {
        userMove(stepNumber(state.initialIndex, state.steps.length, 0), event, true);
      });

      var jumpWrap = make('label', 'nblk-step-player__jump');
      var jumpText = make('span', 'nblk-step-player__jump-label', state.labels.jump);
      var select = make('select', 'nblk-step-player__select');
      select.setAttribute('aria-label', state.labels.jump);
      jumpWrap.append(jumpText, select);

      stage.setControls([
        prevButton.el,
        nextButton.el,
        jumpWrap,
        replayButton.el,
        resetButton.el
      ]);

      function optionLabel(step, position) {
        var explicit = step && step.label != null ? text(step.label).trim() : '';
        if (explicit) return explicit;
        return '停点 ' + (position + 1);
      }

      function rebuildOptions() {
        var fragment = global.document.createDocumentFragment();
        if (!state.steps.length) {
          var emptyOption = make('option', '', state.labels.empty);
          emptyOption.value = '';
          emptyOption.disabled = true;
          fragment.appendChild(emptyOption);
        } else {
          state.steps.forEach(function (step, position) {
            var option = make('option', '', optionLabel(step, position));
            option.value = String(position);
            fragment.appendChild(option);
          });
        }
        select.replaceChildren(fragment);
        select.disabled = state.steps.length < 2;
        select.value = state.steps.length ? String(index) : '';
      }

      function syncControls() {
        var count = state.steps.length;
        var hasStep = count > 0;
        prevButton.update({ disabled: !hasStep || index <= 0 });
        nextButton.update({ disabled: !hasStep || index >= count - 1 });
        replayButton.update({ disabled: !hasStep });
        resetButton.update({ disabled: !hasStep });
        select.disabled = count < 2;
        select.value = hasStep ? String(index) : '';
      }

      function refreshControlLabels() {
        prevButton.update({ label: state.labels.prev });
        nextButton.update({ label: state.labels.next });
        replayButton.update({ label: state.labels.replay });
        resetButton.update({ label: state.labels.reset });
        jumpText.textContent = state.labels.jump;
        select.setAttribute('aria-label', state.labels.jump);
        rebuildOptions();
      }

      function disposeRender() {
        var cleanup = pendingCleanup;
        pendingCleanup = null;
        if (typeof cleanup === 'function') {
          try { cleanup(); } catch (error) {
            if (global.console && typeof global.console.error === 'function') {
              global.console.error('NoteBlocks.StepPlayer：render cleanup 失败。', error);
            }
          }
        }
        clear(stage.stageEl);
      }

      function showRenderError(step, error) {
        var box = make('div', 'nblk-step-player__error');
        box.setAttribute('role', 'alert');
        box.appendChild(make('p', 'nblk-step-player__error-title', '此停点无法显示'));
        box.appendChild(make('p', 'nblk-step-player__error-message',
          '宿主 render 执行失败：' + readableError(error)));
        box.appendChild(make('p', 'nblk-step-player__error-help',
          '可用“重看”重试；其他停点仍可切换。'));
        stage.stageEl.appendChild(box);
        if (global.console && typeof global.console.error === 'function') {
          global.console.error('NoteBlocks.StepPlayer：停点 ' + (index + 1) + ' 渲染失败。', error, step);
        }
      }

      function updateCaption() {
        var current = state.steps[index];
        var caption = current && current.caption != null ? text(current.caption) : '';
        if (caption !== lastCaption) {
          lastCaption = caption;
          stage.setCaption(caption);
        }
      }

      function renderCurrent(replay) {
        if (destroyed) return;
        var hasSteps = state.steps.length > 0;
        stage.el.setAttribute('data-step-count', String(state.steps.length));
        stage.el.setAttribute('data-step-index', String(hasSteps ? index : 0));

        disposeRender();
        if (!hasSteps) {
          index = 0;
          lastCaption = '';
          stage.setCaption('');
          var empty = make('p', 'nblk-step-player__empty', state.labels.empty);
          empty.setAttribute('role', 'status');
          stage.stageEl.appendChild(empty);
          syncControls();
          return;
        }

        index = stepNumber(index, state.steps.length, 0);
        stage.el.setAttribute('data-step-index', String(index));
        updateCaption();
        var step = state.steps[index];
        var renderFunction = state.render;
        if (typeof renderFunction !== 'function') {
          showRenderError(step, new TypeError('缺少 render 函数'));
        } else {
          try {
            var cleanup = renderFunction(step ? step.state : undefined, {
              index: index,
              replay: Boolean(replay),
              stageEl: stage.stageEl
            });
            if (typeof cleanup === 'function') pendingCleanup = cleanup;
          } catch (error) {
            disposeRender();
            showRenderError(step, error);
          }
        }
        syncControls();
      }

      function userMove(target, event, alwaysRender) {
        if (destroyed || !state.steps.length) return;
        var nextIndex = stepNumber(target, state.steps.length, index);
        var changed = nextIndex !== index;
        if (!changed && !alwaysRender) return;
        index = nextIndex;
        renderCurrent(false);
        if (changed && typeof state.onStep === 'function') {
          state.onStep(index, state.steps[index], event);
        }
      }

      function go(target) {
        if (destroyed || !state.steps.length) return;
        var number = typeof target === 'number' ? target : Number(target);
        if (!isFinite(number)) return;
        var nextIndex = stepNumber(number, state.steps.length, index);
        if (nextIndex === index) return;
        index = nextIndex;
        renderCurrent(false);
      }

      function next() {
        if (destroyed || index >= state.steps.length - 1) return;
        index += 1;
        renderCurrent(false);
      }

      function prev() {
        if (destroyed || index <= 0) return;
        index -= 1;
        renderCurrent(false);
      }

      function replay() {
        if (destroyed || !state.steps.length) return;
        renderCurrent(true);
      }

      function reset() {
        if (destroyed || !state.steps.length) return;
        index = stepNumber(state.initialIndex, state.steps.length, 0);
        renderCurrent(false);
      }

      function getStep() {
        if (destroyed) return null;
        return state.steps[index] || null;
      }

      function getState() {
        var step = getStep();
        return step ? step.state : null;
      }

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        var needsRender = false;
        var needsControls = false;
        var needsStageOptions = false;
        if (own(patch, 'steps')) {
          state.steps = Array.isArray(patch.steps) ? patch.steps.slice() : [];
          index = stepNumber(index, state.steps.length, 0);
          state.initialIndex = stepNumber(state.initialIndex, state.steps.length, 0);
          needsRender = true;
          needsControls = true;
        }
        if (own(patch, 'render')) {
          state.render = patch.render;
          needsRender = true;
        }
        if (own(patch, 'initialIndex')) {
          state.initialIndex = stepNumber(patch.initialIndex, state.steps.length, 0);
        }
        if (own(patch, 'labels')) {
          state.labels = mergeStepLabels(state.labels, patch.labels);
          needsControls = true;
        }
        if (own(patch, 'onStep')) state.onStep = patch.onStep;
        if (own(patch, 'title')) { state.title = patch.title; needsStageOptions = true; }
        if (own(patch, 'maxWidth')) { state.maxWidth = patch.maxWidth; needsStageOptions = true; }
        if (own(patch, 'label')) { state.label = patch.label; needsStageOptions = true; }
        if (needsStageOptions) {
          stage.update({
            title: state.title == null ? '' : state.title,
            maxWidth: state.maxWidth,
            label: state.label || '分步演示'
          });
        }
        if (needsRender) {
          renderCurrent(false);
        }
        if (needsControls) {
          refreshControlLabels();
          syncControls();
        }
      }

      function destroy() {
        if (destroyed) return;
        destroyed = true;
        disposeRender();
        if (eventBag) eventBag.clear();
        else select.removeEventListener('change', onSelectChange);
        try { prevButton.destroy(); } catch (error) { /* optional */ }
        try { nextButton.destroy(); } catch (error) { /* optional */ }
        try { replayButton.destroy(); } catch (error) { /* optional */ }
        try { resetButton.destroy(); } catch (error) { /* optional */ }
        try { stage.destroy(); } catch (error) { /* optional */ }
        buttonHolder.remove();
      }

      function onSelectChange(event) {
        if (destroyed) return;
        var target = Number(select.value);
        if (!isFinite(target) || target === index) return;
        userMove(target, event);
      }

      if (C.listeners) {
        eventBag = C.listeners(select);
        eventBag.on('change', onSelectChange);
      } else {
        select.addEventListener('change', onSelectChange);
      }

      rebuildOptions();
      renderCurrent(false);
      refreshControlLabels();
      syncControls();

      return {
        el: stage.el,
        go: go,
        next: next,
        prev: prev,
        replay: replay,
        reset: reset,
        getStep: getStep,
        getState: getState,
        update: update,
        destroy: destroy
      };
    }
  };
})(window);
