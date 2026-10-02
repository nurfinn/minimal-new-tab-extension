export const UPDATE_PENDING_KEY = 'minimalTab.update.pending.v1';
export const UPDATE_SNOOZE_KEY = 'minimalTab.update.snooze.v1';
export const UPDATE_PEER = '__minimalTabUpdatePageV1';
export const UPDATE_SNOOZE_MS = 86_400_000;
const hooks = new WeakMap();

// Only metadata and a narrow guard cross extension-page boundaries.
export function registerUpdatePage({ window, safety, service }) {
  const hook = hooks.get(service);
  if (!hook || window[UPDATE_PEER]) throw new Error('Invalid update page registration');
  const id = crypto.randomUUID();
  let token = null, phase = 'idle';
  let unresolved = true;
  function release(value, { notDispatched = false } = {}) {
    if (token !== value || (phase === 'committed' && !notDispatched)) return;
    token = null; phase = 'idle'; safety.setInputLocked(false); hook.phase('idle');
  }
  function inspect() {
    if (phase === 'preparing') {
      // A closed coordinator cannot leave an uncommitted lease behind.
      const owner = token.split('/')[0];
      if (!hook.views().some(view => view[UPDATE_PEER]?.id === owner)) release(token);
    }
    return { protocol: 1, reason: unresolved ? 'unknown-context' : safety.getBlockReason(), token, phase };
  }
  const peer = {
    protocol: 1, id, inspect,
    acquire(value) {
      const status = inspect();
      if (status.reason !== null || (token && token !== value) || phase === 'committed') return false;
      token = value; phase = 'preparing';
      try { safety.setInputLocked(true); } catch (error) { release(value); throw error; }
      hook.phase('preparing');
      return true;
    },
    commit(value) {
      if (token !== value || phase !== 'preparing' || safety.getBlockReason() !== null) return false;
      phase = 'committed'; hook.phase('committed'); return true;
    },
    release,
    defer: service.defer,
  };
  window[UPDATE_PEER] = peer;
  hook.id = id;
  // Register before the application becomes interactive. A pending command is
  // not cancelled merely because another new-tab page starts loading.
  try {
    const existing = hook.views();
    if (!Array.isArray(existing)) throw new Error('Unknown view set');
    let inheritedUncertainty = false;
    for (const view of existing) {
      if (view === window) continue;
      const other = view[UPDATE_PEER]?.inspect();
      if (other?.token && ['preparing','committed'].includes(other.phase)) {
        token = other.token; phase = other.phase;
        inheritedUncertainty = other.reason === 'unknown-context';
        safety.setInputLocked(true); hook.phase(inheritedUncertainty ? 'recovery' : phase); break;
      }
    }
    unresolved = inheritedUncertainty;
  } catch {
    // We cannot rule out an already dispatched command in another page. An
    // incomplete registration must never expose a healthy, editable idle peer.
    token = `${id}/unresolved`; phase = 'committed';
    safety.setInputLocked(true); hook.phase('recovery');
  }
  return () => {
    if (phase === 'preparing') release(token);
    if (window[UPDATE_PEER] === peer) delete window[UPDATE_PEER];
  };
}

export function parseUpdateVersion(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,4})(\.(0|[1-9]\d{0,4})){0,3}$/.test(value)) return null;
  const parts = value.split('.').map(Number);
  if (parts.some(x => x > 65535) || parts.every(x => x === 0)) return null;
  return [...parts, ...Array(4 - parts.length).fill(0)];
}

