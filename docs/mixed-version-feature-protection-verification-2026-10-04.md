# Защита настроек от записей опубликованной 1.6

Дата: 4 октября 2026 года. Рабочая ветка: `codex/ui-polish-settings-toolbar-20260930`.
Статус: реализация и независимое ревью завершены; два Important storage-пути исправлены одним RED→GREEN проходом. Исправленные байты прошли свежую полную проверку: 363 unit/contract, 248 браузерных проверок и 15 проверок артефактов. Это завершение данного storage-этапа, не утверждение общей готовности релиза.

## Результат и границы

Текущий код принимает изменения сайтов, папок и порядка от настоящих опубликованных Chrome/Firefox 1.6, сохраняя ранее защищённые emoji и скрытую All. Намеренный возврат к favicon и включение All остаются сбросом после последующей старой записи. Это защита внутри sync-системы каждого браузера, не синхронизация Chrome с Firefox и не доказательство доставки данных между устройствами.

Core остаётся `storageVersion: 1`. Дополнительный слой хранит только emoji/reset и видимость All, связан с существующим ID и SHA-256 полного нормализованного URL, включая query/fragment. Он не создаёт удалённые сайты заново и не откатывает названия/порядок. Новый писатель оставляет совместимые inline-поля и отметку полного намерения; неподдерживаемые данные блокируют изменения, но не скрывают валидные сохранённые сайты.

Выпуск не готовился: версии обоих manifest по-прежнему **1.6**, личные установки, разрешения, обои, иконки, опубликованные папки/ZIP не менялись. Нет push, merge, публикации или новой установки.

## RED → GREEN и регрессии

- До интеграции настоящий сериализатор 1.6 удалял новые поля. Новые тесты сначала воспроизвели потерю, затем подтвердили сохранность после пяти обычных записей и старой очистки в каждой платформенной сборке.
- Падающие тесты установили необходимость блокировать будущую версию внутри payload, а не только manifest, и безопасно повторять собственную незавершённую начальную публикацию.
- Браузерные RED показали отсутствие startup-предупреждения о заблокированном сохранении. Добавлен только существующий локализованный статус RU/EN, без новых элементов интерфейса.
- Финальная проверка отказа mutation lock выявила отсутствие результата `state`. Исправлено чтением без записи: bootstrap и перенос legacy-данных в этом пути запрещены. Проверены защищённый core, unmarked inline и локальные legacy-данные.
- Большинство fault/quota контрактов уже проходили после первой интеграции; сохранены как characterization, без искусственного нарушения корректного кода ради RED.
- В gesture runner счётчик захватывал незавершённые сохранения подготовительных кликов. Подготовка теперь дожидается сохранения до замера; прежняя граница числа записей и все проверки жестов сохранены. Код жестов в этом этапе не менялся.

Ниже результаты новых полных прогонов **после** исправлений независимого ревью. Все четыре браузерные серии проверяют те же runtime-байты, что и независимые сборки; исторические прогоны до ревью не подменяют эту проверку:

| Проверка | Результат | Доказательство |
| --- | --- | --- |
| Unit/contract | 363/363, без skips | `final-closeout-unit.log` |
| Settings, All, RU/EN, два движка + native Chromium | 92/92, errors [] | `review-fixed-settings/report.json` |
| Emoji, выбор favicon/reset, cancel, restart | 61/61, errors [] | `review-fixed-emoji-isolated/report.json` |
| Immutable-package continuity + native Chromium | 19/19, errors [], releaseRisks [] | `review-fixed-data/report.json` |
| Быстрые свайпы и сохранение | 76/76, все assertions проходят | `review-fixed-gestures-isolated/report.json` |
| Независимые runtime/ZIP и импорты | 15/15 | `artifact-report-review-fixed.json` |
| Firefox web-ext 10.5.0 | 0 errors, 0 warnings, 0 notices | `review-fixed-firefox-lint.json` |

Все имена доказательств относятся к отдельной новой QA-папке:

[feature-protection-20261004-tly0zP](/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/feature-protection-20261004-tly0zP)

Ранние результаты и неудачные диагностические прогоны сохранены отдельно, не перезаписаны и не засчитываются как финальная проверка текущих байтов.

