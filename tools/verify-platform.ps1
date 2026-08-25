Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

function Resolve-NpmCommand {
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($npm) {
    return @{
      Command = $npm.Source
      NodeDir = $null
    }
  }

  $portableDir = Join-Path $env:TEMP "quizarena-node\node-v24.14.1-win-x64"
  $portableNpm = Join-Path $portableDir "npm.cmd"
  $portableNode = Join-Path $portableDir "node.exe"
  if ((Test-Path $portableNpm) -and (Test-Path $portableNode)) {
    return @{
      Command = $portableNpm
      NodeDir = $portableDir
    }
  }

  throw "Could not find npm.cmd on PATH or in the portable temp runtime."
}

Push-Location $root
try {
  if (Test-Path ".\tools\prepare-platform-assets.ps1") {
    try {
      Write-Host "[0/8] Refreshing platform asset pack..." -ForegroundColor Cyan
      & powershell -ExecutionPolicy Bypass -File ".\tools\prepare-platform-assets.ps1"
    }
    catch {
      Write-Warning "Platform asset prep skipped: $($_.Exception.Message)"
    }
  }

  Write-Host "[1/8] Auditing authored Jeopardy expansion sources..." -ForegroundColor Cyan
  & node ".\tools\audit-jeopardy-authored-sources.cjs"
  if ($LASTEXITCODE -ne 0) {
    throw "Authored Jeopardy source audit failed with exit code $LASTEXITCODE."
  }

  Write-Host "[2/8] Rebuilding Jeopardy bank..." -ForegroundColor Cyan
  & powershell -ExecutionPolicy Bypass -File ".\tools\build-jeopardy-bank.ps1"

  Write-Host "[3/8] Running legacy Jeopardy smoke harness..." -ForegroundColor Cyan
  & powershell -ExecutionPolicy Bypass -File ".\tools\run-jeopardy-runtime-smoke.ps1"

  Write-Host "[4/8] Syncing legacy runtime into Vite public assets..." -ForegroundColor Cyan
  & powershell -ExecutionPolicy Bypass -File ".\tools\sync-legacy-runtime.ps1"

  Write-Host "[5/8] Auditing Jeopardy content and generated/runtime parity..." -ForegroundColor Cyan
  & node ".\tools\validate-jeopardy-bank.cjs"
  if ($LASTEXITCODE -ne 0) {
    throw "Jeopardy bank audit failed with exit code $LASTEXITCODE."
  }

  Write-Host "[6/8] Building Vite platform shell..." -ForegroundColor Cyan
  $npm = Resolve-NpmCommand
  if ($npm.NodeDir) {
    $env:Path = "$($npm.NodeDir);$env:Path"
  }
  & $npm.Command run build

  Write-Host "[7/8] Verifying the file-safe platform shell..." -ForegroundColor Cyan
  & powershell -ExecutionPolicy Bypass -File ".\tools\run-platform-file-smoke.ps1"

  Write-Host "[8/8] Platform verification complete." -ForegroundColor Green
}
finally {
  Pop-Location
}
