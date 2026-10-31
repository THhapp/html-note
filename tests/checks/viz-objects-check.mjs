import { chromium } from '../tools/node_modules/playwright-core/index.mjs';
import path from 'node:path';
import url from 'node:url';
import { moduleDemos, moduleScripts, moduleStyles } from '../lib/src-sources.mjs';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../..');
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
});
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push('console: ' + msg.text()); });
page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.stack));
// 源码加载清单从 src/manifests 推导：objects.js 拆成多个文件后自动包含全部。
const pageModules = ['core', 'viz-objects'];
await page.goto('about:blank');
for (const file of moduleStyles(root, pageModules)) await page.addStyleTag({ path: path.join(root, file) });
for (const file of [...moduleScripts(root, pageModules), ...moduleDemos(root, ['viz-objects'])]) {
  await page.addScriptTag({ path: path.join(root, file) });
}

const results = await page.evaluate(async () => {
  const checks = [];
  const pending = [];
  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }
  function check(name, callback) {
    try {
      const detail = callback();
      checks.push({ name, ok: true, detail: detail == null ? '' : String(detail) });
    } catch (error) {
      checks.push({ name, ok: false, detail: error.stack || String(error) });
    }
  }
  function checkAsync(name, callback) {
    pending.push((async () => {
      try {
        const detail = await callback();
        checks.push({ name, ok: true, detail: detail == null ? '' : String(detail) });
      } catch (error) {
        checks.push({ name, ok: false, detail: error.stack || String(error) });
      }
    })());
  }
  async function frames() {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  function host(width = 900) {
    const node = document.createElement('div');
    node.style.cssText = 'width:' + width + 'px;max-width:100%;min-width:0;';
    document.body.appendChild(node);
    return node;
  }
  function clear(node) { if (node && node.parentNode) node.parentNode.removeChild(node); }
  function button(rootNode, label) {
    return Array.from(rootNode.querySelectorAll('button')).find(b => b.textContent === label);
  }

  document.body.style.cssText = 'margin:0;padding:20px;background:#eef1f5;font-family:sans-serif';
  const workspace = document.createElement('div');
  workspace.id = 'test-workspace';
  workspace.style.cssText = 'max-width:1100px;margin:0 auto;';
  document.body.appendChild(workspace);

  /* ---------------- D01 ---------------- */
  checkAsync('D01 sequence / identity, scroll, composite marks', async () => {
    const h = host(340);
    const bits = Array.from({ length: 24 }, (_, i) => ({ id: 'b' + i, value: i % 3 === 0 ? '1' : '0' }));
    const inst = NoteViz.Sequence.mount(h, {
      variant: 'bits',
      index: true,
      items: bits,
      groups: [{ label: 'A', start: 0, count: 8 }, { label: 'B', start: 8, count: 8 }, { label: 'C', start: 16, count: 8 }],
      focus: ['b2'],
      changed: ['b2', 'b12'],
      label: '测试位串'
    });
    await frames();
    const viewport = inst.el.querySelector('.nviz-sequence__viewport');
    const hint = inst.el.querySelector('.nviz-sequence__scrollhint, .nviz-sequence__hint');
    assert(inst.el.parentNode === h, 'root not appended');
    assert(inst.el.getAttribute('role') === 'group', 'root role');
    assert(viewport.tabIndex === 0, 'scroll region not focusable');
    assert(viewport.getAttribute('data-overflow-x') === 'true', 'expected horizontal overflow');
    assert(hint && !hint.hidden && hint.textContent.length > 0, 'visible overflow hint');
    assert(inst.getTarget('b2').getAttribute('data-mark') === 'both', 'composite mark missing');
    assert(inst.getTarget('b2').getAttribute('aria-label').includes('当前关注且发生变化'), 'composite aria');
    assert(inst.el.textContent.includes('关注并变化'), 'composite text summary');
    viewport.scrollLeft = 0;
    viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert(viewport.scrollLeft > 0, 'scroll keyboard did not move horizontal region');
    const before = inst.getTarget('b2');
    inst.update({
      items: bits.map((entry, index) => ({ id: entry.id, value: String((index + 1) % 2), label: '位 ' + index })),
      variant: 'bytes',
      dense: true,
      focus: ['b12'],
      changed: ['b12']
    });
    assert(inst.getTarget('b2') === before, 'same id did not preserve target element');
    assert(before.getAttribute('data-mark') === 'none', 'mark not cleared');
    assert(inst.getTarget('b12').getAttribute('data-mark') === 'both', 'composite after update');
    assert(inst.getTarget('b12').querySelector('.nviz-sequence__value').textContent === '1', 'value not updated');
    inst.update({ variant: 'boxes', index: false });
    assert(inst.getTarget('b2') === before, 'variant update lost target');
    inst.update({ items: [], focus: null, changed: null });
    assert(inst.getTarget('b2') === null, 'getTarget should be null after empty update');
    assert(!inst.el.querySelector('.nviz-empty').hidden, 'empty state not visible');
    const countBeforeDestroy = inst.el.querySelectorAll('.nviz-sequence__unit').length;
    inst.destroy();
    assert(!inst.el.isConnected, 'root not removed');
    assert(inst.destroyed === true, 'destroyed flag missing');
    assert(inst.getTarget('b2') === null, 'getTarget should be null after destroy');
    inst.destroy();
    inst.update({ items: bits });
    assert(!inst.el.isConnected && countBeforeDestroy === 0, 'update after destroy changed DOM');
    clear(h);
    return 'ok';
  });

  /* ---------------- D02 ---------------- */
  checkAsync('D02 matrix / semantics, cells, identity, scrolling', async () => {
    const h = host(430);
    const rows = Array.from({ length: 12 }, (_, i) => ({ id: 'r' + i, label: '第 ' + (i + 1) + ' 行 很长的标签' + i }));
    const cols = Array.from({ length: 9 }, (_, i) => ({ id: 'c' + i, label: '列 ' + (i + 1) + ' 指标' }));
    const values = rows.map((_, ri) => cols.map((_, ci) => ri * 10 + ci));
    const inst = NoteViz.Matrix.mount(h, {
      rows, columns: cols, values,
      caption: '测试矩阵',
      maxHeight: 150,
      focus: { rows: ['r2'], columns: ['c3'], cells: [{ row: 'r2', col: 'c3' }] },
      changed: { rows: ['r2'], columns: ['c4'], cells: [{ row: 'r2', col: 'c3' }] },
      cellRenderer: (value, context) => value + '|' + context.row + '/' + context.col
    });
    await frames();
    assert(inst.el.querySelector('table'), 'table missing');
    assert(inst.el.querySelector('caption').textContent === '测试矩阵', 'caption missing');
    assert(inst.el.querySelectorAll('th[scope="col"]').length === 10, 'column headers / corner wrong');
    assert(inst.el.querySelectorAll('th[scope="row"]').length === 12, 'row headers wrong');
    const byId = inst.getTarget({ row: 'r1', col: 'c2' });
    const byIndex = inst.getTarget({ row: 1, col: 2 });
    assert(byId && byId === byIndex, 'getTarget id/index mismatch');
    assert(byId.textContent.includes('r1/c2'), 'cellRenderer output missing');
    assert(inst.getTarget({ row: 'r2', col: 'c3' }).getAttribute('data-direct-mark') === 'both', 'cell composite mark');
    assert(inst.el.querySelector('.nviz-matrix__rowhead[data-mark="both"]'), 'row header composite mark');
    assert(inst.el.querySelector('.nviz-matrix__colhead[data-mark="focus"]'), 'column focus mark missing');
    assert(inst.el.querySelector('.nviz-matrix__colhead[data-mark="changed"]'), 'column changed mark missing');
    inst.update({ summary: false });
    assert(inst.el.querySelector('.nviz-matrix__note').hidden, 'matrix summary:false did not hide the visible note');
    inst.update({ summary: true });
    assert(!inst.el.querySelector('.nviz-matrix__note').hidden, 'matrix summary:true did not restore the visible note');
    const viewport = inst.el.querySelector('.nviz-matrix__viewport');
    assert(viewport.tabIndex === 0, 'matrix scroll region inaccessible');
    assert(viewport.getAttribute('data-overflow-y') === 'true', 'matrix vertical overflow not detected');
    assert(!inst.el.querySelector('.nviz-matrix__hint').hidden, 'matrix overflow hint hidden');
    const target = inst.getTarget({ row: 'r1', col: 'c2' });
    inst.update({ values: values.map((r, ri) => r.map((v, ci) => v + (ri === 1 && ci === 2 ? 1000 : 0))) });
    assert(inst.getTarget({ row: 'r1', col: 'c2' }) === target, 'matrix cell identity lost');
    assert(target.textContent.includes('1012'), 'matrix value update failed');
    inst.update({ rows: [rows[1], rows[0]].concat(rows.slice(2)), caption: '更新后的矩阵' });
    assert(inst.getTarget({ row: 'r1', col: 'c2' }) === target, 'reordered row lost cell identity');
    assert(inst.el.querySelector('caption').textContent === '更新后的矩阵', 'caption update failed');
    inst.update({ rows: [], columns: [], values: [] });
    assert(inst.getTarget({ row: 'r1', col: 'c2' }) === null, 'matrix stale target after empty');
    assert(!inst.el.querySelector('.nviz-empty').hidden, 'matrix empty state hidden');
    inst.destroy();
    assert(!inst.el.isConnected, 'matrix not removed');
    assert(inst.getTarget({ row: 'r1', col: 'c2' }) === null, 'matrix getTarget after destroy');
    clear(h);
    return 'ok';
  });

  /* ---------------- D03 ---------------- */
  checkAsync('D03 graph / marker uniqueness, getTarget, events, manual scroll', async () => {
    const h1 = host(500);
    const h2 = host(500);
    let selected = 0;
    const nodes = [
      { id: 'n1', label: '输入 A', x: 100, y: 90, group: 'G1' },
      { id: 'n2', label: '处理 B', x: 360, y: 160, group: 'G1' },
      { id: 'n3', label: '输出 C', x: 640, y: 100, group: 'G2' },
      { id: 'n4', label: '旁路 D', x: 640, y: 290, group: 'G2' }
    ];
    const edges = [
      { from: 'n1', to: 'n2', label: '进入', directed: true },
      { from: 'n2', to: 'n3', label: '通过', directed: true },
      { from: 'n2', to: 'n4', label: '退回', directed: false }
    ];
    const graph = NoteViz.Graph.mount(h1, {
      nodes, edges, layout: 'layered', focus: ['n2'], changed: ['n2', 'n3'],
      label: '测试关系图', onSelect: (id) => { selected += 1; }
    });
    const graph2 = NoteViz.Graph.mount(h2, {
      nodes: [{ id: 'x', label: '另一个节点', x: 100, y: 100 }], edges: [], layout: 'manual'
    });
    await frames();
    const markers1 = Array.from(graph.el.querySelectorAll('marker')).map(m => m.id);
    const markers2 = Array.from(graph2.el.querySelectorAll('marker')).map(m => m.id);
    assert(markers1.length === 1 && markers2.length === 1, 'marker missing');
    assert(markers1[0] !== markers2[0], 'marker id not unique per instance');
    assert(graph.el.querySelector('.nviz-graph__edgeline[marker-end]'), 'directed edge arrow missing');
    const g = graph.getTarget('n2');
    assert(g && g.tagName.toLowerCase() === 'g', 'graph getTarget not g');
    assert(g.getAttribute('data-mark') === 'both', 'graph composite mark');
    assert(g.getAttribute('tabindex') === '0' && g.getAttribute('role') === 'button', 'interactive node not keyboard reachable');
    assert(graph.el.querySelector('.nviz-graph__nodelabel').textContent.includes('输入 A'), 'node text missing');
    assert(graph.el.querySelectorAll('.nviz-graph__edgelabel').length >= 2, 'edge labels missing');
    selected = 0;
    graph.update({ focus: ['n1'] });
    assert(selected === 0, 'program update triggered onSelect');
    g.focus();
    assert(document.activeElement === g, 'interactive graph node cannot receive focus');
    g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert(selected === 1, 'node click did not call onSelect');
    g.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert(selected === 2, 'node Enter did not call onSelect');
    assert(graph.getTarget('n2') === g, 'graph target lost after update');
    assert(g.getAttribute('data-mark') === 'changed', 'graph mark did not update');
    graph.update({ layout: 'manual', width: 980, height: 360, nodes, edges, changed: ['n2'] });
    await frames();
    const viewport = graph.el.querySelector('.nviz-graph__viewport');
    assert(viewport.getAttribute('data-overflow-x') === 'true', 'manual wide graph does not overflow');
    assert(!graph.el.querySelector('.nviz-graph__hint').hidden, 'graph overflow hint hidden');
    assert(graph.getTarget('n2') === g, 'graph target lost after layout update');
    graph.update({ nodes: [], edges: [] });
    assert(graph.getTarget('n2') === null, 'graph target stale after empty');
    assert(!graph.el.querySelector('.nviz-empty').hidden, 'graph empty hidden');
    graph.destroy();
    graph2.destroy();
    assert(graph.getTarget('n2') === null, 'graph getTarget after destroy');
    assert(!graph.el.isConnected && !graph2.el.isConnected, 'graph roots not removed');
    clear(h1); clear(h2);
    return 'ok';
  });

  /* ---------------- D04 ---------------- */
  checkAsync('D04 timeline / current, range shapes, identity, scroll', async () => {
    const h = host(360);
    const items = [
      { id: 'e1', label: '开始', timeLabel: '09:00', kind: 'event' },
      { id: 'e2', label: '窗口', timeLabel: '09:10–09:30', kind: 'range', start: 9, end: 30 },
      { id: 'e3', label: '阶段', timeLabel: '09:30–10:00', kind: 'phase', start: 30, end: 60 },
      { id: 'e4', label: '结束', timeLabel: '10:05', kind: 'event' }
    ];
    const inst = NoteViz.Timeline.mount(h, {
      items, orientation: 'horizontal', current: 'e2', focus: ['e2'], changed: ['e2', 'e4'],
      start: '09:00', end: '10:05', label: '测试时间线'
    });
    await frames();
    const target = inst.getTarget('e2');
    assert(target && target.tagName.toLowerCase() === 'li', 'timeline target not li');
    assert(target.getAttribute('aria-current') === 'step', 'current missing');
    assert(target.getAttribute('data-kind') === 'range', 'range kind missing');
    assert(target.getAttribute('data-mark') === 'both', 'timeline composite mark');
    assert(target.textContent.includes('当前 · 关注 · 变化'), 'combined status text missing');
    assert(inst.el.textContent.includes('09:00'), 'time text missing');
    assert(inst.el.querySelector('.nviz-timeline__range').textContent.includes('09:00'), 'range strip missing');
    const viewport = inst.el.querySelector('.nviz-timeline__viewport');
    assert(viewport.tabIndex === 0, 'timeline scroll region inaccessible');
    assert(viewport.getAttribute('data-overflow-x') === 'true', 'timeline horizontal overflow not detected');
    assert(!inst.el.querySelector('.nviz-timeline__hint').hidden, 'timeline hint missing');
    inst.update({ orientation: 'vertical', current: 'e4', focus: ['e4'], changed: ['e1'], start: '新起点', end: '新终点' });
    assert(inst.getTarget('e2') === target, 'timeline identity lost on orientation update');
    assert(inst.el.querySelector('.nviz-timeline__range').textContent.includes('新起点'), 'timeline range update failed');
    assert(target.hasAttribute('aria-current') === false, 'old current not cleared');
    assert(inst.el.getAttribute('data-orientation') === 'vertical', 'orientation not updated');
    inst.update({ items: [], current: null, focus: null, changed: null });
    assert(inst.getTarget('e2') === null, 'timeline stale target');
    assert(!inst.el.querySelector('.nviz-empty').hidden, 'timeline empty missing');
    inst.destroy();
    assert(inst.getTarget('e2') === null, 'timeline getTarget after destroy');
    clear(h);
    return 'ok';
  });

  /* ---------------- D05 ---------------- */
  checkAsync('D05 tree / hierarchy, direction, identity, scroll', async () => {
    const h = host(320);
    const tree = [{
      id: 'root', label: '根', children: [
        { id: 'a', label: '左分支', children: [{ id: 'a1', label: '深一层', children: [{ id: 'a2', label: '更深一层' }] }] },
        { id: 'b', label: '右分支', children: [{ id: 'b1', label: '右叶子' }] }
      ]
    }];
    const inst = NoteViz.TreeDiagram.mount(h, {
      nodes: tree, orientation: 'down', focus: ['a'], changed: ['a1'], label: '测试层级'
    });
    await frames();
    assert(inst.el.querySelectorAll('.nviz-tree__node').length === 6, 'tree node count');
    assert(inst.el.querySelectorAll('.nviz-tree__edge').length === 5, 'tree edge count');
    assert(inst.el.querySelector('.nviz-tree__svg text').textContent.length > 0, 'tree SVG text missing');
    const target = inst.getTarget('a');
    assert(target && target.tagName.toLowerCase() === 'g', 'tree target not g');
    assert(target.getAttribute('aria-label').includes('当前关注'), 'tree focus aria missing');
    assert(inst.el.querySelector('.nviz-tree__node[data-mark="changed"]') !== null, 'tree changed mark missing');
    assert(inst.el.querySelectorAll('.nviz-tree__node[role="button"]').length === 0, 'tree nodes should not be interactive');
    assert(inst.el.querySelector('.nviz-tree__viewport').tabIndex === 0, 'tree viewport not focusable');
    await frames();
    assert(!inst.el.querySelector('.nviz-tree__hint').hidden, 'deep tree overflow hint missing');
    inst.update({ orientation: 'right', focus: ['a1'], changed: ['a1'], nodes: [{ id: 'root', label: '新根节点', children: [{ id: 'a', label: '左分支', children: [{ id: 'a1', label: '新深层' }] }, { id: 'b', label: '右分支', children: [{ id: 'b1', label: '右叶子' }] }] }] });
    assert(inst.getTarget('a') === target, 'tree identity lost');
    assert(target.getAttribute('aria-label').includes('左分支'), 'tree label update failed');
    assert(target.getAttribute('data-mark') === 'none', 'tree mark not cleared');
    assert(inst.el.querySelector('.nviz-tree__node[data-mark="both"]'), 'tree composite mark missing');
    inst.update({ nodes: [] });
    assert(inst.getTarget('a') === null, 'tree stale target');
    assert(!inst.el.querySelector('.nviz-empty').hidden, 'tree empty missing');
    inst.destroy();
    assert(inst.getTarget('a') === null, 'tree getTarget after destroy');
    clear(h);
    return 'ok';
  });

  /* ---------------- D06 ---------------- */
  checkAsync('D06 compare / strings vs DOM, labels, responsive stacking, target', async () => {
    const h = host(900);
    const domRight = document.createElement('div');
    domRight.textContent = '右侧 DOM 内容';
    const marker = document.createElement('strong');
    marker.textContent = '旧';
    domRight.appendChild(marker);
    const inst = NoteViz.CompareView.mount(h, {
      left: { title: '前', content: '<b>未净化字符串</b>' },
      right: { title: '后', content: domRight },
      mode: 'side-by-side',
      labels: { left: '左标签', right: '右标签', compare: '对比', changed: '改动侧' },
      focusChanged: 'right'
    });
    await frames();
    assert(inst.el.getAttribute('data-layout') === 'side-by-side', 'wide compare not side-by-side');
    const left = inst.getTarget('left');
    const right = inst.getTarget('right');
    assert(left && right && left.tagName.toLowerCase() === 'section', 'compare targets missing');
    assert(left.querySelector('.nviz-compare__body').textContent === '<b>未净化字符串</b>', 'string content parsed as HTML');
    assert(left.querySelector('.nviz-compare__body').querySelector('b') === null, 'unsafe HTML created');
    assert(right.querySelector('.nviz-compare__body').contains(marker), 'right DOM node not moved');
    assert(right.getAttribute('data-focus-changed') === 'true', 'focusChanged side not marked');
    assert(right.querySelector('.nviz-compare__changed').textContent === '改动侧', 'changed badge text');
    assert(right.querySelector('.nviz-compare__changed').hidden === false, 'changed badge hidden');
    const titleBefore = right.querySelector('.nviz-compare__title');
    inst.update({ focusChanged: 'left', labels: { left: '前侧', right: '后侧', changed: '变化位置' } });
    assert(inst.getTarget('right') === right, 'compare pane identity lost');
    assert(right.querySelector('.nviz-compare__body').contains(marker), 'DOM content removed by label-only update');
    assert(right.getAttribute('data-focus-changed') === 'false', 'focusChanged not moved');
    h.style.width = '340px';
    await frames();
    assert(inst.el.getAttribute('data-layout') === 'stacked', 'narrow container did not auto-stack');
    assert(!inst.el.querySelector('.nviz-compare__adaptive').hidden, 'auto-stack hint not visible');
    inst.update({ left: null });
    await frames();
    assert(inst.getTarget('left') === null, 'left should be absent');
    assert(inst.getTarget('right') === right, 'single right pane lost');
    assert(inst.el.getAttribute('data-layout') === 'single', 'single layout not set');
    inst.update({ right: null });
    await frames();
    assert(inst.getTarget('right') === null, 'right should be absent');
    assert(!inst.el.querySelector('.nviz-empty').hidden, 'compare empty state missing');
    inst.destroy();
    assert(inst.getTarget('left') === null && inst.getTarget('right') === null, 'compare targets after destroy');
    assert(!inst.el.isConnected, 'compare root not removed');
    clear(h);
    return 'ok';
  });

  checkAsync('Additional edge cases / fragment host, raw strings, cycle guard, single-side compare', async () => {
    const fragment = document.createDocumentFragment();
    const seq = NoteViz.Sequence.mount(fragment, {
      variant: 'bits',
      items: ['1', '0', '1'],
      focus: [0],
      changed: ['item-1']
    });
    assert(seq.el.parentNode === fragment, 'fragment mount failed');
    assert(seq.getTarget('item-0'), 'generated string id target missing');
    const first = seq.getTarget('item-0');
    seq.update({ items: ['1', '0', '1'], unknownOption: true });
    assert(seq.getTarget('item-0') === first, 'string item identity not preserved');
    assert(seq.getTarget('item-1').getAttribute('data-mark') === 'changed', 'string item changed mark missing');
    seq.destroy();

    const gh = host(400);
    const graph = NoteViz.Graph.mount(gh, {
      nodes: [{ id: 'a', label: 'A', x: 80, y: 80 }], edges: [], layout: 'manual'
    });
    assert(graph.getTarget('a').getAttribute('tabindex') === null, 'graph node focusable without onSelect');
    graph.destroy();
    clear(gh);

    const th = host(400);
    const timeline = NoteViz.Timeline.mount(th, { items: [{ id: 'x', label: '无时间事件' }] });
    assert(timeline.getTarget('x').textContent.includes('时间未标注'), 'missing time placeholder');
    assert(timeline.el.querySelector('.nviz-timeline__range').hidden, 'timeline range strip should be hidden');
    timeline.destroy();
    clear(th);

    const treeHost = host(400);
    const cycle = { id: 'cyc', label: '循环节点', children: [] };
    cycle.children.push(cycle);
    const tree = NoteViz.TreeDiagram.mount(treeHost, {
      nodes: [cycle, { id: 'other', label: '另一棵树' }]
    });
    assert(tree.el.querySelectorAll('.nviz-tree__node').length === 2, 'forest/cycle guard count');
    assert(tree.getTarget('cyc') !== null, 'cycle root target missing');
    tree.destroy();
    clear(treeHost);

    const compareHost = host(700);
    const compare = NoteViz.CompareView.mount(compareHost, {
      left: { title: '前', content: 'A' },
      right: { title: '后', content: 'B' },
      focusChanged: true
    });
    assert(compare.getTarget('right').getAttribute('data-focus-changed') === 'true', 'focusChanged true did not mark right');
    assert(compare.getTarget('right').querySelector('.nviz-compare__changed').textContent === '变化侧', 'default changed label missing');
    compare.destroy();
    clear(compareHost);
    return 'ok';
  });

  check('Mount rejects non-element host', () => {
    let threw = false;
    try { NoteViz.Sequence.mount(null, {}); } catch (error) { threw = error instanceof TypeError; }
    assert(threw, 'mount did not throw TypeError for null host');
    return 'ok';
  });

  await Promise.all(pending);

  /* ---------------- Demo invocations and clicks ---------------- */
  const demoHosts = {};
  const demoRecords = {};
  const demoBox = document.createElement('div');
  demoBox.id = 'demo-box';
  demoBox.style.cssText = 'max-width:1100px;margin:30px auto 0;display:flex;flex-direction:column;gap:20px';
  document.body.appendChild(demoBox);
  ['D01', 'D02', 'D03', 'D04', 'D05', 'D06'].forEach(function (id) {
    const frame = document.createElement('section');
    frame.style.cssText = 'background:#fff;border:1px solid #dce2ea;border-radius:14px;padding:20px';
    const title = document.createElement('h2');
    title.textContent = id;
    title.style.cssText = 'margin:0 0 12px;font-size:18px';
    const dh = document.createElement('div');
    frame.append(title, dh);
    demoBox.appendChild(frame);
    demoHosts[id] = dh;
    demoRecords[id] = window.NoteGalleryDemos[id](dh);
  });

  async function clickDemo(id, label) {
    const b = button(demoHosts[id], label);
    if (!b) throw new Error('demo button not found: ' + id + ' / ' + label);
    b.click();
    await frames();
    return b;
  }

  try {
    await frames();
    for (const id of ['D01', 'D02', 'D03', 'D04', 'D05', 'D06']) {
      if (!demoHosts[id].querySelector('.nviz-demo')) throw new Error(id + ' demo did not mount');
    }
    checks.push({ name: 'Demo D01 mount + interactions', ok: true, detail: 'mounted' });
    await clickDemo('D01', '换一组内容');
    await clickDemo('D01', '隐藏标记');
    await clickDemo('D01', '重置');
    await clickDemo('D02', '换一组数值');
    await clickDemo('D02', '换标记方式');
    await clickDemo('D02', '重置');
    await clickDemo('D03', '切换为手动布局');
    await frames();
    const graphRoot = demoHosts.D03.querySelector('.nviz-graph');
    if (graphRoot.getAttribute('data-layout') !== 'manual') throw new Error('demo graph layout not manual');
    const graphNode = demoHosts.D03.querySelector('.nviz-graph__node');
    graphNode.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    if (!demoHosts.D03.textContent.includes('已选择')) throw new Error('demo graph onSelect feedback missing');
    await clickDemo('D03', '换一组内容');
    await clickDemo('D03', '重置');
    await clickDemo('D04', '切换为纵向');
    await clickDemo('D04', '换一组内容');
    await clickDemo('D04', '重置');
    await clickDemo('D05', '切换为向右');
    await clickDemo('D05', '换一组重点');
    await clickDemo('D05', '换节点文案');
    await clickDemo('D05', '重置');
    await clickDemo('D06', '切换为上下');
    await clickDemo('D06', '换一组状态');
    await clickDemo('D06', '窄容器演示');
    await frames();
    const compareRoot = demoHosts.D06.querySelector('.nviz-compare');
    if (compareRoot.getAttribute('data-layout') !== 'stacked') throw new Error('demo compare narrow did not auto-stack');
    await clickDemo('D06', '重置');
    checks.push({ name: 'Demo interactions', ok: true, detail: 'buttons clicked without exception' });

    Object.keys(demoRecords).forEach(function (id) {
      demoRecords[id].destroy();
      if (demoHosts[id].children.length !== 0) throw new Error(id + ' demo destroy left DOM');
    });
    if (demoBox.querySelectorAll('.nviz-sequence, .nviz-matrix, .nviz-graph, .nviz-timeline, .nviz-tree, .nviz-compare').length !== 0) {
      throw new Error('component roots remain after demo destroy');
    }
    checks.push({ name: 'Demo cleanup', ok: true, detail: 'all roots and component nodes removed' });
  } catch (error) {
    checks.push({ name: 'Demo interactions', ok: false, detail: error.stack || String(error) });
  }

  return checks;
});

