import { spawnSync } from 'node:child_process';
import {
  cp,
  mkdir,
  readdir,
  rm,
  utimes,
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
const releaseTimestamp = new Date('2000-01-01T00:00:00.000Z');

export const CHROME_RELEASE_FILES = Object.freeze([
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

export async function buildChromeRelease({
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
  assertSafeChromeReleasePaths({ source, output, archive });

  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });

  for (const entry of CHROME_RELEASE_FILES) {
    await cp(join(source, entry), join(output, entry), {
      recursive: true,
      preserveTimestamps: true,
    });
  }

  const files = await listRelativeFiles(output);
  await Promise.all(
    files.map((file) => utimes(join(output, file), releaseTimestamp, releaseTimestamp)),
  );

  await mkdir(dirname(archive), { recursive: true });
  await rm(archive, { force: true });
  const zipResult = spawnSync('/usr/bin/zip', ['-q', '-X', archive, '-@'], {
    cwd: output,
    encoding: 'utf8',
    env: { ...process.env, TZ: 'UTC' },
    input: `${files.join('\n')}\n`,
  });
  if (zipResult.error || zipResult.status !== 0) {
    throw new Error(
      zipResult.error?.message || zipResult.stderr.trim() || 'Could not create Chrome ZIP',
    );
  }

  return { outputDir: output, archivePath: archive, files };
}

export function assertSafeChromeReleasePaths({ source, output, archive }) {
  if (
    output === parse(output).root ||
    isSameOrWithin(source, output) ||
    isSameOrWithin(output, source)
  ) {
    throw new Error('Chrome output directory must be separate from the source tree');
  }
  if (archive === parse(archive).root || isSameOrWithin(source, archive)) {
    throw new Error('Chrome archive must be outside the source tree');
  }
  if (isSameOrWithin(output, archive)) {
    throw new Error('Chrome archive must not be created inside the output directory');
  }
  if (!basename(archive).toLowerCase().includes('chrome')) {
    throw new Error('Chrome archive name must contain "chrome"');
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
    throw new Error('Usage: build-chrome.mjs --output-dir <path> --archive <path>');
  }

  return {
    outputDir: values['--output-dir'],
    archivePath: values['--archive'],
  };
}

async function main() {
  const result = await buildChromeRelease(parseArguments(process.argv.slice(2)));
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
