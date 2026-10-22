import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve, extname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildChromeRelease } from "./build-chrome.mjs";
import { buildFirefoxRelease } from "./build-firefox.mjs";
import { createStorageService, STORAGE_KEYS } from "../storage-service.mjs";
import { serializeBackup } from "../backup-service.mjs";
import { makeArea } from "../tests/helpers/feature-storage-fixtures.mjs";

const require = createRequire(process.env.PLAYWRIGHT_MODULE || import.meta.url);
const { chromium, firefox } = require("playwright");
const sourceRoot = process.env.REVIEW_SOURCE_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = await mkdtemp(join(tmpdir(), "minimal-tab-review-regressions-"));
const group = process.argv[2] || "all";
const results = [];
const mime = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  const path = resolve(output, "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname));
  if (!path.startsWith(output + sep)) { res.writeHead(403); res.end(); return; }
  try { const body = await readFile(path); res.writeHead(200, { "content-type": mime[extname(path)] || "application/octet-stream" }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function idle(page) {
  await until(() => page.evaluate(async () => (await import("./newtab.js")).updateSafety.getBlockReason() === null));
}
async function until(predicate) {
  for (let i = 0; i < 200; i++) { if (await predicate()) return; await pause(25); }
  assert.fail("Timed out waiting for the operation to finish");
}
const seed = () => ({ selectedFolderId: "all", showAllFolder: true, shortcutsEnabled: true,
  folders: [{ id: "root", name: "Favorites" }, { id: "work", name: "Work" }, { id: "personal", name: "Personal" }],
  links: [{ id: "alpha", title: "Alpha", url: "https://example.com/alpha", folderId: "work" },
    { id: "beta", title: "Beta", url: "https://example.org/beta", folderId: "personal" }],
  background: { type: "image", value: "images/default-background.png", overlay: 0, overlayColor: "#17122b" } });

try {
  for (const platform of ["chrome", "firefox"]) {
    const build = platform === "chrome" ? buildChromeRelease : buildFirefoxRelease;
    await build({ sourceRoot, outputDir: join(output, platform), archivePath: join(output, `review-${platform}.zip`) });
    const browser = await (platform === "chrome" ? chromium : firefox).launch({ headless: true });
    async function fresh() {
      const sync = makeArea(), local = makeArea();
      const service = createStorageService({ syncArea: sync, localArea: local, logger: null });
      assert.equal((await service.save(seed())).ok, true);
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
      context.setDefaultTimeout(5000);
      let gate = null, held = false, activeRequests = 0, failedWrites = 0;
      const faults = { write: false, read: false };
      await context.exposeBinding("__reviewStorage", async (_, area, method, data) => {
        activeRequests++;
        try {
          if (area === "sync" && method === "get" && gate) { held = true; await gate.promise; }
          if (area === "sync" && method === "get" && faults.read) throw new Error("Injected read failure");
          if (area === "sync" && method === "set" && faults.write) { failedWrites++; throw new Error("Injected write failure"); }
          return await { sync, local }[area][method](data);
        } finally { activeRequests--; }
      });
      await context.addInitScript(platform => {
        const area = name => Object.fromEntries(["get", "set", "remove"].map(method => [method, value => globalThis.__reviewStorage(name, method, value)]));
        const api = { storage: { sync: area("sync"), local: area("local") },
          runtime: { getURL: path => new URL(path, location.href).href },
          permissions: { getAll: async () => ({ data_collection: [] }) } };
        Object.defineProperty(globalThis, platform === "chrome" ? "chrome" : "browser", { configurable: true, value: api });
      }, platform);
      await context.route("**/*", route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
      const errors = [];
      context.on("page", p => p.on("pageerror", error => errors.push(error.message)));
      async function page() {
        const p = await context.newPage(); await p.goto(`${origin}/${platform}/newtab.html`);
        await p.locator('[data-edit-link="alpha"]').waitFor({ state: "attached" });
        return p;
      }
      return { context, page, service, errors, sync, faults,
        current: async () => (await service.load(seed())).state,
        hold() { held = false; let release; const promise = new Promise(resolve => { release = resolve; }); gate = { promise, release }; },
        held: () => until(() => held),
        release() { const old = gate; gate = null; old?.release(); },
        async settled(p, predicate) {
          await until(predicate);
          await until(() => activeRequests === 0);
          await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        },
        failed: () => failedWrites > 0
      };
    }
    async function check(category, name, action) {
      if (group !== "all" && group !== category) return;
      const f = await fresh();
      try { await action(f); assert.deepEqual(f.errors, []); results.push({ platform, name, ok: true }); }
      catch (error) { results.push({ platform, name, ok: false, error: error.stack }); }
      finally { f.release(); await f.context.close(); }
      console.log(`${results.at(-1).ok ? "PASS" : "FAIL"} ${platform}: ${name}`);
      if (!results.at(-1).ok) console.log(results.at(-1).error);
    }
    try {
      await check("forms", "a pending site save cannot overwrite a reopened site or its draft", async f => {
        const p = await f.page();
        await p.locator('[data-edit-link="alpha"]').click();
        await p.locator("#linkTitle").fill("Alpha changed");
        f.hold();
        await p.locator("#linkSubmitButton").click();
        await f.held();
        await p.locator("#linkDialog .modal-header [data-close]").click();
        await p.locator('[data-edit-link="beta"]').click();
        await p.locator("#linkTitle").fill("Beta draft");
        f.release();
        await f.settled(p, async () => (await f.current()).links.some(s => s.title === "Alpha changed"));
        const saved = await f.current();
        assert.equal(saved.links.find(s => s.id === "alpha").title, "Alpha changed");
        assert.equal(saved.links.find(s => s.id === "beta").title, "Beta");
        assert.equal(saved.links.find(s => s.id === "beta").url, "https://example.org/beta");
        assert.equal(await p.locator("#linkDialog").evaluate(node => node.open), true);
        assert.equal(await p.locator("#linkTitle").inputValue(), "Beta draft");
        assert.equal(await p.locator("#linkFolder").inputValue(), "personal");
        assert.equal(await p.locator("#linkSubmitButton").isEnabled(), true);
        await p.locator("#linkSubmitButton").click();
        await p.locator("#linkDialog").waitFor({ state: "hidden" });
        assert.equal((await f.current()).links.find(s => s.id === "beta").title, "Beta draft");
      });
      await check("forms", "an old failed save cannot add errors to a new dialog", async f => {
        const p = await f.page();
        await p.locator('[data-edit-link="alpha"]').click();
        await p.locator("#linkTitle").fill("Alpha changed");
        f.hold();
        await p.locator("#linkSubmitButton").click(); await f.held();
        await p.locator("#linkDialog .modal-header [data-close]").click();
        await p.locator('[data-edit-link="beta"]').click();
        await p.locator("#linkTitle").fill("Beta draft");
        f.faults.write = true; f.release();
        await f.settled(p, f.failed);
        assert.equal(await p.locator("#linkFormError").isVisible(), false);
        assert.equal(await p.locator("#linkTitle").inputValue(), "Beta draft");
        assert.equal((await f.current()).links.find(s => s.id === "beta").title, "Beta");
      });
      await check("forms", "swipe autosave preserves the open site's chosen folder", async f => {
        const p = await f.page();
        await p.locator(".content").dispatchEvent("wheel", { deltaX: 80, deltaY: 0, bubbles: true, cancelable: true });
        await p.locator('[data-edit-link="alpha"]').click();
        await p.locator("#linkFolder").selectOption("personal");
        await f.settled(p, async () => (await f.current()).selectedFolderId === "work");
        assert.equal(await p.locator("#linkFolder").inputValue(), "personal");
        await p.locator("#linkSubmitButton").click();
        await p.locator("#linkDialog").waitFor({ state: "hidden" });
        assert.equal((await f.current()).links.find(s => s.id === "alpha").folderId, "personal");
      });
      await check("forms", "swipe autosave preserves inline rename text and focus", async f => {
        const p = await f.page();
        await p.locator(".content").dispatchEvent("wheel", { deltaX: 80, deltaY: 0, bubbles: true, cancelable: true });
        await p.locator("#addFolderButton").click();
        await p.locator('[data-rename-folder="work"]').click();
        const input = p.locator('[data-folder-rename-input="work"]');
        await input.fill("Work draft");
        await input.evaluate(node => node.setSelectionRange(2, 6));
        await f.settled(p, async () => (await f.current()).selectedFolderId === "work");
        assert.equal(await input.inputValue(), "Work draft");
        assert.deepEqual(await input.evaluate(node => [document.activeElement === node, node.selectionStart, node.selectionEnd]), [true, 2, 6]);
        await p.locator('[data-save-folder-rename="work"]').click();
        await until(async () => (await f.current()).folders.find(x => x.id === "work").name === "Work draft");
      });
      await check("backups", "export reads changes already saved by a different tab", async f => {
        const oldPage = await f.page(), newPage = await f.page();
        await newPage.locator("#addLinkButton").click();
        await newPage.locator("#linkTitle").fill("Gamma");
        await newPage.locator("#linkUrl").fill("https://example.net/gamma");
        await newPage.locator("#linkSubmitButton").click();
        await newPage.locator("#linkDialog").waitFor({ state: "hidden" });
        await oldPage.locator("#settingsButton").click();
        await oldPage.locator("#backupSettingsTab").click();
        const waiting = oldPage.waitForEvent("download");
        await oldPage.locator("#exportBackupButton").click();
        const download = await waiting;
        const contents = JSON.parse(await readFile(await download.path(), "utf8"));
        assert.deepEqual(contents.data.links.map(s => s.title), ["Gamma", "Alpha", "Beta"]);
      });
      await check("backups", "a failed export read reports an error without downloading defaults", async f => {
        const p = await f.page();
        await p.locator("#settingsButton").click();
        await p.locator("#backupSettingsTab").click();
        const downloads = [];
        p.on("download", download => downloads.push(download));
        f.faults.read = true;
        await p.locator("#exportBackupButton").click();
        await p.locator("#importError").waitFor({ state: "visible" });
        assert.equal(downloads.length, 0);
        assert.equal(await p.locator("#exportBackupButton").isEnabled(), true);
      });
      await check("capacity", "oversized import explains the capacity limit and preserves current sites", async f => {
        const p = await f.page(), large = seed();
        large.links = Array.from({ length: 500 }, (_, i) => ({ id: `site-${i}`, title: `Example ${i}`,
          url: `https://example.com/${i}`, folderId: "work" }));
        await p.locator("#settingsButton").click();
        await p.locator("#backupSettingsTab").click();
        await p.locator("#importBackupInput").setInputFiles({ name: "large-backup.json", mimeType: "application/json", buffer: Buffer.from(serializeBackup(large)) });
        await p.locator("#confirmImportButton").click();
        await p.locator("#importError").waitFor({ state: "visible" });
        assert.match(await p.locator("#importError").textContent(), /sync space/i);
        assert.deepEqual((await f.current()).links.map(s => s.title), ["Alpha", "Beta"]);
        assert.equal(await p.locator("#confirmImportButton").isEnabled(), true);
      });
      await check("navigation", "a new selection in a stale tab wins on the first click", async f => {
        const first = await f.page(), second = await f.page();
        await first.locator('[data-folder="work"]').click(); await idle(first);
        await second.locator('[data-folder="personal"]').click(); await idle(second);
        assert.equal((await f.current()).selectedFolderId, "personal");
        assert.equal(await second.locator('[data-folder][aria-pressed="true"]').getAttribute("data-folder"), "personal");
      });
      await check("navigation", "an older deferred swipe cannot overwrite a newer selection", async f => {
        const first = await f.page(), second = await f.page();
        await first.locator(".content").dispatchEvent("wheel", { deltaX: 80, deltaY: 0, bubbles: true, cancelable: true });
        await second.locator('[data-folder="personal"]').click(); await idle(second);
        await idle(first);
        assert.equal((await f.current()).selectedFolderId, "personal");
      });
      await check("navigation", "a new explicit choice of the already-visible folder supersedes an older swipe", async f => {
        const first = await f.page(), second = await f.page();
        await first.locator(".content").dispatchEvent("wheel", { deltaX: 80, deltaY: 0, bubbles: true, cancelable: true });
        await second.locator('[data-folder="all"]').click();
        await idle(second); await idle(first);
        assert.equal((await f.current()).selectedFolderId, "all");
      });
      await check("navigation", "the last rapid local choice survives an in-flight save", async f => {
        const p = await f.page(); f.hold();
        await p.locator('[data-folder="work"]').click(); await f.held();
        await p.locator('[data-folder="personal"]').click();
        await p.locator('[data-folder="work"]').click();
        await p.locator('[data-folder="personal"]').click();
        f.release(); await idle(p);
        assert.equal((await f.current()).selectedFolderId, "personal");
        await p.reload(); await idle(p);
        assert.equal(await p.locator('[data-folder][aria-pressed="true"]').getAttribute("data-folder"), "personal");
      });
      await check("navigation", "a deferred selection cannot resurrect a deleted folder", async f => {
        const p = await f.page();
        await p.locator(".content").dispatchEvent("wheel", { deltaX: 80, deltaY: 0, bubbles: true, cancelable: true });
        assert.equal((await f.service.update(seed(), latest => ({
          ...latest, selectedFolderId: "all",
          folders: latest.folders.filter(folder => folder.id !== "work"),
          links: latest.links.map(site => site.folderId === "work" ? { ...site, folderId: "root" } : site)
        }))).ok, true);
        await idle(p);
        assert.equal((await f.current()).selectedFolderId, "all");
        assert.equal(await p.locator('[data-folder="work"]').count(), 0);
      });
      await check("navigation", "a deferred selection cannot reopen hidden All", async f => {
        const p = await f.page();
        await p.locator('[data-folder="work"]').click(); await idle(p);
        await p.locator(".content").dispatchEvent("wheel", { deltaX: -80, deltaY: 0, bubbles: true, cancelable: true });
        assert.equal((await f.service.update(seed(), latest => ({
          ...latest, showAllFolder: false, selectedFolderId: "work"
        }))).ok, true);
        await idle(p);
        assert.equal((await f.current()).selectedFolderId, "work");
        assert.equal(await p.locator('[data-folder="all"]').count(), 0);
      });
      await check("navigation", "saving a site in another tab supersedes an older swipe", async f => {
        const first = await f.page(), second = await f.page();
        await second.locator("#addLinkButton").click();
        await second.locator("#linkTitle").fill("New personal site");
        await second.locator("#linkUrl").fill("https://example.net/new");
        await second.locator("#linkFolder").selectOption("personal");
        await first.locator(".content").dispatchEvent("wheel", { deltaX: 80, deltaY: 0, bubbles: true, cancelable: true });
        await second.locator("#linkSubmitButton").click();
        await second.locator("#linkDialog").waitFor({ state: "hidden" });
        await idle(first);
        const state = await f.current();
        assert.equal(state.selectedFolderId, "personal");
        assert.equal(state.links.find(site => site.title === "New personal site").folderId, "personal");
      });
      await check("navigation", "deferred folder reveal cannot steal newer keyboard focus", async f => {
        const p = await f.page();
        await p.evaluate(() => {
          document.querySelector('[data-folder="work"]').click();
          document.querySelector('[data-folder="personal"]').focus();
        });
        await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await p.evaluate(() => document.activeElement?.dataset.folder), "personal");
        await p.keyboard.press("Enter");
        await idle(p);
        assert.equal((await f.current()).selectedFolderId, "personal");
      });
    } finally { await browser.close(); }
  }
} finally {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await writeFile(join(output, "report.json"), JSON.stringify(results, null, 2));
  console.log(`Report: ${output}/report.json`);
}
if (!results.length || results.some(result => !result.ok)) process.exitCode = 1;
