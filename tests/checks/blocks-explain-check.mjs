#!/usr/bin/env node
/*
 * Direct-mount checks for NoteBlocks B05–B10. Real Edge, full dist bundle.
 * Covers mount, initial/next/back/replay/reset, getTarget after updates,
 * rapid switching, narrow container, destroy residue, and console errors.
 */
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { cacheDir } from '../lib/test-output.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('../tools/node_modules/playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const shotDir = cacheDir(root, 'checks', 'blocks-explain');
const harness = pathToFileURL(path.join(here, 'blocks-explain-harness.html')).href;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const failures = [];
const passes = [];
function check(name, ok, detail) {
  if (ok) {
    passes.push(name);
    console.log('PASS  ' + name);
  } else {
    failures.push({ name, detail: detail || '' });
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

const browser = await chromium.launch({ executablePath: edge, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const consoleErrors = [];
const pageErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(String(error && error.stack || error)));
await page.goto(harness, { waitUntil: 'load' });
await page.waitForFunction(() => window.NoteBlocks && window.NoteBlocks.ChartExplain);

const results = await page.evaluate(() => {
  const global = window;
  const output = [];
  const container = document.getElementById('host');

  function hostBox() {
    const host = document.createElement('div');
    host.style.cssText = 'box-sizing:border-box;width:940px;max-width:100%;min-width:0;margin:0 0 18px;';
    container.appendChild(host);
    return host;
  }

  function findButton(host, textValue) {
    const buttons = Array.from(host.querySelectorAll('button'));
    return buttons.find((button) => button.textContent.trim() === textValue) || null;
  }

  function captionText(host) {
    const node = host.querySelector('.nblk-demo-stage__caption');
    return node ? node.textContent.trim() : '';
  }

  function stepButtons(host) {
    return {
      prev: findButton(host, '上一步'),
      next: findButton(host, '下一步'),
      replay: findButton(host, '重看'),
      reset: findButton(host, '重来')
    };
  }

  function noOuterOverflow(host) {
    return host.scrollWidth <= host.clientWidth + 2;
  }

  function run(id, callback) {
    const host = hostBox();
    const checks = [];
    let instance = null;
    let destroyed = false;
    function ok(name, condition, detail) {
      checks.push({ name, ok: Boolean(condition), detail: detail == null ? '' : String(detail) });
    }
    try {
      const context = {
        host,
        ok,
        setInstance(value) { instance = value; },
        destroyInstance() {
          if (!instance || destroyed) return;
          destroyed = true;
          instance.destroy();
        }
      };
      callback(context);
    } catch (error) {
      checks.push({ name: id + ' uncaught exception', ok: false, detail: String(error && error.stack || error) });
    }
    try {
      if (instance && !destroyed) {
        instance.destroy();
        destroyed = true;
      }
    } catch (error) {
      checks.push({ name: id + ' destroy exception', ok: false, detail: String(error && error.stack || error) });
    }
    checks.push({ name: id + ' destroy leaves empty host', ok: host.children.length === 0, detail: 'children=' + host.children.length });
    host.remove();
    output.push({ id, checks });
  }

  /* ------------------------------------------------------------------ B05 */
  run('B05', (ctx) => {
    const host = ctx.host;
    const calls = [];
    const first = {
      id: 'first',
      caption: '第一停点字幕',
      highlight: 1,
      variables: [
        { name: 'n', label: '变量 n', value: 1 },
        { name: 'note', label: '说明', value: '等待' }
      ],
      explanation: '第一停点说明'
    };
    const second = {
      id: 'second',
      caption: '第二停点字幕',
      highlight: { start: 1, end: 2 },
      variables: [
        { name: 'n', label: '变量 n', value: 2, changed: true },
        { name: 'note', label: '说明', value: '已更新' }
      ],
      explanation: '第二停点说明'
    };
    const trace = global.NoteBlocks.CodeTrace.mount(host, {
      code: 'let n = 1;\nn += 1;',
      language: 'js',
      title: '直接挂载 B05',
      steps: [first, second],
      current: 0,
      onStep(index, step) { calls.push([index, step && step.id]); }
    });
    ctx.setInstance(trace);
    ctx.ok('B05 mount appends root', host.children.length > 0);
    ctx.ok('B05 initial step', trace.getStep() && trace.getStep().id === 'first');
    ctx.ok('B05 initial caption', captionText(host) === '第一停点字幕', captionText(host));
    ctx.ok('B05 code target', Boolean(trace.getTarget('code')));
    const firstVar = trace.getTarget('var:n');
    ctx.ok('B05 initial variable target', Boolean(firstVar) && firstVar.textContent.indexOf('1') >= 0);
    ctx.ok('B05 initial step target', Boolean(trace.getTarget('first')));
    ctx.ok('B05 explanation visible', host.textContent.indexOf('第一停点说明') >= 0);

    trace.next();
    ctx.ok('B05 program next does not fire onStep', calls.length === 0, JSON.stringify(calls));
    ctx.ok('B05 second caption', captionText(host) === '第二停点字幕', captionText(host));
    const secondVar = trace.getTarget('var:n');
    ctx.ok('B05 getTarget refreshes after next', Boolean(secondVar) && secondVar.textContent.indexOf('2') >= 0);
    ctx.ok('B05 changed text is visible', host.textContent.indexOf('本步变化') >= 0);
    ctx.ok('B05 current step target updates', trace.getTarget('first') === null && Boolean(trace.getTarget('second')));
    const cardsAfterNext = host.querySelectorAll('.nblk-codetrace__variable').length;
    ctx.ok('B05 no accumulated variable cards', cardsAfterNext === 2, String(cardsAfterNext));

    const buttons = stepButtons(host);
    trace.reset();
    ctx.ok('B05 reset returns first', trace.getStep().id === 'first');
    if (buttons.next) buttons.next.click();
    ctx.ok('B05 user next fires onStep once', calls.length === 1 && calls[0][1] === 'second', JSON.stringify(calls));
    ctx.ok('B05 user next caption sync', captionText(host) === '第二停点字幕');
    for (let i = 0; i < 8; i += 1) {
      trace.go(i % 2);
      trace.go((i + 1) % 2);
    }
    trace.reset();
    ctx.ok('B05 rapid switching settles on first', trace.getStep().id === 'first' && captionText(host) === '第一停点字幕');
    ctx.ok('B05 one code block after rapid switching', host.querySelectorAll('.nui-code').length === 1);
    trace.replay();
    ctx.ok('B05 replay keeps caption', captionText(host) === '第一停点字幕');

    trace.update({
      code: 'let n = 10;\nn += 1;',
      steps: [{ id: 'updated', caption: '更新后的停点', highlight: 2, variables: [{ name: 'n', value: 11, changed: true }] }],
      current: 0
    });
    ctx.ok('B05 update keeps onStep silent', calls.length === 1, JSON.stringify(calls));
    ctx.ok('B05 update step/caption', trace.getStep().id === 'updated' && captionText(host) === '更新后的停点');
    ctx.ok('B05 update target refreshes', Boolean(trace.getTarget('var:n')) && Boolean(trace.getTarget('updated')) && trace.getTarget('var:note') === null);
    trace.update({
      steps: [
        { id: 'one', caption: 'ID 一', variables: [{ name: 'n', value: 1 }] },
        { id: 'two', caption: 'ID 二', variables: [{ name: 'n', value: 2, changed: true }] }
      ],
      current: 'two'
    });
    ctx.ok('B05 update current accepts a step id', trace.getStep().id === 'two' && captionText(host) === 'ID 二', captionText(host));
    ctx.ok('B05 current-id update remains silent', calls.length === 1, JSON.stringify(calls));

    host.style.width = '320px';
    ctx.ok('B05 narrow no outer overflow', noOuterOverflow(host), 'scroll=' + host.scrollWidth + ' client=' + host.clientWidth);
    ctx.destroyInstance();
    ctx.ok('B05 destroy clears roots', host.querySelectorAll('.nblk-codetrace, .nui-code, .nui-notice').length === 0);
  });

  /* ------------------------------------------------------------------ B06 */
  run('B06', (ctx) => {
    const host = ctx.host;
    const calls = [];
    let fields = global.NoteBlocks.FrameFields.mount(host, {
      items: [
        { id: 'bit-0', value: '1' },
        { id: 'bit-1', value: '0' },
        { id: 'bit-2', value: '1' },
        { id: 'bit-3', value: '1' }
      ],
      fields: [
        { id: 'hi', label: '高段', start: 0, end: 1 },
        { id: 'lo', label: '低段', start: 2, end: 3, unit: '次' }
      ],
      focusField: 'hi',
      bitOrder: 'msb',
      changed: ['lo'],
      caption: '字段说明',
      onSelect(id) { calls.push(id); }
    });
    ctx.setInstance(fields);
    ctx.ok('B06 mount appends root', host.children.length > 0);
    ctx.ok('B06 initial selected', fields.getSelected() === 'hi');
    ctx.ok('B06 sequence target', Boolean(fields.getTarget('sequence')));
    ctx.ok('B06 field target', Boolean(fields.getTarget('hi')));
    ctx.ok('B06 sequence unit target', Boolean(fields.getTarget('bit-2')));
    const hiValue = fields.getTarget('hi').querySelector('.nblk-framefields__value');
    ctx.ok('B06 MSB computed value', hiValue && hiValue.textContent.trim() === '2', hiValue && hiValue.textContent);
    ctx.ok('B06 changed badge visible', host.textContent.indexOf('本步变化') >= 0);

    fields.focusField('lo', { silent: true });
    ctx.ok('B06 silent focus updates selected', fields.getSelected() === 'lo');
    ctx.ok('B06 silent focus fires no callback', calls.length === 0, JSON.stringify(calls));
    const focusedUnits = fields.getTarget('sequence').querySelectorAll('.nviz-sequence__unit[data-mark="focus"], .nviz-sequence__unit[data-mark="both"]');
    ctx.ok('B06 sequence focus sync', focusedUnits.length === 2, String(focusedUnits.length));

    const hiButton = fields.getTarget('hi').querySelector('.nblk-framefields__field-button');
    hiButton.click();
    ctx.ok('B06 user field click selects', fields.getSelected() === 'hi');
    ctx.ok('B06 user field click calls onSelect', calls.length === 1 && calls[0] === 'hi', JSON.stringify(calls));
    fields.focusField('lo');
    ctx.ok('B06 default focusField notifies', fields.getSelected() === 'lo' && calls.length === 2 && calls[1] === 'lo', JSON.stringify(calls));
    fields.focusField('hi', { silent: true });
    ctx.ok('B06 silent focusField returns to hi', fields.getSelected() === 'hi' && calls.length === 2);

    fields.update({ bitOrder: 'lsb', changed: [] });
    const lsbValue = fields.getTarget('hi').querySelector('.nblk-framefields__value');
    ctx.ok('B06 LSB computed value', lsbValue && lsbValue.textContent.trim() === '1', lsbValue && lsbValue.textContent);
    ctx.ok('B06 update keeps onSelect silent', calls.length === 2, JSON.stringify(calls));
    ctx.ok('B06 changed cleared', host.querySelectorAll('.nblk-framefields__field.is-changed').length === 0);

    fields.update({
      items: [
        { id: 'x', value: '1' },
        { id: 'y', value: '1' }
      ],
      fields: [{ id: 'all', label: '全部', start: 0, end: 1, note: '新字段说明' }],
      focusField: 'all'
    });
    ctx.ok('B06 update replaces fields', fields.getSelected() === 'all' && Boolean(fields.getTarget('all')) && Boolean(fields.getTarget('x')));
    ctx.ok('B06 old field target gone', fields.getTarget('hi') === null);
    ctx.ok('B06 single sequence instance', host.querySelectorAll('.nviz-sequence').length === 1);

    for (let i = 0; i < 6; i += 1) fields.focusField('all', { silent: true });
    ctx.ok('B06 repeated focus has no duplicates', host.querySelectorAll('.nviz-sequence').length === 1 && host.querySelectorAll('.nblk-framefields__field').length === 1);

    host.style.width = '320px';
    ctx.ok('B06 narrow no outer overflow', noOuterOverflow(host), 'scroll=' + host.scrollWidth + ' client=' + host.clientWidth);
    ctx.destroyInstance();
    ctx.ok('B06 destroy clears roots', host.querySelectorAll('.nblk-framefields, .nviz-sequence').length === 0);
  });

  /* ------------------------------------------------------------------ B07 */
  run('B07', (ctx) => {
    const host = ctx.host;
    const calls = [];
    const flow = global.NoteBlocks.ProcessFlow.mount(host, {
      nodes: [{ id: 'a', label: '起点' }, { id: 'b', label: '终点' }],
      edges: [{ id: 'ab', from: 'a', to: 'b', label: '进入', directed: true }],
      steps: [
        { id: 's1', label: '起点', caption: '第一流程停点', nodeId: 'a', note: '第一说明' },
        { id: 's2', label: '终点', caption: '第二流程停点', nodeId: 'b', edgeIds: ['ab'], note: '第二说明' }
      ],
      title: '直接挂载 B07',
      onStep(index, step) { calls.push([index, step && step.id]); }
    });
    ctx.setInstance(flow);
    ctx.ok('B07 mount appends root', host.children.length > 0);
    ctx.ok('B07 initial step/caption', flow.getStep().id === 's1' && captionText(host) === '第一流程停点', captionText(host));
    ctx.ok('B07 initial node target', Boolean(flow.getTarget('a')));
    ctx.ok('B07 initial edge relation absent', flow.getTarget('edge:ab') === null);

    const buttons = stepButtons(host);
    flow.next();
    ctx.ok('B07 program next silent', calls.length === 0);
    ctx.ok('B07 second caption', captionText(host) === '第二流程停点');
    ctx.ok('B07 second node target', Boolean(flow.getTarget('b')));
    ctx.ok('B07 current edge target', Boolean(flow.getTarget('edge:ab')));
    ctx.ok('B07 step target', Boolean(flow.getTarget('s2')));
    ctx.ok('B07 relation text visible', host.textContent.indexOf('当前边') >= 0);
    ctx.ok('B07 progress complete', host.querySelectorAll('.nui-steps__item--complete').length >= 1);
    ctx.ok('B07 no duplicate graphs', host.querySelectorAll('.nviz-graph').length === 1);

    flow.reset();
    ctx.ok('B07 reset first', flow.getStep().id === 's1' && captionText(host) === '第一流程停点');
    if (buttons.next) buttons.next.click();
    ctx.ok('B07 user next fires onStep', calls.length === 1 && calls[0][1] === 's2', JSON.stringify(calls));
    for (let i = 0; i < 8; i += 1) flow.go(i % 2);
    ctx.ok('B07 rapid switching no duplicate graph', host.querySelectorAll('.nviz-graph').length === 1);
    const replayStep = flow.getStep().id;
    const replayCaption = captionText(host);
    flow.replay();
    ctx.ok('B07 replay consistent', flow.getStep().id === replayStep && captionText(host) === replayCaption);

    flow.update({
      nodes: [{ id: 'x', label: '新起点' }],
      edges: [],
      steps: [{ id: 'n1', caption: '新数据唯一停点', nodeId: 'x' }],
      title: '更新后的流程'
    });
    ctx.ok('B07 update silent', calls.length === 1, JSON.stringify(calls));
    ctx.ok('B07 update step/caption', flow.getStep().id === 'n1' && captionText(host) === '新数据唯一停点');
    ctx.ok('B07 update targets refresh', Boolean(flow.getTarget('x')) && flow.getTarget('b') === null && flow.getTarget('edge:ab') === null);
    ctx.ok('B07 one graph after update', host.querySelectorAll('.nviz-graph').length === 1);

    host.style.width = '320px';
    ctx.ok('B07 narrow no outer overflow', noOuterOverflow(host), 'scroll=' + host.scrollWidth + ' client=' + host.clientWidth);
    ctx.destroyInstance();
    ctx.ok('B07 destroy clears roots', host.querySelectorAll('.nblk-flow, .nviz-graph, .nui-steps').length === 0);
  });

  /* ------------------------------------------------------------------ B08 */
  run('B08', (ctx) => {
    const host = ctx.host;
    const diagram = global.NoteBlocks.SequenceDiagram.mount(host, {
      participants: [{ id: 'a', label: '发送方' }, { id: 'b', label: '接收方' }],
      messages: [
        { id: 'm1', from: 'a', to: 'b', label: '同步请求', type: 'sync', note: '第一条说明' },
        { id: 'm2', from: 'b', to: 'b', label: '自身异步', type: 'async', note: '第二条说明' },
        { id: 'm3', from: 'b', to: 'a', label: '返回结果', type: 'return', note: '第三条说明' }
      ],
      current: 0,
      title: '直接挂载 B08',
      caption: '上下文说明'
    });
    ctx.setInstance(diagram);
    ctx.ok('B08 mount appends root', host.children.length > 0);
    ctx.ok('B08 initial step', diagram.getStep().id === 'm1');
    let state = diagram.getState();
    ctx.ok('B08 initial state', state && state.index === 0 && state.total === 3 && state.message.id === 'm1', JSON.stringify(state));
    ctx.ok('B08 initial caption includes message', captionText(host).indexOf('同步请求') >= 0 && captionText(host).indexOf('第一条说明') >= 0, captionText(host));
    ctx.ok('B08 message target', Boolean(diagram.getTarget('m1')));
    ctx.ok('B08 participant target', Boolean(diagram.getTarget('a')));
    ctx.ok('B08 all message groups rendered', host.querySelectorAll('[data-message-id]').length === 3);
    ctx.ok('B08 only current aria-current', host.querySelectorAll('[data-message-id][aria-current="step"]').length === 1 && host.querySelector('[data-message-id][aria-current="step"]').getAttribute('data-message-id') === 'm1');

    const buttons = stepButtons(host);
    diagram.next();
    state = diagram.getState();
    ctx.ok('B08 program next state', state.index === 1 && state.message.id === 'm2', JSON.stringify(state));
    ctx.ok('B08 second caption includes type/note', captionText(host).indexOf('异步') >= 0 && captionText(host).indexOf('第二条说明') >= 0, captionText(host));
    ctx.ok('B08 current group moves', host.querySelector('[data-message-id][aria-current="step"]').getAttribute('data-message-id') === 'm2');
    ctx.ok('B08 self async target', Boolean(diagram.getTarget('m2')));

    diagram.reset();
    ctx.ok('B08 reset first', diagram.getState().index === 0);
    if (buttons.next) buttons.next.click();
    ctx.ok('B08 user next updates state', diagram.getState().index === 1);
    for (let i = 0; i < 8; i += 1) diagram.go(i % 3);
    ctx.ok('B08 rapid switching one svg', host.querySelectorAll('.nblk-sequence-diagram__svg').length === 1);
    ctx.ok('B08 replay no duplicate', (diagram.replay(), host.querySelectorAll('.nblk-sequence-diagram__svg').length === 1));

    diagram.update({
      participants: [{ id: 'c', label: '甲' }, { id: 'd', label: '乙' }],
      messages: [{ id: 'n1', from: 'c', to: 'd', label: '新消息', type: 'sync' }],
      current: 0,
      title: '更新后的时序'
    });
    ctx.ok('B08 update state', diagram.getState() && diagram.getState().total === 1 && diagram.getState().message.id === 'n1', JSON.stringify(diagram.getState()));
    ctx.ok('B08 update targets refresh', Boolean(diagram.getTarget('n1')) && diagram.getTarget('m1') === null && Boolean(diagram.getTarget('c')));
    ctx.ok('B08 one svg after update', host.querySelectorAll('.nblk-sequence-diagram__svg').length === 1);

    host.style.width = '320px';
    ctx.ok('B08 narrow no outer overflow', noOuterOverflow(host), 'scroll=' + host.scrollWidth + ' client=' + host.clientWidth);
    ctx.destroyInstance();
    ctx.ok('B08 destroy clears roots', host.querySelectorAll('.nblk-sequence-diagram, .nblk-sequence-diagram__svg').length === 0);
  });

  /* ------------------------------------------------------------------ B09 */
  run('B09', (ctx) => {
    const host = ctx.host;
    const calls = [];
    const nodesA = [
      { id: 'root', label: '根目录', children: [{ id: 'child', label: '子项' }, { id: 'other', label: '另一项' }] }
    ];
    const detailsA = {
      child: { title: '子项详情', fields: [{ label: '字段', value: '一' }], content: '第一版正文', note: '第一版说明' },
      other: { title: '另一项详情', fields: [{ label: '字段', value: '二' }], content: '另一项正文' }
    };
    const hd = global.NoteBlocks.HierarchyDetail.mount(host, {
      nodes: nodesA,
      selected: 'child',
      details: detailsA,
      labels: { tree: '目录', detail: '详情', empty: '未选择', noDetail: '暂无详情', fields: '字段', note: '说明' },
      onSelect(id) { calls.push(id); }
    });
    ctx.setInstance(hd);
    ctx.ok('B09 mount appends root', host.children.length > 0);
    ctx.ok('B09 initial selected', hd.getSelected() === 'child');
    ctx.ok('B09 initial tree target', Boolean(hd.getTarget('child')));
    ctx.ok('B09 detail target', Boolean(hd.getTarget('detail')));
    ctx.ok('B09 initial detail visible', host.textContent.indexOf('子项详情') >= 0 && host.textContent.indexOf('第一版正文') >= 0);

    hd.select('other', { silent: true });
    ctx.ok('B09 program select updates', hd.getSelected() === 'other' && host.textContent.indexOf('另一项详情') >= 0);
    ctx.ok('B09 program silent no callback', calls.length === 0, JSON.stringify(calls));
    const otherButton = hd.getTarget('other');
    ctx.ok('B09 program select reveals tree item', Boolean(otherButton));

    const childButtonNow = hd.getTarget('child');
    if (childButtonNow) childButtonNow.click();
    ctx.ok('B09 user tree select', hd.getSelected() === 'child');
    ctx.ok('B09 user tree callback', calls.length === 1 && calls[0] === 'child', JSON.stringify(calls));

    const childTargetBefore = hd.getTarget('child');
    hd.update({
      details: {
        child: { title: '子项详情（更新）', fields: [{ label: '字段', value: '新值' }], content: '更新后的正文', note: '更新后的说明' },
        other: detailsA.other
      }
    });
    const childTargetAfter = hd.getTarget('child');
    ctx.ok('B09 details update keeps tree instance/selection', childTargetBefore === childTargetAfter && hd.getSelected() === 'child');
    ctx.ok('B09 details update redraws detail', host.textContent.indexOf('子项详情（更新）') >= 0 && host.textContent.indexOf('更新后的正文') >= 0);
    ctx.ok('B09 detail update silent', calls.length === 1, JSON.stringify(calls));

    const nodesB = [
      { id: 'root', label: '根目录', children: [{ id: 'child', label: '子项' }, { id: 'new', label: '新增项' }] }
    ];
    hd.update({ nodes: nodesB });
    ctx.ok('B09 node replacement keeps selection', hd.getSelected() === 'child' && Boolean(hd.getTarget('child')));
    ctx.ok('B09 new node target available', Boolean(hd.getTarget('new')));
    ctx.ok('B09 node update silent', calls.length === 1, JSON.stringify(calls));

    hd.update({ labels: { tree: '新目录名', detail: '新详情名' } });
    ctx.ok('B09 labels update visible', host.textContent.indexOf('新目录名') >= 0 && host.textContent.indexOf('新详情名') >= 0);
    const beforeDefaultSelect = calls.length;
    hd.select('new');
    ctx.ok('B09 program select notifies by default', calls.length === beforeDefaultSelect + 1 && calls[calls.length - 1] === 'new', JSON.stringify(calls));

    for (let i = 0; i < 6; i += 1) hd.select(i % 2 ? 'child' : 'new', { silent: true });
    ctx.ok('B09 repeated select one tree', host.querySelectorAll('.nui-tree').length === 1);
    host.style.width = '320px';
    ctx.ok('B09 narrow no outer overflow', noOuterOverflow(host), 'scroll=' + host.scrollWidth + ' client=' + host.clientWidth);
    ctx.destroyInstance();
    ctx.ok('B09 destroy clears roots', host.querySelectorAll('.nblk-hierarchy, .nui-tree, .nui-panel').length === 0);
  });

  /* ------------------------------------------------------------------ B10 */
  run('B10', (ctx) => {
    const host = ctx.host;
    const calls = [];
    const chartOptions = {
      type: 'bar',
      data: [{ label: 'A', value: 3 }, { label: 'B', value: 7 }, { label: 'C', value: 5 }],
      table: true,
      height: 260
    };
    const explain = global.NoteBlocks.ChartExplain.mount(host, {
      chart: chartOptions,
      steps: [
        { id: 'p0', label: '首项', caption: '第一图表停点', focus: { index: 0 } },
        { id: 'p1', label: '次项', caption: '第二图表停点', focus: { index: 1 }, changed: { index: 1 }, note: '第二说明' }
      ],
      title: '直接挂载 B10',
      onStep(index, step) { calls.push([index, step && step.id]); }
    });
    ctx.setInstance(explain);
    ctx.ok('B10 mount appends root', host.children.length > 0);
    ctx.ok('B10 initial step/caption', explain.getStep().id === 'p0' && captionText(host) === '第一图表停点', captionText(host));
    ctx.ok('B10 chart target', Boolean(explain.getTarget('chart')));
    ctx.ok('B10 point target', Boolean(explain.getTarget('point:0')));
    ctx.ok('B10 data table discoverable', Boolean(host.querySelector('.nviz-chart__table')));
    ctx.ok('B10 one chart', host.querySelectorAll('.nviz-chart').length === 1);

    const buttons = stepButtons(host);
    explain.next();
    ctx.ok('B10 program next silent', calls.length === 0);
    ctx.ok('B10 second caption', captionText(host) === '第二图表停点');
    ctx.ok('B10 point target refreshes', Boolean(explain.getTarget('point:1')));
    ctx.ok('B10 note visible', host.textContent.indexOf('第二说明') >= 0);
    ctx.ok('B10 one chart after step', host.querySelectorAll('.nviz-chart').length === 1);

    explain.reset();
    ctx.ok('B10 reset first', explain.getStep().id === 'p0' && captionText(host) === '第一图表停点');
    if (buttons.next) buttons.next.click();
    ctx.ok('B10 user next fires onStep', calls.length === 1 && calls[0][1] === 'p1', JSON.stringify(calls));
    for (let i = 0; i < 8; i += 1) explain.go(i % 2);
    ctx.ok('B10 rapid switching one chart', host.querySelectorAll('.nviz-chart').length === 1);
    explain.replay();
    ctx.ok('B10 replay consistent', captionText(host) === '第二图表停点');

    explain.update({
      chart: { type: 'line', data: [{ label: 'X', value: 1 }, { label: 'Y', value: 4 }], table: true, height: 240 },
      steps: [{ id: 'new', caption: '更新后的图表停点', focus: { index: 1 } }],
      title: '更新后的图表'
    });
    ctx.ok('B10 update silent', calls.length === 1, JSON.stringify(calls));
    ctx.ok('B10 update step/caption', explain.getStep().id === 'new' && captionText(host) === '更新后的图表停点');
    ctx.ok('B10 update chart target', Boolean(explain.getTarget('chart')) && Boolean(explain.getTarget('point:1')));
    ctx.ok('B10 no stale chart duplicates', host.querySelectorAll('.nviz-chart').length === 1);

    host.style.width = '320px';
    ctx.ok('B10 narrow no outer overflow', noOuterOverflow(host), 'scroll=' + host.scrollWidth + ' client=' + host.clientWidth);
    ctx.destroyInstance();
    ctx.ok('B10 destroy clears roots', host.querySelectorAll('.nblk-chart-explain, .nviz-chart').length === 0);
  });

  return output;
});

for (const block of results) {
  for (const item of block.checks) check(block.id + ' · ' + item.name, item.ok, item.detail);
}

const residue = await page.evaluate(() => {
  const selectors = [
    '.hnv-floating', '.hnv-floating__backdrop', '.nx-focus', '.nx-range', '.nx-link',
    '.nblk-codetrace', '.nblk-framefields', '.nblk-flow', '.nblk-sequence-diagram',
    '.nblk-hierarchy', '.nblk-chart-explain', '.nblk-step-player', '.nblk-demo-stage'
  ].join(',');
  return {
    residues: document.querySelectorAll(selectors).length,
    bodyChildren: document.body.children.length,
    hostChildren: document.getElementById('host').children.length
  };
});
check('no retained block/floating nodes in body after destroy', residue.residues === 0, JSON.stringify(residue));
check('console errors empty', consoleErrors.length === 0, consoleErrors.join(' | '));
check('page errors empty', pageErrors.length === 0, pageErrors.join(' | '));

await page.screenshot({ path: path.join(shotDir, 'blocks-explain-close.png'), fullPage: true });
await browser.close();

console.log('\nSummary: ' + passes.length + ' passed, ' + failures.length + ' failed.');
if (failures.length) {
  console.log(JSON.stringify(failures, null, 2));
  process.exitCode = 1;
}
