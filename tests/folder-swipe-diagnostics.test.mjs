import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { recontactTrace } from './fixtures/trackpad-recontact.mjs';
import { createFolderGestureRecognizer } from '../folder-gestures.mjs';

const diagnostic = await import('../scripts/diagnose-folder-swipes.mjs').catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});

test('diagnostic records only after Start, strips private data and stops at the event limit', () => {
  assert.equal(typeof diagnostic.createTraceBuffer, 'function');
  let time = 100;
  const trace = diagnostic.createTraceBuffer({ now: () => time, limit: 2 });
  trace.push({ kind: 'wheel', deltaX: 9 });
  assert.equal(trace.snapshot().events.length, 0);
  trace.start();
  time += 10;
  trace.push({ kind: 'wheel', deltaX: 9, url: 'https://private.example', title: 'Private',
    target: 'secret-content', before: { triggered: true, url: 'private' } });
  trace.push({ kind: 'selection', selected: 3 });
  trace.push({ kind: 'wheel', deltaX: 100 });
  assert.equal(trace.snapshot().events.length, 2);
  assert.equal(trace.snapshot().reason, 'limit');
  assert.deepEqual(trace.snapshot().events[0], { kind: 'wheel', elapsed: 10, deltaX: 9, before: { triggered: true } });
});

test('diagnostic capture ends after 60 seconds and can restart with an empty bounded buffer', () => {
  assert.equal(typeof diagnostic.createTraceBuffer, 'function');
  let time = 0;
  const trace = diagnostic.createTraceBuffer({ now: () => time });
  trace.start();
  time = 60_000;
  trace.push({ kind: 'wheel', deltaX: 1 });
  assert.equal(trace.snapshot().reason, 'timeout');
  assert.equal(trace.snapshot().events.length, 0);
  trace.start();
  trace.push({ kind: 'wheel', deltaX: 2 });
  trace.stop('manual');
  trace.push({ kind: 'wheel', deltaX: 3 });
  assert.equal(trace.snapshot().events.length, 1);
  assert.equal(trace.snapshot().reason, 'manual');
});

test('latency diagnostics retain only numeric timings and an explicit user marker', () => {
  const trace = diagnostic.createTraceBuffer({ now: () => 100 });
  trace.start();
  trace.push({ kind: 'wheel', deliveryMs: 4, handlerMs: 2, recognizerMs: 0.1, url: 'private' });
  trace.push({ kind: 'frame', frameOpportunityMs: 10, selected: 2, eventTime: 24, title: 'private' });
  trace.push({ kind: 'longtask', durationMs: 70, eventTime: 40, attribution: ['private'] });
  trace.push({ kind: 'marker', key: 'private', text: 'private' });
  assert.deepEqual(trace.snapshot().events, [
    { kind: 'wheel', elapsed: 0, deliveryMs: 4, handlerMs: 2, recognizerMs: 0.1 },
    { kind: 'frame', elapsed: 0, frameOpportunityMs: 10, selected: 2, eventTime: 24 },
    { kind: 'longtask', elapsed: 0, durationMs: 70, eventTime: 40 },
    { kind: 'marker', elapsed: 0 },
  ]);
});

test('temporary recognizer instrumentation leaves every recorded gesture decision unchanged', async () => {
  assert.equal(typeof diagnostic.instrumentRecognizer, 'function');
  const source = await readFile(new URL('../folder-gestures.mjs', import.meta.url), 'utf8');
  let readState;
  globalThis.__folderSwipeQA = { attachState(reader) { readState = reader; } };
  try {
    const instrumented = await import(`data:text/javascript;base64,${Buffer.from(diagnostic.instrumentRecognizer(source)).toString('base64')}`);
    const original = createFolderGestureRecognizer();
    const observed = instrumented.createFolderGestureRecognizer();
    for (const [timeStamp, deltaX, deltaY] of recontactTrace) {
      const event = { timeStamp, deltaX, deltaY, deltaMode: 0 };
      assert.deepEqual(observed.handle(event), original.handle(event));
    }
    assert.equal(typeof readState().triggered, 'boolean');
    assert.equal(typeof readState().distance, 'number');
    assert.throws(() => diagnostic.instrumentRecognizer('unrelated source'), /anchor/);
  } finally {
    delete globalThis.__folderSwipeQA;
  }
});
