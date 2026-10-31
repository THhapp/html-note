/* NoteUI forms-basic gallery demos — F01–F08.
   Uses only public NoteUI APIs. Inline demo styling is scoped to .nui-forms-demo
   and removed when the last active demo is destroyed. */
(function () {
  'use strict';

  var demo = window.NoteGalleryDemos = window.NoteGalleryDemos || {};
  var styleElement = null;
  var styleRefs = 0;

  var STYLE = [
    '.nui-forms-demo{display:grid;gap:18px;max-width:840px;min-width:0;font-family:var(--hnv-font-family,"Microsoft YaHei","PingFang SC",system-ui,sans-serif);color:var(--hnv-color-ink,#202938);line-height:1.55}',
    '.nui-forms-demo__section{display:grid;gap:10px;min-width:0;padding:14px 16px;border:1px solid var(--hnv-color-border,#dce2ea);border-radius:10px;background:var(--hnv-color-surface,#fff)}',
    '.nui-forms-demo__heading{margin:0;font-size:15px;line-height:1.45;font-weight:650;overflow-wrap:anywhere}',
    '.nui-forms-demo__desc{margin:0;font-size:13px;line-height:1.55;color:var(--hnv-color-muted,#5c6879);overflow-wrap:anywhere}',
    '.nui-forms-demo__row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0}',
    '.nui-forms-demo__button{display:inline-flex;align-items:center;justify-content:center;min-height:34px;max-width:100%;padding:6px 11px;border:1px solid var(--hnv-color-border,#dce2ea);border-radius:7px;background:var(--hnv-color-surface,#fff);color:var(--hnv-color-ink,#202938);font:inherit;font-size:13px;font-weight:600;line-height:1.4;text-align:center;cursor:pointer;overflow-wrap:anywhere}',
    '.nui-forms-demo__button:not(:disabled):hover{background:var(--hnv-color-page,#f4f6f9);border-color:var(--hnv-color-attention,#6f82b7)}',
    '.nui-forms-demo__button:focus-visible{outline:3px solid var(--hnv-color-focus,#5573c8);outline-offset:2px}',
    '.nui-forms-demo__readout{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;min-width:0;font-size:13px;line-height:1.5;color:var(--hnv-color-muted,#5c6879)}',
    '.nui-forms-demo__code{padding:1px 5px;border-radius:4px;background:var(--hnv-color-page,#f4f6f9);color:var(--hnv-color-ink,#202938);font-family:ui-monospace,"Cascadia Code",Consolas,monospace;font-size:12px;overflow-wrap:anywhere}',
    '.nui-forms-demo__log{max-height:8.5rem;margin:0;padding:8px 10px;overflow:auto;border-radius:6px;background:var(--hnv-color-page,#f4f6f9);color:var(--hnv-color-muted,#5c6879);font-family:ui-monospace,"Cascadia Code",Consolas,monospace;font-size:12px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}',
    '.nui-forms-demo__narrow{max-width:280px;min-width:0}',
    '.nui-forms-demo__medium{max-width:460px;min-width:0}',
    '.nui-forms-demo__group{display:grid;gap:8px;min-width:0}',
    '@media(prefers-reduced-motion:reduce){.nui-forms-demo__button{transition:none}}'
  ].join('\n');

  function retainStyles() {
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = 'nui-forms-demo-style';
      styleElement.textContent = STYLE;
      document.head.appendChild(styleElement);
    }
    styleRefs += 1;
    var released = false;
    return function () {
      if (released) return;
      released = true;
      styleRefs = Math.max(0, styleRefs - 1);
      if (styleRefs === 0 && styleElement) {
        styleElement.remove();
        styleElement = null;
      }
    };
  }

  function make(tag, className, value) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (value != null) el.textContent = String(value);
    return el;
  }

  function formatValue(value) {
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return JSON.stringify(value);
    try { return JSON.stringify(value); } catch (error) { return String(value); }
  }

  function section(root, title, description) {
    var box = make('section', 'nui-forms-demo__section');
    box.appendChild(make('h3', 'nui-forms-demo__heading', title));
    if (description) box.appendChild(make('p', 'nui-forms-demo__desc', description));
    root.appendChild(box);
    return box;
  }

  function actionRow() {
    return make('div', 'nui-forms-demo__row');
  }

  function action(label, handler) {
    var button = make('button', 'nui-forms-demo__button', label);
    button.type = 'button';
    button.addEventListener('click', handler);
    return button;
  }

  function readout(label) {
    var wrap = make('div', 'nui-forms-demo__readout');
    var labelEl = make('span', null, label);
    var valueEl = make('code', 'nui-forms-demo__code', '—');
    wrap.appendChild(labelEl);
    wrap.appendChild(valueEl);
    return {
      el: wrap,
      set: function (value) { valueEl.textContent = formatValue(value); }
    };
  }

  function makeLog(title) {
    var wrap = make('div', 'nui-forms-demo__group');
    wrap.appendChild(make('div', 'nui-forms-demo__readout', title));
    var pre = make('pre', 'nui-forms-demo__log');
    var lines = ['（尚未触发用户事件）'];
    function render() { pre.textContent = lines.join('\n'); }
    render();
    wrap.appendChild(pre);
    return {
      el: wrap,
      add: function (line) {
        lines.unshift(line);
        if (lines.length > 8) lines.pop();
        render();
      }
    };
  }

  function detachedMount(registry, component, options) {
    var holder = document.createElement('div');
    var instance = component.mount(holder, options);
    registry.push(instance);
    return instance;
  }

  function trackedMount(registry, host, component, options) {
    var instance = component.mount(host, options);
    registry.push(instance);
    return instance;
  }

  function finish(registry, root, release) {
    var destroyed = false;
    return {
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        registry.slice().reverse().forEach(function (instance) {
          try { if (instance && typeof instance.destroy === 'function') instance.destroy(); } catch (error) { /* keep demo teardown resilient */ }
        });
        registry.length = 0;
        if (release) release();
        root.remove();
      }
    };
  }

  /* ------------------------------------------------------------------ */
  /* F01 Field                                                          */
  /* ------------------------------------------------------------------ */
  demo.F01 = function (host) {
    if (!host) return { destroy: function () {} };
    var release = retainStyles();
    var root = make('div', 'nui-forms-demo');
    var instances = [];
    host.appendChild(root);

    var intro = section(root, '字段外壳：标签、说明与错误都在正常阅读路径中',
      '说明和错误默认显示，不藏在悬停或占位符里。字段外壳只负责关联与呈现，不替控件决定值；下面的输入值仍由 TextInput 持有。');
    var log = makeLog('TextInput onChange 记录');
    var valueReadout = readout('TextInput.getValue()');

    var fieldBody = make('div', 'nui-forms-demo__medium');
    intro.appendChild(fieldBody);

    var input = detachedMount(instances, window.NoteUI.TextInput, {
      value: '',
      placeholder: '例如：第三章的要点整理',
      clearable: true,
      onChange: function (value) {
        valueReadout.set(value);
        log.add('用户输入 → ' + formatValue(value));
      }
    });
    var field = trackedMount(instances, fieldBody, window.NoteUI.Field, {
      label: '笔记标题',
      hint: '这段说明默认可见：标题会出现在目录和搜索摘要中。改变标题内容不会改变字段的错误状态；程序 update 也不会触发输入事件。',
      required: true,
      error: '标题不能为空。这里的错误说明默认可见，并会与输入框通过 aria-describedby 关联。',
      control: input
    });
    valueReadout.set(input.getValue());

    var row = actionRow();
    var errorOn = true;
    var toggleError = action('清除错误', function () {
      errorOn = !errorOn;
      field.setError(errorOn ? '标题不能为空。这里的错误说明默认可见，并会与输入框通过 aria-describedby 关联。' : '');
      toggleError.textContent = errorOn ? '清除错误' : '重新显示错误';
    });
    row.appendChild(toggleError);
    row.appendChild(action('程序填入（update）', function () {
      input.update({ value: '程序填入的标题' });
      valueReadout.set(input.getValue());
      log.add('程序 update：值已更新，未触发 onChange');
    }));
    row.appendChild(action('换成更长的说明', function () {
      field.update({
        hint: '更新后的长说明默认可见，用来检查窄容器中的换行：'.repeat(4) +
          '这段文字会随容器宽度自然换行，不会把字段挤到不可读。'
      });
    }));
    intro.appendChild(row);
    intro.appendChild(valueReadout.el);
    intro.appendChild(log.el);

    return finish(instances, root, release);
  };

  /* ------------------------------------------------------------------ */
  /* F02 TextInput                                                      */
  /* ------------------------------------------------------------------ */
  demo.F02 = function (host) {
    if (!host) return { destroy: function () {} };
    var release = retainStyles();
    var root = make('div', 'nui-forms-demo');
    var instances = [];
    host.appendChild(root);

    var log = makeLog('onChange 记录（用户输入/清空才出现）');

    var textSection = section(root, '文本输入：清空按钮与用户事件',
      '清空按钮只在有内容时出现，可用 Tab 到达。下面的“程序”按钮只调用 update，日志不会增加，说明程序更新不冒充用户事件。');
    var textWrap = make('div', 'nui-forms-demo__medium');
    textSection.appendChild(textWrap);
    var textReadout = readout('TextField.getValue()');
    var textInput = detachedMount(instances, window.NoteUI.TextInput, {
      value: '可以编辑的示例文本',
      placeholder: '输入文本',
      clearable: true,
      onChange: function (value, event) {
        textReadout.set(value);
        log.add('文本 · ' + (event && event.type) + ' → ' + formatValue(value));
      }
    });
    var textField = trackedMount(instances, textWrap, window.NoteUI.Field, {
      label: '可清空输入',
      hint: '输入后清空按钮可用；键盘可先聚焦输入框，再按 Tab 到清空按钮并按 Enter。',
      control: textInput
    });
    textReadout.set(textInput.getValue());
    textSection.appendChild(textReadout.el);

    var textRow = actionRow();
    textRow.appendChild(action('程序填入', function () {
      textInput.update({ value: '程序更新的文本' });
      textReadout.set(textInput.getValue());
      log.add('文本 · 程序 update，无 onChange');
    }));
    textRow.appendChild(action('程序清空', function () {
      textInput.update({ value: '' });
      textReadout.set(textInput.getValue());
      log.add('文本 · 程序 update 清空，无 onChange');
    }));
    var disabled = false;
    var toggleDisabled = action('设为禁用', function () {
      disabled = !disabled;
      textInput.update({ disabled: disabled });
      toggleDisabled.textContent = disabled ? '取消禁用' : '设为禁用';
      log.add('文本 · 程序 update 切换禁用，无 onChange');
    });
    textRow.appendChild(toggleDisabled);
    textSection.appendChild(textRow);

    var searchSection = section(root, '搜索变体：type 配置，不新增组件',
      '搜索仍用原生 input，只是配置 type: "search"；清空按钮与文本输入一致。窄容器中的长文本在输入框内部横向滚动，不撑破页面。');
    var searchWrap = make('div', 'nui-forms-demo__narrow');
    searchSection.appendChild(searchWrap);
    var searchReadout = readout('搜索框.getValue()');
    var searchInput = detachedMount(instances, window.NoteUI.TextInput, {
      type: 'search',
      value: '一段很长的搜索文本，用来检查输入框在窄容器中不会把父容器撑破，也不会把清空按钮挤走。',
      placeholder: '搜索',
      clearable: true,
      onChange: function (value, event) {
        searchReadout.set(value);
        log.add('搜索 · ' + (event && event.type) + ' → ' + formatValue(value));
      }
    });
    trackedMount(instances, searchWrap, window.NoteUI.Field, {
      label: '搜索条目',
      hint: '搜索是 TextInput 的配置变体。输入会立刻触发 onChange。',
      control: searchInput
    });
    searchReadout.set(searchInput.getValue());
    searchSection.appendChild(searchReadout.el);
    var searchRow = actionRow();
    searchRow.appendChild(action('换一段搜索文本', function () {
      searchInput.update({ value: '另一段搜索关键词，长度仍然超过窄容器宽度，用于检查换行与省略表现。' });
      searchReadout.set(searchInput.getValue());
      log.add('搜索 · 程序 update，无 onChange');
    }));
    searchRow.appendChild(action('程序清空搜索', function () {
      searchInput.update({ value: '' });
      searchReadout.set(searchInput.getValue());
      log.add('搜索 · 程序 update 清空，无 onChange');
    }));
    searchSection.appendChild(searchRow);
    root.appendChild(log.el);

    return finish(instances, root, release);
  };

  /* ------------------------------------------------------------------ */
  /* F03 Textarea                                                       */
  /* ------------------------------------------------------------------ */
  demo.F03 = function (host) {
    if (!host) return { destroy: function () {} };
    var release = retainStyles();
    var root = make('div', 'nui-forms-demo');
    var instances = [];
    host.appendChild(root);

    var box = section(root, '多行输入：自动增高、字数提示与滚动上限',
      '自动增高最多约 8 行，超过后在文本域内部滚动；字数提示默认显示。组件不监听 Tab、Ctrl+S 等宿主快捷键，只处理自己的输入事件。');
    var wrap = make('div', 'nui-forms-demo__medium');
    box.appendChild(wrap);
    var log = makeLog('Textarea onChange 记录');
    var lengthReadout = readout('getValue() 长度');
    var modeReadout = readout('自动增高');

    var textarea = detachedMount(instances, window.NoteUI.Textarea, {
      value: '第一行：写下要点。\n第二行：补充一个例子。',
      rows: 3,
      autoGrow: true,
      maxRows: 8,
      showCount: true,
      maxLength: 200,
      placeholder: '输入多行说明',
      onChange: function (value, event) {
        lengthReadout.set(value.length);
        log.add((event && event.type) + ' → ' + value.length + ' 字');
      }
    });
    trackedMount(instances, wrap, window.NoteUI.Field, {
      label: '讲解草稿',
      hint: '说明：自动增高可关闭，关闭后保留 rows 高度并出现内部滚动；字数与上限始终可见。',
      control: textarea
    });
    lengthReadout.set(textarea.getValue().length);
    modeReadout.set('开（最多 8 行）');
    box.appendChild(lengthReadout.el);
    box.appendChild(modeReadout.el);

    var autoGrow = true;
    var row = actionRow();
    row.appendChild(action('填入长文本（程序 update）', function () {
      textarea.update({
        value: '这是一段通过程序 update 填入的长文本，用来观察自动增高到达上限后的内部滚动。'.repeat(6)
      });
      lengthReadout.set(textarea.getValue().length);
      log.add('程序 update 填入长文本，无 onChange');
    }));
    var toggle = action('关闭自动增高', function () {
      autoGrow = !autoGrow;
      textarea.update({ autoGrow: autoGrow });
      toggle.textContent = autoGrow ? '关闭自动增高' : '开启自动增高';
      modeReadout.set(autoGrow ? '开（最多 8 行）' : '关（固定 rows，内部滚动）');
      log.add('程序 update 切换自动增高，无 onChange');
    });
    row.appendChild(toggle);
    row.appendChild(action('程序清空', function () {
      textarea.update({ value: '' });
      lengthReadout.set(0);
      log.add('程序 update 清空，无 onChange');
    }));
    box.appendChild(row);
    box.appendChild(log.el);

    return finish(instances, root, release);
  };

  /* ------------------------------------------------------------------ */
  /* F04 NumberInput                                                    */
  /* ------------------------------------------------------------------ */
  demo.F04 = function (host) {
    if (!host) return { destroy: function () {} };
    var release = retainStyles();
    var root = make('div', 'nui-forms-demo');
    var instances = [];
    host.appendChild(root);

    var box = section(root, '数字输入：空值保持 null，非法输入不提交假值',
      '初始为空，getValue() 返回 null，不是 0。输入 abc 后按 Enter 或离开，会保留文本并显示错误；输入超出上限的数字，离开时会夹紧并提示。上下按钮与 ↑↓ / PageUp / PageDown 都可用。');
    var wrap = make('div', 'nui-forms-demo__medium');
    box.appendChild(wrap);
    var log = makeLog('onChange 记录');
    var valueReadout = readout('NumberInput.getValue()');
    var errorReadout = readout('getError()');

    var number = detachedMount(instances, window.NoteUI.NumberInput, {
      value: null,
      min: 0,
      max: 100,
      step: 0.5,
      clearable: true,
      placeholder: '未填写',
      onChange: function (value, event) {
        valueReadout.set(value);
        errorReadout.set(number.getError() || '');
        log.add((event && event.type) + ' → ' + formatValue(value));
      }
    });
    trackedMount(instances, wrap, window.NoteUI.Field, {
      label: '预算（0–100，步长 0.5）',
      hint: '空值不会变成 0；只有产生有效数字变化时才触发 onChange。非法文本会保留在输入框中，等待你继续修改。',
      control: number
    });
    valueReadout.set(number.getValue());
    errorReadout.set('');
    box.appendChild(valueReadout.el);
    box.appendChild(errorReadout.el);

    var row = actionRow();
    row.appendChild(action('程序设为 null', function () {
      number.update({ value: null });
      valueReadout.set(number.getValue());
      errorReadout.set(number.getError() || '');
      log.add('程序 update → null，无 onChange');
    }));
    row.appendChild(action('程序设为 42.5', function () {
      number.update({ value: 42.5 });
      valueReadout.set(number.getValue());
      errorReadout.set(number.getError() || '');
      log.add('程序 update → 42.5，无 onChange');
    }));
    var wide = true;
    var rangeButton = action('把上限改为 20', function () {
      wide = !wide;
      number.update({ max: wide ? 100 : 20 });
      rangeButton.textContent = wide ? '把上限改为 20' : '恢复上限 100';
      errorReadout.set(number.getError() || '');
      log.add('程序 update 范围 → 上限 ' + (wide ? 100 : 20) + '，无 onChange');
    });
    row.appendChild(rangeButton);
    row.appendChild(action('读取当前值/错误', function () {
      valueReadout.set(number.getValue());
      errorReadout.set(number.getError() || '');
    }));
    box.appendChild(row);
    box.appendChild(log.el);

    return finish(instances, root, release);
  };

  /* ------------------------------------------------------------------ */
  /* F05 Checkbox                                                       */
  /* ------------------------------------------------------------------ */
  demo.F05 = function (host) {
    if (!host) return { destroy: function () {} };
    var release = retainStyles();
    var root = make('div', 'nui-forms-demo');
    var instances = [];
    host.appendChild(root);

    var single = section(root, '单个复选：选中、半选与禁用',
      '半选使用原生 input.indeterminate，不伪造第三种选中值；点击后由浏览器清除半选并触发 change。禁用项保持原生 disabled，标签文字仍然完整可读。');
    var group = make('div', 'nui-forms-demo__group');
    single.appendChild(group);
    var log = makeLog('Checkbox onChange 记录');
    var halfReadout = readout('半选实例.getValue()');
    var lockedReadout = readout('禁用实例.getValue()');

    var half = trackedMount(instances, group, window.NoteUI.Checkbox, {
      label: '半选示例：部分权限已选',
      checked: false,
      indeterminate: true,
      value: 'partial',
      onChange: function (checked, event) {
        halfReadout.set(half.getValue());
        log.add((event && event.type) + ' · 用户点击半选复选框 → checked=' + checked + '（半选由浏览器清除）');
      }
    });
    var locked = trackedMount(instances, group, window.NoteUI.Checkbox, {
      label: '禁用状态：这一项由宿主策略锁定，标签很长时也应在窄容器内自然换行，不会被压到不可读。',
      checked: true,
      disabled: true,
      value: 'locked'
    });
    halfReadout.set(half.getValue());
    lockedReadout.set(locked.getValue());
    single.appendChild(halfReadout.el);
    single.appendChild(lockedReadout.el);

    var singleRow = actionRow();
    singleRow.appendChild(action('重新设为半选（update）', function () {
      half.update({ checked: false, indeterminate: true });
      halfReadout.set(half.getValue());
      log.add('程序 update 设为半选，无 onChange');
    }));
    singleRow.appendChild(action('清除半选', function () {
      half.update({ checked: false, indeterminate: false });
      halfReadout.set(half.getValue());
      log.add('程序 update 清除半选，无 onChange');
    }));
    single.appendChild(singleRow);

    var groupSection = section(root, '组用法：多个 Checkbox 组合，不另造组件',
      '宿主按业务把若干 Checkbox 放在一起，收集各自 getValue()；下面的选中摘要就是这种组合用法。程序清空只调用 update，不触发 onChange。');
    var groupList = make('div', 'nui-forms-demo__group');
    groupSection.appendChild(groupList);
    var groupReadout = readout('已选值');
    var groupLog = makeLog('组 onChange 记录');
    var labels = [
      { value: 'read', label: '读取' },
      { value: 'write', label: '写入' },
      { value: 'exec', label: '执行' }
    ];
    var groupItems = labels.map(function (item) {
      return trackedMount(instances, groupList, window.NoteUI.Checkbox, {
        label: item.label + '（value: ' + item.value + '）',
        value: item.value,
        onChange: function (checked) {
          updateGroupReadout();
          groupLog.add(item.value + ' · checked=' + checked);
        }
      });
    });
    function collectGroup() {
      return labels.filter(function (item, index) {
        return groupItems[index] && groupItems[index].getValue();
      }).map(function (item) { return item.value; });
    }
    function updateGroupReadout() {
      groupReadout.set(collectGroup());
    }
    updateGroupReadout();
    groupSection.appendChild(groupReadout.el);
    var groupRow = actionRow();
    groupRow.appendChild(action('程序取消全部', function () {
      groupItems.forEach(function (item) { item.update({ checked: false }); });
      updateGroupReadout();
      groupLog.add('程序 update 取消全部，无 onChange');
    }));
    groupRow.appendChild(action('读取选中值', updateGroupReadout));
    groupSection.appendChild(groupRow);
    groupSection.appendChild(groupLog.el);

    root.appendChild(log.el);

    return finish(instances, root, release);
  };

  /* ------------------------------------------------------------------ */
  /* F06 RadioGroup                                                     */
  /* ------------------------------------------------------------------ */
  demo.F06 = function (host) {
    if (!host) return { destroy: function () {} };
    var release = retainStyles();
    var root = make('div', 'nui-forms-demo');
    var instances = [];
    host.appendChild(root);

    var box = section(root, '单选组：原生 radio 互斥与键盘',
      '使用 fieldset / legend 与同名原生 radio；方向键在组内移动并跳过禁用项。长选项在窄容器中换行，程序 update 不触发 onChange。');
    var wrap = make('div', 'nui-forms-demo__narrow');
    box.appendChild(wrap);
    var valueReadout = readout('RadioGroup.getValue()');
    var log = makeLog('RadioGroup onChange 记录');

    var radio = trackedMount(instances, wrap, window.NoteUI.RadioGroup, {
      label: '发布范围（含长选项与禁用项）',
      value: 'team',
      options: [
        { value: 'private', label: '私密：只有自己可见' },
        { value: 'team', label: '团队：这是一个很长的选项说明，用来检查窄容器里的自然换行；说明不会藏在悬停提示中。' },
        { value: 'org', label: '组织：当前策略禁用，键盘方向键会跳过此项', disabled: true },
        { value: 'public', label: '公开：所有人都可以查看' }
      ],
      onChange: function (value, event) {
        valueReadout.set(value);
        log.add((event && event.type) + ' → ' + formatValue(value));
      }
    });
    valueReadout.set(radio.getValue());
    box.appendChild(valueReadout.el);

    var row = actionRow();
    row.appendChild(action('程序选择“私密”', function () {
      radio.update({ value: 'private' });
      valueReadout.set(radio.getValue());
      log.add('程序 update → "private"，无 onChange');
    }));
    row.appendChild(action('程序选择“公开”', function () {
      radio.update({ value: 'public' });
      valueReadout.set(radio.getValue());
      log.add('程序 update → "public"，无 onChange');
    }));
    var wide = false;
    var widthButton = action('切换宽容器', function () {
      wide = !wide;
      wrap.className = wide ? 'nui-forms-demo__medium' : 'nui-forms-demo__narrow';
      widthButton.textContent = wide ? '切换窄容器' : '切换宽容器';
    });
    row.appendChild(widthButton);
    box.appendChild(row);
    box.appendChild(log.el);

    return finish(instances, root, release);
  };

  /* ------------------------------------------------------------------ */
  /* F07 Select                                                         */
  /* ------------------------------------------------------------------ */
  demo.F07 = function (host) {
    if (!host) return { destroy: function () {} };
    var release = retainStyles();
    var root = make('div', 'nui-forms-demo');
    var instances = [];
    host.appendChild(root);

    var log = makeLog('Select onChange 记录');

    var singleSection = section(root, '单选：原生 select、占位与清空',
      '单选用原生 select，键盘与浏览器行为完整；选项值通过 getValue() 映射回宿主数据。清空按钮在已选值时可到达。');
    var singleWrap = make('div', 'nui-forms-demo__narrow');
    singleSection.appendChild(singleWrap);
    var singleReadout = readout('单选.getValue()');
    var single = detachedMount(instances, window.NoteUI.Select, {
      options: [
        { value: 'inbox', label: '站内通知' },
        { value: 'email', label: '邮件：一段较长的选项说明，用来检查窄容器下展开列表的可读性' },
        { value: 'sms', label: '短信（当前未开通）', disabled: true }
      ],
      value: 'inbox',
      placeholder: '请选择通知渠道',
      clearable: true,
      onChange: function (value, event) {
        singleReadout.set(value);
        log.add('单选 · ' + (event && event.type) + ' → ' + formatValue(value));
      }
    });
    trackedMount(instances, singleWrap, window.NoteUI.Field, {
      label: '默认通知渠道',
      hint: '长选项在原生下拉展开时可完整阅读；窄容器中的选中项可能由浏览器截断。',
      control: single
    });
    singleReadout.set(single.getValue());
    singleSection.appendChild(singleReadout.el);
    var singleRow = actionRow();
    singleRow.appendChild(action('程序选“邮件”', function () {
      single.update({ value: 'email' });
      singleReadout.set(single.getValue());
      log.add('单选 · 程序 update，无 onChange');
    }));
    singleRow.appendChild(action('程序清空', function () {
      single.update({ value: null });
      singleReadout.set(single.getValue());
      log.add('单选 · 程序 update → null，无 onChange');
    }));
    var singleDisabled = false;
    var toggleSingle = action('设为禁用', function () {
      singleDisabled = !singleDisabled;
      single.update({ disabled: singleDisabled });
      toggleSingle.textContent = singleDisabled ? '取消禁用' : '设为禁用';
      log.add('单选 · 程序 update 切换禁用，无 onChange');
    });
    singleRow.appendChild(toggleSingle);
    singleSection.appendChild(singleRow);

    var multiSection = section(root, '多选：原生 multiple + 已选摘要 + 清空',
      '多选同样使用原生 select multiple；按住 Ctrl/⌘ 点选。摘要完整显示已选标签，清空后 getValue() 为 []，不是 null。');
    var multiWrap = make('div', 'nui-forms-demo__medium');
    multiSection.appendChild(multiWrap);
    var multiReadout = readout('多选.getValue()');
    var multi = detachedMount(instances, window.NoteUI.Select, {
      options: [
        { value: 'read', label: '读取资源' },
        { value: 'write', label: '写入内容' },
        { value: 'exec', label: '执行任务' },
        { value: 'admin', label: '管理成员与权限（较长标签）' }
      ],
      value: ['read', 'write'],
      multiple: true,
      clearable: true,
      onChange: function (value, event) {
        multiReadout.set(value);
        log.add('多选 · ' + (event && event.type) + ' → ' + formatValue(value));
      }
    });
    trackedMount(instances, multiWrap, window.NoteUI.Field, {
      label: '权限（可多选）',
      hint: '原生多选需要 Ctrl/⌘ 辅助点选；已选摘要和清空按钮始终可见。',
      control: multi
    });
    multiReadout.set(multi.getValue());
    multiSection.appendChild(multiReadout.el);
    var multiRow = actionRow();
    multiRow.appendChild(action('程序全选', function () {
      multi.update({ value: ['read', 'write', 'exec', 'admin'] });
      multiReadout.set(multi.getValue());
      log.add('多选 · 程序 update 全选，无 onChange');
    }));
    multiRow.appendChild(action('程序清空', function () {
      multi.update({ value: [] });
      multiReadout.set(multi.getValue());
      log.add('多选 · 程序 update → []，无 onChange');
    }));
    multiSection.appendChild(multiRow);

    var emptySection = section(root, '空选项：emptyText 与可替换数据',
      '没有选项时显示空态文字；宿主可以通过 update 换入新选项，程序更新不触发 onChange。');
    var emptyWrap = make('div', 'nui-forms-demo__narrow');
    emptySection.appendChild(emptyWrap);
    var emptyReadout = readout('空态.getValue()');
    var empty = detachedMount(instances, window.NoteUI.Select, {
      options: [],
      emptyText: '暂无可用渠道',
      clearable: true,
      placeholder: '请选择',
      onChange: function (value, event) {
        emptyReadout.set(value);
        log.add('空态 · ' + (event && event.type) + ' → ' + formatValue(value));
      }
    });
    trackedMount(instances, emptyWrap, window.NoteUI.Field, {
      label: '空选项示例',
      hint: '空态文字由 emptyText 提供，不是只藏在悬停提示中。',
      control: empty
    });
    emptyReadout.set(empty.getValue());
    emptySection.appendChild(emptyReadout.el);
    var loadButton = action('载入选项（update）', function () {
      empty.update({
        options: [
          { value: 'email', label: '邮件' },
          { value: 'inbox', label: '站内通知' }
        ],
        value: 'email'
      });
      emptyReadout.set(empty.getValue());
      loadButton.disabled = true;
      loadButton.textContent = '已载入选项';
      log.add('空态 · 程序 update 载入选项，无 onChange');
    });
    var emptyRow = actionRow();
    emptyRow.appendChild(loadButton);
    emptySection.appendChild(emptyRow);

    root.appendChild(log.el);

    return finish(instances, root, release);
  };

  /* ------------------------------------------------------------------ */
  /* F08 Combobox                                                       */
  /* ------------------------------------------------------------------ */
  demo.F08 = function (host) {
    if (!host) return { destroy: function () {} };
    var release = retainStyles();
    var root = make('div', 'nui-forms-demo');
    var instances = [];
    host.appendChild(root);

    var log = makeLog('Combobox onChange 记录（选择或提交时）');

    var strictSection = section(root, '严格选择：输入过滤与键盘高亮',
      '输入过滤默认不区分大小写、按包含匹配。↑↓ 移动高亮，Home/End 跳首尾，Enter 选择，Esc 收起；输入框输入本身不提交值。此处 allowFreeText: false，未选择时离开会恢复原值。');
    var strictWrap = make('div', 'nui-forms-demo__medium');
    strictSection.appendChild(strictWrap);
    var strictReadout = readout('严格模式.getValue()');
    var strict = detachedMount(instances, window.NoteUI.Combobox, {
      options: [
        { value: 'beijing', label: '北京' },
        { value: 'shanghai', label: '上海' },
        { value: 'hangzhou', label: '杭州' },
        { value: 'shenzhen', label: '深圳' },
        { value: 'offline', label: '境外城市（当前禁用）', disabled: true }
      ],
      value: null,
      placeholder: '输入城市名筛选',
      clearable: true,
      allowFreeText: false,
      onChange: function (value, event) {
        strictReadout.set(value);
        log.add('严格 · ' + (event && event.type) + ' → ' + formatValue(value));
      }
    });
    trackedMount(instances, strictWrap, window.NoteUI.Field, {
      label: '城市（严格选择）',
      hint: '无匹配时列表会显示“无匹配选项”；Esc 或点击外部关闭列表，Esc 会撤销未确认的输入。',
      control: strict
    });
    strictReadout.set(strict.getValue());
    strictSection.appendChild(strictReadout.el);

    var strictRow = actionRow();
    strictRow.appendChild(action('程序设为“杭州”', function () {
      strict.update({ value: 'hangzhou' });
      strictReadout.set(strict.getValue());
      log.add('严格 · 程序 update → "hangzhou"，无 onChange');
    }));
    strictRow.appendChild(action('程序清空', function () {
      strict.update({ value: null });
      strictReadout.set(strict.getValue());
      log.add('严格 · 程序 update → null，无 onChange');
    }));
    var strictDisabled = false;
    var toggleStrict = action('禁用组合框', function () {
      strictDisabled = !strictDisabled;
      strict.update({ disabled: strictDisabled });
      toggleStrict.textContent = strictDisabled ? '启用组合框' : '禁用组合框';
      log.add('严格 · 程序 update 切换禁用，无 onChange');
    });
    strictRow.appendChild(toggleStrict);
    strictSection.appendChild(strictRow);

    var freeSection = section(root, '自由输入：allowFreeText 明确控制提交策略',
      '此处 allowFreeText: true。输入可以暂不提交；Esc 取消，Enter 或点击外部提交自由文本。只有选择或提交才触发 onChange，输入过滤本身不会。');
    var freeWrap = make('div', 'nui-forms-demo__medium');
    freeSection.appendChild(freeWrap);
    var freeReadout = readout('自由输入.getValue()');
    var free = detachedMount(instances, window.NoteUI.Combobox, {
      options: [
        { value: 'important', label: '重要' },
        { value: 'follow-up', label: '待跟进' },
        { value: 'archive', label: '归档' }
      ],
      value: null,
      placeholder: '选择标签或输入新标签',
      clearable: true,
      allowFreeText: true,
      onChange: function (value, event) {
        freeReadout.set(value);
        log.add('自由 · ' + (event && event.type) + ' → ' + formatValue(value));
      }
    });
    trackedMount(instances, freeWrap, window.NoteUI.Field, {
      label: '标签（允许自由输入）',
      hint: '输入例如“自定义标签”后按 Enter，或点击组件外部提交；按 Esc 则取消未提交的文本。',
      control: free
    });
    freeReadout.set(free.getValue());
    freeSection.appendChild(freeReadout.el);
    var freeRow = actionRow();
    freeRow.appendChild(action('程序设为“自定义标签”', function () {
      free.update({ value: '自定义标签' });
      freeReadout.set(free.getValue());
      log.add('自由 · 程序 update → "自定义标签"，无 onChange');
    }));
    freeRow.appendChild(action('程序清空', function () {
      free.update({ value: null });
      freeReadout.set(free.getValue());
      log.add('自由 · 程序 update → null，无 onChange');
    }));
    freeSection.appendChild(freeRow);

    root.appendChild(log.el);

    return finish(instances, root, release);
  };
})();
