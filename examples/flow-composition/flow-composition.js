/* Flow composition example — two real NoteDemo sessions using reusable recipes.
 * Definition: NoteDemoRecipes.repeatStages over shared domain snapshots.
 * Layout:     NoteDemoRecipes.stagePacket / diagramTable; every region is a real Binding slot.
 * Adapters:   flow-stage, flow-packet, table, dom. No hand-written player/timer.
 */
(function (global) {
  'use strict';

  var doc = global.document;
  var Recipes = global.NoteDemoRecipes;
  if (!Recipes || typeof Recipes.stagePacket !== 'function' || typeof Recipes.diagramTable !== 'function' || typeof Recipes.repeatStages !== 'function') {
    throw new Error('flow-composition 需要先加载 NoteDemoRecipes（stagePacket / diagramTable / repeatStages）。');
  }
  if (!global.NoteDemo || typeof global.NoteDemo.mount !== 'function') {
    throw new Error('flow-composition 需要先加载 NoteDemo.mount。');
  }

  var PHASE_LABELS = { idle: '空闲', running: '运行中', error: '出错', disposed: '已销毁' };

  var PARTICIPANTS = [
    { id: 'client', label: '客户端', note: '发起连接' },
    { id: 'server', label: '服务端', note: '监听 443' }
  ];

  var STAGES = [
    { id: 'idle', label: '空闲' },
    { id: 'handshake', label: '握手' },
    { id: 'transfer', label: '传输' },
    { id: 'close', label: '关闭' }
  ];

  var MESSAGES = [
    { id: 'syn', from: 'client', to: 'server', label: 'SYN（同步）', type: 'sync' },
    { id: 'synack', from: 'server', to: 'client', label: 'SYN + ACK', type: 'sync' },
    { id: 'ack', from: 'client', to: 'server', label: 'ACK', type: 'sync' },
    { id: 'data', from: 'client', to: 'server', label: '数据（异步）', type: 'async' },
    { id: 'fin', from: 'server', to: 'client', label: 'FIN + ACK（返回）', type: 'return' }
  ];

  var TABLE_COLUMNS = [
    { key: 'message', label: '消息' },
    { key: 'direction', label: '方向' },
    { key: 'note', label: '状态' }
  ];

  var SNAPSHOTS = [
    { id: 'idle', caption: '连接尚未开始：客户端与服务端都在等待；阶段轨停在“空闲”。',
      stage: { current: 'idle', target: 'handshake' }, visible: 0, readout: '空闲：还没有报文字段' },
    { id: 'syn', caption: '客户端发送 SYN，请求建立连接；服务端收到第一段报文。',
      stage: { current: 'handshake', target: null }, visible: 1, readout: '握手：客户端 → 服务端 SYN' },
    { id: 'synack', caption: '服务端回复 SYN + ACK，表示同意并确认客户端序号。',
      stage: { current: 'handshake', target: 'transfer' }, visible: 2, readout: '握手：服务端 → 客户端 SYN + ACK' },
    { id: 'ack', caption: '客户端发送 ACK，三次握手完成；会话进入传输阶段。',
      stage: { current: 'transfer', target: null }, visible: 3, readout: '握手完成，进入传输' },
    { id: 'data', caption: '连接建立后，客户端继续发送数据；图中只保留方向与顺序。',
      stage: { current: 'transfer', target: 'close' }, visible: 4, readout: '传输：数据报文已发出' },
    { id: 'fin', caption: '服务端发出 FIN + ACK，开始关闭连接；最后一条消息停在图中。',
      stage: { current: 'close', target: null }, visible: 5, readout: '关闭：服务端 → 客户端 FIN + ACK' }
  ];

  function packetFocus(snapshot) {
    if (!snapshot || !snapshot.visible) return null;
    var index = Math.min(snapshot.visible, MESSAGES.length) - 1;
    return MESSAGES[index] ? MESSAGES[index].id : null;
  }

  function directionLabel(message) {
    var from = PARTICIPANTS.filter(function (item) { return item.id === message.from; })[0];
    var to = PARTICIPANTS.filter(function (item) { return item.id === message.to; })[0];
    return (from ? from.label : message.from) + ' → ' + (to ? to.label : message.to);
  }

  /* Binding 视图（Adapter 的 canonical 输入）。 */
  function stageView(snapshot) {
    return { stages: STAGES, current: snapshot.stage.current, target: snapshot.stage.target || null,
      skipped: [], failed: [], bypass: [], label: 'TCP 连接阶段' };
  }

  function packetView(snapshot) {
    return { participants: PARTICIPANTS, messages: MESSAGES, visibleCount: snapshot.visible,
      focus: packetFocus(snapshot), showIndexes: true, label: 'TCP 握手与关闭报文' };
  }

  function tableView(snapshot) {
    var visible = Math.min(snapshot.visible, MESSAGES.length);
    return {
      columns: TABLE_COLUMNS,
      rows: MESSAGES.map(function (message, index) {
        var shown = index < visible;
        var current = shown && index === visible - 1;
        return {
          id: message.id, message: message.label, direction: directionLabel(message),
          note: current ? '当前报文' : (shown ? '已出现' : '未出现'),
          state: current ? [{ type: 'current', label: '当前报文' }] : (shown ? [{ type: 'done' }] : [{ type: 'pending' }])
        };
      }),
      caption: '按消息顺序排列的当前显现状态',
      dense: true
    };
  }

  function readoutView(snapshot) { return { text: snapshot.readout }; }

  function stepFor(snapshot, withTable, withStage) {
    var replace = { readout: readoutView(snapshot), packet: packetView(snapshot) };
    var bindings = [{ binding: 'readout' }, { binding: 'packet' }];
    if (withStage) { replace.stage = stageView(snapshot); bindings.push({ binding: 'stage' }); }
    if (withTable) { replace.table = tableView(snapshot); bindings.push({ binding: 'table' }); }
    return { id: snapshot.id, caption: snapshot.caption, replace: replace, scene: { bindings: bindings } };
  }

  function buildStageDefinition() {
    var initial = SNAPSHOTS[0];
    return Recipes.repeatStages({
      bindings: {
        stage: { adapter: 'flow-stage', slot: 'stage', options: { label: 'TCP 连接阶段' } },
        packet: { adapter: 'flow-packet', slot: 'packet', options: { label: 'TCP 握手与关闭报文', showIndexes: true } },
        readout: { adapter: 'dom', slot: 'readout', options: { label: '当前读数' } }
      },
      initial: { id: initial.id, caption: initial.caption,
        views: { stage: stageView(initial), packet: packetView(initial), readout: readoutView(initial) } },
      items: SNAPSHOTS.slice(1),
      expand: function (snapshot) { return stepFor(snapshot, false, true); }
    }).definition;
  }

  function buildDiagramDefinition() {
    var initial = SNAPSHOTS[0];
    return Recipes.repeatStages({
      bindings: {
        packet: { adapter: 'flow-packet', slot: 'packet', options: { label: '报文流与消息状态', showIndexes: true } },
        table: { adapter: 'table', slot: 'table', options: { rowKey: 'id' } },
        readout: { adapter: 'dom', slot: 'readout', options: { label: '当前读数' } }
      },
      initial: { id: initial.id, caption: initial.caption,
        views: { packet: packetView(initial), table: tableView(initial), readout: readoutView(initial) } },
      items: SNAPSHOTS.slice(1),
      expand: function (snapshot) { return stepFor(snapshot, true, false); }
    }).definition;
  }

  function updatePhase(selector, state) {
    var node = doc.querySelector(selector);
    if (!node) return;
    var phase = state && state.phase ? state.phase : 'unknown';
    node.textContent = PHASE_LABELS[phase] || String(phase);
    node.setAttribute('data-phase', phase);
  }

  function failBox(host, error) {
    if (!host) return;
    host.replaceChildren();
    var box = doc.createElement('div');
    box.className = 'fc-error';
    box.setAttribute('role', 'alert');
    box.textContent = '组合示例无法挂载：' + (error && error.message ? error.message : String(error));
    host.appendChild(box);
  }

  function mountStagePacket(host) {
    var recipe = Recipes.stagePacket({
      definition: buildStageDefinition(),
      stage: { slot: 'stage', title: 'TCP 连接阶段', meta: 'flow-stage Adapter · 当前/目标由 Frame 状态给出' },
      packet: { slot: 'packet', title: '报文流', meta: 'flow-packet Adapter · 显现条数由 Frame 视图给出' },
      readout: { slot: 'readout', title: '当前读数', meta: 'dom Adapter · 与字幕同一快照' }
    });
    var session = global.NoteDemo.mount(host, recipe);
    session.subscribe(function (state) { updatePhase('[data-flow-phase="stage-packet"]', state); });
    return { recipe: recipe, session: session };
  }

  function mountDiagramTable(host) {
    var recipe = Recipes.diagramTable({
      definition: buildDiagramDefinition(),
      diagram: { slot: 'packet', title: '报文流', meta: 'flow-packet Adapter · 与状态表同源' },
      table: { slot: 'table', title: '消息状态表', meta: 'table Adapter · 行数据随停点更新，列结构稳定' },
      readout: { slot: 'readout', title: '当前读数', meta: 'dom Adapter · 与图形同步' }
    });
    var session = global.NoteDemo.mount(host, recipe);
    session.subscribe(function (state) { updatePhase('[data-flow-phase="diagram-table"]', state); });
    return { recipe: recipe, session: session };
  }

  function boot() {
    var hostA = doc.querySelector('[data-flow-host="stage-packet"]');
    var hostB = doc.querySelector('[data-flow-host="diagram-table"]');
    var sessions = [];
    try { if (hostA) sessions.push(mountStagePacket(hostA)); }
    catch (error) {
      failBox(hostA, error);
      if (global.console && typeof global.console.error === 'function') global.console.error('flow-composition：stagePacket 示例失败。', error);
    }
    try { if (hostB) sessions.push(mountDiagramTable(hostB)); }
    catch (error) {
      failBox(hostB, error);
      if (global.console && typeof global.console.error === 'function') global.console.error('flow-composition：diagramTable 示例失败。', error);
    }
    var messageCount = doc.querySelector('[data-flow-readout="messages"]');
    var stageCount = doc.querySelector('[data-flow-readout="stages"]');
    if (messageCount) messageCount.textContent = String(MESSAGES.length);
    if (stageCount) stageCount.textContent = String(STAGES.length);
    global.FlowCompositionSessions = sessions;
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
