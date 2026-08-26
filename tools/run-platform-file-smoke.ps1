Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$distIndexPath = Join-Path $root "dist\index.html"

if (-not (Test-Path $distIndexPath)) {
  throw "dist/index.html was not found: $distIndexPath"
}

$browserPath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $browserPath)) {
  throw "Edge was not found at $browserPath"
}

$tempRoot = Join-Path $env:TEMP "quizarena-platform-file-smoke"
if (Test-Path $tempRoot) {
  Remove-Item $tempRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $tempRoot | Out-Null

function Assert-RouteMarkup {
  param(
    [string]$HashRoute,
    [string[]]$MustContain,
    [string[]]$MustNotContain
  )

  $profile = Join-Path $tempRoot ($HashRoute.TrimStart('#/').Replace('/', '-') + "-profile")
  New-Item -ItemType Directory -Path $profile | Out-Null

  $stdout = Join-Path $tempRoot ($HashRoute.TrimStart('#/').Replace('/', '-') + "-stdout.txt")
  $stderr = Join-Path $tempRoot ($HashRoute.TrimStart('#/').Replace('/', '-') + "-stderr.txt")

  $encoded = ((Resolve-Path $distIndexPath).Path).Replace('\', '/').Replace(' ', '%20')
  $url = "file:///$encoded$HashRoute"
  $args = @(
    "--headless"
    "--disable-gpu"
    "--no-first-run"
    "--no-default-browser-check"
    """--user-data-dir=$profile"""
    "--dump-dom"
    """$url"""
  )

  $process = Start-Process `
    -FilePath $browserPath `
    -ArgumentList $args `
    -Wait `
    -PassThru `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr

  if ($process.ExitCode -ne 0) {
    throw "Edge headless exited with code $($process.ExitCode) while checking route $HashRoute"
  }

  $dom = Get-Content $stdout -Raw

  foreach ($needle in $MustContain) {
    if ($dom -notmatch [regex]::Escape($needle)) {
      throw "Route $HashRoute did not contain expected markup: $needle"
    }
  }

  foreach ($needle in $MustNotContain) {
    if ($dom -match [regex]::Escape($needle)) {
      throw "Route $HashRoute still contained disallowed markup: $needle"
    }
  }
}

Assert-RouteMarkup -HashRoute "#/" -MustContain @("hub-stage", "Quizler", "Quizler Jeopardy") -MustNotContain @("Launching the platform shell...")
Assert-RouteMarkup -HashRoute "#/wordle" -MustContain @("Wordle", "wordle-board") -MustNotContain @("Launching the platform shell...")
Assert-RouteMarkup -HashRoute "#/hangman" -MustContain @("Hangman", "hangman-answer-row") -MustNotContain @("Launching the platform shell...")
Assert-RouteMarkup -HashRoute "#/jeopardy" -MustContain @("Quizler Jeopardy", "legacy-jeopardy-frame") -MustNotContain @("Launching the platform shell...")

Write-Host "Platform file-mode smoke passed for lobby, Wordle, Hangman, and the flagship board route." -ForegroundColor Green
