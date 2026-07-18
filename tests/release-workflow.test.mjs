import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../.github/workflows/validate-releases.yml', import.meta.url),
  'utf8',
).catch(() => '');

test('validates tests and both browser release builds in GitHub Actions', () => {
  assert.match(workflow, /^name: Validate browser releases$/m);
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.match(workflow, /^\s+pull_request:$/m);
  assert.match(workflow, /^\s+push:$/m);
  assert.match(workflow, /node --test tests\/\*\.test\.mjs/);
  assert.match(workflow, /node scripts\/build-chrome\.mjs/);
  assert.match(workflow, /node scripts\/build-firefox\.mjs/);
  assert.match(workflow, /web-ext@10\.5\.0 lint/);
  assert.match(workflow, /unzip -t/);
});
