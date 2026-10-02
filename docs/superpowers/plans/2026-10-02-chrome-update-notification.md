# Chrome Update Notification Implementation Plan

**Status (2026-10-02):** implemented and independently reviewed; two Important findings fixed, 247 unit/contract tests and 136 browser checks pass. Execution evidence and final boundaries: [verification report](../../chrome-update-notification-verification-2026-10-02.md). The checklists below preserve the approved implementation plan; completion commands are recorded in the execution ledger.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Предложить применить подтверждённое Chrome обновление, не теряя незавершённую работу ни в одной странице Minimal Tab.

**Architecture:** Chrome-only bootstrap подключает небольшой сервис и баннер. Сервис получает готовность от `runtime.onUpdateAvailable`, хранит предложение в session и отсрочку в отдельном local-ключе, согласовывает применение через `extension.getViews()`. Общий `newtab.js` предоставляет только нейтральную готовность/блокировку приложения; Firefox не подключает этот механизм.

**Tech Stack:** Vanilla ES modules, Manifest V3, Chrome runtime/extension/storage, node:test, существующий Playwright runtime; без новых зависимостей.

**Spec:** [Подтверждённая спецификация](../specs/2026-10-02-chrome-update-notification-design.md). Прочитать вместе с планом; документация API и ограничения CWS перечислены там.

## Global Constraints

- Сейчас только Chrome. Firefox runtime/manifest/bootstrap, личные браузеры и магазинные ZIP не обновлять; тестирование — в изолированных профилях.
- Разрешения остаются `storage`, `favicon`; версия остаётся `1.6`; без service worker, keep-alive, polling, `requestUpdateCheck`, backend, аналитики и сетевых запросов для этой функции.
- «Обновление готово» / “Update ready”; «Обновить» / “Update”; «Позже» / “Later”. Отсрочка ровно 24 часа, предупреждение неизвестного исхода reload через 3 секунды.
- Только событие Chrome или его валидная session-запись подтверждает обновление. Local-отсрочка никогда не создаёт предложение.
- Не менять storage-service, persisted application schema, swipe recognizer, семантику сохранения или фон. Никаких sync-записей уведомления.
- Не применять при открытой форме, операции, отложенном сохранении, неизвестном контексте. Не закрывать/сохранять формы за пользователя. После отказа нужно новое нажатие.
- Native-проверка getViews и координации обязательна. Если Chrome-only foreground-подход не удовлетворяет безопасности, остановиться и согласовать изменение архитектуры.
- Исходная рабочая копия уже содержит незакоммиченные emoji, свайпы и UI. Перед выполнением сохранить перечень/снимок этих изменений; не откатывать, не включать их незаметно в коммиты. Никаких push, версии и публикации.

## Review Focus

1. Медленное восстановление session после нового update event не должно возвращать более старое предложение — тест Task 1.
2. Новая, закрывающаяся, неинициализированная или недоступная страница между проверками не должна давать разрешение на reload — Task 2, real-context gate и fake-view regression.
3. Promise сохранения папки может завершиться после ошибки с оставшимся pending — Task 2 должен отказать, несмотря на fulfilled Promise.
4. Два окна, две кнопки Update и два Later не должны давать двойной reload, потерянную отсрочку или зависшую блокировку — Tasks 1/2/4.
5. Исчезновение баннера под dialog, Tab-фокус, узкое окно и нижний ряд карточек не должны ухудшить обычную работу — Tasks 3/4.

---

## Рабочая копия, команды и файлы

Использовать существующую `/Users/nurfinn/.codex/worktrees/minimal-tab-ui-20260930`, ветка `codex/ui-polish-settings-toolbar-20260930`, а не устаревший cwd. При начале выполнения проверить её через using-git-worktrees; не создавать чистую копию от HEAD, теряя незакоммиченные зависимости. До первого изменения сохранить diff, список и копии untracked-файлов в новом QA-каталоге. Это резервная копия, не автоматическое одобрение всех накопленных изменений.

Команды ниже выполняются из этой рабочей копии. Настроить только среду текущей shell-команды:

