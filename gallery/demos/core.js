/* gallery/demos/core.js — real demos for I01–I05 shared foundations.
   Uses only public NoteCore APIs and local DOM for demo chrome. No network. */
(function () {
  'use strict';

  var demos = window.NoteGalleryDemos = window.NoteGalleryDemos || {};
  var FONT = 'var(--hnv-font-family,"Segoe UI","Microsoft YaHei UI","Microsoft YaHei","PingFang SC",sans-serif)';
  var ROOT_STYLE = 'box-sizing:border-box;display:flex;flex-direction:column;gap:14px;width:100%;max-width:100%;min-width:0;font-family:' + FONT + ';font-size:var(--hnv-font-size-label,14px);line-height:var(--hnv-font-line-reading,1.65);color:var(--hnv-color-ink,#202938);overflow-wrap:anywhere';
  var INTRO_STYLE = 'margin:0;max-width:72ch;font-size:var(--hnv-font-size-reading,16px);line-height:var(--hnv-font-line-reading,1.65);color:var(--hnv-color-muted,#5c6879)';
  var NOTE_STYLE = 'margin:0;color:var(--hnv-color-muted,#5c6879);font-size:var(--hnv-font-size-secondary,13px);line-height:1.6';
  var STATUS_STYLE = 'margin:0;min-height:1.6em;color:var(--hnv-color-ink,#202938);font-size:var(--hnv-font-size-secondary,13px);line-height:1.6';
  var CARD_STYLE = 'box-sizing:border-box;min-width:0;max-width:100%;padding:var(--hnv-space-4,16px);border:var(--hnv-border-width,1px) solid var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-object,10px);background:var(--hnv-color-surface,#fff);overflow-wrap:anywhere';
  var QUIET_STYLE = 'box-sizing:border-box;min-width:0;max-width:100%;padding:var(--hnv-space-4,16px);border:var(--hnv-border-width,1px) solid var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-control,8px);background:var(--hnv-color-page,#f4f6f9);overflow-wrap:anywhere';
  var ROW_STYLE = 'display:flex;flex-wrap:wrap;align-items:center;gap:var(--hnv-space-2,8px);min-width:0;max-width:100%';
  var BUTTON_STYLE = 'box-sizing:border-box;max-width:100%;min-height:var(--hnv-control-height,36px);padding:6px 12px;border:var(--hnv-border-width,1px) solid var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-control,8px);background:var(--hnv-color-surface,#fff);color:var(--hnv-color-ink,#202938);font-family:inherit;font-size:var(--hnv-font-size-label,14px);font-weight:600;line-height:1.4;text-align:center;white-space:normal;overflow-wrap:anywhere;cursor:pointer';
  var TITLE_STYLE = 'margin:0;font-size:var(--hnv-font-size-heading,20px);font-weight:var(--hnv-font-weight-strong,600);line-height:1.4;color:var(--hnv-color-ink,#202938)';
  var SUBTITLE_STYLE = 'margin:0;font-size:var(--hnv-font-size-label,14px);font-weight:var(--hnv-font-weight-strong,600);line-height:1.45;color:var(--hnv-color-ink,#202938)';

  function make(tag, css, textValue) {
    var node = document.createElement(tag);
    if (css) node.style.cssText = css;
    if (textValue != null) node.textContent = textValue;
    return node;
  }

  function button(label, action, extraStyle) {
    var node = make('button', BUTTON_STYLE + (extraStyle ? ';' + extraStyle : ''), label);
    node.type = 'button';
    if (action) node.setAttribute('data-core-action', action);
    return node;
  }

  function demoRoot(host, id) {
    var root = make('div', ROOT_STYLE);
    root.className = 'core-demo core-demo--' + id.toLowerCase();
    root.setAttribute('data-core-demo', id);
    host.appendChild(root);
    return root;
  }

  function statusLine() {
    var node = make('p', STATUS_STYLE, '');
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    node.setAttribute('data-core-status', '');
    return node;
  }

  function sectionTitle(textValue) {
    return make('p', SUBTITLE_STYLE, textValue);
  }

  function paintPressed(node, active) {
    node.setAttribute('aria-pressed', active ? 'true' : 'false');
    node.style.background = active ? 'var(--hnv-color-accent-soft,#eef2ff)' : 'var(--hnv-color-surface,#fff)';
    node.style.borderColor = active ? 'var(--hnv-color-accent,#315cda)' : 'var(--hnv-color-border,#dce2ea)';
    node.style.color = active ? 'var(--hnv-color-accent,#315cda)' : 'var(--hnv-color-ink,#202938)';
  }

  function cssValue(name, fallback) {
    try {
      var value = window.getComputedStyle(document.documentElement).getPropertyValue(name);
      return value && String(value).trim() ? String(value).trim() : (fallback || '');
    } catch (error) {
      return fallback || '';
    }
  }

  function setPressedGroup(entries, current) {
    entries.forEach(function (entry) {
      paintPressed(entry.button, entry.value === current);
    });
  }

  /* ------------------------------------------------------------------ I01 */

  demos['I01'] = function (host) {
    var C = window.NoteCore;
    var root = demoRoot(host, 'I01');
    root.appendChild(make('p', INTRO_STYLE, '共享 tokens 是候选默认值，不是冻结主题。下面的字号和间距预设只覆盖本演示内部的 --hnv-* 变量，不修改页面根元素。'));

    var typeKeys = [
      '--hnv-font-size-reading', '--hnv-font-line-reading', '--hnv-font-size-label',
      '--hnv-font-size-data', '--hnv-font-size-heading'
    ];
    var spaceKeys = [
      '--hnv-space-object-inner', '--hnv-space-object-gap',
      '--hnv-space-group', '--hnv-space-stage'
    ];

    function readPreset(attribute, value, keys) {
      var html = document.documentElement;
      var previous = html.getAttribute(attribute);
      try {
        html.setAttribute(attribute, value);
        var computed = window.getComputedStyle(html);
        var result = {};
        keys.forEach(function (key) {
          result[key] = computed.getPropertyValue(key).trim();
        });
        return result;
      } finally {
        if (previous == null) html.removeAttribute(attribute);
        else html.setAttribute(attribute, previous);
      }
    }

    function applyVariables(target, values) {
      Object.keys(values).forEach(function (key) {
        if (values[key]) target.style.setProperty(key, values[key]);
        else target.style.removeProperty(key);
      });
    }

    function clearVariables(target, keys) {
      keys.forEach(function (key) { target.style.removeProperty(key); });
    }

    var sample = make('div', 'box-sizing:border-box;display:grid;gap:var(--hnv-space-object-gap,14px);width:100%;max-width:100%;min-width:0;padding:var(--hnv-space-object-inner,20px);border:var(--hnv-border-width,1px) solid var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-object,10px);background:var(--hnv-color-surface,#fff)');
    sample.setAttribute('data-core-sample', 'I01');
    var sampleTitle = make('div', 'font-size:var(--hnv-font-size-heading,20px);font-weight:var(--hnv-font-weight-strong,600);line-height:1.4');
    sampleTitle.textContent = '局部阅读预设';
    var sampleBody = make('p', 'margin:0;font-size:var(--hnv-font-size-reading,16px);line-height:var(--hnv-font-line-reading,1.65)');
    sampleBody.textContent = '这一段文字检验正文长度与行距是否跟随当前预设。宿主可以在任意作用域覆盖 --hnv-*，而不必替换整套主题。';
    var sampleRow = make('div', 'display:flex;flex-wrap:wrap;align-items:baseline;gap:var(--hnv-space-object-gap,14px);min-width:0');
    var sampleLabel = make('span', 'font-size:var(--hnv-font-size-label,14px);color:var(--hnv-color-muted,#5c6879)', '本月阅读时长');
    var sampleData = make('strong', 'font-size:var(--hnv-font-size-data,24px);line-height:1.2', '4.6 小时');
    var sampleObject = make('div', 'padding:var(--hnv-space-object-inner,20px);border-radius:var(--hnv-radius-object,10px);background:var(--hnv-color-page,#f4f6f9);font-size:var(--hnv-font-size-small,13px);color:var(--hnv-color-muted,#5c6879)', '对象内距由 --hnv-space-object-inner 控制；组与舞台间距则只在对象组合中使用。');
    sampleRow.appendChild(sampleLabel);
    sampleRow.appendChild(sampleData);
    sample.appendChild(sampleTitle);
    sample.appendChild(sampleBody);
    sample.appendChild(sampleRow);
    sample.appendChild(sampleObject);
    root.appendChild(sample);

    var metrics = make('p', NOTE_STYLE, '');
    root.appendChild(metrics);

    var controls = make('div', 'display:grid;gap:10px;min-width:0');
    var typeRow = make('div', ROW_STYLE);
    typeRow.appendChild(make('span', 'font-size:var(--hnv-font-size-small,13px);color:var(--hnv-color-muted,#5c6879)', '阅读字号'));
    var spaceRow = make('div', ROW_STYLE);
    spaceRow.appendChild(make('span', 'font-size:var(--hnv-font-size-small,13px);color:var(--hnv-color-muted,#5c6879)', '间距预设'));
    controls.appendChild(typeRow);
    controls.appendChild(spaceRow);
    root.appendChild(controls);

    var typeChoice = null;
    var spaceChoice = null;
    var typeEntries = [
      { value: null, label: '继承页面' },
      { value: 'standard', label: '标准' },
      { value: 'readable', label: '易读' }
    ].map(function (item) {
      var node = button(item.label, 'type-' + (item.value || 'inherit'), 'min-height:32px;padding:5px 10px');
      typeRow.appendChild(node);
      return { value: item.value, label: item.label, button: node };
    });
    var spaceEntries = [
      { value: null, label: '默认' },
      { value: 'compact', label: '紧凑' },
      { value: 'relaxed', label: '宽松' }
    ].map(function (item) {
      var node = button(item.label, 'space-' + (item.value || 'default'), 'min-height:32px;padding:5px 10px');
      spaceRow.appendChild(node);
      return { value: item.value, label: item.label, button: node };
    });

    var status = statusLine();
    root.appendChild(status);

    function updateMetrics() {
      var style = window.getComputedStyle(sample);
      metrics.textContent = '当前局部值：正文 ' + (style.getPropertyValue('--hnv-font-size-reading').trim() || 'inherit') +
        ' / 行高 ' + (style.getPropertyValue('--hnv-font-line-reading').trim() || 'inherit') +
        ' / 对象内距 ' + (style.getPropertyValue('--hnv-space-object-inner').trim() || 'inherit') +
        '。其中“继承页面”会清掉本演示的局部覆盖。';
    }

    function chooseType(entry) {
      typeChoice = entry.value;
      if (entry.value == null) {
        clearVariables(sample, typeKeys);
      } else {
        applyVariables(sample, readPreset('data-hnv-type', entry.value, typeKeys));
      }
      setPressedGroup(typeEntries, typeChoice);
      updateMetrics();
      status.textContent = '阅读字号：' + entry.label + '。仅覆盖本演示，页面 data-hnv-type 已恢复原值。';
    }

    function chooseSpace(entry) {
      spaceChoice = entry.value;
      if (entry.value == null) {
        clearVariables(sample, spaceKeys);
      } else {
        applyVariables(sample, readPreset('data-hnv-space', entry.value, spaceKeys));
      }
      setPressedGroup(spaceEntries, spaceChoice);
      updateMetrics();
      status.textContent = '间距预设：' + entry.label + '。仅覆盖本演示，页面 data-hnv-space 已恢复原值。';
    }

    typeEntries.forEach(function (entry) {
      entry.button.addEventListener('click', function () { chooseType(entry); });
    });
    spaceEntries.forEach(function (entry) {
      entry.button.addEventListener('click', function () { chooseSpace(entry); });
    });
    setPressedGroup(typeEntries, typeChoice);
    setPressedGroup(spaceEntries, spaceChoice);
    updateMetrics();

    var swatchTitle = make('p', SUBTITLE_STYLE, '语义颜色候选');
    root.appendChild(swatchTitle);
    var swatchGrid = make('div', 'display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:var(--hnv-space-2,8px);min-width:0');
    [
      ['--hnv-color-page', '页面'],
      ['--hnv-color-surface', '表面'],
      ['--hnv-color-accent', '强调'],
      ['--hnv-color-success', '成功'],
      ['--hnv-color-danger', '危险'],
      ['--hnv-color-warning', '警告'],
      ['--hnv-color-overlay', '遮罩']
    ].forEach(function (item) {
      var box = make('div', 'box-sizing:border-box;min-width:0;padding:8px;border:var(--hnv-border-width,1px) solid var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-control,8px);background:var(--hnv-color-surface,#fff)');
      var chip = make('div', 'height:26px;border-radius:6px;border:1px solid var(--hnv-color-border,#dce2ea);background:var(' + item[0] + ')');
      var label = make('div', 'margin-top:5px;font-size:var(--hnv-font-size-caption,12px);font-weight:var(--hnv-font-weight-strong,600)', item[1]);
      var code = make('div', 'font-family:var(--hnv-font-mono,monospace);font-size:11px;line-height:1.4;color:var(--hnv-color-muted,#5c6879);overflow-wrap:anywhere', cssValue(item[0], ''));
      box.appendChild(chip);
      box.appendChild(label);
      box.appendChild(code);
      swatchGrid.appendChild(box);
    });
    root.appendChild(swatchGrid);

    var factsTitle = make('p', SUBTITLE_STYLE, '共享尺度与层级');
    root.appendChild(factsTitle);
    var facts = make('div', 'display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:var(--hnv-space-2,8px);min-width:0');
    [
      ['--hnv-color-focus', '焦点色'],
      ['--hnv-control-height', '控件高度'],
      ['--hnv-radius-panel', '面板圆角'],
      ['--hnv-z-float', '浮层 z-index'],
      ['--hnv-motion-ui', 'UI 动效'],
      ['--hnv-motion-explain', '解释动效']
    ].forEach(function (item) {
      var box = make('div', 'box-sizing:border-box;min-width:0;padding:8px 10px;border:var(--hnv-border-width,1px) solid var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-control,8px);background:var(--hnv-color-page,#f4f6f9)');
      box.appendChild(make('div', 'font-size:var(--hnv-font-size-caption,12px);color:var(--hnv-color-muted,#5c6879)', item[1]));
      box.appendChild(make('div', 'font-family:var(--hnv-font-mono,monospace);font-size:var(--hnv-font-size-small,13px);color:var(--hnv-color-ink,#202938);overflow-wrap:anywhere', cssValue(item[0], '')));
      box.appendChild(make('div', 'font-family:var(--hnv-font-mono,monospace);font-size:11px;color:var(--hnv-color-muted,#5c6879);overflow-wrap:anywhere', item[0]));
      facts.appendChild(box);
    });
    root.appendChild(facts);
    root.appendChild(make('p', NOTE_STYLE, '旧的 --nx-* / --si-* 映射不在 core 中；由独立兼容桥负责。'));

    return function cleanup() {
      root.remove();
    };
  };

  /* ------------------------------------------------------------------ I02 */

  demos['I02'] = function (host) {
    var C = window.NoteCore;
    var root = demoRoot(host, 'I02');
    root.appendChild(make('p', INTRO_STYLE, '图标来自 vendor/lucide/icons 的 68 个本地 SVG 子集。列表按名称排序；点击名称会用公开 API 重新渲染预览。'));

    var names = C.icons.names();
    var currentName = names.indexOf('info') >= 0 ? 'info' : (names[0] || '');
    var currentSize = 24;
    var unknownState = false;
    var records = [];

    var preview = make('div', CARD_STYLE + ';display:flex;flex-wrap:wrap;align-items:center;gap:var(--hnv-space-4,16px)');
    var previewIcon = make('div', 'display:grid;place-items:center;width:76px;height:76px;flex:0 0 auto;border:var(--hnv-border-width,1px) solid var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-object,10px);background:var(--hnv-color-page,#f4f6f9);color:var(--hnv-color-accent,#315cda)');
    previewIcon.setAttribute('data-core-preview-icon', 'I02');
    var previewMeta = make('div', 'display:grid;gap:4px;min-width:0;flex:1 1 220px');
    var previewName = make('p', TITLE_STYLE, '');
    previewName.setAttribute('data-core-preview-name', 'I02');
    var previewInfo = make('p', NOTE_STYLE, '');
    var sizeRow = make('div', ROW_STYLE);
    var sizeEntries = [16, 24, 32].map(function (size) {
      var node = button(String(size) + ' px', 'size-' + size, 'min-height:32px;padding:5px 10px');
      node.addEventListener('click', function () {
        currentSize = size;
        unknownState = false;
        setPressedGroup(sizeEntries, currentSize);
        renderPreview();
      });
      sizeRow.appendChild(node);
      return { value: size, button: node };
    });
    previewMeta.appendChild(previewName);
    previewMeta.appendChild(previewInfo);
    previewMeta.appendChild((function () {
      var wrap = make('div', 'display:grid;gap:4px');
      wrap.appendChild(make('span', 'font-size:var(--hnv-font-size-caption,12px);color:var(--hnv-color-muted,#5c6879)', '预览尺寸'));
      wrap.appendChild(sizeRow);
      return wrap;
    })());
    preview.appendChild(previewIcon);
    preview.appendChild(previewMeta);
    root.appendChild(preview);

    var actions = make('div', ROW_STYLE);
    var unknownButton = button('测试未知名称', 'icon-unknown', 'border-color:var(--hnv-color-warning,#8a5a12);color:var(--hnv-color-warning,#8a5a12)');
    actions.appendChild(unknownButton);
    actions.appendChild(make('span', NOTE_STYLE, '共 ' + names.length + ' 个名称；未知名称返回 null，而不是替代图标。'));
    root.appendChild(actions);

    var status = statusLine();
    root.appendChild(status);

    var listWrap = make('div', 'box-sizing:border-box;max-height:340px;overflow:auto;padding:var(--hnv-space-2,8px);border:var(--hnv-border-width,1px) solid var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-object,10px);background:var(--hnv-color-page,#f4f6f9);min-width:0');
    var grid = make('div', 'display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:6px;min-width:0');
    names.forEach(function (name) {
      var item = button('', 'icon-' + name, 'display:flex;align-items:center;gap:7px;justify-content:flex-start;text-align:start;min-width:0;min-height:36px;padding:6px 8px;font-weight:500');
      item.setAttribute('data-icon-name', name);
      item.setAttribute('aria-pressed', 'false');
      var icon = C.icons.get(name);
      if (icon) {
        icon.setAttribute('width', '18');
        icon.setAttribute('height', '18');
        icon.style.width = '18px';
        icon.style.height = '18px';
        item.appendChild(icon);
      }
      var textNode = make('span', 'min-width:0;font-family:var(--hnv-font-mono,monospace);font-size:11.5px;line-height:1.35;overflow-wrap:anywhere', name);
      item.appendChild(textNode);
      item.addEventListener('click', function () {
        currentName = name;
        unknownState = false;
        renderPreview();
      });
      grid.appendChild(item);
      records.push({ name: name, button: item });
    });
    listWrap.appendChild(grid);
    root.appendChild(listWrap);

    function paintSelection() {
      records.forEach(function (record) {
        var active = !unknownState && record.name === currentName;
        paintPressed(record.button, active);
      });
    }

    function renderPreview() {
      C.clear(previewIcon);
      if (unknownState) {
        previewIcon.appendChild(make('span', 'font-family:var(--hnv-font-mono,monospace);font-size:13px;color:var(--hnv-color-warning,#8a5a12)', 'null'));
        previewName.textContent = '未知名称';
        previewInfo.textContent = "NoteCore.icon('not-a-real-icon') === null；没有创建 SVG。";
        status.textContent = '已测试未知名称：返回 null。点击任意列表项或尺寸恢复预览。';
      } else {
        var icon = C.icon(currentName, { size: currentSize, label: '图标 ' + currentName });
        if (icon) previewIcon.appendChild(icon);
        previewName.textContent = currentName;
        previewInfo.textContent = 'NoteCore.icons.has(name) = ' + String(C.icons.has(currentName)) + '；stroke=currentColor，fill=none。';
        status.textContent = '正在预览 ' + currentName + '（' + currentSize + 'px）。';
      }
      paintSelection();
      setPressedGroup(sizeEntries, currentSize);
    }

    unknownButton.addEventListener('click', function () {
      unknownState = true;
      renderPreview();
    });
    renderPreview();

    return function cleanup() {
      root.remove();
    };
  };

  /* ------------------------------------------------------------------ I03 */

  demos['I03'] = function (host) {
    var C = window.NoteCore;
    var root = demoRoot(host, 'I03');
    root.appendChild(make('p', INTRO_STYLE, '按钮触发真实 Web Animations。动效时长来自共享 tokens；同一元素由后一次播放收敛，系统减少动效开启时不创建动画并立即落定。'));

    var badge = make('p', 'margin:0;display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:5px 10px;border-radius:var(--hnv-radius-pill,999px);border:1px solid var(--hnv-color-border,#dce2ea);background:var(--hnv-color-page,#f4f6f9);font-size:var(--hnv-font-size-small,13px);font-weight:var(--hnv-font-weight-strong,600);color:var(--hnv-color-ink,#202938);align-self:flex-start');
    badge.setAttribute('role', 'status');
    root.appendChild(badge);

    var stage = make('div', CARD_STYLE + ';display:grid;gap:var(--hnv-space-3,12px);position:relative');
    var revealCard = make('div', 'box-sizing:border-box;min-width:0;padding:var(--hnv-space-3,12px);border:var(--hnv-border-width,1px) solid var(--hnv-color-accent,#315cda);border-radius:var(--hnv-radius-object,10px);background:var(--hnv-color-accent-soft,#eef2ff);color:var(--hnv-color-ink,#202938)');
    revealCard.appendChild(make('div', 'font-weight:var(--hnv-font-weight-strong,600);font-size:var(--hnv-font-size-label,14px)', '这次变化解释什么？'));
    revealCard.appendChild(make('p', 'margin:4px 0 0;font-size:var(--hnv-font-size-small,13px);line-height:1.6;color:var(--hnv-color-muted,#5c6879)', '重点从起点移到当前对象；完成后停在终态，不靠循环动画持续吸引注意。'));
    stage.appendChild(revealCard);

    var track = make('div', 'position:relative;min-height:48px;border:var(--hnv-border-width,1px) dashed var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-control,8px);background:var(--hnv-color-page,#f4f6f9);min-width:0');
    var marker = make('div', 'position:absolute;left:0;top:8px;display:grid;place-items:center;width:30px;height:30px;border-radius:var(--hnv-radius-pill,999px);background:var(--hnv-color-accent,#315cda);color:var(--hnv-color-on-accent,#fff);font-size:12px;font-weight:700', '1');
    marker.setAttribute('data-position', 'left');
    track.appendChild(marker);
    track.appendChild(make('span', 'position:absolute;left:10px;bottom:3px;font-size:var(--hnv-font-size-caption,12px);color:var(--hnv-color-muted,#5c6879)', '迁移前'));
    stage.appendChild(track);
    root.appendChild(stage);

    var durationNote = make('p', NOTE_STYLE, '当前 token：解释动效 ' + cssValue('--hnv-motion-explain', '') + '，UI 动效 ' + cssValue('--hnv-motion-ui', '') + '。调用方可为每次动作传不同时长。');
    root.appendChild(durationNote);

    var actions = make('div', ROW_STYLE);
    var playButton = button('重看解释动效', 'motion-play');
    var flipButton = button('迁移标记（FLIP）', 'motion-flip');
    var resetButton = button('重置演示', 'motion-reset');
    actions.appendChild(playButton);
    actions.appendChild(flipButton);
    actions.appendChild(resetButton);
    root.appendChild(actions);

    var status = statusLine();
    root.appendChild(status);

    var alive = true;
    var activePlay = null;
    var activeFlip = null;
    var unsubscribe = null;

    function updateBadge() {
      var isReduced = C.motion.reduced();
      badge.textContent = isReduced ? '减少动效：开（立即落定）' : '减少动效：关（按 token 播放）';
      badge.style.background = isReduced ? 'var(--hnv-color-warning-soft,#fdf5e4)' : 'var(--hnv-color-success-soft,#edf7f1)';
      badge.style.borderColor = isReduced ? 'var(--hnv-color-warning,#8a5a12)' : 'var(--hnv-color-success,#2e6f4e)';
      badge.style.color = isReduced ? 'var(--hnv-color-warning,#8a5a12)' : 'var(--hnv-color-success,#2e6f4e)';
      return isReduced;
    }

    function resetVisuals() {
      C.motion.stop(revealCard);
      C.motion.stop(marker);
      activePlay = null;
      activeFlip = null;
      revealCard.style.opacity = '';
      revealCard.style.transform = '';
      marker.style.left = '0px';
      marker.setAttribute('data-position', 'left');
    }

    function playReveal() {
      if (!alive) return;
      revealCard.style.opacity = '';
      revealCard.style.transform = '';
      var controller = C.motion.play(revealCard, [
        { opacity: 0, transform: 'translateY(10px)' },
        { opacity: 1, transform: 'translateY(0px)' }
      ], {
        duration: C.motion.explainDuration(),
        easing: cssValue('--hnv-motion-ease-explain', 'ease')
      });
      activePlay = controller;
      status.textContent = '解释动效已触发。再次点击会取消当前并收敛到最新目标。';
      controller.finished.then(function (completed) {
        if (!alive || activePlay !== controller) return;
        if (completed) status.textContent = '解释动效完成，已停在终态。';
        else if (C.motion.reduced()) status.textContent = '减少动效已开启：未创建动画，立即呈现终态。';
        else status.textContent = '本次解释动效被取消或已被新的目标取代。';
      });
    }

    function flipMarker() {
      if (!alive) return;
      C.motion.stop(marker);
      var from = marker.getBoundingClientRect();
      var goingRight = marker.getAttribute('data-position') !== 'right';
      marker.setAttribute('data-position', goingRight ? 'right' : 'left');
      marker.style.left = goingRight ? 'calc(100% - 30px)' : '0px';
      var controller = C.motion.flip(marker, from, {
        duration: C.motion.uiDuration(),
        easing: cssValue('--hnv-motion-ease-ui', 'ease')
      });
      activeFlip = controller;
      status.textContent = 'FLIP 迁移已触发：从旧矩形过渡到当前矩形。';
      controller.finished.then(function (completed) {
        if (!alive || activeFlip !== controller) return;
        if (completed) status.textContent = 'FLIP 完成，标记已在新位置。';
        else if (C.motion.reduced()) status.textContent = '减少动效已开启：标记直接落到新位置。';
        else status.textContent = 'FLIP 被取消或已被新的目标取代。';
      });
    }

    playButton.addEventListener('click', playReveal);
    flipButton.addEventListener('click', flipMarker);
    resetButton.addEventListener('click', function () {
      if (!alive) return;
      resetVisuals();
      status.textContent = '已重置。默认静止；再次点击按钮才会播放。';
    });

    updateBadge();
    status.textContent = '默认静止。选择按钮触发一次可解释的变化，或按系统减少动效设置直接查看终态。';

    if (typeof C.motion.onChange === 'function') {
      unsubscribe = C.motion.onChange(function () {
        if (!alive) return;
        updateBadge();
        resetVisuals();
        status.textContent = '检测到系统减少动效设置变化；在途动画已取消，下一次变化将按新偏好处理。';
      });
    }

    return function cleanup() {
      alive = false;
      if (typeof unsubscribe === 'function') unsubscribe();
      if (activePlay) activePlay.cancel();
      if (activeFlip) activeFlip.cancel();
      C.motion.stop(revealCard);
      C.motion.stop(marker);
      root.remove();
    };
  };

  /* ------------------------------------------------------------------ I04 */

  demos['I04'] = function (host) {
    var C = window.NoteCore;
    var root = demoRoot(host, 'I04');
    root.appendChild(make('p', INTRO_STYLE, '浮层统一由 NoteCore.floating 放到 body 并分配层级。这里演示自动方位、焦点陷阱、Esc/外点只关栈顶，以及关闭后的焦点恢复。'));

    var stage = make('div', QUIET_STYLE + ';display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--hnv-space-3,12px)');
    stage.appendChild(make('p', NOTE_STYLE, '触发按钮在宿主内容里；打开后 Tab 应只在浮层内循环。'));
    var trigger = button('打开定位浮层', 'open-parent');
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    stage.appendChild(trigger);
    root.appendChild(stage);

    var status = statusLine();
    root.appendChild(status);
    root.appendChild(make('p', NOTE_STYLE, '关闭方式：Esc、点击浮层外、或面板内的关闭按钮。嵌套子层打开时，Esc/外点只关子层，父层保持。'));

    var parentTitleId = C.uid('core-demo-float-title');
    var childTitleId = C.uid('core-demo-float-child-title');
    var parentContent = make('div', 'display:grid;gap:var(--hnv-space-3,12px);padding:var(--hnv-space-4,16px);min-width:0;max-width:100%');
    var parentTitle = make('p', TITLE_STYLE + ';font-size:var(--hnv-font-size-heading,18px)', '定位与焦点浮层');
    parentTitle.id = parentTitleId;
    parentContent.appendChild(parentTitle);
    parentContent.appendChild(make('p', NOTE_STYLE, '实际方位会写入 data-placement。当前使用 auto：根据锚点周围空间选择方向，并夹紧在视口内。'));
    var focusCheck = button('确认焦点在浮层内', 'focus-check');
    var nestedButton = button('打开嵌套子层', 'open-child');
    var closeParentButton = button('关闭全部浮层', 'close-parent');
    nestedButton.setAttribute('aria-haspopup', 'dialog');
    nestedButton.setAttribute('aria-expanded', 'false');
    var parentActions = make('div', ROW_STYLE);
    parentActions.appendChild(focusCheck);
    parentActions.appendChild(nestedButton);
    parentActions.appendChild(closeParentButton);
    parentContent.appendChild(parentActions);
    parentContent.appendChild(make('p', NOTE_STYLE, '焦点陷阱只在 trapFocus:true 时启用；关闭时若原焦点仍 connected，会恢复到打开前的元素。'));

    var childContent = make('div', 'display:grid;gap:var(--hnv-space-3,12px);padding:var(--hnv-space-4,16px);min-width:0;max-width:100%');
    var childTitle = make('p', TITLE_STYLE + ';font-size:var(--hnv-font-size-heading,18px)', '嵌套子层');
    childTitle.id = childTitleId;
    childContent.appendChild(childTitle);
    childContent.appendChild(make('p', NOTE_STYLE, '这是同一活动栈中的第二层。按 Esc 会先关闭本层，并把焦点还给“打开嵌套子层”。'));
    var closeChildButton = button('关闭子层', 'close-child');
    childContent.appendChild(closeChildButton);

    var parentLayer = null;
    var childLayer = null;
    var alive = true;

    parentLayer = C.floating.create({
      anchor: trigger,
      content: parentContent,
      placement: 'auto',
      offset: 8,
      role: 'dialog',
      className: 'core-demo-floating core-demo-floating--parent',
      modal: false,
      backdrop: false,
      trapFocus: true,
      returnFocus: true,
      closeOnEsc: true,
      closeOnOutside: true,
      lockScroll: false,
      maxWidth: 'min(92vw, 24rem)',
      onOpen: function () {
        trigger.setAttribute('aria-expanded', 'true');
        if (!alive) return;
        status.textContent = '父层已打开，实际方位：' + parentLayer.root.getAttribute('data-placement') +
          '。焦点已进入面板；Tab / Shift+Tab 在面板内循环。';
      },
      onClose: function (reason) {
        trigger.setAttribute('aria-expanded', 'false');
        if (!alive) return;
        var returned = document.activeElement === trigger;
        status.textContent = '父层已关闭（' + reason + '）。' + (returned ? '焦点已恢复到触发按钮。' : '焦点由关闭前的交互目标接管。');
      }
    });
    parentLayer.el.id = C.uid('core-demo-float-panel');
    parentLayer.el.setAttribute('aria-labelledby', parentTitleId);
    parentLayer.el.setAttribute('data-core-demo-layer', 'parent');
    trigger.setAttribute('aria-controls', parentLayer.el.id);

    childLayer = C.floating.create({
      anchor: nestedButton,
      content: childContent,
      placement: 'auto',
      offset: 6,
      role: 'dialog',
      className: 'core-demo-floating core-demo-floating--child',
      modal: false,
      backdrop: false,
      trapFocus: true,
      returnFocus: true,
      closeOnEsc: true,
      closeOnOutside: true,
      lockScroll: false,
      maxWidth: 'min(92vw, 20rem)',
      onOpen: function () {
        nestedButton.setAttribute('aria-expanded', 'true');
        if (!alive) return;
        status.textContent = '嵌套子层已打开，实际方位：' + childLayer.root.getAttribute('data-placement') + '。Esc 只会关闭子层。';
      },
      onClose: function (reason) {
        nestedButton.setAttribute('aria-expanded', 'false');
        if (!alive) return;
        if (parentLayer.isOpen()) status.textContent = '子层已关闭（' + reason + '）；父层仍保持打开。';
      }
    });
    childLayer.el.id = C.uid('core-demo-float-child-panel');
    childLayer.el.setAttribute('aria-labelledby', childTitleId);
    childLayer.el.setAttribute('data-core-demo-layer', 'child');
    nestedButton.setAttribute('aria-controls', childLayer.el.id);

    trigger.addEventListener('click', function () {
      if (!alive) return;
      if (!parentLayer.isOpen()) parentLayer.open();
    });
    focusCheck.addEventListener('click', function () {
      if (!alive) return;
      var inside = parentLayer.el.contains(document.activeElement);
      status.textContent = inside
        ? '焦点确实在父层面板内。按 Tab 或 Shift+Tab 观察循环。'
        : '当前焦点在面板外；组件应在 trapFocus 打开时把焦点移入面板。';
    });
    nestedButton.addEventListener('click', function () {
      if (!alive || !parentLayer.isOpen()) return;
      if (!childLayer.isOpen()) childLayer.open();
    });
    closeChildButton.addEventListener('click', function () {
      if (childLayer.isOpen()) childLayer.close('select');
    });
    closeParentButton.addEventListener('click', function () {
      if (childLayer.isOpen()) childLayer.close('api');
      if (parentLayer.isOpen()) parentLayer.close('api');
    });

    return function cleanup() {
      alive = false;
      trigger.setAttribute('aria-expanded', 'false');
      nestedButton.setAttribute('aria-expanded', 'false');
      try { childLayer.destroy(); } catch (error) {}
      try { parentLayer.destroy(); } catch (error) {}
      try { C.floating.closeAll('api'); } catch (error) {}
      root.remove();
    };
  };

  /* ------------------------------------------------------------------ I05 */

  demos['I05'] = function (host) {
    var C = window.NoteCore;
    var root = demoRoot(host, 'I05');
    root.appendChild(make('p', INTRO_STYLE, '内容规则：字符串只写入 textContent；传入 DOM 节点会被移入而不是克隆。生命周期示例在 root 上挂载 component，update 赋自有键后 render，destroy 幂等并移除 root。'));

    var status = statusLine();
    var layout = make('div', 'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:var(--hnv-space-3,12px);min-width:0');
    root.appendChild(layout);
    root.appendChild(status);

    var stringCard = make('div', CARD_STYLE + ';display:grid;gap:10px');
    stringCard.appendChild(make('p', SUBTITLE_STYLE, '字符串：不解析 HTML'));
    var stringTarget = make('div', QUIET_STYLE + ';min-height:64px;font-size:var(--hnv-font-size-small,13px);line-height:1.65');
    stringTarget.setAttribute('data-core-target', 'string');
    stringCard.appendChild(stringTarget);
    var stringMeta = make('p', NOTE_STYLE, '');
    stringCard.appendChild(stringMeta);
    var stringActions = make('div', ROW_STYLE);
    var stringHtmlButton = button('放入含标签文本', 'set-string');
    var stringClearButton = button('清空', 'clear-string');
    stringActions.appendChild(stringHtmlButton);
    stringActions.appendChild(stringClearButton);
    stringCard.appendChild(stringActions);
    layout.appendChild(stringCard);

    var nodeCard = make('div', CARD_STYLE + ';display:grid;gap:10px');
    nodeCard.appendChild(make('p', SUBTITLE_STYLE, 'DOM 节点：移入，不克隆'));
    var nodeSource = make('div', QUIET_STYLE + ';min-height:48px;display:flex;align-items:center;gap:8px;font-size:var(--hnv-font-size-small,13px)');
    nodeSource.setAttribute('data-core-node-source', 'I05');
    var movable = C.el('span', 'core-demo-node', '可移动内容节点');
    movable.style.cssText = 'display:inline-flex;align-items:center;min-height:30px;padding:4px 9px;border-radius:var(--hnv-radius-pill,999px);background:var(--hnv-color-accent-soft,#eef2ff);color:var(--hnv-color-accent,#315cda);font-weight:var(--hnv-font-weight-strong,600);font-size:var(--hnv-font-size-small,13px)';
    nodeSource.appendChild(movable);
    var nodeTarget = make('div', CARD_STYLE + ';min-height:56px;display:flex;align-items:center;font-size:var(--hnv-font-size-small,13px)');
    nodeTarget.setAttribute('data-core-target', 'node');
    C.setContent(nodeTarget, '节点尚未移入。');
    var nodeMeta = make('p', NOTE_STYLE, '源容器保留在原处；移入后它将变空。');
    nodeCard.appendChild(make('span', 'font-size:var(--hnv-font-size-caption,12px);color:var(--hnv-color-muted,#5c6879)', '源容器'));
    nodeCard.appendChild(nodeSource);
    nodeCard.appendChild(make('span', 'font-size:var(--hnv-font-size-caption,12px);color:var(--hnv-color-muted,#5c6879)', '目标容器'));
    nodeCard.appendChild(nodeTarget);
    nodeCard.appendChild(nodeMeta);
    var nodeActions = make('div', ROW_STYLE);
    var moveNodeButton = button('移入目标', 'move-node');
    var returnNodeButton = button('移回源容器', 'return-node');
    nodeActions.appendChild(moveNodeButton);
    nodeActions.appendChild(returnNodeButton);
    nodeCard.appendChild(nodeActions);
    layout.appendChild(nodeCard);

    var componentCard = make('div', CARD_STYLE + ';display:grid;gap:10px;grid-column:1/-1');
    componentCard.appendChild(make('p', SUBTITLE_STYLE, '生命周期：component / update / destroy'));
    var componentHost = make('div', 'min-width:0');
    componentCard.appendChild(componentHost);
    var componentInfo = make('p', NOTE_STYLE, '');
    componentInfo.setAttribute('data-core-component-info', 'I05');
    componentCard.appendChild(componentInfo);
    var componentActions = make('div', ROW_STYLE);
    var updateButton = button('更新实例（含继承键）', 'update-instance');
    var destroyButton = button('连续销毁两次', 'destroy-instance');
    var remountButton = button('重新挂载实例', 'remount-instance');
    componentActions.appendChild(updateButton);
    componentActions.appendChild(destroyButton);
    componentActions.appendChild(remountButton);
    componentCard.appendChild(componentActions);
    layout.appendChild(componentCard);

    var instance = null;
    var instanceRoot = null;
    var instanceState = null;
    var renders = 0;
    var cleanups = 0;
    var alive = true;

    function renderStringMeta() {
      stringMeta.textContent = '目标内元素子节点：' + stringTarget.children.length + '。字符串会完整显示为文本，不会被解析为元素。';
    }

    function resetString() {
      C.setContent(stringTarget, '初始字符串显示在目标中。');
      renderStringMeta();
    }

    function resetNode() {
      if (movable.parentNode !== nodeSource) nodeSource.appendChild(movable);
      C.setContent(nodeTarget, '节点尚未移入。');
      nodeMeta.textContent = '源容器保留在原处；移入后它将变空。';
    }

    function mountComponent() {
      if (!alive) return;
      if (instance && !instance.destroyed) {
        componentInfo.textContent = '实例仍在运行；先连续销毁，再重新挂载。';
        return;
      }
      instanceRoot = make('div', 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0;padding:10px 12px;border:var(--hnv-border-width,1px) solid var(--hnv-color-border,#dce2ea);border-radius:var(--hnv-radius-control,8px);background:var(--hnv-color-page,#f4f6f9);font-size:var(--hnv-font-size-small,13px)');
      instanceRoot.setAttribute('data-core-component', 'I05-instance');
      instanceState = { label: '已挂载实例', count: 0 };
      var labelNode = make('strong', 'font-size:var(--hnv-font-size-label,14px)', '');
      var countNode = make('span', 'color:var(--hnv-color-muted,#5c6879)', '');
      instanceRoot.appendChild(labelNode);
      instanceRoot.appendChild(countNode);
      function renderComponent() {
        renders += 1;
        labelNode.textContent = instanceState.label;
        countNode.textContent = '· 更新 ' + instanceState.count + ' 次';
      }
      renderComponent();
      componentHost.appendChild(instanceRoot);
      instance = C.component(instanceRoot, instanceState, renderComponent, function () {
        cleanups += 1;
      });
      componentInfo.textContent = '已挂载。初始 render 由调用方执行；当前 render 次数 ' + renders + '，cleanup 次数 ' + cleanups + '。';
    }

    stringHtmlButton.addEventListener('click', function () {
      if (!alive) return;
      C.setContent(stringTarget, '<strong>不会被解析</strong> & 仍然是纯文本');
      renderStringMeta();
      status.textContent = '字符串已写入 textContent；目标中不会出现 strong 元素。';
    });
    stringClearButton.addEventListener('click', function () {
      if (!alive) return;
      C.setContent(stringTarget, null);
      renderStringMeta();
      status.textContent = '字符串目标已通过 setContent(target, null) 清空。';
    });

    moveNodeButton.addEventListener('click', function () {
      if (!alive) return;
      C.setContent(nodeTarget, movable);
      nodeMeta.textContent = '节点已移入目标；源容器当前子节点数：' + nodeSource.childNodes.length + '。';
      status.textContent = 'DOM 节点被移入目标，未克隆；原位置随之变空。';
    });
    returnNodeButton.addEventListener('click', function () {
      if (!alive) return;
      C.append(nodeSource, movable);
      C.setContent(nodeTarget, '节点已移回源容器。');
      nodeMeta.textContent = '节点已移回源容器；移回同样使用 DOM 移动，不克隆。';
      status.textContent = '节点已移回源容器。';
    });

    updateButton.addEventListener('click', function () {
      if (!alive) return;
      if (!instance || instance.destroyed) {
        status.textContent = '实例已销毁，update 为空操作；请先重新挂载。';
        return;
      }
      var patch = Object.create({ inheritedKey: '不会赋给 state' });
      patch.count = (instanceState.count || 0) + 1;
      patch.label = patch.count % 2 ? '更新后状态' : '再次更新';
      instance.update(patch);
      componentInfo.textContent = 'update 已调用：render 次数 ' + renders + '，cleanup 次数 ' + cleanups + '；继承键是否进入 state：' +
        (Object.prototype.hasOwnProperty.call(instanceState, 'inheritedKey') ? '是' : '否') + '。';
      status.textContent = '程序 update 不会触发组件用户事件；这里只观察 render 次数。';
    });

    destroyButton.addEventListener('click', function () {
      if (!alive) return;
      if (!instance || instance.destroyed) {
        status.textContent = '实例已经销毁；destroy 是幂等的。';
        return;
      }
      var liveRoot = instanceRoot;
      instance.destroy();
      instance.destroy();
      componentInfo.textContent = '连续调用 destroy 两次：cleanup 次数 ' + cleanups + '，root 是否移除：' +
        String(!liveRoot.isConnected) + '，destroyed：' + String(instance.destroyed) + '，update 之后为空操作。';
      status.textContent = 'destroy 幂等：第二次调用不再执行 cleanup，也不会把 root 重新挂载。';
    });

    remountButton.addEventListener('click', mountComponent);

    resetString();
    resetNode();
    mountComponent();
    status.textContent = '默认静止。可替换文本、移动节点或更新/销毁组件实例。';

    return function cleanup() {
      alive = false;
      if (instance && !instance.destroyed) instance.destroy();
      instance = null;
      instanceRoot = null;
      root.remove();
    };
  };
})();
