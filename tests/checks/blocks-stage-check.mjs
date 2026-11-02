import { chromium } from '../tools/node_modules/playwright-core/index.mjs';
import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';
import { moduleDemos, moduleScripts, moduleStyles } from '../lib/src-sources.mjs';
import { cacheDir, cacheFile } from '../lib/test-output.mjs';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const outDir = cacheDir(root, 'checks', 'blocks-stage');
// 源码加载清单从 src/manifests 推导，模块拆分后自动包含新增文件。
// blocks 拆分后：blocks-base（共享）、demo-stage（B01 舞台）、blocks（B02–B04）必须同时加载。
const PAGE_MODULES = ['core', 'legacy', 'ui-layout', 'ui-content', 'viz-objects', 'blocks-base', 'demo-stage', 'blocks'];
const results = [];
const consoleRecords = [];
let browser;

function record(name, ok, detail) {
  results.push({ name, ok, detail: detail == null ? '' : String(detail) });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : ' — ' + String(detail).split('\n')[0]));
}

async function addStyles(page) {
  for (const file of moduleStyles(root, PAGE_MODULES)) await page.addStyleTag({ path: path.join(root, file) });
  await page.addStyleTag({
    content: 'body{margin:0;padding:18px;background:#eef1f5;font-family:sans-serif} .test-workspace{max-width:1100px;margin:0 auto}.test-host{box-sizing:border-box;margin:0 0 18px;padding:14px;background:#fff;border:1px dashed #b9c2ce;border-radius:10px}'
  });
}

async function addScripts(page) {
  const demos = Array.from(new Set([...moduleDemos(root, ['blocks']), ...moduleDemos(root, ['demo-stage'])]));
  for (const file of [...moduleScripts(root, PAGE_MODULES), ...demos]) {
    await page.addScriptTag({ path: path.join(root, file) });
  }
}

async function setupPage(page) {
  await page.goto('about:blank');
  await addStyles(page);
  await addScripts(page);
  await page.waitForFunction(() => window.NoteBlocks && window.NoteBlocks.StateCompare);
}

