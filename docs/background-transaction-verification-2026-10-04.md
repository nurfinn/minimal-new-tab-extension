# Безопасная замена пользовательского фона

Дата: 4 октября 2026 года. Ветка: `codex/ui-polish-settings-toolbar-20260930`.
Статус: bounded-исправление и повторное независимое ревью завершены. Точные
исправленные байты прошли 388 unit/contract, 251 браузерную и 17 artifact checks.
Это завершение данного safety-этапа, не утверждение общей готовности релиза.

## Согласованный результат

Пользователь подтвердил отдельный небольшой safety-этап после защиты emoji/All:
сохранить новую картинку отдельно, опубликовать и проверить настройки, только
затем завершить замену. Интерфейс, blur, выбранные обои, иконки, разрешения,
core/storage v1, версия 1.6 и внешний API службы не меняются.

Прежний `prepareBackground` перезаписывал единственную local-картинку до проверки
состояния и sync commit. Отказ commit оставлял старый core с ID уже утраченного
изображения; после reload появлялся default. Исходная проблема воспроизведена до
правки, а не выведена только из просмотра кода.

Теперь в `storage-service.mjs`:

1. Подготовка изображения не пишет storage. Валидация и общий sync quota preflight
   выполняются до local staging.
2. Новая картинка сохраняется в отдельный pending slot и проверяется чтением точных
   ID/байтов. Основная копия ещё не заменяется.
3. Публикуются и проверяются существующие core/feature поколения.
4. Только после подтверждения новая картинка переносится в совместимый primary
   cache; pending удаляется лишь после проверки основной копии.

При отказе/неопределённом результате до подтверждения копии не откатываются и не
очищаются. Если новый head фактически применился, но вызов отклонён, операция
возвращает ошибку, а следующий новый reader может прочитать новую картинку из
pending; прежние байты при этом не потеряны. Это не обещание rollback к старому UI
при любом частично применённом commit.

Новый reader выбирает только изображение, ID которого совпадает с валидным core.
Pending чужого ID не подставляется. Если прервалось подтверждённое продвижение,
same-intent no-op может завершить его без новых sync writes. Перед следующей
заменой единственная committed pending-копия сначала сохраняется в primary и
проверяется. Неподдерживаемые будущие local-форматы не перезаписываются/не удаляются.
Изображения остаются только в local, вне sync и JSON backups; известных копий не
более двух.

## RED → GREEN и независимое ревью

- Первые 11 regression cases падали на исходном коде: chunk/backup/head rejection,
  partially applied local/sync writes, readback failure, invalid input, quota
  rejection и interruption snapshots. После исправления они проходят.
- Четыре дополнительных RED cases выявили необходимость сохранять неизвестные
  будущие primary/pending-форматы. После ограниченных guards — 23/23 GREEN.
- Reviewer нашёл один Important/P1 случай: B находится только в pending после
  отказа продвижения; первое local-чтение следующего save C временно падает;
  materialization возвращает null; pending ошибочно заменяется C, хотя core всё ещё
  ссылается на B. Два root regression cases воспроизвели утрату B до исправления.
- Сохранение предыдущей копии теперь опирается на ID из валидного прочитанного core
  и свежие local-записи, а не на результат materialization. После исправления —
  25/25 transaction cases и 388/388 полная unit/contract suite без skips.
- Повторное независимое ревью точного hash ниже: Critical/Important/Minor не
  осталось в этом bounded delta. Reviewer отдельно проверил same/fresh instances,
  save/update, отказ sync/preservation, partial preservation и отказ его readback,
  а также recovered core после повреждения нового head. Это независимые in-memory
  наблюдения, не новые доказательства native Firefox или account delivery.

Runtime SHA-256:
`61e793a8760349929a2e4ac95de8970ea823e154edb4ea1d6dd1c3fa86b6e6bc`.

## Проверки и доказательства

Все имена доказательств ниже относятся к отдельной QA-папке:

[background-safety-20261004-DVdJQF](/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/background-safety-20261004-DVdJQF)

