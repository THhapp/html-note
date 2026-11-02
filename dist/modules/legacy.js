/*! note-library module: legacy
 * dependencies: core
 * type: JavaScript
 * generated-by: scripts/build.mjs; do-not-edit.
 */

/* ---- source: src/ui/controls.js ---- */
/* NoteUI controls — plain JavaScript, no dependencies. */
(function (global) {
  'use strict';
  var NoteUI = global.NoteUI = global.NoteUI || {};
  var own = function (object, key) { return Object.prototype.hasOwnProperty.call(object, key); };
  function hostElement(host) {
    if (!host || host.nodeType !== 1 || typeof host.appendChild !== 'function') throw new TypeError('NoteUI.mount requires a host element');
    return host;
  }
  function text(value) { return value == null ? '' : String(value); }
  function isNode(value) {
    return !!value && typeof value === 'object' && [1, 3, 11].indexOf(value.nodeType) !== -1;
  }

  /* legacy 模块内部共享 helper（非公开 API）：primitives.js 按 legacy manifest 顺序在
     controls.js 之后加载，复用这里的 DOM/内容小工具；宿主不应依赖 NoteUILegacyInternals。 */
  var legacyInternals = global.NoteUILegacyInternals = global.NoteUILegacyInternals || {};
  legacyInternals.own = own;
  legacyInternals.text = text;
  legacyInternals.element = function (tag, className, content) {
    var node = document.createElement(tag);
    node.className = className;
    if (content !== undefined) node.textContent = content == null ? '' : String(content);
    return node;
  };
  legacyInternals.validateHost = function (host) {
    if (!host || typeof host.appendChild !== 'function' || (host.nodeType !== 1 && host.nodeType !== 11)) {
      throw new TypeError('NoteUI.mount 需要一个元素或 DocumentFragment 容器。');
    }
  };
  legacyInternals.setContent = function (target, value) {
    if (value && typeof value === 'object' && [1, 3, 11].indexOf(value.nodeType) !== -1) {
      if (target.childNodes.length === 1 && target.firstChild === value) return;
      target.replaceChildren(value);
    } else {
      target.textContent = text(value);
    }
  };

  function iconName(icon) {
    if (typeof icon === 'string') return icon.trim();
    if (isNode(icon) && icon.nodeType === 1) {
      var named = icon.getAttribute('aria-label') || icon.getAttribute('title') || icon.getAttribute('data-icon');
      if (named) return text(named).trim();
      var title = icon.querySelector ? icon.querySelector('title') : null;
      if (title) return text(title.textContent).trim();
    }
    return '';
  }
  function resolvedIcon(icon) {
    if (isNode(icon)) return icon;
    if (typeof icon !== 'string' || !icon) return null;
    var resolver = NoteUI.Button.iconResolver;
    var node = null;
    try {
      if (typeof resolver === 'function') node = resolver(icon);
      else if (resolver && typeof resolver === 'object' && own(resolver, icon)) node = resolver[icon];
    } catch (err) {
      node = null;
    }
    return isNode(node) ? node : null;
  }

  NoteUI.Button = {
    // Optional public hook: function (name) -> DOM node, or a { name: node } map.
    // A string icon never throws when this hook is absent; it simply has no glyph.
    iconResolver: null,
    mount: function (host, options) {
      hostElement(host);
      var input = options || {};
      var state = Object.assign({
        label: '按钮', variant: 'secondary', disabled: false, onClick: null,
        icon: null, iconPosition: 'start', iconOnly: false, loading: false,
        focusableDisabled: false,
        ariaLabel: '', title: '', size: 'md'
      }, input);
      var labelWasSet = own(input, 'label');
      var el = document.createElement('button');
      var labelEl = document.createElement('span');
      var iconEl = document.createElement('span');
      var spinnerEl = document.createElement('span');
      var destroyed = false;
      el.type = 'button';
      labelEl.className = 'nui-button__label';
      iconEl.className = 'nui-button__icon';
      iconEl.setAttribute('aria-hidden', 'true');
      spinnerEl.className = 'nui-button__spinner';
      spinnerEl.setAttribute('aria-hidden', 'true');

      function accessibleName(glyphName) {
        var explicit = text(state.ariaLabel).trim();
        if (explicit) return explicit;
        if (!state.iconOnly) return '';
        var label = text(state.label).trim();
        // The built-in default "按钮" is a last-resort name, not a caller label.
        if (label && (labelWasSet || label !== '按钮')) return label;
        if (glyphName) return glyphName;
        return label || '按钮';
      }

      function render() {
        var variant = ['primary', 'secondary', 'quiet'].indexOf(state.variant) >= 0 ? state.variant : 'secondary';
        var position = state.iconPosition === 'end' ? 'end' : 'start';
        var size = state.size === 'sm' ? 'sm' : 'md';
        var glyph = resolvedIcon(state.icon);
        var glyphName = iconName(state.icon);
        var handle = accessibleName(glyphName);
        var className = 'nui-button nui-button--' + variant;
        if (size === 'sm') className += ' nui-button--sm';
        if (state.iconOnly) className += ' nui-button--icon-only';
        if (state.loading) className += ' is-loading';

        var disabled = Boolean(state.disabled);
        /* 默认使用原生 disabled；focusableDisabled 时保留可聚焦的禁用语义，
         * 由事件拦截保证实际不可激活（不是只写 aria-disabled）。 */
        var softDisabled = disabled && Boolean(state.focusableDisabled);
        el.className = className + (disabled ? ' is-disabled' : '');
        el.replaceChildren();
        el.disabled = disabled && !softDisabled;
        if (disabled) el.setAttribute('data-disabled', 'true');
        else el.removeAttribute('data-disabled');
        if (softDisabled) el.setAttribute('aria-disabled', 'true');
        else el.removeAttribute('aria-disabled');
        el.classList.toggle('is-loading', Boolean(state.loading));
        if (state.loading) {
          el.setAttribute('aria-busy', 'true');
        } else {
          el.removeAttribute('aria-busy');
        }
        if (state.loading) el.setAttribute('data-loading', 'true');
        else el.removeAttribute('data-loading');
        if (handle) el.setAttribute('aria-label', handle);
        else el.removeAttribute('aria-label');
        if (text(state.title)) el.title = text(state.title);
        else el.removeAttribute('title');

        if (state.loading) el.appendChild(spinnerEl);
        if (glyph && position === 'start') {
          iconEl.replaceChildren(glyph);
          el.appendChild(iconEl);
        }
        if (!state.iconOnly) {
          labelEl.textContent = text(state.label);
          el.appendChild(labelEl);
        }
        if (glyph && position === 'end') {
          iconEl.replaceChildren(glyph);
          el.appendChild(iconEl);
        }
      }
      function blocked() {
        return Boolean(state.disabled) || Boolean(state.loading) || el.disabled;
      }
      function clicked(event) {
        if (destroyed) return;
        if (blocked()) {
          /* 可聚焦的禁用态也必须完整拦截激活，不能只靠外观。 */
          if (Boolean(state.disabled) && Boolean(state.focusableDisabled) && event && typeof event.preventDefault === 'function') {
            event.preventDefault();
            if (typeof event.stopPropagation === 'function') event.stopPropagation();
          }
          return;
        }
        if (typeof state.onClick === 'function') state.onClick(event);
      }
      function keyed(event) {
        if (destroyed || !event || !blocked()) return;
        if (Boolean(state.disabled) && Boolean(state.focusableDisabled) &&
            (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar')) {
          /* 阻止浏览器由键盘合成 click，避免「可聚焦但实际仍能触发」。 */
          event.preventDefault();
        }
      }
      el.addEventListener('click', clicked);
      el.addEventListener('keydown', keyed);
      render();
      host.appendChild(el);
      return {
        el: el,
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          ['label', 'variant', 'disabled', 'focusableDisabled', 'onClick', 'icon', 'iconPosition', 'iconOnly',
            'loading', 'ariaLabel', 'title', 'size'].forEach(function (key) {
            if (own(patch, key)) {
              state[key] = patch[key];
              if (key === 'label') labelWasSet = true;
            }
          });
          render();
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          el.removeEventListener('click', clicked);
          el.removeEventListener('keydown', keyed);
          el.remove();
        }
      };
    }
  };

  NoteUI.Segmented = {
    mount: function (host, options) {
      hostElement(host);
      var state = Object.assign({ options: [], value: undefined, onChange: null }, options || {});
      var destroyed = false;
      var items = [], buttons = [];
      var el = document.createElement('div');
      el.className = 'nui-segmented';
      el.setAttribute('role', 'radiogroup');
      el.setAttribute('aria-label', host.getAttribute('aria-label') || '分段选择');
      function findValue(value) {
        return items.findIndex(function (item) { return !item.disabled && Object.is(item.value, value); });
      }
      function normalizeValue() {
        if (findValue(state.value) < 0) {
          var first = items.find(function (item) { return !item.disabled; });
          state.value = first ? first.value : undefined;
        }
      }
      function renderSelection() {
        var chosen = findValue(state.value);
        buttons.forEach(function (button, index) {
          var selected = chosen === index;
          button.setAttribute('aria-checked', String(selected));
          button.tabIndex = selected ? 0 : -1;
          button.disabled = items[index].disabled;
        });
      }
      function buildOptions() {
        items = Array.isArray(state.options) ? state.options.filter(function (item) { return item && typeof item === 'object'; }).map(function (item) {
          return { value: item.value, label: item.label == null ? text(item.value) : text(item.label), disabled: Boolean(item.disabled) };
        }) : [];
        el.replaceChildren();
        buttons = items.map(function (item, index) {
          var button = document.createElement('button');
          button.type = 'button';
          button.className = 'nui-segment';
          button.setAttribute('role', 'radio');
          button.dataset.nuiIndex = String(index);
          button.textContent = item.label;
          el.appendChild(button);
          return button;
        });
        normalizeValue();
        renderSelection();
      }
      function select(index, event) {
        if (destroyed || !items[index] || items[index].disabled) return;
        var previous = state.value;
        state.value = items[index].value;
        renderSelection();
        if (!Object.is(previous, state.value) && typeof state.onChange === 'function') state.onChange(state.value, event);
      }
      function clicked(event) {
        var button = event.target.closest('.nui-segment');
        if (!button || button.parentElement !== el || button.disabled) return;
        select(Number(button.dataset.nuiIndex), event);
      }
      function keyed(event) {
        var button = event.target.closest('.nui-segment');
        if (!button || button.parentElement !== el) return;
        var enabled = buttons.map(function (_, index) { return index; }).filter(function (index) { return !items[index].disabled; });
        if (!enabled.length) return;
        var position = enabled.indexOf(Number(button.dataset.nuiIndex));
        var target;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') target = enabled[(position + 1) % enabled.length];
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') target = enabled[(position - 1 + enabled.length) % enabled.length];
        else if (event.key === 'Home') target = enabled[0];
        else if (event.key === 'End') target = enabled[enabled.length - 1];
        else return;
        event.preventDefault();
        buttons[target].focus();
        select(target, event);
      }
      el.addEventListener('click', clicked);
      el.addEventListener('keydown', keyed);
      buildOptions();
      host.appendChild(el);
      return {
        el: el,
        getValue: function () { return state.value; },
        update: function (patch) {
          if (destroyed || !patch || typeof patch !== 'object') return;
          ['options', 'value', 'onChange'].forEach(function (key) { if (own(patch, key)) state[key] = patch[key]; });
          if (own(patch, 'options')) buildOptions();
          else { normalizeValue(); renderSelection(); }
        },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          el.removeEventListener('click', clicked);
          el.removeEventListener('keydown', keyed);
          el.remove();
        }
      };
    }
  };
})(window);

