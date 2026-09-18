# Локальный запуск и приёмка Keybr в Windows

Этот runbook предназначен для личной копии `keybr-for-me`. Он использует
только loopback и отдельный временный профиль для проверок. Команды не должны
получать путь к реальному профилю пользователя, если явно не выполняется
обычный рабочий запуск без параметров тестовой изоляции.

## Предварительные условия

- Windows 11, PowerShell 7 (`pwsh`), Node.js 24 и npm из репозитория.
- Рабочее дерево находится в доверенном локальном каталоге.
- Для локальной тренировки интернет не нужен после сборки; установка
  зависимостей и загрузка исходного репозитория выполняются отдельно.

После получения копии установите зависимости воспроизводимо:

```powershell
npm ci
```

Чистая установка обновляет Windows-обёртки `tstest` после изменений toolchain.

## Изолированная техническая проверка

Не запускайте полный `npm test` против `.env` пользователя: серверные тесты
создают и очищают временные каталоги. Запускайте проверенный wrapper:

```powershell
pwsh -NoLogo -NoProfile -File .\tools\verify-keybr.ps1
```

Wrapper задаёт уникальные file-backed `DATA_DIR` и SQLite в `%TEMP%`, dummy
локальные credentials, `SERVER_HOST=127.0.0.1`, запускает проверку canonical
personal corpus/model, compile, lint, stylelint, dev/prod build и полный test.
JSON-результат находится в `.tmp/.codex/verify-*/verification.json`, а stdout и
stderr — в соседних `*.stdout.log`/`*.stderr.log`; этот каталог исключён из Git.
Без `-BrowserEvidencePath` wrapper намеренно
оставляет manual checks как `unverified` и завершается с ошибкой: технический
прогон не заменяет browser acceptance. После записи обезличенных ручных записей
запустите его повторно:

```powershell
pwsh -NoLogo -NoProfile -File .\tools\verify-keybr.ps1 `
  -BrowserEvidencePath .\.tmp\.codex\browser\browser-evidence.json
```

Только когда все обязательные записи имеют `passed`, gate проходит.

В JSON не должны попадать cookies, login URL/token, HAR, полный введённый текст
или реальные пользовательские данные. `DATA_DIR` из результата wrapper можно
использовать только для диагностики этой проверки; после неё его следует удалить
обычной проверенной очисткой временного каталога.

## Безопасный запуск локального сервера

Перед каждым запуском соберите актуальные assets. Первый dev-прогон выполняется
так:

```powershell
npm run build-dev
```

Для обычного личного запуска, использующего настроенный `.env`, выполните:

```powershell
pwsh -NoLogo -NoProfile -File .\tools\launch-keybr.ps1 -Action Start
pwsh -NoLogo -NoProfile -File .\tools\launch-keybr.ps1 -Action Status
# После завершения работы:
pwsh -NoLogo -NoProfile -File .\tools\launch-keybr.ps1 -Action Stop
```

Launcher перед DB-операциями проверяет свежие build-файлы, владельца процесса,
оба listener-а и loopback. Он не должен останавливать чужие процессы или
выполнять provisioning при занятом/подменённом порте. HTTP использует
`http://localhost:3000`, WebSocket — `localhost:3001`.

Старый `server.json` без `runtimeRoot` может использоваться только в штатном
профиле, но state без `processStartedAtUtc` намеренно считается устаревшим и
не даёт права остановить процесс по приблизительному времени. Перед ручным
удалением такого state сначала проверьте PID и listener-ы командами ниже.

Для browser acceptance используйте отдельный browser profile/context, созданный
только для этой проверки, а также отдельный профиль данных:

