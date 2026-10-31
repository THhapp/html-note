(function () {
  'use strict';

  var demo = window.NoteGalleryDemos = window.NoteGalleryDemos || {};
  var controlsStyle = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0;max-width:100%';
  var noteStyle = 'margin:0;color:var(--hnv-color-muted,#5c6879);font-size:var(--hnv-font-size-label,14px);line-height:var(--hnv-font-line-reading,1.65);overflow-wrap:anywhere';
  var cardStyle = 'box-sizing:border-box;min-width:0;max-width:100%;padding:12px 14px;border:var(--hnv-border-width,1px) solid var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-control,8px);background:var(--hnv-color-surface,#ffffff);overflow-wrap:anywhere';
  var quietCardStyle = 'box-sizing:border-box;min-width:0;max-width:100%;padding:12px 14px;border:var(--hnv-border-width,1px) solid var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-control,8px);background:var(--hnv-color-page,#f4f6f9);overflow-wrap:anywhere';

  function styled(tag, css, textValue) {
    var node = document.createElement(tag);
    if (css) node.style.cssText = css;
    if (textValue != null) node.textContent = textValue;
    return node;
  }

  function demoRoot(host) {
    var root = styled('div', 'display:flex;flex-direction:column;gap:14px;width:100%;max-width:100%;min-width:0;font-family:inherit;font-size:var(--hnv-font-size-reading,16px);line-height:var(--hnv-font-line-reading,1.65);color:var(--hnv-color-ink,#202938);overflow-wrap:anywhere');
    host.appendChild(root);
    return root;
  }

  function intro(value) {
    return styled('p', 'margin:0;max-width:72ch;font-size:var(--hnv-font-size-reading,16px);line-height:var(--hnv-font-line-reading,1.65);overflow-wrap:anywhere', value);
  }

  function note(value) {
    return styled('p', noteStyle, value);
  }

  function row(css) {
    return styled('div', controlsStyle + (css ? ';' + css : ''));
  }

  function status(value) {
    var node = styled('p', noteStyle + ';min-height:1.6em', value || '');
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    return node;
  }

  function button(label, onClick) {
    var node = styled('button', 'box-sizing:border-box;max-width:100%;min-height:34px;padding:7px 11px;border:var(--hnv-border-width,1px) solid var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-control,8px);background:var(--hnv-color-surface,#ffffff);color:var(--hnv-color-ink,#202938);font-family:inherit;font-size:var(--hnv-font-size-label,14px);font-weight:600;line-height:1.4;text-align:center;white-space:normal;overflow-wrap:anywhere;cursor:pointer', label);
    node.type = 'button';
    if (onClick) node.onclick = onClick;
    return node;
  }

  function card(titleText, bodyText) {
    var box = styled('div', cardStyle);
    var title = styled('div', 'font-size:var(--hnv-font-size-label,14px);font-weight:650;line-height:1.5;overflow-wrap:anywhere', titleText);
    var body = styled('p', 'margin:4px 0 0;color:var(--hnv-color-muted,#5c6879);font-size:var(--hnv-font-size-label,14px);line-height:var(--hnv-font-line-reading,1.65);overflow-wrap:anywhere', bodyText);
    box.appendChild(title);
    box.appendChild(body);
    return box;
  }

  function chip(label, clickable) {
    var node = styled(clickable ? 'button' : 'span', 'box-sizing:border-box;display:inline-flex;align-items:center;max-width:100%;min-height:34px;padding:6px 11px;border:var(--hnv-border-width,1px) solid var(--hnv-color-border,#dce2ea);border-radius:999px;background:var(--hnv-color-page,#f4f6f9);color:var(--hnv-color-ink,#202938);font-family:inherit;font-size:var(--hnv-font-size-label,14px);line-height:1.45;white-space:normal;overflow-wrap:anywhere;text-align:start;cursor:' + (clickable ? 'pointer' : 'default'), label);
    if (clickable) node.type = 'button';
    return node;
  }

  /* L01 */
  demo['L01'] = function (host) {
    var root = demoRoot(host);
    var maxWide = true;
    var centered = true;
    var padding = 'md';
    var longVersion = false;
    var state = status('');

    function contentNode() {
      var box = styled('div', quietCardStyle);
      var heading = styled('div', 'font-size:var(--hnv-font-size-heading,20px);font-weight:650;line-height:1.4;margin-bottom:6px', longVersion ? '长内容与长英文行' : '可读宽度的局部内容');
      var copy = styled('p', 'margin:0;overflow-wrap:anywhere', longVersion
        ? '这是一段用于检查窄宽度和阅读行长度的中文内容。容器只限制自身的内容区，不会修改 body、全局标题或整页字号。下面再加入一段没有刻意换行的长英文，确认它在窄容器中自然折行：readable measure typography keeps long English sentences inside the local container without leaking into the surrounding page layout.'
        : '容器负责局部内容区的最大宽度与内边距，宿主仍然拥有页面结构和外部距离。切换窄宽、对齐或内边距，内容不会影响其他区域。');
      box.appendChild(heading);
      box.appendChild(copy);
      return box;
    }

    var frame = styled('div', 'box-sizing:border-box;width:100%;max-width:100%;padding:8px;border:1px dashed var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-control,8px);background:var(--hnv-color-page,#f4f6f9)');
    var container = window.NoteUI.Container.mount(frame, {
      maxWidth: '72ch',
      padding: padding,
      align: 'center',
      content: contentNode()
    });
    root.appendChild(intro('内容容器限制局部可读宽度、内边距和对齐方式。虚线框是演示用的宿主可用宽度；容器本身不接管页面样式。'));
    var bar = row();
    var widthButton;
    var alignButton;
    var paddingButton;
    var contentButton;
    widthButton = button('切换窄宽度', function () {
      maxWide = !maxWide;
      container.update({ maxWidth: maxWide ? '72ch' : '34rem' });
      widthButton.textContent = maxWide ? '切换窄宽度' : '恢复 72ch';
      state.textContent = '当前：' + (maxWide ? '72ch' : '34rem') + '，' + (centered ? '居中' : '左对齐') + '，内边距 ' + padding + '。';
    });
    alignButton = button('切换为左对齐', function () {
      centered = !centered;
      container.update({ align: centered ? 'center' : 'start' });
      alignButton.textContent = centered ? '切换为左对齐' : '切换为居中';
      state.textContent = '当前：' + (maxWide ? '72ch' : '34rem') + '，' + (centered ? '居中' : '左对齐') + '，内边距 ' + padding + '。';
    });
    paddingButton = button('内边距改为 none', function () {
      padding = padding === 'md' ? 'none' : 'md';
      container.update({ padding: padding });
      paddingButton.textContent = padding === 'md' ? '内边距改为 none' : '恢复内边距 md';
      state.textContent = '当前：' + (maxWide ? '72ch' : '34rem') + '，' + (centered ? '居中' : '左对齐') + '，内边距 ' + padding + '。';
    });
    contentButton = button('换成长内容', function () {
      longVersion = !longVersion;
      container.update({ content: contentNode() });
      contentButton.textContent = longVersion ? '换回短内容' : '换成长内容';
    });
    bar.appendChild(widthButton);
    bar.appendChild(alignButton);
    bar.appendChild(paddingButton);
    bar.appendChild(contentButton);
    root.appendChild(bar);
    root.appendChild(state);
    root.appendChild(frame);
    state.textContent = '当前：72ch，居中，内边距 md。';

    return {
      destroy: function () {
        container.destroy();
        root.remove();
      }
    };
  };

  /* L02 */
  demo['L02'] = function (host) {
    var root = demoRoot(host);
    var innerHost = styled('div', 'min-width:0;max-width:100%;padding-left:12px;border-left:3px solid var(--hnv-color-accent-soft,#eef2ff)');
    var outer = window.NoteUI.Stack.mount(root, { gap: 'md', align: 'stretch' });
    var inner = window.NoteUI.Stack.mount(innerHost, {
      gap: 'sm',
      align: 'stretch',
      content: [
        card('嵌套 Stack A', '内层保持自己的统一间距，外层无需重复计算子项之间的距离。'),
        card('嵌套 Stack B', '长内容自然撑开高度；没有固定步数或舞台高度。')
      ]
    });
    var extraCount = 0;
    var state = status('当前间距 md，交叉轴 stretch。');
    outer.append(
      card('第一段', 'Stack 只管理纵向节奏和外部组合距离，不覆盖子组件内部间距。'),
      innerHost,
      card('长内容示例', '较长的中英文内容会按自然高度撑开，而不是被压到固定高度里。An additional English sentence demonstrates that the vertical rhythm remains stable with mixed-language content, including a token like sequence-insert-primary-fallback-token-that-is-long.')
    );
    var bar = row();
    var gapButton = button('间距改为 lg', function () {
      outer.update({ gap: outer.el.style.gap === 'var(--hnv-space-group, 28px)' ? 'md' : 'lg' });
      var lg = outer.el.style.gap.indexOf('space-group') >= 0;
      gapButton.textContent = lg ? '间距改为 md' : '间距改为 lg';
      state.textContent = '当前间距 ' + (lg ? 'lg' : 'md') + '，交叉轴 stretch。';
    });
    var alignButton = button('交叉轴改为 center', function () {
      var centered = outer.el.style.alignItems === 'center';
      var next = centered ? 'stretch' : 'center';
      outer.update({ align: next });
      alignButton.textContent = '交叉轴改为 ' + (next === 'stretch' ? 'center' : 'stretch');
      state.textContent = '当前间距 ' + (outer.el.style.gap.indexOf('space-group') >= 0 ? 'lg' : 'md') + '，交叉轴 ' + next + '。';
    });
    var addButton = button('追加一项', function () {
      extraCount += 1;
      outer.append(card('追加项 ' + extraCount, 'append() 向当前 Stack 末尾追加节点，已有内容与嵌套关系保持不变。'));
    });
    bar.appendChild(gapButton);
    bar.appendChild(alignButton);
    bar.appendChild(addButton);
    root.insertBefore(intro('Stack 提供统一纵向间距、对齐和嵌套。切换间距或追加内容，观察长文本与嵌套层如何保持自然高度。'), root.firstChild);
    root.insertBefore(bar, outer.el);
    root.insertBefore(state, outer.el);

    return {
      destroy: function () {
        inner.destroy();
        outer.destroy();
        root.remove();
      }
    };
  };

  /* L03 */
  demo['L03'] = function (host) {
    var root = demoRoot(host);
    var narrow = false;
    var wrapped = true;
    var currentGap = 'sm';
    var state = status('');
    var frame = styled('div', 'box-sizing:border-box;width:100%;max-width:44rem;padding:10px;border:1px dashed var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-control,8px);background:var(--hnv-color-page,#f4f6f9);overflow:hidden');
    var inline = window.NoteUI.Inline.mount(frame, { gap: 'sm', align: 'center', justify: 'start', wrap: true });
    var actions = button('子项按钮：查看详情', function () {
      state.textContent = '子项按钮仍可点击，窄容器中文字会自然换行，而不是被压缩成不可读的窄条。';
    });
    function addChips() {
      inline.append(
        chip('标签：概念'),
        chip('窄空间中的长中文标签仍然保持可读'),
        chip('keyboard-focus-and-long-english-label-token'),
        actions
      );
    }
    addChips();
    root.appendChild(intro('横向排布负责间距与换行。窄空间下子项不会被压扁；关闭换行时改为局部横向滚动。'));
    var bar = row();
    var gapButton = button('间距改为 md', function () {
      currentGap = currentGap === 'sm' ? 'md' : 'sm';
      inline.update({ gap: currentGap });
      gapButton.textContent = currentGap === 'sm' ? '间距改为 md' : '间距改为 sm';
    });
    var wrapButton = button('关闭换行', function () {
      wrapped = !wrapped;
      inline.update({ wrap: wrapped });
      wrapButton.textContent = wrapped ? '关闭换行' : '恢复换行';
      state.textContent = wrapped ? '当前允许换行。' : '当前不换行，超宽时在本地区域横向滚动。';
    });
    var widthButton = button('缩小容器', function () {
      narrow = !narrow;
      frame.style.maxWidth = narrow ? '24rem' : '44rem';
      widthButton.textContent = narrow ? '恢复宽容器' : '缩小容器';
      state.textContent = narrow ? '当前宿主宽度约 24rem，子项仍保持可读。' : '当前宿主宽度约 44rem。';
    });
    bar.appendChild(gapButton);
    bar.appendChild(wrapButton);
    bar.appendChild(widthButton);
    root.appendChild(bar);
    root.appendChild(state);
    root.appendChild(frame);
    state.textContent = '当前允许换行，间距 sm。';

    return {
      destroy: function () {
        inline.destroy();
        root.remove();
      }
    };
  };

  /* L04 */
  demo['L04'] = function (host) {
    var root = demoRoot(host);
    var mode = 'auto';
    var minWidth = '14rem';
    var narrow = false;
    var added = 0;
    var state = status('');
    var frame = styled('div', 'box-sizing:border-box;width:100%;max-width:100%;padding:10px;border:1px dashed var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-control,8px);background:var(--hnv-color-page,#f4f6f9)');
    var grid = window.NoteUI.Grid.mount(frame, { columns: 'auto', minColumnWidth: minWidth, gap: 'md' });
    var spanned = card('跨两列的重点卡片', '直接子项上的 data-nui-span="2" 让它在两列布局中占两列。固定列数时会自动夹到可用列数。');
    spanned.setAttribute('data-nui-span', '2');
    var full = card('满宽说明', '另一个子项使用 data-nui-span="full"，适合声明型内容。');
    full.setAttribute('data-nui-span', 'full');
    grid.append(
      card('自动列 1', 'auto-fit 与 minmax 按容器空间决定列数。'),
      card('自动列 2', '卡片本身不固定整页列数。'),
      card('自动列 3', '窄容器会自然减少列数。'),
      spanned,
      card('自动列 4', '内容决定高度。'),
      full
    );
    root.appendChild(intro('网格按容器空间决定列数，不锁定整页布局。可以切换固定两列或三列；跨列通过子项 data-nui-span 指定。'));
    var bar = row();
    var columnButton = button('切换为两列', function () {
      mode = mode === 'auto' ? 2 : (mode === 2 ? 3 : 'auto');
      grid.update({ columns: mode });
      columnButton.textContent = mode === 'auto' ? '切换为两列' : (mode === 2 ? '切换为三列' : '恢复 auto-fit');
      updateState();
    });
    var minButton = button('最小列宽改为 10rem', function () {
      minWidth = minWidth === '14rem' ? '10rem' : '14rem';
      grid.update({ minColumnWidth: minWidth });
      minButton.textContent = minWidth === '14rem' ? '最小列宽改为 10rem' : '最小列宽恢复 14rem';
      updateState();
    });
    var widthButton = button('缩小容器', function () {
      narrow = !narrow;
      frame.style.maxWidth = narrow ? '26rem' : '100%';
      widthButton.textContent = narrow ? '恢复容器' : '缩小容器';
      updateState();
    });
    var addButton = button('追加卡片', function () {
      added += 1;
      grid.append(card('追加卡片 ' + added, 'append() 后立即应用跨列规则。'));
    });
    function updateState() {
      state.textContent = '当前列设置：' + (mode === 'auto' ? 'auto-fit' : mode + ' 列') + '；最小列宽 ' + minWidth + '；容器' + (narrow ? '较窄' : '较宽') + '。';
    }
    bar.appendChild(columnButton);
    bar.appendChild(minButton);
    bar.appendChild(widthButton);
    bar.appendChild(addButton);
    root.appendChild(bar);
    root.appendChild(state);
    root.appendChild(frame);
    updateState();

    return {
      destroy: function () {
        grid.destroy();
        root.remove();
      }
    };
  };

  /* L05 */
  demo['L05'] = function (host) {
    var root = demoRoot(host);
    var longVersion = false;
    var panel;
    var state = status('');

    function bodyNode() {
      var box = document.createElement('div');
      box.appendChild(styled('p', 'margin:0 0 8px', longVersion
        ? '面板只负责局部表面、边界和内容组合，不安装整页主题。长内容会在这个局部面板内自然增长；如果外部空间有限，由宿主决定是否使用局部滚动。'
        : '面板把标题、说明、主体、操作和页脚组合在一个局部范围内。'));
      box.appendChild(styled('p', 'margin:0', longVersion
        ? 'A longer English paragraph checks wrapping and mixed-language readability inside the local panel. The surrounding note still owns page-level headings, spacing, and outer distance.'
        : '切换 tone、内边距或边框时，只改变这个局部表面的表达。'));
      return box;
    }

    function actionNodes() {
      var wrap = row('justify-content:flex-end');
      wrap.appendChild(button('换成长内容', function () {
        longVersion = !longVersion;
        panel.update({ content: bodyNode() });
        state.textContent = longVersion ? '已通过 update 替换主体内容；tone 与内边距保持。' : '已换回短内容。';
      }));
      wrap.appendChild(button('追加主体行', function () {
        panel.body.appendChild(styled('p', 'margin:8px 0 0;font-weight:600', '这是通过实例的 body 直接追加的一行。'));
        state.textContent = '内容已追加到公开的 body 节点。';
      }));
      return wrap;
    }

    panel = window.NoteUI.Panel.mount(root, {
      title: '局部说明面板',
      description: '标题、说明、主体、操作和页脚可以直接组合。',
      content: bodyNode(),
      actions: actionNodes(),
      footer: '页脚用于补充范围或来源；不内置整页主题。',
      tone: 'plain',
      padding: 'md',
      border: true
    });
    var padding = 'md';
    var tone = 'plain';
    var border = true;
    var bar = row();
    var toneButton = button('切换为 accent tone', function () {
      tone = tone === 'plain' ? 'accent' : (tone === 'accent' ? 'raised' : 'plain');
      panel.update({ tone: tone });
      toneButton.textContent = tone === 'plain' ? '切换为 accent tone' : (tone === 'accent' ? '切换为 raised tone' : '切换为 plain tone');
      updateState();
    });
    var paddingButton = button('内边距改为 none', function () {
      padding = padding === 'md' ? 'none' : 'md';
      panel.update({ padding: padding });
      paddingButton.textContent = padding === 'md' ? '内边距改为 none' : '内边距恢复 md';
      updateState();
    });
    var borderButton = button('关闭外边框', function () {
      border = !border;
      panel.update({ border: border });
      borderButton.textContent = border ? '关闭外边框' : '恢复外边框';
      updateState();
    });
    function updateState() {
      state.textContent = '当前 tone：' + tone + '；内边距：' + padding + '；边框：' + (border ? '有' : '无') + '。';
    }
    bar.appendChild(toneButton);
    bar.appendChild(paddingButton);
    bar.appendChild(borderButton);
    root.insertBefore(intro('局部面板组合标题、说明、主体、操作和页脚。tone 只修饰局部表面；body、header、footer 均可从实例访问。'), root.firstChild);
    root.insertBefore(bar, panel.el);
    root.insertBefore(state, panel.el);
    updateState();

    return {
      destroy: function () {
        panel.destroy();
        root.remove();
      }
    };
  };

  /* L06 */
  demo['L06'] = function (host) {
    var root = demoRoot(host);
    var hasLabel = true;
    var spacing = 'md';
    var horizontal = window.NoteUI.Divider.mount(root, { orientation: 'horizontal', label: '其他说明', spacing: 'md' });
    var splitRow = styled('div', 'display:flex;align-items:stretch;gap:0;box-sizing:border-box;width:100%;min-height:9rem;border:1px dashed var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-control,8px);background:var(--hnv-color-page,#f4f6f9);overflow:hidden');
    var left = styled('div', 'box-sizing:border-box;flex:1 1 0;min-width:0;padding:12px;overflow-wrap:anywhere', '左侧内容。纵向分隔利用父级高度或拉伸上下文，这里的演示行给了明确的最小高度。');
    splitRow.appendChild(left);
    var vertical = window.NoteUI.Divider.mount(splitRow, { orientation: 'vertical', label: '或', spacing: 'sm' });
    splitRow.appendChild(styled('div', 'box-sizing:border-box;flex:1 1 0;min-width:0;padding:12px;overflow-wrap:anywhere', '右侧内容。说明文字随分隔线保持语义和空间关系。'));
    var second = window.NoteUI.Divider.mount(root, { orientation: 'horizontal', label: '', spacing: 'md' });
    var state = status('当前横向分隔带说明，纵向分隔带“或”。');
    var bar = row();
    var labelButton = button('隐藏横向说明', function () {
      hasLabel = !hasLabel;
      horizontal.update({ label: hasLabel ? '其他说明' : '' });
      labelButton.textContent = hasLabel ? '隐藏横向说明' : '显示横向说明';
      state.textContent = hasLabel ? '当前横向分隔带说明。' : '当前横向分隔无说明，仍保留 role=separator 与方向。';
    });
    var spacingButton = button('间距改为 lg', function () {
      spacing = spacing === 'md' ? 'lg' : 'md';
      horizontal.update({ spacing: spacing });
      second.update({ spacing: spacing });
      spacingButton.textContent = spacing === 'md' ? '间距改为 lg' : '间距恢复 md';
      state.textContent = '当前分隔间距 ' + spacing + '（内部 padding，不添加根外边距）。';
    });
    bar.appendChild(labelButton);
    bar.appendChild(spacingButton);
    root.insertBefore(intro('分隔组件提供 role=separator 和方向；横向说明与纵向说明都直接可见。纵向分隔需要父级提供可用的高度或拉伸。'), root.firstChild);
    root.insertBefore(bar, horizontal.el);
    root.insertBefore(state, horizontal.el);
    root.appendChild(splitRow);

    return {
      destroy: function () {
        horizontal.destroy();
        vertical.destroy();
        second.destroy();
        root.remove();
      }
    };
  };

  /* L07 */
  demo['L07'] = function (host) {
    var root = demoRoot(host);
    var longVisible = true;
    var narrow = false;
    var state = status('内容超过最大高度，滚动区底部显示“下方还有内容”。');
    function longContent() {
      var box = document.createElement('div');
      var title = styled('div', 'font-size:var(--hnv-font-size-heading,20px);font-weight:650;line-height:1.4;margin-bottom:8px', '滚动区里的较长说明');
      box.appendChild(title);
      for (var index = 1; index <= 7; index += 1) {
        box.appendChild(styled('p', 'margin:0 0 ' + (index === 7 ? '0' : '10px') + ';overflow-wrap:anywhere',
          '第 ' + index + ' 段：滚动由浏览器原生处理，没有拦截滚轮或触摸事件。滚动时边缘提示会更新；键盘聚焦后可用方向键、PageDown 等原生方式滚动。Long English words such as overflow-indicator are allowed to wrap inside the local area.'));
      }
      return box;
    }
    function shortContent() {
      return styled('p', 'margin:0', '短内容不产生溢出时，上方和下方的“还有内容”提示都不显示，但滚动区仍然可以被键盘聚焦。');
    }
    var frame = styled('div', 'box-sizing:border-box;width:100%;max-width:44rem;min-width:0;padding:6px;border:1px dashed var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-control,8px);background:var(--hnv-color-page,#f4f6f9)');
    var scroll = window.NoteUI.ScrollArea.mount(frame, {
      maxHeight: '13rem',
      content: longContent(),
      label: '滚动区演示：较长操作说明',
      hints: true
    });
    root.appendChild(intro('滚动区限制局部高度并保留原生滚动。底部“下方还有内容”会随滚动消失/出现；滚轮和触摸链不被拦截。'));
    var bar = row();
    var bottomButton = button('滚到底部', function () {
      scroll.viewport.scrollTo({ top: scroll.viewport.scrollHeight, behavior: 'auto' });
      state.textContent = '已滚到底部：顶部提示应出现，底部提示隐藏。';
    });
    var topButton = button('回到顶部', function () {
      scroll.viewport.scrollTo({ top: 0, behavior: 'auto' });
      state.textContent = '已回到顶部：底部提示应出现，顶部提示隐藏。';
    });
    var contentButton = button('换成短内容', function () {
      longVisible = !longVisible;
      scroll.update({ content: longVisible ? longContent() : shortContent() });
      contentButton.textContent = longVisible ? '换成短内容' : '恢复长内容';
      state.textContent = longVisible ? '内容再次超过最大高度，滚动提示会出现。' : '短内容没有溢出，滚动提示隐藏。';
    });
    var widthButton = button('缩小容器', function () {
      narrow = !narrow;
      frame.style.maxWidth = narrow ? '22rem' : '44rem';
      widthButton.textContent = narrow ? '恢复容器' : '缩小容器';
      state.textContent = narrow ? '当前为窄容器，内容仍由原生局部滚动承载。' : '当前为较宽容器。';
    });
    var focusButton = button('聚焦滚动区', function () {
      scroll.focus();
      state.textContent = '滚动区已获得焦点，可使用方向键、PageUp/PageDown、Home/End 滚动。';
    });
    bar.appendChild(bottomButton);
    bar.appendChild(topButton);
    bar.appendChild(contentButton);
    bar.appendChild(widthButton);
    bar.appendChild(focusButton);
    root.appendChild(bar);
    root.appendChild(state);
    root.appendChild(frame);

    return {
      destroy: function () {
        scroll.destroy();
        root.remove();
      }
    };
  };

  /* L08 */
  demo['L08'] = function (host) {
    var root = demoRoot(host);
    var narrow = false;
    var state = status('当前比例 50% / 50%。拖动分隔条或在聚焦后使用方向键调整。');
    var startPanel = styled('div', 'box-sizing:border-box;min-height:100%;padding:14px;overflow-wrap:anywhere');
    startPanel.appendChild(styled('div', 'font-size:var(--hnv-font-size-heading,20px);font-weight:650;line-height:1.4;margin-bottom:8px', '起始区域'));
    startPanel.appendChild(styled('p', 'margin:0 0 10px', '这里的文字属于宿主内容。分栏保存的是起始区域比例；拖动时按当前可用空间换算成像素，并受最小尺寸约束。'));
    startPanel.appendChild(styled('p', 'margin:0', 'Longer English content demonstrates wrapping and a local pane scrollbar when vertical space is limited.'));
    var endPanel = styled('div', 'box-sizing:border-box;min-height:100%;padding:14px;overflow-wrap:anywhere');
    endPanel.appendChild(styled('div', 'font-size:var(--hnv-font-size-heading,20px);font-weight:650;line-height:1.4;margin-bottom:8px', '结束区域'));
    var list = styled('div', 'display:flex;flex-direction:column;gap:6px');
    ['内容随比例调整。', '键盘 Home / End 到达当前允许的边界。', '窗口较窄时默认自动转为上下分栏。'].forEach(function (value) {
      list.appendChild(styled('div', 'padding:7px 9px;border:var(--hnv-border-width,1px) solid var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-control,8px);background:var(--hnv-color-page,#f4f6f9)', value));
    });
    endPanel.appendChild(list);
    var frame = styled('div', 'box-sizing:border-box;width:100%;max-width:100%;min-width:0;padding:6px;border:1px dashed var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-control,8px);background:var(--hnv-color-page,#f4f6f9)');
    var split = window.NoteUI.SplitPane.mount(frame, {
      start: startPanel,
      end: endPanel,
      orientation: 'auto',
      ratio: 0.5,
      minStart: 120,
      minEnd: 120,
      stackBelow: 560,
      label: '调整起始区域与结束区域的比例；可拖动或使用方向键',
      startLabel: '起始区域',
      endLabel: '结束区域',
      onChange: function (ratio) {
        var percent = Math.round(ratio * 100);
        state.textContent = '用户调整：' + percent + '% / ' + (100 - percent) + '%。';
      }
    });
    function programRatio(ratio) {
      split.update({ ratio: ratio });
      var actual = Math.round(split.getValue() * 100);
      state.textContent = '程序 update 将比例设为 ' + actual + '% / ' + (100 - actual) + '%（未触发 onChange）。';
    }
    root.appendChild(intro('可拖动分栏：拖动中间分隔条，或先聚焦分隔条再用左右/上下方向键调整，Shift+方向键步进更大，Home/End 到当前边界。宿主较窄时（默认 560px 以下）自动转为上下分栏。'));
    var bar = row();
    var thirtyButton = button('设为 30 / 70', function () { programRatio(0.3); });
    var halfButton = button('设为 50 / 50', function () { programRatio(0.5); });
    var focusButton = button('聚焦分隔条', function () {
      split.separator.focus();
      state.textContent = '分隔条已聚焦；使用方向键调整，Home/End 到边界。';
    });
    var widthButton = button('缩小容器（自动纵向）', function () {
      narrow = !narrow;
      frame.style.maxWidth = narrow ? '480px' : '100%';
      widthButton.textContent = narrow ? '恢复宽容器' : '缩小容器（自动纵向）';
      state.textContent = narrow ? '容器已缩窄到 480px，组件会自动转为上下分栏并进入默认纵向高度。' : '容器恢复较宽，组件回到左右分栏。';
    });
    bar.appendChild(thirtyButton);
    bar.appendChild(halfButton);
    bar.appendChild(focusButton);
    bar.appendChild(widthButton);
    root.appendChild(bar);
    root.appendChild(state);
    root.appendChild(frame);

    return {
      destroy: function () {
        split.destroy();
        root.remove();
      }
    };
  };
})();
