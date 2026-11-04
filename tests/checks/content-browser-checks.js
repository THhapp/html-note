/* Local browser checks for C01–C12. Not shipped. */
(function () {
  'use strict';

  var fixture = document.getElementById('fixture');
  var results = [];
  var current = '';

  function check(name, condition, detail) {
    results.push({ check: current + ': ' + name, ok: Boolean(condition), detail: condition ? '' : (detail || '') });
    if (!condition) throw new Error(current + ': ' + name + (detail ? ' — ' + detail : ''));
  }

  function host(width) {
    var node = document.createElement('div');
    if (width) { node.style.width = width + 'px'; node.style.maxWidth = '100%'; }
    fixture.appendChild(node);
    return node;
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function visible(element) {
    if (!element) return false;
    return !element.hidden && element.getClientRects().length > 0;
  }

  function destroy(instance, node) {
    instance.destroy();
    if (node && node.parentNode) node.remove();
  }

  async function runC01() {
    current = 'C01';
    var node = host();
    var instance = NoteUI.Typography.mount(node, { variant: 'h2', as: 'h2', content: '排版标题' });
    check('semantic h2 root', instance.el.tagName === 'H2', instance.el.tagName);
    check('shared class', instance.el.classList.contains('nui-type-h2'));
    check('plain text content', instance.el.textContent === '排版标题');
    instance.update({ content: '更新后的标题' });
    check('update content', instance.el.textContent === '更新后的标题');
    var body = NoteUI.Typography.mount(node, { variant: 'body', content: '正文<em>不解析</em>' });
    check('body is paragraph', body.el.tagName === 'P');
    check('string is not HTML', body.el.querySelector('em') === null);
    destroy(instance, null);
    body.destroy();
    check('destroy removes roots', node.children.length === 0);
    node.remove();
  }

  async function runC02() {
    current = 'C02';
    var node = host();
    var clicks = 0;
    var link = NoteUI.TextLink.mount(node, {
      label: '普通链接',
      href: '#C02',
      onClick: function (event) { clicks += 1; event.preventDefault(); }
    });
    check('native href', link.el.getAttribute('href') === '#C02');
    var event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.el.dispatchEvent(event);
    check('onClick fires for user click', clicks === 1);
    var external = NoteUI.TextLink.mount(node, {
      label: '外部链接', href: 'https://example.com/content', external: true
    });
    check('external target', external.el.getAttribute('target') === '_blank');
    check('external rel', external.el.getAttribute('rel') === 'noopener noreferrer');
    check('external visible icon', external.el.querySelector('.nui-text-link__external-icon') &&
      !external.el.querySelector('.nui-text-link__external-icon').hidden);
    check('external SR hint', /新窗口/.test(external.el.textContent));
    var disabled = NoteUI.TextLink.mount(node, { label: '禁用链接', href: '#C02', disabled: true });
    check('disabled aria-disabled', disabled.el.getAttribute('aria-disabled') === 'true');
    check('disabled has no href', !disabled.el.hasAttribute('href'));
    var blockedClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    disabled.el.dispatchEvent(blockedClick);
    check('disabled consumes click', blockedClick.defaultPrevented);
    var blockedKey = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    disabled.el.dispatchEvent(blockedKey);
    check('disabled consumes keyboard navigation', blockedKey.defaultPrevented);
    var dangerous = NoteUI.TextLink.mount(node, { label: '危险', href: 'javascript:alert(1)' });
    check('javascript href removed', !dangerous.el.hasAttribute('href'));
    check('dangerous protocol blocked', dangerous.el.getAttribute('aria-disabled') === 'true');
    var obfuscated = NoteUI.TextLink.mount(node, { label: '混淆协议', href: ' JaVaScRiPt:alert(1)' });
    check('obfuscated javascript removed', !obfuscated.el.hasAttribute('href'));
    var remote = NoteUI.TextLink.mount(node, { label: '远程', href: 'https://example.com/path' });
    check('http link remains native', remote.el.getAttribute('href') === 'https://example.com/path');
    disabled.update({ disabled: false });
    check('update restores href', disabled.el.getAttribute('href') === '#C02');
    destroy(link, null);
    external.destroy();
    disabled.destroy();
    dangerous.destroy();
    obfuscated.destroy();
    remote.destroy();
    check('all destroyed', node.children.length === 0);
    node.remove();
  }

  async function runC03() {
    current = 'C03';
    var node = host('220');
    var tags = { code: 'CODE', kbd: 'KBD', mark: 'MARK', strong: 'STRONG', small: 'SMALL' };
    var instances = {};
    Object.keys(tags).forEach(function (variant) {
      var instance = NoteUI.InlineText.mount(node, { text: '长内容-' + variant, variant: variant });
      instances[variant] = instance;
      check(variant + ' semantic tag', instance.el.querySelector(tags[variant]) !== null);
      check(variant + ' class', instance.el.querySelector('.nui-inline-' + variant) !== null);
    });
    instances.code.update({ text: 'averyveryveryveryveryveryveryverylongtokenwithoutbreaks', variant: 'code' });
    check('text replaced', /longtoken/.test(instances.code.el.textContent));
    instances.code.update({ text: 'K', variant: 'kbd' });
    check('variant can change', instances.code.el.querySelector('kbd') !== null &&
      instances.code.el.querySelector('code') === null);
    await wait(30);
    check('long token does not overflow host',
      node.scrollWidth <= node.clientWidth + 1, node.scrollWidth + ' > ' + node.clientWidth);
    Object.keys(instances).forEach(function (key) { instances[key].destroy(); });
    check('destroy removes roots', node.children.length === 0);
    node.remove();
  }

  async function runC04() {
    current = 'C04';
    var node = host();
    var instance = NoteUI.Quote.mount(node, {
      content: '引用正文可以替换，长文应当自然换行。',
      source: '本地资料来源',
      cite: 'https://example.com/source'
    });
    check('figure root', instance.el.tagName === 'FIGURE');
    check('blockquote structure', instance.el.querySelector('blockquote') !== null);
    check('figcaption structure', instance.el.querySelector('figcaption') !== null);
    check('cite link', instance.el.querySelector('figcaption a') &&
      instance.el.querySelector('figcaption a').getAttribute('href') === 'https://example.com/source');
    instance.update({ content: '第二段引文', source: '另一个来源', cite: 'javascript:alert(1)' });
    check('unsafe cite is not a link', instance.el.querySelector('figcaption a') === null);
    check('source still visible', /另一个来源/.test(instance.el.textContent));
    instance.update({ content: '无出处引文', source: '', cite: '' });
    check('caption hidden when no source', instance.el.querySelector('figcaption').hidden);
    instance.destroy();
    check('destroy removes root', node.children.length === 0);
    node.remove();
  }

  async function runC05() {
    current = 'C05';
    var node = host('240');
    var emphasisNode = document.createElement('strong');
    emphasisNode.textContent = 'DOM 内容';
    var nested = NoteUI.List.mount(node, {
      variant: 'ordered',
      start: 3,
      items: [
        { content: '第一项', children: [{ content: '嵌套项 A' }, { content: '嵌套项 B' }] },
        { content: emphasisNode },
        'averyveryveryveryveryveryverylongitemwithoutspaces'
      ]
    });
    check('ordered list', nested.el.querySelector('ol') !== null);
    check('start attribute', nested.el.querySelector('ol').getAttribute('start') === '3');
    check('nested list', nested.el.querySelectorAll('ol').length >= 2);
    check('DOM item preserved', nested.el.contains(emphasisNode));
    var description = NoteUI.List.mount(node, {
      variant: 'description',
      items: ['说明一', '说明二']
    });
    check('description variant rendered', description.el.querySelector('[data-variant="description"]') !== null);
    nested.update({ variant: 'unordered', items: ['更新项', { content: '带子项', children: ['子项'] }] });
    check('variant can switch to ul', nested.el.querySelector('ul') !== null);
    await wait(30);
    check('long list stays inside host', node.scrollWidth <= node.clientWidth + 2,
      node.scrollWidth + ' > ' + node.clientWidth);
    destroy(nested, null);
    description.destroy();
    node.remove();
  }

  async function runC06() {
    current = 'C06';
    var outer = host('360');
    var sortCalls = [];
    var columns = [
      { key: 'name', label: '名称', width: 140 },
      { key: 'team', label: '团队' },
      { key: 'score', label: '分数', align: 'end' },
      { key: 'status', label: '状态' },
      { key: 'note', label: '说明', width: 240 }
    ];
    var rows = [
      { id: 'north', name: '北区', team: 'A', score: 12, status: '启用', note: '一段较长的说明文字' },
      { id: 'south', name: '南区', team: 'B', score: 3, status: '停用', note: '较长的英文 English description' },
      { id: 'east', name: '东区', team: 'A', score: 9, status: '启用', note: '其它说明' },
      { id: 'west', name: '西区', team: 'C', score: 9, status: '启用', note: '其它说明' }
    ];
    var table = NoteUI.Table.mount(outer, {
      columns: columns,
      rows: rows,
      rowKey: 'id',
      caption: '区域指标',
      empty: '没有记录',
      sort: true,
      emphasis: { row: 'north', column: 'score' },
      maxHeight: 150,
      onSort: function (info) { sortCalls.push(info); }
    });
    await wait(50);
    check('table rendered', table.el.querySelectorAll('tbody .nui-table__row').length === 4);
    check('caption visible', /区域指标/.test(table.el.querySelector('caption').textContent));
    check('scroll region tabindex', table.el.querySelector('.nui-table__scroll').tabIndex === 0);
    check('scroll region label', Boolean(table.el.querySelector('.nui-table__scroll').getAttribute('aria-label')));
    check('scroll hint visible for wide table', visible(table.el.querySelector('.nui-table__scroll-hint')));
    check('emphasis row', table.getTarget('north').classList.contains('nui-table__row--emphasis'));
    check('emphasis column', table.el.querySelector('.nui-table__head-cell.nui-table__cell--emphasis') !== null);
    check('sortable buttons', table.el.querySelectorAll('.nui-table__sort').length === columns.length);
    check('sort button readable label', /按.*名称.*排序/.test(
      table.el.querySelector('.nui-table__sort[data-col-index="0"]').getAttribute('aria-label') || ''));
    var firstButton = table.el.querySelector('.nui-table__sort[data-col-index="0"]');
    firstButton.click();
    await wait(10);
    check('onSort user click', sortCalls.length === 1 && sortCalls[0].direction === 'asc');
    check('aria-sort ascending', table.el.querySelector('th[aria-sort="ascending"]') !== null);
    var firstNames = Array.prototype.map.call(table.el.querySelectorAll('tbody .nui-table__row'),
      function (row) { return row.getAttribute('data-row-key'); });
    check('sorted ascending by name', firstNames.join(',') === 'north,east,south,west', firstNames.join(','));
    table.el.querySelector('.nui-table__sort[data-col-index="0"]').click();
    await wait(10);
    check('onSort second click desc', sortCalls.length === 2 && sortCalls[1].direction === 'desc');
    check('aria-sort descending', table.el.querySelector('th[aria-sort="descending"]') !== null);
    table.el.querySelector('.nui-table__sort[data-col-index="0"]').click();
    await wait(10);
    check('third click clears sort', sortCalls.length === 3 && sortCalls[2].direction === null);
    table.update({ rows: [], emphasis: null });
    await wait(10);
    check('program update does not call onSort', sortCalls.length === 3);
    check('empty row visible', /没有记录/.test(table.el.querySelector('.nui-table__empty-cell').textContent));
    table.update({ rows: rows, sort: { key: 'score', direction: 'desc' } });
    await wait(20);
    check('program sort update no callback', sortCalls.length === 3);
    check('program sort aria-sort', table.el.querySelector('th[aria-sort="descending"]') !== null);
    var scoreOrder = Array.prototype.map.call(table.el.querySelectorAll('tbody .nui-table__row'),
      function (row) { return row.getAttribute('data-row-key'); }).join(',');
    check('stable ties preserve original order', scoreOrder === 'north,east,west,south', scoreOrder);
    var getTarget = table.getTarget('south');
    check('getTarget tr', getTarget && getTarget.tagName === 'TR');
    check('getTarget unknown null', table.getTarget('missing') === null);
    table.update({ sort: false, emphasis: { row: 'north', column: 'score' } });
    check('sort disabled removes buttons', table.el.querySelectorAll('.nui-table__sort').length === 0);
    table.destroy();
    check('destroy removes table', outer.children.length === 0);
    outer.remove();

    /* reserveRows: 已知容量的隐藏行槽与非法输入契约。 */
    var reserveNode = host('360');
    var reserveColumns = [{ key: 'id', label: 'ID' }, { key: 'label', label: '名称' }];
    var reserveTable = NoteUI.Table.mount(reserveNode, {
      columns: reserveColumns,
      rows: [{ id: 'a', label: 'A' }],
      rowKey: 'id',
      reserveRows: 2
    });
    check('reserveRows adds hidden capacity rows', reserveTable.el.querySelectorAll('.nui-table__reserve-row').length === 1);
    check('reserveRows does not add row identity', reserveTable.getTarget('a') && reserveTable.getTarget('reserved') === null);
    check('reserveRows does not enter readModel', reserveTable.getState().rows.length === 1 &&
      reserveTable.getState().rows[0].row.id === 'a');
    check('reserveRows hides placeholders from AT', Array.from(reserveTable.el.querySelectorAll('.nui-table__reserve-row')).every(function (row) {
      return row.getAttribute('aria-hidden') === 'true' && getComputedStyle(row).visibility === 'hidden';
    }));

    function invalidReserve(value) {
      try {
        NoteUI.Table.mount(reserveNode, { columns: reserveColumns, rows: [], rowKey: 'id', reserveRows: value });
        return null;
      } catch (error) {
        return error;
      }
    }
    [Infinity, NaN, -1, 1.5, '2', null, 101, 1000000].forEach(function (value) {
      var error = invalidReserve(value);
      check('reserveRows rejects invalid mount value ' + String(value), !!error &&
        /reserveRows/.test(error.message) && /0/.test(error.message) && /100/.test(error.message) &&
        reserveNode.children.length === 1,
        error ? error.message : 'did not throw');
    });
    var updateError = null;
    try { reserveTable.update({ reserveRows: Infinity }); } catch (error) { updateError = error; }
    check('reserveRows rejects invalid update without breaking table', !!updateError &&
      /reserveRows/.test(updateError.message) && reserveTable.getState().rows.length === 1 &&
      reserveTable.getTarget('a') && reserveNode.children.length === 1,
      updateError ? updateError.message : 'did not throw');
    reserveTable.update({ reserveRows: 1 });
    check('reserveRows can be updated to another legal capacity',
      reserveTable.el.querySelectorAll('.nui-table__reserve-row').length === 0);
    reserveTable.update({ rows: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }] });
    check('real rows beyond reserve capacity still render', reserveTable.getState().rows.length === 3 &&
      reserveTable.el.querySelectorAll('tbody .nui-table__row').length === 3 &&
      reserveTable.el.querySelectorAll('.nui-table__reserve-row').length === 0);
    reserveTable.destroy();
    reserveNode.remove();
  }

  async function runC07() {
    current = 'C07';
    var node = host('340');
    var code = [
      'function demo(value) {',
      '  const longLine = "' + 'x'.repeat(220) + '";',
      '  return ' + '<script>window.__codeBlockPwned = true</script>' + ';',
      '}',
      '',
      'console.log("done");'
    ].join('\n');
    var block = NoteUI.CodeBlock.mount(node, {
      code: code,
      language: 'javascript',
      title: '示例代码',
      lineNumbers: true,
      highlight: '2,4-5',
      copy: true,
      maxHeight: 110
    });
    await wait(60);
    check('plain code text kept', block.el.textContent.indexOf('<script>') !== -1);
    check('code not executed', window.__codeBlockPwned === undefined);
    check('line rows', block.el.querySelectorAll('.nui-code__line').length === 6);
    check('line numbers', block.el.querySelectorAll('.nui-code__ln').length === 6);
    check('highlighted rows', block.el.querySelectorAll('.nui-code__line--highlight').length === 3);
    check('scroll hint visible', visible(block.el.querySelector('.nui-code__scroll-hint')));
    check('viewport keyboard focusable', block.el.querySelector('.nui-code__viewport').tabIndex === 0);
    check('copy button has code-specific name',
      /复制代码/.test(block.el.querySelector('.nui-code__copy').getAttribute('aria-label') || ''));
    var originalCopy = NoteCore.copy;
    NoteCore.copy = function () { return Promise.resolve({ ok: true, method: 'clipboard' }); };
    block.el.querySelector('.nui-code__copy').click();
    await wait(20);
    check('copy success feedback', /已复制/.test(block.el.querySelector('.nui-code__copy-status').textContent));
    NoteCore.copy = function () { return Promise.resolve({ ok: false, method: 'manual' }); };
    block.el.querySelector('.nui-code__copy').click();
    await wait(20);
    check('copy failure fallback visible', visible(block.el.querySelector('.nui-code__copy-fallback')));
    check('manual textarea selectable', block.el.querySelector('.nui-code__copy-area').readOnly &&
      block.el.querySelector('.nui-code__copy-area').value === code);
    check('copy failure message', /手动复制/.test(block.el.textContent));
    NoteCore.copy = originalCopy;
    block.update({ code: 'let ok = true;', lineNumbers: false, highlight: 1, copy: false });
    check('update replaces code', /let ok = true/.test(block.el.textContent));
    check('line numbers can be off', block.el.querySelectorAll('.nui-code__ln').length === 0);
    check('copy can be hidden', block.el.querySelector('.nui-code__copy').hidden);
    check('copy status cleared on update', block.el.querySelector('.nui-code__copy-status').textContent === '');
    block.destroy();
    delete NoteCore.__copyImpl;
    check('destroy removes code', node.children.length === 0);
    node.remove();
  }

  async function runC08() {
    current = 'C08';
    var node = host('480');
    var figure = NoteUI.Figure.mount(node, {
      src: '../../examples/assets/content-sample.svg',
      alt: '由三个方框和箭头组成的原理示意图',
      caption: '示例图：原文经过解析后成为可阅读内容。图的说明保持在正常阅读路径中。',
      source: '本地示例图',
      sourceHref: '../../examples/assets/content-sample.svg',
      ratio: '16 / 9',
      lazy: false
    });
    check('figure structure', figure.el.tagName === 'FIGURE');
    check('required alt applied', figure.el.querySelector('img').alt === '由三个方框和箭头组成的原理示意图');
    check('visible caption', /图的说明/.test(figure.el.querySelector('figcaption').textContent));
    check('source link safe', figure.el.querySelector('.nui-figure__source-link') !== null);
    await wait(80);
    check('local image is present', !figure.el.classList.contains('nui-figure--failed'));
    var missing = NoteUI.Figure.mount(node, {
      src: 'data:image/png;base64,AAAA',
      alt: '损坏图片的替代说明',
      caption: '失败时图注仍然保留。',
      source: '故意损坏的本地图片数据'
    });
    await wait(120);
    check('failure state visible', visible(missing.el.querySelector('.nui-figure__fallback')));
    check('failure shows alt', /损坏图片的替代说明/.test(missing.el.querySelector('.nui-figure__fallback').textContent));
    check('failure keeps caption', /失败时图注/.test(missing.el.textContent));
    check('image hidden on failure', missing.el.querySelector('img').hidden);
    var invalid = NoteUI.Figure.mount(node, {
      src: 'javascript:alert(1)',
      alt: '非法地址说明',
      caption: '非法地址不会加载。'
    });
    check('javascript src rejected', !invalid.el.querySelector('img').hasAttribute('src'));
    check('invalid src shows fallback', visible(invalid.el.querySelector('.nui-figure__fallback')));
    var remote = NoteUI.Figure.mount(node, {
      src: 'https://example.com/remote.png',
      alt: '远程地址说明',
      caption: '远程地址不会加载。'
    });
    check('remote image src rejected', !remote.el.querySelector('img').hasAttribute('src'));
    check('remote src is a visible failure', visible(remote.el.querySelector('.nui-figure__fallback')));
    var adaptive = NoteUI.Figure.mount(node, {
      src: '../../examples/assets/content-sample.svg',
      alt: '自适应比例图片',
      caption: '自适应比例。',
      ratio: 'auto',
      lazy: true
    });
    check('adaptive ratio class', adaptive.el.querySelector('.nui-figure__media--adaptive') !== null);
    check('lazy image option', adaptive.el.querySelector('img').loading === 'lazy');
    var updateThrew = false;
    try {
      figure.update({ alt: '   ' });
    } catch (error) {
      updateThrew = /alt/.test(String(error.message));
    }
    check('alt is required on update', updateThrew);
    check('invalid alt update keeps old alt',
      figure.el.querySelector('img').alt === '由三个方框和箭头组成的原理示意图');
    var threw = false;
    try {
      NoteUI.Figure.mount(node, { src: 'local.png', alt: '   ' });
    } catch (error) {
      threw = /alt/.test(String(error.message));
    }
    check('alt is mandatory', threw);
    destroy(figure, null);
    missing.destroy();
    invalid.destroy();
    remote.destroy();
    adaptive.destroy();
    node.remove();
  }

  async function runC09() {
    current = 'C09';
    var node = host();
    var inline = NoteUI.Math.mount(node, {
      tex: 'a^2 + b^2 = c^2',
      display: false,
      label: 'a 的平方加 b 的平方等于 c 的平方'
    });
    check('inline math rendered', inline.el.querySelector('.katex') !== null);
    check('inline math not raw-only', inline.el.querySelector('.katex-html') !== null);
    check('inline math label', inline.el.getAttribute('aria-label') === 'a 的平方加 b 的平方等于 c 的平方');
    check('no error state on success', inline.el.querySelector('.nui-math__error').hidden);
    var block = NoteUI.Math.mount(node, {
      tex: '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}',
      display: true,
      label: '求和公式'
    });
    check('block math class', block.el.classList.contains('nui-math--block'));
    check('block math scroll wrapper focusable', block.el.getAttribute('tabindex') === '0');
    var failure = NoteUI.Math.mount(node, { tex: '\\frac{1}{', display: true });
    var reason = failure.el.querySelector('.nui-math__error-reason').textContent;
    var raw = failure.el.querySelector('.nui-math__raw').textContent;
    check('error reason shown', /原因：/.test(reason), reason);
    check('raw TeX only in error', raw === '\\frac{1}{');
    check('error class', failure.el.classList.contains('nui-math--error'));
    check('error exposes readable group', failure.el.getAttribute('role') === 'group' &&
      /公式错误/.test(failure.el.getAttribute('aria-label') || ''));
    failure.update({ tex: 'x^2' });
    await wait(20);
    check('update error to normal', failure.el.querySelector('.katex') !== null &&
      failure.el.classList.contains('nui-math--error') === false);
    failure.update({ tex: '\\notARealCommand' });
    await wait(20);
    check('update normal to error', failure.el.classList.contains('nui-math--error') &&
      /notARealCommand/.test(failure.el.querySelector('.nui-math__raw').textContent));
    inline.destroy();
    block.destroy();
    failure.destroy();
    check('destroy removes math', node.children.length === 0);
    node.remove();
  }

  async function runC10() {
    current = 'C10';
    var node = host('520');
    var markdown = [
      '# Markdown 标题',
      '',
      '正文包含 **重点**、`行内代码` 与 [安全链接](https://example.com/page)。',
      '',
      '- 列表一',
      '- 列表二',
      '',
      '> 引用内容',
      '',
      '| 项目 | 数值 |',
      '| --- | ---: |',
      '| Alpha | 12 |',
      '| Beta | 5 |',
      '',
      '```js',
      'var shownButNotRun = true;',
      '```',
      '',
      '<script>window.__nuiC10Pwned = true;<\/script>',
      '',
      '<img src=x onerror="window.__nuiC10Img = true">',
      '<svg onload="window.__nuiC10Svg = true"></svg>',
      '<iframe srcdoc="<script>window.__nuiC10Frame = true<\/script>"></iframe>',
      '',
      '[危险链接](javascript:alert(1))',
      '[数据链接](data:text/html;base64,PHNjcmlwdD4=)',
      '[协议相对](//example.com/path)',
      '![远程图片](https://example.com/x.png)',
      ''
    ].join('\n');
    var md = NoteUI.Markdown.mount(node, { markdown: markdown });
    await wait(120);
    check('heading rendered', md.el.querySelector('h1') !== null);
    check('list rendered', md.el.querySelector('ul') !== null);
    check('blockquote rendered', md.el.querySelector('blockquote') !== null);
    check('fenced code uses C07', md.el.querySelector('.nui-code') !== null);
    check('markdown table uses C06', md.el.querySelector('.nui-table') !== null);
    check('nested table local scroll', md.el.querySelector('.nui-table__scroll') !== null);
    check('script did not execute', window.__nuiC10Pwned === undefined);
    check('onerror did not execute', window.__nuiC10Img === undefined);
    check('svg did not execute', window.__nuiC10Svg === undefined);
    check('iframe srcdoc did not execute', window.__nuiC10Frame === undefined);
    check('no script element', md.el.querySelector('script') === null);
    check('no injected image', md.el.querySelector('img') === null);
    check('no injected svg/iframe', md.el.querySelector('svg, iframe') === null);
    check('no event attributes', md.el.querySelector('[onerror], [onload]') === null);
    check('no javascript/data/protocol-relative href',
      md.el.querySelector('a[href^="javascript"], a[href^="data:"], a[href^="//"]') === null);
    check('image syntax shown as text placeholder', md.el.textContent.indexOf('图片未嵌入') !== -1);
    check('raw HTML is visible text', md.el.textContent.indexOf('<script>') !== -1);
    check('unsafe link text remains', md.el.textContent.indexOf('危险链接') !== -1);
    check('safe link kept', Array.prototype.some.call(md.el.querySelectorAll('a'), function (a) {
      return a.getAttribute('href') === 'https://example.com/page';
    }));
    var codeBlockCopy = md.el.querySelector('.nui-code__copy');
    check('nested code has copy', codeBlockCopy !== null);
    check('nested code line numbers', md.el.querySelectorAll('.nui-code__ln').length >= 2);
    md.update({ markdown: '# 新内容\n\n只有一段。' });
    await wait(60);
    check('update replaces markdown', /新内容/.test(md.el.textContent) && md.el.querySelector('.nui-code') === null);
    md.update({ markdown: markdown });
    await wait(80);
    check('markdown can be restored', md.el.querySelector('.nui-code') !== null);
    var wideMarkdown = [
      '| A | B | C | D | E | F |',
      '| --- | --- | --- | --- | --- | --- |',
      '| 1 | 2 | 3 | 4 | 5 | 6 |',
      '| 7 | 8 | 9 | 10 | 11 | 12 |',
      '',
      '```text',
      'longline-' + 'z'.repeat(180),
      '```'
    ].join('\n');
    var wide = NoteUI.Markdown.mount(node, { markdown: wideMarkdown });
    await wait(140);
    check('wide markdown table scroll hint', visible(wide.el.querySelector('.nui-table__scroll-hint')));
    check('wide markdown code scroll hint', visible(wide.el.querySelector('.nui-code__scroll-hint')));
    wide.destroy();
    md.destroy();
    await wait(30);
    check('destroy removes markdown', node.children.length === 0);
    node.remove();
  }

  async function runC11() {
    current = 'C11';
    var node = host('260');
    var valueNode = document.createElement('span');
    valueNode.textContent = 'DOM 值节点';
    var list = NoteUI.DefinitionList.mount(node, {
      layout: 'inline',
      dividers: true,
      items: [
        { term: '一个很长很长很长很长很长很长的术语名称', description: '术语解释文本，包含 long-english-token-without-breaks-abcdefghijklmnop' },
        { term: 'DOM 值', description: valueNode },
        { term: '第二项', description: '第二项说明' }
      ]
    });
    check('dl structure', list.el.querySelector('dl dt') !== null && list.el.querySelector('dl dd') !== null);
    check('DOM value preserved', list.el.contains(valueNode));
    check('inline layout data', list.el.getAttribute('data-layout') === 'inline');
    await wait(60);
    var firstTerm = list.el.querySelector('.nui-definition-list__term');
    var firstValue = list.el.querySelector('.nui-definition-list__value');
    var termRect = firstTerm.getBoundingClientRect();
    var valueRect = firstValue.getBoundingClientRect();
    check('narrow inline layout stacks', valueRect.top >= termRect.bottom - 2,
      'term bottom ' + termRect.bottom + ', value top ' + valueRect.top);
    check('long definition does not overflow', node.scrollWidth <= node.clientWidth + 2,
      node.scrollWidth + ' > ' + node.clientWidth);
    var wideNode = host('700');
    var wideList = NoteUI.DefinitionList.mount(wideNode, {
      layout: 'inline',
      items: [
        { term: '宽容器术语', description: '宽容器中的解释。' },
        { term: '第二术语', description: '第二个解释。' }
      ]
    });
    await wait(40);
    var wideTerm = wideList.el.querySelector('.nui-definition-list__term').getBoundingClientRect();
    var wideValue = wideList.el.querySelector('.nui-definition-list__value').getBoundingClientRect();
    check('wide inline layout uses two columns', wideValue.left > wideTerm.right,
      'term right ' + wideTerm.right + ', value left ' + wideValue.left);
    wideList.destroy();
    wideNode.remove();
    list.update({ layout: 'stacked', dividers: false, items: [{ term: '更新术语', description: '更新值' }] });
    check('layout update', list.el.getAttribute('data-layout') === 'stacked');
    check('dividers can be off', !list.el.classList.contains('nui-definition-list--dividers'));
    list.update({ items: [] });
    check('empty state visible', visible(list.el.querySelector('.nui-definition-list__empty')));
    list.destroy();
    node.remove();
  }

  async function runC12() {
    current = 'C12';
    var node = host('240');
    var metric = NoteUI.Metric.mount(node, {
      label: '活跃设备',
      value: '12,480',
      unit: '台',
      caption: '数据来自本地示例，不代表真实业务。',
      change: { direction: 'up', label: '较上周 +120' }
    });
    check('metric label/value/unit', /活跃设备/.test(metric.el.textContent) &&
      /12,480/.test(metric.el.textContent) && /台/.test(metric.el.textContent));
    check('change direction text', metric.el.querySelector('.nui-metric__change-direction').textContent === '上升');
    check('change host label', /较上周/.test(metric.el.textContent));
    check('aria-live off by default', !metric.el.hasAttribute('aria-live'));
    var computed = getComputedStyle(metric.el.querySelector('.nui-metric__value'));
    check('tabular numerals', /tabular-nums/.test(computed.fontVariantNumeric), computed.fontVariantNumeric);
    metric.update({ value: '9', change: { direction: 'down', label: '较上周 -120' }, announce: true });
    check('update value', /9/.test(metric.el.querySelector('.nui-metric__value').textContent));
    check('update direction', metric.el.getAttribute('data-direction') === 'down');
    check('announce opt-in', metric.el.getAttribute('aria-live') === 'polite' &&
      metric.el.getAttribute('aria-atomic') === 'true');
    metric.update({ change: { direction: 'flat', label: '与上周持平' } });
    check('flat state visible', /持平/.test(metric.el.textContent));
    metric.update({ change: { direction: 'sideways', label: '不应推断' } });
    check('invalid direction not fabricated', metric.el.querySelector('.nui-metric__change').hidden);
    metric.update({ announce: false });
    check('announce can turn off', !metric.el.hasAttribute('aria-live'));
    metric.destroy();
    node.remove();
  }

  window.runContentChecks = async function () {
    try {
      await runC01();
      await runC02();
      await runC03();
      await runC04();
      await runC05();
      await runC06();
      await runC07();
      await runC08();
      await runC09();
      await runC10();
      await runC11();
      await runC12();
      fixture.replaceChildren();
      return { ok: true, results: results };
    } catch (error) {
      return {
        ok: false,
        error: error && error.stack ? error.stack : String(error),
        results: results
      };
    }
  };
})();