await page.emulateMedia({ reducedMotion: 'reduce' });
const reducedResult = await page.evaluate(async () => {
  const host = document.createElement('div');
  host.style.width = '700px';
  document.body.appendChild(host);
  const seq = NoteViz.Sequence.mount(host, {
    variant: 'bits',
    items: [{ id: 'b0', value: '0' }, { id: 'b1', value: '1' }],
    focus: ['b1'],
    changed: ['b1']
  });
  await new Promise(resolve => requestAnimationFrame(resolve));
  const cell = seq.el.querySelector('.nviz-sequence__cell');
  const duration = getComputedStyle(cell).transitionDuration;
  const animations = seq.el.getAnimations({ subtree: true }).length;
  const matches = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  seq.destroy();
  host.remove();
  return { matches, duration, animations };
});
if (!reducedResult.matches) {
  results.push({ name: 'Reduced motion preference', ok: false, detail: 'media emulation not active' });
} else if (!/^0s(, 0s)*$/.test(reducedResult.duration) || reducedResult.animations !== 0) {
  results.push({ name: 'Reduced motion preference', ok: false, detail: JSON.stringify(reducedResult) });
} else {
  results.push({ name: 'Reduced motion preference', ok: true, detail: JSON.stringify(reducedResult) });
}

let failed = 0;
for (const item of results) {
  if (!item.ok) failed += 1;
  console.log((item.ok ? 'PASS' : 'FAIL') + '  ' + item.name + (item.ok ? '' : '\n    ' + item.detail));
}
console.log('\nConsole errors:', consoleErrors.length ? consoleErrors : 'none');
console.log('Failed:', failed, '/', results.length);
await browser.close();
if (failed || consoleErrors.length) process.exitCode = 1;
