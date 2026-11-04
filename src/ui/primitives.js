(function (global) {
  'use strict';

  var NoteUI = global.NoteUI = global.NoteUI || {};
  var internals = global.NoteUILegacyInternals;
  if (!internals) {
    throw new Error('NoteUI primitives 需要先加载 src/ui/controls.js（legacy 内部共享 helper）。');
  }
  var sequence = 0;
  var own = internals.own;
  var text = internals.text;
  var element = internals.element;
  var validateHost = internals.validateHost;
  var setContent = internals.setContent;

  function tone(value) { return ['neutral', 'accent', 'warning'].indexOf(value) === -1 ? 'neutral' : value; }

  function isDomNode(value) {
    return !!value && typeof value === 'object' && [1, 3, 11].indexOf(value.nodeType) !== -1;
  }

  function isTextScalar(value) {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
  }

  /* Notice 公开契约：content 为文本、单个 DOM 节点，或由这些值组成的数组。
     数组在写入前整体校验；任一项非法就在替换内容之前抛错，不先破坏旧内容。 */
  function normalizeNoticeContent(value) {
    if (value == null) return '';
    if (isDomNode(value)) return value;
    if (Array.isArray(value)) {
      var core = global.NoteCore;
      if (!core || typeof core.setContent !== 'function') {
        throw new TypeError('NoteUI.Notice: content 数组需要 core 模块的 NoteCore.setContent。');
      }
      var items = [];
      for (var i = 0; i < value.length; i += 1) {
        var item = value[i];
        if (item == null) continue;
        if (isDomNode(item) || isTextScalar(item)) {
          items.push(item);
          continue;
        }
        throw new TypeError('NoteUI.Notice: content 数组第 ' + (i + 1) + ' 项不是文本或 DOM 节点；收到 ' +
          Object.prototype.toString.call(item) + '。');
      }
      return items;
    }
    if (isTextScalar(value)) return value;
    throw new TypeError('NoteUI.Notice: content 必须是文本、单个 DOM 节点，或由两者组成的数组；收到 ' +
      Object.prototype.toString.call(value) + '。');
  }

  function applyNoticeContent(target, value) {
    var nodes = Array.isArray(value);
    var core = global.NoteCore;
    if (nodes) {
      /* normalizeNoticeContent 已确认 core 可用；数组统一走内容插入工具。 */
      core.setContent(target, value);
    } else if (core && typeof core.setContent === 'function') {
      core.setContent(target, value);
    } else {
      setContent(target, value); /* 兼容：仅加载 legacy 内部 helper 时支持文本/单节点 */
    }
    target.classList.toggle('nui-notice__content--nodes', nodes);
  }

  function staticHandle(root, options, render, cleanup) {
    var alive = true;
    return {
      el: root,
      update: function (patch) {
        if (!alive || !patch || typeof patch !== 'object') return;
        Object.assign(options, patch);
        render(patch);
      },
      destroy: function () {
        if (!alive) return;
        alive = false;
        if (cleanup) cleanup();
        root.remove();
      }
    };
  }

  NoteUI.Badge = {
    mount: function (host, input) {
      validateHost(host);
      var options = Object.assign({ label: '', tone: 'neutral' }, input);
      var root = element('span', 'nui-badge');
      function render() {
        root.dataset.tone = tone(options.tone);
        root.textContent = text(options.label);
      }
      render();
      host.appendChild(root);
      return staticHandle(root, options, render);
    }
  };

  NoteUI.Notice = {
    mount: function (host, input) {
      validateHost(host);
      var options = Object.assign({ title: '', content: '', tone: 'neutral' }, input);
      /* 先整体校验/归一化，再创建 DOM；无效输入不会写入宿主容器。 */
      options.content = normalizeNoticeContent(options.content);
      var root = element('div', 'nui-notice');
      var marker = element('span', 'nui-notice__marker');
      marker.setAttribute('aria-hidden', 'true');
      var body = element('div', 'nui-notice__body');
      var heading = element('div', 'nui-notice__title');
      var titleId = 'nui-notice-title-' + (++sequence);
      heading.id = titleId;
      var content = element('div', 'nui-notice__content');
      var alive = true;
      root.setAttribute('role', 'note');
      body.append(heading, content);
      root.append(marker, body);

      function render(patch) {
        var currentTone = tone(options.tone);
        root.dataset.tone = currentTone;
        marker.textContent = currentTone === 'warning' ? '!' : currentTone === 'accent' ? 'i' : '·';
        heading.textContent = text(options.title);
        heading.hidden = !text(options.title);
        if (text(options.title)) root.setAttribute('aria-labelledby', titleId);
        else root.removeAttribute('aria-labelledby');
        if (!patch || own(patch, 'content')) applyNoticeContent(content, options.content);
      }
      render();
      host.appendChild(root);
      return {
        el: root,
        update: function (patch) {
          if (!alive || !patch || typeof patch !== 'object') return;
          /* 内容校验先于任何状态写入：坏数组/对象不会先改掉标题、语气或旧内容。 */
          var hasContent = own(patch, 'content');
          var nextContent = hasContent ? normalizeNoticeContent(patch.content) : null;
          Object.assign(options, patch);
          if (hasContent) options.content = nextContent;
          render(patch);
        },
        destroy: function () {
          if (!alive) return;
          alive = false;
          root.remove();
        }
      };
    }
  };

  NoteUI.Disclosure = {
    mount: function (host, input) {
      validateHost(host);
      var options = Object.assign({ title: '查看详情', summary: '', content: '', open: false, onToggle: null }, input);
      var root = element('details', 'nui-disclosure');
      var summary = element('summary', 'nui-disclosure__summary');
      var textGroup = element('span', 'nui-disclosure__text');
      var heading = element('span', 'nui-disclosure__title');
      var description = element('span', 'nui-disclosure__description');
      var indicator = element('span', 'nui-disclosure__indicator');
      var content = element('div', 'nui-disclosure__content');
      content.id = 'nui-disclosure-content-' + (++sequence);
      summary.setAttribute('aria-controls', content.id);
      indicator.setAttribute('aria-hidden', 'true');
      textGroup.append(heading, description);
      summary.append(textGroup, indicator);
      root.append(summary, content);
      root.open = Boolean(options.open);
      var lastNotified = root.open;
      var alive = true;

      function notify(open, event) {
        options.open = open;
        if (lastNotified === open) return;
        lastNotified = open;
        if (typeof options.onToggle === 'function') options.onToggle(open, event);
      }
      function render(patch) {
        heading.textContent = text(options.title) || '查看详情';
        description.textContent = text(options.summary);
        description.hidden = !text(options.summary);
        if (!patch || own(patch, 'content')) setContent(content, options.content);
        if (patch && own(patch, 'open')) {
          root.open = Boolean(options.open);
          notify(root.open, null);
        }
      }
      function onToggle(event) {
        if (alive) notify(root.open, event);
      }
      render();
      root.addEventListener('toggle', onToggle);
      host.appendChild(root);
      return staticHandle(root, options, render, function () {
        alive = false;
        root.removeEventListener('toggle', onToggle);
      });
    }
  };

  NoteUI.DataObject = {
    mount: function (host, input) {
      validateHost(host);
      var options = Object.assign({ label: '', value: '', caption: '', attention: false, changed: false }, input);
      var root = element('div', 'nui-data-object');
      var label = element('div', 'nui-data-object__label');
      var value = element('div', 'nui-data-object__value');
      var caption = element('div', 'nui-data-object__caption');
      label.id = 'nui-data-object-label-' + (++sequence);
      root.setAttribute('role', 'group');
      root.append(label, value, caption);

      function render(patch) {
        label.textContent = text(options.label);
        label.hidden = !text(options.label);
        if (label.hidden) root.removeAttribute('aria-labelledby');
        else root.setAttribute('aria-labelledby', label.id);
        if (!patch || own(patch, 'value')) setContent(value, options.value);
        caption.textContent = text(options.caption);
        caption.hidden = !text(options.caption);
        root.classList.toggle('nui-data-object--attention', Boolean(options.attention));
        root.classList.toggle('nui-data-object--changed', Boolean(options.changed));
      }
      render();
      host.appendChild(root);
      return staticHandle(root, options, render);
    }
  };
})(window);
