# ExecPlan: английские предложения с переводом и предпочтением слабых букв

## Статус и исходная точка

План реализации для ветки `codex/english-suggestion-mode`. Основан на чтении ветки `personal` репозитория `vitalcc55/keybr-for-me`, HEAD `fe09b955da74dd3f025ae15dda5c7091131f6c32` от 18 сентября 2026 года. Проверка источников и baseline выполнены 22 сентября 2026 года.

Перед реализацией сверить фактический HEAD, рабочие изменения, `AGENTS.md` и `docs/personal-keybr-execplan.md`. Не откатывать более новые изменения ради соответствия этому документу. Существующие инструкции репозитория о сохранности данных и проверках остаются действующими.

### Baseline и журнал решений

- Фактический HEAD перед началом: `fe09b955da74dd3f025ae15dda5c7091131f6c32`; рабочее дерево содержало только этот новый plan-файл.
- Целевые baseline-тесты (`@keybr/content`, `@keybr/content-words`, `@keybr/generators`, `@keybr/lesson`, `@keybr/lesson-loader`, `@keybr/page-practice`, `@keybr/settings`, `@keybr/result`) завершились с кодом `0` в отдельном временном `DATA_DIR`/SQLite. Полный `verify` до review не запускался.
- Зафиксированные SHA-256 исходных ресурсов: `words-ru.json` — `3336CB51AB37AFEC91CF1D6F7FB15701865786FA7D7C424DD5C39E47E639C9DC`; `words-ru-personal.json` — `089F0B016F023D122AC60931FAE9155A3C9AFC41982910F67349BA5E98ADFCF8`; `words-ru-personal.manifest.json` — `4B056D6033ABECD42C46641912E093FB125D4C209D516FCCEC7663426D45FFF4`; `model-ru.data` — `4A00F67FDD15AB254D37900C80790BC21E78ABC4CC3FF2EFE2CA1EA5E83FAD83`; `model-ru-personal.data` — `4E61920649F88AC848EA3EF0428619A8952D1841C26E771699DFD7216A3F19D0`.
- Плановый путь `docs/plans/keybr-english-sentences-execplan.md` является каноническим для этой задачи; второй документ с тем же содержанием в `docs/english-sentences-execplan.md` не создаётся.
- ManyThings на дату проверки сообщает 536124 исходных пар и формат `English<TAB>Other language<TAB>Attribution`; это число источника, не обещание итогового числа записей. Для публично распространяемого результата сохранять provenance/attribution Tatoeba/ManyThings и лицензионное ограничение CC BY 2.0 FR; точные encoding, ID tie-break и итоговые counts подтверждать на фактическом архиве.

База для ссылок на проверенный код:
https://github.com/vitalcc55/keybr-for-me/tree/fe09b955da74dd3f025ae15dda5c7091131f6c32

## 1. Концепция для пользователя

На существующей главной странице при английском языке тренировки появляется переключатель «Предложения с переводом». При выключенном переключателе работает прежний выбранный режим. При включённом остаются прежние поле ввода, клавиатура, исправление ошибок, горячие клавиши, скорость, точность и история. Меняется материал: вместо отдельных слов — целые английские фразы, под ними — готовый русский перевод.

Например, учебный экран может показывать:

> Could you pick me up after work?
>
> Можешь забрать меня после работы?

Пример иллюстративный, не утверждение о конкретной записи корпуса.

Пользователь печатает только английский текст. Перевод виден сразу, не участвует в проверке и не влияет на правильность ответа. Когда для обычной длины урока нужны несколько фраз, приложение показывает несколько целых фраз и их переводы в том же порядке. Соседние строки корпуса не выдаются за связный диалог.

Все буквы доступны с первого задания. Это не означает, что все они освоены: показатели остаются реальными. Если буква `r` по существующей статистике набирается медленно, приложение чаще выбирает готовые предложения с `r`. Другие буквы не запрещаются. После завершённого задания стандартная статистика обновляется, и приоритет может перейти к другой букве.

После переключения на русский новый режим не действует. Возвращение к английскому восстанавливает английский переключатель. Старый выбранный тип урока не перезаписывается.

## 2. Зафиксированные решения и границы