```sh
export PATH="/Users/nurfinn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
export PLAYWRIGHT_MODULE="/Users/nurfinn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"
```

| Файл | Ответственность |
| --- | --- |
| Новый `chrome-update-service.mjs` | Версии, event/session/local, отсрочка, протокол страниц и безопасное применение; никакого DOM приложения |
| Новый `chrome-bootstrap.mjs` | Ранняя регистрация сервиса, подключение application gate, баннер и локализация |
| Новый `chrome-update.css` | Изолированные стили баннера и компенсация места внизу скролла |
| `newtab.js` | Нейтральный экспорт `updateSafety`, учёт инициализации/операций, блокировка новых действий |
| `scripts/build-chrome.mjs` | Chrome-only файлы, stylesheet и entry point только в выходной копии HTML |
| `_locales/{en,ru}/messages.json`, `i18n-service.mjs` | Тексты уведомления и fallback |
| `firefox/chrome-baseline.json` | Только проверяемые новые хеши изменённых общих файлов, не hash магазинного ZIP |
| Новые `tests/chrome-update-service.test.mjs`, `tests/chrome-update-contract.test.mjs` | Логика и ограничения упаковки/интеграции |
| Новый `scripts/verify-chrome-updates.mjs` | Изолированная проверка реальных extension contexts и UI; отчёт, скриншоты, ограничения |
| `tests/chrome-build.test.mjs`, `tests/firefox-build.test.mjs` | Корректный Chrome entry point и отсутствие Chrome-update кода в Firefox |
| Новый `docs/chrome-update-verification-2026-10-02.md` | Фактические результаты, ограничения и безопасный handoff |

## Task 1: Сервис готовности и отсрочки; ранняя проверка Chrome API

**Files:** создать service, service tests и capability-режим browser runner из таблицы. Пока не подключать продуктовый баннер и не менять личные установки.

**Interfaces:**
- `parseUpdateVersion(value: unknown): number[4] | null`: 1–4 десятичных компонента manifest version, каждый 0…65535, без неоднозначных ведущих нулей; недостающие компоненты — 0, полностью нулевая версия невалидна.
- `compareUpdateVersions(a: string, b: string): -1 | 0 | 1 | null`, invalid → null.
- `createChromeUpdateService({ api, getViews, now, schedule, cancel, onChange }): service`. `getViews` — sync функция, возвращающая страницы только этого расширения; остальные зависимости инъецируются. `schedule(callback, ms)` / `cancel(handle)` совместимы с timeout API.
- `service.start(): Promise<void>` регистрирует listener синхронно до первого await; `snapshot(): {status, targetVersion, reason}`; `refresh(): Promise<void>` только перечитывает служебное состояние/время, не проверяет магазин; `snooze(): Promise<void>`; `apply(): ApplyResult` реализуется в Task 2; `dispose(): void`.
- `status`: `hidden | available | blocked | applying | recovery`. `reason`: null или фиксированный код, без содержимого форм и URL.
- Ключи: session `minimalTab.update.pending.v1` → `{baseVersion,targetVersion}`; local `minimalTab.update.snooze.v1` → `{baseVersion,targetVersion,snoozedUntil}`. Продолжительность `86_400_000`; слияние предложений сохраняет максимальную валидную целевую версию для текущего baseVersion.

