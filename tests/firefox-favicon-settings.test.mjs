import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { localizeDocument } from '../i18n-service.mjs';

const settings = await import('../firefox/favicon-settings.mjs');
const [fragment, styles, source] = await Promise.all([
  readFile(new URL('../firefox/favicon-settings.fragment.html', import.meta.url), 'utf8'),
  readFile(new URL('../firefox/favicon-settings.css', import.meta.url), 'utf8'),
  readFile(new URL('../firefox/favicon-settings.mjs', import.meta.url), 'utf8'),
]);

function createPermissions({ supported = true, enabled = false, grant = true } = {}) {
  const calls = [];
  let current = enabled;

  return {
    calls,
    api: {
      async getAll() {
        calls.push(['getAll']);
        return supported
          ? { permissions: [], origins: [], data_collection: current ? ['browsingActivity'] : [] }
          : { permissions: [], origins: [] };
      },
      async request(value) {
        calls.push(['request', value]);
        current = grant;
        return grant;
      },
      async remove(value) {
        calls.push(['remove', value]);
        current = false;
        return true;
      },
    },
  };
}

test('uses Firefox optional browsing activity consent only', () => {
  assert.deepEqual(settings.FAVICON_DATA_PERMISSION, {
    data_collection: ['browsingActivity'],
  });
});

test('starts disabled and turns on only after a granted request', async () => {
  const permissions = createPermissions({ grant: true });
  const states = [];
  const controller = settings.createFaviconPermissionController({
    permissions: permissions.api,
    onStateChange: (state) => states.push(state),
  });

  assert.deepEqual(
    await controller.refresh(),
    { supported: true, enabled: false, error: false, pending: false },
  );
  assert.deepEqual(
    await controller.enable(),
    { supported: true, enabled: true, error: false, pending: false },
  );
  assert.deepEqual(permissions.calls.at(-2), [
    'request',
    { data_collection: ['browsingActivity'] },
  ]);
  assert.equal(states.at(-1).enabled, true);
});

test('keeps local mode after denial, API absence, and removal', async () => {
  const denied = createPermissions({ grant: false });
  const deniedController = settings.createFaviconPermissionController({
    permissions: denied.api,
  });
  await deniedController.refresh();
  assert.equal((await deniedController.enable()).enabled, false);

  const unsupported = createPermissions({ supported: false });
  const unsupportedController = settings.createFaviconPermissionController({
    permissions: unsupported.api,
  });
  assert.deepEqual(
    await unsupportedController.refresh(),
    { supported: false, enabled: false, error: false, pending: false },
  );

  const enabled = createPermissions({ enabled: true });
  const enabledController = settings.createFaviconPermissionController({
    permissions: enabled.api,
  });
  await enabledController.refresh();
  assert.equal((await enabledController.disable()).enabled, false);
  assert.deepEqual(enabled.calls.at(-2), [
    'remove',
    { data_collection: ['browsingActivity'] },
  ]);
});

test('fails closed when Firefox permission calls reject', async () => {
  const controller = settings.createFaviconPermissionController({
    permissions: {
      async getAll() {
        throw new Error('read failed');
      },
      async request() {
        throw new Error('request failed');
      },
      async remove() {
        throw new Error('remove failed');
      },
    },
  });

  assert.deepEqual(
    await controller.refresh(),
    { supported: true, enabled: false, error: true, pending: false },
  );
  assert.deepEqual(
    await controller.enable(),
    { supported: true, enabled: false, error: true, pending: false },
  );
  assert.deepEqual(
    await controller.disable(),
    { supported: true, enabled: false, error: true, pending: false },
  );
});

test('keeps Firefox icons in one compact, immediately applied preference row', () => {
  assert.match(fragment, /id="faviconSettingsRow"/);
  assert.match(fragment, /id="remoteFaviconToggle"[^>]+type="checkbox"/);
  assert.match(
    fragment,
    /id="remoteFaviconToggle"[^>]+aria-describedby="faviconSettingsPrivacy remoteFaviconStatus faviconSettingsError"/,
  );
  assert.match(
    fragment,
    /id="remoteFaviconStatus"[^>]+role="status"[^>]+aria-live="polite"/,
  );
  assert.doesNotMatch(fragment, /role="tab"|data-settings-tab|faviconSettingsConfigure|faviconSettingsDisclosure|favicon-settings-samples/);
  assert.doesNotMatch(fragment, /id="remoteFaviconStatus"[^>]+data-i18n/);
  assert.match(styles, /\.favicon-settings-row/);
  assert.match(styles, /\.favicon-settings-row\.is-pending/);
});

