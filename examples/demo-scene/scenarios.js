/* NoteDemo demo-scene examples — 真实 scene 接入样例（字节填充 / 另一组数据 / 自定义 cut+reveal）。
 * index.html 与 standalone.html 共用本文件；页面默认静止，只用 NoteDemo.mount 的默认控件推进。
 * 承载 D01 sequence adapter（layout）与内置 dom adapter（reveal），不另写播放器。
 * 经典脚本，无模块 / 无网络 / 无 eval。Global: window.NoteDemoSceneExamples
 */
(function (global) {
  'use strict';

  var NoteDemoSceneExamples = global.NoteDemoSceneExamples = global.NoteDemoSceneExamples || {};

  function el(tag, className, content) {
    var node = global.document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = String(content);
    return node;
  }

  function slot(name) {
    var node = el('div', 'demo-scene__slot demo-scene__slot--' + name);
    node.setAttribute('data-demo-slot', name);
    return node;
  }

  /* 默认舞台的“画布 + 读数 + 字幕 + 操作”由宿主装配。
   * 画布是唯一的大面积演示表面；读数只是画布右侧的窄结果区，不是第二块字幕。 */
  function canvasWithResultLayout(container) {
    var wrap = el('div', 'demo-scene__canvas demo-scene__canvas--split');
    var main = slot('wire');
    main.classList.add('demo-scene__canvas-main');
    var readout = el('aside', 'demo-scene__readout-panel');
    var label = el('p', 'demo-scene__readout-label', '结果 · 接收端');
    var value = slot('result');
    value.classList.add('demo-scene__readout-value');
    readout.append(label, value);
    wrap.append(main, readout);
    container.appendChild(wrap);
    return { root: wrap, slots: { main: main, result: value } };
  }

  function canvasSoloLayout(container) {
    var wrap = el('div', 'demo-scene__canvas demo-scene__canvas--solo');
    var main = slot('wire');
    main.classList.add('demo-scene__canvas-main');
    wrap.appendChild(main);
    container.appendChild(wrap);
    return { root: wrap, slots: { main: main } };
  }

  function canvasPanelLayout(container) {
    var wrap = el('div', 'demo-scene__canvas demo-scene__canvas--panels');
    /* NoteDemo.mount 的 layout 必须提供 main 插槽；这里 cut 容器本身就是 main。 */
    var cut = slot('cut');
    var reveal = slot('reveal');
    cut.classList.add('demo-scene__canvas-panel');
    reveal.classList.add('demo-scene__canvas-panel');
    cut.setAttribute('data-panel-title', '说明');
    reveal.setAttribute('data-panel-title', '结论');
    wrap.append(cut, reveal);
    container.appendChild(wrap);
    return { root: wrap, slots: { main: cut, reveal: reveal } };
  }

  /* ---------------- ③ 最小自定义 Adapter：cut / reveal 两个容器 ---------------- */

  function createPanelAdapter() {
    function normalizeView(input) {
      if (!input || typeof input !== 'object') throw new Error('panel Adapter：view 必须是 {text} 对象');
      var text = input.text == null ? '' : String(input.text);
      return { model: { text: text }, cues: {} };
    }
    function validateAction() {
      throw new Error('panel Adapter：scene 接入不使用 actions 动作。');
    }
    function mount(host) {
      var container = el('div', 'note-demo-adapter note-demo-adapter--panel');
      container.setAttribute('data-adapter', 'panel');
      var root = el('div', 'demo-panel');
      var panelTitle = host.getAttribute && host.getAttribute('data-panel-title');
      if (!panelTitle && typeof host.closest === 'function') {
        var titled = host.closest('[data-panel-title]');
        if (titled && titled.getAttribute) panelTitle = titled.getAttribute('data-panel-title');
      }
      var title = el('p', 'demo-panel__title', panelTitle || '扩展容器');
      var text = el('p', 'demo-panel__text', '');
      root.appendChild(title);
      root.appendChild(text);
      container.appendChild(root);
      host.appendChild(container);
      var destroyed = false;
      function readModel() {
        return { text: text.textContent };
      }
      return {
        restore: function (view) {
          if (destroyed) return;
          var model = view && view.model ? view.model : {};
          text.textContent = model.text == null ? '' : String(model.text);
        },
        readView: function () {
          if (destroyed) return null;
          return { model: readModel(), cues: {} };
        },
        target: function (query) {
          if (destroyed) return null;
          if (!query || query.part !== 'root') return null;
          return root;
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          if (container.parentNode) container.parentNode.removeChild(container);
        }
      };
    }
    return {
      name: 'panel',
      sceneModes: ['cut', 'reveal'],
      normalizeView: normalizeView,
      validateAction: validateAction,
      mount: mount
    };
  }

  var panelAdapter = createPanelAdapter();

  /* ---------------- ① 字节填充代表：41 7E 7D 42 → 41 7D 5E 7D 5D 42 ---------------- */

  var RAW_BYTES = [
    { id: 'p0', value: '41', label: '' },
    { id: 'p1', value: '7E', label: '' },
    { id: 'p2', value: '7D', label: '' },
    { id: 'p3', value: '42', label: '' }
  ];
  var STUFFED_BYTES = [
    { id: 'p0', value: '41', label: '' },
    { id: 'e1', value: '7D', label: '插入' },
    { id: 'p1', value: '5E', label: '' },
    { id: 'e2', value: '7D', label: '插入' },
    { id: 'p2', value: '5D', label: '' },
    { id: 'p3', value: '42', label: '' }
  ];

  function sceneDefinition(rawItems, stuffedItems, copy) {
    var showResult = copy.result !== false;
    var bindings = {
      wire: { adapter: 'sequence', slot: 'main', options: { variant: 'bytes', label: copy.wireLabel } }
    };
    var rawViews = { wire: { items: rawItems, groups: [], focus: [], changed: [] } };
    var stuffedViews = { wire: { items: stuffedItems, groups: [], focus: [], changed: copy.changed } };
    var sceneBindings = [{ binding: 'wire', mode: 'layout' }];
    if (showResult) {
      bindings.result = { adapter: 'dom', slot: 'result', options: { label: '接收端' } };
      rawViews.result = { text: copy.rawResult };
      stuffedViews.result = { text: copy.stuffedResult };
      sceneBindings.push({ binding: 'result', mode: 'reveal', at: 'objects-settled' });
    }
    return {
      bindings: bindings,
      frames: [
        { id: 'raw', caption: copy.rawCaption, views: rawViews, marks: [] },
        { id: 'stuffed', caption: copy.stuffedCaption, views: stuffedViews, marks: copy.marks }
      ],
      transitions: [{
        from: 'raw',
        to: 'stuffed',
        scene: { bindings: sceneBindings }
      }]
    };
  }

  function byteStuffingScenario() {
    return {
      definition: sceneDefinition(RAW_BYTES, STUFFED_BYTES, {
        wireLabel: '线路上的字节',
        rawCaption: '原始数据 41 7E 7D 42；7E 与 7D 在帧边界中有特殊含义。',
        rawResult: '等待还原',
        stuffedCaption: '特殊字节前插入 7D，原字节改写为 5E、5D；接收端仍能还原。',
        stuffedResult: '41 7E 7D 42',
        changed: ['e1', 'p1', 'e2', 'p2'],
        marks: [
          { kind: 'range', targets: [
            { binding: 'wire', query: { id: 'e1' } },
            { binding: 'wire', query: { id: 'p1' } }
          ], text: '7E 的转义', side: 'above' },
          { kind: 'range', targets: [
            { binding: 'wire', query: { id: 'e2' } },
            { binding: 'wire', query: { id: 'p2' } }
          ], text: '7D 的转义', side: 'above' }
        ]
      }),
      label: '字节填充示例',
      layout: canvasWithResultLayout,
      result: true
    };
  }

  /* ---------------- ② 另一组数据：90 7E 80 41 → 90 7D 5E 7D 80 41 ---------------- */

  var OTHER_RAW = [
    { id: 'p0', value: '90', label: '' },
    { id: 'p1', value: '7E', label: '' },
    { id: 'p2', value: '80', label: '' },
    { id: 'p3', value: '41', label: '' }
  ];
  var OTHER_STUFFED = [
    { id: 'p0', value: '90', label: '' },
    { id: 'e1', value: '7D', label: '插入' },
    { id: 'p1', value: '5E', label: '' },
    { id: 'e2', value: '7D', label: '插入' },
    { id: 'p2', value: '80', label: '' },
    { id: 'p3', value: '41', label: '' }
  ];

  function otherBytesScenario() {
    return {
      definition: sceneDefinition(OTHER_RAW, OTHER_STUFFED, {
        wireLabel: '另一组线路字节',
        rawCaption: '换一组字节 90 7E 80 41；其中 7E 同样需要保护。',
        stuffedCaption: '7E 写作 7D 5E；80 与 41 保持原值，只随位置后移。',
        result: false,
        changed: ['e1', 'p1'],
        marks: [
          { kind: 'range', targets: [
            { binding: 'wire', query: { id: 'e1' } },
            { binding: 'wire', query: { id: 'p1' } }
          ], text: '7E 的转义', side: 'above' }
        ]
      }),
      label: '另一组字节示例',
      layout: canvasSoloLayout
    };
  }

  /* ---------------- ③ 自定义 Adapter：同一步 cut + reveal ---------------- */

  function customPanelScenario() {
    return {
      definition: {
        bindings: {
          cut: { adapter: 'panel', slot: 'main' },
          reveal: { adapter: 'panel', slot: 'reveal' }
        },
        frames: [
          {
            id: 'p0',
            caption: '两个容器共同组成当前画面；先看它们各自的状态。',
            views: {
              cut: { text: '特殊字节直接发送。' },
              reveal: { text: '等待对象步骤结束。' }
            },
            marks: []
          },
          {
            id: 'p1',
            caption: '说明与结论一起到位：一个直接提交，一个在对象步骤结束后揭示。',
            views: {
              cut: { text: '特殊字节先转义。' },
              reveal: { text: '接收端仍能还原。' }
            },
            marks: []
          }
        ],
        transitions: [{
          from: 'p0',
          to: 'p1',
          scene: {
            bindings: [
              { binding: 'cut', mode: 'cut' },
              { binding: 'reveal', mode: 'reveal', at: 'start' }
            ]
          }
        }]
      },
      label: '自定义 scene Adapter 示例',
      layout: canvasPanelLayout,
      adapters: { panel: panelAdapter }
    };
  }

  var SCENARIOS = [
    { id: 'scene-bytes', title: '字节填充', create: byteStuffingScenario },
    { id: 'scene-other-bytes', title: '另一组数据', create: otherBytesScenario },
    { id: 'scene-custom', title: '自定义 Adapter', create: customPanelScenario }
  ];

  NoteDemoSceneExamples.scenarios = SCENARIOS.map(function (scenario) {
    return { id: scenario.id, title: scenario.title };
  });

  function readoutText(state) {
    if (!state || typeof state !== 'object') return '尚未开始';
    if (state.phase === 'running') return '过渡中 → ' + (state.targetFrameId || '…');
    if (state.phase === 'error') return '错误 · ' + (state.settledFrameId || '…');
    if (state.phase === 'disposed') return '已销毁';
    return '当前停点：' + (state.settledFrameId || '…');
  }

  function findScenario(id) {
    for (var i = 0; i < SCENARIOS.length; i += 1) {
      if (SCENARIOS[i].id === id) return SCENARIOS[i];
    }
    return null;
  }

  NoteDemoSceneExamples.boot = function (documentRef) {
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
        if (readout) readout.textContent = '示例缺少场景定义：' + id;
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
        if (readout) {
          session.subscribe(function (state) {
            readout.textContent = readoutText(state);
            if (state && state.phase === 'error') readout.setAttribute('data-demo-error', 'true');
            else readout.removeAttribute('data-demo-error');
          });
        }
      } catch (error) {
        result.failed += 1;
        if (readout) {
          readout.textContent = '场景等待接入：' + (error && error.message ? error.message : String(error));
          readout.setAttribute('data-demo-error', 'true');
        }
      }
    });
    NoteDemoSceneExamples.lastBoot = result;
    return result;
  };
})(window);