| Область             | Решение                                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Назначение          | Локальная персональная тренировка печати на английских фразах с русским переводом                                                  |
| Источник            | Один корпус: ManyThings `rus-eng.zip`, готовые пары из Tatoeba                                                                     |
| Поддерживаемый язык | Существующие `Language.EN` и `Language.EN_GB`, независимо от языка интерфейса                                                      |
| Включение           | Новый boolean `lessonProps.sentences.enabled`, default `false`                                                                     |
| Старый режим        | `lessonProps.type` при включении/выключении предложений не изменяется                                                              |
| Прогресс            | Общие `Result`, `Progress`, `KeyStatsMap`, `Target`, история по существующему семейству раскладки                                  |
| Доступность букв    | `LessonKeys.includeAll(...)`                                                                                                       |
| Адаптация           | Выбор слабой буквы по текущему `confidence`; мягкий приоритет предложений, содержащих её                                           |
| Пропорция           | 80% попыток выбора — из подмножества со слабой буквой; 20% — из общего подходящего пула                                            |
| Формат результата   | Существующий `TextType.NATURAL`; без новой схемы статистики                                                                        |
| Длина               | Существующая настройка длины урока, сборка только из целых записей                                                                 |
| Ввод                | Прежний `TextInput`, его настройки, обработка событий и `makeStats`                                                                |
| Перевод             | Неизменяемая часть текущего задания, отдельная от печатаемого текста                                                               |
| Новые пакеты        | Не нужны: использовать существующие пакеты, отдельный модуль предложений внутри `@keybr/content-words`                             |
| Исключено           | LLM, перевод на лету, проверка знания английского, FSRS/Anki, уровни CEFR, карточная БД, аудио, новый сервер, новый test framework |

Число 80/20 — выбранная настройка поведения, не научно установленный оптимум. Отдельную настройку этой пропорции в интерфейс не добавлять. Общий пул также может содержать слабую букву, поэтому фактическая доля таких фраз может быть выше 80%.

## 3. Откуда берём фразы

Страница источника: https://www.manythings.org/anki/
Архив: https://www.manythings.org/anki/rus-eng.zip

На проверенной странице указаны обновление 13 февраля 2026 года и 536 124 англо-русские пары. Формат строки: английский текст, TAB, перевод, TAB, сведения об источнике. Это исходное количество пар, не обещание такого же количества уникальных фраз после обработки. Источник предупреждает о возможных ошибках; это не специально размеченный курс бытовых идиом. Сведения Tatoeba/ManyThings требуют сохранять provenance и attribution при распространении; используемое лицензионное ограничение — CC BY 2.0 FR. Не утверждать полноту Tatoeba, CEFR, диалоговую связность или гарантированное качество перевода.

Рабочее решение: скачать архив один раз при подготовке данных, распаковать штатными средствами Windows, передать импортёру именно архивный `rus.txt` и его SHA-256 `1534e267976f43ae97e966d2ac9dc1e9128fdd0efdf08eceee21cd88ff20682c`. Во время тренировки обращаться только к локальным собранным файлам. Другие корпуса, словари и переводчики в первую реализацию не подключать. Техническая граница provenance для этой реализации — сохранять исходную attribution-строку и сведения о CC BY 2.0 FR в manifest/исходном материале; новая ревизия источника требует явного обновления версии/контракта, а юридическая оценка конкретного распространения остаётся отдельным решением владельца проекта.

### Подготовка данных

Импортировать весь пригодный пул, не первые N строк: исходная подборка отсортирована по длине. Не ограничивать корпус первым коротким фрагментом файла. Большие generated JSON и attribution sidecar не коммитить: они являются локальными производными и явно перечислены в `.gitignore`; tracked manifest содержит reconstruction hashes и counts.

Нормализация ограничена типографикой: NFC, пробелы, прямые апострофы и кавычки вместо типографских, согласованная замена длинных тире и многоточий. Регистр, сокращения, отрицания и слова не менять. Не получать английскую фразу удалением неподдерживаемых символов.

Отклонять пустые/повреждённые записи, управляющие символы и неподходящий для базового корпуса английский текст. Начальная явная граница длины английской записи — 240 символов после нормализации; это технический предел, не языковой уровень. Короткие фразы сохранять и объединять при генерации задания. Русский текст не фильтровать по английской раскладке.

Удалять точные дубли. Затем группировать по нормализованному английскому тексту и оставлять один существующий русский перевод: детерминированно по исходным идентификаторам, а не случайно и не по вымышленной оценке качества. Это предотвращает увеличение вероятности выдачи фразы лишь потому, что у неё несколько переводов. Остальные варианты остаются в исходной выгрузке.

Минимальный контракт:

```ts
export type SentencePair = {
  readonly id: string;
  readonly en: string;
  readonly ru: string;
};
```

ID строить из строго разобранного английского Tatoeba ID в attribution-поле (`tatoeba:<english-attribution-id>`); строка должна содержать ровно два ID в документированном формате, иначе запись отбраковывается. При объединении дублирующего английского текста правило выбора ID также детерминировано. Исходный TSV и его сведения об авторах сохранять как исходный материал для воспроизводимости; локальный generated attribution sidecar хранит выбранные raw attribution без обязательного вывода в интерфейс.

Один импортёр создаёт локальные JSON, attribution sidecar и небольшой tracked manifest/report с URL, checksum архива и TSV, версией правил, количеством входных/выходных записей и причинами отбраковки. Не вводить вторую редактируемую копию корпуса. Повторный запуск на том же входе и архиве даёт идентичный результат; `--check` ничего не записывает. Attribution сохраняется в локальном sidecar `id -> English ID/Russian ID/raw attribution`, а runtime-пара остаётся только `{id,en,ru}`.

