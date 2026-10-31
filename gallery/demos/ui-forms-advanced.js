/*!
 * gallery 演示 · ui-forms-advanced.js
 *
 * F09–F15 真实挂载高级表单控件。演示默认静止；状态变化只在用户点击演示按钮或
 * 操作组件时发生。所有浮层由组件 destroy() 关闭；本文件不执行上传、不请求网络。
 */
(function () {
  'use strict';

  var demos = window.NoteGalleryDemos = window.NoteGalleryDemos || {};

  var rootStyle = 'display:flex;flex-direction:column;gap:14px;width:100%;max-width:100%;min-width:0;font-family:inherit;font-size:var(--hnv-font-size-reading,16px);line-height:var(--hnv-font-line-reading,1.65);color:var(--hnv-color-ink,#202938);overflow-wrap:anywhere';
  var introStyle = 'margin:0;max-width:74ch;color:var(--hnv-color-ink,#202938);font-size:var(--hnv-font-size-reading,16px);line-height:var(--hnv-font-line-reading,1.65)';
  var noteStyle = 'margin:0;max-width:74ch;color:var(--hnv-color-muted,#5c6879);font-size:var(--hnv-font-size-label,14px);line-height:var(--hnv-font-line-reading,1.65)';
  var toolbarStyle = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0;max-width:100%';
  var stageStyle = 'display:flex;flex-direction:column;gap:12px;min-width:0;max-width:100%;padding:12px 14px;border:var(--hnv-border-width,1px) solid var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-object,10px);background:var(--hnv-color-page,#f4f6f9)';
  var twoColStyle = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr));gap:12px;min-width:0;max-width:100%';
  var cardStyle = 'box-sizing:border-box;min-width:0;max-width:100%;padding:12px 14px;border:var(--hnv-border-width,1px) solid var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-control,8px);background:var(--hnv-color-surface,#ffffff)';
  var buttonStyle = 'box-sizing:border-box;max-width:100%;min-height:34px;padding:7px 11px;border:var(--hnv-border-width,1px) solid var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-control,8px);background:var(--hnv-color-surface,#ffffff);color:var(--hnv-color-ink,#202938);font-family:inherit;font-size:var(--hnv-font-size-label,14px);font-weight:600;line-height:1.4;text-align:center;white-space:normal;overflow-wrap:anywhere;cursor:pointer';
  var outputStyle = 'margin:0;min-height:1.6em;color:var(--hnv-color-muted,#5c6879);font-size:var(--hnv-font-size-label,14px);line-height:1.6;overflow-wrap:anywhere';
  var jsonStyle = 'box-sizing:border-box;margin:0;max-width:100%;max-height:12rem;overflow:auto;padding:8px 10px;border:var(--hnv-border-width,1px) solid var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-control,8px);background:var(--hnv-color-code-bg,#f3f5f8);color:var(--hnv-color-ink,#202938);font-family:var(--hnv-font-mono,"Cascadia Mono",Consolas,monospace);font-size:var(--hnv-font-size-small,13px);white-space:pre-wrap;overflow-wrap:anywhere';

  function styled(tag, css, value) {
    var node = document.createElement(tag);
    if (css) node.style.cssText = css;
    if (value != null) node.textContent = String(value);
    return node;
  }

  function demoRoot(host) {
    var root = styled('div', rootStyle);
    host.appendChild(root);
    return root;
  }

  function intro(value) {
    return styled('p', introStyle, value);
  }

  function note(value) {
    return styled('p', noteStyle, value);
  }

  function toolbar() {
    return styled('div', toolbarStyle);
  }

  function stage() {
    return styled('div', stageStyle);
  }

  function card(title, description) {
    var box = styled('div', cardStyle);
    box.appendChild(styled('div', 'font-size:var(--hnv-font-size-label,14px);font-weight:650;line-height:1.5', title));
    if (description) box.appendChild(note(description));
    return box;
  }

  function button(label, handler) {
    var node = styled('button', buttonStyle, label);
    node.type = 'button';
    if (typeof handler === 'function') node.addEventListener('click', handler);
    return node;
  }

  function status(initial) {
    var node = styled('p', outputStyle, initial || '');
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    return node;
  }

  function column(title, description) {
    var box = card(title, description);
    box.appendChild(styled('div', 'height:10px'));
    return box;
  }

  function describeValue(value) {
    if (value == null) return 'null';
    if (Array.isArray(value)) return '[' + value.join(', ') + ']';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  function safeDestroy(instance) {
    if (instance && typeof instance.destroy === 'function') {
      try { instance.destroy(); } catch (error) { /* destroy must not block the rest of demo cleanup */ }
    }
  }

  /* F09 */
  demos['F09'] = function (host) {
    var root = demoRoot(host);
    var output = status('尚未操作。');
    var stageEl = stage();
    var primaryHost = styled('div', 'min-width:0');
    var disabledHost = styled('div', 'min-width:0');
    var primary = window.NoteUI.Switch.mount(primaryHost, {
      label: '启用每日摘要',
      checked: true,
      hint: '点击开关立即切换，不等待表单提交。',
      onChange: function (checked, event) {
        output.textContent = '用户切换：' + (checked ? '已开启' : '已关闭') + '；事件类型 ' + (event && event.type ? event.type : '未知') + '。';
      }
    });
    var disabled = window.NoteUI.Switch.mount(disabledHost, {
      label: '同步到云端',
      checked: false,
      disabled: true,
      hint: '演示中的禁用状态。',
      disabledReason: '当前演示未连接账号，因此不可切换。',
      onChange: function () {
        output.textContent = '禁用开关不应触发 onChange。';
      }
    });
    stageEl.appendChild(primaryHost);
    stageEl.appendChild(disabledHost);
    var bar = toolbar();
    bar.appendChild(button('程序设为关闭（不触发 onChange）', function () {
      primary.update({ checked: false });
      output.textContent = 'update({ checked: false }) 已更新显示；未触发 onChange。当前 getValue() = ' + primary.getValue() + '。';
    }));
    bar.appendChild(button('程序设为开启', function () {
      primary.update({ checked: true });
      output.textContent = 'update({ checked: true }) 已更新显示；未触发 onChange。当前 getValue() = ' + primary.getValue() + '。';
    }));
    root.appendChild(intro('Switch 表示持久的布尔开/关状态，使用原生 button 与 role="switch"，Space/Enter 可用。它不同于 A03 Toggle 的“按下态按钮”：Switch 立即改变状态，Toggle 更接近一次性或成组的按压选择。'));
    root.appendChild(stageEl);
    root.appendChild(note('禁用原因和辅助说明在正常阅读路径中可见；不靠悬停标题解释。'));
    root.appendChild(bar);
    root.appendChild(output);
    return {
      destroy: function () {
        safeDestroy(primary);
        safeDestroy(disabled);
        root.remove();
      }
    };
  };

  /* F10 */
  demos['F10'] = function (host) {
    var root = demoRoot(host);
    var output = status('尚未操作。');
    var stageEl = stage();
    var cols = styled('div', twoColStyle);
    var singleCol = column('单值：字号', '可见读数与 format() 输出；原生 range 提供键盘操作。');
    var rangeCol = column('区间：预算', '两个原生 range 叠加表达区间，起点不能越过终点。');
    var singleHost = styled('div', 'min-width:0');
    var rangeHost = styled('div', 'min-width:0');
    var single = window.NoteUI.Slider.mount(singleHost, {
      label: '正文字号',
      hint: '范围 12–32 px，步长 2。',
      min: 12,
      max: 32,
      step: 2,
      value: 18,
      showValue: true,
      format: function (value) { return value + ' px'; },
      onChange: function (value) {
        output.textContent = '字号用户改为 ' + value + ' px。';
      }
    });
    var range = window.NoteUI.Slider.mount(rangeHost, {
      label: '印刷预算',
      hint: '范围 0–100，步长 10；区间读数同时显示两端。',
      min: 0,
      max: 100,
      step: 10,
      range: true,
      value: [30, 80],
      showValue: true,
      format: function (value) { return value + ' 分'; },
      onChange: function (value) {
        output.textContent = '预算区间用户改为 ' + value[0] + '–' + value[1] + ' 分。';
      }
    });
    singleCol.appendChild(singleHost);
    rangeCol.appendChild(rangeHost);
    cols.appendChild(singleCol);
    cols.appendChild(rangeCol);
    stageEl.appendChild(cols);
    var bar = toolbar();
    bar.appendChild(button('程序设为 24 px（不触发 onChange）', function () {
      single.update({ value: 24 });
      output.textContent = '单值已程序更新为 ' + single.getValue() + ' px；onChange 未触发。';
    }));
    bar.appendChild(button('程序设为 40–60 分', function () {
      range.update({ value: [40, 60] });
      output.textContent = '区间已程序更新为 ' + describeValue(range.getValue()) + '；onChange 未触发。';
    }));
    bar.appendChild(button('恢复初始值', function () {
      single.update({ value: 18 });
      range.update({ value: [30, 80] });
      output.textContent = '已恢复 18 px 与 30–80 分（程序更新不触发 onChange）。';
    }));
    root.appendChild(intro('Slider 的数值必须能直接读出：可见 output 加 input 的 aria-valuetext 同时表达格式化结果。单值优先原生 range；区间用两个原生 range，不交叉。'));
    root.appendChild(stageEl);
    root.appendChild(note('键盘：方向键逐格调整，Home/End 到端点；浏览器还提供 PageUp/PageDown。减少动效不会移除轨道和读数。'));
    root.appendChild(bar);
    root.appendChild(output);
    return {
      destroy: function () {
        safeDestroy(single);
        safeDestroy(range);
        root.remove();
      }
    };
  };

  /* F11 */
  demos['F11'] = function (host) {
    var root = demoRoot(host);
    var NoteUI = window.NoteUI || {};
    if (!NoteUI.Form) {
      root.appendChild(note('缺少 NoteUI.Form（需要 core 与 ui-forms-basic）。'));
      return { destroy: function () { root.remove(); } };
    }
    var output = status('尚未提交。');
    var json = styled('pre', jsonStyle, '提交结果会显示在这里。');
    var customHost = document.createElement('div');
    var customControl = null;
    if (NoteUI.TextInput) {
      customControl = NoteUI.TextInput.mount(customHost, {
        value: 'DEMO-2026',
        placeholder: '例如 DEMO-2026',
        onChange: function () { /* 宿主自有回调；Form 会在失焦/提交时读取 getValue() */ }
      });
    } else {
      customControl = document.createElement('input');
      customControl.type = 'text';
      customControl.value = 'DEMO-2026';
      customHost.appendChild(customControl);
    }
    var stageEl = stage();
    var form = NoteUI.Form.mount(stageEl, {
      label: '活动报名（画廊演示）',
      fields: [
        { name: 'name', label: '姓名', control: 'text', required: true, defaultValue: '林小雨', hint: '显示在分享页的署名。', options: { placeholder: '请输入姓名' } },
        { name: 'email', label: '邮箱', control: 'text', required: true, hint: '仅用于本次本地演示，不会发送。', options: { placeholder: 'name@example.com' }, validate: function (value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : '请输入完整的邮箱地址。'; } },
        { name: 'age', label: '年龄', control: 'number', hint: '可留空；空值不会当成 0。', options: { min: 12, max: 120, step: 1, placeholder: '例如 28' } },
        { name: 'role', label: '参与方式', control: 'select', defaultValue: 'reader', options: [{ value: 'reader', label: '仅阅读' }, { value: 'editor', label: '参与编辑' }] },
        { name: 'agree', label: '同意仅在本页使用这些信息', control: 'checkbox', required: true },
        { name: 'notify', label: '接收更新提醒', control: 'switch', defaultValue: true, hint: '作为表单值提交，开关本身不负责发送通知。' },
        { name: 'volume', label: '摘要详细程度', control: 'slider', defaultValue: 60, hint: '数值随表单一起提交。', options: { min: 0, max: 100, step: 10, format: function (value) { return value + '%'; } } },
        { name: 'invite', label: '邀请码（custom 控件）', control: 'custom', custom: customControl, hint: '宿主传入的 TextInput 实例；Form 负责字段外壳与错误。' }
      ],
      onChange: function (values, changedName) {
        output.textContent = '用户修改：' + changedName + '；当前姓名=' + values.name + '，提醒=' + (values.notify ? '开' : '关') + '。';
      },
      onSubmit: function (values) {
        output.textContent = '校验通过，已调用宿主 onSubmit；未发网络请求。';
        json.textContent = JSON.stringify(values, null, 2);
      }
    });
    var bar = toolbar();
    bar.appendChild(button('填入无效值并提交', function () {
      form.update({ values: { name: '', email: 'reader@', agree: false } });
      var ok = form.submit();
      output.textContent = ok ? '意外通过。' : '校验未通过：错误摘要可见，焦点已移到第一个错误字段；提交未发生。';
    }));
    bar.appendChild(button('填入有效值并提交', function () {
      form.update({ values: { name: '周岚', email: 'zhou@example.com', age: 30, role: 'editor', agree: true, notify: false, volume: 80, invite: 'DEMO-7788' } });
      var ok = form.submit();
      output.textContent = ok ? '程序填入后提交成功；update() 本身没有触发 onChange。' : '仍存在校验错误。';
    }));
    bar.appendChild(button('清空外部错误', function () {
      form.setErrors({});
      output.textContent = '已通过 setErrors({}) 清除错误；校验值保持不变。';
    }));
    root.appendChild(intro('Form 组合 Field 与已有控件：取值、重置、同步校验和首错聚焦由一个入口管理。提交只调用宿主回调，不生成网络请求；程序 update() 不是用户事件。'));
    root.appendChild(stageEl);
    root.appendChild(note('默认在 submit 与 blur 时校验；这里保留默认时机。内置“提交”和“重置”按钮是表单自身操作；重置恢复 defaultValue，不触发 onChange。custom 实例的生命周期由本演示自行销毁。'));
    root.appendChild(bar);
    root.appendChild(output);
    root.appendChild(json);
    return {
      destroy: function () {
        safeDestroy(form);
        safeDestroy(customControl);
        root.remove();
      }
    };
  };

  /* F12 */
  demos['F12'] = function (host) {
    var root = demoRoot(host);
    var output = status('尚未操作。');
    var stageEl = stage();
    var cols = styled('div', twoColStyle);
    var singleCol = column('单日与禁用日期', '周末和 2026-10-20 不可选；文本格式固定 YYYY-MM-DD。');
    var rangeCol = column('日期范围', '范围按开始 ≤ 结束整理；第二端选完即关闭。');
    var singleHost = styled('div', 'min-width:0');
    var rangeHost = styled('div', 'min-width:0');
    var weekendRule = function (iso, date) {
      var day = date ? date.getDay() : 1;
      return day === 0 || day === 6 || iso === '2026-10-20';
    };
    var single = window.NoteUI.DatePicker.mount(singleHost, {
      label: '活动日期',
      hint: '演示固定“今天”为 2026-10-27，方便复现禁用日期。',
      value: '2026-10-15',
      min: '2026-10-01',
      max: '2026-12-31',
      today: '2026-10-27',
      disabledDates: weekendRule,
      onChange: function (value) {
        output.textContent = '单日用户选择：' + describeValue(value) + '。';
      }
    });
    var range = window.NoteUI.DatePicker.mount(rangeHost, {
      label: '报名起止',
      hint: '范围值可先选部分端点；关闭后保留部分范围，getValue() 返回 {start, end}。',
      range: true,
      value: { start: '2026-11-03', end: '2026-11-10' },
      min: '2026-10-01',
      max: '2026-12-31',
      today: '2026-10-27',
      disabledDates: weekendRule,
      onChange: function (value) {
        output.textContent = '范围用户选择：' + describeValue(value) + '。';
      }
    });
    singleCol.appendChild(singleHost);
    rangeCol.appendChild(rangeHost);
    cols.appendChild(singleCol);
    cols.appendChild(rangeCol);
    stageEl.appendChild(cols);
    var bar = toolbar();
    bar.appendChild(button('向单日写入非法值（程序）', function () {
      single.update({ value: '2026-02-30' });
      output.textContent = '已程序写入非法文本；错误可见，getValue() = ' + describeValue(single.getValue()) + '，onChange 未触发。';
    }));
    bar.appendChild(button('恢复单日 2026-10-15', function () {
      single.update({ value: '2026-10-15' });
      output.textContent = '单日已恢复；getValue() = ' + describeValue(single.getValue()) + '（程序更新不触发 onChange）。';
    }));
    bar.appendChild(button('清空范围（程序）', function () {
      range.update({ value: null });
      output.textContent = '范围已清空；getValue() = ' + describeValue(range.getValue()) + '。';
    }));
    root.appendChild(intro('DatePicker 把日历选择与严格文本输入放在一起。日期只按本地日历处理，不做时区换算；禁用规则来自 min/max 与数组或函数形式的 disabledDates。'));
    root.appendChild(stageEl);
    root.appendChild(note('键盘：打开后方向键移动一天/一周，Home/End 到本周两端，PageUp/PageDown 换月，Shift+PageUp/PageDown 换年；Esc 关闭并把焦点还给触发点。外点关闭。'));
    root.appendChild(bar);
    root.appendChild(output);
    return {
      destroy: function () {
        safeDestroy(single);
        safeDestroy(range);
        root.remove();
      }
    };
  };

  /* F13 */
  demos['F13'] = function (host) {
    var root = demoRoot(host);
    var output = status('尚未操作。');
    var stageEl = stage();
    var pickerHost = styled('div', 'min-width:0;max-width:32rem');
    var picker = window.NoteUI.TimePicker.mount(pickerHost, {
      label: '提醒时间（含秒）',
      hint: '演示开启秒，便于检查步长与边界。',
      value: '09:30:00',
      seconds: true,
      step: 30,
      min: '08:00:00',
      max: '18:00:00',
      onChange: function (value) {
        output.textContent = '用户选择：' + describeValue(value) + '。';
      }
    });
    stageEl.appendChild(pickerHost);
    var bar = toolbar();
    bar.appendChild(button('程序设为范围末端', function () {
      picker.update({ value: '18:00:00' });
      output.textContent = '程序更新为 ' + describeValue(picker.getValue()) + '；onChange 未触发。';
    }));
    bar.appendChild(button('写入非法时间', function () {
      picker.update({ value: '25:00:00' });
      output.textContent = '非法时间未提交；getValue() = ' + describeValue(picker.getValue()) + '，错误可见。';
    }));
    bar.appendChild(button('恢复 09:30:00', function () {
      picker.update({ value: '09:30:00' });
      output.textContent = '已恢复 09:30:00（程序更新不触发 onChange）。';
    }));
    root.appendChild(intro('TimePicker 只处理本地时:分（可选秒），不涉及日期或时区换算。文本输入严格解析；下拉浮层中的时/分/秒用原生 select，键盘方向键和首字母均可导航。'));
    root.appendChild(stageEl);
    root.appendChild(note('本次演示开启秒，格式固定 HH:mm:ss，step 按秒计。min/max 含端点，超界组合在浮层中给出可见错误且不会静默改成别的值。'));
    root.appendChild(bar);
    root.appendChild(output);
    return {
      destroy: function () {
        safeDestroy(picker);
        root.remove();
      }
    };
  };

  /* F14 */
  demos['F14'] = function (host) {
    var root = demoRoot(host);
    var output = status('尚未操作。');
    var stageEl = stage();
    var brandPalette = ['#315cda', '#1f2937', '#b23a45', '#ca8a04', '#15803d', '#0d9488', '#7c3aed', '#ffffff'];
    var pickerHost = styled('div', 'min-width:0;max-width:34rem');
    var picker = window.NoteUI.ColorPicker.mount(pickerHost, {
      label: '主题强调色',
      hint: '演示色板可替换；文本输入支持 #rgb 与 #rrggbb。',
      value: '#315cda',
      palette: brandPalette,
      onChange: function (value) {
        output.textContent = '用户选择颜色：' + describeValue(value) + '（输出规范为小写 #rrggbb）。';
      }
    });
    stageEl.appendChild(pickerHost);
    var bar = toolbar();
    bar.appendChild(button('写入带透明度的值（程序）', function () {
      picker.update({ value: 'rgba(49, 92, 218, 0.5)' });
      output.textContent = '透明度不在支持范围内；错误可见，getValue() = ' + describeValue(picker.getValue()) + '，onChange 未触发。';
    }));
    bar.appendChild(button('恢复品牌色 #315cda', function () {
      picker.update({ value: '#315cda' });
      output.textContent = '已恢复 ' + describeValue(picker.getValue()) + '（程序更新不触发 onChange）。';
    }));
    bar.appendChild(button('替换色板', function () {
      picker.update({ palette: ['#111827', '#dc2626', '#ea580c', '#16a34a', '#0ea5e9'] });
      output.textContent = '色板已替换；当前颜色保持 ' + describeValue(picker.getValue()) + '。';
    }));
    root.appendChild(intro('ColorPicker 同时提供预设色板、原生 input[type=color] 和文本值。支持 #rgb / #rrggbb 输入，规范化输出 #rrggbb；明确不支持透明度（alpha）。'));
    root.appendChild(stageEl);
    root.appendChild(note('文本非法时错误直接可见，且不会被当作“上一个有效值”提交。原生拾色器提供可靠的系统选色入口；色板按钮是有可见标签与选中勾的非纯颜色状态。'));
    root.appendChild(bar);
    root.appendChild(output);
    return {
      destroy: function () {
        safeDestroy(picker);
        root.remove();
      }
    };
  };

  /* F15 */
  demos['F15'] = function (host) {
    var root = demoRoot(host);
    var output = status('尚未选择文件。');
    var stageEl = stage();
    var fileHost = styled('div', 'min-width:0;max-width:38rem');
    var fileInput = window.NoteUI.FileInput.mount(fileHost, {
      label: '演示附件',
      hint: '仅演示本地选择；文件不会离开浏览器。',
      multiple: true,
      accept: '.txt,.md,image/*',
      maxSize: 20 * 1024,
      maxFiles: 3,
      onChange: function (files) {
        output.textContent = '用户操作后已选 ' + files.length + ' 个文件：' + (files.length ? files.map(function (file) { return file.name; }).join('、') : '（空）') + '。';
      }
    });
    stageEl.appendChild(fileHost);

    function simulateDrop(files) {
      if (typeof DataTransfer === 'undefined' || typeof DragEvent === 'undefined') {
        output.textContent = '当前浏览器不支持模拟拖入，请使用“选择文件”。';
        return;
      }
      var dt = new DataTransfer();
      files.forEach(function (file) { dt.items.add(file); });
      var drop = fileInput.el.querySelector('.nui-fileinput__drop');
      drop.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
      drop.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    }

    function makeFile(name, type, size) {
      var body = new Array(Math.max(1, size)).join('x');
      return new File([body], name, { type: type });
    }

    var bar = toolbar();
    bar.appendChild(button('模拟拖入两个合法文件', function () {
      simulateDrop([
        new File(['# 演示'], 'notes.md', { type: 'text/markdown' }),
        new File(['demo'], 'readme.txt', { type: 'text/plain' })
      ]);
    }));
    bar.appendChild(button('模拟拖入超限文件', function () {
      simulateDrop([makeFile('too-large.txt', 'text/plain', 30 * 1024)]);
    }));
    bar.appendChild(button('模拟拖入类型不符', function () {
      simulateDrop([new File(['MZ'], 'setup.exe', { type: 'application/x-msdownload' })]);
    }));
    bar.appendChild(button('程序清空（不触发 onChange）', function () {
      fileInput.update({ files: [] });
      output.textContent = '已通过 update({ files: [] }) 清空；onChange 未触发。';
    }));
    root.appendChild(intro('FileInput 只在浏览器内选择或拖入文件，展示清单与拒绝原因，不假装服务端上传。可见的“选择文件”按钮同时是拖放区与键盘入口；原生 input 隐藏但在每次选择后重置。'));
    root.appendChild(stageEl);
    root.appendChild(note('限制：accept 为 .txt/.md/image/*；单文件 ≤ 20 KB；最多 3 个。每个文件可单独移除，也可用组件内的“全部清除”。重复选择同一文件可以再次触发选择流程。'));
    root.appendChild(bar);
    root.appendChild(output);
    return {
      destroy: function () {
        safeDestroy(fileInput);
        root.remove();
      }
    };
  };
})();
