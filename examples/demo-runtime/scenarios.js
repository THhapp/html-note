/* NoteDemo demo-runtime examples — shared scenario factory for index.html and
 * standalone.html. Every scene is mounted through the public NoteDemo.mount API;
 * the page never auto-plays: readers advance with the default stage controls.
 * Plain JavaScript, classic script, offline file:// safe. No network, no eval.
 * Global: window.NoteDemoExamples
 */
(function (global) {
  'use strict';

  var NoteDemoExamples = global.NoteDemoExamples = global.NoteDemoExamples || {};
  var VERDICT_TONES = ['neutral', 'good', 'warn'];

  function el(tag, className, content) {
    var node = global.document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = String(content);
    return node;
  }

  function slot(name) {
    var node = el('div', 'demo-runtime__slot demo-runtime__slot--' + name);
    node.setAttribute('data-demo-slot', name);
    return node;
  }

  function twoPaneLayout(container) {
    var wrap = el('div', 'demo-runtime__layout demo-runtime__layout--two');
    var main = slot('main');
    var note = slot('note');
    wrap.appendChild(main);
    wrap.appendChild(note);
    container.appendChild(wrap);
    return { root: wrap, slots: { main: main, note: note } };
  }

  function quadLayout(container) {
    var wrap = el('div', 'demo-runtime__layout demo-runtime__layout--quad');
    var main = slot('main');
    var insert = slot('insert');
    var note = slot('note');
    var verdict = slot('verdict');
    wrap.appendChild(main);
    wrap.appendChild(insert);
    wrap.appendChild(note);
    wrap.appendChild(verdict);
    container.appendChild(wrap);
    return { root: wrap, slots: { main: main, insert: insert, note: note, verdict: verdict } };
  }

  /* ---------------- 最小自定义 Adapter：verdict（结论卡） ---------------- */

  function createVerdictAdapter() {
    function fail(message) {
      throw new Error('verdict Adapter：' + message);
    }
    function isObject(value) {
      return !!value && typeof value === 'object' && !Array.isArray(value);
    }
    function normalizeView(input) {
      if (!isObject(input)) fail('view 必须是 {text, tone} 对象');
      var text = input.text == null ? '' : String(input.text);
      var tone = input.tone == null ? 'neutral' : String(input.tone);
      if (VERDICT_TONES.indexOf(tone) < 0) fail('view.tone 只能是 neutral / good / warn');
      return { model: { text: text, tone: tone }, cues: {} };
    }
    function validateAction(action) {
      if (!isObject(action)) fail('action 必须是 {binding,type,params?} 对象');
      var type = action.type == null ? '' : String(action.type);
      if (type !== 'set') fail('不支持动作 "' + (type || '(空)') + '"，verdict 仅支持 set');
      if (action.params != null && !isObject(action.params)) fail('set 动作的 params 必须是对象');
    }
    function mount(host, options) {
      if (!host || host.nodeType !== 1) {
        throw new TypeError('verdict Adapter.mount(host, options)：host 必须是宿主任意元素。');
      }
      var container = el('div', 'note-demo-adapter note-demo-adapter--verdict');
      container.setAttribute('data-adapter', 'verdict');
      var root = el('div', 'demo-verdict');
      root.setAttribute('data-verdict-root', '');
      var label = el('p', 'demo-verdict__label', isObject(options) && options.label ? String(options.label) : '结论');
      var textEl = el('p', 'demo-verdict__text', '');
      root.appendChild(label);
      root.appendChild(textEl);
      container.appendChild(root);
      host.appendChild(container);
      var destroyed = false;
      var animation = null;

      function applyModel(model) {
        var tone = VERDICT_TONES.indexOf(model.tone) >= 0 ? model.tone : 'neutral';
        root.setAttribute('data-tone', tone);
        textEl.textContent = model.text;
      }
      function readModel() {
        return { text: textEl.textContent, tone: root.getAttribute('data-tone') || 'neutral' };
      }
      function cancelAnimation() {
        if (!animation) return;
        try { animation.cancel(); } catch (error) { /* already settled */ }
        animation = null;
      }

      return {
        restore: function (view) {
          if (destroyed) return;
          var model = (view && isObject(view.model)) ? view.model : {};
          applyModel({
            text: model.text == null ? '' : String(model.text),
            tone: model.tone == null ? 'neutral' : String(model.tone)
          });
        },
        readView: function () {
          if (destroyed) return null;
          return { model: readModel(), cues: {} };
        },
        target: function (query) {
          if (destroyed) return null;
          if (!isObject(query) || query.part !== 'root') return null;
          return root;
        },
        perform: function (action, ctx) {
          var params = isObject(action && action.params) ? action.params : {};
          var current = readModel();
          applyModel({
            text: params.text != null ? String(params.text) : current.text,
            tone: params.tone != null ? String(params.tone) : current.tone
          });
          var reduced = !!(ctx && ctx.motion === 'reduced');
          if (reduced || typeof root.animate !== 'function') {
            return {
              finished: Promise.resolve({ status: 'completed' }),
              cancel: function () {}
            };
          }
          cancelAnimation();
          var handle;
          try {
            animation = root.animate(
              [{ transform: 'scale(1)' }, { transform: 'scale(1.02)' }, { transform: 'scale(1)' }],
              { duration: 200, easing: 'ease-out' }
            );
            var currentAnimation = animation;
            var finished = currentAnimation.finished.then(function () {
              if (animation === currentAnimation) animation = null;
              return { status: 'completed' };
            }).catch(function () {
              return { status: 'cancelled' };
            });
            handle = {
              finished: finished,
              cancel: function () {
                cancelAnimation();
                try { finished.cancel; } catch (error) { /* promise has no cancel */ }
              }
            };
          } catch (error) {
            handle = { finished: Promise.resolve({ status: 'completed' }), cancel: function () {} };
          }
          return handle;
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          cancelAnimation();
          if (container.parentNode) container.parentNode.removeChild(container);
        }
      };
    }
    return {
      name: 'verdict',
      normalizeView: normalizeView,
      validateAction: validateAction,
      mount: mount
    };
  }

  var verdictAdapter = createVerdictAdapter();

  /* ---------------- 1. 静态矩阵 + DOM 文本 ---------------- */

  var MATRIX_ROWS = [{ id: 'r1', label: '需求' }, { id: 'r2', label: '实现' }];
  var MATRIX_COLUMNS = [{ id: 'c1', label: '步骤一' }, { id: 'c2', label: '步骤二' }];

  function matrixView(values, focusCells, changedCells, caption) {
    return {
      rows: MATRIX_ROWS,
      columns: MATRIX_COLUMNS,
      values: values,
      focus: { rows: [], cols: [], cells: focusCells || [] },
      changed: { rows: [], cols: [], cells: changedCells || [] },
      caption: caption || ''
    };
  }

  function matrixScenario() {
    return {
      definition: {
        bindings: {
          grid: { adapter: 'matrix', slot: 'main', options: { label: '示意矩阵', dense: true, maxHeight: 260 } },
          note: { adapter: 'dom', slot: 'note', options: { label: '说明文本' } }
        },
        frames: [
          {
            id: 'm0',
            caption: '第一步：矩阵的初始状态，右侧是同步恢复的文字说明。',
            views: {
              grid: matrixView([[1, 2], [3, 4]], [], [], '两行两列'),
              note: { text: '初始：四个单元依次为 1—4。' }
            },
            marks: []
          },
          {
            id: 'm1',
            caption: '第二步：直接恢复目标停点，左上单元变为 9。',
            views: {
              grid: matrixView([[9, 2], [3, 4]], [{ row: 'r1', col: 'c1' }], [{ row: 'r1', col: 'c1' }], '左上单元已更新'),
              note: { text: '左上单元从 1 变为 9，并保留关注与变化提示。' }
            },
            marks: [{ kind: 'focus', target: { binding: 'grid', query: { row: 'r1', col: 'c1' } }, mode: 'box' }]
          },
          {
            id: 'm2',
            caption: '第三步：恢复初始值，并用范围标记比较同一行。',
            views: {
              grid: matrixView([[1, 2], [3, 4]], [], [], '已恢复初始值'),
              note: { text: '回到初始值；需求行的两个单元被范围标记成组。' }
            },
            marks: [{
              kind: 'range',
              targets: [
                { binding: 'grid', query: { row: 'r1', col: 'c1' } },
                { binding: 'grid', query: { row: 'r1', col: 'c2' } }
              ],
              text: '同一行的两个单元',
              side: 'below'
            }]
          }
        ],
        transitions: []
      },
      title: '',
      label: '矩阵与文本示例',
      layout: twoPaneLayout
    };
  }

  /* ---------------- 2. M01 序列编辑 ---------------- */

  function seqItems(ids) {
    var labels = { a: 'A', b: 'B', c: 'C' };
    return ids.map(function (id) { return { id: id, label: labels[id] || id.toUpperCase() }; });
  }

  function sequenceEditScenario() {
    return {
      definition: {
        bindings: {
          seq: { adapter: 'sequence-edit', slot: 'main', options: { label: '示意序列' } }
        },
        frames: [
          {
            id: 'e0',
            caption: '第一步：初始序列 A、B、C，页面默认静止。',
            views: { seq: { items: seqItems(['a', 'b', 'c']), focus: [], changed: [] } },
            marks: []
          },
          {
            id: 'e1',
            caption: '第二步：删除 B，真实位移与 ghost 收尾后再检查目标。',
            views: { seq: { items: seqItems(['a', 'c']), focus: ['c'], changed: ['a'] } },
            marks: [
              { kind: 'focus', target: { binding: 'seq', query: { id: 'c' } }, mode: 'box' },
              { kind: 'link', from: { binding: 'seq', query: { id: 'a' } }, to: { binding: 'seq', query: { id: 'c' } }, label: '删除后相邻' }
            ]
          },
          {
            id: 'e2',
            caption: '第三步：交换 A 与 C；动作进行中可按“上一步”打断。',
            views: { seq: { items: seqItems(['c', 'a']), focus: ['a'], changed: ['c'] } },
            marks: [{ kind: 'focus', target: { binding: 'seq', query: { id: 'a' } }, mode: 'box' }]
          }
        ],
        transitions: [
          { from: 'e0', to: 'e1', actions: [{ binding: 'seq', type: 'remove', params: { id: 'b' } }], marks: [] },
          { from: 'e1', to: 'e2', actions: [{ binding: 'seq', type: 'swap', params: { a: 'a', b: 'c' } }], marks: [] }
        ]
      },
      title: '',
      label: '序列编辑示例'
    };
  }

  /* ---------------- 3. R10 序列插入 ---------------- */

  function sequenceInsertScenario() {
    return {
      definition: {
        bindings: {
          r: {
            adapter: 'sequence-insert',
            slot: 'main',
            options: {
              sequence: [{ key: 'a', text: 'A' }, { key: 'b', text: 'B' }, { key: 'c', text: 'C' }],
              insert: { index: 1, text: 'N' },
              unit: '项',
              labels: { group: '序列插入示例' }
            }
          }
        },
        frames: [
          {
            id: 'r0',
            caption: '第一步：插入前，待插入卡 N 在托盘等待。',
            views: { r: { inserted: false } },
            marks: [{ kind: 'focus', target: { binding: 'r', query: { kind: 'pending' } }, mode: 'box' }]
          },
          {
            id: 'r1',
            caption: '第二步：插入 N，B、C 依次让开；标记在重建 DOM 后重新定位。',
            views: { r: { inserted: true } },
            marks: [
              { kind: 'focus', target: { binding: 'r', query: { kind: 'inserted' } }, mode: 'box' },
              { kind: 'link', from: { binding: 'r', query: { kind: 'source', key: 'a' } }, to: { binding: 'r', query: { kind: 'inserted' } }, label: '新卡紧邻 A' }
            ]
          },
          {
            id: 'r2',
            caption: '第三步：还原：N 回到托盘，原序列复位。',
            views: { r: { inserted: false } },
            marks: [{ kind: 'focus', target: { binding: 'r', query: { kind: 'pending' } }, mode: 'box' }]
          },
          {
            id: 'r3',
            caption: '第四步：再插入一次；动作完成后逻辑引用仍可标记。',
            views: { r: { inserted: true } },
            marks: [{ kind: 'focus', target: { binding: 'r', query: { kind: 'inserted' } }, mode: 'box' }]
          },
          {
            id: 'r4',
            caption: '第五步：已在目标时再次插入，动作立即完成，不会悬挂。',
            views: { r: { inserted: true } },
            marks: [{ kind: 'focus', target: { binding: 'r', query: { kind: 'inserted' } }, mode: 'box' }]
          }
        ],
        transitions: [
          { from: 'r0', to: 'r1', actions: [{ binding: 'r', type: 'insert', params: {} }], marks: [
            { kind: 'focus', target: { binding: 'r', query: { kind: 'inserted' } }, mode: 'box' }
          ] },
          { from: 'r1', to: 'r2', actions: [{ binding: 'r', type: 'restore', params: {} }], marks: [] },
          { from: 'r2', to: 'r3', actions: [{ binding: 'r', type: 'insert', params: {} }], marks: [] },
          { from: 'r3', to: 'r4', actions: [{ binding: 'r', type: 'insert', params: {} }], marks: [] }
        ]
      },
      title: '',
      label: '序列插入示例'
    };
  }

  /* ---------------- 4. 联动场景：多 Binding 同一步 ---------------- */

  function linkedScenario() {
    return {
      definition: {
        bindings: {
          seq: { adapter: 'sequence-edit', slot: 'main', options: { label: '联动序列' } },
          r: {
            adapter: 'sequence-insert',
            slot: 'insert',
            options: {
              sequence: [{ key: 'a', text: 'A' }, { key: 'b', text: 'B' }, { key: 'c', text: 'C' }],
              insert: { index: 1, text: 'N' },
              unit: '项',
              labels: { group: '联动插入示例' }
            }
          },
          note: { adapter: 'dom', slot: 'note', options: { label: '联动说明' } },
          verdict: { adapter: 'verdict', slot: 'verdict', options: { label: '联动结论' } }
        },
        frames: [
          {
            id: 'l0',
            caption: '第一步：准备——序列三项，N 未插入，结论等待。',
            views: {
              seq: { items: seqItems(['a', 'b', 'c']), focus: [], changed: [] },
              r: { inserted: false },
              note: { text: '准备：删除 B，再插入 N，最后给出结论。' },
              verdict: { text: '等待操作。', tone: 'neutral' }
            },
            marks: []
          },
          {
            id: 'l1',
            caption: '第二步：同一步中执行序列删除、插入与自定义结论动作。',
            views: {
              seq: { items: seqItems(['a', 'c']), focus: ['c'], changed: ['a'] },
              r: { inserted: true },
              note: { text: '同一动作里：删除 B、插入 N，并更新结论卡。' },
              verdict: { text: '删除 B 并插入 N，条件成立。', tone: 'good' }
            },
            marks: [
              { kind: 'focus', target: { binding: 'seq', query: { id: 'c' } }, mode: 'box' },
              { kind: 'focus', target: { binding: 'r', query: { kind: 'inserted' } }, mode: 'box' },
              { kind: 'focus', target: { binding: 'verdict', query: { part: 'root' } }, mode: 'box' }
            ]
          },
          {
            id: 'l2',
            caption: '第三步：N 回到托盘，结论卡改回等待；序列保持删除后的两项。',
            views: {
              seq: { items: seqItems(['a', 'c']), focus: ['a'], changed: ['c'] },
              r: { inserted: false },
              note: { text: '还原：N 回到托盘，序列保持 A、C 两项。' },
              verdict: { text: 'N 已回到托盘，条件未成立。', tone: 'warn' }
            },
            marks: [
              { kind: 'focus', target: { binding: 'r', query: { kind: 'pending' } }, mode: 'box' },
              { kind: 'range', targets: [
                { binding: 'seq', query: { id: 'a' } },
                { binding: 'seq', query: { id: 'c' } }
              ], text: '保持同序的两项' }
            ]
          }
        ],
        transitions: [
          {
            from: 'l0',
            to: 'l1',
            /* 三个动作写入不同 Binding：同一步内一起开始，形成一次连续变化；
             * 不再让每个组件依次播完各自的完整收尾，避免本步被切成几段。 */
            actions: [{
              parallel: [
                { binding: 'seq', type: 'remove', params: { id: 'b' } },
                { binding: 'r', type: 'insert', params: {} },
                { binding: 'verdict', type: 'set', params: { text: '删除 B 并插入 N，条件成立。', tone: 'good' } }
              ]
            }],
            marks: [{ kind: 'focus', target: { binding: 'r', query: { kind: 'inserted' } }, mode: 'box' }]
          },
          {
            from: 'l1',
            to: 'l2',
            /* 还原与结论也是互不相干的两个 Binding，可以并列完成同一次变化。 */
            actions: [{
              parallel: [
                { binding: 'r', type: 'restore', params: {} },
                { binding: 'verdict', type: 'set', params: { text: 'N 已回到托盘，条件未成立。', tone: 'warn' } }
              ]
            }],
            marks: []
          }
        ]
      },
      title: '',
      label: '多组件联动示例',
      layout: quadLayout,
      adapters: { verdict: verdictAdapter }
    };
  }

  /* ---------------- 5. 自定义 Adapter 最小用法 ---------------- */

  function customScenario() {
    return {
      definition: {
        bindings: {
          verdict: { adapter: 'verdict', slot: 'main', options: { label: '自定义结论卡' } }
        },
        frames: [
          {
            id: 'v0',
            caption: '第一步：自定义 Adapter 恢复自己的结论卡画面。',
            views: { verdict: { text: '等待操作。', tone: 'neutral' } },
            marks: [{ kind: 'focus', target: { binding: 'verdict', query: { part: 'root' } }, mode: 'box' }]
          },
          {
            id: 'v1',
            caption: '第二步：由自定义 Adapter 的 perform 执行 set 动作。',
            views: { verdict: { text: '动作执行完成，结论为“成立”。', tone: 'good' } },
            marks: [{ kind: 'focus', target: { binding: 'verdict', query: { part: 'root' } }, mode: 'box' }]
          },
          {
            id: 'v2',
            caption: '第三步：再次执行动作，把结论改回提醒状态。',
            views: { verdict: { text: '需要再检查一次条件。', tone: 'warn' } },
            marks: [{ kind: 'focus', target: { binding: 'verdict', query: { part: 'root' } }, mode: 'box' }]
          }
        ],
        transitions: [
          { from: 'v0', to: 'v1', actions: [{ binding: 'verdict', type: 'set', params: { text: '动作执行完成，结论为“成立”。', tone: 'good' } }], marks: [] },
          { from: 'v1', to: 'v2', actions: [{ binding: 'verdict', type: 'set', params: { text: '需要再检查一次条件。', tone: 'warn' } }], marks: [] }
        ]
      },
      title: '',
      label: '自定义 Adapter 示例',
      adapters: { verdict: verdictAdapter }
    };
  }

  var SCENARIOS = [
    { id: 'matrix', title: '静态矩阵与 DOM 文本', create: matrixScenario },
    { id: 'sequence-edit', title: 'M01 删除与交换', create: sequenceEditScenario },
    { id: 'sequence-insert', title: 'R10 插入与还原', create: sequenceInsertScenario },
    { id: 'linked', title: '多 Binding 联动', create: linkedScenario },
    { id: 'custom', title: '最小自定义 Adapter', create: customScenario }
  ];

  NoteDemoExamples.scenarios = SCENARIOS.map(function (scenario) {
    return { id: scenario.id, title: scenario.title };
  });

  function readoutText(state) {
    if (!state || typeof state !== 'object') return '尚未开始';
    if (state.phase === 'running') return '过渡中 → ' + (state.targetFrameId || '…');
    if (state.phase === 'error') return '错误 · ' + (state.settledFrameId || '…');
    if (state.phase === 'disposed') return '已销毁';
    return '当前停点：' + (state.settledFrameId || '…');
  }

  function showReadout(node, text, isError) {
    if (!node) return;
    node.textContent = text;
    if (isError) node.setAttribute('data-demo-error', 'true');
    else node.removeAttribute('data-demo-error');
  }

  function findScenario(id) {
    for (var i = 0; i < SCENARIOS.length; i += 1) {
      if (SCENARIOS[i].id === id) return SCENARIOS[i];
    }
    return null;
  }

  NoteDemoExamples.readoutText = readoutText;

  NoteDemoExamples.boot = function (documentRef) {
    var doc = documentRef || global.document;
    var result = { mounted: 0, failed: 0, sessions: [] };
    if (!doc || typeof global.NoteDemo === 'undefined' || typeof global.NoteDemo.mount !== 'function') {
      return result;
    }
    var nodes = Array.prototype.slice.call(doc.querySelectorAll('[data-demo-scenario]'));
    nodes.forEach(function (node) {
      var id = node.getAttribute('data-demo-scenario');
      var host = node.querySelector('[data-demo-host]');
      var readout = node.querySelector('[data-demo-readout]');
      var scenario = findScenario(id);
      if (!scenario || !host) {
        showReadout(readout, '示例缺少场景定义：' + id, true);
        result.failed += 1;
        return;
      }
      try {
        var config = scenario.create();
        var session = global.NoteDemo.mount(host, {
          definition: config.definition,
          layout: config.layout,
          adapters: config.adapters,
          title: config.title,
          label: config.label
        });
        result.sessions.push(session);
        result.mounted += 1;
        node.setAttribute('data-demo-ready', 'true');
        session.subscribe(function (state) {
          showReadout(readout, readoutText(state), state && state.phase === 'error');
        });
      } catch (error) {
        result.failed += 1;
        showReadout(readout, '示例无法加载：' + (error && error.message ? error.message : String(error)), true);
        if (global.console && typeof global.console.warn === 'function') {
          global.console.warn('NoteDemoExamples：场景 ' + id + ' 挂载失败。', error);
        }
      }
    });
    NoteDemoExamples.lastBoot = result;
    NoteDemoExamples.destroyAll = function () {
      result.sessions.forEach(function (session) {
        try { session.destroy(); } catch (error) { /* page teardown only */ }
      });
      result.sessions.length = 0;
    };
    return result;
  };
})(window);