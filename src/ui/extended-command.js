/* NoteUI extended — X07 CommandPalette.
 * Internal helpers: window.NoteUIInternals.extended (extended-shared.js).
 * Depends on: NoteCore. Commands are local and host-provided; the dialog reuses
 * NoteCore.floating. No fetch, eval, HTML string injection. */
(function (global) {
  'use strict';

  var NoteUI = global.NoteUI = global.NoteUI || {};
  var shared = global.NoteUIInternals && global.NoteUIInternals.extended;
  if (!shared) {
    throw new Error('ui-extended 组件需要先加载 src/ui/extended-shared.js（内部共享 helper）。');
  }
  var core = shared.core;
  var own = shared.own;
  var text = shared.text;
  var make = shared.make;
  var validateHost = shared.validateHost;
  var uid = shared.uid;
  var isNode = shared.isNode;
  var append = shared.append;
  var setHidden = shared.setHidden;
  var focusNode = shared.focusNode;
  var isEditableTarget = shared.isEditableTarget;
  var valueKey = shared.valueKey;
  var signatureOf = shared.signatureOf;
  var uniqueValues = shared.uniqueValues;
  var appendContent = shared.appendContent;
  var readLive = shared.readLive;
  var VERSION = shared.VERSION;


  /* -----------------------------------------------------------------------
   * X07 — CommandPalette
   * -------------------------------------------------------------------- */

  function normalizeCommands(commands) {
    return (Array.isArray(commands) ? commands : []).filter(function (command) {
      return command && typeof command === 'object';
    }).map(function (command, index) {
      var keywords = Array.isArray(command.keywords) ? command.keywords.map(text).join(' ') :
        text(command.keywords);
      return {
        raw: command,
        id: command.id == null ? 'command-' + (index + 1) : command.id,
        label: command.label == null ? ('命令 ' + (index + 1)) : text(command.label),
        group: command.group == null || String(command.group).trim() === '' ? '命令' : text(command.group),
        keywords: keywords,
        shortcut: command.shortcut == null ? '' : text(command.shortcut),
        disabled: Boolean(command.disabled),
        run: typeof command.run === 'function' ? command.run : null
      };
    });
  }

  function parseHotkey(value) {
    if (!value) return null;
    var raw = value;
    var parts;
    if (typeof raw === 'string') {
      parts = raw.split('+').map(function (part) { return part.trim(); }).filter(Boolean);
      if (!parts.length) return null;
      var key = parts.pop().toLowerCase();
      var spec = { key: key === 'space' ? ' ' : key, ctrl: false, meta: false, alt: false, shift: false, mod: false };
      parts.forEach(function (part) {
        var token = part.toLowerCase();
        if (token === 'ctrl' || token === 'control') spec.ctrl = true;
        else if (token === 'meta' || token === 'cmd' || token === 'command') spec.meta = true;
        else if (token === 'alt' || token === 'option') spec.alt = true;
        else if (token === 'shift') spec.shift = true;
        else if (token === 'mod') spec.mod = true;
      });
      return spec;
    }
    if (typeof raw === 'object' && raw.key) {
      var objectKey = text(raw.key).toLowerCase();
      return {
        key: objectKey === 'space' ? ' ' : objectKey,
        ctrl: Boolean(raw.ctrl),
        meta: Boolean(raw.meta),
        alt: Boolean(raw.alt),
        shift: Boolean(raw.shift),
        mod: Boolean(raw.mod)
      };
    }
    return null;
  }

  function hotkeyMatches(spec, event) {
    if (!spec || !event) return false;
    var key = text(event.key).toLowerCase();
    if (key !== spec.key) return false;
    if (spec.mod) {
      if (!(event.ctrlKey || event.metaKey)) return false;
    } else if (Boolean(event.ctrlKey) !== spec.ctrl || Boolean(event.metaKey) !== spec.meta) {
      return false;
    }
    if (Boolean(event.altKey) !== spec.alt) return false;
    if (Boolean(event.shiftKey) !== spec.shift) return false;
    return true;
  }

  NoteUI.CommandPalette = {
    version: VERSION,
    mount: function (host, options) {
      validateHost(host);
      var C = core();
      var input = options && typeof options === 'object' ? options : {};
      var root = make('div', 'nui-command-host');
      var docBag = C.listeners(document);
      var layer = null;
      var panelEl = null;
      var searchInput = null;
      var closeButton = null;
      var listEl = null;
      var emptyEl = null;
      var countEl = null;
      var resultHint = null;
      var listId = uid('nui-command-list');
      var helpId = uid('nui-command-help');
      var alive = true;
      var state = {
        commands: normalizeCommands(input.commands),
        placeholder: input.placeholder == null ? '输入命令或关键词…' : text(input.placeholder),
        emptyText: input.emptyText == null ? '没有匹配的命令' : text(input.emptyText),
        label: input.label == null ? '命令面板' : text(input.label),
        hotkeySpec: parseHotkey(input.hotkey),
        query: '',
        _matches: [],
        _groups: [],
        _activeIndex: -1,
        _open: false
      };

      function normalizedQuery() {
        return state.query.trim().toLowerCase();
      }

      function matchesFor(query) {
        var terms = query ? query.split(/\s+/) : [];
        return state.commands.filter(function (command) {
          if (!terms.length) return true;
          var haystack = (command.label + ' ' + command.group + ' ' + command.keywords).toLowerCase();
          return terms.every(function (term) { return haystack.indexOf(term) >= 0; });
        });
      }

      function firstEnabled() {
        for (var index = 0; index < state._matches.length; index += 1) {
          if (!state._matches[index].disabled) return index;
        }
        return -1;
      }

      function lastEnabled() {
        for (var index = state._matches.length - 1; index >= 0; index -= 1) {
          if (!state._matches[index].disabled) return index;
        }
        return -1;
      }

      function stepEnabled(from, direction) {
        var count = state._matches.length;
        if (!count) return -1;
        var index = from;
        for (var step = 0; step < count; step += 1) {
          index += direction;
          if (index < 0) index = count - 1;
          if (index >= count) index = 0;
          if (!state._matches[index].disabled) return index;
        }
        return -1;
      }

      function optionId(index) {
        return listId + '-option-' + index;
      }

      function applyActive() {
        if (!listEl) return;
        Array.prototype.forEach.call(listEl.querySelectorAll('[role="option"]'), function (option) {
          var index = Number(option.getAttribute('data-command-index'));
          var active = index === state._activeIndex;
          option.classList.toggle('is-active', active);
          option.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        if (state._activeIndex >= 0 && state._activeIndex < state._matches.length) {
          searchInput.setAttribute('aria-activedescendant', optionId(state._activeIndex));
          var activeOption = listEl.querySelector('[data-command-index="' + state._activeIndex + '"]');
          if (activeOption) textUnderOption(activeOption);
        } else {
          searchInput.removeAttribute('aria-activedescendant');
        }
      }

      function textUnderOption(option) {
        if (!option) return;
        C.scrollIntoViewIfNeeded(option, listEl, { block: 'nearest' });
      }

      function setActive(index) {
        if (index < 0 || index >= state._matches.length || state._matches[index].disabled) return;
        state._activeIndex = index;
        applyActive();
      }

      function buildGroups() {
        var groups = [];
        var byKey = Object.create(null);
        state._matches.forEach(function (command, matchIndex) {
          var key = command.group;
          var group = byKey[key];
          if (!group) {
            group = { name: key, commands: [] };
            byKey[key] = group;
            groups.push(group);
          }
          group.commands.push({ command: command, matchIndex: matchIndex });
        });
        state._groups = groups;
      }

      function optionFor(command, matchIndex) {
        var option = make('div', 'nui-command__option');
        option.id = optionId(matchIndex);
        option.setAttribute('role', 'option');
        option.setAttribute('data-command-index', String(matchIndex));
        option.setAttribute('aria-selected', matchIndex === state._activeIndex ? 'true' : 'false');
        option.classList.toggle('is-active', matchIndex === state._activeIndex);
        if (command.disabled) option.setAttribute('aria-disabled', 'true');
        option.classList.toggle('is-disabled', command.disabled);
        append(option, make('span', 'nui-command__label', command.label));
        if (command.shortcut) {
          var shortcut = make('kbd', 'nui-command__shortcut', command.shortcut);
          shortcut.setAttribute('aria-label', '快捷键 ' + command.shortcut);
          option.appendChild(shortcut);
        }
        if (command.disabled) {
          option.appendChild(make('span', 'nui-command__unavailable', '不可用'));
        }
        return option;
      }

      function refreshMatches(options) {
        var settings = options && typeof options === 'object' ? options : {};
        state.query = settings.query == null ? state.query : text(settings.query);
        state._matches = matchesFor(normalizedQuery());
        buildGroups();
        if (settings.resetActive === false) {
          if (state._activeIndex < 0 || state._activeIndex >= state._matches.length ||
              state._matches[state._activeIndex].disabled) {
            state._activeIndex = firstEnabled();
          }
        } else {
          state._activeIndex = firstEnabled();
        }
      }

      function renderResults() {
        if (!listEl) return;
        listEl.replaceChildren();
        if (!state._matches.length) {
          setHidden(emptyEl, false);
          emptyEl.textContent = state.emptyText;
          searchInput.removeAttribute('aria-activedescendant');
        } else {
          setHidden(emptyEl, true);
          state._groups.forEach(function (group, index) {
            var groupEl = make('div', 'nui-command__group');
            groupEl.setAttribute('role', 'group');
            var headingId = listId + '-group-' + index;
            var heading = make('div', 'nui-command__group-label', group.name);
            heading.id = headingId;
            groupEl.setAttribute('aria-labelledby', headingId);
            groupEl.appendChild(heading);
            group.commands.forEach(function (entry) {
              groupEl.appendChild(optionFor(entry.command, entry.matchIndex));
            });
            listEl.appendChild(groupEl);
          });
        }
        var total = state.commands.length;
        if (normalizedQuery()) {
          countEl.textContent = state._matches.length + ' / ' + total + ' 个命令';
        } else {
          countEl.textContent = total + ' 个命令';
        }
        resultHint.textContent = state._matches.length ? '↑↓ 选择 · Enter 执行 · Esc 关闭' :
          '输入其他关键词试试，或按 Esc 关闭';
        applyActive();
      }

      function ensureLayer() {
        if (layer) return layer;
        panelEl = make('div', 'nui-command__panel');
        var searchRow = make('div', 'nui-command__search');
        var searchCap = make('span', 'hnv-visually-hidden', state.label + '，筛选命令');
        searchInput = make('input', 'nui-command__input');
        closeButton = make('button', 'nui-command__close');
        var body = make('div', 'nui-command__body');
        listEl = make('div', 'nui-command__list');
        emptyEl = make('p', 'nui-command__empty');
        var footer = make('div', 'nui-command__footer');
        resultHint = make('span', 'nui-command__hint');
        countEl = make('span', 'nui-command__count');
        var help = make('p', 'hnv-visually-hidden',
          '输入以筛选本地命令；上下方向键选择，Enter 执行，Esc 关闭。');
        help.id = helpId;
        searchInput.type = 'text';
        searchInput.autocomplete = 'off';
        searchInput.spellcheck = false;
        searchInput.setAttribute('role', 'combobox');
        searchInput.setAttribute('aria-autocomplete', 'list');
        searchInput.setAttribute('aria-haspopup', 'listbox');
        searchInput.setAttribute('aria-expanded', 'true');
        searchInput.setAttribute('aria-controls', listId);
        searchInput.setAttribute('aria-describedby', helpId);
        searchInput.placeholder = state.placeholder;
        searchInput.setAttribute('aria-label', state.label + '，筛选命令');
        closeButton.type = 'button';
        closeButton.setAttribute('aria-label', '关闭命令面板');
        closeButton.appendChild(make('span', 'nui-command__close-glyph', '×'));
        closeButton.firstChild.setAttribute('aria-hidden', 'true');
        listEl.id = listId;
        listEl.setAttribute('role', 'listbox');
        listEl.setAttribute('aria-label', state.label + '结果');
        emptyEl.setAttribute('role', 'status');
        countEl.setAttribute('aria-live', 'polite');
        append(searchRow, searchCap, searchInput, closeButton);
        append(body, listEl, emptyEl);
        append(footer, resultHint, countEl);
        append(panelEl, searchRow, body, footer, help);
        layer = C.floating.create({
          anchor: null,
          content: panelEl,
          modal: true,
          backdrop: true,
          trapFocus: true,
          returnFocus: true,
          closeOnEsc: true,
          closeOnOutside: true,
          lockScroll: true,
          role: 'dialog',
          className: 'nui-command__dialog',
          maxWidth: 'min(94vw, 40rem)',
          onOpen: function () {
            state._open = true;
            searchInput.setAttribute('aria-expanded', 'true');
          },
          onClose: function () {
            state._open = false;
            if (searchInput) searchInput.setAttribute('aria-expanded', 'false');
          }
        });
        layer.el.setAttribute('aria-label', state.label);
        layer.el.setAttribute('aria-describedby', helpId);
        var bag = C.listeners(panelEl);
        bag.on('click', function (event) {
          if (event.target === closeButton || closeButton.contains(event.target)) {
            event.preventDefault();
            close('api');
            return;
          }
          var option = event.target && event.target.closest ?
            event.target.closest('[role="option"]') : null;
          if (!option || !listEl.contains(option)) return;
          var index = Number(option.getAttribute('data-command-index'));
          if (!isFinite(index)) return;
          execute(index, event);
        });
        bag.on('keydown', function (event) {
          if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
          if (!layer || !layer.isOpen()) return;
          if (event.key === 'ArrowDown' || event.key === 'Down') {
            event.preventDefault();
            if (state._activeIndex < 0) setActive(firstEnabled());
            else setActive(stepEnabled(state._activeIndex, 1));
          } else if (event.key === 'ArrowUp' || event.key === 'Up') {
            event.preventDefault();
            if (state._activeIndex < 0) setActive(lastEnabled());
            else setActive(stepEnabled(state._activeIndex, -1));
          } else if (event.key === 'Home') {
            event.preventDefault();
            setActive(firstEnabled());
          } else if (event.key === 'End') {
            event.preventDefault();
            setActive(lastEnabled());
          } else if (event.key === 'Enter') {
            event.preventDefault();
            execute(state._activeIndex, event);
          }
        });
        bag.on('input', function (event) {
          if (event.target !== searchInput) return;
          refreshMatches({ query: searchInput.value, resetActive: true });
          renderResults();
        });
        layer.el._nuiCommandBag = bag;
        return layer;
      }

      function syncChrome() {
        if (!layer) return;
        layer.el.setAttribute('aria-label', state.label);
        if (searchInput) {
          searchInput.placeholder = state.placeholder;
          searchInput.setAttribute('aria-label', state.label + '，筛选命令');
        }
      }

      function execute(index, event) {
        if (!alive || !layer || !layer.isOpen()) return;
        if (!isFinite(Number(index)) || Number(index) < 0 || Number(index) >= state._matches.length) return;
        var command = state._matches[Number(index)];
        if (!command || command.disabled) return;
        close('select');
        if (typeof command.run === 'function') command.run(command.raw, event || null);
      }

      function open() {
        if (!alive) return false;
        ensureLayer();
        if (layer.isOpen()) {
          focusNode(searchInput);
          if (typeof searchInput.select === 'function') searchInput.select();
          return true;
        }
        state.query = '';
        searchInput.value = '';
        refreshMatches({ query: '', resetActive: true });
        renderResults();
        syncChrome();
        layer.open();
        focusNode(searchInput);
        return true;
      }

      function close(reason) {
        if (!layer || !layer.isOpen()) return false;
        layer.close(reason == null ? 'api' : reason);
        return true;
      }

      function isOpen() {
        return !!(layer && layer.isOpen());
      }

      function hotkeyed(event) {
        if (!alive || event.isComposing || event.defaultPrevented) return;
        var spec = state.hotkeySpec;
        if (!spec || !hotkeyMatches(spec, event)) return;
        var noModifier = !spec.ctrl && !spec.meta && !spec.alt && !spec.mod;
        if (noModifier && !isOpen() && isEditableTarget(event.target)) return;
        event.preventDefault();
        if (isOpen()) {
          focusNode(searchInput);
          if (searchInput && typeof searchInput.select === 'function') searchInput.select();
        } else {
          open();
        }
      }

      docBag.on('keydown', hotkeyed);

      var inst = C.component(root, state, function () {
        if (!layer) return;
        if (layer.isOpen()) {
          refreshMatches({ query: state.query, resetActive: false });
          renderResults();
        }
        syncChrome();
      }, function () {
        alive = false;
        docBag.clear();
        if (layer) {
          if (layer.el && layer.el._nuiCommandBag) {
            layer.el._nuiCommandBag.clear();
            layer.el._nuiCommandBag = null;
          }
          layer.destroy();
          layer = null;
        }
        panelEl = null;
        searchInput = null;
        closeButton = null;
        listEl = null;
        emptyEl = null;
        countEl = null;
        resultHint = null;
      });

      var baseUpdate = inst.update;
      inst.update = function (patch) {
        if (inst.destroyed || !patch || typeof patch !== 'object') return;
        var next = C.assign({}, patch);
        if (own(next, 'commands')) next.commands = normalizeCommands(next.commands);
        if (own(next, 'hotkey')) next.hotkeySpec = parseHotkey(next.hotkey);
        return baseUpdate(next);
      };

      inst.open = open;
      inst.close = close;
      inst.isOpen = isOpen;
      host.appendChild(root);
      return inst;
    }
  };
})(window);
