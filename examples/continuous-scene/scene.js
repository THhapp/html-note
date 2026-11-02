/*!
 * continuous-scene · 自定义 Adapter 与画面
 * 一个 Binding 里有两个局部主要变化（left / right）；两组效果各自由焦点放行。
 * record 是辅助记录：目标提交时同步更新，不加入效果组、不要求额外焦点巡视。
 */
(function (global) {
  'use strict';

  var STAGES = [
    { left: 'A', right: 'C', record: '等待提交：两处局部变化都还没有发生' },
    { left: 'B', right: 'D', record: '目标已提交：左格、右格等待各自的焦点放行' },
    { left: 'B', right: 'E', record: '目标已提交：右格再次局部更新' }
  ];
  var LAST = STAGES.length - 1;

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  function smooth(t) {
    t = clamp01(t);
    return t * t * (3 - 2 * t);
  }

  function panel(name, label, caption) {
    var root = el('section', 'cs-panel');
    root.setAttribute('data-part', name);
    root.setAttribute('data-tag', name === 'left' ? '先看这里' : '随后看这里');
    root.appendChild(el('div', 'cs-panel__label', label));
    var value = el('div', 'cs-panel__value');
    var source = el('span', '', '');
    source.setAttribute('data-role', 'source');
    var target = el('span', '', '');
    target.setAttribute('data-role', 'target');
    value.appendChild(source); value.appendChild(target);
    root.appendChild(value);
    root.appendChild(el('div', 'cs-panel__caption', caption));
    return {
      el: root,
      value: value,
      source: source,
      target: target
    };
  }

  function mount(host) {
    var root = el('div', 'cs-scene');
    root.setAttribute('data-part', 'root');
    var head = el('div', 'cs-scene__head');
    head.appendChild(el('div', 'cs-scene__title', '同一画面 · 两个局部主要变化'));
    head.appendChild(el('div', 'cs-scene__hint', '左格与右格分别等焦点到达；上方记录同步更新'));
    root.appendChild(head);

    var grid = el('div', 'cs-grid');
    var refs = {
      left: panel('left', '左格', '焦点先到这里；记录先更新，但左格仍显示来源值。'),
      right: panel('right', '右格', '在左格放行后才轮到右格；此前保持来源视觉。')
    };
    grid.appendChild(refs.left.el);
    grid.appendChild(refs.right.el);
    root.appendChild(grid);

    var record = el('div', 'cs-record');
    record.setAttribute('data-part', 'record');
    record.appendChild(el('span', 'cs-record__k', '记录'));
    var recordText = el('span', '');
    record.appendChild(recordText);
    root.appendChild(record);
    host.appendChild(root);

    var state = { stage: 0, sourceStage: 0, progress: { left: 1, right: 1 } };

    /* 只写该面板在本步的源/目标文字。调用点只有 restore 与 commit；
     * progress 更新只改透明度和诊断属性，不反复替换文字。 */
    function setPanelText(name, fromStage, toStage) {
      var ref = refs[name];
      var from = STAGES[fromStage][name];
      var to = STAGES[toStage][name];
      if (ref.source.textContent !== from) ref.source.textContent = from;
      if (ref.target.textContent !== to) ref.target.textContent = to;
    }

    function renderPanel(name) {
      var ref = refs[name];
      var from = STAGES[state.sourceStage][name];
      var to = STAGES[state.stage][name];
      var p = state.progress[name] == null ? 1 : state.progress[name];
      var eased = smooth(p);
      ref.source.style.opacity = String(1 - eased);
      ref.target.style.opacity = String(eased);
      ref.el.setAttribute('data-progress', String(Math.round(eased * 1000) / 1000));
      ref.el.setAttribute('data-visual', eased >= 0.5 ? to : from);
    }

    function render() {
      renderPanel('left');
      renderPanel('right');
      var record = STAGES[state.stage].record;
      if (recordText.textContent !== record) recordText.textContent = record;
      root.setAttribute('data-stage', String(state.stage));
    }

    function restoreStage(stage) {
      state.stage = Math.max(0, Math.min(LAST, Math.round(Number(stage) || 0)));
      state.sourceStage = state.stage;
      state.progress = { left: 1, right: 1 };
      setPanelText('left', state.stage, state.stage);
      setPanelText('right', state.stage, state.stage);
      render();
    }

    function prepareStep(targetStage, reduced, groups) {
      var fromStage = state.stage;
      var committed = false;
      return {
        groups: function () { return groups.slice(); },
        commit: function () {
          if (committed) return;
          committed = true;
          state.sourceStage = fromStage;
          state.stage = targetStage;
          state.progress = { left: 1, right: 1 };
          /* 本步实际变化的组才改文字；未变面板保持原文字，避免无意义重绘。 */
          groups.forEach(function (group) {
            setPanelText(group, fromStage, targetStage);
            state.progress[group] = reduced ? 1 : 0;
          });
          render();
        },
        targets: function () { return []; },
        effects: function (timing) {
          if (reduced) return [];
          /* timing 是 scene 合并后的最终值（含 Adapter 默认/公开 attention 节奏/scene.timing/
           * 参与者 timing）；这里不再放第二份默认，0 也按真实值交给进度句柄。 */
          var Tools = global.NoteDemo && global.NoteDemo.sceneAdapter;
          if (!Tools || typeof Tools.progress !== 'function') {
            throw new Error('ContinuousScene：prepareStep 需要 NoteDemo.sceneAdapter.progress（先加载 scene-adapter.js）。');
          }
          return groups.map(function (group) {
            return Tools.progress({
              group: group,
              duration: timing.enterDuration,
              easing: timing.easing,
              gate: 'ready',
              update: function (progress) {
                state.progress[group] = progress;
                render();
              }
            });
          });
        },
        cleanup: function () {}
      };
    }

    function targetAt(query) {
      var part = query && typeof query === 'object' ? query.part : query;
      if (!part || part === 'root' || part === 'scene') return root;
      if (part === 'left' || part === 'right') return refs[part].el;
      if (part === 'record') return record;
      return null;
    }

    restoreStage(0);
    return {
      el: root,
      restoreStage: restoreStage,
      readModel: function () { return { stage: state.stage }; },
      prepareStep: prepareStep,
      targetAt: targetAt,
      destroy: function () { if (root.parentNode) root.parentNode.removeChild(root); }
    };
  }

  global.ContinuousScene = { mount: mount, STAGES: STAGES };
})(window);