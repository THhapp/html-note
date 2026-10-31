/*! NoteViz objects D01-D06 — D04 Timeline, D05 TreeDiagram.
 *  Classic script; load after src/viz/objects.js (internal shared helpers).
 *  Public entries: NoteViz.Timeline, NoteViz.TreeDiagram.
 *  No network, no eval, no HTML parsing. */
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
  var markOf = shared.markOf;
  var markLabel = shared.markLabel;
  var markAria = shared.markAria;
  var emptyLine = shared.emptyLine;
  var makeScrollHint = shared.makeScrollHint;
  var attachScrollRegion = shared.attachScrollRegion;
  var charUnits = shared.charUnits;
  var wrapText = shared.wrapText;
  var findDescriptorIndex = shared.findDescriptorIndex;
  var toIdSet = shared.toIdSet;
  var resolveItemKeys = shared.resolveItemKeys;

  /* =====================================================================
   * D04 — Timeline
   * ===================================================================== */

  NoteViz.Timeline = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var root = el('div', 'nviz-timeline');
      var rangeBar = el('p', 'nviz-timeline__range');
      var viewport = el('div', 'nviz-timeline__viewport');
      var list = el('ol', 'nviz-timeline__list');
      var hint = makeScrollHint('nviz-timeline__hint');
      var empty = emptyLine('暂无可显示的时间线事件。');
      var scroll = null;
      var parts = new Map();
      var targets = new Map();
      var currentItems = [];

      rangeBar.hidden = true;
      viewport.appendChild(list);
      empty.hidden = true;
      root.setAttribute('role', 'group');
      root.append(rangeBar, viewport, hint, empty);

      var model = Object.assign({
        items: [],
        orientation: 'horizontal',
        current: null,
        focus: null,
        changed: null,
        start: null,
        end: null,
        formatTime: null,
        label: '时间线'
      }, options || {});

      function formatValue(value, item) {
        if (value == null || value === '') return '';
        if (typeof model.formatTime === 'function') {
          try {
            return text(model.formatTime(value, item || null));
          } catch (error) {
            return text(value);
          }
        }
        return text(value);
      }

      function normalizeTimelineItems(input) {
        var source = Array.isArray(input) ? input : [];
        return source.map(function (item, index) {
          var data = item != null && typeof item === 'object' ? item : { label: item };
          var hasRange = data.start != null && data.end != null;
          var kind = data.kind === 'range' || data.kind === 'phase' || data.kind === 'event' ? data.kind :
            (hasRange ? 'range' : 'event');
          if ((kind === 'phase' || kind === 'range') && !hasRange) kind = 'event';
          var id = data.id != null && text(data.id) !== '' ? text(data.id) : 'event-' + index;
          var label = data.label == null ? (data.title == null ? '未命名事件' : text(data.title)) : text(data.label);
          var timeLabel = '';
          if (data.timeLabel != null) {
            timeLabel = text(data.timeLabel);
          } else if (kind !== 'event' && hasRange) {
            timeLabel = formatValue(data.start, data) + ' – ' + formatValue(data.end, data);
          } else if (data.time != null) {
            timeLabel = formatValue(data.time, data);
          } else if (data.start != null) {
            timeLabel = formatValue(data.start, data);
          }
          return {
            id: id,
            index: index,
            label: label,
            description: data.description == null ? '' : text(data.description),
            kind: kind,
            start: data.start,
            end: data.end,
            timeLabel: timeLabel,
            raw: data
          };
        });
      }

      function createParts() {
        var li = el('li', 'nviz-timeline__item');
        var time = el('div', 'nviz-timeline__time');
        var rail = el('div', 'nviz-timeline__rail');
        rail.setAttribute('aria-hidden', 'true');
        var marker = el('span', 'nviz-timeline__marker');
        rail.appendChild(marker);
        var card = el('div', 'nviz-timeline__card');
        var head = el('div', 'nviz-timeline__cardhead');
        var label = el('span', 'nviz-timeline__label');
        var kind = el('span', 'nviz-timeline__kind');
        var state = el('span', 'nviz-timeline__state');
        head.append(label, kind, state);
        var desc = el('p', 'nviz-timeline__desc');
        card.append(head, desc);
        li.append(time, rail, card);
        return {
          li: li,
          time: time,
          label: label,
          kind: kind,
          state: state,
          desc: desc,
          card: card
        };
      }

      function render(patch) {
        var items = normalizeTimelineItems(model.items);
        var label = text(model.label) || '时间线';
        var orientation = model.orientation === 'vertical' ? 'vertical' : 'horizontal';
        var focus = resolveItemKeys(model.focus, items, { indexRefs: true });
        var changed = resolveItemKeys(model.changed, items, { indexRefs: true });
        var currentIndex = findDescriptorIndex(items, model.current);
        var current = currentIndex >= 0 ? items[currentIndex].id : '';
        var oldParts = parts;
        var newParts = new Map();
        var newTargets = new Map();
        currentItems = items;

        root.setAttribute('data-orientation', orientation);
        root.setAttribute('aria-label', label);
        viewport.setAttribute('aria-label', label + '，可滚动列表');
        viewport.setAttribute('data-orientation', orientation);

        var startLabel = formatValue(model.start, null);
        var endLabel = formatValue(model.end, null);
        if (startLabel || endLabel) {
          rangeBar.hidden = false;
          rangeBar.textContent = '时间范围：' + (startLabel || '起点') + ' — ' + (endLabel || '终点');
        } else {
          rangeBar.hidden = true;
          rangeBar.textContent = '';
        }

        list.replaceChildren();
        if (!items.length) {
          viewport.hidden = true;
          empty.hidden = false;
          hint.hidden = true;
          rangeBar.hidden = true;
          parts = newParts;
          targets = newTargets;
          if (scroll) scroll.schedule();
          return;
        }
        viewport.hidden = false;
        empty.hidden = true;

        items.forEach(function (item) {
          var created = oldParts.get(item.id) || createParts();
          var li = created.li;
          var isCurrent = item.id === current;
          var isFocus = focus.has(item.id);
          var isChanged = changed.has(item.id);
          var mark = markOf(isFocus, isChanged);
          var stateParts = [];
          if (isCurrent) stateParts.push('当前');
          if (isFocus) stateParts.push('关注');
          if (isChanged) stateParts.push('变化');
          created.time.textContent = item.timeLabel || '时间未标注';
          created.label.textContent = item.label;
          var kindText = item.kind === 'phase' ? '阶段' : (item.kind === 'range' ? '区间' : '');
          created.kind.textContent = kindText;
          created.kind.hidden = !kindText;
          created.state.textContent = stateParts.join(' · ');
          created.state.hidden = !stateParts.length;
          created.desc.textContent = item.description;
          created.desc.hidden = !item.description;
          created.card.setAttribute('data-kind', item.kind);
          li.setAttribute('data-id', item.id);
          li.setAttribute('data-kind', item.kind);
          li.setAttribute('data-current', isCurrent ? 'true' : 'false');
          li.setAttribute('data-focus', isFocus ? 'true' : 'false');
          li.setAttribute('data-changed', isChanged ? 'true' : 'false');
          li.setAttribute('data-mark', mark || 'none');
          if (isCurrent) li.setAttribute('aria-current', 'step');
          else li.removeAttribute('aria-current');
          li.removeAttribute('aria-label');
          list.appendChild(li);
          newParts.set(item.id, created);
          newTargets.set(item.id, li);
        });

        parts = newParts;
        targets = newTargets;
        if (scroll) scroll.schedule();
      }

      var cleanup = function () {
        if (scroll) scroll.destroy();
      };
      var instance = Core.component(root, model, render, cleanup);
      render({});
      host.appendChild(root);
      scroll = attachScrollRegion(viewport, hint, 'both');
      scroll.schedule();

      instance.getTarget = function (id) {
        if (instance.destroyed || id == null) return null;
        var key = String(id);
        if (targets.has(key)) return targets.get(key);
        if (/^-?\d+$/.test(key)) {
          var index = Number(key);
          if (index >= 0 && index < currentItems.length) return targets.get(currentItems[index].id) || null;
        }
        return null;
      };
      return instance;
    }
  };

  /* =====================================================================
   * D05 — Tree diagram
   * ===================================================================== */

  function normalizeTree(input) {
    var rootsSource;
    if (Array.isArray(input)) rootsSource = input;
    else if (input != null && typeof input === 'object') rootsSource = [input];
    else rootsSource = [];

    var flat = [];
    var roots = [];

    function walk(source, parent, depth, path, ancestors) {
      if (source == null) return null;
      if (typeof source !== 'object') source = { label: source };
      if (ancestors.indexOf(source) >= 0) return null;

      var id = source.id != null && text(source.id) !== '' ? text(source.id) : 'tree-' + path;
      var label = source.label == null ?
        (source.title == null ? (source.name == null ? '未命名节点' : text(source.name)) : text(source.title)) :
        text(source.label);
      var node = {
        id: id,
        label: label,
        depth: depth,
        parent: parent,
        children: [],
        source: source
      };
      flat.push(node);
      var childSource = Array.isArray(source.children) ? source.children : [];
      var nextAncestors = ancestors.concat([source]);
      childSource.forEach(function (child, index) {
        var childNode = walk(child, node, depth + 1, path + '-' + index, nextAncestors);
        if (childNode) node.children.push(childNode);
      });
      return node;
    }

    rootsSource.forEach(function (root, index) {
      var rootNode = walk(root, null, 0, String(index), []);
      if (rootNode) roots.push(rootNode);
    });

    return { roots: roots, flat: flat };
  }

  NoteViz.TreeDiagram = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var root = el('div', 'nviz-tree');
      var viewport = el('div', 'nviz-tree__viewport');
      var hint = makeScrollHint('nviz-tree__hint');
      var empty = emptyLine('暂无可显示的层级节点。');
      var titleId = uniqueId('nviz-tree-title');
      var descId = uniqueId('nviz-tree-desc');
      var svg = svgEl('svg', { class: 'nviz-tree__svg', role: 'group' });
      var svgTitle = svgEl('title');
      var svgDesc = svgEl('desc');
      var edgeLayer = svgEl('g', { class: 'nviz-tree__edges' });
      var nodeLayer = svgEl('g', { class: 'nviz-tree__nodes' });
      var nodeEls = new Map();
      var scroll = null;

      svgTitle.id = titleId;
      svgDesc.id = descId;
      svg.setAttribute('aria-labelledby', titleId + ' ' + descId);
      svg.append(svgTitle, svgDesc, edgeLayer, nodeLayer);
      viewport.appendChild(svg);
      empty.hidden = true;
      root.setAttribute('role', 'group');
      root.append(viewport, hint, empty);

      var model = Object.assign({
        nodes: [],
        orientation: 'down',
        focus: null,
        changed: null,
        label: '层级结构图'
      }, options || {});
      if (!Array.isArray(model.nodes) && model.root != null) model.nodes = model.root;

      function metricsFor(node, mark) {
        var lines = wrapText(node.label, 13);
        var width = 180;
        var height = 40 + Math.max(0, lines.length - 1) * 18 + (mark ? 20 : 0);
        return { lines: lines, width: width, height: height };
      }

      function layoutTree(flat, roots, metrics, orientation, positions) {
        if (!flat.length) return { width: 280, height: 160 };
        var leafCounter = 0;

        function assignOrder(node) {
          if (!node.children.length) {
            node.order = leafCounter;
            leafCounter += 1;
            return node.order;
          }
          node.children.forEach(assignOrder);
          var first = node.children[0].order;
          var last = node.children[node.children.length - 1].order;
          node.order = (first + last) / 2;
          return node.order;
        }
        roots.forEach(assignOrder);

        var maxDepth = 0;
        var maxHeight = 0;
        var maxWidth = 0;
        flat.forEach(function (node) {
          var m = metrics.get(node.id);
          maxDepth = Math.max(maxDepth, node.depth);
          maxHeight = Math.max(maxHeight, m.height);
          maxWidth = Math.max(maxWidth, m.width);
        });

        var margin = 26;
        if (orientation === 'right') {
          var gapX = 64;
          var gapY = 24;
          var slotH = maxHeight + gapY;
          var levelGap = maxWidth + gapX;
          var canvasW = margin * 2 + maxWidth + maxDepth * levelGap;
          var canvasH = margin * 2 + maxHeight + Math.max(0, leafCounter - 1) * slotH;
          flat.forEach(function (node) {
            var m = metrics.get(node.id);
            var x = margin + node.depth * levelGap;
            var centerY = margin + maxHeight / 2 + node.order * slotH;
            positions.set(node.id, {
              x: x,
              y: centerY - m.height / 2,
              width: m.width,
              height: m.height,
              cx: x + m.width / 2,
              cy: centerY
            });
          });
          return { width: Math.max(canvasW, 320), height: Math.max(canvasH, 180) };
        }

        var gapX = 30;
        var gapY = 48;
        var nodeW = 180;
        var slotW = nodeW + gapX;
        var levelHeights = [];
        flat.forEach(function (node) {
          var m = metrics.get(node.id);
          levelHeights[node.depth] = Math.max(levelHeights[node.depth] || 0, m.height);
        });
        var levelY = [];
        var y = margin;
        for (var depth = 0; depth <= maxDepth; depth += 1) {
          levelY[depth] = y;
          y += (levelHeights[depth] || 40) + gapY;
        }
        var canvasW = margin * 2 + nodeW + Math.max(0, leafCounter - 1) * slotW;
        var canvasH = y - gapY + margin;
        flat.forEach(function (node) {
          var m = metrics.get(node.id);
          var x = margin + node.order * slotW;
          positions.set(node.id, {
            x: x,
            y: levelY[node.depth],
            width: m.width,
            height: m.height,
            cx: x + m.width / 2,
            cy: levelY[node.depth] + m.height / 2
          });
        });
        return { width: Math.max(canvasW, 320), height: Math.max(canvasH, 180) };
      }

      function nodeContent(g, node, box, mark) {
        g.replaceChildren();
        var m = metricsFor(node, mark);
        var title = svgEl('title');
        title.textContent = node.label;
        g.appendChild(title);
        g.appendChild(svgEl('rect', {
          class: 'nviz-tree__box',
          x: '0',
          y: '0',
          width: String(box.width),
          height: String(box.height),
          rx: '9'
        }));

        var label = svgEl('text', { class: 'nviz-tree__label', x: '12', y: '26' });
        m.lines.forEach(function (line, index) {
          var tspan = svgEl('tspan', { x: '12', dy: index === 0 ? '0' : '18' });
          tspan.textContent = line;
          label.appendChild(tspan);
        });
        g.appendChild(label);

        if (mark) {
          var statusText = markLabel(mark);
          var units = 0;
          Array.from(statusText).forEach(function (character) { units += charUnits(character); });
          var statusWidth = Math.max(36, units * 7.2 + 14);
          g.appendChild(svgEl('rect', {
            class: 'nviz-tree__statusbg',
            x: '10',
            y: String(box.height - 23),
            width: String(statusWidth),
            height: '16',
            rx: '5'
          }));
          var status = svgEl('text', {
            class: 'nviz-tree__status',
            x: '17',
            y: String(box.height - 11)
          });
          status.textContent = statusText;
          g.appendChild(status);
        }

        var parentText = node.parent ? '，上级 ' + node.parent.label : '，根节点';
        var aria = '节点 ' + node.label + parentText + '，' + node.children.length + ' 个子节点' + markAria(mark);
        g.setAttribute('aria-label', aria);
        g.setAttribute('role', 'group');
        g.setAttribute('data-id', node.id);
        g.setAttribute('data-mark', mark || 'none');
        g.setAttribute('class', 'nviz-tree__node');
        g.setAttribute('transform', 'translate(' + box.x + ',' + box.y + ')');
      }

      function render(patch) {
        var tree = normalizeTree(model.nodes);
        var flat = tree.flat;
        var roots = tree.roots;
        var orientation = model.orientation === 'right' ? 'right' : 'down';
        var label = text(model.label) || '层级结构图';
        var focus = toIdSet(model.focus);
        var changed = toIdSet(model.changed);
        var metrics = new Map();
        var positions = new Map();
        var oldNodeEls = nodeEls;
        var newNodeEls = new Map();

        root.setAttribute('data-orientation', orientation);
        root.setAttribute('aria-label', label);
        viewport.setAttribute('aria-label', label + '，可滚动画布');
        setText(svgTitle, label);
        setText(svgDesc, '');
        edgeLayer.replaceChildren();
        nodeLayer.replaceChildren();

        flat.forEach(function (node) {
          var mark = markOf(focus.has(node.id), changed.has(node.id));
          node.mark = mark;
          metrics.set(node.id, metricsFor(node, mark));
        });

        if (!flat.length) {
          viewport.hidden = true;
          empty.hidden = false;
          hint.hidden = true;
          nodeEls = newNodeEls;
          if (scroll) scroll.schedule();
          return;
        }
        viewport.hidden = false;
        empty.hidden = true;

        var canvas = layoutTree(flat, roots, metrics, orientation, positions);
        svg.setAttribute('width', String(Math.ceil(canvas.width)));
        svg.setAttribute('height', String(Math.ceil(canvas.height)));
        svg.setAttribute('viewBox', '0 0 ' + Math.ceil(canvas.width) + ' ' + Math.ceil(canvas.height));
        setText(svgDesc, '共 ' + flat.length + ' 个节点，' +
          (roots.length > 1 ? roots.length + ' 个根节点，' : '') +
          '方向' + (orientation === 'right' ? '向右' : '向下') + '。画布超出容器时可滚动查看。');

        flat.forEach(function (node) {
          if (!node.parent) return;
          var parentBox = positions.get(node.parent.id);
          var childBox = positions.get(node.id);
          if (!parentBox || !childBox) return;
          var path = svgEl('path', { class: 'nviz-tree__edge' });
          if (orientation === 'right') {
            var startX = parentBox.x + parentBox.width;
            var startY = parentBox.y + parentBox.height / 2;
            var endX = childBox.x;
            var endY = childBox.y + childBox.height / 2;
            var midX = (startX + endX) / 2;
            path.setAttribute('d', 'M ' + startX + ' ' + startY + ' H ' + midX +
              ' V ' + endY + ' H ' + endX);
          } else {
            var sx = parentBox.x + parentBox.width / 2;
            var sy = parentBox.y + parentBox.height;
            var ex = childBox.x + childBox.width / 2;
            var ey = childBox.y;
            var midY = (sy + ey) / 2;
            path.setAttribute('d', 'M ' + sx + ' ' + sy + ' V ' + midY + ' H ' + ex + ' V ' + ey);
          }
          edgeLayer.appendChild(path);
        });

        flat.forEach(function (node) {
          var box = positions.get(node.id);
          if (!box) return;
          var metric = metrics.get(node.id);
          box.height = metric.height;
          var g = oldNodeEls.get(node.id) || svgEl('g');
          nodeContent(g, node, box, node.mark);
          nodeLayer.appendChild(g);
          newNodeEls.set(node.id, g);
        });
        nodeEls = newNodeEls;
        if (scroll) scroll.schedule();
      }

      var cleanup = function () {
        if (scroll) scroll.destroy();
      };
      var instance = Core.component(root, model, render, cleanup);
      render({});
      host.appendChild(root);
      scroll = attachScrollRegion(viewport, hint, 'both');
      scroll.schedule();

      instance.getTarget = function (id) {
        if (instance.destroyed || id == null) return null;
        return nodeEls.get(String(id)) || null;
      };
      return instance;
    }
  };
})(window);