/* ---- source: src/ui/primitives.js ---- */
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

  /* Notice 公开契约：content 为文本或单个 DOM 节点。数组/普通对象不被静默字符串化，
     直接给出可定位的错误；多节点必须先由宿主包进一个容器元素。 */
  function noticeContent(value) {
    if (value == null) return '';
    if (isDomNode(value)) return value;
    if (Array.isArray(value)) {
      throw new TypeError('NoteUI.Notice: content 只接受文本或单个 DOM 节点；多个节点请先用一个容器元素包裹。');
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    throw new TypeError('NoteUI.Notice: content 只接受文本或单个 DOM 节点；收到 ' + Object.prototype.toString.call(value) + '，多节点/对象请先用一个容器元素包裹。');
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
      noticeContent(options.content); /* 挂载时先校验，避免无效输入等到首次 render 才失败 */
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
        if (!patch || own(patch, 'content')) setContent(content, noticeContent(options.content));
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

/* ---- source: src/expr/focus.js ---- */
/*!
 * 关注与范围标记 · 组件核心 v1.0.0
 * 依赖：无（原生 DOM + Web Animations API），file:// 直接可用。
 *
 * 挂载：
 *   var focus = NoteExpr.Focus.mount({ motion: 'auto', zIndex: 1210, accel: 4600 });
 *   focus.show(el);                              // 元素 → 框选
 *   focus.show({ el: p, text: '缓存是否命中' });  // 文本子串 → 下划线
 *   focus.show(otherEl);                         // 已有标记 → 对称加减速迁移
 *   focus.hide();  focus.refresh();  focus.destroy();
 *   var soft = NoteExpr.Focus.mount({ entrance: 'soft' }); // attention 的软出现
 *   await focus.whenArrived();                    // 本次出现/迁移实际完成
 *   await focus.whenHidden();                     // 本次淡出实际完成
 *
 * 会话生命周期（默认舞台 attention 使用；独立用法可不调用）：
 *   focus.weak();        // 仅可见时：取消迁移/逐帧，快速转虚线低强调，保留几何与目标
 *   focus.restore();     // 回到 active；不动几何，恢复活动期逐帧跟随
 *   focus.reanchor(el);  // DOM 重建后静默重测同一逻辑目标，保留 visible/emphasis/arrival
 *   focus.emphasis;      // 只读 'active' | 'weak'
 *   // weak 静止期目标因 DOM 重建临时断开时不 autoHide：保留上一几何，等宿主 reanchor/hide；
 *   // 非 weak 活动期的断开仍按原语义 autoHide。
 *   // 同元素换 range/geometry 有实际几何变化时走正常框迁移（从当前已渲染框承接）；
 *   // 相同/微小抖动几何不重播；reanchor 始终静默重绑定，不因范围变化触发迁移。
 *
 * 只读：focus.el / focus.visible / focus.target / focus.mode / focus.text / focus.emphasis
 * 活动期按目标真实 rect 每帧跟随；weak 静止期停止逐帧，按 resize/滚动/DOM 变更重测。
 * 到达/隐藏句柄由真实迁移完成、WAAPI finished 或实际淡出收尾决定，不使用预计时长冒充完成。
 *
 * 几何契约（视口坐标，叠加层 position:fixed; inset:0）：
 *   框选：框 = 目标 rect 四边各外扩 6px；1.5px 描边画在框内侧（border-box），圆角 8px；
 *   下划线：Range.getClientRects() 每行盒一段（过滤宽 < 1px），
 *           left = rect.left + 1、width = rect.width - 2、top = rect.bottom - 1、高 2px。
 *
 * 动效契约（SPEC §6）：
 *   首次显示默认 220ms 淡入 + 缩放 .97→1；entrance:'soft'（attention 使用）320ms 淡入 + 上浮 5px/.93→1；
 *   下划线逐段 240ms 画出、段间 30ms；框→框迁移使用对称加减速
 *   p(u)=2u² (u≤0.5)、p(u)=1-2(1-u)² (u>0.5)，T=2√(D/accel) 夹 [180,800]ms，
 *   D 为对应角点最大位移（含宽高变化）；取消 150ms 淡出；weak/restore 视觉过渡 ≤160ms；
 *   motion:'never' 或系统减少动效 → 0ms 直落、不建动画/rAF 迁移。
 *
 * 职责边界：只做“当前关注”这一种标记的几何与动效；不判断重点、不自动播放、不显示文字；
 * 不做全局样式、不引用外部资源。实例之间、与 B/C 组件之间不共享 DOM / 变量。
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';

  var EASE_OUT = 'cubic-bezier(.4,0,.2,1)';  /* 淡入 / 淡出 / 下划线画出：可感知的匀速收尾 */

  /* 几何与动效基线（SPEC §4 / §6），集中在此便于核对 */
  var G = {
    pad: 6,           // 框选外扩
    ruleInset: 1,     // 下划线左右内缩
    ruleH: 2,         // 下划线高度（CSS 中同样固定为 2px）
    showBoxDur: 220,  // 框首次淡入 + 缩放
    showBoxSoftDur: 320, // attention 的软收束出现
    showRuleDur: 240, // 下划线单段画出
    ruleStagger: 30,  // 段间延迟
    migrateMinDur: 180,
    migrateMaxDur: 800,
    accelDefault: 4600, // 对称迁移默认加速度 px/s²（mount.accel 可覆盖；依据 100/300/600/900px 实测校准）
    migrateOutDur: 120, // 迁移时旧下划线淡出
    hideDur: 150,
    eps: 0.5          // 重测量比较阈值
  };

  var DOC = global.document;
  var SHOW_TEXT = 4; // NodeFilter.SHOW_TEXT，避免依赖 NodeFilter 全局

  /* ---------------- 小工具 ---------------- */

  function h(tag, cls) {
    var node = DOC.createElement(tag);
    if (cls) node.className = cls;
    return node;
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function px(n) {
    return round1(n) + 'px';
  }

  function isEl(node) {
    return !!node && node.nodeType === 1;
  }

  function isConnected(node) {
    if (!node) return false;
    if (typeof node.isConnected === 'boolean') return node.isConnected;
    return !!(DOC.documentElement && DOC.documentElement.contains(node));
  }

  function fail(message) {
    throw new Error('NoteExpr.Focus: ' + message);
  }

  /* scene 受控测量：geometry.rect 由宿主提供（冻结目标几何）；缺省走原生 rect。 */
  function normalizeGeometry(input) {
    if (input && typeof input === 'object' && typeof input.rect === 'function') return input;
    return null;
  }

  function readRect(el, geometry) {
    if (geometry && typeof geometry.rect === 'function') return geometry.rect(el);
    return el.getBoundingClientRect();
  }

  function removeNode(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  /* ---------------- 文本定位 ---------------- */

  /* 把 textContent 中的字符下标映射回 (textNode, offset)；跨内联元素时同样成立 */
  function pointAt(nodes, pos, isEnd) {
    var i;
    var entry;
    for (i = 0; i < nodes.length; i++) {
      entry = nodes[i];
      if (isEnd) {
        if (pos > entry.start && pos <= entry.end) {
          return { node: entry.node, offset: pos - entry.start };
        }
      } else if (pos >= entry.start && pos < entry.end) {
        return { node: entry.node, offset: pos - entry.start };
      }
    }
    if (!nodes.length) return null;
    var last = nodes[nodes.length - 1];
    return { node: last.node, offset: isEnd ? last.end - last.start : 0 };
  }

  /* 返回覆盖 needle 首次出现的 Range；找不到返回 null。定位口径 = element.textContent 首次出现 */
  function findRange(el, needle) {
    var walker = DOC.createTreeWalker(el, SHOW_TEXT, null);
    var nodes = [];
    var text = '';
    var node;
    while ((node = walker.nextNode())) {
      var value = node.nodeValue || '';
      nodes.push({ node: node, start: text.length, end: text.length + value.length });
      text += value;
    }
    var from = text.indexOf(needle);
    if (from < 0) return null;
    var to = from + needle.length;
    var start = pointAt(nodes, from, false);
    var end = pointAt(nodes, to, true);
    if (!start || !end) return null;
    var range = DOC.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return range;
  }

  /* Range 每行盒 → 下划线几何（过滤宽 < 1px 的空行盒） */
  function rangeRects(range) {
    var out = [];
    var list;
    try {
      list = range.getClientRects();
    } catch (err) {
      return out;
    }
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!(r.width >= 1)) continue;
      out.push({
        left: r.left + G.ruleInset,
        top: r.bottom - 1,
        width: Math.max(0, r.width - G.ruleInset * 2)
      });
    }
    return out;
  }

  /* ---------------- 测量 ---------------- */

  function roundBox(box) {
    return {
      left: round1(box.left),
      top: round1(box.top),
      width: round1(box.width),
      height: round1(box.height)
    };
  }

  function measureSpec(spec, geometry) {
    if (!isEl(spec.el)) fail('目标必须是 DOM 元素');
    if (!isConnected(spec.el)) fail('目标元素不在文档中');
    if (spec.mode === 'underline') {
      var raw = null;
      if (geometry && typeof geometry.textRects === 'function') {
        raw = geometry.textRects(spec.el, spec.text);
        raw = Array.isArray(raw) ? raw.map(function (r) {
          return { left: r.left + G.ruleInset, top: r.bottom - 1, width: Math.max(0, r.width - G.ruleInset * 2) };
        }) : [];
      } else {
        var range = findRange(spec.el, spec.text);
        if (!range) fail('在目标元素中找不到文本「' + spec.text + '」');
        raw = rangeRects(range);
      }
      if (!raw.length) fail('文本「' + spec.text + '」没有可见行盒');
      var rects = [];
      for (var i = 0; i < raw.length; i++) {
        rects.push({ left: round1(raw[i].left), top: round1(raw[i].top), width: round1(raw[i].width) });
      }
      return { kind: 'underline', rects: rects };
    }
    var r = readRect(spec.el, geometry);
    return {
      kind: 'box',
      box: roundBox({
        left: r.left - G.pad,
        top: r.top - G.pad,
        width: r.width + G.pad * 2,
        height: r.height + G.pad * 2
      })
    };
  }

  function geoSame(a, b) {
    if (!a || !b || a.kind !== b.kind) return false;
    var i;
    var k;
    if (a.kind === 'box') {
      var keys = ['left', 'top', 'width', 'height'];
      for (i = 0; i < keys.length; i++) {
        if (Math.abs((a.box[keys[i]] || 0) - (b.box[keys[i]] || 0)) > G.eps) return false;
      }
      return true;
    }
    if (a.rects.length !== b.rects.length) return false;
    var segKeys = ['left', 'top', 'width'];
    for (i = 0; i < a.rects.length; i++) {
      for (k = 0; k < segKeys.length; k++) {
        if (Math.abs((a.rects[i][segKeys[k]] || 0) - (b.rects[i][segKeys[k]] || 0)) > G.eps) return false;
      }
    }
    return true;
  }

  /* ---------------- 参数校验 ---------------- */

  function normalizeSpec(arg) {
    if (isEl(arg)) return { el: arg, mode: 'box', text: null };
    if (arg && typeof arg === 'object') {
      if (!isEl(arg.el)) fail('show() 需要 DOM 元素：show(el) 或 show({ el, text, mode })');
      var forced = arg.mode === undefined || arg.mode === null ? '' : String(arg.mode);
      if (forced && forced !== 'box' && forced !== 'underline') {
        fail('show() 的 mode 只能是 "box" 或 "underline"');
      }
      var text = arg.text === undefined || arg.text === null ? null : String(arg.text);
      if (forced === 'underline') {
        if (!text) fail('下划线模式需要非空的 text');
        return { el: arg.el, mode: 'underline', text: text };
      }
      if (forced === 'box') return { el: arg.el, mode: 'box', text: null };
      if (text === null) return { el: arg.el, mode: 'box', text: null };
      if (text === '') fail('text 不能是空字符串');
      return { el: arg.el, mode: 'underline', text: text };
    }
    fail('show() 需要目标元素或 { el, text, mode }');
  }

  /* ---------------- 实例 ---------------- */

  function mount(options) {
    if (!DOC || !DOC.body) fail('当前环境没有 document.body，无法挂载');
    options = options || {};

    var motionMode = options.motion === 'never' || options.motion === 'always' ? options.motion : 'auto';
    var entranceMode = options.entrance === 'soft' ? 'soft' : 'default';
    var observeEnabled = options.observe !== false;
    var mountGeometry = normalizeGeometry(options.geometry);
    var specGeometry = null;   // 本次 show/reanchor 的 spec.geometry；为空时回退 mountGeometry
    var accel = Number(options.accel);
    if (!isFinite(accel) || accel <= 0) accel = G.accelDefault;
    var reduceMq = null;
    try {
      reduceMq = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
    } catch (err) {
      reduceMq = null;
    }

    var root = h('div', 'nx-focus');
    root.setAttribute('data-nx-component', 'focus');
    root.setAttribute('data-nx-state', 'idle');
    root.setAttribute('data-nx-emphasis', 'active');
    root.setAttribute('aria-hidden', 'true');
    if (typeof options.zIndex === 'number' && isFinite(options.zIndex)) {
      root.style.zIndex = String(Math.round(options.zIndex));
    }
    DOC.body.appendChild(root);

    var destroyed = false;
    var visible = false;
    var hiding = false;
    var spec = null;       // 当前目标描述 { el, mode, text }
    var targetEl = null;
    var mode = null;
    var text = null;
    var boxEl = null;
    var ruleNodes = [];
    var staleNodes = [];
    var animations = [];
    var lastGeo = null;
    var rafId = 0;
    var followId = 0;
    var currentArrival = null;
    var currentHide = null;
    var hideWaiters = [];
    var emphasis = 'active';   // 'active' | 'weak'
    var migration = null;      // 框→框对称迁移的当前句柄 { raf, startRect, duration, startTime, arrival }
    var listenersOn = false;
    var resizeObserver = null;
    var mutationObserver = null;
    var reduceListening = false;

    var view = { el: root, version: VERSION };

    /* ---------- 动效能力与登记 ---------- */

    function canAnimate() {
      if (motionMode === 'never') return false;
      if (motionMode === 'always') return true;
      return !(reduceMq && reduceMq.matches);
    }

    function removeAnim(anim) {
      var i = animations.indexOf(anim);
      if (i >= 0) animations.splice(i, 1);
    }

    function deferred() {
      var value = { resolved: false, resolve: null, promise: null };
      value.promise = new Promise(function (resolve) { value.resolve = resolve; });
      return value;
    }

    function resolveDeferred(value, result) {
      if (!value || value.resolved) return;
      value.resolved = true;
      value.resolve(result);
    }

    function resolveArrival(value, result) {
      if (currentArrival !== value) return;
      resolveDeferred(value, result);
      if (result) startFollow();
      else stopFollow();
    }

    function resolveHidden(value, result) {
      if (currentHide !== value) return;
      resolveDeferred(value, result);
      currentHide = null;
    }

    /* 淡出进行中再次 hide() 时，后到的 whenHidden() 也应在同一次实际收尾时完成。 */
    function resolveHideWaiters(result) {
      var waiters = hideWaiters;
      hideWaiters = [];
      for (var i = 0; i < waiters.length; i += 1) resolveDeferred(waiters[i], result);
    }

    function play(node, frames, timing, onDone) {
      if (!node || typeof node.animate !== 'function') return null;
      var anim;
      try {
        anim = node.animate(frames, timing);
      } catch (err) {
        return null;
      }
      animations.push(anim);
      anim.finished.then(function () {
        removeAnim(anim);
        if (!destroyed && typeof onDone === 'function') onDone();
      }).catch(function () { /* 被取消：不回调 */ });
      return anim;
    }

    function cancelAnimations() {
      if (!animations.length) return;
      var list = animations.slice();
      animations.length = 0;
      for (var i = 0; i < list.length; i++) {
        try { list[i].cancel(); } catch (err) { /* 已结束 */ }
      }
    }

    function addStale(node) {
      if (node) staleNodes.push(node);
    }

    function purgeStale() {
      for (var i = 0; i < staleNodes.length; i++) removeNode(staleNodes[i]);
      staleNodes.length = 0;
    }

    function fadeOne(node, duration) {
      if (!node || !node.parentNode) return;
      addStale(node);
      play(node, [{ opacity: '1' }, { opacity: '0' }], { duration: duration, easing: EASE_OUT }, function () {
        var i = staleNodes.indexOf(node);
        if (i >= 0) staleNodes.splice(i, 1);
        removeNode(node);
      });
    }

    function fadeOut(nodes, duration) {
      for (var i = 0; i < nodes.length; i++) fadeOne(nodes[i], duration);
    }

    /* 取消进行中的动画并清掉正在淡出的旧节点；基础样式已经是终态 */
    function settleMotion() {
      cancelAnimations();
      purgeStale();
    }

    /* ---------- 标记节点 ---------- */

    function setBoxGeometry(box, geo) {
      box.style.left = px(geo.left);
      box.style.top = px(geo.top);
      box.style.width = px(Math.max(0, geo.width));
      box.style.height = px(Math.max(0, geo.height));
    }

    function setRuleGeometry(node, seg) {
      node.style.left = px(seg.left);
      node.style.top = px(seg.top);
      node.style.width = px(Math.max(0, seg.width));
    }

    function ensureBox() {
      if (!boxEl) {
        boxEl = h('div', 'nx-focus__box');
        root.appendChild(boxEl);
      }
      return boxEl;
    }

    function removeBox() {
      removeNode(boxEl);
      boxEl = null;
    }

    function removeRules() {
      for (var i = 0; i < ruleNodes.length; i++) removeNode(ruleNodes[i]);
      ruleNodes = [];
    }

    function createRules(rects) {
      var nodes = [];
      for (var i = 0; i < rects.length; i++) {
        var node = h('div', 'nx-focus__rule');
        setRuleGeometry(node, rects[i]);
        root.appendChild(node);
        nodes.push(node);
      }
      return nodes;
    }

    function syncRules(rects) {
      if (ruleNodes.length !== rects.length) {
        removeRules();
        ruleNodes = createRules(rects);
        return;
      }
      for (var i = 0; i < ruleNodes.length; i++) setRuleGeometry(ruleNodes[i], rects[i]);
    }

    function clearMarker() {
      removeBox();
      removeRules();
    }

    /* 无动画地落到测量结果（refresh / 重复 show / 布局跟随） */
    function applyGeoNoMotion(geo) {
      if (geo.kind === 'box') {
        if (ruleNodes.length) removeRules();
        setBoxGeometry(ensureBox(), geo.box);
      } else {
        removeBox();
        syncRules(geo.rects);
      }
      lastGeo = geo;
    }

    /* ---------- 强调状态（会话 Focus 的 weak/restore） ---------- */

    function applyEmphasis(value) {
      if (emphasis === value) return;
      emphasis = value;
      root.setAttribute('data-nx-emphasis', value);
    }

    function currentGeometry() {
      return specGeometry || mountGeometry;
    }

    /* 当前已渲染框几何：迁移中 lastGeo 仍是上一次终点，必须读实际 DOM；
       reanchor/show 从渲染中间态承接，避免先跳到旧终点。 */
    function renderedBoxRect() {
      if (!boxEl) return null;
      var style = boxEl.style;
      var left = parseFloat(style.left);
      var top = parseFloat(style.top);
      var width = parseFloat(style.width);
      var height = parseFloat(style.height);
      if (!isFinite(left) || !isFinite(top) || !isFinite(width) || !isFinite(height)) return null;
      return { left: left, top: top, width: width, height: height };
    }

    /* 当前框的几何快照：优先渲染值；无框时用 lastGeo（两者都为视口坐标）。 */
    function currentBoxGeo() {
      var rendered = renderedBoxRect();
      if (rendered) return { kind: 'box', box: rendered };
      if (lastGeo && lastGeo.kind === 'box') return lastGeo;
      return null;
    }

    /* ---------- 对称加减速框迁移 ---------- */

    var BOX_CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];

    function boxDistance(from, to) {
      var max = 0;
      for (var i = 0; i < BOX_CORNERS.length; i += 1) {
        var c = BOX_CORNERS[i];
        var ax = from.left + from.width * c[0];
        var ay = from.top + from.height * c[1];
        var bx = to.left + to.width * c[0];
        var by = to.top + to.height * c[1];
        var d = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
        if (d > max) max = d;
      }
      return max;
    }

    function symmetricProgress(u) {
      if (u <= 0) return 0;
      if (u >= 1) return 1;
      if (u <= 0.5) return 2 * u * u;
      var rest = 1 - u;
      return 1 - 2 * rest * rest;
    }

    function lerpBox(from, to, p) {
      return {
        left: from.left + (to.left - from.left) * p,
        top: from.top + (to.top - from.top) * p,
        width: from.width + (to.width - from.width) * p,
        height: from.height + (to.height - from.height) * p
      };
    }

    function migrationDuration(distance) {
      var seconds = 2 * Math.sqrt(distance / accel);
      var ms = seconds * 1000;
      if (!isFinite(ms)) return G.migrateMaxDur;
      return Math.max(G.migrateMinDur, Math.min(G.migrateMaxDur, ms));
    }

    function cancelMigration() {
      var m = migration;
      migration = null;
      if (!m) return null;
      if (m.raf) {
        try { global.cancelAnimationFrame(m.raf); } catch (err) { /* ignore */ }
        m.raf = 0;
      }
      return m;
    }

    function finishMigration(finalBox) {
      var m = migration;
      if (!m) return;
      migration = null;
      if (finalBox) applyGeoNoMotion({ kind: 'box', box: finalBox });
      if (m.arrival) resolveArrival(m.arrival, true);
      startFollow();
    }

    function beginBoxMigration(fromBox, toBox, arrival) {
      var distance = boxDistance(fromBox, toBox);
      if (!(distance >= G.eps)) return false;
      var m = {
        raf: 0,
        startRect: { left: fromBox.left, top: fromBox.top, width: fromBox.width, height: fromBox.height },
        duration: migrationDuration(distance),
        startTime: 0,
        arrival: arrival
      };
      var box = ensureBox();
      setBoxGeometry(box, m.startRect);
      migration = m;
      stopFollow();
      function tick(timestamp) {
        if (migration !== m || destroyed || !visible || hiding || emphasis !== 'active' || !spec) return;
        m.raf = 0;
        if (!m.startTime) m.startTime = timestamp;
        var geo;
        try {
          geo = measureSpec(spec, currentGeometry());
        } catch (err) {
          autoHide();
          return;
        }
        if (geo.kind !== 'box') {
          applyGeoNoMotion(geo);
          finishMigration(null);
          return;
        }
        var u = m.duration > 0 ? Math.min(1, (timestamp - m.startTime) / m.duration) : 1;
        setBoxGeometry(ensureBox(), lerpBox(m.startRect, geo.box, symmetricProgress(u)));
        if (u < 1) {
          m.raf = global.requestAnimationFrame(tick);
          return;
        }
        finishMigration(geo.box);
      }
      m.raf = global.requestAnimationFrame(tick);
      return true;
    }

    function drawRules(nodes, baseDelay) {
      for (var i = 0; i < nodes.length; i++) {
        play(nodes[i], [
          { clipPath: 'inset(0 100% 0 0)' },
          { clipPath: 'inset(0 0 0 0)' }
        ], {
          duration: G.showRuleDur,
          delay: (baseDelay || 0) + i * G.ruleStagger,
          easing: EASE_OUT
        });
      }
    }

    function firstShowAnim(box) {
      if (entranceMode === 'soft') {
        play(box, [
          { opacity: '0', transform: 'translateY(5px) scale(.93)' },
          { opacity: '1', transform: 'translateY(0) scale(1)' }
        ], { duration: G.showBoxSoftDur, easing: 'cubic-bezier(.2,.8,.3,1)' });
        return;
      }
      play(box, [
        { opacity: '0', transform: 'scale(.97)' },
        { opacity: '1', transform: 'scale(1)' }
      ], { duration: G.showBoxDur, easing: EASE_OUT });
    }

    /* ---------- 三种出现方式 ---------- */

    function showFirst(geo, animate) {
      if (geo.kind === 'box') {
        var box = ensureBox();
        setBoxGeometry(box, geo.box);
        if (animate) firstShowAnim(box);
        return;
      }
      ruleNodes = createRules(geo.rects);
      if (animate) drawRules(ruleNodes, 0);
    }

    /* 同模式不同文本的下划线：旧段淡出、新段逐行画出；框→框走 beginBoxMigration */
    function showMigrate(geo, animate) {
      var oldRules = ruleNodes;
      ruleNodes = createRules(geo.rects);
      if (!animate) {
        for (var i = 0; i < oldRules.length; i++) removeNode(oldRules[i]);
        return;
      }
      if (oldRules.length) fadeOut(oldRules, G.migrateOutDur);
      drawRules(ruleNodes, 0);
    }

    function showCrossfade(geo, animate) {
      var oldNodes = [];
      var i;
      if (boxEl) {
        oldNodes.push(boxEl);
        boxEl = null;
      }
      for (i = 0; i < ruleNodes.length; i++) oldNodes.push(ruleNodes[i]);
      ruleNodes = [];
      if (animate) {
        fadeOut(oldNodes, G.migrateOutDur);
      } else {
        for (i = 0; i < oldNodes.length; i++) removeNode(oldNodes[i]);
      }
      if (geo.kind === 'box') {
        var box = ensureBox();
        setBoxGeometry(box, geo.box);
        if (animate) firstShowAnim(box);
      } else {
        ruleNodes = createRules(geo.rects);
        if (animate) drawRules(ruleNodes, 0);
      }
    }

    /* ---------- 测量调度 ---------- */

    /* 焦点框到达后持续跟随目标：目标在布局/内容动画中移动或改尺寸时，
     * 直接按真实 rect 更新，避免观察器离散重测造成跳格。 */
    function stopFollow() {
      if (followId) {
        try { global.cancelAnimationFrame(followId); } catch (err) { /* ignore */ }
        followId = 0;
      }
    }

    function startFollow() {
      if (followId || destroyed || !visible || hiding || !observeEnabled) return;
      if (emphasis !== 'active' || migration) return;   // weak 静止期与迁移中不跑逐帧
      followId = global.requestAnimationFrame(followTick);
    }

    function followTick() {
      followId = 0;
      if (destroyed || !visible || hiding || !spec) return;
      if (emphasis !== 'active' || migration) return;
      if (!isConnected(targetEl)) {
        autoHide();
        return;
      }
      if (!animations.length) {
        var geo;
        try {
          geo = measureSpec(spec, currentGeometry());
        } catch (err) {
          autoHide();
          return;
        }
        if (!geoSame(geo, lastGeo)) applyGeoNoMotion(geo);
      }
      startFollow();
    }

    function scheduleMeasure() {
      if (destroyed || rafId || !visible) return;
      rafId = global.requestAnimationFrame(function () {
        rafId = 0;
        if (destroyed || !visible) return;
        measureNow();
      });
    }

    function cancelFrame() {
      if (rafId) {
        try { global.cancelAnimationFrame(rafId); } catch (err) { /* ignore */ }
        rafId = 0;
      }
    }

    /* 滚动 / 尺寸变化 / DOM 变化的统一重定位：不播动画；几何变了就取消进行中的动画落终态 */
    function measureNow() {
      if (destroyed || !visible || !spec || migration) return;
      if (!isConnected(targetEl)) {
        /* weak 静止期由宿主在 DOM 重建后 reanchor；这里保留上一可见几何与目标引用，
           不把“临时断开”误判成结束。非 weak 的活动期仍保持原 autoHide。 */
        if (emphasis === 'weak') return;
        autoHide();
        return;
      }
      /* 已显示时由 rAF 跟随；不要用观察器的离散重测中断焦点动画。 */
      if (followId) return;
      var geo;
      try {
        geo = measureSpec(spec, currentGeometry());
      } catch (err) {
        autoHide();
        return;
      }
      if (geoSame(geo, lastGeo)) return;
      settleMotion();
      applyGeoNoMotion(geo);
    }

    /* ---------- 监听器与观察器（仅显示期间存在） ---------- */

    function attach() {
      if (destroyed) return;
      if (!observeEnabled) {
        /* 受控模式：不挂滚动/尺寸/DOM 自动重测；refresh() 仍由宿主手动调用。 */
        detach();
        return;
      }
      if (!listenersOn) {
        try {
          global.addEventListener('scroll', onViewportEvent, { capture: true, passive: true });
          global.addEventListener('resize', onViewportEvent, { passive: true });
          listenersOn = true;
        } catch (err) {
          listenersOn = false;
        }
      }
      if (typeof global.ResizeObserver === 'function') {
        if (!resizeObserver) resizeObserver = new global.ResizeObserver(onViewportEvent);
        try {
          resizeObserver.disconnect();
          resizeObserver.observe(targetEl);
        } catch (err) { /* ignore */ }
      }
      if (typeof global.MutationObserver === 'function' && DOC.body) {
        if (!mutationObserver) mutationObserver = new global.MutationObserver(onViewportEvent);
        try {
          mutationObserver.disconnect();
          mutationObserver.observe(DOC.body, { childList: true, subtree: true, characterData: true });
        } catch (err) { /* ignore */ }
      }
    }

    function detach() {
      stopFollow();
      if (listenersOn) {
        try {
          global.removeEventListener('scroll', onViewportEvent, true);
          global.removeEventListener('resize', onViewportEvent);
        } catch (err) { /* ignore */ }
        listenersOn = false;
      }
      if (resizeObserver) {
        try { resizeObserver.disconnect(); } catch (err) { /* ignore */ }
      }
      if (mutationObserver) {
        try { mutationObserver.disconnect(); } catch (err) { /* ignore */ }
      }
      cancelFrame();
    }

    function onViewportEvent() {
      if (!observeEnabled) return;
      scheduleMeasure();
    }

    function onReduceChange() {
      if (destroyed || canAnimate()) return;
      if (hiding) {
        cancelAnimations();
        purgeStale();
        finishHide();
        return;
      }
      if (visible) {
        var interrupted = cancelMigration();
        settleMotion();
        if (spec) {
          try {
            applyGeoNoMotion(measureSpec(spec, currentGeometry()));
            if (interrupted) resolveArrival(currentArrival, true);
          } catch (err) {
            autoHide();
            return;
          }
        }
        startFollow();
      }
    }

    /* ---------- 状态收尾 ---------- */

    function resetStateAttributes() {
      root.setAttribute('data-nx-state', 'idle');
      root.removeAttribute('data-nx-mode');
      applyEmphasis('active');
    }

    function resetTarget() {
      targetEl = null;
      spec = null;
      mode = null;
      text = null;
      lastGeo = null;
    }

    function finishHide() {
      if (destroyed) return;
      cancelMigration();
      var hidden = currentHide;
      hiding = false;
      cancelAnimations();
      purgeStale();
      clearMarker();
      resetStateAttributes();
      resetTarget();
      stopFollow();
      if (hidden) resolveHidden(hidden, true);
      resolveHideWaiters(true);
    }

    function autoHide() {
      if (destroyed) return;
      if (!visible && !hiding) return;
      cancelMigration();
      visible = false;
      hiding = false;
      detach();
      cancelAnimations();
      purgeStale();
      clearMarker();
      resetStateAttributes();
      resetTarget();
      stopFollow();
      if (currentArrival) resolveDeferred(currentArrival, false);
      if (currentHide) resolveHidden(currentHide, true);
      resolveHideWaiters(true);
    }

    /* ---------- 会话生命周期：weak / restore / reanchor ---------- */

    function weak(options) {
      if (destroyed || !visible || !spec) return view;
      var interrupted = cancelMigration();
      stopFollow();
      var geo = null;
      try {
        geo = measureSpec(spec, currentGeometry());
      } catch (err) {
        if (!isConnected(targetEl)) {
          /* DOM 重建导致的临时断开：保留上一可见几何，由宿主 reanchor/hide 决定。 */
          if (interrupted) resolveArrival(currentArrival, true);
          applyEmphasis('weak');
          return view;
        }
        autoHide();
        return view;
      }
      applyGeoNoMotion(geo);
      applyEmphasis('weak');
      if (interrupted) resolveArrival(currentArrival, true); // 迁移被取消视为已落当前几何
      return view;
    }

    function restore(options) {
      if (destroyed || !visible || !spec) return view;
      if (!isConnected(targetEl)) {
        /* weak 期间 DOM 重建导致 target 仍未连通：保持 weak 与上一几何，不替宿主决定
           “报错还是隐藏”；宿主应先 reanchor(newEl) 再 restore，或直接 hide。 */
        return view;
      }
      applyEmphasis('active');
      startFollow();
      return view;
    }

    function reanchor(arg) {
      if (destroyed) return view;
      var specIsObject = arg && typeof arg === 'object' && !isEl(arg);
      var next = arg == null ? spec : normalizeSpec(arg);
      if (!next) fail('reanchor() 需要目标元素或 { el, text, mode }');
      if (specIsObject && Object.prototype.hasOwnProperty.call(arg, 'geometry')) {
        specGeometry = normalizeGeometry(arg.geometry);
      }
      var geo = measureSpec(next, currentGeometry());   // 缺失/断开先抛，不改内部状态
      targetEl = next.el;
      spec = next;
      mode = next.mode;
      text = next.text;
      if (!visible) return view;
      root.setAttribute('data-nx-mode', mode);
      attach();
      if (migration) return view;   // 迁移循环下一帧起沿用新目标，不重启、不改 arrival
      if (!animations.length && !hiding) applyGeoNoMotion(geo);
      return view;
    }

    /* ---------- 公开方法 ---------- */

    function show(arg) {
      if (destroyed) return view;
      var previousHide = currentHide;
      if (previousHide) resolveHidden(previousHide, true);
      var next = normalizeSpec(arg); // 校验失败先抛，不改内部状态
      var specIsObject = arg && typeof arg === 'object' && !isEl(arg);
      if (specIsObject) {
        if (Object.prototype.hasOwnProperty.call(arg, 'observe')) observeEnabled = arg.observe !== false;
        if (Object.prototype.hasOwnProperty.call(arg, 'geometry')) specGeometry = normalizeGeometry(arg.geometry);
      } else {
        specGeometry = null;   // 纯元素：回退 mount geometry / 原生 rect
      }
      var geo = measureSpec(next, currentGeometry());   // 找不到文本同样先抛
      var prevVisible = visible;
      var prevMode = mode;
      var prevGeo = lastGeo;
      var renderedGeo = currentBoxGeo();   // 迁移中为当前已渲染框，而不是旧终点
      var same = prevVisible && !!spec && targetEl === next.el &&
        mode === next.mode && (text || '') === (next.text || '') &&
        geoSame(geo, renderedGeo || prevGeo);   // 同对象换 range/geometry 有实际变化要走迁移
      var animate = canAnimate();
      var arrival = deferred();
      var previousArrival = currentArrival;
      currentArrival = arrival;
      if (previousArrival && !previousArrival.resolved) resolveDeferred(previousArrival, false);

      cancelMigration();
      settleMotion();
      hiding = false;
      applyEmphasis('active');   // weak → active 同步完成，不另等恢复动画
      if (!prevVisible) clearMarker();
      resolveHideWaiters(true);

      targetEl = next.el;
      mode = next.mode;
      text = next.text;
      spec = next;
      visible = true;
      root.setAttribute('data-nx-state', 'shown');
      root.setAttribute('data-nx-mode', mode);

      var migrating = false;
      if (same) {
        applyGeoNoMotion(geo);
      } else if (!prevVisible) {
        showFirst(geo, animate);   // hide() 后再 show：完整首次出现（soft 320ms / 普通 220ms）
      } else if (prevMode === mode && mode === 'box') {
        var fromBox = renderedGeo && renderedGeo.kind === 'box' ? renderedGeo.box
          : (prevGeo && prevGeo.kind === 'box' ? prevGeo.box : null);
        migrating = !!(animate && fromBox && beginBoxMigration(fromBox, geo.box, arrival));
        if (!migrating) applyGeoNoMotion(geo);
      } else if (prevMode === mode) {
        showMigrate(geo, animate);
      } else {
        showCrossfade(geo, animate);
      }
      if (!migrating) lastGeo = geo;
      attach();
      if (migrating) return view;   // 到达句柄由迁移完成结算
      var created = animations.slice();
      if (!animate || !created.length) {
        resolveArrival(arrival, true);
      } else {
        var remaining = created.length;
        var done = function () {
          remaining -= 1;
          if (remaining <= 0) resolveArrival(arrival, true);
        };
        for (var ai = 0; ai < created.length; ai += 1) {
          created[ai].finished.then(done, done);
        }
      }
      startFollow();
      return view;
    }

    function hide() {
      var hideToken = deferred();
      if (destroyed) {
        resolveDeferred(hideToken, true);
        return view;
      }
      if (hiding) {
        hideWaiters.push(hideToken);
        return view;
      }
      var previousHide = currentHide;
      if (previousHide) resolveHidden(previousHide, true);
      currentHide = hideToken;
      if (!visible) {
        resolveHidden(hideToken, true);
        return view;
      }
      cancelMigration();
      resolveArrival(currentArrival, false);
      visible = false;
      detach();
      settleMotion();
      var nodes = [];
      if (boxEl) nodes.push(boxEl);
      for (var i = 0; i < ruleNodes.length; i++) nodes.push(ruleNodes[i]);
      if (!nodes.length || !canAnimate()) {
        finishHide();
        return view;
      }
      hiding = true;
      var remaining = nodes.length;
      var done = function () {
        remaining -= 1;
        if (remaining <= 0) finishHide();
      };
      for (var j = 0; j < nodes.length; j++) {
        play(nodes[j], [{ opacity: '1' }, { opacity: '0' }], { duration: G.hideDur, easing: EASE_OUT }, done);
      }
      return view;
    }

    function refresh() {
      if (destroyed || !visible || !spec) return view;
      if (!isConnected(targetEl)) {
        autoHide();
        return view;
      }
      var interrupted = cancelMigration();
      settleMotion();
      var geo;
      try {
        geo = measureSpec(spec, currentGeometry());
      } catch (err) {
        autoHide();
        return view;
      }
      applyGeoNoMotion(geo);
      if (interrupted && currentArrival) resolveArrival(currentArrival, true);
      startFollow();
      return view;
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      visible = false;
      hiding = false;
      cancelMigration();
      applyEmphasis('active');
      detach();
      cancelAnimations();
      purgeStale();
      clearMarker();
      stopFollow();
      if (currentArrival) resolveDeferred(currentArrival, false);
      if (currentHide) resolveHidden(currentHide, true);
      resolveHideWaiters(true);
      if (reduceListening && reduceMq) {
        try {
          if (typeof reduceMq.removeEventListener === 'function') reduceMq.removeEventListener('change', onReduceChange);
          else if (typeof reduceMq.removeListener === 'function') reduceMq.removeListener(onReduceChange);
        } catch (err) { /* ignore */ }
        reduceListening = false;
      }
      removeNode(root);
      resetTarget();
    }

    view.show = show;
    view.hide = hide;
    view.refresh = refresh;
    view.weak = weak;
    view.restore = restore;
    view.reanchor = reanchor;
    view.destroy = destroy;
    view.whenArrived = function () {
      return currentArrival ? currentArrival.promise : Promise.resolve(visible);
    };
    view.whenHidden = function () {
      return currentHide ? currentHide.promise : Promise.resolve(!visible);
    };
    Object.defineProperty(view, 'visible', { get: function () { return visible; }, enumerable: true });
    Object.defineProperty(view, 'target', { get: function () { return targetEl; }, enumerable: true });
    Object.defineProperty(view, 'mode', { get: function () { return mode; }, enumerable: true });
    Object.defineProperty(view, 'text', { get: function () { return text; }, enumerable: true });
    Object.defineProperty(view, 'emphasis', { get: function () { return emphasis; }, enumerable: true });

    if (reduceMq) {
      try {
        if (typeof reduceMq.addEventListener === 'function') {
          reduceMq.addEventListener('change', onReduceChange);
          reduceListening = true;
        } else if (typeof reduceMq.addListener === 'function') {
          reduceMq.addListener(onReduceChange);
          reduceListening = true;
        }
      } catch (err) { /* ignore */ }
    }

    return view;
  }

  /* ---------------- 注册 ---------------- */

  if (!global.NoteExpr) global.NoteExpr = {};
  global.NoteExpr.Focus = {
    version: VERSION,
    mount: mount
  };
})(typeof window !== 'undefined' ? window : this);

