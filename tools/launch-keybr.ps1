#Requires -Version 7.0

[CmdletBinding()]
param(
  [ValidateSet("Start", "Stop", "Status", IgnoreCase = $false)]
  [string]$Action = "Start",
  [string]$DataRoot,
  [string]$DatabaseFilename,
  [string]$RuntimeRoot,
  [ValidateSet("development", "production", IgnoreCase = $false)]
  [string]$NodeEnvironment = "development"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$requestedRuntimeRoot = $RuntimeRoot
$runtimeRoot = if ([string]::IsNullOrWhiteSpace($requestedRuntimeRoot)) {
  Join-Path $env:LOCALAPPDATA "keybr-local"
} else {
  [IO.Path]::GetFullPath($requestedRuntimeRoot)
}
$runtimeRoot = [IO.Path]::GetFullPath($runtimeRoot)
$customRuntimeRoot = -not [string]::IsNullOrWhiteSpace($requestedRuntimeRoot)
$customDataRoot = -not [string]::IsNullOrWhiteSpace($DataRoot)
$runtimeMarkerPath = Join-Path $runtimeRoot ".keybr-runtime-profile.json"
$dataMarkerPath = if ($customDataRoot) {
  Join-Path ([IO.Path]::GetFullPath($DataRoot)) ".keybr-data-profile.json"
} else {
  $null
}
$statePath = Join-Path $runtimeRoot "server.json"
$canonicalOrigin = "http://localhost:3000"
$serverPort = 3000
$webSocketPort = 3001
$publicRoot = Join-Path $repoRoot "root\public"
$maxLauncherLogBytes = 1MB
$maxTimestampedLogGroups = 10
$startedServer = $false
$portMutex = $null
$portMutexOwned = $false
$customMarkerValidated = -not $customRuntimeRoot
$environmentNames = @(
  "DATA_DIR",
  "DATABASE_FILENAME",
  "DATABASE_CLIENT",
  "DATABASE_HOST",
  "DATABASE_PORT",
  "DATABASE_DATABASE",
  "DATABASE_USERNAME",
  "DATABASE_PASSWORD",
  "NODE_ENV",
  "SERVER_HOST",
  "SERVER_PORT",
  "SERVER_PORT_WS",
  "PUBLIC_DIR",
  "APP_URL",
  "COOKIE_DOMAIN",
  "COOKIE_PATH",
  "COOKIE_SECURE",
  "KNEX_DEBUG",
  "LOG_LEVEL"
)
$initialEnvironment = @{}
foreach ($name in $environmentNames) {
  $environmentItem = Get-Item -LiteralPath ("Env:{0}" -f $name) -ErrorAction SilentlyContinue
  $initialEnvironment[$name] = [pscustomobject]@{
    Present = $null -ne $environmentItem
    Value = if ($null -eq $environmentItem) { $null } else { [string]$environmentItem.Value }
  }
}

function Assert-SafeUserPath {
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][string]$Name
  )

  if ($Path.StartsWith("\\") -or $Path.StartsWith("//")) {
    throw "$Name must not use a UNC/network path."
  }
  $fullPath = [IO.Path]::GetFullPath($Path)
  $homePath = [IO.Path]::GetFullPath($env:USERPROFILE)
  $relativeToHome = [IO.Path]::GetRelativePath($homePath, $fullPath)
  if ([IO.Path]::IsPathRooted($relativeToHome) -or
      $relativeToHome -eq ".." -or $relativeToHome.StartsWith(".." + [IO.Path]::DirectorySeparatorChar)) {
    throw "$Name must remain inside the current Windows user profile."
  }
  $current = $fullPath
  while ($true) {
    $currentItem = Get-Item -LiteralPath $current -Force -ErrorAction SilentlyContinue
    if ($null -ne $currentItem -and $currentItem.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) {
      throw "$Name must not traverse a symbolic link or junction."
    }
    $parent = [IO.Path]::GetFullPath((Join-Path $current ".."))
    if ($parent -eq $current) {
      break
    }
    $current = $parent
  }
  return $fullPath
}

function Assert-NewProfileMarker {
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][string]$MarkerPath,
    [Parameter(Mandatory)][string]$Name,
    [switch]$ExistingOnly
  )

  if (Test-Path -LiteralPath $Path) {
    if (-not (Test-Path -LiteralPath $MarkerPath)) {
      throw "$Name already exists without a keybr acceptance marker; refusing to modify it."
    }
    if ((Get-Item -LiteralPath $MarkerPath).Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) {
      throw "$Name acceptance marker must not be a symbolic link or junction."
    }
    try {
      $marker = Get-Content -LiteralPath $MarkerPath -Raw | ConvertFrom-Json
      if ((($marker.schemaVersion -isnot [int]) -and ($marker.schemaVersion -isnot [long])) -or
          [int64]$marker.schemaVersion -ne 1 -or
          [IO.Path]::GetFullPath([string]$marker.repoRoot) -ne $repoRoot -or
          [IO.Path]::GetFullPath([string]$marker.profilePath) -ne [IO.Path]::GetFullPath($Path) -or
          [string]$marker.role -cne $Name) {
        throw "marker identity mismatch"
      }
    } catch {
      throw "$Name acceptance marker is invalid or belongs to another checkout."
    }
    return
  }
  if ($ExistingOnly) {
    throw "$Name acceptance marker is missing; refusing cleanup or reuse."
  }
  New-Item -ItemType Directory -Path $Path -Force | Out-Null
  [ordered]@{
    schemaVersion = 1
    repoRoot = $repoRoot
    profilePath = [IO.Path]::GetFullPath($Path)
    role = $Name
    createdAtUtc = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json | Set-Content -LiteralPath $MarkerPath -Encoding UTF8 -NoNewline
}

$runtimeRoot = Assert-SafeUserPath -Path $runtimeRoot -Name "-RuntimeRoot"
if ($customDataRoot) {
  $resolvedDataRoot = Assert-SafeUserPath -Path $DataRoot -Name "-DataRoot"
}

function Ensure-RuntimeRoot {
  New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
}

