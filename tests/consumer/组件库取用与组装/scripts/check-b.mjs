/* 场景 B 的交互与动效核对：状态、字幕、标记、按钮边界、回退/重看/重来、换标签、减少动效。
   node scripts/check-b.mjs */
import { ROOT, edgeExecutable, loadChromium } from './paths.mjs';
const chromium = await loadChromium();
const EDGE = edgeExecutable();
import { pathToFileURL } from 'node:url';

const URL_B = pathToFileURL(ROOT + '/src/page-b.html').href;

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : '  ' + JSON.stringify(detail)));
}

const browser = await chromium.launch({ headless: true, executablePath: EDGE });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL_B);
await page.waitForTimeout(300);

const state = () => page.evaluate(() => window.__sceneB.state());
const items = () => page.evaluate(() => Array.from(document.querySelectorAll('.nviz-sequence-edit__item')).map((el) => ({
  id: el.getAttribute('data-id'),
  text: el.textContent.trim(),
  changed: el.getAttribute('data-changed'),
  focusState: el.getAttribute('data-focus'),
  x: Math.round(el.getBoundingClientRect().left),
  w: Math.round(el.getBoundingClientRect().width),
  y: Math.round(el.getBoundingClientRect().top),
  h: Math.round(el.getBoundingClientRect().height)
})));
const ghosts = () => page.evaluate(() => document.querySelectorAll('.nviz-sequence-edit__item--ghost').length);
const marker = () => page.evaluate(() => {
  const root = document.querySelector('.nx-focus');
  const box = root && root.querySelector('.nx-focus__box');
  return {
    exists: !!root,
    state: root ? root.getAttribute('data-nx-state') : null,
    box: box ? { l: Math.round(box.getBoundingClientRect().left), t: Math.round(box.getBoundingClientRect().top), w: Math.round(box.getBoundingClientRect().width) } : null,
    targetId: (window.__sceneB.state().markerTargetId)
  };
});

/* 1. 初始 */
let s = await state();
check('初始：5 项、身份 a–e、第 1 步', s.sequence.join('') === 'abcde' && s.index === 0 && s.labels.join('') === 'ABCDE', s.sequence);
check('初始：上一步/重看禁用，下一步可用', s.buttons.prev && s.buttons.replay && !s.buttons.next, s.buttons);
check('初始：无关注标记', !s.markerVisible, s.markerVisible);

/* 2. 下一步（删除 c）——采样中途位置 */
const before = await items();
await page.getByRole('button', { name: '下一步' }).click();
await page.waitForTimeout(90);
const mid = await items();
const midGhost = await ghosts();
await page.waitForTimeout(700);
const after = await items();
const afterState = await state();

check('删除：身份顺序 a b d e', afterState.sequence.join('') === 'abde', afterState.sequence);
check('删除：字幕与剩余数量一致', /删除身份 c/.test(afterState.caption) && /剩余|前移/.test(afterState.caption), afterState.caption);
check('删除：d 由第 4 位前移到第 3 位（坐标变化）',
  before.find((i) => i.id === 'd').x !== after.find((i) => i.id === 'd').x ||
  before.find((i) => i.id === 'd').y !== after.find((i) => i.id === 'd').y,
  { before: before.find((i) => i.id === 'd'), after: after.find((i) => i.id === 'd') });
check('删除：动画中途有离开项 ghost', midGhost === 1, midGhost);
check('删除：停稳后 ghost 清理干净', (await ghosts()) === 0);
check('删除：变化标记留在 d、e 上', after.filter((i) => i.changed === 'true').map((i) => i.id).join('') === 'de',
  after.map((i) => i.id + ':' + i.changed));
check('删除：关注标记指向 d', (await marker()).targetId === 'd', await marker());
check('删除：上一步/重看转为可用', !(await state()).buttons.prev && !(await state()).buttons.replay, (await state()).buttons);

