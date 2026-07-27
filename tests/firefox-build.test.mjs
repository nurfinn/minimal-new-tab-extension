import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const builderModule = await import('../scripts/build-firefox.mjs').catch(() => ({}));
const sourceRoot = fileURLToPath(new URL('..', import.meta.url));

test('rejects release paths that could mutate the source or package itself', () => {
  assert.equal(typeof builderModule.assertSafeReleasePaths, 'function');

  const source = join(tmpdir(), 'minimal-new-tab-source');
  const output = join(tmpdir(), 'minimal-new-tab-firefox-output');
  assert.throws(
    () => builderModule.assertSafeReleasePaths({
      source,
      output: join(source, 'release'),
      archive: join(tmpdir(), 'release.zip'),
    }),
    /separate from the source tree/,
  );
  assert.throws(
    () => builderModule.assertSafeReleasePaths({
      source,
      output,
      archive: join(output, 'release.zip'),
    }),
    /must not be created inside the output directory/,
  );
  assert.throws(
    () => builderModule.assertSafeReleasePaths({
      source,
      output,
      archive: join(tmpdir(), 'v1.5.4-store.zip'),
    }),
    /Firefox archive name/,
  );
});

test('builds a clean Firefox directory and root-level ZIP from an allowlist', async (t) => {
  assert.equal(typeof builderModule.buildFirefoxRelease, 'function');
  assert.ok(Array.isArray(builderModule.FIREFOX_RELEASE_FILES));

  const tempRoot = await mkdtemp(join(tmpdir(), 'minimal-new-tab-firefox-build-'));
  const outputDir = join(tempRoot, 'release');
  const archivePath = join(tempRoot, 'minimal-new-tab-firefox-v1.5.6.zip');
  t.after(() => rm(tempRoot, { recursive: true, force: true }));

  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'obsolete.txt'), 'remove me');

  await builderModule.buildFirefoxRelease({ sourceRoot, outputDir, archivePath });

  assert.deepEqual(await readdir(outputDir), [
    '_locales',
    'backup-service.mjs',
    'extension-api.mjs',
    'favicon-catalog.mjs',
    'favicon-service.mjs',
    'favicon-settings.css',
    'favicon-settings.mjs',
    'firefox-bootstrap.mjs',
    'i18n-service.mjs',
    'icons',
    'images',
    'manifest.json',
    'newtab-core.mjs',
    'newtab.html',
    'newtab.js',
    'platform.css',
    'site-icons',
    'storage-service.mjs',
    'styles.css',
  ]);

  assert.deepEqual(
    JSON.parse(await readFile(join(outputDir, 'manifest.json'), 'utf8')),
    JSON.parse(await readFile(join(sourceRoot, 'firefox/manifest.json'), 'utf8')),
  );
  assert.deepEqual(
    await readFile(join(outputDir, 'favicon-service.mjs')),
    await readFile(join(sourceRoot, 'firefox/favicon-service.mjs')),
  );

  const builtHtml = await readFile(join(outputDir, 'newtab.html'), 'utf8');
  const builtScript = await readFile(join(outputDir, 'newtab.js'), 'utf8');
  const builtSettings = await readFile(
    join(outputDir, 'favicon-settings.mjs'),
    'utf8',
  );
  const builtEnglish = JSON.parse(
    await readFile(join(outputDir, '_locales/en/messages.json'), 'utf8'),
  );
  const builtRussian = JSON.parse(
    await readFile(join(outputDir, '_locales/ru/messages.json'), 'utf8'),
  );

  assert.match(builtHtml, /href="platform\.css"/);
  assert.match(builtHtml, /href="favicon-settings\.css"/);
  assert.match(builtHtml, /id="faviconSettingsRow"/);
  assert.match(builtHtml, /src="firefox-bootstrap\.mjs"/);
  assert.doesNotMatch(builtHtml, /type="module" src="newtab\.js"/);
  assert.match(
    builtScript,
    /document\.addEventListener\("firefox-favicon-sources-changed", renderLinks\)/,
  );
  assert.match(builtSettings, /from '\.\/extension-api\.mjs'/);
  assert.match(builtSettings, /from '\.\/i18n-service\.mjs'/);
  assert.doesNotMatch(builtSettings, /from '\.\.\//);
  assert.equal(
    builtEnglish.siteIconsRemoteToggle.message,
    'Load missing site icons',
  );
  assert.equal(
    builtRussian.siteIconsRemoteToggle.message,
    'Загружать недостающие иконки',
  );

  for (const relativePath of [
    'styles.css',
    'storage-service.mjs',
    'newtab-core.mjs',
    'images/default-background.png',
    'icons/icon-128.png',
  ]) {
    assert.deepEqual(
      await readFile(join(outputDir, relativePath)),
      await readFile(join(sourceRoot, relativePath)),
      `${relativePath} must remain byte-identical`,
    );
  }

  const packagedSources = await readTextSources(outputDir);
  assert.match(packagedSources, /google\.com\/s2\/favicons/);
  assert.doesNotMatch(packagedSources, /\/_favicon\/|chrome-extension:/i);
  assert.doesNotMatch(packagedSources, /storage\.(?:sync|local).*favicon/i);

  const archiveList = spawnSync('/usr/bin/unzip', ['-Z1', archivePath], {
    encoding: 'utf8',
  });
  assert.equal(archiveList.status, 0, archiveList.stderr);
  const entries = archiveList.stdout.trim().split('\n').filter(Boolean);
  assert.ok(entries.includes('manifest.json'));
  assert.equal(entries.some((entry) => /(^|\/)tests?\//.test(entry)), false);
  assert.equal(entries.some((entry) => /(^|\/)docs\//.test(entry)), false);
  assert.equal(entries.some((entry) => /(^|\/)scripts\//.test(entry)), false);
  assert.equal(entries.some((entry) => /(^|\/)firefox\//.test(entry)), false);
  assert.equal(entries.some((entry) => entry.endsWith('.DS_Store')), false);
});

async function readTextSources(root) {
  const files = await listFiles(root);
  const textFiles = files.filter((path) => /\.(?:html|js|mjs|json|css)$/.test(path));
  return (await Promise.all(textFiles.map((path) => readFile(path, 'utf8')))).join('\n');
}

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files.sort();
}