## 4. Границы архитектуры

```text
TSV ManyThings
  -> targeted importer в @keybr/generators
  -> локальный sentences-en-ru.json
  -> loadSentencePairs() в @keybr/content-words
  -> SentenceLesson в @keybr/lesson
  -> единое задание { text, pairs }
  -> прежний LessonState / TextInput / Result / Progress
                          |
                          +-> отдельный вывод русского перевода
```

### Ответственности

- `@keybr/content`: только общий тип `SentencePair`, без загрузчика, React и импортов большого JSON.
- `@keybr/content-words`: отдельный модуль корпуса предложений и его проверки. Не представлять предложения как `WordList`, не менять `WordListSource`, не расширять русские source/manifest/model схемы.
- `@keybr/generators`: один прямой импортёр TSV; не вызывать массовую генерацию языков или русских моделей.
- `@keybr/lesson`: выбор слабой буквы, подбор и сборка задания. Никакой новой проверки нажатий.
- `@keybr/lesson-loader`: включение источника, загрузка, отмена устаревшего ответа, состояния ошибки.
- `page-practice`: переключатель, показ перевода, сохранение единого задания при reset/skip/preview.

Отдельный модуль внутри `content-words` — осознанный минимальный выбор. Его API не смешивается с `loadWordList()`. Новый workspace и общая система источников контента для одной дополнительной функции не нужны.

## 5. Roadmap и зависимости

| Шаг | Результат                                              | Зависимости    |
| --- | ------------------------------------------------------ | -------------- |
| 0   | Проверенный baseline и границы сохранности             | Нет            |
| 1   | Тип пары, связанное задание и безопасный reset         | 0              |
| 2   | Воспроизводимый импорт, локальный корпус, lazy loader  | 1              |
| 3   | Общий выбор слабой буквы без изменения Guided          | 1              |
| 4   | SentenceLesson с мягким приоритетом                    | 2, 3           |
| 5   | Английское включение и интеграция в LessonLoader       | 4              |
| 6   | Переключатель, перевод, настройки и корректные подписи | 5              |
| 7   | Регрессии, браузерная приёмка и документация           | Все предыдущие |

Рекомендуемый порядок основного агента: 0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7. Зависимости не означают параллельные правки: по действующему AGENTS.md субагенты используются для read-only research/review, основной агент владеет изменениями и интеграцией. Тесты соответствующего слоя добавляются в его шаге, не откладываются все на конец.

## 6. Декомпозиция

### Шаг 0. Baseline

Существующие точки: `AGENTS.md`, `docs/personal-keybr-execplan.md`, `docs/windows-local-runbook.md`, `tools/verify-keybr.ps1`.

Сверить HEAD и локальный diff. Зафиксировать исходное состояние целевых тестов. Зафиксировать контрольные суммы русских штатных и персональных ресурсов. Не менять пользовательскую БД, историю, настройки профиля, launcher или модель RU. Все тесты, способные обращаться к данным, запускать в изолированных временных DATA_DIR/SQLite согласно текущим инструкциям.

Вести согласованные решения, этапы и результаты проверок в этом документе (`docs/plans/keybr-english-sentences-execplan.md`). Он описывает новую функцию и не заменяет старые инструкции проекта.

Gate: известно, что было сломано до работы; пользовательские данные не затронуты.

### Шаг 1. Контракты и целостность задания

Новые файлы:

- `packages/keybr-content/lib/sentences.ts` — тип пары.

Существующие файлы:

- `packages/keybr-content/lib/index.ts` — экспорт типа.
- `packages/keybr-lesson/lib/lesson.ts` — дополнительный успешный вариант результата и извлечение его печатаемого текста.
- `packages/page-practice/lib/practice/state/lesson-state.ts` — хранение и reset целого задания.
- `packages/page-practice/lib/settings/lesson/LessonPreview.tsx` — поддержка дополнительного результата.

Добавить узкий вариант успешного результата, например:

```ts
export type SentenceLessonText = {
  readonly kind: "sentences";
  readonly text: StyledText;
  readonly pairs: readonly SentencePair[];
};

// Существующие варианты остаются действующими.
export type LessonGenerationResult =
  | StyledText
  | SentenceLessonText
  | LessonUnavailable;
```

`text` строится из `pairs.map(pair => pair.en)` в одном месте генератора. Проверять этот инвариант тестами. Массив пар — небольшой список текущего задания, не весь корпус.

Добавить один type guard и один helper извлечения печатаемого текста для успешного результата. И LessonState, и LessonPreview используют этот helper, а не собственные несовпадающие ветки. Сам TextInput продолжает принимать прежний StyledText.

Исправить `resetLesson()`: сейчас он восстанавливает `this.textInput.text`, что теряет новую информацию. Нужно повторно использовать сохранённую `this.generation`; при reset не генерировать новые пары, не искать перевод по строке и не читать mutable `lesson.currentTranslation`.

