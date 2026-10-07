# Mixed-version Feature Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сохранить emoji и видимость All после обычных записей опубликованной 1.6, принимая сами изменения сайтов и не отменяя намеренный сброс новых настроек.

**Architecture:** Core остаётся `storageVersion: 1`; feature-поколения используют независимые sync-ключи. Чистая модель настроек и generation codec отделены от I/O в существующем storage service; отметка нового писателя определяет полное inline-намерение при неполной доставке sync.

**Tech Stack:** JavaScript ES modules, WebExtensions storage, TextEncoder, Web Crypto SHA-256, node:test, существующий Playwright и cached web-ext. Новые production dependencies не нужны.

**Spec:** [Подтверждённая схема](../specs/2026-10-04-mixed-version-feature-protection-design.md), commit `21e80da`; пользователь подтвердил документ «ок», затем делегировал исполнение «сам решай». Выбран Native-метод. Все шесть задач реализованы; независимое финальное ревью завершено, два Important storage findings исправлены одним RED→GREEN проходом. Свежие финальные проверки: 363/363 unit, 248/248 browser, 15/15 artifact; Firefox lint 0/0/0. Scoped storage-этап завершён; прежняя замена local wallpaper требует отдельного Important follow-up, ранние timing-наблюдения остаются открытыми. Runtime-интеграция dirty-файлов сохранена unstaged, push/merge и выпуск не выполнялись. [Результаты и ограничения](../../mixed-version-feature-protection-verification-2026-10-04.md).

## Global Constraints

- Рабочая копия: `/Users/nurfinn/.codex/worktrees/minimal-tab-ui-20260930`, ветка `codex/ui-polish-settings-toolbar-20260930`. Не создавать новый checkout из чистого main и не терять существующие незакоммиченные emoji/All/UI/icon-изменения.
- Core `storageVersion: 1`; feature `featureVersion: 1`; marker `featureState: { version: 1, generationId }`.
- Ключи: `minimalNewTabFeatureManifest`, `minimalNewTabFeatureManifestBackup`, `minimalNewTabFeatureChunk:<generationId>:<index>`. Никогда не использовать старый `minimalNewTabSyncChunk:` для feature-data.
- Feature JSON ≤ 32 768 UTF-8 bytes; chunk ≤ 3 500 UTF-8 bytes; ≤ 10 chunks. Активное и одно предыдущее исправное feature-поколение, backup без дополнительной истории.
- Sync: общий бюджет 102 400 bytes, item 8 192 bytes, 512 items; Chrome write budget 120/minute, 1 800/hour. Не переписывать features при core-only save после их создания.
- ID соответствует существующему `/^[a-z\d][a-z\d._:-]{0,127}$/i`; SHA-256 полного canonical URL связывает emoji с сайтом. Использовать результат `normalizeWebUrl`, включая query/fragment; `null` — явный favicon, `showAllFolder` — явный boolean.
- Core — единственный источник существования, адресов, названий, папок и порядка. Повреждение features не переводит валидный core в defaults.
- Не расширять API `createStorageService({ syncArea, localArea, lockManager, logger })`: `load`, `save`, `update` и существующие result/error-пути остаются доступны.
- Нет изменений UI, жестов, разрешений, consent, фоновых процессов, JSON v2, обоев или иконок. Точечный startup/save error через существующее сообщение допустим, если без него ошибка защиты скрывается.
- Никакого повышения релизной версии, обновления личных установок, перезаписи существующих Store ZIP, push, merge или публикации.
- Локальная публикация нескольких ключей и readback не объявляются распределённой atomic transaction. Реальный account sync / signed-store delivery остаются отдельно обозначенными непроверенными сценариями.
- Старый импорт ровно тех же ID/URL неотличим от обычной старой записи: сохраняет последний защищённый выбор. Импорт через новую версию явно применяет отсутствие emoji как favicon.
- Изменять локальные текстовые файлы через `apply_patch`. Не делать reset/stash/checkout пользовательских изменений. Коммиты локальные и только с проверенной дельтой задачи: нельзя целиком stage уже dirty файл и незаметно включить прежнюю работу; если дельту нельзя отделить, сохранить изменения и отложить такой коммит до отдельного checkpoint-решения.

