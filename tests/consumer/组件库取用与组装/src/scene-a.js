/* 场景 A 宿主：矩阵转置知识页。
   只调用组件库公开接口；页面结构、外部间距与数据准备由宿主负责。 */
(function () {
  'use strict';

  var DATA = [
    {
      key: 'd1',
      segLabel: '示例一 · 2×3',
      A: [[1, 2, 3], [4, 5, 6]],
      B: [[1, 4], [2, 5], [3, 6]]
    },
    {
      key: 'd2',
      segLabel: '示例二 · 3×2',
      A: [[7, 8], [9, 10], [11, 12]],
      B: [[7, 9, 11], [8, 10, 12]]
    }
  ];

  function rowDescs(count) {
    var out = [];
    for (var i = 0; i < count; i += 1) out.push({ id: 'r' + (i + 1), label: '行 ' + (i + 1) });
    return out;
  }

  function colDescs(count) {
    var out = [];
    for (var j = 0; j < count; j += 1) out.push({ id: 'c' + (j + 1), label: '列 ' + (j + 1) });
    return out;
  }

  function block(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  var note = document.getElementById('note');
  var column = NoteUI.Stack.mount(note, { gap: 34 });

  /* ---------- 标题与短解释 ---------- */
  var intro = block('header', 'nd-intro');
  column.append(intro);

  var kickerHost = block('div', 'nd-kicker');
  intro.appendChild(kickerHost);
  NoteUI.Typography.mount(kickerHost, { variant: 'caption', content: '线性代数 · 读图笔记' });

  NoteUI.Typography.mount(intro, {
    variant: 'h1',
    as: 'h1',
    content: '矩阵转置：行列互换，数值不变'
  });
  NoteUI.Typography.mount(intro, {
    variant: 'lead',
    content: '把 A 的每一行竖起来，就成了 B 的一列。所有元素的数值不动，只是换了位置。'
  });

  /* ---------- 对应规则 ---------- */
  var rule = block('section', 'nd-section');
  column.append(rule);
  NoteUI.Typography.mount(rule, { variant: 'h2', as: 'h2', content: '对应规则' });

  NoteUI.Math.mount(rule, {
    tex: 'B_{j,i} = A_{i,j}',
    display: true,
    label: '转置的元素对应规则：B 的第 j 行第 i 列等于 A 的第 i 行第 j 列'
  });

  var dimText = block('p', 'nui-type-body nd-dim');
  rule.appendChild(dimText);

  /* ---------- 原矩阵与结果 ---------- */
  var figure = block('section', 'nd-section');
  column.append(figure);
  NoteUI.Typography.mount(figure, { variant: 'h2', as: 'h2', content: '原矩阵与转置结果' });

  var grid = NoteUI.Grid.mount(figure, { columns: 'auto', minColumnWidth: '22rem', gap: 'lg' });

  var matrixA = NoteViz.Matrix.mount(grid.el, {
    rows: [],
    columns: [],
    values: [],
    caption: '',
    label: '原矩阵 A'
  });

  var matrixB = NoteViz.Matrix.mount(grid.el, {
    rows: [],
    columns: [],
    values: [],
    caption: '',
    label: '转置结果 B'
  });

  var figureCaption = block('p', 'nui-type-caption nd-figure-caption');
  figure.appendChild(figureCaption);

  /* ---------- 元素位置对照 ---------- */
  var mapping = block('section', 'nd-section');
  column.append(mapping);
  NoteUI.Typography.mount(mapping, { variant: 'h2', as: 'h2', content: '三组元素的前后位置' });
  NoteUI.Typography.mount(mapping, {
    variant: 'body',
    content: '转置只交换下标：A 的第 i 行第 j 列，落到 B 的第 j 行第 i 列。'
  });

  var table = NoteUI.Table.mount(mapping, {
    columns: [
      { key: 'from', label: 'A 中的位置' },
      { key: 'value', label: '值', align: 'center' },
      { key: 'to', label: 'B 中的位置' }
    ],
    rows: [],
    rowKey: 'key',
    caption: '元素对应（高亮行是图中标出的元素）',
    empty: '暂无对应数据'
  });

  /* ---------- 换一组数据 ---------- */
  var switcher = block('section', 'nd-section');
  column.append(switcher);
  NoteUI.Typography.mount(switcher, { variant: 'h2', as: 'h2', content: '换一组数据' });

  var switchRow = block('div', 'nd-switch-row');
  switcher.appendChild(switchRow);
  var switchLabel = block('span', 'nd-switch-label');
  switchLabel.textContent = '当前示例';
  switchRow.appendChild(switchLabel);

  var segHost = block('div');
  segHost.setAttribute('aria-label', '切换示例矩阵');
  switchRow.appendChild(segHost);

  var segmented = NoteUI.Segmented.mount(segHost, {
    options: DATA.map(function (item) { return { value: item.key, label: item.segLabel }; }),
    value: DATA[0].key,
    onChange: function (value) {
      var next = DATA.filter(function (item) { return item.key === value; })[0];
      if (next) apply(next);
    }
  });

  NoteUI.Notice.mount(switcher, {
    title: '尺寸会跟着数据变',
    content: '两组示例交替 2×3 与 3×2。切换后矩阵表头、尺寸说明、元素对照表和图中的虚线标记一起更新；对应规则（B 的第 j 行第 i 列 = A 的第 i 行第 j 列）与具体尺寸无关，保持不变。',
    tone: 'neutral'
  });

  var foot = block('p', 'nui-type-caption nd-foot');
  foot.textContent = '本页只说明转置这一件事：行变成列，数值不变。不涉及行列式、逆矩阵或运算规则。';
  column.append(foot);

  /* ---------- 数据应用 ---------- */
  function apply(data) {
    var m = data.A.length;
    var n = data.A[0].length;

    matrixA.update({
      rows: rowDescs(m),
      columns: colDescs(n),
      values: data.A,
      caption: '转置前 A · ' + m + ' 行 × ' + n + ' 列',
      focus: { row: 'r1', col: 'c' + n }
    });

    matrixB.update({
      rows: rowDescs(n),
      columns: colDescs(m),
      values: data.B,
      caption: '转置后 B · ' + n + ' 行 × ' + m + ' 列',
      focus: { row: 'r' + n, col: 'c1' }
    });

    dimText.textContent = 'A 是 ' + m + ' 行 ' + n + ' 列（' + m + ' × ' + n + '）；转置后 B 是 ' + n + ' 行 ' +
      m + ' 列（' + n + ' × ' + m + '）。行数变成列数，列数变成行数，元素仍是 ' + (m * n) + ' 个。';

    figureCaption.textContent = '虚线框标出同一个元素：A 的第 1 行第 ' + n + ' 列是 ' + data.A[0][n - 1] +
      '，B 的第 ' + n + ' 行第 1 列也是 ' + data.B[n - 1][0] + '。';

    var pairs = [[0, 0], [0, n - 1], [m - 1, n - 1]];
    table.update({
      rows: pairs.map(function (pair, index) {
        return {
          key: 'p' + (index + 1),
          from: '行 ' + (pair[0] + 1) + ' · 列 ' + (pair[1] + 1),
          value: data.A[pair[0]][pair[1]],
          to: '行 ' + (pair[1] + 1) + ' · 列 ' + (pair[0] + 1)
        };
      }),
      emphasis: { row: 'p2' }
    });

    dimText.setAttribute('data-dataset', data.key);
  }

  apply(DATA[0]);

  /* 测试钩子：只暴露只读查询，便于复核当前显示尺寸。 */
  window.__sceneA = {
    getDataset: function () { return segmented.getValue(); },
    apply: function (key) {
      var next = DATA.filter(function (item) { return item.key === key; })[0];
      if (next) { segmented.update({ value: key }); apply(next); }
    }
  };
}());