`skipLesson()` создаёт новое задание целиком. Завершение использует существующий переход контроллера. Предпросмотр не меняет текущее задание, глобальный RNG, статистику или порядок основной тренировки. SentenceLesson.generate должен быть чистым относительно экземпляра: индекс корпуса неизменяемый, выбранные пары только в возвращаемом результате.

Тесты: строковый старый результат; структурированный результат; reset сохраняет пары; unavailable не вызывает TextInput; старые ошибки/шаги ввода не изменились; отдельный preview не влияет на основную генерацию.

Gate: старые уроки работают как раньше, путь для метаданных задания готов.

### Шаг 2. Импорт и загрузка корпуса

Новые файлы:

- `packages/keybr-generators/lib/generate-en-ru-sentences.ts`.
- `packages/keybr-content-words/lib/sentences.ts`.
- `packages/keybr-content-words/lib/data/sentences-en-ru.json` — generated, ignored by Git.
- `packages/keybr-content-words/lib/data/sentences-en-ru.attribution.json` — generated, ignored by Git.
- `packages/keybr-content-words/lib/data/sentences-en-ru.manifest.json` — tracked metadata/report.
- соседние `.test.ts` с маленькими локальными TSV/JSON fixtures.

Существующие файлы:

- `packages/keybr-generators/package.json` — targeted scripts `generate-sentences` и `check-sentences`.
- `packages/keybr-content-words/lib/index.ts` — экспорт `loadSentencePairs()` и общей проверки данных.

Референсы: `packages/keybr-generators/lib/generate-personal.ts` — прямой запуск через существующий TypeScript runtime; `packages/keybr-content-words/lib/load.ts` — динамический import JSON.

Импортёр принимает абсолютный путь к распакованному TSV. Архив распаковывается штатными инструментами Windows: не добавлять ZIP-библиотеку и сетевой загрузчик в браузер. Общая структурная проверка данных одна; ей пользуются импортёр/check и загрузчик, без двух ручных схем.

Большой JSON загружается динамически только при включении режима. Не импортировать его синхронно через barrel, не включать загрузку в обычную русскую тренировку. Ошибка загрузки должна допускать Retry; не сохранять навсегда отклонённый Promise. Внешний Интернет после подготовки корпуса и сборки не нужен; локальный сервер продолжает обслуживать файлы.

Первоначально использовать один lazy asset и измерить размер/время загрузки. Разбиение generated asset допустимо только при воспроизводимом блокере браузерной приёмки, внутри того же импортёра и загрузчика, без новой системы хранения.

Тесты: табы/CRLF/BOM; повреждённые строки; типографские апострофы; дубли EN/RU; одинаковый EN с разными RU; стабильный ID/порядок; deterministic rebuild; read-only check; отсутствие загрузки корпуса в RU.

Gate: есть реальный корпус с измеренными counts/checksum, маленькие fixtures работают без сети.

### Шаг 3. Общая механика слабой буквы

Существующие файлы:

- `packages/keybr-lesson/lib/key.ts`.
- `packages/keybr-lesson/lib/guided.ts`.
- `packages/keybr-lesson/lib/key.test.ts`, `guided.test.ts`.

Вынести небольшой чистый helper выбора минимального confidence, например `findWeakestKey(keys, mode)`, в существующий `key.ts`. Он не открывает букв, не читает React/Settings, не меняет статистику и не потребляет RNG. Сохраняет переданный порядок при равенстве оценок.

Guided вызывает helper после своей прежней логики включения букв, с исходным выбором current/best согласно `recoverKeys`. Сам unlock/recovery, порядок русских букв, порог 1 и fallback генератора не менять.

SentenceLesson будет вызывать тот же helper для всех доступных букв, но всегда по текущему `confidence`: раньше достигнутая лучшая скорость не должна навсегда исключать ухудшившуюся букву из тренировки. `null` означает отсутствие измерений и получает приоритет как в текущем подходе Guided. Для равных неизвестных букв в новом режиме использовать детерминированный частотный порядок модели. Буквы, отсутствующие во всём подходящем корпусе, не выбирать как недостижимый фокус.

Расчёт confidence остаётся у Target; не добавлять формулу «скорость × ошибки» или новый алгоритм калибровки.

Gate: характеризационные тесты Guided дают прежние результаты, включая RU personal и `ё`; один helper обслуживает оба режима.

### Шаг 4. SentenceLesson и сборка задания

Новый файл: `packages/keybr-lesson/lib/sentences.ts` и соседний `sentences.test.ts`.

Существующие файлы: `packages/keybr-lesson/lib/index.ts`, `packages/keybr-lesson/lib/text/fragment.ts`, `packages/keybr-lesson/lib/lesson.ts` при расширении unavailable origin.

