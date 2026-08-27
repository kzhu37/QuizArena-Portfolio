Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$distIndexPath = Join-Path $root "dist\index.html"
$outputDir = Join-Path $root "artifacts\portfolio-captures"
$previewHost = "127.0.0.1"
$previewPort = 4173
$previewBase = "http://${previewHost}:${previewPort}/"

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

function Stop-ProcessTree {
  param([System.Diagnostics.Process]$Process)

  if ($Process -and -not $Process.HasExited) {
    try {
      & taskkill.exe /PID $Process.Id /T /F 2>$null | Out-Null
    }
    catch {
      Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    }
  }
}

function Stop-BrowserTree {
  param([System.Diagnostics.Process]$Process)

  Stop-ProcessTree -Process $Process
  if ($env:GITHUB_ACTIONS -eq "true") {
    Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  }
}

function Wait-ForPreview {
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $previewBase -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return
      }
    }
    catch {
      Start-Sleep -Milliseconds 400
    }
  }
  throw "Vite preview server did not become ready at $previewBase within 30 seconds."
}

function Capture-Route {
  param(
    [string]$Name,
    [string]$HashRoute
  )

  $url = "$previewBase$HashRoute"
  $outputPath = Join-Path $outputDir "$Name.png"
  $lastFailure = $null
  $maxAttempts = 4

  for ($attempt = 1; $attempt -le $maxAttempts; $attempt += 1) {
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

    $stdout = Join-Path $tempRoot "$Name-stdout-$attempt.txt"
    $stderr = Join-Path $tempRoot "$Name-stderr-$attempt.txt"
    $args = @(
      "--headless"
      "--disable-gpu"
      "--disable-background-networking"
      "--disable-extensions"
      "--hide-scrollbars"
      "--no-first-run"
      "--no-default-browser-check"
      "--run-all-compositor-stages-before-draw"
      "--virtual-time-budget=5000"
      "--window-size=1440,900"
      "--force-device-scale-factor=1"
      "--user-data-dir=$profile"
      "--screenshot=$outputPath"
      $url
    )

    $process = Start-Process `
      -FilePath $browserPath `
      -ArgumentList $args `
      -PassThru `
      -RedirectStandardOutput $stdout `
      -RedirectStandardError $stderr

    $finished = $process.WaitForExit(45000)
    if (-not $finished) {
      $lastFailure = "Edge did not exit within 45 seconds while capturing $HashRoute."
      Stop-BrowserTree -Process $process
    }
    elseif ($process.ExitCode -ne 0) {
      $lastFailure = "Edge headless exited with code $($process.ExitCode) while capturing $HashRoute."
    }

    if (Test-Path $outputPath) {
      $file = Get-Item $outputPath
      if ($file.Length -gt 1024) {
        Stop-BrowserTree -Process $process
        Write-Host "Captured $Name -> $outputPath ($($file.Length) bytes)" -ForegroundColor Green
        return
      }
      $lastFailure = "Screenshot file was created but was unexpectedly small: $($file.Length) bytes."
    }

    if (Test-Path $stderr) {
      $stderrText = Get-Content $stderr -Raw
      if ($stderrText) {
        Write-Warning "Edge stderr for $Name attempt ${attempt}:`n$stderrText"
      }
    }

    Stop-BrowserTree -Process $process
    if (-not $lastFailure) {
      $lastFailure = "Screenshot was not created: $outputPath"
    }

    if ($attempt -lt $maxAttempts) {
      Write-Host "Capture attempt $attempt failed for $Name. Retrying with a fresh browser profile..." -ForegroundColor Yellow
      Start-Sleep -Seconds 1
    }
  }

  throw "$lastFailure Capture failed after $maxAttempts attempts."
}

$previewStdout = Join-Path $tempRoot "preview-stdout.txt"
$previewStderr = Join-Path $tempRoot "preview-stderr.txt"
$previewProcess = $null

try {
  $previewProcess = Start-Process `
    -FilePath "npm.cmd" `
    -ArgumentList @("run", "preview", "--", "--host", $previewHost, "--port", "$previewPort", "--strictPort") `
    -WorkingDirectory $root `
    -PassThru `
    -RedirectStandardOutput $previewStdout `
    -RedirectStandardError $previewStderr

  Wait-ForPreview

  Capture-Route -Name "lobby" -HashRoute "#/?portfolioCapture=1"
  Capture-Route -Name "wordle" -HashRoute "#/wordle?portfolioCapture=1"
  Capture-Route -Name "jeopardy" -HashRoute "#/jeopardy?portfolioCapture=1"
  Capture-Route -Name "hangman" -HashRoute "#/hangman?portfolioCapture=1"

  Write-Host "Portfolio screenshots captured in $outputDir" -ForegroundColor Green
}
finally {
  Stop-ProcessTree -Process $previewProcess
}