function Write-LauncherLog {
  param([Parameter(Mandatory)][string]$Message)

  Ensure-RuntimeRoot
  $logPath = Join-Path $runtimeRoot "launcher.log"
  Assert-SafeOutputFile -Path $logPath
  if (Test-Path -LiteralPath $logPath) {
    $item = Get-Item -LiteralPath $logPath
    if ($item.Length -ge $maxLauncherLogBytes) {
      $archivePath = Join-Path $runtimeRoot ("launcher-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
      Move-Item -LiteralPath $logPath -Destination $archivePath -Force
    }
  }
  Add-Content -LiteralPath $logPath -Value ("{0:u} {1}" -f (Get-Date), $Message) -Encoding UTF8
  $item = Get-Item -LiteralPath $logPath
  if ($item.Length -gt $maxLauncherLogBytes) {
    $archivePath = Join-Path $runtimeRoot ("launcher-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
    $suffix = 1
    while (Test-Path -LiteralPath $archivePath) {
      $archivePath = Join-Path $runtimeRoot ("launcher-{0}-{1}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"), $suffix)
      $suffix++
    }
    Move-Item -LiteralPath $logPath -Destination $archivePath
  }
  Remove-OldLogs
}

function Remove-OldLogs {
  if (-not (Test-Path -LiteralPath $runtimeRoot)) {
    return
  }
  $groups = Get-ChildItem -LiteralPath $runtimeRoot -File |
    Where-Object { $_.Name -match "^(launcher-|provision-|server-)\d{8}-\d{6}" } |
    Group-Object { $_.Name -replace "^(?:launcher-|provision-|server-)(\d{8}-\d{6}).*$", '$1' } |
    Sort-Object Name -Descending
  foreach ($group in ($groups | Select-Object -Skip $maxTimestampedLogGroups)) {
    foreach ($item in $group.Group) {
      Remove-Item -LiteralPath $item.FullName -Force
    }
  }
}

function Get-NodePath {
  return (Get-Command node.exe -ErrorAction Stop).Source
}

function Clear-ProfileOverrides {
  foreach ($name in @(
      "DATA_DIR",
      "DATABASE_FILENAME",
      "DATABASE_CLIENT",
      "DATABASE_HOST",
      "DATABASE_PORT",
      "DATABASE_DATABASE",
      "DATABASE_USERNAME",
      "DATABASE_PASSWORD"
    )) {
    Remove-Item -LiteralPath ("Env:{0}" -f $name) -ErrorAction SilentlyContinue
  }
}

function Get-LocalEnvironment {
  return [ordered]@{
    NODE_ENV = $NodeEnvironment
    SERVER_HOST = "127.0.0.1"
    SERVER_PORT = [string]$serverPort
    SERVER_PORT_WS = [string]$webSocketPort
    PUBLIC_DIR = $publicRoot
    APP_URL = "$canonicalOrigin/"
    COOKIE_DOMAIN = "localhost"
    COOKIE_PATH = "/"
    COOKIE_SECURE = "false"
    KNEX_DEBUG = ""
    LOG_LEVEL = "info"
  }
}

function Set-LocalEnvironment {
  foreach ($entry in (Get-LocalEnvironment).GetEnumerator()) {
    Set-Item -LiteralPath ("Env:{0}" -f $entry.Key) -Value ([string]$entry.Value)
  }
}

function Restore-Environment {
  foreach ($name in $environmentNames) {
    $entry = $initialEnvironment[$name]
    if ($entry.Present) {
      Set-Item -LiteralPath ("Env:{0}" -f $name) -Value $entry.Value
    } else {
      Remove-Item -LiteralPath ("Env:{0}" -f $name) -ErrorAction SilentlyContinue
    }
  }
}

function Set-ProfileOverrides {
  if ([string]::IsNullOrWhiteSpace($DataRoot)) {
    if (-not [string]::IsNullOrWhiteSpace($DatabaseFilename)) {
      throw "-DatabaseFilename requires -DataRoot so the test profile remains local and self-contained."
    }
    return
  }

  $resolvedDataRoot = [IO.Path]::GetFullPath($DataRoot)
  $env:DATA_DIR = $resolvedDataRoot
  if ([string]::IsNullOrWhiteSpace($DatabaseFilename)) {
    $env:DATABASE_FILENAME = Join-Path $resolvedDataRoot "database.sqlite"
  } else {
    $env:DATABASE_FILENAME = [IO.Path]::GetFullPath($DatabaseFilename)
  }
  $env:DATABASE_CLIENT = "sqlite"
  Assert-NoExternalHardlink -Path $env:DATABASE_FILENAME -Name "DATABASE_FILENAME"
}

function Assert-NoExternalHardlink {
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][string]$Name
  )

  $pathItem = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
  if ($null -ne $pathItem -and $pathItem.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) {
    throw "$Name must not be a symbolic link or junction."
  }
  if ($null -eq $pathItem -or $pathItem.PSIsContainer) {
    return
  }
  $fsutilPath = Join-Path $env:SystemRoot "System32/fsutil.exe"
  if (-not (Test-Path -LiteralPath $fsutilPath)) {
    throw "Cannot verify hardlink ownership for $Name because fsutil.exe is unavailable."
  }
  $links = @(& $fsutilPath hardlink list $Path 2>$null)
  if ($LASTEXITCODE -ne 0 -or $links.Count -ne 1) {
    throw "$Name must not be a hardlink to another file."
  }
}

function Assert-SafeOutputFile {
  param([Parameter(Mandatory)][string]$Path)

  $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
  if ($null -ne $item -and $item.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) {
    throw "Output path '$Path' must not be a symbolic link or junction."
  }
  if ($null -ne $item -and -not $item.PSIsContainer) {
    Assert-NoExternalHardlink -Path $Path -Name $Path
  }
}

function Assert-SafeDataDescendants {
  param([Parameter(Mandatory)][string]$DataPath)

  if (-not (Test-Path -LiteralPath $DataPath -PathType Container)) {
    return
  }
  foreach ($item in @(Get-ChildItem -LiteralPath $DataPath -Recurse -Force)) {
    if ($item.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) {
      throw "DATA_DIR contains a symbolic link or junction: '$($item.FullName)'."
    }
    if (-not $item.PSIsContainer) {
      Assert-NoExternalHardlink -Path $item.FullName -Name $item.FullName
    }
  }
}

