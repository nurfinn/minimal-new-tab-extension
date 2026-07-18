import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const catalog = await import('../firefox/favicon-catalog.mjs');

test('covers the approved catalog with committed assets', async () => {
  assert.ok(catalog.ICON_DEFINITIONS.length >= 60);
  const assets = new Set(catalog.ICON_DEFINITIONS.map(({ asset }) => asset));
  assert.ok(assets.size >= 60);

  for (const asset of assets) {
    await access(new URL(`../firefox/site-icons/${asset}`, import.meta.url));
  }

  const notice = await readFile(
    new URL('../firefox/site-icons/THIRD_PARTY_NOTICES.md', import.meta.url),
    'utf8',
  );
  assert.match(notice, /Simple Icons/i);
  assert.match(notice, /trademark/i);
});

test('packages only allowlisted passive icon assets', async () => {
  const expectedAssets = [...new Set(
    catalog.ICON_DEFINITIONS.map(({ asset }) => asset),
  )].sort();
  const packagedAssets = (await readdir(
    new URL('../firefox/site-icons/', import.meta.url),
  )).filter((name) => name !== 'THIRD_PARTY_NOTICES.md').sort();

  assert.deepEqual(packagedAssets, expectedAssets);

  for (const asset of expectedAssets.filter((name) => name.endsWith('.svg'))) {
    const source = await readFile(
      new URL(`../firefox/site-icons/${asset}`, import.meta.url),
      'utf8',
    );
    assert.doesNotMatch(
      source,
      /<script|<foreignObject|\bonload=|\bonerror=|\bhref=/i,
      asset,
    );
  }
});

test('uses specific Google products before the parent domain', () => {
  assert.equal(
    catalog.resolveLocalFavicon('https://sheets.google.com/'),
    'site-icons/google-sheets.svg',
  );
  assert.equal(
    catalog.resolveLocalFavicon('https://docs.google.com/spreadsheets/d/private-id/edit'),
    'site-icons/google-sheets.svg',
  );
  assert.equal(
    catalog.resolveLocalFavicon('https://docs.google.com/presentation/d/private-id/edit'),
    'site-icons/google-slides.svg',
  );
  assert.equal(
    catalog.resolveLocalFavicon('https://docs.google.com/document/d/private-id/edit'),
    'site-icons/google-docs.svg',
  );
});

test('matches common aliases and subdomains without false suffix matches', () => {
  assert.equal(
    catalog.resolveLocalFavicon('https://github.com/openai/codex'),
    'site-icons/github.svg',
  );
  assert.equal(
    catalog.resolveLocalFavicon('https://old.reddit.com/r/firefox'),
    'site-icons/reddit.svg',
  );
  assert.equal(
    catalog.resolveLocalFavicon('https://twitter.com/nurfinn'),
    'site-icons/x.svg',
  );
  assert.equal(
    catalog.resolveLocalFavicon('https://x.com/nurfinn'),
    'site-icons/x.svg',
  );
  assert.equal(
    catalog.resolveLocalFavicon('https://workspace.slack.com/'),
    'site-icons/slack.png',
  );
  assert.equal(catalog.resolveLocalFavicon('https://notgithub.com/'), null);
});

test('covers selected AI, cloud, registrar, and productivity services', () => {
  const cases = new Map([
    ['https://chatgpt.com/', 'site-icons/openai.png'],
    ['https://claude.ai/', 'site-icons/anthropic.svg'],
    ['https://gemini.google.com/', 'site-icons/google-gemini.svg'],
    ['https://www.perplexity.ai/', 'site-icons/perplexity.svg'],
    ['https://vercel.com/', 'site-icons/vercel.svg'],
    ['https://railway.app/', 'site-icons/railway.svg'],
    ['https://www.namecheap.com/', 'site-icons/namecheap.svg'],
    ['https://www.figma.com/', 'site-icons/figma.svg'],
  ]);

  for (const [url, asset] of cases) {
    assert.equal(catalog.resolveLocalFavicon(url), asset, url);
  }
});

test('rejects invalid and non-web URLs', () => {
  assert.equal(catalog.resolveLocalFavicon('github.com'), null);
  assert.equal(catalog.resolveLocalFavicon('javascript:alert(1)'), null);
  assert.equal(catalog.resolveLocalFavicon('not a URL'), null);
});
