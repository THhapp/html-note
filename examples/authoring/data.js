/* Authoring example data — content and attention intent only.
 * Both demos use NoteDemoRecipes.focusWorkbench; replace these data values to reuse the recipe.
 *
 * This round calibrates reading pace, not the observation contract:
 * - Each pair step: the reader identifies A's current cell, then B's current cell, then looks at
 *   the product that appears. The focus picks up from the previous product's weakened position
 *   and only migrates to the two new source cells; it does not re-scan settled evidence.
 * - Observation-only targets (groups: []) keep the same default stay; scene.attention.stepDuration
 *   is tuned per demo so A/B get enough time to be read without piling up across three pairs.
 * - Content targets start only after the focus actually arrives; their extra wait is 0 unless a
 *   demo explicitly needs one. The last landing point is weakened and static: no final countdown.
 * - Readout steps: the reader confirms one 读数格, then checks the right-side current readout.
 *   Readout content is gated on its own target, so the value change cannot be missed while the
 *   focus is still on the previous stop.
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
  /* 稳定参照：只观察、不启动内容。 */
  function observeCell(binding, cell, holdDuration) {
    var ref = cellRef(binding, cell);
    ref.groups = [];
    if (holdDuration != null) ref.holdDuration = holdDuration;
    return ref;
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
              /* 读者任务：先辨认 A₁₁=2，再辨认 B₁₂=2，最后看乘积 4 出现。
               * stepDuration 只作为两个来源单元的辨认停顿；乘积内容到达后不再额外等待。 */
              stepDuration: 440,
              targets: [
                observeCell('matrixA', PAIRS[0].a),
                observeCell('matrixB', PAIRS[0].b),
                { binding: 'terms', query: { id: 't1' }, holdDuration: 0 }
              ]
            }
          }
        },
        {
          id: 'pair-2', caption: CAPTIONS[2],
          replace: { terms: termsView(2, 't2') },
          scene: {
            bindings: [{ binding: 'terms' }],
            attention: {
              /* 读者任务：辨认 A₁₂=1 与 B₂₂=1；两个来源使用同一节奏，不再人为拖长。 */
              stepDuration: 440,
              targets: [
                observeCell('matrixA', PAIRS[1].a),
                observeCell('matrixB', PAIRS[1].b),
                { binding: 'terms', query: { id: 't2' } }
              ]
            }
          }
        },
        {
          id: 'pair-3', caption: CAPTIONS[3],
          replace: { terms: termsView(3, 't3') },
          scene: {
            bindings: [{ binding: 'terms' }],
            attention: {
              /* 读者任务：辨认 A₁₃=3 与 B₃₂=4；第三对仍按同一观察节奏收束。 */
              stepDuration: 440,
              targets: [
                observeCell('matrixA', PAIRS[2].a),
                observeCell('matrixB', PAIRS[2].b),
                { binding: 'terms', query: { id: 't3' } }
              ]
            }
          }
        },
        {
          id: 'sum', caption: CAPTIONS[4],
          replace: { sum: THREE, result: { text: '17' } },
          scene: {
            bindings: [{ binding: 'sum' }, { binding: 'result', mode: 'reveal', after: 'sum' }],
            /* 末步是最后落点：内容 ready 后由会话弱化静止，不配置观察倒计时。 */
            attention: {
              targets: [
                /* 观察整段累加表达式（body 是真实内容容器），而不是只框住末端 total。 */
                { binding: 'sum', query: { part: 'body' } },
                { binding: 'result', query: { part: 'value' } }
              ]
            }
          }
        }
      ],
      sources: [
        { slot: 'matrixA', title: '矩阵 A', meta: '2 × 3' },
        { slot: 'matrixB', title: '矩阵 B', meta: '3 × 2' }
      ],
      processTitle: '当前配对',
      processMeta: '先看两个来源，再看乘积出现',
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
            attention: {
              /* 读者任务：确认第 1 格是 4，再看右侧读数更新为 4。
               * stepDuration 只给这格辨认时间；读数内容到达后立即出现。 */
              stepDuration: 400,
              targets: [
                { binding: 'seq', query: { id: 'b1' } },
                { binding: 'readout', query: { part: 'value' } }
              ]
            }
          }
        },
        {
          id: 'read-2', caption: '第 2 项是 1；视线继续向右，当前读数随之更新。',
          replace: { seq: seqView(2, 'b2'), readout: { text: '1' } },
          scene: {
            bindings: [{ binding: 'seq' }, { binding: 'readout' }],
            attention: {
              /* 读者任务：确认第 2 格是 1，再看读数从 4 换成 1。 */
              stepDuration: 400,
              targets: [
                { binding: 'seq', query: { id: 'b2' } },
                { binding: 'readout', query: { part: 'value' } }
              ]
            }
          }
        },
        {
          id: 'read-3', caption: '第 3 项是 12；三格都已读到，接下来才汇总。',
          replace: { seq: seqView(3, 'b3'), readout: { text: '12' } },
          scene: {
            bindings: [{ binding: 'seq' }, { binding: 'readout' }],
            attention: {
              /* 读者任务：确认第 3 格是 12，再看读数换成 12；三格到齐后才进入汇总。 */
              stepDuration: 400,
              targets: [
                { binding: 'seq', query: { id: 'b3' } },
                { binding: 'readout', query: { part: 'value' } }
              ]
            }
          }
        },
        {
          id: 'total', caption: '把三项相加：4 + 1 + 12 = 17。',
          replace: { sum: THREE, result: { text: '17' } },
          scene: {
            bindings: [{ binding: 'sum' }, { binding: 'result', mode: 'reveal', after: 'sum' }],
            /* 最后落点：内容 ready 后弱化静止，不额外等待。 */
            attention: {
              targets: [
                /* 观察整段累加表达式（body 是真实内容容器），而不是只框住末端 total：
                 * 旧值“—”先可见，随后 4 + 1 + 12 = 17 在同一框内展开。 */
                { binding: 'sum', query: { part: 'body' } },
                { binding: 'result', query: { part: 'value' } }
              ]
            }
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

  /* 第四例：diagramTable 跨区域承接——先辨认依据，确认后结果表才出现新行。
   * evidence 是观察/内容目标，table 用独立 Binding + row:<key> 组门控新行；
   * status 只是辅助状态：作为 cut 参与者同步提交（compile 要求视图变化必须列入 scene），
   * 不写 attention target，所以不被 Focus 巡视。 */
  var CROSS_COLUMNS = [
    { key: 'source', label: '来源' },
    { key: 'port', label: '入端口' }
  ];
  function crossTableView(rows) {
    return { columns: CROSS_COLUMNS, rows: rows, caption: '', dense: true };
  }
  function crossEvidence(text) {
    return { text: text };
  }
  function crossStatus(text) {
    return { text: text };
  }
  var CROSS_EVIDENCE_INITIAL = '等待依据';
  var CROSS_STATUS_INITIAL = '已提交 0 条';
  AuthoringDemos.crossRegion = function () {
    return {
      bindings: {
        evidence: { adapter: 'dom', slot: 'evidence', options: { label: '当前依据' } },
        table: { adapter: 'table', slot: 'table', options: { rowKey: 'id', stableStateLabels: false, density: 'compact' } },
        status: { adapter: 'dom', slot: 'status', options: { label: '已提交状态' } }
      },
      initial: {
        id: 'start',
        caption: '先看左侧依据；确认后，右侧结果表才出现对应行。顶部已提交状态只同步更新，不单独巡视。',
        views: {
          evidence: crossEvidence(CROSS_EVIDENCE_INITIAL),
          table: crossTableView([]),
          status: crossStatus(CROSS_STATUS_INITIAL)
        }
      },
      steps: [
        {
          id: 'step-a',
          caption: '依据 A 进入端口 1：先辨认左侧依据，确认后结果表才出现 r1。',
          replace: {
            evidence: crossEvidence('依据 A · 入端口 1'),
            table: crossTableView([{ id: 'r1', source: 'A', port: '1' }]),
            status: crossStatus('已提交 1 条')
          },
          scene: {
            /* status 是辅助状态：compile 要求视图变化的 Binding 必须列入 scene，
             * 这里用 cut 同步提交，不写 attention target，因此不会被 Focus 巡视。 */
            bindings: [{ binding: 'evidence' }, { binding: 'table' }, { binding: 'status', mode: 'cut' }],
            timing: { enterDuration: 420, easing: 'linear' },
            attention: {
              stepDuration: 360,
              targets: [
                { binding: 'evidence', query: { part: 'value' } },
                { binding: 'table', query: { row: 'r1' }, groups: ['row:r1'], holdDuration: 0 }
              ]
            }
          }
        },
        {
          id: 'step-b',
          caption: '依据 B 进入端口 2：确认后结果表追加 r2，已有行 r1 保持不变。',
          replace: {
            evidence: crossEvidence('依据 B · 入端口 2'),
            table: crossTableView([
              { id: 'r1', source: 'A', port: '1' },
              { id: 'r2', source: 'B', port: '2' }
            ]),
            status: crossStatus('已提交 2 条')
          },
          scene: {
            bindings: [{ binding: 'evidence' }, { binding: 'table' }, { binding: 'status', mode: 'cut' }],
            timing: { enterDuration: 420, easing: 'linear' },
            attention: {
              stepDuration: 360,
              targets: [
                { binding: 'evidence', query: { part: 'value' } },
                { binding: 'table', query: { row: 'r2' }, groups: ['row:r2'], holdDuration: 0 }
              ]
            }
          }
        }
      ]
    };
  };

})(window);