| Проверка | Финальное подтверждение | Доказательство |
| --- | --- | --- |
| Полная unit/contract suite | 388/388, без skips | `final-closeout-unit.log` |
| Точный Important RED → GREEN | 23 PASS + 2 FAIL → 25 PASS | `transaction-review-red.log`, `transaction-review-green.log` |
| Settings, RU/EN, All, два движка + native Chromium | 95/95, consoleErrors [] | `final-settings/report.json` |
| Emoji, выбор favicon/reset, Cancel, restart | 61/61 | `final-emoji/report.json` |
| Свайпы и сохранение | 76/76 | `final-gestures/report.json` |
| Immutable-package continuity + native Chromium | 19/19, errors [], releaseRisks [] | `final-data/report.json` |
| Runtime/ZIP, импорты и protected hashes | 17/17 | `artifact-report-final.json` |
| Firefox web-ext 10.5.0 | 0 errors, 0 warnings, 0 notices | `final-firefox-lint.json` |

Три новых UI checks выбирают другую настоящую PNG-картинку, отклоняют sync head,
проверяют ошибку/сохранённые байты, reload со старым preview и успешный повтор.
Chromium extension check использует настоящее local/sync API в одноразовом профиле;
внедряется только отказ head через временный wrapper в этой QA-странице. Wrapper
снимается в finally. Нативная серия также полностью закрывает/открывает Chromium.
Firefox здесь — движок Playwright с storage doubles, не подписанная установка.

Все runtime-файлы четырёх финальных серий совпадают с независимыми свежими
сборками: Chrome 45 файлов, Firefox 114. ZIP entries и их байты полностью совпадают,
`unzip -t` проходит, относительные импорты разрешаются, тесты/документы исключены.
Chrome notifier не попал в Firefox. Approved graphics и оба опубликованных ZIP
совпадают с исходными hashes; остальной product source совпадает с pre-task tar
snapshot. Firefox baseline обновлён только для точного нового shared storage hash.

Артефакты только для QA, **не для загрузки в Store как релиз 1.6**:

- [Chrome test-only ZIP](/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/background-safety-20261004-DVdJQF/minimal-new-tab-chrome-background-final-test-only.zip)
- [Firefox test-only ZIP](/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/background-safety-20261004-DVdJQF/minimal-new-tab-firefox-background-final-test-only.zip)
- [Artifact gate](/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/background-safety-20261004-DVdJQF/artifact-report-final.json)

Baseline исходников, первоначальные RED, промежуточные отчёты и независимое ревью
сохранены отдельно и не выдаются за финальное подтверждение исправленных байтов.
[Ревью и границы](/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/background-safety-20261004-DVdJQF/independent-review.md).

## Границы и цена решения

- Сохранность относится к существующему сериализованному mutation path: одна
  служба/очередь или общий browser lock. Два независимых писателя без общего lock
  могут столкнуться и лишить committed core его картинки. Это воспроизведённая
  прежняя проблема и на точном pre-task baseline, не исправленная этим этапом;
  unlocked atomicity не заявляется.
- Две картинки временно требуют больше local quota. Если места не хватает,
  сохранение может безопасно отказать; эта цена не скрывается обещанием успеха.
- После полностью подтверждённой и продвинутой замены более ранние байты
  выводятся из хранения. Это не история обоев и не гарантия картинки при recovery
  любого исторического core.
- Опубликованная 1.6 читает только primary. Обычная успешная замена совместима;
  interrupted promotion с pending-only картинкой не становится читаемой старым
  неизменяемым кодом. Следующее новое сохранение может завершить продвижение.
- Отказ cleanup после подтверждённого default/color может оставить известные
  копии; прежние ограничения повторной очистки не переустраивались. Число копий
  остаётся ограниченным, будущие неподдерживаемые форматы сохраняются.
- Реальная account/cross-device delivery, remote/legacy concurrent writers,
  подписанные Store updates и native Firefox persistence/full restart этим запуском
  не проверены. Локальные проверки не являются distributed atomic transaction.
- Arbitrary tampering, same-ID forged bytes, UUID collisions, удаление расширения
  или очистка профиля вне существующей гарантии.
- Ранние неповторившиеся emoji UI/100 ms reload timing-наблюдения из
  [предыдущего этапа](mixed-version-feature-protection-verification-2026-10-04.md)
  не объявляются исправленными этим изменением.

## Рабочая копия и выпуск

Общая runtime-правка доступна обоим builder'ам. Проверяется только новое
test-only окружение; личные Chrome/Firefox, пути установок и магазинные ZIP не
меняются. Store версия всё ещё 1.6; выпуск, push/merge и публикация не выполняются.
Dirty runtime-интеграция прежней работы сохраняется unstaged, без staging чужих
изменений. Собственные новые regression tests и этот документ отделены от dirty
runtime для локального checkpoint; исходная и исправленная рабочие копии
сохраняются в QA. Checkout только по Git HEAD не равен проверенной сборке.
