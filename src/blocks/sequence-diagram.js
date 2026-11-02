/* NoteBlocks B08 — SequenceDiagram.
 * A bounded, host-data sequence diagram (participants, lifelines, ordered
 * messages, current message). It composes NoteBlocks.StepPlayer for stop
 * controls and caption; participant/lifeline/message drawing comes from the
 * public NoteViz.Flow.PacketFlow renderer. This block owns the stop player,
 * legend/hint, warnings, stable target mapping and the current-message scroll.
 * No automatic playback and no network access.
 * Loads after src/blocks/shared.js (internal helpers, not a public entry) and
 * after the viz-flow module (PacketFlow).
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
  var validateHost = shared.validateHost;
  var requireComponents = shared.requireComponents;
  var safeDestroy = shared.safeDestroy;
  var array = shared.array;
  var TYPES = {
    sync: { label: '同步' },
    async: { label: '异步' },
    return: { label: '返回' }
  };

  function typeInfo(value) {
    return TYPES[value] || TYPES.sync;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
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
      requireComponents('NoteBlocks.SequenceDiagram', ['NoteBlocks.StepPlayer', 'NoteUI.Button', 'NoteViz.Flow.PacketFlow']);
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

      /* PacketFlow 负责参与者、生命线、消息线与当前行；B08 只保留块级 chrome、
         StepPlayer 停点与公开目标映射，不再私有绘制消息图。 */
      function renderDiagram(message, context) {
        var index = context.index;
        renderedIndex = index;
        var wrap = make('div', 'nblk-sequence-diagram__layout');
        var contextText = text(raw.caption).trim();
        if (contextText) {
          wrap.appendChild(make('p', 'nblk-sequence-diagram__context', contextText));
        }
        if (transformed.warnings.length) {
          var warning = make('p', 'nblk-sequence-diagram__warning', transformed.warnings.join(' '));
          warning.setAttribute('role', 'status');
          wrap.appendChild(warning);
        }
        var Flow = global.NoteViz && global.NoteViz.Flow;
        if (!Flow || !Flow.PacketFlow || typeof Flow.PacketFlow.mount !== 'function') {
          throw new Error('NoteBlocks.SequenceDiagram 需要先加载 NoteViz.Flow.PacketFlow（viz-flow 模块）。');
        }
        var label = raw.label || '消息时序';
        var diagramHost = make('div', 'nblk-sequence-diagram__diagram');
        wrap.appendChild(diagramHost);
        var flow = Flow.PacketFlow.mount(diagramHost, {
          participants: transformed.participants.map(function (participant) {
            return { id: participant.id, label: participant.label, note: participant.note };
          }),
          messages: transformed.messages.map(function (item) {
            return {
              id: item.id,
              from: item.from,
              to: item.to,
              label: typeInfo(item.type).label + ' · ' + (item.label || '未命名消息'),
              type: item.type,
              note: item.note || ''
            };
          }),
          visibleCount: transformed.messages.length,
          focus: message ? message.id : null,
          showIndexes: true,
          label: label
        });
        var svg = flow.getTarget('svg');
        if (svg && svg.classList) svg.classList.add('nblk-sequence-diagram__svg');
        var viewport = flow.getTarget('viewport');
        if (viewport) {
          /* PacketFlow 负责绘图与横向滚动；B08 继续保留原视口的纵向高度语义。 */
          viewport.style.maxHeight = 'min(34rem, 66vh)';
          viewport.style.overflowY = 'auto';
          viewport.setAttribute('role', 'region');
          viewport.setAttribute('aria-label', label + '，可滚动查看全部参与者与消息');
        }
        var messageTargets = Object.create(null);
        var participantTargets = Object.create(null);
        transformed.participants.forEach(function (participant) {
          var node = flow.getTarget('participant:' + participant.id);
          if (!node) return;
          node.setAttribute('data-participant-id', participant.id);
          participantTargets[participant.id] = node;
        });
        transformed.messages.forEach(function (item) {
          var node = flow.getTarget('message:' + item.id);
          if (!node) return;
          node.setAttribute('data-message-id', item.id);
          messageTargets[item.id] = node;
        });
        refs = { messages: messageTargets, participants: participantTargets };

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
        wrap.append(hint, legend);
        context.stageEl.appendChild(wrap);

        if (message && messageTargets[message.id] && viewport &&
            typeof C.scrollIntoViewIfNeeded === 'function') {
          C.scrollIntoViewIfNeeded(messageTargets[message.id], viewport, {
            block: 'nearest',
            inline: 'nearest'
          });
        }

        return function cleanup() {
          refs = { messages: Object.create(null), participants: Object.create(null) };
          safeDestroy(flow);
          flow = null;
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
