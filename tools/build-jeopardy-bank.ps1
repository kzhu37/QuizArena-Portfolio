Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$round1OutPath = Join-Path $root 'data/jeopardy-bank/round1-bank.js'
$round2OutPath = Join-Path $root 'data/jeopardy-bank/round2-bank.js'
$finalOutPath = Join-Path $root 'data/jeopardy-bank/final-bank.js'
$blueprintPath = Join-Path $root 'data/jeopardy-bank/bank-blueprint.ps1'
$oldAnswerBlacklistPath = Join-Path $root 'data/jeopardy-bank/original-answer-blacklist.json'
$sourceGeneratorPath = Join-Path $root 'tools/generate-jeopardy-source-bank.cjs'

$RoundValues = @{
  r1 = @(200, 400, 600, 800, 1000)
  r2 = @(400, 800, 1200, 1600, 2000)
}

$DifficultyBands = @{
  r1 = @{
    "200" = @(15, 25)
    "400" = @(26, 40)
    "600" = @(41, 55)
    "800" = @(56, 72)
    "1000" = @(73, 88)
  }
  r2 = @{
    "400" = @(30, 45)
    "800" = @(46, 58)
    "1200" = @(59, 70)
    "1600" = @(71, 84)
    "2000" = @(85, 97)
  }
  final = @(75, 95)
}

$CluePrefixBlacklistPattern = '^(to warm up|in one term|a standard definition|more technical|now we''re deeper|experts call this|be specific|in formal language|a textbook would say|in technical language|for specialists|for the specialists|at a higher level|a more exact description|in basic science|a common definition|identify this term|name it|give the term for|more precisely|define this|scientists might describe|in context|in a bit more detail|in the literature|in formal terms|in expert jargon|at the highest level|a tight, technical definition|a grad-?level description|in advanced context|a precise description|as defined in textbooks|a more exact statement|in rigorous terms|this describes)\s*[:,]?\s*'
$ClueResidualPattern = '(-\s*(name the term|identify it|what is it called|give the precise term|give the technical term)[.?]?\s*$|\b(give the precise term|give the technical term)[.?]?\s*$)'
$TextJunkPattern = '(\bundefined\b|\bnull\b)'
$ComputeContentPattern = '(solve for|calculate\s+(?:the\s+)?(?:number|value|result|total)|how many remain|what is [0-9]|sum of\s+\d|product of\s+\d|difference between\s+\d|percent of\s+\d|square root of\s+\d|cube root of\s+\d|factorial of\s+\d|long division|arithmetic progression)'
$LazyNumberedCategoryPattern = '\s(\d+|part\s+(i{1,3}|iv|v)|round\s+\d+|category\s+\d+)$'
$BannedCategoryPattern = '\b(iso|i\.?s\.?o\.?|iatas?|abbreviations?|codes?|two-letter country codes?|language codes?|currency codes?|script codes?|airport codes?|airport cities?|world airports?|time zones?|cities by time zone|constellation abbreviations?|element symbols?|atomic numbers?|periodic table names?|measuring units?|measurement units?)\b'
$BannedClueTemplatePattern = '\b(iso alpha-?2|iata code|language code|currency code|script code|code phrase|country code|airport code|time zone|unit identifier|chemical-symbol phrase|atomic-number phrase|constellation abbreviation)\b'
$LowInformationTemplatePattern = '\b(is the answer|title sought here|this is described as|scientific article|journal article|U\.S\. patent|National Archives and Records Administration''s holdings|known as an automobile model|this automaker produced|this manufacturer built)\b'
$UnresolvedIdentifierPattern = '\b[QP]\d{3,}\b'
$WorksheetOpeningPattern = '^(what|which|who|where|when|why|how)\b'
$JeopardyResponsePattern = '^(What|Who|Where|When)\s+(is|are|was|were)\s+.+\?$'
$MinimumCluesPerValue = 8
$MinimumRegularCategories = 70
$MinimumRoundCategories = 35
$InitialRegularClues = 5348
$TargetRegularClues = [Math]::Max(5000, [Math]::Ceiling($InitialRegularClues * 1.5))

function Read-Field {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Object,
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  if ($Object -is [System.Collections.IDictionary]) {
    return $Object[$Name]
  }
  return $Object.$Name
}

