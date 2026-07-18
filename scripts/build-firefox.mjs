import { spawnSync } from 'node:child_process';
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultSourceRoot = dirname(scriptDirectory);

export const FIREFOX_RELEASE_FILES = Object.freeze([
  '_locales',
  'backup-service.mjs',
  'extension-api.mjs',
  'favicon-service.mjs',
  'i18n-service.mjs',
  'icons',
  'images',
  'newtab-core.mjs',
  'newtab.html',
  'newtab.js',
  'storage-service.mjs',
  'styles.css',
]);

export const FIREFOX_OVERLAY_FILES = Object.freeze([
  'favicon-catalog.mjs',
  'favicon-settings.css',
  'favicon-settings.mjs',
  'firefox-bootstrap.mjs',
  'site-icons',
]);

export async function buildFirefoxRelease({
  sourceRoot = defaultSourceRoot,
  outputDir,
  archivePath,
} = {}) {
  if (!outputDir || !archivePath) {
    throw new TypeError('Both outputDir and archivePath are required');
  }

  const source = resolve(sourceRoot);
  const output = resolve(outputDir);
  const archive = resolve(archivePath);
  assertSafeReleasePaths({ source, output, archive });

  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });

  for (const entry of FIREFOX_RELEASE_FILES) {
    await cp(join(source, entry), join(output, entry), {
      recursive: true,
      preserveTimestamps: true,
    });
  }

  await cp(join(source, 'firefox/manifest.json'), join(output, 'manifest.json'), {
    preserveTimestamps: true,
  });
  await cp(join(source, 'firefox/favicon-service.mjs'), join(output, 'favicon-service.mjs'), {
    preserveTimestamps: true,
  });

  for (const entry of FIREFOX_OVERLAY_FILES) {
    await cp(join(source, `firefox/${entry}`), join(output, entry), {
      recursive: true,
      preserveTimestamps: true,
    });
  }

  await applyFirefoxModuleOverlay({ output });
  await applyFirefoxHtmlOverlay({ source, output });
  await applyFirefoxScriptOverlay({ output });
  await mergeFirefoxLocales({ source, output });

  await mkdir(dirname(archive), { recursive: true });
  await rm(archive, { force: true });
  const files = await listRelativeFiles(output);
  const zipResult = spawnSync('/usr/bin/zip', ['-q', '-X', archive, '-@'], {
    cwd: output,
    encoding: 'utf8',
    input: `${files.join('\n')}\n`,
  });
  if (zipResult.error || zipResult.status !== 0) {
    throw new Error(
      zipResult.error?.message || zipResult.stderr.trim() || 'Could not create Firefox ZIP',
    );
  }

  return { outputDir: output, archivePath: archive, files };
}

export function assertSafeReleasePaths({ source, output, archive }) {
  if (
    output === parse(output).root ||
    isSameOrWithin(source, output) ||
    isSameOrWithin(output, source)
  ) {
    throw new Error('Firefox output directory must be separate from the source tree');
  }
  if (archive === parse(archive).root || isSameOrWithin(source, archive)) {
    throw new Error('Firefox archive must be outside the source tree');
  }
  if (isSameOrWithin(output, archive)) {
    throw new Error('Firefox archive must not be created inside the output directory');
  }
  if (!basename(archive).toLowerCase().includes('firefox')) {
    throw new Error('Firefox archive name must contain "firefox"');
  }
}

function replaceExactlyOnce(source, anchor, replacement, label) {
  const first = source.indexOf(anchor);
  if (first === -1 || source.indexOf(anchor, first + anchor.length) !== -1) {
    throw new Error(`Could not apply Firefox ${label} overlay exactly once`);
  }
  return `${source.slice(0, first)}${replacement}${source.slice(first + anchor.length)}`;
}

async function applyFirefoxModuleOverlay({ output }) {
  const settingsPath = join(output, 'favicon-settings.mjs');
  let settings = await readFile(settingsPath, 'utf8');
  settings = replaceExactlyOnce(
    settings,
    "from '../extension-api.mjs'",
    "from './extension-api.mjs'",
    'extension API import',
  );
  settings = replaceExactlyOnce(
    settings,
    "from '../i18n-service.mjs'",
    "from './i18n-service.mjs'",
    'i18n import',
  );
  await writeFile(settingsPath, settings);
}

async function applyFirefoxHtmlOverlay({ source, output }) {
  const htmlPath = join(output, 'newtab.html');
  const fragment = await readFile(
    join(source, 'firefox/favicon-settings.fragment.html'),
    'utf8',
  );
  const indentedFragment = fragment
    .trim()
    .split('\n')
    .map((line) => `        ${line}`)
    .join('\n');

  let html = await readFile(htmlPath, 'utf8');
  html = replaceExactlyOnce(
    html,
    '    <link rel="stylesheet" href="styles.css">',
    [
      '    <link rel="stylesheet" href="styles.css">',
      '    <link rel="stylesheet" href="favicon-settings.css">',
    ].join('\n'),
    'stylesheet',
  );
  html = replaceExactlyOnce(
    html,
    '        <div class="settings-tabs"',
    `${indentedFragment}\n\n        <div class="settings-tabs"`,
    'settings fragment',
  );
  html = replaceExactlyOnce(
    html,
    '<script type="module" src="newtab.js"></script>',
    '<script type="module" src="firefox-bootstrap.mjs"></script>',
    'bootstrap',
  );
  await writeFile(htmlPath, html);
}

async function applyFirefoxScriptOverlay({ output }) {
  const scriptPath = join(output, 'newtab.js');
  const script = await readFile(scriptPath, 'utf8');
  const updated = replaceExactlyOnce(
    script,
    '  document.addEventListener("keydown", handleGlobalShortcut);',
    [
      '  document.addEventListener("keydown", handleGlobalShortcut);',
      '  document.addEventListener("firefox-favicon-sources-changed", renderLinks);',
    ].join('\n'),
    'favicon refresh',
  );
  await writeFile(scriptPath, updated);
}

async function mergeFirefoxLocales({ source, output }) {
  for (const locale of ['en', 'ru']) {
    const outputPath = join(output, `_locales/${locale}/messages.json`);
    const baseMessages = JSON.parse(await readFile(outputPath, 'utf8'));
    const firefoxMessages = JSON.parse(
      await readFile(
        join(source, `firefox/_locales/${locale}/messages.json`),
        'utf8',
      ),
    );
    await writeFile(
      outputPath,
      `${JSON.stringify({ ...baseMessages, ...firefoxMessages }, null, 2)}\n`,
    );
  }
}

function isSameOrWithin(parent, candidate) {
  const path = relative(parent, candidate);
  return (
    path === '' ||
    (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path))
  );
}

async function listRelativeFiles(root, directory = '') {
  const absoluteDirectory = join(root, directory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listRelativeFiles(root, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!['--output-dir', '--archive'].includes(name)) {
      throw new Error(`Unknown argument: ${name}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${name}`);
    }
    values[name] = value;
    index += 1;
  }

  if (!values['--output-dir'] || !values['--archive']) {
    throw new Error('Usage: build-firefox.mjs --output-dir <path> --archive <path>');
  }

  return {
    outputDir: values['--output-dir'],
    archivePath: values['--archive'],
  };
}

async function main() {
  const result = await buildFirefoxRelease(parseArguments(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const invokedModuleUrl = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : '';
if (invokedModuleUrl === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