```powershell
$env:AUTH_GOOGLE_CLIENT_ID = "id"
$env:AUTH_GOOGLE_CLIENT_SECRET = "secret"
$env:AUTH_MICROSOFT_CLIENT_ID = "id"
$env:AUTH_MICROSOFT_CLIENT_SECRET = "secret"
$env:AUTH_FACEBOOK_CLIENT_ID = "id"
$env:AUTH_FACEBOOK_CLIENT_SECRET = "secret"
$env:PADDLE_API_KEY = "apiKey"
$env:PADDLE_SECRET_KEY = "secretKey"
$env:PADDLE_TOKEN = "0"
$env:PADDLE_PRICE_ID = "0"
$env:GOOGLE_TAG_MANAGER_ID = "0"
$env:CLOUDFLARE_ANALYTICS_ID = "0"
$env:COOKIEBOT_CLIENT_ID = "0"
$env:MAIL_DOMAIN = "example.invalid"
$env:MAIL_KEY = "disabled-for-local-acceptance"
$acceptanceRoot = Join-Path $env:LOCALAPPDATA ("keybr-acceptance-" + [guid]::NewGuid().ToString("N"))
$dataRoot = Join-Path $acceptanceRoot "data"
$runtimeRoot = Join-Path $acceptanceRoot "runtime"
pwsh -NoLogo -NoProfile -File .\tools\launch-keybr.ps1 -Action Start `
  -DataRoot $dataRoot -RuntimeRoot $runtimeRoot
pwsh -NoLogo -NoProfile -File .\tools\launch-keybr.ps1 -Action Status `
  -RuntimeRoot $runtimeRoot
```

`-DataRoot` остаётся внутри профиля Windows, а SQLite по умолчанию создаётся
как `database.sqlite` внутри него. `-RuntimeRoot` отделяет state/logs launcher-а
от `%LOCALAPPDATA%\keybr-local`. Перед стартом убедитесь, что порты 3000/3001
свободны; при обнаружении чужого listener-а остановитесь и не завершайте его.

Проверка listener-ов:

```powershell
Get-NetTCPConnection -State Listen |
  Where-Object LocalPort -in 3000,3001 |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

Ожидаются только `127.0.0.1`/`::1` и процессы текущего launcher-а.

Launcher открывает одноразовый login handoff в браузере по умолчанию. Поэтому
до `Start` выберите dedicated browser profile/context, не используйте основной
профиль Chrome/Edge и не сохраняйте URL handoff или cookie. CUA/Playwright
может продолжить этот открытый context; сам token в evidence не записывается.

## Минимальный browser-сценарий #7

Работайте в свежем dedicated browser context и сохраняйте только обезличенные
records в `.tmp/.codex/browser/browser-evidence.json`. Для каждого из восьми
mandatory IDs создайте отдельный существующий текстовый artifact ниже
`.tmp/.codex/browser/` с именем `<checkId>.json` (например,
`browser-dev.json`). Record обязан содержать все поля `checkId`, `issue`,
`status`, `evidenceType`, `failureClass`, `mandatory`, `expected`, `observed`,
`command`, `exitCode`, `durationMs`, `timeoutMs`, `artifactPath`,
`traceability` и `reason`; для ручных действий `command` и `exitCode` равны
`null`. Wrapper отклоняет secrets, HAR, абсолютные `artifactPath` и
отсутствующие artifacts; profile/fixture/selectors/networkSummary должны быть
обезличенными строками без пользовательских путей.
Итоговый envelope также содержит `mandatoryMatrix` и `nonPassedChecks`;
канонические статусы — `passed|failed|skipped|blocked|unverified`, и любой
mandatory status кроме `passed` блокирует gate. `skipped` допустим только с
`mandatory=false` и непустым `reason`; для обязательных восьми IDs он всегда
останавливает gate.

1. Откройте `/ru` через login handoff launcher-а и проверьте, что загружены
   локальные assets без необъяснимой ошибки; record `browser-dev` (в этот же
   artifact входят Word List и Guided subchecks из следующих двух пунктов).
2. В настройках выберите личный русский источник и `Word List` → `All words`.
   Проверьте отображаемые 1232 слова, короткие слова, хвост `нёбо`, пары
   `все/всё` и отдельное поведение `ё`; в настоящем уроке корректный ввод `ё`
   принимается, а `е` вместо ожидаемой `ё` считается ошибкой. Список не должен
   получать псевдослова.
3. В `Guided` проверьте начальный, промежуточный и полный набор букв, слабую
   `ё`, сохранение adaptive focus и объяснение bounded fallback/unavailable.
   Для record укажите fixture/seed или честно поставьте `unverified`, если
   weak-`ё` не удалось воспроизвести. Не объявляйте автоматический key event
   доказательством физической Windows-клавиши `ё`.
   Перед проверками restart один раз определите helper для обезличенного
   манифеста данных:

   ```powershell
   function Get-DataManifest($root) {
     Get-ChildItem -LiteralPath $root -Recurse -File -Force |
       Where-Object Name -ne ".keybr-data-profile.json" | ForEach-Object {
       [pscustomobject]@{
         RelativePath = [IO.Path]::GetRelativePath($root, $_.FullName)
         Length = $_.Length
         SHA256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
       }
     } | Sort-Object RelativePath
   }
   ```

4. После изменения settings и завершения урока дождитесь конкретных
   `PUT /_/sync/settings = 204` и `POST /_/sync/data = 204`. Затем сделайте
   reload и проверьте настройки, историю и профиль; record `reload-restart`
   должен содержать sanitized network summary, names/counts browser storage без
   значений и `Get-DataManifest $dataRoot` с hash/size для SQLite,
   `-wal`/`-shm` и `user_stats`/`user_settings`.
5. Остановите только свой launcher, запустите его снова с теми же
   `-DataRoot`/`-RuntimeRoot`, закройте и откройте browser context. История и
   настройки должны сохраниться; этот restart входит в тот же record.
6. После dev-сценария выполните `Stop`, затем production-сборку и новый запуск:

   ```powershell
   pwsh -NoLogo -NoProfile -File .\tools\launch-keybr.ps1 -Action Stop `
     -DataRoot $dataRoot -RuntimeRoot $runtimeRoot
   npm run build
   pwsh -NoLogo -NoProfile -File .\tools\launch-keybr.ps1 -Action Start `
     -DataRoot $dataRoot -RuntimeRoot $runtimeRoot -NodeEnvironment production
   ```

   Используйте новый browser context без cache/service worker и record
   `browser-prod`; завершите короткий урок и проверьте результат/профиль после
   нового открытия. Для offline-проверки блокируйте внешние origin-ы адресно,
   оставляя разрешёнными `http://localhost:3000`, `ws://localhost:3001` и
   локальные `/assets/*`. Browser-wide offline режим не используйте: он
   блокирует нужный loopback; record `offline-local-only` фиксирует allowlist и
   ожидаемые blocked third-party requests (CDN/OAuth/Paddle/analytics/external
   keybr), а также успешные local font/assets requests.
7. Проверьте смену `RU personal → standard → personal` и `RU → EN → RU`, а
   также old/new manifest/model hashes на отдельной test copy. Не смешивайте
   эти records с рабочим профилем; сохраните их как `source-switch` и
   `corpus-update`; record должен содержать пары old/new SHA-256 для manifest,
   personal TXT и model bytes.
   Для `corpus-update` работайте только в отдельной disposable-копии checkout
   без `.env` пользователя. Базовый safety-сценарий: сохраните
   `Get-FileHash` для manifest, personal TXT и model как before artifact,
   измените только копию personal JSON,
   выполните `npm --workspace @keybr/generators run check-personal` и убедитесь,
   что команда завершается с ошибкой до записи, а старые TXT/model hashes не
   меняются; после отказа сохраните такой же after artifact. Это ожидаемый
   fail-closed record. Если отдельно проверяется
   принятый новый corpus version, в disposable-копии сначала согласованно
   обновите immutable personal constants и manifest, затем выполните
   `generate-personal`, `generate-personal-model`, `check-personal`, `npm run
   build-dev` и снова снимите hashes. До запуска скопируйте baseline history
   только в новый test `DataRoot` через backup/restore procedure и сравните
   sanitized result-count/hash before/after. Запустите копию с новым
   `-DataRoot`, проверьте новый source/model и сохранение baseline history,
   после чего удалите только эту disposable-копию. Рабочий checkout и штатные
   assets не изменяйте.