function Enter-LaunchMutex {
  $script:portMutex = [Threading.Mutex]::new($false, "Global\keybr-launch-ports-3000-3001")
  $portAcquired = $false
  try { $portAcquired = $script:portMutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $portAcquired = $true }
  if (-not $portAcquired) {
    $script:portMutex.Dispose()
    $script:portMutex = $null
    throw "Another keybr launcher operation is using ports 3000/3001."
  }
  $script:portMutexOwned = $true
}

function Stop-VerifiedProcessTree {
  param(
    [Parameter(Mandatory)][int]$RootProcessId,
    [Parameter(Mandatory)][string]$ExpectedIdentity
  )

  $expectedCommandPath = [IO.Path]::GetFullPath((Join-Path $repoRoot "root\index.js"))
  $commandPathPattern = '(?i)(?:^|[\s"])' + [regex]::Escape($expectedCommandPath) + '(?:$|[\s"])'
  $rootSnapshot = Get-ProcessSnapshot -ProcessId $RootProcessId
  if ($null -eq $rootSnapshot) {
    throw "Cannot clean verified keybr process tree $RootProcessId because its master process is no longer available for identity verification."
  }
  if ([string]$rootSnapshot.CommandLine -notmatch $commandPathPattern) {
    throw "Refusing to stop process $RootProcessId because its command does not belong to this keybr instance."
  }
  if ((Get-ProcessIdentity $rootSnapshot) -cne $ExpectedIdentity) {
    throw "The verified keybr master process $RootProcessId changed before cleanup."
  }
  $workerIdentities = @{}
  $initialTree = Get-ProcessTreeIds -RootProcessId $RootProcessId
  foreach ($processId in $initialTree) {
    if ([int]$processId -eq $RootProcessId) {
      continue
    }
    $snapshot = Get-ProcessSnapshot -ProcessId ([int]$processId)
    if ($null -eq $snapshot) {
      continue
    }
    if ([string]$snapshot.CommandLine -notmatch $commandPathPattern) {
      throw "Refusing to stop process $processId because its command does not belong to this keybr instance."
    }
    $workerIdentities[[int]$processId] = Get-ProcessIdentity $snapshot
  }
  $latestTree = Get-ProcessTreeIds -RootProcessId $RootProcessId
  foreach ($processId in $latestTree) {
    if ([int]$processId -eq $RootProcessId -or $workerIdentities.ContainsKey([int]$processId)) {
      continue
    }
    $snapshot = Get-ProcessSnapshot -ProcessId ([int]$processId)
    if ($null -eq $snapshot) {
      continue
    }
    if ([string]$snapshot.CommandLine -notmatch $commandPathPattern) {
      throw "Refusing to stop process $processId because its command does not belong to this keybr instance."
    }
    $workerIdentities[[int]$processId] = Get-ProcessIdentity $snapshot
  }
  if (-not (Stop-VerifiedProcess -ProcessId $RootProcessId -ExpectedIdentity $ExpectedIdentity -Description "Verified keybr master process")) {
    throw "Cannot clean verified keybr process tree $RootProcessId because its master process exited before the handle was opened."
  }
  for ($round = 0; $round -lt 4; $round++) {
    if ($workerIdentities.Count -eq 0) {
      break
    }
    foreach ($processId in @($workerIdentities.Keys)) {
      $snapshot = Get-ProcessSnapshot -ProcessId ([int]$processId)
      if ($null -eq $snapshot) { continue }
      if ([string]$snapshot.CommandLine -notmatch $commandPathPattern) {
        throw "Refusing to stop process $processId because its command does not belong to this keybr instance."
      }
      if ((Get-ProcessIdentity $snapshot) -cne $workerIdentities[[int]$processId]) {
        throw "Verified keybr worker $processId changed before cleanup."
      }
      if (-not (Stop-VerifiedProcess -ProcessId ([int]$processId) -ExpectedIdentity $workerIdentities[[int]$processId] -Description "Verified keybr worker")) {
        continue
      }
    }
    Start-Sleep -Milliseconds 250
  }
  $remainingIds = @()
  foreach ($id in @($workerIdentities.Keys)) {
    if ($null -ne (Get-ProcessSnapshot -ProcessId ([int]$id))) {
      $remainingIds += [int]$id
    }
  }
  $observedTree = Get-ProcessTreeIds -RootProcessId $RootProcessId
  foreach ($id in $observedTree) {
    if ([int]$id -ne $RootProcessId -and
        -not $workerIdentities.ContainsKey([int]$id) -and
        $null -ne (Get-ProcessSnapshot -ProcessId ([int]$id))) {
      $remainingIds += [int]$id
    }
  }
  $remainingIds = @($remainingIds | Sort-Object -Unique)
  if ($remainingIds.Count -gt 0) {
    throw "Verified keybr cleanup left process tree members: $($remainingIds -join ', ')."
  }
  if ((Get-ListeningConnections -Port $serverPort).Count -gt 0 -or
      (Get-ListeningConnections -Port $webSocketPort).Count -gt 0) {
    throw "Verified keybr cleanup left one or more local listeners active."
  }
}

function Get-BuildMarker {
  $serverEntry = Join-Path $repoRoot "root\lib\index.js"
  $serverRootEntry = Join-Path $repoRoot "root\index.js"
  $assetManifest = Join-Path $repoRoot "root\public\assets\manifest.json"
  if (-not (Test-Path -LiteralPath $serverEntry) -or
      -not (Test-Path -LiteralPath $serverRootEntry) -or
      -not (Test-Path -LiteralPath $assetManifest)) {
    throw "The compiled server entry, root entry, and browser asset manifest are required. Run the project build first."
  }
  $serverHash = (Get-FileHash -LiteralPath $serverEntry -Algorithm SHA256).Hash
  $rootHash = (Get-FileHash -LiteralPath $serverRootEntry -Algorithm SHA256).Hash
  $assetHash = (Get-FileHash -LiteralPath $assetManifest -Algorithm SHA256).Hash
  return "${serverHash}:${rootHash}:${assetHash}"
}

function Assert-Build {
  [void](Get-BuildMarker)
}

