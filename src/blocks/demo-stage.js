/* NoteBlocks B01 — DemoStage（演示舞台）。
 * 从 src/blocks/stage.js 拆出；只组合公开组件（NoteUI.Stack/Inline/Button），不复制其标记。
 * Depends on: 先加载 src/blocks/shared.js（内部共享 helper），以及 core/legacy/ui-layout。
 * 不安装整页主题、不管理宿主放进舞台的子组件；B02 StepPlayer 仍留在 stage.js。
 * 经典脚本，无模块 / 无网络 / 无 eval。 */
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
  var isNode = shared.isNode;
  var make = shared.make;
  var clear = shared.clear;
  var setContent = shared.setContent;
  var uniqueId = shared.uniqueId;
  var validateHost = shared.validateHost;
  var requireComponents = shared.requireComponents;

  function cssLength(value) {
    if (typeof value === 'number' && isFinite(value)) return Math.max(0, value) + 'px';
    if (typeof value === 'string' && value.trim()) return value.trim();
    return '';
  }

  function resolveIcon(icon) {
    if (typeof icon !== 'string') return icon;
    var C = core();
    var name = icon.trim();
    if (!name || !C.icons || typeof C.icons.get !== 'function') return icon;
    var node = null;
    try { node = C.icons.get(name); } catch (error) { node = null; }
    return node || icon;
  }

  /* =====================================================================
   * B01 — DemoStage
   * ===================================================================== */

  NoteBlocks.DemoStage = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      requireComponents('NoteBlocks', ['NoteUI.Stack', 'NoteUI.Inline', 'NoteUI.Button']);
      var UI = ui();
      var input = options || {};
      var state = Object.assign({
        title: '',
        stage: undefined,
        caption: '',
        captionLabel: '',
        controls: [],
        maxWidth: null,
        minStageHeight: null,
        label: ''
      }, input);
      var destroyed = false;
      var buttonInstances = [];
      var titleId = uniqueId('nblk-demo-title');
      var captionId = uniqueId('nblk-demo-caption');

      var root = make('section', 'nblk-demo-stage');
      var stack = UI.Stack.mount(root, { gap: 'sm', align: 'stretch' });
      var titleEl = make('h3', 'nblk-demo-stage__title');
      var presentation = make('div', 'nblk-demo-stage__presentation');
      var stageEl = make('div', 'nblk-demo-stage__stage');
      var narration = make('div', 'nblk-demo-stage__narration');
      var captionLabelEl = make('span', 'nblk-demo-stage__caption-label');
      var captionEl = make('p', 'nblk-demo-stage__caption');
      var controlsWrap = make('div', 'nblk-demo-stage__controls');
      var inline = UI.Inline.mount(controlsWrap, { gap: 'sm', align: 'center' });

      titleEl.id = titleId;
      captionEl.id = captionId;
      captionEl.setAttribute('aria-live', 'polite');
      captionEl.setAttribute('aria-atomic', 'true');
      inline.el.setAttribute('role', 'group');
      inline.el.setAttribute('aria-label', '演示控制');
      titleEl.hidden = true;
      controlsWrap.hidden = true;
      captionLabelEl.setAttribute('aria-hidden', 'true');
      narration.append(captionLabelEl, captionEl);
      presentation.append(stageEl, narration);
      stack.append(titleEl, presentation, controlsWrap);

      function applyLabel() {
        var label = text(state.label).trim();
        if (label) {
          root.setAttribute('aria-label', label);
          root.removeAttribute('aria-labelledby');
          return;
        }
        if (!titleEl.hidden && text(titleEl.textContent).trim()) {
          root.removeAttribute('aria-label');
          root.setAttribute('aria-labelledby', titleId);
        } else {
          root.removeAttribute('aria-labelledby');
          root.setAttribute('aria-label', '演示舞台');
        }
      }

      function applyCaptionDescription() {
        if (text(state.caption).trim()) root.setAttribute('aria-describedby', captionId);
        else root.removeAttribute('aria-describedby');
      }

      function applyCaptionLabel() {
        var label = text(state.captionLabel).trim();
        var hasCaption = !!text(state.caption).trim();
        captionLabelEl.textContent = label;
        captionLabelEl.hidden = !label || !hasCaption;
        narration.setAttribute('data-caption-label', label && hasCaption ? 'true' : 'false');
      }

      function renderTitle() {
        if (state.title !== undefined && state.title !== null && state.title !== '') {
          setContent(titleEl, state.title);
          titleEl.hidden = !text(titleEl.textContent).trim() && !titleEl.firstChild;
        } else {
          clear(titleEl);
          titleEl.hidden = true;
        }
        applyLabel();
      }

      function applyDimensions() {
        var maxWidth = cssLength(state.maxWidth);
        if (maxWidth) root.style.maxWidth = maxWidth;
        else root.style.removeProperty('max-width');
        var stageHeight = cssLength(state.minStageHeight);
        if (stageHeight) stageEl.style.minHeight = stageHeight;
        else stageEl.style.removeProperty('min-height');
      }

      function destroyButtons() {
        buttonInstances.forEach(function (instance) {
          try { instance.destroy(); } catch (error) { /* keep cleanup moving */ }
        });
        buttonInstances = [];
      }

      function renderControls() {
        destroyButtons();
        clear(inline.el);
        var items = Array.isArray(state.controls) ? state.controls : [];
        var count = 0;
        items.forEach(function (item) {
          if (isNode(item)) {
            inline.append(item);
            count += 1;
            return;
          }
          if (!item || typeof item !== 'object') return;
          var config = {
            label: text(item.label),
            variant: item.variant,
            disabled: Boolean(item.disabled),
            onClick: typeof item.onClick === 'function' ? item.onClick : null,
            icon: resolveIcon(item.icon),
            ariaLabel: item.ariaLabel
          };
          var instance = UI.Button.mount(inline.el, config);
          buttonInstances.push(instance);
          count += 1;
        });
        controlsWrap.hidden = count === 0;
      }

      function setStage(value) {
        if (destroyed) return;
        state.stage = value;
        setContent(stageEl, value);
      }

      function setCaption(value) {
        if (destroyed) return;
        state.caption = text(value);
        captionEl.textContent = state.caption;
        applyCaptionDescription();
        applyCaptionLabel();
      }

      function setControls(items) {
        if (destroyed) return;
        state.controls = Array.isArray(items) ? items.slice() : [];
        renderControls();
      }

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        Object.keys(patch).forEach(function (key) { state[key] = patch[key]; });
        if (own(patch, 'title') || own(patch, 'label')) renderTitle();
        if (own(patch, 'stage')) setStage(state.stage);
        if (own(patch, 'caption')) setCaption(state.caption);
        if (own(patch, 'captionLabel')) applyCaptionLabel();
        if (own(patch, 'controls')) setControls(state.controls);
        applyDimensions();
        applyLabel();
      }

      function destroy() {
        if (destroyed) return;
        destroyed = true;
        destroyButtons();
        clear(stageEl);
        clear(captionEl);
        clear(titleEl);
        try { inline.destroy(); } catch (error) { /* already optional */ }
        try { stack.destroy(); } catch (error) { /* already optional */ }
        root.remove();
      }

      renderTitle();
      applyDimensions();
      setStage(state.stage);
      setCaption(state.caption);
      applyCaptionLabel();
      setControls(state.controls);
      applyLabel();
      applyCaptionDescription();
      host.appendChild(root);

      return {
        el: root,
        stageEl: stageEl,
        captionEl: captionEl,
        captionLabelEl: captionLabelEl,
        narrationEl: narration,
        setStage: setStage,
        setCaption: setCaption,
        setControls: setControls,
        update: update,
        destroy: destroy
      };
    }
  };

})(window);
