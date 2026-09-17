# ExecPlan: персональный локальный Keybr

## Контекст и ожидаемый результат

Этот документ — единый план реализации открытых GitHub issues [#1](https://github.com/vitalcc55/keybr-for-me/issues/1)–[#7](https://github.com/vitalcc55/keybr-for-me/issues/7) в одной ветке `codex/keybr-for-me-issues`.

Исходная точка перед плановым коммитом: ветка `personal` была чистой, текущий `HEAD` — `13be2331` (`docs: identify personal keybr derivative`); issues ссылаются на более ранний аудит `2941f65d`, поэтому baseline и расхождения проверяются фактически, а не по старому SHA. Плановый commit — `90407ebb` на ветке `codex/keybr-for-me-issues`; уже существующие Windows-изменения (`tools/launch-keybr.ps1`, `tools/provision-admin.js`, сборочные исправления) сохраняются.

**Целевое состояние (пока не подтверждено):** локальный тренажёр запускается на Windows только через loopback, сохраняет существующие данные, позволяет выбрать персональный русский источник, использует все 1232 канонических слова и отдельную `ё`, сохраняет адаптивность Guided, переживает reload/restart/offline-проверку и имеет проверенный Windows-runbook. До появления evidence это требования, а не утверждение о готовности. Штатные источники и режимы не получают непредусмотренной подстановки.

## Жёсткие инварианты

- Порядок работ: **#2 → #3 → #4 → #5 → #6 → #7**. После безопасного baseline чистая подготовка корпуса #3 может идти рядом с #2, но до изменения загрузчиков согласуются #4 и #5.
- Штатный `words-ru.json` и `model-ru.data` не заменяются и не перегенерируются массовым генератором.
- Канонический personal JSON — единственный редактируемый источник. В нём ровно 1232 уникальных NFC-строки `[а-яё]+`, 26 слов с `ё`, все 33 русские буквы, порядок и SHA-256 `ab09647a03f1c3439e143ff20372c4d864d792ed42a1f59a5db1920bef35e563`.
- Проверка personal JSON использует независимый предикат `[а-яё]+`, а не текущий 32-буквенный `Language.RU`; canonical order для модели — `абвгдеёжзийклмнопрстуфхцчшщъыьэюя`.
- `ё` не сводится к `е`: пары `все/всё`, `чем/чём`, `перед/перёд`, `небо/нёбо` сохраняются, ошибка `е` вместо ожидаемой `ё` неправильна.
- Один небольшой data-only descriptor связывает `sourceId`, язык, corpus version/count/checksum, word-list id, model id/version и model checksum. Descriptor — типизированное представление единственного manifest, а не второй реестр; source не становится новым языком, раскладкой или статистическим partition.
- Personal Word List строгий: при выключенных преобразованиях каждое слово принадлежит выбранному корпусу, доступны короткие слова и хвост после 1000; режим `all` не вызывает скрытый `.slice(0, 1000)`.
- Guided остаётся штатным адаптивным алгоритмом: unlock/recovery/target speed/weak-key focus сохраняются; personal pool не обрезается, правило длины `>2` остаётся, псевдослова — только прозрачный bounded fallback.
- Все async loaders используют primitive composite source/model/version identity, состояния `loading/success/error`, отменяют устаревшие ответы, очищают старый урок при смене источника и показывают ошибку/retry без тихой подстановки. Невозможная генерация урока возвращает типизированный unavailable-state, а не `?`.
- Loopback, origin, cookies, readiness и оба server listeners согласованы. Generic language-only loaders остаются штатными; practice явно передаёт source. Тесты никогда не наследуют рабочие `DATA_DIR`/SQLite и не удаляют пользовательские данные.

## Архитектурный бюджет YAGNI/KISS/DRY

- Переиспользовать существующие packages, `TransitionTableBuilder`, loaders, `Settings`, Guided/Word List, logger и PowerShell launcher.
- Добавить только metadata-only descriptor-типы в существующий нейтральный пакет (`@keybr/content`), один canonical manifest и один прямой targeted validator/generator/check в существующих пакетах. `@keybr/content` экспортирует только типы; concrete descriptor строится единственным resolver в `@keybr/content-words`, а asset-specific lazy loading остаётся у `content-words` и `phonetic-model-loader`; циклические зависимости запрещены.
- Производные TXT и `.data` не становятся вторыми ручными источниками; массовый `generate-languages` не используется для personal asset.
- Не создавать новый backend/БД/registry/plugin API/migration framework/service worker/PWA/телеметрию/dashboard/второй test framework или тяжёлую E2E-платформу.
- Новая абстракция допустима только при конкретном воспроизводимом блокере acceptance; спорные дефекты (например, `PrefixList`) сначала подтверждаются focused regression.

## Этапы и владельцы

### #2 — Windows, localhost и сохранность данных

**Owners:** `packages/server/lib/main.ts`, `packages/server/lib/server/service.ts`, `tools/launch-keybr.ps1`, `tools/provision-admin.js`, `tools/run-isolated-tests.ps1` (если нужен узкий PowerShell wrapper), test-env/config helpers, Windows runbook.

1. Разделить normal profile и verification child: постоянный launcher использует проверенный пользовательский `DATA_DIR`/SQLite и только read-only preflight, а тесты — уникальные временные file-backed `DATA_DIR`/SQLite и package-level каталоги. До `Env.probeFilesSync`/`ConfigModule`/Knex принудительно переопределить или отклонить унаследованные `DATA_DIR`, `DATABASE_FILENAME`, `DATABASE_CLIENT`, `APP_URL`, cookie-параметры, bind host, оба порта и `PUBLIC_DIR`; sentinel реального каталога проверен, pre-existing failures записаны отдельно. До review выполнить только узкие baseline checks с идентификаторами; полные failures классифицировать как `unverified`, если baseline artifact для них не существует.
2. Протянуть явный bind host до HTTP и WebSocket listeners. Personal launcher задаёт `127.0.0.1`; общий/Docker default не менять без явного override. `APP_URL=http://localhost:3000/`, `COOKIE_DOMAIN=localhost`, host-only `COOKIE_SECURE=false`, readiness и открываемый URL используют один canonical browser origin; listener 3001 также loopback. Доказать фактическую IPv4/IPv6 binding policy и сохранение session cookie. Multiplayer handshake не входит в personal acceptance без существующей same-origin proxy, новый proxy не добавлять.
3. Доработать существующий launcher: сначала проверить свободность обоих портов либо свежий owner marker (master PID, canonical repo/data root, command path, build marker и оба port values), реальные build assets и loopback sockets; только после этого выполнять DB-операции provisioning. Добавить master PID/state, shutdown guard для cluster respawn, forwarding/ожидание всех workers, cleanup собственного process tree при failed launch, bounded readiness и stop/restart без массового `taskkill node.exe`; хранить не более 10 timestamped log-групп и ограничить `launcher.log` 1 MiB, не писать секреты/пользовательский текст.
4. Ограничить provisioning локальной SQLite/data root до любых DB-операций. Выбранный режим — named local profile: генерировать CSPRNG token на каждый provisioning, передавать его через закрытый stdin/ACL-защищённый ephemeral handoff в существующий `/login/{token}` flow, открыть URL один раз с последующим переходом на `/ru`, не выводить token в stdout/readiness/logs/URL логов, HAR/profile/evidence и не оставлять постоянный `admin` token. Bearer token в штатной DB login-request с существующим bounded expiry допустим; повторный запуск не меняет историю/settings. Если handoff нельзя доказать, остановиться перед изменением продуктовой auth-семантики, а не изобретать новую auth-систему.
5. Проверить первый и повторный start, spoofed foreign service (`200 + keybr`), занятие 3000/3001, ранний exit, stop/restart и socket evidence для обоих портов; oracle обязан проверять owner marker/process и build identity, а чужой сервис/ошибка не должны выполнять provisioning или менять sentinel/DB. Реальный профиль резервировать до вмешательства по отдельному user-approved boundary; backup включает `DATA_DIR`, внешнюю SQLite и `-wal/-shm`, restore выполняется в новый test root. Документировать фактические PowerShell-команды. Docker/multiplayer остаются явно описанными non-goals для personal acceptance; 3001 проверяется как loopback listener, но handshake не требуется.

**Gate:** loopback и data-safety доказаны детерминированными тестами/командным evidence; пользовательский каталог не затронут.

### #3 — Канонический personal corpus

**Owners:** `packages/keybr-content-words/lib/data/words-ru-personal.json`, `packages/keybr-content-words/lib/data/words-ru-personal.manifest.json`, validator в `@keybr/content-words`, `packages/keybr-generators/package.json` и прямой `packages/keybr-generators/lib/generate-personal.ts` и focused tests.

1. Извлечь полный второй fenced `text`-блок issue #3 с проверкой формы блока, одной строки и отсутствия усечения; импортировать без автоматического trim/lowercase/NFC rewrite/`ё→е`/дедупликации. Проверять JSON независимым personal-предикатом, не через `Language.RU.test()`.
2. Добавить corpus-only часть versioned `packages/keybr-content-words/lib/data/words-ru-personal.manifest.json` (`sourceId`, `wordListId`, `languageId`, `corpusVersion`, `wordCount`, corpus SHA-256 от `words.join("\n")` без final LF, provenance issue #3). Это immutable v1 trust anchor: `--check` сверяет ожидаемые corpus values и не принимает новый hash автоматически.
3. Прямой `generate-personal` читает только JSON+corpus manifest, не импортирует `generate-languages.ts` или `lib/index.ts`, и до #4 пишет только personal-derived export `packages/keybr-content-words/lib/data/words-ru-personal.txt` (`words.join(", ")`, UTF-8 без BOM и любого CR/LF, включая final byte). Добавить owner script в `packages/keybr-generators/package.json` с явными режимами export/`--check`: mismatch даёт non-zero и `--check` ничего не пишет. TXT пометить generated, для него задать path-specific `insert_final_newline=false`/байтовое EOL-исключение в `.editorconfig`/`.gitattributes`. Model metadata и raw-byte model hash добавляются и финализируются владельцем #4 после построения asset, в том же manifest, без placeholder.
4. Сохранить штатный цикл проверки словарей и порог `>1500`; personal имеет отдельный контракт, короткие слова не удаляются. Round-trip parser `", "` строгий: без trim/normalize, с отказом при пустом токене, BOM, CR/LF или лишнем пробеле; добавить malformed/empty/duplicate/mixed-script/NFD/control проверки.

**Gate:** 1232/1232 unique, 26 `ё`, 33 буквы, exact hash/order и byte-level export подтверждены; штатные assets не изменились.

### #4 — Полноценная `ё` и personal phonetic model

**Owners:** `packages/keybr-keyboard/lib/language.ts`, `packages/keybr-generators/package.json`/`lib/generate-personal.ts`, `packages/keybr-phonetic-model/assets/model-ru-personal.data`, `packages/keybr-phonetic-model-loader`/`assets.ts`/`loader.ts`, `packages/keybr-phonetic-model`/`phoneticmodel.ts`/`censor.ts`, `packages/page-profile/lib/profile/ResultGrouper.tsx`.

1. Добавить `ё` в декларацию `Language.RU` в canonical order `абвгдеёжзийклмнопрстуфхцчшщъыьэюя`, сохранив физическую Backquote-раскладку, прямое code-point сравнение и существующие layout/statistics identity. Generic standard model остаётся 32-буквенным и не перегенерируется.
2. После corpus gate создать targeted generator из canonical JSON через штатный `TransitionTableBuilder(4, [space, ...alphabet])`: append ровно слова длиной `>=3` (ожидаемо 1206) ровно один раз в порядке JSON, без sort/lowercase/normalize/`ё→е`; короткие 26 слов остаются только в JSON/TXT для Word List. Preflight validator падает до `append` при неизвестном code point. Получить отдельный `model-ru-personal.data` и byte-identical повторную генерацию. `model-ru.data` и остальные assets не трогать.
3. В том же единственном manifest после успешной генерации зафиксировать `modelId/modelVersion`, raw-byte model SHA-256, `generatorVersion`, `order` и точный alphabet; это однократная финализация model-полей corpus trust anchor, не автоматическое принятие нового corpus hash. Descriptor получает типизированную projection, не собственные копии. Прямой `generate-personal --model`/`--check` должен воспроизводимо получить model bytes, проверять corpus и model bytes, писать только personal outputs и иметь non-zero/no-write при mismatch. Через явный `ModelReference` descriptor согласовать source → word list → model → lesson. Loader keys/dependencies включают source/model/version/corpus checksum; stale async response, asset-level check (raw bytes, order, alphabet, positive `ё` frequency) и loader error/retry проверяются. Бинарный формат не менять.
4. Проверить положительные частоты и все 33 буквы, отдельную статистику `ё`, ввод `е` как ошибку, binary round-trip, сохранение истории остальных букв и профильную политику: standard profile остаётся standard, а RU-профиль дополнительно показывает `ё` как code-point Letter без новой статистической identity.
5. Замкнуть bounded contract по слоям без нарушения существующего `PhoneticModel.nextWord(): string`: `censor` имеет конечный retry budget и возвращает пустую строку при исчерпании, `phoneticWords` переводит её в typed unavailable, `mangledWords` корректно распространяет отсутствие второго слова при hyphen, personal Guided fallback имеет отдельный attempt budget, а fragment немедленно возвращает единый `LessonUnavailable` вместо бесконечного цикла и sentinel `?`. Проверить всех потребителей string API (включая typing-test) и adversarial always-rejected cases; не менять public type на `string|null` без полного fan-out. Исправлять только воспроизводимый дефект; не переписывать phonetic algorithm и не исправлять `PrefixList` без regression.

**Gate:** personal asset воспроизводим из 1206 слов длиной `>=3`, runtime действительно его загружает, `ё` достижима как weak/focused key, стандартные assets и прогресс сохранены.

### #5 — «Мой словарь», загрузчики и полный Word List

**Owners:** descriptor в `@keybr/content`, `@keybr/content-words/lib/load.ts`, `@keybr/phonetic-model-loader`, `@keybr-lesson-loader/lib/LessonLoader.tsx`, `@keybr/lesson/lib/settings.ts`/`wordlist.ts`, existing practice settings UI.

1. Добавить source setting отдельно от `Language`/layout/lesson type и разместить один переиспользуемый selector в `packages/page-practice/lib/settings/lesson/LessonSettings.tsx`, который показывается только для Guided/Word List, не в KeyboardSettings. Матрица effective source: Guided/Word List practice → выбранный descriptor и `GuidedSourcePolicy`; Books/Code/Numbers/Custom → standard model; Typing Test/Layouts → прежние language-only standard adapters; Profile → standard loader плюс явное отображение RU `ё` на границе `ResultGrouper`.
2. Зафиксировать persisted representation без нового storage protocol: `lesson.wordList.source` (`ru-personal`/`ru-standard`) и `lesson.wordList.limit` (`inherit`/`all`/decimal first-N). `inherit` означает personal→`all`, standard→существующий legacy `wordListSize` (1000 по умолчанию); явный decimal — first-N; invalid/unsupported source даёт typed error и понятное действие, не тихую подстановку. Отсутствующий source в RU резолвится как personal для свежего/legacy local profile, явный сохранённый выбор не меняется; RU→EN→RU восстанавливает personal setting.
3. Расширить language-only adapters так, чтобы стандартные потребители остались стандартными, а practice `LessonLoader` один раз разрешал descriptor только для Guided/Word List, передавал ту же пару словарь/model и типизированную `GuidedSourcePolicy` (standard `1000`, personal `null`). `@keybr/content` содержит только primitive types; concrete resolver/manifest живёт в `@keybr/content-words`, model asset mapping — в `phonetic-model-loader`. Не импортировать corpus в model core и не создавать package registry.
4. В Word List сохранить pipeline `corpus → whole-word layout filter → explicit length filter → all/first-N → RNG`. Для personal `all` лимит отсутствует; `first-N` остаётся явным. Пустой отфильтрованный пул возвращает `LessonUnavailable` с действиями «снять фильтр/сменить источник», one-word пул не зависает. Передавать UI source total/filtered/selected counts и version.
5. Зафиксировать loader lifecycle как малый discriminated state `loading | success(identity, value) | error(identity, message, retry)`: `assetIdentity` = source/language/corpus/model/version, `lessonIdentity` = type/layout/source/limit/filters, `progressSeedIdentity` = lesson identity + results revision. При новой primitive identity сбрасывать result/preview/input/loading/done, children показывать только при совпадении identity, stale success/reject игнорировать, retry очищает error. Добавить deferred A1→B→A2, limit/layout change и reject→retry тесты, не вводя общую state-machine платформу.

Таблица совместимости сохранённых настроек:

| Состояние JSON | Эффективный источник при RU | Эффективный лимит Word List |
| --- | --- | --- |
| Нет `lesson.wordList.source`, нет `limit` | `ru-personal` | `all` |
| Явный `ru-standard`, нет `limit` или `limit=inherit` | штатный | существующий `wordListSize` (legacy default 1000) |
| Явный `ru-personal`, нет `limit` или `limit=inherit` | personal | `all` |
| `limit=all` | personal only | `all` |
| `limit=N` | выбранный | `min(N, filteredCount)`, где N — конечное положительное целое (для standard не больше 1000) |
| Неизвестный или несовместимый source | typed error + действие исправить настройку | урок не создаётся |

Отсутствующий source считается отсутствием прежнего явного выбора; сохранённые `ru-standard`/`ru-personal` не мигрируются молча. Raw JSON для `limit` проверяется до fallback/clamp: 0, отрицательные, дробные, `NaN`, `Infinity`, нечисловые и значения выше фактического пула дают typed validation error, а не скрытый `1000`. Для EN и остальных языков сохранённый RU source остаётся dormant и эффективно используется штатный источник; русский массив никогда не возвращается. Эта таблица проверяется в Settings/storage tests и в RU→EN→RU browser scenario.

**Gate:** deterministic tail selection доказывает доступность `нёбо`, полный personal pool равен 1232 до фильтров, короткие слова и пары `е/ё` доступны, stale A→B→A не смешивает данные.

### #6 — Адаптивный Guided

**Owners:** `packages/keybr-lesson/lib/guided.ts`, `packages/keybr-lesson/lib/lesson.ts`, `packages/keybr-lesson/lib/text/fragment.ts`/`words.ts`, existing `Dictionary`/text generators, `packages/page-practice/lib/practice/state/lesson-state.ts`/`Controller.tsx`, `packages/page-practice/lib/settings/lesson/LessonPreview.tsx`, Guided settings/explainer and focused tests.

1. Передавать в Guided типизированную source policy (`naturalWordLimit: 1000 | null`), не сравнивать строковый id внутри алгоритма; `wordListSize` к Guided не применяется. Сохранить `update()`/unlock/recover/target/focus и физическую раскладку; добавить standard-vs-personal cap tests.
2. Убрать отсечение первых 1000 только для personal. Personal candidates строятся в порядке corpus → layout/included/focused filters → source policy; без скрытых весов/квот.
3. Оставить правило `>2` для Guided и `naturalWords=false` только pseudo model, минимум 3 code points, included letters и focus. Один общий validator/attempt budget покрывает direct pseudo и natural fallback: invalid/empty/short/closed/non-focus results считаются попытками; natural fallback — максимум 15 успешных дополнений и отдельный конечный лимит попыток. При невозможности возвращается единый `LessonUnavailable` с `origin`, `fallbackUsed`, `reason` и локализованным действием, а не `?`; censor budget из #4 не обходится вторым wrapper.
4. Провести единый `LessonGenerationResult = StyledText | LessonUnavailable` через `Lesson.generate`/`fragment`, `LessonState`, `Controller` и `LessonPreview`: начальная генерация/reset/skip показывают понятное состояние с полями `origin/fallbackUsed/reason` и действиями «снять фильтр/настройки/Word List», а Books/Custom/Code/Numbers сохраняют прежнее поведение. Объяснить в UI разницу строгого Word List и адаптивного Guided, правило коротких слов, counts и причину fallback; обновить ru/en через штатный translation flow. Переписать старые тесты, ожидающие `?`, и filter-aware fixtures/real asset использовать для closed keys/weak `ё`. Добавить deterministic tests для 0/1/14/15/>1000, naturalWords=false, one-word, hyphen-null и невозможного фильтра с timeout.

**Gate:** хвост personal достижим, standard semantics не изменились, нет зависаний/ложного `?`, adaptive focus подтверждён реальным asset.

### #7 — Сквозная приёмка и передача

**Owners:** существующий Node/TypeScript toolchain, доступный browser tool (на текущем хосте — CUA/Playwright capability) или минимальный временный smoke-script без нового framework, `docs/windows-local-runbook.md` и machine-readable evidence в `.tmp/.codex/` (путь добавляется в `.gitignore`).

1. До профильного review выполнять только characterization/focused checks и сохранить baseline artifact только для реально выполненных проверок. После чистого review-loop выполнить фактический verification set: через проверенный PowerShell wrapper с явными `NODE_ENV`, `DATABASE_CLIENT=sqlite`, уникальными file-backed `DATABASE_FILENAME`/`DATA_DIR` и проектным TS loader запустить `npm run compile`, `npm run lint`, `npm run stylelint`, `npm run build-dev`, `npm run build`, `npm test`; не ссылаться на отсутствующий alias `npm run verify` и не считать сырые POSIX `env`-скрипты Windows-командой. `preExisting` разрешён только при неизменном baseline artifact; иначе статус `unverified`/`environment`, а gate не проходит.
2. Для browser acceptance использовать доступный CUA/Playwright capability без установки новой зависимости; зафиксировать profile path и fixture/seed в `.tmp/.codex/browser/`, selectors, allowlist `http://localhost:3000` и loopback WS `localhost:3001`, bounded timeout, network capture и redaction. Последовательность build/evidence: `build-dev` → dev browser scenarios → остановка; затем `build` → production scenarios в свежем context без cache/service worker. Санитизированное окружение задаёт dummy `AUTH_*`/`PADDLE_*`, уникальные file-backed SQLite и `DATA_DIR`. Сценарии: свежий personal profile; Word List с хвостом/`ё`; Guided weak-`ё`; reload + успешные `PUT /_/sync/settings` и `POST /_/sync/data` + server restart + browser reopen; corpus update с old/new manifest/model hashes и backup/restore test copy; свежий dev/prod context с блокировкой внешних запросов; loopback/foreign-service negative smoke. Browser-wide offline flag не использовать без разрешения localhost.
3. Сформировать top-level envelope JSON/Markdown evidence (`schemaVersion`, commit SHA, tool versions, corpus/model identity/hash/count, network summary, mandatory check matrix и список непройденных проверок) и records. Каждая запись обязана иметь `checkId`, `issue`, `status` (`passed|failed|skipped|blocked|unverified`), `evidenceType`, `failureClass` (`none|null|preExisting|newRegression|environment|harness`), expected/observed, command (nullable для manual), exitCode (nullable для manual), durationMs, timeoutMs, artifactPath (nullable), traceability к section и reason для `skipped/notApplicable`. Gate проходит только если каждый обязательный check имеет `passed`; `failed|blocked|unverified` и `skipped` без `mandatory=false` и reason не маскируются. Не сохранять секреты, cookies, login URL/token, нажатия или полный пользовательский текст.
4. Перед stop/restart дождаться конкретных успешных sync responses и независимо проверить durable server files/DB и browser storage; backup/restore должен фиксировать список файлов, checksum и восстановление в новый test root. Обновить `README.md` и `docs/windows-local-runbook.md` фактическими install/build/test/start/stop/backup/restore командами и ограничениями, включая hardware/native-freeze: автоматический ввод `ё` не доказывает физическую Windows-раскладку. Локальный handoff bundle = commit/status, runbook, evidence, команды/версии и blockers; публикация/комментарии в GitHub issues отложены до отдельного запроса пользователя.

**Gate:** все критерии #1–#7 покрыты focused test или реальным browser/manual evidence; локальная тренировка проходит без внешнего интернета после сборки.

## Рабочий цикл и проверки

1. До каждого этапа: `git status`, diff и проверка сохранности пользовательских файлов; не использовать destructive reset/clean/force push.
2. На этапе: сначала characterization/regression и узкие тесты, затем минимальная правка и повторная focused-проверка. Полный verification set не запускать до профильного review.
3. После завершения реализации #2–#7: запустить read-only review субагентами по security/data, corpus/model, loaders/lessons и acceptance; каждое finding самостоятельно подтвердить или отклонить, исправлять только подтверждённое у canonical owner и повторять review-loop до отсутствия новых findings.
4. Только после чистого review: полный verification set из пункта #7 (compile/typecheck, lint/stylelint, dev/prod builds, isolated full tests и browser acceptance), исправление технических ошибок и повтор до зелёного результата. После успешного verification set сделать итоговый commit в этой же ветке.

## Ограничения и условия остановки

- Не публиковать, не push/merge/PR и не менять GitHub issues без отдельного запроса.
- Не раскрывать реальные `.env`, токены, пользовательский текст или runtime logs. Backup выполнять только на остановленном test copy.
- `.tmp/.codex/` и browser/runtime evidence должны быть явно исключены из Git; local handoff bundle не содержит cookies, login URL/token, HAR с секретами или полный пользовательский текст.
- Если корректное исправление требует выбрать новую бизнес-логику, user-facing behavior или incompatible contract, остановиться перед этим выбором и вынести варианты с рекомендацией; обычные технические ошибки исправлять самостоятельно.
- Если окружение не позволяет доказать browser/offline/hardware-поведение, явно отметить непроверенное состояние, не выдавать статический тест за runtime evidence.

## Definition of done

Рабочая ветка содержит плановый и итоговый commits, единый personal source/model contract, проверенные локальные запуск и сохранность, полный Word List, адаптивный Guided с `ё`, сохранённые штатные режимы, focused/review/full verification evidence и точный Windows-runbook. Никакой новый контур не добавлен без доказанного acceptance-блокера.
