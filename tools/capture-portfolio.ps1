Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$distIndexPath = Join-Path $root "dist\index.html"
$outputDir = Join-Path $root "artifacts\portfolio-captures"

if (-not (Test-Path $distIndexPath)) {
  throw "dist/index.html was not found: $distIndexPath"
}

$browserCandidates = @(
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)
$browserPath = $browserCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browserPath) {
  throw "Microsoft Edge was not found."
}

if (Test-Path $outputDir) {
  Remove-Item $outputDir -Recurse -Force
}
New-Item -ItemType Directory -Path $outputDir | Out-Null

$tempRoot = Join-Path $env:TEMP "quizarena-portfolio-capture"
if (Test-Path $tempRoot) {
  Remove-Item $tempRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $tempRoot | Out-Null

function Stop-BrowserTree {
  param([System.Diagnostics.Process]$Process)

  if ($Process -and -not $Process.HasExited) {
    try {
      & taskkill.exe /PID $Process.Id /T /F 2>$null | Out-Null
    }
    catch {
      Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    }
  }

  # On hosted CI, Edge can detach renderer processes from the launcher process.
  # The runner is dedicated to this job, so clear any remaining Edge processes
  # before starting the next isolated screenshot session.
  if ($env:GITHUB_ACTIONS -eq "true") {
    Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  }
}

function Capture-Route {
  param(
    [string]$Name,
    [string]$HashRoute
  )

  $encoded = ((Resolve-Path $distIndexPath).Path).Replace('\', '/').Replace(' ', '%20')
  $url = "file:///$encoded$HashRoute"
  $outputPath = Join-Path $outputDir "$Name.png"
  $lastFailure = $null

  for ($attempt = 1; $attempt -le 2; $attempt += 1) {
    if ($env:GITHUB_ACTIONS -eq "true") {
      Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    }

    if (Test-Path $outputPath) {
      Remove-Item $outputPath -Force
    }

    $profile = Join-Path $tempRoot "$Name-profile-$attempt"
    if (Test-Path $profile) {
      Remove-Item $profile -Recurse -Force
    }
    New-Item -ItemType Directory -Path $profile | Out-Null

    $args = @(
      "--headless"
      "--disable-gpu"
      "--disable-background-networking"
      "--disable-extensions"
      "--hide-scrollbars"
      "--no-first-run"
      "--no-default-browser-check"
      "--run-all-compositor-stages-before-draw"
      "--virtual-time-budget=2200"
      "--window-size=1440,900"
      "--force-device-scale-factor=1"
      """--user-data-dir=$profile"""
      """--screenshot=$outputPath"""
      """$url"""
    )

    $process = Start-Process -FilePath $browserPath -ArgumentList $args -PassThru
    $deadline = (Get-Date).AddSeconds(45)

    while ((Get-Date) -lt $deadline) {
      if (Test-Path $outputPath) {
        break
      }
      if ($process.HasExited -and $process.ExitCode -ne 0) {
        $lastFailure = "Edge headless exited with code $($process.ExitCode) while capturing $HashRoute"
        break
      }
      Start-Sleep -Milliseconds 250
    }

    if (Test-Path $outputPath) {
      Start-Sleep -Milliseconds 500
      Stop-BrowserTree -Process $process
      Start-Sleep -Milliseconds 500
      Write-Host "Captured $Name -> $outputPath" -ForegroundColor Green
      return
    }

    Stop-BrowserTree -Process $process
    if (-not $lastFailure) {
      $lastFailure = "Screenshot was not created within 45 seconds: $outputPath"
    }

    if ($attempt -lt 2) {
      Write-Host "Capture attempt $attempt failed for $Name. Retrying with a fresh browser profile..." -ForegroundColor Yellow
      Start-Sleep -Seconds 1
    }
  }

  throw "$lastFailure Capture failed after 2 attempts."
}

# Hangman has the largest staged image set, so capture it before other browser sessions.
Capture-Route -Name "hangman" -HashRoute "#/hangman"
Capture-Route -Name "lobby" -HashRoute "#/"
Capture-Route -Name "wordle" -HashRoute "#/wordle"
Capture-Route -Name "jeopardy" -HashRoute "#/jeopardy?portfolioCapture=1"

Write-Host "Portfolio screenshots captured in $outputDir" -ForegroundColor Green
