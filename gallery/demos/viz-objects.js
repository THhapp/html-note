/*! Gallery demos D01-D06 — real NoteViz mounts with replaceable data and states.
 *  Scope: gallery only; uses public NoteViz APIs. */
(function () {
  'use strict';

  var demos = window.NoteGalleryDemos = window.NoteGalleryDemos || {};

  function h(tag, className, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = String(content);
    return node;
  }

  function createDemo(host, ledeText) {
    var root = h('div', 'nviz-demo');
    var lede = h('p', 'nviz-demo__lede', ledeText);
    var controls = h('div', 'nviz-demo__controls');
    var stage = h('div', 'nviz-demo__stage');
    var note = h('p', 'nviz-demo__note');
    var buttonListeners = [];
    var instances = [];

    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', '演示控制');
    root.append(lede, controls, stage, note);
    host.appendChild(root);

    function addButton(label, onClick) {
      var button = h('button', 'nviz-demo__btn', label);
      button.type = 'button';
      button.addEventListener('click', onClick);
      buttonListeners.push({ node: button, handler: onClick });
      controls.appendChild(button);
      return button;
    }

    function addSection(titleText, descriptionText) {
      var section = h('section', 'nviz-demo__example');
      var head = h('div', 'nviz-demo__examplehead');
      head.appendChild(h('h3', 'nviz-demo__exampletitle', titleText));
      if (descriptionText) head.appendChild(h('p', 'nviz-demo__examplecopy', descriptionText));
      var body = h('div', 'nviz-demo__examplebody');
      section.append(head, body);
      stage.appendChild(section);
      return { section: section, body: body, head: head };
    }

    function track(instance) {
      if (instance && typeof instance.destroy === 'function') instances.push(instance);
      return instance;
    }

    function setNote(value) {
      note.textContent = value == null ? '' : String(value);
      note.hidden = !note.textContent;
    }

    function destroy() {
      instances.forEach(function (instance) {
        try { instance.destroy(); } catch (error) {}
      });
      instances.length = 0;
      buttonListeners.forEach(function (record) {
        record.node.removeEventListener('click', record.handler);
      });
      buttonListeners.length = 0;
      root.remove();
    }

    note.hidden = true;
    return {
      root: root,
      lede: lede,
      controls: controls,
      stage: stage,
      note: note,
      addButton: addButton,
      addSection: addSection,
      track: track,
      setNote: setNote,
      destroy: destroy
    };
  }

  function pressed(button, value) {
    button.setAttribute('aria-pressed', value ? 'true' : 'false');
  }

  /* =====================================================================
   * D01 — Sequence
   * ===================================================================== */

  demos.D01 = function (host) {
    var demo = createDemo(host,
      '同一批对象在更新后保持 ID 和元素位置关系。位串用等宽格，字节和盒子显示值或标签；关注用虚线内框，变化用实线与文字，两种状态同时出现时合并在一条提示里。');

    var dataSets = [
      {
        name: '示例 A：浮点位串',
        bits: [0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0],
        bitFocus: ['b1', 'b3'],
        bitChanged: ['b3', 'b12'],
        bytes: [
          { id: 'by0', label: '标志', value: '0x4A' },
          { id: 'by1', label: '长度', value: '0x0F' },
          { id: 'by2', label: '数据', value: '0xA3' },
          { id: 'by3', label: '校验', value: '0x10' }
        ],
        byteFocus: ['by1'],
        byteChanged: ['by1', 'by3'],
        boxes: [
          { id: 's0', label: '取数', value: '12' },
          { id: 's1', label: '计算', value: '24' },
          { id: 's2', label: '判断', value: '是' },
          { id: 's3', label: '分支', value: 'B' },
          { id: 's4', label: '写回', value: '24' }
        ],
        boxFocus: ['s1'],
        boxChanged: ['s1', 's4'],
        longFocus: ['L2'],
        longChanged: ['L2', 'L18']
      },
      {
        name: '示例 B：更换内容',
        bits: [1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0],
        bitFocus: ['b0', 'b12'],
        bitChanged: ['b0', 'b7'],
        bytes: [
          { id: 'by0', label: '标志', value: '0x81' },
          { id: 'by1', label: '长度', value: '0x20' },
          { id: 'by2', label: '数据', value: '0x5C' },
          { id: 'by3', label: '校验', value: '0x7E' }
        ],
        byteFocus: ['by0'],
        byteChanged: ['by0', 'by2'],
        boxes: [
          { id: 's0', label: '取数', value: '08' },
          { id: 's1', label: '计算', value: '16' },
          { id: 's2', label: '判断', value: '否' },
          { id: 's3', label: '分支', value: 'A' },
          { id: 's4', label: '写回', value: '16' }
        ],
        boxFocus: ['s4'],
        boxChanged: ['s0', 's4'],
        longFocus: ['L10'],
        longChanged: ['L10', 'L26']
      }
    ];

    var bitGroups = [
      { label: '符号位', start: 0, count: 1 },
      { label: '指数位', start: 1, count: 8 },
      { label: '尾数位', start: 9, count: 7 }
    ];
    var byteGroups = [
      { label: '首部', start: 0, count: 2 },
      { label: '数据', start: 2, count: 1 },
      { label: '尾部', start: 3, count: 1 }
    ];
    var longGroups = [
      { label: '段 1', start: 0, count: 10 },
      { label: '段 2', start: 10, count: 10 },
      { label: '段 3', start: 20, count: 10 }
    ];
    var bitsSection = demo.addSection('位串：分组、索引、关注与变化', '16 位序列按字段分组；同一对象 (b3) 同时被关注和标记变化。');
    var bitsHost = h('div');
    bitsSection.body.appendChild(bitsHost);
    var bits = demo.track(NoteViz.Sequence.mount(bitsHost, {
      variant: 'bits',
      index: true,
      label: '浮点数的位串字段',
      groups: bitGroups,
      items: dataSets[0].bits.map(function (v, index) {
        return { id: 'b' + index, value: v };
      }),
      focus: dataSets[0].bitFocus,
      changed: dataSets[0].bitChanged
    }));

    var variants = h('div', 'nviz-demo__grid');
    var bytesWrap = h('div');
    var boxesWrap = h('div');
    variants.append(bytesWrap, boxesWrap);
    bitsSection.body.appendChild(variants);
    bytesWrap.appendChild(h('p', 'nviz-demo__subhead', '字节：显示值、标签与分组'));
    boxesWrap.appendChild(h('p', 'nviz-demo__subhead', '盒子：步骤对象'));
    var bytes = demo.track(NoteViz.Sequence.mount(bytesWrap, {
      variant: 'bytes',
      label: '字节序列',
      groups: byteGroups,
      items: dataSets[0].bytes,
      focus: dataSets[0].byteFocus,
      changed: dataSets[0].byteChanged
    }));
    var boxes = demo.track(NoteViz.Sequence.mount(boxesWrap, {
      variant: 'boxes',
      label: '步骤序列',
      items: dataSets[0].boxes,
      focus: dataSets[0].boxFocus,
      changed: dataSets[0].boxChanged
    }));

    var longSection = demo.addSection('长序列：局部滚动', '下面故意放进较窄的容器；聚焦滚动区后可用左右方向键查看，滚动提示保持可见。');
    var narrow = h('div', 'nviz-demo__narrow');
    longSection.body.appendChild(narrow);
    var longValues = '010110101101001011010010110100'.split('').map(function (v, index) {
      return { id: 'L' + index, value: v };
    });
    var longSeq = demo.track(NoteViz.Sequence.mount(narrow, {
      variant: 'bits',
      index: true,
      dense: true,
      label: '长位串',
      groups: longGroups,
      items: longValues,
      focus: dataSets[0].longFocus,
      changed: dataSets[0].longChanged
    }));

    var setIndex = 0;
    var marked = true;
    function applyData() {
      var data = dataSets[setIndex];
      bits.update({
        items: data.bits.map(function (v, index) { return { id: 'b' + index, value: v }; }),
        focus: marked ? data.bitFocus : [],
        changed: marked ? data.bitChanged : []
      });
      bytes.update({
        items: data.bytes,
        focus: marked ? data.byteFocus : [],
        changed: marked ? data.byteChanged : []
      });
      boxes.update({
        items: data.boxes,
        focus: marked ? data.boxFocus : [],
        changed: marked ? data.boxChanged : []
      });
      longSeq.update({
        focus: marked ? data.longFocus : [],
        changed: marked ? data.longChanged : []
      });
      demo.note.textContent = data.name + '。虚线内框表示关注，实线加顶部色条表示变化；“关注并变化”在下方文字中合并说明，不叠两套标记。';
      demo.note.hidden = false;
    }
    var changeButton = demo.addButton('换一组内容', function () {
      setIndex = setIndex ? 0 : 1;
      applyData();
    });
    var markButton = demo.addButton('隐藏标记', function () {
      marked = !marked;
      markButton.textContent = marked ? '隐藏标记' : '恢复标记';
      pressed(markButton, !marked);
      applyData();
    });
    var resetButton = demo.addButton('重置', function () {
      setIndex = 0;
      marked = true;
      markButton.textContent = '隐藏标记';
      pressed(markButton, false);
      applyData();
    });
    pressed(markButton, false);
    applyData();
    return { destroy: demo.destroy };
  };

  /* =====================================================================
   * D02 — Matrix
   * ===================================================================== */

  demos.D02 = function (host) {
    var demo = createDemo(host,
      '矩阵使用原生 table/th scope，行、列和单元可以分别关注或标记变化；表头标签与单元状态都有文字。表格较大时在内部横向和纵向滚动。');

    var rows = [];
    var columns = [];
    var labels = ['输入校验', '权重读取', '缓存命中', '归一化', '卷积层', '激活值', '池化', '误差回传', '参数更新', '结果写出'];
    for (var r = 0; r < 10; r += 1) {
      rows.push({ id: 'r' + r, label: labels[r] + ' · 节点 ' + (r + 1) });
    }
    for (var c = 0; c < 10; c += 1) {
      columns.push({ id: 'c' + c, label: '轮次 ' + (c + 1) + ' / 通道 ' + String.fromCharCode(65 + c) });
    }
    function makeValues(seed) {
      return rows.map(function (_, rowIndex) {
        return columns.map(function (_, colIndex) {
          return ((rowIndex + 2) * (colIndex + 3) * 7 + seed * 11) % 100;
        });
      });
    }
    var marks = [
      {
        focus: { rows: ['r2', 'r3'], columns: ['c4'] },
        changed: { rows: ['r7'], columns: ['c8'], cells: [{ row: 'r2', col: 'c4' }] }
      },
      {
        focus: { cells: [{ row: 'r1', col: 'c2' }], range: { rows: ['r4', 'r5'], columns: ['c5', 'c6'] } },
        changed: { range: { rows: ['r1', 'r2'], columns: ['c2', 'c3'] }, cells: [{ row: 'r8', col: 'c1' }] }
      }
    ];
    var matrixSection = demo.addSection('10 × 10 矩阵：表头与单元标记', '拖动或滚动表格可查看完整内容；关注行/列与变化单元的标记保持不同。');
    var matrixHost = h('div');
    var narrow = h('div', 'nviz-demo__matrixwrap');
    narrow.appendChild(matrixHost);
    matrixSection.body.appendChild(narrow);

    var matrix = demo.track(NoteViz.Matrix.mount(matrixHost, {
      rows: rows,
      columns: columns,
      values: makeValues(0),
      caption: '10 × 10 状态矩阵 · 单元值为耗时（毫秒）',
      label: '状态矩阵',
      maxHeight: 280,
      focus: marks[0].focus,
      changed: marks[0].changed,
      cellRenderer: function (value, context) {
        return String(value) + ' ms';
      }
    }));

    var seed = 0;
    var markIndex = 0;
    function applyState() {
      var currentMarks = marks[markIndex];
      matrix.update({
        values: makeValues(seed),
        caption: (markIndex === 0 ?
          '10 × 10 状态矩阵 · 行关注 / 列关注 / 单元变化' :
          '10 × 10 状态矩阵 · 单元关注 / 范围变化'),
        focus: currentMarks.focus,
        changed: currentMarks.changed
      });
      demo.note.textContent = markIndex === 0 ?
        '第 1 组标记：关注第 3–4 行与第 5 列，变化第 8 行、第 9 列，并在 (第 3 行, 第 5 列) 合并显示关注与变化。' :
        '第 2 组标记：直接关注一个单元与一块区域；变化覆盖另一个范围和右下角单元。表头标签说明行/列状态，单元角标说明直接单元状态。';
    }
    var dataButton = demo.addButton('换一组数值', function () {
      seed = seed ? 0 : 1;
      matrix.update({ values: makeValues(seed) });
    });
    var markButton = demo.addButton('换标记方式', function () {
      markIndex = markIndex ? 0 : 1;
      applyState();
    });
    demo.addButton('重置', function () {
      seed = 0;
      markIndex = 0;
      applyState();
    });
    applyState();
    return { destroy: demo.destroy };
  };

  /* =====================================================================
   * D03 — Graph
   * ===================================================================== */

  demos.D03 = function (host) {
    var demo = createDemo(host,
      '节点和边由宿主提供。分层布局按有向关系排布，手动布局使用节点坐标；有向边显示箭头，分组用编号节点标记和上方图例说明。宽画布只在组件内部滚动。');

    var baseNodes = [
      { id: 'n1', label: '输入样本', group: '输入', x: 120, y: 90 },
      { id: 'n2', label: '格式校验', group: '输入', x: 120, y: 280 },
      { id: 'n3', label: '归一化', group: '处理', x: 390, y: 135 },
      { id: 'n4', label: '计算得分', group: '处理', x: 640, y: 220 },
      { id: 'n5', label: '阈值判断', group: '输出', x: 875, y: 115 },
      { id: 'n6', label: '保留结果', group: '输出', x: 1110, y: 55 },
      { id: 'n7', label: '丢弃结果', group: '输出', x: 1110, y: 300 }
    ];
    var baseEdges = [
      { from: 'n1', to: 'n3', label: '读取', directed: true },
      { from: 'n2', to: 'n3', label: '校验通过', directed: true },
      { from: 'n3', to: 'n4', label: '向量', directed: true },
      { from: 'n4', to: 'n5', label: '得分', directed: true },
      { from: 'n5', to: 'n6', label: '达到阈值', directed: true },
      { from: 'n5', to: 'n7', label: '低于阈值', directed: true }
    ];
    var dataSets = [
      {
        nodes: baseNodes,
        edges: baseEdges,
        focus: ['n3'],
        changed: ['n4', 'n6']
      },
      {
        nodes: baseNodes.map(function (node) {
          if (node.id === 'n4') return Object.assign({}, node, { label: '加权计算' });
          if (node.id === 'n5') return Object.assign({}, node, { label: '门限判断' });
          return Object.assign({}, node);
        }),
        edges: baseEdges.map(function (edge) {
          if (edge.from === 'n4') return Object.assign({}, edge, { label: '加权得分' });
          return Object.assign({}, edge);
        }),
        focus: ['n1', 'n5'],
        changed: ['n5', 'n7']
      }
    ];

    var section = demo.addSection('关系图：分层与手动坐标', '点击任意节点会调用 onSelect；键盘聚焦节点后按 Enter 或空格也可触发。');
    var graphHost = h('div');
    section.body.appendChild(graphHost);
    var feedback = h('p', 'nviz-demo__feedback', '未选择节点。');
    section.body.appendChild(feedback);

    var manual = false;
    var dataIndex = 0;
    var graph = demo.track(NoteViz.Graph.mount(graphHost, {
      nodes: baseNodes,
      edges: baseEdges,
      layout: 'layered',
      focus: dataSets[0].focus,
      changed: dataSets[0].changed,
      label: '处理流程关系图',
      onSelect: function (id) {
        var found = null;
        dataSets[dataIndex].nodes.forEach(function (node) {
          if (node.id === id) found = node;
        });
        feedback.textContent = found ? '已选择：' + found.label + '（' + id + '）' : '已选择：' + id;
      }
    }));

    function applyLayout() {
      if (manual) {
        graph.update({ layout: 'manual', width: 1250, height: 420 });
      } else {
        graph.update({ layout: 'layered', width: null, height: null });
      }
      layoutButton.textContent = manual ? '切换为分层布局' : '切换为手动布局';
      pressed(layoutButton, manual);
    }
    function applyData() {
      var data = dataSets[dataIndex];
      graph.update({
        nodes: data.nodes,
        edges: data.edges,
        focus: data.focus,
        changed: data.changed
      });
      demo.note.textContent = dataIndex === 0 ?
        '当前示例：分层布局下关注“归一化”，变化“计算得分”和“保留结果”。分组编号 1–3 与图例对应。' :
        '当前示例：更换了节点与边标签，关注“输入样本”和“门限判断”，变化“门限判断”和“丢弃结果”。';
      demo.note.hidden = false;
    }
    var layoutButton = demo.addButton('切换为手动布局', function () {
      manual = !manual;
      applyLayout();
    });
    var dataButton = demo.addButton('换一组内容', function () {
      dataIndex = dataIndex ? 0 : 1;
      applyData();
    });
    demo.addButton('重置', function () {
      manual = false;
      dataIndex = 0;
      applyLayout();
      applyData();
      feedback.textContent = '未选择节点。';
    });
    pressed(layoutButton, false);
    applyData();
    return { destroy: demo.destroy };
  };

  /* =====================================================================
   * D04 — Timeline
   * ===================================================================== */

  demos.D04 = function (host) {
    var demo = createDemo(host,
      '事件、区间和阶段使用不同标记形状，时间文字直接出现在每一项上。时间与当前项可由程序替换；组件不自动播放，推进由宿主控制。');

    var dataSets = [
      {
        name: '训练周期',
        items: [
          { id: 't0', label: '准备数据', timeLabel: '第 0 天', kind: 'event', description: '整理输入字段与缺失值。' },
          { id: 't1', label: '采样窗口', timeLabel: '第 1–3 天', kind: 'range', start: 1, end: 3, description: '为训练和验证划分样本。' },
          { id: 't2', label: '训练阶段', timeLabel: '第 3–8 天', kind: 'phase', start: 3, end: 8, description: '分批次训练并记录损失。' },
          { id: 't3', label: '离线检查', timeLabel: '第 9 天', kind: 'event', description: '复核阈值与错误样本。' },
          { id: 't4', label: '交付结果', timeLabel: '第 10 天', kind: 'event', description: '整理结果与限制说明。' }
        ],
        current: 't2',
        focus: ['t1', 't2'],
        changed: ['t2', 't3'],
        start: '第 0 天',
        end: '第 10 天'
      },
      {
        name: '短周期',
        items: [
          { id: 't0', label: '接收请求', timeLabel: 'T+0', kind: 'event', description: '记录输入。' },
          { id: 't1', label: '批处理窗口', timeLabel: 'T+1 至 T+4', kind: 'range', start: 1, end: 4, description: '合并小请求。' },
          { id: 't2', label: '写回', timeLabel: 'T+5', kind: 'event', description: '生成响应。' },
          { id: 't3', label: '冷却', timeLabel: 'T+6 至 T+9', kind: 'phase', start: 6, end: 9, description: '等待下一次窗口。' }
        ],
        current: 't1',
        focus: ['t3'],
        changed: ['t1', 't3'],
        start: 'T+0',
        end: 'T+9'
      }
    ];
    var section = demo.addSection('事件与阶段：横向与纵向', '当前对象带有“当前”标签；同一项兼具关注和变化时，状态文字合并为一个标签。');
    var timelineHost = h('div');
    section.body.appendChild(timelineHost);
    var orientation = 'horizontal';
    var dataIndex = 0;
    var timeline = demo.track(NoteViz.Timeline.mount(timelineHost, {
      items: dataSets[0].items,
      orientation: orientation,
      current: dataSets[0].current,
      focus: dataSets[0].focus,
      changed: dataSets[0].changed,
      start: dataSets[0].start,
      end: dataSets[0].end,
      label: '训练周期时间线'
    }));

    function applyData() {
      var data = dataSets[dataIndex];
      timeline.update({
        items: data.items,
        current: data.current,
        focus: data.focus,
        changed: data.changed,
        start: data.start,
        end: data.end,
        label: data.name + '时间线'
      });
      demo.note.textContent = '当前示例：' + data.name + '。时间线按 items 顺序组织，时间来自 timeLabel（或时间字段）；长内容使用组件内部滚动，不自动推进。';
      demo.note.hidden = false;
    }
    var orientationButton = demo.addButton('切换为纵向', function () {
      orientation = orientation === 'horizontal' ? 'vertical' : 'horizontal';
      timeline.update({ orientation: orientation });
      orientationButton.textContent = orientation === 'horizontal' ? '切换为纵向' : '切换为横向';
      pressed(orientationButton, orientation === 'vertical');
    });
    var dataButton = demo.addButton('换一组内容', function () {
      dataIndex = dataIndex ? 0 : 1;
      applyData();
    });
    demo.addButton('重置', function () {
      orientation = 'horizontal';
      dataIndex = 0;
      timeline.update({ orientation: orientation });
      orientationButton.textContent = '切换为纵向';
      pressed(orientationButton, false);
      applyData();
    });
    pressed(orientationButton, false);
    applyData();
    return { destroy: demo.destroy };
  };

  /* =====================================================================
   * D05 — TreeDiagram
   * ===================================================================== */

  demos.D05 = function (host) {
    var demo = createDemo(host,
      '树形图从宿主层级数据生成，只承担“看得见父子关系”这一件事；它不是可展开目录。方向可在向下和向右之间切换，深树或宽树在组件内部滚动。');

    var treeA = [{
      id: 'root', label: '输入样本', children: [
        { id: 'parse', label: '解析', children: [
          { id: 'lex', label: '词法切分' },
          { id: 'syntax', label: '语法分析', children: [
            { id: 'ast', label: '抽象语法树', children: [
              { id: 'expr', label: '表达式节点' }
            ] }
          ] }
        ] },
        { id: 'evaluate', label: '执行', children: [
          { id: 'semantic', label: '语义检查', children: [
            { id: 'symbols', label: '符号表' }
          ] },
          { id: 'runtime', label: '运行', children: [
            { id: 'cache', label: '缓存命中' },
            { id: 'output', label: '输出结果' }
          ] }
        ] }
      ]
    }];
    var treeB = [{
      id: 'root', label: '请求入口', children: [
        { id: 'parse', label: '规范化', children: [
          { id: 'lex', label: '拆分字段' },
          { id: 'syntax', label: '组合结构', children: [
            { id: 'ast', label: '中间表示', children: [
              { id: 'expr', label: '子表达式' }
            ] }
          ] }
        ] },
        { id: 'evaluate', label: '处理', children: [
          { id: 'semantic', label: '规则检查', children: [
            { id: 'symbols', label: '规则表' }
          ] },
          { id: 'runtime', label: '执行器', children: [
            { id: 'cache', label: '缓存分支' },
            { id: 'output', label: '响应结果' }
          ] }
        ] }
      ]
    }];
    var marks = [
      { focus: ['parse', 'ast'], changed: ['ast', 'runtime'] },
      { focus: ['root', 'runtime'], changed: ['root', 'expr'] }
    ];
    var section = demo.addSection('层级结构：向下 / 向右', '节点状态写进节点内部的文字标签；虚线轮廓为关注，实线轮廓为变化，两者同时存在时只显示一条合并状态。');
    var treeHost = h('div');
    section.body.appendChild(treeHost);
    var orientation = 'down';
    var dataIndex = 0;
    var markIndex = 0;
    var tree = demo.track(NoteViz.TreeDiagram.mount(treeHost, {
      nodes: treeA,
      orientation: orientation,
      focus: marks[0].focus,
      changed: marks[0].changed,
      label: '解析与执行层级'
    }));

    function applyState() {
      tree.update({
        nodes: dataIndex === 0 ? treeA : treeB,
        orientation: orientation,
        focus: marks[markIndex].focus,
        changed: marks[markIndex].changed
      });
      demo.note.textContent = '当前示例：' + (dataIndex === 0 ? '解析与执行' : '请求处理') +
        '。节点内部的“关注”“变化”文字与轮廓线型同时表达状态；组件不提供展开、收起或选中。';
      demo.note.hidden = false;
    }
    var orientationButton = demo.addButton('切换为向右', function () {
      orientation = orientation === 'down' ? 'right' : 'down';
      tree.update({ orientation: orientation });
      orientationButton.textContent = orientation === 'down' ? '切换为向右' : '切换为向下';
      pressed(orientationButton, orientation === 'right');
    });
    var markButton = demo.addButton('换一组重点', function () {
      markIndex = markIndex ? 0 : 1;
      applyState();
    });
    var dataButton = demo.addButton('换节点文案', function () {
      dataIndex = dataIndex ? 0 : 1;
      applyState();
    });
    demo.addButton('重置', function () {
      orientation = 'down';
      dataIndex = 0;
      markIndex = 0;
      orientationButton.textContent = '切换为向右';
      pressed(orientationButton, false);
      applyState();
    });
    pressed(orientationButton, false);
    applyState();
    return { destroy: demo.destroy };
  };

  /* =====================================================================
   * D06 — CompareView
   * ===================================================================== */

  demos.D06 = function (host) {
    var demo = createDemo(host,
      '左右内容由宿主提供，共同的字段按相同顺序对应。变化位置在内容内明确标出，容器负责并排/上下布局与变化侧提示；窄容器会由组件自动转为上下排列。');

    var stateSets = [
      [
        { key: '计数', left: '12', right: '15', changed: true },
        { key: '模式', left: '手动', right: '自动', changed: true },
        { key: '阈值', left: '0.80', right: '0.80', changed: false },
        { key: '输出', left: '未生成', right: '已生成', changed: true }
      ],
      [
        { key: '队列', left: '3', right: '1', changed: true },
        { key: '状态', left: '等待', right: '完成', changed: true },
        { key: '重试', left: '0', right: '0', changed: false },
        { key: '责任', left: '甲', right: '甲', changed: false }
      ]
    ];

    function makeContent(side, setIndex) {
      var rows = stateSets[setIndex];
      var wrap = h('div', 'nviz-demo__states');
      wrap.setAttribute('role', 'list');
      rows.forEach(function (row) {
        var line = h('div', 'nviz-demo__staterow');
        if (side === 'right' && row.changed) line.className += ' nviz-demo__staterow--changed';
        line.setAttribute('role', 'listitem');
        line.appendChild(h('span', 'nviz-demo__statekey', row.key));
        line.appendChild(h('span', 'nviz-demo__statevalue', side === 'left' ? row.left : row.right));
        if (side === 'right' && row.changed) {
          line.appendChild(h('span', 'nviz-demo__stateflag', '变化'));
        }
        wrap.appendChild(line);
      });
      return wrap;
    }

    var labels = {
      left: '前态',
      right: '后态',
      compare: '对照',
      changed: '变化侧',
      stacked: '窄容器：已自动改为上下对照。'
    };
    var section = demo.addSection('同一组字段的前后对照', '两侧内容顺序一致，便于按字段对应；右侧的变化标签指出变化位置。窄容器演示会把容器压到 340px，触发布局自动转上下。');
    var wrap = h('div', 'nviz-demo__comparewrap');
    var compareHost = h('div');
    wrap.appendChild(compareHost);
    section.body.appendChild(wrap);

    var mode = 'side-by-side';
    var setIndex = 0;
    var narrow = false;
    var compare = demo.track(NoteViz.CompareView.mount(compareHost, {
      left: { title: '处理前', content: makeContent('left', 0) },
      right: { title: '处理后', content: makeContent('right', 0) },
      labels: labels,
      mode: mode,
      focusChanged: 'right'
    }));

    function applyState() {
      compare.update({
        left: { title: '处理前', content: makeContent('left', setIndex) },
        right: { title: '处理后', content: makeContent('right', setIndex) },
        labels: labels,
        mode: mode,
        focusChanged: 'right'
      });
      demo.note.textContent = '当前示例：第 ' + (setIndex + 1) + ' 组状态，强调侧为右侧。共同对象由两侧相同字段对应；变化文字只出现在右侧内容中，容器本身不推断差异。';
      demo.note.hidden = false;
    }
    var modeButton = demo.addButton('切换为上下', function () {
      mode = mode === 'side-by-side' ? 'stacked' : 'side-by-side';
      compare.update({ mode: mode });
      modeButton.textContent = mode === 'side-by-side' ? '切换为上下' : '切换为并排';
      pressed(modeButton, mode === 'stacked');
    });
    var narrowButton = demo.addButton('窄容器演示', function () {
      narrow = !narrow;
      wrap.classList.toggle('nviz-demo__comparewrap--narrow', narrow);
      pressed(narrowButton, narrow);
    });
    var dataButton = demo.addButton('换一组状态', function () {
      setIndex = setIndex ? 0 : 1;
      applyState();
    });
    demo.addButton('重置', function () {
      mode = 'side-by-side';
      narrow = false;
      setIndex = 0;
      wrap.classList.remove('nviz-demo__comparewrap--narrow');
      modeButton.textContent = '切换为上下';
      pressed(modeButton, false);
      pressed(narrowButton, false);
      compare.update({ mode: mode });
      applyState();
    });
    pressed(modeButton, false);
    pressed(narrowButton, false);
    applyState();
    return { destroy: demo.destroy };
  };
})();
