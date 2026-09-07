import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  MAX_BACKUP_BYTES,
  buildImportedState,
  getBackupFilename,
  parseBackupText,
  serializeBackup,
} from '../backup-service.mjs';

const fixedDate = new Date('2026-07-04T12:00:00.000Z');

function makeState() {
  return {
    selectedFolderId: 'work',
    folders: [
      { id: 'root', name: 'Избранное' },
      { id: 'work', name: 'Работа' },
    ],
    links: [
      {
        id: 'second',
        title: 'Second',
        url: 'https://second.example/',
        folderId: 'work',
      },
      {
        id: 'first',
        title: 'First',
        url: 'https://first.example/path',
        folderId: 'root',
      },
    ],
    background: {
      type: 'image',
      value: 'data:image/png;base64,AAAA',
      overlay: 37,
      overlayColor: '#123456',
      customAssetId: 'local-only',
    },
  };
}

function makeDocument() {
  return JSON.parse(serializeBackup(makeState(), { now: fixedDate }));
}

function parseMutated(mutator) {
  const document = makeDocument();
  mutator(document);
  return parseBackupText(JSON.stringify(document));
}

test('round-trips ordered sites and folders without background or storage internals', () => {
  const json = serializeBackup(makeState(), { now: fixedDate });
  const document = JSON.parse(json);

  assert.equal(document.format, BACKUP_FORMAT);
  assert.equal(document.backupVersion, BACKUP_VERSION);
  assert.equal(document.createdAt, fixedDate.toISOString());
  assert.equal(document.appVersion, '1.6');
  assert.deepEqual(Object.keys(document.data), ['selectedFolderId', 'folders', 'links']);
  assert.deepEqual(document.data.links.map(({ id }) => id), ['second', 'first']);
  assert.deepEqual(document.data.folders.map(({ id }) => id), ['root', 'work']);
  assert.equal(json.includes('background'), false);
  assert.equal(json.includes('base64'), false);
  assert.equal(json.includes('favicon'), false);
  assert.equal(json.includes('chunk'), false);
  assert.equal(json.includes('generation'), false);
  assert.equal(json.includes('manifest'), false);

  const parsed = parseBackupText(json);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.data, document.data);
  assert.deepEqual(parsed.preview, {
    createdAt: fixedDate.toISOString(),
    siteCount: 2,
    folderCount: 1,
  });
});

test('buildImportedState preserves the target background', () => {
  const current = makeState();
  const parsed = parseBackupText(serializeBackup(makeState(), { now: fixedDate }));
  const imported = buildImportedState(current, parsed.data);

  assert.deepEqual(imported.background, current.background);
  assert.notEqual(imported.background, current.background);
  assert.deepEqual(imported.links, parsed.data.links);
  assert.deepEqual(imported.folders, parsed.data.folders);
  assert.notEqual(imported.links, parsed.data.links);
});

test('rejects malformed JSON and unsupported versions', () => {
  assert.deepEqual(parseBackupText('{broken'), { ok: false, error: 'invalid-json' });
  assert.deepEqual(
    parseMutated((document) => {
      document.backupVersion = 2;
    }),
    { ok: false, error: 'unsupported-backup' },
  );
  assert.deepEqual(
    parseMutated((document) => {
      document.format = 'another-format';
    }),
    { ok: false, error: 'unsupported-backup' },
  );
});

test('rejects files over 1 MB', () => {
  assert.deepEqual(
    parseBackupText('x'.repeat(MAX_BACKUP_BYTES + 1)),
    { ok: false, error: 'file-too-large' },
  );
});

test('rejects unknown fields and invalid relational data', () => {
  const cases = [
    (document) => {
      document.extra = true;
    },
    (document) => {
      document.data.links[0].extra = true;
    },
    (document) => {
      document.data.links[0].url = 'javascript:alert(1)';
    },
    (document) => {
      document.data.links[1].id = document.data.links[0].id;
    },
    (document) => {
      document.data.folders = document.data.folders.filter(({ id }) => id !== 'root');
    },
    (document) => {
      document.data.links[0].folderId = 'missing';
    },
  ];

  for (const mutate of cases) {
    assert.deepEqual(parseMutated(mutate), { ok: false, error: 'invalid-backup-data' });
  }
});

test('normalizes scheme-less web URLs during import', () => {
  const parsed = parseMutated((document) => {
    document.data.links[0].url = 'example.com/path';
  });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.links[0].url, 'https://example.com/path');
});

test('enforces site and folder count limits', () => {
  const tooManySites = parseMutated((document) => {
    document.data.links = Array.from({ length: 501 }, (_, index) => ({
      id: `site-${index}`,
      title: `Site ${index}`,
      url: `https://example.com/${index}`,
      folderId: 'root',
    }));
  });
  assert.deepEqual(tooManySites, { ok: false, error: 'invalid-backup-data' });

  const tooManyFolders = parseMutated((document) => {
    document.data.folders = [
      { id: 'root', name: 'Избранное' },
      ...Array.from({ length: 100 }, (_, index) => ({
        id: `folder-${index}`,
        name: `Folder ${index}`,
      })),
    ];
    document.data.links = [];
    document.data.selectedFolderId = 'all';
  });
  assert.deepEqual(tooManyFolders, { ok: false, error: 'invalid-backup-data' });
});

test('uses a stable dated backup filename', () => {
  assert.equal(getBackupFilename(fixedDate), 'minimal-new-tab-backup-2026-07-04.json');
});