## Review Focus

1. Старый писатель меняет только query/fragment у прежнего ID: emoji прежнего адреса не прикрепляется к новому. Тесты Task 1/3.
2. Новый v1 импорт повторяет ID и URL защищённого сайта без emoji: после старой записи всё ещё favicon, не восстановленный emoji. Тесты Task 5.
3. Feature-head отстал/повреждён после явного сброса в marked core: reset остаётся reset, а валидные сайты не заменяются defaults. Тесты Task 2/4.
4. Две вкладки одновременно запускают bootstrap, а core между чтениями меняется: нет вложенного lock/deadlock и публикации устаревших feature-данных. Тесты Task 3/4.
5. Set частично применился или квота исчерпана на временном пике: нет ложного успеха, опасного rollback/cleanup или удаления единственной исправной копии. Тесты Task 4/6.

## File map and execution preflight

- Create `feature-state.mjs`: feature schema, canonical JSON, URL identity и применение только к существующим сайтам. Не импортирует storage service, чтобы не создать ESM cycle.
- Create `feature-generation.mjs`: ограниченный codec/descriptor/manifest resolver и оценка sync-размера. Не вызывает browser I/O.
- Modify `storage-service.mjs`: публикация, чтение, bootstrap, no-op, writable и очистка. Core generation framework не переписывается.
- Create `tests/feature-state.test.mjs`, `tests/feature-generation.test.mjs`, `tests/mixed-version-feature-protection.test.mjs`, `tests/feature-storage-failures.test.mjs` и test-only `tests/helpers/feature-storage-fixtures.mjs`.
- Create `tests/fixtures/published-v1.6/{storage-service.mjs,extension-api.mjs,provenance.json}`: один точный legacy fixture; опубликованные Chrome/Firefox storage modules побайтово идентичны. Это не модель нового сериализатора.
- Modify обоих builders/packaging tests и `firefox/chrome-baseline.json` вместе с подключением runtime helpers, не позже браузерной проверки.
- Modify continuity/settings/emoji QA runners только для новых assertions/необходимой семантики fixtures. `newtab.js`, `newtab-core.mjs`, их locale/baseline entries изменять лишь если проверка выявит несоответствие утверждённой интеграции.
- Create `docs/mixed-version-feature-protection-verification-2026-10-04.md`; README/roadmap обновить после проверок. Исторический release acceptance не превращать в отчёт об исправлении.

До выполнения Task 1 прочитать оба документа и skill выбранного исполнения; проверить индекс, сохранить список dirty/untracked файлов и исходные hashes в отдельной новой QA-папке. Существующая worktree уже изолирована — применить using-git-worktrees только для проверки/reuse, без нового чистого checkout. Снять baseline `node --test tests/*.test.mjs`; его результат не считать тестированием ещё не написанной защиты. Все QA output paths должны быть новыми и вне source.

Локальный Node: `/Users/nurfinn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`. При исполнении сверить доступность через bundled workspace dependencies; в командах ниже `node` означает этот runtime. Playwright module: `/Users/nurfinn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`.

Для команд QA определить `QA_ROOT` как новую директорию через `mktemp -d /Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/feature-protection-20261004-XXXXXX`, затем экспортировать `PLAYWRIGHT_MODULE` с указанным абсолютным путём. Переменная обозначает уже созданную директорию текущего исполнения, не постоянный output, который можно перезаписать. Task 5 использует подкаталоги `integration-*`, Task 6 — `final-*`.

---

### Task 1: Pure feature schema, identity and explicit reset

**Files:** Create `feature-state.mjs`, `tests/feature-state.test.mjs`.

**Interfaces:**