/* ---- source: src/expr/range.js ---- */
/*!
 * 范围注释与分组说明 · NoteExpr.Range v1.0.0
 * 依赖：无（原生 DOM + Web Animations API）；普通 <script> 引入，file:// 直接可用。
 *
 * 用法：
 *   var range = NoteExpr.Range.mount({ motion: 'auto', zIndex: 1205 });
 *   range.show({ targets: [el1, el2], text: '这两步决定是否继续' });
 *   range.show({ targets: [el2, el3], text: '换成这一组' });   // 幂等 = 更新
 *   range.show({ targets: [el1], text: '' });                 // 只画括线，不画标签
 *   range.show({ targets: [el1, el2], text: '外层', offset: 10, side: 'below' });
 *   range.show({ targets: [el2], text: '内层', offset: 38, side: 'below' }); // 两层括线分层
 *   range.hide();  range.refresh();  range.destroy();
 *
 * 只读：range.el（叠加层根）/ range.visible / range.targets / range.text
 *
 * 几何契约（视口坐标；g = 目标组包围盒；offset = 括线与组包围盒的间距，默认 10）：
 *   横向 below：括线 = 1px 横线，上缘 y = g.bottom + offset，x 从 g.left 到 g.right；端刺 7px 向上指向对象
 *   横向 above：括线（下缘）= g.top - offset；端刺 7px 向下
 *   纵向 right：括线 = 1px 竖线，左缘 x = g.right + offset；端刺 7px 向左
 *   纵向 left ：括线（右缘）= g.left - offset；端刺 7px 向右
 *   标签：横向 = 线外侧 5px、水平居中并夹在视口内；纵向 = 线外侧 8px、与 g 垂直居中
 *   auto 排列：目标两两之间水平重叠 > 较小目标宽 60% 且纵向错开 → 纵向，否则横向
 *   auto 选边（与当前视口无关，滚动时不换边）：横向看"组下方是否还有内容"——有则 below，
 *   没有则 above，两侧都不行则 below + data-nx-overflow；纵向看"右侧内容空间"够不够 → right，否则 left
 *   换边只发生在 show() / refresh() / 窗口 resize / 排列方向变化时；滚动只更新坐标
 *   括线/标签恒在目标包围盒之外，绝不与任何目标相交（宁可换边也不压内容）
 *
 * 职责边界：只认传入元素与一行文字；不判断业务语义，不写全局样式，不引用外部资源，
 * 不依赖任何其他组件的 DOM、类名或文案。所有文字用 textContent 写入。
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';
  var ERR = 'NoteExpr.Range: ';

  /* 几何与动效参数（SPEC §1/§2B/§4/§6 的基线值，集中在此便于核对） */
  var G = {
    gap: 10,          /* 括线与组包围盒的间距 */
    hair: 1,          /* 括线描边（端刺 7px、标注线用 CSS 伪元素实现，见 note-range.css） */
    labelGapH: 5,     /* 横向：标签与"线"的距离 */
    labelGapV: 8,     /* 纵向：标签与"线"的距离 */
    edge: 4,          /* 与视口边缘的最小留白 */
    overlapRatio: 0.6,/* 排列判断：水平重叠 / 较小目标宽 */
    showDur: 220,     /* 首次显示：从中心展开 */
    labelDelay: 140,  /* 标签延迟淡入起点 */
    labelDur: 120,    /* 标签淡入时长 */
    updateDur: 240,   /* 更新：过渡到新范围 */
    hideDur: 150,     /* 取消：淡出 */
    textFadeDur: 160, /* 文字内容变化时的淡入 */
    ease: 'cubic-bezier(.22,.68,.24,1)',
    easeOut: 'cubic-bezier(.2,.7,.2,1)'
  };

  var SIDES = ['auto', 'below', 'above', 'left', 'right'];
  /* 默认 z-index 1205 由 CSS 的 var(--nx-z, 1205) 承担，JS 只在宿主显式传入时写变量 */

  /* ---------------- 小工具 ---------------- */

  function px(v) {
    if (typeof v !== 'number' || !isFinite(v)) v = 0;
    if (Math.abs(v) < 0.05) v = 0;           /* 避免 -0.0 */
    return (Math.round(v * 10) / 10).toFixed(1) + 'px';
  }

  function clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  /* scene 受控测量：geometry.rect 由宿主提供（冻结目标几何）；缺省走原生 rect。 */
  function normalizeGeometry(input) {
    if (input && typeof input === 'object' && typeof input.rect === 'function') return input;
    return null;
  }

  function rectOfNode(node, geometry) {
    var r = geometry && typeof geometry.rect === 'function' ? geometry.rect(node) : node.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }

  function unionRects(list) {
    var l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    var i, x;
    for (i = 0; i < list.length; i++) {
      x = list[i];
      if (x.left < l) l = x.left;
      if (x.top < t) t = x.top;
      if (x.right > r) r = x.right;
      if (x.bottom > b) b = x.bottom;
    }
    if (!isFinite(l) || !isFinite(t)) { l = t = r = b = 0; }
    return {
      left: l, top: t, right: r, bottom: b,
      width: Math.max(0, r - l), height: Math.max(0, b - t),
      cx: (l + r) / 2, cy: (t + b) / 2
    };
  }

  function sameRect(a, b, tol) {
    if (!a || !b) return false;
    tol = tol || 0.05;
    return Math.abs(a.left - b.left) <= tol && Math.abs(a.top - b.top) <= tol &&
           Math.abs(a.width - b.width) <= tol && Math.abs(a.height - b.height) <= tol;
  }

  /* 两个几何方案是否等价（重定位时据此决定是否打断动效） */
  function planEquals(a, b) {
    if (!a || !b) return false;
    if (a.orientation !== b.orientation || a.side !== b.side) return false;
    if (!!a.sideOverflow !== !!b.sideOverflow) return false;
    if (!!a.overflow !== !!b.overflow) return false;
    if (!sameRect(a.bracket, b.bracket, 0.05)) return false;
    if (!a.label && !b.label) return true;
    if (!a.label || !b.label) return false;
    return sameRect(a.label, b.label, 0.05) && !!a.label.truncated === !!b.label.truncated;
  }

  /* ---------------- 实例 ---------------- */

  function mount(options) {
    options = options || {};
    var doc = global.document;
    var motionOpt = options.motion === 'never' ? 'never' : (options.motion === 'always' ? 'always' : 'auto');
    var reduceMq = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;

    var destroyed = false;
    var visible = false;
    var targets = [];
    var text = '';
    var sideOpt = 'auto';
    var orientOpt = 'auto';
    var plan = null;            /* 最近一次已应用的几何方案 */
    var anims = [];             /* 正在播放的 WAAPI 动画 */
    var hideTimer = 0;
    var rafId = 0;
    var resizeObserver = null;
    var observed = [];
    var natText = null;         /* 标签自然尺寸缓存的文字键 */
    var natSize = { width: 0, height: 0 };
    var gap = G.gap;            /* 当前 show() 的括线外侧间距；默认 G.gap */
    var currentOffset = G.gap;  /* 对外只读 offset 值（含默认值） */

    var root = null;
    var bracket = null;
    var label = null;

    var view = {};

    var observeEnabled = options.observe !== false;
    var geometryProvider = normalizeGeometry(options.geometry);
    var viewportListening = false;

    function nodeRect(node) {
      return rectOfNode(node, geometryProvider);
    }

    /* ---------- 动效开关 ---------- */

    function shouldAnimate() {
      if (destroyed) return false;
      if (motionOpt === 'never') return false;
      if (motionOpt === 'always') return true;
      return !(reduceMq && reduceMq.matches);
    }

    /* ---------- 叠加层根节点 ---------- */

    function buildRoot() {
      root = doc.createElement('div');
      root.className = 'nx-range';
      root.setAttribute('data-nx-component', 'range');
      root.setAttribute('data-nx-state', 'idle');
      root.setAttribute('data-nx-orientation', 'h');
      root.setAttribute('data-nx-side', 'below');
      root.setAttribute('aria-hidden', 'true');
      root.style.position = 'fixed';
      root.style.top = '0px';
      root.style.right = '0px';
      root.style.bottom = '0px';
      root.style.left = '0px';
      root.style.pointerEvents = 'none';
      if (options.zIndex !== undefined && options.zIndex !== null) {
        var z = Number(options.zIndex);
        if (isFinite(z)) root.style.setProperty('--nx-z', String(Math.round(z)));
      }
      (doc.body || doc.documentElement).appendChild(root);
      view.el = root;
    }

    /* ---------- 内容节点 ---------- */

    function ensureBracket() {
      if (!bracket) {
        bracket = doc.createElement('div');
        bracket.className = 'nx-range__bracket';
        bracket.setAttribute('aria-hidden', 'true');
        root.appendChild(bracket);
      }
      return bracket;
    }

    function ensureLabel() {
      if (text === '') {
        removeLabel();
        return null;
      }
      if (!label) {
        label = doc.createElement('div');
        label.className = 'nx-range__label';
        label.setAttribute('aria-hidden', 'true');
        root.appendChild(label);
      }
      if (label.textContent !== text) label.textContent = text;
      return label;
    }

    function removeLabel() {
      if (label && label.parentNode) label.parentNode.removeChild(label);
      label = null;
    }

    function clearContent() {
      stopAnims();
      stopHideTimer();
      if (bracket && bracket.parentNode) bracket.parentNode.removeChild(bracket);
      if (label && label.parentNode) label.parentNode.removeChild(label);
      bracket = null;
      label = null;
      plan = null;
      if (root) {
        root.setAttribute('data-nx-state', 'idle');
        root.removeAttribute('data-nx-overflow');
      }
    }

    /* ---------- 测量 ---------- */

    function viewportSize() {
      return {
        w: global.innerWidth || (doc.documentElement && doc.documentElement.clientWidth) || 0,
        h: global.innerHeight || (doc.documentElement && doc.documentElement.clientHeight) || 0
      };
    }

    function measureTargets() {
      var list = [];
      for (var i = 0; i < targets.length; i++) list.push(nodeRect(targets[i]));
      return list;
    }

    function targetsAlive() {
      if (!targets.length) return false;
      for (var i = 0; i < targets.length; i++) {
        var el = targets[i];
        if (!el || el.nodeType !== 1 || !el.isConnected) return false;
      }
      return true;
    }

    function labelNatural(force) {
      if (!label) return { width: 0, height: 0 };
      if (!force && natText === text) return natSize;
      label.style.maxWidth = 'none';
      var r = nodeRect(label);
      natSize = { width: r.width, height: r.height };
      natText = text;
      return natSize;
    }

    function captureCurrent() {
      var cur = { bracket: null, label: null };
      if (bracket) cur.bracket = nodeRect(bracket);
      if (label) cur.label = nodeRect(label);
      return cur;
    }

    /* ---------- 内容空间与占用（选边判据，与视口无关） ----------
       注释是静态标记，滚动只应更新坐标：选边不能依赖"当前视口剩余高度"，
       否则目标在视口外 show 与滚入视口后判据不同，括线会上下跳。
       这里改为两件与滚动无关的事：
       1) 与标签横向范围重叠的页面内容里，组下方还有没有内容（内容末尾在哪）；
       2) 计划中的标签带在几何上是否被页面内容占用。
       所有比较都相对目标组自身，滚动时组与内容一起移动，结果不变；
       固定/粘性元素不参与（它们不随页面滚动，参与会让判定随滚动变化）。 */

    function isTargetRelated(el) {
      for (var i = 0; i < targets.length; i++) {
        var t = targets[i];
        if (!t) continue;
        if (t === el) return true;
        if (t.contains && t.contains(el)) return true;
        if (el.contains && el.contains(t)) return true;
      }
      return false;
    }

    function hasOwnText(el) {
      var nodes = el.childNodes;
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (n.nodeType === 3 && n.nodeValue && n.nodeValue.replace(/\s+/g, '') !== '') return true;
      }
      return false;
    }

    function paintsContent(el, tag) {
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'META' ||
          tag === 'TEMPLATE' || tag === 'NOSCRIPT' || tag === 'BR' || tag === 'HEAD' ||
          tag === 'TITLE' || tag === 'HTML' || tag === 'BODY') return false;
      var cs = global.getComputedStyle(el);
      if (!cs) return false;
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
      if (parseFloat(cs.opacity) === 0) return false;
      if (cs.position === 'fixed' || cs.position === 'sticky') return false;
      var bg = cs.backgroundColor;
      if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)' && !/,\s*0(\.\d+)?\)$/.test(bg)) return true;
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
      if (cs.boxShadow && cs.boxShadow !== 'none') return true;
      if (tag === 'IMG' || tag === 'CANVAS' || tag === 'VIDEO' || tag === 'IFRAME' ||
          tag === 'INPUT' || tag === 'BUTTON' || tag === 'TEXTAREA' || tag === 'SELECT' ||
          tag === 'SVG' || tag === 'TABLE' || tag === 'TD' || tag === 'TH') return true;
      return hasOwnText(el);
    }

    function rectHits(a, b) {
      return a.left < b.right - 0.5 && a.right > b.left + 0.5 &&
             a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
    }

    /* 扫描"标签横向范围"内的可见内容：返回内容末尾/开头（视口坐标）与两侧标签带占用 */
    function scanContent(span, belowBand, aboveBand) {
      var out = { endBottom: null, startTop: null, belowOccupied: false, aboveOccupied: false };
      if (!span || typeof doc.querySelectorAll !== 'function') return out;
      var all = doc.querySelectorAll('body *');
      var limit = all.length > 6000 ? 6000 : all.length;
      for (var i = 0; i < limit; i++) {
        var el = all[i];
        if (!el || el.nodeType !== 1) continue;
        if (root && (el === root || root.contains(el))) continue;
        if (isTargetRelated(el)) continue;
        /* 其它组件的叠加层（.nx-focus / .nx-link / 别的 .nx-range）是注记而不是页面内容，
           且它们跟随视口，参与判定会让选边随滚动漂移 */
        if (el.closest && el.closest('[data-nx-component]')) continue;
        var r = nodeRect(el);
        if (r.width <= 0.5 || r.height <= 0.5) continue;
        if (r.right <= span.left + 0.5 || r.left >= span.right - 0.5) continue;
        if (!paintsContent(el, (el.tagName || '').toUpperCase())) continue;
        if (out.startTop === null || r.top < out.startTop) out.startTop = r.top;
        if (out.endBottom === null || r.bottom > out.endBottom) out.endBottom = r.bottom;
        if (belowBand && !out.belowOccupied && rectHits(r, belowBand)) out.belowOccupied = true;
        if (aboveBand && !out.aboveOccupied && rectHits(r, aboveBand)) out.aboveOccupied = true;
      }
      return out;
    }

    /* 滚动内容边界（视口坐标）：文档整页或最近一个可滚动祖先的内容盒 */
    function scrollParentOf(node) {
      var p = node && node.parentNode;
      while (p && p.nodeType === 1 && p !== doc.body && p !== doc.documentElement) {
        var cs = global.getComputedStyle(p);
        var canY = (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && p.scrollHeight > p.clientHeight + 1;
        var canX = (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 1;
        if (canY || canX) return p;
        p = p.parentNode;
      }
      return null;
    }

    function contentBounds() {
      var node = targets.length ? targets[0] : null;
      var scroller = node ? scrollParentOf(node) : null;
      if (scroller) {
        var r = nodeRect(scroller);
        var sx = scroller.scrollLeft || 0;
        var sy = scroller.scrollTop || 0;
        return {
          left: r.left - sx,
          top: r.top - sy,
          right: r.left - sx + Math.max(scroller.scrollWidth, scroller.clientWidth),
          bottom: r.top - sy + Math.max(scroller.scrollHeight, scroller.clientHeight)
        };
      }
      var de = doc.documentElement || {};
      var body = doc.body || {};
      var vx = typeof global.scrollX === 'number' ? global.scrollX : (global.pageXOffset || 0);
      var vy = typeof global.scrollY === 'number' ? global.scrollY : (global.pageYOffset || 0);
      var w = Math.max(de.scrollWidth || 0, body.scrollWidth || 0, de.clientWidth || 0);
      var h = Math.max(de.scrollHeight || 0, body.scrollHeight || 0, de.clientHeight || 0);
      return { left: -vx, top: -vy, right: w - vx, bottom: h - vy };
    }

    /* ---------- 排列判断（SPEC §4） ---------- */

    function autoOrientation(rects) {
      if (rects.length < 2) return 'h';
      var pairs = 0;
      var votes = 0;
      var i, j, a, b, minW, overlap, vOffset;
      for (i = 0; i < rects.length; i++) {
        for (j = i + 1; j < rects.length; j++) {
          pairs++;
          a = rects[i];
          b = rects[j];
          minW = Math.min(a.width, b.width);
          overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          vOffset = Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) > 1;
          if (minW > 0 && overlap > minW * G.overlapRatio && vOffset) votes++;
        }
      }
      return votes === pairs ? 'v' : 'h';
    }

    /* ---------- 横向方案 ---------- */

    /* 标签的水平盒子（只与组和视口宽度有关，与上下滚动无关） */
    function horizontalLabelBox(group, nat, vp) {
      var edge = G.edge;
      var maxW = Math.max(0, vp.w - 2 * edge);
      var width = Math.min(nat.width, maxW);
      return {
        width: width,
        left: clamp(group.cx - width / 2, edge, Math.max(edge, vp.w - edge - width)),
        height: nat.height,
        truncated: nat.width > maxW + 0.01
      };
    }

    /* 横向 auto 选边：组下方还有内容 → below；否则 above；都不行 → below + overflow */
    function horizontalAutoSide(group, nat, lm) {
      var need = gap + (lm.height > 0 ? G.labelGapH + lm.height : 0) + G.edge;
      var span = lm.height > 0
        ? { left: lm.left, right: lm.left + lm.width }
        : { left: group.left, right: group.right };
      var belowBand = {
        left: span.left, right: span.right,
        top: group.bottom + gap + (lm.height > 0 ? G.labelGapH : 0),
        bottom: group.bottom + gap + (lm.height > 0 ? G.labelGapH + lm.height : G.hair)
      };
      var aboveBand = {
        left: span.left, right: span.right,
        top: group.top - gap - (lm.height > 0 ? G.labelGapH + lm.height : 0),
        bottom: group.top - gap - (lm.height > 0 ? G.labelGapH : 0)
      };
      var scan = scanContent(span, belowBand, aboveBand);
      var box = contentBounds();
      var belowRoom = (scan.endBottom === null ? box.bottom : scan.endBottom) - group.bottom;
      var aboveRoom = group.top - (scan.startTop === null ? box.top : scan.startTop);
      var belowFits = belowRoom >= need && !scan.belowOccupied;
      var aboveFits = aboveRoom >= need && !scan.aboveOccupied;
      if (belowFits) return { side: 'below', sideOverflow: false };
      if (aboveFits) return { side: 'above', sideOverflow: false };
      return { side: 'below', sideOverflow: true };
    }

    function horizontalPlan(group, nat, vp, side, sideOverflow, lm) {
      var labelH = nat.height;
      var bracketTop = side === 'below' ? group.bottom + gap : group.top - gap - G.hair;
      var lineNear = side === 'below' ? bracketTop : bracketTop + G.hair;
      var labelTop = side === 'below' ? lineNear + G.labelGapH : lineNear - G.labelGapH - labelH;
      return {
        orientation: 'h',
        side: side,
        group: group,
        bracket: { left: group.left, top: bracketTop, width: group.width, height: G.hair },
        label: labelH > 0 ? {
          left: lm.left, top: labelTop, width: lm.width, height: labelH, truncated: lm.truncated
        } : null,
        sideOverflow: !!sideOverflow,
        overflow: !!sideOverflow || lm.truncated
      };
    }

    /* ---------- 纵向方案 ---------- */

    /* 纵向 auto 选边：右侧内容空间放得下标签 → right，否则 left（与滚动无关） */
    function verticalAutoSide(group, nat) {
      var box = contentBounds();
      var need = gap + G.labelGapV + (nat.width > 0 ? nat.width : 0) + G.edge;
      var rightFits = box.right - group.right >= need;
      var leftFits = group.left - box.left >= need;
      if (rightFits) return { side: 'right', sideOverflow: false };
      return { side: 'left', sideOverflow: !leftFits };
    }

    function verticalPlan(group, nat, vp, side, sideOverflow) {
      var edge = G.edge;
      var labelW0 = nat.width;
      var labelH = nat.height;
      var rightX = group.right + gap;                    /* 线的左缘 */
      var leftX = group.left - gap - G.hair;             /* 线的左缘 */
      var bracketLeft = side === 'right' ? rightX : leftX;
      var lineNear = side === 'right' ? bracketLeft : bracketLeft + G.hair;

      var labelLeft, maxW;
      if (side === 'right') {
        labelLeft = lineNear + G.labelGapV;
        maxW = (vp.w - edge) - labelLeft;
      } else {
        maxW = (lineNear - G.labelGapV) - edge;
        labelLeft = 0; /* 由宽度反推 */
      }
      maxW = Math.max(0, maxW);
      var w = Math.min(labelW0, maxW);
      var truncated = labelW0 > maxW + 0.01;
      if (side === 'left') labelLeft = (lineNear - G.labelGapV) - w;
      var labelTop = group.top + group.height / 2 - labelH / 2;

      return {
        orientation: 'v',
        side: side,
        group: group,
        bracket: { left: bracketLeft, top: group.top, width: G.hair, height: group.height },
        label: labelH > 0 ? {
          left: labelLeft, top: labelTop, width: w, height: labelH, truncated: truncated
        } : null,
        sideOverflow: !!sideOverflow,
        overflow: !!sideOverflow || truncated || maxW <= 0.5
      };
    }

    /* ---------- 方案计算 ---------- */

    /* 显式 side：只用于判断"是否放得下"，用于 data-nx-overflow */
    function sideRoom(orientation, side, group, nat) {
      var box = contentBounds();
      if (orientation === 'h') {
        var need = gap + (nat.height > 0 ? G.labelGapH + nat.height : 0) + G.edge;
        return side === 'below' ? (box.bottom - group.bottom >= need) : (group.top - box.top >= need);
      }
      var needV = gap + G.labelGapV + (nat.width > 0 ? nat.width : 0) + G.edge;
      return side === 'right' ? (box.right - group.right >= needV) : (group.left - box.left >= needV);
    }

    function computePlan(rects, nat, reuseSide) {
      var vp = viewportSize();
      var orientation = orientOpt;
      if (orientation === 'horizontal') orientation = 'h';
      if (orientation === 'vertical') orientation = 'v';
      if (orientation === 'auto') orientation = autoOrientation(rects);
      /* 显式 side 优先：above/below 即横向，left/right 即纵向 */
      if (sideOpt !== 'auto') orientation = (sideOpt === 'above' || sideOpt === 'below') ? 'h' : 'v';
      var group = unionRects(rects);
      var lm = orientation === 'h' ? horizontalLabelBox(group, nat, vp) : null;
      var side, sideOverflow;
      if (sideOpt !== 'auto') {
        side = sideOpt;
        sideOverflow = !sideRoom(orientation, side, group, nat);
      } else if (reuseSide && plan && plan.orientation === orientation) {
        /* 滚动触发的重定位只更新坐标：沿用上一次 show()/refresh()/resize 定下的边，
           保证滚动过程中括线不换边、不跳动 */
        side = plan.side;
        sideOverflow = !!plan.sideOverflow;
      } else {
        var decided = orientation === 'h'
          ? horizontalAutoSide(group, nat, lm)
          : verticalAutoSide(group, nat);
        side = decided.side;
        sideOverflow = decided.sideOverflow;
      }
      var next = orientation === 'h'
        ? horizontalPlan(group, nat, vp, side, sideOverflow, lm)
        : verticalPlan(group, nat, vp, side, sideOverflow);
      next.targets = rects;
      return next;
    }

    /* ---------- 应用 ---------- */

    function applyPlan(next) {
      plan = next;
      if (!root) return;
      root.setAttribute('data-nx-orientation', next.orientation);
      root.setAttribute('data-nx-side', next.side);
      if (next.overflow) root.setAttribute('data-nx-overflow', '1');
      else root.removeAttribute('data-nx-overflow');
      if (bracket) {
        bracket.style.left = px(next.bracket.left);
        bracket.style.top = px(next.bracket.top);
        bracket.style.width = px(Math.max(0, next.bracket.width));
        bracket.style.height = px(Math.max(0, next.bracket.height));
      }
      if (label) {
        var lp = next.label;
        label.style.left = px(lp ? lp.left : 0);
        label.style.top = px(lp ? lp.top : 0);
        if (lp && lp.truncated) label.style.maxWidth = px(Math.max(0, lp.width));
        else label.style.maxWidth = 'none';
      }
    }

    /* ---------- 动画 ---------- */

    function dropAnim(a) {
      var i = anims.indexOf(a);
      if (i >= 0) anims.splice(i, 1);
      try { a.cancel(); } catch (err) { /* 已结束 */ }
    }

    function anim(node, frames, timing, keepFill) {
      if (!node || typeof node.animate !== 'function') return null;
      var a;
      try { a = node.animate(frames, timing); } catch (err) { return null; }
      anims.push(a);
      /* 隐藏动画要保持 fill:forwards 到清理时刻，避免淡出结束瞬间回弹一帧 */
      if (!keepFill) a.onfinish = function () { dropAnim(a); };
      return a;
    }

    function stopAnims() {
      if (!anims.length) return;
      var list = anims.slice();
      anims.length = 0;
      for (var i = 0; i < list.length; i++) {
        try { list[i].cancel(); } catch (err) { /* ignore */ }
      }
    }

    function stopHideTimer() {
      if (hideTimer) {
        global.clearTimeout(hideTimer);
        hideTimer = 0;
      }
    }

    function frameOfRect(r) {
      return { left: px(r.left), top: px(r.top), width: px(r.width), height: px(r.height) };
    }

    function animateShow(next) {
      if (!shouldAnimate()) return;
      var b = next.bracket;
      if (bracket && b.width >= 0 && b.height >= 0) {
        var from = next.orientation === 'h'
          ? { left: b.left + b.width / 2, top: b.top, width: 0, height: b.height }
          : { left: b.left, top: b.top + b.height / 2, width: b.width, height: 0 };
        anim(bracket, [frameOfRect(from), frameOfRect(b)], {
          duration: G.showDur, easing: G.ease, fill: 'backwards'
        });
      }
      if (label) {
        anim(label, [{ opacity: '0' }, { opacity: '1' }], {
          duration: G.labelDur, delay: G.labelDelay, easing: 'ease-out', fill: 'backwards'
        });
      }
    }

    function animateUpdate(prev, next, textChanged) {
      if (!shouldAnimate()) return;
      if (bracket && prev.bracket && !sameRect(prev.bracket, next.bracket)) {
        anim(bracket, [frameOfRect(prev.bracket), frameOfRect(next.bracket)], {
          duration: G.updateDur, easing: G.ease, fill: 'backwards'
        });
      }
      if (label && prev.label && next.label) {
        if (!sameRect(prev.label, next.label)) {
          anim(label, [frameOfRect(prev.label), frameOfRect(next.label)], {
            duration: G.updateDur, easing: G.ease, fill: 'backwards'
          });
        }
        if (textChanged) {
          anim(label, [{ opacity: '0.15' }, { opacity: '1' }], {
            duration: G.textFadeDur, delay: 40, easing: 'ease-out', fill: 'backwards'
          });
        }
      } else if (label && !prev.label && next.label && textChanged) {
        anim(label, [{ opacity: '0' }, { opacity: '1' }], {
          duration: G.textFadeDur, delay: G.labelDelay, easing: 'ease-out', fill: 'backwards'
        });
      }
    }

    function animateHide() {
      stopAnims();
      if (!shouldAnimate() || (!bracket && !label)) {
        clearContent();
        return;
      }
      if (bracket) {
        anim(bracket, [{ opacity: '1' }, { opacity: '0' }], {
          duration: G.hideDur, easing: 'ease-out', fill: 'forwards'
        }, true);
      }
      if (label) {
        anim(label, [{ opacity: '1' }, { opacity: '0' }], {
          duration: G.hideDur, easing: 'ease-out', fill: 'forwards'
        }, true);
      }
      if (!anims.length) { clearContent(); return; }
      stopHideTimer();
      hideTimer = global.setTimeout(function () {
        hideTimer = 0;
        if (!destroyed) clearContent();
      }, G.hideDur + 40);
    }

    /* ---------- 观察与重定位 ---------- */

    function unobserveTargets() {
      if (!resizeObserver) { observed.length = 0; return; }
      for (var i = 0; i < observed.length; i++) {
        try { resizeObserver.unobserve(observed[i]); } catch (err) { /* ignore */ }
      }
      observed.length = 0;
    }

    function observeTargets() {
      if (!observeEnabled || !resizeObserver) return;
      unobserveTargets();
      for (var i = 0; i < targets.length; i++) {
        try {
          resizeObserver.observe(targets[i]);
          observed.push(targets[i]);
        } catch (err) { /* ignore */ }
      }
    }

    /* 监听与观察器跟随 observe 开关：受控测量时完全不参与自动重定位，refresh() 仍显式工作。 */
    function attachObservers() {
      if (!observeEnabled) return;
      if (!viewportListening) {
        global.addEventListener('scroll', onScroll, true);
        global.addEventListener('resize', onResize);
        viewportListening = true;
      }
      if (!resizeObserver && typeof global.ResizeObserver === 'function') {
        resizeObserver = new global.ResizeObserver(function () {
          if (!observeEnabled) return;
          scheduleReposition(false);
        });
      }
      if (resizeObserver && visible) observeTargets();
    }

    function detachObservers() {
      if (viewportListening) {
        global.removeEventListener('scroll', onScroll, true);
        global.removeEventListener('resize', onResize);
        viewportListening = false;
      }
      unobserveTargets();
      if (resizeObserver) {
        try { resizeObserver.disconnect(); } catch (err) { /* ignore */ }
      }
    }

    function setObserveEnabled(enabled) {
      if (observeEnabled === enabled) return;
      observeEnabled = enabled;
      if (enabled) {
        attachObservers();
        if (visible) scheduleReposition(false);
      } else {
        detachObservers();
      }
    }

    var pendingReuseSide = true;

    /* reuseSide=true 用于"只是滚动"的重定位：沿用当前边；resize / ResizeObserver
       / refresh 会重算边（SPEC §4：换边只发生在 show/refresh/resize/方向变化时）。 */
    function scheduleReposition(reuseSide) {
      if (destroyed || !visible || !observeEnabled) return;
      if (rafId) {
        if (!reuseSide) pendingReuseSide = false;
        return;
      }
      pendingReuseSide = !!reuseSide;
      rafId = global.requestAnimationFrame(function () {
        rafId = 0;
        if (destroyed || !visible || !observeEnabled) return;
        var reuse = pendingReuseSide;
        pendingReuseSide = true;
        reposition(reuse, false);
      });
    }

    /* 重定位：不播动画；几何确有变化时取消进行中的动画并落到最终几何（SPEC §4）。
       几何没有实际变化时保持不动，避免 ResizeObserver 建立观察时的首次通知
       把刚开始的首帧动画打断。 */
    function reposition(reuseSide, forceMeasure) {
      if (destroyed || !visible) return;
      stopHideTimer();
      if (!targetsAlive()) { hide(); return; }
      if (!root) return;
      var rects = measureTargets();
      var nat = labelNatural(!!forceMeasure);
      var next = computePlan(rects, nat, !!reuseSide);
      if (!forceMeasure && plan && planEquals(plan, next)) return;
      stopAnims();
      applyPlan(next);
    }

    function onScroll() {
      if (!observeEnabled) return;
      scheduleReposition(true);
    }
    function onResize() {
      if (!observeEnabled) return;
      scheduleReposition(false);
    }

    /* ---------- 参数校验 ---------- */

    function parseOptions(opts) {
      if (!opts || typeof opts !== 'object') throw new Error(ERR + 'show() 需要一个参数对象');
      var list = opts.targets;
      if (!list || typeof list === 'string' || typeof list.length !== 'number') {
        throw new Error(ERR + 'targets 必须是 Element 数组');
      }
      if (list.length < 1) throw new Error(ERR + 'targets 至少需要 1 个元素');
      var arr = [];
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        if (!el || el.nodeType !== 1) throw new Error(ERR + 'targets[' + i + '] 不是 Element');
        arr.push(el);
      }
      var t = opts.text;
      if (t === undefined || t === null) t = '';
      if (typeof t !== 'string') throw new Error(ERR + 'text 必须是字符串');
      var s = opts.side === undefined || opts.side === null ? 'auto' : String(opts.side).toLowerCase();
      if (SIDES.indexOf(s) < 0) throw new Error(ERR + 'side 只能是 auto/below/above/left/right');
      var o = opts.orientation === undefined || opts.orientation === null ? 'auto' : String(opts.orientation).toLowerCase();
      if (o === 'horizontal') o = 'h';
      if (o === 'vertical') o = 'v';
      if (['auto', 'h', 'v'].indexOf(o) < 0) throw new Error(ERR + 'orientation 只能是 auto/h/v');
      var offset = null;
      if (opts.offset !== undefined && opts.offset !== null) {
        var quoted = typeof opts.offset === 'string';
        if (!quoted && typeof opts.offset !== 'number') throw new Error(ERR + 'offset 必须是非负有限数字');
        offset = quoted ? Number(opts.offset.trim()) : opts.offset;
        if (quoted && opts.offset.trim() === '') offset = NaN;
        if (!isFinite(offset) || offset < 0) throw new Error(ERR + 'offset 必须是非负有限数字');
      }
      return { targets: arr, text: t, side: s, orientation: o, observe: opts.observe, geometry: opts.geometry, offset: offset };
    }

    /* ---------- show / hide / refresh ---------- */

    function show(opts) {
      if (destroyed) return view;
      var cfg = parseOptions(opts);
      if (cfg.observe !== undefined) setObserveEnabled(cfg.observe !== false);
      if (cfg.geometry !== undefined) geometryProvider = normalizeGeometry(cfg.geometry);
      stopHideTimer();
      var cur = captureCurrent();
      var wasVisible = visible;
      var prevText = text;
      stopAnims();
      if (!wasVisible) cur = { bracket: null, label: null };

      targets = cfg.targets;
      text = cfg.text;
      sideOpt = cfg.side;
      orientOpt = cfg.orientation;
      gap = cfg.offset === null ? G.gap : cfg.offset;
      currentOffset = gap;
      visible = true;
      root.setAttribute('data-nx-state', 'shown');
      ensureBracket();
      ensureLabel();
      var nat = labelNatural(prevText !== text || natText !== text);
      var next = computePlan(measureTargets(), nat, false);
      applyPlan(next);
      observeTargets();
      if (!wasVisible) animateShow(next);
      else animateUpdate(cur, next, prevText !== text);
      return view;
    }

    function hide() {
      if (destroyed) return view;
      if (!visible) {
        if (bracket || label) clearContent();
        return view;
      }
      visible = false;
      unobserveTargets();
      animateHide();
      return view;
    }

    function refresh() {
      if (destroyed || !visible) return view;
      /* 宿主显式要求重新测量：允许按新布局重算排列与选边，但不播动画 */
      reposition(false, true);
      return view;
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      stopAnims();
      stopHideTimer();
      if (rafId) {
        try { global.cancelAnimationFrame(rafId); } catch (err) { /* ignore */ }
        rafId = 0;
      }
      detachObservers();
      resizeObserver = null;
      if (reduceMq) {
        if (typeof reduceMq.removeEventListener === 'function') reduceMq.removeEventListener('change', onReduceChange);
        else if (typeof reduceMq.removeListener === 'function') reduceMq.removeListener(onReduceChange);
      }
      if (root && root.parentNode) root.parentNode.removeChild(root);
      root = null;
      bracket = null;
      label = null;
      plan = null;
      visible = false;
      targets = [];
      text = '';
      view.el = null;
    }

    function onReduceChange() {
      if (!visible) return;
      /* 减少动效切换：直接落到最终几何，不留下半程动画（不换边） */
      stopAnims();
      reposition(true, false);
    }

    /* ---------- 接口 ---------- */

    view.show = show;
    view.hide = hide;
    view.refresh = refresh;
    view.destroy = destroy;
    view.version = VERSION;

    Object.defineProperty(view, 'visible', { get: function () { return visible; } });
    Object.defineProperty(view, 'targets', { get: function () { return targets.slice(); } });
    Object.defineProperty(view, 'text', { get: function () { return text; } });
    Object.defineProperty(view, 'offset', { get: function () { return currentOffset; } });

    /* ---------- 初始化 ---------- */

    buildRoot();
    attachObservers();
    if (reduceMq) {
      if (typeof reduceMq.addEventListener === 'function') reduceMq.addEventListener('change', onReduceChange);
      else if (typeof reduceMq.addListener === 'function') reduceMq.addListener(onReduceChange);
    }

    return view;
  }

  /* ---------- 注册（加载顺序无关） ---------- */

  var note = global.NoteExpr = global.NoteExpr || {};
  note.Range = { version: VERSION, mount: mount };
})(window);

