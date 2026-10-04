import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const text = path => readFile(new URL('../' + path, import.meta.url), 'utf8').catch(() => '');

test('README distinguishes prepared 1.7 from published 1.6', async () => {
  const readme = await text('README.md');
  assert.match(readme, /^## Prepared release 1\.7$/m);
  assert.match(readme, /not yet published/i);
  assert.match(readme, /\| Chrome \| 1\.6 \| 1\.7 \|/);
  assert.match(readme, /\| Firefox \| 1\.6 \| 1\.7 \|/);
  assert.match(readme, /\(docs\/release-1\.7\.md\)/);
});

test('all README build examples target the prepared 1.7 archives', async () => {
  const readme = await text('README.md');
  const examples = [...readme.matchAll(/--archive \/absolute\/path\/minimal-new-tab-(chrome|firefox)-v([^\s]+)\.zip/g)];
  assert.equal(examples.length, 4);
  assert.ok(examples.every(match => match[2] === '1.7'));
});

test('GitHub validates the release branch and names 1.7 archives', async () => {
  const workflow = await text('.github/workflows/validate-releases.yml');
  assert.match(workflow, /^\s+- "codex\/\*\*"$/m);
  for (const platform of ['chrome', 'firefox']) {
    assert.equal(workflow.split(`minimal-new-tab-${platform}-v1.7.zip`).length - 1, 2);
  }
});

test('1.7 notes preserve compatibility and state outstanding external checks', async () => {
  const notes = await text('docs/release-1.7.md');
  assert.match(notes, /^# Minimal New Tab 1\.7$/m);
  assert.match(notes, /not yet published/i);
  assert.match(notes, /1\.6 and earlier cannot import v2/);
  assert.match(notes, /cross-device/);
  assert.match(notes, /signed/);
  assert.match(notes, /background.*local/i);
});

for (const platform of ['chrome', 'firefox']) for (const locale of ['en', 'ru']) {
  test(`${platform}/${locale} release copy names emoji and JSON limitations`, async () => {
    const copy = await text(`docs/whats-new-1.7-${platform}-${locale}.txt`);
    assert.match(copy, /emoji|эмодзи/i);
    assert.match(copy, /1\.6/);
    assert.match(copy, locale === 'en' ? /not included in JSON/ : /не входят в JSON/);
    if (platform === 'firefox') {
      assert.doesNotMatch(copy, /Update or Later|«Обновить»/);
    }
  });
}
