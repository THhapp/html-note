/* NoteUI forms-advanced internal — F09–F15 的私有共享实现（非公开 API）。
   F09–F15 组件文件共用的 DOM、选项、提示/错误、浮层与监听工具集中在本文件，
   避免各组件重复实现。必须先加载 src/core（core.js、floating.js）；
   本文件不承诺任何 NoteUI 公开名称，只通过 NoteUI._formsAdvancedInternal
   在模块内部文件之间共享。
   加载顺序：core → forms-advanced-internal.js → forms-advanced.js →
   forms-advanced-pickers.js → forms-advanced-inputs.js。 */
(function (global) {
  'use strict';

  var NoteCore = global.NoteCore;
  if (!NoteCore) throw new Error('NoteUI forms-advanced 需要 NoteCore（core 模块）。');
  var NoteUI = global.NoteUI = global.NoteUI || {};
  var hasOwn = Object.prototype.hasOwnProperty;

  function own(object, key) {
    return object != null && hasOwn.call(Object(object), key);
  }

  function text(value) {
    return NoteCore.text(value);
  }

  function tokens(value) {
    return text(value).split(/\s+/).filter(Boolean);
  }

  function hintJoin(parts) {
    var cleaned = [];
    (parts || []).forEach(function (part) {
      var value = text(part).trim().replace(/^[；;。.\s]+/, '').replace(/[；;。.\s]+$/, '');
      if (value) cleaned.push(value);
    });
    if (!cleaned.length) return '';
    var joined = cleaned.join('；');
    return /[！？!?]$/.test(cleaned[cleaned.length - 1]) ? joined : joined + '。';
  }

  /* hint + “不可用：原因” + 组件自身的固定格式说明，统一成一句可见提示。 */
  function hintWithReason(state, parts) {
    var values = [];
    if (text(state.hint)) values.push(text(state.hint));
    if (state.disabled && text(state.disabledReason)) values.push('不可用：' + text(state.disabledReason));
    (parts || []).forEach(function (part) {
      if (text(part)) values.push(text(part));
    });
    return hintJoin(values);
  }

  function make(tag, className, content) {
    return NoteCore.el(tag, className, content);
  }

  function uid(prefix) {
    return NoteCore.uid(prefix);
  }

  function validateHost(host) {
    NoteCore.validateHost(host);
  }

  function listen(target) {
    return NoteCore.listeners(target);
  }

  function component(root, state, render, cleanup) {
    return NoteCore.component(root, state, render, cleanup);
  }

  function copy(value) {
    if (Array.isArray(value)) return value.slice();
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
      var output = {};
      Object.keys(value).forEach(function (key) { output[key] = copy(value[key]); });
      return output;
    }
    return value;
  }

  function setHidden(node, hidden) {
    if (!node) return;
    node.hidden = Boolean(hidden);
  }

  function addDescribedBy(node, id) {
    if (!node || !id) return;
    var list = tokens(node.getAttribute('aria-describedby'));
    if (list.indexOf(id) < 0) list.push(id);
    node.setAttribute('aria-describedby', list.join(' '));
  }

  function removeDescribedBy(node, id) {
    if (!node || !id) return;
    var list = tokens(node.getAttribute('aria-describedby')).filter(function (token) {
      return token !== id;
    });
    if (list.length) node.setAttribute('aria-describedby', list.join(' '));
    else node.removeAttribute('aria-describedby');
  }

  function call(fn, value, event) {
    if (typeof fn === 'function') return fn(value, event);
    return undefined;
  }

  function isNode(value) {
    return Boolean(value) && (value.nodeType === 1 || value.nodeType === 3 || value.nodeType === 11);
  }

  function icon(name, size) {
    if (typeof NoteCore.icon !== 'function') return null;
    try {
      var node = NoteCore.icon(name, { size: size || 16, label: null });
      return node || null;
    } catch (error) {
      /* icon names are optional decoration */
      return null;
    }
  }

  function labelRow(prefix, label, required, labelId) {
    var head = make('div', prefix + '__head');
    var labelEl = make('span', prefix + '__label');
    labelEl.id = labelId;
    labelEl.textContent = text(label);
    if (required) {
      var mark = make('span', prefix + '__required', '必填');
      labelEl.appendChild(document.createTextNode(' '));
      labelEl.appendChild(mark);
    }
    head.appendChild(labelEl);
    if (!text(label) && !required) head.hidden = true;
    return head;
  }

  function syncHeadLabel(head, selector, label) {
    if (!head) return;
    var node = head.querySelector(selector);
    if (node) node.textContent = text(label);
    head.hidden = !text(label);
  }

  function messageLine(prefix, suffix, id) {
    var node = make('p', prefix + '__' + suffix);
    if (id) node.id = id;
    node.hidden = true;
    if (suffix === 'error') node.setAttribute('role', 'alert');
    return node;
  }

  /* 选项合并：默认值 + 调用方传入的键；未知键保留在 state 中（与 NoteCore.component
     的程序 update 合并语义一致）。 */
  function readOptions(input, defaults) {
    var state = {};
    Object.keys(defaults).forEach(function (key) { state[key] = defaults[key]; });
    if (input && typeof input === 'object') {
      Object.keys(input).forEach(function (key) { state[key] = input[key]; });
    }
    return state;
  }

  function updateMessage(node, message) {
    if (!node) return false;
    var value = text(message);
    node.textContent = value;
    node.hidden = value === '';
    return value !== '';
  }

  /* 统一同步 hint/错误/反馈文本与 aria-describedby / aria-invalid。
     config: { hintEl, hint, errorEl, error, feedbackEl, feedback, nodes,
               hintId, errorId, feedbackId, hintAlways } */
  function syncMessages(config) {
    var hint = text(config.hint);
    var error = text(config.error);
    var feedback = text(config.feedback);
    updateMessage(config.hintEl, hint);
    updateMessage(config.errorEl, error);
    if (config.feedbackEl) updateMessage(config.feedbackEl, feedback);
    (config.nodes || []).forEach(function (node) {
      if (!node) return;
      if (config.hintId) removeDescribedBy(node, config.hintId);
      if (config.errorId) removeDescribedBy(node, config.errorId);
      if (config.feedbackId) removeDescribedBy(node, config.feedbackId);
      if (config.hintId && (hint || config.hintAlways)) addDescribedBy(node, config.hintId);
      if (config.errorId && error) addDescribedBy(node, config.errorId);
      if (config.feedbackId && feedback) addDescribedBy(node, config.feedbackId);
      if (error) node.setAttribute('aria-invalid', 'true');
      else node.removeAttribute('aria-invalid');
    });
  }

  function externalErrorText(state) {
    return text(state.externalError) || text(state.internalError);
  }

  /* 日期/时间面板共用的 NoteCore.floating 配置：dialog 语义、Tab 焦点约束、
     外点/Esc 关闭、关闭返回触发点、视口限宽。 */
  function createDialogLayer(settings) {
    if (!(NoteCore.floating && typeof NoteCore.floating.create === 'function')) {
      throw new Error((settings.name || 'NoteUI forms-advanced') + ' 需要 NoteCore.floating（core 模块）。');
    }
    var config = settings || {};
    return NoteCore.floating.create({
      anchor: config.anchor,
      content: null,
      placement: 'bottom-start',
      offset: 6,
      role: 'dialog',
      className: config.className,
      modal: false,
      backdrop: false,
      trapFocus: true,
      returnFocus: true,
      closeOnEsc: true,
      closeOnOutside: true,
      lockScroll: false,
      maxWidth: 'calc(100vw - 16px)',
      onOpen: config.onOpen || null,
      onClose: config.onClose || null
    });
  }

  /* 面板打开时，点击触发按钮不应先被 floating 的“外点关闭”处理掉，
     再被组件的 click 重新打开；在 document 捕获阶段拦住这一次 pointerdown。 */
  function guardTriggerPointer(trigger, docEvents, isOpen) {
    docEvents.on('pointerdown', function (event) {
      if (typeof isOpen === 'function' && !isOpen()) return;
      if (event.target === trigger || (trigger.contains && trigger.contains(event.target))) {
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        else event.stopPropagation();
      }
    }, true);
  }

  NoteUI._formsAdvancedInternal = {
    own: own,
    text: text,
    hintJoin: hintJoin,
    hintWithReason: hintWithReason,
    make: make,
    uid: uid,
    validateHost: validateHost,
    listen: listen,
    component: component,
    copy: copy,
    setHidden: setHidden,
    addDescribedBy: addDescribedBy,
    removeDescribedBy: removeDescribedBy,
    call: call,
    isNode: isNode,
    icon: icon,
    labelRow: labelRow,
    syncHeadLabel: syncHeadLabel,
    messageLine: messageLine,
    readOptions: readOptions,
    updateMessage: updateMessage,
    syncMessages: syncMessages,
    externalErrorText: externalErrorText,
    createDialogLayer: createDialogLayer,
    guardTriggerPointer: guardTriggerPointer
  };
})(window);