function Get-State {
  if (-not (Test-Path -LiteralPath $statePath)) {
    return $null
  }
  $stateItem = Get-Item -LiteralPath $statePath
  if ($stateItem.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) {
    throw "The launcher state path '$statePath' must not be a symbolic link or junction."
  }
  $fsutilPath = Join-Path $env:SystemRoot "System32/fsutil.exe"
  if (-not (Test-Path -LiteralPath $fsutilPath)) {
    throw "Cannot verify launcher state hardlink ownership because fsutil.exe is unavailable."
  }
  $stateLinks = @(& $fsutilPath hardlink list $statePath 2>$null)
  $fsutilExitCode = $LASTEXITCODE
  $fsutilUnsupported = $fsutilExitCode -eq 1 -and
    (($stateLinks -join "`n") -match "(?i)^Error 50:")
  if (-not $fsutilUnsupported -and
      ($fsutilExitCode -ne 0 -or $stateLinks.Count -ne 1)) {
    throw "The launcher state path '$statePath' must not be a hardlink."
  }
  try {
    return Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
  } catch {
    throw "The launcher state file '$statePath' is not valid JSON. Remove it only after verifying that no owned server is running."
  }
}

function Get-ProcessSnapshot {
  param([Parameter(Mandatory)][int]$ProcessId)

  try {
    return Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
  } catch {
    throw "Could not inspect process ${ProcessId}: $($_.Exception.Message)"
  }
}

function Get-ProcessIdentity {
  param([Parameter(Mandatory)]$Snapshot)

  $createdAt = Convert-ToUtcDateTime -Value $Snapshot.CreationDate
  if ($null -eq $createdAt) {
    throw "Could not normalize process creation time for PID $($Snapshot.ProcessId)."
  }
  return "{0}|{1}|{2}" -f $createdAt.Ticks, $Snapshot.ParentProcessId, $Snapshot.CommandLine
}

function Convert-ToUtcDateTime {
  param([Parameter(Mandatory)]$Value)

  if ($Value -is [DateTime]) {
    if ($Value.Kind -eq [DateTimeKind]::Unspecified) {
      return $null
    }
    return $Value.ToUniversalTime()
  }
  if ($Value -is [DateTimeOffset]) {
    return $Value.UtcDateTime
  }
  if ($Value -is [string]) {
    try {
      $parsed = [DateTime]::ParseExact(
        $Value,
        "o",
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::RoundtripKind
      )
      if ($parsed.Kind -eq [DateTimeKind]::Unspecified) {
        return $null
      }
      return $parsed.ToUniversalTime()
    } catch {
      return $null
    }
  }
  return $null
}

function Open-ProcessHandle {
  param([Parameter(Mandatory)][int]$ProcessId)

  try {
    $process = Get-Process -Id $ProcessId -ErrorAction Stop
    [void]$process.Handle
    return $process
  } catch {
    $snapshot = Get-ProcessSnapshot -ProcessId $ProcessId
    if ($null -eq $snapshot) {
      return $null
    }
    throw "Could not open process ${ProcessId} for a handle-bound stop: $($_.Exception.Message)"
  }
}

function Stop-VerifiedProcess {
  param(
    [Parameter(Mandatory)][int]$ProcessId,
    [Parameter(Mandatory)][string]$ExpectedIdentity,
    [Parameter(Mandatory)][string]$Description
  )

  $process = Open-ProcessHandle -ProcessId $ProcessId
  if ($null -eq $process) {
    return $false
  }
  try {
    $handleSnapshot = Get-ProcessSnapshot -ProcessId $ProcessId
    if ($null -eq $handleSnapshot) {
      return $false
    }
    if ((Get-ProcessIdentity $handleSnapshot) -cne $ExpectedIdentity) {
      throw "$Description $ProcessId changed before its handle-bound stop."
    }
    try {
      $process.Kill()
    } catch {
      if (-not $process.HasExited) {
        throw "Could not stop $Description ${ProcessId}: $($_.Exception.Message)"
      }
    }
    if (-not $process.WaitForExit(5000)) {
      throw "$Description $ProcessId did not exit after a verified handle-bound stop."
    }
    return $true
  } finally {
    $process.Dispose()
  }
}

function Get-ProcessTreeIds {
  param([Parameter(Mandatory)][int]$RootProcessId)

  $ids = [Collections.Generic.HashSet[int]]::new()
  [void]$ids.Add($RootProcessId)
  $pending = [Collections.Generic.Queue[int]]::new()
  $pending.Enqueue($RootProcessId)
  while ($pending.Count -gt 0) {
    $parentId = $pending.Dequeue()
    try {
      $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $parentId" -ErrorAction Stop)
    } catch {
      throw "Could not inspect children of process ${parentId}: $($_.Exception.Message)"
    }
    foreach ($child in $children) {
      $childId = [int]$child.ProcessId
      if ($ids.Add($childId)) {
        $pending.Enqueue($childId)
      }
    }
  }
  return ,$ids
}

function Test-StateProfileIdentity {
  param([Parameter(Mandatory)]$State)

  if ((($State.schemaVersion -isnot [int]) -and ($State.schemaVersion -isnot [long])) -or
      [int64]$State.schemaVersion -ne 1) {
    return $false
  }
  if ([string]::IsNullOrWhiteSpace([string]$State.repoRoot) -or
      [IO.Path]::GetFullPath([string]$State.repoRoot) -ne $repoRoot) {
    return $false
  }
  $stateRuntimeRoot = if ([string]::IsNullOrWhiteSpace([string]$State.runtimeRoot)) {
    if ($customRuntimeRoot) { $null } else { Join-Path $env:LOCALAPPDATA "keybr-local" }
  } else {
    [IO.Path]::GetFullPath([string]$State.runtimeRoot)
  }
  if ($null -eq $stateRuntimeRoot -or $stateRuntimeRoot -ne $runtimeRoot) {
    return $false
  }
  if ($customDataRoot -and
      [IO.Path]::GetFullPath([string]$State.dataRoot) -ne [IO.Path]::GetFullPath($DataRoot)) {
    return $false
  }
  $expectedCommandPath = [IO.Path]::GetFullPath((Join-Path $repoRoot "root\index.js"))
  if ([string]::IsNullOrWhiteSpace([string]$State.commandPath) -or
      [IO.Path]::GetFullPath([string]$State.commandPath) -ne $expectedCommandPath) {
    return $false
  }
  if ([int]$State.serverPort -ne $serverPort -or [int]$State.webSocketPort -ne $webSocketPort) {
    return $false
  }
  return $true
}

