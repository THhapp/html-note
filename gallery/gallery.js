/*!
 * gallery/gallery.js — 组件预览外壳控制器
 * 职责：读取唯一 registry，生成类别/ID 索引与详情，按契约挂载 gallery/demos/*.js，
 *       提供 hash 深链、筛选、复制与演示生命周期兜底清理。
 * 依赖：window.NOTE_LIBRARY_REGISTRY（构建生成）、window.NoteGalleryDemos（各模块提供）、
 *       可选 NoteCore.copy。普通脚本，无模块、无 fetch、无外部请求。
 */
(function (global) {
  'use strict';

  var doc = global.document;
  var STATUS_KINDS = ['planned', 'implemented', 'verified', 'blocked'];
  var REVIEW_KINDS = ['not-reviewed', 'positive-with-scope', 'rejected'];
  var STATUS_LABELS = {
    planned: '计划中',
    implemented: '已实现 · 待技术验收',
    verified: '技术已核验',
    blocked: '受阻',
    unknown: '状态未记录'
  };
  var REVIEW_LABELS = {
    'not-reviewed': '候选 · 未评价',
    'positive-with-scope': '有范围的正向评价',
    rejected: '已拒绝',
    unknown: '评价未记录'
  };
  var COUNT_LABELS = {
    total: '总项',
    reuse: '复用',
    newComponents: '新增',
    blocks: '组合块',
    foundations: '共享基础'
  };
  var ALL_CATEGORY = '__all__';
  var FLOATING_SELECTOR = [
    '.hnv-floating',
    '.hnv-floating__backdrop',
    '.nui-toast-region',
    '.nui-toast',
    '.nui-toast-viewport',
    '.nx-focus',
    '.nx-range',
    '.nx-link'
  ].join(',');

  var registry = global.NOTE_LIBRARY_REGISTRY || null;
  var entries = readEntries(registry);
  var byId = Object.create(null);
  entries.forEach(function (entry) {
    if (entry && entry.id && !byId[entry.id]) byId[entry.id] = entry;
  });

  var state = {
    registry: registry,
    entries: entries,
    byId: byId,
    initialized: false,
    currentId: null,
    pendingId: null,
    query: '',
    category: ALL_CATEGORY,
    demoCleanup: null,
    demoToken: 0,
    bodySnapshot: null,
    bodyStyle: null,
    readyPromise: null,
    readyOpen: false,
    readyResolve: null
  };

  var els = {};
  newReadyDeferred();

  /* ------------------------------------------------------------------ *
   * 基础工具
   * ------------------------------------------------------------------ */

  function str(value) {
    if (value === null || value === undefined) return '';
    return String(value);
  }

  function textValue(value) {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) {
      return value.map(textValue).filter(Boolean).join(' / ');
    }
    if (typeof value === 'object') {
      try { return JSON.stringify(value); } catch (error) { return String(value); }
    }
    return String(value).trim();
  }

  function asList(value) {
    var out = [];
    function push(item) {
      if (item === null || item === undefined) return;
      if (Array.isArray(item)) {
        item.forEach(push);
        return;
      }
      if (typeof item === 'object') {
        var parts = [];
        Object.keys(item).forEach(function (key) {
          var value2 = item[key];
          if (value2 === null || value2 === undefined || value2 === '') return;
          if (Array.isArray(value2)) value2 = value2.map(textValue).filter(Boolean).join(', ');
          else if (typeof value2 === 'object') value2 = textValue(value2);
          parts.push(key + ': ' + value2);
        });
        if (parts.length) out.push(parts.join(' · '));
        return;
      }
      var text = String(item).trim();
      if (text) out.push(text);
    }
    push(value);
    return out;
  }

  function pathEntries(value) {
    var out = [];
    function push(item, label) {
      if (item === null || item === undefined) return;
      if (Array.isArray(item)) {
        item.forEach(function (child) { push(child, label); });
        return;
      }
      if (typeof item === 'object') {
        Object.keys(item).forEach(function (key) {
          push(item[key], label ? label + '.' + key : key);
        });
        return;
      }
      var path = String(item).trim();
      if (path) out.push({ label: label || '', path: path });
    }
    push(value, '');
    return out;
  }

  function normalizeId(value) {
    var id = str(value).trim();
    if (id.charAt(0) === '#') id = id.slice(1);
    return id.toUpperCase();
  }

  function readEntries(source) {
    if (!source || !Array.isArray(source.entries)) return [];
    var result = [];
    source.entries.forEach(function (raw) {
      if (!raw || typeof raw !== 'object') return;
      var id = normalizeId(raw.id);
      if (!id) return;
      result.push(normalizeEntry(raw, id));
    });
    return result;
  }

  function normalizeEntry(raw, id) {
    return {
      raw: raw,
      id: id,
      name: str(raw.name),
      cn: str(raw.cn) || str(raw.name) || id,
      category: str(raw.category) || '未分类',
      purpose: str(raw.purpose),
      inputs: asList(raw.inputs),
      customizable: asList(raw.customizable),
      states: asList(raw.states),
      usage: str(raw.usage),
      dependencies: asList(raw.dependencies),
      source: raw.source,
      dist: raw.dist,
      preview: raw.preview,
      example: raw.example,
      limitations: asList(raw.limitations),
      status: str(raw.status).toLowerCase() || 'planned',
      verification: raw.verification,
      userReview: str(raw.userReview).toLowerCase() || 'not-reviewed',
      reviewScope: str(raw.reviewScope),
      consensus: asList(raw.consensus),
      docs: raw.docs,
      notes: str(raw.notes)
    };
  }

  function h(tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function append(parent) {
    for (var i = 1; i < arguments.length; i += 1) {
      var item = arguments[i];
      if (item === null || item === undefined) continue;
      parent.appendChild(item);
    }
    return parent;
  }

  function clearNode(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function listNode(items, className) {
    var list = h('ul', className || 'gallery-plain-list');
    if (!items || !items.length) return list;
    items.forEach(function (item) {
      list.appendChild(h('li', '', item));
    });
    return list;
  }

  function chipList(items) {
    var list = h('ul', 'gallery-chip-list');
    (items || []).forEach(function (item) {
      list.appendChild(h('li', 'gallery-chip', item));
    });
    return list;
  }

  function statusKind(value) {
    return STATUS_KINDS.indexOf(value) >= 0 ? value : 'unknown';
  }

  function reviewKind(value) {
    return REVIEW_KINDS.indexOf(value) >= 0 ? value : 'unknown';
  }

  function statusLabel(value) {
    return STATUS_LABELS[statusKind(value)];
  }

  function reviewLabel(value) {
    return REVIEW_LABELS[reviewKind(value)];
  }

  function buildLabel(build) {
    if (!build) return '';
    if (typeof build === 'string') return build;
    if (typeof build === 'object') {
      var keys = ['version', 'mode', 'id', 'hash', 'commit'];
      var parts = [];
      keys.forEach(function (key) {
        if (build[key] !== undefined && build[key] !== null && build[key] !== '') {
          parts.push(String(build[key]));
        }
      });
      var stamp = build.time || build.generatedAt;
      if (stamp) {
        var formatted = formatGeneratedAt(stamp);
        if (formatted) parts.push(formatted);
      }
      if (parts.length) return parts.join(' · ');
      try { return JSON.stringify(build); } catch (error) { return String(build); }
    }
    return String(build);
  }

  function formatGeneratedAt(value) {
    if (!value) return '';
    var date = new Date(value);
    if (!isNaN(date.getTime())) {
      try {
        return date.toLocaleString('zh-CN', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit'
        });
      } catch (error) { /* fall through */ }
    }
    return String(value);
  }

  function safeMessage(error) {
    if (!error) return '未知错误';
    if (error.message) return String(error.message);
    return String(error);
  }

  function localHref(path) {
    var value = str(path).trim();
    if (!value) return null;
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) return null;
    if (value.charAt(0) === '#' || value.charAt(0) === '?') return null;
    var clean = value.replace(/^\.\//, '');
    if (clean.charAt(0) === '/') return null;
    // registry 的维护源和分发路径都以当前库根为基准。
    // gallery/ 位于库根下一层，因此统一前缀 ../，不能把已带 ../ 的路径直接当页面相对路径。
    return '../' + clean;
  }

  function pathLink(path, extraClass) {
    var label = str(path);
    var href = localHref(label);
    if (!href) return h('code', 'gallery-path ' + (extraClass || ''), label);
    var link = h('a', 'gallery-path is-link ' + (extraClass || ''), label);
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener';
    return link;
  }

  function fillPaths(dl, label, value, emptyText) {
    var paths = pathEntries(value);
    var row = h('div', 'gallery-path-row');
    row.appendChild(h('dt', '', label));
    var dd = h('dd');
    if (!paths.length) {
      dd.appendChild(h('span', 'gallery-muted', emptyText));
    } else {
      var list = h('ul');
      paths.forEach(function (item) {
        var li = h('li');
        if (item.label) li.appendChild(h('span', 'gallery-muted', item.label + ': '));
        li.appendChild(pathLink(item.path));
        list.appendChild(li);
      });
      dd.appendChild(list);
    }
    row.appendChild(dd);
    dl.appendChild(row);
  }

  function recordLines(value) {
    var out = [];
    function push(item) {
      if (item === null || item === undefined) return;
      if (Array.isArray(item)) {
        item.forEach(push);
        return;
      }
      if (typeof item === 'object') {
        var parts = [];
        Object.keys(item).forEach(function (key) {
          var child = item[key];
          if (child === null || child === undefined || child === '') return;
          if (Array.isArray(child)) child = child.map(textValue).filter(Boolean).join(', ');
          else if (typeof child === 'object') child = textValue(child);
          parts.push(key + '：' + child);
        });
        if (parts.length) out.push(parts.join(' · '));
        return;
      }
      var text = String(item).trim();
      if (text) out.push(text);
    }
    push(value);
    return out;
  }

  function readHashId() {
    var raw = str(global.location.hash || '').replace(/^#/, '');
    if (!raw) return '';
    try { raw = decodeURIComponent(raw); } catch (error) { /* keep raw */ }
    return normalizeId(raw);
  }

  function setHash(id, mode) {
    if (!id) return;
    var hash = '#' + id;
    if (global.location.hash === hash) return;
    try {
      if (mode === 'replace' && global.history && typeof global.history.replaceState === 'function') {
        global.history.replaceState(null, '', hash);
      } else {
        global.location.hash = id;
      }
    } catch (error) {
      try {
        if (mode !== 'replace') global.location.hash = id;
      } catch (error2) { /* file:// restrictions: keep current selection */ }
    }
  }

  function setDocumentState(name) {
    doc.documentElement.setAttribute('data-gallery-state', name);
  }

  function newReadyDeferred() {
    if (state.readyOpen && state.readyResolve) {
      state.readyOpen = false;
      var oldResolve = state.readyResolve;
      state.readyResolve = null;
      oldResolve(state.currentId);
    }
    state.readyPromise = new Promise(function (resolve) {
      state.readyResolve = resolve;
    });
    state.readyOpen = true;
  }

  function resolveReady(value) {
    if (!state.readyOpen || !state.readyResolve) return;
    state.readyOpen = false;
    var resolve = state.readyResolve;
    state.readyResolve = null;
    resolve(value);
  }

  function nextFrame(callback) {
    if (typeof global.requestAnimationFrame === 'function') {
      global.requestAnimationFrame(callback);
    } else {
      global.setTimeout(callback, 16);
    }
  }

  function resolveReadySoon(id, token) {
    nextFrame(function () {
      if (token !== state.demoToken) return;
      nextFrame(function () {
        if (token !== state.demoToken) return;
        resolveReady(id);
      });
    });
  }

  function snapshotBody() {
    var snapshot = new Set();
    if (!doc.body) return snapshot;
    Array.prototype.forEach.call(doc.body.children, function (node) {
      snapshot.add(node);
    });
    return snapshot;
  }

  function cleanupBodyOverlays(snapshot, styleSnapshot) {
    if (doc.body && snapshot) {
      Array.prototype.slice.call(doc.body.children).forEach(function (node) {
        if (snapshot.has(node) || !node || !node.matches) return;
        try {
          if (node.matches(FLOATING_SELECTOR)) node.remove();
        } catch (error) { /* ignore selector edge cases */ }
      });
    }
    if (doc.body && styleSnapshot) {
      try {
        if (doc.body.style.overflow !== styleSnapshot.overflow) {
          doc.body.style.overflow = styleSnapshot.overflow;
        }
        if (doc.body.style.paddingRight !== styleSnapshot.paddingRight) {
          doc.body.style.paddingRight = styleSnapshot.paddingRight;
        }
      } catch (error) { /* no-op */ }
    }
  }

  function normalizeCleanup(result) {
    if (!result) return null;
    if (typeof result === 'function') return result;
    if (typeof result.destroy === 'function') {
      return function () { result.destroy(); };
    }
    if (typeof result.cleanup === 'function') {
      return function () { result.cleanup(); };
    }
    return null;
  }

  function teardownDemo() {
    state.demoToken += 1;
    var cleanup = state.demoCleanup;
    state.demoCleanup = null;
    if (cleanup) {
      try {
        cleanup();
      } catch (error) {
        global.console.error('NoteGallery: demo cleanup failed', error);
      }
    }
    cleanupBodyOverlays(state.bodySnapshot, state.bodyStyle);
    state.bodySnapshot = null;
    state.bodyStyle = null;
    var host = doc.getElementById('gallery-demo');
    if (host) clearNode(host);
    var errorBox = doc.getElementById('gallery-demo-error');
    if (errorBox) {
      errorBox.hidden = true;
      clearNode(errorBox);
    }
  }

  /* ------------------------------------------------------------------ *
   * 索引与筛选
   * ------------------------------------------------------------------ */

  function cacheElements() {
    els.search = doc.getElementById('gallery-search');
    els.searchClear = doc.getElementById('gallery-search-clear');
    els.categories = doc.getElementById('gallery-categories');
    els.count = doc.getElementById('gallery-count');
    els.list = doc.getElementById('gallery-list');
    els.empty = doc.getElementById('gallery-empty');
    els.emptyText = doc.getElementById('gallery-empty-text');
    els.emptyReset = doc.getElementById('gallery-empty-reset');
    els.detail = doc.getElementById('gallery-detail');
    els.build = doc.getElementById('gallery-build');
    els.banner = doc.getElementById('gallery-banner');
  }

  function showBanner(title, lines) {
    if (!els.banner) return;
    clearNode(els.banner);
    els.banner.appendChild(h('strong', '', title));
    (lines || []).forEach(function (line) {
      var p = h('p', 'gallery-small');
      p.style.margin = '4px 0 0';
      p.appendChild(h('span', '', line));
      els.banner.appendChild(p);
    });
    els.banner.hidden = false;
  }

  function renderBuildInfo() {
    if (!els.build) return;
    clearNode(els.build);
    if (!state.registry) {
      els.build.appendChild(h('strong', '', '尚未构建'));
      els.build.appendChild(h('span', '', ' · 未读到 window.NOTE_LIBRARY_REGISTRY'));
      return;
    }
    var counts = state.registry.counts || {};
    var countTexts = [];
    ['total', 'reuse', 'newComponents', 'blocks', 'foundations'].forEach(function (key) {
      if (counts[key] !== undefined && counts[key] !== null) {
        countTexts.push(COUNT_LABELS[key] + ' ' + counts[key]);
      }
    });
    if (counts.expected !== undefined && counts.expected !== null &&
        counts.expected !== counts.total) {
      countTexts.push('预期 ' + counts.expected);
    }
    if (counts.missing !== undefined && counts.missing !== null && Number(counts.missing) > 0) {
      countTexts.push('缺失 ' + counts.missing);
    }
    var first = h('p');
    first.style.margin = '0';
    var complete = counts.expected === undefined || counts.expected === null ||
      Number(counts.expected) === state.entries.length;
    first.appendChild(h('strong', '', complete ? '构建清单已加载' : '构建清单尚未完整'));
    if (countTexts.length) first.appendChild(h('span', '', ' · ' + countTexts.join(' / ')));
    else first.appendChild(h('span', '', ' · 条目 ' + state.entries.length));
    els.build.appendChild(first);

    var second = h('p');
    second.style.margin = '3px 0 0';
    var build = buildLabel(state.registry.build);
    var generated = formatGeneratedAt(state.registry.generatedAt);
    var meta = [];
    if (build) meta.push('build ' + build);
    if (generated) meta.push('生成 ' + generated);
    if (!meta.length) meta.push('构建信息未标注');
    second.appendChild(h('span', '', meta.join(' · ')));
    els.build.appendChild(second);
  }

  function renderCategories() {
    if (!els.categories) return;
    clearNode(els.categories);
    if (!state.entries.length) {
      els.categories.hidden = true;
      return;
    }
    els.categories.hidden = false;
    var counts = Object.create(null);
    var order = [];
    state.entries.forEach(function (entry) {
      if (!counts[entry.category]) {
        counts[entry.category] = 0;
        order.push(entry.category);
      }
      counts[entry.category] += 1;
    });
    var all = makeCategoryButton(ALL_CATEGORY, '全部', state.entries.length);
    els.categories.appendChild(all);
    order.forEach(function (category) {
      els.categories.appendChild(makeCategoryButton(category, category, counts[category]));
    });
    applyCategoryPressed();
  }

  function makeCategoryButton(value, label, count) {
    var button = h('button', 'gallery-category');
    button.type = 'button';
    button.setAttribute('data-category', value);
    button.appendChild(h('span', '', label));
    button.appendChild(h('span', 'gallery-category__count', String(count)));
    return button;
  }

  function applyCategoryPressed() {
    if (!els.categories) return;
    Array.prototype.forEach.call(els.categories.querySelectorAll('[data-category]'), function (button) {
      var active = button.getAttribute('data-category') === state.category;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function matchesQuery(entry, query) {
    if (!query) return true;
    var haystack = [entry.id, entry.name, entry.cn, entry.category].join(' ').toLowerCase();
    var tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    for (var i = 0; i < tokens.length; i += 1) {
      if (haystack.indexOf(tokens[i]) < 0) return false;
    }
    return true;
  }

  function filteredEntries() {
    return state.entries.filter(function (entry) {
      if (state.category !== ALL_CATEGORY && entry.category !== state.category) return false;
      return matchesQuery(entry, state.query);
    });
  }

  function updateList() {
    if (!els.list) return;
    var filtered = filteredEntries();
    var fragment = doc.createDocumentFragment();
    filtered.forEach(function (entry) {
      var item = h('li');
      var link = h('a', 'gallery-item');
      link.href = '#' + entry.id;
      link.setAttribute('data-id', entry.id);
      if (entry.id === state.currentId) {
        link.setAttribute('aria-current', 'true');
        link.classList.add('is-active');
      }
      link.appendChild(h('span', 'gallery-item__id', entry.id));
      link.appendChild(h('span', 'gallery-item__cn', entry.cn));
      link.appendChild(h('span', 'gallery-item__name', entry.name || '公开名未记录'));
      link.appendChild(h('span', 'gallery-item__cat', entry.category));
      item.appendChild(link);
      fragment.appendChild(item);
    });
    clearNode(els.list);
    els.list.appendChild(fragment);

    if (els.count) {
      if (!state.registry) {
        els.count.textContent = '0 项 · 尚未构建';
      } else if (filtered.length === state.entries.length) {
        els.count.textContent = '共 ' + state.entries.length + ' 项';
      } else {
        els.count.textContent = '显示 ' + filtered.length + ' / ' + state.entries.length + ' 项';
      }
    }

    if (els.searchClear) {
      els.searchClear.hidden = !state.query;
    }

    if (els.empty) {
      var nothing = filtered.length === 0;
      els.empty.hidden = !nothing;
      if (nothing && els.emptyText) {
        var bits = [];
        if (state.query) bits.push('检索“' + state.query + '”');
        if (state.category !== ALL_CATEGORY) bits.push('类别“' + state.category + '”');
        els.emptyText.textContent = bits.length
          ? bits.join('，') + ' 没有匹配结果。可清除筛选或改用 ID 检索。'
          : '清单为空。';
        if (els.emptyReset) els.emptyReset.hidden = !state.entries.length;
      }
    }

    if (!state.entries.length && state.registry && els.empty) {
      els.empty.hidden = false;
      if (els.emptyText) els.emptyText.textContent = 'registry 已加载，但没有条目。';
      if (els.emptyReset) els.emptyReset.hidden = true;
    }
  }

  function setActiveItem() {
    if (!els.list) return;
    Array.prototype.forEach.call(els.list.querySelectorAll('a.gallery-item'), function (link) {
      var active = link.getAttribute('data-id') === state.currentId;
      if (active) {
        link.setAttribute('aria-current', 'true');
        link.classList.add('is-active');
      } else {
        link.removeAttribute('aria-current');
        link.classList.remove('is-active');
      }
    });
  }

  function updateFilterControls() {
    if (els.search && els.search.value !== state.query) els.search.value = state.query;
    applyCategoryPressed();
    updateList();
  }

  function clearFilters(focusSearch) {
    state.query = '';
    state.category = ALL_CATEGORY;
    if (els.search) els.search.value = '';
    updateFilterControls();
    if (focusSearch && els.search) {
      try { els.search.focus(); } catch (error) { /* no-op */ }
    }
  }

  function isEditableTarget(target) {
    if (!target || target.nodeType !== 1) return false;
    var tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  function bindShellEvents() {
    if (els.search) {
      els.search.addEventListener('input', function () {
        state.query = els.search.value.trim();
        updateList();
        if (els.searchClear) els.searchClear.hidden = !state.query;
      });
    }

    if (els.searchClear) {
      els.searchClear.addEventListener('click', function () {
        state.query = '';
        if (els.search) els.search.value = '';
        updateList();
        if (els.search) els.search.focus();
      });
    }

    if (els.categories) {
      els.categories.addEventListener('click', function (event) {
        var button = event.target && event.target.closest
          ? event.target.closest('[data-category]')
          : null;
        if (!button) return;
        state.category = button.getAttribute('data-category') || ALL_CATEGORY;
        applyCategoryPressed();
        updateList();
      });
    }

    if (els.list) {
      els.list.addEventListener('click', function (event) {
        var link = event.target && event.target.closest
          ? event.target.closest('a.gallery-item')
          : null;
        if (!link) return;
        event.preventDefault();
        select(link.getAttribute('data-id'));
      });
    }

    if (els.emptyReset) {
      els.emptyReset.addEventListener('click', function () {
        clearFilters(true);
      });
    }

    doc.addEventListener('keydown', function (event) {
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !isEditableTarget(event.target)) {
        if (els.search && !els.search.disabled) {
          event.preventDefault();
          els.search.focus();
        }
        return;
      }
      if (event.key === 'Escape' && event.target === els.search) {
        if (els.search.value) {
          state.query = '';
          els.search.value = '';
          updateList();
        } else {
          els.search.blur();
        }
      }
    });

    global.addEventListener('hashchange', onHashChange);
  }

  function onHashChange() {
    if (!state.initialized || !state.registry) return;
    var id = readHashId();
    if (!id) {
      if (state.entries.length) activate(state.entries[0], { history: 'none' });
      return;
    }
    if (id === state.currentId) return;
    var entry = state.byId[id];
    if (!entry) {
      showNotFound(id);
      return;
    }
    activate(entry, { history: 'none' });
  }

  /* ------------------------------------------------------------------ *
   * 详情
   * ------------------------------------------------------------------ */

  function section(title, hint) {
    var wrap = h('section', 'gallery-section');
    var head = h('div', 'gallery-section-head');
    head.appendChild(h('h3', '', title));
    if (hint) head.appendChild(h('span', 'gallery-section-hint', hint));
    wrap.appendChild(head);
    return { el: wrap, head: head };
  }

  function statusPair(label, text, className) {
    var pair = h('span', 'gallery-status-pair');
    pair.appendChild(h('span', 'gallery-status-pair__label', label));
    pair.appendChild(h('span', className, text));
    return pair;
  }

  function buildHeader(entry) {
    var head = h('header', 'gallery-entry-head');
    var title = h('div', 'gallery-entry-title');
    var idline = h('div', 'gallery-entry-idline');
    idline.appendChild(h('span', 'gallery-entry-id', entry.id));
    idline.appendChild(h('span', 'gallery-entry-category', entry.category));
    title.appendChild(idline);
    title.appendChild(h('h2', '', entry.cn || entry.name || entry.id));
    title.appendChild(h('code', 'gallery-entry-public', entry.name || '公开名未记录'));

    var statuses = h('div', 'gallery-statuses');
    var kind = statusKind(entry.status);
    var review = reviewKind(entry.userReview);
    statuses.appendChild(statusPair('技术状态', statusLabel(entry.status), 'gallery-status gallery-status--' + kind));
    statuses.appendChild(statusPair('用户评价', reviewLabel(entry.userReview), 'gallery-status gallery-review--' + review));
    statuses.appendChild(h('p', 'gallery-status-note', '技术状态与用户评价分开记录；verified 不等于用户认可。新增组件保持“候选 · 未评价”。'));
    title.appendChild(statuses);
    head.appendChild(title);

    var actions = h('div', 'gallery-entry-actions');
    var reload = h('button', 'gallery-action', '重载演示');
    reload.type = 'button';
    reload.setAttribute('aria-label', '重新挂载当前条目的演示');
    reload.addEventListener('click', function () {
      remountDemo();
    });
    actions.appendChild(reload);

    var run = h('a', 'gallery-action gallery-action--primary', '运行独立示例');
    run.href = '../examples/run.html?id=' + encodeURIComponent(entry.id);
    run.target = '_blank';
    run.rel = 'noopener';
    run.setAttribute('aria-label', '在新标签运行 ' + entry.id + ' 的独立示例');
    actions.appendChild(run);
    head.appendChild(actions);
    return head;
  }

  function buildPurpose(entry) {
    var wrap = section('用途');
    var body = h('p', 'gallery-purpose' + (entry.purpose ? '' : ' is-empty'),
      entry.purpose || '尚未记录用途。以本条目文档与公开 API 为准。');
    wrap.el.appendChild(body);
    return wrap.el;
  }

  function buildDemo(entry) {
    var wrap = section('实际效果', '默认静止；演示内控件用于换内容与状态，不自动串播。');
    var reload = h('button', 'gallery-button', '重新挂载');
    reload.type = 'button';
    reload.addEventListener('click', function () { remountDemo(); });
    wrap.head.appendChild(reload);
    var frame = h('div', 'gallery-demo-frame');
    var host = h('div', 'gallery-demo');
    host.id = 'gallery-demo';
    host.setAttribute('data-gallery-demo', '');
    host.setAttribute('role', 'region');
    host.setAttribute('aria-label', '组件演示：' + (entry.cn || entry.id) + '（' + entry.id + '）');
    frame.appendChild(host);
    var error = h('div', 'gallery-demo-error');
    error.id = 'gallery-demo-error';
    error.hidden = true;
    error.setAttribute('role', 'alert');
    frame.appendChild(error);
    wrap.el.appendChild(frame);
    return wrap.el;
  }

  function buildFacts(entry) {
    var wrap = section('可替换内容与代表状态', '演示内应能切换；未列出的项目不等于不支持，以文档为准。');
    var facts = h('div', 'gallery-facts');

    var statesFact = h('div', 'gallery-fact');
    statesFact.appendChild(h('h4', '', '试这些状态'));
    if (entry.states.length) {
      statesFact.appendChild(listNode(entry.states));
    } else {
      statesFact.appendChild(h('p', 'gallery-muted gallery-small', '尚未记录代表状态。'));
    }
    facts.appendChild(statesFact);

    var customFact = h('div', 'gallery-fact');
    customFact.appendChild(h('h4', '', '可替换内容'));
    if (entry.customizable.length) {
      customFact.appendChild(listNode(entry.customizable));
    } else {
      customFact.appendChild(h('p', 'gallery-muted gallery-small', '尚未记录可替换项；请查看接口参数与条目文档。'));
    }
    if (entry.inputs.length) {
      var io = h('p', 'gallery-io');
      io.appendChild(h('span', '', '接口参数：'));
      io.appendChild(h('code', '', entry.inputs.join(' · ')));
      customFact.appendChild(io);
    }
    facts.appendChild(customFact);

    wrap.el.appendChild(facts);
    return wrap.el;
  }

  function copyText(text, manual, status, button) {
    function manualFallback(reason) {
      if (manual) {
        manual.value = text;
        manual.hidden = false;
        try {
          manual.focus();
          manual.select();
        } catch (error) { /* no-op */ }
      }
      if (status) {
        status.textContent = reason + '。已展开可手动选择的文本，可直接复制。';
      }
      if (button) button.textContent = '复制用法';
    }

    if (!text) {
      if (status) status.textContent = '没有可复制的用法文本。';
      return;
    }

    var copyApi = global.NoteCore && typeof global.NoteCore.copy === 'function'
      ? global.NoteCore.copy
      : null;
    if (!copyApi) {
      manualFallback('当前构建未提供 NoteCore.copy');
      return;
    }

    if (button) button.disabled = true;
    Promise.resolve(copyApi(text)).then(function (result) {
      if (button) button.disabled = false;
      if (result && result.ok) {
        if (manual) manual.hidden = true;
        if (status) {
          status.textContent = result.method === 'exec'
            ? '已复制最小用法（兼容方式）。'
            : '已复制最小用法。';
        }
        if (button) button.textContent = '已复制';
        global.setTimeout(function () {
          if (button) button.textContent = '复制用法';
        }, 1400);
      } else {
        manualFallback('浏览器未允许自动复制');
      }
    }).catch(function (error) {
      if (button) button.disabled = false;
      manualFallback('复制失败（' + safeMessage(error) + '）');
    });
  }

  function buildUsage(entry) {
    var wrap = section('最小用法', '可复制的公开 API 调用；参数细节见条目文档。');
    var box = h('div', 'gallery-usage');
    var bar = h('div', 'gallery-usage-bar');
    bar.appendChild(h('span', '', entry.usage ? 'JavaScript · 最小调用' : 'JavaScript'));
    var copy = h('button', 'gallery-copy', '复制用法');
    copy.type = 'button';
    copy.disabled = !entry.usage;
    bar.appendChild(copy);
    box.appendChild(bar);

    var pre = h('pre');
    var code = h('code', '', entry.usage || '// 尚未记录最小用法');
    pre.appendChild(code);
    box.appendChild(pre);

    var status = h('p', 'gallery-copy-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    var manual = h('textarea', 'gallery-manual-copy');
    manual.readOnly = true;
    manual.hidden = true;
    manual.setAttribute('aria-label', entry.id + ' 的可手动复制用法代码');

    copy.addEventListener('click', function () {
      copyText(entry.usage, manual, status, copy);
    });

    append(wrap.el, box, status, manual);
    return wrap.el;
  }

  function buildLimitations(entry) {
    var wrap = section('支持范围与限制', '默认可见；请与演示和文档一起核对。');
    if (entry.limitations.length) {
      wrap.el.appendChild(listNode(entry.limitations));
    } else {
      wrap.el.appendChild(h('p', 'gallery-muted gallery-small', '尚未记录已知限制；这不等于没有限制。'));
    }
    if (entry.dependencies.length) {
      var deps = h('p', 'gallery-io');
      deps.appendChild(h('span', '', '依赖：'));
      deps.appendChild(h('code', '', entry.dependencies.join(' · ')));
      wrap.el.appendChild(deps);
    }
    return wrap.el;
  }

  function buildSource(entry) {
    var wrap = section('源文件与取用', '路径相对库根目录，在新标签打开；复制与独立示例入口在上方。');
    var dl = h('dl', 'gallery-paths');
    fillPaths(dl, '维护源码', entry.source, '尚未记录维护源码路径。');
    fillPaths(dl, '分发文件', entry.dist, '尚未记录分发文件路径；完整包见 dist/note-library.js。');
    fillPaths(dl, '模块文档', entry.docs, '尚未记录模块文档。');
    fillPaths(dl, '清单示例入口', entry.example, '使用独立宿主：examples/run.html?id=' + entry.id);

    var runRow = h('div', 'gallery-path-row');
    runRow.appendChild(h('dt', '', '独立示例'));
    var runDd = h('dd');
    var runLink = h('a', 'gallery-path is-link', '../examples/run.html?id=' + entry.id);
    runLink.href = '../examples/run.html?id=' + encodeURIComponent(entry.id);
    runLink.target = '_blank';
    runLink.rel = 'noopener';
    runDd.appendChild(runLink);
    runDd.appendChild(h('span', 'gallery-muted gallery-small', '（不加载 gallery 外壳）'));
    runRow.appendChild(runDd);
    dl.appendChild(runRow);

    if (pathEntries(entry.preview).length) {
      fillPaths(dl, '预览记录', entry.preview, '');
    }
    wrap.el.appendChild(dl);
    return wrap.el;
  }

  function buildReview(entry) {
    var wrap = section('用户评价范围与技术核验', '评价与技术状态分开；局部满意不等于参数冻结。');
    var review = reviewKind(entry.userReview);
    var scope = entry.reviewScope;
    if (!scope) {
      if (review === 'not-reviewed') scope = '本轮新增候选，未获用户评价。';
      else if (review === 'positive-with-scope') scope = '有范围的正向评价；未覆盖的参数不视为冻结。';
      else if (review === 'rejected') scope = '评价为拒绝；保留为候选或修复参考。';
      else scope = '未记录评价范围。';
    }
    var reviewLine = h('p', 'gallery-entry-review');
    reviewLine.appendChild(h('strong', '', '用户评价：'));
    reviewLine.appendChild(h('span', '', reviewLabel(entry.userReview) + '。'));
    reviewLine.appendChild(h('span', '', scope));
    wrap.el.appendChild(reviewLine);

    var verification = recordLines(entry.verification);
    if (verification.length) {
      wrap.el.appendChild(h('h4', 'gallery-fact', '技术核验记录'));
      var ul = h('ul', 'gallery-verification');
      verification.forEach(function (line) {
        ul.appendChild(h('li', '', line));
      });
      wrap.el.appendChild(ul);
    }

    if (entry.consensus.length) {
      var details = h('details', 'gallery-consensus');
      var summary = h('summary');
      summary.appendChild(h('span', '', '共识引用'));
      summary.appendChild(h('span', 'gallery-consensus__ids', entry.consensus.join(' · ')));
      details.appendChild(summary);
      var body = h('p', 'gallery-consensus__body',
        '共识编号继承自清单分类；关键限制已写在上方“支持范围与限制”中，不藏在此处。详细依据见 docs/00-接口与文件契约.md §7。');
      details.appendChild(body);
      wrap.el.appendChild(details);
    } else {
      wrap.el.appendChild(h('p', 'gallery-muted gallery-small', '尚未记录共识编号。'));
    }

    if (entry.notes) {
      wrap.el.appendChild(h('h4', 'gallery-fact', '备注'));
      wrap.el.appendChild(h('p', 'gallery-entry-review', entry.notes));
    }
    return wrap.el;
  }

  function buildPager(entry) {
    var index = state.entries.indexOf(entry);
    var pager = h('nav', 'gallery-pager');
    pager.setAttribute('aria-label', '相邻组件');

    var prevEntry = index > 0 ? state.entries[index - 1] : null;
    var nextEntry = index >= 0 && index < state.entries.length - 1 ? state.entries[index + 1] : null;

    var prev = h('button', 'gallery-pager__button');
    prev.type = 'button';
    prev.disabled = !prevEntry;
    prev.setAttribute('aria-label', prevEntry ? '上一项：' + prevEntry.id + ' ' + prevEntry.cn : '已经是第一项');
    prev.appendChild(h('span', '', '← 上一项'));
    prev.appendChild(h('strong', '', prevEntry ? prevEntry.id + ' · ' + prevEntry.cn : '已是第一项'));
    if (prevEntry) {
      prev.addEventListener('click', function () { activate(prevEntry, { history: 'push' }); });
    }
    pager.appendChild(prev);

    var next = h('button', 'gallery-pager__button gallery-pager__button--next');
    next.type = 'button';
    next.disabled = !nextEntry;
    next.setAttribute('aria-label', nextEntry ? '下一项：' + nextEntry.id + ' ' + nextEntry.cn : '已经是最后一项');
    next.appendChild(h('span', '', '下一项 →'));
    next.appendChild(h('strong', '', nextEntry ? nextEntry.id + ' · ' + nextEntry.cn : '已是最后一项'));
    if (nextEntry) {
      next.addEventListener('click', function () { activate(nextEntry, { history: 'push' }); });
    }
    pager.appendChild(next);

    return pager;
  }

  function renderEntry(entry) {
    var article = h('article', 'gallery-entry');
    article.setAttribute('data-entry-id', entry.id);
    append(
      article,
      buildHeader(entry),
      buildPurpose(entry),
      buildDemo(entry),
      buildFacts(entry),
      buildUsage(entry),
      buildLimitations(entry),
      buildSource(entry),
      buildReview(entry),
      buildPager(entry)
    );
    return article;
  }

  function renderErrorState(title, lines, linkText, linkAction) {
    clearNode(els.detail);
    var box = h('div', 'gallery-state');
    box.appendChild(h('h2', '', title));
    (lines || []).forEach(function (line) {
      var p = h('p');
      if (line && typeof line === 'object' && line.code) {
        p.appendChild(doc.createTextNode(line.text || ''));
        p.appendChild(h('code', '', line.code));
        if (line.after) p.appendChild(doc.createTextNode(line.after));
      } else {
        p.textContent = str(line);
      }
      box.appendChild(p);
    });
    if (linkText && typeof linkAction === 'function') {
      var button = h('button', 'gallery-button', linkText);
      button.type = 'button';
      button.addEventListener('click', linkAction);
      box.appendChild(button);
    }
    els.detail.appendChild(box);
  }

  function showNotFound(id) {
    teardownDemo();
    newReadyDeferred();
    state.currentId = null;
    setActiveItem();
    setDocumentState('not-found');
    resolveReady(null);
    renderErrorState('未找到组件 ID “' + (id || '') + '”', [
      'registry 没有这个条目。预览不会伪造组件，也不会加载名称相近的其他演示。',
      '请检查 hash（例如 #L01）或从左侧列表选择；也可打开 examples/run.html?id=ID。'
    ], '回到第一个组件', function () {
      if (state.entries.length) {
        activate(state.entries[0], { history: 'replace' });
      }
    });
    if (els.count) {
      var filtered = filteredEntries().length;
      els.count.textContent = filtered === state.entries.length
        ? '共 ' + state.entries.length + ' 项'
        : '显示 ' + filtered + ' / ' + state.entries.length + ' 项';
    }
  }

  function renderNoRegistry() {
    if (!els.detail) return;
    clearNode(els.detail);
    state.currentId = null;
    setDocumentState('no-registry');
    renderErrorState('尚未构建：没有组件清单', [
      '没有读到 window.NOTE_LIBRARY_REGISTRY，因此这里不会列出或展示任何虚构条目。',
      { text: '在库根目录运行 ', code: 'node scripts/build.mjs', after: ' 生成 dist/registry.js 后刷新本页。' },
      '如果构建命令已完成，请确认 dist/registry.js 与 dist/note-library.js 路径可访问，或查看浏览器控制台的加载错误。'
    ], '查看构建与分发文档', function () {
      global.open('../docs/构建与分发.md', '_blank', 'noopener');
    });
    if (els.count) els.count.textContent = '0 项 · 尚未构建';
    if (els.empty) {
      els.empty.hidden = false;
      if (els.emptyText) els.emptyText.textContent = '构建清单尚未生成，列表为空。';
      if (els.emptyReset) els.emptyReset.hidden = true;
    }
  }

  function renderEmptyRegistry() {
    clearNode(els.detail);
    state.currentId = null;
    setDocumentState('empty-registry');
    renderErrorState('构建清单为空', [
      'registry 已加载，但 entries 数组没有条目。预览不会用硬编码清单补齐。',
      '请检查构建脚本是否合并了各模块 manifest。'
    ]);
    if (els.count) els.count.textContent = '0 项';
  }

  function disableIndex() {
    if (els.search) els.search.disabled = true;
    if (els.searchClear) els.searchClear.hidden = true;
    if (els.categories) els.categories.hidden = true;
    if (els.emptyReset) els.emptyReset.hidden = true;
  }

  /* ------------------------------------------------------------------ *
   * 演示生命周期
   * ------------------------------------------------------------------ */

  function showDemoError(entry, error, token) {
    if (token !== state.demoToken) return;
    global.console.error('NoteGallery: demo ' + entry.id + ' failed', error);
    var host = doc.getElementById('gallery-demo');
    if (host) clearNode(host);
    var box = doc.getElementById('gallery-demo-error');
    if (box) {
      clearNode(box);
      box.appendChild(h('strong', '', '演示运行出错（' + entry.id + '）'));
      box.appendChild(h('span', '', safeMessage(error)));
      box.appendChild(h('p', '', '外壳仍可使用：可切换条目或重载演示。错误已输出到控制台。'));
      box.hidden = false;
    }
    resolveReadySoon(entry.id, token);
  }

  function mountDemo(entry) {
    var host = doc.getElementById('gallery-demo');
    if (!host) {
      resolveReady(entry.id);
      return;
    }

    var token = state.demoToken;
    state.bodySnapshot = snapshotBody();
    state.bodyStyle = {
      overflow: doc.body ? doc.body.style.overflow : '',
      paddingRight: doc.body ? doc.body.style.paddingRight : ''
    };

    var demos = global.NoteGalleryDemos;
    var factory = demos && typeof demos[entry.id] === 'function' ? demos[entry.id] : null;
    if (!factory) {
      if (global.console && typeof global.console.warn === 'function') {
        global.console.warn('NoteGallery: no demo registered for ' + entry.id);
      }
      var missing = h('div', 'gallery-demo-missing');
      missing.appendChild(h('strong', '', '尚未提供演示：' + entry.id));
      missing.appendChild(h('p', '', 'gallery/demos/*.js 还没有为这个 ID 注册演示。预览不会用静态图或另写 DOM 冒充组件。'));
      missing.appendChild(h('p', '', '同时请检查 examples/run.html?id=' + entry.id + '；缺失演示属于交付缺口，需由对应模块负责人补齐。'));
      host.appendChild(missing);
      resolveReadySoon(entry.id, token);
      return;
    }

    var result;
    try {
      result = factory(host);
    } catch (error) {
      showDemoError(entry, error, token);
      return;
    }

    if (result && typeof result.then === 'function') {
      result.then(function (cleanup) {
        if (token !== state.demoToken) {
          var lateCleanup = normalizeCleanup(cleanup);
          if (lateCleanup) {
            try { lateCleanup(); } catch (error) {
              global.console.error('NoteGallery: late demo cleanup failed for ' + entry.id, error);
            }
          }
          return;
        }
        state.demoCleanup = normalizeCleanup(cleanup);
        resolveReadySoon(entry.id, token);
      }, function (error) {
        if (token === state.demoToken) showDemoError(entry, error, token);
        else global.console.error('NoteGallery: async demo ' + entry.id + ' failed after switch', error);
      });
    } else {
      state.demoCleanup = normalizeCleanup(result);
      resolveReadySoon(entry.id, token);
    }
  }

  function remountDemo() {
    if (!state.initialized || !state.currentId) return;
    var entry = state.byId[state.currentId];
    if (!entry) return;
    teardownDemo();
    newReadyDeferred();
    mountDemo(entry);
  }

  function activate(entry, options) {
    if (!entry) return false;
    var opts = options || {};
    teardownDemo();
    newReadyDeferred();
    state.currentId = entry.id;
    state.pendingId = null;
    if (opts.history !== 'none') {
      setHash(entry.id, opts.history === 'replace' ? 'replace' : 'push');
    }
    try {
      clearNode(els.detail);
      els.detail.appendChild(renderEntry(entry));
    } catch (error) {
      global.console.error('NoteGallery: failed to render entry ' + entry.id, error);
      renderErrorState('条目详情渲染失败（' + entry.id + '）', [
        safeMessage(error),
        '外壳仍可使用；该条目需要修复 registry 数据或详情渲染。'
      ]);
      setDocumentState('render-error');
      resolveReady(null);
      return true;
    }
    setActiveItem();
    setDocumentState('ready');
    mountDemo(entry);
    return true;
  }

  /* ------------------------------------------------------------------ *
   * 公共接口与初始化
   * ------------------------------------------------------------------ */

  function select(value) {
    var id = normalizeId(value);
    if (!id) return false;
    if (!state.initialized) {
      if (!state.byId[id]) return false;
      state.pendingId = id;
      return true;
    }
    var entry = state.byId[id];
    if (!entry) return false;
    activate(entry, { history: 'push' });
    return true;
  }

  function current() {
    return state.currentId;
  }

  function list() {
    return state.entries.map(function (entry) { return entry.id; });
  }

  function ready() {
    if (!state.readyPromise) return Promise.resolve(state.currentId);
    return state.readyPromise;
  }

  global.NoteGallery = {
    select: select,
    current: current,
    list: list,
    ready: ready
  };

  function init() {
    if (state.initialized) return;
    state.initialized = true;
    cacheElements();
    if (!els.detail) {
      global.console.error('NoteGallery: #gallery-detail missing in gallery/index.html');
      return;
    }
    setDocumentState('reading');

    renderBuildInfo();
    bindShellEvents();
    renderCategories();
    updateList();

    if (!state.registry) {
      disableIndex();
      renderNoRegistry();
      showBanner('尚未生成构建清单', [
        '本页没有列出任何组件，因为 dist/registry.js 未提供 window.NOTE_LIBRARY_REGISTRY。',
        '构建后 registry 会列出全部条目、状态、证据与文件路径；预览不会硬编码一份替代清单。'
      ]);
      resolveReady(null);
      return;
    }

    if (!state.entries.length) {
      disableIndex();
      renderEmptyRegistry();
      showBanner('构建清单为空', [
        'registry 已加载但没有 entries；请检查 scripts/build.mjs 的 manifest 合并结果。'
      ]);
      resolveReady(null);
      return;
    }

    var counts = state.registry.counts;
    var expected = counts && counts.expected !== undefined && counts.expected !== null
      ? Number(counts.expected)
      : null;
    if (expected && expected !== state.entries.length) {
      var missing = counts.missing !== undefined && counts.missing !== null
        ? counts.missing
        : Math.max(0, expected - state.entries.length);
      showBanner('构建清单尚未完整', [
        'registry 当前只有 ' + state.entries.length + ' / ' + expected + ' 项，缺失 ' + missing + ' 项。',
        '本页只显示 registry 中真实存在的条目，不会补造缺失项；缺失模块完成后需重新运行构建。'
      ]);
    } else if (counts && counts.total !== undefined && Number(counts.total) !== state.entries.length) {
      showBanner('清单条目数与构建计数不一致', [
        'counts.total=' + counts.total + '，entries=' + state.entries.length + '。本页只显示 registry 中真实存在的条目。'
      ]);
    }

    var libraryLoaded = !!(global.NoteUI || global.NoteViz || global.NoteBlocks || global.NoteExpr || global.SeqInsert);
    if (!libraryLoaded) {
      showBanner('分发脚本可能未加载', [
        'registry 已加载，但没有发现 NoteUI / NoteViz / NoteBlocks / NoteExpr / SeqInsert。',
        '请确认 dist/note-library.js 已生成且路径正确；演示区可能显示运行错误。'
      ]);
    }

    var demoMap = global.NoteGalleryDemos;
    var demoCount = demoMap ? Object.keys(demoMap).length : 0;
    if (!demoCount) {
      showBanner('未找到演示脚本', [
        'registry 已加载，但 window.NoteGalleryDemos 为空；gallery/demos/*.js 可能尚未加载或缺失。',
        '每个条目会显示“尚未提供演示”，不会以静态图或另写 DOM 冒充。'
      ]);
      global.console.warn('NoteGallery: no demo scripts registered');
    }

    var hashId = readHashId();
    var target = null;
    if (state.pendingId && state.byId[state.pendingId]) {
      target = state.byId[state.pendingId];
      activate(target, { history: hashId === target.id ? 'none' : 'replace' });
    } else if (hashId) {
      target = state.byId[hashId];
      if (!target) {
        showNotFound(hashId);
        return;
      }
      activate(target, { history: 'none' });
    } else {
      target = state.entries[0];
      activate(target, { history: 'replace' });
    }
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})(window);
