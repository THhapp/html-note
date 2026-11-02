/* Authoring handoff demo — 普通 DOM 交接（自定义 Adapter，只用公开契约）。
 *
 * 目的：演示“动画结束后由谁接住画面”和“来源对象保留到观察结束”两个公共能力：
 *  - PreparedChange.sourceElements()：来源标签在 commit 后仍保持可见，直到本步
 *    第一个内容效果轨道启动时才释放（观察期来源不消失）。
 *  - EffectSpec.handoff:'hold'：目标标签淡入完成后末帧保持到 scene 收束，
 *    避免先回落到 commit 预置的隐藏内联样式、再等 cleanup 才重新出现。
 *
 * 本文件只使用 NoteDemo 公开契约（Definition / Adapter / PreparedChange /
 * EffectSpec / scene.attention），不读取 NoteDemoInternals，不复制播放器、
 * 计时器或清理框架；播放、ready、清理全部由公共 scene 负责。
 * 经典脚本，无模块 / 无网络 / 无 eval。
 */
(function (global) {
  'use strict';

  var document = global.document;
  var ADAPTER_NAME = 'handoff-dom';
  var GROUP = 'reveal';
  var STAGE_SOURCE = 'source';
  var STAGE_HANDOFF = 'handoff';

  function fail(message) {
    throw new Error(ADAPTER_NAME + ' Adapter：' + message);
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function readText(value, name) {
    if (value == null) return '';
    if (typeof value !== 'string') fail('view.' + name + ' 必须是字符串。');
    return value;
  }

  function viewModel(view) {
    if (isObject(view && view.model)) return view.model;
    return isObject(view) ? view : {};
  }

  function normalizeView(input) {
    if (!isObject(input)) fail('view 必须是 { source, target, stage } 对象。');
    var stage = input.stage == null ? STAGE_SOURCE : String(input.stage);
    if (stage !== STAGE_SOURCE && stage !== STAGE_HANDOFF) {
      fail('view.stage 只能是 "source" 或 "handoff"。');
    }
    return {
      model: {
        source: readText(input.source, 'source'),
        target: readText(input.target, 'target'),
        stage: stage
      },
      cues: {}
    };
  }

  function validateAction(action) {
    var type = isObject(action) && action.type != null ? String(action.type) : '';
    fail('handoff-dom 是静态恢复型 Adapter，不支持动作' + (type ? ' "' + type + '"' : '') + '。');
  }

  function makeHandle(root, sourceLabel, targetLabel, arrowEl, container, owned) {
    var destroyed = false;

    function setStage(stage) {
      root.setAttribute('data-stage', stage);
    }

    function clearPreset() {
      targetLabel.style.removeProperty('opacity');
      targetLabel.style.removeProperty('transform');
    }

    function applyView(model) {
      sourceLabel.textContent = readText(model.source, 'source');
      targetLabel.textContent = readText(model.target, 'target');
      var stage = model.stage === STAGE_HANDOFF ? STAGE_HANDOFF : STAGE_SOURCE;
      setStage(stage);
      clearPreset();
    }

    function readView() {
      return {
        model: {
          source: sourceLabel.textContent,
          target: targetLabel.textContent,
          stage: root.getAttribute('data-stage') === STAGE_HANDOFF ? STAGE_HANDOFF : STAGE_SOURCE
        },
        cues: {}
      };
    }

    function makePreparedChange(context) {
      var targetModel = viewModel(isObject(context) ? context.targetView : null);
      var sourceStage = isObject(context) && isObject(context.sourceView)
        ? viewModel(context.sourceView).stage : STAGE_SOURCE;
      var stage = targetModel.stage === STAGE_HANDOFF ? STAGE_HANDOFF : STAGE_SOURCE;
      var stageChanged = sourceStage !== stage;
      /* 减少动效：直接落目标，不预置隐藏、不产生局部动画。 */
      var motion = isObject(context) && context.motion === 'never' ? 'never' : 'auto';
      var committed = false;
      var preset = false;

      return {
        /* commit 前由公共 scene 调用一次：把本步仍需要可见的来源对象交给它，
         * 它在 commit 前捕获可见状态，commit 后恢复，直到内容轨道启动才释放。 */
        sourceElements: function () {
          return [sourceLabel];
        },
        groups: function () {
          return [GROUP];
        },
        commit: function () {
          if (committed) return;
          committed = true;
          applyView(targetModel);
          setStage(stage);
          if (motion === 'never' || stage !== STAGE_HANDOFF) {
            clearPreset();
            return;
          }
          /* 目标标签在内容到达前保持不可见：commit 只预置视觉，不启动播放器。 */
          targetLabel.style.opacity = '0';
          targetLabel.style.transform = 'translateY(6px)';
          preset = true;
        },
        effects: function (effectCtx) {
          if (motion === 'never' || stage !== STAGE_HANDOFF) return [];
          var timing = isObject(effectCtx) && isObject(effectCtx.timing) ? effectCtx.timing : {};
          var duration = typeof timing.revealDuration === 'number' && timing.revealDuration > 0
            ? timing.revealDuration : 360;
          var handoff = {
            el: targetLabel,
            keyframes: [
              { opacity: '0', transform: 'translateY(6px)' },
              { opacity: '1', transform: 'translateY(0)' }
            ],
            options: { duration: duration, easing: 'cubic-bezier(.22,.7,.25,1)' },
            group: GROUP,
            gate: 'ready',
            /* 局部效果正常完成后末帧保持到 scene 收束；公共 scene 只为该 spec 设 fill:'both'。 */
            handoff: 'hold'
          };
          var specs = [handoff];
          var arrow = arrowEl;
          if (arrow) {
            /* 同组另一条稍长的提示轨道：目标标签局部动画先结束，而整步还要等这条收尾。
             * 这正好暴露“局部结束→整步结束”的窗口：标签靠 handoff:'hold' 保持末帧。
             * 该提示不需要保持末帧，不声明 handoff。 */
            specs.push({
              el: arrow,
              keyframes: [{ opacity: '0.35' }, { opacity: '1' }],
              options: { duration: duration + 240, easing: 'ease-out' },
              group: GROUP,
              gate: 'ready'
            });
          }
          return specs;
        },
        facts: function () {
          return { stageChanged: stageChanged, targetSlidesIn: stage === STAGE_HANDOFF };
        },
        cleanup: function () {
          if (!preset) return;
          preset = false;
          clearPreset();
        },
        readView: function () {
          if (destroyed) return null;
          return readView();
        }
      };
    }

    return {
      restore: function (view) {
        if (destroyed) return;
        applyView(viewModel(view));
      },
      target: function (query) {
        if (destroyed || !isObject(query)) return null;
        if (query.part === 'root') return root;
        if (query.part === 'source') return sourceLabel;
        if (query.part === 'target') return targetLabel;
        return null;
      },
      readView: function () {
        if (destroyed) return null;
        return readView();
      },
      prepareChange: function (context) {
        if (destroyed) fail('已销毁的 handoff-dom 实例不能 prepareChange。');
        return makePreparedChange(context);
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        if (owned && root.parentNode) root.parentNode.removeChild(root);
        if (owned && container && container.parentNode) container.parentNode.removeChild(container);
      }
    };
  }

  function mount(host) {
    if (!host || host.nodeType !== 1) {
      throw new TypeError('handoff-dom Adapter.mount(host, options)：host 必须是宿主任意元素。');
    }
    var container = element('div', 'note-demo-adapter note-demo-adapter--handoff');
    container.setAttribute('data-adapter', ADAPTER_NAME);
    var root = element('div', 'handoff-demo__stage');
    root.setAttribute('data-adapter-part', 'root');
    root.setAttribute('data-stage', STAGE_SOURCE);

    var sourceLabel = element('span', 'handoff-demo__label handoff-demo__label--source', '来源标签');
    sourceLabel.setAttribute('data-adapter-part', 'source');
    var arrow = element('span', 'handoff-demo__arrow', '→');
    arrow.setAttribute('aria-hidden', 'true');
    /* 目标位置占位：来源阶段给读者一个落点；目标接管后占位隐藏，真实标签保留同一矩形。 */
    var slot = element('span', 'handoff-demo__slot');
    var placeholder = element('span', 'handoff-demo__placeholder', '目标位置');
    placeholder.setAttribute('aria-hidden', 'true');
    var targetLabel = element('span', 'handoff-demo__label handoff-demo__label--target', '目标标签');
    targetLabel.setAttribute('data-adapter-part', 'target');
    slot.appendChild(placeholder);
    slot.appendChild(targetLabel);

    root.appendChild(sourceLabel);
    root.appendChild(arrow);
    root.appendChild(slot);
    container.appendChild(root);
    host.appendChild(container);
    return makeHandle(root, sourceLabel, targetLabel, arrow, container, true);
  }

  var adapter = {
    name: ADAPTER_NAME,
    sceneModes: ['update'],
    defaultSceneMode: 'update',
    normalizeView: normalizeView,
    validateAction: validateAction,
    mount: mount
  };

  /* 保持页面既有结构：只追加一节画布；页面文案说明交接机制。 */
  function layout(container) {
    var root = element('div', 'handoff-demo');
    var board = element('div', 'handoff-demo__board');
    board.setAttribute('data-demo-slot', 'main');
    root.appendChild(board);
    container.appendChild(root);
    return {
      root: root,
      slots: { main: board },
      cleanup: function () {
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  }

  function definition() {
    return {
      initialFrameId: 'source',
      bindings: {
        handoff: { adapter: ADAPTER_NAME, slot: 'main' }
      },
      frames: [
        {
          id: 'source',
          caption: '来源标签是当前画面；目标位置暂时留白，等待一次交接。',
          views: {
            handoff: { source: '来源标签 · 旧画面', target: '目标标签 · 新画面', stage: STAGE_SOURCE }
          },
          marks: []
        },
        {
          id: 'handoff',
          caption: '目标到达后目标标签淡入；来源退出由同一交接机制接住。',
          views: {
            handoff: { source: '来源标签 · 旧画面', target: '目标标签 · 新画面', stage: STAGE_HANDOFF }
          },
          marks: []
        }
      ],
      transitions: [{
        from: 'source',
        to: 'handoff',
        scene: {
          bindings: [{ binding: 'handoff', mode: 'update' }],
          attention: {
            targets: [
              { binding: 'handoff', query: { part: 'source' }, groups: [] },
              { binding: 'handoff', query: { part: 'target' }, groups: [GROUP] }
            ]
          }
        }
      }]
    };
  }

  function mountDemo(host, options) {
    var input = isObject(options) ? options : {};
    return global.NoteDemo.mount(host, {
      definition: definition(),
      layout: layout,
      adapters: { 'handoff-dom': adapter },
      title: input.title == null ? '普通 DOM 交接：来源保留到目标接住' : String(input.title),
      label: input.label == null ? '作者装配：普通 DOM 交接' : String(input.label)
    });
  }

  global.AuthoringHandoff = {
    adapterName: ADAPTER_NAME,
    group: GROUP,
    adapter: adapter,
    layout: layout,
    definition: definition,
    mount: mountDemo
  };
})(window);
