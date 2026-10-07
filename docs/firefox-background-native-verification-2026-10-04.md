# Нативная проверка сохранения фона в Firefox

Дата: 4 октября 2026 года. Проверяется следующий отдельный этап после
[background safety](background-transaction-verification-2026-10-04.md), без новой
runtime-правки, смены версии, личных установок, push или публикации.

## Результат

14 явных UI checkpoints прошли в установленном Firefox 156.0.1 с реальными
`browser.storage` API. После отказа сохранения прежняя картинка восстановилась
после ручного reload; после освобождения места обычным импортом новая картинка
успешно сохранилась и пережила второй ручной reload. Сравнивались точные SHA-256
восстановленных байтов, а не только похожий preview.

Emoji 🗺️/👍🏽, назначения сайтов папкам, скрытая All, выключенные горячие клавиши
и выключенные сетевые иконки сохранились. Повторная unit/contract suite — 388/388,
без failures/skips. Девять свежих artifact checks подтвердили все 114 файлов
проверенной сборки и неизменность двух опубликованных ZIP и approved graphics.

Это bounded native page-reload acceptance, не «100% готовности релиза».

## Окружение и метод

- Отдельный временный профиль под собственной QA-папкой, `-no-remote`.
- Временное дополнение с существующим ID и manifest version `1.6`.
- Только WebDriver element operations и screenshots. Без page script execution,
  privileged-system-access, подмены API, правок storage DB, настроек подписи или
  автоматического обхода ограничений Firefox.
- Пользователь открыл новую вкладку через ⌘T и дважды подтвердил ⌘R. Переустановка
  дополнения не использовалась как замена перезагрузке страницы.
- Только синтетические сайты на `example.invalid`; личные данные не импортировались.
- A — существующая bundled PNG, загруженная как custom image; B — отличающаяся
  approved PNG-иконка, использованная только как легко различимая тестовая картинка.

## Проверенные сценарии

1. Импорт четырёх сайтов через обычный JSON v2 UI, emoji и скрытие All.
2. Сохранение custom image A, замена A → B и обратно B → A с сохранением preferences.
3. Обычный импорт 80 длинных синтетических записей, по 40 в каждой папке.
4. Попытка заменить A на B получает штатный отказ production sync quota preflight:
   Settings остаются открыты, ошибка видна, Save доступна, draft не выдаётся за
   сохранённую картинку. Низкоуровневый отказ storage здесь не внедрялся.
5. Cancel и повторное открытие восстанавливают A. После ручного ⌘R проверены её
   точные байты, обе папки/80 сайтов, emoji и preferences.
6. Обычный импорт меньшего JSON освобождает quota room, не затрагивая локальный A.
   Повторная замена успешно сохраняет B. Второй ручной ⌘R подтверждает B,
   четыре сайта, emoji, скрытую All и preferences.

Подбор нагрузки предварительно проверен отдельной in-memory fixture planner:
64 323 байта sync, максимум 3 704 байта на item, 24 items после большого импорта.
Это диагностические расчёты модели, **не измерение Firefox account sync usage**.
Нативные утверждения выше основаны на фактическом UI и restored image bytes.

## Доказательства и идентичность

[QA-папка](/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/firefox-background-native-20261004-gFtn95):

- `native-report.json`: 14 checkpoints, ограничения и ручные шаги.
- `native-artifact-report.json`: 9 свежих gates, включая независимую пересборку.
- `native-followup-unit.log`: 388 passed, 0 failed/skipped.
- `native-before-reload.log`, `native-before-reload-resumed.log`,
  `native-after-failed-reload.log`, `native-after-success-reload.log`: исполнение.
- `native-background-quota-failure.png`, `native-failed-save-after-manual-reload.png`,
  `native-successful-retry-after-manual-reload.png`: native screenshots.
- `source-head.txt`, `source-baseline-working.patch`: pre-QA snapshot. Gate подтвердил
  неизменность tracked исходников до добавления этого verification record.

Точный установленный test-only ZIP SHA-256:
`53e57a0f20761fae3b9244f72a850ec6efba459cd63bd276e0f8420ced527c5c`.

Shared storage runtime SHA-256:
`61e793a8760349929a2e4ac95de8970ea823e154edb4ea1d6dd1c3fa86b6e6bc`.

Этот ZIP — сохранённый проверочный пакет предыдущего safety-этапа,
**не новый релиз для загрузки в Store как версия 1.6**.

## Наблюдение и границы

Первоначальное исполнение остановилось: временное сообщение `#appStatus`
перекрыло кнопку папки и native hit-testing вернул `element click intercepted`.
Первый лог сохранён; проверка продолжена после исчезновения сообщения, без
обхода hit-testing. Это не import-success toast: у `appStatus` общий путь
storage warnings. Точная причина появления конкретного сообщения здесь
не устанавливалась. Его способность перекрывать клики — отдельное UI-наблюдение
для дальнейшей правки, не объявленное исправленным данным QA.

Не проверялись подписанный AMO update, реальная account/cross-device delivery,
конкурентные независимые/legacy writers и full-browser-restart persistence.
Временное дополнение удаляется при закрытии Firefox, поэтому reload не выдаётся
за проверку переустановки или полного перезапуска. Низкоуровневые ошибки local/
sync и interruption cases остаются доказательствами предыдущих regression tests,
а не всех нативных сценариев этого запуска. Все прежние safety-границы действуют.

## Последующая точечная UI-правка

После этого native запуска отдельно исправлен перехват кликов у неинтерактивного
`appStatus`, без изменения внешнего вида или storage-кода.
[Проверка и ограничения](app-status-pointer-verification-2026-10-04.md).
Причина появления исходного native warning по-прежнему не установлена; этот
позднейший fix не меняет результаты и границы описанного выше запуска.
