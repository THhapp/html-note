/* Authoring example boot — one full-library entry; no player logic.
 *
 * 按钮可用性不等于运行状态：末步的“下一步”禁用只表示没有下一停点可去，
 * 而“上一步/重看”可能在运行中承担取消。需要判断是否正在运行时，读
 * session.getState().phase（'idle' | 'running' | 'error' | 'disposed'）；
 * 本文件只订阅该状态写页面上的小状态文字，不实现自己的忙闲标志。
 */
(function (global) {
  'use strict';

  var sessions = [];
  global.AuthoringSessions = sessions;

  var PHASE_LABELS = {
    idle: '空闲',
    running: '运行中',
    error: '出错',
    disposed: '已销毁'
  };

  function phaseLabel(state) {
    if (!state || !state.phase) return '未知';
    return PHASE_LABELS[state.phase] || String(state.phase);
  }

  /* 把会话状态写到页面状态位，供读者确认“末步禁用 ≠ 运行中”。 */
  function watchPhase(selector, session) {
    var el = global.document.querySelector(selector);
    if (!el) return;
    session.subscribe(function (state) {
      el.textContent = phaseLabel(state);
      el.setAttribute('data-phase', state && state.phase ? state.phase : 'unknown');
    });
  }

  function mount(selector, factory, title, label, phaseSelector) {
    var host = global.document.querySelector(selector);
    if (!host) throw new Error('找不到作者入口宿主：' + selector);
    if (!global.NoteDemoRecipes || typeof global.NoteDemoRecipes.focusWorkbench !== 'function') {
      throw new Error('作者入口需要先加载 NoteDemoRecipes.focusWorkbench。');
    }
    var spec = factory();
    var recipe = global.NoteDemoRecipes.focusWorkbench(spec);
    var session = global.NoteDemo.mount(host, {
      definition: recipe.definition,
      layout: recipe.layout,
      title: title,
      label: label
    });
    sessions.push(session);
    if (phaseSelector) watchPhase(phaseSelector, session);
    return session;
  }

  /* 第三例：普通 DOM 交接，自定义 Adapter 只使用公开契约（handoff-demo.js）。 */
  function mountHandoff(selector, title, label, phaseSelector) {
    var host = global.document.querySelector(selector);
    if (!host) throw new Error('找不到作者入口宿主：' + selector);
    if (!global.AuthoringHandoff || typeof global.AuthoringHandoff.mount !== 'function') {
      throw new Error('作者入口需要先加载 handoff-demo.js。');
    }
    var session = global.AuthoringHandoff.mount(host, { title: title, label: label });
    sessions.push(session);
    if (phaseSelector) watchPhase(phaseSelector, session);
    return session;
  }

  function boot() {
    mount('[data-author-demo="matrix"]', global.AuthoringDemos.matrix,
      '矩阵乘法 C₁₂：先看一对来源，再看乘积', '作者装配：矩阵乘法',
      '[data-author-phase="matrix"]');
    mount('[data-author-demo="sequence"]', global.AuthoringDemos.sequence,
      '逐项读数：沿一行看，再汇总', '作者装配：逐项读数',
      '[data-author-phase="sequence"]');
    mountHandoff('[data-author-demo="handoff"]',
      '普通 DOM 交接：来源保留到目标接住', '作者装配：普通 DOM 交接',
      '[data-author-phase="handoff"]');
  }

  /* 只读辅助：控制台或临时检查脚本可读取三个会话的 phase。 */
  global.AuthoringPhases = function () {
    return sessions.map(function (session) {
      var state = session.getState();
      return state && state.phase ? state.phase : null;
    });
  };

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
