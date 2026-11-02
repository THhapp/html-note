/*!
 * continuous-scene · NoteDemo 接入
 * 完整接法：一个 Binding 声明 left / right 两个含义组；焦点到达各自区域后放行。
 * record 由 Adapter 在 commit 时同步更新，不占一个效果组，也不进入 focus 巡视。
 */
(function (global) {
  'use strict';

  var Scene = global.ContinuousScene;
  var NoteDemo = global.NoteDemo;
  if (!Scene || !NoteDemo) throw new Error('continuous-scene 需要先加载组件库与 scene.js。');

  var FRAMES = [
    { id: 'initial', caption: '初始：左格 A，右格 C；两处都保持来源视觉。', views: { scene: { stage: 0 } } },
    { id: 'two-local', caption: '一步提交两处局部变化：左格 A→B、右格 C→D；左格先放行，右格在轮到时才改变。', views: { scene: { stage: 1 } } },
    { id: 'right-again', caption: '连续推进：右格 D→E；左格保持已落位的 B，承接上一观察位置。', views: { scene: { stage: 2 } } }
  ];

  var TRANSITIONS = [
    {
      from: 'initial',
      to: 'two-local',
      scene: {
        bindings: [{ binding: 'scene', mode: 'update' }],
        timing: { enterDuration: 420, easing: 'linear' },
        attention: {
          targets: [
            { binding: 'scene', query: { part: 'left' }, groups: ['left'] },
            { binding: 'scene', query: { part: 'right' }, groups: ['right'] }
          ]
        }
      }
    },
    {
      from: 'two-local',
      to: 'right-again',
      scene: {
        bindings: [{ binding: 'scene', mode: 'update' }],
        timing: { enterDuration: 360, easing: 'linear' },
        attention: {
          targets: [
            { binding: 'scene', query: { part: 'right' }, groups: ['right'] }
          ]
        }
      }
    }
  ];

  var DEFINITION = {
    initialFrameId: 'initial',
    bindings: { scene: { adapter: 'continuous-scene', slot: 'scene' } },
    frames: FRAMES,
    transitions: TRANSITIONS
  };

  function layout(container) {
    var root = document.createElement('div');
    root.className = 'cs-layout';
    var slot = document.createElement('div');
    slot.className = 'cs-layout__slot';
    slot.setAttribute('data-demo-slot', 'scene');
    root.appendChild(slot);
    container.appendChild(root);
    return { root: root, slots: { scene: slot } };
  }

  function boot() {
    var host = document.querySelector('[data-demo-host]');
    if (!host || !global.ContinuousAdapter) return;
    var session = NoteDemo.mount(host, {
      definition: DEFINITION,
      layout: layout,
      adapters: { 'continuous-scene': global.ContinuousAdapter },
      title: '同一画面里的两个局部变化：焦点到哪里，哪里才放行',
      label: '连续画面局部变化与观察接法',
      captionLabel: '字幕'
    });
    global.ContinuousExample = {
      session: session,
      frames: FRAMES.map(function (frame) { return frame.id; }),
      stages: Scene.STAGES.length - 1
    };
  }

  global.ContinuousDefinition = DEFINITION;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})(window);