- `hashSiteUrl(normalizedUrl, { digest } = {}) -> Promise<string>`: SHA-256 lowercase hex; injected digest has Web Crypto `(algorithm, Uint8Array) -> Promise<ArrayBuffer>` signature. Consumer supplies already canonical URL; default uses `crypto.subtle`, unavailable/rejected hashing throws.
- `validateFeaturePayload(value) -> boolean`; `canonicalFeatureJson(payload) -> string`, throwing on invalid/oversize payload.
- `buildFeaturePayload({ sites, showAllFolder }, previousPayload = null, { hashUrl = hashSiteUrl } = {}) -> Promise<FeaturePayload>`; site values contain canonical `url` and optional `emoji`. Sorted IDs, explicit tracked resets, prune absent sites, no titles/order/background.
- `applyFeaturePayload(corePayload, featurePayload, { hashUrl = hashSiteUrl } = {}) -> Promise<CorePayload>`: cloned core, matched existing ID/URL only; absent/mismatched record means favicon; preserve unrelated fields/preferences.

- [x] **Step 1: Write failing schema/identity tests.** Dynamically import the missing module and assert each export exists, then pin normalization, explicit reset, URL binding, stable ordering and input immutability. Representative assertions:

```js
const input = { sites: { site: { url: 'https://example.com/?q=a#one', emoji: '🗺️' } }, showAllFolder: false };
const chosen = await buildFeaturePayload(input);
const reset = await buildFeaturePayload({ sites: { site: { url: input.sites.site.url } }, showAllFolder: true }, chosen);
assert.equal(reset.sites.site.emoji, null);
assert.equal(reset.showAllFolder, true);
assert.equal(chosen.sites.site.urlHash.length, 64);
assert.notEqual(await hashSiteUrl(input.sites.site.url), await hashSiteUrl('https://example.com/?q=b#one'));
assert.notEqual(await hashSiteUrl(input.sites.site.url), await hashSiteUrl('https://example.com/?q=a#two'));
assert.equal(validateFeaturePayload({ ...chosen, showAllFolder: 'false' }), false);
```

Also assert map deletion never recreates a site, sorted equivalent inputs have identical canonical JSON, invalid emoji/ID/hash and `__proto__` IDs are rejected, and digest rejection has no weak-hash fallback. Existing valid IDs such as `constructor` are handled as own data keys without changing prototypes, not banned retroactively. Compare valid `hashSiteUrl(normalizeWebUrl(raw))` against Node `createHash('sha256')` for Unicode hostname/path, URL escaping and query/fragment.
- [x] **Step 2: Run RED.** `node --test tests/feature-state.test.mjs`; fail for missing exports, not a syntax/import-path accident.
- [x] **Step 3: Implement the interfaces in `feature-state.mjs`.** Import only `normalizeSiteEmoji`; caller supplies canonical sites. Never import `storage-service.mjs`. Reject unsupported feature versions and payload bytes > 32 768; own-key maps only.
- [x] **Step 4: Run GREEN.** Same command: all schema/identity/reset tests pass; existing `tests/storage-service.test.mjs` remains unchanged and passes.
- [x] **Step 5: Commit owned new files.** `git add -- feature-state.mjs tests/feature-state.test.mjs`; inspect staged diff, then `git commit -m "feat: model protected site emoji and All visibility"`.

### Task 2: Bounded generations and deterministic read precedence

**Files:** Create `feature-generation.mjs`, `tests/feature-generation.test.mjs`.

**Interfaces:** Consumes Task 1 functions. Produces:

