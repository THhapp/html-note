/* NoteBlocks B05 — CodeTrace.
 * Plain JavaScript; composes public NoteBlocks.StepPlayer, NoteUI.CodeBlock,
 * NoteUI.DataObject, NoteUI.Badge and NoteUI.Notice.
 * Code is always pre-written text: this file never evaluates or executes it.
 * Loads after src/blocks/shared.js (internal helpers, not a public entry).
 * No network, no HTML parsing, no automatic playback. */
(function (global) {
  'use strict';

  var NoteBlocks = global.NoteBlocks = global.NoteBlocks || {};

  var shared = global.NoteBlocksInternals;
  if (!shared) {
    throw new Error('NoteBlocks 组合块需要先加载 src/blocks/shared.js（内部共享文件）。');
  }
  var ui = shared.ui;
  var own = shared.own;
  var text = shared.text;
  var isNode = shared.isNode;
  var make = shared.make;
  var uniqueId = shared.uniqueId;
  var validateHost = shared.validateHost;
  var requireComponents = shared.requireComponents;
  var safeDestroy = shared.safeDestroy;
  var stepArray = shared.stepArray;
  var stepWrappers = shared.stepWrappers;
  function variableName(variable, index) {
    if (variable && variable.name != null && text(variable.name) !== '') return text(variable.name);
    return 'var-' + index;
  }

  function variableLabel(variable, index) {
    if (variable && variable.label != null && text(variable.label) !== '') return text(variable.label);
    return variableName(variable, index);
  }

  function valueWithUnit(variable) {
    if (!variable) return '';
    if (isNode(variable.value)) return variable.value;
    var value = variable.value == null ? '' : text(variable.value);
    var unit = variable.unit == null ? '' : text(variable.unit).trim();
    return unit ? value + ' ' + unit : value;
  }

  function normaliseStepLabel(labels) {
    if (!labels || typeof labels !== 'object') return null;
    return labels;
  }

  function stepIndex(value, steps) {
    if (!steps.length || value == null) return 0;
    if (typeof value === 'string') {
      var wanted = text(value);
      for (var index = 0; index < steps.length; index += 1) {
        if (steps[index] && steps[index].id != null && text(steps[index].id) === wanted) return index;
      }
    }
    if (typeof value === 'number' || (typeof value === 'string' && /^-?\d+$/.test(value.trim()))) {
      var number = Math.trunc(Number(value));
      if (isFinite(number)) return Math.max(0, Math.min(steps.length - 1, number));
    }
    return 0;
  }

  NoteBlocks.CodeTrace = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host, 'NoteBlocks.CodeTrace');
      requireComponents('NoteBlocks.CodeTrace', ['NoteUI.CodeBlock', 'NoteUI.DataObject', 'NoteUI.Badge', 'NoteUI.Notice', 'NoteBlocks.StepPlayer']);

      var UI = ui();
      var input = options || {};
      var state = {
        code: input.code == null ? '' : text(input.code),
        language: input.language == null ? '' : text(input.language),
        title: input.title == null ? '' : input.title,
        steps: stepArray(input.steps),
        current: input.current,
        labels: normaliseStepLabel(input.labels),
        onStep: typeof input.onStep === 'function' ? input.onStep : null,
        maxWidth: input.maxWidth == null ? null : input.maxWidth,
        label: input.label == null ? '' : text(input.label)
      };
      var destroyed = false;
      var player = null;
      var refs = { code: null, body: null, vars: Object.create(null), stepId: null };

      function cleanupRefs() {
        refs.code = null;
        refs.body = null;
        refs.vars = Object.create(null);
        refs.stepId = null;
      }

      function render(step, context) {
        cleanupRefs();
        var wrap = make('div', 'nblk-codetrace__layout');
        var codeHost = make('div', 'nblk-codetrace__code');
        var side = make('div', 'nblk-codetrace__side');
        var bodyId = uniqueId('nblk-codetrace-body');
        wrap.id = bodyId;
        wrap.setAttribute('data-step-id', step && step.id != null ? text(step.id) : '');
        refs.body = wrap;
        refs.stepId = step && step.id != null ? text(step.id) : null;

        var codeInstance = UI.CodeBlock.mount(codeHost, {
          code: state.code,
          language: state.language,
          title: '',
          lineNumbers: true,
          highlight: step ? step.highlight : null,
          copy: true,
          maxHeight: 'min(26rem, 62vh)'
        });
        refs.code = codeInstance.el;

        var sideTitle = make('h3', 'nblk-codetrace__side-title', '变量快照');
        side.appendChild(sideTitle);

        var variables = step && Array.isArray(step.variables) ? step.variables : [];
        var changed = variables.map(function (variable, index) {
          return { variable: variable, index: index };
        }).filter(function (entry) {
          return Boolean(entry.variable && entry.variable.changed);
        });
        var summary = make('div', 'nblk-codetrace__change-summary');
        var summaryBadge = UI.Badge.mount(summary, {
          label: changed.length
            ? '本步变化：' + changed.map(function (entry) {
              return variableLabel(entry.variable, entry.index);
            }).join('、')
            : '本步无变量变化',
          tone: changed.length ? 'warning' : 'neutral'
        });
        var summaryText = make('span', 'nblk-codetrace__change-text',
          changed.length
            ? '变化字段以文字标记和更新后的快照值同时呈现。'
            : '变量值仍为当前停点的完整快照。');
        summary.appendChild(summaryText);
        side.appendChild(summary);

        var variableList = make('div', 'nblk-codetrace__variables');
        var dataInstances = [];
        var badgeInstances = [summaryBadge];

        if (!variables.length) {
          variableList.appendChild(make('p', 'nblk-codetrace__empty', '本停点未提供变量。'));
        } else {
          variables.forEach(function (variable, index) {
            var card = make('div', 'nblk-codetrace__variable');
            var cardHead = make('div', 'nblk-codetrace__variable-head');
            if (variable && variable.changed) {
              var badge = UI.Badge.mount(cardHead, { label: '本步变化', tone: 'warning' });
              badgeInstances.push(badge);
            }
            card.appendChild(cardHead);
            var name = variableName(variable, index);
            var label = variableLabel(variable, index);
            var unit = variable && variable.unit != null ? text(variable.unit).trim() : '';
            var caption = variable && variable.changed
              ? '相对上一停点发生变化。'
              : '';
            if (unit && isNode(variable && variable.value)) {
              caption = [caption, '单位：' + unit].filter(Boolean).join(' ');
            }
            var instance = UI.DataObject.mount(card, {
              label: label,
              value: valueWithUnit(variable),
              caption: caption,
              changed: Boolean(variable && variable.changed)
            });
            dataInstances.push(instance);
            refs.vars[name] = card;
            variableList.appendChild(card);
          });
        }
        side.appendChild(variableList);

        var readOnlyNote = make('p', 'nblk-codetrace__readonly',
          '代码为宿主提供的预置文本，只读显示，不会执行。');
        side.appendChild(readOnlyNote);

        var extra = make('div', 'nblk-codetrace__extra');
        var notice = null;
        if (step && step.explanation != null && text(step.explanation).trim()) {
          notice = UI.Notice.mount(extra, {
            title: '本步说明',
            content: step.explanation,
            tone: 'neutral'
          });
        }

        wrap.append(codeHost, side, extra);
        context.stageEl.appendChild(wrap);

        return function cleanup() {
          safeDestroy(notice);
          dataInstances.forEach(safeDestroy);
          badgeInstances.forEach(safeDestroy);
          safeDestroy(codeInstance);
          cleanupRefs();
          wrap.remove();
        };
      }

      var labels = state.labels;
      player = NoteBlocks.StepPlayer.mount(host, {
        steps: stepWrappers(state.steps),
        render: render,
        initialIndex: stepIndex(state.current, state.steps),
        labels: labels,
        onStep: function (index, wrapper, event) {
          if (destroyed) return;
          if (typeof state.onStep === 'function') {
            state.onStep(index, wrapper && wrapper.state ? wrapper.state : null, event);
          }
        },
        title: state.title,
        maxWidth: state.maxWidth,
        label: state.label || '代码与状态跟踪'
      });
      player.el.classList.add('nblk-codetrace');

      function visibleStep() {
        if (destroyed || !player) return null;
        var wrapper = player.getStep();
        return wrapper && wrapper.state ? wrapper.state : null;
      }

      function getTarget(id) {
        if (destroyed || id == null) return null;
        var key = text(id);
        if (key === 'code') return refs.code;
        if (key.indexOf('var:') === 0) return refs.vars[key.slice(4)] || null;
        if (refs.stepId != null && key === refs.stepId) return refs.body;
        return null;
      }

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        if (own(patch, 'code')) state.code = patch.code == null ? '' : text(patch.code);
        if (own(patch, 'language')) state.language = patch.language == null ? '' : text(patch.language);
        if (own(patch, 'title')) state.title = patch.title == null ? '' : patch.title;
        if (own(patch, 'steps')) state.steps = stepArray(patch.steps);
        if (own(patch, 'current')) state.current = patch.current;
        if (own(patch, 'labels')) state.labels = normaliseStepLabel(patch.labels);
        if (own(patch, 'onStep')) state.onStep = typeof patch.onStep === 'function' ? patch.onStep : null;
        if (own(patch, 'maxWidth')) state.maxWidth = patch.maxWidth;
        if (own(patch, 'label')) state.label = patch.label == null ? '' : text(patch.label);

        var stepsChanged = own(patch, 'steps') || own(patch, 'code') || own(patch, 'language');
        var playerPatch = {
          title: state.title,
          maxWidth: state.maxWidth,
          label: state.label || '代码与状态跟踪'
        };
        if (stepsChanged) playerPatch.steps = stepWrappers(state.steps);
        if (own(patch, 'labels')) playerPatch.labels = state.labels;
        player.update(playerPatch);

        if (own(patch, 'current')) {
          if (state.steps.length) {
            player.go(stepIndex(state.current, state.steps));
          }
        }
      }

      function destroy() {
        if (destroyed) return;
        destroyed = true;
        cleanupRefs();
        safeDestroy(player);
        player = null;
      }

      return {
        el: player.el,
        go: function (index) { if (!destroyed) player.go(index); },
        next: function () { if (!destroyed) player.next(); },
        prev: function () { if (!destroyed) player.prev(); },
        replay: function () { if (!destroyed) player.replay(); },
        reset: function () { if (!destroyed) player.reset(); },
        getStep: visibleStep,
        getTarget: getTarget,
        update: update,
        destroy: destroy
      };
    }
  };
})(window);