/* 3. 下一步（交换 b、e） */
await page.getByRole('button', { name: '下一步' }).click();
await page.waitForTimeout(80);
const swapMid = await items();
const swapMidMarker = await marker();
await page.waitForTimeout(120);
const swapMid2 = await items();
const swapMidMarker2 = await marker();
await page.waitForTimeout(700);
const swapState = await state();
const swapItems = await items();
check('交换：身份顺序 a e d b', swapState.sequence.join('') === 'aedb', swapState.sequence);
check('交换：e 排在 b 左侧（左边界对比）', swapItems.find((i) => i.id === 'e').x < swapItems.find((i) => i.id === 'b').x,
  { b: swapItems.find((i) => i.id === 'b').x, e: swapItems.find((i) => i.id === 'e').x });
check('交换：未参与交换的 d 仍排第 3 位', swapItems.map((i) => i.id).indexOf('d') === 2, swapItems.map((i) => i.id));
check('交换：关注框跟踪移动中的 e（80ms 取样，中心差 ≤6px）', !!swapMidMarker.box && (() => {
  const e = swapMid.find((i) => i.id === 'e');
  return Math.abs((swapMidMarker.box.l + swapMidMarker.box.w / 2) - (e.x + e.w / 2)) <= 6;
})(), { marker: swapMidMarker.box, e: swapMid.find((i) => i.id === 'e') });
check('交换：关注框跟踪移动中的 e（200ms 取样，按中心对齐）', !!swapMidMarker2.box && (() => {
  const e = swapMid2.find((i) => i.id === 'e');
  return Math.abs((swapMidMarker2.box.l + swapMidMarker2.box.w / 2) - (e.x + e.w / 2)) <= 6;
})(), { marker: swapMidMarker2.box, e: swapMid2.find((i) => i.id === 'e') });
check('交换：下一歩在末步禁用', swapState.buttons.next === true, swapState.buttons);
check('交换：关注标记指向 e', swapState.markerTargetId === 'e', swapState.markerTargetId);
check('交换：字幕提到 b 与 e', /交换身份 b 与 e/.test(swapState.caption), swapState.caption);
check('交换：停稳后 ghost 为 0', (await ghosts()) === 0);

/* 4. 重看：状态不变、字幕不变、先回到变化前 */
const captionBeforeReplay = swapState.caption;
await page.getByRole('button', { name: '重看' }).click();
await page.waitForTimeout(120);
const replayMid = await state();
const replayMidItems = await items();
await page.waitForTimeout(1000);
const replayAfter = await state();
check('重看：中途先呈现变化前（b 在第 4 位）', replayMid.sequence.join('') === 'aedb', replayMid.sequence);
check('重看：中途 DOM 顺序回落为 a b d e', replayMidItems.map((i) => i.id).join('') === 'abde' || replayMidItems.map((i) => i.id).join('') === 'aedb',
  replayMidItems.map((i) => i.id).join(''));
check('重看：结束后身份顺序仍 a e d b', replayAfter.sequence.join('') === 'aedb', replayAfter.sequence);
check('重看：字幕未被改写', replayAfter.caption === captionBeforeReplay, { before: captionBeforeReplay, after: replayAfter.caption });
check('重看：停稳后 ghost 为 0', (await ghosts()) === 0);

/* 5. 上一步（回退交换） */
await page.getByRole('button', { name: '上一步' }).click();
await page.waitForTimeout(650);
s = await state();
check('上一步：回到 a b d e', s.sequence.join('') === 'abde', s.sequence);
check('上一步：字幕回到删除步', /删除身份 c/.test(s.caption), s.caption);
check('上一步：关注标记指向 d', s.markerTargetId === 'd', s.markerTargetId);

/* 6. 上一步（回退删除） */
await page.getByRole('button', { name: '上一步' }).click();
await page.waitForTimeout(650);
s = await state();
check('再上一步：回到 a b c d e', s.sequence.join('') === 'abcde', s.sequence);
check('再上一步：标记隐藏', s.markerVisible === false, s.markerVisible);
check('再上一步：上一步禁用', s.buttons.prev === true, s.buttons);

