/* NoteUI navigation — N07 TreeView.
 * Internal helpers: window.NoteUIInternals.navigation (navigation-shared.js).
 * Depends on: NoteCore. No async loading, no network, no timers. */
(function (global) {
  'use strict';

  var NoteUI = global.NoteUI = global.NoteUI || {};
  var shared = global.NoteUIInternals && global.NoteUIInternals.navigation;
  if (!shared) {
    throw new Error('ui-navigation 组件需要先加载 src/ui/navigation-shared.js（内部共享 helper）。');
  }
  var own = shared.own;
  var core = shared.core;
  var text = shared.text;
  var make = shared.make;
  var content = shared.content;
  var validateHost = shared.validateHost;
  var uniqueId = shared.uniqueId;
  var isElement = shared.isElement;
  var findElement = shared.findElement;
  var focusNode = shared.focusNode;
  var makeIcon = shared.makeIcon;
  var reducedMotion = shared.reducedMotion;
  var scrollIntoNearest = shared.scrollIntoNearest;

  /* ---------------------------------------------------------------------
   * N07 — TreeView
   * ------------------------------------------------------------------- */
  NoteUI.TreeView = {
    version: '1.0.0',
    mount: function (host, options) {
      validateHost(host);
      var C = core();
      var initial = options && typeof options === 'object' ? options : {};
      var state = {
        nodes: Array.isArray(initial.nodes) ? initial.nodes : [],
        expanded: initial.expanded,
        selected: initial.selected,
        multi: Boolean(initial.multi),
        onSelect: typeof initial.onSelect === 'function' ? initial.onSelect : null,
        onToggle: typeof initial.onToggle === 'function' ? initial.onToggle : null,
        label: initial.label == null ? '目录树' : text(initial.label)
      };
      var baseId = uniqueId('nui-tree');
      var root = make('div', 'nui-tree');
      var topNodes = [];
      var allNodes = [];
      var nodeByKey = Object.create(null);
      var expandedKeys = [];
      var selectedKeys = [];
      var focusedKey = null;
      var renderRovingKey = null;
      var destroyed = false;

      function hasKey(list, key) {
        return list.indexOf(key) >= 0;
      }

      function asList(value) {
        if (value == null) return [];
        return Array.isArray(value) ? value.slice() : [value];
      }

      function normalizeNodes(input) {
        topNodes = [];
        allNodes = [];
        nodeByKey = Object.create(null);
        var fallbackCount = 0;

        function createNode(raw, parent, depth, index, siblings) {
          if (!raw || typeof raw !== 'object') return null;
          var id = raw.id != null && String(raw.id) !== '' ? raw.id : baseId + '-node-' + (++fallbackCount);
          var key = String(id);
          var node = {
            id: id,
            key: key,
            label: raw.label == null ? '未命名节点' : raw.label,
            disabled: Boolean(raw.disabled),
            children: [],
            parent: parent || null,
            depth: depth,
            index: index,
            siblingCount: siblings,
            source: raw,
            element: null
          };
          nodeByKey[key] = node;
          allNodes.push(node);
          var children = Array.isArray(raw.children) ? raw.children : [];
          children.forEach(function (child, childIndex) {
            var childNode = createNode(child, node, depth + 1, childIndex, children.length);
            if (childNode) node.children.push(childNode);
          });
          return node;
        }

        (Array.isArray(input) ? input : []).forEach(function (raw, index) {
          var node = createNode(raw, null, 0, index, input.length);
          if (node) topNodes.push(node);
        });
      }

      function applyExpanded(value) {
        var keys = [];
        asList(value).forEach(function (id) {
          var node = nodeByKey[String(id)];
          if (node && node.children.length && !hasKey(keys, node.key)) keys.push(node.key);
        });
        expandedKeys = keys;
      }

      function applySelected(value) {
        var keys = [];
        asList(value).forEach(function (id) {
          var node = nodeByKey[String(id)];
          if (node && !hasKey(keys, node.key)) keys.push(node.key);
        });
        if (!state.multi && keys.length > 1) keys = [keys[0]];
        selectedKeys = keys;
      }

      function selectedValue() {
        var nodes = selectedKeys.map(function (key) { return nodeByKey[key]; }).filter(Boolean);
        if (state.multi) return nodes.map(function (node) { return node.id; });
        return nodes.length ? nodes[0].id : null;
      }

      function isExpanded(node) {
        return hasKey(expandedKeys, node.key);
      }

      function visibleNodes() {
        var out = [];
        function walk(list) {
          list.forEach(function (node) {
            out.push(node);
            if (node.children.length && isExpanded(node)) walk(node.children);
          });
        }
        walk(topNodes);
        return out;
      }

      function rovingNode() {
        var visible = visibleNodes();
        if (!visible.length) return null;
        if (focusedKey) {
          var focused = nodeByKey[focusedKey];
          if (focused && visible.indexOf(focused) >= 0) return focused;
        }
        for (var i = 0; i < selectedKeys.length; i += 1) {
          var selected = nodeByKey[selectedKeys[i]];
          if (selected && visible.indexOf(selected) >= 0) return selected;
        }
        return visible[0];
      }

      function syncRovingDom() {
        var roving = rovingNode();
        var rovingKey = roving ? roving.key : null;
        allNodes.forEach(function (node) {
          if (node.element) node.element.tabIndex = node.key === rovingKey ? 0 : -1;
        });
      }

      function focusTreeItem(node) {
        if (!node || !node.element) return;
        focusedKey = node.key;
        syncRovingDom();
        focusNode(node.element);
        scrollIntoNearest(node.element, root);
      }

      function setExpanded(node, open) {
        if (!node || !node.children.length) return false;
        var key = node.key;
        var present = hasKey(expandedKeys, key);
        if (open && !present) {
          expandedKeys.push(key);
          return true;
        }
        if (!open && present) {
          expandedKeys = expandedKeys.filter(function (entry) { return entry !== key; });
          return true;
        }
        return false;
      }

      function nodeClasses(node) {
        var classes = 'nui-tree__item';
        if (hasKey(selectedKeys, node.key)) classes += ' nui-tree__item--selected';
        if (node.disabled) classes += ' nui-tree__item--disabled';
        return classes;
      }

      function createNodeElement(node) {
        var li = make('li', nodeClasses(node));
        li.setAttribute('role', 'treeitem');
        li.setAttribute('data-nui-tree-id', node.key);
        li.setAttribute('aria-level', String(node.depth + 1));
        li.setAttribute('aria-setsize', String(node.siblingCount));
        li.setAttribute('aria-posinset', String(node.index + 1));
        li.setAttribute('aria-selected', hasKey(selectedKeys, node.key) ? 'true' : 'false');
        if (node.disabled) li.setAttribute('aria-disabled', 'true');
        if (node.children.length) {
          li.setAttribute('aria-expanded', isExpanded(node) ? 'true' : 'false');
        }
        li.tabIndex = renderRovingKey === node.key ? 0 : -1;
        node.element = li;

        var row = make('div', 'nui-tree__row');
        row.style.paddingInlineStart = (8 + node.depth * 16) + 'px';
        var toggle = make('span', 'nui-tree__toggle');
        toggle.setAttribute('aria-hidden', 'true');
        if (node.children.length) {
          toggle.setAttribute('data-nui-tree-toggle', 'true');
          var expanded = isExpanded(node);
          toggle.classList.add(expanded ? 'nui-tree__toggle--open' : 'nui-tree__toggle--closed');
          toggle.textContent = expanded ? '▾' : '▸';
        } else {
          toggle.classList.add('nui-tree__toggle--leaf');
        }
        row.appendChild(toggle);
        var mark = make('span', 'nui-tree__mark');
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = hasKey(selectedKeys, node.key) ? '✓' : '';
        row.appendChild(mark);
        var label = make('span', 'nui-tree__label');
        content(label, node.label);
        row.appendChild(label);
        if (node.disabled) {
          var flag = make('span', 'nui-tree__flag');
          flag.textContent = '不可用';
          row.appendChild(flag);
        }
        li.appendChild(row);

        if (node.children.length) {
          var group = make('ul', 'nui-tree__group');
          group.setAttribute('role', 'group');
          group.hidden = !isExpanded(node);
          node.children.forEach(function (child) { group.appendChild(createNodeElement(child)); });
          li.appendChild(group);
        }
        return li;
      }

      function render(focusAfter) {
        var hadFocus = root.contains(document.activeElement);
        C.clear(root);
        root.setAttribute('role', 'tree');
        root.setAttribute('aria-label', state.label || '目录树');
        if (state.multi) root.setAttribute('aria-multiselectable', 'true');
        else root.removeAttribute('aria-multiselectable');
        if (!topNodes.length) {
          var empty = make('p', 'nui-tree__empty');
          empty.textContent = '暂无目录项';
          root.appendChild(empty);
          renderRovingKey = null;
          return;
        }
        var roving = rovingNode();
        renderRovingKey = roving ? roving.key : null;
        var list = make('ul', 'nui-tree__list');
        list.setAttribute('role', 'none');
        topNodes.forEach(function (node) { list.appendChild(createNodeElement(node)); });
        root.appendChild(list);
        if (focusAfter || hadFocus) {
          var target = rovingNode();
          if (target) focusTreeItem(target);
        }
      }

      function selectUser(node, event) {
        if (!node || node.disabled) return;
        var key = node.key;
        focusedKey = key;
        var index = selectedKeys.indexOf(key);
        var changed = false;
        if (state.multi) {
          if (index >= 0) {
            selectedKeys = selectedKeys.filter(function (entry) { return entry !== key; });
          } else {
            selectedKeys = selectedKeys.concat([key]);
          }
          changed = true;
        } else if (index < 0) {
          selectedKeys = [key];
          changed = true;
        }
        if (changed) render(true);
        else {
          syncRovingDom();
          focusTreeItem(node);
        }
        if (changed && typeof state.onSelect === 'function') {
          state.onSelect(selectedValue(), event);
        }
      }

      function toggleExpandedUser(node, event) {
        if (!node || node.disabled || !node.children.length) return;
        var open = !isExpanded(node);
        if (!setExpanded(node, open)) return;
        focusedKey = node.key;
        render(true);
        if (typeof state.onToggle === 'function') state.onToggle(node.id, open, event);
      }

      function clicked(event) {
        var item = event.target && event.target.closest ? event.target.closest('[role="treeitem"]') : null;
        if (!item || !root.contains(item) || !item.hasAttribute('data-nui-tree-id')) return;
        var node = nodeByKey[item.getAttribute('data-nui-tree-id')];
        if (!node) return;
        var toggle = event.target && event.target.closest ? event.target.closest('.nui-tree__toggle') : null;
        if (toggle && toggle.hasAttribute('data-nui-tree-toggle')) {
          event.preventDefault();
          focusedKey = node.key;
          if (node.disabled) {
            syncRovingDom();
            focusTreeItem(node);
            return;
          }
          toggleExpandedUser(node, event);
          return;
        }
        focusedKey = node.key;
        if (node.disabled) {
          syncRovingDom();
          focusTreeItem(node);
          return;
        }
        selectUser(node, event);
      }

      function keyed(event) {
        var item = event.target && event.target.closest ? event.target.closest('[role="treeitem"]') : null;
        if (!item || !root.contains(item) || !item.hasAttribute('data-nui-tree-id')) return;
        var node = nodeByKey[item.getAttribute('data-nui-tree-id')];
        if (!node) return;
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        var visible = visibleNodes();
        var index = visible.indexOf(node);
        var next = null;
        if (event.key === 'ArrowDown') {
          next = visible[Math.min(visible.length - 1, index + 1)];
        } else if (event.key === 'ArrowUp') {
          next = visible[Math.max(0, index - 1)];
        } else if (event.key === 'Home') {
          next = visible[0];
        } else if (event.key === 'End') {
          next = visible[visible.length - 1];
        } else if (event.key === 'ArrowRight') {
          if (node.disabled) {
            if (node.children.length) event.preventDefault();
            return;
          }
          if (node.children.length) {
            event.preventDefault();
            if (!isExpanded(node)) toggleExpandedUser(node, event);
            else focusTreeItem(node.children[0]);
          }
          return;
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          if (node.children.length && isExpanded(node) && !node.disabled) {
            toggleExpandedUser(node, event);
          } else if (node.parent) {
            focusTreeItem(node.parent);
          }
          return;
        } else if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
          event.preventDefault();
          if (!node.disabled) selectUser(node, event);
          return;
        } else {
          return;
        }
        if (!next) return;
        event.preventDefault();
        focusTreeItem(next);
      }

      function setMulti(multi) {
        state.multi = Boolean(multi);
        if (!state.multi && selectedKeys.length > 1) selectedKeys = [selectedKeys[0]];
      }

      root.addEventListener('click', clicked);
      root.addEventListener('keydown', keyed);
      normalizeNodes(state.nodes);
      applyExpanded(state.expanded);
      applySelected(state.selected);
      host.appendChild(root);
      render(false);

      return {
        el: root,
        getSelected: function () { return destroyed ? null : selectedValue(); },
        select: function (id, selectOptions) {
          if (destroyed) return;
          var settings = selectOptions && typeof selectOptions === 'object' ? selectOptions : {};
          var silent = settings.silent === true;
          var changed = false;
          if (id == null) {
            if (selectedKeys.length) {
              selectedKeys = [];
              changed = true;
            }
          } else if (Array.isArray(id)) {
            if (!state.multi) return;
            var keys = [];
            id.forEach(function (entry) {
              var node = nodeByKey[String(entry)];
              if (node && !hasKey(keys, node.key)) keys.push(node.key);
            });
            if (keys.join('\u0000') !== selectedKeys.join('\u0000')) {
              selectedKeys = keys;
              changed = true;
            }
          } else {
            var node = nodeByKey[String(id)];
            if (!node) return;
            if (state.multi) {
              var present = hasKey(selectedKeys, node.key);
              if (settings.selected === false) {
                if (present) {
                  selectedKeys = selectedKeys.filter(function (key) { return key !== node.key; });
                  changed = true;
                }
              } else if (!present) {
                selectedKeys = selectedKeys.concat([node.key]);
                changed = true;
              }
            } else {
              if (settings.selected === false) {
                if (selectedKeys.indexOf(node.key) >= 0) {
                  selectedKeys = [];
                  changed = true;
                }
              } else if (selectedKeys.length !== 1 || selectedKeys[0] !== node.key) {
                selectedKeys = [node.key];
                changed = true;
              }
            }
          }
          if (!changed) return;
          render(root.contains(document.activeElement));
          if (!silent && typeof state.onSelect === 'function') {
            state.onSelect(selectedValue(), null);
          }
        },
        expand: function (id, open) {
          if (destroyed) return false;
          var node = nodeByKey[String(id)];
          if (!node || !node.children.length) return false;
          var next = open == null ? !isExpanded(node) : Boolean(open);
          if (!setExpanded(node, next)) return false;
          render(root.contains(document.activeElement));
          return true;
        },
        getTarget: function (id) {
          if (destroyed || id == null) return null;
          var node = nodeByKey[String(id)];
          return node && node.element ? node.element : null;
        },
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          var hadFocus = root.contains(document.activeElement);
          if (own(patch, 'multi')) setMulti(patch.multi);
          if (own(patch, 'nodes')) {
            state.nodes = Array.isArray(patch.nodes) ? patch.nodes : [];
            normalizeNodes(state.nodes);
            expandedKeys = expandedKeys.filter(function (key) {
              var node = nodeByKey[key];
              return node && node.children.length;
            });
            selectedKeys = selectedKeys.filter(function (key) { return !!nodeByKey[key]; });
            if (focusedKey && !nodeByKey[focusedKey]) focusedKey = null;
          }
          if (own(patch, 'expanded')) applyExpanded(patch.expanded);
          if (own(patch, 'selected')) applySelected(patch.selected);
          if (own(patch, 'label')) state.label = patch.label == null ? '目录树' : text(patch.label);
          if (own(patch, 'onSelect')) state.onSelect = typeof patch.onSelect === 'function' ? patch.onSelect : null;
          if (own(patch, 'onToggle')) state.onToggle = typeof patch.onToggle === 'function' ? patch.onToggle : null;
          render(hadFocus);
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          root.removeEventListener('click', clicked);
          root.removeEventListener('keydown', keyed);
          root.remove();
        }
      };
    }
  };
})(window);