export function compareUpdateVersions(a, b) {
  const x = parseUpdateVersion(a), y = parseUpdateVersion(b);
  if (!x || !y) return null;
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

export function createChromeUpdateService({
  api = globalThis.chrome, getViews = () => api.extension.getViews(), now = Date.now,
  schedule = setTimeout, cancel = clearTimeout, onChange = () => {},
} = {}) {
  let baseVersion;
  try { baseVersion = api?.runtime?.getManifest?.().version; } catch { /* unavailable context */ }
  const enabled = Boolean(parseUpdateVersion(baseVersion) && api?.runtime?.onUpdateAvailable?.addListener);
  let pending = null, deferred = null, disposed = false, started = false;
  let writeQueue = Promise.resolve();
  const repairs = new Set();
  let state = { status: 'hidden', targetVersion: null, reason: null };
  let phase = 'idle', failure = null, recoveryTimer = null;
  function validDeferral(value) {
    return validPair(value) && Number.isFinite(value.snoozedUntil) &&
      value.snoozedUntil > now() && value.snoozedUntil <= now() + UPDATE_SNOOZE_MS;
  }
  function publish() {
    if (disposed) return;
    if (deferred && !validDeferral(deferred)) deferred = null;
    const hidden = !pending || deferred?.targetVersion === pending.targetVersion;
    const status = phase === 'recovery' ? 'recovery' : phase !== 'idle' ? 'applying'
      : hidden ? 'hidden' : failure ? 'blocked' : 'available';
    state = { status, targetVersion: pending?.targetVersion ?? null, reason: failure };
    onChange({ ...state });
  }
  function validPair(value) {
    return value?.baseVersion === baseVersion && compareUpdateVersions(value.targetVersion, baseVersion) === 1;
  }
  function acceptPending(value) {
    if (!validPair(value) || (pending && compareUpdateVersions(value.targetVersion, pending.targetVersion) !== 1)) return false;
    pending = { baseVersion, targetVersion: value.targetVersion };
    failure = null;
    publish();
    return true;
  }
  function defer(value, until) {
    if (!validPair(value) || !Number.isFinite(until) || until <= now() || until > now() + UPDATE_SNOOZE_MS) return;
    if (deferred && !validDeferral(deferred)) deferred = null;
    if (deferred) {
      const comparison = compareUpdateVersions(value.targetVersion, deferred.targetVersion);
      if (comparison === -1 || (comparison === 0 && until <= deferred.snoozedUntil)) return;
    }
    deferred = { baseVersion, targetVersion: value.targetVersion, snoozedUntil: until };
    publish();
  }
  async function read(area, key) {
    try { return (await api?.storage?.[area]?.get(key))?.[key]; } catch { return undefined; }
  }
  async function refresh() {
    if (!enabled || disposed) return;
    const [p, d] = await Promise.all([read('session', UPDATE_PENDING_KEY), read('local', UPDATE_SNOOZE_KEY)]);
    if (disposed) return;
    // Merge rather than replace: an event or Later may have happened while reading.
    acceptPending(p);
    defer(d, d?.snoozedUntil);
    publish();
  }
  function available(details) {
    if (disposed || !acceptPending({ baseVersion, targetVersion: details?.version })) return;
    const value = { ...pending };
    writeQueue = writeQueue.then(async () => {
      if (disposed || pending.targetVersion !== value.targetVersion) return;
      try { await api?.storage?.session?.set({ [UPDATE_PENDING_KEY]: value }); } catch { /* retain the live event */ }
    });
  }
  function changed(changes, area) {
    if (disposed) return;
    if (area === 'session') {
      const p = changes[UPDATE_PENDING_KEY]?.newValue;
      acceptPending(p);
      if (validPair(p) && pending && compareUpdateVersions(pending.targetVersion, p.targetVersion) === 1) repair('session');
    }
    if (area === 'local') {
      const d = changes[UPDATE_SNOOZE_KEY]?.newValue;
      defer(d, d?.snoozedUntil);
      if (validPair(d) && Number.isFinite(d.snoozedUntil) && d.snoozedUntil <= now() + UPDATE_SNOOZE_MS && validDeferral(deferred)) {
        const order = compareUpdateVersions(deferred.targetVersion, d.targetVersion);
        if (order === 1 || (order === 0 && deferred.snoozedUntil > d.snoozedUntil)) repair('local');
      }
    }
  }
  function repair(area) {
    // Another page's older write may finish last. Keep the newest live metadata
    // in storage too, so a newly opened page does not regress. No render writes.
    if (repairs.has(area)) return;
    repairs.add(area);
    writeQueue = writeQueue.then(async () => {
      repairs.delete(area);
      if (disposed) return;
      const key = area === 'session' ? UPDATE_PENDING_KEY : UPDATE_SNOOZE_KEY;
      const value = area === 'session' ? pending : deferred;
      if (!value || (area === 'local' && !validDeferral(value))) return;
      try { await api.storage?.[area]?.set({ [key]: { ...value } }); } catch { /* retain live metadata */ }
    });
  }
  function views() { return getViews(); }
  function setPhase(value) {
    phase = value;
    if (recoveryTimer !== null) cancel(recoveryTimer);
    recoveryTimer = value === 'committed' ? schedule(() => { phase = 'recovery'; publish(); }, 3000) : null;
    publish();
  }
  function apply() {
    if (!enabled || disposed || !pending || !api.runtime.reload || phase !== 'idle') return { ok: false, reason: 'unavailable' };
    const token = `${hook.id}/${crypto.randomUUID()}`;
    let initial = [], acquired = [], reason = 'unknown-context';
    function peers(list) {
      if (!Array.isArray(list) || !list.length || new Set(list).size !== list.length) throw Error('Unknown view set');
      return list.map(view => {
        const peer = view[UPDATE_PEER];
        if (view.closed || peer?.protocol !== 1 || typeof peer.id !== 'string' ||
          !['inspect','acquire','commit','release'].every(key => typeof peer[key] === 'function')) throw Error('Unknown page');
        return peer;
      });
    }
    function verify(list) {
      const current = peers(list);
      if (list.length !== initial.length || !initial.every(view => list.includes(view))) { reason = 'contexts-changed'; throw Error(reason); }
      for (const peer of current) {
        const status = peer.inspect();
        if (status?.protocol !== 1 || status.token !== token || !['preparing','committed'].includes(status.phase)) throw Error('Unknown guard state');
        if (status.reason !== null) { reason = 'busy'; throw Error(reason); }
      }
    }
    try {
      initial = [...views()];
      const all = peers(initial);
      if (!all.some(peer => peer.id === hook.id)) throw Error('Caller missing');
      for (const peer of all) {
        acquired.push(peer);
        if (!peer.acquire(token)) { reason = 'busy'; throw Error(reason); }
      }
      verify([...views()]);
      for (const peer of all) if (!peer.commit(token)) { reason = 'busy'; throw Error(reason); }
      verify([...views()]);
      reason = 'reload-error';
      api.runtime.reload();
      return { ok: true, reason: null };
    } catch {
      // Rollback is safe only because no reload command returned successfully.
      try { acquired.push(...views().map(v => v[UPDATE_PEER]).filter(Boolean)); } catch { /* retain known peers */ }
      for (const peer of new Set(acquired)) { try { peer.release(token, {notDispatched:true}); } catch { /* disappearing page */ } }
      failure = reason; publish();
      return { ok: false, reason };
    }
  }
  const hook = { views, phase: setPhase, id: null };
  const service = {
    async start() {
      if (!enabled || disposed || started) return;
      started = true;
      api.runtime.onUpdateAvailable.addListener(available);
      api.storage?.onChanged?.addListener(changed);
      await refresh();
    },
    snapshot: () => ({ ...state }),
    refresh,
    defer,
    async snooze() {
      if (!enabled || disposed || !pending || phase !== 'idle') return;
      const value = { ...pending, snoozedUntil: now() + UPDATE_SNOOZE_MS };
      defer(value, value.snoozedUntil);
      let live = []; try { live = views(); } catch { /* preserve this page's Later */ }
      for (const view of live) {
        try { const peer = view[UPDATE_PEER]; if (peer?.protocol === 1) peer.defer(value, value.snoozedUntil); } catch { /* closing page */ }
      }
      try { await api.storage?.local?.set({ [UPDATE_SNOOZE_KEY]: value }); } catch { /* live peers are already deferred */ }
    },
    apply,
    dispose() {
      disposed = true;
      if (recoveryTimer !== null) cancel(recoveryTimer);
      if (!started) return;
      api.runtime.onUpdateAvailable.removeListener(available);
      api.storage?.onChanged?.removeListener(changed);
    },
  };
  hooks.set(service, hook);
  return service;
}