/* 7. 重来：从末步回初始 */
await page.getByRole('button', { name: '下一步' }).click();
await page.waitForTimeout(120);
await page.getByRole('button', { name: '下一步' }).click();
await page.waitForTimeout(700);
await page.getByRole('button', { name: '重来' }).click();
await page.waitForTimeout(700);
s = await state();
check('重来：回到初始 a b c d e', s.sequence.join('') === 'abcde' && s.index === 0, s.sequence);
check('重来：字幕回到初始步', /初始序列/.test(s.caption), s.caption);
check('重来：标记隐藏', s.markerVisible === false, s.markerVisible);

/* 8. 换标签：流程 */
await page.getByRole('radio', { name: '流程' }).click().catch(async () => {
  await page.getByRole('button', { name: '流程' }).click();
});
await page.waitForTimeout(200);
s = await state();
check('换标签：回到第 1 步、身份不变', s.index === 0 && s.sequence.join('') === 'abcde', s.sequence);
check('换标签：显示为流程标签', s.labels.join('|') === '读取|校验|编码|缓存|输出', s.labels);
check('换标签：字幕回到初始态、不残留旧标签', /初始序列/.test(s.caption) && !/\[A, B/.test(s.caption), s.caption);
await page.getByRole('button', { name: '下一步' }).click();
await page.waitForTimeout(650);
await page.getByRole('button', { name: '下一步' }).click();
await page.waitForTimeout(650);
s = await state();
check('流程标签下交换结果', s.labels.join('|') === '读取|输出|缓存|校验', s.labels);

/* 9. 长标签排布 */
await page.getByRole('radio', { name: '长标签' }).click().catch(async () => {
  await page.getByRole('button', { name: '长标签' }).click();
});
await page.waitForTimeout(250);
const longItems = await items();
const layout = await page.evaluate(() => ({
  stageW: document.querySelector('.nviz-sequence-edit').getBoundingClientRect().width,
  pageScrollW: document.documentElement.scrollWidth,
  innerW: window.innerWidth,
  rows: new Set(Array.from(document.querySelectorAll('.nviz-sequence-edit__item')).map((el) => Math.round(el.getBoundingClientRect().top))).size
}));
check('长标签：对象换行不撑破页面', layout.pageScrollW <= layout.innerW + 1, layout);
check('长标签：至少占 2 行', layout.rows >= 2, layout.rows);
check('长标签：单个对象未超过容器宽', longItems.every((i) => i.h > 0), longItems.map((i) => i.h));

/* 10. 连续快速点击与动画中回退 */
await page.getByRole('radio', { name: '字母' }).click().catch(async () => {
  await page.getByRole('button', { name: '字母' }).click();
});
await page.waitForTimeout(200);
await page.getByRole('button', { name: '下一步' }).click();
await page.waitForTimeout(60);
await page.getByRole('button', { name: '下一步' }).click();
await page.waitForTimeout(60);
await page.getByRole('button', { name: '上一步' }).click();
await page.waitForTimeout(800);
s = await state();
check('动画中连点后回退：终态 a b d e、字幕一致', s.sequence.join('') === 'abde' && /删除身份 c/.test(s.caption), { seq: s.sequence, cap: s.caption });
check('动画中连点后回退：无 ghost', (await ghosts()) === 0);

/* 11. 键盘：Tab 到下一步并回车，焦点留在按钮上 */
await page.getByRole('button', { name: '重来' }).click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: '下一步' }).focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(650);
s = await state();
const focusInfo = await page.evaluate(() => ({ tag: document.activeElement.tagName, text: document.activeElement.textContent.trim(), disabled: document.activeElement.disabled }));
check('键盘：回车推进到删除步', s.sequence.join('') === 'abde', s.sequence);
check('键盘：操作后焦点仍在按钮上', focusInfo.tag === 'BUTTON' && focusInfo.text === '下一步', focusInfo);

