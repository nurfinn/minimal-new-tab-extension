# Store Copy and GitHub README Publication Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver concise Russian and English Chrome Web Store copy, publish a fuller English GitHub README, update the repository About description, and fast-forward `main` to release `1.5.4`.

**Architecture:** Keep Store copy in the approved specification for manual entry in Chrome Web Store, while `README.md` becomes the complete public product page. Publish the already-tested release and documentation through a non-force fast-forward of `main`, then verify both the remote commit and About description.

**Tech Stack:** Markdown, Git, GitHub CLI, Node.js built-in test runner.

## Global Constraints

- README content is English-only.
- Chrome Web Store copy remains short and non-technical in both Russian and English.
- GitHub README is fuller but avoids internal storage implementation details.
- Release version remains `1.5.4`.
- Push directly to `main` without force and without creating a pull request.
- Repository About description is exactly: `A clean, customizable Chrome new tab with folders, sync, shortcuts, backgrounds, and portable backups.`

---

### Task 1: Publish-ready English README

**Files:**
- Modify: `README.md`
- Reference: `docs/superpowers/specs/2026-07-12-store-copy-github-readme-design.md`

**Interfaces:**
- Consumes: approved English Store description and release notes.
- Produces: an English GitHub product page for Minimal New Tab `1.5.4`.

- [ ] **Step 1: Replace README content with the approved product structure**

Use this exact content:

```markdown
# Minimal New Tab by nurfinn

A minimal new tab for quick access to your favorite sites. Organize links into folders, customize the background, and move your setup between browsers.

Minimal New Tab replaces a busy default start page with a calm, focused space for the sites you use every day. Everything stays easy to reach without turning your new tab into another dashboard.

[Visit nurfinn.com](https://nurfinn.com/?utm_source=github&utm_medium=referral)

## Highlights

- Add, edit, delete, and reorder favorite sites.
- Organize sites into folders and arrange folders in your preferred order.
- Use a bundled default background or choose your own image and overlay.
- Open Add site with `A`, Create folder with `F`, and Settings with `S` — from any keyboard layout.
- See site favicons with a clean letter fallback when an icon is unavailable.
- Automatically use English or Russian based on your browser language.
- Keep lightweight settings synchronized between Chrome installations.
- Export and import sites and folders when moving to another browser.
- Enjoy smooth folder navigation and a stable layout with larger collections.

## What's New Since 1.5.2

- New default background.
- Keyboard shortcuts now work with any keyboard layout.
- Deleting sites and folders is smoother and more reliable.
- Improved custom background upload, preview, and saving.

## Sync and moving between browsers

Chrome Sync can restore sites, folders, their order, the selected folder, colors, and other lightweight preferences between Chrome installations when you are signed in to the same Google account and sync is enabled.

Chrome account data does not automatically transfer to Brave or other browsers. Use Export in Chrome and Import in the other browser to move your sites and folders.

## Backgrounds

The bundled default background is available on every installation. Custom background images are stored only on the current device, so large image data is never placed in Chrome Sync or JSON backups. If a local custom image is unavailable, the interface safely falls back to the standard background.

## Privacy

Minimal New Tab has no account system, backend, Google OAuth, analytics, advertising, or browsing-history collection. Your saved sites and preferences remain in browser storage controlled by you.

## Permissions

- `storage` saves sites, folders, settings, and the local custom background.
- `favicon` displays icons for addresses you have saved.

The extension does not request access to all websites.

## Install locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the extension folder.
5. After updating files, click **Reload** on the extension card and open a new tab.

Current release: **1.5.4**.
```

- [ ] **Step 2: Validate README content and formatting**

Run:

```bash
rg -n "^# |^## |What's New Since 1.5.2|Current release: \*\*1.5.4\*\*|nurfinn.com" README.md
git diff --check -- README.md
```

Expected: all required sections are present, the version is `1.5.4`, and whitespace validation passes.

- [ ] **Step 3: Commit the README refresh**

```bash
git add README.md docs/superpowers/plans/2026-07-12-store-copy-github-readme-publish.md
git commit -m "Refresh GitHub product description"
```

---

### Task 2: Verify and publish release 1.5.4

**Files:**
- Verify: `manifest.json`
- Verify: `tests/*.test.mjs`
- Update externally: `nurfinn/minimal-new-tab-extension` About description and `main` branch.

**Interfaces:**
- Consumes: clean local release branch whose history is a strict fast-forward of `origin/main`.
- Produces: GitHub `main` at the local release commit with the approved About description.

- [ ] **Step 1: Verify the complete release before publication**

Run:

```bash
node --test tests/*.test.mjs
git diff --check
test -z "$(git status --porcelain)"
node -e "const m=require('./manifest.json'); if(m.version !== '1.5.4') process.exit(1)"
```

Expected: all tests pass, the worktree is clean, and the manifest version is `1.5.4`.

- [ ] **Step 2: Confirm a safe fast-forward path**

Run:

```bash
git fetch origin main
git merge-base --is-ancestor origin/main HEAD
gh auth status
```

Expected: `origin/main` is an ancestor of `HEAD` and GitHub authentication is active. Stop without pushing if either check fails.

- [ ] **Step 3: Fast-forward and push main without force**

Run:

```bash
git branch -f main HEAD
git push origin main
```

Expected: GitHub reports a normal fast-forward update of `main`.

- [ ] **Step 4: Update GitHub About description**

Run:

```bash
gh repo edit nurfinn/minimal-new-tab-extension --description "A clean, customizable Chrome new tab with folders, sync, shortcuts, backgrounds, and portable backups."
```

Expected: command exits successfully.

- [ ] **Step 5: Verify remote publication**

Run:

```bash
test "$(git rev-parse HEAD)" = "$(git ls-remote origin refs/heads/main | cut -f1)"
gh repo view nurfinn/minimal-new-tab-extension --json description,defaultBranchRef,url
```

Expected: remote `main` equals local `HEAD`, the default branch is `main`, and the About description exactly matches the approved text.
