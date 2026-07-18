import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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
    { supported: true, enabled: false, error: false },
  );
  assert.deepEqual(
    await controller.enable(),
    { supported: true, enabled: true, error: false },
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
    { supported: false, enabled: false, error: false },
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
    { supported: true, enabled: false, error: true },
  );
  assert.deepEqual(
    await controller.enable(),
    { supported: true, enabled: false, error: true },
  );
  assert.deepEqual(
    await controller.disable(),
    { supported: true, enabled: false, error: true },
  );
});

test('implements approved option C without a third settings tab', () => {
  assert.match(fragment, /id="faviconSettingsRow"/);
  assert.match(fragment, /id="faviconSettingsConfigure"[^>]+aria-expanded="false"/s);
  assert.match(fragment, /id="faviconSettingsDisclosure"[^>]+hidden/);
  assert.match(fragment, /id="remoteFaviconToggle"[^>]+type="checkbox"/);
  assert.match(
    fragment,
    /id="faviconSettingsTitle"[\s\S]+class="favicon-settings-samples"[\s\S]+id="faviconSettingsMode"[\s\S]+id="faviconSettingsConfigure"/,
  );
  assert.match(
    fragment,
    /data-i18n="siteIconsRemoteToggle"[\s\S]+id="remoteFaviconStatus"[\s\S]+class="favicon-settings-switch-control"/,
  );
  assert.doesNotMatch(fragment, /role="tab"|data-settings-tab/);
  assert.match(styles, /\.favicon-settings-row/);
  assert.match(styles, /\.favicon-settings-disclosure/);
  assert.match(styles, /\.favicon-settings-configure\s*\{[^}]+border:/s);
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