Все runtime-файлы четырёх финальных QA-запусков совпадают побайтово с независимыми свежими сборками: Chrome **45** файлов, Firefox **114**. Все ZIP entries совпадают с runtime; оба `unzip -t` проходят, относительные импорты разрешаются, оба новых helper включены, тестовые fixtures/документы исключены, Chrome notifier отсутствует в Firefox. Сверены исходные hashes неизменённых графики и опубликованных ZIP.

Отдельные артефакты только для QA, **не Store-релиз**:

- [Chrome test-only ZIP](/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/feature-protection-20261004-tly0zP/minimal-new-tab-chrome-review-fixed-test-only.zip)
- [Firefox test-only ZIP](/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/feature-protection-20261004-tly0zP/minimal-new-tab-firefox-review-fixed-test-only.zip)
- [Проверка артефактов](/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/feature-protection-20261004-tly0zP/artifact-report-review-fixed.json)

## Проверка именно старого опубликованного кода

Оба старых ZIP независимо извлечены runner'ом. Их storage/API модули совпадают с точными test-only fixtures, а не с переписанной моделью сериализатора:

| Артефакт | SHA-256 |
| --- | --- |
| Chrome ZIP 1.6 | `370b139877761ebe180d7d923ab4381f087a8ef094aebbc4e8b42ea5ee537794` |
| Firefox ZIP 1.6 | `34bd6748a306765bfd40097f915cfc537dfc60b05bb14e2ae9e3bbdf29af1671` |
| Опубликованный storage-service.mjs | `134dacfe20a8f86d1fc218f3e1cb5962fb869ac0165bd1afc7dbe1d2962db778` |
| Опубликованный extension-api.mjs | `04e51c98a82c0fc7945f94313ce0c4419548fe91872583e1ec29f0738bb3322d` |

Два независимых сценария actual ZIP повторяют rename/move/reorder и cleanup; третий использует установленное распакованное расширение в одноразовом Chromium с настоящим `chrome.storage.sync`. Во всех трёх `emojiPreserved: true` и `allVisibilityPreserved: true`; старые правки и точные локальные байты фона сохраняются. Нативный сценарий отдельно проверяет явный reset → старые записи → полный перезапуск процесса.

## Ошибки, квоты и намерение пользователя

- Предел feature JSON: 32 768 UTF-8 bytes, chunk: 3 500 bytes, до 10 chunks. Сохраняются активное и одно предыдущее исправное поколение.
- Проверяется временный пик всего sync-хранилища: 102 400 bytes, item 8 192 bytes с JSON escaping/длиной ключа, 512 items. Отказ не означает потерю emoji или удаление единственной исправной копии ради места.
- Неопределённый результат `set`, частичное применение, сбой readback и отказ блокировки не объявляются успешными. Нет опасного rollback. Следующее чтение повторно проверяет опубликованные данные.
- Очистка после проверенной публикации удаляет только известные собственные и уже не используемые feature-chunks; чужие незавершённые ключи не удаляются. Ошибка очистки не отменяет уже подтверждённую запись.
- Двадцать обычных selection/reorder/rename операций не создают дополнительных feature-поколений. Эффективный no-op не записывает sync.
- Новый импорт v1 с теми же ID/URL и без emoji явно означает favicon; импорт v2 сохраняет заданный emoji. После старого сохранения отменённый emoji не возвращается.
- Изменение query/fragment прежнего ID не переносит emoji старого адреса. Скрытая All не делает сайты без папки недоступными; удаление последней пользовательской папки возвращает безопасную навигацию.

## Что не проверено и чего схема не обещает

1. Настоящая account cross-device доставка, удалённые одновременные core-конфликты и порядок облачной доставки. Локальный lock и readback не являются распределённой atomic transaction.
2. Подписанное CWS/AMO обновление и новый нативный Firefox restart. Firefox здесь проверен движком Playwright с API doubles и точным опубликованным serializer; прежние нативные проверки не выдаются за проверку нового протокола.
3. Сохранность новой настройки до доставки/создания её защищённого слоя на старом устройстве. Если старый код уже удалил ещё не защищённое значение, восстановить неизвестное намерение нельзя.
4. Старый импорт ровно тех же ID/URL неотличим от обычной записи и сохраняет последний защищённый выбор. `storage.clear()`, удаление расширения/профиля и произвольные старые реализации вне гарантии.
5. Системное отображение emoji на других ОС. Каталог, glyph filtering и внешний вид в этом этапе не менялись.
6. После перезапуска на неизвестных незавершённых initial-publication chunks ownership потерян: они не угадываются и не удаляются, данные доступны read-only. Автоматический retry допустим только той службе, которая действительно подготовила эти chunks, как при bootstrap, так и при первой обычной записи.
7. Подтверждён ранее существовавший отдельный дефект: при замене уже установленной пользовательской картинки новая local-запись выполняется до sync commit. Если этот commit отклонён, предыдущие байты картинки уже могут быть заменены, а прежний core ссылается на недоступный local asset — после reload показывается default. Диагностика: `preexisting-background-ordering-diagnostic.log`. Неизменённая существующая картинка при feature-save сохраняется (это проверено); транзакционная замена картинки требует отдельного safety-этапа. Это Important follow-up, не Minor и не основание заявлять общую готовность релиза.

