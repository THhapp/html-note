/* 复用验证宿主编排：本页的 DOM 布局与 NoteDemo 挂载。
 *
 * 知识内容在 content.js；本文件只负责：
 *   - 把 A、B、目标结果、三项乘积和求和位置装配成画布；
 *   - 提供 NoteDemo.mount 需要的 slots；
 *   - 启动默认播放器，并把停点状态挂到“开发自检”。
 * 不实现下一步、字幕、计时、取消或动画引擎。
 */
(function (global) {
  'use strict';

  var MatrixProductDemo = global.MatrixProductDemo = global.MatrixProductDemo || {};

  function el(tag, className, content) {
    var node = global.document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = String(content);
    return node;
  }

  function slot(name, className) {
    var node = el('div', 'mp-slot' + (className ? ' ' + className : ''));
    node.setAttribute('data-demo-slot', name);
    return node;
  }

  function matrixCard(name, size, slotName) {
    var card = el('section', 'mp-matrix');
    var head = el('div', 'mp-matrix-head');
    head.append(
      el('p', 'mp-matrix-name', name),
      el('p', 'mp-matrix-size', size)
    );
    var matrixSlot = slot(slotName, 'mp-matrix-slot');
    card.append(head, matrixSlot);
    return { card: card, slot: matrixSlot };
  }

  function layout(container) {
    var canvas = el('div', 'mp-canvas');
    var top = el('div', 'mp-top');

    var a = matrixCard('A', '2 × 3', 'matrixA');
    var b = matrixCard('B', '3 × 2', 'matrixB');

    var result = el('aside', 'mp-result');
    var resultLabel = el('p', 'mp-result-label', 'C₁₂ 结果');
    var resultValue = slot('result', 'mp-result-value');
    result.append(resultLabel, resultValue);

    top.append(a.card, b.card, result);

    var process = el('section', 'mp-process');
    var processHead = el('div', 'mp-process-head');
    var context = el('div', 'mp-process-context');
    context.append(
      el('p', 'mp-eyebrow', '计算过程'),
      el('p', 'mp-context-text', 'C₁₂ = A 的第 1 行 · B 的第 2 列')
    );
    processHead.append(context);

    var terms = slot('terms', 'mp-terms');
    var total = el('div', 'mp-total');
    var totalLabelWrap = el('div', 'mp-total-label-wrap');
    totalLabelWrap.append(el('p', 'mp-eyebrow', '逐项相加'));
    var sumValue = slot('sum', 'mp-total-value');
    total.append(totalLabelWrap, sumValue);

    process.append(processHead, terms, total);
    canvas.append(top, process);
    container.appendChild(canvas);

    return {
      root: canvas,
      slots: {
        main: terms,
        matrixA: a.slot,
        matrixB: b.slot,
        sum: sumValue,
        result: resultValue
      }
    };
  }

  function readoutText(state) {
    if (!state || typeof state !== 'object') return '尚未开始';
    if (state.phase === 'running') return '过渡中 → ' + (state.targetFrameId || '…');
    if (state.phase === 'error') return '错误 · ' + (state.settledFrameId || '…');
    if (state.phase === 'disposed') return '已销毁';
    return '当前停点：' + (state.settledFrameId || '…');
  }

  function boot(documentRef) {
    var doc = documentRef || global.document;
    if (!doc) return null;
    var host = doc.querySelector('[data-demo-host]');
    if (!host) return null;
    if (global.NoteDemo == null || typeof global.NoteDemo.mount !== 'function') {
      throw new Error('矩阵乘法示例需要先加载 NoteDemo 公共层。');
    }
    var readout = doc.querySelector('[data-demo-readout]');
    var session = global.NoteDemo.mount(host, {
      definition: MatrixProductDemo.buildDefinition(),
      layout: layout,
      label: '矩阵乘法 C₁₂ 复用验证'
    });
    if (readout) {
      readout.textContent = readoutText(session.getState());
      session.subscribe(function (state) {
        readout.textContent = readoutText(state);
        if (state && state.phase === 'error') readout.setAttribute('data-demo-error', 'true');
        else readout.removeAttribute('data-demo-error');
      });
    }
    var stage = doc.querySelector('[data-demo-scenario]');
    if (stage) stage.setAttribute('data-demo-ready', 'true');
    MatrixProductDemo.session = session;
    return session;
  }

  MatrixProductDemo.layout = layout;
  MatrixProductDemo.readoutText = readoutText;
  MatrixProductDemo.boot = boot;

  if (global.document && global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', function () { 
      try { boot(global.document); } catch (error) { global.console && console.error(error); }
    }, { once: true });
  } else {
    try { boot(global.document); } catch (error) { global.console && console.error(error); }
  }
})(window);
