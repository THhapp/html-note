#!/usr/bin/env node
/* Narrow (390x500) attention-order check: the whole union range must stay above the sticky footer. */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { openNotePage } from '../../scripts/lib/note-browser.mjs';

const entry = process.argv[2] || fileURLToPath(new URL('../../examples/attention-order/index.html', import.meta.url));
const { page, close, observations } = await openNotePage({ entry, width: 390, height: 500 });
try {
  await page.waitForFunction(() => window.AttentionOrder?.session.getState().phase === 'idle');
  const result = await page.evaluate(async () => {
    const session = window.AttentionOrder.session;
    const parts = ['request', 'stock', 'eligibility', 'record', 'receipt'];
    function read() {
      const stage = document.querySelector('[data-attention-order-host] .nblk-demo-stage');
      const footer = stage.querySelector('.nblk-demo-stage__footer');
      const footerRect = footer.getBoundingClientRect();
      const boxes = Array.from(document.querySelectorAll('.note-demo-attention[data-nx-state="shown"] .nx-focus__box'))
        .map((node) => { const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; });
      return {
        phase: session.getState().phase,
        frame: session.getState().settledFrameId,
        scrollY: Math.round(scrollY),
        footer: { top: footerRect.top, bottom: footerRect.bottom },
        boxes,
        cards: Object.fromEntries(parts.map((part) => {
          const card = document.querySelector('[data-part="' + part + '"]');
          const value = card.querySelector('[data-value]');
          const rect = card.getBoundingClientRect();
          return [part, {
            text: value.textContent.trim(),
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            visible: rect.top >= 0 && rect.bottom <= footerRect.top - 1 && Number(getComputedStyle(value).opacity) > 0.99
          }];
        }))
      };
    }
    const landed = [];
    const ready = {};
    const watch = NoteDemo.timingFacts.watch(session, {
      onFact(fact) {
        if (fact.kind === 'focus-arrival') queueMicrotask(() => { landed[fact.index] = read(); });
        if (fact.kind === 'ready' && fact.group === 'borrow') queueMicrotask(() => { ready.borrow = read(); });
      }
    });
    const next = await session.next();
    watch.stop();
    return { next, landed, ready, terminal: read() };
  });
  assert.equal(result.next.status, 'completed');
  assert.equal(result.landed.length, 3);
  const joint = result.landed[1];
  for (const part of ['stock', 'eligibility', 'record']) {
    assert.equal(joint.cards[part].visible, true, part + ' must be fully above the footer at focus arrival');
    assert.ok(joint.cards[part].text.trim(), part + ' must have readable text');
    assert.ok(joint.cards[part].bottom <= joint.footer.top - 1, part + ' must not be covered by the footer');
  }
  // The union focus box should cover the same three-card observation range, not just stock.
  assert.ok(joint.boxes.some((box) => box.height >= 250), 'narrow joint focus box should span the union range');
  assert.deepEqual(
    ['stock', 'eligibility', 'record'].map((part) => joint.cards[part].text),
    ['当前可借 1 本', '资格有效', '已登记 1 本'],
    'focus arrival exposes the readable values of the released borrow group'
  );
  assert.equal(result.ready.borrow.cards.record.text, '已登记 1 本');
  for (const part of ['stock', 'eligibility', 'record']) {
    assert.equal(result.ready.borrow.cards[part].visible, true, part + ' must stay visible after the borrow group reveals');
  }
  // When the whole union is taller than the usable viewport, the current main target
  // (stock) stays readable; the members keep their own scroll path instead of pulling both edges.
  await page.setViewportSize({ width: 390, height: 400 });
  const tall = await page.evaluate(async () => {
    const session = window.AttentionOrder.session;
    const host = document.querySelector('[data-attention-order-host]');
    await session.go('initial');
    window.scrollTo(0, 0);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const read = () => {
      const footer = host.querySelector('.nblk-demo-stage__footer').getBoundingClientRect();
      const stock = host.querySelector('[data-part="stock"]').getBoundingClientRect();
      const record = host.querySelector('[data-part="record"]').getBoundingClientRect();
      return {
        phase: session.getState().phase,
        footerTop: footer.top,
        stock: { top: stock.top, bottom: stock.bottom },
        record: { top: record.top, bottom: record.bottom },
        stockVisible: stock.top >= 0 && stock.bottom <= footer.top - 1
      };
    };
    const next = session.next();
    let sample = null;
    for (let i = 0; i < 240; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      const current = read();
      if (current.phase === 'running' && current.stockVisible) { sample = current; break; }
    }
    await next;
    return sample;
  });
  assert.ok(tall && tall.stockVisible, 'tall union keeps the main stock target readable');
  assert.ok(tall.record.bottom > tall.footerTop - 1, 'tall union leaves associated members on a scroll path');
  assert.deepEqual(observations.pageErrors, []);
  assert.deepEqual(observations.consoleErrors, []);
  assert.deepEqual(observations.externalRequests, []);
  console.log('PASS narrow union landing: stock, eligibility, and record all remain above the sticky footer');
} finally {
  await close();
}