function Normalize-Text {
  param([string]$Value)

  if ($null -eq $Value) { return "" }
  $normalized = [string]$Value
  $normalized = $normalized -replace '[\u201C\u201D]', '"'
  $normalized = $normalized -replace '[\u2018\u2019]', "'"
  $normalized = $normalized -replace '[\u2013\u2014]', '-'
  $normalized = $normalized -replace '\u2026', '...'
  $normalized = $normalized -replace '\u00A0', ' '
  $normalized = $normalized -replace '\s+', ' '
  return $normalized.Trim()
}

function Normalize-DisplayTitle {
  param([string]$Value)

  return (Normalize-Text $Value)
}

function Sanitize-ClueText {
  param([string]$Value)

  $text = Normalize-Text $Value
  $text = $text -replace '^FINAL:\s*', ''
  $text = $text -replace $CluePrefixBlacklistPattern, ''
  $text = $text -replace $ClueResidualPattern, ''
  $text = $text -replace '^[,;:.\-]+\s*', ''
  $text = $text -replace '\s+', ' '
  $text = $text.Trim()
  if ($text.Length -gt 0 -and [char]::IsLower($text[0])) {
    $text = ([char]::ToUpperInvariant($text[0])) + $text.Substring(1)
  }
  return $text
}

function Sanitize-AnswerText {
  param([string]$Value)

  return (Normalize-Text $Value)
}

function Normalize-AnswerKey {
  param([string]$Value)

  $text = Sanitize-AnswerText $Value
  $text = $text.Normalize([Text.NormalizationForm]::FormD)
  $text = $text -replace '\p{M}', ''
  $text = $text.ToLowerInvariant()
  $text = $text -replace '\u00df', 'ss'
  $text = $text -replace '\u00e6', 'ae'
  $text = $text -replace '\u00f8', 'o'
  $text = $text -replace '\u0142', 'l'
  $text = $text -replace '\u00f0', 'd'
  $text = $text -replace '\u00fe', 'th'
  $text = $text -replace '\bwhat\s*''s\s+', ''
  $text = $text -replace '^(what|who|where|when|why|how)\s+(is|are|was|were|am|be)\s+', ''
  $text = $text -replace '^(what|who|where|when|why|how)\s+(do|does|did)\s+', ''
  $text = $text -replace '\?+$', ''
  $text = $text -replace '(\s*\([^)]*\)\s*)+$', ' '
  $text = $text -replace '^((the|a|an)\s+)+', ''
  $text = $text -replace '&', ' and '
  $text = $text -replace '-', ' '
  $text = $text -replace '[^a-z0-9\s]', ' '
  $text = $text -replace '\s+', ' '
  return $text.Trim()
}

function Normalize-GiveawayText {
  param([string]$Value)

  $text = Normalize-AnswerKey $Value
  $text = $text -replace '-', ' '
  $text = $text -replace '\b(the|a|an)\b', ' '
  $text = $text -replace '[^a-z0-9\s]', ' '
  $text = $text -replace '\s+', ' '
  return $text.Trim()
}

function Test-AnswerInClue {
  param(
    [string]$Question,
    [string]$Answer
  )

  $answerKey = Normalize-GiveawayText $Answer
  $clueKey = Normalize-GiveawayText $Question
  if ([string]::IsNullOrWhiteSpace($answerKey) -or [string]::IsNullOrWhiteSpace($clueKey)) { return $false }

  $words = @($answerKey -split '\s+' | Where-Object { $_ })
  if ($words.Count -eq 1 -and $answerKey.Length -lt 4) { return $false }

  return $clueKey -match "(^|\s)$([regex]::Escape($answerKey))(\s|$)"
}

function Get-StableHash {
  param([string]$Value)

  $md5 = [System.Security.Cryptography.MD5]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes([string]$Value)
    $hash = $md5.ComputeHash($bytes)
    return -join ($hash[0..5] | ForEach-Object { $_.ToString('x2') })
  }
  finally {
    $md5.Dispose()
  }
}