`SentenceLesson` наследует существующий `Lesson`. При создании проверяет совместимость полного английского текста с фактической клавиатурой. Существующий `filterText` умеет удалять/заменять символы: нельзя принимать изменённую им строку как исходную фразу с прежним переводом. После контролируемой нормализации использовать проверку совместимости; при потере содержимого отклонять всю пару.

Подготовить неизменяемый доступный пул и индекс «буква -> индексы пар». Регистр сворачивать только для поиска букв, не для показываемого текста. Индекс строится при подготовке корпуса для раскладки, не при каждом нажатии или завершённом упражнении.

`update()`:

1. `LessonKeys.includeAll(keyStatsMap, new Target(settings))`.
2. Выбор слабой доступной в корпусе буквы общим helper по текущему confidence.
3. `lessonKeys.focus(...)`, когда такая буква есть. Другие буквы остаются included.

`generate()`:

1. Получить фокус из LessonKeys.
2. Для очередной пары с вероятностью 0.8 выбирать из подмножества с фокусом, иначе из общего пула.
3. Пустое/исчерпанное подмножество — обычный общий пул. Нет слабых букв — общий пул с самого начала.
4. Не повторять один ID внутри текущего задания. Отдельную долговременную очередь повторений не создавать.
5. Собирать полные записи до приблизительной штатной длины. Допускать превышение на последнюю целую пару, ничего не обрезать.
6. Вернуть единый объект с английским текстом и теми же парами в том же порядке.

Для DRY вынести существующую формулу длины `100 + round(lessonProps.length * 100)` в маленький helper внутри `text/fragment.ts`. Старый generateFragment продолжает работать точно как раньше. SentenceLesson использует только общий расчёт цели, а не word-stream генератор. Не применять `mangledWords`, shuffle отдельных слов, `repeatWords`, искусственную пунктуацию или удаление регистра.

Все попытки подбора конечны: установить явные лимиты выборок/числа пар, например максимум 64 добавления за задание и ограниченный бюджет повторного случайного выбора. При исчерпании специализированного пула переходить в общий; при реальном отсутствии подходящего текста возвращать existing typed unavailable, дополнив origin `sentences`. Не выводить `?` и не подставлять слова другого режима. Маленький корпус не размножать бесконечно ради целевой длины.

RNG — существующий RNGStream/LCG, без Math.random. Не хранить выбранные предложения в mutable поле Lesson. Никаких пересчётов индекса/поиска по всему корпусу в обработчике нажатия.

Тесты: управляемый RNG покрывает обе ветки 80/20; focus встречается в целевой ветке; не запрещены остальные буквы; missing stats; все буквы выше цели; best высокий/current низкий; нет фразы с фокусом; маленький/пустой корпус; неподдерживаемая раскладка; границы предложений; порядок переводов; bounded fallback; отсутствие дублей внутри блока; preview purity.

Gate: детерминированно проверены и подбор, и соответствие текста переводам.

### Шаг 5. Включение режима и история

Существующие файлы:

- `packages/keybr-lesson/lib/settings.ts`.
- `packages/keybr-lesson/lib/lesson.ts`.
- `packages/keybr-lesson-loader/lib/LessonLoader.tsx`.
- `packages/page-practice/lib/practice/state/lesson-state.ts`.

Добавить `lessonProps.sentences.enabled` и один общий helper проверки фактического режима: флаг AND язык EN/EN_GB из KeyboardOptions. Использовать его в загрузчике и интерфейсе. Язык интерфейса и раскладка операционной системы не являются условием включения.

Не добавлять `SENTENCES` в глобальный `lessonProps.type` и не хранить «предыдущий тип» во втором поле. Новый boolean — английская надстройка над сохранённым обычным режимом. Это сохраняет RU без эффектов, которые переписывают настройки при смене языка.

В LessonLoader добавить отдельную ветку для загрузки пар и создания SentenceLesson; прежний switch обычных уроков оставить. Передавать актуальный mode в identity загрузки/перемонтирования, сохранять отмену устаревших ответов, loading/error/retry. Старый текст и перевод не должны оставаться от предыдущего режима при новой загрузке. Стандартная английская фонетическая модель остаётся источником букв и статистики; создавать новую модель не нужно. Русские WordListSource/Policy не использовать как реестр предложений.

В базовом Lesson добавить getter `textType`, который для существующих уроков возвращает прежнее `settings.get(lessonProps.type).textType`. В SentenceLesson переопределить его значением `TextType.NATURAL`. В LessonState.#makeResult читать `this.lesson.textType`. Иначе при сохранённом Guided предложения ошибочно запишутся как GENERATED.

Не менять Result, его проверку, сериализацию, ResultGroups или схему БД. Практика предложений пополняет существующую английскую статистику. Сам флаг не присваивает буквам скорость; фактически набранные предложения могут повлиять на дальнейший Guided через общий progress — это согласованное поведение.