- `FEATURE_KEYS = { manifest, backupManifest, chunkPrefix }` with exact global names.
- `prepareFeatureGeneration(payload, { generationId, createdAt, previousDescriptor = null }) -> { json, chunks, descriptor, manifest, backupManifest }`. `chunks` is key/string map; descriptor has `featureVersion`, `generationId`, `chunkKeys`, `chunkCount`, `byteLength`, `createdAt`; manifest has `featureVersion`, `active`, `previous`; backup is previous active with `previous: null`, or null.
- `readFeatureGeneration(stored, descriptor) -> { payload, json, descriptor } | null`.
- `readFeatureLayer(stored, { generationId = null } = {}) -> { status, payload, descriptor }`; status is `absent | ready | recovered | invalid | unsupported`. Without ID use active → previous → backup; with ID only read a manifest-referenced descriptor for that ID, not unknown chunks.
- `resolveFeatureState(corePayload, layer, matchedLayer, { hashUrl } = {}) -> Promise<{ payload, featurePayload, featureDescriptor, writable, bootstrap, source }>`; internal `source` is `inline | features | feature-recovered | legacy | feature-error`. Public load source remains the core recovery source. Unknown feature protocol/malformed marker is never silently legacy.
- `estimateSyncUsage(stored, writes) -> { totalBytes, maxItemBytes, itemCount }`: encoded keys/JSON values after a hypothetical step. Storage service checks each preparation/publication peak against global limits.

- [x] **Step 1: Write failing codec/resolution tests.** Include boundary bytes/chunks/escaped per-item size, foreign prefix, wrong length/index/count, unsupported version, canonical complete reset and fallback whole-generation semantics. Representative assertions:

```js
const prepared = prepareFeatureGeneration({ featureVersion: 1, sites: {}, showAllFolder: true }, { generationId: 'feature-a', createdAt: 1 });
assert.equal(prepared.descriptor.featureVersion, 1);
assert.ok(prepared.descriptor.chunkKeys.every(key => key.startsWith('minimalNewTabFeatureChunk:feature-a:')));
assert.ok(Object.values(prepared.chunks).every(value => new TextEncoder().encode(value).length <= 3500));
assert.equal(readFeatureGeneration({}, prepared.descriptor), null);
assert.equal(readFeatureGeneration(prepared.chunks, { ...prepared.descriptor, byteLength: 999 }), null);
```

Resolution tests explicitly assert: marked reset + different/stale head uses inline favicon/All true; corrupted inline + valid matching layer uses that layer; no matching trustworthy intent sets `writable: false`; unmarked + invalid all generations keeps core sites and blocks writes; valid old default/no keys sets `bootstrap: false`; valid unmarked emoji/no keys sets `bootstrap: true`. At 32 769 bytes or 11 chunks construction/read fails; no field-by-field fallback to old emoji.
- [x] **Step 2: Run RED.** `node --test tests/feature-generation.test.mjs`; missing interfaces fail expected assertions.
- [x] **Step 3: Implement the pure codec/resolver.** UTF-8/code-point safe splitting, max 10 chunks, complete supported descriptor validation before joining; never infer recency from timestamps. Resolve feature settings before core materialization, preserving marker authority and source-of-existence rules.
- [x] **Step 4: Run GREEN.** `node --test tests/feature-state.test.mjs tests/feature-generation.test.mjs`; all pass, no browser globals/I/O needed.
- [x] **Step 5: Commit owned new files.** Stage only Task 2's files, inspect and `git commit -m "feat: encode bounded feature generations and read precedence"`.

### Task 3: Storage integration, bootstrap and actual legacy writer regression

**Files:** Modify `storage-service.mjs`, both builders, `tests/chrome-build.test.mjs`, `tests/firefox-build.test.mjs`, `firefox/chrome-baseline.json`; create `tests/mixed-version-feature-protection.test.mjs`, `tests/helpers/feature-storage-fixtures.mjs`, the three published fixture files.

**Interfaces:** Consumes Task 1/2 exports; public storage API unchanged. Test-only helper exports `makeState({ emoji = '🗺️', showAllFolder = false, selectedFolderId = 'work' } = {}) -> State` (root/work/personal folders and both filed/unfiled synthetic sites), `makeArea(initial = {}, hooks = {}) -> { data, calls, get, set, remove }`, and `seedCore(area, payload, { generationId = 'core-fixture' } = {}) -> Promise<Descriptor>`. Hooks `beforeGet/afterGet/beforeSet/afterSet/beforeRemove` receive operation arguments and the area, permitting controlled partial mutation and rejection. `seedCore` writes only a valid unmarked core generation, so it can test pre-protection bootstrap without using the new writer to seed it.