## Решения исполнения и цена ошибки

Полный журнал сохранён в `.superpowers/sdd/2026-10-04-mixed-version-feature-protection/progress.md` и [финальной копии вне source](/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/feature-protection-20261004-tly0zP/execution-ledger-final.md). Ниже все rulings в порядке принятия, включая повторное применение staging-правила:

1. Уже dirty файлы принадлежат прежней работе; stage только отделимой дельты или отложить коммит. Цена — отложенный интеграционный Git checkpoint.
2. «Сам решай» подтверждает исполнение; старый статус ожидания исторический, не новый approval gate. Цена ошибки — риск неправильного толкования полномочий; выпуск, установка и push явно не разрешены этим планом.
3. В Task 3 коммитятся только собственные новые fixtures/tests, runtime-интеграция dirty-файлов остаётся unstaged. Цена — runtime не воспроизводится одним новым Git checkout, нужен сохранённый working candidate.
4. Уже GREEN fault/quota tests остаются characterization; искусственный RED не создаётся. Цена ошибочной оценки — неполное покрытие; реальные RED future-payload/owned-retry отдельно исправлены.
5. Retry начального bootstrap допустим только с доказанным ownership той же службы и свежим чтением. Цена — read-only после crash/restart при утрате ownership, без угадывания чужих данных.
6. Замер gesture-записей начинается после завершения подготовительного save, без ослабления burst-assertions. Цена неверной диагностики — оставшаяся гонка измерения.
7. Отказ lock не скрывает читаемые сайты: read-only fallback без bootstrap/migration. Цена — возможный несогласованный snapshot при параллельном изменении; запись запрещена, следующая операция читает заново.
8. Account delivery, remote core conflicts и signed-store updates не считаются проверенными локальными тестами. Цена — эти реальные сценарии остаются неподтверждёнными, Store-readiness не заявляется.
9. После restart неизвестные orphan chunks остаются read-only; same-instance ordinary retry исправлен. Цена — blocked edits после прерванной первой публикации до отдельного recovery-решения.
10. Прежние UI, OS emoji rendering/catalog и gesture algorithms не переделываются. Цена — нет новой сертификации каждого физического устройства и ОС.
11. Прежняя замена local wallpaper до sync commit не переустраивается скрыто в этом этапе. Это отдельный Important follow-up; цена — возможная потеря предыдущей пользовательской картинки при отказе замены, общая готовность релиза не подтверждается.
12. Произвольные старые реализации, destructive clear/profile removal и неразличимые identical old imports вне гарантии. Цена — потеря настроек при удалении данных либо сохранение последнего защищённого выбора вместо невыраженного reset.
13. Ранние шесть emoji UI timeouts сохраняются как наблюдение; instrumentation и неизменённый isolated runner проходят 61/61, причина не объявляется установленной. Цена — возможный intermittent UI/automation-сбой остаётся открытым.
14. Один quick-reload сценарий не прошёл; diagnostic и неизменённый isolated runner затем проходят 76/76 без изменения 100 мс или assertions. Цена — абсолютная гарантия сохранения за 100 мс не доказана, ранний timing-сбой остаётся открытым наблюдением.
15. Ветка/worktree и plan workspace остаются на месте, без push/merge: runtime уже dirty и не включается в чужие изменения. Цена — нужен отдельный интеграционный checkpoint; scratch занимает диск, зато журнал и рабочие байты не теряются.

## Независимое финальное ревью

