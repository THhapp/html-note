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
      var root = element('div', 'nui-notice');
      var marker = element('span', 'nui-notice__marker');
      marker.setAttribute('aria-hidden', 'true');
      var body = element('div', 'nui-notice__body');
      var heading = element('div', 'nui-notice__title');
      var content = element('div', 'nui-notice__content');
      root.setAttribute('role', 'note');
      body.append(heading, content);
      root.append(marker, body);

      function render(patch) {
        var currentTone = tone(options.tone);
        root.dataset.tone = currentTone;
        marker.textContent = currentTone === 'warning' ? '!' : currentTone === 'accent' ? 'i' : '·';
        heading.textContent = text(options.title);
        heading.hidden = !text(options.title);
        if (!patch || own(patch, 'content')) setContent(content, options.content);
      }
      render();
      host.appendChild(root);
      return staticHandle(root, options, render);
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