function Test-OwnedProcess {
  param(
    [Parameter(Mandatory)]$State,
    [switch]$RequireBuildMarker,
    $ProcessSnapshot
  )

  if (-not (Test-StateProfileIdentity -State $State) -or [int]$State.pid -le 0) {
    return $false
  }
  if ($Action -ceq "Start") {
    if ([string]::IsNullOrWhiteSpace([string]$State.nodeEnvironment)) {
      if ($NodeEnvironment -cne "development") {
        return $false
      }
    } elseif ([string]$State.nodeEnvironment -cne $NodeEnvironment) {
      return $false
    }
  }
  $expectedCommandPath = [IO.Path]::GetFullPath((Join-Path $repoRoot "root\index.js"))
  $snapshot = if ($null -ne $ProcessSnapshot) {
    $ProcessSnapshot
  } else {
    Get-ProcessSnapshot -ProcessId ([int]$State.pid)
  }
  if ($null -eq $snapshot) {
    return $false
  }
  $commandLine = [string]$snapshot.CommandLine
  $commandPathPattern = '(?i)(?:^|[\s"])' + [regex]::Escape($expectedCommandPath) + '(?:$|[\s"])'
  if ($commandLine -notmatch $commandPathPattern) {
    return $false
  }
  if ([string]::IsNullOrWhiteSpace([string]$State.processStartedAtUtc) -or
      $null -eq $snapshot.CreationDate) {
    return $false
  }
  try {
    $processCreatedAt = Convert-ToUtcDateTime -Value $snapshot.CreationDate
    $stateStartedAt = Convert-ToUtcDateTime -Value $State.processStartedAtUtc
    if ($null -eq $processCreatedAt -or $null -eq $stateStartedAt -or
        [Math]::Abs(($processCreatedAt - $stateStartedAt).TotalSeconds) -gt 2) {
      return $false
    }
  } catch {
    return $false
  }
  if ($RequireBuildMarker -and [string]$State.buildMarker -ne (Get-BuildMarker)) {
    return $false
  }
  return $true
}

function Test-StateIdentity {
  param([Parameter(Mandatory)]$State)
  return Test-StateProfileIdentity -State $State
}

function Get-ListeningConnections {
  param([Parameter(Mandatory)][int]$Port)

  try {
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop)
    return @($listeners | Where-Object { $_.LocalPort -eq $Port })
  } catch {
    throw "Could not inspect listener on port ${Port}: $($_.Exception.Message)"
  }
}

function Test-OwnedListeners {
  param([Parameter(Mandatory)]$State)

  if (-not (Test-OwnedProcess -State $State)) {
    return $false
  }
  $processIds = Get-ProcessTreeIds -RootProcessId ([int]$State.pid)
  foreach ($port in @($serverPort, $webSocketPort)) {
    $connections = @(Get-ListeningConnections -Port $port)
    if ($connections.Count -eq 0) {
      return $false
    }
    foreach ($connection in $connections) {
      if ($connection.LocalAddress -notin @("127.0.0.1", "::1")) {
        return $false
      }
      if (-not $processIds.Contains([int]$connection.OwningProcess)) {
        return $false
      }
    }
  }
  return $true
}

function Test-Ready {
  try {
    $response = Invoke-WebRequest -Uri "$canonicalOrigin/" -TimeoutSec 5 -MaximumRedirection 0
    if ($response.StatusCode -ne 200 -or $response.Content -notmatch "(?i)keybr") {
      return $false
    }
    $state = Get-State
    return $null -ne $state -and
      (Test-OwnedProcess -State $state -RequireBuildMarker) -and
      (Test-OwnedListeners -State $state)
  } catch {
    return $false
  }
}

function Assert-PortsAvailable {
  param($State)

  foreach ($port in @($serverPort, $webSocketPort)) {
    $connections = Get-ListeningConnections -Port $port
    if ($connections.Count -eq 0) {
      continue
    }
    if ($null -eq $State -or -not (Test-OwnedListeners -State $State)) {
      throw "Port $port is already occupied by a process that is not an owned keybr instance; provisioning was not attempted."
    }
  }
}

