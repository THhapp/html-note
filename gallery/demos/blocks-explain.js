/*! Gallery demos B05–B10 — real NoteBlocks compositions with host-owned data.
 *  Only public NoteBlocks/NoteUI/NoteViz APIs are used. Each demo is static
 *  until the visitor operates its own controls. destroy() releases every
 *  tracked instance; nested components are released by each block's destroy. */
(function () {
  'use strict';

  var demos = window.NoteGalleryDemos = window.NoteGalleryDemos || {};

  function el(tag, className, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content == null ? '' : String(content);
    return node;
  }

  function createDemo(host, introText) {
    var root = el('div', 'nblk-gallery-demo');
    root.style.cssText = 'box-sizing:border-box;display:flex;flex-direction:column;gap:14px;width:100%;max-width:100%;min-width:0;color:var(--hnv-color-ink,#202938);font-family:var(--hnv-font-family,"Segoe UI","Microsoft YaHei UI","Microsoft YaHei","PingFang SC",sans-serif);font-size:var(--hnv-font-size-reading,16px);line-height:var(--hnv-font-line-reading,1.65);overflow-wrap:anywhere';
    var intro = el('p', 'nblk-gallery-demo__intro', introText);
    intro.style.cssText = 'margin:0;max-width:76ch;color:var(--hnv-color-ink,#202938);font-size:var(--hnv-font-size-reading,16px);line-height:var(--hnv-font-line-reading,1.65);overflow-wrap:anywhere';
    var toolbar = el('div', 'nblk-gallery-demo__toolbar');
    toolbar.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0;max-width:100%';
    var body = el('div', 'nblk-gallery-demo__body');
    body.style.cssText = 'min-width:0;max-width:100%';
    var status = el('p', 'nblk-gallery-demo__status');
    status.style.cssText = 'margin:0;min-height:1.6em;color:var(--hnv-color-muted,#5c6879);font-size:var(--hnv-font-size-label,14px);line-height:1.65;overflow-wrap:anywhere';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    root.append(intro, toolbar, body, status);
    host.appendChild(root);

    var cleanups = [];
    var destroyed = false;

    function track(instance) {
      if (instance && typeof instance.destroy === 'function') {
        cleanups.push(function () { instance.destroy(); });
      }
      return instance;
    }

    function addButton(label, variant, onClick) {
      var button = window.NoteUI.Button.mount(toolbar, {
        label: label,
        variant: variant || 'secondary',
        size: 'sm',
        onClick: onClick
      });
      track(button);
      return button;
    }

    function setStatus(value) {
      status.textContent = value == null ? '' : String(value);
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      for (var i = cleanups.length - 1; i >= 0; i -= 1) {
        try { cleanups[i](); } catch (error) { /* keep demo cleanup moving */ }
      }
      cleanups.length = 0;
      root.remove();
    }

    return {
      body: body,
      addButton: addButton,
      track: track,
      setStatus: setStatus,
      destroy: destroy
    };
  }

  function frame() {
    var node = el('div');
    node.style.cssText = 'box-sizing:border-box;width:100%;max-width:100%;min-width:0;transition:max-width var(--hnv-motion-ui,160ms) var(--hnv-motion-ease-ui,ease)';
    return node;
  }

  function toggleNarrow(node, narrow) {
    node.style.maxWidth = narrow ? '24rem' : '100%';
    node.style.overflow = narrow ? 'hidden' : '';
  }

  /* =====================================================================
   * B05 — CodeTrace
   * ===================================================================== */

  var SEARCH_CODE = [
    'function findIndex(values, target) {',
    '  let found = -1;',
    '  for (let i = 0; i < values.length; i += 1) {',
    '    if (values[i] === target) {',
    '      found = i;',
    '      break;',
    '    }',
    '  }',
    '  return found;',
    '}'
  ].join('\n');

  function searchTraceSteps(target) {
    var values = [4, 8, 15, 16];
    var valueText = '[' + values.join(', ') + ']';
    var steps = [{
      id: 'prepare',
      caption: '准备：在数组 ' + valueText + ' 中查找目标 ' + target + '。初始停点只显示预置状态，不自动开始。',
      highlight: { start: 1, end: 2 },
      variables: [
        { name: 'values', label: '输入数组', value: valueText },
        { name: 'target', label: '目标值', value: target },
        { name: 'i', label: '索引 i', value: '—' },
        { name: 'found', label: '结果 found', value: '-1' }
      ],
      explanation: '代码是宿主提供的纯文本，示例只展示快照，不会执行任何用户代码。'
    }];
    for (var i = 0; i < values.length; i += 1) {
      var hit = values[i] === target;
      steps.push({
        id: 'check-' + i,
        caption: '检查索引 ' + i + '：当前值 ' + values[i] +
          (hit ? ' 与目标相同，found 更新为 ' + i + '，然后跳出循环。' : ' 与目标不同，继续循环。'),
        highlight: hit ? { start: 4, end: 6 } : { start: 3, end: 4 },
        variables: [
          { name: 'values', label: '输入数组', value: valueText },
          { name: 'target', label: '目标值', value: target },
          { name: 'i', label: '索引 i', value: i, changed: true },
          { name: 'current', label: '当前值', value: values[i], changed: true },
          { name: 'found', label: '结果 found', value: hit ? i : '-1', changed: hit }
        ],
        explanation: hit
          ? '本步只有 i、current 与 found 改变；回退时会按上一停点快照整体恢复。'
          : '本步的检查只改变 i 和 current，found 仍保持 -1。'
      });
      if (hit) break;
    }
    steps.push({
      id: 'return',
      caption: target === values[values.length - 1] || values.indexOf(target) >= 0
        ? '循环结束，返回命中的索引 ' + values.indexOf(target) + '。'
        : '循环结束，没有命中目标，返回 -1。',
      highlight: { start: 9, end: 10 },
      variables: [
        { name: 'values', label: '输入数组', value: valueText },
        { name: 'target', label: '目标值', value: target },
        { name: 'i', label: '索引 i', value: values.indexOf(target) >= 0 ? values.indexOf(target) : values.length - 1 },
        { name: 'found', label: '结果 found', value: values.indexOf(target) }
      ],
      explanation: '返回停点仍保留完整变量快照；“重看”只重绘当前停点，不另造动画。'
    });
    return steps;
  }

  demos.B05 = function (host) {
    var demo = createDemo(host,
      '代码跟踪把只读代码、当前行范围、变量快照和字幕放在同一画面。默认停在初始快照；步进、回看、重看和重置都由组件控件触发。下方按钮只替换宿主数据或程序跳转，不会自动串播。');
    var frameNode = frame();
    demo.body.appendChild(frameNode);
    var scenario = 'found';
    var narrow = false;
    var setA = searchTraceSteps(15);
    var setB = searchTraceSteps(7);
    var trace = window.NoteBlocks.CodeTrace.mount(frameNode, {
      code: SEARCH_CODE,
      language: 'javascript',
      title: '数组查找的代码跟踪',
      steps: setA,
      current: 0,
      maxWidth: '64rem',
      label: '数组查找代码跟踪示例',
      onStep: function (index, step) {
        var changed = step && Array.isArray(step.variables) ? step.variables.filter(function (variable) {
          return variable && variable.changed;
        }) : [];
        demo.setStatus('用户步进到停点 ' + (index + 1) + '「' + (step && step.id ? step.id : '未命名') +
          '」；本步变量变化：' + (changed.length ? changed.map(function (variable) {
            return variable.label || variable.name;
          }).join('、') : '无') + '。');
      }
    });
    demo.track(trace);

    var switchButton;
    switchButton = demo.addButton('换用“未找到”场景', 'secondary', function () {
      scenario = scenario === 'found' ? 'missing' : 'found';
      trace.update({ steps: scenario === 'found' ? setA : setB, current: 0 });
      demo.setStatus('宿主已程序替换完整停点组并回到索引 0。该 update 不触发 onStep；当前字幕与变量按新快照重建。');
      switchButton.update({ label: scenario === 'found' ? '换用“未找到”场景' : '换回“命中”场景' });
    });

    demo.addButton('程序跳到索引 2 的检查', 'primary', function () {
      var steps = scenario === 'found' ? setA : setB;
      var index = -1;
      steps.some(function (step, position) {
        if (step.id === 'check-2') {
          index = position;
          return true;
        }
        return false;
      });
      if (index >= 0) {
        trace.go(index);
        demo.setStatus('宿主调用 go(' + index + ') 跳到索引 2 的检查停点。程序跳转不触发 onStep；控件与字幕同步到目标停点。');
      }
    });

    demo.addButton('切换窄容器', 'quiet', function () {
      narrow = !narrow;
      toggleNarrow(frameNode, narrow);
      demo.setStatus(narrow ? '窄容器：代码和变量区改为上下排列，代码块与变量列表各自局部滚动。' : '恢复常规宽度。');
    });

    demo.setStatus('初始停点静止。可先用组件自带的“下一步”逐项核对变量和代码行，或切换场景对比 update 后的完整重绘。');
    return { destroy: demo.destroy };
  };

  /* =====================================================================
   * B06 — FrameFields
   * ===================================================================== */

  function bitItems(bits) {
    return bits.split('').map(function (value, index) {
      return { id: 'bit-' + index, value: value, label: String(index) };
    });
  }

  var FRAME_BITS_A = '1010011011000101';
  var FRAME_BITS_B = '0111101010010011';

  demos.B06 = function (host) {
    var demo = createDemo(host,
      '位串与字段块的真实数据来自宿主：字段名称、顺序、范围和单位都在示例里给出。点击字段行或聚焦后按 Enter/Space 会同步位串关注；“切换位序”只改变派生数值的计算顺序，不重排位串。');
    var frameNode = frame();
    demo.body.appendChild(frameNode);
    var narrow = false;
    var usingA = true;
    var order = 'msb';
    var marked = true;
    var fieldsA = [
      { id: 'version', label: '版本', start: 0, end: 3, note: '四位字段；边界与名称均为宿主数据。' },
      { id: 'channel', label: '通道', start: 4, end: 7, value: 9, note: '本字段的值由宿主直接提供（9），不再按位串计算。' },
      { id: 'count', label: '计数', start: 8, end: 15, unit: '次', note: '值按当前位序从 8 位范围计算。' }
    ];
    var fieldsB = [
      { id: 'prefix', label: '前段', start: 0, end: 5, note: '六位范围。' },
      { id: 'suffix', label: '后段', start: 6, end: 12, unit: '单位' },
      { id: 'tail', label: '尾位', start: 13, end: 15, note: '三位范围，便于观察关注与分组。' }
    ];
    var instance = window.NoteBlocks.FrameFields.mount(frameNode, {
      items: bitItems(FRAME_BITS_A),
      fields: fieldsA,
      focusField: 'version',
      bitOrder: order,
      changed: ['count'],
      caption: '字段说明与单位由宿主提供；本演示不解释任何协议含义。当前字段和变化字段分别用文字标签表示。',
      label: '位串字段示例',
      onSelect: function (id) {
        demo.setStatus('字段选择回调（用户操作）：' + (id || '无') + '。位序仍为 ' + order.toUpperCase() + '。');
      }
    });
    demo.track(instance);

    var orderButton;
    orderButton = demo.addButton('切换为 LSB 在前', 'primary', function () {
      order = order === 'msb' ? 'lsb' : 'msb';
      instance.update({ bitOrder: order });
      orderButton.update({ label: order === 'msb' ? '切换为 LSB 在前' : '切换为 MSB 在前' });
      demo.setStatus('位序已切换为 ' + order.toUpperCase() + ' 在前。计算值更新，但位串位置和关注字段不变；update 不触发 onSelect。');
    });

    var markButton;
    markButton = demo.addButton(marked ? '清除变化标记' : '恢复变化标记', 'secondary', function () {
      marked = !marked;
      instance.update({ changed: marked ? ['count'] : [] });
      demo.setStatus(marked ? '变化字段集合恢复为 count；变化标记由宿主声明，组件不自动比较前后位串。' : '变化字段已清空；当前关注字段和位序保持不变。');
      markButton.update({ label: marked ? '清除变化标记' : '恢复变化标记' });
    });

    demo.addButton('选中计数字段', 'quiet', function () {
      instance.focusField('count', { silent: true });
      demo.setStatus('程序调用 focusField("count", {silent:true})：字段行与序列关注同步，未触发 onSelect。');
    });

    demo.addButton('换用另一组位串与字段', 'secondary', function () {
      usingA = !usingA;
      instance.update({
        items: bitItems(usingA ? FRAME_BITS_A : FRAME_BITS_B),
        fields: usingA ? fieldsA : fieldsB,
        focusField: usingA ? 'version' : 'prefix',
        changed: usingA ? ['count'] : ['suffix']
      });
      demo.setStatus('宿主已替换位串和字段。当前选择与变化集合按新数据解析；程序 update 不触发 onSelect。');
    });

    demo.addButton('切换窄容器', 'quiet', function () {
      narrow = !narrow;
      toggleNarrow(frameNode, narrow);
      demo.setStatus(narrow ? '窄容器：位串在自身区域横向滚动，字段行上下堆叠。' : '恢复常规宽度。');
    });

    demo.setStatus('初始关注“版本”字段，变化标记在“计数”。可用组件字段行检查关注同步，或切换位序观察派生值变化。');
    return { destroy: demo.destroy };
  };

  /* =====================================================================
   * B07 — ProcessFlow
   * ===================================================================== */

  function flowDataA() {
    return {
      nodes: [
        { id: 'intake', label: '接收请求', group: '入口' },
        { id: 'check', label: '校验输入', group: '处理' },
        { id: 'route', label: '选择路径', group: '处理' },
        { id: 'store', label: '写入存储', group: '同步分支' },
        { id: 'queue', label: '进入队列', group: '异步分支' },
        { id: 'reply', label: '返回结果', group: '出口' }
      ],
      edges: [
        { id: 'e-intake', from: 'intake', to: 'check', label: '提交', directed: true },
        { id: 'e-check-pass', from: 'check', to: 'route', label: '通过', directed: true },
        { id: 'e-check-reject', from: 'check', to: 'reply', label: '拒绝', directed: true },
        { id: 'e-route-store', from: 'route', to: 'store', label: '同步处理', directed: true },
        { id: 'e-route-queue', from: 'route', to: 'queue', label: '延后处理', directed: true },
        { id: 'e-store-reply', from: 'store', to: 'reply', label: '完成', directed: true },
        { id: 'e-queue-reply', from: 'queue', to: 'reply', label: '轮询完成', directed: true }
      ],
      steps: [
        { id: 's-intake', label: '接收', caption: '从接收节点开始；本停点没有指定边，图只关注当前节点。', nodeId: 'intake', edgeIds: [], note: '流程数据与停点均由宿主提供。' },
        { id: 's-check', label: '校验', caption: '请求沿“提交”边进入校验节点。完成项仍可在下方进度条辨认。', nodeId: 'check', edgeIds: ['e-intake'], note: '当前边在下方关系条以“当前边”文字列出。' },
        { id: 's-route', label: '分流', caption: '校验通过后沿“通过”边进入路径选择；这是当前关注节点。', nodeId: 'route', edgeIds: ['e-check-pass'] },
        { id: 's-store', label: '同步', caption: '选择同步分支，沿“同步处理”边进入写入存储。', nodeId: 'store', edgeIds: ['e-route-store'], note: '未走的“延后处理”边仍然可见，但不在本步关系列表中。' },
        { id: 's-reply', label: '返回', caption: '完成写入后沿“完成”边回到出口；停住后可核对已完成停点与当前关系。', nodeId: 'reply', edgeIds: ['e-store-reply'] }
      ]
    };
  }

  function flowDataB() {
    return {
      nodes: [
        { id: 'recv', label: '接收任务' },
        { id: 'work', label: '处理任务' },
        { id: 'done', label: '完成' }
      ],
      edges: [
        { id: 'b1', from: 'recv', to: 'work', label: '开始', directed: true },
        { id: 'b2', from: 'work', to: 'done', label: '结束', directed: true }
      ],
      steps: [
        { id: 'b-recv', label: '接收', caption: '精简流程从接收任务开始。', nodeId: 'recv' },
        { id: 'b-work', label: '处理', caption: '任务沿“开始”边进入处理节点。', nodeId: 'work', edgeIds: ['b1'] },
        { id: 'b-done', label: '完成', caption: '沿“结束”边到达完成节点；流程停止在这里，不自动继续。', nodeId: 'done', edgeIds: ['b2'] }
      ]
    };
  }

  demos.B07 = function (host) {
    var demo = createDemo(host,
      '流程块组合关系图与步骤指示。当前节点由 Graph 的公开关注接口标出；当前边在下方“本步关系”条以文字强调（Graph 冻结 API 没有边关注接口，演示不伪造边样式）。所有停点由宿主数据给出，无自动串播。');
    var frameNode = frame();
    demo.body.appendChild(frameNode);
    var data = flowDataA();
    var usingA = true;
    var narrow = false;
    var flow = window.NoteBlocks.ProcessFlow.mount(frameNode, {
      nodes: data.nodes,
      edges: data.edges,
      steps: data.steps,
      title: '流程步进 · 完整分支',
      maxWidth: '64rem',
      label: '流程步进示例',
      onStep: function (index, step) {
        demo.setStatus('用户步进到停点 ' + (index + 1) + '「' + (step && step.label ? step.label : '未命名') +
          '」；当前节点为 ' + (step && step.nodeId ? step.nodeId : '未指定') + '。');
      }
    });
    demo.track(flow);

    demo.addButton('跳到分流停点', 'primary', function () {
      flow.go(2);
      demo.setStatus('程序调用 go(2) 到分流停点；程序跳转不触发 onStep。当前节点关注、关系条和进度会同步。');
    });

    var switchButton = demo.addButton('换用精简流程', 'secondary', function () {
      usingA = !usingA;
      data = usingA ? flowDataA() : flowDataB();
      flow.update({
        nodes: data.nodes,
        edges: data.edges,
        steps: data.steps,
        title: usingA ? '流程步进 · 完整分支' : '流程步进 · 精简流程'
      });
      flow.go(0);
      switchButton.update({ label: usingA ? '换用精简流程' : '换回完整分支' });
      demo.setStatus('宿主已替换节点、边与停点并程序回到索引 0。当前关注和关系条按新数据重建，未触发 onStep。');
    });

    demo.addButton('切换窄容器', 'quiet', function () {
      narrow = !narrow;
      toggleNarrow(frameNode, narrow);
      demo.setStatus(narrow ? '窄容器：图在自身区域局部滚动，标签不缩小成不可读字号；关系条与进度改为单列。' : '恢复常规宽度。');
    });

    demo.setStatus('初始显示接收停点。可用组件控件逐步查看五个停点，并核对当前节点、关系条和进度指示。');
    return { destroy: demo.destroy };
  };

  /* =====================================================================
   * B08 — SequenceDiagram
   * ===================================================================== */

  function sequenceDataA() {
    return {
      participants: [
        { id: 'browser', label: '浏览器' },
        { id: 'gateway', label: '接入网关', note: '保留请求上下文' },
        { id: 'store', label: '存储服务', note: '读取与返回记录' },
        { id: 'worker', label: '后台任务', note: '审计走异步' }
      ],
      messages: [
        { id: 'm-a1', from: 'browser', to: 'gateway', label: '提交请求', type: 'sync', note: '浏览器把请求交给接入网关。' },
        { id: 'm-a2', from: 'gateway', to: 'store', label: '读取记录', type: 'sync', note: '网关向存储读取当前记录。' },
        { id: 'm-a3', from: 'store', to: 'gateway', label: '返回记录', type: 'return', note: '存储把记录作为返回消息送回网关。' },
        { id: 'm-a4', from: 'gateway', to: 'worker', label: '写入审计事件', type: 'async', note: '审计写入以异步消息发出，不阻塞响应。' },
        { id: 'm-a5', from: 'gateway', to: 'browser', label: '响应结果', type: 'return', note: '网关把响应结果返回给浏览器。' }
      ],
      caption: '四条参与者、五条消息的顺序由宿主数据提供；当前消息在图中用行底色和“当前”文字标出，解释放在图下字幕。',
      title: '时序消息 · 完整示例'
    };
  }

  function sequenceDataB() {
    return {
      participants: [
        { id: 'client', label: '客户端' },
        { id: 'worker', label: '任务执行器', note: '处理过程中刷新心跳' }
      ],
      messages: [
        { id: 'm-b1', from: 'client', to: 'worker', label: '提交后台任务', type: 'sync', note: '客户端发出开始消息。' },
        { id: 'm-b2', from: 'worker', to: 'worker', label: '刷新心跳', type: 'async', note: '这是一条指向自身的异步消息，行内以回环显示。' },
        { id: 'm-b3', from: 'worker', to: 'client', label: '任务完成通知', type: 'return', note: '执行器向客户端发送完成通知。' }
      ],
      caption: '较短的备用数据包含一条自身消息，用于检查消息类型、顺序和当前行标记在更换数据后仍然一致。',
      title: '时序消息 · 短示例'
    };
  }

  demos.B08 = function (host) {
    var demo = createDemo(host,
      '时序图的消息类型不是只靠颜色：同步为实线、异步为虚线、返回为点线，并同时在消息文字中写出类型。当前消息在图中有“当前”文字与行强调，图下字幕解释谁发给谁。组件默认静止，用户可用自身控件步进。');
    var frameNode = frame();
    demo.body.appendChild(frameNode);
    var data = sequenceDataA();
    var usingA = true;
    var narrow = false;
    var diagram = window.NoteBlocks.SequenceDiagram.mount(frameNode, {
      participants: data.participants,
      messages: data.messages,
      current: 0,
      title: data.title,
      caption: data.caption,
      maxWidth: '64rem',
      label: '消息时序示例'
    });
    demo.track(diagram);

    demo.addButton('跳到返回消息', 'primary', function () {
      diagram.go(2);
      demo.setStatus('程序调用 go(2) 到第 3 条消息；字幕与图内当前行同步，且不会自动继续到后续消息。');
    });

    demo.addButton('跳到异步消息', 'secondary', function () {
      var index = -1;
      (usingA ? sequenceDataA().messages : sequenceDataB().messages).some(function (message, position) {
        if (message.type === 'async') {
          index = position;
          return true;
        }
        return false;
      });
      if (index >= 0) diagram.go(index);
      demo.setStatus(index >= 0
        ? '程序跳到第 ' + (index + 1) + ' 条异步消息；虚线、箭头和字幕中的“异步”文字同时可核对。'
        : '当前数据没有异步消息。');
    });

    var switchButton = demo.addButton('换用短时序', 'secondary', function () {
      usingA = !usingA;
      data = usingA ? sequenceDataA() : sequenceDataB();
      diagram.update({
        participants: data.participants,
        messages: data.messages,
        current: 0,
        title: data.title,
        caption: data.caption
      });
      switchButton.update({ label: usingA ? '换用短时序' : '换回完整时序' });
      demo.setStatus('宿主已替换参与者与消息并回到第 1 条。当前行、字幕和 getTarget 映射按新数据重建，无旧消息残留。');
    });

    demo.addButton('切换窄容器', 'quiet', function () {
      narrow = !narrow;
      toggleNarrow(frameNode, narrow);
      demo.setStatus(narrow ? '窄容器：参与者在图内横向滚动；当前消息会被滚入可视区，页面不横向溢出。' : '恢复常规宽度。');
    });

    demo.setStatus('初始停在第 1 条同步消息。可用组件自带的步进与重看控件核对消息顺序、方向、类型和当前解释。');
    return { destroy: demo.destroy };
  };

  /* =====================================================================
   * B09 — HierarchyDetail
   * ===================================================================== */

  function hierarchyNodes(extra) {
    var referenceChildren = [
      { id: 'api', label: '接口索引' },
      { id: 'limits', label: '已知限制' }
    ];
    if (extra) referenceChildren.push({ id: 'migration', label: '迁移说明（新增）' });
    return [
      {
        id: 'guide',
        label: '使用指南',
        children: [
          { id: 'start', label: '快速开始' },
          { id: 'pattern', label: '常用模式' }
        ]
      },
      {
        id: 'reference',
        label: '参考',
        children: referenceChildren
      },
      {
        id: 'archive',
        label: '归档',
        children: [
          { id: 'old', label: '旧版本说明' }
        ]
      }
    ];
  }

  function hierarchyDetails(variant) {
    var suffix = variant ? '（替换后的内容）' : '';
    return {
      start: {
        title: '快速开始' + suffix,
        fields: [
          { label: '状态', value: '可直接使用' },
          { label: '依赖', value: 'core 与公开组件' },
          { label: '示例范围', value: '通用宿主数据' }
        ],
        content: '这个条目只演示目录与详情组合。详情字段、说明和正文均由宿主提供，组件不会生成课程、测验或评分。' + suffix,
        note: '更新详情时仍保留当前目录选中项和树的滚动位置。'
      },
      pattern: {
        title: '常用模式' + suffix,
        fields: [
          { label: '模式', value: '目录 + 详情' },
          { label: '选中方式', value: '单选' },
          { label: '详情替换', value: '按选中 id 查找', changed: variant }
        ],
        content: '目录负责定位，详情负责解释所选对象。详情字段较多或内容较长时，只在详情面板内部滚动。' + suffix,
        note: '目录树不是机制关系图；这里不绘制节点之间的运行关系。'
      },
      api: {
        title: '接口索引' + suffix,
        fields: [
          { label: '公开入口', value: 'NoteBlocks.HierarchyDetail' },
          { label: '关键实例方法', value: 'select / getTarget / update / destroy' },
          { label: '选择回调', value: 'onSelect' },
          { label: '详情范围', value: '宿主提供的字段、正文与说明' }
        ],
        content: '详情可以包含字段网格、普通文本或宿主提供的 DOM 内容。内容替换不会让目录树重建，因此选中项与树的定位保持稳定。' + suffix,
        note: '程序 select 默认会通知 onSelect；本演示调用时使用 silent:true。'
      },
      limits: {
        title: '已知限制' + suffix,
        fields: [
          { label: '异步加载', value: '不支持' },
          { label: '多选', value: '不支持' },
          { label: '树搜索', value: '不支持' },
          { label: '机制图', value: '不承担' }
        ],
        content: '这是一个用于检查长内容滚动的本地示例。' + suffix + ' ' +
          '目录节点一次性由宿主提供；详情区独立滚动，树也有独立的局部滚动范围。' +
          '当容器变窄时，两个面板改为上下排列，字段网格按可用宽度换行。',
        note: '重要说明始终放在正常阅读路径中，不依赖悬停或角落小字。'
      },
      old: {
        title: '旧版本说明' + suffix,
        fields: [
          { label: '版本', value: 'v0.9' },
          { label: '状态', value: '仅归档' }
        ],
        content: '归档条目仍然可以被选择，但不应被误认为当前版本。' + suffix,
        note: ''
      },
      migration: {
        title: '迁移说明（新增）' + suffix,
        fields: [
          { label: '来源', value: '宿主新增节点' },
          { label: '选中保持', value: '原选中项仍存在' }
        ],
        content: '这是节点替换后新增的目录项，用来验证原选中项不会因树重建而丢失。' + suffix,
        note: '新增节点由宿主数据决定，组件不推断层级关系。'
      }
    };
  }

  demos.B09 = function (host) {
    var demo = createDemo(host,
      '层级与详情把可操作目录和详情面板组合在一起。示例初始选中嵌套的“接口索引”；程序 select、详情替换和节点替换都不会自动播放。详情替换保持选中与树的定位，窄容器下两个面板上下排列。');
    var frameNode = frame();
    demo.body.appendChild(frameNode);
    var narrow = false;
    var variant = false;
    var withMigration = false;
    var instance = window.NoteBlocks.HierarchyDetail.mount(frameNode, {
      nodes: hierarchyNodes(false),
      selected: 'api',
      details: hierarchyDetails(false),
      labels: {
        block: '层级与详情示例',
        tree: '目录',
        detail: '条目详情',
        empty: '从左侧目录选择一个条目。',
        noDetail: '该目录项没有详情数据。',
        fields: '字段',
        note: '说明'
      },
      onSelect: function (id) {
        demo.setStatus('用户选择回调：' + (id || '无') + '。详情已更新，目录保持当前展开与选中状态。');
      }
    });
    demo.track(instance);

    demo.addButton('静默选中“常用模式”', 'primary', function () {
      var changed = instance.select('pattern', { silent: true });
      demo.setStatus(changed
        ? '程序调用 select("pattern", {silent:true})：已展开父级、更新详情并保持树定位；未触发 onSelect。'
        : '目标已经是当前选中项；没有发出选择回调。');
    });

    demo.addButton('替换详情内容', 'secondary', function () {
      variant = !variant;
      instance.update({ details: hierarchyDetails(variant) });
      demo.setStatus('宿主只替换了 details 映射；树没有重建，当前选中项与树的滚动位置保持。update 不触发 onSelect。');
    });

    demo.addButton('替换目录并新增条目', 'secondary', function () {
      withMigration = !withMigration;
      instance.update({ nodes: hierarchyNodes(withMigration) });
      demo.setStatus(withMigration
        ? '目录已替换并新增“迁移说明”，原选中项仍存在，因此继续保留选中与定位。'
        : '已换回原目录；若当前选中项仍存在，选中不会丢失。');
    });

    demo.addButton('切换窄容器', 'quiet', function () {
      narrow = !narrow;
      toggleNarrow(frameNode, narrow);
      demo.setStatus(narrow ? '窄容器：目录与详情改为上下布局；详情正文在面板内部局部滚动。' : '恢复常规两栏布局。');
    });

    demo.setStatus('初始选中“接口索引”。可在目录中用键盘选择其他条目，或使用上方控件检查程序 select 与内容替换。');
    return { destroy: demo.destroy };
  };

  /* =====================================================================
   * B10 — ChartExplain
   * ===================================================================== */

  function chartData(revised) {
    return {
      type: 'bar',
      labels: ['样本 A', '样本 B', '样本 C', '样本 D', '样本 E'],
      series: [
        { key: 'first', label: '首轮', values: [42, 57, 51, 64, 48] },
        { key: 'second', label: '复核', values: [44, 55, 53, revised ? 72 : 68, 46] }
      ],
      height: 320,
      table: true
    };
  }

  function chartSteps(revised) {
    if (revised) {
      return [
        {
          id: 'rev-overview',
          label: '整体',
          caption: '先读整体：两组读数并列显示。这一组数据中，复核组的样本 D 已更新为 72。',
          focus: { series: 'second' },
          note: '图表数据由宿主一次性替换；进入停点后不再自动改数值。'
        },
        {
          id: 'rev-d',
          label: '样本 D',
          caption: '本步只关注复核组的样本 D：其读数为 72。数据表保留全部读数，便于核对。',
          focus: { series: 'second', index: 3 },
          changed: { series: 'second', index: 3 },
          note: '关注与本步变化落在同一点时，Chart 合并标记，不叠两套提示。'
        }
      ];
    }
    return [
      {
        id: 'base-overview',
        label: '整体',
        caption: '先看两组读数的整体范围；当前关注复核系列，没有声明任何本步变化。',
        focus: { series: 'second' }
      },
      {
        id: 'base-d',
        label: '样本 D',
        caption: '把注意力收窄到样本 D：复核读数为 68。这是当前关注点，不据此推断趋势。',
        focus: { series: 'second', index: 3 }
      },
      {
        id: 'base-a',
        label: '样本 A',
        caption: '转到样本 A：复核读数为 44。图表数据未改变，只改变当前关注。',
        focus: { series: 'second', index: 0 }
      }
    ];
  }

  demos.B10 = function (host) {
    var demo = createDemo(host,
      '图表讲解把统计图与停点字幕组合起来。每步只移动关注或在宿主明确给出时标出本步变化，不自动同时改动多个数值，也不做趋势推断。图表下方保留可展开的数据表，便于停住后核对读数。');
    var frameNode = frame();
    demo.body.appendChild(frameNode);
    var narrow = false;
    var revised = false;
    var instance = window.NoteBlocks.ChartExplain.mount(frameNode, {
      chart: chartData(false),
      steps: chartSteps(false),
      title: '图表讲解 · 两组读数',
      maxWidth: '64rem',
      label: '图表讲解示例',
      onStep: function (index, step) {
        demo.setStatus('用户步进到停点 ' + (index + 1) + '「' + (step && step.label ? step.label : '未命名') +
          '」。图表数据保持不变；当前只更新关注/变化标记与字幕。');
      }
    });
    demo.track(instance);

    var switchButton = demo.addButton('换用更新后的读数', 'primary', function () {
      revised = !revised;
      instance.update({
        chart: chartData(revised),
        steps: chartSteps(revised),
        title: revised ? '图表讲解 · 更新后的读数' : '图表讲解 · 两组读数'
      });
      instance.go(0);
      switchButton.update({ label: revised ? '换回原始读数' : '换用更新后的读数' });
      demo.setStatus('宿主已整体替换 chart 与 steps 并程序回到第 1 个停点。程序更新不触发 onStep；数据表重新挂载且默认关闭。');
    });

    demo.addButton('程序跳到第 2 个停点', 'secondary', function () {
      instance.go(1);
      demo.setStatus('程序调用 go(1)。关注和本步变化（若宿主提供）同步移动，字幕更新；没有自动播放或计数器动画。');
    });

    demo.addButton('切换窄容器', 'quiet', function () {
      narrow = !narrow;
      toggleNarrow(frameNode, narrow);
      demo.setStatus(narrow ? '窄容器：图表保持可读，数据表需要时在自身区域横向滚动。' : '恢复常规宽度。');
    });

    demo.setStatus('初始停点强调复核系列。可用组件自带的步进、跳转、重看与重来检查图表、字幕和数据表。');
    return { destroy: demo.destroy };
  };
})();