- [x] **Step 1: Add the exact published fixture and failing preservation tests.** Extract from immutable, hash-verified ZIP into a disposable directory; add its exact storage module/API bytes as test-only fixtures plus provenance, not a hand-written substitute. Both ZIP storage modules SHA-256 `134dacfe20a8f86d1fc218f3e1cb5962fb869ac0165bd1afc7dbe1d2962db778`; API `04e51c98a82c0fc7945f94313ce0c4419548fe91872583e1ec29f0738bb3322d`. Verify fixture hashes in tests.

```js
assert.equal((await current.save(makeState())).ok, true);
assert.equal((await legacy.update(defaults, state => { state.links[0].title = 'Legacy rename'; return state; })).ok, true);
const loaded = await freshCurrent.load(defaults);
assert.equal(loaded.state.links[0].title, 'Legacy rename');
assert.equal(loaded.state.links[0].emoji, '🗺️');
assert.equal(loaded.state.showAllFolder, false);
```

Repeat old writes until original core generation is cleaned up; assert independent feature keys/bytes remain. Additional named tests assert explicit favicon/All true survive legacy write, URL-only query/fragment change does not receive the old emoji, deletion stays deleted, legacy-only defaults load causes zero sets, bootstrap changes only feature keys once, normalized no-op causes zero sets, and rename/reorder/selection after initial creation causes zero feature sets. Two services share one lock manager and concurrent bootstrap publishes the freshly reread state without nested lock.
- [x] **Step 2: Run RED.** `node --test tests/mixed-version-feature-protection.test.mjs`; preservation assertions fail on current code while legacy rename succeeds. Keep evidence of this causal failure.
- [x] **Step 3: Integrate load/write/one-time bootstrap.** Keep `loadSnapshot(defaultState)` and `saveSnapshot(state)` as service-owned operations, using an internal read-only snapshot path when already inside the mutation lock. Merge features before `payloadToApplicationState`; store last effective state separately from raw core JSON for no-op. Stage generations/backups, publish core/changed feature heads in one set, readback before success, reuse feature descriptor when unchanged. First real core write creates the feature layer even for defaults. Unsafe feature reads return valid core state with `writable: false`; `update` rejects before invoking transform when load is not writable. Failed bootstrap retains inline/core bytes and uses existing failure path.
- [x] **Step 4: Add both helpers to both runtime allowlists and byte-identity/import-resolution tests.** Update only baseline hashes of changed existing shared files, using the established SHA-256 format; do not regenerate unrelated entries. No Chrome notifier files enter Firefox.
- [x] **Step 5: Run GREEN.** `node --test tests/feature-state.test.mjs tests/feature-generation.test.mjs tests/mixed-version-feature-protection.test.mjs tests/storage-service.test.mjs tests/chrome-build.test.mjs tests/firefox-build.test.mjs`. Adjust legacy tests only when their old optional-field assertion conflicts with the explicit protected-layer contract; do not delete the core-data preservation assertion.
- [x] **Step 6: Commit only integration delta after staged review.** Intended message `fix: preserve new settings across published 1.6 writes`; apply the global dirty-file staging rule, retaining all earlier approved changes.

### Task 4: Failure, quota, restart and cleanup safety

**Files:** Create `tests/feature-storage-failures.test.mjs`; modify `storage-service.mjs`, `feature-generation.mjs` and helper only as failing safety tests require; refresh affected baseline hash.

**Interfaces:** Use `makeArea` hooks from Task 3. `load` keeps valid `state`; an unreadable/unsupported feature intent sets `writable: false`. `update` in that condition returns `ok: false`, `error: 'storage-unavailable'` without sets/transform. Known save rejection uses `write-failed`; cleanup rejection after a confirmed publication does not cancel success.

