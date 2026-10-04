# Personal Chrome: установка проверенного safety-кандидата

Дата: 4 октября 2026 года. Разрешение пользователя: «ок» после предложения
обновить тестовый Chrome с резервной копией и сохранением сайтов/настроек.
Только существующая распакованная Chrome-установка; без Firefox install,
смены версии, commit/push или публикации.

## Что установлено

- Прежний путь: `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/minimal-new-tab-chrome-v1.6`.
- Прежний ID: `jeanjglicakhpfedmenbnmljlfklcken`; read-only регистрация подтверждена
  в last-used Chrome Default profile, location 4.
- До установки все 43 файла совпали с последней проверенной личной icon-сборкой.
- Новые 45 файлов побайтово совпали с независимой сборкой последнего pointer-QA.
  Проверены прежний manifest 1.6/permissions, обои и четыре approved PNG-иконки.
- Добавлены `feature-generation.mjs`, `feature-state.mjs`. Заменены семь файлов:
  EN/RU messages, `i18n-service.mjs`, `newtab.html`, `newtab.js`,
  `storage-service.mjs`, `styles.css`. Это согласованные защитные исправления,
  export-подсказка и pass-through уведомления; новых функций в этом шаге нет.

Полная копия прежнего runtime и вся проверка:

[chrome-safety-install-20261004-rdtgoN](/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/chrome-safety-install-20261004-rdtgoN)

`chrome-before/` — сверенная резервная копия файлов сборки, **не экспорт личного
browser storage**. `chrome-staged/` — точный проверенный кандидат;
`install-plan.json` содержит оба inventory и список изменения.
`chrome-test-only.zip` — только QA-пакет, не обновление Store ZIP версии 1.6.

Installer копировал только generated runtime artifacts, dependencies до entry
files, с атомарной заменой отдельных файлов. Preferences, Secure Preferences,
личные local/sync databases, настройки защиты и registration не записывались.
Сайты/настройки не сбрасывались; путь/ID сохранены, uninstall/reinstall не было.

## Свежая проверка до установки

По `verification-before-completion` личное копирование разрешено installer gate
только после успешной проверки точного staged inventory:

- Полный `node --test`: 388 passed, 0 failed/skipped/cancelled.
- Семь checkpoints в disposable Chromium с настоящими local/sync API, только
  42 синтетических `example.invalid` сайта; сеть заблокирована.
- Same-path upgrade сохранил сайты, папки/порядок, выбор, 🚀/👍🏽, скрытую All,
  точные local-байты картинки, подложку и выключенные shortcuts.
- Offline picker меняет emoji на 🗺️; reload сохраняет все данные и доступ к root.
- Контролируемый sync-head refusal при замене картинки сохраняет прежний фон
  после reload; успешный retry подтверждает новую картинку без потери сайтов.
- Настоящий native Chromium warning допускает обычный клик в реальном пересечении
  с кнопкой папки, оставаясь видимым; успешное сохранение убирает сообщение.
- Полный process close/reopen сохраняет финальные данные и тот же ID.

Первый smoke остановился на ошибочном ожидании полной неизменности raw sync.
`systematic-debugging` установил предусмотренный bootstrap при чтении старых
inline emoji/скрытой All: создаются только feature manifest и его chunk, прежние
core/local не переписываются. QA теперь проверяет точный валидный payload,
URL hashes/emoji/visibility, неизменность каждого старого ключа и отсутствие
повторной публикации на последующих чтениях. Production-код не менялся.
`smoke-attempt-1.*` сохранены; финальный `smoke-attempt-2.*` — 7/7, errors [].
Это не обещание, что новое приложение вообще не пишет storage: автоматическое
создание согласованного защитного слоя при первом открытии ожидаемо.

## Личный Chrome и финальная сверка

Открыта только новая owned-вкладка: window `1716923862`, tab `1716924658`.
AppleScript подтвердил title **Minimal Tab**, URL **chrome://newtab/**,
loading **false**. Existing tabs не перезагружались, не закрывались и не
направлялись на другие страницы; JavaScript from Apple Events не использовался.

`installed-verification.json` и повторный `final-verification.json` подтверждают
все 45 установленных файлов, прежний registration, целую 43-файловую копию,
неизменность Firefox runtime и обеих опубликованных ZIP:

- Chrome 1.6: `370b139877761ebe180d7d923ab4381f087a8ef094aebbc4e8b42ea5ee537794`.
- Firefox 1.6: `34bd6748a306765bfd40097f915cfc537dfc60b05bb14e2ae9e3bbdf29af1671`.

Полный live personal storage/DOM, физические жесты, account sync и подписанная
доставка магазинов этим шагом не сертифицируются. Необязательный native screenshot
не снят: QA-only JXA window lookup остановился на CFArray bridge; альтернативный
cast не поддерживается. Это не ошибка страницы, и никакие OS/browser permissions
ради снимка не менялись. File verification и открытие страницы проверены отдельно.

Для ручной приёмки использовать новую вкладку: старые могут продолжать выполнять
ранее загруженный код. Их можно закрыть позже, сохранив незавершённые изменения.