function Get-ClueFingerprint {
  param(
    [string]$Question,
    [string]$Answer
  )

  $cleanClue = (Normalize-Text $Question).ToLowerInvariant()
  $cleanClue = $cleanClue.Normalize([Text.NormalizationForm]::FormD)
  $cleanClue = $cleanClue -replace '\p{M}', ''
  $cleanClue = $cleanClue -replace '\u00df', 'ss'
  $cleanClue = $cleanClue -replace '\u00e6', 'ae'
  $cleanClue = $cleanClue -replace '\u00f8', 'o'
  $cleanClue = $cleanClue -replace '\u0142', 'l'
  $cleanClue = $cleanClue -replace '\u00f0', 'd'
  $cleanClue = $cleanClue -replace '\u00fe', 'th'
  $cleanClue = $cleanClue -replace '-', ' '
  $cleanClue = $cleanClue -replace '[^a-z0-9\s]', ' '
  $cleanClue = $cleanClue -replace '\s+', ' '
  $cleanClue = $cleanClue.Trim()
  return "$cleanClue|$(Normalize-AnswerKey $Answer)"
}

function Get-ClueKey {
  param([string]$Question)

  $cleanClue = (Normalize-Text $Question).ToLowerInvariant()
  $cleanClue = $cleanClue.Normalize([Text.NormalizationForm]::FormD)
  $cleanClue = $cleanClue -replace '\p{M}', ''
  $cleanClue = $cleanClue -replace '\u00df', 'ss'
  $cleanClue = $cleanClue -replace '\u00e6', 'ae'
  $cleanClue = $cleanClue -replace '\u00f8', 'o'
  $cleanClue = $cleanClue -replace '\u0142', 'l'
  $cleanClue = $cleanClue -replace '\u00f0', 'd'
  $cleanClue = $cleanClue -replace '\u00fe', 'th'
  $cleanClue = $cleanClue -replace '-', ' '
  $cleanClue = $cleanClue -replace '[^a-z0-9\s]', ' '
  $cleanClue = $cleanClue -replace '\s+', ' '
  return $cleanClue.Trim()
}

function Test-CleanText {
  param([string]$Value)

  $text = Normalize-Text $Value
  if ([string]::IsNullOrWhiteSpace($text)) { return $false }
  if ($text -match $TextJunkPattern) { return $false }
  if ($text.IndexOf([char]0xFFFD) -ge 0) { return $false }
  if ($text -notmatch '^[A-Z0-9"''(]') { return $false }
  return $true
}

function Test-AllowedRegularClue {
  param(
    [string]$Question,
    [string]$Answer
  )

  if (-not (Test-CleanText $Question)) { return $false }
  if (-not (Test-CleanText $Answer)) { return $false }
  if ($Question -match $ComputeContentPattern) { return $false }
  if ($Question -match $BannedClueTemplatePattern -or $Answer -match $BannedClueTemplatePattern) { return $false }
  if ($Question -match $LowInformationTemplatePattern) { return $false }
  if ($Question -match $UnresolvedIdentifierPattern -or $Answer -match $UnresolvedIdentifierPattern) { return $false }
  if ($Question -match $WorksheetOpeningPattern) { return $false }
  if ($Answer -notmatch $JeopardyResponsePattern) { return $false }
  if (Test-AnswerInClue -Question $Question -Answer $Answer) { return $false }
  return $true
}

function Assert-Difficulty {
  param(
    [string]$RoundType,
    [Nullable[int]]$Value,
    [int]$Difficulty
  )

  $band =
    if ($RoundType -eq 'final') { $DifficultyBands.final }
    else { $DifficultyBands[$RoundType]["$Value"] }
  $min = [int]$band[0]
  $max = [int]$band[1]
  if ($Difficulty -lt $min -or $Difficulty -gt $max) {
    $valueLabel = if ($RoundType -eq 'final') { 'Final' } else { "$RoundType `$$Value" }
    throw "Difficulty $Difficulty is outside the $valueLabel band $min-$max."
  }
  return $Difficulty
}

function Get-OldAnswerKeySet {
  param([string]$Path)

  $set = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  if (-not (Test-Path $Path)) { return $set }
  $json = Get-Content -Raw -Path $Path -Encoding UTF8 | ConvertFrom-Json
  foreach ($entry in @($json.answers)) {
    if ($entry.key) { $null = $set.Add([string]$entry.key) }
  }
  return $set
}