- [x] **Step 1: Add failing fault-injection tests.** Identify operations by keys/phase, not an assumed fixed nth set. Assert each prepared chunk/backup failure leaves old active core/features readable; final-set partial first-key and all-keys-then-reject never trigger blind rollback or false success. Conservative policy: any set rejection returns `ok: false` even if readback later observes a complete commit; next read/retry may recover it. Representative assertions:

```js
assert.equal(failed.ok, false);
assert.equal(failed.error, 'write-failed');
assert.equal((await reopened.load(defaults)).state.links.length, before.links.length);
assert.equal(sync.calls.some(call => call.method === 'remove' && call.keys.includes(foreignFeatureChunk)), false);
assert.deepEqual(local.data, beforeLocal); // unchanged existing local background
```

The tests also cover: readback get failure; restart after each publication phase; unknown future head; damaged marker; valid core + no trustworthy features cannot save defaults; stale/missing head after reset keeps inline reset; core-first/feature-first snapshots converge to same expected intent; concurrent fresh bootstrap rechecks changed core. Seed unrelated pending chunks and assert cleanup never removes them. Assert cleanup failure after confirmed commit returns `ok: true` and no extra feature writes.
- [x] **Step 2: Add failing quota/no-op tests.** Model JSON-escaped item bytes including keys, total peak and count. At 512 items no new key may be written; adding >8 192-byte item or exceeding 102 400 at staging must fail without deleting active copies. Metadata >32 768 fails before I/O. After initial layer creation, 20 selection/reorder/rename operations keep the same feature generation and do not set feature chunks/head/backups. Hash failure does not publish either head.
- [x] **Step 3: Run RED/characterization.** `node --test tests/feature-storage-failures.test.mjs`; failures identify missing safety behavior, not invalid fixtures. If Task 3 already satisfies a safety contract, record its passing characterization and do not break correct code to manufacture RED; only a missing/failing behavior authorizes the corresponding production change.
- [x] **Step 4: Implement only failed safety contracts.** Check per-step peak before staging; browser rejection remains authoritative. Track owned prepared/retired generations, reread current manifests before cleanup and remove only proven unreferenced owned keys. Never sweep unknown feature chunks, remove the last valid copy to make space, turn unknown schema into absent, or rollback remote data. Clear writable caches on uncertain outcome; preserve existing APIs and subsequent fresh retry.
- [x] **Step 5: Run GREEN and full unit suite.** `node --test tests/*.test.mjs`; no failures or skipped tests. Fix the faulty contract itself if an assertion contradicts the spec rather than making tests pass by disabling protection.
- [x] **Step 6: Commit owned safety delta.** Intended message `fix: retain valid feature snapshots on failed sync writes`; obey dirty-file staging constraint.

### Task 5: Navigation/import and unchanged UI regression

**Files:** Modify `tests/mixed-version-feature-protection.test.mjs`, `tests/folder-visibility.test.mjs`, `scripts/verify-settings-ui.mjs`, `scripts/verify-emoji-picker.mjs`. Modify `newtab.js` / `newtab-core.mjs` only if RED establishes a real integration defect; refresh only affected baseline entries.

**Interfaces:** Existing `normalizeFolderNavigation(state)`, `getVisibleFolderIds(state)`, `parseBackupText(text)`, `buildImportedState(state, data)` and UI import/save/cancel paths; no new UI or backup fields.

- [x] **Step 1: Write failing cross-path assertions.** Tests run new imports followed by actual fixture legacy write. Assert v1/no emoji with same ID+URL is favicon, v2 keeps its explicit emoji, absent sites are removed, and target visibility/shortcuts/background are unchanged. Legacy identical import separately asserts the documented last-protected-value limitation. Navigation assertions:

