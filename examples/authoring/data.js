/* Authoring example data — content and attention intent only.
 * Both demos use NoteDemoRecipes.focusWorkbench; replace these data values to reuse the recipe.
 */
(function (global) {
  'use strict';

  var AuthoringDemos = global.AuthoringDemos = global.AuthoringDemos || {};

  var MATRIX_A = {
    rows: [{ id: 'a-r1', label: '1' }, { id: 'a-r2', label: '2' }],
    columns: [{ id: 'a-c1', label: '1' }, { id: 'a-c2', label: '2' }, { id: 'a-c3', label: '3' }],
    values: [[2, 1, 3], [0, 4, 2]]
  };
  var MATRIX_B = {
    rows: [{ id: 'b-r1', label: '1' }, { id: 'b-r2', label: '2' }, { id: 'b-r3', label: '3' }],
    columns: [{ id: 'b-c1', label: '1' }, { id: 'b-c2', label: '2' }],
    values: [[1, 2], [3, 1], [2, 4]]
  };
  var PAIRS = [
    { id: 't1', label: 'A₁₁ · B₁₂', placeholder: '2 × 2 = ?', value: '2 × 2 = 4',
      a: { row: 'a-r1', col: 'a-c1' }, b: { row: 'b-r1', col: 'b-c2' } },
    { id: 't2', label: 'A₁₂ · B₂₂', placeholder: '1 × 1 = ?', value: '1 × 1 = 1',
      a: { row: 'a-r1', col: 'a-c2' }, b: { row: 'b-r2', col: 'b-c2' } },
    { id: 't3', label: 'A₁₃ · B₃₂', placeholder: '3 × 4 = ?', value: '3 × 4 = 12',
      a: { row: 'a-r1', col: 'a-c3' }, b: { row: 'b-r3', col: 'b-c2' } }
  ];
  var CAPTIONS = [
    '目标格 C₁₂ 只由 A 的第 1 行和 B 的第 2 列决定：逐对相乘，再把三个乘积相加。',
    '第 1 对：A 第 1 行第 1 列的 2 与 B 第 1 行第 2 列的 2 相乘，得到 4。',
    '第 2 对：A 第 1 行第 2 列的 1 与 B 第 2 行第 2 列的 1 相乘，得到 1。',
    '第 3 对：A 第 1 行第 3 列的 3 与 B 第 3 行第 2 列的 4 相乘，得到 12。',
    '把三个乘积相加：4 + 1 + 12 = 17，所以 C₁₂ = 17。'
  ];
  var NO_SELECTION = { rows: [], cols: [], cells: [] };
  var ROW_A = { rows: ['a-r1'], cols: [], cells: [] };
  var COL_B = { rows: [], cols: ['b-c2'], cells: [] };
  function matrixView(matrix, focus) {
    return { rows: matrix.rows, columns: matrix.columns, values: matrix.values,
      focus: focus || NO_SELECTION, changed: NO_SELECTION, caption: '' };
  }
  function termsView(count, changed) {
    return {
      items: PAIRS.map(function (pair, index) {
        return { id: pair.id, label: pair.label, value: index < count ? pair.value : pair.placeholder };
      }),
      groups: [], focus: [], changed: changed ? [changed] : []
    };
  }
  function sumView(parts, label) {
    return { parts: parts, label: label || '逐项相加' };
  }
  var DASH = sumView([{ id: 'p1', text: '—' }]);
  var THREE = sumView([
    { id: 'p1', text: '4' }, { id: 'op2', text: '+' }, { id: 'p2', text: '1' },
    { id: 'op3', text: '+' }, { id: 'p3', text: '12' },
    { id: 'eq', text: '=' }, { id: 'total', text: '17' }
  ]);
  function cellRef(binding, cell) {
    return { binding: binding, query: { row: cell.row, col: cell.col } };
  }
  function itemRef(binding, id) {
    return { binding: binding, query: { id: id } };
  }

  AuthoringDemos.matrix = function () {
    var baseA = matrixView(MATRIX_A, ROW_A);
    var baseB = matrixView(MATRIX_B, COL_B);
    return {
      bindings: {
        matrixA: { adapter: 'matrix', slot: 'matrixA', options: { label: '矩阵 A，2 行 3 列', dense: true, summary: false } },
        matrixB: { adapter: 'matrix', slot: 'matrixB', options: { label: '矩阵 B，3 行 2 列', dense: true, summary: false } },
        terms: { adapter: 'sequence', slot: 'terms', options: { variant: 'boxes', label: '三组乘积' } },
        sum: { adapter: 'expression', slot: 'sum', options: { label: '逐项相加' } },
        result: { adapter: 'dom', slot: 'result', options: { label: 'C 第 1 行第 2 列的结果' } }
      },
      initial: {
        id: 'locate', caption: CAPTIONS[0],
        views: { matrixA: baseA, matrixB: baseB, terms: termsView(0, null), sum: DASH, result: { text: '—' } }
      },
      steps: [
        {
          id: 'pair-1', caption: CAPTIONS[1],
          replace: { terms: termsView(1, 't1') },
          scene: {
            bindings: [{ binding: 'terms' }],
            attention: {
              targets: [cellRef('matrixA', PAIRS[0].a), cellRef('matrixB', PAIRS[0].b),
                itemRef('terms', 't1')]
            }
          }
        },
        {
          id: 'pair-2', caption: CAPTIONS[2],
          replace: { terms: termsView(2, 't2') },
          scene: {
            bindings: [{ binding: 'terms' }],
            attention: {
              targets: [cellRef('matrixA', PAIRS[1].a), cellRef('matrixB', PAIRS[1].b),
                itemRef('terms', 't2')]
            }
          }
        },
        {
          id: 'pair-3', caption: CAPTIONS[3],
          replace: { terms: termsView(3, 't3') },
          scene: {
            bindings: [{ binding: 'terms' }],
            attention: {
              targets: [cellRef('matrixA', PAIRS[2].a), cellRef('matrixB', PAIRS[2].b), itemRef('terms', 't3')]
            }
          }
        },
        {
          id: 'sum', caption: CAPTIONS[4],
          replace: { sum: THREE, result: { text: '17' } },
          scene: {
            bindings: [{ binding: 'sum' }, { binding: 'result', mode: 'reveal', after: 'sum' }],
            attention: { targets: [{ binding: 'sum', query: { id: 'total' }, holdDuration: 1150 }, { binding: 'result', query: { part: 'value' } }], stepDuration: 600 }
          }
        }
      ],
      sources: [
        { slot: 'matrixA', title: '矩阵 A', meta: '2 × 3' },
        { slot: 'matrixB', title: '矩阵 B', meta: '3 × 2' }
      ],
      processTitle: '当前配对',
      processMeta: '按顺序观察这一对的来源与乘积',
      process: [{ slot: 'terms' }],
      readout: { slot: 'sum', title: '逐项相加' },
      result: { slot: 'result', title: 'C₁₂ 结果' }
    };
  };

  var BYTES = [
    { id: 'b1', label: '第 1 项', value: '4' },
    { id: 'b2', label: '第 2 项', value: '1' },
    { id: 'b3', label: '第 3 项', value: '12' }
  ];
  function seqView(count, changed) {
    return {
      items: BYTES.map(function (item, index) {
        return { id: item.id, label: item.label, value: index < count ? item.value : '—' };
      }),
      groups: [], focus: changed ? [changed] : [], changed: changed ? [changed] : []
    };
  }
  AuthoringDemos.sequence = function () {
    return {
      bindings: {
        seq: { adapter: 'sequence', slot: 'seq', options: { variant: 'boxes', label: '三项读数' } },
        readout: { adapter: 'dom', slot: 'readout', options: { label: '当前读数' } },
        sum: { adapter: 'expression', slot: 'sum', options: { label: '逐项相加' } },
        result: { adapter: 'dom', slot: 'result', options: { label: '结果' } }
      },
      initial: {
        id: 'start', caption: '沿着一行读数从左到右，逐项确认，再把它们相加。',
        views: { seq: seqView(0, null), readout: { text: '—' }, sum: DASH, result: { text: '—' } }
      },
      steps: [
        {
          id: 'read-1', caption: '第 1 项是 4；先看这一格，再看右侧的当前读数。',
          replace: { seq: seqView(1, 'b1'), readout: { text: '4' } },
          scene: {
            bindings: [{ binding: 'seq' }, { binding: 'readout' }],
            attention: { targets: [itemRef('seq', 'b1'), { binding: 'readout', query: { part: 'value' } }] }
          }
        },
        {
          id: 'read-2', caption: '第 2 项是 1；视线继续向右，当前读数随之更新。',
          replace: { seq: seqView(2, 'b2'), readout: { text: '1' } },
          scene: {
            bindings: [{ binding: 'seq' }, { binding: 'readout' }],
            attention: { targets: [itemRef('seq', 'b2'), { binding: 'readout', query: { part: 'value' } }] }
          }
        },
        {
          id: 'read-3', caption: '第 3 项是 12；三格都已读到，接下来才汇总。',
          replace: { seq: seqView(3, 'b3'), readout: { text: '12' } },
          scene: {
            bindings: [{ binding: 'seq' }, { binding: 'readout' }],
            attention: { targets: [itemRef('seq', 'b3'), { binding: 'readout', query: { part: 'value' } }] }
          }
        },
        {
          id: 'total', caption: '把三项相加：4 + 1 + 12 = 17。',
          replace: { sum: THREE, result: { text: '17' } },
          scene: {
            bindings: [{ binding: 'sum' }, { binding: 'result', mode: 'reveal', after: 'sum' }],
            attention: { targets: [{ binding: 'sum', query: { id: 'total' }, holdDuration: 1150 }, { binding: 'result', query: { part: 'value' } }], stepDuration: 600 }
          }
        }
      ],
      sources: [{ slot: 'seq', title: '读数', meta: '从左到右' }],
      processTitle: '当前读数',
      processMeta: '每次只看一格和它的读数',
      process: [{ slot: 'readout' }],
      readout: { slot: 'sum', title: '逐项相加' },
      result: { slot: 'result', title: '结果' }
    };
  };
})(window);