function Add-ManualSlots {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable]$Slots,
    [Parameter(Mandatory = $true)]
    [hashtable]$ManualSlots,
    [Parameter(Mandatory = $true)]
    [string]$PackId,
    [Parameter(Mandatory = $true)]
    [string]$RoundType,
    [System.Collections.Generic.HashSet[string]]$OldAnswerKeys,
    [System.Collections.Generic.HashSet[string]]$RepositoryAnswers,
    [System.Collections.Generic.HashSet[string]]$RepositoryClues
  )

  foreach ($slotKey in $ManualSlots.Keys) {
    if (-not $Slots.ContainsKey($slotKey)) {
      throw "Unexpected value `$$slotKey in $PackId for round $RoundType."
    }
    $index = $Slots[$slotKey].Count
    foreach ($entry in $ManualSlots[$slotKey]) {
      $clueText = if ($entry -is [System.Collections.IList]) { $entry[0] } else { $entry.q }
      $answerText = if ($entry -is [System.Collections.IList]) { $entry[1] } else { $entry.a }
      $difficultyValue = if ($entry -is [System.Collections.IList]) { $entry[2] } else { $entry.difficulty }
      $manualId = if ($entry -is [System.Collections.IList] -and $entry.Count -ge 4) { $entry[3] } elseif ($entry -isnot [System.Collections.IList]) { $entry.id } else { $null }

      $clueText = Sanitize-ClueText $clueText
      $answerText = Sanitize-AnswerText $answerText
      if (-not (Test-AllowedRegularClue -Question $clueText -Answer $answerText)) {
        throw "Rejected malformed or prohibited clue in $PackId at `$$($slotKey): '$clueText' / '$answerText'."
      }

      $answerKey = Normalize-AnswerKey $answerText
      if ([string]::IsNullOrWhiteSpace($answerKey)) { throw "Empty normalized answer in $PackId at `$$slotKey." }
      if ($RepositoryAnswers.Contains($answerKey)) {
        throw "Duplicate fresh-bank answer '$answerText' in $PackId matches key '$answerKey'."
      }

      $clueKey = Get-ClueKey $clueText
      if ($RepositoryClues.Contains($clueKey)) {
        throw "Duplicate fresh-bank clue in $PackId matches normalized text '$clueKey'."
      }

      $fingerprint = Get-ClueFingerprint -Question $clueText -Answer $answerText
      $null = $RepositoryAnswers.Add($answerKey)
      $null = $RepositoryClues.Add($clueKey)
      $Slots[$slotKey] += [pscustomobject]@{
        id = if ($manualId) { $manualId } else { "$PackId|manual|$slotKey|$index|$(Get-StableHash $fingerprint)" }
        q = $clueText
        a = $answerText
        difficulty = Assert-Difficulty -RoundType $RoundType -Value ([int]$slotKey) -Difficulty ([int]$difficultyValue)
        answerKey = $answerKey
        fingerprint = $fingerprint
      }
      $index += 1
    }
  }
}