Один fresh-context reviewer (`gpt-6-astra`) read-only проверил working candidate против pre-execution baseline и пяти Review Focus. Самостоятельно прошли 98/98 relevant tests и whitespace gate. Verdict: With fixes; Critical и Minor не обнаружены.

Исправлены одним TDD-проходом:

- Important reviewer finding: незавершённая первая обычная публикация блокировала повторную запись той же службой. Пять regression cases сначала упали, затем прошли: empty/legacy core, частично применённые feature-chunks, отказ backup/head. Retry допускается только при доказанном ownership, свежем чтении и отсутствующих heads; чужие chunks по-прежнему блокируют запись.
- Important author finding: после core-only partial rejection повторный exact reset ошибочно возвращал успешный no-op, не обновив feature layer; следующий старый save восстанавливал отменённый выбор. Четыре regression cases RED→GREEN: partial/missing/stale head/chunk. Save теперь подтверждает согласованную защиту до no-op; следующий настоящий 1.6 edit сохраняет reset.

Полная suite после исправлений: **363/363**, ноль skips. Повторное ревью не запускалось: исправления доказываются regression tests и новым полным прогоном. [Отчёт reviewer и disposition](/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/feature-protection-20261004-tly0zP/independent-review.md).

Все рассмотренные, но оставленные за рамками поведения имеют effect/cost ruling: account delivery/remote conflicts/signed updates; unknown orphan ownership после restart; прежние UI/catalog/gesture algorithms; транзакционная замена local wallpaper; arbitrary old code/destructive clears/неразличимый старый импорт. Отложенных Minor нет; риск замены wallpaper остаётся отдельным Important, см. выше.

## Открытые наблюдения повторной QA

В одном concurrent-прогоне после review шесть первых Chrome-EN действий emoji-панели завершились visibility/actionability timeout, без page errors. Отчёт `review-fixed-emoji/report.json` сохранён как неуспешный. Затем instrumentation-прогон `review-fixed-emoji-timing` и повтор **неизменённого** runner `review-fixed-emoji-isolated` отдельно проходят все 61 проверки. Assertions, таймауты и product code не ослаблялись; причина исходного сбоя не установлена. Это открытое наблюдение UI/automation, не заявленное исправление.

В `review-fixed-gestures` Chrome-сценарий «клик → reload через 100 мс» не подтвердил восстановление выбора. Этот отчёт также не засчитывается как финальный PASS. Повтор с записью storage operations и сохранённого head перед reload (`review-fixed-gestures-timing`) проходит 76/76: Chrome head был сохранён до reload; отдельно **неизменённый** runner (`review-fixed-gestures-isolated`) проходит 76/76 в обоих движках и native Chromium. Assertions, 100 мс и product code не менялись. Причина первоначального timing-сбоя не установлена; нет утверждения, что выбор гарантированно сохранится за 100 мс при любой нагрузке.

## Git и передача результата

Собственные helper/test/fixture и новые документы зафиксированы локальными коммитами. Runtime-интеграция и обновления ранее dirty README/roadmap оставлены unstaged согласно согласованным Global Constraints; pre-execution baseline и финальная интеграционная дельта сохранены отдельно в QA-папке. Новый checkout только по HEAD не является проверенной сборкой. Ветка `codex/ui-polish-settings-toolbar-20260930` и рабочая копия `/Users/nurfinn/.codex/worktrees/minimal-tab-ui-20260930` сохранены; push/merge, выпуск и личная установка не выполнялись.

Plan workspace не удалён: исправленная runtime-интеграция ещё не зафиксирована отдельным checkpoint, поэтому Git history пока не заменяет её журнал. Отложенных Minor нет. Отдельный Important wallpaper follow-up и два timing-наблюдения перечислены выше, а не объявлены исправленными.

## Отдельный последующий safety-этап — 4 октября

После отдельного согласования пользователя Important wallpaper follow-up закрыт
bounded-исправлением новой local-копии и подтверждения перед заменой. Новые exact-byte
прогоны: 388 unit/contract, 251 браузерная и 17 artifact checks; повторное независимое
ревью подтвердило исправление собственного Important finding. Это не переписывает
исторические результаты/границы данного feature-этапа и не закрывает прежние
emoji/100 ms timing-наблюдения, account delivery или native Firefox persistence.
[Новый результат и ограничения](background-transaction-verification-2026-10-04.md).
