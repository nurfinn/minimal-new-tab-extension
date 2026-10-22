import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildChromeRelease } from "./build-chrome.mjs";

const require = createRequire(process.env.PLAYWRIGHT_MODULE || import.meta.url);
const { chromium } = require("playwright");
const sourceRoot = process.env.REVIEW_SOURCE_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = await mkdtemp(join(tmpdir(), "minimal-tab-native-review-"));
const extension = join(output, "chrome");
await buildChromeRelease({ sourceRoot, outputDir: extension, archivePath: join(output, "chrome.zip") });
const report = { environment: "Isolated unpacked Chromium extension; native storage and Web Locks; no account or external network", checks: [] };
const context = await chromium.launchPersistentContext(join(output, "profile"), {
  channel: "chromium", headless: true, viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
});
context.setDefaultTimeout(10000);
await context.route(/^https?:/, route => route.abort());
const seed = { selectedFolderId: "all", showAllFolder: true, shortcutsEnabled: true,
  folders: [{ id: "root", name: "Favorites" }, { id: "work", name: "Work" }, { id: "personal", name: "Personal" }],
  links: [{ id: "alpha", title: "Alpha", url: "https://example.com/alpha", folderId: "work" },
    { id: "beta", title: "Beta", url: "https://example.org/beta", folderId: "personal" }],
  background: { type: "image", value: "images/default-background.png", overlay: 0, overlayColor: "#17122b" } };
const errors = [];
context.on("page", p => p.on("pageerror", error => errors.push(error.message)));
try {
  const page = context.pages()[0] || await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("chrome://newtab/");
  await page.locator("#folderRow [data-folder]").first().waitFor();
  const url = await page.evaluate(() => chrome.runtime.getURL("newtab.html"));
  const load = () => page.evaluate(async seed => {
    const { createStorageService } = await import("./storage-service.mjs");
    return (await createStorageService({ logger: null }).load(seed)).state;
  }, seed);
  async function settle(predicate) {
    for (let i = 0; i < 200; i++) {
      if (await predicate()) {
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.fail("Native operation did not settle");
  }
  async function reset() {
    await page.evaluate(async seed => {
      await chrome.storage.sync.clear();
      await chrome.storage.local.clear();
      localStorage.clear();
      const { createStorageService } = await import("./storage-service.mjs");
      const result = await createStorageService({ logger: null }).save(seed);
      if (!result.ok) throw new Error("Could not seed isolated storage");
    }, seed);
    await page.reload();
    await page.locator('[data-edit-link="alpha"]').waitFor({ state: "attached" });
  }
  async function check(name, action) {
    await reset();
    await action();
    assert.deepEqual(errors, []);
    report.checks.push({ name, passed: true });
    console.log(`PASS native Chrome: ${name}`);
  }
  await check("swipe save preserves a site's chosen folder", async () => {
    await page.locator(".content").dispatchEvent("wheel", { deltaX: 80, deltaY: 0, bubbles: true, cancelable: true });
    await page.locator('[data-edit-link="alpha"]').click();
    await page.locator("#linkFolder").selectOption("personal");
    await settle(async () => (await load()).selectedFolderId === "work");
    assert.equal(await page.locator("#linkFolder").inputValue(), "personal");
    await page.locator("#linkSubmitButton").click();
    await page.locator("#linkDialog").waitFor({ state: "hidden" });
    assert.equal((await load()).links.find(site => site.id === "alpha").folderId, "personal");
  });
  await check("lock-delayed Alpha save leaves Beta and its new draft intact", async () => {
    const peer = await context.newPage();
    try {
      await peer.goto(url);
      await peer.locator("#folderRow [data-folder]").first().waitFor();
      await peer.evaluate(() => {
        navigator.locks.request("minimal-new-tab-state", () => new Promise(resolve => {
          window.releaseReviewLock = resolve; window.reviewLockHeld = true;
        }));
      });
      await peer.waitForFunction(() => window.reviewLockHeld);
      await page.locator('[data-edit-link="alpha"]').click();
      await page.locator("#linkTitle").fill("Alpha changed");
      await page.locator("#linkSubmitButton").click();
      await page.locator("#linkDialog .modal-header [data-close]").click();
      await page.locator('[data-edit-link="beta"]').click();
      await page.locator("#linkTitle").fill("Beta draft");
      await peer.evaluate(() => window.releaseReviewLock());
      await settle(async () => (await load()).links.find(site => site.id === "alpha").title === "Alpha changed");
      const state = await load();
      assert.equal(state.links.find(site => site.id === "beta").title, "Beta");
      assert.equal(state.links.find(site => site.id === "beta").url, "https://example.org/beta");
      assert.equal(await page.locator("#linkDialog").evaluate(node => node.open), true);
      assert.equal(await page.locator("#linkTitle").inputValue(), "Beta draft");
      await page.locator("#linkSubmitButton").click();
      await page.locator("#linkDialog").waitFor({ state: "hidden" });
      assert.equal((await load()).links.find(site => site.id === "beta").title, "Beta draft");
    } finally { await peer.close(); }
  });
  await check("a stale extension tab's first click is saved", async () => {
    const peer = await context.newPage();
    try {
      await peer.goto(url);
      await peer.locator('[data-folder="all"][aria-pressed="true"]').waitFor();
      await page.locator('[data-folder="work"]').click();
      await settle(async () => (await load()).selectedFolderId === "work");
      await peer.locator('[data-folder="personal"]').click();
      await settle(async () => (await load()).selectedFolderId === "personal");
      assert.equal(await peer.locator('[data-folder="personal"]').getAttribute("aria-pressed"), "true");
    } finally { await peer.close(); }
  });
  await check("export includes a site saved in another extension tab", async () => {
    const peer = await context.newPage();
    try {
      await peer.goto(url);
      await peer.locator("#addLinkButton").click();
      await peer.locator("#linkTitle").fill("Gamma");
      await peer.locator("#linkUrl").fill("https://example.net/gamma");
      await peer.locator("#linkSubmitButton").click();
      await peer.locator("#linkDialog").waitFor({ state: "hidden" });
      await page.locator("#settingsButton").click();
      await page.locator("#backupSettingsTab").click();
      const pending = page.waitForEvent("download");
      await page.locator("#exportBackupButton").click();
      const file = await (await pending).path();
      const backup = JSON.parse(await readFile(file, "utf8"));
      assert.deepEqual(backup.data.links.map(site => site.title), ["Gamma", "Alpha", "Beta"]);
    } finally { await peer.close(); }
  });
} finally {
  await context.close();
  await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(`Native report: ${output}/report.json`);
}
