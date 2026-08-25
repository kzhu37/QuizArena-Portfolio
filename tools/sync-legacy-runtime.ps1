Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$legacyRoot = Join-Path $root "public\legacy"
$legacySrc = Join-Path $legacyRoot "src\jeopardy"
$legacyData = Join-Path $legacyRoot "data\jeopardy-bank"

if (Test-Path $legacyRoot) {
  Remove-Item $legacyRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $legacySrc -Force | Out-Null
New-Item -ItemType Directory -Path $legacyData -Force | Out-Null

Copy-Item (Join-Path $root "jeopardy-gameNewQuestionsV3.html") (Join-Path $legacyRoot "jeopardy-gameNewQuestionsV3.html") -Force
Copy-Item (Join-Path $root "src\jeopardy\*.js") $legacySrc -Force
Copy-Item (Join-Path $root "data\jeopardy-bank\round1-bank.js") $legacyData -Force
Copy-Item (Join-Path $root "data\jeopardy-bank\round2-bank.js") $legacyData -Force
Copy-Item (Join-Path $root "data\jeopardy-bank\final-bank.js") $legacyData -Force

Write-Host "Legacy Jeopardy runtime synced to public\\legacy." -ForegroundColor Green
