/*!
 * 传播过程示例 · SVG 图形组件（examples/propagation/graph.js）
 * Scope: window.PropagationGraph.mount(host, options)
 * 依赖：无（原生 SVG DOM）；由 examples 的 adapter.js 调用，不进入组件库核心。
 * 设计要点：
 * - 底座（轨道、基站、刻度、历史证据区）只建一次，之后从不整图重建；
 * - 每个停点只追加自己的 .pg-layer（发送段/命中事件/回传段），历史层保留、互不覆盖；
 * - 新层的视觉先预置为来源状态（带宽 0、前沿在段的起点、标签/事件隐藏），
 *   由 Adapter 的 progress EffectSpec 连续推进；取消/回退由 restoreStage 清掉更晚的层。
 * 常量只属于本示例，不写入公共核心。
 */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var VERSION = '1.0.0';

  /* 视口坐标系：x 为链路距离（A 在左、B 在右），y 为示例排布（去程/回程两条车道 + 历史证据区）。 */
  var GEO = {
    width: 760,
    height: 480,
    plotLeft: 128,
    plotRight: 648,
    railY: 132,
    laneH: 26,
    returnY: 198,
    stationTop: 104,
    stationBottom: 232,
    tickTop: 262,
    historyTop: 330,
    historyStep: 40,
    rows: 3
  };
  var DIST = GEO.plotRight - GEO.plotLeft;

  /* 每个停点的含义；stage 是公开的 Frame model 字段。 */
  var STAGES = [
    { stage: 0, kind: 'base', label: '初始', aria: '传播过程图初始停点：A 待发送，链路空闲，还没有历史证据层。' },
    { stage: 1, kind: 'send', label: '发送', primaryGroup: 'send',
      from: 0, to: 0.55, text: '发送前沿 0.55L', tick: '① 0.55L',
      aria: '传播过程图第 2 停点：A 开始发送，信号前沿推进到 0.55L。' },
    { stage: 2, kind: 'hit', label: '到达 B', primaryGroup: 'lead', secondGroup: 'event',
      from: 0.55, to: 1, text: '到达 B', tick: '② 到达 B',
      aria: '传播过程图第 3 停点：前沿到达 B，B 开始回传。' },
    { stage: 3, kind: 'return', label: '回传', primaryGroup: 'return',
      from: 1, to: 0.25, text: '回传前沿 0.25L', tick: '③ 回传 0.25L',
      aria: '传播过程图第 4 停点：回传前沿从 B 回到 0.25L。' }
  ];
  var MAX_STAGE = STAGES.length - 1;

  function clamp(value, lo, hi) {
    return Math.min(hi, Math.max(lo, value));
  }

  function round(value) {
    return Math.round(value * 10) / 10;
  }

  function xOf(fraction) {
    return GEO.plotLeft + clamp(fraction, 0, 1) * DIST;
  }

  function centerOfLane(y) {
    return y + GEO.laneH / 2;
  }

  function historyY(row) {
    return GEO.historyTop + row * GEO.historyStep;
  }

  function svgEl(tag, className) {
    var node = document.createElementNS(NS, tag);
    if (className) node.setAttribute('class', className);
    return node;
  }

  function setAttrs(node, attrs) {
    Object.keys(attrs).forEach(function (key) {
      node.setAttribute(key, String(attrs[key]));
    });
    return node;
  }

  function addText(parent, className, x, y, content, extra) {
    var node = svgEl('text', className);
    node.setAttribute('x', String(round(x)));
    node.setAttribute('y', String(round(y)));
    node.textContent = content;
    if (extra) setAttrs(node, extra);
    parent.appendChild(node);
    return node;
  }

  function metaFor(stage) {
    return STAGES[stage] || STAGES[0];
  }

  /* ---------------- 底座（只建一次） ---------------- */

  function buildBase(root) {
    var svg = svgEl('svg', 'pg-svg');
    svg.setAttribute('viewBox', '0 0 ' + GEO.width + ' ' + GEO.height);
    svg.setAttribute('role', 'img');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('data-stage', '0');
    root.appendChild(svg);

    var base = svgEl('g', 'pg-base');
    base.setAttribute('aria-hidden', 'true');
    svg.appendChild(base);

    base.appendChild(setAttrs(svgEl('rect', 'pg-plot-bg'), {
      x: GEO.plotLeft - 54, y: GEO.railY - 44,
      width: DIST + 108, height: GEO.stationBottom - GEO.railY + 92, rx: 16
    }));

    /* 去程/回程车道 */
    base.appendChild(setAttrs(svgEl('rect', 'pg-lane pg-lane--send'), {
      x: GEO.plotLeft, y: GEO.railY, width: DIST, height: GEO.laneH, rx: GEO.laneH / 2
    }));
    base.appendChild(setAttrs(svgEl('rect', 'pg-lane pg-lane--return'), {
      x: GEO.plotLeft, y: GEO.returnY, width: DIST, height: GEO.laneH, rx: GEO.laneH / 2
    }));
    addText(base, 'pg-lane-title pg-lane-title--send', GEO.plotLeft - 18, centerOfLane(GEO.railY) + 4,
      '去程', { 'text-anchor': 'end' });
    addText(base, 'pg-lane-title pg-lane-title--return', GEO.plotLeft - 18, centerOfLane(GEO.returnY) + 4,
      '回程', { 'text-anchor': 'end' });

    /* 车道方向箭头 */
    var sendArrow = svgEl('path', 'pg-arrow pg-arrow--send');
    sendArrow.setAttribute('d', 'M ' + round(GEO.plotRight - 4) + ' ' + round(centerOfLane(GEO.railY) - 6) +
      ' L ' + round(GEO.plotRight + 6) + ' ' + round(centerOfLane(GEO.railY)) +
      ' L ' + round(GEO.plotRight - 4) + ' ' + round(centerOfLane(GEO.railY) + 6) + ' Z');
    base.appendChild(sendArrow);
    var returnArrow = svgEl('path', 'pg-arrow pg-arrow--return');
    returnArrow.setAttribute('d', 'M ' + round(GEO.plotLeft + 4) + ' ' + round(centerOfLane(GEO.returnY) - 6) +
      ' L ' + round(GEO.plotLeft - 6) + ' ' + round(centerOfLane(GEO.returnY)) +
      ' L ' + round(GEO.plotLeft + 4) + ' ' + round(centerOfLane(GEO.returnY) + 6) + ' Z');
    base.appendChild(returnArrow);

    /* 距离刻度（0 / 0.25L / 0.5L / 0.75L / L） */
    [0, 0.25, 0.5, 0.75, 1].forEach(function (fraction) {
      var x = xOf(fraction);
      base.appendChild(setAttrs(svgEl('line', 'pg-tick-line'), {
        x1: x, y1: GEO.stationBottom + 4, x2: x, y2: GEO.stationBottom + 10
      }));
      addText(base, 'pg-tick-label', x, GEO.stationBottom + 24,
        fraction === 0 ? '0' : (fraction === 1 ? 'L' : fraction + 'L'), { 'text-anchor': 'middle' });
    });

    /* 基站 A/B：竖线 + 圆点 + 标签，只作为稳定底座视觉；attention 不再巡视基站。 */
    function station(id, fraction, name, role) {
      var group = svgEl('g', 'pg-station');
      group.setAttribute('data-station', id);
      group.appendChild(setAttrs(svgEl('line', 'pg-station-line'), {
        x1: xOf(fraction), y1: GEO.stationTop, x2: xOf(fraction), y2: GEO.stationBottom
      }));
      group.appendChild(setAttrs(svgEl('circle', 'pg-station-dot'), {
        cx: xOf(fraction), cy: centerOfLane(GEO.railY), r: 6
      }));
      addText(group, 'pg-station-name', xOf(fraction), GEO.stationTop - 18, name, { 'text-anchor': 'middle' });
      addText(group, 'pg-station-role', xOf(fraction), GEO.stationBottom + 42, role, { 'text-anchor': 'middle' });
      base.appendChild(group);
      return group;
    }
    station('a', 0, 'A', '发送端');
    station('b', 1, 'B', '接收端');

    /* 历史证据区 */
    addText(base, 'pg-history-title', GEO.plotLeft - 54, GEO.historyTop - 16,
      '历史证据（每停点只追加一层）', { 'text-anchor': 'start' });
    for (var row = 0; row < GEO.rows; row += 1) {
      base.appendChild(setAttrs(svgEl('line', 'pg-history-line'), {
        x1: GEO.plotLeft, y1: historyY(row), x2: GEO.plotRight, y2: historyY(row)
      }));
      addText(base, 'pg-history-row', GEO.plotLeft - 14, historyY(row) + 4, '#' + (row + 1),
        { 'text-anchor': 'end' });
    }

    /* 历史/新增层容器：只追加，不整组替换。 */
    var layers = svgEl('g', 'pg-layers');
    layers.setAttribute('aria-hidden', 'true');
    svg.appendChild(layers);

    return { svg: svg, base: base, layers: layers };
  }

  /* ---------------- 单层（停点） ---------------- */

  function createLayer(meta) {
    var layer = svgEl('g', 'pg-layer pg-layer--' + meta.kind);
    layer.setAttribute('data-stage', String(meta.stage));
    layer.setAttribute('data-kind', meta.kind);
    layer.setAttribute('data-progress', '0');
    layer.setAttribute('aria-hidden', 'true');

    var nodes = { el: layer, band: null, front: null, label: null, tick: null, event: null, eventDot: null };
    var bandY = meta.kind === 'return' ? GEO.returnY : GEO.railY;
    var bandClass = meta.kind === 'return' ? 'pg-band pg-band--return' : 'pg-band pg-band--send';
    var frontClass = meta.kind === 'return' ? 'pg-front pg-front--return' : 'pg-front pg-front--send';
    var fromX = xOf(meta.from);
    var toX = xOf(meta.to);

    /* 相邻发送段在同一个车道上首尾相接：矩形只做很小的圆角，避免两段圆角端头之间出现缝隙。 */
    nodes.band = setAttrs(svgEl('rect', bandClass), {
      x: fromX, y: bandY, width: 0, height: GEO.laneH, rx: 2
    });
    nodes.band.setAttribute('data-part', 'band');
    layer.appendChild(nodes.band);

    nodes.front = setAttrs(svgEl('circle', frontClass), {
      cx: fromX, cy: centerOfLane(bandY), r: 5
    });
    nodes.front.setAttribute('data-part', 'front');
    layer.appendChild(nodes.front);

    nodes.label = addText(layer, 'pg-label', fromX, bandY - 14, meta.text, { 'text-anchor': 'middle' });
    nodes.label.setAttribute('data-part', 'label');

    if (meta.stage >= 1) {
      var tickRow = meta.stage - 1;
      var tick = svgEl('g', 'pg-tick');
      tick.setAttribute('data-row', String(tickRow));
      tick.setAttribute('data-part', 'tick');
      tick.appendChild(setAttrs(svgEl('line', 'pg-tick-stem'), {
        x1: toX, y1: historyY(tickRow) - 8, x2: toX, y2: historyY(tickRow) + 8
      }));
      tick.appendChild(setAttrs(svgEl('circle', 'pg-tick-dot'), {
        cx: toX, cy: historyY(tickRow), r: 3.5
      }));
      tick.appendChild(addText(tick, 'pg-tick-text', toX, historyY(tickRow) + 26, meta.tick,
        { 'text-anchor': 'middle' }));
      nodes.tick = tick;
      layer.appendChild(tick);
    }

    if (meta.kind === 'hit') {
      var event = svgEl('g', 'pg-event');
      event.setAttribute('data-event', 'hit');
      event.setAttribute('data-part', 'event');
      var ex = xOf(1);
      var ey = centerOfLane(GEO.returnY);
      event.appendChild(setAttrs(svgEl('circle', 'pg-event-ring'), {
        cx: ex, cy: ey, r: 13
      }));
      var eventDot = setAttrs(svgEl('circle', 'pg-event-dot'), {
        cx: ex, cy: ey, r: 4
      });
      eventDot.setAttribute('data-part', 'event-dot');
      event.appendChild(eventDot);
      event.appendChild(addText(event, 'pg-event-text', ex - 20, ey - 16, 'B 命中：开始回传',
        { 'text-anchor': 'end' }));
      nodes.event = event;
      nodes.eventDot = eventDot;
      layer.appendChild(event);
    }

    return nodes;
  }

  /* 未放行的新层保持来源视觉：标签、刻度、事件与前沿点先显式隐藏；
   * 组启动后的 WAAPI 填充和 progress 回调会接管可见性，成功收尾时再清除这些内联值。 */
  function hidePreState(meta, nodes) {
    ['label', 'tick', 'event', 'front'].forEach(function (key) {
      var node = nodes[key];
      if (node) node.style.opacity = '0';
    });
  }

  function clearPreState(nodes) {
    ['label', 'tick', 'event', 'front'].forEach(function (key) {
      var node = nodes[key];
      if (node) node.style.opacity = '';
    });
  }

  function applyProgress(meta, nodes, progress) {
    var q = clamp(Number(progress) || 0, 0, 1);
    if (q > 0 && nodes.front && nodes.front.style.opacity === '0') {
      nodes.front.style.opacity = '';
    }
    if (meta.kind === 'send' || meta.kind === 'hit') {
      var fromX = xOf(meta.from);
      var toX = xOf(meta.to);
      var startX = typeof nodes.startX === 'number' && isFinite(nodes.startX) ? nodes.startX : fromX;
      var frontX = startX + (toX - startX) * q;
      nodes.band.setAttribute('width', String(round(Math.max(0, frontX - fromX))));
      nodes.front.setAttribute('cx', String(round(frontX)));
      nodes.label.setAttribute('x', String(round(clamp(frontX, GEO.plotLeft + 56, GEO.plotRight - 40))));
    } else if (meta.kind === 'return') {
      var bx = xOf(meta.from);
      var tx = xOf(meta.to);
      var startReturn = typeof nodes.startX === 'number' && isFinite(nodes.startX) ? nodes.startX : bx;
      var leftX = startReturn + (tx - startReturn) * q;
      nodes.band.setAttribute('x', String(round(leftX)));
      nodes.band.setAttribute('width', String(round(Math.max(0, bx - leftX))));
      nodes.front.setAttribute('cx', String(round(leftX)));
      nodes.label.setAttribute('x', String(round(clamp(leftX, GEO.plotLeft + 56, GEO.plotRight - 40))));
    }
    nodes.el.setAttribute('data-progress', String(Math.round(q * 1000) / 1000));
  }

  /* 无动画地落到终态（restore、减少动效、取消后的来源恢复）。 */
  function finishLayer(meta, nodes) {
    clearPreState(nodes);
    applyProgress(meta, nodes, 1);
  }

  function layerGroups(meta) {
    var groups = [meta.primaryGroup];
    if (meta.secondGroup) groups.push(meta.secondGroup);
    return groups;
  }

  function buildEffects(meta, nodes, timing) {
    var settings = timing && typeof timing === 'object' ? timing : {};
    var duration = typeof settings.enterDuration === 'number' && isFinite(settings.enterDuration)
      ? Math.max(0, settings.enterDuration) : 420;
    var easing = typeof settings.easing === 'string' && settings.easing ? settings.easing : 'linear';
    var specs = [];

    /* 连续展开：一个 progress 句柄同时更新带宽、前沿位置与标签位置。 */
    specs.push({
      type: 'progress',
      group: meta.primaryGroup,
      duration: duration,
      easing: easing,
      update: function (progress) { applyProgress(meta, nodes, progress); },
      gate: 'ready'
    });

    /* 标签与图形同组：同一组启动、同一组 ready；标签只做轻微淡入，位置由 progress 连续更新。
     * handoff:'hold'：局部淡入正常完成后保持末帧到 scene 收束，避免回落到预置隐藏值再等 cleanup。 */
    specs.push({
      el: nodes.label,
      keyframes: [{ opacity: '0' }, { opacity: '1' }],
      options: { duration: Math.max(160, Math.round(duration * 0.6)), easing: easing },
      group: meta.primaryGroup,
      gate: 'ready',
      handoff: 'hold'
    });

    if (nodes.tick) {
      specs.push({
        el: nodes.tick,
        keyframes: [{ opacity: '0' }, { opacity: '1' }],
        options: {
          duration: Math.max(140, Math.round(duration * 0.32)),
          delay: Math.round(duration * 0.62),
          easing: easing
        },
        group: meta.secondGroup || meta.primaryGroup,
        gate: 'ready',
        handoff: 'hold'
      });
    }

    if (nodes.event) {
      specs.push({
        el: nodes.event,
        keyframes: [
          { opacity: '0', transform: 'scale(.82)' },
          { opacity: '1', transform: 'scale(1)' }
        ],
        options: {
          duration: Math.max(180, Math.round(duration * 0.5)),
          easing: easing
        },
        group: meta.secondGroup,
        gate: 'ready',
        handoff: 'hold'
      });
    }

    return specs;
  }

  /* ---------------- 挂载与实例 ---------------- */

  function mount(host) {
    if (!host || host.nodeType !== 1) {
      throw new TypeError('PropagationGraph.mount 需要一个宿主元素。');
    }
    var root = document.createElement('div');
    root.className = 'propagation-graph';
    var built = buildBase(root);
    host.appendChild(root);

    var destroyed = false;
    var currentStage = 0;
    var plans = {};

    /* 公开 NoteDemo.effects.rectOf 给出的是视口坐标；这里换算成 SVG 用户坐标，
     * 让新层的起点几何来自真实来源视觉，而不是只相信静态常量。 */
    function viewportToUserX(viewportX) {
      try {
        var box = built.svg.getBoundingClientRect();
        if (!box || !box.width) return null;
        var viewBox = built.svg.viewBox && built.svg.viewBox.baseVal ? built.svg.viewBox.baseVal : null;
        var width = viewBox && viewBox.width ? viewBox.width : GEO.width;
        var left = viewBox && typeof viewBox.x === 'number' ? viewBox.x : 0;
        return left + (viewportX - box.left) * (width / box.width);
      } catch (error) {
        return null;
      }
    }

    function sortedPlans() {
      return Object.keys(plans).map(function (key) { return plans[key]; }).sort(function (a, b) {
        return a.meta.stage - b.meta.stage;
      });
    }

    function newestPlan(offset) {
      var list = sortedPlans();
      var index = list.length - 1 - (offset || 0);
      return index >= 0 ? list[index] : null;
    }

    function updateStageView() {
      built.svg.setAttribute('data-stage', String(currentStage));
      built.svg.setAttribute('aria-label', metaFor(currentStage).aria);
      sortedPlans().forEach(function (plan) {
        plan.el.setAttribute('data-active', plan.meta.stage === currentStage ? 'true' : 'false');
      });
    }

    function attach(plan, options) {
      var settings = options && typeof options === 'object' ? options : {};
      if (destroyed) throw new Error('PropagationGraph：实例已销毁。');
      if (plans[plan.meta.stage]) {
        if (plans[plan.meta.stage].el.parentNode) plans[plan.meta.stage].el.parentNode.removeChild(plans[plan.meta.stage].el);
        delete plans[plan.meta.stage];
      }
      built.layers.appendChild(plan.el);
      plan.attached = true;
      plans[plan.meta.stage] = plan;
      currentStage = plan.meta.stage;
      if (settings.reduced === true) finishLayer(plan.meta, plan.nodes);
      else hidePreState(plan.meta, plan.nodes);
      updateStageView();
    }

    function prepareStage(stage, options) {
      var meta = STAGES[stage];
      if (!meta || meta.stage === 0) throw new Error('PropagationGraph：prepareStage 需要 1–' + MAX_STAGE + ' 的停点。');
      if (destroyed) throw new Error('PropagationGraph：实例已销毁。');
      var nodes = createLayer(meta);
      var startX = xOf(meta.from);
      if (options && options.sourceRect) {
        var rect = options.sourceRect;
        var converted = viewportToUserX(Number(rect.left) + Number(rect.width) / 2);
        if (converted != null && isFinite(converted)) {
          var low = Math.min(xOf(meta.from), xOf(meta.to)) - 2;
          var high = Math.max(xOf(meta.from), xOf(meta.to)) + 2;
          if (converted >= low && converted <= high) startX = converted;
        }
      }
      nodes.startX = startX;
      nodes.el.setAttribute('data-start-x', String(round(startX)));
      var plan = {
        meta: meta,
        nodes: nodes,
        el: nodes.el,
        attached: false,
        groups: layerGroups(meta),
        effects: function (timing) { return buildEffects(meta, nodes, timing); },
        finish: function () { finishLayer(meta, nodes); },
        releasePreState: function () { clearPreState(nodes); },
        detach: function () {
          if (plan.el.parentNode) plan.el.parentNode.removeChild(plan.el);
        }
      };
      applyProgress(meta, nodes, 0);
      if (options && options.reduced === true) plan.finish();
      return plan;
    }

    function restoreStage(stage) {
      if (destroyed) return;
      var target = clamp(Number(stage) || 0, 0, MAX_STAGE);
      target = Math.round(target);
      Object.keys(plans).forEach(function (key) {
        var plan = plans[key];
        if (plan.meta.stage <= target) return;
        if (plan.el.parentNode) plan.el.parentNode.removeChild(plan.el);
        delete plans[key];
      });
      for (var index = 1; index <= target; index += 1) {
        if (!plans[index]) {
          var plan = prepareStage(index);
          attach(plan, {});
          /* attach 会为“被门控的新层”预置隐藏来源视觉；直接恢复/跳转时必须在挂载后落到终态。 */
          plan.finish();
        } else {
          plans[index].finish();
        }
      }
      currentStage = target;
      updateStageView();
    }

    var handle = {
      el: root,
      svg: built.svg,
      version: VERSION,
      maxStage: MAX_STAGE,
      prepareLayer: function (stage, options) { return prepareStage(stage, options); },
      attachLayer: function (plan, options) { attach(plan, options); },
      restoreStage: restoreStage,
      readModel: function () { return { stage: currentStage }; },
      getStage: function () { return currentStage; },
      layersInfo: function () {
        return sortedPlans().map(function (plan) {
          return {
            stage: plan.meta.stage,
            kind: plan.meta.kind,
            progress: Number(plan.el.getAttribute('data-progress') || 0),
            active: plan.el.getAttribute('data-active') === 'true'
          };
        });
      },
      targetAt: function (query) {
        if (destroyed) return null;
        var part = query && typeof query === 'object' ? query.part : null;
        if (part === 'root') return root;
        if (part === 'svg') return built.svg;
        var latest = newestPlan(0);
        if (part === 'front') return latest && latest.nodes.front ? latest.nodes.front : null;
        if (part === 'label') return latest && latest.nodes.label ? latest.nodes.label : null;
        if (part === 'band') return latest && latest.nodes.band ? latest.nodes.band : null;
        if (part === 'event') return latest && latest.nodes.event ? latest.nodes.event : null;
        if (part === 'eventDot') return latest && latest.nodes.eventDot ? latest.nodes.eventDot : null;
        return null;
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        Object.keys(plans).forEach(function (key) { plans[key].detach(); });
        plans = {};
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };

    /* 初始停点没有历史证据层：每个过渡恰好追加一层，回退/重来移除更晚的层。 */
    restoreStage(0);
    return handle;
  }

  global.PropagationGraph = {
    version: VERSION,
    geo: GEO,
    stages: STAGES,
    maxStage: MAX_STAGE,
    mount: mount
  };
})(window);
