/* TEST ONLY: overlay component checks, run in Edge via overlay-check.mjs. */
(function (global) {
  'use strict';

  var results = [];

  function assert(name, ok, detail) {
    results.push({ name: name, ok: Boolean(ok), detail: detail == null ? '' : String(detail) });
  }
  function wait(ms) { return new Promise(function (resolve) { global.setTimeout(resolve, ms); }); }
  function make(tag, className, textValue) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (textValue != null) node.textContent = textValue;
    return node;
  }
  function fixture() {
    var host = make('div', 'fixture');
    (document.getElementById('fixture-root') || document.body).appendChild(host);
    return host;
  }
  function button(textValue, parent) {
    var node = make('button', '', textValue);
    node.type = 'button';
    if (parent) parent.appendChild(node);
    return node;
  }
  function findByText(root, textValue) {
    return Array.prototype.slice.call(root.querySelectorAll('button')).filter(function (node) {
      return node.textContent.trim() === textValue;
    })[0] || null;
  }
  function visible(node) {
    return !!(node && node.isConnected && node.getClientRects().length && !node.closest('[hidden]'));
  }
  function rectOf(node) {
    var rect = node.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
  }
  function overlaps(a, b) {
    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  }
  function withinViewport(rect, pad) {
    var p = pad == null ? 0 : pad;
    return rect.left >= -p && rect.top >= -p &&
      rect.right <= (global.innerWidth + p) && rect.bottom <= (global.innerHeight + p);
  }
  function pointerDown(target) {
    target.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    }));
  }
  function clickTarget(target) {
    if (!target) return;
    pointerDown(target);
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    try { target.focus({ preventScroll: true }); } catch (error) { /* ignore */ }
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    target.click();
  }
  function keyOnActive(key, options) {
    var target = document.activeElement || document.body;
    target.dispatchEvent(new KeyboardEvent('keydown', Object.assign({
      key: key,
      bubbles: true,
      cancelable: true
    }, options || {})));
  }
  function pressEscape() { keyOnActive('Escape'); }
  async function focusFresh(target) {
    if (document.activeElement === target) {
      target.blur();
      await wait(5);
    }
    target.focus();
  }
  function hoverIn(target) { target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false })); }
  function hoverOut(target) { target.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false })); }
  function visiblePanels(selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector || '.hnv-floating__panel')).filter(visible);
  }
  function topbackdrops() {
    return Array.prototype.slice.call(document.querySelectorAll('.hnv-floating__backdrop')).filter(visible);
  }
  function countFloatingRoots() {
    return document.querySelectorAll('.hnv-floating').length;
  }
  function bodyMarkers() {
    return document.querySelectorAll('body > .nui-dialog, body > .nui-drawer').length;
  }
  function cleanup() {
    if (global.NoteCore && global.NoteCore.floating && global.NoteCore.floating.closeAll) {
      try { global.NoteCore.floating.closeAll(); } catch (error) { /* ignore */ }
    }
    Array.prototype.slice.call(document.querySelectorAll('.hnv-floating, .hnv-floating__root')).forEach(function (node) { node.remove(); });
    Array.prototype.slice.call(document.querySelectorAll('.hnv-floating__backdrop')).forEach(function (node) { node.remove(); });
    Array.prototype.slice.call(document.querySelectorAll('.fixture')).forEach(function (node) { node.remove(); });
    Array.prototype.slice.call(document.querySelectorAll('body > .nui-dialog, body > .nui-drawer')).forEach(function (node) { node.remove(); });
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
    global.scrollTo(0, 0);
  }
  function longText(label) {
    var wrap = document.createElement('div');
    wrap.appendChild(make('p', '', label + '：内容区独立滚动，标题与操作固定。'));
    for (var i = 1; i <= 30; i += 1) {
      wrap.appendChild(make('p', '', '第 ' + i + ' 段。这是用于验证滚动、窄屏换行和长内容布局的普通文本，不依赖悬停说明。'));
    }
    return wrap;
  }

  async function runCase(id, fn) {
    cleanup();
    await wait(5);
    try {
      await fn();
    } catch (error) {
      assert(id + ' 用例未抛异常', false, error && (error.stack || error.message || error));
    }
    await wait(20);
    var roots = countFloatingRoots();
    var backdrops = topbackdrops().length;
    var markers = bodyMarkers();
    assert(id + ' 用例结束后无浮层/遮罩残留', roots === 0 && backdrops === 0, 'roots=' + roots + ' backdrops=' + backdrops);
    assert(id + ' 用例结束后 body 无对话框标记残留', markers === 0, 'markers=' + markers);
    assert(id + ' 用例结束后滚动锁已恢复', document.body.style.overflow !== 'hidden', 'overflow=' + document.body.style.overflow);
    cleanup();
    await wait(5);
  }

  /* --------------------------------------------------------------- O01 */

  async function testTooltipCore() {
    var host = fixture();
    var external = button('账户安全性', host);
    external.setAttribute('aria-describedby', 'existing-help');
    var other = button('其他按钮', host);
    var reasons = [];

    var tip = global.NoteUI.Tooltip.mount(host, {
      anchor: external,
      content: '辅助说明文本，只补充次要信息。',
      placement: 'top',
      delay: 10,
      focusDelay: 5,
      hideDelay: 10,
      onHide: function (reason) { reasons.push(reason); }
    });
    assert('O01 挂载后未显示浮层', visiblePanels('.nui-tooltip__panel').length === 0);

    hoverIn(external);
    await wait(45);
    var panel = tip.getPanel();
    assert('O01 悬停显示 Tooltip', visible(panel));
    assert('O01 role=tooltip', panel && panel.getAttribute('role') === 'tooltip');
    assert('O01 aria-describedby 含面板 id', panel && (' ' + external.getAttribute('aria-describedby') + ' ').indexOf(' ' + panel.id + ' ') >= 0,
      external.getAttribute('aria-describedby'));
    assert('O01 aria-describedby 保留既有值', /existing-help/.test(external.getAttribute('aria-describedby') || ''));
    var tipRect = rectOf(panel);
    var anchorRect = rectOf(external);
    assert('O01 Tooltip 不越界', withinViewport(tipRect));
    assert('O01 Tooltip 不覆盖触发点', !overlaps(tipRect, anchorRect));
    assert('O01 Tooltip 内容不可交互（pointer-events none）', global.getComputedStyle(panel).pointerEvents === 'none');

    pressEscape();
    await wait(15);
    assert('O01 Esc 关闭 Tooltip', !tip.isOpen() && !visible(panel));
    assert('O01 Esc 上报 esc', reasons.indexOf('esc') >= 0, reasons.join(','));
    assert('O01 关闭后恢复 aria-describedby', external.getAttribute('aria-describedby') === 'existing-help');
    hoverOut(external);
    await wait(15);

    external.focus();
    await wait(30);
    assert('O01 键盘焦点显示 Tooltip', tip.isOpen());
    other.focus();
    await wait(35);
    assert('O01 失焦关闭 Tooltip', !tip.isOpen());

    external.focus();
    await wait(30);
    assert('O01 重新聚焦显示', tip.isOpen());
    hoverOut(external);
    await wait(30);
    assert('O01 键盘焦点仍在时不因移出关闭', tip.isOpen());
    other.focus();
    await wait(35);
    assert('O01 之后失焦关闭', !tip.isOpen());

    external.focus();
    await wait(30);
    pointerDown(document.body);
    await wait(15);
    assert('O01 点击外部关闭', !tip.isOpen());

    await focusFresh(external);
    await wait(30);
    global.scrollTo(0, 90);
    await wait(35);
    assert('O01 滚动关闭', !tip.isOpen());
    assert('O01 滚动关闭按 outside 上报', reasons.indexOf('outside') >= 0, reasons.join(','));
    global.scrollTo(0, 0);

    tip.update({ disabled: true });
    hoverIn(external);
    await wait(40);
    assert('O01 禁用时不显示', !tip.isOpen());
    assert('O01 外部 anchor 不被改成 disabled', external.disabled === false);
    tip.update({ disabled: false });

    await focusFresh(external);
    await wait(30);
    tip.update({ content: '更新后的辅助说明文本。' });
    assert('O01 update 内容生效', panel.textContent.indexOf('更新后的辅助说明文本') >= 0, panel.textContent);
    pressEscape();
    await wait(10);

    var created = global.NoteUI.Tooltip.mount(host, {
      label: '导出格式',
      content: 'CSV 为纯文本表格。',
      delay: 10
    });
    var createdAnchor = created.getAnchor();
    assert('O01 无 anchor 时创建 button 触发器', createdAnchor.tagName === 'BUTTON' && createdAnchor.textContent === '导出格式');
    hoverIn(createdAnchor);
    await wait(45);
    assert('O01 新建触发器悬停显示', created.isOpen());
    created.hide();
    await wait(10);
    assert('O01 API hide 关闭', !created.isOpen());
    created.update({ disabled: true });
    assert('O01 新建触发器随 disabled 原生禁用', createdAnchor.disabled === true);
    hoverIn(createdAnchor);
    await wait(30);
    assert('O01 禁用触发器不显示', !created.isOpen());
    created.update({ disabled: false });
    assert('O01 解除 disabled 恢复触发器', createdAnchor.disabled === false);

    await focusFresh(external);
    await wait(30);
    assert('O01 移除锚点前为打开', tip.isOpen());
    external.remove();
    await wait(45);
    assert('O01 锚点移除关闭', !tip.isOpen());
    assert('O01 锚点移除上报 anchor-removed', reasons.indexOf('anchor-removed') >= 0, reasons.join(','));
    assert('O01 移除后仍恢复 describedby', external.getAttribute('aria-describedby') === 'existing-help');

    tip.destroy();
    created.destroy();
    assert('O01 destroy 后 getPanel 为空', tip.getPanel() === null && created.getPanel() === null);
    assert('O01 destroy 后无 tooltip 面板', document.querySelectorAll('.nui-tooltip__panel').length === 0);
    assert('O01 外部锚点保留 describedby', external.getAttribute('aria-describedby') === 'existing-help');
  }

  async function testTooltipEdges() {
    var host = fixture();
    var topAnchor = button('上边缘', host);
    topAnchor.style.position = 'fixed';
    topAnchor.style.left = '8px';
    topAnchor.style.top = '4px';
    topAnchor.style.width = '90px';
    topAnchor.style.height = '24px';
    var topTip = global.NoteUI.Tooltip.mount(host, {
      anchor: topAnchor,
      content: '视口边缘避让测试文本。重要解释不放在这里，只验证避让和翻转。',
      placement: 'top',
      delay: 0,
      hideDelay: 0
    });
    topTip.show();
    await wait(15);
    var panel = topTip.getPanel();
    var pr = rectOf(panel);
    var ar = rectOf(topAnchor);
    assert('O01 上边缘 Tooltip 仍可见', visible(panel));
    assert('O01 上边缘 Tooltip 不越界', withinViewport(pr));
    assert('O01 上边缘翻转后不覆盖触发点', !overlaps(pr, ar), JSON.stringify({ pr: pr, ar: ar }));
    topTip.destroy();

    var rightAnchor = button('右下边缘', host);
    rightAnchor.style.position = 'fixed';
    rightAnchor.style.right = '4px';
    rightAnchor.style.bottom = '4px';
    rightAnchor.style.width = '90px';
    rightAnchor.style.height = '24px';
    var rightTip = global.NoteUI.Tooltip.mount(host, {
      anchor: rightAnchor,
      content: '右侧与底部边缘的翻转测试文本，保持面板在视口内。',
      placement: 'right-end',
      delay: 0,
      hideDelay: 0
    });
    rightTip.show();
    await wait(15);
    var rp = rectOf(rightTip.getPanel());
    var ra = rectOf(rightAnchor);
    assert('O01 右边缘 Tooltip 仍可见', visible(rightTip.getPanel()));
    assert('O01 右边缘 Tooltip 不越界', withinViewport(rp));
    assert('O01 右边缘翻转后不覆盖触发点', !overlaps(rp, ra), JSON.stringify({ rp: rp, ra: ra }));
    rightTip.destroy();
  }

  /* --------------------------------------------------------------- O02 */

  async function testPopover() {
    var host = fixture();
    var outside = button('外部焦点', host);
    var content = document.createElement('div');
    var field = make('label', '', '关键字');
    var input = make('input');
    input.type = 'text';
    input.placeholder = '输入';
    field.appendChild(input);
    content.appendChild(field);
    var applyCount = 0;
    var apply = button('应用', content);
    var inner = button('更多帮助', content);

    var closes = [];
    var pop = global.NoteUI.Popover.mount(host, {
      triggerLabel: '筛选条件',
      label: '筛选条件',
      content: content,
      placement: 'bottom-start',
      onClose: function (reason) { closes.push(reason); }
    });
    var trigger = pop.getTrigger();
    assert('O02 创建 button 触发器', trigger.tagName === 'BUTTON' && trigger.textContent === '筛选条件');
    assert('O02 aria-haspopup=dialog', trigger.getAttribute('aria-haspopup') === 'dialog');
    assert('O02 初始 aria-expanded=false', trigger.getAttribute('aria-expanded') === 'false');
    assert('O02 aria-controls 已设置', !!trigger.getAttribute('aria-controls'));

    outside.focus();
    pop.open();
    await wait(10);
    assert('O02 API open 打开', pop.isOpen() && visible(pop.getPanel()));
    assert('O02 不自动抢焦点', document.activeElement === outside, document.activeElement && document.activeElement.tagName);
    assert('O02 aria-expanded=true', trigger.getAttribute('aria-expanded') === 'true');
    assert('O02 role=dialog', pop.getPanel().getAttribute('role') === 'dialog');
    assert('O02 面板可访问名称', pop.getPanel().getAttribute('aria-label') === '筛选条件');
    var pr = rectOf(pop.getPanel());
    var tr = rectOf(trigger);
    assert('O02 面板不越界', withinViewport(pr));
    assert('O02 面板不覆盖触发点', !overlaps(pr, tr));
    pop.close('api');
    await wait(10);

    pop.toggle();
    await wait(10);
    assert('O02 toggle() 打开', pop.isOpen());
    pop.toggle();
    await wait(10);
    assert('O02 toggle() 关闭', !pop.isOpen());

    clickTarget(trigger);
    await wait(10);
    assert('O02 点击触发器打开', pop.isOpen());
    clickTarget(trigger);
    await wait(15);
    assert('O02 再次点击触发器关闭且不重开', !pop.isOpen());
    assert('O02 触发器关闭后 aria-expanded=false', trigger.getAttribute('aria-expanded') === 'false');
    assert('O02 触发器关闭上报 outside', closes[closes.length - 1] === 'outside', closes.join(','));

    clickTarget(trigger);
    await wait(10);
    assert('O02 第三次点击重新打开', pop.isOpen());
    trigger.click();
    await wait(15);
    assert('O02 键盘/程序 click 关闭', !pop.isOpen());
    assert('O02 键盘关闭上报 api', closes[closes.length - 1] === 'api', closes.join(','));

    clickTarget(trigger);
    await wait(10);
    input.focus();
    pressEscape();
    await wait(15);
    assert('O02 Esc 关闭', !pop.isOpen());
    assert('O02 Esc 后焦点返回触发器', document.activeElement === trigger, document.activeElement && document.activeElement.tagName);
    assert('O02 Esc 上报 esc', closes.indexOf('esc') >= 0, closes.join(','));

    clickTarget(trigger);
    await wait(10);
    input.focus();
    pointerDown(document.body);
    await wait(15);
    assert('O02 外点关闭', !pop.isOpen());
    assert('O02 外点关闭焦点返回触发器', document.activeElement === trigger, document.activeElement && document.activeElement.tagName);

    clickTarget(trigger);
    await wait(10);
    input.focus();
    apply.addEventListener('click', function () {
      applyCount += 1;
      pop.close('api');
    });
    clickTarget(apply);
    await wait(15);
    assert('O02 内容按钮可交互', applyCount === 1);
    assert('O02 内容操作关闭并返回焦点', !pop.isOpen() && document.activeElement === trigger);

    var child = global.NoteUI.Popover.mount(content, {
      anchor: inner,
      label: '更多帮助',
      content: '子层说明：按 Esc 只关闭子层。',
      placement: 'right-start'
    });
    clickTarget(trigger);
    await wait(10);
    clickTarget(inner);
    await wait(15);
    assert('O02 嵌套时父层保持打开', pop.isOpen());
    assert('O02 子层打开', child.isOpen());
    assert('O02 同时存在两个可见面板', visiblePanels('.nui-popover__panel').length === 2, String(visiblePanels('.nui-popover__panel').length));
    pressEscape();
    await wait(15);
    assert('O02 Esc 只关子层', !child.isOpen() && pop.isOpen());
    assert('O02 子层关闭焦点回子触发器', document.activeElement === inner, document.activeElement && document.activeElement.tagName);
    pressEscape();
    await wait(15);
    assert('O02 再按 Esc 关父层', !pop.isOpen());
    assert('O02 父层关闭焦点回父触发器', document.activeElement === trigger);

    clickTarget(trigger);
    await wait(10);
    clickTarget(inner);
    await wait(15);
    pointerDown(document.body);
    await wait(15);
    assert('O02 外点只关最上层子层', !child.isOpen() && pop.isOpen());
    pointerDown(document.body);
    await wait(15);
    assert('O02 再点外部关父层', !pop.isOpen());
    assert('O02 外点上报 outside', closes.indexOf('outside') >= 0, closes.join(','));

    pop.update({ content: '更新后的弹出内容', triggerLabel: '新触发器' });
    assert('O02 update 触发标签', trigger.textContent === '新触发器');
    pop.open();
    await wait(10);
    assert('O02 update 内容生效', pop.getPanel().textContent.indexOf('更新后的弹出内容') >= 0);
    pop.close('api');
    await wait(10);

    pop.update({ disabled: true });
    assert('O02 新建触发器随 disabled 原生禁用', trigger.disabled === true);
    clickTarget(trigger);
    await wait(10);
    assert('O02 禁用时点击不打开', !pop.isOpen());
    pop.update({ disabled: false });
    assert('O02 解除 disabled 恢复触发器', trigger.disabled === false);

    var silentPopCloses = 0;
    var silentPop = global.NoteUI.Popover.mount(host, {
      triggerLabel: '静默弹层',
      content: '静默关闭内容',
      onClose: function () { silentPopCloses += 1; }
    });
    silentPop.open();
    await wait(10);
    silentPop.update({ open: false });
    await wait(10);
    assert('O02 程序 update 关闭不触发 onClose', !silentPop.isOpen() && silentPopCloses === 0);
    silentPop.destroy();

    child.destroy();
    pop.destroy();
    assert('O02 destroy 后无可见面板', visiblePanels('.nui-popover__panel').length === 0);

    var ext = button('外部触发器', host);
    ext.setAttribute('aria-expanded', 'false');
    var pop2 = global.NoteUI.Popover.mount(host, { anchor: ext, content: '外部锚点内容' });
    assert('O02 外部锚点挂载后 aria-haspopup', ext.getAttribute('aria-haspopup') === 'dialog');
    assert('O02 外部锚点 aria-controls', !!ext.getAttribute('aria-controls'));
    clickTarget(ext);
    await wait(10);
    assert('O02 外部锚点点击打开', pop2.isOpen());
    assert('O02 外部锚点面板名称回退到触发文本', pop2.getPanel().getAttribute('aria-label') === '外部触发器', pop2.getPanel().getAttribute('aria-label'));
    clickTarget(ext);
    await wait(15);
    assert('O02 外部锚点再次点击关闭，不重开', !pop2.isOpen());
    pop2.destroy();
    assert('O02 destroy 恢复外部锚点属性', !ext.hasAttribute('aria-haspopup') && ext.getAttribute('aria-expanded') === 'false' && !ext.hasAttribute('aria-controls'));
  }

  /* --------------------------------------------------------------- O03 */

  async function testDialog() {
    document.body.style.overflow = 'auto';
    var host = fixture();
    var opener = button('打开对话框', host);
    var other = button('外部', host);
    var closes = [];
    var saved = 0;
    var dialog = global.NoteUI.Dialog.mount(host, {
      title: '通知设置',
      content: '字符串内容用于 aria-describedby。',
      actions: [
        { label: '取消', close: true },
        {
          label: '保存',
          variant: 'primary',
          close: true,
          onClick: function () { saved += 1; }
        }
      ],
      onClose: function (reason) { closes.push(reason); }
    });
    opener.addEventListener('click', function () { dialog.open(); });
    clickTarget(opener);
    await wait(15);
    var panel = dialog.getPanel();
    assert('O03 打开后有可见面板', visible(panel));
    assert('O03 role=dialog', panel.getAttribute('role') === 'dialog');
    assert('O03 aria-modal=true', panel.getAttribute('aria-modal') === 'true');
    var titleId = panel.getAttribute('aria-labelledby');
    assert('O03 aria-labelledby 指向标题', !!titleId && document.getElementById(titleId) && document.getElementById(titleId).textContent === '通知设置');
    var descId = panel.getAttribute('aria-describedby');
    assert('O03 字符串内容自动 aria-describedby', !!descId && document.getElementById(descId) && document.getElementById(descId).textContent.indexOf('字符串内容') >= 0);
    assert('O03 打开时焦点进入面板', panel.contains(document.activeElement));
    assert('O03 默认焦点陷阱聚焦首个可聚焦元素', document.activeElement.classList.contains('nui-dialog__close'), document.activeElement.className);
    assert('O03 模态锁 body 滚动', document.body.style.overflow === 'hidden');
    assert('O03 模态创建遮罩', topbackdrops().length === 1);

    var focusables = global.NoteCore.focusables(panel);
    assert('O03 动作按钮已渲染', focusables.length >= 3, String(focusables.length));
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    first.focus();
    keyOnActive('Tab', { shiftKey: true });
    assert('O03 Shift+Tab 从首个循环到末个', document.activeElement === last);
    keyOnActive('Tab');
    assert('O03 Tab 从末个循环到首个', document.activeElement === first);
    other.focus();
    keyOnActive('Tab');
    assert('O03 Tab 不逃出面板', panel.contains(document.activeElement), document.activeElement && document.activeElement.className);

    pressEscape();
    await wait(15);
    assert('O03 Esc 关闭', !dialog.isOpen());
    assert('O03 关闭上报 esc', closes.indexOf('esc') >= 0, closes.join(','));
    assert('O03 关闭恢复焦点到打开按钮', document.activeElement === opener, document.activeElement && document.activeElement.tagName);
    assert('O03 关闭恢复 body overflow', document.body.style.overflow === 'auto');
    assert('O03 关闭移除遮罩', topbackdrops().length === 0);

    clickTarget(opener);
    await wait(10);
    pointerDown(topbackdrops()[0]);
    await wait(10);
    assert('O03 默认外点不关闭', dialog.isOpen());
    var saveButton = Array.prototype.slice.call(panel.querySelectorAll('button')).filter(function (node) { return node.textContent === '保存'; })[0];
    assert('O03 legacy Button 用于默认动作', saveButton && saveButton.classList.contains('nui-button'));
    clickTarget(saveButton);
    await wait(15);
    assert('O03 动作 onClick 生效', saved === 1);
    assert('O03 动作 close 关闭并返回焦点', !dialog.isOpen() && document.activeElement === opener);

    clickTarget(opener);
    await wait(10);
    var closeButton = panel.querySelector('.nui-dialog__close');
    clickTarget(closeButton);
    await wait(15);
    assert('O03 关闭按钮关闭', !dialog.isOpen());
    assert('O03 关闭按钮上报 api', closes[closes.length - 1] === 'api', closes.join(','));

    var outsideHost = fixture();
    var outsideOpener = button('外点对话框', outsideHost);
    var outsideCloses = [];
    var outsideDialog = global.NoteUI.Dialog.mount(outsideHost, {
      title: '外点策略',
      content: '点击遮罩关闭。',
      closeOnOutside: true,
      onClose: function (reason) { outsideCloses.push(reason); }
    });
    outsideOpener.addEventListener('click', function () { outsideDialog.open(); });
    clickTarget(outsideOpener);
    await wait(10);
    pointerDown(topbackdrops()[0]);
    await wait(15);
    assert('O03 closeOnOutside=true 时外点关闭', !outsideDialog.isOpen());
    assert('O03 外点上报 outside', outsideCloses.indexOf('outside') >= 0, outsideCloses.join(','));
    assert('O03 外点关闭恢复焦点', document.activeElement === outsideOpener);
    outsideDialog.destroy();

    var escHost = fixture();
    var escDialog = global.NoteUI.Dialog.mount(escHost, {
      title: 'Esc 策略',
      content: 'Esc 不关闭。',
      closeOnEsc: false
    });
    escDialog.open();
    await wait(10);
    pressEscape();
    await wait(10);
    assert('O03 closeOnEsc=false 时 Esc 不关闭', escDialog.isOpen());
    escDialog.close('api');
    await wait(10);
    escDialog.destroy();

    /* non-modal dialog: centered via core modal positioning, but no backdrop/trap/lock */
    var nonModalCloses = [];
    var nonModal = global.NoteUI.Dialog.mount(host, {
      title: '非模态对话框',
      content: '非模态内容',
      modal: false,
      closeOnOutside: true,
      onClose: function (reason) { nonModalCloses.push(reason); }
    });
    nonModal.open();
    await wait(15);
    var nonModalPanel = nonModal.getPanel();
    assert('O03 非模态面板可见', visible(nonModalPanel));
    assert('O03 非模态不设置 aria-modal', !nonModalPanel.hasAttribute('aria-modal'));
    assert('O03 非模态不创建遮罩', topbackdrops().length === 0);
    assert('O03 非模态不锁 body 滚动', document.body.style.overflow === 'auto');
    assert('O03 非模态不自动聚焦面板', !nonModalPanel.contains(document.activeElement));
    assert('O03 非模态面板在视口内', withinViewport(rectOf(nonModalPanel)));
    pointerDown(document.body);
    await wait(15);
    assert('O03 非模态外点关闭', !nonModal.isOpen());
    assert('O03 非模态外点上报 outside', nonModalCloses.indexOf('outside') >= 0, nonModalCloses.join(','));
    nonModal.destroy();

    /* confirm: false */
    var prior = opener;
    prior.focus();
    var confirmFalse = global.NoteUI.Dialog.confirm({
      title: '删除草稿？',
      content: '确认内容',
      confirmLabel: '删除',
      cancelLabel: '保留',
      tone: 'danger'
    });
    await wait(15);
    var confirmPanels = visiblePanels('.nui-dialog__panel');
    var confirmPanel = confirmPanels[confirmPanels.length - 1];
    assert('O03 confirm 打开', !!confirmPanel);
    assert('O03 confirm 焦点在取消动作', document.activeElement && document.activeElement.getAttribute('data-action') === 'cancel',
      document.activeElement && document.activeElement.getAttribute('data-action'));
    assert('O03 confirm 无标题栏关闭按钮', !confirmPanel.querySelector('.nui-dialog__close'));
    var dangerConfirm = confirmPanel.querySelector('[data-action="confirm"]');
    assert('O03 confirm danger 样式类', !!dangerConfirm && dangerConfirm.classList.contains('nui-dialog__action--danger'));
    assert('O03 confirm 模态锁滚动', document.body.style.overflow === 'hidden');
    pressEscape();
    var falseResult = await confirmFalse;
    await wait(20);
    assert('O03 confirm Esc 返回 false', falseResult === false);
    assert('O03 confirm 关闭恢复焦点', document.activeElement === prior);
    assert('O03 confirm 关闭后 body 无标记', bodyMarkers() === 0 && document.body.style.overflow === 'auto');
    assert('O03 confirm 关闭后无遮罩', topbackdrops().length === 0);

    /* confirm: true */
    prior.focus();
    var confirmCalls = 0;
    var confirmTrue = global.NoteUI.Dialog.confirm({
      title: '保存更改？',
      content: '确认返回 true。',
      confirmLabel: '保存',
      cancelLabel: '取消',
      onConfirm: function () { confirmCalls += 1; return true; }
    });
    await wait(15);
    var truePanels = visiblePanels('.nui-dialog__panel');
    var truePanel = truePanels[truePanels.length - 1];
    var confirmButton = truePanel.querySelector('[data-action="confirm"]');
    assert('O03 confirm 确认按钮存在', !!confirmButton);
    clickTarget(confirmButton);
    var trueResult = await confirmTrue;
    await wait(20);
    assert('O03 confirm 确认返回 true', trueResult === true);
    assert('O03 confirm onConfirm 调用一次', confirmCalls === 1);
    assert('O03 confirm 确认后恢复焦点', document.activeElement === prior);
    assert('O03 confirm 确认后无可见对话框', visiblePanels('.nui-dialog__panel').length === 0 && topbackdrops().length === 0 && bodyMarkers() === 0);

    /* confirm: onConfirm false keeps open */
    prior.focus();
    var confirmKeep = global.NoteUI.Dialog.confirm({
      title: '校验未通过',
      content: 'onConfirm 返回 false 时保持打开。',
      confirmLabel: '重试',
      onConfirm: function () { return false; }
    });
    await wait(15);
    var keepPanel = visiblePanels('.nui-dialog__panel').slice(-1)[0];
    clickTarget(keepPanel.querySelector('[data-action="confirm"]'));
    await wait(25);
    assert('O03 confirm onConfirm=false 保持打开', visible(keepPanel));
    pressEscape();
    var keepResult = await confirmKeep;
    await wait(20);
    assert('O03 confirm 返回 false 后清理', keepResult === false && bodyMarkers() === 0);

    /* confirm: async disables actions */
    prior.focus();
    var asyncResolve;
    var asyncConfirm = global.NoteUI.Dialog.confirm({
      title: '异步确认',
      content: '等待期间动作禁用。',
      confirmLabel: '继续',
      onConfirm: function () {
        return new Promise(function (resolve) { asyncResolve = resolve; });
      }
    });
    await wait(15);
    var asyncPanel = visiblePanels('.nui-dialog__panel').slice(-1)[0];
    var asyncButton = asyncPanel.querySelector('[data-action="confirm"]');
    clickTarget(asyncButton);
    await wait(10);
    assert('O03 异步确认时动作禁用', asyncButton.disabled === true);
    asyncResolve(true);
    var asyncResult = await asyncConfirm;
    await wait(20);
    assert('O03 异步确认返回 true', asyncResult === true);
    assert('O03 异步确认后恢复焦点', document.activeElement === prior);

    /* program update open:false is silent */
    var silentCloses = 0;
    var silent = global.NoteUI.Dialog.mount(host, {
      title: '静默更新',
      content: '内容',
      onClose: function () { silentCloses += 1; }
    });
    silent.open();
    await wait(10);
    silent.update({ open: false });
    await wait(10);
    assert('O03 程序 update 关闭不触发 onClose', !silent.isOpen() && silentCloses === 0);
    silent.open();
    await wait(10);
    silent.close('api');
    await wait(10);
    assert('O03 API close 触发一次 onClose', silentCloses === 1, String(silentCloses));
    silent.destroy();

    /* destroy while open */
    var destroyReasons = [];
    var destroyDialog = global.NoteUI.Dialog.mount(host, {
      title: '销毁',
      content: '销毁内容',
      open: true,
      onClose: function (reason) { destroyReasons.push(reason); }
    });
    await wait(10);
    destroyDialog.destroy();
    await wait(10);
    assert('O03 destroy 打开中对话框触发 onClose(destroy)', destroyReasons.indexOf('destroy') >= 0, destroyReasons.join(','));
    assert('O03 destroy 后焦点不被抢', document.activeElement === document.body || document.activeElement === other);
    assert('O03 destroy 后与滚动锁恢复', document.body.style.overflow === 'auto');

    /* node content: no automatic describedby */
    var nodeContent = make('div', '', '节点内容');
    var nodeDialog = global.NoteUI.Dialog.mount(host, {
      title: '节点内容',
      content: nodeContent,
      open: true
    });
    await wait(10);
    assert('O03 节点内容默认不 aria-describedby', !nodeDialog.getPanel().hasAttribute('aria-describedby'));
    nodeDialog.close('api');
    await wait(10);
    nodeDialog.destroy();

    /* host DOM actions are moved in, not auto-closed */
    var domAction = button('宿主动作', null);
    var domClosed = 0;
    var domDialog = global.NoteUI.Dialog.mount(host, {
      title: '宿主 DOM',
      content: '宿主提供 DOM actions。',
      actions: [domAction],
      open: true,
      onClose: function () { domClosed += 1; }
    });
    await wait(10);
    assert('O03 宿主 DOM action 被移入面板', domDialog.getPanel().contains(domAction));
    clickTarget(domAction);
    await wait(10);
    assert('O03 宿主 DOM action 不自动关闭', domDialog.isOpen());
    domDialog.close('api');
    await wait(10);
    assert('O03 宿主 DOM dialog 关闭回调一次', domClosed === 1);
    domDialog.destroy();

    var LegacyButton = global.NoteUI.Button;
    var fallbackDialog = null;
    try {
      global.NoteUI.Button = null;
      fallbackDialog = global.NoteUI.Dialog.mount(host, {
        title: '无 legacy 动作',
        content: '动作按钮应回退为原生按钮。',
        actions: [{ label: '关闭', close: true }],
        open: true
      });
      await wait(15);
      var fallbackPanel = fallbackDialog.getPanel();
      var fallbackButton = findByText(fallbackPanel, '关闭');
      assert('O03 无 legacy 时动作降级为原生按钮',
        !!fallbackButton && fallbackButton.tagName === 'BUTTON' &&
        fallbackButton.classList.contains('nui-dialog__action') &&
        fallbackButton.classList.contains('nui-button--secondary'));
      clickTarget(fallbackButton);
      await wait(15);
      assert('O03 降级动作仍可关闭对话框', !fallbackDialog.isOpen());
    } finally {
      if (fallbackDialog) fallbackDialog.destroy();
      global.NoteUI.Button = LegacyButton;
    }

    var longDialog = global.NoteUI.Dialog.mount(host, {
      title: '长内容对话框',
      content: longText('长内容对话框'),
      actions: [{ label: '关闭', close: true }],
      open: true
    });
    await wait(15);
    var longPanel = longDialog.getPanel();
    var longContent = longPanel.querySelector('.nui-dialog__content');
    assert('O03 长内容对话框在视口内', withinViewport(rectOf(longPanel)));
    assert('O03 长内容区可滚动', longContent.scrollHeight > longContent.clientHeight + 2, longContent.scrollHeight + '/' + longContent.clientHeight);
    assert('O03 长内容时标题与动作仍可见', visible(longPanel.querySelector('.nui-dialog__header')) && visible(longPanel.querySelector('.nui-dialog__footer')));
    pressEscape();
    await wait(15);
    longDialog.destroy();

    var sizeDialog = global.NoteUI.Dialog.mount(host, {
      title: '尺寸对话框',
      content: '尺寸测试内容',
      size: 'md',
      open: true
    });
    await wait(15);
    var mdWidth = rectOf(sizeDialog.getPanel()).width;
    sizeDialog.update({ size: 'lg' });
    await wait(15);
    var lgWidth = rectOf(sizeDialog.getPanel()).width;
    assert('O03 size 预设 lg 生效', lgWidth > mdWidth + 100, mdWidth + ' -> ' + lgWidth);
    sizeDialog.update({ size: 480 });
    await wait(15);
    var customWidth = rectOf(sizeDialog.getPanel()).width;
    assert('O03 size 自定义长度生效', Math.abs(customWidth - 480) <= 2, 'w=' + customWidth);
    sizeDialog.close('api');
    await wait(15);
    sizeDialog.destroy();

    dialog.destroy();
    await wait(10);
    assert('O03 destroy 后无可见对话框', visiblePanels('.nui-dialog__panel').length === 0);
  }

  /* --------------------------------------------------------------- O04 */

  async function testDrawer() {
    document.body.style.overflow = 'auto';
    var host = fixture();
    var opener = button('打开右侧抽屉', host);
    var openerLeft = button('打开左侧抽屉', host);
    var closes = [];
    var right = global.NoteUI.Drawer.mount(host, {
      side: 'right',
      title: '右侧抽屉',
      content: longText('右侧内容'),
      footer: '页脚说明文字',
      size: 420,
      actions: [{ label: '关闭', close: true }],
      onClose: function (reason) { closes.push(reason); }
    });
    opener.addEventListener('click', function () { right.open(); });
    clickTarget(opener);
    await wait(15);
    var panel = right.getPanel();
    var pr = rectOf(panel);
    assert('O04 右侧抽屉可见', visible(panel));
    assert('O04 role=dialog', panel.getAttribute('role') === 'dialog');
    assert('O04 aria-modal=true', panel.getAttribute('aria-modal') === 'true');
    assert('O04 右侧保留核心 8px 视口安全边距', Math.abs(pr.right - (global.innerWidth - 8)) <= 2, 'right=' + pr.right + ' vw=' + global.innerWidth);
    assert('O04 顶部保留核心 8px 视口安全边距', Math.abs(pr.top - 8) <= 2, 'top=' + pr.top);
    assert('O04 高度使用视口高度减安全边距', Math.abs(pr.height - (global.innerHeight - 16)) <= 2, 'h=' + pr.height + ' vh=' + global.innerHeight);
    assert('O04 打开时焦点在面板内', panel.contains(document.activeElement));
    var drawerFocusables = global.NoteCore.focusables(panel);
    var drawerFirst = drawerFocusables[0];
    var drawerLast = drawerFocusables[drawerFocusables.length - 1];
    drawerFirst.focus();
    keyOnActive('Tab', { shiftKey: true });
    assert('O04 Shift+Tab 在抽屉内循环到末个', document.activeElement === drawerLast);
    keyOnActive('Tab');
    assert('O04 Tab 在抽屉内循环到首个', document.activeElement === drawerFirst);
    assert('O04 模态锁 body 滚动', document.body.style.overflow === 'hidden');
    assert('O04 创建遮罩', topbackdrops().length === 1);
    var content = panel.querySelector('.nui-drawer__content');
    assert('O04 内容区可滚动', content.scrollHeight > content.clientHeight + 2, content.scrollHeight + '/' + content.clientHeight);
    var header = panel.querySelector('.nui-drawer__header');
    var footer = panel.querySelector('.nui-drawer__footer');
    var headerTop = rectOf(header).top;
    content.scrollTop = 120;
    await wait(10);
    assert('O04 内容滚动时标题固定', rectOf(header).top === headerTop);
    assert('O04 页脚存在且可见', visible(footer) && footer.textContent.indexOf('页脚说明文字') >= 0);
    assert('O04 标题通过 aria-labelledby 关联', !!panel.getAttribute('aria-labelledby') && !!document.getElementById(panel.getAttribute('aria-labelledby')));

    pressEscape();
    await wait(15);
    assert('O04 Esc 关闭', !right.isOpen());
    assert('O04 关闭上报 esc', closes.indexOf('esc') >= 0, closes.join(','));
    assert('O04 关闭恢复焦点', document.activeElement === opener);
    assert('O04 关闭恢复 body overflow', document.body.style.overflow === 'auto');
    assert('O04 关闭移除遮罩', topbackdrops().length === 0);

    var left = global.NoteUI.Drawer.mount(host, {
      side: 'left',
      title: '左侧抽屉',
      content: longText('左侧内容'),
      size: 380,
      closeOnOutside: true,
      actions: [{ label: '关闭', close: true }]
    });
    openerLeft.addEventListener('click', function () { left.open(); });
    clickTarget(openerLeft);
    await wait(15);
    var lp = rectOf(left.getPanel());
    assert('O04 左侧保留核心 8px 视口安全边距', Math.abs(lp.left - 8) <= 2, 'left=' + lp.left);
    assert('O04 左侧宽度接近 380', Math.abs(lp.width - 380) <= 2, 'w=' + lp.width);
    left.close('api');
    await wait(15);
    assert('O04 左侧 API 关闭恢复焦点', document.activeElement === openerLeft);

    clickTarget(opener);
    await wait(15);
    pointerDown(topbackdrops()[0]);
    await wait(15);
    assert('O04 默认外点不关闭', right.isOpen());
    right.close('api');
    await wait(15);

    clickTarget(openerLeft);
    await wait(15);
    pointerDown(topbackdrops()[0]);
    await wait(15);
    assert('O04 closeOnOutside=true 时外点关闭', !left.isOpen());
    assert('O04 外点关闭恢复焦点', document.activeElement === openerLeft);

    /* side change applies on next open */
    clickTarget(opener);
    await wait(15);
    var rightPanel = right.getPanel();
    right.update({ side: 'left' });
    await wait(10);
    assert('O04 打开期间 side 不变', rectOf(rightPanel).right > global.innerWidth / 2);
    right.close('api');
    await wait(15);
    right.open();
    await wait(15);
    var newPanel = right.getPanel();
    assert('O04 再次打开应用新侧边', Math.abs(rectOf(newPanel).left - 8) <= 2, 'left=' + rectOf(newPanel).left);
    right.update({
      footer: '更新后的页脚',
      actions: [{ label: '新动作', close: true }],
      size: 500
    });
    await wait(15);
    assert('O04 update 页脚', newPanel.querySelector('.nui-drawer__footer').textContent.indexOf('更新后的页脚') >= 0);
    assert('O04 update size 生效', Math.abs(rectOf(newPanel).width - 500) <= 2, 'w=' + rectOf(newPanel).width);
    var newAction = findByText(newPanel, '新动作');
    assert('O04 update 动作', !!newAction);
    clickTarget(newAction);
    await wait(15);
    assert('O04 更新后的动作关闭', !right.isOpen());

    /* nested drawers and scroll lock refcount */
    clickTarget(opener);
    await wait(15);
    clickTarget(openerLeft);
    await wait(15);
    assert('O04 两个抽屉可同时打开', right.isOpen() && left.isOpen());
    assert('O04 嵌套时 body 仍锁定', document.body.style.overflow === 'hidden');
    pressEscape();
    await wait(15);
    assert('O04 Esc 只关最上层抽屉', !left.isOpen() && right.isOpen());
    assert('O04 关闭上层后仍锁定', document.body.style.overflow === 'hidden');
    pressEscape();
    await wait(15);
    assert('O04 关闭最后一个抽屉后解锁', !right.isOpen() && document.body.style.overflow === 'auto');

    /* program update close is silent */
    var silentDrawerCloses = 0;
    var silentDrawer = global.NoteUI.Drawer.mount(host, {
      title: '静默抽屉',
      content: '静默关闭内容',
      onClose: function () { silentDrawerCloses += 1; }
    });
    silentDrawer.open();
    await wait(15);
    silentDrawer.update({ open: false });
    await wait(15);
    assert('O04 程序 update 关闭不触发 onClose', !silentDrawer.isOpen() && silentDrawerCloses === 0);
    assert('O04 静默关闭恢复滚动锁', document.body.style.overflow === 'auto');
    silentDrawer.destroy();

    /* destroy while open */
    right.open();
    await wait(15);
    right.destroy();
    await wait(15);
    assert('O04 destroy 打开中抽屉后解锁', document.body.style.overflow === 'auto');
    assert('O04 destroy 后无可见抽屉', visiblePanels('.nui-drawer__panel').length === 0);
    left.destroy();
  }

  /* ------------------------------------------------------------- nesting */

  async function testNestedLayers() {
    var host = fixture();
    var popTrigger;
    var pop = global.NoteUI.Popover.mount(host, {
      triggerLabel: '父层',
      content: '父层内容',
      label: '父层'
    });
    popTrigger = pop.getTrigger();
    var closes = [];
    var dialog = global.NoteUI.Dialog.mount(host, {
      title: '子对话框',
      content: '子层内容',
      closeOnOutside: true,
      onClose: function (reason) { closes.push(reason); }
    });

    clickTarget(popTrigger);
    await wait(10);
    dialog.open();
    await wait(15);
    assert('嵌套层：父 Popover 与子 Dialog 同时打开', pop.isOpen() && dialog.isOpen());
    pressEscape();
    await wait(15);
    assert('嵌套层：Esc 只关闭子 Dialog', !dialog.isOpen() && pop.isOpen());
    assert('嵌套层：子层关闭焦点返回父层触发器', document.activeElement === popTrigger,
      document.activeElement && document.activeElement.tagName);
    pressEscape();
    await wait(15);
    assert('嵌套层：再 Esc 关闭父 Popover', !pop.isOpen());

    clickTarget(popTrigger);
    await wait(10);
    dialog.open();
    await wait(15);
    pointerDown(document.body);
    await wait(15);
    assert('嵌套层：外点只关闭最上层 Dialog', !dialog.isOpen() && pop.isOpen());
    pointerDown(document.body);
    await wait(15);
    assert('嵌套层：再次外点关闭父 Popover', !pop.isOpen());

    pop.destroy();
    dialog.destroy();
  }

  /* ------------------------------------------------------------ narrow */

  async function testNarrow() {
    var host = fixture();
    var dialog = global.NoteUI.Dialog.mount(host, {
      title: '窄屏对话框标题',
      content: '窄屏内容应保持可读，不出现横向溢出。' + '长文本。'.repeat(30),
      actions: [{ label: '取消', close: true }, { label: '保存', variant: 'primary', close: true }],
      open: true
    });
    await wait(15);
    var dp = rectOf(dialog.getPanel());
    assert('窄屏：Dialog 在视口内', dp.left >= -1 && dp.right <= global.innerWidth + 1, JSON.stringify(dp));
    assert('窄屏：Dialog 接近可用宽度', dp.width >= global.innerWidth - 40, 'w=' + dp.width + ' vw=' + global.innerWidth);
    dialog.close('api');
    await wait(10);
    dialog.destroy();

    var drawer = global.NoteUI.Drawer.mount(host, {
      side: 'right',
      title: '窄屏抽屉',
      content: longText('窄屏抽屉内容'),
      footer: '窄屏页脚',
      actions: [{ label: '关闭', close: true }],
      open: true
    });
    await wait(15);
    var panel = drawer.getPanel();
    var pr = rectOf(panel);
    assert('窄屏：Drawer 接近全宽', pr.width >= global.innerWidth - 24, 'w=' + pr.width + ' vw=' + global.innerWidth);
    assert('窄屏：Drawer 保留 8px 安全边距', Math.abs(pr.left - 8) <= 2 && Math.abs(pr.right - (global.innerWidth - 8)) <= 2, JSON.stringify(pr));
    assert('窄屏：Drawer 不越界', pr.left >= -1 && pr.right <= global.innerWidth + 1, JSON.stringify(pr));
    assert('窄屏：Drawer 无横向溢出', panel.scrollWidth <= panel.clientWidth + 1, panel.scrollWidth + '/' + panel.clientWidth);
    assert('窄屏：标题可见', visible(panel.querySelector('.nui-drawer__title')));
    var content = panel.querySelector('.nui-drawer__content');
    assert('窄屏：内容区可滚动', content.scrollHeight > content.clientHeight + 2);
    var actions = panel.querySelector('.nui-drawer__actions');
    assert('窄屏：动作行可见', visible(actions));
    drawer.close('api');
    await wait(10);
    drawer.destroy();

    var popHost = fixture();
    var pop = global.NoteUI.Popover.mount(popHost, {
      triggerLabel: '窄屏弹出说明',
      content: '窄屏 Popover 不应越出视口。',
      placement: 'bottom-start'
    });
    pop.open();
    await wait(15);
    var pp = rectOf(pop.getPanel());
    assert('窄屏：Popover 在视口内', pp.left >= -1 && pp.right <= global.innerWidth + 1, JSON.stringify(pp));
    pop.close('api');
    await wait(10);
    pop.destroy();
  }

  /* ------------------------------------------------------------- demos */

  async function testDemos() {
    var ids = ['O01', 'O02', 'O03', 'O04'];
    ids.forEach(function (id) {
      assert('Demo ' + id + ' 已注册', typeof global.NoteGalleryDemos === 'object' && typeof global.NoteGalleryDemos[id] === 'function');
    });

    var host1 = fixture();
    var d1 = global.NoteGalleryDemos.O01(host1);
    await wait(20);
    var trigger1 = host1.querySelector('.nui-tooltip__trigger');
    assert('Demo O01 真实挂载触发器', !!trigger1);
    if (trigger1) {
      hoverIn(trigger1);
      await wait(220);
      assert('Demo O01 悬停显示轻提示', visiblePanels('.nui-tooltip__panel').length > 0);
    }
    d1.destroy();
    await wait(25);
    assert('Demo O01 destroy 后无浮层残留', countFloatingRoots() === 0 && topbackdrops().length === 0);
    host1.remove();

    var host2 = fixture();
    var d2 = global.NoteGalleryDemos.O02(host2);
    await wait(20);
    var trigger2 = host2.querySelector('.nui-popover__trigger');
    assert('Demo O02 真实挂载触发器', !!trigger2);
    if (trigger2) {
      clickTarget(trigger2);
      await wait(20);
      assert('Demo O02 点击打开', visiblePanels('.nui-popover__panel').length > 0);
      var help = findByText(host2, '更多帮助');
      if (help) {
        clickTarget(help);
        await wait(20);
        assert('Demo O02 嵌套子层打开', visiblePanels('.nui-popover__panel').length === 2);
        pressEscape();
        await wait(15);
        pressEscape();
        await wait(15);
      }
    }
    d2.destroy();
    await wait(25);
    assert('Demo O02 destroy 后无浮层残留', countFloatingRoots() === 0 && topbackdrops().length === 0);
    host2.remove();

    var host3 = fixture();
    var d3 = global.NoteGalleryDemos.O03(host3);
    await wait(20);
    var openDialogButton = findByText(host3, '打开对话框');
    assert('Demo O03 真实挂载打开按钮', !!openDialogButton);
    if (openDialogButton) {
      clickTarget(openDialogButton);
      await wait(20);
      assert('Demo O03 打开对话框', visiblePanels('.nui-dialog__panel').length > 0);
      pressEscape();
      await wait(20);
      assert('Demo O03 Esc 关闭对话框', visiblePanels('.nui-dialog__panel').length === 0);
    }
    var confirmButton = findByText(host3, '打开确认框');
    if (confirmButton) {
      clickTarget(confirmButton);
      await wait(25);
      assert('Demo O03 打开确认框', visiblePanels('.nui-dialog__panel').length > 0);
    }
    d3.destroy();
    assert('Demo O03 destroy 同步移除确认框宿主标记', bodyMarkers() === 0);
    await wait(25);
    assert('Demo O03 destroy 后无浮层残留', countFloatingRoots() === 0 && topbackdrops().length === 0);
    assert('Demo O03 destroy 后 body 无确认框标记', bodyMarkers() === 0);
    assert('Demo O03 destroy 后滚动锁恢复', document.body.style.overflow !== 'hidden');
    host3.remove();

    var host4 = fixture();
    var d4 = global.NoteGalleryDemos.O04(host4);
    await wait(20);
    var openRight = findByText(host4, '打开右侧抽屉');
    assert('Demo O04 真实挂载打开按钮', !!openRight);
    if (openRight) {
      clickTarget(openRight);
      await wait(25);
      assert('Demo O04 打开右侧抽屉', visiblePanels('.nui-drawer__panel').length > 0);
      assert('Demo O04 抽屉打开时锁滚动', document.body.style.overflow === 'hidden');
    }
    d4.destroy();
    await wait(30);
    assert('Demo O04 destroy 后无浮层残留', countFloatingRoots() === 0 && topbackdrops().length === 0);
    assert('Demo O04 destroy 后滚动锁恢复', document.body.style.overflow !== 'hidden');
    host4.remove();
  }

  async function run() {
    var start = results.length;
    cleanup();
    await wait(10);
    await runCase('O01', testTooltipCore);
    await runCase('O01-edge', testTooltipEdges);
    await runCase('O02', testPopover);
    await runCase('O03', testDialog);
    await runCase('O04', testDrawer);
    await runCase('nested', testNestedLayers);
    cleanup();
    await wait(10);
    return results.slice(start);
  }

  async function runNarrow() {
    var start = results.length;
    cleanup();
    await wait(10);
    await runCase('O03-narrow', testNarrow);
    cleanup();
    await wait(10);
    return results.slice(start);
  }

  async function runDemos() {
    var start = results.length;
    cleanup();
    await wait(10);
    await runCase('demos', testDemos);
    cleanup();
    await wait(10);
    assert('全部用例后 body 无浮层残留', countFloatingRoots() === 0 && topbackdrops().length === 0);
    assert('全部用例后 body 无临时标记残留', bodyMarkers() === 0);
    return results.slice(start);
  }

  global.OverlaySuite = {
    run: run,
    runNarrow: runNarrow,
    runDemos: runDemos,
    results: results
  };
})(window);
