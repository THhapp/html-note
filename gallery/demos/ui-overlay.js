(function () {
  'use strict';
  var demos = window.NoteGalleryDemos = window.NoteGalleryDemos || {};

  function make(tag, className, textValue) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (textValue != null) node.textContent = textValue;
    return node;
  }

  function note(textValue) {
    return make('p', 'nui-overlay-demo__note', textValue);
  }

  function cleanup(wrap, components, buttons, timers) {
    return function () {
      components.slice().reverse().forEach(function (component) {
        try { component.destroy(); } catch (error) { /* demo cleanup must continue */ }
      });
      buttons.forEach(function (button) {
        try { button.destroy(); } catch (error) { /* ignore */ }
      });
      var floating = window.NoteCore && window.NoteCore.floating;
      if (floating && typeof floating.closeAll === 'function') floating.closeAll();
      if (timers) {
        timers.forEach(function (timer) { window.clearTimeout(timer); });
        timers.length = 0;
      }
      wrap.remove();
    };
  }

  function demoButtons(wrap) {
    var list = [];
    function button(container, label, onClick, variant) {
      var instance;
      if (window.NoteUI && window.NoteUI.Button && typeof window.NoteUI.Button.mount === 'function') {
        instance = window.NoteUI.Button.mount(container, {
          label: label,
          variant: variant || 'secondary',
          onClick: onClick
        });
      } else {
        var el = make('button', 'nui-overlay-demo__button' + (variant === 'primary' ? ' nui-overlay-demo__button--primary' : ''), label);
        el.type = 'button';
        el.addEventListener('click', onClick);
        container.appendChild(el);
        instance = {
          el: el,
          destroy: function () {
            el.removeEventListener('click', onClick);
            el.remove();
          }
        };
      }
      list.push(instance);
      return instance;
    }
    return { button: button, list: list };
  }

  /* ------------------------------------------------------------------ O01 */

  demos['O01'] = function (host) {
    var wrap = make('div', 'nui-overlay-demo');
    var components = [];
    var controls = demoButtons(wrap);
    var row = make('div', 'nui-overlay-demo__row');
    var status = make('p', 'nui-overlay-demo__status', '悬停或键盘聚焦触发器查看辅助说明。');

    var external = make('button', 'nui-overlay-demo__anchor', '账户安全性');
    external.type = 'button';
    row.appendChild(external);

    var counter = 0;
    var externalTip = window.NoteUI.Tooltip.mount(row, {
      anchor: external,
      content: '辅助信息：仅说明“账户安全性”检查什么，不承载必要步骤。',
      placement: 'top',
      delay: 120,
      onShow: function () {
        status.textContent = '轻提示已显示（悬停或键盘聚焦触发）。';
      },
      onHide: function (reason) {
        status.textContent = '轻提示已关闭，reason=' + reason + '；焦点/悬停状态由 NoteCore.floating 处理。';
      }
    });
    components.push(externalTip);

    var createdTip = window.NoteUI.Tooltip.mount(row, {
      label: '导出格式',
      content: 'CSV 是纯文本表格；此处只是补充说明，格式选择规则应在正文写清。',
      placement: 'bottom',
      delay: 120
    });
    components.push(createdTip);

    var disabledTip = window.NoteUI.Tooltip.mount(row, {
      label: '禁用示例',
      content: '这条内容不应出现。',
      disabled: true
    });
    components.push(disabledTip);

    controls.button(row, '换一条提示', function () {
      counter += 1;
      externalTip.update({
        content: '更新后的辅助说明（第 ' + counter + ' 次）。重要解释仍放在正文，不依赖悬停。'
      });
      status.textContent = '已通过 update() 更新说明文本。';
    });

    wrap.appendChild(note('说明：Esc、滚动、点击外部、失焦或移出触发器会关闭轻提示；禁用时不显示。'));
    wrap.appendChild(row);
    wrap.appendChild(status);
    host.appendChild(wrap);

    return { destroy: cleanup(wrap, components, controls.list) };
  };

  /* ------------------------------------------------------------------ O02 */

  demos['O02'] = function (host) {
    var wrap = make('div', 'nui-overlay-demo');
    var components = [];
    var timers = [];
    var controls = demoButtons(wrap);
    var status = make('p', 'nui-overlay-demo__status', '点击触发器打开弹出说明；Esc 关闭后焦点返回触发器。');

    var row = make('div', 'nui-overlay-demo__row');
    var content = make('div', 'nui-overlay-demo__popover-content');

    var field = make('label', 'nui-overlay-demo__field');
    field.appendChild(make('span', '', '关键字'));
    var input = make('input');
    input.type = 'text';
    input.placeholder = '例如：季度报告';
    field.appendChild(input);
    content.appendChild(field);

    var selectField = make('label', 'nui-overlay-demo__field');
    selectField.appendChild(make('span', '', '类型'));
    var select = make('select');
    ['全部', '笔记', '附件'].forEach(function (label) {
      var option = make('option', '', label);
      option.value = label;
      select.appendChild(option);
    });
    selectField.appendChild(select);
    content.appendChild(selectField);

    var contentRow = make('div', 'nui-overlay-demo__row');
    var helpButton = make('button', 'nui-overlay-demo__button', '更多帮助');
    helpButton.type = 'button';
    contentRow.appendChild(helpButton);
    content.appendChild(contentRow);

    var child = null;
    var parent = window.NoteUI.Popover.mount(row, {
      triggerLabel: '筛选条件',
      label: '筛选条件',
      content: content,
      placement: 'bottom-start',
      onOpen: function () {
        status.textContent = '弹出说明已打开；内容中的输入框与按钮可直接操作。';
      },
      onClose: function (reason) {
        if (child && child.isOpen()) child.close('api');
        timers.push(window.setTimeout(function () {
          if (!status.isConnected) return;
          var returned = document.activeElement === parent.getTrigger();
          status.textContent = '关闭 reason=' + reason + '；焦点' + (returned ? '已返回触发器。' : '在触发点外（外部点击目标可能获得焦点）。');
        }, 0));
      }
    });
    components.push(parent);

    controls.button(contentRow, '应用', function () {
      parent.close('api');
      status.textContent = '已应用筛选：' + (input.value || '（空关键字）') + ' / ' + select.value + '。';
    }, 'primary');

    child = window.NoteUI.Popover.mount(content, {
      anchor: helpButton,
      label: '更多帮助',
      content: '子层说明：在子层按 Esc 只关闭这一层，父层保持打开；关闭后焦点回到“更多帮助”。',
      placement: 'right-start'
    });
    components.push(child);

    controls.button(row, '程序打开', function () {
      parent.open();
      status.textContent = '已通过 open() 打开（不移动焦点）。';
    });

    controls.button(row, '程序关闭', function () {
      parent.close('api');
      status.textContent = '已通过 close("api") 关闭并恢复焦点。';
    });

    wrap.appendChild(note('说明：Popover 由点击打开，内容可交互；重要解释仍应在正文可见，不只藏在弹层里。'));
    wrap.appendChild(row);
    wrap.appendChild(status);
    host.appendChild(wrap);

    return { destroy: cleanup(wrap, components, controls.list, timers) };
  };

  /* ------------------------------------------------------------------ O03 */

  demos['O03'] = function (host) {
    var wrap = make('div', 'nui-overlay-demo');
    var components = [];
    var controls = demoButtons(wrap);
    var status = make('p', 'nui-overlay-demo__status', '打开对话框后，Tab 在内部循环；Esc 关闭并返回打开按钮。');

    function buildContent(updated) {
      var body = make('div');
      body.appendChild(note(updated
        ? '更新后的内容：说明文字与表单都可以替换。'
        : '对话框内容可以是文字、表单和按钮；这里用原生控件演示可交互内容。'));
      var field = make('label', 'nui-overlay-demo__field');
      field.appendChild(make('span', '', '提醒方式'));
      var select = make('select');
      ['仅重要提醒', '全部提醒', '关闭提醒'].forEach(function (label) {
        var option = make('option', '', label);
        option.value = label;
        select.appendChild(option);
      });
      field.appendChild(select);
      body.appendChild(field);
      return body;
    }

    var dialog = window.NoteUI.Dialog.mount(wrap, {
      title: '通知设置',
      content: buildContent(false),
      size: 'md',
      modal: true,
      closeOnOutside: false,
      closeOnEsc: true,
      actions: [
        { label: '取消', close: true },
        {
          label: '保存设置',
          variant: 'primary',
          close: true,
          onClick: function () {
            status.textContent = '已保存设置；对话框关闭后焦点返回“打开对话框”。';
          }
        }
      ],
      onClose: function (reason) {
        status.textContent = '对话框关闭，reason=' + reason + '。';
      }
    });
    components.push(dialog);

    var row = make('div', 'nui-overlay-demo__row');
    controls.button(row, '打开对话框', function () {
      dialog.open();
    }, 'primary');

    var updated = false;
    controls.button(row, '更换内容', function () {
      updated = !updated;
      dialog.update({
        title: updated ? '通知设置（已更新）' : '通知设置',
        content: buildContent(updated)
      });
      status.textContent = 'update() 已替换标题和内容；不会触发 onClose。';
    });

    controls.button(row, '打开确认框', function () {
      status.textContent = '确认框打开中：确认返回 true，取消/Esc 返回 false。';
      window.NoteUI.Dialog.confirm({
        title: '删除这条草稿？',
        content: '确认框是 Dialog 的变体。确认后 Promise 解析为 true；取消或 Esc 为 false，并恢复焦点。',
        confirmLabel: '删除',
        cancelLabel: '保留',
        tone: 'danger',
        onConfirm: function () {
          return true;
        }
      }).then(function (ok) {
        if (!status.isConnected) return;
        status.textContent = '确认框结果：' + ok + '；焦点已返回打开“确认框”的按钮。';
      });
    });

    wrap.appendChild(note('说明：模态对话框默认焦点陷阱、背景遮罩和正文滚动锁；确认框复用同一浮层内核。'));
    wrap.appendChild(row);
    wrap.appendChild(status);
    host.appendChild(wrap);

    return { destroy: cleanup(wrap, components, controls.list) };
  };

  /* ------------------------------------------------------------------ O04 */

  demos['O04'] = function (host) {
    var wrap = make('div', 'nui-overlay-demo');
    var components = [];
    var timers = [];
    var controls = demoButtons(wrap);
    var status = make('p', 'nui-overlay-demo__status', '抽屉打开时背景滚动锁定；关闭后恢复原滚动状态。');

    function longContent(prefix) {
      var body = make('div');
      body.appendChild(note(prefix + '：内容区独立滚动，标题与操作固定。'));
      for (var i = 1; i <= 8; i++) {
        body.appendChild(make('p', 'nui-overlay-demo__long',
          '第 ' + i + ' 段。抽屉用于容纳较长的局部内容；必要说明在这里直接可读，不依赖悬停。窄窗口时抽屉接近全宽，仍保留标题和操作。'));
      }
      return body;
    }

    function scrollState() {
      return document.body.style.overflow || '(默认)';
    }

    var right = window.NoteUI.Drawer.mount(wrap, {
      side: 'right',
      title: '右侧抽屉',
      content: longContent('右侧内容'),
      footer: '页脚说明：打开期间正文滚动由浮层基础锁定，关闭后恢复。',
      size: 420,
      actions: [
        { label: '取消', close: true },
        {
          label: '应用',
          variant: 'primary',
          close: true,
          onClick: function () {
            status.textContent = '右侧抽屉已应用。';
          }
        }
      ],
      onClose: function (reason) {
        timers.push(window.setTimeout(function () {
          if (!status.isConnected) return;
          status.textContent = '右侧抽屉关闭 reason=' + reason + '；body overflow=' + scrollState() + '。';
        }, 0));
      }
    });
    components.push(right);

    var left = window.NoteUI.Drawer.mount(wrap, {
      side: 'left',
      title: '左侧抽屉',
      content: longContent('左侧内容'),
      footer: '左侧抽屉同样复用 NoteCore.floating 的遮罩、焦点陷阱与滚动锁。',
      size: 380,
      closeOnOutside: true,
      actions: [
        { label: '关闭', close: true }
      ],
      onClose: function (reason) {
        timers.push(window.setTimeout(function () {
          if (!status.isConnected) return;
          status.textContent = '左侧抽屉关闭 reason=' + reason + '；body overflow=' + scrollState() + '。';
        }, 0));
      }
    });
    components.push(left);

    var row = make('div', 'nui-overlay-demo__row');
    controls.button(row, '打开右侧抽屉', function () {
      if (left.isOpen()) left.close('api');
      right.open();
      status.textContent = '右侧抽屉打开中，body overflow=' + scrollState() + '。';
    }, 'primary');

    controls.button(row, '打开左侧抽屉', function () {
      if (right.isOpen()) right.close('api');
      left.open();
      status.textContent = '左侧抽屉打开中；它允许点击外部关闭（演示策略差异）。';
    });

    wrap.appendChild(note('说明：右侧抽屉默认不响应外点关闭；左侧示例开启 closeOnOutside。Esc 都会关闭并返回触发按钮。'));
    wrap.appendChild(row);
    wrap.appendChild(status);
    host.appendChild(wrap);

    return { destroy: cleanup(wrap, components, controls.list, timers) };
  };
})();
