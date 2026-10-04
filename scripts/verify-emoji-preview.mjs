// Verify the local synthetic preview, not an installation in the user's profile.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
const require = createRequire(import.meta.url);
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.argv[2];
const output = resolve(process.argv[3]);
await mkdir(output, { recursive: true });
const report = { checks: [], errors: [] };
for (const engine of ['chromium', 'firefox']) {
  const browser = await playwright[engine].launch({ headless: true });
  try {
    for (const locale of ['en', 'ru']) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
      page.on('pageerror', error => report.errors.push(error.message));
      await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
      await page.route('https://www.google.com/**', route => route.fulfill({
        path: new URL('../firefox/site-icons/github.svg', import.meta.url).pathname,
        contentType: 'image/svg+xml',
      }));
      await page.goto(`${origin}/?lang=${locale}`);
      await page.locator('[data-emoji-category="all"][aria-pressed="true"]').waitFor();
      await page.locator('[data-site-emoji]').first().waitFor();
      assert.equal(await page.locator('html').getAttribute('lang'), locale);
      assert.equal(await page.locator('[data-emoji-category]').count(), 10);
      await page.locator('[data-site-emoji]').first().focus();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.locator('[data-site-emoji]').nth(4).hover();
      await page.screenshot({ path: join(output, `preview-${engine}-${locale}.png`) });
      await page.locator('#emojiSearch').fill(locale === 'ru' ? 'ракета' : 'rocket');
      await page.locator('[data-site-emoji="🚀"]').click();
      assert.equal(await page.locator('#linkIconPreviewEmoji').textContent(), '🚀');
      await page.locator('#linkSubmitButton').click();
      await page.locator('#linkDialog').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('[data-link-id="demo-github"] .favicon-letter').textContent(), '🚀');
      await page.locator('[data-edit-link="demo-github"]').click();
      await page.locator('#linkIconButton').click();
      await page.locator('#linkIconAuto').click();
      await page.locator('#linkDialog [data-close]').last().click();
      assert.equal(await page.locator('[data-link-id="demo-github"] .favicon-letter').textContent(), '🚀');
      const forbidden = await page.request.get(`${origin}/.git`);
      assert.equal(forbidden.status(), 404);
      report.checks.push({ engine, locale, ok: true });
      await page.goto(`${origin}/?demo=folders&lang=${locale}`);
      await page.locator('#folderDialog').waitFor({ state: 'visible' });
      const all = page.locator('#folderRow [data-folder="all"]');
      const visibility = page.locator('#showAllFolder');
      assert.equal(await visibility.isChecked(), true);
      assert.equal(await all.count(), 1);
      assert.equal(await page.locator('label[for="showAllFolder"]').innerText(), locale === 'ru' ? 'Показывать «Все»' : 'Show “All”');
      await visibility.click();
      await page.waitForFunction(() => !document.querySelector('#folderRow [data-folder="all"]'));
      assert.equal(await page.locator('#folderRow [data-folder]').count(), 5);
      assert.equal(await visibility.isChecked(), false);
      await visibility.click();
      await all.waitFor({ state: 'attached' });
      assert.equal(await visibility.isChecked(), true);
      await page.screenshot({ path: join(output, `preview-folders-${engine}-${locale}.png`) });
      await page.locator('#folderDialog [data-close]').last().click();
      await page.locator('#folderDialog').waitFor({ state: 'hidden' });
      report.checks.push({ engine, locale, demo: 'folders', ok: true });
      await page.close();
    }
  } finally { await browser.close(); }
}
assert.deepEqual(report.errors, []);
report.ok = true;
await writeFile(join(output, 'preview-report.json'), JSON.stringify(report, null, 2));
console.log('Preview: eight emoji/folder locale/engine flows passed, zero page errors; ' + output);
