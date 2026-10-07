import assert from 'node:assert/strict';
import test from 'node:test';
import { recontactTrace } from './fixtures/trackpad-recontact.mjs';
import { missedSwipeTraces } from './fixtures/trackpad-missed-swipes.mjs';
import { strongSwipeTraces } from './fixtures/trackpad-strong-swipes.mjs';
import { rapidSwipeTraces } from './fixtures/trackpad-rapid-series.mjs';

const gestures = await import('../folder-gestures.mjs').catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});

function recognizer() {
  assert.equal(typeof gestures.createFolderGestureRecognizer, 'function');
  return gestures.createFolderGestureRecognizer();
}

function wheel(deltaX, deltaY = 0, timeStamp = 0, extra = {}) {
  return { deltaX, deltaY, timeStamp, deltaMode: 0, ...extra };
}

test('switches once after a deliberate horizontal gesture, not on its first small delta', () => {
  const gesture = recognizer();
  assert.deepEqual(gesture.handle(wheel(20, 2, 0)), { consume: true, direction: 0 });
  assert.deepEqual(gesture.handle(wheel(50, 3, 16)), { consume: true, direction: 1 });
  assert.deepEqual(gesture.handle(wheel(80, 0, 32)), { consume: true, direction: 0 });
});

test('allows the next gesture after a quiet gap in either direction', () => {
  const gesture = recognizer();
  assert.equal(gesture.handle(wheel(80)).direction, 1);
  assert.equal(gesture.handle(wheel(-90, 1, 500)).direction, -1);
  assert.equal(gesture.handle(wheel(90, 1, 1000)).direction, 1);
});

test('accepts recorded physical recontacts without a click or a long quiet gap', () => {
  const gesture = recognizer();
  const directions = recontactTrace.map(([time, x, y]) => gesture.handle(wheel(x, y, time)).direction);
  assert.deepEqual(directions.filter(Boolean), [1, -1, -1, 1]);
});

for (const trace of missedSwipeTraces) {
  test(`accepts each recorded missed swipe without a click: ${trace.name}`, () => {
    for (const mirror of [1, -1]) {
      const gesture = recognizer();
      const directions = trace.events.map(([time, x, y]) =>
        gesture.handle(wheel(x * mirror, y, time)).direction).filter(Boolean);
      assert.deepEqual(directions, trace.expected.map((direction) => direction * mirror));
    }
  });
}

for (const trace of strongSwipeTraces) {
  test(`recognizes every strong burst before the next gesture: ${trace.name}`, () => {
    for (const mirror of [1, -1]) {
      const gesture = recognizer();
      const changes = trace.events.flatMap(([time, x, y]) => {
        const { direction } = gesture.handle(wheel(x * mirror, y, time));
        return direction ? [{ time, direction }] : [];
      });
      assert.deepEqual(changes.map((e) => e.direction), trace.expected.map((d) => d * mirror));
      changes.forEach(({ time }, i) => {
        assert.ok(time >= trace.onsets[i] && time < trace.onsets[i] + 160,
          `burst ${i + 1} must confirm in its own recognition window, not a later gesture`);
      });
    }
  });
}

for (const trace of rapidSwipeTraces) {
  test(`rapid series recognizes whole impulses promptly, not their later tails: ${trace.name}`, () => {
    for (const mirror of [1, -1]) {
      const gesture = recognizer();
      const changes = trace.events.flatMap(([time, x, y]) => {
        const { direction } = gesture.handle(wheel(x * mirror, y, time));
        return direction ? [{ time, direction }] : [];
      });
      assert.deepEqual(changes.map(e => e.direction), trace.expected.map(d => d * mirror));
      changes.forEach(({ time }, i) => assert.ok(time >= trace.onsets[i] - 0.1 &&
        time <= trace.onsets[i] + trace.maxLatency,
      `impulse ${i + 1} recognized ${time - trace.onsets[i]} ms after observed onset`));
    }
  });
}