- [ ] **1. RED:** добавить именованные тесты `versions are numeric`, `late session read cannot replace a newer event`, `duplicate event preserves snooze`, `local data cannot fabricate readiness`, `new target ignores old snooze`, `failed local write still hides living peers`, `missing APIs stay inert`. Пример точного ожидания: `compareUpdateVersions('1.10','1.9') === 1`; после Later при now=1_000 поле until равно `86_401_000`, на границе until баннер доступен только после refresh. Повреждённые ключи, session error, local error, более дальний future timestamp не вызывают reload или sync.set.
- [ ] **2. Проверить RED:** `node --test tests/chrome-update-service.test.mjs`; новые проверки должны упасть на отсутствующей реализации, а не из-за синтаксиса/зависимостей.
- [ ] **3. Реализовать сервис без DOM.** При unavailable API — hidden/no-op. Обрабатывать callback lastError и Promise rejection согласно используемому API-адаптеру, не оставляя unhandled rejection. Регистрировать/снимать listeners симметрично. Служебные записи дедуплицировать; изменение local отсрочки оповещает живые страницы. При её ошибке передавать отсрочку через peer-интерфейс Task 2, без sync. Поздние async ответы не понижают актуальную версию. Проверять, что baseVersion равен текущему manifest. Не хранить пользовательские данные.
- [ ] **4. GREEN:** повторить команду Task 1. Все новые проверки проходят; счётчики фиктивного API показывают 0 requestUpdateCheck, 0 сетевых запросов и 0 sync-записей.
- [ ] **5. Реальный capability gate:** создать `node scripts/verify-chrome-updates.mjs --mode=capabilities`. Временная копия расширения, отдельный профиль, 2 окна/3 страницы, включая `chrome://newtab/`: проверить реальные getViews, синхронный доступ к узким peer-функциям, регистрацию native event listener, обнаружение loading/неизвестной страницы. Тестовые hooks существуют только в QA-копии. Честно отметить: вызов захваченного listener тестом — синтетический сигнал, не native доставка обновления. Отсутствие нужных API/доступа — не PASS; блокирует дальнейшее применение.
- [ ] **6. Checkpoint:** сохранить команды, RED/GREEN, capability report и diff Task 1 в ledger. Коммитить только самодостаточные новые файлы, если это не захватывает чужие изменения; иначе оставить checkpoint без общего `git add`.

## Task 2: Защита всех страниц и одно безопасное применение

**Files:** изменить `newtab.js`, service; расширить service tests и browser runner; создать contract tests. При изменении общего файла обновить только соответствующий baseline hash после проверки diff.

**Interfaces:**
- `newtab.js` экспортирует `updateSafety = { getBlockReason(): string | null, setInputLocked(locked: boolean): void }`. Getter проверяет реальные application-флаги, а не CSS/один disabled button; собственный input lock не считается незавершённым сохранением.
- `registerUpdatePage({ window, safety, service }): dispose` в service устанавливает на extension Window только `__minimalTabUpdatePageV1`: `{protocol:1, inspect(), acquire(token), commit(token), release(token,options), defer(pair,until)}`. `inspect()` возвращает `{protocol:1, reason, token, phase}`; никакого application state. `acquire` синхронный, идемпотентный для своего token, чужой token/неготовность → false. Фазы `idle | preparing | committed`. `commit(token): boolean` переводит только свой preparing-token в committed. `release(token,{notDispatched=false}={})` снимает только свой preparing-token; committed снимается лишь с явным notDispatched при отказе до команды/синхронном исключении вызова, но не по таймауту.
- `service.apply(): {ok:boolean, reason:null|'unavailable'|'busy'|'unknown-context'|'contexts-changed'|'reload-error'}` — синхронная финальная процедура. `ok:true` означает только отправленную команду, не успешную установку.

