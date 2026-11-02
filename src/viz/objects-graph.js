/*! NoteViz objects D01-D06 — D03 Graph.
 *  Classic script; load after src/viz/objects.js (internal shared helpers).
 *  Public entry: NoteViz.Graph.
 *  No network, no eval, no HTML parsing.
 *
 *  Edge identity and targets (D03 extension):
 *    edges[].id 可选稳定 ID；缺省按 from -> to 生成，平行同向边为 "from -> to #2"…
 *    （与 NoteBlocks.ProcessFlow 的 edgeIds 解析约定一致；重复显式 id 也补后缀）。
 *    edgeFocus / edgeChanged 是独立的边状态选项，节点 focus / changed 仍是节点专用。
 *    边 <g>、path 在 update() 时按稳定 id 复用；节点 getTarget 不解析边 ID。
 *
 *  查询 API（实例方法）：
 *    getEdgeTarget(id) -> <g> | null
 *    getEdgePath(id) -> <path> | null
 *    getEdgeLength(id) -> number(局部用户单位) | null
 *    getEdgePoint(id, ratio) -> {x,y} 局部坐标 | null
 *    getEdgePointAt(id, distance) -> {x,y,distance,ratio} 局部坐标 | null
 *    getEdgePointClient(id, ratio) -> {x,y} DOM client 坐标（路径 screen CTM 转换）| null
 *    getEdgeEndpoints(id) -> {start:{x,y}, end:{x,y}} 局部坐标 | null
 *    getEdgeInfo(id) -> {id,from,to,label,directed,mark,length,endpoints} | null
 *    局部坐标与 viewBox/节点坐标同一空间；边是作者声明的 from/to 直连锚点，
 *    不做自动路由，查询返回路径真实几何而不是“元素中心连线”的语义。 */
