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

function Capture-Route {
  param(
    [string]$Name,
    [string]$HashRoute
  )

  $profile = Join-Path $tempRoot "$Name-profile"
  New-Item -ItemType Directory -Path $profile | Out-Null

  $encoded = ((Resolve-Path $distIndexPath).Path).Replace('\', '/').Replace(' ', '%20')
  $url = "file:///$encoded$HashRoute"
  $outputPath = Join-Path $outputDir "$Name.png"

  $args = @(
    "--headless"
    "--disable-gpu"
    "--hide-scrollbars"
    "--no-first-run"
    "--no-default-browser-check"
    "--run-all-compositor-stages-before-draw"
    "--virtual-time-budget=1800"
    "--window-size=1440,900"
    "--force-device-scale-factor=1"
    """--user-data-dir=$profile"""
    """--screenshot=$outputPath"""
    """$url"""
  )

  $process = Start-Process -FilePath $browserPath -ArgumentList $args -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "Edge headless exited with code $($process.ExitCode) while capturing $HashRoute"
  }

  if (-not (Test-Path $outputPath)) {
    throw "Screenshot was not created: $outputPath"
  }

  Write-Host "Captured $Name -> $outputPath" -ForegroundColor Green
}

Capture-Route -Name "lobby" -HashRoute "#/"
Capture-Route -Name "wordle" -HashRoute "#/wordle"
Capture-Route -Name "jeopardy" -HashRoute "#/jeopardy"
Capture-Route -Name "hangman" -HashRoute "#/hangman"

Write-Host "Portfolio screenshots captured in $outputDir" -ForegroundColor Green
