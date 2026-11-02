/* NoteBlocks B07 — ProcessFlow.
 * Composes public NoteBlocks.StepPlayer, NoteViz.Graph and NoteUI.Steps.
 * Flow data and stops are host-owned. Node focus and edge focus/changed use the
 * Graph public options; current edge targets are Graph.getEdgeTarget() rather
 * than a parallel text card. The relation area keeps only supplementary text
 * (route/label/warnings), never the only edge emphasis.
 * No automatic playback, no general-purpose flow editor.
 * Loads after src/blocks/shared.js (internal helpers, not a public entry).
 */
(function (global) {
  'use strict';

  var NoteBlocks = global.NoteBlocks = global.NoteBlocks || {};

  var shared = global.NoteBlocksInternals;
  if (!shared) {
    throw new Error('NoteBlocks 组合块需要先加载 src/blocks/shared.js（内部共享文件）。');
  }
  var ui = shared.ui;
  var viz = shared.viz;
  var own = shared.own;
  var text = shared.text;
  var make = shared.make;
  var validateHost = shared.validateHost;
  var requireComponents = shared.requireComponents;
  var safeDestroy = shared.safeDestroy;
  var array = shared.array;
  function hasManualPositions(nodes) {
    return nodes.length > 0 && nodes.every(function (node) {
      return node && node.x != null && node.y != null &&
        isFinite(Number(node.x)) && isFinite(Number(node.y));
    });
  }

  function stepLabel(step, index, nodeById) {
    if (step && step.label != null && text(step.label).trim()) return text(step.label);
    var node = step && step.nodeId != null ? nodeById[text(step.nodeId)] : null;
    if (node && node.label != null && text(node.label).trim()) return text(node.label);
    return '停点 ' + (index + 1);
  }

  NoteBlocks.ProcessFlow = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host, 'NoteBlocks.ProcessFlow');
      requireComponents('NoteBlocks.ProcessFlow', ['NoteViz.Graph', 'NoteUI.Steps', 'NoteUI.Notice', 'NoteBlocks.StepPlayer']);
      var UI = ui();
      var V = viz();
      var input = options || {};
      var state = {
        nodes: array(input.nodes),
        edges: array(input.edges),
        steps: array(input.steps).filter(function (step) { return step && typeof step === 'object'; }),
        title: input.title == null ? '' : input.title,
        labels: input.labels && typeof input.labels === 'object' ? input.labels : null,
        onStep: typeof input.onStep === 'function' ? input.onStep : null,
        maxWidth: input.maxWidth == null ? null : input.maxWidth,
        label: input.label == null ? '' : text(input.label)
      };
      var destroyed = false;
      var player = null;
      var liveGraph = null;   // 跨停点复用的 Graph 实例；只通过公开 mount/update/getTarget 操作
      var refs = { graph: null, edges: Object.create(null), unresolved: Object.create(null), progress: null, stepIds: Object.create(null) };

      function nodeMap() {
        var map = Object.create(null);
        state.nodes.forEach(function (node) {
          if (node && node.id != null) map[text(node.id)] = node;
        });
        return map;
      }

      function nodeLabel(id) {
        var map = nodeMap();
        var node = id != null ? map[text(id)] : null;
        return node && node.label != null ? text(node.label) : (id == null ? '未指定' : text(id));
      }

      /* 与 NoteViz.Graph 的 normalizeGraphEdges 使用同一套稳定 ID 规则，
         这样 getTarget('edge:<key>') 才能直接对应 Graph.getEdgeTarget(key)。 */
      function edgeRecords() {
        var routeSeen = Object.create(null);
        var used = Object.create(null);
        return state.edges.map(function (edge, index) {
          var source = edge && typeof edge === 'object' ? edge : {};
          var from = source.from == null ? '' : text(source.from);
          var to = source.to == null ? '' : text(source.to);
          var route = from + ' -> ' + to;
          var routeCount = routeSeen[route] || 0;
          routeSeen[route] = routeCount + 1;
          var base;
          if (source.id != null && text(source.id) !== '') base = text(source.id);
          else if (routeCount === 0) base = route;
          else base = route + ' #' + (routeCount + 1);
          var key = base;
          var suffix = 1;
          while (used[key]) {
            suffix += 1;
            key = base + ' #' + suffix;
          }
          used[key] = true;
          return {
            key: key,
            route: route,
            from: from,
            to: to,
            label: source.label == null ? '' : text(source.label),
            directed: source.directed,
            index: index,
            raw: source
          };
        });
      }

      function buildStepWrappers() {
        var map = nodeMap();
        return state.steps.map(function (step, index) {
          return {
            id: step.id,
            label: stepLabel(step, index, map),
            caption: step.caption == null ? '' : text(step.caption),
            state: step
          };
        });
      }

      function resolveEdgeRefs(refsValue, records) {
        var refsIn = refsValue == null ? [] : (Array.isArray(refsValue) ? refsValue : [refsValue]);
        var resolved = [];
        var unresolved = [];
        refsIn.forEach(function (ref) {
          if (ref == null || text(ref) === '') return;
          var key = text(ref);
          var found = null;
          records.some(function (record) {
            if (record.key === key || record.route === key || String(record.index) === key) {
              found = record;
              return true;
            }
            return false;
          });
          if (found) {
            if (resolved.indexOf(found) < 0) resolved.push(found);
          } else if (unresolved.indexOf(key) < 0) {
            unresolved.push(key);
          }
        });
        return { edges: resolved, unresolved: unresolved };
      }

      function currentStep() {
        if (destroyed || !player) return null;
        var wrapper = player.getStep();
        return wrapper && wrapper.state ? wrapper.state : null;
      }

      function render(step, context) {
        refs = { graph: null, edges: Object.create(null), unresolved: Object.create(null), progress: null, stepIds: Object.create(null) };
        var wrap = make('div', 'nblk-flow__layout');
        var summary = make('div', 'nblk-flow__summary');
        var stepNode = step && step.nodeId != null ? text(step.nodeId) : '';
        var map = nodeMap();
        var exists = Boolean(stepNode && map[stepNode]);
        var stepIndex = context.index;
        var currentLabel = exists ? nodeLabel(stepNode) : (stepNode || '未指定节点');
        var summaryTitle = make('h3', 'nblk-flow__summary-title', '当前停点：' + currentLabel);
        var summaryMeta = make('p', 'nblk-flow__summary-meta',
          '第 ' + (stepIndex + 1) + ' / ' + state.steps.length + ' 个停点。节点关注由宿主停点数据指定。');
        summary.append(summaryTitle, summaryMeta);

        var records = edgeRecords();
        var focusRelation = resolveEdgeRefs(step && step.edgeIds, records);
        var changedRelation = resolveEdgeRefs(step && step.changedEdgeIds, records);
        var focusKeys = focusRelation.edges.map(function (record) { return record.key; });
        var changedKeys = changedRelation.edges.map(function (record) { return record.key; });

        var canvas = make('div', 'nblk-flow__canvas');
        var graphOptions = {
          nodes: state.nodes,
          edges: state.edges,
          layout: hasManualPositions(state.nodes) ? 'manual' : 'layered',
          focus: exists ? [stepNode] : [],
          changed: [],
          /* 边强调在图中由 Graph 的公开状态表达；关系区只保留文字说明与警告。 */
          edgeFocus: focusKeys,
          edgeChanged: changedKeys,
          label: (state.label || '流程') + '：' + currentLabel
        };
        var graph;
        if (!liveGraph) {
          graph = V.Graph.mount(canvas, graphOptions);
          liveGraph = graph;
        } else {
          /* 停点切换/flow.update 复用同一 Graph：节点与边按稳定 ID 保留目标，
             只更新 focus/edgeFocus/edgeChanged 与数据，避免每步重建 SVG。 */
          graph = liveGraph;
          canvas.appendChild(graph.el);
          graph.update(graphOptions);
        }
        refs.graph = graph;

        var canEdgeTargets = typeof graph.getEdgeTarget === 'function';
        var refsEdges = Object.create(null);
        var refsUnresolved = Object.create(null);
        var missingEdges = Object.create(null);
        function registerRecord(record) {
          if (!canEdgeTargets) return;
          var target = graph.getEdgeTarget(record.key);
          if (target) refsEdges[record.key] = target;
          else missingEdges[record.key] = record;
        }
        focusRelation.edges.forEach(registerRecord);
        changedRelation.edges.forEach(registerRecord);

        var relations = make('section', 'nblk-flow__relations');
        var relationsTitle = make('h4', 'nblk-flow__relations-title', '本步关系');
        relations.appendChild(relationsTitle);
        if (focusRelation.edges.length || changedRelation.edges.length) {
          relations.appendChild(make('p', 'nblk-flow__relations-meta',
            '边强调已画在图中；这里只补充起止节点、边标签和未解析引用。'));
        }
        var relationList = make('div', 'nblk-flow__relation-list');
        var changedOnly = changedRelation.edges.filter(function (record) {
          return focusRelation.edges.indexOf(record) < 0;
        });

        if (!focusRelation.edges.length && !changedRelation.edges.length &&
            !focusRelation.unresolved.length && !changedRelation.unresolved.length) {
          relationList.appendChild(make('p', 'nblk-flow__relation-empty',
            '本停点未指定边；当前关注节点仍由图中虚线标记。'));
        }

        function relationRow(record, tagText) {
          var row = make('div', 'nblk-flow__relation');
          row.setAttribute('data-edge-key', record.key);
          var tag = make('span', 'nblk-flow__relation-tag', tagText);
          var route = make('span', 'nblk-flow__relation-route',
            nodeLabel(record.from) + ' → ' + nodeLabel(record.to));
          var label = record.label
            ? make('span', 'nblk-flow__relation-label', record.label)
            : null;
          row.append(tag, route);
          if (label) row.appendChild(label);
          relationList.appendChild(row);
          return row;
        }

        focusRelation.edges.forEach(function (record) {
          var both = changedRelation.edges.indexOf(record) >= 0;
          var row = relationRow(record, both ? '当前边 · 变化边' : '当前边');
          if (canEdgeTargets) {
            if (!refsEdges[record.key]) row.classList.add('nblk-flow__relation--missing');
          } else {
            refsEdges[record.key] = row;   // 旧版 Graph 回退：关系行仍是可查询目标
          }
        });
        changedOnly.forEach(function (record) {
          var row = relationRow(record, '变化边');
          if (canEdgeTargets) {
            if (!refsEdges[record.key]) row.classList.add('nblk-flow__relation--missing');
          } else if (!refsEdges[record.key]) {
            refsEdges[record.key] = row;
          }
        });

        function addUnresolved(key, changedFlag) {
          var card = make('div', 'nblk-flow__relation nblk-flow__relation--missing');
          card.setAttribute('data-edge-key', key);
          var tag = make('span', 'nblk-flow__relation-tag', changedFlag ? '未找到变化边' : '未找到边');
          var msg = make('span', 'nblk-flow__relation-route',
            '停点引用了边 ' + key + '，但 edges 中没有匹配的 id、from -> to 或索引。');
          card.append(tag, msg);
          relationList.appendChild(card);
          refsUnresolved[key] = card;
        }
        focusRelation.unresolved.forEach(function (key) { addUnresolved(key, false); });
        changedRelation.unresolved.forEach(function (key) {
          if (!refsUnresolved[key]) addUnresolved(key, true);
        });

        if (canEdgeTargets) {
          Object.keys(missingEdges).forEach(function (key) {
            if (refsUnresolved[key]) return;
            var record = missingEdges[key];
            var card = make('div', 'nblk-flow__relation nblk-flow__relation--missing');
            card.setAttribute('data-edge-key', key);
            var tag = make('span', 'nblk-flow__relation-tag', '边不在图中');
            var msg = make('span', 'nblk-flow__relation-route',
              '边「' + record.key + '」引用存在，但 Graph 未渲染该边（端点无效或 ID 冲突）。');
            card.append(tag, msg);
            relationList.appendChild(card);
            refsUnresolved[key] = card;
          });
        }

        refs.edges = refsEdges;
        refs.unresolved = refsUnresolved;
        relations.appendChild(relationList);

        var noteHost = make('div', 'nblk-flow__note');
        var notice = null;
        if (step && step.note != null && text(step.note).trim()) {
          notice = UI.Notice.mount(noteHost, {
            title: '本步说明',
            content: step.note,
            tone: 'neutral'
          });
        }

        var progressHost = make('div', 'nblk-flow__progress');
        var stepsInstance = null;
        if (state.steps.length > 1) {
          var progressTitle = make('h4', 'nblk-flow__progress-title', '流程进度');
          progressHost.appendChild(progressTitle);
          stepsInstance = UI.Steps.mount(progressHost, {
            items: state.steps.map(function (item, index) {
              return { label: stepLabel(item, index, map) };
            }),
            current: stepIndex,
            clickable: false,
            orientation: 'horizontal'
          });
        }
        refs.progress = progressHost;
        /* 进度区只有当前停点一个实例；非当前 step id 不映射为目标。 */
        if (step && step.id != null) refs.stepIds[text(step.id)] = progressHost;

        var warning = null;
        if (stepNode && !exists) {
          warning = make('p', 'nblk-flow__warning',
            '当前停点的 nodeId「' + stepNode + '」不在 nodes 中，因此没有节点关注。');
          warning.setAttribute('role', 'status');
        }

        var aside = make('aside', 'nblk-flow__aside');
        aside.setAttribute('aria-label', '本步关系、说明与流程进度');
        aside.append(relations, noteHost, progressHost);
        var main = make('div', 'nblk-flow__main');
        main.append(canvas, aside);
        wrap.append(summary);
        if (warning) wrap.appendChild(warning);
        wrap.appendChild(main);
        context.stageEl.appendChild(wrap);

        return function cleanup() {
          safeDestroy(stepsInstance);
          safeDestroy(notice);
          /* Graph 保留给下一个停点/update 复用；由 destroyBlock 统一销毁。 */
          refs = { graph: null, edges: Object.create(null), unresolved: Object.create(null), progress: null, stepIds: Object.create(null) };
          wrap.remove();
        };
      }

      player = NoteBlocks.StepPlayer.mount(host, {
        steps: buildStepWrappers(),
        render: render,
        initialIndex: 0,
        labels: state.labels || undefined,
        onStep: function (index, wrapper, event) {
          if (destroyed) return;
          if (typeof state.onStep === 'function') {
            state.onStep(index, wrapper && wrapper.state ? wrapper.state : null, event);
          }
        },
        title: state.title,
        maxWidth: state.maxWidth,
        label: state.label || '流程步进'
      });
      player.el.classList.add('nblk-flow');

      function getTarget(id) {
        if (destroyed || id == null) return null;
        var key = text(id);
        if (refs.graph && typeof refs.graph.getTarget === 'function') {
          var nodeTarget = refs.graph.getTarget(key);
          if (nodeTarget) return nodeTarget;
        }
        if (key.indexOf('edge:') === 0) {
          var edgeKey = key.slice(5);
          return refs.edges[edgeKey] || refs.unresolved[edgeKey] || null;
        }
        if (refs.edges[key]) return refs.edges[key];
        if (refs.unresolved[key]) return refs.unresolved[key];
        if (refs.stepIds[key]) return refs.stepIds[key];
        return null;
      }

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        if (own(patch, 'nodes')) state.nodes = array(patch.nodes);
        if (own(patch, 'edges')) state.edges = array(patch.edges);
        if (own(patch, 'steps')) {
          state.steps = array(patch.steps).filter(function (step) { return step && typeof step === 'object'; });
        }
        if (own(patch, 'title')) state.title = patch.title == null ? '' : patch.title;
        if (own(patch, 'labels')) state.labels = patch.labels && typeof patch.labels === 'object' ? patch.labels : null;
        if (own(patch, 'onStep')) state.onStep = typeof patch.onStep === 'function' ? patch.onStep : null;
        if (own(patch, 'maxWidth')) state.maxWidth = patch.maxWidth;
        if (own(patch, 'label')) state.label = patch.label == null ? '' : text(patch.label);

        var stepsChanged = own(patch, 'nodes') || own(patch, 'edges') || own(patch, 'steps') || own(patch, 'label');
        var playerPatch = {
          title: state.title,
          maxWidth: state.maxWidth,
          label: state.label || '流程步进'
        };
        if (stepsChanged) playerPatch.steps = buildStepWrappers();
        if (own(patch, 'labels')) playerPatch.labels = state.labels;
        player.update(playerPatch);
      }

      function destroyBlock() {
        if (destroyed) return;
        destroyed = true;
        refs = { graph: null, edges: Object.create(null), unresolved: Object.create(null), progress: null, stepIds: Object.create(null) };
        safeDestroy(player);
        player = null;
        if (liveGraph) {
          safeDestroy(liveGraph);
          liveGraph = null;
        }
      }

      return {
        el: player.el,
        go: function (index) { if (!destroyed) player.go(index); },
        next: function () { if (!destroyed) player.next(); },
        prev: function () { if (!destroyed) player.prev(); },
        replay: function () { if (!destroyed) player.replay(); },
        reset: function () { if (!destroyed) player.reset(); },
        getStep: currentStep,
        getTarget: getTarget,
        update: update,
        destroy: destroyBlock
      };
    }
  };
})(window);
