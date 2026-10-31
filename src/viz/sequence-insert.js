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