async function main() {
  browser = await chromium.launch({ headless: true, executablePath: edge });
  const context = await browser.newContext({ viewport: { width: 1180, height: 1000 } });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleRecords.push({ page: 'main', type: message.type(), text: message.text() });
    }
  });
  page.on('pageerror', (error) => {
    consoleRecords.push({ page: 'main', type: 'pageerror', text: error.stack || String(error) });
  });
  await setupPage(page);

  const normal = await page.evaluate(async () => {
    const checks = [];
    const pending = [];
    function assert(condition, message) {
      if (!condition) throw new Error(message);
    }
    function check(name, fn) {
      try {
        const detail = fn();
        checks.push({ name, ok: true, detail: detail == null ? '' : String(detail) });
      } catch (error) {
        checks.push({ name, ok: false, detail: error.stack || String(error) });
      }
    }
    function checkAsync(name, fn) {
      pending.push({ name, fn });
    }
    async function frames(count = 2) {
      for (let i = 0; i < count; i += 1) {
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      await new Promise(resolve => setTimeout(resolve, 60));
    }
    function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    function host(width = 900) {
      const node = document.createElement('div');
      node.className = 'test-host';
      node.style.width = width + 'px';
      node.style.maxWidth = '100%';
      node.style.minWidth = '0';
      document.querySelector('.test-workspace').appendChild(node);
      return node;
    }
    function byText(rootNode, selector, label) {
      return Array.from(rootNode.querySelectorAll(selector)).find(node => node.textContent.trim() === label);
    }
    function remove(node) { if (node && node.parentNode) node.parentNode.removeChild(node); }
    function focusOverlayCount() { return document.querySelectorAll('.nx-focus').length; }

    document.body.innerHTML = '<div class="test-workspace" id="test-workspace"></div>';

    checkAsync('B01 mount, content, controls, stable caption, update, destroy', async () => {
      const h = host(820);
      let instance = null;
      try {
        const sentinel = document.createElement('span');
        sentinel.id = 'b01-sentinel';
        sentinel.textContent = '宿主已有节点';
        h.appendChild(sentinel);
        const sceneNode = document.createElement('div');
        sceneNode.id = 'b01-scene';
        sceneNode.textContent = '画面 A';
        const domControl = document.createElement('button');
        domControl.type = 'button';
        domControl.id = 'b01-dom-control';
        domControl.textContent = '宿主 DOM 控件';
        let domClicks = 0;
        domControl.addEventListener('click', () => { domClicks += 1; });
        let configClicks = 0;
        instance = window.NoteBlocks.DemoStage.mount(h, {
          title: 'B01 标题',
          stage: sceneNode,
          caption: '一个字',
          captionLabel: '字幕',
          controls: [
            { label: '主要操作', variant: 'primary', onClick: () => { configClicks += 1; }, icon: 'arrow-right', ariaLabel: '主要操作的可访问名称' },
            { label: '禁用控件', disabled: true },
            domControl
          ],
          maxWidth: 640,
          minStageHeight: 180,
          label: 'B01 测试标签'
        });
        assert(h.firstChild === sentinel, 'mount 不应清空宿主已有节点');
        assert(instance.el.parentNode === h, '根应追加到宿主');
        assert(instance.el.querySelector('.nblk-demo-stage__title').textContent === 'B01 标题', '标题未显示');
        assert(instance.el.getAttribute('aria-label') === 'B01 测试标签', 'label 未成为可访问名称');
        assert(instance.el.style.maxWidth === '640px', '数字 maxWidth 未转 px');
        assert(instance.stageEl.style.minHeight === '180px', 'minStageHeight 未应用');
        assert(instance.stageEl.contains(sceneNode), 'stage 节点未移入舞台');
        const configButton = byText(instance.el, 'button', '主要操作');
        const disabledButton = byText(instance.el, 'button', '禁用控件');
        assert(configButton && configButton.classList.contains('nui-button--primary'), '配置控件不是 NoteUI.Button 主按钮');
        assert(configButton.querySelector('svg'), '图标名称未解析为 SVG');
        assert(configButton.getAttribute('aria-label') === '主要操作的可访问名称', 'ariaLabel 未传递');
        assert(disabledButton && disabledButton.disabled, '禁用控件未使用原生 disabled');
        assert(instance.el.contains(domControl), '宿主 DOM 控件未被移入');
        configButton.click();
        domControl.click();
        assert(configClicks === 1 && domClicks === 1, '控件点击回调未触发');

        const caption = instance.captionEl;
        assert(caption.getAttribute('aria-live') === 'polite', '字幕缺少 polite live region');
        const captionLabel = instance.el.querySelector('.nblk-demo-stage__caption-label');
        assert(captionLabel && captionLabel.textContent === '字幕' && !captionLabel.hidden, '字幕身份标签未显示');
        assert(caption.textContent === '一个字', '字幕身份标签不应混入字幕文本');
        instance.setCaption('');
        assert(captionLabel.hidden, '空字幕应隐藏身份标签');
        instance.setCaption('一个字');
        const minHeight = parseFloat(getComputedStyle(caption).minHeight);
        assert(minHeight > 35, '字幕没有预留最小高度');
        instance.setCaption('短');
        await frames(1);
        const shortHeight = caption.getBoundingClientRect().height;
        const controlsTopShort = instance.el.querySelector('.nblk-demo-stage__controls').getBoundingClientRect().top;
        instance.setCaption('用于检查字幕稳定性的中文内容。'.repeat(4));
        await frames(1);
        const twoLineHeight = caption.getBoundingClientRect().height;
        const controlsTopLong = instance.el.querySelector('.nblk-demo-stage__controls').getBoundingClientRect().top;
        assert(Math.abs(shortHeight - twoLineHeight) <= 1.1, '一到两行字幕应保持同一预留高度：' + shortHeight + ' vs ' + twoLineHeight);
        assert(Math.abs(controlsTopShort - controlsTopLong) <= 1.1, '一到两行字幕不应移动控件');

        instance.setStage('<b>只应是纯文本</b>');
        assert(instance.stageEl.textContent === '<b>只应是纯文本</b>', '字符串 stage 未作为纯文本');
        assert(!instance.stageEl.querySelector('b'), '字符串 stage 不应解析 HTML');
        instance.setStage(sceneNode);
        assert(instance.stageEl.contains(sceneNode), 'setStage 未移入节点');

        let updatedClicks = 0;
        instance.update({
          title: '更新后的标题',
          caption: '更新字幕',
          controls: [{ label: '更新控件', onClick: () => { updatedClicks += 1; } }],
          maxWidth: 500,
          minStageHeight: 150
        });
        await frames(1);
        assert(!configButton.isConnected, '旧控件实例未被清理');
        const updatedButton = byText(instance.el, 'button', '更新控件');
        assert(updatedButton, '更新后的控件未生成');
        updatedButton.click();
        assert(updatedClicks === 1, '更新控件的回调失败');
        assert(instance.el.style.maxWidth === '500px' && instance.stageEl.style.minHeight === '150px', 'update 尺寸未生效');
        assert(instance.el.querySelector('.nblk-demo-stage__title').textContent === '更新后的标题', 'update 标题未生效');
        assert(instance.captionEl.textContent === '更新字幕', 'update 字幕未生效');

        instance.destroy();
        assert(!instance.el.isConnected, 'destroy 后根仍在文档中');
        assert(h.querySelectorAll('button').length === 0, 'destroy 后控件仍残留');
        assert(h.firstChild === sentinel && h.children.length === 1, 'destroy 不应移除或保留宿主额外节点');
        return 'controls=' + 3 + ', captionMinHeight=' + minHeight.toFixed(1);
      } finally {
        if (instance && instance.el && instance.el.isConnected) instance.destroy();
        remove(h);
      }
    });

    checkAsync('B02 initial static state, user step, replay, rollback, jump, program methods', async () => {
      const h = host(880);
      let player = null;
      try {
        const log = { renders: [], cleanups: 0, onStep: [] };
        const steps = [
          { id: 's0', label: '起点', caption: '字幕一：初始停点。', state: { id: 's0', value: '0' } },
          { id: 's1', label: '第二', caption: '字幕二：第二停点。', state: { id: 's1', value: '1' } },
          { id: 's2', label: '第三', caption: '字幕三：第三停点。', state: { id: 's2', value: '2' } },
          { id: 's3', label: '最后', caption: '字幕四：最后停点。', state: { id: 's3', value: '3' } }
        ];
        function render(state, ctx) {
          const marker = document.createElement('div');
          marker.className = 'b02-marker';
          marker.dataset.id = state.id;
          marker.textContent = state.id + '|' + state.value;
          ctx.stageEl.appendChild(marker);
          log.renders.push({ id: state.id, index: ctx.index, replay: ctx.replay });
          return function cleanup() {
            log.cleanups += 1;
            marker.remove();
          };
        }
        player = window.NoteBlocks.StepPlayer.mount(h, {
          steps,
          render,
          initialIndex: 0,
          title: 'B02 组件测试',
          onStep: (index, step, event) => {
            log.onStep.push({ index, id: step && step.id, type: event && event.type });
          }
        });
        assert(h.querySelector('.nblk-step-player'), '根未挂载');
        assert(player.el.querySelectorAll('.b02-marker').length === 1, '初始应只渲染一个停点');
        assert(player.el.querySelector('.b02-marker').dataset.id === 's0', '初始停点错误');
        assert(player.getStep().id === 's0' && player.getState().value === '0', 'getStep/getState 初始值错误');
        const captionEl = player.el.querySelector('.nblk-demo-stage__caption');
        const initialCaptionHeight = captionEl.getBoundingClientRect().height;
        const nextButton = byText(player.el, '.nui-button', '下一步');
        const prevButton = byText(player.el, '.nui-button', '上一步');
        const replayButton = byText(player.el, '.nui-button', '重看');
        const resetButton = byText(player.el, '.nui-button', '重来');
        const select = player.el.querySelector('select');
        assert(prevButton.disabled && !nextButton.disabled, '初始边界按钮状态错误');
        assert(!replayButton.disabled && !resetButton.disabled, '重看/重来应可用');
        assert(select && select.options.length === 4, '跳转 select 选项数量错误');
        assert(log.renders.length === 1 && log.renders[0].replay === false, '初始 render 参数错误');
        await wait(350);
        assert(log.renders.length === 1, '不应自动串播');
        assert(log.onStep.length === 0, '初始挂载不应触发 onStep');
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        assert(log.onStep.length === 0, '不得依赖整页方向键推进');

        nextButton.focus();
        nextButton.click();
        await frames(1);
        assert(player.el.getAttribute('data-step-index') === '1', '下一步未切到第二停点');
        assert(player.el.querySelectorAll('.b02-marker').length === 1, '第二步后舞台有残留节点');
        assert(player.el.querySelector('.b02-marker').dataset.id === 's1', '第二停点快照错误');
        assert(captionEl.textContent === '字幕二：第二停点。', '字幕未跟随停点');
        assert(log.onStep.length === 1 && log.onStep[0].index === 1 && log.onStep[0].type === 'click', '用户下一步未触发 onStep');
        assert(document.activeElement === nextButton, '重渲染改变了控件焦点');
        assert(log.cleanups === 1, '切换前未调用上一停点 cleanup');
        const secondCaptionHeight = captionEl.getBoundingClientRect().height;
        assert(Math.abs(initialCaptionHeight - secondCaptionHeight) <= 1.1, '同一字幕预留区高度不稳定');

        replayButton.focus();
        replayButton.click();
        await frames(1);
        assert(player.el.getAttribute('data-step-index') === '1', '重看不应切换停点');
        assert(log.renders[log.renders.length - 1].replay === true, '重看未传 replay:true');
        assert(log.onStep.length === 1, '重看不应触发 onStep');
        assert(captionEl.textContent === '字幕二：第二停点。', '重看改变了字幕');
        assert(player.el.querySelectorAll('.b02-marker').length === 1, '重看后出现重复内容');
        assert(log.cleanups === 2, '重看前未清理当前 render');

        prevButton.focus();
        prevButton.click();
        await frames(1);
        assert(player.el.getAttribute('data-step-index') === '0', '上一步未回到初始停点');
        assert(player.el.querySelector('.b02-marker').dataset.id === 's0', '回退未还原完整快照');
        assert(log.onStep.length === 2 && log.onStep[1].index === 0, '用户上一步未触发 onStep');
        assert(log.cleanups === 3, '回退前未清理 render');

        const beforeProgramEvents = log.onStep.length;
        player.go(3);
        await frames(1);
        assert(player.el.getAttribute('data-step-index') === '3', 'go 未跳转');
        assert(nextButton.disabled && !prevButton.disabled, '末尾边界禁用错误');
        assert(log.onStep.length === beforeProgramEvents, '程序 go 不应触发 onStep');
        player.next();
        assert(player.el.getAttribute('data-step-index') === '3', '末尾 next 不应越界');
        player.prev();
        await frames(1);
        assert(player.el.getAttribute('data-step-index') === '2', '程序 prev 未生效');
        assert(log.onStep.length === beforeProgramEvents, '程序 prev 不应触发 onStep');

        select.focus();
        select.value = '0';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await frames(1);
        assert(player.el.getAttribute('data-step-index') === '0', 'select 跳转失败');
        assert(log.onStep.length === beforeProgramEvents + 1 && log.onStep[log.onStep.length - 1].type === 'change', '用户 select 未触发 onStep');
        assert(document.activeElement === select, 'select 跳转后焦点丢失');

        for (let i = 0; i < 6; i += 1) nextButton.click();
        await frames(1);
        assert(player.el.getAttribute('data-step-index') === '3', '快速连点未停在末停点');
        assert(player.el.querySelectorAll('.b02-marker').length === 1, '快速连点导致内容残留');
        assert(log.onStep.length === beforeProgramEvents + 4, '快速连点的用户事件计数错误');
        assert(nextButton.disabled, '末停点下一步未禁用');
        assert(log.renders[log.renders.length - 1].replay === false, '普通步进不应误传 replay');

        const beforeUpdateEvents = log.onStep.length;
        const beforeUpdateCleanups = log.cleanups;
        const replacement = [
          { id: 'n0', label: '新起点', caption: '新字幕一。', state: { id: 'n0', value: 'A' } },
          { id: 'n1', label: '新终点', caption: '新字幕二。', state: { id: 'n1', value: 'B' } }
        ];
        player.update({ steps: replacement, title: '更新后的 B02' });
        await frames(1);
        assert(player.el.getAttribute('data-step-index') === '1', '更新 steps 后索引未夹紧');
        assert(player.el.querySelector('.b02-marker').dataset.id === 'n1', '更新 steps 后未重绘当前停点');
        assert(player.el.querySelector('.b02-marker').textContent === 'n1|B', '更新后的快照内容错误');
        assert(player.getState().value === 'B', '更新后 getState 未同步');
        assert(captionEl.textContent === '新字幕二。', '更新 steps 后字幕未同步');
        assert(select.options.length === 2, '更新 steps 后跳转选项未更新');
        assert(log.onStep.length === beforeUpdateEvents, '程序 update 不应触发 onStep');
        assert(log.cleanups > beforeUpdateCleanups, '更新 steps 前未清理 render');
        assert(player.el.querySelector('.nblk-demo-stage__title').textContent === '更新后的 B02', 'update title 未传给舞台');
        assert(player.el.querySelectorAll('.b02-marker').length === 1, '更新 steps 后残留旧内容');

        player.reset();
        await frames(1);
        assert(player.el.getAttribute('data-step-index') === '0', 'reset 未回到初始索引 0');
        assert(log.onStep.length === beforeUpdateEvents, '程序 reset 不应触发 onStep');

        player.destroy();
        assert(!h.querySelector('.nblk-step-player'), 'destroy 后根仍在文档中');
        assert(log.cleanups >= 1, 'destroy 未调用 render cleanup');
        player = null;
        return 'renders=' + log.renders.length + ', cleanups=' + log.cleanups + ', userEvents=' + log.onStep.length;
      } finally {
        if (player && player.el && player.el.isConnected) player.destroy();
        remove(h);
      }
    });

    checkAsync('B02 initialIndex clamps and no automatic events', async () => {
      const h = host(700);
      let player = null;
      try {
        let events = 0;
        const steps = [
          { id: 'a', caption: 'A', state: { n: 0 } },
          { id: 'b', caption: 'B', state: { n: 1 } },
          { id: 'c', caption: 'C', state: { n: 2 } }
        ];
        player = window.NoteBlocks.StepPlayer.mount(h, {
          steps,
          initialIndex: 999,
          render: (state, ctx) => {
            const node = document.createElement('div');
            node.className = 'clamp-marker';
            node.textContent = 'n=' + state.n;
            ctx.stageEl.appendChild(node);
            return () => node.remove();
          },
          onStep: () => { events += 1; }
        });
        assert(player.el.getAttribute('data-step-index') === '2', 'initialIndex 未夹紧到末尾');
        assert(player.el.querySelector('.clamp-marker').textContent === 'n=2', '夹紧后的快照渲染错误');
        await wait(220);
        assert(events === 0, '初始索引挂载不应触发用户事件');
        player.destroy();
        player = null;
        return 'clamped=2';
      } finally {
        if (player && player.el && player.el.isConnected) player.destroy();
        remove(h);
      }
    });

    checkAsync('B03 table composition, emphasis, notices, narrow scroll, update, destroy', async () => {
      const h = host(980);
      let instance = null;
      try {
        const rules = [
          { id: 'r1', label: '允许读取', condition: '请求已通过校验', result: '返回数据', note: '只读操作不写入审计内容。' },
          { id: 'r2', label: '拒绝写入', condition: '提交版本与当前版本不一致时拒绝并给出重新读取的提示', result: '返回冲突', note: '这条说明应在表格下方就近出现。' },
          { id: 'r3', label: '管理受限', condition: '缺少管理角色', result: '无权限', note: '记录审计但不泄露详情。' }
        ];
        instance = window.NoteBlocks.RuleCompare.mount(h, {
          rules,
          caption: '访问规则示例',
          emphasize: { row: ['r2'], column: 'result' },
          note: '这是由宿主提供的全局补充说明。',
          label: 'B03 规则对照测试'
        });
        assert(h.querySelector('.nblk-rule-compare'), '根未挂载');
        assert(h.querySelector('.nui-table'), '未组合 NoteUI.Table');
        assert(h.querySelector('.nui-table__caption').textContent === '访问规则示例', 'caption 未显示');
        const row = instance.getTarget('r2');
        assert(row && row.tagName === 'TR' && row.dataset.rowKey === 'r2', 'getTarget 未返回规则行');
        assert(row.classList.contains('nui-table__row--emphasis'), '强调行未应用 Table 强调');
        assert(h.querySelectorAll('.nui-table__cell--emphasis').length >= 1, '强调列未应用');
        const summaryText = h.querySelector('.nblk-rule-compare__emphasis').textContent;
        assert(summaryText.includes('拒绝写入') && summaryText.includes('结果'), '强调摘要未提供文字说明');
        const notices = h.querySelectorAll('.nui-notice');
        assert(notices.length === 2, '应为强调说明与全局说明各渲染一个 Notice，实际 ' + notices.length);
        const allNoticeText = Array.from(notices).map(node => node.textContent).join(' | ');
        assert(allNoticeText.includes('这条说明应在表格下方就近出现。') && allNoticeText.includes('全局补充说明'), 'Notice 文本不完整');
        assert(!h.querySelector('.nblk-rule-compare__notes').hidden, '说明区应可见');

        h.style.width = '320px';
        await wait(160);
        const scroller = h.querySelector('.nui-table__scroll');
        assert(scroller && scroller.scrollWidth > scroller.clientWidth + 1, '窄容器下宽表未产生局部横向滚动');
        const hint = h.querySelector('.nui-table__scroll-hint');
        assert(hint && !hint.hidden, '宽表滚动提示未出现');

        instance.update({
          columns: { rule: '规则名称', condition: '触发条件', result: '处理结果', note: '备注' },
          emphasize: { row: ['r1'], column: 'condition' }
        });
        await frames(1);
        const headers = Array.from(h.querySelectorAll('.nui-table__head-cell')).map(node => node.textContent.trim());
        assert(headers.join('|') === '规则名称|触发条件|处理结果|备注', '自定义列标签未更新：' + headers.join('|'));
        assert(instance.getTarget('r1').classList.contains('nui-table__row--emphasis'), '更新后的强调行错误');
        assert(instance.getTarget('missing') === null, '未知行 ID 应返回 null');
        assert(h.querySelector('.nblk-rule-compare__emphasis').textContent.includes('允许读取'), '更新后的强调摘要错误');

        instance.update({ rules: [], note: null, emphasize: null });
        await frames(1);
        assert(instance.getTarget('r1') === null, '空数据后仍可取得旧行');
        const empty = h.querySelector('.nui-table__empty-cell');
        assert(empty && empty.textContent.includes('暂无规则数据'), '空表未显示可读空态');
        assert(h.querySelector('.nblk-rule-compare__notes').hidden, '空数据后说明区应隐藏');

        instance.destroy();
        assert(!instance.el.isConnected, 'destroy 后根仍存在');
        assert(!h.querySelector('.nui-table') && !h.querySelector('.nui-notice'), 'destroy 后子组件残留');
        instance = null;
        return 'notices=2; narrow scroll=yes; headers updated';
      } finally {
        if (instance && instance.el && instance.el.isConnected) instance.destroy();
        remove(h);
      }
    });

    checkAsync('B04 CompareView composition, badges, summaries, Focus lifecycle, getTarget, resize', async () => {
      const h = host(980);
      let instance = null;
      try {
        const before = [
          { id: 'quota', label: '每分钟额度', value: '60 次', caption: '旧上限' },
          { id: 'window', label: '统计窗口', value: '60 秒', caption: '保持不变' },
          { id: 'strategy', label: '限流方式', value: '固定窗口', caption: '旧策略' }
        ];
        const after = [
          { id: 'quota', label: '每分钟额度', value: '100 次', caption: '新上限' },
          { id: 'window', label: '统计窗口', value: '60 秒', caption: '保持不变' },
          { id: 'strategy', label: '限流方式', value: '令牌桶', caption: '新策略' }
        ];
        instance = window.NoteBlocks.StateCompare.mount(h, {
          before,
          after,
          changed: ['quota', 'strategy'],
          invariant: ['window'],
          caption: '示例更新：窗口保持不变。',
          mode: 'side-by-side',
          focusChanged: false,
          label: 'B04 对照测试'
        });
        assert(h.querySelector('.nblk-state-compare'), '根未挂载');
        assert(h.querySelector('.nviz-compare'), '未组合 NoteViz.CompareView');
        const panes = h.querySelectorAll('.nviz-compare__pane');
        assert(panes.length === 2, '应有左右两个 CompareView 侧栏');
        assert(panes[0].querySelector('.nviz-compare__title').textContent === '变化前', '变化前标题错误');
        assert(panes[1].querySelector('.nviz-compare__title').textContent === '变化后', '变化后标题错误');
        assert(h.querySelectorAll('.nui-data-object').length === 6, '每侧 DataObject 数量错误');
        assert(h.querySelectorAll('.nui-data-object--changed').length === 4, '变化对象 DataObject.changed 标记数量错误');
        const badges = Array.from(h.querySelectorAll('.nui-badge')).map(node => node.textContent.trim());
        assert(badges.filter(t => t === '本步变化').length === 4, '“本步变化”Badge 数量错误');
        assert(badges.filter(t => t === '未变').length === 2, '“未变”Badge 数量错误');
        assert(h.textContent.includes('此对象在本步保持原值。'), '未变对象缺少可读说明');
        assert(instance.getTarget('left') && instance.getTarget('left').classList.contains('nviz-compare__pane'), 'getTarget(left) 错误');
        assert(instance.getTarget('right') && instance.getTarget('right').classList.contains('nviz-compare__pane'), 'getTarget(right) 错误');
        const objectTarget = instance.getTarget('quota');
        assert(objectTarget && objectTarget.classList.contains('nui-data-object'), 'getTarget(对象 id) 未返回 DataObject');
        const summaryText = h.querySelector('.nblk-state-compare__summary').textContent;
        assert(summaryText.includes('本步变化') && summaryText.includes('60 次 → 100 次'), '缺少本步变化可读说明');
        assert(summaryText.includes('保持未变') && summaryText.includes('两侧均为「60 秒」'), '缺少不变量说明');
        assert(focusOverlayCount() === 0, 'focusChanged:false 不应创建 Focus 覆盖层');

        instance.update({ focusChanged: true });
        await frames(3);
        await wait(300);
        assert(focusOverlayCount() === 1, '开启 focusChanged 后应有且仅有一个 Focus 覆盖层');
        const overlay = document.querySelector('.nx-focus');
        assert(overlay.getAttribute('data-nx-state') === 'shown', 'Focus 未进入 shown 状态');
        const box = overlay.querySelector('.nx-focus__box');
        assert(box, 'Focus 应有框选标记');
        const target = instance.getTarget('quota');
        const targetRect = target.getBoundingClientRect();
        const boxRect = box.getBoundingClientRect();
        assert(Math.abs(boxRect.left - (targetRect.left - 6)) <= 2 && Math.abs(boxRect.top - (targetRect.top - 6)) <= 2, 'Focus 未标记首个变化对象');

        instance.update({ focusChanged: false });
        await wait(50);
        assert(focusOverlayCount() === 0, '关闭 focusChanged 后 Focus 覆盖层残留');
        instance.update({ mode: 'stacked' });
        await frames(2);
        assert(h.querySelector('.nviz-compare').getAttribute('data-layout') === 'stacked', 'mode:stacked 未生效');

        instance.update({ mode: 'side-by-side', focusChanged: true });
        await frames(3);
        await wait(260);
        h.style.width = '340px';
        await wait(160);
        assert(h.querySelector('.nviz-compare').getAttribute('data-layout') === 'stacked', '窄容器未自动切换 stacked');
        const adaptive = h.querySelector('.nviz-compare__adaptive');
        assert(adaptive && !adaptive.hidden && adaptive.textContent.length > 0, '自动 stacked 提示未显示');
        window.dispatchEvent(new Event('resize'));
        await frames(2);
        assert(focusOverlayCount() === 1, '窗口变化后 Focus 被移除');
        const resizeBox = document.querySelector('.nx-focus__box');
        const resizedTarget = instance.getTarget('quota');
        assert(resizeBox && Math.abs(resizeBox.getBoundingClientRect().left - (resizedTarget.getBoundingClientRect().left - 6)) <= 3, '窗口变化后 Focus 未 refresh 到新位置');

        instance.update({
          before: [{ id: 'ttl', label: '缓存时长', value: '300 秒' }],
          after: [{ id: 'ttl', label: '缓存时长', value: '600 秒' }],
          changed: ['ttl'],
          invariant: [],
          caption: '替换后的数据。'
        });
        await frames(3);
        await wait(300);
        assert(instance.getTarget('quota') === null, '替换数据后仍可取得旧对象');
        assert(instance.getTarget('ttl'), '替换数据后新对象不可取得');
        assert(h.textContent.includes('300 秒 → 600 秒'), '替换数据后的变化说明未更新');
        assert(document.querySelectorAll('.nx-focus').length === 1, '替换数据并保留 focusChanged 时应重建一个 Focus');
        const newTarget = instance.getTarget('ttl');
        const newBox = document.querySelector('.nx-focus__box');
        assert(newBox && Math.abs(newBox.getBoundingClientRect().left - (newTarget.getBoundingClientRect().left - 6)) <= 3, '替换数据后 Focus 未定位到新对象');

        instance.destroy();
        await wait(30);
        assert(!instance.el.isConnected, 'destroy 后根仍存在');
        assert(focusOverlayCount() === 0, 'destroy 后 Focus 覆盖层残留');
        assert(!h.querySelector('.nviz-compare') && !h.querySelector('.nui-data-object') && !h.querySelector('.nui-badge'), 'destroy 后组合子组件残留');
        instance = null;
        return 'badges changed=4 invariant=2; focus lifecycle and resize passed';
      } finally {
        if (instance && instance.el && instance.el.isConnected) instance.destroy();
        remove(h);
      }
    });

    checkAsync('B04 single/empty side and missing NoteExpr skip', async () => {
      const h = host(760);
      let instance = null;
      const originalExpr = window.NoteExpr;
      try {
        instance = window.NoteBlocks.StateCompare.mount(h, {
          before: null,
          after: [{ id: 'only', label: '唯一对象', value: '新值' }],
          changed: ['only'],
          caption: '只有变化后侧。',
          focusChanged: true
        });
        await frames(2);
        assert(instance.getTarget('left') === null, '缺少 before 侧时 getTarget(left) 应为 null');
        assert(instance.getTarget('right'), 'after 侧应该存在');
        assert(focusOverlayCount() === 1, '单侧数据也应可定位 Focus');
        instance.destroy();
        await wait(30);
        assert(focusOverlayCount() === 0, '单侧 destroy 后 Focus 残留');
        instance = null;

        instance = window.NoteBlocks.StateCompare.mount(h, {
          before: [],
          after: [{ id: 'only', label: '唯一对象', value: '新值' }],
          caption: '变化前为空。'
        });
        assert(h.textContent.includes('变化前没有对象。'), '空 before 数组未显示可读空态');
        instance.destroy();
        instance = null;

        window.NoteExpr = undefined;
        instance = window.NoteBlocks.StateCompare.mount(h, {
          before: [{ id: 'x', label: '对象 X', value: '旧' }],
          after: [{ id: 'x', label: '对象 X', value: '新' }],
          changed: ['x'],
          focusChanged: true
        });
        await frames(2);
        assert(focusOverlayCount() === 0, 'NoteExpr 未加载时不应伪造 Focus');
        assert(h.textContent.includes('本步变化'), 'NoteExpr 缺失时变化说明仍应可读');
        instance.destroy();
        instance = null;
        return 'single side + empty side + optional Focus skip';
      } finally {
        window.NoteExpr = originalExpr;
        if (instance && instance.el && instance.el.isConnected) instance.destroy();
        remove(h);
      }
    });

    checkAsync('B01/B02 narrow containers keep controls readable without page overflow', async () => {
      const h1 = host(330);
      const h2 = host(330);
      let stage = null;
      let player = null;
      try {
        stage = window.NoteBlocks.DemoStage.mount(h1, {
          title: '窄容器舞台',
          stage: '纯文本画面',
          caption: '一到两行的字幕。',
          controls: [
            { label: '切换画面', variant: 'primary', onClick: function () {} },
            { label: '切换字幕长度', onClick: function () {} },
            { label: '禁用示例', disabled: true },
            { label: '最后一项控制', onClick: function () {} }
          ],
          maxWidth: '100%',
          minStageHeight: 120
        });
        await frames(1);
        assert(h1.scrollWidth <= h1.clientWidth + 1, 'B01 窄容器出现页面级横向溢出');
        assert(stage.el.scrollWidth <= stage.el.clientWidth + 1, 'B01 根内部横向溢出');
        const firstControl = byText(stage.el, '.nui-button', '切换画面');
        assert(firstControl && firstControl.getBoundingClientRect().width <= 302, 'B01 控件宽度超出容器');

        const longSteps = [
          { id: 'a', label: '较长名称的初始停点', caption: '初始短字幕。', state: { n: 0 } },
          { id: 'b', label: '较长名称的第二停点', caption: '第二个停点字幕。', state: { n: 1 } }
        ];
        player = window.NoteBlocks.StepPlayer.mount(h2, {
          steps: longSteps,
          title: '窄容器步进',
          render: (state, ctx) => {
            const node = document.createElement('span');
            node.textContent = '状态 ' + state.n;
            ctx.stageEl.appendChild(node);
            return () => node.remove();
          }
        });
        await frames(1);
        assert(h2.scrollWidth <= h2.clientWidth + 1, 'B02 窄容器出现页面级横向溢出');
        assert(player.el.scrollWidth <= player.el.clientWidth + 1, 'B02 根内部横向溢出');
        const select = player.el.querySelector('select');
        assert(select && select.getBoundingClientRect().right <= player.el.getBoundingClientRect().right + 1, 'B02 跳转 select 超出容器');
        stage.destroy();
        player.destroy();
        stage = null;
        player = null;
        return 'narrow widths 330px; no page-level overflow';
      } finally {
        if (stage && stage.el && stage.el.isConnected) stage.destroy();
        if (player && player.el && player.el.isConnected) player.destroy();
        remove(h1);
        remove(h2);
      }
    });

    checkAsync('Gallery demos B01–B04 mount, replace data and clean overlays', async () => {
      const demos = window.NoteGalleryDemos || {};
      const mounted = [];
      try {
        const h1 = host(940);
        const d1 = demos.B01(h1);
        mounted.push({ d: d1, h: h1 });
        await frames(1);
        assert(h1.querySelector('.nblk-demo-stage'), 'B01 演示未挂载 DemoStage');
        assert(h1.querySelector('.nblk-demo-stage__stage').children.length > 0, 'B01 演示舞台为空');
        assert(h1.querySelectorAll('.nblk-demo-stage__controls button').length >= 3, 'B01 演示控件不足');
        const b1Switch = byText(h1, '.nblk-demo-stage__controls button', '切换画面');
        b1Switch.click();
        await frames(1);
        assert(h1.querySelector('.nblk-demo-stage__stage').textContent.includes('并列比较'), 'B01 切换画面未生效');

        const h2 = host(940);
        const d2 = demos.B02(h2);
        mounted.push({ d: d2, h: h2 });
        await frames(2);
        const stage = h2.querySelector('.nblk-demo-stage__stage');
        const caption = h2.querySelector('.nblk-demo-stage__caption');
        assert(stage && stage.children.length > 0, 'B02 演示舞台为空');
        assert(stage.getBoundingClientRect().height > 40, 'B02 演示舞台高度为 0');
        assert(stage.querySelector('.nviz-sequence'), 'B02 初始停点缺少序列');
        assert(stage.querySelectorAll('.nui-data-object').length === 2, 'B02 初始停点读数不足');
        assert(stage.textContent.includes('完整快照'), 'B02 初始停点缺少状态说明');
        const stageHeight0 = stage.getBoundingClientRect().height;
        const captionHeight0 = caption.getBoundingClientRect().height;
        const b2Next = byText(h2, '.nblk-step-player button', '下一步');
        b2Next.click();
        await frames(2);
        assert(h2.querySelector('.nblk-step-player').getAttribute('data-step-index') === '1', 'B02 演示未进入第二停点');
        assert(stage.querySelector('.nviz-sequence'), 'B02 第二停点缺少序列');
        assert(stage.querySelectorAll('.nui-data-object').length === 2, 'B02 第二停点读数不足');
        assert(stage.textContent.includes('完整快照'), 'B02 第二停点缺少说明');
        const stageHeight1 = stage.getBoundingClientRect().height;
        const captionHeight1 = caption.getBoundingClientRect().height;
        assert(Math.abs(stageHeight0 - stageHeight1) <= 2, 'B02 演示两停点舞台高度不稳定：' + stageHeight0 + ' vs ' + stageHeight1);
        assert(Math.abs(captionHeight0 - captionHeight1) <= 1.1, 'B02 演示字幕区高度不稳定');
        assert(h2.querySelectorAll('.nviz-sequence').length === 1, 'B02 演示第二停点有序列残留');
        const b2Replay = byText(h2, '.nblk-step-player button', '重看');
        const b2CaptionBeforeReplay = h2.querySelector('.nblk-demo-stage__caption').textContent;
        b2Replay.click();
        await frames(2);
        assert(h2.querySelectorAll('.nviz-sequence').length === 1, 'B02 重看后出现重复序列');
        assert(h2.querySelector('.nblk-demo-stage__caption').textContent === b2CaptionBeforeReplay, 'B02 重看后字幕不稳定');
        const b2Prev = byText(h2, '.nblk-step-player button', '上一步');
        b2Prev.click();
        await frames(2);
        assert(h2.querySelector('.nblk-step-player').getAttribute('data-step-index') === '0', 'B02 演示回退失败');
        assert(h2.querySelectorAll('.nviz-sequence').length === 1, 'B02 演示回退后有序列残留');
        const b2Switch = byText(h2, '.nblk-gallery-demo__toolbar button', '换用备用快照组（3 停点）');
        assert(b2Switch, 'B02 演示缺少更换数据按钮');
        b2Switch.click();
        await frames(2);
        assert(h2.querySelectorAll('.nblk-step-player select option').length === 3, 'B02 换数据后跳转选项未更新');
        assert(stage.querySelector('.nviz-sequence'), 'B02 换数据后舞台为空');
        assert(stage.querySelectorAll('.nui-data-object').length === 2, 'B02 换数据后读数不足');
        assert(stage.getBoundingClientRect().height > 40, 'B02 换数据后舞台高度为 0');

        const h3 = host(940);
        const d3 = demos.B03(h3);
        mounted.push({ d: d3, h: h3 });
        await frames(1);
        assert(h3.querySelector('.nblk-rule-compare'), 'B03 演示未挂载规则对照');
        assert(h3.querySelector('.nui-table'), 'B03 演示缺少 Table');
        assert(h3.querySelectorAll('.nui-notice').length >= 1, 'B03 演示缺少就近说明');
        const b3Switch = byText(h3, '.nblk-gallery-demo__toolbar button', '切换强调');
        b3Switch.click();
        await frames(1);
        assert(h3.querySelector('.nblk-rule-compare__emphasis').textContent.includes('写入冲突') ||
          h3.querySelector('.nblk-rule-compare__emphasis').textContent.includes('拒绝写入'), 'B03 演示强调更新失败');
        const b3Labels = byText(h3, '.nblk-gallery-demo__toolbar button', '换列标签');
        b3Labels.click();
        await frames(1);
        assert(h3.querySelector('.nui-table__head-cell').textContent.includes('规则名称'), 'B03 演示列标签更新失败');

        const h4 = host(940);
        const d4 = demos.B04(h4);
        mounted.push({ d: d4, h: h4 });
        await frames(2);
        assert(h4.querySelector('.nblk-state-compare'), 'B04 演示未挂载状态对照');
        assert(h4.querySelector('.nviz-compare'), 'B04 演示缺少 CompareView');
        assert(h4.querySelectorAll('.nui-data-object').length >= 4, 'B04 演示对象不足');
        assert(h4.querySelector('.nblk-state-compare__summary').textContent.includes('本步变化'), 'B04 演示缺少变化说明');
        assert(focusOverlayCount() === 0, 'B04 演示默认不应显示 Focus');
        const b4Focus = byText(h4, '.nblk-gallery-demo__toolbar button', '显示关注标记');
        assert(b4Focus, 'B04 演示缺少 Focus 按钮');
        b4Focus.click();
        await frames(3);
        assert(focusOverlayCount() === 1, 'B04 演示开启 Focus 后覆盖层缺失');
        const b4Data = byText(h4, '.nblk-gallery-demo__toolbar button', '换一组前后状态');
        b4Data.click();
        await frames(3);
        assert(h4.textContent.includes('缓存时长'), 'B04 演示换数据失败');
        assert(h4.querySelector('.nblk-state-compare__summary').textContent.includes('600 秒'), 'B04 演示新变化说明未更新');
        assert(focusOverlayCount() === 1, 'B04 换数据后 Focus 应重新定位');
        const b4Narrow = byText(h4, '.nblk-gallery-demo__toolbar button', '切换窄容器');
        b4Narrow.click();
        await wait(180);
        assert(h4.querySelector('.nviz-compare').getAttribute('data-layout') === 'stacked', 'B04 演示窄容器未 stacked');

        for (const item of mounted.slice().reverse()) {
          assert(typeof item.d.destroy === 'function', '演示未返回 destroy');
          item.d.destroy();
          assert(item.h.children.length === 0, '演示 destroy 后宿主仍有内容');
          remove(item.h);
        }
        mounted.length = 0;
        await wait(40);
        assert(focusOverlayCount() === 0, '演示销毁后仍有 Focus 覆盖层');
        assert(document.querySelector('.nviz-compare') === null, '演示销毁后仍有 CompareView');
        return 'B01–B04 demos mounted; B02 initial/step2 heights ' + stageHeight0.toFixed(1) + '/' + stageHeight1.toFixed(1);
      } finally {
        for (const item of mounted) {
          try { item.d.destroy(); } catch (error) {}
          remove(item.h);
        }
      }
    });

    for (const item of pending) {
      try {
        const detail = await item.fn();
        checks.push({ name: item.name, ok: true, detail: detail == null ? '' : String(detail) });
      } catch (error) {
        checks.push({ name: item.name, ok: false, detail: error.stack || String(error) });
      }
    }
    return checks;
  });

  for (const check of normal) record(check.name, check.ok, check.detail);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await page.evaluate(async () => {
    const C = window.NoteCore;
    const h = document.createElement('div');
    h.className = 'test-host';
    h.style.width = '760px';
    document.querySelector('.test-workspace').appendChild(h);
    let instance = null;
    try {
      instance = window.NoteBlocks.StateCompare.mount(h, {
        before: [{ id: 'v', label: '值', value: '旧' }],
        after: [{ id: 'v', label: '值', value: '新' }],
        changed: ['v'],
        focusChanged: true,
        caption: '减少动效检查。'
      });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await new Promise(resolve => setTimeout(resolve, 80));
      const box = document.querySelector('.nx-focus__box');
      return {
        reduced: C && C.motion && typeof C.motion.reduced === 'function' ? C.motion.reduced() : null,
        focusLayers: document.querySelectorAll('.nx-focus').length,
        boxAnimations: box ? box.getAnimations().length : -1,
        boxPresent: !!box
      };
    } finally {
      if (instance) instance.destroy();
      h.remove();
    }
  });
  record('Reduced motion keeps Focus readable without box animation',
    reduced.reduced === true && reduced.focusLayers === 1 && reduced.boxAnimations === 0 && reduced.boxPresent === true,
    JSON.stringify(reduced));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.screenshot({ path: path.join(outDir, 'blocks-stage-main.png'), fullPage: true }).catch(() => {});

  // The render-error scenario intentionally logs one diagnostic console error.
  const errorPage = await context.newPage();
  const errorConsole = [];
  errorPage.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      errorConsole.push({ type: message.type(), text: message.text() });
    }
  });
  errorPage.on('pageerror', (error) => {
    errorConsole.push({ type: 'pageerror', text: error.stack || String(error) });
  });
  await setupPage(errorPage);
  const errorResult = await errorPage.evaluate(async () => {
    const checks = [];
    function assert(condition, message) { if (!condition) throw new Error(message); }
    const h = document.createElement('div');
    h.className = 'test-host';
    h.style.width = '760px';
    document.body.appendChild(h);
    try {
      const player = window.NoteBlocks.StepPlayer.mount(h, {
        steps: [{ id: 'bad', caption: '会失败的停点', state: { value: 1 } }],
        render: () => { throw new Error('boom 测试错误'); }
      });
      await new Promise(resolve => setTimeout(resolve, 80));
      const alert = h.querySelector('.nblk-step-player__error[role="alert"]');
      assert(alert, 'render 抛错后没有 role=alert 错误块');
      assert(alert.textContent.includes('此停点无法显示'), '错误块缺少可读标题');
      assert(alert.textContent.includes('boom 测试错误'), '错误块未显示诊断信息');
      assert(h.querySelector('.nblk-step-player select'), 'render 错误后控件消失');
      assert(h.querySelector('.nblk-demo-stage__caption').textContent === '会失败的停点', 'render 错误时字幕未保留');
      checks.push({ name: 'B02 render error is readable and controls remain', ok: true, detail: alert.textContent.trim().slice(0, 100) });
      player.update({
        render: (state, ctx) => {
          const node = document.createElement('span');
          node.textContent = '已恢复';
          ctx.stageEl.appendChild(node);
          return () => node.remove();
        }
      });
      await new Promise(resolve => setTimeout(resolve, 40));
      assert(h.querySelector('.nblk-demo-stage__stage').textContent.includes('已恢复'), '重看/重绘后错误状态未恢复');
      assert(!h.querySelector('.nblk-step-player__error'), '恢复成功后错误块残留');
      checks.push({ name: 'B02 render error can recover on update', ok: true, detail: 'recovered' });
      player.destroy();
      checks.push({ name: 'B02 error player destroy leaves no root', ok: !h.querySelector('.nblk-step-player'), detail: '' });
    } catch (error) {
      checks.push({ name: 'B02 render error behavior', ok: false, detail: error.stack || String(error) });
    } finally {
      h.remove();
    }
    return checks;
  });
  for (const check of errorResult) record(check.name, check.ok, check.detail);
  for (const item of errorConsole) {
    consoleRecords.push({ page: 'error-scenario', type: item.type, text: item.text });
  }

  const mainConsoleClean = !consoleRecords.some((item) =>
    item.page === 'main' && (item.type === 'error' || item.type === 'warning' || item.type === 'pageerror')
  );
  record('No unexpected console errors/warnings in normal page', mainConsoleClean,
    consoleRecords.filter(item => item.page === 'main').map(item => item.type + ': ' + item.text).join('\n'));
  const expectedErrorLogged = errorConsole.some((item) => item.type === 'error' && item.text.includes('渲染失败'));
  record('Deliberate render-throw emits console.error diagnostic', expectedErrorLogged,
    JSON.stringify(errorConsole));

  const summary = {
    checkedAt: new Date().toISOString(),
    pass: results.filter(item => item.ok).length,
    fail: results.filter(item => !item.ok).length,
    results,
    consoleRecords
  };
  fs.writeFileSync(path.join(outDir, 'blocks-stage-check-result.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log('\nSUMMARY ' + summary.pass + ' passed, ' + summary.fail + ' failed');
  if (summary.fail) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
}