- [ ] **1. RED:** `apply refuses every busy reason`; `fulfilled failed selection save still blocks`; `unknown page fails closed`; `changed view set releases all preparing locks`; `two callers cause one reload`; `reload throws unlocks before dispatch`; `no-op reload becomes recovery after 3000ms without allowing new edits`. При отказе reloadCount=0 и acquiredPreparingLocks=0; при успешной команде reloadCount=1. Добавить закрывающуюся страницу/throw из inspect и попытку нового input во время подготовки.
- [ ] **2. Проверить RED:** `node --test tests/chrome-update-service.test.mjs tests/chrome-update-contract.test.mjs`.
- [ ] **3. Добавить application safety без рефакторинга storage.** Инициализация остаётся busy до load/bind/render; охватить commitStateChange, отложенную папку, rename, drag, чтение import/background файла и их завершение в finally. Открытый dialog блокирует даже без изменённых полей; Promise файла, завершившийся после закрытия dialog, отслеживается до settle. setInputLocked не меняет state и не закрывает формы: блокирует только приложение, оставляя браузерные команды доступными. Все входы новых изменений/навигации уважают lock, уже начатые операции заканчиваются по прежним правилам.
- [ ] **4. Реализовать протокол и apply.** Вначале валидное предложение; затем getViews, lock-token, проверка каждого peer; повторное сравнение полного набора Window-объектов и причин. Не фильтровать молча неизвестные extension pages. До команды при отказе освобождать все locks данного token с notDispatched, включая появившихся участников. Новая страница до допуска пользовательских действий наследует обнаруженную подготовку; исчезнувший владелец до команды отменяет подготовку, не оставляя lock навсегда. Только после согласованного набора — commit всех участников и один runtime.reload без await между финальным осмотром и вызовом. Отказ commit любой страницы отменяет всё до вызова. Через 3000ms после команды при оставшемся документе — recovery с инструкцией закрыть все страницы Minimal Tab и открыть новую, без ложного success и без небезопасного автоматического unlock. Пока жив committed-участник, новая страница также не начинает изменения; исчезновение всех старых страниц позволяет чистый старт, не повтор команды.
- [ ] **5. GREEN и actual-app gate:** повторить unit-команду; `node scripts/verify-chrome-updates.mjs --mode=safety`. Через QA-only bootstrap импортировать настоящий `newtab.js` и его updateSafety в реальных extension pages. Проверить поля/фон/import/rename/drag в соседней вкладке, pending selection после ошибки, открытие/закрытие новой страницы, 2 окна и вызов настоящего reload в отдельном safe-case. После reload открыть страницу и сверить fixture sites/folders/emoji/background/selection; не считать reload заменой доказательства магазинной установки. При неполной видимости контекстов прекратить этот путь, не ослаблять guard.
- [ ] **6. Checkpoint:** сохранить safety report, screenshots, diff и список изменённых общих hunks. Не коммитить целиком `newtab.js`/baseline вместе с ранее незафиксированными swipe/UI изменениями; отдельные коммиты только когда границы реально отделимы.

## Task 3: Баннер и подключение исключительно к Chrome

**Files:** создать bootstrap/CSS; изменить Chrome builder, RU/EN locales, i18n fallback, build tests и baseline общих файлов. Общий HTML, Firefox entry point и Firefox runtime остаются прежними.

**Interfaces:** bootstrap вызывает `service.start()` до ожидания application readiness, импортирует `newtab.js` и регистрирует updateSafety; обновляет UI через onChange/snapshot. Dynamic import приложения допускается для ранней регистрации listener; до доступного safety-interface страница всегда unknown/busy. Видимость проверяется на init, focus/visibilitychange и открытие/закрытие dialog. Dispose очищает собственные observers/listeners.

- [ ] **1. RED:** `Chrome output has chrome-bootstrap and update stylesheet exactly once`; `Firefox output has no Chrome update entry or modules`; `preview without APIs stays silent`; `RU and EN update keys resolve`. Проверить, что release package не содержит simulated event endpoint, URL-flag или debug hook; permissions и version не меняются.
- [ ] **2. Проверить RED:** `node --test tests/chrome-build.test.mjs tests/firefox-build.test.mjs tests/chrome-update-contract.test.mjs tests/i18n-service.test.mjs`.
- [ ] **3. Подключить через Chrome builder.** Добавить 3 Chrome файла в allowlist; в выходном HTML заменить ровно один `<script type="module" src="newtab.js"></script>` на Chrome bootstrap и добавить CSS. Не менять эти строки общего HTML. Bootstrap создаёт `#updateNotice` и реальные button, status-текст отдельно от действий. Добавить ключи `updateReady`, `updateNow`, `updateLater`, `updateBusy`, `updateCheckFailed`, `updateApplying`, `updateRecovery` в существующие локали/fallback; первые пять текстов дословно по spec. Applying: «Применяем обновление…» / “Applying update…”; recovery: «Переоткройте вкладки Minimal Tab, чтобы продолжить» / “Reopen your Minimal Tab tabs to continue.”
- [ ] **4. Стили и поведение:** fixed lower-left, существующие цвета/типографика/focus tokens, без модального слоя/звука/автофокуса. Под dialog скрыть и исключить из tab order. ResizeObserver измеряет только свой баннер, CSS-переменная добавляет место в конец content scroller при показе, затем восстанавливается; верхняя навигация не меняется. Later вызывает snooze, Update вызывает apply; нет автоматического повтора после busy. После Later вернуть фокус на существующий settingsButton, только если фокус был внутри удаляемого баннера; при обычном появлении фокус не трогать.
- [ ] **5. GREEN:** повторить unit-команду; `node scripts/verify-chrome-updates.mjs --mode=ui`. Проверить RU/EN, 1280×800 и 480×720, keyboard/focus, dialog hide/show, две вкладки и Later, новую целевую версию, отсутствие перекрытия последней карточки и одинаковую высоту header до/после. Тестовый сигнал вводится извне только инструментом QA, не через production API.
- [ ] **6. Checkpoint:** сохранить screenshots/report и конкретные изменённые baseline hashes. Общие изменённые файлы не включать в коммит накопленных изменений без отдельного согласования.

