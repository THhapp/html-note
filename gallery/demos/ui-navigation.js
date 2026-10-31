/* Gallery demos for N01–N07. Every demo mounts the public NoteUI component,
 * shows a representative state, and returns a destroy function for the shell. */
(function () {
  'use strict';

  var demos = window.NoteGalleryDemos = window.NoteGalleryDemos || {};
  var localUid = 0;

  function el(tag, className, textValue) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (textValue != null) node.textContent = String(textValue);
    return node;
  }

  function add(parent) {
    for (var i = 1; i < arguments.length; i += 1) {
      var item = arguments[i];
      if (item == null) continue;
      parent.appendChild(typeof item === 'string' ? document.createTextNode(item) : item);
    }
    return parent;
  }

  function unique(prefix) {
    if (window.NoteCore && typeof window.NoteCore.uid === 'function') {
      return window.NoteCore.uid(prefix);
    }
    localUid += 1;
    return prefix + '-' + localUid;
  }

  function shell(host, introText) {
    var root = el('div', 'nui-navigation-demo');
    if (introText) {
      var intro = el('p', 'nui-navigation-demo__intro', introText);
      root.appendChild(intro);
    }
    host.appendChild(root);
    return root;
  }

  function section(root, title, hint) {
    var box = el('section', 'nui-navigation-demo__section');
    var head = el('div', 'nui-navigation-demo__section-head');
    head.appendChild(el('h3', 'nui-navigation-demo__title', title));
    if (hint) head.appendChild(el('p', 'nui-navigation-demo__hint', hint));
    box.appendChild(head);
    var body = el('div', 'nui-navigation-demo__stage');
    box.appendChild(body);
    root.appendChild(box);
    return { box: box, body: body, head: head };
  }

  function button(label, handler) {
    var node = el('button', 'nui-navigation-demo__button', label);
    node.type = 'button';
    if (typeof handler === 'function') node.addEventListener('click', handler);
    return node;
  }

  function logNode(initial) {
    var node = el('p', 'nui-navigation-demo__log', initial || '尚未操作。');
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    return node;
  }

  function setLog(node, message) {
    if (node) node.textContent = message;
  }

  function readout(initial) {
    var node = el('p', 'nui-navigation-demo__readout', initial || '');
    return node;
  }

  function iconNode(name, fallback) {
    if (window.NoteCore && typeof window.NoteCore.icon === 'function') {
      var icon = window.NoteCore.icon(name, { size: 16 });
      if (icon) return icon;
    }
    var fallbackNode = el('span', '', fallback || '•');
    fallbackNode.setAttribute('aria-hidden', 'true');
    return fallbackNode;
  }

  function makeList(lines) {
    var list = el('ul', 'nui-navigation-demo__list');
    lines.forEach(function (line) {
      list.appendChild(el('li', '', line));
    });
    return list;
  }

  /* N01 — Tabs */
  demos.N01 = function (host) {
    var root = shell(host, 'Tabs 用 roving tabindex 管理当前标签；下方可切换 keepMounted、方向和程序调用，观察哪些变化不会触发 onChange。');
    var sec = section(root, '真实标签页', '键盘：横向 ←/→、纵向 ↑/↓、Home/End；禁用项会跳过。');
    var stack = el('div', 'nui-navigation-demo__stack');
    var overview = el('div', 'nui-navigation-demo__stack');
    overview.appendChild(el('p', 'nui-navigation-demo__note', '这个输入框用来检查面板保留情况。切到其他标签再回来，输入值会跟着宿主 DOM 节点一起保留；keepMounted=false 时非当前面板会从 DOM 卸载。'));
    var field = el('label', 'nui-navigation-demo__field');
    field.appendChild(el('span', '', '概览备注（本地内容）'));
    var memo = el('input', 'nui-navigation-demo__input');
    memo.type = 'text';
    memo.value = '切走再回来看看';
    memo.setAttribute('aria-label', '概览备注');
    field.appendChild(memo);
    overview.appendChild(field);

    var detail = el('div', 'nui-navigation-demo__stack');
    detail.appendChild(el('p', 'nui-navigation-demo__note', '面板内容可以是 DOM，也可以是纯文本字符串。纯文本不会被解析成 HTML。'));
    detail.appendChild(makeList([
      '标签与面板通过 aria-controls / aria-labelledby 关联。',
      '当前标签同时有 aria-selected、字重和下边缘形状。',
      '禁用标签保留在列表中，但不能进入键盘焦点。'
    ]));

    var tabsHost = el('div');
    stack.appendChild(tabsHost);
    var keep = true;
    var orientation = 'horizontal';
    var tabs = NoteUI.Tabs.mount(tabsHost, {
      items: [
        { id: 'overview', label: '概览', content: overview },
        { id: 'detail', label: '结构说明', content: detail },
        { id: 'long', label: '一个较长中文标签与 English label', content: '长标签会换行，不会被压成不可读的窄条。' },
        { id: 'archive', label: '归档（禁用）', content: '不会显示，因为标签被禁用。', disabled: true }
      ],
      value: 'overview',
      keepMounted: true,
      label: '笔记分区',
      onChange: function (value) {
        setLog(log, '用户切换触发 onChange：' + value + '（事件来自本次操作）');
        refresh();
      }
    });

    var readoutNode = readout('');
    var log = logNode('尚未切换。');
    var toolbar = el('div', 'nui-navigation-demo__toolbar');
    var keepButton = button('keepMounted：保留非当前面板', function () {
      keep = !keep;
      tabs.update({ keepMounted: keep });
      keepButton.textContent = keep ? 'keepMounted：保留非当前面板' : 'keepMounted：仅挂载当前面板';
      keepButton.setAttribute('aria-pressed', keep ? 'true' : 'false');
      setLog(log, '程序 update({keepMounted:' + keep + '})，不触发 onChange。');
      refresh();
    });
    keepButton.setAttribute('aria-pressed', 'true');
    var orientationButton = button('方向：横向', function () {
      orientation = orientation === 'horizontal' ? 'vertical' : 'horizontal';
      tabs.update({ orientation: orientation });
      orientationButton.textContent = '方向：' + (orientation === 'vertical' ? '纵向' : '横向');
      setLog(log, '程序 update({orientation:\'' + orientation + '\'})，不触发 onChange；键盘随方向切换。');
      refresh();
    });
    var activateButton = button('程序 activate("detail")', function () {
      tabs.activate('detail');
      setLog(log, '程序 activate("detail")：不触发 onChange，值已更新为 ' + tabs.getValue() + '。');
      refresh();
    });
    add(toolbar, keepButton, orientationButton, activateButton);
    stack.appendChild(toolbar);
    stack.appendChild(readoutNode);
    stack.appendChild(log);
    sec.body.appendChild(stack);

    function refresh() {
      var active = tabs.el.querySelector('[role="tab"][aria-selected="true"]');
      var panelCount = tabs.el.querySelectorAll('[role="tabpanel"]').length;
      readoutNode.textContent = '当前：' + (active ? active.textContent : '无可用标签') +
        '；DOM 中面板 ' + panelCount + ' 个；keepMounted=' + keep + '；方向=' + orientation + '。';
    }
    refresh();

    return {
      destroy: function () {
        tabs.destroy();
        root.remove();
      }
    };
  };

  /* N02 — AnchorNav */
  demos.N02 = function (host) {
    var root = shell(host, '目录导航跟随右侧滚动容器更新当前章节；点击标题会滚动该容器。滚动行为遵循 prefers-reduced-motion，没有持续 rAF 动画。');
    var sec = section(root, '滚动容器 + 当前章节', '当前项同时有圆点形状、字重和 aria-current="location"。');
    var split = el('div', 'nui-navigation-demo__split');
    var navHost = el('div');
    var content = el('div', 'nui-navigation-demo__scroll');
    content.tabIndex = 0;
    content.setAttribute('aria-label', '章节正文滚动区');
    var chapters = [
      { key: 'overview', title: '概览：问题边界', level: 1 },
      { key: 'input', title: '输入与前提', level: 2 },
      { key: 'boundary', title: '边界条件与失败情况', level: 2 },
      { key: 'result', title: '结果怎样读', level: 2 },
      { key: 'longer', title: '附录：一个较长标题，用来说明目录项会自动换行', level: 1 }
    ];
    var prefix = unique('nui-anchor-demo');
    chapters.forEach(function (chapter, index) {
      var id = prefix + '-' + chapter.key;
      chapter.id = id;
      var heading = el('h3', 'nui-navigation-demo__chapter', chapter.title);
      heading.id = id;
      content.appendChild(heading);
      for (var paragraph = 0; paragraph < 3; paragraph += 1) {
        content.appendChild(el('p', 'nui-navigation-demo__paragraph',
          '第 ' + (index + 1) + ' 节，段落 ' + (paragraph + 1) + '：目录不会把整页重新排版，也不依赖持续动画；需要查看更多上下文时，在这个局部滚动区继续滚动。'));
      }
    });
    add(split, navHost, content);
    sec.body.appendChild(split);
    var anchor = NoteUI.AnchorNav.mount(navHost, {
      items: chapters.map(function (chapter) {
        return { id: chapter.id, label: chapter.title, level: chapter.level };
      }),
      target: content,
      label: '示例章节'
    });
    var log = logNode('尚未使用程序定位。');
    var toolbar = el('div', 'nui-navigation-demo__toolbar');
    toolbar.appendChild(button('程序设为「边界条件」', function () {
      anchor.setActive(chapters[2].id);
      setLog(log, 'setActive("' + chapters[2].title + '") 只更新当前项；跳转请点击目录链接。');
    }));
    toolbar.appendChild(button('程序设为「结果怎样读」', function () {
      anchor.setActive(chapters[3].id);
      setLog(log, 'setActive("' + chapters[3].title + '") 完成，未触发滚动。');
    }));
    sec.body.appendChild(toolbar);
    sec.body.appendChild(log);
    return {
      destroy: function () {
        anchor.destroy();
        root.remove();
      }
    };
  };

  /* N03 — Breadcrumb */
  demos.N03 = function (host) {
    var root = shell(host, '面包屑路径由宿主提供；当前项不可点击并使用 aria-current="page"。达到 maxItems 时，中间层级收进一个可用键盘操作的省略菜单。');
    var history = logNode('尚未选择路径。');
    function crumbItems(names) {
      return names.map(function (name, index) {
        return {
          label: name,
          onClick: index === names.length - 1 ? null : function (event) {
            if (event) event.preventDefault();
            setLog(history, '激活路径：' + name + '（演示不跳转页面）');
          }
        };
      });
    }
    var standardSection = section(root, '完整路径', '来源由宿主按层级传入；这里用按钮代替页面跳转。');
    var standardHost = el('div');
    standardSection.body.appendChild(standardHost);
    var standard = NoteUI.Breadcrumb.mount(standardHost, {
      items: crumbItems(['首页', '知识库', '网络协议', '当前章节：可靠传输与重传机制']),
      label: '当前位置'
    });

    var collapsedSection = section(root, '长路径与省略菜单', '把焦点移到「…」按钮后按 Enter 打开；↑/↓ 移动，Enter/Space 选择，Esc 关闭并回到按钮。');
    var collapsedHost = el('div');
    collapsedSection.body.appendChild(collapsedHost);
    var collapsedItems = crumbItems(['产品文档', '基础组件', '导航与定位', '面包屑', '省略状态', '键盘操作', '当前页面：很长的路径末端标题']);
    var collapsed = NoteUI.Breadcrumb.mount(collapsedHost, {
      items: collapsedItems,
      maxItems: 4,
      label: '省略路径'
    });
    var collapsedNow = true;
    var toggle = button('展开完整路径', function () {
      collapsedNow = !collapsedNow;
      collapsed.update({ maxItems: collapsedNow ? 4 : 0 });
      toggle.textContent = collapsedNow ? '展开完整路径' : '收起中间层级';
      setLog(history, collapsedNow ? 'maxItems=4：中间层级移入省略菜单。' : 'maxItems=0：路径完整展开。');
    });
    var toolbar = el('div', 'nui-navigation-demo__toolbar');
    toolbar.appendChild(toggle);
    collapsedSection.body.appendChild(toolbar);
    collapsedSection.body.appendChild(history);
    return {
      destroy: function () {
        standard.destroy();
        collapsed.destroy();
        root.remove();
      }
    };
  };

  /* N04 — Menu */
  demos.N04 = function (host) {
    var root = shell(host, '菜单使用统一浮层定位。主菜单展示子菜单、禁用项、分隔线、图标与快捷键文字；右侧区域提供真实右键上下文菜单。');
    var log = logNode('尚未选择菜单项。');
    var sec = section(root, '下拉菜单、子菜单与右键菜单', '键盘：↑/↓、Home/End 移动；→ 打开子菜单，← 回到上级；Enter/Space 选择；Esc 关闭当前层并恢复焦点。');
    var row = el('div', 'nui-navigation-demo__menu-row');
    var dropColumn = el('div', 'nui-navigation-demo__menu-column');
    dropColumn.appendChild(el('p', 'nui-navigation-demo__hint', '按钮触发的下拉菜单'));
    var contextColumn = el('div', 'nui-navigation-demo__menu-column');
    contextColumn.appendChild(el('p', 'nui-navigation-demo__hint', '右键触发的上下文菜单（区域可用 Tab 聚焦）'));
    var contextArea = el('div', 'nui-navigation-demo__context', '在这个区域内右键，或先聚焦后按 Shift+F10 打开菜单；Esc 会关闭菜单并把焦点还给这个区域。');
    contextArea.tabIndex = 0;
    contextArea.setAttribute('aria-label', '右键菜单示例区域');
    contextColumn.appendChild(contextArea);
    add(row, dropColumn, contextColumn);
    sec.body.appendChild(row);

    function selection(name) {
      setLog(log, 'onSelect：' + name + '。选中叶子项后根菜单关闭，焦点回到触发按钮。');
    }

    var dropdown = NoteUI.Menu.mount(dropColumn, {
      trigger: { type: 'button', label: '项目操作' },
      label: '项目操作菜单',
      placement: 'bottom-start',
      items: [
        { id: 'open', label: '打开文档', icon: iconNode('file-text', '▤'), shortcut: 'Enter' },
        { id: 'duplicate', label: '创建副本', icon: iconNode('copy', '⧉'), shortcut: 'Ctrl+D' },
        {
          id: 'export',
          label: '导出为…',
          icon: iconNode('download', '↓'),
          children: [
            { id: 'pdf', label: 'PDF 文档', shortcut: 'PDF' },
            { id: 'images', label: '图片序列', shortcut: 'PNG' },
            { id: 'markdown', label: 'Markdown', disabled: true }
          ]
        },
        { type: 'separator' },
        { id: 'archive', label: '归档', disabled: true },
        { id: 'delete', label: '移到回收站' }
      ],
      onSelect: function (item) {
        selection(item.label);
      }
    });

    var context = NoteUI.Menu.mount(contextColumn, {
      trigger: { type: 'contextmenu', label: '上下文菜单' },
      anchor: contextArea,
      label: '区域操作',
      items: [
        { id: 'ctx-open', label: '打开链接', shortcut: 'Enter' },
        { id: 'ctx-copy', label: '复制路径', shortcut: 'Ctrl+C' },
        { id: 'ctx-disabled', label: '重命名', disabled: true },
        { type: 'separator' },
        { id: 'ctx-remove', label: '从列表移除' }
      ],
      onSelect: function (item) {
        setLog(log, '上下文菜单 onSelect：' + item.label + '。菜单已关闭，焦点回到右键区域。');
      }
    });
    sec.body.appendChild(log);

    return {
      destroy: function () {
        dropdown.destroy();
        context.destroy();
        root.remove();
      }
    };
  };

  /* N05 — Pagination */
  demos.N05 = function (host) {
    var root = shell(host, '分页只报告页码与每页数量变化，不发起网络请求；页面数据由宿主按事件加载。总数为 0 时显示明确空态。');
    var paginationSection = section(root, '大量页码与每页数量', '页码会自动夹紧在合法范围；原生 select 负责每页数量。');
    var paginationHost = el('div');
    paginationSection.body.appendChild(paginationHost);
    var log = logNode('尚未切换页码。');
    var readoutNode = readout('');
    var total = 248;
    var pagination = NoteUI.Pagination.mount(paginationHost, {
      total: total,
      page: 1,
      pageSize: 10,
      pageSizes: [10, 20, 50],
      onChange: function (page, pageSize, event) {
        setLog(log, 'onChange(page=' + page + ', pageSize=' + pageSize + ', event=' + event.type + ')。宿主可在此加载对应数据。');
        refresh();
      }
    });
    var toolbar = el('div', 'nui-navigation-demo__toolbar');
    toolbar.appendChild(button('总数改为 7 条', function () {
      total = 7;
      pagination.update({ total: 7, page: 1 });
      setLog(log, '程序 update({total:7})：不触发 onChange，页码已夹紧。');
      refresh();
    }));
    toolbar.appendChild(button('恢复 248 条', function () {
      total = 248;
      pagination.update({ total: 248, page: 1 });
      setLog(log, '程序 update({total:248})：不触发 onChange。');
      refresh();
    }));
    paginationSection.body.appendChild(toolbar);
    paginationSection.body.appendChild(readoutNode);
    paginationSection.body.appendChild(log);

    var emptySection = section(root, '总数为 0 的空态', '不渲染页码按钮，也不伪造第 1 页有内容。');
    var empty = NoteUI.Pagination.mount(emptySection.body, {
      total: 0,
      page: 1,
      pageSize: 10
    });

    function refresh() {
      var value = pagination.getValue();
      readoutNode.textContent = '当前值：page=' + value.page + '，pageSize=' + value.pageSize + '；宿主总数=' + total + '。';
    }
    refresh();

    return {
      destroy: function () {
        pagination.destroy();
        empty.destroy();
        root.remove();
      }
    };
  };

  /* N06 — Steps */
  demos.N06 = function (host) {
    var root = shell(host, 'Steps 只显示宿主传入的 current，不会自行推进。点击可选步骤仅触发 onChange；本演示的宿主在回调里更新 current。');
    var sec = section(root, '当前、已完成与未到达', '状态同时用标记形状和“已完成 / 当前步骤 / 未开始”文字表达；窄宽度自动转纵向。');
    var stepsHost = el('div');
    sec.body.appendChild(stepsHost);
    var labels = ['准备材料与术语', '执行转换步骤', '核对结果与边界', '归档可追溯记录'];
    var descriptions = [
      '确认输入、单位和需要保留的字段。',
      '当前停点由宿主控制，组件不设置计时器。',
      '逐项检查结果是否满足目标格式。',
      '保留结果与说明，方便以后回看。'
    ];
    var model = 1;
    var clickable = true;
    var orientation = 'horizontal';
    var log = logNode('尚未操作。');
    var readoutNode = readout('');
    var steps = NoteUI.Steps.mount(stepsHost, {
      items: labels.map(function (label, index) {
        return { label: label, description: descriptions[index] };
      }),
      current: model,
      clickable: true,
      orientation: orientation,
      onChange: function (index) {
        setLog(log, '用户选择第 ' + (index + 1) + ' 步，Steps 触发 onChange；宿主随后把 current 更新为 ' + index + '。');
        model = index;
        steps.update({ current: model });
        refresh();
      }
    });
    var toolbar = el('div', 'nui-navigation-demo__toolbar');
    var nextButton = button('宿主推进到下一步', function () {
      if (model >= labels.length - 1) return;
      model += 1;
      steps.update({ current: model });
      setLog(log, '宿主调用 update({current:' + model + '})；这不是组件自动推进，也没有 onChange。');
      refresh();
    });
    var resetButton = button('重置到第 2 步', function () {
      model = 1;
      steps.update({ current: model });
      setLog(log, '宿主重置 current 为 1；程序 update 不触发 onChange。');
      refresh();
    });
    var directionButton = button('方向：横向', function () {
      orientation = orientation === 'horizontal' ? 'vertical' : 'horizontal';
      steps.update({ orientation: orientation });
      directionButton.textContent = '方向：' + (orientation === 'vertical' ? '纵向' : '横向');
      setLog(log, '程序 update({orientation}) 改变呈现，不触发 onChange。');
      refresh();
    });
    var clickableButton = button('可选跳转：开', function () {
      clickable = !clickable;
      steps.update({ clickable: clickable });
      clickableButton.textContent = '可选跳转：' + (clickable ? '开' : '关');
      clickableButton.setAttribute('aria-pressed', clickable ? 'true' : 'false');
      setLog(log, clickable ? '步骤可点击；仍只通知宿主，不自行推进。' : '步骤只读显示。');
      refresh();
    });
    clickableButton.setAttribute('aria-pressed', 'true');
    add(toolbar, nextButton, resetButton, directionButton, clickableButton);
    sec.body.appendChild(toolbar);
    sec.body.appendChild(readoutNode);
    sec.body.appendChild(log);

    function refresh() {
      readoutNode.textContent = '宿主 current=' + model + '；方向=' + orientation + '；可选跳转=' + (clickable ? '开' : '关') + '。';
    }
    refresh();

    return {
      destroy: function () {
        steps.destroy();
        root.remove();
      }
    };
  };

  /* N07 — TreeView */
  demos.N07 = function (host) {
    var root = shell(host, '目录树用于可操作的层级目录，不承担机制关系图。它支持展开/收起、选择、禁用节点、深层层级和局部滚动。');
    var sec = section(root, '深层目录、禁用节点与多选', '键盘：↑/↓ 可见项，→ 展开或进子，← 收起或回父，Home/End，Enter/Space 选择。');
    var treeHost = el('div');
    sec.body.appendChild(treeHost);
    var log = logNode('尚未选择或展开节点。');
    var readoutNode = readout('');
    var multi = false;
    var tree = NoteUI.TreeView.mount(treeHost, {
      label: '文档目录树',
      expanded: ['guide', 'start', 'install', 'reference'],
      selected: 'theme',
      nodes: [
        {
          id: 'guide',
          label: '使用指南',
          children: [
            { id: 'start', label: '开始使用', children: [
              { id: 'install', label: '安装与初始化', children: [
                { id: 'deep', label: '一个很深的目录节点，带有一段较长的中文标签和 English words，用来说明窄窗口下的换行' }
              ] },
              { id: 'theme', label: '主题与可读性' }
            ] },
            { id: 'legacy', label: '旧版迁移（不会异步加载）', disabled: true }
          ]
        },
        {
          id: 'reference',
          label: '参考资料',
          children: [
            { id: 'api', label: 'API 索引' },
            { id: 'keyboard', label: '键盘操作速查' }
          ]
        }
      ],
      onSelect: function (selected, event) {
        setLog(log, 'onSelect：' + JSON.stringify(selected) + '（事件：' + (event ? event.type : '程序调用') + '）');
        refresh();
      },
      onToggle: function (id, open, event) {
        setLog(log, 'onToggle：' + id + ' → ' + (open ? '展开' : '收起') + '（事件：' + (event ? event.type : '程序调用') + '）');
        refresh();
      }
    });
    tree.el.style.maxHeight = '22rem';
    var toolbar = el('div', 'nui-navigation-demo__toolbar');
    var multiButton = button('选择模式：单选', function () {
      multi = !multi;
      tree.update({ multi: multi });
      multiButton.textContent = '选择模式：' + (multi ? '多选' : '单选');
      multiButton.setAttribute('aria-pressed', multi ? 'true' : 'false');
      setLog(log, '程序 update({multi:' + multi + '})，不触发选择或展开事件。');
      refresh();
    });
    multiButton.setAttribute('aria-pressed', 'false');
    var expandButton = button('展开全部父节点', function () {
      ['guide', 'start', 'install', 'reference'].forEach(function (id) { tree.expand(id, true); });
      setLog(log, '程序逐个 expand(id,true)；不触发 onToggle。');
      refresh();
    });
    var collapseButton = button('收起全部父节点', function () {
      ['install', 'start', 'guide', 'reference'].forEach(function (id) { tree.expand(id, false); });
      setLog(log, '程序逐个 expand(id,false)；不触发 onToggle。');
      refresh();
    });
    var silentButton = button('静默选择「API 索引」', function () {
      tree.select('api', { silent: true });
      setLog(log, '程序 select("api",{silent:true}) 已执行，未触发 onSelect。');
      refresh();
    });
    var focusButton = button('用 getTarget 聚焦禁用节点', function () {
      tree.expand('guide', true);
      var target = tree.getTarget('legacy');
      if (target && typeof target.focus === 'function') target.focus();
      setLog(log, target ? 'getTarget("legacy") 找到节点并聚焦；禁用节点不会被选择或展开。' : '未找到目标节点。');
      refresh();
    });
    add(toolbar, multiButton, expandButton, collapseButton, silentButton, focusButton);
    sec.body.appendChild(toolbar);
    sec.body.appendChild(readoutNode);
    sec.body.appendChild(log);

    function refresh() {
      readoutNode.textContent = 'getSelected()：' + JSON.stringify(tree.getSelected()) +
        '；选择模式=' + (multi ? '多选' : '单选') + '；DOM 中 treeitem ' +
        tree.el.querySelectorAll('[role="treeitem"]').length + ' 个。';
    }
    refresh();

    return {
      destroy: function () {
        tree.destroy();
        root.remove();
      }
    };
  };
})();