test('does not persist consent or favicon data', () => {
  assert.doesNotMatch(
    source,
    /storage\.sync|storage\.local|localStorage|indexedDB|base64|Blob/,
  );
  assert.match(source, /permissions\.request/);
  assert.match(source, /permissions\.remove/);
  assert.match(source, /permissions\.getAll/);
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('permission request stays pending with the last confirmed switch position', async () => {
  const request = deferred();
  const states = [];
  const controller = settings.createFaviconPermissionController({
    permissions: {
      getAll: async () => ({ data_collection: [] }),
      request: () => request.promise,
    },
    onStateChange: (state) => states.push(state),
  });
  await controller.refresh();
  const completion = controller.enable();
  assert.equal(controller.state.pending, true);
  assert.equal(controller.state.enabled, false);
  await controller.refresh();
  assert.equal(controller.state.pending, true, 'external refresh cannot erase waiting state');
  request.resolve(false);
  await completion;
  assert.equal(controller.state.pending, false);
  assert.equal(controller.state.enabled, false);
  assert.equal(states.some((state) => state.pending), true);
});

test('repeated toggles while waiting cannot open another permission request', async () => {
  const request = deferred();
  let calls = 0;
  const controller = settings.createFaviconPermissionController({
    permissions: {
      getAll: async () => ({ data_collection: [] }),
      request: () => { calls += 1; return request.promise; },
      remove: async () => { throw new Error('Must not remove while requesting'); },
    },
  });
  await controller.refresh();
  const completion = controller.enable();
  const again = controller.enable();
  const remove = controller.disable();
  const waiting = controller.state.pending;
  request.resolve(false);
  await Promise.all([completion, again, remove]);
  assert.equal(calls, 1);
  assert.equal(waiting, true);
});

test('a rejected pending request clears waiting and exposes an error', async () => {
  const request = deferred();
  const controller = settings.createFaviconPermissionController({
    permissions: { getAll: async () => ({ data_collection: [] }), request: () => request.promise },
  });
  await controller.refresh();
  const completion = controller.enable();
  assert.equal(controller.state.pending, true);
  request.reject(new Error('User/API error'));
  await completion;
  assert.equal(controller.state.pending, false);
  assert.equal(controller.state.enabled, false);
  assert.equal(controller.state.error, true);
});

test('an older permission read cannot overwrite an active consent request', async () => {
  const read = deferred();
  const request = deferred();
  const controller = settings.createFaviconPermissionController({ permissions: {
    getAll: () => read.promise,
    request: () => request.promise,
  } });
  const reading = controller.refresh();
  const enabling = controller.enable();
  read.resolve({ data_collection: [] });
  await reading;
  assert.equal(controller.state.pending, true);
  assert.equal(controller.state.enabled, false);
  request.resolve(false);
  await enabling;
  assert.equal(controller.state.pending, false);
});

class TestElement extends EventTarget {
  constructor(i18n = '') {
    super();
    this.attributes = new Map();
    this.dataset = {};
    this.textContent = '';
    this.checked = false;
    this.hidden = false;
    this.disabled = false;
    if (i18n) { this.attributes.set('data-i18n', i18n); this.dataset.i18n = i18n; }
    const classes = new Set();
    this.classList = { toggle: (name, on) => on ? classes.add(name) : classes.delete(name) };
  }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  setAttribute(key, value) { this.attributes.set(key, value); }
  removeAttribute(key) {
    this.attributes.delete(key);
    if (key === 'data-i18n') delete this.dataset.i18n;
  }
  focus() {}
}

function settingsRoot() {
  const ids = Object.fromEntries([
    'faviconSettingsConfigure', 'faviconSettingsDisclosure', 'remoteFaviconToggle',
    'faviconSettingsMode', 'remoteFaviconStatus', 'faviconSettingsError',
  ].map((id) => [id, new TestElement()]));
  ids.faviconSettingsMode = new TestElement('siteIconsLocalOnly');
  ids.remoteFaviconStatus = new TestElement('siteIconsOff');
  return {
    ids, documentElement: new TestElement(),
    getElementById: (id) => ids[id] || null,
    querySelectorAll: (selector) => selector === '[data-i18n]'
      ? Object.values(ids).filter((element) => element.dataset.i18n) : [],
  };
}

const translate = (key) => ({
  siteIconsOn: 'On', siteIconsOff: 'Off', siteIconsPending: 'Waiting for permission',
  siteIconsLocalRemote: 'Local + remote', siteIconsLocalOnly: 'Local only',
}[key] || key);

test('granted startup labels survive the subsequent document localization', async () => {
  const root = settingsRoot();
  const instance = await settings.initializeFaviconSettings({
    root, permissions: createPermissions({ enabled: true }).api, translate, eventTarget: new EventTarget(),
  });
  localizeDocument(root, translate, 'en');
  assert.equal(root.ids.remoteFaviconToggle.checked, true);
  assert.equal(root.ids.remoteFaviconStatus.textContent, 'On');
  assert.equal(root.ids.faviconSettingsMode.textContent, 'Local + remote');
  instance.destroy();
});

test('native checkbox activation is restored to OFF while Firefox asks permission', async () => {
  const root = settingsRoot();
  const request = deferred();
  const instance = await settings.initializeFaviconSettings({
    root,
    permissions: { getAll: async () => ({ data_collection: [] }), request: () => request.promise },
    translate, eventTarget: new EventTarget(),
  });
  const toggle = root.ids.remoteFaviconToggle;
  toggle.checked = true;
  toggle.dispatchEvent(new Event('change'));
  assert.equal(toggle.checked, false);
  assert.equal(toggle.disabled, true);
  assert.equal(root.ids.remoteFaviconStatus.textContent, 'Waiting for permission');
  request.resolve(false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(toggle.checked, false);
  assert.equal(toggle.disabled, false);
  assert.equal(root.ids.remoteFaviconStatus.textContent, 'Off');
  instance.destroy();
});
