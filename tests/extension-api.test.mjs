import assert from 'node:assert/strict';
import test from 'node:test';

const extensionApiModule = await import('../extension-api.mjs').catch(() => ({}));

test('prefers the Promise-based Firefox browser namespace', () => {
  assert.equal(typeof extensionApiModule.getExtensionApi, 'function');

  const browserApi = { name: 'browser' };
  const chromeApi = { name: 'chrome' };

  assert.equal(
    extensionApiModule.getExtensionApi({ browserApi, chromeApi }),
    browserApi,
  );
});

test('falls back to Chrome and reports an unavailable extension API', () => {
  assert.equal(typeof extensionApiModule.getExtensionApi, 'function');

  const chromeApi = { name: 'chrome' };
  assert.equal(
    extensionApiModule.getExtensionApi({ browserApi: undefined, chromeApi }),
    chromeApi,
  );
  assert.equal(
    extensionApiModule.getExtensionApi({ browserApi: undefined, chromeApi: undefined }),
    null,
  );
});