## Task 4: Общая проверка, независимое ревью и передача

**Files:** завершить `scripts/verify-chrome-updates.mjs`; создать verification doc; при необходимости адаптировать только тестовые doubles существующих runners к capability detection, не включать runtime API в обычном preview.

**Interfaces:** runner принимает `--mode=capabilities|safety|ui|all` (default all), `UPDATE_QA_OUTPUT` либо создаёт уникальный temp; пишет `report.json` с `checks:[{name,ok,error?}]`, `consoleErrors`, `limitations`, `sourceHashes`. Любой провал/непройденный обязательный real-context gate → exit 1, отсутствие Playwright → явная ошибка, не skip-pass. Все профили/артефакты отдельные от личных установок.

- [ ] **1. Дополнить failing regressions:** concurrent Later/event restore, malformed session/local, session API missing, slow/failed save, page created during initialization, privacy/incognito context недоступен → fail closed, double Update across windows, recovery и ручное переоткрытие. Зафиксировать тест, где прежняя реализация каждого обнаруженного дефекта воспроизводимо ошибается, до исправления.
- [ ] **2. Выполнить окончательные команды на одном наборе файлов:** `node --test tests/*.test.mjs`; `node scripts/verify-chrome-updates.mjs --mode=all`; `SETTINGS_REAL_CHROME=1 node scripts/verify-settings-ui.mjs`; `GESTURE_REAL_CHROME=1 node scripts/verify-folder-gestures.mjs`; `git diff --check`. Ожидание: exit 0, ни одного failed check/unhandled error. Для всех browser-команд передать настроенный PLAYWRIGHT_MODULE; записать каталоги результатов. Старые количества тестов не подставлять вместо свежих результатов.
- [ ] **3. Изучить скриншоты и выполнить финальное независимое ревью по spec/плану/фактическому diff.** Отделить находки новой функции от прежней dirty-ветки. Любое исправление получает воспроизведение и повтор затронутых/full проверок. Если выбран native-метод, независимый reviewer подключается только здесь; при subagent-driven — ещё и на границах задач по соответствующему навыку.
- [ ] **4. Записать verification doc:** реальные counts/commands, hashes, ограничение синтетического update signal и отсутствия подписанного CWS upgrade. Проверить hash неизменных store ZIP и отсутствие записи в личный профиль. Не заявлять, что причина старых CWS клиентов устранена.
- [ ] **5. Передать результат без установки/push/новой версии.** Предложить просмотр QA и согласовать перенос в личный Chrome отдельно. Firefox как продуктовый перенос остаётся следующим этапом. Открытые вопросы магазина не маскировать статусом «полностью проверено».

## Способ выполнения и следующий gate

Пользователь подтвердил **native**: последовательная реализация, затем отдельное независимое ревью. Реализация и исправления ревью находятся в существующей рабочей копии; установка, версия и публикация не входят в этот шаг. Итоги и ограничения: [verification report](../../chrome-update-notification-verification-2026-10-02.md).