test('isolated low samples do not lower the reference of a plateau', () => {
  for (const values of [[60,2,60,60,60], [60,60,2,60,60], [60,60,60,2,60]]) {
    const gesture = recognizer();
    gesture.handle(wheel(100));
    gesture.handle(wheel(90, 0, 16));
    assert.deepEqual(values.map((x,i) => gesture.handle(wheel(x, 0, 56 + i*8)).direction)
      .filter(Boolean), []);
  }
});

test('sustained growth from a paired trough need not double a strong first sample', () => {
  const gesture = recognizer();
  const events = [[0,90],[16,80],[48,56],[56,50],[64,46],[72,58],[80,38],
    [88,34],[96,28],[104,30],[112,68],[120,84],[128,88],[136,88],[144,80]];
  assert.deepEqual(events.map(([time,x]) => gesture.handle(wheel(x, 0, time)).direction)
    .filter(Boolean), [1,1]);
});

test('small amplitude noise cannot turn a coasting plateau into an impulse', () => {
  for (const values of [[20,22,18,22,24,22], [100,110,90,100,108,120,112]]) {
    for (const sign of [-1,1]) {
      const gesture = recognizer();
      gesture.handle(wheel(160 * sign));
      gesture.handle(wheel(140 * sign, 0, 16));
      assert.deepEqual(values.map((x,i) => gesture.handle(wheel(x * sign, 0, 56 + i*8)).direction)
        .filter(Boolean), []);
    }
  }
});

test('an ambiguous onset begun during saving remains suppressed when it resolves horizontally', () => {
  const gesture = recognizer();
  gesture.handle(wheel(90));
  gesture.handle(wheel(80, 0, 16));
  const events = [[56,4,0],[64,10,-12],[65,2,-2],[86,126,-42],[90,4,-2],
    [110,186,-54],[115,88,-24],[119,38,-10],[127,44,-10],[137,26,-10],[144,32,-10]];
  assert.deepEqual(events.map(([time,x,y]) => gesture.handle(wheel(x,y,time),
    { pending: time === 56 }).direction).filter(Boolean), []);
});

test('ambiguous tiny recontact samples wait for enough horizontal evidence', () => {
  const gesture = recognizer();
  const events = [[0,90,0],[16,80,0],[56,4,0],[64,10,-12],[65,2,-2],
    [86,126,-42],[90,4,-2],[110,186,-54],[115,88,-24],[119,38,-10],
    [127,44,-10],[137,26,-10],[144,32,-10]];
  assert.deepEqual(events.map(([time,x,y]) => gesture.handle(wheel(x, y, time)).direction)
    .filter(Boolean), [1,1]);
});

test('clear vertical recontact is never converted by its subsequent horizontal tail', () => {
  const gesture = recognizer();
  gesture.handle(wheel(90));
  gesture.handle(wheel(80, 0, 16));
  assert.deepEqual(gesture.handle(wheel(2, 30, 56)), { consume:false, direction:0 });
  for (const [i,x] of [10,20,35,45,65].entries()) {
    assert.deepEqual(gesture.handle(wheel(x, 0, 64+i*8)), { consume:false, direction:0 });
  }
});

test('rapid impulse recovery survives stronger deltas without rejecting its first ambiguous samples', () => {
  for (const trace of rapidSwipeTraces) {
    for (const scale of [2,3,4]) {
      for (const sign of [-1,1]) {
        const gesture = recognizer();
        const directions = trace.events.map(([time,x,y]) =>
          gesture.handle(wheel(x * scale * sign,y * scale,time)).direction).filter(Boolean);
        assert.deepEqual(directions, trace.expected.map(d => d * sign), `${trace.name} at ${scale}x`);
      }
    }
  }
});

test('several diagonal onset samples lock out a later horizontal tail', () => {
  for (const scale of [1,4]) {
    const gesture = recognizer();
    gesture.handle(wheel(90));
    gesture.handle(wheel(80, 0, 16));
    const events = [[56,20,20],[64,20,20],[72,20,20],[80,80,0],[88,100,0],[96,120,0]];
    const directions = events.map(([time,x,y]) => gesture.handle(wheel(x * scale,y * scale,time)).direction);
    assert.deepEqual(directions.filter(Boolean), []);
  }
});

