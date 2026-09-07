import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const manifest = JSON.parse(
  await readFile(new URL('../firefox/manifest.json', import.meta.url), 'utf8').catch(() => '{}'),
);

test('Firefox manifest is localized and AMO-ready with minimum permissions', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, '1.6');
  assert.equal(manifest.default_locale, 'en');
  assert.equal(manifest.name, '__MSG_appName__');
  assert.equal(manifest.short_name, '__MSG_appShortName__');
  assert.equal(manifest.description, '__MSG_appDescription__');
  assert.equal(manifest.chrome_url_overrides?.newtab, 'newtab.html');
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.deepEqual(manifest.browser_specific_settings, {
    gecko: {
      id: 'minimal-new-tab@nurfinn.com',
      strict_min_version: '142.0',
      data_collection_permissions: {
        required: ['none'],
        optional: ['browsingActivity'],
      },
    },
  });
});

test('Firefox manifest requests no favicon, identity, tabs, history, or host access', () => {
  const serialized = JSON.stringify(manifest);

  assert.equal(serialized.includes('favicon'), false);
  assert.equal(manifest.permissions?.includes('identity'), false);
  assert.equal(manifest.permissions?.includes('tabs'), false);
  assert.equal(manifest.permissions?.includes('history'), false);
  assert.equal(manifest.permissions?.includes('favicon'), false);
  assert.equal('host_permissions' in manifest, false);
  assert.equal('optional_host_permissions' in manifest, false);
  assert.equal('gecko_android' in (manifest.browser_specific_settings || {}), false);
});