function Build-RegularBank {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable]$Blueprint,
    [System.Collections.Generic.HashSet[string]]$OldAnswerKeys,
    [System.Collections.Generic.HashSet[string]]$RepositoryAnswers,
    [System.Collections.Generic.HashSet[string]]$RepositoryClues
  )

  $output = @{
    r1 = New-Object System.Collections.Generic.List[object]
    r2 = New-Object System.Collections.Generic.List[object]
  }

  foreach ($entry in $Blueprint.Regular) {
    if (-not $RoundValues.ContainsKey([string]$entry.roundType)) {
      throw "Unknown Jeopardy round '$($entry.roundType)' in source TSV."
    }
    if ($entry.displayTitle -match $LazyNumberedCategoryPattern -or $entry.displayTitle -match $BannedCategoryPattern) {
      throw "Banned Jeopardy category title in source TSV: '$($entry.displayTitle)'."
    }

    $slots = @{}
    foreach ($value in $RoundValues[$entry.roundType]) {
      $slots["$value"] = @()
    }

    Add-ManualSlots `
      -Slots $slots `
      -ManualSlots $entry.manualSlots `
      -PackId $entry.packId `
      -RoundType $entry.roundType `
      -OldAnswerKeys $OldAnswerKeys `
      -RepositoryAnswers $RepositoryAnswers `
      -RepositoryClues $RepositoryClues

    foreach ($value in $RoundValues[$entry.roundType]) {
      $slotKey = "$value"
      $filtered = @($slots[$slotKey] | Sort-Object difficulty, id)
      if ($filtered.Count -lt $MinimumCluesPerValue) {
        throw "Category '$($entry.displayTitle)' on round '$($entry.roundType)' has only $($filtered.Count) clues at `$$value; expected at least $MinimumCluesPerValue."
      }

      $slots[$slotKey] = @(
        $filtered |
          Select-Object `
            @{ Name = 'id'; Expression = { $_.id } }, `
            @{ Name = 'q'; Expression = { $_.q } }, `
            @{ Name = 'a'; Expression = { $_.a } }, `
            @{ Name = 'difficulty'; Expression = { [int]$_.difficulty } }
      )
    }

    $output[$entry.roundType].Add([pscustomobject]@{
      packId = $entry.packId
      displayTitle = $entry.displayTitle
      family = $entry.family
      roundType = $entry.roundType
      tags = @($entry.tags)
      slots = $slots
    })
  }

  return $output
}

function Build-FinalBank {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable]$Blueprint,
    [System.Collections.Generic.HashSet[string]]$OldAnswerKeys,
    [System.Collections.Generic.HashSet[string]]$RepositoryAnswers,
    [System.Collections.Generic.HashSet[string]]$RepositoryClues
  )

  $output = New-Object System.Collections.Generic.List[object]
  $seenAnswers = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)

  foreach ($entry in $Blueprint.Finals) {
    $categoryTitle = Normalize-DisplayTitle (Read-Field -Object $entry -Name 'category')
    if ($categoryTitle -match $LazyNumberedCategoryPattern -or $categoryTitle -match $BannedCategoryPattern) {
      throw "Banned Final Jeopardy category title in source TSV: '$categoryTitle'."
    }

    $index = 0
    foreach ($clue in (Read-Field -Object $entry -Name 'clues')) {
      $clueText = if ($clue -is [System.Collections.IList]) { $clue[0] } else { Read-Field -Object $clue -Name 'q' }
      $answerText = if ($clue -is [System.Collections.IList]) { $clue[1] } else { Read-Field -Object $clue -Name 'a' }
      $difficultyValue = if ($clue -is [System.Collections.IList]) { $clue[2] } else { Read-Field -Object $clue -Name 'difficulty' }
      $manualId = if ($clue -is [System.Collections.IList] -and $clue.Count -ge 4) { $clue[3] } elseif ($clue -isnot [System.Collections.IList]) { Read-Field -Object $clue -Name 'id' } else { $null }

      $clueText = Sanitize-ClueText $clueText
      $answerText = Sanitize-AnswerText $answerText
      $answerKey = Normalize-AnswerKey $answerText

      if ([string]::IsNullOrWhiteSpace($answerKey)) { throw "Empty normalized Final answer in '$categoryTitle'." }
      if (-not (Test-AllowedRegularClue -Question $clueText -Answer $answerText)) {
        throw "Rejected malformed or prohibited Final clue in '$categoryTitle': '$clueText' / '$answerText'."
      }
      if ($seenAnswers.Contains($answerKey) -or $RepositoryAnswers.Contains($answerKey)) {
        throw "Duplicate fresh-bank Final answer '$answerText' matches key '$answerKey'."
      }

      $clueKey = Get-ClueKey $clueText
      if ($RepositoryClues.Contains($clueKey)) {
        throw "Duplicate fresh-bank Final clue matches normalized text '$clueKey'."
      }

      $null = $seenAnswers.Add($answerKey)
      $null = $RepositoryAnswers.Add($answerKey)
      $null = $RepositoryClues.Add($clueKey)
      $slug = (($categoryTitle -replace '[^A-Za-z0-9]+', '-').Trim('-')).ToLowerInvariant()
      $output.Add([pscustomobject]@{
        id = if ($manualId) { $manualId } else { "final|$slug|$index|$(Get-StableHash "$clueText|$answerText")" }
        cat = $categoryTitle
        q = $clueText
        a = $answerText
        difficulty = Assert-Difficulty -RoundType 'final' -Value $null -Difficulty ([int]$difficultyValue)
      })
      $index += 1
    }
  }

  return $output
}

