(function () {
  'use strict';

  var demo = window.NoteGalleryDemos = window.NoteGalleryDemos || {};
  var controlsStyle = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0;max-width:100%';
  var noteStyle = 'margin:0;color:var(--hnv-color-muted,#5c6879);font-size:var(--hnv-font-size-label,14px);line-height:var(--hnv-font-line-reading,1.65);overflow-wrap:anywhere';
  var boxStyle = 'display:flex;flex-direction:column;gap:10px;box-sizing:border-box;width:100%;max-width:100%;min-width:0;padding:12px 14px;border:var(--hnv-border-width,1px) solid var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-control,8px);background:var(--hnv-color-page,#f4f6f9)';

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

  function status(value) {
    var node = styled('p', noteStyle + ';min-height:1.6em', value || '');
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    return node;
  }

  function controls() {
    return styled('div', controlsStyle);
  }

  function button(label, onClick) {
    var node = styled('button', 'box-sizing:border-box;max-width:100%;min-height:34px;padding:7px 11px;border:var(--hnv-border-width,1px) solid var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-control,8px);background:var(--hnv-color-surface,#ffffff);color:var(--hnv-color-ink,#202938);font-family:inherit;font-size:var(--hnv-font-size-label,14px);font-weight:600;line-height:1.4;text-align:center;white-space:normal;overflow-wrap:anywhere;cursor:pointer', label);
    node.type = 'button';
    if (onClick) node.onclick = onClick;
    return node;
  }

  function sectionBox() {
    return styled('div', boxStyle);
  }

  function sectionLabel(value) {
    return styled('div', 'font-size:var(--hnv-font-size-label,14px);font-weight:650;line-height:1.5;color:var(--hnv-color-ink,#202938);overflow-wrap:anywhere', value);
  }

  /* A01 */
  demo['A01'] = function (host) {
    var root = demoRoot(host);
    var state = status('尚未点击按钮。');
    var vertical = false;
    var toolbar = false;
    var allDisabled = false;
    var group = window.NoteUI.ButtonGroup.mount(root, {
      role: 'group',
      orientation: 'horizontal',
      label: '文章操作',
      items: [
        { label: '保存草稿', variant: 'primary' },
        { label: '预览效果', variant: 'secondary' },
        {
          label: '复制链接',
          icon: window.NoteCore && window.NoteCore.icons ? window.NoteCore.icons.get('link') : null,
          iconOnly: true,
          ariaLabel: '复制链接'
        },
        { label: '永久删除', variant: 'quiet', disabled: true }
      ],
      onClick: function (item, index) {
        state.textContent = '点击了第 ' + (index + 1) + ' 项：' + item.label + '。';
      }
    });
    var bar = controls();
    var directionButton = button('切换为纵向', function () {
      vertical = !vertical;
      group.update({ orientation: vertical ? 'vertical' : 'horizontal' });
      directionButton.textContent = vertical ? '切换为横向' : '切换为纵向';
      state.textContent = '当前排列：' + (vertical ? '纵向' : '横向') + '。';
    });
    var roleButton = button('切换为 toolbar', function () {
      toolbar = !toolbar;
      group.update({ role: toolbar ? 'toolbar' : 'group' });
      roleButton.textContent = toolbar ? '切换为普通 group' : '切换为 toolbar';
      state.textContent = toolbar
        ? '当前为 toolbar：Tab 进入一次，左右方向键移动焦点，Home/End 到首尾。'
        : '当前为普通 group：每个可用按钮按原生 Tab 顺序获得焦点。';
    });
    var disabledButton = button('整组禁用', function () {
      allDisabled = !allDisabled;
      group.update({ disabled: allDisabled });
      disabledButton.textContent = allDisabled ? '恢复整组可用' : '整组禁用';
      state.textContent = allDisabled ? '整组按钮已禁用，禁用项也保持禁用。' : '已恢复整组可用。';
    });
    bar.appendChild(directionButton);
    bar.appendChild(roleButton);
    bar.appendChild(disabledButton);
    root.insertBefore(intro('按钮组只组织已有 NoteUI.Button：主次、排列、禁用和图标字段都传给按钮本身。图标按钮的呈现由 Button（R01）提供；toolbar 模式支持方向键移动焦点。'), root.firstChild);
    root.appendChild(bar);
    root.appendChild(state);

    return {
      destroy: function () {
        group.destroy();
        root.remove();
      }
    };
  };

  /* A02 */
  demo['A02'] = function (host) {
    var root = demoRoot(host);
    var state = status('尚未执行复制。');
    var fixedEnabled = false;
    var fixedLong = false;
    var sourceWrap = sectionBox();
    var sourceLabel = sectionLabel('待复制文本（可编辑，供 getText 读取）');
    var source = styled('textarea', 'box-sizing:border-box;width:100%;max-width:100%;min-height:7em;padding:8px 10px;border:var(--hnv-border-width,1px) solid var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-control,8px);background:var(--hnv-color-surface,#ffffff);color:var(--hnv-color-ink,#202938);font-family:var(--hnv-font-mono,"Cascadia Mono",Consolas,monospace);font-size:var(--hnv-font-size-label,14px);line-height:1.55;resize:vertical');
    source.value = '序列插入组件的复制示例：保持对象身份、让位关系与回退状态。\nA second line with English text and an identifier sequence-insert-primary-fallback-token.';
    source.setAttribute('aria-label', '待复制文本（可编辑）');
    source.spellcheck = false;
    sourceWrap.appendChild(sourceLabel);
    sourceWrap.appendChild(source);
    var copyEdit = window.NoteUI.CopyButton.mount(sourceWrap, {
      getText: function () { return source.value; },
      label: '复制编辑区文本',
      copiedLabel: '已复制编辑区文本',
      failedLabel: '自动复制失败，请手动选择下方文本',
      onCopy: function (result) {
        state.textContent = '编辑区复制结果：' + (result.ok ? '成功' : '失败') + '；方式 ' + result.method + '。';
      }
    });
    var fixedWrap = sectionBox();
    var fixedLabel = sectionLabel('固定文本来源（text 选项）');
    var fixedText = '固定示例文本：本地文件页可直接使用的复制目标。\nEnglish copy target for the local-file fallback path.';
    var copyFixed = window.NoteUI.CopyButton.mount(fixedWrap, {
      text: fixedText,
      label: '复制固定示例',
      disabled: true,
      copiedLabel: '固定文本已复制',
      failedLabel: '浏览器限制剪贴板，请手动选择下方文本',
      onCopy: function (result) {
        state.textContent = '固定文本复制结果：' + (result.ok ? '成功' : '失败') + '；方式 ' + result.method + '。';
      }
    });
    fixedWrap.insertBefore(fixedLabel, copyFixed.el);
    var bar = controls();
    var enableButton = button('启用固定文本复制', function () {
      fixedEnabled = !fixedEnabled;
      copyFixed.update({ disabled: !fixedEnabled });
      enableButton.textContent = fixedEnabled ? '禁用固定文本复制' : '启用固定文本复制';
      state.textContent = fixedEnabled ? '固定文本复制按钮已启用。' : '固定文本复制按钮已禁用。';
    });
    var textButton = button('换固定文本', function () {
      fixedLong = !fixedLong;
      copyFixed.update({ text: fixedLong
        ? '更新后的固定文本：\n长英文 target - clipboard fallback remains selectable and explicit.'
        : fixedText });
      textButton.textContent = fixedLong ? '恢复固定文本' : '换固定文本';
      state.textContent = '固定文本来源已通过 update 替换（未触发复制）。';
    });
    bar.appendChild(enableButton);
    bar.appendChild(textButton);
    root.appendChild(intro('复制按钮由 NoteUI.Button 与 NoteCore.copy 组合。点击编辑区旁的按钮会复制当前编辑内容；成功和失败都用文字与图标反馈。'));
    root.appendChild(note('失败回退说明：若浏览器剪贴板权限受限或本地文件环境不可用，组件会显示只读文本框并自动选中文本，可手动复制。是否可以实际写入系统剪贴板由当前浏览器和权限决定。'));
    root.appendChild(sourceWrap);
    root.appendChild(fixedWrap);
    root.appendChild(bar);
    root.appendChild(state);

    return {
      destroy: function () {
        copyEdit.destroy();
        copyFixed.destroy();
        root.remove();
      }
    };
  };

  /* A03 */
  demo['A03'] = function (host) {
    var root = demoRoot(host);
    var onChangeCount = 0;
    var singleStatus = status('当前值：按下。');
    var singleWrap = sectionBox();
    singleWrap.appendChild(sectionLabel('单个切换按钮'));
    var programButton = button('程序设为未按下', function () {
      var next = !single.getValue();
      single.update({ pressed: next });
      programButton.textContent = single.getValue() ? '程序设为未按下' : '程序设为按下';
      updateSingleStatus('程序 update 已改变外观，但不会触发 onChange。');
    });
    var single = window.NoteUI.Toggle.mount(singleWrap, {
      label: '启用网格辅助线（长标签也能换行）',
      pressed: true,
      onChange: function (value) {
        onChangeCount += 1;
        updateSingleStatus('用户操作触发 onChange。');
        programButton.textContent = single.getValue() ? '程序设为未按下' : '程序设为按下';
      }
    });
    var programRow = controls();
    programRow.appendChild(programButton);
    singleWrap.appendChild(programRow);
    singleWrap.appendChild(singleStatus);
    function updateSingleStatus(prefix) {
      singleStatus.textContent = prefix + ' 当前值：' + (single.getValue() ? '按下' : '未按下') + '；onChange 次数：' + onChangeCount + '。';
    }

    var exclusiveStatus = status('当前对齐：居中。');
    var exclusiveWrap = sectionBox();
    var exclusive = window.NoteUI.Toggle.mount(exclusiveWrap, {
      label: '段落对齐（互斥单选）',
      options: [
        { value: 'left', label: '左对齐' },
        { value: 'center', label: '居中' },
        { value: 'justify', label: '两端对齐（适合较长的中文段落与英文 mixed content）' },
        { value: 'right', label: '右对齐（示例禁用）', disabled: true }
      ],
      value: 'center',
      exclusive: true,
      onChange: function (value) {
        exclusiveStatus.textContent = '用户选择了：' + value + '。互斥组最多保留一个按下项。';
      }
    });
    exclusiveWrap.appendChild(exclusiveStatus);

    var multiStatus = status('当前多选：gridlines。');
    var multiWrap = sectionBox();
    var multi = window.NoteUI.Toggle.mount(multiWrap, {
      label: '显示元素（多选）',
      options: [
        { value: 'gridlines', label: '网格线' },
        { value: 'labels', label: '英文标签 English labels with a long option name' },
        { value: 'outline', label: '轮廓（示例禁用）', disabled: true }
      ],
      multi: true,
      value: ['gridlines'],
      onChange: function (value) {
        multiStatus.textContent = '当前多选：' + (value.length ? value.join('、') : '无') + '。';
      }
    });
    multiWrap.appendChild(multiStatus);

    root.appendChild(intro('切换按钮保留 aria-pressed 状态，视觉上以勾选形状和背景共同表示按下。互斥组最多一个按下项；多选组可同时按下多项。用户操作触发 onChange，程序 update 不会。'));
    root.appendChild(singleWrap);
    root.appendChild(exclusiveWrap);
    root.appendChild(multiWrap);
    updateSingleStatus('初始状态。');

    return {
      destroy: function () {
        single.destroy();
        exclusive.destroy();
        multi.destroy();
        root.remove();
      }
    };
  };
})();