Gate: EN -> предложения -> RU -> EN работает без потери обычного режима; результат имеет правильный textType; reload сохраняет флаг; устаревший loader не подменяет новый режим.

### Шаг 6. Интерфейс без второго поля ввода

Новые файлы:

- `packages/page-practice/lib/SentenceModeSwitch.tsx`.
- `packages/page-practice/lib/SentenceTranslation.tsx` и необходимый локальный style module.
- `packages/page-practice/lib/settings/lesson/SentenceLessonSettings.tsx`.

Существующие файлы:

- `packages/page-practice/lib/practice/PracticeScreen.tsx`.
- `packages/page-practice/lib/practice/Presenter.tsx`.
- `packages/page-practice/lib/settings/LessonSettings.tsx`.
- `packages/page-practice/lib/settings/lesson/LessonPreview.tsx`.
- `packages/page-practice/lib/practice/Indicators.tsx`.
- `packages/page-practice/lib/practice/KeyExtendedDetails.tsx`.
- `packages/keybr-intl/translations/ru.json` и штатные message definitions.

Переключатель сделать существующим CheckBox или другим подходящим widget, не реализовывать новый виджет. Разместить на главной странице над зависимым от загрузки содержимым, чтобы выйти из режима можно было даже при ошибке корпуса. Использовать тот же компонент в настройках.

При активных предложениях показывать SentenceLessonSettings вместо нерелевантных настроек Guided/WordList. Переиспользовать TargetSpeedProp и LessonLengthProp. Обычные вкладки скрыть до выключения надстройки либо сделать явный переход, который выключает флаг и выбирает обычный тип; не оставлять визуально активную вкладку Guided над настройками предложений.

SentenceTranslation получает пары текущего задания, выводит только русский текст в их порядке. Не ищет перевод по строке, не загружает корпус, не хранит второй selectedId, не имеет независимого таймера. Выводить как React-текст, без dangerouslySetInnerHTML. Не вставлять русские строки в TextInput.

Presenter имеет три вида: Normal, Compact, Bare. Подключить общий небольшой wrapper для существующего поля и перевода, чтобы все виды и preview показывали одинаковые данные. Не создавать второй TextArea, Controller или новый набор обработчиков. Не переписывать Presenter целиком ради изменения.

Оставить GaugeRow, KeySetRow, CurrentKeyRow, графики, дневную цель и существующие цвета. Для нового режима добавить короткое объяснение: «Все буквы доступны; чаще тренируется слабая буква». Скрыть только LearningRateDescription с обещанием открытия следующей буквы: передать из Indicators в KeyExtendedDetails явный признак показа unlock-подсказки. Для обычных режимов default-поведение оставить прежним. Скорость и график буквы сохраняются.

Существующий Controller сбрасывает ввод при focus/blur/visibility и после 10 секунд без ввода. Эти правила не менять; проверять, что сброс сохраняет ту же пару текста и перевода. Нажатия переключателя не должны попадать в напечатанный текст.

Gate: все виды экрана работают, перевод всегда соответствует заданию, русский интерфейс совместим с английской тренировкой, нет ложных сообщений про открытие букв.

### Шаг 7. Проверки и завершение

Использовать существующий `tstest` и имеющиеся browser test environments. Не добавлять Vitest/Jest/новый E2E framework. Новые тесты расположить рядом с владельцами логики; existing fixtures для Settings/Results/keyboard/RNG переиспользовать.

Минимальная приёмка:

| Проверка                             | Требуемый результат                                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| RU, включая personal Guided          | Нет нового режима и загрузки корпуса, прежняя последовательность букв и `ё`                                     |
| EN и EN_GB                           | Переключатель доступен; обычный тип не перезаписывается                                                         |
| Начало без статистики                | Все буквы доступны, неизвестные не считаются освоенными                                                         |
| Слабая буква                         | Предпочтительная ветка выдаёт целые фразы с ней                                                                 |
| Всё выше target                      | Нет фиктивного фокуса, работает общий пул                                                                       |
| Фокусный пул исчерпан                | Конечный fallback, без зависаний                                                                                |
| Reset / Escape / blur / idle timeout | Прежнее задание и его перевод, сбрасывается только ввод                                                         |
| Skip / completion                    | Новый текст и перевод меняются вместе                                                                           |
| Preview                              | Не меняет основное задание или progress                                                                         |
| Ошибка загрузки                      | Видна ошибка, доступен retry и выход в обычный режим                                                            |
| Быстрые переключения                 | Устаревший ответ не заменяет новый экран                                                                        |
| Статистика                           | Правильный layout и NATURAL, прежняя запись/фильтрация результата                                               |
| Короткие фразы                       | Объединяются; Result.validate не ослаблен                                                                       |
| Апострофы, capitals, punctuation     | Сохранён текст, работают обычные настройки ввода                                                                |
| Normal / Compact / Bare              | Перевод читаем и соответствует текущему тексту                                                                  |
| Без внешнего Интернета               | После подготовки/сборки режим работает через тот же localhost                                                   |
| Большой корпус                       | Измерены размер, холодная загрузка, подготовка индекса и смена задания; нет обработки корпуса на каждом нажатии |

