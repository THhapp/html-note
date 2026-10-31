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