function New-LoginToken {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Invoke-Provisioning {
  param(
    [Parameter(Mandatory)][string]$NodePath,
    [string]$Token,
    [switch]$CheckOnly
  )

  $timestamp = "{0}-{1}" -f (Get-Date -Format "yyyyMMdd-HHmmss-fff"), ([guid]::NewGuid().ToString("N").Substring(0, 8))
  $stdoutPath = Join-Path $runtimeRoot "provision-$timestamp.out.log"
  $stderrPath = Join-Path $runtimeRoot "provision-$timestamp.err.log"
  Assert-SafeOutputFile -Path $stdoutPath
  Assert-SafeOutputFile -Path $stderrPath
  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $NodePath
  $arguments = "--enable-source-maps --import @keybr/tsl tools/provision-admin.js"
  if ($CheckOnly) {
    $arguments += " --check"
  }
  $startInfo.Arguments = $arguments
  $startInfo.WorkingDirectory = $repoRoot
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  foreach ($entry in (Get-LocalEnvironment).GetEnumerator()) {
    $startInfo.Environment[$entry.Key] = [string]$entry.Value
  }

  $process = [Diagnostics.Process]::new()
  try {
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
      throw "Could not start local provisioning."
    }
    if ($CheckOnly) {
      $process.StandardInput.Close()
    } else {
      $process.StandardInput.WriteLine($Token)
      $process.StandardInput.Close()
    }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit(30000)) {
      try { $process.Kill($true) } catch { }
      if (-not $process.WaitForExit(5000)) {
        try { $process.Kill($true) } catch { }
        [void]$process.WaitForExit(5000)
      }
      if (-not $process.HasExited) {
        throw "Local provisioning did not stop within the bounded cleanup timeout."
      }
      throw "Local provisioning timed out after 30 seconds."
    }
    $outputStopwatch = [Diagnostics.Stopwatch]::StartNew()
    while ((-not $stdoutTask.IsCompleted -or -not $stderrTask.IsCompleted) -and
        $outputStopwatch.Elapsed.TotalSeconds -lt 5) {
      Start-Sleep -Milliseconds 50
    }
    $outputStopwatch.Stop()
    if (-not $stdoutTask.IsCompleted -or -not $stderrTask.IsCompleted) {
      throw "Local provisioning output did not close within the bounded cleanup timeout."
    }
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    $stdoutSafe = if (-not [string]::IsNullOrEmpty($Token)) { $stdout.Replace($Token, "<redacted>") } else { $stdout }
    $stderrSafe = if (-not [string]::IsNullOrEmpty($Token)) { $stderr.Replace($Token, "<redacted>") } else { $stderr }
    $maxChildOutputChars = 1MB
    if ($stdoutSafe.Length -gt $maxChildOutputChars) {
      $stdoutSafe = $stdoutSafe.Substring(0, $maxChildOutputChars) + "`n[output truncated]"
    }
    if ($stderrSafe.Length -gt $maxChildOutputChars) {
      $stderrSafe = $stderrSafe.Substring(0, $maxChildOutputChars) + "`n[output truncated]"
    }
    $stdoutSafe | Set-Content -LiteralPath $stdoutPath -Encoding UTF8
    $stderrSafe | Set-Content -LiteralPath $stderrPath -Encoding UTF8
    if ($process.ExitCode -ne 0) {
      throw "Local provisioning failed with exit code $($process.ExitCode). See '$stderrPath'."
    }
    $configuration = $null
    foreach ($line in ($stdout -split "`r?`n")) {
      if ([string]::IsNullOrWhiteSpace($line)) {
        continue
      }
      try {
        $candidate = $line | ConvertFrom-Json
        if ($null -ne $candidate.dataDir -and $null -ne $candidate.databaseFilename) {
          $configuration = $candidate
          break
        }
      } catch {
        continue
      }
    }
    if ($null -eq $configuration) {
      throw "Local provisioning did not return a validated local data configuration. See '$stdoutPath'."
    }
    return $configuration
  } finally {
    $process.Dispose()
  }
}

