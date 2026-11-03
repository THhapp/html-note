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
  /* 稳定入口映射：名称不随页面顺序变化；AuthoringSessions 数组继续保留原顺序。 */
  var demoSessions = {};
  global.AuthoringDemoSessions = demoSessions;

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

  /* 跨区域承接示例：diagramTable 把依据区、结果表与辅助状态分开。 */
  function mountCrossRegion(selector, title, label, phaseSelector) {
    var host = global.document.querySelector(selector);
    if (!host) throw new Error('找不到作者入口宿主：' + selector);
    if (!global.NoteDemoRecipes || typeof global.NoteDemoRecipes.diagramTable !== 'function') {
      throw new Error('作者入口需要先加载 NoteDemoRecipes.diagramTable。');
    }
    if (!global.AuthoringDemos || typeof global.AuthoringDemos.crossRegion !== 'function') {
      throw new Error('作者入口需要先加载 data.js 的 AuthoringDemos.crossRegion。');
    }
    var spec = global.AuthoringDemos.crossRegion();
    var recipe = global.NoteDemoRecipes.diagramTable({
      bindings: spec.bindings,
      initial: spec.initial,
      steps: spec.steps,
      density: 'compact',
      mainMinWidth: '20rem',
      diagram: { slot: 'evidence', title: '当前依据' },
      table: { slot: 'table', title: '结果表' },
      status: { slot: 'status', title: '已提交状态' }
    });
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

  /* 普通 DOM 交接示例：自定义 Adapter 只使用公开契约（handoff-demo.js）。 */
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
    demoSessions.matrix = mount('[data-author-demo="matrix"]', global.AuthoringDemos.matrix,
      '矩阵乘法 C₁₂：先看一对来源，再看乘积', '作者装配：矩阵乘法',
      '[data-author-phase="matrix"]');
    demoSessions.sequence = mount('[data-author-demo="sequence"]', global.AuthoringDemos.sequence,
      '逐项读数：沿一行看，再汇总', '作者装配：逐项读数',
      '[data-author-phase="sequence"]');
    demoSessions.handoff = mountHandoff('[data-author-demo="handoff"]',
      '普通 DOM 交接：来源保留到目标接住', '作者装配：普通 DOM 交接',
      '[data-author-phase="handoff"]');
    demoSessions.crossRegion = mountCrossRegion('[data-author-demo="crossRegion"]',
      '跨区域承接：先辨认依据，结果表再出现', '作者装配：跨区域承接',
      '[data-author-phase="crossRegion"]');
  }

  /* 只读辅助：控制台或临时检查脚本可读取四个示例会话的 phase。 */
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