/* ---- source: src/expr/link.js ---- */
/*!
 * 对象关系连线 · NoteExpr.Link v1.0.0
 * 依赖：无（原生 DOM + SVG + Web Animations API），file:// 直接可用，普通 <script> 加载。
 *
 * 挂载（自带 fixed 叠加层，不需要宿主容器参数）：
 *   var link = NoteExpr.Link.mount({ motion: 'auto', zIndex: 1200 });
 *   link.show({ from: elA, to: elB, label: '同一 key', arrow: true });
 *   link.show({ from: elA, to: elC, label: '定义在此' });       // 更新（240ms 重绘）
 *   link.show({ from: elB, to: elA, fromSide: 'top', toSide: 'bottom' }); // 显式选边
 *   link.hide();  link.refresh();  link.destroy();
 *
 * 只读属性：link.el（叠加层根）、link.visible、link.from、link.to、link.label
 * show/hide/refresh 返回 this；destroy 幂等，之后所有方法为空操作。
 * 参数非法抛 Error，前缀固定 "NoteExpr.Link: "。
 *
 * 几何契约（视口坐标 = getBoundingClientRect 坐标，叠加层 position:fixed）：
 *   锚点  = 对象所选侧的中心点（贴对象边框）；
 *   收线  = 路径端点位于锚点外 2px（不压对象边框）；
 *   路径  = "短直段 + 三次贝塞尔"：M 端点 L 直段末端 C 控制点1 控制点2 终点；
 *   自动选边（SPEC §2C/§4）：
 *     1) 水平错开且间隙 > 16px -> 起点右侧/终点左侧（或反之）；
 *     2) 否则垂直错开且间隙 > 16px -> 起点底侧/终点顶侧（或反之）；
 *     3) 都不满足（同行相邻、中间隔着别的对象、直连走廊被遮挡）-> 两端同侧绕行：
 *        默认底侧，底侧视口空间不足则顶侧；上下都被端点对象挡住时退化为左右同侧。
 *   自动模式用 48 段折线采样校验路径（端点 2px 邻域除外）不落入 from/to 包围盒；
 *   同侧绕行时还会用 elementFromPoint 轻量探测第三个对象（中间块），必要时加深绕行。
 *   标签 = 曲线（贝塞尔段）中点沿垂线向“外侧”偏移 12px（标签近边到中点 12px），
 *          12px / 行高 1.4 / 字距 .01em，浅底 --nx-label-bg，圆角 3px，内边距 1px 5px；
 *          越出视口先换到垂线另一侧，仍越界再夹紧。无文字时不渲染标签节点。
 *
 * 动效（SPEC §6，读者触发、不自动播放）：
 *   首次显示：描线 300ms、箭头 220ms、标签 240ms；
 *   更新：240ms 重绘（旧线 200ms 淡出、新线 240ms 描线、箭头/标签 220/240ms 淡入）；
 *   取消：160ms 淡出后清空 DOM；
 *   motion:'never' 或系统 prefers-reduced-motion:reduce -> 0ms 直接终态，不建 WAAPI、不排定时器。
 *   刷新/滚动/resize/ResizeObserver 触发的重定位用 rAF 合并、不播动画；动画中遇重定位直接落终态。
 *
 * 职责边界：只画 from/to 之间的连线与一行文字；不做通用避障路由、不做自动布局、
 * 不改宿主 DOM、不写全局样式、不引用外部资源；文字一律 textContent。
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';
  var SVG_NS = 'http://www.w3.org/2000/svg';

  /* ---------------- 动效时长 ---------------- */
  var DUR = {
    draw: 300,      // 首次显示：路径描线
    arrow: 220,     // 首次显示：箭头
    label: 240,     // 首次显示：标签
    redraw: 240,    // 更新：新路径重绘
    ghost: 200,     // 更新：旧线淡出
    hide: 160       // 取消：淡出
  };

  var EASE = 'cubic-bezier(.22,.7,.25,1)';
  var EASE_OUT = 'cubic-bezier(.4,0,.2,1)';

  /* ---------------- 几何常量 ---------------- */
  var G = {
    offset: 2,          // 端点离对象边框 2px（收线）
    gap: 16,            // 自动选边的“间隙 > 16px”阈值
    stubMin: 5,
    stubMax: 14,
    dotR: 2.5,
    arrowLen: 6,
    arrowHalf: 3,
    labelGap: 12,       // 曲线中点垂向外侧 12px
    edgePad: 4,         // 标签与视口边缘的最小间距
    labelMax: 220,      // 标签最大宽度（两行以内）
    clearMin: 14,       // 同侧绕行最小外扩
    clearMax: 26,       // 同侧绕行默认外扩上限
    roomMin: 24,        // 判定“该侧还有空间”的最小值
    probeMin: 8         // 走廊窄于此值视为不可直连
  };

  var SIDE_N = {
    top: { x: 0, y: -1 },
    right: { x: 1, y: 0 },
    bottom: { x: 0, y: 1 },
    left: { x: -1, y: 0 }
  };
  var SIDE_LIST = ['top', 'right', 'bottom', 'left'];

  /* ---------------- 小工具 ---------------- */

  function f1(v) {
    if (!isFinite(v)) v = 0;
    return (Math.round(v * 10) / 10).toFixed(1);
  }

  function clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  function px(v) { return f1(v) + 'px'; }

  function dist(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }

  function unit(v) {
    var len = Math.sqrt(v.x * v.x + v.y * v.y);
    if (len < 1e-6) return { x: 0, y: 0 };
    return { x: v.x / len, y: v.y / len };
  }

  function isElement(node) {
    return !!(node && node.nodeType === 1);
  }

  function connected(node) {
    if (!node) return false;
    if (typeof node.isConnected === 'boolean') return node.isConnected;
    return document.documentElement.contains(node);
  }

  /* scene 受控测量：geometry.rect 由宿主提供（冻结目标几何）；缺省走原生 rect。 */
  function normalizeGeometry(input) {
    if (input && typeof input === 'object' && typeof input.rect === 'function') return input;
    return null;
  }

  function rectOf(node, geometry) {
    var r = geometry && typeof geometry.rect === 'function' ? geometry.rect(node) : node.getBoundingClientRect();
    return {
      left: r.left, top: r.top, right: r.right, bottom: r.bottom,
      width: r.width, height: r.height
    };
  }

  function rectValid(r) {
    return !!r && r.width > 0.5 && r.height > 0.5;
  }

  function rectCenter(r) {
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function unionRect(a, b) {
    return {
      left: Math.min(a.left, b.left),
      top: Math.min(a.top, b.top),
      right: Math.max(a.right, b.right),
      bottom: Math.max(a.bottom, b.bottom),
      width: Math.max(a.right, b.right) - Math.min(a.left, b.left),
      height: Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top)
    };
  }

  function insideRect(p, r) {
    return p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom;
  }

  function anchorOf(r, side) {
    switch (side) {
      case 'top': return { x: r.left + r.width / 2, y: r.top };
      case 'bottom': return { x: r.left + r.width / 2, y: r.bottom };
      case 'left': return { x: r.left, y: r.top + r.height / 2 };
      default: return { x: r.right, y: r.top + r.height / 2 };
    }
  }

  function offsetPoint(p, n, d) {
    return { x: p.x + n.x * d, y: p.y + n.y * d };
  }

  /* 轴分离：两对象在 x 上是否完全错开及间隙 */
  function sepX(A, B) {
    if (A.right <= B.left) return { gap: B.left - A.right, dir: 1 };
    if (B.right <= A.left) return { gap: A.left - B.right, dir: -1 };
    return { gap: 0, dir: 0 };
  }

  function sepY(A, B) {
    if (A.bottom <= B.top) return { gap: B.top - A.bottom, dir: 1 };
    if (B.bottom <= A.top) return { gap: A.top - B.bottom, dir: -1 };
    return { gap: 0, dir: 0 };
  }

  function pageHeight() {
    var doc = document.documentElement;
    return (doc && doc.scrollHeight) || (document.body && document.body.scrollHeight) || (global.innerHeight || 0);
  }

  /* 两个端点是否都（至少部分）落在当前视口内 */
  function pairInViewport(A, B) {
    var w = global.innerWidth || 0;
    var h = global.innerHeight || 0;
    function vis(r) { return r.bottom > 0 && r.top < h && r.right > 0 && r.left < w; }
    return vis(A) && vis(B);
  }

  /* 某侧的可用空间。两个端点都在视口内时用视口空间；
     否则（例如元素还在视口下方就先 show）用页面空间近似“滚动到它时”的空间，
     避免把负的底侧空间误判成“底侧无空间”而改走顶侧。 */
  function sideRoom(A, B, side) {
    var w = global.innerWidth || 0;
    var h = global.innerHeight || 0;
    var inView = pairInViewport(A, B);
    switch (side) {
      case 'bottom':
        return inView ? h - Math.max(A.bottom, B.bottom) : pageHeight() - Math.max(A.bottom, B.bottom) - 4;
      case 'top':
        return Math.min(A.top, B.top);
      case 'right':
        return inView ? w - Math.max(A.right, B.right) : (document.documentElement && document.documentElement.scrollWidth || w) - Math.max(A.right, B.right) - 4;
      default:
        return Math.min(A.left, B.left);
    }
  }

  /* ---------------- 三次贝塞尔 ---------------- */

  function cubicPoint(p0, p1, p2, p3, t) {
    var mt = 1 - t;
    var a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
    return {
      x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
      y: a * p0.y + b * p1.y + c * p2.y + d * p3.y
    };
  }

  function cubicDeriv(p0, p1, p2, p3, t) {
    var mt = 1 - t;
    var a = 3 * mt * mt, b = 6 * mt * t, c = 3 * t * t;
    return {
      x: a * (p1.x - p0.x) + b * (p2.x - p1.x) + c * (p3.x - p2.x),
      y: a * (p1.y - p0.y) + b * (p2.y - p1.y) + c * (p3.y - p2.y)
    };
  }

  function cubicAt(g, t) {
    return cubicPoint(g.S1, g.c1, g.c2, g.E, t);
  }

  /* 整条路径（直段 + 贝塞尔）的折线采样；dist 为累计弧长（近似） */
  function pathSamples(g, steps) {
    var n = steps || 40;
    var points = [{ x: g.S.x, y: g.S.y }, { x: g.S1.x, y: g.S1.y }];
    var i;
    for (i = 1; i <= n; i++) points.push(cubicPoint(g.S1, g.c1, g.c2, g.E, i / n));
    var dists = [0];
    var total = 0;
    for (i = 1; i < points.length; i++) {
      total += dist(points[i - 1], points[i]);
      dists.push(total);
    }
    return { points: points, dists: dists, total: total };
  }

  function pathD(g) {
    return 'M ' + f1(g.S.x) + ' ' + f1(g.S.y) +
      ' L ' + f1(g.S1.x) + ' ' + f1(g.S1.y) +
      ' C ' + f1(g.c1.x) + ' ' + f1(g.c1.y) +
      ' ' + f1(g.c2.x) + ' ' + f1(g.c2.y) +
      ' ' + f1(g.E.x) + ' ' + f1(g.E.y);
  }

  function arrowD(g) {
    var d = sub(g.E, g.c2);
    var len = Math.sqrt(d.x * d.x + d.y * d.y);
    var ux, uy;
    if (len < 0.001) { ux = -g.nT.x; uy = -g.nT.y; } else { ux = d.x / len; uy = d.y / len; }
    var tip = g.E;
    var bx = tip.x - ux * G.arrowLen;
    var by = tip.y - uy * G.arrowLen;
    var px2 = -uy, py2 = ux;
    var a = { x: bx + px2 * G.arrowHalf, y: by + py2 * G.arrowHalf };
    var b = { x: bx - px2 * G.arrowHalf, y: by - py2 * G.arrowHalf };
    return 'M ' + f1(tip.x) + ' ' + f1(tip.y) +
      ' L ' + f1(a.x) + ' ' + f1(a.y) +
      ' L ' + f1(b.x) + ' ' + f1(b.y) + ' Z';
  }

  /* ---------------- 路径构建 ---------------- */

  /* 面向型（right→left / bottom→top 等）沿法线的走廊宽度；非面向型返回 0 */
  function facingWidth(S, E, sf, st) {
    if (sf === 'right' && st === 'left') return E.x - S.x;
    if (sf === 'left' && st === 'right') return S.x - E.x;
    if (sf === 'bottom' && st === 'top') return E.y - S.y;
    if (sf === 'top' && st === 'bottom') return S.y - E.y;
    return 0;
  }

  /**
   * 依据两端选边生成路径几何。
   * opts.clearance：同侧绕行时覆盖默认外扩量（用于避障加深）。
   */
  function makeGeo(A, B, sf, st, opts) {
    opts = opts || {};
    var nF = SIDE_N[sf] || SIDE_N.right;
    var nT = SIDE_N[st] || SIDE_N.left;
    var S = offsetPoint(anchorOf(A, sf), nF, G.offset);
    var E = offsetPoint(anchorOf(B, st), nT, G.offset);
    var same = sf === st;
    var stub, pull, clearance = 0;

    if (same) {
      clearance = opts.clearance;
      if (!(clearance > 0)) {
        clearance = clamp(sideRoom(A, B, sf) * 0.45, G.clearMin, G.clearMax);
      }
      stub = clamp(clearance * 0.4, 6, 12);
      /* 贝塞尔中点最深 ≈ 均值 + 0.75*pull；令最深 = 该侧边界外 clearance */
      pull = Math.max(3, (clearance - G.offset - stub / 2) / 0.75);
    } else {
      var w = facingWidth(S, E, sf, st);
      if (w > 0) {
        stub = clamp(w * 0.18, G.stubMin, G.stubMax);
        pull = clamp((w - stub) * 0.45, 3, 60);
      } else {
        var dd = dist(S, E);
        if (!(dd > 0)) dd = 1;
        stub = clamp(dd * 0.16, 6, G.stubMax);
        pull = clamp(dd * 0.3, 8, 56);
      }
    }

    var S1 = { x: S.x + nF.x * stub, y: S.y + nF.y * stub };
    var c1 = { x: S1.x + nF.x * pull, y: S1.y + nF.y * pull };
    var c2 = { x: E.x + nT.x * pull, y: E.y + nT.y * pull };

    return {
      A: A, B: B,
      sides: [sf, st],
      nF: nF, nT: nT,
      S: S, S1: S1, c1: c1, c2: c2, E: E,
      stub: stub, pull: pull, clearance: clearance
    };
  }

  /* 路径（去掉端点 2px 邻域）是否落入 from/to 包围盒 */
  function geoClear(g, A, B) {
    var s = pathSamples(g, 48);
    var i;
    for (i = 0; i < s.points.length; i++) {
      var f = s.dists[i];
      if (f <= G.offset + 0.05) continue;           // 起点 2px 邻域
      if (s.total - f <= G.offset + 0.05) continue; // 终点 2px 邻域
      if (insideRect(s.points[i], A) || insideRect(s.points[i], B)) return false;
    }
    return true;
  }

  /* ---------------- 走廊/路线遮挡判定（第三个对象） ----------------
   * 主判定用“几何 + 最近公共祖先子树”，与视口可见性无关：
   *   目标在视口外时 elementFromPoint 不可用，若只靠它就会误判“走廊无遮挡”而直连穿对象。
   *   这里在 from/to 最近公共祖先（NCA）子树里收集内容元素矩形，与直连走廊矩形做相交判定；
   *   端点自身/子节点/祖先容器/自身叠加层与其它组件叠加层都排除。
   * elementFromPoint 只在走廊位于视口内时做辅助抽查（覆盖 NCA 之外的 fixed 层）。
   * 几何判定不可用（异常/NCA 取不到）时保守当作“有遮挡”，一律走外侧绕行。
   */

  function canProbe() {
    return typeof document.elementFromPoint === 'function';
  }

  /* 命中的元素是否构成“遮挡”：端点自身/子元素/祖先容器/页面根都不算 */
  function pointBlocked(x, y, fromEl, toEl) {
    if (!canProbe()) return false;
    var w = global.innerWidth || 0;
    var h = global.innerHeight || 0;
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    var hit;
    try { hit = document.elementFromPoint(x, y); } catch (err) { return false; }
    if (!hit || hit.nodeType !== 1) return false;
    if (hit === fromEl || hit === toEl) return false;
    if (fromEl.contains(hit) || toEl.contains(hit)) return false;
    if (hit.contains(fromEl) || hit.contains(toEl)) return false;
    var tag = hit.nodeName;
    if (tag === 'HTML' || tag === 'BODY') return false;
    return true;
  }

  function nearestCommonAncestor(a, b) {
    var set = [];
    var n = a;
    while (n && n.nodeType === 1) { set.push(n); n = n.parentNode; }
    n = b;
    while (n && n.nodeType === 1) {
      for (var i = 0; i < set.length; i++) if (set[i] === n) return n;
      n = n.parentNode;
    }
    return document.documentElement;
  }

  /* 元素是否“可见内容”（display:none / visibility:hidden / opacity:0 不算遮挡）；结果缓存在 c.vis */
  function isVisibleObstacle(c) {
    if (c.vis !== -1) return c.vis === 1;
    var cs = null;
    try { cs = global.getComputedStyle(c.el); } catch (err) { cs = null; }
    var ok = !!cs && cs.display !== 'none' && cs.visibility !== 'hidden' && !(parseFloat(cs.opacity) === 0);
    c.vis = ok ? 1 : 0;
    return ok;
  }

  /* 收集 NCA 子树里“可能与路线相关”的内容元素矩形；rects=null 表示几何判定不可用 */
  function makeProbeCtx(fromEl, toEl) {
    var ctx = { rects: null, fromEl: fromEl, toEl: toEl };
    if (!fromEl || !toEl) return ctx;
    var nca = null;
    try { nca = nearestCommonAncestor(fromEl, toEl); } catch (err) { nca = null; }
    if (!nca || typeof nca.querySelectorAll !== 'function') return ctx;
    var nodes;
    try { nodes = nca.querySelectorAll('*'); } catch (err) { return ctx; }
    var list = [];
    for (var i = 0; i < nodes.length; i++) {
      var e = nodes[i];
      if (e === fromEl || e === toEl) continue;
      if (fromEl.contains(e) || toEl.contains(e)) continue;   /* 端点内部 */
      if (e.contains(fromEl) || e.contains(toEl)) continue;   /* 端点祖先容器 */
      if (e.closest && e.closest('.nx-link, .nx-focus, .nx-range')) continue; /* 各组件叠加层 */
      var tag = e.nodeName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'META' ||
          tag === 'TITLE' || tag === 'HEAD' || tag === 'TEMPLATE' || tag === 'NOSCRIPT') continue;
      var r = e.getBoundingClientRect();
      if (!(r.width > 0.5 && r.height > 0.5)) continue;
      list.push({ el: e, left: r.left, top: r.top, right: r.right, bottom: r.bottom, vis: -1 });
    }
    ctx.rects = list;
    return ctx;
  }

  /* 直连走廊矩形：沿连接方向的空隙 × 垂直于连接方向的两对象交叠带（无交叠时取中心连线带） */
  function corridorRect(A, B, axis) {
    if (axis === 'h') {
      var x1, x2;
      if (A.right <= B.left) { x1 = A.right; x2 = B.left; } else { x1 = B.right; x2 = A.left; }
      if (x2 - x1 < G.probeMin) return null;
      var yTop = Math.max(A.top, B.top);
      var yBot = Math.min(A.bottom, B.bottom);
      if (yBot - yTop < 2) {
        var ca = A.top + A.height / 2, cb = B.top + B.height / 2;
        yTop = Math.min(ca, cb);
        yBot = Math.max(ca, cb);
        if (yBot - yTop < 2) { yTop = Math.min(A.top, B.top); yBot = Math.max(A.bottom, B.bottom); }
      }
      return { left: x1, right: x2, top: yTop, bottom: yBot };
    }
    var y1, y2;
    if (A.bottom <= B.top) { y1 = A.bottom; y2 = B.top; } else { y1 = B.bottom; y2 = A.top; }
    if (y2 - y1 < G.probeMin) return null;
    var xLeft = Math.max(A.left, B.left);
    var xRight = Math.min(A.right, B.right);
    if (xRight - xLeft < 2) {
      var cc = A.left + A.width / 2, cd = B.left + B.width / 2;
      xLeft = Math.min(cc, cd);
      xRight = Math.max(cc, cd);
      if (xRight - xLeft < 2) { xLeft = Math.min(A.left, B.left); xRight = Math.max(A.right, B.right); }
    }
    return { left: xLeft, right: xRight, top: y1, bottom: y2 };
  }

  function rectsBlocked(list, rect) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.right <= rect.left || c.left >= rect.right || c.bottom <= rect.top || c.top >= rect.bottom) continue;
      if (isVisibleObstacle(c)) return true;
    }
    return false;
  }

  /* 直连走廊是否被第三个对象占据（几何主判定，与可见性无关；视口内再加 elementFromPoint 辅助） */
  function corridorBlocked(A, B, axis, ctx) {
    if (!ctx) return false;
    var rect = corridorRect(A, B, axis);
    if (!rect) return true;
    if (ctx.rects === null) return true;               /* 几何判定不可用 -> 保守绕行 */
    if (rectsBlocked(ctx.rects, rect)) return true;
    if (!canProbe()) return false;
    var w = global.innerWidth || 0;
    var h = global.innerHeight || 0;
    if (rect.right <= 0 || rect.left >= w || rect.bottom <= 0 || rect.top >= h) return false;
    var i;
    var xs = [], ys = [];
    for (i = 1; i <= 5; i++) xs.push(rect.left + (rect.right - rect.left) * i / 6);
    ys = [
      rect.top + (rect.bottom - rect.top) * 0.25,
      (rect.top + rect.bottom) / 2,
      rect.bottom - (rect.bottom - rect.top) * 0.25
    ];
    for (var a = 0; a < xs.length; a++) {
      for (var b = 0; b < ys.length; b++) {
        if (xs[a] < 0 || xs[a] >= w || ys[b] < 0 || ys[b] >= h) continue;
        if (pointBlocked(xs[a], ys[b], ctx.fromEl, ctx.toEl)) return true;
      }
    }
    return false;
  }

  /* 同侧绕行的中段是否被第三个对象压住（几何判定，与可见性无关） */
  function routeBlocked(g, ctx) {
    if (!ctx || !ctx.rects || !ctx.rects.length) return false;
    var s = pathSamples(g, 30);
    var list = ctx.rects;
    for (var i = 0; i < s.points.length; i++) {
      var f = s.dists[i];
      if (f < s.total * 0.25 || s.total - f < s.total * 0.25) continue;
      var p = s.points[i];
      for (var j = 0; j < list.length; j++) {
        var c = list[j];
        if (p.x <= c.left || p.x >= c.right || p.y <= c.top || p.y >= c.bottom) continue;
        if (isVisibleObstacle(c)) return true;
      }
    }
    return false;
  }

  /* 同侧绕行被第三个对象压住时，加深外扩（最多两档），仍不行就用最深的可行几何 */
  function deepenRoute(g, A, B, ctx) {
    if (!routeBlocked(g, ctx)) return g;
    var side = g.sides[0];
    if (side !== 'bottom' && side !== 'top') return g;
    var room = sideRoom(A, B, side);
    var best = g;
    for (var k = 1; k <= 2; k++) {
      var c = (g.clearance || 0) + k * 14;
      if (c > room - 4) break;
      var cand = makeGeo(A, B, side, side, { clearance: c });
      if (!geoClear(cand, A, B)) continue;
      best = cand;
      if (!routeBlocked(cand, ctx)) return cand;
    }
    return best;
  }

  /* 同侧候选顺序：默认底侧；底侧无空间则顶侧；上下都走不通时退化为左右同侧 */
  function sameSideOrder(A, B) {
    var roomB = sideRoom(A, B, 'bottom');
    var roomT = sideRoom(A, B, 'top');
    var first;
    if (roomB >= G.roomMin) first = 'bottom';
    else if (roomT >= G.roomMin) first = 'top';
    else first = roomB >= roomT ? 'bottom' : 'top';
    var second = first === 'bottom' ? 'top' : 'bottom';
    var roomR = sideRoom(A, B, 'right');
    var roomL = sideRoom(A, B, 'left');
    var lateral = roomR >= roomL ? ['right', 'left'] : ['left', 'right'];
    return [first, second, lateral[0], lateral[1]];
  }

  /* 自动选边 + 几何构建；probe=true 时做第三个对象探测（几何判定，与视口可见性无关） */
  function chooseAutoGeo(A, B, probe, fromEl, toEl) {
    var sx = sepX(A, B);
    var sy = sepY(A, B);
    var direct = [];
    var i, geo;
    var ctx = probe ? makeProbeCtx(fromEl, toEl) : null;
    if (sx.gap > G.gap) {
      var hp = sx.dir > 0 ? ['right', 'left'] : ['left', 'right'];
      if (!(probe && corridorBlocked(A, B, 'h', ctx))) direct.push(hp);
    }
    if (sy.gap > G.gap) {
      var vp = sy.dir > 0 ? ['bottom', 'top'] : ['top', 'bottom'];
      if (!(probe && corridorBlocked(A, B, 'v', ctx))) direct.push(vp);
    }
    for (i = 0; i < direct.length; i++) {
      geo = makeGeo(A, B, direct[i][0], direct[i][1]);
      if (geoClear(geo, A, B)) return geo;
    }
    var order = sameSideOrder(A, B);
    for (i = 0; i < order.length; i++) {
      geo = makeGeo(A, B, order[i], order[i]);
      if (!geoClear(geo, A, B)) continue;
      if (probe) geo = deepenRoute(geo, A, B, ctx);
      return geo;
    }
    /* 极端视口兜底：底侧同侧 */
    return makeGeo(A, B, 'bottom', 'bottom');
  }

  /* ---------------- 标签定位 ---------------- */

  function labelBoxAt(mid, n, w, h, gap) {
    var support = Math.abs(n.x) * w / 2 + Math.abs(n.y) * h / 2;
    var cx = mid.x + n.x * (gap + support);
    var cy = mid.y + n.y * (gap + support);
    return { left: cx - w / 2, top: cy - h / 2, width: w, height: h, nx: n.x, ny: n.y };
  }

  function boxInViewport(box) {
    var w = global.innerWidth || 0;
    var h = global.innerHeight || 0;
    var pad = G.edgePad;
    return box.left >= pad && box.top >= pad &&
      box.left + box.width <= w - pad && box.top + box.height <= h - pad;
  }

  function clampBox(box) {
    var w = global.innerWidth || 0;
    var h = global.innerHeight || 0;
    var pad = G.edgePad;
    box.left = clamp(box.left, pad, Math.max(pad, w - box.width - pad));
    box.top = clamp(box.top, pad, Math.max(pad, h - box.height - pad));
    return box;
  }

  /* 曲线中点垂线方向：优先指向“远离两对象包围盒中心”的一侧 */
  function labelNormalAt(g) {
    var mid = cubicAt(g, 0.5);
    var tan = unit(cubicDeriv(g.S1, g.c1, g.c2, g.E, 0.5));
    var n = { x: -tan.y, y: tan.x };
    var u = unionRect(g.A, g.B);
    var uc = rectCenter(u);
    var vx = mid.x - uc.x, vy = mid.y - uc.y;
    var vlen = Math.sqrt(vx * vx + vy * vy);
    var dot = n.x * vx + n.y * vy;
    if (Math.abs(dot) < Math.max(1, vlen * 0.2)) {
      /* 外侧不明确：水平走向默认上方，垂直走向默认右方 */
      if (Math.abs(n.y) >= Math.abs(n.x)) {
        if (n.y > 0) n = { x: -n.x, y: -n.y };
      } else if (n.x < 0) {
        n = { x: -n.x, y: -n.y };
      }
    } else if (dot < 0) {
      n = { x: -n.x, y: -n.y };
    }
    return n;
  }

  /* ---------------- 注册表 ---------------- */

  function mount(options) {
    options = options || {};
    var motionOpt = options.motion === 'always' || options.motion === 'never' ? options.motion : 'auto';
    var destroyed = false;

    var root = document.createElement('div');
    root.className = 'nx-link';
    root.setAttribute('data-nx-component', 'link');
    root.setAttribute('data-nx-state', 'idle');
    root.setAttribute('aria-hidden', 'true');
    if (options.zIndex !== undefined && options.zIndex !== null) {
      var z = options.zIndex;
      if (typeof z === 'number' && isFinite(z)) root.style.setProperty('--nx-z', String(z));
      else if (typeof z === 'string' && z) root.style.setProperty('--nx-z', z);
    }
    (document.body || document.documentElement).appendChild(root);

    var els = { svg: null, path: null, arrow: null, dot: null, label: null };
    var state = {
      visible: false,
      from: null,
      to: null,
      label: '',
      arrow: true,
      fromSide: null,
      toSide: null,
      plan: null
    };

    var anims = [];
    var ghosts = [];
    var timers = [];
    var rafId = 0;
    var pendingFullProbe = false;
    var ro = null;
    var reduceMq = typeof global.matchMedia === 'function'
      ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;

    var view = {};
    view.el = root;
    view.version = VERSION;

    var observeEnabled = options.observe !== false;
    var geometryProvider = normalizeGeometry(options.geometry);
    var viewportListening = false;

    /* 监听与观察器跟随 observe 开关：受控测量时完全不参与自动重定位，显式 show/refresh 仍工作。 */
    function attachViewportListeners() {
      if (viewportListening) return;
      global.addEventListener('scroll', onScroll, true);
      global.addEventListener('resize', onResize);
      viewportListening = true;
    }

    function detachViewportListeners() {
      if (!viewportListening) return;
      global.removeEventListener('scroll', onScroll, true);
      global.removeEventListener('resize', onResize);
      viewportListening = false;
    }

    function disconnectObserver() {
      if (!ro) return;
      try { ro.disconnect(); } catch (err) { /* ignore */ }
    }

    function setObserveEnabled(enabled) {
      if (observeEnabled === enabled) return;
      observeEnabled = enabled;
      if (enabled) attachViewportListeners();
      else {
        detachViewportListeners();
        disconnectObserver();
      }
    }

    function nodeRect(node) {
      return rectOf(node, geometryProvider);
    }

    /* ---------- 动效开关 ---------- */

    function systemReduced() {
      return !!(reduceMq && reduceMq.matches);
    }

    function shouldAnimate() {
      if (motionOpt === 'never') return false;
      if (motionOpt === 'always') return true;
      return !systemReduced();
    }

    function track(anim) {
      if (anim) anims.push(anim);
      return anim;
    }

    /* 收尾即取消：动画终帧与基础样式一致（淡入 / 整条描线），结束时移除动画对象，
       避免 document.getAnimations() 里长期挂着已完成的 fill:both 动画 */
    function trackSettled(anim) {
      if (!anim) return anim;
      anims.push(anim);
      anim.onfinish = function () {
        var i = anims.indexOf(anim);
        if (i >= 0) anims.splice(i, 1);
        try { anim.cancel(); } catch (err) { /* 已取消 */ }
      };
      return anim;
    }

    function cancelAnims() {
      var i;
      for (i = 0; i < anims.length; i++) {
        try { anims[i].cancel(); } catch (err) { /* 已结束/已取消 */ }
      }
      anims.length = 0;
    }

    function clearGhosts() {
      var i, node;
      for (i = 0; i < ghosts.length; i++) {
        node = ghosts[i];
        if (node && node.parentNode) node.parentNode.removeChild(node);
      }
      ghosts.length = 0;
    }

    function addTimer(fn, ms) {
      var id = global.setTimeout(function () {
        var i = timers.indexOf(id);
        if (i >= 0) timers.splice(i, 1);
        fn();
      }, ms);
      timers.push(id);
      return id;
    }

    function clearTimers() {
      var i;
      for (i = 0; i < timers.length; i++) global.clearTimeout(timers[i]);
      timers.length = 0;
    }

    function stopMotion() {
      cancelAnims();
      clearGhosts();
      clearTimers();
    }

    /* ---------- DOM 构建 ---------- */

    function createSvgEl(tag, cls) {
      var node = document.createElementNS(SVG_NS, tag);
      if (cls) node.setAttribute('class', cls);
      return node;
    }

    function ensureSvg() {
      if (els.svg) return els.svg;
      var svg = createSvgEl('svg', 'nx-link__svg');
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      var path = createSvgEl('path', 'nx-link__path');
      svg.appendChild(path);
      els.svg = svg;
      els.path = path;
      if (els.label && els.label.parentNode === root) root.insertBefore(svg, els.label);
      else root.appendChild(svg);
      return svg;
    }

    function ensureArrow() {
      ensureSvg();
      if (!els.arrow) {
        var arrow = createSvgEl('path', 'nx-link__arrow');
        els.svg.appendChild(arrow);
        els.arrow = arrow;
      }
      if (!els.dot) {
        var dot = createSvgEl('circle', 'nx-link__dot');
        dot.setAttribute('r', f1(G.dotR));
        els.svg.appendChild(dot);
        els.dot = dot;
      }
    }

    function ensureLabel() {
      if (els.label) return els.label;
      var node = document.createElement('div');
      node.className = 'nx-link__label';
      root.appendChild(node);
      els.label = node;
      return node;
    }

    function removeLabel() {
      if (els.label && els.label.parentNode) els.label.parentNode.removeChild(els.label);
      els.label = null;
    }

    function clearContent() {
      stopMotion();
      clearGhosts();
      removeLabel();
      if (els.svg && els.svg.parentNode) els.svg.parentNode.removeChild(els.svg);
      els = { svg: null, path: null, arrow: null, dot: null, label: null };
      state.plan = null;
      root.setAttribute('data-nx-state', 'idle');
    }

    /* ---------- 渲染 ---------- */

    function renderPlan(plan) {
      ensureSvg();
      els.path.setAttribute('d', pathD(plan));
      if (plan.arrow) {
        ensureArrow();
        els.arrow.setAttribute('d', arrowD(plan));
        els.dot.setAttribute('cx', f1(plan.S.x));
        els.dot.setAttribute('cy', f1(plan.S.y));
        els.dot.setAttribute('r', f1(G.dotR));
      } else {
        if (els.arrow && els.arrow.parentNode) els.arrow.parentNode.removeChild(els.arrow);
        if (els.dot && els.dot.parentNode) els.dot.parentNode.removeChild(els.dot);
        els.arrow = null;
        els.dot = null;
      }
      if (plan.label) {
        var node = ensureLabel();
        node.textContent = plan.label;
        placeLabel(plan);
      } else {
        removeLabel();
      }
      root.setAttribute('data-nx-state', 'shown');
    }

    function placeLabel(plan) {
      var node = els.label;
      if (!node) return;
      var vw = global.innerWidth || 0;
      node.style.maxWidth = Math.max(80, Math.min(G.labelMax, vw - G.edgePad * 2)) + 'px';
      var w = node.offsetWidth || 1;
      var h = node.offsetHeight || 1;
      var mid = cubicAt(plan, 0.5);
      var n = labelNormalAt(plan);
      var box = labelBoxAt(mid, n, w, h, G.labelGap);
      /* 只有曲线中点自身靠近视口时才做“换边/夹紧”；中点远在视口外时保持与曲线相对位置，
         避免页面滚动中标签被吸到视口边缘、与线脱节（滚回来时重定位会再校正） */
      var vh = global.innerHeight || 0;
      if (mid.x > -60 && mid.x < vw + 60 && mid.y > -60 && mid.y < vh + 60) {
        if (!boxInViewport(box)) {
          var alt = labelBoxAt(mid, { x: -n.x, y: -n.y }, w, h, G.labelGap);
          if (boxInViewport(alt)) box = alt;
          else clampBox(box);
        }
      }
      node.style.left = px(box.left);
      node.style.top = px(box.top);
    }

    function geometryKey(plan) {
      if (!plan) return '';
      return pathD(plan) + '|' + (plan.arrow ? arrowD(plan) : '-');
    }

    /* ---------- 方案计算 ---------- */

    function currentSpec() {
      return {
        from: state.from, to: state.to,
        label: state.label, arrow: state.arrow,
        fromSide: state.fromSide, toSide: state.toSide
      };
    }

    function makePlan(A, B, spec, probe) {
      var geo;
      if (spec.fromSide && spec.toSide) {
        geo = makeGeo(A, B, spec.fromSide, spec.toSide);
      } else if (spec.fromSide || spec.toSide) {
        var auto = chooseAutoGeo(A, B, false, spec.from, spec.to);
        geo = makeGeo(A, B, spec.fromSide || auto.sides[0], spec.toSide || auto.sides[1]);
      } else {
        geo = chooseAutoGeo(A, B, probe !== false, spec.from, spec.to);
      }
      geo.label = spec.label;
      geo.arrow = spec.arrow;
      geo.pairInViewport = pairInViewport(A, B);
      geo.autoMode = !spec.fromSide && !spec.toSide;
      return geo;
    }

    /* reuseSides=true：滚动等高频重定位沿用上次自动选边，避免选边在滚动中来回跳；
       复用前仍校验几何合法，不合法再走完整自动选边 */
    function measurePlan(probe, reuseSides) {
      var A = nodeRect(state.from);
      var B = nodeRect(state.to);
      if (!rectValid(A) || !rectValid(B)) return null;
      var spec = currentSpec();
      if (reuseSides && !spec.fromSide && !spec.toSide && state.plan && state.plan.sides) {
        var geo = makeGeo(A, B, state.plan.sides[0], state.plan.sides[1]);
        if (geoClear(geo, A, B)) {
          geo.label = spec.label;
          geo.arrow = spec.arrow;
          geo.pairInViewport = pairInViewport(A, B);
          geo.autoMode = !spec.fromSide && !spec.toSide;
          return geo;
        }
      }
      return makePlan(A, B, spec, probe);
    }

    /* ---------- 动画片段 ---------- */

    function drawFrames(len) {
      return [
        { strokeDasharray: len + ' ' + len, strokeDashoffset: len },
        { strokeDasharray: len + ' ' + len, strokeDashoffset: 0 }
      ];
    }

    function pathLength() {
      if (!els.path || typeof els.path.getTotalLength !== 'function') return 0;
      try {
        var len = els.path.getTotalLength();
        return isFinite(len) ? len : 0;
      } catch (err) { return 0; }
    }

    function drawPath(duration) {
      if (!els.path) return;
      var len = pathLength();
      if (!(len > 0.5)) return;
      trackSettled(els.path.animate(drawFrames(len), {
        duration: duration, easing: EASE, fill: 'both'
      }));
    }

    function fadeIn(node, duration, dy) {
      if (!node) return;
      var from = { opacity: 0 };
      var to = { opacity: 1 };
      if (dy) {
        from.transform = 'translateY(' + dy + 'px)';
        to.transform = 'translateY(0px)';
      }
      trackSettled(node.animate([from, to], {
        duration: duration, easing: EASE_OUT, fill: 'both'
      }));
    }

    function fadeOut(node, duration) {
      if (!node) return;
      track(node.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: duration, easing: 'ease-out', fill: 'forwards'
      }));
    }

    /* 首次显示 */
    function animateIn() {
      if (!shouldAnimate()) return;
      drawPath(DUR.draw);
      fadeIn(els.arrow, DUR.arrow, 0);
      fadeIn(els.dot, DUR.arrow, 0);
      fadeIn(els.label, DUR.label, 2);
    }

    /* 更新：旧几何/旧标签做幽灵淡出，新几何描线重绘 */
    function animateUpdate(ghostsIn, geometryChanged, labelChanged) {
      if (!shouldAnimate()) { clearGhosts(); return; }
      var i;
      for (i = 0; i < ghostsIn.length; i++) fadeOut(ghostsIn[i], DUR.ghost);
      if (ghostsIn.length) addTimer(clearGhosts, DUR.redraw);
      if (geometryChanged) {
        drawPath(DUR.redraw);
        fadeIn(els.arrow, DUR.arrow, 0);
        fadeIn(els.dot, DUR.arrow, 0);
      }
      if (geometryChanged || labelChanged) fadeIn(els.label, DUR.label, 2);
    }

    function captureGhosts(geometryChanged, labelChanged) {
      clearGhosts();
      if (!state.plan || !els.svg) return [];
      var list = [];
      if (geometryChanged) {
        if (els.path) list.push(addGhost(els.path, 'nx-link__ghost', els.svg));
        if (els.arrow) list.push(addGhost(els.arrow, 'nx-link__ghost nx-link__ghost--arrow', els.svg));
        if (els.dot) list.push(addGhost(els.dot, 'nx-link__ghost nx-link__ghost--dot', els.svg));
      }
      if (labelChanged && els.label) {
        list.push(addGhost(els.label, 'nx-link__ghost-label', root));
      }
      return list;
    }

    function addGhost(node, cls, parent) {
      var clone = node.cloneNode(true);
      clone.setAttribute('class', cls);
      parent.appendChild(clone);
      ghosts.push(clone);
      return clone;
    }

    /* ---------- 观察与重定位 ---------- */

    function syncObservers() {
      if (!observeEnabled) return;
      if (typeof global.ResizeObserver !== 'function') return;
      if (!ro) {
        ro = new global.ResizeObserver(function () {
          if (!observeEnabled) return;
          scheduleRelayout(true);
        });
      }
      try { ro.disconnect(); } catch (err) { /* ignore */ }
      var targets = [state.from, state.to, document.body];
      for (var i = 0; i < targets.length; i++) {
        if (!targets[i]) continue;
        try { ro.observe(targets[i]); } catch (err) { /* ignore */ }
      }
    }

    function targetsAlive() {
      return connected(state.from) && connected(state.to);
    }

    function relayout(fullProbe) {
      if (destroyed || !state.visible) return;
      if (!targetsAlive()) { hide(); return; }
      var plan = fullProbe ? measurePlan(true, false) : measurePlan(false, true);
      if (!plan) { hide(); return; }
      /* 方案生成时两个端点都在视口外，首次滚动到可见后做一次完整自动选边重规划：
         丢掉“视口外只能按页面空间近似”的暂定方案，避免与可见时的默认选边不一致；
         只重规划这一下，之后仍沿用选边，不会随滚动来回抖。 */
      if (state.plan && state.plan.autoMode && state.plan.pairInViewport === false && plan.pairInViewport === true) {
        plan = measurePlan(true, false);
        if (!plan) { hide(); return; }
      }
      /* 几何没变就不打断进行中的显示/更新动画（ResizeObserver 首帧回调、原地滚动都会走到这里）；
         只有真正重定位（SPEC §4：动画中遇到重定位）才取消动画、直接落到最终几何 */
      if (state.plan && geometryKey(plan) === geometryKey(state.plan) &&
          plan.label === state.plan.label && plan.arrow === state.plan.arrow) {
        return;
      }
      stopMotion();
      state.plan = plan;
      renderPlan(plan);
    }

    function scheduleRelayout(fullProbe) {
      if (destroyed || !state.visible || !observeEnabled) return;
      if (fullProbe) pendingFullProbe = true;
      if (rafId) return;
      if (typeof global.requestAnimationFrame !== 'function') {
        var full = pendingFullProbe;
        pendingFullProbe = false;
        relayout(full);
        return;
      }
      rafId = global.requestAnimationFrame(function () {
        rafId = 0;
        var full = pendingFullProbe;
        pendingFullProbe = false;
        relayout(full);
      });
    }

    /* 滚动＝高频，沿用选边；resize / ResizeObserver＝低频，重新做完整自动选边 */
    function onScroll() {
      if (!observeEnabled) return;
      scheduleRelayout(false);
    }

    function onResize() {
      if (!observeEnabled) return;
      scheduleRelayout(true);
    }

    function onReduceChange() {
      if (!systemReduced()) return;
      if (state.visible) stopMotion();
      else clearContent();
    }

    /* ---------- 参数校验 ---------- */

    function readSide(value) {
      if (value === undefined || value === null || value === 'auto') return null;
      for (var i = 0; i < SIDE_LIST.length; i++) if (SIDE_LIST[i] === value) return value;
      throw new Error('NoteExpr.Link: side 只能是 top/right/bottom/left，收到 "' + value + '"');
    }

    function readShowArgs(args) {
      if (!args || typeof args !== 'object') {
        throw new Error('NoteExpr.Link: show({ from, to, label?, arrow?, fromSide?, toSide? }) 需要一个对象参数');
      }
      if (!isElement(args.from)) throw new Error('NoteExpr.Link: from 必须是 DOM 元素');
      if (!isElement(args.to)) throw new Error('NoteExpr.Link: to 必须是 DOM 元素');
      if (args.from === args.to) throw new Error('NoteExpr.Link: from 与 to 不能是同一个元素');
      var label = args.label === undefined || args.label === null ? '' : String(args.label);
      return {
        from: args.from,
        to: args.to,
        label: label,
        arrow: args.arrow === undefined ? true : !!args.arrow,
        fromSide: readSide(args.fromSide),
        toSide: readSide(args.toSide),
        observe: args.observe,
        geometry: args.geometry
      };
    }

    /* ---------- 接口实现 ---------- */

    function show(args) {
      if (destroyed) return view;
      var spec = readShowArgs(args);
      if (spec.observe !== undefined) setObserveEnabled(spec.observe !== false);
      if (spec.geometry !== undefined) geometryProvider = normalizeGeometry(spec.geometry);
      var A = nodeRect(spec.from);
      var B = nodeRect(spec.to);
      if (!rectValid(A) || !rectValid(B)) {
        throw new Error('NoteExpr.Link: from/to 必须是已挂载且有尺寸的可见元素');
      }
      var plan = makePlan(A, B, spec, true);
      var wasVisible = state.visible;
      var prev = state.plan;
      var geometryChanged = !prev || geometryKey(prev) !== geometryKey(plan);
      var labelChanged = !prev || prev.label !== plan.label;
      var arrowChanged = !prev || prev.arrow !== plan.arrow;
      var anyChange = !wasVisible || geometryChanged || labelChanged || arrowChanged;

      stopMotion();
      if (!wasVisible) clearContent();

      state.from = spec.from;
      state.to = spec.to;
      state.label = spec.label;
      state.arrow = spec.arrow;
      state.fromSide = spec.fromSide;
      state.toSide = spec.toSide;

      /* 无动效路径（motion:'never' / 系统 reduce）直接呈现终态：不克隆幽灵节点，
         否则会在 DOM 里永久残留旧线/旧文字（QA 缺陷回归点） */
      var ghostsIn = (wasVisible && shouldAnimate()) ? captureGhosts(geometryChanged, labelChanged) : [];
      state.visible = true;
      state.plan = plan;
      renderPlan(plan);
      if (!wasVisible) {
        animateIn();
      } else if (anyChange) {
        animateUpdate(ghostsIn, geometryChanged, labelChanged);
      } else {
        clearGhosts();
      }
      syncObservers();
      return view;
    }

    function hide() {
      if (destroyed) return view;
      if (!state.visible) {
        disconnectObserver();
        clearContent();
        return view;
      }
      stopMotion();
      state.visible = false;
      disconnectObserver();
      var nodes = [];
      if (els.svg) nodes.push(els.svg);
      if (els.label) nodes.push(els.label);
      if (!shouldAnimate() || !nodes.length) {
        clearContent();
        return view;
      }
      for (var i = 0; i < nodes.length; i++) fadeOut(nodes[i], DUR.hide);
      addTimer(clearContent, DUR.hide);
      return view;
    }

    function refresh() {
      if (destroyed) return view;
      if (!state.visible) return view;
      if (!targetsAlive()) { hide(); return view; }
      var plan = measurePlan(true);
      if (!plan) { hide(); return view; }
      stopMotion();
      state.plan = plan;
      renderPlan(plan);
      return view;
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      if (rafId && typeof global.cancelAnimationFrame === 'function') {
        global.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      stopMotion();
      if (ro) {
        try { ro.disconnect(); } catch (err) { /* ignore */ }
        ro = null;
      }
      detachViewportListeners();
      if (reduceMq) {
        if (typeof reduceMq.removeEventListener === 'function') reduceMq.removeEventListener('change', onReduceChange);
        else if (typeof reduceMq.removeListener === 'function') reduceMq.removeListener(onReduceChange);
      }
      if (root.parentNode) root.parentNode.removeChild(root);
      els = { svg: null, path: null, arrow: null, dot: null, label: null };
      state.plan = null;
      state.visible = false;
    }

    /* ---------- 只读属性 ---------- */

    Object.defineProperty(view, 'visible', { get: function () { return state.visible; }, enumerable: true });
    Object.defineProperty(view, 'from', { get: function () { return state.from; }, enumerable: true });
    Object.defineProperty(view, 'to', { get: function () { return state.to; }, enumerable: true });
    Object.defineProperty(view, 'label', { get: function () { return state.label; }, enumerable: true });

    view.show = function (args) { return show(args); };
    view.hide = function () { return hide(); };
    view.refresh = function () { return refresh(); };
    view.destroy = function () { return destroy(); };

    /* ---------- 初始化 ---------- */

    if (observeEnabled) attachViewportListeners();
    if (reduceMq) {
      if (typeof reduceMq.addEventListener === 'function') reduceMq.addEventListener('change', onReduceChange);
      else if (typeof reduceMq.addListener === 'function') reduceMq.addListener(onReduceChange);
    }

    return view;
  }

  /* ---------------- 注册 ---------------- */

  var API = { version: VERSION, mount: mount };
  global.NoteExpr = global.NoteExpr || {};
  global.NoteExpr.Link = API;
})(window);

