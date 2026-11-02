/*! Gallery demos D07–D10 — real NoteViz.Flow mounts.
 * Scope: gallery only; public API, host data and user-triggered updates. */
(function (global) {
  'use strict';
  var demos = global.NoteGalleryDemos = global.NoteGalleryDemos || {};
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = String(text);
    return node;
  }
  function shell(host, title, note, body) {
    var root = el('div', 'nviz-flow-gallery');
    root.style.cssText = 'display:flex;flex-direction:column;gap:14px;min-width:0;max-width:100%;';
    var head = el('div');
    head.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
    var heading = el('strong', '', title);
    heading.style.cssText = 'font-size:15px;color:var(--hnv-color-ink,#1b2432)';
    var p = el('p', '', note);
    p.style.cssText = 'margin:0;color:var(--hnv-color-muted,#5c6879);font-size:13px;line-height:1.65;';
    head.append(heading, p);
    var toolbar = el('div');
    toolbar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';
    var stage = el('div');
    stage.style.cssText = 'min-width:0;max-width:100%;';
    root.append(head, toolbar, stage);
    body(root, toolbar, stage);
    host.appendChild(root);
    return root;
  }
  function button(toolbar, label, fn) {
    var b = el('button', '', label);
    b.type = 'button';
    b.style.cssText = 'padding:6px 12px;border:1px solid #ccd8ea;border-radius:8px;background:#fff;cursor:pointer;font:inherit;font-size:13px;';
    b.addEventListener('click', fn);
    toolbar.appendChild(b);
  }
  var Flow = function () { return global.NoteViz && global.NoteViz.Flow; };
  demos.D07 = function (host) {
    var flow = Flow(); if (!flow) throw new Error('需要 NoteViz.Flow');
    var state = { current: 's3', target: 's4', failed: [] };
    var instance = null;
    shell(host, 'StageTrack · 阶段轨', '当前、完成、跳过、失败和显式旁路都由宿主状态决定；更新只复用阶段节点。', function (root, toolbar) {
      var track = el('div');
      root.appendChild(track);
      instance = flow.StageTrack.mount(track, {
        label: '阶段轨', stages: [
          { id: 's1', label: '准备' }, { id: 's2', label: '校验' }, { id: 's3', label: '执行' },
          { id: 's4', label: '确认' }, { id: 's5', label: '收尾' }
        ], current: state.current, target: state.target, skipped: ['s2'], failed: state.failed,
        bypass: [{ from: 's2', to: 's4', label: '显式旁路 s2 → s4' }]
      });
      button(toolbar, '推进当前', function () {
        var ids = ['s1','s2','s3','s4','s5']; state.current = ids[(ids.indexOf(state.current)+1)%ids.length];
        if (state.current === 's2') state.current = 's3';
        instance.update({ current: state.current });
      });
      button(toolbar, '切换目标', function () { state.target = state.target === 's4' ? 's5' : 's4'; instance.update({ target: state.target }); });
      button(toolbar, '标记失败', function () { state.failed = state.failed.length ? [] : ['s3']; instance.update({ failed: state.failed }); });
    });
    return function () { if (instance) instance.destroy(); };
  };
  demos.D08 = function (host) {
    var flow = Flow(); if (!flow) throw new Error('需要 NoteViz.Flow');
    var visible = 2;
    var messages = [
      { id: 'm1', from: 'client', to: 'gateway', label: '请求 1' },
      { id: 'm2', from: 'gateway', to: 'service', label: '转发请求' },
      { id: 'm3', from: 'service', to: 'gateway', label: '响应' },
      { id: 'm4', from: 'gateway', to: 'client', label: '返回结果' }
    ];
    var instance = null;
    shell(host, 'PacketFlow · 消息流图', '参与者与消息有稳定 ID；逐步显现只读取宿主的 visibleCount，不创建播放器。', function (root, toolbar) {
      var box = el('div'); root.appendChild(box);
      instance = flow.PacketFlow.mount(box, {
        label: '消息流',
        participants: [{ id: 'client', label: '客户端' }, { id: 'gateway', label: '网关' }, { id: 'service', label: '服务端' }],
        messages: messages,
        visibleCount: visible,
        focus: 'm1'
      });
      button(toolbar, '显示下一条', function () { visible = Math.min(messages.length, visible + 1); instance.update({ visibleCount: visible, focus: messages[visible - 1].id }); });
      button(toolbar, '重置', function () { visible = 0; instance.update({ visibleCount: 0, focus: null }); });
    });
    return function () { if (instance) instance.destroy(); };
  };
  demos.D09 = function (host) {
    var flow = Flow(); if (!flow) throw new Error('需要 NoteViz.Flow');
    var extra = false;
    var scale = 600;
    var segments = [
      { id: 'a', label: 'A', value: 120 }, { id: 'b', label: 'B', value: 0 },
      { id: 'c', label: 'C', value: 320 }, { id: 'd', label: 'D', value: 0 }, { id: 'e', label: 'E', value: 80 }
    ];
    var instance = null;
    shell(host, 'SegmentBar · 分段长度条', '真实值、显示尺度和最小可读宽度分离；零长度仍有最小标记，插入/移除按稳定 ID 复用。', function (root, toolbar) {
      var box = el('div'); root.appendChild(box);
      instance = flow.SegmentBar.mount(box, {
        label: '分段长度', segments: segments, scaleMax: scale, minWidth: 18,
        ranges: [{ id: 'range-bd', label: '零值范围', start: 'b', end: 'd' }]
      });
      button(toolbar, '插入字段', function () { if (extra) return; extra = true; segments = segments.concat([{ id: 'f', label: 'F', value: 40 }]); instance.update({ segments: segments }); });
      button(toolbar, '移除字段', function () { if (!extra) return; extra = false; segments = segments.filter(function (s) { return s.id !== 'f'; }); instance.update({ segments: segments }); });
      button(toolbar, '切换尺度', function () { scale = scale === 600 ? 1000 : 600; instance.update({ scaleMax: scale }); });
    });
    return function () { if (instance) instance.destroy(); };
  };
  demos.D10 = function (host) {
    var flow = Flow(); if (!flow) throw new Error('需要 NoteViz.Flow');
    var links = [
      { id: 'ab', from: { device: 'a', port: 'out' }, to: { device: 'b', port: 'in' }, label: 'A → B', status: 'active' },
      { id: 'bc', from: { device: 'b', port: 'out' }, to: { device: 'c', port: 'in' }, label: 'B → C', status: 'idle' }
    ];
    var instance = null;
    shell(host, 'DeviceLinks · 设备连接图', '设备、命名端口、连接都有稳定 ID；连接路径可被宿主采样，不自动生成传播或接受语义。', function (root, toolbar) {
      var box = el('div'); root.appendChild(box);
      instance = flow.DeviceLinks.mount(box, {
        label: '设备连接',
        devices: [
          { id: 'a', label: '设备 A', ports: [{ id: 'out', label: 'OUT' }] },
          { id: 'b', label: '设备 B', ports: [{ id: 'in', label: 'IN' }, { id: 'out', label: 'OUT' }] },
          { id: 'c', label: '设备 C', ports: [{ id: 'in', label: 'IN' }] }
        ], links: links
      });
      button(toolbar, '切换连接状态', function () {
        links = links.map(function (link) { return Object.assign({}, link, { status: link.status === 'active' ? 'idle' : 'active' }); });
        instance.update({ links: links });
      });
      button(toolbar, '采样 A→B', function () {
        var path = instance.getLinkPath('ab'); var p = instance.pointAt('ab', 0.5);
        if (path && p) { global.console.info('DeviceLinks sample ab', p); }
      });
    });
    return function () { if (instance) instance.destroy(); };
  };
})(window);
