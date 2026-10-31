/* NoteUI 通用库扩展 · gallery demos X01–X07.
 * Each demo mounts the real public component and returns { destroy }.
 * No network, no static screenshots, no hand-built look-alike widgets. */
(function () {
  'use strict';
  var demos = window.NoteGalleryDemos = window.NoteGalleryDemos || {};

  function make(tag, className, textValue) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (textValue != null) node.textContent = textValue;
    return node;
  }

  function note(textValue, className) {
    return make('p', 'nui-extended-demo__note' + (className ? ' ' + className : ''), textValue);
  }

  function statusLine(textValue) {
    var node = make('p', 'nui-extended-demo__status', textValue);
    node.setAttribute('aria-live', 'polite');
    return node;
  }

  function block(title, description) {
    var box = make('section', 'nui-extended-demo__block');
    var head = make('div', 'nui-extended-demo__block-head');
    var heading = make('h3', 'nui-extended-demo__title', title);
    head.appendChild(heading);
    if (description) head.appendChild(note(description));
    box.appendChild(head);
    return box;
  }

  function row() {
    return make('div', 'nui-extended-demo__row');
  }

  function toolbar() {
    return make('div', 'nui-extended-demo__toolbar');
  }

  function demoButton(parent, label, onClick, variant) {
    var button = make('button', 'nui-extended-demo__button' +
      (variant === 'primary' ? ' nui-extended-demo__button--primary' : ''), label);
    button.type = 'button';
    parent.appendChild(button);
    return { el: button, handler: onClick, onClick: onClick };
  }

  function bindButton(cleanup, button) {
    button.el.addEventListener('click', button.handler);
    cleanup.push(function () {
      button.el.removeEventListener('click', button.handler);
    });
    return button.el;
  }

  function demoRoot(host) {
    var wrap = make('div', 'nui-extended-demo');
    host.appendChild(wrap);
    return wrap;
  }

  function makeSvgAvatar(background, textColor, initials) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">' +
      '<rect width="96" height="96" fill="' + background + '"/>' +
      '<text x="48" y="58" text-anchor="middle" fill="' + textColor +
      '" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="34" font-weight="600">' +
      initials + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* ------------------------------------------------------------------ X01 */

  demos.X01 = function (host) {
    var wrap = demoRoot(host);
    var cleanup = [];
    var components = [];

    var intro = block('头像与对象缩略图',
      '图片加载失败时显示文字回退；组排列保留可读的完整名称。头像只表示宿主提供的身份，不绑定账户系统。');
    var singleRow = row();
    var validHost = make('div', 'nui-extended-demo__avatar-cell');
    var fallbackHost = make('div', 'nui-extended-demo__avatar-cell');
    var failedHost = make('div', 'nui-extended-demo__avatar-cell');
    validHost.appendChild(make('span', 'nui-extended-demo__state-label', '图片 + 替代文本'));
    fallbackHost.appendChild(make('span', 'nui-extended-demo__state-label', '纯文字回退'));
    failedHost.appendChild(make('span', 'nui-extended-demo__state-label', '图片失败回退'));
    singleRow.append(validHost, fallbackHost, failedHost);
    intro.appendChild(singleRow);

    var valid = window.NoteUI.Avatar.mount(validHost, {
      src: makeSvgAvatar('#315cda', '#ffffff', 'AL'),
      alt: 'Ada Lovelace 的示例头像',
      name: 'Ada Lovelace',
      size: 'lg',
      tone: 'accent',
      caption: 'Ada Lovelace'
    });
    var fallback = window.NoteUI.Avatar.mount(fallbackHost, {
      name: 'Katherine Johnson',
      initials: 'KJ',
      size: 'lg',
      tone: 'sage',
      caption: 'Katherine Johnson · 很长的轨道计算成员说明'
    });
    var failed = window.NoteUI.Avatar.mount(failedHost, {
      src: 'data:image/png;base64,AAAA',
      name: '加载失败的成员',
      initials: 'LM',
      size: 'lg',
      tone: 'rose',
      caption: '加载失败 → 文字回退'
    });
    components.push(valid, fallback, failed);
    intro.appendChild(note('长名称在可见说明中截断，完整名称仍保留在图片替代文本或文字回退的可访问名称中。'));

    var groupBlock = block('组排列与 +N',
      'max 为实际显示的头像数；超出部分以 +N 表示，并在组名称中说明总数。');
    var groupHost = make('div', 'nui-extended-demo__avatar-cell');
    var group = window.NoteUI.Avatar.mount(groupHost, {
      groupLabel: '本次协作成员',
      max: 3,
      size: 'md',
      items: [
        { name: 'Ada Lovelace', tone: 'accent' },
        { name: 'Grace Hopper', tone: 'sage' },
        { name: 'Alan Turing', tone: 'sky' },
        { name: 'Katherine Johnson', tone: 'amber' },
        { name: 'Edsger Dijkstra', tone: 'rose' }
      ]
    });
    components.push(group);
    groupBlock.appendChild(groupHost);
    groupBlock.appendChild(note('组排列本身不可交互，也不会把颜色当成成员状态。'));

    var controlBlock = block('可替换内容', '以下按钮只调用 update()，不会触发用户事件。');
    var controls = toolbar();
    var status = statusLine('当前显示图片头像与文字回退示例。');
    var useText = demoButton(controls, '把第一位切换为文字头像', function () {
      valid.update({
        src: '',
        alt: 'Ada Lovelace 的文字头像',
        name: 'Ada Lovelace',
        initials: 'AL',
        caption: 'Ada Lovelace · 文字回退'
      });
      status.textContent = '已通过 update() 切换为文字回退；程序更新不触发 onChange。';
    });
    var useImage = demoButton(controls, '恢复图片头像', function () {
      valid.update({
        src: makeSvgAvatar('#315cda', '#ffffff', 'AL'),
        alt: 'Ada Lovelace 的示例头像',
        name: 'Ada Lovelace',
        caption: 'Ada Lovelace'
      });
      status.textContent = '已恢复图片头像；失败图片仍会显示文字回退。';
    });
    var changeGroup = demoButton(controls, '换一组协作成员', function () {
      group.update({
        groupLabel: '另一组协作者',
        items: [
          { name: 'Margaret Hamilton', tone: 'sky' },
          { name: 'Barbara Liskov', tone: 'sage' },
          { name: 'Annie Easley', tone: 'amber' },
          { name: 'Frances Allen', tone: 'accent' }
        ]
      });
      status.textContent = '已更新组成员；max 仍为 3，因此显示 3 个头像和 +1。';
    });
    bindButton(cleanup, useText);
    bindButton(cleanup, useImage);
    bindButton(cleanup, changeGroup);
    controlBlock.append(controls, status);

    wrap.append(intro, groupBlock, controlBlock);
    return {
      destroy: function () {
        cleanup.forEach(function (fn) { try { fn(); } catch (error) {} });
        components.slice().reverse().forEach(function (component) {
          try { component.destroy(); } catch (error) {}
        });
        wrap.remove();
      }
    };
  };

  /* ------------------------------------------------------------------ X02 */

  demos.X02 = function (host) {
    var wrap = demoRoot(host);
    var cleanup = [];
    var components = [];

    var intro = block('手动内容轮播',
      '默认不自动播放。使用轮播底部的上一张/下一张、圆点，或聚焦轮播后使用 ← → / Home / End。');
    var status = statusLine('当前位置 1 / 3；自动播放关闭（默认）。');
    var carouselHost = make('div');
    intro.appendChild(carouselHost);

    function makeSlide(title, description, extra) {
      var slide = make('div', 'nui-extended-demo__slide');
      slide.appendChild(make('h4', 'nui-extended-demo__slide-title', title));
      slide.appendChild(make('p', 'nui-extended-demo__slide-text', description));
      if (extra === 'button') {
        var button = make('button', 'nui-extended-demo__slide-button', '第二页的可聚焦内容按钮');
        button.type = 'button';
        var slideClick = function () {
          status.textContent = '第二页中的普通按钮被激活；隐藏页内容不可 Tab 到。';
        };
        button.addEventListener('click', slideClick);
        cleanup.push(function () { button.removeEventListener('click', slideClick); });
        slide.appendChild(button);
      } else if (extra === 'long') {
        slide.appendChild(note('窄容器里长文本自然换行，控制和当前页读数仍然保持可读。Automatic rotation stays off by default.'));
      }
      return slide;
    }

    var originalSlides = [
      { label: '手动浏览', content: makeSlide('默认手动浏览', '没有计时器推进；读者主动切换内容。') },
      { label: '隐藏页焦点', content: makeSlide('非当前页不可聚焦', '隐藏页使用 inert 与 aria-hidden；内容不会进入 Tab 顺序。', 'button') },
      { label: '窄容器', content: makeSlide('窄容器与长文本', '当前页和总页数始终可见；内容换行不撑破容器。', 'long') }
    ];
    var replacementSlides = [
      { label: '替换页一', content: makeSlide('替换后的第一页', '宿主可以通过 update({ items }) 更换轮播内容。') },
      { label: '替换页二', content: makeSlide('替换后的第二页', '程序更新不触发 onChange；演示状态由按钮单独说明。') }
    ];
    var carousel = window.NoteUI.Carousel.mount(carouselHost, {
      items: originalSlides,
      auto: false,
      label: '手动内容轮播示例',
      onChange: function (index) {
        status.textContent = '手动切换到第 ' + (index + 1) + ' 张；自动播放仍然关闭。';
      }
    });
    components.push(carousel);
    // Correct initial wording after mount; getValue is used by the demo status only.
    var controls = toolbar();
    var replace = demoButton(controls, '替换轮播内容', function () {
      carousel.update({ items: replacementSlides, index: 0 });
      status.textContent = '已通过 update() 替换为 2 张内容；位置归零，不触发 onChange。';
    });
    bindButton(cleanup, replace);
    intro.append(carouselHost, note('切换按钮和圆点都是真实控件；未显示的页面不可聚焦。'), controls, status);

    wrap.appendChild(intro);
    return {
      destroy: function () {
        cleanup.forEach(function (fn) { try { fn(); } catch (error) {} });
        components.slice().reverse().forEach(function (component) {
          try { component.destroy(); } catch (error) {}
        });
        wrap.remove();
      }
    };
  };

  /* ------------------------------------------------------------------ X03 */

  demos.X03 = function (host) {
    var wrap = demoRoot(host);
    var cleanup = [];
    var components = [];

    var interactiveBlock = block('可编辑评分',
      '宿主输入一个本地数值。点击星星选择；再次点击当前值清空为 0。键盘使用 ← → / ↑ ↓ / Home / End。');
    var rowOne = row();
    var interactiveHost = make('div');
    rowOne.appendChild(interactiveHost);
    var status = statusLine('当前值：3 / 5。');
    var interactive = window.NoteUI.Rating.mount(interactiveHost, {
      value: 3,
      label: '演示评分',
      onChange: function (value) {
        status.textContent = value === 0 ?
          '已清空为 0（allowClear 默认开启）；这是宿主值，不包含评价业务。' :
          '评分值变为 ' + value + ' / 5；事件来自用户操作。';
      }
    });
    components.push(interactive);
    interactiveBlock.append(rowOne, note('星星同时用实心/空心形状和文字数值表达，不只依赖颜色。'));
    interactiveBlock.appendChild(status);

    var readonlyBlock = block('只读评分',
      '只读实例仍提供可读的滑块语义，但键盘和点击都不会修改值。');
    var readonlyRow = row();
    var readonlyHost = make('div');
    readonlyRow.appendChild(readonlyHost);
    var readonly = window.NoteUI.Rating.mount(readonlyHost, {
      value: 4,
      max: 5,
      readonly: true,
      label: '只读示例'
    });
    components.push(readonly);
    readonlyBlock.appendChild(readonlyRow);

    var controlBlock = block('可替换值', '这些按钮调用 update()，不触发 onChange。');
    var controls = toolbar();
    var setTwo = demoButton(controls, '设为 2 星（程序更新）', function () {
      interactive.update({ value: 2 });
      status.textContent = '已通过 update() 设为 2 星；程序更新不触发 onChange。';
    });
    var clear = demoButton(controls, '清空为 0（程序更新）', function () {
      interactive.update({ value: 0 });
      status.textContent = '已通过 update() 清空；若要演示 allowClear 点击清空，请再次点击当前星值。';
    });
    bindButton(cleanup, setTwo);
    bindButton(cleanup, clear);
    controlBlock.append(controls);

    wrap.append(interactiveBlock, readonlyBlock, controlBlock);
    return {
      destroy: function () {
        cleanup.forEach(function (fn) { try { fn(); } catch (error) {} });
        components.slice().reverse().forEach(function (component) {
          try { component.destroy(); } catch (error) {}
        });
        wrap.remove();
      }
    };
  };

  /* ------------------------------------------------------------------ X04 */

  demos.X04 = function (host) {
    var wrap = demoRoot(host);
    var cleanup = [];
    var components = [];

    var data = [
      {
        value: 'tech', label: '技术文档', children: [
          {
            value: 'frontend', label: '前端', children: [
              { value: 'html', label: 'HTML' },
              { value: 'css', label: 'CSS' },
              { value: 'legacy', label: '旧版本（禁选）', disabled: true }
            ]
          },
          {
            value: 'tools', label: '工具链', children: [
              { value: 'build', label: '构建' },
              { value: 'lint', label: '静态检查' }
            ]
          }
        ]
      },
      {
        value: 'design', label: '设计', children: [
          { value: 'type', label: '排版', children: [{ value: 'font', label: '字体' }] }
        ]
      }
    ];

    var intro = block('本地级联选择',
      '层级来自宿主数组，没有异步加载。展开 技术文档 → 前端 可看到禁用节点；路径摘要始终可见。');
    var cascaderHost = make('div', 'nui-extended-demo__control-line');
    var status = statusLine('当前路径：技术文档 / 工具链 / 构建。');
    var cascader = window.NoteUI.Cascader.mount(cascaderHost, {
      options: data,
      value: ['tech', 'tools', 'build'],
      label: '内容分类',
      placeholder: '请选择内容分类',
      onChange: function (values, nodes) {
        var path = nodes.map(function (node) { return node.label; }).join(' / ');
        status.textContent = values.length ? 'onChange：' + path + '（' + values.length + ' 级）。' : '已清空级联选择。';
      }
    });
    components.push(cascader);
    intro.appendChild(cascaderHost);
    intro.appendChild(note('打开后使用 ↑ ↓ / ← → / Home / End 导航，Enter 选择，Esc 关闭并把焦点返回触发按钮。'));

    var controlBlock = block('可替换路径', '程序更新会更新路径摘要，但不会调用 onChange。');
    var controls = toolbar();
    var setDesign = demoButton(controls, '设为设计 / 排版 / 字体', function () {
      cascader.update({ value: ['design', 'type', 'font'] });
      status.textContent = '已通过 update() 设为 设计 / 排版 / 字体；程序更新不触发 onChange。';
    });
    var clearPath = demoButton(controls, '程序清空路径', function () {
      cascader.update({ value: [] });
      status.textContent = '已通过 update() 清空路径；演示 onChange 的清除请使用组件自带的 × 按钮。';
    });
    bindButton(cleanup, setDesign);
    bindButton(cleanup, clearPath);
    controlBlock.append(controls);
    controlBlock.appendChild(note('组件自身带有清空按钮；禁用节点不能被选中。'));

    wrap.append(intro, controlBlock);
    return {
      destroy: function () {
        cleanup.forEach(function (fn) { try { fn(); } catch (error) {} });
        components.slice().reverse().forEach(function (component) {
          try { component.destroy(); } catch (error) {}
        });
        wrap.remove();
      }
    };
  };

  /* ------------------------------------------------------------------ X05 */

  demos.X05 = function (host) {
    var wrap = demoRoot(host);
    var cleanup = [];
    var components = [];

    var nodes = [
      {
        id: 'tech', label: '技术', children: [
          { id: 'front', label: '前端', children: [
            { id: 'html', label: 'HTML' },
            { id: 'css', label: 'CSS' }
          ] },
          { id: 'tools', label: '工具链', children: [
            { id: 'build', label: '构建' },
            { id: 'lint', label: '静态检查' }
          ] }
        ]
      },
      {
        id: 'design', label: '设计', children: [
          { id: 'type', label: '排版' },
          { id: 'color', label: '色彩' }
        ]
      },
      { id: 'locked', label: '未开放分类', disabled: true }
    ];

    var intro = block('树形多选',
      '弹出面板使用真实的 NoteUI.TreeView（ui-navigation 模块），不是另写一套树。可选择多项，点击外部或按 Esc 完成。');
    var treeHost = make('div', 'nui-extended-demo__control-line');
    var status = statusLine('当前选中：CSS。');
    var treeSelect = window.NoteUI.TreeSelect.mount(treeHost, {
      nodes: nodes,
      value: ['css'],
      expanded: ['tech', 'front'],
      multi: true,
      clearable: true,
      label: '内容标签',
      placeholder: '请选择内容标签',
      onChange: function (value, selectedNodes) {
        var labels = selectedNodes.map(function (node) { return node.label; });
        status.textContent = value.length ?
          'onChange：' + labels.join('、') + '（' + value.length + ' 项）。' :
          '已清空树形选择。';
      }
    });
    components.push(treeSelect);
    intro.appendChild(treeHost);
    intro.appendChild(note('组件依赖 core 与 ui-navigation；清空按钮在外层触发区右侧。'));

    var controlBlock = block('可替换选中值', '程序更新不会触发 onChange。');
    var controls = toolbar();
    var setDesign = demoButton(controls, '改为选中“排版”', function () {
      treeSelect.update({ value: ['type'], expanded: ['design'] });
      status.textContent = '已通过 update() 设为“排版”；程序更新不触发 onChange。';
    });
    var clear = demoButton(controls, '程序清空选择', function () {
      treeSelect.update({ value: [] });
      status.textContent = '已通过 update() 清空；组件自带清空按钮也会触发 onChange。';
    });
    bindButton(cleanup, setDesign);
    bindButton(cleanup, clear);
    controlBlock.append(controls);
    controlBlock.appendChild(note('多选时面板保持打开，便于连续选择；单选模式会在选择后自动关闭。'));

    wrap.append(intro, controlBlock);
    return {
      destroy: function () {
        cleanup.forEach(function (fn) { try { fn(); } catch (error) {} });
        components.slice().reverse().forEach(function (component) {
          try { component.destroy(); } catch (error) {}
        });
        wrap.remove();
      }
    };
  };

  /* ------------------------------------------------------------------ X06 */

  demos.X06 = function (host) {
    var wrap = demoRoot(host);
    var cleanup = [];
    var components = [];

    var initialSource = [
      { value: 'intro', label: '产品介绍' },
      { value: 'rules', label: '编辑规则' },
      { value: 'research', label: '调研记录' },
      { value: 'faq', label: '常见问题' },
      { value: 'archive', label: '归档材料（禁用）', disabled: true }
    ];
    var initialTarget = [
      { value: 'roadmap', label: '路线图' },
      { value: 'release', label: '发布说明' }
    ];

    var intro = block('穿梭选择',
      '勾选候选项后移到已选；两侧筛选互不影响。禁用项不能勾选。这里是选择控件，不是 NoteViz.Transfer 的对象传递演示。');
    var transferDisabled = false;
    var transferHost = make('div');
    var status = statusLine('两侧可独立筛选；移动后 onChange 会返回目标值和本次移动值。');
    var transfer = window.NoteUI.TransferList.mount(transferHost, {
      source: initialSource,
      target: initialTarget,
      titles: { source: '候选笔记', target: '已选笔记' },
      filterable: true,
      onChange: function (targetValues, moved) {
        status.textContent = 'onChange：目标值 [' + targetValues.join(', ') + ']；本次移动 [' + moved.join(', ') + ']。';
      }
    });
    components.push(transfer);
    intro.appendChild(transferHost);
    intro.appendChild(status);

    var controlBlock = block('可替换数据与禁用状态', 'update() 只更新状态，不触发 onChange。');
    var controls = toolbar();
    var reset = demoButton(controls, '恢复初始数据', function () {
      transferDisabled = false;
      transfer.update({ source: initialSource, target: initialTarget, disabled: false });
      toggleDisabled.el.textContent = '切换整体禁用';
      status.textContent = '已通过 update() 恢复两侧初始数据；筛选输入是本地演示状态。';
    });
    var toggleDisabled = demoButton(controls, '切换整体禁用', function (event) {
      transferDisabled = !transferDisabled;
      transfer.update({ disabled: transferDisabled });
      event.currentTarget.textContent = transferDisabled ? '恢复可操作' : '切换整体禁用';
      status.textContent = transferDisabled ? '整体禁用：筛选、勾选与移动均不可操作。' : '已恢复可操作。';
    });
    bindButton(cleanup, reset);
    bindButton(cleanup, toggleDisabled);
    controlBlock.append(controls);
    controlBlock.appendChild(note('整体禁用时仍有可见的“不可移动”标记与禁用按钮，不只依赖降低透明度。'));

    wrap.append(intro, controlBlock);
    return {
      destroy: function () {
        cleanup.forEach(function (fn) { try { fn(); } catch (error) {} });
        components.slice().reverse().forEach(function (component) {
          try { component.destroy(); } catch (error) {}
        });
        wrap.remove();
      }
    };
  };

  /* ------------------------------------------------------------------ X07 */

  demos.X07 = function (host) {
    var wrap = demoRoot(host);
    var cleanup = [];
    var components = [];
    var counter = 0;
    var lastRun = make('p', 'nui-extended-demo__run-result', '尚未执行命令。');

    var intro = block('本地命令面板',
      '只过滤宿主提供的本地命令，不发起网络搜索。点击按钮或按显式快捷键 Alt+K 打开；输入关键词可查看分组与无结果状态。');
    var controls = toolbar();
    var openButton = demoButton(controls, '打开命令面板（Alt+K）', function () {
      palette.open();
    }, 'primary');
    var replaceCommands = demoButton(controls, '替换本地命令（程序更新）', function () {
      palette.update({
        commands: [
          {
            id: 'updated',
            label: '更新后的本地命令',
            group: '更新',
            keywords: ['updated', '更新'],
            run: function () {
              statusText('已执行更新后的本地命令。');
            }
          }
        ]
      });
      lastRun.textContent = '已通过 update() 替换本地命令；未执行命令，也不触发回调。';
    });
    bindButton(cleanup, openButton);
    bindButton(cleanup, replaceCommands);
    intro.appendChild(controls);
    intro.appendChild(note('键盘：↑ ↓ 高亮，Home / End 跳到首尾，Enter 执行，Esc 关闭。命令上的快捷键仅作展示，不自动注册全局快捷键。'));
    intro.appendChild(lastRun);

    var palette = window.NoteUI.CommandPalette.mount(host, {
      label: '本地命令面板',
      placeholder: '输入命令、分组或关键词…',
      hotkey: 'Alt+K',
      commands: [
        {
          id: 'focus-note',
          label: '查看使用说明',
          group: '导航',
          keywords: ['help', '说明', 'doc'],
          shortcut: '?',
          run: function (command) {
            statusText('已执行：' + command.label + '。命令执行前已关闭面板。');
          }
        },
        {
          id: 'count',
          label: '记录一次本地操作',
          group: '演示',
          keywords: ['count', 'local', '记录'],
          shortcut: 'Ctrl+Enter',
          run: function () {
            counter += 1;
            statusText('已执行本地操作 ' + counter + ' 次；没有发送网络请求。');
          }
        },
        {
          id: 'reset',
          label: '重置本地记录',
          group: '演示',
          keywords: ['reset', '清空'],
          run: function () {
            counter = 0;
            statusText('本地记录已重置。');
          }
        },
        {
          id: 'view',
          label: '切换查看方式',
          group: '查看',
          keywords: ['view', 'display'],
          shortcut: 'V',
          run: function (command) {
            statusText('已执行：' + command.label + '；这里仅演示宿主命令回调。');
          }
        },
        {
          id: 'export',
          label: '导出（示例禁用）',
          group: '查看',
          keywords: ['export', 'disabled'],
          disabled: true,
          run: function () {
            statusText('禁用命令不应执行。');
          }
        }
      ]
    });
    components.push(palette);

    function statusText(message) {
      lastRun.textContent = message;
    }

    wrap.appendChild(intro);
    return {
      destroy: function () {
        cleanup.forEach(function (fn) { try { fn(); } catch (error) {} });
        components.slice().reverse().forEach(function (component) {
          try { component.destroy(); } catch (error) {}
        });
        wrap.remove();
      }
    };
  };
})();