```js
assert.equal(loaded.state.selectedFolderId, 'root'); // hidden All, existing unfiled site
assert.deepEqual(getVisibleFolderIds(loaded.state), ['work', 'personal', 'root']);
assert.equal(normalizeFolderNavigation({ ...loaded.state, folders: [{ id: 'root', name: 'Favorites' }] }).showAllFolder, true);
assert.equal(afterV1.links.find(link => link.id === repeatedId).emoji, undefined);
assert.equal(afterV1.showAllFolder, beforeImport.showAllFolder);
```

Browser assertions cover edit→favicon save, cancel without sync sets, hide/show All in folder management, save rejection leaving form/draft open, reload persistence and RU/EN existing messages. Startup feature failure shows valid sites rather than defaults; if the existing error UI does not reveal blocked persistence, test a warning through its existing status element.
- [x] **Step 2: Run RED/characterization.** New service regressions must fail before any necessary integration change. Existing already-correct UI flows are characterization tests and may immediately pass; do not invent a defect or alter the UX to obtain RED.
- [x] **Step 3: Make the minimum integration change established by RED.** Preserve explicit imported absence of emoji and current All preference; don't overlay old metadata after the user transform. Keep feature merge before root materialization. Use existing localized save/startup warning if needed, without a new settings control.
- [x] **Step 4: Run GREEN.** Unit suite plus commands below; both engine reports must have every `checks[].ok === true`, errors/consoleErrors empty, no horizontal overflow in RU/EN desktop/narrow layouts. Real Chromium mode uses only disposable profiles.

```bash
node --test tests/*.test.mjs
SETTINGS_QA_OUTPUT="$QA_ROOT/integration-settings" SETTINGS_REAL_CHROME=1 node scripts/verify-settings-ui.mjs
EMOJI_QA_OUTPUT="$QA_ROOT/integration-emoji" EMOJI_REAL_CHROME=1 node scripts/verify-emoji-picker.mjs
```

- [x] **Step 5: Commit only verified integration/test delta.** Intended message `test: verify protected settings through imports and navigation`; product files enter the commit only if they actually changed.

### Task 6: Immutable-package continuity, native storage, artifacts and closeout

**Files:** Modify `scripts/verify-data-continuity.mjs`, README and roadmap; create `docs/mixed-version-feature-protection-verification-2026-10-04.md`. Existing gesture runner remains product-regression coverage, not new gesture work.

**Interfaces:** Preserve runner environment `DATA_QA_RELEASE_ROOT`, `DATA_QA_OUTPUT`, `PLAYWRIGHT_MODULE` and report `checks`, `errors`, `limitations`, `releaseRisks`. Builders remain `buildChromeRelease({ sourceRoot, outputDir, archivePath })` / Firefox equivalent.

- [x] **Step 1: Replace the two expected-loss diagnostics with real preservation assertions.** Each independently extracted, hash-verified published ZIP uses its own actual service, shares modeled sync with the current package, performs repeated writes and cleanup, and must retain emoji/All while preserving legacy edits. Compare both extracted old modules against Task 3 fixture hashes. Do not remove old historical reports or treat merely reading as proof against old writes.
- [x] **Step 2: Run continuity/native storage.** Use the existing runner with a new output folder and `DATA_QA_RELEASE_ROOT=/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs`. In disposable Chromium verify same-ID/path 1.6→new code, protection seeded→legacy write→new reader, explicit reset, reload/full close-reopen, actual storage keys and exact local background. Reported limits still exclude real account delivery and signed CWS/AMO update. Required new checks have `ok: true`, `emojiPreserved: true`, `allVisibilityPreserved: true`; no `legacy-writer-discards-new-fields` risk remains after those checks pass.
- [x] **Step 3: Run the complete regression set.** Commands below, each runner using its own fresh output. Settings/emoji/data use `checks[].ok`; gesture uses `checks[].passed`. No console/page errors, unchanged gesture cache/timing assertions, all tests pass with no skips; do not infer green from the wrong report property or earlier counts.