test('a strong onset still needs a fresh sustained acceleration before switching', () => {
  const gesture = recognizer();
  assert.equal(gesture.handle(wheel(100)).direction, 1);
  assert.equal(gesture.handle(wheel(110, 0, 16)).direction, 0);
  assert.equal(gesture.handle(wheel(50, 0, 56)).direction, 0);
  assert.equal(gesture.handle(wheel(75, 0, 64)).direction, 0);
  assert.equal(gesture.handle(wheel(105, 0, 72)).direction, 0);
  assert.equal(gesture.handle(wheel(120, 0, 80)).direction, 1);
  assert.equal(gesture.handle(wheel(115, 0, 88)).direction, 0);
});

test('large decaying tails, plateaus and isolated coalesced spikes never rearm', () => {
  for (const values of [[900,400,200,100,50], [60,60,60,60,60], [50,75,200,75,50]]) {
    const gesture = recognizer();
    gesture.handle(wheel(100));
    gesture.handle(wheel(110, 0, 16));
    const changes = values.map((x,i) => gesture.handle(wheel(x, 0, 56 + i * 8)).direction);
    assert.deepEqual(changes.filter(Boolean), []);
  }
});

for (const direction of [-1, 1]) {
  test(`a light onset supersedes an unconfirmed strong candidate in direction ${direction}`, () => {
    const gesture = recognizer();
    const events = [[0,90], [16,60], [48,50], [80,2 * direction],
      [88,10 * direction], [96,20 * direction], [104,35 * direction], [112,45 * direction]];
    assert.deepEqual(events.map(([time,x]) => gesture.handle(wheel(x, 0, time)).direction).filter(Boolean),
      [1, direction]);
  });
}

test('superseding a strong candidate cannot forget that it started while saving', () => {
  for (const direction of [-1, 1]) {
    const gesture = recognizer();
    const events = [[0,90], [16,60], [48,50], [80,2 * direction],
      [88,10 * direction], [96,20 * direction], [104,35 * direction], [112,45 * direction]];
    assert.deepEqual(events.map(([time,x]) => gesture.handle(wheel(x, 0, time),
      { pending: time === 48 }).direction).filter(Boolean), [1]);
  }
});

test('coarse but accelerating samples retain their candidate instead of restarting each time', () => {
  const gesture = recognizer();
  const events = [[0,90], [16,60], [48,50], [80,75], [112,105], [144,120]];
  assert.deepEqual(events.map(([time,x]) => gesture.handle(wheel(x, 0, time)).direction).filter(Boolean), [1,1]);
});

test('a strong candidate started while saving stays suppressed after saving ends', () => {
  const gesture = recognizer();
  gesture.handle(wheel(100));
  gesture.handle(wheel(110, 0, 16));
  const changes = [50,75,105,120,115].map((x,i) =>
    gesture.handle(wheel(x, 0, 56 + i * 8), { pending: i === 0 }).direction);
  assert.deepEqual(changes.filter(Boolean), []);
});

test('a single coalesced spike after a weak tail does not confirm a new impulse', () => {
  const gesture = recognizer();
  const events = [[0,90], [16,6], [56,12], [64,12], [72,60], [80,12], [88,10], [96,8]];
  const directions = events.map(([time,x]) => gesture.handle(wheel(x, 0, time)).direction);
  assert.deepEqual(directions.filter(Boolean), [1]);
});

test('constant modest momentum after a short interruption is not a new swipe', () => {
  const gesture = recognizer();
  const events = [[0,90], [16,20], [56,20], [64,20], [72,20], [80,20], [88,20]];
  assert.deepEqual(events.map(([time,x]) => gesture.handle(wheel(x, 0, time)).direction).filter(Boolean), [1]);
});

