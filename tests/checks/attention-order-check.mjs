#!/usr/bin/env node
/* Checks the rendered landing, range, and content handoff using real next(). */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { openNotePage } from '../../scripts/lib/note-browser.mjs';

const entry = process.argv[2] || fileURLToPath(new URL('../../examples/attention-order/index.html', import.meta.url));
const { page, close, observations } = await openNotePage({ entry, width: 1280, height: 900 });
try {
  await page.waitForFunction(() => window.AttentionOrder?.session.getState().phase === 'idle');
  const result = await page.evaluate(async () => {
    const session = window.AttentionOrder.session;
    const parts = ['request', 'stock', 'eligibility', 'record', 'receipt'];
    function read() {
      const box = document.querySelector('.nx-focus__box')?.getBoundingClientRect();
      const state = session.getState();
      return {
        phase: state.phase,
        frame: state.settledFrameId,
        cards: Object.fromEntries(parts.map((part) => {
          const card = document.querySelector('[data-part="' + part + '"]');
          const label = card.querySelector('[data-value]');
          const rect = card.getBoundingClientRect();
          let opacity = 1;
          for (let node = label; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            opacity *= style.visibility === 'visible' && style.display !== 'none' ? Number(style.opacity) : 0;
          }
          const covered = !!box && box.left <= rect.left + 1 && box.top <= rect.top + 1 &&
            box.right >= rect.right - 1 && box.bottom >= rect.bottom - 1;
          return [part, { text: label.textContent, opacity, covered }];
        }))
      };
    }

    const initial = read();
    const facts = [];
    const landed = [];
    const ready = {};
    const watch = NoteDemo.timingFacts.watch(session, {
      onFact(fact) {
        facts.push(fact);
        // Capture the visual after synchronous release, before a progress frame can change it.
        if (fact.kind === 'focus-arrival') queueMicrotask(() => { landed[fact.index] = read(); });
        if (fact.kind === 'ready' && fact.group) ready[fact.group] = read();
      }
    });
    const next = await session.next();
    watch.stop();
    const terminal = read();

    const replay = await session.replay();
    const replayed = read();
    await session.go('initial');

    let cancel;
    const cancelWatch = NoteDemo.timingFacts.watch(session, {
      onFact(fact) {
        if (fact.kind === 'effect-start' && fact.group === 'borrow' && !cancel) {
          queueMicrotask(() => { cancel = session.prev(); });
        }
      }
    });
    await session.next();
    await cancel;
    cancelWatch.stop();
    return { initial, next, terminal, landed, ready, facts, replay, replayed, cancelled: read() };
  });

  const sourceText = ['林同学 ·《网络基础》', '当前可借 1 本', '等待核对', '尚未登记', '待生成'];
  const targetText = ['林同学 ·《网络基础》', '当前可借 1 本', '资格有效', '已登记 1 本', '11 月 20 日到期'];
  const texts = (snapshot) => Object.values(snapshot.cards).map((card) => card.text);
  const fullyReadable = (snapshot, parts) => {
    for (const part of parts) {
      const card = snapshot.cards[part];
      assert.ok(card.covered && card.opacity === 1 && card.text.trim(), part + ' must be inside Focus and readable');
    }
  };
  assert.deepEqual(texts(result.initial), sourceText);
  assert.equal(result.next.status, 'completed');
  assert.equal(result.landed.length, 3);

  fullyReadable(result.landed[0], ['request']);
  assert.deepEqual(texts(result.landed[0]), sourceText, 'pending results stay at source during the evidence beat');

  fullyReadable(result.landed[1], ['stock', 'eligibility', 'record']);
  assert.deepEqual(texts(result.landed[1]), [...targetText.slice(0, 4), sourceText[4]]);
  assert.equal(result.landed[1].cards.receipt.covered, false, 'distinct result has its own focus beat');
  fullyReadable(result.ready.borrow, ['stock', 'eligibility', 'record']);
  assert.equal(result.ready.borrow.cards.receipt.text, sourceText[4]);

  assert.ok(result.initial.cards.receipt.opacity < 1, 'the pending receipt starts de-emphasized');
  fullyReadable(result.landed[2], ['receipt']);
  assert.deepEqual(texts(result.landed[2]), targetText);
  assert.deepEqual(texts(result.ready.receipt), targetText);
  const find = (kind, name) => result.facts.findIndex((fact) =>
    fact.kind === kind && (fact.group === name || fact.groups?.includes(name)));
  assert.ok(find('focus-arrival', 'borrow') >= 0);
  assert.ok(find('focus-arrival', 'borrow') < find('effect-start', 'borrow'));
  assert.ok(find('effect-start', 'borrow') < find('ready', 'borrow'));
  assert.ok(find('ready', 'borrow') < find('focus-arrival', 'receipt'));

  assert.equal(result.terminal.frame, 'expanded');
  assert.equal(result.replay.status, 'completed');
  assert.deepEqual(texts(result.replayed), targetText);
  assert.equal(result.cancelled.phase, 'idle');
  assert.equal(result.cancelled.frame, 'initial');
  assert.deepEqual(texts(result.cancelled), sourceText);
  await page.waitForFunction(() => !document.querySelector('.nx-focus[data-nx-state="shown"]'));

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  const reduced = await page.evaluate(async () => {
    const session = window.AttentionOrder.session;
    const next = await session.next();
    const values = [...document.querySelectorAll('[data-value]')].map((node) => node.textContent);
    return { next, values, focus: document.querySelectorAll('.nx-focus').length };
  });
  assert.equal(reduced.next.status, 'completed');
  assert.deepEqual(reduced.values, targetText);
  assert.equal(reduced.focus, 0);
  assert.deepEqual(observations.pageErrors, []);
  assert.deepEqual(observations.consoleErrors, []);
  assert.deepEqual(observations.externalRequests, []);
  console.log('PASS readable landing, combined range, emphasis handoff, replay, cancel, and reduced motion');
} finally {
  await close();
}
