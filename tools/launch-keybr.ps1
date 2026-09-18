[CmdletBinding()]
param(
  [ValidateSet("Start", "Stop", "Status")]
  [string]$Action = "Start"
)

$ErrorActionPreference = "Stop"

if ($PSVersionTable.PSVersion.Major -lt 7) {
  throw "The personal launcher requires PowerShell 7 or newer (pwsh)."
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$runtimeRoot = Join-Path $env:LOCALAPPDATA "keybr-local"
$statePath = Join-Path $runtimeRoot "server.json"
$canonicalOrigin = "http://localhost:3000"
$serverPort = 3000
$webSocketPort = 3001
$publicRoot = Join-Path $repoRoot "root\public"
$taskkillPath = Join-Path $env:SystemRoot "System32\taskkill.exe"
$maxLauncherLogBytes = 1MB
$maxTimestampedLogGroups = 10
$startedServer = $false

function Ensure-RuntimeRoot {
  New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
}

function Write-LauncherLog {
  param([Parameter(Mandatory)][string]$Message)

  Ensure-RuntimeRoot
  $logPath = Join-Path $runtimeRoot "launcher.log"
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

function Stop-ProcessTree {
  param([Parameter(Mandatory)][int]$ProcessId)

  if (-not (Test-Path -LiteralPath $taskkillPath)) {
    throw "Windows taskkill.exe was not found at '$taskkillPath'."
  }
  & $taskkillPath /PID $ProcessId /T /F | Out-Null
  return $LASTEXITCODE
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
  $assetHash = (Get-FileHash -LiteralPath $assetManifest -Algorithm SHA256).Hash
  return "${serverHash}:${assetHash}"
}

function Assert-Build {
  [void](Get-BuildMarker)
}

function Get-State {
  if (-not (Test-Path -LiteralPath $statePath)) {
    return $null
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

function Test-OwnedProcess {
  param(
    [Parameter(Mandatory)]$State,
    [switch]$RequireBuildMarker
  )

  if ($State.schemaVersion -ne 1 -or [int]$State.pid -le 0) {
    return $false
  }
  if ([string]::IsNullOrWhiteSpace([string]$State.repoRoot) -or
      [IO.Path]::GetFullPath([string]$State.repoRoot) -ne $repoRoot) {
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
  $snapshot = Get-ProcessSnapshot -ProcessId ([int]$State.pid)
  if ($null -eq $snapshot) {
    return $false
  }
  $commandLine = [string]$snapshot.CommandLine
  $commandPathPattern = '(?i)(?:^|[\s"])' + [regex]::Escape($expectedCommandPath) + '(?:$|[\s"])'
  if ($commandLine -notmatch $commandPathPattern) {
    return $false
  }
  if ($RequireBuildMarker -and [string]$State.buildMarker -ne (Get-BuildMarker)) {
    return $false
  }
  return $true
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

function Test-LoopbackListeners {
  foreach ($port in @($serverPort, $webSocketPort)) {
    $connections = @(Get-ListeningConnections -Port $port)
    if ($connections.Count -eq 0) {
      return $false
    }
    foreach ($connection in $connections) {
      if ($connection.LocalAddress -notin @("127.0.0.1", "::1")) {
        return $false
      }
    }
  }
  return $true
}

function Test-Ready {
  param([switch]$RequireOwner)

  try {
    $response = Invoke-WebRequest -Uri "$canonicalOrigin/" -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -ne 200 -or $response.Content -notmatch "(?i)keybr") {
      return $false
    }
    if ($RequireOwner) {
      $state = Get-State
      return $null -ne $state -and
        (Test-OwnedProcess -State $state -RequireBuildMarker) -and
        (Test-OwnedListeners -State $state)
    }
    if (-not (Test-LoopbackListeners)) {
      return $false
    }
    return $true
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

  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $stdoutPath = Join-Path $runtimeRoot "provision-$timestamp.out.log"
  $stderrPath = Join-Path $runtimeRoot "provision-$timestamp.err.log"
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
  $startInfo.Environment["NODE_ENV"] = "development"
  $startInfo.Environment["SERVER_HOST"] = "127.0.0.1"
  $startInfo.Environment["SERVER_PORT"] = [string]$serverPort
  $startInfo.Environment["SERVER_PORT_WS"] = [string]$webSocketPort
  $startInfo.Environment["PUBLIC_DIR"] = $publicRoot
  $startInfo.Environment["APP_URL"] = "$canonicalOrigin/"
  $startInfo.Environment["COOKIE_DOMAIN"] = "localhost"
  $startInfo.Environment["COOKIE_PATH"] = "/"
  $startInfo.Environment["COOKIE_SECURE"] = "false"
  $startInfo.Environment["KNEX_DEBUG"] = ""
  $startInfo.Environment["LOG_LEVEL"] = "info"

  $process = [Diagnostics.Process]::new()
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
    $process.Kill()
    $process.WaitForExit()
    throw "Local provisioning timed out after 30 seconds."
  }
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  $maxChildOutputChars = 1MB
  if ($stdout.Length -gt $maxChildOutputChars) {
    $stdout = $stdout.Substring(0, $maxChildOutputChars) + "`n[output truncated]"
  }
  if ($stderr.Length -gt $maxChildOutputChars) {
    $stderr = $stderr.Substring(0, $maxChildOutputChars) + "`n[output truncated]"
  }

  $stdoutSafe = if (-not [string]::IsNullOrEmpty($Token)) { $stdout.Replace($Token, "<redacted>") } else { $stdout }
  $stderrSafe = if (-not [string]::IsNullOrEmpty($Token)) { $stderr.Replace($Token, "<redacted>") } else { $stderr }
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
}

function Start-OwnedServer {
  param(
    [Parameter(Mandatory)][string]$NodePath,
    [Parameter(Mandatory)]$Configuration
  )

  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $stdoutPath = Join-Path $runtimeRoot "server-$timestamp.out.log"
  $stderrPath = Join-Path $runtimeRoot "server-$timestamp.err.log"
  $commandPath = Join-Path $repoRoot "root\index.js"
  $buildMarker = Get-BuildMarker
  $process = Start-Process `
    -FilePath $NodePath `
    -ArgumentList @("--enable-source-maps", $commandPath) `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -PassThru `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath

  $state = [ordered]@{
    schemaVersion = 1
    pid = $process.Id
    repoRoot = $repoRoot
    dataRoot = [string]$Configuration.dataDir
    databaseFilename = [string]$Configuration.databaseFilename
    commandPath = $commandPath
    serverPort = $serverPort
    webSocketPort = $webSocketPort
    buildMarker = $buildMarker
    startedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
  }
  try {
    $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
  } catch {
    $taskkillExit = Stop-ProcessTree -ProcessId $process.Id
    if ($taskkillExit -ne 0 -and $null -ne (Get-ProcessSnapshot -ProcessId $process.Id)) {
      throw "Could not clean up the unrecorded keybr process $($process.Id) (taskkill exit $taskkillExit)."
    }
    throw
  }
  return $process
}

function Stop-OrphanedWorkers {
  param([Parameter(Mandatory)]$State)

  $commandPath = [IO.Path]::GetFullPath((Join-Path $repoRoot "root\index.js"))
  $commandPathPattern = '(?i)(?:^|[\s"])' + [regex]::Escape($commandPath) + '(?:$|[\s"])'
  $processIds = Get-ProcessTreeIds -RootProcessId ([int]$State.pid)
  foreach ($processId in $processIds) {
    if ([int]$processId -eq [int]$State.pid) {
      continue
    }
    $snapshot = Get-ProcessSnapshot -ProcessId ([int]$processId)
    if ($null -ne $snapshot -and ([string]$snapshot.CommandLine -match $commandPathPattern)) {
      $taskkillExit = Stop-ProcessTree -ProcessId ([int]$processId)
      if ($taskkillExit -ne 0 -and $null -ne (Get-ProcessSnapshot -ProcessId ([int]$processId))) {
        throw "Could not stop orphaned keybr worker $processId (taskkill exit $taskkillExit)."
      }
    }
  }
  foreach ($processId in $processIds) {
    if ([int]$processId -ne [int]$State.pid -and
        $null -ne (Get-ProcessSnapshot -ProcessId ([int]$processId))) {
      throw "An orphaned keybr worker $processId is still running."
    }
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
    $listeners = @(Get-ListeningConnections -Port $serverPort) + @(Get-ListeningConnections -Port $webSocketPort)
    if ($null -eq $stalePid) {
      Stop-OrphanedWorkers -State $state
      $listeners = @(Get-ListeningConnections -Port $serverPort) + @(Get-ListeningConnections -Port $webSocketPort)
    }
    if ($null -eq $stalePid -and $listeners.Count -eq 0) {
      Remove-Item -LiteralPath $statePath -Force
      if (-not $Quiet) {
        Write-Output "Removed stale keybr state without touching a process."
      }
      return
    }
    throw "The recorded PID is not an owned keybr process; refusing to stop it. Verify '$statePath' and the listening ports manually."
  }

  $pidValue = [int]$state.pid
  $processIds = Get-ProcessTreeIds -RootProcessId $pidValue
  Stop-Process -Id $pidValue -ErrorAction SilentlyContinue
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    if ($null -eq (Get-ProcessSnapshot -ProcessId $pidValue)) {
      break
    }
    Start-Sleep -Milliseconds 250
  }
  $masterSnapshot = Get-ProcessSnapshot -ProcessId $pidValue
  if ($null -ne $masterSnapshot) {
    $taskkillExit = Stop-ProcessTree -ProcessId $pidValue
    if ($taskkillExit -ne 0 -and $null -ne (Get-ProcessSnapshot -ProcessId $pidValue)) {
      throw "Could not stop owned keybr process tree $pidValue (taskkill exit $taskkillExit)."
    }
  }
  $listeners = @(Get-ListeningConnections -Port $serverPort) + @(Get-ListeningConnections -Port $webSocketPort)
  if ($null -eq $masterSnapshot -and $listeners.Count -gt 0) {
    Stop-OrphanedWorkers -State $state
  }
  foreach ($processId in $processIds) {
    if ([int]$processId -eq $pidValue) {
      continue
    }
    if ($null -ne (Get-ProcessSnapshot -ProcessId ([int]$processId))) {
      $taskkillExit = Stop-ProcessTree -ProcessId ([int]$processId)
      if ($taskkillExit -ne 0 -and $null -ne (Get-ProcessSnapshot -ProcessId ([int]$processId))) {
        throw "Could not stop owned keybr worker $processId (taskkill exit $taskkillExit)."
      }
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

try {
  Ensure-RuntimeRoot

  switch ($Action) {
    "Status" {
      $state = Get-State
      if ($null -eq $state) {
        Write-Output "No owned keybr instance is recorded."
      } elseif (Test-OwnedProcess -State $state) {
        Write-Output ("Owned keybr PID {0}; ready={1}; origin={2}" -f $state.pid, (Test-Ready -RequireOwner), $canonicalOrigin)
      } else {
        Write-Output "Recorded keybr state is stale or does not identify the current process."
      }
      break
    }
    "Stop" {
      Stop-OwnedServer
      break
    }
    "Start" {
      $nodePath = Get-NodePath
      Clear-ProfileOverrides
      $env:NODE_ENV = "development"
      $env:SERVER_HOST = "127.0.0.1"
      $env:SERVER_PORT = [string]$serverPort
      $env:SERVER_PORT_WS = [string]$webSocketPort
      $env:PUBLIC_DIR = $publicRoot
      $env:APP_URL = "$canonicalOrigin/"
      $env:COOKIE_DOMAIN = "localhost"
      $env:COOKIE_PATH = "/"
      $env:COOKIE_SECURE = "false"
      $env:KNEX_DEBUG = ""
      $env:LOG_LEVEL = "info"
      Assert-Build
      $state = Get-State
      if ($null -ne $state -and -not (Test-OwnedProcess -State $state)) {
        $stalePid = Get-ProcessSnapshot -ProcessId ([int]$state.pid)
        if ($null -eq $stalePid) {
          Stop-OrphanedWorkers -State $state
        }
        $listeners = @(Get-ListeningConnections -Port $serverPort) + @(Get-ListeningConnections -Port $webSocketPort)
        if ($null -eq $stalePid -and $listeners.Count -eq 0) {
          Remove-Item -LiteralPath $statePath -Force
          $state = $null
        } else {
          throw "A recorded keybr process is not the current build or is not owned by this checkout. Stop it explicitly before starting again."
        }
      }
      Assert-PortsAvailable -State $state

      $ready = $false
      if ($null -ne $state) {
        if (-not (Test-OwnedProcess -State $state -RequireBuildMarker)) {
          throw "A recorded keybr process is not the current build or is not owned by this checkout. Stop it explicitly before starting again."
        }
        $ready = Test-Ready -RequireOwner
        if (-not $ready) {
          throw "The recorded keybr process is not ready; provisioning was not attempted."
        }
      }

      $configuration = Invoke-Provisioning -NodePath $nodePath -CheckOnly
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
        for ($attempt = 0; $attempt -lt 60; $attempt++) {
          if (Test-Ready -RequireOwner) {
            $ready = $true
            break
          }
          if ($serverProcess.HasExited) {
            throw "The local keybr server exited with code $($serverProcess.ExitCode)."
          }
          Start-Sleep -Seconds 1
        }
      }
      if (-not $ready) {
        throw "The local keybr server did not become ready within 60 seconds."
      }

      $loginToken = New-LoginToken
      [void](Invoke-Provisioning -NodePath $nodePath -Token $loginToken)

      Write-LauncherLog "Opening local login handoff and Russian practice page."
      Start-Process "$canonicalOrigin/login/$loginToken?redirect=%2Fru"
      break
    }
  }
} catch {
  $message = $_.Exception.Message
  if ($loginToken) {
    $message = $message.Replace($loginToken, "<redacted>")
  }
  Write-LauncherLog ("ERROR: " + $message)
  if ($Action -eq "Start" -and $startedServer -and (Test-Path -LiteralPath $statePath)) {
    try {
      Stop-OwnedServer -Quiet
    } catch {
      Write-LauncherLog ("ERROR: cleanup failed: " + $_.Exception.Message)
    }
  }
  throw
}
