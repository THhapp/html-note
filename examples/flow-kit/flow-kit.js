/* examples/flow-kit — neutral host wiring for window.NoteViz.Flow.
 * The demo owns data/status/buttons only; the four graphics are independent public mounts.
 * No course rules, no automatic playback: reveal counts, statuses and sampling are explicit
 * host actions. Link sampling is a host-side pointAt loop, not a nested player. */
(function (global) {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  ready(function boot() {
    var Flow = global.NoteViz && global.NoteViz.Flow;
    if (!Flow) {
      throw new Error('FlowKit 示例需要先加载 src/viz/flow.js（window.NoteViz.Flow）。');
    }
    var host = function (name) { return document.querySelector('[data-flow-host="' + name + '"]'); };
    var readout = document.querySelector('[data-flow-readout="devicelinks"]');
    var stageHost = host('stagetrack');
    var flowHost = host('packetflow');
    var segmentHost = host('segmentbar');
    var linksHost = host('devicelinks');
    if (!stageHost || !flowHost || !segmentHost || !linksHost) {
      throw new Error('FlowKit 示例缺少演示宿主。');
    }

    /* ---------------- StageTrack ---------------- */
    var stageIds = ['s1', 's2', 's3', 's4', 's5'];
    var stageState = {
      current: 's3',
      target: 's4',
      failed: [],
      skipped: ['s2']
    };
    var stageTrack = Flow.StageTrack.mount(stageHost, {
      label: '阶段轨演示',
      stages: [
        { id: 's1', label: '准备' },
        { id: 's2', label: '校验' },
        { id: 's3', label: '执行' },
        { id: 's4', label: '确认' },
        { id: 's5', label: '收尾' }
      ],
      current: stageState.current,
      target: stageState.target,
      skipped: stageState.skipped,
      failed: stageState.failed,
      bypass: [{ from: 's2', to: 's4', label: '显式旁路：s2 → s4（不自动推断）' }]
    });
    function updateStage() {
      stageTrack.update({
        current: stageState.current,
        target: stageState.target,
        skipped: stageState.skipped,
        failed: stageState.failed
      });
    }
    function nextStage() {
      var index = stageIds.indexOf(stageState.current);
      stageState.current = stageIds[(index + 1) % stageIds.length];
      if (stageState.current === 's2') stageState.current = 's3';
      updateStage();
    }
    function toggleStageTarget() {
      stageState.target = stageState.target === 's4' ? 's5' : 's4';
      updateStage();
    }
    function toggleStageFailed() {
      stageState.failed = stageState.failed.indexOf('s3') >= 0 ? [] : ['s3'];
      updateStage();
    }

    /* ---------------- PacketFlow ---------------- */
    var flowMessages = [
      { id: 'm1', from: 'client', to: 'gateway', label: '请求 1' },
      { id: 'm2', from: 'gateway', to: 'service', label: '转发请求' },
      { id: 'm3', from: 'service', to: 'gateway', label: '响应' },
      { id: 'm4', from: 'gateway', to: 'client', label: '返回结果' }
    ];
    var flowVisible = 2;
    var packetFlow = Flow.PacketFlow.mount(flowHost, {
      label: '消息流演示',
      participants: [
        { id: 'client', label: '客户端' },
        { id: 'gateway', label: '网关' },
        { id: 'service', label: '服务端' }
      ],
      messages: flowMessages,
      visibleCount: flowVisible,
      focus: 'm1'
    });
    function updateFlow() {
      packetFlow.update({
        visibleCount: flowVisible,
        focus: flowVisible > 0 ? flowMessages[Math.min(flowVisible, flowMessages.length) - 1].id : null
      });
    }
    function revealFlow() {
      if (flowVisible < flowMessages.length) flowVisible += 1;
      updateFlow();
    }
    function resetFlow() {
      flowVisible = 0;
      updateFlow();
    }

    /* ---------------- SegmentBar ---------------- */
    var segmentState = {
      segments: [
        { id: 'seg-a', label: 'A', value: 120 },
        { id: 'seg-b', label: 'B', value: 0 },
        { id: 'seg-c', label: 'C', value: 320 },
        { id: 'seg-d', label: 'D', value: 0 },
        { id: 'seg-e', label: 'E', value: 80 }
      ],
      scaleMax: 600,
      extra: false
    };
    function segmentRanges() {
      var ids = segmentState.segments.map(function (segment) { return segment.id; });
      var start = ids.indexOf('seg-b') >= 0 ? 'seg-b' : 'seg-c';
      var end = ids.indexOf('seg-d') >= 0 ? 'seg-d' : 'seg-e';
      if (ids.indexOf(start) < 0 || ids.indexOf(end) < 0) return [];
      return [{ id: 'range-bd', label: '零/低值范围（范围目标）', start: start, end: end }];
    }
    var segmentBar = Flow.SegmentBar.mount(segmentHost, {
      label: '段条演示',
      segments: segmentState.segments,
      scaleMax: segmentState.scaleMax,
      minWidth: 18,
      ranges: segmentRanges()
    });
    function updateSegments() {
      segmentBar.update({
        segments: segmentState.segments,
        scaleMax: segmentState.scaleMax,
        ranges: segmentRanges()
      });
    }
    function addSegment() {
      if (segmentState.extra) return;
      segmentState.extra = true;
      segmentState.segments = segmentState.segments.concat([{ id: 'seg-f', label: 'F', value: 40 }]);
      updateSegments();
    }
    function removeSegment() {
      if (!segmentState.extra) return;
      segmentState.extra = false;
      segmentState.segments = segmentState.segments.filter(function (segment) { return segment.id !== 'seg-f'; });
      updateSegments();
    }
    function toggleScale() {
      segmentState.scaleMax = segmentState.scaleMax === 600 ? 1000 : 600;
      updateSegments();
    }

    /* ---------------- DeviceLinks ---------------- */
    var deviceState = [
      { id: 'dev-a', label: '设备 A', ports: [{ id: 'in', label: 'IN' }, { id: 'out', label: 'OUT' }] },
      { id: 'dev-b', label: '设备 B', ports: [{ id: 'in', label: 'IN' }, { id: 'out', label: 'OUT' }] },
      { id: 'dev-c', label: '设备 C', ports: [{ id: 'in', label: 'IN' }, { id: 'out', label: 'OUT' }] }
    ];
    var linkState = [
      { id: 'link-ab', from: { device: 'dev-a', port: 'out' }, to: { device: 'dev-b', port: 'in' }, label: 'A → B', status: 'active' },
      { id: 'link-bc', from: { device: 'dev-b', port: 'out' }, to: { device: 'dev-c', port: 'in' }, label: 'B → C', status: 'idle' }
    ];
    var deviceLinks = Flow.DeviceLinks.mount(linksHost, {
      label: '设备连接演示',
      devices: deviceState,
      links: linkState
    });
    function toggleLinks() {
      linkState = linkState.map(function (link) {
        return Object.assign({}, link, { status: link.status === 'active' ? 'idle' : 'active' });
      });
      deviceLinks.update({ links: linkState });
    }

    /* 传播副本/路径复用公共机制；不在此手写 rAF 和临时圆点清理。 */
    var propagation = null;
    function propagationFor() {
      if (propagation) return propagation;
      var svg = deviceLinks.getTarget('svg');
      var path = deviceLinks.getLinkPath('link-ab');
      if (!svg || !path || !Flow.Propagation) return null;
      propagation = Flow.Propagation.mount(svg, {
        label: '连接传播示例',
        paths: { ab: path },
        copies: [
          { id: 'packet-1', pathId: 'ab' },
          { id: 'packet-2', pathId: 'ab', offset: -0.18 }
        ]
      });
      return propagation;
    }
    var sampleRatio = 0;
    function sampleLink() {
      var runner = propagationFor();
      if (!runner) return;
      sampleRatio = sampleRatio === 0 ? 0.5 : (sampleRatio === 0.5 ? 1 : 0);
      runner.update(sampleRatio);
      if (readout) {
        var state = runner.getState();
        var first = state.copies[0] || {};
        readout.textContent = '传播 link-ab：t=' + sampleRatio.toFixed(2) +
          '，首个副本=(' + (first.x || 0).toFixed(1) + ', ' + (first.y || 0).toFixed(1) + ')' +
          '，副本数=' + state.copies.length;
      }
    }
    /* ---------------- wiring ---------------- */
    document.addEventListener('click', function (event) {
      var button = event.target && event.target.closest ? event.target.closest('[data-flow-action]') : null;
      if (!button) return;
      var action = button.getAttribute('data-flow-action');
      if (action === 'stage-next') nextStage();
      else if (action === 'stage-target') toggleStageTarget();
      else if (action === 'stage-fail') toggleStageFailed();
      else if (action === 'flow-reveal') revealFlow();
      else if (action === 'flow-reset') resetFlow();
      else if (action === 'seg-add') addSegment();
      else if (action === 'seg-remove') removeSegment();
      else if (action === 'seg-scale') toggleScale();
      else if (action === 'link-active') toggleLinks();
      else if (action === 'link-sample') sampleLink();
    });

    global.FlowKitDemo = {
      Flow: Flow,
      stageTrack: stageTrack,
      packetFlow: packetFlow,
      segmentBar: segmentBar,
      deviceLinks: deviceLinks,
      updateStage: updateStage,
      revealFlow: revealFlow,
      resetFlow: resetFlow,
      addSegment: addSegment,
      removeSegment: removeSegment,
      toggleScale: toggleScale,
      toggleLinks: toggleLinks,
      propagation: propagation,
      sampleLink: sampleLink
    };
  });
})(window);
