[CmdletBinding()]
param(
  [string]$EvidenceRoot,
  [string]$BrowserEvidencePath,
  [ValidateRange(60, 7200)]
  [int]$TimeoutSeconds = 1800
)

$ErrorActionPreference = "Stop"

if ($PSVersionTable.PSVersion.Major -lt 7) {
  throw "The verification wrapper requires PowerShell 7 or newer (pwsh)."
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$evidenceBase = [IO.Path]::GetFullPath((Join-Path $repoRoot ".tmp/.codex"))
$browserEvidenceBase = [IO.Path]::GetFullPath((Join-Path $evidenceBase "browser"))
function Assert-NoReparseAncestors {
  param([Parameter(Mandatory)][string]$Path)

  $current = [IO.Path]::GetFullPath($Path)
  while ($true) {
    if (Test-Path -LiteralPath $current) {
      if ((Get-Item -LiteralPath $current).Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) {
        throw "Evidence path '$Path' must not traverse a symbolic link or junction."
      }
    }
    $parent = [IO.Path]::GetFullPath((Join-Path $current ".."))
    if ($parent -eq $current) {
      break
    }
    $current = $parent
  }
}
function Assert-NoHardlink {
  param([Parameter(Mandatory)][string]$Path)

  $fsutilPath = Join-Path $env:SystemRoot "System32/fsutil.exe"
  if (-not (Test-Path -LiteralPath $fsutilPath)) {
    throw "Cannot verify evidence hardlink ownership because fsutil.exe is unavailable."
  }
  $links = @(& $fsutilPath hardlink list $Path 2>$null)
  if ($LASTEXITCODE -ne 0 -or $links.Count -ne 1) {
    throw "Evidence artifact '$Path' must not be a hardlink."
  }
}
Assert-NoReparseAncestors $evidenceBase
Assert-NoReparseAncestors $browserEvidenceBase
if ([string]::IsNullOrWhiteSpace($EvidenceRoot)) {
  $EvidenceRoot = Join-Path $repoRoot (".tmp/.codex/verify-{0}-{1}" -f (Get-Date -Format "yyyyMMdd-HHmmss"), [guid]::NewGuid().ToString("N"))
} else {
  $EvidenceRoot = [IO.Path]::GetFullPath($EvidenceRoot)
  if ($EvidenceRoot.StartsWith("\\") -or $EvidenceRoot.StartsWith("//") -or
      -not $EvidenceRoot.StartsWith($evidenceBase + [IO.Path]::DirectorySeparatorChar)) {
    throw "-EvidenceRoot must be a new child directory below '$evidenceBase'."
  }
  $existingEvidenceItems = if (Test-Path -LiteralPath $EvidenceRoot -PathType Container) {
    @(Get-ChildItem -LiteralPath $EvidenceRoot -Force)
  } else {
    @()
  }
  if ((Test-Path -LiteralPath $EvidenceRoot -PathType Container) -and $existingEvidenceItems.Count -gt 0) {
    throw "-EvidenceRoot must be empty when it already exists."
  }
}
Assert-NoReparseAncestors $EvidenceRoot
New-Item -ItemType Directory -Path $EvidenceRoot -Force | Out-Null

$dataRoot = Join-Path ([IO.Path]::GetTempPath()) ("keybr-verify-{0}" -f [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
$databaseFilename = Join-Path $dataRoot "database.sqlite"

foreach ($secretName in @(
    "DATABASE_PASSWORD", "MAIL_KEY", "PADDLE_TOKEN", "PADDLE_PRICE_ID",
    "GOOGLE_TAG_MANAGER_ID", "CLOUDFLARE_ANALYTICS_ID", "COOKIEBOT_CLIENT_ID",
    "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "GITHUB_TOKEN", "NPM_TOKEN",
    "OPENAI_API_KEY"
  )) {
  Remove-Item -LiteralPath ("Env:{0}" -f $secretName) -ErrorAction SilentlyContinue
}
Get-ChildItem Env: |
  Where-Object { $_.Name -match '(?i)(TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|COOKIE|AUTH_)' } |
  ForEach-Object { Remove-Item -LiteralPath ("Env:{0}" -f $_.Name) -ErrorAction SilentlyContinue }

$env:NODE_ENV = "test"
$env:DATABASE_CLIENT = "sqlite"
$env:DATA_DIR = $dataRoot
$env:DATABASE_FILENAME = $databaseFilename
$env:PUBLIC_DIR = Join-Path $repoRoot "root/public"
$env:APP_URL = "http://localhost:3000/"
$env:SERVER_HOST = "127.0.0.1"
$env:SERVER_PORT = "3000"
$env:SERVER_PORT_WS = "3001"
$env:COOKIE_DOMAIN = "localhost"
$env:COOKIE_PATH = "/"
$env:COOKIE_SECURE = "false"
$env:KNEX_DEBUG = ""
$env:AUTH_GOOGLE_CLIENT_ID = "id"
$env:AUTH_GOOGLE_CLIENT_SECRET = "secret"
$env:AUTH_MICROSOFT_CLIENT_ID = "id"
$env:AUTH_MICROSOFT_CLIENT_SECRET = "secret"
$env:AUTH_FACEBOOK_CLIENT_ID = "id"
$env:AUTH_FACEBOOK_CLIENT_SECRET = "secret"
$env:PADDLE_API_KEY = "apiKey"
$env:PADDLE_SECRET_KEY = "secretKey"
$env:GOOGLE_TAG_MANAGER_ID = "0"
$env:CLOUDFLARE_ANALYTICS_ID = "0"
$env:COOKIEBOT_CLIENT_ID = "0"
$env:PADDLE_TOKEN = "0"
$env:PADDLE_PRICE_ID = "0"

$records = [Collections.Generic.List[object]]::new()
$script:verificationBlocked = $false
$npm = $null
$git = $null
$commit = $null
$toolchainError = $null
try {
  $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
  $git = (Get-Command git.exe -ErrorAction Stop).Source
  $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
  $commit = (& $git -C $repoRoot rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or $commit -notmatch '^[0-9a-f]{40}$') {
    throw "git rev-parse HEAD did not return a valid commit SHA."
  }
} catch {
  $toolchainError = $_.Exception.Message
}

function Get-RelativePath {
  param([Parameter(Mandatory)][string]$Path)

  return [IO.Path]::GetRelativePath($repoRoot, $Path).Replace([IO.Path]::DirectorySeparatorChar, "/")
}

function Add-Record {
  param([Parameter(Mandatory)]$Record)

  [void]$records.Add($Record)
}

function Get-WorktreeFingerprint {
  if (-not $git) { throw "git is unavailable for worktree fingerprint." }
  $diff = @(& $git -C $repoRoot diff --binary HEAD)
  if ($LASTEXITCODE -ne 0) { throw "git diff --binary HEAD failed." }
  $untracked = @(& $git -C $repoRoot ls-files --others --exclude-standard)
  if ($LASTEXITCODE -ne 0) { throw "git ls-files failed." }
  $parts = [Collections.Generic.List[string]]::new()
  foreach ($line in $diff) { [void]$parts.Add([string]$line) }
  foreach ($path in $untracked) {
    if ([string]$path -like ".tmp/.codex/*") { continue }
    $fullPath = Join-Path $repoRoot $path
    if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
      $hash = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash
      [void]$parts.Add("UNTRACKED:${path}:$hash")
    }
  }
  $bytes = [Text.Encoding]::UTF8.GetBytes(($parts -join "`n"))
  return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
}

function Redact-Artifact {
  param([Parameter(Mandatory)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return
  }
  $maxBytes = 1MB
  $item = Get-Item -LiteralPath $Path
  $stream = [IO.File]::OpenRead($Path)
  try {
    $buffer = [byte[]]::new($maxBytes)
    $count = $stream.Read($buffer, 0, $buffer.Length)
  } finally {
    $stream.Dispose()
  }
  $text = [Text.Encoding]::UTF8.GetString($buffer, 0, $count)
  $text = [regex]::Replace($text, '(?im)(Authorization|Proxy-Authorization|Cookie|Set-Cookie)\s*:\s*[^\r\n]*', '$1: <redacted>')
  $text = [regex]::Replace($text, '(?i)"(authorization|proxy-authorization|cookie|set-cookie|password|secret|token|accessToken|access_token|refreshToken|refresh_token|session|sid|csrf|api_key)"\s*:\s*"[^"]*"', '"$1":"<redacted>"')
  $text = [regex]::Replace($text, '(?i)"(?:name|key|type)"\s*:\s*"(?:accessToken|refreshToken|authorization|cookie|set-cookie|password|secret|token)"\s*,\s*"value"\s*:\s*"[^"]*"', '"name":"<redacted>","value":"<redacted>"')
  $text = [regex]::Replace($text, '(?i)(password|secret|token)\s*[=:]\s*[^\s,;]+', '$1=<redacted>')
  $text = $text -replace '(?i)/login/[A-Za-z0-9_-]{16,}', '/login/<redacted>'
  if ($item.Length -gt $maxBytes) {
    $text += "`n[output truncated]"
  }
  Set-Content -LiteralPath $Path -Value $text -Encoding UTF8
}

$worktreeFingerprint = $null
try { $worktreeFingerprint = Get-WorktreeFingerprint } catch {
  Add-Record ([ordered]@{
      checkId = "worktree-fingerprint"
      issue = "#7"
      status = "blocked"
      evidenceType = "artifact"
      failureClass = "environment"
      mandatory = $true
      expected = "A deterministic fingerprint of the current tracked and untracked worktree."
      observed = $_.Exception.Message
      command = "git diff --binary HEAD; git ls-files --others --exclude-standard"
      exitCode = $null
      durationMs = 0
      timeoutMs = $TimeoutSeconds * 1000
      artifactPath = $null
      traceability = "docs/personal-keybr-execplan.md:#7.3"
      reason = $_.Exception.Message
    })
}

function Invoke-Check {
  param(
    [Parameter(Mandatory)][string]$CheckId,
    [Parameter(Mandatory)][string]$Command,
    [Parameter(Mandatory)][string[]]$Arguments
  )

  if ($script:verificationBlocked) {
    Add-Record ([ordered]@{
        checkId = $CheckId
        issue = "#7"
        status = "blocked"
        evidenceType = "command"
        failureClass = "harness"
        mandatory = $true
        expected = "The command runs to completion within the verification timeout."
        observed = "Skipped after an earlier command exceeded the timeout."
        command = "$Command $($Arguments -join ' ')".Trim()
        exitCode = $null
        durationMs = 0
        timeoutMs = $TimeoutSeconds * 1000
        artifactPath = $null
        traceability = "docs/personal-keybr-execplan.md:#7.1"
        reason = "Verification stopped after a timed-out command."
      })
    return
  }

  $stdoutPath = Join-Path $EvidenceRoot ("{0}.stdout.log" -f $CheckId)
  $stderrPath = Join-Path $EvidenceRoot ("{0}.stderr.log" -f $CheckId)
  $startedAt = Get-Date
  $stopwatch = [Diagnostics.Stopwatch]::StartNew()
  $status = "failed"
  $failureClass = "environment"
  $exitCode = $null
  $reason = $null
  $process = $null
  $cleanupSucceeded = $true
  try {
    $process = Start-Process `
      -FilePath $Command `
      -ArgumentList $Arguments `
      -WorkingDirectory $repoRoot `
      -WindowStyle Hidden `
      -RedirectStandardOutput $stdoutPath `
      -RedirectStandardError $stderrPath `
      -PassThru
    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
      $reason = "Command exceeded the verification timeout."
      $failureClass = "harness"
      try { $process.Kill($true) } catch { }
      if (-not $process.WaitForExit(5000)) {
        try { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue } catch { }
        [void]$process.WaitForExit(5000)
      }
      if (-not $process.HasExited) {
        $taskkillPath = Join-Path $env:SystemRoot "System32/taskkill.exe"
        if (Test-Path -LiteralPath $taskkillPath) {
          & $taskkillPath /PID $process.Id /T /F | Out-Null
        } else {
          $cleanupSucceeded = $false
        }
      }
      try {
        $remainingChildren = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $($process.Id)" -ErrorAction Stop)
        if (-not $process.HasExited -or $remainingChildren.Count -gt 0) {
          $cleanupSucceeded = $false
        }
      } catch {
        $cleanupSucceeded = $false
      }
      if (-not $cleanupSucceeded) {
        $reason = "Command timed out and its process tree could not be confirmed stopped."
      }
      $status = "blocked"
      $script:verificationBlocked = $true
    } else {
      $exitCode = $process.ExitCode
      if ($exitCode -eq 0) {
        $status = "passed"
        $failureClass = "none"
      } else {
        $reason = "Command returned a non-zero exit code; inspect the captured stderr before classifying it as pre-existing."
        $status = "unverified"
        $failureClass = "harness"
      }
    }
  } catch {
    $reason = $_.Exception.Message
    $failureClass = "environment"
  } finally {
    $stopwatch.Stop()
  }
  if ($null -eq $process -or
      -not (Test-Path -LiteralPath $stdoutPath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $stderrPath -PathType Leaf)) {
    $cleanupSucceeded = $false
  }
  if ($cleanupSucceeded) {
    Redact-Artifact $stdoutPath
    Redact-Artifact $stderrPath
  }

  $commandText = "$Command $($Arguments -join ' ')".Trim()
  Add-Record ([ordered]@{
      checkId = $CheckId
      issue = "#7"
      status = $status
      evidenceType = "command"
      failureClass = $failureClass
      mandatory = $true
      expected = "Exit code 0 in an isolated Windows verification profile."
      observed = if ($reason) { $reason } else { "Exit code $exitCode." }
      command = $commandText
      exitCode = $exitCode
      durationMs = [int]$stopwatch.ElapsedMilliseconds
      timeoutMs = $TimeoutSeconds * 1000
      artifactPath = if ($cleanupSucceeded) { Get-RelativePath $stdoutPath } else { $null }
      stderrArtifactPath = if ($cleanupSucceeded) { Get-RelativePath $stderrPath } else { $null }
      traceability = "docs/personal-keybr-execplan.md:#7.1"
      reason = $reason
      startedAt = $startedAt.ToUniversalTime().ToString("o")
    })

  Write-Output ("[{0}] {1} ({2})" -f $status.ToUpperInvariant(), $CheckId, $commandText)
}

if ($toolchainError) {
  Add-Record ([ordered]@{
      checkId = "toolchain"
      issue = "#7"
      status = "blocked"
      evidenceType = "command"
      failureClass = "environment"
      mandatory = $true
      expected = "Node, npm and git are available on PATH."
      observed = $toolchainError
      command = $null
      exitCode = $null
      durationMs = 0
      timeoutMs = 0
      artifactPath = $null
      traceability = "docs/personal-keybr-execplan.md:#7.1"
      reason = $toolchainError
    })
  foreach ($checkId in @("node-version", "corpus-model", "compile", "lint", "stylelint", "build-dev", "build", "test")) {
    Add-Record ([ordered]@{
        checkId = $checkId
        issue = "#7"
        status = "blocked"
        evidenceType = "command"
        failureClass = "environment"
        mandatory = $true
        expected = "The Windows verification toolchain is available."
        observed = "Skipped because the toolchain preflight failed."
        command = $null
        exitCode = $null
        durationMs = 0
        timeoutMs = $TimeoutSeconds * 1000
        artifactPath = $null
        traceability = "docs/personal-keybr-execplan.md:#7.1"
        reason = $toolchainError
      })
  }
} else {
  $nodeVersion = $null
  $nodeExitCode = 0
  try { $nodeVersion = (& $nodePath --version).Trim(); $nodeExitCode = $LASTEXITCODE } catch {
    $nodeVersion = "unavailable"
    $nodeExitCode = 1
  }
  $nodeMajor = 0
  if ($nodeVersion -match "^v(?<major>\d+)") {
    $nodeMajor = [int]$Matches.major
  }
  Add-Record ([ordered]@{
      checkId = "node-version"
      issue = "#7"
      status = if ($nodeMajor -eq 24 -and $nodeExitCode -eq 0) { "passed" } else { "unverified" }
      evidenceType = "command"
      failureClass = if ($nodeMajor -eq 24 -and $nodeExitCode -eq 0) { "none" } else { "environment" }
      mandatory = $true
      expected = "Node.js major version 24."
      observed = $nodeVersion
      command = "node --version"
      exitCode = $nodeExitCode
      durationMs = 0
      timeoutMs = 0
      artifactPath = $null
      traceability = "docs/getting_started.md:7-15"
      reason = if ($nodeMajor -eq 24 -and $nodeExitCode -eq 0) { $null } else { "Node.js 24 is required and node --version must exit 0." }
    })

  if ($nodeMajor -eq 24) {
    Invoke-Check "corpus-model" $npm @("--workspace", "@keybr/generators", "run", "check-personal")
    Invoke-Check "compile" $npm @("run", "compile")
    Invoke-Check "lint" $npm @("run", "lint")
    Invoke-Check "stylelint" $npm @("run", "stylelint")
    Invoke-Check "build-dev" $npm @("run", "build-dev")
    Invoke-Check "build" $npm @("run", "build")
    Invoke-Check "test" $npm @("test")
  } else {
    foreach ($checkId in @("corpus-model", "compile", "lint", "stylelint", "build-dev", "build", "test")) {
      Add-Record ([ordered]@{
          checkId = $checkId
          issue = "#7"
          status = "blocked"
          evidenceType = "command"
          failureClass = "environment"
          mandatory = $true
          expected = "The check runs under Node.js 24."
          observed = "Skipped because Node.js version is '$nodeVersion'."
          command = $null
          exitCode = $null
          durationMs = 0
          timeoutMs = $TimeoutSeconds * 1000
          artifactPath = $null
          traceability = "docs/getting_started.md:7-15"
          reason = "Node.js 24 is required for this repository."
        })
    }
  }
}

$manualCheckIds = @(
  "browser-dev",
  "browser-prod",
  "reload-restart",
  "offline-local-only",
  "source-switch",
  "corpus-update",
  "backup-restore",
  "negative-launcher"
)
$manualRecords = @()
if (-not [string]::IsNullOrWhiteSpace($BrowserEvidencePath)) {
  try {
    $manualPath = [IO.Path]::GetFullPath($BrowserEvidencePath)
    Assert-NoReparseAncestors $manualPath
    if (-not $manualPath.StartsWith($browserEvidenceBase + [IO.Path]::DirectorySeparatorChar) -or
        -not (Test-Path -LiteralPath $manualPath -PathType Leaf)) {
      throw "-BrowserEvidencePath must be an existing file below '$browserEvidenceBase'."
    }
    Assert-NoHardlink $manualPath
    if ((Get-Item -LiteralPath $manualPath).Length -gt 1MB) {
      throw "-BrowserEvidencePath must not exceed 1 MiB."
    }
    $manualPayload = Get-Content -LiteralPath $manualPath -Raw | ConvertFrom-Json
    if ($null -eq $manualPayload.commit -or
        $manualPayload.commit -isnot [string] -or
        $manualPayload.commit -notmatch '^[0-9a-f]{40}$' -or
        [string]$manualPayload.commit -cne [string]$commit) {
      throw "Browser evidence commit does not match the current HEAD."
    }
    if ($null -eq $manualPayload.worktreeDirty -or $manualPayload.worktreeDirty -isnot [bool]) {
      throw "Browser evidence worktreeDirty must be a boolean."
    }
    $allowedTopFields = @("schemaVersion", "commit", "worktreeDirty", "worktreeFingerprint", "checks")
    $unknownTopFields = @($manualPayload.PSObject.Properties.Name | Where-Object { $_ -notin $allowedTopFields })
    if ($unknownTopFields.Count -gt 0) {
      throw "Browser evidence has unknown top-level fields: $($unknownTopFields -join ', ')."
    }
    if ((($manualPayload.schemaVersion -isnot [int]) -and ($manualPayload.schemaVersion -isnot [long])) -or
        [int64]$manualPayload.schemaVersion -ne 1 -or
        $manualPayload.checks -isnot [array]) {
      throw "Browser evidence must contain schemaVersion=1 and a checks array."
    }
    $currentDirty = if ($git) { @(& $git -C $repoRoot status --short).Count -gt 0 } else { $true }
    if ([bool]$manualPayload.worktreeDirty -ne $currentDirty) {
      throw "Browser evidence worktreeDirty does not match the current checkout."
    }
    if ($manualPayload.worktreeFingerprint -isnot [string] -or
        [string]$manualPayload.worktreeFingerprint -cne [string]$worktreeFingerprint) {
      throw "Browser evidence worktreeFingerprint does not match the current checkout."
    }
    $manualRecords = @($manualPayload.checks)
  } catch {
    Add-Record ([ordered]@{
        checkId = "browser-evidence-input"
        issue = "#7"
        status = "unverified"
        evidenceType = "manual"
        failureClass = "harness"
        mandatory = $true
        expected = "A readable sanitized browser evidence JSON file."
        observed = $_.Exception.Message
        command = $null
        exitCode = $null
        durationMs = 0
        timeoutMs = 0
        artifactPath = $null
        traceability = "docs/personal-keybr-execplan.md:#7.2-#7.4"
        reason = $_.Exception.Message
      })
  }
}
$sensitivePattern = '(?i)(?:authorization|proxy-authorization|set-cookie|cookie|session|sid|csrf|api_key)\s*[:=]\s*[^\s,;]+|(?:password|secret|token)\s*[:=]\s*[^\s,;]+|/login/[A-Za-z0-9_-]{16,}'
$knownEvidenceFields = @(
  "expected", "observed", "reason", "command", "traceability", "artifactPath",
  "profilePath", "fixture", "seed", "selectors", "networkSummary"
)
$validManualRecords = @()
$seenManualIds = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$usedArtifactPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
function Add-EvidenceInputFailure {
  param([Parameter(Mandatory)][string]$Message)

  Add-Record ([ordered]@{
      checkId = "browser-evidence-input"
      issue = "#7"
      status = "unverified"
      evidenceType = "manual"
      failureClass = "harness"
      mandatory = $true
      expected = "Sanitized records for all mandatory browser/acceptance checks."
      observed = $Message
      command = $null
      exitCode = $null
      durationMs = 0
      timeoutMs = 0
      artifactPath = $null
      traceability = "docs/personal-keybr-execplan.md:#7.2-#7.4"
      reason = $Message
    })
}
foreach ($record in @($manualRecords)) {
  if ($record.checkId -cnotin $manualCheckIds) {
    Add-EvidenceInputFailure "Unknown manual check id '$($record.checkId)'."
    continue
  }
  if (-not $seenManualIds.Add([string]$record.checkId)) {
    Add-EvidenceInputFailure "Manual check '$($record.checkId)' appears more than once."
    continue
  }
  $requiredFields = @(
    "checkId", "issue", "status", "evidenceType", "failureClass", "mandatory",
    "expected", "observed", "command", "exitCode", "durationMs", "timeoutMs",
    "artifactPath", "traceability", "reason"
  )
  $missingFields = @($requiredFields | Where-Object { $_ -notin $record.PSObject.Properties.Name })
  if ($missingFields.Count -gt 0) {
    Add-EvidenceInputFailure "Manual check '$($record.checkId)' is missing fields: $($missingFields -join ', ')."
    continue
  }
  $allowedFields = @($requiredFields + "profilePath", "fixture", "seed", "selectors", "networkSummary")
  $unknownFields = @($record.PSObject.Properties.Name | Where-Object { $_ -notin $allowedFields })
  if ($unknownFields.Count -gt 0) {
    Add-EvidenceInputFailure "Manual check '$($record.checkId)' has unknown fields: $($unknownFields -join ', ')."
    continue
  }
  if ($record.issue -ne "#7" -or $record.checkId -isnot [string] -or
      $record.status -cnotin @("passed", "failed", "skipped", "blocked", "unverified") -or
      $record.evidenceType -cnotin @("browser-manual", "manual", "command", "artifact", "network-summary") -or
      $record.failureClass -cnotin @("none", "null", "preExisting", "newRegression", "environment", "harness") -or
      $record.mandatory -isnot [bool] -or
      $record.traceability -isnot [string] -or
      (($record.durationMs -isnot [int]) -and ($record.durationMs -isnot [long])) -or $record.durationMs -lt 0 -or
      ($null -ne $record.timeoutMs -and
       ((($record.timeoutMs -isnot [int]) -and ($record.timeoutMs -isnot [long])) -or $record.timeoutMs -lt 0 -or $record.timeoutMs -gt 7200000)) -or
      ($null -ne $record.exitCode -and
       ((($record.exitCode -isnot [int]) -and ($record.exitCode -isnot [long])) -or $record.exitCode -lt 0 -or $record.exitCode -gt 65535))) {
    Add-EvidenceInputFailure "Manual check '$($record.checkId)' has invalid schema values."
    continue
  }
  if ($record.mandatory -eq $false) {
    Add-EvidenceInputFailure "Mandatory check '$($record.checkId)' cannot set mandatory=false."
    continue
  }
  $recordValid = $true
  foreach ($field in $knownEvidenceFields) {
    $value = $record.$field
    if ($null -ne $value -and $value -isnot [string]) {
      Add-EvidenceInputFailure "Field '$field' of '$($record.checkId)' must be a string or null."
      $recordValid = $false
      break
    }
    if ($value -is [string] -and
        ($value.Length -gt 2000 -or $value -match $sensitivePattern -or
         $value -match '(?i)(?:^[A-Za-z]:[\\/]|^\\\\|/(?:Users|home)/|[?&](?:token|access_token|refresh_token|session|cookie)=)')) {
      Add-EvidenceInputFailure "Field '$field' of '$($record.checkId)' is not sanitized."
      $recordValid = $false
      break
    }
  }
  if (-not $recordValid) {
    continue
  }
  if (-not [string]::IsNullOrWhiteSpace($record.profilePath) -and
      ([IO.Path]::IsPathRooted($record.profilePath) -or $record.profilePath.Contains(".."))) {
    Add-EvidenceInputFailure "profilePath for '$($record.checkId)' must be a sanitized relative label."
    continue
  }
  if ($record.status -cin @("failed", "skipped", "blocked", "unverified") -and
      [string]::IsNullOrWhiteSpace($record.reason)) {
    Add-EvidenceInputFailure "Non-passed check '$($record.checkId)' requires a reason."
    continue
  }
  if ($record.status -cne "passed" -and $record.failureClass -ceq "none") {
    Add-EvidenceInputFailure "Non-passed check '$($record.checkId)' cannot use failureClass=none."
    continue
  }
  if ($record.status -ceq "passed" -and
      ([string]::IsNullOrWhiteSpace($record.expected) -or
       [string]::IsNullOrWhiteSpace($record.observed) -or
       [string]::IsNullOrWhiteSpace($record.traceability) -or
       [string]::IsNullOrWhiteSpace($record.artifactPath) -or
       $record.failureClass -cne "none" -or
       -not [string]::IsNullOrWhiteSpace($record.reason) -or
       ($null -ne $record.exitCode -and $record.exitCode -ne 0) -or
       (($record.timeoutMs -isnot [int]) -and ($record.timeoutMs -isnot [long])) -or
       $record.timeoutMs -lt 1 -or $record.timeoutMs -gt 7200000)) {
    Add-EvidenceInputFailure "Passed check '$($record.checkId)' lacks required fields or failureClass=none."
    continue
  }
  if (-not [string]::IsNullOrWhiteSpace($record.artifactPath)) {
    if ([IO.Path]::IsPathRooted($record.artifactPath)) {
      Add-EvidenceInputFailure "Artifact for '$($record.checkId)' must be a relative path."
      continue
    }
    $artifactFullPath = [IO.Path]::GetFullPath((Join-Path $repoRoot $record.artifactPath))
    if (-not $artifactFullPath.StartsWith($browserEvidenceBase + [IO.Path]::DirectorySeparatorChar) -or
        -not (Test-Path -LiteralPath $artifactFullPath -PathType Leaf)) {
      Add-EvidenceInputFailure "Artifact for '$($record.checkId)' must be an existing file below .tmp/.codex/browser."
      continue
    }
    Assert-NoReparseAncestors $artifactFullPath
    Assert-NoHardlink $artifactFullPath
    if ($null -ne $manualPath -and
        [IO.Path]::GetFullPath($manualPath) -eq $artifactFullPath) {
      Add-EvidenceInputFailure "Manual check '$($record.checkId)' cannot use the input envelope as its artifact."
      continue
    }
    if (-not [IO.Path]::GetFileName($artifactFullPath).StartsWith("$($record.checkId).", [StringComparison]::Ordinal)) {
      Add-EvidenceInputFailure "Artifact for '$($record.checkId)' must have a matching filename prefix."
      continue
    }
    if (-not $usedArtifactPaths.Add($artifactFullPath)) {
      Add-EvidenceInputFailure "Artifact '$($record.artifactPath)' is reused by multiple checks."
      continue
    }
    $artifactExtension = [IO.Path]::GetExtension($artifactFullPath).ToLowerInvariant()
    if ($artifactExtension -notin @(".json", ".txt", ".log", ".md")) {
      Add-EvidenceInputFailure "Artifact for '$($record.checkId)' uses a disallowed file type."
      continue
    }
    if ($artifactExtension -in @(".json", ".txt", ".log", ".md")) {
      $artifactLength = (Get-Item -LiteralPath $artifactFullPath).Length
      if ($artifactLength -eq 0 -or $artifactLength -gt 1MB) {
        Add-EvidenceInputFailure "Artifact for '$($record.checkId)' is larger than 1 MiB."
        continue
      }
      $artifactText = Get-Content -LiteralPath $artifactFullPath -Raw
      $artifactSensitivePattern = '(?i)"(?:cookies|headers|accessToken|access_token|refreshToken|refresh_token|authorization|cookie|set-cookie|password|secret|token|session|csrf)"\s*:|"(?:name|key|type)"\s*:\s*"(?:session|sid|csrf|accessToken|access_token|refreshToken|refresh_token|authorization|cookie|set-cookie|password|secret|token)"\s*,\s*"value"\s*:'
      if ($artifactText -match $sensitivePattern -or $artifactText -match $artifactSensitivePattern) {
        Add-EvidenceInputFailure "Artifact for '$($record.checkId)' is not a sanitized bounded text file."
        continue
      }
      if ($artifactExtension -ceq ".json") {
        try {
          $artifactPayload = $artifactText | ConvertFrom-Json
          if ([string]$artifactPayload.checkId -cne [string]$record.checkId) {
            throw "artifact checkId mismatch"
          }
        } catch {
          Add-EvidenceInputFailure "JSON artifact for '$($record.checkId)' is invalid or has a mismatched checkId."
          continue
        }
      }
    }
  }
  $validManualRecords += $record
}
foreach ($checkId in $manualCheckIds) {
  $record = @($validManualRecords | Where-Object { $_.checkId -eq $checkId } | Select-Object -First 1)
  if ($record.Count -eq 0) {
    $validManualRecords += [pscustomobject]([ordered]@{
        checkId = $checkId
        issue = "#7"
        status = "unverified"
        evidenceType = "manual"
        failureClass = "harness"
        mandatory = $true
        expected = "The corresponding real-browser or Windows acceptance scenario passes."
        observed = "No sanitized manual record was supplied."
        command = $null
        exitCode = $null
        durationMs = 0
        timeoutMs = $null
        artifactPath = $null
        traceability = "docs/personal-keybr-execplan.md:#7.2-#7.4"
        reason = "Browser acceptance is not complete."
      })
  }
}
foreach ($record in $validManualRecords) {
  if ($record.checkId -cin $manualCheckIds) {
    Add-Record ([ordered]@{
        checkId = $record.checkId
        issue = if ($record.issue) { $record.issue } else { "#7" }
        status = if ($record.status -cin @("passed", "failed", "skipped", "blocked", "unverified")) { $record.status } else { "unverified" }
        evidenceType = if ($record.evidenceType) { $record.evidenceType } else { "manual" }
        failureClass = if ($record.failureClass -cin @("none", "null", "preExisting", "newRegression", "environment", "harness")) { $record.failureClass } else { "harness" }
        mandatory = $true
        expected = $record.expected
        observed = $record.observed
        command = $record.command
        exitCode = $record.exitCode
        durationMs = $record.durationMs
        timeoutMs = $record.timeoutMs
        artifactPath = $record.artifactPath
        traceability = if ($record.traceability) { $record.traceability } else { "docs/personal-keybr-execplan.md:#7.2-#7.4" }
        reason = $record.reason
        profilePath = $record.profilePath
        fixture = $record.fixture
        seed = $record.seed
        selectors = $record.selectors
        networkSummary = $record.networkSummary
      })
  }
}

$manifestPath = Join-Path $repoRoot "packages/keybr-content-words/lib/data/words-ru-personal.manifest.json"
$manifest = $null
$manifestError = $null
try {
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
} catch {
  $manifestError = $_.Exception.Message
  Add-Record ([ordered]@{
      checkId = "personal-manifest"
      issue = "#7"
      status = "unverified"
      evidenceType = "artifact"
      failureClass = "environment"
      mandatory = $true
      expected = "The personal corpus/model manifest is readable."
      observed = $manifestError
      command = $null
      exitCode = $null
      durationMs = 0
      timeoutMs = 0
      artifactPath = $null
      traceability = "packages/keybr-content-words/lib/data/words-ru-personal.manifest.json"
      reason = $manifestError
    })
}
if ($null -ne $manifest) {
  $manifestValid = [string]$manifest.sourceId -ceq "ru-personal" -and
    [string]$manifest.wordListId -ceq "words-ru-personal" -and
    [string]$manifest.languageId -ceq "ru" -and
    [int64]$manifest.corpusVersion -eq 1 -and
    [int64]$manifest.wordCount -eq 1232 -and
    [string]$manifest.corpusSha256 -ceq "ab09647a03f1c3439e143ff20372c4d864d792ed42a1f59a5db1920bef35e563" -and
    [string]$manifest.modelId -ceq "model-ru-personal" -and
    [int64]$manifest.modelVersion -eq 1 -and
    -not [string]::IsNullOrWhiteSpace([string]$manifest.modelSha256)
  Add-Record ([ordered]@{
      checkId = "personal-manifest"
      issue = "#7"
      status = if ($manifestValid) { "passed" } else { "unverified" }
      evidenceType = "artifact"
      failureClass = if ($manifestValid) { "none" } else { "environment" }
      mandatory = $true
      expected = "Canonical ru-personal manifest identity, count and SHA-256 values."
      observed = if ($manifestValid) { "Manifest identity and canonical fields match." } else { "Manifest fields do not match the canonical personal contract." }
      command = $null
      exitCode = $null
      durationMs = 0
      timeoutMs = 0
      artifactPath = "packages/keybr-content-words/lib/data/words-ru-personal.manifest.json"
      traceability = "packages/keybr-content-words/lib/data/words-ru-personal.manifest.json"
      reason = if ($manifestValid) { $null } else { "Canonical manifest validation failed." }
    })
}
$statusLines = @()
$statusExitCode = $null
if ($git) {
  $statusLines = @(& $git -C $repoRoot status --short)
  $statusExitCode = $LASTEXITCODE
  if ($statusExitCode -ne 0) {
    Add-Record ([ordered]@{
        checkId = "git-status"
        issue = "#7"
        status = "blocked"
        evidenceType = "command"
        failureClass = "environment"
        mandatory = $true
        expected = "git status exits 0."
        observed = "git status returned exit code $statusExitCode."
        command = "git status --short"
        exitCode = $statusExitCode
        durationMs = 0
        timeoutMs = $TimeoutSeconds * 1000
        artifactPath = $null
        traceability = "docs/personal-keybr-execplan.md:#7.3"
        reason = "Cannot establish worktree cleanliness."
      })
  }
}
$nodeVersionForEvidence = $null
$npmVersionForEvidence = $null
try { $nodeVersionForEvidence = (& $nodePath --version).Trim() } catch { }
try { $npmVersionForEvidence = (& npm.cmd --version).Trim() } catch { }
$mandatoryRecords = @($records | Where-Object { $_.mandatory })
$nonPassedChecks = @($mandatoryRecords | Where-Object { $_.status -cne "passed" } | ForEach-Object {
    [ordered]@{
      checkId = $_.checkId
      status = $_.status
      reason = $_.reason
    }
  })
$envelope = [ordered]@{
  schemaVersion = 1
  commit = $commit
  worktreeDirty = $statusLines.Count -gt 0
  worktreeStatus = $statusLines
  worktreeFingerprint = $worktreeFingerprint
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  toolVersions = [ordered]@{
    node = $nodeVersionForEvidence
    npm = $npmVersionForEvidence
    powershell = $PSVersionTable.PSVersion.ToString()
  }
  profile = [ordered]@{
    dataRoot = $dataRoot
    databaseFilename = $databaseFilename
    publicRoot = $env:PUBLIC_DIR
    serverHost = $env:SERVER_HOST
    serverPort = [int]$env:SERVER_PORT
    serverPortWs = [int]$env:SERVER_PORT_WS
  }
  corpusModel = [ordered]@{
    sourceId = if ($manifest) { $manifest.sourceId } else { $null }
    corpusVersion = if ($manifest) { $manifest.corpusVersion } else { $null }
    wordCount = if ($manifest) { $manifest.wordCount } else { $null }
    corpusSha256 = if ($manifest) { $manifest.corpusSha256 } else { $null }
    modelId = if ($manifest) { $manifest.modelId } else { $null }
    modelVersion = if ($manifest) { $manifest.modelVersion } else { $null }
    modelSha256 = if ($manifest) { $manifest.modelSha256 } else { $null }
  }
  networkSummary = [ordered]@{
    policy = "technical verification only; browser allowlist is recorded by the manual acceptance evidence"
    allowedOrigins = @("http://localhost:3000", "ws://localhost:3001")
  }
  mandatoryMatrix = @($mandatoryRecords | ForEach-Object { $_.checkId } | Sort-Object -Unique)
  nonPassedChecks = $nonPassedChecks
  checks = @($records)
}
$envelopePath = Join-Path $EvidenceRoot "verification.json"
$envelope | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $envelopePath -Encoding UTF8
Write-Output "Evidence: $(Get-RelativePath $envelopePath)"

$failed = $nonPassedChecks
if ($failed.Count -gt 0) {
  Write-Error ("Verification has {0} non-passing mandatory check(s)." -f $failed.Count)
  exit 1
}