function Start-OwnedServer {
  param(
    [Parameter(Mandatory)][string]$NodePath,
    [Parameter(Mandatory)]$Configuration
  )

  $timestamp = "{0}-{1}" -f (Get-Date -Format "yyyyMMdd-HHmmss-fff"), ([guid]::NewGuid().ToString("N").Substring(0, 8))
  $stdoutPath = Join-Path $runtimeRoot "server-$timestamp.out.log"
  $stderrPath = Join-Path $runtimeRoot "server-$timestamp.err.log"
  $commandPath = Join-Path $repoRoot "root\index.js"
  $buildMarker = Get-BuildMarker
  Assert-SafeOutputFile -Path $stdoutPath
  Assert-SafeOutputFile -Path $stderrPath
  $process = $null
  $processIdentity = $null
  try {
    $process = Start-Process `
      -FilePath $NodePath `
      -ArgumentList @("--enable-source-maps", ('"{0}"' -f $commandPath)) `
      -WorkingDirectory $repoRoot `
      -WindowStyle Hidden `
      -PassThru `
      -RedirectStandardOutput $stdoutPath `
      -RedirectStandardError $stderrPath
    $processSnapshot = Get-ProcessSnapshot -ProcessId $process.Id
    if ($null -eq $processSnapshot) {
      throw "The local keybr process exited before ownership could be recorded."
    }
    $processIdentity = Get-ProcessIdentity $processSnapshot

    $state = [ordered]@{
      schemaVersion = 1
      pid = $process.Id
      repoRoot = $repoRoot
      runtimeRoot = $runtimeRoot
      nodeEnvironment = $NodeEnvironment
      dataRoot = [string]$Configuration.dataDir
      databaseFilename = [string]$Configuration.databaseFilename
      commandPath = $commandPath
      serverPort = $serverPort
      webSocketPort = $webSocketPort
      buildMarker = $buildMarker
      processStartedAtUtc = $process.StartTime.ToUniversalTime().ToString("o")
      startedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    }
    if ((Test-Path -LiteralPath $statePath -PathType Leaf) -and
        (Get-Item -LiteralPath $statePath).Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) {
      throw "Launcher state path must not be a symbolic link or junction."
    }
    $temporaryStatePath = "$statePath.$PID.tmp"
    Assert-SafeOutputFile -Path $statePath
    Assert-SafeOutputFile -Path $temporaryStatePath
    if ((Test-Path -LiteralPath $temporaryStatePath -PathType Leaf) -and
        (Get-Item -LiteralPath $temporaryStatePath).Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) {
      throw "Temporary launcher state path must not be a symbolic link or junction."
    }
    $state | ConvertTo-Json | Set-Content -LiteralPath $temporaryStatePath -Encoding UTF8
    Move-Item -LiteralPath $temporaryStatePath -Destination $statePath -Force
  } catch {
    if ($null -ne $process -and -not [string]::IsNullOrWhiteSpace($processIdentity)) {
      Stop-VerifiedProcessTree -RootProcessId $process.Id -ExpectedIdentity $processIdentity
    } elseif ($null -ne $process) {
      try { $process.Kill($true) } catch { }
      [void]$process.WaitForExit(5000)
    }
    throw
  }
  return $process
}

function Stop-OrphanedWorkers {
  param(
    [Parameter(Mandatory)]$State,
    [hashtable]$KnownIdentities
  )

  if ($null -eq $KnownIdentities -or $KnownIdentities.Count -eq 0) {
    return
  }

  $commandPath = [IO.Path]::GetFullPath((Join-Path $repoRoot "root\index.js"))
  $commandPathPattern = '(?i)(?:^|[\s"])' + [regex]::Escape($commandPath) + '(?:$|[\s"])'
  $processIds = @($KnownIdentities.Keys | ForEach-Object { [int]$_ })
  foreach ($processId in $processIds) {
    if ([int]$processId -eq [int]$State.pid) {
      continue
    }
    $snapshot = Get-ProcessSnapshot -ProcessId ([int]$processId)
    if ($null -ne $snapshot -and
        (Get-ProcessIdentity $snapshot) -ceq $KnownIdentities[[int]$processId] -and
        ([string]$snapshot.CommandLine -match $commandPathPattern)) {
      [void](Stop-VerifiedProcess -ProcessId ([int]$processId) -ExpectedIdentity $KnownIdentities[[int]$processId] -Description "Orphaned keybr worker")
    }
  }
  foreach ($processId in $processIds) {
    if ([int]$processId -ne [int]$State.pid -and
        $null -ne (Get-ProcessSnapshot -ProcessId ([int]$processId))) {
      throw "An orphaned keybr worker $processId is still running."
    }
  }
}

function Complete-ExitedServer {
  param(
    [Parameter(Mandatory)]$State,
    [switch]$Quiet,
    [Parameter(Mandatory)][string]$Message
  )

  if (-not (Test-StateIdentity -State $State)) {
    throw "The stale keybr state does not identify this checkout, runtime root, and server profile; refusing to remove it."
  }
  $listeners = @(Get-ListeningConnections -Port $serverPort) + @(Get-ListeningConnections -Port $webSocketPort)
  if ($listeners.Count -gt 0) {
    throw "The owned keybr master exited but its listeners remain; refusing to remove state or touch an unverified process."
  }
  Remove-Item -LiteralPath $statePath -Force
  if (-not $Quiet) {
    Write-Output $Message
  }
}

function Stop-OwnedServer {
  param([switch]$Quiet)

  $state = Get-State
  if ($null -eq $state) {
    if (-not $Quiet) {
      Write-Output "No owned keybr instance is recorded."
    }
    return
  }
  if (-not (Test-OwnedProcess -State $state)) {
    $stalePid = Get-ProcessSnapshot -ProcessId ([int]$state.pid)
    if ($null -eq $stalePid) {
      Complete-ExitedServer -State $state -Quiet:$Quiet -Message "Removed stale keybr state after confirming that no owned listeners remained."
      return
    }
    throw "The recorded PID is not an owned keybr process; refusing to stop it. Verify '$statePath' and the listening ports manually."
  }

  $pidValue = [int]$state.pid
  $rootSnapshot = Get-ProcessSnapshot -ProcessId $pidValue
  if ($null -eq $rootSnapshot) {
    Complete-ExitedServer -State $state -Quiet:$Quiet -Message "Removed completed keybr state after the master process exited and no owned listeners remained."
    return
  }
  if (-not (Test-OwnedProcess -State $state -ProcessSnapshot $rootSnapshot)) {
    throw "The owned keybr process changed before stop; refusing to terminate it."
  }
  $rootIdentity = Get-ProcessIdentity $rootSnapshot
  $processIds = Get-ProcessTreeIds -RootProcessId $pidValue
  $workerIdentities = @{}
  foreach ($processId in $processIds) {
    $snapshot = Get-ProcessSnapshot -ProcessId ([int]$processId)
    if ($null -ne $snapshot) {
      $workerIdentities[[int]$processId] = Get-ProcessIdentity $snapshot
    }
  }
  [void](Stop-VerifiedProcess -ProcessId $pidValue -ExpectedIdentity $rootIdentity -Description "Owned keybr master process")
  $masterSnapshot = Get-ProcessSnapshot -ProcessId $pidValue
  if ($null -ne $masterSnapshot) {
    throw "The owned keybr master process changed before stop completed; refusing to terminate it again."
  }
  $listeners = @(Get-ListeningConnections -Port $serverPort) + @(Get-ListeningConnections -Port $webSocketPort)
  if ($null -eq $masterSnapshot -and $listeners.Count -gt 0) {
    Stop-OrphanedWorkers -State $state -KnownIdentities $workerIdentities
  }
  foreach ($processId in $processIds) {
    if ([int]$processId -eq $pidValue) {
      continue
    }
    $workerSnapshot = Get-ProcessSnapshot -ProcessId ([int]$processId)
    if ($null -ne $workerSnapshot) {
      if (-not $workerIdentities.ContainsKey([int]$processId)) {
        throw "Worker process $processId appeared without a verified identity; refusing to terminate it."
      }
      if ((Get-ProcessIdentity $workerSnapshot) -cne $workerIdentities[[int]$processId]) {
        throw "Worker process $processId changed before forced stop; refusing to terminate it."
      }
      $expectedCommandPath = [IO.Path]::GetFullPath((Join-Path $repoRoot "root\index.js"))
      $commandPathPattern = '(?i)(?:^|[\s"])' + [regex]::Escape($expectedCommandPath) + '(?:$|[\s"])'
      if ([string]$workerSnapshot.CommandLine -notmatch $commandPathPattern) {
        throw "Refusing to stop process $processId because its command does not belong to this keybr instance."
      }
      [void](Stop-VerifiedProcess -ProcessId ([int]$processId) -ExpectedIdentity $workerIdentities[[int]$processId] -Description "Owned keybr worker")
    }
  }
  foreach ($processId in $processIds) {
    if ([int]$processId -ne $pidValue -and
        $null -ne (Get-ProcessSnapshot -ProcessId ([int]$processId))) {
      throw "An owned keybr worker $processId is still running."
    }
  }
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    $listeners = @(Get-ListeningConnections -Port $serverPort) + @(Get-ListeningConnections -Port $webSocketPort)
    if ($listeners.Count -eq 0) {
      break
    }
    Start-Sleep -Milliseconds 250
  }
  if ((Get-ListeningConnections -Port $serverPort).Count -gt 0 -or (Get-ListeningConnections -Port $webSocketPort).Count -gt 0) {
    throw "Owned keybr process stopped but one of its listeners is still active."
  }
  Remove-Item -LiteralPath $statePath -Force
  if (-not $Quiet) {
    Write-Output "Stopped owned keybr instance $pidValue."
  }
}

function Write-SafeError {
  param(
    [Parameter(Mandatory)][string]$Message,
    [switch]$UseLauncherLog
  )

  try {
    if ($UseLauncherLog) {
      Write-LauncherLog ("ERROR: " + $Message)
    } else {
      [Console]::Error.WriteLine(("ERROR: " + $Message))
    }
  } catch {
    [Console]::Error.WriteLine(("ERROR: " + $Message))
  }
}

try {
  switch ($Action) {
    "Status" {
      $state = Get-State
      if ($null -eq $state) {
        Write-Output "No owned keybr instance is recorded."
      } elseif (Test-OwnedProcess -State $state) {
        Write-Output ("Owned keybr PID {0}; ready={1}; origin={2}" -f $state.pid, (Test-Ready), $canonicalOrigin)
      } else {
        Write-Output "Recorded keybr state is stale or does not identify the current process."
      }
      break
    }
    "Stop" {
      Enter-LaunchMutex
      if ($customRuntimeRoot -and (Test-Path -LiteralPath $runtimeRoot)) {
        Assert-NewProfileMarker -Path $runtimeRoot -MarkerPath $runtimeMarkerPath -Name "-RuntimeRoot" -ExistingOnly
        $customMarkerValidated = $true
      }
      if ($customDataRoot -and (Test-Path -LiteralPath $DataRoot)) {
        Assert-NewProfileMarker -Path $DataRoot -MarkerPath $dataMarkerPath -Name "-DataRoot" -ExistingOnly
      }
      Stop-OwnedServer
      break
    }
    "Start" {
      Enter-LaunchMutex
      $nodePath = Get-NodePath
      Clear-ProfileOverrides
      Set-ProfileOverrides
      Set-LocalEnvironment
      Assert-Build
      if ($customRuntimeRoot -and (Test-Path -LiteralPath $runtimeRoot)) {
        Assert-NewProfileMarker -Path $runtimeRoot -MarkerPath $runtimeMarkerPath -Name "-RuntimeRoot" -ExistingOnly
        $customMarkerValidated = $true
      }
      if ($customDataRoot -and (Test-Path -LiteralPath $DataRoot)) {
        Assert-NewProfileMarker -Path $DataRoot -MarkerPath $dataMarkerPath -Name "-DataRoot" -ExistingOnly
      }
      $state = Get-State
      if ($null -ne $state -and -not (Test-OwnedProcess -State $state)) {
        $stalePid = Get-ProcessSnapshot -ProcessId ([int]$state.pid)
        if ($null -eq $stalePid) {
          Complete-ExitedServer -State $state -Quiet -Message "Removed stale keybr state."
          $state = $null
        } else {
          throw "A recorded keybr process is not the current build or is not owned by this checkout. Stop it explicitly before starting again."
        }
      }
      Assert-PortsAvailable -State $state
      if ($customRuntimeRoot) {
        Assert-NewProfileMarker -Path $runtimeRoot -MarkerPath $runtimeMarkerPath -Name "-RuntimeRoot"
        $customMarkerValidated = $true
      }
      if ($customDataRoot) {
        Assert-NewProfileMarker -Path $DataRoot -MarkerPath $dataMarkerPath -Name "-DataRoot"
      }
      Ensure-RuntimeRoot

      $ready = $false
      if ($null -ne $state) {
        if (-not (Test-OwnedProcess -State $state -RequireBuildMarker)) {
          throw "A recorded keybr process is not the current build or is not owned by this checkout. Stop it explicitly before starting again."
        }
        $ready = Test-Ready
        if (-not $ready) {
          throw "The recorded keybr process is not ready; provisioning was not attempted."
        }
      }

      $configuration = Invoke-Provisioning -NodePath $nodePath -CheckOnly
      Assert-NoExternalHardlink -Path ([string]$configuration.databaseFilename) -Name "DATABASE_FILENAME"
      Assert-SafeDataDescendants -DataPath ([string]$configuration.dataDir)
      if ($null -ne $state -and
          ([string]$state.dataRoot -ne [string]$configuration.dataDir -or
           [string]$state.databaseFilename -ne [string]$configuration.databaseFilename)) {
        throw "The recorded keybr process uses a different local data profile; refusing to provision it."
      }
      $env:DATA_DIR = [string]$configuration.dataDir
      $env:DATABASE_FILENAME = [string]$configuration.databaseFilename
      $env:DATABASE_CLIENT = "sqlite"

      if (-not $ready) {
        $serverProcess = Start-OwnedServer -NodePath $nodePath -Configuration $configuration
        $startedServer = $true
        $readyStopwatch = [Diagnostics.Stopwatch]::StartNew()
        while ($readyStopwatch.Elapsed.TotalSeconds -lt 60) {
          if (Test-Ready) {
            $ready = $true
            break
          }
          if ($serverProcess.HasExited) {
            throw "The local keybr server exited with code $($serverProcess.ExitCode)."
          }
          Start-Sleep -Seconds 1
        }
        $readyStopwatch.Stop()
      }
      if (-not $ready) {
        throw "The local keybr server did not become ready within 60 seconds."
      }
      if (-not (Test-Ready)) {
        throw "The local keybr owner/listener changed before provisioning."
      }

      $loginToken = New-LoginToken
      [void](Invoke-Provisioning -NodePath $nodePath -Token $loginToken)

      Write-LauncherLog "Opening local login handoff and Russian practice page."
      Start-Process "${canonicalOrigin}/login/${loginToken}?redirect=%2Fru"
      break
    }
  }
} catch {
  $message = $_.Exception.Message
  if ($loginToken) {
    $message = $message.Replace($loginToken, "<redacted>")
  }
  $canWriteCustomLog = $customMarkerValidated
  Write-SafeError -Message $message -UseLauncherLog:$canWriteCustomLog
  if ($Action -eq "Start" -and $startedServer -and (Test-Path -LiteralPath $statePath)) {
    try {
      Stop-OwnedServer -Quiet
    } catch {
      $cleanupMessage = $_.Exception.Message
      if ($loginToken) {
        $cleanupMessage = $cleanupMessage.Replace($loginToken, "<redacted>")
      }
      Write-SafeError -Message ("cleanup failed: " + $cleanupMessage) -UseLauncherLog:$canWriteCustomLog
    }
  }
  throw $message
} finally {
  try {
    Restore-Environment
  } catch {
    [Console]::Error.WriteLine(("ERROR: Could not restore launcher environment: " + $_.Exception.Message))
  }
  if ($portMutexOwned -and $null -ne $portMutex) {
    try { [void]$portMutex.ReleaseMutex() } catch { }
    $portMutex.Dispose()
  }
}
