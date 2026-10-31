/* 复用验证：矩阵乘法中的一个结果格 C₁₂。
 *
 * 这是本页的知识内容与停点定义，不包含播放器、DOM 布局或动画实现。
 * 下一位作者通常只需改：
 *   - MATRIX_A / MATRIX_B（行、列、数值）
 *   - PAIRS（配对单元、显示标签、逐项值）
 *   - FRAME_COPY（每步字幕与累计表达）
 *   - buildFrames() 中每个停点的 focus/changed 与 terms/sum/result 文本
 * 播放、字幕、取消、减少动效由 NoteDemo 公共层负责。
 */
(function (global) {
  'use strict';

  var MatrixProductDemo = global.MatrixProductDemo = global.MatrixProductDemo || {};

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

  /* 当前只计算 C 的第 1 行第 2 列，所以配对固定为 A 第 1 行 × B 第 2 列。 */
  var PAIRS = [
    {
      id: 't1',
      label: 'A₁₁ · B₁₂',
      placeholder: '2 × 2 = ?',
      value: '2 × 2 = 4',
      product: '4',
      a: { row: 'a-r1', col: 'a-c1' },
      b: { row: 'b-r1', col: 'b-c2' }
    },
    {
      id: 't2',
      label: 'A₁₂ · B₂₂',
      placeholder: '1 × 1 = ?',
      value: '1 × 1 = 1',
      product: '1',
      a: { row: 'a-r1', col: 'a-c2' },
      b: { row: 'b-r2', col: 'b-c2' }
    },
    {
      id: 't3',
      label: 'A₁₃ · B₃₂',
      placeholder: '3 × 4 = ?',
      value: '3 × 4 = 12',
      product: '12',
      a: { row: 'a-r1', col: 'a-c3' },
      b: { row: 'b-r3', col: 'b-c2' }
    }
  ];

  var FRAME_COPY = [
    {
      id: 'locate',
      caption: '目标格 C₁₂ 只由 A 的第 1 行和 B 的第 2 列决定：逐对相乘，再把三个乘积相加。'
    },
    {
      id: 'pair-1',
      caption: '第 1 对：A 第 1 行第 1 列的 2 与 B 第 1 行第 2 列的 2 相乘，得到 4。'
    },
    {
      id: 'pair-2',
      caption: '第 2 对：A 第 1 行第 2 列的 1 与 B 第 2 行第 2 列的 1 相乘，得到 1。'
    },
    {
      id: 'pair-3',
      caption: '第 3 对：A 第 1 行第 3 列的 3 与 B 第 3 行第 2 列的 4 相乘，得到 12。'
    },
    {
      id: 'sum',
      caption: '把三个乘积相加：4 + 1 + 12 = 17，所以 C₁₂ = 17。'
    }
  ];

  var ROW_FOCUS_A = { rows: ['a-r1'], cols: [], cells: [] };
  var COL_FOCUS_B = { rows: [], cols: ['b-c2'], cells: [] };
  var NO_SELECTION = { rows: [], cols: [], cells: [] };

  function matrixView(matrix, focus) {
    return {
      rows: matrix.rows,
      columns: matrix.columns,
      values: matrix.values,
      focus: focus || NO_SELECTION,
      changed: NO_SELECTION,
      caption: ''
    };
  }

  /* 当前配对是“关注”，不是数据变化；保留行/列关注，并额外直接关注这对单元。 */
  function pairFocus(base, pair, side) {
    var cell = side === 'a' ? pair.a : pair.b;
    return {
      rows: base.rows.slice(),
      cols: base.cols.slice(),
      cells: cell ? [{ row: cell.row, col: cell.col }] : []
    };
  }

  function sumExpression(parts) {
    return { parts: parts, label: '逐项相加' };
  }

  var SUM_DASH = sumExpression([{ id: 'p1', text: '—' }]);
  var SUM_ONE = sumExpression([{ id: 'p1', text: '4' }]);
  var SUM_TWO = sumExpression([
    { id: 'p1', text: '4' }, { id: 'op2', text: '+' }, { id: 'p2', text: '1' },
    { id: 'eq', text: '=' }, { id: 'total', text: '5' }
  ]);
  var SUM_THREE = sumExpression([
    { id: 'p1', text: '4' }, { id: 'op2', text: '+' }, { id: 'p2', text: '1' },
    { id: 'op3', text: '+' }, { id: 'p3', text: '12' },
    { id: 'eq', text: '=' }, { id: 'total', text: '17' }
  ]);

  function termsView(completedCount, changedId) {
    return {
      items: PAIRS.map(function (pair, index) {
        return {
          id: pair.id,
          label: pair.label,
          value: index < completedCount ? pair.value : pair.placeholder
        };
      }),
      groups: [],
      focus: [],
      changed: changedId ? [changedId] : []
    };
  }

  function buildFrames() {
    return [
      {
        id: FRAME_COPY[0].id,
        caption: FRAME_COPY[0].caption,
        views: {
          matrixA: matrixView(MATRIX_A, ROW_FOCUS_A),
          matrixB: matrixView(MATRIX_B, COL_FOCUS_B),
          terms: termsView(0, null),
          sum: SUM_DASH,
          result: { text: '—' }
        },
        marks: []
      },
      {
        id: FRAME_COPY[1].id,
        caption: FRAME_COPY[1].caption,
        views: {
          matrixA: matrixView(MATRIX_A, pairFocus(ROW_FOCUS_A, PAIRS[0], 'a')),
          matrixB: matrixView(MATRIX_B, pairFocus(COL_FOCUS_B, PAIRS[0], 'b')),
          terms: termsView(1, PAIRS[0].id),
          sum: SUM_ONE,
          result: { text: '—' }
        },
        marks: []
      },
      {
        id: FRAME_COPY[2].id,
        caption: FRAME_COPY[2].caption,
        views: {
          matrixA: matrixView(MATRIX_A, pairFocus(ROW_FOCUS_A, PAIRS[1], 'a')),
          matrixB: matrixView(MATRIX_B, pairFocus(COL_FOCUS_B, PAIRS[1], 'b')),
          terms: termsView(2, PAIRS[1].id),
          sum: SUM_TWO,
          result: { text: '—' }
        },
        marks: []
      },
      {
        id: FRAME_COPY[3].id,
        caption: FRAME_COPY[3].caption,
        views: {
          matrixA: matrixView(MATRIX_A, pairFocus(ROW_FOCUS_A, PAIRS[2], 'a')),
          matrixB: matrixView(MATRIX_B, pairFocus(COL_FOCUS_B, PAIRS[2], 'b')),
          terms: termsView(3, PAIRS[2].id),
          sum: SUM_TWO,
          result: { text: '—' }
        },
        marks: []
      },
      {
        id: FRAME_COPY[4].id,
        caption: FRAME_COPY[4].caption,
        views: {
          matrixA: matrixView(MATRIX_A, ROW_FOCUS_A),
          matrixB: matrixView(MATRIX_B, COL_FOCUS_B),
          terms: termsView(3, null),
          sum: SUM_THREE,
          result: { text: '17' }
        },
        marks: []
      }
    ];
  }

  function transition(from, to, includeResult) {
    var bindings = [
      { binding: 'matrixA' },
      { binding: 'matrixB' },
      { binding: 'terms' },
      { binding: 'sum', after: 'terms' }
    ];
    if (includeResult) bindings.push({ binding: 'result', mode: 'reveal', after: 'sum' });
    return { from: from, to: to, scene: { bindings: bindings } };
  }

  MatrixProductDemo.content = {
    matrixA: MATRIX_A,
    matrixB: MATRIX_B,
    pairs: PAIRS,
    frames: FRAME_COPY
  };

  MatrixProductDemo.buildDefinition = function () {
    return {
      bindings: {
        matrixA: {
          adapter: 'matrix',
          slot: 'matrixA',
          options: { label: '矩阵 A，2 行 3 列', dense: true, summary: false }
        },
        matrixB: {
          adapter: 'matrix',
          slot: 'matrixB',
          options: { label: '矩阵 B，3 行 2 列', dense: true, summary: false }
        },
        terms: {
          adapter: 'sequence',
          slot: 'main',
          options: { variant: 'boxes', label: '三组乘积' }
        },
        sum: {
          adapter: 'expression',
          slot: 'sum',
          options: { label: '逐项相加' }
        },
        result: {
          adapter: 'dom',
          slot: 'result',
          options: { label: 'C 第 1 行第 2 列的结果' }
        }
      },
      frames: buildFrames(),
      transitions: [
        transition('locate', 'pair-1', false),
        transition('pair-1', 'pair-2', false),
        transition('pair-2', 'pair-3', false),
        transition('pair-3', 'sum', true)
      ]
    };
  };
})(window);
