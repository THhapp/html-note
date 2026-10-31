import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { moduleScripts, moduleStyles } from '../lib/src-sources.mjs';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const MODULES = ['core', 'ui-navigation', 'ui-extended'];
const HARNESS_STYLE = 'html,body{margin:0;padding:0}body{padding:24px;background:#f4f6f9;font-family:"Segoe UI","Microsoft YaHei UI",sans-serif}'
  + '.check-section{margin-bottom:24px;padding:16px;background:#fff;border:1px solid #dce2ea;border-radius:10px}'
  + '.check-row{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:8px 0}'
  + '.check-narrow{width:320px;max-width:100%}';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ::  ' + detail : ''}`);
}
function equal(name, actual, expected) {
  check(name, Object.is(actual, expected), `actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
}

const browser = await chromium.launch({ executablePath: edge, headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
// 直接按 manifest 加载 src，替代旧 extended-harness.html 夹具，navigation/extended 拆分后无需同步。
await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>' + HARNESS_STYLE + '</style></head><body><main id="app"></main></body></html>');
for (const file of moduleStyles(root, MODULES)) await page.addStyleTag({ path: path.join(root, file) });
for (const file of moduleScripts(root, MODULES)) await page.addScriptTag({ path: path.join(root, file) });

async function newSection(id) {
  await page.evaluate((sectionId) => {
    const el = document.createElement('section');
    el.id = sectionId;
    el.className = 'check-section';
    document.querySelector('#app').appendChild(el);
    window.__checkInstances = window.__checkInstances || {};
    window.__checkInstances[sectionId] = [];
  }, id);
}
async function cleanup(id) {
  await page.evaluate((sectionId) => {
    const list = window.__checkInstances[sectionId] || [];
    list.forEach((instance) => {
      try { if (instance && typeof instance.destroy === 'function') instance.destroy(); } catch (error) {}
    });
    window.__checkInstances[sectionId] = [];
    const section = document.getElementById(sectionId);
    if (section) section.remove();
  }, id);
  await page.waitForTimeout(30);
  const layers = await page.locator('.hnv-floating').count();
  return layers;
}
async function register(id, name, instance) {
  await page.evaluate(({ sectionId, key }) => {
    window.__checkInstances[sectionId].push(window.__instances[key]);
  }, { sectionId: id, key: name });
}
async function leftover(name) {
  const count = await page.locator('.hnv-floating').count();
  equal(name + ': no floating layer remains', count, 0);
}

/* Loaded API surface */
const api = await page.evaluate(() => ({
  Avatar: !!(window.NoteUI && NoteUI.Avatar && NoteUI.Avatar.mount),
  Carousel: !!(NoteUI && NoteUI.Carousel && NoteUI.Carousel.mount),
  Rating: !!(NoteUI && NoteUI.Rating && NoteUI.Rating.mount),
  Cascader: !!(NoteUI && NoteUI.Cascader && NoteUI.Cascader.mount),
  TreeSelect: !!(NoteUI && NoteUI.TreeSelect && NoteUI.TreeSelect.mount),
  TransferList: !!(NoteUI && NoteUI.TransferList && NoteUI.TransferList.mount),
  CommandPalette: !!(NoteUI && NoteUI.CommandPalette && NoteUI.CommandPalette.mount),
  TreeView: !!(NoteUI && NoteUI.TreeView && NoteUI.TreeView.mount),
  floating: !!(window.NoteCore && NoteCore.floating)
}));
check('X01–X07 APIs loaded', Object.values(api).every(Boolean), JSON.stringify(api));

/* ----------------------------------------------------------------------- */
/* X01 Avatar                                                               */
/* ----------------------------------------------------------------------- */
await newSection('x1');
await page.evaluate(() => {
  const host = document.getElementById('x1');
  const svg = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#315cda"/></svg>');
  window.__instances = window.__instances || {};
  window.__x1Valid = NoteUI.Avatar.mount(host, {
    src: svg,
    alt: 'Ada 的替代文本',
    name: 'Ada Lovelace',
    caption: 'Ada Lovelace · 很长很长的研究成员说明',
    size: 'lg',
    tone: 'accent'
  });
  window.__x1Broken = NoteUI.Avatar.mount(host, {
    src: 'data:image/png;base64,AAAA',
    name: 'Broken Person',
    caption: true
  });
  window.__x1Group = NoteUI.Avatar.mount(host, {
    groupLabel: '参与成员',
    max: 3,
    items: [
      { name: 'Ada Lovelace' }, { name: 'Grace Hopper' }, { name: 'Alan Turing' },
      { name: 'Katherine Johnson' }, { name: 'Edsger Dijkstra' }
    ]
  });
  window.__checkInstances.x1.push(window.__x1Valid, window.__x1Broken, window.__x1Group);
});
await page.waitForTimeout(450);
const x1 = await page.evaluate(() => {
  const valid = document.querySelector('#x1 .nui-avatar img');
  const brokenRoot = document.querySelectorAll('#x1 .nui-avatar')[1];
  const group = document.querySelector('#x1 .nui-avatar-group');
  return {
    validAlt: valid ? valid.getAttribute('alt') : null,
    validCaption: document.querySelector('#x1 .nui-avatar__caption')?.textContent || '',
    brokenHasImage: !!brokenRoot?.querySelector('img'),
    brokenFrameRole: brokenRoot?.querySelector('.nui-avatar__frame')?.getAttribute('role') || '',
    brokenLabel: brokenRoot?.querySelector('.nui-avatar__frame')?.getAttribute('aria-label') || '',
    brokenInitials: brokenRoot?.querySelector('.nui-avatar__fallback')?.textContent || '',
    groupItems: group ? group.querySelectorAll('.nui-avatar__group-item').length : -1,
    overflow: group?.querySelector('.nui-avatar__overflow')?.textContent || '',
    groupLabel: group?.getAttribute('aria-label') || ''
  };
});
equal('X01 image carries alt text', x1.validAlt, 'Ada 的替代文本');
check('X01 caption is present', x1.validCaption.includes('Ada Lovelace'), x1.validCaption);
check('X01 failed image falls back without img', !x1.brokenHasImage && x1.brokenFrameRole === 'img' && x1.brokenInitials.length > 0, JSON.stringify(x1));
check('X01 failed image accessible fallback name', x1.brokenLabel.includes('Broken Person'), x1.brokenLabel);
equal('X01 group max + overflow count', x1.overflow, '+2');
equal('X01 group renders max items plus overflow slot', x1.groupItems, 4);
check('X01 group label reports hidden count', /另有 2 项/.test(x1.groupLabel), x1.groupLabel);
await page.evaluate(() => {
  window.__x1Valid.update({ name: 'New Name', src: 'data:image/png;base64,AAAA' });
});
await page.waitForTimeout(300);
const x1Updated = await page.evaluate(() => ({
  text: document.querySelector('#x1 .nui-avatar')?.textContent || '',
  img: !!document.querySelector('#x1 .nui-avatar img'),
  role: document.querySelector('#x1 .nui-avatar__frame')?.getAttribute('role') || ''
}));
check('X01 update re-renders image and falls back', x1Updated.img === false && x1Updated.role === 'img', JSON.stringify(x1Updated));
const x1Layers = await cleanup('x1');
equal('X01 cleanup leaves no floating layers', x1Layers, 0);

/* ----------------------------------------------------------------------- */
/* X02 Carousel                                                             */
/* ----------------------------------------------------------------------- */
await newSection('x2');
await page.evaluate(() => {
  const host = document.getElementById('x2');
  window.__carouselChanges = [];
  function slide(label, buttonId) {
    const d = document.createElement('div');
    const p = document.createElement('p');
    p.textContent = label + ' 内容，足够长的说明用于检查窄容器换行。';
    const b = document.createElement('button');
    b.id = buttonId;
    b.type = 'button';
    b.textContent = '内容按钮 ' + label;
    d.append(p, b);
    return d;
  }
  window.__carousel = NoteUI.Carousel.mount(host, {
    label: '学习内容轮播',
    items: [
      { id: 'a', label: '第一页', content: slide('第一页', 'slide-a-button') },
      { id: 'b', label: '第二页', content: slide('第二页', 'slide-b-button') },
      { id: 'c', label: '第三页', content: slide('第三页', 'slide-c-button') }
    ],
    onChange: (index, event) => window.__carouselChanges.push({ index, type: event ? event.type : null })
  });
  window.__checkInstances.x2.push(window.__carousel);
});
await page.waitForTimeout(1200);
const x2Initial = await page.evaluate(() => {
  const root = document.querySelector('#x2 .nui-carousel');
  const slides = Array.from(root.querySelectorAll('.nui-carousel__slide'));
  const hiddenButton = document.getElementById('slide-b-button');
  hiddenButton.focus();
  return {
    index: window.__carousel.getValue(),
    changes: window.__carouselChanges.slice(),
    active: slides.filter((s) => s.classList.contains('is-active')).length,
    inert: slides.filter((s) => s.hasAttribute('inert')).length,
    hidden: slides.filter((s) => s.getAttribute('aria-hidden') === 'true').length,
    hiddenFocusBlocked: document.activeElement !== hiddenButton,
    counter: root.querySelector('.nui-carousel__counter').textContent,
    autoHidden: root.querySelector('.nui-carousel__autoplay').hidden
  };
});
equal('X02 default auto is off', x2Initial.index, 0);
equal('X02 default auto makes no onChange after wait', x2Initial.changes.length, 0);
equal('X02 only one active slide', x2Initial.active, 1);
equal('X02 hidden slides are aria-hidden', x2Initial.hidden, 2);
equal('X02 hidden slides are inert', x2Initial.inert, 2);
check('X02 hidden slide content cannot take focus', x2Initial.hiddenFocusBlocked);
check('X02 current position is visible', /1\s*\/\s*3/.test(x2Initial.counter), x2Initial.counter);
check('X02 autoplay control hidden by default', x2Initial.autoHidden === true, String(x2Initial.autoHidden));

await page.locator('#x2 .nui-carousel__step').nth(1).click();
await page.waitForTimeout(50);
const x2Next = await page.evaluate(() => ({
  value: window.__carousel.getValue(),
  changes: window.__carouselChanges.slice(),
  currentDot: document.querySelector('#x2 .nui-carousel__dot[aria-current="true"]')?.getAttribute('data-carousel-index'),
  live: document.querySelector('#x2 .nui-carousel__live')?.textContent || ''
}));
equal('X02 next button changes index', x2Next.value, 1);
equal('X02 next button emits onChange(index,event)', x2Next.changes[0]?.index, 1);
equal('X02 next button onChange event is a click', x2Next.changes[0]?.type, 'click');
equal('X02 clickable dot reflects current', x2Next.currentDot, '1');
check('X02 live region announces slide', /第 2 张/.test(x2Next.live), x2Next.live);

await page.locator('#x2 .nui-carousel').focus();
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(40);
equal('X02 ArrowRight moves next', await page.evaluate(() => window.__carousel.getValue()), 2);
await page.keyboard.press('Home');
await page.waitForTimeout(40);
equal('X02 Home moves first', await page.evaluate(() => window.__carousel.getValue()), 0);
await page.keyboard.press('End');
await page.waitForTimeout(40);
equal('X02 End moves last', await page.evaluate(() => window.__carousel.getValue()), 2);
await page.locator('#x2 .nui-carousel__button[data-carousel-action="prev"]').click();
await page.waitForTimeout(30);
equal('X02 previous button moves back', await page.evaluate(() => window.__carousel.getValue()), 1);
await page.locator('#x2 .nui-carousel__dot').nth(0).click();
await page.waitForTimeout(30);
equal('X02 dot can navigate', await page.evaluate(() => window.__carousel.getValue()), 0);
const beforeUpdateCount = await page.evaluate(() => window.__carouselChanges.length);
await page.evaluate(() => {
  window.__carousel.update({
    items: [
      { label: '替换一', content: '替换后内容一' },
      { label: '替换二', content: '替换后内容二' }
    ]
  });
});
const x2Updated = await page.evaluate(() => ({
  count: window.__carouselChanges.length,
  slides: document.querySelectorAll('#x2 .nui-carousel__slide').length,
  text: document.querySelector('#x2 .nui-carousel__slide.is-active')?.textContent || '',
  value: window.__carousel.getValue()
}));
equal('X02 program update is silent', x2Updated.count, beforeUpdateCount);
equal('X02 update replaces content', x2Updated.slides, 2);
check('X02 updated active content readable', x2Updated.text.includes('替换后内容一'), x2Updated.text);
equal('X02 cleanup floating layers', await cleanup('x2'), 0);

await newSection('x2auto');
await page.mouse.move(5, 5);
await page.locator('body').click({ position: { x: 5, y: 5 } });
await page.evaluate(() => {
  const host = document.getElementById('x2auto');
  const buttons = [];
  window.__carouselAutoChanges = [];
  const items = [0, 1, 2].map((index) => {
    const p = document.createElement('p');
    p.textContent = '自动页 ' + (index + 1);
    return { label: '自动 ' + (index + 1), content: p };
  });
  window.__carouselAuto = NoteUI.Carousel.mount(host, {
    items,
    auto: true,
    interval: 1000,
    onChange: (index) => window.__carouselAutoChanges.push(index)
  });
  window.__checkInstances.x2auto.push(window.__carouselAuto);
});
await page.waitForTimeout(1250);
const autoStarted = await page.evaluate(() => window.__carouselAuto.getValue());
check('X02 explicit auto advances without focus/hover', autoStarted >= 1, String(autoStarted));
const box = await page.locator('#x2auto .nui-carousel').boundingBox();
await page.mouse.move(box.x + 20, box.y + 20);
await page.waitForTimeout(50);
const hoverStart = await page.evaluate(() => window.__carouselAuto.getValue());
await page.waitForTimeout(1200);
equal('X02 auto pauses on hover', await page.evaluate(() => window.__carouselAuto.getValue()), hoverStart);
await page.mouse.move(5, 5);
await page.locator('body').click({ position: { x: 5, y: 5 } });
await page.waitForTimeout(1250);
const resumed = await page.evaluate(() => window.__carouselAuto.getValue());
check('X02 auto resumes after pointer leaves', resumed !== hoverStart, `${hoverStart} -> ${resumed}`);
await page.locator('#x2auto .nui-carousel__step').nth(1).focus();
const focusStart = await page.evaluate(() => window.__carouselAuto.getValue());
await page.waitForTimeout(1200);
equal('X02 auto pauses on focus within', await page.evaluate(() => window.__carouselAuto.getValue()), focusStart);
await cleanup('x2auto');
await page.emulateMedia({ reducedMotion: 'reduce' });
await newSection('x2reduced');
await page.evaluate(() => {
  const host = document.getElementById('x2reduced');
  window.__carouselReduced = NoteUI.Carousel.mount(host, {
    items: [{ content: 'A' }, { content: 'B' }],
    auto: true,
    interval: 1000
  });
  window.__checkInstances.x2reduced.push(window.__carouselReduced);
});
await page.waitForTimeout(1250);
equal('X02 reduced motion prevents auto advance', await page.evaluate(() => window.__carouselReduced.getValue()), 0);
const reducedButton = await page.evaluate(() => {
  const b = document.querySelector('#x2reduced .nui-carousel__autoplay');
  return { hidden: b.hidden, disabled: b.disabled, label: b.getAttribute('aria-label') };
});
check('X02 reduced motion disables the auto control', reducedButton.hidden === false && reducedButton.disabled === true, JSON.stringify(reducedButton));
await cleanup('x2reduced');
await page.emulateMedia({ reducedMotion: 'no-preference' });

/* ----------------------------------------------------------------------- */
/* X03 Rating                                                               */
/* ----------------------------------------------------------------------- */
await newSection('x3');
await page.evaluate(() => {
  const host = document.getElementById('x3');
  window.__ratingChanges = [];
  window.__rating = NoteUI.Rating.mount(host, {
    value: 3,
    max: 5,
    label: '资料完整度',
    onChange: (value, event) => window.__ratingChanges.push({ value, type: event ? event.type : null })
  });
  window.__ratingReadonly = NoteUI.Rating.mount(host, { value: 4, readonly: true, label: '只读评分' });
  window.__checkInstances.x3.push(window.__rating, window.__ratingReadonly);
});
const x3Initial = await page.evaluate(() => {
  const root = document.querySelectorAll('#x3 .nui-rating')[0];
  const control = root.querySelector('[role="slider"]');
  return {
    role: control.getAttribute('role'),
    now: control.getAttribute('aria-valuenow'),
    max: control.getAttribute('aria-valuemax'),
    text: control.getAttribute('aria-valuetext'),
    filled: root.querySelectorAll('.nui-rating__star.is-filled').length,
    visibleValue: root.querySelector('.nui-rating__value').textContent
  };
});
equal('X03 value shown in aria-valuenow', x3Initial.now, '3');
check('X03 slider exposes min/max/text', x3Initial.role === 'slider' && x3Initial.max === '5' && x3Initial.text.includes('3 星'), JSON.stringify(x3Initial));
equal('X03 filled stars match value', x3Initial.filled, 3);
check('X03 numeric value is visible', x3Initial.visibleValue.includes('3 / 5'), x3Initial.visibleValue);
await page.locator('#x3 .nui-rating').first().locator('[data-rating-value="2"]').click();
await page.waitForTimeout(30);
const x3Click = await page.evaluate(() => ({ value: window.__rating.getValue(), changes: window.__ratingChanges.slice() }));
equal('X03 clicking a star sets value', x3Click.value, 2);
equal('X03 click emits onChange', x3Click.changes[0]?.value, 2);
await page.locator('#x3 .nui-rating').first().locator('[data-rating-value="2"]').click();
await page.waitForTimeout(30);
equal('X03 clicking current value clears with allowClear', await page.evaluate(() => window.__rating.getValue()), 0);
await page.locator('#x3 .nui-rating [role="slider"]').first().focus();
await page.keyboard.press('End');
await page.waitForTimeout(30);
equal('X03 End selects max', await page.evaluate(() => window.__rating.getValue()), 5);
await page.keyboard.press('Home');
await page.waitForTimeout(30);
equal('X03 Home selects zero', await page.evaluate(() => window.__rating.getValue()), 0);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(30);
equal('X03 ArrowRight increments', await page.evaluate(() => window.__rating.getValue()), 1);
const beforeReadonly = await page.evaluate(() => {
  const control = document.querySelectorAll('#x3 .nui-rating')[1].querySelector('[role="slider"]');
  control.focus();
  const result = { before: window.__ratingReadonly.getValue(), readonly: control.getAttribute('aria-readonly') };
  return result;
});
await page.keyboard.press('ArrowRight');
await page.locator('#x3 .nui-rating').nth(1).locator('[data-rating-value="2"]').click();
await page.waitForTimeout(30);
const x3Readonly = await page.evaluate(() => ({
  value: window.__ratingReadonly.getValue(),
  now: document.querySelectorAll('#x3 .nui-rating [role="slider"]')[1].getAttribute('aria-valuenow')
}));
equal('X03 readonly value does not change via keyboard/click', x3Readonly.value, 4);
equal('X03 readonly aria value stays', x3Readonly.now, '4');
check('X03 readonly marks aria-readonly', beforeReadonly.readonly === 'true');
const x3ChangeCount = await page.evaluate(() => window.__ratingChanges.length);
await page.evaluate(() => window.__rating.update({ value: 4, max: 7 }));
await page.waitForTimeout(30);
const x3Updated = await page.evaluate(() => ({
  value: window.__rating.getValue(),
  changes: window.__ratingChanges.length,
  now: document.querySelector('#x3 .nui-rating [role="slider"]').getAttribute('aria-valuenow')
}));
equal('X03 program update is silent', x3Updated.changes, x3ChangeCount);
equal('X03 program update changes value', x3Updated.now, '4');
await cleanup('x3');

/* ----------------------------------------------------------------------- */
/* X04 Cascader                                                             */
/* ----------------------------------------------------------------------- */
await newSection('x4');
await page.evaluate(() => {
  const host = document.getElementById('x4');
  window.__cascaderChanges = [];
  window.__cascaderOptions = [
    {
      value: 'front', label: '前端', children: [
        { value: 'html', label: 'HTML' },
        { value: 'css', label: 'CSS', children: [{ value: 'layout', label: '布局' }] },
        { value: 'blocked', label: '不可用项', disabled: true }
      ]
    },
    { value: 'design', label: '设计' }
  ];
  window.__cascader = NoteUI.Cascader.mount(host, {
    options: window.__cascaderOptions,
    value: [],
    placeholder: '选择分类',
    label: '内容分类',
    onChange: (values, nodes, event) => window.__cascaderChanges.push({
      values: values.slice(), labels: nodes.map((n) => n.label), type: event ? event.type : null
    })
  });
  window.__checkInstances.x4.push(window.__cascader);
});
await page.locator('#x4 .nui-cascader__trigger').click();
await page.waitForTimeout(80);
const x4Open = await page.evaluate(() => ({
  expanded: document.querySelector('#x4 .nui-cascader__trigger').getAttribute('aria-expanded'),
  dialog: !!document.querySelector('.hnv-floating [role="dialog"]'),
  columns: document.querySelectorAll('.nui-cascader__column').length,
  focusedRole: document.activeElement?.getAttribute('role') || '',
  focusedText: document.activeElement?.textContent || ''
}));
equal('X04 trigger reports expanded', x4Open.expanded, 'true');
check('X04 floating dialog opens', x4Open.dialog);
equal('X04 first column visible', x4Open.columns, 1);
equal('X04 opening focuses an option', x4Open.focusedRole, 'option');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(60);
const x4Expanded = await page.evaluate(() => ({
  columns: document.querySelectorAll('.nui-cascader__column').length,
  focusedText: document.activeElement?.textContent || '',
  disabled: document.querySelector('.nui-cascader__option[aria-disabled="true"]')?.textContent || ''
}));
equal('X04 ArrowRight expands a parent', x4Expanded.columns, 2);
check('X04 focus moves into child column', x4Expanded.focusedText.includes('HTML'), x4Expanded.focusedText);
check('X04 disabled node is marked not selectable', x4Expanded.disabled.includes('不可用'), x4Expanded.disabled);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(60);
const x4Deep = await page.evaluate(() => ({
  columns: document.querySelectorAll('.nui-cascader__column').length,
  focusedText: document.activeElement?.textContent || '',
  path: document.querySelector('.nui-cascader__pathvalue')?.textContent || ''
}));
equal('X04 second ArrowRight opens third column', x4Deep.columns, 3);
check('X04 focus reaches leaf column', x4Deep.focusedText.includes('布局'), x4Deep.focusedText);
check('X04 popup shows current browsing path', x4Deep.path.includes('前端 / CSS'), x4Deep.path);
await page.keyboard.press('Enter');
await page.waitForTimeout(100);
const x4Committed = await page.evaluate(() => ({
  expanded: document.querySelector('#x4 .nui-cascader__trigger').getAttribute('aria-expanded'),
  summary: document.querySelector('#x4 .nui-cascader__summary').textContent,
  value: window.__cascader.getValue(),
  changes: window.__cascaderChanges.slice(),
  focusedTrigger: document.activeElement === document.querySelector('#x4 .nui-cascader__trigger'),
  layers: document.querySelectorAll('.hnv-floating').length
}));
equal('X04 selection closes panel', x4Committed.expanded, 'false');
equal('X04 path summary updates', x4Committed.summary, '前端 / CSS / 布局');
equal('X04 getValue returns value array', JSON.stringify(x4Committed.value), JSON.stringify(['front', 'css', 'layout']));
equal('X04 onChange pathNodes and values', JSON.stringify(x4Committed.changes[0]?.values), JSON.stringify(['front', 'css', 'layout']));
equal('X04 onChange path labels', JSON.stringify(x4Committed.changes[0]?.labels), JSON.stringify(['前端', 'CSS', '布局']));
check('X04 focus returns to trigger after select', x4Committed.focusedTrigger);
equal('X04 closed panel is removed', x4Committed.layers, 0);

await page.evaluate(() => window.__cascader.update({ value: [] }));
await page.locator('#x4 .nui-cascader__trigger').click();
await page.waitForTimeout(60);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(40);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(40);
const x4DisabledFocus = await page.evaluate(() => ({
  disabled: document.activeElement?.getAttribute('aria-disabled'),
  text: document.activeElement?.textContent || ''
}));
check('X04 keyboard can focus the disabled node', x4DisabledFocus.disabled === 'true' && x4DisabledFocus.text.includes('不可用'), JSON.stringify(x4DisabledFocus));
await page.keyboard.press('Home');
await page.waitForTimeout(30);
const x4Home = await page.evaluate(() => ({ level: document.activeElement?.getAttribute('data-cascader-level'), index: document.activeElement?.getAttribute('data-cascader-index') }));
equal('X04 Home focuses first option in the current column', x4Home.level + ':' + x4Home.index, '1:0');
await page.keyboard.press('End');
await page.waitForTimeout(30);
const x4End = await page.evaluate(() => ({ text: document.activeElement?.textContent || '' }));
check('X04 End focuses last option in the current column', x4End.text.includes('不可用'), x4End.text);
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(30);
await page.keyboard.press('ArrowUp');
await page.waitForTimeout(30);
await page.keyboard.press('Enter');
await page.waitForTimeout(80);
const x4Disabled = await page.evaluate(() => ({
  value: window.__cascader.getValue(),
  summary: document.querySelector('#x4 .nui-cascader__summary').textContent,
  expanded: document.querySelector('#x4 .nui-cascader__trigger').getAttribute('aria-expanded')
}));
equal('X04 disabled node cannot be selected', (x4Disabled.value || []).length, 0);
check('X04 disabled attempt leaves trigger summary placeholder', x4Disabled.summary === '选择分类', x4Disabled.summary);
check('X04 disabled attempt leaves panel open', x4Disabled.expanded === 'true');
await page.keyboard.press('Escape');
await page.waitForTimeout(80);
const x4Escaped = await page.evaluate(() => ({
  expanded: document.querySelector('#x4 .nui-cascader__trigger').getAttribute('aria-expanded'),
  focusedTrigger: document.activeElement === document.querySelector('#x4 .nui-cascader__trigger'),
  layers: document.querySelectorAll('.hnv-floating').length
}));
check('X04 Escape closes and restores focus', x4Escaped.expanded === 'false' && x4Escaped.focusedTrigger && x4Escaped.layers === 0, JSON.stringify(x4Escaped));
await page.locator('#x4 .nui-cascader__trigger').click();
await page.waitForTimeout(60);
equal('X04 trigger click opens again', await page.locator('.hnv-floating').count(), 1);
await page.locator('#x4 .nui-cascader__trigger').click();
await page.waitForTimeout(60);
const x4TriggerToggle = await page.evaluate(() => ({
  layers: document.querySelectorAll('.hnv-floating').length,
  expanded: document.querySelector('#x4 .nui-cascader__trigger').getAttribute('aria-expanded')
}));
check('X04 trigger click closes without reopening', x4TriggerToggle.layers === 0 && x4TriggerToggle.expanded === 'false', JSON.stringify(x4TriggerToggle));
await page.locator('#x4 .nui-cascader__trigger').click();
await page.waitForTimeout(60);
await page.locator('body').click({ position: { x: 5, y: 5 } });
await page.waitForTimeout(60);
const x4Outside = await page.evaluate(() => ({
  layers: document.querySelectorAll('.hnv-floating').length,
  expanded: document.querySelector('#x4 .nui-cascader__trigger').getAttribute('aria-expanded')
}));
check('X04 outside click closes panel', x4Outside.layers === 0 && x4Outside.expanded === 'false', JSON.stringify(x4Outside));
await page.evaluate(() => window.__cascader.update({ value: ['front', 'css', 'layout'] }));
const x4ChangeCount = await page.evaluate(() => window.__cascaderChanges.length);
await page.evaluate(() => window.__cascader.update({ value: ['design'], options: window.__cascaderOptions }));
const x4Programmatic = await page.evaluate(() => ({
  changes: window.__cascaderChanges.length,
  summary: document.querySelector('#x4 .nui-cascader__summary').textContent,
  value: window.__cascader.getValue()
}));
equal('X04 program update is silent', x4Programmatic.changes, x4ChangeCount);
equal('X04 program update changes summary', x4Programmatic.summary, '设计');
equal('X04 getValue reflects program update', JSON.stringify(x4Programmatic.value), JSON.stringify(['design']));
await page.locator('#x4 .nui-cascader__clear').click();
await page.waitForTimeout(50);
const x4Cleared = await page.evaluate(() => ({
  value: window.__cascader.getValue(),
  summary: document.querySelector('#x4 .nui-cascader__summary').textContent,
  changes: window.__cascaderChanges.slice(-1)[0],
  clearHidden: document.querySelector('#x4 .nui-cascader__clear').hidden
}));
equal('X04 clear empties value', (x4Cleared.value || []).length, 0);
equal('X04 clear resets summary', x4Cleared.summary, '选择分类');
equal('X04 clear emits empty change', JSON.stringify(x4Cleared.changes?.values), '[]');
check('X04 clear control hides after clearing', x4Cleared.clearHidden === true);
await cleanup('x4');

/* ----------------------------------------------------------------------- */
/* X05 TreeSelect                                                           */
/* ----------------------------------------------------------------------- */
await newSection('x5');
await page.evaluate(() => {
  const host = document.getElementById('x5');
  window.__treeChanges = [];
  window.__treeNodes = [
    { id: 'code', label: '代码', children: [
      { id: 'html', label: 'HTML' },
      { id: 'css', label: 'CSS' },
      { id: 'locked', label: '不可用节点', disabled: true }
    ] },
    { id: 'design', label: '设计' }
  ];
  window.__treeSelect = NoteUI.TreeSelect.mount(host, {
    nodes: window.__treeNodes,
    expanded: ['code'],
    multi: true,
    value: ['design'],
    label: '内容标签',
    onChange: (value, nodes, event) => window.__treeChanges.push({
      value: Array.isArray(value) ? value.slice() : value,
      labels: nodes.map((n) => n.label),
      type: event ? event.type : null
    })
  });
  window.__checkInstances.x5.push(window.__treeSelect);
});
const x5Before = await page.evaluate(() => ({
  summary: document.querySelector('#x5 .nui-treeselect__summary').textContent,
  count: document.querySelector('#x5 .nui-treeselect__count').textContent,
  value: window.__treeSelect.getValue(),
  treeCount: document.querySelectorAll('#x5 .nui-tree').length
}));
equal('X05 initial selected summary', x5Before.summary, '设计');
check('X05 selected count visible', x5Before.count.includes('1 项'), x5Before.count);
equal('X05 getValue returns array for multi', JSON.stringify(x5Before.value), JSON.stringify(['design']));
equal('X05 TreeView not mounted while closed', x5Before.treeCount, 0);
await page.locator('#x5 .nui-treeselect__trigger').click();
await page.waitForTimeout(90);
const x5Open = await page.evaluate(() => ({
  expanded: document.querySelector('#x5 .nui-treeselect__trigger').getAttribute('aria-expanded'),
  trees: document.querySelectorAll('.hnv-floating .nui-tree').length,
  treeitems: document.querySelectorAll('.hnv-floating [role="treeitem"]').length,
  focusedTreeitem: document.activeElement?.getAttribute('role') || '',
  dialog: !!document.querySelector('.hnv-floating [role="dialog"]')
}));
equal('X05 opens as a floating dialog', x5Open.expanded, 'true');
check('X05 popup contains one reused TreeView', x5Open.trees === 1 && x5Open.treeitems >= 4, JSON.stringify(x5Open));
equal('X05 focus enters TreeView item', x5Open.focusedTreeitem, 'treeitem');
await page.locator('.hnv-floating [data-nui-tree-id="css"] .nui-tree__row').click();
await page.waitForTimeout(80);
const x5Multi = await page.evaluate(() => ({
  summary: document.querySelector('#x5 .nui-treeselect__summary').textContent,
  count: document.querySelector('#x5 .nui-treeselect__count').textContent,
  value: window.__treeSelect.getValue(),
  changes: window.__treeChanges.slice(),
  open: document.querySelector('#x5 .nui-treeselect__trigger').getAttribute('aria-expanded')
}));
check('X05 multi-select summary includes both labels', x5Multi.summary.includes('设计') && x5Multi.summary.includes('CSS'), x5Multi.summary);
check('X05 multi-select count updates', x5Multi.count.includes('2 项'), x5Multi.count);
equal('X05 onChange selected values', JSON.stringify(x5Multi.changes[0]?.value), JSON.stringify(['design', 'css']));
check('X05 multi-select keeps panel open', x5Multi.open === 'true');
await page.waitForTimeout(30);
await page.locator('#x5 .nui-treeselect__clear').click();
await page.waitForTimeout(100);
const x5Cleared = await page.evaluate(() => ({
  value: window.__treeSelect.getValue(),
  summary: document.querySelector('#x5 .nui-treeselect__summary').textContent,
  expanded: document.querySelector('#x5 .nui-treeselect__trigger').getAttribute('aria-expanded'),
  changes: window.__treeChanges.slice(-1)[0]
}));
equal('X05 clear empties multi selection', Array.isArray(x5Cleared.value) ? x5Cleared.value.length : -1, 0);
equal('X05 clear resets summary to placeholder', x5Cleared.summary, '请选择');
equal('X05 clear closes panel', x5Cleared.expanded, 'false');
equal('X05 clear callback delivers empty value/nodes', JSON.stringify(x5Cleared.changes?.value), '[]');
await page.locator('#x5 .nui-treeselect__trigger').click();
await page.waitForTimeout(60);
await page.keyboard.press('Escape');
await page.waitForTimeout(60);
const x5Escaped = await page.evaluate(() => ({
  expanded: document.querySelector('#x5 .nui-treeselect__trigger').getAttribute('aria-expanded'),
  focusedTrigger: document.activeElement === document.querySelector('#x5 .nui-treeselect__trigger'),
  layers: document.querySelectorAll('.hnv-floating').length
}));
check('X05 Esc closes and returns focus', x5Escaped.expanded === 'false' && x5Escaped.focusedTrigger && x5Escaped.layers === 0, JSON.stringify(x5Escaped));
await page.locator('#x5 .nui-treeselect__trigger').first().click();
await page.waitForTimeout(60);
await page.locator('#x5 .nui-treeselect__trigger').first().click();
await page.waitForTimeout(60);
const x5TriggerToggle = await page.evaluate(() => ({
  layers: document.querySelectorAll('.hnv-floating').length,
  expanded: document.querySelectorAll('#x5 .nui-treeselect__trigger')[0].getAttribute('aria-expanded')
}));
check('X05 trigger click closes without reopening', x5TriggerToggle.layers === 0 && x5TriggerToggle.expanded === 'false', JSON.stringify(x5TriggerToggle));
await page.locator('#x5 .nui-treeselect__trigger').first().click();
await page.waitForTimeout(60);
await page.locator('body').click({ position: { x: 5, y: 5 } });
await page.waitForTimeout(60);
const x5Outside = await page.evaluate(() => ({
  layers: document.querySelectorAll('.hnv-floating').length,
  expanded: document.querySelectorAll('#x5 .nui-treeselect__trigger')[0].getAttribute('aria-expanded')
}));
check('X05 outside click closes panel', x5Outside.layers === 0 && x5Outside.expanded === 'false', JSON.stringify(x5Outside));
await page.evaluate(() => {
  const host = document.getElementById('x5');
  window.__treeSingleChanges = [];
  window.__treeSingle = NoteUI.TreeSelect.mount(host, {
    nodes: window.__treeNodes,
    expanded: ['code'],
    multi: false,
    value: null,
    onChange: (value, nodes, event) => window.__treeSingleChanges.push({ value, labels: nodes.map((n) => n.label) })
  });
  window.__checkInstances.x5.push(window.__treeSingle);
});
await page.locator('#x5 .nui-treeselect').nth(1).locator('.nui-treeselect__trigger').click();
await page.waitForTimeout(60);
await page.locator('.hnv-floating [data-nui-tree-id="html"] .nui-tree__row').click();
await page.waitForTimeout(100);
const x5Single = await page.evaluate(() => ({
  value: window.__treeSingle.getValue(),
  changes: window.__treeSingleChanges.slice(),
  expanded: document.querySelectorAll('#x5 .nui-treeselect')[1].querySelector('.nui-treeselect__trigger').getAttribute('aria-expanded'),
  summary: document.querySelectorAll('#x5 .nui-treeselect')[1].querySelector('.nui-treeselect__summary').textContent,
  focusedTrigger: document.activeElement === document.querySelectorAll('#x5 .nui-treeselect')[1].querySelector('.nui-treeselect__trigger')
}));
equal('X05 single selection value is scalar', x5Single.value, 'html');
equal('X05 single selection closes automatically', x5Single.expanded, 'false');
check('X05 single summary uses label', x5Single.summary === 'HTML', x5Single.summary);
check('X05 single focus returns to trigger', x5Single.focusedTrigger);
equal('X05 single onChange path node', JSON.stringify(x5Single.changes[0]?.labels), JSON.stringify(['HTML']));
const x5ChangeCount = await page.evaluate(() => window.__treeChanges.length);
await page.evaluate(() => window.__treeSelect.update({ value: ['html'] }));
await page.waitForTimeout(50);
const x5Programmatic = await page.evaluate(() => ({
  changes: window.__treeChanges.length,
  value: window.__treeSelect.getValue(),
  summary: document.querySelector('#x5 .nui-treeselect__summary').textContent
}));
equal('X05 program update is silent', x5Programmatic.changes, x5ChangeCount);
equal('X05 program update changes value', JSON.stringify(x5Programmatic.value), JSON.stringify(['html']));
check('X05 program update refreshes summary', x5Programmatic.summary === 'HTML', x5Programmatic.summary);
await page.locator('#x5 .nui-treeselect__trigger').first().click();
await page.waitForTimeout(60);
const x5Rebuilt = await page.evaluate(() => ({
  trees: document.querySelectorAll('.hnv-floating .nui-tree').length,
  selected: Array.from(document.querySelectorAll('.hnv-floating [role="treeitem"][aria-selected="true"]')).map((n) => n.getAttribute('data-nui-tree-id'))
}));
equal('X05 reopens with single TreeView', x5Rebuilt.trees, 1);
check('X05 TreeView inherits external selected value', x5Rebuilt.selected.includes('html'), JSON.stringify(x5Rebuilt.selected));
await page.keyboard.press('Escape');
await cleanup('x5');

/* ----------------------------------------------------------------------- */
/* X06 TransferList                                                         */
/* ----------------------------------------------------------------------- */
await newSection('x6');
await page.evaluate(() => {
  const host = document.getElementById('x6');
  window.__transferChanges = [];
  window.__transfer = NoteUI.TransferList.mount(host, {
    source: [
      { value: 'alpha', label: 'Alpha 设计规范' },
      { value: 'beta', label: 'Beta 实施' },
      { value: 'gamma', label: 'Gamma 评估' },
      { value: 'disabled', label: '禁用的候选项', disabled: true }
    ],
    target: [{ value: 'existing', label: '已有笔记' }],
    titles: { source: '候选笔记', target: '已选笔记' },
    filterable: true,
    onChange: (targetValues, moved, event) => window.__transferChanges.push({
      target: targetValues.slice(), moved: moved.slice(), type: event ? event.type : null
    })
  });
  window.__checkInstances.x6.push(window.__transfer);
});
const x6Initial = await page.evaluate(() => ({
  sourceTotal: document.querySelectorAll('#x6 .nui-transfer__side')[0].querySelectorAll('.nui-transfer__checkbox').length,
  targetTotal: document.querySelectorAll('#x6 .nui-transfer__side')[1].querySelectorAll('.nui-transfer__checkbox').length,
  disabled: document.querySelector('#x6 .nui-transfer__checkbox[data-transfer-key="string:disabled"]').disabled,
  titles: Array.from(document.querySelectorAll('#x6 .nui-transfer__title')).map((n) => n.textContent),
  value: window.__transfer.getValue()
}));
equal('X06 renders both initial sides', x6Initial.sourceTotal, 4);
equal('X06 renders initial target', x6Initial.targetTotal, 1);
check('X06 disabled source item cannot be selected', x6Initial.disabled === true);
check('X06 titles are configurable', x6Initial.titles.includes('候选笔记') && x6Initial.titles.includes('已选笔记'), x6Initial.titles.join(' / '));
equal('X06 getValue returns initial target values', JSON.stringify(x6Initial.value), JSON.stringify(['existing']));
const sourceSearch = page.locator('#x6 .nui-transfer__search').first();
const targetSearch = page.locator('#x6 .nui-transfer__search').nth(1);
await sourceSearch.fill('设计');
await page.waitForTimeout(50);
const x6Filter = await page.evaluate(() => ({
  visible: Array.from(document.querySelectorAll('#x6 .nui-transfer__side')[0].querySelectorAll('.nui-transfer__item-text')).map((n) => n.textContent),
  count: document.querySelectorAll('#x6 .nui-transfer__count')[0].textContent,
  targetCount: document.querySelectorAll('#x6 .nui-transfer__count')[1].textContent
}));
equal('X06 filter narrows source list', x6Filter.visible.length, 1);
check('X06 filter finds expected item', x6Filter.visible[0].includes('Alpha'), x6Filter.visible[0]);
check('X06 filter count shows visible/total', x6Filter.count.includes('1 / 4'), x6Filter.count);
equal('X06 target filter is independent', x6Filter.targetCount, '1 项');
await page.locator('#x6 .nui-transfer__side').first().locator('.nui-transfer__checkbox').check();
await page.waitForTimeout(30);
const targetAction = page.locator('#x6 .nui-transfer__action').first();
check('X06 move button enabled after selection', await targetAction.isEnabled());
await targetAction.click();
await page.waitForTimeout(80);
const x6Moved = await page.evaluate(() => ({
  targetLabels: Array.from(document.querySelectorAll('#x6 .nui-transfer__side')[1].querySelectorAll('.nui-transfer__item-text')).map((n) => n.textContent),
  value: window.__transfer.getValue(),
  changes: window.__transferChanges.slice(),
  actionCount: document.querySelector('#x6 .nui-transfer__action-count').textContent
}));
check('X06 moving appends to target', x6Moved.targetLabels.some((label) => label.includes('Alpha')), x6Moved.targetLabels.join(' | '));
check('X06 onChange receives target values', JSON.stringify(x6Moved.value) === JSON.stringify(['existing', 'alpha']), JSON.stringify(x6Moved.value));
check('X06 onChange moved values', JSON.stringify(x6Moved.changes[0]?.moved) === JSON.stringify(['alpha']), JSON.stringify(x6Moved.changes[0]?.moved));
equal('X06 shift-click move event type', x6Moved.changes[0]?.type, 'click');
await sourceSearch.fill('zzz');
await page.waitForTimeout(40);
const x6NoResult = await page.evaluate(() => document.querySelectorAll('#x6 .nui-transfer__side')[0].querySelector('.nui-transfer__empty').textContent);
check('X06 filter shows no-results text', x6NoResult.includes('没有匹配项'), x6NoResult);
await sourceSearch.fill('');
await targetSearch.fill('Alpha');
await page.waitForTimeout(40);
const x6TargetFilter = await page.evaluate(() => ({
  visible: Array.from(document.querySelectorAll('#x6 .nui-transfer__side')[1].querySelectorAll('.nui-transfer__item-text')).map((n) => n.textContent),
  sourceEmpty: document.querySelectorAll('#x6 .nui-transfer__side')[0].querySelector('.nui-transfer__empty').hidden
}));
check('X06 target filter works independently', x6TargetFilter.visible.length === 1 && x6TargetFilter.visible[0].includes('Alpha'), JSON.stringify(x6TargetFilter));
check('X06 source filter remains cleared independently', x6TargetFilter.sourceEmpty === true, String(x6TargetFilter.sourceEmpty));
await page.locator('#x6 .nui-transfer__side').nth(1).locator('.nui-transfer__checkbox').check();
await page.locator('#x6 .nui-transfer__action').nth(1).click();
await page.waitForTimeout(60);
const x6MovedBack = await page.evaluate(() => ({
  target: window.__transfer.getValue(),
  sourceLabels: Array.from(document.querySelectorAll('#x6 .nui-transfer__side')[0].querySelectorAll('.nui-transfer__item-text')).map((n) => n.textContent)
}));
check('X06 move back removes from target', !x6MovedBack.target.includes('alpha'), JSON.stringify(x6MovedBack.target));
check('X06 move back restores source item', x6MovedBack.sourceLabels.some((label) => label.includes('Alpha')), x6MovedBack.sourceLabels.join(' | '));
await targetSearch.fill('');
await page.waitForTimeout(30);
const firstSourceCheckbox = page.locator('#x6 .nui-transfer__side').first().locator('.nui-transfer__checkbox:not(:disabled)').first();
await firstSourceCheckbox.focus();
await page.keyboard.press('Space');
await page.waitForTimeout(30);
check('X06 checkbox is keyboard operable', await firstSourceCheckbox.isChecked());
check('X06 keyboard selection enables move action', await page.locator('#x6 .nui-transfer__action').first().isEnabled());
await page.locator('#x6 .nui-transfer__action').first().focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(50);
check('X06 move button is keyboard operable', await page.locator('#x6 .nui-transfer__side').nth(1).locator('.nui-transfer__checkbox').count() >= 2);
const x6ChangeCount = await page.evaluate(() => window.__transferChanges.length);
await page.evaluate(() => window.__transfer.update({
  source: [{ value: 'one', label: '一' }, { value: 'two', label: '二' }],
  target: [{ value: 'three', label: '三' }],
  titles: { source: '来源', target: '去向' }
}));
await page.waitForTimeout(50);
const x6Programmatic = await page.evaluate(() => ({
  changes: window.__transferChanges.length,
  value: window.__transfer.getValue(),
  titles: Array.from(document.querySelectorAll('#x6 .nui-transfer__title')).map((n) => n.textContent)
}));
equal('X06 program update is silent', x6Programmatic.changes, x6ChangeCount);
equal('X06 program update replaces target', JSON.stringify(x6Programmatic.value), JSON.stringify(['three']));
check('X06 program update refreshes titles', x6Programmatic.titles.includes('来源') && x6Programmatic.titles.includes('去向'), x6Programmatic.titles.join(' / '));
await cleanup('x6');

/* ----------------------------------------------------------------------- */
/* X07 CommandPalette                                                       */
/* ----------------------------------------------------------------------- */
await newSection('x7');
await page.evaluate(() => {
  const host = document.getElementById('x7');
  const opener = document.createElement('button');
  opener.type = 'button';
  opener.id = 'x7-opener';
  opener.textContent = '打开命令面板';
  host.appendChild(opener);
  window.__commandRuns = [];
  window.__command = NoteUI.CommandPalette.mount(host, {
    hotkey: 'Alt+k',
    label: '本地命令面板',
    commands: [
      { id: 'open', label: '打开文件', group: '文件', keywords: ['open', 'file'], shortcut: 'Ctrl+O', run: (command, event) => window.__commandRuns.push({ id: command.id, openAtRun: window.__command.isOpen(), type: event?.type || null }) },
      { id: 'save', label: '保存笔记', group: '文件', keywords: ['save'], shortcut: 'Ctrl+S', run: (command) => window.__commandRuns.push({ id: command.id, openAtRun: window.__command.isOpen() }) },
      { id: 'theme', label: '切换主题', group: '视图', keywords: ['theme', 'dark'], run: (command) => window.__commandRuns.push({ id: command.id, openAtRun: window.__command.isOpen() }) },
      { id: 'delete', label: '删除内容', group: '编辑', keywords: ['delete'], disabled: true, run: () => window.__commandRuns.push({ id: 'delete-ran' }) },
      { id: 'noop', label: '无操作', group: '编辑', run: (command) => window.__commandRuns.push({ id: command.id, openAtRun: window.__command.isOpen() }) }
    ]
  });
  opener.addEventListener('click', () => window.__command.open());
  window.__checkInstances.x7.push(window.__command);
});
equal('X07 palette starts closed', await page.evaluate(() => window.__command.isOpen()), false);
await page.locator('#x7-opener').click();
await page.waitForTimeout(80);
const x7Open = await page.evaluate(() => ({
  open: window.__command.isOpen(),
  inputFocused: document.activeElement === document.querySelector('.nui-command__input'),
  dialog: !!document.querySelector('.hnv-floating [role="dialog"][aria-modal="true"]'),
  backdrop: !!document.querySelector('.hnv-floating__backdrop'),
  groups: Array.from(document.querySelectorAll('.nui-command__group-label')).map((n) => n.textContent),
  bodyLocked: document.body.style.overflow === 'hidden',
  options: document.querySelectorAll('.nui-command__option').length
}));
check('X07 open() shows modal dialog', x7Open.open && x7Open.dialog && x7Open.backdrop, JSON.stringify(x7Open));
check('X07 input receives focus', x7Open.inputFocused);
check('X07 groups displayed', x7Open.groups.includes('文件') && x7Open.groups.includes('视图') && x7Open.groups.includes('编辑'), x7Open.groups.join(' / '));
equal('X07 all commands listed initially', x7Open.options, 5);
check('X07 modal locks page scroll', x7Open.bodyLocked);
const commandInput = page.locator('.nui-command__input');
await commandInput.fill('文件');
await page.waitForTimeout(50);
const x7Filtered = await page.evaluate(() => ({
  labels: Array.from(document.querySelectorAll('.nui-command__option .nui-command__label')).map((n) => n.textContent),
  group: Array.from(document.querySelectorAll('.nui-command__group-label')).map((n) => n.textContent),
  count: document.querySelector('.nui-command__count').textContent,
  active: document.querySelector('.nui-command__option.is-active .nui-command__label')?.textContent || '',
  activeDesc: document.querySelector('.nui-command__input').getAttribute('aria-activedescendant') || ''
}));
check('X07 filter matches labels/group', x7Filtered.labels.length === 2 && x7Filtered.labels.includes('打开文件') && x7Filtered.labels.includes('保存笔记'), x7Filtered.labels.join(' / '));
check('X07 filter groups filtered results', x7Filtered.group.length === 1 && x7Filtered.group[0] === '文件', x7Filtered.group.join(' / '));
check('X07 result count updates', x7Filtered.count.includes('2 / 5'), x7Filtered.count);
check('X07 active option has aria-activedescendant', x7Filtered.activeDesc.length > 0, x7Filtered.activeDesc);
await commandInput.fill('zzzz');
await page.waitForTimeout(40);
const x7Empty = await page.evaluate(() => ({
  empty: document.querySelector('.nui-command__empty')?.textContent || '',
  visible: !document.querySelector('.nui-command__empty')?.hidden,
  options: document.querySelectorAll('.nui-command__option').length,
  activeDesc: document.querySelector('.nui-command__input').getAttribute('aria-activedescendant')
}));
check('X07 no-results state visible', x7Empty.visible && x7Empty.empty.includes('没有匹配'), JSON.stringify(x7Empty));
equal('X07 no-results leaves no options', x7Empty.options, 0);
equal('X07 no-results clears active descendant', x7Empty.activeDesc, null);
await commandInput.fill('文件');
await page.waitForTimeout(30);
await page.keyboard.press('End');
await page.keyboard.press('Enter');
await page.waitForTimeout(100);
const x7Run = await page.evaluate(() => ({
  open: window.__command.isOpen(),
  runs: window.__commandRuns.slice(),
  layers: document.querySelectorAll('.hnv-floating').length,
  focused: document.activeElement?.id || ''
}));
equal('X07 End + Enter executes last enabled match', x7Run.runs[0]?.id, 'save');
equal('X07 command closes after execution', x7Run.open, false);
equal('X07 panel closes after execution', x7Run.layers, 0);
check('X07 command run sees closed palette', x7Run.runs[0]?.openAtRun === false, JSON.stringify(x7Run.runs[0]));
equal('X07 focus returns after command execution', x7Run.focused, 'x7-opener');

await page.locator('#x7-opener').click();
await page.waitForTimeout(60);
await commandInput.fill('删除');
await page.waitForTimeout(30);
const x7Disabled = await page.evaluate(() => ({
  options: Array.from(document.querySelectorAll('.nui-command__option')).map((n) => ({ disabled: n.getAttribute('aria-disabled'), active: n.classList.contains('is-active'), note: n.querySelector('.nui-command__unavailable')?.textContent || '' })),
  activeDesc: document.querySelector('.nui-command__input').getAttribute('aria-activedescendant'),
  open: window.__command.isOpen()
}));
check('X07 disabled command is visible and marked', x7Disabled.options.length === 1 && x7Disabled.options[0].disabled === 'true' && x7Disabled.options[0].note === '不可用', JSON.stringify(x7Disabled));
check('X07 disabled-only result has no active command', x7Disabled.activeDesc === null, String(x7Disabled.activeDesc));
await page.keyboard.press('Enter');
await page.waitForTimeout(40);
equal('X07 Enter on disabled command does not execute/close', await page.evaluate(() => window.__command.isOpen()), true);
await page.keyboard.press('Escape');
await page.waitForTimeout(80);
const x7Escaped = await page.evaluate(() => ({
  open: window.__command.isOpen(),
  focused: document.activeElement?.id || '',
  layers: document.querySelectorAll('.hnv-floating').length,
  bodyOverflow: document.body.style.overflow
}));
check('X07 Esc closes and restores focus', !x7Escaped.open && x7Escaped.focused === 'x7-opener' && x7Escaped.layers === 0, JSON.stringify(x7Escaped));
equal('X07 scroll lock restored', x7Escaped.bodyOverflow, '');
await page.locator('body').click({ position: { x: 10, y: 10 } });
await page.waitForTimeout(30);
await page.keyboard.press('Alt+k');
await page.waitForTimeout(100);
const x7Hotkey = await page.evaluate(() => ({
  open: window.__command.isOpen(),
  focused: document.activeElement === document.querySelector('.nui-command__input')
}));
check('X07 explicit hotkey opens palette', x7Hotkey.open, String(x7Hotkey.open));
check('X07 hotkey focuses search input', x7Hotkey.focused);
await commandInput.fill('file');
await page.waitForTimeout(40);
const x7KeywordFilter = await page.evaluate(() => ({
  labels: Array.from(document.querySelectorAll('.nui-command__option .nui-command__label')).map((n) => n.textContent),
  open: window.__command.isOpen()
}));
check('X07 filters by keywords', x7KeywordFilter.labels.length === 1 && x7KeywordFilter.labels[0] === '打开文件', JSON.stringify(x7KeywordFilter));
await page.keyboard.press('Home');
await page.waitForTimeout(30);
const x7Home = await page.evaluate(() => document.querySelector('.nui-command__option.is-active .nui-command__label')?.textContent || '');
check('X07 Home highlights first enabled command', x7Home === '打开文件', x7Home);
await page.keyboard.press('Escape');
await page.waitForTimeout(70);
await page.keyboard.press('Alt+k');
await page.waitForTimeout(80);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await page.waitForTimeout(100);
const x7KeyboardFlow = await page.evaluate(() => ({
  open: window.__command.isOpen(),
  runs: window.__commandRuns.slice(),
  layers: document.querySelectorAll('.hnv-floating').length
}));
check('X07 keyboard navigation executes a command', x7KeyboardFlow.runs.length >= 2 && !x7KeyboardFlow.open, JSON.stringify(x7KeyboardFlow));
await page.evaluate(() => window.__command.update({
  commands: [{ id: 'updated', label: '更新后的命令', group: '更新', run: () => window.__commandRuns.push({ id: 'updated' }) }]
}));
await page.evaluate(() => window.__command.open());
await page.waitForTimeout(50);
const x7Updated = await page.evaluate(() => ({
  labels: Array.from(document.querySelectorAll('.nui-command__option .nui-command__label')).map((n) => n.textContent)
}));
check('X07 update replaces local command list', x7Updated.labels.length === 1 && x7Updated.labels[0] === '更新后的命令', JSON.stringify(x7Updated));
await page.keyboard.press('Escape');
await page.waitForTimeout(50);
await page.evaluate(() => window.__command.open());
await page.waitForTimeout(50);
const x7ApiClose = await page.evaluate(() => {
  const before = window.__command.isOpen();
  window.__command.close();
  return { before, after: window.__command.isOpen() };
});
check('X07 close()/isOpen() API works', x7ApiClose.before === true && x7ApiClose.after === false, JSON.stringify(x7ApiClose));
await cleanup('x7');
await newSection('x7-default');
await page.evaluate(() => {
  const host = document.getElementById('x7-default');
  window.__commandDefault = NoteUI.CommandPalette.mount(host, {
    commands: [{ id: 'x', label: '示例', run: () => {} }]
  });
  window.__checkInstances['x7-default'].push(window.__commandDefault);
});
await page.locator('body').click({ position: { x: 10, y: 10 } });
await page.keyboard.press('Alt+k');
await page.waitForTimeout(80);
equal('X07 hotkey is off unless explicitly configured', await page.evaluate(() => window.__commandDefault.isOpen()), false);
await cleanup('x7-default');

/* ----------------------------------------------------------------------- */
/* Narrow layout and no console errors                                     */
/* ----------------------------------------------------------------------- */
await page.setViewportSize({ width: 390, height: 844 });
await newSection('xnarrow');
await page.evaluate(() => {
  const host = document.getElementById('xnarrow');
  const narrow = document.createElement('div');
  narrow.className = 'check-narrow';
  host.appendChild(narrow);
  window.__narrowAvatar = NoteUI.Avatar.mount(narrow, { items: [{ name: 'Ada Lovelace' }, { name: 'Grace Hopper' }, { name: 'Alan Turing' }], max: 2 });
  window.__narrowCarousel = NoteUI.Carousel.mount(narrow, { items: [{ content: '一段可以换行的窄容器内容。' }, { content: '第二段内容。' }] });
  window.__narrowCascader = NoteUI.Cascader.mount(narrow, {
    options: [{ value: 'a', label: '很长的第一级分类名称', children: [{ value: 'b', label: '第二级分类名称', children: [{ value: 'c', label: '第三级叶子节点' }] }] }]
  });
  window.__narrowTree = NoteUI.TreeSelect.mount(narrow, {
    nodes: [{ id: 'a', label: '一个很长的树节点名称', children: [{ id: 'b', label: '子节点' }] }], multi: true
  });
  window.__narrowTransfer = NoteUI.TransferList.mount(narrow, {
    source: [{ value: 1, label: '一个很长的候选项名称' }, { value: 2, label: '另一项' }],
    target: []
  });
  window.__narrowCommand = NoteUI.CommandPalette.mount(narrow, {
    commands: [{ id: 'a', label: '一个很长的本地命令名称', group: '很长的命令分组', run: () => {} }]
  });
  window.__checkInstances.xnarrow.push(window.__narrowAvatar, window.__narrowCarousel, window.__narrowCascader, window.__narrowTree, window.__narrowTransfer, window.__narrowCommand);
});
const narrowOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('Narrow page has no horizontal page overflow', narrowOverflow <= 2, String(narrowOverflow));
const transferOrder = await page.evaluate(() => {
  const root = document.querySelector('#xnarrow .nui-transfer');
  const sides = Array.from(root.querySelectorAll('.nui-transfer__side'));
  const actions = root.querySelector('.nui-transfer__actions');
  const sourceRect = sides[0].getBoundingClientRect();
  const actionsRect = actions.getBoundingClientRect();
  const targetRect = sides[1].getBoundingClientRect();
  return { sourceTop: sourceRect.top, actionsTop: actionsRect.top, targetTop: targetRect.top, widths: [sourceRect.width, targetRect.width] };
});
check('Narrow TransferList stacks source/actions/target', transferOrder.sourceTop < transferOrder.actionsTop && transferOrder.actionsTop < transferOrder.targetTop, JSON.stringify(transferOrder));
await page.locator('#xnarrow .nui-cascader__trigger').click();
await page.waitForTimeout(120);
const narrowCascader = await page.evaluate(() => {
  const panel = document.querySelector('.nui-cascader__popup');
  const rect = panel ? panel.getBoundingClientRect() : null;
  return { rect: rect ? { left: rect.left, right: rect.right, width: rect.width, top: rect.top, bottom: rect.bottom } : null, vw: window.innerWidth, vh: window.innerHeight };
});
check('Narrow Cascader popup stays inside viewport', narrowCascader.rect && narrowCascader.rect.left >= 0 && narrowCascader.rect.right <= narrowCascader.vw + 0.5 && narrowCascader.rect.top >= 0 && narrowCascader.rect.bottom <= narrowCascader.vh + 0.5, JSON.stringify(narrowCascader));
await page.keyboard.press('Escape');
await page.locator('#xnarrow .nui-treeselect__trigger').click();
await page.waitForTimeout(100);
const narrowTree = await page.evaluate(() => {
  const panel = document.querySelector('.nui-treeselect__popup');
  const rect = panel ? panel.getBoundingClientRect() : null;
  return { rect: rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width } : null, vw: window.innerWidth, vh: window.innerHeight, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
});
check('Narrow TreeSelect popup stays inside viewport', narrowTree.rect && narrowTree.rect.left >= 0 && narrowTree.rect.right <= narrowTree.vw + 0.5 && narrowTree.rect.top >= 0 && narrowTree.rect.bottom <= narrowTree.vh + 0.5 && narrowTree.overflow <= 2, JSON.stringify(narrowTree));
await page.keyboard.press('Escape');
await page.evaluate(() => window.__narrowCommand.open());
await page.waitForTimeout(100);
const narrowCommand = await page.evaluate(() => {
  const dialog = document.querySelector('.nui-command__dialog');
  const rect = dialog ? dialog.getBoundingClientRect() : null;
  return { rect: rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width } : null, vw: window.innerWidth, vh: window.innerHeight, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, focused: document.activeElement === document.querySelector('.nui-command__input') };
});
check('Narrow CommandPalette dialog stays inside viewport', narrowCommand.rect && narrowCommand.rect.left >= 0 && narrowCommand.rect.right <= narrowCommand.vw + 0.5 && narrowCommand.rect.top >= 0 && narrowCommand.rect.bottom <= narrowCommand.vh + 0.5 && narrowCommand.overflow <= 2 && narrowCommand.focused, JSON.stringify(narrowCommand));
await page.keyboard.press('Escape');
const narrowLayers = await cleanup('xnarrow');
equal('Narrow host cleanup leaves no layers', narrowLayers, 0);
await page.setViewportSize({ width: 1280, height: 900 });

const finalResidue = await page.evaluate(() => ({ layers: document.querySelectorAll('.hnv-floating, .hnv-floating__backdrop').length, bodyOverflow: document.body.style.overflow, bodyPadding: document.body.style.paddingRight }));
check('Final state leaves no floating layers or scroll lock', finalResidue.layers === 0 && finalResidue.bodyOverflow === '' && finalResidue.bodyPadding === '', JSON.stringify(finalResidue));
check('No console errors or page errors during checks', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 1000));
const failed = results.filter((result) => !result.ok);
console.log('\nSUMMARY', JSON.stringify({ total: results.length, failed: failed.length, failures: failed }, null, 2));
await browser.close();
if (failed.length) process.exitCode = 1;
