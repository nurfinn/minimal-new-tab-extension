import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const manifest = JSON.parse(
  await readFile(new URL('../manifest.json', import.meta.url), 'utf8'),
);

test('manifest is the localized minimum-permission 1.5.1 release', () => {
  assert.equal(manifest.version, '1.5.1');
  assert.equal(manifest.default_locale, 'en');
  assert.equal(manifest.name, '__MSG_appName__');
  assert.equal(manifest.short_name, '__MSG_appShortName__');
  assert.equal(manifest.description, '__MSG_appDescription__');
  assert.deepEqual([...manifest.permissions].sort(), ['favicon', 'storage']);
  assert.equal('optional_host_permissions' in manifest, false);
  assert.equal(manifest.permissions.includes('identity'), false);
});
