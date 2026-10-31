/*!
 * Gallery demos · 可复用变化机制 M01–M04
 * 只通过 NoteViz 的公开接口驱动，演示控件为普通 DOM。
 */
(function () {
  'use strict';

  var demos = window.NoteGalleryDemos = window.NoteGalleryDemos || {};

  function makeEl(tag, className, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = String(content);
    return node;
  }

  function makeButton(label, className) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = className || 'nviz-mech-demo__btn';
    button.textContent = label;
    return button;
  }

  function buildShell(host, titleText, hintText) {
    var wrapper = makeEl('div', 'nviz-mech-demo');
    var head = makeEl('div', 'nviz-mech-demo__head');
    var title = makeEl('p', 'nviz-mech-demo__title', titleText);
    var hint = makeEl('p', 'nviz-mech-demo__hint', hintText);
    head.appendChild(title);
    head.appendChild(hint);
    var tools = makeEl('div', 'nviz-mech-demo__tools');
    var stage = makeEl('div', 'nviz-mech-demo__stage');
    var readout = makeEl('p', 'nviz-mech-demo__readout');
    wrapper.appendChild(head);
    wrapper.appendChild(tools);
    wrapper.appendChild(stage);
    wrapper.appendChild(readout);
    host.appendChild(wrapper);
    return { wrapper: wrapper, tools: tools, stage: stage, readout: readout };
  }

  function labelsOf(items) {
    return items.map(function (item) {
      return item && item.label ? item.label : '（空）';
    }).join(' › ');
  }

  function itemLabel(item) {
    return item && item.label ? item.label : '（空）';
  }

  function cleanupDemo(parts) {
    if (parts.controller) parts.controller.abort();
    if (parts.instance) {
      try { parts.instance.destroy(); } catch (error) {}
      parts.instance = null;
    }
    (parts.timers || []).forEach(function (timer) { window.clearTimeout(timer); });
    parts.timers = [];
    if (parts.wrapper && parts.wrapper.parentNode) parts.wrapper.parentNode.removeChild(parts.wrapper);
  }

  /* M01 — 序列删除、移动、交换 */
  demos.M01 = function (host) {
    if (!host) return { destroy: function () {} };
    var parts = { controller: new AbortController(), timers: [] };
    var shell = buildShell(host, '序列删除、移动与交换',
      '对象 ID 不随位置改变；关注与变化分开标记，停稳后可回退或重看。');
    parts.wrapper = shell.wrapper;
    var tools = shell.tools;
    var readout = shell.readout;
    var mode = 'remove';
    var modeButtons = {};
    var actionButton = makeButton('删除对象');
    var undoButton = makeButton('撤销');
    var replayButton = makeButton('重看');
    var resetButton = makeButton('重置');
    var legend = makeEl('div', 'nviz-mech-demo__legend');
    var focusChip = makeEl('span', 'nviz-mech-demo__chip');
    var focusDot = makeEl('span', 'nviz-mech-demo__dot');
    var focusText = makeEl('span', '', '关注');
    var changeChip = makeEl('span', 'nviz-mech-demo__chip');
    var changeDot = makeEl('span', 'nviz-mech-demo__dot nviz-mech-demo__dot--change');
    var changeText = makeEl('span', '', '本步变化');
    focusChip.appendChild(focusDot);
    focusChip.appendChild(focusText);
    changeChip.appendChild(changeDot);
    changeChip.appendChild(changeText);
    legend.appendChild(focusChip);
    legend.appendChild(changeChip);

    var modeGroup = makeEl('div', 'nviz-mech-demo__tools');
    modeGroup.setAttribute('role', 'group');
    modeGroup.setAttribute('aria-label', '序列操作类型');
    [['remove', '删除'], ['move', '移动'], ['swap', '交换']].forEach(function (entry) {
      var button = makeButton(entry[1]);
      button.setAttribute('aria-pressed', entry[0] === mode ? 'true' : 'false');
      button.addEventListener('click', function () {
        mode = entry[0];
        Object.keys(modeButtons).forEach(function (key) {
          modeButtons[key].setAttribute('aria-pressed', key === mode ? 'true' : 'false');
        });
        sync();
      }, { signal: parts.controller.signal });
      modeButtons[entry[0]] = button;
      modeGroup.appendChild(button);
    });

    tools.appendChild(modeGroup);
    tools.appendChild(actionButton);
    tools.appendChild(undoButton);
    tools.appendChild(replayButton);
    tools.appendChild(resetButton);
    parts.wrapper.insertBefore(legend, shell.stage);

    function displayState() {
      var state = instance.getState();
      var previous = labelsOf(state.previousItems);
      var current = labelsOf(state.items);
      var last = state.lastOp ? ({
        remove: '删除',
        move: '移动',
        swap: '交换',
        undo: '撤销',
        reset: '重置'
      }[state.lastOp.type] || state.lastOp.type) : '尚未操作';
      readout.textContent = '上一步：' + previous + ' → 当前：' + current +
        '。共 ' + state.items.length + ' 项；最近动作：' + last + '。';
      undoButton.disabled = !state.canUndo;
      resetButton.disabled = !state.canUndo;
      var enough = state.items.length >= 2;
      actionButton.disabled = !state.items.length;
      if (mode === 'remove') {
        var removeIndex = state.items.length >= 2 ? 1 : 0;
        actionButton.textContent = state.items.length ? '删除「' + itemLabel(state.items[removeIndex]) + '」' : '无可删除对象';
      } else if (mode === 'move') {
        actionButton.disabled = !enough;
        actionButton.textContent = enough ? '把「' + itemLabel(state.items[state.items.length - 1]) + '」移到首位' : '至少需要两个对象';
      } else {
        actionButton.disabled = !enough;
        actionButton.textContent = enough
          ? '交换「' + itemLabel(state.items[0]) + '」与「' + itemLabel(state.items[state.items.length - 1]) + '」'
          : '至少需要两个对象';
      }
    }

    function execute() {
      var state = instance.getState();
      if (!state.items.length) return;
      if (mode === 'remove') {
        var removeIndex = state.items.length >= 2 ? 1 : 0;
        instance.remove(state.items[removeIndex].id);
      } else if (mode === 'move' && state.items.length >= 2) {
        instance.move(state.items[state.items.length - 1].id, 0);
      } else if (mode === 'swap' && state.items.length >= 2) {
        instance.swap(state.items[0].id, state.items[state.items.length - 1].id);
      }
      displayState();
    }

    var replayTimer = null;
    function clearReplayTimer() {
      if (replayTimer != null) {
        window.clearTimeout(replayTimer);
        parts.timers = parts.timers.filter(function (timer) { return timer !== replayTimer; });
        replayTimer = null;
      }
    }

    var instance = NoteViz.SequenceEdit.mount(shell.stage, {
      label: '序列删除与重排演示',
      items: [
        { id: 'read', label: '读取样本' },
        { id: 'check', label: '校验字段' },
        { id: 'convert', label: '转换格式' },
        { id: 'store', label: '写入结果' }
      ],
      focus: ['check'],
      animate: true,
      onChange: function () {
        displayState();
      }
    });
    parts.instance = instance;

    function sync() {
      displayState();
    }

    actionButton.addEventListener('click', execute, { signal: parts.controller.signal });
    undoButton.addEventListener('click', function () {
      instance.undo();
      displayState();
    }, { signal: parts.controller.signal });
    replayButton.addEventListener('click', function () {
      clearReplayTimer();
      instance.replay();
      readout.textContent = '正在重看最近一次变化：先从上一快照开始，停稳后回到当前状态。';
      replayTimer = window.setTimeout(function () {
        parts.timers = parts.timers.filter(function (timer) { return timer !== replayTimer; });
        replayTimer = null;
        displayState();
      }, 1000);
      parts.timers.push(replayTimer);
    }, { signal: parts.controller.signal });
    resetButton.addEventListener('click', function () {
      instance.reset();
      displayState();
    }, { signal: parts.controller.signal });

    displayState();
    return {
      destroy: function () {
        clearReplayTimer();
        cleanupDemo(parts);
      }
    };
  };

  /* M02 — 对象传递 */
  demos.M02 = function (host) {
    if (!host) return { destroy: function () {} };
    var parts = { controller: new AbortController(), timers: [] };
    var shell = buildShell(host, '对象从起点到终点',
      '同一对象只保留一个实例；到达后归入终点，临时路径提示在停稳时移除。');
    parts.wrapper = shell.wrapper;
    var tools = shell.tools;
    var readout = shell.readout;
    var sendButton = makeButton('传递对象');
    var resetButton = makeButton('回到起点');
    var replayButton = makeButton('重看');
    var renameButton = makeButton('换对象标签');
    tools.appendChild(sendButton);
    tools.appendChild(resetButton);
    tools.appendChild(replayButton);
    tools.appendChild(renameButton);

    var objects = [
      { id: 'packet-a', label: '数据包 A' },
      { id: 'packet-b', label: '校验结果' }
    ];
    var objectIndex = 0;

    function settledReadout(state) {
      readout.textContent = state.at === 'target'
        ? '终态：对象「' + itemLabel(state.object) + '」在终点「' + state.targetLabel + '」；起点「' + state.sourceLabel + '」没有副本。'
        : '起点状态：对象「' + itemLabel(state.object) + '」在「' + state.sourceLabel + '」；终点「' + state.targetLabel + '」尚无该对象。';
    }

    var instance = NoteViz.Transfer.mount(shell.stage, {
      object: objects[objectIndex],
      sourceLabel: '发送端',
      targetLabel: '接收端',
      animate: true,
      onSettle: function (state) {
        settledReadout(state);
      }
    });
    parts.instance = instance;

    sendButton.addEventListener('click', function () {
      if (instance.getState().at === 'target' && instance.getState().settled) {
        settledReadout(instance.getState());
        return;
      }
      readout.textContent = '正在从发送端传递到接收端…';
      instance.send();
    }, { signal: parts.controller.signal });
    resetButton.addEventListener('click', function () {
      if (instance.getState().at === 'source' && instance.getState().settled) {
        settledReadout(instance.getState());
        return;
      }
      readout.textContent = '正在回到起点…';
      instance.reset();
    }, { signal: parts.controller.signal });
    replayButton.addEventListener('click', function () {
      readout.textContent = '正在重看：对象先从起点出发，再移动到终点。';
      instance.replay();
    }, { signal: parts.controller.signal });
    renameButton.addEventListener('click', function () {
      objectIndex = (objectIndex + 1) % objects.length;
      instance.update({ object: objects[objectIndex] });
      settledReadout(instance.getState());
    }, { signal: parts.controller.signal });

    settledReadout(instance.getState());
    return {
      destroy: function () {
        cleanupDemo(parts);
      }
    };
  };

  /* M03 — 拆分与合并 */
  demos.M03 = function (host) {
    if (!host) return { destroy: function () {} };
    var parts = { controller: new AbortController(), timers: [] };
    var shell = buildShell(host, '拆分与合并的映射',
      '来源与结果同时保留，用连线和就近文字对应；默认映射可直接播放。');
    parts.wrapper = shell.wrapper;
    var tools = shell.tools;
    var readout = shell.readout;
    var data = {
      split: {
        mode: 'split',
        label: '拆分映射演示',
        before: [{ id: 'whole', label: '整段数据' }],
        after: [
          { id: 'head', label: '帧头' },
          { id: 'payload', label: '载荷' },
          { id: 'check', label: '校验' }
        ]
      },
      merge: {
        mode: 'merge',
        label: '合并映射演示',
        before: [
          { id: 'temp', label: '温度' },
          { id: 'humidity', label: '湿度' },
          { id: 'light', label: '光照' }
        ],
        after: [{ id: 'environment', label: '环境记录' }]
      }
    };
    var mode = 'split';
    var modeButtons = {};
    var playButton = makeButton('播放变化');
    var resetButton = makeButton('重置');
    var replayButton = makeButton('重看');
    var modeGroup = makeEl('div', 'nviz-mech-demo__tools');
    modeGroup.setAttribute('role', 'group');
    modeGroup.setAttribute('aria-label', '拆分或合并模式');

    [['split', '拆分'], ['merge', '合并']].forEach(function (entry) {
      var button = makeButton(entry[1]);
      button.setAttribute('aria-pressed', entry[0] === mode ? 'true' : 'false');
      button.addEventListener('click', function () {
        mode = entry[0];
        Object.keys(modeButtons).forEach(function (key) {
          modeButtons[key].setAttribute('aria-pressed', key === mode ? 'true' : 'false');
        });
        instance.update(data[mode]);
        refresh('已切换为' + (mode === 'split' ? '拆分' : '合并') + '。播放查看映射结果。');
      }, { signal: parts.controller.signal });
      modeButtons[entry[0]] = button;
      modeGroup.appendChild(button);
    });
    tools.appendChild(modeGroup);
    tools.appendChild(playButton);
    tools.appendChild(resetButton);
    tools.appendChild(replayButton);

    function describeMapping(state) {
      if (!state.links.length) return '当前没有映射。';
      var bySource = {};
      state.before.forEach(function (item) { bySource[item.id] = []; });
      state.links.forEach(function (link) {
        if (bySource[link.from]) bySource[link.from].push(link.to);
      });
      var pieces = [];
      state.before.forEach(function (item) {
        var targets = bySource[item.id].map(function (id) {
          var match = state.after.filter(function (candidate) { return candidate.id === id; })[0];
          return match ? match.label : id;
        });
        if (targets.length) pieces.push(itemLabel(item) + ' → ' + targets.join('、'));
      });
      return pieces.join('；');
    }

    function refresh(prefix) {
      var state = instance.getState();
      var phaseText = state.phase === 'after' ? '来源与结果均已显示' : '尚未播放，结果列暂不显示';
      readout.textContent = (prefix ? prefix + ' ' : '') +
        '模式：' + (state.mode === 'merge' ? '合并' : '拆分') + '；' +
        '状态：' + phaseText + '；映射：' + describeMapping(state) + '。';
      playButton.disabled = state.phase === 'after';
      resetButton.disabled = state.phase === 'before';
    }

    var mountData = {};
    Object.keys(data[mode]).forEach(function (key) { mountData[key] = data[mode][key]; });
    mountData.onSettle = function () { refresh('停稳：'); };
    var instance = NoteViz.SplitMerge.mount(shell.stage, mountData);
    parts.instance = instance;

    playButton.addEventListener('click', function () {
      readout.textContent = '正在播放' + (mode === 'split' ? '拆分' : '合并') + '，停稳后可核对来源与结果。';
      instance.play();
    }, { signal: parts.controller.signal });
    resetButton.addEventListener('click', function () {
      readout.textContent = '正在回到变化前…';
      instance.reset();
    }, { signal: parts.controller.signal });
    replayButton.addEventListener('click', function () {
      readout.textContent = '正在重看：先呈现变化前，再展开来源与结果映射。';
      instance.replay();
    }, { signal: parts.controller.signal });

    refresh();
    return {
      destroy: function () {
        cleanupDemo(parts);
      }
    };
  };

  /* M04 — 替换与局部展开 */
  demos.M04 = function (host) {
    if (!host) return { destroy: function () {} };
    var parts = { controller: new AbortController(), timers: [] };
    var shell = buildShell(host, '同一对象的值替换与局部展开',
      '替换只改值；展开只增加内部说明，卡片上缘保持不动。前后可核对。');
    parts.wrapper = shell.wrapper;
    var tools = shell.tools;
    var readout = shell.readout;
    var datasets = {
      replace: {
        mode: 'replace',
        before: { id: 'count', label: '计数器', value: '12' },
        after: { id: 'count', label: '计数器', value: '14', detail: '内部计数没有换对象，只替换了显示值。' }
      },
      reveal: {
        mode: 'reveal',
        before: { id: 'config', label: '配置对象', value: '{ … }', detail: '' },
        after: { id: 'config', label: '配置对象', value: '{ … }', detail: 'theme = "quiet"；density = 3；labels = "可见"。' }
      }
    };
    var mode = 'replace';
    var modeButtons = {};
    var playButton = makeButton('播放变化');
    var resetButton = makeButton('重置');
    var replayButton = makeButton('重看');
    var modeGroup = makeEl('div', 'nviz-mech-demo__tools');
    modeGroup.setAttribute('role', 'group');
    modeGroup.setAttribute('aria-label', '替换或展开模式');
    var phaseTimer = null;

    function clearPhaseTimer() {
      if (phaseTimer != null) {
        window.clearTimeout(phaseTimer);
        parts.timers = parts.timers.filter(function (timer) { return timer !== phaseTimer; });
        phaseTimer = null;
      }
    }

    function afterSettle() {
      clearPhaseTimer();
      phaseTimer = window.setTimeout(function () {
        parts.timers = parts.timers.filter(function (timer) { return timer !== phaseTimer; });
        phaseTimer = null;
        describe('停稳检查：');
      }, 700);
      parts.timers.push(phaseTimer);
    }

    [['replace', '替换值'], ['reveal', '展开内部']].forEach(function (entry) {
      var button = makeButton(entry[1]);
      button.setAttribute('aria-pressed', entry[0] === mode ? 'true' : 'false');
      button.addEventListener('click', function () {
        clearPhaseTimer();
        mode = entry[0];
        Object.keys(modeButtons).forEach(function (key) {
          modeButtons[key].setAttribute('aria-pressed', key === mode ? 'true' : 'false');
        });
        instance.update(datasets[mode]);
        describe('已切换为' + (mode === 'replace' ? '替换值' : '展开内部') + '（变化前）。');
      }, { signal: parts.controller.signal });
      modeButtons[entry[0]] = button;
      modeGroup.appendChild(button);
    });
    tools.appendChild(modeGroup);
    tools.appendChild(playButton);
    tools.appendChild(resetButton);
    tools.appendChild(replayButton);

    function describe(prefix) {
      var state = instance.getState();
      var status;
      if (state.mode === 'replace') {
        status = state.phase === 'after'
          ? '替换后：' + state.before.value + ' → ' + state.after.value + '；同一对象、原位置。'
          : '替换前：当前值 ' + state.before.value + '。';
      } else {
        status = state.phase === 'after'
          ? '已展开：内部显示「' + (state.after.detail || '（空）') + '」；上缘位置保持。'
          : '展开前：内部未显示，当前值 ' + state.before.value + '。';
      }
      readout.textContent = (prefix ? prefix + ' ' : '') + status;
      resetButton.disabled = state.phase === 'before';
      playButton.disabled = state.phase === 'after';
    }

    var instance = NoteViz.ReplaceReveal.mount(shell.stage, datasets[mode]);
    parts.instance = instance;

    playButton.addEventListener('click', function () {
      clearPhaseTimer();
      instance.play();
      describe('播放中，目标状态：');
      afterSettle();
    }, { signal: parts.controller.signal });
    resetButton.addEventListener('click', function () {
      clearPhaseTimer();
      instance.reset();
      describe('回到变化前：');
      afterSettle();
    }, { signal: parts.controller.signal });
    replayButton.addEventListener('click', function () {
      clearPhaseTimer();
      instance.replay();
      readout.textContent = '正在重看：先恢复变化前，再播放到当前变化。';
      afterSettle();
    }, { signal: parts.controller.signal });

    describe();
    return {
      destroy: function () {
        clearPhaseTimer();
        cleanupDemo(parts);
      }
    };
  };
})();
