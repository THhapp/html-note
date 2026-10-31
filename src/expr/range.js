/*!
 * 范围注释与分组说明 · NoteExpr.Range v1.0.0
 * 依赖：无（原生 DOM + Web Animations API）；普通 <script> 引入，file:// 直接可用。
 *
 * 用法：
 *   var range = NoteExpr.Range.mount({ motion: 'auto', zIndex: 1205 });
 *   range.show({ targets: [el1, el2], text: '这两步决定是否继续' });
 *   range.show({ targets: [el2, el3], text: '换成这一组' });   // 幂等 = 更新
 *   range.show({ targets: [el1], text: '' });                 // 只画括线，不画标签
 *   range.hide();  range.refresh();  range.destroy();
 *
 * 只读：range.el（叠加层根）/ range.visible / range.targets / range.text
 *
 * 几何契约（视口坐标；g = 目标组包围盒）：
 *   横向 below：括线 = 1px 横线，上缘 y = g.bottom + 10，x 从 g.left 到 g.right；端刺 7px 向上指向对象
 *   横向 above：括线（下缘）= g.top - 10；端刺 7px 向下
 *   纵向 right：括线 = 1px 竖线，左缘 x = g.right + 10；端刺 7px 向左
 *   纵向 left ：括线（右缘）= g.left - 10；端刺 7px 向右
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
      var need = G.gap + (lm.height > 0 ? G.labelGapH + lm.height : 0) + G.edge;
      var span = lm.height > 0
        ? { left: lm.left, right: lm.left + lm.width }
        : { left: group.left, right: group.right };
      var belowBand = {
        left: span.left, right: span.right,
        top: group.bottom + G.gap + (lm.height > 0 ? G.labelGapH : 0),
        bottom: group.bottom + G.gap + (lm.height > 0 ? G.labelGapH + lm.height : G.hair)
      };
      var aboveBand = {
        left: span.left, right: span.right,
        top: group.top - G.gap - (lm.height > 0 ? G.labelGapH + lm.height : 0),
        bottom: group.top - G.gap - (lm.height > 0 ? G.labelGapH : 0)
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
      var bracketTop = side === 'below' ? group.bottom + G.gap : group.top - G.gap - G.hair;
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
      var need = G.gap + G.labelGapV + (nat.width > 0 ? nat.width : 0) + G.edge;
      var rightFits = box.right - group.right >= need;
      var leftFits = group.left - box.left >= need;
      if (rightFits) return { side: 'right', sideOverflow: false };
      return { side: 'left', sideOverflow: !leftFits };
    }

    function verticalPlan(group, nat, vp, side, sideOverflow) {
      var edge = G.edge;
      var labelW0 = nat.width;
      var labelH = nat.height;
      var rightX = group.right + G.gap;                    /* 线的左缘 */
      var leftX = group.left - G.gap - G.hair;             /* 线的左缘 */
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
        var need = G.gap + (nat.height > 0 ? G.labelGapH + nat.height : 0) + G.edge;
        return side === 'below' ? (box.bottom - group.bottom >= need) : (group.top - box.top >= need);
      }
      var needV = G.gap + G.labelGapV + (nat.width > 0 ? nat.width : 0) + G.edge;
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
      return { targets: arr, text: t, side: s, orientation: o, observe: opts.observe, geometry: opts.geometry };
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