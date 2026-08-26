Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$harnessPath = Join-Path $root "tools/jeopardy-runtime-smoke.html"

if (-not (Test-Path $harnessPath)) {
  throw "Smoke harness not found: $harnessPath"
}

$tempRoot = Join-Path $env:TEMP "jeopardy-runtime-smoke"
if (Test-Path $tempRoot) {
  Remove-Item $tempRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $tempRoot | Out-Null

$profile = Join-Path $tempRoot "profile"
New-Item -ItemType Directory -Path $profile | Out-Null

$stdout = Join-Path $tempRoot "stdout.txt"
$stderr = Join-Path $tempRoot "stderr.txt"

$encodedHarnessPath = ((Resolve-Path $harnessPath).Path -replace '\\', '/') -replace ' ', '%20'
$url = "file:///$encodedHarnessPath"

$browserPath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $browserPath)) {
  throw "Edge was not found at $browserPath"
}

$args = @(
  "--headless"
  "--disable-gpu"
  "--no-first-run"
  "--no-default-browser-check"
  """--user-data-dir=$profile"""
  "--allow-file-access-from-files"
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
  Write-Host "Edge headless exited with code $($process.ExitCode)." -ForegroundColor Red
}

if (Test-Path $stderr) {
  $stderrText = Get-Content $stderr -Raw
  if ($null -ne $stderrText -and $stderrText.Trim()) {
    Write-Host "[browser stderr]" -ForegroundColor Yellow
    Write-Host $stderrText
  }
}

if (-not (Test-Path $stdout)) {
  throw "Smoke harness did not produce DOM output."
}

$dom = Get-Content $stdout -Raw
Write-Output $dom

if ($dom -notmatch 'data-smoke-status="pass"') {
  throw "Jeopardy runtime smoke harness reported failure."
}