/* ---- source: src/viz/sequence-insert.js ---- */
/*!
 * 序列插入与让位 · 组件核心 v1.0.0
 * 依赖：无（原生 DOM + Web Animations API），file:// 直接可用。
 *
 * 挂载：
 *   var view = SeqInsert.mount(hostEl, {
 *     sequence: ['3','5','8','11'],          // 字符串或 { key, text }
 *     insert:   { text: '7', index: 2 },     // index 0..n，越界夹紧
 *     unit:     '项',
 *     labels:   { pending, done, position, total, shift, group },  // {position}{total}{unit}{count}{text}
 *     startInserted: false,
 *     onChange: function (state) {},         // 逻辑状态变化时立即调用
 *     onSettle: function (state) {}          // 运动结束（或无需运动）时调用一次
 *   });
 *
 *   view.insert({ animate: true });  view.restore({ animate: true });
 *   view.toggle({ animate: true });  view.replay({ animate: true });
 *   view.setData(data, { keepState: false });
 *   view.destroy();
 *
 * 只读：view.el / view.inserted / view.state / view.data / view.position
 * state = { inserted, index, position, total, moved, text, unit, sequence }
 *   inserted  当前停点（true = 插入后）
 *   index     插入下标 k（0..n）
 *   position  新元素位次 k+1
 *   total     插入后的总项数 n+1
 *   moved     让位元素数量 n-k
 *   text      新元素文字
 *   unit      量词
 *   sequence  原序列标准化副本 [{ key, text }]
 *
 * 职责边界：只做一次插入/让位的表达、几何与动效；不判断业务条件，
 * 不写全局样式，不引用外部资源。所有内容一律 textContent 写入。
 *
 * 几何契约（n=序列长度，k=插入下标，P=cardW+14，inset=14）：
 *   卡宽 cardW = min(最长文本自然宽 + 32, floor((组件宽 - 2*inset - n*14)/(n+1)), 132)，下限 48
 *   插入前：原卡 i 左缘 = inset + i*P；插入符中心 x = inset + k*P - 7；
 *           待插入卡左缘 = inset + k*P，顶边 = 行顶 - 64
 *   插入后：新卡左缘 = inset + k*P；原卡 j>=k 左缘 = inset + (j+1)*P；
 *           括线左缘 = inset + (k+1)*P，宽 = (n-k-1)*P + cardW
 *   组件内容高恒定 168px = 托盘 70 + 落位间隙 18 + 序列行 46 + 标记区 34
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';
  var EASE = 'cubic-bezier(.22,.68,.24,1)';
  var EASE_PAINT = 'cubic-bezier(.4,0,.2,1)';

  var DEFAULT_LABELS = {
    pending: '待插入',
    done: '已插入',
    position: '第 {position} 位',
    total: '共 {total} {unit}',
    shift: '{count} {unit}后移 1 位',
    group: '序列插入演示'
  };

  /* 几何与动效参数（与 CSS 的高度契约一致，集中在此便于核对） */
  var G = {
    inset: 14,
    gap: 14,
    cardH: 46,
    trayH: 70,
    rowGap: 18,
    marksH: 34,
    stageH: 168,
    cardTop: 24,        // 托盘内卡顶边 = 行顶(88) - 64
    rowTop: 88,
    marksTop: 134,
    caretW: 2,
    caretH: 26,
    caretTop: 10,
    bracketTop: 8,
    bracketH: 6,
    shiftDur: 320,
    fallDur: 360,
    paintDur: 240,
    caretDelay: 120,
    caretDur: 160,
    bracketDur: 200,
    bracketGap: 20,
    bracketOutDur: 140,
    step: 20,
    restoreDelay: 160,
    minTrip: 540,
    settlePad: 20
  };

  var LABEL_KEYS = ['pending', 'done', 'position', 'total', 'shift', 'group'];

  /* ---------------- 小工具 ---------------- */

  function h(tag, cls) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    return node;
  }

  function fmt(template, values) {
    return String(template).replace(/\{(position|total|unit|count|text)\}/g, function (match, name) {
      var v = values[name];
      return v === undefined || v === null ? '' : String(v);
    });
  }

  function displayText(text) {
    return text === '' ? '（空内容）' : text;
  }

  function rectOf(node) {
    var r = node.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }

  function paintStyle(node) {
    var cs = global.getComputedStyle(node);
    var shadow = cs.boxShadow;
    if (!shadow || shadow === 'none') shadow = '0 0 0 0 rgba(0, 0, 0, 0)';
    return {
      backgroundColor: cs.backgroundColor,
      color: cs.color,
      boxShadow: shadow,
      borderTopColor: cs.borderTopColor,
      borderRightColor: cs.borderRightColor,
      borderBottomColor: cs.borderBottomColor,
      borderLeftColor: cs.borderLeftColor,
      borderTopStyle: cs.borderTopStyle,
      borderRightStyle: cs.borderRightStyle,
      borderBottomStyle: cs.borderBottomStyle,
      borderLeftStyle: cs.borderLeftStyle
    };
  }

  function paintKeyframe(style) {
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      boxShadow: style.boxShadow,
      borderTopColor: style.borderTopColor,
      borderRightColor: style.borderRightColor,
      borderBottomColor: style.borderBottomColor,
      borderLeftColor: style.borderLeftColor,
      borderTopStyle: style.borderTopStyle,
      borderRightStyle: style.borderRightStyle,
      borderBottomStyle: style.borderBottomStyle,
      borderLeftStyle: style.borderLeftStyle
    };
  }

  /* ---------------- 数据标准化 ---------------- */

  function normalize(input) {
    input = input || {};
    var raw = [];
    var rawSeq = input.sequence;
    var i;
    if (rawSeq && typeof rawSeq.length === 'number') {
      for (i = 0; i < rawSeq.length; i++) raw.push(rawSeq[i]);
    }
    var seq = [];
    var seen = {};
    for (i = 0; i < raw.length; i++) {
      var item = raw[i];
      var key;
      var text;
      if (item && typeof item === 'object') {
        key = item.key === undefined || item.key === null ? 'o' + i : String(item.key);
        text = item.text === undefined || item.text === null ? '' : String(item.text);
      } else {
        key = 'o' + i;
        text = item === undefined || item === null ? '' : String(item);
      }
      if (key === '__new' || Object.prototype.hasOwnProperty.call(seen, key)) {
        var base = key;
        var n = 2;
        while (key === '__new' || Object.prototype.hasOwnProperty.call(seen, key)) {
          key = base + '~' + n;
          n += 1;
        }
      }
      seen[key] = true;
      seq.push({ key: key, text: text });
    }

    var ins = input.insert || {};
    var length = seq.length;
    var index = typeof ins.index === 'number' && isFinite(ins.index) ? Math.round(ins.index) : length;
    if (index < 0) index = 0;
    if (index > length) index = length;

    var labels = {};
    var k;
    for (k = 0; k < LABEL_KEYS.length; k++) labels[LABEL_KEYS[k]] = DEFAULT_LABELS[LABEL_KEYS[k]];
    if (input.labels && typeof input.labels === 'object') {
      for (k = 0; k < LABEL_KEYS.length; k++) {
        var name = LABEL_KEYS[k];
        var value = input.labels[name];
        if (typeof value === 'string') labels[name] = value;
      }
    }

    return {
      sequence: seq,
      insert: {
        text: ins.text === undefined || ins.text === null ? '' : String(ins.text),
        index: index
      },
      unit: input.unit === undefined || input.unit === null ? '项' : String(input.unit),
      labels: labels,
      startInserted: !!input.startInserted
    };
  }

  /* ---------------- 实例 ---------------- */

  function mount(host, options) {
    if (!host || host.nodeType !== 1) {
      throw new TypeError('SeqInsert.mount(host, options)：host 必须是 DOM 元素');
    }
    options = options || {};

    var onChange = typeof options.onChange === 'function' ? options.onChange : null;
    var onSettle = typeof options.onSettle === 'function' ? options.onSettle : null;

    var reduceMq = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;

    var destroyed = false;
    var inserted = false;
    var data = null;
    var cardW = 48;
    var width = 0;
    var anims = [];
    var transients = [];
    var settleTimer = null;
    var resizeTimer = null;
    var resizeObserver = null;
    var els = {};
    var actionWaiter = null;

    var root = h('div', 'seq-insert');
    root.setAttribute('role', 'group');
    root.setAttribute('data-inserted', '0');
    root.setAttribute('data-position', '1');
    root.setAttribute('data-moved', '0');
    root.setAttribute('data-anim', 'idle');

    var stage = h('div', 'seq-insert__stage');
    var live = h('div', 'seq-insert__live');
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');
    root.appendChild(stage);
    root.appendChild(live);
    host.appendChild(root);

    var view = {};
    view.el = root;
    view.version = VERSION;

    /* ---------- 减少动效 ---------- */

    function reduceMotion() {
      return !!(reduceMq && reduceMq.matches);
    }

    /* ---------- 尺寸与卡宽 ---------- */

    function availableWidth() {
      /* 可用的宿主内容宽：根容器会收缩成舞台宽，故从宿主量，避免与卡宽互相依赖 */
      var w = 0;
      if (host && host.nodeType === 1) {
        var hostStyle = global.getComputedStyle(host);
        w = (host.clientWidth || 0) - (parseFloat(hostStyle.paddingLeft) || 0) - (parseFloat(hostStyle.paddingRight) || 0);
      }
      if (!(w > 0)) {
        w = root.getBoundingClientRect().width;
        if (!(w > 0)) w = root.clientWidth || 0;
      }
      if (!(w > 0)) w = 0;
      return w;
    }

    function measure() {
      var w = availableWidth();
      width = w;

      var n = data.sequence.length;
      var texts = [];
      var i;
      for (i = 0; i < n; i++) texts.push(data.sequence[i].text);
      texts.push(data.insert.text);

      var probe = h('span', 'seq-insert__measure');
      probe.setAttribute('aria-hidden', 'true');
      probe.textContent = '';
      root.appendChild(probe);
      var natural = 0;
      for (i = 0; i < texts.length; i++) {
        probe.textContent = texts[i];
        var textW = probe.getBoundingClientRect().width || 0;
        if (textW > natural) natural = textW;
      }
      if (probe.parentNode) probe.parentNode.removeChild(probe);

      /* +32 = 左右各 16px 内缩（15px padding + 1px 描边），故公式在 border-box 下仍成立 */
      var raw = Math.ceil(natural) + 32;
      var fit = Math.floor((width - 2 * G.inset - n * G.gap) / (n + 1));
      var w2 = Math.min(raw, fit, 132);
      if (!(w2 > 0)) w2 = 48;
      if (w2 < 48) w2 = 48;
      cardW = w2;

      /* 根容器 = 内部舞台 = 插入后总宽；该宽度插入前后一致 */
      var total = 2 * G.inset + n * (cardW + G.gap) + cardW;
      root.style.width = total + 'px';
      return total;
    }

    /* ---------- 状态摘要 ---------- */

    function snapshot() {
      var n = data.sequence.length;
      var k = data.insert.index;
      var seq = [];
      var i;
      for (i = 0; i < n; i++) seq.push({ key: data.sequence[i].key, text: data.sequence[i].text });
      return {
        inserted: inserted,
        index: k,
        position: k + 1,
        total: n + 1,
        moved: n - k,
        text: data.insert.text,
        unit: data.unit,
        sequence: seq
      };
    }

    function snapshotData() {
      var n = data.sequence.length;
      var seq = [];
      var i;
      for (i = 0; i < n; i++) seq.push({ key: data.sequence[i].key, text: data.sequence[i].text });
      var labels = {};
      var k;
      for (k = 0; k < LABEL_KEYS.length; k++) labels[LABEL_KEYS[k]] = data.labels[LABEL_KEYS[k]];
      return {
        sequence: seq,
        insert: { text: data.insert.text, index: data.insert.index },
        unit: data.unit,
        labels: labels,
        startInserted: data.startInserted
      };
    }

    /* ---------- 播报文案 ---------- */

    function liveSentence() {
      var n = data.sequence.length;
      var k = data.insert.index;
      var moved = n - k;
      var text = displayText(data.insert.text);
      var position = fmt(data.labels.position, stateValues());
      var total = fmt(data.labels.total, stateValues());
      if (inserted) {
        var shift = moved > 0 ? '；' + fmt(data.labels.shift, stateValues()) : '';
        return data.labels.done + '：' + text + '，' + position + '，' + total + shift + '。';
      }
      return data.labels.pending + '：' + text + '，将插入' + position + '；原序列 ' + n + ' ' + data.unit + '未移动。';
    }

    function stateValues() {
      var n = data.sequence.length;
      var k = data.insert.index;
      return {
        position: k + 1,
        total: n + 1,
        count: n - k,
        unit: data.unit,
        text: data.insert.text
      };
    }

    function updateLive() {
      live.textContent = liveSentence();
    }

    /* ---------- 构建 DOM ---------- */

    function makeCard(item, slot, role) {
      var card = h('div', 'seq-insert__card');
      card.setAttribute('data-key', role === 'new' ? '__new' : item.key);
      card.setAttribute('data-slot', String(slot));
      card.setAttribute('data-role', role);
      card.setAttribute('role', 'listitem');
      var textNode = h('span', 'seq-insert__card-text');
      textNode.textContent = item.text;
      card.appendChild(textNode);
      var position = slot + 1;
      var label = displayText(item.text) + '，第 ' + position + ' 位';
      if (role === 'shifted') label += '，较插入前后移 1 位';
      if (role === 'new') label += '，本次插入';
      card.setAttribute('aria-label', label);
      return card;
    }

    function render(isInserted) {
      var n = data.sequence.length;
      var k = data.insert.index;
      var moved = n - k;

      root.setAttribute('data-inserted', isInserted ? '1' : '0');
      root.setAttribute('data-position', String(k + 1));
      root.setAttribute('data-moved', String(moved));
      root.setAttribute('aria-label', data.labels.group);

      stage.textContent = '';

      var tray = h('div', 'seq-insert__tray');
      var status = h('span', 'seq-insert__status');
      status.textContent = isInserted ? data.labels.done : data.labels.pending;
      tray.appendChild(status);

      var pending = null;
      var result = null;
      var i;
      if (!isInserted) {
        pending = h('div', 'seq-insert__pending');
        var pendingText = h('span', 'seq-insert__pending-text');
        pendingText.textContent = data.insert.text;
        pending.appendChild(pendingText);
        pending.setAttribute('aria-label', data.labels.pending + '：' + displayText(data.insert.text));
        tray.appendChild(pending);
      } else {
        result = h('div', 'seq-insert__result');
        var resultSub = h('span', 'seq-insert__result-sub');
        resultSub.textContent = fmt(data.labels.position, stateValues()) + ' · ' + fmt(data.labels.total, stateValues());
        result.appendChild(resultSub);
        tray.appendChild(result);
      }

      var row = h('div', 'seq-insert__row');
      row.setAttribute('role', 'list');
      row.setAttribute('aria-label', '序列');
      var cards = [];
      for (i = 0; i <= n; i++) {
        if (isInserted && i === k) {
          var newCard = makeCard({ key: '__new', text: data.insert.text }, i, 'new');
          row.appendChild(newCard);
          cards.push({ el: newCard, key: '__new', role: 'new', index: k, slot: i });
        }
        if (i < n) {
          var shifted = isInserted && i >= k;
          var slot = shifted ? i + 1 : i;
          var role = shifted ? 'shifted' : 'origin';
          var card = makeCard(data.sequence[i], slot, role);
          row.appendChild(card);
          cards.push({ el: card, key: data.sequence[i].key, role: role, index: i, slot: slot });
        }
      }

      var caret = null;
      if (!isInserted) {
        caret = h('div', 'seq-insert__caret');
        caret.setAttribute('aria-hidden', 'true');
        row.appendChild(caret);
      }

      var marks = h('div', 'seq-insert__marks');
      marks.setAttribute('aria-hidden', 'true');
      var bracket = null;
      if (isInserted && moved > 0) {
        bracket = h('div', 'seq-insert__bracket');
        bracket.setAttribute('data-count', String(moved));
        var bracketLabel = h('span', 'seq-insert__bracket-label');
        bracketLabel.textContent = fmt(data.labels.shift, stateValues());
        bracket.appendChild(bracketLabel);
        marks.appendChild(bracket);
      }

      stage.appendChild(tray);
      stage.appendChild(row);
      stage.appendChild(marks);

      var newEntry = null;
      for (i = 0; i < cards.length; i++) {
        if (cards[i].role === 'new') newEntry = cards[i];
      }

      els = {
        stage: stage,
        tray: tray,
        status: status,
        pending: pending,
        result: result,
        row: row,
        cards: cards,
        caret: caret,
        marks: marks,
        bracket: bracket,
        newCard: newEntry,
        live: live
      };

      layout();
    }

    function layout() {
      if (!els.row || !data) return;
      var n = data.sequence.length;
      var k = data.insert.index;
      var p = cardW + G.gap;
      var slotLeft = G.inset + k * p;
      var slotCenter = slotLeft + cardW / 2;
      var i;
      var entry;


      if (els.status) els.status.style.left = slotCenter + 'px';
      if (els.pending) {
        els.pending.style.left = slotLeft + 'px';
        els.pending.style.width = cardW + 'px';
      }
      if (els.result) els.result.style.left = slotCenter + 'px';

      for (i = 0; i < els.cards.length; i++) {
        entry = els.cards[i];
        var left = slotLeft;
        if (entry.role === 'origin') left = G.inset + entry.index * p;
        else if (entry.role === 'shifted') left = G.inset + (entry.index + 1) * p;
        entry.el.style.left = left + 'px';
        entry.el.style.width = cardW + 'px';
      }

      if (els.caret) {
        els.caret.style.left = (G.inset + k * p - 7 - G.caretW / 2) + 'px';
        els.caret.style.top = G.caretTop + 'px';
        els.caret.style.width = G.caretW + 'px';
        els.caret.style.height = G.caretH + 'px';
      }

      if (els.bracket) {
        els.bracket.style.left = (G.inset + (k + 1) * p) + 'px';
        els.bracket.style.width = ((n - k - 1) * p + cardW) + 'px';
        els.bracket.style.top = G.bracketTop + 'px';
      }

      /* 根容器宽即最后槽位右缘，正常范围内序列行不需要滚动 */
      els.row.style.overflowX = '';
    }

    /* ---------- 动画登记与清理 ---------- */

    function addAnim(node, frames, timing) {
      if (!node || typeof node.animate !== 'function') return null;
      var anim = node.animate(frames, timing);
      anims.push(anim);
      return anim;
    }

    function addPaint(node, fromStyle, toStyle, delay) {
      return addAnim(node, [paintKeyframe(fromStyle), paintKeyframe(toStyle)], {
        duration: G.paintDur,
        delay: delay || 0,
        easing: EASE_PAINT,
        fill: 'backwards'
      });
    }

    function cancelAnims() {
      var i;
      for (i = 0; i < transients.length; i++) {
        var node = transients[i];
        if (node && node.parentNode) node.parentNode.removeChild(node);
      }
      transients.length = 0;
      for (i = 0; i < anims.length; i++) {
        try { anims[i].cancel(); } catch (err) { /* 已结束或被取消 */ }
      }
      anims.length = 0;
    }

    function stopMotion() {
      if (settleTimer) {
        global.clearTimeout(settleTimer);
        settleTimer = null;
      }
      cancelAnims();
    }

    function setAnim(value) {
      root.setAttribute('data-anim', value);
    }

    /* ---------- 动作句柄（编排层使用；不影响旧 API） ---------- */

    function makeWaiter() {
      var state = { settled: false, resolve: null };
      state.finished = new Promise(function (resolve) { state.resolve = resolve; });
      state.handle = {
        finished: state.finished,
        cancel: function () { cancelWaiter(state); }
      };
      return state;
    }

    function settleWaiter(status) {
      var state = actionWaiter;
      if (!state || state.settled) return;
      actionWaiter = null;
      state.settled = true;
      state.resolve({ status: status });
    }

    function cancelWaiter(state) {
      if (!state || state.settled) return;
      var isCurrent = actionWaiter === state;
      state.settled = true;
      state.resolve({ status: 'cancelled' });
      if (isCurrent) {
        actionWaiter = null;
        stopMotion();
        setAnim('idle');
      }
    }

    /* ---------- 停点切换 ---------- */

    function emitChange() {
      if (destroyed || !onChange) return;
      onChange(snapshot());
    }

    function emitSettle() {
      if (destroyed || !onSettle) return;
      onSettle(snapshot());
    }

    function settleNow() {
      if (destroyed) return;
      if (settleTimer) {
        global.clearTimeout(settleTimer);
        settleTimer = null;
      }
      cancelAnims();
      setAnim('idle');
      updateLive();
      emitSettle();
      settleWaiter('completed');
    }

    function landInstant(target, notifyChange) {
      inserted = target;
      render(target);
      setAnim('idle');
      updateLive();
      if (notifyChange) emitChange();
      emitSettle();
      settleWaiter('completed');
    }

    function capture() {
      var info = {
        cards: {},
        pending: null,
        pendingStyle: null,
        newCard: null,
        newStyle: null,
        bracketNode: null,
        caretNode: null
      };
      var i;
      var entry;
      for (i = 0; i < els.cards.length; i++) {
        entry = els.cards[i];
        info.cards[entry.key] = rectOf(entry.el);
      }
      if (els.pending) {
        info.pending = rectOf(els.pending);
        info.pendingStyle = paintStyle(els.pending);
      }
      if (els.newCard) {
        info.newCard = rectOf(els.newCard.el);
        info.newStyle = paintStyle(els.newCard.el);
      }
      if (els.bracket) info.bracketNode = els.bracket.cloneNode(true);
      if (els.caret) info.caretNode = els.caret;
      return info;
    }

    function animateInsert(info) {
      var n = data.sequence.length;
      var k = data.insert.index;
      var moved = n - k;
      var p = cardW + G.gap;
      var shiftEnd = 0;
      var i;
      var entry;
      var oldRect;
      var now;
      var dx;
      var dy;

      /* 让位：从最右让位元素开始逐个启动，向左传导 */
      for (i = 0; i < els.cards.length; i++) {
        entry = els.cards[i];
        if (entry.role !== 'shifted') continue;
        oldRect = info.cards[entry.key];
        if (!oldRect) continue;
        now = rectOf(entry.el);
        dx = oldRect.left - now.left;
        dy = oldRect.top - now.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
        var delay = (n - 1 - entry.index) * G.step;
        addAnim(entry.el, [
          { transform: 'translate3d(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px,0)' },
          { transform: 'translate3d(0px,0px,0)' }
        ], { duration: G.shiftDur, delay: delay, easing: EASE, fill: 'backwards' });
        shiftEnd = Math.max(shiftEnd, delay + G.shiftDur);
      }

      /* 新卡：从托盘原矩形垂直落位，虚→实在落位过程中完成 */
      if (info.pending && els.newCard) {
        var card = els.newCard.el;
        var target = rectOf(card);
        var fallDx = info.pending.left - target.left;
        var fallDy = info.pending.top - target.top;
        addAnim(card, [
          { transform: 'translate3d(' + fallDx.toFixed(2) + 'px,' + fallDy.toFixed(2) + 'px,0) scale(.97)' },
          { transform: 'translate3d(0px,0px,0) scale(1)' }
        ], { duration: G.fallDur, easing: EASE, fill: 'backwards' });
        addPaint(card, info.pendingStyle, paintStyle(card), 0);
      }

      /* 插入符：落位开始后 120ms 起 160ms 淡出（临时节点，停稳时移除） */
      if (info.caretNode && els.row) {
        var caretNode = info.caretNode;
        caretNode.style.left = (G.inset + k * p - 7 - G.caretW / 2) + 'px';
        caretNode.style.top = G.caretTop + 'px';
        caretNode.style.width = G.caretW + 'px';
        caretNode.style.height = G.caretH + 'px';
        els.row.appendChild(caretNode);
        transients.push(caretNode);
        addAnim(caretNode, [{ opacity: '1' }, { opacity: '0' }], {
          duration: G.caretDur,
          delay: G.caretDelay,
          easing: 'ease-out',
          fill: 'both'
        });
      }

      /* 括线：让位结束后出现 */
      if (els.bracket) {
        var bracketDelay = shiftEnd + G.bracketGap;
        addAnim(els.bracket, [
          { opacity: '0', transform: 'translate3d(0,3px,0)' },
          { opacity: '1', transform: 'translate3d(0,0,0)' }
        ], {
          duration: G.bracketDur,
          delay: bracketDelay,
          easing: 'cubic-bezier(.2,.7,.2,1)',
          fill: 'backwards'
        });
      }

      var bracketEnd = moved > 0 ? shiftEnd + G.bracketGap + G.bracketDur : 0;
      return Math.max(G.fallDur, G.caretDelay + G.caretDur, bracketEnd, G.minTrip) + G.settlePad;
    }

    function animateRestore(info) {
      var n = data.sequence.length;
      var k = data.insert.index;
      var moved = n - k;
      var p = cardW + G.gap;
      var i;
      var entry;
      var oldRect;
      var now;
      var dx;
      var dy;

      /* 括线：起手 140ms 内淡出（临时克隆，停稳时移除） */
      if (info.bracketNode && els.marks) {
        var clone = info.bracketNode;
        clone.style.left = (G.inset + (k + 1) * p) + 'px';
        clone.style.width = ((n - k - 1) * p + cardW) + 'px';
        clone.style.top = G.bracketTop + 'px';
        els.marks.appendChild(clone);
        transients.push(clone);
        addAnim(clone, [{ opacity: '1' }, { opacity: '0' }], {
          duration: G.bracketOutDur,
          easing: 'ease-out',
          fill: 'forwards'
        });
      }

      /* 新卡：升回托盘，同时由实心转虚线感 */
      if (info.newCard && els.pending) {
        var pending = els.pending;
        var nowPending = rectOf(pending);
        var riseDy = info.newCard.top - nowPending.top;
        addAnim(pending, [
          { transform: 'translate3d(0,' + riseDy.toFixed(2) + 'px,0) scale(1)' },
          { transform: 'translate3d(0,0,0) scale(1)' }
        ], {
          duration: G.fallDur,
          delay: G.restoreDelay,
          easing: EASE,
          fill: 'backwards'
        });
        addPaint(pending, info.newStyle, paintStyle(pending), G.restoreDelay);
      }

      /* 让位归位：离缺口最近者先动（目标停点里它们是 origin，故按目标下标与位移判定） */
      var shiftEnd = 0;
      for (i = 0; i < els.cards.length; i++) {
        entry = els.cards[i];
        if (entry.index < k) continue;
        oldRect = info.cards[entry.key];
        if (!oldRect) continue;
        now = rectOf(entry.el);
        dx = oldRect.left - now.left;
        dy = oldRect.top - now.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
        var delay = G.restoreDelay + (entry.index - k) * G.step;
        addAnim(entry.el, [
          { transform: 'translate3d(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px,0)' },
          { transform: 'translate3d(0px,0px,0)' }
        ], { duration: G.shiftDur, delay: delay, easing: EASE, fill: 'backwards' });
        shiftEnd = Math.max(shiftEnd, delay + G.shiftDur);
      }

      var riseEnd = G.restoreDelay + G.fallDur;
      var shiftEndAll = moved > 0 ? shiftEnd : 0;
      return Math.max(riseEnd, shiftEndAll, G.bracketOutDur, G.minTrip) + G.settlePad;
    }

    function scheduleSettle(ms) {
      if (settleTimer) {
        global.clearTimeout(settleTimer);
        settleTimer = null;
      }
      settleTimer = global.setTimeout(function () {
        settleTimer = null;
        settleNow();
      }, Math.max(0, ms));
    }

    function go(target, opts) {
      if (destroyed) return view;
      opts = opts || {};
      target = !!target;
      var animate = opts.animate !== false && !reduceMotion();

      if (target === inserted) {
        if (root.getAttribute('data-anim') === 'running') settleNow();
        return view;
      }

      stopMotion();

      if (!animate) {
        landInstant(target, true);
        return view;
      }

      var info = capture();
      inserted = target;
      render(target);
      setAnim('running');
      var total = target ? animateInsert(info) : animateRestore(info);
      scheduleSettle(total);
      emitChange();
      return view;
    }

    function replay(opts) {
      if (destroyed) return view;
      opts = opts || {};
      var animate = opts.animate !== false && !reduceMotion();
      var target = inserted;
      stopMotion();
      settleWaiter('cancelled');

      if (!animate) {
        render(target);
        setAnim('idle');
        updateLive();
        emitSettle();
        return view;
      }

      /* 先瞬现相反停点，再重放"通向当前停点"的那段变化 */
      render(!target);
      setAnim('idle');
      var info = capture();
      render(target);
      setAnim('running');
      var total = target ? animateInsert(info) : animateRestore(info);
      scheduleSettle(total);
      return view;
    }

    function setData(next, opts) {
      if (destroyed) return view;
      opts = opts || {};
      stopMotion();
      settleWaiter('cancelled');
      data = normalize(next);
      if (!opts.keepState) inserted = !!data.startInserted;
      measure();
      render(inserted);
      setAnim('idle');
      updateLive();
      emitChange();
      emitSettle();
      return view;
    }

    /* ---------- 尺寸变化 ---------- */

    function relayout() {
      if (destroyed) return;
      var w = availableWidth();
      if (Math.abs(w - width) < 0.5) return;
      var wasRunning = root.getAttribute('data-anim') === 'running';
      stopMotion();
      measure();
      render(inserted);
      setAnim('idle');
      updateLive();
      if (wasRunning) {
        settleWaiter('completed');
        emitSettle();
      }
    }

    function scheduleRelayout() {
      if (resizeTimer) global.clearTimeout(resizeTimer);
      resizeTimer = global.setTimeout(function () {
        resizeTimer = null;
        relayout();
      }, 120);
    }

    function onWindowResize() {
      scheduleRelayout();
    }

    function onReduceChange() {
      if (reduceMotion() && root.getAttribute('data-anim') === 'running') settleNow();
    }

    /* ---------- 接口 ---------- */

    /* 停稳后托盘文字/结论文字还有一段自身的淡入（CSS transition）。
     * 供编排层在“本步完成”前等待这段必要提示收束；独立用法不受影响。 */
    function settleVisualCue() {
      if (destroyed) return Promise.resolve();
      var elements = [els.status, els.result].filter(function (node) {
        return node && typeof node.getAnimations === 'function';
      });
      var cueAnimations = [];
      elements.forEach(function (node) {
        try {
          node.getAnimations().forEach(function (animation) {
            if (animation && animation.playState === 'running' && animation.transitionProperty) cueAnimations.push(animation);
          });
        } catch (error) { /* 无动画能力时立即结算 */ }
      });
      if (!cueAnimations.length) return Promise.resolve();
      var waits = cueAnimations.map(function (animation) {
        return animation.finished.then(function () {}, function () {});
      });
      var guard = new Promise(function (resolve) { global.setTimeout(resolve, 400); });
      return Promise.race([Promise.all(waits), guard]);
    }

    view.settleVisual = settleVisualCue;
    view.getTarget = function (query) {
      if (destroyed || !query || typeof query !== 'object') return null;
      var kind = query.kind == null ? '' : String(query.kind);
      if (kind === 'pending') {
        return !inserted && els.pending ? els.pending : null;
      }
      if (kind === 'inserted') {
        return inserted && els.newCard ? els.newCard.el : null;
      }
      if (kind === 'source') {
        var key = query.key == null ? '' : String(query.key);
        if (!key || key === '__new') return null;
        var cards = Array.isArray(els.cards) ? els.cards : [];
        for (var i = 0; i < cards.length; i += 1) {
          var entry = cards[i];
          if (entry && entry.key === key && (entry.role === 'origin' || entry.role === 'shifted')) {
            return entry.el || null;
          }
        }
        return null;
      }
      return null;
    };

    view.restoreView = function (input) {
      if (destroyed) return;
      var model = input && typeof input === 'object' && input.model && typeof input.model === 'object' ? input.model : {};
      go(!!model.inserted, { animate: false });
    };

    view.runAction = function (action, opts) {
      var state = makeWaiter();
      if (destroyed) {
        state.settled = true;
        state.resolve({ status: 'cancelled' });
        return state.handle;
      }
      var type = action && typeof action === 'object' ? String(action.type == null ? '' : action.type) : '';
      var target;
      if (type === 'insert') target = true;
      else if (type === 'restore') target = false;
      else {
        state.settled = true;
        state.resolve({ status: 'cancelled' });
        return state.handle;
      }
      settleWaiter('cancelled');
      actionWaiter = state;
      opts = opts || {};
      if (target === inserted) {
        if (root.getAttribute('data-anim') === 'running') settleNow();
        settleWaiter('completed');
        return state.handle;
      }
      var animate = opts.animate !== false && !reduceMotion();
      stopMotion();
      if (!animate) {
        landInstant(target, true);
        return state.handle;
      }
      var info = capture();
      inserted = target;
      render(target);
      setAnim('running');
      var total = target ? animateInsert(info) : animateRestore(info);
      scheduleSettle(total);
      emitChange();
      return state.handle;
    };

    view.insert = function (opts) { return go(true, opts); };
    view.restore = function (opts) { return go(false, opts); };
    view.toggle = function (opts) { return go(!inserted, opts); };
    view.replay = function (opts) { return replay(opts); };
    view.setData = function (next, opts) { return setData(next, opts); };
    view.destroy = function () {
      if (destroyed) return;
      destroyed = true;
      settleWaiter('cancelled');
      stopMotion();
      if (resizeTimer) {
        global.clearTimeout(resizeTimer);
        resizeTimer = null;
      }
      if (resizeObserver) {
        try { resizeObserver.disconnect(); } catch (err) { /* ignore */ }
        resizeObserver = null;
      }
      global.removeEventListener('resize', onWindowResize);
      if (reduceMq) {
        if (typeof reduceMq.removeEventListener === 'function') reduceMq.removeEventListener('change', onReduceChange);
        else if (typeof reduceMq.removeListener === 'function') reduceMq.removeListener(onReduceChange);
      }
      if (root.parentNode) root.parentNode.removeChild(root);
      els = {};
    };

    Object.defineProperty(view, 'inserted', { get: function () { return inserted; } });
    Object.defineProperty(view, 'position', { get: function () { return data.insert.index + 1; } });
    Object.defineProperty(view, 'state', { get: function () { return snapshot(); } });
    Object.defineProperty(view, 'data', { get: function () { return snapshotData(); } });

    /* ---------- 初始化 ---------- */

    data = normalize(options);
    inserted = !!data.startInserted;
    measure();
    render(inserted);
    setAnim('idle');
    updateLive();

    if (typeof global.ResizeObserver === 'function' && host && host.nodeType === 1) {
      resizeObserver = new global.ResizeObserver(function () { scheduleRelayout(); });
      try { resizeObserver.observe(host); } catch (err) { resizeObserver = null; }
    }
    if (!resizeObserver) global.addEventListener('resize', onWindowResize);

    if (reduceMq) {
      if (typeof reduceMq.addEventListener === 'function') reduceMq.addEventListener('change', onReduceChange);
      else if (typeof reduceMq.addListener === 'function') reduceMq.addListener(onReduceChange);
    }

    return view;
  }

  global.SeqInsert = {
    version: VERSION,
    mount: mount
  };
})(window);
