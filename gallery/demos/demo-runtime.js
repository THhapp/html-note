/*!
 * Gallery demo · I07 NoteDemo 公共演示编排层
 * 只通过 NoteDemo 公开入口驱动；默认静止，由舞台内按钮推进。
 */
(function () {
  'use strict';

  var demos = window.NoteGalleryDemos = window.NoteGalleryDemos || {};

  function makeEl(tag, className, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = String(content);
    return node;
  }

  demos.I07 = function (host) {
    var wrapper = makeEl('div', 'ndemo-gallery');
    var head = makeEl('div', 'ndemo-gallery__head');
    head.appendChild(makeEl('p', 'ndemo-gallery__title', '公共编排层：停点、动作、字幕与标记'));
    head.appendChild(makeEl('p', 'ndemo-gallery__hint',
      '序列与说明文字是两类常驻 Binding；删除与交换的真实过渡由 sequence-edit Adapter 执行，字幕与标记只由 Frame 决定。'));
    var stageHost = makeEl('div', 'ndemo-gallery__stage');
    wrapper.appendChild(head);
    wrapper.appendChild(stageHost);
    host.appendChild(wrapper);

    var session = null;
    var definition = {
      bindings: {
        seq: {
          adapter: 'sequence-edit',
          slot: 'main',
          options: { label: '处理步骤' }
        },
        note: {
          adapter: 'dom',
          slot: 'note',
          options: { label: '当前说明' }
        }
      },
      frames: [
        {
          id: 'start',
          caption: '初始序列包含三个对象。先看整体顺序，再逐步推进。',
          views: {
            seq: { items: [{ id: 'read', label: '读取' }, { id: 'check', label: '校验' }, { id: 'write', label: '写入' }], focus: ['check'], changed: [] },
            note: { text: '初始状态：读取 → 校验 → 写入。' }
          },
          marks: []
        },
        {
          id: 'removed',
          caption: '删除“校验”。后方的“写入”前移，剩余对象身份不变。',
          views: {
            seq: { items: [{ id: 'read', label: '读取' }, { id: 'write', label: '写入' }], focus: ['write'], changed: ['write'] },
            note: { text: '删除后的稳定结果：读取 → 写入。' }
          },
          marks: [{ kind: 'focus', target: { binding: 'seq', query: { id: 'write' } }, mode: 'box' }]
        },
        {
          id: 'swapped',
          caption: '交换“读取”和“写入”。位置改变，对象身份和标签保持不变。',
          views: {
            seq: { items: [{ id: 'write', label: '写入' }, { id: 'read', label: '读取' }], focus: [], changed: ['write', 'read'] },
            note: { text: '交换后的稳定结果：先写入，再读取。' }
          },
          marks: [{
            kind: 'range',
            targets: [
              { binding: 'seq', query: { id: 'write' } },
              { binding: 'seq', query: { id: 'read' } }
            ],
            text: '交换的两项'
          }]
        }
      ],
      transitions: [
        { from: 'start', to: 'removed', actions: [{ binding: 'seq', type: 'remove', params: { id: 'check' } }] },
        { from: 'removed', to: 'swapped', actions: [{ binding: 'seq', type: 'swap', params: { a: 'read', b: 'write' } }] }
      ]
    };

    var cleanup = function () {
      if (session) {
        try { session.destroy(); } catch (error) {}
        session = null;
      }
      if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    };

    try {
      session = NoteDemo.mount(stageHost, {
        definition: definition,
        layout: function (container) {
          var root = makeEl('div', 'ndemo-gallery__layout');
          var seqSlot = makeEl('div', 'ndemo-gallery__slot');
          var noteSlot = makeEl('div', 'ndemo-gallery__note');
          var hint = makeEl('p', 'ndemo-gallery__caption-hint',
            '字幕固定在演示区下方；控件常驻，切换停点时不重建按钮。');
          root.appendChild(seqSlot);
          root.appendChild(noteSlot);
          root.appendChild(hint);
          container.appendChild(root);
          return { root: root, slots: { main: seqSlot, note: noteSlot } };
        },
        title: '公共编排层示例',
        label: '公共编排层示例'
      });
    } catch (error) {
      cleanup();
      throw error;
    }

    return { destroy: cleanup };
  };
})();
