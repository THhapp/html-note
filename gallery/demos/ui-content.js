/* Gallery demos for C01–C13. Real mounts only; no timers, no global overlays. */
(function () {
  'use strict';

  var demos = window.NoteGalleryDemos = window.NoteGalleryDemos || {};
  /* Generated from examples/assets/content-sample.svg for the self-contained gallery demo.
     A normal local page should instead pass src: '../examples/assets/content-sample.svg'
     to NoteUI.Figure; see docs/ui-content.md#C08. */
  var CONTENT_SAMPLE_DATA_URI = 'data:image/svg+xml;base64,' + [
    'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI5NjAiIGhlaWdodD0iNTQwIiB2aWV3Qm94PSIwIDAgOTYwIDU0MCIgcm9s',
    'ZT0iaW1nIiBhcmlhLWxhYmVsbGVkYnk9InRpdGxlIGRlc2MiPgogIDx0aXRsZSBpZD0idGl0bGUiPuWGheWuueWkhOeQhua1geeoi+ekuuaEjzwvdGl0bGU+',
    'CiAgPGRlc2MgaWQ9ImRlc2MiPuS4ieS4quebuOi/nueahOatpemqpO+8muWOn+aWh+OAgeino+aekOinhOWImeOAgeWPr+ivu+WRiOeOsO+8m+avj+S4gOat',
    'peeUqOS4gOS4quW4pue8luWPt+eahOaWueahhuihqOekuuOAgjwvZGVzYz4KICA8ZGVmcz4KICAgIDxtYXJrZXIgaWQ9ImFycm93IiB2aWV3Qm94PSIwIDAg',
    'MTAgMTAiIHJlZlg9IjgiIHJlZlk9IjUiIG1hcmtlcldpZHRoPSI3IiBtYXJrZXJIZWlnaHQ9IjciIG9yaWVudD0iYXV0by1zdGFydC1yZXZlcnNlIj4KICAg',
    'ICAgPHBhdGggZD0iTSAwIDAgTCAxMCA1IEwgMCAxMCB6IiBmaWxsPSIjNmY4MmI3Ii8+CiAgICA8L21hcmtlcj4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0i',
    'c2hlZXQiIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj4KICAgICAgPHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjZmJmY2ZlIi8+CiAgICAgIDxz',
    'dG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iI2YyZjVmYSIvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICA8L2RlZnM+CgogIDxyZWN0IHdpZHRoPSI5NjAi',
    'IGhlaWdodD0iNTQwIiBmaWxsPSIjZjRmNmY5Ii8+CiAgPHJlY3QgeD0iMzAiIHk9IjMwIiB3aWR0aD0iOTAwIiBoZWlnaHQ9IjQ4MCIgcng9IjIwIiBmaWxs',
    'PSJ1cmwoI3NoZWV0KSIgc3Ryb2tlPSIjZGNlMmVhIi8+CgogIDx0ZXh0IHg9IjcyIiB5PSI5MiIgZmlsbD0iIzMxNWNkYSIgZm9udC1mYW1pbHk9IidTZWdv',
    'ZSBVSScsJ01pY3Jvc29mdCBZYUhlaScsc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNyIgZm9udC13ZWlnaHQ9IjcwMCIgbGV0dGVyLXNwYWNpbmc9IjEuMiI+',
    'TE9DQUwgU1ZHIMK3IENPTlRFTlQgU0FNUExFPC90ZXh0PgogIDx0ZXh0IHg9IjcyIiB5PSIxMzAiIGZpbGw9IiMyMDI5MzgiIGZvbnQtZmFtaWx5PSInU2Vn',
    'b2UgVUknLCdNaWNyb3NvZnQgWWFIZWknLHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMzEiIGZvbnQtd2VpZ2h0PSI2NTAiPuS7juWOn+aWh+WIsOWPr+ivu+WR',
    'iOeOsDwvdGV4dD4KICA8dGV4dCB4PSI3MiIgeT0iMTYwIiBmaWxsPSIjNWM2ODc5IiBmb250LWZhbWlseT0iJ1NlZ29lIFVJJywnTWljcm9zb2Z0IFlhSGVp',
    'JyxzYW5zLXNlcmlmIiBmb250LXNpemU9IjE2Ij7mnKzlnLDnpLrmhI/lm77vvIznlKjkuo7lm77ms6jjgIHmm7/ku6PmlofmnKzkuI7lpLHotKXnirbmgIHm',
    'vJTnpLrjgII8L3RleHQ+CgogIDxnIGZvbnQtZmFtaWx5PSInU2Vnb2UgVUknLCdNaWNyb3NvZnQgWWFIZWknLHNhbnMtc2VyaWYiPgogICAgPHJlY3QgeD0i',
    'NzIiIHk9IjIwNSIgd2lkdGg9IjIzMCIgaGVpZ2h0PSIyMTgiIHJ4PSIxNCIgZmlsbD0iI2ZmZmZmZiIgc3Ryb2tlPSIjZGNlMmVhIi8+CiAgICA8Y2lyY2xl',
    'IGN4PSIxMDYiIGN5PSIyMzkiIHI9IjE3IiBmaWxsPSIjZWVmMmZmIiBzdHJva2U9IiNjOGQzZjQiLz4KICAgIDx0ZXh0IHg9IjEwNiIgeT0iMjQ1IiB0ZXh0',
    'LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjMzE1Y2RhIiBmb250LXNpemU9IjE1IiBmb250LXdlaWdodD0iNzAwIj4xPC90ZXh0PgogICAgPHRleHQgeD0iMTM2',
    'IiB5PSIyNDQiIGZpbGw9IiMyMDI5MzgiIGZvbnQtc2l6ZT0iMTgiIGZvbnQtd2VpZ2h0PSI2NTAiPuWOn+aWhzwvdGV4dD4KICAgIDx0ZXh0IHg9Ijk2IiB5',
    'PSIyODYiIGZpbGw9IiM1YzY4NzkiIGZvbnQtc2l6ZT0iMTQiPue6r+aWh+acrOOAgeadpea6kOS4jue7k+aehDwvdGV4dD4KICAgIDxyZWN0IHg9Ijk0IiB5',
    'PSIzMDciIHdpZHRoPSIxODYiIGhlaWdodD0iMzQiIHJ4PSI2IiBmaWxsPSIjZjRmNmY5IiBzdHJva2U9IiNlNmViZjIiLz4KICAgIDx0ZXh0IHg9IjEwOCIg',
    'eT0iMzI5IiBmaWxsPSIjMzQ0OTY4IiBmb250LXNpemU9IjEzIiBmb250LWZhbWlseT0iQ29uc29sYXMsbW9ub3NwYWNlIj4jIOagh+mimDwvdGV4dD4KICAg',
    'IDxyZWN0IHg9Ijk0IiB5PSIzNDkiIHdpZHRoPSIxNDYiIGhlaWdodD0iMzQiIHJ4PSI2IiBmaWxsPSIjZjRmNmY5IiBzdHJva2U9IiNlNmViZjIiLz4KICAg',
    'IDx0ZXh0IHg9IjEwOCIgeT0iMzcxIiBmaWxsPSIjMzQ0OTY4IiBmb250LXNpemU9IjEzIiBmb250LWZhbWlseT0iQ29uc29sYXMsbW9ub3NwYWNlIj7kuIDm',
    'rrXmraPmloc8L3RleHQ+CgogICAgPHJlY3QgeD0iMzY1IiB5PSIyMDUiIHdpZHRoPSIyMzAiIGhlaWdodD0iMjE4IiByeD0iMTQiIGZpbGw9IiNmZmZmZmYi',
    'IHN0cm9rZT0iI2RjZTJlYSIvPgogICAgPGNpcmNsZSBjeD0iMzk5IiBjeT0iMjM5IiByPSIxNyIgZmlsbD0iI2VlZjJmZiIgc3Ryb2tlPSIjYzhkM2Y0Ii8+',
    'CiAgICA8dGV4dCB4PSIzOTkiIHk9IjI0NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzMxNWNkYSIgZm9udC1zaXplPSIxNSIgZm9udC13ZWlnaHQ9',
    'IjcwMCI+MjwvdGV4dD4KICAgIDx0ZXh0IHg9IjQyOSIgeT0iMjQ0IiBmaWxsPSIjMjAyOTM4IiBmb250LXNpemU9IjE4IiBmb250LXdlaWdodD0iNjUwIj7o',
    'p6PmnpDovrnnlYw8L3RleHQ+CiAgICA8dGV4dCB4PSIzODgiIHk9IjI4NiIgZmlsbD0iIzVjNjg3OSIgZm9udC1zaXplPSIxNCI+5piO56Gu6KeE5YiZ5LiO',
    '5a6J5YWo5YeA5YyWPC90ZXh0PgogICAgPHJlY3QgeD0iMzg4IiB5PSIzMDciIHdpZHRoPSIxODYiIGhlaWdodD0iMzQiIHJ4PSI2IiBmaWxsPSIjZWVmMmZm',
    'IiBzdHJva2U9IiNjOGQzZjQiLz4KICAgIDx0ZXh0IHg9IjQwMiIgeT0iMzI5IiBmaWxsPSIjMzE1Y2RhIiBmb250LXNpemU9IjEzIiBmb250LWZhbWlseT0i',
    'Q29uc29sYXMsbW9ub3NwYWNlIj5NYXJrZG93biDCtyDlhazlvI88L3RleHQ+CiAgICA8cmVjdCB4PSIzODgiIHk9IjM0OSIgd2lkdGg9IjE4NiIgaGVpZ2h0',
    'PSIzNCIgcng9IjYiIGZpbGw9IiNmZmY3ZTgiIHN0cm9rZT0iI2U3ZDVhYyIvPgogICAgPHRleHQgeD0iNDAyIiB5PSIzNzEiIGZpbGw9IiM3NzUwMTgiIGZv',
    'bnQtc2l6ZT0iMTMiPuWNsemZqei+k+WFpSDihpIg5paH5pysL+enu+mZpDwvdGV4dD4KCiAgICA8cmVjdCB4PSI2NTgiIHk9IjIwNSIgd2lkdGg9IjIzMCIg',
    'aGVpZ2h0PSIyMTgiIHJ4PSIxNCIgZmlsbD0iI2ZmZmZmZiIgc3Ryb2tlPSIjZGNlMmVhIi8+CiAgICA8Y2lyY2xlIGN4PSI2OTIiIGN5PSIyMzkiIHI9IjE3',
    'IiBmaWxsPSIjZWVmMmZmIiBzdHJva2U9IiNjOGQzZjQiLz4KICAgIDx0ZXh0IHg9IjY5MiIgeT0iMjQ1IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIj',
    'MzE1Y2RhIiBmb250LXNpemU9IjE1IiBmb250LXdlaWdodD0iNzAwIj4zPC90ZXh0PgogICAgPHRleHQgeD0iNzIyIiB5PSIyNDQiIGZpbGw9IiMyMDI5Mzgi',
    'IGZvbnQtc2l6ZT0iMTgiIGZvbnQtd2VpZ2h0PSI2NTAiPuWRiOeOsDwvdGV4dD4KICAgIDx0ZXh0IHg9IjY4MiIgeT0iMjg2IiBmaWxsPSIjNWM2ODc5IiBm',
    'b250LXNpemU9IjE0Ij7mjpLniYjjgIHlm77ms6jkuI7or7TmmI48L3RleHQ+CiAgICA8cmVjdCB4PSI2ODEiIHk9IjMwNyIgd2lkdGg9IjE4NiIgaGVpZ2h0',
    'PSIzNCIgcng9IjYiIGZpbGw9IiNmNGY2ZjkiIHN0cm9rZT0iI2U2ZWJmMiIvPgogICAgPHRleHQgeD0iNjk1IiB5PSIzMjkiIGZpbGw9IiMzNDQ5NjgiIGZv',
    'bnQtc2l6ZT0iMTMiPuagh+mimOWtl+WPt+S4juWxgue6pzwvdGV4dD4KICAgIDxyZWN0IHg9IjY4MSIgeT0iMzQ5IiB3aWR0aD0iMTg2IiBoZWlnaHQ9IjM0',
    'IiByeD0iNiIgZmlsbD0iI2Y0ZjZmOSIgc3Ryb2tlPSIjZTZlYmYyIi8+CiAgICA8dGV4dCB4PSI2OTUiIHk9IjM3MSIgZmlsbD0iIzM0NDk2OCIgZm9udC1z',
    'aXplPSIxMyI+5q2j5paH44CB6KGo5qC844CB5Luj56CBPC90ZXh0PgogIDwvZz4KCiAgPGxpbmUgeDE9IjMwNyIgeTE9IjMxNCIgeDI9IjM1NSIgeTI9IjMx',
    'NCIgc3Ryb2tlPSIjNmY4MmI3IiBzdHJva2Utd2lkdGg9IjIiIG1hcmtlci1lbmQ9InVybCgjYXJyb3cpIi8+CiAgPGxpbmUgeDE9IjYwMCIgeTE9IjMxNCIg',
    'eDI9IjY0OCIgeTI9IjMxNCIgc3Ryb2tlPSIjNmY4MmI3IiBzdHJva2Utd2lkdGg9IjIiIG1hcmtlci1lbmQ9InVybCgjYXJyb3cpIi8+CgogIDxsaW5lIHgx',
    'PSI3MiIgeTE9IjQ2MCIgeDI9Ijg4OCIgeTI9IjQ2MCIgc3Ryb2tlPSIjZTNlOGYwIi8+CiAgPHRleHQgeD0iNzIiIHk9IjQ4NyIgZmlsbD0iIzdiODc5OSIg',
    'Zm9udC1mYW1pbHk9IidTZWdvZSBVSScsJ01pY3Jvc29mdCBZYUhlaScsc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxMyI+56S65L6L5LuF6K+05piO57uE5Lu2',
    '55qE57uE5ZCI6IyD5Zu077yM5LiN5YyF5ZCr5Lia5Yqh57uT6K665oiW5pWZ5a2m5q2l6aqk44CCPC90ZXh0Pgo8L3N2Zz4K'
  ].join('');
  function element(tag, className, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = String(content);
    return node;
  }

  function demoFrame(host) {
    var wrap = element('div', 'nui-cdemo-stack');
    host.appendChild(wrap);
    var instances = [];
    var destroyed = false;
    return {
      wrap: wrap,
      keep: function (instance) {
        if (instance) instances.push(instance);
        return instance;
      },
      note: function (message) {
        var node = element('p', 'nui-cdemo-note', message);
        wrap.appendChild(node);
        return node;
      },
      section: function (label, nodes) {
        var section = element('div', 'nui-cdemo-section');
        if (label) section.appendChild(element('div', 'nui-cdemo-note', label));
        (nodes || []).forEach(function (node) {
          if (!node) return;
          section.appendChild(node.el && node.el.nodeType === 1 ? node.el : node);
        });
        wrap.appendChild(section);
        return section;
      },
      controls: function () {
        var row = element('div', 'nui-cdemo-controls');
        wrap.appendChild(row);
        return row;
      },
      button: function (parent, label, handler) {
        var button = element('button', 'nui-cdemo-button', label);
        button.type = 'button';
        button.addEventListener('click', handler);
        parent.appendChild(button);
        return button;
      },
      status: function (parent, message) {
        var status = element('div', 'nui-cdemo-status', message || '');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        if (parent) parent.appendChild(status);
        else wrap.appendChild(status);
        return status;
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        instances.slice().reverse().forEach(function (instance) {
          try { instance.destroy(); } catch (ignore) { /* make cleanup idempotent */ }
        });
        wrap.remove();
      }
    };
  }

  function inlineText(host, value, variant) {
    return NoteUI.InlineText.mount(host, { text: value, variant: variant });
  }

  /* C01 — Typography */
  demos.C01 = function (host) {
    var frame = demoFrame(host);
    frame.note('排版以共享字号和行高为准。标题可以用 mount 更新，也可以直接使用作用域类名；这里的正文和引导语就是静态类名。');
    var long = false;
    var heading = frame.keep(NoteUI.Typography.mount(frame.wrap, {
      variant: 'h1',
      as: 'h1',
      content: '标题层级一：内容边界决定版式'
    }));
    var levelTwo = element('h2', 'nui-type-h2', '标题层级二：宿主组织章节');
    var levelThree = element('h3', 'nui-type-h3', '标题层级三：局部关系');
    var lead = element('p', 'nui-type-lead', '引导语用于在正文之前交代这一块内容的目的，不代替正文。');
    var body = element('p', 'nui-type-body', '正文使用共享阅读字号与行高。长句和 English phrases 都在同一阅读节奏内自然换行；组件本身不设置外部间距，章节距离由宿主决定。');
    var caption = element('p', 'nui-type-caption', '辅助说明：默认使用低强调色，仍进入正常阅读路径。');
    frame.section(null, [levelTwo, levelThree, lead, body, caption]);
    var controls = frame.controls();
    frame.button(controls, '切换标题长短', function () {
      long = !long;
      heading.update({
        content: long
          ? '标题层级一：这是一个更长的标题，用于观察窄容器下的换行与层级关系，而不是把标题变成正文'
          : '标题层级一：内容边界决定版式'
      });
    });
    return { destroy: frame.destroy };
  };

  /* C02 — TextLink */
  demos.C02 = function (host) {
    var frame = demoFrame(host);
    frame.note('普通链接保留浏览器原生打开方式；外部链接在同一处标记新窗口与 rel；禁用链接带 aria-disabled，点击和键盘都不导航。');
    var clicks = 0;
    var status = frame.status(frame.wrap, '尚未点击普通链接。');
    var row = element('div', 'nui-cdemo-inline');
    var normal = frame.keep(NoteUI.TextLink.mount(row, {
      label: '普通链接（本页锚点）',
      href: '#C02',
      onClick: function () {
        clicks += 1;
        status.textContent = '普通链接 onClick 已触发 ' + clicks + ' 次；打开方式仍由浏览器决定。';
      }
    }));
    var external = frame.keep(NoteUI.TextLink.mount(row, {
      label: '外部链接示例',
      href: 'https://example.com/',
      external: true
    }));
    var disabled = frame.keep(NoteUI.TextLink.mount(row, {
      label: '禁用链接示例',
      href: '#C02',
      disabled: true
    }));
    frame.section(null, [row]);
    var controls = frame.controls();
    var isDisabled = false;
    var toggle = frame.button(controls, '切换普通链接为禁用', function () {
      isDisabled = !isDisabled;
      normal.update({ disabled: isDisabled });
      toggle.textContent = isDisabled ? '恢复普通链接' : '切换普通链接为禁用';
    });
    external.update({ label: '外部链接：新窗口打开' });
    disabled.update({ label: '禁用链接：不可导航' });
    return { destroy: frame.destroy };
  };

  /* C03 — InlineText */
  demos.C03 = function (host) {
    var frame = demoFrame(host);
    frame.note('行内代码、键帽、重点词、强调和辅助小字共用 InlineText；文本按纯文本处理，超长单词在容器内换行。');
    var paragraph = element('p', 'nui-type-body');
    paragraph.appendChild(document.createTextNode('运行 '));
    frame.keep(inlineText(paragraph, 'npm run build', 'code'));
    paragraph.appendChild(document.createTextNode('，然后按 '));
    frame.keep(inlineText(paragraph, 'Ctrl + S', 'kbd'));
    paragraph.appendChild(document.createTextNode(' 保存。'));
    paragraph.appendChild(document.createTextNode(' '));
    frame.keep(inlineText(paragraph, '需要复核的结论', 'mark'));
    paragraph.appendChild(document.createTextNode(' 以强调文字标记，'));
    frame.keep(inlineText(paragraph, '不是颜色状态', 'strong'));
    paragraph.appendChild(document.createTextNode('；'));
    frame.keep(inlineText(paragraph, '小字仅用于辅助说明', 'small'));
    paragraph.appendChild(document.createTextNode('。'));
    frame.section(null, [paragraph]);

    var narrow = element('div', 'nui-cdemo-narrow');
    var longCode = inlineText(narrow, 'npm run build -- --long-identifier-without-breaks', 'code');
    frame.keep(longCode);
    frame.section('窄容器长词状态', [narrow]);

    var controls = frame.controls();
    var long = true;
    frame.button(controls, '切换代码长词', function () {
      long = !long;
      longCode.update({
        text: long ? 'npm run build -- --long-identifier-without-breaks' : 'npm run build',
        variant: 'code'
      });
    });
    return { destroy: frame.destroy };
  };

  /* C04 — Quote */
  demos.C04 = function (host) {
    var frame = demoFrame(host);
    frame.note('引用用 figure、blockquote 与 figcaption 组织正文和出处，视觉上与常驻说明 Notice 不同；出处可替换，危险协议不会成为链接。');
    var quotes = [
      {
        content: '组件应让演示在明确范围内独立讲清目的、规则和结果。必要的说明进入正常阅读路径，而不是藏在角落、悬停或一次性提示里。',
        source: '本地规则摘录',
        cite: '#C04'
      },
      {
        content: '这是一段更长的引文，专门用来检查窄容器中的换行：引用正文仍然可读，来源说明紧随其后。English phrases should also wrap at word boundaries without pushing the caption out of view.',
        source: '示例资料 · 第二版',
        cite: 'https://example.com/reference'
      }
    ];
    var index = 0;
    var quote = frame.keep(NoteUI.Quote.mount(frame.wrap, quotes[0]));
    frame.section(null, [quote]);
    var controls = frame.controls();
    frame.button(controls, '更换引文与出处', function () {
      index = (index + 1) % quotes.length;
      quote.update(quotes[index]);
    });
    return { destroy: frame.destroy };
  };

  /* C05 — List */
  demos.C05 = function (host) {
    var frame = demoFrame(host);
    frame.note('有序、无序和说明型列表共用一个组件；items 可以是字符串、DOM，或带 children 的对象。标记与长文本按同一行首对齐。');
    var ordered = frame.keep(NoteUI.List.mount(frame.wrap, {
      variant: 'ordered',
      start: 3,
      label: '有序步骤示例',
      items: [
        { content: '从第 3 步开始，便于与上文接续。', children: ['嵌套项仍保持同一类型', { content: '第二层子项' }] },
        { content: '标记与第一行文本对齐；换行后的文本回到正文起始位置。' },
        '条目内容可以替换。'
      ]
    }));
    var unordered = frame.keep(NoteUI.List.mount(frame.wrap, {
      variant: 'unordered',
      label: '无序列表示例',
      items: [
        '普通字符串条目',
        {
          content: '内容可以来自宿主 DOM，例如这一条会换行并保持容器宽度。',
          children: ['子项一', '子项二']
        },
        'averyveryveryveryveryveryverylongtokenwithoutanybreakpoints'
      ]
    }));
    var domValue = element('span', null, '');
    domValue.appendChild(document.createTextNode('DOM 值：'));
    var code = element('code', 'nui-inline-code', 'instance.update()');
    domValue.appendChild(code);
    var description = frame.keep(NoteUI.List.mount(frame.wrap, {
      variant: 'description',
      label: '说明型列表示例',
      items: [
        { content: '说明型列表使用破折号标记，适合并列的解释点，不等同于术语表。' },
        { content: domValue },
        { content: '需要术语与值的成对关系时使用 DefinitionList。' }
      ]
    }));
    frame.section('有序列表 · start=3（按钮会切回 1）', [ordered]);
    frame.section('无序列表与嵌套条目', [unordered]);
    frame.section('说明型列表（破折号标记）', [description]);
    var controls = frame.controls();
    var alternative = false;
    frame.button(controls, '替换条目与起始序号', function () {
      alternative = !alternative;
      description.update({
        items: alternative
          ? ['替换后的第一条说明。', '替换后的第二条说明，包含 English words。']
          : [
            { content: '说明型列表使用破折号标记，适合并列的解释点，不等同于术语表。' },
            { content: '内容可以是 DOM 节点、字符串或带嵌套 children 的对象。' },
            { content: '需要术语与值的成对关系时使用 DefinitionList。' }
          ]
      });
      ordered.update({ start: alternative ? 1 : 3 });
    });
    return { destroy: frame.destroy };
  };

  /* C06 — Table */
  demos.C06 = function (host) {
    var frame = demoFrame(host);
    frame.note('初始按区域升序来自 sort 配置；只有点击可排序表头才会触发 onSort，点击在升序、降序和取消之间切换。宽表在框内局部滚动，表头保持可见；示例容器故意收窄以显示滚动提示。');
    var status = frame.status(frame.wrap, '初始按“区域”升序（来自 sort 配置，未触发 onSort）。点击表头试试。');
    var columns = [
      { key: 'name', label: '区域', width: 120 },
      { key: 'team', label: '团队' },
      { key: 'devices', label: '设备数', align: 'end' },
      { key: 'change', label: '变化', align: 'end' },
      { key: 'status', label: '状态' },
      { key: 'owner', label: '负责人' },
      { key: 'note', label: '说明', width: 240 }
    ];
    var rows = [
      { id: 'north', name: '北区', team: '基础设施', devices: 12480, change: '+120', status: '运行中', owner: '林辰', note: '采样数据，仅用于组件演示，不代表真实业务。' },
      { id: 'south', name: '南区', team: '内容平台', devices: 9840, change: '±0', status: '运行中', owner: '周宁', note: '包含较长 English description for wrapping checks.' },
      { id: 'east', name: '东区', team: '基础设施', devices: 7620, change: '-48', status: '维护中', owner: '沈禾', note: '维护窗口内的示例值。' },
      { id: 'west', name: '西区', team: '数据服务', devices: 5100, change: '+32', status: '运行中', owner: '王岚', note: '另一条较长说明，验证表格换行与行高。' },
      { id: 'northwest', name: '西北', team: '内容平台', devices: 4420, change: '±0', status: '暂停', owner: '程墨', note: '暂停状态的示例记录。' }
    ];
    var scope = element('div');
    scope.style.maxWidth = '680px';
    scope.style.minWidth = '0';
    var emphasis = { row: 'north', column: 'devices' };
    var table = frame.keep(NoteUI.Table.mount(scope, {
      columns: columns,
      rows: rows,
      rowKey: 'id',
      caption: '区域设备概览（示例数据）',
      empty: '当前筛选条件下没有表格记录。',
      sort: { key: 'name', direction: 'asc' },
      emphasis: emphasis,
      dense: false,
      maxHeight: 260,
      onSort: function (info) {
        if (!info.direction) {
          status.textContent = 'onSort：已取消排序，共 ' + info.rows.length + ' 行。';
          return;
        }
        var column = columns.filter(function (item) { return item.key === info.key; })[0];
        status.textContent = 'onSort：按“' + (column ? column.label : info.key) + '”' +
          (info.direction === 'asc' ? '升序' : '降序') + '，共 ' + info.rows.length + ' 行。';
      }
    }));
    frame.section(null, [scope]);
    var controls = frame.controls();
    var empty = false;
    var emphasized = true;
    var dense = false;
    frame.button(controls, '切换空态', function () {
      empty = !empty;
      table.update({ rows: empty ? [] : rows });
      this.textContent = empty ? '恢复表格数据' : '切换空态';
    });
    frame.button(controls, '切换行列强调', function () {
      emphasized = !emphasized;
      table.update({ emphasis: emphasized ? emphasis : null });
      this.textContent = emphasized ? '清除行列强调' : '恢复行列强调';
    });
    frame.button(controls, '紧凑视图', function () {
      dense = !dense;
      table.update({ dense: dense });
      this.textContent = dense ? '常规视图' : '紧凑视图';
    });
    return { destroy: frame.destroy };
  };

  /* C07 — CodeBlock */
  demos.C07 = function (host) {
    var frame = demoFrame(host);
    frame.note('代码只作为纯文本展示，不执行、不解析 HTML。示例带行号和第 3、6–7 行高亮；复制按钮使用浏览器剪贴板，失败时会在下方显示可选择文本。');
    var samples = [
      {
        code: [
          'function collect(items) {',
          '  const ready = items.filter(Boolean);',
          '  const veryLongLine = "' + 'token-'.repeat(30) + '";',
          '  return ready.map((item) => ({',
          '    id: item.id,',
          '    label: item.label',
          '  }));',
          '}'
        ].join('\n'),
        title: '收集可见条目',
        language: 'javascript',
        highlight: '3,6-7'
      },
      {
        code: [
          'def summarize(rows):',
          '    total = sum(row["value"] for row in rows)',
          '    return {',
          '        "count": len(rows),',
          '        "total": total,',
          '    }',
          '',
          '# 仍由宿主决定数据来源'
        ].join('\n'),
        title: '本地汇总函数',
        language: 'python',
        highlight: '1-2'
      }
    ];
    var index = 0;
    var block = frame.keep(NoteUI.CodeBlock.mount(frame.wrap, {
      code: samples[0].code,
      title: samples[0].title,
      language: samples[0].language,
      lineNumbers: true,
      highlight: samples[0].highlight,
      copy: true,
      maxHeight: 220
    }));
    var controls = frame.controls();
    frame.button(controls, '换一段代码', function () {
      index = (index + 1) % samples.length;
      var sample = samples[index];
      block.update({
        code: sample.code,
        title: sample.title,
        language: sample.language,
        lineNumbers: true,
        highlight: sample.highlight,
        copy: true,
        maxHeight: 220
      });
    });
    return { destroy: frame.destroy };
  };

  /* C08 — Figure */
  demos.C08 = function (host) {
    var frame = demoFrame(host);
    frame.note('该演示为单文件分发把本地 SVG 内联为 data URI，alt 仍为必填项；真实宿主可改传本地相对路径（见文档最小示例）。图注在成功和失败状态都保持可见。第二张图故意使用损坏的 data:image 数据。');
    var grid = element('div', 'nui-cdemo-grid');
    var asset = CONTENT_SAMPLE_DATA_URI;
    var firstCaption = '正常示例：原文经过解析规则，最终形成可读呈现。图注紧贴画面，不折叠。';
    var firstSource = '本地 SVG 示例 · 单文件演示内联（源文件 examples/assets/content-sample.svg）';
    var normal = frame.keep(NoteUI.Figure.mount(grid, {
      src: asset,
      alt: '内容处理流程示意图：原文、解析边界和呈现三个方框由箭头连接',
      caption: firstCaption,
      source: firstSource,
      ratio: '16 / 9',
      lazy: false
    }));
    var broken = frame.keep(NoteUI.Figure.mount(grid, {
      src: 'data:image/png;base64,AAAA',
      alt: '一条用于失败状态的替代文本，说明图片应当呈现三个步骤的流程',
      caption: '失败示例：图片数据损坏时，alt 和这段图注仍然可见，读者仍能知道图像本应说明什么。',
      source: '故意损坏的本地图片数据',
      ratio: '16 / 9'
    }));
    frame.section(null, [grid]);
    var controls = frame.controls();
    var alternate = false;
    frame.button(controls, '更换图注与来源', function () {
      alternate = !alternate;
      normal.update({
        caption: alternate
          ? '替换后的图注：说明范围来自宿主，不用悬停才能看到。'
          : firstCaption,
        source: alternate ? '本地示例图 · 备用图注（源文件 examples/assets/content-sample.svg）' : firstSource
      });
      broken.update({
        caption: alternate
          ? '替换后的失败图注：即使加载失败，说明仍然保留在图下方。'
          : '失败示例：图片数据损坏时，alt 和这段图注仍然可见，读者仍能知道图像本应说明什么。'
      });
    });
    return { destroy: frame.destroy };
  };

  /* C09 — Math */
  demos.C09 = function (host) {
    var frame = demoFrame(host);
    frame.note('公式由本地 KaTeX 渲染，正常状态显示排版结果而不是原始 TeX。需要读屏说明的公式应传入 label；解析失败时显示原因与原始 TeX，便于定位。');
    var paragraph = element('p', 'nui-type-body');
    paragraph.appendChild(document.createTextNode('行内公式：勾股定理 '));
    frame.keep(NoteUI.Math.mount(paragraph, {
      tex: 'a^2 + b^2 = c^2',
      display: false,
      label: 'a 的平方加 b 的平方等于 c 的平方'
    }));
    paragraph.appendChild(document.createTextNode('，在正文中保持行内关系。'));
    frame.section(null, [paragraph]);
    var formulations = [
      {
        tex: '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}',
        label: '从 1 到 n 的整数求和等于 n 乘 n 加 1 再除以 2'
      },
      {
        tex: '\\int_{0}^{1} x^2\\,dx = \\frac{1}{3}',
        label: 'x 的平方在 0 到 1 上的定积分等于三分之一'
      }
    ];
    var index = 0;
    var block = frame.keep(NoteUI.Math.mount(frame.wrap, {
      tex: formulations[0].tex,
      display: true,
      label: formulations[0].label
    }));
    frame.section('块级公式（可横向滚动）', [block]);
    var error = frame.keep(NoteUI.Math.mount(frame.wrap, {
      tex: '\\frac{1}{',
      display: true,
      label: '错误公式示例'
    }));
    frame.section('错误示例：显示原因与原始 TeX（仅在错误状态出现）', [error]);
    var controls = frame.controls();
    frame.button(controls, '更换块级公式', function () {
      index = (index + 1) % formulations.length;
      block.update({ tex: formulations[index].tex, label: formulations[index].label });
    });
    return { destroy: frame.destroy };
  };

  /* C10 — Markdown */
  demos.C10 = function (host) {
    var frame = demoFrame(host);
    frame.note('Markdown 在本地解析。原始 HTML 被转义成可见文本，危险链接协议被移除，脚本不会执行。围栏代码调用 C07，表格调用 C06，两者都保留局部滚动。');
    var securityMarkdown = [
      '## Markdown 内容与安全边界',
      '',
      '正文包含 **重点**、`行内代码`，以及一个 [安全链接](https://example.com/)。列表和引用使用常见 Markdown 写法。',
      '',
      '1. 标题、列表、引用可替换。',
      '2. 围栏代码保留行号和复制按钮。',
      '3. 表格保留表头、对齐与局部滚动。',
      '',
      '> 原始 HTML 不生成 DOM，只作为文本显示。',
      '',
      '| 输入 | 处理 |',
      '| --- | --- |',
      '| 原始 HTML | 转义为可见文本 |',
      '| 危险链接 | 移除链接，保留文字 |',
      '| 围栏代码 | 交给 CodeBlock |',
      '',
      '```javascript',
      'const safe = true;',
      'console.log("This text is displayed, not executed.");',
      '```',
      '',
      '### 原始 HTML 示例',
      '',
      '<script>window.__nuiC10DemoExecuted = true;<' + '/script>',
      '<img src=x onerror="window.__nuiC10DemoExecuted = true">',
      '',
      '[危险链接](javascript:alert(1)) 的文字仍会保留。',
      ''
    ].join('\n');
    var alternateMarkdown = [
      '## 替换后的 Markdown',
      '',
      '这是一份更短的内容，用来确认实例更新后旧的代码块和表格已被清理。',
      '',
      '- 条目 A',
      '- 条目 B',
      '',
      '| 项目 | 值 |',
      '| --- | ---: |',
      '| Alpha | 12 |',
      '| Beta | 7 |',
      '',
      '```text',
      '替换后的围栏代码',
      '```',
      ''
    ].join('\n');
    var markdown = frame.keep(NoteUI.Markdown.mount(frame.wrap, {
      markdown: securityMarkdown
    }));
    var controls = frame.controls();
    var alternate = false;
    frame.button(controls, '切换 Markdown 内容', function () {
      alternate = !alternate;
      markdown.update({ markdown: alternate ? alternateMarkdown : securityMarkdown });
    });
    return { destroy: frame.destroy };
  };

  /* C11 — DefinitionList */
  demos.C11 = function (host) {
    var frame = demoFrame(host);
    frame.note('术语和值使用 dl、dt、dd。长键名和长值都会换行；inline 布局在较窄容器中自动改为上下堆叠，而不是把两列压到不可读。');
    var items = [
      {
        term: '一个很长很长很长很长的术语名称',
        description: '解释文本也 deliberately includes a long-token-without-breaks-abcdefghijklmnop to check wrapping in a narrow container.'
      },
      {
        term: '响应式布局',
        description: '宽容器中使用 inline 两列，窄容器中自动堆叠；堆叠后术语和值仍是 dl 中的 dt 与 dd。'
      },
      {
        term: '来源',
        description: '宿主提供的内容，组件不生成业务解释。'
      }
    ];
    var stacked = frame.keep(NoteUI.DefinitionList.mount(frame.wrap, {
      layout: 'stacked',
      dividers: true,
      items: items
    }));
    frame.section('布局示例：初始 stacked；可用下方按钮切到宽容器 inline 双列', [stacked]);

    var narrow = element('div', 'nui-cdemo-narrow');
    var valueNode = document.createElement('span');
    valueNode.textContent = '这是一个 DOM 值节点：';
    var inlineMark = element('code', 'nui-inline-code', 'update({ items })');
    valueNode.appendChild(inlineMark);
    var inline = frame.keep(NoteUI.DefinitionList.mount(narrow, {
      layout: 'inline',
      dividers: true,
      items: [
        { term: '长键名会在窄容器里先占满一行', description: '对应值紧随其后，不并排挤压。' },
        { term: 'DOM 值', description: valueNode },
        { term: '第三项', description: '另一个较长的值，用于确认换行和分隔线。' }
      ]
    }));
    frame.section('窄容器中的 inline 布局（自动堆叠）', [narrow]);

    var controls = frame.controls();
    var alternate = false;
    var layout = 'stacked';
    frame.button(controls, '切换为 inline 双列', function () {
      layout = layout === 'stacked' ? 'inline' : 'stacked';
      stacked.update({ layout: layout });
      this.textContent = layout === 'stacked' ? '切换为 inline 双列' : '切回 stacked';
    });
    frame.button(controls, '换一组术语', function () {
      alternate = !alternate;
      stacked.update({
        items: alternate
          ? [
            { term: '替换术语一', description: '替换后的值一。' },
            { term: '替换术语二', description: '替换后的值二，包含 English words。' }
          ]
          : items
      });
    });
    return { destroy: frame.destroy };
  };

  /* C12 — Metric */
  demos.C12 = function (host) {
    var frame = demoFrame(host);
    frame.note('变化方向和说明都由宿主提供，组件不猜趋势。数值使用等宽数字，程序更新不触发用户事件；aria-live 默认关闭，可由宿主通过 announce 开启。');
    var grid = element('div', 'nui-cdemo-metrics');

    var primary = frame.keep(NoteUI.Metric.mount(grid, {
      label: '活跃设备',
      value: '12,480',
      unit: '台',
      caption: '示例读数；按钮只更新本地演示数据。',
      change: { direction: 'up', label: '较上周 +120 台' }
    }));
    frame.keep(NoteUI.Metric.mount(grid, {
      label: '累计处理量',
      value: '1,248,000.50',
      unit: '次',
      caption: '长数值示例，用于观察数值栏与单位的关系。',
      change: { direction: 'flat', label: '与上一周期相同' }
    }));
    frame.keep(NoteUI.Metric.mount(grid, {
      label: '完成率',
      value: '98.6',
      unit: '%',
      caption: '方向文字和箭头同时出现，不只依赖颜色。',
      change: { direction: 'down', label: '较昨日 -0.4 个百分点' }
    }));
    frame.section(null, [grid]);
    var controls = frame.controls();
    frame.button(controls, '程序更新为上升', function () {
      primary.update({
        value: '12,600',
        change: { direction: 'up', label: '较上周 +120 台' }
      });
    });
    frame.button(controls, '程序更新为下降', function () {
      primary.update({
        value: '12,360',
        change: { direction: 'down', label: '较上周 -120 台' }
      });
    });
    frame.button(controls, '程序更新为持平', function () {
      primary.update({
        value: '12,480',
        change: { direction: 'flat', label: '与上周相同' }
      });
    });
    return { destroy: frame.destroy };
  };

  /* C13 — Expression */
  demos.C13 = function (host) {
    var frame = demoFrame(host);
    frame.note('每项有稳定 id；文本项与完整 TeX 项都能更新。组件只负责排版、项查询和 cues，不自动播放过渡。');
    var wrap = element('div', 'nui-cdemo-stack');
    var row = element('div', 'nui-cdemo-expression-row');
    var expr = frame.keep(NoteUI.Expression.mount(row, {
      parts: [
        { id: 'p1', text: '4' }, { id: 'op2', text: '+' }, { id: 'p2', text: '1' },
        { id: 'eq', text: '=' }, { id: 'total', text: '5' }
      ],
      label: '累计和 4 加 1 等于 5'
    }));
    wrap.appendChild(row);
    frame.section('有身份的表达式项', [wrap]);
    var controls = frame.controls();
    frame.button(controls, '扩展为 4 + 1 + 12 = 17', function () {
      expr.update({
        parts: [
          { id: 'p1', text: '4' }, { id: 'op2', text: '+' }, { id: 'p2', text: '1' },
          { id: 'op3', text: '+' }, { id: 'p3', text: '12' }, { id: 'eq', text: '=' }, { id: 'total', text: '17' }
        ],
        changed: ['total'],
        label: '累计和 4 加 1 加 12 等于 17'
      });
    });
    frame.button(controls, '回到 4 + 1 = 5', function () {
      expr.update({
        parts: [
          { id: 'p1', text: '4' }, { id: 'op2', text: '+' }, { id: 'p2', text: '1' },
          { id: 'eq', text: '=' }, { id: 'total', text: '5' }
        ],
        changed: [],
        label: '累计和 4 加 1 等于 5'
      });
    });
    return { destroy: frame.destroy };
  };
})();
