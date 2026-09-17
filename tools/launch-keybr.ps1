[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $env:LOCALAPPDATA "keybr-local"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$launcherLog = Join-Path $runtimeRoot "launcher.log"
$provisionOut = Join-Path $runtimeRoot "provision-$timestamp.out.log"
$provisionErr = Join-Path $runtimeRoot "provision-$timestamp.err.log"
$serverOut = Join-Path $runtimeRoot "server-$timestamp.out.log"
$serverErr = Join-Path $runtimeRoot "server-$timestamp.err.log"

New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null

function Write-LauncherLog {
  param([Parameter(Mandatory)][string]$Message)

  Add-Content -LiteralPath $launcherLog -Value ("{0:u} {1}" -f (Get-Date), $Message) -Encoding UTF8
}

function Test-KeybrReady {
  try {
    $response = Invoke-WebRequest `
      -Uri "http://127.0.0.1:3000/" `
      -UseBasicParsing `
      -TimeoutSec 2
    return $response.StatusCode -eq 200 -and $response.Content -match "keybr"
  } catch {
    return $false
  }
}

try {
  if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "root\index.js"))) {
    throw "The project entry point was not found under '$repoRoot'."
  }

  $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
  $env:NODE_ENV = "development"

  Write-LauncherLog "Provisioning local admin account."
  $provision = Start-Process `
    -FilePath $nodePath `
    -ArgumentList @(
      "--enable-source-maps",
      "--import",
      "@keybr/tsl",
      "tools/provision-admin.js"
    ) `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -Wait `
    -PassThru `
    -RedirectStandardOutput $provisionOut `
    -RedirectStandardError $provisionErr

  if ($provision.ExitCode -ne 0) {
    throw "Admin provisioning failed with exit code $($provision.ExitCode). See '$provisionErr'."
  }

  $ready = Test-KeybrReady
  if (-not $ready) {
    Write-LauncherLog "Starting local keybr server."
    $serverProcess = Start-Process `
      -FilePath $nodePath `
      -ArgumentList @("--enable-source-maps", "./root/index.js") `
      -WorkingDirectory $repoRoot `
      -WindowStyle Hidden `
      -PassThru `
      -RedirectStandardOutput $serverOut `
      -RedirectStandardError $serverErr

    for ($attempt = 0; $attempt -lt 60; $attempt++) {
      if (Test-KeybrReady) {
        $ready = $true
        break
      }
      if ($serverProcess.HasExited) {
        throw "The local keybr server exited with code $($serverProcess.ExitCode). See '$serverErr'."
      }
      Start-Sleep -Seconds 1
    }
  }

  if (-not $ready) {
    throw "The local keybr server did not become ready within 60 seconds. See '$serverErr'."
  }

  Write-LauncherLog "Opening local Russian practice page."
  Start-Process "http://localhost:3000/ru"
} catch {
  Write-LauncherLog ("ERROR: " + $_.Exception.Message)
  exit 1
}
