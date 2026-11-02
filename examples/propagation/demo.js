/*!
 * 传播过程示例 · Definition 与装配（examples/propagation/demo.js）
 * Scope: window.PropagationDemo.boot；页面只调用公开 NoteDemo.mount 与公开 Adapter 契约。
 * 演示结构：4 个停点、3 次 scene update 过渡；每次过渡只追加一层历史证据，
 * attention 只跟随本步真实运动对象（前沿/事件点），连续 next 从上一停点弱化位置直接承接（T2 为两个局部组）。
 * 依赖：dist 整库（NoteDemo.mount）+ graph.js + adapter.js。
 */
(function (global) {
  'use strict';

  var GRAPH = global.PropagationGraph;
  var ADAPTER = global.PropagationAdapter;

  if (!GRAPH || !ADAPTER) {
    throw new Error('传播示例需要先加载 graph.js 与 adapter.js。');
  }

  /* attention 只跟随真实运动对象：发送前沿、B 命中事件点、回传前沿。
   * 不再安排“先观察基站圆点/上一前沿”的重复巡视；连续 next 时焦点从上一停点的弱化位置直接承接。
   * local/union range 只把移动对象包成可读的局部框，不框整图。 */
  /* 观察整段正在变化的“去程/回程条 + 前沿 + 标签”，而不是只框住一个点：
   * band 的宽度随 progress 变化，union 每帧重新测量，框会从前沿起点连续长到目标端。 */
  function processRange() {
    var effects = global.NoteDemo && global.NoteDemo.effects;
    if (!effects || typeof effects.unionRange !== 'function') {
      throw new Error('传播示例需要 demo-runtime 的 NoteDemo.effects.unionRange。');
    }
    /* 公共作者组合：把移动前沿、正在增长的轨迹条和它的标签合成一个观察区域。 */
    return effects.unionRange([
      { binding: 'graph', query: { part: 'label' } },
      { binding: 'graph', query: { part: 'band' } }
    ]);
  }
  function eventRange() {
    return { kind: 'union', refs: [{ binding: 'graph', query: { part: 'event' } }] };
  }

  /* 示例 scene timing：单步内容约 0.9s，给“看前沿走到哪/看清事件”留辨认时间；
   * 缓动选柔和进出（不是公共 attention 的强 ease-out），避免前沿起步一下冲出去、焦点高速追赶；
   * 只覆盖本示例的 attention scene，不统一放慢全库。 */
  var STEP_TIMING = { enterDuration: 900, easing: 'cubic-bezier(.32,0,.24,1)' };

  var TRANSITIONS = [
    {
      from: 'idle',
      to: 'send',
      scene: {
        bindings: [{ binding: 'graph', mode: 'update' }],
        timing: STEP_TIMING,
        attention: {
          targets: [
            {
              binding: 'graph',
              query: { part: 'front' },
              groups: ['send'],
              range: processRange()
            }
          ]
        }
      }
    },
    {
      from: 'send',
      to: 'hit',
      scene: {
        bindings: [{ binding: 'graph', mode: 'update' }],
        timing: STEP_TIMING,
        attention: {
          targets: [
            {
              binding: 'graph',
              query: { part: 'front' },
              groups: ['lead'],
              range: processRange()
            },
            {
              binding: 'graph',
              query: { part: 'eventDot' },
              groups: ['event'],
              range: eventRange()
            }
          ]
        }
      }
    },
    {
      from: 'hit',
      to: 'back',
      scene: {
        bindings: [{ binding: 'graph', mode: 'update' }],
        timing: STEP_TIMING,
        attention: {
          targets: [
            {
              binding: 'graph',
              query: { part: 'front' },
              groups: ['return'],
              range: processRange()
            }
          ]
        }
      }
    }
  ];

  /* 历史证据层总数 = 过渡次数：初始停点没有层，每次过渡恰好追加一层。 */
  var HISTORY_TOTAL = TRANSITIONS.length;

  var FRAMES = [
    {
      id: 'idle',
      caption: '初始停点：A 与 B 之间是一条链路，A 还没有发送。下一步只盯住即将出现的发送前沿，不先巡视基站。',
      views: { graph: { stage: 0 } }
    },
    {
      id: 'send',
      caption: 'A 开始发送：看发送前沿从左向右推进，焦点跟随这个真实运动点；0.55L 时停稳并弱化，作为下一步的承接位置。',
      views: { graph: { stage: 1 } }
    },
    {
      id: 'hit',
      caption: '从上一前沿位置直接承接：新前沿继续推到 B，焦点跟着它；到达后出现 B 命中事件，焦点再落到事件点，不额外巡视 B 站圆点。',
      views: { graph: { stage: 2 } }
    },
    {
      id: 'back',
      caption: 'B 命中后不回看基站：焦点从事件附近直接承接回传前沿，跟随它从 B 向左回到 0.25L；历史证据保留三层，不重画前面的发送记录。',
      views: { graph: { stage: 3 } }
    }
  ];

  var DEFINITION = {
    initialFrameId: 'idle',
    bindings: {
      graph: { adapter: 'propagation-graph', slot: 'graph' }
    },
    frames: FRAMES,
    transitions: TRANSITIONS
  };

  function element(tag, className, textContent) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (textContent != null) node.textContent = textContent;
    return node;
  }

  /* 默认舞台的 layout 只负责页面排版与插槽；播放/字幕/按钮/取消/减少动效都由 NoteDemo 维护。 */
  function layout(container) {
    var root = element('div', 'propagation-canvas');
    var graphSlot = element('div', 'propagation-canvas__graph');
    graphSlot.setAttribute('data-demo-slot', 'graph');
    var status = element('p', 'propagation-canvas__status');
    status.setAttribute('data-propagation-status', '');
    status.setAttribute('aria-live', 'polite');
    root.appendChild(graphSlot);
    root.appendChild(status);
    container.appendChild(root);
    return { root: root, slots: { graph: graphSlot } };
  }

  function readStage(host) {
    var svg = host.querySelector('.pg-svg');
    return svg ? Number(svg.getAttribute('data-stage')) : 0;
  }

  function readLayers(host) {
    return Array.prototype.map.call(host.querySelectorAll('.pg-layer'), function (node) {
      var progress = Number(node.getAttribute('data-progress'));
      return {
        stage: Number(node.getAttribute('data-stage')),
        kind: node.getAttribute('data-kind'),
        progress: isFinite(progress) ? progress : 0,
        active: node.getAttribute('data-active') === 'true'
      };
    }).sort(function (a, b) { return a.stage - b.stage; });
  }

  function boot() {
    var host = document.querySelector('[data-demo-host]');
    if (!host) return;
    var session = global.NoteDemo.mount(host, {
      definition: DEFINITION,
      layout: layout,
      adapters: { 'propagation-graph': ADAPTER },
      title: '传播过程与局部过渡',
      label: '传播过程与局部过渡示例',
      captionLabel: '解说'
    });

    var statusEl = host.querySelector('[data-propagation-status]');
    function paintStatus(state) {
      if (!statusEl) return;
      var stage = readStage(host);
      var names = { start: '初始层', send: '发送段', hit: '命中事件', return: '回传段' };
      var layers = readLayers(host);
      var active = layers[layers.length - 1];
      var current = active && names[active.kind] ? names[active.kind] : '无历史层';
      statusEl.textContent = '历史层 ' + layers.length + ' / ' + HISTORY_TOTAL +
        ' · 当前层：' + current + (state && state.phase === 'running' ? ' · 运行中' : '');
    }
    session.subscribe(paintStatus);
    paintStatus(session.getState());
    /* commit 在同步事务内先追加层、再改 data-stage；观察该属性把“历史层 N/3、当前层”在运行中也刷新。 */
    var svgNode = host.querySelector('.pg-svg');
    if (svgNode && typeof global.MutationObserver === 'function') {
      var stageObserver = new global.MutationObserver(function () { paintStatus(session.getState()); });
      stageObserver.observe(svgNode, { attributes: true, attributeFilter: ['data-stage'] });
    }

    /* 最小只读探针：给工程检查和调试使用，不是运行 API。 */
    global.PropagationExample = {
      session: session,
      adapter: ADAPTER,
      getStage: function () { return readStage(host); },
      getLayers: function () { return readLayers(host); },
      getFrames: function () { return FRAMES.map(function (frame) { return frame.id; }); }
    };
  }

  global.PropagationDemo = { definition: DEFINITION, layout: layout, boot: boot };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})(window);