8. Для backup/restore остановите тестовый сервер, затем используйте только
   явно созданные каталоги:

   ```powershell
   pwsh -NoLogo -NoProfile -File .\tools\launch-keybr.ps1 -Action Stop `
     -DataRoot $dataRoot -RuntimeRoot $runtimeRoot
    $backupRoot = Join-Path $acceptanceRoot "backup"
    $restoreRoot = Join-Path $acceptanceRoot "restore"
    $backupDataRoot = Join-Path $backupRoot "data"
    New-Item -ItemType Directory -Path $backupDataRoot,$restoreRoot -Force | Out-Null
    Get-DataManifest $dataRoot |
     Export-Csv -LiteralPath (Join-Path $backupRoot "before.csv") -NoTypeInformation
   Get-ChildItem -LiteralPath $dataRoot -Force | ForEach-Object {
     if ($_.Name -ne ".keybr-data-profile.json") {
       Copy-Item -LiteralPath $_.FullName -Destination $backupDataRoot -Recurse -Force
     }
   }
   Get-ChildItem -LiteralPath $backupDataRoot -Force | ForEach-Object {
     Copy-Item -LiteralPath $_.FullName -Destination $restoreRoot -Recurse -Force
   }
   [ordered]@{
     schemaVersion = 1
     repoRoot = (Resolve-Path .).Path
     profilePath = (Resolve-Path $restoreRoot).Path
     role = "-DataRoot"
     createdAtUtc = (Get-Date).ToUniversalTime().ToString("o")
   } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $restoreRoot ".keybr-data-profile.json") -Encoding UTF8 -NoNewline
   Get-DataManifest $restoreRoot |
     Export-Csv -LiteralPath (Join-Path $backupRoot "restored.csv") -NoTypeInformation
   $differences = @(Compare-Object (Import-Csv (Join-Path $backupRoot "before.csv")) `
     (Import-Csv (Join-Path $backupRoot "restored.csv")) `
     -Property RelativePath,Length,SHA256)
   if ($differences.Count -gt 0) {
     $differences | Format-Table | Out-Host
     throw "Backup and restored data manifests differ."
   }
   pwsh -NoLogo -NoProfile -File .\tools\launch-keybr.ps1 -Action Start `
     -DataRoot $restoreRoot -RuntimeRoot $runtimeRoot
   # Проверьте историю в browser, затем остановите только этот test profile.
   pwsh -NoLogo -NoProfile -File .\tools\launch-keybr.ps1 -Action Stop `
     -DataRoot $restoreRoot -RuntimeRoot $runtimeRoot
   ```

   Сверьте `before.csv`/`restored.csv`, включая SQLite `database.sqlite`, `-wal`
   и `-shm`, если они существуют, затем запустите сервер с новым `$restoreRoot`
   и проверьте историю; record `backup-restore`. Реальный профиль не удаляйте
   и не перезаписывайте.
9. Для `negative-launcher` отдельно зафиксируйте foreign service/занятый порт
   и ранний exit: launcher должен завершиться до provisioning, не менять
   sentinel/data root и не останавливать чужой процесс. После проверки верните
   только собственный test profile в рабочее состояние. Для занятого порта
   можно поднять только свой временный fixture и обязательно закрыть его:

   ```powershell
   foreach ($foreignPort in @(3000,3001)) {
     $foreign = Start-Process -FilePath node.exe -ArgumentList @(
       "-e", ("require('http').createServer((req,res)=>res.end('keybr')).listen({0},'127.0.0.1')" -f $foreignPort)
     ) -PassThru
     try {
       $ownsPort = $false
       for ($attempt = 0; $attempt -lt 40; $attempt++) {
         $ownsPort = @(Get-NetTCPConnection -State Listen -LocalPort $foreignPort -ErrorAction SilentlyContinue |
           Where-Object OwningProcess -eq $foreign.Id).Count -gt 0
         if ($ownsPort) { break }
         Start-Sleep -Milliseconds 250
       }
       if (-not $ownsPort) { throw "Foreign fixture did not bind port $foreignPort." }
       $before = @(Get-ChildItem -LiteralPath $dataRoot -Recurse -File -Force |
         Get-FileHash -Algorithm SHA256)
       & pwsh -NoLogo -NoProfile -File .\tools\launch-keybr.ps1 -Action Start `
         -DataRoot $dataRoot -RuntimeRoot $runtimeRoot
       $launchExit = $LASTEXITCODE
       if ($launchExit -eq 0) {
         throw "Launcher unexpectedly accepted a foreign listener on $foreignPort."
       }
       $after = @(Get-ChildItem -LiteralPath $dataRoot -Recurse -File -Force |
         Get-FileHash -Algorithm SHA256)
       if (($before | ConvertTo-Json -Compress) -ne ($after | ConvertTo-Json -Compress)) {
         throw "Foreign-listener rejection changed the test data root."
       }
     } finally {
       Stop-Process -Id $foreign.Id -Force -ErrorAction SilentlyContinue
     }
   }
   ```

## Evidence envelope

Итоговый локальный JSON (`verification.json` после merge wrapper-а и browser
records) должен содержать `schemaVersion`, commit SHA, dirty/status state, версии
инструментов, corpus/model id+hash+count, network summary и записи с
`checkId`, `issue`, `status`, `evidenceType`, `failureClass`, expected/observed,
command, exit code, duration/timeout, artifact path и traceability. Для ручных
browser-проверок `command` и `exitCode` могут быть `null`. Обязательные checks
со статусом `failed`, `blocked` или `unverified` не маскируйте как пропущенные.

Минимальная форма файла `.tmp/.codex/browser/browser-evidence.json` (commit,
`worktreeDirty` и `worktreeFingerprint` должны совпадать с текущим checkout):

```json
{
  "schemaVersion": 1,
  "commit": "<current git rev-parse HEAD>",
  "worktreeDirty": true,
  "worktreeFingerprint": "<current verification fingerprint>",
  "checks": [
    {
      "checkId": "browser-dev",
      "issue": "#7",
      "status": "passed",
      "evidenceType": "browser-manual",
      "failureClass": "none",
      "mandatory": true,
      "expected": "Fresh dev context loads local personal practice.",
      "observed": "Sanitized summary; no token, cookie or full text.",
      "command": null,
      "exitCode": null,
      "durationMs": 0,
      "timeoutMs": 120000,
      "artifactPath": ".tmp/.codex/browser/browser-dev.json",
      "traceability": "docs/personal-keybr-execplan.md:#7.2",
      "reason": null
    }
  ]
}
```

Создайте аналогичные records для `browser-prod`, `reload-restart`,
`offline-local-only`, `source-switch`, `corpus-update`, `backup-restore` и
`negative-launcher`; wrapper добавит
отсутствующие IDs как `unverified` и не даст скрыть незавершённый gate.

## Резервная копия и восстановление

Рабочие результаты и настройки находятся в `DATA_DIR` (SQLite, `user_stats`,
`user_settings`, `sessions`, `highscores.json`). Состояние и логи launcher-а
находятся отдельно в `%LOCALAPPDATA%\keybr-local` либо указанном
`-RuntimeRoot`; это разные объекты backup. Копирование выполняйте только после
остановки тестового сервера и восстанавливайте только в новый test root.

Не публикуйте `.env`, tokens, cookies, login URL, HAR или пользовательский
текст. Не используйте `taskkill` для чужих `node.exe`; остановка допустима
только для процесса, подтверждённо принадлежащего этому launcher-у.
