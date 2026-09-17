# ExecPlan: персональный локальный Keybr

## Контекст и ожидаемый результат

Этот документ — единый план реализации открытых GitHub issues [#1](https://github.com/vitalcc55/keybr-for-me/issues/1)–[#7](https://github.com/vitalcc55/keybr-for-me/issues/7) в одной ветке `codex/keybr-for-me-issues`.

Исходная точка перед плановым коммитом: ветка `personal` была чистой, текущий `HEAD` — `13be2331` (`docs: identify personal keybr derivative`); issues ссылаются на более ранний аудит `2941f65d`, поэтому baseline и расхождения проверяются фактически, а не по старому SHA. Уже существующие Windows-изменения (`tools/launch-keybr.ps1`, `tools/provision-admin.js`, сборочные исправления) сохраняются.

Наблюдаемое состояние готовности: локальный тренажёр запускается на Windows только через loopback, сохраняет существующие данные, позволяет выбрать персональный русский источник, использует все 1232 канонических слова и отдельную `ё`, сохраняет адаптивность Guided, переживает reload/restart/offline-проверку и имеет проверенный Windows-runbook. Штатные источники и режимы не получают непредусмотренной подстановки.

## Жёсткие инварианты

- Порядок работ: **#2 → #3 → #4 → #5 → #6 → #7**. После безопасного baseline чистая подготовка корпуса #3 может идти рядом с #2, но до изменения загрузчиков согласуются #4 и #5.
- Штатный `words-ru.json` и `model-ru.data` не заменяются и не перегенерируются массовым генератором.
- Канонический personal JSON — единственный редактируемый источник. В нём ровно 1232 уникальных NFC-строки `[а-яё]+`, 26 слов с `ё`, все 33 русские буквы, порядок и SHA-256 `ab09647a03f1c3439e143ff20372c4d864d792ed42a1f59a5db1920bef35e563`.
- `ё` не сводится к `е`: пары `все/всё`, `чем/чём`, `перед/перёд`, `небо/нёбо` сохраняются, ошибка `е` вместо ожидаемой `ё` неправильна.
- Один небольшой data-only descriptor связывает `sourceId`, язык, corpus version/count, word-list id и model id/version. Source не становится новым языком, раскладкой или статистическим partition.
- Personal Word List строгий: при выключенных преобразованиях каждое слово принадлежит выбранному корпусу, доступны короткие слова и хвост после 1000; режим `all` не вызывает скрытый `.slice(0, 1000)`.
- Guided остаётся штатным адаптивным алгоритмом: unlock/recovery/target speed/weak-key focus сохраняются; personal pool не обрезается, правило длины `>2` остаётся, псевдослова — только прозрачный bounded fallback.
- Все async loaders используют composite source/model/version identity, отменяют устаревшие ответы, очищают старый урок при смене источника и показывают ошибку/retry без тихой подстановки.
- Loopback, origin, cookies, readiness и оба server listeners согласованы. Тесты никогда не наследуют рабочие `DATA_DIR`/SQLite и не удаляют пользовательские данные.

## Архитектурный бюджет YAGNI/KISS/DRY

- Переиспользовать существующие packages, `TransitionTableBuilder`, loaders, `Settings`, Guided/Word List, logger и PowerShell launcher.
- Добавить только один descriptor/resolver в существующий нейтральный пакет (`@keybr/content`), один manifest рядом с personal JSON и один targeted validator/generator/check.
- Производные TXT и `.data` не становятся вторыми ручными источниками; массовый `generate-languages` не используется для personal asset.
- Не создавать новый backend/БД/registry/plugin API/migration framework/service worker/PWA/телеметрию/dashboard/второй test framework или тяжёлую E2E-платформу.
- Новая абстракция допустима только при конкретном воспроизводимом блокере acceptance; спорные дефекты (например, `PrefixList`) сначала подтверждаются focused regression.

## Этапы и владельцы

### #2 — Windows, localhost и сохранность данных

**Owners:** `packages/server/lib/main.ts`, `packages/server/lib/server/service.ts`, `tools/launch-keybr.ps1`, `tools/provision-admin.js`, test-env/config helpers, Windows runbook.

1. Зафиксировать версии Node/npm/PowerShell/ОС, HEAD/status и baseline compile, focused tests и dev/prod build. Для каждого запуска принудительно задать уникальные временные `DATA_DIR`, SQLite и при необходимости package-level каталоги; pre-existing failures записать отдельно.
2. Протянуть явный bind host до HTTP и WebSocket listeners. Personal launcher задаёт loopback, Docker получает только явный совместимый override; `APP_URL`, cookie domain, readiness и открываемый URL используют один canonical origin.
3. Доработать существующий launcher: сначала распознать именно свой живой экземпляр, проверить реальные build assets, bounded readiness и занятый порт, затем выполнять идемпотентное provisioning. Добавить точечный PID/state и stop/restart без массового `taskkill node.exe`, сохранить ротацию/ограничение логов и не писать секреты/пользовательский текст.
4. Ограничить provisioning локальной SQLite/data root и убрать предсказуемый постоянный `admin` token из рабочего потока, используя штатный локальный механизм с непредсказуемым runtime-secret без вывода в stdout/URL/logs.
5. Проверить start повторно, stop/restart, отрицательный сценарий чужого сервиса/занятого порта и socket evidence для 3000/3001. Документировать фактически проверенные Windows-команды, пути данных и backup/restore всей `DATA_DIR` плюс внешней SQLite и `-wal/-shm` на остановленном test copy.

**Gate:** loopback и data-safety доказаны детерминированными тестами/командным evidence; пользовательский каталог не затронут.

### #3 — Канонический personal corpus

**Owners:** `packages/keybr-content-words/lib/data/words-ru-personal.json`, manifest/validator/generator в `packages/keybr-content-words` или `packages/keybr-generators`, focused tests.

1. Извлечь полный второй fenced `text`-блок issue #3 с проверкой формы блока, одной строки и отсутствия усечения; импортировать без автоматического trim/lowercase/NFC rewrite/`ё→е`/дедупликации.
2. Добавить небольшой versioned manifest (`ru-personal`, schema/corpus version, count, checksum, алгоритм и provenance issue #3). Проверка должна падать при повреждении или устаревшем производном артефакте и не принимать новый hash автоматически.
3. Сделать воспроизводимый export `words.join(", ")` в UTF-8 без BOM и CR/LF; JSON остаётся единственным редактируемым источником. Добавить round-trip и malformed/empty/duplicate/mixed-script/NFD/control/BOM проверки.
4. Сохранить штатный цикл проверки словарей и порог `>1500`; personal имеет отдельный контракт, короткие слова не удаляются.

**Gate:** 1232/1232 unique, 26 `ё`, 33 буквы, exact hash/order и byte-level export подтверждены; штатные assets не изменились.

### #4 — Полноценная `ё` и personal phonetic model

**Owners:** `packages/keybr-keyboard/lib/language.ts`, personal model generator/asset, `packages/keybr-phonetic-model-loader`, `packages/keybr-phonetic-model`, profile statistics boundary.

1. Добавить `ё` в декларацию `Language.RU`, сохранив физическую Backquote-раскладку, прямое code-point сравнение и существующие layout/statistics identity.
2. Создать targeted generator из canonical JSON через штатный `TransitionTableBuilder(4, [space, ...alphabet])`; получить отдельный `model-ru-personal.data`, manifest/hash и byte-identical повторную генерацию. `model-ru.data` и остальные assets не трогать.
3. Через общий descriptor согласовать source → word list → model → lesson. Loader keys/dependencies включают source/model/version; stale async response и loader error/retry проверяются.
4. Проверить положительные частоты и все 33 буквы, отдельную статистику `ё`, ввод `е` как ошибку, binary round-trip, сохранение истории остальных букв и отображение `ё` в profile/ResultGrouper без новой статистической identity.
5. Для всей цепочки генерации проверить bounded retries/censor/fallback. Исправлять только воспроизводимый дефект; не переписывать phonetic algorithm и не исправлять подозрительный `PrefixList` без regression.

**Gate:** personal asset воспроизводим, runtime действительно его загружает, `ё` достижима как weak/focused key, стандартные assets и прогресс сохранены.

### #5 — «Мой словарь», загрузчики и полный Word List

**Owners:** descriptor в `@keybr/content`, `@keybr/content-words/lib/load.ts`, `@keybr/phonetic-model-loader`, `@keybr-lesson-loader/lib/LessonLoader.tsx`, `@keybr/lesson/lib/settings.ts`/`wordlist.ts`, existing practice settings UI.

1. Добавить source setting отдельно от `Language`/layout/lesson type. Свежая русская конфигурация по умолчанию выбирает `ru-personal`; явно сохранённый standard/personal выбор не перезаписывается, RU→EN→RU восстанавливает источник.
2. Расширить language-only adapters так, чтобы штатные typing-test/profile/layouts остались штатными, а Guided/Word List получили согласованную пару personal dictionary/model. Не импортировать corpus в model core и не создавать отдельный package registry.
3. В Word List сохранить pipeline `corpus → whole-word layout filter → explicit length filter → all/first-N → RNG`. Для personal `all` лимит отсутствует; `first-N` остаётся явным. Пустой пул даёт видимую ошибку, one-word пул не зависает.
4. В существующем UI добавить выбор источника, фактические counts/version и пояснение преобразований; не менять Books/Code/Numbers/Custom. Loader state — loading/success/error/retry, source/model/version входят в remount/cancellation identity.

**Gate:** deterministic tail selection доказывает доступность `нёбо`, полный personal pool равен 1232 до фильтров, короткие слова и пары `е/ё` доступны, stale A→B→A не смешивает данные.

### #6 — Адаптивный Guided

**Owners:** `packages/keybr-lesson/lib/guided.ts`, existing `Dictionary`/text generators, Guided settings/explainer and focused tests.

1. Передавать в Guided source policy (`standard: 1000`, `personal: all`) без сравнения строкового id внутри алгоритма; сохранить `update()`/unlock/recover/target/focus и физическую раскладку.
2. Убрать отсечение первых 1000 только для personal. Personal candidates строятся в порядке corpus → layout/included/focused filters → source-specific limit; без скрытых весов/квот.
3. Оставить правило `>2` для Guided и `naturalWords=false` псевдословный режим. Fallback до малого пула имеет отдельный attempt budget и проверяет непустоту, разрешённые буквы и focus; при невозможности возвращается typed unavailable state, а не `?`.
4. Объяснить в UI разницу строгого Word List и адаптивного Guided, правило коротких слов и причину fallback. Добавить deterministic tests для 0/1/14/15/>1000, слабой `ё`, closed keys, one-word и невозможного фильтра с timeout.

**Gate:** хвост personal достижим, standard semantics не изменились, нет зависаний/ложного `?`, adaptive focus подтверждён реальным asset.

### #7 — Сквозная приёмка и передача

**Owners:** существующий Node/TypeScript toolchain, focused/browser harness без нового framework, `docs` Windows runbook и machine-readable evidence в `.tmp/.codex/`.

1. После #2–#6 выполнить relevant package tests, compile/typecheck, lint/stylelint новых файлов, dev/prod build и полный suite только в безопасной per-suite/per-package data isolation. Pre-existing failures отделить от новых.
2. Провести реальные browser scenarios: свежий personal profile; законченный Word List с хвостом/`ё`; Guided weak-`ё`; reload + server restart + browser reopen с сохранением результата/settings; corpus update и backup/restore test copy; fresh context с блокировкой внешних запросов; loopback/foreign-service negative smoke.
3. Сформировать компактный JSON/Markdown evidence: schemaVersion, commit/tool versions, commands/exits/durations/timeouts, corpus/model identity/hash/count, scenario postconditions, blocked external requests, failures/skips и artifact paths. Runtime logs/screenshots не коммитить.
4. Обновить README/Windows runbook точными проверенными install/build/test/start/stop/backup/restore командами и ограничениями (автоматический ввод `ё` не доказывает физическую Windows-раскладку).

**Gate:** все критерии #1–#7 покрыты focused test или реальным browser/manual evidence; локальная тренировка проходит без внешнего интернета после сборки.

## Рабочий цикл и проверки

1. До каждого этапа: `git status`, diff и проверка сохранности пользовательских файлов; не использовать destructive reset/clean/force push.
2. На этапе: сначала characterization/regression и узкие тесты, затем минимальная правка и повторная focused-проверка. Не запускать полный `verify` до профильного review.
3. После завершения реализации #2–#7: запустить read-only review субагентами по security/data, corpus/model, loaders/lessons и acceptance; каждое finding самостоятельно подтвердить или отклонить, исправлять только подтверждённое у canonical owner и повторять review-loop до отсутствия новых findings.
4. Только после чистого review: полный `verify` (compile/typecheck, lint/stylelint, builds, isolated full tests и browser acceptance), исправление технических ошибок и повтор до зелёного результата. После успешного verify сделать итоговый commit в этой же ветке.

## Ограничения и условия остановки

- Не публиковать, не push/merge/PR и не менять GitHub issues без отдельного запроса.
- Не раскрывать реальные `.env`, токены, пользовательский текст или runtime logs. Backup выполнять только на остановленном test copy.
- Если корректное исправление требует выбрать новую бизнес-логику, user-facing behavior или incompatible contract, остановиться перед этим выбором и вынести варианты с рекомендацией; обычные технические ошибки исправлять самостоятельно.
- Если окружение не позволяет доказать browser/offline/hardware-поведение, явно отметить непроверенное состояние, не выдавать статический тест за runtime evidence.

## Definition of done

Рабочая ветка содержит плановый и итоговый commits, единый personal source/model contract, проверенные локальные запуск и сохранность, полный Word List, адаптивный Guided с `ё`, сохранённые штатные режимы, focused/review/full verification evidence и точный Windows-runbook. Никакой новый контур не добавлен без доказанного acceptance-блокера.
