/*!
 * NoteViz Flow — PacketFlow (D08 message flow).
 * Scope: window.NoteViz.Flow.PacketFlow; shared helpers in flow-core.js.
 * B08-compatible shapes: message type sync|async|return, dashed override, self loop, status,
 * participant note, two-line labels with full text in <title>, optional indexes/focus band,
 * viewport target. Reveal state is host-owned; no player/timer/rAF.
 */
(function (global) {
  'use strict';

  var NoteViz = global.NoteViz = global.NoteViz || {};
  var shared = global.NoteVizFlowInternals;
  if (!shared) throw new Error('NoteViz.Flow PacketFlow 需要先加载 src/viz/flow-core.js。');
  var text = shared.text, own = shared.own, array = shared.array, isNode = shared.isNode,
    el = shared.el, svgEl = shared.svgEl, setAttrs = shared.setAttrs, setText = shared.setText,
    numberOr = shared.numberOr, textOrEmpty = shared.textOrEmpty, validateHost = shared.validateHost,
    component = shared.component, makeSvgAccessible = shared.makeSvgAccessible,
    setViewportMessage = shared.setViewportMessage, normalizeStatus = shared.normalizeStatus,
    statusList = shared.statusList, defaultId = shared.defaultId,
    setAttributeIf = shared.setAttributeIf, setTextIf = shared.setTextIf;

  var TYPES = { sync: 'sync', async: 'async', return: 'return' };

  function wrapText(value, maxUnits, maxLines) {
    var source = text(value).replace(/\s+/g, ' ').trim();
    if (!source) return { lines: [''], truncated: false };
    var lines = [];
    var current = '';
    var units = 0;
    Array.from(source).forEach(function (char) {
      var width = char === ' ' ? 1 : (char.codePointAt(0) > 0x2e7f ? 2 : 1);
      if (units + width > maxUnits && current) {
        lines.push(current.trim());
        current = '';
        units = 0;
      }
      current += char;
      units += width;
    });
    if (current.trim()) lines.push(current.trim());
    if (!lines.length) lines.push('');
    if (lines.length <= maxLines) return { lines: lines, truncated: false };
    return { lines: lines.slice(0, maxLines), truncated: true };
  }

  function setLines(node, lines) {
    while (node.firstChild) node.removeChild(node.firstChild);
    lines.forEach(function (line, index) {
      var tspan = svgEl('tspan', { x: node.getAttribute('x'), dy: index === 0 ? '0' : '15' });
      tspan.textContent = line;
      node.appendChild(tspan);
    });
  }

  function setLinesIf(node, key, lines) {
    if (node.__nvizFlowLinesKey === key) return;
    node.__nvizFlowLinesKey = key;
    setLines(node, lines);
  }

  function ensureOrder(parent, desired) {
    var current = Array.prototype.slice.call(parent.children);
    if (desired.length === current.length && desired.every(function (node, index) { return node === current[index]; })) return;
    desired.forEach(function (node) { if (node) parent.appendChild(node); });
  }

  var PacketFlow = {};
  PacketFlow.version = '1.0.0';
  PacketFlow.mount = function (host, options) {
    validateHost(host, 'NoteViz.Flow.PacketFlow');
    var root = el('div', 'nviz-flow-packetflow');
    root.setAttribute('role', 'group');
    var viewport = el('div', 'nviz-flow-packetflow__viewport');
    viewport.tabIndex = 0;
    var svg = svgEl('svg', { class: 'nviz-flow-packetflow__svg', viewBox: '0 0 1000 220' });
    var note = el('p', 'nviz-flow-packetflow__note');
    note.hidden = true;
    viewport.appendChild(svg);
    root.append(viewport, note);
    host.appendChild(root);

    var accessible = makeSvgAccessible(svg, '消息流', '参与者与按顺序显现的消息方向；内容由宿主提供。', 'nviz-flow-packetflow');
    var focusLayer = svgEl('g', { class: 'nviz-flow-packetflow__focus-layer' });
    var participantLayer = svgEl('g', { class: 'nviz-flow-packetflow__participants' });
    var lifelineLayer = svgEl('g', { class: 'nviz-flow-packetflow__lifelines' });
    var messageLayer = svgEl('g', { class: 'nviz-flow-packetflow__messages' });
    svg.append(focusLayer, participantLayer, lifelineLayer, messageLayer);

    var model = Object.assign({
      participants: [],
      messages: [],
      revealed: null,
      visibleCount: null,
      focus: null,
      showIndexes: false,
      layoutCount: null,
      label: '消息流'
    }, options || {});

    var participantNodes = new Map();
    var lifelineNodes = new Map();
    var messageNodes = new Map();
    var shownMessages = [];

    function normalizeParticipants() {
      return array(model.participants).map(function (source, index) {
        var item = source && typeof source === 'object' && !isNode(source) ? source : {};
        var id = textOrEmpty(item.id) || defaultId('participant', index);
        return {
          id: id,
          label: item.label == null ? id : text(item.label),
          note: item.note == null ? '' : text(item.note),
          status: normalizeStatus(item.status)
        };
      });
    }

    function normalizeMessages(participantIndexById) {
      return array(model.messages).map(function (source, index) {
        var item = source && typeof source === 'object' && !isNode(source) ? source : {};
        var id = textOrEmpty(item.id) || defaultId('message', index);
        var from = textOrEmpty(item.from);
        var to = textOrEmpty(item.to);
        var type = TYPES[normalizeStatus(item.type)] || 'sync';
        var dashed = typeof item.dashed === 'boolean' ? item.dashed : null;
        return {
          id: id,
          from: from,
          to: to,
          label: item.label == null ? '' : text(item.label),
          note: item.note == null ? '' : text(item.note),
          type: type,
          dashed: dashed,
          status: normalizeStatus(item.status),
          valid: own(participantIndexById, from) && own(participantIndexById, to)
        };
      });
    }

    function revealedSet(messages) {
      if (model.revealed != null) return statusList(model.revealed);
      if (model.visibleCount != null) {
        var count = Math.max(0, Math.min(messages.length, Math.floor(numberOr(model.visibleCount, messages.length))));
        var set = Object.create(null);
        messages.slice(0, count).forEach(function (message) { set[message.id] = true; });
        return set;
      }
      var all = Object.create(null);
      messages.forEach(function (message) { all[message.id] = true; });
      return all;
    }

    function effectiveDashed(message) {
      if (message.type === 'return') return false;
      if (message.dashed === true) return true;
      if (message.dashed === false) return false;
      return message.type === 'async';
    }

    function lineDash(message) {
      if (message.type === 'return') return '2 4';
      if (message.type === 'async' || message.dashed === true) return '7 5';
      return null;
    }

    function arrowPath(tip, y, direction, open) {
      if (open) {
        return 'M ' + (tip - direction * 10).toFixed(1) + ' ' + (y - 5) +
          ' L ' + tip.toFixed(1) + ' ' + y +
          ' L ' + (tip - direction * 10).toFixed(1) + ' ' + (y + 5);
      }
      return 'M ' + tip.toFixed(1) + ' ' + y +
        ' L ' + (tip - direction * 10).toFixed(1) + ' ' + (y - 5) +
        ' L ' + (tip - direction * 10).toFixed(1) + ' ' + (y + 5) + ' Z';
    }

    function render() {
      setAttributeIf(root, 'aria-label', textOrEmpty(model.label) || '消息流');
      setTextIf(accessible.title, textOrEmpty(model.label) || '消息流');
      var participants = normalizeParticipants();
      var participantIndexById = Object.create(null);
      participants.forEach(function (participant, index) { participantIndexById[participant.id] = index; });
      var messages = normalizeMessages(participantIndexById);
      var shown = revealedSet(messages);
      var validMessages = messages.filter(function (message) { return message.valid; });
      shownMessages = validMessages.filter(function (message) { return !!shown[message.id]; });
      var invalid = messages.length - validMessages.length;
      var width = 1000;
      var margin = 76;
      var span = width - margin * 2;
      var boxWidth = 144;
      var boxHeight = 64;
      var xs = participants.map(function (participant, index) {
        if (participants.length <= 1) return width / 2;
        return margin + (span * index) / (participants.length - 1);
      });
      var messageTop = 116;
      var step = 56;
      /* 布局按完整已知消息分配；revealed/visibleCount 只控制 data-hidden，不改变坐标/高度。 */
      var layoutCount = Math.max(1, validMessages.length, Math.floor(numberOr(model.layoutCount, validMessages.length)));
      var lifelineEnd = messageTop + layoutCount * step - 30;

      var seenParticipants = Object.create(null);
      var desiredParticipants = [];
      participants.forEach(function (participant, index) {
        var node = participantNodes.get(participant.id);
        if (!node) {
          node = svgEl('g', { class: 'nviz-flow-packetflow__participant', 'data-id': participant.id });
          node.appendChild(svgEl('rect', { class: 'nviz-flow-packetflow__participant-box', x: 0, y: 14, width: boxWidth, height: boxHeight, rx: 9 }));
          node.appendChild(svgEl('text', { class: 'nviz-flow-packetflow__participant-label', 'text-anchor': 'middle', x: 0, y: 34 }));
          node.appendChild(svgEl('text', { class: 'nviz-flow-packetflow__participant-note', 'text-anchor': 'middle', x: 0, y: 52 }));
          node.appendChild(svgEl('title'));
          node.__nvizFlowCache = Object.create(null);
          participantLayer.appendChild(node);
          participantNodes.set(participant.id, node);
        }
        seenParticipants[participant.id] = true;
        desiredParticipants.push(node);
        var cache = node.__nvizFlowCache || (node.__nvizFlowCache = Object.create(null));
        setAttributeIf(node, 'data-status', participant.status || '');
        var x = xs[index];
        var transform = 'translate(' + (x - boxWidth / 2).toFixed(1) + ',0)';
        if (cache.transform !== transform) {
          node.setAttribute('transform', transform);
          cache.transform = transform;
        }
        var labelNode = node.querySelector('.nviz-flow-packetflow__participant-label');
        setAttributeIf(labelNode, 'x', String(boxWidth / 2));
        var labelLines = wrapText(participant.label || participant.id, 16, 2);
        setLinesIf(labelNode, labelLines.lines.join('\u0001'), labelLines.lines);
        var noteNode = node.querySelector('.nviz-flow-packetflow__participant-note');
        var noteLines = wrapText(participant.note, 18, 1);
        setAttributeIf(noteNode, 'x', String(boxWidth / 2));
        setTextIf(noteNode, noteLines.lines[0] || '');
        setAttributeIf(noteNode, 'display', participant.note ? null : 'none');
        var titleText = [participant.label, participant.note].filter(Boolean).join(' · ') || participant.id;
        var ariaText = [participant.label, participant.note].filter(Boolean).join('，') || participant.id;
        var titleNode = node.querySelector('title');
        if (cache.titleText !== titleText) { setTextIf(titleNode, titleText); cache.titleText = titleText; }
        if (cache.ariaText !== ariaText) { setAttributeIf(node, 'aria-label', ariaText); cache.ariaText = ariaText; }
        var line = lifelineNodes.get(participant.id);
        if (!line) {
          line = svgEl('line', { class: 'nviz-flow-packetflow__lifeline' });
          lifelineLayer.appendChild(line);
          lifelineNodes.set(participant.id, line);
        }
        var xText = x.toFixed(1);
        var endText = lifelineEnd.toFixed(1);
        setAttributeIf(line, 'x1', xText);
        setAttributeIf(line, 'y1', '82');
        setAttributeIf(line, 'x2', xText);
        setAttributeIf(line, 'y2', endText);
      });
      Array.from(participantNodes.keys()).forEach(function (id) {
        if (seenParticipants[id]) return;
        var node = participantNodes.get(id);
        if (node && node.parentNode) node.parentNode.removeChild(node);
        participantNodes.delete(id);
        var line = lifelineNodes.get(id);
        if (line && line.parentNode) line.parentNode.removeChild(line);
        lifelineNodes.delete(id);
      });
      ensureOrder(participantLayer, desiredParticipants);

      var focusId = textOrEmpty(model.focus);
      var focusNode = null;
      var seenMessages = Object.create(null);
      var desiredMessages = [];
      validMessages.forEach(function (message, messageIndex) {
        var node = messageNodes.get(message.id);
        if (!node) {
          node = svgEl('g', { class: 'nviz-flow-packetflow__message', 'data-id': message.id });
          node.appendChild(svgEl('path', { class: 'nviz-flow-packetflow__message-line' }));
          node.appendChild(svgEl('path', { class: 'nviz-flow-packetflow__message-arrow' }));
          node.appendChild(svgEl('text', { class: 'nviz-flow-packetflow__message-index', 'text-anchor': 'end' }));
          node.appendChild(svgEl('text', { class: 'nviz-flow-packetflow__message-label', 'text-anchor': 'middle' }));
          node.appendChild(svgEl('title'));
          node.__nvizFlowCache = Object.create(null);
          messageLayer.appendChild(node);
          messageNodes.set(message.id, node);
        }
        seenMessages[message.id] = true;
        desiredMessages.push(node);
        var fromIndex = participantIndexById[message.from];
        var toIndex = participantIndexById[message.to];
        var x1 = xs[fromIndex];
        var x2 = xs[toIndex];
        var hidden = !shown[message.id];
        var y = messageTop + messageIndex * step;
        var self = message.from === message.to;
        var direction = self ? 1 : (x2 >= x1 ? 1 : -1);
        var openArrow = message.type === 'return';
        var typeText = message.type === 'return' ? '返回' : (message.type === 'async' ? '异步' : '同步');
        var fullLabel = message.label || (message.from + ' → ' + message.to);
        var fromLabel = participants[fromIndex] ? participants[fromIndex].label : message.from;
        var toLabel = participants[toIndex] ? participants[toIndex].label : message.to;
        var labelLines = self
          ? wrapText(fullLabel, 16, 2)
          : wrapText(fullLabel, 24, 2);
        var titleText = typeText + '：' + fromLabel + ' → ' + toLabel + '：' + fullLabel +
          (message.note ? '（' + message.note + '）' : '');
        var ariaText = typeText + '消息：' + fromLabel + ' 到 ' + toLabel + '，' + fullLabel;
        var isFocus = focusId === message.id;
        var cache = node.__nvizFlowCache || (node.__nvizFlowCache = Object.create(null));
        var sig = JSON.stringify([
          message.id, message.from, message.to, message.type, message.dashed, message.status, message.note,
          message.label, fullLabel, titleText, ariaText, hidden, messageIndex, isFocus, model.showIndexes === true,
          fromIndex, toIndex, x1, x2, y, labelLines.lines.join('\u0001')
        ]);
        if (cache.sig !== sig) {
          cache.sig = sig;
          var linePath = node.querySelector('.nviz-flow-packetflow__message-line');
          var arrowNode = node.querySelector('.nviz-flow-packetflow__message-arrow');
          var labelNode = node.querySelector('.nviz-flow-packetflow__message-label');
          var indexNode = node.querySelector('.nviz-flow-packetflow__message-index');
          var dash = lineDash(message);
          setAttributeIf(linePath, 'stroke-dasharray', dash);
          if (self) {
            setAttributeIf(linePath, 'd', 'M ' + x1.toFixed(1) + ' ' + y + ' C ' + (x1 + 36).toFixed(1) + ' ' + y +
              ', ' + (x1 + 36).toFixed(1) + ' ' + (y + 34) + ', ' + x1.toFixed(1) + ' ' + (y + 34));
            setAttributeIf(arrowNode, 'd', arrowPath(x1, y + 34, direction, openArrow));
            setAttributeIf(labelNode, 'x', (x1 + 48).toFixed(1));
            setAttributeIf(labelNode, 'y', String(y + 10));
            setAttributeIf(labelNode, 'text-anchor', 'start');
          } else {
            setAttributeIf(linePath, 'd', 'M ' + x1.toFixed(1) + ' ' + y + ' L ' + x2.toFixed(1) + ' ' + y);
            setAttributeIf(arrowNode, 'd', arrowPath(x2, y, direction, openArrow));
            setAttributeIf(labelNode, 'x', ((x1 + x2) / 2).toFixed(1));
            setAttributeIf(labelNode, 'text-anchor', 'middle');
            setAttributeIf(labelNode, 'y', String(y - 22));
          }
          setLinesIf(labelNode, labelLines.lines.join('\u0001'), labelLines.lines);
          setAttributeIf(arrowNode, 'fill', openArrow ? 'none' : null);
          setAttributeIf(arrowNode, 'class', openArrow
            ? 'nviz-flow-packetflow__message-arrow is-open'
            : 'nviz-flow-packetflow__message-arrow');
          setAttributeIf(indexNode, 'x', (x1 - 10).toFixed(1));
          setAttributeIf(indexNode, 'y', String(y - 4));
          setTextIf(indexNode, model.showIndexes === true ? String(messageIndex + 1) : '');
          setAttributeIf(indexNode, 'display', model.showIndexes === true ? null : 'none');
          var titleNode = node.querySelector('title');
          if (cache.titleText !== titleText) { setTextIf(titleNode, titleText); cache.titleText = titleText; }
          if (cache.ariaText !== ariaText) { setAttributeIf(node, 'aria-label', ariaText); cache.ariaText = ariaText; }
          setAttributeIf(node, 'data-type', message.type);
          setAttributeIf(node, 'data-dashed', effectiveDashed(message) ? 'true' : 'false');
          setAttributeIf(node, 'data-status', message.status || '');
          setAttributeIf(node, 'data-from', message.from);
          setAttributeIf(node, 'data-to', message.to);
          setAttributeIf(node, 'data-target', message.to);
          setAttributeIf(node, 'data-index', String(messageIndex));
          setAttributeIf(node, 'data-direction', self ? 'self' : (direction > 0 ? 'right' : 'left'));
          setAttributeIf(node, 'data-hidden', hidden ? 'true' : null);
          setAttributeIf(node, 'data-focus', isFocus ? 'true' : null);
          setAttributeIf(node, 'aria-current', isFocus ? 'step' : null);
        }
        if (isFocus) focusNode = { node: node, y: y, x1: x1, x2: x2, self: self };
      });
      Array.from(messageNodes.keys()).forEach(function (id) {
        if (seenMessages[id]) return;
        var node = messageNodes.get(id);
        if (node && node.parentNode) node.parentNode.removeChild(node);
        messageNodes.delete(id);
      });
      ensureOrder(messageLayer, desiredMessages);

      var focusBand = focusLayer.querySelector('.nviz-flow-packetflow__focus-band');
      if (!focusBand) {
        focusBand = svgEl('rect', { class: 'nviz-flow-packetflow__focus-band', rx: 7 });
        focusLayer.appendChild(focusBand);
      }
      if (focusNode) {
        setAttributeIf(focusBand, 'display', null);
        setAttributeIf(focusBand, 'x', '42');
        setAttributeIf(focusBand, 'y', String(focusNode.y - 18));
        setAttributeIf(focusBand, 'width', String(width - 84));
        setAttributeIf(focusBand, 'height', '36');
      } else {
        setAttributeIf(focusBand, 'display', 'none');
      }

      var height = messageTop + layoutCount * step + 20;
      setAttributeIf(svg, 'viewBox', '0 0 ' + width + ' ' + height);
      if (svg.hasAttribute('height')) svg.removeAttribute('height');
      setViewportMessage(note, invalid ? '已跳过 ' + invalid + ' 条引用未知参与者的消息。' : '');
    }

    var instance = component(root, model, render, function () {
      participantNodes.clear();
      lifelineNodes.clear();
      messageNodes.clear();
    });
    instance.getTarget = function (id) {
      if (instance.destroyed || id == null) return null;
      var key = text(id);
      if (key === 'svg') return svg;
      if (key === 'viewport') return viewport;
      if (key.indexOf('message:') === 0) return messageNodes.get(key.slice(8)) || null;
      if (key.indexOf('participant:') === 0) return participantNodes.get(key.slice(12)) || null;
      if (messageNodes.has(key)) return messageNodes.get(key);
      if (participantNodes.has(key)) return participantNodes.get(key);
      return null;
    };
    instance.getState = function () {
      if (instance.destroyed) return null;
      var participants = normalizeParticipants();
      var participantIndexById = Object.create(null);
      participants.forEach(function (participant, index) { participantIndexById[participant.id] = index; });
      var messages = normalizeMessages(participantIndexById);
      var shown = revealedSet(messages);
      var focus = textOrEmpty(model.focus);
      var current = null;
      var outputMessages = messages.map(function (message) {
        var normalized = {
          id: message.id,
          from: message.from,
          to: message.to,
          label: message.label,
          note: message.note,
          type: message.type,
          dashed: effectiveDashed(message),
          status: message.status,
          revealed: !!shown[message.id]
        };
        if (message.id === focus) current = normalized;
        return normalized;
      });
      return {
        participants: participants.map(function (participant) {
          return { id: participant.id, label: participant.label, note: participant.note, status: participant.status };
        }),
        messages: outputMessages,
        revealed: outputMessages.filter(function (message) { return message.revealed; }).map(function (message) { return message.id; }),
        visibleCount: outputMessages.filter(function (message) { return message.revealed; }).length,
        focus: focus || null,
        current: current
      };
    };
    render({});
    return instance;
  };

  NoteViz.Flow = NoteViz.Flow || {};
  NoteViz.Flow.PacketFlow = PacketFlow;
})(window);