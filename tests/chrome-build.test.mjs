import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const builderModule = await import('../scripts/build-chrome.mjs').catch(() => ({}));
const sourceRoot = fileURLToPath(new URL('..', import.meta.url));

test('rejects Chrome release paths that could mutate source files', () => {
  assert.equal(typeof builderModule.assertSafeChromeReleasePaths, 'function');

  const source = join(tmpdir(), 'minimal-new-tab-source');
  const output = join(tmpdir(), 'minimal-new-tab-chrome-output');

  assert.throws(
    () => builderModule.assertSafeChromeReleasePaths({
      source,
      output: join(source, 'release'),
      archive: join(tmpdir(), 'minimal-new-tab-chrome.zip'),
    }),
    /separate from the source tree/,
  );
  assert.throws(
    () => builderModule.assertSafeChromeReleasePaths({
      source,
      output,
      archive: join(output, 'minimal-new-tab-chrome.zip'),
    }),
    /must not be created inside the output directory/,
  );
  assert.throws(
    () => builderModule.assertSafeChromeReleasePaths({
      source,
      output,
      archive: join(tmpdir(), 'release.zip'),
    }),
    /Chrome archive name/,
  );
});

test('builds a complete root-level Chrome archive from an allowlist', async (t) => {
  assert.equal(typeof builderModule.buildChromeRelease, 'function');
  assert.ok(Array.isArray(builderModule.CHROME_RELEASE_FILES));

  const tempRoot = await mkdtemp(join(tmpdir(), 'minimal-new-tab-chrome-build-'));
  const outputDir = join(tempRoot, 'release');
  const archivePath = join(tempRoot, 'minimal-new-tab-chrome-v1.5.5.zip');
  t.after(() => rm(tempRoot, { recursive: true, force: true }));

  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'obsolete.txt'), 'remove me');

  await builderModule.buildChromeRelease({ sourceRoot, outputDir, archivePath });

  assert.deepEqual((await readdir(outputDir)).sort(), [
    '_locales',
    'backup-service.mjs',
    'extension-api.mjs',
    'favicon-service.mjs',
    'i18n-service.mjs',
    'icons',
    'images',
    'manifest.json',
    'newtab-core.mjs',
    'newtab.html',
    'newtab.js',
    'storage-service.mjs',
    'styles.css',
  ]);

  for (const relativePath of [
    'manifest.json',
    'extension-api.mjs',
    'favicon-service.mjs',
    'newtab-core.mjs',
    'newtab.js',
    'storage-service.mjs',
    'images/default-background.png',
    'icons/icon-128.png',
  ]) {
    assert.deepEqual(
      await readFile(join(outputDir, relativePath)),
      await readFile(join(sourceRoot, relativePath)),
      `${relativePath} must remain byte-identical`,
    );
  }

  await assertRelativeModuleImportsResolve(outputDir);

  const archiveList = spawnSync('/usr/bin/unzip', ['-Z1', archivePath], {
    encoding: 'utf8',
  });
  assert.equal(archiveList.status, 0, archiveList.stderr);
  const entries = archiveList.stdout.trim().split('\n').filter(Boolean);
  assert.ok(entries.includes('manifest.json'));
  assert.ok(entries.includes('extension-api.mjs'));
  assert.ok(entries.includes('favicon-service.mjs'));
  assert.equal(entries.some((entry) => /(^|\/)tests?\//.test(entry)), false);
  assert.equal(entries.some((entry) => /(^|\/)docs\//.test(entry)), false);
  assert.equal(entries.some((entry) => /(^|\/)scripts\//.test(entry)), false);
  assert.equal(entries.some((entry) => /(^|\/)firefox\//.test(entry)), false);
  assert.equal(entries.some((entry) => entry.endsWith('.DS_Store')), false);
});

test('produces the same Chrome archive regardless of source file timestamps', async (t) => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'minimal-new-tab-chrome-repro-'));
  const sourceA = join(tempRoot, 'source-a');
  const sourceB = join(tempRoot, 'source-b');
  const archiveA = join(tempRoot, 'minimal-new-tab-chrome-a.zip');
  const archiveB = join(tempRoot, 'minimal-new-tab-chrome-b.zip');
  t.after(() => rm(tempRoot, { recursive: true, force: true }));

  for (const source of [sourceA, sourceB]) {
    await mkdir(source, { recursive: true });
    for (const entry of builderModule.CHROME_RELEASE_FILES) {
      await cp(join(sourceRoot, entry), join(source, entry), { recursive: true });
    }
  }

  await setFileTimestamps(sourceA, new Date('2025-01-01T00:00:00.000Z'));
  await setFileTimestamps(sourceB, new Date('2026-06-01T12:30:00.000Z'));

  await builderModule.buildChromeRelease({
    sourceRoot: sourceA,
    outputDir: join(tempRoot, 'output-a'),
    archivePath: archiveA,
  });
  await builderModule.buildChromeRelease({
    sourceRoot: sourceB,
    outputDir: join(tempRoot, 'output-b'),
    archivePath: archiveB,
  });

  assert.deepEqual(await readFile(archiveA), await readFile(archiveB));
});

async function assertRelativeModuleImportsResolve(root) {
  const files = await listFiles(root);
  const modules = files.filter((path) => /\.(?:js|mjs)$/.test(path));

  for (const modulePath of modules) {
    const source = await readFile(modulePath, 'utf8');
    const specifiers = [
      ...source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g),
    ].map((match) => match[1]);

    for (const specifier of specifiers) {
      await assert.doesNotReject(
        access(resolve(dirname(modulePath), specifier)),
        `${modulePath} imports missing ${specifier}`,
      );
    }
  }
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

async function setFileTimestamps(root, timestamp) {
  await Promise.all(
    (await listFiles(root)).map((path) => utimes(path, timestamp, timestamp)),
  );
}
