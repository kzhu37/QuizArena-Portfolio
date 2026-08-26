Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

function Resolve-NodeTools {
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($npm) {
    $nodeSource = Split-Path -Parent $npm.Source
    return @{
      NodeDir = $nodeSource
      Esbuild = Join-Path $root "node_modules\.bin\esbuild.cmd"
    }
  }

  $portableDir = Join-Path $env:TEMP "quizarena-node\node-v24.14.1-win-x64"
  $portableNpm = Join-Path $portableDir "npm.cmd"
  if (Test-Path $portableNpm) {
    return @{
      NodeDir = $portableDir
      Esbuild = Join-Path $root "node_modules\.bin\esbuild.cmd"
    }
  }

  throw "Could not find a Node runtime for the file-safe shell build."
}

Push-Location $root
try {
  $tools = Resolve-NodeTools
  $env:Path = "$($tools.NodeDir);$env:Path"

  $esbuild = $tools.Esbuild
  if (-not (Test-Path $esbuild)) {
    throw "esbuild was not found at $esbuild"
  }

  if (-not (Test-Path ".\dist")) {
    New-Item -ItemType Directory -Path ".\dist" | Out-Null
  }

  & $esbuild `
    ".\src\main.tsx" `
    --bundle `
    --platform=browser `
    --format=iife `
    --target=es2019 `
    --jsx=automatic `
    --alias:wordle-words=./node_modules/wordle-words/index.mjs `
    --outfile=".\dist\file-shell.js"

  if ($LASTEXITCODE -ne 0) {
    throw "esbuild failed while creating the file-safe shell bundle."
  }

  $distIndex = Join-Path $root "dist\index.html"
  if (-not (Test-Path $distIndex)) {
    throw "dist/index.html was not found after the main build."
  }

  $html = Get-Content -Path $distIndex -Raw
  $html = [regex]::Replace($html, '\s*<script type="module"[^>]*></script>', '')
  $html = [regex]::Replace($html, '\s*<link rel="stylesheet"[^>]*href="\./assets/[^"]+\.css"[^>]*>', '')
  $html = [regex]::Replace($html, '\s*<link rel="stylesheet" href="\./file-shell\.css"\s*/?>', '')
  $html = [regex]::Replace($html, '\s*<script src="\./file-shell\.js"></script>', '')
  $html = $html -replace '</head>', "    <link rel=`"stylesheet`" href=`"./file-shell.css`" />`r`n  </head>"
  $html = $html -replace '</body>', "    <script src=`"./file-shell.js`"></script>`r`n  </body>"
  Set-Content -Path $distIndex -Value $html -Encoding UTF8

  Write-Host "Built file-safe platform shell bundle for direct local file use." -ForegroundColor Green
}
finally {
  Pop-Location
}
