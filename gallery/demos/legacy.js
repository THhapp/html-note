(function () {
  'use strict';

  var demos = window.NoteGalleryDemos = window.NoteGalleryDemos || {};

  function h(tag, className, textValue) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (textValue !== undefined) node.textContent = textValue == null ? '' : String(textValue);
    return node;
  }

  function style(node, rules) {
    Object.keys(rules).forEach(function (key) { node.style[key] = rules[key]; });
    return node;
  }

  function append(parent) {
    for (var i = 1; i < arguments.length; i += 1) {
      var child = arguments[i];
      if (child == null) continue;
      parent.appendChild(child);
    }
    return parent;
  }

  function makeRoot(host, introText) {
    if (!host || typeof host.appendChild !== 'function') {
      throw new TypeError('legacy demo requires an element host');
    }
    var root = style(h('div', 'legacy-demo'), {
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      minWidth: '0',
      maxWidth: '100%',
      color: 'var(--hnv-color-ink, #202938)',
      fontFamily: 'var(--hnv-font-family, "Segoe UI", "Microsoft YaHei", sans-serif)'
    });
    var intro = style(h('p', 'legacy-demo__intro', introText), {
      margin: '0',
      color: 'var(--hnv-color-muted, #5c6879)',
      fontSize: 'var(--hnv-font-size-label, 14px)',
      lineHeight: '1.65',
      maxWidth: '78ch'
    });
    root.appendChild(intro);
    host.appendChild(root);
    return root;
  }

  function makeSurface() {
    return style(h('div', 'legacy-demo__surface'), {
      boxSizing: 'border-box',
      minWidth: '0',
      maxWidth: '100%',
      padding: '18px',
      border: '1px solid var(--hnv-color-border, #dce2ea)',
      borderRadius: 'var(--hnv-radius-object, 10px)',
      background: 'var(--hnv-color-surface, #ffffff)',
      overflowX: 'auto'
    });
  }

  function makeRow(extra) {
    var row = style(h('div'), {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '10px',
      minWidth: '0'
    });
    if (extra) style(row, extra);
    return row;
  }

  function makeToolbar() {
    var bar = style(h('div', 'legacy-demo__toolbar', ''), {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '8px'
    });
    for (var i = 0; i < arguments.length; i += 1) {
      if (arguments[i] != null) bar.appendChild(arguments[i]);
    }
    return bar;
  }

  function action(label, onClick) {
    var button = h('button', 'legacy-demo__action', label);
    button.type = 'button';
    style(button, {
      minHeight: '34px',
      padding: '6px 12px',
      border: '1px solid var(--hnv-color-border, #dce2ea)',
      borderRadius: 'var(--hnv-radius-control, 8px)',
      background: 'var(--hnv-color-surface, #fff)',
      color: 'var(--hnv-color-ink, #202938)',
      font: 'inherit',
      fontSize: '13px',
      fontWeight: '550',
      lineHeight: '1.4',
      cursor: 'pointer'
    });
    button.addEventListener('click', onClick);
    return button;
  }

  function feedback() {
    var node = h('p', 'legacy-demo__feedback', '');
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    style(node, {
      margin: '0',
      minHeight: '1.65em',
      color: 'var(--hnv-color-muted, #5c6879)',
      fontSize: 'var(--hnv-font-size-label, 14px)',
      lineHeight: '1.65',
      overflowWrap: 'anywhere'
    });
    return node;
  }

  function say(node, textValue) {
    node.textContent = textValue == null ? '' : String(textValue);
  }

  function chip(label, extraStyles) {
    var node = h('span', 'legacy-demo__chip', label);
    node.setAttribute('data-demo-target', '');
    style(node, Object.assign({
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '36px',
      padding: '7px 13px',
      border: '1px solid var(--hnv-color-border, #dce2ea)',
      borderRadius: '8px',
      background: 'var(--hnv-color-page, #f4f6f9)',
      color: 'var(--hnv-color-ink, #202938)',
      fontSize: '14px',
      lineHeight: '1.4',
      whiteSpace: 'normal',
      overflowWrap: 'anywhere'
    }, extraStyles || {}));
    return node;
  }

  function fallbackIcon(label) {
    var node = h('span', null, label);
    node.setAttribute('aria-hidden', 'true');
    style(node, { fontSize: '15px', lineHeight: '1' });
    return node;
  }

  function coreIcon(name, fallback) {
    if (window.NoteCore && NoteCore.icons && typeof NoteCore.icons.get === 'function') {
      var svg = NoteCore.icons.get(name);
      if (svg) {
        svg.setAttribute('width', '18');
        svg.setAttribute('height', '18');
        return svg;
      }
    }
    return fallbackIcon(fallback || name);
  }

  function lifecycle(host, introText) {
    var root = makeRoot(host, introText);
    var handles = [];
    var timers = [];
    var cleanups = [];
    var destroyed = false;
    return {
      root: root,
      add: function (handle) {
        if (handle && typeof handle.destroy === 'function') handles.push(handle);
        return handle;
      },
      every: function (items) {
        items.forEach(this.add, this);
        return items;
      },
      after: function (id) {
        timers.push(id);
        return id;
      },
      timer: function (fn, delay) {
        var id = window.setTimeout(function () {
          var index = timers.indexOf(id);
          if (index >= 0) timers.splice(index, 1);
          if (!destroyed) fn();
        }, delay);
        timers.push(id);
        return id;
      },
      cleanup: function (fn) { cleanups.push(fn); },
      destroyed: function () { return destroyed; },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        timers.forEach(function (id) { window.clearTimeout(id); });
        timers = [];
        while (cleanups.length) {
          var cleanup = cleanups.pop();
          try { cleanup(); } catch (err) { /* cleanup must not break navigation */ }
        }
        while (handles.length) {
          var handle = handles.pop();
          try { handle.destroy(); } catch (err) { /* keep cleaning the rest */ }
        }
        root.remove();
      }
    };
  }

  function unavailable(host, id, missing) {
    var root = makeRoot(host, id + ' 需要的公开接口尚未加载：' + missing + '。演示未伪造组件。');
    style(root, { padding: '16px', background: 'var(--hnv-color-accent-soft, #eef2ff)', borderRadius: '8px' });
    return { destroy: function () { root.remove(); } };
  }

  demos.R01 = function (host) {
    if (!window.NoteUI || !NoteUI.Button) return unavailable(host, 'R01', 'NoteUI.Button');
    var life = lifecycle(host,
      '原有 label、variant、disabled、onClick 保持原样；本轮新增图标（DOM 或解析后的名称）、图标位置、纯图标、加载、可访问名称、提示与 sm 尺寸。加载时按钮仍可聚焦，点击被忽略。');
    var stage = makeSurface();
    var row = makeRow();
    var out = feedback();
    var controls = makeToolbar();
    var oldResolver = NoteUI.Button.iconResolver;
    var clickCount = 0;
    var labelToggle = false;
    var domIcon = coreIcon('check', '✓');
    var resolverWasInstalled = false;

    if (window.NoteCore && NoteCore.icons && typeof NoteCore.icons.get === 'function') {
      NoteUI.Button.iconResolver = function (name) { return NoteCore.icons.get(name); };
      resolverWasInstalled = true;
    }
    life.cleanup(function () { NoteUI.Button.iconResolver = oldResolver; });

    var primary = life.add(NoteUI.Button.mount(row, {
      label: '主要操作',
      variant: 'primary',
      icon: 'arrow-right',
      iconPosition: 'end',
      onClick: function () { clickCount += 1; say(out, '主要操作已触发；图标在文字之后。触发次数：' + clickCount); }
    }));
    var domButton = life.add(NoteUI.Button.mount(row, {
      label: '图标 DOM 更新',
      icon: domIcon,
      iconPosition: 'start',
      onClick: function () { say(out, 'DOM 图标按钮保持原节点，点击正常。'); }
    }));
    var iconOnly = life.add(NoteUI.Button.mount(row, {
      label: '',
      icon: 'plus',
      iconOnly: true,
      ariaLabel: '新建条目',
      title: '新建条目',
      onClick: function () { say(out, '纯图标按钮的可访问名称来自 ariaLabel：新建条目。'); }
    }));
    var loading = life.add(NoteUI.Button.mount(row, {
      label: '加载示例',
      loading: false,
      onClick: function () { clickCount += 1; say(out, '加载按钮在非加载态触发了操作。'); }
    }));
    var compact = life.add(NoteUI.Button.mount(row, {
      label: '紧凑按钮',
      size: 'sm',
      icon: 'chevron-down',
      iconPosition: 'end',
      onClick: function () { say(out, 'sm 尺寸保持 32px 最小高度。'); }
    }));
    var disabled = life.add(NoteUI.Button.mount(row, {
      label: '暂不可用',
      variant: 'secondary',
      disabled: true
    }));
    var labeledIconOnly = life.add(NoteUI.Button.mount(row, {
      label: '搜索',
      icon: 'search',
      iconOnly: true,
      title: '搜索',
      onClick: function () { say(out, '未提供 ariaLabel 时，可访问名称回退到 label。'); }
    }));

    append(stage, row, out);
    append(controls,
      action('更新 DOM 图标按钮文案', function () {
        labelToggle = !labelToggle;
        domButton.update({ label: labelToggle ? '图标仍在：已更新' : '图标 DOM 更新' });
        var iconSlot = domButton.el.querySelector('.nui-button__icon');
        say(out, iconSlot && iconSlot.firstChild === domIcon ? 'update 后仍是同一个 DOM 图标节点。' : '图标节点没有保持。');
      }),
      action('切换加载 1.2 秒', function () {
        if (loading.el.getAttribute('aria-busy') === 'true') return;
        loading.update({ loading: true });
        say(out, '加载中：aria-busy=true，点击被忽略，Tab 仍可聚焦。');
        life.timer(function () {
          loading.update({ loading: false });
          say(out, '加载结束，按钮恢复可用；没有伪造业务完成。');
        }, 1200);
      }),
      action('读回旧 API 状态', function () {
        var el = primary.el;
        say(out, 'variant=' + el.className.replace(/\s+/g, ' ').trim() + '；disabled=' + el.disabled + '；resolver=' + (resolverWasInstalled ? '已设置' : '未设置'));
      })
    );
    append(life.root, stage, controls);
    if (!resolverWasInstalled) {
      say(out, 'NoteCore 未加载：字符串图标不会报错，但当前不显示；DOM 图标仍可展示。');
    }
    return life;
  };

  demos.R02 = function (host) {
    if (!window.NoteUI || !NoteUI.Segmented) return unavailable(host, 'R02', 'NoteUI.Segmented');
    var life = lifecycle(host, '分段选择沿用原接口：方向键、Home/End 跳过禁用项；程序 update 更新当前值与选项，但不调用 onChange，用户换选才回调。');
    var stage = makeSurface();
    var row = makeRow();
    var col = style(h('div'), { display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '0', width: '100%' });
    var out = feedback();
    var firstHost = style(h('div'), { minWidth: '0' });
    var secondHost = style(h('div'), { minWidth: '0' });
    var optionSets = [
      [
        { value: 'all', label: '全部内容' },
        { value: 'current', label: '当前项' },
        { value: 'changed', label: '本步变化' }
      ],
      [
        { value: 'object', label: '按对象' },
        { value: 'step', label: '按步骤' },
        { value: 'range', label: '按范围' }
      ],
      [
        { value: 'short', label: '短标签' },
        { value: 'long', label: '一个较长但仍可完整阅读的选项' },
        { value: 'blocked', label: '暂不开放', disabled: true }
      ]
    ];
    var index = 0;
    var silentUpdate = false;
    var currentFirst;
    currentFirst = life.add(NoteUI.Segmented.mount(firstHost, {
      options: optionSets[0].slice(),
      value: 'all',
      onChange: function (value) {
        say(out, silentUpdate ? '错误：程序更新触发了 onChange。' : '用户换选：' + value + '。getValue() = ' + currentFirst.getValue() + '。');
      }
    }));
    var second = life.add(NoteUI.Segmented.mount(secondHost, {
      options: optionSets[2].slice(),
      value: 'short',
      onChange: function (value) { say(out, '长标签组换选：' + value + '。禁用项不会被方向键选中。'); }
    }));
    append(col, firstHost, secondHost);
    append(stage, col, out);
    append(life.root, stage, makeToolbar(
      action('换一组选项（程序更新）', function () {
        index = (index + 1) % optionSets.length;
        silentUpdate = true;
        currentFirst.update({ options: optionSets[index].slice(), value: optionSets[index][0].value });
        silentUpdate = false;
        say(out, '已程序更新第 ' + (index + 1) + ' 组选项；onChange 没有被调用。当前值：' + currentFirst.getValue());
      }),
      action('读回 getValue()', function () {
        say(out, '第一组 getValue() = ' + currentFirst.getValue() + '；第二组 getValue() = ' + second.getValue());
      })
    ));
    return life;
  };

  demos.R03 = function (host) {
    if (!window.NoteUI || !NoteUI.Badge) return unavailable(host, 'R03', 'NoteUI.Badge');
    var life = lifecycle(host, '短标签标明状态或类别；三档语气固定，文案可替换，长文字完整换行。');
    var stage = makeSurface();
    var row = makeRow();
    var out = feedback();
    var badges = [
      ['待查看', 'neutral'],
      ['当前关注', 'accent'],
      ['需要核对', 'warning'],
      ['一个较长但会完整显示的状态标签', 'neutral']
    ].map(function (item) {
      return life.add(NoteUI.Badge.mount(row, { label: item[0], tone: item[1] }));
    });
    var liveIndex = 0;
    var liveVariants = [
      { label: '本步变化', tone: 'accent' },
      { label: '等待核对', tone: 'warning' },
      { label: '普通状态', tone: 'neutral' },
      { label: '范围外内容，不随本步更新', tone: 'neutral' }
    ];
    var live = life.add(NoteUI.Badge.mount(row, liveVariants[0]));
    append(stage, row, out);
    append(life.root, stage, makeToolbar(
      action('更新最后一个标签', function () {
        liveIndex = (liveIndex + 1) % liveVariants.length;
        live.update(liveVariants[liveIndex]);
        say(out, '最后一个标签已更新为「' + liveVariants[liveIndex].label + '」（' + liveVariants[liveIndex].tone + '）。');
      })
    ));
    return life;
  };

  demos.R04 = function (host) {
    if (!window.NoteUI || !NoteUI.Notice) return unavailable(host, 'R04', 'NoteUI.Notice');
    var life = lifecycle(host, '常驻说明把必要解释放在正常阅读路径；字符串按纯文本显示，DOM 节点会移入组件而不是解析为 HTML。');
    var stage = makeSurface();
    var stack = style(h('div'), { display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '0' });
    var out = feedback();
    life.add(NoteUI.Notice.mount(stack, {
      title: '一般说明',
      content: '说明与当前对象放在一起，读者不必到页面角落寻找。',
      tone: 'neutral'
    }));
    life.add(NoteUI.Notice.mount(stack, {
      title: '范围提醒',
      content: '这里只展示局部结果；需要注意的条件直接写明。',
      tone: 'warning'
    }));
    var domContent = h('span');
    append(domContent, h('strong', null, 'DOM 内容：'), document.createTextNode('强调节点由宿主提供，更新时移入组件。'));
    var live = life.add(NoteUI.Notice.mount(stack, {
      title: '可替换内容',
      content: domContent,
      tone: 'neutral'
    }));
    var flipped = false;
    append(stage, stack, out);
    append(life.root, stage, makeToolbar(
      action('切换说明内容与语气', function () {
        flipped = !flipped;
        live.update({
          title: flipped ? '当前重点' : '可替换内容',
          content: flipped ? '更新为纯文本说明，原来的 DOM 内容已被替换。' : domContent,
          tone: flipped ? 'accent' : 'neutral'
        });
        say(out, flipped ? '已更新标题、正文与 accent 语气。' : '已换回 DOM 内容与 neutral 语气。');
      })
    ));
    return life;
  };

  demos.R05 = function (host) {
    if (!window.NoteUI || !NoteUI.Disclosure) return unavailable(host, 'R05', 'NoteUI.Disclosure');
    var life = lifecycle(host, '原生 details 承载可选详情；标题和概述始终可见。程序 update({ open }) 会把 event=null 传给 onToggle，原生点击则传 toggle 事件。');
    var stage = makeSurface();
    var stack = style(h('div'), { display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '0' });
    var out = feedback();
    var events = [];
    var live = life.add(NoteUI.Disclosure.mount(stack, {
      title: '可替换的补充说明',
      summary: '这段概述始终可读；点击标题展开。',
      content: '补充内容由宿主给出。程序开合不会被伪装成用户点击。',
      open: false,
      onToggle: function (open, event) {
        events.push(event === null ? 'programmatic:null' : 'native:' + event.type);
        say(out, 'onToggle(' + open + ', ' + (event === null ? 'null' : '“' + event.type + '”事件') + ')。');
      }
    }));
    life.add(NoteUI.Disclosure.mount(stack, {
      title: '从展开状态开始',
      summary: '同一组件可设置初始 open。',
      content: '长内容在正常阅读路径中展开，不隐藏必要的当前解释。',
      open: true
    }));
    var open = false;
    append(stage, stack, out);
    append(life.root, stage, makeToolbar(
      action('程序开合', function () {
        open = !open;
        live.update({ open: open });
        say(out, '程序 update({ open: ' + open + ' }) 已完成，onToggle 的 event 为 null。');
      }),
      action('查看事件记录', function () {
        say(out, events.length ? 'onToggle 记录：' + events.slice(-4).join('；') : '尚未收到 onToggle。');
      })
    ));
    return life;
  };

  demos.R06 = function (host) {
    if (!window.NoteUI || !NoteUI.DataObject) return unavailable(host, 'R06', 'NoteUI.DataObject');
    var life = lifecycle(host, '数据对象把标签、值与说明放在一起；attention 表示当前关注，changed 表示本步变化，两种状态可以同时存在。');
    var stage = makeSurface();
    var grid = style(h('div'), {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))',
      gap: '12px',
      minWidth: '0'
    });
    var out = feedback();
    life.add(NoteUI.DataObject.mount(grid, { label: '普通状态', value: 'A1', caption: '清楚呈现标签、值与说明。' }));
    life.add(NoteUI.DataObject.mount(grid, { label: '当前关注', value: 'B2', caption: '较克制地指出当前关注对象。', attention: true }));
    var live = life.add(NoteUI.DataObject.mount(grid, { label: '更新结果', value: 'C3', caption: '变化完成后保留结果。' }));
    var cycle = [
      { value: 'C4', changed: true, caption: '本步更新已经发生。' },
      { value: 'D5 → D6', changed: true, attention: true, caption: '同一对象同时保留关注与变化。' },
      { value: 'C3', changed: false, attention: false, caption: '变化完成后保留结果。' }
    ];
    var index = 0;
    append(stage, grid, out);
    append(life.root, stage, makeToolbar(
      action('更新对象状态', function () {
        var next = cycle[index];
        index = (index + 1) % cycle.length;
        live.update(next);
        say(out, '值更新为 ' + next.value + '；attention=' + Boolean(next.attention) + '，changed=' + Boolean(next.changed) + '。');
      })
    ));
    return life;
  };

  demos.R07 = function (host) {
    if (!window.NoteExpr || !NoteExpr.Focus) return unavailable(host, 'R07', 'NoteExpr.Focus');
    var life = lifecycle(host, '旧 NoteExpr.Focus 使用 show / hide / refresh / destroy。这里真实挂载标记层，操作只改当前关注目标；叠加层挂在 body，演示销毁时会一并移除。');
    var stage = makeSurface();
    var targets = makeRow();
    var targetA = chip('目标 A · 缓存命中');
    var targetB = chip('目标 B · 下一步');
    var paragraph = style(h('p'), {
      margin: '14px 0 0',
      maxWidth: '60ch',
      lineHeight: '1.7',
      fontSize: '15px',
      color: 'var(--hnv-color-ink, #202938)'
    });
    paragraph.textContent = '缓存是否命中决定下一步。这个句子用于文本子串下划线，不改变正文。';
    var wide = false;
    append(targets, targetA, targetB);
    append(stage, targets, paragraph);
    var out = feedback();
    var focus = life.add(NoteExpr.Focus.mount({ motion: 'auto' }));
    function showTarget(target, label) {
      try {
        focus.show(target);
        say(out, '已显示 ' + label + '；visible=' + focus.visible + '。再次选择其他目标即为迁移。');
      } catch (err) {
        say(out, '显示失败：' + err.message);
      }
    }
    append(life.root, stage, out, makeToolbar(
      action('关注目标 A', function () { showTarget(targetA, '目标 A'); }),
      action('迁移到目标 B', function () { showTarget(targetB, '目标 B'); }),
      action('标注文本子串', function () {
        try {
          focus.show({ el: paragraph, text: '缓存是否命中' });
          say(out, '文本子串下划线已显示；visible=' + focus.visible + '。');
        } catch (err) { say(out, '文本标注失败：' + err.message); }
      }),
      action('隐藏', function () { focus.hide(); say(out, '标记已隐藏；视觉叠加层会被清理，实例仍可再次 show。'); }),
      action('刷新位置', function () { focus.refresh(); say(out, '已调用 refresh() 重新测量当前目标。'); }),
      action('改目标宽度并刷新', function () {
        wide = !wide;
        targetA.style.maxWidth = wide ? '320px' : '';
        targetA.style.paddingRight = wide ? '54px' : '';
        targetB.style.marginLeft = wide ? '24px' : '';
        focus.refresh();
        say(out, '目标布局已改变并调用 refresh()，标记随新位置更新。');
      })
    ));
    return life;
  };

  demos.R08 = function (host) {
    if (!window.NoteExpr || !NoteExpr.Range) return unavailable(host, 'R08', 'NoteExpr.Range');
    var life = lifecycle(host, '旧 NoteExpr.Range 使用 show({ targets, text }) 更新范围和说明，refresh() 在布局变化后重测。括线由组件测量，不使用宿主私有 DOM。');
    var stage = makeSurface();
    var group = makeRow({ gap: '14px', padding: '8px 4px 12px' });
    var a = chip('步骤 1 · 提交');
    var b = chip('步骤 2 · 审核');
    var c = chip('步骤 3 · 执行');
    append(group, a, b, c);
    var out = feedback();
    var range = life.add(NoteExpr.Range.mount({ motion: 'auto' }));
    append(stage, group, out);
    append(life.root, stage, makeToolbar(
      action('标注前两步', function () {
        range.show({ targets: [a, b], text: '这两步一起完成' });
        say(out, '括线显示前两步并带说明；visible=' + range.visible + '。');
      }),
      action('更新到后两步', function () {
        range.show({ targets: [b, c], text: '审核通过后执行' });
        say(out, '范围已更新到后两步，旧括线不会残留。');
      }),
      action('只画括线', function () {
        range.show({ targets: [a, b, c], text: '' });
        say(out, '三个目标共用括线，不显示说明文字。');
      }),
      action('隐藏', function () { range.hide(); say(out, '括线与说明已隐藏。'); }),
      action('改变间距并刷新', function () {
        group.style.columnGap = group.style.columnGap === '46px' ? '14px' : '46px';
        range.refresh();
        say(out, '排列间距改变，refresh() 后括线重新测量。');
      })
    ));
    return life;
  };

  demos.R09 = function (host) {
    if (!window.NoteExpr || !NoteExpr.Link) return unavailable(host, 'R09', 'NoteExpr.Link');
    var life = lifecycle(host, '旧 NoteExpr.Link 使用 show / hide / refresh。演示使用可核对的关系：配置项被读取，结果写入缓存对象；关系文字与端点由宿主给出。');
    var stage = makeSurface();
    var group = makeRow({ gap: '18px', padding: '8px 4px 12px', alignItems: 'stretch' });
    var config = chip('配置项 · timeout');
    var reader = chip('读取函数 · load()');
    var cache = chip('缓存对象 · result');
    append(group, config, reader, cache);
    var out = feedback();
    var link = life.add(NoteExpr.Link.mount({ motion: 'auto' }));
    append(stage, group, out);
    append(life.root, stage, makeToolbar(
      action('配置 → 读取函数', function () {
        try {
          link.show({ from: config, to: reader, label: '被读取', arrow: true });
          say(out, '连线显示：配置项被读取；visible=' + link.visible + '。');
        } catch (err) { say(out, '连线失败：' + err.message); }
      }),
      action('读取函数 → 缓存对象', function () {
        try {
          link.show({ from: reader, to: cache, label: '写入结果', arrow: true });
          say(out, '端点已更新，关系文字为“写入结果”。');
        } catch (err) { say(out, '连线失败：' + err.message); }
      }),
      action('不带箭头', function () {
        try {
          link.show({ from: config, to: cache, label: '间接相关', arrow: false });
          say(out, '两点之间为无箭头关系线。');
        } catch (err) { say(out, '连线失败：' + err.message); }
      }),
      action('隐藏', function () { link.hide(); say(out, '关系线已隐藏。'); }),
      action('刷新位置', function () { link.refresh(); say(out, '已调用 refresh() 重新测量端点。'); })
    ));
    return life;
  };

  demos.R10 = function (host) {
    if (!window.SeqInsert) return unavailable(host, 'R10', 'SeqInsert');
    var life = lifecycle(host, '第二轮 SeqInsert 使用 insert / restore / replay / setData(data, { keepState })。组件自行完成让位与落位；演示不把旧接口伪装成 update。');
    var stage = makeSurface();
    var hostBox = style(h('div'), { width: '100%', minWidth: '0', overflowX: 'auto', padding: '2px 0 10px' });
    var out = feedback();
    var dataA = {
      sequence: [
        { key: 'submit', text: '提交' },
        { key: 'review', text: '审核' },
        { key: 'execute', text: '执行' }
      ],
      insert: { text: '校对', index: 2 },
      unit: '步',
      labels: { pending: '待补入', done: '已补入' }
    };
    var dataB = {
      sequence: [
        { key: 'draft', text: '起草' },
        { key: 'check', text: '校验' },
        { key: 'publish', text: '发布' }
      ],
      insert: { text: '复核', index: 1 },
      unit: '项',
      labels: { pending: '等待插入', done: '已插入' }
    };
    var variant = true;
    var view = life.add(SeqInsert.mount(hostBox, Object.assign({}, dataA, {
      startInserted: false,
      animate: true,
      onChange: function (state) {
        say(out, '逻辑状态：' + (state.inserted ? '已插入' : '未插入') + '；位置 ' + state.position + ' / 总数 ' + state.total + '；让位 ' + state.moved + ' 项。');
      },
      onSettle: function (state) {
        say(out, '停稳：' + (state.inserted ? '已插入 ' + state.text + '，第 ' + state.position + ' 位，共 ' + state.total + ' ' + state.unit + '。' : '已回到插入前；原序列 ' + state.sequence.length + ' 项保持顺序。'));
      }
    })));
    append(stage, hostBox, out);
    append(life.root, stage, makeToolbar(
      action('插入', function () { view.insert(); }),
      action('恢复', function () { view.restore(); }),
      action('重看当前停点', function () { view.replay(); }),
      action('setData 保留停点', function () {
        variant = !variant;
        var next = variant ? dataA : dataB;
        view.setData(Object.assign({}, next, { startInserted: false }), { keepState: true });
        say(out, 'setData(..., { keepState: true })：内容替换，当前停点保持不变。');
      }),
      action('setData 重置停点', function () {
        variant = !variant;
        var next = variant ? dataA : dataB;
        view.setData(Object.assign({}, next, { startInserted: false }), { keepState: false });
        say(out, 'setData(..., { keepState: false })：内容与停点都重置。');
      })
    ));
    return life;
  };

  demos.I06 = function (host) {
    var life = lifecycle(host, 'I06 不是新按钮，而是构建与交付能力：单一 manifest/registry、全量与模块产物、KaTeX 字体内嵌、自包含 gallery 预览。以下读取当前页面真实运行时状态，不伪造构建结果。');
    var stage = makeSurface();
    var grid = style(h('div'), {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
      gap: '16px',
      minWidth: '0'
    });
    var buildBox = style(h('div'), { minWidth: '0' });
    var runtimeBox = style(h('div'), { minWidth: '0' });
    var filesBox = style(h('div'), { minWidth: '0' });
    var out = feedback();
    append(grid, buildBox, runtimeBox, filesBox);
    append(stage, grid, out);

    function heading(textValue) {
      return style(h('h3', null, textValue), {
        margin: '0 0 8px',
        fontSize: '15px',
        lineHeight: '1.45',
        color: 'var(--hnv-color-ink, #202938)'
      });
    }
    function lines(items) {
      var list = style(h('dl'), {
        display: 'grid',
        gridTemplateColumns: 'max-content minmax(0, 1fr)',
        gap: '6px 12px',
        margin: '0',
        fontSize: '13px',
        lineHeight: '1.55'
      });
      items.forEach(function (item) {
        var dt = h('dt', null, item[0]);
        var dd = h('dd', null, item[1]);
        style(dt, { margin: '0', color: 'var(--hnv-color-muted, #5c6879)' });
        style(dd, { margin: '0', overflowWrap: 'anywhere' });
        append(list, dt, dd);
      });
      return list;
    }
    function code(textValue) {
      var node = h('code', null, textValue);
      style(node, {
        display: 'block',
        marginTop: '10px',
        padding: '8px 10px',
        borderRadius: '6px',
        background: 'var(--hnv-color-page, #f4f6f9)',
        color: 'var(--hnv-color-ink, #202938)',
        fontFamily: 'var(--hnv-font-mono, Consolas, monospace)',
        fontSize: '12px',
        lineHeight: '1.6',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere'
      });
      return node;
    }
    function refresh() {
      var registry = window.NOTE_LIBRARY_REGISTRY;
      buildBox.replaceChildren(heading('构建清单'));
      if (registry && registry.counts) {
        var byStatus = registry.counts.byStatus || {};
        append(buildBox, lines([
          ['模式', registry.build && registry.build.mode || '未记录'],
          ['构建时间', registry.build && registry.build.time || '未记录'],
          ['条目', String(registry.counts.total) + ' / 期望 ' + String(registry.counts.expected)],
          ['技术状态', 'planned ' + (byStatus.planned || 0) + ' · implemented ' + (byStatus.implemented || 0) + ' · verified ' + (byStatus.verified || 0) + ' · blocked ' + (byStatus.blocked || 0)],
          ['模块顺序', registry.build && Array.isArray(registry.build.moduleOrder) ? registry.build.moduleOrder.join(' → ') : '未记录']
        ]));
        append(buildBox, code('node scripts/build.mjs --final && node scripts/check.mjs --final'));
      } else {
        append(buildBox, lines([
          ['状态', '当前页面未读取到 window.NOTE_LIBRARY_REGISTRY'],
          ['原因', 'gallery 需在构建后加载 dist/registry.js；未构建时不伪造计数'],
          ['构建命令', 'node scripts/build.mjs']
        ]));
      }
      runtimeBox.replaceChildren(heading('运行时接口'));
      var loaded = [
        ['NoteCore', Boolean(window.NoteCore)],
        ['NoteUI', Boolean(window.NoteUI)],
        ['NoteExpr', Boolean(window.NoteExpr)],
        ['SeqInsert', Boolean(window.SeqInsert)],
        ['registry', Boolean(window.NOTE_LIBRARY_REGISTRY)]
      ].map(function (item) { return [item[0], item[1] ? '已加载' : '未加载']; });
      append(runtimeBox, lines(loaded));
      filesBox.replaceChildren(heading('分发与预览路径'));
      append(filesBox, lines([
        ['维护源', 'src/manifests/*.json · src/status.json'],
        ['全量', 'dist/note-library.js · dist/note-library.css'],
        ['模块', 'dist/modules/<module>.js|css'],
        ['清单', 'dist/registry.js · registry.json'],
        ['单文件', 'dist/组件库-预览.html'],
        ['vendor', 'KaTeX 0.19.1 · marked 18.1.2 · Lucide 1.62.0']
      ]));
      append(filesBox, code('状态只来自 src/status.json；文件存在不会自动把状态升级为 verified。'));
    }
    refresh();
    append(life.root, stage, makeToolbar(
      action('重新读取运行时信息', function () {
        refresh();
        say(out, window.NOTE_LIBRARY_REGISTRY ? '已读取当前 registry；未修改任何构建结果。' : '未发现 registry；请先完成构建并加载 dist/registry.js。');
      })
    ));
    return life;
  };
})();