for (const direction of [-1, 1]) {
  test(`an expired coasting candidate does not swallow a new onset in direction ${direction}`, () => {
    const gesture = recognizer();
    const events = [[0,90], [16,16], [48,14],
      [96,2 * direction], [104,10 * direction], [112,20 * direction],
      [120,35 * direction], [128,45 * direction]];
    const directions = events.map(([time,x]) => gesture.handle(wheel(x, 0, time)).direction);
    assert.deepEqual(directions.filter(Boolean), [1, direction]);
  });
}

test('pending writes do not poison the next physical gesture with a hard block', () => {
  const gesture = recognizer();
  let pendingUntil = -1;
  const directions = [];
  for (const [time, x, y] of recontactTrace) {
    const { direction } = gesture.handle(wheel(x, y, time), { pending: time < pendingUntil });
    if (direction) { directions.push(direction); pendingUntil = time + 45; }
  }
  assert.deepEqual(directions, [1, -1, -1, 1]);
});

test('a gesture started during a pending write is discarded, not queued for after it', () => {
  const gesture = recognizer();
  assert.equal(gesture.handle(wheel(35, 0, 0), { pending: true }).direction, 0);
  assert.equal(gesture.handle(wheel(50, 0, 16)).direction, 0);
  assert.equal(gesture.handle(wheel(50, 0, 32)).direction, 0);
  assert.equal(gesture.handle(wheel(80, 0, 500)).direction, 1);
});

test('recontact that starts during a pending write stays suppressed after the write completes', () => {
  const gesture = recognizer();
  const directions = [[0,90,false], [16,30,true], [64,2,true], [72,10,true], [80,20,false], [88,35,false]]
    .map(([time,x,pending]) => gesture.handle(wheel(x, 0, time), { pending }).direction);
  assert.deepEqual(directions.filter(Boolean), [1]);
  assert.equal(gesture.handle(wheel(-80, 0, 500)).direction, -1);
});

test('a small pause within recontact cannot reseed it and forget its pending start', () => {
  for (const sign of [-1, 1]) {
    const gesture = recognizer();
    const directions = [[0,90,false], [16,30,true], [64,1,true], [96,1,false],
      [104,10,false], [112,20,false], [120,35,false]]
      .map(([time,x,pending]) => gesture.handle(wheel(sign * x, 0, time), { pending }).direction);
    assert.deepEqual(directions.filter(Boolean), [sign]);
  }
});

test('a fresh accelerating impulse can interrupt even a weak momentum tail', () => {
  const gesture = recognizer();
  const directions = [90,60,40,25,15,9,6,3]
    .map((x,index) => gesture.handle(wheel(x, 0, index * 16)).direction);
  for (const [index,x] of [-1,-7,-19,-21,-31,-41].entries()) {
    directions.push(gesture.handle(wheel(x, 0, 160 + index * 8)).direction);
  }
  assert.deepEqual(directions.filter(Boolean), [1, -1]);
});

test('recontact after a one-pixel tail does not require an impossible threefold drop', () => {
  const gesture = recognizer();
  const directions = [90,60,40,25,15,9,6,3,1]
    .map((x,index) => gesture.handle(wheel(x, 0, index * 16)).direction);
  for (const [index,x] of [-1,-7,-19,-21,-31,-41].entries()) {
    directions.push(gesture.handle(wheel(x, 0, 176 + index * 8)).direction);
  }
  assert.deepEqual(directions.filter(Boolean), [1, -1]);
});

test('recorded recontacts remain distinct at higher trackpad delta magnitudes', () => {
  for (const scale of [2, 3, 4]) {
    const gesture = recognizer();
    const directions = recontactTrace.map(([time,x,y]) => gesture.handle(wheel(x * scale, y * scale, time)).direction);
    assert.deepEqual(directions.filter(Boolean), [1, -1, -1, 1], `scale ${scale}`);
  }
});

test('small plateaued momentum after a brief gap does not rearm without acceleration', () => {
  const gesture = recognizer();
  const directions = [gesture.handle(wheel(90)).direction, gesture.handle(wheel(1, 0, 16)).direction];
  for (let time = 64; time < 320; time += 8) {
    directions.push(gesture.handle(wheel(1, 0, time)).direction);
  }
  assert.deepEqual(directions.filter(Boolean), [1]);
});

