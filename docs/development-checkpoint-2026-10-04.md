# Принятый development checkpoint — 4 октября 2026

Пользователь ответил «да вроде ок» после обновления тестового Chrome и вопроса
о сохранности сайтов, emoji, фона и настроек. Это приёмка текущей личной тестовой
сборки и переход к согласованной локальной фиксации, не разрешение на публикацию.

## Сохранённое состояние

- Принятые Settings/UI, быстрые свайпы, offline emoji catalog/picker с RU/EN
  поиском, категориями и вариантами, optional All и доступом к unfiled.
- Approved soft-grid PNG и редактируемые vector sources в `design/brand`.
- Chrome-only уведомление о действительно подготовленном обновлении;
  Firefox сохраняет отдельное штатное поведение.
- Защита emoji/All от обычных записей опубликованной 1.6, безопасная замена
  локального фона, Export-подсказка JSON v2 и pointer pass-through warning.
- Код, связанные тесты, builders/vendor/QA scripts, локальные лицензии emoji
  и SVG-библиотеки, документы выполненных этапов.

Сохраняется отдельная ветка `codex/ui-polish-settings-toolbar-20260930`
и существующий worktree. Merge в main, push, PR и публикация не выполняются.
Оба manifests остаются 1.6. Отложенные новые обои не входят в кандидат;
bundled default, personal Firefox и опубликованные ZIP не меняются.

## Проверка перед фиксацией

По `finishing-a-development-branch` и `verification-before-completion` выполнены
свежий полный `node --test`, независимая сборка и artifact checks:

- 388 passed; 0 failed/skipped/cancelled/todo.
- Все 45 Chrome-файлов совпадают с принятой личной установкой и последним
  independently built pointer-QA кандидатом.
- Все 114 Firefox-файлов совпадают с последним independently built pointer-QA
  кандидатом. Новая личная установка Firefox не выполнялась.
- ZIP entries/байты равны runtime-папкам; development/QA/docs не входят в runtime.
- Все Firefox baseline hashes, утверждённые icon exports, неизменность wallpaper,
  manifests/permissions и опубликованных ZIP проверены.
- Проверенный recovery runtime личного Chrome сохранён; branch/worktree,
  staged file list и `git diff --check` проверяются до commit.

Доказательства:
[local-checkpoint-20261004-icZNih](/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/local-checkpoint-20261004-icZNih).
Новые QA ZIP внутри этой папки — **не релизы для загрузки в магазины**.
Commit identity и финальный staged inventory сохраняются в этой QA-папке,
чтобы не добавлять в документ циклическую ссылку на собственный commit hash.

Последняя личная установка и recovery:
[personal-chrome-safety-install-2026-10-04.md](personal-chrome-safety-install-2026-10-04.md).
Свежие семь installed Chromium upgrade checkpoints и пользовательская приёмка
не выдаются за инспекцию каждой записи личного storage или account delivery.
Исторические независимые review/failure evidence остаются в своих отчётах.

## Что остаётся отдельно

- Актуальные скриншоты магазинов, What's New RU/EN и номер нового выпуска.
- Реальная cross-device account sync и подписанная CWS/AMO update delivery.
- Полный Firefox restart с persistently installed новым подписанным пакетом.
- Native emoji/font behaviour вне проверенной macOS конфигурации.

Локальный checkpoint сохраняет принятое состояние, но не означает 100%
сертификацию релиза. Следующий этап — медиа; текущие обои остаются по решению
пользователя. Публикация и отправка изменений в GitHub требуют отдельного шага.