function Write-WrappedJsArray {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$VariableName,
    [Parameter(Mandatory = $true)]
    [object]$Data,
    [Parameter(Mandatory = $true)]
    [string]$BuildFingerprint
  )

  $json = $Data | ConvertTo-Json -Depth 50 -Compress
  $content = @"
// Build inputs: $BuildFingerprint
(function bootstrapBank(ns) {
  ns.$VariableName = $json;
})(window.Jeopardy = window.Jeopardy || {});
"@
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $content, $utf8NoBom)
}

Push-Location $root
try {
  & node $sourceGeneratorPath
  if ($LASTEXITCODE -ne 0) {
    throw "Jeopardy source bank generator failed with exit code $LASTEXITCODE."
  }
}
finally {
  Pop-Location
}

. $blueprintPath

if (-not $JeopardyBankBlueprint) {
  throw "Blueprint file did not set `$JeopardyBankBlueprint."
}

$oldAnswerKeys = Get-OldAnswerKeySet $oldAnswerBlacklistPath
$repositoryAnswers = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$repositoryClues = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)

$regularBank = Build-RegularBank -Blueprint $JeopardyBankBlueprint -OldAnswerKeys $oldAnswerKeys -RepositoryAnswers $repositoryAnswers -RepositoryClues $repositoryClues
$finalBank = Build-FinalBank -Blueprint $JeopardyBankBlueprint -OldAnswerKeys $oldAnswerKeys -RepositoryAnswers $repositoryAnswers -RepositoryClues $repositoryClues

$round1Clues = [int](($regularBank.r1 | ForEach-Object {
  ($_.slots.Values | ForEach-Object { @($_).Count } | Measure-Object -Sum).Sum
} | Measure-Object -Sum).Sum)
$round2Clues = [int](($regularBank.r2 | ForEach-Object {
  ($_.slots.Values | ForEach-Object { @($_).Count } | Measure-Object -Sum).Sum
} | Measure-Object -Sum).Sum)
$regularClues = $round1Clues + $round2Clues
$round1Categories = $regularBank['r1'].Count
$round2Categories = $regularBank['r2'].Count
$regularCategories = $round1Categories + $round2Categories
if ($regularCategories -lt $MinimumRegularCategories) {
  throw "Built $regularCategories regular categories; expected at least $MinimumRegularCategories."
}
if ($round1Categories -lt $MinimumRoundCategories -or $round2Categories -lt $MinimumRoundCategories) {
  throw "Each regular round needs at least $MinimumRoundCategories categories."
}
if ($regularClues -lt $TargetRegularClues) {
  throw "Built $regularClues regular clues; expected at least $TargetRegularClues (1.5x the initial $InitialRegularClues)."
}
if ($round1Clues -lt [Math]::Ceiling(2945 * 1.1)) {
  throw "Round One did not grow substantially; built $round1Clues clues."
}
if ($round2Clues -lt [Math]::Ceiling(2403 * 1.1)) {
  throw "Double Jeopardy did not grow substantially; built $round2Clues clues."
}

$buildFingerprint = [string]::Join(':', @(
  (Get-FileHash -Algorithm SHA256 -LiteralPath $PSCommandPath).Hash.ToLowerInvariant()
  (Get-FileHash -Algorithm SHA256 -LiteralPath $blueprintPath).Hash.ToLowerInvariant()
  (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $root 'data/jeopardy-bank/expanded-bank.tsv')).Hash.ToLowerInvariant()
))

Write-WrappedJsArray -Path $round1OutPath -VariableName 'ROUND1_BANK' -Data $regularBank.r1 -BuildFingerprint $buildFingerprint
Write-WrappedJsArray -Path $round2OutPath -VariableName 'ROUND2_BANK' -Data $regularBank.r2 -BuildFingerprint $buildFingerprint
Write-WrappedJsArray -Path $finalOutPath -VariableName 'FINAL_BANK' -Data $finalBank -BuildFingerprint $buildFingerprint

Write-Host "Jeopardy bank rebuild complete."