```bash
node --test tests/*.test.mjs
SETTINGS_QA_OUTPUT="$QA_ROOT/final-settings" SETTINGS_REAL_CHROME=1 node scripts/verify-settings-ui.mjs
EMOJI_QA_OUTPUT="$QA_ROOT/final-emoji" EMOJI_REAL_CHROME=1 node scripts/verify-emoji-picker.mjs
GESTURE_QA_OUTPUT="$QA_ROOT/final-gestures" GESTURE_REAL_CHROME=1 node scripts/verify-folder-gestures.mjs
DATA_QA_OUTPUT="$QA_ROOT/final-data" DATA_QA_RELEASE_ROOT=/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs node scripts/verify-data-continuity.mjs
```

- [x] **Step 4: Verify actual QA artifacts.** Independently build both folders/ZIP outside source with new names ending `test-only.zip`, compare each tested runtime file/ZIP entry byte-for-byte with that build, verify relative imports and complete helper inclusion, run `unzip -t`, Firefox web-ext lint with zero errors/warnings/notices, and `git diff --check`. Recheck unchanged versions/permissions, Firefox notifier exclusion, approved icon/background hashes and immutable published archives. No final Store ZIP is produced by this plan.

```bash
node scripts/build-chrome.mjs --output-dir "$QA_ROOT/independent-chrome" --archive "$QA_ROOT/minimal-new-tab-chrome-test-only.zip"
node scripts/build-firefox.mjs --output-dir "$QA_ROOT/independent-firefox" --archive "$QA_ROOT/minimal-new-tab-firefox-test-only.zip"
unzip -t "$QA_ROOT/minimal-new-tab-chrome-test-only.zip"
unzip -t "$QA_ROOT/minimal-new-tab-firefox-test-only.zip"
node /Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/release-final-settings-20261004-v86n2j/lint-cache/_npx/68a67964bef0893a/node_modules/web-ext/bin/web-ext.js lint --source-dir "$QA_ROOT/independent-firefox" --output json
git diff --check
```

Cached web-ext package currently resolves to 10.5.0; confirm its path/version at execution. If it is unavailable, record that lint gate as unverified and resolve the tooling limitation without modifying production dependencies; never reuse an earlier lint result as proof for the new build. Byte comparison uses all entries, not only file counts.

- [x] **Step 5: Record scoped results and remaining limits.** New verification doc lists RED cause, fresh tests/counts, fixture/archive hashes, read/write safety, actual native versus modeled evidence and artifact paths. Update README/roadmap from diagnosed risk to verified protection only after results justify it; retain identical-old-import/no-data-before-delivery and cloud/conflict limits. Overall store readiness is not automatically true: new version/media/signed delivery decisions are separate.
- [x] **Step 6: Review the whole working candidate against the saved pre-execution baseline and commit owned closeout delta.** Check scope, test evidence, staging and all pre-existing changes retained. Intended message `docs: record verified mixed-version feature protection`; no push. Execution method chosen by the user determines whether independent review is per-task or at the end. Any review findings receive focused regression tests and fresh verification before completion.

## Execution handoff — сохранённая история выбора

На момент написания план ожидал отдельного выбора; затем пользователь подтвердил продолжение и делегировал метод. Выбран Native, выполненные задачи отмечены выше; повторное подтверждение не требуется. Варианты ниже сохранены как история, не новый approval gate.

- **Native (recommendation):** Implement sequentially in this same session, then an independent final review. The six tasks share a tightly coupled storage contract; one implementer avoids competing edits to `storage-service.mjs`, while the real legacy tests and fault gates provide continuous checks.
- **Subagent-driven:** A fresh implementer and reviewer per task, then whole-candidate review. More independent intermediate review, higher context/token cost; tasks remain sequential because they consume each other's interfaces.

При первоначальном handoff реализация не начиналась до выбора. Если дальнейшие runtime findings требуют изменения согласованного протокола, остановиться на конкретном противоречии и предложить ограниченную правку spec; не удалять инвариант молча.
