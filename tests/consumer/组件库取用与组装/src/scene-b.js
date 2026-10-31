/* 场景 B 宿主：序列删除与交换的可回退演示。
   机制用 NoteViz.SequenceEdit；舞台、字幕与按钮用 NoteBlocks.DemoStage + NoteUI.Button；
   当前对象用 NoteExpr.Focus 标出。宿主只维护步号、字幕与按钮状态。 */
(function () {
  'use strict';

  var DATASETS = [
    {
      key: 'letters',
      name: '字母',
      labels: { a: 'A', b: 'B', c: 'C', d: 'D', e: 'E' }
    },
    {
      key: 'flow',
      name: '流程',
      labels: { a: '读取', b: '校验', c: '编码', d: '缓存', e: '输出' }
    },
    {
      key: 'long',
      name: '长标签',
      labels: {
        a: '读取请求与身份信息',
        b: '校验签名与访问权限',
        c: '编码为响应体',
        d: '写入本地缓存',
        e: '输出到客户端'
      }
    }
  ];

  var IDS = ['a', 'b', 'c', 'd', 'e'];
  var OPS = [null, { type: 'remove', id: 'c' }, { type: 'swap', ids: ['b', 'e'] }];
  var TOTAL = OPS.length;

  var current = DATASETS[0];
  var index = 0;

  function block(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function itemsOf(dataset) {
    return IDS.map(function (id) { return { id: id, label: dataset.labels[id] }; });
  }

  function labelOf(dataset, id) {
    return dataset.labels[id];
  }

  function captionFor(step, dataset) {
    if (step === 0) {
      return '初始序列共 5 个对象，身份 a–e；序号是它们此刻的位置。';
    }
    if (step === 1) {
      return '删除身份 c（显示为「' + labelOf(dataset, 'c') + '」）：它离场，后面的对象依次前移一位；外框标出顶到第 3 位的 d。';
    }
    return '交换身份 b 与 e：「' + labelOf(dataset, 'e') + '」换到第 2 位，「' +
      labelOf(dataset, 'b') + '」换到第 4 位；外框标出 e 的新位置。';
  }

  var demo = document.getElementById('demo');
  var column = NoteUI.Stack.mount(demo, { gap: 18 });

  /* ---------- 说明 ---------- */
  var head = block('header');
  column.append(head);

  var kicker = block('p', 'nd-kicker');
  kicker.textContent = '序列演示 · 可回退';
  head.appendChild(kicker);

  NoteUI.Typography.mount(head, {
    variant: 'h1',
    as: 'h1',
    content: '删除一个对象，再交换两个对象'
  });
  NoteUI.Typography.mount(head, {
    variant: 'body',
    content: '五个对象各有稳定身份 a–e。先删除身份 c，再交换身份 b 与 e；用上一步、下一步逐步查看，重看会重放当前这步，重来或换显示标签都会回到初始序列。'
  });

  /* ---------- 标签切换 ---------- */
  var toolbar = block('div', 'nd-toolbar');
  column.append(toolbar);

  var toolbarLabel = block('span', 'nd-toolbar-label');
  toolbarLabel.textContent = '显示标签';
  toolbar.appendChild(toolbarLabel);

  var segHost = block('div');
  segHost.setAttribute('aria-label', '切换显示标签');
  toolbar.appendChild(segHost);

  var segmented = NoteUI.Segmented.mount(segHost, {
    options: DATASETS.map(function (item) { return { value: item.key, label: item.name }; }),
    value: current.key,
    onChange: function (value) {
      switchDataset(value);
    }
  });

  var stepLine = block('p', 'nd-step');
  toolbar.appendChild(stepLine);

  /* ---------- 舞台与机制 ---------- */
  var stageHost = block('div');

  var sequenceEdit = NoteViz.SequenceEdit.mount(stageHost, {
    items: itemsOf(current),
    label: '删除与交换的序列',
    animate: true
  });

  var buttonHolder = block('div');
  var btnPrev = NoteUI.Button.mount(buttonHolder, {
    label: '上一步',
    variant: 'secondary',
    onClick: function () { go(index - 1); }
  });
  var btnNext = NoteUI.Button.mount(buttonHolder, {
    label: '下一步',
    variant: 'primary',
    onClick: function () { go(index + 1); }
  });
  var btnReplay = NoteUI.Button.mount(buttonHolder, {
    label: '重看',
    variant: 'quiet',
    onClick: function () { replayStep(); }
  });
  var btnReset = NoteUI.Button.mount(buttonHolder, {
    label: '重来',
    variant: 'quiet',
    onClick: function () { resetAll(); }
  });

  var stage = NoteBlocks.DemoStage.mount(column.el, {
    title: '删除 c，再交换 b、e',
    stage: stageHost,
    caption: '',
    controls: [btnPrev.el, btnNext.el, btnReplay.el, btnReset.el],
    minStageHeight: '168px',
    label: '序列删除与交换演示'
  });

  var noteLine = block('p', 'nd-legend');
  noteLine.textContent = '每一步停稳后，浅底与「变化」文字会留在对象上，便于回看这一步改了什么；外框是当前关注的对象。';
  column.append(noteLine);

  NoteUI.Notice.mount(column.el, {
    title: '换标签会回到起点',
    content: '切换显示标签后停在第 1 步（初始序列），不保留当前步。身份 a–e 与两个操作都不变，只有显示文字改变。',
    tone: 'neutral'
  });

  /* ---------- 关注标记 ---------- */
  var focusMark = NoteExpr.Focus.mount();

  var followUntil = 0;
  var followFrame = 0;

  function follow(ms) {
    followUntil = Math.max(followUntil, (window.performance && performance.now ? performance.now() : Date.now()) + ms);
    if (followFrame) return;
    var tick = function () {
      followFrame = 0;
      if (focusMark.visible) focusMark.refresh();
      var now = window.performance && performance.now ? performance.now() : Date.now();
      if (now < followUntil) followFrame = window.requestAnimationFrame(tick);
    };
    followFrame = window.requestAnimationFrame(tick);
  }

  function syncFocus() {
    var id = index === 1 ? 'd' : index === 2 ? 'e' : null;
    if (!id) {
      focusMark.hide();
      return;
    }
    var target = sequenceEdit.getTarget(id);
    if (!target) {
      focusMark.hide();
      return;
    }
    focusMark.show(target);
    follow(760);
  }

  /* ---------- 步进 ---------- */
  function applyOp(op) {
    if (!op) return;
    if (op.type === 'remove') sequenceEdit.remove(op.id, { animate: true });
    else if (op.type === 'swap') sequenceEdit.swap(op.ids[0], op.ids[1], { animate: true });
  }

  function sync() {
    stage.setCaption(captionFor(index, current));
    btnPrev.update({ disabled: index === 0 });
    btnReplay.update({ disabled: index === 0 });
    btnNext.update({ disabled: index === TOTAL - 1 });
    stepLine.textContent = '第 ' + (index + 1) + ' 步 / 共 ' + TOTAL + ' 步 · 标签：' + current.name;
    syncFocus();
  }

  function go(target) {
    var next = Math.max(0, Math.min(TOTAL - 1, target));
    if (next === index) return;
    var step;
    if (next > index) {
      for (step = index + 1; step <= next; step += 1) applyOp(OPS[step]);
    } else {
      for (step = index; step > next; step -= 1) sequenceEdit.undo({ animate: true });
    }
    index = next;
    sync();
  }

  function replayStep() {
    if (index === 0) return;
    sequenceEdit.replay({ animate: true });
    follow(900);
  }

  function resetAll() {
    sequenceEdit.reset({ animate: true });
    index = 0;
    sync();
  }

  function switchDataset(key) {
    var next = DATASETS.filter(function (item) { return item.key === key; })[0];
    if (!next || next.key === current.key) return;
    focusMark.hide();
    sequenceEdit.update({ items: itemsOf(next), focus: [], changed: [] });
    current = next;
    index = 0;
    sync();
  }

  sync();

  /* 测试钩子：只读查询 + 与按钮等价的程序入口，便于复核状态一致性。 */
  window.__sceneB = {
    state: function () {
      return {
        index: index,
        dataset: current.key,
        caption: stage.captionEl.textContent,
        sequence: sequenceEdit.getState().items.map(function (item) { return item.id; }),
        labels: sequenceEdit.getState().items.map(function (item) { return item.label; }),
        canUndo: sequenceEdit.getState().canUndo,
        markerVisible: focusMark.visible,
        markerTargetId: focusMark.target ? focusMark.target.getAttribute('data-id') : null,
        buttons: {
          prev: btnPrev.el.disabled,
          next: btnNext.el.disabled,
          replay: btnReplay.el.disabled,
          reset: btnReset.el.disabled
        }
      };
    },
    go: go,
    replay: replayStep,
    reset: resetAll
  };
}());
