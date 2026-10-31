/*!
 * NoteUI content module — C01–C12
 * Depends on NoteCore. C09/C10 additionally use local vendor KaTeX / marked.
 * Text inputs are plain text unless a component explicitly parses Markdown or TeX.
 */
(function (global) {
  'use strict';

  var NoteUI = global.NoteUI = global.NoteUI || {};
  var VERSION = '1.0.0';
  var own = function (object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  };

  function core() {
    var api = global.NoteCore;
    if (!api) throw new Error('NoteUI 内容组件需要先加载 NoteCore。');
    return api;
  }

  function text(value) {
    return value == null ? '' : String(value);
  }

  function create(tag, className, content) {
    var C = core();
    var node = C.el(tag, className);
    if (arguments.length > 2) C.setContent(node, content);
    return node;
  }

  function setContent(target, value) {
    core().setContent(target, value);
  }

  function clear(target) {
    core().clear(target);
  }

  function isNode(value) {
    return Boolean(core().isNode(value));
  }

  function hidden(element, hide) {
    if (hide) element.setAttribute('hidden', '');
    else element.removeAttribute('hidden');
  }

  function maxHeightValue(value) {
    if (typeof value === 'number' && isFinite(value) && value > 0) return value + 'px';
    if (typeof value === 'string' && value.trim()) return value.trim();
    return '';
  }

  /* A conservative URL check. It is used for host-provided links and for
     Markdown output; the DOM APIs then receive the original string. */
  function normalisedUrl(value) {
    return text(value).trim().replace(/[\u0000- \u007f]+/g, '').toLowerCase();
  }

  function urlProtocol(value) {
    var url = normalisedUrl(value);
    var match = url.match(/^([a-z][a-z0-9+.-]*):/);
    return match ? match[1] : '';
  }

  function isSafeHref(value) {
    var url = text(value).trim();
    if (!url) return false;
    var protocol = urlProtocol(url);
    if (protocol) return ['http', 'https', 'mailto', 'tel'].indexOf(protocol) !== -1;
    return normalisedUrl(url).slice(0, 2) !== '//';
  }

  function isSafeImageSrc(value) {
    var url = text(value).trim();
    if (!url) return false;
    var protocol = urlProtocol(url);
    if (protocol === 'data') {
      return /^data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml|bmp)[;,]/.test(normalisedUrl(url));
    }
    if (protocol) return false;
    return normalisedUrl(url).slice(0, 2) !== '//';
  }

  function visuallyHiddenText(value) {
    var span = create('span', 'nui-visually-hidden', value);
    return span;
  }

  /* ------------------------------------------------------------------ *
   * C01 Typography
   * ------------------------------------------------------------------ */

  var TYPOGRAPHY_VARIANTS = ['h1', 'h2', 'h3', 'body', 'lead', 'caption'];
  var TYPOGRAPHY_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'div'];

  function typographyVariant(value) {
    return TYPOGRAPHY_VARIANTS.indexOf(value) === -1 ? 'body' : value;
  }

  function typographyTag(variant, as) {
    if (TYPOGRAPHY_TAGS.indexOf(as) !== -1) return as;
    if (variant === 'h1' || variant === 'h2' || variant === 'h3') return variant;
    return 'p';
  }

  NoteUI.Typography = {
    version: VERSION,
    variants: TYPOGRAPHY_VARIANTS.slice(),
    mount: function (host, input) {
      var C = core();
      C.validateHost(host);
      var state = C.assign({ variant: 'body', content: '', as: null }, input || {});
      var variant = typographyVariant(state.variant);
      var root = create(typographyTag(variant, state.as), 'nui-type-' + variant);

      function render() {
        variant = typographyVariant(state.variant);
        root.className = 'nui-type-' + variant;
        setContent(root, state.content);
      }

      var instance = C.component(root, state, render, null);
      render();
      host.appendChild(root);
      return instance;
    }
  };

  /* ------------------------------------------------------------------ *
   * C02 TextLink
   * ------------------------------------------------------------------ */

  NoteUI.TextLink = {
    version: VERSION,
    mount: function (host, input) {
      var C = core();
      C.validateHost(host);
      var state = C.assign({
        label: '',
        href: '',
        external: false,
        disabled: false,
        onClick: null
      }, input || {});
      var root = create('a', 'nui-text-link');
      var label = create('span', 'nui-text-link__label');
      var icon = create('span', 'nui-text-link__external-icon', '↗');
      icon.setAttribute('aria-hidden', 'true');
      var srHint = visuallyHiddenText('（外部链接，在新窗口打开）');
      srHint.classList.add('nui-text-link__external-hint');
      root.append(label, icon, srHint);
      var blocked = false;
      var bag = C.listeners(root);

      function render() {
        var href = text(state.href).trim();
        var safe = Boolean(href) && isSafeHref(href);
        var invalid = Boolean(href) && !safe;
        blocked = Boolean(state.disabled) || invalid;
        var external = Boolean(state.external) && !blocked && safe;
        setContent(label, state.label);
        root.classList.toggle('nui-text-link--disabled', blocked);
        root.classList.toggle('nui-text-link--external', external);
        root.classList.toggle('nui-text-link--invalid', invalid);

        if (href && safe && !blocked) root.setAttribute('href', href);
        else root.removeAttribute('href');

        if (external) {
          root.setAttribute('target', '_blank');
          root.setAttribute('rel', 'noopener noreferrer');
        } else {
          root.removeAttribute('target');
          root.removeAttribute('rel');
        }

        if (blocked) root.setAttribute('aria-disabled', 'true');
        else root.removeAttribute('aria-disabled');

        if (blocked || (!href && typeof state.onClick === 'function')) root.setAttribute('tabindex', '0');
        else if (!href) root.setAttribute('tabindex', '0');
        else root.removeAttribute('tabindex');

        if (blocked) root.setAttribute('role', 'link');
        else if (!href && typeof state.onClick === 'function') root.setAttribute('role', 'link');
        else root.removeAttribute('role');

        hidden(icon, !external);
        hidden(srHint, !external);
        if (invalid) srHint.textContent = '（链接地址不受支持）';
        else srHint.textContent = '（外部链接，在新窗口打开）';
        if (invalid) hidden(srHint, false);
      }

      function onClick(event) {
        if (blocked) {
          event.preventDefault();
          return;
        }
        if (typeof state.onClick === 'function') state.onClick(event);
      }

      function onKeydown(event) {
        var key = event.key;
        if (key !== 'Enter' && key !== ' ' && key !== 'Spacebar') return;
        if (blocked) {
          event.preventDefault();
          return;
        }
        /* An anchor without href has no native keyboard activation. */
        if (!root.hasAttribute('href') && typeof state.onClick === 'function') {
          event.preventDefault();
          state.onClick(event);
        }
      }

      bag.on('click', onClick);
      bag.on('keydown', onKeydown);
      var instance = C.component(root, state, render, function () {
        bag.clear();
      });
      render();
      host.appendChild(root);
      return instance;
    }
  };

  /* ------------------------------------------------------------------ *
   * C03 InlineText
   * ------------------------------------------------------------------ */

  var INLINE_VARIANTS = {
    code: 'code',
    kbd: 'kbd',
    mark: 'mark',
    strong: 'strong',
    small: 'small'
  };

  function inlineVariant(value) {
    return own(INLINE_VARIANTS, value) ? value : 'code';
  }

  NoteUI.InlineText = {
    version: VERSION,
    variants: Object.keys(INLINE_VARIANTS),
    mount: function (host, input) {
      var C = core();
      C.validateHost(host);
      var state = C.assign({ text: '', variant: 'code' }, input || {});
      var root = create('span', 'nui-inline-text');
      var child = null;
      var childVariant = null;

      function makeChild(variant) {
        var node = create(INLINE_VARIANTS[variant], [
          'nui-inline-text--' + variant,
          'nui-inline-' + variant
        ].join(' '));
        node.textContent = text(state.text);
        return node;
      }

      function render() {
        var variant = inlineVariant(state.variant);
        if (!child || childVariant !== variant) {
          if (child) child.remove();
          child = makeChild(variant);
          childVariant = variant;
          root.appendChild(child);
        }
        child.textContent = text(state.text);
      }

      var instance = C.component(root, state, render, null);
      render();
      host.appendChild(root);
      return instance;
    }
  };

  /* ------------------------------------------------------------------ *
   * C04 Quote
   * ------------------------------------------------------------------ */

  NoteUI.Quote = {
    version: VERSION,
    mount: function (host, input) {
      var C = core();
      C.validateHost(host);
      var state = C.assign({ content: '', source: '', cite: '' }, input || {});
      var root = create('figure', 'nui-quote');
      var body = create('blockquote', 'nui-quote__body');
      var caption = create('figcaption', 'nui-quote__caption');
      root.append(body, caption);

      function render() {
        setContent(body, state.content);
        var source = text(state.source);
        var cite = text(state.cite).trim();
        var safe = cite && isSafeHref(cite);
        clear(caption);
        var hasSource = Boolean(source || cite);
        hidden(caption, !hasSource);
        if (!hasSource) return;

        caption.appendChild(create('span', 'nui-quote__source-label', '来源：'));
        var citeNode = create('cite', 'nui-quote__source');
        if (safe) {
          var link = create('a', 'nui-quote__source-link', source || cite);
          link.setAttribute('href', cite);
          citeNode.appendChild(link);
        } else {
          citeNode.textContent = source || cite;
        }
        caption.appendChild(citeNode);
      }

      var instance = C.component(root, state, render, null);
      render();
      host.appendChild(root);
      return instance;
    }
  };

  /* ------------------------------------------------------------------ *
   * C05 List
   * ------------------------------------------------------------------ */

  function listVariant(state) {
    if (state.variant === 'ordered' || state.variant === 'unordered' || state.variant === 'description') {
      return state.variant;
    }
    if (state.ordered === true) return 'ordered';
    if (state.ordered === false) return 'unordered';
    return 'unordered';
  }

  function normalizeListItem(item) {
    if (isNode(item)) return { content: item, children: [] };
    if (item && typeof item === 'object' && !isNode(item)) {
      return {
        content: own(item, 'content') ? item.content : '',
        children: Array.isArray(item.children) ? item.children : []
      };
    }
    return { content: item, children: [] };
  }

  NoteUI.List = {
    version: VERSION,
    mount: function (host, input) {
      var C = core();
      C.validateHost(host);
      var state = C.assign({
        items: [],
        variant: null,
        ordered: null,
        start: null,
        label: ''
      }, input || {});
      var root = create('div', 'nui-list');

      function buildList(items, variant, start, nested) {
        var tag = variant === 'ordered' ? 'ol' : 'ul';
        var classes = 'nui-list__list nui-list__list--' + variant + (nested ? ' nui-list__list--nested' : '');
        var list = create(tag, classes);
        list.setAttribute('data-variant', variant);
        if (!nested && variant === 'ordered' && state.start != null && isFinite(Number(state.start))) {
          list.start = Math.trunc(Number(state.start));
        }
        if (!nested && text(state.label)) list.setAttribute('aria-label', text(state.label));

        (Array.isArray(items) ? items : []).forEach(function (raw) {
          var item = normalizeListItem(raw);
          var li = create('li', 'nui-list__item');
          var content = create('div', 'nui-list__content');
          setContent(content, item.content);
          li.appendChild(content);
          if (item.children.length) {
            li.appendChild(buildList(item.children, variant, null, true));
          }
          list.appendChild(li);
        });
        return list;
      }

      function render() {
        clear(root);
        var variant = listVariant(state);
        root.appendChild(buildList(state.items, variant, state.start, false));
      }

      var instance = C.component(root, state, render, null);
      render();
      host.appendChild(root);
      return instance;
    }
  };

  /* ------------------------------------------------------------------ *
   * C06 Table
   * ------------------------------------------------------------------ */

  var TABLE_DEFAULTS = {
    columns: [],
    rows: [],
    rowKey: null,
    caption: '',
    empty: '暂无数据',
    sort: false,
    onSort: null,
    emphasis: null,
    maxHeight: null,
    dense: false
  };
  var tableCollator = null;

  function sameKey(left, right) {
    return String(left) === String(right);
  }

  function anyKeyMatch(candidate, key) {
    if (Array.isArray(candidate)) {
      return candidate.some(function (item) { return sameKey(item, key); });
    }
    return candidate != null && sameKey(candidate, key);
  }

  function tableAlignment(value) {
    if (value === 'left' || value === 'start') return 'start';
    if (value === 'right' || value === 'end') return 'end';
    if (value === 'center') return 'center';
    return 'start';
  }

  function tableCellValue(row, column) {
    if (!row || column == null) return '';
    return row[column.key];
  }

  function sortText(value) {
    if (isNode(value)) return value.textContent || '';
    return value == null ? '' : String(value);
  }

  function TableSort(sort) {
    if (!sort) return { enabled: false, key: null, direction: null };
    if (sort === true) return { enabled: true, key: null, direction: null };
    if (typeof sort === 'object') {
      var key = sort.key == null ? null : sort.key;
      var direction = key == null ? null : (sort.direction === 'desc' ? 'desc' : 'asc');
      return { enabled: true, key: key, direction: direction };
    }
    return { enabled: true, key: null, direction: null };
  }

  NoteUI.Table = {
    version: VERSION,
    mount: function (host, input) {
      var C = core();
      C.validateHost(host);
      var state = C.assign({}, TABLE_DEFAULTS);
      C.assign(state, input || {});
      var root = create('div', 'nui-table');
      var scroll = create('div', 'nui-table__scroll');
      var table = create('table', 'nui-table__table');
      var caption = create('caption', 'nui-table__caption');
      var colgroup = create('colgroup', 'nui-table__colgroup');
      var thead = create('thead', 'nui-table__head');
      var tbody = create('tbody', 'nui-table__body');
      var hint = create('div', 'nui-table__scroll-hint');
      hint.id = C.uid('nui-table-hint');
      hidden(hint, true);
      scroll.setAttribute('tabindex', '0');
      scroll.setAttribute('role', 'region');
      scroll.setAttribute('aria-describedby', hint.id);
      table.append(caption, colgroup, thead, tbody);
      scroll.appendChild(table);
      root.append(scroll, hint);

      var rowMap = Object.create(null);
      var sortEnabled = false;
      var activeSort = { key: null, direction: null };
      var captionBase = '数据表格。';
      var alive = true;
      var frame = 0;
      var bag = C.listeners(root);
      var disconnectResize = null;

      function currentColumns() {
        return Array.isArray(state.columns) ? state.columns : [];
      }

      function createSortRows(columns) {
        var source = Array.isArray(state.rows) ? state.rows : [];
        var indexed = source.map(function (row, index) {
          var key;
          if (typeof state.rowKey === 'function') key = state.rowKey(row, index);
          else if (typeof state.rowKey === 'string' && row && row[state.rowKey] != null) key = row[state.rowKey];
          else if (row && own(row, 'key') && row.key != null) key = row.key;
          if (key == null) key = index;
          return { row: row, index: index, key: key };
        });
        if (activeSort.key == null || activeSort.direction == null) return indexed;
        var column = null;
        columns.some(function (item) {
          if (sameKey(item.key, activeSort.key)) {
            column = item;
            return true;
          }
          return false;
        });
        if (!column) {
          activeSort = { key: null, direction: null };
          return indexed;
        }
        if (!tableCollator && global.Intl && global.Intl.Collator) {
          tableCollator = new global.Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });
        }
        indexed.sort(function (left, right) {
          var leftValue = tableCellValue(left.row, column);
          var rightValue = tableCellValue(right.row, column);
          var leftText = sortText(leftValue).trim();
          var rightText = sortText(rightValue).trim();
          var leftEmpty = leftText === '';
          var rightEmpty = rightText === '';
          if (leftEmpty && rightEmpty) return left.index - right.index;
          if (leftEmpty) return 1;
          if (rightEmpty) return -1;
          var compared;
          if (typeof leftValue === 'number' && typeof rightValue === 'number') {
            compared = leftValue - rightValue;
          } else if (tableCollator) {
            compared = tableCollator.compare(leftText, rightText);
          } else if (leftText < rightText) {
            compared = -1;
          } else if (leftText > rightText) {
            compared = 1;
          } else {
            compared = 0;
          }
          if (compared === 0) return left.index - right.index;
          return activeSort.direction === 'desc' ? -compared : compared;
        });
        return indexed;
      }

      function updateScrollState() {
        if (!alive) return;
        var horizontal = scroll.scrollWidth > scroll.clientWidth + 1;
        var vertical = scroll.scrollHeight > scroll.clientHeight + 1;
        var parts = [];
        if (horizontal) parts.push('横向');
        if (vertical) parts.push('纵向');
        hint.textContent = parts.length ? '表格可' + parts.join('和') + '滚动查看完整内容。' : '';
        hidden(hint, parts.length === 0);
        scroll.setAttribute('aria-label', captionBase + (parts.length ? '可' + parts.join('和') + '滚动查看。' : ''));
      }

      function measure() {
        if (!alive) return;
        if (frame) {
          global.cancelAnimationFrame(frame);
          frame = 0;
        }
        frame = global.requestAnimationFrame(function () {
          frame = 0;
          updateScrollState();
        });
      }

      function bindOverflow() {
        if (!disconnectResize) disconnectResize = C.onResize(scroll, updateScrollState);
      }

      function render() {
        /* Sorting controls are controlled by state.sort; the active
           direction is internal after the first user click. */
        var columns = currentColumns();
        if (activeSort.key != null) {
          var hasActive = columns.some(function (column) { return sameKey(column.key, activeSort.key); });
          if (!hasActive) activeSort = { key: null, direction: null };
        }
        var rows = createSortRows(columns);
        var captionText = text(state.caption).trim();
        captionBase = captionText ? '表格：' + captionText + '。' : '数据表格。';

        hidden(caption, !captionText);
        clear(caption);
        if (captionText) caption.textContent = captionText;

        clear(colgroup);
        columns.forEach(function (column) {
          var col = create('col');
          if (column.width != null && column.width !== '') {
            col.style.width = typeof column.width === 'number' ? column.width + 'px' : String(column.width);
          }
          colgroup.appendChild(col);
        });

        clear(thead);
        var headRow = create('tr', 'nui-table__head-row');
        columns.forEach(function (column, index) {
          var alignment = tableAlignment(column.align);
          var th = create('th', [
            'nui-table__cell',
            'nui-table__head-cell',
            'nui-table__cell--' + alignment
          ].join(' '));
          th.scope = 'col';
          if (activeSort.key != null && sameKey(activeSort.key, column.key)) {
            th.setAttribute('aria-sort', activeSort.direction === 'desc' ? 'descending' : 'ascending');
          }
          if (state.emphasis && state.emphasis.column != null &&
              anyKeyMatch(state.emphasis.column, column.key)) {
            th.classList.add('nui-table__cell--emphasis');
          }
          var sortable = sortEnabled && column.sortable !== false;
          if (sortable) {
            var button = create('button', 'nui-table__sort');
            button.type = 'button';
            button.setAttribute('data-col-index', String(index));
            var label = create('span', 'nui-table__sort-label');
            var labelText = column.label && column.label.nodeType
              ? C.text(column.label.textContent).trim()
              : C.text(column.label).trim();
            setContent(label, column.label);
            var sortName = labelText || '此列';
            var sortHint = '按“' + sortName + '”排序';
            if (activeSort.key != null && sameKey(activeSort.key, column.key)) {
              sortHint += activeSort.direction === 'desc'
                ? '，当前降序，点击取消排序'
                : '，当前升序，点击切换为降序';
            }
            button.setAttribute('aria-label', sortHint);
            var indicator = create('span', 'nui-table__sort-indicator');
            indicator.setAttribute('aria-hidden', 'true');
            indicator.textContent = activeSort.key != null && sameKey(activeSort.key, column.key)
              ? (activeSort.direction === 'desc' ? '↓' : '↑')
              : '↕';
            button.append(label, indicator);
            th.appendChild(button);
          } else {
            var plainLabel = create('span', 'nui-table__sort-label');
            setContent(plainLabel, column.label);
            th.appendChild(plainLabel);
          }
          headRow.appendChild(th);
        });
        if (columns.length) thead.appendChild(headRow);

        clear(tbody);
        rowMap = Object.create(null);
        if (!columns.length) {
          var noColumns = create('tr', 'nui-table__empty-row');
          var noColumnsCell = create('td', 'nui-table__empty-cell');
          noColumnsCell.colSpan = 1;
          setContent(noColumnsCell, state.empty == null ? '暂无数据' : state.empty);
          noColumns.appendChild(noColumnsCell);
          tbody.appendChild(noColumns);
        } else if (!rows.length) {
          var emptyRow = create('tr', 'nui-table__empty-row');
          var emptyCell = create('td', 'nui-table__empty-cell');
          emptyCell.colSpan = columns.length;
          setContent(emptyCell, state.empty == null ? '暂无数据' : state.empty);
          emptyRow.appendChild(emptyCell);
          tbody.appendChild(emptyRow);
        } else {
          rows.forEach(function (entry) {
            var row = entry.row || {};
            var keyString = String(entry.key);
            var tr = create('tr', 'nui-table__row');
            tr.setAttribute('data-row-key', keyString);
            if (state.emphasis && state.emphasis.row != null &&
                anyKeyMatch(state.emphasis.row, entry.key)) {
              tr.classList.add('nui-table__row--emphasis');
            }
            rowMap['$' + keyString] = tr;
            columns.forEach(function (column) {
              var alignment = tableAlignment(column.align);
              var td = create('td', [
                'nui-table__cell',
                'nui-table__cell--' + alignment
              ].join(' '));
              if (state.emphasis && state.emphasis.column != null &&
                  anyKeyMatch(state.emphasis.column, column.key)) {
                td.classList.add('nui-table__cell--emphasis');
              }
              setContent(td, tableCellValue(row, column));
              tr.appendChild(td);
            });
            tbody.appendChild(tr);
          });
        }

        var width = columns.length ? columns.length * 128 : 0;
        table.style.minWidth = width ? Math.min(width, 4096) + 'px' : '';
        var maxHeight = maxHeightValue(state.maxHeight);
        if (maxHeight) scroll.style.maxHeight = maxHeight;
        else scroll.style.removeProperty('max-height');
        root.classList.toggle('nui-table--dense', Boolean(state.dense));
        root.classList.toggle('nui-table--sortable', sortEnabled);
        scroll.setAttribute('aria-label', captionBase);
        updateScrollState();
      }

      function syncSort(patch) {
        if (patch === null || (patch && own(patch, 'sort'))) {
          var next = TableSort(state.sort);
          sortEnabled = next.enabled;
          activeSort = { key: sortEnabled ? next.key : null, direction: sortEnabled ? next.direction : null };
        }
      }

      function onRootClick(event) {
        var target = event.target;
        var button = target && target.closest ? target.closest('.nui-table__sort') : null;
        if (!button || !root.contains(button) || !sortEnabled) return;
        var index = Number(button.getAttribute('data-col-index'));
        var columns = currentColumns();
        var column = columns[index];
        if (!column || column.sortable === false) return;
        if (activeSort.key == null || !sameKey(activeSort.key, column.key)) {
          activeSort = { key: column.key, direction: 'asc' };
        } else if (activeSort.direction === 'asc') {
          activeSort = { key: column.key, direction: 'desc' };
        } else {
          activeSort = { key: null, direction: null };
        }
        render();
        var refreshed = root.querySelector('.nui-table__sort[data-col-index="' + index + '"]');
        if (refreshed && typeof refreshed.focus === 'function') {
          try { refreshed.focus({ preventScroll: true }); } catch (ignore) { refreshed.focus(); }
        }
        if (typeof state.onSort === 'function') {
          var sorted = createSortRows(columns);
          state.onSort({
            key: activeSort.key,
            direction: activeSort.direction,
            column: activeSort.key == null ? null : column,
            rows: sorted.map(function (entry) { return entry.row; })
          }, event);
        }
      }

      function cleanup() {
        alive = false;
        bag.clear();
        if (disconnectResize) disconnectResize();
        if (frame && global.cancelAnimationFrame) global.cancelAnimationFrame(frame);
      }

      bag.on('click', onRootClick);

      /* Initial sort state must exist before the first render. */
      syncSort(null);
      var instance = C.component(root, state, function (patch) {
        syncSort(patch);
        render();
      }, cleanup);
      /* state.sort defaults false, but TableSort(false) disables controls. */
      render();
      host.appendChild(root);
      bindOverflow();
      updateScrollState();
      measure();
      instance.getTarget = function (rowKey) {
        if (!alive) return null;
        return rowMap['$' + String(rowKey)] || null;
      };
      return instance;
    }
  };

  /* ------------------------------------------------------------------ *
   * C07 CodeBlock
   * ------------------------------------------------------------------ */

  function normaliseCode(value) {
    return text(value).replace(/\r\n?/g, '\n');
  }

  function addHighlightLine(set, line, count) {
    var number = Math.trunc(Number(line));
    if (!isFinite(number) || number < 1 || number > count) return;
    set.add(number);
  }

  function addHighlightRange(set, start, end, count) {
    var first = Math.trunc(Number(start));
    var last = Math.trunc(Number(end));
    if (!isFinite(first) || !isFinite(last)) return;
    if (first > last) {
      var swap = first;
      first = last;
      last = swap;
    }
    first = Math.max(1, first);
    last = Math.min(count, last);
    for (var line = first; line <= last; line += 1) set.add(line);
  }

  function highlightSet(spec, count) {
    var set = new Set();
    function consume(value) {
      if (value == null || count < 1) return;
      if (typeof value === 'number') {
        addHighlightLine(set, value, count);
        return;
      }
      if (typeof value === 'string') {
        value.split(',').forEach(function (part) {
          var match = part.trim().match(/^(\d+)\s*(?:[-–—]\s*(\d+))?$/);
          if (!match) return;
          if (match[2] == null) addHighlightLine(set, match[1], count);
          else addHighlightRange(set, match[1], match[2], count);
        });
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(consume);
        return;
      }
      if (typeof value === 'object') {
        if (value.start != null || value.end != null) {
          addHighlightRange(set,
            value.start == null ? value.end : value.start,
            value.end == null ? value.start : value.end,
            count);
        } else if (Array.isArray(value.lines)) {
          consume(value.lines);
        }
      }
    }
    consume(spec);
    return set;
  }

  NoteUI.CodeBlock = {
    version: VERSION,
    mount: function (host, input) {
      var C = core();
      C.validateHost(host);
      var state = C.assign({
        code: '',
        language: '',
        title: '',
        lineNumbers: true,
        highlight: null,
        copy: true,
        maxHeight: null
      }, input || {});
      var root = create('div', 'nui-code');
      var header = create('div', 'nui-code__header');
      var meta = create('div', 'nui-code__meta');
      var title = create('span', 'nui-code__title');
      var language = create('span', 'nui-code__language');
      var actions = create('div', 'nui-code__actions');
      var status = create('span', 'nui-code__copy-status');
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      hidden(status, true);
      var copyButton = create('button', 'nui-code__copy', '复制');
      copyButton.type = 'button';
      meta.append(title, language);
      actions.append(status, copyButton);
      header.append(meta, actions);

      var viewport = create('div', 'nui-code__viewport');
      viewport.setAttribute('tabindex', '0');
      viewport.setAttribute('role', 'region');
      var pre = create('pre', 'nui-code__pre');
      var code = create('code', 'nui-code__code');
      pre.appendChild(code);
      viewport.appendChild(pre);
      var hint = create('div', 'nui-code__scroll-hint');
      hint.id = C.uid('nui-code-hint');
      hidden(hint, true);
      viewport.setAttribute('aria-describedby', hint.id);

      var fallback = create('div', 'nui-code__copy-fallback');
      var fallbackHelp = create('p', 'nui-code__copy-help');
      var fallbackLabel = create('label', 'nui-code__copy-label', '手动复制代码');
      var fallbackArea = create('textarea', 'nui-code__copy-area');
      fallbackArea.readOnly = true;
      fallbackArea.spellcheck = false;
      fallbackArea.id = C.uid('nui-code-copy');
      fallbackLabel.htmlFor = fallbackArea.id;
      fallback.append(fallbackHelp, fallbackLabel, fallbackArea);
      hidden(fallback, true);

      root.append(header, viewport, hint, fallback);

      var activeCode = normaliseCode(state.code);
      var copyToken = 0;
      var copying = false;
      var alive = true;
      var copyingFrame = 0;
      var bag = C.listeners(copyButton);
      var disconnectResize = null;

      function updateScrollState() {
        if (!alive) return;
        var horizontal = viewport.scrollWidth > viewport.clientWidth + 1;
        var vertical = viewport.scrollHeight > viewport.clientHeight + 1;
        var parts = [];
        if (horizontal) parts.push('横向');
        if (vertical) parts.push('纵向');
        hint.textContent = parts.length ? '代码可' + parts.join('和') + '滚动查看完整内容。' : '';
        hidden(hint, parts.length === 0);
        var label = '代码块';
        if (text(state.title).trim()) label += '：' + text(state.title).trim();
        else if (text(state.language).trim()) label += '（' + text(state.language).trim() + '）';
        label += parts.length ? '。可' + parts.join('和') + '滚动查看。' : '。';
        viewport.setAttribute('aria-label', label);
      }

      function scheduleMeasure() {
        if (!alive) return;
        if (copyingFrame) global.cancelAnimationFrame(copyingFrame);
        copyingFrame = global.requestAnimationFrame(function () {
          copyingFrame = 0;
          updateScrollState();
        });
      }

      function clearMessage() {
        status.textContent = '';
        status.removeAttribute('data-state');
        hidden(status, true);
        hidden(fallback, true);
      }

      function setMessage(message, tone) {
        status.textContent = message;
        if (tone) status.setAttribute('data-state', tone);
        else status.removeAttribute('data-state');
        hidden(status, false);
      }

      function showManualFallback() {
        fallbackArea.value = activeCode;
        setMessage('自动复制失败，请在下方选择代码后手动复制。', 'failed');
        fallbackHelp.textContent = '浏览器未允许自动复制。请选择下面的代码，按 Ctrl+C（macOS 为 Command+C）复制。';
        hidden(fallback, false);
        try {
          fallbackArea.focus();
          fallbackArea.select();
        } catch (ignore) {
          /* Selection is best effort; the textarea remains usable. */
        }
      }

      function copyCode() {
        if (!alive || copying) return;
        copying = true;
        var token = ++copyToken;
        copyButton.setAttribute('aria-busy', 'true');
        hidden(fallback, true);
        setMessage('正在复制…', 'pending');
        var task;
        try {
          if (typeof C.copy !== 'function') throw new Error('复制接口不可用');
          task = C.copy(activeCode);
        } catch (error) {
          task = Promise.reject(error);
        }
        Promise.resolve(task).then(function (result) {
          if (!alive || token !== copyToken) return;
          copying = false;
          copyButton.removeAttribute('aria-busy');
          if (result && result.ok && result.method !== 'manual') {
            setMessage('已复制', 'success');
            hidden(fallback, true);
          } else {
            showManualFallback();
          }
        }).catch(function () {
          if (!alive || token !== copyToken) return;
          copying = false;
          copyButton.removeAttribute('aria-busy');
          showManualFallback();
        });
      }

      function render() {
        copyToken += 1;
        copying = false;
        copyButton.removeAttribute('aria-busy');
        clearMessage();
        activeCode = normaliseCode(state.code);
        fallbackArea.value = activeCode;
        var titleText = text(state.title).trim();
        var languageText = text(state.language).trim();
        var showCopy = Boolean(state.copy);
        title.textContent = titleText;
        hidden(title, !titleText);
        language.textContent = languageText;
        hidden(language, !languageText);
        hidden(copyButton, !showCopy);
        hidden(header, !(titleText || languageText || showCopy));
        copyButton.textContent = '复制';
        copyButton.setAttribute('aria-label', titleText ? '复制代码：' + titleText : '复制代码');

        var lines = activeCode.split('\n');
        var highlights = highlightSet(state.highlight, lines.length);
        var showNumbers = Boolean(state.lineNumbers);
        var digits = String(Math.max(1, lines.length)).length;
        var gutterWidth = (Math.max(2, digits) + 1.5) + 'ch';
        root.classList.toggle('nui-code--no-lines', !showNumbers);
        clear(code);
        var fragment = document.createDocumentFragment();
        lines.forEach(function (lineText, index) {
          var line = create('span', 'nui-code__line');
          if (highlights.has(index + 1)) line.classList.add('nui-code__line--highlight');
          if (showNumbers) {
            var number = create('span', 'nui-code__ln', String(index + 1));
            number.setAttribute('aria-hidden', 'true');
            number.style.width = gutterWidth;
            line.appendChild(number);
          }
          var source = create('span', 'nui-code__src', lineText);
          line.appendChild(source);
          fragment.appendChild(line);
        });
        code.appendChild(fragment);

        var height = maxHeightValue(state.maxHeight);
        if (height) viewport.style.maxHeight = height;
        else viewport.style.removeProperty('max-height');
        scheduleMeasure();
      }

      function cleanup() {
        alive = false;
        bag.clear();
        if (disconnectResize) disconnectResize();
        if (copyingFrame && global.cancelAnimationFrame) global.cancelAnimationFrame(copyingFrame);
      }

      bag.on('click', copyCode);
      var instance = C.component(root, state, render, cleanup);
      render();
      host.appendChild(root);
      if (typeof C.onResize === 'function') {
        disconnectResize = C.onResize(viewport, updateScrollState);
      }
      updateScrollState();
      scheduleMeasure();
      return instance;
    }
  };

  /* ------------------------------------------------------------------ *
   * C08 Figure
   * ------------------------------------------------------------------ */

  function requireAlt(value) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new TypeError('NoteUI.Figure：alt 为必填的非空文本。');
    }
    return value;
  }

  function figureRatio(value) {
    if (value === 'auto') return 'auto';
    if (typeof value === 'number' && isFinite(value) && value > 0) return String(value);
    if (typeof value === 'string' &&
        /^\s*\d+(?:\.\d+)?\s*(?:\/\s*\d+(?:\.\d+)?)?\s*$/.test(value)) {
      return value.trim();
    }
    return '16 / 9';
  }

  NoteUI.Figure = {
    version: VERSION,
    mount: function (host, input) {
      var C = core();
      C.validateHost(host);
      var state = C.assign({
        src: '',
        alt: '',
        caption: '',
        source: '',
        sourceHref: '',
        ratio: '16 / 9',
        lazy: false
      }, input || {});
      requireAlt(state.alt);
      var root = create('figure', 'nui-figure');
      var media = create('div', 'nui-figure__media');
      var image = create('img', 'nui-figure__image');
      image.decoding = 'async';
      var fallback = create('div', 'nui-figure__fallback');
      fallback.setAttribute('role', 'group');
      fallback.setAttribute('aria-label', '图片不可用');
      var fallbackTitle = create('span', 'nui-figure__fallback-title', '图片无法显示');
      var fallbackAlt = create('span', 'nui-figure__fallback-alt');
      var fallbackNote = create('span', 'nui-figure__fallback-note');
      fallback.append(fallbackTitle, fallbackAlt, fallbackNote);
      media.append(image, fallback);
      var caption = create('figcaption', 'nui-figure__caption');
      root.append(media, caption);

      var lastSrc = null;
      var failed = false;
      var alive = true;
      var bag = C.listeners(image);

      function showFailure(reason) {
        failed = true;
        fallbackNote.textContent = reason;
        fallbackAlt.textContent = '替代文本：' + text(state.alt);
        hidden(image, true);
        hidden(fallback, false);
        root.classList.add('nui-figure--failed');
      }

      function showImage() {
        failed = false;
        hidden(image, false);
        hidden(fallback, true);
        root.classList.remove('nui-figure--failed');
      }

      function renderCaption() {
        clear(caption);
        var captionText = text(state.caption);
        var sourceText = text(state.source);
        var sourceHref = text(state.sourceHref).trim();
        var hasSource = Boolean(sourceText || sourceHref);
        hidden(caption, !(captionText || hasSource));
        if (captionText) {
          caption.appendChild(create('p', 'nui-figure__caption-text', captionText));
        }
        if (hasSource) {
          var row = create('p', 'nui-figure__source');
          row.appendChild(create('span', 'nui-figure__source-label', '来源：'));
          if (sourceHref && isSafeHref(sourceHref)) {
            var link = create('a', 'nui-figure__source-link', sourceText || sourceHref);
            link.setAttribute('href', sourceHref);
            row.appendChild(link);
          } else {
            row.appendChild(create('span', 'nui-figure__source-text', sourceText || sourceHref));
          }
          caption.appendChild(row);
        }
      }

      function render() {
        renderCaption();
        image.alt = text(state.alt);
        fallbackAlt.textContent = '替代文本：' + text(state.alt);
        image.loading = state.lazy ? 'lazy' : 'eager';
        var ratio = figureRatio(state.ratio);
        media.classList.toggle('nui-figure__media--adaptive', ratio === 'auto');
        if (ratio === 'auto') media.style.removeProperty('aspect-ratio');
        else media.style.aspectRatio = ratio;

        var src = text(state.src).trim();
        if (!isSafeImageSrc(src)) {
          lastSrc = '';
          image.removeAttribute('src');
          showFailure('图片地址无效。仅支持本地相对路径或 data:image URL。');
          return;
        }
        if (src !== lastSrc) {
          lastSrc = src;
          image.setAttribute('src', src);
          showImage();
        } else if (failed) {
          hidden(image, true);
          hidden(fallback, false);
        } else {
          showImage();
        }
      }

      function cleanup() {
        alive = false;
        bag.clear();
      }

      bag.on('error', function () {
        if (!alive) return;
        showFailure('图片未能加载。请检查本地文件路径或图片文件是否可用。');
      });
      bag.on('load', function () {
        if (!alive) return;
        showImage();
      });

      var instance = C.component(root, state, render, cleanup);
      var baseUpdate = instance.update;
      instance.update = function (patch) {
        if (patch && own(patch, 'alt')) requireAlt(patch.alt);
        return baseUpdate(patch);
      };
      render();
      host.appendChild(root);
      return instance;
    }
  };

  /* ------------------------------------------------------------------ *
   * C09 Math
   * ------------------------------------------------------------------ */

  NoteUI.Math = {
    version: VERSION,
    mount: function (host, input) {
      var C = core();
      C.validateHost(host);
      var state = C.assign({
        tex: '',
        display: false,
        label: '',
        ariaLabel: ''
      }, input || {});
      var root = create('span', 'nui-math');
      var renderBox = create('span', 'nui-math__render');
      var errorBox = create('span', 'nui-math__error');
      var errorTitle = create('span', 'nui-math__error-title', '公式未能渲染');
      var errorReason = create('span', 'nui-math__error-reason');
      var rawLabel = create('span', 'nui-math__raw-label', '原始 TeX：');
      var rawCode = create('code', 'nui-math__raw');
      errorBox.append(errorTitle, errorReason, rawLabel, rawCode);
      hidden(errorBox, true);
      root.append(renderBox, errorBox);

      function showError(reason, tex) {
        clear(renderBox);
        hidden(renderBox, true);
        hidden(errorBox, false);
        errorReason.textContent = '原因：' + (reason || '未知的公式解析错误。');
        rawCode.textContent = tex;
        root.classList.add('nui-math--error');
        var formulaLabel = text(state.label || state.ariaLabel).trim();
        root.setAttribute('role', 'group');
        root.setAttribute('aria-label', formulaLabel ? '公式错误：' + formulaLabel : '公式错误');
      }

      function render() {
        var display = Boolean(state.display || state.block);
        var label = text(state.label || state.ariaLabel).trim();
        var tex = text(state.tex);
        root.classList.toggle('nui-math--block', display);
        root.classList.toggle('nui-math--inline', !display);
        if (label) {
          root.setAttribute('role', 'math');
          root.setAttribute('aria-label', label);
        } else {
          root.removeAttribute('role');
          root.removeAttribute('aria-label');
        }
        if (display) root.setAttribute('tabindex', '0');
        else root.removeAttribute('tabindex');

        root.classList.remove('nui-math--error');
        hidden(errorBox, true);
        clear(errorBox);
        errorBox.append(errorTitle, errorReason, rawLabel, rawCode);
        errorReason.textContent = '';
        rawCode.textContent = '';
        clear(renderBox);
        hidden(renderBox, false);

        if (!global.katex || typeof global.katex.render !== 'function') {
          showError('未加载本地 KaTeX 依赖。', tex);
          return;
        }
        try {
          global.katex.render(tex, renderBox, {
            displayMode: display,
            throwOnError: true,
            trust: false,
            strict: 'ignore',
            output: 'htmlAndMathml'
          });
          var anchors = renderBox.querySelectorAll('a');
          Array.prototype.forEach.call(anchors, function (anchor) {
            if (!isSafeHref(anchor.getAttribute('href'))) anchor.removeAttribute('href');
            anchor.removeAttribute('target');
          });
        } catch (error) {
          var reason = error && error.message ? error.message : String(error || '公式解析失败。');
          showError(reason, tex);
        }
      }

      var instance = C.component(root, state, render, null);
      render();
      host.appendChild(root);
      return instance;
    }
  };

  /* ------------------------------------------------------------------ *
   * C10 Markdown
   * ------------------------------------------------------------------ */

  var MD_ALLOWED_TAGS = Object.create(null);
  ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li',
    'pre', 'code', 'strong', 'em', 'del', 'hr', 'br', 'a',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption'
  ].forEach(function (tag) { MD_ALLOWED_TAGS[tag] = true; });

  var MD_DROP_TAGS = Object.create(null);
  ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button',
    'textarea', 'select', 'option', 'svg', 'math', 'video', 'audio', 'source',
    'track', 'canvas', 'noscript', 'template', 'meta', 'link', 'base',
    'frame', 'frameset', 'applet', 'param', 'marquee', 'portal'
  ].forEach(function (tag) { MD_DROP_TAGS[tag] = true; });

  function unwrapMarkdownNode(node, parent) {
    var container = node.parentNode || parent;
    while (node.firstChild) container.insertBefore(node.firstChild, node);
    node.remove();
  }

  function sanitizeMarkdownClass(element, tag) {
    var value = text(element.getAttribute('class'));
    var tokens = value.split(/\s+/).filter(function (token) {
      if (!token) return false;
      if (token === 'nui-markdown__raw') return true;
      return tag === 'code' && /^language-[A-Za-z0-9_+-]+$/.test(token);
    });
    if (tokens.length) element.setAttribute('class', tokens.join(' '));
    else element.removeAttribute('class');
  }

  function sanitizeMarkdownAttributes(element, tag) {
    var attributes = Array.prototype.slice.call(element.attributes);
    attributes.forEach(function (attribute) {
      var name = attribute.name.toLowerCase();
      if (tag === 'a' && name === 'href') return;
      if (tag === 'a' && name === 'title') return;
      if (tag === 'ol' && name === 'start' && /^-?\d+$/.test(attribute.value)) return;
      if ((tag === 'th' || tag === 'td') && name === 'align' &&
          ['left', 'center', 'right'].indexOf(attribute.value) !== -1) return;
      if ((tag === 'code' || tag === 'pre') && name === 'class') {
        sanitizeMarkdownClass(element, tag);
        return;
      }
      element.removeAttribute(attribute.name);
    });
    if (tag === 'th' || tag === 'td') {
      var align = element.getAttribute('align');
      if (align && ['left', 'center', 'right'].indexOf(align) === -1) element.removeAttribute('align');
    }
  }

  function sanitizeMarkdownChildren(parent) {
    var node = parent.firstChild;
    while (node) {
      var next = node.nextSibling;
      if (node.nodeType === 1) {
        var tag = node.tagName.toLowerCase();
        if (MD_DROP_TAGS[tag]) {
          node.remove();
        } else if (!MD_ALLOWED_TAGS[tag]) {
          sanitizeMarkdownChildren(node);
          unwrapMarkdownNode(node, parent);
        } else if (tag === 'a' && !isSafeHref(node.getAttribute('href'))) {
          sanitizeMarkdownChildren(node);
          unwrapMarkdownNode(node, parent);
        } else {
          sanitizeMarkdownAttributes(node, tag);
          sanitizeMarkdownChildren(node);
        }
      } else if (node.nodeType !== 3 && node.nodeType !== 4) {
        node.remove();
      }
      node = next;
    }
  }

  function makeMarkedParser() {
    var C = core();
    var lib = global.marked;
    if (!lib || typeof lib.Marked !== 'function' || typeof lib.Renderer !== 'function') {
      throw new Error('未加载本地 marked 依赖。');
    }
    var renderer = new lib.Renderer();
    renderer.html = function (token) {
      var raw = C.escapeHtml(text(token && (token.text != null ? token.text : token.raw)));
      if (token && token.block) {
        return '\n\n<pre class="nui-markdown__raw">' + raw + '</pre>\n\n';
      }
      return '<code class="nui-markdown__raw">' + raw + '</code>';
    };
    renderer.image = function (token) {
      var alt = text(token && (token.text || token.title || ''));
      return C.escapeHtml(alt ? '[图片未嵌入：' + alt + ']' : '[图片未嵌入]');
    };
    return new lib.Marked({ gfm: true, breaks: false, renderer: renderer });
  }

  function moveCellChildren(cell) {
    var fragment = document.createDocumentFragment();
    if (cell) {
      while (cell.firstChild) fragment.appendChild(cell.firstChild);
    }
    return fragment;
  }

  function decorateMarkdownBody(body) {
    ['h1', 'h2', 'h3'].forEach(function (tag) {
      Array.prototype.forEach.call(body.querySelectorAll(tag), function (heading) {
        heading.classList.add('nui-type-' + tag);
      });
    });
    Array.prototype.forEach.call(body.querySelectorAll('ul, ol'), function (list) {
      list.classList.add('nui-markdown__list');
    });
    Array.prototype.forEach.call(body.querySelectorAll('a'), function (link) {
      link.classList.add('nui-markdown__link');
    });
    Array.prototype.forEach.call(body.querySelectorAll('code'), function (code) {
      if (!code.classList.contains('nui-markdown__raw')) {
        code.classList.add('nui-markdown__inline-code');
      }
    });
  }

  function liftMarkdownCode(body, nested) {
    var pres = Array.prototype.slice.call(body.querySelectorAll('pre'));
    pres.forEach(function (pre) {
      if (!pre.parentNode) return;
      if (pre.classList.contains('nui-markdown__raw')) return;
      var code = pre.firstElementChild;
      if (!code || code.tagName.toLowerCase() !== 'code') return;
      var language = '';
      var className = code.getAttribute('class') || '';
      var match = className.match(/(?:^|\s)language-([A-Za-z0-9_+-]+)/);
      if (match) language = match[1];
      var fragment = document.createDocumentFragment();
      var block = NoteUI.CodeBlock.mount(fragment, {
        code: code.textContent,
        language: language,
        lineNumbers: true,
        copy: true
      });
      block.el.classList.add('nui-markdown__code');
      nested.push(block);
      pre.parentNode.insertBefore(block.el, pre);
      pre.remove();
    });
  }

  function liftMarkdownTables(body, nested) {
    var tables = Array.prototype.slice.call(body.querySelectorAll('table'));
    tables.forEach(function (table) {
      if (!table.parentNode) return;
      var headerRow = table.querySelector('thead tr');
      if (!headerRow) return;
      var headerCells = Array.prototype.slice.call(headerRow.children).filter(function (cell) {
        return /^th|td$/i.test(cell.tagName);
      });
      if (!headerCells.length) return;
      var columns = headerCells.map(function (cell, index) {
        return {
          key: 'c' + index,
          label: moveCellChildren(cell),
          align: cell.getAttribute('align') || 'left'
        };
      });
      var rowElements = Array.prototype.slice.call(table.querySelectorAll('tbody tr'));
      if (!rowElements.length) {
        rowElements = Array.prototype.slice.call(table.querySelectorAll('tr')).filter(function (row) {
          return row !== headerRow;
        });
      }
      var rows = rowElements.map(function (row, rowIndex) {
        var cells = Array.prototype.slice.call(row.children);
        var values = { key: rowIndex };
        columns.forEach(function (column, index) {
          values[column.key] = moveCellChildren(cells[index]);
        });
        return values;
      });
      var fragment = document.createDocumentFragment();
      var tableInstance = NoteUI.Table.mount(fragment, {
        columns: columns,
        rows: rows,
        caption: '',
        sort: false,
        empty: '暂无数据'
      });
      tableInstance.el.classList.add('nui-markdown__table');
      nested.push(tableInstance);
      table.parentNode.insertBefore(tableInstance.el, table);
      table.remove();
    });
  }

  NoteUI.Markdown = {
    version: VERSION,
    mount: function (host, input) {
      var C = core();
      C.validateHost(host);
      var state = C.assign({ markdown: '' }, input || {});
      var root = create('div', 'nui-markdown');
      var nested = [];
      var parser = null;
      var initError = '';

      function destroyNested() {
        nested.forEach(function (instance) {
          try { instance.destroy(); } catch (ignore) { /* keep cleanup moving */ }
        });
        nested = [];
      }

      function showError(message) {
        clear(root);
        var box = create('div', 'nui-markdown__error');
        box.setAttribute('role', 'note');
        box.appendChild(create('strong', 'nui-markdown__error-title', 'Markdown 未能渲染'));
        box.appendChild(create('span', 'nui-markdown__error-reason', message));
        root.appendChild(box);
      }

      try {
        parser = makeMarkedParser();
      } catch (error) {
        initError = error && error.message ? error.message : String(error);
      }

      function render() {
        destroyNested();
        clear(root);
        if (!parser) {
          showError(initError || 'Markdown 解析器不可用。');
          return;
        }
        var source = text(state.markdown);
        var html;
        try {
          html = parser.parse(source);
        } catch (error) {
          showError(error && error.message ? error.message : 'Markdown 解析失败。');
          return;
        }
        var parsed;
        try {
          parsed = new global.DOMParser().parseFromString(html, 'text/html');
        } catch (error) {
          showError('Markdown 输出无法安全解析。');
          return;
        }
        sanitizeMarkdownChildren(parsed.body);
        decorateMarkdownBody(parsed.body);
        liftMarkdownCode(parsed.body, nested);
        liftMarkdownTables(parsed.body, nested);
        while (parsed.body.firstChild) root.appendChild(parsed.body.firstChild);
      }

      var instance = C.component(root, state, render, function () {
        destroyNested();
      });
      render();
      host.appendChild(root);
      return instance;
    }
  };

  /* ------------------------------------------------------------------ *
   * C11 DefinitionList
   * ------------------------------------------------------------------ */

  function definitionLayout(value) {
    return value === 'inline' ? 'inline' : 'stacked';
  }

  NoteUI.DefinitionList = {
    version: VERSION,
    mount: function (host, input) {
      var C = core();
      C.validateHost(host);
      var state = C.assign({
        items: [],
        layout: 'stacked',
        dividers: true,
        empty: '暂无条目'
      }, input || {});
      var root = create('div', 'nui-definition-list');
      var list = create('dl', 'nui-definition-list__dl');
      var empty = create('p', 'nui-definition-list__empty');
      root.append(list, empty);

      function render() {
        var layout = definitionLayout(state.layout);
        root.setAttribute('data-layout', layout);
        root.classList.toggle('nui-definition-list--dividers', state.dividers !== false);
        var items = Array.isArray(state.items) ? state.items : [];
        clear(list);
        hidden(list, items.length === 0);
        hidden(empty, items.length !== 0);
        empty.textContent = text(state.empty);
        items.forEach(function (raw) {
          var item = raw && typeof raw === 'object' && !isNode(raw) ? raw : { term: raw, description: '' };
          var row = create('div', 'nui-definition-list__item');
          var term = create('dt', 'nui-definition-list__term');
          var value = create('dd', 'nui-definition-list__value');
          setContent(term, own(item, 'term') ? item.term : item.label);
          setContent(value, own(item, 'description') ? item.description :
            (own(item, 'value') ? item.value : ''));
          row.append(term, value);
          list.appendChild(row);
        });
      }

      var instance = C.component(root, state, render, null);
      render();
      host.appendChild(root);
      return instance;
    }
  };

  /* ------------------------------------------------------------------ *
   * C12 Metric
   * ------------------------------------------------------------------ */

  function metricChange(value) {
    if (!value || typeof value !== 'object') return null;
    if (['up', 'down', 'flat'].indexOf(value.direction) === -1) return null;
    return {
      direction: value.direction,
      label: text(value.label).trim()
    };
  }

  NoteUI.Metric = {
    version: VERSION,
    mount: function (host, input) {
      var C = core();
      C.validateHost(host);
      var state = C.assign({
        label: '',
        value: '',
        unit: '',
        caption: '',
        change: null,
        announce: false
      }, input || {});
      var root = create('div', 'nui-metric');
      var label = create('div', 'nui-metric__label');
      var valueRow = create('div', 'nui-metric__value-row');
      var value = create('span', 'nui-metric__value');
      var unit = create('span', 'nui-metric__unit');
      var change = create('span', 'nui-metric__change');
      var changeIcon = create('span', 'nui-metric__change-icon');
      changeIcon.setAttribute('aria-hidden', 'true');
      var changeDirection = create('span', 'nui-metric__change-direction');
      var changeLabel = create('span', 'nui-metric__change-label');
      change.append(changeIcon, changeDirection, changeLabel);
      valueRow.append(value, unit);
      var caption = create('div', 'nui-metric__caption');
      root.append(label, valueRow, change, caption);

      function render() {
        var labelText = text(state.label).trim();
        var valueText = text(state.value);
        var unitText = text(state.unit).trim();
        var captionText = text(state.caption).trim();
        label.textContent = labelText;
        hidden(label, !labelText);
        value.textContent = valueText;
        unit.textContent = unitText;
        hidden(unit, !unitText);
        caption.textContent = captionText;
        hidden(caption, !captionText);

        var changeValue = metricChange(state.change);
        if (changeValue) {
          var directionText = changeValue.direction === 'up' ? '上升' :
            changeValue.direction === 'down' ? '下降' : '持平';
          var icon = changeValue.direction === 'up' ? '↑' :
            changeValue.direction === 'down' ? '↓' : '→';
          root.setAttribute('data-direction', changeValue.direction);
          changeIcon.textContent = icon;
          changeDirection.textContent = directionText;
          changeLabel.textContent = changeValue.label;
          hidden(changeLabel, !changeValue.label);
          hidden(change, false);
        } else {
          root.removeAttribute('data-direction');
          hidden(change, true);
          changeIcon.textContent = '';
          changeDirection.textContent = '';
          changeLabel.textContent = '';
        }

        if (state.announce) {
          root.setAttribute('aria-live', 'polite');
          root.setAttribute('aria-atomic', 'true');
        } else {
          root.removeAttribute('aria-live');
          root.removeAttribute('aria-atomic');
        }
      }

      var instance = C.component(root, state, render, null);
      render();
      host.appendChild(root);
      return instance;
    }
  };
})(window);