Штатный Result требует, среди прочего, минимум 10 символов и секунду набора. Не считать короткое быстрое упражнение успешно записанным вопреки existing validator.

После focused tests — профильный read-only review, исправления, затем существующий verify и browser acceptance. Предлагаемые команды после добавления scripts:

```powershell
# $InputFile и $ArchiveFile — абсолютные пути к фактически распакованному TSV и исходному архиву.
node --enable-source-maps --import @keybr/tsl .\packages\keybr-generators\lib\generate-en-ru-sentences.ts --input "$InputFile" --archive "$ArchiveFile"
node --enable-source-maps --import @keybr/tsl .\packages\keybr-generators\lib\generate-en-ru-sentences.ts --input "$InputFile" --archive "$ArchiveFile" --check

# Существующая проверка; соблюдать требования runbook к browser evidence.
pwsh -NoLogo -NoProfile -File .\tools\verify-keybr.ps1
```

Расширить существующий verify только необходимыми targeted checks и актуальным browser evidence; не создавать второй launcher/verify. Непройденные, не запущенные и исходно падавшие проверки различать в отчёте. Не подставлять фиктивное browser evidence ради green gate.

Документация: обновлять этот canonical plan `docs/plans/keybr-english-sentences-execplan.md`, кратко дополнять `docs/windows-local-runbook.md` источником данных, импортом, переключением и восстановлением после ошибки корпуса. В финальном отчёте перечислить изменения, реальные counts корпуса, проверки, ограничения и неизменность RU ресурсов.

## Progress log

- 22 сентября 2026 — baseline зафиксирован на `fe09b955da74dd3f025ae15dda5c7091131f6c32`: восемь целевых package tests прошли в изолированном `DATA_DIR`/SQLite; SHA-256 русских штатных и personal-ресурсов записаны выше. Полный `verify` намеренно отложен до review-loop.
- 22 сентября 2026 — plan добавлен отдельным коммитом `bbb5c51`; следующий кодовый этап начинается после чистой точки.
- 22 сентября 2026 — milestone 1 реализован: добавлены `SentencePair`, структурированный `SentenceLessonText`, единые guard/helper извлечения текста, polymorphic `Lesson.textType`, атомарный reset `LessonState` и совместимый `LessonPreview`. `@keybr/content`/`@keybr/lesson` compile/tests и `@keybr/page-practice` compile/tests прошли; повторный read-only review той же группы не выявил подтверждённых P0–P2. Preview purity и sentence-specific unavailable copy остаются привязанными к шагам 4–6, где появится реальный sentence path.
- 22 сентября 2026 — шаг 2 реализован: строгий UTF-8/BOM/CRLF TSV importer с полным входом, NFC/типографикой, fail-closed attribution/English-ID разбором, code-point tie-break, accounting, archive+TSV SHA-256, локальным attribution sidecar и побайтным `--check`; добавлены browser-safe validator и dynamic local loader. Фактический источник дал 536124 строк, 341135 пар, 9 exact duplicates, 194917 normalized-English duplicates и 63 отбраковки (`60` non-basic English, `3` over 240 code points). JSON (51441644 байт) и sidecar (65222457 байт) намеренно ignored; manifest tracked. `@keybr/content-words`/`@keybr/generators` compile/tests и package `check-sentences` с archive прошли.
- 22 сентября 2026 — шаг 3 реализован: чистый `findWeakestKey()` сохраняет порядок равных оценок и обслуживает Guided без изменения unlock/recovery semantics; `@keybr/lesson` compile/tests прошли.
- 22 сентября 2026 — шаг 4 реализован и повторно reviewed: `SentenceLesson` использует immutable индекс, bounded 80/20 подбор целых фраз, учитывает оставшиеся focused-пары после general выбора и возвращает atomic `text/pairs`; подтверждённых P0–P3 после review-loop нет. Preflight pinned identity, strict manifest types/counts и ignored corpus boundary проверены focused checks.
- 22 сентября 2026 — шаги 5–6 реализованы и reviewed: добавлены persisted `lesson.sentences.enabled` с EN/EN_GB predicate, local `SentenceLesson` branch с cancellation/retry, settings/practice switches, sentence-specific unavailable copy, pair-based translation для Preview и трёх видов Presenter, а также точечное подавление unlock description; обычные режимы, `lessonProps.type`, Result/DB schema и RU-корпус не изменены.
- 22 сентября 2026 — шаг 7 technical gate пройден: `corpus-model`, `compile`, `lint`, `stylelint`, `build-dev`, `build`, полный `test`, `sentences-corpus`, `node-version` и `personal-manifest` получили `passed`; 8 manual/browser checks оставлены `unverified` без подставного evidence. Ignored JSON/attribution остаются локальными.
- Следующий milestone: browser acceptance с обезличенным evidence после явной команды пользователя `готов`, затем финальный осмотр worktree и commit.

