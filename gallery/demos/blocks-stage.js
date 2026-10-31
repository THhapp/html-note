/*! Gallery demos B01–B04 — real NoteBlocks mounts with replaceable host data.
 *  Scope: gallery only; uses public NoteBlocks, NoteUI and NoteViz APIs.
 *  All motion is user-triggered. destroy() releases nested components,
 *  Focus overlays, animations and demo-owned buttons. */
(function () {
  'use strict';

  var demos = window.NoteGalleryDemos = window.NoteGalleryDemos || {};

  function el(tag, className, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content == null ? '' : String(content);
    return node;
  }

  function createDemo(host, introText) {
    var root = el('div', 'nblk-gallery-demo');
    root.style.cssText = 'box-sizing:border-box;display:flex;flex-direction:column;gap:14px;width:100%;max-width:100%;min-width:0;color:var(--hnv-color-ink,#202938);font-family:var(--hnv-font-family,"Segoe UI","Microsoft YaHei UI","Microsoft YaHei","PingFang SC",sans-serif);font-size:var(--hnv-font-size-reading,16px);line-height:var(--hnv-font-line-reading,1.65);overflow-wrap:anywhere';
    var intro = el('p', 'nblk-gallery-demo__intro', introText);
    intro.style.cssText = 'margin:0;max-width:76ch;color:var(--hnv-color-ink,#202938);font-size:var(--hnv-font-size-reading,16px);line-height:var(--hnv-font-line-reading,1.65);overflow-wrap:anywhere';
    var toolbar = el('div', 'nblk-gallery-demo__toolbar');
    toolbar.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0;max-width:100%';
    var body = el('div', 'nblk-gallery-demo__body');
    body.style.cssText = 'min-width:0;max-width:100%';
    var status = el('p', 'nblk-gallery-demo__status');
    status.style.cssText = 'margin:0;min-height:1.6em;color:var(--hnv-color-muted,#5c6879);font-size:var(--hnv-font-size-label,14px);line-height:1.65;overflow-wrap:anywhere';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.hidden = true;
    root.append(intro, toolbar, body, status);
    host.appendChild(root);

    var cleanups = [];
    var destroyed = false;

    function register(cleanup) {
      if (typeof cleanup === 'function') cleanups.push(cleanup);
    }

    function track(instance) {
      if (instance && typeof instance.destroy === 'function') {
        register(function () { instance.destroy(); });
      }
      return instance;
    }

    function addButton(label, onClick, variant) {
      var instance = window.NoteUI.Button.mount(toolbar, {
        label: label,
        variant: variant || 'secondary',
        size: 'sm',
        onClick: onClick
      });
      track(instance);
      return instance;
    }

    function setStatus(value) {
      status.textContent = value == null ? '' : String(value);
      status.hidden = !status.textContent;
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      for (var i = cleanups.length - 1; i >= 0; i -= 1) {
        try { cleanups[i](); } catch (error) { /* keep gallery cleanup moving */ }
      }
      cleanups.length = 0;
      root.remove();
    }

    return {
      root: root,
      toolbar: toolbar,
      body: body,
      status: status,
      addButton: addButton,
      track: track,
      register: register,
      setStatus: setStatus,
      destroy: destroy
    };
  }

  function sceneChip(label, value, accent) {
    var chip = el('div', 'nblk-gallery-scene-chip');
    chip.style.cssText = [
      'box-sizing:border-box',
      'min-width:0',
      'flex:1 1 8.5rem',
      'max-width:100%',
      'padding:12px 14px',
      'border:var(--hnv-border-width,1px) solid ' +
        (accent ? 'var(--hnv-color-accent,#315cda)' : 'var(--hnv-color-border,#dce2ea)'),
      'border-radius:var(--hnv-radius-control,8px)',
      'background:' + (accent ? 'var(--hnv-color-accent-soft,#eef2ff)' : 'var(--hnv-color-surface,#fff)'),
      'overflow-wrap:anywhere'
    ].join(';');
    chip.appendChild(el('div', '', label)).style.cssText =
      'color:var(--hnv-color-muted,#5c6879);font-size:var(--hnv-font-size-caption,12px);line-height:1.45';
    chip.appendChild(el('div', '', value)).style.cssText =
      'margin-top:4px;color:var(--hnv-color-ink,#202938);font-size:var(--hnv-font-size-label,14px);font-weight:650;line-height:1.5';
    return chip;
  }

  function demoScene(label, title, chips, footer) {
    var scene = el('div');
    scene.style.cssText = 'box-sizing:border-box;display:flex;flex-direction:column;gap:14px;padding:18px;border:var(--hnv-border-width,1px) solid var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-stage,14px);background:var(--hnv-color-page,#f4f6f9);min-width:0;max-width:100%';
    var head = el('div');
    head.style.cssText = 'display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:8px;min-width:0';
    var titleWrap = el('div');
    titleWrap.style.cssText = 'min-width:0';
    titleWrap.appendChild(el('div', '', label)).style.cssText =
      'color:var(--hnv-color-muted,#5c6879);font-size:var(--hnv-font-size-caption,12px);font-weight:600;line-height:1.45;letter-spacing:.04em';
    titleWrap.appendChild(el('div', '', title)).style.cssText =
      'margin-top:2px;color:var(--hnv-color-ink,#202938);font-size:var(--hnv-font-size-heading,20px);font-weight:650;line-height:1.4;overflow-wrap:anywhere';
    var tag = el('span', '', label);
    tag.style.cssText = 'display:inline-flex;flex:0 0 auto;align-items:center;padding:3px 9px;border:var(--hnv-border-width,1px) solid var(--hnv-color-attention,#6f82b7);border-radius:var(--hnv-radius-pill,999px);background:var(--hnv-color-surface,#fff);color:var(--hnv-color-attention,#6f82b7);font-size:var(--hnv-font-size-caption,12px);line-height:1.5';
    head.append(titleWrap, tag);
    var row = el('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;align-items:stretch;gap:10px;min-width:0';
    chips.forEach(function (chip) {
      row.appendChild(sceneChip(chip.label, chip.value, chip.accent));
    });
    var foot = el('p', '', footer);
    foot.style.cssText = 'margin:0;color:var(--hnv-color-muted,#5c6879);font-size:var(--hnv-font-size-small,13px);line-height:1.6;overflow-wrap:anywhere';
    scene.append(head, row, foot);
    return scene;
  }

  /* =====================================================================
   * B01 — DemoStage
   * ===================================================================== */

  demos.B01 = function (host) {
    var demo = createDemo(host,
      '演示舞台把画面、固定字幕与控件组织为一件作品。画面由宿主提供；这里用两张可替换的场景卡片演示。字幕区始终预留两行阅读空间，切换长短字幕时控件不会跟着整块跳动。');

    var sceneA = demoScene('画面 A', '依次处理', [
      { label: '第一步', value: '接收输入', accent: true },
      { label: '第二步', value: '整理分组' },
      { label: '第三步', value: '输出结果' }
    ], '当前关注起点“接收输入”；这只是宿主场景，不是组件内置的课程步骤。');
    var sceneB = demoScene('画面 B', '并列比较', [
      { label: '左侧', value: '原始值' },
      { label: '中间', value: '处理结果' },
      { label: '右侧', value: '核对项' },
      { label: '附加', value: '说明入口' }
    ], '替换画面时，字幕仍在画面下方。组件没有规定统一尺寸，也没有强制外框；这些卡片样式由演示宿主提供。');

    var captionA = '画面 A：字幕位于可视化下方，即使只有一行，也保留下一行的位置。';
    var captionB = '画面 B：更换画面后仍使用同一固定字幕区。较长的说明会自然换行，短说明不会让控制区上下移动。';
    var longCaption = '这是一段更长的演示字幕，用来检查阅读路径是否稳定：当停点需要更多解释时，文字可以占据两行甚至更多行；字幕仍紧贴画面下方，控件也不会被放到画面另一侧。';
    var showingB = false;
    var longText = false;
    var stage;

    function currentCaption(shortText) {
      return longText ? longCaption : shortText;
    }

    var resetButton = demo.addButton('回到初始', function () {
      showingB = false;
      longText = false;
      stage.setStage(sceneA);
      stage.setCaption(captionA);
    }, 'quiet');

    stage = window.NoteBlocks.DemoStage.mount(demo.body, {
      title: '演示舞台 · 固定字幕与基本控制',
      stage: sceneA,
      caption: captionA,
      maxWidth: '58rem',
      minStageHeight: '190px',
      label: '演示舞台示例',
      controls: [
        {
          label: '切换画面',
          variant: 'primary',
          onClick: function () {
            showingB = !showingB;
            stage.setStage(showingB ? sceneB : sceneA);
            stage.setCaption(currentCaption(showingB ? captionB : captionA));
          }
        },
        {
          label: '切换字幕长度',
          onClick: function () {
            longText = !longText;
            stage.setCaption(currentCaption(showingB ? captionB : captionA));
          }
        },
        {
          label: '禁用示例',
          disabled: true
        },
        resetButton.el
      ]
    });
    demo.track(stage);

    demo.setStatus('演示默认静止。可使用画面内控件切换画面或字幕；最后一个控件是宿主传入的 DOM 按钮，用于演示 DOM 控件入口。');
    return { destroy: demo.destroy };
  };

  /* =====================================================================
   * B02 — StepPlayer
   * ===================================================================== */

  function snapshotSetA() {
    return [
      {
        id: 'prep',
        label: '准备',
        caption: '三个任务都在等待。这里只显示初始停点，不会自动前进。',
        state: {
          title: '全部等待',
          phase: '准备',
          done: '0 / 3',
          pointer: '任务 A',
          items: [
            { id: 'job-a', label: '任务 A', value: '等待' },
            { id: 'job-b', label: '任务 B', value: '等待' },
            { id: 'job-c', label: '任务 C', value: '等待' }
          ],
          focus: ['job-a'],
          changed: [],
          note: '完整快照 1：三个对象都在等待，尚未产生完成项。'
        }
      },
      {
        id: 'run-a',
        label: 'A 运行',
        caption: '任务 A 开始运行；其余任务继续等待。关注点移到下一项任务 B。',
        state: {
          title: 'A 运行中',
          phase: '运行',
          done: '0 / 3',
          pointer: '任务 B',
          items: [
            { id: 'job-a', label: '任务 A', value: '运行中' },
            { id: 'job-b', label: '任务 B', value: '等待' },
            { id: 'job-c', label: '任务 C', value: '等待' }
          ],
          focus: ['job-b'],
          changed: ['job-a'],
          note: '完整快照 2：本步变化只有任务 A；回退时任务 A 应恢复为等待。'
        }
      },
      {
        id: 'a-done',
        label: 'A 完成',
        caption: '任务 A 已完成，任务 B 开始运行；临时项 D 只属于本停点快照。',
        state: {
          title: '加入临时项',
          phase: '运行',
          done: '1 / 3',
          pointer: '临时项 D',
          items: [
            { id: 'job-a', label: '任务 A', value: '已完成' },
            { id: 'job-b', label: '任务 B', value: '运行中' },
            { id: 'job-c', label: '任务 C', value: '等待' },
            { id: 'temp-d', label: '临时项 D', value: '仅本停点' }
          ],
          focus: ['job-b', 'temp-d'],
          changed: ['job-a', 'temp-d'],
          note: '完整快照 3：多出的临时项 D 由快照定义，不是渲染残留。'
        }
      },
      {
        id: 'b-c',
        label: 'B→C',
        caption: '任务 B 完成；任务 C 接替运行。临时项 D 已从这一快照中移除。',
        state: {
          title: '继续推进',
          phase: '运行',
          done: '2 / 3',
          pointer: '任务 C',
          items: [
            { id: 'job-a', label: '任务 A', value: '已完成' },
            { id: 'job-b', label: '任务 B', value: '已完成' },
            { id: 'job-c', label: '任务 C', value: '运行中' }
          ],
          focus: ['job-c'],
          changed: ['job-b', 'job-c'],
          note: '完整快照 4：任务 D 已不存在；回退到上一个停点时会按快照重新恢复。'
        }
      }
    ];
  }

  function snapshotSetB() {
    return [
      {
        id: 'solo-prep',
        label: '单项等待',
        caption: '备用快照组只有一个任务；这里同样只显示初始停点。',
        state: {
          title: '单项等待',
          phase: '准备',
          done: '0 / 1',
          pointer: '任务 X',
          items: [{ id: 'job-x', label: '任务 X', value: '等待' }],
          focus: ['job-x'],
          changed: [],
          note: '备用快照组 1：宿主换了一组数据，渲染函数保持不变。'
        }
      },
      {
        id: 'solo-run',
        label: '单项运行',
        caption: '任务 X 开始运行；备用数据集用更少的对象验证替换后的完整重绘。',
        state: {
          title: '单项运行',
          phase: '运行',
          done: '0 / 1',
          pointer: '任务 X',
          items: [{ id: 'job-x', label: '任务 X', value: '运行中' }],
          focus: ['job-x'],
          changed: ['job-x'],
          note: '备用快照组 2：变化标记与关注落在同一对象上，由 NoteViz.Sequence 合并表达。'
        }
      },
      {
        id: 'solo-done',
        label: '单项完成',
        caption: '任务 X 完成。程序更新快照组时，不会调用 onStep。',
        state: {
          title: '单项完成',
          phase: '完成',
          done: '1 / 1',
          pointer: '无',
          items: [{ id: 'job-x', label: '任务 X', value: '已完成' }],
          focus: [],
          changed: ['job-x'],
          note: '备用快照组 3：停止后仍可看到本步变化，且没有自动播放。'
        }
      }
    ];
  }

  function renderBufferState(state, context) {
    var C = window.NoteCore || {};
    var wrap = el('div');
    wrap.style.cssText = 'box-sizing:border-box;display:flex;flex-direction:column;gap:12px;min-width:0;max-width:100%;padding:16px;border:var(--hnv-border-width,1px) solid var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-stage,14px);background:var(--hnv-color-page,#f4f6f9)';
    wrap.setAttribute('data-replay', context.replay ? 'true' : 'false');

    var head = el('div');
    head.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 12px;min-width:0';
    var title = el('div', '', '完整快照 · ' + state.title + (context.replay ? ' · 重看' : ''));
    title.style.cssText = 'min-width:0;color:var(--hnv-color-ink,#202938);font-size:var(--hnv-font-size-reading,16px);font-weight:650;line-height:1.5;overflow-wrap:anywhere';
    var phase = el('span', '', '阶段：' + state.phase + ' · 已完成 ' + state.done);
    phase.style.cssText = 'flex:0 0 auto;color:var(--hnv-color-muted,#5c6879);font-size:var(--hnv-font-size-caption,12px);line-height:1.5';
    head.append(title, phase);
    wrap.appendChild(head);

    var sequence = window.NoteViz.Sequence.mount(wrap, {
      variant: 'boxes',
      label: '缓冲区任务状态',
      items: state.items,
      focus: state.focus,
      changed: state.changed
    });

    var metrics = el('div');
    metrics.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr));gap:10px;min-width:0';
    var pointer = window.NoteUI.DataObject.mount(metrics, {
      label: '下一关注',
      value: state.pointer,
      caption: '关注与变化由两个独立字段表达。'
    });
    var done = window.NoteUI.DataObject.mount(metrics, {
      label: '完成读数',
      value: state.done,
      caption: '全部数值来自当前快照，而不是累积修改。'
    });
    wrap.appendChild(metrics);

    var note = el('p', '', state.note);
    note.style.cssText = 'margin:0;color:var(--hnv-color-muted,#5c6879);font-size:var(--hnv-font-size-small,13px);line-height:1.6;overflow-wrap:anywhere';
    wrap.appendChild(note);
    context.stageEl.appendChild(wrap);

    var animation = null;
    if (context.replay) {
      try {
        if (C.motion && typeof C.motion.play === 'function') {
          animation = C.motion.play(sequence.el, [
            { opacity: '0.62' },
            { opacity: '1' }
          ], { duration: 260, easing: 'ease-out' });
        }
      } catch (error) { animation = null; }
    }

    return function cleanup() {
      if (animation && typeof animation.cancel === 'function') {
        try { animation.cancel(); } catch (error) { /* optional */ }
      }
      try { pointer.destroy(); } catch (error) { /* optional */ }
      try { done.destroy(); } catch (error) { /* optional */ }
      try { sequence.destroy(); } catch (error) { /* optional */ }
      wrap.remove();
    };
  }

  demos.B02 = function (host) {
    var demo = createDemo(host,
      '稳定状态步进用完整快照驱动画面。每次切换先调用上一停点的 cleanup，再清空舞台并只渲染目标状态；“重看”会在同一停点重新调用 render 并传入 replay。没有自动串播，停点判断与控制都停在用户操作上。');

    var setA = snapshotSetA();
    var setB = snapshotSetB();
    var activeSet = setA;
    var usingB = false;
    var player;

    var switchButton = demo.addButton('换用备用快照组（3 停点）', function () {
      usingB = !usingB;
      activeSet = usingB ? setB : setA;
      player.update({ steps: activeSet });
      switchButton.update({ label: usingB ? '换回快照组 A（4 停点）' : '换用备用快照组（3 停点）' });
      demo.setStatus('宿主已程序更新 steps。索引被夹紧到新范围，当前停点按新快照重绘；这不会触发 onStep。');
    }, 'secondary');

    player = window.NoteBlocks.StepPlayer.mount(demo.body, {
      steps: activeSet,
      title: '缓冲区完整快照（无自动串播）',
      maxWidth: '58rem',
      onStep: function (index, step) {
        demo.setStatus('用户操作触发 onStep：停点 ' + (index + 1) + '「' +
          (step && step.label ? step.label : '未命名') + '」。程序跳转与更新不会触发这条说明。');
      },
      render: renderBufferState
    });
    demo.track(player);
    demo.setStatus('初始停点由程序挂载，没有自动前进。可试用上一步、下一步、跳到停点、重看和重来；重看会在本停点重新渲染并触发宿主动效。');
    return { destroy: demo.destroy };
  };

  /* =====================================================================
   * B03 — RuleCompare
   * ===================================================================== */

  demos.B03 = function (host) {
    var demo = createDemo(host,
      '规则对照把宿主提供的规则数据放进表格，强调行/列同时用文字摘要说明，所以不只靠颜色。重点规则的说明放在表格下方；长条件或窄容器只会让表格局部横向滚动，不挤压整页。');

    var rules = [
      {
        id: 'hit',
        label: '缓存命中',
        condition: '请求键在有效缓存中存在',
        result: '直接返回缓存响应',
        note: '命中时不触发源站请求。'
      },
      {
        id: 'stale',
        label: '过期读取',
        condition: '缓存条目已过期，但带有可用的重新验证标记',
        result: '先返回旧值，并在后台重新验证',
        note: '返回旧值时应保留时间说明，避免读者误认为它就是最新状态。'
      },
      {
        id: 'conflict',
        label: '写入冲突',
        condition: '提交的版本号与当前记录版本不一致',
        result: '拒绝写入，要求调用方重新读取',
        note: '阻止静默覆盖；错误信息不包含其他用户的内容。'
      },
      {
        id: 'denied',
        label: '管理受限',
        condition: '调用方缺少管理操作所需角色',
        result: '返回无权限并记录审计事件',
        note: '不泄露内部对象详情或权限分配。'
      }
    ];
    var emphasisModes = [
      { row: ['stale'], column: 'result' },
      { row: ['conflict'], column: 'condition' }
    ];
    var labelModes = [
      null,
      { rule: '规则名称', condition: '触发条件', result: '处理结果', note: '备注' }
    ];
    var emphasisIndex = 0;
    var labelIndex = 0;
    var narrow = false;
    var frame = el('div');
    frame.style.cssText = 'width:100%;max-width:100%;min-width:0;box-sizing:border-box';
    demo.body.appendChild(frame);

    var ruleCompare = window.NoteBlocks.RuleCompare.mount(frame, {
      rules: rules,
      columns: null,
      caption: '请求处理规则对照（宿主数据示例）',
      emphasize: emphasisModes[emphasisIndex],
      note: '表格规则完全由宿主提供；本示例与 PPP 或课程内容无关。',
      label: '请求处理规则'
    });
    demo.track(ruleCompare);

    function describe() {
      return '当前强调：' + (emphasisIndex === 0 ? '过期读取行 + 处理结果列' : '写入冲突行 + 触发条件列') +
        '；列标题' + (labelIndex === 0 ? '使用默认名称' : '使用自定义名称') +
        '；' + (narrow ? '窄容器，表格可局部横向滚动' : '常规宽度') + '。';
    }

    demo.addButton('切换强调', function () {
      emphasisIndex = (emphasisIndex + 1) % emphasisModes.length;
      ruleCompare.update({ emphasize: emphasisModes[emphasisIndex] });
      demo.setStatus(describe());
    }, 'primary');

    demo.addButton('换列标签', function () {
      labelIndex = (labelIndex + 1) % labelModes.length;
      ruleCompare.update({ columns: labelModes[labelIndex] });
      demo.setStatus(describe());
    });

    demo.addButton('切换窄容器', function () {
      narrow = !narrow;
      frame.style.maxWidth = narrow ? '22rem' : '100%';
      demo.setStatus(describe());
    });

    demo.setStatus(describe());
    return { destroy: demo.destroy };
  };

  /* =====================================================================
   * B04 — StateCompare
   * ===================================================================== */

  function limitState() {
    return {
      before: [
        { id: 'quota', label: '每分钟额度', value: '60 次', caption: '旧上限' },
        { id: 'window', label: '统计窗口', value: '60 秒', caption: '滚动窗口' },
        { id: 'burst', label: '突发额度', value: '10 次', caption: '短时允许' },
        { id: 'strategy', label: '限流方式', value: '固定窗口', caption: '当前策略' }
      ],
      after: [
        { id: 'quota', label: '每分钟额度', value: '100 次', caption: '新上限' },
        { id: 'window', label: '统计窗口', value: '60 秒', caption: '滚动窗口' },
        { id: 'burst', label: '突发额度', value: '20 次', caption: '短时允许' },
        { id: 'strategy', label: '限流方式', value: '令牌桶', caption: '新策略' }
      ],
      changed: ['quota', 'burst', 'strategy'],
      invariant: ['window'],
      caption: '示例更新：统计窗口保持 60 秒；额度、突发额度与限流方式发生变化。变化对象带“本步变化”标记，未变对象带“未变”标记和说明。'
    };
  }

  function cacheState() {
    return {
      before: [
        { id: 'ttl', label: '缓存时长', value: '300 秒', caption: '旧值' },
        { id: 'scope', label: '缓存范围', value: '仅本地', caption: '旧范围' },
        { id: 'fallback', label: '过期回退', value: '关闭', caption: '保持策略' }
      ],
      after: [
        { id: 'ttl', label: '缓存时长', value: '600 秒', caption: '新值' },
        { id: 'scope', label: '缓存范围', value: '本地与共享', caption: '新范围' },
        { id: 'fallback', label: '过期回退', value: '关闭', caption: '保持策略' }
      ],
      changed: ['ttl', 'scope'],
      invariant: ['fallback'],
      caption: '更换后的数据：缓存时长和范围发生变化；过期回退仍保持关闭，是本次必须保留的不变量。'
    };
  }

  demos.B04 = function (host) {
    var demo = createDemo(host,
      '前后状态对照用 NoteViz.CompareView 承载两侧对象，NoteUI.DataObject 呈现数值，Badge 用文字标记“本步变化”和“未变”。默认不显示关注覆盖层；需要时手动开启 NoteExpr.Focus，它只圈出首个变化对象，并在切换数据或销毁时清理。');

    var sets = [limitState(), cacheState()];
    var setIndex = 0;
    var focusOn = false;
    var narrow = false;
    var current = sets[setIndex];
    var frame = el('div');
    frame.style.cssText = 'width:100%;max-width:100%;min-width:0;box-sizing:border-box';
    demo.body.appendChild(frame);

    var stateCompare = window.NoteBlocks.StateCompare.mount(frame, {
      before: current.before,
      after: current.after,
      changed: current.changed,
      invariant: current.invariant,
      caption: current.caption,
      mode: 'side-by-side',
      focusChanged: false,
      label: '前后状态对照示例'
    });
    demo.track(stateCompare);

    var focusButton = demo.addButton('显示关注标记', function () {
      focusOn = !focusOn;
      stateCompare.update({ focusChanged: focusOn });
      focusButton.update({ label: focusOn ? '清除关注标记' : '显示关注标记' });
      demo.setStatus(focusOn
        ? '关注标记已开启：NoteExpr.Focus 只圈出首个变化对象；它是用户操作后出现的，不与“本步变化”徽标混用。'
        : '关注标记已清除；变化徽标和未变说明仍保留在正常的阅读路径中。');
    }, 'primary');

    var dataButton = demo.addButton('换一组前后状态', function () {
      setIndex = (setIndex + 1) % sets.length;
      current = sets[setIndex];
      stateCompare.update({
        before: current.before,
        after: current.after,
        changed: current.changed,
        invariant: current.invariant,
        caption: current.caption
      });
      demo.setStatus('已替换前后对象数据；内容按新数组顺序重建，变化/未变说明同步更新。关注标记会按需重新定位。');
    });

    demo.addButton('切换窄容器', function () {
      narrow = !narrow;
      frame.style.maxWidth = narrow ? '22rem' : '100%';
      demo.setStatus(narrow
        ? '容器变窄：CompareView 自动改为上下对照；对象标记与说明仍在下方正常阅读路径中。'
        : '恢复宽容器：CompareView 回到并排对照。');
    });

    demo.setStatus('初始状态静止：变化与未变由文字徽标和下方说明表达。点击“显示关注标记”才会出现 Focus 覆盖层。');
    return { destroy: demo.destroy };
  };
})();