test('a gap and smaller coasting deltas alone do not count as a fresh gesture', () => {
  const gesture = recognizer();
  const directions = [gesture.handle(wheel(90, 0, 0)).direction];
  for (const [time, x] of [[16,60], [32,40], [48,25], [96,7]]) {
    directions.push(gesture.handle(wheel(x, 0, time)).direction);
  }
  for (let time = 104; time < 320; time += 8) {
    directions.push(gesture.handle(wheel(6, 0, time)).direction);
  }
  assert.deepEqual(directions.filter(Boolean), [1]);
});

test('a coalesced late momentum spike does not rearm navigation', () => {
  const gesture = recognizer();
  const directions = [[0,90], [16,50], [32,30], [240,900], [248,40], [256,30]]
    .map(([time, x]) => gesture.handle(wheel(x, 0, time)).direction);
  assert.deepEqual(directions.filter(Boolean), [1]);
});

test('a late coalesced spike cannot confirm a small coasting recontact candidate', () => {
  const gesture = recognizer();
  const directions = [[0,90], [16,60], [32,40], [48,25], [96,7], [104,6], [232,60]]
    .map(([time,x]) => gesture.handle(wheel(x, 0, time)).direction);
  assert.deepEqual(directions.filter(Boolean), [1]);
});

test('diagonal recontact and hard-blocked input cannot rearm a prior swipe', () => {
  for (const guard of ['diagonal', 'blocked', 'header']) {
    const gesture = recognizer();
    gesture.handle(wheel(90));
    gesture.handle(wheel(30, 0, 16));
    if (guard === 'header') gesture.block(32);
    const directions = [[64,2], [72,10], [80,20], [88,35], [96,45]].map(([time,x]) =>
      gesture.handle(wheel(x, guard === 'diagonal' ? x : 0, time),
        { blocked: guard === 'blocked' }).direction);
    assert.deepEqual(directions.filter(Boolean), []);
  }
});

test('ignores long momentum tails and their direction reversal until the gesture ends', () => {
  const gesture = recognizer();
  const directions = [gesture.handle(wheel(90)).direction];
  for (let time = 40; time <= 3000; time += 40) {
    directions.push(gesture.handle(wheel(time < 1000 ? 60 : -25, 1, time)).direction);
  }
  assert.deepEqual(directions.filter(Boolean), [1]);
  assert.equal(gesture.handle(wheel(-90, 0, 3500)).direction, -1);
});

test('does not let short movements accumulate across separate gestures', () => {
  const gesture = recognizer();
  assert.equal(gesture.handle(wheel(20, 0, 0)).direction, 0);
  assert.equal(gesture.handle(wheel(30, 0, 500)).direction, 0);
  assert.equal(gesture.handle(wheel(30, 0, 1000)).direction, 0);
});

test('leaves vertical scrolling untouched and cannot turn its tail into folder navigation', () => {
  const gesture = recognizer();
  assert.deepEqual(gesture.handle(wheel(3, 30)), { consume: false, direction: 0 });
  assert.deepEqual(gesture.handle(wheel(90, 1, 16)), { consume: false, direction: 0 });
  assert.equal(gesture.handle(wheel(90, 1, 500)).direction, 1);
});

test('rejects diagonal intent rather than stealing a vertical scroll', () => {
  const gesture = recognizer();
  assert.deepEqual(gesture.handle(wheel(20, 18)), { consume: false, direction: 0 });
  assert.deepEqual(gesture.handle(wheel(90, 1, 16)), { consume: false, direction: 0 });
});

test('a short horizontal prefix cannot turn a mostly diagonal gesture into a swipe', () => {
  const gesture = recognizer();
  assert.equal(gesture.handle(wheel(8, 0, 0)).direction, 0);
  assert.deepEqual(gesture.handle(wheel(30, 29, 16)), { consume: false, direction: 0 });
  assert.deepEqual(gesture.handle(wheel(30, 29, 32)), { consume: false, direction: 0 });
});