## 7. Референсы для реализации

### Основные — собственный код

Все ссылки ниже привязаны к проверенному commit, чтобы строки и поведение не менялись вместе с веткой:

- Контракт репозитория: https://github.com/vitalcc55/keybr-for-me/blob/fe09b955da74dd3f025ae15dda5c7091131f6c32/AGENTS.md
- Существующий ExecPlan: https://github.com/vitalcc55/keybr-for-me/blob/fe09b955da74dd3f025ae15dda5c7091131f6c32/docs/personal-keybr-execplan.md
- Ключи, включение всего алфавита: https://github.com/vitalcc55/keybr-for-me/blob/fe09b955da74dd3f025ae15dda5c7091131f6c32/packages/keybr-lesson/lib/key.ts
- Guided и выбор слабой буквы: https://github.com/vitalcc55/keybr-for-me/blob/fe09b955da74dd3f025ae15dda5c7091131f6c32/packages/keybr-lesson/lib/guided.ts
- Текущая модель цели: https://github.com/vitalcc55/keybr-for-me/blob/fe09b955da74dd3f025ae15dda5c7091131f6c32/packages/keybr-lesson/lib/target.ts
- Генерация фрагмента: https://github.com/vitalcc55/keybr-for-me/blob/fe09b955da74dd3f025ae15dda5c7091131f6c32/packages/keybr-lesson/lib/text/fragment.ts
- Контракт Lesson: https://github.com/vitalcc55/keybr-for-me/blob/fe09b955da74dd3f025ae15dda5c7091131f6c32/packages/keybr-lesson/lib/lesson.ts
- Статические lazy assets: https://github.com/vitalcc55/keybr-for-me/blob/fe09b955da74dd3f025ae15dda5c7091131f6c32/packages/keybr-content-words/lib/load.ts
- Загрузчик уроков: https://github.com/vitalcc55/keybr-for-me/blob/fe09b955da74dd3f025ae15dda5c7091131f6c32/packages/keybr-lesson-loader/lib/LessonLoader.tsx
- Состояние задания: https://github.com/vitalcc55/keybr-for-me/blob/fe09b955da74dd3f025ae15dda5c7091131f6c32/packages/page-practice/lib/practice/state/lesson-state.ts
- Контроллер: https://github.com/vitalcc55/keybr-for-me/blob/fe09b955da74dd3f025ae15dda5c7091131f6c32/packages/page-practice/lib/practice/Controller.tsx
- Presenter: https://github.com/vitalcc55/keybr-for-me/blob/fe09b955da74dd3f025ae15dda5c7091131f6c32/packages/page-practice/lib/practice/Presenter.tsx
- Preview: https://github.com/vitalcc55/keybr-for-me/blob/fe09b955da74dd3f025ae15dda5c7091131f6c32/packages/page-practice/lib/settings/lesson/LessonPreview.tsx
- Настройки: https://github.com/vitalcc55/keybr-for-me/blob/fe09b955da74dd3f025ae15dda5c7091131f6c32/packages/page-practice/lib/settings/LessonSettings.tsx
- Ложные для этого режима unlock-подсказки: https://github.com/vitalcc55/keybr-for-me/blob/fe09b955da74dd3f025ae15dda5c7091131f6c32/packages/page-practice/lib/practice/LearningRateDescription.tsx
- Общая статистика: https://github.com/vitalcc55/keybr-for-me/blob/fe09b955da74dd3f025ae15dda5c7091131f6c32/packages/page-practice/lib/practice/state/progress.ts
- Проверка результата: https://github.com/vitalcc55/keybr-for-me/blob/fe09b955da74dd3f025ae15dda5c7091131f6c32/packages/keybr-result/lib/result.ts
- Проверки Windows: https://github.com/vitalcc55/keybr-for-me/blob/fe09b955da74dd3f025ae15dda5c7091131f6c32/tools/verify-keybr.ps1

### Внешний референс — только организация данных

TypeWords:
https://github.com/zyronon/TypeWords/blob/master/app/core/types/types.ts
https://github.com/zyronon/TypeWords/blob/master/app/composables/practice-sentences/usePracticeSentenceSession.ts

Полезная идея — предложение, перевод и идентификатор связаны; завершение переключает целое задание. Не переносить Vue, обработку ввода, словари EN–ZH, свою статистику, карточный планировщик или session manager. Конкретная механика слабых букв берётся из keybr, не из внешнего приложения.

## Итоговый критерий

В существующем keybr появляется английская надстройка: цельные фразы с готовым русским переводом, все буквы доступны, материал чаще содержит текущую слабую букву. Ввод, ошибки, цель скорости, история и русский режим остаются в прежней системе. Новая логика ограничена источником фраз, подбором задания, его метаданными и необходимым интерфейсом.