(function (global) {
  'use strict';

  var NoteViz = global.NoteViz = global.NoteViz || {};
  var shared = global.NoteVizObjectsInternals;
  if (!shared) {
    throw new Error('NoteViz objects 组件需要先加载 src/viz/objects.js（内部共享文件）。');
  }
  var Core = shared.Core;
  var text = shared.text;
  var el = shared.el;
  var svgEl = shared.svgEl;
  var setText = shared.setText;
  var uniqueId = shared.uniqueId;
  var validateHost = shared.validateHost;
  var listenersFor = shared.listenersFor;
  var numberOr = shared.numberOr;
  var markOf = shared.markOf;
  var markLabel = shared.markLabel;
  var markAria = shared.markAria;
  var emptyLine = shared.emptyLine;
  var makeScrollHint = shared.makeScrollHint;
  var attachScrollRegion = shared.attachScrollRegion;
  var charUnits = shared.charUnits;
  var wrapText = shared.wrapText;
  var closestInside = shared.closestInside;
  var toIdSet = shared.toIdSet;

  function removeNode(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  /* =====================================================================
   * D03 — Graph
   * ===================================================================== */

  function normalizeGraphNodes(input) {
    var list = Array.isArray(input) ? input : [];
    var groups = new Map();
    return list.map(function (item, index) {
      var source = item && typeof item === 'object' ? item : { label: item };
      var id = source.id != null && text(source.id) !== '' ? text(source.id) : 'node-' + index;
      var group = source.group == null ? '' : text(source.group);
      if (group && !groups.has(group)) groups.set(group, groups.size + 1);
      return {
        id: id,
        label: source.label == null ? id : text(source.label),
        group: group,
        groupIndex: group ? groups.get(group) : 0,
        x: source.x,
        y: source.y,
        originalIndex: index
      };
    });
  }

  function normalizeGraphEdges(input, nodes) {
    var byId = new Map();
    nodes.forEach(function (node) { byId.set(node.id, node); });
    var list = Array.isArray(input) ? input : [];
    var routeSeen = new Map();
    var used = new Set();
    return list.map(function (edge) {
      if (!edge || typeof edge !== 'object') return null;
      var from = edge.from == null ? '' : text(edge.from);
      var to = edge.to == null ? '' : text(edge.to);
      if (!byId.has(from) || !byId.has(to)) return null;
      var route = from + ' -> ' + to;
      var routeCount = routeSeen.get(route) || 0;
      routeSeen.set(route, routeCount + 1);
      var base = edge.id == null ? '' : text(edge.id);
      if (!base) {
        /* 缺省稳定键与 NoteBlocks.ProcessFlow 的 edgeIds 解析约定一致：
           route 第一次出现为 "from -> to"，之后为 "from -> to #2"…；
           显式 id 的边也占用 route 序号。 */
        base = routeCount === 0 ? route : route + ' #' + (routeCount + 1);
      }
      /* 作者提供重复 id 时也补后缀，保证每条边的 DOM 目标/路径句柄唯一。 */
      var id = base;
      var suffix = 1;
      while (used.has(id)) {
        suffix += 1;
        id = base + ' #' + suffix;
      }
      used.add(id);
      return {
        id: id,
        from: from,
        to: to,
        route: route,
        label: edge.label == null ? '' : text(edge.label),
        directed: edge.directed === true
      };
    }).filter(Boolean);
  }

  function graphLayeredLevels(nodes, edges) {
    var indegree = new Map();
    var outgoing = new Map();
    nodes.forEach(function (node) {
      indegree.set(node.id, 0);
      outgoing.set(node.id, []);
    });
    edges.forEach(function (edge) {
      if (edge.from === edge.to) return;
      outgoing.get(edge.from).push(edge.to);
      indegree.set(edge.to, indegree.get(edge.to) + 1);
    });
    var queue = [];
    nodes.forEach(function (node) {
      if (indegree.get(node.id) === 0) queue.push(node.id);
    });
    var levels = new Map();
    queue.forEach(function (id) { levels.set(id, 0); });
    var head = 0;
    var maxLevel = -1;
    while (head < queue.length) {
      var id = queue[head];
      head += 1;
      var current = levels.get(id) || 0;
      maxLevel = Math.max(maxLevel, current);
      outgoing.get(id).forEach(function (next) {
        levels.set(next, Math.max(levels.has(next) ? levels.get(next) : 0, current + 1));
        indegree.set(next, indegree.get(next) - 1);
        if (indegree.get(next) === 0) queue.push(next);
      });
    }
    nodes.forEach(function (node) {
      if (!levels.has(node.id)) levels.set(node.id, maxLevel + 1);
    });
    return levels;
  }

  function nodeBoxMetrics(node) {
    var labelX = node.group ? 34 : 12;
    var maxUnits = node.group ? 12 : 14;
    var lines = wrapText(node.label, maxUnits);
    var width = 196;
    var height = 36 + lines.length * 18;
    return {
      width: width,
      height: height,
      lines: lines,
      labelX: labelX
    };
  }

  function rectEdgePoint(cx, cy, width, height, dx, dy) {
    if (!dx && !dy) return { x: cx, y: cy };
    var tx = dx === 0 ? Infinity : (width / 2) / Math.abs(dx);
    var ty = dy === 0 ? Infinity : (height / 2) / Math.abs(dy);
    var ratio = Math.min(tx, ty);
    return { x: cx + dx * ratio, y: cy + dy * ratio };
  }

  NoteViz.Graph = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var root = el('div', 'nviz-graph');
      var legend = el('div', 'nviz-graph__legend');
      var viewport = el('div', 'nviz-graph__viewport');
      var hint = makeScrollHint('nviz-graph__hint');
      var note = el('p', 'nviz-graph__note');
      var empty = emptyLine('暂无可显示的图节点。');
      var scroll = null;
      var svgBag = null;
      var nodeEls = new Map();
      var edgeEls = new Map();     // 边稳定 id → <g>，更新时复用
      var edgeState = new Map();   // 当前渲染边记录：path/group/端点/mark，供查询 API
      var markerId = uniqueId('nviz-graph-arrow');
      var titleId = uniqueId('nviz-graph-title');
      var descId = uniqueId('nviz-graph-desc');
      var svg = svgEl('svg', { class: 'nviz-graph__svg', role: 'group' });
      var svgTitle = svgEl('title');
      var svgDesc = svgEl('desc');
      var defs = svgEl('defs');
      var marker = svgEl('marker', {
        id: markerId,
        viewBox: '0 0 10 10',
        refX: '9',
        refY: '5',
        markerWidth: '8',
        markerHeight: '8',
        orient: 'auto-start-reverse'
      });
      var markerPath = svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'nviz-graph__arrowhead' });
      var edgeLayer = svgEl('g', { class: 'nviz-graph__edges' });
      var nodeLayer = svgEl('g', { class: 'nviz-graph__nodes' });

      svgTitle.id = titleId;
      svgDesc.id = descId;
      svg.setAttribute('aria-labelledby', titleId + ' ' + descId);
      marker.appendChild(markerPath);
      defs.appendChild(marker);
      svg.append(svgTitle, svgDesc, defs, edgeLayer, nodeLayer);
      viewport.appendChild(svg);
      legend.hidden = true;
      note.hidden = true;
      empty.hidden = true;
      root.setAttribute('role', 'group');
      root.append(legend, viewport, hint, note, empty);

      var model = Object.assign({
        nodes: [],
        edges: [],
        layout: 'layered',
        width: null,
        height: null,
        focus: null,
        changed: null,
        edgeFocus: null,
        edgeChanged: null,
        label: '节点关系图',
        onSelect: null
      }, options || {});

      function layoutGraph(nodes, edges, positionsMap) {
        var layout = model.layout === 'manual' ? 'manual' : 'layered';
        var metrics = new Map();
        nodes.forEach(function (node) {
          metrics.set(node.id, nodeBoxMetrics(node));
        });

        if (layout === 'manual') {
          var gridCols = Math.max(1, Math.ceil(Math.sqrt(nodes.length || 1)));
          nodes.forEach(function (node, index) {
            var m = metrics.get(node.id);
            var cx;
            var cy;
            var hasPoint = node.x != null && node.y != null && isFinite(Number(node.x)) && isFinite(Number(node.y));
            if (hasPoint) {
              cx = Number(node.x);
              cy = Number(node.y);
            } else {
              var col = index % gridCols;
              var row = Math.floor(index / gridCols);
              cx = 120 + col * 240;
              cy = 80 + row * 140;
            }
            positionsMap.set(node.id, {
              x: cx - m.width / 2,
              y: cy - m.height / 2,
              width: m.width,
              height: m.height,
              cx: cx,
              cy: cy
            });
          });
          var minX = Infinity;
          var minY = Infinity;
          var maxX = -Infinity;
          var maxY = -Infinity;
          positionsMap.forEach(function (box) {
            minX = Math.min(minX, box.x);
            minY = Math.min(minY, box.y);
            maxX = Math.max(maxX, box.x + box.width);
            maxY = Math.max(maxY, box.y + box.height);
          });
          var margin = 28;
          minX -= margin;
          minY -= margin;
          maxX += margin;
          maxY += margin;
          var canvasW = Math.max(numberOr(model.width, 0), maxX - minX, 280);
          var canvasH = Math.max(numberOr(model.height, 0), maxY - minY, 180);
          return { minX: minX, minY: minY, width: canvasW, height: canvasH };
        }

        var levels = graphLayeredLevels(nodes, edges);
        var buckets = new Map();
        nodes.forEach(function (node) {
          var level = levels.get(node.id) || 0;
          if (!buckets.has(level)) buckets.set(level, []);
          buckets.get(level).push(node);
        });
        var levelKeys = Array.from(buckets.keys()).sort(function (a, b) { return a - b; });
        var gapX = 34;
        var gapY = 54;
        var margin = 30;
        var totalWidth = 0;
        var levelWidths = new Map();
        var levelHeights = new Map();
        levelKeys.forEach(function (level) {
          var row = buckets.get(level);
          var rowWidth = 0;
          var rowHeight = 0;
          row.forEach(function (node, index) {
            var m = metrics.get(node.id);
            rowWidth += m.width + (index ? gapX : 0);
            rowHeight = Math.max(rowHeight, m.height);
          });
          levelWidths.set(level, rowWidth);
          levelHeights.set(level, rowHeight);
          totalWidth = Math.max(totalWidth, rowWidth);
        });
        var canvasW = Math.max(numberOr(model.width, 0), totalWidth + margin * 2, 300);
        var contentOffsetX = margin + Math.max(0, (canvasW - totalWidth - margin * 2) / 2);
        var y = margin;
        levelKeys.forEach(function (level) {
          var row = buckets.get(level);
          var rowWidth = levelWidths.get(level);
          var x = contentOffsetX + Math.max(0, (totalWidth - rowWidth) / 2);
          row.forEach(function (node) {
            var m = metrics.get(node.id);
            positionsMap.set(node.id, {
              x: x,
              y: y,
              width: m.width,
              height: m.height,
              cx: x + m.width / 2,
              cy: y + m.height / 2
            });
            x += m.width + gapX;
          });
          y += levelHeights.get(level) + gapY;
        });
        var contentH = levelKeys.length ? y - gapY + margin : 160;
        var canvasH = Math.max(numberOr(model.height, 0), contentH, 180);
        return { minX: 0, minY: 0, width: canvasW, height: canvasH };
      }

      function nodeContent(g, node, box, mark, interactive) {
        g.replaceChildren();
        var m = nodeBoxMetrics(node);
        var title = svgEl('title');
        title.textContent = node.label;
        g.appendChild(title);
        g.appendChild(svgEl('rect', {
          class: 'nviz-graph__box',
          x: '0',
          y: '0',
          width: String(box.width),
          height: String(box.height),
          rx: '10'
        }));

        if (node.group) {
          g.appendChild(svgEl('rect', {
            class: 'nviz-graph__groupchip',
            x: '9',
            y: '10',
            width: '17',
            height: '17',
            rx: '5'
          }));
          var chipText = svgEl('text', {
            class: 'nviz-graph__groupnum',
            x: '17.5',
            y: '22.5',
            'text-anchor': 'middle'
          });
          chipText.textContent = String(node.groupIndex);
          g.appendChild(chipText);
        }

        var label = svgEl('text', {
          class: 'nviz-graph__nodelabel',
          x: String(m.labelX),
          y: '25'
        });
        m.lines.forEach(function (line, index) {
          var tspan = svgEl('tspan', { x: String(m.labelX), dy: index === 0 ? '0' : '18' });
          tspan.textContent = line;
          label.appendChild(tspan);
        });
        g.appendChild(label);

        if (mark) {
          var state = svgEl('text', {
            class: 'nviz-graph__nodestate',
            x: '12',
            y: String(box.height - 10)
          });
          state.textContent = markLabel(mark);
          g.appendChild(state);
        }

        var aria = '节点 ' + node.label + (node.group ? '，分组 ' + node.group : '') + markAria(mark) +
          (interactive ? '，可点击或按回车选择' : '');
        g.setAttribute('aria-label', aria);
        g.setAttribute('role', interactive ? 'button' : 'group');
        if (interactive) g.setAttribute('tabindex', '0');
        else g.removeAttribute('tabindex');
        g.setAttribute('data-mark', mark || 'none');
        g.setAttribute('data-id', node.id);
        g.setAttribute('class', 'nviz-graph__node' + (interactive ? ' nviz-graph__node--interactive' : ''));
        g.setAttribute('transform', 'translate(' + box.x + ',' + box.y + ')');
      }

      function edgeLabel(parent, edge, x, y) {
        if (!edge.label) return;
        var lines = wrapText(edge.label, 18);
        var lineHeight = 14;
        var width = 0;
        lines.forEach(function (line) {
          var units = 0;
          Array.from(line).forEach(function (character) { units += charUnits(character); });
          width = Math.max(width, units * 7.2);
        });
        width = Math.max(30, width + 14);
        var height = lines.length * lineHeight + 7;
        parent.appendChild(svgEl('rect', {
          class: 'nviz-graph__edgelabel-bg',
          x: String(x - width / 2),
          y: String(y - height / 2),
          width: String(width),
          height: String(height),
          rx: '5'
        }));
        var label = svgEl('text', {
          class: 'nviz-graph__edgelabel',
          x: String(x),
          y: String(y - height / 2 + 12),
          'text-anchor': 'middle'
        });
        lines.forEach(function (line, index) {
          var tspan = svgEl('tspan', { x: String(x), dy: index === 0 ? '0' : String(lineHeight) });
          tspan.textContent = line;
          label.appendChild(tspan);
        });
        parent.appendChild(label);
      }

      /* 边 <g> 在更新时复用：title/path/label 容器各自保持同一节点；
         path 始终是 <path>，可直接用原生 getTotalLength/getPointAtLength 查询。 */
      function ensureEdgeStructure(group) {
        var title = null;
        var path = null;
        var labelWrap = null;
        var child = group.firstChild;
        while (child) {
          if (child.nodeType === 1) {
            if (child.tagName && child.tagName.toLowerCase() === 'title') title = child;
            else if (child.getAttribute('class') === 'nviz-graph__edgeline') path = child;
            else if (child.getAttribute('class') === 'nviz-graph__edgelabelwrap') labelWrap = child;
          }
          child = child.nextSibling;
        }
        if (!title) {
          title = svgEl('title');
          group.insertBefore(title, group.firstChild);
        }
        if (path && path.tagName && path.tagName.toLowerCase() !== 'path') {
          removeNode(path);
          path = null;
        }
        if (!path) {
          path = svgEl('path', { class: 'nviz-graph__edgeline' });
          group.appendChild(path);
        }
        if (!labelWrap) {
          labelWrap = svgEl('g', { class: 'nviz-graph__edgelabelwrap' });
          group.appendChild(labelWrap);
        }
        return { title: title, path: path, labelWrap: labelWrap };
      }

      /* 路径在 SVG 局部坐标（与节点 box 同在边/节点层的用户坐标系）生成；
         自环沿用固定小回环，普通边为直线。端点/标签位置同时缓存供查询。 */
      function edgePathGeometry(edge, from, to) {
        if (edge.from === edge.to) {
          var loopStart = { x: from.cx + from.width / 2, y: from.cy - 10 };
          var loopEnd = { x: to.cx + to.width / 2, y: to.cy + 10 };
          return {
            d: 'M ' + loopStart.x + ' ' + loopStart.y +
              ' C ' + (loopStart.x + 52) + ' ' + (loopStart.y - 38) + ' ' +
              (loopEnd.x + 52) + ' ' + (loopEnd.y + 38) + ' ' +
              loopEnd.x + ' ' + loopEnd.y,
            start: loopStart,
            end: loopEnd,
            labelX: loopStart.x + 56,
            labelY: from.cy
          };
        }
        var dx = to.cx - from.cx;
        var dy = to.cy - from.cy;
        var start = rectEdgePoint(from.cx, from.cy, from.width, from.height, dx, dy);
        var end = rectEdgePoint(to.cx, to.cy, to.width, to.height, -dx, -dy);
        return {
          d: 'M ' + start.x + ' ' + start.y + ' L ' + end.x + ' ' + end.y,
          start: start,
          end: end,
          labelX: (start.x + end.x) / 2,
          labelY: (start.y + end.y) / 2 - 7
        };
      }

      function render(patch) {
        var nodes = normalizeGraphNodes(model.nodes);
        var edges = normalizeGraphEdges(model.edges, nodes);
        var label = text(model.label) || '节点关系图';
        var focus = toIdSet(model.focus);
        var changed = toIdSet(model.changed);
        var edgeFocus = toIdSet(model.edgeFocus);
        var edgeChanged = toIdSet(model.edgeChanged);
        var interactive = typeof model.onSelect === 'function';
        var positions = new Map();
        var oldNodeEls = nodeEls;
        var newNodeEls = new Map();
        var groupMap = new Map();

        root.setAttribute('aria-label', label);
        root.setAttribute('data-layout', model.layout === 'manual' ? 'manual' : 'layered');
        viewport.setAttribute('aria-label', label + '，可滚动画布');
        nodeLayer.replaceChildren();
        setText(svgTitle, label);
        setText(svgDesc, '');
        note.textContent = '';
        note.hidden = true;

        nodes.forEach(function (node) {
          if (!node.group) return;
          if (!groupMap.has(node.group)) groupMap.set(node.group, []);
          groupMap.get(node.group).push(node);
        });

        /* 先清理本次不存在的边，空节点早退时旧边目标也会立即失效。 */
        var nextEdgeIds = new Set();
        edges.forEach(function (edge) { nextEdgeIds.add(edge.id); });
        edgeEls.forEach(function (group, id) {
          if (!nextEdgeIds.has(id)) {
            removeNode(group);
            edgeEls.delete(id);
          }
        });
        edgeState.clear();

        if (!nodes.length) {
          viewport.hidden = true;
          legend.hidden = true;
          hint.hidden = true;
          note.hidden = true;
          empty.hidden = false;
          nodeEls = newNodeEls;
          edgeState.clear();
          if (scroll) scroll.schedule();
          return;
        }
        viewport.hidden = false;
        empty.hidden = true;

        var canvas = layoutGraph(nodes, edges, positions);
        svg.setAttribute('width', String(Math.ceil(canvas.width)));
        svg.setAttribute('height', String(Math.ceil(canvas.height)));
        svg.setAttribute('viewBox', canvas.minX + ' ' + canvas.minY + ' ' +
          Math.ceil(canvas.width) + ' ' + Math.ceil(canvas.height));
        setText(svgDesc, '共 ' + nodes.length + ' 个节点、' + edges.length + ' 条边。' +
          (groupMap.size ? '分组：' + Array.from(groupMap.keys()).join('、') + '。' : '') +
          '画布超出容器时可滚动查看。');

        legend.hidden = groupMap.size === 0;
        if (groupMap.size) legend.setAttribute('role', 'list');
        else legend.removeAttribute('role');
        legend.replaceChildren();
        groupMap.forEach(function (groupNodes, groupName) {
          var chip = el('span', 'nviz-graph__legenditem');
          chip.setAttribute('role', 'listitem');
          var groupIndex = groupNodes[0].groupIndex;
          chip.appendChild(el('span', 'nviz-graph__legendnum', String(groupIndex)));
          chip.appendChild(el('span', 'nviz-graph__legendtext', groupName));
          chip.setAttribute('aria-label', '分组 ' + groupIndex + '：' + groupName + '，' + groupNodes.length + ' 个节点');
          legend.appendChild(chip);
        });

        edges.forEach(function (edge) {
          var from = positions.get(edge.from);
          var to = positions.get(edge.to);
          if (!from || !to) return;
          var mark = markOf(edgeFocus.has(edge.id), edgeChanged.has(edge.id));
          var geometry = edgePathGeometry(edge, from, to);
          var group = edgeEls.get(edge.id) || svgEl('g');
          var parts = ensureEdgeStructure(group);
          group.setAttribute('class', 'nviz-graph__edge');
          group.setAttribute('data-edge-id', edge.id);
          group.setAttribute('data-from', edge.from);
          group.setAttribute('data-to', edge.to);
          group.setAttribute('data-mark', mark || 'none');
          parts.title.textContent = (edge.directed ? '方向 ' : '') + edge.from + ' 到 ' + edge.to +
            (edge.label ? '：' + edge.label : '') + markAria(mark);
          parts.path.setAttribute('d', geometry.d);
          if (edge.directed) parts.path.setAttribute('marker-end', 'url(#' + markerId + ')');
          else parts.path.removeAttribute('marker-end');
          parts.labelWrap.replaceChildren();
          if (edge.label) edgeLabel(parts.labelWrap, edge, geometry.labelX, geometry.labelY);
          edgeLayer.appendChild(group);
          edgeEls.set(edge.id, group);
          edgeState.set(edge.id, {
            id: edge.id,
            from: edge.from,
            to: edge.to,
            label: edge.label,
            directed: edge.directed,
            mark: mark,
            group: group,
            path: parts.path,
            start: { x: geometry.start.x, y: geometry.start.y },
            end: { x: geometry.end.x, y: geometry.end.y }
          });
        });

        var focusLabels = [];
        var changedLabels = [];
        var bothLabels = [];
        nodes.forEach(function (node) {
          var box = positions.get(node.id);
          if (!box) return;
          var g = oldNodeEls.get(node.id) || svgEl('g');
          var mark = markOf(focus.has(node.id), changed.has(node.id));
          nodeContent(g, node, box, mark, interactive);
          nodeLayer.appendChild(g);
          newNodeEls.set(node.id, g);
          if (mark === 'both') bothLabels.push(node.label);
          else if (mark === 'changed') changedLabels.push(node.label);
          else if (mark === 'focus') focusLabels.push(node.label);
        });
        nodeEls = newNodeEls;

        var summary = [];
        if (focusLabels.length) summary.push('关注：' + focusLabels.join('、'));
        if (changedLabels.length) summary.push('变化：' + changedLabels.join('、'));
        if (bothLabels.length) summary.push('关注并变化：' + bothLabels.join('、'));
        if (summary.length) {
          note.textContent = summary.join('；') + '。';
          note.hidden = false;
        }

        if (scroll) scroll.schedule();
      }

      var cleanup = function () {
        if (scroll) scroll.destroy();
        if (svgBag) svgBag.clear();
      };
      var instance = Core.component(root, model, render, cleanup);
      render({});
      host.appendChild(root);
      scroll = attachScrollRegion(viewport, hint, 'both');
      svgBag = listenersFor(svg);
      svgBag.on('click', function (event) {
        if (typeof model.onSelect !== 'function') return;
        var g = closestInside(event.target, '.nviz-graph__node', svg);
        if (!g || g.getAttribute('tabindex') !== '0') return;
        model.onSelect(g.getAttribute('data-id'), event);
      });
      svgBag.on('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
        if (typeof model.onSelect !== 'function') return;
        var g = closestInside(event.target, '.nviz-graph__node', svg);
        if (!g || g.getAttribute('tabindex') !== '0') return;
        event.preventDefault();
        model.onSelect(g.getAttribute('data-id'), event);
      });
      scroll.schedule();

      instance.getTarget = function (id) {
        if (instance.destroyed || id == null) return null;
        return nodeEls.get(String(id)) || null;
      };

      /* ---------- 边目标与路径查询 ----------
       * 边 id：作者提供 edge.id；缺省为 "from -> to"，平行同向边追加 " #2"…
       * 所有点/端点坐标均为 SVG 局部用户坐标（与 viewBox 同坐标系）；
       * getEdgePointClient 用路径的 screen CTM 转成 DOM 视口 client 坐标。
       * 边查询与节点 getTarget 分开：getTarget 永远只返回节点 <g>。 */
      function liveEdge(id) {
        if (instance.destroyed || id == null) return null;
        var record = edgeState.get(String(id));
        if (!record || !record.path) return null;
        return record;
      }

      function edgeLengthOf(record) {
        var length = 0;
        try { length = record.path.getTotalLength(); } catch (err) { length = 0; }
        return isFinite(length) ? length : 0;
      }

      function edgePointAtRatio(record, ratio) {
        var value = Number(ratio);
        if (!isFinite(value)) value = 0;
        value = Math.min(1, Math.max(0, value));
        var length = edgeLengthOf(record);
        if (!length) return { x: record.start.x, y: record.start.y, ratio: value };
        var point = record.path.getPointAtLength(length * value);
        return { x: point.x, y: point.y, ratio: value };
      }

      function edgePointToClient(record, point) {
        var ctm = null;
        try { ctm = record.path.getScreenCTM(); } catch (err) { ctm = null; }
        if (ctm) {
          return {
            x: ctm.a * point.x + ctm.c * point.y + ctm.e,
            y: ctm.b * point.x + ctm.d * point.y + ctm.f
          };
        }
        var rect = svg.getBoundingClientRect();
        var view = svg.viewBox && svg.viewBox.baseVal;
        if (!view || !view.width || !view.height) {
          return { x: rect.left + point.x, y: rect.top + point.y };
        }
        return {
          x: rect.left + (point.x - view.x) * rect.width / view.width,
          y: rect.top + (point.y - view.y) * rect.height / view.height
        };
      }

      instance.getEdgeTarget = function (id) {
        var record = liveEdge(id);
        return record ? record.group : null;
      };
      instance.getEdgePath = function (id) {
        var record = liveEdge(id);
        return record ? record.path : null;
      };
      instance.getEdgeLength = function (id) {
        var record = liveEdge(id);
        return record ? edgeLengthOf(record) : null;
      };
      instance.getEdgePoint = function (id, ratio) {
        var record = liveEdge(id);
        if (!record) return null;
        var point = edgePointAtRatio(record, ratio);
        return { x: point.x, y: point.y };
      };
      instance.getEdgePointClient = function (id, ratio) {
        var record = liveEdge(id);
        if (!record) return null;
        var point = edgePointAtRatio(record, ratio);
        return edgePointToClient(record, point);
      };
      instance.getEdgePointAt = function (id, distance) {
        var record = liveEdge(id);
        if (!record) return null;
        var length = edgeLengthOf(record);
        var offset = Number(distance);
        if (!isFinite(offset)) offset = 0;
        offset = Math.min(length, Math.max(0, offset));
        if (!length) return { x: record.start.x, y: record.start.y, distance: 0, ratio: 0 };
        var point = record.path.getPointAtLength(offset);
        return { x: point.x, y: point.y, distance: offset, ratio: offset / length };
      };
      instance.getEdgeEndpoints = function (id) {
        var record = liveEdge(id);
        if (!record) return null;
        return {
          start: { x: record.start.x, y: record.start.y },
          end: { x: record.end.x, y: record.end.y }
        };
      };
      instance.getEdgeInfo = function (id) {
        var record = liveEdge(id);
        if (!record) return null;
        return {
          id: record.id,
          from: record.from,
          to: record.to,
          label: record.label,
          directed: record.directed,
          mark: record.mark || 'none',
          length: edgeLengthOf(record),
          endpoints: instance.getEdgeEndpoints(id)
        };
      };
      return instance;
    }
  };
})(window);
