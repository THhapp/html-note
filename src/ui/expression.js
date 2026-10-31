/* NoteUI.Expression — 有稳定身份的小型表达式项（C13）。
 * 复用 NoteUI.Math 处理 tex 项；本组件只负责项身份、排版、cues 与查询，
 * 不分析公式语义、不自动匹配符号、不播放动画。
 * 经典脚本，无模块/无网络/无 eval。
 */
(function (global) {
  'use strict';

  var NoteUI = global.NoteUI = global.NoteUI || {};
  var VERSION = '1.0.0';

  function own(object, key) {
    return object != null && Object.prototype.hasOwnProperty.call(object, key);
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function text(value) {
    return value == null ? '' : String(value);
  }

  function normalizeId(value, where) {
    if (value == null) throw new TypeError('NoteUI.Expression：' + where + ' 不能为空');
    var id = text(value);
    if (!id) throw new TypeError('NoteUI.Expression：' + where + ' 不能为空字符串');
    return id;
  }

  function normalizeParts(input) {
    if (!Array.isArray(input)) throw new TypeError('NoteUI.Expression：parts 必须是数组');
    var seen = {};
    var parts = [];
    input.forEach(function (part, index) {
      if (!isObject(part)) throw new TypeError('NoteUI.Expression：parts[' + index + '] 必须是对象');
      var id = normalizeId(part.id, 'parts[' + index + '].id');
      if (own(seen, id)) throw new TypeError('NoteUI.Expression：parts id "' + id + '" 重复');
      seen[id] = true;
      var hasText = own(part, 'text');
      var hasTex = own(part, 'tex');
      if (hasText === hasTex) {
        throw new TypeError('NoteUI.Expression：parts[' + index + '] 必须在 text 与 tex 中二选一');
      }
      if (hasText) {
        parts.push({ id: id, text: text(part.text) });
      } else {
        var tex = text(part.tex);
        if (!tex) throw new TypeError('NoteUI.Expression：parts[' + index + '].tex 不能为空');
        parts.push({ id: id, tex: tex });
      }
    });
    return parts;
  }

  function normalizeCueList(input, ids, where) {
    if (input == null) return [];
    if (!Array.isArray(input)) throw new TypeError('NoteUI.Expression：' + where + ' 必须是数组');
    var seen = {};
    var result = [];
    input.forEach(function (value, index) {
      var id = normalizeId(value, where + '[' + index + ']');
      if (!own(ids, id)) throw new TypeError('NoteUI.Expression：' + where + ' 引用了不存在的项 "' + id + '"');
      if (!own(seen, id)) {
        seen[id] = true;
        result.push(id);
      }
    });
    return result;
  }

  function normalizeState(input) {
    if (!isObject(input)) throw new TypeError('NoteUI.Expression：输入必须是对象');
    var parts = normalizeParts(input.parts == null ? [] : input.parts);
    var ids = {};
    parts.forEach(function (part) { ids[part.id] = true; });
    return {
      parts: parts,
      focus: normalizeCueList(input.focus, ids, 'focus'),
      changed: normalizeCueList(input.changed, ids, 'changed'),
      label: text(input.label)
    };
  }

  function copyState(state) {
    return {
      parts: state.parts.map(function (part) {
        return part.tex !== undefined ? { id: part.id, tex: part.tex } : { id: part.id, text: part.text };
      }),
      focus: state.focus.slice(),
      changed: state.changed.slice(),
      label: state.label
    };
  }

  function createElement(tag, className, value) {
    var node = global.document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = text(value);
    return node;
  }

  function samePart(a, b) {
    if (!a || !b || a.id !== b.id) return false;
    if (a.tex !== undefined || b.tex !== undefined) return a.tex === b.tex;
    return a.text === b.text;
  }

  NoteUI.Expression = {
    version: VERSION,
    mount: function (host, input) {
      if (!host || host.nodeType !== 1) {
        throw new TypeError('NoteUI.Expression.mount(host, options)：host 必须是宿主任意元素。');
      }
      var state = normalizeState(input || {});
      var root = createElement('span', 'nui-expression');
      root.setAttribute('data-component', 'expression');
      var records = new Map();
      var instance = {
        el: root,
        update: function (patch) {
          if (instance.destroyed) return;
          if (isObject(patch)) {
            var next = copyState(state);
            if (patch.parts !== undefined) next.parts = patch.parts;
            if (patch.focus !== undefined) next.focus = patch.focus;
            if (patch.changed !== undefined) next.changed = patch.changed;
            if (patch.label !== undefined) next.label = patch.label;
            state = normalizeState(next);
          }
          render();
        },
        destroy: function () {
          if (instance.destroyed) return;
          instance.destroyed = true;
          records.forEach(function (record) {
            if (record.math) {
              try { record.math.destroy(); } catch (error) { /* ignore */ }
            }
          });
          records.clear();
          if (root.parentNode) root.parentNode.removeChild(root);
        },
        getState: function () {
          return copyState(state);
        },
        getTarget: function (query) {
          if (instance.destroyed || !isObject(query)) return null;
          if (query.part === 'root') return root;
          if (query.id == null) return null;
          var record = records.get(String(query.id));
          if (!record) return null;
          if (query.part === 'content') return record.content;
          if (query.part === 'value') return record.value;
          return record.unit;
        },
        getMotionTargets: function () {
          if (instance.destroyed) return [];
          return state.parts.map(function (part) {
            var record = records.get(part.id);
            return record ? {
              id: part.id,
              part: part,
              element: record.unit,
              layoutEl: record.unit,
              unit: record.unit,
              contentEl: record.content,
              valueEl: record.value
            } : null;
          }).filter(Boolean);
        },
        setSceneActive: function (on) {
          if (instance.destroyed) return;
          root.setAttribute('data-note-scene', on === false ? 'false' : 'true');
        }
      };

      function createRecord(part) {
        var unit = createElement('span', 'nui-expression__part');
        var content = createElement('span', 'nui-expression__content');
        var value = createElement('span', 'nui-expression__value');
        content.appendChild(value);
        unit.appendChild(content);
        return {
          unit: unit,
          content: content,
          value: value,
          math: null,
          kind: '',
          text: '',
          part: { id: part.id, tex: part.tex, text: part.text }
        };
      }

      function renderContent(record, part) {
        var kind = part.tex !== undefined ? 'tex' : 'text';
        if (record.kind !== kind) {
          if (record.math) {
            try { record.math.destroy(); } catch (error) { /* ignore */ }
            record.math = null;
          }
          record.value.replaceChildren();
          record.kind = kind;
          record.text = '';
          if (kind === 'tex') {
            var mathHost = createElement('span', 'nui-expression__math');
            record.value.appendChild(mathHost);
            if (NoteUI.Math && typeof NoteUI.Math.mount === 'function') {
              try {
                record.math = NoteUI.Math.mount(mathHost, { tex: part.tex, display: false, label: '公式项' });
              } catch (error) {
                mathHost.textContent = part.tex;
              }
            } else {
              mathHost.textContent = part.tex;
            }
          }
        }
        if (kind === 'tex') {
          if (record.math && typeof record.math.update === 'function' && record.text !== part.tex) {
            try { record.math.update({ tex: part.tex }); } catch (error) { /* 保持可读回原值 */ }
          }
          record.text = part.tex;
          return;
        }
        if (record.text !== part.text) {
          record.value.textContent = part.text;
          record.text = part.text;
        }
      }

      function render() {
        root.setAttribute('data-note-scene', root.getAttribute('data-note-scene') || 'false');
        root.setAttribute('role', 'group');
        var label = state.label || state.parts.map(function (part) {
          return part.tex !== undefined ? '公式项' : part.text;
        }).join(' ');
        if (label) root.setAttribute('aria-label', label);
        else root.removeAttribute('aria-label');
        var wanted = new Set();
        state.parts.forEach(function (part) {
          wanted.add(part.id);
          var record = records.get(part.id);
          if (!record) {
            record = createRecord(part);
            records.set(part.id, record);
            renderContent(record, part);
          }
          var focus = state.focus.indexOf(part.id) >= 0;
          var changed = state.changed.indexOf(part.id) >= 0;
          var mark = focus && changed ? 'both' : (focus ? 'focus' : (changed ? 'changed' : 'none'));
          record.unit.setAttribute('data-part-id', part.id);
          record.unit.setAttribute('data-kind', part.tex !== undefined ? 'tex' : 'text');
          record.unit.setAttribute('data-mark', mark);
          record.content.setAttribute('data-part-content', part.id);
          record.value.setAttribute('data-part-value', part.id);
          if (!samePart(record.part, part)) {
            renderContent(record, part);
            record.part = { id: part.id, tex: part.tex, text: part.text };
          }
          root.appendChild(record.unit);
        });
        records.forEach(function (record, id) {
          if (wanted.has(id)) return;
          if (record.math) {
            try { record.math.destroy(); } catch (error) { /* ignore */ }
          }
          if (record.unit.parentNode) record.unit.parentNode.removeChild(record.unit);
          records.delete(id);
        });
      }

      render();
      host.appendChild(root);
      return instance;
    }
  };
})(window);
