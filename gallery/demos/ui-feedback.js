/*!
 * gallery 演示 · ui-feedback.js
 *
 * S01–S06 真实挂载反馈与状态组件。默认不自动播放或模拟完成；加载动效只在演示内
 * 点击后出现。每个演示返回 destroy，用于清理计时器、局部组件、全局 Toast 与宿主操作节点。
 */
(function () {
  'use strict';

  var demos = window.NoteGalleryDemos = window.NoteGalleryDemos || {};
  var document = window.document;

  function element(tag, className, value) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined && value !== null) node.textContent = String(value);
    return node;
  }

  function append(parent) {
    for (var index = 1; index < arguments.length; index += 1) {
      var item = arguments[index];
      if (item) parent.appendChild(item);
    }
    return parent;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function demoButton(label, onClick) {
    var button = element('button', 'nui-feedback-demo__button', label);
    button.type = 'button';
    if (typeof onClick === 'function') button.addEventListener('click', onClick);
    return button;
  }

  function outputLine() {
    var output = element('p', 'nui-feedback-demo__output');
    output.setAttribute('role', 'status');
    output.setAttribute('aria-live', 'polite');
    output.setAttribute('aria-atomic', 'true');
    return output;
  }

  function createDemo(host, introText) {
    var root = element('div', 'nui-feedback-demo');
    var intro = element('p', 'nui-feedback-demo__intro', introText);
    root.appendChild(intro);
    host.appendChild(root);
    return root;
  }

  function setPressed(buttons, activeButton) {
    buttons.forEach(function (button) {
      button.setAttribute('aria-pressed', button === activeButton ? 'true' : 'false');
    });
  }

  function makeHostButton(label, onClick) {
    var UI = window.NoteUI || {};
    var host = document.createElement('div');
    if (UI.Button && typeof UI.Button.mount === 'function') {
      try {
        var instance = UI.Button.mount(host, {
          label: label,
          variant: 'secondary',
          onClick: onClick
        });
        return { el: instance.el, instance: instance };
      } catch (error) {
        /* 无旧 Button 的独立宿主中使用下方原生按钮，不让演示依赖 legacy。 */
      }
    }
    var fallback = element('button', 'nui-feedback-demo__button', label);
    fallback.type = 'button';
    if (typeof onClick === 'function') fallback.addEventListener('click', onClick);
    return { el: fallback, instance: null };
  }

  demos['S01'] = function (host) {
    var UI = window.NoteUI || {};
    var root = createDemo(host,
      '短消息显示在独立区域，只有条目本身接收指针。全局队列默认最多 4 条，错误通知默认不自动消失；悬停或把键盘焦点移入通知会暂停计时。');
    var toolbar = element('div', 'nui-feedback-demo__toolbar');
    var output = outputLine();
    output.textContent = '尚未显示通知。';
    var localStage = element('div', 'nui-feedback-demo__stage');
    var localNote = element('p', 'nui-feedback-demo__note', '局部区域：同样通过 mount 创建，但随内容流排列，不固定到视口。局部队列上限示例为 2。');
    var localHost = element('div', 'nui-feedback-demo__local');
    var localToolbar = element('div', 'nui-feedback-demo__toolbar');
    var destroyed = false;
    var local = null;
    var toneLabels = { success: '成功', error: '失败', warning: '提醒', info: '信息' };
    var reasonLabels = {
      timeout: '停留时间结束',
      dismiss: '用户关闭',
      action: '操作按钮关闭',
      api: 'API 关闭',
      overflow: '队列让位',
      clear: '全部清除',
      destroy: '随演示销毁'
    };

    function reportClose(reason) {
      if (destroyed) return;
      output.textContent = '上一条通知关闭：' + (reasonLabels[reason] || reason) + '。';
    }

    function showTone(tone) {
      if (destroyed || !UI.Toast) return;
      var handle = UI.Toast.show({
        message: '这是“' + toneLabels[tone] + '”示例通知。停留与关闭策略由宿主参数决定。',
        tone: tone,
        duration: tone === 'error' ? 0 : 6000,
        dismissible: true,
        action: tone === 'success' ? {
          label: '查看说明（演示）',
          onClick: function () {
            if (!destroyed) output.textContent = '演示操作已触发；没有修改真实数据。';
          }
        } : null,
        onClose: reportClose
      });
      if (handle) {
        output.textContent = '已显示' + toneLabels[tone] + '通知。' +
          (tone === 'error' ? '错误通知默认保持到用户关闭。' : '约 6 秒后自动关闭，悬停或聚焦会暂停。');
      }
    }

    ['success', 'error', 'warning', 'info'].forEach(function (tone) {
      toolbar.appendChild(demoButton(toneLabels[tone], function () { showTone(tone); }));
    });

    toolbar.appendChild(demoButton('连续触发 5 条', function () {
      if (destroyed || !UI.Toast) return;
      for (var index = 1; index <= 5; index += 1) {
        UI.Toast.show({
          message: '队列示例 ' + index + ' / 5：最多保留 4 条，较早的通知会让位。',
          tone: index === 5 ? 'warning' : 'info',
          duration: 9000,
          dismissible: true,
          onClose: reportClose
        });
      }
      output.textContent = '已连续触发 5 条；全局区域只保留最近的 4 条，避免淹没页面操作。';
    }));

    toolbar.appendChild(demoButton('清除全局通知', function () {
      if (!UI.Toast) return;
      UI.Toast.clear();
      if (!destroyed) output.textContent = '已清除全局区域中的通知。';
    }));

    if (UI.Toast && typeof UI.Toast.mount === 'function') {
      localHost.textContent = '';
      local = UI.Toast.mount(localHost, { max: 2, label: '演示局部通知' });
      localToolbar.appendChild(demoButton('局部成功', function () {
        if (destroyed || !local) return;
        local.show({
          message: '这条局部通知只出现在演示区域内，不会固定到视口。',
          tone: 'success',
          duration: 6000,
          dismissible: true
        });
        output.textContent = '已显示局部成功通知；它在演示区域内可关闭。';
      }));
      localToolbar.appendChild(demoButton('局部两条', function () {
        if (destroyed || !local) return;
        local.show({ message: '局部示例一：最多同时保留 2 条。', tone: 'info', duration: 9000, dismissible: true });
        local.show({ message: '局部示例二：较早的局部通知会为下一条让位。', tone: 'warning', duration: 9000, dismissible: true });
        output.textContent = '已显示局部队列示例（上限 2）。';
      }));
    } else {
      localNote.textContent = '当前宿主没有加载 NoteUI.Toast，无法演示局部区域。';
    }

    append(localStage, localNote, localToolbar, localHost);
    append(root, toolbar, localStage, output);

    return {
      destroy: function () {
        destroyed = true;
        if (UI.Toast) UI.Toast.clear();
        if (local) local.destroy();
        local = null;
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  };

  demos['S02'] = function (host) {
    var UI = window.NoteUI || {};
    var root = createDemo(host,
      '确定进度使用宿主提供的值；不确定进度只显示“进度未知”，不生成假百分比。点击按钮可更新数值或切换不确定状态。');
    var toolbar = element('div', 'nui-feedback-demo__toolbar');
    var output = outputLine();
    var stage = element('div', 'nui-feedback-demo__stage');
    var narrow = element('div');
    narrow.style.maxWidth = '340px';
    var progressHost = element('div');
    var uncertainHost = element('div');
    var uncertainNote = element('p', 'nui-feedback-demo__note', '不确定进度尚未显示；点击“显示不确定进度”后挂载。不确定状态的条纹只表示进行中，不表示完成比例。');
    var progress = null;
    var uncertain = null;
    var destroyed = false;

    narrow.appendChild(progressHost);
    append(stage, narrow, uncertainNote, uncertainHost);
    append(root, toolbar, stage, output);

    if (UI.Progress) {
      progress = UI.Progress.mount(progressHost, {
        label: '整理笔记',
        value: 36,
        max: 100,
        valueText: '36 / 100 段'
      });
      output.textContent = '当前为确定进度：36 / 100 段（窄容器内显示）。';
    } else {
      progressHost.textContent = '当前宿主没有加载 NoteUI.Progress。';
    }

    toolbar.appendChild(demoButton('更新到 68%', function () {
      if (destroyed || !progress) return;
      progress.update({ value: 68, valueText: '68 / 100 段' });
      output.textContent = '宿主把进度更新为 68 / 100 段；组件未自行推进。';
    }));

    toolbar.appendChild(demoButton('更新到 100%', function () {
      if (destroyed || !progress) return;
      progress.update({ value: 100, valueText: '100 / 100 段' });
      output.textContent = '宿主把进度更新为 100 / 100 段。';
    }));

    toolbar.appendChild(demoButton('显示不确定进度', function () {
      if (destroyed || !UI.Progress) return;
      if (!uncertain) {
        uncertain = UI.Progress.mount(uncertainHost, {
          label: '等待本地索引',
          value: null
        });
        uncertainNote.textContent = '不确定进度已挂载：没有 aria-valuenow，也没有任何伪造的百分比。';
        output.textContent = '显示不确定进度；减少动效时呈静态条纹和可读文字。';
      } else {
        uncertain.update({ value: null });
        output.textContent = '不确定进度仍在进行；值保持未知。';
      }
    }));

    toolbar.appendChild(demoButton('隐藏不确定进度', function () {
      if (destroyed) return;
      if (uncertain) {
        uncertain.destroy();
        uncertain = null;
        clear(uncertainHost);
        uncertainNote.textContent = '不确定进度已销毁；点击“显示不确定进度”可以重新挂载。';
        output.textContent = '已销毁不确定进度组件。';
      }
    }));

    toolbar.appendChild(demoButton('重置', function () {
      if (destroyed) return;
      if (progress) progress.update({ value: 36, max: 100, valueText: '36 / 100 段' });
      if (uncertain) {
        uncertain.destroy();
        uncertain = null;
      }
      clear(uncertainHost);
      uncertainNote.textContent = '不确定进度尚未显示；点击“显示不确定进度”后挂载。';
      output.textContent = '已重置为确定进度 36 / 100 段。';
    }));

    return {
      destroy: function () {
        destroyed = true;
        if (progress) progress.destroy();
        if (uncertain) uncertain.destroy();
        progress = null;
        uncertain = null;
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  };

  demos['S03'] = function (host) {
    var UI = window.NoteUI || {};
    var root = createDemo(host,
      '局部加载会显示可见的“加载中”文字，不只依赖旋转。为避免演示页自动播放，默认静止；点击“开始加载”后才出现加载环，并在演示计时结束后替换为内容。');
    var toolbar = element('div', 'nui-feedback-demo__toolbar');
    var stage = element('div', 'nui-feedback-demo__stage');
    var output = outputLine();
    var spinner = null;
    var timer = null;
    var runToken = 0;
    var destroyed = false;

    function stopSpinner() {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
      if (spinner) {
        spinner.destroy();
        spinner = null;
      }
      clear(stage);
    }

    function showReady(message) {
      stopSpinner();
      var ready = element('p', 'nui-feedback-demo__ready', message);
      stage.appendChild(ready);
    }

    function finishLoading(message) {
      if (destroyed) return;
      stopSpinner();
      showReady(message);
      output.textContent = '演示加载已结束，加载组件已销毁并替换为内容。';
    }

    function startLoading() {
      if (destroyed || !UI.Spinner) return;
      stopSpinner();
      runToken += 1;
      var token = runToken;
      spinner = UI.Spinner.mount(stage, {
        label: '正在读取本地示例内容',
        size: 'md'
      });
      output.textContent = '局部加载中；文字名称同时可见，旋转不是唯一含义。';
      timer = window.setTimeout(function () {
        timer = null;
        if (destroyed || token !== runToken) return;
        if (spinner) {
          spinner.destroy();
          spinner = null;
        }
        clear(stage);
        var ready = element('p', 'nui-feedback-demo__ready', '示例内容已就绪（本地演示，没有网络请求）。');
        stage.appendChild(ready);
        output.textContent = '演示计时结束，Spinner 已销毁并替换为内容。';
      }, 1800);
    }

    toolbar.appendChild(demoButton('开始加载', startLoading));
    toolbar.appendChild(demoButton('立即结束', function () {
      if (destroyed) return;
      runToken += 1;
      finishLoading('演示加载已被宿主提前结束并替换为内容。');
    }));
    toolbar.appendChild(demoButton('重置', function () {
      if (destroyed) return;
      runToken += 1;
      showReady('内容已就绪。点击“开始加载”查看局部加载状态。');
      output.textContent = '已重置；没有正在运行的加载动效。';
    }));

    showReady('内容已就绪。点击“开始加载”查看局部加载状态。');
    append(root, toolbar, stage, output);

    return {
      destroy: function () {
        destroyed = true;
        runToken += 1;
        stopSpinner();
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  };

  demos['S04'] = function (host) {
    var UI = window.NoteUI || {};
    var root = createDemo(host,
      '骨架与真实内容结构对应：文本用段落行，卡片用媒体块与标题，表格用行列。骨架保持静态，不无限闪烁；加载结束时由宿主销毁并替换。');
    var toolbar = element('div', 'nui-feedback-demo__toolbar');
    var stage = element('div', 'nui-feedback-demo__stage');
    var output = outputLine();
    var skeleton = null;
    var destroyed = false;
    var activeVariant = 'text';
    var variantButtons = [];

    function ensureSkeleton(variant, extra) {
      if (destroyed || !UI.Skeleton) return;
      var options = {
        variant: variant,
        label: variant === 'table' ? '示例表格加载中' : variant === 'card' ? '示例卡片加载中' : '示例文本加载中',
        width: '100%',
        height: variant === 'text' ? 12 : (variant === 'card' ? 92 : 16)
      };
      if (extra) {
        Object.keys(extra).forEach(function (key) { options[key] = extra[key]; });
      }
      if (skeleton) {
        skeleton.update(options);
      } else {
        clear(stage);
        skeleton = UI.Skeleton.mount(stage, options);
      }
      activeVariant = variant;
      output.textContent = '当前骨架：' + (variant === 'table' ? '表格（4 行 × 4 列）' : variant === 'card' ? '卡片' : '文本 4 行') + '；静态显示，没有闪烁或自动计时。';
    }

    function markVariant(button) {
      setPressed(variantButtons, button);
    }

    var textButton = demoButton('文本骨架', function () {
      ensureSkeleton('text', { lines: 4 });
      markVariant(textButton);
    });
    var cardButton = demoButton('卡片骨架', function () {
      ensureSkeleton('card', { lines: 3 });
      markVariant(cardButton);
    });
    var tableButton = demoButton('表格骨架', function () {
      ensureSkeleton('table', { rows: 4, columns: 4 });
      markVariant(tableButton);
    });
    variantButtons = [textButton, cardButton, tableButton];
    append(toolbar, textButton, cardButton, tableButton);

    toolbar.appendChild(demoButton('结束加载并替换', function () {
      if (destroyed) return;
      if (skeleton) {
        skeleton.destroy();
        skeleton = null;
      }
      clear(stage);
      var ready = element('p', 'nui-feedback-demo__ready',
        '加载结束：骨架已由宿主销毁，并替换为这段真实内容。若需要再次查看，可点击任一骨架按钮。');
      stage.appendChild(ready);
      output.textContent = '骨架已销毁并替换为内容；加载组件不在 DOM 中残留。';
    }));

    toolbar.appendChild(demoButton('重新加载', function () {
      if (destroyed) return;
      if (!UI.Skeleton) return;
      if (!skeleton) {
        skeleton = UI.Skeleton.mount(stage, {
          variant: activeVariant,
          lines: 4,
          rows: 4,
          columns: 4,
          label: '示例内容加载中',
          width: '100%',
          height: activeVariant === 'card' ? 92 : (activeVariant === 'table' ? 16 : 12)
        });
      }
      output.textContent = '已重新挂载静态骨架。';
    }));

    markVariant(textButton);
    if (UI.Skeleton) {
      skeleton = UI.Skeleton.mount(stage, {
        variant: 'text',
        lines: 4,
        label: '示例文本加载中',
        width: '100%',
        height: 12
      });
      output.textContent = '当前骨架：文本 4 行；静态显示，没有闪烁或自动计时。';
    } else {
      stage.textContent = '当前宿主没有加载 NoteUI.Skeleton。';
    }
    append(root, toolbar, stage, output);

    return {
      destroy: function () {
        destroyed = true;
        if (skeleton) skeleton.destroy();
        skeleton = null;
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  };

  demos['S05'] = function (host) {
    var UI = window.NoteUI || {};
    var root = createDemo(host,
      '空态、无结果和未配置使用不同默认文案与标记。标题、原因说明和由宿主提供的操作都在正常阅读路径中；组件不创建业务按钮。');
    var toolbar = element('div', 'nui-feedback-demo__toolbar');
    var output = outputLine();
    var emptyHost = element('div', 'nui-feedback-demo__stage');
    var empty = null;
    var destroyed = false;
    var currentKind = 'empty';
    var kindButtons = [];

    function actionFor(kind) {
      var labels = {
        empty: '添加内容（演示）',
        'no-results': '清除筛选（演示）',
        unconfigured: '补充配置（演示）'
      };
      var button = element('button', 'nui-feedback-demo__button', labels[kind]);
      button.type = 'button';
      button.addEventListener('click', function () {
        if (destroyed) return;
        output.textContent = '宿主操作“' + labels[kind] + '”已触发；这是演示，不会写入真实内容。';
      });
      return button;
    }

    function setKind(kind, activeButton) {
      if (destroyed || !empty) return;
      currentKind = kind;
      empty.update({ kind: kind, action: actionFor(kind) });
      var titles = { empty: '空内容', 'no-results': '无结果', unconfigured: '未配置' };
      output.textContent = '当前 Empty 类型：' + titles[kind] + '；操作节点仍由演示宿主提供。';
      setPressed(kindButtons, activeButton || null);
    }

    var emptyButton = demoButton('空内容', function () { setKind('empty', emptyButton); });
    var noResultsButton = demoButton('无结果', function () { setKind('no-results', noResultsButton); });
    var unconfiguredButton = demoButton('未配置', function () { setKind('unconfigured', unconfiguredButton); });
    kindButtons = [emptyButton, noResultsButton, unconfiguredButton];
    append(toolbar, emptyButton, noResultsButton, unconfiguredButton);

    if (UI.Empty) {
      empty = UI.Empty.mount(emptyHost, {
        kind: currentKind,
        action: actionFor(currentKind)
      });
      output.textContent = '当前 Empty 类型：空内容；说明默认可见，操作由宿主传入。';
    } else {
      emptyHost.textContent = '当前宿主没有加载 NoteUI.Empty。';
    }
    markInitial();
    append(root, toolbar, emptyHost, output);

    function markInitial() {
      setPressed(kindButtons, emptyButton);
    }

    return {
      destroy: function () {
        destroyed = true;
        if (empty) empty.destroy();
        empty = null;
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  };

  demos['S06'] = function (host) {
    var UI = window.NoteUI || {};
    var root = createDemo(host,
      '结果状态完全由宿主传入，组件不从数据推断成功或失败。标题、原因、可见说明和下一步操作均可替换；本演示同时使用 DOM 操作节点和配置数组。');
    var toolbar = element('div', 'nui-feedback-demo__toolbar');
    var resultHost = element('div', 'nui-feedback-demo__stage');
    var output = outputLine();
    var result = null;
    var destroyed = false;
    var statusButtons = [];
    var hostButtonInstances = [];

    var labels = { success: '成功', error: '失败', restricted: '受限', info: '信息' };

    function hostAction(label, handler) {
      var created = makeHostButton(label, handler);
      if (created.instance) hostButtonInstances.push(created.instance);
      return created.el;
    }

    function actionsFor(status) {
      if (status === 'success') {
        return hostAction('返回示例列表（DOM）', function () {
          if (!destroyed) output.textContent = 'DOM 操作节点被点击；宿主负责业务跳转，组件未自行处理。';
        });
      }
      if (status === 'error') {
        return [
          {
            label: '重试（演示）',
            variant: 'primary',
            onClick: function () {
              if (!destroyed) output.textContent = '宿主收到重试操作；演示不会发起网络请求。';
            }
          },
          {
            label: '返回上一步',
            variant: 'quiet',
            onClick: function () {
              if (!destroyed) output.textContent = '宿主收到返回操作；组件不改变 status。';
            }
          }
        ];
      }
      if (status === 'restricted') {
        return [
          {
            label: '查看可用条件',
            variant: 'secondary',
            onClick: function () {
              if (!destroyed) output.textContent = '受限原因与下一步由宿主解释；组件只呈现。';
            }
          },
          {
            label: '稍后再试',
            variant: 'quiet',
            onClick: function () {
              if (!destroyed) output.textContent = '宿主可以选择稍后重试；组件不自动重试。';
            }
          }
        ];
      }
      return [
        {
          label: '知道了',
          variant: 'primary',
          onClick: function () {
            if (!destroyed) output.textContent = '信息结果的操作由宿主提供。';
          }
        }
      ];
    }

    var configs = {
      success: {
        title: '示例任务已完成',
        description: '宿主确认这次示例任务的结果为成功。组件只显示 status="success"，不自行判断业务是否完成。',
        details: '这段“补充说明”默认可见，不依赖悬停、折叠或角落小字。演示没有保存真实数据。',
        actions: actionsFor('success')
      },
      error: {
        title: '示例任务未能继续',
        description: '宿主给出的原因是必要内容缺失。请检查输入后重试，或返回上一步。',
        details: '失败原因和下一步操作均由宿主提供；演示没有发起网络请求。',
        actions: actionsFor('error')
      },
      restricted: {
        title: '当前示例操作受限',
        description: '宿主说明当前条件不足，暂时不能继续。请确认可用范围，或稍后再试。',
        details: '受限状态不是组件推断出来的；组件只按宿主传入的 status 呈现。',
        actions: actionsFor('restricted')
      },
      info: {
        title: '需要了解的信息',
        description: '这是宿主提供的说明性结果，不代表成功或失败。你可以按下一步操作继续。',
        details: '信息状态没有默认业务判定；标题、原因和操作都由宿主配置。',
        actions: actionsFor('info')
      }
    };

    function applyStatus(status, activeButton) {
      if (destroyed || !result) return;
      var config = configs[status];
      result.update({
        status: status,
        title: config.title,
        description: config.description,
        details: config.details,
        statusLabel: labels[status],
        actions: config.actions
      });
      setPressed(statusButtons, activeButton || null);
      output.textContent = '已切换为宿主给定的“' + labels[status] + '”结果；不表示组件自行判定业务。';
    }

    Object.keys(labels).forEach(function (status) {
      var button = demoButton(labels[status], function () { applyStatus(status, button); });
      statusButtons.push(button);
      toolbar.appendChild(button);
    });

    if (UI.Result) {
      result = UI.Result.mount(resultHost, {
        status: 'info',
        title: configs.info.title,
        description: configs.info.description,
        details: configs.info.details,
        statusLabel: labels.info,
        actions: configs.info.actions
      });
      output.textContent = '当前为宿主给定的“信息”结果；点击上方按钮切换四种状态。';
      setPressed(statusButtons, statusButtons[3]);
    } else {
      resultHost.textContent = '当前宿主没有加载 NoteUI.Result。';
    }
    append(root, toolbar, resultHost, output);

    return {
      destroy: function () {
        destroyed = true;
        if (result) result.destroy();
        result = null;
        hostButtonInstances.forEach(function (instance) {
          try { instance.destroy(); } catch (error) { /* 已随结果根一起移除时仍保持清理幂等 */ }
        });
        hostButtonInstances = [];
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  };
})();