test('does not cancel vertical movement after a horizontal gesture', () => {
  const gesture = recognizer();
  gesture.handle(wheel(90));
  assert.deepEqual(gesture.handle(wheel(0, 60, 16)), { consume: false, direction: 0 });
  assert.deepEqual(gesture.handle(wheel(90, 0, 32)), { consume: false, direction: 0 });
});

test('ignores tiny jitter without preventing the default action', () => {
  const gesture = recognizer();
  assert.deepEqual(gesture.handle(wheel(1, 1)), { consume: false, direction: 0 });
  assert.deepEqual(gesture.handle(wheel(0, 0, 16)), { consume: false, direction: 0 });
});

for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
  test(`does not intercept ${modifier} gestures or their unmodified tail`, () => {
    const gesture = recognizer();
    assert.deepEqual(gesture.handle(wheel(90, 0, 0, { [modifier]: true })), {
      consume: false, direction: 0,
    });
    assert.deepEqual(gesture.handle(wheel(90, 0, 16)), { consume: false, direction: 0 });
  });
}

test('blocks gestures during dialogs, editing, or dragging', () => {
  const gesture = recognizer();
  assert.deepEqual(gesture.handle(wheel(90), { blocked: true }), { consume: false, direction: 0 });
  assert.equal(gesture.handle(wheel(90, 0, 16)).direction, 0);
  assert.equal(gesture.handle(wheel(90, 0, 500)).direction, 1);
});

test('does not turn momentum from the folder row into a content swipe', () => {
  const gesture = recognizer();
  assert.equal(typeof gesture.block, 'function');
  gesture.block(0);
  assert.deepEqual(gesture.handle(wheel(90, 0, 16)), { consume: false, direction: 0 });
  assert.equal(gesture.handle(wheel(90, 0, 500)).direction, 1);
});

test('normalizes line and page wheel units before applying the gesture threshold', () => {
  const gesture = recognizer();
  assert.equal(gesture.handle(wheel(3, 0, 0, { deltaMode: 1 })).direction, 0);
  assert.equal(gesture.handle(wheel(2, 0, 16, { deltaMode: 1 })).direction, 1);
  assert.equal(gesture.handle(wheel(-1, 0, 500, { deltaMode: 2 })).direction, -1);
});

test('invalid wheel data cannot trigger navigation or poison a later gesture', () => {
  for (const event of [wheel(NaN), wheel(Infinity), wheel(90, NaN), wheel(90, 0, 0, { deltaMode: 3 })]) {
    const gesture = recognizer();
    assert.deepEqual(gesture.handle(event), { consume: false, direction: 0 });
    assert.equal(gesture.handle(wheel(90, 0, 500)).direction, 1);
  }
});

test('selects adjacent visible folders including All without exposing the internal root folder', () => {
  assert.equal(typeof gestures.getAdjacentFolderId, 'function');
  const folders = [{ id: 'root' }, { id: 'work' }, { id: 'personal' }, { id: 'empty' }];
  const original = structuredClone(folders);
  for (const [selected, direction, expected] of [
    ['all', 1, 'work'], ['work', 1, 'personal'], ['personal', -1, 'work'],
    ['work', -1, 'all'], ['personal', 1, 'empty'],
    ['all', -1, null], ['empty', 1, null], ['missing', 1, null], ['root', 1, null],
    ['all', 0, null], ['all', 2, null],
  ]) {
    assert.equal(gestures.getAdjacentFolderId(folders, selected, direction), expected);
  }
  assert.deepEqual(folders, original);
});

test('uses current folder order and safely handles an empty navigation list', () => {
  assert.equal(typeof gestures.getAdjacentFolderId, 'function');
  assert.equal(gestures.getAdjacentFolderId([{ id: 'root' }], 'all', 1), null);
  assert.equal(gestures.getAdjacentFolderId([{ id: 'personal' }, { id: 'work' }], 'all', 1), 'personal');
  assert.equal(gestures.getAdjacentFolderId([{ id: 'personal' }], 'work', -1), null);
});
