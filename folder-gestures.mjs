const SWIPE_DISTANCE = 64;
const INTENT_DISTANCE = 8;
const AXIS_RATIO = 1.8;
const QUIET_GAP_MS = 250;
const RECONTACT_GAP_MS = 24;
const RECONTACT_WINDOW_MS = 160;
const RECONTACT_SAMPLE_GAP_MS = 40;

function createImpulse(now, x, pending) {
  return {
    started: now, sign: Math.sign(x), initial: Math.abs(x),
    x: 0, y: 0, count: 0, pending, previous: null, floor: Infinity, offAxisSamples: 0,
  };
}

// Observe an interrupted stream before deciding whether it is a new impulse.
// Pair maxima establish its lower envelope; pair minima establish sustained
// growth. One unusually small or coalesced large sample cannot establish both.
// Unlike doubling the first sample, this also accepts a front-loaded onset
// which briefly slows down before continuing. Only scalar state is retained.
function observeImpulse(impulse, x, y, pending) {
  impulse.pending ||= pending;
  impulse.x += x;
  impulse.y += Math.abs(y);
  impulse.count += 1;
  const horizontal = Math.abs(impulse.x);
  const vertical = impulse.y;
  const horizontalIntent = horizontal >= vertical * AXIS_RATIO;
  impulse.offAxisSamples = Math.abs(x) < Math.abs(y) * AXIS_RATIO
    ? impulse.offAxisSamples + 1 : 0;
  const clearVertical = vertical >= INTENT_DISTANCE && vertical >= horizontal * AXIS_RATIO;
  const enoughIntent = Math.max(horizontal, vertical) >= SWIPE_DISTANCE;
  // A faster version of the same noisy start may reach 64px in only 2–3
  // samples. Give ambiguous starts four samples, not an amplitude-dependent
  // deadline. Repeated diagonal evidence or clear vertical intent still locks
  // immediately, so its later horizontal tail cannot become navigation.
  if (Math.sign(x) !== impulse.sign || clearVertical ||
      impulse.offAxisSamples >= 3 ||
      (enoughIntent && impulse.count >= 4 && !horizontalIntent)) return 'rejected';

  const magnitude = Math.abs(x);
  const previous = impulse.previous;
  impulse.previous = magnitude;
  if (previous === null) return 'pending';
  impulse.floor = Math.min(impulse.floor, Math.max(previous, magnitude));
  const sustained = Math.min(previous, magnitude);
  const growing = sustained - impulse.floor >= Math.max(INTENT_DISTANCE, impulse.floor / 3);
  return impulse.count >= 3 && horizontal >= SWIPE_DISTANCE && horizontalIntent && growing
    ? 'confirmed' : 'pending';
}

export function createFolderGestureRecognizer() {
  let distance = 0;
  let verticalDistance = 0;
  let triggered = false;
  let axis = null;
  let lastEventTime = null;
  let lastMagnitude = 0;
  let guarded = false;
  let suppressed = false;
  let recontact = null;

  function advance(timeStamp) {
    const now = Number.isFinite(timeStamp) ? timeStamp : performance.now();
    const gap = lastEventTime === null ? Infinity : now - lastEventTime;
    // Quiet is one boundary, but physical recontact can interrupt momentum
    // without a long pause. A confirmed fresh impulse handles that below.
    if (gap >= QUIET_GAP_MS || gap < 0) {
      distance = 0;
      verticalDistance = 0;
      triggered = false;
      axis = null;
      lastMagnitude = 0;
      guarded = false;
      suppressed = false;
      recontact = null;
    }
    lastEventTime = now;
    return { now, gap };
  }

  return {
    block(timeStamp) {
      advance(timeStamp);
      axis = 'blocked';
      guarded = true;
      recontact = null;
    },

    handle(event, { blocked = false, pending = false } = {}) {
      const { now, gap } = advance(event.timeStamp);
      const { deltaX, deltaY, deltaMode = 0 } = event;
      if (
        blocked || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
        !Number.isFinite(deltaX) || !Number.isFinite(deltaY) ||
        ![0, 1, 2].includes(deltaMode)
      ) {
        axis = 'blocked';
        guarded = true;
        recontact = null;
      }
      if (guarded || (deltaX === 0 && deltaY === 0)) {
        return { consume: false, direction: 0 };
      }

      // Line units get a conservative CSS line estimate; a full page movement
      // already represents a deliberate gesture regardless of viewport size.
      const scale = deltaMode === 1 ? 16 : deltaMode === 2 ? SWIPE_DISTANCE : 1;
      const x = deltaX * scale;
      const y = deltaY * scale;
      const magnitude = Math.abs(x);
      lastMagnitude = magnitude;
      if (pending) suppressed = true;

      // Discard an expired candidate before considering this event: it may
      // itself be the onset of the next gesture. Keep an active candidate
      // intact, including whether it began during a pending write.
      if (recontact && (now - recontact.started > RECONTACT_WINDOW_MS ||
          gap > RECONTACT_SAMPLE_GAP_MS)) {
        recontact = null;
        axis = 'blocked';
      }

      // Coast -> candidate -> confirmed impulse -> coast. An interruption only
      // starts observation; the bounded sequence must establish renewed intent.
      // A pause, reversal, plateau or one coalesced spike is not enough.
      // A smaller or reversed onset after another interruption supersedes an
      // unconfirmed coast. Rising samples keep their candidate even at a slower
      // cadence. Replacing a candidate must not discard its pending-start guard.
      const freshOnset = !recontact || magnitude < recontact.initial || Math.sign(x) !== recontact.sign;
      if (freshOnset && (triggered || suppressed) && gap >= RECONTACT_GAP_MS && magnitude > 0) {
        const pendingStart = Boolean(recontact?.pending || pending);
        recontact = createImpulse(now, x, pendingStart);
      }
      if (recontact) {
        const observation = observeImpulse(recontact, x, y, pending);
        if (observation === 'rejected') {
          recontact = null;
          axis = 'blocked';
          return { consume: false, direction: 0 };
        }
        if (observation === 'pending') {
          return { consume: magnitude >= Math.abs(y) * AXIS_RATIO, direction: 0 };
        }
        distance = recontact.x - x;
        verticalDistance = recontact.y - Math.abs(y);
        axis = 'horizontal';
        triggered = false;
        suppressed = recontact.pending;
        recontact = null;
      }
      if (axis === 'blocked') return { consume: false, direction: 0 };
      distance += x;
      verticalDistance += Math.abs(y);

      if (axis === null) {
        if (Math.max(Math.abs(distance), verticalDistance) < INTENT_DISTANCE) {
          return { consume: false, direction: 0 };
        }
        axis = Math.abs(distance) >= verticalDistance * AXIS_RATIO ? 'horizontal' : 'blocked';
      }
      if (axis === 'blocked' || Math.abs(distance) < verticalDistance * AXIS_RATIO || Math.abs(y) > Math.abs(x)) {
        axis = 'blocked';
        return { consume: false, direction: 0 };
      }

      const direction = !triggered && !suppressed && Math.abs(distance) >= SWIPE_DISTANCE
        ? Math.sign(distance)
        : 0;
      if (direction) triggered = true;
      return { consume: true, direction };
    },
  };
}

export function getAdjacentFolderId(folders, selectedFolderId, direction) {
  if (direction !== -1 && direction !== 1) return null;
  const ids = ['all', ...folders.filter(({ id }) => id !== 'root').map(({ id }) => id)];
  const index = ids.indexOf(selectedFolderId);
  return index === -1 ? null : ids[index + direction] ?? null;
}