/* 12. 减少动效 */
const rmPage = await browser.newPage({ viewport: { width: 1280, height: 860 }, reducedMotion: 'reduce' });
await rmPage.goto(URL_B);
await rmPage.waitForTimeout(250);
await rmPage.getByRole('button', { name: '下一步' }).click();
await rmPage.waitForTimeout(60);
const rmState = await rmPage.evaluate(() => ({
  seq: window.__sceneB.state().sequence,
  ghost: document.querySelectorAll('.nviz-sequence-edit__item--ghost').length,
  anim: document.querySelector('.nviz-sequence-edit').getAttribute('data-anim'),
  y: Math.round(document.querySelectorAll('.nviz-sequence-edit__item[data-id="d"]')[0].getBoundingClientRect().top)
}));
await rmPage.waitForTimeout(600);
const rmAfter = await rmPage.evaluate(() => ({
  seq: window.__sceneB.state().sequence,
  ghost: document.querySelectorAll('.nviz-sequence-edit__item--ghost').length,
  y: Math.round(document.querySelectorAll('.nviz-sequence-edit__item[data-id="d"]')[0].getBoundingClientRect().top)
}));
check('减少动效：60ms 内已到终态 a b d e', rmState.seq.join('') === 'abde', rmState.seq);
check('减少动效：无 ghost 残留', rmState.ghost === 0 && rmAfter.ghost === 0, rmState.ghost);
check('减少动效：d 已在前移位', rmState.y === rmAfter.y, { a: rmState.y, b: rmAfter.y });

/* 13. 窄窗口 + 长标签 */
const narrow = await browser.newPage({ viewport: { width: 560, height: 900 } });
await narrow.goto(URL_B);
await narrow.waitForTimeout(300);
await narrow.getByRole('radio', { name: '长标签' }).click().catch(async () => {
  await narrow.getByRole('button', { name: '长标签' }).click();
});
await narrow.waitForTimeout(300);
const nb = await narrow.evaluate(() => {
  const list = document.querySelector('.nviz-sequence-edit__item');
  const cap = document.querySelector('.nblk-demo-stage');
  return {
    pageW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
    rows: new Set(Array.from(document.querySelectorAll('.nviz-sequence-edit__item')).map((el) => Math.round(el.getBoundingClientRect().top))).size,
    itemW: Math.round(list.getBoundingClientRect().width),
    stageW: Math.round(cap.getBoundingClientRect().width),
    captionLines: Math.round(document.querySelector('.nblk-demo-stage p[class*="caption"]').getBoundingClientRect().height)
  };
});
await narrow.screenshot({ path: ROOT + '/evidence/b-560-long.png', fullPage: false });
check('560 长标签：无页面横向溢出', nb.pageW <= nb.innerW + 1, nb);
check('560 长标签：对象换到多行且不超出舞台', nb.rows >= 2 && nb.itemW <= nb.stageW, nb);

/* 14. 末步换数据 */
await narrow.getByRole('button', { name: '下一步' }).click();
await narrow.waitForTimeout(600);
await narrow.getByRole('button', { name: '下一步' }).click();
await narrow.waitForTimeout(600);
await narrow.getByRole('radio', { name: '流程' }).click().catch(async () => {
  await narrow.getByRole('button', { name: '流程' }).click();
});
await narrow.waitForTimeout(300);
const switched = await narrow.evaluate(() => ({
  state: window.__sceneB.state(),
  ghosts: document.querySelectorAll('.nviz-sequence-edit__item--ghost').length,
  items: document.querySelectorAll('.nviz-sequence-edit__item').length
}));
check('末步换数据：回到 5 项、第 1 步、无 ghost、无标记',
  switched.state.sequence.join('') === 'abcde' && switched.state.index === 0 && switched.ghosts === 0 && !switched.state.markerVisible && switched.items === 5,
  switched);

console.log('\nerrors:', errors.length ? errors : 'none');
check('无控制台/页面错误', errors.length === 0, errors);

const failed = results.filter((r) => !r.ok);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过');
await browser.close();
if (failed.length) process.exitCode = 1;
