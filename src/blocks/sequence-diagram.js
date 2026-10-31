/* NoteBlocks B08 — SequenceDiagram.
 * A bounded, host-data sequence diagram (participants, lifelines, ordered
 * messages, current message). It composes NoteBlocks.StepPlayer for the
 * stop controls and caption; the diagram itself is a small SVG renderer, not a
 * general graph editor. No automatic playback and no network access.
 * Loads after src/blocks/shared.js (internal helpers, not a public entry).
 */
(function (global) {
  'use strict';

  var NoteBlocks = global.NoteBlocks = global.NoteBlocks || {};

  var shared = global.NoteBlocksInternals;
  if (!shared) {
    throw new Error('NoteBlocks 组合块需要先加载 src/blocks/shared.js（内部共享文件）。');
  }
  var core = shared.core;
  var own = shared.own;
  var text = shared.text;
  var make = shared.make;
  var uniqueId = shared.uniqueId;
  var validateHost = shared.validateHost;
  var requireComponents = shared.requireComponents;
  var safeDestroy = shared.safeDestroy;
  var array = shared.array;
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var TYPES = {
    sync: { label: '同步', line: 'is-sync' },
    async: { label: '异步', line: 'is-async' },
    return: { label: '返回', line: 'is-return' }
  };
  function svgEl(tag, attributes) {
    var node = global.document.createElementNS(SVG_NS, tag);
    if (attributes) {
      Object.keys(attributes).forEach(function (name) {
        node.setAttribute(name, text(attributes[name]));
      });
    }
    return node;
  }

  function typeInfo(value) {
    return TYPES[value] || TYPES.sync;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function charUnits(char) {
    var code = char.codePointAt ? char.codePointAt(0) : char.charCodeAt(0);
    return code > 0x2e7f ? 2 : 1;
  }

  function wrapText(value, maxUnits, maxLines) {
    var source = text(value).replace(/\s+/g, ' ').trim();
    if (!source) return { lines: [''], truncated: false };
    var lines = [];
    var current = '';
    var units = 0;
    var chars = Array.from ? Array.from(source) : source.split('');
    chars.forEach(function (char) {
      var width = char === ' ' ? 1 : charUnits(char);
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
    var visible = lines.slice(0, maxLines);
    var last = visible[maxLines - 1];
    while (last.length) {
      var lastUnits = 0;
      Array.from(last).some(function (char) {
        lastUnits += char === ' ' ? 1 : charUnits(char);
        return lastUnits > maxUnits - 1;
      });
      if (lastUnits <= maxUnits - 1) break;
      last = Array.from(last).slice(0, -1).join('');
    }
    visible[maxLines - 1] = last + '…';
    return { lines: visible, truncated: true };
  }

  function appendLines(parent, lines, options) {
    var settings = options || {};
    var firstX = settings.x == null ? 0 : settings.x;
    var firstY = settings.y == null ? 0 : settings.y;
    var lineHeight = settings.lineHeight == null ? 16 : settings.lineHeight;
    lines.forEach(function (line, index) {
      var tspan = svgEl('tspan', {
        x: firstX,
        y: firstY + index * lineHeight
      });
      tspan.textContent = line;
      parent.appendChild(tspan);
    });
  }

  function resolveCurrent(value, messages) {
    if (value == null || !messages.length) return 0;
    if (typeof value === 'object') {
      if (value.id != null) return resolveCurrent(value.id, messages);
      if (value.index != null) return resolveCurrent(value.index, messages);
      return 0;
    }
    var raw = text(value).trim();
    if (!raw) return 0;
    for (var i = 0; i < messages.length; i += 1) {
      if (messages[i].id === raw) return i;
    }
    if (/^-?\d+$/.test(raw)) {
      var number = Number(raw);
      if (isFinite(number)) return clamp(Math.trunc(number), 0, messages.length - 1);
    }
    return 0;
  }

  function participantMap(participants) {
    var map = Object.create(null);
    participants.forEach(function (participant) {
      if (!map[participant.id]) map[participant.id] = participant;
    });
    return map;
  }

  NoteBlocks.SequenceDiagram = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host, 'NoteBlocks.SequenceDiagram');
      requireComponents('NoteBlocks.SequenceDiagram', ['NoteBlocks.StepPlayer', 'NoteUI.Button']);
      var C = core();
      var input = options || {};
      var raw = {
        participants: array(input.participants),
        messages: array(input.messages),
        current: input.current,
        title: input.title == null ? '' : input.title,
        caption: input.caption == null ? '' : input.caption,
        label: input.label == null ? '' : text(input.label),
        maxWidth: input.maxWidth == null ? null : input.maxWidth
      };
      var destroyed = false;
      var player = null;
      var refs = { messages: Object.create(null), participants: Object.create(null) };
      var renderedIndex = -1;
      var transformed = normalizeData(raw);

      function normalizeData(data) {
        var warnings = [];
        var seenParticipants = Object.create(null);
        var participants = [];
        array(data.participants).forEach(function (source, index) {
          if (!source || typeof source !== 'object' || source.id == null || text(source.id) === '') {
            warnings.push('参与者 ' + (index + 1) + ' 缺少 id，已忽略。');
            return;
          }
          var id = text(source.id);
          if (seenParticipants[id]) {
            warnings.push('参与者 id「' + id + '」重复，只保留第一个。');
            return;
          }
          seenParticipants[id] = true;
          participants.push({
            id: id,
            label: source.label == null ? id : text(source.label),
            note: source.note == null ? '' : text(source.note),
            index: participants.length,
            raw: source
          });
        });
        var byId = participantMap(participants);
        var seenMessages = Object.create(null);
        var messages = [];
        array(data.messages).forEach(function (source, index) {
          if (!source || typeof source !== 'object') return;
          var id = source.id != null && text(source.id) !== '' ? text(source.id) : 'message-' + (index + 1);
          if (seenMessages[id]) {
            warnings.push('消息 id「' + id + '」重复；getTarget 会返回最后渲染的同 id 消息。');
          }
          seenMessages[id] = true;
          var from = source.from == null ? '' : text(source.from);
          var to = source.to == null ? '' : text(source.to);
          if (!byId[from] || !byId[to]) {
            warnings.push('消息「' + id + '」的 from/to 不在参与者中，未进入消息图与停点。');
            return;
          }
          var requestedType = source.type == null ? 'sync' : text(source.type);
          var type = TYPES[requestedType] ? requestedType : 'sync';
          if (!TYPES[requestedType]) {
            warnings.push('消息「' + id + '」的 type「' + requestedType + '」未知，按 sync 显示。');
          }
          var message = {
            id: id,
            index: messages.length,
            sourceIndex: index,
            from: from,
            to: to,
            fromLabel: byId[from].label,
            toLabel: byId[to].label,
            label: source.label == null ? '' : text(source.label),
            type: type,
            typeLabel: typeInfo(type).label,
            note: source.note == null ? '' : text(source.note),
            raw: source
          };
          messages.push(message);
        });
        return {
          participants: participants,
          messages: messages,
          warnings: warnings,
          participantById: byId
        };
      }

      function messageCaption(message, index) {
        if (!message) return '';
        var base = '第 ' + (index + 1) + ' 条：' + message.fromLabel + ' → ' + message.toLabel +
          '，' + (message.label || '未命名消息') + '（' + message.typeLabel + '）。';
        if (message.note) return base + ' ' + message.note;
        return base;
      }

      function messageStepWrappers() {
        return transformed.messages.map(function (message, index) {
          return {
            id: message.id,
            label: '消息 ' + (index + 1),
            caption: messageCaption(message, index),
            state: message
          };
        });
      }

      function initialIndex() {
        return resolveCurrent(raw.current, transformed.messages);
      }

      function currentMessage() {
        if (destroyed || !player) return null;
        var wrapper = player.getStep();
        return wrapper && wrapper.state ? wrapper.state : null;
      }

      function buildMarkers(defs) {
        var base = uniqueId('nblk-sequence-arrow');
        var markers = {};
        ['sync', 'async', 'return'].forEach(function (type) {
          markers[type] = {};
          [false, true].forEach(function (current) {
            var id = base + '-' + type + (current ? '-current' : '');
            var marker = svgEl('marker', {
              id: id,
              viewBox: '0 0 10 10',
              refX: '9',
              refY: '5',
              markerWidth: '8',
              markerHeight: '8',
              orient: 'auto'
            });
            var path = svgEl('path', {
              d: type === 'return' ? 'M 1 1 L 9 5 L 1 9' : 'M 0 0 L 10 5 L 0 10 z',
              class: 'nblk-sequence-diagram__arrowhead' +
                (type === 'return' ? ' is-return' : '') +
                (current ? ' is-current' : '')
            });
            marker.appendChild(path);
            defs.appendChild(marker);
            markers[type][current ? 'current' : 'normal'] = id;
          });
        });
        return markers;
      }

      function renderDiagram(message, context) {
        var index = context.index;
        renderedIndex = index;
        var wrap = make('div', 'nblk-sequence-diagram__layout');
        var titleId = uniqueId('nblk-sequence-title');
        var descId = uniqueId('nblk-sequence-desc');
        var svgTitleText = (raw.title || raw.label || '消息时序');
        var contextText = text(raw.caption).trim();

        if (contextText) {
          var contextEl = make('p', 'nblk-sequence-diagram__context', contextText);
          wrap.appendChild(contextEl);
        }

        if (transformed.warnings.length) {
          var warning = make('p', 'nblk-sequence-diagram__warning', transformed.warnings.join(' '));
          warning.setAttribute('role', 'status');
          wrap.appendChild(warning);
        }

        var viewport = make('div', 'nblk-sequence-diagram__viewport');
        viewport.tabIndex = 0;
        viewport.setAttribute('role', 'region');
        viewport.setAttribute('aria-label', (raw.label || '消息时序') + '，可滚动查看全部参与者与消息');
        var svg = svgEl('svg', {
          class: 'nblk-sequence-diagram__svg',
          role: 'group',
          'aria-labelledby': titleId + ' ' + descId,
          focusable: 'false'
        });
        var titleEl = svgEl('title', { id: titleId });
        titleEl.textContent = svgTitleText;
        var descEl = svgEl('desc', { id: descId });
        descEl.textContent = '共 ' + transformed.participants.length + ' 位参与者、' +
          transformed.messages.length + ' 条消息。' +
          (message
            ? '当前为第 ' + (index + 1) + ' 条：' + message.fromLabel + ' 到 ' +
              message.toLabel + '，' + message.typeLabel + '，' + message.label + '。'
            : '当前没有消息。');
        svg.append(titleEl, descEl);

        var defs = svgEl('defs');
        var markers = buildMarkers(defs);
        svg.appendChild(defs);

        var count = transformed.participants.length;
        var width = Math.max(580, 274 + Math.max(0, count - 1) * 220);
        var headerTop = 14;
        var headerHeight = 68;
        var headerBottom = headerTop + headerHeight;
        var boxWidth = 170;
        var leftCenter = 124;
        var rightCenter = width - 110;
        var centers = transformed.participants.map(function (participant, participantIndex) {
          if (count === 1) return width / 2;
          return leftCenter + participantIndex * (rightCenter - leftCenter) / (count - 1);
        });
        var rowTop = 104;
        var rowHeight = 92;
        var height = rowTop + transformed.messages.length * rowHeight + 22;

        svg.setAttribute('width', String(Math.ceil(width)));
        svg.setAttribute('height', String(Math.ceil(height)));
        svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);

        var participantTargets = Object.create(null);
        var messageTargets = Object.create(null);

        var lifelines = svgEl('g', { class: 'nblk-sequence-diagram__lifelines', 'aria-hidden': 'true' });
        transformed.participants.forEach(function (participant, participantIndex) {
          lifelines.appendChild(svgEl('line', {
            x1: centers[participantIndex],
            y1: headerBottom,
            x2: centers[participantIndex],
            y2: height - 16,
            class: 'nblk-sequence-diagram__lifeline'
          }));
        });
        svg.appendChild(lifelines);

        transformed.participants.forEach(function (participant, participantIndex) {
          var center = centers[participantIndex];
          var group = svgEl('g', {
            class: 'nblk-sequence-diagram__participant',
            'data-participant-id': participant.id,
            role: 'group',
            'aria-label': '参与者：' + participant.label + (participant.note ? '，' + participant.note : '')
          });
          var full = svgEl('title');
          full.textContent = participant.label + (participant.note ? '：' + participant.note : '');
          group.appendChild(full);
          group.appendChild(svgEl('rect', {
            x: center - boxWidth / 2,
            y: headerTop,
            width: boxWidth,
            height: headerHeight,
            rx: 8,
            class: 'nblk-sequence-diagram__participant-box'
          }));
          var wrapped = wrapText(participant.label, 20, 2);
          var labelEl = svgEl('text', {
            x: center,
            y: participant.note ? 38 : (wrapped.lines.length > 1 ? 38 : 48),
            'text-anchor': 'middle',
            class: 'nblk-sequence-diagram__participant-label'
          });
          appendLines(labelEl, wrapped.lines, {
            x: center,
            y: participant.note ? 38 : (wrapped.lines.length > 1 ? 38 : 48),
            lineHeight: 16
          });
          group.appendChild(labelEl);
          if (participant.note) {
            var noteWrap = wrapText(participant.note, 24, 1);
            var noteEl = svgEl('text', {
              x: center,
              y: 68,
              'text-anchor': 'middle',
              class: 'nblk-sequence-diagram__participant-note'
            });
            noteEl.textContent = noteWrap.lines[0] || '';
            group.appendChild(noteEl);
          }
          participantTargets[participant.id] = group;
          svg.appendChild(group);
        });

        transformed.messages.forEach(function (item, itemIndex) {
          var current = itemIndex === index;
          var fromCenter = centers[transformed.participants.indexOf(transformed.participantById[item.from])];
          var toCenter = centers[transformed.participants.indexOf(transformed.participantById[item.to])];
          if (fromCenter == null) fromCenter = leftCenter;
          if (toCenter == null) toCenter = rightCenter;
          var lineY = rowTop + itemIndex * rowHeight + 48;
          var group = svgEl('g', {
            class: 'nblk-sequence-diagram__message' +
              (current ? ' is-current' : '') +
              ' ' + typeInfo(item.type).line,
            'data-message-id': item.id,
            role: 'group',
            'aria-label': '第 ' + (itemIndex + 1) + ' 条消息，' +
              item.fromLabel + ' 到 ' + item.toLabel + '，' + item.typeLabel + '，' +
              item.label + (current ? '，当前消息' : '')
          });
          if (current) group.setAttribute('aria-current', 'step');
          var full = svgEl('title');
          full.textContent = item.fromLabel + ' → ' + item.toLabel + '：' + item.label +
            '（' + item.typeLabel + '）' + (item.note ? '。' + item.note : '');
          group.appendChild(full);

          if (current) {
            group.appendChild(svgEl('rect', {
              x: 8,
              y: rowTop + itemIndex * rowHeight + 2,
              width: width - 16,
              height: rowHeight - 6,
              rx: 8,
              class: 'nblk-sequence-diagram__current-row'
            }));
          }

          var lineClass = 'nblk-sequence-diagram__message-line ' + typeInfo(item.type).line +
            (current ? ' is-current' : '');
          if (Math.abs(fromCenter - toCenter) < 1) {
            var loop = svgEl('path', {
              d: 'M ' + fromCenter + ' ' + lineY +
                ' C ' + (fromCenter + 76) + ' ' + (lineY - 38) + ' ' +
                (fromCenter + 76) + ' ' + (lineY + 38) + ' ' +
                (fromCenter + 4) + ' ' + (lineY + 16),
              class: lineClass,
              'marker-end': 'url(#' + markers[item.type][current ? 'current' : 'normal'] + ')'
            });
            group.appendChild(loop);
          } else {
            var line = svgEl('line', {
              x1: fromCenter,
              y1: lineY,
              x2: toCenter,
              y2: lineY,
              class: lineClass,
              'marker-end': 'url(#' + markers[item.type][current ? 'current' : 'normal'] + ')'
            });
            group.appendChild(line);
          }

          var labelX = Math.abs(fromCenter - toCenter) < 1
            ? clamp(fromCenter + 96, 96, width - 96)
            : clamp((fromCenter + toCenter) / 2, 92, width - 92);
          var labelText = item.typeLabel + ' · ' + (item.label || '未命名消息');
          var wrappedLabel = wrapText(labelText, 38, 2);
          var labelEl = svgEl('text', {
            x: labelX,
            y: lineY - (wrappedLabel.lines.length > 1 ? 28 : 14),
            'text-anchor': 'middle',
            class: 'nblk-sequence-diagram__message-label' + (current ? ' is-current' : '')
          });
          appendLines(labelEl, wrappedLabel.lines, {
            x: labelX,
            y: lineY - (wrappedLabel.lines.length > 1 ? 28 : 14),
            lineHeight: 15
          });
          group.appendChild(labelEl);

          var number = svgEl('text', {
            x: 16,
            y: current ? lineY - 5 : lineY + 4,
            class: 'nblk-sequence-diagram__row-number'
          });
          number.textContent = String(itemIndex + 1).padStart(2, '0');
          group.appendChild(number);
          if (current) {
            var currentTag = svgEl('text', {
              x: 16,
              y: lineY + 13,
              class: 'nblk-sequence-diagram__current-tag'
            });
            currentTag.textContent = '当前';
            group.appendChild(currentTag);
          }
          messageTargets[item.id] = group;
          svg.appendChild(group);
        });

        viewport.appendChild(svg);
        var hint = make('p', 'nblk-sequence-diagram__hint',
          '消息按编号自上而下排列；实线为同步，虚线为异步，点线为返回。参与者较多时可在图内滚动。');
        var legend = make('div', 'nblk-sequence-diagram__legend');
        legend.setAttribute('role', 'group');
        legend.setAttribute('aria-label', '消息线型说明');
        [
          { key: 'sync', text: '同步：实线 + 实心箭头' },
          { key: 'async', text: '异步：虚线 + 实心箭头' },
          { key: 'return', text: '返回：点线 + 开口箭头' }
        ].forEach(function (item) {
          var entry = make('span', 'nblk-sequence-diagram__legend-item');
          entry.setAttribute('data-type', item.key);
          entry.textContent = item.text;
          legend.appendChild(entry);
        });

        wrap.append(viewport, hint, legend);
        context.stageEl.appendChild(wrap);
        refs = { messages: messageTargets, participants: participantTargets };

        if (message && messageTargets[message.id] &&
            typeof C.scrollIntoViewIfNeeded === 'function') {
          C.scrollIntoViewIfNeeded(messageTargets[message.id], viewport, {
            block: 'nearest',
            inline: 'nearest'
          });
        }

        return function cleanup() {
          refs = { messages: Object.create(null), participants: Object.create(null) };
          wrap.remove();
        };
      }

      function applyCurrentAfterUpdate(patch) {
        if (!own(patch, 'current')) return;
        if (!transformed.messages.length) {
          renderedIndex = -1;
          return;
        }
        var target = resolveCurrent(raw.current, transformed.messages);
        player.go(target);
      }

      function update(patch) {
        if (destroyed || !patch || typeof patch !== 'object') return;
        if (own(patch, 'participants')) raw.participants = array(patch.participants);
        if (own(patch, 'messages')) raw.messages = array(patch.messages);
        if (own(patch, 'current')) raw.current = patch.current;
        if (own(patch, 'title')) raw.title = patch.title == null ? '' : patch.title;
        if (own(patch, 'caption')) raw.caption = patch.caption == null ? '' : patch.caption;
        if (own(patch, 'label')) raw.label = patch.label == null ? '' : text(patch.label);
        if (own(patch, 'maxWidth')) raw.maxWidth = patch.maxWidth;
        transformed = normalizeData(raw);

        var stepsChanged = own(patch, 'participants') || own(patch, 'messages') ||
          own(patch, 'title') || own(patch, 'caption') || own(patch, 'label');
        var playerPatch = {
          title: raw.title,
          maxWidth: raw.maxWidth,
          label: raw.label || '消息时序'
        };
        if (stepsChanged) playerPatch.steps = messageStepWrappers();
        player.update(playerPatch);
        applyCurrentAfterUpdate(patch);
        if (!transformed.messages.length) renderedIndex = -1;
      }

      function getState() {
        if (destroyed) return null;
        var message = currentMessage();
        if (!message) return null;
        var index = renderedIndex;
        if (index < 0 || !transformed.messages[index] || transformed.messages[index].id !== message.id) {
          index = transformed.messages.findIndex ? transformed.messages.findIndex(function (item) {
            return item.id === message.id;
          }) : 0;
        }
        if (index < 0) index = 0;
        return {
          index: index,
          total: transformed.messages.length,
          message: message,
          caption: messageCaption(message, index)
        };
      }

      function destroyBlock() {
        if (destroyed) return;
        destroyed = true;
        refs = { messages: Object.create(null), participants: Object.create(null) };
        safeDestroy(player);
        player = null;
      }

      player = NoteBlocks.StepPlayer.mount(host, {
        steps: messageStepWrappers(),
        render: renderDiagram,
        initialIndex: initialIndex(),
        title: raw.title,
        maxWidth: raw.maxWidth,
        label: raw.label || '消息时序'
      });
      player.el.classList.add('nblk-sequence-diagram');
      renderedIndex = transformed.messages.length ? initialIndex() : -1;

      return {
        el: player.el,
        go: function (index) { if (!destroyed) player.go(index); },
        next: function () { if (!destroyed) player.next(); },
        prev: function () { if (!destroyed) player.prev(); },
        replay: function () { if (!destroyed) player.replay(); },
        reset: function () { if (!destroyed) player.reset(); },
        getStep: currentMessage,
        getState: getState,
        getTarget: function (id) {
          if (destroyed || id == null) return null;
          var key = text(id);
          if (refs.messages[key]) return refs.messages[key];
          if (refs.participants[key]) return refs.participants[key];
          return null;
        },
        update: update,
        destroy: destroyBlock
      };
    }
  };
})(window);
