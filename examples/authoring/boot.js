/* Authoring example boot — one full-library entry; no player logic. */
(function (global) {
  'use strict';

  var sessions = [];
  global.AuthoringSessions = sessions;

  function mount(selector, factory, title, label) {
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
    return session;
  }

  function boot() {
    mount('[data-author-demo="matrix"]', global.AuthoringDemos.matrix,
      '矩阵乘法 C₁₂：先看一对来源，再看乘积', '作者装配：矩阵乘法');
    mount('[data-author-demo="sequence"]', global.AuthoringDemos.sequence,
      '逐项读数：沿一行看，再汇总', '作者装配：逐项读数');
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);