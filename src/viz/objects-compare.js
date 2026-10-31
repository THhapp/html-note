/*! NoteViz objects D01-D06 — D06 CompareView.
 *  Classic script; load after src/viz/objects.js (internal shared helpers).
 *  Public entry: NoteViz.CompareView.
 *  No network, no eval, no HTML parsing. */
(function (global) {
  'use strict';

  var NoteViz = global.NoteViz = global.NoteViz || {};
  var shared = global.NoteVizObjectsInternals;
  if (!shared) {
    throw new Error('NoteViz objects 组件需要先加载 src/viz/objects.js（内部共享文件）。');
  }
  var Core = shared.Core;
  var text = shared.text;
  var own = shared.own;
  var isNode = shared.isNode;
  var el = shared.el;
  var setContent = shared.setContent;
  var uniqueId = shared.uniqueId;
  var validateHost = shared.validateHost;
  var emptyLine = shared.emptyLine;

  /* =====================================================================
   * D06 — CompareView
   * ===================================================================== */

  function compareLabels(value) {
    var labels = {
      left: '',
      right: '',
      compare: '对照',
      changed: '变化侧',
      stacked: '窄容器：已改为上下对照'
    };
    if (Array.isArray(value)) {
      if (value.length) labels.left = value[0] == null ? '' : text(value[0]);
      if (value.length > 1) labels.right = value[1] == null ? '' : text(value[1]);
      return labels;
    }
    if (value && typeof value === 'object') {
      if (value.left != null) labels.left = text(value.left);
      if (value.right != null) labels.right = text(value.right);
      if (value.compare != null) labels.compare = text(value.compare);
      if (value.changed != null) labels.changed = text(value.changed);
      else if (value.change != null) labels.changed = text(value.change);
      else if (value.changedSide != null) labels.changed = text(value.changedSide);
      if (value.stacked != null) labels.stacked = text(value.stacked);
      else if (value.stackedHint != null) labels.stacked = text(value.stackedHint);
    }
    return labels;
  }

  function compareSide(value) {
    if (value == null) return null;
    if (value && typeof value === 'object' && !isNode(value)) {
      return {
        title: value.title == null ? '' : text(value.title),
        content: value.content
      };
    }
    return { title: '', content: value };
  }

  function compareContentSpecified(value) {
    if (value == null) return false;
    if (typeof value === 'object' && !isNode(value)) return own(value, 'content');
    return true;
  }

  function compareFocusSides(value, hasLeft, hasRight) {
    var sides = new Set();
    function add(side) {
      var normalized = side == null ? '' : String(side).toLowerCase();
      if (normalized === 'both') {
        if (hasLeft) sides.add('left');
        if (hasRight) sides.add('right');
      } else if ((normalized === 'left' || normalized === 'right') &&
        (normalized === 'left' ? hasLeft : hasRight)) {
        sides.add(normalized);
      }
    }
    if (value === true) {
      if (hasRight) sides.add('right');
      else if (hasLeft) sides.add('left');
    } else if (value && typeof value === 'object') {
      if (Array.isArray(value)) value.forEach(add);
      else if (Array.isArray(value.sides)) value.sides.forEach(add);
      else if (value.side != null) add(text(value.side));
    } else if (typeof value === 'string') {
      add(value.toLowerCase());
    }
    return sides;
  }

  NoteViz.CompareView = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var STACK_THRESHOLD = 560;
      var root = el('div', 'nviz-compare');
      var grid = el('div', 'nviz-compare__grid');
      var join = el('div', 'nviz-compare__join');
      var joinLabel = el('span', 'nviz-compare__join-label', '对照');
      var empty = emptyLine('暂无可对照内容。');
      var adaptive = el('p', 'nviz-compare__adaptive');
      var firstRender = true;
      var currentSides = { left: false, right: false };
      var resizeStop = null;
      var alive = true;

      join.setAttribute('aria-hidden', 'true');
      join.appendChild(joinLabel);
      adaptive.hidden = true;
      empty.hidden = true;
      root.setAttribute('role', 'group');

      function createPane(side) {
        var section = el('section', 'nviz-compare__pane');
        var header = el('header', 'nviz-compare__header');
        var titleWrap = el('div', 'nviz-compare__titlewrap');
        var eyebrow = el('span', 'nviz-compare__eyebrow');
        var title = el('h3', 'nviz-compare__title');
        var badge = el('span', 'nviz-compare__changed');
        title.id = uniqueId('nviz-compare-' + side + '-title');
        eyebrow.id = uniqueId('nviz-compare-' + side + '-eyebrow');
        titleWrap.append(eyebrow, title);
        header.append(titleWrap, badge);
        var body = el('div', 'nviz-compare__body');
        section.append(header, body);
        section.setAttribute('data-side', side);
        section.setAttribute('aria-labelledby', title.id);
        return {
          el: section,
          header: header,
          eyebrow: eyebrow,
          title: title,
          badge: badge,
          body: body
        };
      }

      var panes = { left: createPane('left'), right: createPane('right') };
      grid.append(panes.left.el, join, panes.right.el);
      panes.left.el.hidden = true;
      panes.right.el.hidden = true;
      root.append(grid, adaptive, empty);

      var model = Object.assign({
        left: null,
        right: null,
        mode: 'side-by-side',
        labels: null,
        focusChanged: false
      }, options || {});

      function render(patch) {
        var labels = compareLabels(model.labels);
        var left = compareSide(model.left);
        var right = compareSide(model.right);
        var leftPresent = left != null;
        var rightPresent = right != null;
        var both = leftPresent && rightPresent;
        var mode = model.mode === 'stacked' ? 'stacked' : 'side-by-side';
        var emphasized = compareFocusSides(model.focusChanged, leftPresent, rightPresent);

        grid.hidden = !leftPresent && !rightPresent;
        empty.hidden = leftPresent || rightPresent;
        root.setAttribute('data-mode', mode);
        root.setAttribute('aria-label', labels.compare + '：' +
          (leftPresent ? (left.title || labels.left || '左侧') : '无') + ' 对 ' +
          (rightPresent ? (right.title || labels.right || '右侧') : '无'));

        function updatePane(side, data, updateContent) {
          var pane = panes[side];
          var present = data != null;
          var sideLabel = labels[side] || '';
          var titleText = present && data.title ? text(data.title) : '';
          if (!present) {
            pane.el.hidden = true;
            pane.el.removeAttribute('data-focus-changed');
            if (currentSides[side]) {
              setContent(pane.body, '');
              pane.body.removeAttribute('data-content');
            }
            return;
          }
          var visibleTitle = titleText || sideLabel || (side === 'left' ? '左侧' : '右侧');
          pane.el.hidden = false;
          pane.el.setAttribute('data-focus-changed', emphasized.has(side) ? 'true' : 'false');
          pane.el.setAttribute('data-side', side);
          pane.title.textContent = visibleTitle;
          pane.eyebrow.textContent = sideLabel && visibleTitle !== sideLabel ? sideLabel : '';
          pane.eyebrow.hidden = !(sideLabel && visibleTitle !== sideLabel);
          pane.badge.textContent = emphasized.has(side) ? labels.changed : '';
          pane.badge.hidden = !emphasized.has(side);
          if (updateContent) {
            var contentValue = data.content;
            var isNodeContent = isNode(contentValue) || Array.isArray(contentValue);
            if (isNodeContent) pane.body.removeAttribute('data-content');
            else pane.body.setAttribute('data-content', 'text');
            setContent(pane.body, contentValue);
          }
        }

        updatePane('left', left, firstRender || (leftPresent && own(patch, 'left') && compareContentSpecified(model.left)));
        updatePane('right', right, firstRender || (rightPresent && own(patch, 'right') && compareContentSpecified(model.right)));
        currentSides = { left: leftPresent, right: rightPresent };
        firstRender = false;

        join.hidden = !both;
        joinLabel.textContent = labels.compare;
        join.setAttribute('data-layout-label', labels.compare);
        applyLayout();
      }

      function applyLayout() {
        if (!alive) return;
        var both = currentSides.left && currentSides.right;
        var labels = compareLabels(model.labels);
        var requested = model.mode === 'stacked' ? 'stacked' : 'side-by-side';
        var layout = 'single';
        var autoStacked = false;
        if (both) {
          if (requested === 'stacked') {
            layout = 'stacked';
          } else {
            var width = root.getBoundingClientRect().width;
            if (width > 0 && width < STACK_THRESHOLD) {
              layout = 'stacked';
              autoStacked = true;
            } else {
              layout = 'side-by-side';
            }
          }
        }
        root.setAttribute('data-layout', layout);
        root.setAttribute('data-auto-stacked', autoStacked ? 'true' : 'false');
        adaptive.hidden = !autoStacked;
        adaptive.textContent = labels.stacked;
      }

      var cleanup = function () {
        alive = false;
        if (resizeStop) resizeStop();
      };
      var instance = Core.component(root, model, render, cleanup);
      render({});
      host.appendChild(root);
      resizeStop = Core.onResize(root, function () {
        applyLayout();
      });
      applyLayout();

      instance.getTarget = function (side) {
        if (instance.destroyed || (side !== 'left' && side !== 'right')) return null;
        if (!currentSides[side]) return null;
        return panes[side].el;
      };
      return instance;
    }
  };
})(window);
